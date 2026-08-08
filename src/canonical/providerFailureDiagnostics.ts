export const SAFE_PROVIDER_FAILURE_REASON_CODES = [
  "provider_auth_failed",
  "provider_invalid_request",
  "provider_schema_rejected",
  "provider_model_unavailable",
  "provider_rate_limited",
  "provider_server_error",
  "provider_network_failed",
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

export class SafeProviderFailureError extends Error {
  readonly code: string;
  readonly reasonCode: SafeProviderFailureReasonCode;
  readonly reasonCodes: string[];
  readonly accounting: { requestId: string | null };

  constructor(diagnostic: SafeProviderFailureDiagnostic) {
    super(diagnostic.reasonCode);
    this.name = "SafeProviderFailureError";
    this.code = diagnostic.reasonCode === "provider_call_timed_out" ? "provider_timeout" : diagnostic.reasonCode;
    this.reasonCode = diagnostic.reasonCode;
    this.reasonCodes = diagnostic.reasonCodes;
    this.accounting = { requestId: diagnostic.requestId };
  }
}

export function safeProviderFailureError(error: unknown, response?: {
  status?: unknown;
  headers?: unknown;
  body?: unknown;
}): SafeProviderFailureError {
  return new SafeProviderFailureError(normalizeProviderFailure(error, response));
}

export function safeProviderPostResponseFailureError(
  reasonCode: "provider_refused" | "provider_required_tool_missing" | "provider_usage_exceeded_approved_transport_limits",
  responseId: unknown,
): SafeProviderFailureError {
  return new SafeProviderFailureError({
    reasonCode,
    reasonCodes: [reasonCode],
    requestId: safeRequestId(responseId),
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
}): SafeProviderFailureDiagnostic {
  const record = asRecord(error);
  const body = asRecord(response?.body) ?? asRecord(record?.data);
  const nestedError = asRecord(body?.error) ?? body;
  const status = safeHttpStatus(response?.status ?? record?.statusCode ?? record?.status);
  const type = allowlisted(nestedError?.type ?? record?.type, ALLOWED_ERROR_TYPES);
  const code = allowlisted(nestedError?.code ?? record?.code, ALLOWED_ERROR_CODES);
  const rawCode = typeof record?.code === "string" ? record.code : null;
  const name = typeof record?.name === "string" ? record.name : "";
  const reasonCode = classifyFailure({ status, type, code, rawCode, name });
  const reasonCodes: string[] = [reasonCode];
  if (status !== null) reasonCodes.push(`provider_http_status_${status}`);
  if (type) reasonCodes.push(`provider_error_type_${type}`);
  if (code) reasonCodes.push(`provider_error_code_${code}`);
  return {
    reasonCode,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    requestId: requestIdFromHeaders(response?.headers ?? record?.responseHeaders ?? asRecord(record?.response)?.headers),
  };
}

function classifyFailure(input: {
  status: number | null;
  type: string | null;
  code: string | null;
  rawCode: string | null;
  name: string;
}): SafeProviderFailureReasonCode {
  if (input.name === "AbortError" || input.rawCode === "provider_timeout" || input.status === 408 || input.status === 504) return "provider_call_timed_out";
  if (input.status === 401 || input.status === 403 || input.type === "authentication_error" || input.type === "permission_error" || (input.code && AUTH_CODES.has(input.code))) return "provider_auth_failed";
  if (input.code && SCHEMA_CODES.has(input.code)) return "provider_schema_rejected";
  if (input.status === 404 || (input.code && MODEL_CODES.has(input.code))) return "provider_model_unavailable";
  if (input.status === 429 || input.type === "rate_limit_error" || (input.code && RATE_LIMIT_CODES.has(input.code))) return "provider_rate_limited";
  if ((input.status !== null && input.status >= 500) || input.type === "api_error" || input.type === "server_error") return "provider_server_error";
  if (input.status === 400 || input.status === 409 || input.status === 422 || input.type === "invalid_request_error") return "provider_invalid_request";
  if (input.rawCode && NETWORK_CODES.has(input.rawCode)) return "provider_network_failed";
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

function safeHttpStatus(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;
}

function allowlisted(value: unknown, allowed: ReadonlySet<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function safeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_]{1,100}$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
