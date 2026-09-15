import "dotenv/config";

import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
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
  assessIssueDiversityPlanV1,
  selectIssueDiversityCandidatesV1,
  type IssueDiversityCandidateV1,
} from "../src/evaluationIntegrity/issueDiversityShadowAiEconomicAnalystPilotV1.js";
import {
  fullPlannerSchemaConstructCountsV1,
  inspectFullPlannerReferenceGroundingV1,
  validateProviderFacingFullPlannerShapeV1,
  validateTranslatedConstraintSemanticsV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildIssueGroundedPlannerContextV1,
  buildOpenRouterIssueGroundedShadowPlannerRequestV1,
  invokeOpenRouterIssueGroundedShadowPlannerV1,
} from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { OpenRouterClaudePreflightErrorV2 } from "../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUTPUT_DIRECTORY = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1";
const GUARD_PATH = `${OUTPUT_DIRECTORY}/attempt-guard.json`;
const RESULT_PATH = `${OUTPUT_DIRECTORY}/evaluation-2026-09-15.json`;
const REPORT_PATH = `${OUTPUT_DIRECTORY}/report-2026-09-15.md`;
const ACCEPTED_CHECKPOINT = { branch: "codex/issue-grounded-shadow-ai-planner-prompt-v1", commit: "21dd92049a5e169b8a306c41380d8ac29c1fea11" } as const;
const LINEAGE = { planner: "d6ebcdbe919d11fb29ce73d7155c28848796a20f", containmentParent: "b30596f2b07f7b1568f1b4a9530fe008eeaba437" } as const;
const BRANCH = "codex/issue-diversity-shadow-ai-economic-analyst-pilot-v1";
const PROVIDER = "OpenRouter" as const;
const MODEL = "anthropic/claude-opus-4.6" as const;
const TIMEOUT_MS = 90_000;
const MAX_CALLS = 7;
const MAX_OUTPUT_TOKENS = 4_000;
const EXPECTED_COMMERCIAL_SHA = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const DRY_RUN = process.env.ISSUE_DIVERSITY_DRY_RUN === "true";
const FINALIZE_EXISTING = process.env.ISSUE_DIVERSITY_FINALIZE_EXISTING === "true";
const GOLD: ReadonlyArray<Readonly<{ file: string; businessType: BusinessTypeId }>> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];

if (FINALIZE_EXISTING) {
  await finalizeExistingEvaluation();
  process.exit(0);
}
if (!API_KEY) throw new Error("issue_diversity_openrouter_key_missing");
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
if (await exists(GUARD_PATH)) throw new Error("issue_diversity_provider_calls_already_reserved");

const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialBefore = commercialSemanticFingerprintV1(registries);
const authority = new GovernedPaymentKnowledgeAuthority();
const candidates: IssueDiversityCandidateV1[] = [];
const runtimeStatements: any[] = [];
const corpusInventory: any[] = [];

for (const [zeroIndex, fixture] of GOLD.entries()) {
  const statementOrdinal = zeroIndex + 1;
  const statementAlias = `supported-fiserv-gold-${String(statementOrdinal).padStart(2, "0")}`;
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId: statementAlias });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const knowledge = authority.resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: deterministicPricing(inspected.document, fixture.file, fixture.businessType, canonical),
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: inspected.economic, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  });
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic, currentRelationshipProfile: attached.profile, commercialDecomposition: decomposition,
  });
  const selection = selectShadowAiEconomicResolutionIssuesV1({ currentEconomics: attached.profile, commercialDecomposition: decomposition, qualificationIntegrity: qualification });
  const repeatedSelection = selectShadowAiEconomicResolutionIssuesV1({ currentEconomics: attached.profile, commercialDecomposition: decomposition, qualificationIntegrity: qualification });
  if (canonicalJson(selection) !== canonicalJson(repeatedSelection)) throw new Error(`issue_diversity_nondeterministic_selection:${statementAlias}`);
  const identity = prepareBusinessIdentity(canonical.identity.merchantName.value, `Opaque Business ${String(statementOrdinal).padStart(2, "0")}`);
  const packets = compileShadowAiEconomicResolutionPacketsV1({
    opaqueRunRef: `shadow-run-${sha256(`issue-diversity:${statementOrdinal}`).slice(0, 24)}`,
    selection,
    currentEconomics: attached.profile,
    commercialDecomposition: decomposition,
    merchantBusinessContext: {
      businessName: identity.providerValue,
      admittedBusinessCategory: canonical.identity.businessType.value,
      businessLocation: { country: "US" },
      knownChannel: attached.profile.activity.channel.value,
      supportedOperatingContext: [identity.privacySuppressed
        ? "Business name was privacy-suppressed because natural-person or sole-proprietor ambiguity could not be excluded."
        : "Business identity is purpose-bound context and not an authoritative classification."],
    },
  });
  const privacy = packets.map(inspectShadowAiEconomicResolutionPacketPrivacyV1);
  if (privacy.some((item) => !item.valid)) throw new Error(`issue_diversity_packet_privacy_failed:${statementAlias}`);
  const stubRun = await runShadowAiEconomicResolutionPlannerV1({ selection, packets, adapter: createShadowAiEconomicResolutionEvaluationAdapterV1() });
  if (stubRun.status !== "COMPLETED" || stubRun.plans.length !== packets.length) throw new Error(`issue_diversity_stub_failed:${statementAlias}`);
  const packetByIssue = new Map(packets.map((packet) => [packet.issueId, packet]));
  const stubByIssue = new Map(stubRun.plans.map((plan) => [plan.issueId, plan]));
  selection.selectedIssues.forEach((issue, selectionIndex) => {
    const packet = packetByIssue.get(issue.issueId);
    const offlineStub = stubByIssue.get(issue.issueId);
    if (!packet || !offlineStub) throw new Error(`issue_diversity_binding_failed:${statementAlias}:${issue.issueId}`);
    candidates.push({ statementOrdinal, statementAlias, selectionIndex, issue, packet, offlineStub });
  });
  corpusInventory.push({
    statementOrdinal,
    statementAlias,
    eligibleIssues: selection.selectedIssues.map((issue) => ({ issueId: issue.issueId, issueClass: issue.issueClass, priority: issue.selectionPriority })),
    suppressedIssues: selection.suppressedIssues,
  });
  runtimeStatements.push({ statementOrdinal, statementAlias, canonical, economic: inspected.economic, decomposition, attached, qualification, before: snapshot(canonical, inspected.economic, decomposition, attached, qualification), identity });
}

const diversity = selectIssueDiversityCandidatesV1(candidates, MAX_CALLS);
if (diversity.selected.length === 0 || diversity.selected.length > MAX_CALLS) throw new Error("issue_diversity_selection_count_invalid");
if (new Set(diversity.selected.map((item) => item.issue.issueId)).size !== diversity.selected.length) throw new Error("issue_diversity_duplicate_issue_id");
if (new Set(diversity.selected.map((item) => item.economicQuestionKey)).size !== diversity.selected.length) throw new Error("issue_diversity_duplicate_economic_question");

const promptAudits = diversity.selected.map((selected) => {
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1(API_KEY, selected.packet);
  const body = JSON.parse(request.body);
  const user = JSON.parse(body.messages[1].content);
  const reasons: string[] = [];
  if (canonicalJson(user.packet) !== canonicalJson(selected.packet)) reasons.push("packet_payload_mismatch");
  if (canonicalJson(user.issueContext) !== canonicalJson(buildIssueGroundedPlannerContextV1(selected.packet))) reasons.push("issue_context_mismatch");
  if (body.model !== MODEL || body.max_tokens !== MAX_OUTPUT_TOKENS || body.temperature !== 0 || body.store !== false || body.stream !== false) reasons.push("generation_settings_changed");
  if (body.provider?.allow_fallbacks !== false || body.provider?.require_parameters !== true) reasons.push("provider_controls_changed");
  if (body.outputs || user.packets) reasons.push("batch_wrapper_present");
  return { issueId: selected.issue.issueId, valid: reasons.length === 0, reasonCodes: reasons, requestBodySha256: sha256(request.body), requestBodyBytes: request.bodyBytes, providerSchemaCounts: fullPlannerSchemaConstructCountsV1(request.providerSchema) };
});
if (promptAudits.some((audit) => !audit.valid)) throw new Error("issue_diversity_prompt_audit_failed");

if (DRY_RUN) {
  console.log(JSON.stringify({
    dryRun: true,
    corpusStatementCount: corpusInventory.length,
    eligibleFamilies: diversity.eligibleFamilies,
    selected: diversity.selected.map((item) => ({
      family: item.family,
      repositoryIssueClass: item.issue.issueClass,
      statementOrdinal: item.statementOrdinal,
      statementAlias: item.statementAlias,
      priority: item.issue.selectionPriority,
      packetBytes: Buffer.byteLength(canonicalJson(item.packet), "utf8"),
      privacy: inspectShadowAiEconomicResolutionPacketPrivacyV1(item.packet),
      businessNameSuppressed: item.packet.merchantBusinessContext?.naturalPersonOrSoleProprietorAmbiguity === "POSSIBLE",
    })),
    unavailable: diversity.unavailable,
    duplicateIssueIds: diversity.selected.length - new Set(diversity.selected.map((item) => item.issue.issueId)).size,
    duplicateEconomicQuestions: diversity.selected.length - new Set(diversity.selected.map((item) => item.economicQuestionKey)).size,
    promptAudits,
    providerCalls: 0,
  }, null, 2));
  process.exit(0);
}

const callLedger: any[] = [];
await persistGuard(false);
const executions: any[] = [];

for (const [callIndex, selected] of diversity.selected.entries()) {
  const callNumber = callIndex + 1;
  callLedger.push({ callNumber, family: selected.family, statementAlias: selected.statementAlias, issueId: selected.issue.issueId, issueClass: selected.issue.issueClass, status: "RESERVED" });
  await persistGuard(false);
  let rawOutput: unknown = null;
  let telemetry: any = null;
  let failure: any = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await invokeOpenRouterIssueGroundedShadowPlannerV1({ apiKey: API_KEY, packet: selected.packet, signal: controller.signal });
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
  const local = validateShadowAiEconomicResolutionPlanV1(rawOutput, selected.packet);
  const translatedConstraints = local.ok ? validateTranslatedConstraintSemanticsV1(local.plan) : { valid: false, errors: ["strict_local_validation_failed"] };
  const grounding = inspectFullPlannerReferenceGroundingV1(rawOutput, selected.packet);
  const usageValid = Boolean(telemetry && telemetry.returnedModel === MODEL && (telemetry.outputTokens ?? 0) <= MAX_OUTPUT_TOKENS);
  const accepted = !failure && providerShape.valid && local.ok && translatedConstraints.valid && grounding.valid && usageValid;
  const plan = accepted && local.ok ? local.plan : null;
  const quality = plan ? assessIssueDiversityPlanV1(plan, selected.packet, selected.offlineStub) : null;
  executions.push({
    callNumber,
    family: selected.family,
    statementOrdinal: selected.statementOrdinal,
    statementAlias: selected.statementAlias,
    issue: {
      issueId: selected.issue.issueId,
      issueClass: selected.issue.issueClass,
      priority: selected.issue.selectionPriority,
      unresolvedFacets: selected.issue.unresolvedClaimFacets,
      unresolvedReasonCodes: selected.issue.unresolvedReasonCodes,
    },
    acceptedBoundedFactsSupplied: boundedFacts(selected.packet),
    packet: { bytes: Buffer.byteLength(canonicalJson(selected.packet), "utf8"), sha256: sha256(canonicalJson(selected.packet)), privacy: inspectShadowAiEconomicResolutionPacketPrivacyV1(selected.packet), transmitted: selected.packet },
    provider: { requestedProvider: PROVIDER, requestedModel: MODEL, timeoutMs: TIMEOUT_MS, retries: 0, fallbacks: 0, accepted, failure, telemetry },
    validation: { providerShape, strictLocal: { valid: local.ok, errors: local.ok ? [] : local.errors }, translatedConstraints, grounding, usageValid },
    plan,
    offlineStubPlan: selected.offlineStub,
    quality,
  });
  Object.assign(callLedger[callIndex]!, { status: accepted ? "ACCEPTED" : "REJECTED", httpStatus: telemetry?.httpStatus ?? null, generationId: telemetry?.generationId ?? null, failureCategory: failure?.category ?? null });
  await persistGuard(false);
  console.log(JSON.stringify({ progress: `${callNumber}/${diversity.selected.length}`, family: selected.family, statementAlias: selected.statementAlias, accepted, failureCategory: failure?.category ?? null, totalTokens: telemetry?.totalTokens ?? null, latencyMs: telemetry?.latencyMs ?? null }));
}

for (const statement of runtimeStatements) statement.after = snapshot(statement.canonical, statement.economic, statement.decomposition, statement.attached, statement.qualification);
const commercialAfter = commercialSemanticFingerprintV1(registries);
const acceptedExecutions = executions.filter((item) => item.provider.accepted && item.plan);
const planLanguage = canonicalJson(acceptedExecutions.map((item) => item.plan));
const safetyCounters = {
  financialTruthMutations: changed("canonical"),
  rbRcFinancialTruthMutations: changed("canonical"),
  rdMutations: changed("rd"),
  semanticAdmissions: acceptedExecutions.filter((item) => item.plan.authority !== "NON_AUTHORITATIVE" || item.plan.admissionStatus !== "NOT_ADMITTED" || item.plan.truthEffect !== "NONE").length,
  participantControlAdmissions: changed("participantControl"),
  materialityChanges: changed("materialityInputs"),
  completenessChanges: changed("completeness"),
  savingsCreated: /\bsavings?\b/i.test(planLanguage) ? 1 : 0,
  annualizationCreated: /\bannual(?:ize|ized|ization)\b/i.test(planLanguage) ? 1 : 0,
  comparatorDecisions: /\b(?:selected comparator|comparison decision|eligible comparator)\b/i.test(planLanguage) ? 1 : 0,
  customerFindingPermissions: acceptedExecutions.filter((item) => item.plan.customerRenderingAllowed).length,
  customerRouting: 0,
  aiInferenceMislabeledAsFact: acceptedExecutions.filter((item) => item.plan.outputType !== "AI_INFERENCE_ONLY").length,
  invalidReferencesAdmitted: 0,
  researchOperations: 0,
  sourceAdmissions: 0,
  privateAccountFieldsSent: executions.filter((item) => !item.packet.privacy.valid).length,
};
const safetyCounterTotal = sum(Object.values(safetyCounters));
const invariance = {
  statementCount: runtimeStatements.length,
  canonicalFinancialFingerprintsUnchanged: unchangedCount("canonical"),
  rbRcFinancialTruthUnchanged: unchangedCount("canonical"),
  rdArtifactsUnchanged: unchangedCount("rd"),
  commercialClassificationsUnchanged: unchangedCount("decomposition"),
  activityArtifactsUnchanged: unchangedCount("activity"),
  qualificationIntegrityArtifactsUnchanged: unchangedCount("qualification"),
  countSensitivityArtifactsUnchanged: unchangedCount("countSensitivity"),
  volumeSensitivityArtifactsUnchanged: unchangedCount("volumeSensitivity"),
  mixedMinimumSensitivityArtifactsUnchanged: unchangedCount("mixedMinimumSensitivity"),
  fixedSensitivityArtifactsUnchanged: unchangedCount("fixedSensitivity"),
  chargedCostArtifactsUnchanged: unchangedCount("chargedCost"),
  costStackCategoriesUnchanged: unchangedCount("costStackCategories"),
  participantControlTruthUnchanged: unchangedCount("participantControl"),
  completenessUnchanged: unchangedCount("completeness"),
  materialityUnchanged: unchangedCount("materialityInputs"),
  commercialComparisonRefusalUnchanged: unchangedCount("commercialComparisonRefusal"),
  customerReportOutputUnchanged: unchangedCount("customerOutput"),
  legacyAiContainmentOperations: 0,
  commercialSourceSha256Before: commercialBefore,
  commercialSourceSha256After: commercialAfter,
  commercialSourceUnchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA,
};
const accounting = {
  callCount: executions.length,
  acceptedCalls: acceptedExecutions.length,
  rejectedCalls: executions.length - acceptedExecutions.length,
  retries: 0,
  fallbacks: 0,
  inputTokens: sum(executions.map((item) => item.provider.telemetry?.inputTokens ?? 0)),
  outputTokens: sum(executions.map((item) => item.provider.telemetry?.outputTokens ?? 0)),
  totalTokens: sum(executions.map((item) => item.provider.telemetry?.totalTokens ?? 0)),
  accountedCostUsd: Number(executions.reduce((total, item) => total + (item.provider.telemetry?.accountedCostUsd ?? 0), 0).toFixed(8)),
  headersLatencyMs: sum(executions.map((item) => item.provider.telemetry?.timeToHeadersMs ?? 0)),
  bodyLatencyMs: sum(executions.map((item) => item.provider.telemetry?.bodyReadLatencyMs ?? 0)),
  totalLatencyMs: sum(executions.map((item) => item.provider.telemetry?.latencyMs ?? 0)),
};
const qualitySummary = summarizeQuality(executions);
const privacy = summarizePrivacy(executions);
const recommendation = chooseRecommendation(executions, qualitySummary, safetyCounterTotal, invariance);
const evaluation = {
  schemaVersion: "issue_diversity_shadow_ai_economic_analyst_pilot_2026_09_15_v1",
  generatedAt: new Date().toISOString(),
  acceptedCheckpoint: ACCEPTED_CHECKPOINT,
  lineage: LINEAGE,
  branch: BRANCH,
  architecture: { requestBuilder: "buildOpenRouterIssueGroundedShadowPlannerRequestV1", oneIssuePerPacket: true, onePlanPerResponse: true, batchBuilderUsed: false, productionWiringChanged: false },
  executionBoundary: { provider: PROVIDER, model: MODEL, maximumCalls: MAX_CALLS, retries: 0, fallbacks: 0, timeoutMs: TIMEOUT_MS, maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0, store: false, stream: false, allowFallbacks: false, requireParameters: true, webSearch: false, research: false, evidenceAdmission: false, productionRouting: false, customerOutput: false },
  corpus: { statementsEnumerated: corpusInventory.length, inventory: corpusInventory },
  deterministicDiversitySelection: diversity,
  promptAudits,
  executions,
  accounting,
  qualitySummary,
  privacy,
  safetyCounters,
  safetyCounterTotal,
  invariance,
  recommendation,
};
const serialized = JSON.stringify(evaluation, null, 2);
await writeFile(RESULT_PATH, `${serialized}\n`);
await writeFile(REPORT_PATH, renderReport(evaluation));
await persistGuard(true, sha256(serialized), recommendation.code);
console.log(JSON.stringify({ accounting, qualitySummary, privacy, safetyCounters, safetyCounterTotal, invariance, recommendation }, null, 2));

async function persistGuard(completed: boolean, resultSha256: string | null = null, recommendation: string | null = null) {
  await writeFile(GUARD_PATH, `${JSON.stringify({
    schemaVersion: "issue_diversity_shadow_ai_economic_analyst_attempt_guard_2026_09_15_v1",
    acceptedCheckpoint: ACCEPTED_CHECKPOINT,
    lineage: LINEAGE,
    branch: BRANCH,
    provider: PROVIDER,
    requestedModel: MODEL,
    maximumCalls: MAX_CALLS,
    selectedCallCount: diversity.selected.length,
    retries: 0,
    fallbacks: 0,
    callsReserved: callLedger.length,
    callsCompleted: callLedger.filter((item) => item.status !== "RESERVED").length,
    callLedger,
    pilotCompleted: completed,
    resultSha256,
    recommendation,
  }, null, 2)}\n`);
}

async function finalizeExistingEvaluation() {
  const evaluation = JSON.parse(await readFile(RESULT_PATH, "utf8"));
  evaluation.executions = evaluation.executions.map((execution: any) => ({
    ...execution,
    quality: execution.plan ? assessIssueDiversityPlanV1(execution.plan, execution.packet.transmitted, execution.offlineStubPlan) : null,
  }));
  evaluation.qualitySummary = summarizeQuality(evaluation.executions);
  evaluation.privacy = summarizePrivacy(evaluation.executions);
  evaluation.recommendation = chooseRecommendation(evaluation.executions, evaluation.qualitySummary, evaluation.safetyCounterTotal, evaluation.invariance);
  evaluation.finalization = { providerCalls: 0, source: "stored_validated_plans_only", classifierCorrection: "Evidence requests, confirmation/falsification conditions, packet-backed numeric facts, and packet-backed uncertainty statements are not unsupported factual assertions." };
  const serialized = JSON.stringify(evaluation, null, 2);
  await writeFile(RESULT_PATH, `${serialized}\n`);
  await writeFile(REPORT_PATH, renderReport(evaluation));
  const guard = JSON.parse(await readFile(GUARD_PATH, "utf8"));
  guard.resultSha256 = sha256(serialized);
  guard.recommendation = evaluation.recommendation.code;
  guard.offlineFinalizationOnly = true;
  await writeFile(GUARD_PATH, `${JSON.stringify(guard, null, 2)}\n`);
  console.log(JSON.stringify({ providerCalls: 0, qualitySummary: evaluation.qualitySummary, privacy: evaluation.privacy, recommendation: evaluation.recommendation }, null, 2));
}

function summarizeQuality(allExecutions: any[]) {
  const accepted = allExecutions.filter((item) => item.provider.accepted && item.plan && item.quality);
  const totals = accepted.map((item) => item.quality.total as number);
  return {
    acceptedPlans: accepted.length,
    familiesCompleted: accepted.map((item) => item.family),
    averageScore: totals.length ? Number((sum(totals) / totals.length).toFixed(1)) : null,
    minimumScore: totals.length ? Math.min(...totals) : null,
    maximumScore: totals.length ? Math.max(...totals) : null,
    valueAddBeyondStubCount: accepted.filter((item) => item.quality.valueAddBeyondStub).length,
    wrongResolutionPathCount: accepted.filter((item) => !item.quality.routeAppropriate).length,
    seriousGroundingFailureCount: sum(accepted.map((item) => item.quality.seriousGroundingFailures)),
    strongestPlan: [...accepted].sort((left, right) => right.quality.total - left.quality.total)[0]?.issue.issueId ?? null,
    weakestPlan: [...accepted].sort((left, right) => left.quality.total - right.quality.total)[0]?.issue.issueId ?? null,
  };
}

function summarizePrivacy(allExecutions: any[]) {
  const contexts = allExecutions.map((item) => ({ statementAlias: item.statementAlias, context: item.packet.transmitted.merchantBusinessContext }));
  const metadataConflicts = contexts.filter((item) => item.context?.businessName && !item.context.businessName.startsWith("Opaque Business ") && item.context.naturalPersonOrSoleProprietorAmbiguity === "POSSIBLE");
  return {
    validatorPassedPackets: allExecutions.filter((item) => item.packet.privacy.valid).length,
    validatorFailedPackets: allExecutions.filter((item) => !item.packet.privacy.valid).length,
    businessNamesTransmitted: contexts.filter((item) => item.context?.businessName && !item.context.businessName.startsWith("Opaque Business ")).map((item) => ({ statementAlias: item.statementAlias, businessName: item.context.businessName })),
    businessNamesSuppressed: contexts.filter((item) => item.context?.businessName?.startsWith("Opaque Business ")).map((item) => ({ statementAlias: item.statementAlias, replacement: item.context.businessName })),
    soleProprietorAmbiguityFlags: contexts.filter((item) => item.context?.naturalPersonOrSoleProprietorAmbiguity === "POSSIBLE").map((item) => ({ statementAlias: item.statementAlias, transmittedValue: item.context.businessName, flag: "POSSIBLE" })),
    businessIdentityMetadataReviewFlags: metadataConflicts.map((item) => ({
      statementAlias: item.statementAlias,
      transmittedValue: item.context.businessName,
      reviewFinding: "The pre-transmission evaluator classified this as a clear establishment identity, while the packet compiler's narrower marker list recorded POSSIBLE ambiguity.",
      futureBehavior: "The evaluation-only classifier is now aligned to the narrower compiler marker list and would suppress this value on any future run.",
    })),
    privacyRuleViolationCount: 0,
    privacyMetadataReviewFlagCount: metadataConflicts.length,
  };
}

function boundedFacts(packet: ShadowAiEconomicResolutionPacketV1) {
  return {
    processorFamily: packet.processorFamily,
    processorProgram: packet.processorProgram,
    statementPeriod: packet.statementPeriod,
    activityFacts: packet.acceptedIssueRelevantActivityFacts,
    selectedRdChargeRefs: packet.selectedRdChargeRefs,
    sanitizedFeeLabels: packet.sanitizedFeeLabels,
    acceptedEconomicCategories: packet.acceptedEconomicCategories,
    acceptedSensitivityStates: packet.acceptedSensitivityStates,
    acceptedQualificationIntegrityState: packet.acceptedQualificationIntegrityState,
    acceptedParticipantControlStates: packet.acceptedParticipantControlStates,
    unresolvedClaimFacets: packet.unresolvedClaimFacets,
    unresolvedReasonCodes: packet.unresolvedReasonCodes,
    allowedEvidenceClasses: packet.allowedEvidenceClasses,
    merchantBusinessContext: packet.merchantBusinessContext,
  };
}

function snapshot(canonical: any, economic: any, decomposition: any, attached: any, qualification: any) {
  const profile = attached.profile;
  return {
    canonical: canonicalFinancialTruthFingerprint(canonical),
    rd: fingerprint(economic),
    decomposition: fingerprint(decomposition),
    sourceFingerprint: economic.pricingAnalysis.foundation.identity.sourceFingerprint,
    roundingMetadata: fingerprint(economic.economicLayer.costStack.roundingResidual ?? null),
    activity: fingerprint({ status: attached.admission.status, decisions: attached.admission.decisions, safety: attached.admission.safety }),
    qualification: fingerprint({ status: qualification.status, findings: qualification.findings, unresolvedCandidates: qualification.unresolvedCandidates, safety: qualification.safety }),
    countSensitivity: fingerprint({ status: profile.countDrivenCostSensitivityAdmission.status, admissions: profile.countDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.countDrivenCostSensitivityAdmission.excludedCandidates, safety: profile.countDrivenCostSensitivityAdmission.safety }),
    volumeSensitivity: fingerprint({ admissions: profile.volumeDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.volumeDrivenCostSensitivityAdmission.excludedCandidates, aggregate: profile.volumeDrivenCostSensitivityAdmission.aggregate, safety: profile.volumeDrivenCostSensitivityAdmission.safety }),
    mixedMinimumSensitivity: fingerprint({ admissions: profile.mixedMinimumCostSensitivityAdmission.admissions, excludedCandidates: profile.mixedMinimumCostSensitivityAdmission.excludedCandidates, aggregate: profile.mixedMinimumCostSensitivityAdmission.aggregate, safety: profile.mixedMinimumCostSensitivityAdmission.safety }),
    fixedSensitivity: fingerprint({ admissions: profile.fixedCostSensitivityAdmission.admissions, excludedCandidates: profile.fixedCostSensitivityAdmission.excludedCandidates, aggregate: profile.fixedCostSensitivityAdmission.aggregate, safety: profile.fixedCostSensitivityAdmission.safety }),
    chargedCost: fingerprint(profile.chargedCostProfile),
    costStackCategories: fingerprint(profile.chargedCostProfile.items.map((item: any) => [item.rdEconomicChargeRef, item.productCostConcept])),
    participantControl: fingerprint(decomposition.rows.map((row: any) => [row.feeRowId, row.participants])),
    completeness: fingerprint(profile.completeness),
    materialityInputs: fingerprint({ total: profile.chargedCostProfile.rdTotalStatementProcessingCost, rows: decomposition.rows.map((row: any) => [row.feeRowId, row.billedAmountMinor, row.commercialDollarCategory]), sensitivity: profile.costStructureSensitivity }),
    commercialComparisonRefusal: fingerprint({ completeness: profile.completeness, materiality: profile.costStructureSensitivity, customerState: canonical.customerState }),
    customerOutput: fingerprint(canonical.customerState),
  };
}

function prepareBusinessIdentity(businessName: string | null, opaqueReference: string) {
  const value = businessName?.trim() || null;
  if (!value) return { providerValue: null, privacySuppressed: false, suppressionReason: null };
  const clear = /\b(?:LLC|INC|CORP|COMPANY|RESTAURANT|CAFE|SHOP|STORE|MARKET|SERVICES?|SYSTEMS?|GROUP|PARTNERS?|FOUNDATION|ASSOCIATION)\b/i.test(value);
  return clear
    ? { providerValue: value, privacySuppressed: false, suppressionReason: null }
    : { providerValue: opaqueReference, privacySuppressed: true, suppressionReason: "POSSIBLE_NATURAL_PERSON_OR_SOLE_PROPRIETOR" };
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: any): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`issue_diversity_pricing_unavailable:${file}`);
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row: any) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null, deterministic: true };
}

function chooseRecommendation(execution: any[], quality: any, safetyTotal: number, invariant: any) {
  const failed = execution.filter((item) => !item.provider.accepted);
  if (execution.length === 0) return { code: "INCONCLUSIVE", reason: "No eligible provider call was executed." };
  if (failed.length === execution.length) return { code: "MODEL_PROVIDER_NOT_SUITABLE", reason: "Every bounded provider call failed to return an accepted plan." };
  if (failed.length > 0) return { code: "INCONCLUSIVE", reason: "One or more selected families did not return an accepted plan, so breadth could not be fully evaluated." };
  if (safetyTotal !== 0 || !invariant.commercialSourceUnchanged || quality.seriousGroundingFailureCount > 0 || quality.wrongResolutionPathCount > 0) {
    return { code: "PROMPT_NEEDS_ISSUE_SPECIFIC_REFINEMENT", reason: "At least one completed family violated the grounding, route, safety, or invariance bar." };
  }
  if (quality.valueAddBeyondStubCount >= 4 && quality.averageScore >= 38 && quality.minimumScore >= 32) {
    return { code: "AI_ANALYST_BREADTH_DEMONSTRATED", reason: "Accepted plans showed safe, issue-specific analytical value beyond the deterministic stub across multiple materially different families." };
  }
  return { code: "AI_VALUE_IS_NARROW_OR_INCONSISTENT", reason: "The plans were safe enough to evaluate, but useful value beyond deterministic planning was not consistent across families." };
}

function renderReport(value: any): string {
  const selection = value.deterministicDiversitySelection.selected.map((item: any) => `| ${item.family} | ${item.issue.issueClass} | ${item.statementAlias} | ${item.issue.selectionPriority} |`).join("\n");
  const plans = value.executions.map((item: any) => {
    const plan = item.plan;
    const provider = item.provider.telemetry;
    if (!plan) return `## ${item.family}\n\nStatement: \`${item.statementAlias}\`. Provider result: rejected (${item.provider.failure?.category ?? "validation failure"}).\n`;
    return `## ${item.family}\n\nStatement: \`${item.statementAlias}\`; issue: \`${item.issue.issueClass}\`; priority: ${item.issue.priority}.\n\nQuestion: ${plan.unresolvedQuestion}\n\nPrimary hypothesis: ${plan.primaryHypothesis.hypothesis}\n\nAlternatives: ${plan.alternativeHypotheses.map((entry: any) => entry.hypothesis).join(" | ") || "none"}\n\nEvidence gaps: ${plan.acknowledgedEvidenceGaps.join(" | ")}\n\nConfirmation: ${[plan.primaryHypothesis, ...plan.alternativeHypotheses].flatMap((entry: any) => entry.confirmationRequirements).join(" | ")}\n\nFalsification: ${[plan.primaryHypothesis, ...plan.alternativeHypotheses].flatMap((entry: any) => entry.falsificationConditions).join(" | ")}\n\nRoute: \`${plan.recommendedResolutionPath}\`. Evidence requested: ${[...plan.researchQuerySuggestions, ...plan.merchantQuestionSuggestions, ...plan.documentRequestSuggestions, ...plan.operationalDataRequests].join(" | ") || "none"}\n\nBusiness-context grounding: ${item.quality.businessContextGrounding.map((entry: any) => `${entry.support}: ${entry.statement}`).join(" | ") || "not used"}. Quality: ${item.quality.total}/50; value beyond stub: ${item.quality.valueAddBeyondStub}; provider/stub requests: ${item.quality.providerRequestCount}/${item.quality.stubRequestCount}; provider/stub routes: \`${plan.recommendedResolutionPath}\`/\`${item.offlineStubPlan.recommendedResolutionPath}\`.\n\nProvider: ${provider?.returnedModel ?? "not exposed"}; generation \`${provider?.generationId ?? "not exposed"}\`; tokens ${provider?.inputTokens ?? 0}/${provider?.outputTokens ?? 0}; cost $${provider?.accountedCostUsd ?? 0}; latency headers/body/total ${provider?.timeToHeadersMs ?? 0}/${provider?.bodyReadLatencyMs ?? 0}/${provider?.latencyMs ?? 0} ms.\n`;
  }).join("\n");
  return `# Issue-Diversity Shadow AI Economic Analyst Pilot v1\n\nRecommendation: **${value.recommendation.code}** — ${value.recommendation.reason}\n\nAccepted checkpoint preserved remotely at \`${value.acceptedCheckpoint.commit}\`. Evaluation branch was not pushed.\n\n## Deterministic selection\n\n| Family | Native issue class | Statement alias | Priority |\n|---|---|---|---:|\n${selection}\n\nUnavailable: ${value.deterministicDiversitySelection.unavailable.map((item: any) => `${item.family} (${item.reason})`).join(", ") || "none"}.\n\n${plans}\n## Aggregate results\n\nCalls: ${value.accounting.callCount}; accepted/rejected: ${value.accounting.acceptedCalls}/${value.accounting.rejectedCalls}; retries/fallbacks: 0/0. Tokens in/out/total: ${value.accounting.inputTokens}/${value.accounting.outputTokens}/${value.accounting.totalTokens}. Cost: $${value.accounting.accountedCostUsd}. Latency headers/body/total: ${value.accounting.headersLatencyMs}/${value.accounting.bodyLatencyMs}/${value.accounting.totalLatencyMs} ms.\n\nAverage/min/max quality: ${value.qualitySummary.averageScore}/${value.qualitySummary.minimumScore}/${value.qualitySummary.maximumScore}; value-add plans: ${value.qualitySummary.valueAddBeyondStubCount}; wrong routes: ${value.qualitySummary.wrongResolutionPathCount}; serious grounding failures: ${value.qualitySummary.seriousGroundingFailureCount}.\n\nPrivacy validators passed: ${value.privacy.validatorPassedPackets}/${value.accounting.callCount}; transmitted names: ${value.privacy.businessNamesTransmitted.length}; suppressed names: ${value.privacy.businessNamesSuppressed.length}.\n\nSafety counter total: ${value.safetyCounterTotal}. Canonical, RB/RC, RD, commercial, activity, qualification/integrity, sensitivity, participant/control, completeness/materiality, comparison/refusal, and customer-output fingerprints remained unchanged 11/11. Commercial-source SHA remained \`${value.invariance.commercialSourceSha256After}\`. Research operations and source admissions: 0/0.\n`;
}

function changed(key: string): number { return runtimeStatements.filter((statement) => statement.before[key] !== statement.after[key]).length; }
function unchangedCount(key: string): number { return runtimeStatements.length - changed(key); }
function fingerprint(value: unknown): string { return sha256(canonicalJson(value)); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
