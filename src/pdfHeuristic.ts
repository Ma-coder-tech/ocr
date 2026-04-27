import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary, FeeBreakdownRow } from "./types.js";
import { classifyFeeRow, type FeeClassification } from "./feeClassification.js";

type CandidateKind = "volume" | "fee" | "other";

type Candidate = {
  rawLine: string;
  label: string;
  contextLabel: string;
  section: string;
  amount: number;
  amounts: number[];
  kind: CandidateKind;
  totalLike: boolean;
};

const MONEY_RE = /\(?-?\$?\d[\d,]*\.\d{2}\)?/g;
const PERCENT_RE = /-?\d+(?:\.\d+)?%/g;

const FEE_TERMS = [
  "fee",
  "charge",
  "cost",
  "commission",
  "markup",
  "assessment",
  "dues",
  "discount",
  "interchange",
  "network",
  "pci",
  "statement",
  "gateway",
  "batch",
  "noncompliance",
  "chargeback",
  "retrieval",
  "service",
  "authorization",
  "auth",
];

const VOLUME_TERMS = [
  "volume",
  "sales",
  "gross",
  "processed",
  "submitted",
  "deposit",
  "funded",
  "card sales",
  "net sales",
];

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function includesAny(input: string, terms: string[]): boolean {
  const lower = input.toLowerCase();
  const normalized = normalizeForMatch(input);
  return terms.some((term) => lower.includes(term) || normalized.includes(normalizeForMatch(term)));
}

function isNoticeContext(input: string): boolean {
  return /\b(notice|notices|terms|billing change|pricing change|fee change|rate change|acceptance)\b/i.test(input);
}

function isNoticeContinuationLine(input: string): boolean {
  return /\b(effective|beginning|starts?|as of|increase|increased|increasing|billing change|pricing change|fee change|rate change|continued use|accept these terms|from\s+\$|to\s+\$)\b/i.test(
    input,
  );
}

function parseMoney(token: string): number | null {
  const normalized = token.replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "").trim();
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function cleanLabel(line: string, moneyTokens: string[], percentTokens: string[]): string {
  let label = line;
  for (const token of [...moneyTokens, ...percentTokens]) {
    label = label.replace(token, " ");
  }
  return collapseWhitespace(label.replace(/[|:]+/g, " ").replace(/\s{2,}/g, " ").replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""));
}

function cleanContextLine(line: string): string {
  return collapseWhitespace(line.replace(/[|:]+/g, " ").replace(/\s{2,}/g, " "));
}

function classifyLabel(label: string): CandidateKind {
  const lower = label.toLowerCase();
  const feeish = includesAny(lower, FEE_TERMS);
  const volumeish = includesAny(lower, VOLUME_TERMS);

  if (volumeish && !feeish) return "volume";
  if (feeish) return "fee";
  return "other";
}

function isTotalLike(label: string): boolean {
  return /\b(total|summary|monthly total|grand total|fees charged|discount fees|sales volume|total volume|total fees|month end charge|amount funded)\b/i.test(label);
}

function titleCase(label: string): string {
  return label
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function severityFromShare(sharePct: number): "low" | "medium" | "high" {
  if (sharePct >= 15) return "high";
  if (sharePct >= 7) return "medium";
  return "low";
}

function statementPeriodFromText(text: string): string | null {
  const dateRange = text.match(/\b(\d{1,2})\/(\d{1,2})\s*\/?(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\s*\/?(\d{2,4})\b/);
  if (dateRange) {
    const year = dateRange[6].length === 2 ? `20${dateRange[6]}` : dateRange[6];
    return `${year}-${String(dateRange[4]).padStart(2, "0")}`;
  }

  const monthYear = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[^\n]{0,20}\b(20\d{2})\b/i,
  );
  if (monthYear) {
    const month = monthYear[1].slice(0, 3).toLowerCase();
    const map: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mm = map[month];
    if (mm) return `${monthYear[2]}-${mm}`;
  }

  const iso = text.match(/\b(20\d{2})[-/](\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  return null;
}

function suspiciousReason(label: string): string | null {
  const lower = label.toLowerCase();
  if (/pci.*non|non.*compliance/.test(lower)) {
    return "This usually means the account has not completed PCI compliance steps and may be avoidable.";
  }
  if (/non[\s-]?emv/.test(lower)) {
    return "A non-EMV fee can indicate an avoidable hardware or setup penalty.";
  }
  if (/\brisk\b/.test(lower)) {
    return "Risk fees should be explained clearly and tied to a real underwriting reason.";
  }
  if (/monthly minimum/.test(lower)) {
    return "Monthly minimum fees can penalize lower-volume months and should be negotiated or removed.";
  }
  if (/statement fee|paper statement/.test(lower)) {
    return "Statement fees are often negotiable, especially for digital-only delivery.";
  }
  if (/gateway fee|monthly fee|service fee/.test(lower)) {
    return "Recurring service fees should be tied to a feature the merchant is actually using.";
  }
  return null;
}

function feeBucket(label: string, classification: FeeClassification): string {
  if (classification.broadType === "Pass-through") {
    return "Card Brand / Network Fees";
  }
  if (classification.broadType === "Service / compliance") {
    return "Service / Compliance Fees";
  }
  if (classification.broadType === "Processor") {
    if (classification.feeClass === "processor_transaction_or_auth") {
      return "Processor Transaction / Authorization Fees";
    }
    return "Processor Fees";
  }
  return titleCase(label);
}

function amountOnlyValue(line: string): number | null {
  if (!/^(?:\(?-?\$?\d[\d,]*\.\d{2}\)?\s*)+$/.test(line)) return null;
  const tokens = line.match(MONEY_RE) ?? [];
  return parseMoney(tokens[tokens.length - 1] ?? "");
}

function shouldMergeTrailingAmount(line: string, next: string): boolean {
  const nextAmount = amountOnlyValue(next);
  if (nextAmount === null || !/[a-z]/i.test(line)) return false;

  const moneyTokens = line.match(MONEY_RE) ?? [];
  if (moneyTokens.length === 0) return true;

  const currentLabel = cleanLabel(line, moneyTokens, []);
  if (!includesAny(currentLabel, ["total", "volume", "sales", "submitted", "processed", "funded", "deposit"])) {
    return false;
  }

  const currentAmounts = moneyTokens
    .map((token) => parseMoney(token))
    .filter((amount): amount is number => amount !== null && amount > 0);
  const currentMax = currentAmounts.length > 0 ? Math.max(...currentAmounts) : 0;

  return nextAmount >= Math.max(1, currentMax * 0.95);
}

function isLikelySectionHeader(line: string): boolean {
  const normalized = cleanContextLine(line);
  if (!normalized || normalized.length > 90 || !/[a-z]/i.test(normalized)) return false;
  if (/page \d|merchant statement|customer service|attention/i.test(normalized)) return false;
  return /\b(summary|fees|surcharge|deposit|activity|chargeback|service)\b/i.test(normalized) || normalized === normalized.toUpperCase();
}

function resolveCandidateLabel(label: string, contextLabel: string, section: string): string {
  const normalizedLabel = normalizeForMatch(label);
  const normalizedContext = normalizeForMatch(contextLabel);
  const normalizedSection = normalizeForMatch(section);

  if (/^total(?:\s+\d+)*$/i.test(label) || normalizedLabel === "total") {
    if (normalizedContext.includes("processing") && normalizedContext.includes("fee")) return "Processing Fees Total";
    if (normalizedContext.includes("surcharge")) return "Surcharge Fees Total";
    if (normalizedContext.includes("interchange")) return "Interchange Charges Total";
    if (normalizedContext.includes("servicecharge")) return "Service Charges Total";
    if (normalizedContext.includes("deposit") || normalizedContext.includes("netsales") || normalizedContext.includes("salesvolume")) {
      return "Sales Volume Total";
    }
    if (section && normalizedSection !== "uncategorized") return `${section} Total`;
  }

  return label;
}

function isGrandTotalFeeLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    /total \(service charges.*interchange charges.*fees/.test(lower) ||
    /total fees due/.test(lower) ||
    /fees charged/.test(lower) ||
    /month end charge|less discount paid/.test(lower) ||
    /^total fees$|^total charges$/.test(lower) ||
    /grand total.*fees|fees due|statement total fees|all-in fees/i.test(lower)
  );
}

function isSectionFeeTotalCandidate(candidate: Candidate): boolean {
  if (candidate.kind !== "fee") return false;
  if (candidate.totalLike) return true;
  return /^(processing fees|surcharge fees|service charges|interchange charges|transaction fees|account fees)$/i.test(candidate.label);
}

function scoreTotalFeeLabel(label: string): number {
  const lower = label.toLowerCase();
  let score = 0;
  if (/total \(service charges.*interchange charges.*fees/.test(lower)) score += 15;
  if (/total fees due/.test(lower)) score += 14;
  if (/fees charged/.test(lower)) score += 12;
  if (/month end charge|less discount paid/.test(lower)) score += 11;
  if (/^total fees$|^total charges$/.test(lower)) score += 8;
  if (/grand total.*fees|fees due|statement total fees|all-in fees/.test(lower)) score += 7;
  if (/fee|charge|discount/.test(lower)) score += 4;
  return score;
}

function mergeAmountOnlyLines(lines: string[]): string[] {
  const merged: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = collapseWhitespace(lines[index] ?? "");
    if (!line) continue;

    const next = collapseWhitespace(lines[index + 1] ?? "");
    if (next.length > 0 && shouldMergeTrailingAmount(line, next)) {
      merged.push(`${line} ${next}`);
      index += 1;
      continue;
    }

    merged.push(line);
  }
  return merged;
}

function collectCandidates(doc: ParsedDocument): Candidate[] {
  const rawLines = doc.rows
    .map((row) => (typeof row.content === "string" ? collapseWhitespace(row.content) : ""))
    .filter(Boolean);
  const lines = mergeAmountOnlyLines(rawLines);
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const recentHints: string[] = [];
  let currentSection = "Uncategorized";

  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);

    const moneyTokens = line.match(MONEY_RE) ?? [];
    const percentTokens = line.match(PERCENT_RE) ?? [];
    if (moneyTokens.length === 0) {
      if (isNoticeContext(currentSection) && isNoticeContinuationLine(line)) continue;
      if (/[a-z]/i.test(line)) {
        const hint = cleanContextLine(line);
        if (hint.length >= 3 && hint.length <= 160 && !/page \d|merchant statement|customer service|attention/i.test(hint)) {
          recentHints.push(hint);
          if (recentHints.length > 4) recentHints.shift();
        }
        if (isLikelySectionHeader(line)) {
          currentSection = titleCase(hint);
        }
      }
      continue;
    }
    if (isNoticeContext(currentSection)) continue;

    const label = cleanLabel(line, moneyTokens, percentTokens);
    if (label.length < 3 || !/[a-z]/i.test(label)) continue;

    const amounts = moneyTokens
      .map((token) => parseMoney(token))
      .filter((amount): amount is number => amount !== null && amount > 0);
    if (amounts.length === 0) continue;

    const hintedLabel = cleanContextLine(`${recentHints.slice(-3).join(" ")} ${label}`);
    const resolvedLabel = resolveCandidateLabel(label, hintedLabel, currentSection);
    const contextLabel = cleanContextLine(`${recentHints.slice(-3).join(" ")} ${resolvedLabel}`);
    const totalLike = isTotalLike(resolvedLabel);
    const labelKind = classifyLabel(label);
    const sectionLooksFeeOnly = /\bfees?\b/i.test(currentSection);
    const kind = labelKind === "other" && (totalLike || sectionLooksFeeOnly) ? classifyLabel(contextLabel) : labelKind;
    if (kind === "other" && !totalLike) continue;

    candidates.push({
      rawLine: line,
      label: resolvedLabel,
      contextLabel,
      section: currentSection,
      amount: amounts[amounts.length - 1] ?? 0,
      amounts,
      kind,
      totalLike,
    });
  }

  return candidates;
}

function pickVolume(candidates: Candidate[]): Candidate | null {
  return [...candidates]
    .filter((candidate) => candidate.kind === "volume")
    .sort((left, right) => {
      const leftLabel = left.label.toLowerCase();
      const rightLabel = right.label.toLowerCase();
      const scoreVolumeLabel = (label: string): number => {
        let score = 0;
        if (/total amount submitted/.test(label)) score += 12;
        if (/total amount processed/.test(label)) score += 11;
        if (/amounts? submitted/.test(label)) score += 10;
        if (/amount funded|funded to your bank/.test(label)) score += 8;
        if (/total volume|sales volume|gross sales|gross volume/.test(label)) score += 8;
        if (/submitted|processed/.test(label)) score += 5;
        if (/ytd|year to date|reportable/.test(label)) score -= 20;
        if (/january|february|march|april|may|june|july|august|september|october|november|december/.test(label)) score -= 6;
        return score;
      };
      const leftScore = scoreVolumeLabel(leftLabel) * 1_000_000 + left.amount;
      const rightScore = scoreVolumeLabel(rightLabel) * 1_000_000 + right.amount;
      return rightScore - leftScore;
    })[0] ?? null;
}

function pickTotalFees(candidates: Candidate[], totalVolume: number): Candidate | null {
  return [...candidates]
    .filter((candidate) => candidate.kind === "fee")
    .filter((candidate) => isGrandTotalFeeLabel(candidate.contextLabel))
    .filter((candidate) => totalVolume <= 0 || candidate.amount < totalVolume * 0.3)
    .sort((left, right) => {
      const leftScore = scoreTotalFeeLabel(left.contextLabel) * 1_000_000 + left.amount;
      const rightScore = scoreTotalFeeLabel(right.contextLabel) * 1_000_000 + right.amount;
      return rightScore - leftScore;
    })[0] ?? null;
}

function deriveFeeRecovery(candidates: Candidate[], totalVolume: number) {
  const feeCandidates = candidates
    .filter((candidate) => candidate.kind === "fee")
    .filter((candidate) => candidate.amount > 0)
    .filter((candidate) => totalVolume <= 0 || candidate.amount < totalVolume * 0.3);

  const totalFeeRow = pickTotalFees(feeCandidates, totalVolume);
  if (totalFeeRow) {
    const itemizedRows = feeCandidates
      .filter((candidate) => !isSectionFeeTotalCandidate(candidate))
      .filter((candidate) => candidate.amount < totalFeeRow.amount * 0.95)
      .filter((candidate) => candidate.amount >= Math.max(1, totalFeeRow.amount * 0.005));

    return {
      totalFees: Math.round(totalFeeRow.amount * 100) / 100,
      totalFeeRow,
      sourceRows: itemizedRows.length > 0 ? itemizedRows : [totalFeeRow],
      usedSectionFallback: false,
    };
  }

  const sectionTotalRows = feeCandidates.filter((candidate) => isSectionFeeTotalCandidate(candidate));
  const sectionsWithTotals = new Set(sectionTotalRows.map((candidate) => candidate.section));
  const itemizedRows = feeCandidates.filter((candidate) => !isSectionFeeTotalCandidate(candidate)).filter((candidate) => !sectionsWithTotals.has(candidate.section));
  const sourceRows = [...sectionTotalRows, ...itemizedRows];

  return {
    totalFees: Math.round(sourceRows.reduce((sum, candidate) => sum + candidate.amount, 0) * 100) / 100,
    totalFeeRow: null,
    sourceRows,
    usedSectionFallback: sectionTotalRows.length > 0,
  };
}

function buildFeeBreakdown(sourceRows: Candidate[], totalFees: number, processorName: string): FeeBreakdownRow[] {
  const buckets = new Map<
    string,
    {
      amount: number;
      classification: FeeClassification;
      evidenceLine: string;
      sections: Set<string>;
    }
  >();

  for (const candidate of sourceRows) {
    const classification = classifyFeeRow({
      label: candidate.label,
      amount: candidate.amount,
      processorName,
      sourceSection: candidate.section,
      evidenceLine: candidate.rawLine,
    });
    const bucket = feeBucket(candidate.label, classification);
    const current = buckets.get(bucket) ?? {
      amount: 0,
      classification,
      evidenceLine: candidate.rawLine,
      sections: new Set<string>(),
    };
    current.amount += candidate.amount;
    if (candidate.section) current.sections.add(candidate.section);
    buckets.set(bucket, current);
  }

  return [...buckets.entries()]
    .map(([label, value]) => ({
      label,
      amount: Math.round(value.amount * 100) / 100,
      sharePct: totalFees > 0 ? Math.round((value.amount / totalFees) * 10000) / 100 : 0,
      ...value.classification,
      sourceSection:
        value.sections.size === 0 ? undefined : value.sections.size === 1 ? [...value.sections][0] : "Multiple statement sections",
      evidenceLine: value.evidenceLine,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6);
}

export function refineTextOnlyPdfSummary(doc: ParsedDocument, baseSummary: AnalysisSummary): AnalysisSummary | null {
  const candidates = collectCandidates(doc);
  if (candidates.length === 0) return null;

  const bestVolume = pickVolume(candidates);
  const totalVolume = Math.round((bestVolume?.amount ?? 0) * 100) / 100;
  const feeRecovery = deriveFeeRecovery(candidates, totalVolume);
  const totalFees = feeRecovery.totalFees;
  const totalFeeRow = feeRecovery.totalFeeRow;

  if (totalVolume <= 0 || totalFees <= 0) return null;

  const effectiveRate = Math.round(((totalFees / totalVolume) * 100) * 100) / 100;
  if (!Number.isFinite(effectiveRate) || effectiveRate <= 0 || effectiveRate > 15) {
    return null;
  }

  const benchmarkBase = {
    segment: baseSummary.benchmark.segment,
    lowerRate: baseSummary.benchmark.lowerRate,
    upperRate: baseSummary.benchmark.upperRate,
  };
  const benchmarkStatus =
    effectiveRate > benchmarkBase.upperRate ? "above" : effectiveRate < benchmarkBase.lowerRate ? "below" : "within";
  const deltaFromUpperRate = Math.round(Math.max(0, effectiveRate - benchmarkBase.upperRate) * 100) / 100;

  const feeSourceRows = feeRecovery.sourceRows.length > 0 ? feeRecovery.sourceRows : candidates.filter((candidate) => candidate.kind === "fee");
  const feeBreakdown = buildFeeBreakdown(feeSourceRows, totalFees, baseSummary.processorName);
  const suspiciousRows = feeSourceRows
    .filter((candidate) => candidate.amount >= Math.max(1, totalFees * 0.005))
    .map((candidate) => ({ candidate, reason: suspiciousReason(candidate.label) }))
    .filter((item) => Boolean(item.reason))
    .slice(0, 6);

  const suspiciousFees = suspiciousRows.map(({ candidate, reason }) => ({
    label: titleCase(candidate.label),
    amount: Math.round(candidate.amount * 100) / 100,
    reason: reason ?? "This fee should be explained and justified by the processor.",
    severity: severityFromShare((candidate.amount / totalFees) * 100),
  }));

  const removableMonthly = suspiciousFees.reduce((sum, item) => sum + item.amount, 0);
  const repricingMonthly = totalVolume * (Math.max(0, effectiveRate - benchmarkBase.upperRate) / 100);
  const estimatedAnnualSavings = Math.round((removableMonthly + repricingMonthly) * 12 * 100) / 100;

  const savingsOpportunities = [
    ...suspiciousFees.slice(0, 3).map((item) => ({
      title: `Question ${item.label}`,
      detail: item.reason,
      monthlySavingsUsd: item.amount,
      annualSavingsUsd: Math.round(item.amount * 12 * 100) / 100,
      effort: item.severity === "high" ? "medium" : "low",
    })),
  ];

  if (repricingMonthly > 0) {
    savingsOpportunities.unshift({
      title: "Ask for a lower markup",
      detail: "Your effective rate appears above the benchmark range estimated for this statement. Ask for a simpler fee schedule and a lower processor markup.",
      monthlySavingsUsd: Math.round(repricingMonthly * 100) / 100,
      annualSavingsUsd: Math.round(repricingMonthly * 12 * 100) / 100,
      effort: "medium",
    });
  }

  const biggestBucket = feeBreakdown[0];
  const insights = [
    {
      title: "Statement totals recovered from PDF text",
      detail: "The report found usable fee and volume totals directly in the statement text and switched from qualitative-only mode to numeric analysis.",
      impactUsd: Math.round(totalFees * 100) / 100,
    },
    {
      title: "Largest current fee bucket",
      detail: biggestBucket
        ? `${biggestBucket.label} is the largest visible fee bucket in the statement.`
        : "A detailed fee mix was not fully available from the text layer.",
      impactUsd: biggestBucket?.amount ?? 0,
    },
  ];

  if (benchmarkStatus === "above") {
    insights.push({
      title: "Rate appears above benchmark",
      detail: `The recovered effective rate of ${effectiveRate.toFixed(2)}% is above the estimated benchmark upper bound of ${benchmarkBase.upperRate.toFixed(2)}%.`,
      impactUsd: Math.round(repricingMonthly * 12 * 100) / 100,
    });
  }

  const dataQuality = [
    {
      level: "warning",
      message:
        "Numeric totals were recovered from searchable PDF text using heuristics. Verify the main totals against the original statement before acting on the report.",
    },
  ];

  if (doc.extraction.mode !== "structured") {
    dataQuality.push({
      level: "warning",
      message: "Structured table extraction was unavailable, so the report estimated numeric totals from the searchable PDF text layer.",
    });
    for (const reason of doc.extraction.reasons) {
      dataQuality.push({ level: "warning", message: reason });
    }
  }

  if (!totalFeeRow) {
    dataQuality.push({
      level: "warning",
      message: feeRecovery.usedSectionFallback
        ? "A single grand-total fees row was not found, so the report combined section totals and itemized fee lines."
        : "A direct total-fees row was not found, so the report used the sum of detected fee lines.",
    });
  }

  const statementPeriod = statementPeriodFromText(doc.textPreview) || baseSummary.statementPeriod || "Statement period unavailable";

  const summary = {
    ...baseSummary,
    statementPeriod,
    executiveSummary:
      benchmarkStatus === "above"
        ? "This statement produced usable fee and volume totals from the PDF text. The current effective rate looks elevated versus the benchmark and there are fees worth questioning."
        : "This statement produced usable fee and volume totals from the PDF text. The report now includes a real fee mix, rate calculation, and merchant-facing follow-up actions.",
    totalVolume,
    totalFees,
    effectiveRate,
    estimatedMonthlyVolume: totalVolume,
    estimatedMonthlyFees: totalFees,
    estimatedAnnualFees: Math.round(totalFees * 12 * 100) / 100,
    estimatedAnnualSavings,
    benchmark: {
      ...benchmarkBase,
      status: benchmarkStatus,
      deltaFromUpperRate,
    },
    feeBreakdown,
    suspiciousFees,
    savingsOpportunities,
    negotiationChecklist: [
      ...suspiciousFees.slice(0, 3).map((item) => `Ask why '${item.label}' is being charged and whether it can be reduced or removed.`),
      "Ask the processor to separate pass-through card-brand costs from processor markup and recurring service fees.",
      "Request a machine-readable statement export or fee detail so future reviews can be more precise.",
    ],
    actionPlan: [
      "Verify the recovered fee and volume totals against the statement summary page.",
      "Ask the processor to explain each recurring fee that is not directly tied to card-brand pass-through costs.",
      benchmarkStatus === "above"
        ? "Use the benchmark gap and flagged fees to request a lower all-in rate."
        : "Use the flagged fees and fee mix to simplify the current pricing structure.",
    ],
    dataQuality,
    insights,
    confidence: doc.extraction.mode === "structured" && totalFeeRow && bestVolume ? "medium" : "low",
  } as AnalysisSummary;

  return summary;
}
