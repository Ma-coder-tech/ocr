import type {
  CanonicalEvidenceRecord,
  CanonicalFeeClassificationResolution,
  CanonicalFeeLedger,
  CanonicalFeeOwnership,
  CanonicalFeeOwnershipActionability,
  CanonicalOpportunityCadence,
  CanonicalOpportunityComponent,
  CanonicalOpportunityEngine,
  CanonicalOpportunityEligibility,
  CanonicalOpportunityKind,
  CanonicalOpportunitySummary,
  CanonicalOpportunityTarget,
  CanonicalOpportunityTargetProvenance,
  MoneyAmount,
} from "./types.js";
import {
  absMoney,
  addMoney,
  cadenceForFeeRow,
  componentAnnualAmount,
  defaultEligibility,
  noTarget,
  noTargetProvenance,
  OPPORTUNITY_AI_BOUNDARY_POLICY_VERSION,
  OPPORTUNITY_BENCHMARK_POLICY_VERSION,
  OPPORTUNITY_CADENCE_POLICY_VERSION,
  OPPORTUNITY_POLICY_VERSION,
  OPPORTUNITY_TARGET_POLICY_VERSION,
  rowEvidenceRefs,
  stableAggregationKey,
  stableOpportunityId,
} from "./opportunityPolicy.js";

const unknownOwnership = (): CanonicalFeeOwnership => ({
  collector: "unknown",
  economicBeneficiary: "unknown",
  contractualController: "unknown",
});

export type CanonicalOpportunityInput = {
  id?: string;
  kind: Exclude<CanonicalOpportunityKind, "fee_row_review">;
  eligibility: Extract<CanonicalOpportunityEligibility, "deterministic" | "approved_estimate">;
  feeRowIds: string[];
  target: CanonicalOpportunityTarget;
  targetProvenance: CanonicalOpportunityTargetProvenance;
  cadence: CanonicalOpportunityCadence;
  calculation: {
    calculationRef: string;
    formulaCode: Exclude<CanonicalOpportunityComponent["calculation"]["formulaCode"], "none_not_eligible" | "opportunity_component_sum">;
    inputRefs: string[];
    result: MoneyAmount;
    annualized: boolean;
    evidenceRefs: string[];
  };
  confidence: CanonicalOpportunityComponent["confidence"];
  evidenceRefs: string[];
  aggregationKey?: string;
  exclusiveGroupKey?: string | null;
  supersedesComponentIds?: string[];
  overlapsWithComponentIds?: string[];
  inclusionReasonCodes?: string[];
  limitations?: string[];
};

export function buildCanonicalOpportunityEngine(input: {
  feeLedger: CanonicalFeeLedger;
  feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  evidence: CanonicalEvidenceRecord[];
  statementPeriodVerified: boolean;
  opportunityInputs?: CanonicalOpportunityInput[];
}): CanonicalOpportunityEngine {
  const inputComponents = (input.opportunityInputs ?? []).map((opportunityInput) => componentForOpportunityInput(opportunityInput, input));
  const coveredFeeRowIds = new Set(inputComponents.flatMap((component) => component.feeRowRefs.map((ref) => ref.feeRowId)));
  const spreadComponents: CanonicalOpportunityComponent[] = input.feeOwnershipActionability.spreadAssertions.flatMap((spread) => {
    if (coveredFeeRowIds.has(spread.baseFeeRowId)) return [];
    const base = componentForFeeRow(spread.baseFeeRowId, input);
    return [
      {
        ...base,
        id: stableOpportunityId(["spread", spread.id, spread.baseFeeRowId]),
        kind: "hidden_processor_spread" as const,
        eligibility: "verification_only" as const,
        inclusionStatus: "excluded" as const,
        actionabilityCeiling: spread.actionabilityCeiling,
        target: noTarget(spread.status === "proven" ? "Package D proved spread ownership, but Package E v1 requires canonical observed and reference-rate calculation." : "Suspected spreads remain verification-only."),
        targetProvenance: spread.reference
          ? {
              ...noTargetProvenance(["Package E v1 does not convert Package D spread references into target amounts without explicit observed/reference-rate math."]),
              sourceType: "authoritative_network_government_regulatory" as const,
              referenceId: spread.reference.referenceId,
              version: spread.reference.version,
              effectiveFrom: spread.reference.effectiveFrom,
              effectiveTo: spread.reference.effectiveTo,
              applicableProcessor: spread.reference.applicableProcessorOrNetwork,
              evidenceRefs: spread.evidenceRefs,
              authoritativeForDeterministic: spread.status === "proven" && spread.authoritative,
            }
          : noTargetProvenance(),
        exclusionReasonCodes: spread.status === "suspected" ? ["suspected_spread_verification_only"] : ["missing_spread_calculation"],
        evidenceRefs: [...new Set([...base.evidenceRefs, ...spread.evidenceRefs])],
        limitations: [
          ...base.limitations,
          spread.status === "proven"
            ? "A proven Package D spread still needs Package E observed/reference-rate math before it can become eligible."
            : "A suspected Package D spread remains verification-only.",
        ],
      },
    ];
  });
  const components: CanonicalOpportunityComponent[] = [
    ...inputComponents,
    ...input.feeLedger.rows.filter((row) => !coveredFeeRowIds.has(row.id)).map((row) => componentForFeeRow(row.id, input)),
    ...spreadComponents,
  ];

  const summary = aggregateCanonicalOpportunityComponents(components);
  return {
    policyVersion: OPPORTUNITY_POLICY_VERSION,
    targetPolicyVersion: OPPORTUNITY_TARGET_POLICY_VERSION,
    cadencePolicyVersion: OPPORTUNITY_CADENCE_POLICY_VERSION,
    benchmarkPolicyVersion: OPPORTUNITY_BENCHMARK_POLICY_VERSION,
    aiBoundaryPolicyVersion: OPPORTUNITY_AI_BOUNDARY_POLICY_VERSION,
    status: components.length === 0 ? "unavailable" : components.some((component) => component.eligibility === "excluded") ? "partial" : "available",
    components,
    summary,
    limitations: [
      "Package E v1 is canonical/harness-only and does not feed Report V1, legacy reports, parsers, APIs, workers, frontend, persistence, or multi-statement runtime.",
      "Current RateReveal directional business-type benchmarks are verification-only in Package E v1 unless an explicit approved benchmark registry entry is supplied by a future package.",
      "Master savings is computed only from included non-overlapping canonical opportunity components.",
    ],
  };
}

function componentForOpportunityInput(
  opportunityInput: CanonicalOpportunityInput,
  input: {
    feeLedger: CanonicalFeeLedger;
    feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  },
): CanonicalOpportunityComponent {
  const sortedFeeRowIds = [...opportunityInput.feeRowIds].sort();
  const rows = sortedFeeRowIds.map((feeRowId) => input.feeLedger.rows.find((row) => row.id === feeRowId) ?? null);
  const classifications = sortedFeeRowIds.map((feeRowId) => classificationForRow(feeRowId, input.feeOwnershipActionability));
  const evidenceRefs = [...new Set([...opportunityInput.evidenceRefs, ...sortedFeeRowIds.flatMap((feeRowId) => rowEvidenceRefs(feeRowId, input.feeLedger))])];
  const observedAmount = addMoney(rows.map((row) => absMoney(row?.selectedAmount)));
  const selected = classifications[0]?.selected;
  return {
    id:
      opportunityInput.id ??
      stableOpportunityId([
        "opportunity",
        opportunityInput.kind,
        sortedFeeRowIds.join("_"),
        opportunityInput.targetProvenance.referenceId,
        opportunityInput.calculation.calculationRef,
      ]),
    policyVersion: OPPORTUNITY_POLICY_VERSION,
    kind: opportunityInput.kind,
    eligibility: opportunityInput.eligibility,
    inclusionStatus: "included",
    feeRowRefs: sortedFeeRowIds.map((feeRowId, index) => ({
      feeRowId,
      role: index === 0 ? "base" : "supporting",
      classificationCandidateId: classifications[index]?.selected.candidateId ?? "missing_classification",
    })),
    ownership: selected ? { ...selected.ownership } : unknownOwnership(),
    actionabilityCeiling: selected?.actionabilityCeiling ?? "unknown",
    observedAmount: {
      amount: observedAmount,
      source: opportunityInput.kind === "hidden_processor_spread" ? "canonical_spread_calculation" : "canonical_fee_row",
      evidenceRefs,
      aiSourced: false,
    },
    target: opportunityInput.target,
    targetProvenance: opportunityInput.targetProvenance,
    cadence: opportunityInput.cadence,
    calculation: {
      calculationRef: opportunityInput.calculation.calculationRef,
      formulaCode: opportunityInput.calculation.formulaCode,
      formulaVersion: "canonical_opportunity_formula_v1",
      inputRefs: opportunityInput.calculation.inputRefs,
      result: opportunityInput.calculation.result,
      resultUnit: "money",
      annualized: opportunityInput.calculation.annualized,
      evidenceRefs: opportunityInput.calculation.evidenceRefs,
      aiSourced: false,
    },
    overlap: {
      aggregationKey:
        opportunityInput.aggregationKey ??
        stableAggregationKey(sortedFeeRowIds, opportunityInput.kind, opportunityInput.targetProvenance.referenceId, opportunityInput.calculation.formulaCode, opportunityInput.cadence.value),
      exclusiveGroupKey: opportunityInput.exclusiveGroupKey ?? null,
      supersedesComponentIds: opportunityInput.supersedesComponentIds ?? [],
      supersededByComponentId: null,
      overlapsWithComponentIds: opportunityInput.overlapsWithComponentIds ?? [],
      resolution: opportunityInput.supersedesComponentIds?.length ? "superseded" : "none",
      reason: opportunityInput.supersedesComponentIds?.length ? "Explicit Package E input supersedes narrower component(s)." : null,
    },
    confidence: opportunityInput.confidence,
    inclusionReasonCodes: opportunityInput.inclusionReasonCodes ?? ["approved_package_e_input"],
    exclusionReasonCodes: [],
    evidenceRefs,
    limitations: opportunityInput.limitations ?? [],
  };
}

export function aggregateCanonicalOpportunityComponents(components: CanonicalOpportunityComponent[]): CanonicalOpportunitySummary {
  const deterministic = includedComponents(components, "deterministic");
  const approvedEstimated = includedComponents(components, "approved_estimate");
  const verificationOnly = components.filter((component) => component.eligibility === "verification_only");
  const excluded = components.filter((component) => component.eligibility === "excluded");
  const nonAnnualized = components.filter((component) => !component.cadence.annualizationAllowed && component.observedAmount !== null);
  const superseded = components.filter((component) => component.inclusionStatus === "superseded");

  const deterministicEligibleAnnualAmount = addMoney(deterministic.map(componentAnnualAmount));
  const approvedEstimatedAnnualAmount = addMoney(approvedEstimated.map(componentAnnualAmount));
  const totalEligibleAnnualAmount = addMoney([deterministicEligibleAnnualAmount, approvedEstimatedAnnualAmount]);

  return {
    deterministicEligibleAnnualAmount,
    approvedEstimatedAnnualAmount,
    totalEligibleAnnualAmount,
    verificationOnlyObservedAmount: addMoney(verificationOnly.map((component) => component.observedAmount?.amount)),
    excludedObservedAmount: addMoney(excluded.map((component) => component.observedAmount?.amount)),
    nonAnnualizedObservedAmount: addMoney(nonAnnualized.map((component) => component.observedAmount?.amount)),
    masterSavingsAnnualAmount: totalEligibleAnnualAmount,
    deterministicComponentIds: deterministic.map((component) => component.id).sort(),
    approvedEstimatedComponentIds: approvedEstimated.map((component) => component.id).sort(),
    verificationOnlyComponentIds: verificationOnly.map((component) => component.id).sort(),
    excludedComponentIds: excluded.map((component) => component.id).sort(),
    nonAnnualizedComponentIds: nonAnnualized.map((component) => component.id).sort(),
    supersededComponentIds: superseded.map((component) => component.id).sort(),
    summaryCalculationRefs: [],
    limitations: ["Summary dollars are reconstructed from included Package E components only; verification, excluded, one-time, and unknown-cadence amounts are separate."],
  };
}

function componentForFeeRow(
  feeRowId: string,
  input: {
    feeLedger: CanonicalFeeLedger;
    feeOwnershipActionability: CanonicalFeeOwnershipActionability;
    evidence: CanonicalEvidenceRecord[];
    statementPeriodVerified: boolean;
  },
): CanonicalOpportunityComponent {
  const row = input.feeLedger.rows.find((item) => item.id === feeRowId);
  const classification = classificationForRow(feeRowId, input.feeOwnershipActionability);
  const evidenceRefs = rowEvidenceRefs(feeRowId, input.feeLedger);
  const observedAmount = absMoney(row?.selectedAmount);
  const selected = classification?.selected;
  const ownership = selected ? { ...selected.ownership } : unknownOwnership();
  const actionabilityCeiling = selected?.actionabilityCeiling ?? "unknown";
  const cadence = cadenceForFeeRow({
    feeRowId,
    ledger: input.feeLedger,
    statementPeriodVerified: input.statementPeriodVerified,
    evidence: input.evidence,
  });
  const policy = defaultEligibility({
    ownership,
    actionabilityCeiling,
    hasObservedAmount: observedAmount !== null,
  });
  const inclusionStatus = policy.eligibility === "deterministic" || policy.eligibility === "approved_estimate" ? "included" : "excluded";

  return {
    id: stableOpportunityId(["fee_row", feeRowId, row?.selectedLabel]),
    policyVersion: OPPORTUNITY_POLICY_VERSION,
    kind: "fee_row_review",
    eligibility: policy.eligibility,
    inclusionStatus,
    feeRowRefs: [
      {
        feeRowId,
        role: "base",
        classificationCandidateId: selected?.candidateId ?? "missing_classification",
      },
    ],
    ownership,
    actionabilityCeiling,
    observedAmount: observedAmount
      ? {
          amount: observedAmount,
          source: "canonical_fee_row",
          evidenceRefs,
          aiSourced: false,
        }
      : null,
    target: noTarget("No approved Package E target is available for this canonical fee row."),
    targetProvenance: noTargetProvenance(["Package E v1 does not infer zero-removal, benchmark, per-item, or spread targets from labels alone."]),
    cadence,
    calculation: {
      calculationRef: null,
      formulaCode: "none_not_eligible",
      formulaVersion: "canonical_opportunity_formula_v1",
      inputRefs: [feeRowId],
      result: null,
      resultUnit: "money",
      annualized: false,
      evidenceRefs,
      aiSourced: false,
    },
    overlap: {
      aggregationKey: stableOpportunityId(["fee_row", feeRowId]),
      exclusiveGroupKey: null,
      supersedesComponentIds: [],
      supersededByComponentId: null,
      overlapsWithComponentIds: [],
      resolution: "none",
      reason: null,
    },
    confidence: selected?.confidence === "high" ? "high" : selected?.confidence === "medium" ? "medium" : "low",
    inclusionReasonCodes: [],
    exclusionReasonCodes: policy.reasonCodes,
    evidenceRefs,
    limitations: [
      "Package E v1 requires fee-specific target evidence and calculation before including opportunity dollars.",
      ...(cadence.annualizationAllowed ? [] : [cadence.reason]),
    ],
  };
}

function includedComponents(components: CanonicalOpportunityComponent[], eligibility: "deterministic" | "approved_estimate"): CanonicalOpportunityComponent[] {
  return components.filter((component) => component.eligibility === eligibility && component.inclusionStatus === "included");
}

function classificationForRow(
  feeRowId: string,
  ownershipActionability: CanonicalFeeOwnershipActionability,
): CanonicalFeeClassificationResolution | null {
  return ownershipActionability.rowClassifications.find((classification) => classification.feeRowId === feeRowId) ?? null;
}
