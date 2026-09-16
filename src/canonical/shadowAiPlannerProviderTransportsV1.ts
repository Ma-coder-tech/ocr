import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { Client } from "undici";

import { SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1 } from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  compileOpenAiDirectPlannerHttpRequestV1,
  compileOpenRouterPlannerHttpRequestV1,
  type OpenRouterPlannerRoutingSettingsV1,
  type ShadowAiPlannerGenerationSettingsV1,
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
const OPENAI_DIRECT_ORIGIN = "https://api.openai.com";
const OPENAI_DIRECT_CONNECT_TIMEOUT_MS = 15_000;

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

export type ShadowAiPlannerTransportTimingsV1 = Readonly<{
  connectionReused: boolean | null;
  connectionMs: number | null;
  responseHeadersMs: number | null;
  responseBodyMs: number | null;
  cleanupMs: number | null;
  failureElapsedMs: number | null;
}>;

export type ShadowAiPlannerTransportSessionV1 = Readonly<{
  fetch: ShadowAiPlannerFetchV1;
  connectionEstablished(): boolean | null;
  connectionMs(): number | null;
  close(input: Readonly<{ aborted: boolean }>): Promise<number>;
}>;

export type ShadowAiPlannerTransportSessionFactoryV1 = () => ShadowAiPlannerTransportSessionV1;

export class ShadowAiPlannerTransportErrorV1 extends Error {
  constructor(
    public readonly kind: "UNAVAILABLE" | "SAFETY_BLOCKED",
    public readonly safeCode: string,
    public readonly sendState: "BEFORE_SEND" | "AFTER_SEND" | "RESPONSE_RECEIVED",
    public readonly callCompleted: boolean,
    public readonly transportTimings?: ShadowAiPlannerTransportTimingsV1,
  ) {
    super(safeCode);
  }
}

type AdapterConfiguration = Readonly<{
  apiKey: string;
  model: string;
  generation: ShadowAiPlannerGenerationSettingsV1;
  pricing: ShadowAiPlannerTokenPricingV1;
  fetchImpl?: ShadowAiPlannerFetchV1;
  transportSessionFactory?: ShadowAiPlannerTransportSessionFactoryV1;
  clock?: Readonly<{ nowMs(): number }>;
}>;

type OpenRouterAdapterConfiguration = AdapterConfiguration & Readonly<{
  routing: OpenRouterPlannerRoutingSettingsV1;
}>;

export function createOpenAiDirectPlannerAdapterV1(
  configuration: AdapterConfiguration,
): ShadowAiPlannerTransportAdapterV1 {
  validateAdapterConfiguration(configuration, "openai");
  if (configuration.fetchImpl && configuration.transportSessionFactory) {
    throw new Error("shadow_planner_openai_transport_configuration_ambiguous");
  }
  const clock = configuration.clock ?? { nowMs: () => Date.now() };
  return Object.freeze({
    adapterId: "openai-direct-responses-v1",
    transport: "PROVIDER" as const,
    providerKind: "OPENAI_DIRECT" as const,
    model: configuration.model,
    safeConfiguration: Object.freeze({
      ...configuration.generation,
      verbosityControl: "NATIVE_PARAMETER" as const,
      providerFallbackAllowed: false as const,
      routedProviderConstraint: null,
      dataCollection: "DIRECT_STORE_DISABLED" as const,
    }),
    async invoke({ request, signal }) {
      const compiled = compileOpenAiDirectPlannerHttpRequestV1({
        apiKey: configuration.apiKey,
        model: configuration.model,
        request,
        generation: configuration.generation,
      });
      assertPreflightCost(compiled, configuration.pricing, configuration.generation.maximumOutputTokens);
      const session = configuration.transportSessionFactory?.()
        ?? (configuration.fetchImpl
          ? injectedFetchSession(configuration.fetchImpl)
          : createIsolatedOpenAiDirectSessionV1());
      let response: Awaited<ReturnType<typeof sendOnce>> | null = null;
      let failure: unknown = null;
      try {
        response = await sendOnce(compiled, signal, session, clock);
      } catch (error) {
        failure = error;
      }
      let cleanupMs: number;
      try {
        cleanupMs = await session.close({ aborted: signal.aborted || failure !== null });
      } catch {
        throw new ShadowAiPlannerTransportErrorV1(
          "UNAVAILABLE", "shadow_planner_provider_session_cleanup_failed", "AFTER_SEND", false,
        );
      }
      if (failure !== null) {
        if (failure instanceof ShadowAiPlannerTransportErrorV1) {
          throw new ShadowAiPlannerTransportErrorV1(
            failure.kind,
            failure.safeCode,
            failure.sendState,
            failure.callCompleted,
            failure.transportTimings ? { ...failure.transportTimings, cleanupMs } : undefined,
          );
        }
        throw failure;
      }
      if (response === null) {
        throw new ShadowAiPlannerTransportErrorV1(
          "UNAVAILABLE", "shadow_planner_provider_transport_result_missing", "AFTER_SEND", false,
        );
      }
      return normalizeOpenAiPlannerResponseV1({
        responseText: response.text,
        httpStatus: response.status,
        headerRequestId: response.requestId,
        latencyMs: response.latencyMs,
        pricing: configuration.pricing,
        requestSha256: sha256(compiled.body),
        schemaSha256: compiled.schemaSha256,
        transportTimings: {
          connectionReused: false,
          connectionMs: session.connectionMs(),
          responseHeadersMs: response.responseHeadersMs,
          responseBodyMs: response.responseBodyMs,
          cleanupMs,
          failureElapsedMs: null,
        },
      });
    },
  });
}

export function createOpenRouterPlannerAdapterV1(
  configuration: OpenRouterAdapterConfiguration,
): ShadowAiPlannerTransportAdapterV1 {
  validateAdapterConfiguration(configuration, "openrouter");
  const fetchImpl = configuration.fetchImpl ?? defaultFetch();
  const clock = configuration.clock ?? { nowMs: () => Date.now() };
  return Object.freeze({
    adapterId: "openrouter-responses-v1",
    transport: "PROVIDER" as const,
    providerKind: "OPENROUTER" as const,
    model: configuration.model,
    safeConfiguration: Object.freeze({
      ...configuration.generation,
      verbosityControl: "PROVIDER_NEUTRAL_INSTRUCTION" as const,
      providerFallbackAllowed: false as const,
      routedProviderConstraint: configuration.routing.onlyProvider,
      dataCollection: configuration.routing.dataCollection,
    }),
    async invoke({ request, signal }) {
      const compiled = compileOpenRouterPlannerHttpRequestV1({
        apiKey: configuration.apiKey,
        model: configuration.model,
        request,
        generation: configuration.generation,
        routing: configuration.routing,
      });
      assertPreflightCost(compiled, configuration.pricing, configuration.generation.maximumOutputTokens);
      const response = await sendOnce(compiled, signal, injectedFetchSession(fetchImpl), clock);
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
  transportTimings?: ShadowAiPlannerTransportTimingsV1;
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
    safeTelemetry: telemetry(input, null, null, input.transportTimings),
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
  transportTimings?: ShadowAiPlannerTransportTimingsV1;
}>): ShadowAiPlannerTransportResultV1 {
  const envelope = strictEnvelope(input.responseText, "openrouter");
  if (envelope.object !== "response" || envelope.status !== "completed"
    || envelope.error !== null && envelope.error !== undefined) {
    safety(envelope.status === "incomplete"
      ? "shadow_planner_openrouter_response_truncated"
      : "shadow_planner_openrouter_response_not_completed");
  }
  const routedProvider = openRouterRoutedProvider(envelope);
  const output = array(envelope.output, "shadow_planner_openrouter_response_malformed");
  const outputTexts: string[] = [];
  let refusal = false;
  for (const item of output) {
    const record = object(item, "shadow_planner_openrouter_response_malformed");
    if (record.type === "reasoning") continue;
    if (record.type !== "message" || record.role !== "assistant") {
      safety("shadow_planner_openrouter_unexpected_output_item");
    }
    for (const content of array(record.content, "shadow_planner_openrouter_response_malformed")) {
      const part = object(content, "shadow_planner_openrouter_response_malformed");
      if (part.type === "refusal") refusal = true;
      else if (part.type === "output_text" && typeof part.text === "string") outputTexts.push(part.text);
      else safety("shadow_planner_openrouter_unexpected_content_item");
    }
  }
  if (refusal) safety("shadow_planner_openrouter_refusal");
  if (outputTexts.length !== 1) safety("shadow_planner_openrouter_output_coverage_invalid");
  const rawDraft = strictDraft(outputTexts[0]);
  const usage = openRouterResponsesUsage(envelope.usage, input.pricing, input.latencyMs);
  return Object.freeze({
    rawDraft,
    usage,
    providerRequestId: safeIdentifier(input.headerRequestId) ?? safeIdentifier(envelope.id),
    returnedModel: stringOrNull(envelope.model),
    safeTelemetry: telemetry(input, "completed", routedProvider, input.transportTimings),
  });
}

async function sendOnce(
  request: ShadowAiPlannerHttpRequestV1,
  signal: AbortSignal,
  session: ShadowAiPlannerTransportSessionV1,
  clock: Readonly<{ nowMs(): number }>,
): Promise<{
  status: number;
  text: string;
  requestId: string | null;
  latencyMs: number;
  responseHeadersMs: number;
  responseBodyMs: number;
}> {
  if (signal.aborted) unavailable("shadow_planner_provider_cancelled_before_send", "BEFORE_SEND", false);
  const started = clock.nowMs();
  let response: ShadowAiPlannerFetchResponseV1;
  try {
    response = await session.fetch(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal,
    });
  } catch {
    const safeCode = signal.aborted
      ? "shadow_planner_provider_cancelled"
      : session.connectionEstablished() === false
        ? "shadow_planner_provider_connection_establishment_failed"
        : session.connectionEstablished() === true
          ? "shadow_planner_provider_response_headers_failed"
          : "shadow_planner_provider_connection_or_response_headers_failed";
    unavailable(safeCode, "AFTER_SEND", false, {
      connectionReused: false,
      connectionMs: session.connectionMs(),
      responseHeadersMs: null,
      responseBodyMs: null,
      cleanupMs: null,
      failureElapsedMs: elapsed(clock.nowMs(), started),
    });
  }
  const headersReceived = clock.nowMs();
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
  catch {
    unavailable("shadow_planner_provider_response_read_failed", "RESPONSE_RECEIVED", true, {
      connectionReused: false,
      connectionMs: session.connectionMs(),
      responseHeadersMs: elapsed(headersReceived, started),
      responseBodyMs: null,
      cleanupMs: null,
      failureElapsedMs: elapsed(clock.nowMs(), started),
    });
  }
  const bodyReceived = clock.nowMs();
  if (Buffer.byteLength(text, "utf8") > MAXIMUM_PROVIDER_RESPONSE_BYTES) {
    safety("shadow_planner_provider_response_too_large");
  }
  if (status < 200 || status >= 300) {
    unavailable(httpFailureCode(request.providerKind, status), "RESPONSE_RECEIVED", true);
  }
  return {
    status,
    text,
    requestId,
    latencyMs: elapsed(bodyReceived, started),
    responseHeadersMs: elapsed(headersReceived, started),
    responseBodyMs: elapsed(bodyReceived, headersReceived),
  };
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

function openRouterResponsesUsage(value: unknown, pricing: ShadowAiPlannerTokenPricingV1, latencyMs: number) {
  const usage = object(value, "shadow_planner_openrouter_usage_missing");
  const inputTokens = nonnegativeInteger(usage.input_tokens, "shadow_planner_openrouter_usage_invalid");
  const outputTokens = nonnegativeInteger(usage.output_tokens, "shadow_planner_openrouter_usage_invalid");
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

function openRouterRoutedProvider(envelope: Record<string, unknown>): string {
  const metadata = objectOrNull(envelope.openrouter_metadata);
  if (metadata !== null) {
    const attempt = metadata.attempt;
    if (attempt !== undefined) {
      if (!Number.isSafeInteger(attempt) || (attempt as number) < 1) {
        safety("shadow_planner_openrouter_routing_metadata_invalid");
      }
      if ((attempt as number) > 1) safety("shadow_planner_openrouter_fallback_detected");
    }
    const attempts = metadata.attempts;
    if (attempts !== undefined) {
      if (!Array.isArray(attempts)) safety("shadow_planner_openrouter_routing_metadata_invalid");
      if (attempts.length > 1) safety("shadow_planner_openrouter_fallback_detected");
    }
  }

  const topLevelProvider = safeIdentifier(envelope.provider);
  const selectedProvider = selectedOpenRouterProvider(metadata);
  if (topLevelProvider !== null && selectedProvider !== null
    && topLevelProvider.toLowerCase() !== selectedProvider.toLowerCase()) {
    safety("shadow_planner_openrouter_routing_metadata_conflict");
  }
  const routedProvider = selectedProvider ?? topLevelProvider;
  if (routedProvider === null) safety("shadow_planner_openrouter_routing_metadata_missing");
  return routedProvider;
}

function selectedOpenRouterProvider(metadata: Record<string, unknown> | null): string | null {
  if (metadata === null) return null;
  const endpoints = objectOrNull(metadata.endpoints);
  if (endpoints === null) return null;
  const available = endpoints.available;
  if (!Array.isArray(available) || available.length > 32) {
    safety("shadow_planner_openrouter_routing_metadata_invalid");
  }
  const selected = available
    .map((value) => object(value, "shadow_planner_openrouter_routing_metadata_invalid"))
    .filter((value) => value.selected === true);
  if (selected.length !== 1) safety("shadow_planner_openrouter_routing_metadata_invalid");
  const provider = safeIdentifier(selected[0].provider);
  if (provider === null) safety("shadow_planner_openrouter_routing_metadata_invalid");
  return provider;
}

function telemetry(
  input: Readonly<{ httpStatus: number; requestSha256: string; schemaSha256: string }>,
  finishReason: string | null,
  routedProvider: string | null,
  transportTimings?: ShadowAiPlannerTransportTimingsV1,
): ShadowAiPlannerTransportResultV1["safeTelemetry"] {
  return Object.freeze({
    httpStatus: input.httpStatus,
    requestSha256: input.requestSha256,
    schemaSha256: input.schemaSha256,
    finishReason: safeIdentifier(finishReason),
    routedProvider: safeIdentifier(routedProvider),
    transportTimings: transportTimings ? Object.freeze({ ...transportTimings }) : undefined,
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
  maximumOutputTokens: number,
): void {
  // Tokenizers cannot emit more tokens than the UTF-8 bytes supplied. Treating
  // body bytes as input tokens is conservative and makes the configured cost
  // ceiling a pre-send control rather than only post-response telemetry.
  const upperBound = estimatedCost(
    request.bodyBytes,
    maximumOutputTokens,
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

/**
 * Direct OpenAI gets an isolated, single-request connection owner. A completed
 * call closes its client; an aborted or failed call destroys it and awaits the
 * socket shutdown. No connection or TLS session is shared with the next call.
 */
export function createIsolatedOpenAiDirectSessionV1(): ShadowAiPlannerTransportSessionV1 {
  const client = new Client(OPENAI_DIRECT_ORIGIN, {
    pipelining: 1,
    connectTimeout: OPENAI_DIRECT_CONNECT_TIMEOUT_MS,
    headersTimeout: 0,
    bodyTimeout: 0,
    maxCachedSessions: 0,
  });
  let requestStartedAt: number | null = null;
  let connectedAt: number | null = null;
  let connectionFailed = false;
  client.once("connect", () => { connectedAt = performance.now(); });
  client.once("connectionError", () => { connectionFailed = true; });

  const fetch: ShadowAiPlannerFetchV1 = async (url, init) => {
    const target = new URL(url);
    if (target.origin !== OPENAI_DIRECT_ORIGIN || target.pathname !== "/v1/responses" || target.search) {
      throw new Error("shadow_planner_openai_direct_endpoint_invalid");
    }
    requestStartedAt = performance.now();
    const response = await client.request({
      path: target.pathname,
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
      idempotent: false,
      blocking: true,
      headersTimeout: 0,
      bodyTimeout: 0,
    });
    return {
      status: response.statusCode,
      headers: {
        get(name: string): string | null {
          const value = response.headers[name.toLowerCase()];
          if (Array.isArray(value)) return value.join(",");
          return typeof value === "string" ? value : null;
        },
      },
      text: async () => response.body.text(),
    };
  };

  return Object.freeze({
    fetch,
    connectionEstablished: () => connectedAt !== null ? true : connectionFailed ? false : null,
    connectionMs: () => requestStartedAt !== null && connectedAt !== null
      ? elapsed(connectedAt, requestStartedAt) : null,
    async close({ aborted }) {
      const started = performance.now();
      if (aborted) await client.destroy();
      else await client.close();
      return elapsed(performance.now(), started);
    },
  });
}

function injectedFetchSession(fetch: ShadowAiPlannerFetchV1): ShadowAiPlannerTransportSessionV1 {
  return Object.freeze({
    fetch,
    connectionEstablished: () => null,
    connectionMs: () => null,
    close: async () => 0,
  });
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

function unavailable(
  code: string,
  sendState: ShadowAiPlannerTransportErrorV1["sendState"],
  completed: boolean,
  transportTimings?: ShadowAiPlannerTransportTimingsV1,
): never {
  throw new ShadowAiPlannerTransportErrorV1("UNAVAILABLE", code, sendState, completed, transportTimings);
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
