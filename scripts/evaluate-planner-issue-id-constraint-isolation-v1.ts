import "dotenv/config";

import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";

import {
  createSyntheticFullPlannerPacketV1,
  validateProviderFacingFullPlannerShapeV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  OpenRouterClaudePreflightErrorV2,
  sendOpenRouterClaudeJsonSchemaEvaluationRequestV2,
  type OpenRouterClaudePreflightRequestV2,
  type OpenRouterPreflightTelemetryV2,
} from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import {
  buildHistoricalFullSyntheticTypedPatternVariantV1,
  buildTypedPatternIssueIdPatternIsolationVariantV1,
  compareTypedPatternControlToIssueIdPatternVariantV1,
} from "../src/evaluationIntegrity/plannerRequestShapeForensicDifferentialV1.js";

const PARENT = "02c1e7b9d059997eb119253965c0704460c54b6a";
const BRANCH = "codex/planner-issue-id-constraint-isolation-v1";
const TIMEOUT_MS = 90_000;
const OUTPUT_DIRECTORY = "evaluations/planner-issue-id-constraint-isolation-v1";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/evaluation-2026-09-16.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-16.md`;
const DRY_RUN = process.env.PLANNER_ISSUE_ID_CONSTRAINT_ISOLATION_DRY_RUN === "true";
const API_KEY = DRY_RUN ? "offline-placeholder-never-transmitted" : process.env.OPENROUTER_API_KEY ?? "";

if (!API_KEY) throw new Error("planner_issue_id_constraint_isolation_openrouter_key_missing");
if (!DRY_RUN && await exists(GUARD_PATH)) throw new Error("planner_issue_id_constraint_isolation_attempt_already_reserved");

const packet = createSyntheticFullPlannerPacketV1();
const control = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
const variant = buildTypedPatternIssueIdPatternIsolationVariantV1(packet);
const differential = compareTypedPatternControlToIssueIdPatternVariantV1(control, variant);
const controlDiagnostic = inspectPlannerProviderCompatibilityV1(control);
const variantDiagnostic = inspectPlannerProviderCompatibilityV1(variant);
const integrity = {
  successfulCall3Control: audit(control, controlDiagnostic),
  issueIdPatternVariant: audit(variant, variantDiagnostic),
  exactDifferential: differential,
  controlIdentityMatchesAcceptedCall3: controlDiagnostic.requestBodyBytes === 9_512
    && controlDiagnostic.requestBodySha256 === "5018a11fe4b71ff28e24668a8d0c273b9e80829f174937224f2fae046b0ab180"
    && controlDiagnostic.providerSchemaBytes === 5_389
    && controlDiagnostic.providerSchemaSha256 === "45f4b1ec60730727ebc4a1871d008fb27a23414e7353e3ee47403cfb0ad7eb99",
  noUnexpectedMaterialChange: differential.validSingleVariableChange && differential.unexpectedChangedPaths.length === 0,
};
if (!integrity.controlIdentityMatchesAcceptedCall3 || !integrity.noUnexpectedMaterialChange) {
  throw new Error("planner_issue_id_constraint_isolation_integrity_failed_before_transport");
}

if (DRY_RUN) {
  console.log(JSON.stringify({ dryRun: true, providerCalls: 0, parent: PARENT, branch: BRANCH, integrity }, null, 2));
  process.exit(0);
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await persistGuard(false, "RESERVED", null, null);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
let telemetry: OpenRouterPreflightTelemetryV2 | null = null;
let rawOutput: unknown = null;
let localFailure: Record<string, unknown> | null = null;
try {
  const response = await sendOpenRouterClaudeJsonSchemaEvaluationRequestV2({
    request: withCredential(variant, API_KEY),
    signal: controller.signal,
  });
  telemetry = response.telemetry;
  rawOutput = response.rawOutput;
} catch (error) {
  if (error instanceof OpenRouterClaudePreflightErrorV2) telemetry = error.telemetry;
  else localFailure = {
    failureCategory: "LOCAL_EVALUATION_ERROR",
    safeErrorType: safeLocalErrorType(error),
    safeErrorMessage: "Local evaluation failed before safe provider telemetry completed.",
  };
} finally {
  clearTimeout(timeout);
}

const validation = validateProviderFacingFullPlannerShapeV1(rawOutput);
const requestedModelMatched = telemetry?.returnedModel === OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2;
const accepted = telemetry?.httpStatus === 200 && telemetry.failureCategory === null && rawOutput !== null
  && validation.valid && requestedModelMatched;
const result = {
  requestIntegrity: integrity.issueIdPatternVariant,
  provider: telemetry ? safeTelemetry(telemetry) : null,
  localFailure,
  validation: {
    structuredOutputReturned: rawOutput !== null,
    providerFacingShapeValid: validation.valid,
    providerFacingShapeErrors: validation.valid ? [] : validation.errors,
    requestedModelMatched,
  },
  accepted,
};
const conclusion = narrowConclusion(telemetry, accepted);
const evaluation = {
  schemaVersion: "planner_issue_id_constraint_isolation_2026_09_16_v1",
  generatedAt: new Date().toISOString(),
  parent: PARENT,
  branch: BRANCH,
  provider: "OpenRouter",
  requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  purpose: "SYNTHETIC_ISSUE_ID_CONSTRAINT_ISOLATION_ONLY",
  executionBoundary: {
    maximumProviderCalls: 1, callsReserved: 1, callsAttempted: 1, callsCompleted: 1,
    retries: 0, fallbacks: 0, timeoutMs: TIMEOUT_MS, merchantData: false, realStatementData: false,
    research: false, evidenceAdmission: false, truthMutation: false, customerOutput: false,
    productionRouting: false, compatibilityFix: false,
  },
  successfulCall3Control: integrity.successfulCall3Control,
  issueIdOnlyDifferential: differential,
  result,
  accounting: {
    callsReserved: 1,
    callsAttempted: 1,
    callsCompleted: 1,
    retries: 0,
    fallbacks: 0,
    inputTokens: telemetry?.inputTokens ?? null,
    outputTokens: telemetry?.outputTokens ?? null,
    totalTokens: telemetry?.totalTokens ?? null,
    accountedCostUsd: telemetry?.accountedCostUsd ?? null,
    costMetadataAvailable: telemetry?.costMetadataAvailable ?? false,
  },
  hypothesisAssessment: accepted
    ? { issueIdPatternSufficientCause: false, status: "ELIMINATED_AS_SUFFICIENT_IN_ISOLATION" }
    : telemetry?.httpStatus === 400 && telemetry.providerFailureKind === "REQUEST_PARAMETER_REJECTED"
      ? { issueIdPatternSufficientCause: null, status: "DIRECTLY_IMPLICATED_NOT_PROVEN" }
      : { issueIdPatternSufficientCause: null, status: "INCONCLUSIVE_NON_MATCHING_FAILURE" },
  conclusion,
  anotherProviderCallNeededNow: false,
  recommendedNextProductStep: accepted
    ? "Return to Product for a separately authorized synthetic isolation of the remaining schema-name, inputHash-binding, or evidence-enum deltas; do not make another call now."
    : "Return to Product review without changing the pattern or implementing a fix.",
};
const serialized = JSON.stringify(evaluation, null, 2);
assertArtifactSafe(serialized);
await writeFile(RESULT_PATH, `${serialized}\n`);
await writeFile(REPORT_PATH, renderReport(evaluation));
await persistGuard(true, "COMPLETED", telemetry?.httpStatus ?? null, sha256(serialized));
console.log(JSON.stringify({ result, accounting: evaluation.accounting, hypothesisAssessment: evaluation.hypothesisAssessment,
  conclusion, anotherProviderCallNeededNow: false, recommendedNextProductStep: evaluation.recommendedNextProductStep }, null, 2));

function audit(request: OpenRouterClaudePreflightRequestV2, diagnostic: ReturnType<typeof inspectPlannerProviderCompatibilityV1>) {
  const body = JSON.parse(request.body) as Record<string, any>;
  return {
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
    schemaName: body.response_format.json_schema.name,
    model: body.model,
    routing: body.provider,
    generation: { store: body.store, stream: body.stream, temperature: body.temperature, maxTokens: body.max_tokens },
    responseFormat: { type: body.response_format.type, strict: body.response_format.json_schema.strict },
    messageRoles: body.messages.map((message: any) => message.role),
    messageBytes: body.messages.map((message: any) => Buffer.byteLength(message.content, "utf8")),
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

function narrowConclusion(telemetry: OpenRouterPreflightTelemetryV2 | null, accepted: boolean): string {
  if (accepted) return "The stable issueId pattern succeeds in isolation and is not sufficient by itself to explain the real planner HTTP 400.";
  if (telemetry?.httpStatus === 400 && telemetry.providerFailureKind === "REQUEST_PARAMETER_REJECTED") {
    return "The issueId-only variant reproduces HTTP 400 request-parameter rejection; the stable issueId pattern is directly implicated under this controlled synthetic test but is not automatically proven as the sole real-request cause.";
  }
  return "The single issueId isolation call did not produce the expected success or matching HTTP 400 classification; the result is inconclusive.";
}

async function persistGuard(completed: boolean, status: "RESERVED" | "COMPLETED", httpStatus: number | null, resultSha256: string | null) {
  await writeFile(GUARD_PATH, `${JSON.stringify({
    schemaVersion: "planner_issue_id_constraint_isolation_attempt_guard_2026_09_16_v1",
    parent: PARENT, branch: BRANCH, provider: "OpenRouter", requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    maximumCalls: 1, callsReserved: 1, callsAttempted: 1, callsCompleted: completed ? 1 : 0,
    retries: 0, fallbacks: 0, status, httpStatus, completed, resultSha256,
  }, null, 2)}\n`);
}

function renderReport(value: Record<string, any>): string {
  const telemetry = value.result.provider;
  return `# Issue-ID Constraint Isolation v1\n\nParent: \`${PARENT}\`. Branch: \`${BRANCH}\`.\n\nThe exact successful synthetic typed-pattern Call 3 request was reconstructed. Only two leaf paths changed: removal of \`issueId.const\` and addition of Package C's stable \`issueId.pattern\`. Unexpected changed paths: 0.\n\nHTTP result: ${telemetry?.httpStatus ?? "n/a"}. Structured output valid: ${value.result.validation.providerFacingShapeValid}. Returned model matched: ${value.result.validation.requestedModelMatched}. Input/output tokens: ${telemetry?.inputTokens ?? "n/a"}/${telemetry?.outputTokens ?? "n/a"}. Cost USD: ${telemetry?.accountedCostUsd ?? "n/a"}. Latency ms: ${telemetry?.latencyMs ?? "n/a"}.\n\nConclusion: ${value.conclusion}\n\nExactly one synthetic provider call was made, with zero retries and zero fallbacks. No merchant data, real statement data, research, evidence admission, truth mutation, customer output, production routing, or compatibility fix occurred.\n`;
}

function assertArtifactSafe(value: string) {
  if (/Bearer\s|sk-or-v1-|OPENROUTER_API_KEY|"Authorization"\s*:/i.test(value)) throw new Error("issue_id_isolation_artifact_secret_leak");
  if (/"rawOutput"|"packet"\s*:/i.test(value)) throw new Error("issue_id_isolation_artifact_payload_leak");
}

function safeLocalErrorType(error: unknown): string {
  const value = error instanceof Error ? error.name : "unknown_error";
  return /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(value) ? value : "unknown_error";
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
