import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2PricingAnalysis,
  canonicalPricingV2GoldObservation,
  compareLegacyPricingToCanonicalV2,
  multiplyMinorByDecimalRate,
  normalizePrintedPricingRate,
  validateCanonicalEconomicsV2PricingAnalysis,
  type CanonicalEconomicsV2PricingAnalysis,
  type CanonicalPricingComponent,
} from "../../../src/canonical/v2/index.js";
import { approvedSyntheticProfile, buildPricing, percentagePopulationInput, pricingFoundation } from "./pricingFixtures.js";

describe("Canonical Economics V2 RC bounded correction gates", () => {
  it("does not let unknown activity prove no-active processing", () => {
    const foundation = pricingFoundation({ grossSales: 0, refunds: 0, netSubmitted: 0, grossSaleCount: 0, totalFees: 0 });
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: approvedSyntheticProfile(foundation),
      populations: [{ key: "unknown", activityStatus: "unknown", sourcePopulationRefs: [foundation.financialPopulations.grossSaleVolume.id], evidenceRefs: [evidenceRef] }],
    });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.formulaCoverageStatus).toBe("unresolved");
    expect(analysis.pricingArchitecture.underlyingCostBillingMode.value).toBe("unknown");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("unresolved");
  });

  it("requires exactly one complete model for each active population", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [
      { key: "one", dimensionValue: "one", rate: "0.01" },
      { key: "two", dimensionValue: "two", rate: "0.02" },
    ]);
    input.scopeModels = [input.scopeModels[0]!, { ...input.scopeModels[0]! }];
    const analysis = buildPricing({ foundation, ...input });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.formulaCoverageStatus).not.toBe("complete_for_admitted_active_populations");
    expect(analysis.pricingArchitecture.scopeModels.every((model) => model.formulaCoverageStatus !== "complete_for_admitted_active_populations")).toBe(true);
  });

  it("does not let an incomplete versioned-template formula claim complete coverage", () => {
    const foundation = admittedTemplateFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const profile = { ...approvedSyntheticProfile(foundation), source: "versioned_template" as const };
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: profile,
      populations: [{ key: "all", activityStatus: "active_settled", sourcePopulationRefs: [foundation.financialPopulations.grossSaleVolume.id], underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] }],
      components: [{ key: "unknown", populationKey: "all", presenceStatus: "not_observable", componentKind: "unknown", basisType: "unknown", formulaRelationship: "additive", derivabilityTier: "unresolved", evidenceRefs: [evidenceRef] }],
      scopeModels: [{ populationKey: "all", componentKeys: ["unknown"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }],
    });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.formulaCoverageStatus).toBe("unresolved");
  });

  it("refuses cross-population percentage plus per-item as rate-plus-per-item", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const factRef = foundation.financialPopulations.grossSaleVolume.id;
    const analysis = buildPricing({
      foundation,
      populations: [
        { key: "percentage_scope", activityStatus: "active_settled", sourcePopulationRefs: [factRef], underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] },
        { key: "item_scope", activityStatus: "active_settled", sourcePopulationRefs: [factRef], underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] },
      ],
      components: [
        { key: "percentage", populationKey: "percentage_scope", presenceStatus: "observed_nonzero", componentKind: "percentage", basisType: "volume", basisPopulationKind: "gross_sales_before_refunds", basisFactRef: factRef, appliedBaseAmount: foundation.financialPopulations.grossSaleVolume.value, rate: "0.01", printedRate: "1", printedRateUnit: "percent", observedAmount: { amountMinor: 1000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] },
        { key: "item", populationKey: "item_scope", presenceStatus: "observed_nonzero", componentKind: "per_item", basisType: "transaction_count", appliedCount: 10, perItemAmount: { amountMinor: 10, currency: "USD" }, observedAmount: { amountMinor: 100, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] },
      ],
      scopeModels: [
        { populationKey: "percentage_scope", componentKeys: ["percentage"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] },
        { populationKey: "item_scope", componentKeys: ["item"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] },
      ],
    });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("composite_multi_component");
  });

  it.each([
    ["minimum", "minimum_floor", "minimum_floor", { minimumAmount: { amountMinor: 5000, currency: "USD" as const } }],
    ["subscription", "subscription_period", "included_in_subscription", { fixedAmount: { amountMinor: 5000, currency: "USD" as const } }],
  ] as const)("does not let an unbilled %s establish an active schedule", (kind, basisType, relationship, amounts) => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const analysis = buildPricing({
      foundation,
      populations: [{ key: "all", activityStatus: "active_settled", underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] }],
      components: [{ key: "component", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: kind, basisType, ...amounts, observedAmount: null, applicability: "active", formulaRelationship: relationship, derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }],
      scopeModels: [{ populationKey: "all", componentKeys: ["component"], formulaRelationship: relationship, formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }],
    });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.formulaCoverageStatus).not.toBe("complete_for_admitted_active_populations");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
  });

  it("requires population-specific evidence before resolving a population or axis", () => {
    const foundation = pricingFoundation();
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: approvedSyntheticProfile(foundation),
      populations: [{ key: "unbound", activityStatus: "active_settled", underlyingCostBillingMode: "bundled_into_merchant_price" }],
    });
    expect(analysis.validation.status).toBe("invalid");
    expect(analysis.validation.errors).toContain("Resolved pricing population pricing_population_001 requires population-specific source and evidence lineage.");
    expect(analysis.validation.errors).toContain("Resolved pricing axis pricing_axis_underlying_cost_billing_mode requires evidence.");

    const unrelatedEvidence = { ...foundation.sourceModel.evidence[0]!, id: "evidence_unrelated_scope" };
    foundation.sourceModel.evidence.push(unrelatedEvidence);
    const scope = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: approvedSyntheticProfile(foundation),
      populations: [{
        key: "dominant",
        activityStatus: "active_settled",
        scopeRole: "dominant",
        scopeRoleEvidenceRefs: [unrelatedEvidence.id],
        sourcePopulationRefs: [foundation.financialPopulations.grossSaleVolume.id],
        evidenceRefs: [foundation.sourceModel.evidence[0]!.id, unrelatedEvidence.id],
      }],
    });
    expect(scope.validation.errors).toContain("Pricing population pricing_population_001 scope-role evidence does not match its source lineage.");
  });

  it("rejects basis-kind/RB-fact and applied-base/RB-value mismatches", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const grossRef = foundation.financialPopulations.grossSaleVolume.id;
    const netRef = foundation.financialPopulations.canonicalNetSubmittedCardVolume.id;
    const common = { key: "all", activityStatus: "active_settled" as const, underlyingCostBillingMode: "bundled_into_merchant_price" as const, evidenceRefs: [evidenceRef] };
    const wrongKind = buildPricing({ foundation, populations: [{ ...common, sourcePopulationRefs: [netRef] }], components: [{ key: "component", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "percentage", basisType: "volume", basisPopulationKind: "gross_sales_before_refunds", basisFactRef: netRef, appliedBaseAmount: foundation.financialPopulations.canonicalNetSubmittedCardVolume.value, rate: "0.01", observedAmount: { amountMinor: 950, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [] });
    expect(wrongKind.validation.errors).toContain("Pricing component pricing_component_001 basis kind conflicts with its RB fact population.");

    const wrongValue = buildPricing({ foundation, populations: [{ ...common, sourcePopulationRefs: [grossRef] }], components: [{ key: "component", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "percentage", basisType: "volume", basisPopulationKind: "gross_sales_before_refunds", basisFactRef: grossRef, appliedBaseAmount: { amountMinor: 99999, currency: "USD" }, rate: "0.01", observedAmount: { amountMinor: 1000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [] });
    expect(wrongValue.validation.errors).toContain("Pricing component pricing_component_001 applied base conflicts with its referenced RB fact.");
  });

  it("normalizes printed units exactly and rejects a mismatch", () => {
    expect(normalizePrintedPricingRate("3", "percent")).toBe("0.03");
    expect(normalizePrintedPricingRate("30", "basis_points")).toBe("0.003");
    expect(multiplyMinorByDecimalRate(Number.MAX_SAFE_INTEGER, "0.0000000000000001")).toBe(1);
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const factRef = foundation.financialPopulations.grossSaleVolume.id;
    const analysis = buildPricing({ foundation, populations: [{ key: "all", activityStatus: "active_settled", sourcePopulationRefs: [factRef], underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] }], components: [{ key: "component", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "basis_points", basisType: "volume", basisPopulationKind: "gross_sales_before_refunds", basisFactRef: factRef, appliedBaseAmount: foundation.financialPopulations.grossSaleVolume.value, rate: "0.03", printedRate: "30", printedRateUnit: "basis_points", observedAmount: { amountMinor: 3000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [] });
    expect(analysis.validation.errors).toContain("Pricing component pricing_component_001 printed rate/unit does not normalize to its canonical rate.");
  });

  it("does not accept an unrelated reconciled fee as pass-through proof", () => {
    const foundation = admittedTemplateFoundation();
    const fee = foundation.sourceModel.occurrences.find((occurrence) => occurrence.semanticRole === "fee_charge" && occurrence.reconciliationRefs.length > 0)!;
    const feeEvidenceRef = fee.evidenceRef;
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: { ...approvedSyntheticProfile(foundation), source: "versioned_template" },
      populations: [{ key: "all", activityStatus: "active_settled", sourceOccurrenceRefs: [fee.id], underlyingCostOccurrenceRefs: [fee.id], underlyingCostBillingMode: "separately_billed_pass_through", evidenceRefs: [feeEvidenceRef] }],
    });
    expect(analysis.validation.errors.some((error) => /separately billed, reconciled underlying-cost occurrence/.test(error))).toBe(true);

    const admitted = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: { ...approvedSyntheticProfile(foundation), source: "versioned_template" },
      populations: [{
        key: "all",
        activityStatus: "active_settled",
        sourceOccurrenceRefs: [fee.id],
        underlyingCostOccurrenceRefs: [fee.id],
        underlyingCostBillingMode: "separately_billed_pass_through",
        evidenceRefs: [feeEvidenceRef],
      }],
      components: [{
        key: "underlying_cost",
        populationKey: "all",
        presenceStatus: "observed_nonzero",
        componentKind: "pass_through",
        basisType: "underlying_cost_occurrence",
        observedAmount: { amountMinor: 100, currency: "USD" },
        applicability: "active",
        formulaRelationship: "additive",
        derivabilityTier: "stated_on_statement",
        evidenceRefs: [feeEvidenceRef],
        occurrenceRefs: [fee.id],
      }],
      scopeModels: [{
        populationKey: "all",
        componentKeys: ["underlying_cost"],
        formulaRelationship: "additive",
        formulaCoverageStatus: "complete_for_admitted_active_populations",
        evidenceRefs: [feeEvidenceRef],
      }],
    });
    expect(admitted.validation.status).toBe("valid");
    expect(admitted.pricingArchitecture.underlyingCostBillingMode.value).toBe("separately_billed_pass_through");
  });

  it("downgrades observational structural admission and unsupported relationships", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const observational = { ...approvedSyntheticProfile(foundation), source: "observational" as const, populationSemanticsProven: false, pricingCoverageProven: false, underlyingCostRolesProven: false, formulaRelationshipsProven: false };
    const mapping = buildCanonicalEconomicsV2PricingAnalysis({ foundation, admissionProfile: observational, structuralMappings: [{ mappingKind: "acceptance_program", dimensionKind: "brand", dimensionValue: "amex", state: "admitted", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }] });
    expect(mapping.validation.status).toBe("valid");
    expect(mapping.pricingArchitecture.structuralMappings[0]).toMatchObject({ state: "requires_admitted_mapping", derivabilityTier: "requires_external_rule_or_schedule" });

    const relationship = buildCanonicalEconomicsV2PricingAnalysis({ foundation, admissionProfile: { ...approvedSyntheticProfile(foundation), formulaRelationshipsProven: false }, populations: [{ key: "all", activityStatus: "active_settled", sourcePopulationRefs: [foundation.financialPopulations.grossSaleVolume.id], evidenceRefs: [evidenceRef] }], components: [{ key: "component", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "fixed", basisType: "fixed_period", fixedAmount: { amountMinor: 100, currency: "USD" }, observedAmount: { amountMinor: 100, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [{ populationKey: "all", componentKeys: ["component"], formulaRelationship: "additive", formulaCoverageStatus: "complete_for_admitted_active_populations", evidenceRefs: [evidenceRef] }] });
    expect(relationship.pricingArchitecture.observedPricingComponents[0]!.formulaRelationship).toBe("unresolved");
    expect(relationship.pricingArchitecture.scopeModels[0]!.formulaRelationship).toBe("unresolved");
  });

  it("detects population, basis, and relationship differences in legacy comparison", () => {
    const { analysis, component, occurrenceRef } = comparableAnalysis();
    const base = componentSnapshot(component, occurrenceRef);
    for (const mutation of [
      { populationRef: "different_population" },
      { basisPopulationKind: "canonical_net_submitted" },
      { formulaRelationship: "minimum_floor" as const },
    ]) {
      const report = compareLegacyPricingToCanonicalV2({ legacyModel: "flat_rate", components: [{ ...base, ...mutation }] }, analysis);
      expect(report.hasUnexpectedDivergence).toBe(true);
    }
  });

  it("rejects a contradictory resolved human summary", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [{ key: "all", dimensionValue: "all", rate: "0.03" }]);
    const analysis = structuredClone(buildPricing({ foundation, ...input }));
    analysis.pricingArchitecture.derivedHumanSummary.code = "tiered_bundled";
    expect(validateCanonicalEconomicsV2PricingAnalysis(analysis).validation.errors).toContain("Derived pricing summary contradicts the canonical pricing axes.");
  });

  it("projects generic current-period, zero-row, component-presence, tier, and additional-component states", () => {
    const zeroFoundation = pricingFoundation({ grossSales: 0, refunds: 0, netSubmitted: 0, grossSaleCount: 0, totalFees: 0 });
    const zeroEvidence = zeroFoundation.sourceModel.evidence[0]!.id;
    const zero = buildCanonicalEconomicsV2PricingAnalysis({ foundation: zeroFoundation, admissionProfile: { ...approvedSyntheticProfile(zeroFoundation), noActiveProcessingProven: true, noActiveProcessingEvidenceRefs: [zeroEvidence] }, populations: [{ key: "configured", activityStatus: "inactive_informational", sourcePopulationRefs: [zeroFoundation.financialPopulations.grossSaleVolume.id], evidenceRefs: [zeroEvidence] }], components: [{ key: "zero", populationKey: "configured", presenceStatus: "explicitly_zero", componentKind: "percentage", basisType: "volume", rate: "0.03", observedAmount: { amountMinor: 0, currency: "USD" }, applicability: "inactive_informational", formulaRelationship: "unresolved", derivabilityTier: "stated_on_statement", evidenceRefs: [zeroEvidence] }] });
    expect(canonicalPricingV2GoldObservation(zero).states).toMatchObject({ "pricing.current_period_model": "unknown", "pricing.zero_volume_rate_row_state": "inactive_informational" });

    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const absent = buildPricing({ foundation, populations: [{ key: "all", activityStatus: "active_settled", evidenceRefs: [evidenceRef] }], components: [{ key: "bps", populationKey: "all", presenceStatus: "absent_from_complete_source", componentKind: "basis_points", basisType: "volume", basisPopulationKind: "gross_sales_before_refunds", applicability: "unknown", formulaRelationship: "unresolved", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }], scopeModels: [] });
    expect(canonicalPricingV2GoldObservation(absent).states["pricing.separate_bps_sales_discount"]).toBe("absent_from_complete_source");

    const tiers = percentagePopulationInput(foundation, [
      { key: "mc_nqual", dimensionKind: "qualification", dimensionValue: "nqual", rate: "0.0399", relationship: "mutually_exclusive_tier" },
      { key: "mc_qual", dimensionKind: "qualification", dimensionValue: "qual", rate: "0.0199", relationship: "mutually_exclusive_tier" },
    ]);
    for (const population of tiers.populations) population.dimensionValues!.unshift({ kind: "brand", value: "mastercard", evidenceRefs: [evidenceRef] });
    const observation = canonicalPricingV2GoldObservation(buildPricing({ foundation, ...tiers }));
    expect(observation.values).toHaveProperty("pricing.active_tiers.mastercard_nqual", 0.0399);
    expect(observation.values).toHaveProperty("pricing.active_tier_total");
    expect(observation.values).toHaveProperty("pricing.component_rates_by_scope");
  });
});

function admittedTemplateFoundation() {
  const foundation = pricingFoundation();
  const evidenceRef = foundation.sourceModel.evidence[0]!.id;
  foundation.templateCapability.identityStatus = "proven";
  foundation.templateCapability.admissionStatus = "admitted";
  foundation.templateCapability.completenessStatus = "complete";
  foundation.templateCapability.admissionProofEvidenceRefs = [evidenceRef];
  return foundation;
}

function comparableAnalysis(): { analysis: CanonicalEconomicsV2PricingAnalysis; component: CanonicalPricingComponent; occurrenceRef: string } {
  const foundation = pricingFoundation();
  const evidenceRef = foundation.sourceModel.evidence[0]!.id;
  const occurrenceRef = foundation.sourceModel.occurrences[0]!.id;
  const analysis = buildPricing({ foundation, populations: [{ key: "all", activityStatus: "active_settled", sourceOccurrenceRefs: [occurrenceRef], underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] }], components: [{ key: "component", populationKey: "all", presenceStatus: "observed_nonzero", componentKind: "percentage", basisType: "volume", basisPopulationKind: null, rate: "0.03", observedAmount: { amountMinor: 3000, currency: "USD" }, appliedBaseAmount: { amountMinor: 100000, currency: "USD" }, applicability: "active", formulaRelationship: "additive", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef], occurrenceRefs: [occurrenceRef] }], scopeModels: [] });
  return { analysis, component: analysis.pricingArchitecture.observedPricingComponents[0]!, occurrenceRef };
}

function componentSnapshot(component: CanonicalPricingComponent, occurrenceRef: string) {
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
