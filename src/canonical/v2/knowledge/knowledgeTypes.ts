export const KNOWLEDGE_LIFECYCLE_STATES = [
  "candidate",
  "researched",
  "verified",
  "admitted",
  "admitted_with_conditions",
  "contradicted",
  "superseded",
  "deprecated",
  "rejected",
] as const;

export type KnowledgeLifecycleState = (typeof KNOWLEDGE_LIFECYCLE_STATES)[number];

export const KNOWLEDGE_CLAIM_TYPES = [
  "template_identity",
  "template_section_semantics",
  "alias_identity",
  "network_program_mapping",
  "stable_facet_mapping",
  "published_network_rate",
  "processor_term",
  "merchant_account_term",
  "refund_underlying_cost_rule",
  "refund_processor_pricing_rule",
  "pricing_program_rule",
  "dispute_threshold_rule",
  "participant_control_role",
  "amex_acceptance_structure",
  "notice_notification_fact",
  "notice_external_rule",
  "merchant_lever_availability",
  "benchmark_qualification",
] as const;

export type KnowledgeClaimType = (typeof KNOWLEDGE_CLAIM_TYPES)[number];

export type KnowledgeClaimValue =
  | { kind: "identity"; canonicalCode: string }
  | { kind: "mapping"; canonicalCode: string; sourceCode: string }
  | {
    kind: "rate";
    basisCode: "percent_of_volume" | "per_item" | "per_auth" | "flat_monthly" | "variable";
    rateBasisPoints: number | null;
    fixedAmountMinor: number | null;
    currency: string | null;
  }
  | { kind: "term"; termCode: string; termValue: string }
  | { kind: "rule"; ruleCode: string; outcomeCode: string }
  | { kind: "threshold"; numeratorCode: string; denominatorCode: string; thresholdBasisPoints: number }
  | {
    kind: "role";
    participantRole:
      | "merchant"
      | "processor_platform"
      | "acquirer"
      | "iso_reseller_agent"
      | "gateway"
      | "network_card_brand"
      | "issuer_interchange_system"
      | "debit_network"
      | "service_provider"
      | "equipment_lessor"
      | "funding_provider"
      | "rule_regulatory_authority"
      | null;
    controlDimension:
      | "collector"
      | "billing_intermediary"
      | "economic_beneficiary"
      | "economic_owner"
      | "rule_setter"
      | "price_setter"
      | "negotiator_change_authority"
      | "contractual_controller"
      | "constraint";
    state: "proven" | "unresolved" | "conflicting" | "unavailable" | "not_applicable";
  }
  | { kind: "boolean"; value: boolean };

export type KnowledgeScopeDimension =
  | { kind: "exact"; value: string }
  | { kind: "unbounded" }
  | { kind: "unknown" };

export type KnowledgeScopeDimensionName =
  | "processor"
  | "acquirer"
  | "isoReseller"
  | "processorProgram"
  | "network"
  | "region"
  | "channel"
  | "cardProduct"
  | "merchantCategory"
  | "pricingProgram"
  | "templateFamily"
  | "templateVersion"
  | "sourceSection"
  | "population"
  | "jurisdiction";

export type KnowledgeScope = Record<KnowledgeScopeDimensionName, KnowledgeScopeDimension>;

export type KnowledgeVisibility = "reusable" | "tenant_private" | "account_private";

export type KnowledgeAuthorityClass =
  | "product_owner"
  | "authorized_domain_reviewer"
  | "data_steward";

export type KnowledgeSourceAuthority =
  | "official_network_publication"
  | "processor_publication"
  | "merchant_contract"
  | "account_statement_observation"
  | "statement_observation"
  | "verified_cross_statement_observation"
  | "admitted_template_specification"
  | "approved_internal_manual_mapping"
  | "synthetic_test_fixture"
  | "legacy_reference_candidate"
  | "automated_retrieval"
  | "ai_inference";

export type KnowledgeAdmissionCondition = {
  type: "claim_evidence_scope_period";
  claimType: KnowledgeClaimType;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  requiredScope: Partial<Record<KnowledgeScopeDimensionName, string>>;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evaluation: "satisfied" | "unresolved";
  evaluatedAt: string;
};

export type KnowledgeEvidenceRef = {
  ref: string;
  sourceAuthority: KnowledgeSourceAuthority;
  private: boolean;
};

export type KnowledgeAdmission = {
  lifecycle: KnowledgeLifecycleState;
  authorityClass: KnowledgeAuthorityClass | null;
  authorityRef: string | null;
  admittedAt: string | null;
  conditions: KnowledgeAdmissionCondition[];
};

export type KnowledgeEntry = {
  id: string;
  version: number;
  claimType: KnowledgeClaimType;
  subjectCode: string;
  value: KnowledgeClaimValue;
  scope: KnowledgeScope;
  visibility: KnowledgeVisibility;
  tenantRef: string | null;
  accountRef: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evidence: KnowledgeEvidenceRef[];
  admission: KnowledgeAdmission;
  supersedes: string[];
  limitations: string[];
  confidence: "high" | "medium" | "low" | "unresolved";
};

export type KnowledgeQueryScope = Partial<Record<KnowledgeScopeDimensionName, string | null>> & {
  tenantRef: string | null;
  accountRef: string | null;
};

export type KnowledgeQuery = {
  claimType: KnowledgeClaimType;
  subjectCode: string;
  asOf: string;
  scope: KnowledgeQueryScope;
};

export type KnowledgeResolutionStatus =
  | "resolved_single"
  | "resolved_corroborated"
  | "unresolved_no_admitted_knowledge"
  | "unresolved_conflict"
  | "unresolved_visibility_boundary"
  | "unresolved_scope_or_period"
  | "unresolved_policy_rejection";

export type KnowledgeResolution = {
  status: KnowledgeResolutionStatus;
  claimType: KnowledgeClaimType;
  subjectCode: string;
  value: KnowledgeClaimValue | null;
  selectedEntryRefs: string[];
  corroboratingEntryRefs: string[];
  rejectedCounts: Record<string, number>;
  conflictEntryCount: number;
  asOf: string;
  scope: KnowledgeQueryScope;
  sourceAuthorities: KnowledgeSourceAuthority[];
};

export type KnowledgeValidationIssue = {
  code: string;
  entryRef: string | null;
  message: string;
};

export type KnowledgeValidationResult = {
  valid: boolean;
  issues: KnowledgeValidationIssue[];
};

export type KnowledgeCandidatePacket = {
  candidateId: string;
  proposedClaimType: KnowledgeClaimType;
  proposedSubjectCode: string;
  proposedValue: KnowledgeClaimValue;
  sourceAuthority: KnowledgeSourceAuthority;
  claimedConfidence: "high" | "medium" | "low" | "unresolved" | null;
  lifecycle: "candidate";
  requiresHumanAdmission: true;
  privacy: "private_by_default";
  proposedScope: KnowledgeScope;
  proposedVisibility: KnowledgeVisibility;
  tenantRef: string | null;
  accountRef: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publicationDate: string | null;
  evidence: KnowledgeEvidenceRef[];
  basis: {
    code: string | null;
    unit: string | null;
    denominator: string | null;
    currency: string | null;
    exactValue: string | null;
  };
  provenance: {
    adapter: "supplied" | "reference_rate_catalog" | "legacy_fiserv_fee_reference" | "bounded_intelligence_runtime";
    sourceRecordRef: string;
    sourceVersion: string | null;
    sourceAuthorityClaim: KnowledgeSourceAuthority;
    sourceFieldRefs: string[];
  };
  knownConflictCodes: string[];
  limitations: string[];
};

export type KnowledgeAuditEvent = {
  eventId: string;
  entryRef: string;
  previousEntryRef: string | null;
  eventType: "created" | "researched" | "verified" | "admitted" | "condition_changed" | "contradicted" | "superseded" | "deprecated" | "rejected";
  authorityClass: KnowledgeAuthorityClass | null;
  authorityRef: string | null;
  occurredAt: string;
  priorVersion: number | null;
  nextVersion: number;
  priorState: KnowledgeLifecycleState | null;
  nextState: KnowledgeLifecycleState;
  priorVisibility: KnowledgeVisibility | null;
  nextVisibility: KnowledgeVisibility;
  reasonCodes: string[];
  policyVersion: "payments_knowledge_library_v0_2";
};

export type KnowledgeUnknownQueueItem = {
  id: string;
  claimType: KnowledgeClaimType;
  subjectCode: string;
  status: "open" | "resolved";
  reason: KnowledgeResolutionStatus;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  dependencyCodes: string[];
  originatingFactKinds: string[];
  originatingCanonicalRefs: string[];
  scope: KnowledgeQueryScope;
  asOf: string;
  blockingEffect: "blocking" | "limits_authority" | "informational";
  limitations: string[];
  resolvedByEntryRefs: string[];
};

export type KnowledgeNotApplicableDetermination = {
  status: "deterministically_not_applicable";
  claimType: KnowledgeClaimType;
  subjectCode: string;
  scope: KnowledgeQueryScope;
  asOf: string;
  dependencyCodes: string[];
  originatingCanonicalRefs: string[];
  basisCodes: string[];
  evidenceRefs: string[];
};

export type KnowledgeDifferenceClassification =
  | "same_semantic_fact"
  | "approved_semantic_amendment"
  | "v2_unavailable_or_ambiguous"
  | "unexpected_divergence";

export const knowledgeExact = (value: string): KnowledgeScopeDimension => ({ kind: "exact", value });
export const knowledgeUnbounded = (): KnowledgeScopeDimension => ({ kind: "unbounded" });
export const knowledgeUnknown = (): KnowledgeScopeDimension => ({ kind: "unknown" });

export function unboundedKnowledgeScope(): KnowledgeScope {
  return {
    processor: knowledgeUnbounded(), acquirer: knowledgeUnbounded(), isoReseller: knowledgeUnbounded(),
    processorProgram: knowledgeUnbounded(), network: knowledgeUnbounded(),
    region: knowledgeUnbounded(), channel: knowledgeUnbounded(), cardProduct: knowledgeUnbounded(),
    merchantCategory: knowledgeUnbounded(), pricingProgram: knowledgeUnbounded(),
    templateFamily: knowledgeUnbounded(), templateVersion: knowledgeUnbounded(),
    sourceSection: knowledgeUnbounded(), population: knowledgeUnbounded(), jurisdiction: knowledgeUnbounded(),
  };
}
