import { createHash } from "node:crypto";
import type { CanonicalFeeCategory, CanonicalStatementAnalysis } from "./types.js";
import { calculateRuntimeClaimSupportDecisionRef } from "./feeKnowledgeClaimSupportDecision.js";
import { REVIEWED_DOMAIN_IDENTITY_POLICY, buildFeeKnowledgeSourcePacket, isVerifiedDocumentationDecision, type LegacyWholeStatementSourceRegistry } from "./feeKnowledgeRegistry.js";
import {
  FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
  FEE_KNOWLEDGE_POLICY_VERSION,
  FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
  type ApprovedFeeKnowledgeSourceRegistry,
  type FeeKnowledgeClaimSupportRecord,
  type FeeKnowledgeDomainIdentityPolicy,
  type FeeKnowledgeEvidenceDecision,
  type FeeKnowledgeIntelligenceRecord,
  type FeeKnowledgeResolutionRequirement,
  type FeeKnowledgeResearchAttemptRecord,
  type FeeKnowledgeResearchCandidateRecord,
  type FeeKnowledgeSemanticSupportDecision,
  type FeeKnowledgeSourcePacket,
  type FeeKnowledgeStructuredClaim,
} from "./feeKnowledgeTypes.js";
import {
  retrieveFeeKnowledgeDocument,
  validateClaimCitation,
  type RetrieveDocumentOptions,
  type RetrievedDocument,
  type SafeFetch,
} from "./feeKnowledgeRetrieval.js";
import { buildRetrievedDocumentIntelligence, buildStatementGroundedIntelligence } from "./feeKnowledgeIntelligence.js";
import {
  candidateEvidenceLocatorHash,
  feeKnowledgeInvestigativeIntelligenceEnabled,
  runFeeKnowledgeInvestigativeIntelligence,
  type FeeKnowledgeInvestigativeIntelligenceOptions,
} from "./feeKnowledgeInvestigativeIntelligence.js";
import { LIVE_EVALUATION_TIMEOUT_POLICY } from "../evaluationIntegrity/liveEvaluationTimeoutPolicy.js";
import { safeProviderFailureError, safeProviderPostResponseFailureError } from "./providerFailureDiagnostics.js";
import { emitRuntimeProgress, type RuntimeProgressReporter } from "../runtimeProgress.js";

export type FeeKnowledgeResearchLimits = {
  policyVersion: typeof FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION;
  maxSearchCalls: number;
  maxAdaptiveFollowUpCalls: number;
  maxRetrievalCandidates: number;
  maxAdaptiveFollowUpCandidates: number;
  totalDeadlineMs: number;
  maxResultCandidatesPerSearch: number;
};

export const FEE_KNOWLEDGE_RESEARCH_LIMITS = {
  policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
  maxSearchCalls: 4,
  maxAdaptiveFollowUpCalls: 1,
  maxRetrievalCandidates: 10,
  maxAdaptiveFollowUpCandidates: 2,
  totalDeadlineMs: LIVE_EVALUATION_TIMEOUT_POLICY.researchGraphTotalMs,
  maxResultCandidatesPerSearch: 4,
} as const satisfies FeeKnowledgeResearchLimits;

export const FEE_KNOWLEDGE_PRODUCT_RUNTIME_POLICY = {
  policyVersion: "fee_knowledge_product_runtime_policy_v1",
  totalDeadlineMs: 240_000,
  maxConcurrentSearchCalls: 4,
  webSearchCallTimeoutMs: 60_000,
  semanticVerificationCallTimeoutMs: 20_000,
  retrievedDocumentInvestigationMode: "when_deterministic_locator_missing",
  statementInvestigationMode: "whole_statement_runtime_owns_statement_interpretation",
} as const;

const DEFAULT_OPENAI_WEB_SEARCH_MODEL = "gpt-5";
export const OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS = 2_000;
export const WEB_SEARCH_PROVIDER_MAX_TOOL_CALLS = 1;
export const OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS = 2_000;
const WEB_SEARCH_MODEL_PATTERN = /^(gpt-5(?:$|-)|gpt-4\.1(?:$|-)|gpt-4o(?:-search-preview)?(?:$|-)|o3(?:$|-)|o4-mini(?:$|-))/i;

export type OpenAiWebSearchActionType = "search" | "open_page" | "find_in_page" | "other";

export type FeeKnowledgeResearchQuestion = {
  feeRowRef: string;
  sanitizedQuestionCategory: FeeKnowledgeResearchAttemptRecord["sanitizedQuestionCategory"];
  triggerReason: FeeKnowledgeResearchAttemptRecord["triggerReason"];
  processorOrNetwork: string | null;
  feeLabel: string;
  statementSection: string | null;
  statementPeriodYear: string | null;
  deterministicCategory: CanonicalFeeCategory | null;
  deterministicEconomicOwner: FeeKnowledgeStructuredClaim["likelyEconomicOwner"];
  deterministicContractualController: FeeKnowledgeStructuredClaim["likelyContractualController"];
  deterministicActionabilityCeiling: FeeKnowledgeStructuredClaim["actionabilityCeiling"];
  deterministicConfidence: FeeKnowledgeStructuredClaim["maximumConfidence"];
  semanticQuestion: string;
  adaptiveFollowUp?: FeeKnowledgeAdaptiveFollowUpContext | null;
};

export type FeeKnowledgeAdaptiveMissingDimension =
  | "fee_or_alias_missing"
  | "rate_rule_missing"
  | "processor_network_mismatch"
  | "period_mismatch"
  | "applicability_missing"
  | "authoritative_source_inaccessible";

export type FeeKnowledgeAdaptiveFollowUpContext = {
  parentQuestionRef: string;
  parentAttemptId: string;
  parentCandidateId: string | null;
  missingDimensions: FeeKnowledgeAdaptiveMissingDimension[];
  sourceReasonCodes: string[];
};

export function feeKnowledgeQuestionRef(question: FeeKnowledgeResearchQuestion, questionOrdinal: number): string {
  return `question_${canonicalSha256({
    type: "evaluation_sanitized_research_question_identity_v1",
    questionOrdinal: questionOrdinal + 1,
    ...question,
  })}`;
}

export type FeeKnowledgeDiscoveryCandidate = {
  url: string;
  title: string | null;
  publisher: string | null;
};

export type FeeKnowledgeSearchAdapter = (
  request: {
    attemptId: string;
    questions: readonly FeeKnowledgeResearchQuestion[];
    limits: FeeKnowledgeResearchLimits;
  },
  context: { abortSignal: AbortSignal },
) => Promise<FeeKnowledgeDiscoveryCandidate[]>;

export type FeeKnowledgeSemanticSupportAdapter = (
  request: {
    structuredClaim: FeeKnowledgeStructuredClaim;
    documentFingerprint: string;
    locatorTextHash: string;
    boundedEvidenceExcerpt: string;
    applicability: { processorOrNetwork: boolean; jurisdiction: boolean | null; transactionContext: boolean | null; statementPeriod: boolean };
  },
  context: { abortSignal: AbortSignal },
) => Promise<FeeKnowledgeSemanticSupportDecision>;

export type OpenAiResponsesSafeUsage = {
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  webSearchToolCalls: number;
  webSearchActionTypes: OpenAiWebSearchActionType[];
};

export type FeeKnowledgeResearchOptions = {
  enabled?: boolean;
  openAiApiKey?: string;
  openAiModelName?: string;
  adapter?: FeeKnowledgeSearchAdapter;
  semanticSupportAdapter?: FeeKnowledgeSemanticSupportAdapter;
  fetchImpl?: SafeFetch;
  resolveHost?: RetrieveDocumentOptions["resolveHost"];
  pdfExtractionTimeoutMs?: RetrieveDocumentOptions["pdfExtractionTimeoutMs"];
  pdfIsolationWorkerFactoryForTesting?: RetrieveDocumentOptions["pdfIsolationWorkerFactoryForTesting"];
  timeoutMs?: number;
  domainIdentityPolicy?: FeeKnowledgeDomainIdentityPolicy;
  investigativeIntelligence?: FeeKnowledgeInvestigativeIntelligenceOptions;
  progressReporter?: RuntimeProgressReporter;
};

export type FeeKnowledgeResearchResult = {
  attempts: FeeKnowledgeResearchAttemptRecord[];
  candidates: FeeKnowledgeResearchCandidateRecord[];
  intelligence: FeeKnowledgeIntelligenceRecord[];
  claimSupports: FeeKnowledgeClaimSupportRecord[];
  diagnostics: FeeKnowledgeResearchDiagnostics;
};

type FeeKnowledgeResearchCoreResult = Omit<FeeKnowledgeResearchResult, "diagnostics">;

export type FeeKnowledgeResearchDiagnostics = {
  policyVersion: "fee_knowledge_research_diagnostics_v1";
  enabled: boolean;
  questionCount: number;
  selectedQuestionCount: number;
  searchCallCount: number;
  searchAttemptStatusCounts: Record<string, number>;
  candidateCount: number;
  candidateContentTypeCounts: Record<"html" | "text" | "pdf" | "other_or_unknown", number>;
  retrievalAttemptCount: number;
  retrievalStatusCounts: Record<string, number>;
  retrievedPdf: {
    attemptCount: number;
    successfulCount: number;
    timedOutCount: number;
    failedCount: number;
    statusCounts: Record<string, number>;
    safeReasonCodes: string[];
  };
  investigative: {
    statement: {
      attempted: boolean;
      status: "disabled" | "completed" | "provider_unavailable" | "failed";
      outputRecordCount: number;
      safeReasonCodes: string[];
    };
    retrievedDocument: {
      attemptCount: number;
      statusCounts: Record<string, number>;
      outputRecordCount: number;
      safeReasonCodes: string[];
    };
  };
  semanticVerificationAttemptCount: number;
  semanticVerificationStatusCounts: Record<string, number>;
  claimSupportCount: number;
  verifiedClaimSupportCount: number;
  safeReasonCodes: string[];
  elapsedMs: number;
  stageElapsedMs: {
    planning: number;
    webSearchDiscovery: number;
    retrieval: number;
    statementInvestigativeIntelligence: number;
    retrievedDocumentInvestigativeIntelligence: number;
    semanticVerification: number;
  };
};

type MutableFeeKnowledgeResearchDiagnosticState = {
  startedAt: number;
  enabled: boolean;
  questionCount: number;
  selectedQuestionCount: number;
  searchCallCount: number;
  retrievalAttemptCount: number;
  statementInvestigativeAttempted: boolean;
  statementInvestigativeStatus: FeeKnowledgeResearchDiagnostics["investigative"]["statement"]["status"];
  statementInvestigativeOutputRecordCount: number;
  statementInvestigativeReasonCodes: Set<string>;
  retrievedInvestigativeAttemptCount: number;
  retrievedInvestigativeStatuses: string[];
  retrievedInvestigativeOutputRecordCount: number;
  retrievedInvestigativeReasonCodes: Set<string>;
  stageElapsedMs: FeeKnowledgeResearchDiagnostics["stageElapsedMs"];
};

export class FeeKnowledgeSearchProviderError extends Error {
  constructor(
    public readonly status: FeeKnowledgeResearchAttemptRecord["status"],
    message: string,
  ) {
    super(message);
  }
}

export async function runFeeKnowledgeResearch(input: {
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability">;
  registry?: ApprovedFeeKnowledgeSourceRegistry | LegacyWholeStatementSourceRegistry | null;
  questions: readonly FeeKnowledgeResearchQuestion[];
  options?: FeeKnowledgeResearchOptions;
}): Promise<FeeKnowledgeResearchResult> {
  const options = input.options ?? {};
  const enabled = researchEnabled(options);
  const diagnosticState = initialResearchDiagnosticState(enabled, input.questions.length);
  if (!enabled) {
    await emitRuntimeProgress(options.progressReporter, {
      stage: "research_planning",
      status: "degraded",
      counters: { questionCount: input.questions.length, selectedQuestionCount: 0 },
      reasonCodes: ["fee_knowledge_research_disabled"],
    });
    return snapshotResearchResult({
      attempts: input.questions.map((question, index) => attemptRecord(question, index, "disabled", [], ["fee_knowledge_research_disabled"])),
      candidates: [],
      intelligence: buildStatementGroundedIntelligence({ analysis: input.analysis, questions: input.questions }),
      claimSupports: [],
    }, buildResearchDiagnostics(diagnosticState, {
      attempts: input.questions.map((question, index) => attemptRecord(question, index, "disabled", [], ["fee_knowledge_research_disabled"])),
      candidates: [],
      claimSupports: [],
    }));
  }
  if (input.questions.length === 0) {
    await emitRuntimeProgress(options.progressReporter, {
      stage: "research_planning",
      status: "completed",
      counters: { questionCount: 0, selectedQuestionCount: 0 },
      reasonCodes: ["fee_knowledge_research_not_needed"],
    });
    const notNeededAttempt: FeeKnowledgeResearchAttemptRecord = {
      type: "fee_knowledge_research_attempt",
      policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
      attemptId: "research_not_needed",
      questionRef: `question_${"0".repeat(64)}`,
      feeRowRef: "__statement__",
      sanitizedQuestionCategory: "classification",
      triggerReason: "not_needed",
      status: "not_needed",
      resultCount: 0,
      candidateIds: [],
      reasonCodes: ["fee_knowledge_research_not_needed"],
      providerDetailsStripped: true,
    };
    return snapshotResearchResult({
      attempts: [
        notNeededAttempt,
      ],
      candidates: [],
      intelligence: [],
      claimSupports: [],
    }, buildResearchDiagnostics(diagnosticState, { attempts: [notNeededAttempt], candidates: [], claimSupports: [] }));
  }

  const attempts: FeeKnowledgeResearchAttemptRecord[] = [];
  const candidates: FeeKnowledgeResearchCandidateRecord[] = [];
  const intelligence: FeeKnowledgeIntelligenceRecord[] = buildStatementGroundedIntelligence({
    analysis: input.analysis,
    questions: input.questions,
  });
  const claimSupports: FeeKnowledgeClaimSupportRecord[] = [];
  const result = await withAbortTimeout(async (abortSignal) => {
    const searchAdapter = options.adapter ?? openAiWebSearchAdapter({ apiKey: options.openAiApiKey, modelName: options.openAiModelName, fetchImpl: options.fetchImpl });
    const semanticSupportAdapter =
      options.semanticSupportAdapter ?? openAiSemanticSupportAdapter({ apiKey: options.openAiApiKey, modelName: options.openAiModelName, fetchImpl: options.fetchImpl });
    const investigativeOptions = options.investigativeIntelligence
      ? { openAiApiKey: options.openAiApiKey, openAiModelName: options.openAiModelName, fetchImpl: options.fetchImpl, ...options.investigativeIntelligence }
      : undefined;
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis: input.analysis, registry: input.registry });
    const planningStartedAt = Date.now();
    await emitRuntimeProgress(options.progressReporter, {
      stage: "research_planning",
      status: "running",
      counters: { questionCount: input.questions.length },
    });
    const researchPlan = planFeeKnowledgeResearchQuestions(input.questions, FEE_KNOWLEDGE_RESEARCH_LIMITS);
    diagnosticState.stageElapsedMs.planning += elapsedSince(planningStartedAt);
    diagnosticState.selectedQuestionCount = researchPlan.selected.length;
    await emitRuntimeProgress(options.progressReporter, {
      stage: "research_planning",
      status: "completed",
      elapsedMs: elapsedSince(planningStartedAt),
      counters: {
        questionCount: input.questions.length,
        selectedQuestionCount: researchPlan.selected.length,
      },
    });
    const selectedQuestions = researchPlan.selectedQuestions;
    const selectedQuestionItems = researchPlan.selected;
    const skippedQuestions = researchPlan.notSelectedQuestions;
    let remainingCandidates = FEE_KNOWLEDGE_RESEARCH_LIMITS.maxRetrievalCandidates;
    const statementInvestigationEnabled = feeKnowledgeInvestigativeIntelligenceEnabled(investigativeOptions)
      && investigativeOptions?.statementScopeEnabled === true;
    diagnosticState.statementInvestigativeAttempted = statementInvestigationEnabled;
    const statementInvestigationStartedAt = Date.now();
    await emitRuntimeProgress(options.progressReporter, {
      stage: "investigative_intelligence",
      status: statementInvestigationEnabled ? "running" : "degraded",
      reasonCodes: statementInvestigationEnabled ? [] : ["fee_knowledge_investigative_intelligence_disabled"],
    });
    const statementInvestigation = statementInvestigationEnabled
      ? await runFeeKnowledgeInvestigativeIntelligence({
          scope: "statement",
          analysis: input.analysis,
          questions: selectedQuestions,
          existingIntelligence: intelligence,
          options: investigativeOptions,
          abortSignal,
        })
      : [];
    diagnosticState.stageElapsedMs.statementInvestigativeIntelligence += elapsedSince(statementInvestigationStartedAt);
    diagnosticState.statementInvestigativeOutputRecordCount = statementInvestigation.length;
    diagnosticState.statementInvestigativeStatus = statementInvestigationEnabled
      ? investigativeStatus(statementInvestigation)
      : "disabled";
    safeInvestigativeReasonCodes(statementInvestigation).forEach((code) => diagnosticState.statementInvestigativeReasonCodes.add(code));
    intelligence.push(...statementInvestigation);
    await emitRuntimeProgress(options.progressReporter, {
      stage: "investigative_intelligence",
      status: statementInvestigationEnabled && diagnosticState.statementInvestigativeStatus === "completed"
        ? "completed"
        : "degraded",
      elapsedMs: elapsedSince(statementInvestigationStartedAt),
      counters: { statementInvestigativeOutputCount: statementInvestigation.length },
      reasonCodes: statementInvestigationEnabled
        ? diagnosticState.statementInvestigativeStatus !== "completed"
          ? ["fee_knowledge_statement_investigative_degraded"]
          : []
        : ["fee_knowledge_statement_investigative_owned_by_whole_statement_runtime"],
    });

    const discoveryByAttemptId = new Map<string, Promise<{
      discovered: FeeKnowledgeDiscoveryCandidate[];
      error: unknown | null;
    }>>();
    if (selectedQuestionItems.length > FEE_KNOWLEDGE_PRODUCT_RUNTIME_POLICY.maxConcurrentSearchCalls) {
      throw new Error("fee_knowledge_product_search_concurrency_policy_exceeded");
    }
    diagnosticState.searchCallCount = selectedQuestionItems.length;
    for (const [discoveryIndex, item] of selectedQuestionItems.entries()) {
      const attemptId = attemptIdFor(item.question, item.originalIndex);
      discoveryByAttemptId.set(attemptId, (async () => {
        const searchStartedAt = Date.now();
        await emitRuntimeProgress(options.progressReporter, {
          stage: "discovery",
          status: "running",
          counters: { searchCallCount: discoveryIndex + 1 },
        });
        try {
          const discovered = await withParentAbortTimeout(
            abortSignal,
            FEE_KNOWLEDGE_PRODUCT_RUNTIME_POLICY.webSearchCallTimeoutMs,
            (callSignal) => searchAdapter(
              { attemptId, questions: [item.question], limits: FEE_KNOWLEDGE_RESEARCH_LIMITS },
              { abortSignal: callSignal },
            ),
            "fee_knowledge_web_search_timed_out",
          );
          await emitRuntimeProgress(options.progressReporter, {
            stage: "discovery",
            status: "completed",
            elapsedMs: elapsedSince(searchStartedAt),
            counters: { searchCallCount: discoveryIndex + 1 },
          });
          return { discovered, error: null };
        } catch (error) {
          const timedOut = !abortSignal.aborted && isTimeoutError(error);
          const normalizedError = timedOut
            ? new FeeKnowledgeSearchProviderError("timed_out", "fee_knowledge_web_search_timed_out")
            : error;
          await emitRuntimeProgress(options.progressReporter, {
            stage: "discovery",
            status: timedOut || abortSignal.aborted ? "timed_out" : "degraded",
            elapsedMs: elapsedSince(searchStartedAt),
            counters: { searchCallCount: discoveryIndex + 1 },
            reasonCodes: [timedOut ? "fee_knowledge_web_search_timed_out" : abortSignal.aborted
              ? "fee_knowledge_research_graph_timed_out"
              : "fee_knowledge_discovery_degraded"],
          });
          return { discovered: [], error: normalizedError };
        } finally {
          diagnosticState.stageElapsedMs.webSearchDiscovery += elapsedSince(searchStartedAt);
        }
      })());
    }

    for (const item of selectedQuestionItems) {
      const question = item.question;
      const index = item.originalIndex;
      const attemptId = attemptIdFor(question, index);
      try {
        const discovery = await discoveryByAttemptId.get(attemptId);
        if (!discovery || discovery.error) throw discovery?.error ?? new Error("fee_knowledge_discovery_result_missing");
        const discovered = discovery.discovered;
        const bounded = rankFeeKnowledgeDiscoveryCandidates(dedupeCandidates(discovered), question)
          .slice(0, Math.min(remainingCandidates, FEE_KNOWLEDGE_RESEARCH_LIMITS.maxResultCandidatesPerSearch));
        remainingCandidates -= bounded.length;
        const candidateIds: string[] = [];
        for (const [candidateIndex, candidate] of bounded.entries()) {
          const candidateId = `candidate_${stableId([attemptId, candidate.url, String(candidateIndex)])}`;
          const pendingIndex = candidates.push(candidateRecord({ candidateId, candidate, question, questionOrdinal: index }, attemptId, {
            canonicalUrl: null,
            verificationStatus: "provisional",
            reasonCodes: ["fee_knowledge_semantic_support_not_run"],
            safeApplicability: {
              processorOrNetworkMatched: false,
              periodApplicable: Boolean(question.statementPeriodYear),
              jurisdictionApplicable: null,
              contextApplicable: null,
            },
            sourceFingerprint: null,
            retrievalStatus: "not_started",
            semanticVerificationStatus: "not_started",
            locatorHash: null,
            claimSupportDecisionRef: null,
          })) - 1;
          candidateIds.push(candidateId);
          diagnosticState.retrievalAttemptCount += 1;
          const retrievalStartedAt = Date.now();
          await emitRuntimeProgress(options.progressReporter, {
            stage: "retrieval",
            status: "running",
            counters: { retrievalAttemptCount: diagnosticState.retrievalAttemptCount },
          });
          const retrieved = await retrieveFeeKnowledgeDocument(candidate.url, {
            abortSignal,
            fetchImpl: options.fetchImpl,
            resolveHost: options.resolveHost,
            pdfExtractionTimeoutMs: options.pdfExtractionTimeoutMs,
            pdfIsolationWorkerFactoryForTesting: options.pdfIsolationWorkerFactoryForTesting,
          });
          diagnosticState.stageElapsedMs.retrieval += elapsedSince(retrievalStartedAt);
          const retrievedPdf = contentTypeClass(retrieved.contentType) === "pdf";
          await emitRuntimeProgress(options.progressReporter, {
            stage: "retrieval",
            status: retrieved.status === "retrieved_text"
              ? "completed"
              : retrieved.status === "timed_out"
                ? "timed_out"
                : "degraded",
            elapsedMs: elapsedSince(retrievalStartedAt),
            counters: {
              retrievalAttemptCount: diagnosticState.retrievalAttemptCount,
              retrievedPdfAttemptCount: retrievedPdf ? 1 : 0,
              retrievedPdfSuccessCount: retrievedPdf && retrieved.status === "retrieved_text" ? 1 : 0,
              retrievedPdfTimedOutCount: retrievedPdf && retrieved.status === "timed_out" ? 1 : 0,
            },
            reasonCodes: retrieved.status === "retrieved_text" ? [] : ["fee_knowledge_retrieval_degraded"],
          });
          candidates[pendingIndex] = candidateAfterRetrieval(candidates[pendingIndex]!, retrieved);
          intelligence.push(...buildRetrievedDocumentIntelligence({
            candidateId,
            attemptId,
            question,
            retrieved,
          }));
          const retrievedInvestigationEnabled = feeKnowledgeInvestigativeIntelligenceEnabled(investigativeOptions)
            && feeKnowledgeCandidateNeedsInvestigativeLocator({ retrieved, question });
          let retrievedInvestigation: FeeKnowledgeIntelligenceRecord[] = [];
          if (retrievedInvestigationEnabled) {
            diagnosticState.retrievedInvestigativeAttemptCount += 1;
            const retrievedInvestigationStartedAt = Date.now();
            await emitRuntimeProgress(options.progressReporter, {
              stage: "investigative_intelligence",
              status: "running",
              counters: { retrievedInvestigativeAttemptCount: diagnosticState.retrievedInvestigativeAttemptCount },
            });
            retrievedInvestigation = await runFeeKnowledgeInvestigativeIntelligence({
              scope: "retrieved_document",
              analysis: input.analysis,
              questions: [question],
              existingIntelligence: intelligence,
              options: investigativeOptions,
              candidate: {
                candidateId,
                attemptId,
                question,
                candidateRecord: candidates[pendingIndex]!,
                retrieved,
              },
              abortSignal,
            });
            diagnosticState.stageElapsedMs.retrievedDocumentInvestigativeIntelligence += elapsedSince(retrievedInvestigationStartedAt);
            diagnosticState.retrievedInvestigativeOutputRecordCount += retrievedInvestigation.length;
            diagnosticState.retrievedInvestigativeStatuses.push(investigativeStatus(retrievedInvestigation));
            safeInvestigativeReasonCodes(retrievedInvestigation).forEach((code) => diagnosticState.retrievedInvestigativeReasonCodes.add(code));
            intelligence.push(...retrievedInvestigation);
            await emitRuntimeProgress(options.progressReporter, {
              stage: "investigative_intelligence",
              status: investigativeStatus(retrievedInvestigation) === "completed" ? "completed" : "degraded",
              elapsedMs: elapsedSince(retrievedInvestigationStartedAt),
              counters: {
                retrievedInvestigativeAttemptCount: diagnosticState.retrievedInvestigativeAttemptCount,
                retrievedInvestigativeOutputCount: retrievedInvestigation.length,
              },
              reasonCodes: investigativeStatus(retrievedInvestigation) !== "completed"
                ? ["fee_knowledge_retrieved_investigative_degraded"]
                : [],
            });
          }
          const aiCandidateEvidenceLocatorHash = candidateEvidenceLocatorHash(intelligence, candidateId);
          const semanticVerificationStartedAt = Date.now();
          await emitRuntimeProgress(options.progressReporter, {
            stage: "semantic_verification",
            status: "running",
            counters: { semanticVerificationAttemptCount: 1 },
          });
          let verification: Awaited<ReturnType<typeof verifyCandidate>>;
          try {
            verification = await verifyCandidate({
              candidateId,
              attemptId,
              candidate,
              retrieved,
              question,
              questionOrdinal: index,
              semanticSupportAdapter: (request, context) => withParentAbortTimeout(
                context.abortSignal,
                FEE_KNOWLEDGE_PRODUCT_RUNTIME_POLICY.semanticVerificationCallTimeoutMs,
                (callSignal) => semanticSupportAdapter(request, { abortSignal: callSignal }),
                "fee_knowledge_semantic_timed_out",
              ).catch((error) => {
                if (!context.abortSignal.aborted && isTimeoutError(error)) {
                  return unsupportedSemanticDecision(request.structuredClaim, "fee_knowledge_semantic_timed_out");
                }
                throw error;
              }),
              domainIdentityPolicy: options.domainIdentityPolicy,
              priorClaimSupports: [...sourcePacket.claimSupports, ...claimSupports],
              candidateEvidenceLocatorHash: aiCandidateEvidenceLocatorHash,
              abortSignal,
            });
          } finally {
            diagnosticState.stageElapsedMs.semanticVerification += elapsedSince(semanticVerificationStartedAt);
          }
          candidates[pendingIndex] = verification.candidate;
          if (verification.claimSupport) {
            claimSupports.push(verification.claimSupport);
          }
          await emitRuntimeProgress(options.progressReporter, {
            stage: "semantic_verification",
            status: verification.candidate.semanticVerificationStatus === "completed"
              ? "completed"
              : verification.candidate.semanticVerificationStatus === "timed_out"
                ? "timed_out"
                : "degraded",
            elapsedMs: elapsedSince(semanticVerificationStartedAt),
            counters: {
              semanticVerificationAttemptCount: 1,
              verifiedClaimSupportCount: verification.claimSupport && isVerifiedDocumentationDecision(verification.claimSupport.evidenceDecision) ? 1 : 0,
            },
            reasonCodes: verification.candidate.semanticVerificationStatus === "completed"
              ? []
              : ["fee_knowledge_semantic_verification_degraded"],
          });
          if (verification.candidate.semanticVerificationStatus === "safety_blocked") {
            throw new FeeKnowledgeSearchProviderError(
              "safety_blocked",
              "Fee knowledge semantic verification was blocked by safety policy.",
            );
          }
        }
        attempts.push(attemptRecord(question, index, "completed", candidateIds, ["fee_knowledge_research_completed"]));
      } catch (error) {
        const providerStatus = error instanceof FeeKnowledgeSearchProviderError ? error.status : undefined;
        const retainedCandidateIds = candidates
          .filter((candidate) => candidate.attemptId === attemptId)
          .map((candidate) => candidate.candidateId);
        upsertAttempt(attempts, attemptRecord(
          question,
          index,
          providerStatus ?? (abortSignal.aborted ? "timed_out" : "failed"),
          retainedCandidateIds,
          [researchFailureReason(providerStatus ?? (abortSignal.aborted ? "timed_out" : "failed"))],
        ));
        await emitRuntimeProgress(options.progressReporter, {
          stage: "discovery",
          status: abortSignal.aborted ? "timed_out" : "degraded",
          counters: { searchCallCount: diagnosticState.searchCallCount },
          reasonCodes: [abortSignal.aborted ? "fee_knowledge_research_graph_timed_out" : "fee_knowledge_discovery_degraded"],
        });
      }
    }

    for (const item of skippedQuestions) {
      attempts.push(attemptRecord(item.question, item.originalIndex, "not_selected_planning", [], ["fee_knowledge_research_not_selected_planning"]));
    }

    return { attempts, candidates, intelligence, claimSupports };
  }, options.timeoutMs ?? FEE_KNOWLEDGE_PRODUCT_RUNTIME_POLICY.totalDeadlineMs).catch((error) => {
    const timedOut = /timed out|aborted|abort/i.test(error instanceof Error ? error.message : String(error));
    return terminalResearchSnapshot({
      questions: input.questions,
      attempts,
      candidates,
      intelligence,
      claimSupports,
      status: timedOut ? "timed_out" : "failed",
    });
  });
  return snapshotResearchResult(result, buildResearchDiagnostics(diagnosticState, result));
}

export function defaultFeeKnowledgeResearchQuestions(
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability">,
  registry?: ApprovedFeeKnowledgeSourceRegistry | LegacyWholeStatementSourceRegistry | null,
): FeeKnowledgeResearchQuestion[] {
  const processor = safeContextText(analysis.identity.processorName.value);
  const year = analysis.identity.statementPeriod.value?.start?.slice(0, 4) ?? null;
  const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry });
  const classifications = new Map(analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification.selected?.category ?? null]));
  const selectedByRow = new Map(analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification.selected]));
  const questions: Array<{ question: FeeKnowledgeResearchQuestion; score: number; rowAmountMinor: number }> = analysis.feeLedger.rows
    .map((row): { question: FeeKnowledgeResearchQuestion; score: number; rowAmountMinor: number } | null => {
      const rowPacket = sourcePacket.rowPackets.find((packet) => packet.feeRowRef === row.id);
      const rowMatches = sourcePacket.sourceMatches.filter((match) => match.feeRowRef === row.id);
      const deterministicCategory = classifications.get(row.id) ?? null;
      const selected = selectedByRow.get(row.id) ?? null;
      const triggerReason: FeeKnowledgeResearchQuestion["triggerReason"] | null =
        rowPacket?.contradictionRefs.length
          ? "contradicted_source"
          : rowMatches.some((match) => match.lifecycle === "expired" || match.lifecycle === "superseded" || match.lifecycle === "revoked")
            ? "expired_or_superseded_source"
            : !rowPacket?.applicableApprovedClaimSupportRefs.length
              ? "missing_applicable_registry_claim"
              : deterministicCategory === "unknown_needs_review" || row.role === "unknown_unresolved"
                ? "material_unfamiliar_label"
                : unfamiliarLabel(row.selectedLabel)
                  ? "material_unfamiliar_label"
                  : null;
      if (!triggerReason || !materialRow(row)) return null;
      const question = {
        feeRowRef: row.id,
        sanitizedQuestionCategory: "classification" as const,
        triggerReason,
        processorOrNetwork: processor,
        feeLabel: safeContextText(row.selectedLabel) ?? "unfamiliar fee label",
        statementSection: row.role,
        statementPeriodYear: year,
        deterministicCategory,
        deterministicEconomicOwner: selected?.ownership.economicBeneficiary ?? null,
        deterministicContractualController: selected?.ownership.contractualController ?? null,
        deterministicActionabilityCeiling: selected?.actionabilityCeiling ?? "verify_only",
        deterministicConfidence: selected?.confidence ?? "medium",
        semanticQuestion: semanticQuestionForResearch({
          feeLabel: row.selectedLabel,
          triggerReason,
          deterministicCategory,
          selected,
        }),
        adaptiveFollowUp: null,
      };
      return {
        question,
        score: researchQuestionPriorityScore({
          question,
          label: row.selectedLabel,
          role: row.role,
          contributesToUniqueTotal: row.contributesToUniqueTotal,
          amountMinor: row.selectedAmount?.amountMinor ?? 0,
        }),
        rowAmountMinor: Math.abs(row.selectedAmount?.amountMinor ?? 0),
      };
    })
    .filter((question): question is { question: FeeKnowledgeResearchQuestion; score: number; rowAmountMinor: number } => Boolean(question));
  return questions
    .sort((left, right) =>
      right.score - left.score ||
      right.rowAmountMinor - left.rowAmountMinor ||
      left.question.feeRowRef.localeCompare(right.question.feeRowRef))
    .map((item) => item.question);
}

export type PlannedFeeKnowledgeResearchQuestion = {
  question: FeeKnowledgeResearchQuestion;
  originalIndex: number;
  score: number;
  reasonCodes: string[];
};

export function planFeeKnowledgeResearchQuestions(
  questions: readonly FeeKnowledgeResearchQuestion[],
  limits: Pick<FeeKnowledgeResearchLimits, "maxSearchCalls">,
): { selectedQuestions: FeeKnowledgeResearchQuestion[]; selected: PlannedFeeKnowledgeResearchQuestion[]; notSelectedQuestions: PlannedFeeKnowledgeResearchQuestion[] } {
  const ranked = questions
    .map((question, originalIndex): PlannedFeeKnowledgeResearchQuestion => ({
      question,
      originalIndex,
      score: researchQuestionPriorityScore({ question }),
      reasonCodes: researchQuestionPriorityReasonCodes(question),
    }))
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);
  const selected = ranked.slice(0, limits.maxSearchCalls);
  const notSelectedQuestions = ranked.slice(limits.maxSearchCalls);
  return {
    selectedQuestions: selected.map((item) => item.question),
    selected,
    notSelectedQuestions,
  };
}

export function buildAdaptiveFeeKnowledgeResearchQuestion(input: {
  parentQuestion: FeeKnowledgeResearchQuestion;
  parentQuestionRef: string;
  parentAttemptId: string;
  candidate: FeeKnowledgeResearchCandidateRecord | null;
  claimSupport: FeeKnowledgeClaimSupportRecord | null;
  resolutionRequirement?: FeeKnowledgeResolutionRequirement;
}): FeeKnowledgeResearchQuestion | null {
  if (input.parentQuestion.adaptiveFollowUp) return null;
  const resolutionRequirement = input.resolutionRequirement ??
    adaptiveEvidenceResolutionRequirement(input.candidate, input.claimSupport);
  if (!feeKnowledgeResolutionAllowsAdaptivePublicResearch(resolutionRequirement)) return null;
  const missingDimensions = adaptiveMissingDimensions(input.candidate, input.claimSupport, input.parentQuestion);
  if (missingDimensions.length === 0) return null;
  const triggerReason = adaptiveTriggerReason(missingDimensions);
  return {
    ...input.parentQuestion,
    triggerReason,
    semanticQuestion: adaptiveSemanticQuestion(input.parentQuestion, missingDimensions),
    adaptiveFollowUp: {
      parentQuestionRef: input.parentQuestionRef,
      parentAttemptId: input.parentAttemptId,
      parentCandidateId: input.candidate?.candidateId ?? input.claimSupport?.candidateId ?? null,
      missingDimensions,
      sourceReasonCodes: adaptiveSourceReasonCodes(input.candidate, input.claimSupport),
    },
  };
}

export function feeKnowledgeResolutionAllowsAdaptivePublicResearch(
  requirement: FeeKnowledgeResolutionRequirement,
): boolean {
  return requirement === "public_evidence_required" || requirement === "public_evidence_unavailable";
}

export function adaptiveEvidenceResolutionRequirement(
  candidate: FeeKnowledgeResearchCandidateRecord | null,
  claimSupport: FeeKnowledgeClaimSupportRecord | null,
): FeeKnowledgeResolutionRequirement {
  if (claimSupport?.structuredClaim.claimKind === "merchant_application") return "merchant_pricing_document_required";
  if (claimSupport?.rateOrAmountComparison === "matches_published_rule" || claimSupport?.rateOrAmountComparison === "does_not_match_published_rule") {
    return "current_statement_sufficient";
  }
  if (claimSupport && claimSupport.evidenceDecision === "verified_rule" && claimSupport.rateOrAmountComparison === "not_evaluated") {
    return "deterministic_math_required";
  }
  if (candidate?.retrievalStatus && candidate.retrievalStatus !== "retrieved_text") return "public_evidence_unavailable";
  if (candidate?.safeRetrievalDiagnostics?.httpStatus === 403 || candidate?.reasonCodes.includes("fee_knowledge_http_403")) {
    return "public_evidence_unavailable";
  }
  if (claimSupport) return "public_evidence_required";
  return "public_evidence_required";
}

export function adaptiveMissingDimensions(
  candidate: FeeKnowledgeResearchCandidateRecord | null,
  claimSupport: FeeKnowledgeClaimSupportRecord | null,
  question?: FeeKnowledgeResearchQuestion,
): FeeKnowledgeAdaptiveMissingDimension[] {
  const reasonCodes = new Set([
    ...(candidate?.reasonCodes ?? []),
    ...(claimSupport?.semanticSupport.reasonCodes ?? []),
    ...(claimSupport?.exclusions ?? []),
    ...(claimSupport ? [`fee_knowledge_${claimSupport.evidenceDecision}`] : []),
  ].map(normalizeText));
  const dimensions = new Set<FeeKnowledgeAdaptiveMissingDimension>();
  if (candidate?.retrievalStatus && candidate.retrievalStatus !== "retrieved_text") {
    if (question && inaccessibleCandidateIsAuthoritativeForQuestion(candidate, question)) {
      dimensions.add("authoritative_source_inaccessible");
    }
  }
  if (candidate?.semanticVerificationStatus === "not_eligible"
    || candidate?.reasonCodes.includes("fee_knowledge_claim_support_missing")
    || candidate?.reasonCodes.includes("fee_knowledge_semantic_not_eligible_claim_support_missing")) {
    dimensions.add("fee_or_alias_missing");
  }
  if (claimSupport) {
    if (!claimSupport.applicability.processorOrNetwork) dimensions.add("processor_network_mismatch");
    if (!claimSupport.applicability.statementPeriod) dimensions.add("period_mismatch");
    if (claimSupport.applicability.jurisdiction === false || claimSupport.applicability.transactionContext === false) dimensions.add("applicability_missing");
    if (claimSupport.evidenceDecision === "source_inapplicable") dimensions.add("applicability_missing");
    if (claimSupport.evidenceDecision === "unsupported" || claimSupport.semanticSupport.decision === "does_not_support" || claimSupport.semanticSupport.decision === "unsupported") {
      dimensions.add("fee_or_alias_missing");
    }
    if (claimSupport.structuredClaim.claimKind === "published_rule"
      || claimSupport.rateOrAmountComparison === "not_calculable"
      || reasonCodes.has("missing rate rule evidence")
      || reasonCodes.has("fee knowledge source inapplicable")) {
      dimensions.add("rate_rule_missing");
    }
  }
  return [...dimensions].sort().slice(0, 5);
}

function adaptiveTriggerReason(
  missingDimensions: readonly FeeKnowledgeAdaptiveMissingDimension[],
): FeeKnowledgeResearchQuestion["triggerReason"] {
  if (missingDimensions.includes("authoritative_source_inaccessible")) return "adaptive_inaccessible_authoritative_source";
  if (missingDimensions.includes("rate_rule_missing")) return "adaptive_missing_rate_rule_evidence";
  return "adaptive_missing_applicability";
}

function adaptiveSemanticQuestion(
  question: FeeKnowledgeResearchQuestion,
  missingDimensions: readonly FeeKnowledgeAdaptiveMissingDimension[],
): string {
  const label = question.feeLabel || "this fee";
  const targets: string[] = [];
  if (missingDimensions.includes("fee_or_alias_missing")) targets.push("exact fee name, likely alias, authorization/discount/assessment terminology");
  if (missingDimensions.includes("rate_rule_missing")) targets.push("official fee schedule, rate table, published rule, effective date");
  if (missingDimensions.includes("processor_network_mismatch")) targets.push("correct processor, acquirer, card brand, or network ownership");
  if (missingDimensions.includes("period_mismatch")) targets.push(`historical ${question.statementPeriodYear ?? "statement-period"} version or effective-date language`);
  if (missingDimensions.includes("applicability_missing")) targets.push("geography, product, card-present/card-not-present, debit/credit, and transaction-context applicability");
  if (missingDimensions.includes("authoritative_source_inaccessible")) targets.push("alternate official PDFs, schedules, archived official pages, or processor/network endpoints");
  return `Follow up on rejected evidence for ${label}: search specifically for ${targets.join("; ")}. Preserve only evidence that is both authoritative and applicable.`;
}

function adaptiveSourceReasonCodes(
  candidate: FeeKnowledgeResearchCandidateRecord | null,
  claimSupport: FeeKnowledgeClaimSupportRecord | null,
): string[] {
  return [...new Set([
    ...(candidate?.reasonCodes ?? []),
    ...(claimSupport?.semanticSupport.reasonCodes ?? []),
    ...(claimSupport ? [`fee_knowledge_${claimSupport.evidenceDecision}`] : []),
  ].filter(safeReasonCode))].sort().slice(0, 10);
}

export function openAiWebSearchAdapter(options: {
  apiKey?: string;
  modelName?: string;
  fetchImpl?: SafeFetch;
  maximumInputTokens?: number;
  maximumOutputTokens?: number;
  onUsage?: (usage: OpenAiResponsesSafeUsage) => void;
}): FeeKnowledgeSearchAdapter {
  return async (request, context) => {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new FeeKnowledgeSearchProviderError("failed", "OpenAI API key unavailable for fee knowledge discovery.");
    const model = options.modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_WEB_SEARCH_MODEL;
    validateWebSearchModel(model);
    const fetchImpl = options.fetchImpl ?? fetch;
    const input = buildFeeKnowledgeWebSearchInput(request.questions);
    assertUtf8InputBound(input, options.maximumInputTokens);
    const maximumOutputTokens = positiveInteger(options.maximumOutputTokens ?? OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS, "web-search maximum output tokens");
    let response: Response;
    try {
      response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: context.abortSignal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          input,
          tools: [{ type: "web_search" }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          reasoning: { effort: "low" },
          max_output_tokens: maximumOutputTokens,
          max_tool_calls: WEB_SEARCH_PROVIDER_MAX_TOOL_CALLS,
        }),
      });
    } catch (error) {
      throw safeProviderFailureError(error);
    }
    const raw = await safeJson(response);
    const usage = openAiResponsesSafeUsage(raw);
    options.onUsage?.(usage);
    if (!response.ok) {
      throw safeProviderFailureError(null, { status: response.status, headers: response.headers, body: raw });
    }
    if (providerRefused(raw)) throw safeProviderPostResponseFailureError("provider_refused", usage.requestId);
    if (usage.webSearchToolCalls === 0) {
      throw safeProviderPostResponseFailureError("provider_required_tool_missing", usage.requestId);
    }
    return extractDiscoveryCandidates(raw).slice(0, request.limits.maxResultCandidatesPerSearch);
  };
}

export function buildFeeKnowledgeWebSearchInput(questions: readonly FeeKnowledgeResearchQuestion[]): string {
  return [
    "Find authoritative payment-processing evidence for RateReveal fee-knowledge research.",
    "Prefer sources that are both authoritative and applicable to THIS question, not merely generic payments education.",
    "Strong candidates include official processor pages/PDFs, official card-network fee schedules/rules, regulator materials, or official documentation pages with fee definitions/rates/rules.",
    "If the primary official destination is inaccessible or generic, look for alternative official PDFs, current/archived official schedules, processor documentation, or other authoritative sources. Preserve weaker material only as lower-confidence discovery candidates.",
    "Do not include private business identifiers, private numeric identifiers, credentials, or private URLs. Search results are discovery candidates only; verification/admission will decide support.",
    JSON.stringify({
      questionCount: questions.length,
      questions: questions.map((question) => ({
        category: question.sanitizedQuestionCategory,
        triggerReason: question.triggerReason,
        processorOrNetwork: question.processorOrNetwork,
        feeLabel: question.feeLabel,
        searchTerms: researchSearchTerms(question),
        sourcePreferences: sourcePreferenceHints(question),
        applicabilityTargets: {
          processorOrNetwork: question.processorOrNetwork,
          proposedCategory: question.deterministicCategory,
          likelyEconomicOwner: question.deterministicEconomicOwner,
          likelyContractualController: question.deterministicContractualController,
          statementPeriodYear: question.statementPeriodYear,
          statementSection: question.statementSection,
        },
        adaptiveFollowUp: question.adaptiveFollowUp
          ? {
              missingDimensions: question.adaptiveFollowUp.missingDimensions,
              sourceReasonCodes: question.adaptiveFollowUp.sourceReasonCodes,
              instruction: "This is a bounded follow-up. Search for the missing applicability/evidence dimension that caused prior candidates to be rejected.",
            }
          : null,
        confidenceAndActionability: {
          deterministicConfidence: question.deterministicConfidence,
          deterministicActionabilityCeiling: question.deterministicActionabilityCeiling,
        },
        semanticQuestion: question.semanticQuestion,
      })),
    }),
  ].join("\n");
}

export function rankFeeKnowledgeDiscoveryCandidates(
  candidates: readonly FeeKnowledgeDiscoveryCandidate[],
  question: FeeKnowledgeResearchQuestion,
): FeeKnowledgeDiscoveryCandidate[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      assessment: assessFeeKnowledgeDiscoveryCandidate(candidate, question),
    }))
    .sort((left, right) =>
      right.assessment.rankTier - left.assessment.rankTier ||
      right.assessment.score - left.assessment.score ||
      left.index - right.index)
    .map((item) => item.candidate);
}

export function openAiSemanticSupportAdapter(options: {
  apiKey?: string;
  modelName?: string;
  fetchImpl?: SafeFetch;
  maximumInputTokens?: number;
  maximumOutputTokens?: number;
  maximumToolUses?: number;
  onUsage?: (usage: OpenAiResponsesSafeUsage) => void;
}): FeeKnowledgeSemanticSupportAdapter {
  return async (request, context) => {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) return unsupportedSemanticDecision(request.structuredClaim, "fee_knowledge_semantic_support_provider_unavailable");
    const fetchImpl = options.fetchImpl ?? fetch;
    const input = [
      "Decide whether the cited excerpt semantically supports the structured fee-knowledge claim.",
      "Return compact JSON only with decision supports, partially_supports, does_not_support, contradicts, or unsupported and safe reasonCodes.",
      JSON.stringify({
        structuredClaim: request.structuredClaim,
        excerpt: request.boundedEvidenceExcerpt,
        applicability: request.applicability,
      }),
    ].join("\n");
    assertUtf8InputBound(input, options.maximumInputTokens);
    const maximumOutputTokens = positiveInteger(options.maximumOutputTokens ?? OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS, "semantic-verification maximum output tokens");
    if ((options.maximumToolUses ?? 0) !== 0) throw new Error("Semantic verification maximum tool uses must be zero.");
    let response: Response;
    try {
      response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: context.abortSignal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: options.modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_WEB_SEARCH_MODEL,
          input,
          max_output_tokens: maximumOutputTokens,
          reasoning: { effort: "low" },
          text: { format: semanticSupportOutputJsonSchema() },
        }),
      });
    } catch (error) {
      throw safeProviderFailureError(error);
    }
    const raw = await safeJson(response);
    options.onUsage?.(openAiResponsesSafeUsage(raw));
    if (!response.ok) throw safeProviderFailureError(null, { status: response.status, headers: response.headers, body: raw });
    if (providerRefused(raw)) return unsupportedSemanticDecision(request.structuredClaim, "fee_knowledge_semantic_support_provider_failed");
    return semanticDecisionFromRaw(raw, request.structuredClaim);
  };
}

export function openAiResponsesSafeUsage(raw: unknown): OpenAiResponsesSafeUsage {
  const root = asRecord(raw);
  const usage = asRecord(root?.usage);
  const details = asRecord(usage?.input_tokens_details);
  const output = Array.isArray(root?.output) ? root.output : [];
  const webSearchCalls = output.filter((item) => asRecord(item)?.type === "web_search_call");
  return {
    requestId: typeof root?.id === "string" && root.id.length > 0 ? root.id : null,
    inputTokens: safeUsageInteger(usage?.input_tokens),
    cachedInputTokens: safeUsageInteger(details?.cached_tokens) ?? 0,
    outputTokens: safeUsageInteger(usage?.output_tokens),
    webSearchToolCalls: webSearchCalls.length,
    webSearchActionTypes: webSearchCalls.map(webSearchActionType),
  };
}

function webSearchActionType(value: unknown): OpenAiWebSearchActionType {
  const type = asRecord(asRecord(value)?.action)?.type;
  return type === "search" || type === "open_page" || type === "find_in_page" ? type : "other";
}

function assertUtf8InputBound(input: string, maximumInputTokens: number | undefined): void {
  if (maximumInputTokens === undefined) return;
  const maximum = positiveInteger(maximumInputTokens, "maximum input tokens");
  if (Buffer.byteLength(input, "utf8") > maximum) throw new Error("Approved maximum input tokens exceeded before provider send.");
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function safeUsageInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function extractDiscoveryCandidates(raw: unknown): FeeKnowledgeDiscoveryCandidate[] {
  return dedupeCandidates([...extractWebSearchCallSources(raw), ...extractUrlCitationAnnotations(raw)]);
}

export function feeKnowledgeCandidateNeedsInvestigativeLocator(input: {
  retrieved: RetrievedDocument;
  question: FeeKnowledgeResearchQuestion;
}): boolean {
  if (input.retrieved.status !== "retrieved_text" || !input.retrieved.documentFingerprint) return false;
  const firstCitation = validateClaimCitation({
    document: input.retrieved,
    requiredText: bestRequiredText(input.question),
  });
  const citation = firstCitation.locator
    ? validateClaimCitation({
        document: input.retrieved,
        requiredText: bestRequiredText(input.question),
        locatorId: firstCitation.locator.locatorId,
        expectedDocumentFingerprint: input.retrieved.documentFingerprint,
        expectedLocatorTextHash: firstCitation.locator.textHash,
      })
    : firstCitation;
  return !citation.exists || !citation.locator;
}

export async function verifyCandidate(input: {
  candidateId: string;
  attemptId?: string;
  candidate: FeeKnowledgeDiscoveryCandidate;
  retrieved: RetrievedDocument;
  question: FeeKnowledgeResearchQuestion;
  questionOrdinal?: number;
  semanticSupportAdapter?: FeeKnowledgeSemanticSupportAdapter;
  semanticSupport?: FeeKnowledgeSemanticSupportDecision;
  domainIdentityPolicy?: FeeKnowledgeDomainIdentityPolicy;
  priorClaimSupports?: readonly FeeKnowledgeClaimSupportRecord[];
  candidateEvidenceLocatorHash?: string | null;
  abortSignal?: AbortSignal;
}): Promise<{ candidate: FeeKnowledgeResearchCandidateRecord; claimSupport: FeeKnowledgeClaimSupportRecord | null }> {
  const attemptId = input.attemptId ?? `research_${stableId([input.question.feeRowRef, input.question.sanitizedQuestionCategory])}`;
  const canonicalUrl = input.retrieved.canonicalUrl;
  const safeBase = {
    processorOrNetworkMatched: false,
    periodApplicable: Boolean(input.question.statementPeriodYear),
    jurisdictionApplicable: null,
    contextApplicable: null,
  };
  if (input.retrieved.status !== "retrieved_text" || !canonicalUrl || !input.retrieved.documentFingerprint) {
    return {
      candidate: candidateRecord(input, attemptId, {
        canonicalUrl,
        verificationStatus: input.retrieved.status === "safety_blocked" ? "safety_blocked" : input.retrieved.status === "retrieval_succeeded_text_unavailable" ? "source_unavailable" : "rejected",
        reasonCodes: [...input.retrieved.reasonCodes, "fee_knowledge_semantic_support_not_run"],
        safeApplicability: safeBase,
        sourceFingerprint: input.retrieved.documentFingerprint,
        retrievalStatus: input.retrieved.status,
        semanticVerificationStatus: "not_started",
        safeRetrievalDiagnostics: input.retrieved.safeDiagnostics,
        locatorHash: null,
        claimSupportDecisionRef: null,
      }),
      claimSupport: null,
    };
  }
  const requiredText = bestRequiredText(input.question);
  const firstCitation = validateClaimCitation({ document: input.retrieved, requiredText });
  const citation = firstCitation.locator
    ? validateClaimCitation({
        document: input.retrieved,
        requiredText,
        locatorId: firstCitation.locator.locatorId,
        expectedDocumentFingerprint: input.retrieved.documentFingerprint,
        expectedLocatorTextHash: firstCitation.locator.textHash,
      })
    : firstCitation;
  const aiCandidateCitation = citation.exists || !input.candidateEvidenceLocatorHash
    ? citation
    : citationFromLocatorHash(input.retrieved, input.candidateEvidenceLocatorHash);
  const host = new URL(canonicalUrl).hostname.toLowerCase();
  const publisherDomainVerified = input.question.processorOrNetwork ? verifiedPublisherDomain(host, input.question.processorOrNetwork, input.domainIdentityPolicy) : false;
  const processorMentioned = input.question.processorOrNetwork ? normalizeText(input.retrieved.text).includes(normalizeText(input.question.processorOrNetwork)) : false;
  const processorMatched = publisherDomainVerified && processorMentioned;
  const periodApplicable =
    !input.question.statementPeriodYear || normalizeText(input.retrieved.text).includes(input.question.statementPeriodYear) || !/\b20\d{2}\b/.test(input.retrieved.text);

  if (!aiCandidateCitation.exists || !aiCandidateCitation.locator) {
    return {
      candidate: candidateRecord(input, attemptId, {
        canonicalUrl,
        verificationStatus: "provisional",
        reasonCodes: [...input.retrieved.reasonCodes, "fee_knowledge_claim_support_missing", "fee_knowledge_semantic_not_eligible_claim_support_missing"],
        safeApplicability: { processorOrNetworkMatched: processorMatched, periodApplicable, jurisdictionApplicable: null, contextApplicable: null },
        sourceFingerprint: input.retrieved.documentFingerprint,
        retrievalStatus: input.retrieved.status,
        semanticVerificationStatus: "not_eligible",
        safeRetrievalDiagnostics: input.retrieved.safeDiagnostics,
        locatorHash: null,
        claimSupportDecisionRef: null,
      }),
      claimSupport: null,
    };
  }

  const structuredClaim = structuredClaimFor(input.question);
  const semanticSupport =
    input.semanticSupport ??
    (input.semanticSupportAdapter
      ? await input.semanticSupportAdapter(
          {
            structuredClaim,
            documentFingerprint: input.retrieved.documentFingerprint,
            locatorTextHash: aiCandidateCitation.locator.textHash,
            boundedEvidenceExcerpt: aiCandidateCitation.excerpt,
            applicability: { processorOrNetwork: processorMatched, jurisdiction: null, transactionContext: null, statementPeriod: periodApplicable },
          },
          { abortSignal: input.abortSignal ?? new AbortController().signal },
        )
      : unsupportedSemanticDecision(structuredClaim, "fee_knowledge_semantic_support_not_run"));
  const contradictions = runtimeContradictions({
    semanticSupport,
    structuredClaim,
    processorMatched,
    periodApplicable,
    priorClaimSupports: input.priorClaimSupports ?? [],
    question: input.question,
  });
  const evidenceDecision = evidenceDecisionFor({
    structuredClaim,
    semanticSupport,
    processorMatched,
    periodApplicable,
    contradictions,
  });
  const verified = isVerifiedDocumentationDecision(evidenceDecision);
  const semanticVerificationStatus: FeeKnowledgeResearchCandidateRecord["semanticVerificationStatus"] =
    semanticSupport.reasonCodes.some((reason) => [
      "fee_knowledge_semantic_json_invalid",
      "fee_knowledge_semantic_output_exhausted",
      "fee_knowledge_semantic_response_incomplete",
    ].includes(reason)) ? "parse_failed"
      : semanticSupport.reasonCodes.includes("fee_knowledge_semantic_timed_out") ? "timed_out"
        : semanticSupport.reasonCodes.includes("fee_knowledge_semantic_safety_blocked") ? "safety_blocked"
          : semanticSupport.reasonCodes.some((reason) => [
              "fee_knowledge_semantic_provider_unavailable_before_send",
              "fee_knowledge_semantic_failed",
              "fee_knowledge_semantic_support_provider_unavailable",
              "fee_knowledge_semantic_support_provider_failed",
            ].includes(reason)) ? semanticSupport.reasonCodes.includes("fee_knowledge_semantic_provider_unavailable_before_send") ? "provider_unavailable" : "failed"
          : "completed";
  const semanticStateReason = semanticVerificationStatus === "parse_failed" ? "fee_knowledge_semantic_parse_failed"
    : semanticVerificationStatus === "timed_out" ? "fee_knowledge_semantic_timed_out"
      : semanticVerificationStatus === "safety_blocked" ? "fee_knowledge_semantic_safety_blocked"
        : semanticVerificationStatus === "provider_unavailable" ? "fee_knowledge_semantic_provider_unavailable_before_send"
          : semanticVerificationStatus === "failed" ? "fee_knowledge_semantic_failed"
            : `fee_knowledge_${evidenceDecision}`;
  const verificationStatus: FeeKnowledgeResearchCandidateRecord["verificationStatus"] =
    semanticVerificationStatus === "safety_blocked" ? "safety_blocked"
      : semanticVerificationStatus !== "completed" ? "rejected"
        : verified ? "runtime_verified_documentation"
          : evidenceDecision === "conflicting_evidence" ? "conflicting_evidence"
            : evidenceDecision === "source_inapplicable" ? "source_inapplicable" : "verified_candidate_limited";
  const candidate: FeeKnowledgeResearchCandidateRecord = candidateRecord(input, attemptId, {
    canonicalUrl,
    verificationStatus,
    reasonCodes: [
      ...input.retrieved.reasonCodes,
      ...(semanticVerificationStatus === "completed" ? [`fee_knowledge_${evidenceDecision}`] : []),
      ...(semanticVerificationStatus === "parse_failed" ? semanticSupport.reasonCodes : []),
      semanticStateReason,
    ],
    safeApplicability: { processorOrNetworkMatched: processorMatched, periodApplicable, jurisdictionApplicable: null, contextApplicable: null },
    sourceFingerprint: input.retrieved.documentFingerprint,
    retrievalStatus: input.retrieved.status,
    semanticVerificationStatus,
    safeRetrievalDiagnostics: input.retrieved.safeDiagnostics,
    locatorHash: aiCandidateCitation.locator.textHash,
    claimSupportDecisionRef: null,
  });
  if (semanticVerificationStatus !== "completed") {
    return { candidate, claimSupport: null };
  }
  const claimSupport: FeeKnowledgeClaimSupportRecord = {
    type: "fee_knowledge_claim_support",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    claimSupportId: `claimsupport_${stableId([input.question.feeRowRef, input.candidateId, aiCandidateCitation.locator.locatorId, evidenceDecision])}`,
    feeRowRef: input.question.feeRowRef,
    sourceId: `runtime_source_${stableId([canonicalUrl])}`,
    claimId: `runtime_claim_${stableId([input.question.feeLabel, input.question.semanticQuestion, structuredClaim.claimKind])}`,
    candidateId: input.candidateId,
    structuredClaim,
    documentFingerprint: input.retrieved.documentFingerprint,
    evidenceLocator: aiCandidateCitation.locator,
    locatorTextHash: aiCandidateCitation.locator.textHash,
    boundedSafeExcerpt: aiCandidateCitation.excerpt,
    semanticSupport,
    aiSemanticMatchExplanation: "Runtime-discovered source independently retrieved; deterministic citation, fingerprint, locator, applicability, and contradiction checks govern authority.",
    citationExists: true,
    applicability: {
      processorOrNetwork: processorMatched,
      jurisdiction: null,
      transactionContext: null,
      statementPeriod: periodApplicable,
    },
    rateOrAmountComparison: structuredClaim.claimKind === "merchant_application" && semanticSupport.reasonCodes.includes("deterministic_calculation_matches") ? "matches_published_rule" : "not_evaluated",
    contradictions,
    exclusions: [...(processorMatched ? [] : ["Publisher or processor identity is not exact."]), ...(periodApplicable ? [] : ["Document period does not apply to the statement period."])],
    evidenceDecision,
    confidence: verified ? (structuredClaim.maximumConfidence === "low" ? "low" : "medium") : "low",
    actionabilityCeiling: verified
      ? structuredClaim.actionabilityCeiling === "potentially_actionable" ? "verify_only" : structuredClaim.actionabilityCeiling
      : "unknown",
  };
  candidate.claimSupportDecisionRef = calculateRuntimeClaimSupportDecisionRef({ support: claimSupport, candidate });
  return { candidate, claimSupport };
}

function candidateRecord(
  input: {
    candidateId: string;
    candidate: FeeKnowledgeDiscoveryCandidate;
    question: FeeKnowledgeResearchQuestion;
    questionOrdinal?: number;
  },
  attemptId: string,
  values: {
    canonicalUrl: string | null;
    verificationStatus: FeeKnowledgeResearchCandidateRecord["verificationStatus"];
    reasonCodes: readonly string[];
    safeApplicability: FeeKnowledgeResearchCandidateRecord["safeApplicability"];
    sourceFingerprint: string | null;
    retrievalStatus: FeeKnowledgeResearchCandidateRecord["retrievalStatus"];
    semanticVerificationStatus: FeeKnowledgeResearchCandidateRecord["semanticVerificationStatus"];
    safeRetrievalDiagnostics?: FeeKnowledgeResearchCandidateRecord["safeRetrievalDiagnostics"];
    locatorHash: string | null;
    claimSupportDecisionRef: string | null;
  },
): FeeKnowledgeResearchCandidateRecord {
  return {
    type: "fee_knowledge_research_candidate",
    policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
    candidateId: input.candidateId,
    questionRef: feeKnowledgeQuestionRef(input.question, input.questionOrdinal ?? 0),
    feeRowRef: input.question.feeRowRef,
    attemptId,
    retrievalStatus: values.retrievalStatus,
    semanticVerificationStatus: values.semanticVerificationStatus,
    canonicalUrl: values.canonicalUrl,
    title: sanitizeText(input.candidate.title ?? "", 160) || null,
    publisher: sanitizeText(input.candidate.publisher ?? "", 120) || null,
    verificationStatus: values.verificationStatus,
    reasonCodes: [...new Set(values.reasonCodes)].sort(),
    safeApplicability: values.safeApplicability,
    sourceFingerprint: values.sourceFingerprint,
    safeRetrievalDiagnostics: values.safeRetrievalDiagnostics ?? null,
    locatorHash: values.locatorHash,
    claimSupportDecisionRef: values.claimSupportDecisionRef,
    displayPermission: "internal_only",
  };
}

function citationFromLocatorHash(
  document: RetrievedDocument,
  locatorTextHash: string,
): { exists: boolean; locator: NonNullable<RetrievedDocument["locators"][number]> | null; excerpt: string } {
  if (document.status !== "retrieved_text" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(locatorTextHash)) {
    return { exists: false, locator: null, excerpt: "" };
  }
  const locator = document.locators.find((item) => item.textHash === locatorTextHash) ?? null;
  if (!locator) return { exists: false, locator: null, excerpt: "" };
  const start = locator.textStart ?? 0;
  const end = locator.textEnd ?? Math.min(document.text.length, start + 1200);
  if (start < 0 || end <= start) return { exists: false, locator: null, excerpt: "" };
  return { exists: true, locator, excerpt: sanitizeText(document.text.slice(start, Math.min(end, start + 1200)), 1200) };
}

function candidateAfterRetrieval(
  candidate: FeeKnowledgeResearchCandidateRecord,
  retrieved: RetrievedDocument,
): FeeKnowledgeResearchCandidateRecord {
  return {
    ...candidate,
    canonicalUrl: retrieved.canonicalUrl,
    retrievalStatus: retrieved.status,
    verificationStatus: retrieved.status === "retrieved_text" ? "provisional"
      : retrieved.status === "safety_blocked" ? "safety_blocked"
        : retrieved.status === "retrieval_succeeded_text_unavailable" ? "source_unavailable" : "rejected",
    reasonCodes: [...new Set([...retrieved.reasonCodes, "fee_knowledge_semantic_support_not_run"])].sort(),
    sourceFingerprint: retrieved.documentFingerprint,
    safeRetrievalDiagnostics: retrieved.safeDiagnostics,
  };
}

function snapshotResearchResult(
  result: FeeKnowledgeResearchCoreResult,
  diagnostics: FeeKnowledgeResearchDiagnostics,
): FeeKnowledgeResearchResult {
  return structuredClone({
    attempts: result.attempts,
    candidates: result.candidates,
    intelligence: result.intelligence,
    claimSupports: result.claimSupports,
    diagnostics,
  });
}

function terminalResearchSnapshot(input: {
  questions: readonly FeeKnowledgeResearchQuestion[];
  attempts: readonly FeeKnowledgeResearchAttemptRecord[];
  candidates: readonly FeeKnowledgeResearchCandidateRecord[];
  intelligence: readonly FeeKnowledgeIntelligenceRecord[];
  claimSupports: readonly FeeKnowledgeClaimSupportRecord[];
  status: "failed" | "timed_out";
}): FeeKnowledgeResearchCoreResult {
  const candidates = structuredClone([...input.candidates]);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (candidate.retrievalStatus === "not_started") {
      candidates[index] = {
        ...candidate,
        retrievalStatus: input.status,
        semanticVerificationStatus: "not_started",
        verificationStatus: "rejected",
        reasonCodes: [
          input.status === "timed_out" ? "fee_knowledge_retrieval_timed_out" : "fee_knowledge_retrieval_fetch_failed",
          "fee_knowledge_semantic_support_not_run",
        ].sort(),
      };
    } else if (candidate.retrievalStatus === "retrieved_text" && candidate.semanticVerificationStatus === "not_started") {
      candidates[index] = {
        ...candidate,
        semanticVerificationStatus: input.status,
        verificationStatus: "verified_candidate_limited",
        reasonCodes: [...new Set([
          ...candidate.reasonCodes.filter((reason) => reason !== "fee_knowledge_semantic_support_not_run"),
          input.status === "timed_out" ? "fee_knowledge_semantic_timed_out" : "fee_knowledge_semantic_failed",
        ])].sort(),
      };
    }
  }
  const attemptsByQuestion = new Map(input.attempts.map((attempt) => [attempt.questionRef, structuredClone(attempt)]));
  for (const [index, question] of input.questions.entries()) {
    const questionRef = feeKnowledgeQuestionRef(question, index);
    if (attemptsByQuestion.has(questionRef)) continue;
    const beyondSelectedPlan = index >= FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls;
    const status = beyondSelectedPlan ? "not_selected_planning" : input.status;
    const candidateIds = candidates.filter((candidate) => candidate.questionRef === questionRef).map((candidate) => candidate.candidateId);
    attemptsByQuestion.set(questionRef, attemptRecord(question, index, status, candidateIds, [researchFailureReason(status)]));
  }
  return {
    attempts: input.questions.map((question, index) => attemptsByQuestion.get(feeKnowledgeQuestionRef(question, index))!),
    candidates,
    intelligence: structuredClone([...input.intelligence]),
    claimSupports: structuredClone([...input.claimSupports]),
  };
}

function upsertAttempt(
  attempts: FeeKnowledgeResearchAttemptRecord[],
  attempt: FeeKnowledgeResearchAttemptRecord,
): void {
  const index = attempts.findIndex((item) => item.questionRef === attempt.questionRef);
  if (index < 0) attempts.push(attempt);
  else attempts[index] = attempt;
}

function researchFailureReason(status: FeeKnowledgeResearchAttemptRecord["status"]): string {
  if (status === "unsupported_model") return "fee_knowledge_web_search_model_unsupported";
  if (status === "safety_blocked") return "fee_knowledge_research_safety_blocked";
  if (status === "budget_exhausted") return "fee_knowledge_research_budget_exhausted";
  if (status === "not_selected_planning") return "fee_knowledge_research_not_selected_planning";
  if (status === "provider_unavailable") return "fee_knowledge_web_search_provider_unavailable_before_send";
  if (status === "timed_out") return "fee_knowledge_research_timed_out";
  return "fee_knowledge_research_failed";
}

function attemptRecord(
  question: FeeKnowledgeResearchQuestion,
  index: number,
  status: FeeKnowledgeResearchAttemptRecord["status"],
  candidateIds: readonly string[],
  reasonCodes: readonly string[],
): FeeKnowledgeResearchAttemptRecord {
  return {
    type: "fee_knowledge_research_attempt",
    policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
    attemptId: attemptIdFor(question, index),
    questionRef: feeKnowledgeQuestionRef(question, index),
    feeRowRef: question.feeRowRef,
    sanitizedQuestionCategory: question.sanitizedQuestionCategory,
    triggerReason: question.triggerReason,
    status,
    resultCount: candidateIds.length,
    candidateIds: [...candidateIds].sort(),
    reasonCodes: [...new Set(reasonCodes)].sort(),
    providerDetailsStripped: true,
  };
}

function attemptIdFor(question: FeeKnowledgeResearchQuestion, index: number): string {
  return `research_${stableId([question.feeRowRef, question.sanitizedQuestionCategory, question.triggerReason, String(index)])}`;
}

function researchEnabled(options: FeeKnowledgeResearchOptions): boolean {
  return options.enabled ?? /^(1|true|yes|on)$/i.test(process.env.RATEREVEAL_FEE_KNOWLEDGE_RESEARCH_ENABLED ?? "");
}

function initialResearchDiagnosticState(
  enabled: boolean,
  questionCount: number,
): MutableFeeKnowledgeResearchDiagnosticState {
  return {
    startedAt: Date.now(),
    enabled,
    questionCount,
    selectedQuestionCount: 0,
    searchCallCount: 0,
    retrievalAttemptCount: 0,
    statementInvestigativeAttempted: false,
    statementInvestigativeStatus: "disabled",
    statementInvestigativeOutputRecordCount: 0,
    statementInvestigativeReasonCodes: new Set<string>(),
    retrievedInvestigativeAttemptCount: 0,
    retrievedInvestigativeStatuses: [],
    retrievedInvestigativeOutputRecordCount: 0,
    retrievedInvestigativeReasonCodes: new Set<string>(),
    stageElapsedMs: {
      planning: 0,
      webSearchDiscovery: 0,
      retrieval: 0,
      statementInvestigativeIntelligence: 0,
      retrievedDocumentInvestigativeIntelligence: 0,
      semanticVerification: 0,
    },
  };
}

function buildResearchDiagnostics(
  state: MutableFeeKnowledgeResearchDiagnosticState,
  result: Pick<FeeKnowledgeResearchCoreResult, "attempts" | "candidates" | "claimSupports">,
): FeeKnowledgeResearchDiagnostics {
  const safeReasonCodes = new Set<string>();
  for (const attempt of result.attempts) attempt.reasonCodes.filter(safeReasonCode).forEach((code) => safeReasonCodes.add(code));
  for (const candidate of result.candidates) candidate.reasonCodes.filter(safeReasonCode).forEach((code) => safeReasonCodes.add(code));
  for (const support of result.claimSupports) {
    support.semanticSupport.reasonCodes
      .filter((code) => safeReasonCode(code) && code.startsWith("fee_knowledge_"))
      .forEach((code) => safeReasonCodes.add(code));
  }
  state.statementInvestigativeReasonCodes.forEach((code) => safeReasonCodes.add(code));
  state.retrievedInvestigativeReasonCodes.forEach((code) => safeReasonCodes.add(code));
  const pdfCandidates = result.candidates.filter((candidate) => contentTypeClass(candidate.safeRetrievalDiagnostics?.contentType) === "pdf");
  return {
    policyVersion: "fee_knowledge_research_diagnostics_v1",
    enabled: state.enabled,
    questionCount: state.questionCount,
    selectedQuestionCount: state.selectedQuestionCount,
    searchCallCount: state.searchCallCount,
    searchAttemptStatusCounts: countBy(result.attempts.map((attempt) => attempt.status)),
    candidateCount: result.candidates.length,
    candidateContentTypeCounts: countContentTypes(result.candidates.map((candidate) => candidate.safeRetrievalDiagnostics?.contentType)),
    retrievalAttemptCount: state.retrievalAttemptCount,
    retrievalStatusCounts: countBy(result.candidates.map((candidate) => candidate.retrievalStatus)),
    retrievedPdf: {
      attemptCount: pdfCandidates.length,
      successfulCount: pdfCandidates.filter((candidate) => candidate.retrievalStatus === "retrieved_text").length,
      timedOutCount: pdfCandidates.filter((candidate) => candidate.retrievalStatus === "timed_out").length,
      failedCount: pdfCandidates.filter((candidate) => !["retrieved_text", "timed_out"].includes(candidate.retrievalStatus)).length,
      statusCounts: countBy(pdfCandidates.map((candidate) => candidate.retrievalStatus)),
      safeReasonCodes: [...new Set(pdfCandidates.flatMap((candidate) => candidate.reasonCodes).filter(safeReasonCode))].sort(),
    },
    investigative: {
      statement: {
        attempted: state.statementInvestigativeAttempted,
        status: state.statementInvestigativeStatus,
        outputRecordCount: state.statementInvestigativeOutputRecordCount,
        safeReasonCodes: [...state.statementInvestigativeReasonCodes].filter(safeReasonCode).sort(),
      },
      retrievedDocument: {
        attemptCount: state.retrievedInvestigativeAttemptCount,
        statusCounts: countBy(state.retrievedInvestigativeStatuses),
        outputRecordCount: state.retrievedInvestigativeOutputRecordCount,
        safeReasonCodes: [...state.retrievedInvestigativeReasonCodes].filter(safeReasonCode).sort(),
      },
    },
    semanticVerificationAttemptCount: result.candidates.filter((candidate) =>
      candidate.semanticVerificationStatus !== "not_started" && candidate.semanticVerificationStatus !== "not_eligible"
    ).length,
    semanticVerificationStatusCounts: countBy(result.candidates.map((candidate) => candidate.semanticVerificationStatus)),
    claimSupportCount: result.claimSupports.length,
    verifiedClaimSupportCount: result.claimSupports.filter((support) => isVerifiedDocumentationDecision(support.evidenceDecision)).length,
    safeReasonCodes: [...safeReasonCodes].sort(),
    elapsedMs: elapsedSince(state.startedAt),
    stageElapsedMs: { ...state.stageElapsedMs },
  };
}

function investigativeStatus(
  records: readonly FeeKnowledgeIntelligenceRecord[],
): FeeKnowledgeResearchDiagnostics["investigative"]["statement"]["status"] {
  if (records.some((record) => record.reasonCodes.includes("fee_knowledge_ai_investigative_unavailable_before_send"))) {
    return "provider_unavailable";
  }
  if (records.some((record) => record.reasonCodes.includes("fee_knowledge_ai_investigative_provider_failed"))) {
    return "failed";
  }
  return "completed";
}

function safeInvestigativeReasonCodes(records: readonly FeeKnowledgeIntelligenceRecord[]): string[] {
  return [...new Set(records.flatMap((record) => record.reasonCodes).filter((code) =>
    safeReasonCode(code) && code.startsWith("fee_knowledge_ai_investigative_")
  ))].sort();
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function contentTypeClass(value: string | null | undefined): "html" | "text" | "pdf" | "other_or_unknown" {
  if (!value) return "other_or_unknown";
  if (value.startsWith("application/pdf")) return "pdf";
  if (value.startsWith("text/html") || value.startsWith("application/xhtml+xml")) return "html";
  if (value.startsWith("text/plain")) return "text";
  return "other_or_unknown";
}

function countContentTypes(values: readonly (string | null | undefined)[]): Record<"html" | "text" | "pdf" | "other_or_unknown", number> {
  const counts = { html: 0, text: 0, pdf: 0, other_or_unknown: 0 };
  for (const value of values) counts[contentTypeClass(value)] += 1;
  return counts;
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

async function withAbortTimeout<T>(operation: (abortSignal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  try {
    return await new Promise<T>((resolve, reject) => {
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          controller.abort(new Error(`Fee knowledge research timed out after ${timeoutMs}ms`));
          reject(new Error(`Fee knowledge research timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }
      operation(controller.signal).then(
        (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      );
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withParentAbortTimeout<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  operation: (abortSignal: AbortSignal) => Promise<T>,
  reasonCode: string,
): Promise<T> {
  if (parentSignal.aborted) throw parentSignal.reason ?? new Error("fee_knowledge_research_graph_timed_out");
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", onParentAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutError = Object.assign(new Error(reasonCode), { name: "AbortError" });
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal.removeEventListener("abort", onParentAbort);
  }
}

function isTimeoutError(error: unknown): boolean {
  return /timed_out|timed out|timeout/i.test(error instanceof Error ? error.message : String(error));
}

function extractWebSearchCallSources(raw: unknown): FeeKnowledgeDiscoveryCandidate[] {
  const output = arrayField(recordField(raw, "output"));
  const candidates: FeeKnowledgeDiscoveryCandidate[] = [];
  for (const item of output) {
    const record = asRecord(item);
    if (record?.type !== "web_search_call") continue;
    const action = asRecord(record.action);
    for (const source of arrayField(action?.sources)) {
      const sourceRecord = asRecord(source);
      if (sourceRecord?.type !== "url") continue;
      const url = stringField(sourceRecord, "url");
      if (!url || !safeDiscoveryUrl(url)) continue;
      candidates.push({ url, title: stringField(sourceRecord, "title"), publisher: stringField(sourceRecord, "publisher") ?? stringField(sourceRecord, "source") });
    }
  }
  return candidates;
}

function extractUrlCitationAnnotations(raw: unknown): FeeKnowledgeDiscoveryCandidate[] {
  const output = arrayField(recordField(raw, "output"));
  const candidates: FeeKnowledgeDiscoveryCandidate[] = [];
  for (const item of output) {
    const record = asRecord(item);
    if (record?.type !== "message") continue;
    for (const content of arrayField(record.content)) {
      const contentRecord = asRecord(content);
      if (contentRecord?.type !== "output_text") continue;
      for (const annotation of arrayField(contentRecord.annotations)) {
        const annotationRecord = asRecord(annotation);
        if (annotationRecord?.type !== "url_citation") continue;
        const url = stringField(annotationRecord, "url");
        if (!url || !safeDiscoveryUrl(url)) continue;
        candidates.push({ url, title: stringField(annotationRecord, "title"), publisher: stringField(annotationRecord, "publisher") ?? stringField(annotationRecord, "source") });
      }
    }
  }
  return candidates;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      return { error: await response.text() };
    } catch {
      return null;
    }
  }
}

function providerRefused(raw: unknown): boolean {
  return arrayField(recordField(raw, "output")).some((item) => {
    const message = asRecord(item);
    return message?.type === "message"
      && arrayField(message.content).some((content) => asRecord(content)?.type === "refusal");
  });
}

function validateWebSearchModel(model: string): void {
  if (!isOpenAiWebSearchModelSupported(model)) {
    throw new FeeKnowledgeSearchProviderError("unsupported_model", `Configured OpenAI model ${model} is not approved for fee knowledge web_search.`);
  }
}

export function isOpenAiWebSearchModelSupported(model: string): boolean {
  return WEB_SEARCH_MODEL_PATTERN.test(model);
}

function semanticDecisionFromRaw(raw: unknown, structuredClaim: FeeKnowledgeStructuredClaim): FeeKnowledgeSemanticSupportDecision {
  const root = asRecord(raw);
  if (root?.status === "incomplete") {
    const incompleteDetails = asRecord(root.incomplete_details);
    const reason = incompleteDetails ? stringField(incompleteDetails, "reason") : null;
    return unsupportedSemanticDecision(
      structuredClaim,
      reason === "max_output_tokens"
        ? "fee_knowledge_semantic_output_exhausted"
        : "fee_knowledge_semantic_response_incomplete",
    );
  }
  const text = outputText(raw);
  const parsed = parseJsonObject(text);
  if (!parsed) return unsupportedSemanticDecision(structuredClaim, "fee_knowledge_semantic_json_invalid");
  const decision = typeof parsed?.decision === "string" ? parsed.decision : "unsupported";
  const allowed = ["supports", "partially_supports", "does_not_support", "contradicts", "unsupported"];
  return {
    type: "fee_knowledge_semantic_support_decision",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    decision: allowed.includes(decision) ? (decision as FeeKnowledgeSemanticSupportDecision["decision"]) : "unsupported",
    structuredClaim,
    reasonCodes: arrayField(parsed?.reasonCodes).map(String).filter(safeReasonCode).slice(0, 6),
    providerDetailsStripped: true,
  };
}

function semanticSupportOutputJsonSchema(): Record<string, unknown> {
  return {
    type: "json_schema",
    name: "fee_knowledge_semantic_support_decision",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["decision", "reasonCodes"],
      properties: {
        decision: {
          type: "string",
          enum: ["supports", "partially_supports", "does_not_support", "contradicts", "unsupported"],
        },
        reasonCodes: {
          type: "array",
          maxItems: 6,
          items: { type: "string", pattern: "^[a-z0-9_]{3,120}$" },
        },
      },
    },
  };
}

function unsupportedSemanticDecision(structuredClaim: FeeKnowledgeStructuredClaim, reasonCode: string): FeeKnowledgeSemanticSupportDecision {
  return {
    type: "fee_knowledge_semantic_support_decision",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    decision: "unsupported",
    structuredClaim,
    reasonCodes: [reasonCode],
    providerDetailsStripped: true,
  };
}

function outputText(raw: unknown): string {
  const output = arrayField(recordField(raw, "output"));
  const parts: string[] = [];
  for (const item of output) {
    const record = asRecord(item);
    if (record?.type !== "message") continue;
    for (const content of arrayField(record.content)) {
      const contentRecord = asRecord(content);
      if (contentRecord?.type === "output_text" && typeof contentRecord.text === "string") parts.push(contentRecord.text);
    }
  }
  return parts.join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return asRecord(value);
  } catch {
    return null;
  }
}

function structuredClaimFor(question: FeeKnowledgeResearchQuestion): FeeKnowledgeStructuredClaim {
  const claimKind = /application|applies|statement basis|calculate/i.test(question.semanticQuestion)
    ? "merchant_application"
    : /rule|rate|interchange|assessment/i.test(question.semanticQuestion)
      ? "published_rule"
      : "classification";
  return {
    claimKind,
    feeLabel: question.feeLabel,
    processorOrNetwork: question.processorOrNetwork,
    statementPeriodYear: question.statementPeriodYear,
    proposedCategory: question.deterministicCategory,
    likelyEconomicOwner: question.deterministicEconomicOwner,
    likelyContractualController: question.deterministicContractualController,
    conditions: [],
    exclusions: [],
    maximumConfidence: question.deterministicConfidence,
    actionabilityCeiling: question.deterministicActionabilityCeiling,
    ruleValue: null,
    applicationBasis: claimKind === "merchant_application" ? "statement_basis_matches" : "not_evaluated",
  };
}

function runtimeContradictions(input: {
  semanticSupport: FeeKnowledgeSemanticSupportDecision;
  structuredClaim: FeeKnowledgeStructuredClaim;
  processorMatched: boolean;
  periodApplicable: boolean;
  priorClaimSupports: readonly FeeKnowledgeClaimSupportRecord[];
  question: FeeKnowledgeResearchQuestion;
}): string[] {
  const contradictions: string[] = [];
  if (input.semanticSupport.decision === "contradicts") contradictions.push("semantic_support_contradicts_claim");
  const priorVerified = input.priorClaimSupports.filter((support) => support.feeRowRef === input.question.feeRowRef && isVerifiedDocumentationDecision(support.evidenceDecision));
  for (const prior of priorVerified) {
    if (prior.structuredClaim.proposedCategory && input.structuredClaim.proposedCategory && prior.structuredClaim.proposedCategory !== input.structuredClaim.proposedCategory) {
      contradictions.push("runtime_or_registry_category_conflict");
    }
  }
  return [...new Set(contradictions)].sort();
}

function evidenceDecisionFor(input: {
  structuredClaim: FeeKnowledgeStructuredClaim;
  semanticSupport: FeeKnowledgeSemanticSupportDecision;
  processorMatched: boolean;
  periodApplicable: boolean;
  contradictions: readonly string[];
}): FeeKnowledgeEvidenceDecision {
  if (input.contradictions.length > 0) return "conflicting_evidence";
  if (!input.processorMatched || !input.periodApplicable) return "source_inapplicable";
  if (input.semanticSupport.decision === "unsupported" || input.semanticSupport.decision === "does_not_support") return "unsupported";
  if (input.semanticSupport.decision === "partially_supports") return "needs_verification";
  if (input.semanticSupport.decision !== "supports") return "possible_interpretation";
  if (input.structuredClaim.claimKind === "published_rule") return "verified_rule";
  if (
    input.structuredClaim.claimKind === "merchant_application" &&
    input.structuredClaim.applicationBasis === "statement_basis_matches" &&
    input.semanticSupport.reasonCodes.includes("deterministic_calculation_matches")
  ) {
    return "verified_application";
  }
  if (!input.structuredClaim.proposedCategory) return "possible_interpretation";
  return "verified_classification";
}

function materialRow(row: Pick<CanonicalStatementAnalysis["feeLedger"]["rows"][number], "selectedAmount" | "selectedLabel" | "role" | "contributesToUniqueTotal">): boolean {
  if (row.role === "unknown_unresolved" || unfamiliarLabel(row.selectedLabel)) return true;
  if (row.contributesToUniqueTotal) return true;
  return Boolean(row.selectedAmount && Math.abs(row.selectedAmount.amountMinor) > 0);
}

function unfamiliarLabel(label: string): boolean {
  return /unknown|unfamiliar|review|other|misc|non.?qual|assessment|access|auth/i.test(label);
}

function priority(reason: FeeKnowledgeResearchQuestion["triggerReason"]): number {
  return {
    contradicted_source: 0,
    expired_or_superseded_source: 1,
    adaptive_inaccessible_authoritative_source: 1,
    adaptive_missing_rate_rule_evidence: 1,
    adaptive_missing_applicability: 1,
    missing_applicable_registry_claim: 2,
    material_unfamiliar_label: 3,
    disabled: 4,
    not_needed: 5,
  }[reason];
}

function semanticQuestionForResearch(input: {
  feeLabel: string;
  triggerReason: FeeKnowledgeResearchQuestion["triggerReason"];
  deterministicCategory: CanonicalFeeCategory | null;
  selected: CanonicalStatementAnalysis["feeOwnershipActionability"]["rowClassifications"][number]["selected"] | null | undefined;
}): string {
  const label = safeContextText(input.feeLabel) ?? "this payment processing fee";
  if (input.triggerReason === "contradicted_source") {
    return `Find authoritative documentation that resolves conflicting classification or rule evidence for ${label}.`;
  }
  if (input.triggerReason === "expired_or_superseded_source") {
    return `Find current authoritative documentation for ${label}, including active fee schedules or rule versions.`;
  }
  if (input.selected?.actionabilityCeiling === "potentially_actionable" || input.deterministicCategory === "processor_markup") {
    return `Find authoritative processor or network documentation that explains ${label}, its ownership, and whether it is a processor markup or published network/card-brand fee.`;
  }
  if (input.deterministicCategory === "interchange" || input.deterministicCategory === "card_brand_network_assessment") {
    return `Find official card-network documentation that defines ${label} or an applicable published rate/rule.`;
  }
  return `Find official documentation that explains this payment processing fee label, likely aliases, ownership, or published rule.`;
}

function researchQuestionPriorityScore(input: {
  question: FeeKnowledgeResearchQuestion;
  label?: string;
  role?: string | null;
  contributesToUniqueTotal?: boolean;
  amountMinor?: number;
}): number {
  const question = input.question;
  const normalized = normalizeText([question.feeLabel, input.label ?? "", question.semanticQuestion, question.statementSection ?? ""].join(" "));
  let score = 0;
  score += {
    contradicted_source: 1000,
    expired_or_superseded_source: 900,
    adaptive_inaccessible_authoritative_source: 880,
    adaptive_missing_rate_rule_evidence: 860,
    adaptive_missing_applicability: 840,
    material_unfamiliar_label: 760,
    missing_applicable_registry_claim: 420,
    disabled: 0,
    not_needed: 0,
  }[question.triggerReason];
  if (question.deterministicActionabilityCeiling === "potentially_actionable") score += 260;
  if (question.deterministicCategory === "processor_markup") score += 240;
  if (question.deterministicCategory === "unknown_needs_review") score += 220;
  if (question.deterministicCategory === "card_brand_network_assessment" || question.deterministicCategory === "interchange") score += 180;
  if (question.deterministicConfidence === "low") score += 120;
  if (question.deterministicConfidence === "medium") score += 40;
  if (input.role === "unknown_unresolved") score += 160;
  if (input.contributesToUniqueTotal) score += 45;
  if ((input.amountMinor ?? 0) !== 0) score += Math.min(160, Math.floor(Math.log10(Math.abs(input.amountMinor ?? 0) + 1) * 35));
  if (/\b(?:non\s?qual|nonqualified|downgrade|surcharge|basis|access|assessment|authorization|auth|pci|monthly|annual|service|batch|chargeback|retrieval|dues|network|interchange|visa|mastercard|discover|amex|american express)\b/.test(normalized)) score += 120;
  if (/\b(?:other|misc|unknown|adjustment|review)\b/.test(normalized)) score += 90;
  if (question.statementPeriodYear) score += 20;
  if (question.processorOrNetwork) score += 20;
  return score;
}

function researchQuestionPriorityReasonCodes(question: FeeKnowledgeResearchQuestion): string[] {
  const reasonCodes = [`fee_knowledge_research_priority_${question.triggerReason}`];
  if (question.deterministicActionabilityCeiling === "potentially_actionable") reasonCodes.push("fee_knowledge_research_priority_actionable");
  if (question.deterministicCategory === "processor_markup") reasonCodes.push("fee_knowledge_research_priority_markup");
  if (question.deterministicCategory === "unknown_needs_review") reasonCodes.push("fee_knowledge_research_priority_unknown");
  if (question.deterministicCategory === "card_brand_network_assessment" || question.deterministicCategory === "interchange") reasonCodes.push("fee_knowledge_research_priority_network_fee");
  if (question.deterministicConfidence !== "high") reasonCodes.push("fee_knowledge_research_priority_uncertain");
  return [...new Set(reasonCodes)].sort();
}

function researchSearchTerms(question: FeeKnowledgeResearchQuestion): string[] {
  const terms = [
    question.processorOrNetwork,
    question.feeLabel,
    question.deterministicCategory,
    question.deterministicEconomicOwner,
    question.deterministicContractualController,
    question.statementPeriodYear,
    ...adaptiveSearchTerms(question),
    ...networkAliases(question),
    ...categorySearchTerms(question),
  ];
  return [...new Set(terms
    .filter((term): term is string => Boolean(term))
    .map((term) => sanitizeText(term, 80))
    .filter(Boolean))]
    .slice(0, 14);
}

function sourcePreferenceHints(question: FeeKnowledgeResearchQuestion): string[] {
  const hints = ["official documentation", "fee schedule", "rules", "rate table", "PDF"];
  if (question.processorOrNetwork) hints.push(`${question.processorOrNetwork} official`);
  for (const network of networkAliases(question)) hints.push(`${network} official`);
  if (question.adaptiveFollowUp?.missingDimensions.includes("authoritative_source_inaccessible")) {
    hints.push("alternate official PDF", "archived official schedule", "official downloadable fee schedule");
  }
  if (question.adaptiveFollowUp?.missingDimensions.includes("rate_rule_missing")) {
    hints.push("published rate table", "fee schedule PDF", "effective date");
  }
  if (question.adaptiveFollowUp?.missingDimensions.includes("processor_network_mismatch")) {
    hints.push("network official documentation", "processor official documentation");
  }
  if (question.deterministicCategory === "processor_markup") hints.push("processor pricing guide", "merchant services fee schedule");
  if (question.deterministicCategory === "interchange") hints.push("interchange reimbursement fee schedule");
  if (question.deterministicCategory === "card_brand_network_assessment") hints.push("assessment fee schedule", "card brand fee schedule");
  return [...new Set(hints.map((hint) => sanitizeText(hint, 100)).filter(Boolean))].slice(0, 12);
}

function categorySearchTerms(question: FeeKnowledgeResearchQuestion): string[] {
  if (question.deterministicCategory === "processor_markup") return ["processor markup", "merchant services fee", "pricing schedule"];
  if (question.deterministicCategory === "interchange") return ["interchange", "reimbursement fee", "interchange rate"];
  if (question.deterministicCategory === "card_brand_network_assessment") return ["assessment", "network fee", "card brand fee"];
  if (question.deterministicCategory === "network_access_or_authorization") return ["network fee", "pass-through fee", "assessment"];
  return ["fee definition", "fee schedule"];
}

function networkAliases(question: FeeKnowledgeResearchQuestion): string[] {
  const text = normalizeText([question.feeLabel, question.processorOrNetwork ?? "", question.semanticQuestion].join(" "));
  const aliases: string[] = [];
  if (/\bvisa\b/.test(text)) aliases.push("Visa");
  if (/\bmaster\s?card\b/.test(text)) aliases.push("Mastercard");
  if (/\bdiscover\b/.test(text)) aliases.push("Discover");
  if (/\b(?:amex|american express)\b/.test(text)) aliases.push("American Express");
  return aliases;
}

function discoveryCandidateScore(candidate: FeeKnowledgeDiscoveryCandidate, question: FeeKnowledgeResearchQuestion): number {
  let score = 0;
  const url = safeUrl(candidate.url);
  const host = url?.hostname.toLowerCase() ?? "";
  const path = url ? normalizeText(url.pathname) : "";
  const title = normalizeText(candidate.title ?? "");
  const publisher = normalizeText(candidate.publisher ?? "");
  const haystack = normalizeText([host, path, title, publisher].join(" "));
  const labelTokens = meaningfulQueryTokens(question.feeLabel);
  const queryTokens = meaningfulQueryTokens([question.semanticQuestion, question.deterministicCategory ?? "", ...categorySearchTerms(question)].join(" "));
  const networks = networkAliases(question).map(normalizeText);
  const adaptiveTerms = adaptiveSearchTerms(question).map(normalizeText);
  if (url?.protocol === "https:") score += 20;
  score += officialDomainScore(host, question);
  if (host.endsWith(".gov")) score += 120;
  if (/\b(?:fee|fees|rate|rates|schedule|rules?|interchange|assessment|program|pricing|guide|merchant)\b/.test(haystack)) score += 90;
  if (/\b(?:pdf|download|library|rules|schedule|interchange|assessment|fee)\b/.test(path)) score += 65;
  if (question.statementPeriodYear && haystack.includes(question.statementPeriodYear)) score += 55;
  for (const network of networks) {
    if (haystack.includes(network)) score += 130;
  }
  for (const token of labelTokens) {
    if (haystack.includes(token)) score += token.length >= 8 ? 60 : 30;
  }
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 18;
  }
  for (const token of adaptiveTerms) {
    if (haystack.includes(token)) score += 40;
  }
  if (question.processorOrNetwork && haystack.includes(normalizeText(question.processorOrNetwork))) score += 90;
  if (/\b(?:blog|news|press|learn|insights|faq|support|contact|login|careers|about|glossary)\b/.test(haystack)) score -= 75;
  if (/\b(?:what is|guide to|explained|education|small business)\b/.test(title)) score -= 60;
  if (!/\b(?:fee|rate|schedule|rule|interchange|assessment|pricing|program)\b/.test(haystack)) score -= 40;
  return score;
}

type FeeKnowledgeDiscoveryCandidateAssessment = {
  authority: "question_specific_official" | "general_authoritative" | "non_authoritative";
  applicabilityScore: number;
  rankTier: number;
  score: number;
};

function assessFeeKnowledgeDiscoveryCandidate(
  candidate: FeeKnowledgeDiscoveryCandidate,
  question: FeeKnowledgeResearchQuestion,
): FeeKnowledgeDiscoveryCandidateAssessment {
  const url = safeUrl(candidate.url);
  const host = url?.hostname.toLowerCase() ?? "";
  const haystack = normalizeText([
    host,
    url?.pathname ?? "",
    candidate.title ?? "",
    candidate.publisher ?? "",
  ].join(" "));
  const authority = questionSpecificOfficialDomain(host, question)
    ? "question_specific_official"
    : generalAuthoritativeDomain(host)
      ? "general_authoritative"
      : "non_authoritative";
  const applicabilityScore = discoveryApplicabilityScore(haystack, question);
  const weakSourcePenalty = weakDiscoverySourcePenalty(host);
  const rankTier = authority === "question_specific_official" && applicabilityScore >= 2 ? 4
    : authority === "general_authoritative" && applicabilityScore >= 2 ? 3
      : applicabilityScore >= 2 ? 2
        : applicabilityScore >= 1 ? 1 : 0;
  return {
    authority,
    applicabilityScore,
    rankTier,
    score: discoveryCandidateScore(candidate, question) + applicabilityScore * 100 + weakSourcePenalty,
  };
}

function inaccessibleCandidateIsAuthoritativeForQuestion(
  candidate: FeeKnowledgeResearchCandidateRecord,
  question: FeeKnowledgeResearchQuestion,
): boolean {
  if (candidate.retrievalStatus === "retrieved_text") return false;
  const host = candidate.safeRetrievalDiagnostics?.finalSourceDomain
    ?? candidate.safeRetrievalDiagnostics?.sourceDomain
    ?? safeUrl(candidate.canonicalUrl ?? "")?.hostname
    ?? "";
  const assessment = assessFeeKnowledgeDiscoveryCandidate({
    url: host ? `https://${host}/` : "",
    title: candidate.title,
    publisher: candidate.publisher,
  }, question);
  return assessment.authority === "question_specific_official" && assessment.applicabilityScore >= 2;
}

function discoveryApplicabilityScore(haystack: string, question: FeeKnowledgeResearchQuestion): number {
  let score = 0;
  const labelMatches = meaningfulQueryTokens(question.feeLabel).filter((token) => haystack.includes(token)).length;
  if (labelMatches >= 2) score += 2;
  else if (labelMatches === 1) score += 1;
  const processor = normalizeText(question.processorOrNetwork ?? "");
  if (processor && haystack.includes(processor)) score += 1;
  if (networkAliases(question).map(normalizeText).some((network) => haystack.includes(network))) score += 1;
  if (/\b(?:fee|rate|schedule|rule|interchange|assessment|pricing|program|authorization|discount)\b/.test(haystack)) score += 1;
  if (question.statementPeriodYear && haystack.includes(question.statementPeriodYear)) score += 1;
  return score;
}

function questionSpecificOfficialDomain(host: string, question: FeeKnowledgeResearchQuestion): boolean {
  if (!host) return false;
  const officialNetworkDomains = new Map<string, readonly string[]>([
    ["visa", ["visa.com"]],
    ["mastercard", ["mastercard.com"]],
    ["discover", ["discover.com", "discovernetwork.com", "discoverglobalnetwork.com"]],
    ["american express", ["americanexpress.com", "aexp-static.com"]],
  ]);
  for (const network of networkAliases(question).map(normalizeText)) {
    if ((officialNetworkDomains.get(network) ?? []).some((domain) => domainMatches(host, domain))) return true;
  }
  const processor = normalizeText(question.processorOrNetwork ?? "");
  const processorDomains: Array<[string, readonly string[]]> = [
    ["fiserv", ["fiserv.com", "firstdata.com"]],
    ["paysafe", ["paysafe.com"]],
    ["basys", ["basys.com", "basyspro.com", "basyspro.net", "basysuniversity.com"]],
    ["merchant one", ["merchantone.com"]],
    ["clover", ["clover.com"]],
  ];
  if (processor && processorDomains.some(([alias, domains]) => processor.includes(alias) && domains.some((domain) => domainMatches(host, domain)))) {
    return true;
  }
  return Boolean(question.processorOrNetwork && verifiedPublisherDomain(host, question.processorOrNetwork));
}

function generalAuthoritativeDomain(host: string): boolean {
  return /(?:^|\.)gov(?:\.[a-z]{2})?$/.test(host);
}

function weakDiscoverySourcePenalty(host: string): number {
  if (domainMatches(host, "reddit.com")) return -300;
  if (domainMatches(host, "arxiv.org")) return -180;
  return 0;
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function adaptiveSearchTerms(question: FeeKnowledgeResearchQuestion): string[] {
  const dimensions = question.adaptiveFollowUp?.missingDimensions ?? [];
  const terms: string[] = [];
  if (dimensions.includes("fee_or_alias_missing")) terms.push("alias", "authorization fee", "sales discount", "assessment", "fee definition");
  if (dimensions.includes("rate_rule_missing")) terms.push("rate table", "fee schedule", "published rate", "effective date", "program guide");
  if (dimensions.includes("processor_network_mismatch")) terms.push("network fee", "processor fee", "acquirer fee", "card brand fee");
  if (dimensions.includes("period_mismatch")) terms.push("historical", "effective date", question.statementPeriodYear ?? "");
  if (dimensions.includes("applicability_missing")) terms.push("applicability", "card present", "debit", "credit", "US");
  if (dimensions.includes("authoritative_source_inaccessible")) terms.push("PDF", "download", "official", "archived");
  return terms.filter(Boolean);
}

function officialDomainScore(host: string, question: FeeKnowledgeResearchQuestion): number {
  if (!host) return 0;
  let score = 0;
  const networkDomains = [
    ["visa", ["visa.com"]],
    ["mastercard", ["mastercard.com"]],
    ["discover", ["discover.com", "discovernetwork.com"]],
    ["american express", ["americanexpress.com", "aexp-static.com"]],
  ] as const;
  for (const [network, domains] of networkDomains) {
    const networkRelevant = networkAliases(question).map(normalizeText).includes(network);
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) score += networkRelevant ? 320 : 120;
  }
  const processor = normalizeText(question.processorOrNetwork ?? "");
  if (processor && (
    (processor.includes("fiserv") && (host.endsWith("fiserv.com") || host.endsWith("firstdata.com"))) ||
    (processor.includes("paysafe") && host.endsWith("paysafe.com")) ||
    (processor.includes("basys") && (host.endsWith("basyspro.com") || host.endsWith("basys.com"))) ||
    (processor.includes("merchant one") && host.endsWith("merchantone.com")) ||
    (processor.includes("clover") && host.endsWith("clover.com"))
  )) score += 300;
  return score;
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function meaningfulQueryTokens(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 16);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "fee", "fees", "find", "official", "documentation",
  "payment", "processing", "label", "rule", "rate", "likely", "published", "merchant",
]);

function safeReasonCode(value: string): boolean {
  return /^[a-z0-9_]{3,120}$/i.test(value);
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordField(value: unknown, key: string): unknown {
  return asRecord(value)?.[key];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeDiscoveryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && (!parsed.port || parsed.port === "443");
  } catch {
    return false;
  }
}

function dedupeCandidates(candidates: readonly FeeKnowledgeDiscoveryCandidate[]): FeeKnowledgeDiscoveryCandidate[] {
  const seen = new Set<string>();
  const out: FeeKnowledgeDiscoveryCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    out.push(candidate);
  }
  return out;
}

function bestRequiredText(question: FeeKnowledgeResearchQuestion): string {
  return question.feeLabel.length > 4 ? question.feeLabel : question.semanticQuestion.split(/\s+/).slice(0, 4).join(" ");
}

function safeContextText(value: string | null): string | null {
  if (!value) return null;
  const cleaned = sanitizeText(value, 120);
  if (!cleaned || /(?:merchant|account|\/|\.pdf|\$|\b\d+(?:\.\d+)?\b)/i.test(cleaned)) return null;
  return cleaned;
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").replace(/(?:api.?key|raw prompt|raw response|merchant account|\/Users\/|\/private\/)[^ ]*/gi, "[redacted]").trim().slice(0, maxLength);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function verifiedPublisherDomain(host: string, processorOrNetwork: string, policy: FeeKnowledgeDomainIdentityPolicy = REVIEWED_DOMAIN_IDENTITY_POLICY): boolean {
  const normalizedProcessor = normalizeText(processorOrNetwork);
  return policy.reviewedPublisherDomains.some((entry) => {
    const aliasMatch = entry.aliases.some((alias) => normalizeText(alias) === normalizedProcessor);
    if (!aliasMatch) return false;
    return entry.officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  });
}

function stableId(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}

function canonicalSha256(value: unknown): string {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]));
    }
    return item;
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
