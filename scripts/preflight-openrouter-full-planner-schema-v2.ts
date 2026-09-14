import "dotenv/config";

import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";

import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import {
  buildOpenRouterFullPlannerSchemaPreflightRequestV1,
  createSyntheticFullPlannerPacketV1,
  fullPlannerSchemaConstructCountsV1,
  inspectFullPlannerReferenceGroundingV1,
  invokeOpenRouterFullPlannerSchemaPreflightV1,
  localFullPlannerOutputSchemaV1,
  validateProviderFacingFullPlannerShapeV1,
  validateTranslatedConstraintSemanticsV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  OpenRouterClaudePreflightErrorV2,
  type OpenRouterPreflightFailureCategoryV2,
  type OpenRouterPreflightTelemetryV2,
} from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";

const EVALUATION_CHECKPOINT = "afc6d070dd445506e932b27938dc489fbeebbf49";
const EVALUATION_PARENT = "8655fd73e5efdfdfd3acda9aaa3766e22767922e";
const BRANCH = "codex/full-planner-schema-synthetic-preflight-v2-extended-timeout";
const MODEL = "anthropic/claude-opus-4.6" as const;
const OUTPUT_DIRECTORY = "evaluations/full-planner-schema-synthetic-preflight-v2";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/preflight-2026-09-15.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-15.md`;
const EVALUATION_TIMEOUT_MS = 60_000;
const ACCEPTED_V1_REQUEST_BODY_BYTES = 10_134;
const ACCEPTED_V1_REQUEST_BODY_SHA256 = "875e4c7fb117078ad9b4cbe2c76a43d9a1cf63ad66804ca016e2caf5acc71a76";
const ACCEPTED_V1_PACKET_BYTES = 2_350;
const ACCEPTED_V1_PACKET_SHA256 = "9b11a9b574e172a0070ed1474809d996b599209aef7434d2a4b8e8cefcd34d5c";
const apiKey = process.env.OPENROUTER_API_KEY ?? "";

if (!apiKey) throw new Error("openrouter_full_planner_preflight_credential_missing");
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
if (await exists(GUARD_PATH)) throw new Error("openrouter_full_planner_preflight_attempt_already_reserved");

const packet = createSyntheticFullPlannerPacketV1();
const packetJson = canonicalJson(packet);
const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
const syntheticBoundary = inspectSyntheticPacketBoundary(packetJson);
if (!privacy.valid) throw new Error(`openrouter_full_planner_packet_privacy_failed:${privacy.reasonCodes.join(",")}`);
if (!syntheticBoundary.valid) throw new Error(`openrouter_full_planner_synthetic_boundary_failed:${syntheticBoundary.reasonCodes.join(",")}`);

const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1(apiKey, packet);
const requestBodySha256 = sha256(request.body);
const packetSha256 = sha256(packetJson);
if (request.bodyBytes !== ACCEPTED_V1_REQUEST_BODY_BYTES || requestBodySha256 !== ACCEPTED_V1_REQUEST_BODY_SHA256) {
  throw new Error("openrouter_full_planner_v2_request_not_identical_to_accepted_v1");
}
if (Buffer.byteLength(packetJson, "utf8") !== ACCEPTED_V1_PACKET_BYTES || packetSha256 !== ACCEPTED_V1_PACKET_SHA256) {
  throw new Error("openrouter_full_planner_v2_packet_not_identical_to_accepted_v1");
}
const localSchema = localFullPlannerOutputSchemaV1(packet);
const localSchemaJson = canonicalJson(localSchema);
const providerSchemaJson = canonicalJson(request.providerSchema);
const localConstructCounts = fullPlannerSchemaConstructCountsV1(localSchema);
const providerConstructCounts = fullPlannerSchemaConstructCountsV1(request.providerSchema);
const schemaTranslation = Object.freeze({
  localSchemaBytes: Buffer.byteLength(localSchemaJson, "utf8"),
  providerSchemaBytes: Buffer.byteLength(providerSchemaJson, "utf8"),
  localConstructCounts,
  providerConstructCounts,
  removedGenerationConstraints: Object.freeze({
    minLength: localConstructCounts.minLength - providerConstructCounts.minLength,
    maxLength: localConstructCounts.maxLength - providerConstructCounts.maxLength,
    maxItems: localConstructCounts.maxItems - providerConstructCounts.maxItems,
  }),
  unsupportedProviderKeywordCount: providerConstructCounts.minLength + providerConstructCounts.maxLength + providerConstructCounts.maxItems,
  additionalTranslationRequired: false,
  acceptedLocalContractModified: false,
});
if (schemaTranslation.unsupportedProviderKeywordCount !== 0) throw new Error("openrouter_full_planner_provider_schema_not_compatible");

await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "full_planner_schema_synthetic_preflight_attempt_guard_2026_09_15_v2",
  evaluationCheckpoint: EVALUATION_CHECKPOINT,
  branch: BRANCH,
  provider: "OpenRouter",
  requestedModel: MODEL,
  maximumProviderCalls: 1,
  retries: 0,
  fallbackAllowed: false,
  callReserved: true,
  requestBodyBytes: request.bodyBytes,
  requestBodySha256,
  matchesAcceptedV1RequestExactly: true,
  evaluationTimeoutMs: EVALUATION_TIMEOUT_MS,
  packetBytes: Buffer.byteLength(packetJson, "utf8"),
  packetSha256,
  matchesAcceptedV1PacketExactly: true,
  syntheticDataOnly: true,
}, null, 2)}\n`);

let telemetry: OpenRouterPreflightTelemetryV2;
let output: unknown = null;
let providerSchemaValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let strictLocalValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let translatedConstraintValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let referenceGrounding: Readonly<{ valid: boolean; citedRefs: readonly string[]; invalidRefs: readonly string[] }> = Object.freeze({
  valid: false,
  citedRefs: Object.freeze([]),
  invalidRefs: Object.freeze([]),
});
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), EVALUATION_TIMEOUT_MS);
try {
  const result = await invokeOpenRouterFullPlannerSchemaPreflightV1({ apiKey, packet, signal: controller.signal });
  telemetry = result.telemetry;
  output = result.rawOutput;
  providerSchemaValidation = validateProviderFacingFullPlannerShapeV1(output);
  const local = validateShadowAiEconomicResolutionPlanV1(output, packet);
  strictLocalValidation = Object.freeze({ valid: local.ok, errors: Object.freeze(local.ok ? [] : [...local.errors]) });
  if (local.ok) translatedConstraintValidation = validateTranslatedConstraintSemanticsV1(local.plan);
  referenceGrounding = inspectFullPlannerReferenceGroundingV1(output, packet);
} catch (error) {
  if (!(error instanceof OpenRouterClaudePreflightErrorV2)) throw error;
  telemetry = error.telemetry;
} finally {
  clearTimeout(timeout);
}

const success = providerSchemaValidation.valid
  && strictLocalValidation.valid
  && translatedConstraintValidation.valid
  && referenceGrounding.valid
  && telemetry.httpStatus !== null && telemetry.httpStatus >= 200 && telemetry.httpStatus < 300
  && telemetry.returnedModel === MODEL
  && telemetry.inputTokens !== null && telemetry.outputTokens !== null && telemetry.totalTokens !== null;
const qualityReview = inspectPlannerQuality(output);
const recommendation = recommend(success, telemetry.failureCategory, providerSchemaValidation.valid, strictLocalValidation.valid);
const safetyCounters = Object.freeze({
  providerCalls: telemetry.callCount,
  retries: telemetry.retries,
  fallbackCalls: 0,
  canonicalChanges: 0,
  rdChanges: 0,
  commercialChanges: 0,
  sensitivityChanges: 0,
  participantControlChanges: 0,
  savingsConclusions: 0,
  annualizationConclusions: 0,
  comparisonDecisions: 0,
  customerPermissions: 0,
  customerRoutingChanges: 0,
  researchOperations: 0,
  sourceAdmissions: 0,
  privateDataSent: 0,
  goldEvaluationRuns: 0,
});
const safetyViolationTotal = Object.entries(safetyCounters)
  .filter(([key]) => !["providerCalls", "retries"].includes(key))
  .reduce((sum, [, value]) => sum + value, 0);

const artifact = Object.freeze({
  schemaVersion: "full_planner_schema_synthetic_preflight_2026_09_15_v2",
  generatedAt: new Date().toISOString(),
  evaluationCheckpoint: {
    branch: "codex/full-planner-schema-synthetic-preflight-v1",
    commit: EVALUATION_CHECKPOINT,
    parent: EVALUATION_PARENT,
  },
  evaluationBranch: BRANCH,
  purpose: "FULL_PLANNER_SCHEMA_SYNTHETIC_PREFLIGHT_ONLY",
  provider: "OpenRouter",
  requestedModel: MODEL,
  success,
  request: {
    endpoint: request.endpoint,
    method: request.method,
    headerNames: Object.keys(request.headers).sort(),
    bodyBytes: request.bodyBytes,
    bodySha256: requestBodySha256,
    matchesAcceptedV1RequestExactly: true,
    evaluationTimeoutMs: EVALUATION_TIMEOUT_MS,
    maximumProviderCalls: 1,
    retries: 0,
    fallbackAllowed: false,
    store: false,
    stream: false,
  },
  schemaTranslation,
  syntheticPacket: {
    bytes: Buffer.byteLength(packetJson, "utf8"),
    sha256: packetSha256,
    matchesAcceptedV1PacketExactly: true,
    privacyValid: privacy.valid,
    privacyReasonCodes: privacy.reasonCodes,
    syntheticBoundary,
    packet,
  },
  telemetry,
  structuredPlannerObject: output,
  providerSchemaValidation,
  strictLocalPlannerValidation: strictLocalValidation,
  translatedConstraintValidation,
  referenceGrounding,
  qualityReview,
  deterministicRateRevealStatePreserved: true,
  safetyCounters,
  safetyViolationTotal,
  recommendation,
});

await writeFile(RESULT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
await writeFile(REPORT_PATH, renderReport(artifact));
await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "full_planner_schema_synthetic_preflight_attempt_guard_2026_09_15_v2",
  evaluationCheckpoint: EVALUATION_CHECKPOINT,
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
  syntheticPacket: {
    bytes: artifact.syntheticPacket.bytes,
    privacyValid: artifact.syntheticPacket.privacyValid,
    syntheticBoundary: artifact.syntheticPacket.syntheticBoundary,
  },
  telemetry: artifact.telemetry,
  structuredPlannerObject: artifact.structuredPlannerObject,
  providerSchemaValidation: artifact.providerSchemaValidation,
  strictLocalPlannerValidation: artifact.strictLocalPlannerValidation,
  translatedConstraintValidation: artifact.translatedConstraintValidation,
  referenceGrounding: artifact.referenceGrounding,
  qualityReview: artifact.qualityReview,
  safetyCounters: artifact.safetyCounters,
  safetyViolationTotal: artifact.safetyViolationTotal,
  recommendation: artifact.recommendation,
}, null, 2));

function inspectSyntheticPacketBoundary(packetJson: string): Readonly<{ valid: boolean; reasonCodes: readonly string[] }> {
  const reasons: string[] = [];
  if (!packetJson.includes("SYNTHETIC_PROCESSOR_FAMILY_X") || !packetJson.includes("SYNTHETIC_SERVICE_PROGRAM_X")) reasons.push("fictitious_processor_or_program_missing");
  if (!packetJson.includes("2099-02-01") || !packetJson.includes("2099-02-28")) reasons.push("fictitious_period_missing");
  if (/\b(?:Gold|MID|account number|bank account|routing number|tax ID|card number)\b/i.test(packetJson)) reasons.push("prohibited_identifier_marker_present");
  if (/[/\\](?:Users|home|private|tmp)[/\\]/i.test(packetJson) || /\.pdf\b/i.test(packetJson)) reasons.push("file_or_path_marker_present");
  if (!/"merchantBusinessContext":null/.test(packetJson)) reasons.push("business_context_not_null");
  return Object.freeze({ valid: reasons.length === 0, reasonCodes: Object.freeze(reasons.sort()) });
}

function inspectPlannerQuality(value: unknown): Readonly<Record<string, boolean | string>> {
  const plan = asRecord(value);
  const primary = asRecord(plan?.primaryHypothesis);
  const alternatives = Array.isArray(plan?.alternativeHypotheses) ? plan.alternativeHypotheses.map(asRecord).filter(Boolean) : [];
  const primaryText = typeof primary?.hypothesis === "string" ? primary.hypothesis.trim() : "";
  const alternativeText = typeof alternatives[0]?.hypothesis === "string" ? String(alternatives[0]?.hypothesis).trim() : "";
  const documentRequests = stringArray(plan?.documentRequestSuggestions);
  const evidenceGaps = stringArray(plan?.acknowledgedEvidenceGaps);
  const coherentPrimary = primaryText.length > 0;
  const genuinelyDifferentAlternative = alternativeText.length > 0 && normalize(primaryText) !== normalize(alternativeText);
  const missingEvidenceAcknowledged = evidenceGaps.length > 0
    && stringArray(primary?.acknowledgedEvidenceGaps).length > 0
    && stringArray(alternatives[0]?.acknowledgedEvidenceGaps).length > 0;
  const resolutionPathSensible = plan?.recommendedResolutionPath === "DOCUMENT_REQUIRED"
    && stringArray(plan?.requiredEvidenceClasses).includes("MERCHANT_CONTRACT_OR_SCHEDULE");
  const evidenceRequestSpecific = documentRequests.some((item) => /SYNTHETIC SERVICE PROGRAM X|agreement|schedule/i.test(item));
  const preservedUncertainty = plan?.unresolvedAfterAnalysis === true
    && !/\b(?:definitely|conclusively resolved|is established as|has been established as)\b/i.test(`${primaryText} ${alternativeText}`);
  return Object.freeze({
    primaryHypothesisCoherent: coherentPrimary,
    alternativeGenuinelyDifferent: genuinelyDifferentAlternative,
    missingEvidenceAcknowledged,
    selectedResolutionPathSensible: resolutionPathSensible,
    evidenceRequestSpecific,
    avoidedPretendingResolved: preservedUncertainty,
    summary: [coherentPrimary, genuinelyDifferentAlternative, missingEvidenceAcknowledged, resolutionPathSensible, evidenceRequestSpecific, preservedUncertainty].every(Boolean)
      ? "PASS" : "REVIEW_REQUIRED",
  });
}

function recommend(
  success: boolean,
  category: OpenRouterPreflightFailureCategoryV2 | null,
  providerValidation: boolean,
  localValidation: boolean,
): Readonly<{ code: "FULL_PLANNER_SCHEMA_READY_FOR_GOLD_SHADOW_EVALUATION" | "MODEL_TOO_SLOW_FOR_CURRENT_PLANNER_ENVELOPE" | "FULL_SCHEMA_COMPATIBILITY_BLOCKED" | "MODEL_OUTPUT_FAILED_LOCAL_VALIDATION" | "TRANSPORT_FAILURE" | "INCONCLUSIVE"; reason: string }> {
  if (success) return Object.freeze({ code: "FULL_PLANNER_SCHEMA_READY_FOR_GOLD_SHADOW_EVALUATION", reason: "The single synthetic full-planner response passed translated provider-schema, strict local planner, removed-constraint, and reference-grounding validation." });
  if (category === "TIMEOUT") {
    return Object.freeze({ code: "MODEL_TOO_SLOW_FOR_CURRENT_PLANNER_ENVELOPE", reason: "The single request exceeded the final Product-authorized 60-second full-planner evaluation envelope." });
  }
  if (["PROVIDER_ROUTING_FAILURE", "RATE_LIMIT", "TRANSPORT_NETWORK_FAILURE"].includes(category ?? "")) {
    return Object.freeze({ code: "TRANSPORT_FAILURE", reason: `The single request failed with ${category}.` });
  }
  if (category === "STRUCTURED_OUTPUT_INCOMPATIBILITY" || category === "MALFORMED_REQUEST" || !providerValidation) {
    return Object.freeze({ code: "FULL_SCHEMA_COMPATIBILITY_BLOCKED", reason: `Full provider-schema compatibility failed with ${category ?? "provider_schema_validation_failure"}.` });
  }
  if (!localValidation) return Object.freeze({ code: "MODEL_OUTPUT_FAILED_LOCAL_VALIDATION", reason: "The returned object did not pass the unchanged accepted local planner validator." });
  return Object.freeze({ code: "INCONCLUSIVE", reason: `The single preflight did not satisfy all success criteria: ${category ?? "incomplete_metadata_or_grounding"}.` });
}

function renderReport(value: typeof artifact): string {
  return `# Full Planner Schema Synthetic Preflight v2 — Extended Timeout\n\nStatus: **${value.success ? "SUCCESS" : "FAILED"}**\nRecommendation: **${value.recommendation.code}**\n\n- Provider: ${value.provider}\n- Requested model: \`${value.requestedModel}\`\n- Returned model: ${value.telemetry.returnedModel ? `\`${value.telemetry.returnedModel}\`` : "not exposed"}\n- Selected provider: ${value.telemetry.selectedProvider ?? "not exposed"}\n- Calls: ${value.telemetry.callCount}/1\n- Retries: ${value.telemetry.retries}\n- HTTP status: ${value.telemetry.httpStatus ?? "not available"}\n- Request bytes: ${value.request.bodyBytes}\n- Local/provider schema bytes: ${value.schemaTranslation.localSchemaBytes}/${value.schemaTranslation.providerSchemaBytes}\n- Synthetic packet bytes: ${value.syntheticPacket.bytes}\n- Provider-schema validation: ${value.providerSchemaValidation.valid}\n- Strict local planner validation: ${value.strictLocalPlannerValidation.valid}\n- Reference grounding: ${value.referenceGrounding.valid}\n- Input/output/total tokens: ${value.telemetry.inputTokens ?? "not available"}/${value.telemetry.outputTokens ?? "not available"}/${value.telemetry.totalTokens ?? "not available"}\n- Total latency: ${value.telemetry.latencyMs} ms\n- Time to headers: ${value.telemetry.timeToHeadersMs ?? "not available"} ms\n- Headers to completed body: ${value.telemetry.bodyReadLatencyMs ?? "not available"} ms\n- Content type: ${value.telemetry.contentType ?? "not exposed"}\n- Header-reported model/provider: ${value.telemetry.headerReportedModel ?? "not exposed"}/${value.telemetry.headerReportedProvider ?? "not exposed"}\n- Accounted cost: ${value.telemetry.accountedCostUsd === null ? "not available" : `$${value.telemetry.accountedCostUsd}`}\n- Quality mini-review: ${value.qualityReview.summary}\n\nOnly the synthetic packet was transmitted. Privacy validation passed: ${value.syntheticPacket.privacyValid}. Safety violation total: ${value.safetyViolationTotal}. No Gold evaluation, retry, fallback, research, source admission, truth mutation, customer output, or production routing occurred.\n`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
