import { createHash } from "node:crypto";
import type { BusinessTypeId } from "../businessTypes.js";
import {
  FEE_KNOWLEDGE_RESEARCH_LIMITS,
  defaultFeeKnowledgeResearchQuestions,
  openAiSemanticSupportAdapter,
  openAiWebSearchAdapter,
  verifyCandidate,
  type FeeKnowledgeDiscoveryCandidate,
  type FeeKnowledgeResearchQuestion,
  type FeeKnowledgeSearchAdapter,
  type FeeKnowledgeSemanticSupportAdapter,
} from "../canonical/feeKnowledgeResearch.js";
import { retrieveFeeKnowledgeDocument, type RetrievedDocument } from "../canonical/feeKnowledgeRetrieval.js";
import { buildFeeKnowledgeSourcePacket } from "../canonical/feeKnowledgeRegistry.js";
import { buildCanonicalRuntimeAnalysis } from "../canonical/runtimeAdapter.js";
import {
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReview,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "../canonical/wholeStatementFeeIntelligenceReview.js";
import {
  wholeStatementFeeIntelligenceProviderAdapter,
  type WholeStatementFeeIntelligenceRuntimeAdapter,
} from "../canonical/wholeStatementFeeIntelligenceRuntime.js";
import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import { parsePdfBytes } from "../parser.js";
import { analyzeStatementDocument } from "../statementParserOrchestrator.js";
import type { CostReservationInput } from "./costLedger.js";
import type { PackagesBEProjectionInput } from "./invariance.js";
import type { RepositoryProviderTransportInput, RepositoryProviderTransportResult } from "./repositoryAdapter.js";
import type { EvaluationManifestDocument } from "./types.js";

export const ONE_TIME_STATEMENT_EVALUATION_PACKET_VERSION = "one_time_statement_evaluation_packet_v1" as const;
export const ONE_TIME_EXTERNAL_REQUEST_RESULT_VERSION = "one_time_external_request_result_v1" as const;

export type OneTimeStatementEvaluationPacket = {
  type: typeof ONE_TIME_STATEMENT_EVALUATION_PACKET_VERSION;
  wholeStatementReview: CanonicalWholeStatementFeeIntelligencePacket;
  research: {
    questions: FeeKnowledgeResearchQuestion[];
    limits: typeof FEE_KNOWLEDGE_RESEARCH_LIMITS;
  };
};

export type OneTimeExternalRequestResult<T> = {
  type: typeof ONE_TIME_EXTERNAL_REQUEST_RESULT_VERSION;
  value: T;
  accounting: RepositoryProviderTransportResult["accounting"];
};

type ServiceResponse<T> = T | OneTimeExternalRequestResult<T>;
type OneTimeServiceContext = { abortSignal: AbortSignal; approvedCallMetadata: CostReservationInput };

export type OneTimeStatementEvaluationServices = {
  wholeStatementReview: (packet: Parameters<WholeStatementFeeIntelligenceRuntimeAdapter>[0], context: OneTimeServiceContext) => Promise<ServiceResponse<unknown>>;
  webSearchDiscovery: (request: Parameters<FeeKnowledgeSearchAdapter>[0], context: OneTimeServiceContext) => Promise<ServiceResponse<FeeKnowledgeDiscoveryCandidate[]>>;
  documentRetrieval: (url: string, options: Parameters<typeof retrieveFeeKnowledgeDocument>[1] & { approvedCallMetadata: CostReservationInput }) => Promise<ServiceResponse<RetrievedDocument>>;
  semanticVerification: (request: Parameters<FeeKnowledgeSemanticSupportAdapter>[0], context: OneTimeServiceContext) => Promise<ServiceResponse<Awaited<ReturnType<FeeKnowledgeSemanticSupportAdapter>>>>;
};

export type PreparedOneTimeStatementEvaluation = {
  sanitizedPacket: OneTimeStatementEvaluationPacket | { type: "external_stages_ineligible"; reasonCodes: string[] };
  canonicalState: PackagesBEProjectionInput;
  privateContext: OneTimePrivateContext | null;
};

type CandidateContext = {
  candidateId: string;
  attemptId: string;
  candidate: FeeKnowledgeDiscoveryCandidate;
  question: FeeKnowledgeResearchQuestion;
};

type RetrievedContext = CandidateContext & { retrieved: RetrievedDocument };

type OneTimePrivateContext = {
  analysis: CanonicalStatementAnalysis;
  packet: OneTimeStatementEvaluationPacket;
  discovered: CandidateContext[];
  retrieved: RetrievedContext[];
};

export async function prepareOneTimeStatementEvaluationSource(input: {
  manifestRow: EvaluationManifestDocument;
  verifiedSourceBytes: Uint8Array;
  businessType: BusinessTypeId;
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
  const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis: canonical.analysis, registry: null });
  const wholeStatementReview = buildWholeStatementFeeIntelligencePacket(canonical.analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
  const questions = defaultFeeKnowledgeResearchQuestions(canonical.analysis, null);
  const packet: OneTimeStatementEvaluationPacket = {
    type: ONE_TIME_STATEMENT_EVALUATION_PACKET_VERSION,
    wholeStatementReview,
    research: {
      questions,
      limits: FEE_KNOWLEDGE_RESEARCH_LIMITS,
    },
  };
  return {
    sanitizedPacket: structuredClone(packet),
    canonicalState: packagesBEFromAnalysis(canonical.analysis),
    privateContext: {
      analysis: canonical.analysis,
      packet,
      discovered: [],
      retrieved: [],
    },
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
    if (canonicalHash(request.sanitizedPacket) !== canonicalHash(context.packet)) throw new Error("approved_sanitized_packet_mismatch");
    const started = Date.now();
    const abortSignal = new AbortController().signal;
    const serviceContext = { abortSignal, approvedCallMetadata: structuredClone(request.approvedCallMetadata) };

    if (request.stage === "whole_statement_ai_review") {
      const response = unwrapExternalRequestResult(
        await services.wholeStatementReview(context.packet.wholeStatementReview, serviceContext),
        started,
        "whole_statement_ai_review",
      );
      const validation = validateWholeStatementFeeIntelligenceReview(
        response.value,
        context.analysis,
        { approvedExternalSourceRefs: [] },
        context.packet.wholeStatementReview.sourceProvenancePacket,
      );
      const accepted = validation.ok && validation.output.reviewStatus === "completed";
      return result({
        value: { reviewStatus: validation.output.reviewStatus, validationAccepted: validation.ok },
        generated: true,
        schemaValid: validation.ok,
        evidenceValidated: accepted,
        policyAccepted: accepted,
        reasonCodes: validation.output.reasonCodes,
        accounting: response.accounting,
      });
    }

    if (request.stage === "web_search_discovery") {
      context.discovered = [];
      const questions = context.packet.research.questions.slice(0, FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls);
      if (questions.length === 0) {
        return result({
          value: { candidateCount: 0 },
          schemaValid: true,
          reasonCodes: ["fee_knowledge_discovery_not_needed"],
          accounting: noRequestAccounting(started),
        });
      }
      const attemptId = `evaluation_search_${shortHash([request.reservedCallId, ...questions.map((question) => question.feeRowRef)])}`;
      const response = unwrapExternalRequestResult(
        await services.webSearchDiscovery(
          { attemptId, questions, limits: FEE_KNOWLEDGE_RESEARCH_LIMITS },
          serviceContext,
        ),
        started,
        "web_search",
      );
      const question = questions[0]!;
      context.discovered = dedupeCandidates(response.value
        .slice(0, FEE_KNOWLEDGE_RESEARCH_LIMITS.maxResultCandidatesPerSearch)
        .map((candidate) => ({
          attemptId,
          candidate,
          question,
          candidateId: `evaluation_candidate_${shortHash([attemptId, candidate.url])}`,
        })))
        .slice(0, 1);
      return result({
        value: { candidateCount: context.discovered.length },
        generated: true,
        schemaValid: true,
        reasonCodes: ["fee_knowledge_discovery_completed"],
        accounting: response.accounting,
        researchRetrievalRefs: context.discovered.map((item) => item.candidateId),
      });
    }

    if (request.stage === "document_retrieval") {
      context.retrieved = [];
      const candidate = context.discovered[0];
      if (!candidate) {
        return result({
          value: { retrievedCount: 0 },
          reasonCodes: ["fee_knowledge_retrieval_not_needed"],
          accounting: noRequestAccounting(started),
        });
      }
      const response = unwrapExternalRequestResult(
        await services.documentRetrieval(candidate.candidate.url, serviceContext),
        started,
        "document_retrieval",
      );
      context.retrieved.push({ ...candidate, retrieved: response.value });
      return result({
        value: { retrievedCount: context.retrieved.length },
        reasonCodes: ["fee_knowledge_retrieval_completed"],
        accounting: response.accounting,
        researchRetrievalRefs: context.retrieved.map((item) => item.candidateId),
      });
    }

    if (request.stage === "semantic_verification") {
      const item = context.retrieved[0];
      if (!item) {
        return result({
          value: { verifiedCount: 0, supportedCount: 0 },
          schemaValid: true,
          policyAccepted: false,
          reasonCodes: ["fee_knowledge_semantic_verification_not_needed"],
          accounting: noRequestAccounting(started),
        });
      }
      let semanticAccounting: RepositoryProviderTransportResult["accounting"] | null = null;
      const verified = await verifyCandidate({
        candidateId: item.candidateId,
        attemptId: item.attemptId,
        candidate: item.candidate,
        retrieved: item.retrieved,
        question: item.question,
        semanticSupportAdapter: async (...args) => {
          const response = unwrapExternalRequestResult(
            await services.semanticVerification(args[0], { ...serviceContext, abortSignal: args[1].abortSignal }),
            started,
            "semantic_verification",
          );
          semanticAccounting = response.accounting;
          return response.value;
        },
        priorClaimSupports: [],
        abortSignal,
      });
      const supportedCount = verified.claimSupport ? 1 : 0;
      return result({
        value: { verifiedCount: 1, supportedCount },
        generated: semanticAccounting !== null,
        schemaValid: true,
        evidenceValidated: supportedCount > 0,
        policyAccepted: false,
        reasonCodes: ["fee_knowledge_semantic_verification_completed"],
        accounting: semanticAccounting ?? noRequestAccounting(started),
        semanticVerificationRef: `semantic:${request.reservedCallId}`,
      });
    }

    throw new Error("approved_one_time_stage_not_supported_by_transport");
  };
}

function defaultServices(overrides: Partial<OneTimeStatementEvaluationServices> = {}): OneTimeStatementEvaluationServices {
  return {
    wholeStatementReview: overrides.wholeStatementReview ?? ((packet, context) => {
      const provider = context.approvedCallMetadata.provider.toLowerCase().includes("anthropic") ? "anthropic" : "openai";
      const modelName = context.approvedCallMetadata.model ?? undefined;
      return wholeStatementFeeIntelligenceProviderAdapter({
        provider,
        anthropicModelName: provider === "anthropic" ? modelName : undefined,
        openAiModelName: provider === "openai" ? modelName : undefined,
      })(packet, context);
    }),
    webSearchDiscovery: overrides.webSearchDiscovery ?? ((request, context) => openAiWebSearchAdapter({
      modelName: context.approvedCallMetadata.model ?? undefined,
    })(request, context)),
    documentRetrieval: overrides.documentRetrieval ?? ((url, options) => retrieveFeeKnowledgeDocument(url, {
      abortSignal: options.abortSignal,
      limits: { maxRedirects: 0 } as unknown as Parameters<typeof retrieveFeeKnowledgeDocument>[1]["limits"],
    })),
    semanticVerification: overrides.semanticVerification ?? ((request, context) => openAiSemanticSupportAdapter({
      modelName: context.approvedCallMetadata.model ?? undefined,
    })(request, context)),
  };
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
        toolEvents: response.accounting.toolEvents?.length
          ? response.accounting.toolEvents
          : [{ type: toolType, count: 1 }],
      },
    };
  }
  return {
    value: response,
    accounting: {
      requestId: null,
      durationMs: Math.max(0, Date.now() - started),
      inputTokens: null,
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
    outputTokens: 0,
    toolEvents: [],
    observedOrEstimatedFinalCostUsd: 0,
    billingDisposition: "provider_confirmed_zero",
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
