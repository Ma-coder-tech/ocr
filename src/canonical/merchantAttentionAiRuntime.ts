import { createRequire } from "node:module";
import {
  admitMerchantAttentionAiInterpretation,
  buildMerchantAttentionAiInterpretationPacket,
  merchantAttentionAiAdmissionDiagnosticCodes,
  type MerchantAttentionAiInterpretationPacket,
} from "./merchantAttentionAiInterpretation.js";
import type {
  CanonicalMerchantAttentionAiInterpretationOutput,
  CanonicalMerchantAttentionModel,
} from "./types.js";

const require = createRequire(import.meta.url);
const MERCHANT_LANGUAGE_AI_MAX_TIMEOUT_MS = 120_000;

type RuntimeProvider = "anthropic" | "openai";
type ProviderPreference = RuntimeProvider | "auto";
type ProviderUsage = {
  inputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  cachedInputTokens?: number;
  outputTokens?: number;
};
type ProviderResult = { object?: unknown; output?: unknown; usage?: ProviderUsage; response?: { id?: string } };
type AiSdk = {
  generateObject: (options: Record<string, unknown>) => Promise<ProviderResult>;
  generateText?: (options: Record<string, unknown>) => Promise<ProviderResult>;
  Output?: { object: (options: Record<string, unknown>) => unknown };
  createAnthropic?: (options: { apiKey?: string }) => (modelName: string) => unknown;
  createOpenAI?: (options: { apiKey?: string }) => (modelName: string) => unknown;
};

export type MerchantAttentionAiRuntimeAdapter = (
  packet: MerchantAttentionAiInterpretationPacket,
  context: { abortSignal: AbortSignal },
) => Promise<unknown>;

export type MerchantAttentionAiProviderUsage = {
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

export type MerchantAttentionAiRuntimeOptions = {
  enabled?: boolean;
  provider?: ProviderPreference;
  apiKey?: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  modelName?: string;
  anthropicModelName?: string;
  openAiModelName?: string;
  maxInputBytes?: number;
  maxItemsPerRequest?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
  adapter?: MerchantAttentionAiRuntimeAdapter;
  sdk?: AiSdk;
  onProviderUsage?: (usage: MerchantAttentionAiProviderUsage) => void;
};

export type MerchantAttentionAiRuntimeResult = {
  status: "disabled" | "not_needed" | "provider_unavailable" | "admitted" | "rejected" | "timed_out" | "failed";
  attempted: boolean;
  eligibleItemCount: number;
  admittedItemCount: number;
  reasonCodes: string[];
  model: CanonicalMerchantAttentionModel;
};

export type MerchantAttentionAiRuntimeProviderSelection = {
  provider: RuntimeProvider | "custom_adapter" | "none";
  model: string | null;
};

export async function runMerchantAttentionAiRuntime(input: {
  model: CanonicalMerchantAttentionModel;
  options?: MerchantAttentionAiRuntimeOptions;
}): Promise<MerchantAttentionAiRuntimeResult> {
  const options = input.options ?? {};
  const packet = buildMerchantAttentionAiInterpretationPacket(input.model);
  const eligibleItemCount = packet.items.length;
  if (!runtimeEnabled(options)) return fallback("disabled", false, eligibleItemCount, input.model, "merchant_language_ai_disabled");
  if (eligibleItemCount === 0) return fallback("not_needed", false, 0, input.model, "merchant_language_ai_no_eligible_items");

  try {
    assertPrivacyBoundary(packet);
  } catch {
    return fallback("rejected", false, eligibleItemCount, input.model, "merchant_language_ai_privacy_rejected");
  }
  const limit = options.maxInputBytes ?? Number(process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_MAX_INPUT_BYTES ?? 90000);
  let itemsPerRequest: number;
  try {
    itemsPerRequest = boundedPositiveInteger(
      options.maxItemsPerRequest ?? Number(process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_MAX_ITEMS_PER_REQUEST ?? 12),
      25,
      "Merchant-language AI item batch limit",
    );
  } catch {
    return fallback("rejected", false, eligibleItemCount, input.model, "merchant_language_ai_input_limit_rejected");
  }
  const packets = chunkPacket(packet, itemsPerRequest);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 200000 || packets.some((candidate) => Buffer.byteLength(JSON.stringify(candidate), "utf8") > limit)) {
    return fallback("rejected", false, eligibleItemCount, input.model, "merchant_language_ai_input_limit_rejected");
  }
  if (!options.adapter && providerAttempts(options).length === 0) {
    return fallback("provider_unavailable", false, eligibleItemCount, input.model, "merchant_language_ai_provider_unavailable");
  }

  try {
    const timeoutMs = boundedPositiveInteger(
      options.timeoutMs ?? Number(process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_TIMEOUT_MS ?? 8000),
      MERCHANT_LANGUAGE_AI_MAX_TIMEOUT_MS,
      "Merchant-language AI timeout",
    );
    const parsedOutputs: CanonicalMerchantAttentionAiInterpretationOutput[] = [];
    for (const requestPacket of packets) {
      const raw = await withAbortTimeout(
        (abortSignal) => options.adapter
          ? options.adapter(requestPacket, { abortSignal })
          : executeProvider(requestPacket, options, abortSignal),
        timeoutMs,
      );
      const parsed = parseProviderOutput(raw);
      if (!parsed) return fallback("rejected", true, eligibleItemCount, input.model, "merchant_language_ai_schema_rejected");
      parsedOutputs.push(parsed);
    }
    const combined: CanonicalMerchantAttentionAiInterpretationOutput = {
      type: "merchant_attention_ai_interpretation",
      policyVersion: "merchant_attention_ai_interpretation_v1",
      outputId: "merchant_language_runtime_combined",
      items: parsedOutputs.flatMap((output) => output.items),
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    };
    const admission = admitMerchantAttentionAiInterpretation({ model: input.model, output: combined });
    if (!admission.admitted) {
      const diagnosticCodes = merchantAttentionAiAdmissionDiagnosticCodes(admission.errors)
        .map((code) => `merchant_language_ai_rejection_${code}`);
      return fallback(
        "rejected",
        true,
        eligibleItemCount,
        input.model,
        "merchant_language_ai_semantic_admission_rejected",
        diagnosticCodes,
      );
    }
    return {
      status: "admitted",
      attempted: true,
      eligibleItemCount,
      admittedItemCount: admission.model.interpretation.coverage.admittedItemCount,
      reasonCodes: ["merchant_language_ai_admitted"],
      model: admission.model,
    };
  } catch (error) {
    const timedOut = /timed out|timeout/i.test(error instanceof Error ? error.message : "");
    return fallback(
      timedOut ? "timed_out" : "failed",
      true,
      eligibleItemCount,
      input.model,
      timedOut ? "merchant_language_ai_timed_out" : "merchant_language_ai_provider_failed",
    );
  }
}

function fallback(
  status: MerchantAttentionAiRuntimeResult["status"],
  attempted: boolean,
  eligibleItemCount: number,
  model: CanonicalMerchantAttentionModel,
  reasonCode: string,
  diagnosticCodes: readonly string[] = [],
): MerchantAttentionAiRuntimeResult {
  return {
    status,
    attempted,
    eligibleItemCount,
    admittedItemCount: 0,
    reasonCodes: [...new Set([reasonCode, ...diagnosticCodes])].sort(),
    model,
  };
}

function chunkPacket(
  packet: MerchantAttentionAiInterpretationPacket,
  itemsPerRequest: number,
): MerchantAttentionAiInterpretationPacket[] {
  const packets: MerchantAttentionAiInterpretationPacket[] = [];
  for (let index = 0; index < packet.items.length; index += itemsPerRequest) {
    packets.push({ ...packet, items: packet.items.slice(index, index + itemsPerRequest) });
  }
  return packets;
}

async function executeProvider(
  packet: MerchantAttentionAiInterpretationPacket,
  options: MerchantAttentionAiRuntimeOptions,
  abortSignal: AbortSignal,
): Promise<unknown> {
  const sdk = options.sdk ?? loadSdk();
  let lastError: Error | null = null;
  for (const attempt of providerAttempts(options)) {
    try {
      const prompt = buildPrompt(packet);
      const common = {
        model: providerModel(attempt.provider, attempt.modelName, options, sdk),
        prompt,
        abortSignal,
        maxOutputTokens: boundedPositiveInteger(
          options.maxOutputTokens ?? Number(process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_MAX_OUTPUT_TOKENS ?? 6000),
          12000,
          "Merchant-language AI output limit",
        ),
        maxRetries: Math.min(Math.max(options.maxRetries ?? 1, 0), 2),
      };
      const result = attempt.provider === "openai"
        ? await sdk.generateText!({
            ...common,
            output: sdk.Output!.object({ schema: responseSchema(), name: "merchant_attention_ai_interpretation" }),
            providerOptions: { openai: { store: false } },
            experimental_telemetry: { isEnabled: false },
          })
        : await sdk.generateObject({ ...common, schema: responseSchema() });
      try { options.onProviderUsage?.(usage(result)); } catch { /* Observability must not change report admission. */ }
      return attempt.provider === "openai" ? result.output : result.object;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Merchant-language provider failed.");
    }
  }
  throw lastError ?? new Error("Merchant-language provider unavailable.");
}

function buildPrompt(packet: MerchantAttentionAiInterpretationPacket): string {
  return [
    "Rewrite only the accepted structured meanings below into concise merchant-friendly language.",
    "Preserve every negation, uncertainty, modality, conditional, time boundary, and evidentiary scope exactly.",
    "Never create or alter amounts, evidence, benchmarks, savings, contract terms, removability, or actionability.",
    "Use: Ask for a breakdown; Needs an explanation; What still needs checking; What your statement shows; What this likely means; What we still need to confirm.",
    "Do not use internal package, policy, provider, prompt, model, file, or path language.",
    "Return only the required structured object and include all eligible items exactly once.",
    JSON.stringify(packet),
  ].join("\n");
}

function responseSchema(): unknown {
  const { z } = require("zod/v3") as { z: any };
  const question = z.object({
    question: z.string().min(1).max(500),
    whatRateRevealKnows: z.string().min(1).max(800),
    whatRemainsUncertain: z.string().min(1).max(800),
    safeNextStep: z.string().min(1).max(800),
  }).strict().nullable();
  const toolkit = z.object({
    whatToDo: z.string().min(1).max(800),
    why: z.string().min(1).max(800),
    exactAsk: z.string().max(1200).nullable(),
    unclearAnswerFollowUp: z.string().max(1200).nullable(),
    avoidClaiming: z.array(z.string().min(1).max(500)).max(12),
    successCriteria: z.array(z.string().min(1).max(500)).max(12),
  }).strict().nullable();
  return z.object({
    type: z.literal("merchant_attention_ai_interpretation"),
    policyVersion: z.literal("merchant_attention_ai_interpretation_v1"),
    outputId: z.string().regex(/^merchant_language_[a-z0-9_-]{1,80}$/),
    items: z.array(z.object({
      attentionItemId: z.string().min(1).max(160),
      merchantTitle: z.string().min(1).max(300),
      whyThisDeservesAttention: z.string().min(1).max(1200),
      reasonableConclusion: z.string().min(1).max(1200),
      remainingUncertainty: z.array(z.string().min(1).max(600)).max(20),
      safeNextAction: z.string().min(1).max(1200),
      resolutionMeaning: z.string().min(1).max(1200),
      question,
      actionToolkit: toolkit,
      semanticSupportRefs: z.array(z.string().min(1).max(200)).max(80),
    }).strict()).max(100),
    authoritative: z.literal(false),
    financialMutationAllowed: z.literal(false),
    providerDetailsStripped: z.literal(true),
  }).strict();
}

function parseProviderOutput(value: unknown): CanonicalMerchantAttentionAiInterpretationOutput | null {
  const result = (responseSchema() as { safeParse: (input: unknown) => { success: boolean; data?: unknown } }).safeParse(value);
  return result.success ? result.data as CanonicalMerchantAttentionAiInterpretationOutput : null;
}

function assertPrivacyBoundary(packet: MerchantAttentionAiInterpretationPacket): void {
  if (
    packet.privacy.directMerchantIdentityIncluded ||
    packet.privacy.accountIdentifiersIncluded ||
    packet.privacy.sourceDocumentIncluded ||
    packet.privacy.rawStatementTextIncluded
  ) throw new Error("Merchant-language AI privacy boundary failed.");
  const serialized = JSON.stringify(packet);
  if (/"(?:filePath|sourcePath|merchantName|merchantIdentifier|accountNumber)"|\.pdf\b|[/\\](?:Users|private|tmp)[/\\]/i.test(serialized)) {
    throw new Error("Merchant-language AI privacy boundary failed.");
  }
}

function runtimeEnabled(options: MerchantAttentionAiRuntimeOptions): boolean {
  if (options.enabled !== undefined) return options.enabled;
  const configured = process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_ENABLED;
  return configured === undefined ? true : /^(1|true|yes|on)$/i.test(configured);
}

function providerAttempts(options: MerchantAttentionAiRuntimeOptions): Array<{ provider: RuntimeProvider; modelName: string }> {
  const configured = options.provider ?? process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_PROVIDER ?? "auto";
  const preference: ProviderPreference = configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
  const providers: RuntimeProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers.filter((provider) => Boolean(providerKey(provider, options))).map((provider) => ({
    provider,
    modelName: provider === "anthropic"
      ? options.anthropicModelName ?? options.modelName ?? process.env.RATEREVEAL_MERCHANT_LANGUAGE_ANTHROPIC_MODEL ?? "claude-opus-4-8"
      : options.openAiModelName ?? options.modelName ?? process.env.RATEREVEAL_MERCHANT_LANGUAGE_OPENAI_MODEL ?? "gpt-5.4-mini",
  }));
}

export function merchantAttentionAiRuntimeProviderSelection(
  options: MerchantAttentionAiRuntimeOptions = {},
): MerchantAttentionAiRuntimeProviderSelection {
  if (options.adapter) return { provider: "custom_adapter", model: null };
  const attempt = providerAttempts(options)[0];
  return attempt ? { provider: attempt.provider, model: attempt.modelName } : { provider: "none", model: null };
}

function providerKey(provider: RuntimeProvider, options: MerchantAttentionAiRuntimeOptions): string | undefined {
  return provider === "anthropic"
    ? options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY
    : options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function providerModel(provider: RuntimeProvider, modelName: string, options: MerchantAttentionAiRuntimeOptions, sdk: AiSdk): unknown {
  const key = providerKey(provider, options);
  const factory = provider === "anthropic" ? sdk.createAnthropic : sdk.createOpenAI;
  if (!key || !factory) throw new Error("Merchant-language provider factory unavailable.");
  return factory({ apiKey: key })(modelName);
}

function loadSdk(): AiSdk {
  const ai = require("ai") as AiSdk;
  const anthropic = require("@ai-sdk/anthropic") as Pick<AiSdk, "createAnthropic">;
  const openai = require("@ai-sdk/openai") as Pick<AiSdk, "createOpenAI">;
  return { ...ai, ...anthropic, ...openai };
}

function usage(result: ProviderResult): MerchantAttentionAiProviderUsage {
  const integer = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
  return {
    requestId: typeof result.response?.id === "string" && result.response.id ? result.response.id : null,
    inputTokens: integer(result.usage?.inputTokens),
    cachedInputTokens: integer(result.usage?.inputTokenDetails?.cacheReadTokens ?? result.usage?.cachedInputTokens) ?? 0,
    outputTokens: integer(result.usage?.outputTokens),
  };
}

async function withAbortTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation(controller.signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Merchant-language AI timed out after ${timeoutMs}ms`);
          controller.abort(error);
          reject(error);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function boundedPositiveInteger(value: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) throw new Error(`${label} is outside the approved bound.`);
  return value;
}
