import type {
  CanonicalEconomicsV2Fact,
  CanonicalEconomicsV2FinancialPopulations,
  CanonicalEconomicsV2ProcessorPresentedCategoryRepresentation,
} from "./types.js";

export const RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY = {
  policyVersion: "rb_adjustment_chargeback_representation_policy_v2",
  economicsFamily: "adjustment_chargeback_net_flow",
  productSemanticRule: "preserve_processor_presented_meaning_first_split_only_when_independently_proven",
  knowledgeLevels: {
    processorPresentedCombined: "valid_source_observation_without_split_semantics",
    independentlyProvenSplit: "stronger_claim_requires_its_own_source_control",
    canonicalContribution: "combined_and_split_representations_must_not_double_count",
  },
  combinedPopulationKey: "unresolvedAdjustmentChargebackAmount",
  splitPopulationKeys: [
    "settlementAdjustmentAmount",
    "chargebackPrincipalDebitAmount",
    "chargebackRepresentmentAmount",
  ],
  orthogonalRelatedPopulationKeys: ["chargebackFeeAmount", "chargebackCount", "feeCreditAmount"],
  splitNetFormula: "settlement_adjustment_minus_principal_debit_plus_representment",
  toleranceMinor: 1,
  precedence: [
    "combined_source_observation_may_coexist_with_proven_split_knowledge",
    "combined_and_split_canonical_contributions_are_mutually_exclusive",
    "missing_split_population_is_unresolved_not_zero",
    "split_semantics_cannot_be_inferred_from_combined_source",
    "sign_alone_never_proves_adjustment_chargeback_representment_or_reversal_subtype",
    "contradiction_preserves_source_observations_and_withholds_contribution_authority_for_review",
  ],
  propagation: {
    netFunded: "prohibited_without_separate_authority",
    downstreamEconomics: "prohibited_without_explicit_dependency_and_authority",
    chargebackFee: "orthogonal_not_included_or_offset",
    chargebackCount: "orthogonal_not_inferred",
    lifecycle: "prohibited",
  },
} as const;

type SplitPopulationKey = typeof RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.splitPopulationKeys[number];

export type RbAdjustmentChargebackRepresentationEvaluation = {
  policyVersion: typeof RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.policyVersion;
  combinedCanonicalSelected: boolean;
  selectedSplitPopulationKeys: SplitPopulationKey[];
  independentlySupportedSplitPopulationKeys: SplitPopulationKey[];
  splitSetStatus: "none" | "partial" | "complete";
  combinedSourceObservationPreserved: boolean;
  sourceRepresentationRelationship: "combined_only" | "combined_and_split" | "split_only" | "none";
  sourceRepresentationRef: string | null;
  processorPresentedAmountMinor: number | null;
  reconstructedSplitNetMinor: number | null;
  valueRelationship: "not_comparable" | "matches_within_tolerance" | "contradicts";
  collision: "none" | "canonical_simultaneous_selection";
  resolution:
    | "no_combined_representation"
    | "combined_canonical_selection"
    | "combined_candidate_eligible_if_other_gates_pass"
    | "preserve_processor_combined_observation_and_proven_splits"
    | "fail_closed_canonical_collision";
  authorityEligible: boolean;
  reasonCodes: string[];
  prohibitedPropagation: readonly ["netFundedAmount", "downstreamEconomics", "lifecycleSemantics"];
};

export function evaluateRbAdjustmentChargebackRepresentationPolicy(input: {
  populations: CanonicalEconomicsV2FinancialPopulations;
  processorPresentedCategory?: CanonicalEconomicsV2ProcessorPresentedCategoryRepresentation | null;
}): RbAdjustmentChargebackRepresentationEvaluation {
  const populations = input.populations;
  const combinedCanonicalSelected = populations.unresolvedAdjustmentChargebackAmount.status === "available";
  const selectedSplitPopulationKeys = RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.splitPopulationKeys
    .filter((key) => populations[key].status === "available");
  const independentlySupportedSplitPopulationKeys = selectedSplitPopulationKeys.filter((key) =>
    hasIndependentLineage(populations[key]));
  const splitSetStatus = selectedSplitPopulationKeys.length === 0 ? "none" as const
    : selectedSplitPopulationKeys.length === RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.splitPopulationKeys.length
      ? "complete" as const : "partial" as const;
  const processorPresentedCategory = input.processorPresentedCategory?.categoryIdentity === "adjustments_chargebacks"
    ? input.processorPresentedCategory : null;
  const processorPresentedAmountMinor = processorPresentedCategory?.observationStatus === "observed"
    ? processorPresentedCategory.observedAmount?.amountMinor ?? null : null;
  const independentlySupportedSplitSet = independentlySupportedSplitPopulationKeys.length
    === RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.splitPopulationKeys.length;
  const reconstructedSplitNetMinor = splitSetStatus === "complete" && independentlySupportedSplitSet
    ? splitNet(populations) : null;
  const valueRelationship = processorPresentedAmountMinor === null || reconstructedSplitNetMinor === null
    ? "not_comparable" as const
    : Math.abs(processorPresentedAmountMinor - reconstructedSplitNetMinor)
      <= RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.toleranceMinor
      ? "matches_within_tolerance" as const : "contradicts" as const;
  const combinedSourceObservationPreserved = processorPresentedCategory !== null || combinedCanonicalSelected;
  const sourceRepresentationRelationship = combinedSourceObservationPreserved && selectedSplitPopulationKeys.length > 0
    ? "combined_and_split" as const
    : combinedSourceObservationPreserved ? "combined_only" as const
      : selectedSplitPopulationKeys.length > 0 ? "split_only" as const : "none" as const;
  const collision = combinedCanonicalSelected && selectedSplitPopulationKeys.length > 0
    ? "canonical_simultaneous_selection" as const : "none" as const;
  const resolution = collision === "canonical_simultaneous_selection"
    ? "fail_closed_canonical_collision" as const
    : processorPresentedCategory !== null && selectedSplitPopulationKeys.length > 0
      ? "preserve_processor_combined_observation_and_proven_splits" as const
      : processorPresentedCategory !== null
        ? "combined_candidate_eligible_if_other_gates_pass" as const
        : combinedCanonicalSelected ? "combined_canonical_selection" as const
          : "no_combined_representation" as const;
  const authorityEligible = processorPresentedAmountMinor !== null
    && selectedSplitPopulationKeys.length === 0 && !combinedCanonicalSelected;
  return {
    policyVersion: RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.policyVersion,
    combinedCanonicalSelected,
    selectedSplitPopulationKeys: [...selectedSplitPopulationKeys],
    independentlySupportedSplitPopulationKeys,
    splitSetStatus,
    combinedSourceObservationPreserved,
    sourceRepresentationRelationship,
    sourceRepresentationRef: processorPresentedCategory?.id ?? null,
    processorPresentedAmountMinor,
    reconstructedSplitNetMinor,
    valueRelationship,
    collision,
    resolution,
    authorityEligible,
    reasonCodes: unique([
      ...(combinedCanonicalSelected ? ["combined_population_selected"] : []),
      ...(sourceRepresentationRelationship === "combined_and_split"
        ? ["processor_combined_observation_preserved_alongside_proven_split_knowledge"] : []),
      ...(splitSetStatus === "partial" ? ["partial_split_set_cannot_be_completed_with_assumed_zero"] : []),
      ...(splitSetStatus === "complete" && !independentlySupportedSplitSet
        ? ["complete_split_set_lacks_independent_lineage_for_value_comparison"] : []),
      ...(valueRelationship === "matches_within_tolerance"
        ? ["combined_and_complete_split_net_match_but_canonical_contributions_remain_mutually_exclusive"] : []),
      ...(valueRelationship === "contradicts"
        ? ["combined_and_complete_split_net_contradict_but_source_observations_are_preserved"] : []),
      ...(authorityEligible ? ["no_split_collision"] : []),
      "processor_presented_meaning_preserved_before_split_interpretation",
      "sign_alone_has_no_subtype_authority",
      "combined_has_no_net_funded_or_downstream_dependency_permission",
    ]),
    prohibitedPropagation: ["netFundedAmount", "downstreamEconomics", "lifecycleSemantics"],
  };
}

export function validateRbAdjustmentChargebackRepresentationSelection(
  populations: CanonicalEconomicsV2FinancialPopulations,
): string[] {
  const evaluation = evaluateRbAdjustmentChargebackRepresentationPolicy({ populations });
  return evaluation.collision === "canonical_simultaneous_selection"
    ? ["An unresolved combined adjustment/chargeback fact cannot coexist as selected with separated adjustment or chargeback populations."]
    : [];
}

function hasIndependentLineage(fact: CanonicalEconomicsV2Fact<unknown, string>): boolean {
  return fact.status === "available"
    && fact.provenanceStatus === "authoritative"
    && (fact.evidenceRefs.length > 0 || fact.occurrenceRefs.length > 0 || fact.calculationRef !== null);
}

function splitNet(populations: CanonicalEconomicsV2FinancialPopulations): number | null {
  const adjustment = populations.settlementAdjustmentAmount.value?.amountMinor;
  const principal = populations.chargebackPrincipalDebitAmount.value?.amountMinor;
  const representment = populations.chargebackRepresentmentAmount.value?.amountMinor;
  return adjustment === undefined || principal === undefined || representment === undefined
    ? null : adjustment - principal + representment;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
