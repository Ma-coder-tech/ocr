import type {
  CanonicalAiCapabilityId,
  CanonicalAiCapabilityStatus,
  CanonicalAiFinancialReadiness,
} from "./types.js";

export const CANONICAL_AI_CAPABILITY_BOUNDARY_POLICY_VERSION = "canonical_ai_capability_boundary_v1" as const;
export const AI_MATERIALITY_POLICY_VERSION = "ai_materiality_policy_v1" as const;
export const AI_READINESS_DEGRADATION_POLICY_VERSION = "ai_readiness_degradation_policy_v1" as const;
export const AI_PRIVACY_RETENTION_POLICY_VERSION = "ai_privacy_retention_policy_v1" as const;
export const DETERMINISTIC_EXPLANATION_POLICY_VERSION = "deterministic_explanation_policy_v1" as const;
export const CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION = "canonical_runtime_safety_review_v1" as const;

export const CANONICAL_AI_CAPABILITIES: readonly CanonicalAiCapabilityId[] = [
  "full_statement_anomaly_review",
  "whole_statement_fee_intelligence_review",
  "fee_classification_review",
  "notice_change_review",
  "benchmark_category_review",
  "merchant_narrative",
  "document_quality_review",
] as const;

export const SUCCESSFUL_AI_CAPABILITY_STATUSES: readonly CanonicalAiCapabilityStatus[] = ["completed", "not_needed"] as const;

export function isSuccessfulAiCapabilityStatus(status: CanonicalAiCapabilityStatus): boolean {
  return SUCCESSFUL_AI_CAPABILITY_STATUSES.includes(status);
}

export function combineFinancialReadiness(values: readonly CanonicalAiFinancialReadiness[]): CanonicalAiFinancialReadiness {
  if (values.includes("withheld")) return "withheld";
  if (values.includes("limited")) return "limited";
  return "ready";
}
