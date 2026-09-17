import type { AnalysisSummary } from "./types.js";

export const AI_PROVIDER_AUTHORITY_CLASSES = [
  "CANONICAL_V2_GOVERNED_RESEARCH",
  "LEGACY_AI_PROHIBITED_SUPPORTED_FISERV",
  "EVALUATION_ONLY",
] as const;

export type AiProviderAuthorityClass = (typeof AI_PROVIDER_AUTHORITY_CLASSES)[number];

export const SUPPORTED_FISERV_DRIVER_IDS = [
  "fiserv_first_data_full_statement",
  "fiserv_first_data_short_statement",
  "fiserv_first_data_processor_statement",
  "generic_fiserv_family_statement",
] as const;

export type SupportedFiservDriverId = (typeof SUPPORTED_FISERV_DRIVER_IDS)[number];

export const SUPPORTED_FISERV_PROHIBITED_LEGACY_AI_OPERATIONS = [
  "statement_notice_ai_extraction",
  "benchmark_category_ai_inference",
  "processor_fee_ai_classification",
  "fiserv_v2_fee_analysis_ai_classification",
  "full_statement_anomaly_ai_review",
  "single_statement_merchant_narrative_ai",
  "ai_fallback_refinement",
] as const;

export const EVALUATION_ONLY_AI_OPERATIONS = [
  "multi_statement_narrative_ai",
  "package_f_whole_statement_fee_intelligence",
  "package_f_merchant_attention_interpreter",
  "legacy_fee_knowledge_research",
  "legacy_fee_knowledge_investigation",
  "reconstruction_live_hypothesis",
  "shadow_ai_economic_resolution_planner",
] as const;

export type AiProviderOperation =
  | (typeof SUPPORTED_FISERV_PROHIBITED_LEGACY_AI_OPERATIONS)[number]
  | (typeof EVALUATION_ONLY_AI_OPERATIONS)[number]
  | "canonical_v2_rg";

export type AiProviderAuthorityTelemetry = {
  schemaVersion: "ai_provider_authority_telemetry_v1";
  scope: "supported_fiserv_single_statement" | "normal_multi_statement" | "canonical_v2_rg" | "evaluation";
  authority: AiProviderAuthorityClass;
  operations: readonly AiProviderOperation[];
  providerCallAttempts: number;
  disposition: "blocked_before_dispatch" | "conditionally_available" | "evaluation_dependency_only";
};

const supportedFiservDriverIds = new Set<string>(SUPPORTED_FISERV_DRIVER_IDS);

export function isSupportedFiservParserDriverId(driverId: string | null | undefined): driverId is SupportedFiservDriverId {
  return typeof driverId === "string" && supportedFiservDriverIds.has(driverId);
}

export function isSupportedFiservAnalysis(summary: Pick<AnalysisSummary, "parserSource">): boolean {
  return isSupportedFiservParserDriverId(summary.parserSource?.driverId);
}

export function shouldRunLegacyAiRefinement(summary: Pick<AnalysisSummary, "parserSource">): boolean {
  return !isSupportedFiservAnalysis(summary);
}

export function supportedFiservLegacyAiContainmentTelemetry(): AiProviderAuthorityTelemetry {
  return {
    schemaVersion: "ai_provider_authority_telemetry_v1",
    scope: "supported_fiserv_single_statement",
    authority: "LEGACY_AI_PROHIBITED_SUPPORTED_FISERV",
    operations: SUPPORTED_FISERV_PROHIBITED_LEGACY_AI_OPERATIONS,
    providerCallAttempts: 0,
    disposition: "blocked_before_dispatch",
  };
}

export function normalMultiStatementAiContainmentTelemetry(): AiProviderAuthorityTelemetry {
  return {
    schemaVersion: "ai_provider_authority_telemetry_v1",
    scope: "normal_multi_statement",
    authority: "LEGACY_AI_PROHIBITED_SUPPORTED_FISERV",
    operations: ["multi_statement_narrative_ai"],
    providerCallAttempts: 0,
    disposition: "blocked_before_dispatch",
  };
}

export function evaluationOnlyAiTelemetry(operation: (typeof EVALUATION_ONLY_AI_OPERATIONS)[number]): AiProviderAuthorityTelemetry {
  return {
    schemaVersion: "ai_provider_authority_telemetry_v1",
    scope: "evaluation",
    authority: "EVALUATION_ONLY",
    operations: [operation],
    providerCallAttempts: 0,
    disposition: "evaluation_dependency_only",
  };
}

export function canonicalV2RgAuthorityTelemetry(providerCallAttempts: number): AiProviderAuthorityTelemetry {
  if (!Number.isSafeInteger(providerCallAttempts) || providerCallAttempts < 0) {
    throw new Error("Canonical-v2 RG provider-call count must be a non-negative integer.");
  }
  return {
    schemaVersion: "ai_provider_authority_telemetry_v1",
    scope: "canonical_v2_rg",
    authority: "CANONICAL_V2_GOVERNED_RESEARCH",
    operations: ["canonical_v2_rg"],
    providerCallAttempts,
    disposition: "conditionally_available",
  };
}
