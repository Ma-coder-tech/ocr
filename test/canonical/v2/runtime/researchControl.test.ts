import { describe, expect, it } from "vitest";

import {
  ATOMIC_RESEARCH_CONTROL_POLICY_VERSION,
  buildCanonicalClaimResearchControlPlan,
  buildCanonicalResearchTelemetry,
  canonicalTerminalDisposition,
  evaluateCanonicalMarginalValue,
  initialCanonicalSearchUniverse,
  observeCanonicalSearchUniverse,
  researchClaimFamilyForFacet,
  validateCanonicalResearchControlPlan,
  type CanonicalResearchControlRuntimeState,
} from "../../../../src/canonical/v2/runtime/researchControl.js";

const admitted = (facet: Parameters<typeof buildCanonicalClaimResearchControlPlan>[0]["facet"] = "economic_category") =>
  buildCanonicalClaimResearchControlPlan({
    atomicClaimId: `atomic-${facet}`,
    facet,
    researchAdmission: "admitted_to_rg_work_ledger",
    materiality: "material",
    decisionTier: "D2",
    blockingPrerequisiteCodes: [],
    knowledgeQueryPresent: true,
    requiredSourceAuthorities: ["processor_publication"],
  });

describe("Runtime Intelligence Policy Amendment v0.5 research control", () => {
  it("maps the accepted atomic ledger into exactly the five approved claim families", () => {
    expect(new Set([
      researchClaimFamilyForFacet("merchant_lever"),
      researchClaimFamilyForFacet("recurrence"),
      researchClaimFamilyForFacet("economic_owner"),
      researchClaimFamilyForFacet("rule_setter"),
      researchClaimFamilyForFacet("economic_category"),
    ])).toEqual(new Set([
      "negotiability", "recurrence", "economic_ownership", "control_decision_authority", "economic_category",
    ]));
    expect(researchClaimFamilyForFacet("merchant_price_schedule_shape")).toBe("negotiability");
    expect(researchClaimFamilyForFacet("fee_detail_coverage")).toBe("economic_category");
  });

  it("retains prerequisites, unresolved nodes, evidence paths, ceilings, and typed private boundaries without a graph framework", () => {
    const plan = buildCanonicalClaimResearchControlPlan({
      atomicClaimId: "atomic-control",
      facet: "rule_setter",
      researchAdmission: "admitted_to_rg_work_ledger",
      materiality: "material",
      decisionTier: "D2",
      blockingPrerequisiteCodes: ["exact_program_identity"],
      knowledgeQueryPresent: true,
      requiredSourceAuthorities: ["official_network_publication"],
    });
    expect(plan).toMatchObject({
      policyVersion: ATOMIC_RESEARCH_CONTROL_POLICY_VERSION,
      claimFamily: "control_decision_authority",
      resolvedPrerequisiteCodes: ["rf_first_resolution_checked"],
      evidenceCeiling: { code: "public_control_authority_only" },
      initialMarginalValueDecision: { decision: "UPGRADE", externalResearchAuthorized: true },
    });
    expect(plan.remainingUnresolvedNodeCodes).toEqual(expect.arrayContaining([
      "atomic_facet_rule_setter", "exact_program_identity",
      "private_boundary_merchant_agreement_or_addendum",
      "private_boundary_processor_or_account_explanation",
    ]));
    expect(plan.permittedEvidencePaths).toEqual(expect.arrayContaining([
      "rf", "public_document", "merchant_agreement_or_addendum", "processor_or_account_explanation",
    ]));
    expect(validateCanonicalResearchControlPlan(plan)).toEqual([]);
  });

  it("enforces the five non-adjacency evidence ceilings", () => {
    const category = admitted("economic_category").evidenceCeiling;
    const ownership = admitted("economic_owner").evidenceCeiling;
    const collection = admitted("collector").evidenceCeiling;
    const negotiability = admitted("negotiator_change_authority").evidenceCeiling;
    const recurrence = admitted("recurrence").evidenceCeiling;

    expect(category.publicEvidenceMustNotEstablish).toContain("merchant_specific_treatment");
    expect(ownership.publicEvidenceMustNotEstablish).toContain("merchant_specific_pass_through");
    expect(collection.publicEvidenceMustNotEstablish).toContain("processor_ownership_from_collection_alone");
    expect(negotiability.publicEvidenceMustNotEstablish).toContain("merchant_contractual_repricing_right");
    expect(recurrence.publicEvidenceMustNotEstablish).toContain("merchant_incurred_charge_in_prior_months");
  });

  it("produces zero-send dispositions and zero-cost telemetry when materiality, admission, or private evidence gates withhold research", () => {
    const privatePlan = buildCanonicalClaimResearchControlPlan({
      atomicClaimId: "atomic-private",
      facet: "merchant_change_right",
      researchAdmission: "withheld_non_public_evidence_required",
      materiality: "material",
      decisionTier: "D2",
      blockingPrerequisiteCodes: [],
      knowledgeQueryPresent: false,
      requiredSourceAuthorities: [],
    });
    expect(privatePlan.initialMarginalValueDecision).toMatchObject({ decision: "NOTHING",
      externalResearchAuthorized: false });
    expect(privatePlan.planningTerminalDisposition).toBe("unresolved_private_evidence_required");
    const control: CanonicalResearchControlRuntimeState = {
      plan: privatePlan,
      marginalValueDecisions: [privatePlan.initialMarginalValueDecision],
      searchUniverse: initialCanonicalSearchUniverse(),
      terminalDisposition: privatePlan.planningTerminalDisposition,
      telemetry: null,
    };
    expect(buildCanonicalResearchTelemetry({ atomicClaimId: "atomic-private", control,
      expectedDecisionEffects: ["merchant_lever"],
      resource: { providerCalls: 0, searchCalls: 0, aiCalls: 0, retrievalBytes: 0, tokens: 0 },
      verifiedEvidenceCount: 0 })).toMatchObject({
      cost: { providerCalls: 0, searchCalls: 0, aiCalls: 0, retrievalBytes: 0, tokens: 0 },
      admittedSupport: { verifiedEvidenceCount: 0, reachedEvidenceCeiling: false },
      rhReadyProjection: { stateChange: "private_evidence_question_reassessment" },
    });
  });

  it("authorizes external research only for CLOSE, UPGRADE, or NARROW after existing gates pass", () => {
    expect(admitted("economic_category").initialMarginalValueDecision.decision).toBe("CLOSE");
    expect(admitted("economic_owner").initialMarginalValueDecision.decision).toBe("UPGRADE");
    expect(admitted("recurrence").initialMarginalValueDecision.decision).toBe("NARROW");

    const contextual = buildCanonicalClaimResearchControlPlan({
      atomicClaimId: "atomic-context", facet: "economic_category",
      researchAdmission: "contextual_opportunistic_only", materiality: "contextual", decisionTier: "D1",
      blockingPrerequisiteCodes: [], knowledgeQueryPresent: true,
      requiredSourceAuthorities: ["processor_publication"],
    }).initialMarginalValueDecision;
    expect(contextual).toMatchObject({ decision: "CONTEXT_ONLY", externalResearchAuthorized: false });

    const immaterial = buildCanonicalClaimResearchControlPlan({
      atomicClaimId: "atomic-immaterial", facet: "economic_category",
      researchAdmission: "immaterial_no_research", materiality: "immaterial", decisionTier: "D2",
      blockingPrerequisiteCodes: [], knowledgeQueryPresent: true,
      requiredSourceAuthorities: ["processor_publication"],
    }).initialMarginalValueDecision;
    expect(immaterial).toMatchObject({ decision: "NOTHING", externalResearchAuthorized: false });
  });

  it("requires a persisted semantic reassessment before another candidate or refined search", () => {
    const plan = admitted("economic_owner");
    let universe = observeCanonicalSearchUniverse(initialCanonicalSearchUniverse(), {
      formulationFingerprints: ["formulation-v1"],
      documentFingerprints: ["document-v1"],
      applicableAuthorityClasses: ["processor_publication"],
      requiredAuthorityClasses: ["processor_publication"],
    });
    const decision = evaluateCanonicalMarginalValue({
      atomicClaimId: "atomic-economic_owner",
      stage: "candidate_reassessment",
      sequence: 1,
      claimFamily: plan.claimFamily,
      researchAdmission: "admitted_to_rg_work_ledger",
      materiality: "material",
      decisionTier: "D2",
      publicPathPermitted: true,
      searchUniverse: universe,
      claimAlreadyAtCeiling: false,
      candidateOutcome: "qualification_rejected",
    });
    expect(decision).toMatchObject({ stage: "candidate_reassessment", decision: "UPGRADE",
      externalResearchAuthorized: true, searchUniverseHash: universe.stateHash });
    expect(decision.decisionId).toMatch(/^marginal-/);

    universe = observeCanonicalSearchUniverse(universe, {
      formulationFingerprints: ["formulation-v1"],
      documentFingerprints: ["document-v1"],
      applicableAuthorityClasses: ["processor_publication"],
      requiredAuthorityClasses: ["processor_publication"],
    });
    const saturated = evaluateCanonicalMarginalValue({
      atomicClaimId: "atomic-economic_owner", stage: "continuation_reassessment", sequence: 2,
      claimFamily: plan.claimFamily, researchAdmission: "admitted_to_rg_work_ledger", materiality: "material",
      decisionTier: "D2", publicPathPermitted: true, searchUniverse: universe,
      claimAlreadyAtCeiling: false, candidateOutcome: "qualification_rejected",
    });
    expect(saturated).toMatchObject({ decision: "NOTHING", externalResearchAuthorized: false });
  });

  it("treats saturation as a reassessment signal, never exhaustion, and recovers when material novelty appears", () => {
    const first = observeCanonicalSearchUniverse(initialCanonicalSearchUniverse(), {
      formulationFingerprints: ["formulation-v1"], documentFingerprints: ["document-v1"],
      applicableAuthorityClasses: ["processor_publication"], requiredAuthorityClasses: ["processor_publication"],
    });
    const saturated = observeCanonicalSearchUniverse(first, {
      formulationFingerprints: ["formulation-v1"], documentFingerprints: ["document-v1"],
      applicableAuthorityClasses: ["processor_publication"], requiredAuthorityClasses: ["processor_publication"],
    });
    expect(saturated).toMatchObject({ saturationSignal: "applicable_authority_classes_reassessed",
      semanticReassessmentRequired: true, analyticalExhaustionClaimed: false });
    expect(canonicalTerminalDisposition({ executionState: "completed_unresolved",
      stopReason: "no_more_current_formulations", latestDecision: "NOTHING", searchUniverse: saturated,
      privateEvidenceRequired: false })).toBe("saturation_reassessment_required");

    const recovered = observeCanonicalSearchUniverse(saturated, {
      formulationFingerprints: ["formulation-v2"], documentFingerprints: ["document-v2"],
      applicableAuthorityClasses: ["official_network_publication"],
      requiredAuthorityClasses: ["processor_publication", "official_network_publication"],
    });
    expect(recovered).toMatchObject({ saturationSignal: "recovered_by_material_novelty",
      semanticReassessmentRequired: false, analyticalExhaustionClaimed: false });
    const reassessed = evaluateCanonicalMarginalValue({
      atomicClaimId: "atomic-recurrence", stage: "continuation_reassessment", sequence: 3,
      claimFamily: "recurrence", researchAdmission: "admitted_to_rg_work_ledger", materiality: "material",
      decisionTier: "D2", publicPathPermitted: true, searchUniverse: recovered,
      claimAlreadyAtCeiling: false, candidateOutcome: "partial_support",
    });
    expect(reassessed).toMatchObject({ decision: "NARROW", externalResearchAuthorized: true });
  });

  it("reuses negative applicability without turning it into an adjacent positive assertion", () => {
    const first = observeCanonicalSearchUniverse(initialCanonicalSearchUniverse(), {
      formulationFingerprints: ["scope-v1"], documentFingerprints: ["document-v1"],
      applicableAuthorityClasses: ["processor_publication"],
      reusableNegativeApplicabilityKeys: ["wrong-period-2024"],
    });
    const second = observeCanonicalSearchUniverse(first, {
      reusableNegativeApplicabilityKeys: ["wrong-period-2025"],
    });
    expect(second.reusableNegativeApplicabilityKeys).toEqual(["wrong-period-2024", "wrong-period-2025"]);
    expect(second).toMatchObject({ saturationSignal: "reusable_negative_applicability",
      semanticReassessmentRequired: true, analyticalExhaustionClaimed: false });
  });

  it("keeps private-node stopping claim-local while another public material claim remains independently authorized", () => {
    const privateClaim = buildCanonicalClaimResearchControlPlan({
      atomicClaimId: "private-negotiability", facet: "merchant_change_right",
      researchAdmission: "withheld_non_public_evidence_required", materiality: "material", decisionTier: "D2",
      blockingPrerequisiteCodes: [], knowledgeQueryPresent: false, requiredSourceAuthorities: [],
    });
    const publicClaim = admitted("economic_category");
    expect(privateClaim.initialMarginalValueDecision.externalResearchAuthorized).toBe(false);
    expect(privateClaim.planningTerminalDisposition).toBe("unresolved_private_evidence_required");
    expect(publicClaim.initialMarginalValueDecision).toMatchObject({ decision: "CLOSE",
      externalResearchAuthorized: true });
    expect(publicClaim.planningTerminalDisposition).toBeNull();
  });

  it("keeps operation ceilings and attempt counts outside semantic completion authority", () => {
    const universe = initialCanonicalSearchUniverse();
    for (const reason of [
      "rg_emergency_candidate_ceiling_reached_with_claim_unresolved",
      "rg_generation_zero_emergency_cumulative_provider_call_ceiling_reached_not_analytical_completion",
      "attempt_99_budget_exhausted",
    ]) {
      expect(canonicalTerminalDisposition({ executionState: "degraded_emergency_circuit_breaker",
        stopReason: reason, latestDecision: "NARROW", searchUniverse: universe,
        privateEvidenceRequired: false })).toBe("operationally_degraded_not_semantically_complete");
    }
  });

  it("emits privacy-safe cost/support/RH-ready telemetry without changing report authority or financial truth", () => {
    const plan = admitted("recurrence");
    const control: CanonicalResearchControlRuntimeState = {
      plan,
      marginalValueDecisions: [plan.initialMarginalValueDecision],
      searchUniverse: initialCanonicalSearchUniverse(),
      terminalDisposition: "resolved_to_public_evidence_ceiling",
      telemetry: null,
    };
    const financialTruth = Object.freeze({ rbHash: "rb-before", rcHash: "rc-before", rdHash: "rd-before", reHash: "re-before" });
    const telemetry = buildCanonicalResearchTelemetry({ atomicClaimId: "atomic-recurrence", control,
      expectedDecisionEffects: ["recommendation_permission"],
      resource: { providerCalls: 4, searchCalls: 1, aiCalls: 2, retrievalBytes: 2048, tokens: 321 },
      verifiedEvidenceCount: 1 });
    expect(telemetry).toMatchObject({
      cost: { providerCalls: 4, searchCalls: 1, aiCalls: 2, retrievalBytes: 2048, tokens: 321 },
      admittedSupport: { verifiedEvidenceCount: 1, reachedEvidenceCeiling: true },
      rhReadyProjection: { authority: "internal_rh_ready_disposition_only", customerReportAuthority: "unchanged",
        stateChange: "actionability_permission_reassessment",
        maximumPermittedEffect: "recurrence_question_reassessment" },
      privacy: "opaque_ids_enums_and_counts_only",
      budgetSemantics: "operational_circuit_breaker_only",
    });
    expect(financialTruth).toEqual({ rbHash: "rb-before", rcHash: "rc-before", rdHash: "rd-before", reHash: "re-before" });
    expect(JSON.stringify(telemetry)).not.toMatch(/merchant name|account number|agreement text|https?:\/\//i);
  });

  it("is deterministic across restart and isolated across concurrent claims", () => {
    const firstPlan = admitted("economic_category");
    const restartedPlan = admitted("economic_category");
    expect(restartedPlan).toEqual(firstPlan);
    const base = initialCanonicalSearchUniverse();
    const claimA = observeCanonicalSearchUniverse(base, { formulationFingerprints: ["a-form"],
      documentFingerprints: ["a-doc"] });
    const claimAReplay = observeCanonicalSearchUniverse(initialCanonicalSearchUniverse(), {
      formulationFingerprints: ["a-form"], documentFingerprints: ["a-doc"] });
    const claimB = observeCanonicalSearchUniverse(base, { formulationFingerprints: ["b-form"],
      documentFingerprints: ["b-doc"] });
    expect(claimAReplay.stateHash).toBe(claimA.stateHash);
    expect(claimB.stateHash).not.toBe(claimA.stateHash);
    expect(base.documentFingerprints).toEqual([]);
  });
});
