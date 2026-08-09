import type { ParserConfidence, ParserDecisionStatus } from "../parserFoundation.js";
import type { ReconciliationStatus } from "../reconciliation.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalFeeActionability,
  CanonicalFeeCategory,
  CanonicalFeeClassificationConfidence,
  CanonicalFeeParty,
} from "../canonical/types.js";
import type {
  FeeKnowledgeCandidateVerificationStatus,
  FeeKnowledgeEvidenceDecision,
  FeeKnowledgeResearchAttemptRecord,
  FeeKnowledgeResearchNonSuccessStatus,
  FeeKnowledgeRetrievalSafeDiagnostics,
  FeeKnowledgeRetrievalStatus,
  FeeKnowledgeSemanticSupportDecision,
  FeeKnowledgeStructuredClaim,
} from "../canonical/feeKnowledgeTypes.js";

export const EVALUATION_SOURCE_MANIFEST_VERSION = "evaluation_source_manifest_v1" as const;
export const EVALUATION_PREFLIGHT_VERSION = "deterministic_evaluation_preflight_v1" as const;
export const EVALUATION_INTEGRITY_ARTIFACT_VERSION = "evaluation_run_integrity_artifact_v1" as const;
export const EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION = "evaluation_run_integrity_artifact_v2" as const;
export const EVALUATION_CANONICAL_ADMISSION_RESULT_VERSION = "evaluation_canonical_admission_result_v1" as const;
export const EVALUATION_CANONICAL_ADMISSION_VERSION = "canonical_whole_statement_fee_intelligence_admission_v1" as const;
export const EVALUATION_PACKAGE_F_RECORD_VERSION = "evaluation_package_f_whole_statement_capability_v1" as const;
export const EVALUATION_PACKAGE_5A_PROJECTION_VERSION = "evaluation_package_5a_admission_projection_v1" as const;
export const EVALUATION_RESEARCH_EVIDENCE_PROOF_VERSION = "evaluation_research_evidence_proof_v1" as const;
export const EVALUATION_CANONICAL_REFERENCE_PROOF_VERSION = "evaluation_canonical_reference_proof_v1" as const;
export const EVALUATION_EXPECTED_RESEARCH_QUESTION_PROJECTION_VERSION = "evaluation_expected_research_question_projection_v1" as const;
export const EVALUATION_PRODUCT_SCOPE_POLICY_VERSION = "ratereveal_fiserv_family_scope_v1" as const;
export const FINANCIAL_INVARIANCE_PROJECTION_VERSION = "packages_b_e_financial_invariance_projection_v2" as const;
export const EVALUATION_COST_LEDGER_VERSION = "evaluation_cost_budget_ledger_v2" as const;

export const evaluationExecutionStages = [
  "parser",
  "whole_statement_ai_review",
  "web_search_discovery",
  "document_retrieval",
  "semantic_verification",
  "canonical_admission",
  "customer_publication",
  "final_artifact",
] as const;

export type EvaluationExecutionStage = (typeof evaluationExecutionStages)[number];

export const paidEvaluationStages = [
  "whole_statement_ai_review",
  "web_search_discovery",
  "document_retrieval",
  "semantic_verification",
] as const satisfies readonly EvaluationExecutionStage[];

export type StatementPeriod = {
  start: string;
  end: string;
};

export type ParserEligibility = "eligible" | "unsupported" | "failed";
export type ProcessorLayoutFamily = "fiserv_family" | "nxgen_vortax" | "unknown";
export type ProductScopeEligibility = "eligible" | "ineligible";
export type PaidStageEligibility = "eligible" | "ineligible";
export type ProductScopeReasonCode =
  | "fiserv_family_supported"
  | "processor_layout_out_of_product_scope"
  | "processor_layout_unknown";
export type PaidStageExclusionReason =
  | "parser_ineligible"
  | "product_scope_ineligible"
  | null;

export type PreflightParserControl = {
  controlId: string;
  status: ReconciliationStatus;
  basisId: string | null;
  populationId: string | null;
  expected: number | null;
  actual: number | null;
  delta: number | null;
  tolerance: number | null;
  reportabilityImpact: "blocking" | "warning" | "none";
};

export type PreservedParserDecision = {
  status: ParserDecisionStatus;
  reportable: boolean;
  confidence: ParserConfidence;
  reason: string;
  reasonCode: string;
  failedControls: PreflightParserControl[];
  warningControls: PreflightParserControl[];
  reportabilityImpact: "blocks_report" | "allows_report_with_warnings" | "allows_report";
};

export type DeterministicPreflightDocument = {
  sourceDocumentId: string;
  internalSourceRef: string;
  sha256: string;
  byteCount: number;
  displayFileName: string | null;
  parsedProcessor: string | null;
  parsedStatementPeriod: StatementPeriod | null;
  parserEligibility: ParserEligibility;
  processorLayoutFamily: ProcessorLayoutFamily;
  productScopeEligibility: ProductScopeEligibility;
  productScopeReasonCode: ProductScopeReasonCode;
  paidStageEligibility: PaidStageEligibility;
  paidStageExclusionReason: PaidStageExclusionReason;
  selectedDriver: string | null;
  allowedExecutionStages: EvaluationExecutionStage[];
  parserRecordId: string;
  parserDecision: PreservedParserDecision;
};

export type DeterministicEvaluationPreflight = {
  type: typeof EVALUATION_PREFLIGHT_VERSION;
  artifactId: string;
  artifactHash: string;
  expectedDocumentCount: number;
  documents: DeterministicPreflightDocument[];
};

export type EvaluationManifestDocument = {
  sourceDocumentId: string;
  internalSourceRef: string;
  sha256: string;
  byteCount: number;
  displayFileName: string | null;
  parsedProcessor: string | null;
  parsedStatementPeriod: StatementPeriod | null;
  parserEligibility: ParserEligibility;
  processorLayoutFamily: ProcessorLayoutFamily;
  productScopeEligibility: ProductScopeEligibility;
  productScopeReasonCode: ProductScopeReasonCode;
  paidStageEligibility: PaidStageEligibility;
  paidStageExclusionReason: PaidStageExclusionReason;
  selectedDriver: string | null;
  duplicateGroupId: string;
  selectedDuplicateRepresentative: boolean;
  duplicateExclusionReason: "duplicate_checksum_non_representative" | null;
  allowedExecutionStages: EvaluationExecutionStage[];
  parentPreflightArtifactId: string;
  parentPreflightArtifactHash: string;
  parserRecordId: string;
  parserDecision: PreservedParserDecision;
};

export type DuplicateDecision = {
  duplicateGroupId: string;
  checksum: string;
  groupMembers: string[];
  selectedRepresentative: string;
  exclusions: Array<{
    sourceDocumentId: string;
    reason: "duplicate_checksum_non_representative";
  }>;
};

export type EvaluationSourceManifest = {
  type: typeof EVALUATION_SOURCE_MANIFEST_VERSION;
  expectedDocumentCount: number;
  selectedDocumentCount: number;
  parentPreflightArtifactId: string;
  parentPreflightArtifactHash: string;
  documents: EvaluationManifestDocument[];
  duplicateDecisions: DuplicateDecision[];
  manifestContentHash: string;
};

export type ObservedEvaluationSource = {
  sourceDocumentId: string;
  internalSourceRef: string;
  sha256: string;
  byteCount: number;
  displayFileName: string | null;
  displayMetadataStatementPeriod?: StatementPeriod | null;
};

export type EvaluationSourceSnapshot = {
  observation: ObservedEvaluationSource;
  bytes: Uint8Array;
};

export type RequestedDocumentExecution = {
  sourceDocumentId: string;
  stages: EvaluationExecutionStage[];
};

export type ExecutionDiagnostic = {
  code: "filename_period_disagrees_with_parsed_period";
  sourceDocumentId: string;
  detail: string;
};

export type ApprovedExecutionDocument = {
  sourceDocumentId: string;
  internalSourceRef: string;
  sha256: string;
  byteCount: number;
  selectedDriver: string | null;
  processorLayoutFamily: ProcessorLayoutFamily;
  productScopeEligibility: ProductScopeEligibility;
  paidStageEligibility: PaidStageEligibility;
  stages: EvaluationExecutionStage[];
};

export type ApprovedExecutionPermit = {
  type: "approved_evaluation_execution_permit_v1";
  manifestPath: string;
  approvedManifestHash: string;
  recalculatedManifestHash: string;
  selectedCount: number;
  documents: ApprovedExecutionDocument[];
  diagnostics: ExecutionDiagnostic[];
};

export type IntegrityFailureCode =
  | "preflight_hash_mismatch"
  | "preflight_count_mismatch"
  | "manifest_schema_invalid"
  | "manifest_hash_mismatch"
  | "approved_manifest_hash_mismatch"
  | "expected_source_missing"
  | "unexpected_source_present"
  | "source_substituted"
  | "source_byte_count_mismatch"
  | "duplicate_decision_mismatch"
  | "selected_count_mismatch"
  | "stage_not_authorized"
  | "paid_stage_parser_ineligible"
  | "paid_stage_product_scope_ineligible"
  | "verified_source_bytes_mismatch"
  | "sanitized_packet_source_identity_leak"
  | "insufficient_budget_reservation"
  | "cost_exceeded_reservation";

export type LifecycleStage =
  | "manifest_row"
  | "preflight_record"
  | "parser_record"
  | "capability_execution"
  | "provider_request"
  | "research_retrieval"
  | "semantic_verification"
  | "canonical_admission"
  | "customer_publication"
  | "final_artifact";

export type LifecycleState = "not_reached" | "blocked" | "failed" | "completed" | "withheld";

export const aiLifecycleStates = [
  "executed",
  "generated",
  "schema_valid",
  "evidence_validated",
  "policy_accepted",
  "canonical_admitted",
  "customer_published",
] as const;

export type AiLifecycleStateName = (typeof aiLifecycleStates)[number];

export type LifecycleEvent = {
  eventId: string;
  sourceDocumentId: string;
  stage: LifecycleStage;
  state: LifecycleState;
  reasonCodes: string[];
  manifestRowRef: string;
  preflightRecordRef: string;
  parserRecordRef: string | null;
  capabilityExecutionRef: string | null;
  providerRequestRef: string | null;
  researchRetrievalRefs: string[];
  semanticVerificationRef: string | null;
  canonicalAdmissionRef: string | null;
  customerPublicationRef: string | null;
  finalArtifactRef: string | null;
};

export type AiLifecycleStateRecord = {
  state: LifecycleState;
  reasonCodes: string[];
};

export type DocumentLifecycle = {
  sourceDocumentId: string;
  aiStates: Record<AiLifecycleStateName, AiLifecycleStateRecord>;
  events: LifecycleEvent[];
};

export type EvaluationLifecycleLedger = {
  type: "evaluation_lifecycle_ledger_v1";
  documents: DocumentLifecycle[];
};

export type PackageName = "package_b" | "package_c" | "package_d" | "package_e";

export type PackageHash = {
  package: PackageName;
  projectionVersion: string;
  beforeHash: string;
  afterHash: string;
  invariant: boolean;
  mismatchPaths: string[];
};

export type FinancialInvarianceResult = {
  type: "packages_b_e_financial_invariance_v1";
  projectionVersion: typeof FINANCIAL_INVARIANCE_PROJECTION_VERSION;
  packages: PackageHash[];
  beforeCombinedHash: string;
  afterCombinedHash: string;
  invariant: boolean;
  mismatchPaths: string[];
  liveRunBlocked: boolean;
};

export type CostCapability =
  | "direct_responses"
  | "ai_sdk"
  | "web_search"
  | "retrieval"
  | "semantic_verification";

export type CostCallStatus = "reserved" | "success" | "failure" | "timeout" | "cancelled_before_send";

export type CostReservationScope = "provider_send" | "budget_envelope";

export type CostOperationKind = "manifest_call" | "package_5b_budget_envelope" | "package_5b_work_unit";

export type CostToolEvent = {
  type: string;
  count: number;
};

export type EvaluationPricingPolicy = {
  uncachedInputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  toolUseUsd: number;
};

export type CostLedgerEntry = {
  callId: string;
  parentCallId: string | null;
  operationKind: CostOperationKind;
  operationRef: string | null;
  reservationScope: CostReservationScope;
  attempt: number;
  attemptKind: "initial" | "retry";
  retryOfCallId: string | null;
  capability: CostCapability;
  currency: "USD";
  fixedPointScale: number;
  pricingPolicyRef: string;
  providerRoute: string;
  provider: string;
  model: string | null;
  toolClass: string;
  maximumInputTokens: number | null;
  maximumOutputTokens: number | null;
  maximumToolUses: number | null;
  requestId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: CostCallStatus;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  toolEvents: CostToolEvent[];
  estimatedMaximumCostUsd: number;
  worstCaseReservedCostUsd: number;
  observedOrEstimatedFinalCostUsd: number | null;
  billingDisposition: "pending" | "observed" | "provider_confirmed_zero" | "unknown";
  cumulativeReservedUsd: number;
  cumulativeObservedUsd: number;
  cumulativeBudgetCommittedUsd: number;
  cumulativeReleasedUsd: number;
  remainingBudgetUsd: number;
};

export type CostBudgetLedgerSnapshot = {
  type: typeof EVALUATION_COST_LEDGER_VERSION;
  currency: "USD";
  fixedPointScale: number;
  approvedBudgetUsd: number;
  cumulativeReservedUsd: number;
  cumulativeObservedUsd: number;
  cumulativeBudgetCommittedUsd: number;
  cumulativeReleasedUsd: number;
  remainingBudgetUsd: number;
  blocked: boolean;
  entries: CostLedgerEntry[];
};

export type EvaluationRunIntegrityArtifact = {
  type: typeof EVALUATION_INTEGRITY_ARTIFACT_VERSION;
  manifestVersion: typeof EVALUATION_SOURCE_MANIFEST_VERSION;
  manifestHash: string;
  approvedManifestHash: string;
  sourceIdentity: Array<Omit<EvaluationManifestDocument, "displayFileName"> & { displayFileNameHash: string | null }>;
  deduplicationDecisions: DuplicateDecision[];
  lifecycleLedger: EvaluationLifecycleLedger;
  parserDecisions: Array<{
    sourceDocumentId: string;
    parserRecordId: string;
    decision: PreservedParserDecision;
  }>;
  parentPreflightProof: {
    artifactId: string;
    recordedHash: string;
    reconstructedHash: string;
    verified: boolean;
  };
  packageFinancialInvariance: Array<{
    sourceDocumentId: string;
    result: FinancialInvarianceResult;
  }>;
  costBudgetLedger: CostBudgetLedgerSnapshot;
  executionPermit: ApprovedExecutionPermit;
  providerCallOutcomes: Array<{
    callId: string;
    parentCallId: string | null;
    operationKind: CostOperationKind;
    operationRef: string | null;
    sourceDocumentId: string;
    stage: EvaluationExecutionStage;
    status: "success" | "failure" | "timeout" | "cancelled_before_send";
    requestId: string | null;
    reasonCodes: string[];
  }>;
  finalStatus: "completed" | "blocked" | "failed" | "timed_out";
  reasonCodes: string[];
  artifactContentHash: string;
};

export type EvaluationAdmissionDisposition = "admitted" | "rejected" | "safety_blocked";
export type EvaluationAdmissionStageState = "passed" | "failed" | "not_observed" | "not_applicable";
export type EvaluationArtifactV2ResultReasonCode =
  | "canonical_admission_admitted"
  | "canonical_admission_rejected"
  | "canonical_admission_safety_blocked";
export type EvaluationArtifactV2AdmissionReasonCode = EvaluationArtifactV2ResultReasonCode;
export type EvaluationArtifactV2ValidationErrorCode =
  | "whole_statement_output_invalid"
  | "whole_statement_schema_invalid"
  | "whole_statement_evidence_invalid"
  | "whole_statement_linkage_invalid"
  | "whole_statement_privacy_safety_blocked"
  | "whole_statement_provider_unavailable"
  | "whole_statement_research_incomplete";
export type EvaluationArtifactV2ProjectionReasonCode =
  | "artifact_v2_source_quality_failed"
  | "artifact_v2_fingerprint_mismatch"
  | "artifact_v2_locator_mismatch"
  | "artifact_v2_applicability_failed"
  | "artifact_v2_research_parentage_invalid"
  | "artifact_v2_deterministic_contradiction";

export type EvaluationCanonicalAdmissionRecord = {
  type: typeof EVALUATION_CANONICAL_ADMISSION_VERSION;
  capabilityId: "whole_statement_fee_intelligence_review";
  executionRef: string;
  executionStatus: "completed" | "failed" | "timed_out";
  validationStatus: "passed" | "failed";
  groundingStatus: "grounded" | "rejected";
  admissionDisposition: EvaluationAdmissionDisposition;
  acceptedClaimSupportRefs: string[];
  rejectedClaimSupportRefs: string[];
  researchAttemptRefs: string[];
  validationErrorCodes: EvaluationArtifactV2ValidationErrorCode[];
  reasonCodes: EvaluationArtifactV2AdmissionReasonCode[];
  safeCounts: {
    reviewedFeeRowCount: number;
    acceptedRecordCount: number;
    needsVerificationRecordCount: number;
    humanReviewRecordCount: number;
    rejectedRecordCount: number;
    researchAttemptCount: number;
    evidenceCandidateCount: number;
    claimSupportCount: number;
  };
  package5aDiagnosticRef: string;
  authoritative: false;
  financialMutationAllowed: false;
};

export type EvaluationPackageFWholeStatementRecord = {
  type: typeof EVALUATION_PACKAGE_F_RECORD_VERSION;
  capabilityId: "whole_statement_fee_intelligence_review";
  executionRef: string;
  output: CanonicalAiWholeStatementFeeIntelligenceOutput;
  sourceReferencesValidatedAgainstProof: true;
  authoritative: false;
  financialMutationAllowed: false;
};

export type EvaluationPackage5BWorkPlanProjection = {
  type: "evaluation_package_5b_work_plan_projection_v1";
  policyVersion: "whole_statement_fee_intelligence_work_plan_v1";
  mode: "production_selective" | "comprehensive";
  statementPacketContentHash: string;
  expectedFeeRowCount: number;
  plannedFeeRowCount: number;
  selectedFeeRowCount: number;
  reviewedFeeRowCount: number;
  missingFeeRowCount: number;
  plannedWorkUnitCount: number;
  selectedWorkUnitCount: number;
  completedWorkUnitCount: number;
  unavailableWorkUnitCount: number;
  notSelectedWorkUnitCount: number;
  units: Array<{
    workUnitRef: string;
    ordinal: number;
    status: string;
    outcomeClass: string;
    expectedFeeRowRefs: string[];
    expectedRowCount: number;
    reviewedRowCount: number;
    missingRowCount: number;
    duplicatedRowCount: number;
    unknownRowCount: number;
    estimatedInputBytes: number;
    estimatedOutputTokens: number;
    outputTokenCeiling: number | null;
    requestId: string | null;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    durationMs: number | null;
    billingDisposition: "observed" | "provider_confirmed_zero" | "unknown" | "pending";
    reasonCodes: string[];
  }>;
  rawPromptPersisted: false;
  rawResponsePersisted: false;
  providerDetailsPersisted: false;
  reasonCodes: string[];
};

export type EvaluationPackage5AAdmissionProjection = {
  type: typeof EVALUATION_PACKAGE_5A_PROJECTION_VERSION;
  diagnosticRef: string;
  capabilityId: "whole_statement_fee_intelligence_review";
  executionRef: string;
  executionState: "completed" | "failed" | "timed_out";
  admissionState: "admitted" | "rejected";
  finalCanonicalStatus: "completed" | "failed" | "timed_out" | "rejected" | "safety_blocked";
  stageStates: {
    responseParse: EvaluationAdmissionStageState;
    schemaValidation: EvaluationAdmissionStageState;
    evidenceCitation: EvaluationAdmissionStageState;
    sourceQuality: EvaluationAdmissionStageState;
    linkage: EvaluationAdmissionStageState;
    deterministicReconciliation: EvaluationAdmissionStageState;
    privacySafety: EvaluationAdmissionStageState;
  };
  reasonCodes: string[];
  projectionReasonCodes: EvaluationArtifactV2ProjectionReasonCode[];
  diagnosticRefs: string[];
  rawPromptPersisted: false;
  rawResponsePersisted: false;
  rawStatementTextPersisted: false;
  providerDetailsPersisted: false;
};

export type EvaluationResearchAttemptProof = {
  researchAttemptRef: string;
  questionRef: string;
  feeRowRef: string;
  questionOrdinal: number;
  sanitizedQuestionCategory: FeeKnowledgeResearchAttemptRecord["sanitizedQuestionCategory"];
  triggerReason: FeeKnowledgeResearchAttemptRecord["triggerReason"];
  status: FeeKnowledgeResearchNonSuccessStatus;
  resultCount: number;
  candidateRefs: string[];
  reasonCodes: string[];
};

export type EvaluationResearchCandidateProof = {
  candidateRef: string;
  researchAttemptRef: string;
  questionRef: string;
  feeRowRef: string;
  verificationStatus: FeeKnowledgeCandidateVerificationStatus;
  retrievalStatus: FeeKnowledgeRetrievalStatus;
  semanticVerificationStatus: "not_started" | "completed" | "failed" | "timed_out" | "parse_failed" | "safety_blocked" | "unsupported";
  claimSupportRefs: string[];
  reasonCodes: string[];
  safeRetrievalDiagnostics?: FeeKnowledgeRetrievalSafeDiagnostics | null;
};

export type EvaluationResearchSafeStructuredClaim = Pick<
  FeeKnowledgeStructuredClaim,
  | "claimKind"
  | "proposedCategory"
  | "likelyEconomicOwner"
  | "likelyContractualController"
  | "maximumConfidence"
  | "actionabilityCeiling"
  | "applicationBasis"
> & {
  proposedCategory: CanonicalFeeCategory | null;
  likelyEconomicOwner: CanonicalFeeParty | null;
  likelyContractualController: CanonicalFeeParty | null;
  maximumConfidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
};

export type EvaluationResearchClaimSupportProof = {
  claimSupportRef: string;
  origin: "runtime_research" | "approved_registry";
  runtimeSourceRef: string | null;
  runtimeClaimRef: string | null;
  candidateRef: string | null;
  researchAttemptRef: string | null;
  questionRef: string | null;
  approvedSourceRef: string | null;
  approvedClaimRef: string | null;
  approvedRegistryVersionRef: string | null;
  approvedSourceLifecycle: "active" | "expired" | "superseded" | "revoked" | "contradicted" | null;
  approvedSourceApplicable: boolean | null;
  approvedRegistryVerificationRef: string | null;
  approvedContentFingerprint: string | null;
  approvedRegistryProofLevel: "verification_reference_only" | "content_fingerprint_verified" | null;
  approvedRegistryScopeBasis: "exact_processor_or_network" | "unrestricted_broader_official" | "processor_or_network_mismatch" | null;
  feeRowRef: string;
  runtimeDocumentFingerprint: string | null;
  locatorTextHash: string;
  structuredClaim: EvaluationResearchSafeStructuredClaim;
  semanticDecision: FeeKnowledgeSemanticSupportDecision["decision"];
  applicability: {
    processorOrNetwork: boolean;
    jurisdiction: boolean | null;
    transactionContext: boolean | null;
    statementPeriod: boolean;
  };
  rateOrAmountComparison: "not_calculable" | "matches_published_rule" | "does_not_match_published_rule" | "not_evaluated";
  hasDeterministicCalculationProof: boolean;
  hasConditions: boolean;
  hasStructuredClaimExclusions: boolean;
  hasSupportExclusions: boolean;
  finalConfidence: CanonicalFeeClassificationConfidence;
  finalActionabilityCeiling: CanonicalFeeActionability;
  evidenceDecision: FeeKnowledgeEvidenceDecision;
  contradictionCodes: string[];
  reasonCodes: string[];
  disposition: "accepted" | "rejected";
  claimSupportDecisionRef: string;
};

export type EvaluationResearchEvidenceProof = {
  type: typeof EVALUATION_RESEARCH_EVIDENCE_PROOF_VERSION;
  attempts: EvaluationResearchAttemptProof[];
  candidates: EvaluationResearchCandidateProof[];
  claimSupports: EvaluationResearchClaimSupportProof[];
};

export type EvaluationExpectedResearchQuestionProjection = {
  type: typeof EVALUATION_EXPECTED_RESEARCH_QUESTION_PROJECTION_VERSION;
  questions: Array<{
    questionRef: string;
    feeRowRef: string;
    questionOrdinal: number;
    sanitizedQuestionCategory: FeeKnowledgeResearchAttemptRecord["sanitizedQuestionCategory"];
    triggerReason: FeeKnowledgeResearchAttemptRecord["triggerReason"];
  }>;
  limits: {
    policyVersion: "fee_knowledge_research_policy_v1";
    maxSearchCalls: number;
    maxRetrievalCandidates: number;
    totalDeadlineMs: number;
    maxResultCandidatesPerSearch: number;
  };
};

export type EvaluationCanonicalReferenceProof = {
  type: typeof EVALUATION_CANONICAL_REFERENCE_PROOF_VERSION;
  canonicalFeeRowRefs: string[];
  canonicalEvidenceRefs: string[];
  canonicalFeeRowEvidencePopulation: Array<{
    feeRowRef: string;
    evidenceRefs: string[];
    contributesToUniqueTotal: boolean;
  }>;
  approvedFactRefs: string[];
  candidateRefs: string[];
  claimSupportRefs: string[];
  claimSupportDecisionRefs: string[];
  expectedResearchQuestions: EvaluationExpectedResearchQuestionProjection;
  canonicalReferenceProjectionHash: string;
  preparedSanitizedPacketContentHash: string;
  wholeStatementPacketContentHash: string;
};

export type EvaluationCanonicalAdmissionResult = {
  type: typeof EVALUATION_CANONICAL_ADMISSION_RESULT_VERSION;
  resultId: string;
  sourceDocumentId: string;
  capabilityId: "whole_statement_fee_intelligence_review";
  executionRef: string;
  admission: EvaluationCanonicalAdmissionRecord;
  packageF: EvaluationPackageFWholeStatementRecord | null;
  package5a: EvaluationPackage5AAdmissionProjection;
  package5bWorkPlan: EvaluationPackage5BWorkPlanProjection | null;
  researchEvidence: EvaluationResearchEvidenceProof;
  canonicalReferenceProof: EvaluationCanonicalReferenceProof;
  lifecycleAdmissionRef: string;
  admissionDisposition: EvaluationAdmissionDisposition;
  reasonCodes: EvaluationArtifactV2ResultReasonCode[];
  authoritative: false;
  financialMutationAllowed: false;
  customerPublished: false;
  resultContentHash: string;
};

export type EvaluationCanonicalAdmissionResultInput = Omit<EvaluationCanonicalAdmissionResult, "resultContentHash">;

export type EvaluationRunIntegrityArtifactV2 = Omit<EvaluationRunIntegrityArtifact, "type" | "artifactContentHash"> & {
  type: typeof EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION;
  canonicalAdmissionResults: EvaluationCanonicalAdmissionResult[];
  artifactContentHash: string;
};
