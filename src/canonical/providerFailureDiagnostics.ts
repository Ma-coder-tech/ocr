export const SAFE_PROVIDER_FAILURE_REASON_CODES = [
  "provider_auth_failed",
  "provider_invalid_request",
  "provider_schema_rejected",
  "provider_model_unavailable",
  "provider_rate_limited",
  "provider_server_error",
  "provider_network_failed",
  "provider_structured_output_failed",
  "provider_output_exhausted",
  "provider_call_timed_out",
  "provider_refused",
  "provider_required_tool_missing",
  "provider_usage_exceeded_approved_transport_limits",
] as const;

export type SafeProviderFailureReasonCode = (typeof SAFE_PROVIDER_FAILURE_REASON_CODES)[number];

export type SafeProviderFailureDiagnostic = {
  reasonCode: SafeProviderFailureReasonCode;
  reasonCodes: string[];
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

export type SafeProviderFailureOperationPhase =
  | "local_preflight"
  | "request_serialization"
  | "request_construction"
  | "request_initiation"
  | "response_wait"
  | "provider_response"
  | "sdk_structured_output_handling"
  | "ratereveal_validation";

export type SafeProviderFailureContext = {
  operationPhase?: SafeProviderFailureOperationPhase;
  transport?: string;
  localTraceId?: string | null;
  httpSendInitiated?: boolean | null;
  providerResponseReceived?: boolean | null;
  httpStatus?: number | null;
  requestId?: string | null;
};

const ALLOWED_ERROR_TYPES = new Set([
  "api_error",
  "authentication_error",
  "invalid_request_error",
  "permission_error",
  "rate_limit_error",
  "server_error",
]);

const ALLOWED_ERROR_CODES = new Set([
  "authentication_required",
  "billing_not_active",
  "context_length_exceeded",
  "insufficient_permissions",
  "insufficient_quota",
  "invalid_api_key",
  "invalid_json_schema",
  "invalid_model",
  "invalid_request_error",
  "model_not_found",
  "project_not_found",
  "rate_limit_exceeded",
  "unsupported_model",
]);

const AUTH_CODES = new Set(["authentication_required", "billing_not_active", "insufficient_permissions", "invalid_api_key", "project_not_found"]);
const MODEL_CODES = new Set(["invalid_model", "model_not_found", "unsupported_model"]);
const SCHEMA_CODES = new Set(["invalid_json_schema"]);
const RATE_LIMIT_CODES = new Set(["insufficient_quota", "rate_limit_exceeded"]);
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ENOTFOUND", "EPIPE", "UND_ERR_CONNECT_TIMEOUT"]);
const OUTPUT_EXHAUSTION_FINISH_REASONS = new Set(["length", "max_tokens", "output_token_limit", "token_limit"]);

export class SafeProviderFailureError extends Error {
  readonly code: string;
  readonly reasonCode: SafeProviderFailureReasonCode;
  readonly reasonCodes: string[];
  readonly accounting: {
    requestId: string | null;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
  };

  constructor(diagnostic: SafeProviderFailureDiagnostic) {
    super(diagnostic.reasonCode);
    this.name = "SafeProviderFailureError";
    this.code = diagnostic.reasonCode === "provider_call_timed_out" ? "provider_timeout" : diagnostic.reasonCode;
    this.reasonCode = diagnostic.reasonCode;
    this.reasonCodes = diagnostic.reasonCodes;
    this.accounting = {
      requestId: diagnostic.requestId,
      inputTokens: diagnostic.inputTokens,
      cachedInputTokens: diagnostic.cachedInputTokens,
      outputTokens: diagnostic.outputTokens,
    };
  }
}

export function safeProviderFailureError(error: unknown, response?: {
  status?: unknown;
  headers?: unknown;
  body?: unknown;
}, context: SafeProviderFailureContext = {}): SafeProviderFailureError {
  return new SafeProviderFailureError(normalizeProviderFailure(error, response, context));
}

export function safeProviderPostResponseFailureError(
  reasonCode: "provider_refused" | "provider_required_tool_missing" | "provider_usage_exceeded_approved_transport_limits",
  responseId: unknown,
): SafeProviderFailureError {
  return new SafeProviderFailureError({
    reasonCode,
    reasonCodes: [reasonCode],
    requestId: safeRequestId(responseId),
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
  });
}

export function safeProviderReasonCodes(error: unknown, fallback: string): string[] {
  if (!(error instanceof SafeProviderFailureError)) return [fallback];
  const record = asRecord(error);
  const reasonCodes = Array.isArray(record?.reasonCodes)
    ? record.reasonCodes.filter((value): value is string => safeCode(value))
    : [];
  return [...new Set(reasonCodes.length > 0 ? reasonCodes : [fallback])].sort();
}

export function safeProviderReasonCode(error: unknown, fallback: string): string {
  if (!(error instanceof SafeProviderFailureError)) return fallback;
  const record = asRecord(error);
  return safeCode(record?.reasonCode) ? record.reasonCode : fallback;
}

function normalizeProviderFailure(error: unknown, response?: {
  status?: unknown;
  headers?: unknown;
  body?: unknown;
}, context: SafeProviderFailureContext = {}): SafeProviderFailureDiagnostic {
  const record = asRecord(error);
  const body = asRecord(response?.body) ?? asRecord(record?.data);
  const nestedError = asRecord(body?.error) ?? body;
  const status = safeHttpStatus(response?.status ?? context.httpStatus ?? record?.statusCode ?? record?.status);
  const type = allowlisted(nestedError?.type ?? record?.type, ALLOWED_ERROR_TYPES);
  const code = allowlisted(nestedError?.code ?? record?.code, ALLOWED_ERROR_CODES);
  const rawCode = firstString(record?.code, asRecord(record?.cause)?.code, asRecord(record?.error)?.code);
  const name = typeof record?.name === "string" ? record.name : "";
  const finishReason = safeFinishReason(
    record?.finishReason,
    asRecord(record?.cause)?.finishReason,
    asRecord(record?.response)?.finishReason,
    asRecord(record?.result)?.finishReason,
  );
  const reasonCode = classifyFailure({
    status,
    type,
    code,
    rawCode,
    name,
    operationPhase: context.operationPhase ?? null,
    finishReason,
  });
  const reasonCodes: string[] = [reasonCode];
  if (status !== null) reasonCodes.push(`provider_http_status_${status}`);
  if (status !== null) reasonCodes.push(`provider_http_status_class_${Math.floor(status / 100)}xx`);
  if (type) reasonCodes.push(`provider_error_type_${type}`);
  if (code) reasonCodes.push(`provider_error_code_${code}`);
  else if (rawCode) reasonCodes.push(`provider_error_code_${safeToken(rawCode)}`);
  if (name) reasonCodes.push(`provider_sdk_error_class_${safeToken(name)}`);
  if (finishReason) reasonCodes.push(`provider_finish_reason_${finishReason}`);
  if (context.operationPhase) reasonCodes.push(`provider_phase_${context.operationPhase}`);
  const transport = safeOptionalCode(context.transport);
  if (transport) reasonCodes.push(`provider_transport_${transport}`);
  const localTraceId = safeLocalTraceId(context.localTraceId);
  if (localTraceId) reasonCodes.push(`provider_trace_${localTraceId}`);
  if (hasOwn(context, "httpSendInitiated")) {
    if (context.httpSendInitiated === true) reasonCodes.push("provider_http_send_initiated");
    else if (context.httpSendInitiated === false) reasonCodes.push("provider_http_send_not_initiated");
    else reasonCodes.push("provider_http_send_status_unknown");
  }
  if (hasOwn(context, "providerResponseReceived")) {
    if (context.providerResponseReceived === true) reasonCodes.push("provider_response_received");
    else if (context.providerResponseReceived === false) reasonCodes.push("provider_response_not_received");
    else reasonCodes.push("provider_response_status_unknown");
  }
  const usage = safeUsageFromError(record);
  return {
    reasonCode,
    reasonCodes: [...new Set(reasonCodes.filter(safeCode))].sort(),
    requestId: safeRequestId(context.requestId)
      ?? safeRequestId(asRecord(record?.response)?.id)
      ?? safeRequestId(asRecord(asRecord(record?.result)?.response)?.id)
      ?? requestIdFromHeaders(response?.headers ?? record?.responseHeaders ?? asRecord(record?.response)?.headers),
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
  };
}

function classifyFailure(input: {
  status: number | null;
  type: string | null;
  code: string | null;
  rawCode: string | null;
  name: string;
  operationPhase: SafeProviderFailureOperationPhase | null;
  finishReason: string | null;
}): SafeProviderFailureReasonCode {
  if (input.name === "AbortError" || input.rawCode === "provider_timeout" || input.status === 408 || input.status === 504) return "provider_call_timed_out";
  if (input.status === 401 || input.status === 403 || input.type === "authentication_error" || input.type === "permission_error" || (input.code && AUTH_CODES.has(input.code))) return "provider_auth_failed";
  if (input.code && SCHEMA_CODES.has(input.code)) return "provider_schema_rejected";
  if (input.status === 404 || (input.code && MODEL_CODES.has(input.code))) return "provider_model_unavailable";
  if (input.status === 429 || input.type === "rate_limit_error" || (input.code && RATE_LIMIT_CODES.has(input.code))) return "provider_rate_limited";
  if ((input.status !== null && input.status >= 500) || input.type === "api_error" || input.type === "server_error") return "provider_server_error";
  if (input.status === 400 || input.status === 409 || input.status === 422 || input.type === "invalid_request_error") return "provider_invalid_request";
  if (input.rawCode && NETWORK_CODES.has(input.rawCode)) return "provider_network_failed";
  if (input.finishReason && OUTPUT_EXHAUSTION_FINISH_REASONS.has(input.finishReason)) return "provider_output_exhausted";
  if (input.operationPhase === "sdk_structured_output_handling") return "provider_structured_output_failed";
  return "provider_network_failed";
}

function requestIdFromHeaders(value: unknown): string | null {
  let requestId: unknown;
  if (value instanceof Headers) requestId = value.get("x-request-id");
  else {
    const headers = asRecord(value);
    requestId = headers?.["x-request-id"] ?? headers?.["X-Request-Id"] ?? headers?.["X-Request-ID"];
  }
  return safeRequestId(requestId);
}

function safeRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
}

function safeFinishReason(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const token = safeToken(value);
    if (safeCode(token)) return token;
  }
  return null;
}

function safeUsageFromError(record: Record<string, unknown> | null): {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
} {
  const usage = asRecord(record?.usage)
    ?? asRecord(asRecord(record?.cause)?.usage)
    ?? asRecord(asRecord(record?.response)?.usage)
    ?? asRecord(asRecord(record?.result)?.usage);
  const inputTokenDetails = asRecord(usage?.inputTokenDetails);
  return {
    inputTokens: safeNonnegativeInteger(usage?.inputTokens),
    cachedInputTokens: safeNonnegativeInteger(inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens),
    outputTokens: safeNonnegativeInteger(usage?.outputTokens),
  };
}

function safeNonnegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeHttpStatus(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;
}

function allowlisted(value: unknown, allowed: ReadonlySet<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function safeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_]{1,100}$/.test(value);
}

function safeOptionalCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = safeToken(value);
  return safeCode(token) ? token : null;
}

function safeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "unknown";
}

function safeLocalTraceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  return /^[a-f0-9]{8,32}$/.test(normalized) ? normalized : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
