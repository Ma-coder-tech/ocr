import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
  loadExactApprovedManifest,
  paidEvaluationStages,
  repositoryEvaluationAdapterIds,
  runManifestDrivenLiveEvaluation,
  type RepositoryEvaluationAdapterId,
  ONE_TIME_RESEARCH_REQUEST_SLOTS,
} from "../src/evaluationIntegrity/index.js";
import { isBusinessTypeId, type BusinessTypeId } from "../src/businessTypes.js";

type SourceBinding = { internalSourceRef: string; sourcePath: string };
type StageCostPolicy = {
  pricingPolicyRef: string;
  providerRoute: string;
  provider: string;
  model: string | null;
  toolClass: string;
  maximumInputTokens: number | null;
  maximumOutputTokens: number | null;
  maximumToolUses: number | null;
  pricing: {
    uncachedInputUsdPerMillionTokens: number;
    cachedInputUsdPerMillionTokens: number;
    outputUsdPerMillionTokens: number;
    toolUseUsd: number;
  };
  estimatedMaximumCostUsd: number;
};

const args = argumentMap(process.argv.slice(2));
const manifestPath = requiredArg(args, "manifest");
const approvedManifestHash = requiredArg(args, "approved-hash");
const sourceBindingsPath = requiredArg(args, "source-bindings");
const costPolicyPath = requiredArg(args, "cost-policy");
const adapterId = args.get("adapter-id") ?? "one_time_statement_evaluation_v1";
const businessType = args.get("business-type") ?? "restaurant_food_beverage";
const outputArtifactPath = requiredArg(args, "output-artifact");
if (!repositoryEvaluationAdapterIds.includes(adapterId as RepositoryEvaluationAdapterId)) {
  throw new Error(`--adapter-id must be one of: ${repositoryEvaluationAdapterIds.join(", ")}`);
}
if (!isBusinessTypeId(businessType)) throw new Error("--business-type must be a supported business type ID.");
const approvedBudgetUsd = Number(requiredArg(args, "budget-usd"));
if (!Number.isFinite(approvedBudgetUsd) || approvedBudgetUsd <= 0) throw new Error("--budget-usd must be a positive number.");

const manifest = await loadExactApprovedManifest({ manifestPath, approvedManifestHash });
const sourceBindings = await readJson<SourceBinding[]>(sourceBindingsPath);
const costPolicy = await readJson<Record<string, StageCostPolicy>>(costPolicyPath);
const bindingByRef = validateSourceBindings(sourceBindings, manifest.documents.map((item) => item.internalSourceRef));
const requestedExecutions = manifest.documents
  .filter((item) => item.selectedDuplicateRepresentative)
  .map((item) => ({ sourceDocumentId: item.sourceDocumentId, stages: item.allowedExecutionStages }));
const calls = manifest.documents
  .filter((item) => item.selectedDuplicateRepresentative)
  .flatMap((item) => adapterId === "one_time_statement_evaluation_v1"
    ? oneTimeStatementCalls(item.sourceDocumentId, item.allowedExecutionStages)
    : orderedPaidStages(item.allowedExecutionStages)
        .filter((stage): stage is (typeof paidEvaluationStages)[number] => paidEvaluationStages.includes(stage as never))
        .flatMap((stage) => callBatch(item.sourceDocumentId, stage, 1, 0)));

const result = await runManifestDrivenLiveEvaluation({
  manifestPath,
  approvedManifestHash,
  requestedExecutions,
  approvedBudgetUsd,
  calls,
  outputArtifactPath,
  adapterId: adapterId as RepositoryEvaluationAdapterId,
  businessType: businessType as BusinessTypeId,
  resolveSourceBytes: async (row) => readFile(bindingByRef.get(row.internalSourceRef)!),
});

console.log(JSON.stringify({
  status: result.finalStatus,
  manifestVersion: result.manifest.type,
  manifestHash: result.manifest.manifestContentHash,
  approvedManifestHash,
  selectedDocumentCount: result.executionPermit.selectedCount,
  providerCallCount: result.providerCallOutcomes.filter((item) => item.status !== "cancelled_before_send").length,
  liveRunBlocked: result.liveRunBlocked,
  reasonCodes: result.reasonCodes,
  artifactPath: result.artifactPath,
  costLedger: result.costLedger,
}, null, 2));
if (result.finalStatus !== "completed") process.exitCode = 1;

function argumentMap(values: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Arguments must be supplied as --name value pairs.");
    args.set(key.slice(2), value);
  }
  return args;
}

function requiredArg(args: Map<string, string>, name: string): string {
  const value = args.get(name);
  if (!value) throw new Error(`Missing required --${name} argument.`);
  return value;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function validateSourceBindings(bindings: SourceBinding[], expectedRefs: string[]): Map<string, string> {
  const bindingByRef = new Map(bindings.map((item) => [item.internalSourceRef, item.sourcePath]));
  if (bindingByRef.size !== bindings.length) throw new Error("Source bindings contain duplicate internal source references.");
  const expected = [...expectedRefs].sort();
  const actual = [...bindingByRef.keys()].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Source bindings must equal the complete manifest source-reference set.");
  if ([...bindingByRef.values()].some((value) => !value.trim())) throw new Error("Every source binding requires a local source path.");
  return bindingByRef;
}

function capabilityForStage(stage: (typeof paidEvaluationStages)[number]) {
  const mapping = {
    statement_investigative_intelligence: "investigative_intelligence",
    whole_statement_ai_review: "ai_sdk",
    web_search_discovery: "web_search",
    document_retrieval: "retrieval",
    retrieved_document_investigative_intelligence: "investigative_intelligence",
    semantic_verification: "semantic_verification",
  } as const;
  return mapping[stage];
}

function requestSlots(stage: (typeof paidEvaluationStages)[number]): number {
  if (stage === "statement_investigative_intelligence") return 1;
  if (stage === "web_search_discovery") return ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch;
  if (stage === "document_retrieval") return ONE_TIME_RESEARCH_REQUEST_SLOTS.retrieval;
  if (stage === "retrieved_document_investigative_intelligence") return ONE_TIME_RESEARCH_REQUEST_SLOTS.retrievedDocumentInvestigation;
  if (stage === "semantic_verification") return ONE_TIME_RESEARCH_REQUEST_SLOTS.semanticVerification;
  return 1;
}

function oneTimeStatementCalls(sourceDocumentId: string, allowedStages: readonly string[]) {
  const allowed = new Set(allowedStages);
  const calls = [];
  if (allowed.has("statement_investigative_intelligence")) calls.push(...callBatch(sourceDocumentId, "statement_investigative_intelligence", 1, 0));
  if (allowed.has("web_search_discovery")) calls.push(...callBatch(sourceDocumentId, "web_search_discovery", FEE_INITIAL_SEARCH_CALLS, 0));
  if (allowed.has("document_retrieval")) calls.push(...callBatch(sourceDocumentId, "document_retrieval", FEE_INITIAL_RETRIEVAL_CANDIDATES, 0));
  if (allowed.has("retrieved_document_investigative_intelligence")) calls.push(...callBatch(sourceDocumentId, "retrieved_document_investigative_intelligence", FEE_INITIAL_RETRIEVAL_CANDIDATES, 0));
  if (allowed.has("semantic_verification")) calls.push(...callBatch(sourceDocumentId, "semantic_verification", FEE_INITIAL_RETRIEVAL_CANDIDATES, 0));
  if (allowed.has("web_search_discovery")) calls.push(...callBatch(sourceDocumentId, "web_search_discovery", FEE_ADAPTIVE_SEARCH_CALLS, FEE_INITIAL_SEARCH_CALLS));
  if (allowed.has("document_retrieval")) calls.push(...callBatch(sourceDocumentId, "document_retrieval", FEE_ADAPTIVE_RETRIEVAL_CANDIDATES, FEE_INITIAL_RETRIEVAL_CANDIDATES));
  if (allowed.has("retrieved_document_investigative_intelligence")) calls.push(...callBatch(sourceDocumentId, "retrieved_document_investigative_intelligence", FEE_ADAPTIVE_RETRIEVAL_CANDIDATES, FEE_INITIAL_RETRIEVAL_CANDIDATES));
  if (allowed.has("semantic_verification")) calls.push(...callBatch(sourceDocumentId, "semantic_verification", FEE_ADAPTIVE_RETRIEVAL_CANDIDATES, FEE_INITIAL_RETRIEVAL_CANDIDATES));
  if (allowed.has("whole_statement_ai_review")) calls.push(...callBatch(sourceDocumentId, "whole_statement_ai_review", 1, 0));
  return calls;
}

const FEE_INITIAL_SEARCH_CALLS = ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch - 1;
const FEE_ADAPTIVE_SEARCH_CALLS = 1;
const FEE_ADAPTIVE_RETRIEVAL_CANDIDATES = 2;
const FEE_INITIAL_RETRIEVAL_CANDIDATES = Math.max(0, ONE_TIME_RESEARCH_REQUEST_SLOTS.retrieval - FEE_ADAPTIVE_RETRIEVAL_CANDIDATES);

function callBatch(
  sourceDocumentId: string,
  stage: (typeof paidEvaluationStages)[number],
  count: number,
  ordinalOffset: number,
) {
  const policy = costPolicy[stage];
  if (!policy) throw new Error(`Missing cost policy for approved paid stage: ${stage}`);
  return Array.from({ length: count }, (_, ordinal) => ({
    sourceDocumentId,
    stage,
    reservation: {
      callId: `evaluation_${sourceDocumentId}_${stage}_${ordinalOffset + ordinal + 1}`,
      attempt: 1,
      retryOfCallId: null,
      capability: capabilityForStage(stage),
      ...policy,
    },
  }));
}

function orderedPaidStages(stages: readonly string[]): string[] {
  const order = ["statement_investigative_intelligence", "web_search_discovery", "document_retrieval", "retrieved_document_investigative_intelligence", "semantic_verification", "whole_statement_ai_review"];
  return [...stages].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}
