import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  extractDiscoveryCandidates,
  openAiResponsesSafeUsage,
  runFeeKnowledgeResearch,
  FeeKnowledgeSearchProviderError,
  type FeeKnowledgeResearchResult,
  type FeeKnowledgeSearchAdapter,
} from "../src/canonical/feeKnowledgeResearch.js";
import {
  parseInvestigativeProviderOutput,
  type FeeKnowledgeInvestigativeIntelligenceAdapter,
} from "../src/canonical/feeKnowledgeInvestigativeIntelligence.js";
import type { FeeKnowledgeIntelligenceRecord } from "../src/canonical/feeKnowledgeTypes.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFinding,
  type InternalAnalystResearchContribution,
} from "../src/canonical/internalAnalystFindingV1.js";
import type { OpenWorldFeeDeterminant } from "../src/canonical/governedOpenWorldDeterminantV1.js";
import { parsePdf } from "../src/parser.js";

const execFile = promisify(execFileCallback);
const AUTHORIZATION = "product-approved-open-world-live-research";
const OPENAI_KEYCHAIN_SERVICE = "RateReveal/OpenAI";
const MODEL = "gpt-5.6-sol";
const MAX_QUESTIONS = 2;
const MAX_CANDIDATES_PER_QUESTION = 2;
const RESEARCH_TIMEOUT_MS = 660_000;
const PROFILE = Object.freeze({
  safeStatementId: "fsv-gold-nov-2024",
  statementPath: "test/fixtures/pdfs/Nov_2024_Statement.pdf",
  businessType: "restaurant_food_beverage" as BusinessTypeId,
  targetPrintedLabels: [
    "Other - MONTHLY ADVANTAGE FEE MCVDB 0.0003 TIMES $47996.83",
    "Other - BATCH SETTLEMENT FEE 56 TRANSACTIONS AT 0.15",
  ],
});
const US_CONTEXT = {
  geography: {
    value: "us",
    evidenceClass: "statement_local" as const,
    evidenceRefs: ["supported_fiserv_us_scope"],
  },
};
type OpenAiResponsesSafeUsage = ReturnType<typeof openAiResponsesSafeUsage>;

export type OpenWorldLiveResearchEvaluationV1 = ReturnType<typeof buildEvaluationResult>;

export async function runOpenWorldLiveResearchEvaluationV1(input: {
  authorization: string | null;
  apiKey?: string;
}) {
  if (input.authorization !== AUTHORIZATION) throw new Error("exact_product_authorization_required");
  const apiKey = input.apiKey ?? await readKeychainCredential(OPENAI_KEYCHAIN_SERVICE);
  if (!apiKey) throw new Error("openai_credential_unavailable");

  const document = await parsePdf(PROFILE.statementPath);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: PROFILE.statementPath.split("/").at(-1)!,
    businessType: PROFILE.businessType,
  });
  const beforeFingerprint = canonicalFinancialTruthFingerprint(analysis);
  const beforeReport = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  const targetQueueItems = PROFILE.targetPrintedLabels.map((printedLabel) => {
    const row = analysis.feeLedger.rows.find((item) => item.selectedLabel === printedLabel);
    if (!row) throw new Error(`approved_target_row_missing:${printedLabel}`);
    const queueItem = beforeReport.researchQueue.selected.find((item) => item.question.feeRowRef === row.id);
    if (!queueItem) throw new Error(`approved_target_not_selected_for_bounded_research:${printedLabel}`);
    const finding = findingFor(beforeReport.findings, row.id);
    if (finding.openWorldDeterminants?.research.disposition !== "ESCALATE_BOUNDED_RESEARCH") {
      throw new Error(`approved_target_did_not_reach_research_stage:${printedLabel}`);
    }
    return {
      row,
      finding,
      question: {
        ...queueItem.question,
        feeLabel: sanitizeAuthorizedFeeLabel(printedLabel),
      },
    };
  });
  if (targetQueueItems.length > MAX_QUESTIONS) throw new Error("live_research_question_cap_exceeded");

  const usage: OpenAiResponsesSafeUsage[] = [];
  const research = await runFeeKnowledgeResearch({
    analysis,
    questions: targetQueueItems.map((item) => item.question),
    options: {
      enabled: true,
      openAiApiKey: apiKey,
      openAiModelName: MODEL,
      timeoutMs: RESEARCH_TIMEOUT_MS,
      adapter: restrictedAuthorizedSearchAdapter(apiKey, usage),
      semanticSupportAdapter: async (request) => ({
        type: "fee_knowledge_semantic_support_decision",
        policyVersion: "fee_knowledge_claim_support_v1",
        decision: "unsupported",
        structuredClaim: request.structuredClaim,
        reasonCodes: ["live_evaluation_semantic_provider_not_authorized"],
        providerDetailsStripped: true,
      }),
      investigativeIntelligence: {
        enabled: true,
        adapter: restrictedAuthorizedInvestigativeAdapter(apiKey, usage),
      },
    },
  });
  const candidateContributions = candidateOnlyContributions(research, targetQueueItems.map((item) => item.row.id));
  const afterReport = buildInternalAnalystFindingV1({
    analysis,
    statementContext: US_CONTEXT,
    researchContributions: candidateContributions,
  });
  const afterFingerprint = canonicalFinancialTruthFingerprint(analysis);
  const evaluation = buildEvaluationResult({
    beforeFingerprint,
    afterFingerprint,
    beforeReport,
    afterReport,
    targetQueueItems,
    research,
    candidateContributions,
    usage,
  });
  return evaluation;
}

export function candidateOnlyContributions(
  research: FeeKnowledgeResearchResult,
  feeRowIds: readonly string[],
): InternalAnalystResearchContribution[] {
  return feeRowIds.flatMap((feeRowId) => {
    const intelligence = research.intelligence.filter((item) =>
      item.feeRowRef === feeRowId && item.reasonCodes.includes("fee_knowledge_ai_investigative_intelligence"));
    if (intelligence.length === 0) return [];
    const sourceRefs = [...new Set(intelligence.flatMap((item) => item.basis.candidateRefs))];
    return [{
      contributionId: `live_candidate_${feeRowId}`,
      targetFeeRowId: feeRowId,
      status: "candidate_only" as const,
      reviewedAt: null,
      admission: null,
      evidenceClasses: ["E6_ai_hypothesis" as const, ...(sourceRefs.length > 0 ? ["E7_public_research" as const] : [])],
      sourceRefs,
      aiAssisted: true,
      claims: {},
      interpretation: intelligence.map((item) => item.summary).join(" | "),
      limitations: [
        "Live AI/web research is provisional and cannot alter canonical facts or governed D1-D4 conclusions.",
        "Reusable knowledge admission requires separate Product/domain review.",
      ],
    }];
  });
}

function buildEvaluationResult(input: {
  beforeFingerprint: string;
  afterFingerprint: string;
  beforeReport: ReturnType<typeof buildInternalAnalystFindingV1>;
  afterReport: ReturnType<typeof buildInternalAnalystFindingV1>;
  targetQueueItems: Array<{
    row: { id: string; selectedLabel: string; selectedAmount?: { amountMinor: number } | null };
    finding: InternalAnalystFinding;
    question: { feeRowRef: string; semanticQuestion: string };
  }>;
  research: FeeKnowledgeResearchResult;
  candidateContributions: InternalAnalystResearchContribution[];
  usage: OpenAiResponsesSafeUsage[];
}) {
  const rows = input.targetQueueItems.map((target) => {
    const before = target.finding.openWorldDeterminants!;
    const afterFinding = findingFor(input.afterReport.findings, target.row.id);
    const after = afterFinding.openWorldDeterminants!;
    const intelligence = input.research.intelligence.filter((item) => item.feeRowRef === target.row.id);
    const aiIntelligence = intelligence.filter((item) => item.reasonCodes.includes("fee_knowledge_ai_investigative_intelligence"));
    const candidates = input.research.candidates.filter((item) => item.feeRowRef === target.row.id);
    const supports = input.research.claimSupports.filter((item) => item.feeRowRef === target.row.id);
    return {
      printedLabel: target.row.selectedLabel,
      amountMinor: target.row.selectedAmount?.amountMinor ?? null,
      trigger: {
        disposition: before.research.disposition,
        question: target.question.semanticQuestion,
      },
      sourcesFound: candidates.map((candidate) => ({
        title: candidate.title,
        publisher: candidate.publisher,
        canonicalUrl: candidate.canonicalUrl,
        retrievalStatus: candidate.retrievalStatus,
        semanticVerificationStatus: candidate.semanticVerificationStatus,
        verificationStatus: candidate.verificationStatus,
        applicability: candidate.safeApplicability,
        reasonCodes: candidate.reasonCodes,
      })),
      provisionalResearch: {
        interpretations: aiIntelligence.map(intelligenceProjection),
        claimSupports: supports.map((support) => ({
          sourceId: support.sourceId,
          candidateId: support.candidateId,
          claim: support.structuredClaim,
          semanticDecision: support.semanticSupport.decision,
          evidenceDecision: support.evidenceDecision,
          confidence: support.confidence,
          applicability: support.applicability,
          contradictions: support.contradictions,
          exclusions: support.exclusions,
        })),
        candidateD1Lead: aiIntelligence.some((item) => ["fee_meaning", "fee_alias", "fee_ownership", "processor_vs_network", "markup_hypothesis"].includes(item.subject)),
        candidateD2Lead: aiIntelligence.some((item) => ["published_rate", "applicability_condition"].includes(item.subject)),
        d3Changed: false,
        candidateD4Lead: aiIntelligence.some((item) => ["negotiability", "anomaly", "markup_hypothesis"].includes(item.subject)),
      },
      governedBefore: determinantProjection(before),
      governedAfter: determinantProjection(after),
      governedD1D4Changed: JSON.stringify(determinantProjection(before)) !== JSON.stringify(determinantProjection(after)),
      governedConfidenceChanged: JSON.stringify(confidenceProjection(target.finding)) !== JSON.stringify(confidenceProjection(afterFinding)),
      candidateInterpretationAddedToAnalystFinding: afterFinding.competingInterpretations.some((item) => item.source === "research"),
    };
  });
  const requestIds = input.usage.map((item) => item.requestId).filter((item): item is string => Boolean(item));
  return {
    schemaVersion: "open_world_live_research_evaluation_v1",
    evaluationOnly: true,
    customerFacingAuthority: "none",
    executionProfile: {
      approvedStatement: PROFILE.safeStatementId,
      statementPath: PROFILE.statementPath,
      model: MODEL,
      maximumQuestions: MAX_QUESTIONS,
      maximumCandidatesPerQuestion: MAX_CANDIDATES_PER_QUESTION,
      automaticRetries: 0,
      fallbackProvidersAllowed: false,
      wholeStatementAiReview: false,
      selfAdmissionAllowed: false,
      providerPayloadFields: ["processor_name", "statement_year", "statement_role", "sanitized_printed_fee_label", "retrieved_public_source_excerpt"],
      canonicalFinancialAmountsSent: false,
      store: false,
    },
    researchAttempts: input.research.attempts,
    fees: rows,
    providerAccounting: {
      callsWithUsageReceipts: input.usage.length,
      requestIds,
      inputTokens: sumUsage(input.usage, "inputTokens"),
      cachedInputTokens: sumUsage(input.usage, "cachedInputTokens"),
      outputTokens: sumUsage(input.usage, "outputTokens"),
      webSearchToolCalls: input.usage.reduce((sum, item) => sum + item.webSearchToolCalls, 0),
    },
    safety: {
      candidateOnlyContributions: input.candidateContributions.length,
      admittedResearchResolutionsBefore: input.beforeReport.coverage.admittedResearchResolutions,
      admittedResearchResolutionsAfter: input.afterReport.coverage.admittedResearchResolutions,
      reusableKnowledgeSelfAdmitted: false,
      authorityFingerprintUnchanged: input.beforeReport.knowledgeAuthority.authorityFingerprint === input.afterReport.knowledgeAuthority.authorityFingerprint,
      canonicalBeforeFingerprint: input.beforeFingerprint,
      canonicalAfterFingerprint: input.afterFingerprint,
      reportAfterFingerprint: input.afterReport.canonicalFinancialTruth.afterFingerprint,
      canonicalFinancialFingerprintUnchanged:
        input.beforeFingerprint === input.afterFingerprint &&
        input.beforeFingerprint === input.beforeReport.canonicalFinancialTruth.beforeFingerprint &&
        input.beforeFingerprint === input.afterReport.canonicalFinancialTruth.afterFingerprint,
      governedD1D4ChangedRows: rows.filter((row) => row.governedD1D4Changed).length,
      governedConfidenceChangedRows: rows.filter((row) => row.governedConfidenceChanged).length,
    },
  };
}

function restrictedAuthorizedSearchAdapter(
  apiKey: string,
  usage: OpenAiResponsesSafeUsage[],
): FeeKnowledgeSearchAdapter {
  return async (request, context) => {
    if (request.questions.length !== 1) throw new Error("restricted_live_search_requires_one_question");
    const question = request.questions[0]!;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: context.abortSignal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        input: [
          "Find up to two authoritative public sources that may clarify this payment-processing fee. Treat results as provisional research only. Do not infer merchant-specific facts or contract terms.",
          JSON.stringify(authorizedQuestionPayload(question)),
        ].join("\n"),
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        reasoning: { effort: "low" },
        max_output_tokens: 1_600,
        max_tool_calls: 1,
      }),
    });
    const raw = await response.json().catch(() => null);
    usage.push(openAiResponsesSafeUsage(raw));
    if (!response.ok) throw new FeeKnowledgeSearchProviderError("failed", `restricted_live_web_search_http_${response.status}`);
    return extractDiscoveryCandidates(raw).slice(0, MAX_CANDIDATES_PER_QUESTION);
  };
}

function restrictedAuthorizedInvestigativeAdapter(
  apiKey: string,
  usage: OpenAiResponsesSafeUsage[],
): FeeKnowledgeInvestigativeIntelligenceAdapter {
  return async (request, context) => {
    const questions = request.questions.map((question) => ({
      ...authorizedQuestionPayload(question),
      retrievedPublicSourceExcerpts: request.candidate
        ? authorizedPublicExcerpts(request.candidate.retrieved.text, request.candidate.retrieved.locators)
        : [],
    }));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: context.abortSignal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        input: [
          "Propose provisional payment-industry interpretations for the supplied fee labels and public excerpts. Keep exact identity, economic category/layer/control, mechanic/population, and action implications separate. Preserve competing interpretations and uncertainty. Do not claim verification, invent sources, infer merchant facts, or state contract compliance. Return JSON only: {\"findings\":[{\"feeLabel\":string,\"state\":\"ai_hypothesis\"|\"investigation_lead\"|\"unresolved_review_needed\",\"subject\":\"fee_meaning\"|\"fee_alias\"|\"fee_ownership\"|\"processor_vs_network\"|\"published_rate\"|\"applicability_condition\"|\"markup_hypothesis\"|\"anomaly\"|\"negotiability\"|\"investigation_question\"|\"source_relevance\"|\"conflict\",\"summary\":string,\"reasonCodes\":string[],\"confidence\":\"low\"|\"medium\"|\"high\",\"actionabilityCeiling\":\"unknown\"|\"verify_only\"|\"informational\",\"merchantActionability\":\"internal_only\"|\"human_review_only\",\"proofRequirement\":\"external_verification_required\"|\"human_review_required\"}]}.",
          JSON.stringify({ questions }),
        ].join("\n"),
        reasoning: { effort: "low" },
        max_output_tokens: 1_800,
      }),
    });
    const raw = await response.json().catch(() => null);
    usage.push(openAiResponsesSafeUsage(raw));
    if (!response.ok) throw new Error(`restricted_live_investigative_http_${response.status}`);
    const parsed = parseJsonObject(outputText(raw));
    const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
    const augmented = findings.flatMap((finding) => {
      const item = asRecord(finding);
      const feeLabel = typeof item?.feeLabel === "string" ? item.feeLabel : null;
      const question = feeLabel ? request.questions.find((candidate) => candidate.feeLabel === feeLabel) : request.questions.length === 1 ? request.questions[0] : null;
      return question ? [{ ...item, feeRowRef: question.feeRowRef }] : [];
    });
    return parseInvestigativeProviderOutput({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ findings: augmented }) }] }],
    });
  };
}

export function authorizedQuestionPayload(question: {
  processorOrNetwork: string | null;
  statementPeriodYear: string | null;
  statementSection: string | null;
  feeLabel: string;
}) {
  return {
    processorName: question.processorOrNetwork,
    statementYear: question.statementPeriodYear,
    statementRole: question.statementSection,
    printedFeeLabel: sanitizeAuthorizedFeeLabel(question.feeLabel),
  };
}

export function sanitizeAuthorizedFeeLabel(label: string) {
  return label
    .replace(/\$\s*\d[\d,.]*/g, "[amount withheld]")
    .replace(/\b\d+(?:\.\d+)?\b/g, "[numeric term withheld]")
    .replace(/\s+/g, " ")
    .trim();
}

function authorizedPublicExcerpts(
  text: string,
  locators: readonly Array<{ textStart: number | null; textEnd: number | null }>,
) {
  return locators.slice(0, 3).map((locator) => {
    const start = locator.textStart ?? 0;
    const end = locator.textEnd ?? Math.min(text.length, start + 700);
    return text.slice(start, Math.min(end, start + 700)).replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

function outputText(raw: unknown) {
  const root = asRecord(raw);
  const output = Array.isArray(root?.output) ? root.output : [];
  return output.flatMap((item) => {
    const record = asRecord(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    return content.flatMap((part) => {
      const value = asRecord(part);
      return value?.type === "output_text" && typeof value.text === "string" ? [value.text] : [];
    });
  }).join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function findingFor(findings: readonly InternalAnalystFinding[], feeRowId: string): InternalAnalystFinding {
  const finding = findings.find((item) => item.sourceFeeRowId === feeRowId);
  if (!finding) throw new Error(`analyst_finding_missing:${feeRowId}`);
  return finding;
}

function intelligenceProjection(item: FeeKnowledgeIntelligenceRecord) {
  return {
    state: item.state,
    subject: item.subject,
    summary: item.summary,
    confidence: item.confidence,
    proofRequirement: item.proofRequirement,
    resolutionRequirement: item.resolutionRequirement,
    candidateEvidence: item.candidateEvidence,
    reasonCodes: item.reasonCodes,
  };
}

function determinantProjection(item: OpenWorldFeeDeterminant) {
  return {
    exactIdentity: item.exactIdentity,
    family: item.family,
    d1: item.d1EconomicLayerAndControl,
    d2: item.d2MechanicAndPopulation,
    d3: item.d3Materiality,
    d4: item.d4Actionability,
    sufficiency: item.determinantSufficiency,
  };
}

function confidenceProjection(item: InternalAnalystFinding) {
  return {
    exactIdentity: item.exactFeeIdentity.confidence,
    category: item.broaderEconomicCategory.confidence,
    assessmentUnit: item.assessmentUnitOrMechanic.confidence,
    collector: item.collector.confidence,
    beneficiary: item.economicBeneficiary.confidence,
    ruleSetter: item.ruleSetter.confidence,
    priceSetter: item.priceSetter.confidence,
    controller: item.merchantFacingPriceController.confidence,
    commercialReasonableness: item.commercialReasonableness.confidence,
  };
}

function sumUsage(usage: readonly OpenAiResponsesSafeUsage[], field: "inputTokens" | "cachedInputTokens" | "outputTokens") {
  const values = usage.map((item) => item[field]).filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

async function readKeychainCredential(service: string): Promise<string> {
  if (process.platform !== "darwin") throw new Error("live_research_keychain_requires_macos");
  const { stdout } = await execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
    encoding: "utf8",
    maxBuffer: 16_384,
    timeout: 120_000,
  });
  return stdout.replace(/[\r\n]+$/, "");
}

function authorizationArgument() {
  const value = process.argv.find((argument) => argument.startsWith("--authorization="));
  return value?.slice("--authorization=".length) ?? null;
}

async function main() {
  const result = await runOpenWorldLiveResearchEvaluationV1({ authorization: authorizationArgument() });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`Open-world live research evaluation failed safely: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
