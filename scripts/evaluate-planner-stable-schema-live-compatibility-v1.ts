import "dotenv/config";

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import {
  inspectShadowAiProviderBoundRequestPrivacyV1,
  restoreShadowAiProviderReferencesV1,
} from "../src/canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import type { ShadowAiEconomicResolutionPacketV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import {
  inspectFullPlannerReferenceGroundingV1,
  validateProviderFacingFullPlannerShapeV1,
  validateTranslatedConstraintSemanticsV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildOpenRouterIssueGroundedShadowPlannerRequestV1,
} from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import {
  OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  OpenRouterClaudePreflightErrorV2,
  sendOpenRouterClaudeJsonSchemaEvaluationRequestV2,
  type OpenRouterPreflightTelemetryV2,
} from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import { evaluateGoldPlannerSourceReferenceContainmentOfflineV1 } from "./validate-gold-planner-source-reference-containment-v1.js";

const PACKAGE_C_PARENT = "892e897b74e4c9cfc11fc830f8b63093fad4c161";
const BRANCH = "codex/planner-stable-schema-live-compatibility-check-v1";
const EXPECTED_SCHEMA_SHA = "9d382aab64862b3818e1e46de385170cf3f1cc392b7e335d5d33acf1e334bcb6";
const EXPECTED_SCHEMA_BYTES = 5_472;
const TIMEOUT_MS = 90_000;
const MAX_CALLS = 4;
const OUTPUT_DIRECTORY = "evaluations/planner-stable-schema-live-compatibility-check-v1";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/evaluation-2026-09-15.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-15.md`;
const SOURCE_ARTIFACT = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const DRY_RUN = process.env.PLANNER_STABLE_SCHEMA_LIVE_CHECK_DRY_RUN === "true";
const API_KEY = DRY_RUN ? "offline-dry-run-key" : process.env.OPENROUTER_API_KEY ?? "";

const TEST_PLAN = Object.freeze([
  { ordinal: 1, family: "AUTHORIZATION_ECONOMICS", statementAlias: "supported-fiserv-gold-01", historicalHttpStatus: 200, role: "CONTROL" },
  { ordinal: 2, family: "SHARED_OR_BUNDLED_FEE_SEMANTICS", statementAlias: "supported-fiserv-gold-02", historicalHttpStatus: 400, role: "FORMERLY_FAILING" },
  { ordinal: 3, family: "QUALIFICATION_OR_INTEGRITY", statementAlias: "supported-fiserv-gold-05", historicalHttpStatus: 400, role: "FORMERLY_FAILING" },
  { ordinal: 4, family: "CONTRACT_OR_DOCUMENT", statementAlias: "supported-fiserv-gold-04", historicalHttpStatus: 400, role: "FORMERLY_FAILING" },
] as const);

if (!API_KEY) throw new Error("planner_stable_schema_live_check_openrouter_key_missing");
if (!DRY_RUN && await exists(GUARD_PATH)) throw new Error("planner_stable_schema_live_check_attempt_already_reserved");

const historical = JSON.parse(await readFile(SOURCE_ARTIFACT, "utf8")) as { executions: HistoricalExecution[] };
const selected = TEST_PLAN.map((planned) => {
  const matches = historical.executions.filter((execution) => execution.family === planned.family
    && execution.statementAlias === planned.statementAlias);
  if (matches.length !== 1) throw new Error(`planner_stable_schema_live_check_case_binding_invalid:${planned.family}`);
  return { planned, execution: matches[0]! };
});

const beforeGold = await evaluateGoldPlannerSourceReferenceContainmentOfflineV1();
const requestAudits = selected.map(({ planned, execution }) => auditRequest(planned, execution.packet.transmitted));
if (requestAudits.some((audit) => !audit.preflightValid)) {
  throw new Error(`planner_stable_schema_live_check_preflight_failed:${requestAudits.filter((audit) => !audit.preflightValid).map((audit) => audit.family).join(",")}`);
}

if (DRY_RUN) {
  console.log(JSON.stringify({ dryRun: true, providerCalls: 0, parent: PACKAGE_C_PARENT, branch: BRANCH,
    testPlan: TEST_PLAN, requestAudits, beforeInvariance: selectInvariance(beforeGold) }, null, 2));
  process.exit(0);
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const ledger: Array<Record<string, unknown>> = [];
await persistGuard(false, ledger);
const results: Array<Record<string, any>> = [];

for (const [{ planned, execution }, audit] of selected.map((item, index) => [item, requestAudits[index]!] as const)) {
  if (results.length >= MAX_CALLS) throw new Error("planner_stable_schema_live_check_call_budget_exceeded");
  ledger.push({ ordinal: planned.ordinal, family: planned.family, statementAlias: planned.statementAlias, status: "RESERVED" });
  await persistGuard(false, ledger);

  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1(API_KEY, execution.packet.transmitted);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let telemetry: OpenRouterPreflightTelemetryV2 | null = null;
  let rawOutput: unknown = null;
  let safeLocalFailure: Record<string, unknown> | null = null;
  try {
    const response = await sendOpenRouterClaudeJsonSchemaEvaluationRequestV2({ request, signal: controller.signal });
    telemetry = response.telemetry;
    rawOutput = response.rawOutput;
  } catch (error) {
    if (error instanceof OpenRouterClaudePreflightErrorV2) {
      telemetry = error.telemetry;
    } else {
      safeLocalFailure = {
        failureCategory: "LOCAL_EVALUATION_ERROR",
        safeErrorType: error instanceof Error ? safeLocalErrorType(error.name) : "unknown_error",
        safeErrorMessage: "Local evaluation failed before safe provider telemetry completed.",
      };
    }
  } finally {
    clearTimeout(timeout);
  }

  const providerShape = rawOutput === null
    ? { valid: false, errors: ["provider_output_unavailable"] }
    : validateProviderFacingFullPlannerShapeV1(rawOutput);
  const restored = rawOutput === null
    ? { ok: false as const, output: null, errorCodes: ["provider_output_unavailable"], restoredReferenceCount: 0 }
    : restoreShadowAiProviderReferencesV1(rawOutput, request.referenceMap);
  const planner = restored.ok
    ? validateShadowAiEconomicResolutionPlanV1(restored.output, execution.packet.transmitted)
    : { ok: false as const, plan: null, errors: [...restored.errorCodes] };
  const translatedConstraints = planner.ok
    ? validateTranslatedConstraintSemanticsV1(planner.plan)
    : { valid: false, errors: ["strict_local_validation_failed"] };
  const grounding = planner.ok
    ? inspectFullPlannerReferenceGroundingV1(planner.plan, execution.packet.transmitted)
    : { valid: false, citedRefs: [], invalidRefs: ["strict_local_validation_failed"] };
  const requestedModelMatched = telemetry?.returnedModel === OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2;
  const accepted = telemetry?.httpStatus === 200 && telemetry.failureCategory === null && providerShape.valid
    && restored.ok && planner.ok && translatedConstraints.valid && grounding.valid && requestedModelMatched;
  const result = {
    ordinal: planned.ordinal,
    role: planned.role,
    family: planned.family,
    statementAlias: planned.statementAlias,
    historicalHttpStatus: planned.historicalHttpStatus,
    requestIntegrity: audit,
    provider: telemetry ? safeTelemetry(telemetry) : safeLocalFailure,
    validation: {
      structuredOutputReturned: rawOutput !== null,
      providerFacingStructuralValidationPassed: providerShape.valid,
      providerFacingStructuralErrorCodes: providerShape.errors,
      packageBAliasMembershipAndReverseMappingPassed: restored.ok,
      packageBReferenceErrorCodes: restored.ok ? [] : restored.errorCodes,
      restoredReferenceCount: restored.ok ? restored.restoredReferenceCount : 0,
      existingPlannerValidationPassed: planner.ok,
      plannerErrorCodes: planner.ok ? [] : planner.errors,
      translatedConstraintValidationPassed: translatedConstraints.valid,
      referenceGroundingPassed: grounding.valid,
      requestedModelMatched,
      accepted,
    },
  };
  results.push(result);
  Object.assign(ledger.at(-1)!, {
    status: "COMPLETED",
    requestReachedOpenRouter: telemetry?.requestReachedOpenRouter ?? false,
    httpStatus: telemetry?.httpStatus ?? null,
    accepted,
    failureCategory: telemetry?.failureCategory ?? safeLocalFailure?.failureCategory ?? null,
  });
  await persistGuard(false, ledger);
  console.log(JSON.stringify({ ordinal: planned.ordinal, family: planned.family, statementAlias: planned.statementAlias,
    requestReachedOpenRouter: telemetry?.requestReachedOpenRouter ?? false, httpStatus: telemetry?.httpStatus ?? null,
    failureCategory: telemetry?.failureCategory ?? safeLocalFailure?.failureCategory ?? null, accepted,
    inputTokens: telemetry?.inputTokens ?? null, outputTokens: telemetry?.outputTokens ?? null,
    accountedCostUsd: telemetry?.accountedCostUsd ?? null, latencyMs: telemetry?.latencyMs ?? null }));

  if (planned.role === "CONTROL" && mustStopAfterControl(telemetry)) break;
}

const afterGold = await evaluateGoldPlannerSourceReferenceContainmentOfflineV1();
const beforeInvariance = selectInvariance(beforeGold);
const afterInvariance = selectInvariance(afterGold);
const invariance = {
  before: beforeInvariance,
  after: afterInvariance,
  byteIdentical: canonicalJson(beforeInvariance) === canonicalJson(afterInvariance),
  allElevenUnchanged: allEleven(afterInvariance),
};
const accounting = summarizeAccounting(results);
const formerlyFailing = results.filter((result) => result.role === "FORMERLY_FAILING");
const allFormerlyFailingProviderAccepted = formerlyFailing.length === 3
  && formerlyFailing.every((result) => result.validation.accepted);
const historicalHttp400Reproduced = formerlyFailing.some((result) => result.provider?.httpStatus === 400);
const conclusion = narrowConclusion(results, allFormerlyFailingProviderAccepted, historicalHttp400Reproduced);
const evaluation = {
  schemaVersion: "planner_stable_schema_live_compatibility_check_2026_09_15_v1",
  generatedAt: new Date().toISOString(),
  parent: PACKAGE_C_PARENT,
  branch: BRANCH,
  provider: "OpenRouter",
  requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  executionBoundary: { maximumCalls: MAX_CALLS, retries: 0, fallbacks: 0, timeoutMs: TIMEOUT_MS,
    store: false, stream: false, temperature: 0, allowFallbacks: false, requireParameters: true,
    research: false, evidenceAdmission: false, truthMutation: false, customerOutput: false, productionRouting: false },
  testPlan: TEST_PLAN,
  allFourReached: results.length === 4,
  results,
  accounting,
  invariance,
  historicalHttp400Reproduced,
  allFormerlyFailingProviderAccepted,
  conclusion,
  architectureIssues: architectureIssues(results),
};
const serialized = JSON.stringify(evaluation, null, 2);
assertArtifactSafe(serialized);
await writeFile(RESULT_PATH, `${serialized}\n`);
await writeFile(REPORT_PATH, renderReport(evaluation));
await persistGuard(true, ledger, sha256(serialized));
console.log(JSON.stringify({ allFourReached: evaluation.allFourReached, accounting, invariance,
  historicalHttp400Reproduced, allFormerlyFailingProviderAccepted, conclusion,
  architectureIssues: evaluation.architectureIssues }, null, 2));

function auditRequest(planned: typeof TEST_PLAN[number], packet: ShadowAiEconomicResolutionPacketV1) {
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1(API_KEY, packet);
  const diagnostic = inspectPlannerProviderCompatibilityV1(request);
  const body = JSON.parse(request.body) as Record<string, any>;
  const userPayload = JSON.parse(body.messages[1].content) as { packet: ShadowAiEconomicResolutionPacketV1 };
  const packetPrivacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  const outboundPrivacy = inspectShadowAiProviderBoundRequestPrivacyV1(request.body, request.referenceMap);
  const aliasCounts = request.referenceMap.entries.reduce<Record<string, number>>((counts, entry) => ({
    ...counts, [entry.referenceClass]: (counts[entry.referenceClass] ?? 0) + 1,
  }), { FACT: 0, STATEMENT_EVIDENCE: 0, GOVERNED_EVIDENCE: 0, ECONOMIC_CHARGE: 0 });
  const requestConfigurationValid = body.model === OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2 && body.store === false
    && body.stream === false && body.temperature === 0 && body.max_tokens === 4_000
    && body.provider?.allow_fallbacks === false && body.provider?.require_parameters === true
    && body.response_format?.type === "json_schema"
    && body.response_format?.json_schema?.name === "shadow_ai_economic_resolution_plan_stable_v1"
    && body.response_format?.json_schema?.strict === true;
  const bindingValid = request.referenceMap.issueId === packet.issueId
    && userPayload.packet.issueId === request.referenceMap.issueId
    && userPayload.packet.immutableInputHash === request.referenceMap.providerInputHash;
  const reverseMapSerializedCount = request.body.includes('"referenceMap"') || request.body.includes('"internalReference"') ? 1 : 0;
  const preflightValid = diagnostic.providerSchemaSha256 === EXPECTED_SCHEMA_SHA
    && diagnostic.providerSchemaBytes === EXPECTED_SCHEMA_BYTES && packetPrivacy.valid && outboundPrivacy.valid
    && reverseMapSerializedCount === 0 && bindingValid && requestConfigurationValid;
  return {
    callOrdinal: planned.ordinal,
    family: planned.family,
    statementAlias: planned.statementAlias,
    providerSchemaSha256: diagnostic.providerSchemaSha256,
    providerSchemaBytes: diagnostic.providerSchemaBytes,
    requestBodyBytes: diagnostic.requestBodyBytes,
    requestBodySha256: diagnostic.requestBodySha256,
    packetBytes: Buffer.byteLength(canonicalJson(packet), "utf8"),
    providerPacketBytes: Buffer.byteLength(canonicalJson(userPayload.packet), "utf8"),
    providerSafeAliasCounts: aliasCounts,
    expectedReferenceMapBinding: { issueId: request.referenceMap.issueId, providerInputHash: request.referenceMap.providerInputHash,
      scopeToken: request.referenceMap.scopeToken, valid: bindingValid },
    privacy: {
      packetPrivacyValid: packetPrivacy.valid,
      requestScopedAliasBindingValid: outboundPrivacy.valid,
      rawInternalReferenceLeakageCount: outboundPrivacy.rawInternalReferenceLeakageCount,
      sourceIdentityLeakageCount: outboundPrivacy.sourceIdentityLeakageCount,
      reverseMapMaterialLeakageCount: outboundPrivacy.rawReverseMapMaterialCount,
      reverseMapSerializedCount,
      prohibitedMerchantPrivateIdentityLeakageCount: packetPrivacy.valid && outboundPrivacy.valid ? 0 : 1,
    },
    requestConfigurationValid,
    preflightValid,
  };
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

function mustStopAfterControl(telemetry: OpenRouterPreflightTelemetryV2 | null): boolean {
  if (!telemetry || !telemetry.requestReachedOpenRouter || telemetry.httpStatus === null) return true;
  if ((telemetry.httpStatus ?? 0) >= 500) return true;
  return new Set([
    "AUTHENTICATION_FAILURE", "INSUFFICIENT_CREDIT_OR_PAYMENT_REQUIRED", "MODEL_UNAVAILABLE_OR_NOT_PERMITTED",
    "PROVIDER_ROUTING_FAILURE", "TIMEOUT", "RATE_LIMIT", "TRANSPORT_NETWORK_FAILURE",
  ]).has(telemetry.failureCategory ?? "");
}

function summarizeAccounting(results: Array<Record<string, any>>) {
  const telemetry = results.map((result) => result.provider).filter(Boolean);
  const sum = (key: string) => telemetry.reduce((total, item) => total + (typeof item[key] === "number" ? item[key] : 0), 0);
  const allCostsAvailable = telemetry.length > 0 && telemetry.every((item) => typeof item.accountedCostUsd === "number");
  return {
    totalCallsReserved: MAX_CALLS,
    totalCallsAttempted: results.length,
    totalCallsCompleted: results.length,
    totalRetries: 0,
    totalFallbacks: 0,
    totalInputTokens: sum("inputTokens"),
    totalOutputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    totalAccountedCostUsd: allCostsAvailable ? Number(sum("accountedCostUsd").toFixed(8)) : null,
    costMetadataComplete: allCostsAvailable,
    insideFourCallCeiling: results.length <= MAX_CALLS,
  };
}

function selectInvariance(value: any) {
  return { statementCount: value.statementCount, ...value.invariance };
}

function allEleven(value: Record<string, unknown>): boolean {
  return value.statementCount === 11 && Object.values(value)
    .filter((item) => typeof item === "string" && /^\d+\/11$/.test(item))
    .every((item) => item === "11/11") && value.commercialSourceUnchanged === true;
}

function narrowConclusion(results: Array<Record<string, any>>, allAccepted: boolean, reproduced: boolean): string {
  if (results.length === 1 && mustStopAfterControlTelemetryProjection(results[0]!.provider)) {
    return "The control did not establish an interpretable provider path; no formerly failing request was sent.";
  }
  if (allAccepted) return "The historical HTTP 400 compatibility failure no longer reproduces across the three previously failing families under the Package C stable schema.";
  if (reproduced) return "One or more historical HTTP 400 compatibility failures reproduced under the Package C stable schema.";
  return "The bounded check did not establish provider acceptance for all three formerly failing families.";
}

function mustStopAfterControlTelemetryProjection(value: Record<string, any> | null): boolean {
  if (!value || value.requestReachedOpenRouter !== true || value.httpStatus === null) return true;
  return ["AUTHENTICATION_FAILURE", "INSUFFICIENT_CREDIT_OR_PAYMENT_REQUIRED", "MODEL_UNAVAILABLE_OR_NOT_PERMITTED",
    "PROVIDER_ROUTING_FAILURE", "TIMEOUT", "RATE_LIMIT", "TRANSPORT_NETWORK_FAILURE"].includes(value.failureCategory);
}

function architectureIssues(results: Array<Record<string, any>>): string[] {
  return results.filter((result) => !result.validation.accepted).map((result) => {
    if (result.provider?.failureCategory) return `${result.family}:${result.provider.failureCategory}`;
    if (!result.validation.packageBAliasMembershipAndReverseMappingPassed) return `${result.family}:LOCAL_ALIAS_VALIDATION_FAILED`;
    if (!result.validation.existingPlannerValidationPassed) return `${result.family}:LOCAL_PLANNER_VALIDATION_FAILED`;
    if (!result.validation.requestedModelMatched) return `${result.family}:RETURNED_MODEL_MISMATCH`;
    return `${result.family}:UNCLASSIFIED_COMPATIBILITY_FAILURE`;
  });
}

async function persistGuard(completed: boolean, ledger: Array<Record<string, unknown>>, resultSha256: string | null = null) {
  await writeFile(GUARD_PATH, `${JSON.stringify({
    schemaVersion: "planner_stable_schema_live_compatibility_attempt_guard_2026_09_15_v1",
    parent: PACKAGE_C_PARENT,
    branch: BRANCH,
    provider: "OpenRouter",
    requestedModel: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    maximumCalls: MAX_CALLS,
    retries: 0,
    fallbacks: 0,
    callsReserved: MAX_CALLS,
    callsAttempted: ledger.length,
    callsCompleted: ledger.filter((item) => item.status === "COMPLETED").length,
    ledger,
    completed,
    resultSha256,
  }, null, 2)}\n`);
}

function renderReport(evaluation: Record<string, any>): string {
  const rows = evaluation.results.map((result: Record<string, any>) =>
    `| ${result.ordinal} | ${result.family} | ${result.statementAlias} | ${result.provider?.httpStatus ?? "n/a"} | ${result.validation.accepted ? "ACCEPTED" : "REJECTED"} | ${result.provider?.failureCategory ?? "none"} | ${result.provider?.inputTokens ?? "n/a"}/${result.provider?.outputTokens ?? "n/a"} | ${result.provider?.accountedCostUsd ?? "n/a"} | ${result.provider?.latencyMs ?? "n/a"} |`).join("\n");
  return `# Minimal Live Provider Compatibility Check v1\n\nParent: \`${PACKAGE_C_PARENT}\`. Branch: \`${BRANCH}\`.\n\n| # | Family | Statement alias | HTTP | Result | Failure category | Input/output tokens | Cost USD | Latency ms |\n|---:|---|---|---:|---|---|---:|---:|---:|\n${rows}\n\nAll four reached: ${evaluation.allFourReached}. Historical HTTP 400 reproduced: ${evaluation.historicalHttp400Reproduced}. All three formerly failing families provider-accepted: ${evaluation.allFormerlyFailingProviderAccepted}.\n\nConclusion: ${evaluation.conclusion}\n\nCanonical/commercial invariance: ${evaluation.invariance.allElevenUnchanged ? "11/11 unchanged" : "FAILED"}; before/after fingerprint objects byte-identical: ${evaluation.invariance.byteIdentical}.\n\nThis check did not perform research, admit evidence, mutate truth, create customer output, change production routing, or establish production readiness.\n`;
}

function assertArtifactSafe(value: string): void {
  const forbidden = ["Authorization", "Bearer ", "OPENROUTER_API_KEY", '"rawOutput"', '"packet":', '"plan":'];
  if (forbidden.some((item) => value.includes(item))) throw new Error("planner_stable_schema_live_check_artifact_safety_failed");
}

function safeLocalErrorType(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(value) ? value : "unknown_error";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

type HistoricalExecution = {
  family: string;
  statementAlias: string;
  packet: { transmitted: ShadowAiEconomicResolutionPacketV1 };
};
