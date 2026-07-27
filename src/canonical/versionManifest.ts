import { MONEY_POLICY_VERSION } from "./money.js";
import type { CanonicalAnalysisVersionManifest } from "./types.js";

export const CANONICAL_SCHEMA_VERSION = "canonical_statement_analysis_v1" as const;
export const CANONICAL_BUILDER_VERSION = "canonical_fact_builder_package_c_v1" as const;
export const CANONICAL_PARSER_VERSION = "legacy_parser_adapter_v1" as const;
export const CANONICAL_OPPORTUNITY_ENGINE_POLICY_VERSION = "canonical_opportunity_engine_v1" as const;
export const OPPORTUNITY_TARGET_POLICY_VERSION = "opportunity_target_policy_v1" as const;
export const OPPORTUNITY_CADENCE_POLICY_VERSION = "opportunity_cadence_policy_v1" as const;
export const OPPORTUNITY_BENCHMARK_POLICY_VERSION = "opportunity_benchmark_policy_v1" as const;
export const OPPORTUNITY_AI_BOUNDARY_POLICY_VERSION = "opportunity_ai_boundary_policy_v1" as const;

export function buildVersionManifest(input: {
  parserId: string | null;
  parserVersion?: string | null;
  extractionVersion?: string;
}): CanonicalAnalysisVersionManifest {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    canonicalBuilderVersion: CANONICAL_BUILDER_VERSION,
    moneyPolicyVersion: MONEY_POLICY_VERSION,
    effectiveRatePolicyVersion: "effective_rate_basis_v1",
    transactionCountPolicyVersion: "transaction_population_match_v1",
    feeClassificationPolicyVersion: "fee_taxonomy_v1",
    ownershipActionabilityPolicyVersion: "fee_ownership_actionability_v1",
    feeOwnershipRuleRegistryVersion: "fee_ownership_rules_v1",
    feeAiSuggestionPolicyVersion: "fee_ai_suggestion_policy_v1",
    feeHumanOverridePolicyVersion: "fee_human_override_policy_v1",
    opportunityEnginePolicyVersion: CANONICAL_OPPORTUNITY_ENGINE_POLICY_VERSION,
    opportunityTargetPolicyVersion: OPPORTUNITY_TARGET_POLICY_VERSION,
    opportunityCadencePolicyVersion: OPPORTUNITY_CADENCE_POLICY_VERSION,
    opportunityBenchmarkPolicyVersion: OPPORTUNITY_BENCHMARK_POLICY_VERSION,
    opportunityAiBoundaryPolicyVersion: OPPORTUNITY_AI_BOUNDARY_POLICY_VERSION,
    parserId: input.parserId,
    parserVersion: input.parserVersion ?? CANONICAL_PARSER_VERSION,
    extractionVersion: input.extractionVersion ?? "pdfjs_text_rows_v1",
  };
}
