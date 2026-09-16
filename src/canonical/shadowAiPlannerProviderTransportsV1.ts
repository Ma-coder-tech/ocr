import { createHash } from "node:crypto";

import { SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1 } from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  compileOpenAiDirectPlannerHttpRequestV1,
  compileOpenRouterPlannerHttpRequestV1,
  type ShadowAiPlannerHttpRequestV1,
} from "./shadowAiPlannerProviderAdaptersV1.js";
import {
  parseShadowAiPlannerStrictJsonObjectV1,
  ShadowAiPlannerStrictJsonErrorV1,
} from "./shadowAiPlannerStrictJsonV1.js";
import type {
  ShadowAiPlannerTransportAdapterV1,
  ShadowAiPlannerTransportResultV1,
} from "./shadowAiPlannerProviderNeutralV1.js";

const MAXIMUM_PROVIDER_RESPONSE_BYTES = 512_000;
const MAXIMUM_DRAFT_TEXT_BYTES = 128_000;

export type ShadowAiPlannerTokenPricingV1 = Readonly<{
  inputUsdMicrosPerMillionTokens: number;
  outputUsdMicrosPerMillionTokens: number;
}>;

export type ShadowAiPlannerFetchResponseV1 = Readonly<{
  status: number;
  headers?: Readonly<{ get(name: string): string | null }>;
  text(): Promise<string>;
}>;

export type ShadowAiPlannerFetchV1 = (
  url: string,
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    redirect: "error";
    signal: AbortSignal;
  }>,
) => Promise<ShadowAiPlannerFetchResponseV1>;

export class ShadowAiPlannerTransportErrorV1 extends Error {
  constructor(
    public readonly kind: "UNAVAILABLE" | "SAFETY_BLOCKED",
    public readonly safeCode: string,
    public readonly sendState: "BEFORE_SEND" | "AFTER_SEND" | "RESPONSE_RECEIVED",
    public readonly callCompleted: boolean,
  ) {
    super(safeCode);
  }
}

type AdapterConfiguration = Readonly<{
  apiKey: string;
  model: string;
  pricing: ShadowAiPlannerTokenPricingV1;
  fetchImpl?: ShadowAiPlannerFetchV1;
  clock?: Readonly<{ nowMs(): number }>;
}>;

export function createOpenAiDirectPlannerAdapterV1(
  configuration: AdapterConfiguration,
): ShadowAiPlannerTransportAdapterV1 {
  validateAdapterConfiguration(configuration, "openai");
  const fetchImpl = configuration.fetchImpl ?? defaultFetch();
  const clock = configuration.clock ?? { nowMs: () => Date.now() };
  return Object.freeze({
    adapterId: "openai-direct-responses-v1",
    transport: "PROVIDER" as const,
    providerKind: "OPENAI_DIRECT" as const,
    model: configuration.model,
    async invoke({ request, signal }) {
      const compiled = compileOpenAiDirectPlannerHttpRequestV1({
        apiKey: configuration.apiKey,
        model: configuration.model,
        request,
      });
      assertPreflightCost(compiled, configuration.pricing);
      const response = await sendOnce(compiled, signal, fetchImpl, clock);
      return normalizeOpenAiPlannerResponseV1({
        responseText: response.text,
        httpStatus: response.status,
        headerRequestId: response.requestId,
        latencyMs: response.latencyMs,
        pricing: configuration.pricing,
        requestSha256: sha256(compiled.body),
        schemaSha256: compiled.schemaSha256,
      });
    },
  });
}

export function createOpenRouterPlannerAdapterV1(
  configuration: AdapterConfiguration,
): ShadowAiPlannerTransportAdapterV1 {
  validateAdapterConfiguration(configuration, "openrouter");
  const fetchImpl = configuration.fetchImpl ?? defaultFetch();
  const clock = configuration.clock ?? { nowMs: () => Date.now() };
  return Object.freeze({
    adapterId: "openrouter-chat-completions-v1",
    transport: "PROVIDER" as const,
    providerKind: "OPENROUTER" as const,
    model: configuration.model,
    async invoke({ request, signal }) {
      const compiled = compileOpenRouterPlannerHttpRequestV1({
        apiKey: configuration.apiKey,
        model: configuration.model,
        request,
      });
      assertPreflightCost(compiled, configuration.pricing);
      const response = await sendOnce(compiled, signal, fetchImpl, clock);
      return normalizeOpenRouterPlannerResponseV1({
        responseText: response.text,
        httpStatus: response.status,
        headerRequestId: response.requestId,
        latencyMs: response.latencyMs,
        pricing: configuration.pricing,
        requestSha256: sha256(compiled.body),
        schemaSha256: compiled.schemaSha256,
      });
    },
  });
}

export function normalizeOpenAiPlannerResponseV1(input: Readonly<{
  responseText: string;
  httpStatus: number;
  headerRequestId: string | null;
  latencyMs: number;
  pricing: ShadowAiPlannerTokenPricingV1;
  requestSha256: string;
  schemaSha256: string;
}>): ShadowAiPlannerTransportResultV1 {
  const envelope = strictEnvelope(input.responseText, "openai");
  if (envelope.object !== "response" || envelope.status !== "completed" || envelope.error !== null && envelope.error !== undefined) {
    safety("shadow_planner_openai_response_not_completed");
  }
  const output = array(envelope.output, "shadow_planner_openai_response_malformed");
  const outputTexts: string[] = [];
  let refusal = false;
  for (const item of output) {
    const record = object(item, "shadow_planner_openai_response_malformed");
    if (record.type === "reasoning") continue;
    if (record.type !== "message" || record.role !== "assistant") safety("shadow_planner_openai_unexpected_output_item");
    for (const content of array(record.content, "shadow_planner_openai_response_malformed")) {
      const part = object(content, "shadow_planner_openai_response_malformed");
      if (part.type === "refusal") refusal = true;
      else if (part.type === "output_text" && typeof part.text === "string") outputTexts.push(part.text);
      else safety("shadow_planner_openai_unexpected_content_item");
    }
  }
  if (refusal) safety("shadow_planner_openai_refusal");
  if (outputTexts.length !== 1) safety("shadow_planner_openai_output_coverage_invalid");
  const rawDraft = strictDraft(outputTexts[0]);
  const usage = openAiUsage(envelope.usage, input.pricing, input.latencyMs);
  return Object.freeze({
    rawDraft,
    usage,
    providerRequestId: safeIdentifier(input.headerRequestId) ?? safeIdentifier(envelope.id),
    returnedModel: stringOrNull(envelope.model),
    safeTelemetry: telemetry(input, null, null),
  });
}

export function normalizeOpenRouterPlannerResponseV1(input: Readonly<{
  responseText: string;
  httpStatus: number;
  headerRequestId: string | null;
  latencyMs: number;
  pricing: ShadowAiPlannerTokenPricingV1;
  requestSha256: string;
  schemaSha256: string;
}>): ShadowAiPlannerTransportResultV1 {
  const envelope = strictEnvelope(input.responseText, "openrouter");
  if (envelope.object !== undefined && envelope.object !== "chat.completion") {
    safety("shadow_planner_openrouter_response_malformed");
  }
  const attempts = objectOrNull(envelope.openrouter_metadata)?.attempts;
  if (attempts !== undefined && (!Array.isArray(attempts) || attempts.length > 1)) {
    safety("shadow_planner_openrouter_fallback_detected");
  }
  const choices = array(envelope.choices, "shadow_planner_openrouter_response_malformed");
  if (choices.length !== 1) safety("shadow_planner_openrouter_output_coverage_invalid");
  const choice = object(choices[0], "shadow_planner_openrouter_response_malformed");
  if (choice.index !== 0) safety("shadow_planner_openrouter_response_malformed");
  const finishReason = stringOrNull(choice.finish_reason);
  if (finishReason !== "stop") {
    safety(finishReason === "length"
      ? "shadow_planner_openrouter_response_truncated"
      : "shadow_planner_openrouter_finish_reason_invalid");
  }
  const message = object(choice.message, "shadow_planner_openrouter_response_malformed");
  if (message.role !== "assistant" || typeof message.content !== "string") {
    safety("shadow_planner_openrouter_response_malformed");
  }
  if (typeof message.refusal === "string" && message.refusal.length > 0) {
    safety("shadow_planner_openrouter_refusal");
  }
  if (message.tool_calls !== undefined) safety("shadow_planner_openrouter_unexpected_tool_call");
  const rawDraft = strictDraft(message.content);
  const usage = openRouterUsage(envelope.usage, input.pricing, input.latencyMs);
  return Object.freeze({
    rawDraft,
    usage,
    providerRequestId: safeIdentifier(input.headerRequestId) ?? safeIdentifier(envelope.id),
    returnedModel: stringOrNull(envelope.model),
    safeTelemetry: telemetry(input, finishReason, stringOrNull(envelope.provider)),
  });
}

async function sendOnce(
  request: ShadowAiPlannerHttpRequestV1,
  signal: AbortSignal,
  fetchImpl: ShadowAiPlannerFetchV1,
  clock: Readonly<{ nowMs(): number }>,
): Promise<{ status: number; text: string; requestId: string | null; latencyMs: number }> {
  if (signal.aborted) unavailable("shadow_planner_provider_cancelled_before_send", "BEFORE_SEND", false);
  const started = clock.nowMs();
  let response: ShadowAiPlannerFetchResponseV1;
  try {
    response = await fetchImpl(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal,
    });
  } catch {
    unavailable(signal.aborted ? "shadow_planner_provider_cancelled" : "shadow_planner_provider_network_failed", "AFTER_SEND", false);
  }
  const status = response.status;
  const requestId = safeIdentifier(response.headers?.get("x-request-id") ?? null);
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    safety("shadow_planner_provider_http_status_invalid");
  }
  const declaredLength = numberHeader(response.headers?.get("content-length") ?? null);
  if (declaredLength !== null && declaredLength > MAXIMUM_PROVIDER_RESPONSE_BYTES) {
    safety("shadow_planner_provider_response_too_large");
  }
  let text: string;
  try { text = await response.text(); }
  catch { unavailable("shadow_planner_provider_response_read_failed", "RESPONSE_RECEIVED", true); }
  if (Buffer.byteLength(text, "utf8") > MAXIMUM_PROVIDER_RESPONSE_BYTES) {
    safety("shadow_planner_provider_response_too_large");
  }
  if (status < 200 || status >= 300) {
    unavailable(httpFailureCode(request.providerKind, status), "RESPONSE_RECEIVED", true);
  }
  return { status, text, requestId, latencyMs: elapsed(clock.nowMs(), started) };
}

function strictEnvelope(text: string, provider: "openai" | "openrouter"): Record<string, unknown> {
  try { return parseShadowAiPlannerStrictJsonObjectV1(text); }
  catch (error) {
    if (error instanceof ShadowAiPlannerStrictJsonErrorV1) {
      safety(`${error.safeCode}:${provider}_envelope`);
    }
    safety(`shadow_planner_${provider}_response_json_invalid`);
  }
}

function strictDraft(text: string): Record<string, unknown> {
  if (Buffer.byteLength(text, "utf8") > MAXIMUM_DRAFT_TEXT_BYTES) {
    safety("shadow_planner_provider_draft_too_large");
  }
  try { return parseShadowAiPlannerStrictJsonObjectV1(text); }
  catch (error) {
    if (error instanceof ShadowAiPlannerStrictJsonErrorV1) {
      safety(`${error.safeCode}:draft`);
    }
    safety("shadow_planner_provider_draft_json_invalid");
  }
}

function openAiUsage(value: unknown, pricing: ShadowAiPlannerTokenPricingV1, latencyMs: number) {
  const usage = object(value, "shadow_planner_openai_usage_missing");
  const inputTokens = nonnegativeInteger(usage.input_tokens, "shadow_planner_openai_usage_invalid");
  const outputTokens = nonnegativeInteger(usage.output_tokens, "shadow_planner_openai_usage_invalid");
  return Object.freeze({
    inputTokens,
    outputTokens,
    estimatedCostUsdMicros: estimatedCost(inputTokens, outputTokens, pricing),
    latencyMs,
  });
}

function openRouterUsage(value: unknown, pricing: ShadowAiPlannerTokenPricingV1, latencyMs: number) {
  const usage = object(value, "shadow_planner_openrouter_usage_missing");
  const inputTokens = nonnegativeInteger(usage.prompt_tokens, "shadow_planner_openrouter_usage_invalid");
  const outputTokens = nonnegativeInteger(usage.completion_tokens, "shadow_planner_openrouter_usage_invalid");
  const estimated = estimatedCost(inputTokens, outputTokens, pricing);
  const actualCost = typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0
    ? Math.ceil(usage.cost * 1_000_000) : 0;
  return Object.freeze({
    inputTokens,
    outputTokens,
    estimatedCostUsdMicros: Math.max(estimated, actualCost),
    latencyMs,
  });
}

function telemetry(
  input: Readonly<{ httpStatus: number; requestSha256: string; schemaSha256: string }>,
  finishReason: string | null,
  routedProvider: string | null,
): ShadowAiPlannerTransportResultV1["safeTelemetry"] {
  return Object.freeze({
    httpStatus: input.httpStatus,
    requestSha256: input.requestSha256,
    schemaSha256: input.schemaSha256,
    finishReason: safeIdentifier(finishReason),
    routedProvider: safeIdentifier(routedProvider),
  });
}

function validateAdapterConfiguration(configuration: AdapterConfiguration, provider: string): void {
  if (!configuration.apiKey) throw new Error(`shadow_planner_${provider}_api_key_required`);
  if (!configuration.model.trim()) throw new Error(`shadow_planner_${provider}_model_required`);
  for (const value of Object.values(configuration.pricing)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`shadow_planner_${provider}_pricing_invalid`);
  }
}

function assertPreflightCost(
  request: ShadowAiPlannerHttpRequestV1,
  pricing: ShadowAiPlannerTokenPricingV1,
): void {
  // Tokenizers cannot emit more tokens than the UTF-8 bytes supplied. Treating
  // body bytes as input tokens is conservative and makes the configured cost
  // ceiling a pre-send control rather than only post-response telemetry.
  const upperBound = estimatedCost(
    request.bodyBytes,
    SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumOutputTokens,
    pricing,
  );
  if (upperBound > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros) {
    throw new ShadowAiPlannerTransportErrorV1(
      "SAFETY_BLOCKED",
      "shadow_planner_preflight_cost_budget_exceeded",
      "BEFORE_SEND",
      false,
    );
  }
}

function defaultFetch(): ShadowAiPlannerFetchV1 {
  if (typeof globalThis.fetch !== "function") throw new Error("shadow_planner_provider_fetch_unavailable");
  return globalThis.fetch as unknown as ShadowAiPlannerFetchV1;
}

function estimatedCost(inputTokens: number, outputTokens: number, pricing: ShadowAiPlannerTokenPricingV1): number {
  return Math.ceil((inputTokens * pricing.inputUsdMicrosPerMillionTokens
    + outputTokens * pricing.outputUsdMicrosPerMillionTokens) / 1_000_000);
}

function httpFailureCode(provider: "OPENAI_DIRECT" | "OPENROUTER", status: number): string {
  const name = provider === "OPENAI_DIRECT" ? "openai" : "openrouter";
  if (status === 400 || status === 415 || status === 422) return `shadow_planner_${name}_request_rejected`;
  if (status === 401) return `shadow_planner_${name}_authentication_rejected`;
  if (status === 402) return `shadow_planner_${name}_account_rejected`;
  if (status === 403) return `shadow_planner_${name}_authorization_rejected`;
  if (status === 404) return `shadow_planner_${name}_model_or_endpoint_rejected`;
  if (status === 408) return `shadow_planner_${name}_request_timeout`;
  if (status === 429) return `shadow_planner_${name}_rate_limited`;
  if (status >= 500) return `shadow_planner_${name}_service_unavailable`;
  return `shadow_planner_${name}_http_failure`;
}

function unavailable(code: string, sendState: ShadowAiPlannerTransportErrorV1["sendState"], completed: boolean): never {
  throw new ShadowAiPlannerTransportErrorV1("UNAVAILABLE", code, sendState, completed);
}

function safety(code: string): never {
  throw new ShadowAiPlannerTransportErrorV1("SAFETY_BLOCKED", code, "RESPONSE_RECEIVED", true);
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) safety(code);
  return value as Record<string, unknown>;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) safety(code);
  return value;
}

function nonnegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) safety(code);
  return value as number;
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || !/^[A-Za-z0-9._:/-]+$/.test(value)) return null;
  return value;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null;
}

function numberHeader(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function elapsed(finished: number, started: number): number {
  const value = Math.max(0, Math.round(finished - started));
  return Number.isSafeInteger(value) ? value : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
