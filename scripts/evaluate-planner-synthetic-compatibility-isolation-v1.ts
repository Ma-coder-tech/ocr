import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import {
  createSyntheticFullPlannerPacketV1,
  validateProviderFacingFullPlannerShapeV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  OpenRouterClaudePreflightErrorV2,
  sendOpenRouterClaudeJsonSchemaEvaluationRequestV2,
  validateProviderFacingSyntheticOutputV2,
  type OpenRouterClaudePreflightRequestV2,
  type OpenRouterPreflightTelemetryV2,
} from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import {
  buildHistoricalAcceptedFullSyntheticRequestV1,
  buildHistoricalFullSyntheticTypedPatternVariantV1,
  compareHistoricalFullSyntheticToTypedPatternVariantV1,
  reconstructForensicAnchorsV1,
} from "../src/evaluationIntegrity/plannerRequestShapeForensicDifferentialV1.js";

const PARENT = "e0cd5e959ab610590fcc8ca1472a6572e83fe2d6";
const BRANCH = "codex/planner-synthetic-compatibility-isolation-v1";
const MAX_CALLS = 3;
const TIMEOUT_MS = 90_000;
const OUTPUT_DIRECTORY = "evaluations/planner-synthetic-compatibility-isolation-v1";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/evaluation-2026-09-16.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-16.md`;
const DRY_RUN = process.env.PLANNER_SYNTHETIC_COMPATIBILITY_ISOLATION_DRY_RUN === "true";
const API_KEY = DRY_RUN ? "offline-placeholder-never-transmitted" : process.env.OPENROUTER_API_KEY ?? "";

if (!API_KEY) throw new Error("planner_synthetic_compatibility_isolation_openrouter_key_missing");
if (!DRY_RUN && await exists(GUARD_PATH)) throw new Error("planner_synthetic_compatibility_isolation_attempt_already_reserved");

const syntheticPacket = createSyntheticFullPlannerPacketV1();
const forensicAnchors = reconstructForensicAnchorsV1({
  historicalAuthorizationPacket: historicalAuthorizationPacket(),
  historicalSyntheticPacket: syntheticPacket,
});
const call1 = forensicAnchors.historicalMinimalSynthetic;
const call2 = buildHistoricalAcceptedFullSyntheticRequestV1(syntheticPacket);
const call3 = buildHistoricalFullSyntheticTypedPatternVariantV1(syntheticPacket);
const call2ToCall3 = compareHistoricalFullSyntheticToTypedPatternVariantV1(call2, call3);
const audits = [
  auditRequest(1, "HISTORICAL_MINIMAL_SYNTHETIC_CONTROL", call1, {
    expectedBodyBytes: 1_254,
    expectedBodySha256: "8efa6ffad38af06ce71ecfea6ef84c6a24dd873e902e2c3ed0a3bab522c6f4a8",
    expectedSchemaBytes: 613,
    expectedSchemaSha256: "ee999027f3c6fb17e47c34c5d43c7b146d8385709280738d14cfab80b8a26319",
  }),
  auditRequest(2, "HISTORICAL_FULL_PLANNER_SYNTHETIC_CONTROL", call2, {
    expectedBodyBytes: 10_134,
    expectedBodySha256: "875e4c7fb117078ad9b4cbe2c76a43d9a1cf63ad66804ca016e2caf5acc71a76",
    expectedSchemaBytes: 6_011,
    expectedSchemaSha256: "ed7870329ad11ead9af4b6dfa99befd131baf1da63cbae8b061e6a61dbd1aeb9",
  }),
  auditRequest(3, "TYPED_ALIAS_PATTERN_SINGLE_VARIABLE", call3),
];
if (audits.some((audit) => !audit.integrityValid)) throw new Error("planner_synthetic_compatibility_isolation_request_integrity_failed");
if (!call2ToCall3.validSingleVariableChange || call2ToCall3.unexpectedChangedPaths.length !== 0) {
  throw new Error("planner_synthetic_compatibility_isolation_multivariable_diff_detected");
}

if (DRY_RUN) {
  console.log(JSON.stringify({ dryRun: true, providerCalls: 0, parent: PARENT, branch: BRANCH, audits, call2ToCall3 }, null, 2));
  process.exit(0);
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const ledger: Array<Record<string, unknown>> = [];
await persistGuard(false, ledger);
const results: Array<Record<string, any>> = [];
const plan = [
  { ordinal: 1, testType: "HISTORICAL_MINIMAL_SYNTHETIC_CONTROL", request: call1 },
  { ordinal: 2, testType: "HISTORICAL_FULL_PLANNER_SYNTHETIC_CONTROL", request: call2 },
  { ordinal: 3, testType: "TYPED_ALIAS_PATTERN_SINGLE_VARIABLE", request: call3 },
] as const;

for (const item of plan) {
  if (item.ordinal > 1 && results.at(-1)?.accepted !== true) break;
  if (results.length >= MAX_CALLS) throw new Error("planner_synthetic_compatibility_isolation_call_budget_exceeded");
  ledger.push({ ordinal: item.ordinal, testType: item.testType, status: "RESERVED" });
  await persistGuard(false, ledger);
  const result = await execute(item.ordinal, item.testType, withCredential(item.request, API_KEY));
  results.push(result);
  Object.assign(ledger.at(-1)!, {
    status: "COMPLETED",
    requestReachedOpenRouter: result.provider?.requestReachedOpenRouter ?? false,
    httpStatus: result.provider?.httpStatus ?? null,
    accepted: result.accepted,
    failureCategory: result.provider?.failureCategory ?? result.localFailure?.failureCategory ?? null,
  });
  await persistGuard(false, ledger);
  console.log(JSON.stringify({ ordinal: item.ordinal, testType: item.testType, accepted: result.accepted,
    requestReachedOpenRouter: result.provider?.requestReachedOpenRouter ?? false,
    httpStatus: result.provider?.httpStatus ?? null,
    failureCategory: result.provider?.failureCategory ?? result.localFailure?.failureCategory ?? null,
    safeErrorParameter: result.provider?.safeErrorParameter ?? null,
    inputTokens: result.provider?.inputTokens ?? null, outputTokens: result.provider?.outputTokens ?? null,
    accountedCostUsd: result.provider?.accountedCostUsd ?? null, latencyMs: result.provider?.latencyMs ?? null }));
}

const conclusion = narrowConclusion(results);
const accounting = summarizeAccounting(results);
const evaluation = {
  schemaVersion: "planner_synthetic_provider_compatibility_isolation_2026_09_16_v1",
  generatedAt: new Date().toISOString(),
  parent: PARENT,
  branch: BRANCH,
  provider: "OpenRouter",
  requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  purpose: "SYNTHETIC_PROVIDER_COMPATIBILITY_ISOLATION_ONLY",
  executionBoundary: {
    maximumProviderCalls: MAX_CALLS, retries: 0, fallbacks: 0, timeoutMs: TIMEOUT_MS,
    merchantData: false, realStatementAnalysis: false, research: false, evidenceAdmission: false,
    truthMutation: false, customerOutput: false, productionRouting: false, compatibilityFix: false,
  },
  requestIntegrity: audits,
  call2VersusCall3StructuralDifferential: call2ToCall3,
  results,
  accounting,
  conclusion,
  hypothesisAssessment: hypothesisAssessment(results),
  anotherProviderCallNeededNow: false,
  nextProductStep: nextProductStep(results),
};
const serialized = JSON.stringify(evaluation, null, 2);
assertArtifactSafe(serialized);
await writeFile(RESULT_PATH, `${serialized}\n`);
await writeFile(REPORT_PATH, renderReport(evaluation));
await persistGuard(true, ledger, sha256(serialized));
console.log(JSON.stringify({ accounting, conclusion, hypothesisAssessment: evaluation.hypothesisAssessment,
  anotherProviderCallNeededNow: false, nextProductStep: evaluation.nextProductStep }, null, 2));

async function execute(ordinal: number, testType: string, request: OpenRouterClaudePreflightRequestV2) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let telemetry: OpenRouterPreflightTelemetryV2 | null = null;
  let rawOutput: unknown = null;
  let localFailure: Record<string, unknown> | null = null;
  try {
    const response = await sendOpenRouterClaudeJsonSchemaEvaluationRequestV2({ request, signal: controller.signal });
    telemetry = response.telemetry;
    rawOutput = response.rawOutput;
  } catch (error) {
    if (error instanceof OpenRouterClaudePreflightErrorV2) telemetry = error.telemetry;
    else localFailure = { failureCategory: "LOCAL_EVALUATION_ERROR", safeErrorType: safeLocalErrorType(error),
      safeErrorMessage: "Local evaluation failed before safe provider telemetry completed." };
  } finally {
    clearTimeout(timeout);
  }
  const validation = ordinal === 1
    ? validateProviderFacingSyntheticOutputV2(rawOutput)
    : validateProviderFacingFullPlannerShapeV1(rawOutput);
  const structuredOutputValid = validation.valid;
  const requestedModelMatched = telemetry?.returnedModel === OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2;
  const accepted = telemetry?.httpStatus === 200 && telemetry.failureCategory === null && rawOutput !== null
    && structuredOutputValid && requestedModelMatched;
  return {
    ordinal, testType,
    requestIntegrity: audits[ordinal - 1],
    provider: telemetry ? safeTelemetry(telemetry) : null,
    localFailure,
    validation: {
      structuredOutputReturned: rawOutput !== null,
      providerFacingShapeValid: structuredOutputValid,
      providerFacingShapeErrors: validation.valid ? [] : validation.errors,
      requestedModelMatched,
    },
    accepted,
  };
}

function auditRequest(ordinal: number, testType: string, request: OpenRouterClaudePreflightRequestV2, expected?: {
  expectedBodyBytes: number; expectedBodySha256: string; expectedSchemaBytes: number; expectedSchemaSha256: string;
}) {
  const diagnostic = inspectPlannerProviderCompatibilityV1(request);
  const body = JSON.parse(request.body) as Record<string, any>;
  const configurationValid = request.endpoint === "https://openrouter.ai/api/v1/chat/completions" && request.method === "POST"
    && body.model === OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2 && body.store === false && body.stream === false
    && body.temperature === 0 && body.provider?.allow_fallbacks === false && body.provider?.require_parameters === true
    && body.response_format?.type === "json_schema" && body.response_format?.json_schema?.strict === true;
  const historicalMatch = expected ? diagnostic.requestBodyBytes === expected.expectedBodyBytes
    && diagnostic.requestBodySha256 === expected.expectedBodySha256
    && diagnostic.providerSchemaBytes === expected.expectedSchemaBytes
    && diagnostic.providerSchemaSha256 === expected.expectedSchemaSha256 : null;
  return {
    ordinal, testType,
    requestBodyBytes: diagnostic.requestBodyBytes,
    requestBodySha256: diagnostic.requestBodySha256,
    providerSchemaBytes: diagnostic.providerSchemaBytes,
    providerSchemaSha256: diagnostic.providerSchemaSha256,
    schemaDepth: diagnostic.schemaDepth,
    schemaNodeCount: diagnostic.schemaNodeCount,
    patternCount: diagnostic.patternCount,
    enumNodeCount: diagnostic.enumNodeCount,
    totalEnumLiteralCount: diagnostic.totalEnumLiteralCount,
    constCount: diagnostic.constCount,
    routing: body.provider,
    model: body.model,
    schemaName: body.response_format.json_schema.name,
    configurationValid,
    matchesIntendedHistoricalControlShape: historicalMatch,
    intendedPatternOnlyVariant: ordinal === 3 ? call2ToCall3.validSingleVariableChange : false,
    integrityValid: configurationValid && (historicalMatch ?? call2ToCall3.validSingleVariableChange),
  };
}

function withCredential(request: OpenRouterClaudePreflightRequestV2, apiKey: string): OpenRouterClaudePreflightRequestV2 {
  return Object.freeze({ ...request, headers: Object.freeze({ ...request.headers, Authorization: `Bearer ${apiKey}` }) });
}

function safeTelemetry(value: OpenRouterPreflightTelemetryV2) {
  return {
    requestReachedOpenRouter: value.requestReachedOpenRouter,
    httpStatus: value.httpStatus,
    returnedModel: value.returnedModel,
    selectedProvider: value.selectedProvider,
    openRouterRequestId: value.openRouterRequestId,
    generationId: value.generationId,
    routerAttemptCount: value.routerAttemptCount,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    totalTokens: value.totalTokens,
    accountedCostUsd: value.accountedCostUsd,
    costMetadataAvailable: value.costMetadataAvailable,
    latencyMs: value.latencyMs,
    timeToHeadersMs: value.timeToHeadersMs,
    bodyReadLatencyMs: value.bodyReadLatencyMs,
    failureCategory: value.failureCategory,
    providerFailureKind: value.providerFailureKind,
    safeErrorType: value.safeErrorType,
    safeErrorCode: value.safeErrorCode,
    safeErrorParameter: value.safeErrorParameter,
    safeErrorMessage: value.safeErrorMessage,
    providerSafeErrorCode: value.providerSafeErrorCode,
    providerDiagnosticSource: value.providerDiagnosticSource,
  };
}

function summarizeAccounting(results: Array<Record<string, any>>) {
  const provider = results.map((result) => result.provider).filter(Boolean);
  const complete = (key: string) => provider.length > 0 && provider.every((item) => typeof item[key] === "number");
  const sum = (key: string) => provider.reduce((total, item) => total + item[key], 0);
  return {
    callsReserved: MAX_CALLS,
    callsAttempted: results.length,
    callsCompleted: results.length,
    retries: 0,
    fallbacks: 0,
    inputTokens: complete("inputTokens") ? sum("inputTokens") : null,
    outputTokens: complete("outputTokens") ? sum("outputTokens") : null,
    totalTokens: complete("totalTokens") ? sum("totalTokens") : null,
    totalAccountedCostUsd: complete("accountedCostUsd") ? Number(sum("accountedCostUsd").toFixed(8)) : null,
    costMetadataComplete: complete("accountedCostUsd"),
    insideThreeCallCeiling: results.length <= MAX_CALLS,
  };
}

function narrowConclusion(results: Array<Record<string, any>>): string {
  if (results.length === 0) return "No provider call completed; the experiment is inconclusive.";
  if (!results[0]!.accepted) return "The previously accepted minimal synthetic structured-output control now fails; provider/model/routing behavior drift is the leading explanation and Package C typed patterns were not isolated.";
  if (results.length < 2 || !results[1]!.accepted) return "The minimal structured-output control succeeds, but the previously accepted full-planner synthetic control fails; a full-planner compatibility change exists and typed patterns were not isolated.";
  if (results.length < 3) return "Both historical controls succeed, but the typed-pattern experiment did not complete; the result is inconclusive.";
  if (!results[2]!.accepted && results[2]!.provider?.httpStatus === 400) return "Both historical controls succeed while the typed-pattern-only variant returns HTTP 400; the repeated typed-alias pattern design is strongly implicated but not mathematically proven.";
  if (results[2]!.accepted) return "The typed-pattern construct succeeds in the controlled synthetic request and is not sufficient by itself to explain the real planner HTTP 400.";
  return "Both historical controls succeed, but the typed-pattern variant fails outside the narrow HTTP 400 interpretation; further Product review is required.";
}

function hypothesisAssessment(results: Array<Record<string, any>>) {
  if (!results[0]?.accepted) return { supports: ["PROVIDER_OR_ROUTE_BEHAVIOR_DRIFT"], eliminates: [], typedPatternIsolationReached: false };
  if (!results[1]?.accepted) return { supports: ["FULL_PLANNER_COMPATIBILITY_DRIFT_OR_NON_PATTERN_CONSTRUCT"], eliminates: ["MINIMAL_TRANSPORT_PATH_UNAVAILABLE"], typedPatternIsolationReached: false };
  if (results[2]?.accepted) return { supports: ["OTHER_REAL_PLANNER_OR_BINDING_INTERACTION"], eliminates: ["TYPED_PATTERN_CONSTRUCT_SUFFICIENT_BY_ITSELF"], typedPatternIsolationReached: true };
  if (results[2]?.provider?.httpStatus === 400) return { supports: ["REPEATED_TYPED_ALIAS_PATTERN_CONSTRAINT_INCOMPATIBILITY"], eliminates: ["GENERAL_TRANSPORT_DRIFT", "HISTORICAL_FULL_PLANNER_SCHEMA_CURRENTLY_UNAVAILABLE"], typedPatternIsolationReached: true };
  return { supports: ["TYPED_PATTERN_VARIANT_COMPATIBILITY_FAILURE"], eliminates: ["GENERAL_TRANSPORT_DRIFT", "HISTORICAL_FULL_PLANNER_SCHEMA_CURRENTLY_UNAVAILABLE"], typedPatternIsolationReached: true };
}

function nextProductStep(results: Array<Record<string, any>>): string {
  if (!results[0]?.accepted) return "Perform an offline comparison of the current provider error and historical transport evidence; do not change RateReveal or run Call 2/3.";
  if (!results[1]?.accepted) return "Perform an offline full-planner construct differential; do not blame typed patterns or run Call 3.";
  if (results[2]?.accepted) return "Return to an offline differential for schema name, request-binding, and alias-content interactions; authorize no additional provider call yet.";
  return "Product should review the direct pattern-isolation evidence before authorizing any schema redesign or compatibility fix.";
}

async function persistGuard(completed: boolean, ledger: Array<Record<string, unknown>>, resultSha256: string | null = null) {
  await writeFile(GUARD_PATH, `${JSON.stringify({
    schemaVersion: "planner_synthetic_compatibility_isolation_attempt_guard_2026_09_16_v1",
    parent: PARENT, branch: BRANCH, provider: "OpenRouter", requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    maximumCalls: MAX_CALLS, retries: 0, fallbacks: 0, callsReserved: MAX_CALLS,
    callsAttempted: ledger.length, callsCompleted: ledger.filter((item) => item.status === "COMPLETED").length,
    ledger, completed, resultSha256,
  }, null, 2)}\n`);
}

function renderReport(value: Record<string, any>): string {
  const rows = value.results.map((result: Record<string, any>) =>
    `| ${result.ordinal} | ${result.testType} | ${result.provider?.httpStatus ?? "n/a"} | ${result.accepted ? "ACCEPTED" : "FAILED"} | ${result.provider?.failureCategory ?? result.localFailure?.failureCategory ?? "none"} | ${result.provider?.safeErrorParameter ?? "n/a"} | ${result.provider?.inputTokens ?? "n/a"}/${result.provider?.outputTokens ?? "n/a"} | ${result.provider?.accountedCostUsd ?? "n/a"} | ${result.provider?.latencyMs ?? "n/a"} |`).join("\n");
  return `# Minimal Synthetic Provider Compatibility Isolation v1\n\nParent: \`${PARENT}\`. Branch: \`${BRANCH}\`.\n\n| # | Test | HTTP | Result | Failure | Safe parameter | Input/output tokens | Cost USD | Latency ms |\n|---:|---|---:|---|---|---|---:|---:|---:|\n${rows}\n\nCall 2 versus Call 3 single-variable diff valid: ${value.call2VersusCall3StructuralDifferential.validSingleVariableChange}.\n\nConclusion: ${value.conclusion}\n\nThis synthetic-only diagnostic performed no research, evidence admission, truth mutation, customer output, production routing, or compatibility fix.\n`;
}

function assertArtifactSafe(value: string): void {
  const forbidden = ["Authorization", "Bearer ", "OPENROUTER_API_KEY", '"rawOutput"', '"packet":', "SYNTHETIC SERVICE PROGRAM X"];
  if (forbidden.some((item) => value.includes(item))) throw new Error("planner_synthetic_compatibility_isolation_artifact_safety_failed");
}

function historicalAuthorizationPacket(): any {
  const historical = JSON.parse(readFileSync("evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json", "utf8"));
  return historical.executions.find((execution: any) => execution.family === "AUTHORIZATION_ECONOMICS").packet.transmitted;
}

function safeLocalErrorType(error: unknown): string {
  const value = error instanceof Error ? error.name : "unknown_error";
  return /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(value) ? value : "unknown_error";
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
