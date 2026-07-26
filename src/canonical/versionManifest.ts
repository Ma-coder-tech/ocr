import { MONEY_POLICY_VERSION } from "./money.js";
import type { CanonicalAnalysisVersionManifest } from "./types.js";

export const CANONICAL_SCHEMA_VERSION = "canonical_statement_analysis_v1" as const;
export const CANONICAL_BUILDER_VERSION = "canonical_fact_builder_package_c_v1" as const;
export const CANONICAL_PARSER_VERSION = "legacy_parser_adapter_v1" as const;

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
    parserId: input.parserId,
    parserVersion: input.parserVersion ?? CANONICAL_PARSER_VERSION,
    extractionVersion: input.extractionVersion ?? "pdfjs_text_rows_v1",
  };
}
