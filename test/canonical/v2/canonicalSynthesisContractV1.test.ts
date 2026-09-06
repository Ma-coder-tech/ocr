import { describe, expect, it } from "vitest";

import { canonicalContractV1QuestionScopeFingerprint,
  compileCanonicalSynthesisContractV1 } from "../../../src/canonical/v2/synthesisContractV1.js";
import type { CanonicalSynthesisContractV1Application } from "../../../src/canonical/v2/synthesisContractV1Types.js";
import { CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1 } from "../../../src/canonical/v2/synthesisContractV1Types.js";
import { validateCanonicalSynthesisContractV1Envelope } from "../../../src/canonical/v2/synthesisContractV1Admission.js";
import { economicWithNegotiator } from "./synthesisFixtures.js";

describe("Canonical Synthesis Admission Contract v1", () => {
  it("activates the v1.1 pricing-application review only as an exact verification request", () => {
    const economic = contractEconomic();
    const review = app(economic, "pricing-application-review", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "request_pricing_application_review", requiredInfluence: "none",
      mechanismCode: "observed_pricing_application_explanation", verificationRequirementCode: "explain_observed_application",
      requestTargetCode: "processor_pricing_support", implementationDependencyCodes: [],
    });
    const recurrence = app(economic, "review-recurrence", "recurrence", {
      kind: "synthesis_recurrence", recurrenceBasis: "verified_schedule", occurrencesPerYear: 12,
    });
    const built = compileCanonicalSynthesisContractV1({ economic,
      contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1, applications: [review, recurrence] });
    expect(built.state.validation.status).toBe("valid");
    expect(built.state.actions[0]).toMatchObject({ safeActionCode: "request_pricing_application_review",
      class: "candidate_verification", state: "documentation_or_monitoring_only", requiredInfluence: "none",
      permissionCeiling: "verification_or_document_request", counterfactualApplicationRef: null,
      recurrenceApplicationRef: null });
    expect(built.merchantLevers[0]).toMatchObject({ leverType: "documentation_verification" });

    const legacy = { ...review, atomicClaimId: "legacy-action", applicationId: "app-legacy-action",
      value: { ...review.value, safeActionCode: "request_pricing_term_review" as const,
        requiredInfluence: "merchant_change_right" as const } };
    expect(compileCanonicalSynthesisContractV1({ economic,
      contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1, applications: [legacy] }).state.validation.errors)
      .toContain("contract_action_not_active_for_bound_version:legacy-action:request_pricing_term_review");
  });
  it("keeps constraint identity independent from effects, actionability, and impact", () => {
    const economic = contractEconomic();
    const constraint = app(economic, "constraint-a", "constraint", {
      kind: "synthesis_constraint_identity", applicability: "applicable", governingAuthorityCode: "network_authority",
    });
    const built = compileCanonicalSynthesisContractV1({ economic, applications: [constraint] });

    expect(built.state.validation.status).toBe("valid");
    expect(built.state.constraints).toEqual([expect.objectContaining({ atomicClaimId: "constraint-a", applicability: "applicable" })]);
    expect(built.state.constraintActionEffects).toEqual([]);
    expect(built.state.actions).toEqual([]);
    expect(built.merchantLevers).toEqual([]);
    expect(built.counterfactuals).toEqual([]);
  });

  it("progresses explanation, actionability, statement impact, and annual impact only from independent exact facets", () => {
    const economic = contractEconomic();
    const driver = app(economic, "driver-a", "economic_driver", {
      kind: "synthesis_economic_driver", driverType: "fixed_fee_burden", populationPredicateCode: "fixed_fee_population",
    });
    const action = app(economic, "action-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "request_pricing_term_review",
      requiredInfluence: "merchant_change_right", mechanismCode: "pricing_review_request",
      verificationRequirementCode: null, requestTargetCode: "processor_pricing_review_channel", implementationDependencyCodes: [],
    });
    const counterfactual = app(economic, "counterfactual-a", "counterfactual", {
      kind: "synthesis_counterfactual", safeActionCode: "request_pricing_term_review",
      resultState: "exact_deterministic_delta", alternativeAmountMinor: 0, currency: "USD",
      assumptionCodes: ["same_period_and_scope"], implementationDependencyCodes: [], grossOrNet: "gross",
    });

    const withoutRight = compileCanonicalSynthesisContractV1({ economic, applications: [driver, action, counterfactual] });
    expect(withoutRight.state.actions[0]).toMatchObject({ state: "candidate_requires_verification", permissionCeiling: "none" });

    const right = app(economic, "right-a", "merchant_change_right", {
      kind: "synthesis_merchant_influence", safeActionCode: "request_pricing_term_review",
      influenceKind: "merchant_change_right", state: "proven", authorityRelationshipCode: "merchant_pricing_review_right",
    });
    const statement = compileCanonicalSynthesisContractV1({ economic, applications: [driver, action, counterfactual, right] });
    expect(statement.state.actions[0]).toMatchObject({ state: "eligible_supported",
      permissionCeiling: "supported_action_with_statement_period_impact" });

    const recurrence = app(economic, "recurrence-a", "recurrence", {
      kind: "synthesis_recurrence", recurrenceBasis: "verified_schedule", occurrencesPerYear: 12,
    });
    const annual = compileCanonicalSynthesisContractV1({ economic, applications: [driver, action, counterfactual, right, recurrence] });
    expect(annual.state.actions[0]).toMatchObject({ permissionCeiling: "supported_action_with_annual_impact" });
    expect(annual.counterfactuals[0]).toMatchObject({ annualized: true, recurrenceProven: true });
  });

  it("refuses recurrence bases whose declared evidence route does not match their proof semantics", () => {
    const economic = contractEconomic();
    for (const recurrenceBasis of ["merchant_contract", "multi_statement"] as const) {
      const masquerading = app(economic, `recurrence-${recurrenceBasis}`, "recurrence", {
        kind: "synthesis_recurrence", recurrenceBasis, occurrencesPerYear: 12,
      });
      const built = compileCanonicalSynthesisContractV1({ economic, applications: [masquerading] });
      expect(built.state.validation).toMatchObject({ status: "invalid",
        errors: [`contract_v1_recurrence_evidence_route_mismatch:recurrence-${recurrenceBasis}`] });
    }

    const merchantContract = { ...app(economic, "recurrence-contract", "recurrence", {
      kind: "synthesis_recurrence", recurrenceBasis: "merchant_contract", occurrencesPerYear: 12,
    }), derivabilityTier: "requires_merchant_pricing_document" as const,
    evidenceClass: "merchant_document_supported" as const };
    const multiStatement = { ...app(economic, "recurrence-history", "recurrence", {
      kind: "synthesis_recurrence", recurrenceBasis: "multi_statement", occurrencesPerYear: 12,
    }), derivabilityTier: "requires_additional_statement_history" as const,
    evidenceClass: "multi_statement_supported" as const };
    expect(compileCanonicalSynthesisContractV1({ economic, applications: [merchantContract] }).state.validation.status)
      .toBe("valid");
    expect(compileCanonicalSynthesisContractV1({ economic, applications: [multiStatement] }).state.validation.status)
      .toBe("valid");
  });

  it("derives theme identity from exact atomic subject and direction rather than the reusable scope alone", () => {
    const economic = contractEconomic();
    const first = app(economic, "driver-subject-a", "economic_driver", {
      kind: "synthesis_economic_driver", driverType: "fixed_fee_burden", populationPredicateCode: "fixed_fee_population",
    });
    const second = app(economic, "driver-subject-b", "economic_driver", {
      kind: "synthesis_economic_driver", driverType: "minimum_fee_burden", populationPredicateCode: "minimum_fee_population",
    });
    expect(first.scopeFingerprint).toBe(second.scopeFingerprint);
    const separateSubjects = compileCanonicalSynthesisContractV1({ economic, applications: [first, second] });
    expect(new Set(separateSubjects.themes.map((theme) => theme.canonicalQuestionScopeFingerprint)).size).toBe(2);

    const debitCharge = economic.economicLayer.charges.find((charge) => charge.id === first.chargeRefs[0])!;
    const creditCharge = { ...structuredClone(debitCharge), id: `${debitCharge.id}_credit`, financialDirection: "credit" as const };
    economic.economicLayer.charges.push(creditCharge);
    const sameSubjectDebit = { ...first, atomicClaimId: "same-opaque-subject", applicationId: "app-direction-debit" };
    const sameSubjectCredit = { ...first, atomicClaimId: "same-opaque-subject", applicationId: "app-direction-credit",
      chargeRefs: [creditCharge.id] };
    expect(canonicalContractV1QuestionScopeFingerprint(economic, sameSubjectDebit))
      .not.toBe(canonicalContractV1QuestionScopeFingerprint(economic, sameSubjectCredit));
    const separateDirections = compileCanonicalSynthesisContractV1({ economic,
      applications: [sameSubjectDebit, sameSubjectCredit] });
    expect(new Set(separateDirections.themes.map((theme) => theme.canonicalQuestionScopeFingerprint)).size).toBe(2);
    expect(separateDirections.themes.every((theme) => /^[a-f0-9]{64}$/.test(theme.canonicalQuestionScopeFingerprint!))).toBe(true);
  });

  it("supports monitoring without influence proof and does not bleed that permission to another action or charge", () => {
    const economic = contractEconomic();
    const monitoring = app(economic, "monitor-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "establish_monitoring_baseline", requiredInfluence: "none",
      mechanismCode: "compatible_statement_history", verificationRequirementCode: null, requestTargetCode: null,
      implementationDependencyCodes: [],
    });
    const pricing = app(economic, "pricing-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "request_pricing_term_review", requiredInfluence: "merchant_change_right",
      mechanismCode: "pricing_review_request", verificationRequirementCode: null,
      requestTargetCode: "processor_pricing_review_channel", implementationDependencyCodes: [],
    });
    const built = compileCanonicalSynthesisContractV1({ economic, applications: [monitoring, pricing] });
    const byCode = new Map(built.state.actions.map((item) => [item.safeActionCode, item]));
    expect(byCode.get("establish_monitoring_baseline")).toMatchObject({ state: "eligible_supported",
      permissionCeiling: "supported_action_no_quantified_impact" });
    expect(byCode.get("request_pricing_term_review")).toMatchObject({ state: "candidate_requires_verification",
      permissionCeiling: "none" });
  });

  it("does not let a mismatched scope, period, or catalog prerequisite unlock the exact action", () => {
    const economic = contractEconomic();
    const pricing = app(economic, "pricing-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "request_pricing_term_review", requiredInfluence: "merchant_change_right",
      mechanismCode: "pricing_review_request", verificationRequirementCode: null,
      requestTargetCode: "processor_pricing_review_channel", implementationDependencyCodes: [],
    });
    const wrongScope = { ...app(economic, "right-a", "merchant_change_right", {
      kind: "synthesis_merchant_influence", safeActionCode: "request_pricing_term_review",
      influenceKind: "merchant_change_right", state: "proven", authorityRelationshipCode: "merchant_pricing_review_right",
    }), scopeFingerprint: "different-scope" };
    expect(compileCanonicalSynthesisContractV1({ economic, applications: [pricing, wrongScope] }).state.actions[0])
      .toMatchObject({ state: "candidate_requires_verification", permissionCeiling: "none" });

    const providerBroadened = { ...pricing, atomicClaimId: "pricing-b", applicationId: "app-pricing-b",
      value: { ...pricing.value, requiredInfluence: "none" as const } };
    expect(compileCanonicalSynthesisContractV1({ economic, applications: [providerBroadened] }).state.actions[0])
      .toMatchObject({ state: "candidate_requires_verification", permissionCeiling: "none" });
  });

  it("keeps contextual unresolved work internal and refuses to turn impact proof into actionability", () => {
    const economic = contractEconomic();
    const candidate = { ...app(economic, "docs-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "request_governing_documentation", requiredInfluence: "none",
      mechanismCode: "document_request", verificationRequirementCode: "merchant_pricing_schedule",
      requestTargetCode: "processor_document_holder", implementationDependencyCodes: [],
    }), materiality: "contextual" as const };
    const action = app(economic, "action-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "request_pricing_term_review", requiredInfluence: "merchant_change_right",
      mechanismCode: "pricing_review_request", verificationRequirementCode: null,
      requestTargetCode: "processor_pricing_review_channel", implementationDependencyCodes: [],
    });
    const impact = app(economic, "impact-a", "counterfactual", {
      kind: "synthesis_counterfactual", safeActionCode: "request_pricing_term_review",
      resultState: "exact_deterministic_delta", alternativeAmountMinor: 0, currency: "USD",
      assumptionCodes: ["same_period_and_scope"], implementationDependencyCodes: [], grossOrNet: "gross",
    });
    const built = compileCanonicalSynthesisContractV1({ economic, applications: [candidate, action, impact] });
    expect(built.state.actions.find((item) => item.atomicClaimId === "docs-a"))
      .toMatchObject({ state: "candidate_requires_verification", permissionCeiling: "none" });
    expect(built.themes.find((item) => item.key.includes("contract_lever") && item.proof.evidenceRefs.includes("evidence-docs-a")))
      .toMatchObject({ materiality: "contextual", priorityClass: "context" });
    expect(built.state.actions.find((item) => item.atomicClaimId === "action-a"))
      .toMatchObject({ state: "candidate_requires_verification", permissionCeiling: "none" });
  });

  it("makes an exact action unavailable only from a supported block or positively unsatisfied exact condition", () => {
    const economic = contractEconomic();
    const constraint = app(economic, "constraint-a", "constraint", {
      kind: "synthesis_constraint_identity", applicability: "applicable", governingAuthorityCode: "network_authority",
    });
    const action = app(economic, "action-a", "merchant_lever", {
      kind: "synthesis_safe_action", safeActionCode: "establish_monitoring_baseline", requiredInfluence: "none",
      mechanismCode: "compatible_statement_history", verificationRequirementCode: null, requestTargetCode: null,
      implementationDependencyCodes: [],
    });
    const block = app(economic, "effect-a", "constraint_action_effect", {
      kind: "synthesis_constraint_action_effect", constraintAtomicClaimId: "constraint-a",
      safeActionCode: "establish_monitoring_baseline", effectState: "blocks_action", conditionAtomicClaimIds: [], dependencyCodes: [],
    });
    const built = compileCanonicalSynthesisContractV1({ economic, applications: [constraint, action, block] });
    expect(built.state.actions[0]).toMatchObject({ state: "not_available", permissionCeiling: "none" });

    const unrelated = { ...block, atomicClaimId: "effect-b", applicationId: "app-effect-b",
      value: { ...block.value, safeActionCode: "request_pricing_term_review" as const } };
    const isolated = compileCanonicalSynthesisContractV1({ economic, applications: [constraint, action, unrelated] });
    expect(isolated.state.actions[0]).toMatchObject({ state: "eligible_supported" });

    const conditional = app(economic, "effect-c", "constraint_action_effect", {
      kind: "synthesis_constraint_action_effect", constraintAtomicClaimId: "constraint-a",
      safeActionCode: "establish_monitoring_baseline", effectState: "conditions_action",
      conditionAtomicClaimIds: ["condition-a"], dependencyCodes: [],
    });
    const conditionAbsent = compileCanonicalSynthesisContractV1({ economic, applications: [constraint, action, conditional] });
    expect(conditionAbsent.state.actions[0]).toMatchObject({ state: "candidate_requires_verification" });
    const conditionNegative = app(economic, "condition-a", "constraint_condition", {
      kind: "synthesis_condition_state", constraintAtomicClaimId: "constraint-a",
      safeActionCode: "establish_monitoring_baseline", conditionCode: "certification_complete", state: "not_satisfied",
    });
    const unavailable = compileCanonicalSynthesisContractV1({ economic, applications: [constraint, action, conditional, conditionNegative] });
    expect(unavailable.state.actions[0]).toMatchObject({ state: "not_available" });
  });

  it("is restart-deterministic and rejects corrupt/stale application envelopes before RE admission", () => {
    const economic = contractEconomic();
    const application = app(economic, "constraint-a", "constraint", {
      kind: "synthesis_constraint_identity", applicability: "applicable", governingAuthorityCode: "network_authority",
    });
    expect(compileCanonicalSynthesisContractV1({ economic, applications: [application] }))
      .toEqual(compileCanonicalSynthesisContractV1({ economic, applications: structuredClone([application]) }));

    const errors = validateCanonicalSynthesisContractV1Envelope({ applications: [application], applicationHash: "0".repeat(64),
      rfPrecedenceChecked: true, boundRfSnapshotHash: "1".repeat(64), evidenceRegistry: {
        registryHash: "2".repeat(64), validation: { status: "invalid", errors: ["stale_registry"] }, evidence: [],
      } });
    expect(errors).toEqual(expect.arrayContaining([
      "contract_v1_external_evidence_registry_invalid", "contract_v1_external_evidence_registry_hash_mismatch",
      "contract_v1_application_hash_mismatch",
    ]));
  });
});

function app(economic: ReturnType<typeof economicWithNegotiator>, atomicClaimId: string,
  facet: CanonicalSynthesisContractV1Application["facet"], value: CanonicalSynthesisContractV1Application["value"]): CanonicalSynthesisContractV1Application {
  const charge = economic.economicLayer.charges.find((item) => item.observedAmount && item.pricingPopulationRefs.length > 0)!;
  const period = economic.pricingAnalysis.foundation.identity.statementPeriod!;
  return { applicationId: `app-${atomicClaimId}`, atomicClaimId, facet, chargeRefs: [charge.id],
    occurrenceRefs: charge.sourceOccurrenceRefs, scopeFingerprint: "a".repeat(32), statementPeriod: period,
    sourceKind: "current_run_verified_rg_evidence", value, evidenceRefs: [`evidence-${atomicClaimId}`], rfEntryRefs: [],
    derivabilityTier: "requires_external_rule_or_schedule", evidenceClass: "public_documentation_verified",
    assertionBasis: "external_verified", effectiveFrom: null, effectiveTo: null, scopeFingerprintVerified: true,
    exactFacetVerified: true, materiality: "material" };
}

function contractEconomic(): ReturnType<typeof economicWithNegotiator> {
  const economic = structuredClone(economicWithNegotiator());
  const charge = economic.economicLayer.charges.find((item) => item.observedAmount)!;
  charge.pricingPopulationRefs = [economic.pricingAnalysis.pricingArchitecture.pricingPopulations[0]!.id];
  return economic;
}
