import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateTypedAiCapabilityOutput } from "../canonical/aiCapabilityOutputs.js";
import { CANONICAL_AI_ADMISSION_REASON_CODES } from "../canonical/aiAdmissionDiagnostics.js";
import type {
  ApprovedFeeKnowledgeSourceRegistry,
  FeeKnowledgeClaimSupportRecord,
  FeeKnowledgeSourcePacket,
} from "../canonical/feeKnowledgeTypes.js";
import { buildEvaluationRunIntegrityArtifact, verifyEvaluationRunIntegrityArtifact } from "./artifact.js";
import { assertOutsideRepositoryArtifactPath } from "./execution.js";
import type { OneTimeStatementEvaluationPacket } from "./oneTimeStatementEvaluationAdapter.js";
import { sha256Canonical } from "./stable.js";
import {
  EVALUATION_CANONICAL_ADMISSION_RESULT_VERSION,
  EVALUATION_CANONICAL_ADMISSION_VERSION,
  EVALUATION_CANONICAL_REFERENCE_PROOF_VERSION,
  EVALUATION_EXPECTED_RESEARCH_QUESTION_PROJECTION_VERSION,
  EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION,
  EVALUATION_PACKAGE_5A_PROJECTION_VERSION,
  EVALUATION_PACKAGE_F_RECORD_VERSION,
  EVALUATION_RESEARCH_EVIDENCE_PROOF_VERSION,
  type EvaluationAdmissionDisposition,
  type EvaluationCanonicalAdmissionResult,
  type EvaluationCanonicalAdmissionResultInput,
  type EvaluationExpectedResearchQuestionProjection,
  type EvaluationResearchClaimSupportProof,
  type EvaluationRunIntegrityArtifact,
  type EvaluationRunIntegrityArtifactV2,
} from "./types.js";

type V1BuildInput = Parameters<typeof buildEvaluationRunIntegrityArtifact>[0];

const EXECUTION_REF = /^ai_exec_[a-f0-9]{32}$/;
const RESULT_REF = /^admission_result_[a-z0-9_]{3,100}$/;
const DIAGNOSTIC_REF = /^ai_admission_attempt_whole_statement_fee_intelligence_review_[1-9][0-9]*$/;
const RESEARCH_ATTEMPT_REF = /^research_(?:attempt_[a-z0-9_]{3,100}|[a-f0-9]{16,64})$/;
const QUESTION_REF = /^question_[a-f0-9]{64}$/;
const FEE_ROW_REF = /^(?:fee_row|feerow)_[a-z0-9_]{1,100}$/;
const CANDIDATE_REF = /^candidate_(?:[a-z][a-z0-9_]{0,100}|[a-f0-9]{16,64})$/;
const CLAIM_SUPPORT_REF = /^(?:claim_support_[a-z0-9_]{1,100}|claimsupport_[a-f0-9]{16,64})$/;
const SAFE_REFERENCE = /^[a-z][a-z0-9_:-]{2,120}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{2,120}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HASH = /^(?:sha256:)?[a-f0-9]{32,64}$/;
const LOCATOR_TEXT_HASH = /^[a-f0-9]{16}$/;
const REGISTRY_VERIFICATION_REF = /^registry_[a-f0-9]{16}$/;
const RUNTIME_SOURCE_REF = /^runtime_source_[a-f0-9]{16}$/;
const RUNTIME_CLAIM_REF = /^runtime_claim_[a-f0-9]{16}$/;
const SENSITIVE_VALUE = /(?:https?:\/\/|file:\/\/|(?:^|[\s"'])(?:\/Users\/|\/private\/|\/tmp\/|\.\.?\/|~\/|[A-Za-z]:\\)|\.pdf\b|sk-[a-z0-9_-]+|akia[a-z0-9]{12,}|api[_ -]?key|authorization\s*:|bearer\s+[a-z0-9._-]+|open\s*ai|gpt[-_ ]?[0-9a-z.]*|anthropic|claude|gemini|google ai|azure openai|bedrock|raw[_ -]?(?:prompt|response|statement)|merchant[_ -]?(?:id|name|label)|account[_ -]?(?:number|id)|request[_ -]?id)/i;
const FORBIDDEN_FINANCIAL_VALUE = /(?:[$€£¥]|\b\d+(?:,\d{3})*(?:\.\d+)?\s?%|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:usd|dollars?|cents?|basis\s*points?|bps|rate)\b|\b(?:usd|dollars?|cents?|currency|basis\s*points?|bps|rate)\s?\d+(?:,\d{3})*(?:\.\d+)?\b)/i;
const PACKAGE_5A_REASON_CODES = new Set<string>(CANONICAL_AI_ADMISSION_REASON_CODES);
const RESULT_REASONS = ["canonical_admission_admitted", "canonical_admission_rejected", "canonical_admission_safety_blocked"] as const;
const VALIDATION_ERRORS = [
  "whole_statement_output_invalid", "whole_statement_schema_invalid", "whole_statement_evidence_invalid",
  "whole_statement_linkage_invalid", "whole_statement_privacy_safety_blocked", "whole_statement_research_incomplete",
] as const;
const PROJECTION_REASONS = [
  "artifact_v2_source_quality_failed", "artifact_v2_fingerprint_mismatch", "artifact_v2_locator_mismatch",
  "artifact_v2_applicability_failed", "artifact_v2_research_parentage_invalid", "artifact_v2_deterministic_contradiction",
] as const;
const ATTEMPT_STATUSES = ["completed", "disabled", "not_needed", "failed", "timed_out", "safety_blocked", "budget_exhausted", "unsupported_model"] as const;
const QUESTION_CATEGORIES = ["classification", "published_rule", "applicability", "contradiction"] as const;
const QUESTION_TRIGGER_REASONS = ["missing_applicable_registry_claim", "expired_or_superseded_source", "contradicted_source", "material_unfamiliar_label", "not_needed", "disabled"] as const;
const ATTEMPT_REASON_BY_STATUS = {
  completed: ["fee_knowledge_research_completed"], disabled: ["fee_knowledge_research_disabled"], not_needed: ["fee_knowledge_research_not_needed"],
  failed: ["fee_knowledge_research_failed"], timed_out: ["fee_knowledge_research_timed_out"],
  safety_blocked: ["fee_knowledge_research_safety_blocked"], budget_exhausted: ["fee_knowledge_research_budget_exhausted"],
  unsupported_model: ["fee_knowledge_web_search_model_unsupported"],
} as const;
const CANDIDATE_STATUSES = ["runtime_verified_documentation", "verified_candidate_limited", "provisional", "rejected", "safety_blocked", "source_unavailable", "source_inapplicable", "conflicting_evidence"] as const;
const RETRIEVAL_STATUSES = ["retrieved_text", "retrieval_succeeded_text_unavailable", "unavailable", "failed", "timed_out", "safety_blocked", "unsupported_content_type", "oversized", "malformed", "encrypted"] as const;
const SEMANTIC_STATUSES = ["not_started", "completed", "failed", "timed_out", "parse_failed", "safety_blocked", "unsupported"] as const;
const EVIDENCE_DECISIONS = ["verified_classification", "verified_rule", "verified_application", "possible_interpretation", "needs_verification", "conflicting_evidence", "unsupported", "source_unavailable", "source_inapplicable"] as const;
const SEMANTIC_DECISIONS = ["supports", "partially_supports", "does_not_support", "contradicts", "unsupported"] as const;
const VERIFIED_EVIDENCE_DECISIONS = new Set(["verified_classification", "verified_rule", "verified_application"]);
const CANDIDATE_REASON_CODES = new Set([
  "fee_knowledge_claim_support_missing", "fee_knowledge_connection_target_unvalidated", "fee_knowledge_content_length_oversized",
  "fee_knowledge_content_type_unsupported", "fee_knowledge_pdf_parse_failed", "fee_knowledge_pdf_text_retrieved", "fee_knowledge_pdf_text_unavailable",
  "fee_knowledge_redirect_limit_exceeded", "fee_knowledge_redirect_loop", "fee_knowledge_response_oversized", "fee_knowledge_retrieval_aborted",
  "fee_knowledge_retrieval_fetch_failed", "fee_knowledge_text_retrieved", "fee_knowledge_text_unavailable", "fee_knowledge_url_credentials_unsafe",
  "fee_knowledge_url_host_missing", "fee_knowledge_url_invalid", "fee_knowledge_url_port_unsafe", "fee_knowledge_url_private_host",
  "fee_knowledge_url_private_ip", "fee_knowledge_url_scheme_unsafe", "fee_knowledge_dns_empty", "fee_knowledge_validated_address_invalid",
  "fee_knowledge_validated_address_missing", "fee_knowledge_pdf_encrypted", "fee_knowledge_semantic_support_not_run",
  ...EVIDENCE_DECISIONS.map((decision) => `fee_knowledge_${decision}`),
  "fee_knowledge_retrieval_timed_out", "fee_knowledge_semantic_parse_failed", "fee_knowledge_semantic_timed_out",
  "fee_knowledge_semantic_safety_blocked", "fee_knowledge_semantic_unsupported", "fee_knowledge_semantic_failed",
  ...[400, 401, 403, 404, 408, 409, 410, 413, 415, 422, 425, 429, 500, 501, 502, 503, 504].map((status) => `fee_knowledge_http_${status}`),
]);
const HTTP_UNAVAILABLE_REASONS = [400, 401, 403, 404, 408, 409, 410, 413, 415, 422, 425, 429, 500, 501, 502, 503, 504]
  .map((status) => `fee_knowledge_http_${status}`);
const RETRIEVAL_REASON_BY_STATUS: Record<(typeof RETRIEVAL_STATUSES)[number], readonly string[]> = {
  retrieved_text: ["fee_knowledge_text_retrieved", "fee_knowledge_pdf_text_retrieved"],
  retrieval_succeeded_text_unavailable: ["fee_knowledge_text_unavailable", "fee_knowledge_pdf_text_unavailable"],
  unavailable: HTTP_UNAVAILABLE_REASONS,
  failed: ["fee_knowledge_retrieval_fetch_failed"],
  timed_out: ["fee_knowledge_retrieval_aborted", "fee_knowledge_retrieval_timed_out"],
  safety_blocked: [
    "fee_knowledge_url_credentials_unsafe", "fee_knowledge_url_host_missing", "fee_knowledge_url_invalid", "fee_knowledge_url_port_unsafe",
    "fee_knowledge_url_private_host", "fee_knowledge_url_private_ip", "fee_knowledge_url_scheme_unsafe", "fee_knowledge_redirect_limit_exceeded",
    "fee_knowledge_redirect_loop", "fee_knowledge_connection_target_unvalidated", "fee_knowledge_dns_empty",
    "fee_knowledge_validated_address_invalid", "fee_knowledge_validated_address_missing",
  ],
  unsupported_content_type: ["fee_knowledge_content_type_unsupported"],
  oversized: ["fee_knowledge_content_length_oversized", "fee_knowledge_response_oversized"],
  malformed: ["fee_knowledge_pdf_parse_failed"],
  encrypted: ["fee_knowledge_pdf_encrypted"],
};
const SEMANTIC_REASON_BY_STATUS: Record<(typeof SEMANTIC_STATUSES)[number], readonly string[]> = {
  not_started: ["fee_knowledge_semantic_support_not_run"],
  completed: EVIDENCE_DECISIONS.map((decision) => `fee_knowledge_${decision}`),
  failed: ["fee_knowledge_semantic_failed"],
  timed_out: ["fee_knowledge_semantic_timed_out"],
  parse_failed: ["fee_knowledge_semantic_parse_failed"],
  safety_blocked: ["fee_knowledge_semantic_safety_blocked"],
  unsupported: ["fee_knowledge_semantic_unsupported"],
};
const INVARIANCE_PACKAGE_PROJECTIONS = [
  ["package_b", "package_b_financial_facts_projection_v2"],
  ["package_c", "package_c_fee_ledger_projection_v2"],
  ["package_d", "package_d_ownership_actionability_projection_v2"],
  ["package_e", "package_e_opportunity_projection_v2"],
] as const;
const SUPPORT_REASON_CODES = new Set([
  ...EVIDENCE_DECISIONS.map((decision) => `fee_knowledge_${decision}`), "fee_knowledge_semantic_support_not_run",
  "fee_knowledge_semantic_support_provider_failed", "fee_knowledge_semantic_support_provider_unavailable", "deterministic_calculation_matches",
]);
const FEE_CATEGORIES = ["interchange", "card_brand_network_assessment", "network_access_or_authorization", "processor_markup", "processor_per_item_fee", "administrative_fee", "service_fee", "compliance_fee", "equipment_or_lease", "third_party_product", "chargeback_or_dispute", "funding_adjustment", "tax_or_government", "credit", "unknown_needs_review"] as const;
const FEE_PARTIES = ["network", "card_brand", "issuer_or_interchange", "processor", "third_party", "merchant_contract", "tax_or_government", "unknown"] as const;
const FEE_ACTIONABILITIES = ["potentially_actionable", "verify_only", "not_actionable", "unknown"] as const;
const EVIDENCE_PROVENANCE = ["statement_evidence", "approved_external_documentation", "runtime_verified_documentation", "industry_inference", "merchant_evidence", "human_review"] as const;
const CANONICAL_FACT_REFERENCES = new Set([
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
const ACCEPTANCE_STATUSES = ["accepted", "accepted_with_conditions", "needs_verification", "rejected", "human_review"] as const;
const ACCEPTANCE_REASON_CODES = new Set([
  ...ACCEPTANCE_STATUSES.map((status) => `whole_statement_fee_intelligence_${status}`),
  "whole_statement_fee_intelligence_industry_inference_limited",
  "whole_statement_fee_intelligence_approved_documentation",
  "whole_statement_fee_intelligence_runtime_verified_documentation",
  "whole_statement_fee_intelligence_merchant_evidence_unavailable",
  "whole_statement_fee_intelligence_conflict_preserved",
  "whole_statement_fee_intelligence_missing_evidence_preserved",
  "whole_statement_fee_intelligence_noncontributing_row_preserved",
]);
const LIMITATION_CODES = [
  "full_statement_anomaly_review_required", "whole_statement_fee_intelligence_review_required",
  "material_fee_classification_review_required", "notice_change_review_required", "benchmark_category_review_required",
  "benchmark_category_not_verified", "ai_narrative_unavailable", "ai_output_rejected", "provider_unavailable",
  "deterministic_explanation_available",
] as const;
const WHOLE_STATEMENT_OUTPUT_REASON_CODES = ["whole_statement_fee_intelligence_reviewed"] as const;
const CONTRADICTION_CODES = [
  "semantic_support_contradicts_claim",
  "runtime_or_registry_category_conflict",
  "source_or_claim_contradicted",
] as const;
const EXECUTION_STAGES = ["parser", "whole_statement_ai_review", "web_search_discovery", "document_retrieval", "semantic_verification", "canonical_admission", "customer_publication", "final_artifact"] as const;
const LIFECYCLE_STAGES = ["manifest_row", "preflight_record", "parser_record", "capability_execution", "provider_request", "research_retrieval", "semantic_verification", "canonical_admission", "customer_publication", "final_artifact"] as const;
const LIFECYCLE_STATES = ["not_reached", "blocked", "failed", "completed", "withheld"] as const;

const TOP_LEVEL_V2_KEYS = [
  "type", "manifestVersion", "manifestHash", "approvedManifestHash", "sourceIdentity", "deduplicationDecisions",
  "lifecycleLedger", "parserDecisions", "parentPreflightProof", "packageFinancialInvariance", "costBudgetLedger",
  "executionPermit", "providerCallOutcomes", "finalStatus", "reasonCodes", "canonicalAdmissionResults", "artifactContentHash",
] as const;
const RESULT_KEYS = [
  "type", "resultId", "sourceDocumentId", "capabilityId", "executionRef", "admission", "packageF", "package5a",
  "researchEvidence", "canonicalReferenceProof", "lifecycleAdmissionRef", "admissionDisposition", "reasonCodes", "authoritative",
  "financialMutationAllowed", "customerPublished", "resultContentHash",
] as const;
const ADMISSION_KEYS = [
  "type", "capabilityId", "executionRef", "executionStatus", "validationStatus", "groundingStatus", "admissionDisposition",
  "acceptedClaimSupportRefs", "rejectedClaimSupportRefs", "researchAttemptRefs", "validationErrorCodes", "reasonCodes",
  "safeCounts", "package5aDiagnosticRef", "authoritative", "financialMutationAllowed",
] as const;
const SAFE_COUNT_KEYS = [
  "reviewedFeeRowCount", "acceptedRecordCount", "needsVerificationRecordCount", "humanReviewRecordCount", "rejectedRecordCount", "researchAttemptCount", "evidenceCandidateCount", "claimSupportCount",
] as const;
const PACKAGE_F_KEYS = ["type", "capabilityId", "executionRef", "output", "sourceReferencesValidatedAgainstProof", "authoritative", "financialMutationAllowed"] as const;
const PACKAGE_5A_KEYS = [
  "type", "diagnosticRef", "capabilityId", "executionRef", "executionState", "admissionState", "finalCanonicalStatus",
  "stageStates", "reasonCodes", "projectionReasonCodes", "diagnosticRefs", "rawPromptPersisted", "rawResponsePersisted", "rawStatementTextPersisted",
  "providerDetailsPersisted",
] as const;
const STAGE_STATE_KEYS = [
  "responseParse", "schemaValidation", "evidenceCitation", "sourceQuality", "linkage", "deterministicReconciliation", "privacySafety",
] as const;
const RESEARCH_KEYS = ["type", "attempts", "candidates", "claimSupports"] as const;
const ATTEMPT_KEYS = ["researchAttemptRef", "questionRef", "feeRowRef", "questionOrdinal", "sanitizedQuestionCategory", "triggerReason", "status", "resultCount", "candidateRefs", "reasonCodes"] as const;
const CANDIDATE_KEYS = ["candidateRef", "researchAttemptRef", "questionRef", "feeRowRef", "verificationStatus", "retrievalStatus", "semanticVerificationStatus", "claimSupportRefs", "reasonCodes"] as const;
const SUPPORT_KEYS = [
  "claimSupportRef", "origin", "runtimeSourceRef", "runtimeClaimRef", "candidateRef", "researchAttemptRef", "questionRef", "approvedSourceRef", "approvedClaimRef",
  "approvedRegistryVersionRef", "approvedSourceLifecycle", "approvedSourceApplicable", "approvedRegistryVerificationRef", "approvedContentFingerprint",
  "approvedRegistryProofLevel", "approvedRegistryScopeBasis", "feeRowRef", "runtimeDocumentFingerprint", "locatorTextHash",
  "structuredClaim", "semanticDecision", "applicability", "rateOrAmountComparison", "hasDeterministicCalculationProof", "hasConditions",
  "hasStructuredClaimExclusions", "hasSupportExclusions", "finalConfidence", "finalActionabilityCeiling", "evidenceDecision",
  "contradictionCodes", "reasonCodes", "disposition", "claimSupportDecisionRef",
] as const;
const CLAIM_KEYS = [
  "claimKind", "proposedCategory", "likelyEconomicOwner", "likelyContractualController", "maximumConfidence", "actionabilityCeiling", "applicationBasis",
] as const;
const APPLICABILITY_KEYS = ["processorOrNetwork", "jurisdiction", "transactionContext", "statementPeriod"] as const;
const REFERENCE_PROOF_KEYS = ["type", "canonicalFeeRowRefs", "canonicalEvidenceRefs", "canonicalFeeRowEvidencePopulation", "approvedFactRefs", "candidateRefs", "claimSupportRefs", "claimSupportDecisionRefs", "expectedResearchQuestions", "canonicalReferenceProjectionHash", "preparedSanitizedPacketContentHash", "wholeStatementPacketContentHash"] as const;
const ROW_EVIDENCE_KEYS = ["feeRowRef", "evidenceRefs", "contributesToUniqueTotal"] as const;
const PREPARED_RESEARCH_QUESTION_KEYS = [
  "feeRowRef", "sanitizedQuestionCategory", "triggerReason", "processorOrNetwork", "feeLabel", "statementSection",
  "statementPeriodYear", "deterministicCategory", "deterministicEconomicOwner", "deterministicContractualController",
  "deterministicActionabilityCeiling", "deterministicConfidence", "semanticQuestion",
] as const;

type PreparedResearchQuestion = OneTimeStatementEvaluationPacket["research"]["questions"][number];

export function calculateEvaluationResearchQuestionRef(
  question: PreparedResearchQuestion,
  questionOrdinal: number,
): string {
  return `question_${sha256Canonical({
    type: "evaluation_sanitized_research_question_identity_v1",
    questionOrdinal,
    ...question,
  }).slice("sha256:".length)}`;
}

export function buildEvaluationExpectedResearchQuestionProjection(
  packet: OneTimeStatementEvaluationPacket,
): EvaluationExpectedResearchQuestionProjection {
  if (!isRecord(packet) || packet.type !== "one_time_statement_evaluation_packet_v1" || !isRecord(packet.research)) {
    throw new Error("Evaluation Artifact V2 prepared evaluation packet type failed closed.");
  }
  if (!Array.isArray(packet.research.questions) || !validateResearchLimits(packet.research.limits)) {
    throw new Error("Evaluation Artifact V2 prepared research contract failed closed.");
  }
  const questions = packet.research.questions.map((question, index) => {
    if (!validatePreparedResearchQuestion(question)) {
      throw new Error("Evaluation Artifact V2 prepared research question failed closed.");
    }
    const contract: Omit<EvaluationExpectedResearchQuestionProjection["questions"][number], "questionRef"> = {
      feeRowRef: question.feeRowRef,
      questionOrdinal: index + 1,
      sanitizedQuestionCategory: question.sanitizedQuestionCategory,
      triggerReason: question.triggerReason,
    };
    return { questionRef: calculateEvaluationResearchQuestionRef(question, index + 1), ...contract };
  });
  if (new Set(questions.map((question) => question.questionRef)).size !== questions.length) {
    throw new Error("Evaluation Artifact V2 prepared research question identity failed closed.");
  }
  return {
    type: EVALUATION_EXPECTED_RESEARCH_QUESTION_PROJECTION_VERSION,
    questions,
    limits: structuredClone(packet.research.limits),
  };
}

export function buildEvaluationRunIntegrityArtifactV2(
  input: V1BuildInput & {
    canonicalAdmissionResults: EvaluationCanonicalAdmissionResultInput[];
    preparedSanitizedPackets: Array<{ resultId: string; packet: OneTimeStatementEvaluationPacket }>;
  },
): EvaluationRunIntegrityArtifactV2 {
  const packetByResult = new Map<string, OneTimeStatementEvaluationPacket>();
  for (const binding of input.preparedSanitizedPackets) {
    if (!RESULT_REF.test(binding.resultId) || packetByResult.has(binding.resultId)) {
      throw new Error("Evaluation Artifact V2 prepared-packet binding failed closed.");
    }
    packetByResult.set(binding.resultId, binding.packet);
  }
  if (packetByResult.size !== input.canonicalAdmissionResults.length) {
    throw new Error("Evaluation Artifact V2 prepared-packet population failed closed.");
  }
  for (const result of input.canonicalAdmissionResults) {
    const packet = packetByResult.get(result.resultId);
    if (!packet
      || sha256Canonical(packet) !== result.canonicalReferenceProof.preparedSanitizedPacketContentHash
      || sha256Canonical(packet.wholeStatementReview) !== result.canonicalReferenceProof.wholeStatementPacketContentHash
      || JSON.stringify(buildEvaluationExpectedResearchQuestionProjection(packet)) !== JSON.stringify(result.canonicalReferenceProof.expectedResearchQuestions)) {
      throw new Error("Evaluation Artifact V2 prepared-packet hash failed closed.");
    }
  }
  const v1 = buildEvaluationRunIntegrityArtifact(input);
  const results = input.canonicalAdmissionResults.map((item) => {
    const content = structuredClone(item);
    return { ...content, resultContentHash: sha256Canonical(content) };
  }).sort((left, right) => left.resultId.localeCompare(right.resultId));
  const { type: _v1Type, artifactContentHash: _v1Hash, ...trustedV1Fields } = v1;
  const content = {
    type: EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION,
    ...trustedV1Fields,
    canonicalAdmissionResults: results,
  } as const;
  const artifact: EvaluationRunIntegrityArtifactV2 = { ...content, artifactContentHash: sha256Canonical(content) };
  if (!verifyEvaluationRunIntegrityArtifactV2(artifact)) throw new Error("Evaluation Artifact V2 validation failed closed.");
  return artifact;
}

export function verifyEvaluationRunIntegrityArtifactV1(value: unknown): value is EvaluationRunIntegrityArtifact {
  return isRecord(value) && value.type === "evaluation_run_integrity_artifact_v1" && verifyEvaluationRunIntegrityArtifact(value as EvaluationRunIntegrityArtifact);
}

export function verifyEvaluationRunIntegrityArtifactV2(value: unknown): value is EvaluationRunIntegrityArtifactV2 {
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_V2_KEYS) || value.type !== EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION) return debugReject("top_shape");
  if (!SHA256.test(stringValue(value.artifactContentHash)) || !Array.isArray(value.canonicalAdmissionResults) || value.canonicalAdmissionResults.length === 0) return debugReject("top_hash_shape");
  const { artifactContentHash, canonicalAdmissionResults, type: _type, ...v1Fields } = value;
  const v1Candidate = { type: "evaluation_run_integrity_artifact_v1", ...v1Fields, artifactContentHash: sha256Canonical({ type: "evaluation_run_integrity_artifact_v1", ...v1Fields }) };
  if (!verifyEvaluationRunIntegrityArtifact(v1Candidate as EvaluationRunIntegrityArtifact)) return debugReject("v1_verification");
  if (!validateTrustedV1Fields(value)) return debugReject("v1_fields");
  if (sha256Canonical({ type: EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION, ...v1Fields, canonicalAdmissionResults }) !== artifactContentHash) return debugReject("top_hash");

  const sourceIds = new Set((value.sourceIdentity as Array<Record<string, unknown>>).map((row) => stringValue(row.sourceDocumentId)));
  const selectedSourceIds = new Set((value.executionPermit as Record<string, any>).documents.map((row: Record<string, unknown>) => stringValue(row.sourceDocumentId)));
  const resultIds = new Set<string>();
  const resultKeys = new Set<string>();
  const executionRefs = new Set<string>();
  for (const result of canonicalAdmissionResults) {
    if (!validateAdmissionResult(result, value, sourceIds) || !selectedSourceIds.has(result.sourceDocumentId)) return debugReject("result");
    if (resultIds.has(result.resultId)) return false;
    resultIds.add(result.resultId);
    const key = `${result.sourceDocumentId}:${result.capabilityId}`;
    if (resultKeys.has(key)) return false;
    resultKeys.add(key);
    if (executionRefs.has(result.executionRef)) return false;
    executionRefs.add(result.executionRef);
  }
  if (!isSorted(canonicalAdmissionResults.map((result) => result.resultId))) return false;
  return true;
}

function debugReject(stage: string): false {
  void stage;
  return false;
}

export function verifyEvaluationRunIntegrityArtifactByType(value: unknown): value is EvaluationRunIntegrityArtifact | EvaluationRunIntegrityArtifactV2 {
  if (!isRecord(value)) return false;
  if (value.type === "evaluation_run_integrity_artifact_v1") return verifyEvaluationRunIntegrityArtifactV1(value);
  if (value.type === EVALUATION_INTEGRITY_ARTIFACT_V2_VERSION) return verifyEvaluationRunIntegrityArtifactV2(value);
  return false;
}

export async function writeAndVerifyEvaluationRunIntegrityArtifactV2(input: {
  artifact: EvaluationRunIntegrityArtifactV2;
  outputPath: string;
}): Promise<string> {
  return writeAndVerifyEvaluationRunIntegrityArtifactV2WithFileOperations(input, { mkdir, readFile, rename, unlink, writeFile });
}

type EvaluationArtifactV2FileOperations = {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rename: typeof rename;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
};

export async function writeAndVerifyEvaluationRunIntegrityArtifactV2ForTesting(
  input: { artifact: EvaluationRunIntegrityArtifactV2; outputPath: string },
  operations: EvaluationArtifactV2FileOperations,
): Promise<string> {
  if (process.env.NODE_ENV !== "test") throw new Error("The injected Artifact V2 writer is test-only.");
  return writeAndVerifyEvaluationRunIntegrityArtifactV2WithFileOperations(input, operations);
}

async function writeAndVerifyEvaluationRunIntegrityArtifactV2WithFileOperations(
  input: { artifact: EvaluationRunIntegrityArtifactV2; outputPath: string },
  operations: EvaluationArtifactV2FileOperations,
): Promise<string> {
  if (!verifyEvaluationRunIntegrityArtifactV2(input.artifact)) throw new Error("Refusing to write an invalid Evaluation Artifact V2.");
  await assertOutsideRepositoryArtifactPath(input.outputPath);
  await operations.mkdir(path.dirname(input.outputPath), { recursive: true });
  const pendingPath = `${input.outputPath}.pending`;
  let published = false;
  try {
    await operations.writeFile(pendingPath, `${JSON.stringify(input.artifact, null, 2)}\n`, { mode: 0o600 });
    const pending = JSON.parse(await operations.readFile(pendingPath, "utf8"));
    if (!verifyEvaluationRunIntegrityArtifactV2(pending)) throw new Error("Written pending Evaluation Artifact V2 failed independent verification.");
    await operations.rename(pendingPath, input.outputPath);
    published = true;
    const publishedArtifact = JSON.parse(await operations.readFile(input.outputPath, "utf8"));
    if (!verifyEvaluationRunIntegrityArtifactV2(publishedArtifact)) throw new Error("Published Evaluation Artifact V2 failed independent verification.");
    return input.outputPath;
  } catch (error) {
    await operations.unlink(pendingPath).catch(() => undefined);
    if (published) await operations.unlink(input.outputPath).catch(() => undefined);
    throw error;
  }
}

function validateAdmissionResult(
  value: unknown,
  artifact: Record<string, unknown>,
  sourceIds: Set<string>,
): value is EvaluationCanonicalAdmissionResult {
  if (!isRecord(value) || !hasExactKeys(value, RESULT_KEYS)) return debugReject("result_shape");
  if (value.type !== EVALUATION_CANONICAL_ADMISSION_RESULT_VERSION || !RESULT_REF.test(stringValue(value.resultId))) return false;
  if (!sourceIds.has(stringValue(value.sourceDocumentId)) || value.capabilityId !== "whole_statement_fee_intelligence_review") return false;
  if (!EXECUTION_REF.test(stringValue(value.executionRef)) || value.lifecycleAdmissionRef !== value.executionRef) return false;
  if (!enumValue(value.admissionDisposition, ["admitted", "rejected", "safety_blocked"])) return false;
  if (value.authoritative !== false || value.financialMutationAllowed !== false || value.customerPublished !== false) return false;
  const expectedReason = dispositionReason(value.admissionDisposition);
  if (!exactEnumArray(value.reasonCodes, [expectedReason], RESULT_REASONS) || !validateResultProseSafety(value)) return false;
  const { resultContentHash, ...content } = value;
  if (!SHA256.test(stringValue(resultContentHash)) || sha256Canonical(content) !== resultContentHash) return false;
  if (!validateAdmission(value.admission, value)) return debugReject("admission");
  if (!validatePackage5a(value.package5a, value)) return debugReject("package5a");
  if (!validateCanonicalReferenceProof(value.canonicalReferenceProof)) return debugReject("reference_proof");
  if (!validateResearchProof(
    value.researchEvidence,
    value.admission,
    value.admissionDisposition,
    value.canonicalReferenceProof.expectedResearchQuestions,
  )) return debugReject("research");
  if (value.admissionDisposition === "admitted") {
    if (!validatePackageF(value.packageF, value)) return debugReject("packagef");
  } else if (value.packageF !== null) return false;
  if (!validateProjectionLinkage(value)) return debugReject("projection_linkage");
  if (!validateLifecycle(value, artifact.lifecycleLedger)) return debugReject("lifecycle");
  if (!validateInvariance(value.sourceDocumentId, artifact.packageFinancialInvariance)) return debugReject("invariance");
  return true;
}

function validateAdmission(value: unknown, result: Record<string, unknown>): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ADMISSION_KEYS)) return false;
  if (value.type !== EVALUATION_CANONICAL_ADMISSION_VERSION || value.capabilityId !== result.capabilityId || value.executionRef !== result.executionRef) return false;
  if (value.admissionDisposition !== result.admissionDisposition || value.authoritative !== false || value.financialMutationAllowed !== false) return false;
  if (value.package5aDiagnosticRef !== (result.package5a as Record<string, unknown>)?.diagnosticRef) return false;
  if (!enumValue(value.executionStatus, ["completed", "failed", "timed_out"])) return false;
  if (!enumValue(value.validationStatus, ["passed", "failed"]) || !enumValue(value.groundingStatus, ["grounded", "rejected"])) return false;
  if (!safeRefArray(value.acceptedClaimSupportRefs, CLAIM_SUPPORT_REF) || !safeRefArray(value.rejectedClaimSupportRefs, CLAIM_SUPPORT_REF)) return false;
  if (!safeRefArray(value.researchAttemptRefs, RESEARCH_ATTEMPT_REF) || !closedCodeArray(value.validationErrorCodes, VALIDATION_ERRORS)) return false;
  const expectedReason = dispositionReason(value.admissionDisposition);
  if (!exactEnumArray(value.reasonCodes, [expectedReason], RESULT_REASONS)) return false;
  if (!isRecord(value.safeCounts) || !hasExactKeys(value.safeCounts, SAFE_COUNT_KEYS)) return false;
  if (Object.values(value.safeCounts).some((count) => !Number.isInteger(count) || Number(count) < 0)) return false;
  const accepted = new Set(value.acceptedClaimSupportRefs as string[]);
  if ((value.rejectedClaimSupportRefs as string[]).some((ref) => accepted.has(ref))) return false;
  const disposition = value.admissionDisposition as EvaluationAdmissionDisposition;
  if (disposition === "admitted") {
    if (value.executionStatus !== "completed" || value.validationStatus !== "passed" || value.groundingStatus !== "grounded" || (value.validationErrorCodes as string[]).length !== 0) return false;
  } else {
    if (value.validationStatus !== "failed" || value.groundingStatus !== "rejected" || (value.validationErrorCodes as string[]).length === 0) return false;
    if (disposition === "safety_blocked" && !(value.validationErrorCodes as string[]).includes("whole_statement_privacy_safety_blocked")) return false;
    if (disposition === "rejected" && (value.validationErrorCodes as string[]).includes("whole_statement_privacy_safety_blocked")) return false;
  }
  return true;
}

function validatePackageF(value: unknown, result: Record<string, unknown>): boolean {
  if (!isRecord(value) || !hasExactKeys(value, PACKAGE_F_KEYS)) return false;
  if (value.type !== EVALUATION_PACKAGE_F_RECORD_VERSION || value.capabilityId !== result.capabilityId || value.executionRef !== result.executionRef) return false;
  if (value.sourceReferencesValidatedAgainstProof !== true || value.authoritative !== false || value.financialMutationAllowed !== false || !isRecord(value.output)) return false;
  if (validateTypedAiCapabilityOutput(value.output as never).length > 0 || !validateWholeStatementOutput(value.output)) return false;
  if (value.output.reviewStatus !== "completed") return false;
  return true;
}

function validateWholeStatementOutput(output: Record<string, unknown>): boolean {
  const keys = ["type", "reviewPolicyVersion", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "reviewStatus", "coverageProof", "rowInterpretations", "acceptanceRecords", "reasonCodes", "financialMutationAllowed", "providerDetailsStripped"] as const;
  if (!hasExactKeys(output, keys) || output.type !== "whole_statement_fee_intelligence_review" || output.reviewPolicyVersion !== "whole_statement_fee_intelligence_review_v1") return false;
  if (output.authoritative !== false || output.financialMutationAllowed !== false || output.providerDetailsStripped !== true || output.reviewStatus !== "completed") return false;
  if (!safeRefArray(output.evidenceRefs, SAFE_REFERENCE) || !canonicalFactRefArray(output.factRefs) || !closedCodeArray(output.limitationCodes, LIMITATION_CODES) || !closedCodeArray(output.reasonCodes, WHOLE_STATEMENT_OUTPUT_REASON_CODES)) return false;
  if (!isRecord(output.coverageProof) || !hasExactKeys(output.coverageProof, ["policyVersion", "expectedFeeRowRefs", "reviewedFeeRowRefs", "missingFeeRowRefs", "duplicatedFeeRowRefs", "unknownFeeRowRefs", "malformedFeeRowRefs", "malformedFeeRowRefCount", "exactCoverage"])) return false;
  const coverage = output.coverageProof;
  if (coverage.policyVersion !== "whole_statement_fee_intelligence_coverage_v1" || coverage.exactCoverage !== true || coverage.malformedFeeRowRefCount !== 0) return false;
  for (const key of ["expectedFeeRowRefs", "reviewedFeeRowRefs", "missingFeeRowRefs", "duplicatedFeeRowRefs", "unknownFeeRowRefs", "malformedFeeRowRefs"] as const) {
    if (!safeRefArray(coverage[key], FEE_ROW_REF)) return false;
  }
  if (JSON.stringify(coverage.expectedFeeRowRefs) !== JSON.stringify(coverage.reviewedFeeRowRefs)) return false;
  if ((coverage.missingFeeRowRefs as unknown[]).length || (coverage.duplicatedFeeRowRefs as unknown[]).length || (coverage.unknownFeeRowRefs as unknown[]).length || (coverage.malformedFeeRowRefs as unknown[]).length) return false;
  if (!Array.isArray(output.rowInterpretations) || !Array.isArray(output.acceptanceRecords)) return false;
  if (!isSorted(output.rowInterpretations.map((row) => isRecord(row) ? stringValue(row.feeRowRef) : ""))) return false;
  if (!isSorted(output.acceptanceRecords.map((row) => isRecord(row) ? stringValue(row.feeRowRef) : ""))) return false;
  for (const row of output.rowInterpretations) if (!validateInterpretation(row)) return false;
  for (const row of output.acceptanceRecords) if (!validateAcceptance(row)) return false;
  return true;
}

function validateInterpretation(value: unknown): boolean {
  const keys = ["feeRowRef", "proposedCategory", "likelyEconomicOwner", "likelyContractualController", "proposedActionabilityCeiling", "confidence", "conciseRationale", "evidenceProvenance", "evidenceRefs", "externalSourceRef", "externalClaimSupportRef", "conflicts", "missingEvidence", "recommendedDisposition", "authoritative"] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys) || !FEE_ROW_REF.test(stringValue(value.feeRowRef)) || value.authoritative !== false) return false;
  if (!enumValue(value.proposedCategory, FEE_CATEGORIES) || !enumValue(value.likelyEconomicOwner, FEE_PARTIES) || !enumValue(value.likelyContractualController, FEE_PARTIES)) return false;
  if (!enumValue(value.proposedActionabilityCeiling, FEE_ACTIONABILITIES) || !enumValue(value.confidence, ["high", "medium", "low"])) return false;
  if (!enumValue(value.evidenceProvenance, EVIDENCE_PROVENANCE) || !enumValue(value.recommendedDisposition, ["supported", "insufficient_evidence", "conflicting_evidence", "human_review"])) return false;
  if (!canonicalExplanatoryText(value.conciseRationale, 320)) return false;
  if (!safeRefArray(value.evidenceRefs, SAFE_REFERENCE) || !canonicalExplanatoryArray(value.conflicts, 160) || !canonicalExplanatoryArray(value.missingEvidence, 160)) return false;
  if (value.externalSourceRef !== null && !safeReferenceValue(value.externalSourceRef)) return false;
  if (value.externalClaimSupportRef !== null && !CLAIM_SUPPORT_REF.test(stringValue(value.externalClaimSupportRef))) return false;
  return true;
}

function validateAcceptance(value: unknown): boolean {
  const keys = ["feeRowRef", "policyVersion", "status", "acceptedSemanticFields", "evidenceRefs", "externalSourceRef", "externalClaimSupportRef", "reasonCodes", "conflicts", "actionabilityCeiling", "immutableFeeRowRef"] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys) || !FEE_ROW_REF.test(stringValue(value.feeRowRef)) || value.feeRowRef !== value.immutableFeeRowRef) return false;
  if (value.policyVersion !== "whole_statement_fee_intelligence_acceptance_v1" || !safeRefArray(value.evidenceRefs, SAFE_REFERENCE) || !closedSetArray(value.reasonCodes, ACCEPTANCE_REASON_CODES) || !canonicalExplanatoryArray(value.conflicts, 160)) return false;
  if (!enumValue(value.status, ACCEPTANCE_STATUSES) || !enumValue(value.actionabilityCeiling, FEE_ACTIONABILITIES)) return false;
  if (!isRecord(value.acceptedSemanticFields) || !hasExactKeys(value.acceptedSemanticFields, ["category", "likelyEconomicOwner", "likelyContractualController", "actionabilityCeiling", "evidenceProvenance"])) return false;
  if (!nullableEnum(value.acceptedSemanticFields.category, FEE_CATEGORIES)) return false;
  if (!nullableEnum(value.acceptedSemanticFields.likelyEconomicOwner, FEE_PARTIES) || !nullableEnum(value.acceptedSemanticFields.likelyContractualController, FEE_PARTIES)) return false;
  if (!nullableEnum(value.acceptedSemanticFields.actionabilityCeiling, FEE_ACTIONABILITIES) || !nullableEnum(value.acceptedSemanticFields.evidenceProvenance, EVIDENCE_PROVENANCE)) return false;
  if (value.externalSourceRef !== null && !safeReferenceValue(value.externalSourceRef)) return false;
  if (value.externalClaimSupportRef !== null && !CLAIM_SUPPORT_REF.test(stringValue(value.externalClaimSupportRef))) return false;
  return true;
}

function validatePackage5a(value: unknown, result: Record<string, unknown>): boolean {
  if (!isRecord(value) || !hasExactKeys(value, PACKAGE_5A_KEYS)) return false;
  if (value.type !== EVALUATION_PACKAGE_5A_PROJECTION_VERSION || !DIAGNOSTIC_REF.test(stringValue(value.diagnosticRef))) return false;
  if (value.capabilityId !== result.capabilityId || value.executionRef !== result.executionRef) return false;
  if (!enumValue(value.executionState, ["completed", "failed", "timed_out"]) || !enumValue(value.admissionState, ["admitted", "rejected"])) return false;
  if (!enumValue(value.finalCanonicalStatus, ["completed", "failed", "timed_out", "rejected", "safety_blocked"])) return false;
  if (!isRecord(value.stageStates) || !hasExactKeys(value.stageStates, STAGE_STATE_KEYS)) return false;
  if (Object.values(value.stageStates).some((state) => !enumValue(state, ["passed", "failed", "not_observed", "not_applicable"]))) return false;
  if (!closedSetArray(value.reasonCodes, PACKAGE_5A_REASON_CODES) || !closedCodeArray(value.projectionReasonCodes, PROJECTION_REASONS) || !diagnosticRefArray(value.diagnosticRefs)) return false;
  const canonicalAdmissionReasons = (value.reasonCodes as string[]).filter((reason) => reason.startsWith("canonical_admission_"));
  const expectedCanonicalAdmissionReason = result.admissionDisposition === "admitted" ? "canonical_admission_admitted" : "canonical_admission_rejected";
  if (JSON.stringify(canonicalAdmissionReasons) !== JSON.stringify([expectedCanonicalAdmissionReason])) return false;
  const projections = value.projectionReasonCodes as string[];
  const projectionByStage: Partial<Record<(typeof STAGE_STATE_KEYS)[number], readonly string[]>> = {
    sourceQuality: ["artifact_v2_source_quality_failed", "artifact_v2_fingerprint_mismatch", "artifact_v2_locator_mismatch"],
    linkage: ["artifact_v2_research_parentage_invalid"],
    deterministicReconciliation: ["artifact_v2_applicability_failed", "artifact_v2_deterministic_contradiction"],
  };
  const stageReasons: Record<(typeof STAGE_STATE_KEYS)[number], { passed: readonly string[]; failed: readonly string[] }> = {
    responseParse: { passed: ["response_shape_validated"], failed: ["invalid_response_shape"] },
    schemaValidation: { passed: ["schema_validated", "runtime_status_count_consistency_validated"], failed: ["runtime_status_count_consistency_invalid", "unknown_field", "invalid_type", "invalid_policy_version", "invalid_status", "invalid_authority_flag", "invalid_financial_mutation_flag", "invalid_absence_proof", "invalid_limitation_code", "invalid_reason_code", "invalid_suggestion", "incomplete_review_population", "duplicate_or_conflicting_result"] },
    evidenceCitation: { passed: ["evidence_references_validated"], failed: ["broken_evidence_reference"] },
    sourceQuality: { passed: ["source_quality_validated"], failed: [] },
    linkage: { passed: ["linkage_validated"], failed: ["broken_fee_row_reference"] },
    deterministicReconciliation: { passed: ["deterministic_reconciliation_validated"], failed: ["broken_classification_candidate_reference"] },
    privacySafety: { passed: ["privacy_safety_validated"], failed: ["forbidden_content", "invalid_provider_details_flag", "whole_statement_fee_intelligence_safety_blocked"] },
  };
  for (const key of STAGE_STATE_KEYS) {
    const state = value.stageStates[key];
    const rules = stageReasons[key];
    const hasPassed = rules.passed.some((reason) => (value.reasonCodes as string[]).includes(reason));
    const hasFailed = rules.failed.some((reason) => (value.reasonCodes as string[]).includes(reason))
      || (projectionByStage[key] ?? []).some((reason) => projections.includes(reason));
    if (state === "passed" ? !hasPassed || hasFailed : state === "failed" ? hasPassed || !hasFailed : hasPassed || hasFailed) return false;
  }
  for (const [stage, reasons] of Object.entries(projectionByStage) as Array<[(typeof STAGE_STATE_KEYS)[number], readonly string[]]>) {
    const present = reasons.filter((reason) => projections.includes(reason));
    if (value.stageStates[stage] === "failed" ? present.length === 0 : present.length > 0) return false;
  }
  if (value.rawPromptPersisted !== false || value.rawResponsePersisted !== false || value.rawStatementTextPersisted !== false || value.providerDetailsPersisted !== false) return false;
  if (value.executionState !== (result.admission as Record<string, unknown>)?.executionStatus) return false;
  if (value.executionState === "failed" && value.finalCanonicalStatus !== "failed") return false;
  if (value.executionState === "timed_out" && value.finalCanonicalStatus !== "timed_out") return false;
  if (result.admissionDisposition === "admitted") {
    if (value.executionState !== "completed" || value.admissionState !== "admitted" || value.finalCanonicalStatus !== "completed") return false;
    for (const stage of STAGE_STATE_KEYS) {
      if (stage !== "sourceQuality" && value.stageStates[stage] !== "passed") return false;
    }
    if (!enumValue(value.stageStates.sourceQuality, ["passed", "not_applicable"])) return false;
  }
  if (result.admissionDisposition === "rejected") {
    if (value.admissionState !== "rejected" || !["rejected", "failed", "timed_out"].includes(value.finalCanonicalStatus as string)) return false;
    if (value.finalCanonicalStatus === "rejected" && value.executionState !== "completed") return false;
  }
  if (result.admissionDisposition === "safety_blocked" && (value.executionState !== "completed" || value.admissionState !== "rejected" || value.finalCanonicalStatus !== "safety_blocked" || value.stageStates.privacySafety !== "failed")) return false;
  return true;
}

function validateProjectionLinkage(result: Record<string, any>): boolean {
  const proof = result.researchEvidence as Record<string, any>;
  const references = result.canonicalReferenceProof as Record<string, any>;
  const admission = result.admission as Record<string, any>;
  const supportRefs = new Set((proof.claimSupports as Array<Record<string, unknown>>).map((item) => stringValue(item.claimSupportRef)));
  const supportDecisionRefs = new Set((proof.claimSupports as Array<Record<string, unknown>>).map((item) => stringValue(item.claimSupportDecisionRef)));
  const candidateRefs = new Set((proof.candidates as Array<Record<string, unknown>>).map((item) => stringValue(item.candidateRef)));
  const attemptRefs = new Set((proof.attempts as Array<Record<string, unknown>>).map((item) => stringValue(item.researchAttemptRef)));
  if (!setEquals(candidateRefs, new Set(references.candidateRefs)) || !setEquals(supportRefs, new Set(references.claimSupportRefs)) || !setEquals(supportDecisionRefs, new Set(references.claimSupportDecisionRefs))) return false;
  const canonicalFeeRows = new Set<string>(references.canonicalFeeRowRefs);
  const canonicalEvidence = new Set<string>(references.canonicalEvidenceRefs);
  const rowEvidence = new Map<string, Set<string>>((references.canonicalFeeRowEvidencePopulation as Array<Record<string, any>>).map((row) => [row.feeRowRef, new Set(row.evidenceRefs)]));
  const approvedFacts = new Set<string>(references.approvedFactRefs);
  const allowedDiagnosticRefs = new Set<string>([
    ...supportRefs, ...candidateRefs, ...attemptRefs, ...canonicalFeeRows, ...canonicalEvidence, ...approvedFacts,
    references.canonicalReferenceProjectionHash, references.preparedSanitizedPacketContentHash,
  ]);
  for (const item of proof.attempts as Array<Record<string, unknown>>) {
    allowedDiagnosticRefs.add(stringValue(item.questionRef));
    if (!canonicalFeeRows.has(stringValue(item.feeRowRef))) return false;
  }
  for (const item of proof.candidates as Array<Record<string, unknown>>) if (!canonicalFeeRows.has(stringValue(item.feeRowRef))) return false;
  for (const item of proof.claimSupports as Array<Record<string, unknown>>) if (!canonicalFeeRows.has(stringValue(item.feeRowRef))) return false;
  const supportByRef = new Map((proof.claimSupports as Array<Record<string, any>>).map((item) => [item.claimSupportRef, item]));
  const candidateByRef = new Map((proof.candidates as Array<Record<string, any>>).map((item) => [item.candidateRef, item]));
  const selectedCandidates = new Set<string>();
  for (const ref of admission.acceptedClaimSupportRefs as string[]) {
    const support = supportByRef.get(ref);
    if (!support) return false;
    if (support.origin === "runtime_research") selectedCandidates.add(support.candidateRef);
  }
  const output = result.packageF?.output as Record<string, any> | undefined;
  if (output) {
    const coverage = output.coverageProof as Record<string, string[]>;
    if (!setEquals(new Set(coverage.expectedFeeRowRefs), canonicalFeeRows) || !setEquals(new Set(coverage.reviewedFeeRowRefs), canonicalFeeRows)) return false;
    const interpretationByRow = uniqueMapByFeeRow(output.rowInterpretations, canonicalFeeRows);
    const acceptanceByRow = uniqueMapByFeeRow(output.acceptanceRecords, canonicalFeeRows);
    if (!interpretationByRow || !acceptanceByRow || interpretationByRow.size !== canonicalFeeRows.size || acceptanceByRow.size !== canonicalFeeRows.size) return false;
    if (!(output.factRefs as string[]).every((ref) => approvedFacts.has(ref))) return false;
    const usedEvidence = new Set<string>();
    for (const row of output.rowInterpretations as Array<Record<string, any>>) {
      const permitted = rowEvidence.get(row.feeRowRef);
      if (!permitted || !row.evidenceRefs.every((ref: string) => permitted.has(ref))) return false;
      for (const ref of row.evidenceRefs) usedEvidence.add(ref);
    }
    for (const row of output.acceptanceRecords as Array<Record<string, any>>) {
      const permitted = rowEvidence.get(row.feeRowRef);
      if (!permitted || !row.evidenceRefs.every((ref: string) => permitted.has(ref))) return false;
    }
    if (!setEquals(new Set(output.evidenceRefs), usedEvidence)) return false;
    if (![...usedEvidence].every((ref) => canonicalEvidence.has(ref))) return false;
    if (!validateInterpretationAcceptanceReconciliation(
      interpretationByRow,
      acceptanceByRow,
      supportByRef,
      references,
      new Set(admission.acceptedClaimSupportRefs),
      new Set(admission.rejectedClaimSupportRefs),
    )) return false;
    const records = output.acceptanceRecords as Array<Record<string, unknown>>;
    const accepted = records.filter((row) => row.status === "accepted" || row.status === "accepted_with_conditions").length;
    const needsVerification = records.filter((row) => row.status === "needs_verification").length;
    const humanReview = records.filter((row) => row.status === "human_review").length;
    const rejected = records.filter((row) => row.status === "rejected").length;
    if (admission.safeCounts.reviewedFeeRowCount !== coverage.reviewedFeeRowRefs.length
      || admission.safeCounts.acceptedRecordCount !== accepted
      || admission.safeCounts.needsVerificationRecordCount !== needsVerification
      || admission.safeCounts.humanReviewRecordCount !== humanReview
      || admission.safeCounts.rejectedRecordCount !== rejected) return false;
    for (const candidateRef of selectedCandidates) if (!isCompleteSelectedCandidate(candidateByRef.get(candidateRef))) return false;
    const usesExternalEvidence = (output.rowInterpretations as Array<Record<string, any>>).some((row) => row.evidenceProvenance === "runtime_verified_documentation" || row.evidenceProvenance === "approved_external_documentation");
    const sourceQuality = result.package5a.stageStates.sourceQuality;
    const sourceQualityReason = (result.package5a.reasonCodes as string[]).includes("source_quality_validated");
    if (usesExternalEvidence ? sourceQuality !== "passed" || !sourceQualityReason : sourceQuality !== "not_applicable" || sourceQualityReason) return false;
  } else if (admission.safeCounts.reviewedFeeRowCount !== 0
    || admission.safeCounts.acceptedRecordCount !== 0
    || admission.safeCounts.needsVerificationRecordCount !== 0
    || admission.safeCounts.humanReviewRecordCount !== 0
    || admission.safeCounts.rejectedRecordCount !== 0) return false;
  return (result.package5a.diagnosticRefs as string[]).every((ref) => allowedDiagnosticRefs.has(ref));
}

function uniqueMapByFeeRow(rows: unknown, canonicalRows: Set<string>): Map<string, Record<string, any>> | null {
  if (!Array.isArray(rows)) return null;
  const output = new Map<string, Record<string, any>>();
  for (const row of rows) {
    if (!isRecord(row) || !canonicalRows.has(stringValue(row.feeRowRef)) || output.has(row.feeRowRef as string)) return null;
    output.set(row.feeRowRef as string, row);
  }
  return output;
}

function validateInterpretationAcceptanceReconciliation(
  interpretations: Map<string, Record<string, any>>,
  acceptances: Map<string, Record<string, any>>,
  supports: Map<string, Record<string, any>>,
  references: Record<string, any>,
  acceptedSupportRefs: Set<string>,
  rejectedSupportRefs: Set<string>,
): boolean {
  const rowPopulation = new Map<string, Record<string, any>>((references.canonicalFeeRowEvidencePopulation as Array<Record<string, any>>).map((row) => [row.feeRowRef, row]));
  for (const [feeRowRef, interpretation] of interpretations) {
    const acceptance = acceptances.get(feeRowRef);
    if (!acceptance || acceptance.immutableFeeRowRef !== feeRowRef) return false;
    for (const field of ["evidenceRefs", "conflicts"] as const) if (JSON.stringify(interpretation[field]) !== JSON.stringify(acceptance[field])) return false;
    if (interpretation.externalSourceRef !== acceptance.externalSourceRef || interpretation.externalClaimSupportRef !== acceptance.externalClaimSupportRef) return false;
    const support = resolveInterpretationSupport(interpretation, supports);
    const external = interpretation.evidenceProvenance === "runtime_verified_documentation" || interpretation.evidenceProvenance === "approved_external_documentation";
    if (external && !support) return false;
    if (!external && (interpretation.externalSourceRef !== null || interpretation.externalClaimSupportRef !== null)) return false;
    const expectedStatus = canonicalAcceptanceStatus(interpretation, support);
    const capped = cappedCanonicalActionability(interpretation);
    if (acceptance.status !== expectedStatus || acceptance.actionabilityCeiling !== capped) return false;
    const accepted = expectedStatus === "accepted" || expectedStatus === "accepted_with_conditions";
    if (support) {
      const supportRef = stringValue(support.claimSupportRef);
      if (accepted ? !acceptedSupportRefs.has(supportRef) : !acceptedSupportRefs.has(supportRef) && !rejectedSupportRefs.has(supportRef)) return false;
    }
    const expectedFields = accepted
      ? { category: interpretation.proposedCategory, likelyEconomicOwner: interpretation.likelyEconomicOwner, likelyContractualController: interpretation.likelyContractualController, actionabilityCeiling: capped, evidenceProvenance: interpretation.evidenceProvenance }
      : { category: null, likelyEconomicOwner: null, likelyContractualController: null, actionabilityCeiling: null, evidenceProvenance: null };
    if (JSON.stringify(acceptance.acceptedSemanticFields) !== JSON.stringify(expectedFields)) return false;
    const expectedReasons = canonicalAcceptanceReasons(interpretation, expectedStatus, rowPopulation.get(feeRowRef)?.contributesToUniqueTotal !== false);
    if (JSON.stringify(acceptance.reasonCodes) !== JSON.stringify(expectedReasons)) return false;
  }
  return true;
}

function resolveInterpretationSupport(
  interpretation: Record<string, any>,
  supports: Map<string, Record<string, any>>,
): Record<string, any> | null {
  const origin = interpretation.evidenceProvenance === "runtime_verified_documentation"
    ? "runtime_research"
    : interpretation.evidenceProvenance === "approved_external_documentation"
      ? "approved_registry"
      : null;
  if (!origin) return null;
  if (interpretation.externalClaimSupportRef !== null) {
    const support = supports.get(interpretation.externalClaimSupportRef);
    if (!support || support.origin !== origin || support.feeRowRef !== interpretation.feeRowRef) return null;
    const sourceRefs = origin === "runtime_research"
      ? [support.runtimeSourceRef, support.runtimeClaimRef]
      : [support.approvedSourceRef, support.approvedClaimRef];
    return interpretation.externalSourceRef === null || sourceRefs.includes(interpretation.externalSourceRef) ? support : null;
  }
  if (interpretation.externalSourceRef === null) return null;
  const matches = [...supports.values()].filter((support) => support.origin === origin
    && support.feeRowRef === interpretation.feeRowRef
    && (origin === "runtime_research"
      ? support.runtimeSourceRef === interpretation.externalSourceRef || support.runtimeClaimRef === interpretation.externalSourceRef
      : support.approvedSourceRef === interpretation.externalSourceRef || support.approvedClaimRef === interpretation.externalSourceRef));
  return matches.length === 1 ? matches[0]! : null;
}

function canonicalAcceptanceStatus(
  interpretation: Record<string, any>,
  support: Record<string, any> | null,
): (typeof ACCEPTANCE_STATUSES)[number] {
  if (interpretation.recommendedDisposition === "human_review") return "human_review";
  if (interpretation.recommendedDisposition === "conflicting_evidence" || interpretation.conflicts.length > 0) return "needs_verification";
  if (interpretation.recommendedDisposition === "insufficient_evidence" || interpretation.missingEvidence.length > 0) return "needs_verification";
  if (interpretation.evidenceProvenance === "approved_external_documentation" || interpretation.evidenceProvenance === "runtime_verified_documentation") {
    if (!support) return "rejected";
    if (interpretation.evidenceProvenance === "runtime_verified_documentation" && interpretation.externalClaimSupportRef === null) return "rejected";
    const reconciliation = canonicalEvidenceReconciliation(interpretation, support);
    if (reconciliation === "contradiction") return "rejected";
    if (reconciliation === "needs_verification") return "needs_verification";
    if (reconciliation === "compatible_with_conditions") return "accepted_with_conditions";
  }
  if (interpretation.evidenceProvenance === "merchant_evidence") return "rejected";
  if (interpretation.evidenceProvenance === "industry_inference" || interpretation.confidence !== "high") return "accepted_with_conditions";
  return "accepted";
}

function canonicalEvidenceReconciliation(
  interpretation: Record<string, any>,
  support: Record<string, any>,
): "compatible" | "compatible_with_conditions" | "needs_verification" | "contradiction" {
  const claim = support.structuredClaim as Record<string, any>;
  const applicability = support.applicability as Record<string, any>;
  if (support.contradictionCodes.length > 0 || support.semanticDecision === "contradicts") return "contradiction";
  const evidenceDecision = stringValue(support.evidenceDecision);
  if (["unsupported", "source_unavailable", "source_inapplicable"].includes(evidenceDecision)) return "contradiction";
  if (!VERIFIED_EVIDENCE_DECISIONS.has(evidenceDecision) || support.semanticDecision !== "supports") return "needs_verification";
  if (!applicability.processorOrNetwork || applicability.statementPeriod === false || applicability.jurisdiction === false || applicability.transactionContext === false) return "needs_verification";
  if (support.hasStructuredClaimExclusions || support.hasSupportExclusions) return "needs_verification";
  if (claim.proposedCategory && claim.proposedCategory !== interpretation.proposedCategory) return "contradiction";
  if (claim.likelyEconomicOwner && claim.likelyEconomicOwner !== interpretation.likelyEconomicOwner) return "contradiction";
  if (claim.likelyContractualController && claim.likelyContractualController !== interpretation.likelyContractualController) return "contradiction";
  if (actionabilityRank(interpActionability(interpretation)) > actionabilityRank(claim.actionabilityCeiling)) return "needs_verification";
  if (actionabilityRank(interpActionability(interpretation)) > actionabilityRank(support.finalActionabilityCeiling)) return "needs_verification";
  if (confidenceRank(interpretation.confidence) > confidenceRank(claim.maximumConfidence)) return "needs_verification";
  return support.hasConditions ? "compatible_with_conditions" : "compatible";
}

function canonicalAcceptanceReasons(
  interpretation: Record<string, any>,
  status: (typeof ACCEPTANCE_STATUSES)[number],
  contributesToUniqueTotal: boolean,
): string[] {
  const reasons = [`whole_statement_fee_intelligence_${status}`];
  if (interpretation.evidenceProvenance === "industry_inference") reasons.push("whole_statement_fee_intelligence_industry_inference_limited");
  if (interpretation.evidenceProvenance === "approved_external_documentation") reasons.push("whole_statement_fee_intelligence_approved_documentation");
  if (interpretation.evidenceProvenance === "runtime_verified_documentation") reasons.push("whole_statement_fee_intelligence_runtime_verified_documentation");
  if (interpretation.evidenceProvenance === "merchant_evidence") reasons.push("whole_statement_fee_intelligence_merchant_evidence_unavailable");
  if (interpretation.conflicts.length > 0) reasons.push("whole_statement_fee_intelligence_conflict_preserved");
  if (interpretation.missingEvidence.length > 0) reasons.push("whole_statement_fee_intelligence_missing_evidence_preserved");
  if (!contributesToUniqueTotal) reasons.push("whole_statement_fee_intelligence_noncontributing_row_preserved");
  return [...new Set(reasons)].sort();
}

function cappedCanonicalActionability(interpretation: Record<string, any>): string {
  if (interpretation.evidenceProvenance === "industry_inference" && interpActionability(interpretation) === "potentially_actionable") return "verify_only";
  if (interpretation.confidence === "low" && interpActionability(interpretation) === "potentially_actionable") return "verify_only";
  return interpActionability(interpretation);
}

function interpActionability(interpretation: Record<string, any>): string {
  return stringValue(interpretation.proposedActionabilityCeiling);
}

function validateCanonicalReferenceProof(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, REFERENCE_PROOF_KEYS) || value.type !== EVALUATION_CANONICAL_REFERENCE_PROOF_VERSION) return false;
  if (!Array.isArray(value.canonicalFeeRowEvidencePopulation) || !isSorted(value.canonicalFeeRowEvidencePopulation.map((row) => isRecord(row) ? stringValue(row.feeRowRef) : ""))) return false;
  const rowRefs = new Set<string>();
  const evidenceUnion = new Set<string>();
  for (const row of value.canonicalFeeRowEvidencePopulation) {
    if (!isRecord(row) || !hasExactKeys(row, ROW_EVIDENCE_KEYS) || !FEE_ROW_REF.test(stringValue(row.feeRowRef)) || rowRefs.has(row.feeRowRef as string)) return false;
    if (!safeRefArray(row.evidenceRefs, SAFE_REFERENCE) || typeof row.contributesToUniqueTotal !== "boolean") return false;
    rowRefs.add(row.feeRowRef as string);
    for (const ref of row.evidenceRefs as string[]) evidenceUnion.add(ref);
  }
  return safeRefArray(value.canonicalFeeRowRefs, FEE_ROW_REF)
    && safeRefArray(value.canonicalEvidenceRefs, SAFE_REFERENCE)
    && setEquals(rowRefs, new Set(value.canonicalFeeRowRefs as string[]))
    && setEquals(evidenceUnion, new Set(value.canonicalEvidenceRefs as string[]))
    && canonicalFactRefArray(value.approvedFactRefs)
    && safeRefArray(value.candidateRefs, CANDIDATE_REF)
    && safeRefArray(value.claimSupportRefs, CLAIM_SUPPORT_REF)
    && safeRefArray(value.claimSupportDecisionRefs, /^claim_support_decision_[a-f0-9]{64}$/)
    && validateExpectedResearchQuestionProjection(value.expectedResearchQuestions)
    && SHA256.test(stringValue(value.canonicalReferenceProjectionHash))
    && SHA256.test(stringValue(value.preparedSanitizedPacketContentHash))
    && SHA256.test(stringValue(value.wholeStatementPacketContentHash))
    && value.canonicalReferenceProjectionHash === calculateEvaluationCanonicalReferenceProjectionHash({
      canonicalFeeRowRefs: value.canonicalFeeRowRefs,
      canonicalEvidenceRefs: value.canonicalEvidenceRefs,
      canonicalFeeRowEvidencePopulation: value.canonicalFeeRowEvidencePopulation,
      approvedFactRefs: value.approvedFactRefs,
      candidateRefs: value.candidateRefs,
      claimSupportRefs: value.claimSupportRefs,
      claimSupportDecisionRefs: value.claimSupportDecisionRefs,
      expectedResearchQuestions: value.expectedResearchQuestions,
      preparedSanitizedPacketContentHash: value.preparedSanitizedPacketContentHash,
      wholeStatementPacketContentHash: value.wholeStatementPacketContentHash,
    });
}

export function calculateEvaluationCanonicalReferenceProjectionHash(value: {
  canonicalFeeRowRefs: string[];
  canonicalEvidenceRefs: string[];
  canonicalFeeRowEvidencePopulation: Array<{ feeRowRef: string; evidenceRefs: string[]; contributesToUniqueTotal: boolean }>;
  approvedFactRefs: string[];
  candidateRefs: string[];
  claimSupportRefs: string[];
  claimSupportDecisionRefs: string[];
  expectedResearchQuestions: EvaluationExpectedResearchQuestionProjection;
  preparedSanitizedPacketContentHash: string;
  wholeStatementPacketContentHash: string;
}): string {
  return sha256Canonical({
    canonicalFeeRowRefs: value.canonicalFeeRowRefs,
    canonicalEvidenceRefs: value.canonicalEvidenceRefs,
    canonicalFeeRowEvidencePopulation: value.canonicalFeeRowEvidencePopulation,
    approvedFactRefs: value.approvedFactRefs,
    candidateRefs: value.candidateRefs,
    claimSupportRefs: value.claimSupportRefs,
    claimSupportDecisionRefs: value.claimSupportDecisionRefs,
    expectedResearchQuestions: value.expectedResearchQuestions,
    preparedSanitizedPacketContentHash: value.preparedSanitizedPacketContentHash,
    wholeStatementPacketContentHash: value.wholeStatementPacketContentHash,
  });
}

function validateExpectedResearchQuestionProjection(value: unknown): value is EvaluationExpectedResearchQuestionProjection {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "questions", "limits"]) || value.type !== EVALUATION_EXPECTED_RESEARCH_QUESTION_PROJECTION_VERSION) return false;
  if (!Array.isArray(value.questions) || !validateResearchLimits(value.limits)) return false;
  const refs = new Set<string>();
  for (const [index, question] of value.questions.entries()) {
    if (!isRecord(question) || !hasExactKeys(question, ["questionRef", "feeRowRef", "questionOrdinal", "sanitizedQuestionCategory", "triggerReason"])) return false;
    if (!QUESTION_REF.test(stringValue(question.questionRef)) || refs.has(question.questionRef as string) || !FEE_ROW_REF.test(stringValue(question.feeRowRef))) return false;
    if (question.questionOrdinal !== index + 1 || !enumValue(question.sanitizedQuestionCategory, QUESTION_CATEGORIES) || !enumValue(question.triggerReason, QUESTION_TRIGGER_REASONS)) return false;
    refs.add(question.questionRef as string);
  }
  return true;
}

function validatePreparedResearchQuestion(value: unknown): value is PreparedResearchQuestion {
  if (!isRecord(value) || !hasExactKeys(value, PREPARED_RESEARCH_QUESTION_KEYS)) return false;
  if (!FEE_ROW_REF.test(stringValue(value.feeRowRef))
    || !enumValue(value.sanitizedQuestionCategory, QUESTION_CATEGORIES)
    || !enumValue(value.triggerReason, QUESTION_TRIGGER_REASONS)) return false;
  if (value.processorOrNetwork !== null && typeof value.processorOrNetwork !== "string") return false;
  if (typeof value.feeLabel !== "string" || (value.statementSection !== null && typeof value.statementSection !== "string")) return false;
  if (value.statementPeriodYear !== null && typeof value.statementPeriodYear !== "string") return false;
  if (!nullableEnum(value.deterministicCategory, FEE_CATEGORIES)
    || !nullableEnum(value.deterministicEconomicOwner, FEE_PARTIES)
    || !nullableEnum(value.deterministicContractualController, FEE_PARTIES)) return false;
  return enumValue(value.deterministicActionabilityCeiling, FEE_ACTIONABILITIES)
    && enumValue(value.deterministicConfidence, ["high", "medium", "low"])
    && typeof value.semanticQuestion === "string";
}

function validateResearchLimits(value: unknown): value is EvaluationExpectedResearchQuestionProjection["limits"] {
  if (!isRecord(value) || !hasExactKeys(value, ["policyVersion", "maxSearchCalls", "maxRetrievalCandidates", "totalDeadlineMs", "maxResultCandidatesPerSearch"])) return false;
  if (value.policyVersion !== "fee_knowledge_research_policy_v1") return false;
  return [value.maxSearchCalls, value.maxRetrievalCandidates, value.maxResultCandidatesPerSearch]
    .every((limit) => Number.isInteger(limit) && Number(limit) >= 0)
    && Number.isInteger(value.totalDeadlineMs)
    && Number(value.totalDeadlineMs) > 0;
}

function validateResearchProof(
  value: unknown,
  admission: Record<string, unknown>,
  disposition: EvaluationAdmissionDisposition,
  expectedResearchQuestions: EvaluationExpectedResearchQuestionProjection,
): boolean {
  if (!isRecord(value) || !hasExactKeys(value, RESEARCH_KEYS) || value.type !== EVALUATION_RESEARCH_EVIDENCE_PROOF_VERSION) return false;
  if (!validateExpectedResearchQuestionProjection(expectedResearchQuestions)) return false;
  if (!Array.isArray(value.attempts) || !Array.isArray(value.candidates) || !Array.isArray(value.claimSupports)) return false;
  if (!isSorted(value.attempts.map((item) => isRecord(item) ? stringValue(item.researchAttemptRef) : ""))) return false;
  if (!isSorted(value.candidates.map((item) => isRecord(item) ? stringValue(item.candidateRef) : ""))) return false;
  if (!isSorted(value.claimSupports.map((item) => isRecord(item) ? stringValue(item.claimSupportRef) : ""))) return false;
  const attempts = new Map<string, Record<string, unknown>>();
  const candidates = new Map<string, Record<string, unknown>>();
  const supports = new Map<string, Record<string, unknown>>();
  const questions = new Set<string>();
  const expectedQuestions = new Map(expectedResearchQuestions.questions.map((question) => [question.questionRef, question]));
  const candidateParents = new Map<string, string>();
  const supportParents = new Map<string, string>();
  let retainedCandidateCount = 0;
  for (const item of value.attempts) {
    if (!isRecord(item) || !hasExactKeys(item, ATTEMPT_KEYS) || !RESEARCH_ATTEMPT_REF.test(stringValue(item.researchAttemptRef)) || !QUESTION_REF.test(stringValue(item.questionRef)) || !FEE_ROW_REF.test(stringValue(item.feeRowRef)) || !enumValue(item.status, ATTEMPT_STATUSES) || !Number.isInteger(item.resultCount) || item.resultCount < 0 || !safeRefArray(item.candidateRefs, CANDIDATE_REF) || attempts.has(item.researchAttemptRef as string) || questions.has(item.questionRef as string)) return false;
    const expectedQuestion = expectedQuestions.get(item.questionRef as string);
    if (!expectedQuestion
      || item.feeRowRef !== expectedQuestion.feeRowRef
      || item.questionOrdinal !== expectedQuestion.questionOrdinal
      || item.sanitizedQuestionCategory !== expectedQuestion.sanitizedQuestionCategory
      || item.triggerReason !== expectedQuestion.triggerReason) return false;
    const allowedReasons = ATTEMPT_REASON_BY_STATUS[item.status as keyof typeof ATTEMPT_REASON_BY_STATUS] as readonly string[];
    if (item.resultCount !== item.candidateRefs.length || !safeCodeArray(item.reasonCodes) || item.reasonCodes.length !== 1 || !allowedReasons.includes(item.reasonCodes[0])) return false;
    const candidateRetentionAllowed = ["completed", "failed", "timed_out", "safety_blocked"].includes(item.status as string);
    if (!candidateRetentionAllowed && item.resultCount !== 0) return false;
    if (expectedQuestion.questionOrdinal > expectedResearchQuestions.limits.maxSearchCalls) {
      if (item.status !== "budget_exhausted") return false;
    } else if (item.status === "budget_exhausted") return false;
    if (candidateRetentionAllowed) {
      if (item.resultCount > expectedResearchQuestions.limits.maxResultCandidatesPerSearch) return false;
      retainedCandidateCount += item.resultCount as number;
    }
    if (disposition === "admitted" && item.status !== "completed") return false;
    for (const ref of item.candidateRefs as string[]) if (candidateParents.has(ref)) return false; else candidateParents.set(ref, item.researchAttemptRef as string);
    questions.add(item.questionRef as string);
    attempts.set(item.researchAttemptRef as string, item);
  }
  if (retainedCandidateCount > expectedResearchQuestions.limits.maxRetrievalCandidates) return false;
  if (!setEquals(questions, new Set(expectedQuestions.keys()))) return false;
  for (const item of value.candidates) {
    if (!isRecord(item) || !hasExactKeys(item, CANDIDATE_KEYS) || !CANDIDATE_REF.test(stringValue(item.candidateRef)) || !RESEARCH_ATTEMPT_REF.test(stringValue(item.researchAttemptRef)) || !QUESTION_REF.test(stringValue(item.questionRef)) || !FEE_ROW_REF.test(stringValue(item.feeRowRef)) || !enumValue(item.verificationStatus, CANDIDATE_STATUSES) || !enumValue(item.retrievalStatus, RETRIEVAL_STATUSES) || !enumValue(item.semanticVerificationStatus, SEMANTIC_STATUSES) || !safeRefArray(item.claimSupportRefs, CLAIM_SUPPORT_REF) || !closedSetArray(item.reasonCodes, CANDIDATE_REASON_CODES) || (item.reasonCodes as string[]).length === 0 || candidates.has(item.candidateRef as string)) return false;
    if (!validateCandidateState(item)) return false;
    const parent = attempts.get(item.researchAttemptRef as string);
    if (!parent || candidateParents.get(item.candidateRef as string) !== item.researchAttemptRef || parent.questionRef !== item.questionRef || parent.feeRowRef !== item.feeRowRef) return false;
    for (const ref of item.claimSupportRefs as string[]) if (supportParents.has(ref)) return false; else supportParents.set(ref, item.candidateRef as string);
    candidates.set(item.candidateRef as string, item);
  }
  for (const item of value.claimSupports) {
    if (!validateClaimSupport(item) || supports.has(item.claimSupportRef as string)) return false;
    if (item.origin === "runtime_research") {
      const parent = candidates.get(item.candidateRef as string);
      if (!parent || supportParents.get(item.claimSupportRef as string) !== item.candidateRef || parent.researchAttemptRef !== item.researchAttemptRef || parent.questionRef !== item.questionRef || parent.feeRowRef !== item.feeRowRef) return false;
    } else if (supportParents.has(item.claimSupportRef as string)) return false;
    supports.set(item.claimSupportRef as string, item);
  }
  for (const attempt of attempts.values()) if ((attempt.candidateRefs as string[]).some((ref) => !candidates.has(ref))) return false;
  for (const candidate of candidates.values()) if ((candidate.claimSupportRefs as string[]).some((ref) => !supports.has(ref))) return false;
  for (const attempt of attempts.values()) {
    if (attempt.status !== "safety_blocked") continue;
    for (const candidateRef of attempt.candidateRefs as string[]) {
      const candidate = candidates.get(candidateRef);
      if (!candidate
        || candidate.verificationStatus !== "safety_blocked"
        || (candidate.retrievalStatus !== "safety_blocked" && candidate.semanticVerificationStatus !== "safety_blocked")) return false;
    }
  }
  if (disposition === "admitted") {
    for (const attempt of attempts.values()) {
      for (const candidateRef of attempt.candidateRefs as string[]) {
        if (!isFullyProcessedCandidateForAdmission(candidates.get(candidateRef), supports)) return false;
      }
    }
  }
  const accepted = admission.acceptedClaimSupportRefs as string[];
  const rejected = admission.rejectedClaimSupportRefs as string[];
  if (!setEquals(new Set([...accepted, ...rejected]), new Set(supports.keys()))) return false;
  if (accepted.some((ref) => supports.get(ref)?.disposition !== "accepted") || rejected.some((ref) => supports.get(ref)?.disposition !== "rejected")) return false;
  const acceptedSet = new Set(accepted);
  for (const attempt of attempts.values()) {
    if (attempt.status !== "safety_blocked") continue;
    for (const candidateRef of attempt.candidateRefs as string[]) {
      if ((candidates.get(candidateRef)!.claimSupportRefs as string[]).some((ref) => acceptedSet.has(ref))) return false;
    }
  }
  for (const ref of accepted) {
    const support = supports.get(ref);
    if (!support || !isAcceptedSupport(support)) return false;
    if (support.origin === "runtime_research" && !isCompleteSelectedCandidate(candidates.get(support.candidateRef as string))) return false;
  }
  if (!setEquals(new Set(admission.researchAttemptRefs as string[]), new Set(attempts.keys()))) return false;
  const counts = admission.safeCounts as Record<string, number>;
  if (counts.researchAttemptCount !== attempts.size || counts.evidenceCandidateCount !== candidates.size || counts.claimSupportCount !== supports.size) return false;
  return true;
}

function validateClaimSupport(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, SUPPORT_KEYS)) return false;
  if (!CLAIM_SUPPORT_REF.test(stringValue(value.claimSupportRef)) || !enumValue(value.origin, ["runtime_research", "approved_registry"]) || !FEE_ROW_REF.test(stringValue(value.feeRowRef))) return false;
  if (value.origin === "runtime_research") {
    if (!RUNTIME_SOURCE_REF.test(stringValue(value.runtimeSourceRef)) || !RUNTIME_CLAIM_REF.test(stringValue(value.runtimeClaimRef))) return false;
    if (!CANDIDATE_REF.test(stringValue(value.candidateRef)) || !RESEARCH_ATTEMPT_REF.test(stringValue(value.researchAttemptRef)) || !QUESTION_REF.test(stringValue(value.questionRef))) return false;
    if (!SHA256.test(stringValue(value.runtimeDocumentFingerprint))) return false;
    if (value.approvedSourceRef !== null || value.approvedClaimRef !== null || value.approvedRegistryVersionRef !== null || value.approvedSourceLifecycle !== null || value.approvedSourceApplicable !== null || value.approvedRegistryVerificationRef !== null || value.approvedContentFingerprint !== null || value.approvedRegistryProofLevel !== null || value.approvedRegistryScopeBasis !== null) return false;
  } else {
    if (value.runtimeSourceRef !== null || value.runtimeClaimRef !== null || value.runtimeDocumentFingerprint !== null) return false;
    if (value.candidateRef !== null || value.researchAttemptRef !== null || value.questionRef !== null) return false;
    if (!safeReferenceValue(value.approvedSourceRef) || !safeReferenceValue(value.approvedClaimRef) || !safeReferenceValue(value.approvedRegistryVersionRef)) return false;
    if (!enumValue(value.approvedSourceLifecycle, ["active", "expired", "superseded", "revoked", "contradicted"]) || typeof value.approvedSourceApplicable !== "boolean") return false;
    if (!REGISTRY_VERIFICATION_REF.test(stringValue(value.approvedRegistryVerificationRef))) return false;
    if (value.approvedContentFingerprint !== null && !SHA256.test(stringValue(value.approvedContentFingerprint))) return false;
    if (!enumValue(value.approvedRegistryProofLevel, ["verification_reference_only", "content_fingerprint_verified"])) return false;
    if (!enumValue(value.approvedRegistryScopeBasis, ["exact_processor_or_network", "unrestricted_broader_official", "processor_or_network_mismatch"])) return false;
    if (value.approvedRegistryProofLevel === "verification_reference_only" && value.approvedContentFingerprint !== null) return false;
    if (value.approvedRegistryProofLevel === "content_fingerprint_verified" && value.approvedContentFingerprint === null) return false;
  }
  if (!LOCATOR_TEXT_HASH.test(stringValue(value.locatorTextHash))) return false;
  if (!isRecord(value.structuredClaim) || !hasExactKeys(value.structuredClaim, CLAIM_KEYS)) return false;
  const claim = value.structuredClaim;
  if (!enumValue(claim.claimKind, ["classification", "published_rule", "merchant_application", "unavailable", "unsupported"])) return false;
  if (!nullableEnum(claim.proposedCategory, FEE_CATEGORIES)) return false;
  for (const key of ["likelyEconomicOwner", "likelyContractualController"] as const) if (!nullableEnum(claim[key], FEE_PARTIES)) return false;
  if (!enumValue(claim.maximumConfidence, ["high", "medium", "low"]) || !enumValue(claim.actionabilityCeiling, FEE_ACTIONABILITIES) || !enumValue(claim.applicationBasis, ["not_evaluated", "statement_basis_matches", "statement_basis_mismatch", "not_applicable"])) return false;
  if (!isRecord(value.applicability) || !hasExactKeys(value.applicability, APPLICABILITY_KEYS)) return false;
  if (typeof value.applicability.processorOrNetwork !== "boolean" || typeof value.applicability.statementPeriod !== "boolean") return false;
  if (value.origin === "approved_registry") {
    if (value.approvedRegistryScopeBasis === "exact_processor_or_network" && value.applicability.processorOrNetwork !== true) return false;
    if (value.approvedRegistryScopeBasis !== "exact_processor_or_network" && value.applicability.processorOrNetwork !== false) return false;
    if (value.approvedRegistryScopeBasis === "processor_or_network_mismatch" && value.approvedSourceApplicable !== false) return false;
    if (value.approvedRegistryScopeBasis !== "processor_or_network_mismatch" && value.approvedSourceApplicable !== true) return false;
  }
  if (!nullableBoolean(value.applicability.jurisdiction) || !nullableBoolean(value.applicability.transactionContext)) return false;
  if (!enumValue(value.rateOrAmountComparison, ["not_calculable", "matches_published_rule", "does_not_match_published_rule", "not_evaluated"])) return false;
  if (typeof value.hasDeterministicCalculationProof !== "boolean" || typeof value.hasConditions !== "boolean" || typeof value.hasStructuredClaimExclusions !== "boolean" || typeof value.hasSupportExclusions !== "boolean") return false;
  if (!enumValue(value.finalConfidence, ["high", "medium", "low"]) || !enumValue(value.finalActionabilityCeiling, FEE_ACTIONABILITIES)) return false;
  if (!enumValue(value.semanticDecision, SEMANTIC_DECISIONS) || !enumValue(value.evidenceDecision, EVIDENCE_DECISIONS) || !enumValue(value.disposition, ["accepted", "rejected"])) return false;
  if (!closedCodeArray(value.contradictionCodes, CONTRADICTION_CODES) || !exactEnumArray(value.reasonCodes, [`fee_knowledge_${value.evidenceDecision}`], [...SUPPORT_REASON_CODES])) return false;
  if (!/^claim_support_decision_[a-f0-9]{64}$/.test(stringValue(value.claimSupportDecisionRef)) || value.claimSupportDecisionRef !== calculateEvaluationClaimSupportDecisionRef(value as EvaluationResearchClaimSupportProof)) return false;
  if ((value.disposition === "accepted") !== isAcceptedSupport(value)) return false;
  return true;
}

export function deriveEvaluationApprovedRegistryScopeBasis(input: {
  support: FeeKnowledgeClaimSupportRecord;
  sourcePacket: Pick<FeeKnowledgeSourcePacket, "sourceMatches">;
  registry: ApprovedFeeKnowledgeSourceRegistry;
}): NonNullable<EvaluationResearchClaimSupportProof["approvedRegistryScopeBasis"]> | null {
  const source = input.registry.sources.find((item) => item.sourceId === input.support.sourceId);
  const claim = source?.claims.find((item) => item.claimId === input.support.claimId);
  const match = input.sourcePacket.sourceMatches.find((item) => item.feeRowRef === input.support.feeRowRef
    && item.sourceId === input.support.sourceId
    && item.claimId === input.support.claimId);
  if (!source || !claim || !match) return null;
  if (match.matchBasis === "exact_processor_or_network" && input.support.applicability.processorOrNetwork === true) {
    return "exact_processor_or_network";
  }
  const unrestricted = source.processorIds.length === 0
    && source.networkIds.length === 0
    && claim.processorIds.length === 0
    && claim.networkIds.length === 0;
  if (match.matchBasis === "broader_official" && unrestricted && input.support.applicability.processorOrNetwork === false) {
    return "unrestricted_broader_official";
  }
  return "processor_or_network_mismatch";
}

export function calculateEvaluationClaimSupportDecisionRef(
  value: Omit<EvaluationResearchClaimSupportProof, "claimSupportDecisionRef">,
): string {
  const payload = {
    claimSupportRef: value.claimSupportRef,
    origin: value.origin,
    runtimeSourceRef: value.runtimeSourceRef,
    runtimeClaimRef: value.runtimeClaimRef,
    candidateRef: value.candidateRef,
    researchAttemptRef: value.researchAttemptRef,
    questionRef: value.questionRef,
    approvedSourceRef: value.approvedSourceRef,
    approvedClaimRef: value.approvedClaimRef,
    approvedRegistryVersionRef: value.approvedRegistryVersionRef,
    approvedSourceLifecycle: value.approvedSourceLifecycle,
    approvedSourceApplicable: value.approvedSourceApplicable,
    approvedRegistryVerificationRef: value.approvedRegistryVerificationRef,
    approvedContentFingerprint: value.approvedContentFingerprint,
    approvedRegistryProofLevel: value.approvedRegistryProofLevel,
    approvedRegistryScopeBasis: value.approvedRegistryScopeBasis,
    feeRowRef: value.feeRowRef,
    runtimeDocumentFingerprint: value.runtimeDocumentFingerprint,
    locatorTextHash: value.locatorTextHash,
    structuredClaim: value.structuredClaim,
    semanticDecision: value.semanticDecision,
    applicability: value.applicability,
    rateOrAmountComparison: value.rateOrAmountComparison,
    hasDeterministicCalculationProof: value.hasDeterministicCalculationProof,
    hasConditions: value.hasConditions,
    hasStructuredClaimExclusions: value.hasStructuredClaimExclusions,
    hasSupportExclusions: value.hasSupportExclusions,
    finalConfidence: value.finalConfidence,
    finalActionabilityCeiling: value.finalActionabilityCeiling,
    evidenceDecision: value.evidenceDecision,
    contradictionCodes: value.contradictionCodes,
    reasonCodes: value.reasonCodes,
    disposition: value.disposition,
  };
  return `claim_support_decision_${sha256Canonical(payload).slice("sha256:".length)}`;
}

function validateCandidateState(value: Record<string, unknown>): boolean {
  const reasons = value.reasonCodes as string[];
  const retrieval = value.retrievalStatus as (typeof RETRIEVAL_STATUSES)[number];
  const semantic = value.semanticVerificationStatus as (typeof SEMANTIC_STATUSES)[number];
  const retrievalFamily = RETRIEVAL_REASON_BY_STATUS[retrieval];
  const semanticFamily = SEMANTIC_REASON_BY_STATUS[semantic];
  if (!retrievalFamily.some((reason) => reasons.includes(reason)) || !semanticFamily.some((reason) => reasons.includes(reason))) return false;
  for (const [status, family] of Object.entries(RETRIEVAL_REASON_BY_STATUS)) {
    if (status !== retrieval && family.some((reason) => reasons.includes(reason))) return false;
  }
  for (const [status, family] of Object.entries(SEMANTIC_REASON_BY_STATUS)) {
    if (status !== semantic && family.some((reason) => reasons.includes(reason))) return false;
  }
  if (retrieval !== "retrieved_text" && semantic !== "not_started") return false;
  if (retrieval === "retrieval_succeeded_text_unavailable" && value.verificationStatus !== "source_unavailable") return false;
  if (retrieval === "safety_blocked" && value.verificationStatus !== "safety_blocked") return false;
  if (retrieval !== "retrieved_text" && retrieval !== "retrieval_succeeded_text_unavailable" && retrieval !== "safety_blocked" && value.verificationStatus !== "rejected") return false;
  if (semantic === "safety_blocked" && value.verificationStatus !== "safety_blocked") return false;
  if (value.verificationStatus === "runtime_verified_documentation") {
    return retrieval === "retrieved_text"
      && semantic === "completed"
      && reasons.some((reason) => ["fee_knowledge_verified_classification", "fee_knowledge_verified_rule", "fee_knowledge_verified_application"].includes(reason));
  }
  if (value.verificationStatus === "safety_blocked") return retrieval === "safety_blocked" || semantic === "safety_blocked";
  return true;
}

function isCompleteSelectedCandidate(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value)
    && value!.verificationStatus === "runtime_verified_documentation"
    && value!.retrievalStatus === "retrieved_text"
    && value!.semanticVerificationStatus === "completed";
}

function isFullyProcessedCandidateForAdmission(
  value: Record<string, unknown> | undefined,
  supports: Map<string, Record<string, unknown>>,
): boolean {
  if (!value || value.retrievalStatus !== "retrieved_text" || value.semanticVerificationStatus !== "completed") return false;
  if (!["runtime_verified_documentation", "verified_candidate_limited", "source_inapplicable", "conflicting_evidence"]
    .includes(value.verificationStatus as string)) return false;
  if (!Array.isArray(value.claimSupportRefs) || value.claimSupportRefs.length === 0) return false;
  return value.claimSupportRefs.every((ref) => {
    const support = supports.get(ref);
    return Boolean(support)
      && support!.origin === "runtime_research"
      && support!.candidateRef === value.candidateRef
      && support!.researchAttemptRef === value.researchAttemptRef
      && support!.questionRef === value.questionRef
      && support!.feeRowRef === value.feeRowRef;
  });
}

function isAcceptedSupport(value: Record<string, unknown>): boolean {
  const applicability = value.applicability as Record<string, unknown>;
  const claim = value.structuredClaim as Record<string, unknown>;
  const evidenceDecision = stringValue(value.evidenceDecision);
  const evidenceShapeValid = evidenceDecision === "verified_classification"
    ? claim.claimKind === "classification" && claim.proposedCategory !== null
    : evidenceDecision === "verified_rule"
      ? claim.claimKind === "published_rule"
      : evidenceDecision === "verified_application"
        ? claim.claimKind === "merchant_application"
          && claim.applicationBasis === "statement_basis_matches"
          && value.rateOrAmountComparison === "matches_published_rule"
          && value.hasDeterministicCalculationProof === true
        : false;
  const scopeValid = value.origin === "runtime_research"
    ? applicability.processorOrNetwork === true
    : value.approvedRegistryScopeBasis === "exact_processor_or_network"
      ? applicability.processorOrNetwork === true
      : value.approvedRegistryScopeBasis === "unrestricted_broader_official"
        && applicability.processorOrNetwork === false;
  const originValid = value.origin === "runtime_research"
    || (value.origin === "approved_registry" && value.approvedSourceLifecycle === "active" && value.approvedSourceApplicable === true);
  return VERIFIED_EVIDENCE_DECISIONS.has(evidenceDecision)
    && evidenceShapeValid
    && originValid
    && scopeValid
    && value.semanticDecision === "supports"
    && applicability.statementPeriod === true
    && applicability.jurisdiction !== false
    && applicability.transactionContext !== false
    && Array.isArray(value.contradictionCodes)
    && value.contradictionCodes.length === 0
    && value.hasStructuredClaimExclusions === false
    && value.hasSupportExclusions === false
    && confidenceRank(stringValue(value.finalConfidence)) <= confidenceRank(stringValue(claim.maximumConfidence))
    && actionabilityRank(stringValue(value.finalActionabilityCeiling)) <= actionabilityRank(stringValue(claim.actionabilityCeiling));
}

function validateLifecycle(result: Record<string, unknown>, ledger: unknown): boolean {
  if (!isRecord(ledger) || !Array.isArray(ledger.documents)) return false;
  const document = ledger.documents.find((item) => isRecord(item) && item.sourceDocumentId === result.sourceDocumentId);
  if (!isRecord(document) || !isRecord(document.aiStates) || !Array.isArray(document.events)) return false;
  const canonicalState = document.aiStates.canonical_admitted;
  const publicationState = document.aiStates.customer_published;
  if (!isRecord(canonicalState) || !isRecord(publicationState)) return false;
  const canonicalEvents = document.events.filter((event) => isRecord(event) && event.stage === "canonical_admission");
  const matchingEvents = canonicalEvents.filter((event) => event.canonicalAdmissionRef === result.lifecycleAdmissionRef);
  if (matchingEvents.length !== 1) return false;
  const event = matchingEvents[0]!;
  if (event.capabilityExecutionRef !== result.executionRef) return false;
  const expected = result.admissionDisposition === "admitted" ? "completed" : result.admissionDisposition === "safety_blocked" ? "blocked" : "withheld";
  if (event.state !== expected || !exactEnumArray(event.reasonCodes, [dispositionReason(result.admissionDisposition)], RESULT_REASONS)) return false;
  if (result.admissionDisposition === "admitted") {
    if (canonicalState.state !== "completed" || !exactEnumArray(canonicalState.reasonCodes, ["canonical_admission_admitted"], RESULT_REASONS)) return false;
    if (canonicalEvents.filter((item) => item.state === "completed").length !== 1) return false;
  } else if (canonicalState.state === "completed" || canonicalEvents.some((item) => item.state === "completed")) return false;
  if (publicationState.state === "completed") return false;
  const publication = document.events.filter((item) => isRecord(item) && item.stage === "customer_publication");
  return publication.every((item) => item.state !== "completed")
    && document.events.every((item) => isRecord(item) && item.customerPublicationRef === null);
}

function validateInvariance(sourceDocumentId: unknown, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const matches = value.filter((item) => isRecord(item) && item.sourceDocumentId === sourceDocumentId);
  return matches.length === 1 && validateFinancialInvarianceResult(matches[0]!.result);
}

function validateFinancialInvarianceResult(value: unknown): boolean {
  if (!isRecord(value) || value.type !== "packages_b_e_financial_invariance_v1" || value.projectionVersion !== "packages_b_e_financial_invariance_projection_v2") return false;
  if (!Array.isArray(value.packages) || value.packages.length !== INVARIANCE_PACKAGE_PROJECTIONS.length) return false;
  if (!SHA256.test(stringValue(value.beforeCombinedHash)) || !SHA256.test(stringValue(value.afterCombinedHash)) || value.beforeCombinedHash !== value.afterCombinedHash) return false;
  if (value.invariant !== true || value.liveRunBlocked !== false || !Array.isArray(value.mismatchPaths) || value.mismatchPaths.length !== 0) return false;
  return value.packages.every((item, index) => {
    const expected = INVARIANCE_PACKAGE_PROJECTIONS[index]!;
    return isRecord(item)
      && item.package === expected[0]
      && item.projectionVersion === expected[1]
      && SHA256.test(stringValue(item.beforeHash))
      && SHA256.test(stringValue(item.afterHash))
      && item.beforeHash === item.afterHash
      && item.invariant === true
      && Array.isArray(item.mismatchPaths)
      && item.mismatchPaths.length === 0;
  });
}

function validateTrustedV1Fields(value: Record<string, unknown>): boolean {
  if (value.manifestVersion !== "evaluation_source_manifest_v1" || value.manifestHash !== value.approvedManifestHash || !SHA256.test(stringValue(value.manifestHash))) return false;
  if (!Array.isArray(value.sourceIdentity) || !Array.isArray(value.deduplicationDecisions) || !Array.isArray(value.parserDecisions) || !Array.isArray(value.packageFinancialInvariance) || !Array.isArray(value.providerCallOutcomes)) return false;
  if (!isRecord(value.parentPreflightProof) || !hasExactKeys(value.parentPreflightProof, ["artifactId", "recordedHash", "reconstructedHash", "verified"]) || value.parentPreflightProof.verified !== true || value.parentPreflightProof.recordedHash !== value.parentPreflightProof.reconstructedHash) return false;
  const sourceIds = value.sourceIdentity.map((row) => isRecord(row) ? stringValue(row.sourceDocumentId) : "");
  if (!sourceIds.every(Boolean) || new Set(sourceIds).size !== sourceIds.length) return false;
  if (!isRecord(value.lifecycleLedger) || value.lifecycleLedger.type !== "evaluation_lifecycle_ledger_v1" || !Array.isArray(value.lifecycleLedger.documents)) return false;
  if (!isRecord(value.executionPermit) || value.executionPermit.type !== "approved_evaluation_execution_permit_v1" || value.executionPermit.manifestPath !== "internal:approved_manifest") return false;
  if (value.executionPermit.approvedManifestHash !== value.manifestHash || value.executionPermit.recalculatedManifestHash !== value.manifestHash) return false;
  if (!isRecord(value.costBudgetLedger) || value.costBudgetLedger.type !== "evaluation_cost_budget_ledger_v2") return false;
  if (!enumValue(value.finalStatus, ["completed", "blocked", "failed", "timed_out"]) || !safeCodeArray(value.reasonCodes)) return false;
  return validateClosedTrustedV1(value);
}

function validateClosedTrustedV1(value: Record<string, any>): boolean {
  const sourceKeys = ["sourceDocumentId", "internalSourceRef", "sha256", "byteCount", "parsedProcessor", "parsedStatementPeriod", "parserEligibility", "processorLayoutFamily", "productScopeEligibility", "productScopeReasonCode", "paidStageEligibility", "paidStageExclusionReason", "selectedDriver", "duplicateGroupId", "selectedDuplicateRepresentative", "duplicateExclusionReason", "allowedExecutionStages", "parentPreflightArtifactId", "parentPreflightArtifactHash", "parserRecordId", "parserDecision", "displayFileNameHash"] as const;
  const parserDecisionKeys = ["status", "reportable", "confidence", "reason", "reasonCode", "failedControls", "warningControls", "reportabilityImpact"] as const;
  const parserControlKeys = ["controlId", "status", "basisId", "populationId", "expected", "actual", "delta", "tolerance", "reportabilityImpact"] as const;
  for (const source of value.sourceIdentity) {
    if (!isRecord(source) || !hasExactKeys(source, sourceKeys) || !SHA256.test(stringValue(source.sha256))) return false;
    if (source.displayFileNameHash !== null && !SHA256.test(stringValue(source.displayFileNameHash))) return false;
    if (source.parsedStatementPeriod !== null && (!isRecord(source.parsedStatementPeriod) || !hasExactKeys(source.parsedStatementPeriod, ["start", "end"]))) return false;
    if (!enumValue(source.parserEligibility, ["eligible", "unsupported", "failed"]) || !enumValue(source.processorLayoutFamily, ["fiserv_family", "nxgen_vortax", "unknown"])) return false;
    if (!enumValue(source.productScopeEligibility, ["eligible", "ineligible"]) || !enumValue(source.productScopeReasonCode, ["fiserv_family_supported", "processor_layout_out_of_product_scope", "processor_layout_unknown"])) return false;
    if (!enumValue(source.paidStageEligibility, ["eligible", "ineligible"]) || !nullableEnum(source.paidStageExclusionReason, ["parser_ineligible", "product_scope_ineligible"])) return false;
    if (!Array.isArray(source.allowedExecutionStages) || source.allowedExecutionStages.some((stage: unknown) => !enumValue(stage, EXECUTION_STAGES))) return false;
    if (!validateParserDecision(source.parserDecision, parserDecisionKeys, parserControlKeys)) return false;
  }
  for (const decision of value.deduplicationDecisions) {
    if (!isRecord(decision) || !hasExactKeys(decision, ["duplicateGroupId", "checksum", "groupMembers", "selectedRepresentative", "exclusions"]) || !Array.isArray(decision.groupMembers) || !Array.isArray(decision.exclusions)) return false;
    if (decision.exclusions.some((item: unknown) => !isRecord(item) || !hasExactKeys(item, ["sourceDocumentId", "reason"]) || item.reason !== "duplicate_checksum_non_representative")) return false;
  }
  const ledger = value.lifecycleLedger;
  if (!hasExactKeys(ledger, ["type", "documents"]) || !Array.isArray(ledger.documents)) return false;
  const aiStateNames = ["executed", "generated", "schema_valid", "evidence_validated", "policy_accepted", "canonical_admitted", "customer_published"] as const;
  const eventKeys = ["eventId", "sourceDocumentId", "stage", "state", "reasonCodes", "manifestRowRef", "preflightRecordRef", "parserRecordRef", "capabilityExecutionRef", "providerRequestRef", "researchRetrievalRefs", "semanticVerificationRef", "canonicalAdmissionRef", "customerPublicationRef", "finalArtifactRef"] as const;
  for (const document of ledger.documents) {
    if (!isRecord(document) || !hasExactKeys(document, ["sourceDocumentId", "aiStates", "events"]) || !isRecord(document.aiStates) || !hasExactKeys(document.aiStates, aiStateNames) || !Array.isArray(document.events)) return false;
    for (const state of Object.values(document.aiStates)) if (!isRecord(state) || !hasExactKeys(state, ["state", "reasonCodes"]) || !enumValue(state.state, LIFECYCLE_STATES) || !safeCodeArray(state.reasonCodes)) return false;
    for (const event of document.events) {
      if (!isRecord(event) || !hasExactKeys(event, eventKeys) || !enumValue(event.stage, LIFECYCLE_STAGES) || !enumValue(event.state, LIFECYCLE_STATES) || !safeCodeArray(event.reasonCodes) || !Array.isArray(event.researchRetrievalRefs)) return false;
    }
  }
  for (const record of value.parserDecisions) {
    if (!isRecord(record) || !hasExactKeys(record, ["sourceDocumentId", "parserRecordId", "decision"]) || !validateParserDecision(record.decision, parserDecisionKeys, parserControlKeys)) return false;
  }
  for (const entry of value.packageFinancialInvariance) {
    if (!isRecord(entry) || !hasExactKeys(entry, ["sourceDocumentId", "result"]) || !isRecord(entry.result)) return false;
    const result = entry.result;
    if (!hasExactKeys(result, ["type", "projectionVersion", "packages", "beforeCombinedHash", "afterCombinedHash", "invariant", "mismatchPaths", "liveRunBlocked"]) || !Array.isArray(result.packages) || !Array.isArray(result.mismatchPaths)) return false;
    for (const item of result.packages) if (!isRecord(item) || !hasExactKeys(item, ["package", "projectionVersion", "beforeHash", "afterHash", "invariant", "mismatchPaths"]) || !Array.isArray(item.mismatchPaths)) return false;
    if (!validateFinancialInvarianceResult(result)) return false;
  }
  const cost = value.costBudgetLedger;
  if (!hasExactKeys(cost, ["type", "currency", "fixedPointScale", "approvedBudgetUsd", "cumulativeReservedUsd", "cumulativeObservedUsd", "cumulativeBudgetCommittedUsd", "cumulativeReleasedUsd", "remainingBudgetUsd", "blocked", "entries"]) || !Array.isArray(cost.entries)) return false;
  const costEntryKeys = ["callId", "attempt", "attemptKind", "retryOfCallId", "capability", "currency", "fixedPointScale", "pricingPolicyRef", "providerRoute", "provider", "model", "toolClass", "maximumInputTokens", "maximumOutputTokens", "maximumToolUses", "requestId", "startedAt", "endedAt", "durationMs", "status", "inputTokens", "cachedInputTokens", "outputTokens", "toolEvents", "estimatedMaximumCostUsd", "worstCaseReservedCostUsd", "observedOrEstimatedFinalCostUsd", "billingDisposition", "cumulativeReservedUsd", "cumulativeObservedUsd", "cumulativeBudgetCommittedUsd", "cumulativeReleasedUsd", "remainingBudgetUsd"] as const;
  for (const entry of cost.entries) {
    if (!isRecord(entry) || !hasExactKeys(entry, costEntryKeys) || !Array.isArray(entry.toolEvents)) return false;
    if (!enumValue(entry.attemptKind, ["initial", "retry"]) || !enumValue(entry.capability, ["direct_responses", "ai_sdk", "web_search", "retrieval", "semantic_verification"]) || entry.currency !== "USD") return false;
    if (!enumValue(entry.status, ["reserved", "success", "failure", "timeout", "cancelled_before_send"]) || !enumValue(entry.billingDisposition, ["pending", "observed", "provider_confirmed_zero", "unknown"])) return false;
    if (entry.toolEvents.some((item: unknown) => !isRecord(item) || !hasExactKeys(item, ["type", "count"]))) return false;
  }
  const permit = value.executionPermit;
  if (!hasExactKeys(permit, ["type", "manifestPath", "approvedManifestHash", "recalculatedManifestHash", "selectedCount", "documents", "diagnostics"]) || !Array.isArray(permit.documents) || !Array.isArray(permit.diagnostics)) return false;
  for (const document of permit.documents) if (!isRecord(document) || !hasExactKeys(document, ["sourceDocumentId", "internalSourceRef", "sha256", "byteCount", "selectedDriver", "processorLayoutFamily", "productScopeEligibility", "paidStageEligibility", "stages"]) || !enumValue(document.processorLayoutFamily, ["fiserv_family", "nxgen_vortax", "unknown"]) || !enumValue(document.productScopeEligibility, ["eligible", "ineligible"]) || !enumValue(document.paidStageEligibility, ["eligible", "ineligible"]) || !Array.isArray(document.stages) || document.stages.some((stage: unknown) => !enumValue(stage, EXECUTION_STAGES))) return false;
  for (const diagnostic of permit.diagnostics) if (!isRecord(diagnostic) || !hasExactKeys(diagnostic, ["code", "sourceDocumentId", "detail"])) return false;
  for (const outcome of value.providerCallOutcomes) if (!isRecord(outcome) || !hasExactKeys(outcome, ["callId", "sourceDocumentId", "stage", "status", "requestId", "reasonCodes"]) || !enumValue(outcome.stage, EXECUTION_STAGES) || !enumValue(outcome.status, ["success", "failure", "timeout", "cancelled_before_send"]) || !safeCodeArray(outcome.reasonCodes)) return false;
  return true;
}

function validateParserDecision(value: unknown, decisionKeys: readonly string[], controlKeys: readonly string[]): boolean {
  if (!isRecord(value) || !hasExactKeys(value, decisionKeys) || !Array.isArray(value.failedControls) || !Array.isArray(value.warningControls)) return false;
  if (!enumValue(value.status, ["accepted", "accepted_with_warnings", "needs_review", "unsupported", "failed"]) || typeof value.reportable !== "boolean" || !enumValue(value.confidence, ["high", "medium", "low", "needs_review"]) || !enumValue(value.reportabilityImpact, ["blocks_report", "allows_report_with_warnings", "allows_report"])) return false;
  return [...value.failedControls, ...value.warningControls].every((control) => isRecord(control) && hasExactKeys(control, controlKeys) && enumValue(control.status, ["pass", "warning", "fail", "not_applicable"]) && enumValue(control.reportabilityImpact, ["blocking", "warning", "none"]));
}

function validateResultProseSafety(result: Record<string, unknown>): boolean {
  if (result.packageF === null) return true;
  if (!isRecord(result.packageF) || !isRecord(result.packageF.output)) return true;
  const output = result.packageF.output;
  const interpretations = Array.isArray(output.rowInterpretations) ? output.rowInterpretations : [];
  const acceptances = Array.isArray(output.acceptanceRecords) ? output.acceptanceRecords : [];
  return interpretations.every((row) => isRecord(row)
      && canonicalExplanatoryText(row.conciseRationale, 320)
      && canonicalExplanatoryArray(row.conflicts, 160)
      && canonicalExplanatoryArray(row.missingEvidence, 160))
    && acceptances.every((row) => isRecord(row) && canonicalExplanatoryArray(row.conflicts, 160));
}

function canonicalExplanatoryText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string" || !value) return false;
  const normalized = value.replace(/\b\d{8,}\b/g, "[redacted-id]").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return value === normalized && !SENSITIVE_VALUE.test(value) && !FORBIDDEN_FINANCIAL_VALUE.test(value);
}

function canonicalExplanatoryArray(value: unknown, maxLength: number): value is string[] {
  return Array.isArray(value)
    && value.every((item) => canonicalExplanatoryText(item, maxLength))
    && isSortedUnique(value);
}

function safeReferenceValue(value: unknown): value is string {
  return typeof value === "string" && SAFE_REFERENCE.test(value) && !HASH.test(value);
}

function safeCodeArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && SAFE_CODE.test(item)) && isSortedUnique(value);
}

function closedCodeArray<T extends string>(value: unknown, allowed: readonly T[]): value is T[] {
  return safeCodeArray(value) && value.every((item) => (allowed as readonly string[]).includes(item));
}

function closedSetArray(value: unknown, allowed: Set<string>): value is string[] {
  return safeCodeArray(value) && value.every((item) => allowed.has(item));
}

function exactEnumArray<T extends string>(value: unknown, expected: readonly T[], allowed: readonly T[]): value is T[] {
  return closedCodeArray(value, allowed) && JSON.stringify(value) === JSON.stringify(expected);
}

function safeRefArray(value: unknown, pattern: RegExp): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && pattern.test(item)) && isSortedUnique(value);
}

function canonicalFactRefArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string" && CANONICAL_FACT_REFERENCES.has(item))
    && isSortedUnique(value);
}

function diagnosticRefArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string" && (CANONICAL_FACT_REFERENCES.has(item) || SAFE_REFERENCE.test(item)))
    && isSortedUnique(value);
}

function isSortedUnique(values: string[]): boolean {
  return new Set(values).size === values.length && isSorted(values);
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]!.localeCompare(value) <= 0);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function nullableEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T | null {
  return value === null || enumValue(value, allowed);
}

function nullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function dispositionReason(disposition: unknown): (typeof RESULT_REASONS)[number] {
  if (disposition === "admitted") return "canonical_admission_admitted";
  if (disposition === "safety_blocked") return "canonical_admission_safety_blocked";
  return "canonical_admission_rejected";
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function setEquals(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function confidenceRank(value: string): number {
  return { low: 1, medium: 2, high: 3 }[value] ?? Number.POSITIVE_INFINITY;
}

function actionabilityRank(value: string): number {
  return { unknown: 0, not_actionable: 1, verify_only: 2, potentially_actionable: 3 }[value] ?? Number.POSITIVE_INFINITY;
}
