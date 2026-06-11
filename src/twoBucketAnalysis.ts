import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary, StatementEconomicRollup, TwoBucketAnalysis, TwoBucketEvidence } from "./types.js";

type PatternSpec = {
  label: string;
  pattern: RegExp;
};

const MONEY_RE = /\(?-?\$?\d[\d,\s]*\.\d{2}\)?/g;

const TOTAL_FEE_PATTERNS: PatternSpec[] = [
  {
    label: "Statement grand total",
    pattern: /total\s*\(service charges,\s*interchange charges\/program fees,\s*and fees\)/i,
  },
  {
    label: "Total fees due",
    pattern: /total fees due/i,
  },
  {
    label: "Total Miscellaneous Fees and Card Fees",
    pattern: /total\s*\(miscellaneous fees and card fees\)/i,
  },
  {
    label: "Summary fees total",
    pattern: /^fees-\$?\d/i,
  },
];

const CARD_BRAND_OVERALL_PATTERNS: PatternSpec[] = [
  {
    label: "Total Interchange Charges/Program Fees",
    pattern: /total interchange charges\/program fees/i,
  },
  {
    label: "Total Card Fees",
    pattern: /^total card fees(?:\s*[:\-|]|\s{2,})/i,
  },
];

const CARD_BRAND_COMPONENT_PATTERNS: PatternSpec[] = [
  {
    label: "Total Interchange Fees/American Express Program Fees",
    pattern: /total interchange fees\/american express program fees/i,
  },
  {
    label: "Total Card Brand Fees",
    pattern: /total card brand fees/i,
  },
];

const PROCESSOR_HIGH_LEVEL_PATTERNS: PatternSpec[] = [
  {
    label: "Total Service Charges",
    pattern: /^total service charges(?:\s*[:\-|]|\s{2,})/i,
  },
  {
    label: "Total Fees",
    pattern: /^total fees(?:\s*[:\-|]|\s{2,})/i,
  },
];

const PROCESSOR_COMPONENT_PATTERNS: PatternSpec[] = [
  {
    label: "Total Authorization Fees",
    pattern: /^total authorization fees(?:\s*[:\-|]|\s{2,})/i,
  },
  {
    label: "Total Transaction Fees",
    pattern: /^total transaction fees(?:\s*[:\-|]|\s{2,})/i,
  },
  {
    label: "Total Other Fees",
    pattern: /^total other fees(?:\s*[:\-|]|\s{2,})/i,
  },
  {
    label: "Total Miscellaneous Fees",
    pattern: /^total miscellaneous fees(?:\s*[:\-|]|\s{2,})/i,
  },
  {
    label: "Total Account Fees",
    pattern: /^total account fees(?:\s*[:\-|]|\s{2,})/i,
  },
];

const RECONCILIATION_DOLLAR_TOLERANCE = 5;
const RECONCILIATION_PCT_TOLERANCE = 0.02;
const STRUCTURED_ROLLUP_CONFIDENCE_THRESHOLD = 0.55;
const STRUCTURED_COMPONENT_COVERAGE_FLOOR = 0.85;
const STRUCTURED_COMPONENT_COVERAGE_CEILING = 1.15;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseMoney(token: string): number | null {
  const normalized = token.replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "").trim();
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function amountFromLine(line: string): number | null {
  const matches = line.match(MONEY_RE) ?? [];
  if (matches.length === 0) return null;
  return parseMoney(matches[matches.length - 1] ?? "");
}

function getLines(doc: ParsedDocument): string[] {
  const lines = doc.rows
    .map((row) => {
      if (typeof row.content === "string") return row.content.trim();
      return Object.entries(row)
        .map(([key, value]) => `${key} ${String(value)}`.trim())
        .join(" ")
        .trim();
    })
    .filter((line) => line.length > 0);

  return lines;
}

function dedupeEvidence(items: TwoBucketEvidence[]): TwoBucketEvidence[] {
  const seen = new Set<string>();
  const deduped: TwoBucketEvidence[] = [];
  for (const item of items) {
    const key = `${item.label}|${item.amount}|${item.line.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function findFirstMatch(lines: string[], patterns: PatternSpec[]): TwoBucketEvidence[] {
  for (const spec of patterns) {
    for (const [lineIndex, line] of lines.entries()) {
      if (!spec.pattern.test(line)) continue;
      const amount = amountFromLine(line);
      if (amount === null) continue;
      return [
        {
          label: spec.label,
          amount,
          line,
          lineIndex,
        },
      ];
    }
  }
  return [];
}

function collectMatches(lines: string[], patterns: PatternSpec[]): TwoBucketEvidence[] {
  const matches: TwoBucketEvidence[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    for (const spec of patterns) {
      if (!spec.pattern.test(line)) continue;
      const amount = amountFromLine(line);
      if (amount === null) continue;
      matches.push({
        label: spec.label,
        amount,
        line,
        lineIndex,
      });
      break;
    }
  }
  return dedupeEvidence(matches);
}

function sumEvidence(items: TwoBucketEvidence[]): number | null {
  if (items.length === 0) return null;
  return round2(items.reduce((sum, item) => sum + item.amount, 0));
}

function evidenceCount(analysis: TwoBucketAnalysis): number {
  return analysis.evidence.totalFees.length + analysis.evidence.cardBrand.length + analysis.evidence.processorOwned.length;
}

function finitePositive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? round2(number) : null;
}

function evidenceFromStructuredRows(
  rollup: StatementEconomicRollup,
  bucket: "card_brand_pass_through" | "processor_markup" | "add_on_fees",
): TwoBucketEvidence[] {
  return rollup.feeRows
    .filter((row) => row.bucket === bucket && row.amount > 0)
    .map((row) => ({
      label: row.label,
      amount: round2(row.amount),
      line: row.evidenceLine,
      lineIndex: row.rowIndex,
    }));
}

function totalFeesEvidenceFromRollup(rollup: StatementEconomicRollup): TwoBucketEvidence[] {
  if (rollup.totalFees === null || rollup.totalFees <= 0) return [];
  return [
    {
      label: "Structured statement total fees",
      amount: round2(rollup.totalFees),
      line: "Structured economic rollup total fees",
      lineIndex: -1,
    },
  ];
}

function finalizeAnalysis(input: {
  source: TwoBucketAnalysis["source"];
  totalFees: number | null;
  cardBrandTotal: number | null;
  processorControlledTotal: number | null;
  evidence: TwoBucketAnalysis["evidence"];
  missingTotalReason: string;
  missingCardBrandReason: string;
  missingProcessorReason: string;
}): TwoBucketAnalysis {
  const { source, totalFees, cardBrandTotal, processorControlledTotal, evidence } = input;

  if (totalFees === null) {
    return {
      source,
      totalFees: null,
      cardBrandTotal: null,
      processorOwnedTotal: null,
      processorControlledTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct: null,
      reconciliationDeltaUsd: null,
      available: false,
      reason: input.missingTotalReason,
      evidence,
    };
  }

  if (cardBrandTotal === null) {
    return {
      source,
      totalFees,
      cardBrandTotal: null,
      processorOwnedTotal: null,
      processorControlledTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct: null,
      reconciliationDeltaUsd: null,
      available: false,
      reason: input.missingCardBrandReason,
      evidence,
    };
  }

  if (processorControlledTotal === null) {
    return {
      source,
      totalFees,
      cardBrandTotal,
      processorOwnedTotal: null,
      processorControlledTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct: null,
      reconciliationDeltaUsd: null,
      available: false,
      reason: input.missingProcessorReason,
      evidence,
    };
  }

  const knownTotal = round2(cardBrandTotal + processorControlledTotal);
  const reconciliationDeltaUsd = round2(Math.abs(totalFees - knownTotal));
  const tolerance = Math.max(RECONCILIATION_DOLLAR_TOLERANCE, totalFees * RECONCILIATION_PCT_TOLERANCE);
  const coveragePct = totalFees > 0 ? round2((knownTotal / totalFees) * 100) : null;

  if (reconciliationDeltaUsd > tolerance) {
    return {
      source,
      totalFees,
      cardBrandTotal,
      processorOwnedTotal: processorControlledTotal,
      processorControlledTotal,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct,
      reconciliationDeltaUsd,
      available: false,
      reason: `Two-bucket totals do not reconcile tightly enough to total fees (delta ${reconciliationDeltaUsd.toFixed(2)}).`,
      evidence,
    };
  }

  const unknownTotal = round2(Math.max(0, totalFees - knownTotal));
  return {
    source,
    totalFees,
    cardBrandTotal,
    processorOwnedTotal: processorControlledTotal,
    processorControlledTotal,
    unknownTotal,
    cardBrandSharePct: round2((cardBrandTotal / totalFees) * 100),
    processorOwnedSharePct: round2((processorControlledTotal / totalFees) * 100),
    processorControlledSharePct: round2((processorControlledTotal / totalFees) * 100),
    coveragePct,
    reconciliationDeltaUsd,
    available: true,
    reason: `Card-brand and processor-controlled totals reconcile to total fees with delta ${reconciliationDeltaUsd.toFixed(2)}.`,
    evidence,
  };
}

function analyzeStructuredRollup(rollup: StatementEconomicRollup | null | undefined, summary?: AnalysisSummary): TwoBucketAnalysis | null {
  if (!rollup) return null;

  const totalFees = finitePositive(rollup.totalFees) ?? finitePositive(summary?.totalFees);
  if (rollup.confidence < STRUCTURED_ROLLUP_CONFIDENCE_THRESHOLD || rollup.feeRows.length === 0 || totalFees === null) {
    return null;
  }

  const cardBrandTotal = finitePositive(rollup.cardBrandPassThrough);
  const processorControlledTotal = finitePositive((rollup.processorMarkup ?? 0) + (rollup.addOnFees ?? 0));
  const categorizedTotal = round2(rollup.feeRows.reduce((sum, row) => sum + (row.amount > 0 ? row.amount : 0), 0));
  const categorizedCoverage = categorizedTotal / totalFees;
  if (
    categorizedCoverage < STRUCTURED_COMPONENT_COVERAGE_FLOOR ||
    categorizedCoverage > STRUCTURED_COMPONENT_COVERAGE_CEILING
  ) {
    return null;
  }

  const evidence = {
    totalFees: totalFeesEvidenceFromRollup(rollup),
    cardBrand: evidenceFromStructuredRows(rollup, "card_brand_pass_through"),
    processorOwned: [
      ...evidenceFromStructuredRows(rollup, "processor_markup"),
      ...evidenceFromStructuredRows(rollup, "add_on_fees"),
    ],
  };

  return finalizeAnalysis({
    source: "structured_rollup",
    totalFees,
    cardBrandTotal,
    processorControlledTotal,
    evidence,
    missingTotalReason: "No reliable total-fees value was found in the structured economic rollup.",
    missingCardBrandReason: "No card-brand/interchange total was found in the structured economic rollup.",
    missingProcessorReason: "No processor-controlled total was found in the structured economic rollup.",
  });
}

function evidenceFromFeeRows(
  summary: AnalysisSummary,
  kind: "cardBrand" | "processorControlled",
): TwoBucketEvidence[] {
  return (summary.feeBreakdown ?? [])
    .filter((row) => row.amount > 0)
    .filter((row) => {
      if (row.classificationConfidence === "low") return false;
      if (kind === "cardBrand") return row.feeClass === "card_brand_pass_through" || row.broadType === "Pass-through";
      return (
        row.feeClass === "processor_markup" ||
        row.feeClass === "processor_transaction_or_auth" ||
        row.feeClass === "processor_service_add_on" ||
        row.feeClass === "compliance_remediation" ||
        row.broadType === "Processor" ||
        row.broadType === "Service / compliance"
      );
    })
    .map((row) => ({
      label: row.label,
      amount: round2(row.amount),
      line: row.evidenceLine ?? row.label,
      lineIndex: -1,
    }));
}

function analyzeSummaryFeeRows(summary: AnalysisSummary): TwoBucketAnalysis | null {
  const totalFees = finitePositive(summary.totalFees);
  if (totalFees === null) return null;

  const cardBrandEvidence = evidenceFromFeeRows(summary, "cardBrand");
  const processorControlledEvidence = evidenceFromFeeRows(summary, "processorControlled");
  const auditCardBrandTotal = finitePositive(summary.interchangeAudit?.totalPaid);
  const feeRowCardBrandTotal = sumEvidence(cardBrandEvidence);
  const cardBrandTotal = auditCardBrandTotal ?? feeRowCardBrandTotal;
  const processorControlledTotal = sumEvidence(processorControlledEvidence);

  const cardBrandRowsMatchAudit =
    auditCardBrandTotal !== null &&
    feeRowCardBrandTotal !== null &&
    Math.abs(auditCardBrandTotal - feeRowCardBrandTotal) <= Math.max(1, auditCardBrandTotal * 0.01);
  const cardBrand =
    auditCardBrandTotal === null || cardBrandRowsMatchAudit || cardBrandTotal === null
      ? cardBrandEvidence
      : [
          {
            label: "card brand interchange detail",
            amount: cardBrandTotal,
            line: "Rollup from captured interchange audit rows",
            lineIndex: -1,
          },
        ];

  return finalizeAnalysis({
    source: "summary_fee_rows",
    totalFees,
    cardBrandTotal,
    processorControlledTotal,
    evidence: {
      totalFees: [
        {
          label: "Summary total fees",
          amount: totalFees,
          line: "Analysis summary total fees",
          lineIndex: -1,
        },
      ],
      cardBrand,
      processorOwned: processorControlledEvidence,
    },
    missingTotalReason: "No reliable total-fees value was found in the analysis summary.",
    missingCardBrandReason: "No card-brand/interchange total was found in summary fee rows.",
    missingProcessorReason: "No processor-controlled total was found in summary fee rows.",
  });
}

function selectBestAnalysis(candidates: TwoBucketAnalysis[]): TwoBucketAnalysis {
  const available = candidates.find((analysis) => analysis.available);
  if (available) return available;
  return [...candidates].sort((left, right) => evidenceCount(right) - evidenceCount(left))[0];
}

export function analyzeTwoBucketStatement(doc: ParsedDocument, summary?: AnalysisSummary): TwoBucketAnalysis {
  const lines = getLines(doc);

  const totalFeesEvidence = findFirstMatch(lines, TOTAL_FEE_PATTERNS);
  const cardBrandOverall = findFirstMatch(lines, CARD_BRAND_OVERALL_PATTERNS);
  const cardBrandComponentEvidence = collectMatches(lines, CARD_BRAND_COMPONENT_PATTERNS);
  const processorHighLevelEvidence = collectMatches(lines, PROCESSOR_HIGH_LEVEL_PATTERNS).filter(
    (item) => !/total fees due/i.test(item.line),
  );
  const processorComponentEvidence = collectMatches(lines, PROCESSOR_COMPONENT_PATTERNS);

  const totalFees =
    sumEvidence(totalFeesEvidence) ??
    (summary && Number.isFinite(summary.totalFees) && summary.totalFees > 0 ? round2(summary.totalFees) : null);

  const cardBrandEvidence = cardBrandOverall.length > 0 ? cardBrandOverall : cardBrandComponentEvidence;
  const cardBrandTotal = sumEvidence(cardBrandEvidence);

  const processorOwnedEvidence = processorHighLevelEvidence.length > 0 ? processorHighLevelEvidence : processorComponentEvidence;
  const processorOwnedTotal = sumEvidence(processorOwnedEvidence);

  if (totalFees === null) {
    return {
      source: "statement_text",
      totalFees: null,
      cardBrandTotal: null,
      processorOwnedTotal: null,
      processorControlledTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct: null,
      reconciliationDeltaUsd: null,
      available: false,
      reason: "No explicit total-fees value was found for two-bucket analysis.",
      evidence: {
        totalFees: [],
        cardBrand: cardBrandEvidence,
        processorOwned: processorOwnedEvidence,
      },
    };
  }

  if (cardBrandTotal === null) {
    return {
      source: "statement_text",
      totalFees,
      cardBrandTotal: null,
      processorOwnedTotal: null,
      processorControlledTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct: null,
      reconciliationDeltaUsd: null,
      available: false,
      reason: "No explicit card-brand/interchange total was found for two-bucket analysis.",
      evidence: {
        totalFees: totalFeesEvidence,
        cardBrand: [],
        processorOwned: processorOwnedEvidence,
      },
    };
  }

  if (processorOwnedTotal === null) {
    return {
      source: "statement_text",
      totalFees,
      cardBrandTotal,
      processorOwnedTotal: null,
      processorControlledTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct: null,
      reconciliationDeltaUsd: null,
      available: false,
      reason: "No explicit processor-owned total was found for two-bucket analysis.",
      evidence: {
        totalFees: totalFeesEvidence,
        cardBrand: cardBrandEvidence,
        processorOwned: [],
      },
    };
  }

  const knownTotal = round2(cardBrandTotal + processorOwnedTotal);
  const reconciliationDeltaUsd = round2(Math.abs(totalFees - knownTotal));
  const tolerance = Math.max(RECONCILIATION_DOLLAR_TOLERANCE, totalFees * RECONCILIATION_PCT_TOLERANCE);
  const coveragePct = totalFees > 0 ? round2((knownTotal / totalFees) * 100) : null;

  if (reconciliationDeltaUsd > tolerance) {
    return {
      source: "statement_text",
      totalFees,
      cardBrandTotal,
      processorOwnedTotal,
      processorControlledTotal: processorOwnedTotal,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
      processorControlledSharePct: null,
      coveragePct,
      reconciliationDeltaUsd,
      available: false,
      reason: `Two-bucket totals do not reconcile tightly enough to total fees (delta ${reconciliationDeltaUsd.toFixed(2)}).`,
      evidence: {
        totalFees: totalFeesEvidence,
        cardBrand: cardBrandEvidence,
        processorOwned: processorOwnedEvidence,
      },
    };
  }

  return {
    source: "statement_text",
    totalFees,
    cardBrandTotal,
    processorOwnedTotal,
    processorControlledTotal: processorOwnedTotal,
    unknownTotal: 0,
    cardBrandSharePct: round2((cardBrandTotal / totalFees) * 100),
    processorOwnedSharePct: round2((processorOwnedTotal / totalFees) * 100),
    processorControlledSharePct: round2((processorOwnedTotal / totalFees) * 100),
    coveragePct,
    reconciliationDeltaUsd,
    available: true,
    reason: `Card-brand and processor-owned totals reconcile to total fees with delta ${reconciliationDeltaUsd.toFixed(2)}.`,
    evidence: {
      totalFees: totalFeesEvidence,
      cardBrand: cardBrandEvidence,
      processorOwned: processorOwnedEvidence,
    },
  };
}

export function buildTwoBucketAnalysis(
  doc: ParsedDocument,
  summary: AnalysisSummary,
  options: { economicRollup?: StatementEconomicRollup | null } = {},
): TwoBucketAnalysis {
  const textAnalysis = analyzeTwoBucketStatement(doc, summary);
  const structuredAnalysis = analyzeStructuredRollup(options.economicRollup, summary);
  const summaryAnalysis = analyzeSummaryFeeRows(summary);
  return selectBestAnalysis([structuredAnalysis, textAnalysis, summaryAnalysis].filter((analysis): analysis is TwoBucketAnalysis => analysis !== null));
}
