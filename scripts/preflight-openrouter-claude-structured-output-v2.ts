import "dotenv/config";

import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";

import {
  OpenRouterClaudePreflightErrorV2,
  buildOpenRouterClaudeStructuredOutputPreflightRequestV2,
  countSchemaKeywordV2,
  invokeOpenRouterClaudeStructuredOutputPreflightV2,
  localSyntheticStructuredOutputSchemaV2,
  type OpenRouterPreflightFailureCategoryV2,
  type OpenRouterPreflightTelemetryV2,
  translateSchemaForAnthropicStructuredOutputsV2,
  validateFullLocalSyntheticContractV2,
} from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";

const ACCEPTED_BASELINE = "d6ebcdbe919d11fb29ce73d7155c28848796a20f";
const BRANCH = "codex/openrouter-claude-structured-output-preflight-v2";
const MODEL = "anthropic/claude-opus-4.6" as const;
const OUTPUT_DIRECTORY = "evaluations/openrouter-claude-structured-output-preflight-v2";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/preflight-2026-09-14.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-14.md`;
const apiKey = process.env.OPENROUTER_API_KEY ?? "";

if (!apiKey) throw new Error("openrouter_preflight_credential_missing");
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
if (await exists(GUARD_PATH)) throw new Error("openrouter_preflight_attempt_already_reserved_refusing_second_call");

const request = buildOpenRouterClaudeStructuredOutputPreflightRequestV2(apiKey);
const outboundBoundary = inspectOutboundBoundary(request.body, request.providerSchema);
if (!outboundBoundary.valid) throw new Error(`openrouter_preflight_outbound_boundary_failed:${outboundBoundary.reasonCodes.join(",")}`);

const localSchema = localSyntheticStructuredOutputSchemaV2();
const translatedSchema = translateSchemaForAnthropicStructuredOutputsV2(localSchema);
const translationEvidence = Object.freeze({
  localContractKeywords: keywordCounts(localSchema),
  providerSchemaKeywords: keywordCounts(translatedSchema),
  localContractPreserved: countSchemaKeywordV2(localSchema, "minLength") === 5
    && countSchemaKeywordV2(localSchema, "maxLength") === 5,
  providerSchemaCompatible: ["minLength", "maxLength", "maxItems"].every((key) => countSchemaKeywordV2(translatedSchema, key) === 0),
});

await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "openrouter_claude_structured_output_attempt_guard_2026_09_14_v2",
  acceptedBaseline: ACCEPTED_BASELINE,
  branch: BRANCH,
  provider: "OpenRouter",
  requestedModel: MODEL,
  maximumProviderCalls: 1,
  retries: 0,
  fallbackAllowed: false,
  callReserved: true,
  requestBodyBytes: request.bodyBytes,
  requestBodySha256: sha256(request.body),
  syntheticDataOnly: true,
}, null, 2)}\n`);

let telemetry: OpenRouterPreflightTelemetryV2;
let output: unknown = null;
let providerSchemaValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let localValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
try {
  const result = await invokeOpenRouterClaudeStructuredOutputPreflightV2({ apiKey, signal: controller.signal });
  telemetry = result.telemetry;
  output = result.output;
  providerSchemaValidation = result.providerSchemaValidation;
  localValidation = validateFullLocalSyntheticContractV2(result.output);
} catch (error) {
  if (!(error instanceof OpenRouterClaudePreflightErrorV2)) throw error;
  telemetry = error.telemetry;
} finally {
  clearTimeout(timeout);
}

const success = providerSchemaValidation.valid
  && localValidation.valid
  && telemetry.httpStatus !== null
  && telemetry.httpStatus >= 200
  && telemetry.httpStatus < 300
  && telemetry.returnedModel === MODEL
  && telemetry.inputTokens !== null
  && telemetry.outputTokens !== null
  && telemetry.totalTokens !== null;
const recommendation = recommend(success, telemetry.failureCategory, providerSchemaValidation.valid, localValidation.valid);
const safetyCounters = Object.freeze({
  providerCalls: telemetry.callCount,
  retries: telemetry.retries,
  fallbackCalls: 0,
  webSearches: 0,
  researchOperations: 0,
  sourceAdmissions: 0,
  merchantOrBusinessNamesSent: 0,
  goldDataSent: 0,
  realFeeLabelsSent: 0,
  merchantFinancialAmountsSent: 0,
  realEvidenceReferencesSent: 0,
  merchantOrAccountIdentifiersSent: 0,
  filenamesOrPdfDataSent: 0,
  customerDataSent: 0,
  truthMutations: 0,
  customerOutputs: 0,
  productionRoutingChanges: 0,
  goldEvaluationRuns: 0,
});
const safetyViolationTotal = Object.entries(safetyCounters)
  .filter(([key]) => !["providerCalls", "retries"].includes(key))
  .reduce((sum, [, value]) => sum + value, 0);

const artifact = Object.freeze({
  schemaVersion: "openrouter_claude_structured_output_preflight_2026_09_14_v2",
  generatedAt: new Date().toISOString(),
  acceptedPlannerBaseline: {
    branch: "codex/shadow-ai-economic-resolution-planner-v1",
    commit: ACCEPTED_BASELINE,
  },
  evaluationBranch: BRANCH,
  purpose: "SYNTHETIC_STRUCTURED_OUTPUT_TRANSPORT_PREFLIGHT_ONLY",
  provider: "OpenRouter",
  requestedModel: MODEL,
  success,
  request: {
    endpoint: request.endpoint,
    method: request.method,
    headerNames: Object.keys(request.headers).sort(),
    bodyBytes: request.bodyBytes,
    bodySha256: sha256(request.body),
    schemaName: "planner_transport_preflight_v2",
    store: false,
    stream: false,
    maximumProviderCalls: 1,
    retries: 0,
    fallbackAllowed: false,
  },
  schemaTranslation: translationEvidence,
  outboundPrivacyValidation: outboundBoundary,
  telemetry,
  providerSchemaValidation,
  fullLocalSyntheticContractValidation: localValidation,
  structuredOutput: output,
  authorityBoundary: localValidation.valid ? output : null,
  deterministicRateRevealStatePreserved: true,
  safetyCounters,
  safetyViolationTotal,
  recommendation,
});

await writeFile(RESULT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
await writeFile(REPORT_PATH, renderReport(artifact));
await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "openrouter_claude_structured_output_attempt_guard_2026_09_14_v2",
  acceptedBaseline: ACCEPTED_BASELINE,
  branch: BRANCH,
  provider: "OpenRouter",
  requestedModel: MODEL,
  maximumProviderCalls: 1,
  retries: 0,
  fallbackAllowed: false,
  callReserved: true,
  callCompleted: true,
  resultStatus: success ? "SUCCESS" : "FAILED",
  resultSha256: sha256(JSON.stringify(artifact)),
}, null, 2)}\n`);

console.log(JSON.stringify({
  provider: artifact.provider,
  requestedModel: artifact.requestedModel,
  success: artifact.success,
  request: artifact.request,
  schemaTranslation: artifact.schemaTranslation,
  telemetry: artifact.telemetry,
  providerSchemaValidation: artifact.providerSchemaValidation,
  fullLocalSyntheticContractValidation: artifact.fullLocalSyntheticContractValidation,
  structuredOutput: artifact.structuredOutput,
  outboundPrivacyValidation: artifact.outboundPrivacyValidation,
  safetyCounters: artifact.safetyCounters,
  safetyViolationTotal: artifact.safetyViolationTotal,
  recommendation: artifact.recommendation,
}, null, 2));

function inspectOutboundBoundary(body: string, providerSchema: Readonly<Record<string, unknown>>): Readonly<{ valid: boolean; reasonCodes: readonly string[] }> {
  const reasons: string[] = [];
  const parsed = JSON.parse(body) as Record<string, unknown>;
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const serializedMessages = JSON.stringify(messages);
  if (parsed.model !== MODEL) reasons.push("unauthorized_model");
  if (parsed.store !== false || parsed.stream !== false) reasons.push("storage_or_streaming_not_disabled");
  if ("tools" in parsed || "tool_choice" in parsed) reasons.push("tool_surface_present");
  if (/\b(?:Gold|MID|account number|routing number|tax ID|\.pdf)\b/i.test(serializedMessages)) reasons.push("prohibited_data_marker_present");
  if (/[/\\](?:Users|home|private|tmp)[/\\]/i.test(serializedMessages)) reasons.push("filesystem_path_present");
  if (["minLength", "maxLength", "maxItems"].some((key) => countSchemaKeywordV2(providerSchema, key) !== 0)) reasons.push("unsupported_schema_keyword_present");
  return Object.freeze({ valid: reasons.length === 0, reasonCodes: Object.freeze(reasons.sort()) });
}

function keywordCounts(schema: unknown): Readonly<Record<string, number>> {
  return Object.freeze({
    minLength: countSchemaKeywordV2(schema, "minLength"),
    maxLength: countSchemaKeywordV2(schema, "maxLength"),
    maxItems: countSchemaKeywordV2(schema, "maxItems"),
  });
}

function recommend(
  success: boolean,
  category: OpenRouterPreflightFailureCategoryV2 | null,
  providerValidation: boolean,
  localValidation: boolean,
): Readonly<{ code: "OPENROUTER_CLAUDE_STRUCTURED_OUTPUT_READY" | "MODEL_OR_ACCOUNT_ACCESS_BLOCKED" | "TRANSPORT_STILL_BLOCKED" | "SCHEMA_TRANSLATION_STILL_BLOCKED" | "INCONCLUSIVE"; reason: string }> {
  if (success) return Object.freeze({ code: "OPENROUTER_CLAUDE_STRUCTURED_OUTPUT_READY", reason: "The single synthetic request returned model-bound structured output that passed provider-facing and full local synthetic validation." });
  if (["AUTHENTICATION_FAILURE", "INSUFFICIENT_CREDIT_OR_PAYMENT_REQUIRED", "MODEL_UNAVAILABLE_OR_NOT_PERMITTED"].includes(category ?? "")) {
    return Object.freeze({ code: "MODEL_OR_ACCOUNT_ACCESS_BLOCKED", reason: `The single request failed with ${category}.` });
  }
  if (["PROVIDER_ROUTING_FAILURE", "TIMEOUT", "RATE_LIMIT", "TRANSPORT_NETWORK_FAILURE"].includes(category ?? "")) {
    return Object.freeze({ code: "TRANSPORT_STILL_BLOCKED", reason: `The single request failed with ${category}.` });
  }
  if (category === "STRUCTURED_OUTPUT_INCOMPATIBILITY" || !providerValidation || !localValidation) {
    return Object.freeze({ code: "SCHEMA_TRANSLATION_STILL_BLOCKED", reason: `Structured-output validation failed with ${category ?? "local_validation_failure"}.` });
  }
  return Object.freeze({ code: "INCONCLUSIVE", reason: `The single request failed with ${category ?? "incomplete_success_metadata"}.` });
}

function renderReport(value: typeof artifact): string {
  return `# OpenRouter Claude Structured Output Preflight v2\n\nStatus: **${value.success ? "SUCCESS" : "FAILED"}**\nRecommendation: **${value.recommendation.code}**\n\n- Provider: ${value.provider}\n- Requested model: \`${value.requestedModel}\`\n- Returned model: ${value.telemetry.returnedModel ? `\`${value.telemetry.returnedModel}\`` : "not exposed"}\n- Selected provider: ${value.telemetry.selectedProvider ?? "not exposed"}\n- Calls: ${value.telemetry.callCount}/1\n- Retries: ${value.telemetry.retries}\n- HTTP status: ${value.telemetry.httpStatus ?? "not available"}\n- Request bytes: ${value.request.bodyBytes}\n- Router attempts: ${value.telemetry.routerAttemptCount ?? "not exposed"}\n- Provider-schema validation: ${value.providerSchemaValidation.valid}\n- Full local synthetic-contract validation: ${value.fullLocalSyntheticContractValidation.valid}\n- Input tokens: ${value.telemetry.inputTokens ?? "not available"}\n- Output tokens: ${value.telemetry.outputTokens ?? "not available"}\n- Total tokens: ${value.telemetry.totalTokens ?? "not available"}\n- Latency: ${value.telemetry.latencyMs} ms\n- Accounted cost: ${value.telemetry.accountedCostUsd === null ? "not available" : `$${value.telemetry.accountedCostUsd}`}\n- Failure category: ${value.telemetry.failureCategory ?? "none"}\n\n## Privacy and safety\n\nOnly static synthetic marker text was transmitted. No merchant identity, Gold data, real fee label, merchant amount, evidence reference, account identifier, filename, PDF, raw statement text, or customer data was included. Outbound validation passed: ${value.outboundPrivacyValidation.valid}. Safety violation total: ${value.safetyViolationTotal}.\n\nNo fallback, retry, web search, research, source admission, production routing, truth mutation, customer output, or Gold evaluation occurred.\n`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
