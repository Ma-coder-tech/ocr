import { createRequire } from "node:module";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  failedWholeStatementFeeIntelligenceOutput,
  validateWholeStatementFeeIntelligenceReview,
  type ApprovedWholeStatementFeeIntelligenceSourceRegistry,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "./wholeStatementFeeIntelligenceReview.js";
import { buildFeeKnowledgeSourcePacket } from "./feeKnowledgeRegistry.js";
import {
  defaultFeeKnowledgeResearchQuestions,
  runFeeKnowledgeResearch,
  type FeeKnowledgeResearchOptions,
} from "./feeKnowledgeResearch.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalStatementAnalysis,
} from "./types.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type RuntimeProvider = "anthropic" | "openai";
type RuntimeProviderPreference = RuntimeProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type WholeStatementFeeIntelligenceRuntimeAdapter = (
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  context: { abortSignal: AbortSignal },
) => Promise<unknown>;

export type WholeStatementFeeIntelligenceRuntimeOptions = {
  enabled?: boolean;
  provider?: RuntimeProviderPreference;
  apiKey?: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  modelName?: string;
  anthropicModelName?: string;
  openAiModelName?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  sdk?: AiSdk;
  adapter?: WholeStatementFeeIntelligenceRuntimeAdapter;
  sourceRegistry?: ApprovedWholeStatementFeeIntelligenceSourceRegistry;
  feeKnowledgeResearch?: FeeKnowledgeResearchOptions;
};

export function wholeStatementFeeIntelligenceProviderAdapter(
  options: WholeStatementFeeIntelligenceRuntimeOptions = {},
): WholeStatementFeeIntelligenceRuntimeAdapter {
  return (packet, context) => executeProviderReview(packet, options, context.abortSignal);
}

export async function runWholeStatementFeeIntelligenceRuntime(input: {
  analysis: CanonicalStatementAnalysis;
  options?: WholeStatementFeeIntelligenceRuntimeOptions;
}): Promise<CanonicalAiWholeStatementFeeIntelligenceOutput> {
  const options = input.options ?? {};
  const registry = options.sourceRegistry ?? { approvedExternalSourceRefs: [] };
  if (!runtimeEnabled(options)) {
    return failedWholeStatementFeeIntelligenceOutput(
      input.analysis,
      "disabled",
      "whole_statement_fee_intelligence_disabled",
    );
  }
  const research = await runFeeKnowledgeResearch({
    analysis: input.analysis,
    registry,
    questions: defaultFeeKnowledgeResearchQuestions(input.analysis, registry),
    options: options.feeKnowledgeResearch,
  });
  const sourceProvenancePacket = buildFeeKnowledgeSourcePacket({
    analysis: input.analysis,
    registry,
    runtimeClaimSupports: research.claimSupports,
    researchAttempts: research.attempts,
    researchCandidates: research.candidates,
  });
  const packet = buildWholeStatementFeeIntelligencePacket(input.analysis, registry, sourceProvenancePacket);

  if (packet.admittedFeeRows.length === 0) {
    return failedWholeStatementFeeIntelligenceOutput(
      input.analysis,
      "failed",
      "whole_statement_fee_intelligence_no_admitted_fee_rows",
    );
  }

  try {
    const timeoutMs = options.timeoutMs ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_TIMEOUT_MS ?? 12000);
    const raw = await withAbortTimeout(
      (abortSignal) => (options.adapter ? options.adapter(packet, { abortSignal }) : executeProviderReview(packet, options, abortSignal)),
      timeoutMs,
    );
    const validation = validateWholeStatementFeeIntelligenceReview(raw, input.analysis, registry, sourceProvenancePacket);
    return validation.output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const timedOut = /timed out|timeout/i.test(message);
    return failedWholeStatementFeeIntelligenceOutput(
      input.analysis,
      timedOut ? "timed_out" : "failed",
      timedOut ? "whole_statement_fee_intelligence_timed_out" : "whole_statement_fee_intelligence_failed",
    );
  }
}

async function executeProviderReview(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  options: WholeStatementFeeIntelligenceRuntimeOptions,
  abortSignal: AbortSignal,
): Promise<unknown> {
  const attempts = providerAttempts(options);
  if (attempts.length === 0) {
    return {
      type: "whole_statement_fee_intelligence_review",
      reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
      reviewStatus: "disabled",
      evidenceRefs: [],
      factRefs: [],
      limitationCodes: ["whole_statement_fee_intelligence_review_required", "provider_unavailable"],
      rowInterpretations: [],
      reasonCodes: ["whole_statement_fee_intelligence_provider_unavailable"],
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    };
  }

  const sdk = options.sdk ?? loadAiSdk();
  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const prompt = buildPrompt(packet);
      if (attempt.provider === "openai") {
        if (!sdk.generateText || !sdk.Output) throw new Error("Structured output unavailable.");
        const result = await sdk.generateText({
          model: modelFor(attempt.provider, attempt.modelName, options, sdk),
          prompt,
          experimental_output: sdk.Output.object({
            schema: reviewResponseSchema(),
            name: "whole_statement_fee_intelligence_review",
            description: "Provider-neutral every-row fee semantic review.",
          }),
          abortSignal,
          maxOutputTokens: options.maxOutputTokens ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_OUTPUT_TOKENS ?? 5000),
        });
        return result.output;
      }
      const result = await sdk.generateObject({
        model: modelFor(attempt.provider, attempt.modelName, options, sdk),
        schema: reviewResponseSchema(),
        prompt,
        abortSignal,
        maxOutputTokens: options.maxOutputTokens ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_OUTPUT_TOKENS ?? 5000),
      });
      return result.object;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("Whole-statement fee intelligence provider failed.");
}

function buildPrompt(packet: CanonicalWholeStatementFeeIntelligencePacket): string {
  return [
    "Review every admitted merchant-statement fee row in this sanitized canonical packet.",
    "Return only the requested structured object. Do not include amounts, totals, merchant identifiers, provider names, model names, prompts, raw text, file paths, customer-facing wording, opportunity, savings, state, permissions, or actions.",
    "For each admittedFeeRows item, return exactly one rowInterpretations item with the same feeRowRef and row-scoped evidenceRefs.",
    "Use approved_external_documentation or runtime_verified_documentation only when the row-scoped sourceProvenancePacket permits the exact source/claim-support reference. Otherwise use statement_evidence, industry_inference, merchant_evidence, or human_review.",
    "Industry inference must be limited and cannot support potentially_actionable.",
    JSON.stringify(packet),
  ].join("\n\n");
}

function reviewResponseSchema(): unknown {
  const { z } = require("zod/v3") as { z: any };
  const interpretation = z
    .object({
      feeRowRef: z.string(),
      proposedCategory: z.enum([
        "interchange",
        "card_brand_network_assessment",
        "network_access_or_authorization",
        "processor_markup",
        "processor_per_item_fee",
        "administrative_fee",
        "service_fee",
        "compliance_fee",
        "equipment_or_lease",
        "third_party_product",
        "chargeback_or_dispute",
        "funding_adjustment",
        "tax_or_government",
        "credit",
        "unknown_needs_review",
      ]),
      likelyEconomicOwner: z.enum([
        "network",
        "card_brand",
        "issuer_or_interchange",
        "processor",
        "third_party",
        "merchant_contract",
        "tax_or_government",
        "unknown",
      ]),
      likelyContractualController: z.enum([
        "network",
        "card_brand",
        "issuer_or_interchange",
        "processor",
        "third_party",
        "merchant_contract",
        "tax_or_government",
        "unknown",
      ]),
      proposedActionabilityCeiling: z.enum(["potentially_actionable", "verify_only", "not_actionable", "unknown"]),
      confidence: z.enum(["high", "medium", "low"]),
      conciseRationale: z.string(),
      evidenceProvenance: z.enum([
        "statement_evidence",
        "approved_external_documentation",
        "runtime_verified_documentation",
        "industry_inference",
        "merchant_evidence",
        "human_review",
      ]),
      evidenceRefs: z.array(z.string()),
      externalSourceRef: z.string().nullable(),
      externalClaimSupportRef: z.string().nullable().optional(),
      conflicts: z.array(z.string()),
      missingEvidence: z.array(z.string()),
      recommendedDisposition: z.enum(["supported", "insufficient_evidence", "conflicting_evidence", "human_review"]),
      authoritative: z.literal(false),
    })
    .strict();
  return z
    .object({
      type: z.literal("whole_statement_fee_intelligence_review"),
      reviewPolicyVersion: z.literal(WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION),
      reviewStatus: z.literal("completed"),
      evidenceRefs: z.array(z.string()),
      factRefs: z.array(z.string()),
      limitationCodes: z.array(
        z.enum([
          "full_statement_anomaly_review_required",
          "whole_statement_fee_intelligence_review_required",
          "material_fee_classification_review_required",
          "notice_change_review_required",
          "benchmark_category_review_required",
          "benchmark_category_not_verified",
          "ai_narrative_unavailable",
          "ai_output_rejected",
          "provider_unavailable",
          "deterministic_explanation_available",
        ]),
      ),
      rowInterpretations: z.array(interpretation),
      reasonCodes: z.array(z.string().regex(/^whole_statement_fee_intelligence_[a-z0-9_]{1,90}$/)),
      authoritative: z.literal(false),
      financialMutationAllowed: z.literal(false),
      providerDetailsStripped: z.literal(true),
    })
    .strict();
}

function loadAiSdk(): AiSdk {
  const ai = require("ai") as { generateObject: GenerateObject; generateText: GenerateText; Output: AiOutputFactory };
  const anthropicSdk = require("@ai-sdk/anthropic") as { createAnthropic: AiProviderFactoryCreator };
  const openAiSdk = require("@ai-sdk/openai") as { createOpenAI: AiProviderFactoryCreator };
  return {
    generateObject: ai.generateObject,
    generateText: ai.generateText,
    Output: ai.Output,
    createAnthropic: anthropicSdk.createAnthropic,
    createOpenAI: openAiSdk.createOpenAI,
  };
}

function runtimeEnabled(options: WholeStatementFeeIntelligenceRuntimeOptions): boolean {
  return options.enabled ?? /^(1|true|yes|on)$/i.test(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ENABLED ?? "");
}

function providerAttempts(options: WholeStatementFeeIntelligenceRuntimeOptions): Array<{ provider: RuntimeProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: RuntimeProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({ provider, modelName: modelNameForProvider(provider, options) }));
}

function providerPreference(options: WholeStatementFeeIntelligenceRuntimeOptions): RuntimeProviderPreference {
  const configured = options.provider ?? process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: RuntimeProvider, options: WholeStatementFeeIntelligenceRuntimeOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: RuntimeProvider, options: WholeStatementFeeIntelligenceRuntimeOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function modelFor(provider: RuntimeProvider, modelName: string, options: WholeStatementFeeIntelligenceRuntimeOptions, sdk: AiSdk): unknown {
  const key = providerApiKey(provider, options);
  if (provider === "anthropic") {
    const factory = key && sdk.createAnthropic ? sdk.createAnthropic({ apiKey: key }) : undefined;
    if (!factory) throw new Error("Anthropic model factory unavailable.");
    return factory(modelName);
  }
  const factory = key && sdk.createOpenAI ? sdk.createOpenAI({ apiKey: key }) : undefined;
  if (!factory) throw new Error("OpenAI model factory unavailable.");
  return factory(modelName);
}

async function withAbortTimeout<T>(operation: (abortSignal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const promise = operation(controller.signal);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  const timeoutError = new Error(`Whole-statement fee intelligence review timed out after ${timeoutMs}ms`);
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (settled) return;
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    settled = true;
    if (timer) clearTimeout(timer);
  }
}
