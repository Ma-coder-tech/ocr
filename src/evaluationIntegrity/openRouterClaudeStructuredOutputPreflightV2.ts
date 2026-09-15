import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import { APPROVED_OPENROUTER_ENDPOINT } from "../canonical/v2/intelligence/providerPreflight.js";

export const OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2 = "anthropic/claude-opus-4.6" as const;
export const OPENROUTER_CLAUDE_PREFLIGHT_SCHEMA_NAME_V2 = "planner_transport_preflight_v2" as const;

const UNSUPPORTED_ANTHROPIC_GENERATION_KEYWORDS = new Set(["minLength", "maxLength", "maxItems"]);
const SYNTHETIC_OUTPUT_KEYS = Object.freeze([
  "outputType",
  "authority",
  "admissionStatus",
  "truthEffect",
  "financialMutationAllowed",
  "customerRenderingAllowed",
  "syntheticEcho",
] as const);

export type SyntheticStructuredOutputV2 = Readonly<{
  outputType: "AI_INFERENCE_ONLY";
  authority: "NON_AUTHORITATIVE";
  admissionStatus: "NOT_ADMITTED";
  truthEffect: "NONE";
  financialMutationAllowed: false;
  customerRenderingAllowed: false;
  syntheticEcho: "synthetic_preflight_only";
}>;

export type OpenRouterPreflightFailureCategoryV2 =
  | "AUTHENTICATION_FAILURE"
  | "INSUFFICIENT_CREDIT_OR_PAYMENT_REQUIRED"
  | "MODEL_UNAVAILABLE_OR_NOT_PERMITTED"
  | "PROVIDER_ROUTING_FAILURE"
  | "MALFORMED_REQUEST"
  | "STRUCTURED_OUTPUT_INCOMPATIBILITY"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "TRANSPORT_NETWORK_FAILURE"
  | "OTHER_PROVIDER_ERROR";

export type OpenRouterSafeProviderFailureKindV2 =
  | "JSON_SCHEMA_REJECTED"
  | "OUTPUT_REFERENCE_REJECTED"
  | "REQUEST_PARAMETER_REJECTED"
  | "REQUEST_SIZE_REJECTED"
  | "MODEL_ACCESS_REJECTED"
  | "AUTHENTICATION_REJECTED"
  | "PAYMENT_REJECTED"
  | "RATE_LIMIT_REJECTED"
  | "PROVIDER_ROUTING_REJECTED"
  | "OTHER_PROVIDER_ERROR";

export type OpenRouterPreflightTelemetryV2 = Readonly<{
  provider: "OpenRouter";
  requestedModel: typeof OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2;
  returnedModel: string | null;
  selectedProvider: string | null;
  callCount: 1;
  retries: 0;
  requestReachedOpenRouter: boolean;
  httpStatus: number | null;
  openRouterRequestId: string | null;
  generationId: string | null;
  contentType: string | null;
  headerReportedModel: string | null;
  headerReportedProvider: string | null;
  retryAfter: string | null;
  routerAttemptCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  timeToHeadersMs: number | null;
  bodyReadLatencyMs: number | null;
  accountedCostUsd: number | null;
  costMetadataAvailable: boolean;
  failureCategory: OpenRouterPreflightFailureCategoryV2 | null;
  safeErrorType: string | null;
  safeErrorCode: string | null;
  safeErrorParameter: string | null;
  safeErrorMessage: string | null;
  providerSafeErrorCode: string | null;
  providerFailureKind: OpenRouterSafeProviderFailureKindV2 | null;
  providerDiagnosticSource: "TOP_LEVEL" | "NESTED_METADATA" | null;
}>;

export type OpenRouterClaudePreflightRequestV2 = Readonly<{
  endpoint: typeof APPROVED_OPENROUTER_ENDPOINT;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: string;
  bodyBytes: number;
  providerSchema: Readonly<Record<string, unknown>>;
}>;

export class OpenRouterClaudePreflightErrorV2 extends Error {
  constructor(readonly telemetry: OpenRouterPreflightTelemetryV2) {
    super(telemetry.failureCategory ?? "OTHER_PROVIDER_ERROR");
    this.name = "OpenRouterClaudePreflightErrorV2";
  }
}

export function translateSchemaForAnthropicStructuredOutputsV2(schema: unknown): Readonly<Record<string, unknown>> {
  const translated = translateSchemaNode(schema, new Set<object>());
  if (!isRecord(translated)) throw new Error("provider_schema_root_invalid");
  return deepFreeze(translated);
}

export function localSyntheticStructuredOutputSchemaV2(): Readonly<Record<string, unknown>> {
  const constrainedString = (value: string) => ({ type: "string", const: value, minLength: value.length, maxLength: value.length });
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    properties: {
      outputType: constrainedString("AI_INFERENCE_ONLY"),
      authority: constrainedString("NON_AUTHORITATIVE"),
      admissionStatus: constrainedString("NOT_ADMITTED"),
      truthEffect: constrainedString("NONE"),
      financialMutationAllowed: { type: "boolean", const: false },
      customerRenderingAllowed: { type: "boolean", const: false },
      syntheticEcho: constrainedString("synthetic_preflight_only"),
    },
    required: [...SYNTHETIC_OUTPUT_KEYS],
  });
}

export function buildOpenRouterClaudeStructuredOutputPreflightRequestV2(apiKey: string): OpenRouterClaudePreflightRequestV2 {
  if (!apiKey) throw new Error("openrouter_preflight_api_key_required");
  const providerSchema = translateSchemaForAnthropicStructuredOutputsV2(localSyntheticStructuredOutputSchemaV2());
  assertProviderSchemaCompatibility(providerSchema);
  const body = canonicalJson({
    model: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    store: false,
    stream: false,
    temperature: 0,
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content: "Synthetic transport compatibility preflight. Return only the object required by response_format. Do not use tools, browse, research, or infer external facts.",
      },
      {
        role: "user",
        content: "Return the synthetic preflight marker. There is no merchant, statement, fee, amount, document, or customer data in this request.",
      },
    ],
    provider: { allow_fallbacks: false, require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: OPENROUTER_CLAUDE_PREFLIGHT_SCHEMA_NAME_V2,
        strict: true,
        schema: providerSchema,
      },
    },
  });
  return Object.freeze({
    endpoint: APPROVED_OPENROUTER_ENDPOINT,
    method: "POST" as const,
    headers: Object.freeze({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled",
    }),
    body,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    providerSchema,
  });
}

export async function invokeOpenRouterClaudeStructuredOutputPreflightV2(input: {
  apiKey: string;
  signal: AbortSignal;
  fetchImplementation?: typeof fetch;
}): Promise<Readonly<{
  output: SyntheticStructuredOutputV2;
  providerSchemaValidation: Readonly<{ valid: true; errors: readonly [] }>;
  telemetry: OpenRouterPreflightTelemetryV2;
  requestBodyBytes: number;
}>> {
  const request = buildOpenRouterClaudeStructuredOutputPreflightRequestV2(input.apiKey);
  const received = await sendOpenRouterClaudeJsonSchemaEvaluationRequestV2({
    request,
    signal: input.signal,
    fetchImplementation: input.fetchImplementation,
  });
  const providerValidation = validateProviderFacingSyntheticOutputV2(received.rawOutput);
  if (!providerValidation.valid) {
    throw new OpenRouterClaudePreflightErrorV2(structuredOutputRejectionTelemetry(
      received.telemetry,
      "provider_schema_validation_failed",
      providerValidation.errors.join(","),
    ));
  }
  return Object.freeze({
    output: providerValidation.output,
    providerSchemaValidation: Object.freeze({ valid: true as const, errors: [] as const }),
    telemetry: received.telemetry,
    requestBodyBytes: request.bodyBytes,
  });
}

export async function sendOpenRouterClaudeJsonSchemaEvaluationRequestV2(input: {
  request: OpenRouterClaudePreflightRequestV2;
  signal: AbortSignal;
  fetchImplementation?: typeof fetch;
}): Promise<Readonly<{
  rawOutput: unknown;
  telemetry: OpenRouterPreflightTelemetryV2;
}>> {
  const request = input.request;
  const fetchImplementation = input.fetchImplementation ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") throw new Error("openrouter_preflight_transport_unavailable");
  const started = performance.now();
  let response: Response;
  try {
    response = await fetchImplementation(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal: input.signal,
    });
  } catch (error) {
    throw new OpenRouterClaudePreflightErrorV2(failureTelemetry({
      latencyMs: performance.now() - started,
      httpStatus: null,
      category: classifyThrownError(error),
      message: safeMessage(error),
    }));
  }

  const headersReceivedAt = performance.now();
  const safeHeaders = safeResponseHeaders(response.headers);
  let responseBody: unknown;
  try {
    responseBody = await parseResponseBody(response);
  } catch (error) {
    const bodyReadFailedAt = performance.now();
    throw new OpenRouterClaudePreflightErrorV2(failureTelemetry({
      latencyMs: bodyReadFailedAt - started,
      timeToHeadersMs: headersReceivedAt - started,
      bodyReadLatencyMs: bodyReadFailedAt - headersReceivedAt,
      httpStatus: response.status,
      category: classifyThrownError(error),
      headers: safeHeaders,
      message: safeMessage(error),
    }));
  }
  const bodyCompletedAt = performance.now();
  if (!response.ok) {
    const safeError = safeProviderError(responseBody);
    throw new OpenRouterClaudePreflightErrorV2(failureTelemetry({
      latencyMs: bodyCompletedAt - started,
      timeToHeadersMs: headersReceivedAt - started,
      bodyReadLatencyMs: bodyCompletedAt - headersReceivedAt,
      httpStatus: response.status,
      category: classifyHttpFailure(response.status, safeError.message),
      responseBody,
      headers: safeHeaders,
      error: safeError,
    }));
  }

  const envelope = asRecord(responseBody);
  const choice = Array.isArray(envelope?.choices) ? asRecord(envelope.choices[0]) : null;
  const message = asRecord(choice?.message);
  let rawOutput: unknown;
  try {
    rawOutput = typeof message?.content === "string" ? JSON.parse(stripJsonFence(message.content)) : message?.parsed;
  } catch (error) {
    throw new OpenRouterClaudePreflightErrorV2(failureTelemetry({
      latencyMs: performance.now() - started,
      timeToHeadersMs: headersReceivedAt - started,
      bodyReadLatencyMs: bodyCompletedAt - headersReceivedAt,
      httpStatus: response.status,
      category: "STRUCTURED_OUTPUT_INCOMPATIBILITY",
      responseBody,
      headers: safeHeaders,
      error: {
        type: "structured_output_parse_error",
        code: "response_content_not_valid_json",
        parameter: "choices[0].message.content",
        message: safeMessage(error),
        providerCode: null,
        failureKind: "OTHER_PROVIDER_ERROR",
        diagnosticSource: "TOP_LEVEL",
      },
    }));
  }
  const telemetry = successTelemetry(responseBody, safeHeaders, response.status, {
    latencyMs: performance.now() - started,
    timeToHeadersMs: headersReceivedAt - started,
    bodyReadLatencyMs: bodyCompletedAt - headersReceivedAt,
  });
  return Object.freeze({ rawOutput, telemetry });
}

export function validateProviderFacingSyntheticOutputV2(value: unknown):
  | Readonly<{ valid: true; output: SyntheticStructuredOutputV2; errors: readonly [] }>
  | Readonly<{ valid: false; output: null; errors: readonly string[] }> {
  if (!isRecord(value)) return Object.freeze({ valid: false, output: null, errors: Object.freeze(["synthetic_output_not_object"]) });
  const errors: string[] = [];
  const keys = Object.keys(value).sort();
  const expectedKeys = [...SYNTHETIC_OUTPUT_KEYS].sort();
  if (canonicalJson(keys) !== canonicalJson(expectedKeys)) errors.push("synthetic_output_keys_invalid");
  if (value.outputType !== "AI_INFERENCE_ONLY") errors.push("synthetic_output_type_invalid");
  if (value.authority !== "NON_AUTHORITATIVE") errors.push("synthetic_authority_invalid");
  if (value.admissionStatus !== "NOT_ADMITTED") errors.push("synthetic_admission_status_invalid");
  if (value.truthEffect !== "NONE") errors.push("synthetic_truth_effect_invalid");
  if (value.financialMutationAllowed !== false) errors.push("synthetic_financial_mutation_invalid");
  if (value.customerRenderingAllowed !== false) errors.push("synthetic_customer_rendering_invalid");
  if (value.syntheticEcho !== "synthetic_preflight_only") errors.push("synthetic_echo_invalid");
  if (errors.length > 0) return Object.freeze({ valid: false, output: null, errors: Object.freeze([...new Set(errors)].sort()) });
  const output: SyntheticStructuredOutputV2 = deepFreeze({
    outputType: "AI_INFERENCE_ONLY",
    authority: "NON_AUTHORITATIVE",
    admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE",
    financialMutationAllowed: false,
    customerRenderingAllowed: false,
    syntheticEcho: "synthetic_preflight_only",
  });
  return Object.freeze({ valid: true as const, output, errors: [] as const });
}

export function validateFullLocalSyntheticContractV2(value: unknown): Readonly<{ valid: boolean; errors: readonly string[] }> {
  const validated = validateProviderFacingSyntheticOutputV2(value);
  if (!validated.valid) return Object.freeze({ valid: false, errors: validated.errors });
  const expected: SyntheticStructuredOutputV2 = {
    outputType: "AI_INFERENCE_ONLY",
    authority: "NON_AUTHORITATIVE",
    admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE",
    financialMutationAllowed: false,
    customerRenderingAllowed: false,
    syntheticEcho: "synthetic_preflight_only",
  };
  return Object.freeze(canonicalJson(validated.output) === canonicalJson(expected)
    ? { valid: true, errors: Object.freeze([]) }
    : { valid: false, errors: Object.freeze(["synthetic_local_contract_mismatch"]) });
}

export function countSchemaKeywordV2(value: unknown, keyword: string): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countSchemaKeywordV2(item, keyword), 0);
  if (!isRecord(value)) return 0;
  return Object.entries(value).reduce((total, [key, item]) => total + (key === keyword ? 1 : 0) + countSchemaKeywordV2(item, keyword), 0);
}

function assertProviderSchemaCompatibility(schema: unknown): void {
  for (const keyword of UNSUPPORTED_ANTHROPIC_GENERATION_KEYWORDS) {
    if (countSchemaKeywordV2(schema, keyword) !== 0) throw new Error(`provider_schema_unsupported_keyword:${keyword}`);
  }
}

function translateSchemaNode(value: unknown, ancestors: Set<object>): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error("provider_schema_recursive_structure_unsupported");
    const next = new Set(ancestors).add(value);
    return value.map((item) => translateSchemaNode(item, next));
  }
  if (!isRecord(value)) return value;
  if (ancestors.has(value)) throw new Error("provider_schema_recursive_structure_unsupported");
  const next = new Set(ancestors).add(value);
  const translated: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!UNSUPPORTED_ANTHROPIC_GENERATION_KEYWORDS.has(key)) translated[key] = translateSchemaNode(item, next);
  }
  return translated;
}

function successTelemetry(
  body: unknown,
  headers: SafeHeaders,
  status: number,
  timings: Readonly<{ latencyMs: number; timeToHeadersMs: number; bodyReadLatencyMs: number }>,
): OpenRouterPreflightTelemetryV2 {
  const envelope = asRecord(body);
  const usage = asRecord(envelope?.usage);
  const routing = safeRouting(body);
  const cost = safeCost(usage?.cost);
  return Object.freeze({
    provider: "OpenRouter",
    requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    returnedModel: safeIdentifier(envelope?.model) ?? headers.model,
    selectedProvider: routing.selectedProvider ?? headers.provider,
    callCount: 1,
    retries: 0,
    requestReachedOpenRouter: true,
    httpStatus: status,
    openRouterRequestId: headers.requestId,
    generationId: headers.generationId ?? safeIdentifier(envelope?.id),
    contentType: headers.contentType,
    headerReportedModel: headers.model,
    headerReportedProvider: headers.provider,
    retryAfter: headers.retryAfter,
    routerAttemptCount: routing.attemptCount,
    inputTokens: safeInteger(usage?.prompt_tokens),
    outputTokens: safeInteger(usage?.completion_tokens),
    totalTokens: safeInteger(usage?.total_tokens),
    latencyMs: elapsed(timings.latencyMs),
    timeToHeadersMs: elapsed(timings.timeToHeadersMs),
    bodyReadLatencyMs: elapsed(timings.bodyReadLatencyMs),
    accountedCostUsd: cost,
    costMetadataAvailable: cost !== null,
    failureCategory: null,
    safeErrorType: null,
    safeErrorCode: null,
    safeErrorParameter: null,
    safeErrorMessage: null,
    providerSafeErrorCode: null,
    providerFailureKind: null,
    providerDiagnosticSource: null,
  });
}

function structuredOutputRejectionTelemetry(
  telemetry: OpenRouterPreflightTelemetryV2,
  code: string,
  message: string,
): OpenRouterPreflightTelemetryV2 {
  return Object.freeze({
    ...telemetry,
    failureCategory: "STRUCTURED_OUTPUT_INCOMPATIBILITY" as const,
    safeErrorType: "structured_output_validation_error",
    safeErrorCode: safeIdentifier(code),
    safeErrorParameter: null,
    safeErrorMessage: safeProviderMessage(message),
    providerSafeErrorCode: null,
    providerFailureKind: "JSON_SCHEMA_REJECTED" as const,
    providerDiagnosticSource: null,
  });
}

function failureTelemetry(input: {
  latencyMs: number;
  timeToHeadersMs?: number;
  bodyReadLatencyMs?: number;
  httpStatus: number | null;
  category: OpenRouterPreflightFailureCategoryV2;
  responseBody?: unknown;
  headers?: SafeHeaders;
  error?: SafeProviderError;
  message?: string | null;
}): OpenRouterPreflightTelemetryV2 {
  const envelope = asRecord(input.responseBody);
  const usage = asRecord(envelope?.usage);
  const routing = safeRouting(input.responseBody);
  const cost = safeCost(usage?.cost);
  return Object.freeze({
    provider: "OpenRouter",
    requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    returnedModel: safeIdentifier(envelope?.model) ?? input.headers?.model ?? null,
    selectedProvider: routing.selectedProvider ?? input.headers?.provider ?? null,
    callCount: 1,
    retries: 0,
    requestReachedOpenRouter: input.httpStatus !== null,
    httpStatus: input.httpStatus,
    openRouterRequestId: input.headers?.requestId ?? null,
    generationId: input.headers?.generationId ?? safeIdentifier(envelope?.id),
    contentType: input.headers?.contentType ?? null,
    headerReportedModel: input.headers?.model ?? null,
    headerReportedProvider: input.headers?.provider ?? null,
    retryAfter: input.headers?.retryAfter ?? null,
    routerAttemptCount: routing.attemptCount,
    inputTokens: safeInteger(usage?.prompt_tokens),
    outputTokens: safeInteger(usage?.completion_tokens),
    totalTokens: safeInteger(usage?.total_tokens),
    latencyMs: elapsed(input.latencyMs),
    timeToHeadersMs: input.timeToHeadersMs === undefined ? null : elapsed(input.timeToHeadersMs),
    bodyReadLatencyMs: input.bodyReadLatencyMs === undefined ? null : elapsed(input.bodyReadLatencyMs),
    accountedCostUsd: cost,
    costMetadataAvailable: cost !== null,
    failureCategory: input.category,
    safeErrorType: input.error?.type ?? null,
    safeErrorCode: input.error?.code ?? null,
    safeErrorParameter: input.error?.parameter ?? null,
    safeErrorMessage: input.error?.message ?? input.message ?? null,
    providerSafeErrorCode: input.error?.providerCode ?? null,
    providerFailureKind: input.error?.failureKind ?? null,
    providerDiagnosticSource: input.error?.diagnosticSource ?? null,
  });
}

type SafeHeaders = Readonly<{
  requestId: string | null;
  generationId: string | null;
  contentType: string | null;
  model: string | null;
  provider: string | null;
  retryAfter: string | null;
}>;
type SafeProviderError = Readonly<{
  type: string | null;
  code: string | null;
  parameter: string | null;
  message: string | null;
  providerCode: string | null;
  failureKind: OpenRouterSafeProviderFailureKindV2;
  diagnosticSource: "TOP_LEVEL" | "NESTED_METADATA";
}>;

function safeResponseHeaders(headers: Headers): SafeHeaders {
  return Object.freeze({
    requestId: safeIdentifier(headers.get("x-request-id")),
    generationId: safeIdentifier(headers.get("x-generation-id")),
    contentType: safeContentType(headers.get("content-type")),
    model: safeIdentifier(headers.get("x-openrouter-model")),
    provider: safeIdentifier(headers.get("x-openrouter-provider")),
    retryAfter: safeRetryAfter(headers.get("retry-after")),
  });
}

function safeProviderError(body: unknown): SafeProviderError {
  const envelope = asRecord(body);
  const error = asRecord(envelope?.error);
  const metadata = asRecord(error?.metadata);
  const nestedEnvelope = parseNestedProviderDiagnostic(metadata?.raw);
  const nestedError = asRecord(nestedEnvelope?.error) ?? nestedEnvelope;
  const combinedText = [
    error?.type, error?.code, error?.param, error?.message,
    metadata?.provider_error_code, metadata?.code,
    nestedError?.type, nestedError?.code, nestedError?.param, nestedError?.parameter, nestedError?.message,
  ].filter((value): value is string | number => typeof value === "string" || typeof value === "number").join(" ");
  const failureKind = classifySafeProviderFailureKind(combinedText);
  const diagnosticSource = nestedError ? "NESTED_METADATA" as const : "TOP_LEVEL" as const;
  return Object.freeze({
    type: safeErrorIdentifier(nestedError?.type ?? error?.type),
    code: safeErrorIdentifier(nestedError?.code ?? error?.code),
    parameter: safeProviderParameter(nestedError?.param ?? nestedError?.parameter ?? error?.param),
    message: normalizedSafeProviderMessage(failureKind, combinedText),
    providerCode: safeErrorIdentifier(metadata?.provider_error_code ?? metadata?.code ?? nestedError?.code),
    failureKind,
    diagnosticSource,
  });
}

function parseNestedProviderDiagnostic(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || value.length === 0 || value.length > 100_000) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function classifySafeProviderFailureKind(value: string): OpenRouterSafeProviderFailureKindV2 {
  if (/json.?schema|response.?format|structured.?output|invalid.?schema|schema.{0,30}(?:invalid|unsupported|too (?:large|complex)|limit)/i.test(value)) {
    return "JSON_SCHEMA_REJECTED";
  }
  if (/request.{0,20}(?:too large|size|payload)|body.{0,20}too large/i.test(value)) return "REQUEST_SIZE_REJECTED";
  if (/rate.?limit|too many requests/i.test(value)) return "RATE_LIMIT_REJECTED";
  if (/credit|balance|payment required|insufficient funds/i.test(value)) return "PAYMENT_REJECTED";
  if (/auth(?:entication|orization).{0,20}(?:failed|invalid)|invalid.?api.?key|unauthorized/i.test(value)) return "AUTHENTICATION_REJECTED";
  if (/model.{0,40}(?:unavailable|not found|not supported|not permitted|access)/i.test(value)) return "MODEL_ACCESS_REJECTED";
  if (/provider.{0,30}(?:route|routing|unavailable)|no endpoints/i.test(value)) return "PROVIDER_ROUTING_REJECTED";
  if (/invalid.?parameter|invalid.?request|parameter|\bparam\b/i.test(value)) return "REQUEST_PARAMETER_REJECTED";
  return "OTHER_PROVIDER_ERROR";
}

function normalizedSafeProviderMessage(kind: OpenRouterSafeProviderFailureKindV2, rawClassificationText: string): string {
  const messages: Record<OpenRouterSafeProviderFailureKindV2, string> = {
    JSON_SCHEMA_REJECTED: "Provider rejected the structured-output JSON schema.",
    OUTPUT_REFERENCE_REJECTED: "Provider output failed the reference-alias boundary.",
    REQUEST_PARAMETER_REJECTED: "Provider rejected a request parameter.",
    REQUEST_SIZE_REJECTED: "Provider rejected the request size.",
    MODEL_ACCESS_REJECTED: "Provider rejected model access.",
    AUTHENTICATION_REJECTED: "Provider rejected authentication.",
    PAYMENT_REJECTED: "Provider rejected the request for account-credit or payment reasons.",
    RATE_LIMIT_REJECTED: "Provider rejected the request because of rate limiting.",
    PROVIDER_ROUTING_REJECTED: "Provider routing failed.",
    OTHER_PROVIDER_ERROR: /^provider returned error\.?$/i.test(rawClassificationText.trim())
      ? "Provider returned error."
      : "Provider returned an unclassified error.",
  };
  return messages[kind];
}

function safeErrorIdentifier(value: unknown): string | null {
  const identifier = safeIdentifier(value)?.toLowerCase() ?? null;
  if (!identifier) return null;
  if (/^\d{3}$/.test(identifier)) return identifier;
  const normalized = identifier.replace(/[./:@-]+/g, "_");
  if (/^(?:invalid_request_error|invalid_json_schema|invalid_schema|schema_unsupported|unsupported_schema|invalid_parameter|request_too_large|rate_limit(?:ed)?|authentication_error|unauthorized|payment_required|insufficient_credit|model_unavailable|provider_error)$/.test(normalized)) {
    return normalized;
  }
  if (/schema/.test(normalized) && /invalid|unsupported|reject|limit|large|complex/.test(normalized)) return "invalid_json_schema";
  return null;
}

function safeProviderParameter(value: unknown): string | null {
  const identifier = safeIdentifier(value)?.toLowerCase() ?? null;
  if (!identifier) return null;
  return /^(?:response_format(?:\.json_schema(?:\.schema)?)?|model|messages|provider|max_tokens|temperature|store|stream)$/.test(identifier)
    ? identifier
    : null;
}

function safeRouting(body: unknown): Readonly<{ selectedProvider: string | null; attemptCount: number | null }> {
  const envelope = asRecord(body);
  const metadata = asRecord(envelope?.openrouter_metadata);
  const attempts = Array.isArray(metadata?.attempts) ? metadata.attempts : null;
  const lastAttempt = attempts && attempts.length > 0 ? asRecord(attempts[attempts.length - 1]) : null;
  const selectedProvider = safeIdentifier(envelope?.provider)
    ?? safeIdentifier(metadata?.provider)
    ?? safeIdentifier(lastAttempt?.provider_name)
    ?? safeIdentifier(lastAttempt?.provider);
  return Object.freeze({ selectedProvider, attemptCount: attempts ? attempts.length : null });
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { type: "non_json_response", code: "non_json_response", message: `Provider returned non-JSON content (${Buffer.byteLength(text, "utf8")} bytes).` } };
  }
}

function classifyHttpFailure(status: number, message: string | null): OpenRouterPreflightFailureCategoryV2 {
  const text = message ?? "";
  if (status === 401) return "AUTHENTICATION_FAILURE";
  if (status === 402 || /credit|balance|payment required|insufficient funds/i.test(text)) return "INSUFFICIENT_CREDIT_OR_PAYMENT_REQUIRED";
  if (status === 403 && /model|permission|permitted|access/i.test(text)) return "MODEL_UNAVAILABLE_OR_NOT_PERMITTED";
  if (status === 403) return "AUTHENTICATION_FAILURE";
  if (status === 404 || /model.{0,40}(?:unavailable|not found|not supported|not permitted)/i.test(text)) return "MODEL_UNAVAILABLE_OR_NOT_PERMITTED";
  if (status === 429) return "RATE_LIMIT";
  if (status === 400 && /response.?format|json.?schema|structured|schema/i.test(text)) return "STRUCTURED_OUTPUT_INCOMPATIBILITY";
  if (status === 400 || status === 422) return "MALFORMED_REQUEST";
  if ([502, 503, 504].includes(status) || /provider.{0,30}(?:route|routing|unavailable)|no endpoints/i.test(text)) return "PROVIDER_ROUTING_FAILURE";
  return "OTHER_PROVIDER_ERROR";
}

function classifyThrownError(error: unknown): OpenRouterPreflightFailureCategoryV2 {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/abort|timeout/i.test(text)) return "TIMEOUT";
  if (/fetch failed|network|socket|dns|econn|enotfound|tls/i.test(text)) return "TRANSPORT_NETWORK_FAILURE";
  return "OTHER_PROVIDER_ERROR";
}

function safeProviderMessage(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, "[authorization-redacted]")
    .replace(/\b(?:sk-or-v1-|sk-)[A-Za-z0-9_-]+\b/g, "[credential-redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400) || null;
}

function safeMessage(error: unknown): string | null {
  return safeProviderMessage(error instanceof Error ? error.message : String(error));
}

function safeIdentifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && /^[A-Za-z0-9_./:@-]{1,200}$/.test(value) ? value : null;
}

function safeRetryAfter(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9,: .+-]{1,120}$/.test(value) ? value : null;
}

function safeContentType(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const sanitized = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=(?:[A-Za-z0-9!#$&^_.+-]+|"[A-Za-z0-9 ._+-]+"))*$/.test(sanitized)
    ? sanitized
    : null;
}

function safeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeCost(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function elapsed(value: number): number {
  return Math.max(0, Math.round(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
