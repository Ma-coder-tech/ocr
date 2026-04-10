import type { ParsedDocument } from "./parser.js";
import type { AnalysisSummary } from "./types.js";

type CandidateKind = "volume" | "fee" | "other";

type Candidate = {
  rawLine: string;
  label: string;
  amount: number;
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

function includesAny(input: string, terms: string[]): boolean {
  const lower = input.toLowerCase();
  return terms.some((term) => lower.includes(term));
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

function benchmarkForProcessor(processorName: string) {
  const key = processorName.toLowerCase();
  if (key.includes("square")) {
    return { segment: "SMB blended card mix (Square)", lowerRate: 2.6, upperRate: 4.1 };
  }
  if (key.includes("stripe")) {
    return { segment: "SMB blended card mix (Stripe)", lowerRate: 2.4, upperRate: 3.9 };
  }
  if (key.includes("paypal")) {
    return { segment: "SMB blended card mix (PayPal)", lowerRate: 2.9, upperRate: 4.6 };
  }
  if (key.includes("adyen")) {
    return { segment: "Mid-market card mix (Adyen)", lowerRate: 1.8, upperRate: 3.2 };
  }
  return { segment: "General SMB card processing", lowerRate: 2.2, upperRate: 3.8 };
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

function feeBucket(label: string): string {
  const lower = label.toLowerCase();
  if (/interchange|assessment|dues|visa|mastercard|discover|amex|network/.test(lower)) {
    return "Card Brand / Network Fees";
  }
  if (/pci|non[\s-]?emv|risk|statement|gateway|monthly minimum|monthly fee|service fee/.test(lower)) {
    return "Service / Add-On Fees";
  }
  if (/processing|discount|authorization|auth|batch|transaction|markup/.test(lower)) {
    return "Processor Fees";
  }
  return titleCase(label);
}

function mergeAmountOnlyLines(lines: string[]): string[] {
  const merged: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = collapseWhitespace(lines[index] ?? "");
    if (!line) continue;

    const next = collapseWhitespace(lines[index + 1] ?? "");
    const nextIsAmountOnly = next.length > 0 && /^(?:\(?-?\$?\d[\d,]*\.\d{2}\)?\s*)+$/.test(next);
    const currentHasLetters = /[a-z]/i.test(line);
    const currentHasMoney = MONEY_RE.test(line);
    MONEY_RE.lastIndex = 0;

    if (currentHasLetters && !currentHasMoney && nextIsAmountOnly) {
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

  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);

    const moneyTokens = line.match(MONEY_RE) ?? [];
    const percentTokens = line.match(PERCENT_RE) ?? [];
    if (moneyTokens.length === 0) continue;

    const label = cleanLabel(line, moneyTokens, percentTokens);
    if (label.length < 3 || !/[a-z]/i.test(label)) continue;

    const amount = parseMoney(moneyTokens[moneyTokens.length - 1]);
    if (amount === null || amount <= 0) continue;

    const kind = classifyLabel(label);
    if (kind === "other" && !isTotalLike(label)) continue;

    candidates.push({
      rawLine: line,
      label,
      amount,
      kind,
      totalLike: isTotalLike(label),
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
    .filter((candidate) => candidate.totalLike || /total|fees charged|discount fees|total fees|processing fees|month end charge|less discount paid/i.test(candidate.label))
    .filter((candidate) => totalVolume <= 0 || candidate.amount < totalVolume * 0.3)
    .sort((left, right) => {
      const scoreFeeLabel = (label: string): number => {
        const lower = label.toLowerCase();
        let score = 0;
        if (/total \(service charges.*interchange charges.*fees/.test(lower)) score += 15;
        if (/fees charged/.test(lower)) score += 12;
        if (/month end charge|less discount paid/.test(lower)) score += 11;
        if (/^total fees$|total charges/.test(lower)) score += 6;
        if (/total account fees|total transaction fees|total debit network fees|total service charges|total interchange charges/.test(lower)) score += 4;
        if (/processing fees/.test(lower)) score += 7;
        if (/fee|charge|discount/.test(lower)) score += 4;
        return score;
      };
      const leftScore = scoreFeeLabel(left.label) * 1_000_000 + left.amount;
      const rightScore = scoreFeeLabel(right.label) * 1_000_000 + right.amount;
      return rightScore - leftScore;
    })[0] ?? null;
}

function buildFeeBreakdown(candidates: Candidate[], totalFees: number, totalFeeRow: Candidate | null) {
  const buckets = new Map<string, number>();
  const components = candidates
    .filter((candidate) => candidate.kind === "fee")
    .filter((candidate) => !candidate.totalLike)
    .filter((candidate) => candidate.amount > 0)
    .filter((candidate) => !totalFeeRow || candidate.amount < totalFeeRow.amount * 0.95)
    .filter((candidate) => !totalFeeRow || candidate.amount >= Math.max(1, totalFeeRow.amount * 0.005));

  const sourceRows = components.length > 0 ? components : totalFeeRow ? [totalFeeRow] : [];
  for (const candidate of sourceRows) {
    const bucket = feeBucket(candidate.label);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + candidate.amount);
  }

  return [...buckets.entries()]
    .map(([label, amount]) => ({
      label,
      amount: Math.round(amount * 100) / 100,
      sharePct: totalFees > 0 ? Math.round((amount / totalFees) * 10000) / 100 : 0,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 6);
}

export function refineTextOnlyPdfSummary(doc: ParsedDocument, baseSummary: AnalysisSummary): AnalysisSummary | null {
  const candidates = collectCandidates(doc);
  if (candidates.length === 0) return null;

  const bestVolume = pickVolume(candidates);
  const totalVolume = Math.round((bestVolume?.amount ?? 0) * 100) / 100;
  const totalFeeRow = pickTotalFees(candidates, totalVolume);

  let totalFees = Math.round((totalFeeRow?.amount ?? 0) * 100) / 100;
  if (totalFees <= 0) {
    totalFees =
      Math.round(
        candidates
          .filter((candidate) => candidate.kind === "fee" && !candidate.totalLike)
          .reduce((sum, candidate) => sum + candidate.amount, 0) * 100,
      ) / 100;
  }

  if (totalVolume <= 0 || totalFees <= 0) return null;

  const effectiveRate = Math.round(((totalFees / totalVolume) * 100) * 100) / 100;
  if (!Number.isFinite(effectiveRate) || effectiveRate <= 0 || effectiveRate > 15) {
    return null;
  }

  const benchmarkBase = benchmarkForProcessor(baseSummary.processorName || "Unknown");
  const benchmarkStatus =
    effectiveRate > benchmarkBase.upperRate ? "above" : effectiveRate < benchmarkBase.lowerRate ? "below" : "within";
  const deltaFromUpperRate = Math.round(Math.max(0, effectiveRate - benchmarkBase.upperRate) * 100) / 100;

  const feeBreakdown = buildFeeBreakdown(candidates, totalFees, totalFeeRow);
  const suspiciousRows = candidates
    .filter((candidate) => candidate.kind === "fee")
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

  if (!totalFeeRow) {
    dataQuality.push({
      level: "warning",
      message: "A direct total-fees row was not found, so the report used the sum of detected fee lines.",
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
    confidence: totalFeeRow && bestVolume ? "medium" : "low",
  } as AnalysisSummary;

  return summary;
}
