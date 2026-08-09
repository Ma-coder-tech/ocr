import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { BusinessTypeId } from "../businessTypes.js";
import {
  FEE_KNOWLEDGE_RESEARCH_LIMITS,
  defaultFeeKnowledgeResearchQuestions,
  FeeKnowledgeSearchProviderError,
  OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS,
  OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS,
  feeKnowledgeQuestionRef,
  openAiSemanticSupportAdapter,
  openAiWebSearchAdapter,
  verifyCandidate,
  type FeeKnowledgeDiscoveryCandidate,
  type FeeKnowledgeResearchQuestion,
  type FeeKnowledgeResearchLimits,
  type FeeKnowledgeSearchAdapter,
  type FeeKnowledgeSemanticSupportAdapter,
  type OpenAiResponsesSafeUsage,
} from "../canonical/feeKnowledgeResearch.js";
import { runtimeSupportAccepted } from "../canonical/feeKnowledgeClaimSupportDecision.js";
import { retrieveFeeKnowledgeDocument, type RetrievedDocument } from "../canonical/feeKnowledgeRetrieval.js";
import { buildFeeKnowledgeSourcePacket } from "../canonical/feeKnowledgeRegistry.js";
import {
  FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
  type ApprovedFeeKnowledgeSourceRegistry,
  type FeeKnowledgeClaimSupportRecord,
  type FeeKnowledgeResearchAttemptRecord,
  type FeeKnowledgeResearchCandidateRecord,
  type FeeKnowledgeSourcePacket,
} from "../canonical/feeKnowledgeTypes.js";
import { buildCanonicalRuntimeAnalysis } from "../canonical/runtimeAdapter.js";
import {
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReview,
  validateWholeStatementFeeIntelligenceReviewForPacket,
  type CanonicalWholeStatementFeeIntelligencePacket,
  type CanonicalWholeStatementFeeIntelligenceValidationResult,
} from "../canonical/wholeStatementFeeIntelligenceReview.js";
import {
  buildWholeStatementFeeIntelligenceWorkPlan,
  classifyWholeStatementFeeIntelligenceWorkUnitFailure,
  mergeWholeStatementFeeIntelligenceWorkUnitResults,
  notSelectedWholeStatementFeeIntelligenceWorkUnitResult,
  providerUnavailableWholeStatementFeeIntelligenceWorkUnitResult,
  wholeStatementFeeIntelligenceWorkUnitResultFromValidation,
  type WholeStatementFeeIntelligenceMergedWorkPlan,
  type WholeStatementFeeIntelligenceWorkUnit,
} from "../canonical/wholeStatementFeeIntelligenceWorkPlan.js";
import {
  admitWholeStatementFeeIntelligence,
  type CanonicalWholeStatementAdmissionResult,
} from "../canonical/wholeStatementFeeIntelligenceAdmission.js";
import {
  wholeStatementFeeIntelligenceProviderAdapter,
  type WholeStatementFeeIntelligenceProviderUsage,
  type WholeStatementFeeIntelligenceRuntimeAdapter,
} from "../canonical/wholeStatementFeeIntelligenceRuntime.js";
import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import { parsePdfBytes } from "../parser.js";
import { analyzeStatementDocument } from "../statementParserOrchestrator.js";
import type { CostReservationInput } from "./costLedger.js";
import type { PackagesBEProjectionInput } from "./invariance.js";
import type { RepositoryProviderTransportInput, RepositoryProviderTransportResult } from "./repositoryAdapter.js";
import { safeProviderReasonCode, safeProviderReasonCodes } from "../canonical/providerFailureDiagnostics.js";
import type { EvaluationManifestDocument } from "./types.js";
import {
  liveEvaluationEffectiveTimeoutMs,
  liveEvaluationTimeoutError,
  runWithLiveEvaluationTimeout,
  type LiveEvaluationTimeoutScope,
} from "./liveEvaluationTimeoutPolicy.js";
import {
  accountingFromProviderUsage,
  assertApprovedLiveCallMetadata,
  calculateWorstCaseCostUsd,
  type SafeProviderUsage,
} from "./providerAccounting.js";
import { EvaluationIntegrityError } from "./errors.js";

export const ONE_TIME_STATEMENT_EVALUATION_PACKET_VERSION = "one_time_statement_evaluation_packet_v1" as const;
export const ONE_TIME_EXTERNAL_REQUEST_RESULT_VERSION = "one_time_external_request_result_v1" as const;

export type OneTimeResearchLimits = FeeKnowledgeResearchLimits;

export type OneTimeStatementEvaluationPacket = {
  type: typeof ONE_TIME_STATEMENT_EVALUATION_PACKET_VERSION;
  wholeStatementReview: CanonicalWholeStatementFeeIntelligencePacket;
  research: {
    questions: FeeKnowledgeResearchQuestion[];
    limits: OneTimeResearchLimits;
  };
};

export type OneTimeExternalRequestResult<T> = {
  type: typeof ONE_TIME_EXTERNAL_REQUEST_RESULT_VERSION;
  value: T;
  accounting: RepositoryProviderTransportResult["accounting"];
};

type ServiceResponse<T> = T | OneTimeExternalRequestResult<T>;
type OneTimeServiceContext = { abortSignal: AbortSignal; approvedCallMetadata: CostReservationInput };
export type OneTimeProviderReadiness =
  | { status: "ready_to_send"; reasonCodes: string[] }
  | { status: "unavailable_before_send"; reasonCodes: string[]; diagnosticClass: "missing_credential" | "provider_route_unavailable" | "configuration_invalid" };

export type OneTimeStatementEvaluationServices = {
  wholeStatementReviewReadiness: (context: { approvedCallMetadata: CostReservationInput }) => OneTimeProviderReadiness;
  wholeStatementReview: (packet: Parameters<WholeStatementFeeIntelligenceRuntimeAdapter>[0], context: OneTimeServiceContext) => Promise<ServiceResponse<unknown>>;
  webSearchDiscoveryReadiness: (context: { approvedCallMetadata: CostReservationInput }) => OneTimeProviderReadiness;
  webSearchDiscovery: (request: Parameters<FeeKnowledgeSearchAdapter>[0], context: OneTimeServiceContext) => Promise<ServiceResponse<FeeKnowledgeDiscoveryCandidate[]>>;
  documentRetrieval: (url: string, options: Parameters<typeof retrieveFeeKnowledgeDocument>[1] & { approvedCallMetadata: CostReservationInput }) => Promise<ServiceResponse<RetrievedDocument>>;
  semanticVerificationReadiness: (context: { approvedCallMetadata: CostReservationInput }) => OneTimeProviderReadiness;
  semanticVerification: (request: Parameters<FeeKnowledgeSemanticSupportAdapter>[0], context: OneTimeServiceContext) => Promise<ServiceResponse<Awaited<ReturnType<FeeKnowledgeSemanticSupportAdapter>>>>;
};

export type PreparedOneTimeStatementEvaluation = {
  sanitizedPacket: OneTimeStatementEvaluationPacket | { type: "external_stages_ineligible"; reasonCodes: string[] };
  canonicalState: PackagesBEProjectionInput;
  privateContext: OneTimePrivateContext | null;
};

export type FinalizedOneTimeStatementEvaluation = {
  preparedPacket: OneTimeStatementEvaluationPacket;
  wholeStatementPacketSent: CanonicalWholeStatementFeeIntelligencePacket | null;
  wholeStatementWorkPlan: WholeStatementFeeIntelligenceMergedWorkPlan | null;
  sourcePacket: FeeKnowledgeSourcePacket;
  registry: ApprovedFeeKnowledgeSourceRegistry | null;
  admission: CanonicalWholeStatementAdmissionResult;
};

type CandidateContext = {
  candidateId: string;
  attemptId: string;
  candidate: FeeKnowledgeDiscoveryCandidate;
  question: FeeKnowledgeResearchQuestion;
  questionOrdinal: number;
};

type RetrievedContext = CandidateContext & { retrieved: RetrievedDocument };
type OneTimeResearchTerminalStatus = "failed" | "timed_out" | "safety_blocked";

type OneTimePrivateContext = {
  analysis: CanonicalStatementAnalysis;
  packet: OneTimeStatementEvaluationPacket;
  initialPacketHash: string;
  sentWholeStatementPacket: CanonicalWholeStatementFeeIntelligencePacket | null;
  wholeStatementWorkPlan: WholeStatementFeeIntelligenceMergedWorkPlan | null;
  sentSourcePacket: FeeKnowledgeSourcePacket | null;
  registry: ApprovedFeeKnowledgeSourceRegistry | null;
  discovered: CandidateContext[];
  retrieved: RetrievedContext[];
  attempts: FeeKnowledgeResearchAttemptRecord[];
  candidates: FeeKnowledgeResearchCandidateRecord[];
  claimSupports: FeeKnowledgeClaimSupportRecord[];
  validation: CanonicalWholeStatementFeeIntelligenceValidationResult | null;
  searchCursor: number;
  retrievalCursor: number;
  semanticCursor: number;
  lastStageRank: number;
  wholeStatementReviewCount: number;
  researchDeadlineStartedAt: number | null;
  researchDeadlineAt: number | null;
  researchTerminalStatus: OneTimeResearchTerminalStatus | null;
};

export const ONE_TIME_RESEARCH_REQUEST_SLOTS = {
  webSearch: FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls,
  retrieval: FEE_KNOWLEDGE_RESEARCH_LIMITS.maxRetrievalCandidates,
  semanticVerification: FEE_KNOWLEDGE_RESEARCH_LIMITS.maxRetrievalCandidates,
} as const;

export async function prepareOneTimeStatementEvaluationSource(input: {
  manifestRow: EvaluationManifestDocument;
  verifiedSourceBytes: Uint8Array;
  businessType: BusinessTypeId;
  registry?: ApprovedFeeKnowledgeSourceRegistry | null;
  researchQuestionsForTesting?: (analysis: CanonicalStatementAnalysis) => FeeKnowledgeResearchQuestion[];
  researchLimitsForTesting?: OneTimeResearchLimits;
}): Promise<PreparedOneTimeStatementEvaluation> {
  if (input.manifestRow.paidStageEligibility !== "eligible") {
    return {
      sanitizedPacket: {
        type: "external_stages_ineligible",
        reasonCodes: [input.manifestRow.paidStageExclusionReason ?? "paid_stage_ineligible"],
      },
      canonicalState: unavailablePackagesBE(),
      privateContext: null,
    };
  }

  const document = await parsePdfBytes(input.verifiedSourceBytes);
  if (document.extraction.mode === "unusable") throw new Error("verified_statement_text_unavailable");
  const summary = analyzeStatementDocument(document, input.businessType);
  const selectedDriver = summary.parserSource?.driverId ?? null;
  if (!selectedDriver) throw new Error("verified_statement_parser_unsupported");
  if (input.manifestRow.selectedDriver && selectedDriver !== input.manifestRow.selectedDriver) {
    throw new Error("verified_statement_parser_driver_mismatch");
  }
  const canonical = buildCanonicalRuntimeAnalysis({
    document,
    businessType: input.businessType,
    runtimeDocumentRef: input.manifestRow.sourceDocumentId,
    legacySummary: summary,
  });
  const registry = input.registry ?? null;
  const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis: canonical.analysis, registry });
  const wholeStatementReview = buildWholeStatementFeeIntelligencePacket(canonical.analysis, registry ?? { approvedExternalSourceRefs: [] }, sourcePacket);
  const questions = input.researchQuestionsForTesting
    ? input.researchQuestionsForTesting(structuredClone(canonical.analysis))
    : defaultFeeKnowledgeResearchQuestions(canonical.analysis, registry);
  const limits = structuredClone(input.researchLimitsForTesting ?? FEE_KNOWLEDGE_RESEARCH_LIMITS);
  const packet: OneTimeStatementEvaluationPacket = {
    type: ONE_TIME_STATEMENT_EVALUATION_PACKET_VERSION,
    wholeStatementReview,
    research: {
      questions,
      limits,
    },
  };
  return {
    sanitizedPacket: structuredClone(packet),
    canonicalState: packagesBEFromAnalysis(canonical.analysis),
    privateContext: {
      analysis: canonical.analysis,
      packet,
      initialPacketHash: canonicalHash(packet),
      sentWholeStatementPacket: null,
      wholeStatementWorkPlan: null,
      sentSourcePacket: null,
      registry,
      discovered: [],
      retrieved: [],
      attempts: questions.slice(limits.maxSearchCalls).map((question, offset) => attemptRecord(
        question,
        limits.maxSearchCalls + offset,
        "not_selected_planning",
        [],
        ["fee_knowledge_research_not_selected_planning"],
      )),
      candidates: [],
      claimSupports: [],
      validation: null,
      searchCursor: 0,
      retrievalCursor: 0,
      semanticCursor: 0,
      lastStageRank: -1,
      wholeStatementReviewCount: 0,
      researchDeadlineStartedAt: null,
      researchDeadlineAt: null,
      researchTerminalStatus: null,
    },
  };
}

export function oneTimeResearchTerminalStatus(
  prepared: PreparedOneTimeStatementEvaluation,
): OneTimeResearchTerminalStatus | null {
  const context = prepared.privateContext;
  if (!context) return null;
  return context.researchTerminalStatus;
}

export function finalizeOneTimeStatementEvaluation(
  prepared: PreparedOneTimeStatementEvaluation,
  executionStatus: "completed" | "failed" | "timed_out" | "safety_blocked",
): FinalizedOneTimeStatementEvaluation {
  const context = prepared.privateContext;
  if (!context) throw new Error("approved_one_time_statement_context_unavailable");
  const existingQuestionRefs = new Set(context.attempts.map((attempt) => attempt.questionRef));
  for (const [questionOrdinal, question] of context.packet.research.questions.entries()) {
    const questionRef = feeKnowledgeQuestionRef(question, questionOrdinal);
    if (existingQuestionRefs.has(questionRef)) continue;
    const status = questionOrdinal >= context.packet.research.limits.maxSearchCalls
      ? "not_selected_planning"
      : executionStatus === "timed_out" ? "timed_out"
        : executionStatus === "safety_blocked" ? "safety_blocked" : "failed";
    context.attempts.push(attemptRecord(
      question,
      questionOrdinal,
      status,
      [],
      [status === "not_selected_planning" ? "fee_knowledge_research_not_selected_planning"
        : status === "timed_out" ? "fee_knowledge_research_timed_out"
          : status === "safety_blocked" ? "fee_knowledge_research_safety_blocked"
            : "fee_knowledge_research_failed"],
    ));
  }
  for (const candidate of [...context.candidates]) {
    if (candidate.retrievalStatus === "not_started") {
      const discovered = context.discovered.find((item) => item.candidateId === candidate.candidateId);
      if (discovered) updateFailedCandidate(context, discovered, "retrieval", executionStatus === "timed_out" ? "timed_out" : executionStatus === "safety_blocked" ? "safety_blocked" : "failed");
    } else if (candidate.retrievalStatus === "retrieved_text" && candidate.semanticVerificationStatus === "not_started") {
      const retrieved = context.retrieved.find((item) => item.candidateId === candidate.candidateId);
      if (retrieved) updateFailedCandidate(context, retrieved, "semantic", executionStatus === "timed_out" ? "timed_out" : executionStatus === "safety_blocked" ? "safety_blocked" : "failed");
    }
  }
  const sourcePacket = context.sentSourcePacket ? structuredClone(context.sentSourcePacket) : currentSourcePacket(context);
  const validation = context.validation ?? validateWholeStatementFeeIntelligenceReview(
    fallbackWholeStatementReview(executionStatus),
    context.analysis,
    context.registry ?? { approvedExternalSourceRefs: [] },
    sourcePacket,
  );
  const admission = admitWholeStatementFeeIntelligence({
    analysis: context.analysis,
    validation,
    sourcePacket,
    registry: context.registry,
    executionStatus: executionStatus === "safety_blocked" ? "completed" : executionStatus,
  });
  context.analysis = admission.analysis;
  return {
    preparedPacket: structuredClone(context.packet),
    wholeStatementPacketSent: structuredClone(context.sentWholeStatementPacket),
    wholeStatementWorkPlan: structuredClone(context.wholeStatementWorkPlan),
    sourcePacket: structuredClone(sourcePacket),
    registry: structuredClone(context.registry),
    admission: structuredClone(admission),
  };
}

export function createOneTimeStatementEvaluationTransport(input: {
  preparedBySource: ReadonlyMap<string, PreparedOneTimeStatementEvaluation>;
  services?: Partial<OneTimeStatementEvaluationServices>;
}): (request: RepositoryProviderTransportInput) => Promise<RepositoryProviderTransportResult> {
  const services = defaultServices(input.services);
  return async (request) => {
    const prepared = input.preparedBySource.get(request.sourceDocumentId);
    const context = prepared?.privateContext;
    if (!prepared || !context) throw new Error("approved_one_time_statement_context_unavailable");
    if (canonicalHash(request.sanitizedPacket) !== context.initialPacketHash) throw new Error("approved_sanitized_packet_mismatch");
    assertOneTimeStageTransition(context, request.stage);
    const started = Date.now();

    if (request.stage === "whole_statement_ai_review") {
      const sourcePacket = currentSourcePacket(context);
      const reviewPacket = buildWholeStatementFeeIntelligencePacket(context.analysis, context.registry ?? { approvedExternalSourceRefs: [] }, sourcePacket);
      const workPlan = buildWholeStatementFeeIntelligenceWorkPlan({
        packet: reviewPacket,
        mode: "comprehensive",
        limits: {
          maxAggregateInputBytes: null,
          maxAggregateOutputTokens: null,
        },
      });
      context.sentSourcePacket = structuredClone(sourcePacket);
      context.sentWholeStatementPacket = structuredClone(reviewPacket);
      context.packet = {
        ...context.packet,
        wholeStatementReview: structuredClone(context.sentWholeStatementPacket),
      };
      const selectedUnits = workPlan.units.filter((unit) => unit.status === "selected");
      const workUnitResults = workPlan.units
        .filter((unit) => unit.status !== "selected")
        .map(notSelectedWholeStatementFeeIntelligenceWorkUnitResult);
      const childProviderCallOutcomes: NonNullable<RepositoryProviderTransportResult["childProviderCallOutcomes"]> = [];
      if (selectedUnits.length > 0 && !request.childBudgetController) throw new Error("package_5b_child_budget_controller_missing");
      const readiness = selectedUnits.length > 0
        ? services.wholeStatementReviewReadiness({ approvedCallMetadata: structuredClone(request.approvedCallMetadata) })
        : { status: "ready_to_send", reasonCodes: ["whole_statement_fee_intelligence_provider_ready_to_send"] } satisfies OneTimeProviderReadiness;
      if (readiness.status === "unavailable_before_send") {
        workUnitResults.push(...selectedUnits.map((unit) =>
          providerUnavailableWholeStatementFeeIntelligenceWorkUnitResult({
            workUnitRef: unit.workUnitRef,
            reasonCodes: readiness.reasonCodes,
          })
        ));
        const merged = mergeWholeStatementFeeIntelligenceWorkUnitResults({
          analysis: context.analysis,
          registry: context.registry ?? { approvedExternalSourceRefs: [] },
          sourcePacket,
          fullPacket: reviewPacket,
          plan: workPlan,
          results: workUnitResults,
        });
        context.wholeStatementWorkPlan = structuredClone(merged);
        context.validation = merged.validation;
        return result({
          value: {
            reviewStatus: merged.validation.output.reviewStatus,
            validationAccepted: false,
            workPlan: summarizeWholeStatementWorkPlan(merged),
            providerReadiness: { status: readiness.status, diagnosticClass: readiness.diagnosticClass },
          },
          generated: false,
          schemaValid: true,
          evidenceValidated: false,
          policyAccepted: false,
          reasonCodes: merged.reasonCodes,
          accounting: noRequestAccounting(started),
          childProviderCallOutcomes,
        });
      }
      for (const unit of selectedUnits) {
        if (request.approvedCallMetadata.maximumInputTokens !== null && unit.estimatedInputBytes > request.approvedCallMetadata.maximumInputTokens) {
          const reasonCodes = [
            "whole_statement_fee_intelligence_work_unit_not_selected_budget",
            "whole_statement_fee_intelligence_work_unit_input_bound_exceeded_before_send",
          ];
          workUnitResults.push(package5BWorkUnitNotSelectedByResourceBudget(unit.workUnitRef, reasonCodes));
          childProviderCallOutcomes.push(package5BWorkUnitOutcome({
            reservation: package5BWorkUnitReservation(request.approvedCallMetadata, unit),
            sourceDocumentId: request.sourceDocumentId,
            status: "cancelled_before_send",
            requestId: null,
            reasonCodes,
          }));
          continue;
        }
        const unitReservation = package5BWorkUnitReservation(request.approvedCallMetadata, unit);
        try {
          request.childBudgetController!.reserve(unitReservation);
        } catch (error) {
          if (!isInsufficientBudgetReservation(error)) throw error;
          workUnitResults.push(package5BWorkUnitNotSelectedByResourceBudget(unit.workUnitRef));
          childProviderCallOutcomes.push(package5BWorkUnitOutcome({
            reservation: unitReservation,
            sourceDocumentId: request.sourceDocumentId,
            status: "cancelled_before_send",
            requestId: null,
            reasonCodes: ["whole_statement_fee_intelligence_work_unit_not_selected_budget"],
          }));
          continue;
        }
        const unitStarted = Date.now();
        try {
          request.childBudgetController!.assertReadyToSend(unitReservation.callId);
          const response = await runWithinStandaloneStageTimeout(
            "whole_statement_ai_review",
            async (abortSignal) => unwrapExternalRequestResult(
              await services.wholeStatementReview(structuredClone(unit.packet), {
                abortSignal,
                approvedCallMetadata: structuredClone(unitReservation),
              }),
              unitStarted,
              "whole_statement_ai_review",
            ),
          );
          const costExceeded = request.childBudgetController!.finalize(unitReservation.callId, {
            ...response.accounting,
            status: "success",
            billingDisposition: response.accounting.billingDisposition ?? "unknown",
          });
          childProviderCallOutcomes.push(package5BWorkUnitOutcome({
            reservation: unitReservation,
            sourceDocumentId: request.sourceDocumentId,
            status: costExceeded ? "failure" : "success",
            requestId: response.accounting.requestId ?? null,
            reasonCodes: costExceeded
              ? ["cost_exceeded_reservation"]
              : ["whole_statement_fee_intelligence_work_unit_provider_call_completed", "whole_statement_fee_intelligence_work_unit_response_received"],
          }));
          if (costExceeded) {
            workUnitResults.push({
              workUnitRef: unit.workUnitRef,
              status: "failed",
              outcomeClass: "provider_transport_failed",
              validation: null,
              requestId: response.accounting.requestId ?? null,
              inputTokens: response.accounting.inputTokens ?? null,
              cachedInputTokens: response.accounting.cachedInputTokens ?? null,
              outputTokens: response.accounting.outputTokens ?? null,
              durationMs: response.accounting.durationMs,
              billingDisposition: "unknown",
              reasonCodes: ["cost_exceeded_reservation"],
            });
            continue;
          }
          const validation = validateWholeStatementFeeIntelligenceReviewForPacket(
            response.value,
            unit.packet,
            context.analysis,
            context.registry ?? { approvedExternalSourceRefs: [] },
            unit.packet.sourceProvenancePacket,
          );
          workUnitResults.push(wholeStatementFeeIntelligenceWorkUnitResultFromValidation({
            unit,
            validation,
            requestId: response.accounting.requestId ?? null,
            inputTokens: response.accounting.inputTokens ?? null,
            cachedInputTokens: response.accounting.cachedInputTokens ?? null,
            outputTokens: response.accounting.outputTokens ?? null,
            durationMs: response.accounting.durationMs,
            billingDisposition: response.accounting.billingDisposition ?? "unknown",
          }));
        } catch (error) {
          const classified = classifyWholeStatementFeeIntelligenceWorkUnitFailure(error);
          const sendStateReason = workUnitFailureSendStateReason(classified);
          const costExceeded = request.childBudgetController!.finalize(unitReservation.callId, {
            requestId: classified.requestId,
            durationMs: classified.durationMs ?? Math.max(0, Date.now() - unitStarted),
            inputTokens: classified.inputTokens,
            cachedInputTokens: classified.cachedInputTokens,
            outputTokens: classified.outputTokens,
            toolEvents: [],
            observedOrEstimatedFinalCostUsd: null,
            status: classified.status === "timed_out" ? "timeout" : "failure",
            billingDisposition: "unknown",
          });
          childProviderCallOutcomes.push(package5BWorkUnitOutcome({
            reservation: unitReservation,
            sourceDocumentId: request.sourceDocumentId,
            status: costExceeded ? "failure" : classified.status === "timed_out" ? "timeout" : "failure",
            requestId: classified.requestId,
            reasonCodes: costExceeded ? ["cost_exceeded_reservation"] : [...classified.reasonCodes, sendStateReason],
          }));
          workUnitResults.push({
            workUnitRef: unit.workUnitRef,
            status: classified.status,
            outcomeClass: classified.outcomeClass,
            validation: null,
            requestId: classified.requestId,
            inputTokens: classified.inputTokens,
            cachedInputTokens: classified.cachedInputTokens,
            outputTokens: classified.outputTokens,
            durationMs: classified.durationMs ?? Math.max(0, Date.now() - unitStarted),
            billingDisposition: "unknown",
            reasonCodes: [...classified.reasonCodes, sendStateReason],
          });
        }
      }
      const merged = mergeWholeStatementFeeIntelligenceWorkUnitResults({
        analysis: context.analysis,
        registry: context.registry ?? { approvedExternalSourceRefs: [] },
        sourcePacket,
        fullPacket: reviewPacket,
        plan: workPlan,
        results: workUnitResults,
      });
      const validation = merged.validation;
      context.wholeStatementWorkPlan = structuredClone(merged);
      context.validation = validation;
      const accepted = validation.ok && (validation.output.reviewStatus === "completed" || validation.output.reviewStatus === "partial");
      return result({
        value: {
          reviewStatus: validation.output.reviewStatus,
          validationAccepted: validation.ok,
          workPlan: summarizeWholeStatementWorkPlan(merged),
        },
        generated: true,
        schemaValid: validation.ok,
        evidenceValidated: accepted,
        policyAccepted: accepted,
        reasonCodes: merged.reasonCodes,
        accounting: noRequestAccounting(started),
        childProviderCallOutcomes,
      });
    }

    if (request.stage === "web_search_discovery") {
      const questions = context.packet.research.questions.slice(0, context.packet.research.limits.maxSearchCalls);
      const questionOrdinal = context.searchCursor++;
      const question = questions[questionOrdinal];
      if (!question) {
        return result({
          value: { candidateCount: 0 },
          schemaValid: true,
          reasonCodes: ["fee_knowledge_discovery_not_needed"],
          accounting: noRequestAccounting(started),
        });
      }
      const attemptId = `research_${shortHash([feeKnowledgeQuestionRef(question, questionOrdinal), String(questionOrdinal)])}`;
      const readiness = services.webSearchDiscoveryReadiness({
        approvedCallMetadata: structuredClone(request.approvedCallMetadata),
      });
      if (readiness.status === "unavailable_before_send") {
        upsertContextAttempt(context, attemptRecord(
          question,
          questionOrdinal,
          "provider_unavailable",
          [],
          readiness.reasonCodes,
        ));
        return result({
          value: { attemptId, questionRef: feeKnowledgeQuestionRef(question, questionOrdinal), candidateCount: 0, providerReadiness: readiness.status },
          generated: false,
          schemaValid: true,
          policyAccepted: false,
          reasonCodes: readiness.reasonCodes,
          accounting: noRequestAccounting(started),
        });
      }
      let response: ReturnType<typeof unwrapExternalRequestResult<FeeKnowledgeDiscoveryCandidate[]>>;
      try {
        response = await runWithinPreparedResearchDeadline(context, "web_search_discovery", async (abortSignal) => unwrapExternalRequestResult(
          await services.webSearchDiscovery(
            { attemptId, questions: [question], limits: context.packet.research.limits },
            { abortSignal, approvedCallMetadata: structuredClone(request.approvedCallMetadata) },
          ),
          started,
          "web_search",
        ));
      } catch (error) {
        const status = researchProviderFailureStatus(error);
        const reasonCode = timeoutReasonCode(error) ?? researchProviderFailureReason(status);
        const terminalStatus = status === "safety_blocked" ? "safety_blocked" : status === "timed_out" ? "timed_out" : "failed";
        upsertContextAttempt(context, attemptRecord(question, questionOrdinal, status, [], [researchProviderFailureReason(status)]));
        if (terminalStatus === "safety_blocked") {
          markResearchTerminal(context, terminalStatus);
          return providerFailureResult({
            started,
            error,
            reasonCode,
            scope: "research_graph",
            researchTerminal: { status: terminalStatus, reasonCode },
          });
        }
        return providerFailureResult({ started, error, reasonCode, scope: "candidate_local" });
      }
      const remaining = context.packet.research.limits.maxRetrievalCandidates - context.discovered.length;
      const discovered = dedupeCandidates(response.value
        .slice(0, Math.min(remaining, context.packet.research.limits.maxResultCandidatesPerSearch))
        .map((candidate, candidateOrdinal) => ({
          attemptId,
          candidate,
          question,
          questionOrdinal,
          candidateId: `candidate_${shortHash([attemptId, candidate.url, String(candidateOrdinal)])}`,
        })));
      context.discovered.push(...discovered);
      context.attempts.push(attemptRecord(question, questionOrdinal, "completed", discovered.map((item) => item.candidateId), ["fee_knowledge_research_completed"]));
      context.candidates.push(...discovered.map(discoveredCandidateRecord));
      return result({
        value: { attemptId, questionRef: feeKnowledgeQuestionRef(question, questionOrdinal), candidateCount: discovered.length },
        generated: true,
        schemaValid: true,
        reasonCodes: ["fee_knowledge_discovery_completed"],
        accounting: response.accounting,
        researchRetrievalRefs: discovered.map((item) => item.candidateId),
      });
    }

    if (request.stage === "document_retrieval") {
      const candidate = context.discovered[context.retrievalCursor++];
      if (!candidate) {
        return result({
          value: { retrievedCount: 0 },
          reasonCodes: ["fee_knowledge_retrieval_not_needed"],
          accounting: noRequestAccounting(started),
        });
      }
      let response: ReturnType<typeof unwrapExternalRequestResult<RetrievedDocument>>;
      try {
        response = await runWithinPreparedResearchDeadline(context, "document_retrieval", async (abortSignal) => unwrapExternalRequestResult(
          await services.documentRetrieval(candidate.candidate.url, {
            abortSignal,
            approvedCallMetadata: structuredClone(request.approvedCallMetadata),
          }),
          started,
          "document_retrieval",
        ));
      } catch (error) {
        const status = providerFailureStatus(error);
        const reasonCode = timeoutReasonCode(error) ?? (status === "timed_out" ? "fee_knowledge_retrieval_timed_out" : "fee_knowledge_retrieval_fetch_failed");
        updateFailedCandidate(
          context,
          candidate,
          "retrieval",
          status,
          status === "timed_out" ? "fee_knowledge_retrieval_timed_out" : reasonCode,
        );
        if (timeoutScope(error) === "research_graph") {
          markResearchTerminal(context, "timed_out");
          return providerFailureResult({
            started,
            error,
            reasonCode,
            scope: "research_graph",
            researchTerminal: { status: "timed_out", reasonCode },
          });
        }
        return providerFailureResult({ started, error, reasonCode, scope: "candidate_local" });
      }
      updateRetrievedCandidate(context, candidate, response.value);
      const retrievalTerminal = retrievalTerminalStatus(response.value.status);
      if (retrievalTerminal) {
        return result({
          value: { retrievedCount: context.retrieved.length, retrievalStatus: response.value.status },
          reasonCodes: response.value.reasonCodes,
          accounting: response.accounting,
          researchRetrievalRefs: [candidate.candidateId],
          researchStageStatus: retrievalTerminal,
        });
      }
      context.retrieved.push({ ...candidate, retrieved: response.value });
      return result({
        value: { retrievedCount: context.retrieved.length },
        reasonCodes: ["fee_knowledge_retrieval_completed"],
        accounting: response.accounting,
        researchRetrievalRefs: context.retrieved.map((item) => item.candidateId),
      });
    }

    if (request.stage === "semantic_verification") {
      const item = context.retrieved[context.semanticCursor++];
      if (!item) {
        return result({
          value: { verifiedCount: 0, supportedCount: 0 },
          schemaValid: true,
          policyAccepted: false,
          reasonCodes: ["fee_knowledge_semantic_verification_not_needed"],
          accounting: noRequestAccounting(started),
        });
      }
      const readiness = services.semanticVerificationReadiness({
        approvedCallMetadata: structuredClone(request.approvedCallMetadata),
      });
      if (readiness.status === "unavailable_before_send") {
        updateSemanticProviderUnavailable(context, item, readiness.reasonCodes[0] ?? "fee_knowledge_semantic_provider_unavailable_before_send");
        return result({
          value: { verifiedCount: 0, supportedCount: 0, semanticStatus: "provider_unavailable", providerReadiness: readiness.status },
          generated: false,
          schemaValid: true,
          policyAccepted: false,
          reasonCodes: readiness.reasonCodes,
          accounting: noRequestAccounting(started),
          semanticVerificationRef: `semantic:${request.reservedCallId}`,
        });
      }
      let semanticAccounting: RepositoryProviderTransportResult["accounting"] | null = null;
      let verified: Awaited<ReturnType<typeof verifyCandidate>>;
      try {
        verified = await runWithinPreparedResearchDeadline(context, "semantic_verification", async (abortSignal) => verifyCandidate({
            candidateId: item.candidateId,
            attemptId: item.attemptId,
            candidate: item.candidate,
            retrieved: item.retrieved,
            question: item.question,
            questionOrdinal: item.questionOrdinal,
            semanticSupportAdapter: async (...args) => {
              const response = unwrapExternalRequestResult(
                await services.semanticVerification(args[0], {
                  abortSignal: args[1].abortSignal,
                  approvedCallMetadata: structuredClone(request.approvedCallMetadata),
                }),
                started,
                "semantic_verification",
              );
              semanticAccounting = response.accounting;
              return response.value;
            },
            priorClaimSupports: context.claimSupports,
            abortSignal,
          }));
      } catch (error) {
        const status = providerFailureStatus(error);
        const reasonCode = timeoutReasonCode(error) ?? (status === "timed_out" ? "fee_knowledge_semantic_timed_out" : "fee_knowledge_semantic_failed");
        updateFailedCandidate(
          context,
          item,
          "semantic",
          status,
          status === "timed_out" ? "fee_knowledge_semantic_timed_out" : reasonCode,
        );
        if (timeoutScope(error) === "research_graph") {
          markResearchTerminal(context, "timed_out");
          return providerFailureResult({
            started,
            error,
            reasonCode,
            scope: "research_graph",
            researchTerminal: { status: "timed_out", reasonCode },
          });
        }
        return providerFailureResult({ started, error, reasonCode, scope: "candidate_local" });
      }
      const supportedCount = verified.claimSupport ? 1 : 0;
      const candidateIndex = context.candidates.findIndex((candidate) => candidate.candidateId === item.candidateId);
      context.candidates[candidateIndex] = verified.candidate;
      if (verified.claimSupport) context.claimSupports.push(verified.claimSupport);
      const policyAccepted = Boolean(verified.claimSupport && runtimeSupportAccepted(verified.claimSupport));
      const semanticTerminal = semanticTerminalStatus(verified.candidate.semanticVerificationStatus);
      if (semanticTerminal) {
        if (semanticTerminal === "safety_blocked") {
          updateAttemptTerminal(context, item.attemptId, semanticTerminal);
          markResearchTerminal(context, semanticTerminal);
        }
        return result({
          value: { verifiedCount: 1, supportedCount, semanticStatus: verified.candidate.semanticVerificationStatus },
          generated: semanticAccounting !== null,
          schemaValid: verified.candidate.semanticVerificationStatus !== "parse_failed",
          policyAccepted: false,
          reasonCodes: verified.candidate.reasonCodes,
          accounting: semanticAccounting ?? noRequestAccounting(started),
          semanticVerificationRef: `semantic:${request.reservedCallId}`,
          researchStageStatus: semanticTerminal,
          researchTerminal: semanticTerminal === "safety_blocked"
            ? { status: semanticTerminal, reasonCode: verified.candidate.reasonCodes[0] ?? researchTerminalReason(semanticTerminal) }
            : undefined,
        });
      }
      return result({
        value: { verifiedCount: 1, supportedCount },
        generated: semanticAccounting !== null,
        schemaValid: true,
        evidenceValidated: policyAccepted,
        policyAccepted,
        reasonCodes: verified.candidate.semanticVerificationStatus === "parse_failed"
          ? ["fee_knowledge_semantic_json_invalid"]
          : ["fee_knowledge_semantic_verification_completed"],
        accounting: semanticAccounting ?? noRequestAccounting(started),
        semanticVerificationRef: `semantic:${request.reservedCallId}`,
      });
    }

    throw new Error("approved_one_time_stage_not_supported_by_transport");
  };
}

function defaultServices(overrides: Partial<OneTimeStatementEvaluationServices> = {}): OneTimeStatementEvaluationServices {
  const readinessOverride = overrides.wholeStatementReviewReadiness
    ?? (overrides.wholeStatementReview
      ? (() => ({ status: "ready_to_send", reasonCodes: ["whole_statement_fee_intelligence_provider_ready_to_send"] }) satisfies OneTimeProviderReadiness)
      : ((context: { approvedCallMetadata: CostReservationInput }) => livePackage5BProviderReadiness(context.approvedCallMetadata)));
  const webSearchDiscoveryReadiness = overrides.webSearchDiscoveryReadiness
    ?? (overrides.webSearchDiscovery
      ? (() => ({ status: "ready_to_send", reasonCodes: ["fee_knowledge_web_search_provider_ready_to_send"] }) satisfies OneTimeProviderReadiness)
      : ((context: { approvedCallMetadata: CostReservationInput }) => liveOpenAiProviderReadiness("web_search_discovery", context.approvedCallMetadata)));
  const semanticVerificationReadiness = overrides.semanticVerificationReadiness
    ?? (overrides.semanticVerification
      ? (() => ({ status: "ready_to_send", reasonCodes: ["fee_knowledge_semantic_provider_ready_to_send"] }) satisfies OneTimeProviderReadiness)
      : ((context: { approvedCallMetadata: CostReservationInput }) => liveOpenAiProviderReadiness("semantic_verification", context.approvedCallMetadata)));
  return {
    wholeStatementReviewReadiness: readinessOverride,
    wholeStatementReview: overrides.wholeStatementReview ?? (async (packet, context) => {
      const providerSettings = livePackage5BProviderSettings(context.approvedCallMetadata);
      const started = Date.now();
      let usage: WholeStatementFeeIntelligenceProviderUsage | null = null;
      const value = await wholeStatementFeeIntelligenceProviderAdapter({
        ...providerSettings,
        onProviderUsage: (observed) => { usage = observed; },
      })(packet, context);
      return externalResult(value, accountingFromProviderUsage({
        usage: wholeStatementSafeUsage(usage),
        approvedCallMetadata: context.approvedCallMetadata,
        durationMs: Math.max(0, Date.now() - started),
      }));
    }),
    webSearchDiscoveryReadiness,
    webSearchDiscovery: overrides.webSearchDiscovery ?? (async (request, context) => {
      assertApprovedLiveCallMetadata("web_search_discovery", context.approvedCallMetadata);
      const started = Date.now();
      let usage: OpenAiResponsesSafeUsage | null = null;
      const value = await openAiWebSearchAdapter({
        modelName: context.approvedCallMetadata.model ?? undefined,
        maximumInputTokens: context.approvedCallMetadata.maximumInputTokens ?? undefined,
        maximumOutputTokens: OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS,
        onUsage: (observed) => { usage = observed; },
      })(request, context);
      return externalResult(value, accountingFromProviderUsage({
        usage: openAiResponsesSafeUsageForAccounting(usage),
        approvedCallMetadata: context.approvedCallMetadata,
        durationMs: Math.max(0, Date.now() - started),
      }));
    }),
    documentRetrieval: overrides.documentRetrieval ?? (async (url, options) => {
      assertApprovedLiveCallMetadata("document_retrieval", options.approvedCallMetadata);
      const started = Date.now();
      const value = await retrieveFeeKnowledgeDocument(url, {
        abortSignal: options.abortSignal,
      });
      return externalResult(value, noRequestAccounting(started));
    }),
    semanticVerificationReadiness,
    semanticVerification: overrides.semanticVerification ?? (async (request, context) => {
      assertApprovedLiveCallMetadata("semantic_verification", context.approvedCallMetadata);
      const started = Date.now();
      let usage: OpenAiResponsesSafeUsage | null = null;
      const value = await openAiSemanticSupportAdapter({
        modelName: context.approvedCallMetadata.model ?? undefined,
        maximumInputTokens: context.approvedCallMetadata.maximumInputTokens ?? undefined,
        maximumOutputTokens: OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS,
        maximumToolUses: context.approvedCallMetadata.maximumToolUses ?? undefined,
        onUsage: (observed) => { usage = observed; },
      })(request, context);
      return externalResult(value, accountingFromProviderUsage({
        usage: openAiResponsesSafeUsageForAccounting(usage),
        approvedCallMetadata: context.approvedCallMetadata,
        durationMs: Math.max(0, Date.now() - started),
      }));
    }),
  };
}

export function livePackage5BProviderSettings(metadata: CostReservationInput): {
  provider: "openai";
  openAiModelName: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxRetries: 0;
} {
  assertApprovedLiveCallMetadata("whole_statement_ai_review", metadata);
  return {
    provider: "openai",
    openAiModelName: metadata.model!,
    maxInputTokens: metadata.maximumInputTokens!,
    maxOutputTokens: metadata.maximumOutputTokens!,
    maxRetries: 0,
  };
}

export function livePackage5BProviderReadiness(metadata: CostReservationInput): OneTimeProviderReadiness {
  return liveOpenAiProviderReadiness("whole_statement_ai_review", metadata);
}

function liveOpenAiProviderReadiness(
  stage: "whole_statement_ai_review" | "web_search_discovery" | "semantic_verification",
  metadata: CostReservationInput,
): OneTimeProviderReadiness {
  try {
    assertApprovedLiveCallMetadata(stage, metadata);
  } catch {
    return {
      status: "unavailable_before_send",
      diagnosticClass: "configuration_invalid",
      reasonCodes: [providerReadinessReason(stage, "configuration_invalid")],
    };
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      status: "unavailable_before_send",
      diagnosticClass: "missing_credential",
      reasonCodes: [providerReadinessReason(stage, "missing_credential")],
    };
  }
  return {
    status: "ready_to_send",
    reasonCodes: [providerReadinessReason(stage, "ready")],
  };
}

function providerReadinessReason(
  stage: "whole_statement_ai_review" | "web_search_discovery" | "semantic_verification",
  state: "ready" | "missing_credential" | "configuration_invalid",
): string {
  if (stage === "whole_statement_ai_review") {
    if (state === "ready") return "whole_statement_fee_intelligence_provider_ready_to_send";
    if (state === "missing_credential") return "whole_statement_fee_intelligence_provider_credential_unavailable_before_send";
    return "whole_statement_fee_intelligence_provider_configuration_invalid_before_send";
  }
  if (stage === "web_search_discovery") {
    if (state === "ready") return "fee_knowledge_web_search_provider_ready_to_send";
    if (state === "missing_credential") return "fee_knowledge_web_search_provider_unavailable_before_send";
    return "fee_knowledge_web_search_provider_configuration_invalid_before_send";
  }
  if (state === "ready") return "fee_knowledge_semantic_provider_ready_to_send";
  if (state === "missing_credential") return "fee_knowledge_semantic_provider_unavailable_before_send";
  return "fee_knowledge_semantic_provider_configuration_invalid_before_send";
}

function unwrapExternalRequestResult<T>(
  response: ServiceResponse<T>,
  started: number,
  toolType: string,
): { value: T; accounting: RepositoryProviderTransportResult["accounting"] } {
  if (isExternalRequestResult(response)) {
    return {
      value: response.value,
      accounting: {
        ...response.accounting,
        durationMs: response.accounting.durationMs,
        toolEvents: response.accounting.toolEvents ?? [],
      },
    };
  }
  return {
    value: response,
    accounting: {
      requestId: null,
      durationMs: Math.max(0, Date.now() - started),
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      toolEvents: [{ type: toolType, count: 1 }],
      observedOrEstimatedFinalCostUsd: null,
      billingDisposition: "unknown",
    },
  };
}

function isExternalRequestResult<T>(response: ServiceResponse<T>): response is OneTimeExternalRequestResult<T> {
  return Boolean(response)
    && typeof response === "object"
    && (response as { type?: unknown }).type === ONE_TIME_EXTERNAL_REQUEST_RESULT_VERSION
    && Object.hasOwn(response as object, "accounting")
    && Object.hasOwn(response as object, "value");
}

function noRequestAccounting(started: number): RepositoryProviderTransportResult["accounting"] {
  return {
    requestId: null,
    durationMs: Math.max(0, Date.now() - started),
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    toolEvents: [],
    observedOrEstimatedFinalCostUsd: 0,
    billingDisposition: "provider_confirmed_zero",
  };
}

function combineWholeStatementAccounting(
  parts: readonly RepositoryProviderTransportResult["accounting"][],
): RepositoryProviderTransportResult["accounting"] {
  const sum = (selector: (item: RepositoryProviderTransportResult["accounting"]) => number | null): number | null => {
    const values = parts.map(selector);
    return values.every((value): value is number => typeof value === "number") ? values.reduce((total, value) => total + value, 0) : null;
  };
  const observedCosts = parts.map((part) => part.observedOrEstimatedFinalCostUsd);
  const requestIds = parts.map((part) => part.requestId).filter((id): id is string => Boolean(id));
  return {
    requestId: requestIds.length === 1 ? requestIds[0]! : null,
    durationMs: parts.reduce((total, part) => total + (part.durationMs ?? 0), 0),
    inputTokens: sum((part) => part.inputTokens ?? null),
    cachedInputTokens: sum((part) => part.cachedInputTokens ?? null),
    outputTokens: sum((part) => part.outputTokens ?? null),
    toolEvents: parts.flatMap((part) => part.toolEvents ?? []),
    observedOrEstimatedFinalCostUsd: observedCosts.every((value): value is number => typeof value === "number")
      ? observedCosts.reduce((total, value) => total + value, 0)
      : null,
    billingDisposition: parts.every((part) => part.billingDisposition === "observed") ? "observed"
      : parts.every((part) => part.billingDisposition === "provider_confirmed_zero") ? "provider_confirmed_zero" : "unknown",
  };
}

function summarizeWholeStatementWorkPlan(merged: WholeStatementFeeIntelligenceMergedWorkPlan) {
  return {
    policyVersion: merged.plan.policyVersion,
    mode: merged.plan.mode,
    plannedWorkUnitCount: merged.plan.units.length,
    selectedWorkUnitCount: merged.selectedWorkUnitCount,
    completedWorkUnitCount: merged.completedWorkUnitCount,
    unavailableWorkUnitCount: merged.unavailableWorkUnitCount,
    notSelectedWorkUnitCount: merged.notSelectedWorkUnitCount,
    plannedRowCount: merged.plan.plannedFeeRowRefs.length,
    selectedRowCount: merged.plan.selectedFeeRowRefs.length,
    reviewedRowCount: merged.output.coverageProof.reviewedFeeRowRefs.length,
    missingRowCount: merged.output.coverageProof.missingFeeRowRefs.length,
    reasonCodes: merged.reasonCodes,
  };
}

function workUnitFailureSendStateReason(input: {
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
}): string {
  return input.requestId || input.inputTokens !== null || input.cachedInputTokens !== null || input.outputTokens !== null
    ? "whole_statement_fee_intelligence_work_unit_request_definitely_sent"
    : "whole_statement_fee_intelligence_work_unit_send_status_uncertain";
}

function package5BWorkUnitReservation(
  parent: CostReservationInput,
  unit: WholeStatementFeeIntelligenceWorkUnit,
): CostReservationInput {
  if (!parent.pricing) throw new Error("package_5b_pricing_policy_required_for_work_unit_reservations");
  const maximumInputTokens = Math.min(parent.maximumInputTokens ?? unit.estimatedInputBytes, unit.estimatedInputBytes);
  const maximumOutputTokens = parent.maximumOutputTokens ?? unit.estimatedOutputTokens;
  const maximumToolUses = parent.maximumToolUses ?? 0;
  const reservation: CostReservationInput = {
    ...structuredClone(parent),
    callId: `${parent.callId}__${unit.workUnitRef}`,
    parentCallId: parent.callId,
    operationKind: "package_5b_work_unit",
    operationRef: unit.workUnitRef,
    reservationScope: "provider_send",
    attempt: 1,
    retryOfCallId: null,
    maximumInputTokens,
    maximumOutputTokens,
    maximumToolUses,
    estimatedMaximumCostUsd: calculateWorstCaseCostUsd({
      maximumInputTokens,
      maximumOutputTokens,
      maximumToolUses,
      pricing: parent.pricing,
    }),
  };
  return reservation;
}

function package5BWorkUnitOutcome(input: {
  reservation: CostReservationInput;
  sourceDocumentId: string;
  status: "success" | "failure" | "timeout" | "cancelled_before_send";
  requestId: string | null;
  reasonCodes: string[];
}): NonNullable<RepositoryProviderTransportResult["childProviderCallOutcomes"]>[number] {
  return {
    callId: input.reservation.callId,
    parentCallId: input.reservation.parentCallId ?? null,
    operationKind: input.reservation.operationKind ?? "manifest_call",
    operationRef: input.reservation.operationRef ?? null,
    sourceDocumentId: input.sourceDocumentId,
    stage: "whole_statement_ai_review",
    status: input.status,
    requestId: input.requestId,
    reasonCodes: [...new Set(input.reasonCodes)].sort(),
  };
}

function package5BWorkUnitNotSelectedByResourceBudget(
  workUnitRef: string,
  reasonCodes = ["whole_statement_fee_intelligence_work_unit_not_selected_budget"],
): ReturnType<typeof notSelectedWholeStatementFeeIntelligenceWorkUnitResult> {
  return {
    workUnitRef,
    status: "not_selected_budget",
    outcomeClass: "budget_not_selected",
    validation: null,
    requestId: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    billingDisposition: "provider_confirmed_zero",
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}

function isInsufficientBudgetReservation(error: unknown): boolean {
  return error instanceof EvaluationIntegrityError && error.code === "insufficient_budget_reservation";
}

function externalResult<T>(
  value: T,
  accounting: RepositoryProviderTransportResult["accounting"],
): OneTimeExternalRequestResult<T> {
  return { type: ONE_TIME_EXTERNAL_REQUEST_RESULT_VERSION, value, accounting };
}

function wholeStatementSafeUsage(usage: WholeStatementFeeIntelligenceProviderUsage | null): SafeProviderUsage | null {
  return usage && {
    ...usage,
    toolEvents: [],
  };
}

export function openAiResponsesSafeUsageForAccounting(usage: OpenAiResponsesSafeUsage | null): SafeProviderUsage | null {
  if (!usage) return null;
  const counts = new Map<string, number>();
  for (const actionType of usage.webSearchActionTypes) {
    const type = `web_search.${actionType}`;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return {
    requestId: usage.requestId,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    toolEvents: [...counts].map(([type, count]) => ({ type, count })),
  };
}

function result(input: {
  value: unknown;
  generated?: boolean;
  schemaValid?: boolean;
  evidenceValidated?: boolean;
  policyAccepted?: boolean;
  reasonCodes: string[];
  accounting: RepositoryProviderTransportResult["accounting"];
  researchRetrievalRefs?: string[];
  semanticVerificationRef?: string | null;
  researchTerminal?: RepositoryProviderTransportResult["researchTerminal"];
  providerFailure?: RepositoryProviderTransportResult["providerFailure"];
  researchStageStatus?: RepositoryProviderTransportResult["researchStageStatus"];
  childProviderCallOutcomes?: RepositoryProviderTransportResult["childProviderCallOutcomes"];
}): RepositoryProviderTransportResult {
  return {
    value: input.value,
    accounting: input.accounting,
    lifecycle: {
      generated: input.generated,
      schemaValid: input.schemaValid,
      evidenceValidated: input.evidenceValidated,
      policyAccepted: input.policyAccepted,
      canonicalAdmitted: false,
      customerPublished: false,
      researchRetrievalRefs: input.researchRetrievalRefs ?? [],
      semanticVerificationRef: input.semanticVerificationRef ?? null,
      reasonCodes: input.reasonCodes,
    },
    researchTerminal: input.researchTerminal,
    providerFailure: input.providerFailure,
    researchStageStatus: input.researchStageStatus,
    childProviderCallOutcomes: input.childProviderCallOutcomes,
  };
}

function providerFailureResult(input: {
  started: number;
  error: unknown;
  reasonCode: string;
  scope: NonNullable<RepositoryProviderTransportResult["providerFailure"]>["scope"];
  researchTerminal?: RepositoryProviderTransportResult["researchTerminal"];
}): RepositoryProviderTransportResult {
  const status = providerFailureStatus(input.error) === "timed_out" ? "timeout" : "failure";
  const reasonCode = safeProviderReasonCode(input.error, input.reasonCode);
  const reasonCodes = safeProviderReasonCodes(input.error, input.reasonCode);
  return result({
    value: { status, scope: input.scope },
    generated: false,
    schemaValid: false,
    evidenceValidated: false,
    policyAccepted: false,
    reasonCodes,
    accounting: accountingFromFailure(input.error, input.started),
    researchTerminal: input.researchTerminal,
    providerFailure: { status, scope: input.scope, reasonCode, reasonCodes },
  });
}

function accountingFromFailure(
  error: unknown,
  started: number,
): RepositoryProviderTransportResult["accounting"] {
  const safe = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const accounting = safe.accounting && typeof safe.accounting === "object"
    ? safe.accounting as Record<string, unknown>
    : {};
  return {
    requestId: typeof accounting.requestId === "string" ? accounting.requestId : null,
    durationMs: typeof accounting.durationMs === "number" ? accounting.durationMs : Math.max(0, Date.now() - started),
    inputTokens: typeof accounting.inputTokens === "number" ? accounting.inputTokens : null,
    cachedInputTokens: typeof accounting.cachedInputTokens === "number" ? accounting.cachedInputTokens : null,
    outputTokens: typeof accounting.outputTokens === "number" ? accounting.outputTokens : null,
    toolEvents: Array.isArray(accounting.toolEvents) ? accounting.toolEvents as RepositoryProviderTransportResult["accounting"]["toolEvents"] : [],
    observedOrEstimatedFinalCostUsd: typeof accounting.observedOrEstimatedFinalCostUsd === "number" ? accounting.observedOrEstimatedFinalCostUsd : null,
    billingDisposition: "unknown",
  };
}

function packagesBEFromAnalysis(analysis: CanonicalStatementAnalysis): PackagesBEProjectionInput {
  return {
    financialFacts: structuredClone(analysis.financialFacts),
    feeLedger: structuredClone(analysis.feeLedger),
    feeOwnershipActionability: structuredClone(analysis.feeOwnershipActionability),
    opportunityEngine: structuredClone(analysis.opportunityEngine),
    calculations: structuredClone(analysis.calculations),
  };
}

function unavailablePackagesBE(): PackagesBEProjectionInput {
  return {
    financialFacts: { status: "unavailable" },
    feeLedger: { status: "unavailable", rows: [] },
    feeOwnershipActionability: { status: "unavailable", rowClassifications: [] },
    opportunityEngine: { status: "unavailable", components: [] },
    calculations: [],
  } as unknown as PackagesBEProjectionInput;
}

function dedupeCandidates(items: CandidateContext[]): CandidateContext[] {
  return [...new Map(items.map((item) => [item.candidate.url, item])).values()];
}

function attemptRecord(
  question: FeeKnowledgeResearchQuestion,
  questionOrdinal: number,
  status: FeeKnowledgeResearchAttemptRecord["status"],
  candidateIds: readonly string[],
  reasonCodes: readonly string[],
): FeeKnowledgeResearchAttemptRecord {
  return {
    type: "fee_knowledge_research_attempt",
    policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
    attemptId: `research_${shortHash([feeKnowledgeQuestionRef(question, questionOrdinal), String(questionOrdinal)])}`,
    questionRef: feeKnowledgeQuestionRef(question, questionOrdinal),
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

function discoveredCandidateRecord(item: CandidateContext): FeeKnowledgeResearchCandidateRecord {
  return {
    type: "fee_knowledge_research_candidate",
    policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
    candidateId: item.candidateId,
    questionRef: feeKnowledgeQuestionRef(item.question, item.questionOrdinal),
    feeRowRef: item.question.feeRowRef,
    attemptId: item.attemptId,
    retrievalStatus: "not_started",
    semanticVerificationStatus: "not_started",
    canonicalUrl: null,
    title: safeCandidateText(item.candidate.title, 160),
    publisher: safeCandidateText(item.candidate.publisher, 120),
    verificationStatus: "provisional",
    reasonCodes: ["fee_knowledge_semantic_support_not_run"],
    safeApplicability: {
      processorOrNetworkMatched: false,
      periodApplicable: Boolean(item.question.statementPeriodYear),
      jurisdictionApplicable: null,
      contextApplicable: null,
    },
    sourceFingerprint: null,
    safeRetrievalDiagnostics: null,
    locatorHash: null,
    claimSupportDecisionRef: null,
    displayPermission: "internal_only",
  };
}

function updateRetrievedCandidate(context: OneTimePrivateContext, item: CandidateContext, retrieved: RetrievedDocument): void {
  const index = context.candidates.findIndex((candidate) => candidate.candidateId === item.candidateId);
  const current = context.candidates[index];
  if (!current) throw new Error("fee_knowledge_candidate_context_missing");
  context.candidates[index] = {
    ...current,
    canonicalUrl: retrieved.canonicalUrl,
    retrievalStatus: retrieved.status,
    verificationStatus: retrieved.status === "retrieved_text" ? "provisional"
      : retrieved.status === "safety_blocked" ? "safety_blocked"
        : retrieved.status === "retrieval_succeeded_text_unavailable" ? "source_unavailable" : "rejected",
    reasonCodes: [...new Set([...retrieved.reasonCodes, "fee_knowledge_semantic_support_not_run"])].sort(),
    sourceFingerprint: retrieved.documentFingerprint,
    safeRetrievalDiagnostics: retrieved.safeDiagnostics ? structuredClone(retrieved.safeDiagnostics) : null,
  };
}

function updateFailedCandidate(
  context: OneTimePrivateContext,
  item: CandidateContext,
  stage: "retrieval" | "semantic",
  status: OneTimeResearchTerminalStatus,
  reasonCode?: string,
): void {
  const index = context.candidates.findIndex((candidate) => candidate.candidateId === item.candidateId);
  const current = context.candidates[index];
  if (!current) return;
  context.candidates[index] = stage === "retrieval"
    ? {
        ...current,
        retrievalStatus: status,
        semanticVerificationStatus: "not_started",
        verificationStatus: "rejected",
        reasonCodes: [reasonCode ?? (status === "timed_out" ? "fee_knowledge_retrieval_timed_out"
          : status === "safety_blocked" ? "fee_knowledge_url_policy_blocked"
            : "fee_knowledge_retrieval_fetch_failed"), "fee_knowledge_semantic_support_not_run"].sort(),
      }
    : {
        ...current,
        semanticVerificationStatus: status,
        verificationStatus: status === "safety_blocked" ? "safety_blocked" : "verified_candidate_limited",
        reasonCodes: [...new Set([
          ...current.reasonCodes.filter((reason) => reason !== "fee_knowledge_semantic_support_not_run"),
          reasonCode ?? (status === "timed_out" ? "fee_knowledge_semantic_timed_out"
            : status === "safety_blocked" ? "fee_knowledge_semantic_safety_blocked"
              : "fee_knowledge_semantic_failed"),
        ])].sort(),
      };
}

function updateSemanticProviderUnavailable(
  context: OneTimePrivateContext,
  item: RetrievedContext,
  reasonCode: string,
): void {
  const index = context.candidates.findIndex((candidate) => candidate.candidateId === item.candidateId);
  const current = context.candidates[index];
  if (!current) return;
  context.candidates[index] = {
    ...current,
    semanticVerificationStatus: "provider_unavailable",
    verificationStatus: "verified_candidate_limited",
    reasonCodes: [...new Set([
      ...current.reasonCodes.filter((reason) => reason !== "fee_knowledge_semantic_support_not_run"),
      reasonCode,
    ])].sort(),
  };
}

function currentSourcePacket(context: OneTimePrivateContext): FeeKnowledgeSourcePacket {
  return buildFeeKnowledgeSourcePacket({
    analysis: context.analysis,
    registry: context.registry,
    runtimeClaimSupports: context.claimSupports,
    researchAttempts: context.attempts,
    researchCandidates: context.candidates,
  });
}

function completeResearchAfterTerminal(context: OneTimePrivateContext): void {
  const status = context.researchTerminalStatus;
  if (!status) return;
  const existingQuestionRefs = new Set(context.attempts.map((attempt) => attempt.questionRef));
  for (const [questionOrdinal, question] of context.packet.research.questions.entries()) {
    const questionRef = feeKnowledgeQuestionRef(question, questionOrdinal);
    if (existingQuestionRefs.has(questionRef)) continue;
    const skippedStatus = questionOrdinal >= context.packet.research.limits.maxSearchCalls ? "not_selected_planning" : status;
    context.attempts.push(attemptRecord(
      question,
      questionOrdinal,
      skippedStatus,
      [],
      [skippedStatus === "not_selected_planning" ? "fee_knowledge_research_not_selected_planning" : researchTerminalReason(status)],
    ));
  }
  for (const candidate of context.discovered.slice(context.retrievalCursor)) {
    updateFailedCandidate(context, candidate, "retrieval", status);
  }
  for (const candidate of context.retrieved.slice(context.semanticCursor)) {
    updateFailedCandidate(context, candidate, "semantic", status);
  }
  context.retrievalCursor = context.discovered.length;
  context.semanticCursor = context.retrieved.length;
}

function assertOneTimeStageTransition(
  context: OneTimePrivateContext,
  stage: RepositoryProviderTransportInput["stage"],
): void {
  if (context.researchTerminalStatus !== null && stage !== "whole_statement_ai_review") {
    throw new Error("one_time_research_already_terminal");
  }
  const ranks = {
    web_search_discovery: 0,
    document_retrieval: 1,
    semantic_verification: 2,
    whole_statement_ai_review: 3,
  } as const;
  if (!(stage in ranks)) throw new Error("one_time_evaluation_stage_not_supported");
  const rank = ranks[stage as keyof typeof ranks];
  if (rank < context.lastStageRank) throw new Error("one_time_evaluation_stage_order_invalid");
  if (stage === "whole_statement_ai_review") {
    if (context.wholeStatementReviewCount !== 0) throw new Error("one_time_whole_statement_review_duplicate");
    completeResearchAfterTerminal(context);
    const expectedQuestionRefs = new Set(context.packet.research.questions.map(feeKnowledgeQuestionRef));
    const attemptedQuestionRefs = new Set(context.attempts.map((attempt) => attempt.questionRef));
    if (expectedQuestionRefs.size !== attemptedQuestionRefs.size
      || [...expectedQuestionRefs].some((questionRef) => !attemptedQuestionRefs.has(questionRef))
      || context.retrievalCursor < context.discovered.length
      || context.semanticCursor < context.retrieved.length) {
      throw new Error("one_time_whole_statement_review_before_research_complete");
    }
    context.wholeStatementReviewCount += 1;
  }
  context.lastStageRank = rank;
}

function upsertContextAttempt(
  context: OneTimePrivateContext,
  attempt: FeeKnowledgeResearchAttemptRecord,
): void {
  const index = context.attempts.findIndex((item) => item.questionRef === attempt.questionRef);
  if (index < 0) context.attempts.push(attempt);
  else context.attempts[index] = attempt;
}

function researchProviderFailureStatus(error: unknown): FeeKnowledgeResearchAttemptRecord["status"] {
  if (error instanceof FeeKnowledgeSearchProviderError
    && ["unsupported_model", "safety_blocked", "failed", "timed_out"].includes(error.status)) {
    return error.status;
  }
  return providerFailureStatus(error);
}

function researchProviderFailureReason(status: FeeKnowledgeResearchAttemptRecord["status"]): string {
  if (status === "unsupported_model") return "fee_knowledge_web_search_model_unsupported";
  if (status === "provider_unavailable") return "fee_knowledge_web_search_provider_unavailable_before_send";
  if (status === "not_selected_planning") return "fee_knowledge_research_not_selected_planning";
  if (status === "budget_exhausted") return "fee_knowledge_research_budget_exhausted";
  if (status === "safety_blocked") return "fee_knowledge_research_safety_blocked";
  if (status === "timed_out") return "fee_knowledge_research_timed_out";
  return "fee_knowledge_research_failed";
}

async function runWithinPreparedResearchDeadline<T>(
  context: OneTimePrivateContext,
  stage: "web_search_discovery" | "document_retrieval" | "semantic_verification",
  operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (context.researchTerminalStatus !== null) throw liveEvaluationTimeoutError(stage, "research_graph");
  const now = performance.now();
  if (context.researchDeadlineStartedAt === null) {
    context.researchDeadlineStartedAt = now;
    context.researchDeadlineAt = now + context.packet.research.limits.totalDeadlineMs;
  }
  return runWithLiveEvaluationTimeout({
    stage,
    scope: "per_call",
    timeoutMs: liveEvaluationEffectiveTimeoutMs({ stage }),
    operation,
  });
}

async function runWithinStandaloneStageTimeout<T>(
  stage: "whole_statement_ai_review",
  operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runWithLiveEvaluationTimeout({
    stage,
    scope: "per_call",
    timeoutMs: liveEvaluationEffectiveTimeoutMs({ stage }),
    operation,
  });
}

function retrievalTerminalStatus(status: RetrievedDocument["status"]): OneTimeResearchTerminalStatus | null {
  if (status === "retrieved_text") return null;
  if (status === "timed_out") return "timed_out";
  if (status === "safety_blocked") return "safety_blocked";
  return "failed";
}

function semanticTerminalStatus(
  status: FeeKnowledgeResearchCandidateRecord["semanticVerificationStatus"],
): OneTimeResearchTerminalStatus | null {
  if (status === "completed") return null;
  if (status === "provider_unavailable") return null;
  if (status === "timed_out") return "timed_out";
  if (status === "safety_blocked") return "safety_blocked";
  return "failed";
}

function markResearchTerminal(context: OneTimePrivateContext, status: OneTimeResearchTerminalStatus): void {
  if (context.researchTerminalStatus === null) context.researchTerminalStatus = status;
}

function updateAttemptTerminal(
  context: OneTimePrivateContext,
  attemptId: string,
  status: OneTimeResearchTerminalStatus,
): void {
  const index = context.attempts.findIndex((attempt) => attempt.attemptId === attemptId);
  const attempt = context.attempts[index];
  if (!attempt) return;
  context.attempts[index] = {
    ...attempt,
    status,
    reasonCodes: [researchTerminalReason(status)],
  };
}

function timeoutScope(error: unknown): LiveEvaluationTimeoutScope | null {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return value.evaluationTimeoutScope === "per_call" || value.evaluationTimeoutScope === "research_graph"
    ? value.evaluationTimeoutScope
    : null;
}

function timeoutReasonCode(error: unknown): string | null {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return typeof value.reasonCode === "string" ? value.reasonCode : null;
}

function researchTerminalReason(status: OneTimeResearchTerminalStatus): string {
  if (status === "timed_out") return "fee_knowledge_research_timed_out";
  if (status === "safety_blocked") return "fee_knowledge_research_safety_blocked";
  return "fee_knowledge_research_failed";
}

function providerFailureStatus(error: unknown): "failed" | "timed_out" {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return value.name === "AbortError" || value.code === "provider_timeout" ? "timed_out" : "failed";
}

function safeCandidateText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const safe = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!safe || /(?:https?:\/\/|\/Users\/|\/private\/|api.?key|openai|anthropic|gpt|claude|merchant)/i.test(safe)) return null;
  return safe.slice(0, maxLength);
}

function fallbackWholeStatementReview(executionStatus: "completed" | "failed" | "timed_out" | "safety_blocked"): unknown {
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1",
    reviewStatus: executionStatus === "timed_out" ? "timed_out"
      : executionStatus === "safety_blocked" ? "safety_blocked" : "failed",
    evidenceRefs: [],
    factRefs: [],
    limitationCodes: ["provider_unavailable"],
    rowInterpretations: [],
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function shortHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 20);
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
