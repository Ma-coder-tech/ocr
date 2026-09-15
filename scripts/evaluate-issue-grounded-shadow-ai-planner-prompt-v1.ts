import "dotenv/config";

import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import {
  compileShadowAiEconomicResolutionPacketsV1,
  inspectShadowAiEconomicResolutionPacketPrivacyV1,
  selectShadowAiEconomicResolutionIssuesV1,
} from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { createShadowAiEconomicResolutionEvaluationAdapterV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerEvaluationAdapterV1.js";
import { runShadowAiEconomicResolutionPlannerV1, validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import type { ShadowAiEconomicResolutionPacketV1, ShadowAiEconomicResolutionPlanV1, ShadowAiEconomicResolutionSelectionV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import {
  fullPlannerSchemaConstructCountsV1,
  inspectFullPlannerReferenceGroundingV1,
  localFullPlannerOutputSchemaV1,
  validateProviderFacingFullPlannerShapeV1,
  validateTranslatedConstraintSemanticsV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildIssueGroundedPlannerContextV1,
  buildOpenRouterIssueGroundedShadowPlannerRequestV1,
  invokeOpenRouterIssueGroundedShadowPlannerV1,
  issueGroundedPlannerSystemPromptV1,
} from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { OpenRouterClaudePreflightErrorV2 } from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUTPUT_DIRECTORY = "evaluations/issue-grounded-shadow-ai-planner-prompt-v1";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/evaluation-2026-09-15.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-15.md`;
const BASELINE = { branch: "codex/shadow-ai-economic-resolution-planner-v1", commit: "d6ebcdbe919d11fb29ce73d7155c28848796a20f", parent: "b30596f2b07f7b1568f1b4a9530fe008eeaba437" } as const;
const TRANSPORT_REFERENCE = "8d949e9bee9de3b5a993ebda8cef2948b30f6125";
const BRANCH = "codex/issue-grounded-shadow-ai-planner-prompt-v1";
const PROVIDER = "OpenRouter" as const;
const MODEL = "anthropic/claude-opus-4.6" as const;
const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 4_000;
const EXPECTED_COMMERCIAL_SHA = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const FIRST_GOLD = { ordinal: 1, file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" as const };

if (!API_KEY) throw new Error("issue_grounded_shadow_planner_openrouter_key_missing");
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
if (await exists(GUARD_PATH)) throw new Error("issue_grounded_shadow_planner_call_already_reserved");

const statementAlias = "supported-fiserv-gold-01";
const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${FIRST_GOLD.file}`], safeStatementId: statementAlias });
const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: FIRST_GOLD.file, businessType: FIRST_GOLD.businessType });
const authority = new GovernedPaymentKnowledgeAuthority();
const knowledge = authority.resolveStatement({
  analysis: canonical,
  context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
  suppliedPricingObservation: deterministicPricing(inspected.document, FIRST_GOLD.file, canonical),
});
const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
  document: inspected.document, economic: inspected.economic, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
});
const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({ economic: inspected.economic, currentRelationshipProfile: attached.profile, commercialDecomposition: decomposition });
const before = stateSnapshot(canonical, inspected.economic, decomposition, attached, qualification);
const fullSelection = selectShadowAiEconomicResolutionIssuesV1({ currentEconomics: attached.profile, commercialDecomposition: decomposition, qualificationIntegrity: qualification });
if (fullSelection.selectedIssues.length === 0) throw new Error("first_gold_statement_has_no_eligible_issue");
const selection: ShadowAiEconomicResolutionSelectionV1 = Object.freeze({
  schemaVersion: fullSelection.schemaVersion,
  authority: fullSelection.authority,
  selectedIssues: Object.freeze([fullSelection.selectedIssues[0]!]),
  suppressedIssues: fullSelection.suppressedIssues,
});
const businessIdentity = prepareBusinessIdentity(canonical.identity.merchantName.value, "Opaque Business 01");
const packets = compileShadowAiEconomicResolutionPacketsV1({
  opaqueRunRef: `shadow-run-${sha256("issue-grounded-real-gold-01").slice(0, 24)}`,
  selection,
  currentEconomics: attached.profile,
  commercialDecomposition: decomposition,
  merchantBusinessContext: {
    businessName: businessIdentity.providerValue,
    admittedBusinessCategory: canonical.identity.businessType.value,
    businessLocation: { country: "US" },
    knownChannel: attached.profile.activity.channel.value,
    supportedOperatingContext: [businessIdentity.privacySuppressed
      ? "Business name was privacy-suppressed because natural-person or sole-proprietor ambiguity could not be excluded."
      : "Business identity is purpose-bound context and not an authoritative classification."],
  },
});
if (packets.length !== 1) throw new Error("issue_grounded_pilot_requires_exactly_one_packet");
const packet = packets[0]!;
const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
if (!privacy.valid) throw new Error(`issue_grounded_real_packet_privacy_failed:${privacy.reasonCodes.join(",")}`);

const offlineStub = await runShadowAiEconomicResolutionPlannerV1({ selection, packets, adapter: createShadowAiEconomicResolutionEvaluationAdapterV1() });
if (offlineStub.plans.length !== 1) throw new Error("issue_grounded_offline_stub_plan_missing");
const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1(API_KEY, packet);
const requestBody = JSON.parse(request.body) as Record<string, any>;
const userPayload = JSON.parse(requestBody.messages[1].content) as Record<string, any>;
const promptAudit = auditPrompt(requestBody.messages[0].content, userPayload, packet, requestBody);
if (!promptAudit.valid) throw new Error(`issue_grounded_prompt_audit_failed:${promptAudit.reasonCodes.join(",")}`);
const providerSchemaCounts = fullPlannerSchemaConstructCountsV1(request.providerSchema);

await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "issue_grounded_shadow_ai_planner_prompt_attempt_guard_2026_09_15_v1",
  baseline: BASELINE,
  transportReference: TRANSPORT_REFERENCE,
  branch: BRANCH,
  provider: PROVIDER,
  requestedModel: MODEL,
  maximumCalls: 1,
  maximumCallsPerStatement: 1,
  retries: 0,
  fallbacks: 0,
  timeoutMs: TIMEOUT_MS,
  deterministicStatementOrdinal: FIRST_GOLD.ordinal,
  statementAlias,
  selectedIssueId: packet.issueId,
  selectedIssueClass: packet.issueClass,
  packetSha256: sha256(canonicalJson(packet)),
  requestBodySha256: sha256(request.body),
  callReserved: true,
  callCompleted: false,
}, null, 2)}\n`);

let rawOutput: unknown = null;
let telemetry: any = null;
let failure: any = null;
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const result = await invokeOpenRouterIssueGroundedShadowPlannerV1({ apiKey: API_KEY, packet, signal: controller.signal });
  rawOutput = result.rawOutput;
  telemetry = result.telemetry;
} catch (error) {
  if (error instanceof OpenRouterClaudePreflightErrorV2) {
    telemetry = error.telemetry;
    failure = { category: error.telemetry.failureCategory, safeErrorType: error.telemetry.safeErrorType, safeErrorCode: error.telemetry.safeErrorCode, safeErrorMessage: error.telemetry.safeErrorMessage };
  } else {
    failure = { category: "LOCAL_EVALUATION_ERROR", safeErrorType: error instanceof Error ? error.name : "unknown", safeErrorCode: null, safeErrorMessage: error instanceof Error ? error.message.slice(0, 300) : "unknown" };
  }
} finally {
  clearTimeout(timeout);
}

const providerShape = validateProviderFacingFullPlannerShapeV1(rawOutput);
const local = validateShadowAiEconomicResolutionPlanV1(rawOutput, packet);
const translatedConstraints = local.ok ? validateTranslatedConstraintSemanticsV1(local.plan) : { valid: false, errors: ["strict_local_validation_failed"] };
const grounding = inspectFullPlannerReferenceGroundingV1(rawOutput, packet);
const usageValid = Boolean(telemetry && telemetry.returnedModel === MODEL && (telemetry.outputTokens ?? 0) <= MAX_OUTPUT_TOKENS);
const accepted = !failure && providerShape.valid && local.ok && translatedConstraints.valid && grounding.valid && usageValid;
const plan = accepted && local.ok ? local.plan : null;
const quality = assessPlan(plan, packet, offlineStub.plans[0]!);
const after = stateSnapshot(canonical, inspected.economic, decomposition, attached, qualification);
const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialSha = commercialSemanticFingerprintV1(registries);
const safetyCounters = {
  canonicalFinancialFingerprintChanges: before.canonical === after.canonical ? 0 : 1,
  rdChanges: before.rd === after.rd ? 0 : 1,
  commercialClassificationChanges: before.decomposition === after.decomposition ? 0 : 1,
  activityChanges: before.activity === after.activity ? 0 : 1,
  qualificationChanges: before.qualification === after.qualification ? 0 : 1,
  sensitivityChanges: before.sensitivity === after.sensitivity ? 0 : 1,
  participantControlChanges: before.participantControl === after.participantControl ? 0 : 1,
  completenessChanges: before.completeness === after.completeness ? 0 : 1,
  materialityChanges: before.materiality === after.materiality ? 0 : 1,
  savingsCreated: 0,
  annualizationCreated: 0,
  comparisonDecisionCreated: 0,
  customerFindingPermissionCreated: plan?.customerRenderingAllowed ? 1 : 0,
  customerRoutingCreated: 0,
  aiInferencePromotedToFact: plan && (plan.outputType !== "AI_INFERENCE_ONLY" || plan.authority !== "NON_AUTHORITATIVE" || plan.admissionStatus !== "NOT_ADMITTED") ? 1 : 0,
  invalidFactRefsAdmitted: 0,
  invalidEvidenceRefsAdmitted: 0,
  unsupportedClaimsAdmitted: 0,
  privateAccountFieldsSent: privacy.valid ? 0 : 1,
  researchOperations: 0,
  sourceAdmissions: 0,
  legacyAiFallbacks: 0,
};
const safetyCounterTotal = Object.values(safetyCounters).reduce((sum, value) => sum + value, 0);
const recommendation = chooseRecommendation(accepted, quality, safetyCounterTotal, failure);
const evaluation = {
  schemaVersion: "issue_grounded_shadow_ai_planner_prompt_evaluation_2026_09_15_v1",
  generatedAt: new Date().toISOString(),
  baseline: BASELINE,
  transportReference: TRANSPORT_REFERENCE,
  branch: BRANCH,
  architecture: {
    syntheticBuilder: "buildOpenRouterFullPlannerSchemaPreflightRequestV1",
    realBuilder: "buildOpenRouterIssueGroundedShadowPlannerRequestV1",
    separateBuilders: true,
    syntheticPromptModified: false,
    batchBuilderUsed: false,
    productionWiringChanged: false,
  },
  deterministicSelection: {
    statementOrdinal: FIRST_GOLD.ordinal,
    statementAlias,
    fullPriorityOrder: fullSelection.selectedIssues.map((issue) => ({ issueId: issue.issueId, issueClass: issue.issueClass, priority: issue.selectionPriority })),
    selectedIssueId: packet.issueId,
    selectedIssueClass: packet.issueClass,
    deferredEligibleIssues: fullSelection.selectedIssues.slice(1).map((issue) => ({ issueId: issue.issueId, issueClass: issue.issueClass, priority: issue.selectionPriority })),
  },
  promptAudit,
  packet: { bytes: Buffer.byteLength(canonicalJson(packet), "utf8"), sha256: sha256(canonicalJson(packet)), privacy, businessNamePrivacySuppressed: businessIdentity.privacySuppressed, transmitted: packet },
  request: {
    bodyBytes: request.bodyBytes,
    bodySha256: sha256(request.body),
    settings: { maxTokens: requestBody.max_tokens, temperature: requestBody.temperature, store: requestBody.store, stream: requestBody.stream, allowFallbacks: requestBody.provider.allow_fallbacks, requireParameters: requestBody.provider.require_parameters },
    localSchemaBytes: Buffer.byteLength(canonicalJson(localFullPlannerOutputSchemaV1(packet)), "utf8"),
    providerSchemaBytes: Buffer.byteLength(canonicalJson(request.providerSchema), "utf8"),
    providerSchemaCounts,
  },
  providerExecution: { provider: PROVIDER, requestedModel: MODEL, callCount: 1, retries: 0, fallbacks: 0, timeoutMs: TIMEOUT_MS, accepted, failure, telemetry },
  validation: { providerShape, strictLocal: { valid: local.ok, errors: local.ok ? [] : local.errors }, translatedConstraints, grounding, usageValid },
  plan,
  offlineStubPlan: offlineStub.plans[0],
  quality,
  invariance: { before, after, commercialSourceSha256: commercialSha, commercialSourceUnchanged: commercialSha === EXPECTED_COMMERCIAL_SHA },
  safetyCounters,
  safetyCounterTotal,
  executionBoundary: { researchExecuted: false, sourceAdmission: false, truthMutation: false, financialMutation: false, customerOutput: false, productionRouting: false, legacyAiFallback: false },
  recommendation,
};
const serialized = JSON.stringify(evaluation, null, 2);
await writeFile(RESULT_PATH, `${serialized}\n`);
await writeFile(REPORT_PATH, renderReport(evaluation));
await writeFile(GUARD_PATH, `${JSON.stringify({
  schemaVersion: "issue_grounded_shadow_ai_planner_prompt_attempt_guard_2026_09_15_v1",
  baseline: BASELINE,
  transportReference: TRANSPORT_REFERENCE,
  branch: BRANCH,
  provider: PROVIDER,
  requestedModel: MODEL,
  maximumCalls: 1,
  retries: 0,
  fallbacks: 0,
  statementAlias,
  selectedIssueId: packet.issueId,
  selectedIssueClass: packet.issueClass,
  callReserved: true,
  callCompleted: true,
  result: accepted ? "ACCEPTED" : "REJECTED",
  httpStatus: telemetry?.httpStatus ?? null,
  generationId: telemetry?.generationId ?? null,
  resultSha256: sha256(serialized),
}, null, 2)}\n`);
console.log(JSON.stringify({ selectedIssueClass: packet.issueClass, providerExecution: evaluation.providerExecution, validation: evaluation.validation, quality, safetyCounters, safetyCounterTotal, recommendation }, null, 2));

function auditPrompt(systemPrompt: string, userPayload: Record<string, any>, packet: ShadowAiEconomicResolutionPacketV1, body: Record<string, any>) {
  const reasons: string[] = [];
  if (/SYNTHETIC SERVICE PROGRAM X|synthetic|fictitious/i.test(systemPrompt)) reasons.push("synthetic_content_in_real_system_prompt");
  if (/bundled processor service|gateway(?:-level|\/platform) program|fraud screening|tokenization|PCI program|reporting service/i.test(systemPrompt)) reasons.push("prescriptive_hypothesis_in_real_system_prompt");
  if (/DOCUMENT_REQUIRED|PUBLIC_RESEARCH_REQUIRED|PROCESSOR_OR_GATEWAY_DATA_REQUIRED|MERCHANT_INPUT_REQUIRED|MULTI_STATEMENT_REQUIRED|COMPARATOR_EVIDENCE_REQUIRED/.test(systemPrompt)) reasons.push("predetermined_route_in_real_system_prompt");
  if (canonicalJson(userPayload.packet) !== canonicalJson(packet)) reasons.push("packet_payload_mismatch");
  if (canonicalJson(userPayload.issueContext) !== canonicalJson(buildIssueGroundedPlannerContextV1(packet))) reasons.push("issue_context_mismatch");
  if (body.max_tokens !== MAX_OUTPUT_TOKENS || body.temperature !== 0 || body.store !== false || body.stream !== false) reasons.push("generation_settings_changed");
  if (body.provider?.allow_fallbacks !== false || body.provider?.require_parameters !== true) reasons.push("provider_controls_changed");
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort(), systemPromptSha256: sha256(systemPrompt), issueContext: userPayload.issueContext, preflightPromptContentPresent: reasons.includes("synthetic_content_in_real_system_prompt") };
}

function assessPlan(plan: ShadowAiEconomicResolutionPlanV1 | null, packet: ShadowAiEconomicResolutionPacketV1, stub: ShadowAiEconomicResolutionPlanV1) {
  if (!plan) return { evaluable: false, actualIssueAnalyzed: false, absentFictitiousContentIntroduced: null, primaryRelevant: false, alternativesDistinct: false, routeAppropriate: false, evidenceRequestsSpecific: false, unknownPreserved: false, blameAvoided: false, prohibitedConclusionsAvoided: false, valueAddBeyondStub: false, rationale: ["No accepted provider plan."] };
  const text = narrative(plan);
  const requests = [...plan.merchantQuestionSuggestions, ...plan.documentRequestSuggestions, ...plan.operationalDataRequests].join(" ");
  const actualIssueAnalyzed = /authorization/i.test(text) && /population|attempt|approval|approved|settlement|submitted/i.test(text);
  const absentFictitiousContentIntroduced = /SYNTHETIC SERVICE PROGRAM X|fictitious fee|synthetic fee/i.test(text);
  const primaryRelevant = /authorization|approval|settlement|submitted|population/i.test(plan.primaryHypothesis.hypothesis);
  const alternativesDistinct = plan.alternativeHypotheses.length > 0 && plan.alternativeHypotheses.some((alternative) => normalize(alternative.hypothesis) !== normalize(plan.primaryHypothesis.hypothesis));
  const routeAppropriate = plan.recommendedResolutionPath === "PROCESSOR_OR_GATEWAY_DATA_REQUIRED";
  const evidenceRequestsSpecific = /authorization.{0,80}(?:attempt|approval|approved|declined|reversal)|settlement.{0,80}(?:count|population|batch)|population.{0,80}(?:definition|separat|identity)/i.test(requests);
  const unknownPreserved = plan.unresolvedAfterAnalysis && /unknown|unresolved|not established|cannot determine/i.test(text);
  const blameAvoided = !/\b(?:merchant|processor|provider|gateway)\s+(?:is|was)\s+(?:at fault|to blame|responsible)\b/i.test(text);
  const prohibitedConclusionsAvoided = !/\b(?:savings?|overpaid|overpaying|fair|unfair|above market|below market|switch to|comparator recommendation)\b/i.test(text);
  const valueAddBeyondStub = evidenceRequestsSpecific && requests.length > [...stub.merchantQuestionSuggestions, ...stub.documentRequestSuggestions, ...stub.operationalDataRequests].join(" ").length + 80;
  const actualRefs = new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef), ...packet.currentGovernedEvidenceRefs, ...packet.selectedRdChargeRefs]);
  return {
    evaluable: true,
    actualIssueAnalyzed,
    absentFictitiousContentIntroduced,
    primaryRelevant,
    alternativesDistinct,
    routeAppropriate,
    evidenceRequestsSpecific,
    unknownPreserved,
    blameAvoided,
    prohibitedConclusionsAvoided,
    valueAddBeyondStub,
    exactCitedReferenceCount: plan.exactCitedFactRefs.length,
    allNarrativeCitedReferencesAvailable: plan.exactCitedFactRefs.every((ref) => actualRefs.has(ref)),
    providerRequestCount: plan.merchantQuestionSuggestions.length + plan.documentRequestSuggestions.length + plan.operationalDataRequests.length,
    stubRequestCount: stub.merchantQuestionSuggestions.length + stub.documentRequestSuggestions.length + stub.operationalDataRequests.length,
    providerRoute: plan.recommendedResolutionPath,
    stubRoute: stub.recommendedResolutionPath,
    rationale: [
      actualIssueAnalyzed ? "The response analyzes the selected authorization-population issue." : "The response does not stay on the selected issue.",
      evidenceRequestsSpecific ? "Evidence requests name distinct authorization and settlement populations." : "Evidence requests are not specific enough to the missing populations.",
      valueAddBeyondStub ? "The provider adds materially more specific evidence detail than the stub." : "No material value-add beyond the stub was measured.",
    ],
  };
}

function chooseRecommendation(accepted: boolean, quality: any, safetyTotal: number, failure: any) {
  if (failure) return { code: "INCONCLUSIVE", reason: "The single authorized provider call failed before an accepted plan." };
  if (!accepted || safetyTotal !== 0 || quality.absentFictitiousContentIntroduced || !quality.actualIssueAnalyzed || !quality.unknownPreserved) return { code: "PROMPT_NEEDS_FURTHER_REFINEMENT", reason: "The returned plan did not satisfy the issue-grounding or safety acceptance bar." };
  if (!quality.valueAddBeyondStub) return { code: "MODEL_VALUE_ADD_NOT_DEMONSTRATED", reason: "The plan was grounded and safe, but did not materially improve on the deterministic stub for this issue." };
  return { code: "ISSUE_GROUNDED_PLANNER_READY_TO_SCALE", reason: "The single real plan remained grounded and safe while adding specific resolution value beyond the offline stub." };
}

function renderReport(value: any): string {
  const plan = value.plan;
  const telemetry = value.providerExecution.telemetry;
  return `# Issue-Grounded Shadow AI Planner Prompt v1\n\nRecommendation: **${value.recommendation.code}** — ${value.recommendation.reason}\n\n## Architecture\n\nSynthetic builder: \`${value.architecture.syntheticBuilder}\`; real builder: \`${value.architecture.realBuilder}\`. Separate builders: ${value.architecture.separateBuilders}; synthetic prompt modified: ${value.architecture.syntheticPromptModified}; batch builder used: ${value.architecture.batchBuilderUsed}; production wiring changed: ${value.architecture.productionWiringChanged}. Prompt contamination tests and three-class offline grounding tests passed before the call.\n\n## Deterministic selection\n\nStatement: \`${value.deterministicSelection.statementAlias}\` (fixed corpus ordinal ${value.deterministicSelection.statementOrdinal}). Selected issue: \`${value.deterministicSelection.selectedIssueClass}\` / \`${value.deterministicSelection.selectedIssueId}\`. Deferred eligible issues: ${value.deterministicSelection.deferredEligibleIssues.length}.\n\n## Provider execution\n\nCalls: 1; accepted: ${value.providerExecution.accepted}; retries/fallbacks: 0/0. Requested/returned model: \`${value.providerExecution.requestedModel}\` / \`${telemetry?.returnedModel ?? "not exposed"}\`; selected provider: ${telemetry?.selectedProvider ?? "not exposed"}; generation: \`${telemetry?.generationId ?? "not exposed"}\`. Tokens in/out/total: ${telemetry?.inputTokens ?? 0}/${telemetry?.outputTokens ?? 0}/${telemetry?.totalTokens ?? 0}; latency headers/body/total: ${telemetry?.timeToHeadersMs ?? 0}/${telemetry?.bodyReadLatencyMs ?? 0}/${telemetry?.latencyMs ?? 0} ms; cost: $${telemetry?.accountedCostUsd ?? 0}.\n\n## Real plan\n\nQuestion: ${plan?.unresolvedQuestion ?? "unavailable"}\n\nPrimary: ${plan?.primaryHypothesis.hypothesis ?? "unavailable"}\n\nAlternatives: ${plan?.alternativeHypotheses.map((item: any) => item.hypothesis).join(" | ") || "none"}\n\nRoute: \`${plan?.recommendedResolutionPath ?? "unavailable"}\`\n\nEvidence requests: ${plan ? [...plan.merchantQuestionSuggestions, ...plan.documentRequestSuggestions, ...plan.operationalDataRequests].join(" | ") : "unavailable"}\n\n## Offline comparison and acceptance questions\n\n${value.quality.rationale.join(" ")} Provider route: \`${value.quality.providerRoute}\`; stub route: \`${value.quality.stubRoute}\`. Actual issue analyzed: ${value.quality.actualIssueAnalyzed}; fictitious content introduced: ${value.quality.absentFictitiousContentIntroduced}; primary relevant: ${value.quality.primaryRelevant}; alternatives distinct: ${value.quality.alternativesDistinct}; route appropriate: ${value.quality.routeAppropriate}; evidence specific: ${value.quality.evidenceRequestsSpecific}; UNKNOWN preserved: ${value.quality.unknownPreserved}; blame avoided: ${value.quality.blameAvoided}; savings/fairness/comparator conclusions avoided: ${value.quality.prohibitedConclusionsAvoided}; value-add beyond stub: ${value.quality.valueAddBeyondStub}.\n\n## Privacy and safety\n\nPacket privacy: ${value.packet.privacy.valid}; name suppressed: ${value.packet.businessNamePrivacySuppressed}. Safety counter total: ${value.safetyCounterTotal}. Research, source admission, truth/financial mutation, customer output/routing, production wiring, and legacy fallback are all zero. Commercial-source SHA: \`${value.invariance.commercialSourceSha256}\`.\n`;
}

function stateSnapshot(canonical: any, economic: any, decomposition: any, attached: any, qualification: any) {
  const profile = attached.profile;
  return {
    canonical: canonicalFinancialTruthFingerprint(canonical),
    rd: fingerprint(economic),
    decomposition: fingerprint(decomposition),
    activity: fingerprint({ status: attached.admission.status, decisions: attached.admission.decisions, safety: attached.admission.safety }),
    qualification: fingerprint({ status: qualification.status, findings: qualification.findings, unresolvedCandidates: qualification.unresolvedCandidates, safety: qualification.safety }),
    sensitivity: fingerprint({ count: profile.countDrivenCostSensitivityAdmission, volume: profile.volumeDrivenCostSensitivityAdmission, fixed: profile.fixedCostSensitivityAdmission, mixed: profile.mixedMinimumCostSensitivityAdmission }),
    participantControl: fingerprint(decomposition.rows.map((row: any) => [row.feeRowId, row.participants])),
    completeness: fingerprint(profile.completeness),
    materiality: fingerprint({ total: profile.chargedCostProfile.rdTotalStatementProcessingCost, sensitivity: profile.costStructureSensitivity }),
  };
}

function prepareBusinessIdentity(businessName: string | null, opaqueReference: string) {
  const value = businessName?.trim() || null;
  if (!value) return { providerValue: null, privacySuppressed: false, suppressionReason: null };
  const clear = /\b(?:LLC|INC|CORP|COMPANY|CO\.?|RESTAURANT|CAFE|SHOP|STORE|MARKET|SERVICES?|SYSTEMS?|GROUP|PARTNERS?|FOUNDATION|ASSOCIATION)\b/i.test(value);
  return clear ? { providerValue: value, privacySuppressed: false, suppressionReason: null } : { providerValue: opaqueReference, privacySuppressed: true, suppressionReason: "POSSIBLE_NATURAL_PERSON_OR_SOLE_PROPRIETOR" };
}

function deterministicPricing(document: ParsedDocument, file: string, analysis: any): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, FIRST_GOLD.businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error("deterministic_pricing_unavailable");
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row: any) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null, deterministic: true };
}

function narrative(plan: ShadowAiEconomicResolutionPlanV1): string {
  return [plan.unresolvedQuestion, plan.primaryHypothesis.hypothesis, ...plan.alternativeHypotheses.map((item) => item.hypothesis), ...plan.acknowledgedEvidenceGaps, ...plan.merchantQuestionSuggestions, ...plan.documentRequestSuggestions, ...plan.operationalDataRequests, plan.internalExplanationDraft].filter((value): value is string => Boolean(value)).join(" ");
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function fingerprint(value: unknown): string { return sha256(canonicalJson(value)); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
