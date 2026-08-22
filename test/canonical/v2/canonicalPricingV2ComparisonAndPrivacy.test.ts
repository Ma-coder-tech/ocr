import { describe, expect, it } from "vitest";
import {
  assertNoUnexpectedCanonicalPricingV2Divergence,
  compareLegacyPricingToCanonicalV2,
  privacySafeCanonicalPricingV2Diagnostic,
  validateCanonicalEconomicsV2PricingAnalysis,
} from "../../../src/canonical/v2/index.js";
import { buildPricing, percentagePopulationInput, pricingFoundation } from "./pricingFixtures.js";

describe("Canonical Economics V2 RC comparison, authority, and privacy", () => {
  it("classifies only approved pricing amendments and exact shared component math", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [
      { key: "visa", dimensionValue: "visa", rate: "0.029" },
      { key: "amex", dimensionValue: "amex", rate: "0.035" },
    ]);
    const analysis = buildPricing({ foundation, ...input });
    const component = analysis.pricingArchitecture.observedPricingComponents[0]!;
    const report = compareLegacyPricingToCanonicalV2({
      legacyModel: "tiered_pricing",
      populationScope: "account_wide",
      componentsEvidenceBound: false,
      derivedSummaryCanonical: true,
      components: [{ occurrenceRef: "not_admitted" }, ...component.occurrenceRefs.map((occurrenceRef) => ({ occurrenceRef, rate: component.rate, observedAmount: component.observedAmount, appliedBaseAmount: component.appliedBaseAmount }))],
    }, analysis);

    expect(report.hasUnexpectedDivergence).toBe(false);
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ amendmentId: "RC-AMEND-001-INDEPENDENT-PRICING-AXES" }),
      expect.objectContaining({ amendmentId: "RC-AMEND-002-POPULATION-SCOPED-PRICING" }),
      expect.objectContaining({ amendmentId: "RC-AMEND-004-EVIDENCE-BOUND-COMPONENTS" }),
      expect.objectContaining({ amendmentId: "RC-AMEND-005-NONCANONICAL-PRICING-SUMMARY" }),
      expect.objectContaining({ fact: "component:not_admitted", classification: "v2_unavailable_or_ambiguous" }),
    ]));
    expect(() => assertNoUnexpectedCanonicalPricingV2Divergence(report)).not.toThrow();
  });

  it("treats a shared occurrence numeric mismatch as an unexpected divergence", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const occurrenceRef = foundation.sourceModel.occurrences[0]!.id;
    const analysis = buildPricing({
      foundation,
      populations: [{ key: "all", activityStatus: "active_settled", underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef], sourceOccurrenceRefs: [occurrenceRef] }],
      components: [{ key: "component_1", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "percentage", basisType: "volume", rate: "0.030", observedAmount: { amountMinor: 3000, currency: "USD" }, appliedBaseAmount: { amountMinor: 100000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef], occurrenceRefs: [occurrenceRef] }],
      scopeModels: [{ populationKey: "all", componentKeys: ["component_1"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }],
    });
    const component = analysis.pricingArchitecture.observedPricingComponents[0]!;
    const matching = compareLegacyPricingToCanonicalV2({ legacyModel: "flat_rate", components: [{
      ...matchingComponentSnapshot(component, occurrenceRef),
    }] }, analysis);
    expect(matching.items).toContainEqual(expect.objectContaining({ fact: `component:${occurrenceRef}`, classification: "same_semantic_fact" }));
    expect(matching.hasUnexpectedDivergence).toBe(false);

    const report = compareLegacyPricingToCanonicalV2({ legacyModel: "flat_rate", components: [{
      ...matchingComponentSnapshot(component, occurrenceRef),
      rate: "0.031",
    }] }, analysis);
    expect(report.hasUnexpectedDivergence).toBe(true);
    expect(() => assertNoUnexpectedCanonicalPricingV2Divergence(report)).toThrow(/product-owner review/);
  });

  it("keeps diagnostics free of financial values, rates, source identifiers, and identity", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [{ key: "private", dimensionValue: "private_scope_value", rate: "0.038" }]);
    const analysis = buildPricing({ foundation, ...input });
    const diagnostic = privacySafeCanonicalPricingV2Diagnostic(analysis);
    const serialized = JSON.stringify(diagnostic);
    expect(diagnostic).toMatchObject({
      authority: "shadow_non_authoritative",
      containsFinancialValues: false,
      containsRates: false,
      containsSourceText: false,
      containsSourceIdentifiers: false,
      containsMerchantIdentity: false,
    });
    expect(serialized).not.toContain("private_scope_value");
    expect(serialized).not.toContain("0.038");
    expect(serialized).not.toContain(foundation.identity.sourceFingerprint);
    expect(serialized).not.toContain(foundation.identity.sourceDocumentRef);
  });

  it("rejects customer/report/AI authority and detects a summary that repairs unresolved axes", () => {
    const foundation = pricingFoundation();
    const analysis = buildPricing({ foundation, populations: [] });
    const mutated = structuredClone(analysis);
    (mutated.versionManifest as { reportAuthority: string }).reportAuthority = "enabled";
    mutated.pricingArchitecture.derivedHumanSummary.code = "flat_blended_bundled";
    const result = validateCanonicalEconomicsV2PricingAnalysis(mutated);
    expect(result.validation.errors).toContain("Report authority over RC pricing must be prohibited.");
    expect(result.validation.errors).toContain("Derived pricing summary repaired an unresolved canonical axis.");
  });

  it("does not mutate the accepted RB foundation", () => {
    const foundation = pricingFoundation();
    const before = JSON.stringify(foundation);
    const input = percentagePopulationInput(foundation, [{ key: "all", dimensionValue: "all", rate: "0.038" }]);
    const analysis = buildPricing({ foundation, ...input });
    expect(JSON.stringify(foundation)).toBe(before);
    expect(analysis.foundation).toBe(foundation);
    expect(analysis.foundation.validation.status).toBe("valid");
  });

  it("derives the same economics after identity and filename-like metadata changes", () => {
    const firstFoundation = pricingFoundation();
    const renamedFoundation = structuredClone(firstFoundation);
    renamedFoundation.identity.sourceDocumentRef = "RENAMED-SOURCE-REFERENCE";
    const firstInput = percentagePopulationInput(firstFoundation, [{ key: "all", dimensionValue: "visa", rate: "0.038" }]);
    const renamedInput = percentagePopulationInput(renamedFoundation, [{ key: "all", dimensionValue: "visa", rate: "0.038" }]);
    const first = buildPricing({ foundation: firstFoundation, ...firstInput });
    const renamed = buildPricing({ foundation: renamedFoundation, ...renamedInput });
    expect({
      underlying: renamed.pricingArchitecture.underlyingCostBillingMode.value,
      shape: renamed.pricingArchitecture.merchantPriceScheduleShape.value,
      scope: renamed.pricingArchitecture.scopeUniformity.value,
    }).toEqual({
      underlying: first.pricingArchitecture.underlyingCostBillingMode.value,
      shape: first.pricingArchitecture.merchantPriceScheduleShape.value,
      scope: first.pricingArchitecture.scopeUniformity.value,
    });
  });
});

function matchingComponentSnapshot(component: ReturnType<typeof buildPricing>["pricingArchitecture"]["observedPricingComponents"][number], occurrenceRef: string) {
  return {
    occurrenceRef,
    populationRef: component.populationRef,
    componentKind: component.componentKind,
    basisType: component.basisType,
    basisPopulationKind: component.basisPopulationKind,
    basisFactRef: component.basisFactRef,
    rate: component.rate,
    printedRate: component.printedRate,
    printedRateUnit: component.printedRateUnit,
    observedAmount: component.observedAmount,
    appliedBaseAmount: component.appliedBaseAmount,
    appliedCount: component.appliedCount,
    perItemAmount: component.perItemAmount,
    fixedAmount: component.fixedAmount,
    minimumAmount: component.minimumAmount,
    applicability: component.applicability,
    formulaRelationship: component.formulaRelationship,
  };
}
