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
import {
  createGoldShapedSyntheticPlannerPacketV1,
  inspectGoldShapedSyntheticPacketBoundaryV1,
} from "../src/evaluationIntegrity/openRouterGoldShapedSinglePacketPreflightV1.js";

const ACCEPTED_CHECKPOINT = "e489730b188b0349fdf1e8f8e659ce1e12172e99";
const ACCEPTED_BRANCH = "codex/full-planner-schema-synthetic-preflight-v2-extended-timeout";
const EVALUATION_BRANCH = "codex/gold-shaped-single-packet-planner-preflight-v1";
const MODEL = "anthropic/claude-opus-4.6" as const;
const OUTPUT_DIRECTORY = "evaluations/gold-shaped-single-packet-planner-preflight-v1";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/preflight-2026-09-15.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-15.md`;
const EVALUATION_TIMEOUT_MS = 60_000;
const ACCEPTED_REFERENCE_BODY_SHA256 = "875e4c7fb117078ad9b4cbe2c76a43d9a1cf63ad66804ca016e2caf5acc71a76";
const apiKey = process.env.OPENROUTER_API_KEY ?? "";

if (!apiKey) throw new Error("gold_shaped_single_packet_preflight_credential_missing");
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
if (await exists(GUARD_PATH)) throw new Error("gold_shaped_single_packet_preflight_attempt_already_reserved");

const acceptedReferencePacket = createSyntheticFullPlannerPacketV1();
const acceptedReferenceRequest = buildOpenRouterFullPlannerSchemaPreflightRequestV1(apiKey, acceptedReferencePacket);
if (sha256(acceptedReferenceRequest.body) !== ACCEPTED_REFERENCE_BODY_SHA256) {
  throw new Error("accepted_single_plan_request_builder_reference_changed");
}

const packet = createGoldShapedSyntheticPlannerPacketV1();
const packetJson = canonicalJson(packet);
const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
const syntheticBoundary = inspectGoldShapedSyntheticPacketBoundaryV1(packet);
if (!privacy.valid || !syntheticBoundary.valid) {
  throw new Error(`gold_shaped_single_packet_privacy_failed:${[...privacy.reasonCodes, ...syntheticBoundary.reasonCodes].join(",")}`);
}

// Critical Product boundary: this is the accepted single-plan request builder, not the Gold batch builder.
const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1(apiKey, packet);
const requestBody = JSON.parse(request.body) as Record<string, any>;
const referenceBody = JSON.parse(acceptedReferenceRequest.body) as Record<string, any>;
const structuralParity = inspectRequestStructuralParity(referenceBody, requestBody, acceptedReferenceRequest, request);
if (!structuralParity.valid) throw new Error(`accepted_request_path_parity_failed:${structuralParity.reasonCodes.join(",")}`);

const localSchema = localFullPlannerOutputSchemaV1(packet);
const localConstructCounts = fullPlannerSchemaConstructCountsV1(localSchema);
const providerConstructCounts = fullPlannerSchemaConstructCountsV1(request.providerSchema);
const schemaTranslation = Object.freeze({
  localSchemaBytes: Buffer.byteLength(canonicalJson(localSchema), "utf8"),
  providerSchemaBytes: Buffer.byteLength(canonicalJson(request.providerSchema), "utf8"),
  localConstructCounts,
  providerConstructCounts,
  removedGenerationConstraints: {
    minLength: localConstructCounts.minLength - providerConstructCounts.minLength,
    maxLength: localConstructCounts.maxLength - providerConstructCounts.maxLength,
    maxItems: localConstructCounts.maxItems - providerConstructCounts.maxItems,
  },
  unsupportedProviderKeywordCount: providerConstructCounts.minLength + providerConstructCounts.maxLength + providerConstructCounts.maxItems,
  acceptedLocalContractModified: false,
});
if (schemaTranslation.unsupportedProviderKeywordCount !== 0) throw new Error("provider_schema_translation_incomplete");

const requestBodySha256 = sha256(request.body);
const packetSha256 = sha256(packetJson);
await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "gold_shaped_single_packet_planner_preflight_attempt_guard_2026_09_15_v1",
  acceptedCheckpoint: ACCEPTED_CHECKPOINT,
  evaluationBranch: EVALUATION_BRANCH,
  provider: "OpenRouter",
  requestedModel: MODEL,
  maximumProviderCalls: 1,
  retries: 0,
  fallbackAllowed: false,
  callReserved: true,
  callCompleted: false,
  exactAcceptedBuilderReused: true,
  requestBodyBytes: request.bodyBytes,
  requestBodySha256,
  packetBytes: Buffer.byteLength(packetJson, "utf8"),
  packetSha256,
  syntheticDataOnly: true,
  evaluationTimeoutMs: EVALUATION_TIMEOUT_MS,
}, null, 2)}\n`);

let telemetry: OpenRouterPreflightTelemetryV2;
let output: unknown = null;
let providerSchemaValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let strictLocalValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let translatedConstraintValidation: Readonly<{ valid: boolean; errors: readonly string[] }> = Object.freeze({ valid: false, errors: Object.freeze([]) });
let referenceGrounding: Readonly<{ valid: boolean; citedRefs: readonly string[]; invalidRefs: readonly string[] }> = Object.freeze({ valid: false, citedRefs: Object.freeze([]), invalidRefs: Object.freeze([]) });
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

const qualityReview = inspectPlannerQuality(output);
const prohibitedConclusionAudit = inspectProhibitedConclusions(output);
const success = structuralParity.valid
  && telemetry.httpStatus !== null && telemetry.httpStatus >= 200 && telemetry.httpStatus < 300
  && telemetry.returnedModel === MODEL
  && providerSchemaValidation.valid
  && strictLocalValidation.valid
  && translatedConstraintValidation.valid
  && referenceGrounding.valid
  && qualityReview.contractRequirementsPass
  && prohibitedConclusionAudit.total === 0;
const recommendation = recommend(success, telemetry.failureCategory, providerSchemaValidation.valid, strictLocalValidation.valid);
const safetyCounters = Object.freeze({
  providerCalls: telemetry.callCount,
  retries: telemetry.retries,
  fallbackCalls: 0,
  realMerchantDataSent: 0,
  goldDataSent: 0,
  researchOperations: 0,
  sourceAdmissions: 0,
  truthMutations: 0,
  financialMutations: 0,
  customerRouting: 0,
  customerOutput: 0,
  savingsConclusions: prohibitedConclusionAudit.savings,
  annualizationConclusions: prohibitedConclusionAudit.annualization,
  comparisonDecisions: prohibitedConclusionAudit.comparison,
  blameConclusions: prohibitedConclusionAudit.blame,
});
const safetyViolationTotal = Object.entries(safetyCounters)
  .filter(([key]) => !["providerCalls", "retries"].includes(key))
  .reduce((sum, [, value]) => sum + value, 0);

const artifact = Object.freeze({
  schemaVersion: "gold_shaped_single_packet_planner_preflight_2026_09_15_v1",
  generatedAt: new Date().toISOString(),
  acceptedReference: { branch: ACCEPTED_BRANCH, commit: ACCEPTED_CHECKPOINT },
  evaluationBranch: EVALUATION_BRANCH,
  purpose: "GOLD_SHAPED_SINGLE_PACKET_SYNTHETIC_PREFLIGHT_ONLY",
  exactAcceptedBuilderReused: true,
  prohibitedBuilderUsed: false,
  provider: "OpenRouter",
  requestedModel: MODEL,
  success,
  structuralParity,
  request: {
    endpoint: request.endpoint,
    method: request.method,
    headerNames: Object.keys(request.headers).sort(),
    bodyFields: Object.keys(requestBody).sort(),
    bodyBytes: request.bodyBytes,
    bodySha256: requestBodySha256,
    evaluationTimeoutMs: EVALUATION_TIMEOUT_MS,
    maximumProviderCalls: 1,
    retries: 0,
    fallbackAllowed: false,
    store: requestBody.store,
    stream: requestBody.stream,
    temperature: requestBody.temperature,
    maxTokens: requestBody.max_tokens,
    userPayloadRoot: "packet",
    responseRoot: "single_planner_object",
    schemaName: requestBody.response_format.json_schema.name,
  },
  schemaTranslation,
  syntheticPacket: {
    bytes: Buffer.byteLength(packetJson, "utf8"),
    sha256: packetSha256,
    privacyValid: privacy.valid,
    privacyReasonCodes: privacy.reasonCodes,
    syntheticBoundary,
    structuralCardinality: {
      acceptedActivityFacts: packet.acceptedIssueRelevantActivityFacts.length,
      acceptedFactRefs: packet.acceptedFactRefs.length,
      rdChargeRefs: packet.selectedRdChargeRefs.length,
      governedEvidenceRefs: packet.currentGovernedEvidenceRefs.length,
      participantControlStates: packet.acceptedParticipantControlStates.length,
      unresolvedFacets: packet.unresolvedClaimFacets.length,
      unresolvedReasonCodes: packet.unresolvedReasonCodes.length,
      evidenceClasses: packet.allowedEvidenceClasses.length,
    },
    packet,
  },
  telemetry,
  structuredPlannerObject: output,
  providerSchemaValidation,
  strictLocalPlannerValidation: strictLocalValidation,
  translatedConstraintValidation,
  referenceGrounding,
  qualityReview,
  prohibitedConclusionAudit,
  deterministicRateRevealStatePreserved: true,
  safetyCounters,
  safetyViolationTotal,
  recommendation,
});

const serializedArtifact = JSON.stringify(artifact, null, 2);
await writeFile(RESULT_PATH, `${serializedArtifact}\n`);
await writeFile(REPORT_PATH, renderReport(artifact));
await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "gold_shaped_single_packet_planner_preflight_attempt_guard_2026_09_15_v1",
  acceptedCheckpoint: ACCEPTED_CHECKPOINT,
  evaluationBranch: EVALUATION_BRANCH,
  provider: "OpenRouter",
  requestedModel: MODEL,
  maximumProviderCalls: 1,
  retries: 0,
  fallbackAllowed: false,
  callReserved: true,
  callCompleted: true,
  exactAcceptedBuilderReused: true,
  resultStatus: success ? "SUCCESS" : "FAILED",
  resultSha256: sha256(serializedArtifact),
}, null, 2)}\n`);

console.log(JSON.stringify({
  success,
  exactAcceptedBuilderReused: artifact.exactAcceptedBuilderReused,
  structuralParity,
  packetBytes: artifact.syntheticPacket.bytes,
  request: artifact.request,
  schemaTranslation,
  provider: artifact.provider,
  requestedModel: artifact.requestedModel,
  telemetry,
  structuredPlannerObject: output,
  providerSchemaValidation,
  strictLocalValidation,
  translatedConstraintValidation,
  referenceGrounding,
  qualityReview,
  prohibitedConclusionAudit,
  safetyCounters,
  safetyViolationTotal,
  recommendation,
}, null, 2));

function inspectRequestStructuralParity(reference: Record<string, any>, candidate: Record<string, any>, referenceRequest: any, candidateRequest: any) {
  const reasons: string[] = [];
  const exactFields = ["model", "store", "stream", "temperature", "max_tokens"];
  for (const field of exactFields) if (candidate[field] !== reference[field]) reasons.push(`request_field_changed:${field}`);
  if (canonicalJson(candidate.provider) !== canonicalJson(reference.provider)) reasons.push("provider_routing_changed");
  if (canonicalJson(Object.keys(candidate).sort()) !== canonicalJson(Object.keys(reference).sort())) reasons.push("request_body_fields_changed");
  if (canonicalJson(candidate.messages.map((item: any) => item.role)) !== canonicalJson(["system", "user"])) reasons.push("message_roles_changed");
  if (candidate.messages[0].content !== reference.messages[0].content) reasons.push("system_prompt_changed");
  if (canonicalJson(Object.keys(JSON.parse(candidate.messages[1].content)).sort()) !== canonicalJson(["packet"])) reasons.push("user_packet_wrapper_changed");
  if (candidate.response_format.type !== "json_schema" || candidate.response_format.json_schema.name !== reference.response_format.json_schema.name
    || candidate.response_format.json_schema.strict !== true) reasons.push("response_format_changed");
  if (candidate.response_format.json_schema.schema.properties?.outputs !== undefined) reasons.push("batch_response_wrapper_present");
  if (candidate.max_tokens !== 4_000) reasons.push("max_tokens_not_proven_value");
  if (referenceRequest.endpoint !== candidateRequest.endpoint || referenceRequest.method !== candidateRequest.method
    || canonicalJson(Object.keys(referenceRequest.headers).sort()) !== canonicalJson(Object.keys(candidateRequest.headers).sort())) {
    reasons.push("transport_envelope_changed");
  }
  return Object.freeze({
    valid: reasons.length === 0,
    reasonCodes: Object.freeze(reasons.sort()),
    acceptedReferenceBodySha256: ACCEPTED_REFERENCE_BODY_SHA256,
    acceptedReferenceRequestReconstructed: sha256(referenceRequest.body) === ACCEPTED_REFERENCE_BODY_SHA256,
    bodyFieldsIdentical: canonicalJson(Object.keys(candidate).sort()) === canonicalJson(Object.keys(reference).sort()),
    endpointMethodAndHeaderNamesIdentical: referenceRequest.endpoint === candidateRequest.endpoint
      && referenceRequest.method === candidateRequest.method
      && canonicalJson(Object.keys(referenceRequest.headers).sort()) === canonicalJson(Object.keys(candidateRequest.headers).sort()),
    promptIdentical: candidate.messages[0].content === reference.messages[0].content,
    packetWrapperIdentical: canonicalJson(Object.keys(JSON.parse(candidate.messages[1].content)).sort()) === canonicalJson(["packet"]),
    responseWrapperIdentical: candidate.response_format.json_schema.schema.properties?.outputs === undefined,
    settingsIdentical: exactFields.every((field) => candidate[field] === reference[field]),
  });
}

function inspectPlannerQuality(value: unknown) {
  const plan = asRecord(value);
  const primary = asRecord(plan?.primaryHypothesis);
  const alternatives = Array.isArray(plan?.alternativeHypotheses) ? plan.alternativeHypotheses.map(asRecord).filter(Boolean) : [];
  const primaryText = typeof primary?.hypothesis === "string" ? primary.hypothesis.trim() : "";
  const alternativeTexts = alternatives.map((item) => typeof item?.hypothesis === "string" ? item.hypothesis.trim() : "").filter(Boolean);
  const materiallyDifferent = alternativeTexts.some((item) => normalize(item) !== normalize(primaryText));
  const confirmationAndFalsificationPresent = [primary, ...alternatives].every((item) =>
    stringArray(item?.confirmationRequirements).length > 0 && stringArray(item?.falsificationConditions).length > 0);
  const evidenceGapsRecognized = stringArray(plan?.acknowledgedEvidenceGaps).length > 0
    && [primary, ...alternatives].every((item) => stringArray(item?.acknowledgedEvidenceGaps).length > 0);
  const resolutionPathSpecific = plan?.recommendedResolutionPath === "DOCUMENT_REQUIRED"
    && stringArray(plan?.requiredEvidenceClasses).includes("MERCHANT_CONTRACT_OR_SCHEDULE")
    && stringArray(plan?.documentRequestSuggestions).length > 0;
  const paymentProcessingSpecific = /(?:processor|gateway|platform|service|billing|agreement|schedule)/i.test(
    [primaryText, ...alternativeTexts, ...stringArray(plan?.documentRequestSuggestions), ...stringArray(plan?.operationalDataRequests)].join(" "),
  );
  const uncertaintyPreserved = plan?.unresolvedAfterAnalysis === true
    && primary?.confidence !== "HIGH"
    && !/\b(?:definitely|conclusively established|proven to be)\b/i.test([primaryText, ...alternativeTexts].join(" "));
  const contractRequirementsPass = materiallyDifferent && confirmationAndFalsificationPresent && evidenceGapsRecognized
    && resolutionPathSpecific && uncertaintyPreserved;
  return Object.freeze({
    paymentProcessingReasoningSpecific: paymentProcessingSpecific,
    hypothesesMateriallyDifferent: materiallyDifferent,
    missingEvidenceCorrectlyIdentified: evidenceGapsRecognized,
    confirmationAndFalsificationPresent,
    resolutionPathSpecificAndUseful: resolutionPathSpecific,
    uncertaintyPreserved,
    contractRequirementsPass,
    summary: contractRequirementsPass && paymentProcessingSpecific ? "PASS" : "REVIEW_REQUIRED",
  });
}

function inspectProhibitedConclusions(value: unknown) {
  const text = canonicalJson(value ?? null);
  const savings = /\b(?:estimated|potential|realizable|achievable) savings\b|\boverpaid\b/i.test(text) ? 1 : 0;
  const annualization = /\bannual(?:ized|ization| savings| cost)\b/i.test(text) ? 1 : 0;
  const comparison = /\b(?:switch|select|choose|recommend)\b.{0,50}\b(?:processor|provider|comparator)\b/i.test(text) ? 1 : 0;
  const blame = /\b(?:merchant|processor|gateway)\b.{0,30}\b(?:fault|blame|responsible)\b/i.test(text) ? 1 : 0;
  return Object.freeze({ savings, annualization, comparison, blame, total: savings + annualization + comparison + blame });
}

function recommend(success: boolean, category: OpenRouterPreflightFailureCategoryV2 | null, providerValid: boolean, localValid: boolean) {
  if (success) return Object.freeze({ code: "GOLD_SHAPED_SINGLE_PACKET_READY", reason: "The larger synthetic packet succeeded through the exact accepted single-plan request builder and passed every unchanged validation and safety gate." });
  if (["TIMEOUT", "PROVIDER_ROUTING_FAILURE", "RATE_LIMIT", "TRANSPORT_NETWORK_FAILURE"].includes(category ?? "")) {
    return Object.freeze({ code: "TRANSPORT_FAILURE", reason: `The exact-parity request failed with ${category}.` });
  }
  if (["MALFORMED_REQUEST", "STRUCTURED_OUTPUT_INCOMPATIBILITY"].includes(category ?? "")) {
    return Object.freeze({ code: "DYNAMIC_PACKET_COMPLEXITY_BLOCKED", reason: `The exact accepted single-plan path rejected the larger synthetic packet with ${category}.` });
  }
  if (!providerValid || !localValid) return Object.freeze({ code: "MODEL_OUTPUT_FAILED_LOCAL_VALIDATION", reason: "A response arrived but failed the accepted provider-facing or strict local planner contract." });
  return Object.freeze({ code: "INCONCLUSIVE", reason: `The single request did not satisfy every success criterion: ${category ?? "incomplete metadata, grounding, or quality requirement"}.` });
}

function renderReport(value: typeof artifact): string {
  return `# Gold-Shaped Single-Packet Planner Preflight v1\n\nStatus: **${value.success ? "SUCCESS" : "FAILED"}**\nRecommendation: **${value.recommendation.code}**\n\n- Exact accepted request builder reused: ${value.exactAcceptedBuilderReused}\n- Structural parity: ${value.structuralParity.valid}\n- Provider/model: ${value.provider} / \`${value.requestedModel}\`\n- Returned model/provider: ${value.telemetry.returnedModel ?? "not exposed"} / ${value.telemetry.selectedProvider ?? "not exposed"}\n- Calls/retries/fallbacks: ${value.telemetry.callCount}/1, ${value.telemetry.retries}, 0\n- HTTP status: ${value.telemetry.httpStatus ?? "not available"}\n- Synthetic packet bytes: ${value.syntheticPacket.bytes}\n- Request bytes: ${value.request.bodyBytes}\n- Local/provider schema bytes: ${value.schemaTranslation.localSchemaBytes}/${value.schemaTranslation.providerSchemaBytes}\n- Input/output/total tokens: ${value.telemetry.inputTokens ?? "not available"}/${value.telemetry.outputTokens ?? "not available"}/${value.telemetry.totalTokens ?? "not available"}\n- Latency: ${value.telemetry.latencyMs} ms\n- Accounted cost: ${value.telemetry.accountedCostUsd === null ? "not available" : `$${value.telemetry.accountedCostUsd}`}\n- Provider-schema validation: ${value.providerSchemaValidation.valid}\n- Strict local validation: ${value.strictLocalPlannerValidation.valid}\n- Reference grounding: ${value.referenceGrounding.valid}\n- Quality mini-review: ${value.qualityReview.summary}\n- Privacy validation: ${value.syntheticPacket.privacyValid}\n- Safety violation total: ${value.safetyViolationTotal}\n\nOnly the single enlarged synthetic packet was transmitted. No real merchant data, Gold data, research, source admission, truth mutation, financial mutation, customer output, routing, savings, annualization, comparison decision, production wiring, retry, fallback, or real Gold evaluation occurred.\n`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, any> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
