import { createHash } from "node:crypto";
import { canonicalJson, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import { IntelligenceBudgetExceeded, IntelligenceBudgetLedger, RG_FREE_V1_BUDGET, validateRgFreeV1Budget } from "./budgetLedger.js";
import { planRuntimeResearchQuestions, safeSearchTerms } from "./questionPlanning.js";
import {
  bindInvestigativeLocator,
  createDestinationPermit,
  deterministicLocatorGrounding,
  validateContentSignature,
  validateExtractionResponse,
  validateRetrievalResponse,
} from "./retrievalSafety.js";
import { RemoteConcurrencyGuard } from "./remoteConcurrency.js";
import { authorityAdmissionForCandidate, deriveAdaptiveSearchReason, validatePublicSourceAuthorityAdmissions } from "./sourceAuthority.js";
import { detectSemanticConflicts, supportToKnowledgeCandidatePacket, validateSemanticSupport } from "./semanticVerification.js";
import { asCandidateClaimSupport, asInvestigativeObservation, asThemeLanguageCandidate, validateInvestigativeMember, validateLanguageMemberShape, validateSemanticMember } from "./structuredMemberValidation.js";
import { partitionStructuredItems, validateStructuredBatchResponse } from "./structuredBatching.js";
import { deterministicThemeLanguageFallback, validateThemeLanguageCandidate, validateThemeLanguageInput } from "./themeLanguage.js";
import { RG_SEMANTIC_AMENDMENT_IDS } from "./intelligenceTypes.js";
import { assertProviderSafeQuestionContext, providerSafeScope } from "./providerPrivacy.js";
import type {
  BoundedIntelligenceRuntimeInput,
  BoundedIntelligenceRuntimeResult,
  CandidateClaimSupport,
  DiscoveryCandidate,
  DocumentExtractionResponse,
  ExtractedLocator,
  IntelligenceDiagnostic,
  IntelligencePorts,
  IntelligenceTimeoutResult,
  InvestigativeObservation,
  PrivateResearchReviewBundle,
  RuntimeSecurityEvent,
  SemanticConflict,
  RuntimeDocumentResult,
  RuntimeResearchQuestion,
  RuntimeStageStatus,
  SearchAttempt,
  SearchResponse,
  SemanticVerificationInput,
  StructuredBatchRequest,
  ThemeLanguageCandidate,
} from "./intelligenceTypes.js";

const AUTHORITY_RANK: Partial<Record<KnowledgeSourceAuthority, number>> = {
  official_network_publication: 1,
  processor_publication: 2,
};

type InternalDocument = {
  candidate: DiscoveryCandidate;
  extraction: DocumentExtractionResponse;
  contentFingerprint: string;
  locator: ExtractedLocator | null;
};

function operationId(runId: string, stage: string, sequence: number): string {
  const digest = createHash("sha256").update(`${runId}\0${stage}\0${sequence}`).digest("hex").slice(0, 20);
  return `rg-${stage}-${digest}`;
}

function safeRunId(value: string): void {
  if (!isSafeStructuredString(value)) throw new Error("invalid_intelligence_run_identity");
}

function expired(ports: IntelligencePorts, startedAtMs: number, maximumMs: number): boolean {
  return ports.clock.nowMs() - startedAtMs >= maximumMs;
}

function boundedTimeout(ports: IntelligencePorts, startedAtMs: number, globalMaximumMs: number, stageMaximumMs: number): number {
  return Math.max(0, Math.min(stageMaximumMs, globalMaximumMs - Math.max(0, ports.clock.nowMs() - startedAtMs)));
}

function candidateWithoutUrl(candidate: DiscoveryCandidate): Omit<DiscoveryCandidate, "url"> {
  const { url: _url, ...safe } = candidate;
  return safe;
}

function safeReasonCode(value: string): string {
  return /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "provider_operation_failed";
}

async function runRemote<T>(params: {
  guard: RemoteConcurrencyGuard;
  operationId: string;
  ports: IntelligencePorts;
  timeoutMs: number;
  operation: () => Promise<T>;
}): Promise<IntelligenceTimeoutResult<T>> {
  const lease = params.guard.tryAcquire(params.operationId);
  if (!lease) return { status: "failed", reasonCode: "remote_concurrency_limit_reached" };
  try {
    return await params.ports.clock.runWithTimeout(params.timeoutMs, params.operation);
  } catch {
    return { status: "failed", reasonCode: "provider_operation_exception" };
  } finally {
    lease.release();
  }
}

function stage(statuses: Record<string, RuntimeStageStatus>, name: string, status: RuntimeStageStatus): void {
  statuses[name] = status;
}

function chooseCandidates(params: {
  response: SearchResponse;
  question: RuntimeResearchQuestion;
  attemptId: string;
  alreadyAccepted: DiscoveryCandidate[];
  ledger: IntelligenceBudgetLedger;
  runId: string;
  admissions: BoundedIntelligenceRuntimeInput["publicSourceAuthorityAdmissions"];
}): DiscoveryCandidate[] {
  const existingIds = new Set(params.alreadyAccepted.map((item) => item.candidateId));
  const existingUrls = new Set(params.alreadyAccepted.map((item) => {
    try { return new URL(item.url).toString(); } catch { return item.url; }
  }));
  const seenResponseIds = new Set<string>();
  const valid = params.response.candidates.filter((candidate) => {
    if (seenResponseIds.has(candidate.candidateId)) return false;
    seenResponseIds.add(candidate.candidateId);
    return candidate.questionId === params.question.questionId && candidate.attemptId === params.attemptId
      && isSafeStructuredString(candidate.candidateId) && isSafeStructuredString(candidate.sourceTypeCode)
      && validDiscoveryMetadata(candidate)
      && !existingIds.has(candidate.candidateId);
  }).map((candidate): DiscoveryCandidate => {
    const provisional: DiscoveryCandidate = { ...candidate, retrievalEligibility: "wrong_authority", authorityAdmissionRef: null, authorityPublicationFamilyCode: null };
    const admission = authorityAdmissionForCandidate({ candidate: provisional, question: params.question, admissions: params.admissions });
    return admission && params.question.requiredSourceAuthorities.includes(candidate.claimedAuthority)
      ? { ...provisional, retrievalEligibility: "eligible", authorityAdmissionRef: admission.admissionId, authorityPublicationFamilyCode: admission.publicationFamilyCode }
      : provisional;
  }).filter((candidate) => candidate.retrievalEligibility === "eligible").sort((left, right) => {
    return (AUTHORITY_RANK[left.claimedAuthority] ?? 99) - (AUTHORITY_RANK[right.claimedAuthority] ?? 99)
      || left.rank - right.rank
      || left.candidateId.localeCompare(right.candidateId);
  });
  const remainingQuestionCapacity = params.ledger.profile.maxCandidatesPerQuestion - params.alreadyAccepted.length;
  const selected: DiscoveryCandidate[] = [];
  for (const candidate of valid.slice(0, Math.max(0, remainingQuestionCapacity))) {
    let normalizedUrl: string;
    try { normalizedUrl = new URL(candidate.url).toString(); } catch { continue; }
    if (existingUrls.has(normalizedUrl)) continue;
    try {
      const reservationId = `${params.runId}:candidate:${candidate.candidateId}`;
      params.ledger.reserveAndComplete({ reservationId, operationId: params.attemptId, dimension: "candidates", amount: 1 });
      selected.push(candidate);
      existingUrls.add(normalizedUrl);
    } catch (error) {
      if (error instanceof IntelligenceBudgetExceeded) break;
      throw error;
    }
  }
  return selected;
}

function validDiscoveryMetadata(candidate: SearchResponse["candidates"][number]): boolean {
  const metadata = candidate.discoveryMetadata;
  if (!metadata || !isSafeStructuredString(metadata.providerCode) || !isSafeStructuredString(metadata.configurationCode)
    || !isSafeStructuredString(metadata.sourceDomain) || metadata.providerSnippetUsedAsEvidence !== false
    || metadata.providerRank !== candidate.rank || !Number.isSafeInteger(candidate.rank) || candidate.rank < 1) return false;
  try { return new URL(candidate.url).hostname.toLowerCase() === metadata.sourceDomain; } catch { return false; }
}

async function performSearch(params: {
  input: BoundedIntelligenceRuntimeInput;
  question: RuntimeResearchQuestion;
  kind: "initial" | "adaptive";
  sequence: number;
  existingCandidates: DiscoveryCandidate[];
  ports: IntelligencePorts;
  ledger: IntelligenceBudgetLedger;
  startedAtMs: number;
  adaptiveReason: SearchAttempt["adaptiveReason"];
  guard: RemoteConcurrencyGuard;
}): Promise<{ attempt: SearchAttempt; candidates: DiscoveryCandidate[]; responseAdaptiveReason: SearchAttempt["adaptiveReason"] }> {
  const profile = params.ledger.profile;
  const attemptId = operationId(params.input.runId, `search-${params.kind}`, params.sequence);
  const queryTerms = [...safeSearchTerms(params.question), ...(params.kind === "adaptive" && params.adaptiveReason ? [params.adaptiveReason] : [])].sort();
  const base: SearchAttempt = {
    attemptId,
    questionId: params.question.questionId,
    kind: params.kind,
    queryTerms,
    status: "failed",
    adaptiveReason: params.kind === "adaptive" ? params.adaptiveReason : null,
    candidateIds: [],
    reasonCodes: [],
  };
  if (!params.ports.search) return { attempt: { ...base, status: "disabled", reasonCodes: ["search_provider_disabled"] }, candidates: [], responseAdaptiveReason: null };
  if (expired(params.ports, params.startedAtMs, profile.globalWallTimeMs)) {
    return { attempt: { ...base, status: "timeout", reasonCodes: ["global_wall_time_exhausted"] }, candidates: [], responseAdaptiveReason: null };
  }
  try {
    params.ledger.reserveMany([
      { reservationId: `${attemptId}:call`, operationId: attemptId, dimension: "search_calls", amount: 1 },
      ...(params.kind === "adaptive" ? [{ reservationId: `${attemptId}:adaptive`, operationId: attemptId, dimension: "adaptive_searches" as const, amount: 1 }] : []),
    ]);
  } catch (error) {
    if (error instanceof IntelligenceBudgetExceeded) {
      return { attempt: { ...base, status: "budget_exhausted", reasonCodes: [`budget_exhausted:${error.dimension}`] }, candidates: [], responseAdaptiveReason: null };
    }
    throw error;
  }
  const result = await runRemote({ guard: params.guard, operationId: attemptId, ports: params.ports, timeoutMs: boundedTimeout(params.ports, params.startedAtMs, profile.globalWallTimeMs, profile.searchTimeoutMs), operation: () => params.ports.search!.search({
    reservationId: `${attemptId}:call`,
    attemptId,
    questionId: params.question.questionId,
    queryTerms,
    allowedAuthorities: [...params.question.requiredSourceAuthorities],
    maximumCandidates: profile.maxCandidatesPerQuestion,
    outputAccounting: "search_discovery_not_model_generation",
    logicalAttempt: 1,
    untrustedContentPolicy: "data_only_no_instructions",
  }) });
  if (result.status !== "completed") {
    if (result.status === "failed" && result.reasonCode === "remote_concurrency_limit_reached") {
      params.ledger.release(`${attemptId}:call`);
      if (params.kind === "adaptive") params.ledger.release(`${attemptId}:adaptive`);
    } else {
      params.ledger.settle(`${attemptId}:call`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false });
      if (params.kind === "adaptive") params.ledger.settle(`${attemptId}:adaptive`, { state: result.status === "timeout" ? "timeout" : "failed" });
    }
    return { attempt: { ...base, status: result.status === "timeout" ? "timeout" : "failed", reasonCodes: [result.status === "timeout" ? "search_timeout" : safeReasonCode(result.reasonCode)] }, candidates: [], responseAdaptiveReason: null };
  }
  const response = result.value;
  if (response.attemptId !== attemptId || response.questionId !== params.question.questionId || response.outputAccounting !== "search_discovery_not_model_generation") {
    params.ledger.settle(`${attemptId}:call`, { state: "failed" });
    if (params.kind === "adaptive") params.ledger.settle(`${attemptId}:adaptive`, { state: "failed" });
    return { attempt: { ...base, status: "failed", reasonCodes: ["search_response_identity_mismatch"] }, candidates: [], responseAdaptiveReason: null };
  }
  const responseCandidateIds = response.candidates.map((candidate) => candidate.candidateId);
  if (new Set(responseCandidateIds).size !== responseCandidateIds.length) {
    params.ledger.settle(`${attemptId}:call`, { state: "failed", actualAmount: 1 });
    if (params.kind === "adaptive") params.ledger.settle(`${attemptId}:adaptive`, { state: "failed", actualAmount: 1 });
    return { attempt: { ...base, status: "failed", reasonCodes: ["duplicate_candidate_identity_rejected"] }, candidates: [], responseAdaptiveReason: null };
  }
  params.ledger.settle(`${attemptId}:call`, { state: "completed", actualAmount: 1 });
  if (params.kind === "adaptive") params.ledger.settle(`${attemptId}:adaptive`, { state: "completed", actualAmount: 1 });
  const candidates = chooseCandidates({ response, question: params.question, attemptId, alreadyAccepted: params.existingCandidates, ledger: params.ledger, runId: params.input.runId, admissions: params.input.publicSourceAuthorityAdmissions });
  return {
    attempt: {
      ...base,
      status: candidates.length > 0 ? "completed" : "no_candidates",
      candidateIds: candidates.map((candidate) => candidate.candidateId),
      reasonCodes: candidates.length > 0 ? ["discovery_candidates_retained_by_authority"] : ["no_eligible_discovery_candidates"],
    },
    candidates,
    responseAdaptiveReason: deriveAdaptiveSearchReason({ suggested: response.suggestedAdaptiveReason, question: params.question, candidates }),
  };
}

async function retrieveCandidate(params: {
  input: BoundedIntelligenceRuntimeInput;
  candidate: DiscoveryCandidate;
  ports: IntelligencePorts;
  ledger: IntelligenceBudgetLedger;
  sequence: number;
  startedAtMs: number;
  guard: RemoteConcurrencyGuard;
  securityEvents: RuntimeSecurityEvent[];
}): Promise<{ result: RuntimeDocumentResult; internal: InternalDocument | null }> {
  const profile = params.ledger.profile;
  const documentId = operationId(params.input.runId, "document", params.sequence);
  const base: RuntimeDocumentResult = {
    questionId: params.candidate.questionId,
    candidateId: params.candidate.candidateId,
    documentId,
    state: "inaccessible",
    mimeType: null,
    byteLength: 0,
    locatorIds: [],
    reasonCodes: [],
  };
  if (!params.ports.destination || !params.ports.retrieval) return { result: { ...base, reasonCodes: ["retrieval_provider_disabled"] }, internal: null };
  if (expired(params.ports, params.startedAtMs, profile.globalWallTimeMs)) return { result: { ...base, state: "retrieval_timeout", reasonCodes: ["global_wall_time_exhausted"] }, internal: null };
  const operation = operationId(params.input.runId, "retrieval", params.sequence);
  try {
    params.ledger.reserveMany([
      { reservationId: `${operation}:document`, operationId: operation, dimension: "retrieval_documents", amount: 1 },
      { reservationId: `${operation}:bytes`, operationId: operation, dimension: "retrieval_bytes", amount: profile.maxRetrievalBytesPerDocument },
    ]);
  } catch (error) {
    if (error instanceof IntelligenceBudgetExceeded) return { result: { ...base, reasonCodes: [`budget_exhausted:${error.dimension}`] }, internal: null };
    throw error;
  }
  const authorizedRedirectPermits = new Map<string, ReturnType<typeof createDestinationPermit>>();
  let observedStreamedBytes = 0;
  const controller = new AbortController();
  const timed = await runRemote({ guard: params.guard, operationId: operation, ports: params.ports, timeoutMs: boundedTimeout(params.ports, params.startedAtMs, profile.globalWallTimeMs, profile.retrievalTimeoutMs), operation: async () => {
    const normalizedCandidateUrl = new URL(params.candidate.url).toString();
    const resolution = await params.ports.destination!.resolve(params.candidate.candidateId, normalizedCandidateUrl);
    if (resolution.candidateId !== params.candidate.candidateId || resolution.normalizedUrl !== normalizedCandidateUrl) throw new Error("retrieval_destination_resolution_identity_mismatch");
    const permit = createDestinationPermit({
      candidateId: params.candidate.candidateId,
      rawUrl: params.candidate.url,
      resolvedAddresses: resolution.addresses,
      permitId: resolution.permitId,
      nowMs: params.ports.clock.nowMs(),
      ttlMs: profile.retrievalTimeoutMs,
    });
    authorizedRedirectPermits.set(permit.permitId, permit);
    const response = await params.ports.retrieval!.retrieve({
      reservationId: `${operation}:document`,
      questionId: params.candidate.questionId,
      candidateId: params.candidate.candidateId,
      documentId,
      permit,
      maximumBytes: profile.maxRetrievalBytesPerDocument,
      httpsOnly: true,
      logicalAttempt: 1,
      signal: controller.signal,
      recordReceivedBytes: (cumulativeBytes) => {
        if (!Number.isInteger(cumulativeBytes) || cumulativeBytes < observedStreamedBytes || cumulativeBytes > profile.maxRetrievalBytesPerDocument) {
          controller.abort();
          return "abort";
        }
        observedStreamedBytes = cumulativeBytes;
        return "continue";
      },
      authorizeRedirect: async (rawUrl) => {
        const normalizedUrl = new URL(rawUrl).toString();
        const redirectResolution = await params.ports.destination!.resolve(params.candidate.candidateId, normalizedUrl);
        if (redirectResolution.candidateId !== params.candidate.candidateId || redirectResolution.normalizedUrl !== normalizedUrl) {
          throw new Error("redirect_destination_resolution_identity_mismatch");
        }
        const redirectPermit = createDestinationPermit({ candidateId: params.candidate.candidateId, rawUrl: normalizedUrl, resolvedAddresses: redirectResolution.addresses, permitId: redirectResolution.permitId, nowMs: params.ports.clock.nowMs(), ttlMs: profile.retrievalTimeoutMs });
        authorizedRedirectPermits.set(redirectPermit.permitId, redirectPermit);
        return redirectPermit;
      },
    });
    return { permit, response };
  } });
  if (timed.status !== "completed") {
    if (timed.status === "failed" && timed.reasonCode === "remote_concurrency_limit_reached") {
      params.ledger.release(`${operation}:document`); params.ledger.release(`${operation}:bytes`);
    } else {
      params.ledger.settle(`${operation}:document`, { state: timed.status === "timeout" ? "timeout" : "failed", usageKnown: false });
      params.ledger.settle(`${operation}:bytes`, { state: timed.status === "timeout" ? "timeout" : "failed", usageKnown: false });
    }
    controller.abort();
    return { result: { ...base, state: timed.status === "timeout" ? "retrieval_timeout" : "safety_blocked", reasonCodes: [timed.status === "timeout" ? "retrieval_timeout" : safeReasonCode(timed.reasonCode)] }, internal: null };
  }
  const { permit, response } = timed.value;
  const issues = validateRetrievalResponse({ candidate: params.candidate, documentId, permit, response, nowMs: params.ports.clock.nowMs(), maximumBytes: profile.maxRetrievalBytesPerDocument, authorizedRedirectPermits, observedStreamedBytes });
  if (response.status === "retrieved" && response.content && response.mimeType) issues.push(...validateContentSignature(response.mimeType, response.content));
  if (issues.length > 0 || response.status !== "retrieved" || !response.content || !response.mimeType) {
    params.ledger.settle(`${operation}:document`, { state: "failed" });
    params.ledger.settle(`${operation}:bytes`, { state: "failed", usageKnown: response.byteLength >= 0, ...(response.byteLength >= 0 ? { actualAmount: Math.min(response.byteLength, profile.maxRetrievalBytesPerDocument) } : {}) });
    params.securityEvents.push(...issues.map((issue, index) => ({ eventId: `${operation}-security-${index + 1}`, category: "malformed_provider_output_rejected" as const, disposition: "rejected" as const, stage: "retrieval" })));
    response.content?.fill(0);
    return { result: { ...base, state: response.status === "safety_blocked" || issues.length > 0 ? "safety_blocked" : "inaccessible", mimeType: response.mimeType, byteLength: response.byteLength, reasonCodes: issues.length > 0 ? [...new Set(issues)] : [`retrieval_${response.status}`] }, internal: null };
  }
  params.ledger.settle(`${operation}:document`, { state: "completed", actualAmount: 1 });
  params.ledger.settle(`${operation}:bytes`, { state: "completed", actualAmount: response.byteLength });
  if (!params.ports.extraction) {
    response.content.fill(0);
    return { result: { ...base, state: "unsupported_content_type", mimeType: response.mimeType, byteLength: response.byteLength, reasonCodes: ["document_extractor_disabled"] }, internal: null };
  }
  if (expired(params.ports, params.startedAtMs, profile.globalWallTimeMs)) {
    response.content.fill(0);
    return { result: { ...base, state: "retrieval_timeout", mimeType: response.mimeType, byteLength: response.byteLength, reasonCodes: ["global_wall_time_exhausted"] }, internal: null };
  }
  const extractionOperation = operationId(params.input.runId, "extraction", params.sequence);
  const contentFingerprint = createHash("sha256").update(response.content).digest("hex");
  try {
    params.ledger.reserve({ reservationId: `${extractionOperation}:call`, operationId: extractionOperation, dimension: "pdf_extractions", amount: 1 });
  } catch (error) {
    if (error instanceof IntelligenceBudgetExceeded) {
      response.content.fill(0);
      return { result: { ...base, state: "extraction_failed", mimeType: response.mimeType, byteLength: response.byteLength, reasonCodes: [`budget_exhausted:${error.dimension}`] }, internal: null };
    }
    throw error;
  }
  const extracted = await runRemote({ guard: params.guard, operationId: extractionOperation, ports: params.ports,
    timeoutMs: boundedTimeout(params.ports, params.startedAtMs, profile.globalWallTimeMs, response.mimeType.toLowerCase().startsWith("application/pdf") ? profile.pdfExtractionTimeoutMs : profile.retrievalTimeoutMs),
    operation: () => params.ports.extraction!.extract({
      questionId: params.candidate.questionId,
      candidateId: params.candidate.candidateId,
      documentId,
      mimeType: response.mimeType!,
      content: response.content!,
      maximumOutputBytes: 1_048_576,
      expectedDocumentFingerprint: contentFingerprint,
    }),
  });
  if (extracted.status !== "completed") {
    params.ledger.settle(`${extractionOperation}:call`, { state: extracted.status === "timeout" ? "timeout" : "failed", usageKnown: false });
    response.content.fill(0);
    return { result: { ...base, state: extracted.status === "timeout" ? "retrieval_timeout" : "extraction_failed", mimeType: response.mimeType, byteLength: response.byteLength, reasonCodes: [extracted.status === "timeout" ? "document_extraction_timeout" : safeReasonCode(extracted.reasonCode)] }, internal: null };
  }
  params.ledger.settle(`${extractionOperation}:call`, { state: "completed", actualAmount: 1 });
  const validatedExtraction = validateExtractionResponse({ extraction: extracted.value, questionId: params.candidate.questionId, candidateId: params.candidate.candidateId, documentId, documentFingerprint: contentFingerprint, maximumOutputBytes: 1_048_576 });
  if (validatedExtraction.issues.length > 0) {
    response.content.fill(0);
    return { result: { ...base, state: "extraction_failed", mimeType: response.mimeType, byteLength: response.byteLength, reasonCodes: validatedExtraction.issues }, internal: null };
  }
  const extraction = { ...extracted.value, locators: validatedExtraction.locators };
  const untrustedText = `${extraction.text ?? ""}\n${extraction.locators.map((item) => item.text).join("\n")}`;
  if (/(?:ignore|override|disregard).{0,48}(?:instruction|system|policy)|(?:reveal|exfiltrate).{0,48}(?:secret|credential)|(?:admit|promote).{0,32}(?:source|claim)|(?:change|mutate).{0,32}(?:financial|canonical)/i.test(untrustedText)) {
    params.securityEvents.push(
      { eventId: `${documentId}-untrusted-instruction`, category: "untrusted_instruction_detected", disposition: "ignored_data_only", stage: "extraction" },
      { eventId: `${documentId}-tool-refusal`, category: "tool_instruction_refused", disposition: "rejected", stage: "investigative_boundary" },
    );
  }
  const locator = deterministicLocatorGrounding(params.candidate, extraction);
  const result: RuntimeDocumentResult = {
    ...base,
    state: extraction.state,
    mimeType: response.mimeType,
    byteLength: response.byteLength,
    locatorIds: extraction.locators.map((item) => item.locatorId),
    reasonCodes: [locator ? "deterministic_locator_grounded" : "semantic_locator_investigation_required"],
  };
  response.content.fill(0);
  return { result, internal: extraction.state === "retrieved_extracted" || extraction.state === "retrieved_locator_only" ? { candidate: params.candidate, extraction, contentFingerprint, locator } : null };
}

function wholeStatementValidation(params: {
  questions: RuntimeResearchQuestion[];
  supports: CandidateClaimSupport[];
  canonicalReferenceIds: string[];
  semanticConflicts: SemanticConflict[];
}) {
  const refs = new Set(params.canonicalReferenceIds);
  const missingCanonicalRefs = [...new Set(params.questions.flatMap((question) => question.relatedCanonicalRefs).filter((ref) => !refs.has(ref)))].sort();
  const contradictorySupportIds: string[] = [];
  for (const question of params.questions) {
    const supports = params.supports.filter((support) => support.questionId === question.questionId);
    if (supports.some((support) => support.verificationStatus === "supported_candidate") && supports.some((support) => support.verificationStatus === "contradicted")) {
      contradictorySupportIds.push(...supports.map((support) => support.supportId));
    }
  }
  const unresolvedQuestionIds = params.questions.filter((question) => question.selection === "selected"
    && !params.supports.some((support) => support.questionId === question.questionId && support.verificationStatus === "supported_candidate"))
    .map((question) => question.questionId);
  return {
    status: missingCanonicalRefs.length > 0 || params.semanticConflicts.length > 0 ? "invalid" as const : "completed" as const,
    missingCanonicalRefs,
    contradictorySupportIds: [...new Set(contradictorySupportIds)].sort(),
    semanticConflictQuestionIds: params.semanticConflicts.map((item) => item.questionId).sort(),
    unresolvedQuestionIds,
    providerReview: "disabled_no_provider" as const,
  };
}

function safeDiagnostics(params: {
  statuses: Record<string, RuntimeStageStatus>;
  questions: RuntimeResearchQuestion[];
  attempts: SearchAttempt[];
  candidates: DiscoveryCandidate[];
  documents: RuntimeDocumentResult[];
  supports: CandidateClaimSupport[];
  packets: unknown[];
  startedAtMs: number;
  ports: IntelligencePorts;
  tokenUsage: number | "unknown";
  reasonCodes: string[];
}): IntelligenceDiagnostic {
  const safeCapabilityCode = (value: string | undefined): string | null => {
    if (!value || !/^[a-z][a-z0-9_]{0,63}$/.test(value) || /(?:secret|credential|tenant|account|filename|source_hash)/.test(value)) return null;
    return value;
  };
  return {
    schemaVersion: "canonical_intelligence_v2_diagnostics_v1",
    stageStatuses: { ...params.statuses },
    counts: {
      questionCount: params.questions.length,
      selectedQuestionCount: params.questions.filter((item) => item.selection === "selected").length,
      rfResolvedCount: params.questions.filter((item) => item.eligibility === "rf_resolved").length,
      researchedCount: new Set(params.attempts.map((item) => item.questionId)).size,
      searchAttemptCount: params.attempts.length,
      candidateCount: params.candidates.length,
      documentCount: params.documents.length,
      supportedCandidateCount: params.supports.filter((item) => item.verificationStatus === "supported_candidate").length,
      candidatePacketCount: params.packets.length,
    },
    elapsedMs: { total: Math.max(0, params.ports.clock.nowMs() - params.startedAtMs) },
    providerCodes: [...new Set([params.ports.search?.providerCode, params.ports.investigative?.providerCode, params.ports.semantic?.providerCode, params.ports.language?.providerCode].map(safeCapabilityCode).filter((item): item is string => item !== null))].sort(),
    modelCodes: [...new Set([params.ports.investigative?.modelCode, params.ports.semantic?.modelCode, params.ports.language?.modelCode].map(safeCapabilityCode).filter((item): item is string => item !== null))].sort(),
    tokenUsage: params.tokenUsage,
    reasonCodes: [...new Set(params.reasonCodes)].sort(),
  };
}

async function runBoundedIntelligenceRuntimeInternal(
  input: BoundedIntelligenceRuntimeInput,
  ports: IntelligencePorts,
): Promise<BoundedIntelligenceRuntimeResult> {
  safeRunId(input.runId);
  const profile = input.profile ?? RG_FREE_V1_BUDGET;
  const budgetIssues = validateRgFreeV1Budget(profile);
  if (budgetIssues.length > 0) throw new Error(budgetIssues.join(","));
  validatePublicSourceAuthorityAdmissions(input.publicSourceAuthorityAdmissions);
  const contextBindings = input.providerQuestionContexts ?? [];
  if (new Set(contextBindings.map((item) => item.unknownRef)).size !== contextBindings.length) throw new Error("duplicate_provider_question_context");
  for (const binding of contextBindings) {
    if (!input.unknownQueue.some((item) => item.id === binding.unknownRef)) throw new Error("provider_question_context_unknown_mismatch");
    assertProviderSafeQuestionContext(binding.context);
  }
  if (new Set(input.languageInputs.map((item) => item.itemId)).size !== input.languageInputs.length) throw new Error("duplicate_theme_language_item_identity");
  for (const languageInput of input.languageInputs) {
    const issues = validateThemeLanguageInput(languageInput, input.canonicalReferenceIds);
    if (issues.length > 0) throw new Error(issues.join(","));
  }
  const ledger = new IntelligenceBudgetLedger(profile);
  const guard = new RemoteConcurrencyGuard(profile.maxRemoteConcurrency);
  const startedAtMs = ports.clock.nowMs();
  const canonicalBefore = canonicalJson(input.canonicalTruth);
  const statuses: Record<string, RuntimeStageStatus> = {};
  const reasonCodes: string[] = [];
  let tokenUsage: number | "unknown" = 0;
  const securityEvents: RuntimeSecurityEvent[] = [];

  const questions = planRuntimeResearchQuestions({
    entries: input.admittedKnowledge,
    unknownQueue: input.unknownQueue,
    origins: input.questionOrigins,
    deterministicallyNotApplicableUnknownRefs: input.deterministicNotApplicableUnknownRefs,
    maximumSelectedQuestions: profile.maxSelectedQuestions,
  });
  stage(statuses, "research_planning", "completed");

  const searchAttempts: SearchAttempt[] = [];
  const candidates: DiscoveryCandidate[] = [];
  const retainedCandidateIds = new Set<string>();
  let searchSequence = 0;
  for (const question of questions.filter((item) => item.selection === "selected")) {
    searchSequence += 1;
    const initial = await performSearch({ input, question, kind: "initial", sequence: searchSequence, existingCandidates: [], ports, ledger, startedAtMs, adaptiveReason: null, guard });
    searchAttempts.push(initial.attempt);
    if (initial.attempt.status !== "completed") reasonCodes.push(...initial.attempt.reasonCodes);
    for (const candidate of initial.candidates) {
      if (retainedCandidateIds.has(candidate.candidateId)) { initial.attempt.status = "failed"; initial.attempt.reasonCodes.push("candidate_identity_cross_question_rejected"); reasonCodes.push("candidate_identity_cross_question_rejected"); continue; }
      retainedCandidateIds.add(candidate.candidateId); candidates.push(candidate);
    }
    const permittedAdaptive = initial.responseAdaptiveReason !== null && ["right_program_wrong_period", "official_subsection_missing", "publication_version_missing"].includes(initial.responseAdaptiveReason);
    if (permittedAdaptive && initial.candidates.length > 0 && initial.candidates.length < profile.maxCandidatesPerQuestion && !expired(ports, startedAtMs, profile.globalWallTimeMs)) {
      searchSequence += 1;
      const adaptive = await performSearch({ input, question, kind: "adaptive", sequence: searchSequence, existingCandidates: initial.candidates, ports, ledger, startedAtMs, adaptiveReason: initial.responseAdaptiveReason, guard });
      searchAttempts.push(adaptive.attempt);
      if (adaptive.attempt.status !== "completed") reasonCodes.push(...adaptive.attempt.reasonCodes);
      for (const candidate of adaptive.candidates) {
        if (retainedCandidateIds.has(candidate.candidateId)) { adaptive.attempt.status = "failed"; adaptive.attempt.reasonCodes.push("candidate_identity_cross_question_rejected"); reasonCodes.push("candidate_identity_cross_question_rejected"); continue; }
        retainedCandidateIds.add(candidate.candidateId); candidates.push(candidate);
      }
    }
  }
  stage(statuses, "discovery", !ports.search ? "disabled_no_provider" : candidates.length > 0 ? "completed_with_candidates" : "no_candidates");

  const documents: RuntimeDocumentResult[] = [];
  const internalDocuments: InternalDocument[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const retrieved = await retrieveCandidate({ input, candidate: candidates[index]!, ports, ledger, sequence: index + 1, startedAtMs, guard, securityEvents });
    documents.push(retrieved.result);
    if (retrieved.internal) internalDocuments.push(retrieved.internal);
  }
  stage(statuses, "retrieval", internalDocuments.length > 0 ? "completed" : candidates.length === 0 ? "not_needed" : !ports.retrieval ? "disabled_no_provider" : "completed_no_support");

  const observations: InvestigativeObservation[] = [];
  const localObservationOriginByItem = new Map<string, { questionId: string; unknownRef: string; providerContextId: string | null }>();
  const investigativeItems = internalDocuments.filter((document) => document.locator !== null).slice(0, profile.maxSemanticSupportItems).map((document, index) => {
    const question = questions.find((item) => item.questionId === document.candidate.questionId)!;
    const questionContext = contextBindings.find((item) => item.unknownRef === question.originatingUnknownRef)?.context;
    if (questionContext) assertProviderSafeQuestionContext(questionContext);
    const itemId = operationId(input.runId, "investigative-item", index + 1);
    localObservationOriginByItem.set(itemId, { questionId: question.questionId, unknownRef: question.originatingUnknownRef,
      providerContextId: questionContext?.providerContextId ?? null });
    return {
      itemId,
      questionId: document.candidate.questionId,
      candidateId: document.candidate.candidateId,
      documentId: document.extraction.documentId,
      documentFingerprint: document.extraction.documentFingerprint,
      text: (document.extraction.text ?? document.extraction.locators.map((item) => item.text).join("\n")).slice(0, 131_072),
      locators: [document.locator!].map(({ locatorId, documentId, documentFingerprint, page, sectionCode, lineStart, lineEnd }) => ({ locatorId, documentId, documentFingerprint, page, sectionCode, lineStart, lineEnd })),
      ...(questionContext ? { questionContext } : {}),
    };
  });
  if (ports.investigative && investigativeItems.length > 0) {
    const batchCount = Math.ceil(investigativeItems.length / profile.maxStructuredItemsPerBatch);
    const reservationIds: string[] = [];
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      if (expired(ports, startedAtMs, profile.globalWallTimeMs)) { reasonCodes.push("global_wall_time_exhausted"); break; }
      const callId = operationId(input.runId, "investigative", batchIndex + 1);
      try {
        ledger.reserveMany([
          { reservationId: `${callId}:call`, operationId: callId, dimension: "investigative_ai_calls", amount: 1 },
          { reservationId: `${callId}:tokens`, operationId: callId, dimension: "model_output_tokens", amount: profile.maxInvestigativeOutputTokensPerCall },
        ]);
        reservationIds.push(`${callId}:call`);
      } catch (error) {
        if (error instanceof IntelligenceBudgetExceeded) { reasonCodes.push(`budget_exhausted:${error.dimension}`); break; }
        throw error;
      }
    }
    const batchedItems = investigativeItems.slice(0, reservationIds.length * profile.maxStructuredItemsPerBatch);
    const batches = partitionStructuredItems({ runId: operationId(input.runId, "provider", 1), stageCode: "investigative", schemaVersion: "investigative_observation_v1", reservationIds, items: batchedItems, maximumItemsPerBatch: profile.maxStructuredItemsPerBatch, maximumOutputTokens: profile.maxInvestigativeOutputTokensPerCall });
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]!;
      const callId = operationId(input.runId, "investigative", batchIndex + 1);
      if (expired(ports, startedAtMs, profile.globalWallTimeMs)) {
        ledger.release(`${callId}:call`);
        ledger.release(`${callId}:tokens`);
        reasonCodes.push("global_wall_time_exhausted");
        continue;
      }
      const result = await runRemote({ guard, operationId: callId, ports, timeoutMs: boundedTimeout(ports, startedAtMs, profile.globalWallTimeMs, profile.investigativeAiTimeoutMs), operation: () => ports.investigative!.investigate(batch) });
      if (result.status !== "completed") {
        if (result.status === "failed" && result.reasonCode === "remote_concurrency_limit_reached") { ledger.release(`${callId}:call`); ledger.release(`${callId}:tokens`); }
        else { ledger.settle(`${callId}:call`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false }); ledger.settle(`${callId}:tokens`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false }); }
        reasonCodes.push(result.status === "timeout" ? "investigative_timeout" : safeReasonCode(result.reasonCode));
        continue;
      }
      const issues = validateStructuredBatchResponse(batch, result.value);
      for (const [index, raw] of result.value.items.entries()) {
        const expected = batch.items[index];
        if (expected) issues.push(...validateInvestigativeMember(raw, { ...expected, claimType: questions.find((question) => question.questionId === expected.questionId)!.claimType,
          subjectCode: questions.find((question) => question.questionId === expected.questionId)!.subjectCode,
          sourceAuthority: internalDocuments.find((document) => document.candidate.candidateId === expected.candidateId)!.candidate.claimedAuthority }));
      }
      if (issues.length > 0) {
        if (issues.includes("investigative_authority_strengthening")) securityEvents.push({ eventId: `${callId}-authority-strengthening`, category: "authority_strengthening_rejected", disposition: "rejected", stage: "investigative_intelligence" });
        securityEvents.push({ eventId: `${callId}-malformed-output`, category: "malformed_provider_output_rejected", disposition: "rejected", stage: "investigative_intelligence" });
        ledger.settle(`${callId}:call`, { state: "failed" });
        const tokens = result.value.reportedOutputTokens;
        ledger.settle(`${callId}:tokens`, tokens !== null && tokens <= profile.maxInvestigativeOutputTokensPerCall ? { state: "failed", actualAmount: tokens } : { state: "failed", usageKnown: false });
        reasonCodes.push(...issues);
        continue;
      }
      ledger.settle(`${callId}:call`, { state: "completed", actualAmount: 1 });
      ledger.settle(`${callId}:tokens`, { state: "completed", usageKnown: result.value.reportedOutputTokens !== null, ...(result.value.reportedOutputTokens !== null ? { actualAmount: result.value.reportedOutputTokens } : {}) });
      if (result.value.reportedOutputTokens === null) tokenUsage = "unknown";
      else if (tokenUsage !== "unknown") tokenUsage += result.value.reportedOutputTokens;
      for (const raw of result.value.items) {
        const observation = asInvestigativeObservation(raw);
        const document = internalDocuments.find((item) => item.candidate.questionId === observation.questionId && item.candidate.candidateId === observation.candidateId && item.extraction.documentId === observation.documentId);
        const localOrigin = localObservationOriginByItem.get(observation.itemId);
        if (document && localOrigin?.questionId === observation.questionId
          && questions.find((item) => item.questionId === observation.questionId)?.originatingUnknownRef === localOrigin.unknownRef
          && bindInvestigativeLocator({ observation, extraction: document.extraction, expectedLocatorId: document.locator?.locatorId ?? null })) observations.push(observation);
        else reasonCodes.push("investigative_locator_or_parent_identity_rejected");
      }
    }
    stage(statuses, "investigative_intelligence", observations.length > 0 ? "completed" : "completed_no_support");
  } else {
    stage(statuses, "investigative_intelligence", investigativeItems.length === 0 ? "not_needed" : "disabled_no_provider");
  }
  for (const item of investigativeItems) item.text = "";
  for (const document of internalDocuments) document.extraction.text = null;

  const semanticInputs: SemanticVerificationInput[] = observations.map((observation) => {
    const question = questions.find((item) => item.questionId === observation.questionId)!;
    const document = internalDocuments.find((item) => item.candidate.candidateId === observation.candidateId && item.extraction.documentId === observation.documentId)!;
    const locator = bindInvestigativeLocator({ observation, extraction: document.extraction, expectedLocatorId: document.locator?.locatorId ?? null })!;
    return {
      itemId: observation.itemId,
      question: {
        questionId: question.questionId,
        claimType: question.claimType,
        subjectCode: question.subjectCode,
        asOf: question.asOf,
        scope: providerSafeScope(question.scope),
        requiredSourceAuthorities: [...question.requiredSourceAuthorities],
        requiredEvidenceClasses: [...question.requiredEvidenceClasses],
        possibleAnswerCodes: [...question.possibleAnswerCodes],
        limitations: [...question.limitations],
      },
      candidate: candidateWithoutUrl(document.candidate),
      documentId: document.extraction.documentId,
      locator,
      proposedValue: observation.proposedValue,
    };
  }).slice(0, profile.maxSemanticSupportItems);
  const supports: CandidateClaimSupport[] = [];
  const acceptedSupportIds = new Set<string>();
  if (ports.semantic && semanticInputs.length > 0) {
    const batchCount = Math.ceil(semanticInputs.length / profile.maxStructuredItemsPerBatch);
    const reservationIds: string[] = [];
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      if (expired(ports, startedAtMs, profile.globalWallTimeMs)) { reasonCodes.push("global_wall_time_exhausted"); break; }
      const callId = operationId(input.runId, "semantic", batchIndex + 1);
      try {
        const itemCount = Math.min(profile.maxStructuredItemsPerBatch, semanticInputs.length - batchIndex * profile.maxStructuredItemsPerBatch);
        ledger.reserveMany([
          { reservationId: `${callId}:call`, operationId: callId, dimension: "semantic_verification_calls", amount: 1 },
          { reservationId: `${callId}:items`, operationId: callId, dimension: "semantic_support_items", amount: itemCount },
          { reservationId: `${callId}:tokens`, operationId: callId, dimension: "model_output_tokens", amount: profile.maxSemanticOutputTokensPerCall },
        ]);
        reservationIds.push(`${callId}:call`);
      } catch (error) {
        if (error instanceof IntelligenceBudgetExceeded) { reasonCodes.push(`budget_exhausted:${error.dimension}`); break; }
        throw error;
      }
    }
    const batchedItems = semanticInputs.slice(0, reservationIds.length * profile.maxStructuredItemsPerBatch);
    const batches = partitionStructuredItems({ runId: operationId(input.runId, "provider", 2), stageCode: "semantic", schemaVersion: "semantic_verification_v1", reservationIds, items: batchedItems, maximumItemsPerBatch: profile.maxStructuredItemsPerBatch, maximumOutputTokens: profile.maxSemanticOutputTokensPerCall });
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]!;
      const callId = operationId(input.runId, "semantic", batchIndex + 1);
      if (expired(ports, startedAtMs, profile.globalWallTimeMs)) {
        ledger.release(`${callId}:call`);
        ledger.release(`${callId}:items`);
        ledger.release(`${callId}:tokens`);
        reasonCodes.push("global_wall_time_exhausted");
        continue;
      }
      const result = await runRemote({ guard, operationId: callId, ports, timeoutMs: boundedTimeout(ports, startedAtMs, profile.globalWallTimeMs, profile.semanticVerificationTimeoutMs), operation: () => ports.semantic!.verify(batch) });
      const itemReservation = `${callId}:items`;
      if (result.status !== "completed") {
        if (result.status === "failed" && result.reasonCode === "remote_concurrency_limit_reached") { ledger.release(`${callId}:call`); ledger.release(itemReservation); ledger.release(`${callId}:tokens`); }
        else { ledger.settle(`${callId}:call`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false }); ledger.settle(itemReservation, { state: result.status === "timeout" ? "timeout" : "failed" }); ledger.settle(`${callId}:tokens`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false }); }
        reasonCodes.push(result.status === "timeout" ? "semantic_timeout" : safeReasonCode(result.reasonCode));
        continue;
      }
      const issues = validateStructuredBatchResponse(batch, result.value);
      for (const [index, raw] of result.value.items.entries()) {
        const expected = batch.items[index];
        if (expected) issues.push(...validateSemanticMember(raw, expected));
      }
      if (issues.length > 0) {
        if (issues.includes("semantic_authority_strengthening")) securityEvents.push({ eventId: `${callId}-authority-strengthening`, category: "authority_strengthening_rejected", disposition: "rejected", stage: "semantic_verification" });
        securityEvents.push({ eventId: `${callId}-malformed-output`, category: "malformed_provider_output_rejected", disposition: "rejected", stage: "semantic_verification" });
        ledger.settle(`${callId}:call`, { state: "failed" });
        ledger.settle(itemReservation, { state: "failed" });
        const tokens = result.value.reportedOutputTokens;
        ledger.settle(`${callId}:tokens`, tokens !== null && tokens <= profile.maxSemanticOutputTokensPerCall ? { state: "failed", actualAmount: tokens } : { state: "failed", usageKnown: false });
        reasonCodes.push(...issues);
        continue;
      }
      ledger.settle(`${callId}:call`, { state: "completed", actualAmount: 1 });
      ledger.settle(itemReservation, { state: "completed", actualAmount: batch.items.length });
      ledger.settle(`${callId}:tokens`, { state: "completed", usageKnown: result.value.reportedOutputTokens !== null, ...(result.value.reportedOutputTokens !== null ? { actualAmount: result.value.reportedOutputTokens } : {}) });
      if (result.value.reportedOutputTokens === null) tokenUsage = "unknown";
      else if (tokenUsage !== "unknown") tokenUsage += result.value.reportedOutputTokens;
      for (const raw of result.value.items) {
        const support = asCandidateClaimSupport(raw);
        if (acceptedSupportIds.has(support.supportId)) { reasonCodes.push("duplicate_semantic_support_identity_rejected"); continue; }
        acceptedSupportIds.add(support.supportId);
        const semanticInput = batch.items.find((item) => item.itemId === support.itemId);
        if (!semanticInput) { reasonCodes.push("semantic_support_parent_identity_rejected"); continue; }
        const fullQuestion = questions.find((question) => question.questionId === semanticInput.question.questionId);
        const localOrigin = localObservationOriginByItem.get(support.itemId);
        if (!fullQuestion || !localOrigin || localOrigin.questionId !== fullQuestion.questionId || localOrigin.unknownRef !== fullQuestion.originatingUnknownRef) {
          reasonCodes.push("semantic_observation_origin_identity_rejected"); continue;
        }
        const validated = validateSemanticSupport({ question: fullQuestion, candidate: semanticInput.candidate, locator: semanticInput.locator, support, expectedObservationId: semanticInput.itemId, expectedProposedValue: semanticInput.proposedValue });
        supports.push({ ...support, verificationStatus: validated.status, limitationCodes: [...new Set([...support.limitationCodes, ...validated.reasonCodes])] });
      }
    }
    stage(statuses, "semantic_verification", supports.some((item) => item.verificationStatus === "supported_candidate") ? "completed_with_candidates" : "completed_no_support");
  } else {
    stage(statuses, "semantic_verification", semanticInputs.length === 0 ? "not_needed" : "disabled_no_provider");
  }

  const semanticConflicts = detectSemanticConflicts(questions, supports);
  const candidatePackets = supports.filter((support) => support.verificationStatus === "supported_candidate").flatMap((support) => {
    const question = questions.find((item) => item.questionId === support.questionId);
    if (!question) return [];
    try {
      const conflict = semanticConflicts.find((item) => item.questionId === question.questionId);
      return [supportToKnowledgeCandidatePacket({ runId: input.runId, question, support, knownConflictCodes: conflict ? ["conflicting_supported_candidates"] : [] })];
    } catch (error) {
      reasonCodes.push(error instanceof Error ? error.message : "knowledge_candidate_ingress_failed");
      return [];
    }
  });
  const privateReviewBundles: PrivateResearchReviewBundle[] = supports.flatMap((support) => {
    const packet = candidatePackets.find((item) => item.candidateId.endsWith(support.supportId.replace(/[^A-Za-z0-9_.:-]+/g, "-").slice(0, 96)));
    const question = questions.find((item) => item.questionId === support.questionId);
    const candidate = candidates.find((item) => item.candidateId === support.candidateId);
    const document = internalDocuments.find((item) => item.extraction.documentId === support.documentId);
    const locator = document ? document.extraction.locators.find((item) => item.locatorId === support.locatorId) : undefined;
    if (!question?.scope.tenantRef || !question.scope.accountRef || !candidate?.authorityAdmissionRef || !document || !locator) return [];
    return [{ privacy: "account_private_ephemeral", persistence: "none", tenantRef: question.scope.tenantRef, accountRef: question.scope.accountRef,
      candidatePacketId: packet?.candidateId ?? null, questionId: question.questionId, candidateId: candidate.candidateId, sourceUrl: candidate.url,
      sourceTitle: candidate.title?.slice(0, 200) || candidate.sourceTypeCode, sourceAuthority: candidate.claimedAuthority,
      sourceAuthorityAdmissionRef: candidate.authorityAdmissionRef, documentId: document.extraction.documentId,
      documentFingerprint: document.extraction.documentFingerprint, locatorId: locator.locatorId, locatorPage: locator.page,
      locatorSectionCode: locator.sectionCode, locatorLineStart: locator.lineStart, locatorLineEnd: locator.lineEnd,
      locatorTextExcerpt: locator.text.slice(0, 512),
      supportId: support.supportId, semanticDecision: support.verificationStatus, limitationCodes: [...support.limitationCodes] }];
  });
  stage(statuses, "knowledge_candidate_output", candidatePackets.length > 0 ? "completed_with_candidates" : "completed_no_support");

  const fallbackById = new Map(input.languageInputs.map((item) => [item.itemId, deterministicThemeLanguageFallback(item)]));
  const languageCandidates = new Map(fallbackById);
  let languageProviderAccepted = 0;
  let languageProviderMalformed = false;
  let languageProviderTimedOut = false;
  let languageProviderFailed = false;
  let languageProviderBudgetExhausted = false;
  if (ports.language && input.languageInputs.length > 0) {
    const maximumProviderItems = profile.maxLanguageCalls * profile.maxStructuredItemsPerBatch;
    const providerItems = input.languageInputs.slice(0, maximumProviderItems);
    const batchCount = Math.ceil(providerItems.length / profile.maxStructuredItemsPerBatch);
    const reservationIds: string[] = [];
    for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
      if (expired(ports, startedAtMs, profile.globalWallTimeMs)) { reasonCodes.push("global_wall_time_exhausted"); break; }
      const callId = operationId(input.runId, "language", batchIndex + 1);
      try {
        ledger.reserveMany([
          { reservationId: `${callId}:call`, operationId: callId, dimension: "language_calls", amount: 1 },
          { reservationId: `${callId}:tokens`, operationId: callId, dimension: "model_output_tokens", amount: profile.maxLanguageOutputTokensPerCall },
        ]);
        reservationIds.push(`${callId}:call`);
      } catch (error) {
        if (error instanceof IntelligenceBudgetExceeded) { reasonCodes.push(`budget_exhausted:${error.dimension}`); languageProviderBudgetExhausted = true; break; }
        throw error;
      }
    }
    const batches = partitionStructuredItems({ runId: operationId(input.runId, "provider", 3), stageCode: "language", schemaVersion: "theme_language_candidate_v1", reservationIds, items: providerItems.slice(0, reservationIds.length * profile.maxStructuredItemsPerBatch), maximumItemsPerBatch: profile.maxStructuredItemsPerBatch, maximumOutputTokens: profile.maxLanguageOutputTokensPerCall });
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]!;
      const callId = operationId(input.runId, "language", batchIndex + 1);
      if (expired(ports, startedAtMs, profile.globalWallTimeMs)) {
        ledger.release(`${callId}:call`);
        ledger.release(`${callId}:tokens`);
        reasonCodes.push("global_wall_time_exhausted");
        continue;
      }
      const result = await runRemote({ guard, operationId: callId, ports, timeoutMs: boundedTimeout(ports, startedAtMs, profile.globalWallTimeMs, profile.languageTimeoutMs), operation: () => ports.language!.generate(batch) });
      if (result.status !== "completed") {
        if (result.status === "timeout") languageProviderTimedOut = true;
        else languageProviderFailed = true;
        if (result.status === "failed" && result.reasonCode === "remote_concurrency_limit_reached") { ledger.release(`${callId}:call`); ledger.release(`${callId}:tokens`); }
        else { ledger.settle(`${callId}:call`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false }); ledger.settle(`${callId}:tokens`, { state: result.status === "timeout" ? "timeout" : "failed", usageKnown: false }); }
        reasonCodes.push(result.status === "timeout" ? "language_timeout" : safeReasonCode(result.reasonCode));
        continue;
      }
      const issues = validateStructuredBatchResponse(batch, result.value);
      for (const [index, raw] of result.value.items.entries()) {
        const expected = batch.items[index];
        if (expected) issues.push(...validateLanguageMemberShape(raw, expected));
      }
      if (issues.length > 0) {
        languageProviderMalformed = true;
        ledger.settle(`${callId}:call`, { state: "failed" });
        const tokens = result.value.reportedOutputTokens;
        ledger.settle(`${callId}:tokens`, tokens !== null && tokens <= profile.maxLanguageOutputTokensPerCall ? { state: "failed", actualAmount: tokens } : { state: "failed", usageKnown: false });
        reasonCodes.push(...issues);
        continue;
      }
      ledger.settle(`${callId}:call`, { state: "completed", actualAmount: 1 });
      ledger.settle(`${callId}:tokens`, { state: "completed", usageKnown: result.value.reportedOutputTokens !== null, ...(result.value.reportedOutputTokens !== null ? { actualAmount: result.value.reportedOutputTokens } : {}) });
      if (result.value.reportedOutputTokens === null) tokenUsage = "unknown";
      else if (tokenUsage !== "unknown") tokenUsage += result.value.reportedOutputTokens;
      for (const raw of result.value.items) {
        const candidate = asThemeLanguageCandidate(raw);
        const item = batch.items.find((inputItem) => inputItem.itemId === candidate.itemId);
        if (!item) continue;
        const validated = validateThemeLanguageCandidate(item, candidate);
        languageCandidates.set(item.itemId, validated.candidate);
        if (validated.accepted) languageProviderAccepted += 1;
        reasonCodes.push(...validated.reasonCodes);
      }
    }
    stage(statuses, "merchant_language_provider", languageProviderAccepted > 0 ? "completed"
      : languageProviderMalformed ? "malformed_output"
        : languageProviderTimedOut ? "timeout"
          : languageProviderFailed ? "provider_unavailable"
            : languageProviderBudgetExhausted ? "budget_exhausted" : "completed_no_support");
    stage(statuses, "merchant_language_candidates", languageCandidates.size > 0 ? "completed" : "completed_no_support");
  } else {
    stage(statuses, "merchant_language_provider", input.languageInputs.length > 0 ? "disabled_no_provider" : "not_needed");
    stage(statuses, "merchant_language_candidates", languageCandidates.size > 0 ? "completed" : "not_needed");
  }

  const whole = wholeStatementValidation({ questions, supports, canonicalReferenceIds: input.canonicalReferenceIds, semanticConflicts });
  stage(statuses, "whole_statement_semantic_review", whole.status === "completed" ? "completed" : "malformed_output");
  const canonicalTruthPreserved = canonicalJson(input.canonicalTruth) === canonicalBefore;
  const rfConflictsPreserved = questions.filter((question) => question.rfResolution.status === "unresolved_conflict")
    .every((question) => question.eligibility === "unresolved_review_required" && question.selection === "not_eligible");
  const unresolvedOutcomeCodes = [...new Set(questions.flatMap((question) => {
    if (["merchant_pricing_document_required", "additional_statement_history_required", "processor_explanation_required", "public_evidence_unavailable", "unresolved_review_required"].includes(question.eligibility)) {
      return [question.eligibility as BoundedIntelligenceRuntimeResult["unresolvedOutcomeCodes"][number]];
    }
    if (question.selection === "selected" && !supports.some((support) => support.questionId === question.questionId && support.verificationStatus === "supported_candidate")) {
      return ["public_evidence_unavailable" as const];
    }
    return [];
  }))];
  if (!canonicalTruthPreserved) reasonCodes.push("unexpected_divergence:canonical_truth_mutated");
  if (!rfConflictsPreserved) reasonCodes.push("unexpected_divergence:rf_conflict_not_preserved");
  const diagnostics = safeDiagnostics({ statuses, questions, attempts: searchAttempts, candidates, documents, supports, packets: candidatePackets, startedAtMs, ports, tokenUsage, reasonCodes });
  const anyProvider = Boolean(ports.search || ports.retrieval || ports.investigative || ports.semantic || ports.language);
  return {
    schemaVersion: "canonical_intelligence_v2_runtime_v1",
    profile: "RG-FREE-v1",
    authority: "shadow_non_authoritative",
    persistence: "none",
    providerExecution: input.providerExecution ?? (anyProvider ? "injected_evaluation" : "provider_disabled"),
    questions,
    searchAttempts,
    candidates: candidates.map(candidateWithoutUrl),
    documents,
    supports,
    candidatePackets,
    privateReviewBundles,
    semanticConflicts,
    securityEvents,
    languageCandidates: [...languageCandidates.values()],
    wholeStatementValidation: whole,
    budget: ledger.snapshot(),
    diagnostics,
    semanticAmendments: [...RG_SEMANTIC_AMENDMENT_IDS],
    canonicalTruthPreserved,
    rfConflictsPreserved,
    automaticAdmissionCount: 0,
    terminalStatus: !canonicalTruthPreserved || !rfConflictsPreserved || whole.status === "invalid"
      ? "invalid"
      : !anyProvider
        ? "disabled_no_provider"
        : unresolvedOutcomeCodes.length > 0
          ? "completed_unresolved"
          : "completed",
    unresolvedOutcomeCodes,
  };
}

export async function runBoundedIntelligenceRuntime(
  input: BoundedIntelligenceRuntimeInput,
  ports: IntelligencePorts,
): Promise<BoundedIntelligenceRuntimeResult> {
  try {
    return await runBoundedIntelligenceRuntimeInternal(input, ports);
  } catch {
    const ledger = new IntelligenceBudgetLedger(RG_FREE_V1_BUDGET);
    return {
      schemaVersion: "canonical_intelligence_v2_runtime_v1",
      profile: "RG-FREE-v1",
      authority: "shadow_non_authoritative",
      persistence: "none",
      providerExecution: input.providerExecution ?? "provider_disabled",
      questions: [], searchAttempts: [], candidates: [], documents: [], supports: [], candidatePackets: [], privateReviewBundles: [], semanticConflicts: [],
      securityEvents: [{ eventId: "rg-runtime-input-rejected", category: "malformed_provider_output_rejected", disposition: "rejected", stage: "runtime_boundary" }],
      languageCandidates: [],
      wholeStatementValidation: { status: "invalid", missingCanonicalRefs: [], contradictorySupportIds: [], semanticConflictQuestionIds: [], unresolvedQuestionIds: [], providerReview: "disabled_no_provider" },
      budget: ledger.snapshot(),
      diagnostics: { schemaVersion: "canonical_intelligence_v2_diagnostics_v1", stageStatuses: { runtime_boundary: "malformed_output" }, counts: {}, elapsedMs: { total: 0 }, providerCodes: [], modelCodes: [], tokenUsage: 0, reasonCodes: ["runtime_input_or_operation_rejected"] },
      semanticAmendments: [...RG_SEMANTIC_AMENDMENT_IDS], canonicalTruthPreserved: true, rfConflictsPreserved: true, automaticAdmissionCount: 0,
      terminalStatus: "invalid", unresolvedOutcomeCodes: [],
    };
  }
}
