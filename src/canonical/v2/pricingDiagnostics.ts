import type { CanonicalEconomicsV2PricingAnalysis } from "./pricingTypes.js";

export type PrivacySafeCanonicalPricingV2Diagnostic = {
  policyVersion: "canonical_economics_v2_pricing_privacy_safe_diagnostic_v1";
  schemaVersion: "canonical_economics_v2_pricing_architecture_v1";
  authority: "shadow_non_authoritative";
  validationStatus: "valid" | "invalid";
  admissionSource: "approved_synthetic" | "versioned_template" | "observational";
  underlyingAxisState: string;
  scheduleShapeState: string;
  scopeUniformityState: string;
  formulaCoverageStatus: CanonicalEconomicsV2PricingAnalysis["pricingArchitecture"]["formulaCoverageStatus"];
  populationStatusCounts: Record<string, number>;
  componentKindCounts: Record<string, number>;
  relationshipCounts: Record<string, number>;
  semanticAmendmentIds: string[];
  containsFinancialValues: false;
  containsRates: false;
  containsSourceText: false;
  containsSourceIdentifiers: false;
  containsMerchantIdentity: false;
};

export function privacySafeCanonicalPricingV2Diagnostic(
  analysis: CanonicalEconomicsV2PricingAnalysis,
): PrivacySafeCanonicalPricingV2Diagnostic {
  const pricing = analysis.pricingArchitecture;
  return {
    policyVersion: "canonical_economics_v2_pricing_privacy_safe_diagnostic_v1",
    schemaVersion: "canonical_economics_v2_pricing_architecture_v1",
    authority: "shadow_non_authoritative",
    validationStatus: analysis.validation.status,
    admissionSource: pricing.admissionProfile.source,
    underlyingAxisState: axisState(pricing.underlyingCostBillingMode),
    scheduleShapeState: axisState(pricing.merchantPriceScheduleShape),
    scopeUniformityState: axisState(pricing.scopeUniformity),
    formulaCoverageStatus: pricing.formulaCoverageStatus,
    populationStatusCounts: counts(pricing.pricingPopulations.map((item) => item.activityStatus)),
    componentKindCounts: counts(pricing.observedPricingComponents.map((item) => item.componentKind)),
    relationshipCounts: counts(pricing.scopeModels.map((item) => item.formulaRelationship)),
    semanticAmendmentIds: pricing.semanticAmendments.map((item) => item.id).sort(),
    containsFinancialValues: false,
    containsRates: false,
    containsSourceText: false,
    containsSourceIdentifiers: false,
    containsMerchantIdentity: false,
  };
}

function axisState(axis: { status: string; value: string | null }): string {
  return axis.status === "available" ? axis.value ?? "unavailable" : axis.status;
}

function counts(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}
