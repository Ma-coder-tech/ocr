import { describe, expect, it } from "vitest";

import { buildCanonicalUnresolvedClaimInventory } from "../../../../src/canonical/v2/runtime/unresolvedClaims.js";
import { buildCanonicalRgWorkLedger } from "../../../../src/canonical/v2/runtime/rgWorkLedger.js";
import { compileCanonicalSynthesisContractV1 } from "../../../../src/canonical/v2/synthesisContractV1.js";
import { CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1,
  type CanonicalSynthesisContractV1Application } from "../../../../src/canonical/v2/synthesisContractV1Types.js";
import type { KnowledgeQuery } from "../../../../src/canonical/v2/knowledge/knowledgeTypes.js";
import { buildSynthesis } from "../synthesisFixtures.js";

describe("Contract-v1.1 deterministic prerequisite projection", () => {
  it("projects exactly one action-scoped change-right and independently recomputes materiality", () => {
    const fixture = fixtureFor([safeAction("configuration", "review_supported_configuration_change",
      "merchant_change_right")]);
    const inventory = project(fixture);
    const children = inventory.claims.filter((item) => item.prerequisite);
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ unresolvedFacets: ["merchant_change_right"],
      prerequisite: { safeActionCode: "review_supported_configuration_change", kind: "merchant_influence",
        evidenceRoute: "merchant_document", decisionTier: "D2" } });

    const ledger = plan(inventory, fixture.economic, fixture.synthesis);
    const child = ledger.claimAdmissions.find((item) => item.facet === "merchant_change_right")!;
    expect(child).toMatchObject({ decisionTier: "D2", materiality: "material",
      researchAdmission: "withheld_merchant_document_evidence_required",
      expectedKnowledgeValueConstraint: { kind: "synthesis_merchant_influence",
        safeActionCode: "review_supported_configuration_change", influenceKind: "merchant_change_right" } });
    expect(child.magnitude.amountMinor).toBe(100_000);
    expect(fixture.applications[0]!.materiality).toBe("immaterial");
    expect(ledger.workItems).toEqual([]);
  });

  it("never projects stronger prerequisites from pricing application review or monitoring", () => {
    const fixture = fixtureFor([
      { ...safeAction("pricing-review", "request_pricing_application_review", "none", "explain_observed_application"),
        materiality: "material" as const },
      { ...safeAction("monitor", "establish_monitoring_baseline", "none", null), materiality: "material" as const },
    ]);
    const inventory = project(fixture);
    expect(inventory.claims.filter((item) => item.prerequisite)).toEqual([]);
    expect(fixture.synthesis.synthesisLayer.contractV1?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ safeActionCode: "request_pricing_application_review",
        permissionCeiling: "verification_or_document_request", requiredInfluence: "none" }),
      expect.objectContaining({ safeActionCode: "establish_monitoring_baseline", requiredInfluence: "none" }),
    ]));
    const ledger = plan(inventory, fixture.economic, fixture.synthesis);
    expect(ledger.claimAdmissions.filter((item) => item.facet === "counterfactual")).toEqual(
      expect.arrayContaining([expect.objectContaining({ researchAdmission: "withheld_no_authorized_research_mapping",
        knowledgeQuery: null, expectedKnowledgeValueConstraint: null })]),
    );
    expect(ledger.workItems.some((item) => item.expectedKnowledgeValueConstraint.kind === "synthesis_counterfactual"))
      .toBe(false);
  });

  it("projects an operational driver only through the inherited exact public scope", () => {
    const action = safeAction("operational", "review_supported_operational_process_change",
      "merchant_operational_controllability");
    const control = application("control", "merchant_operational_controllability", {
      kind: "synthesis_merchant_influence", safeActionCode: "review_supported_operational_process_change",
      influenceKind: "merchant_operational_controllability", state: "proven",
      authorityRelationshipCode: "merchant_controls_exact_process",
    });
    const fixture = fixtureFor([action, control]);
    const inventory = project(fixture);
    const child = inventory.claims.find((item) => item.prerequisite?.kind === "economic_driver")!;
    expect(child.prerequisite).toMatchObject({ evidenceRoute: "public_document", decisionTier: "D2",
      expectedKnowledgeValueConstraint: { kind: "synthesis_economic_driver" } });
    const ledger = plan(inventory, fixture.economic, fixture.synthesis);
    expect(ledger.claimAdmissions.find((item) => item.facet === "economic_driver"
      && item.expectedKnowledgeValueConstraint?.kind === "synthesis_economic_driver")).toMatchObject({
      researchAdmission: "admitted_to_rg_work_ledger", knowledgeQuery: { claimType: "processor_term",
        scope: expect.objectContaining({ processor: "fiserv" }) },
    });
    expect(ledger.workItems.filter((item) => item.atomicClaimId === child.prerequisite?.forcedAtomicClaimId)).toHaveLength(0);
    expect(ledger.workItems.some((item) => item.expectedKnowledgeValueConstraint.kind === "synthesis_economic_driver")).toBe(true);
  });

  it("keeps an exact named condition isolated and does not invent a route or condition code", () => {
    const action = safeAction("configuration", "review_supported_configuration_change", "merchant_change_right");
    const right = application("right", "merchant_change_right", {
      kind: "synthesis_merchant_influence", safeActionCode: "review_supported_configuration_change",
      influenceKind: "merchant_change_right", state: "proven", authorityRelationshipCode: "exact_configuration_right",
    });
    const constraint = application("constraint", "constraint", {
      kind: "synthesis_constraint_identity", applicability: "applicable", governingAuthorityCode: "network_authority",
    });
    const effect = application("effect", "constraint_action_effect", {
      kind: "synthesis_constraint_action_effect", constraintAtomicClaimId: "constraint",
      safeActionCode: "review_supported_configuration_change", effectState: "conditions_action",
      conditionAtomicClaimIds: ["condition-exact-a"], dependencyCodes: [],
    });
    const fixture = fixtureFor([action, right, constraint, effect]);
    const inventory = project(fixture);
    const conditions = inventory.claims.filter((item) => item.prerequisite?.kind === "constraint_condition");
    expect(conditions).toHaveLength(1);
    const ledger = plan(inventory, fixture.economic, fixture.synthesis);
    expect(ledger.claimAdmissions.find((item) => item.atomicClaimId === "condition-exact-a")).toMatchObject({
      facet: "constraint_condition", decisionTier: "D2", researchAdmission: "withheld_evidence_route_unresolved",
      expectedKnowledgeValueConstraint: null,
    });
    expect(ledger.claimAdmissions.some((item) => item.facet === "constraint_action_effect"
      && item.atomicClaimId !== "condition-exact-a")).toBe(false);
  });

  it("is a deterministic fixed point across replay and preserves route-specific withheld history", () => {
    const fixture = fixtureFor([safeAction("configuration", "review_supported_configuration_change",
      "merchant_change_right")]);
    const first = project(fixture);
    const replay = buildCanonicalUnresolvedClaimInventory({ pricing: fixture.economic.pricingAnalysis,
      economic: structuredClone(fixture.economic), synthesis: structuredClone(fixture.synthesis),
      projectionScopeBindings: structuredClone(fixture.bindings) });
    expect(replay).toEqual(first);

    const history = structuredClone(first);
    const projected = history.claims.find((item) => item.prerequisite)!;
    projected.prerequisite = { ...projected.prerequisite!, evidenceRoute: "additional_statement_history",
      expectedKnowledgeValueConstraint: null, knowledgeQuery: null };
    history.claims = [projected];
    history.countsByClass = { merchant_actionability: 1 };
    const ledger = plan(history, fixture.economic, fixture.synthesis);
    expect(ledger.claimAdmissions[0]).toMatchObject({
      researchAdmission: "withheld_additional_statement_history_required", knowledgeQuery: null,
    });
    expect(ledger.workItems).toEqual([]);
  });
});

function fixtureFor(applications: CanonicalSynthesisContractV1Application[]) {
  const base = buildSynthesis();
  const economic = structuredClone(base.economicAnalysis);
  const charge = economic.economicLayer.charges.find((item) => item.observedAmount && item.pricingPopulationRefs.length > 0)
    ?? economic.economicLayer.charges.find((item) => item.observedAmount)!;
  charge.observedAmount = { currency: "USD", amountMinor: 100_000 };
  if (charge.pricingPopulationRefs.length === 0) {
    charge.pricingPopulationRefs = [economic.pricingAnalysis.pricingArchitecture.pricingPopulations[0]!.id];
  }
  const rebound = applications.map((item) => ({ ...item, chargeRefs: [charge.id],
    occurrenceRefs: charge.sourceOccurrenceRefs,
    statementPeriod: economic.pricingAnalysis.foundation.identity.statementPeriod! }));
  const compiled = compileCanonicalSynthesisContractV1({ economic,
    contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1, applications: rebound });
  expect(compiled.state.validation.status).toBe("valid");
  const synthesis = { ...base, economicAnalysis: economic,
    synthesisLayer: { ...base.synthesisLayer, contractV1: compiled.state },
    validation: { status: "valid" as const, errors: [], warnings: [] } };
  const scope: KnowledgeQuery = { claimType: "merchant_lever_availability", subjectCode: "source_action",
    asOf: economic.pricingAnalysis.foundation.identity.statementPeriod!.end,
    scope: { tenantRef: null, accountRef: null, processor: "fiserv", population: charge.id } };
  return { economic, synthesis, applications: rebound,
    bindings: rebound.map((item) => ({ atomicClaimId: item.atomicClaimId, knowledgeQuery: scope })) };
}

function project(fixture: ReturnType<typeof fixtureFor>) {
  return buildCanonicalUnresolvedClaimInventory({ pricing: fixture.economic.pricingAnalysis,
    economic: fixture.economic, synthesis: fixture.synthesis,
    projectionScopeBindings: fixture.bindings });
}

function plan(inventory: ReturnType<typeof project>, economic: ReturnType<typeof fixtureFor>["economic"],
  synthesis: ReturnType<typeof fixtureFor>["synthesis"]) {
  return buildCanonicalRgWorkLedger({ inventory, economic, synthesis, rfResolution: {
    knowledgeBinding: { availability: "available", visibilityMode: "anonymous_run" },
    snapshot: { snapshotHash: "f".repeat(64) }, decisions: [],
  } as never });
}

function safeAction(id: string, safeActionCode: Extract<CanonicalSynthesisContractV1Application["value"],
  { kind: "synthesis_safe_action" }>["safeActionCode"], requiredInfluence: Extract<CanonicalSynthesisContractV1Application["value"],
  { kind: "synthesis_safe_action" }>["requiredInfluence"], verificationRequirementCode: string | null = null) {
  return application(id, "merchant_lever", { kind: "synthesis_safe_action", safeActionCode, requiredInfluence,
    mechanismCode: `${id}_mechanism`, verificationRequirementCode, requestTargetCode: "processor_request_target",
    implementationDependencyCodes: [] });
}

function application(id: string, facet: CanonicalSynthesisContractV1Application["facet"],
  value: CanonicalSynthesisContractV1Application["value"]): CanonicalSynthesisContractV1Application {
  return { applicationId: `application-${id}`, atomicClaimId: id, facet, chargeRefs: ["rebound"], occurrenceRefs: ["rebound"],
    scopeFingerprint: "a".repeat(32), statementPeriod: { start: "2026-01-01", end: "2026-01-31" },
    sourceKind: "current_run_verified_rg_evidence", value, evidenceRefs: [`evidence-${id}`], rfEntryRefs: [],
    derivabilityTier: "requires_external_rule_or_schedule", evidenceClass: "public_documentation_verified",
    assertionBasis: "external_verified", effectiveFrom: null, effectiveTo: null, scopeFingerprintVerified: true,
    exactFacetVerified: true, materiality: "immaterial" };
}
