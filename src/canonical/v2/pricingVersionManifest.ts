import type {
  CanonicalEconomicsV2PricingVersionManifest,
  CanonicalPricingSemanticAmendmentId,
} from "./pricingTypes.js";

export const CANONICAL_ECONOMICS_V2_PRICING_VERSION_MANIFEST: CanonicalEconomicsV2PricingVersionManifest = {
  schemaVersion: "canonical_economics_v2_pricing_architecture_v1",
  builderVersion: "canonical_economics_v2_pricing_builder_v1",
  pricingPopulationPolicyVersion: "canonical_pricing_populations_v2_v1",
  pricingAxisPolicyVersion: "canonical_pricing_axes_v2_v1",
  pricingFormulaPolicyVersion: "canonical_pricing_formula_v2_v1",
  derivedSummaryPolicyVersion: "canonical_pricing_summary_projection_v2_v1",
  authority: "shadow_non_authoritative",
  persistence: "none",
  customerExposure: "none",
  aiResearchAuthority: "prohibited",
  reportAuthority: "prohibited",
};

export const RC_SEMANTIC_AMENDMENT_IDS = [
  "RC-AMEND-001-INDEPENDENT-PRICING-AXES",
  "RC-AMEND-002-POPULATION-SCOPED-PRICING",
  "RC-AMEND-003-ACTIVITY-GATED-PRICING",
  "RC-AMEND-004-EVIDENCE-BOUND-COMPONENTS",
  "RC-AMEND-005-NONCANONICAL-PRICING-SUMMARY",
] as const satisfies readonly CanonicalPricingSemanticAmendmentId[];

export const RC_SEMANTIC_AMENDMENT_REASONS: Record<CanonicalPricingSemanticAmendmentId, string> = {
  "RC-AMEND-001-INDEPENDENT-PRICING-AXES":
    "Underlying-cost billing mode, merchant price-schedule shape, and scope uniformity remain independent canonical facts.",
  "RC-AMEND-002-POPULATION-SCOPED-PRICING":
    "Materially different source-supported pricing populations retain their own formulas instead of being flattened account-wide.",
  "RC-AMEND-003-ACTIVITY-GATED-PRICING":
    "Inactive and zero-activity rows remain informational and cannot establish the active current-period pricing architecture.",
  "RC-AMEND-004-EVIDENCE-BOUND-COMPONENTS":
    "Pricing components retain population, basis, formula, derivability, occurrence, and evidence relationships.",
  "RC-AMEND-005-NONCANONICAL-PRICING-SUMMARY":
    "A human pricing summary is a deterministic noncanonical projection and cannot override or repair canonical axes.",
};
