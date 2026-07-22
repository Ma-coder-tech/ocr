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
const CUSTOMER_FINDING_MIN_ANNUAL_IMPACT = 10;

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
    return { allowed: false, reason: "We need reliable sales volume and total fees to calculate the percentage you paid in fees." };
  }
  return { allowed: true, confidence: "high" };
}

export function canShowBenchmarkVerdict(summary: AnalysisSummary | undefined): PermissionResult {
  if (!summary || !canShowEffectiveRate(summary).allowed || !hasBenchmark(summary.benchmark)) {
    return { allowed: false, reason: "We need reliable totals and a benchmark range before comparing your rate." };
  }
  return { allowed: true, confidence: "medium" };
}

export function canShowAverageTicket(summary: AnalysisSummary | undefined): PermissionResult {
  const gate = pdfParserDecisionGate(summary);
  if (gate) return gate;
  const count = summary?.interchangeAudit?.transactionCount ?? summary?.processorMarkupAudit?.transactionCount ?? null;
  if (!summary || !isPositiveFinite(summary.totalVolume) || !isPositiveFinite(count)) {
    return { allowed: false, reason: "We need reliable sales volume and transaction count to calculate average ticket." };
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
      reason: "We couldn't identify your fee categories from this statement. Everything else below is verified.",
    };
  }
  const rows = approvedFeeRows(summary);
  if (!summary || !isPositiveFinite(summary.totalFees) || rows.length === 0) {
    return { allowed: false, reason: "Fee breakdown requires reliable fee rows with amounts." };
  }
  const covered = rows.reduce((sum, row) => sum + row.rawAmount, 0);
  if (covered / summary.totalFees < BUCKET_COVERAGE_THRESHOLD) {
    return { allowed: false, reason: "We couldn't identify enough fee rows to show a reliable table." };
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
      reason: "We couldn't identify your fee categories from this statement. Everything else below is verified.",
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
  const hasFiservV2Analysis = recordOrNull(summary.fiservFeeAnalysisV2) !== null;
  const findings: CustomerFinding[] = [
    ...structuredFindings(summary.structuredFeeFindings ?? [], kind),
    ...(hasFiservV2Analysis ? [] : suspiciousFeeFindings(summary.suspiciousFees ?? [], kind)),
    ...fiservV2CustomerFindings(summary),
  ];

  const unique = new Map<string, CustomerFinding>();
  for (const finding of findings) {
    if (!unique.has(finding.id)) {
      unique.set(finding.id, finding);
    }
  }

  return [...unique.values()].sort((left, right) => impactValue(right) - impactValue(left));
}

function fiservV2CustomerFindings(summary: AnalysisSummary): CustomerFinding[] {
  const analysis = recordOrNull(summary.fiservFeeAnalysisV2);
  if (!analysis) return [];

  const rawFindings = arrayOfRecords(analysis.findings);
  const savings = recordOrNull(analysis.estimatedAnnualSavings);
  const components = arrayOfRecords(savings?.components);
  const hasItemizedJunkFees = rawFindings.some((finding) => stringValue(finding.kind) === "junk_fee");
  const hasBundledSavingsFinding = rawFindings.some((finding) => stringValue(finding.kind) === "bundled_pricing_savings_opportunity");

  return rawFindings
    .map((finding): CustomerFinding | null => {
      const kind = stringValue(finding.kind);
      const severity = stringValue(finding.severity);
      const rawTitle = stringValue(finding.title) || "Fee worth reviewing";
      const title = cleanFindingTitle(rawTitle);
      const amount = positiveOrNull(finding.amount);
      const component = componentForFinding(components, kind, rawTitle);
      const annualImpact = positiveOrNull(component?.annualImpact) ?? annualFromFinding(finding, amount);
      const confidence = confidenceForFiservFinding(finding, component);

      if (!kind || suppressedFiservFindingKind(kind)) return null;
      if (kind === "effective_rate_above_benchmark" && hasBundledSavingsFinding) return null;
      if (kind === "junk_fixed_fee_summary" && hasItemizedJunkFees) return null;
      if (annualImpact !== null && annualImpact < CUSTOMER_FINDING_MIN_ANNUAL_IMPACT) return null;
      if (annualImpact === null && !allowNonDollarFiservFinding(kind)) return null;

      const mapped = mapFiservFinding(kind, severity, title, amount, annualImpact, finding, confidence);
      if (!mapped) return null;
      return removeDuplicatedEvidence(mapped);
    })
    .filter((finding): finding is CustomerFinding => finding !== null);
}

function mapFiservFinding(
  kind: string,
  severity: string,
  title: string,
  amount: number | null,
  annualImpact: number | null,
  finding: Record<string, unknown>,
  confidence: CustomerConfidence,
): CustomerFinding | null {
  const monthlyAmount = monthlyAmountForFinding(kind, finding, amount, annualImpact);
  const monthlyImpact = monthlyAmount !== null ? formatMoney(monthlyAmount) : undefined;
  const annualImpactText = annualImpact !== null ? formatMoney(annualImpact) : undefined;
  const evidence = firstEvidence(finding);
  const base = {
    id: `fiserv_v2_${kind}_${normalizeId(title)}`,
    title: customerFindingTitle(kind, title),
    monthlyImpact,
    annualImpact: annualImpactText,
    evidenceSummary: evidence,
    confidence,
  };

  if (kind === "junk_fee" || kind === "junk_fixed_fee_summary") {
    return {
      ...base,
      description: feeReferenceDescription(title, "This is processor-controlled. Ask your processor to remove it or explain exactly what service it pays for."),
      severity: "fix",
    };
  }
  if (kind === "avoidable_compliance_fee") {
    return {
      ...base,
      description: feeReferenceDescription(title, "Confirm your PCI or security validation status. Once corrected, ask your processor to remove the fee."),
      severity: "fix",
    };
  }
  if (kind === "penalty_or_configuration_fee") {
    return {
      ...base,
      description: feeReferenceDescription(title, "Ask what caused this terminal, gateway, or transaction-data fee and how to prevent it."),
      severity: amount !== null && amount >= 5 ? "fix" : "watch",
    };
  }
  if (kind === "per_auth_fee_benchmark" || kind === "processor_per_item_stacking") {
    return {
      ...base,
      description: feeReferenceDescription(title, "This is processor-controlled per-transaction pricing. Worth negotiating, especially when multiple per-item fees are stacked."),
      severity: "watch",
    };
  }
  if (kind === "rate_exceeds_reference" || kind === "suspicious_uniform_rate") {
    return {
      ...base,
      description: "This fee ran higher than what we'd expect from the network's published rate. Ask for documentation before treating it as removable.",
      severity: severity === "high" ? "fix" : "watch",
    };
  }
  if (kind === "hidden_percentage_markup") {
    return {
      ...base,
      description: "This line appears to add processor-controlled percentage markup beyond the visible base pricing. Ask for removal or repricing.",
      severity: severity === "high" ? "fix" : "watch",
    };
  }
  if (kind === "tiered_downgrade_cost") {
    return {
      ...base,
      description: "This is the monthly cost above the lowest visible tier. Ask for an interchange-plus quote or a written explanation of why transactions moved into higher tiers.",
      severity: severity === "high" ? "fix" : "watch",
    };
  }
  if (kind === "tiered_downgrade_high_nqual" || kind === "tiered_downgrade_majority_not_qualified") {
    return {
      ...base,
      description: "A large share of tiered volume did not qualify for the best visible tier. Ask why and request transparent interchange-plus pricing.",
      severity: "watch",
    };
  }
  if (kind === "authorization_ratio_high") {
    return {
      ...base,
      description: "The authorization count is high compared with settled transactions. Review terminal, gateway, or online-ordering settings that may be creating extra authorizations.",
      severity: severity === "high" ? "fix" : "watch",
    };
  }
  if (kind === "dispute_activity_high") {
    return {
      ...base,
      description: "Chargeback, ACH reject, or funding adjustment activity is elevated. Review the operational cause before negotiating pricing.",
      severity: severity === "high" ? "fix" : "watch",
    };
  }
  if (kind === "effective_rate_above_benchmark" || kind === "bundled_effective_rate_above_benchmark" || kind === "bundled_pricing_savings_opportunity") {
    return {
      ...base,
      description: "The percentage of sales you paid in fees appears above benchmark. Use this as pricing leverage and request a transparent quote.",
      severity: severity === "high" ? "fix" : "watch",
    };
  }
  if (kind === "third_party_service_fee" || kind === "ai_fee_assessment") {
    return {
      ...base,
      description: feeReferenceDescription(title, "Confirm whether this service is active, contracted, and useful. If not, ask to cancel it and remove the fee."),
      severity: severity === "high" ? "fix" : "watch",
    };
  }

  return null;
}

function suppressedFiservFindingKind(kind: string): boolean {
  return [
    "authorization_ratio_healthy",
    "ai_fee_assessment",
    "bundled_effective_rate_above_benchmark",
    "card_not_present_detected",
    "effective_rate_positive_benchmark",
    "new_account_pricing_context",
    "normalization_ai_candidates",
    "pricing_model_pending_rules",
    "single_tier_qualified_structure",
    "tiered_downgrade_high_nqual",
    "tiered_downgrade_majority_not_qualified",
  ].includes(kind);
}

function customerFindingTitle(kind: string, title: string): string {
  if (kind === "per_auth_fee_benchmark" || kind === "processor_per_item_stacking") {
    return "Your per-transaction fee is high. Negotiate this.";
  }
  if (kind === "rate_exceeds_reference" || kind === "suspicious_uniform_rate") {
    return documentationFindingTitle(title);
  }
  if (kind === "hidden_percentage_markup") {
    return "Ask to remove hidden percentage markup.";
  }
  if (kind === "tiered_downgrade_cost") {
    return "Your higher-tier rates are costing you.";
  }
  if (kind === "tiered_downgrade_high_nqual" || kind === "tiered_downgrade_majority_not_qualified") {
    return "Your higher-tier volume is worth reviewing.";
  }
  if (kind === "authorization_ratio_high") {
    return "Your authorization count looks unusually high.";
  }
  if (kind === "dispute_activity_high") {
    return "Review chargebacks and funding adjustments.";
  }
  if (kind === "effective_rate_above_benchmark" || kind === "bundled_effective_rate_above_benchmark" || kind === "bundled_pricing_savings_opportunity") {
    return "Your pricing may be above market.";
  }
  if (kind === "third_party_service_fee" || kind === "ai_fee_assessment") {
    return "Cancel this service if you don't use it.";
  }
  if (kind === "avoidable_compliance_fee") {
    return "Fix PCI validation, then ask to remove the fee.";
  }
  if (kind === "penalty_or_configuration_fee") {
    return "Ask what caused this fee.";
  }
  if (kind === "junk_fee" || kind === "junk_fixed_fee_summary") {
    return `Ask to remove ${feeNameForSentence(title)}.`;
  }
  return sentenceCaseTitle(title);
}

function documentationFindingTitle(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes("mastercard assessment")) return "Mastercard assessment fee needs documentation.";
  if (normalized.includes("network authorization")) return "Network authorization fee needs documentation.";
  if (normalized.includes("visa")) return "Visa network fee needs documentation.";
  if (normalized.includes("mastercard")) return "Mastercard network fee needs documentation.";
  if (normalized.includes("amex") || normalized.includes("american express")) return "American Express network fee needs documentation.";
  if (normalized.includes("discover")) return "Discover network fee needs documentation.";
  return "Card brand fee needs documentation.";
}

function removeDuplicatedEvidence(finding: CustomerFinding): CustomerFinding {
  if (!finding.evidenceSummary) return finding;
  const description = normalizeEvidenceText(finding.description);
  const evidence = normalizeEvidenceText(finding.evidenceSummary);
  if (!description || !evidence) return finding;
  if (description === evidence || description.startsWith(evidence) || evidence.startsWith(description)) {
    const { evidenceSummary: _evidenceSummary, ...rest } = finding;
    void _evidenceSummary;
    return rest;
  }
  return finding;
}

function normalizeEvidenceText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function feeNameForSentence(value: string): string {
  const cleaned = value
    .replace(/\bis\s+avoidable\s+or\s+negotiable\b/gi, "")
    .replace(/\bmay\s+be\s+avoidable\b.*$/gi, "")
    .replace(/\bis\s+a\s+third-party\s+service\s+fee\b/gi, "")
    .replace(/\bexceeds\s+the\s+reference\s+rate\b/gi, "")
    .replace(/\badds\s+hidden\s+percentage\s+markup\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return "this fee";
  if (/\b(fee|charge|markup|dues|assessment|product)\b/i.test(cleaned)) return `the ${cleaned}`;
  return `the ${cleaned} fee`;
}

function sentenceCaseTitle(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "Fee worth reviewing.";
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1).toLowerCase()}`;
}

function allowNonDollarFiservFinding(kind: string): boolean {
  return [
    "tiered_downgrade_high_nqual",
    "tiered_downgrade_majority_not_qualified",
    "bundled_effective_rate_above_benchmark",
  ].includes(kind);
}

function componentForFinding(components: Record<string, unknown>[], kind: string, title: string): Record<string, unknown> | null {
  const normalizedTitle = normalizeId(title);
  return (
    components.find((component) => {
      const normalizedLabel = normalizeId(stringValue(component.label));
      return normalizedLabel === normalizedTitle || normalizedLabel.includes(normalizedTitle) || normalizedTitle.includes(normalizedLabel);
    }) ?? null
  );
}

function monthlyAmountForFinding(
  kind: string,
  finding: Record<string, unknown>,
  amount: number | null,
  annualImpact: number | null,
): number | null {
  const monthlyCost = positiveOrNull(finding.monthlyCost);
  if (monthlyCost !== null) return monthlyCost;
  if (kind === "effective_rate_above_benchmark" || kind === "bundled_effective_rate_above_benchmark") {
    return annualImpact !== null ? round2(annualImpact / 12) : null;
  }
  return amount !== null ? amount : annualImpact !== null ? round2(annualImpact / 12) : null;
}

function annualFromFinding(finding: Record<string, unknown>, amount: number | null): number | null {
  const directAnnual = positiveOrNull(finding.annualEstimate);
  if (directAnnual !== null) return directAnnual;
  const component = recordOrNull(finding.componentImpactEstimate);
  const low = positiveOrNull(component?.low);
  const high = positiveOrNull(component?.high);
  if (low !== null && high !== null) return round2((low + high) / 2);
  if (high !== null) return high;
  if (amount !== null) return round2(amount * 12);
  return null;
}

function confidenceForFiservFinding(finding: Record<string, unknown>, component: Record<string, unknown> | null): CustomerConfidence {
  const componentConfidence = stringValue(component?.confidence);
  if (componentConfidence === "high") return "high";
  if (componentConfidence === "medium") return "medium";
  return stringValue(finding.severity) === "high" ? "high" : "medium";
}

function firstEvidence(finding: Record<string, unknown>): string | undefined {
  const evidence = Array.isArray(finding.evidence) ? finding.evidence.find((item) => typeof item === "string" && item.trim()) : null;
  return typeof evidence === "string" ? safeEvidence(evidence) : undefined;
}

function cleanFindingTitle(value: string): string {
  return displayFeeLabel(
    value
      .replace(/^\*+/, "")
      .replace(/\b(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+PAPER\s+STATEME(?:NT)?\b/gi, "PAPER STATEMENT FEE")
      .replace(/\s+\d+\s+TRANSACTIONS?\s+AT\s+\.?\d+(?:\.\d+)?/gi, "")
      .replace(/\s+\d+\s+ITEMS?\s+AT\s+\.?\d+(?:\.\d+)?/gi, "")
      .replace(/\s+TIMES\s+\$?\d[\d,.]*/gi, "")
      .replace(/\b\d{6,}\b/g, "")
      .replace(/\s+\$?\d[\d,.]*\s+(?:VOLUME|VOL)\b/gi, "")
      .replace(/\s+\d+\.\d{3,}\b/g, "")
      .replace(/\s+\$?\d[\d,.]*$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordOrNull).filter((item): item is Record<string, unknown> => item !== null) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
    message: "We could read this statement clearly enough to show the verified report below.",
  };
}

export function cleanChecks(summary: AnalysisSummary | undefined, count: number): CustomerFinding[] {
  const checks: CustomerFinding[] = [];
  if (canShowEffectiveRate(summary).allowed && summary?.benchmark?.status !== "above") {
    checks.push({
      id: "clean_effective_rate",
      title: "Your rate is within benchmark.",
      description: "The percentage of sales you paid in fees is within the selected business benchmark.",
      severity: "clean",
      confidence: "high",
    });
  }
  if (canShowTwoBucketSplit(summary).allowed) {
    checks.push({
      id: "clean_fee_split",
      title: "Fee split is readable",
      description: "Card brand and processor-controlled fees reconcile clearly enough to review.",
      severity: "clean",
      confidence: "high",
    });
  }
  if ((summary?.structuredFeeFindings ?? []).length === 0 && (summary?.suspiciousFees ?? []).length === 0) {
    checks.push({
      id: "clean_no_approved_flags",
      title: "No fees flagged this month.",
      description: "We didn't flag anything on this statement. Upload another month to see if a pattern emerges.",
      severity: "clean",
      confidence: "high",
    });
  }
  while (checks.length < count) {
    checks.push({
      id: `data_quality_${checks.length + 1}`,
      title: "No additional fee issue found.",
      description: "We leave uncertain diagnostics out of the report instead of showing weak findings.",
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
    if (canUseNeedsReviewFiservReport(summary)) return null;
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

function canUseNeedsReviewFiservReport(summary: AnalysisSummary): boolean {
  const reason = summary.parserDecision?.reason ?? "";
  const analysis = recordOrNull(summary.fiservFeeAnalysisV2);
  const reconciliation = recordOrNull(analysis?.reconciliation);
  const reconciliationStatus = stringValue(reconciliation?.status);
  return (
    summary.parserDecision?.status === "needs_review" &&
    /supportingVolumeAgreement/i.test(reason) &&
    isPositiveFinite(summary.totalVolume) &&
    isPositiveFinite(summary.totalFees) &&
    isPositiveFinite(summary.effectiveRate) &&
    (summary.feeBreakdown?.length ?? 0) > 0 &&
    arrayOfRecords(analysis?.findings).length > 0 &&
    (reconciliationStatus === "pass" || reconciliationStatus === "warning")
  );
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
  if (kind === "pci_non_compliance") return "Fix PCI validation, then ask to remove the fee.";
  if (kind === "customer_intelligence_suite") return "Cancel this service if you don't use it.";
  if (kind === "non_emv") return "Ask what caused this non-EMV fee.";
  if (kind === "risk_fee") return "Ask why this risk fee applies.";
  return displayFeeLabel(fallback);
}

function findingDescription(kind: StructuredFeeFinding["kind"]): string {
  if (kind === "pci_non_compliance") return "Confirm your PCI status. Once corrected, ask your processor to remove the fee.";
  if (kind === "customer_intelligence_suite") return "Confirm whether this service is active, contracted, and useful. If not, ask to cancel it and remove the fee.";
  if (kind === "non_emv") return "This fee is tied to card acceptance setup. Ask what caused it and how to prevent it.";
  if (kind === "risk_fee") return "Ask your processor to explain why this risk fee applies and what would remove it.";
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
