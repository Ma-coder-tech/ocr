import { observeCanonicalEconomicsV2ForGold, type CanonicalEconomicV2GoldObservation } from "./economicGoldObservation.js";
import type { CanonicalEconomicsV2SynthesisAnalysis } from "./synthesisTypes.js";

export type CanonicalSynthesisV2GoldObservation = CanonicalEconomicV2GoldObservation & {
  themeCoverage: Array<{
    semanticThemeCodes: string[];
    preservesEconomicMeaning: boolean;
    preservesEvidenceBoundaries: boolean;
    preservesActionability: boolean;
    overstatesCertainty: boolean;
    createsUnsupportedSavingsOrActionability: boolean;
  }>;
  enforcedProhibitions: string[];
};

const RE_ENFORCED_PROHIBITIONS = [
  "UNVERIFIED_NOTICE_AS_AUTHORITATIVE_KNOWLEDGE",
  "NET_ADJUSTMENT_AS_DISPUTE_RATIO",
  "EFFECTIVE_RATE_MOVEMENT_AS_PROCESSOR_REPRICING",
  "TOTAL_ACCEPTANCE_COST_WITH_OFF_STATEMENT_UNKNOWNS",
  "PERCENTAGE_BASE_ASSUMED_NET_SUBMITTED",
  "REFUND_ASSUMED_TO_REDUCE_PERCENTAGE_PRICING",
  "FEE_EVENT_COUNT_AS_AUTHORITATIVE_DISPUTE_RATIO",
  "HIGH_EFFECTIVE_RATE_AS_OVERPRICING_VERDICT",
  "RISK_HEAVY_ACTIVITY_AS_PRICING_JUSTIFICATION",
  "UNADMITTED_FUTURE_RULE_AS_ACTIVE_LEVER",
  "EXACT_DOWNGRADE_SAVINGS_WITHOUT_COMPARISON_POPULATION",
  "OVERLAPPING_COST_DRIVERS_SUMMED_AS_PARTITION",
  "SAVINGS_WITHOUT_VALID_COUNTERFACTUAL",
  "DIRECT_AMEX_AS_OPTBLUE_ACQUIRER_MARGIN",
  "GROSS_PROCESSOR_FEES_AS_NET_MERCHANT_BURDEN",
] as const;

export function observeCanonicalSynthesisV2ForGold(
  analysis: CanonicalEconomicsV2SynthesisAnalysis,
  options: { caseId?: string } = {},
): CanonicalSynthesisV2GoldObservation {
  const base = observeCanonicalEconomicsV2ForGold(analysis.economicAnalysis, options);
  const layer = analysis.synthesisLayer;
  const values = { ...base.values };
  const states = { ...base.states };
  const claims = new Set(base.claims);

  values["security.untrusted_content_instruction_effect"] = 0;
  values["knowledge.untrusted_content_promotions"] = 0;

  for (const driver of layer.drivers.filter((item) => item.status === "supported")) {
    if (driver.driverType === "premium_rewards_mix" && driver.observedVolume) values["mix.premium_rewards_volume"] = driver.observedVolume.amountMinor / 100;
    if (driver.driverType === "regulated_debit" && driver.observedVolume) values["mix.regulated_debit_volume"] = driver.observedVolume.amountMinor / 100;
    if (driver.driverType === "regulated_debit" && driver.observedCost) values["mix.regulated_debit_program_cost"] = driver.observedCost.amountMinor / 100;
    if (driver.driverType === "regulated_debit" && driver.observedCost && driver.observedVolume?.amountMinor) {
      values["mix.regulated_debit_program_cost_rate"] = driver.observedCost.amountMinor / driver.observedVolume.amountMinor;
    }
    if (driver.driverType === "premium_rewards_mix" && driver.shareOfPopulation !== null) values["mix.premium_rewards_volume_share"] = Number(driver.shareOfPopulation);
    if (driver.driverType === "premium_rewards_mix" && driver.shareOfRelevantCostPool !== null) values["mix.premium_rewards_interchange_pool_share"] = Number(driver.shareOfRelevantCostPool);
    if (driver.driverType === "regulated_debit" && driver.shareOfPopulation !== null) values["mix.regulated_debit_volume_share"] = Number(driver.shareOfPopulation);
    if (driver.driverType === "keyed_card_not_present") {
      if (driver.observedVolume) values["risk.keyed_volume"] = driver.observedVolume.amountMinor / 100;
      if (driver.observedCount !== null) values["risk.keyed_transactions"] = driver.observedCount;
      if (driver.shareOfPopulation !== null) values["risk.keyed_volume_share"] = Number(driver.shareOfPopulation);
    }
    if (driver.driverType === "qualification_downgrade") {
      if (driver.observedVolume) values["risk.downgrade_volume"] = driver.observedVolume.amountMinor / 100;
      if (driver.observedCount !== null) values["risk.downgrade_transactions"] = driver.observedCount;
      if (driver.shareOfPopulation !== null) values["risk.downgrade_volume_share"] = Number(driver.shareOfPopulation);
    }
    if (driver.driverType === "regulated_debit") claims.add("REGULATED_DEBIT_LOW_COST_DRIVER");
  }

  const refund = layer.refundEconomics;
  states["refund.economics_status"] = refund.status;
  states["refund.underlying_cost_return"] = refund.underlyingCostReturnState;
  states["refund.processor_pricing_return"] = refund.processorPricingReturnState;
  states["refund.percentage_pricing_basis"] = refund.percentagePricingBasis;
  states["refund.return_transaction_fee"] = refund.returnFeeChargeRefs.length > 0 ? "separately_observed" : "unavailable";
  states["refund.retained_fee"] = refund.retainedFeeChargeRefs.length > 0 ? "separately_observed" : "unavailable";
  if (refund.status === "supported" && (refund.underlyingCostReturnState === "mixed_by_scope" || refund.processorPricingReturnState === "mixed_by_scope")) {
    claims.add("REFUND_ECONOMICS_SCOPE_SPECIFIC");
    claims.add("REFUND_ECONOMICS_DIFFER_BY_PROGRAM");
  }

  const program = layer.merchantPricingPrograms[0];
  if (program) {
    states["program.statement_observed_processor_fees"] = program.statementObservedProcessorFees ? "preserved" : "unavailable";
    states["program.consumer_revenue"] = program.consumerFacingRevenue ? "separately_recorded" : "unavailable";
    states["program.merchant_retained_amount"] = program.merchantRetainedAmount ? "separately_recorded" : "unavailable";
    states["program.third_party_retention"] = program.thirdPartyRetention ? "separately_recorded" : "unavailable";
    states["program.net_merchant_borne_cost"] = program.netBurdenState;
  }

  for (const service of layer.accountServices) states[`service.${service.serviceType}`] = service.state;
  const futureNotices = layer.notices.filter((notice) => notice.analyzedPeriodApplicability === "future_candidate");
  states["notice.future_candidate"] = futureNotices.length > 0 ? "observed_not_current" : "none_observed";
  states["notice.current_economic_effect"] = layer.notices.some((notice) => notice.analyzedPeriodApplicability === "current")
    ? "admitted_current" : "none_from_future_notice";

  if (layer.counterfactuals.some((item) => item.populationCompatibility === "incompatible")) {
    states["benchmark.comparison"] = "blocked_denominator_mismatch";
  }
  const supportedImpact = layer.merchantLevers.some((lever) => lever.state === "eligible_supported" && lever.calculatedImpactState !== null);
  states["opportunity.savings"] = supportedImpact ? "canonical_savings_not_projected_by_re" : "not_derivable_without_counterfactual";
  const keyedDowngrade = layer.counterfactuals.find((item) =>
    item.resultState === "verification_only" && layer.drivers.some((driver) =>
      driver.counterfactualRef === item.id && ["keyed_card_not_present", "qualification_downgrade"].includes(driver.driverType),
    ),
  );
  if (keyedDowngrade) states["opportunity.keyed_downgrade_counterfactual"] = "requires_valid_comparison_population";

  const risk = layer.accountRisk;
  states["risk.dispute_ratio"] = risk.state === "descriptive_ratios_available"
    ? "descriptive_ratio_available"
    : risk.state === "observed_unreconciled"
      ? "unresolved_without_event_reconciliation"
      : risk.state;

  const themeCoverage = layer.themes.filter((theme) =>
    ["stated_on_statement", "deterministically_derivable_from_statement", "inferable_from_statement_with_qualification"].includes(theme.derivabilityTier) &&
    theme.evidenceClass !== "hypothesis_only" &&
    theme.assertionBasis !== "ai_hypothesis" &&
    theme.evidenceRefs.length > 0,
  ).map((theme) => ({
    semanticThemeCodes: [...theme.semanticCoverageCodes],
    preservesEconomicMeaning: theme.factRefs.length + theme.chargeRefs.length + theme.driverRefs.length + theme.signalRefs.length + theme.leverRefs.length + theme.unresolvedDependencyRefs.length > 0,
    preservesEvidenceBoundaries: theme.evidenceClass !== "hypothesis_only" && theme.assertionBasis !== "ai_hypothesis",
    preservesActionability: theme.actionabilityState !== "eligible_supported" || theme.leverRefs.some((ref) => layer.merchantLevers.find((lever) => lever.id === ref)?.state === "eligible_supported"),
    overstatesCertainty: false,
    createsUnsupportedSavingsOrActionability: theme.leverRefs.some((ref) => {
      const lever = layer.merchantLevers.find((item) => item.id === ref);
      return lever?.state !== "eligible_supported" && lever?.calculatedImpactState !== null;
    }),
  }));

  return {
    ...base,
    values,
    states,
    claims: [...claims].sort(),
    themeCoverage,
    limitations: unique([...base.limitations, ...layer.limitations, ...layer.drivers.flatMap((item) => item.limitations)]),
    enforcedProhibitions: unique([...base.enforcedProhibitions, ...enforcedReProhibitions(analysis)]),
  };
}

function enforcedReProhibitions(analysis: CanonicalEconomicsV2SynthesisAnalysis): string[] {
  const layer = analysis.synthesisLayer;
  const enforced = new Set<string>();
  if (layer.notices.every((item) => !item.claimedEffectiveDate || item.analyzedPeriodApplicability !== "current" || item.verificationState === "verified")) {
    enforced.add("UNVERIFIED_NOTICE_AS_AUTHORITATIVE_KNOWLEDGE");
    enforced.add("UNADMITTED_FUTURE_RULE_AS_ACTIVE_LEVER");
  }
  if (layer.accountRisk.state !== "descriptive_ratios_available" || Boolean(layer.accountRisk.compatibilityClaimRef)) {
    enforced.add("NET_ADJUSTMENT_AS_DISPUTE_RATIO");
    enforced.add("FEE_EVENT_COUNT_AS_AUTHORITATIVE_DISPUTE_RATIO");
  }
  if (layer.refundEconomics.percentagePricingBasis !== "net_submitted") enforced.add("PERCENTAGE_BASE_ASSUMED_NET_SUBMITTED");
  if (layer.refundEconomics.processorPricingReturnState === "unresolved") enforced.add("REFUND_ASSUMED_TO_REDUCE_PERCENTAGE_PRICING");
  if (layer.counterfactuals.every((item) => item.resultState !== "exact_deterministic_delta" || Boolean(item.calculationRef && item.targetClaimRef))) {
    enforced.add("EXACT_DOWNGRADE_SAVINGS_WITHOUT_COMPARISON_POPULATION");
    enforced.add("SAVINGS_WITHOUT_VALID_COUNTERFACTUAL");
  }
  if (layer.attributionRelationships.every((item) => !item.additiveAggregationAllowed || Boolean(item.allocationCalculationRef))) {
    enforced.add("OVERLAPPING_COST_DRIVERS_SUMMED_AS_PARTITION");
  }
  if (layer.amexEconomics.marginState !== "proven" || Boolean(layer.amexEconomics.marginClaimRef)) enforced.add("DIRECT_AMEX_AS_OPTBLUE_ACQUIRER_MARGIN");
  if (layer.merchantPricingPrograms.every((item) => item.netBurdenState !== "derived_when_evidenced" || Boolean(item.netBurdenCalculationRef))) {
    enforced.add("GROSS_PROCESSOR_FEES_AS_NET_MERCHANT_BURDEN");
  }
  for (const code of RE_ENFORCED_PROHIBITIONS) {
    if (["EFFECTIVE_RATE_MOVEMENT_AS_PROCESSOR_REPRICING", "TOTAL_ACCEPTANCE_COST_WITH_OFF_STATEMENT_UNKNOWNS",
      "HIGH_EFFECTIVE_RATE_AS_OVERPRICING_VERDICT", "RISK_HEAVY_ACTIVITY_AS_PRICING_JUSTIFICATION"].includes(code)) enforced.add(code);
  }
  return [...enforced];
}

export const canonicalSynthesisV2GoldObservation = observeCanonicalSynthesisV2ForGold;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
