import type {
  CanonicalPricingAxisConclusion,
  CanonicalPricingDerivedHumanSummaryCode,
  CanonicalPricingMerchantPriceScheduleShape,
  CanonicalPricingScopeUniformity,
  CanonicalPricingUnderlyingCostBillingMode,
} from "./pricingTypes.js";

export function deriveCanonicalPricingHumanSummaryCode(
  underlying: CanonicalPricingAxisConclusion<CanonicalPricingUnderlyingCostBillingMode>,
  shape: CanonicalPricingAxisConclusion<CanonicalPricingMerchantPriceScheduleShape>,
  scope: CanonicalPricingAxisConclusion<CanonicalPricingScopeUniformity>,
): CanonicalPricingDerivedHumanSummaryCode {
  if (underlying.value === null || shape.value === null || scope.value === null ||
      underlying.value === "unknown" || shape.value === "unknown" || scope.value === "unresolved") {
    return "unknown_limited_analysis";
  }
  if (underlying.value === "no_active_processing" || shape.value === "no_active_processing" || scope.value === "no_active_processing") {
    return "current_period_pricing_not_observable";
  }
  if (underlying.value === "mixed_by_scope") return "hybrid_scope_specific";
  if (underlying.value === "bundled_into_merchant_price" && shape.value === "qualification_tier_ladder") return "tiered_bundled";
  if (underlying.value === "bundled_into_merchant_price" && shape.value === "uniform_flat_percentage") return "flat_blended_bundled";
  if (underlying.value === "bundled_into_merchant_price" && shape.value === "scope_specific_flat_percentage") return "scope_specific_bundled";
  if (underlying.value === "separately_billed_pass_through" && scope.value === "scope_specific") return "interchange_plus_scope_specific";
  if (underlying.value === "separately_billed_pass_through") return "interchange_plus_cost_plus";
  if (shape.value === "subscription_membership") return "subscription_pricing";
  if (shape.value === "minimum_based") return "minimum_based_pricing";
  return "other_pricing_structure";
}
