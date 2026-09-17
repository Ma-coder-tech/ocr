import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { retrieveFeeKnowledgeDocument, type RetrievedDocument } from "../src/canonical/feeKnowledgeRetrieval.js";
import { extractDiscoveryCandidates, openAiResponsesSafeUsage } from "../src/canonical/feeKnowledgeResearch.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import {
  runCalibratedUnknownFeeResearchV1,
  type CalibratedResearchDiscoveryCandidateV1,
  type CalibratedResearchSynthesisV1,
} from "../src/canonical/unknownFeeResearchCalibrationRunnerV1.js";
import { buildUnknownFeeResearchPlanV1, type UnknownFeeResearchPlanV1 } from "../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../src/parser.js";

const execFile = promisify(execFileCallback);
const AUTHORIZATION = "product-approved-unknown-fee-research-diagnosis-e1-e2-v1";
const OPENAI_KEYCHAIN_SERVICE = "RateReveal/OpenAI";
const MODEL = "gpt-5.6-sol";
const BASELINE_COMMIT = "a0be0bef1eb81742e655e3c99e7621213a99bdf4";
const PRIOR_EVALUATION_PATH = "evaluations/unknown-fee-research-calibration-v1/live-evaluation-2026-09-08.json";
const OUTPUT_PATH = "evaluations/unknown-fee-research-diagnosis-e1-e2-v1/evaluation-2026-09-08.json";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

type E1Decision = "RESEARCH_WARRANTED" | "SUPPRESS_RESEARCH";

type E1Adjudication = {
  caseId: string;
  file: string;
  businessType: BusinessTypeId;
  labelIncludes: string;
  decision: E1Decision;
  d1D4SufficientForMerchantConclusion: boolean;
  exactIdentityMateriallyChangesConclusion: boolean;
  statementKnowledge: string[];
  governedKnowledge: string[];
  unresolvedAfterE1: string[];
  merchantConclusion: string;
  rationale: string;
};

export const E1_ADJUDICATIONS: E1Adjudication[] = [
  {
    caseId: "monthly_advantage",
    file: "Nov_2024_Statement.pdf",
    businessType: "restaurant_food_beverage",
    labelIncludes: "MONTHLY ADVANTAGE FEE",
    decision: "RESEARCH_WARRANTED",
    d1D4SufficientForMerchantConclusion: false,
    exactIdentityMateriallyChangesConclusion: true,
    statementKnowledge: [
      "Clover / A First Data Company statement context",
      "the printed row contains the proprietary-looking MCVDB token",
      "the row is presented under Other as a service charge",
      "the printed row exposes a proportional rate-times-volume mechanic",
    ],
    governedKnowledge: [
      "the statement is interchange-plus",
      "the processor/acquirer is the collector, without proving economic ownership",
      "no admitted fee family, beneficiary, rule setter, or price controller resolves this label",
    ],
    unresolvedAfterE1: [
      "whether MCVDB identifies a proprietary acquiring program or another economic layer",
      "who controls the merchant-facing price",
      "whether a commercial price-review action is better supported than verification alone",
    ],
    merchantConclusion: "Targeted verification is currently safe, but resolving the economic layer could materially improve the price-review recommendation.",
    rationale: "Unlike the other cases, the unresolved family and price-control question can change the merchant action; the exact/program identity is therefore decision-relevant.",
  },
  {
    caseId: "batch_settlement",
    file: "Nov_2024_Statement.pdf",
    businessType: "restaurant_food_beverage",
    labelIncludes: "BATCH SETTLEMENT FEE",
    decision: "SUPPRESS_RESEARCH",
    d1D4SufficientForMerchantConclusion: true,
    exactIdentityMateriallyChangesConclusion: false,
    statementKnowledge: [
      "the label directly identifies a batch-settlement charge",
      "the printed row exposes a per-transaction unit and population",
      "printed arithmetic reproduces",
      "the row is presented under Other on the processor statement",
    ],
    governedKnowledge: [
      "Batch 2 supports the F6 acquiring-side batch/per-item family",
      "the acquiring-side program controls the merchant-facing price without proving ultimate retention",
      "commercial review and operational batch validation are already allowed without the merchant agreement",
    ],
    unresolvedAfterE1: ["ultimate beneficiary/retention", "merchant-specific contractual compliance"],
    merchantConclusion: "Validate the billed batch population, review operational batch frequency, and request an acquiring-side price review.",
    rationale: "The unresolved exact identity and beneficiary do not change the supported mechanic, acquiring-side price-control conclusion, or action.",
  },
  {
    caseId: "application_fee_generic",
    file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
    businessType: "other",
    labelIncludes: "APPLICATION FEE",
    decision: "SUPPRESS_RESEARCH",
    d1D4SufficientForMerchantConclusion: true,
    exactIdentityMateriallyChangesConclusion: false,
    statementKnowledge: [
      "the row is explicitly labeled Application Fee",
      "the statement places it in the Account Fees section",
      "it is a single current-period account charge collected on the processor statement",
    ],
    governedKnowledge: [
      "collection does not establish beneficiary or retention",
      "an explanation, reduction, or waiver review can be requested without a merchant agreement",
      "contractual compliance remains document-dependent",
    ],
    unresolvedAfterE1: ["exact beneficiary/retention", "whether the fee is contractually authorized", "whether it will recur"],
    merchantConclusion: "Treat it as a processor-presented account/application charge and request explanation plus reduction or waiver review; obtain the agreement only for a contractual conclusion.",
    rationale: "The ordinary-language label and Account Fees placement support the useful category and action; public web research is not needed merely to restate that conclusion.",
  },
  {
    caseId: "amexct043_nqual_coded",
    file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
    businessType: "ecommerce",
    labelIncludes: "AMEXCT043 - NQUAL DISC",
    decision: "SUPPRESS_RESEARCH",
    d1D4SufficientForMerchantConclusion: true,
    exactIdentityMateriallyChangesConclusion: false,
    statementKnowledge: [
      "AMEXCT043 is the statement card-type section and NQUAL DISC is the fee label",
      "the row exposes a rate-times-volume mechanic and population",
      "the NQUAL pricing ladder recurs across card-type sections",
    ],
    governedKnowledge: [
      "Batch 1 supports F5 bundled merchant-facing pricing",
      "the acquiring-side program sets and controls the merchant-facing price without proving retention",
      "itemization and commercial review are already supported without the merchant agreement",
    ],
    unresolvedAfterE1: ["component allocation inside the bundled price", "ultimate beneficiary/retention", "merchant-specific contractual compliance"],
    merchantConclusion: "Request itemization and commercial review of the bundled NQUAL price while preserving the unresolved component allocation.",
    rationale: "The code is a section/card-type token rather than a missing fee identity; exact component decomposition is not required for the existing commercial action.",
  },
  {
    caseId: "cpu_gateway_stage0_control",
    file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
    businessType: "ecommerce",
    labelIncludes: "CPU GTWY",
    decision: "SUPPRESS_RESEARCH",
    d1D4SufficientForMerchantConclusion: true,
    exactIdentityMateriallyChangesConclusion: false,
    statementKnowledge: ["the row is in AUTHS & AVS and exposes an event count and per-event rate"],
    governedKnowledge: [
      "Batch 2 supports a technology/gateway commercial family and authorization/access-event population",
      "the acquiring-side price can be reviewed without establishing the exact provider",
    ],
    unresolvedAfterE1: ["exact gateway/provider", "ultimate beneficiary/retention"],
    merchantConclusion: "Validate usage and ask the processor or vendor to explain, reduce, or remove the charge.",
    rationale: "This is the determinant-sufficient zero-operation control.",
  },
];

type LoadedCase = Awaited<ReturnType<typeof loadCase>>;
type SafeUsage = ReturnType<typeof openAiResponsesSafeUsage>;

export function buildMonthlyAdvantageManualPlanV1(automatedPlan: UnknownFeeResearchPlanV1): UnknownFeeResearchPlanV1 {
  const plan = structuredClone(automatedPlan);
  plan.queryShapes = [
    {
      shapeId: "manual_01_payment_processing",
      kind: "EXACT_QUOTED_LABEL",
      query: "\"Monthly Advantage Fee\" payment processing",
      hypothesis: "The exact fee phrase is used in payment-processing material.",
      documentGenres: ["payment_processing_document"],
      distinctFromPriorBy: ["industry_context"],
    },
    {
      shapeId: "manual_02_mcvdb",
      kind: "CODE_PROCESSOR_DOCUMENT_GENRE",
      query: "\"Monthly Advantage Fee\" MCVDB",
      hypothesis: "MCVDB is associated with the exact fee phrase.",
      documentGenres: ["exact_document", "merchant_statement", "merchant_application"],
      distinctFromPriorBy: ["statement_code_mcvdb"],
    },
    {
      shapeId: "manual_03_amds",
      kind: "CODE_PROCESSOR_DOCUMENT_GENRE",
      query: "\"Monthly Advantage Fee\" AMDS",
      hypothesis: "AMDS is a competing program/code association for the exact fee phrase.",
      documentGenres: ["exact_document", "merchant_statement", "merchant_application"],
      distinctFromPriorBy: ["candidate_code_amds"],
    },
    {
      shapeId: "manual_04_statement_identity_application",
      kind: "PROCESSOR_MERCHANT_APPLICATION",
      query: "\"Monthly Advantage Fee\" \"merchant application\" \"Clover\" \"First Data\"",
      hypothesis: "The statement-derived Clover / A First Data Company identity appears with the fee in a merchant application.",
      documentGenres: ["processor_or_iso_merchant_application"],
      distinctFromPriorBy: ["statement_derived_processor_identity", "document_genre"],
    },
  ];
  return plan;
}

export async function runUnknownFeeResearchDiagnosisE1E2V1(input: { authorization: string | null; apiKey?: string }) {
  if (input.authorization !== AUTHORIZATION) throw new Error("exact_product_authorization_required");
  const prior = JSON.parse(await readFile(PRIOR_EVALUATION_PATH, "utf8"));
  const loadedByFile = new Map<string, Awaited<ReturnType<typeof loadStatement>>>();
  const loadedCases: LoadedCase[] = [];
  for (const adjudication of E1_ADJUDICATIONS) {
    const statement = loadedByFile.get(adjudication.file) ?? await loadStatement(adjudication.file, adjudication.businessType);
    loadedByFile.set(adjudication.file, statement);
    loadedCases.push(loadCase(statement, adjudication, prior));
  }

  const monthly = loadedCases.find((item) => item.caseId === "monthly_advantage");
  if (!monthly || monthly.e1Decision !== "RESEARCH_WARRANTED") throw new Error("e1_did_not_select_a_research_case");
  if (monthly.currentPlan.stage0.decision !== "RESEARCH") throw new Error("monthly_automated_plan_not_researchable");

  const apiKey = input.apiKey ?? await readKeychainCredential(OPENAI_KEYCHAIN_SERVICE);
  if (!apiKey) throw new Error("openai_credential_unavailable");
  const armA = await runArm("A_CURRENT_AUTOMATED", monthly.currentPlan, apiKey);
  const armB = await runArm("B_PRODUCT_MANUAL", buildMonthlyAdvantageManualPlanV1(monthly.currentPlan), apiKey);

  const canonicalAfter = new Map<string, string>();
  for (const [file, statement] of loadedByFile) canonicalAfter.set(file, canonicalFinancialTruthFingerprint(statement.analysis));
  const usefulA = new Set(armA.result.sources.filter((source) => source.evidenceUseful).map((source) => source.url));
  const usefulB = new Set(armB.result.sources.filter((source) => source.evidenceUseful).map((source) => source.url));
  const allA = new Set(armA.discovery.flatMap((item) => item.candidates.map((candidate) => candidate.url)));
  const allB = new Set(armB.discovery.flatMap((item) => item.candidates.map((candidate) => candidate.url)));

  return {
    schemaVersion: "unknown_fee_research_diagnosis_e1_e2_2026_09_08_v1",
    evaluationOnly: true,
    baseline: { branch: "codex/unknown-fee-research-calibration-retrieval-strategy-v1", commit: BASELINE_COMMIT },
    constraints: {
      newKnowledgeAdmitted: false,
      runtimeTriageRulesChanged: false,
      curatedSourceLibraryBuilt: false,
      retrievalMemoryBuilt: false,
      processorPackBuilt: false,
      model: MODEL,
      store: false,
      automaticRetries: 0,
      fallbackProvidersAllowed: false,
      perArmBudget: { maximumSearches: 4, maximumDocumentFetches: 3, maximumSynthesisCalls: 1, maximumExternalOperations: 8 },
      externallySentFields: ["processor_name", "statement_year", "statement_role", "sanitized_fee_label", "amount_free_query_hypothesis_or_mechanic", "document_genre", "retrieved_public_source_excerpt"],
      prohibitedFieldsSent: false,
    },
    e1: {
      decisions: loadedCases.map((item) => item.e1Projection),
      priorResearchCallsSuppressed: loadedCases.filter((item) => item.e1Decision === "SUPPRESS_RESEARCH" && item.priorResearchOperations > 0).map((item) => item.caseId),
      suppressionsWithQualityLoss: loadedCases.filter((item) => item.e1Decision === "SUPPRESS_RESEARCH" && Object.values(item.suppressionLoss).some(Boolean)).map((item) => item.caseId),
      diagnosis: "The prior Stage-0 gate overweights unresolved exact identity/D2 fields even when governed layer, price control, printed mechanics, and a useful merchant action are already available.",
    },
    e2: {
      selectedCase: monthly.caseId,
      selectionReason: E1_ADJUDICATIONS.find((item) => item.caseId === monthly.caseId)?.rationale,
      armA,
      armB,
      comparison: {
        discoveredUrlOverlap: intersection(allA, allB),
        usefulDocumentOverlap: intersection(usefulA, usefulB),
        sameUsefulDocumentsDiscovered: sameSet(usefulA, usefulB),
        armAUsefulSourceCount: usefulA.size,
        armBUsefulSourceCount: usefulB.size,
      },
    },
    invariants: {
      perStatement: [...loadedByFile.entries()].map(([file, statement]) => ({
        file,
        beforeFingerprint: statement.beforeFingerprint,
        afterFingerprint: canonicalAfter.get(file),
        unchanged: statement.beforeFingerprint === canonicalAfter.get(file),
      })),
      allCanonicalFinancialFingerprintsUnchanged: [...loadedByFile.entries()].every(([file, statement]) => statement.beforeFingerprint === canonicalAfter.get(file)),
      governedD1D4MutatedByE2: false,
      governedConfidenceMutatedByE2: false,
      governedKnowledgeMutated: false,
      reusableKnowledgeSelfAdmitted: false,
    },
  };
}

async function runArm(arm: "A_CURRENT_AUTOMATED" | "B_PRODUCT_MANUAL", plan: UnknownFeeResearchPlanV1, apiKey: string) {
  const usage: SafeUsage[] = [];
  const discovery: Array<{ shapeId: string; exactQueryShape: string; candidates: CalibratedResearchDiscoveryCandidateV1[] }> = [];
  const retrieval: Array<{ url: string; status: RetrievedDocument["status"]; reasonCodes: string[]; boundedPublicExcerpt: string | null }> = [];
  const adapters = liveAdapters(apiKey, usage, discovery, retrieval);
  const result = await runCalibratedUnknownFeeResearchV1({ plan, adapters });
  return {
    arm,
    queryShapes: plan.queryShapes.map((shape) => ({ shapeId: shape.shapeId, kind: shape.kind, exactQuery: shape.query, hypothesis: shape.hypothesis, documentGenres: shape.documentGenres })),
    discovery,
    retrieval,
    result,
    operationCounts: {
      searches: result.operations.filter((item) => item.type === "search").length,
      documentFetches: result.operations.filter((item) => item.type === "document_fetch").length,
      syntheses: result.operations.filter((item) => item.type === "candidate_synthesis").length,
      totalExternalOperations: result.operations.length,
      providerRequests: usage.length,
      providerInternalWebSearchCalls: usage.reduce((sum, item) => sum + item.webSearchToolCalls, 0),
    },
    providerAccounting: {
      requestIds: usage.map((item) => item.requestId).filter((item): item is string => Boolean(item)),
      inputTokens: sumUsage(usage, "inputTokens"),
      outputTokens: sumUsage(usage, "outputTokens"),
    },
  };
}

function liveAdapters(
  apiKey: string,
  usage: SafeUsage[],
  discovery: Array<{ shapeId: string; exactQueryShape: string; candidates: CalibratedResearchDiscoveryCandidateV1[] }>,
  retrieval: Array<{ url: string; status: RetrievedDocument["status"]; reasonCodes: string[]; boundedPublicExcerpt: string | null }>,
) {
  return {
    search: async ({ plan, shape, maximumCandidates }: { plan: UnknownFeeResearchPlanV1; shape: UnknownFeeResearchPlanV1["queryShapes"][number]; maximumCandidates: 2 }, context: { abortSignal: AbortSignal }) => {
      const raw = await openAiRequest(apiKey, {
        model: MODEL,
        store: false,
        input: [
          "Execute the supplied bounded query shape against public sources for a payment-processing fee. Prefer the requested document genres. Return no more than two source candidates. Similar wording is a retrieval lead only, not identity evidence.",
          JSON.stringify({
            processorName: plan.labelFeatures.processorName,
            statementYear: plan.labelFeatures.statementYear,
            statementRole: plan.labelFeatures.statementRole,
            sanitizedFeeLabel: sanitize(plan.labelFeatures.distinctivePhrase),
            amountFreeQueryHypothesisOrMechanic: sanitize(shape.query),
            documentGenre: shape.documentGenres,
          }),
        ].join("\n"),
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        reasoning: { effort: "low" },
        max_output_tokens: 1_500,
        max_tool_calls: 1,
      }, context.abortSignal, usage);
      const candidates = extractDiscoveryCandidates(raw).slice(0, maximumCandidates);
      discovery.push({ shapeId: shape.shapeId, exactQueryShape: shape.query, candidates });
      return candidates;
    },
    retrieve: async (candidate: CalibratedResearchDiscoveryCandidateV1, context: { abortSignal: AbortSignal }) => {
      const document = await retrieveFeeKnowledgeDocument(candidate.url, { abortSignal: context.abortSignal });
      retrieval.push({
        url: candidate.url,
        status: document.status,
        reasonCodes: document.reasonCodes,
        boundedPublicExcerpt: document.status === "retrieved_text" ? boundedExcerpt(document.text) : null,
      });
      return document;
    },
    synthesize: async ({ plan, evidence }: { plan: UnknownFeeResearchPlanV1; evidence: Array<{ url: string; title: string | null; publisher: string | null; lane: string; boundedExcerpt: string }> }, context: { abortSignal: AbortSignal }) => {
      const raw = await openAiRequest(apiKey, {
        model: MODEL,
        store: false,
        input: [
          "Assess only provisional D1-D4 improvements from these public excerpts. Preserve competing interpretations. Do not create facts, infer contract terms, strengthen governed confidence, or admit knowledge. Return JSON only.",
          JSON.stringify({
            processorName: plan.labelFeatures.processorName,
            statementYear: plan.labelFeatures.statementYear,
            statementRole: plan.labelFeatures.statementRole,
            sanitizedFeeLabel: sanitize(plan.labelFeatures.distinctivePhrase),
            retrievedPublicSourceExcerpts: evidence,
            responseSchema: {
              candidateInterpretations: [{ claim: "string", affectedDeterminants: ["D1|D2|D3|D4"], confidence: "low|medium|high", competingInterpretation: "string|null", sourceUrls: ["string"] }],
              determinantLift: ["D1|D2|D3|D4"],
              actionLift: "boolean",
              evidenceTierImproved: "boolean",
            },
          }),
        ].join("\n"),
        reasoning: { effort: "low" },
        max_output_tokens: 1_800,
      }, context.abortSignal, usage);
      return parseSynthesis(outputText(raw));
    },
  };
}

async function loadStatement(file: string, businessType: BusinessTypeId) {
  const parsed = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(parsed, { sourceFileName: file, businessType });
  return {
    parsed,
    analysis,
    report: buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT }),
    beforeFingerprint: canonicalFinancialTruthFingerprint(analysis),
  };
}

function loadCase(statement: Awaited<ReturnType<typeof loadStatement>>, adjudication: E1Adjudication, prior: any) {
  const row = statement.analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(adjudication.labelIncludes));
  if (!row) throw new Error(`diagnostic_row_missing:${adjudication.caseId}`);
  const finding = statement.report.findings.find((item) => item.sourceFeeRowId === row.id);
  if (!finding?.openWorldDeterminants) throw new Error(`diagnostic_finding_missing:${adjudication.caseId}`);
  const queued = [...statement.report.researchQueue.selected, ...statement.report.researchQueue.deferred].find((item) => item.question.feeRowRef === row.id);
  const currentPlan = queued?.calibration ?? buildUnknownFeeResearchPlanV1({
    feeRowId: row.id,
    printedLabel: row.selectedLabel,
    processorName: statement.analysis.identity.processorName.value ?? statement.analysis.identity.processorFamily.value,
    statementYear: statement.analysis.identity.statementPeriod.value?.start?.slice(0, 4) ?? null,
    statementRole: row.role,
    determinant: finding.openWorldDeterminants,
  });
  const priorCase = prior.cases.find((item: any) => item.caseId === adjudication.caseId);
  const priorResearchOperations = priorCase?.operations?.length ?? 0;
  const priorDeterminantLift = priorCase?.provisionalSynthesis?.determinantLift ?? [];
  const priorActionLift = priorCase?.provisionalSynthesis?.actionLift === true;
  const priorEvidenceTierLift = priorCase?.provisionalSynthesis?.evidenceTierImproved === true;
  const priorGovernedChange = priorCase?.governedD1D4Changed === true;
  const priorConfidenceChange = priorCase?.governedConfidenceChanged === true;
  const suppressionLoss = {
    determinantQuality: priorDeterminantLift.length > 0 || priorGovernedChange,
    actionability: priorActionLift,
    commercialUsefulness: priorActionLift || priorEvidenceTierLift,
    confidenceDiscipline: priorConfidenceChange,
    merchantFacingRecommendation: priorActionLift || priorGovernedChange,
  };
  return {
    caseId: adjudication.caseId,
    e1Decision: adjudication.decision,
    currentPlan,
    priorResearchOperations,
    suppressionLoss,
    e1Projection: {
      caseId: adjudication.caseId,
      file: adjudication.file,
      printedLabel: row.selectedLabel,
      priorStage0Decision: currentPlan.stage0.decision,
      e1Decision: adjudication.decision,
      d1D4SufficientForMerchantConclusion: adjudication.d1D4SufficientForMerchantConclusion,
      exactIdentityMateriallyChangesConclusion: adjudication.exactIdentityMateriallyChangesConclusion,
      statementKnowledge: adjudication.statementKnowledge,
      governedKnowledge: adjudication.governedKnowledge,
      unresolvedAfterE1: adjudication.unresolvedAfterE1,
      merchantConclusion: adjudication.merchantConclusion,
      rationale: adjudication.rationale,
      currentDeterminantProjection: {
        exactIdentity: finding.openWorldDeterminants.exactIdentity,
        family: finding.openWorldDeterminants.family,
        d1: finding.openWorldDeterminants.d1EconomicLayerAndControl,
        d2: finding.openWorldDeterminants.d2MechanicAndPopulation,
        d3: finding.openWorldDeterminants.d3Materiality,
        d4: finding.openWorldDeterminants.d4Actionability,
        sufficiency: finding.openWorldDeterminants.determinantSufficiency,
      },
      analystFindingProjection: {
        category: finding.broaderEconomicCategory,
        mechanic: finding.assessmentUnitOrMechanic,
        population: finding.relevantPopulationOrBase,
        arithmetic: finding.printedArithmeticCorrectness,
        action: finding.practicalMerchantAction,
      },
      priorResearch: {
        operations: priorResearchOperations,
        stoppingDecision: priorCase?.stoppingDecision ?? null,
        determinantLift: priorDeterminantLift,
        actionLift: priorActionLift,
        evidenceTierImproved: priorEvidenceTierLift,
        governedD1D4Changed: priorGovernedChange,
        governedConfidenceChanged: priorConfidenceChange,
      },
      suppressionLoss,
    },
  };
}

async function openAiRequest(apiKey: string, body: Record<string, unknown>, signal: AbortSignal, usage: SafeUsage[]) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.json().catch(() => null);
  usage.push(openAiResponsesSafeUsage(raw));
  if (!response.ok) throw new Error(`diagnostic_openai_http_${response.status}`);
  return raw;
}

function sanitize(value: string) {
  return value.replace(/\$\s*\d[\d,.]*/g, "[amount withheld]").replace(/\b\d+(?:\.\d+)?\b/g, "[numeric term withheld]").replace(/\s+/g, " ").trim();
}

function boundedExcerpt(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 2_000);
}

function parseSynthesis(value: string): CalibratedResearchSynthesisV1 {
  const parsed = JSON.parse(value) as Partial<CalibratedResearchSynthesisV1>;
  const allowed = new Set(["D1", "D2", "D3", "D4"]);
  return {
    candidateInterpretations: (Array.isArray(parsed.candidateInterpretations) ? parsed.candidateInterpretations : []).slice(0, 3).flatMap((item) => item && typeof item.claim === "string" ? [{
      claim: item.claim,
      affectedDeterminants: Array.isArray(item.affectedDeterminants) ? item.affectedDeterminants.filter((entry): entry is "D1" | "D2" | "D3" | "D4" => allowed.has(entry)) : [],
      confidence: item.confidence === "medium" || item.confidence === "high" ? item.confidence : "low",
      competingInterpretation: typeof item.competingInterpretation === "string" ? item.competingInterpretation : null,
      sourceUrls: Array.isArray(item.sourceUrls) ? item.sourceUrls.filter((entry): entry is string => typeof entry === "string").slice(0, 3) : [],
    }] : []),
    determinantLift: Array.isArray(parsed.determinantLift) ? parsed.determinantLift.filter((entry): entry is "D1" | "D2" | "D3" | "D4" => allowed.has(entry)) : [],
    actionLift: parsed.actionLift === true,
    evidenceTierImproved: parsed.evidenceTierImproved === true,
  };
}

function outputText(raw: unknown) {
  const root = asRecord(raw);
  return (Array.isArray(root?.output) ? root.output : []).flatMap((item) => (Array.isArray(asRecord(item)?.content) ? asRecord(item)!.content : []).flatMap((part: unknown) => {
    const value = asRecord(part);
    return value?.type === "output_text" && typeof value.text === "string" ? [value.text] : [];
  })).join("\n");
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function sumUsage(usage: SafeUsage[], field: "inputTokens" | "outputTokens") {
  const values = usage.map((item) => item[field]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function intersection(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => right.has(value)).sort();
}

function sameSet(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

async function readKeychainCredential(service: string) {
  const { stdout } = await execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], { encoding: "utf8", maxBuffer: 16_384, timeout: 120_000 });
  return stdout.replace(/[\r\n]+$/, "");
}

async function main() {
  const authorization = process.argv.find((argument) => argument.startsWith("--authorization="))?.slice("--authorization=".length) ?? null;
  const result = await runUnknownFeeResearchDiagnosisE1E2V1({ authorization });
  await mkdir("evaluations/unknown-fee-research-diagnosis-e1-e2-v1", { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => {
  process.stderr.write(`Unknown-fee E1/E2 diagnosis failed safely: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
