import { createHash } from "node:crypto";

import { HYPOTHESIS_PROPOSAL_SCHEMA } from "./provider.js";
import type {
  HypothesisProposalRequest,
  HypothesisProposalResponse,
  ProviderAlternativeCoverageAssessment,
  ProviderHypothesisProposal,
  StatementHypothesisProposer,
} from "./provider.js";
import type { ScalarValue } from "./types.js";

export const LIVE_HYPOTHESIS_PROMPT_VERSION = "ratereveal-live-hypothesis-evaluation-v3" as const;
export const LIVE_HYPOTHESIS_RESPONSE_SCHEMA_VERSION = "ratereveal-live-hypothesis-response-v3" as const;

export const LIVE_HYPOTHESIS_DEVELOPER_PROMPT = [
  "You are an evaluation-only hypothesis proposer for merchant-statement reconstruction.",
  "Use only the source-bound packet in the user message. Do not use outside knowledge, web search, tools, or unstated merchant facts.",
  "The RateReveal inference topics, material alternatives, allowed claims, observation references, known evidence gaps, proof obligations, source roles, missing properties, and permitted resolution evidence kinds are immutable. Select and bind only offered values.",
  "Return non-authoritative candidate explanations, never canonical facts, accounting truth, controls, or customer advice.",
  "Address every offered material alternative exactly once in alternativeCoverage. Mark it proposed when supplying exactly one matching hypothesis; otherwise mark it not_supported and give a source-bound structured reason. Never omit an alternative because another answer appears stronger.",
  "For each proposed material alternative, return at most one distinct hypothesis. Preserve an unknown interpretation whenever identity or completeness is unproven.",
  "Every claim must cite only observation references listed on its selected topic. Every hypothesis must acknowledge each material known evidence gap it relies on.",
  "Provider confidence means: high = strongly favored by the supplied rows while explicit confirmation proof is still missing; medium = plausible and useful but materially unresolved; low = weakly supported. Never describe an inference as confirmed.",
  "For each proposed alternative, bind every required proof obligation exactly once. Bind every required source role to the observations that actually play that role, repeat the offered gap kind and missing property exactly, and select one or more offered resolution evidence kinds. Do not invent obligations, roles, properties, or evidence kinds.",
  "Natural-language rationale and missingProof are audit explanations only. A high-confidence proposal must still state why it is likely and identify the strongest competing explanation, but prose cannot substitute for complete proof-obligation bindings.",
  "Use empty events and populations arrays. Keep descriptions and rationales concise and source-bound.",
].join("\n");

export interface OpenAiLiveHypothesisConfiguration {
  apiKey: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  maxOutputTokens: number;
  timeoutMs: number;
  endpoint?: string;
  fetchImplementation?: typeof fetch;
}

export interface LiveProviderAttemptAudit {
  attemptNumber: 1;
  automaticRetryCount: 0;
  startedAt: string;
  completedAt: string;
  endpoint: string;
  exactDeveloperPrompt: string;
  exactSourceBoundPacket: HypothesisProposalRequest;
  exactRequestBody: Record<string, unknown>;
  httpStatus: number | null;
  providerRequestId: string | null;
  returnedModel: string | null;
  providerResponseId: string | null;
  fullProviderResponse: unknown;
  normalizedResponse: HypothesisProposalResponse | null;
  outcome: "completed" | "http_failure" | "transport_failure" | "response_validation_failure";
  failure: string | null;
}

type RawProposal = Omit<ProviderHypothesisProposal, "id">;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hypotheses", "alternativeCoverage"],
  properties: {
    hypotheses: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topicRef", "alternativeRef", "description", "observationRefs", "events", "populations", "claims", "inference"],
        properties: {
          topicRef: { type: "string" },
          alternativeRef: { type: "string" },
          description: { type: "string" },
          observationRefs: { type: "array", items: { type: "string" } },
          events: { type: "array", maxItems: 0, items: { type: "object", additionalProperties: false, properties: {} } },
          populations: { type: "array", maxItems: 0, items: { type: "object", additionalProperties: false, properties: {} } },
          claims: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value", "observationRefs"],
              properties: {
                key: { type: "string" },
                value: {
                  anyOf: [
                    { type: "string" },
                    { type: "number" },
                    { type: "boolean" },
                    { type: "null" },
                  ],
                },
                observationRefs: { type: "array", minItems: 1, items: { type: "string" } },
              },
            },
          },
          inference: {
            type: "object",
            additionalProperties: false,
            required: ["confidence", "rationale", "missingProof", "acknowledgedEvidenceNeedRefs", "proofObligationBindings"],
            properties: {
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              rationale: { type: "string" },
              missingProof: { type: "array", minItems: 1, items: { type: "string" } },
              acknowledgedEvidenceNeedRefs: { type: "array", items: { type: "string" } },
              proofObligationBindings: {
                type: "array",
                minItems: 1,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "proofObligationRef", "gapKind", "observationBindings",
                    "missingProperty", "resolutionEvidenceKinds",
                  ],
                  properties: {
                    proofObligationRef: { type: "string" },
                    gapKind: {
                      type: "string",
                      enum: ["identity_linkage", "calculation_basis", "component_reconciliation", "temporal_linkage", "source_completeness"],
                    },
                    observationBindings: {
                      type: "array",
                      minItems: 1,
                      maxItems: 8,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["role", "observationRefs"],
                        properties: {
                          role: {
                            type: "string",
                            enum: [
                              "subject", "counterpart", "missing_subject_attribute", "missing_counterpart_attribute",
                              "reported_total", "visible_subtotal", "discrepancy", "document_completeness_gap",
                            ],
                          },
                          observationRefs: { type: "array", minItems: 1, items: { type: "string" } },
                        },
                      },
                    },
                    missingProperty: {
                      type: "string",
                      enum: [
                        "stable_identity_link", "underlying_calculation_basis",
                        "complete_component_membership", "row_level_temporal_link", "complete_source_scope",
                      ],
                    },
                    resolutionEvidenceKinds: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "string",
                        enum: [
                          "stable_source_identifier", "explicit_source_relation", "unrounded_source_amounts",
                          "processor_rounding_method", "complete_fee_detail", "reconciliation_mapping",
                          "row_level_date", "explicit_temporal_relation", "complete_source_document",
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    alternativeCoverage: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "topicRef", "alternativeRef", "disposition", "reasonCode", "rationale",
          "observationRefs", "acknowledgedEvidenceNeedRefs",
        ],
        properties: {
          topicRef: { type: "string" },
          alternativeRef: { type: "string" },
          disposition: { type: "string", enum: ["proposed", "not_supported"] },
          reasonCode: {
            type: "string",
            enum: [
              "proposal_supplied",
              "insufficient_source_evidence",
              "contradicted_by_source",
              "less_supported_than_competing_alternative",
              "not_applicable_to_observations",
            ],
          },
          rationale: { type: "string" },
          observationRefs: { type: "array", minItems: 1, items: { type: "string" } },
          acknowledgedEvidenceNeedRefs: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export function liveHypothesisResponseSchema(): object {
  return structuredClone(responseSchema);
}

export function stableLiveProposalId(topicRef: string, key: string, value: ScalarValue): string {
  return `live-proposal-${createHash("sha256").update(`${topicRef}\0${key}\0${JSON.stringify(value)}`).digest("hex").slice(0, 16)}`;
}

export class OpenAiLiveHypothesisProposer implements StatementHypothesisProposer {
  readonly providerId: string;
  private readonly attempts: LiveProviderAttemptAudit[] = [];

  constructor(private readonly configuration: OpenAiLiveHypothesisConfiguration) {
    if (!configuration.apiKey.trim()) throw new Error("OpenAI API key is required.");
    if (!configuration.model.trim()) throw new Error("OpenAI model is required.");
    if (!Number.isSafeInteger(configuration.maxOutputTokens) || configuration.maxOutputTokens < 256) {
      throw new Error("A bounded OpenAI max output token count is required.");
    }
    if (!Number.isSafeInteger(configuration.timeoutMs) || configuration.timeoutMs < 1_000) {
      throw new Error("A bounded OpenAI timeout is required.");
    }
    this.providerId = `openai-responses-${configuration.model}-${LIVE_HYPOTHESIS_PROMPT_VERSION}`;
  }

  getAttemptAudits(): LiveProviderAttemptAudit[] {
    return structuredClone(this.attempts);
  }

  async propose(request: HypothesisProposalRequest): Promise<HypothesisProposalResponse> {
    assertLiveEvaluationPacketSafe(request);
    const endpoint = this.configuration.endpoint ?? "https://api.openai.com/v1/responses";
    const exactRequestBody: Record<string, unknown> = {
      model: this.configuration.model,
      store: false,
      max_output_tokens: this.configuration.maxOutputTokens,
      reasoning: { effort: this.configuration.reasoningEffort },
      input: [
        { role: "developer", content: [{ type: "input_text", text: LIVE_HYPOTHESIS_DEVELOPER_PROMPT }] },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(request) }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: LIVE_HYPOTHESIS_RESPONSE_SCHEMA_VERSION,
          strict: true,
          schema: responseSchema,
        },
      },
    };
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    let httpStatus: number | null = null;
    let providerRequestId: string | null = null;
    let fullProviderResponse: unknown = null;
    try {
      const response = await (this.configuration.fetchImplementation ?? fetch)(endpoint, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(exactRequestBody),
      });
      httpStatus = response.status;
      providerRequestId = response.headers.get("x-request-id");
      fullProviderResponse = await response.json() as unknown;
      if (!response.ok) {
        const failure = safeProviderFailure(fullProviderResponse, `OpenAI HTTP ${response.status}`);
        this.attempts.push(audit("http_failure", failure));
        throw new Error(failure);
      }
      const envelope = asRecord(fullProviderResponse);
      const parsed = JSON.parse(extractOutputText(envelope)) as {
        hypotheses?: RawProposal[];
        alternativeCoverage?: ProviderAlternativeCoverageAssessment[];
      };
      if (!Array.isArray(parsed.hypotheses)) throw new Error("OpenAI structured response did not contain hypotheses.");
      if (!Array.isArray(parsed.alternativeCoverage)) {
        throw new Error("OpenAI structured response did not contain exhaustive alternative coverage.");
      }
      const normalizedResponse: HypothesisProposalResponse = {
        providerId: this.providerId,
        hypotheses: parsed.hypotheses.map((hypothesis) => {
          const claim = hypothesis.claims?.[0];
          if (!claim) throw new Error("OpenAI hypothesis did not contain exactly one claim.");
          return {
            ...hypothesis,
            id: stableLiveProposalId(hypothesis.topicRef, claim.key, claim.value),
          };
        }),
        alternativeCoverage: structuredClone(parsed.alternativeCoverage),
      };
      this.attempts.push(audit("completed", null, normalizedResponse));
      return normalizedResponse;
    } catch (error) {
      if (this.attempts.length === 0 || this.attempts.at(-1)?.startedAt !== startedAt) {
        const failure = error instanceof Error ? error.message : String(error);
        const outcome = httpStatus === null ? "transport_failure" : "response_validation_failure";
        this.attempts.push(audit(outcome, failure));
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    function audit(
      outcome: LiveProviderAttemptAudit["outcome"],
      failure: string | null,
      normalizedResponse: HypothesisProposalResponse | null = null,
    ): LiveProviderAttemptAudit {
      const envelope = asRecord(fullProviderResponse);
      return {
        attemptNumber: 1,
        automaticRetryCount: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        endpoint,
        exactDeveloperPrompt: LIVE_HYPOTHESIS_DEVELOPER_PROMPT,
        exactSourceBoundPacket: structuredClone(request),
        exactRequestBody: structuredClone(exactRequestBody),
        httpStatus,
        providerRequestId,
        returnedModel: typeof envelope.model === "string" ? envelope.model : null,
        providerResponseId: typeof envelope.id === "string" ? envelope.id : null,
        fullProviderResponse: structuredClone(fullProviderResponse),
        normalizedResponse: normalizedResponse === null ? null : structuredClone(normalizedResponse),
        outcome,
        failure,
      };
    }
  }
}

export function assertLiveEvaluationPacketSafe(request: HypothesisProposalRequest): void {
  if (request.schemaVersion !== HYPOTHESIS_PROPOSAL_SCHEMA) {
    throw new Error(`Live evaluation requires ${HYPOTHESIS_PROPOSAL_SCHEMA}.`);
  }
  if (!request.sourceDocument.sourceDocumentRef.startsWith("approved-evaluation-document:")) {
    throw new Error("Live evaluation requires an opaque approved-evaluation document reference.");
  }
  if (request.inferenceTopics.length !== 1) {
    throw new Error("Live evaluation packets must contain exactly one RateReveal-owned topic.");
  }
  const topicRefs = new Set(request.inferenceTopics[0]!.observationRefs);
  const observationRefs = new Set(request.observations.map((observation) => observation.observationRef));
  if (topicRefs.size !== observationRefs.size || [...topicRefs].some((reference) => !observationRefs.has(reference))) {
    throw new Error("Live evaluation packet contains observations outside the selected topic.");
  }
  if (request.allowedObservationRefs.length !== observationRefs.size
      || request.allowedObservationRefs.some((reference) => !observationRefs.has(reference))) {
    throw new Error("Live evaluation packet exposes observation references outside the selected topic.");
  }
  if (request.observations.length > 24) throw new Error("Live evaluation observation bound exceeded.");
  const serialized = JSON.stringify(request);
  const prohibited = [
    /\b(?:routing|transit)\s*(?:number|no\.?|#)?\s*[:#-]?\s*\d{6,}\b/i,
    /\b(?:account|acct)\s*(?:number|no\.?|#)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i,
    /\b(?:tax\s*id|ein|ssn)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i,
    /\b(?:cardholder|card\s*number|pan)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/i,
    /\b(?:phone|telephone|mobile)\s*[:#-]?\s*\+?[\d(). -]{7,}\b/i,
  ];
  if (prohibited.some((pattern) => pattern.test(serialized))) {
    throw new Error("Live evaluation packet contains a prohibited identity or financial-account field.");
  }
}

function extractOutputText(envelope: Record<string, unknown>): string {
  const output = Array.isArray(envelope.output) ? envelope.output : [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item).content) ? asRecord(item).content as unknown[] : [];
    for (const part of content) {
      const value = asRecord(part);
      if (value.type === "output_text" && typeof value.text === "string") return value.text;
    }
  }
  throw new Error("OpenAI response did not contain output text.");
}

function safeProviderFailure(value: unknown, fallback: string): string {
  const error = asRecord(asRecord(value).error);
  const type = typeof error.type === "string" ? error.type : null;
  const code = typeof error.code === "string" ? error.code : null;
  return [fallback, type, code].filter((part): part is string => part !== null).join(":");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
