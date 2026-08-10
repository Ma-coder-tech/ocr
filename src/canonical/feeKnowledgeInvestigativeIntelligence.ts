import type {
  CanonicalFeeActionability,
  CanonicalFeeClassificationConfidence,
  CanonicalStatementAnalysis,
} from "./types.js";
import {
  type FeeKnowledgeIntelligenceRecord,
  type FeeKnowledgeIntelligenceState,
  type FeeKnowledgeIntelligenceSubject,
  type FeeKnowledgeMerchantActionability,
  type FeeKnowledgeResearchCandidateRecord,
} from "./feeKnowledgeTypes.js";
import type { FeeKnowledgeResearchQuestion, OpenAiResponsesSafeUsage } from "./feeKnowledgeResearch.js";
import type { RetrievedDocument, SafeFetch } from "./feeKnowledgeRetrieval.js";
import { buildFeeKnowledgeIntelligenceRecord } from "./feeKnowledgeIntelligence.js";
import { safeProviderFailureError } from "./providerFailureDiagnostics.js";

export const OPENAI_INVESTIGATIVE_INTELLIGENCE_MAX_OUTPUT_TOKENS = 3_200;
const DEFAULT_OPENAI_INVESTIGATIVE_MODEL = "gpt-5";
const MAX_STATEMENT_ROWS = 12;
const MAX_EXISTING_INTELLIGENCE = 12;
const MAX_DOCUMENT_LOCATORS = 6;
const MAX_EXCERPT_CHARS = 900;

export type FeeKnowledgeInvestigativeScope = "statement" | "retrieved_document";

export type FeeKnowledgeInvestigativeFinding = {
  feeRowRef: string;
  state: FeeKnowledgeIntelligenceState;
  subject: FeeKnowledgeIntelligenceSubject;
  summary: string;
  reasonCodes: string[];
  confidence: CanonicalFeeClassificationConfidence;
  actionabilityCeiling: CanonicalFeeActionability;
  merchantActionability: FeeKnowledgeMerchantActionability;
  proofRequirement: FeeKnowledgeIntelligenceRecord["proofRequirement"];
  candidateRef?: string | null;
  locatorTextHash?: string | null;
  supportStatus?: NonNullable<FeeKnowledgeIntelligenceRecord["candidateEvidence"]>["supportStatus"];
};

export type FeeKnowledgeInvestigativeIntelligenceRequest = {
  scope: FeeKnowledgeInvestigativeScope;
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability">;
  questions: readonly FeeKnowledgeResearchQuestion[];
  existingIntelligence: readonly FeeKnowledgeIntelligenceRecord[];
  candidate?: {
    candidateId: string;
    attemptId: string;
    question: FeeKnowledgeResearchQuestion;
    candidateRecord?: FeeKnowledgeResearchCandidateRecord | null;
    retrieved: RetrievedDocument;
  };
};

export type FeeKnowledgeInvestigativeIntelligenceAdapter = (
  request: FeeKnowledgeInvestigativeIntelligenceRequest,
  context: { abortSignal: AbortSignal },
) => Promise<{ findings: FeeKnowledgeInvestigativeFinding[] }>;

export type FeeKnowledgeInvestigativeIntelligenceOptions = {
  enabled?: boolean;
  openAiApiKey?: string;
  openAiModelName?: string;
  maximumInputBytes?: number;
  maximumOutputTokens?: number;
  adapter?: FeeKnowledgeInvestigativeIntelligenceAdapter;
  fetchImpl?: SafeFetch;
  onUsage?: (usage: OpenAiResponsesSafeUsage) => void;
};

export async function runFeeKnowledgeInvestigativeIntelligence(input: {
  scope: FeeKnowledgeInvestigativeScope;
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability">;
  questions: readonly FeeKnowledgeResearchQuestion[];
  existingIntelligence: readonly FeeKnowledgeIntelligenceRecord[];
  options?: FeeKnowledgeInvestigativeIntelligenceOptions;
  candidate?: FeeKnowledgeInvestigativeIntelligenceRequest["candidate"];
  abortSignal: AbortSignal;
}): Promise<FeeKnowledgeIntelligenceRecord[]> {
  const options = input.options ?? {};
  if (!investigativeEnabled(options)) return [];
  const adapter = options.adapter ?? openAiInvestigativeIntelligenceAdapter(options);
  try {
    const response = await adapter({
      scope: input.scope,
      analysis: input.analysis,
      questions: input.questions,
      existingIntelligence: input.existingIntelligence,
      candidate: input.candidate,
    }, { abortSignal: input.abortSignal });
    return findingsToRecords({
      scope: input.scope,
      findings: response.findings,
      questions: input.questions,
      existingIntelligence: input.existingIntelligence,
      candidate: input.candidate,
    });
  } catch (error) {
    return providerUnavailableRecords({
      error,
      scope: input.scope,
      questions: input.questions,
      candidate: input.candidate,
    });
  }
}

export function openAiInvestigativeIntelligenceAdapter(
  options: FeeKnowledgeInvestigativeIntelligenceOptions = {},
): FeeKnowledgeInvestigativeIntelligenceAdapter {
  return async (request, context) => {
    const apiKey = options.openAiApiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("fee_knowledge_investigative_provider_unavailable_before_send");
    const input = serializeInvestigativeProviderInput(request);
    const maximumInputBytes = options.maximumInputBytes ?? 24_000;
    if (Buffer.byteLength(input, "utf8") > maximumInputBytes) {
      throw new Error("fee_knowledge_investigative_input_limit_exceeded_before_send");
    }
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: context.abortSignal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: options.openAiModelName ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_INVESTIGATIVE_MODEL,
          input,
          reasoning: { effort: "low" },
          text: { format: investigativeOutputJsonSchema() },
          max_output_tokens: options.maximumOutputTokens ?? OPENAI_INVESTIGATIVE_INTELLIGENCE_MAX_OUTPUT_TOKENS,
        }),
      });
    } catch (error) {
      throw safeProviderFailureError(error);
    }
    const raw = await safeJson(response);
    options.onUsage?.(openAiResponsesSafeUsage(raw));
    if (!response.ok) throw safeProviderFailureError(null, { status: response.status, headers: response.headers, body: raw });
    return parseInvestigativeProviderOutput(raw);
  };
}

export function serializeInvestigativeProviderInput(request: FeeKnowledgeInvestigativeIntelligenceRequest): string {
  return [
    "Investigate sanitized payment-processing fee knowledge for RateReveal.",
    "You may propose provisional intelligence, aliases, ownership hypotheses, anomaly flags, markup leads, source relevance, candidate rates/rules/definitions, contradictions, or unresolved findings.",
    "Do not treat your own reasoning as verified fact. Do not invent citations, rates, overcharge amounts, URLs, merchant identifiers, or financial totals. Do not mutate deterministic fee-row facts.",
    "If a retrieved document locator appears relevant, cite only its locatorTextHash and explain as candidate evidence; strict verification/admission will decide support later.",
    "Return JSON only with at most 4 concise findings: {\"findings\":[{feeRowRef,state,subject,summary,reasonCodes,confidence,actionabilityCeiling,merchantActionability,proofRequirement,candidateRef,locatorTextHash,supportStatus}]}",
    JSON.stringify(safeInvestigativePacket(request)),
  ].join("\n\n");
}

export function parseInvestigativeProviderOutput(raw: unknown): { findings: FeeKnowledgeInvestigativeFinding[] } {
  const parsed = parseJsonObject(outputText(raw));
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  return {
    findings: findings
      .map(normalizeFinding)
      .filter((item): item is FeeKnowledgeInvestigativeFinding => Boolean(item))
      .slice(0, 24),
  };
}

export function candidateEvidenceLocatorHash(records: readonly FeeKnowledgeIntelligenceRecord[], candidateId: string): string | null {
  const candidates = records.filter((item) =>
    item.basis.candidateRefs.includes(candidateId) &&
    item.state === "source_derived_candidate_evidence" &&
    item.candidateEvidence?.supportStatus === "candidate_only" &&
    item.candidateEvidence.locatorHash
  );
  const match = candidates.find((item) => item.reasonCodes.includes("fee_knowledge_ai_investigative_intelligence")) ?? candidates[0];
  return match?.candidateEvidence?.locatorHash ?? null;
}

function findingsToRecords(input: {
  scope: FeeKnowledgeInvestigativeScope;
  findings: readonly FeeKnowledgeInvestigativeFinding[];
  questions: readonly FeeKnowledgeResearchQuestion[];
  existingIntelligence: readonly FeeKnowledgeIntelligenceRecord[];
  candidate?: FeeKnowledgeInvestigativeIntelligenceRequest["candidate"];
}): FeeKnowledgeIntelligenceRecord[] {
  const questionRows = new Set(input.questions.map((question) => question.feeRowRef));
  const candidate = input.candidate;
  const candidateRef = candidate?.candidateId ?? null;
  const candidateLocatorHashes = new Set(candidate?.retrieved.locators.map((locator) => locator.textHash) ?? []);
  return input.findings
    .filter((finding) => questionRows.has(finding.feeRowRef))
    .map((finding) => {
      const requestedCandidate = finding.candidateRef && candidateRef && finding.candidateRef === candidateRef;
      const locatorHash = requestedCandidate && finding.locatorTextHash && candidateLocatorHashes.has(finding.locatorTextHash)
        ? finding.locatorTextHash
        : null;
      const providerAttemptedVerification = verifiedLike(finding.state);
      const state = providerAttemptedVerification
        ? input.scope === "retrieved_document" ? "source_derived_candidate_evidence" : "ai_hypothesis"
        : finding.state;
      const candidateEvidenceOnly = state === "source_derived_candidate_evidence";
      return buildFeeKnowledgeIntelligenceRecord({
        feeRowRef: finding.feeRowRef,
        origin: input.scope === "retrieved_document" ? "retrieved_document" : "statement_grounded",
        state,
        subject: finding.subject,
        summary: finding.summary,
        reasonCodes: [
          "fee_knowledge_ai_investigative_intelligence",
          ...finding.reasonCodes,
          ...(providerAttemptedVerification ? ["fee_knowledge_ai_verification_claim_downgraded"] : []),
          ...(input.scope === "retrieved_document" ? ["fee_knowledge_ai_retrieved_document_investigated"] : ["fee_knowledge_ai_statement_context_investigated"]),
        ],
        confidence: finding.confidence,
        actionabilityCeiling: providerAttemptedVerification || candidateEvidenceOnly ? "verify_only" : finding.actionabilityCeiling,
        merchantActionability: providerAttemptedVerification || candidateEvidenceOnly ? "internal_only" : finding.merchantActionability,
        proofRequirement: providerAttemptedVerification ? "external_verification_required" : finding.proofRequirement,
        researchAttemptRefs: candidate ? [candidate.attemptId] : [],
        candidateRef: requestedCandidate ? candidateRef : undefined,
        candidateEvidence: requestedCandidate && candidate?.retrieved.documentFingerprint ? {
          candidateRef,
          documentFingerprint: candidate.retrieved.documentFingerprint,
          locatorHash,
          sourceDomain: candidate.retrieved.safeDiagnostics?.finalSourceDomain ?? candidate.retrieved.safeDiagnostics?.sourceDomain ?? null,
          supportStatus: locatorHash ? "candidate_only" : (finding.supportStatus ?? "semantic_not_run"),
        } : null,
      });
    });
}

function providerUnavailableRecords(input: {
  error: unknown;
  scope: FeeKnowledgeInvestigativeScope;
  questions: readonly FeeKnowledgeResearchQuestion[];
  candidate?: FeeKnowledgeInvestigativeIntelligenceRequest["candidate"];
}): FeeKnowledgeIntelligenceRecord[] {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const preSend = /unavailable_before_send|input_limit_exceeded_before_send/i.test(message);
  const question = input.candidate?.question ?? input.questions[0];
  if (!question) return [];
  return [buildFeeKnowledgeIntelligenceRecord({
    feeRowRef: question.feeRowRef,
    origin: input.scope === "retrieved_document" ? "retrieved_document" : "statement_grounded",
    state: "unresolved_review_needed",
    subject: "investigation_question",
    summary: input.scope === "retrieved_document"
      ? "AI retrieved-document investigation was unavailable; no provider-generated evidence was admitted."
      : "AI statement-grounded investigation was unavailable; deterministic analysis remains authoritative.",
    reasonCodes: [
      "fee_knowledge_ai_investigative_unavailable",
      preSend ? "fee_knowledge_ai_investigative_unavailable_before_send" : "fee_knowledge_ai_investigative_provider_failed",
    ],
    confidence: "low",
    actionabilityCeiling: "unknown",
    merchantActionability: "internal_only",
    proofRequirement: "human_review_required",
    researchAttemptRefs: input.candidate ? [input.candidate.attemptId] : [],
    candidateRef: input.candidate?.candidateId,
    candidateEvidence: input.candidate?.retrieved.documentFingerprint ? {
      candidateRef: input.candidate.candidateId,
      documentFingerprint: input.candidate.retrieved.documentFingerprint,
      locatorHash: null,
      sourceDomain: input.candidate.retrieved.safeDiagnostics?.finalSourceDomain ?? input.candidate.retrieved.safeDiagnostics?.sourceDomain ?? null,
      supportStatus: "semantic_not_run",
    } : null,
  })];
}

function safeInvestigativePacket(request: FeeKnowledgeInvestigativeIntelligenceRequest): Record<string, unknown> {
  const classificationByRow = new Map(request.analysis.feeOwnershipActionability.rowClassifications.map((item) => [item.feeRowId, item.selected]));
  const questionRows = new Set(request.questions.map((question) => question.feeRowRef));
  return {
    scope: request.scope,
    statementContext: {
      processorNamePresent: Boolean(request.analysis.identity.processorName.value),
      processorName: safeText(request.analysis.identity.processorName.value, 80),
      statementPeriodYear: request.questions.find((question) => question.statementPeriodYear)?.statementPeriodYear ?? null,
      feeLedgerRowCount: request.analysis.feeLedger.rows.length,
    },
    feeRows: request.analysis.feeLedger.rows
      .filter((row) => questionRows.has(row.id))
      .slice(0, MAX_STATEMENT_ROWS)
      .map((row) => {
        const selected = classificationByRow.get(row.id);
        return {
          feeRowRef: row.id,
          selectedLabel: safeText(row.selectedLabel, 120),
          statementSection: row.role,
          contributesToUniqueTotal: row.contributesToUniqueTotal,
          deterministicCategory: selected?.category ?? null,
          deterministicEconomicOwner: selected?.ownership.economicBeneficiary ?? null,
          deterministicContractualController: selected?.ownership.contractualController ?? null,
          deterministicActionabilityCeiling: selected?.actionabilityCeiling ?? null,
          deterministicConfidence: selected?.confidence ?? null,
        };
      }),
    questions: request.questions.slice(0, MAX_STATEMENT_ROWS).map((question) => ({
      feeRowRef: question.feeRowRef,
      category: question.sanitizedQuestionCategory,
      triggerReason: question.triggerReason,
      feeLabel: safeText(question.feeLabel, 120),
      processorOrNetwork: safeText(question.processorOrNetwork, 80),
      deterministicCategory: question.deterministicCategory,
      deterministicEconomicOwner: question.deterministicEconomicOwner,
      deterministicContractualController: question.deterministicContractualController,
      semanticQuestion: safeText(question.semanticQuestion, 180),
    })),
    existingIntelligence: request.existingIntelligence.slice(0, MAX_EXISTING_INTELLIGENCE).map((item) => ({
      intelligenceId: item.intelligenceId,
      feeRowRef: item.feeRowRef,
      origin: item.origin,
      state: item.state,
      subject: item.subject,
      summary: safeText(item.summary, 180),
      proofRequirement: item.proofRequirement,
      claimSupportRefs: item.basis.claimSupportRefs,
    })),
    candidate: request.candidate ? {
      candidateId: request.candidate.candidateId,
      attemptId: request.candidate.attemptId,
      feeRowRef: request.candidate.question.feeRowRef,
      sourceDomain: request.candidate.retrieved.safeDiagnostics?.finalSourceDomain ?? request.candidate.retrieved.safeDiagnostics?.sourceDomain ?? null,
      documentFingerprint: request.candidate.retrieved.documentFingerprint,
      retrievalStatus: request.candidate.retrieved.status,
      contentType: request.candidate.retrieved.contentType,
      byteLength: request.candidate.retrieved.byteLength,
      locators: selectedLocatorsForInvestigation(request.candidate).map((locator) => ({
        locatorId: locator.locatorId,
        kind: locator.kind,
        pageNumber: locator.pageNumber,
        sectionLabel: safeText(locator.sectionLabel, 80),
        locatorTextHash: locator.textHash,
        excerpt: safeText(excerptForLocator(request.candidate!.retrieved.text, locator.textStart, locator.textEnd), MAX_EXCERPT_CHARS),
      })),
    } : null,
  };
}

function selectedLocatorsForInvestigation(candidate: NonNullable<FeeKnowledgeInvestigativeIntelligenceRequest["candidate"]>) {
  const scored = candidate.retrieved.locators.map((locator, index) => {
    const excerpt = excerptForLocator(candidate.retrieved.text, locator.textStart, locator.textEnd);
    return { locator, index, score: investigativeLocatorScore(excerpt, candidate.question) };
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.slice(0, MAX_DOCUMENT_LOCATORS).map((item) => item.locator);
}

function investigativeLocatorScore(excerpt: string, question: FeeKnowledgeResearchQuestion): number {
  const normalized = normalizeText(excerpt);
  const terms = new Set([
    ...meaningfulTokens(question.feeLabel),
    ...meaningfulTokens(question.processorOrNetwork),
    ...meaningfulTokens(question.semanticQuestion),
    question.deterministicCategory ?? "",
  ].filter(Boolean));
  let score = 0;
  for (const term of terms) {
    if (normalized.includes(term)) score += term.length >= 8 ? 4 : 2;
  }
  if (normalized.length >= 80) score += 2;
  if (/\b(acquirer|acquiring|processor|processing|network|authorization|assessment|interchange|fee|merchant)\b/.test(normalized)) score += 3;
  if (/^(skip to main content|.*main menu|.*close learn what)/.test(normalized)) score -= 6;
  return score;
}

function normalizeFinding(value: unknown): FeeKnowledgeInvestigativeFinding | null {
  const record = asRecord(value);
  if (!record) return null;
  const feeRowRef = safeRef(record.feeRowRef);
  const state = enumValue(record.state, STATES);
  const subject = enumValue(record.subject, SUBJECTS);
  if (!feeRowRef || !state || !subject) return null;
  return {
    feeRowRef,
    state,
    subject,
    summary: safeText(record.summary, 220) || "AI investigative intelligence requires review.",
    reasonCodes: arrayField(record.reasonCodes).map(String).filter(safeReasonCode).slice(0, 8),
    confidence: enumValue(record.confidence, CONFIDENCES) ?? "low",
    actionabilityCeiling: enumValue(record.actionabilityCeiling, ACTIONABILITY) ?? "verify_only",
    merchantActionability: enumValue(record.merchantActionability, MERCHANT_ACTIONABILITY) ?? "internal_only",
    proofRequirement: enumValue(record.proofRequirement, PROOF_REQUIREMENTS) ?? "external_verification_required",
    candidateRef: safeRef(record.candidateRef),
    locatorTextHash: safeRef(record.locatorTextHash),
    supportStatus: enumValue(record.supportStatus, SUPPORT_STATUSES) ?? "candidate_only",
  };
}

function openAiResponsesSafeUsage(raw: unknown): OpenAiResponsesSafeUsage {
  const root = asRecord(raw);
  const usage = asRecord(root?.usage);
  const details = asRecord(usage?.input_tokens_details);
  return {
    requestId: typeof root?.id === "string" && root.id.length > 0 ? root.id : null,
    inputTokens: safeInteger(usage?.input_tokens),
    cachedInputTokens: safeInteger(details?.cached_tokens) ?? 0,
    outputTokens: safeInteger(usage?.output_tokens),
    webSearchToolCalls: 0,
    webSearchActionTypes: [],
  };
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

function outputText(raw: unknown): string {
  const output = arrayField(asRecord(raw)?.output);
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
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function investigativeEnabled(options: FeeKnowledgeInvestigativeIntelligenceOptions): boolean {
  return options.enabled ?? /^(1|true|yes|on)$/i.test(process.env.RATEREVEAL_FEE_KNOWLEDGE_INVESTIGATIVE_AI_ENABLED ?? "");
}

function verifiedLike(state: FeeKnowledgeIntelligenceState): boolean {
  return state === "externally_supported" || state === "externally_verified" || state === "math_verified" || state === "fully_verified";
}

function excerptForLocator(text: string, start: number | null, end: number | null): string {
  if (start === null || end === null || start < 0 || end <= start) return text.slice(0, MAX_EXCERPT_CHARS);
  return text.slice(start, Math.min(end, start + MAX_EXCERPT_CHARS));
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/https:\/\/\S+/gi, "[url_withheld]")
    .replace(/(?:\/Users\/|\/private\/|[A-Za-z]:\\)\S+/g, "[path_withheld]")
    .replace(/\b(?:api(?:\s|-)?key|credential|secret|bearer|sk-[A-Za-z0-9_-]+)\b/gi, "[credential_withheld]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength) || null;
}

function meaningfulTokens(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["this", "that", "with", "from", "into", "only", "find", "official", "material"].includes(token))
    .slice(0, 24);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeRef(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
}

function safeReasonCode(value: string): boolean {
  return /^[a-z0-9_]{3,120}$/i.test(value);
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : null;
}

const STATES = [
  "ai_interpretation",
  "ai_hypothesis",
  "anomaly_flag",
  "investigation_lead",
  "source_derived_candidate_evidence",
  "externally_supported",
  "externally_verified",
  "math_verified",
  "fully_verified",
  "unresolved_review_needed",
  "rejected",
] as const;

const SUBJECTS = [
  "fee_meaning",
  "fee_alias",
  "fee_ownership",
  "processor_vs_network",
  "published_rate",
  "applicability_condition",
  "markup_hypothesis",
  "anomaly",
  "negotiability",
  "investigation_question",
  "source_relevance",
  "conflict",
] as const;

const CONFIDENCES = ["high", "medium", "low"] as const;
const ACTIONABILITY = ["potentially_actionable", "verify_only", "not_actionable", "unknown"] as const;
const MERCHANT_ACTIONABILITY = ["merchant_display_provisional", "merchant_display_supported", "merchant_display_verified", "internal_only", "human_review_only"] as const;
const PROOF_REQUIREMENTS = ["statement_grounded_labeling_only", "external_verification_required", "deterministic_math_required", "external_and_math_required", "human_review_required"] as const;
const SUPPORT_STATUSES = ["candidate_only", "semantic_supported", "semantic_rejected", "semantic_not_run", "inapplicable"] as const;

function investigativeOutputJsonSchema(): Record<string, unknown> {
  return {
    type: "json_schema",
    name: "fee_knowledge_investigative_findings",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["findings"],
      properties: {
        findings: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "feeRowRef",
              "state",
              "subject",
              "summary",
              "reasonCodes",
              "confidence",
              "actionabilityCeiling",
              "merchantActionability",
              "proofRequirement",
              "candidateRef",
              "locatorTextHash",
              "supportStatus",
            ],
            properties: {
              feeRowRef: { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,160}$" },
              state: { type: "string", enum: STATES },
              subject: { type: "string", enum: SUBJECTS },
              summary: { type: "string", minLength: 1, maxLength: 260 },
              reasonCodes: {
                type: "array",
                maxItems: 8,
                items: { type: "string", pattern: "^[a-z0-9_]{3,120}$" },
              },
              confidence: { type: "string", enum: CONFIDENCES },
              actionabilityCeiling: { type: "string", enum: ACTIONABILITY },
              merchantActionability: { type: "string", enum: MERCHANT_ACTIONABILITY },
              proofRequirement: { type: "string", enum: PROOF_REQUIREMENTS },
              candidateRef: { type: ["string", "null"], pattern: "^[A-Za-z0-9_.:-]{1,160}$" },
              locatorTextHash: { type: ["string", "null"], pattern: "^[A-Za-z0-9_.:-]{1,160}$" },
              supportStatus: { type: "string", enum: SUPPORT_STATUSES },
            },
          },
        },
      },
    },
  };
}
