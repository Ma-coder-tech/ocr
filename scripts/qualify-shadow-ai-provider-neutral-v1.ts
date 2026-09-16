import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import { config as loadEnvironment } from "dotenv";

import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import {
  canonicalFinancialTruthFingerprint,
  type InternalAnalystPricingModelInput,
} from "../src/canonical/internalAnalystFindingV1.js";
import {
  compileShadowAiEconomicResolutionPacketsV1,
  selectShadowAiEconomicResolutionIssuesV1,
} from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  type ShadowAiEconomicResolutionPacketV1,
} from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  qualifyShadowAiPlannerProviderV1,
  SHADOW_AI_PROVIDER_QUALIFICATION_TIMEOUT_MS_V1,
  type ShadowAiPlannerDeterministicStateV1,
} from "../src/canonical/shadowAiPlannerProviderQualificationV1.js";
import {
  createOpenAiDirectPlannerAdapterV1,
  createOpenRouterPlannerAdapterV1,
} from "../src/canonical/shadowAiPlannerProviderTransportsV1.js";
import {
  OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1,
  OPENROUTER_GPT_5_2_CALLABLE_MODEL_V1,
} from "../src/canonical/shadowAiPlannerProviderAdaptersV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUT = "evaluations/provider-neutral-shadow-planner-v1";
const RESULT_PATH = `${OUT}/requalification-2-2026-09-16.json`;
const REPORT_PATH = `${OUT}/requalification-2-report-2026-09-16.md`;
const ATTEMPT_GUARD_PATH = `${OUT}/requalification-2-attempt-guard-2026-09-16.json`;
const GENERATED_AT = new Date().toISOString();
const OPENAI_MODEL = OPENAI_DIRECT_GPT_5_2_SNAPSHOT_MODEL_V1;
const OPENROUTER_MODEL = OPENROUTER_GPT_5_2_CALLABLE_MODEL_V1;
const PRICE = Object.freeze({
  inputUsdMicrosPerMillionTokens: 1_750_000,
  outputUsdMicrosPerMillionTokens: 14_000_000,
});
const GENERATION = Object.freeze({
  maximumOutputTokens: 4_000,
  reasoningEffort: "none" as const,
  verbosity: "low" as const,
});
const OPENROUTER_ROUTING = Object.freeze({
  onlyProvider: "openai",
  dataCollection: "deny" as const,
  maximumPromptPriceUsdPerMillionTokens: 1.75,
  maximumCompletionPriceUsdPerMillionTokens: 14,
});

loadEnvironment({ path: process.env.RATEREVEAL_ENV_PATH ?? ".env", quiet: true });

const openAiApiKey = requiredEnvironment("OPENAI_API_KEY");
const openRouterApiKey = requiredEnvironment("OPENROUTER_API_KEY");

const gold = await buildGoldControl();
const schemaControlPacket = syntheticPacket("provider-qualification-schema-control");
const adversarialControlPacket = syntheticPacket("provider-qualification-adversarial-control");
const protectedState = (): ShadowAiPlannerDeterministicStateV1 => ({
  canonicalFinancialTruth: canonicalFinancialTruthFingerprint(gold.canonical),
  rdArtifacts: fingerprint(gold.economic),
  reconciliation: fingerprint({
    canonical: gold.canonical.reconciliation,
    rd: gold.economic?.pricingAnalysis?.foundation?.reconciliation ?? null,
  }),
  commercialTruth: fingerprint({ decomposition: gold.decomposition, currentEconomics: gold.attached.profile }),
  governedKnowledge: fingerprint(gold.knowledge),
  permissions: fingerprint({
    authority: "EVALUATION_ONLY",
    financialMutationAllowed: false,
    evidenceAdmissionAllowed: false,
    customerRenderingAllowed: false,
  }),
  customerOutput: fingerprint({ created: false, routed: false }),
});

await mkdir(OUT, { recursive: true });
await acquireAttemptGuard();

const openAi = await qualifyShadowAiPlannerProviderV1({
  adapter: createOpenAiDirectPlannerAdapterV1({
    apiKey: openAiApiKey,
    model: OPENAI_MODEL,
    generation: GENERATION,
    pricing: PRICE,
  }),
  schemaControlPacket,
  adversarialControlPacket,
  goldPacket: gold.packet,
  captureDeterministicState: protectedState,
});

const openRouter = await qualifyShadowAiPlannerProviderV1({
  adapter: createOpenRouterPlannerAdapterV1({
    apiKey: openRouterApiKey,
    model: OPENROUTER_MODEL,
    generation: GENERATION,
    routing: OPENROUTER_ROUTING,
    pricing: PRICE,
  }),
  schemaControlPacket,
  adversarialControlPacket,
  goldPacket: gold.packet,
  captureDeterministicState: protectedState,
});

const qualifications = [openAi, openRouter];
const result = {
  schemaVersion: "provider_neutral_shadow_planner_requalification_2026_09_16_v2",
  generatedAt: GENERATED_AT,
  mode: "BOUNDED_NON_CUSTOMER_LIVE_REQUALIFICATION",
  baseline: {
    branch: "codex/planner-provider-neutral-consolidation-v1",
    phase1Commit: "e347b588d1bd6ae1bb54463dbe5b672a30aae490",
    phase2Commit: "95cf153",
    firstRequalificationCommit: "09b24a1",
    selectedParent: "d6ebcdbe919d11fb29ce73d7155c28848796a20f",
  },
  controls: {
    schemaControl: "SYNTHETIC_NON_CUSTOMER",
    adversarialReferenceControl: "SYNTHETIC_CROSS_REQUEST_REPLAY",
    goldControl: "EXISTING_NON_CUSTOMER_GOLD_FIXTURE",
    maximumCallsPerAdapter: 3,
    retries: 0,
    automaticProviderFallback: false,
    qualificationTimeoutMsPerCall: SHADOW_AI_PROVIDER_QUALIFICATION_TIMEOUT_MS_V1,
    maximumOutputTokensPerCall: GENERATION.maximumOutputTokens,
    reasoningEffort: GENERATION.reasoningEffort,
    verbosity: GENERATION.verbosity,
    maximumEstimatedCostUsdMicrosPerCall:
      SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1.maximumEstimatedCostUsdMicros,
    configuredPricingUsdPerMillionTokens: { input: 1.75, output: 14 },
    openRouterRouting: {
      onlyProvider: OPENROUTER_ROUTING.onlyProvider,
      allowFallbacks: false,
      requireParameters: true,
      dataCollection: OPENROUTER_ROUTING.dataCollection,
      maximumPromptPriceUsdPerMillionTokens:
        OPENROUTER_ROUTING.maximumPromptPriceUsdPerMillionTokens,
      maximumCompletionPriceUsdPerMillionTokens:
        OPENROUTER_ROUTING.maximumCompletionPriceUsdPerMillionTokens,
    },
  },
  persistenceBoundary: {
    rawPrompts: false,
    rawProviderResponses: false,
    providerDrafts: false,
    customerOutput: false,
    safeFingerprintsAndTelemetryOnly: true,
  },
  qualifications,
  summary: {
    qualifiedAdapters: qualifications.filter((item) => item.status === "QUALIFIED").map((item) => item.adapterId),
    rejectedAdapters: qualifications.filter((item) => item.status === "REJECTED").map((item) => item.adapterId),
    totalProviderCalls: qualifications.reduce((sum, item) => sum + item.providerCalls, 0),
    allProtectedStatePreserved: qualifications.every((item) => item.deterministicStatePreserved),
    customerOutputsCreated: 0,
    truthMutations: 0,
  },
};

await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
await writeFile(REPORT_PATH, report(result), { flag: "wx" });
await writeFile(ATTEMPT_GUARD_PATH, `${JSON.stringify({
  schemaVersion: "provider_neutral_shadow_planner_requalification_attempt_guard_2026_09_16_v2",
  state: "COMPLETED",
  startedAt: GENERATED_AT,
  completedAt: new Date().toISOString(),
  maximumCallsPerAdapter: 3,
  adapterCallCounts: Object.fromEntries(qualifications.map((item) => [item.adapterId, item.providerCalls])),
  resultSha256: fingerprint(result),
}, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
if (result.summary.rejectedAdapters.length > 0) process.exitCode = 1;

async function buildGoldControl() {
  const file = "fiserv_ABDUL_BASHER_Aug_2025.pdf";
  const businessType = "retail" as const;
  const safeStatementId = "provider-neutral-gold-control-04";
  const inspected = await inspectFiservOneStatementEvaluation({
    statementPaths: [`test/fixtures/pdfs/${file}`],
    safeStatementId,
  });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
    sourceFileName: file,
    businessType,
  });
  const knowledge = new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis: canonical,
    context: {
      geography: {
        value: "us",
        evidenceClass: "statement_local",
        evidenceRefs: ["supported_fiserv_us_scope"],
      },
    },
    suppliedPricingObservation: deterministicPricing(inspected.document, file, businessType, canonical),
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
    opaqueRunRef: `shadow-run-${createHash("sha256").update("provider-neutral-gold-control-04").digest("hex").slice(0, 24)}`,
    selection,
    currentEconomics: attached.profile,
    commercialDecomposition: decomposition,
    merchantBusinessContext: {
      admittedBusinessCategory: businessType,
      businessLocation: { country: "US" },
      knownChannel: attached.profile.activity.channel.value,
    },
  });
  const packet = packets[0];
  if (!packet) throw new Error("provider_neutral_gold_control_packet_unavailable");
  return { packet, canonical, economic: inspected.economic, knowledge, decomposition, attached };
}

function syntheticPacket(issueId: string): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: `run-${issueId}`,
    issueId,
    issueClass: "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
    processorFamily: "Synthetic Processor",
    processorProgram: null,
    statementPeriod: { start: "2026-08-01", end: "2026-08-31" },
    acceptedIssueRelevantActivityFacts: [{
      factRef: "synthetic_fact_submitted_transaction_count",
      field: "submittedTransactionCount",
      state: "KNOWN",
      value: 120,
      population: "submitted_transactions",
      evidenceRefs: ["synthetic_statement_occurrence_001"],
    }],
    selectedRdChargeRefs: ["synthetic_economic_charge_001"],
    sanitizedFeeLabels: ["AUTHORIZATION SERVICE"],
    acceptedEconomicCategories: ["PROCESSOR_OR_SERVICE_ECONOMICS"],
    acceptedSensitivityStates: ["TRANSACTION_COUNT_DRIVEN"],
    acceptedQualificationIntegrityState: "UNKNOWN",
    acceptedParticipantControlStates: [{
      rdChargeRef: "synthetic_economic_charge_001",
      collector: { state: "KNOWN", value: "processor_or_acquirer" },
      economicBeneficiary: { state: "UNKNOWN", value: null },
      ruleSetter: { state: "UNKNOWN", value: null },
      priceSetter: { state: "UNKNOWN", value: null },
      merchantFacingPriceController: { state: "UNKNOWN", value: null },
    }],
    unresolvedClaimFacets: ["authorizationCount", "settledTransactionCount"],
    unresolvedReasonCodes: ["authorization_and_settlement_populations_not_interchangeable"],
    acceptedFactRefs: ["synthetic_fact_submitted_transaction_count"],
    currentGovernedEvidenceRefs: ["synthetic_governed_authorization_definition"],
    allowedEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"],
    prohibitedConclusions: ["canonical_fact_change", "savings_or_annualization", "customer_action_or_finding"],
    merchantBusinessContext: null,
    competingHypothesisRequired: true,
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  });
}

function deterministicPricing(
  document: ParsedDocument,
  file: string,
  businessType: "retail",
  analysis: any,
): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as {
    pricingModel?: { pricingModel?: string; confidence?: string };
  } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error("provider_neutral_gold_pricing_unavailable");
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high"
      ? "high"
      : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3)
      .flatMap((row: any) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus"
      ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`provider_neutral_qualification_environment_missing:${name}`);
  return value;
}

async function acquireAttemptGuard(): Promise<void> {
  await writeFile(ATTEMPT_GUARD_PATH, `${JSON.stringify({
    schemaVersion: "provider_neutral_shadow_planner_requalification_attempt_guard_2026_09_16_v2",
    state: "STARTED",
    startedAt: GENERATED_AT,
    maximumCallsPerAdapter: 3,
    retriesAllowed: 0,
    automaticProviderFallbackAllowed: false,
  }, null, 2)}\n`, { flag: "wx" });
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function report(value: typeof result): string {
  const rows = value.qualifications.flatMap((qualification) => qualification.stages.map((stage) =>
    `| ${qualification.providerKind} | ${qualification.pinnedModel} | ${stage.stage} | ${stage.status} | ${stage.runStatus ?? "—"} | ${stage.accounting?.inputTokens ?? 0} | ${stage.accounting?.outputTokens ?? 0} | ${stage.accounting?.estimatedCostUsdMicros ?? 0} | ${stage.accounting?.latencyMs ?? 0} | ${stage.deterministicStatePreserved ? "yes" : "NO"} | ${stage.crossRequestReplayRejected === null ? "—" : stage.crossRequestReplayRejected ? "yes" : "NO"} | ${stage.errorCodes.join(", ") || "—"} |`
  )).join("\n");
  return `# Provider-neutral shadow planner — bounded requalification\n\nMode: bounded non-customer live requalification. Deadline: ${value.controls.qualificationTimeoutMsPerCall} ms per call. Reasoning: \`${value.controls.reasoningEffort}\`; verbosity: \`${value.controls.verbosity}\`. Raw prompts, provider responses, and drafts were not persisted.\n\n| Adapter | Pinned model | Stage | Result | Runtime | Input tokens | Output tokens | Cost µUSD | Latency ms | Protected state unchanged | Cross-request replay rejected | Safe errors |\n|---|---|---|---|---|---:|---:|---:|---:|---|---|---|\n${rows}\n\n## Result\n\n- Qualified adapters: ${value.summary.qualifiedAdapters.join(", ") || "none"}.\n- Rejected adapters: ${value.summary.rejectedAdapters.join(", ") || "none"}.\n- Provider calls: ${value.summary.totalProviderCalls}; maximum permitted was six across two independent adapters.\n- Retries: 0. Automatic provider fallback: disabled.\n- Protected state unchanged: ${value.summary.allProtectedStatePreserved}. Customer outputs: 0. Truth mutations: 0.\n`;
}
