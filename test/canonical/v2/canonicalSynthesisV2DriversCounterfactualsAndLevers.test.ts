import { describe, expect, it } from "vitest";
import { buildCanonicalEconomicsV2SynthesisAnalysis, validateCanonicalEconomicsV2SynthesisAnalysis } from "../../../src/canonical/v2/index.js";
import { buildSynthesis, money, synthesisInput } from "./synthesisFixtures.js";

describe("Canonical Economics V2 RE drivers, attribution, counterfactuals, and levers", () => {
  it("builds a deterministic shadow-only RE root without mutating RD", () => {
    const input = synthesisInput();
    const before = structuredClone(input.economicAnalysis);
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.validation).toMatchObject({ status: "valid", errors: [] });
    expect(analysis.versionManifest).toMatchObject({
      authority: "shadow_non_authoritative",
      persistence: "none",
      customerExposure: "none",
      aiResearchAuthority: "prohibited",
      reportAuthority: "prohibited",
      accountSavingsAuthority: "prohibited",
      knowledgeResolutionAuthority: "prohibited",
    });
    expect(analysis.economicAnalysis).toEqual(before);
    expect(input.economicAnalysis).toEqual(before);
  });

  it("retains explicit driver populations, cost pools, period proof, and independent economics", () => {
    const analysis = buildSynthesis();
    const rewards = analysis.synthesisLayer.drivers.find((item) => item.driverType === "premium_rewards_mix")!;

    expect(rewards).toMatchObject({
      status: "supported",
      populationPredicateCode: "premium_rewards_population",
      observedVolume: money(40000),
      observedCount: 40,
      observedCost: money(900),
      attributionMethod: "overlapping_declared",
      relevantCostPoolRef: "processor_service_admin_cost",
      shareOfPopulation: "0.4",
      shareOfRelevantCostPool: "0.6",
    });
    expect(rewards.populationRefs).toHaveLength(1);
    expect(rewards.evidenceRefs).toHaveLength(1);
    expect(rewards.counterfactualRef).toBeNull();
  });

  it("refuses additive aggregation for known overlap", () => {
    const analysis = buildSynthesis();
    const overlap = analysis.synthesisLayer.attributionRelationships.find((item) => item.relationshipType === "overlaps_with")!;

    expect(overlap.additiveAggregationAllowed).toBe(false);
    expect(overlap.driverRefs).toHaveLength(2);
    expect(overlap.limitations).toContain("Additive aggregation was refused because exclusivity and deterministic allocation were not proven.");
    expect(analysis.validation.warnings).toContain("Known or unresolved driver overlap blocks additive aggregation.");
  });

  it("permits addition only for a proven exclusive group with deterministic allocation", () => {
    const input = synthesisInput();
    const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    const populationRef = input.drivers![1]!.populationRefs[0]!;
    const occurrenceRef = input.drivers![1]!.sourceOccurrenceRefs![0]!;
    input.claims!.push({
      key: "exclusive_partition_claim", kind: "attribution_relationship", subjectKey: "exclusive_partition", claimCode: "exclusive_within_group",
      populationRefs: [populationRef], occurrenceRefs: [occurrenceRef], periodStart: period.start, periodEnd: period.end, proof: input.drivers![0]!.proof,
    });
    input.calculations!.push({
      key: "exclusive_allocation", kind: "exclusive_driver_allocation", subjectKey: "exclusive_partition", driverKeys: ["regulated", "keyed"],
      populationRefs: [populationRef], inputClaimKeys: ["exclusive_partition_claim"], allocationShares: ["0.6", "0.4"], residualContribution: "none",
      periodStart: period.start, periodEnd: period.end, proof: input.drivers![0]!.proof,
    });
    input.attributionRelationships!.push({
      key: "exclusive_partition",
      relationshipType: "exclusive_within_group",
      driverKeys: ["regulated", "keyed"],
      additiveAggregationAllowed: true,
      relationshipClaimKey: "exclusive_partition_claim",
      allocationCalculationKey: "exclusive_allocation",
      proof: input.drivers![0]!.proof,
    });
    input.drivers!.find((item) => item.key === "regulated")!.relationshipKeys!.push("exclusive_partition");
    input.drivers!.find((item) => item.key === "keyed")!.relationshipKeys!.push("exclusive_partition");
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.synthesisLayer.attributionRelationships.find((item) => item.relationshipType === "exclusive_within_group")).toMatchObject({
      additiveAggregationAllowed: true,
      allocationCalculationRef: "synthesis_calculation_004",
    });
  });

  it("refuses an exclusive aggregation claim when its allocation reference is absent", () => {
    const input = synthesisInput();
    const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    input.claims!.push({
      key: "unsupported_exclusive_partition_claim", kind: "attribution_relationship", subjectKey: "unsupported_exclusive_partition",
      claimCode: "exclusive_within_group", populationRefs: [input.drivers![1]!.populationRefs[0]!],
      occurrenceRefs: [input.drivers![1]!.sourceOccurrenceRefs![0]!], periodStart: period.start, periodEnd: period.end, proof: input.drivers![0]!.proof,
    });
    input.attributionRelationships!.push({
      key: "unsupported_exclusive_partition",
      relationshipType: "exclusive_within_group",
      driverKeys: ["regulated", "keyed"],
      additiveAggregationAllowed: true,
      relationshipClaimKey: "unsupported_exclusive_partition_claim",
      proof: input.drivers![0]!.proof,
    });
    const relationship = buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer.attributionRelationships.at(-1)!;

    expect(relationship).toMatchObject({ relationshipType: "exclusive_within_group", additiveAggregationAllowed: false });
    expect(relationship.limitations).toContain("Additive aggregation was refused because exclusivity and deterministic allocation were not proven.");
  });

  it("emits an exact counterfactual delta only under the complete evidence contract", () => {
    const analysis = buildSynthesis();
    const counterfactual = analysis.synthesisLayer.counterfactuals[0]!;
    const lever = analysis.synthesisLayer.merchantLevers[0]!;

    expect(counterfactual).toMatchObject({
      populationCompatibility: "compatible",
      resultState: "exact_deterministic_delta",
      exactDelta: money(125),
      annualized: false,
    });
    expect(lever).toMatchObject({
      state: "eligible_supported",
      calculatedImpactState: "exact_deterministic_delta",
      calculatedImpact: money(125),
    });
    expect(analysis.synthesisLayer).not.toHaveProperty("masterSavingsAnnualAmount");
  });

  it("fails S9 denominator mismatch closed and carries no quantified impact", () => {
    const input = synthesisInput();
    const counterfactual = input.counterfactuals![0]!;
    counterfactual.populationCompatibility = "incompatible";
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.synthesisLayer.counterfactuals[0]).toMatchObject({
      resultState: "verification_only",
      exactDelta: null,
      lowerBound: null,
      upperBound: null,
    });
    expect(analysis.synthesisLayer.merchantLevers[0]).toMatchObject({
      state: "candidate_requires_verification",
      calculatedImpactState: null,
      calculatedImpact: null,
    });
  });

  it("does not invent conditional bounds", () => {
    const input = synthesisInput();
    Object.assign(input.counterfactuals![0]!, {
      requestedResultState: "bounded_conditional_delta",
      exactDelta: null,
      lowerBound: money(100),
      upperBound: null,
      conditionCode: "conditional_admitted_alternative",
    });
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.synthesisLayer.counterfactuals[0]).toMatchObject({
      resultState: "verification_only",
      exactDelta: null,
      lowerBound: null,
      upperBound: null,
    });
  });

  it("requires cadence and recurrence evidence before annualization", () => {
    const input = synthesisInput();
    Object.assign(input.counterfactuals![0]!, { annualized: true, recurrenceProven: false, cadenceEvidenceRefs: [] });
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.synthesisLayer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", exactDelta: null });
    expect(analysis.synthesisLayer.merchantLevers[0]).toMatchObject({ state: "candidate_requires_verification", calculatedImpact: null });
  });

  it("requires explicit compatible baseline and impact periods", () => {
    const input = synthesisInput();
    input.counterfactuals![0]!.impactPeriod = "2025-09";
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.synthesisLayer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", exactDelta: null });
    expect(analysis.synthesisLayer.merchantLevers[0]).toMatchObject({ state: "candidate_requires_verification", calculatedImpact: null });

    const tampered = structuredClone(buildSynthesis());
    tampered.synthesisLayer.counterfactuals[0]!.impactPeriod = "2025-09";
    expect(validateCanonicalEconomicsV2SynthesisAnalysis(tampered).validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("lacks compatible baseline and impact periods"),
    ]));
  });

  it("requires RD change-authority or proven operational influence for an eligible lever", () => {
    const input = synthesisInput();
    input.merchantLevers![0]!.controlRoleRefs = [];
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.synthesisLayer.merchantLevers[0]).toMatchObject({
      state: "candidate_requires_verification",
      calculatedImpactState: null,
      calculatedImpact: null,
    });
  });

  it("keeps AI hypotheses non-authoritative over drivers and causality", () => {
    const input = synthesisInput();
    input.drivers![0]!.proof = {
      derivabilityTier: "unresolved",
      evidenceClass: "hypothesis_only",
      assertionBasis: "ai_hypothesis",
      evidenceRefs: input.drivers![0]!.proof.evidenceRefs,
    };
    for (const claim of input.claims!.filter((item) => item.subjectKey === "rewards" || item.subjectKey === "keyed_signal")) claim.proof = input.drivers![0]!.proof;
    input.operationalSignals![0]!.causalStatus = "causal_relationship_supported";
    input.operationalSignals![0]!.proof = input.drivers![0]!.proof;
    const analysis = buildCanonicalEconomicsV2SynthesisAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.synthesisLayer.drivers[0]).toMatchObject({ status: "unresolved", observedCost: null, observedVolume: null });
    expect(analysis.synthesisLayer.operationalSignals[0]).toMatchObject({ status: "unresolved", causalStatus: "unresolved" });
  });
});
