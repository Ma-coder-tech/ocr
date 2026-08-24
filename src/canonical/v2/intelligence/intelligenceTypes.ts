import type {
  KnowledgeCandidatePacket,
  KnowledgeClaimType,
  KnowledgeClaimValue,
  KnowledgeEntry,
  KnowledgeQueryScope,
  KnowledgeResolution,
  KnowledgeSourceAuthority,
  KnowledgeUnknownQueueItem,
} from "../knowledge/knowledgeTypes.js";

export const RG_SEMANTIC_AMENDMENT_IDS = [
  "RG-AMEND-001-DETERMINISTIC-QUESTION-SELECTION",
  "RG-AMEND-002-ADMITTED-KNOWLEDGE-FIRST",
  "RG-AMEND-003-RESERVATION-BOUNDED-EXECUTION",
  "RG-AMEND-004-IDENTITY-COMPLETE-RESEARCH-GRAPH",
  "RG-AMEND-005-SEMANTIC-NOT-SUBSTRING-SUPPORT",
  "RG-AMEND-006-CANDIDATE-NOT-ADMISSION",
  "RG-AMEND-007-FAILURE-PRESERVES-CANONICAL-TRUTH",
  "RG-AMEND-008-AI-NON-MUTATION",
  "RG-AMEND-009-UNTRUSTED-CONTENT-ISOLATION",
  "RG-AMEND-010-BOUNDED-THEME-LANGUAGE-CANDIDATE",
  "RG-AMEND-012-KNOWN-AUTHORITY-DISCOVERY-RESILIENCE",
] as const;

export const RG_INTERNAL_LIVE_TIMING_AMENDMENT_ID = "RG-AMEND-011-INTERNAL-LIVE-TIMING-V2" as const;

export type RgSemanticAmendmentId = (typeof RG_SEMANTIC_AMENDMENT_IDS)[number];

export type IntelligenceDifferenceClassification =
  | "same_semantic_fact"
  | "approved_semantic_amendment"
  | "v2_unavailable_or_ambiguous"
  | "unexpected_divergence";

export type RgFreeV1BudgetProfile = {
  profile: "RG-FREE-v1";
  maxSelectedQuestions: 4;
  maxSearchCalls: 8;
  maxAdaptiveSearchesPerQuestion: 1;
  maxCandidatesPerQuestion: 3;
  maxCandidatesTotal: 8;
  maxRetrievalDocuments: 8;
  maxRetrievalBytesPerDocument: 5_242_880;
  maxRetrievalBytesTotal: 20_971_520;
  maxInvestigativeAiCalls: 4;
  maxSemanticVerificationCalls: 4;
  maxSemanticSupportItems: 8;
  maxLanguageCalls: 2;
  maxStructuredItemsPerBatch: 4;
  searchTimeoutMs: 8_000 | 40_000;
  retrievalTimeoutMs: 12_000;
  pdfExtractionTimeoutMs: 10_000;
  investigativeAiTimeoutMs: 20_000;
  semanticVerificationTimeoutMs: 20_000;
  languageTimeoutMs: 15_000;
  globalWallTimeMs: 90_000 | 180_000;
  maxInvestigativeOutputTokensPerCall: 1_200;
  maxSemanticOutputTokensPerCall: 1_200;
  maxLanguageOutputTokensPerCall: 800;
  maxModelOutputTokensTotal: 12_000;
  automaticProviderRetries: 0;
  schemaRepairRetries: 0;
  maxRemoteConcurrency: 2;
};

export type BudgetDimension =
  | "search_calls"
  | "adaptive_searches"
  | "candidates"
  | "retrieval_documents"
  | "retrieval_bytes"
  | "pdf_extractions"
  | "investigative_ai_calls"
  | "semantic_verification_calls"
  | "semantic_support_items"
  | "language_calls"
  | "model_output_tokens";

export type BudgetReservation = {
  reservationId: string;
  operationId: string;
  dimension: BudgetDimension;
  amount: number;
  consumedAmount: number;
  state: "reserved" | "completed" | "failed" | "timeout" | "indeterminate" | "released";
  usageState: "known" | "unknown_possible_billable";
};

export type BudgetSnapshot = {
  profile: "RG-FREE-v1";
  limits: Record<BudgetDimension, number>;
  consumed: Record<BudgetDimension, number>;
  remaining: Record<BudgetDimension, number>;
  reservations: BudgetReservation[];
  exhaustedDimensions: BudgetDimension[];
};

export type RuntimeQuestionPriority =
  | "material_control_cost_stack"
  | "material_network_rule"
  | "material_operational_action"
  | "material_repeated_unknown"
  | "material_benchmark_rule";

export type RuntimeQuestionOrigin = {
  unknownRef: string;
  themeRefs: string[];
  originatingCanonicalRefs: string[];
  materiality: "material" | "contextual" | "unresolved";
  priority: RuntimeQuestionPriority;
  reportDecisionCode: string;
  possibleAnswerCodes: string[];
  requiredEvidenceClass: string;
  publicResearchPlausible: boolean;
};

export type ProviderSafeQuestionContextV1 = {
  schemaVersion: "provider_safe_question_context_v1";
  providerContextId: string;
  questionClass: "application_fee_public_definition" | "non_swiped_discount_public_definition";
  claimType: "processor_term";
  subjectCode: "application_fee_terminology" | "non_swiped_discount_terminology";
  safeResearchLabel: "application fee" | "non swiped discount";
  questionText: string;
  processorProgram: string | null;
  periodYear: string;
  allowedContext: "public_product_terminology_only";
};

export type ProviderQuestionContextBindingV1 = {
  unknownRef: string;
  context: ProviderSafeQuestionContextV1;
};

export type PublicSourcePathMatchMode = "exact_document" | "path_family";

export type PublicSourceEvidentiaryScope =
  | "claim_class_only"
  | "terminology_example_presentation_only";

export type PublicSourcePeriodApplicabilityPolicy =
  | "period_not_applicable"
  | "documented_effective_period"
  | "historical_example_only";

export type PublicSourcePublicationMetadata = {
  title: string;
  version: string | null;
  publicationDate: string | null;
  samplePeriodStart: string | null;
  samplePeriodEnd: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  periodApplicabilityPolicy: PublicSourcePeriodApplicabilityPolicy;
  retrievalVerifiedOn: string;
  provenanceUrls: string[];
};

export type PublicSourceAuthorityAdmission = {
  admissionId: string;
  admissionVersion: number;
  authority: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  origin: string;
  publicationFamilyCode: string;
  publicationMetadata: PublicSourcePublicationMetadata;
  pathMatchMode: PublicSourcePathMatchMode;
  maximumEvidentiaryScope: PublicSourceEvidentiaryScope;
  allowedClaimTypes: KnowledgeClaimType[];
  allowedEvidenceClasses: string[];
  allowedSourceTypeCodes: string[];
  allowedSubjectCodes: string[];
  allowedProcessorPrograms: string[];
  allowedGeographyCodes: string[];
  allowedPathPrefixes: string[];
  approvedDocumentFingerprints: string[];
};

export type RuntimeResearchQuestion = {
  questionId: string;
  claimType: KnowledgeClaimType;
  subjectCode: string;
  originatingUnknownRef: string;
  originatingDependencyRefs: string[];
  originatingThemeRefs: string[];
  relatedCanonicalRefs: string[];
  scope: KnowledgeQueryScope;
  asOf: string;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  requiredEvidenceClasses: string[];
  materiality: RuntimeQuestionOrigin["materiality"];
  blockingEffect: KnowledgeUnknownQueueItem["blockingEffect"];
  priority: RuntimeQuestionPriority;
  reportDecisionCode: string;
  possibleAnswerCodes: string[];
  publicResearchPlausible: boolean;
  rfResolution: KnowledgeResolution;
  eligibility:
    | "eligible"
    | "rf_resolved"
    | "deterministically_not_applicable"
    | "merchant_pricing_document_required"
    | "additional_statement_history_required"
    | "processor_explanation_required"
    | "public_evidence_unavailable"
    | "unresolved_review_required";
  selection: "selected" | "not_selected" | "not_eligible";
  reasonCodes: string[];
  limitations: string[];
};

export type SearchAttempt = {
  attemptId: string;
  questionId: string;
  kind: "initial" | "adaptive";
  queryTerms: string[];
  queryText: string;
  status: "completed" | "no_candidates" | "failed" | "timeout" | "disabled" | "budget_exhausted";
  adaptiveReason: "right_program_wrong_period" | "official_subsection_missing" | "publication_version_missing" | "zero_candidates_safe_query_variant" | null;
  candidateIds: string[];
  reasonCodes: string[];
  providerMetadata: SearchProviderMetadataV1 | null;
};

export type SearchToolExecutionState = "verified" | "unverified" | "not_executed";

export type SearchProviderMetadataV1 = {
  providerResponseId: string | null;
  modelIdentifier: string | null;
  finishReason: string | null;
  webSearchRequestCount: number | null;
  annotationCount: number;
  normalizedCandidateCount: number;
  providerCompletionState: "completed";
  toolExecutionState: SearchToolExecutionState;
};

export type SearchDiscoveryCandidate = {
  candidateId: string;
  questionId: string;
  attemptId: string;
  url: string;
  claimedAuthority: KnowledgeSourceAuthority;
  sourceTypeCode: string;
  rank: number;
  publicationDate: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  locatorHint: string | null;
  selectionReasonCode: string;
  title?: string | null;
  discoveryMetadata: {
    providerCode: string;
    configurationCode: string;
    sourceDomain: string;
    providerRank: number;
    providerSnippetUsedAsEvidence: false;
  };
};

export type DiscoveryCandidate = SearchDiscoveryCandidate & {
  retrievalEligibility: "eligible" | "wrong_authority" | "safety_blocked";
  authorityAdmissionRef: string | null;
  authorityPublicationFamilyCode: string | null;
};

export type SearchRequest = {
  reservationId: string;
  attemptId: string;
  questionId: string;
  queryTerms: string[];
  queryText: string;
  allowedAuthorities: KnowledgeSourceAuthority[];
  maximumCandidates: number;
  outputAccounting: "search_discovery_not_model_generation";
  logicalAttempt: 1;
  untrustedContentPolicy: "data_only_no_instructions";
};

export type SearchResponse = {
  attemptId: string;
  questionId: string;
  candidates: SearchDiscoveryCandidate[];
  suggestedAdaptiveReason: SearchAttempt["adaptiveReason"];
  providerMetadata: SearchProviderMetadataV1;
  outputAccounting: "search_discovery_not_model_generation";
};

export type DestinationPermit = {
  permitId: string;
  candidateId: string;
  normalizedUrl: string;
  host: string;
  approvedAddresses: string[];
  expiresAtMs: number;
};

export type DestinationResolution = {
  candidateId: string;
  normalizedUrl: string;
  addresses: string[];
  permitId: string;
};

export type RedirectHop = {
  normalizedUrl: string;
  permitId: string;
  connectedAddress: string;
};

export type RetrievalRequest = {
  reservationId: string;
  questionId: string;
  candidateId: string;
  documentId: string;
  permit: DestinationPermit;
  maximumBytes: number;
  httpsOnly: true;
  logicalAttempt: 1;
  signal: AbortSignal;
  recordReceivedBytes(cumulativeBytes: number): "continue" | "abort";
  authorizeRedirect(rawUrl: string): Promise<DestinationPermit>;
};

export type RetrievalResponse = {
  questionId: string;
  candidateId: string;
  documentId: string;
  status: "retrieved" | "inaccessible" | "safety_blocked";
  connectedAddress: string;
  redirects: RedirectHop[];
  mimeType: string | null;
  content: Uint8Array | null;
  byteLength: number;
  streamedByteLength: number;
  safetyContract: {
    streamingByteLimitEnforced: true;
    abortSignalObserved: true;
    destinationPermitEnforced: true;
  };
};

export type DocumentState =
  | "retrieved_extracted"
  | "retrieved_locator_only"
  | "encrypted_pdf"
  | "malformed_pdf"
  | "unsupported_pdf"
  | "unsupported_content_type"
  | "oversized_document"
  | "extraction_failed"
  | "retrieval_timeout"
  | "safety_blocked"
  | "inaccessible";

export type ExtractedLocator = {
  locatorId: string;
  documentId: string;
  page: number | null;
  sectionCode: string | null;
  lineStart: number;
  lineEnd: number;
  text: string;
  documentFingerprint: string;
};

export type DocumentExtractionRequest = {
  questionId: string;
  candidateId: string;
  documentId: string;
  mimeType: string;
  content: Uint8Array;
  maximumOutputBytes: number;
  expectedDocumentFingerprint: string;
};

export type DocumentExtractionResponse = {
  questionId: string;
  candidateId: string;
  documentId: string;
  documentFingerprint: string;
  state: DocumentState;
  text: string | null;
  locators: ExtractedLocator[];
};

export type RuntimeDocumentResult = {
  questionId: string;
  candidateId: string;
  documentId: string;
  state: DocumentState;
  mimeType: string | null;
  byteLength: number;
  locatorIds: string[];
  reasonCodes: string[];
};

export type InvestigativeObservation = {
  itemId: string;
  questionId: string;
  candidateId: string;
  documentId: string;
  locatorId: string;
  documentFingerprint: string;
  interpretationCode: string;
  proposedValue: KnowledgeClaimValue;
  sourceAuthorityCandidate: KnowledgeSourceAuthority;
  effectiveFromCandidate: string | null;
  effectiveToCandidate: string | null;
  limitationCodes: string[];
  financialMutationAllowed: false;
};

export type SemanticVerificationStatus =
  | "supported_candidate"
  | "partially_supported"
  | "unsupported"
  | "contradicted"
  | "wrong_authority"
  | "wrong_scope"
  | "wrong_period"
  | "locator_unproven"
  | "malformed"
  | "verification_unavailable";

export type CandidateClaimSupport = {
  itemId: string;
  supportId: string;
  questionId: string;
  claimType: KnowledgeClaimType;
  subjectCode: string;
  candidateId: string;
  documentId: string;
  locatorId: string;
  documentFingerprint: string;
  investigativeObservationId: string;
  sourceAuthority: KnowledgeSourceAuthority;
  sourceEffectiveFrom: string | null;
  sourceEffectiveTo: string | null;
  applicabilityScope: Omit<KnowledgeQueryScope, "tenantRef" | "accountRef">;
  proposedValue: KnowledgeClaimValue;
  assertionBasisCode: string;
  verificationStatus: SemanticVerificationStatus;
  limitationCodes: string[];
  admissionAuthority: "none";
  financialMutationAllowed: false;
};

export type StructuredBatchRequest<T> = {
  batchId: string;
  attemptId: string;
  schemaVersion: string;
  expectedItemIds: string[];
  reservationId: string;
  maximumOutputTokens: number;
  logicalAttempt: 1;
  items: T[];
  untrustedContentPolicy: "data_only_no_instructions";
};

export type StructuredBatchResponse<T> = {
  batchId: string;
  attemptId: string;
  schemaVersion: string;
  items: T[];
  reportedOutputTokens: number | null;
};

export type SemanticVerificationInput = {
  itemId: string;
  question: {
    questionId: string;
    claimType: KnowledgeClaimType;
    subjectCode: string;
    asOf: string;
    scope: Omit<KnowledgeQueryScope, "tenantRef" | "accountRef">;
    requiredSourceAuthorities: KnowledgeSourceAuthority[];
    requiredEvidenceClasses: string[];
    possibleAnswerCodes: string[];
    limitations: string[];
  };
  candidate: Omit<DiscoveryCandidate, "url">;
  documentId: string;
  locator: ExtractedLocator;
  proposedValue: KnowledgeClaimValue;
};

export type ThemeLanguageInput = {
  itemId: string;
  themeRef: string;
  themeType: string;
  factRefs: string[];
  driverRefs: string[];
  leverRefs: string[];
  limitationCodes: string[];
  actionabilityCode: string;
  uncertaintyState: "resolved" | "limited" | "unresolved";
};

export type ThemeLanguageCandidate = {
  itemId: string;
  themeRef: string;
  text: string;
  deterministicFallbackText: string;
  factRefs: string[];
  driverRefs: string[];
  leverRefs: string[];
  limitationCodes: string[];
  actionabilityCode: string;
  uncertaintyState: "resolved" | "limited" | "unresolved";
  claimClasses: Array<"neutral_observation" | "uncertainty_preserved">;
  source: "deterministic_fallback" | "provider_candidate";
  authority: "non_authoritative_candidate";
  customerVisible: false;
  reportPermission: "none";
  validation: "accepted" | "rejected_strengthening" | "malformed";
};

export type WholeStatementValidation = {
  status: "completed" | "invalid" | "not_requested";
  missingCanonicalRefs: string[];
  contradictorySupportIds: string[];
  semanticConflictQuestionIds: string[];
  unresolvedQuestionIds: string[];
  providerReview: "disabled_no_provider";
};

export type RuntimeStageStatus =
  | "not_needed"
  | "disabled_no_provider"
  | "completed"
  | "completed_with_candidates"
  | "completed_no_support"
  | "budget_exhausted"
  | "no_candidates"
  | "safety_blocked"
  | "provider_unavailable"
  | "timeout"
  | "malformed_output"
  | "parent_aborted";

export type IntelligenceDiagnostic = {
  schemaVersion: "canonical_intelligence_v2_diagnostics_v1";
  stageStatuses: Record<string, RuntimeStageStatus>;
  counts: Record<string, number>;
  elapsedMs: Record<string, number>;
  providerCodes: string[];
  modelCodes: string[];
  tokenUsage: number | "unknown";
  reasonCodes: string[];
};

export type BoundedIntelligenceRuntimeInput = {
  runId: string;
  canonicalTruth: unknown;
  canonicalReferenceIds: string[];
  admittedKnowledge: KnowledgeEntry[];
  unknownQueue: KnowledgeUnknownQueueItem[];
  questionOrigins: RuntimeQuestionOrigin[];
  providerQuestionContexts?: ProviderQuestionContextBindingV1[];
  publicSourceAuthorityAdmissions: PublicSourceAuthorityAdmission[];
  deterministicNotApplicableUnknownRefs: string[];
  languageInputs: ThemeLanguageInput[];
  profile?: RgFreeV1BudgetProfile;
  providerExecution?: "injected_evaluation" | "internal_live_evaluation" | "provider_disabled";
};

export type IntelligenceTimeoutResult<T> =
  | { status: "completed"; value: T }
  | { status: "timeout" }
  | { status: "failed"; reasonCode: string };

export type RuntimeClock = {
  nowMs(): number;
  runWithTimeout<T>(timeoutMs: number, operation: () => Promise<T>): Promise<IntelligenceTimeoutResult<T>>;
};

export type IntelligencePorts = {
  clock: RuntimeClock;
  search?: { providerCode: string; search(request: SearchRequest): Promise<SearchResponse> };
  destination?: { resolve(candidateId: string, normalizedUrl: string): Promise<DestinationResolution> };
  retrieval?: { retrieve(request: RetrievalRequest): Promise<RetrievalResponse> };
  extraction?: { extract(request: DocumentExtractionRequest): Promise<DocumentExtractionResponse> };
  investigative?: {
    providerCode: string;
    modelCode: string;
    investigate(request: StructuredBatchRequest<{ itemId: string; questionId: string; candidateId: string; documentId: string; documentFingerprint: string; text: string; locators: Array<Pick<ExtractedLocator, "locatorId" | "documentId" | "documentFingerprint" | "page" | "sectionCode" | "lineStart" | "lineEnd">>; questionContext?: ProviderSafeQuestionContextV1 }>): Promise<StructuredBatchResponse<InvestigativeObservation>>;
  };
  semantic?: {
    providerCode: string;
    modelCode: string;
    verify(request: StructuredBatchRequest<SemanticVerificationInput>): Promise<StructuredBatchResponse<CandidateClaimSupport>>;
  };
  language?: {
    providerCode: string;
    modelCode: string;
    generate(request: StructuredBatchRequest<ThemeLanguageInput>): Promise<StructuredBatchResponse<ThemeLanguageCandidate>>;
  };
};

export type RuntimeSecurityEvent = {
  eventId: string;
  category: "untrusted_instruction_detected" | "tool_instruction_refused" | "authority_strengthening_rejected" | "private_provider_payload_blocked" | "malformed_provider_output_rejected";
  disposition: "ignored_data_only" | "rejected";
  stage: string;
};

export type SemanticConflict = {
  questionId: string;
  supportIds: string[];
  candidateIds: string[];
  state: "conflicting_supported_candidates";
};

export type PrivateResearchReviewBundle = {
  privacy: "account_private_ephemeral";
  persistence: "none";
  tenantRef: string;
  accountRef: string;
  candidatePacketId: string | null;
  questionId: string;
  candidateId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceAuthority: KnowledgeSourceAuthority;
  sourceAuthorityAdmissionRef: string;
  documentId: string;
  documentFingerprint: string;
  locatorId: string;
  locatorPage: number | null;
  locatorSectionCode: string | null;
  locatorLineStart: number;
  locatorLineEnd: number;
  locatorTextExcerpt: string;
  supportId: string;
  semanticDecision: SemanticVerificationStatus;
  limitationCodes: string[];
};

export type BoundedIntelligenceRuntimeResult = {
  schemaVersion: "canonical_intelligence_v2_runtime_v1";
  profile: "RG-FREE-v1";
  authority: "shadow_non_authoritative";
  persistence: "none";
  providerExecution: "injected_evaluation" | "internal_live_evaluation" | "provider_disabled";
  questions: RuntimeResearchQuestion[];
  searchAttempts: SearchAttempt[];
  candidates: Array<Omit<DiscoveryCandidate, "url">>;
  documents: RuntimeDocumentResult[];
  supports: CandidateClaimSupport[];
  candidatePackets: KnowledgeCandidatePacket[];
  privateReviewBundles: PrivateResearchReviewBundle[];
  semanticConflicts: SemanticConflict[];
  securityEvents: RuntimeSecurityEvent[];
  languageCandidates: ThemeLanguageCandidate[];
  wholeStatementValidation: WholeStatementValidation;
  budget: BudgetSnapshot;
  diagnostics: IntelligenceDiagnostic;
  semanticAmendments: RgSemanticAmendmentId[];
  canonicalTruthPreserved: boolean;
  rfConflictsPreserved: boolean;
  automaticAdmissionCount: 0;
  terminalStatus: "completed" | "completed_unresolved" | "disabled_no_provider" | "invalid";
  unresolvedOutcomeCodes: Array<
    | "public_evidence_unavailable"
    | "merchant_pricing_document_required"
    | "additional_statement_history_required"
    | "processor_explanation_required"
    | "unresolved_review_required"
  >;
};
