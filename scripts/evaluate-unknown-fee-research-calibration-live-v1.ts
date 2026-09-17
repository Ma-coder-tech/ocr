import { execFile as execFileCallback } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { retrieveFeeKnowledgeDocument } from "../src/canonical/feeKnowledgeRetrieval.js";
import { extractDiscoveryCandidates, openAiResponsesSafeUsage } from "../src/canonical/feeKnowledgeResearch.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import {
  runCalibratedUnknownFeeResearchV1,
  type CalibratedResearchSynthesisV1,
  type CalibratedUnknownFeeResearchResultV1,
} from "../src/canonical/unknownFeeResearchCalibrationRunnerV1.js";
import { buildUnknownFeeResearchPlanV1, summarizeUnknownFeeResearchQualityV1, type UnknownFeeResearchCaseMetricV1, type UnknownFeeResearchPlanV1 } from "../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../src/parser.js";

const execFile = promisify(execFileCallback);
const AUTHORIZATION = "product-approved-calibrated-unknown-fee-live-research-v1";
const OPENAI_KEYCHAIN_SERVICE = "RateReveal/OpenAI";
const MODEL = "gpt-5.6-sol";
const OUTPUT_PATH = "evaluations/unknown-fee-research-calibration-v1/live-evaluation-2026-09-08.json";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const PROFILES: Array<{ caseId: string; file: string; businessType: BusinessTypeId; labelIncludes: string; execution: "LIVE_RESEARCH" | "STAGE0_CONTROL" }> = [
  { caseId: "monthly_advantage", file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage", labelIncludes: "MONTHLY ADVANTAGE FEE", execution: "LIVE_RESEARCH" },
  { caseId: "batch_settlement", file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage", labelIncludes: "BATCH SETTLEMENT FEE", execution: "LIVE_RESEARCH" },
  { caseId: "application_fee_generic", file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other", labelIncludes: "APPLICATION FEE", execution: "LIVE_RESEARCH" },
  { caseId: "amexct043_nqual_coded", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce", labelIncludes: "AMEXCT043 - NQUAL DISC", execution: "LIVE_RESEARCH" },
  { caseId: "cpu_gateway_stage0_control", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce", labelIncludes: "CPU GTWY", execution: "STAGE0_CONTROL" },
];

type SafeUsage = ReturnType<typeof openAiResponsesSafeUsage>;
type LoadedStatement = Awaited<ReturnType<typeof loadStatement>>;

export async function runUnknownFeeResearchCalibrationLiveV1(input: { authorization: string | null; apiKey?: string }) {
  if (input.authorization !== AUTHORIZATION) throw new Error("exact_product_authorization_required");
  const apiKey = input.apiKey ?? await readKeychainCredential(OPENAI_KEYCHAIN_SERVICE);
  if (!apiKey) throw new Error("openai_credential_unavailable");
  const usage: SafeUsage[] = [];
  const loaded = new Map<string, LoadedStatement>();
  const caseResults: Array<{
    caseId: string;
    execution: "LIVE_RESEARCH" | "STAGE0_CONTROL";
    file: string;
    printedLabel: string;
    primaryType: UnknownFeeResearchPlanV1["primaryType"];
    plan: UnknownFeeResearchPlanV1;
    canonicalBeforeFingerprint: string;
    canonicalAfterFingerprint: string;
    governedD1D4Changed: boolean;
    governedConfidenceChanged: boolean;
    result: CalibratedUnknownFeeResearchResultV1;
  }> = [];

  for (const profile of PROFILES) {
    const statement = loaded.get(profile.file) ?? await loadStatement(profile.file, profile.businessType);
    loaded.set(profile.file, statement);
    const row = statement.analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(profile.labelIncludes));
    if (!row) throw new Error(`approved_calibration_row_missing:${profile.caseId}`);
    const finding = statement.report.findings.find((item) => item.sourceFeeRowId === row.id);
    if (!finding?.openWorldDeterminants) throw new Error(`determinant_missing:${profile.caseId}`);
    const queued = [...statement.report.researchQueue.selected, ...statement.report.researchQueue.deferred]
      .find((item) => item.question.feeRowRef === row.id);
    const plan = queued?.calibration ?? buildUnknownFeeResearchPlanV1({
      feeRowId: row.id,
      printedLabel: row.selectedLabel,
      processorName: processorContext(statement.analysis.identity.processorName.value, statement.analysis.identity.processorFamily.value),
      statementYear: statement.year,
      statementRole: row.role,
      determinant: finding.openWorldDeterminants,
    });
    if (profile.execution === "LIVE_RESEARCH" && plan.stage0.decision !== "RESEARCH") throw new Error(`approved_live_case_stopped_at_stage0:${profile.caseId}`);
    if (profile.execution === "STAGE0_CONTROL" && plan.stage0.decision !== "STOP_WITHOUT_EXTERNAL_RESEARCH") throw new Error(`stage0_control_unexpectedly_selected:${profile.caseId}`);
    const beforeProjection = determinantProjection(finding.openWorldDeterminants);
    const result = await runCalibratedUnknownFeeResearchV1({
      plan,
      adapters: profile.execution === "STAGE0_CONTROL" ? forbiddenAdapters() : liveAdapters(apiKey, usage),
    });
    const afterFingerprint = canonicalFinancialTruthFingerprint(statement.analysis);
    const afterReport = buildInternalAnalystFindingV1({ analysis: statement.analysis, statementContext: US_CONTEXT });
    const afterFinding = afterReport.findings.find((item) => item.sourceFeeRowId === row.id)!;
    caseResults.push({
      caseId: profile.caseId,
      execution: profile.execution,
      file: profile.file,
      printedLabel: row.selectedLabel,
      primaryType: plan.primaryType,
      plan,
      canonicalBeforeFingerprint: statement.beforeFingerprint,
      canonicalAfterFingerprint: afterFingerprint,
      governedD1D4Changed: JSON.stringify(beforeProjection) !== JSON.stringify(determinantProjection(afterFinding.openWorldDeterminants!)),
      governedConfidenceChanged: JSON.stringify(confidenceProjection(finding)) !== JSON.stringify(confidenceProjection(afterFinding)),
      result,
    });
  }

  const metricCases: UnknownFeeResearchCaseMetricV1[] = caseResults.map((item) => ({
    caseId: item.caseId,
    primaryType: item.primaryType,
    stage0Decision: item.result.stage0Decision,
    externalOperations: item.result.operations.length,
    executedQueryShapes: item.result.queryShapeResults.map((shape) => ({ kind: shape.kind, usableEvidence: shape.usefulCandidateCount > 0 })),
    sources: item.result.sources.map((source) => ({ lane: source.lane, useful: source.evidenceUseful, authorityAccepted: false })),
    determinantLift: item.result.synthesis?.determinantLift ?? [],
    actionLift: item.result.synthesis?.actionLift ?? false,
    evidenceTierImproved: item.result.synthesis?.evidenceTierImproved ?? false,
    correctionState: "none",
  }));
  const requestIds = usage.map((item) => item.requestId).filter((item): item is string => Boolean(item));
  return {
    schemaVersion: "unknown_fee_research_calibration_live_evaluation_v1",
    evaluationOnly: true,
    executionProfile: {
      model: MODEL,
      liveResearchCases: 4,
      stage0ControlCases: 1,
      maximumSearchShapes: 4,
      maximumDocumentFetches: 3,
      maximumSynthesisCalls: 1,
      maximumExternalOperationsPerFee: 8,
      maximumCandidatesPerSearch: 2,
      automaticRetries: 0,
      fallbackProvidersAllowed: false,
      store: false,
      sentFields: ["processor_name", "statement_year", "statement_role", "sanitized_fee_label", "amount_free_query_hypothesis_or_mechanic", "document_genre", "retrieved_public_source_excerpt"],
      prohibitedFieldsSent: false,
    },
    cases: caseResults.map((item) => ({
      caseId: item.caseId,
      execution: item.execution,
      file: item.file,
      printedLabel: item.printedLabel,
      primaryType: item.primaryType,
      applicableTypes: item.plan.applicableTypes,
      stage0: item.plan.stage0,
      budget: item.plan.budget,
      queryShapes: item.plan.queryShapes.map((shape) => ({ shapeId: shape.shapeId, kind: shape.kind, documentGenres: shape.documentGenres })),
      operations: item.result.operations,
      queryShapeResults: item.result.queryShapeResults,
      sources: item.result.sources,
      provisionalSynthesis: item.result.synthesis,
      governedD1D4Changed: item.governedD1D4Changed,
      governedConfidenceChanged: item.governedConfidenceChanged,
      canonicalFingerprintUnchanged: item.canonicalBeforeFingerprint === item.canonicalAfterFingerprint,
      stoppingDecision: item.result.stoppingDecision,
    })),
    researchQuality: summarizeUnknownFeeResearchQualityV1(metricCases),
    candidateKnowledge: caseResults.flatMap((item) => (item.result.synthesis?.candidateInterpretations ?? []).map((candidate, index) => ({
      candidateId: `${item.caseId}_${index + 1}`,
      status: "candidate_for_product_domain_review",
      claim: candidate.claim,
      affectedFeeContext: item.printedLabel,
      affectedDeterminants: candidate.affectedDeterminants,
      sourceUrls: candidate.sourceUrls,
      confidence: candidate.confidence,
      knownExceptionOrCompetingInterpretation: candidate.competingInterpretation,
      scope: { processor: item.plan.labelFeatures.processorName, geography: "US", statementYear: item.plan.labelFeatures.statementYear },
      whyUseful: "Would improve the listed determinant only if Product/domain review admits the claim with adequate evidence.",
      autoAdmitted: false,
    }))),
    providerAccounting: {
      callsWithUsageReceipts: usage.length,
      requestIds,
      inputTokens: sumUsage(usage, "inputTokens"),
      outputTokens: sumUsage(usage, "outputTokens"),
      webSearchToolCalls: usage.reduce((sum, item) => sum + item.webSearchToolCalls, 0),
    },
    safety: {
      reusableKnowledgeSelfAdmitted: false,
      governedD1D4ChangedCases: caseResults.filter((item) => item.governedD1D4Changed).length,
      governedConfidenceChangedCases: caseResults.filter((item) => item.governedConfidenceChanged).length,
      canonicalFinancialFingerprintChangedCases: caseResults.filter((item) => item.canonicalBeforeFingerprint !== item.canonicalAfterFingerprint).length,
      allCanonicalFinancialFingerprintsUnchanged: caseResults.every((item) => item.canonicalBeforeFingerprint === item.canonicalAfterFingerprint),
      stage0ControlExternalOperations: caseResults.find((item) => item.execution === "STAGE0_CONTROL")?.result.operations.length ?? null,
    },
  };
}

function liveAdapters(apiKey: string, usage: SafeUsage[]) {
  return {
    search: async ({ plan, shape, maximumCandidates }: { plan: UnknownFeeResearchPlanV1; shape: UnknownFeeResearchPlanV1["queryShapes"][number]; maximumCandidates: 2 }, context: { abortSignal: AbortSignal }) => {
      const raw = await openAiRequest(apiKey, {
        model: MODEL,
        store: false,
        input: [
          "Search for public payment-processing documents relevant to this provisional fee hypothesis. Prefer the requested document genres. Return no more than two source candidates. Similar wording is only a retrieval lead, not identity evidence.",
          JSON.stringify({ processorName: plan.labelFeatures.processorName, statementYear: plan.labelFeatures.statementYear, statementRole: plan.labelFeatures.statementRole, sanitizedFeeLabel: sanitize(plan.labelFeatures.distinctivePhrase), amountFreeQueryHypothesisOrMechanic: sanitize(shape.query), documentGenres: shape.documentGenres }),
        ].join("\n"),
        tools: [{ type: "web_search" }], tool_choice: "required", include: ["web_search_call.action.sources"], reasoning: { effort: "low" }, max_output_tokens: 1_500, max_tool_calls: 1,
      }, context.abortSignal, usage);
      return extractDiscoveryCandidates(raw).slice(0, maximumCandidates);
    },
    retrieve: (candidate: { url: string }, context: { abortSignal: AbortSignal }) => retrieveFeeKnowledgeDocument(candidate.url, { abortSignal: context.abortSignal }),
    synthesize: async ({ plan, evidence }: { plan: UnknownFeeResearchPlanV1; evidence: Array<{ url: string; lane: string; boundedExcerpt: string }> }, context: { abortSignal: AbortSignal }) => {
      const raw = await openAiRequest(apiKey, {
        model: MODEL,
        store: false,
        input: [
          "Assess only provisional D1-D4 improvements from these public excerpts. Preserve competing interpretations. Do not create facts, infer contract terms, strengthen governed confidence, or admit knowledge. Return JSON only.",
          JSON.stringify({ processorName: plan.labelFeatures.processorName, statementYear: plan.labelFeatures.statementYear, statementRole: plan.labelFeatures.statementRole, sanitizedFeeLabel: sanitize(plan.labelFeatures.distinctivePhrase), retrievedPublicSourceExcerpts: evidence, responseSchema: { candidateInterpretations: [{ claim: "string", affectedDeterminants: ["D1|D2|D3|D4"], confidence: "low|medium|high", competingInterpretation: "string|null", sourceUrls: ["string"] }], determinantLift: ["D1|D2|D3|D4"], actionLift: "boolean", evidenceTierImproved: "boolean" } }),
        ].join("\n"),
        reasoning: { effort: "low" }, max_output_tokens: 1_800,
      }, context.abortSignal, usage);
      return parseSynthesis(outputText(raw));
    },
  };
}

function forbiddenAdapters() {
  const forbidden = async () => { throw new Error("stage0_control_external_operation_forbidden"); };
  return { search: forbidden, retrieve: forbidden, synthesize: forbidden };
}

async function loadStatement(file: string, businessType: BusinessTypeId) {
  const parsed = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(parsed, { sourceFileName: file, businessType });
  const beforeFingerprint = canonicalFinancialTruthFingerprint(analysis);
  return { analysis, beforeFingerprint, report: buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT }), year: analysis.identity.statementPeriod.value?.start?.slice(0, 4) ?? null };
}

async function openAiRequest(apiKey: string, body: Record<string, unknown>, signal: AbortSignal, usage: SafeUsage[]) {
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const raw = await response.json().catch(() => null);
  usage.push(openAiResponsesSafeUsage(raw));
  if (!response.ok) throw new Error(`calibrated_live_openai_http_${response.status}`);
  return raw;
}

function sanitize(value: string) {
  return value.replace(/\$\s*\d[\d,.]*/g, "[amount withheld]").replace(/\b\d+(?:\.\d+)?\b/g, "[numeric term withheld]").replace(/\s+/g, " ").trim();
}

function parseSynthesis(value: string): CalibratedResearchSynthesisV1 {
  const parsed = JSON.parse(value) as Partial<CalibratedResearchSynthesisV1>;
  const allowed = new Set(["D1", "D2", "D3", "D4"]);
  return {
    candidateInterpretations: (Array.isArray(parsed.candidateInterpretations) ? parsed.candidateInterpretations : []).slice(0, 3).flatMap((item) => item && typeof item.claim === "string" ? [{ claim: item.claim, affectedDeterminants: Array.isArray(item.affectedDeterminants) ? item.affectedDeterminants.filter((entry): entry is "D1" | "D2" | "D3" | "D4" => allowed.has(entry)) : [], confidence: item.confidence === "medium" || item.confidence === "high" ? item.confidence : "low", competingInterpretation: typeof item.competingInterpretation === "string" ? item.competingInterpretation : null, sourceUrls: Array.isArray(item.sourceUrls) ? item.sourceUrls.filter((entry): entry is string => typeof entry === "string").slice(0, 3) : [] }] : []),
    determinantLift: Array.isArray(parsed.determinantLift) ? parsed.determinantLift.filter((entry): entry is "D1" | "D2" | "D3" | "D4" => allowed.has(entry)) : [],
    actionLift: parsed.actionLift === true,
    evidenceTierImproved: parsed.evidenceTierImproved === true,
  };
}

function outputText(raw: unknown) {
  const root = asRecord(raw);
  return (Array.isArray(root?.output) ? root.output : []).flatMap((item) => (Array.isArray(asRecord(item)?.content) ? asRecord(item)!.content : []).flatMap((part: unknown) => { const value = asRecord(part); return value?.type === "output_text" && typeof value.text === "string" ? [value.text] : []; })).join("\n");
}

function asRecord(value: unknown): Record<string, any> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null; }
function determinantProjection(item: any) { return { exactIdentity: item.exactIdentity, family: item.family, d1: item.d1EconomicLayerAndControl, d2: item.d2MechanicAndPopulation, d3: item.d3Materiality, d4: item.d4Actionability, sufficiency: item.determinantSufficiency }; }
function confidenceProjection(item: any) { return { exactIdentity: item.exactFeeIdentity.confidence, category: item.broaderEconomicCategory.confidence, assessmentUnit: item.assessmentUnitOrMechanic.confidence, collector: item.collector.confidence, beneficiary: item.economicBeneficiary.confidence, ruleSetter: item.ruleSetter.confidence, priceSetter: item.priceSetter.confidence, controller: item.merchantFacingPriceController.confidence, commercialReasonableness: item.commercialReasonableness.confidence }; }
function sumUsage(usage: SafeUsage[], field: "inputTokens" | "outputTokens") { const values = usage.map((item) => item[field]).filter((value): value is number => value !== null); return values.length ? values.reduce((sum, value) => sum + value, 0) : null; }
function processorContext(name: string | null, family: string | null) { return name && /FISERV|FIRST DATA|CLOVER|PAYSAFE|BASYS|NXGEN|PRIORITY|WELLS FARGO/i.test(name) ? name : family ?? name; }

async function readKeychainCredential(service: string) {
  const { stdout } = await execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8", maxBuffer: 16_384, timeout: 120_000 });
  return stdout.replace(/[\r\n]+$/, "");
}

async function main() {
  const authorization = process.argv.find((argument) => argument.startsWith("--authorization="))?.slice("--authorization=".length) ?? null;
  const result = await runUnknownFeeResearchCalibrationLiveV1({ authorization });
  await mkdir("evaluations/unknown-fee-research-calibration-v1", { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => {
  process.stderr.write(`Unknown-fee calibrated live evaluation failed safely: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
