import type {
  CanonicalFeeActionability,
  CanonicalFeeCategory,
  CanonicalFeeClassificationConfidence,
  CanonicalFeeParty,
} from "./types.js";

export const FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION = "fee_knowledge_registry_v1" as const;
export const FEE_KNOWLEDGE_POLICY_VERSION = "fee_knowledge_policy_v1" as const;
export const FEE_KNOWLEDGE_SOURCE_PACKET_VERSION = "fee_knowledge_source_packet_v1" as const;
export const FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION = "fee_knowledge_research_policy_v1" as const;
export const FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION = "fee_knowledge_retrieval_policy_v1" as const;
export const FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION = "fee_knowledge_claim_support_v1" as const;
export const FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION = "fee_knowledge_domain_identity_policy_v1" as const;
export const FEE_KNOWLEDGE_INTELLIGENCE_POLICY_VERSION = "fee_knowledge_intelligence_v1" as const;

export type FeeKnowledgeSourceLifecycle = "active" | "expired" | "superseded" | "revoked" | "contradicted";
export type FeeKnowledgeSourceKind =
  | "official_processor_documentation"
  | "official_card_network_documentation"
  | "government_regulatory_documentation"
  | "approved_primary_source";
export type FeeKnowledgeDisplayPermission = "displayable" | "internal_only" | "human_review_required";
export type FeeKnowledgeClaimDisplayPermission = "displayable" | "internal_only" | "human_review_required";
export type FeeKnowledgeEvidenceDecision =
  | "verified_classification"
  | "verified_rule"
  | "verified_application"
  | "possible_interpretation"
  | "needs_verification"
  | "conflicting_evidence"
  | "unsupported"
  | "source_unavailable"
  | "source_inapplicable";
export type FeeKnowledgeProvenanceDecision =
  | "approved_documentation"
  | "runtime_verified_documentation"
  | "verified_candidate_limited"
  | "industry_inference"
  | "insufficient_evidence"
  | "conflicting_evidence"
  | "human_review";
export type FeeKnowledgeIntelligenceOrigin =
  | "statement_grounded"
  | "retrieved_document"
  | "semantic_verification"
  | "deterministic_math";
export type FeeKnowledgeIntelligenceState =
  | "ai_interpretation"
  | "ai_hypothesis"
  | "anomaly_flag"
  | "investigation_lead"
  | "source_derived_candidate_evidence"
  | "externally_supported"
  | "externally_verified"
  | "math_verified"
  | "fully_verified"
  | "unresolved_review_needed"
  | "rejected";
export type FeeKnowledgeIntelligenceSubject =
  | "fee_meaning"
  | "fee_alias"
  | "fee_ownership"
  | "processor_vs_network"
  | "published_rate"
  | "applicability_condition"
  | "markup_hypothesis"
  | "anomaly"
  | "negotiability"
  | "investigation_question"
  | "source_relevance"
  | "conflict";
export type FeeKnowledgeIntelligenceProofRequirement =
  | "statement_grounded_labeling_only"
  | "external_verification_required"
  | "deterministic_math_required"
  | "external_and_math_required"
  | "human_review_required";
export type FeeKnowledgeResolutionRequirement =
  | "current_statement_sufficient"
  | "public_evidence_required"
  | "merchant_pricing_document_required"
  | "additional_statement_history_required"
  | "deterministic_math_required"
  | "public_evidence_unavailable"
  | "unresolved_review_required";
export type FeeKnowledgeMerchantActionability =
  | "merchant_display_provisional"
  | "merchant_display_supported"
  | "merchant_display_verified"
  | "internal_only"
  | "human_review_only";
export type FeeKnowledgeCandidateVerificationStatus =
  | "runtime_verified_documentation"
  | "verified_candidate_limited"
  | "provisional"
  | "rejected"
  | "safety_blocked"
  | "source_unavailable"
  | "source_inapplicable"
  | "conflicting_evidence";
export type FeeKnowledgeResearchAttemptStatus = "completed" | "disabled" | "not_needed" | "failed" | "timed_out" | "safety_blocked";
export type FeeKnowledgeResearchNonSuccessStatus =
  | FeeKnowledgeResearchAttemptStatus
  | "budget_exhausted"
  | "not_selected_planning"
  | "provider_unavailable"
  | "unsupported_model";
export type FeeKnowledgeRetrievalStatus =
  | "not_started"
  | "retrieved_text"
  | "retrieval_succeeded_text_unavailable"
  | "unavailable"
  | "failed"
  | "timed_out"
  | "safety_blocked"
  | "unsupported_content_type"
  | "oversized"
  | "malformed"
  | "encrypted";

export type FeeKnowledgeRetrievalOutcomeClass =
  | "successful_usable_retrieval"
  | "successful_retrieval_text_unavailable"
  | "dns_resolution_failed"
  | "destination_policy_blocked"
  | "connection_failed"
  | "tls_failed"
  | "http_response_failed"
  | "redirect_rejected"
  | "content_rejected"
  | "size_limit_exceeded"
  | "extraction_failed"
  | "watchdog_timeout"
  | "unknown_transport_failure";

export type FeeKnowledgeRetrievalSafeDiagnostics = {
  policyVersion: typeof FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION;
  outcomeClass: FeeKnowledgeRetrievalOutcomeClass;
  reasonCodes: string[];
  sourceDomain: string | null;
  finalSourceDomain: string | null;
  sourceOriginHash: string | null;
  finalSourceOriginHash: string | null;
  sourceHostnameHash: string | null;
  finalSourceHostnameHash: string | null;
  protocol: "https" | null;
  finalProtocol: "https" | null;
  redirectCount: number;
  attemptedNetwork: boolean;
  resolvedAddressCount: number | null;
  resolvedAddressFamilies: Array<"ipv4" | "ipv6">;
  blockedAddressClass: "private_or_reserved" | "unsafe_host" | "unsafe_port" | "unsafe_scheme" | "credentials" | "missing_host" | "invalid_url" | null;
  httpStatus: number | null;
  contentType: string | null;
  byteLength: number;
  documentFingerprint: string | null;
};

export type FeeKnowledgePeriod = {
  from: string | null;
  through: string | null;
};

export type FeeKnowledgeDomainIdentity = {
  policyVersion: typeof FEE_KNOWLEDGE_POLICY_VERSION;
  publisherId: string;
  officialDomains: string[];
  aliases: string[];
  verificationBasis: "registry_reviewed" | "runtime_policy_verified" | "human_review_required";
};

export type FeeKnowledgeDomainIdentityEvidenceRecord = {
  type: "fee_knowledge_domain_identity_evidence";
  policyVersion: typeof FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION;
  publisherId: string;
  publisherDisplayName: string;
  officialDomain: string;
  evidenceUrl: string;
  evidenceLocator: string;
  evidenceSummary: string;
  reviewedAt: string;
  establishesFeeConclusion: false;
};

export type FeeKnowledgeDomainIdentityPolicy = {
  policyVersion: typeof FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION;
  reviewedPublisherDomains: Array<{
    publisherId: string;
    aliases: string[];
    officialDomains: string[];
  }>;
  identityEvidence: FeeKnowledgeDomainIdentityEvidenceRecord[];
};

export type FeeKnowledgeSourceClaim = {
  claimId: string;
  claimType: "classification" | "published_rule" | "ownership_controller" | "application_condition" | "exclusion" | "contradiction";
  feeLabels: string[];
  categories: CanonicalFeeCategory[];
  processorIds: string[];
  networkIds: string[];
  semanticConclusion: {
    category: CanonicalFeeCategory | null;
    likelyEconomicOwner: CanonicalFeeParty | null;
    likelyContractualController: CanonicalFeeParty | null;
  };
  conditions: string[];
  exclusions: string[];
  maximumConfidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
  effectivePeriod: FeeKnowledgePeriod;
  sourceLocator: string | null;
  customerSafeParaphrase: string;
  displayPermission: FeeKnowledgeClaimDisplayPermission;
};

export type FeeKnowledgeSourceEntry = {
  sourceId: string;
  registrySchemaVersion: typeof FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION;
  policyVersion: typeof FEE_KNOWLEDGE_POLICY_VERSION;
  lifecycle: FeeKnowledgeSourceLifecycle;
  kind: FeeKnowledgeSourceKind;
  title: string;
  publisher: string;
  canonicalUrl: string;
  domainIdentity: FeeKnowledgeDomainIdentity;
  publicationDate: string | null;
  effectivePeriod: FeeKnowledgePeriod;
  retrievalDate: string;
  lastVerificationDate: string;
  reverifyAfterDate: string | null;
  jurisdiction: string[];
  market: string[];
  processorIds: string[];
  networkIds: string[];
  aliases: string[];
  supersedesSourceId: string | null;
  supersededBySourceId: string | null;
  contentFingerprint: string | null;
  displayPermission: FeeKnowledgeDisplayPermission;
  claims: FeeKnowledgeSourceClaim[];
};

export type ApprovedFeeKnowledgeSourceRegistry = {
  registrySchemaVersion: typeof FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION;
  registryVersion: string;
  policyVersion: typeof FEE_KNOWLEDGE_POLICY_VERSION;
  sources: FeeKnowledgeSourceEntry[];
};

export type FeeKnowledgeSourceMatchRecord = {
  type: "fee_knowledge_source_match";
  policyVersion: typeof FEE_KNOWLEDGE_POLICY_VERSION;
  feeRowRef: string;
  sourceId: string;
  claimId: string;
  matchBasis: "exact_processor_or_network" | "broader_official" | "runtime_verified" | "limited_candidate";
  lifecycle: FeeKnowledgeSourceLifecycle;
  periodApplicable: boolean;
  deterministicMatchConfidence: CanonicalFeeClassificationConfidence;
  contradictions: string[];
  exclusions: string[];
  maximumActionabilityCeiling: CanonicalFeeActionability;
};

export type FeeKnowledgeResearchAttemptRecord = {
  type: "fee_knowledge_research_attempt";
  policyVersion: typeof FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION;
  attemptId: string;
  questionRef: string;
  feeRowRef: string;
  sanitizedQuestionCategory: "classification" | "published_rule" | "applicability" | "contradiction";
  triggerReason:
    | "missing_applicable_registry_claim"
    | "expired_or_superseded_source"
    | "contradicted_source"
    | "material_unfamiliar_label"
    | "adaptive_missing_applicability"
    | "adaptive_missing_rate_rule_evidence"
    | "adaptive_inaccessible_authoritative_source"
    | "not_needed"
    | "disabled";
  status: FeeKnowledgeResearchNonSuccessStatus;
  resultCount: number;
  candidateIds: string[];
  reasonCodes: string[];
  providerDetailsStripped: true;
};

export type FeeKnowledgeResearchCandidateRecord = {
  type: "fee_knowledge_research_candidate";
  policyVersion: typeof FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION;
  candidateId: string;
  questionRef: string;
  feeRowRef: string;
  attemptId: string;
  retrievalStatus: FeeKnowledgeRetrievalStatus;
  semanticVerificationStatus: "not_started" | "not_eligible" | "completed" | "failed" | "timed_out" | "parse_failed" | "safety_blocked" | "provider_unavailable" | "unsupported";
  canonicalUrl: string | null;
  title: string | null;
  publisher: string | null;
  verificationStatus: FeeKnowledgeCandidateVerificationStatus;
  reasonCodes: string[];
  safeApplicability: {
    processorOrNetworkMatched: boolean;
    periodApplicable: boolean;
    jurisdictionApplicable: boolean | null;
    contextApplicable: boolean | null;
  };
  sourceFingerprint: string | null;
  safeRetrievalDiagnostics?: FeeKnowledgeRetrievalSafeDiagnostics | null;
  locatorHash: string | null;
  claimSupportDecisionRef: string | null;
  displayPermission: FeeKnowledgeDisplayPermission;
};

export type FeeKnowledgeIntelligenceRecord = {
  type: "fee_knowledge_intelligence";
  policyVersion: typeof FEE_KNOWLEDGE_INTELLIGENCE_POLICY_VERSION;
  intelligenceId: string;
  feeRowRef: string;
  origin: FeeKnowledgeIntelligenceOrigin;
  state: FeeKnowledgeIntelligenceState;
  subject: FeeKnowledgeIntelligenceSubject;
  summary: string;
  reasonCodes: string[];
  confidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
  merchantActionability: FeeKnowledgeMerchantActionability;
  proofRequirement: FeeKnowledgeIntelligenceProofRequirement;
  resolutionRequirement: FeeKnowledgeResolutionRequirement;
  basis: {
    statementEvidenceRefs: string[];
    researchAttemptRefs: string[];
    candidateRefs: string[];
    claimSupportRefs: string[];
    deterministicFactRefs: string[];
  };
  candidateEvidence: {
    candidateRef: string;
    documentFingerprint: string;
    locatorHash: string | null;
    sourceDomain: string | null;
    supportStatus: "candidate_only" | "semantic_supported" | "semantic_rejected" | "semantic_not_run" | "inapplicable";
  } | null;
  mathVerification: {
    status: "not_required" | "required_not_run" | "passed" | "failed";
    deterministicCalculationRef: string | null;
  };
  supersededByIntelligenceRef: string | null;
  displayPermission: FeeKnowledgeDisplayPermission;
};

export type FeeKnowledgeEvidenceLocator = {
  locatorId: string;
  kind: "html_heading" | "html_paragraph" | "html_table" | "pdf_page" | "plain_text";
  pageNumber: number | null;
  sectionLabel: string | null;
  paragraphIndex: number | null;
  tableIndex: number | null;
  rowIndex: number | null;
  textStart: number | null;
  textEnd: number | null;
  textHash: string;
};

export type FeeKnowledgeStructuredClaim = {
  claimKind: "classification" | "published_rule" | "merchant_application" | "unavailable" | "unsupported";
  feeLabel: string;
  processorOrNetwork: string | null;
  statementPeriodYear: string | null;
  proposedCategory: CanonicalFeeCategory | null;
  likelyEconomicOwner: CanonicalFeeParty | null;
  likelyContractualController: CanonicalFeeParty | null;
  conditions: string[];
  exclusions: string[];
  maximumConfidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
  ruleValue: string | null;
  applicationBasis: "not_evaluated" | "statement_basis_matches" | "statement_basis_mismatch" | "not_applicable";
};

export type FeeKnowledgeSemanticSupportDecision = {
  type: "fee_knowledge_semantic_support_decision";
  policyVersion: typeof FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION;
  decision: "supports" | "partially_supports" | "does_not_support" | "contradicts" | "unsupported";
  structuredClaim: FeeKnowledgeStructuredClaim;
  reasonCodes: string[];
  providerDetailsStripped: true;
};

export type FeeKnowledgeClaimSupportRecord = {
  type: "fee_knowledge_claim_support";
  policyVersion: typeof FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION;
  claimSupportId: string;
  feeRowRef: string;
  sourceId: string;
  claimId: string;
  candidateId: string | null;
  structuredClaim: FeeKnowledgeStructuredClaim;
  documentFingerprint: string;
  evidenceLocator: FeeKnowledgeEvidenceLocator;
  locatorTextHash: string;
  boundedSafeExcerpt: string;
  semanticSupport: FeeKnowledgeSemanticSupportDecision;
  aiSemanticMatchExplanation: string;
  citationExists: boolean;
  applicability: {
    processorOrNetwork: boolean;
    jurisdiction: boolean | null;
    transactionContext: boolean | null;
    statementPeriod: boolean;
  };
  rateOrAmountComparison: "not_calculable" | "matches_published_rule" | "does_not_match_published_rule" | "not_evaluated";
  contradictions: string[];
  exclusions: string[];
  evidenceDecision: FeeKnowledgeEvidenceDecision;
  confidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
};

export type FeeKnowledgeProvenanceDecisionRecord = {
  type: "fee_knowledge_provenance_decision";
  policyVersion: typeof FEE_KNOWLEDGE_POLICY_VERSION;
  decisionId: string;
  feeRowRef: string;
  decision: FeeKnowledgeProvenanceDecision;
  sourceId: string | null;
  claimId: string | null;
  candidateId: string | null;
  claimSupportId: string | null;
  reasonCodes: string[];
  limitations: string[];
  maximumConfidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
};

export type FeeKnowledgeCustomerSafeSourceProjection = {
  sourceId: string;
  title: string;
  publisher: string;
  canonicalUrl: string;
  publicationDate: string | null;
  effectiveDate: string | null;
  lastVerifiedDate: string;
  customerSafeClaimParaphrase: string;
  evidenceType: FeeKnowledgeEvidenceDecision;
  applicabilityLimitation: string;
  displayable: boolean;
};

export type FeeKnowledgeRowSourcePacket = {
  feeRowRef: string;
  applicableApprovedClaimSupportRefs: string[];
  runtimeVerifiedClaimSupportRefs: string[];
  verifiedCandidateRefs: string[];
  absenceOrFailureAttemptRefs: string[];
  contradictionRefs: string[];
  permittedProvenanceChoices: Array<{
    provenance: "approved_external_documentation" | "runtime_verified_documentation" | "industry_inference" | "human_review";
    sourceId: string | null;
    claimId: string | null;
    claimSupportId: string | null;
    evidenceDecision: FeeKnowledgeEvidenceDecision | null;
    confidenceCeiling: CanonicalFeeClassificationConfidence;
    actionabilityCeiling: CanonicalFeeActionability;
  }>;
};

export type FeeKnowledgeSourcePacket = {
  type: "fee_knowledge_source_packet";
  policyVersion: typeof FEE_KNOWLEDGE_SOURCE_PACKET_VERSION;
  registryVersion: string;
  researchPolicyVersion: typeof FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION;
  registryValidation: {
    status: "valid" | "invalid";
    reasonCodes: string[];
  };
  rowPackets: FeeKnowledgeRowSourcePacket[];
  sourceMatches: FeeKnowledgeSourceMatchRecord[];
  researchAttempts: FeeKnowledgeResearchAttemptRecord[];
  researchCandidates: FeeKnowledgeResearchCandidateRecord[];
  intelligence: FeeKnowledgeIntelligenceRecord[];
  claimSupports: FeeKnowledgeClaimSupportRecord[];
  provenanceDecisions: FeeKnowledgeProvenanceDecisionRecord[];
  customerSafeSources: FeeKnowledgeCustomerSafeSourceProjection[];
};
