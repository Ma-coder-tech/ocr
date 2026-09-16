import type {
  CanonicalEconomicsV2SynthesisVersionManifest,
  CanonicalSynthesisSemanticAmendmentId,
} from "./synthesisTypes.js";

export const CANONICAL_ECONOMICS_V2_SYNTHESIS_VERSION_MANIFEST: CanonicalEconomicsV2SynthesisVersionManifest = {
  schemaVersion: "canonical_economics_v2_synthesis_analysis_v1",
  builderVersion: "canonical_economics_v2_synthesis_builder_v1",
  attributionPolicyVersion: "canonical_economic_attribution_v2_v1",
  counterfactualPolicyVersion: "canonical_economic_counterfactual_v2_v1",
  leverPolicyVersion: "canonical_merchant_lever_v2_v1",
  themePolicyVersion: "canonical_economic_theme_v2_v1",
  authority: "shadow_non_authoritative",
  persistence: "none",
  customerExposure: "none",
  aiResearchAuthority: "prohibited",
  reportAuthority: "prohibited",
  accountSavingsAuthority: "prohibited",
  knowledgeResolutionAuthority: "prohibited",
};

export const RE_SEMANTIC_AMENDMENT_IDS = [
  "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY",
  "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION",
  "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL",
  "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER",
  "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS",
  "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION",
  "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY",
  "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS",
] as const satisfies readonly CanonicalSynthesisSemanticAmendmentId[];

export const RE_SEMANTIC_AMENDMENT_REASONS: Record<CanonicalSynthesisSemanticAmendmentId, string> = {
  "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY":
    "An observed economic driver remains independent from merchant-lever eligibility and calculated impact.",
  "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION":
    "Overlapping or shared populations cannot be aggregated unless exclusivity or deterministic allocation is proven.",
  "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL":
    "A counterfactual requires compatible populations, admitted alternative provenance, deterministic math, period, and uncertainty controls.",
  "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER":
    "Merchant-lever eligibility requires supported control or operational influence and does not arise from charge existence.",
  "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS":
    "Refund, Amex, service, pricing-program, and off-statement money flows remain independently evidenced and unresolved where necessary.",
  "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION":
    "Future notices remain candidate context and cannot alter current-period economics.",
  "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY":
    "Operational observations, causality, dispute ratios, monitoring status, fault, and fairness remain separate evidence-bound claims.",
  "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS":
    "Themes deterministically group one economic question without duplicating evidence or generating merchant-facing prose.",
};
