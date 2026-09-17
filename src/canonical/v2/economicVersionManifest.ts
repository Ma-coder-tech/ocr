import type { CanonicalEconomicSemanticAmendmentId, CanonicalEconomicsV2EconomicVersionManifest } from "./economicTypes.js";

export const CANONICAL_ECONOMICS_V2_ECONOMIC_VERSION_MANIFEST: CanonicalEconomicsV2EconomicVersionManifest = {
  schemaVersion: "canonical_economics_v2_economic_analysis_v1",
  builderVersion: "canonical_economics_v2_economic_builder_v2",
  chargeIdentityPolicyVersion: "canonical_economic_charge_identity_v2_v2",
  participantControlPolicyVersion: "canonical_economic_participant_control_v2_v2",
  costStackPolicyVersion: "canonical_economic_cost_stack_v2_v2",
  authority: "shadow_non_authoritative",
  persistence: "none",
  customerExposure: "none",
  aiResearchAuthority: "prohibited",
  reportAuthority: "prohibited",
  totalAcceptanceCostAuthority: "prohibited",
};

export const RD_SEMANTIC_AMENDMENT_IDS = [
  "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY",
  "RD-AMEND-002-INDEPENDENT-CONTROL-ROLES",
  "RD-AMEND-003-POSITIVE-IDENTIFICATION",
  "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK",
  "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION",
  "RD-AMEND-006-STATEMENT-COST-NOT-TOTAL-ACCEPTANCE-COST",
] as const satisfies readonly CanonicalEconomicSemanticAmendmentId[];

export const RD_SEMANTIC_AMENDMENT_REASONS: Record<CanonicalEconomicSemanticAmendmentId, string> = {
  "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY":
    "Economic charge identity follows admitted occurrence and representation relationships rather than source-row labels and amounts.",
  "RD-AMEND-002-INDEPENDENT-CONTROL-ROLES":
    "Collector, billing intermediary, beneficiary, owner, setters, negotiator, controller, and constraints remain independent claims.",
  "RD-AMEND-003-POSITIVE-IDENTIFICATION":
    "Economic participant and control roles require positive evidence and never arise from billing, collection, branding, labels, or familiar patterns alone.",
  "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK":
    "Numerical reconciliation remains separate from semantic completeness, with unresolved allocations preserved explicitly.",
  "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION":
    "Fee direction remains explicit and settlement, refund, dispute-principal, reserve, and funding activity stays outside processing-fee cost.",
  "RD-AMEND-006-STATEMENT-COST-NOT-TOTAL-ACCEPTANCE-COST":
    "The canonical stack represents only statement-evidenced processing cost and never asserts complete total acceptance cost.",
};
