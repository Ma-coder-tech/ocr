import type {
  CanonicalCustomerActionType,
  CanonicalCustomerAnalysisReadiness,
  CanonicalCustomerDataIntegrity,
  CanonicalCustomerOpportunityPosture,
  CanonicalCustomerPermissionKey,
  CanonicalCustomerPrimaryState,
  CanonicalCustomerRatePosition,
} from "./types.js";

export const CUSTOMER_STATE_POLICY_VERSION = "canonical_customer_state_policy_v1" as const;
export const CUSTOMER_STATE_MATERIALITY_POLICY_VERSION = "canonical_customer_state_materiality_v1" as const;
export const CUSTOMER_BENCHMARK_POLICY_VERSION = "canonical_customer_benchmark_policy_v1" as const;
export const CUSTOMER_PERMISSIONS_POLICY_VERSION = "canonical_customer_permissions_v1" as const;
export const CUSTOMER_VISIBILITY_POLICY_VERSION = "canonical_customer_visibility_v1" as const;
export const CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION = "canonical_customer_action_guidance_v1" as const;
export const CUSTOMER_WORDING_POLICY_VERSION = "canonical_customer_wording_v1" as const;

export const CUSTOMER_ANALYSIS_READINESS_VALUES: readonly CanonicalCustomerAnalysisReadiness[] = [
  "verified",
  "limited",
  "withheld",
  "unavailable",
] as const;

export const CUSTOMER_DATA_INTEGRITY_VALUES: readonly CanonicalCustomerDataIntegrity[] = [
  "reconciled",
  "partially_reconciled",
  "failed",
  "unavailable",
] as const;

export const CUSTOMER_RATE_POSITION_VALUES: readonly CanonicalCustomerRatePosition[] = [
  "below_reference",
  "within_reference",
  "above_reference",
  "unavailable",
] as const;

export const CUSTOMER_OPPORTUNITY_POSTURE_VALUES: readonly CanonicalCustomerOpportunityPosture[] = [
  "none",
  "verification_only",
  "eligible_opportunity",
  "material_eligible_opportunity",
  "unavailable",
] as const;

export const CUSTOMER_PRIMARY_STATE_VALUES: readonly CanonicalCustomerPrimaryState[] = [
  "unable_to_analyze",
  "analysis_withheld",
  "analysis_limited",
  "verification_needed",
  "competitive_no_opportunity",
  "competitive_with_opportunity",
  "rate_review_needed",
  "rate_review_with_opportunity",
  "fee_opportunity_identified",
  "material_fee_opportunity",
  "verified_benchmark_unavailable",
] as const;

export const CUSTOMER_PERMISSION_KEYS: readonly CanonicalCustomerPermissionKey[] = [
  "core_metrics",
  "effective_rate",
  "benchmark",
  "fee_inventory",
  "ownership_actionability",
  "deterministic_opportunity",
  "estimated_opportunity",
  "verification_amounts",
  "evidence_calculations",
  "actions",
  "customer_explanation",
  "ai_enhanced_narrative",
] as const;

export const CUSTOMER_ACTION_TYPES: readonly CanonicalCustomerActionType[] = [
  "review_documentation",
  "verify_charge",
  "request_explanation",
  "request_removal",
  "request_repricing",
  "monitor",
  "no_action",
] as const;

export function isCustomerPrimaryState(value: string): value is CanonicalCustomerPrimaryState {
  return (CUSTOMER_PRIMARY_STATE_VALUES as readonly string[]).includes(value);
}
