import type { MoneyAmount } from "../types.js";
import type {
  CanonicalEconomicCategory,
  CanonicalEconomicComparisonItem,
  CanonicalEconomicComparisonReport,
  CanonicalEconomicCostStackCompleteness,
  CanonicalEconomicFinancialDirection,
  CanonicalEconomicsV2EconomicAnalysis,
} from "./economicTypes.js";

export type LegacyEconomicChargeObservation = {
  id: string;
  sourceOccurrenceRefs: string[];
  amount: MoneyAmount | null;
  direction: CanonicalEconomicFinancialDirection;
  contributes: boolean;
  category: CanonicalEconomicCategory | null;
  categoryPositiveEvidenceProven?: boolean;
  processorParticipantRoleProven: boolean | null;
  processorParticipantRolePositiveEvidenceProven?: boolean;
  processorControlProven: boolean | null;
  processorControlPositiveEvidenceProven?: boolean;
};

export type LegacyEconomicCostStackObservation = {
  completeness: CanonicalEconomicCostStackCompleteness | null;
  unresolvedRemainder: MoneyAmount | null;
  reconciliationDeltaMinor: number | null;
};

export type LegacyEconomicObservation = {
  statementProcessingFeeTotal: MoneyAmount | null;
  uniqueChargeCount: number | null;
  processorControlledTotal: MoneyAmount | null;
  processorControlledTotalPositiveEvidenceProven?: boolean;
  emitsExactOwnershipWithoutPositiveProof: boolean;
  mayDoubleCountRepeatedRepresentations: boolean;
  includesNonFeeSettlementActivityInFeeCost: boolean;
  describesStatementFeesAsTotalAcceptanceCost: boolean;
  charges?: LegacyEconomicChargeObservation[];
  costStack?: LegacyEconomicCostStackObservation;
  nonFeeExcludedOccurrenceRefs?: string[];
};

export function compareLegacyAndCanonicalEconomicsV2(
  legacy: LegacyEconomicObservation,
  analysis: CanonicalEconomicsV2EconomicAnalysis,
): CanonicalEconomicComparisonReport {
  const items: CanonicalEconomicComparisonItem[] = [];
  const stack = analysis.economicLayer.costStack;
  const canonicalTotal = stack.authoritativeStatementFeeTotal;
  if (legacy.statementProcessingFeeTotal === null || canonicalTotal === null) {
    items.push(item("statement_processing_fee_total", "v2_unavailable_or_ambiguous", null, "fee_total_unavailable_for_comparison"));
  } else if (sameMoney(legacy.statementProcessingFeeTotal, canonicalTotal)) {
    items.push(item("statement_processing_fee_total", "same_semantic_fact", null, "same_statement_fee_total"));
  } else {
    items.push(item("statement_processing_fee_total", "unexpected_divergence", null, "shared_fee_total_disagrees"));
  }

  const canonicalChargeCount = analysis.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_")).length;
  if (legacy.uniqueChargeCount === null) {
    items.push(item("economic_charge_identity", "v2_unavailable_or_ambiguous", null, "legacy_unique_charge_population_unavailable"));
  } else if (legacy.uniqueChargeCount === canonicalChargeCount) {
    items.push(item("economic_charge_identity", "same_semantic_fact", null, "same_unique_charge_count"));
  } else if (legacy.mayDoubleCountRepeatedRepresentations && legacy.uniqueChargeCount > canonicalChargeCount) {
    items.push(item(
      "economic_charge_identity",
      "approved_semantic_amendment",
      "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY",
      "legacy_representation_count_is_not_canonical_economic_identity",
    ));
  } else {
    items.push(item("economic_charge_identity", "unexpected_divergence", null, "unexplained_unique_charge_difference"));
  }

  const processorBucket = stack.buckets.find((bucket) => bucket.kind === "processor_controlled_pricing")!;
  const processorControlUnresolved = analysis.economicLayer.charges.some((charge) =>
    charge.category === "processor_acquirer_pricing" && !processorBucket.chargeRefs.includes(charge.id),
  );
  if (legacy.processorControlledTotal === null && processorBucket.netAmount.amountMinor === 0) {
    items.push(item("processor_controlled_total", "same_semantic_fact", null, "neither_layer_establishes_processor_controlled_total"));
  } else if (legacy.processorControlledTotal && sameMoney(legacy.processorControlledTotal, processorBucket.netAmount)) {
    items.push(item("processor_controlled_total", "same_semantic_fact", null, "same_positive_control_total"));
  } else if (legacy.processorControlledTotal && processorControlUnresolved && legacy.processorControlledTotalPositiveEvidenceProven === false) {
    items.push(item(
      "processor_controlled_total",
      "approved_semantic_amendment",
      "RD-AMEND-003-POSITIVE-IDENTIFICATION",
      "legacy_exact_control_refused_without_positive_role_evidence",
    ));
  } else if (legacy.processorControlledTotal && processorControlUnresolved && legacy.processorControlledTotalPositiveEvidenceProven === undefined) {
    items.push(item("processor_controlled_total", "v2_unavailable_or_ambiguous", null, "legacy_processor_control_evidence_basis_unavailable"));
  } else if (analysis.economicLayer.costStack.completeness === "not_derivable_from_document") {
    items.push(item("processor_controlled_total", "v2_unavailable_or_ambiguous", null, "v2_source_cannot_establish_control_total"));
  } else {
    items.push(item("processor_controlled_total", "unexpected_divergence", null, "unexplained_processor_controlled_total_difference"));
  }

  items.push(legacy.emitsExactOwnershipWithoutPositiveProof
    ? analysis.economicLayer.roleClaims.some((claim) => claim.dimension === "economic_owner" && claim.resolution === "proven")
      ? item("economic_ownership", "unexpected_divergence", null, "legacy_unproven_owner_conflicts_with_v2_proven_owner")
      : item(
        "economic_ownership",
        "approved_semantic_amendment",
        "RD-AMEND-002-INDEPENDENT-CONTROL-ROLES",
        "legacy_owner_shortcut_replaced_by_independent_claims",
        )
    : item("economic_ownership", "same_semantic_fact", null, "legacy_does_not_emit_unproven_exact_owner"));
  items.push(legacy.includesNonFeeSettlementActivityInFeeCost
    ? item(
        "nonfee_settlement_exclusion",
        "approved_semantic_amendment",
        "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION",
        "legacy_nonfee_cost_contamination_excluded",
      )
    : item("nonfee_settlement_exclusion", "same_semantic_fact", null, "both_layers_keep_nonfee_activity_outside_cost"));
  items.push(legacy.describesStatementFeesAsTotalAcceptanceCost
    ? item(
        "statement_cost_scope",
        "approved_semantic_amendment",
        "RD-AMEND-006-STATEMENT-COST-NOT-TOTAL-ACCEPTANCE-COST",
        "legacy_total_acceptance_scope_refused",
      )
    : item("statement_cost_scope", "same_semantic_fact", null, "both_layers_limit_scope_to_statement_processing_cost"));

  if (legacy.charges) compareCharges(legacy, analysis, items);
  if (legacy.costStack) compareCostStack(legacy.costStack, analysis, items);
  if (legacy.nonFeeExcludedOccurrenceRefs) compareNonFeeExclusions(legacy.nonFeeExcludedOccurrenceRefs, analysis, items);

  const counts = {
    same_semantic_fact: items.filter((entry) => entry.classification === "same_semantic_fact").length,
    approved_semantic_amendment: items.filter((entry) => entry.classification === "approved_semantic_amendment").length,
    v2_unavailable_or_ambiguous: items.filter((entry) => entry.classification === "v2_unavailable_or_ambiguous").length,
    unexpected_divergence: items.filter((entry) => entry.classification === "unexpected_divergence").length,
  };
  return {
    policyVersion: "canonical_legacy_v2_economic_shadow_comparison_v2",
    items,
    counts,
    hasUnexpectedDivergence: counts.unexpected_divergence > 0,
  };
}

function compareCharges(
  legacy: LegacyEconomicObservation,
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  items: CanonicalEconomicComparisonItem[],
): void {
  const canonicalBySource = new Map(analysis.economicLayer.charges.map((charge) => [sourceKey(charge.sourceOccurrenceRefs), charge]));
  const excluded = new Set(analysis.economicLayer.nonFeeExclusions.map((entry) => entry.occurrenceRef));
  const occurrenceById = new Map(analysis.pricingAnalysis.foundation.sourceModel.occurrences.map((entry) => [entry.id, entry]));
  const processorBucket = analysis.economicLayer.costStack.buckets.find((bucket) => bucket.kind === "processor_controlled_pricing")!;
  for (const observed of legacy.charges ?? []) {
    const canonical = canonicalBySource.get(sourceKey(observed.sourceOccurrenceRefs));
    if (!canonical) {
      const isExcluded = observed.sourceOccurrenceRefs.every((ref) => excluded.has(ref));
      items.push(isExcluded && observed.contributes
        ? item(`charge:${observed.id}:contribution`, "approved_semantic_amendment", "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION", "legacy_nonfee_charge_excluded_by_v2")
        : item(`charge:${observed.id}:identity`, "unexpected_divergence", null, "legacy_charge_has_no_v2_source_identity_match"));
      continue;
    }
    items.push(observed.amount === null || canonical.observedAmount === null
      ? item(`charge:${observed.id}:amount`, "v2_unavailable_or_ambiguous", null, "charge_amount_unavailable")
      : sameMoney(observed.amount, canonical.observedAmount)
        ? item(`charge:${observed.id}:amount`, "same_semantic_fact", null, "same_source_bound_charge_amount")
        : item(`charge:${observed.id}:amount`, "unexpected_divergence", null, "source_bound_charge_amount_disagrees"));
    if (observed.direction === canonical.financialDirection) {
      items.push(item(`charge:${observed.id}:direction`, "same_semantic_fact", null, "same_financial_direction"));
    } else {
      const creditCorrection = canonical.financialDirection === "credit" && canonical.sourceOccurrenceRefs.some((ref) => occurrenceById.get(ref)?.semanticRole === "fee_credit");
      items.push(creditCorrection
        ? item(`charge:${observed.id}:direction`, "approved_semantic_amendment", "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION", "legacy_fee_credit_direction_corrected")
        : item(`charge:${observed.id}:direction`, "unexpected_divergence", null, "financial_direction_disagrees"));
    }
    const contributes = canonical.contributionStatus.startsWith("contributes_");
    if (observed.contributes === contributes) {
      items.push(item(`charge:${observed.id}:contribution`, "same_semantic_fact", null, "same_contribution_state"));
    } else {
      const representationCorrection = observed.contributes && !contributes &&
        (canonical.contributionStatus === "blocked_representation" || canonical.contributionStatus === "noncontributing_support") &&
        canonical.sourceOccurrenceRefs.some((ref) => occurrenceById.get(ref)?.contributionRole !== "authoritative_contributor");
      items.push(representationCorrection
        ? item(`charge:${observed.id}:contribution`, "approved_semantic_amendment", "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY", "legacy_unadmitted_representation_contribution_refused")
        : item(`charge:${observed.id}:contribution`, "unexpected_divergence", null, "charge_contribution_state_disagrees"));
    }
    if (observed.category === null || canonical.categoryResolution !== "proven") {
      items.push(observed.category !== null && canonical.categoryResolution !== "proven" && observed.categoryPositiveEvidenceProven === false
        ? item(`charge:${observed.id}:category`, "approved_semantic_amendment", "RD-AMEND-003-POSITIVE-IDENTIFICATION", "legacy_exact_category_refused_without_positive_evidence")
        : observed.category !== null && canonical.categoryResolution !== "proven" && observed.categoryPositiveEvidenceProven === true
          ? item(`charge:${observed.id}:category`, "unexpected_divergence", null, "v2_refuses_legacy_category_despite_positive_evidence")
          : item(`charge:${observed.id}:category`, "v2_unavailable_or_ambiguous", null, "charge_category_evidence_basis_unavailable"));
    } else {
      items.push(observed.category === canonical.category
        ? item(`charge:${observed.id}:category`, "same_semantic_fact", null, "same_economic_category")
        : item(`charge:${observed.id}:category`, "unexpected_divergence", null, "proven_economic_category_disagrees"));
    }
    if (observed.processorControlProven !== null) {
      const canonicalControl = processorBucket.chargeRefs.includes(canonical.id);
      items.push(observed.processorControlProven === canonicalControl
        ? item(`charge:${observed.id}:processor_control`, "same_semantic_fact", null, "same_processor_control_state")
        : observed.processorControlProven && !canonicalControl && observed.processorControlPositiveEvidenceProven === false
          ? item(`charge:${observed.id}:processor_control`, "approved_semantic_amendment", "RD-AMEND-003-POSITIVE-IDENTIFICATION", "legacy_processor_control_refused_without_proven_participant_and_control")
          : observed.processorControlPositiveEvidenceProven === undefined
            ? item(`charge:${observed.id}:processor_control`, "v2_unavailable_or_ambiguous", null, "legacy_processor_control_evidence_basis_unavailable")
            : item(`charge:${observed.id}:processor_control`, "unexpected_divergence", null, "processor_control_state_disagrees"));
    }
    if (observed.processorParticipantRoleProven !== null) {
      const participantRoleProven = analysis.economicLayer.roleClaims.some((claim) =>
        canonical.roleClaimRefs.includes(claim.id) && claim.resolution === "proven" && Boolean(claim.participantRef) &&
        analysis.economicLayer.participants.some((participant) => participant.id === claim.participantRef && participant.roleResolution === "proven" &&
          (participant.roles.includes("processor_platform") || participant.roles.includes("acquirer"))),
      );
      items.push(observed.processorParticipantRoleProven === participantRoleProven
        ? item(`charge:${observed.id}:participant_role`, "same_semantic_fact", null, "same_processor_participant_role_state")
        : observed.processorParticipantRoleProven && !participantRoleProven && observed.processorParticipantRolePositiveEvidenceProven === false
          ? item(`charge:${observed.id}:participant_role`, "approved_semantic_amendment", "RD-AMEND-003-POSITIVE-IDENTIFICATION", "legacy_processor_role_refused_without_participant_evidence")
          : observed.processorParticipantRolePositiveEvidenceProven === undefined
            ? item(`charge:${observed.id}:participant_role`, "v2_unavailable_or_ambiguous", null, "legacy_processor_role_evidence_basis_unavailable")
            : item(`charge:${observed.id}:participant_role`, "unexpected_divergence", null, "processor_participant_role_state_disagrees"));
    }
  }
}

function compareCostStack(
  legacy: LegacyEconomicCostStackObservation,
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  items: CanonicalEconomicComparisonItem[],
): void {
  const stack = analysis.economicLayer.costStack;
  if (legacy.completeness === null) {
    items.push(item("cost_stack_completeness", "v2_unavailable_or_ambiguous", null, "legacy_completeness_unavailable"));
  } else if (legacy.completeness === stack.completeness) {
    items.push(item("cost_stack_completeness", "same_semantic_fact", null, "same_cost_stack_completeness"));
  } else if (legacy.completeness === "complete" && stack.completeness === "partial_but_financially_reconciled") {
    items.push(item("cost_stack_completeness", "approved_semantic_amendment", "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK", "legacy_complete_stack_preserves_unresolved_v2_allocation"));
  } else {
    items.push(item("cost_stack_completeness", "unexpected_divergence", null, "cost_stack_completeness_disagrees"));
  }
  items.push(legacy.reconciliationDeltaMinor === stack.reconciliationDeltaMinor
    ? item("cost_stack_reconciliation_delta", "same_semantic_fact", null, "same_reconciliation_delta")
    : item("cost_stack_reconciliation_delta", "unexpected_divergence", null, "reconciliation_delta_disagrees"));
  if (legacy.unresolvedRemainder === null && stack.unresolvedRemainder === null) {
    items.push(item("cost_stack_unresolved_remainder", "same_semantic_fact", null, "neither_stack_has_unresolved_remainder"));
  } else if (legacy.unresolvedRemainder && stack.unresolvedRemainder && sameMoney(legacy.unresolvedRemainder, stack.unresolvedRemainder)) {
    items.push(item("cost_stack_unresolved_remainder", "same_semantic_fact", null, "same_unresolved_remainder"));
  } else if (legacy.unresolvedRemainder === null && stack.unresolvedRemainder !== null && stack.completeness === "partial_but_financially_reconciled") {
    items.push(item("cost_stack_unresolved_remainder", "approved_semantic_amendment", "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK", "v2_preserves_reconciled_unresolved_remainder"));
  } else {
    items.push(item("cost_stack_unresolved_remainder", "unexpected_divergence", null, "unresolved_remainder_disagrees"));
  }
}

function compareNonFeeExclusions(
  legacyRefs: string[],
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  items: CanonicalEconomicComparisonItem[],
): void {
  const legacySet = new Set(legacyRefs);
  const canonicalSet = new Set(analysis.economicLayer.nonFeeExclusions.map((entry) => entry.occurrenceRef));
  const missingFromLegacy = [...canonicalSet].filter((ref) => !legacySet.has(ref));
  const missingFromV2 = [...legacySet].filter((ref) => !canonicalSet.has(ref));
  if (missingFromV2.length > 0) {
    items.push(item("nonfee_exclusion_population", "unexpected_divergence", null, "legacy_nonfee_exclusion_missing_from_v2"));
  } else if (missingFromLegacy.length > 0) {
    items.push(item("nonfee_exclusion_population", "approved_semantic_amendment", "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION", "v2_adds_source_grounded_nonfee_exclusions"));
  } else {
    items.push(item("nonfee_exclusion_population", "same_semantic_fact", null, "same_nonfee_exclusion_population"));
  }
}

function sourceKey(refs: string[]): string {
  return [...new Set(refs)].sort().join("|");
}

function item(
  fact: string,
  classification: CanonicalEconomicComparisonItem["classification"],
  amendmentId: CanonicalEconomicComparisonItem["amendmentId"],
  reasonCode: string,
): CanonicalEconomicComparisonItem {
  return { fact, classification, amendmentId, reasonCode };
}

function sameMoney(left: MoneyAmount, right: MoneyAmount): boolean {
  return left.currency === right.currency && left.amountMinor === right.amountMinor;
}
