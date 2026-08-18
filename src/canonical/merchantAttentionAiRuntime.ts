import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  admitMerchantAttentionAiInterpretation,
  buildMerchantAttentionAiInterpretationPacket,
  merchantAttentionAiAdmissionDiagnosticCodes,
  stabilizeMerchantAttentionAiInterpretation,
  type MerchantAttentionAiInterpretationPacket,
} from "./merchantAttentionAiInterpretation.js";
import type {
  CanonicalMerchantAttentionAiInterpretationOutput,
  CanonicalMerchantAttentionModel,
} from "./types.js";
import {
  SafeProviderFailureError,
  safeProviderFailureAccounting,
  safeProviderFailureError,
  safeProviderReasonCodes,
  type SafeProviderFailureOperationPhase,
} from "./providerFailureDiagnostics.js";

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
type ProviderResult = {
  object?: unknown;
  output?: unknown;
  usage?: ProviderUsage;
  response?: { id?: string };
  finishReason?: string;
  rawFinishReason?: string;
};
type AiProviderFetch = typeof fetch;
type AiSdk = {
  generateObject: (options: Record<string, unknown>) => Promise<ProviderResult>;
  generateText?: (options: Record<string, unknown>) => Promise<ProviderResult>;
  Output?: { object: (options: Record<string, unknown>) => unknown };
  createAnthropic?: (options: { apiKey?: string; headers?: Record<string, string>; fetch?: AiProviderFetch }) => (modelName: string) => unknown;
  createOpenAI?: (options: { apiKey?: string; headers?: Record<string, string>; fetch?: AiProviderFetch }) => (modelName: string) => unknown;
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
  finishReason: string | null;
  rawFinishReason: string | null;
  structuredOutputReceived: boolean;
  generationCompleted: boolean;
  outputIncomplete: boolean;
  transportAttemptCount: number;
  providerResponseCount: number;
  retryCount: number;
  reasonCodes: string[];
};

export type MerchantAttentionAiProviderDiagnostics = {
  requestBatchCount: number;
  completedRequestBatchCount: number;
  processedItemCount: number;
  transportAttemptCount: number;
  providerResponseCount: number;
  structuredResponseCount: number;
  retryCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  incompleteOutputCount: number;
  schemaValidationFailureCount: number;
  semanticStabilizationApplied: boolean;
  admittedGeneratedFieldCount: number;
  canonicalFieldSubstitutionCount: number;
  safeReasonCodes: string[];
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
  diagnostics: MerchantAttentionAiProviderDiagnostics;
};

type ProviderTransportTrace = {
  localTraceId: string;
  transport: "ai_sdk_generate_text_structured_output" | "ai_sdk_generate_object_structured_output";
  httpSendInitiated: boolean;
  providerResponseReceived: boolean;
  httpStatus: number | null;
  requestId: string | null;
  transportAttemptCount: number;
  providerResponseCount: number;
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

  const providerUsages: MerchantAttentionAiProviderUsage[] = [];
  let completedRequestBatchCount = 0;
  let processedItemCount = 0;
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
          : executeProvider(requestPacket, {
              ...options,
              onProviderUsage: (usage) => {
                providerUsages.push(usage);
                options.onProviderUsage?.(usage);
              },
            }, abortSignal),
        timeoutMs,
      );
      const parsed = parseProviderOutput(raw, requestPacket);
      if (!parsed) {
        return fallback(
          "rejected",
          true,
          eligibleItemCount,
          input.model,
          "merchant_language_ai_schema_rejected",
          [],
          summarizeProviderDiagnostics(packets.length, completedRequestBatchCount, processedItemCount, providerUsages, undefined, 1),
        );
      }
      parsedOutputs.push(parsed);
      completedRequestBatchCount += 1;
      processedItemCount += parsed.items.length;
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
    let admission = admitMerchantAttentionAiInterpretation({ model: input.model, output: combined });
    let semanticStabilizationApplied = false;
    let admittedGeneratedFieldCount = 0;
    let canonicalFieldSubstitutionCount = 0;
    if (!admission.admitted) {
      const stabilized = stabilizeMerchantAttentionAiInterpretation({ model: input.model, output: combined });
      if (stabilized) {
        admission = admitMerchantAttentionAiInterpretation({ model: input.model, output: stabilized.output });
        semanticStabilizationApplied = admission.admitted;
        admittedGeneratedFieldCount = stabilized.admittedGeneratedFieldCount;
        canonicalFieldSubstitutionCount = stabilized.canonicalFieldSubstitutionCount;
      }
    }
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
        summarizeProviderDiagnostics(packets.length, completedRequestBatchCount, processedItemCount, providerUsages),
      );
    }
    return {
      status: "admitted",
      attempted: true,
      eligibleItemCount,
      admittedItemCount: admission.model.interpretation.coverage.admittedItemCount,
      reasonCodes: [
        "merchant_language_ai_admitted",
        ...(semanticStabilizationApplied ? ["merchant_language_ai_admitted_with_canonical_field_stabilization"] : []),
      ],
      model: admission.model,
      diagnostics: summarizeProviderDiagnostics(
        packets.length,
        completedRequestBatchCount,
        processedItemCount,
        providerUsages,
        undefined,
        0,
        { semanticStabilizationApplied, admittedGeneratedFieldCount, canonicalFieldSubstitutionCount },
      ),
    };
  } catch (error) {
    const timedOut = /timed out|timeout/i.test(error instanceof Error ? error.message : "");
    return fallback(
      timedOut ? "timed_out" : "failed",
      true,
      eligibleItemCount,
      input.model,
      timedOut ? "merchant_language_ai_timed_out" : "merchant_language_ai_provider_failed",
      safeProviderReasonCodes(error, timedOut ? "provider_call_timed_out" : "provider_structured_output_failed"),
      summarizeProviderDiagnostics(packets.length, completedRequestBatchCount, processedItemCount, providerUsages, error),
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
  diagnostics: MerchantAttentionAiProviderDiagnostics = emptyProviderDiagnostics(0),
): MerchantAttentionAiRuntimeResult {
  return {
    status,
    attempted,
    eligibleItemCount,
    admittedItemCount: 0,
    reasonCodes: [...new Set([reasonCode, ...diagnosticCodes])].sort(),
    model,
    diagnostics,
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
    const trace = createProviderTransportTrace(
      attempt.provider === "openai" ? "ai_sdk_generate_text_structured_output" : "ai_sdk_generate_object_structured_output",
    );
    let operationPhase: SafeProviderFailureOperationPhase = "request_serialization";
    try {
      operationPhase = "request_serialization";
      const prompt = buildPrompt(packet);
      operationPhase = "request_construction";
      const common = {
        model: providerModel(attempt.provider, attempt.modelName, options, sdk, trace),
        prompt,
        abortSignal,
        maxOutputTokens: boundedPositiveInteger(
          options.maxOutputTokens ?? Number(process.env.RATEREVEAL_MERCHANT_LANGUAGE_AI_MAX_OUTPUT_TOKENS ?? 6000),
          12000,
          "Merchant-language AI output limit",
        ),
        maxRetries: Math.min(Math.max(options.maxRetries ?? 1, 0), 2),
      };
      operationPhase = "request_initiation";
      const result = attempt.provider === "openai"
        ? await sdk.generateText!({
            ...common,
            output: sdk.Output!.object({ schema: responseSchema(packet), name: "merchant_attention_ai_interpretation" }),
            providerOptions: { openai: { store: false } },
            experimental_telemetry: { isEnabled: false },
          })
        : await sdk.generateObject({ ...common, schema: responseSchema(packet) });
      if (attempt.provider === "openai" && result.finishReason !== undefined && result.finishReason !== "stop") {
        try { options.onProviderUsage?.(usage(result, trace, false)); } catch { /* Observability must not change report admission. */ }
        throw safeProviderFailureError(result, traceResponse(trace), providerFailureContext(operationPhase, trace));
      }
      const output = attempt.provider === "openai" ? result.output : result.object;
      try { options.onProviderUsage?.(usage(result, trace, output !== undefined)); } catch { /* Observability must not change report admission. */ }
      return output;
    } catch (error) {
      lastError = error instanceof SafeProviderFailureError
        ? error
        : safeProviderFailureError(error, traceResponse(trace), providerFailureContext(operationPhase, trace));
    }
  }
  throw lastError ?? new Error("Merchant-language provider unavailable.");
}

function buildPrompt(packet: MerchantAttentionAiInterpretationPacket): string {
  return [
    "Rewrite only the accepted structured meanings below into concise merchant-friendly language.",
    "Preserve every negation, uncertainty, modality, conditional, time boundary, and evidentiary scope exactly.",
    "Process every input item exactly once, in input order, and copy each attentionItemId exactly.",
    "For each output field, use only meaning and vocabulary supported by that field's semanticSupportUnits canonicalMeaning.",
    "Copy every semanticSupportUnits supportRef exactly once into that item's semanticSupportRefs.",
    "Preserve the exact number of remainingUncertainty, avoidClaiming, and successCriteria entries and preserve required null/non-null shapes.",
    "If a plain-English rewrite cannot stay within the field's supported words and qualifications, copy that field's canonicalMeaning verbatim.",
    "Do not put digits or currency symbols in merchant-language fields; financial values remain in the authoritative report fields.",
    "Never create or alter amounts, evidence, benchmarks, savings, contract terms, removability, or actionability.",
    "Use: Ask for a breakdown; Needs an explanation; What still needs checking; What your statement shows; What this likely means; What we still need to confirm.",
    "Do not use internal package, policy, provider, prompt, model, file, or path language.",
    "Return only the required structured object and include all eligible items exactly once.",
    JSON.stringify(packet),
  ].join("\n");
}

function responseSchema(packet?: MerchantAttentionAiInterpretationPacket): unknown {
  const { z } = require("zod/v3") as { z: any };
  const language = (maximum: number, allowEmpty = false) => {
    const value = z.string().max(maximum).regex(/^[^0-9$€£¥]*$/);
    return allowEmpty ? value : value.min(1);
  };
  const question = z.object({
    question: language(500),
    whatRateRevealKnows: language(800),
    whatRemainsUncertain: language(800),
    safeNextStep: language(800),
  }).strict().nullable();
  const toolkit = z.object({
    whatToDo: language(800),
    why: language(800),
    exactAsk: language(1200, true).nullable(),
    unclearAnswerFollowUp: language(1200, true).nullable(),
    avoidClaiming: z.array(language(500)).max(12),
    successCriteria: z.array(language(500)).max(12),
  }).strict().nullable();
  const attentionItemId = packet && packet.items.length > 0
    ? z.enum(packet.items.map((item) => item.attentionItemId) as [string, ...string[]])
    : z.string().min(1).max(160);
  const items = z.array(z.object({
      attentionItemId,
      merchantTitle: language(300),
      whyThisDeservesAttention: language(1200),
      reasonableConclusion: language(1200),
      remainingUncertainty: z.array(language(600)).max(20),
      safeNextAction: language(1200),
      resolutionMeaning: language(1200),
      question,
      actionToolkit: toolkit,
      semanticSupportRefs: z.array(z.string().min(1).max(200)).max(80),
    }).strict()).max(100);
  const exactItems = packet ? items.length(packet.items.length) : items;
  return z.object({
    type: z.literal("merchant_attention_ai_interpretation"),
    policyVersion: z.literal("merchant_attention_ai_interpretation_v1"),
    outputId: z.string().regex(/^merchant_language_[a-z0-9_-]{1,80}$/),
    items: exactItems,
    authoritative: z.literal(false),
    financialMutationAllowed: z.literal(false),
    providerDetailsStripped: z.literal(true),
  }).strict();
}

function parseProviderOutput(
  value: unknown,
  packet?: MerchantAttentionAiInterpretationPacket,
): CanonicalMerchantAttentionAiInterpretationOutput | null {
  const result = (responseSchema(packet) as { safeParse: (input: unknown) => { success: boolean; data?: unknown } }).safeParse(value);
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

function providerModel(
  provider: RuntimeProvider,
  modelName: string,
  options: MerchantAttentionAiRuntimeOptions,
  sdk: AiSdk,
  trace: ProviderTransportTrace,
): unknown {
  const key = providerKey(provider, options);
  const factory = provider === "anthropic" ? sdk.createAnthropic : sdk.createOpenAI;
  if (!key || !factory) throw new Error("Merchant-language provider factory unavailable.");
  return factory({
    apiKey: key,
    headers: { "x-ratereveal-trace-id": trace.localTraceId },
    fetch: tracedProviderFetch(trace),
  })(modelName);
}

function loadSdk(): AiSdk {
  const ai = require("ai") as AiSdk;
  const anthropic = require("@ai-sdk/anthropic") as Pick<AiSdk, "createAnthropic">;
  const openai = require("@ai-sdk/openai") as Pick<AiSdk, "createOpenAI">;
  return { ...ai, ...anthropic, ...openai };
}

function usage(
  result: ProviderResult,
  trace: ProviderTransportTrace,
  structuredOutputReceived: boolean,
): MerchantAttentionAiProviderUsage {
  const integer = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
  const finishReason = safeCode(result.finishReason);
  const rawFinishReason = safeCode(result.rawFinishReason);
  const outputIncomplete = finishReason !== null && finishReason !== "stop";
  return {
    requestId: typeof result.response?.id === "string" && result.response.id ? result.response.id : null,
    inputTokens: integer(result.usage?.inputTokens),
    cachedInputTokens: integer(result.usage?.inputTokenDetails?.cacheReadTokens ?? result.usage?.cachedInputTokens) ?? 0,
    outputTokens: integer(result.usage?.outputTokens),
    finishReason,
    rawFinishReason,
    structuredOutputReceived,
    generationCompleted: finishReason === null || finishReason === "stop",
    outputIncomplete,
    transportAttemptCount: trace.transportAttemptCount,
    providerResponseCount: trace.providerResponseCount,
    retryCount: Math.max(0, trace.transportAttemptCount - 1),
    reasonCodes: [
      ...(finishReason ? [`provider_finish_reason_${finishReason}`] : []),
      ...(rawFinishReason ? [`provider_raw_finish_reason_${rawFinishReason}`] : []),
      structuredOutputReceived ? "provider_structured_output_received" : "provider_structured_output_not_received",
      outputIncomplete ? "provider_output_exhausted" : "provider_generation_completed",
    ],
  };
}

function createProviderTransportTrace(transport: ProviderTransportTrace["transport"]): ProviderTransportTrace {
  return {
    localTraceId: randomBytes(8).toString("hex"),
    transport,
    httpSendInitiated: false,
    providerResponseReceived: false,
    httpStatus: null,
    requestId: null,
    transportAttemptCount: 0,
    providerResponseCount: 0,
  };
}

function tracedProviderFetch(trace: ProviderTransportTrace): AiProviderFetch {
  return async (input, init) => {
    trace.httpSendInitiated = true;
    trace.transportAttemptCount += 1;
    const response = await globalThis.fetch(input, init);
    trace.providerResponseReceived = true;
    trace.providerResponseCount += 1;
    trace.httpStatus = response.status;
    trace.requestId = safeString(response.headers.get("x-request-id")) ?? trace.requestId;
    return response;
  };
}

function traceResponse(trace: ProviderTransportTrace): { status?: unknown; headers?: unknown } | undefined {
  if (!trace.providerResponseReceived) return undefined;
  return {
    status: trace.httpStatus,
    headers: trace.requestId ? { "x-request-id": trace.requestId } : undefined,
  };
}

function providerFailureContext(
  operationPhase: SafeProviderFailureOperationPhase,
  trace: ProviderTransportTrace,
) {
  return {
    operationPhase: trace.providerResponseReceived
      ? trace.httpStatus !== null && trace.httpStatus >= 400 ? "provider_response" as const : "sdk_structured_output_handling" as const
      : trace.httpSendInitiated ? "response_wait" as const : operationPhase,
    transport: trace.transport,
    localTraceId: trace.localTraceId,
    httpSendInitiated: trace.httpSendInitiated,
    providerResponseReceived: trace.providerResponseReceived,
    httpStatus: trace.httpStatus,
    requestId: trace.requestId,
    transportAttemptCount: trace.transportAttemptCount,
    providerResponseCount: trace.providerResponseCount,
  };
}

function summarizeProviderDiagnostics(
  requestBatchCount: number,
  completedRequestBatchCount: number,
  processedItemCount: number,
  usages: readonly MerchantAttentionAiProviderUsage[],
  error?: unknown,
  schemaValidationFailureCount = 0,
  stabilization: Pick<MerchantAttentionAiProviderDiagnostics, "semanticStabilizationApplied" | "admittedGeneratedFieldCount" | "canonicalFieldSubstitutionCount"> = {
    semanticStabilizationApplied: false,
    admittedGeneratedFieldCount: 0,
    canonicalFieldSubstitutionCount: 0,
  },
): MerchantAttentionAiProviderDiagnostics {
  const accounting = safeProviderFailureAccounting(error);
  const accountingAlreadyObserved = accounting !== null && usages.some((item) =>
    (accounting.requestId !== null && item.requestId === accounting.requestId)
    || (item.outputIncomplete && safeProviderReasonCodes(error, "provider_structured_output_failed").includes("provider_output_exhausted"))
  );
  const unobservedAccounting = accountingAlreadyObserved ? null : accounting;
  const reasonCodes = new Set(usages.flatMap((item) => item.reasonCodes));
  if (error !== undefined) safeProviderReasonCodes(error, "provider_structured_output_failed").forEach((code) => reasonCodes.add(code));
  return {
    requestBatchCount,
    completedRequestBatchCount,
    processedItemCount,
    transportAttemptCount: sumNumbers(usages.map((item) => item.transportAttemptCount)) + (unobservedAccounting?.transportAttemptCount ?? 0),
    providerResponseCount: sumNumbers(usages.map((item) => item.providerResponseCount)) + (unobservedAccounting?.providerResponseCount ?? 0),
    structuredResponseCount: usages.filter((item) => item.structuredOutputReceived).length,
    retryCount: sumNumbers(usages.map((item) => item.retryCount)) + (unobservedAccounting?.retryCount ?? 0),
    inputTokens: sumNumbers(usages.map((item) => item.inputTokens)) + (unobservedAccounting?.inputTokens ?? 0),
    cachedInputTokens: sumNumbers(usages.map((item) => item.cachedInputTokens)) + (unobservedAccounting?.cachedInputTokens ?? 0),
    outputTokens: sumNumbers(usages.map((item) => item.outputTokens)) + (unobservedAccounting?.outputTokens ?? 0),
    incompleteOutputCount: usages.filter((item) => item.outputIncomplete).length
      + (!accountingAlreadyObserved && error !== undefined && safeProviderReasonCodes(error, "provider_structured_output_failed").includes("provider_output_exhausted") ? 1 : 0),
    schemaValidationFailureCount,
    ...stabilization,
    safeReasonCodes: [...reasonCodes].sort(),
  };
}

function emptyProviderDiagnostics(requestBatchCount: number): MerchantAttentionAiProviderDiagnostics {
  return {
    requestBatchCount,
    completedRequestBatchCount: 0,
    processedItemCount: 0,
    transportAttemptCount: 0,
    providerResponseCount: 0,
    structuredResponseCount: 0,
    retryCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    incompleteOutputCount: 0,
    schemaValidationFailureCount: 0,
    semanticStabilizationApplied: false,
    admittedGeneratedFieldCount: 0,
    canonicalFieldSubstitutionCount: 0,
    safeReasonCodes: [],
  };
}

function sumNumbers(values: readonly (number | null | undefined)[]): number {
  return values.reduce<number>((sum, value) => sum + (Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0), 0);
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function safeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z0-9][a-z0-9_:-]{0,80}$/.test(normalized) ? normalized : null;
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
