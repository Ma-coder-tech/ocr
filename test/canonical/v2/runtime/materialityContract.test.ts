import { describe, expect, it } from "vitest";

import {
  MATERIALITY_CONTRACT_V1,
  combineMaterialityAxes,
  evaluateEconomicMateriality,
} from "../../../../src/canonical/v2/runtime/materialityContract.js";
import {
  aggregateAtomicClaimMagnitude,
  buildCanonicalRgWorkLedger,
  canonicalAtomicClaimGroupingKey,
  validateAtomicDecisionEvaluation,
  type CanonicalRgClaimAdmission,
} from "../../../../src/canonical/v2/runtime/rgWorkLedger.js";
import type {
  CanonicalUnresolvedClaim,
  CanonicalUnresolvedClaimInventory,
} from "../../../../src/canonical/v2/runtime/unresolvedClaims.js";
import { buildSynthesis } from "../synthesisFixtures.js";

describe("Materiality Contract v1", () => {
  it.each([
    [{ amountMinor: 10_000, authoritativeStatementCostMinor: 1_000_000 }, "E2", "e2_100_dollars_and_1_percent"],
    [{ amountMinor: 9_999, authoritativeStatementCostMinor: 499_950 }, "E1", "e1_relative_1_percent"],
    [{ amountMinor: 50_000, authoritativeStatementCostMinor: 100_000_000 }, "E2", "e2_absolute_500_dollars"],
    [{ amountMinor: 1_000, authoritativeStatementCostMinor: 10_000 }, "E2", "e2_10_dollars_and_10_percent"],
    [{ amountMinor: 999, authoritativeStatementCostMinor: 4_995 }, "E1", "e1_relative_1_percent"],
    [{ amountMinor: 999, authoritativeStatementCostMinor: 100_000 }, "E0", "below_e1_absolute_and_available_relative_thresholds"],
  ] as const)("evaluates exact economic thresholds without annualizing (%o)", (input, tier, reason) => {
    const result = evaluateEconomicMateriality(input);
    expect(result.tier).toBe(tier);
    expect(result.reasonCodes).toContain(reason);
  });

  it("treats an invalid or zero authoritative cost as unavailable rather than zero", () => {
    expect(evaluateEconomicMateriality({ amountMinor: 49_999, authoritativeStatementCostMinor: 0 })).toMatchObject({
      tier: "E1", relativeBasisPoints: null, relativeSignificance: "unavailable",
      reasonCodes: expect.arrayContaining(["relative_significance_unavailable"]),
    });
    expect(evaluateEconomicMateriality({ amountMinor: null, authoritativeStatementCostMinor: null })).toMatchObject({
      tier: "unavailable", relativeBasisPoints: null, relativeSignificance: "unavailable",
    });
  });

  it("records relative magnitude without rounding a below-threshold ratio up to the threshold", () => {
    expect(evaluateEconomicMateriality({ amountMinor: 999, authoritativeStatementCostMinor: 100_000 }))
      .toMatchObject({ tier: "E0", relativeBasisPoints: 99.9 });
  });

  it("implements the approved two-axis matrix and freezes business/benchmark exclusion", () => {
    expect(MATERIALITY_CONTRACT_V1).toMatchObject({
      authority: "versioned_product_semantics",
      magnitudeBasis: "observed_statement_period_atomic_claim",
      annualization: "prohibited",
      businessTypeAuthority: "excluded",
      benchmarkAuthority: "excluded",
    });
    expect(combineMaterialityAxes("E2", "D0")).toBe("contextual");
    expect(combineMaterialityAxes("E1", "D2")).toBe("material");
    expect(combineMaterialityAxes("E0", "D1")).toBe("contextual");
    expect(combineMaterialityAxes("E0", "D0")).toBe("immaterial");
    expect(combineMaterialityAxes("unavailable", "D2")).toBe("material");
    expect(combineMaterialityAxes("unavailable", "D0")).toBe("unresolved");
  });

  it("groups only exact semantics, preserves credit direction, and never double-counts a canonical subject", () => {
    const base = {
      claimClass: "economic_ownership" as const,
      facet: "economic_owner" as const,
      opaqueSubjectCode: "opaque-subject",
      scopeFingerprint: "scope-a",
      period: "2026-07-31",
      direction: "debit" as const,
    };
    const key = canonicalAtomicClaimGroupingKey(base);
    expect(canonicalAtomicClaimGroupingKey({ ...base, facet: "economic_beneficiary" })).not.toBe(key);
    expect(canonicalAtomicClaimGroupingKey({ ...base, scopeFingerprint: "scope-b" })).not.toBe(key);
    expect(canonicalAtomicClaimGroupingKey({ ...base, period: "2026-08-31" })).not.toBe(key);
    expect(canonicalAtomicClaimGroupingKey({ ...base, direction: "credit" })).not.toBe(key);
    expect(aggregateAtomicClaimMagnitude([
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 1_000 },
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 1_000 },
      { canonicalSubjectRefs: ["charge-b"], amountMinor: 500 },
    ])).toBe(1_500);
    expect(() => aggregateAtomicClaimMagnitude([
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 1_000 },
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 999 },
    ])).toThrow("rg_canonical_subject_magnitude_conflict:charge-a");
  });

  it("assigns independent D0, D1, and D2 tiers to exact facets of the same charge", () => {
    const synthesis = buildSynthesis();
    const economic = synthesis.economicAnalysis;
    const charge = economic.economicLayer.charges.find((item) => item.subtype === "service_admin")!;
    const ledger = buildCanonicalRgWorkLedger({
      inventory: inventoryFor(charge.id, charge.sourceOccurrenceRefs, ["economic_category", "economic_control", "merchant_actionability"]),
      economic,
      synthesis: { ...synthesis, synthesisLayer: { ...synthesis.synthesisLayer, merchantLevers: [] } },
      rfResolution: null,
    });
    const facets = new Map(ledger.claimAdmissions.map((admission) => [admission.facet, admission]));

    expect(facets.get("economic_category")?.decisionTier).toBe("D2");
    expect(facets.get("economic_category")?.decisionBasis.admissibleOutcomes.map((item) => item.outcomeClass))
      .toEqual(["processor_or_service_category", "network_or_issuer_category"]);
    expect(facets.get("collector")?.decisionTier).toBe("D1");
    expect(facets.get("billing_intermediary")?.decisionTier).toBe("D1");
    expect(facets.get("merchant_lever")?.decisionTier).toBe("D0");
    expect(ledger.validation).toMatchObject({ status: "valid", errors: [] });
  });

  it("does not make a small collector or intermediary material when a different exact control facet unlocks a lever", () => {
    const synthesis = buildSynthesis();
    const sourceEconomic = synthesis.economicAnalysis;
    const economic = {
      ...sourceEconomic,
      economicLayer: {
        ...sourceEconomic.economicLayer,
        roleClaims: sourceEconomic.economicLayer.roleClaims.filter((role) => role.dimension !== "negotiator_change_authority"),
      },
    };
    const charge = economic.economicLayer.charges.find((item) => item.subtype === "service_admin")!;
    const candidateLevers = synthesis.synthesisLayer.merchantLevers.map((lever) => ({
      ...lever,
      state: "candidate_requires_verification" as const,
    }));
    const ledger = buildCanonicalRgWorkLedger({
      inventory: inventoryFor(charge.id, charge.sourceOccurrenceRefs, ["economic_control"]),
      economic,
      synthesis: {
        ...synthesis,
        economicAnalysis: economic,
        synthesisLayer: { ...synthesis.synthesisLayer, merchantLevers: candidateLevers },
      },
      rfResolution: null,
    });
    const facets = new Map(ledger.claimAdmissions.map((admission) => [admission.facet, admission]));

    expect(facets.get("negotiator_change_authority")).toMatchObject({
      decisionTier: "D2",
      materiality: "material",
      decisionBasis: {
        presentlyReachableEffects: ["merchant_lever"],
        admissibleOutcomes: expect.arrayContaining([
          expect.objectContaining({ outcomeClass: "negotiator_change_authority_proven_applicable" }),
          expect.objectContaining({ outcomeClass: "negotiator_change_authority_proven_not_applicable_or_different_authority" }),
        ]),
      },
    });
    expect(facets.get("collector")).toMatchObject({ decisionTier: "D1", materiality: "contextual" });
    expect(facets.get("billing_intermediary")).toMatchObject({ decisionTier: "D1", materiality: "contextual" });
    expect(facets.get("collector")?.decisionBasis.presentlyReachableEffects).toEqual([]);
    expect(ledger.validation.status).toBe("valid");
  });

  it("rejects D2 without an exact reachable effect and materially different admissible outcome classes", () => {
    const emptyBasis: CanonicalRgClaimAdmission["decisionBasis"] = {
      atomicFacet: "collector",
      presentlyReachableEffects: [],
      independentBlockingFacets: [],
      independentBlockingPrerequisiteCodes: [],
      admissibleOutcomes: [],
    };
    expect(validateAtomicDecisionEvaluation({ facet: "collector", tier: "D2", basis: emptyBasis }))
      .toContain("rg_d2_missing_reachable_materially_different_admissible_outcomes");

    const sameResultBasis: CanonicalRgClaimAdmission["decisionBasis"] = {
      ...emptyBasis,
      presentlyReachableEffects: ["merchant_lever"],
      admissibleOutcomes: [
        { outcomeClass: "collector_is_processor", resultingEffect: "merchant_lever", merchantFacingStateCode: "permission_withheld" },
        { outcomeClass: "collector_is_third_party", resultingEffect: "merchant_lever", merchantFacingStateCode: "permission_withheld" },
      ],
    };
    expect(validateAtomicDecisionEvaluation({ facet: "collector", tier: "D2", basis: sameResultBasis }))
      .toContain("rg_d2_missing_reachable_materially_different_admissible_outcomes");

    const placeholderBasis: CanonicalRgClaimAdmission["decisionBasis"] = {
      ...sameResultBasis,
      admissibleOutcomes: [
        { outcomeClass: "facet_answer_changes_interpretation_or_permission", resultingEffect: "merchant_lever", merchantFacingStateCode: "permission_reachable" },
        { outcomeClass: "alternate_admissible_answer_withholds_or_changes_it", resultingEffect: "merchant_lever", merchantFacingStateCode: "permission_withheld" },
      ],
    };
    expect(validateAtomicDecisionEvaluation({ facet: "collector", tier: "D2", basis: placeholderBasis }))
      .toContain("rg_decision_outcome_uses_generic_placeholder");
  });
});

function inventoryFor(
  chargeRef: string,
  occurrenceRefs: string[],
  classes: CanonicalUnresolvedClaim["claimClass"][],
): CanonicalUnresolvedClaimInventory {
  const effects: Record<CanonicalUnresolvedClaim["claimClass"], CanonicalUnresolvedClaim["possibleDecisionEffects"]> = {
    pricing_underlying_cost: ["pricing_interpretation"],
    pricing_schedule: ["pricing_interpretation"],
    pricing_scope: ["pricing_interpretation"],
    fee_detail_coverage: ["cost_stack_completeness"],
    economic_category: ["economic_interpretation", "composition_permission", "merchant_attention"],
    economic_ownership: ["economic_interpretation", "composition_permission", "merchant_attention"],
    economic_control: ["merchant_lever", "recommendation_permission"],
    merchant_actionability: ["merchant_attention", "merchant_lever", "recommendation_permission", "impact_permission"],
  };
  const required: Record<CanonicalUnresolvedClaim["claimClass"], CanonicalUnresolvedClaim["requiredEvidenceClass"]> = {
    pricing_underlying_cost: "admitted_pricing_evidence",
    pricing_schedule: "admitted_pricing_evidence",
    pricing_scope: "admitted_pricing_evidence",
    fee_detail_coverage: "admitted_fee_detail_evidence",
    economic_category: "admitted_category_mapping",
    economic_ownership: "positive_period_applicable_ownership_evidence",
    economic_control: "positive_period_applicable_control_evidence",
    merchant_actionability: "proven_control_recurrence_and_counterfactual_evidence",
  };
  const claims = classes.map((claimClass, index): CanonicalUnresolvedClaim => ({
    claimId: `adversarial-${claimClass}-${index}`,
    claimClass,
    state: "unresolved",
    canonicalRefs: [chargeRef],
    occurrenceRefs,
    evidenceRefs: [],
    amountUnderReview: { amountMinor: 1, currency: "USD", direction: "debit" },
    requiredEvidenceClass: required[claimClass],
    possibleDecisionEffects: effects[claimClass],
    blockingEffect: "limits_authority",
    materialityState: "not_evaluated",
    researchEligibility: "not_evaluated",
    limitations: [],
  }));
  return {
    schemaVersion: "canonical_unresolved_claim_inventory_v2",
    authority: "canonical_dependency_inventory_only",
    productionExecution: "rf_claim_resolution_enabled",
    rfResolution: "claim_specific_admitted_resolution_enabled",
    rgResearch: "disabled",
    benchmarkExecution: "disabled",
    businessContextAuthority: "excluded_from_canonical_economics",
    claims,
    countsByClass: Object.fromEntries(classes.map((claimClass) => [claimClass, 1])),
    validation: { status: "valid", errors: [], warnings: [] },
  };
}
