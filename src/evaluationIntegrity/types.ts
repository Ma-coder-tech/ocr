import type { ParserConfidence, ParserDecisionStatus } from "../parserFoundation.js";
import type { ReconciliationStatus } from "../reconciliation.js";

export const EVALUATION_SOURCE_MANIFEST_VERSION = "evaluation_source_manifest_v1" as const;
export const EVALUATION_PREFLIGHT_VERSION = "deterministic_evaluation_preflight_v1" as const;
export const EVALUATION_INTEGRITY_ARTIFACT_VERSION = "evaluation_run_integrity_artifact_v1" as const;
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

export type CostToolEvent = {
  type: string;
  count: number;
};

export type CostLedgerEntry = {
  callId: string;
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
