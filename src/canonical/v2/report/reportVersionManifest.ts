import type { RhSemanticAmendmentId } from "./reportTypes.js";

export const CANONICAL_REPORT_V2_VERSION_MANIFEST = {
  schemaVersion: "canonical_merchant_report_projection_v2_v1",
  builderVersion: "canonical_merchant_report_projection_builder_v1",
  visibilityPolicyVersion: "canonical_report_visibility_v2_v1",
  customerCopyPolicyVersion: "canonical_report_customer_copy_v2_v1",
  compositionPolicyVersion: "canonical_report_composition_v2_v1",
  authority: "shadow_non_authoritative",
  persistence: "none",
  sourceOfTruth: "canonical_economics_v2_only",
  customerLanguage: "deterministic_copy_registry_only",
  externalCitations: "disabled",
  reportV1Authority: "unchanged",
  runtimeIntegration: "none",
} as const;

export const RH_SEMANTIC_AMENDMENT_IDS = [
  "RH-AMEND-001-V2-SOURCE-OF-TRUTH",
  "RH-AMEND-002-THREE-PUBLIC-EXPERIENCES",
  "RH-AMEND-003-INDEPENDENT-VERDICT-AXES",
  "RH-AMEND-004-QUALIFIED-COMPARISON-OR-UNAVAILABLE",
  "RH-AMEND-005-THEME-BASED-ATTENTION",
  "RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION",
  "RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION",
  "RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS",
  "RH-AMEND-009-TYPED-CUSTOMER-COPY",
  "RH-AMEND-010-DETERMINISTIC-LANGUAGE-FALLBACK",
  "RH-AMEND-011-SINGLE-STATEMENT-ACTION-CEILING",
  "RH-AMEND-012-REPORT-V1-COEXISTENCE",
] as const satisfies readonly RhSemanticAmendmentId[];

export const RH_SEMANTIC_AMENDMENT_REASONS: Record<RhSemanticAmendmentId, string> = {
  "RH-AMEND-001-V2-SOURCE-OF-TRUTH": "Customer projection consumes accepted Canonical Economics V2 only.",
  "RH-AMEND-002-THREE-PUBLIC-EXPERIENCES": "Eight legacy report states collapse into three public experiences with typed internal reasons.",
  "RH-AMEND-003-INDEPENDENT-VERDICT-AXES": "Readiness, comparison, findings, priority, evidence, and questions remain independent.",
  "RH-AMEND-004-QUALIFIED-COMPARISON-OR-UNAVAILABLE": "Comparison remains unavailable without an upstream qualified canonical comparison.",
  "RH-AMEND-005-THEME-BASED-ATTENTION": "Merchant Attention projects supported RE themes rather than fee-row existence.",
  "RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION": "Fee composition is dynamic, reconciled, and preserves credits as signed offsets.",
  "RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION": "Eligible counterfactual impact remains distinct from verification-only amounts.",
  "RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS": "Every visible item is bounded by upstream evidence and actionability authority.",
  "RH-AMEND-009-TYPED-CUSTOMER-COPY": "Customer language is selected through exhaustive typed codes.",
  "RH-AMEND-010-DETERMINISTIC-LANGUAGE-FALLBACK": "Initial RH ignores non-authoritative RG language candidates and uses deterministic copy.",
  "RH-AMEND-011-SINGLE-STATEMENT-ACTION-CEILING": "Actions are educational or verification-oriented and never become demands or promises.",
  "RH-AMEND-012-REPORT-V1-COEXISTENCE": "Report V2 remains isolated and does not alter Report V1 authority or routing.",
};
