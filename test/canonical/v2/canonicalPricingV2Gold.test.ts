import { describe, expect, it } from "vitest";
import { compareAssertion, loadGoldContract, loadToleranceRules, type GoldAssertion } from "../../../scripts/gold-contract-lib.js";
import { canonicalPricingV2GoldObservation } from "../../../src/canonical/v2/index.js";
import { buildPricing, percentagePopulationInput, pricingFoundation } from "./pricingFixtures.js";

describe("Canonical Economics V2 RC finalized Gold compatibility", () => {
  it("passes the S1 scope-specific flat discriminator without a tier claim", async () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [
      { key: "visa", dimensionValue: "visa", rate: "0.029" },
      { key: "debit", dimensionValue: "debit", rate: "0.025" },
      { key: "amex", dimensionValue: "amex", rate: "0.035" },
    ]);
    await expectGoldMatches("S1", ["S1-UNDERLYING", "S1-SHAPE", "S1-SCOPE", "S1-NO-TIER"],
      canonicalPricingV2GoldObservation(buildPricing({ foundation, ...input }), { caseId: "S1" }));
  });

  it("passes the S2 mixed-by-scope discriminator while preserving population modes", async () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const factRef = foundation.financialPopulations.grossSaleVolume.id;
    const analysis = buildPricing({ foundation, populations: [
      { key: "visa_mc", activityStatus: "active_settled", dimensionValues: [{ kind: "brand_group", value: "visa_mastercard", evidenceRefs: [evidenceRef] }], sourcePopulationRefs: [factRef], underlyingCostBillingMode: "separately_billed_pass_through", evidenceRefs: [evidenceRef] },
      { key: "amex", activityStatus: "active_settled", dimensionValues: [{ kind: "brand", value: "amex", evidenceRefs: [evidenceRef] }], sourcePopulationRefs: [factRef], underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] },
    ] });
    await expectGoldMatches("S2", ["S2-UNDERLYING", "S2-SCOPE"], canonicalPricingV2GoldObservation(analysis, { caseId: "S2" }));
  });

  it("passes S3 without letting subscription replace the pass-through axis", async () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const analysis = buildPricing({
      foundation,
      populations: [{ key: "all", activityStatus: "active_settled", underlyingCostBillingMode: "separately_billed_pass_through", evidenceRefs: [evidenceRef] }],
      components: [
        { key: "component_1", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "subscription", basisType: "subscription_period", fixedAmount: { amountMinor: 5000, currency: "USD" }, observedAmount: { amountMinor: 5000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] },
        { key: "component_2", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "pass_through", basisType: "underlying_cost_occurrence", observedAmount: { amountMinor: 2500, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] },
      ],
      scopeModels: [{ populationKey: "all", componentKeys: ["component_1", "component_2"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }],
    });
    await expectGoldMatches("S3", ["S3-UNDERLYING", "S3-SHAPE", "S3-NO-REPLACE"], canonicalPricingV2GoldObservation(analysis, { caseId: "S3" }));
  });

  it("passes S5 by refusing an unadmitted Amex structural mapping", async () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const analysis = buildPricing({
      foundation,
      populations: [],
      structuralMappings: [{
        mappingKind: "acceptance_program",
        dimensionKind: "brand",
        dimensionValue: "amex",
        state: "requires_admitted_mapping",
        derivabilityTier: "requires_external_rule_or_schedule",
        evidenceRefs: [evidenceRef],
      }],
    });
    await expectGoldMatches("S5", ["S5-AMEX-MAPPING", "S5-NO-OPTBLUE"], canonicalPricingV2GoldObservation(analysis, { caseId: "S5" }));
  });
});

async function expectGoldMatches(
  caseId: string,
  assertionIds: string[],
  observation: ReturnType<typeof canonicalPricingV2GoldObservation>,
): Promise<void> {
  const [contract, tolerances] = await Promise.all([loadGoldContract(), loadToleranceRules()]);
  const goldCase = contract.cases.find((candidate) => candidate.case_id === caseId);
  expect(goldCase).toBeDefined();
  for (const assertionId of assertionIds) {
    const assertion = goldCase!.assertions.find((candidate) => candidate.assertion_id === assertionId) as GoldAssertion | undefined;
    expect(assertion, assertionId).toBeDefined();
    expect(compareAssertion(assertion!, observation, tolerances), assertionId).toBe("match");
  }
}
