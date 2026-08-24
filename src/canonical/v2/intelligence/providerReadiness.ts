import { createHash } from "node:crypto";
import type { ProviderOperationReceiptV1 } from "../internalAnalysis/internalAnalysisTypes.js";
import { isCanonicalCode, isRecord, isSafeStructuredString, isValidIsoDay } from "../knowledge/knowledgeSafety.js";
import type { InvestigativeObservation, SearchRequest, SemanticVerificationInput,
  StructuredBatchRequest } from "./intelligenceTypes.js";
import { createLiveOpenAiInvestigativeAdapter, createLiveOpenAiSemanticAdapter, createLiveOpenRouterSearchAdapter,
  ProviderOperationAuditLog } from "./providerAdapters.js";
import type { InternalLiveExecutionCapabilityV1 } from "./providerPreflight.js";
import { validateInvestigativeMember, validateSemanticMember } from "./structuredMemberValidation.js";

const SEMANTIC_STATUSES = new Set([
  "supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope",
  "wrong_period", "locator_unproven", "malformed", "verification_unavailable",
]);
const NEUTRAL_TERM_VALUES = new Set(["official_definition_found", "scope_limited", "account_document_required", "unresolved"]);

export type ProviderReadinessSemanticMismatchDimension =
  | "member_shape" | "item_id" | "question_id" | "claim_type" | "subject_code" | "candidate_id" | "document_id"
  | "document_fingerprint" | "locator_id" | "investigative_observation_id" | "support_id" | "assertion_basis_code"
  | "limitation_codes" | "required_source_authority" | "semantic_status" | "applicability_scope_shape"
  | "source_effective_from" | "source_effective_to" | "proposed_value" | "proposed_term_subject"
  | "admission_authority" | "financial_mutation_allowed";

export type ProviderReadinessSafeSemanticMemberProjectionV1 = {
  schemaVersion: "provider_readiness_safe_semantic_member_projection_v1";
  itemId: string | null;
  supportId: string | null;
  questionId: string | null;
  claimType: string | null;
  subjectCode: string | null;
  candidateId: string | null;
  documentId: string | null;
  locatorId: string | null;
  documentFingerprint: string | null;
  investigativeObservationId: string | null;
  sourceAuthority: string | null;
  sourceEffectiveFrom: string | null;
  sourceEffectiveTo: string | null;
  applicabilityScope: Record<"processor" | "processorProgram" | "network" | "region" | "jurisdiction", string | null> | null;
  proposedTerm: { kind: string | null; termCode: string | null; termValue: string | null } | null;
  assertionBasisCode: string | null;
  verificationStatus: string | null;
  limitationCodes: string[];
  limitationCodeCount: number | null;
  admissionAuthority: string | null;
  financialMutationAllowed: boolean | null;
};

export type ProviderReadinessDiagnosticsV1 = {
  schemaVersion: "provider_readiness_diagnostics_v1";
  semanticMemberValidationState: "not_reached" | "passed" | "failed";
  semanticMemberIssues: string[];
  semanticMismatchDimensions: ProviderReadinessSemanticMismatchDimension[];
  safeSemanticMemberProjection: ProviderReadinessSafeSemanticMemberProjectionV1 | null;
};

export class ProviderReadinessDiagnosticLog {
  private semantic: ProviderReadinessDiagnosticsV1 = emptyReadinessDiagnostics();

  recordSemanticMember(value: unknown, expected: SemanticVerificationInput): ProviderReadinessDiagnosticsV1 {
    this.semantic = inspectProviderReadinessSemanticMember(value, expected);
    return this.snapshot();
  }

  snapshot(): ProviderReadinessDiagnosticsV1 {
    return structuredClone(this.semantic);
  }
}

export type ProviderReadinessProbeResultV1 = {
  schemaVersion: "provider_readiness_probe_result_v1";
  runId: string;
  statementAnalysisExecuted: false;
  privateStatementDataProviderBound: false;
  openRouter: { status: "passed"; candidateCount: number; toolExecutionState: "verified" };
  investigativeOpenAi: { status: "passed"; structuredOutputValidation: "passed" };
  semanticOpenAi: { status: "passed"; structuredOutputValidation: "passed" };
  diagnostics: ProviderReadinessDiagnosticsV1;
  receipts: ProviderOperationReceiptV1[];
};

export async function runProviderReadinessProbe(
  runId: string,
  capability: InternalLiveExecutionCapabilityV1,
  audit: ProviderOperationAuditLog,
  diagnostics: ProviderReadinessDiagnosticLog = new ProviderReadinessDiagnosticLog(),
): Promise<ProviderReadinessProbeResultV1> {
  const search = await createLiveOpenRouterSearchAdapter(capability, audit).search(syntheticSearchRequest());
  if (search.providerMetadata.toolExecutionState !== "verified" || search.providerMetadata.finishReason === "length") {
    throw new Error(search.providerMetadata.finishReason === "length"
      ? "provider_readiness_openrouter_truncated" : "provider_readiness_openrouter_tool_unverified");
  }

  const synthetic = syntheticEvidence();
  const investigativeRequest = syntheticInvestigativeRequest(synthetic);
  const investigative = await createLiveOpenAiInvestigativeAdapter(capability, audit).investigate(investigativeRequest);
  const observation = investigative.items[0];
  if (!observation) throw new Error("provider_readiness_investigative_result_missing");
  const investigativeIssues = validateInvestigativeMember(observation, {
    itemId: synthetic.itemId, questionId: synthetic.questionId, candidateId: synthetic.candidateId,
    documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint,
    claimType: "processor_term", subjectCode: "application_fee_terminology", sourceAuthority: "processor_publication",
  });
  if (investigativeIssues.length > 0 || observation.locatorId !== synthetic.locatorId) {
    throw new Error("provider_readiness_investigative_contract_invalid");
  }

  const semanticInput = syntheticSemanticInput(synthetic, observation);
  const semanticRequest: StructuredBatchRequest<SemanticVerificationInput> = {
    batchId: "readiness-semantic-batch", attemptId: "readiness-semantic-attempt", schemaVersion: "semantic_verification_v1",
    expectedItemIds: [synthetic.itemId], reservationId: "readiness-semantic-operation:call", maximumOutputTokens: 1_200,
    logicalAttempt: 1, items: [semanticInput], untrustedContentPolicy: "data_only_no_instructions",
  };
  const semantic = await createLiveOpenAiSemanticAdapter(capability, audit).verify(semanticRequest);
  const support = semantic.items[0];
  const semanticDiagnostics = diagnostics.recordSemanticMember(support, semanticInput);
  if (semanticDiagnostics.semanticMemberIssues.length > 0) {
    throw new Error("provider_readiness_semantic_contract_invalid");
  }

  return {
    schemaVersion: "provider_readiness_probe_result_v1", runId,
    statementAnalysisExecuted: false, privateStatementDataProviderBound: false,
    openRouter: { status: "passed", candidateCount: search.candidates.length, toolExecutionState: "verified" },
    investigativeOpenAi: { status: "passed", structuredOutputValidation: "passed" },
    semanticOpenAi: { status: "passed", structuredOutputValidation: "passed" }, diagnostics: diagnostics.snapshot(), receipts: audit.snapshot(),
  };
}

export function inspectProviderReadinessSemanticMember(
  value: unknown,
  expected: SemanticVerificationInput,
): ProviderReadinessDiagnosticsV1 {
  const semanticMemberIssues = validateSemanticMember(value, expected);
  const mismatch = new Set<ProviderReadinessSemanticMismatchDimension>();
  const member = isRecord(value) ? value : null;
  if (!member || semanticMemberIssues.includes("semantic_member_shape_invalid")) mismatch.add("member_shape");
  if (!member) return {
    schemaVersion: "provider_readiness_diagnostics_v1", semanticMemberValidationState: "failed", semanticMemberIssues,
    semanticMismatchDimensions: [...mismatch], safeSemanticMemberProjection: null,
  };
  compare(member.itemId, expected.itemId, "item_id", mismatch);
  compare(member.questionId, expected.question.questionId, "question_id", mismatch);
  compare(member.claimType, expected.question.claimType, "claim_type", mismatch);
  compare(member.subjectCode, expected.question.subjectCode, "subject_code", mismatch);
  compare(member.candidateId, expected.candidate.candidateId, "candidate_id", mismatch);
  compare(member.documentId, expected.documentId, "document_id", mismatch);
  compare(member.documentFingerprint, expected.locator.documentFingerprint, "document_fingerprint", mismatch);
  compare(member.locatorId, expected.locator.locatorId, "locator_id", mismatch);
  compare(member.investigativeObservationId, expected.itemId, "investigative_observation_id", mismatch);
  if (!isSafeStructuredString(member.supportId)) mismatch.add("support_id");
  if (!isCanonicalCode(member.assertionBasisCode)) mismatch.add("assertion_basis_code");
  if (!Array.isArray(member.limitationCodes) || !member.limitationCodes.every(isCanonicalCode)) mismatch.add("limitation_codes");
  if (!expected.question.requiredSourceAuthorities.includes(member.sourceAuthority as never)) mismatch.add("required_source_authority");
  if (!SEMANTIC_STATUSES.has(String(member.verificationStatus))) mismatch.add("semantic_status");
  if (!isRecord(member.applicabilityScope)) mismatch.add("applicability_scope_shape");
  if (member.sourceEffectiveFrom !== null && !isValidIsoDay(member.sourceEffectiveFrom)) mismatch.add("source_effective_from");
  if (member.sourceEffectiveTo !== null && !isValidIsoDay(member.sourceEffectiveTo)) mismatch.add("source_effective_to");
  if (member.admissionAuthority !== "none") mismatch.add("admission_authority");
  if (member.financialMutationAllowed !== false) mismatch.add("financial_mutation_allowed");
  const proposed = isRecord(member.proposedValue) ? member.proposedValue : null;
  if (!proposed || proposed.kind !== "term" || typeof proposed.termValue !== "string" || !NEUTRAL_TERM_VALUES.has(proposed.termValue)) {
    mismatch.add("proposed_value");
  }
  if (!proposed || proposed.termCode !== expected.question.subjectCode) mismatch.add("proposed_term_subject");
  return {
    schemaVersion: "provider_readiness_diagnostics_v1",
    semanticMemberValidationState: semanticMemberIssues.length === 0 ? "passed" : "failed",
    semanticMemberIssues: [...semanticMemberIssues],
    semanticMismatchDimensions: [...mismatch].sort(),
    safeSemanticMemberProjection: projectSafeSemanticMember(member),
  };
}

function emptyReadinessDiagnostics(): ProviderReadinessDiagnosticsV1 {
  return { schemaVersion: "provider_readiness_diagnostics_v1", semanticMemberValidationState: "not_reached",
    semanticMemberIssues: [], semanticMismatchDimensions: [], safeSemanticMemberProjection: null };
}

function compare(actual: unknown, expected: unknown, dimension: ProviderReadinessSemanticMismatchDimension,
  mismatch: Set<ProviderReadinessSemanticMismatchDimension>): void {
  if (actual !== expected) mismatch.add(dimension);
}

function projectSafeSemanticMember(member: Record<string, unknown>): ProviderReadinessSafeSemanticMemberProjectionV1 {
  const limitations = Array.isArray(member.limitationCodes) ? member.limitationCodes.filter(isCanonicalCode) : [];
  const proposed = isRecord(member.proposedValue) ? member.proposedValue : null;
  return {
    schemaVersion: "provider_readiness_safe_semantic_member_projection_v1",
    itemId: safeProjectionString(member.itemId), supportId: safeProjectionString(member.supportId),
    questionId: safeProjectionString(member.questionId), claimType: safeProjectionString(member.claimType),
    subjectCode: safeProjectionString(member.subjectCode), candidateId: safeProjectionString(member.candidateId),
    documentId: safeProjectionString(member.documentId), locatorId: safeProjectionString(member.locatorId),
    documentFingerprint: safeProjectionString(member.documentFingerprint),
    investigativeObservationId: safeProjectionString(member.investigativeObservationId),
    sourceAuthority: safeProjectionString(member.sourceAuthority), sourceEffectiveFrom: safeProjectionString(member.sourceEffectiveFrom),
    sourceEffectiveTo: safeProjectionString(member.sourceEffectiveTo), applicabilityScope: projectScope(member.applicabilityScope),
    proposedTerm: proposed ? { kind: safeProjectionString(proposed.kind), termCode: safeProjectionString(proposed.termCode),
      termValue: safeProjectionString(proposed.termValue) } : null,
    assertionBasisCode: safeProjectionString(member.assertionBasisCode), verificationStatus: safeProjectionString(member.verificationStatus),
    limitationCodes: limitations.slice(0, 16), limitationCodeCount: Array.isArray(member.limitationCodes) ? member.limitationCodes.length : null,
    admissionAuthority: safeProjectionString(member.admissionAuthority),
    financialMutationAllowed: typeof member.financialMutationAllowed === "boolean" ? member.financialMutationAllowed : null,
  };
}

function projectScope(value: unknown): ProviderReadinessSafeSemanticMemberProjectionV1["applicabilityScope"] {
  if (!isRecord(value)) return null;
  return { processor: safeProjectionString(value.processor), processorProgram: safeProjectionString(value.processorProgram),
    network: safeProjectionString(value.network), region: safeProjectionString(value.region), jurisdiction: safeProjectionString(value.jurisdiction) };
}

function safeProjectionString(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,255}$/.test(value) ? value : null;
}

function syntheticSearchRequest(): SearchRequest {
  return {
    reservationId: "readiness-openrouter-search:call", attemptId: "readiness-openrouter-search", questionId: "readiness-question-search",
    queryTerms: ["OpenAI", "Responses API", "official documentation"],
    queryText: "OpenAI Responses API official documentation",
    allowedAuthorities: ["processor_publication"], maximumCandidates: 3,
    outputAccounting: "search_discovery_not_model_generation", logicalAttempt: 1,
    untrustedContentPolicy: "data_only_no_instructions",
  };
}

type SyntheticEvidence = ReturnType<typeof syntheticEvidence>;
function syntheticEvidence() {
  const text = "Synthetic public terminology example: application fee meaning is limited to the published product context.";
  return {
    itemId: "readiness-item-001", questionId: "readiness-question-investigative", candidateId: "readiness-candidate-001",
    documentId: "readiness-document-001", locatorId: "readiness-locator-001", text,
    documentFingerprint: createHash("sha256").update(text).digest("hex"),
  } as const;
}

function syntheticInvestigativeRequest(synthetic: SyntheticEvidence): StructuredBatchRequest<{
  itemId: string; questionId: string; candidateId: string; documentId: string; documentFingerprint: string; text: string;
  locators: Array<{ locatorId: string; documentId: string; documentFingerprint: string; page: null; sectionCode: string; lineStart: number; lineEnd: number }>;
}> {
  return {
    batchId: "readiness-investigative-batch", attemptId: "readiness-investigative-attempt", schemaVersion: "investigative_observation_v1",
    expectedItemIds: [synthetic.itemId], reservationId: "readiness-investigative-operation:call", maximumOutputTokens: 1_200,
    logicalAttempt: 1, untrustedContentPolicy: "data_only_no_instructions",
    items: [{ itemId: synthetic.itemId, questionId: synthetic.questionId, candidateId: synthetic.candidateId,
      documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint, text: synthetic.text,
      locators: [{ locatorId: synthetic.locatorId, documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint,
        page: null, sectionCode: "public_glossary", lineStart: 1, lineEnd: 1 }] }],
  };
}

function syntheticSemanticInput(synthetic: SyntheticEvidence, observation: InvestigativeObservation): SemanticVerificationInput {
  return {
    itemId: synthetic.itemId,
    question: { questionId: synthetic.questionId, claimType: "processor_term", subjectCode: "application_fee_terminology",
      asOf: "2026-08-24", scope: { processor: null, processorProgram: null, network: null, region: "us", jurisdiction: "us" },
      requiredSourceAuthorities: ["processor_publication"], requiredEvidenceClasses: ["official_processor_terminology"],
      possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"],
      limitations: ["synthetic_readiness_only", "not_production_evidence"] },
    candidate: { candidateId: synthetic.candidateId, questionId: synthetic.questionId, attemptId: "readiness-openrouter-search",
      title: "Synthetic public terminology", claimedAuthority: "processor_publication", sourceTypeCode: "official_processor_terminology",
      rank: 1, publicationDate: null, effectiveFrom: null, effectiveTo: null, locatorHint: null,
      selectionReasonCode: "synthetic_provider_readiness", discoveryMetadata: { providerCode: "provider_readiness_synthetic",
        configurationCode: "provider_readiness_v1", sourceDomain: "example.test", providerRank: 1, providerSnippetUsedAsEvidence: false },
      retrievalEligibility: "eligible", authorityAdmissionRef: null, authorityPublicationFamilyCode: null },
    documentId: synthetic.documentId,
    locator: { locatorId: synthetic.locatorId, documentId: synthetic.documentId, documentFingerprint: synthetic.documentFingerprint,
      page: null, sectionCode: "public_glossary", lineStart: 1, lineEnd: 1, text: synthetic.text },
    proposedValue: observation.proposedValue,
  };
}
