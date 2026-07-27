import {
  CUSTOMER_BENCHMARK_POLICY_VERSION,
  CUSTOMER_STATE_MATERIALITY_POLICY_VERSION,
} from "./customerStateTypes.js";
import { decimalRate } from "./money.js";
import { zeroMoney } from "./opportunityPolicy.js";
import type {
  CanonicalAiCapabilityLayer,
  CanonicalCustomerAxisProjection,
  CanonicalCustomerDataIntegrity,
  CanonicalCustomerMateriality,
  CanonicalCustomerPrimaryState,
  CanonicalCustomerRateComparison,
  CanonicalFinancialFacts,
  CanonicalOpportunityComponent,
  CanonicalOpportunitySummary,
  CanonicalStatementIdentity,
  MoneyAmount,
} from "./types.js";

export function unavailableRateComparison(reasonCode = "qualified_benchmark_unavailable"): CanonicalCustomerRateComparison {
  return {
    policyVersion: CUSTOMER_BENCHMARK_POLICY_VERSION,
    status: "unavailable",
    position: "unavailable",
    benchmarkRef: null,
    calculationRef: null,
    evidenceRefs: [],
    reasonCodes: [reasonCode],
    aiSourced: false,
  };
}

export function coreFactsUnsafe(input: { financialFacts: CanonicalFinancialFacts; identity: CanonicalStatementIdentity }): boolean {
  return (
    input.financialFacts.processedSales.status !== "selected" ||
    input.financialFacts.processedSales.value === null ||
    input.financialFacts.processedSales.value.amountMinor <= 0 ||
    input.financialFacts.totalFees.status !== "selected" ||
    input.financialFacts.totalFees.value === null ||
    input.financialFacts.rateRevealCalculatedAllInRate.status !== "selected" ||
    input.financialFacts.rateRevealCalculatedAllInRate.value === null ||
    input.financialFacts.effectiveRateBasis.numeratorFeeBasis === "unsupported" ||
    input.financialFacts.effectiveRateBasis.denominatorVolumeBasis === "unsupported" ||
    input.financialFacts.effectiveRateBasis.populationCompatibility === "incompatible" ||
    input.identity.statementPeriod.status !== "selected" ||
    input.identity.statementPeriod.value === null
  );
}

export function resolveDataIntegrity(input: {
  coreUnsafe: boolean;
  feeLedgerStatus: "available" | "partial" | "unavailable";
  controlStatuses: Array<"pass" | "pass_with_rounding" | "limited" | "verification_required" | "blocked">;
}): CanonicalCustomerDataIntegrity {
  if (input.coreUnsafe) return "unavailable";
  if (input.controlStatuses.includes("blocked")) return "failed";
  if (input.feeLedgerStatus !== "available" || input.controlStatuses.some((status) => status === "limited" || status === "verification_required")) {
    return "partially_reconciled";
  }
  return "reconciled";
}

export function resolveAxes(input: {
  coreUnsafe: boolean;
  dataIntegrity: CanonicalCustomerDataIntegrity;
  aiCapabilities: CanonicalAiCapabilityLayer;
  rateComparison: CanonicalCustomerRateComparison;
  materiality: CanonicalCustomerMateriality;
  opportunitySummary: CanonicalOpportunitySummary;
  verificationActionable: boolean;
}): CanonicalCustomerAxisProjection {
  const analysisReadiness = (() => {
    if (input.coreUnsafe) return "unavailable" as const;
    if (input.aiCapabilities.summary.financialReadiness === "withheld") return "withheld" as const;
    if (input.dataIntegrity === "failed" || input.dataIntegrity === "partially_reconciled") return "limited" as const;
    if (input.aiCapabilities.summary.financialReadiness === "limited" && !limitedOnlyByBenchmark(input.aiCapabilities)) return "limited" as const;
    return "verified" as const;
  })();

  const eligibleAmount = input.opportunitySummary.totalEligibleAnnualAmount.amountMinor;
  const opportunityPosture = (() => {
    if (analysisReadiness === "unavailable" || analysisReadiness === "withheld" || input.dataIntegrity !== "reconciled") return "unavailable" as const;
    if (input.materiality.material) return "material_eligible_opportunity" as const;
    if (eligibleAmount > 0) return "eligible_opportunity" as const;
    if (input.verificationActionable) return "verification_only" as const;
    return "none" as const;
  })();

  return {
    analysisReadiness,
    dataIntegrity: input.dataIntegrity,
    ratePosition: analysisReadiness === "verified" && input.rateComparison.status === "qualified" ? input.rateComparison.position : "unavailable",
    opportunityPosture,
    explanationReadiness: input.aiCapabilities.summary.explanationReadiness,
  };
}

export function resolvePrimaryState(input: {
  coreUnsafe: boolean;
  axes: CanonicalCustomerAxisProjection;
  rateComparison: CanonicalCustomerRateComparison;
  opportunitySummary: CanonicalOpportunitySummary;
  verificationActionable: boolean;
}): CanonicalCustomerPrimaryState {
  if (input.coreUnsafe) return "unable_to_analyze";
  if (input.axes.analysisReadiness === "withheld") return "analysis_withheld";
  if (input.axes.analysisReadiness === "limited" || input.axes.dataIntegrity === "partially_reconciled") return "analysis_limited";
  if (input.axes.opportunityPosture === "material_eligible_opportunity") return "material_fee_opportunity";
  const eligible = input.opportunitySummary.totalEligibleAnnualAmount.amountMinor > 0;
  if (input.axes.ratePosition === "above_reference" && eligible) return "rate_review_with_opportunity";
  if (input.axes.ratePosition === "above_reference") return "rate_review_needed";
  if (input.verificationActionable) return "verification_needed";
  if ((input.axes.ratePosition === "within_reference" || input.axes.ratePosition === "below_reference") && eligible) return "competitive_with_opportunity";
  if (input.axes.ratePosition === "unavailable" && eligible) return "fee_opportunity_identified";
  if (input.axes.ratePosition === "within_reference" || input.axes.ratePosition === "below_reference") return "competitive_no_opportunity";
  return "verified_benchmark_unavailable";
}

export function buildCustomerMateriality(input: {
  financialFacts: CanonicalFinancialFacts;
  identity: CanonicalStatementIdentity;
  opportunitySummary: CanonicalOpportunitySummary;
}): CanonicalCustomerMateriality {
  const annualEligibleOpportunity = input.opportunitySummary.totalEligibleAnnualAmount;
  const frequency = monthlyStatementFrequency(input.identity);
  const annualizedTotalFees = annualizeMoney(input.financialFacts.totalFees.value, frequency, annualEligibleOpportunity.currency);
  const annualizedProcessedVolume = annualizeMoney(input.financialFacts.processedSales.value, frequency, annualEligibleOpportunity.currency);
  const totalFeesRatio = annualizedTotalFees ? decimalRate(annualEligibleOpportunity, annualizedTotalFees, 6) : null;
  const processedVolumeRatio = annualizedProcessedVolume ? decimalRate(annualEligibleOpportunity, annualizedProcessedVolume, 6) : null;
  const ratioPass =
    (totalFeesRatio !== null && Number(totalFeesRatio) >= 0.1) ||
    (processedVolumeRatio !== null && Number(processedVolumeRatio) >= 0.002);
  const thresholdPass =
    annualEligibleOpportunity.amountMinor >= 100000 &&
    (annualizedTotalFees && annualizedProcessedVolume ? ratioPass : annualEligibleOpportunity.amountMinor >= 500000);

  return {
    policyVersion: CUSTOMER_STATE_MATERIALITY_POLICY_VERSION,
    material: thresholdPass,
    annualEligibleOpportunity,
    annualizedTotalFees,
    annualizedProcessedVolume,
    totalFeesRatio,
    processedVolumeRatio,
    usedFallbackThreshold: !(annualizedTotalFees && annualizedProcessedVolume),
    reasonCodes: thresholdPass ? ["materiality_threshold_met"] : ["materiality_threshold_not_met"],
  };
}

export function visibleEligibleSummaryForLimitedOrWithheld(summary: CanonicalOpportunitySummary): CanonicalOpportunitySummary {
  return {
    ...summary,
    deterministicEligibleAnnualAmount: zeroMoney(),
    approvedEstimatedAnnualAmount: zeroMoney(),
    totalEligibleAnnualAmount: zeroMoney(),
    masterSavingsAnnualAmount: zeroMoney(),
    deterministicComponentIds: [],
    approvedEstimatedComponentIds: [],
    summaryCalculationRefs: [],
    limitations: [...summary.limitations, "Eligible opportunity totals are hidden when Package G analysis readiness is limited or withheld."],
  };
}

export function hasActionableVerification(components: CanonicalOpportunityComponent[], actionComponentRefs: string[]): boolean {
  const actionRefs = new Set(actionComponentRefs);
  return components.some(
    (component) =>
      component.eligibility === "verification_only" &&
      actionRefs.has(component.id) &&
      (component.observedAmount?.amount.amountMinor ?? 0) > 0 &&
      component.feeRowRefs.length > 0 &&
      component.evidenceRefs.length > 0,
  );
}

function limitedOnlyByBenchmark(aiCapabilities: CanonicalAiCapabilityLayer): boolean {
  const codes = new Set(aiCapabilities.summary.limitationCodes);
  return codes.size > 0 && [...codes].every((code) => code === "benchmark_category_not_verified" || code === "deterministic_explanation_available");
}

function monthlyStatementFrequency(identity: CanonicalStatementIdentity): number | null {
  const period = identity.statementPeriod.value;
  if (!period) return null;
  const start = Date.parse(`${period.start}T00:00:00Z`);
  const end = Date.parse(`${period.end}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days >= 28 && days <= 31 ? 12 : null;
}

function annualizeMoney(value: MoneyAmount | null, frequency: number | null, currency: MoneyAmount["currency"]): MoneyAmount | null {
  if (!value || frequency === null || value.currency !== currency) return null;
  return { amountMinor: value.amountMinor * frequency, currency: value.currency };
}
