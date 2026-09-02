import type {
  CanonicalEconomicsV2SemanticAmendmentId,
  CanonicalEconomicsV2VersionManifest,
} from "./types.js";

export const CANONICAL_ECONOMICS_V2_SCHEMA_VERSION = "canonical_economics_v2_foundation_v1" as const;

export const CANONICAL_ECONOMICS_V2_VERSION_MANIFEST: CanonicalEconomicsV2VersionManifest = {
  schemaVersion: CANONICAL_ECONOMICS_V2_SCHEMA_VERSION,
  builderVersion: "canonical_economics_v2_builder_v1",
  sourceModelVersion: "canonical_source_model_v2_foundation_v1",
  financialPopulationPolicyVersion: "canonical_financial_populations_v2_foundation_v1",
  effectiveRatePolicyVersion: "canonical_effective_rate_v2_foundation_v1",
  averageTicketPolicyVersion: "canonical_average_ticket_v2_foundation_v1",
  reconciliationReferenceVersion: "canonical_reconciliation_references_v2_foundation_v1",
  authority: "shadow_non_authoritative",
  persistence: "none",
  aiResearchAuthority: "prohibited",
};

export const RB_SEMANTIC_AMENDMENT_IDS = [
  "RB-AMEND-001-MULTI-POPULATION",
  "RB-AMEND-002-UNDEFINED-RATE",
  "RB-AMEND-003-GROSS-AVERAGE-TICKET",
  "RB-AMEND-004-FINANCIAL-DIRECTION",
  "RB-AMEND-005-REPRESENTATION-CONTRIBUTION",
] as const satisfies readonly CanonicalEconomicsV2SemanticAmendmentId[];

export const RB_SEMANTIC_AMENDMENT_REASONS: Record<CanonicalEconomicsV2SemanticAmendmentId, string> = {
  "RB-AMEND-001-MULTI-POPULATION":
    "Gross sales, refunds, and canonical net submitted coexist as distinct financial populations.",
  "RB-AMEND-002-UNDEFINED-RATE":
    "A zero headline denominator produces an explicit undefined metric state rather than numeric zero.",
  "RB-AMEND-003-GROSS-AVERAGE-TICKET":
    "Headline average ticket uses proven gross-sale volume and gross-sale transaction count populations.",
  "RB-AMEND-004-FINANCIAL-DIRECTION":
    "Refunds, fee credits, settlement adjustments, chargeback principal, representments, and chargeback fees remain distinct.",
  "RB-AMEND-005-REPRESENTATION-CONTRIBUTION":
    "Repeated source representations have at most one authoritative economic contributor.",
};
