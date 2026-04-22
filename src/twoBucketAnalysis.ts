import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary } from "./types.js";

export type TwoBucketEvidence = {
  label: string;
  amount: number;
  line: string;
  lineIndex: number;
};

export type TwoBucketAnalysis = {
  totalFees: number | null;
  cardBrandTotal: number | null;
  processorOwnedTotal: number | null;
  unknownTotal: number | null;
  cardBrandSharePct: number | null;
  processorOwnedSharePct: number | null;
  coveragePct: number | null;
  reconciliationDeltaUsd: number | null;
  available: boolean;
  reason: string;
  evidence: {
    totalFees: TwoBucketEvidence[];
    cardBrand: TwoBucketEvidence[];
    processorOwned: TwoBucketEvidence[];
  };
};

type PatternSpec = {
  label: string;
  pattern: RegExp;
};

const MONEY_RE = /\(?-?\$?\d[\d,]*\.\d{2}\)?/g;

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
    label: "Summary fees total",
    pattern: /^fees-\$?\d/i,
  },
];

const CARD_BRAND_OVERALL_PATTERNS: PatternSpec[] = [
  {
    label: "Total Interchange Charges/Program Fees",
    pattern: /total interchange charges\/program fees/i,
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
    label: "Total Account Fees",
    pattern: /^total account fees(?:\s*[:\-|]|\s{2,})/i,
  },
];

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
      totalFees: null,
      cardBrandTotal: null,
      processorOwnedTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
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
      totalFees,
      cardBrandTotal: null,
      processorOwnedTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
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
      totalFees,
      cardBrandTotal,
      processorOwnedTotal: null,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
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
  const tolerance = Math.max(5, totalFees * 0.02);
  const coveragePct = totalFees > 0 ? round2((knownTotal / totalFees) * 100) : null;

  if (reconciliationDeltaUsd > tolerance) {
    return {
      totalFees,
      cardBrandTotal,
      processorOwnedTotal,
      unknownTotal: null,
      cardBrandSharePct: null,
      processorOwnedSharePct: null,
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
    totalFees,
    cardBrandTotal,
    processorOwnedTotal,
    unknownTotal: 0,
    cardBrandSharePct: round2((cardBrandTotal / totalFees) * 100),
    processorOwnedSharePct: round2((processorOwnedTotal / totalFees) * 100),
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
