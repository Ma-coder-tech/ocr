import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2PricingAnalysis,
  buildUnavailableCanonicalEconomicsV2Foundation,
  canonicalPricingV2GoldObservation,
} from "../../../src/canonical/v2/index.js";
import { approvedSyntheticProfile, buildPricing, percentagePopulationInput, pricingFoundation } from "./pricingFixtures.js";

describe("Canonical Economics V2 RC evidence and failure states", () => {
  it("keeps partial observed components from becoming an account-wide pricing conclusion", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const profile = { ...approvedSyntheticProfile(foundation), pricingCoverageProven: false, formulaRelationshipsProven: false };
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: profile,
      populations: [{ key: "bounded", activityStatus: "active_settled", sourcePopulationRefs: [foundation.financialPopulations.grossSaleVolume.id], underlyingCostBillingMode: "unknown", evidenceRefs: [evidenceRef] }],
      components: [{ key: "component_1", populationKey: "bounded", presenceStatus: "observed_nonzero", componentKind: "percentage", basisType: "unknown", rate: "0.015", observedAmount: { amountMinor: 100, currency: "USD" }, applicability: "active", formulaRelationship: "unresolved", derivabilityTier: "stated_on_statement", evidenceRefs: [evidenceRef] }],
      scopeModels: [{ populationKey: "bounded", componentKeys: ["component_1"], formulaRelationship: "unresolved", formulaCoverageStatus: "partial_observed_components", evidenceRefs: [evidenceRef] }],
    });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.formulaCoverageStatus).toBe("partial_observed_components");
    expect(analysis.pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
    expect(analysis.pricingArchitecture.scopeUniformity.value).toBe("unresolved");
  });

  it("does not infer bundled treatment or absence without admitted complete pricing coverage", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    const profile = { ...approvedSyntheticProfile(foundation), source: "observational" as const, populationSemanticsProven: false, pricingCoverageProven: false, underlyingCostRolesProven: false, formulaRelationshipsProven: false };
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: profile,
      populations: [{ key: "observed", activityStatus: "active_settled", underlyingCostBillingMode: "bundled_into_merchant_price", evidenceRefs: [evidenceRef] }],
    });
    expect(analysis.validation.status).toBe("invalid");
    expect(analysis.validation.errors).toContain("Observational pricing populations cannot resolve underlying-cost billing treatment.");
  });

  it("propagates G9 source-unavailable status without inferred pricing", () => {
    const foundation = buildUnavailableCanonicalEconomicsV2Foundation({ sourceDocumentRef: "G9", provenanceStatus: "source_unavailable", reason: "Source unavailable." });
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: { source: "observational", pricingAdmissionId: "unavailable_pricing_v1", populationSemanticsProven: false, pricingCoverageProven: false, underlyingCostRolesProven: false, formulaRelationshipsProven: false, noActiveProcessingProven: false, noActiveProcessingEvidenceRefs: [], evidenceRefs: [], limitations: ["Source unavailable."] },
    });
    expect(analysis.validation.status).toBe("valid");
    expect(analysis.pricingArchitecture.underlyingCostBillingMode).toMatchObject({ status: "unavailable", value: null });
    expect(canonicalPricingV2GoldObservation(analysis, { caseId: "G9" }).states).toMatchObject({
      "pricing.underlying_cost_billing_mode": "unknown",
      "pricing.merchant_price_schedule_shape": "unknown",
      "pricing.scope_uniformity": "unresolved",
    });
  });

  it("keeps percentage basis explicit and does not substitute RB headline denominators", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [{ key: "all", dimensionValue: "all", rate: "0.038" }]);
    const analysis = buildPricing({ foundation, ...input });
    const component = analysis.pricingArchitecture.observedPricingComponents[0]!;
    expect(component.basisPopulationKind).toBe("gross_sales_before_refunds");
    expect(component.basisFactRef).toBe(foundation.financialPopulations.grossSaleVolume.id);
    expect(component.basisFactRef).not.toBe(foundation.financialPopulations.canonicalNetSubmittedCardVolume.id);
  });

  it("requires reconciled billed occurrences for a versioned-template pass-through claim", () => {
    const foundation = pricingFoundation();
    const evidenceRef = foundation.sourceModel.evidence[0]!.id;
    foundation.templateCapability.identityStatus = "proven";
    foundation.templateCapability.admissionStatus = "admitted";
    foundation.templateCapability.admissionAuthority = { lifecycle: "admitted", authorityClass: "product_owner", authorityRef: "test-product-owner",
      admittedAt: "2026-08-23T00:00:00.000Z", admissionVersion: "test-v1", effectiveFrom: null, effectiveTo: null };
    foundation.templateCapability.completenessStatus = "complete";
    foundation.templateCapability.admissionProofEvidenceRefs = [evidenceRef];
    const analysis = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: {
        ...approvedSyntheticProfile(foundation),
        source: "versioned_template",
        pricingAdmissionId: "fiserv_template_pricing_test_v1",
      },
      populations: [{ key: "all", activityStatus: "active_settled", underlyingCostBillingMode: "separately_billed_pass_through", evidenceRefs: [evidenceRef] }],
    });
    expect(analysis.validation.status).toBe("invalid");
    expect(analysis.validation.errors.some((error) => /separately billed, reconciled underlying-cost occurrence/.test(error))).toBe(true);
  });

  it("rejects exact synthetic component math that does not reconstruct", () => {
    const foundation = pricingFoundation();
    const input = percentagePopulationInput(foundation, [{ key: "all", dimensionValue: "all", rate: "0.038" }]);
    input.components[0]!.observedAmount = { amountMinor: 1, currency: "USD" };
    const analysis = buildPricing({ foundation, ...input });
    expect(analysis.validation.status).toBe("invalid");
    expect(analysis.validation.errors.some((error) => /does not reconstruct from its exact percentage basis/.test(error))).toBe(true);
  });
});
