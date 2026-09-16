import {
  SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionPlanV1,
  type ShadowAiPlannerProviderUsageV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  compileShadowAiPlannerProviderRequestV1,
  validateAndBindShadowAiPlannerDraftV1,
  type ShadowAiPlannerTransportAdapterV1,
  type ShadowAiProviderKindV1,
} from "./shadowAiPlannerProviderNeutralV1.js";
import { ShadowAiPlannerTransportErrorV1 } from "./shadowAiPlannerProviderTransportsV1.js";
import { canonicalJson } from "./v2/canonicalJson.js";

export const SHADOW_AI_PROVIDER_NEUTRAL_RUN_SCHEMA_VERSION_V1 =
  "shadow_ai_provider_neutral_run_2026_09_16_v2" as const;
export const SHADOW_AI_PROVIDER_NEUTRAL_MAXIMUM_TIMEOUT_MS_V1 = 60_000 as const;
export const SHADOW_AI_PROVIDER_ABORT_CLEANUP_GRACE_MS_V1 = 2_000 as const;

const QUARANTINED_TRANSPORTS = new WeakSet<ShadowAiPlannerTransportAdapterV1>();

export type ShadowAiProviderNeutralPlannerRunV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_PROVIDER_NEUTRAL_RUN_SCHEMA_VERSION_V1;
  mode: "SHADOW";
  authority: "EVALUATION_ONLY";
  status: "COMPLETED" | "UNAVAILABLE" | "SAFETY_BLOCKED";
  issueId: string;
  inputHash: string;
  plan: ShadowAiEconomicResolutionPlanV1 | null;
  provider: Readonly<{
    adapterId: string;
    providerKind: ShadowAiProviderKindV1;
    requestedModel: string;
    returnedModel: string | null;
    providerRequestId: string | null;
    routedProvider: string | null;
    httpStatus: number | null;
    requestSha256: string | null;
    schemaSha256: string | null;
    finishReason: string | null;
    connectionReused: boolean | null;
    connectionMs: number | null;
    responseHeadersMs: number | null;
    responseBodyMs: number | null;
    cleanupMs: number | null;
    failureElapsedMs: number | null;
    cleanupStatus: "NOT_REQUIRED" | "CONFIRMED" | "UNCONFIRMED";
    failureStage: "NONE" | "CONNECTION_ESTABLISHMENT" | "CONNECTION_OR_RESPONSE_HEADERS"
      | "RESPONSE_HEADERS" | "RESPONSE_BODY"
      | "TIMEOUT_ABORT" | "SESSION_CLEANUP" | "TRANSPORT_QUARANTINED" | "UNCLASSIFIED";
  }>;
  accounting: Readonly<{
    plannerOperationCount: 1;
    providerCallAttempts: 0 | 1;
    providerCallCompleted: 0 | 1;
    providerNetworkCalls: 0 | 1;
    requestBytes: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsdMicros: number;
    latencyMs: number;
    retries: 0;
    researchOperations: 0;
    sourceAdmissions: 0;
  }>;
  deterministicResultPreserved: true;
  customerOutputCreated: false;
  errorCodes: readonly string[];
  limitationCodes: readonly string[];
}>;

/**
 * Executes exactly one explicitly selected adapter for exactly one issue.
 * It never retries and has no fallback input, so provider switching cannot
 * occur inside the financial-analysis path.
 */
export async function runShadowAiProviderNeutralPlannerV1(input: Readonly<{
  packet: ShadowAiEconomicResolutionPacketV1;
  adapter: ShadowAiPlannerTransportAdapterV1;
  timeoutMs?: number;
  abortCleanupGraceMs?: number;
}>): Promise<ShadowAiProviderNeutralPlannerRunV1> {
  const provider = providerIdentity(input.adapter, null);
  if (QUARANTINED_TRANSPORTS.has(input.adapter)) {
    return result(input.packet, providerLifecycle(provider, {
      cleanupStatus: "UNCONFIRMED",
      failureStage: "TRANSPORT_QUARANTINED",
    }), "UNAVAILABLE", null, emptyAccounting(0),
    ["shadow_planner_provider_transport_quarantined"], ["planner_transport_cleanup_unconfirmed"]);
  }
  const timeoutMs = input.timeoutMs ?? SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.timeoutMs;
  const abortCleanupGraceMs = input.abortCleanupGraceMs ?? SHADOW_AI_PROVIDER_ABORT_CLEANUP_GRACE_MS_V1;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || timeoutMs > SHADOW_AI_PROVIDER_NEUTRAL_MAXIMUM_TIMEOUT_MS_V1
    || !Number.isSafeInteger(abortCleanupGraceMs) || abortCleanupGraceMs < 1
    || abortCleanupGraceMs > SHADOW_AI_PROVIDER_ABORT_CLEANUP_GRACE_MS_V1) {
    return result(input.packet, provider, "SAFETY_BLOCKED", null, emptyAccounting(0),
      ["shadow_planner_timeout_contract_invalid"], ["planner_request_rejected"]);
  }
  let compiled: ReturnType<typeof compileShadowAiPlannerProviderRequestV1>;
  try {
    compiled = compileShadowAiPlannerProviderRequestV1(input.packet);
  } catch (error) {
    return result(input.packet, provider, "SAFETY_BLOCKED", null, emptyAccounting(0),
      [safeCompilationError(error)], ["planner_request_rejected"]);
  }

  const requestBytes = Buffer.byteLength(canonicalJson(compiled.request), "utf8");
  if (requestBytes > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumInputBytes) {
    return result(input.packet, provider, "SAFETY_BLOCKED", null, emptyAccounting(requestBytes),
      ["shadow_planner_input_budget_exceeded"], ["input_budget_exceeded"]);
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const operation = Promise.resolve()
    .then(() => input.adapter.invoke({ request: compiled.request, signal: controller.signal }))
    .then((value) => ({ kind: "value" as const, value }))
    .catch((error: unknown) => ({ kind: "error" as const, error }));
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, timeoutMs);
    timer.unref?.();
  });
  const completed = await Promise.race([operation, timeout]);
  if (completed.kind !== "timeout" && timer) clearTimeout(timer);
  const attempted = accounting(input.adapter, requestBytes, null, false);
  if (completed.kind === "timeout") {
    const cleanup = await awaitAbortCleanup(operation, abortCleanupGraceMs);
    if (!cleanup.confirmed) QUARANTINED_TRANSPORTS.add(input.adapter);
    const timeoutTransportError = cleanup.settled?.kind === "error"
      && cleanup.settled.error instanceof ShadowAiPlannerTransportErrorV1
      ? cleanup.settled.error : null;
    return result(input.packet, providerLifecycle(providerWithTimings(provider, timeoutTransportError?.transportTimings), {
      cleanupStatus: cleanup.confirmed ? "CONFIRMED" : "UNCONFIRMED",
      failureStage: cleanup.confirmed ? "TIMEOUT_ABORT" : "SESSION_CLEANUP",
    }), "UNAVAILABLE", null, attempted,
    cleanup.confirmed
      ? ["shadow_planner_provider_timeout"]
      : ["shadow_planner_provider_abort_cleanup_unconfirmed", "shadow_planner_provider_timeout"],
    cleanup.confirmed ? ["planner_timed_out"] : ["planner_timed_out", "planner_transport_quarantined"]);
  }
  if (completed.kind === "error") {
    const transportError = completed.error instanceof ShadowAiPlannerTransportErrorV1 ? completed.error : null;
    const failureAccounting = accounting(
      input.adapter,
      requestBytes,
      null,
      transportError?.callCompleted ?? false,
      transportError?.sendState !== "BEFORE_SEND",
    );
    return result(input.packet, providerLifecycle(providerWithTimings(provider, transportError?.transportTimings), {
      cleanupStatus: "CONFIRMED",
      failureStage: failureStage(transportError?.safeCode),
    }), transportError?.kind ?? "UNAVAILABLE", null, failureAccounting,
      [transportError?.safeCode ?? "shadow_planner_provider_failed"],
      [transportError?.kind === "SAFETY_BLOCKED" ? "planner_provider_response_rejected" : "planner_provider_failed"]);
  }

  const completedProvider = providerIdentity(input.adapter, completed.value);
  const completedAccounting = accounting(input.adapter, requestBytes, completed.value.usage, true);
  const usageErrors = validateUsage(completed.value.usage);
  const metadataErrors = validateProviderMetadata(input.adapter, completed.value);
  if (usageErrors.length > 0 || metadataErrors.length > 0) {
    return result(input.packet, completedProvider, "SAFETY_BLOCKED", null, completedAccounting,
      [...usageErrors, ...metadataErrors], ["planner_provider_response_rejected"]);
  }

  const bound = validateAndBindShadowAiPlannerDraftV1(completed.value.rawDraft, compiled.localBinding);
  if (!bound.ok) {
    return result(input.packet, completedProvider, "SAFETY_BLOCKED", null, completedAccounting,
      bound.errors, ["planner_output_rejected"]);
  }
  return result(input.packet, completedProvider, "COMPLETED", bound.plan, completedAccounting, [], []);
}

function validateUsage(usage: ShadowAiPlannerProviderUsageV1): string[] {
  if (!isRecord(usage)) return ["shadow_planner_usage_missing"];
  const errors: string[] = [];
  for (const key of ["inputTokens", "outputTokens", "estimatedCostUsdMicros", "latencyMs"] as const) {
    if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) errors.push(`shadow_planner_usage_${key}_invalid`);
  }
  if (usage.outputTokens > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumOutputTokens) {
    errors.push("shadow_planner_output_token_budget_exceeded");
  }
  if (usage.estimatedCostUsdMicros > SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros) {
    errors.push("shadow_planner_cost_budget_exceeded");
  }
  return errors;
}

function validateProviderMetadata(
  adapter: ShadowAiPlannerTransportAdapterV1,
  response: Awaited<ReturnType<ShadowAiPlannerTransportAdapterV1["invoke"]>>,
): string[] {
  const errors: string[] = [];
  if (response.returnedModel !== null && (response.returnedModel.length > 200 || response.returnedModel !== adapter.model)) {
    errors.push("shadow_planner_returned_model_mismatch");
  }
  if (response.providerRequestId !== null && (response.providerRequestId.length === 0 || response.providerRequestId.length > 256)) {
    errors.push("shadow_planner_provider_request_id_invalid");
  }
  if (!Number.isSafeInteger(response.safeTelemetry.httpStatus) || response.safeTelemetry.httpStatus < 200 || response.safeTelemetry.httpStatus > 299) {
    errors.push("shadow_planner_provider_http_status_invalid");
  }
  if (![response.safeTelemetry.requestSha256, response.safeTelemetry.schemaSha256].every((value) => /^[a-f0-9]{64}$/.test(value))) {
    errors.push("shadow_planner_provider_fingerprint_invalid");
  }
  if ([response.safeTelemetry.finishReason, response.safeTelemetry.routedProvider]
    .some((value) => value !== null && (value.length === 0 || value.length > 200))) {
    errors.push("shadow_planner_provider_telemetry_invalid");
  }
  const timings = response.safeTelemetry.transportTimings;
  if (timings && (
    timings.connectionReused !== null && typeof timings.connectionReused !== "boolean"
    || [timings.connectionMs, timings.responseHeadersMs, timings.responseBodyMs, timings.cleanupMs,
      timings.failureElapsedMs]
      .some((value) => value !== null && (!Number.isSafeInteger(value) || value < 0
        || value > SHADOW_AI_PROVIDER_NEUTRAL_MAXIMUM_TIMEOUT_MS_V1 + SHADOW_AI_PROVIDER_ABORT_CLEANUP_GRACE_MS_V1))
  )) errors.push("shadow_planner_provider_transport_timing_invalid");
  const routedProviderConstraint = adapter.safeConfiguration.routedProviderConstraint;
  if (routedProviderConstraint !== null
    && response.safeTelemetry.routedProvider?.toLowerCase() !== routedProviderConstraint.toLowerCase()) {
    errors.push("shadow_planner_routed_provider_mismatch");
  }
  return errors;
}

function providerIdentity(
  adapter: ShadowAiPlannerTransportAdapterV1,
  response: Awaited<ReturnType<ShadowAiPlannerTransportAdapterV1["invoke"]>> | null,
): ShadowAiProviderNeutralPlannerRunV1["provider"] {
  return Object.freeze({
    adapterId: adapter.adapterId,
    providerKind: adapter.providerKind,
    requestedModel: adapter.model,
    returnedModel: boundedMetadata(response?.returnedModel ?? null),
    providerRequestId: boundedMetadata(response?.providerRequestId ?? null),
    routedProvider: boundedMetadata(response?.safeTelemetry.routedProvider ?? null),
    httpStatus: response?.safeTelemetry.httpStatus ?? null,
    requestSha256: response?.safeTelemetry.requestSha256 ?? null,
    schemaSha256: response?.safeTelemetry.schemaSha256 ?? null,
    finishReason: boundedMetadata(response?.safeTelemetry.finishReason ?? null),
    connectionReused: response?.safeTelemetry.transportTimings?.connectionReused ?? null,
    connectionMs: response?.safeTelemetry.transportTimings?.connectionMs ?? null,
    responseHeadersMs: response?.safeTelemetry.transportTimings?.responseHeadersMs ?? null,
    responseBodyMs: response?.safeTelemetry.transportTimings?.responseBodyMs ?? null,
    cleanupMs: response?.safeTelemetry.transportTimings?.cleanupMs ?? null,
    failureElapsedMs: response?.safeTelemetry.transportTimings?.failureElapsedMs ?? null,
    cleanupStatus: response?.safeTelemetry.transportTimings ? "CONFIRMED" as const : "NOT_REQUIRED" as const,
    failureStage: "NONE" as const,
  });
}

function providerLifecycle(
  provider: ShadowAiProviderNeutralPlannerRunV1["provider"],
  update: Pick<ShadowAiProviderNeutralPlannerRunV1["provider"], "cleanupStatus" | "failureStage">,
): ShadowAiProviderNeutralPlannerRunV1["provider"] {
  return Object.freeze({ ...provider, ...update });
}

function providerWithTimings(
  provider: ShadowAiProviderNeutralPlannerRunV1["provider"],
  timings: ShadowAiPlannerTransportErrorV1["transportTimings"],
): ShadowAiProviderNeutralPlannerRunV1["provider"] {
  if (!timings) return provider;
  return Object.freeze({
    ...provider,
    connectionReused: timings.connectionReused,
    connectionMs: timings.connectionMs,
    responseHeadersMs: timings.responseHeadersMs,
    responseBodyMs: timings.responseBodyMs,
    cleanupMs: timings.cleanupMs,
    failureElapsedMs: timings.failureElapsedMs,
  });
}

function failureStage(code: string | undefined): ShadowAiProviderNeutralPlannerRunV1["provider"]["failureStage"] {
  if (code === "shadow_planner_provider_connection_establishment_failed") return "CONNECTION_ESTABLISHMENT";
  if (code === "shadow_planner_provider_connection_or_response_headers_failed") return "CONNECTION_OR_RESPONSE_HEADERS";
  if (code === "shadow_planner_provider_response_headers_failed") return "RESPONSE_HEADERS";
  if (code === "shadow_planner_provider_response_read_failed") return "RESPONSE_BODY";
  if (code === "shadow_planner_provider_session_cleanup_failed") return "SESSION_CLEANUP";
  return "UNCLASSIFIED";
}

async function awaitAbortCleanup(
  operation: Promise<{ kind: "value"; value: unknown } | { kind: "error"; error: unknown }>,
  graceMs: number,
): Promise<Readonly<{
  confirmed: boolean;
  settled: { kind: "value"; value: unknown } | { kind: "error"; error: unknown } | null;
}>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), graceMs);
  });
  const settled = await Promise.race([operation, expired]);
  if (timer) clearTimeout(timer);
  return { confirmed: settled !== null, settled };
}

function boundedMetadata(value: string | null): string | null {
  return value !== null && value.length <= 256 ? value : null;
}

function safeCompilationError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^shadow_planner_[a-z0-9_,:-]+$/i.test(message)
    ? message
    : "shadow_planner_request_compilation_failed";
}

function emptyAccounting(requestBytes: number): ShadowAiProviderNeutralPlannerRunV1["accounting"] {
  return Object.freeze({
    plannerOperationCount: 1 as const,
    providerCallAttempts: 0 as const,
    providerCallCompleted: 0 as const,
    providerNetworkCalls: 0 as const,
    requestBytes,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsdMicros: 0,
    latencyMs: 0,
    retries: 0 as const,
    researchOperations: 0 as const,
    sourceAdmissions: 0 as const,
  });
}

function accounting(
  adapter: ShadowAiPlannerTransportAdapterV1,
  requestBytes: number,
  usage: ShadowAiPlannerProviderUsageV1 | null,
  completed: boolean,
  networkAttempted = true,
): ShadowAiProviderNeutralPlannerRunV1["accounting"] {
  const provider = adapter.transport === "PROVIDER" && networkAttempted;
  return Object.freeze({
    plannerOperationCount: 1 as const,
    providerCallAttempts: provider ? 1 as const : 0 as const,
    providerCallCompleted: provider && completed ? 1 as const : 0 as const,
    providerNetworkCalls: provider ? 1 as const : 0 as const,
    requestBytes,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    estimatedCostUsdMicros: usage?.estimatedCostUsdMicros ?? 0,
    latencyMs: usage?.latencyMs ?? 0,
    retries: 0 as const,
    researchOperations: 0 as const,
    sourceAdmissions: 0 as const,
  });
}

function result(
  packet: ShadowAiEconomicResolutionPacketV1,
  provider: ShadowAiProviderNeutralPlannerRunV1["provider"],
  status: ShadowAiProviderNeutralPlannerRunV1["status"],
  plan: ShadowAiEconomicResolutionPlanV1 | null,
  runAccounting: ShadowAiProviderNeutralPlannerRunV1["accounting"],
  errorCodes: readonly string[],
  limitationCodes: readonly string[],
): ShadowAiProviderNeutralPlannerRunV1 {
  return deepFreeze({
    schemaVersion: SHADOW_AI_PROVIDER_NEUTRAL_RUN_SCHEMA_VERSION_V1,
    mode: "SHADOW" as const,
    authority: "EVALUATION_ONLY" as const,
    status,
    issueId: packet.issueId,
    inputHash: packet.immutableInputHash,
    plan,
    provider,
    accounting: runAccounting,
    deterministicResultPreserved: true as const,
    customerOutputCreated: false as const,
    errorCodes: [...new Set(errorCodes)].sort(),
    limitationCodes: [...new Set(limitationCodes)].sort(),
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
