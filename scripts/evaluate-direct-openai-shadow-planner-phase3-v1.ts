import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import { config as loadEnvironment } from "dotenv";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  canonicalFinancialTruthFingerprint,
  type InternalAnalystPricingModelInput,
} from "../src/canonical/internalAnalystFindingV1.js";
import {
  compileShadowAiEconomicResolutionPacketsV1,
  inspectShadowAiEconomicResolutionPacketPrivacyV1,
  selectShadowAiEconomicResolutionIssuesV1,
} from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { createShadowAiEconomicResolutionEvaluationAdapterV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerEvaluationAdapterV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  SHADOW_AI_ISSUE_CLASSES,
  type ShadowAiEconomicIssueClassV1,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionPlanV1,
} from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
} from "../src/canonical/shadowAiPlannerProviderAdaptersV1.js";
import { compileShadowAiPlannerProviderRequestV1 } from "../src/canonical/shadowAiPlannerProviderNeutralV1.js";
import {
  evaluateShadowAiPhase3IssueFamilyV1,
  SHADOW_AI_PHASE_3_REPETITIONS_V1,
  SHADOW_AI_PHASE_3_TIMEOUT_MS_V1,
} from "../src/canonical/shadowAiPlannerPhase3EvaluationV1.js";
import { createOpenAiDirectPlannerAdapterV1 } from "../src/canonical/shadowAiPlannerProviderTransportsV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import type { ParsedDocument } from "../src/parser.js";

const OUT = "evaluations/provider-neutral-shadow-planner-phase3-v1";
const RESULT_PATH = `${OUT}/evaluation-2026-09-16.json`;
const REPORT_PATH = `${OUT}/report-2026-09-16.md`;
const ATTEMPT_GUARD_PATH = `${OUT}/attempt-guard-2026-09-16.json`;
const GENERATED_AT = new Date().toISOString();
const MODEL = OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1;
const GENERATION = Object.freeze({
  maximumOutputTokens: 4_000,
  reasoningEffort: "none" as const,
  verbosity: "low" as const,
});
const PRICE = Object.freeze({
  inputUsdMicrosPerMillionTokens: 1_750_000,
  outputUsdMicrosPerMillionTokens: 14_000_000,
});
const GOLD_FILE = "Nov_2024_Statement.pdf";
const GOLD_BUSINESS_TYPE = "restaurant_food_beverage" as const;
const GOLD_CORPUS_KIND = "DETERMINISTIC_GOLD_SELECTION" as const;
const SYNTHETIC_CORPUS_KIND = "SYNTHETIC_NON_CUSTOMER_CONTRACT_CONTROL" as const;
const EXPECTED_GOLD_CLASSES = SHADOW_AI_ISSUE_CLASSES.filter((value) => value !== "GATEWAY_PROCESSOR_TERMINOLOGY");

loadEnvironment({ path: process.env.RATEREVEAL_ENV_PATH ?? ".env", quiet: true });
const apiKey = requiredEnvironment("OPENAI_API_KEY");

await mkdir(OUT, { recursive: true });
await acquireAttemptGuard();

const corpus = await buildPhase3Corpus();
const adapter = createOpenAiDirectPlannerAdapterV1({
  apiKey,
  model: MODEL,
  generation: GENERATION,
  pricing: PRICE,
});
const familyResults = [];

for (const issueClass of SHADOW_AI_ISSUE_CLASSES) {
  const item = corpus.byIssueClass.get(issueClass);
  if (!item) throw new Error(`shadow_planner_phase3_corpus_missing:${issueClass}`);
  familyResults.push(await evaluateShadowAiPhase3IssueFamilyV1({
    issueClass,
    corpusKind: item.corpusKind,
    packet: item.packet,
    offlineBaselinePlan: item.offlineBaselinePlan,
    adapter,
    captureDeterministicState: corpus.captureDeterministicState,
  }));
}

const totalProviderCalls = sum(familyResults.map((item) => item.providerCalls));
const completedTrials = familyResults.flatMap((item) => item.trials)
  .filter((trial) => trial.accounting !== null);
const summary = {
  status: familyResults.every((item) => item.status === "PASSED") ? "PASSED" as const : "FAILED" as const,
  passedIssueFamilies: familyResults.filter((item) => item.status === "PASSED").map((item) => item.issueClass),
  failedIssueFamilies: familyResults.filter((item) => item.status === "FAILED").map((item) => item.issueClass),
  issueFamilyCoverage: `${familyResults.length}/${SHADOW_AI_ISSUE_CLASSES.length}`,
  totalProviderCalls,
  maximumProviderCalls: SHADOW_AI_ISSUE_CLASSES.length * SHADOW_AI_PHASE_3_REPETITIONS_V1,
  totalInputTokens: sum(completedTrials.map((trial) => trial.accounting?.inputTokens ?? 0)),
  totalOutputTokens: sum(completedTrials.map((trial) => trial.accounting?.outputTokens ?? 0)),
  totalEstimatedCostUsdMicros: sum(completedTrials.map((trial) => trial.accounting?.estimatedCostUsdMicros ?? 0)),
  totalProviderLatencyMs: sum(completedTrials.map((trial) => trial.accounting?.latencyMs ?? 0)),
  allSemanticSignaturesRepeatable: familyResults.every((item) => item.repeatableSemanticSignature),
  allOfflineBaselineQualityMatched: familyResults.every((item) => item.baselineQualityMatched),
  allProtectedStatePreserved: familyResults.every((item) => item.deterministicStatePreserved),
  retries: 0,
  fallbackAttempts: 0,
  customerOutputsCreated: 0,
  truthMutations: 0,
  sourceAdmissions: 0,
  researchOperations: 0,
};
const result = {
  schemaVersion: "provider_neutral_shadow_planner_phase3_evaluation_2026_09_16_v1",
  generatedAt: GENERATED_AT,
  mode: "DIRECT_OPENAI_NON_CUSTOMER_SHADOW_EVALUATION",
  baseline: {
    branch: "codex/planner-provider-neutral-consolidation-v1",
    qualificationCommit: "f8d1883",
  },
  executionBoundary: {
    adapter: adapter.adapterId,
    providerKind: adapter.providerKind,
    model: MODEL,
    openRouterEnabled: false,
    productionWiring: false,
    customerOutput: false,
    evidenceAdmission: false,
    truthMutation: false,
  },
  controls: {
    issueFamilies: [...SHADOW_AI_ISSUE_CLASSES],
    deterministicGoldFamilies: [...EXPECTED_GOLD_CLASSES],
    syntheticContractControlFamilies: ["GATEWAY_PROCESSOR_TERMINOLOGY"],
    repetitionsPerFamily: SHADOW_AI_PHASE_3_REPETITIONS_V1,
    stopFamilyAfterFirstExecutionFailure: true,
    maximumProviderCalls: SHADOW_AI_ISSUE_CLASSES.length * SHADOW_AI_PHASE_3_REPETITIONS_V1,
    maximumEstimatedCostUsdMicrosPerCall: SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros,
    maximumEstimatedCostUsdMicrosTotal:
      SHADOW_AI_ISSUE_CLASSES.length * SHADOW_AI_PHASE_3_REPETITIONS_V1
      * SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros,
    timeoutMsPerCall: SHADOW_AI_PHASE_3_TIMEOUT_MS_V1,
    maximumOutputTokensPerCall: GENERATION.maximumOutputTokens,
    reasoningEffort: GENERATION.reasoningEffort,
    verbosity: GENERATION.verbosity,
    retries: 0,
    automaticProviderFallback: false,
    rawPromptsPersisted: false,
    rawProviderResponsesPersisted: false,
    providerDraftsPersisted: false,
    safeSemanticSignaturesAndTelemetryOnly: true,
  },
  corpus: {
    deterministicGoldStatementCount: 1,
    deterministicSelectedPacketCount: EXPECTED_GOLD_CLASSES.length,
    syntheticNonCustomerPacketCount: 1,
    privacyInspectionsPassed: corpus.privacyInspectionsPassed,
    providerPayloadInspectionsPassed: corpus.providerPayloadInspectionsPassed,
    fileNamesSent: 0,
    privateAccountIdentifiersSent: 0,
    businessNamesSent: 0,
    credentialsPersisted: 0,
  },
  familyResults,
  summary,
};

await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
await writeFile(REPORT_PATH, report(result), { flag: "wx" });
await writeFile(ATTEMPT_GUARD_PATH, `${JSON.stringify({
  schemaVersion: "provider_neutral_shadow_planner_phase3_attempt_guard_2026_09_16_v1",
  state: "COMPLETED",
  startedAt: GENERATED_AT,
  completedAt: new Date().toISOString(),
  maximumProviderCalls: result.controls.maximumProviderCalls,
  actualProviderCalls: totalProviderCalls,
  callsByIssueFamily: Object.fromEntries(familyResults.map((item) => [item.issueClass, item.providerCalls])),
  resultSha256: fingerprint(result),
}, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== "PASSED") process.exitCode = 1;

async function buildPhase3Corpus() {
  const inspected = await inspectFiservOneStatementEvaluation({
    statementPaths: [`test/fixtures/pdfs/${GOLD_FILE}`],
    safeStatementId: "phase3-gold-control-01",
  });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
    sourceFileName: GOLD_FILE,
    businessType: GOLD_BUSINESS_TYPE,
  });
  const knowledge = new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis: canonical,
    context: {
      geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] },
    },
    suppliedPricingObservation: deterministicPricing(inspected.document, GOLD_FILE, canonical),
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: canonical,
    commercialDecomposition: decomposition,
  });
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic,
    currentRelationshipProfile: attached.profile,
    commercialDecomposition: decomposition,
  });
  const selection = selectShadowAiEconomicResolutionIssuesV1({
    currentEconomics: attached.profile,
    commercialDecomposition: decomposition,
    qualificationIntegrity: qualification,
  });
  const packets = compileShadowAiEconomicResolutionPacketsV1({
    opaqueRunRef: `shadow-run-${createHash("sha256").update("phase3-gold-control-01").digest("hex").slice(0, 24)}`,
    selection,
    currentEconomics: attached.profile,
    commercialDecomposition: decomposition,
    merchantBusinessContext: {
      admittedBusinessCategory: GOLD_BUSINESS_TYPE,
      businessLocation: { country: "US" },
      knownChannel: attached.profile.activity.channel.value,
    },
  });
  const selectedClasses = new Set(packets.map((packet) => packet.issueClass));
  if (EXPECTED_GOLD_CLASSES.some((issueClass) => !selectedClasses.has(issueClass))) {
    throw new Error("shadow_planner_phase3_gold_family_coverage_incomplete");
  }
  if (selectedClasses.has("GATEWAY_PROCESSOR_TERMINOLOGY")) {
    throw new Error("shadow_planner_phase3_suppressed_gateway_unexpectedly_selected");
  }

  const gatewayPacket = syntheticGatewayPacket();
  const allPackets = [...packets.filter((packet) => EXPECTED_GOLD_CLASSES.includes(packet.issueClass)), gatewayPacket];
  const byIssueClass = new Map<ShadowAiEconomicIssueClassV1, Readonly<{
    packet: ShadowAiEconomicResolutionPacketV1;
    offlineBaselinePlan: ShadowAiEconomicResolutionPlanV1;
    corpusKind: typeof GOLD_CORPUS_KIND | typeof SYNTHETIC_CORPUS_KIND;
  }>>();
  let privacyInspectionsPassed = 0;
  let providerPayloadInspectionsPassed = 0;
  for (const packet of allPackets) {
    const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
    if (!privacy.valid) throw new Error(`shadow_planner_phase3_packet_privacy_invalid:${privacy.reasonCodes.join(",")}`);
    privacyInspectionsPassed += 1;
    const compiled = compileShadowAiPlannerProviderRequestV1(packet);
    if (/\.pdf\b|\/Users\/|\/private\/|Bearer |sk-[A-Za-z0-9_-]{8,}/i.test(compiled.request.userPayload)) {
      throw new Error("shadow_planner_phase3_provider_payload_privacy_invalid");
    }
    providerPayloadInspectionsPassed += 1;
    const offlineBaselinePlan = await offlineBaseline(packet);
    byIssueClass.set(packet.issueClass, {
      packet,
      offlineBaselinePlan,
      corpusKind: packet.issueClass === "GATEWAY_PROCESSOR_TERMINOLOGY"
        ? SYNTHETIC_CORPUS_KIND : GOLD_CORPUS_KIND,
    });
  }

  const registries = [
    AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
    HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
  ];
  const captureDeterministicState = () => ({
    canonicalFinancialTruth: canonicalFinancialTruthFingerprint(canonical),
    rdArtifacts: fingerprint(inspected.economic),
    reconciliation: fingerprint({
      canonical: canonical.reconciliation,
      rd: inspected.economic?.pricingAnalysis?.foundation?.reconciliation ?? null,
    }),
    commercialTruth: fingerprint({
      decomposition,
      currentEconomics: attached.profile,
      governedCommercialSources: commercialSemanticFingerprintV1(registries),
    }),
    governedKnowledge: fingerprint(knowledge),
    permissions: fingerprint({
      decomposition: decomposition.permissions,
      plannerAuthority: "EVALUATION_ONLY",
      financialMutationAllowed: false,
      evidenceAdmissionAllowed: false,
      customerRenderingAllowed: false,
    }),
    customerOutput: fingerprint({ created: false, routed: false }),
  });
  return {
    byIssueClass,
    captureDeterministicState,
    privacyInspectionsPassed,
    providerPayloadInspectionsPassed,
  };
}

async function offlineBaseline(packet: ShadowAiEconomicResolutionPacketV1): Promise<ShadowAiEconomicResolutionPlanV1> {
  const adapter = createShadowAiEconomicResolutionEvaluationAdapterV1();
  const response = await adapter.invoke({
    manifest: SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
    packets: [packet],
    signal: new AbortController().signal,
  });
  const validated = validateShadowAiEconomicResolutionPlanV1(response.outputs[0], packet);
  if (!validated.ok) throw new Error(`shadow_planner_phase3_offline_baseline_invalid:${validated.errors.join(",")}`);
  return validated.plan;
}

function syntheticGatewayPacket(): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: "phase3-synthetic-gateway-run",
    issueId: "phase3-synthetic-gateway-contract-control",
    issueClass: "GATEWAY_PROCESSOR_TERMINOLOGY",
    processorFamily: "Synthetic Processor",
    processorProgram: "Synthetic Gateway Program",
    statementPeriod: null,
    acceptedIssueRelevantActivityFacts: [{
      factRef: "synthetic_gateway_channel_fact",
      field: "channel",
      state: "KNOWN",
      value: "card_not_present",
      population: "accepted_operating_context",
      evidenceRefs: ["synthetic_gateway_statement_occurrence"],
    }],
    selectedRdChargeRefs: ["synthetic_gateway_charge"],
    sanitizedFeeLabels: ["GATEWAY ACCESS"],
    acceptedEconomicCategories: ["PROCESSOR_OR_SERVICE_ECONOMICS"],
    acceptedSensitivityStates: ["UNRESOLVED_OR_NOT_APPLICABLE"],
    acceptedQualificationIntegrityState: "NOT_ISSUE_PRIMARY",
    acceptedParticipantControlStates: [{
      rdChargeRef: "synthetic_gateway_charge",
      collector: { state: "supported", value: "processor_or_acquirer" },
      economicBeneficiary: { state: "unknown", value: null },
      ruleSetter: { state: "unknown", value: null },
      priceSetter: { state: "unknown", value: null },
      merchantFacingPriceController: { state: "unknown", value: null },
    }],
    unresolvedClaimFacets: ["economic_category", "economic_beneficiary", "contractual_controller"],
    unresolvedReasonCodes: ["service_role_or_recipient_not_admitted"],
    acceptedFactRefs: ["synthetic_gateway_channel_fact"],
    currentGovernedEvidenceRefs: ["synthetic_gateway_governed_definition"],
    allowedEvidenceClasses: [
      "GOVERNED_PUBLIC_SOURCE",
      "MERCHANT_CONTRACT_OR_SCHEDULE",
      "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA",
    ],
    prohibitedConclusions: [
      "canonical_fact_change",
      "participant_or_control_truth",
      "savings_or_annualization",
      "customer_action_or_finding",
    ],
    merchantBusinessContext: null,
    competingHypothesisRequired: true,
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: fingerprint(withoutHash),
  });
}

function deterministicPricing(
  document: ParsedDocument,
  file: string,
  analysis: any,
): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, GOLD_BUSINESS_TYPE, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as {
    pricingModel?: { pricingModel?: string; confidence?: string };
  } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error("shadow_planner_phase3_gold_pricing_unavailable");
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high"
      ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3)
      .flatMap((row: any) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus"
      ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`shadow_planner_phase3_environment_missing:${name}`);
  return value;
}

async function acquireAttemptGuard(): Promise<void> {
  await writeFile(ATTEMPT_GUARD_PATH, `${JSON.stringify({
    schemaVersion: "provider_neutral_shadow_planner_phase3_attempt_guard_2026_09_16_v1",
    state: "STARTED",
    startedAt: GENERATED_AT,
    maximumProviderCalls: SHADOW_AI_ISSUE_CLASSES.length * SHADOW_AI_PHASE_3_REPETITIONS_V1,
    retriesAllowed: 0,
    automaticProviderFallbackAllowed: false,
    openRouterAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
}

function report(value: typeof result): string {
  const rows = value.familyResults.flatMap((family) => family.trials.map((trial) =>
    `| ${family.issueClass} | ${family.corpusKind} | ${trial.repetition} | ${trial.status} | ${trial.runStatus ?? "—"} | ${trial.accounting?.inputTokens ?? 0} | ${trial.accounting?.outputTokens ?? 0} | ${trial.accounting?.estimatedCostUsdMicros ?? 0} | ${trial.accounting?.latencyMs ?? 0} | ${trial.deterministicStatePreserved ? "yes" : "NO"} | ${trial.quality ? Object.values(trial.quality).every(Boolean) ? "yes" : "NO" : "—"} | ${family.repeatableSemanticSignature ? "yes" : family.trials.some((item) => item.status === "SKIPPED") ? "—" : "NO"} | ${trial.errorCodes.join(", ") || "—"} |`
  )).join("\n");
  return `# Direct OpenAI provider-neutral planner — Phase 3 shadow evaluation\n\nMode: non-customer, non-authoritative shadow evaluation. Model: \`${MODEL}\`. OpenRouter disabled. Raw prompts, provider responses, and drafts were not persisted.\n\n| Issue family | Corpus | Repeat | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Protected state unchanged | Offline baseline quality | Semantic repeatability | Safe errors |\n|---|---|---:|---|---|---:|---:|---:|---:|---|---|---|---|\n${rows}\n\n## Result\n\n- Phase 3 status: **${value.summary.status}**.\n- Issue-family coverage: ${value.summary.issueFamilyCoverage}; passed: ${value.summary.passedIssueFamilies.length}; failed: ${value.summary.failedIssueFamilies.length}.\n- Provider calls: ${value.summary.totalProviderCalls}/${value.summary.maximumProviderCalls}; retries: 0; fallback attempts: 0.\n- Tokens: ${value.summary.totalInputTokens} input / ${value.summary.totalOutputTokens} output. Estimated cost: $${(value.summary.totalEstimatedCostUsdMicros / 1_000_000).toFixed(6)}.\n- Repeatable semantic signatures: ${value.summary.allSemanticSignaturesRepeatable}. Offline-baseline quality matched: ${value.summary.allOfflineBaselineQualityMatched}.\n- Protected state unchanged: ${value.summary.allProtectedStatePreserved}. Customer outputs: 0. Truth mutations: 0. Source admissions: 0. Research operations: 0.\n`;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
