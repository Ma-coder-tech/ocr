import type { CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import { canonicalPricingV2GoldObservation } from "./pricingGoldObservation.js";
import type { CanonicalEconomicsV2GoldObservation } from "./goldObservation.js";

export type CanonicalEconomicV2GoldObservation = CanonicalEconomicsV2GoldObservation & {
  enforcedProhibitions: string[];
};

const RD_ENFORCED_PROHIBITIONS = [
  "PROCESSOR_OWNERSHIP_FROM_ROUND_AMOUNT",
  "DOUBLE_COUNT_REPEATED_INTERCHANGE_DETAIL",
  "UNVERIFIED_NOTICE_AS_AUTHORITATIVE_KNOWLEDGE",
  "EXACT_MARKUP_ON_STRUCTURALLY_OPAQUE_PRICING",
  "NO_SALES_DISCOUNT_MEANS_ZERO_MARKUP",
  "CREDIT_LABEL_WITHOUT_DIRECTIONAL_CONTEXT",
  "SETTLEMENT_ADJUSTMENT_IN_PROCESSING_COST_STACK",
  "EXACT_PROCESSOR_OWNERSHIP_WITHOUT_PROOF",
  "ALL_AUTH_FEES_PROCESSOR_MARGIN",
  "WATS_DEFINITELY_PROCESSOR_PROFIT",
  "UNIVERSAL_PENNY_TOLERANCE",
  "TOTAL_ACCEPTANCE_COST_WITH_OFF_STATEMENT_UNKNOWNS",
  "FEE_EVENT_COUNT_AS_AUTHORITATIVE_DISPUTE_RATIO",
  "PARTIAL_DOCUMENT_AS_COMPLETE_ANALYSIS",
  "UNFAMILIAR_STANDARD_ROW_AS_UNCLEAR_CHARGE",
  "UNADMITTED_FUTURE_RULE_AS_ACTIVE_LEVER",
] as const;

export function observeCanonicalEconomicsV2ForGold(
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  options: { caseId?: string } = {},
): CanonicalEconomicV2GoldObservation {
  const observation = canonicalPricingV2GoldObservation(analysis.pricingAnalysis, options);
  const stack = analysis.economicLayer.costStack;
  if (analysis.validation.status !== "valid") {
    observation.states["cost.cost_stack"] = "unresolved";
    observation.states["cost.processor_markup"] = "unresolved_requires_positive_mapping";
    observation.limitations = unique([...observation.limitations, "Invalid RD analyses cannot project canonical Gold economic facts."]);
    return { ...observation, enforcedProhibitions: [...RD_ENFORCED_PROHIBITIONS] };
  }
  const processorBilledMinor = processorBilledAmountMinor(analysis);
  if (processorBilledMinor !== null) {
    observation.values["cost.observed_processor_billed_fee"] = processorBilledMinor / 100;
  }
  const chargebackFees = analysis.economicLayer.charges.filter((charge) =>
    charge.subtype === "chargeback_fee" && charge.contributionStatus.startsWith("contributes_") && charge.observedAmount,
  );
  if (chargebackFees.length > 0) {
    observation.values["risk.misc_chargebacks_fee"] = chargebackFees.reduce((total, charge) => total + (charge.observedAmount?.amountMinor ?? 0), 0) / 100;
  }
  const hasSettlementExclusion = analysis.economicLayer.nonFeeExclusions.some((item) => item.reason === "settlement_adjustment");
  observation.states["financial.settlement_adjustment"] = hasSettlementExclusion ? "funding_only_not_processing_cost" : "not_observed";
  const sourceUnavailable = analysis.economicLayer.sourceProvenance === "source_unavailable" ||
    analysis.economicLayer.sourceProvenance === "corpus_integrity_hold";
  const processorControlledMinor = stack.buckets.find((bucket) => bucket.kind === "processor_controlled_pricing")?.netAmount.amountMinor ?? 0;
  observation.states["cost.cost_stack"] = sourceUnavailable ? "not_derivable_from_observed_file" : stack.completeness;
  observation.states["cost.fee_detail"] = sourceUnavailable ? "not_derivable_from_observed_file" : analysis.economicLayer.admissionProfile.feeDetailCoverage;
  observation.states["cost.processor_markup"] = sourceUnavailable
    ? "not_derivable_from_observed_file"
    : processorControlledMinor !== 0
      ? "resolved_only_when_positive_evidence_proves_control"
      : "unresolved_requires_positive_mapping";
  observation.states["cost.statement_cost_scope"] = "statement_evidenced_processing_cost_not_total_acceptance_cost";
  observation.limitations = unique([...observation.limitations, ...analysis.economicLayer.limitations, ...stack.limitations]);
  return { ...observation, enforcedProhibitions: [...RD_ENFORCED_PROHIBITIONS] };
}

export const canonicalEconomicV2GoldObservation = observeCanonicalEconomicsV2ForGold;

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function processorBilledAmountMinor(analysis: CanonicalEconomicsV2EconomicAnalysis): number | null {
  const participantById = new Map(analysis.economicLayer.participants.map((participant) => [participant.id, participant]));
  let observed = false;
  let total = 0;
  for (const charge of analysis.economicLayer.charges) {
    if (!charge.contributionStatus.startsWith("contributes_") || !charge.observedAmount || charge.financialDirection === "unresolved") continue;
    const provenBilling = analysis.economicLayer.roleClaims.some((claim) => {
      if (!charge.roleClaimRefs.includes(claim.id) || claim.resolution !== "proven" || claim.periodApplicability !== "applicable") return false;
      if (!claim.participantRef || !["collector", "billing_intermediary"].includes(claim.dimension)) return false;
      const participant = participantById.get(claim.participantRef);
      return participant?.roleResolution === "proven" &&
        (participant.roles.includes("processor_platform") || participant.roles.includes("acquirer"));
    });
    if (!provenBilling) continue;
    observed = true;
    total += charge.financialDirection === "credit" ? -charge.observedAmount.amountMinor : charge.observedAmount.amountMinor;
  }
  return observed ? total : null;
}
