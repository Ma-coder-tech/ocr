import type { BudgetSnapshot, IntelligenceDiagnostic, SemanticVerificationStatus } from "../intelligence/intelligenceTypes.js";
export type { ProviderSafeQuestionContextV1 } from "../intelligence/intelligenceTypes.js";
import type { KnowledgeClaimValue, KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";

export const E2E_INTERNAL_ANALYSIS_AMENDMENT_ID = "E2E-AMEND-001-OBSERVATION-TO-INVESTIGATION" as const;
export const E2E_LIVE_RESEARCH_OUTCOME_AMENDMENT_ID = "E2E-AMEND-002-LIVE-RESEARCH-OUTCOME" as const;

export type InvestigationQuestionClassV1 = "application_fee_public_definition" | "non_swiped_discount_public_definition";

export type InvestigationQuestionOriginV1 = {
  schemaVersion: "investigation_question_origin_v1";
  amendmentId: typeof E2E_INTERNAL_ANALYSIS_AMENDMENT_ID;
  originId: string;
  unknownRef: string;
  originLane: "canonical_dependency" | "statement_observation";
  questionClass: InvestigationQuestionClassV1;
  claimType: "processor_term";
  subjectCode: "application_fee_terminology" | "non_swiped_discount_terminology";
  safeResearchLabel: "application fee" | "non swiped discount";
  questionText: string;
  occurrenceRefs: string[];
  evidenceRefs: string[];
  observedAmountMinor: number | null;
  currency: "USD";
  materialityBasis: "observed_nonzero_charge";
  authority: "account_private_noncanonical_observation";
  visibility: "account_private";
  humanReviewRequired: true;
  canonicalMutationAllowed: false;
  prohibitedPresumptions: Array<"economic_category" | "ownership_or_control" | "removability" | "pricing_architecture" | "savings">;
};

export type InternalFindingKindV1 =
  | "canonical_fact"
  | "admitted_knowledge"
  | "supported_research_finding"
  | "investigative_hypothesis"
  | "contradiction"
  | "unresolved_question";

export type InternalFindingV1 = {
  findingId: string;
  kind: InternalFindingKindV1;
  title: string;
  displayValue: string | null;
  statementEvidenceRefs: string[];
  knowledgeRefs: string[];
  researchEvidenceRefs: string[];
  questionOriginRefs: string[];
  proposedValue: KnowledgeClaimValue | null;
  authority: "canonical_deterministic" | "rf_admitted" | "verified_public_candidate" | "investigative_only" | "unresolved";
  supportStatus: SemanticVerificationStatus | "not_applicable" | "rf_resolved";
  scopeAndPeriod: string;
  limitations: string[];
  canonicalMutationAllowed: false;
};

export type InternalStatementObservationV1 = {
  observationId: string;
  questionClass: InvestigationQuestionClassV1;
  label: string;
  occurrenceRefs: string[];
  evidenceRefs: string[];
  observedAmountMinor: number | null;
  currency: "USD";
  authority: "statement_observation";
  limitations: string[];
};

export type InternalRecommendationKindV1 =
  | "supported_economic_action"
  | "verification_action"
  | "documentation_request"
  | "research_followup"
  | "monitoring_action"
  | "no_action_insufficient_evidence";

export type InternalRecommendationV1 = {
  recommendationId: string;
  kind: InternalRecommendationKindV1;
  title: string;
  findingRefs: string[];
  evidenceRefs: string[];
  actionabilityCeiling: "verification_only" | "documentation_only" | "monitoring_only" | "economic_action_supported" | "no_action";
  merchantControl: "proven" | "unresolved" | "not_applicable";
  limitations: string[];
};

export type InternalImpactStateV1 =
  | "observed_cost"
  | "amount_under_review"
  | "potential_reduction_exact"
  | "potential_reduction_range"
  | "unquantified_hypothesis"
  | "unavailable";

export type InternalImpactV1 = {
  impactId: string;
  observationRef: string | null;
  state: InternalImpactStateV1;
  amountMinor: number | null;
  maximumAmountMinor: number | null;
  currency: "USD" | null;
  annualized: false;
  counterfactualRef: string | null;
  limitations: string[];
};

export type InternalAnalysisTerminalStatusV1 =
  | "completed"
  | "completed_with_unresolved"
  | "blocked_fatal_deterministic_failure"
  | "provider_unavailable"
  | "research_unavailable";

export type InternalResearchOutcomeV1 =
  | "research_completed"
  | "completed_with_unresolved_evidence"
  | "research_unavailable_due_to_timeout"
  | "no_eligible_public_evidence_found"
  | "source_rejected_by_authority_policy"
  | "provider_failure";

export type InternalResearchQuestionOutcomeV1 = {
  questionId: string;
  questionClass: InvestigationQuestionClassV1;
  subjectCode: "application_fee_terminology" | "non_swiped_discount_terminology";
  outcome: InternalResearchOutcomeV1;
  attempted: boolean;
  operationalReasonCodes: string[];
  retainedCandidateCount: number;
  publicResearchStillPossible: boolean;
};

export type PublicSourceEvidenceV1 = {
  evidenceId: string;
  supportId: string;
  questionId: string;
  candidateId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceAuthority: KnowledgeSourceAuthority;
  authorityAdmissionRef: string;
  retrievedAt: string;
  documentId: string;
  documentFingerprint: string;
  locator: { locatorId: string; page: number | null; sectionCode: string | null; lineStart: number; lineEnd: number };
  boundedSupportingExcerpt: string;
  semanticVerification: SemanticVerificationStatus;
  limitations: string[];
};

export type PublicSourceEvidenceManifestV1 = {
  schemaVersion: "public_source_evidence_manifest_v1";
  privacy: "internal_pre_uat_public_evidence";
  downloadedBodiesPersisted: false;
  entries: PublicSourceEvidenceV1[];
};

export type InternalStatementAnalysisV1 = {
  schemaVersion: "internal_statement_analysis_v1";
  audience: "internal_analyst_only";
  authority: "shadow_non_authoritative";
  amendmentIds: [typeof E2E_INTERNAL_ANALYSIS_AMENDMENT_ID, typeof E2E_LIVE_RESEARCH_OUTCOME_AMENDMENT_ID];
  safeStatementId: string;
  runId: string;
  evaluatedAt: string;
  executionStatus: "completed";
  researchOutcome: InternalResearchOutcomeV1;
  researchQuestionOutcomes: InternalResearchQuestionOutcomeV1[];
  terminalStatus: InternalAnalysisTerminalStatusV1;
  canonicalBeforeHash: string;
  canonicalAfterHash: string;
  canonicalTruthPreserved: boolean;
  canonicalFacts: InternalFindingV1[];
  statementObservations: InternalStatementObservationV1[];
  admittedKnowledge: InternalFindingV1[];
  supportedResearchFindings: InternalFindingV1[];
  investigativeHypotheses: InternalFindingV1[];
  contradictions: InternalFindingV1[];
  unresolvedQuestions: InternalFindingV1[];
  recommendations: InternalRecommendationV1[];
  impact: InternalImpactV1[];
  limitations: string[];
};

export type RgInternalAuditV1 = {
  schemaVersion: "rg_internal_analysis_audit_v1";
  runId: string;
  executionMode: "injected_evaluation" | "internal_live_evaluation";
  externalNetworkCallCount: number;
  liveTimingPolicy: {
    amendmentId: "RG-AMEND-011-INTERNAL-LIVE-TIMING-V2";
    searchTimeoutMs: 40_000;
    globalWallTimeMs: 180_000;
  };
  providerOperationReceipts: ProviderOperationReceiptV1[];
  questions: Array<{
    questionId: string;
    subjectCode: string;
    originatingUnknownRef: string;
    eligibility: string;
    selection: string;
    reasonCodes: string[];
  }>;
  verificationOutcomes: Array<{
    supportId: string;
    questionId: string;
    candidateId: string;
    documentId: string;
    locatorId: string;
    status: SemanticVerificationStatus;
    reasonCodes: string[];
  }>;
  budget: BudgetSnapshot;
  diagnostics: IntelligenceDiagnostic;
  canonicalBeforeHash: string;
  canonicalAfterHash: string;
  canonicalTruthPreserved: boolean;
  rfSnapshotHash: string;
  rfEntryRefs: string[];
  policyVersions: string[];
};

export type ProviderOperationReceiptV1 = {
  receiptId: string;
  reservationId: string;
  operationId: string;
  operation: "search" | "retrieval" | "investigative_model" | "semantic_model";
  providerCode: string;
  logicalAttempt: 1;
  actualSendCount: 0 | 1;
  retryCount: 0;
  sendState: "not_sent" | "sent";
  completionState: "reserved" | "not_sent" | "completed" | "timed_out" | "cancelled" | "failed" | "unknown_possible_billable";
  elapsedMs: number;
  usageState: "known" | "unknown_possible_billable";
  outputTokens: number | null;
  providerRequestCount: number | null;
  usageCostUsd: number | null;
  providerConfigurationCode: string | null;
  safeReasonCode: string;
};
