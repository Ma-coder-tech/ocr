import { describe, expect, it } from "vitest";
import { buildCanonicalEconomicsV2PricingAnalysis } from "../../../src/canonical/v2/index.js";
import { approvedSyntheticProfile, buildPricing, percentagePopulationInput, pricingFoundation } from "./pricingFixtures.js";

describe("Canonical Economics V2 RC pricing architecture", () => {
  it("keeps underlying mode, schedule shape, and scope uniformity independent for S1", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [
      { key: "visa", dimensionValue: "visa", rate: "0.029" },
      { key: "debit", dimensionValue: "debit", rate: "0.025" },
      { key: "amex", dimensionValue: "amex", rate: "0.035" },
    ]);
    const analysis = buildPricing({ foundation, ...input });

    expect(analysis.validation).toMatchObject({ status: "valid", errors: [] });
    expect(analysis.pricingArchitecture.underlyingCostBillingMode.value).toBe("bundled_into_merchant_price");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("scope_specific_flat_percentage");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("scope_specific");
    expect(analysis.pricingArchitecture.derivedHumanSummary).toMatchObject({ canonical: false, code: "scope_specific_bundled", independentEvidenceRefs: [] });
    expect(analysis.pricingArchitecture.formulaCoverageStatus).toBe("complete_for_admitted_active_populations");
  });

  it("preserves genuine mixed-by-scope underlying modes for S2 without manufacturing a schedule", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const factRef = foundation.financialPopulations.grossSaleVolume.id;
    const analysis = buildPricing({
      foundation,
      populations: [
        { key: "visa_mc", activityStatus: "active_settled", dimensionValues: [{ kind: "brand_group", value: "visa_mastercard", evidenceRefs: [evidenceRef] }], sourcePopulationRefs: [factRef], underlyingCostBillingMode: "separately_billed_pass_through", underlyingCostDerivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] },
        { key: "amex", activityStatus: "active_settled", dimensionValues: [{ kind: "brand", value: "amex", evidenceRefs: [evidenceRef] }], sourcePopulationRefs: [factRef], underlyingCostBillingMode: "bundled_into_merchant_price", underlyingCostDerivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] },
      ],
    });

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.underlyingCostBillingMode.value).toBe("mixed_by_scope");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("unresolved");
    expect(analysis.pricingArchitecture.derivedHumanSummary.code).toBe("unknown_limited_analysis");
  });

  it("keeps subscription and separately billed pass-through orthogonal for S3", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const factRef = foundation.financialPopulations.grossSaleVolume.id;
    const analysis = buildPricing({
      foundation,
      populations: [{
        key: "all_active",
        activityStatus: "active_settled",
        dimensionValues: [{ kind: "activity_scope", value: "all_active", evidenceRefs: [evidenceRef] }],
        sourcePopulationRefs: [factRef],
        underlyingCostBillingMode: "separately_billed_pass_through",
        underlyingCostDerivabilityTier: "deterministically_derivable_from_statement",
        evidenceRefs: [evidenceRef],
      }],
      components: [
        { key: "component_1", populationKey: "all_active", presenceStatus: "observed_nonzero", componentKind: "subscription", basisType: "subscription_period", fixedAmount: { amountMinor: 5000, currency: "USD" }, observedAmount: { amountMinor: 5000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] },
        { key: "component_2", populationKey: "all_active", presenceStatus: "observed_nonzero", componentKind: "pass_through", basisType: "underlying_cost_occurrence", observedAmount: { amountMinor: 2500, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] },
      ],
      scopeModels: [{ populationKey: "all_active", componentKeys: ["component_1", "component_2"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }],
    });

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.underlyingCostBillingMode.value).toBe("separately_billed_pass_through");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("composite_multi_component");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("uniform");
    expect(analysis.pricingArchitecture.derivedHumanSummary.code).toBe("interchange_plus_cost_plus");
  });

  it("treats zero-activity pricing rows as informational and emits no-active states", () => {
    const foundation = pricingFoundation({ grossSales: 0, refunds: 0, netSubmitted: 0, grossSaleCount: 0, totalFees: 44.9 });
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: { ...approvedSyntheticProfile(foundation), noActiveProcessingProven: true, noActiveProcessingEvidenceRefs: [evidenceRef] },
      populations: [{ key: "configured", activityStatus: "inactive_informational", dimensionValues: [{ kind: "qualification", value: "qual", evidenceRefs: [evidenceRef] }], sourcePopulationRefs: [foundation.financialPopulations.grossSaleVolume.id], underlyingCostBillingMode: "unknown", evidenceRefs: [evidenceRef] }],
      components: [{ key: "component_1", populationKey: "configured", presenceStatus: "explicitly_zero", componentKind: "percentage", basisType: "volume", rate: "0.030", appliedBaseAmount: { amountMinor: 0, currency: "USD" }, observedAmount: { amountMinor: 0, currency: "USD" }, applicability: "inactive_informational", formulaRelationship: "unresolved", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }],
      scopeModels: [{ populationKey: "configured", componentKeys: ["component_1"], formulaRelationship: "unresolved", formulaCoverageStatus: "partial_observed_components", evidenceRefs: [evidenceRef] }],
    });

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.underlyingCostBillingMode.value).toBe("no_active_processing");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("no_active_processing");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("no_active_processing");
    expect(analysis.pricingArchitecture.formulaCoverageStatus).toBe("not_applicable_no_active_processing");
  });

  it("requires proven qualification populations and differing rates for a tier ladder", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [
      { key: "qual", dimensionKind: "brand", dimensionValue: "qual_label_only", rate: "0.029", relationship: "mutually_exclusive_tier" },
      { key: "nqual", dimensionKind: "brand", dimensionValue: "nqual_label_only", rate: "0.039", relationship: "mutually_exclusive_tier" },
    ]);
    const analysis = buildPricing({ foundation, ...input });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
    expect(analysis.pricingArchitecture.scopeModels.every((model) => model.formulaRelationship === "unresolved")).toBe(true);
    expect(analysis.pricingArchitecture.observedPricingComponents.every((component) => component.formulaRelationship === "unresolved")).toBe(true);

    const admitted = percentagePopulationInput(foundation, [
      { key: "qual", dimensionKind: "qualification", dimensionValue: "qualified", rate: "0.029", relationship: "mutually_exclusive_tier" },
      { key: "nqual", dimensionKind: "qualification", dimensionValue: "non_qualified", rate: "0.039", relationship: "mutually_exclusive_tier" },
    ]);
    expect(buildPricing({ foundation, ...admitted }).pricingArchitecture.merchantPriceScheduleShape.value).toBe("qualification_tier_ladder");

    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    admitted.populations[0]!.dimensionValues!.push({ kind: "brand", value: "visa", evidenceRefs: [evidenceRef] });
    admitted.populations[1]!.dimensionValues!.push({ kind: "brand", value: "mastercard", evidenceRefs: [evidenceRef] });
    expect(buildPricing({ foundation, ...admitted }).pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
  });

  it("represents rate-plus-item, fixed-plus-variable, minimum, and subscription structures without ownership fields", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const factRef = foundation.financialPopulations.grossSaleVolume.id;
    const population = [{ key: "all", activityStatus: "active_settled" as const, underlyingCostBillingMode: "bundled_into_merchant_price" as const, evidenceRefs: [evidenceRef] }];
    const percentage = { key: "component_1", populationKey: "all", presenceStatus: "observed_nonzero" as const, componentKind: "percentage" as const, basisType: "volume" as const, basisFactRef: factRef, appliedBaseAmount: foundation.financialPopulations.grossSaleVolume.value, rate: "0.010", observedAmount: { amountMinor: 1000, currency: "USD" as const }, applicability: "active" as const, formulaRelationship: "additive" as const, derivabilityTier: "deterministically_derivable_from_statement" as const, evidenceRefs: [evidenceRef] };

    const ratePlusItem = buildPricing({ foundation, populations: population, components: [percentage, { key: "component_2", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "per_item", basisType: "transaction_count", appliedCount: 20, perItemAmount: { amountMinor: 10, currency: "USD" }, observedAmount: { amountMinor: 200, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "deterministically_derivable_from_statement", evidenceRefs: [evidenceRef] }], scopeModels: [{ populationKey: "all", componentKeys: ["component_1", "component_2"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }] });
    expect(ratePlusItem.validation.status).toBe("valid");
    expect(ratePlusItem.pricingArchitecture.merchantPriceScheduleShape.value).toBe("rate_plus_per_item");

    const fixedPlusVariable = buildPricing({ foundation, populations: population, components: [percentage, { key: "component_2", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "fixed", basisType: "fixed_period", fixedAmount: { amountMinor: 2500, currency: "USD" }, observedAmount: { amountMinor: 2500, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [{ populationKey: "all", componentKeys: ["component_1", "component_2"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }] });
    expect(fixedPlusVariable.pricingArchitecture.merchantPriceScheduleShape.value).toBe("fixed_plus_variable");

    const minimum = buildPricing({ foundation, populations: population, components: [{ key: "component_1", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "minimum", basisType: "minimum_floor", minimumAmount: { amountMinor: 5000, currency: "USD" }, observedAmount: { amountMinor: 5000, currency: "USD" }, applicability: "active", formulaRelationship: "minimum_floor", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [{ populationKey: "all", componentKeys: ["component_1"], formulaRelationship: "minimum_floor", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }] });
    expect(minimum.pricingArchitecture.merchantPriceScheduleShape.value).toBe("minimum_based");

    const subscription = buildPricing({ foundation, populations: population, components: [{ key: "component_1", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "subscription", basisType: "subscription_period", fixedAmount: { amountMinor: 5000, currency: "USD" }, observedAmount: { amountMinor: 5000, currency: "USD" }, applicability: "active", formulaRelationship: "included_in_subscription", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [{ populationKey: "all", componentKeys: ["component_1"], formulaRelationship: "included_in_subscription", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }] });
    expect(subscription.pricingArchitecture.merchantPriceScheduleShape.value).toBe("subscription_membership");
    expect(Object.keys(subscription.pricingArchitecture.observedPricingComponents[0]!)).not.toEqual(expect.arrayContaining(["owner", "beneficiary", "negotiator", "margin", "control"]));
  });

  it("detects a dominant uniform formula with explicit admitted exceptions", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [
      { key: "visa", dimensionValue: "visa", rate: "0.015", scopeRole: "dominant" },
      { key: "mastercard", dimensionValue: "mastercard", rate: "0.015" },
      { key: "amex", dimensionValue: "amex", rate: "0.025", scopeRole: "explicit_exception" },
    ]);
    const analysis = buildPricing({ foundation, ...input });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("uniform_with_explicit_exceptions");
  });
});
