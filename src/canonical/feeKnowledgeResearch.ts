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

export type FeeKnowledgeResearchLimits = {
  policyVersion: typeof FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION;
  maxSearchCalls: number;
  maxRetrievalCandidates: number;
  totalDeadlineMs: number;
  maxResultCandidatesPerSearch: number;
};

export const FEE_KNOWLEDGE_RESEARCH_LIMITS = {
  policyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
  maxSearchCalls: 2,
  maxRetrievalCandidates: 5,
  totalDeadlineMs: 15000,
  maxResultCandidatesPerSearch: 5,
} as const satisfies FeeKnowledgeResearchLimits;

const DEFAULT_OPENAI_WEB_SEARCH_MODEL = "gpt-5";
export const OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS = 2_000;
export const OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS = 1_000;
const WEB_SEARCH_MODEL_PATTERN = /^(gpt-5(?:$|-)|gpt-4\.1(?:$|-)|gpt-4o(?:-search-preview)?(?:$|-)|o3(?:$|-)|o4-mini(?:$|-))/i;

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
};

export type FeeKnowledgeResearchOptions = {
  enabled?: boolean;
  openAiApiKey?: string;
  openAiModelName?: string;
  adapter?: FeeKnowledgeSearchAdapter;
  semanticSupportAdapter?: FeeKnowledgeSemanticSupportAdapter;
  fetchImpl?: SafeFetch;
  resolveHost?: RetrieveDocumentOptions["resolveHost"];
  timeoutMs?: number;
  domainIdentityPolicy?: FeeKnowledgeDomainIdentityPolicy;
};

export type FeeKnowledgeResearchResult = {
  attempts: FeeKnowledgeResearchAttemptRecord[];
  candidates: FeeKnowledgeResearchCandidateRecord[];
  claimSupports: FeeKnowledgeClaimSupportRecord[];
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
  if (!researchEnabled(options)) {
    return {
      attempts: input.questions.map((question, index) => attemptRecord(question, index, "disabled", [], ["fee_knowledge_research_disabled"])),
      candidates: [],
      claimSupports: [],
    };
  }
  if (input.questions.length === 0) {
    return {
      attempts: [
        {
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
        },
      ],
      candidates: [],
      claimSupports: [],
    };
  }

  const attempts: FeeKnowledgeResearchAttemptRecord[] = [];
  const candidates: FeeKnowledgeResearchCandidateRecord[] = [];
  const claimSupports: FeeKnowledgeClaimSupportRecord[] = [];
  return withAbortTimeout(async (abortSignal) => {
    const searchAdapter = options.adapter ?? openAiWebSearchAdapter({ apiKey: options.openAiApiKey, modelName: options.openAiModelName, fetchImpl: options.fetchImpl });
    const semanticSupportAdapter =
      options.semanticSupportAdapter ?? openAiSemanticSupportAdapter({ apiKey: options.openAiApiKey, modelName: options.openAiModelName, fetchImpl: options.fetchImpl });
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis: input.analysis, registry: input.registry });
    const selectedQuestions = input.questions.slice(0, FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls);
    const skippedQuestions = input.questions.slice(FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls);
    let remainingCandidates = FEE_KNOWLEDGE_RESEARCH_LIMITS.maxRetrievalCandidates;

    for (const [index, question] of selectedQuestions.entries()) {
      const attemptId = attemptIdFor(question, index);
      try {
        const discovered = await searchAdapter({ attemptId, questions: [question], limits: FEE_KNOWLEDGE_RESEARCH_LIMITS }, { abortSignal });
        const bounded = dedupeCandidates(discovered).slice(0, Math.min(remainingCandidates, FEE_KNOWLEDGE_RESEARCH_LIMITS.maxResultCandidatesPerSearch));
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
          const retrieved = await retrieveFeeKnowledgeDocument(candidate.url, {
            abortSignal,
            fetchImpl: options.fetchImpl,
            resolveHost: options.resolveHost,
          });
          candidates[pendingIndex] = candidateAfterRetrieval(candidates[pendingIndex]!, retrieved);
          const verification = await verifyCandidate({
            candidateId,
            attemptId,
            candidate,
            retrieved,
            question,
            questionOrdinal: index,
            semanticSupportAdapter,
            domainIdentityPolicy: options.domainIdentityPolicy,
            priorClaimSupports: [...sourcePacket.claimSupports, ...claimSupports],
            abortSignal,
          });
          candidates[pendingIndex] = verification.candidate;
          if (verification.claimSupport) claimSupports.push(verification.claimSupport);
          if (["failed", "timed_out", "safety_blocked"].includes(verification.candidate.semanticVerificationStatus)) {
            throw new FeeKnowledgeSearchProviderError(
              verification.candidate.semanticVerificationStatus as "failed" | "timed_out" | "safety_blocked",
              "Fee knowledge semantic verification did not complete successfully.",
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
      }
    }

    for (const [offset, question] of skippedQuestions.entries()) {
      attempts.push(attemptRecord(question, selectedQuestions.length + offset, "budget_exhausted", [], ["fee_knowledge_research_budget_exhausted"]));
    }

    return snapshotResearchResult({ attempts, candidates, claimSupports });
  }, options.timeoutMs ?? FEE_KNOWLEDGE_RESEARCH_LIMITS.totalDeadlineMs).catch((error) => {
    const timedOut = /timed out|aborted|abort/i.test(error instanceof Error ? error.message : String(error));
    return terminalResearchSnapshot({
      questions: input.questions,
      attempts,
      candidates,
      claimSupports,
      status: timedOut ? "timed_out" : "failed",
    });
  });
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
  const questions: FeeKnowledgeResearchQuestion[] = analysis.feeLedger.rows
    .map((row): FeeKnowledgeResearchQuestion | null => {
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
      return {
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
        semanticQuestion: "Find official documentation that explains this payment processing fee label or published rule.",
      };
    })
    .filter((question): question is FeeKnowledgeResearchQuestion => Boolean(question));
  return questions.sort((left, right) => priority(left.triggerReason) - priority(right.triggerReason) || left.feeRowRef.localeCompare(right.feeRowRef));
}

export function openAiWebSearchAdapter(options: {
  apiKey?: string;
  modelName?: string;
  fetchImpl?: SafeFetch;
  maximumInputTokens?: number;
  maximumOutputTokens?: number;
  maximumToolUses?: number;
  onUsage?: (usage: OpenAiResponsesSafeUsage) => void;
}): FeeKnowledgeSearchAdapter {
  return async (request, context) => {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new FeeKnowledgeSearchProviderError("failed", "OpenAI API key unavailable for fee knowledge discovery.");
    const model = options.modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_WEB_SEARCH_MODEL;
    validateWebSearchModel(model);
    const fetchImpl = options.fetchImpl ?? fetch;
    const input = [
      "Find official payment processor, card-network, or regulatory documentation URLs only.",
      "Return sources that may explain the sanitized fee labels. Search results are discovery candidates only.",
      JSON.stringify({
        questionCount: request.questions.length,
        questions: request.questions.map((question) => ({
          category: question.sanitizedQuestionCategory,
          processorOrNetwork: question.processorOrNetwork,
          feeLabel: question.feeLabel,
          proposedCategory: question.deterministicCategory,
          likelyEconomicOwner: question.deterministicEconomicOwner,
          likelyContractualController: question.deterministicContractualController,
          conditions: [],
          exclusions: [],
          maximumConfidence: question.deterministicConfidence,
          actionabilityCeiling: question.deterministicActionabilityCeiling,
          statementSection: question.statementSection,
          statementPeriodYear: question.statementPeriodYear,
          semanticQuestion: question.semanticQuestion,
        })),
      }),
    ].join("\n");
    assertUtf8InputBound(input, options.maximumInputTokens);
    const maximumOutputTokens = positiveInteger(options.maximumOutputTokens ?? OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS, "web-search maximum output tokens");
    const maximumToolUses = positiveInteger(options.maximumToolUses ?? 1, "web-search maximum tool uses");
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
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
        tool_choice: "auto",
        max_output_tokens: maximumOutputTokens,
        max_tool_calls: maximumToolUses,
      }),
    });
    const raw = await safeJson(response);
    options.onUsage?.(openAiResponsesSafeUsage(raw));
    if (!response.ok) {
      throw new FeeKnowledgeSearchProviderError(classifyProviderError(raw) === "unsupported_model" ? "unsupported_model" : "failed", `OpenAI fee knowledge discovery failed with HTTP ${response.status}`);
    }
    if (providerRefused(raw)) throw new FeeKnowledgeSearchProviderError("failed", "OpenAI fee knowledge discovery refused.");
    return extractDiscoveryCandidates(raw).slice(0, request.limits.maxResultCandidatesPerSearch);
  };
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
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: context.abortSignal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: options.modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_WEB_SEARCH_MODEL,
        input,
        max_output_tokens: maximumOutputTokens,
      }),
    });
    const raw = await safeJson(response);
    options.onUsage?.(openAiResponsesSafeUsage(raw));
    if (!response.ok) return unsupportedSemanticDecision(request.structuredClaim, "fee_knowledge_semantic_support_provider_failed");
    return semanticDecisionFromRaw(raw, request.structuredClaim);
  };
}

export function openAiResponsesSafeUsage(raw: unknown): OpenAiResponsesSafeUsage {
  const root = asRecord(raw);
  const usage = asRecord(root?.usage);
  const details = asRecord(usage?.input_tokens_details);
  const output = Array.isArray(root?.output) ? root.output : [];
  return {
    requestId: typeof root?.id === "string" && root.id.length > 0 ? root.id : null,
    inputTokens: safeUsageInteger(usage?.input_tokens),
    cachedInputTokens: safeUsageInteger(details?.cached_tokens) ?? 0,
    outputTokens: safeUsageInteger(usage?.output_tokens),
    webSearchToolCalls: output.filter((item) => asRecord(item)?.type === "web_search_call").length,
  };
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
  const host = new URL(canonicalUrl).hostname.toLowerCase();
  const publisherDomainVerified = input.question.processorOrNetwork ? verifiedPublisherDomain(host, input.question.processorOrNetwork, input.domainIdentityPolicy) : false;
  const processorMentioned = input.question.processorOrNetwork ? normalizeText(input.retrieved.text).includes(normalizeText(input.question.processorOrNetwork)) : false;
  const processorMatched = publisherDomainVerified && processorMentioned;
  const periodApplicable =
    !input.question.statementPeriodYear || normalizeText(input.retrieved.text).includes(input.question.statementPeriodYear) || !/\b20\d{2}\b/.test(input.retrieved.text);

  if (!citation.exists || !citation.locator) {
    return {
      candidate: candidateRecord(input, attemptId, {
        canonicalUrl,
        verificationStatus: "provisional",
        reasonCodes: [...input.retrieved.reasonCodes, "fee_knowledge_claim_support_missing", "fee_knowledge_semantic_support_not_run"],
        safeApplicability: { processorOrNetworkMatched: processorMatched, periodApplicable, jurisdictionApplicable: null, contextApplicable: null },
        sourceFingerprint: input.retrieved.documentFingerprint,
        retrievalStatus: input.retrieved.status,
        semanticVerificationStatus: "not_started",
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
            locatorTextHash: citation.locator.textHash,
            boundedEvidenceExcerpt: citation.excerpt,
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
    semanticSupport.reasonCodes.includes("fee_knowledge_semantic_json_invalid") ? "parse_failed"
      : semanticSupport.reasonCodes.includes("fee_knowledge_semantic_timed_out") ? "timed_out"
        : semanticSupport.reasonCodes.includes("fee_knowledge_semantic_safety_blocked") ? "safety_blocked"
          : semanticSupport.reasonCodes.some((reason) => [
              "fee_knowledge_semantic_failed",
              "fee_knowledge_semantic_support_provider_unavailable",
              "fee_knowledge_semantic_support_provider_failed",
            ].includes(reason)) ? "failed"
          : "completed";
  const semanticStateReason = semanticVerificationStatus === "parse_failed" ? "fee_knowledge_semantic_parse_failed"
    : semanticVerificationStatus === "timed_out" ? "fee_knowledge_semantic_timed_out"
      : semanticVerificationStatus === "safety_blocked" ? "fee_knowledge_semantic_safety_blocked"
        : semanticVerificationStatus === "failed" ? "fee_knowledge_semantic_failed"
          : `fee_knowledge_${evidenceDecision}`;
  const candidate: FeeKnowledgeResearchCandidateRecord = candidateRecord(input, attemptId, {
    canonicalUrl,
    verificationStatus: semanticVerificationStatus === "safety_blocked" ? "safety_blocked"
      : verified ? "runtime_verified_documentation"
        : evidenceDecision === "conflicting_evidence" ? "conflicting_evidence"
          : evidenceDecision === "source_inapplicable" ? "source_inapplicable" : "verified_candidate_limited",
    reasonCodes: [
      ...input.retrieved.reasonCodes,
      ...(semanticVerificationStatus === "completed" ? [`fee_knowledge_${evidenceDecision}`] : []),
      semanticStateReason,
    ],
    safeApplicability: { processorOrNetworkMatched: processorMatched, periodApplicable, jurisdictionApplicable: null, contextApplicable: null },
    sourceFingerprint: input.retrieved.documentFingerprint,
    retrievalStatus: input.retrieved.status,
    semanticVerificationStatus,
    locatorHash: citation.locator.textHash,
    claimSupportDecisionRef: null,
  });
  const claimSupport: FeeKnowledgeClaimSupportRecord = {
    type: "fee_knowledge_claim_support",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    claimSupportId: `claimsupport_${stableId([input.question.feeRowRef, input.candidateId, citation.locator.locatorId, evidenceDecision])}`,
    feeRowRef: input.question.feeRowRef,
    sourceId: `runtime_source_${stableId([canonicalUrl])}`,
    claimId: `runtime_claim_${stableId([input.question.feeLabel, input.question.semanticQuestion, structuredClaim.claimKind])}`,
    candidateId: input.candidateId,
    structuredClaim,
    documentFingerprint: input.retrieved.documentFingerprint,
    evidenceLocator: citation.locator,
    locatorTextHash: citation.locator.textHash,
    boundedSafeExcerpt: citation.excerpt,
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
    locatorHash: values.locatorHash,
    claimSupportDecisionRef: values.claimSupportDecisionRef,
    displayPermission: "internal_only",
  };
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
  };
}

function snapshotResearchResult(result: FeeKnowledgeResearchResult): FeeKnowledgeResearchResult {
  return structuredClone({
    attempts: result.attempts,
    candidates: result.candidates,
    claimSupports: result.claimSupports,
  });
}

function terminalResearchSnapshot(input: {
  questions: readonly FeeKnowledgeResearchQuestion[];
  attempts: readonly FeeKnowledgeResearchAttemptRecord[];
  candidates: readonly FeeKnowledgeResearchCandidateRecord[];
  claimSupports: readonly FeeKnowledgeClaimSupportRecord[];
  status: "failed" | "timed_out";
}): FeeKnowledgeResearchResult {
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
    const beyondBudget = index >= FEE_KNOWLEDGE_RESEARCH_LIMITS.maxSearchCalls;
    const status = beyondBudget ? "budget_exhausted" : input.status;
    const candidateIds = candidates.filter((candidate) => candidate.questionRef === questionRef).map((candidate) => candidate.candidateId);
    attemptsByQuestion.set(questionRef, attemptRecord(question, index, status, candidateIds, [researchFailureReason(status)]));
  }
  return snapshotResearchResult({
    attempts: input.questions.map((question, index) => attemptsByQuestion.get(feeKnowledgeQuestionRef(question, index))!),
    candidates,
    claimSupports: structuredClone([...input.claimSupports]),
  });
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

function classifyProviderError(raw: unknown): "unsupported_model" | "failed" {
  const text = JSON.stringify(raw ?? {}).toLowerCase();
  return /unsupported|tool|web_search|model/.test(text) ? "unsupported_model" : "failed";
}

function providerRefused(raw: unknown): boolean {
  const text = JSON.stringify(raw ?? {}).toLowerCase();
  return /"refusal"|refused|cannot comply|policy/.test(text);
}

function validateWebSearchModel(model: string): void {
  if (!WEB_SEARCH_MODEL_PATTERN.test(model)) {
    throw new FeeKnowledgeSearchProviderError("unsupported_model", `Configured OpenAI model ${model} is not approved for fee knowledge web_search.`);
  }
}

function semanticDecisionFromRaw(raw: unknown, structuredClaim: FeeKnowledgeStructuredClaim): FeeKnowledgeSemanticSupportDecision {
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
    missing_applicable_registry_claim: 2,
    material_unfamiliar_label: 3,
    disabled: 4,
    not_needed: 5,
  }[reason];
}

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
