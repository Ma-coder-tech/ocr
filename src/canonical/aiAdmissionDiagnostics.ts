import { randomUUID } from "node:crypto";
import { CANONICAL_AI_CAPABILITIES } from "./aiCapabilityTypes.js";
import type { CanonicalAiCapabilityId, CanonicalAiCapabilityRecord, CanonicalAiCapabilityStatus } from "./types.js";

export const CANONICAL_AI_ADMISSION_AUDIT_POLICY_VERSION = "canonical_ai_admission_audit_v1" as const;
export const CANONICAL_AI_DIAGNOSTIC_STAGE_STATES = ["passed", "failed", "not_observed", "not_applicable"] as const;

export type CanonicalAiDiagnosticStageState = (typeof CANONICAL_AI_DIAGNOSTIC_STAGE_STATES)[number];
export type CanonicalAiDiagnosticStage =
  | "response_parse"
  | "schema_validation"
  | "evidence_citation"
  | "source_quality"
  | "linkage"
  | "deterministic_reconciliation"
  | "privacy_safety";
const DIAGNOSTIC_STAGES: readonly CanonicalAiDiagnosticStage[] = [
  "response_parse",
  "schema_validation",
  "evidence_citation",
  "source_quality",
  "linkage",
  "deterministic_reconciliation",
  "privacy_safety",
];
export type CanonicalAiDiagnosticExecutionState = "completed" | "failed" | "timed_out" | "not_started" | "not_observed";
export type CanonicalAiDiagnosticAdmissionState = "admitted" | "diagnostic_only" | "rejected" | "not_started" | "not_applicable";
export type CanonicalAiDiagnosticNotStartedReason =
  | "capability_disabled"
  | "capability_not_required"
  | "execution_not_attempted"
  | "deterministic_substitution";

export type CanonicalAiAdmissionOpaqueReferences = {
  factRefs: string[];
  evidenceRefs: string[];
  feeRowRefs: string[];
  questionRefs: string[];
  candidateRefs: string[];
  packetRefs: string[];
};

export type CanonicalAiAdmissionTrustedReferenceSets = {
  references: Partial<CanonicalAiAdmissionOpaqueReferences>;
};

export type CanonicalAiAdmissionAttemptSource = {
  capability: CanonicalAiCapabilityId;
  attempted: boolean;
  normalizedStatus: CanonicalAiCapabilityStatus;
  safeCounts: Record<string, number>;
  executionRef: string | null;
  reasonCodes: readonly string[];
  diagnosticSignals?: readonly CanonicalAiAdmissionDiagnosticSignal[];
  diagnosticReferences?: Partial<CanonicalAiAdmissionOpaqueReferences>;
  trustedDiagnosticReferenceSets?: CanonicalAiAdmissionTrustedReferenceSets;
};

export const CANONICAL_AI_ADMISSION_REASON_CODES = [
  "runtime_anomaly_review_no_issues_found",
  "runtime_anomaly_review_failed",
  "runtime_anomaly_review_disabled",
  "runtime_anomaly_review_timed_out",
  "runtime_anomaly_review_safety_blocked",
  "runtime_anomaly_review_invalid_output",
  "runtime_narrative_completed",
  "runtime_narrative_failed",
  "runtime_narrative_disabled",
  "runtime_narrative_timed_out",
  "runtime_narrative_safety_blocked",
  "runtime_narrative_invalid_output",
  "runtime_narrative_output_unavailable",
  "runtime_fee_classification_review_not_needed",
  "runtime_fee_classification_review_diagnostic_only",
  "runtime_fee_classification_review_disabled",
  "runtime_fee_classification_review_failed",
  "runtime_fee_classification_review_timed_out",
  "runtime_fee_classification_review_safety_blocked",
  "runtime_fee_classification_review_rejected",
  "whole_statement_fee_intelligence_completed",
  "whole_statement_fee_intelligence_disabled",
  "whole_statement_fee_intelligence_failed",
  "whole_statement_fee_intelligence_timed_out",
  "whole_statement_fee_intelligence_safety_blocked",
  "whole_statement_fee_intelligence_rejected",
  "canonical_admission_admitted",
  "canonical_admission_diagnostic_only",
  "canonical_admission_rejected",
  "canonical_admission_not_applicable",
  "canonical_admission_not_started",
  "deterministic_anomaly_substitution_applied",
  "duplicate_capability_input",
  "runtime_metadata_unavailable",
  "execution_not_attempted",
  "capability_disabled",
  "capability_not_required",
  "unsafe_execution_reference_replaced",
  "unverified_diagnostic_reference_dropped",
  "runtime_status_count_consistency_validated",
  "runtime_status_count_consistency_invalid",
  "response_shape_validated",
  "schema_validated",
  "evidence_references_validated",
  "linkage_validated",
  "deterministic_reconciliation_validated",
  "source_quality_validated",
  "privacy_safety_validated",
  "invalid_response_shape",
  "unknown_field",
  "invalid_type",
  "invalid_policy_version",
  "invalid_status",
  "invalid_authority_flag",
  "invalid_financial_mutation_flag",
  "invalid_provider_details_flag",
  "invalid_absence_proof",
  "invalid_limitation_code",
  "invalid_reason_code",
  "invalid_suggestion",
  "incomplete_review_population",
  "broken_fee_row_reference",
  "broken_evidence_reference",
  "broken_classification_candidate_reference",
  "duplicate_or_conflicting_result",
  "forbidden_content",
  "unclassified_internal_failure",
] as const;

export type CanonicalAiAdmissionReasonCode = (typeof CANONICAL_AI_ADMISSION_REASON_CODES)[number];

export const CANONICAL_AI_ADMISSION_SAFE_COUNT_KEYS = [
  "anomalyCount",
  "overrideCount",
  "appliedOverrideCount",
  "factCount",
  "factsUsedCount",
  "materialFeeRowCount",
  "reviewedFeeRowCount",
  "suggestionCount",
  "expectedFeeRowCount",
  "acceptedRecordCount",
  "needsVerificationCount",
  "humanReviewCount",
  "rejectedRecordCount",
  "rowInterpretationCount",
  "acceptanceRecordCount",
] as const;

export type CanonicalAiAdmissionSafeCountKey = (typeof CANONICAL_AI_ADMISSION_SAFE_COUNT_KEYS)[number];

export const CANONICAL_AI_ADMISSION_SAFE_FIELD_PATHS = [
  "review",
  "review.type",
  "review.policyVersion",
  "review.status",
  "review.reviewedFeeRowRefs",
  "review.suggestions",
  "review.suggestions[].feeRowRef",
  "review.suggestions[].evidenceRefs",
  "review.suggestions[].currentClassificationCandidateRef",
  "review.suggestions[].reasonCodes",
  "review.suggestions[].authoritative",
  "review.absenceProof",
  "review.limitationCodes",
  "review.reasonCodes",
  "review.authoritative",
  "review.financialMutationAllowed",
  "review.providerDetailsStripped",
  "runtime.aiAnomalyReview",
  "runtime.aiAnomalyReview.status",
  "runtime.aiAnomalyReview.attempted",
  "runtime.aiAnomalyReview.anomalyCount",
  "runtime.aiAnomalyReview.overrideCount",
  "runtime.aiAnomalyReview.appliedOverrideCount",
  "runtime.aiMerchantNarrative",
] as const;

export type CanonicalAiAdmissionSafeFieldPath = (typeof CANONICAL_AI_ADMISSION_SAFE_FIELD_PATHS)[number];

export type CanonicalAiAdmissionDiagnosticSignal = {
  stage: CanonicalAiDiagnosticStage | null;
  state: CanonicalAiDiagnosticStageState | null;
  reasonCode: CanonicalAiAdmissionReasonCode;
  fieldPath: CanonicalAiAdmissionSafeFieldPath | null;
};

export type CanonicalAiAdmissionAttemptRecord = {
  id: string;
  capability: CanonicalAiCapabilityId;
  attemptOrdinal: number;
  executionRef: string | null;
  notStartedReason: CanonicalAiDiagnosticNotStartedReason | null;
  executionState: CanonicalAiDiagnosticExecutionState;
  responseParseState: CanonicalAiDiagnosticStageState;
  schemaValidationState: CanonicalAiDiagnosticStageState;
  evidenceCitationState: CanonicalAiDiagnosticStageState;
  sourceQualityState: CanonicalAiDiagnosticStageState;
  linkageState: CanonicalAiDiagnosticStageState;
  deterministicReconciliationState: CanonicalAiDiagnosticStageState;
  privacySafetyState: CanonicalAiDiagnosticStageState;
  admissionState: CanonicalAiDiagnosticAdmissionState;
  finalCanonicalStatus: CanonicalAiCapabilityStatus;
  reasonCodes: CanonicalAiAdmissionReasonCode[];
  safeFieldPaths: CanonicalAiAdmissionSafeFieldPath[];
  safeCounts: Partial<Record<CanonicalAiAdmissionSafeCountKey, number>>;
  references: CanonicalAiAdmissionOpaqueReferences;
  rawPromptPersisted: false;
  rawResponsePersisted: false;
  rawStatementTextPersisted: false;
  providerDetailsPersisted: false;
};

export type CanonicalAiAdmissionAudit = {
  type: "canonical_ai_admission_audit";
  policyVersion: typeof CANONICAL_AI_ADMISSION_AUDIT_POLICY_VERSION;
  attempts: CanonicalAiAdmissionAttemptRecord[];
  rawPromptPersisted: false;
  rawResponsePersisted: false;
  rawStatementTextPersisted: false;
  providerDetailsPersisted: false;
};

const REASON_CODE_SET = new Set<string>(CANONICAL_AI_ADMISSION_REASON_CODES);
const SAFE_FIELD_PATH_SET = new Set<string>(CANONICAL_AI_ADMISSION_SAFE_FIELD_PATHS);
const SAFE_COUNT_KEY_SET = new Set<string>(CANONICAL_AI_ADMISSION_SAFE_COUNT_KEYS);
const STAGE_STATE_SET = new Set<string>(CANONICAL_AI_DIAGNOSTIC_STAGE_STATES);
const DIAGNOSTIC_STAGE_SET = new Set<string>(DIAGNOSTIC_STAGES);
const EXECUTION_STATES: readonly CanonicalAiDiagnosticExecutionState[] = ["completed", "failed", "timed_out", "not_started", "not_observed"];
const ADMISSION_STATES: readonly CanonicalAiDiagnosticAdmissionState[] = ["admitted", "diagnostic_only", "rejected", "not_started", "not_applicable"];
const NOT_STARTED_REASONS: readonly CanonicalAiDiagnosticNotStartedReason[] = [
  "capability_disabled",
  "capability_not_required",
  "execution_not_attempted",
  "deterministic_substitution",
];
const FINAL_CANONICAL_STATUSES: readonly CanonicalAiCapabilityStatus[] = [
  "completed",
  "completed_diagnostic",
  "not_needed",
  "disabled",
  "failed",
  "timed_out",
  "safety_blocked",
  "rejected",
];
const AUDIT_KEYS = [
  "type",
  "policyVersion",
  "attempts",
  "rawPromptPersisted",
  "rawResponsePersisted",
  "rawStatementTextPersisted",
  "providerDetailsPersisted",
] as const;
const ATTEMPT_KEYS = [
  "id",
  "capability",
  "attemptOrdinal",
  "executionRef",
  "notStartedReason",
  "executionState",
  "responseParseState",
  "schemaValidationState",
  "evidenceCitationState",
  "sourceQualityState",
  "linkageState",
  "deterministicReconciliationState",
  "privacySafetyState",
  "admissionState",
  "finalCanonicalStatus",
  "reasonCodes",
  "safeFieldPaths",
  "safeCounts",
  "references",
  "rawPromptPersisted",
  "rawResponsePersisted",
  "rawStatementTextPersisted",
  "providerDetailsPersisted",
] as const;
const REFERENCE_KEYS = ["factRefs", "evidenceRefs", "feeRowRefs", "questionRefs", "candidateRefs", "packetRefs"] as const;
const STAGE_STATE_KEYS = [
  "responseParseState",
  "schemaValidationState",
  "evidenceCitationState",
  "sourceQualityState",
  "linkageState",
  "deterministicReconciliationState",
  "privacySafetyState",
] as const;
const STAGE_BY_STATE_KEY: Record<(typeof STAGE_STATE_KEYS)[number], CanonicalAiDiagnosticStage> = {
  responseParseState: "response_parse",
  schemaValidationState: "schema_validation",
  evidenceCitationState: "evidence_citation",
  sourceQualityState: "source_quality",
  linkageState: "linkage",
  deterministicReconciliationState: "deterministic_reconciliation",
  privacySafetyState: "privacy_safety",
};
const STAGE_REASON_CODES: Record<
  CanonicalAiDiagnosticStage,
  { passed: readonly CanonicalAiAdmissionReasonCode[]; failed: readonly CanonicalAiAdmissionReasonCode[] }
> = {
  response_parse: { passed: ["response_shape_validated"], failed: ["invalid_response_shape"] },
  schema_validation: {
    passed: ["schema_validated", "runtime_status_count_consistency_validated"],
    failed: [
      "runtime_status_count_consistency_invalid",
      "unknown_field",
      "invalid_type",
      "invalid_policy_version",
      "invalid_status",
      "invalid_authority_flag",
      "invalid_financial_mutation_flag",
      "invalid_absence_proof",
      "invalid_limitation_code",
      "invalid_reason_code",
      "invalid_suggestion",
      "incomplete_review_population",
      "duplicate_or_conflicting_result",
    ],
  },
  evidence_citation: { passed: ["evidence_references_validated"], failed: ["broken_evidence_reference"] },
  source_quality: { passed: ["source_quality_validated"], failed: [] },
  linkage: { passed: ["linkage_validated"], failed: ["broken_fee_row_reference"] },
  deterministic_reconciliation: {
    passed: ["deterministic_reconciliation_validated"],
    failed: ["broken_classification_candidate_reference"],
  },
  privacy_safety: {
    passed: ["privacy_safety_validated"],
    failed: [
      "forbidden_content",
      "invalid_provider_details_flag",
      "runtime_anomaly_review_safety_blocked",
      "runtime_narrative_safety_blocked",
      "runtime_fee_classification_review_safety_blocked",
      "whole_statement_fee_intelligence_safety_blocked",
    ],
  },
};
const SAFE_COUNT_KEYS_BY_CAPABILITY: Record<CanonicalAiCapabilityId, ReadonlySet<CanonicalAiAdmissionSafeCountKey>> = {
  full_statement_anomaly_review: new Set(["anomalyCount", "overrideCount", "appliedOverrideCount"]),
  whole_statement_fee_intelligence_review: new Set([
    "expectedFeeRowCount",
    "reviewedFeeRowCount",
    "acceptedRecordCount",
    "needsVerificationCount",
    "humanReviewCount",
    "rejectedRecordCount",
    "rowInterpretationCount",
    "acceptanceRecordCount",
  ]),
  fee_classification_review: new Set(["materialFeeRowCount", "reviewedFeeRowCount", "suggestionCount"]),
  notice_change_review: new Set(),
  benchmark_category_review: new Set(),
  merchant_narrative: new Set(["factCount", "factsUsedCount"]),
  document_quality_review: new Set(),
};
const SAFE_FIELD_PATHS_BY_CAPABILITY: Record<CanonicalAiCapabilityId, ReadonlySet<CanonicalAiAdmissionSafeFieldPath>> = {
  full_statement_anomaly_review: new Set([
    "runtime.aiAnomalyReview",
    "runtime.aiAnomalyReview.status",
    "runtime.aiAnomalyReview.attempted",
    "runtime.aiAnomalyReview.anomalyCount",
    "runtime.aiAnomalyReview.overrideCount",
    "runtime.aiAnomalyReview.appliedOverrideCount",
  ]),
  whole_statement_fee_intelligence_review: new Set(),
  fee_classification_review: new Set(
    CANONICAL_AI_ADMISSION_SAFE_FIELD_PATHS.filter((path) => path === "review" || path.startsWith("review.")),
  ),
  notice_change_review: new Set(),
  benchmark_category_review: new Set(),
  merchant_narrative: new Set(["runtime.aiMerchantNarrative"]),
  document_quality_review: new Set(),
};
const TRUSTED_FACT_REFS = new Set([
  "identity.merchantName",
  "financialFacts.processedSales",
  "financialFacts.totalFees",
  "financialFacts.rateRevealCalculatedAllInRate",
  "financialFacts.effectiveRateBasis",
  "opportunityEngine.summary",
  "opportunityEngine.components",
  "aiCapabilities.summary",
  "customerState.primaryState",
  "customerState.axes",
  "customerState.rateComparison",
  "customerState.visibility",
  "customerState.actionGuidance",
]);
const TRUSTED_AUDIT_REFERENCE_PROVENANCE = new WeakMap<object, Map<string, CanonicalAiAdmissionOpaqueReferences>>();
const TRUSTED_DIAGNOSTIC_REFERENCE_SET_PROVENANCE = new WeakSet<object>();

export function createValidatedDiagnosticReferenceSets(
  references: Partial<CanonicalAiAdmissionOpaqueReferences>,
): CanonicalAiAdmissionTrustedReferenceSets {
  const token: CanonicalAiAdmissionTrustedReferenceSets = { references: structuredClone(references) };
  TRUSTED_DIAGNOSTIC_REFERENCE_SET_PROVENANCE.add(token);
  return token;
}
export function buildCanonicalAiAdmissionAudit(input: {
  capabilities: readonly CanonicalAiCapabilityRecord[];
  attempts?: readonly CanonicalAiAdmissionAttemptSource[];
}): CanonicalAiAdmissionAudit {
  const capabilityById = new Map(input.capabilities.map((capability) => [capability.capability, capability]));
  const sourcesByCapability = new Map<CanonicalAiCapabilityId, CanonicalAiAdmissionAttemptSource[]>();
  for (const source of input.attempts ?? []) {
    sourcesByCapability.set(source.capability, [...(sourcesByCapability.get(source.capability) ?? []), source]);
  }

  const attempts: CanonicalAiAdmissionAttemptRecord[] = [];
  for (const capabilityId of CANONICAL_AI_CAPABILITIES) {
    const capability = capabilityById.get(capabilityId);
    const sources = sourcesByCapability.get(capabilityId) ?? [];
    if (sources.length === 0) {
      attempts.push(unstartedRecord(capabilityId, capability));
      continue;
    }
    const duplicate = sources.length > 1;
    sources.forEach((source, index) => attempts.push(attemptRecord(source, capability, index + 1, duplicate)));
  }

  const audit: CanonicalAiAdmissionAudit = {
    type: "canonical_ai_admission_audit",
    policyVersion: CANONICAL_AI_ADMISSION_AUDIT_POLICY_VERSION,
    attempts,
    rawPromptPersisted: false,
    rawResponsePersisted: false,
    rawStatementTextPersisted: false,
    providerDetailsPersisted: false,
  };
  TRUSTED_AUDIT_REFERENCE_PROVENANCE.set(
    audit,
    new Map(attempts.map((attempt) => [attempt.id, structuredClone(attempt.references)])),
  );
  return audit;
}

export function diagnosticSignalsFromValidationErrors(errors: readonly string[]): CanonicalAiAdmissionDiagnosticSignal[] {
  return dedupeSignals(errors.map(signalFromValidationError));
}

export function passedDiagnosticSignals(stages: readonly CanonicalAiDiagnosticStage[]): CanonicalAiAdmissionDiagnosticSignal[] {
  const reasonByStage: Record<CanonicalAiDiagnosticStage, CanonicalAiAdmissionReasonCode> = {
    response_parse: "response_shape_validated",
    schema_validation: "schema_validated",
    evidence_citation: "evidence_references_validated",
    source_quality: "source_quality_validated",
    linkage: "linkage_validated",
    deterministic_reconciliation: "deterministic_reconciliation_validated",
    privacy_safety: "privacy_safety_validated",
  };
  return stages.map((stage) => ({ stage, state: "passed", reasonCode: reasonByStage[stage], fieldPath: null }));
}

export function validateCanonicalAiAdmissionAudit(audit: unknown): string[] {
  const errors: string[] = [];
  if (!isPlainRecord(audit)) return ["audit_not_plain_object"];
  const trustedReferenceProvenance = TRUSTED_AUDIT_REFERENCE_PROVENANCE.get(audit);
  errors.push(...exactKeyErrors(audit, AUDIT_KEYS, "audit"));
  if (audit.type !== "canonical_ai_admission_audit") errors.push("audit_type_invalid");
  if (audit.policyVersion !== CANONICAL_AI_ADMISSION_AUDIT_POLICY_VERSION) errors.push("audit_policy_version_invalid");
  if (
    audit.rawPromptPersisted !== false ||
    audit.rawResponsePersisted !== false ||
    audit.rawStatementTextPersisted !== false ||
    audit.providerDetailsPersisted !== false
  ) {
    errors.push("audit_persistence_declaration_invalid");
  }
  if (!Array.isArray(audit.attempts)) return [...new Set([...errors, "audit_attempts_invalid"])].sort();

  const ids = new Set<string>();
  const capabilityOrdinals = new Map<CanonicalAiCapabilityId, number[]>();
  const validatedRecords: Array<{
    capability: CanonicalAiCapabilityId;
    ordinal: number;
    executionState: CanonicalAiDiagnosticExecutionState | null;
    admissionState: CanonicalAiDiagnosticAdmissionState | null;
    finalStatus: CanonicalAiCapabilityStatus | null;
    reasonCodes: string[];
  }> = [];

  for (const rawRecord of audit.attempts) {
    if (!isPlainRecord(rawRecord)) {
      errors.push("attempt_not_plain_object");
      continue;
    }
    errors.push(...exactKeyErrors(rawRecord, ATTEMPT_KEYS, "attempt"));
    const capability = enumValue(rawRecord.capability, CANONICAL_AI_CAPABILITIES);
    const ordinal = Number.isInteger(rawRecord.attemptOrdinal) && Number(rawRecord.attemptOrdinal) >= 1 ? Number(rawRecord.attemptOrdinal) : null;
    const executionState = enumValue(rawRecord.executionState, EXECUTION_STATES);
    const admissionStateValue = enumValue(rawRecord.admissionState, ADMISSION_STATES);
    const finalStatus = enumValue(rawRecord.finalCanonicalStatus, FINAL_CANONICAL_STATUSES);
    const notStartedReason = rawRecord.notStartedReason === null ? null : enumValue(rawRecord.notStartedReason, NOT_STARTED_REASONS);
    const reasonCodes = stringArrayValue(rawRecord.reasonCodes);
    const safeFieldPaths = stringArrayValue(rawRecord.safeFieldPaths);

    if (!capability) errors.push("attempt_capability_invalid");
    if (ordinal === null) errors.push("attempt_ordinal_invalid");
    if (!executionState) errors.push("attempt_execution_state_invalid");
    if (!admissionStateValue) errors.push("attempt_admission_state_invalid");
    if (!finalStatus) errors.push("attempt_final_canonical_status_invalid");
    if (rawRecord.notStartedReason !== null && !notStartedReason) errors.push("attempt_not_started_reason_invalid");

    if (typeof rawRecord.id !== "string" || !/^ai_admission_attempt_[a-z_]+_[1-9][0-9]*$/.test(rawRecord.id)) {
      errors.push("attempt_id_invalid");
    } else {
      if (ids.has(rawRecord.id)) errors.push("attempt_id_duplicate");
      ids.add(rawRecord.id);
    }
    if (capability && ordinal !== null && rawRecord.id !== `ai_admission_attempt_${capability}_${ordinal}`) errors.push("attempt_id_mismatch");

    if (executionState === "not_started") {
      if (rawRecord.executionRef !== null) errors.push("attempt_execution_ref_unexpected");
      if (!notStartedReason) errors.push("attempt_not_started_reason_missing");
    } else if (executionState === "not_observed") {
      if (rawRecord.executionRef !== null) errors.push("attempt_execution_ref_unexpected");
      if (rawRecord.notStartedReason !== null) errors.push("attempt_not_started_reason_unexpected");
      if (!reasonCodes?.includes("runtime_metadata_unavailable")) errors.push("attempt_runtime_metadata_reason_missing");
    } else if (executionState) {
      if (typeof rawRecord.executionRef !== "string" || !safeExecutionRef(rawRecord.executionRef)) errors.push("attempt_execution_ref_invalid");
      if (rawRecord.notStartedReason !== null) errors.push("attempt_not_started_reason_unexpected");
    }
    if (rawRecord.executionRef !== null && (typeof rawRecord.executionRef !== "string" || !safeExecutionRef(rawRecord.executionRef))) {
      errors.push("attempt_execution_ref_invalid");
    }

    for (const key of STAGE_STATE_KEYS) {
      const state = enumValue(rawRecord[key], CANONICAL_AI_DIAGNOSTIC_STAGE_STATES);
      if (!state) {
        errors.push("attempt_stage_state_invalid");
        continue;
      }
      if (reasonCodes) {
        const stageReasons = STAGE_REASON_CODES[STAGE_BY_STATE_KEY[key]];
        const hasPassedReason = reasonCodes.some((reasonCode) =>
          stageReasons.passed.includes(reasonCode as CanonicalAiAdmissionReasonCode),
        );
        const hasFailedReason = reasonCodes.some((reasonCode) =>
          stageReasons.failed.includes(reasonCode as CanonicalAiAdmissionReasonCode),
        );
        const consistent =
          state === "passed"
            ? hasPassedReason && !hasFailedReason
            : state === "failed"
              ? hasFailedReason && !hasPassedReason
              : !hasPassedReason && !hasFailedReason;
        if (!consistent) errors.push("attempt_stage_reason_inconsistent");
      }
    }
    if (!reasonCodes || reasonCodes.some((code) => !REASON_CODE_SET.has(code))) errors.push("attempt_reason_code_invalid");
    if (capability && reasonCodes?.some((code) => REASON_CODE_SET.has(code) && !reasonCodeAllowedForCapability(capability, code))) {
      errors.push("attempt_capability_reason_code_mismatch");
    }
    if (!safeFieldPaths || safeFieldPaths.some((path) => !SAFE_FIELD_PATH_SET.has(path))) errors.push("attempt_field_path_invalid");
    if (capability && safeFieldPaths?.some((path) => !SAFE_FIELD_PATHS_BY_CAPABILITY[capability].has(path as CanonicalAiAdmissionSafeFieldPath))) {
      errors.push("attempt_capability_field_path_mismatch");
    }
    if (reasonCodes && !isSortedUnique(reasonCodes)) errors.push("attempt_reason_code_order_invalid");
    if (safeFieldPaths && !isSortedUnique(safeFieldPaths)) errors.push("attempt_field_path_order_invalid");

    if (!isPlainRecord(rawRecord.safeCounts)) {
      errors.push("attempt_safe_counts_invalid");
    } else {
      for (const [key, value] of Object.entries(rawRecord.safeCounts)) {
        if (!SAFE_COUNT_KEY_SET.has(key) || !Number.isInteger(value) || Number(value) < 0) errors.push("attempt_safe_count_invalid");
        if (capability && SAFE_COUNT_KEY_SET.has(key) && !SAFE_COUNT_KEYS_BY_CAPABILITY[capability].has(key as CanonicalAiAdmissionSafeCountKey)) {
          errors.push("attempt_capability_safe_count_mismatch");
        }
      }
    }

    if (!isPlainRecord(rawRecord.references)) {
      errors.push("attempt_references_invalid");
    } else {
      errors.push(...exactKeyErrors(rawRecord.references, REFERENCE_KEYS, "attempt_references"));
      for (const key of REFERENCE_KEYS) {
        const values = stringArrayValue(rawRecord.references[key]);
        if (!values) {
          errors.push("attempt_reference_category_invalid");
          continue;
        }
        if (values.some((value) => !safeReferenceForCategory(key, value))) errors.push("attempt_reference_invalid");
        const trustedValues = typeof rawRecord.id === "string" ? trustedReferenceProvenance?.get(rawRecord.id)?.[key] ?? [] : [];
        if (values.some((value) => !trustedValues.includes(value))) errors.push("attempt_reference_unverified");
        if (new Set(values).size !== values.length || values.some((value, index) => index > 0 && values[index - 1]!.localeCompare(value) > 0)) {
          errors.push("attempt_reference_order_invalid");
        }
      }
    }

    if (
      rawRecord.rawPromptPersisted !== false ||
      rawRecord.rawResponsePersisted !== false ||
      rawRecord.rawStatementTextPersisted !== false ||
      rawRecord.providerDetailsPersisted !== false
    ) {
      errors.push("attempt_persistence_declaration_invalid");
    }

    if (notStartedReason === "capability_disabled" && finalStatus !== "disabled") errors.push("attempt_not_started_reason_inconsistent");
    if (notStartedReason === "capability_not_required" && finalStatus !== "not_needed") errors.push("attempt_not_started_reason_inconsistent");
    const requiredNotStartedCode = notStartedReason ? reasonCodeForNotStartedReason(notStartedReason) : null;
    if (requiredNotStartedCode && !reasonCodes?.includes(requiredNotStartedCode)) errors.push("attempt_not_started_reason_code_missing");
    if (executionState !== "not_observed" && reasonCodes?.includes("runtime_metadata_unavailable")) {
      errors.push("attempt_runtime_metadata_reason_unexpected");
    }
    if (executionState === "failed" && finalStatus !== "failed") errors.push("attempt_execution_final_status_inconsistent");
    if (executionState === "timed_out" && finalStatus !== "timed_out") errors.push("attempt_execution_final_status_inconsistent");
    if (executionState === "completed" && (finalStatus === "failed" || finalStatus === "timed_out")) {
      errors.push("attempt_execution_final_status_inconsistent");
    }

    if (capability && ordinal !== null) {
      capabilityOrdinals.set(capability, [...(capabilityOrdinals.get(capability) ?? []), ordinal]);
      validatedRecords.push({
        capability,
        ordinal,
        executionState,
        admissionState: admissionStateValue,
        finalStatus,
        reasonCodes: reasonCodes ?? [],
      });
    }
  }

  const deterministicallyOrdered = [...validatedRecords].sort(
    (left, right) =>
      CANONICAL_AI_CAPABILITIES.indexOf(left.capability) - CANONICAL_AI_CAPABILITIES.indexOf(right.capability) ||
      left.ordinal - right.ordinal,
  );
  if (validatedRecords.some((record, index) => record !== deterministicallyOrdered[index])) errors.push("attempt_order_invalid");

  for (const capability of CANONICAL_AI_CAPABILITIES) {
    const ordinals = [...(capabilityOrdinals.get(capability) ?? [])].sort((left, right) => left - right);
    if (ordinals.length === 0) {
      errors.push("attempt_capability_missing");
      continue;
    }
    if (new Set(ordinals).size !== ordinals.length) errors.push("attempt_capability_ordinal_duplicate");
    if (ordinals.some((ordinal, index) => ordinal !== index + 1)) errors.push("attempt_capability_ordinals_noncontiguous");
    const duplicate = ordinals.length > 1;
    for (const record of validatedRecords.filter((item) => item.capability === capability)) {
      const hasDuplicateCode = record.reasonCodes.includes("duplicate_capability_input");
      if (duplicate && (record.admissionState !== "rejected" || !hasDuplicateCode)) errors.push("attempt_duplicate_rejection_inconsistent");
      if (!duplicate && hasDuplicateCode) errors.push("attempt_duplicate_rejection_unexpected");
      if (record.executionState && record.finalStatus && record.admissionState) {
        const expectedAdmission = duplicate ? "rejected" : admissionState(record.finalStatus, record.executionState !== "not_started" && record.executionState !== "not_observed");
        if (record.admissionState !== expectedAdmission) errors.push("attempt_admission_status_inconsistent");
        if (!record.reasonCodes.includes(admissionReasonCode(expectedAdmission))) errors.push("attempt_admission_reason_code_missing");
      }
    }
  }

  return [...new Set(errors)].sort();
}

function attemptRecord(
  source: CanonicalAiAdmissionAttemptSource,
  capability: CanonicalAiCapabilityRecord | undefined,
  attemptOrdinal: number,
  duplicate: boolean,
): CanonicalAiAdmissionAttemptRecord {
  const finalCanonicalStatus = capability?.status ?? "rejected";
  const signals = dedupeSignals(source.diagnosticSignals ?? []);
  const stageState = (stage: CanonicalAiDiagnosticStage): CanonicalAiDiagnosticStageState => {
    const states = signals.filter((signal) => signal.stage === stage).map((signal) => signal.state);
    if (states.includes("failed")) return "failed";
    if (states.includes("passed")) return "passed";
    if (states.includes("not_observed")) return "not_observed";
    if (states.includes("not_applicable")) return "not_applicable";
    return source.attempted ? "not_observed" : "not_applicable";
  };
  const suppliedExecutionRefPresent = source.executionRef !== null;
  const executionRef = source.attempted ? newExecutionRef() : null;
  const deterministicSubstitution = Boolean(capability?.trigger.absenceProof?.startsWith("deterministic_runtime_safety_substitution:"));
  const finalAdmissionState = duplicate ? "rejected" : admissionState(finalCanonicalStatus, source.attempted);
  const notStartedReason: CanonicalAiDiagnosticNotStartedReason | null = source.attempted
    ? null
    : deterministicSubstitution
      ? "deterministic_substitution"
      : source.normalizedStatus === "not_needed"
        ? "capability_not_required"
        : source.normalizedStatus === "disabled"
          ? "capability_disabled"
          : "execution_not_attempted";
  const referenceProjection = trustedReferences(source.diagnosticReferences, source.trustedDiagnosticReferenceSets, capability);
  const reasonCodes = safeReasonCodesForCapability(source.capability, [
    ...source.reasonCodes,
    ...signals.map((signal) => signal.reasonCode),
    ...(duplicate ? ["duplicate_capability_input"] : []),
    ...(suppliedExecutionRefPresent ? ["unsafe_execution_reference_replaced"] : []),
    ...(referenceProjection.dropped ? ["unverified_diagnostic_reference_dropped"] : []),
    ...(deterministicSubstitution ? ["deterministic_anomaly_substitution_applied"] : []),
    ...(notStartedReason ? [reasonCodeForNotStartedReason(notStartedReason)] : []),
    admissionReasonCode(finalAdmissionState),
  ]);
  return {
    id: `ai_admission_attempt_${source.capability}_${attemptOrdinal}`,
    capability: source.capability,
    attemptOrdinal,
    executionRef,
    notStartedReason,
    executionState: executionState(source),
    responseParseState: stageState("response_parse"),
    schemaValidationState: stageState("schema_validation"),
    evidenceCitationState: stageState("evidence_citation"),
    sourceQualityState: stageState("source_quality"),
    linkageState: stageState("linkage"),
    deterministicReconciliationState: stageState("deterministic_reconciliation"),
    privacySafetyState: stageState("privacy_safety"),
    admissionState: finalAdmissionState,
    finalCanonicalStatus,
    reasonCodes,
    safeFieldPaths: [...new Set(signals.map((signal) => signal.fieldPath).filter((path) => isSafeFieldPathForCapability(source.capability, path)))].sort(),
    safeCounts: safeCounts(source.capability, source.safeCounts),
    references: referenceProjection.references,
    rawPromptPersisted: false,
    rawResponsePersisted: false,
    rawStatementTextPersisted: false,
    providerDetailsPersisted: false,
  };
}

function unstartedRecord(
  capabilityId: CanonicalAiCapabilityId,
  capability: CanonicalAiCapabilityRecord | undefined,
): CanonicalAiAdmissionAttemptRecord {
  const finalCanonicalStatus = capability?.status ?? "disabled";
  const deterministicSubstitution = Boolean(capability?.trigger.absenceProof?.startsWith("deterministic_runtime_safety_substitution:"));
  const executionState: CanonicalAiDiagnosticExecutionState =
    deterministicSubstitution || finalCanonicalStatus === "not_needed" ? "not_started" : "not_observed";
  const notStartedReason: CanonicalAiDiagnosticNotStartedReason | null = deterministicSubstitution
    ? "deterministic_substitution"
    : finalCanonicalStatus === "not_needed"
      ? "capability_not_required"
      : null;
  const stageState: CanonicalAiDiagnosticStageState = executionState === "not_started" ? "not_applicable" : "not_observed";
  const finalAdmissionState = admissionState(finalCanonicalStatus, false);
  return {
    id: `ai_admission_attempt_${capabilityId}_1`,
    capability: capabilityId,
    attemptOrdinal: 1,
    executionRef: null,
    notStartedReason,
    executionState,
    responseParseState: stageState,
    schemaValidationState: stageState,
    evidenceCitationState: stageState,
    sourceQualityState: stageState,
    linkageState: stageState,
    deterministicReconciliationState: stageState,
    privacySafetyState: stageState,
    admissionState: finalAdmissionState,
    finalCanonicalStatus,
    reasonCodes: safeReasonCodesForCapability(capabilityId, [
      deterministicSubstitution
        ? "deterministic_anomaly_substitution_applied"
        : finalCanonicalStatus === "not_needed"
          ? "capability_not_required"
          : "runtime_metadata_unavailable",
      admissionReasonCode(finalAdmissionState),
    ]),
    safeFieldPaths: [],
    safeCounts: {},
    references: trustedReferences(undefined, undefined, capability).references,
    rawPromptPersisted: false,
    rawResponsePersisted: false,
    rawStatementTextPersisted: false,
    providerDetailsPersisted: false,
  };
}

function signalFromValidationError(error: string): CanonicalAiAdmissionDiagnosticSignal {
  const value = error.toLowerCase();
  const validatorPrefix = "runtime_fee_classification_review_";
  if (!value.startsWith(validatorPrefix)) return { stage: null, state: null, reasonCode: "unclassified_internal_failure", fieldPath: null };
  const code = value.slice(validatorPrefix.length);
  if (code.startsWith("not_plain_object")) return signal("response_parse", "failed", "invalid_response_shape", "review");
  if (code.includes("forbidden")) return signal("privacy_safety", "failed", "forbidden_content", pathForError(code));
  if (code.includes("evidence_ref")) return signal("evidence_citation", "failed", "broken_evidence_reference", "review.suggestions[].evidenceRefs");
  if (code.includes("fee_row_ref") || code.includes("row_not_in_packet") || code.includes("outside_reviewed_population")) {
    return signal("linkage", "failed", "broken_fee_row_reference", "review.suggestions[].feeRowRef");
  }
  if (code.includes("candidate_ref")) {
    return signal("deterministic_reconciliation", "failed", "broken_classification_candidate_reference", "review.suggestions[].currentClassificationCandidateRef");
  }
  if (code.includes("duplicate") || code.includes("conflicting")) {
    return signal("schema_validation", "failed", "duplicate_or_conflicting_result", pathForError(code));
  }
  if (code.includes("completion_without_exact") || code.includes("status_without_suggestions") || code.includes("no_suggestions_has_payload")) {
    return signal("schema_validation", "failed", "incomplete_review_population", "review.reviewedFeeRowRefs");
  }
  if (code.includes("unknown_key")) return signal("schema_validation", "failed", "unknown_field", pathForError(code));
  if (code.includes("policy_version")) return signal("schema_validation", "failed", "invalid_policy_version", "review.policyVersion");
  if (code.includes("status_invalid")) return signal("schema_validation", "failed", "invalid_status", "review.status");
  if (code.includes("authoritative_invalid")) return signal("schema_validation", "failed", "invalid_authority_flag", pathForError(code));
  if (code.includes("financial_mutation")) return signal("schema_validation", "failed", "invalid_financial_mutation_flag", "review.financialMutationAllowed");
  if (code.includes("provider_details")) return signal("privacy_safety", "failed", "invalid_provider_details_flag", "review.providerDetailsStripped");
  if (code.includes("absence_proof")) return signal("schema_validation", "failed", "invalid_absence_proof", "review.absenceProof");
  if (code.includes("limitationcodes") || code.includes("limitation_codes")) return signal("schema_validation", "failed", "invalid_limitation_code", "review.limitationCodes");
  if (code.includes("reasoncodes") || code.includes("reason_codes")) return signal("schema_validation", "failed", "invalid_reason_code", pathForError(code));
  if (code.includes("suggestion")) return signal("schema_validation", "failed", "invalid_suggestion", "review.suggestions");
  if (code.includes("type_invalid")) return signal("schema_validation", "failed", "invalid_type", "review.type");
  return { stage: null, state: null, reasonCode: "unclassified_internal_failure", fieldPath: null };
}

function signal(
  stage: CanonicalAiDiagnosticStage,
  state: CanonicalAiDiagnosticStageState,
  reasonCode: CanonicalAiAdmissionReasonCode,
  fieldPath: CanonicalAiAdmissionSafeFieldPath | null,
): CanonicalAiAdmissionDiagnosticSignal {
  return { stage, state, reasonCode, fieldPath };
}

function pathForError(error: string): CanonicalAiAdmissionSafeFieldPath | null {
  if (error.includes("suggestions")) return "review.suggestions";
  if (error.includes("reviewedfeerowrefs") || error.includes("reviewed_fee_row")) return "review.reviewedFeeRowRefs";
  if (error.includes("reasoncodes") || error.includes("reason_codes")) return "review.reasonCodes";
  if (error.includes("limitationcodes") || error.includes("limitation_codes")) return "review.limitationCodes";
  return "review";
}

function executionState(source: CanonicalAiAdmissionAttemptSource): CanonicalAiDiagnosticExecutionState {
  if (!source.attempted) return "not_started";
  if (source.normalizedStatus === "timed_out") return "timed_out";
  if (source.normalizedStatus === "failed") return "failed";
  return "completed";
}

function admissionState(status: CanonicalAiCapabilityStatus, attempted: boolean): CanonicalAiDiagnosticAdmissionState {
  if (status === "completed") return "admitted";
  if (status === "completed_diagnostic") return "diagnostic_only";
  if (status === "not_needed") return "not_applicable";
  if (!attempted && status === "disabled") return "not_started";
  return "rejected";
}

function admissionReasonCode(state: CanonicalAiDiagnosticAdmissionState): CanonicalAiAdmissionReasonCode {
  if (state === "admitted") return "canonical_admission_admitted";
  if (state === "diagnostic_only") return "canonical_admission_diagnostic_only";
  if (state === "not_applicable") return "canonical_admission_not_applicable";
  if (state === "not_started") return "canonical_admission_not_started";
  return "canonical_admission_rejected";
}

function safeReasonCodesForCapability(
  capability: CanonicalAiCapabilityId,
  values: readonly string[],
): CanonicalAiAdmissionReasonCode[] {
  const safe = values.filter(
    (value): value is CanonicalAiAdmissionReasonCode => REASON_CODE_SET.has(value) && reasonCodeAllowedForCapability(capability, value),
  );
  if (values.some((value) => !REASON_CODE_SET.has(value) || !reasonCodeAllowedForCapability(capability, value))) {
    safe.push("unclassified_internal_failure");
  }
  return [...new Set(safe)].sort();
}

function reasonCodeAllowedForCapability(capability: CanonicalAiCapabilityId, reasonCode: string): boolean {
  if (reasonCode.startsWith("runtime_anomaly_review_")) return capability === "full_statement_anomaly_review";
  if (reasonCode.startsWith("runtime_status_count_consistency_")) return capability === "full_statement_anomaly_review";
  if (reasonCode === "deterministic_anomaly_substitution_applied") return capability === "full_statement_anomaly_review";
  if (reasonCode.startsWith("runtime_narrative_")) return capability === "merchant_narrative";
  if (reasonCode.startsWith("runtime_fee_classification_review_")) return capability === "fee_classification_review";
  if (reasonCode.startsWith("whole_statement_fee_intelligence_")) return capability === "whole_statement_fee_intelligence_review";
  return true;
}

function safeCounts(
  capability: CanonicalAiCapabilityId,
  values: Readonly<Record<string, number>>,
): Partial<Record<CanonicalAiAdmissionSafeCountKey, number>> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key, value]) =>
        SAFE_COUNT_KEY_SET.has(key) &&
        SAFE_COUNT_KEYS_BY_CAPABILITY[capability].has(key as CanonicalAiAdmissionSafeCountKey) &&
        Number.isInteger(value) &&
        value >= 0,
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function trustedReferences(
  supplied: Partial<CanonicalAiAdmissionOpaqueReferences> | undefined,
  validatedSets: CanonicalAiAdmissionTrustedReferenceSets | undefined,
  capability: CanonicalAiCapabilityRecord | undefined,
): { references: CanonicalAiAdmissionOpaqueReferences; dropped: boolean } {
  const output = capability?.output;
  const outputReferences: Partial<CanonicalAiAdmissionOpaqueReferences> = output
    ? {
        factRefs: output.factRefs,
        evidenceRefs: output.evidenceRefs,
        feeRowRefs:
          output.type === "whole_statement_fee_intelligence_review"
            ? [...output.coverageProof.expectedFeeRowRefs, ...output.coverageProof.reviewedFeeRowRefs]
            : output.type === "fee_classification_review"
              ? output.suggestions.map((suggestion) => suggestion.feeRowId)
              : [],
      }
    : {};
  let dropped = false;
  const validatedReferences =
    validatedSets && TRUSTED_DIAGNOSTIC_REFERENCE_SET_PROVENANCE.has(validatedSets) ? validatedSets.references : undefined;
  const entries = REFERENCE_KEYS.map((key) => {
    const outputValues = [...new Set((outputReferences[key] ?? []).filter((value) => safeReferenceForCategory(key, value)))];
    if ((outputReferences[key] ?? []).length !== outputValues.length) dropped = true;
    const validatedValues = [...new Set((validatedReferences?.[key] ?? []).filter((value) => safeReferenceForCategory(key, value)))];
    const trustedSet = new Set([...outputValues, ...validatedValues]);
    const acceptedSupplied: string[] = [];
    for (const value of supplied?.[key] ?? []) {
      if (!trustedSet.has(value) || !safeReferenceForCategory(key, value)) dropped = true;
      else acceptedSupplied.push(value);
    }
    return [key, [...new Set([...outputValues, ...acceptedSupplied])].sort()] as const;
  });
  return { references: Object.fromEntries(entries) as CanonicalAiAdmissionOpaqueReferences, dropped };
}

function safeReferenceForCategory(category: (typeof REFERENCE_KEYS)[number], value: string): boolean {
  if (typeof value !== "string") return false;
  if (category === "factRefs") return TRUSTED_FACT_REFS.has(value);
  if (category === "evidenceRefs") return /^ev_[a-f0-9]{20}$/.test(value);
  if (category === "feeRowRefs") return /^feerow_[a-f0-9]{24}$/.test(value);
  if (category === "questionRefs") return /^question_[a-f0-9]{16,64}$/.test(value);
  if (category === "candidateRefs") return /^(?:feecand|candidate)_[a-f0-9]{16,64}$/.test(value);
  return /^packet_[a-f0-9]{16,64}$/.test(value);
}

function safeExecutionRef(value: string): boolean {
  return /^ai_exec_[a-f0-9]{32}$/.test(value);
}

function newExecutionRef(): string {
  return `ai_exec_${randomUUID().replace(/-/g, "")}`;
}

function dedupeSignals(signals: readonly CanonicalAiAdmissionDiagnosticSignal[]): CanonicalAiAdmissionDiagnosticSignal[] {
  const safe = signals.filter(
    (item) => {
      const knownStageSignal =
        item.stage !== null &&
        DIAGNOSTIC_STAGE_SET.has(item.stage) &&
        item.state !== null &&
        STAGE_STATE_SET.has(item.state) &&
        item.reasonCode !== "unclassified_internal_failure";
      const unclassifiedSignal =
        item.stage === null && item.state === null && item.reasonCode === "unclassified_internal_failure" && item.fieldPath === null;
      return (
        (knownStageSignal || unclassifiedSignal) &&
        REASON_CODE_SET.has(item.reasonCode) &&
        (item.fieldPath === null || SAFE_FIELD_PATH_SET.has(item.fieldPath))
      );
    },
  );
  return [...new Map(safe.map((item) => [`${item.stage}\u0000${item.state}\u0000${item.reasonCode}\u0000${item.fieldPath ?? ""}`, item])).values()].sort(
    (left, right) => (left.stage ?? "").localeCompare(right.stage ?? "") || left.reasonCode.localeCompare(right.reasonCode),
  );
}

function isSafeFieldPathForCapability(
  capability: CanonicalAiCapabilityId,
  value: CanonicalAiAdmissionSafeFieldPath | null,
): value is CanonicalAiAdmissionSafeFieldPath {
  return value !== null && SAFE_FIELD_PATH_SET.has(value) && SAFE_FIELD_PATHS_BY_CAPABILITY[capability].has(value);
}

function reasonCodeForNotStartedReason(reason: CanonicalAiDiagnosticNotStartedReason): CanonicalAiAdmissionReasonCode {
  if (reason === "capability_disabled") return "capability_disabled";
  if (reason === "capability_not_required") return "capability_not_required";
  if (reason === "deterministic_substitution") return "deterministic_anomaly_substitution_applied";
  return "execution_not_attempted";
}

function exactKeyErrors(source: Record<string, unknown>, allowed: readonly string[], prefix: string): string[] {
  const allowedSet = new Set(allowed);
  const errors = Object.keys(source)
    .filter((key) => !allowedSet.has(key))
    .map(() => `${prefix}_unknown_field`);
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) errors.push(`${prefix}_required_field_missing`);
  }
  return errors;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function stringArrayValue(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function isSortedUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length && values.every((value, index) => index === 0 || values[index - 1]!.localeCompare(value) <= 0);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
