import type {
  AnalysisSummary,
  BenchmarkResult,
  DataQualitySignal,
  FeeBreakdownRow,
  FeeClassificationConfidence,
  StructuredFeeFinding,
  SuspiciousFee,
} from "../types.js";
import { explainFeeFromReference } from "../feeReferenceExplanations.js";
import type { CustomerConfidence, CustomerFeeTableRow, CustomerFinding, CustomerReportMetric, ReportKind } from "./types.js";

const HIGH_CONFIDENCE_SCORE = 0.8;
const MEDIUM_CONFIDENCE_SCORE = 0.6;
const BUCKET_COVERAGE_THRESHOLD = 0.85;
const RECONCILIATION_DOLLAR_TOLERANCE = 1;
const RECONCILIATION_PCT_TOLERANCE = 0.02;

export type PermissionResult = {
  allowed: boolean;
  confidence?: CustomerConfidence;
  reason?: string;
};

export type BucketSplitPermission =
  | {
      allowed: true;
      confidence: "high";
      cardBrandTotal: number;
      processorControlledTotal: number;
      cardBrandSharePct: number;
      processorControlledSharePct: number;
      coveragePct: number;
      reconciliationDelta: number;
    }
  | {
      allowed: false;
      reason: string;
      coveragePct?: number;
      reconciliationDelta?: number;
    };

export function isPositiveFinite(value: unknown): value is number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

export function confidenceFromScore(score: number | null | undefined): CustomerConfidence | "low" {
  if (score !== null && score !== undefined) {
    if (score >= HIGH_CONFIDENCE_SCORE) return "high";
    if (score >= MEDIUM_CONFIDENCE_SCORE) return "medium";
    return "low";
  }
  return "medium";
}

export function confidenceFromAnalysis(value: AnalysisSummary["confidence"] | FeeClassificationConfidence | undefined): CustomerConfidence | "low" {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

export function canShowTotalVolume(summary: AnalysisSummary | undefined): PermissionResult {
  const gate = pdfParserDecisionGate(summary);
  if (gate) return gate;
  if (!summary || !isPositiveFinite(summary.totalVolume)) {
    return { allowed: false, reason: "Total volume was not reliably extracted." };
  }
  return { allowed: true, confidence: reportableConfidence(summary.confidence) };
}

export function canShowTotalFees(summary: AnalysisSummary | undefined): PermissionResult {
  const gate = pdfParserDecisionGate(summary);
  if (gate) return gate;
  if (!summary || !isPositiveFinite(summary.totalFees)) {
    return { allowed: false, reason: "Total fees were not reliably extracted." };
  }
  return { allowed: true, confidence: reportableConfidence(summary.confidence) };
}

export function canShowEffectiveRate(summary: AnalysisSummary | undefined): PermissionResult {
  const volume = canShowTotalVolume(summary);
  const fees = canShowTotalFees(summary);
  if (!summary || !volume.allowed || !fees.allowed || !isPositiveFinite(summary.effectiveRate)) {
    return { allowed: false, reason: "Effective rate requires reliable total volume and total fees." };
  }
  return { allowed: true, confidence: "high" };
}

export function canShowBenchmarkVerdict(summary: AnalysisSummary | undefined): PermissionResult {
  if (!summary || !canShowEffectiveRate(summary).allowed || !hasBenchmark(summary.benchmark)) {
    return { allowed: false, reason: "Benchmark verdict requires a reliable effective rate and benchmark range." };
  }
  return { allowed: true, confidence: "medium" };
}

export function canShowAverageTicket(summary: AnalysisSummary | undefined): PermissionResult {
  const gate = pdfParserDecisionGate(summary);
  if (gate) return gate;
  const count = summary?.interchangeAudit?.transactionCount ?? summary?.processorMarkupAudit?.transactionCount ?? null;
  if (!summary || !isPositiveFinite(summary.totalVolume) || !isPositiveFinite(count)) {
    return { allowed: false, reason: "Average ticket requires reliable volume and transaction count." };
  }
  return { allowed: true, confidence: "medium" };
}

export function averageTicket(summary: AnalysisSummary): number | null {
  const count = summary.interchangeAudit?.transactionCount ?? summary.processorMarkupAudit?.transactionCount ?? null;
  if (!isPositiveFinite(summary.totalVolume) || !isPositiveFinite(count)) return null;
  return summary.totalVolume / count;
}

export function canShowFeeBreakdown(summary: AnalysisSummary | undefined): PermissionResult {
  const gate = pdfParserDecisionGate(summary);
  if (gate) return gate;
  if (summary?.sourceType === "pdf" && summary.parserDecision?.validationState && !summary.parserDecision.validationState.feeClassificationAllowed) {
    return {
      allowed: false,
      reason: "Fee breakdown requires validated fee classification. This statement still has blended or unresolved fee rows.",
    };
  }
  const rows = approvedFeeRows(summary);
  if (!summary || !isPositiveFinite(summary.totalFees) || rows.length === 0) {
    return { allowed: false, reason: "Fee breakdown requires reliable fee rows with amounts." };
  }
  const covered = rows.reduce((sum, row) => sum + row.rawAmount, 0);
  if (covered / summary.totalFees < BUCKET_COVERAGE_THRESHOLD) {
    return { allowed: false, reason: "Fee rows do not cover enough of total fees." };
  }
  return { allowed: true, confidence: "medium" };
}

export function canShowTwoBucketSplit(summary: AnalysisSummary | undefined): BucketSplitPermission {
  if (!summary) {
    return { allowed: false, reason: "Two-bucket split requires reliable total fees." };
  }

  const gate = pdfParserDecisionGate(summary);
  if (gate) {
    return { allowed: false, reason: gate.reason ?? "PDF reports require a validated parser decision." };
  }
  if (summary.sourceType === "pdf" && summary.parserDecision?.validationState && !summary.parserDecision.validationState.feeClassificationAllowed) {
    return {
      allowed: false,
      reason: "Two-bucket split requires validated fee classification. This statement still has blended or unresolved fee rows.",
    };
  }

  const canonical = twoBucketPermissionFromAnalysis(summary);
  if (canonical) return canonical;

  if (!isPositiveFinite(summary.totalFees)) {
    return { allowed: false, reason: "Two-bucket split requires reliable total fees." };
  }

  // Compatibility path for older saved summaries that predate summary.twoBucketAnalysis.
  const cardBrandTotal = positiveOrNull(summary.interchangeAudit?.totalPaid) ?? feeRowsTotal(summary.feeBreakdown, "cardBrand");
  const processorControlledTotal = processorControlledTotalFromRows(summary.feeBreakdown);
  if (!isPositiveFinite(cardBrandTotal) || !isPositiveFinite(processorControlledTotal)) {
    return {
      allowed: false,
      reason: "This statement does not separate card-brand and processor-controlled fees clearly enough.",
    };
  }

  const combined = cardBrandTotal + processorControlledTotal;
  const coverage = combined / summary.totalFees;
  const reconciliationDelta = Math.abs(combined - summary.totalFees);
  const reconciliationTolerance = Math.max(RECONCILIATION_DOLLAR_TOLERANCE, summary.totalFees * RECONCILIATION_PCT_TOLERANCE);
  if (coverage < BUCKET_COVERAGE_THRESHOLD || reconciliationDelta > reconciliationTolerance) {
    return {
      allowed: false,
      reason: "This statement does not separate fees clearly enough to show a reliable split.",
      coveragePct: round2(coverage * 100),
      reconciliationDelta: round2(reconciliationDelta),
    };
  }

  return {
    allowed: true,
    confidence: "high",
    cardBrandTotal: round2(cardBrandTotal),
    processorControlledTotal: round2(processorControlledTotal),
    cardBrandSharePct: round2((cardBrandTotal / combined) * 100),
    processorControlledSharePct: round2((processorControlledTotal / combined) * 100),
    coveragePct: round2(coverage * 100),
    reconciliationDelta: round2(reconciliationDelta),
  };
}

function twoBucketPermissionFromAnalysis(summary: AnalysisSummary): BucketSplitPermission | null {
  const analysis = summary.twoBucketAnalysis;
  if (!analysis) return null;

  const totalFees = positiveOrNull(analysis.totalFees) ?? positiveOrNull(summary.totalFees);
  if (!isPositiveFinite(totalFees)) {
    return { allowed: false, reason: "Two-bucket split requires reliable total fees." };
  }

  const cardBrandTotal = positiveOrNull(analysis.cardBrandTotal);
  const processorControlledTotal = positiveOrNull(analysis.processorControlledTotal ?? analysis.processorOwnedTotal);
  if (!analysis.available || !isPositiveFinite(cardBrandTotal) || !isPositiveFinite(processorControlledTotal)) {
    return {
      allowed: false,
      reason: analysis.reason || "This statement does not separate card-brand and processor-controlled fees clearly enough.",
      coveragePct: analysis.coveragePct ?? undefined,
      reconciliationDelta: analysis.reconciliationDeltaUsd ?? undefined,
    };
  }

  const combined = cardBrandTotal + processorControlledTotal;
  const coverage = analysis.coveragePct !== null && analysis.coveragePct !== undefined ? analysis.coveragePct / 100 : combined / totalFees;
  const reconciliationDelta =
    analysis.reconciliationDeltaUsd !== null && analysis.reconciliationDeltaUsd !== undefined
      ? Math.abs(analysis.reconciliationDeltaUsd)
      : Math.abs(combined - totalFees);
  const reconciliationTolerance = Math.max(RECONCILIATION_DOLLAR_TOLERANCE, totalFees * RECONCILIATION_PCT_TOLERANCE);

  if (coverage < BUCKET_COVERAGE_THRESHOLD || reconciliationDelta > reconciliationTolerance) {
    return {
      allowed: false,
      reason: analysis.reason || "This statement does not separate fees clearly enough to show a reliable split.",
      coveragePct: round2(coverage * 100),
      reconciliationDelta: round2(reconciliationDelta),
    };
  }

  return {
    allowed: true,
    confidence: "high",
    cardBrandTotal: round2(cardBrandTotal),
    processorControlledTotal: round2(processorControlledTotal),
    cardBrandSharePct: round2((cardBrandTotal / combined) * 100),
    processorControlledSharePct: round2((processorControlledTotal / combined) * 100),
    coveragePct: round2(coverage * 100),
    reconciliationDelta: round2(reconciliationDelta),
  };
}

export function approvedFeeRows(summary: AnalysisSummary | undefined): CustomerFeeTableRow[] {
  if (pdfParserDecisionGate(summary)) return [];
  return (summary?.feeBreakdown ?? [])
    .filter((row) => isPositiveFinite(row.amount) && confidenceFromAnalysis(row.classificationConfidence) !== "low")
    .map((row) => ({
      label: displayFeeLabel(row.label),
      amount: formatMoney(row.amount),
      rawAmount: round2(row.amount),
      category: customerFeeCategory(row),
    }));
}

export function approvedCustomerFindings(summary: AnalysisSummary | undefined, kind: ReportKind): CustomerFinding[] {
  if (!summary) return [];
  if (pdfParserDecisionGate(summary)) return [];
  const findings: CustomerFinding[] = [
    ...structuredFindings(summary.structuredFeeFindings ?? [], kind),
    ...suspiciousFeeFindings(summary.suspiciousFees ?? [], kind),
  ];

  const unique = new Map<string, CustomerFinding>();
  for (const finding of findings) {
    if (!unique.has(finding.id)) {
      unique.set(finding.id, finding);
    }
  }

  return [...unique.values()].sort((left, right) => impactValue(right) - impactValue(left));
}

export function metric(
  id: string,
  label: string,
  permission: PermissionResult,
  value: string,
  rawValue: number | string | null,
  fallbackCopy: string,
  unit: CustomerReportMetric["unit"],
): CustomerReportMetric {
  if (!permission.allowed) {
    return { id, label, displayMode: "fallback", fallbackCopy, unit };
  }
  return {
    id,
    label,
    displayMode: "exact",
    value,
    rawValue,
    unit,
    confidence: permission.confidence,
  };
}

export function dataQualityNote(signals: DataQualitySignal[] | undefined, levelOverride?: "info" | "warning" | "critical"): {
  level: "info" | "warning" | "critical";
  message: string;
} {
  const critical = signals?.find((signal) => signal.level === "critical");
  const warning = signals?.find((signal) => signal.level === "warning");
  const selected = critical ?? warning ?? signals?.[0];
  if (selected) {
    return { level: levelOverride ?? selected.level, message: selected.message };
  }
  return {
    level: levelOverride ?? "info",
    message: "This statement was read cleanly enough to produce a customer-safe report.",
  };
}

export function cleanChecks(summary: AnalysisSummary | undefined, count: number): CustomerFinding[] {
  const checks: CustomerFinding[] = [];
  if (canShowEffectiveRate(summary).allowed && summary?.benchmark?.status !== "above") {
    checks.push({
      id: "clean_effective_rate",
      title: "Effective rate is within range",
      description: "Your effective rate is not above the selected business benchmark.",
      severity: "clean",
      confidence: "high",
    });
  }
  if (canShowTwoBucketSplit(summary).allowed) {
    checks.push({
      id: "clean_fee_split",
      title: "Fee split is readable",
      description: "Card-brand and processor-controlled fees reconcile clearly enough to review.",
      severity: "clean",
      confidence: "high",
    });
  }
  if ((summary?.structuredFeeFindings ?? []).length === 0 && (summary?.suspiciousFees ?? []).length === 0) {
    checks.push({
      id: "clean_no_approved_flags",
      title: "No approved fee flags",
      description: "We did not find high-confidence fee issues suitable for the teaser.",
      severity: "clean",
      confidence: "high",
    });
  }
  while (checks.length < count) {
    checks.push({
      id: `data_quality_${checks.length + 1}`,
      title: "More detail unlocks after signup",
      description: "We keep uncertain diagnostics out of the teaser instead of showing weak findings.",
      severity: "clean",
      confidence: "high",
    });
  }
  return checks.slice(0, count);
}

function hasBenchmark(benchmark: BenchmarkResult | undefined): boolean {
  return (
    benchmark !== undefined &&
    Number.isFinite(benchmark.lowerRate) &&
    Number.isFinite(benchmark.upperRate) &&
    benchmark.upperRate > benchmark.lowerRate
  );
}

function pdfParserDecisionGate(summary: AnalysisSummary | undefined): PermissionResult | null {
  if (!summary || summary.sourceType !== "pdf") return null;
  if (!summary.parserDecision) {
    return {
      allowed: false,
      reason: "PDF reports require a validated parser decision before customer-facing financial metrics can be shown.",
    };
  }
  if (!summary.parserDecision.reportable) {
    return {
      allowed: false,
      reason: summary.parserDecision.reason || "The parser did not approve this PDF for customer-facing financial metrics.",
    };
  }
  if (summary.parserDecision.validationState && !summary.parserDecision.validationState.customerFacingTotalsAllowed) {
    return {
      allowed: false,
      reason:
        summary.parserDecision.validationState.blockingReasons.join(" ") ||
        "The parser did not validate customer-facing PDF financial totals.",
    };
  }
  return null;
}

function reportableConfidence(value: AnalysisSummary["confidence"] | FeeClassificationConfidence | undefined): CustomerConfidence {
  const confidence = confidenceFromAnalysis(value);
  return confidence === "low" ? "medium" : confidence;
}

function positiveOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function feeRowsTotal(rows: FeeBreakdownRow[] | undefined, kind: "cardBrand" | "processor"): number | null {
  let total = 0;
  for (const row of rows ?? []) {
    if (!isPositiveFinite(row.amount)) continue;
    if (kind === "cardBrand" && (row.feeClass === "card_brand_pass_through" || row.broadType === "Pass-through")) {
      total += row.amount;
    }
    if (
      kind === "processor" &&
      (row.feeClass === "processor_markup" ||
        row.feeClass === "processor_transaction_or_auth" ||
        row.feeClass === "processor_service_add_on" ||
        row.feeClass === "compliance_remediation" ||
        row.broadType === "Processor" ||
        row.broadType === "Service / compliance")
    ) {
      total += row.amount;
    }
  }
  return total > 0 ? round2(total) : null;
}

function processorControlledTotalFromRows(rows: FeeBreakdownRow[] | undefined): number | null {
  return feeRowsTotal(rows, "processor");
}

function customerFeeCategory(row: FeeBreakdownRow): CustomerFeeTableRow["category"] {
  if (row.feeClass === "card_brand_pass_through" || row.broadType === "Pass-through") return "Card brand / network";
  if (row.feeClass === "processor_markup" || row.feeClass === "processor_transaction_or_auth" || row.broadType === "Processor") {
    return "Processor fees";
  }
  if (row.feeClass === "processor_service_add_on" || row.feeClass === "compliance_remediation" || row.broadType === "Service / compliance") {
    return "Service & compliance";
  }
  return "Needs review";
}

function structuredFindings(findings: StructuredFeeFinding[], kind: ReportKind): CustomerFinding[] {
  return findings
    .map((finding): CustomerFinding | null => {
      const confidence = confidenceFromScore(finding.confidence);
      if (confidence === "low") return null;
      if (kind === "free_teaser" && confidence !== "high") return null;
      const amount = positiveOrNull(finding.estimatedImpactUsd ?? finding.amountUsd);
      return {
        id: `structured_${finding.kind}`,
        title: findingTitle(finding.kind, finding.label),
        description: feeReferenceDescription(finding.label, findingDescription(finding.kind)),
        severity: confidence === "high" ? "fix" : "watch",
        monthlyImpact: amount !== null ? formatMoney(amount) : undefined,
        evidenceSummary: safeEvidence(finding.evidenceLine),
        confidence,
      };
    })
    .filter((finding): finding is CustomerFinding => finding !== null);
}

function suspiciousFeeFindings(findings: SuspiciousFee[], kind: ReportKind): CustomerFinding[] {
  return findings
    .map((finding, index): CustomerFinding | null => {
      const high = finding.severity === "high";
      if (kind === "free_teaser" && !high) return null;
      return {
        id: `suspicious_${index}_${normalizeId(finding.label)}`,
        title: displayFeeLabel(finding.label),
        description: feeReferenceDescription(finding.label, safeEvidence(finding.reason)),
        severity: high ? "fix" : "watch",
        monthlyImpact: isPositiveFinite(finding.amount) ? formatMoney(finding.amount) : undefined,
        confidence: high ? "high" : "medium",
      };
    })
    .filter((finding): finding is CustomerFinding => finding !== null);
}

function feeReferenceDescription(label: string, fallback: string): string {
  const explanation = explainFeeFromReference(label);
  return explanation.pattern ? explanation.explanation : fallback;
}

function findingTitle(kind: StructuredFeeFinding["kind"], fallback: string): string {
  if (kind === "pci_non_compliance") return "PCI non-compliance fee";
  if (kind === "customer_intelligence_suite") return "Recurring service fee";
  if (kind === "non_emv") return "Non-EMV related fee";
  if (kind === "risk_fee") return "Risk-related fee";
  return displayFeeLabel(fallback);
}

function findingDescription(kind: StructuredFeeFinding["kind"]): string {
  if (kind === "pci_non_compliance") return "A PCI non-compliance fee appears on this statement.";
  if (kind === "customer_intelligence_suite") return "A recurring service fee appears. Confirm whether this service is active.";
  if (kind === "non_emv") return "A non-EMV related fee appears on this statement.";
  if (kind === "risk_fee") return "A risk-related fee appears. Confirm why it applies.";
  return "This fee appears on the statement and is worth reviewing.";
}

function impactValue(finding: CustomerFinding): number {
  const raw = finding.monthlyImpact?.replace(/[^0-9.]/g, "");
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function safeEvidence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "finding";
}

function displayFeeLabel(value: string): string {
  const specialWords: Record<string, string> = {
    amex: "Amex",
    api: "API",
    ach: "ACH",
    avs: "AVS",
    pci: "PCI",
    pos: "POS",
    ebt: "EBT",
    emv: "EMV",
  };
  return String(value ?? "")
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return specialWords[lower] || `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number): string {
  return `${Number(value).toFixed(2)}%`;
}

export function formatBps(value: number): string {
  return `${Number(value).toFixed(2)} bps`;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
