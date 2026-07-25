import { singleStatementReportV1Policy, type SingleStatementReportV1Policy } from "./policyConfig.js";
import type {
  BenchmarkPresentation,
  ConfidenceLevel,
  DataQualitySummary,
  OpportunitySummary,
  ReconciliationSummary,
  ReportFinding,
  ReportMetrics,
  ReportState,
  ReportStateReasonCode,
} from "./types.js";

export type ResolveReportStateInput = {
  dataQuality: DataQualitySummary;
  reconciliation: ReconciliationSummary;
  metrics: ReportMetrics;
  benchmark: BenchmarkPresentation;
  opportunitySummary: OpportunitySummary;
  findings: ReportFinding[];
  evaluatedAt: string;
  analysisFailed?: boolean;
  policy?: SingleStatementReportV1Policy;
};

export function resolveReportState(input: ResolveReportStateInput): ReportState {
  const policy = input.policy ?? singleStatementReportV1Policy;
  const confidence = input.dataQuality.overallConfidence;
  const coreValuesApproved = coreMetricsApproved(input.metrics);

  if (input.analysisFailed || !input.dataQuality.reportable || !input.dataQuality.customerFacingTotalsAllowed || !coreValuesApproved) {
    return state("unable_to_analyze", principalUnableReason(input), confidence, input.evaluatedAt);
  }

  if (input.reconciliation.status === "fail") {
    return state("reconciliation_failure", reconciliationReason(input.reconciliation), confidence, input.evaluatedAt);
  }

  if (confidence === "low" || !input.dataQuality.feeClassificationAllowed) {
    return state("low_confidence", confidence === "low" ? "analysis_confidence_low" : "fee_coverage_insufficient", confidence, input.evaluatedAt);
  }

  const materialOpportunityReason = materialOverpaymentReason(input, policy);
  if (verificationRequired(input, policy) && !materialOpportunityReason) {
    return state("verification_required", "material_verification_amount", confidence, input.evaluatedAt);
  }

  if (materialOpportunityReason) {
    return state("material_overpayment", materialOpportunityReason, confidence, input.evaluatedAt);
  }

  if (input.benchmark.eligible && input.benchmark.status === "above") {
    return state("above_benchmark_review", "rate_above_benchmark", confidence, input.evaluatedAt);
  }

  if (!input.benchmark.eligible || input.benchmark.status === "unavailable") {
    return state("low_confidence", "benchmark_unavailable", lowerConfidence(confidence, "medium"), input.evaluatedAt);
  }

  const hasActionableFinding = input.findings.some(
    (finding) =>
      finding.includedInOpportunityTotal &&
      finding.confidence !== "low" &&
      (finding.impactClassification === "deterministic" || finding.impactClassification === "estimated"),
  );
  if (hasActionableFinding) {
    return state("healthy_with_opportunities", "competitive_rate_with_findings", confidence, input.evaluatedAt);
  }

  if (input.reconciliation.status !== "pass") {
    return state("low_confidence", "fee_coverage_insufficient", lowerConfidence(confidence, "medium"), input.evaluatedAt);
  }

  return state("healthy", "competitive_rate_no_findings", confidence, input.evaluatedAt);
}

function state(code: ReportState["code"], reason: ReportStateReasonCode, confidence: ConfidenceLevel, evaluatedAt: string): ReportState {
  return {
    code,
    reasons: [reason],
    confidence,
    evaluatedAt,
  };
}

function coreMetricsApproved(metrics: ReportMetrics): boolean {
  return metrics.processedSales.value !== null && metrics.totalFees.value !== null && metrics.effectiveRate.value !== null;
}

function principalUnableReason(input: ResolveReportStateInput): ReportStateReasonCode {
  if (input.analysisFailed) return "unreadable_document";
  if (!input.dataQuality.reportable || !input.dataQuality.customerFacingTotalsAllowed) return "parser_blocked";
  return "missing_core_totals";
}

function reconciliationReason(reconciliation: ReconciliationSummary): ReportStateReasonCode {
  if (reconciliation.coveragePct.value !== null && reconciliation.coveragePct.value < singleStatementReportV1Policy.reconciliation.minimumCoveragePct) {
    return "fee_coverage_insufficient";
  }
  return "reconciliation_delta_exceeded";
}

function materialOverpaymentReason(input: ResolveReportStateInput, policy: SingleStatementReportV1Policy): ReportStateReasonCode | null {
  const annual = input.opportunitySummary.totalEligibleAnnualOpportunityUsd;
  const monthly = input.opportunitySummary.totalEligibleMonthlyOpportunityUsd;
  const totalFees = input.metrics.totalFees.value;
  const benchmarkGap = input.benchmark.deltaFromUpperRate ?? 0;
  if (annual >= policy.materialOverpayment.minimumEligibleAnnualOpportunityUsd) return "material_processor_cost";
  if (
    totalFees !== null &&
    totalFees > 0 &&
    monthly >= totalFees * (policy.materialOverpayment.minimumMonthlyOpportunityShareOfFeesPct / 100) &&
    annual >= policy.materialOverpayment.minimumAnnualOpportunityForShareRuleUsd
  ) {
    return "material_processor_cost";
  }
  if (
    input.benchmark.eligible &&
    input.benchmark.status === "above" &&
    benchmarkGap >= policy.materialOverpayment.minimumBenchmarkGapPercentagePoints &&
    input.opportunitySummary.estimatedAnnualOpportunityUsd >= policy.materialOverpayment.minimumModeledAnnualOpportunityForBenchmarkRuleUsd
  ) {
    return "material_benchmark_gap";
  }
  return null;
}

function verificationRequired(input: ResolveReportStateInput, policy: SingleStatementReportV1Policy): boolean {
  const totalFees = input.metrics.totalFees.value;
  const annualized = input.opportunitySummary.verificationAnnualizedAmountUsd ?? 0;
  if (annualized >= policy.materialVerification.minimumAnnualizedAmountUsd) return true;
  if (totalFees !== null && totalFees > 0) {
    return input.opportunitySummary.verificationMonthlyAmountUsd >= totalFees * (policy.materialVerification.minimumMonthlyShareOfFeesPct / 100);
  }
  return false;
}

function lowerConfidence(left: ConfidenceLevel, right: ConfidenceLevel): ConfidenceLevel {
  const rank: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };
  return rank[left] <= rank[right] ? left : right;
}
