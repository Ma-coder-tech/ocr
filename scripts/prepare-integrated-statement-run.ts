import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isBusinessTypeId, type BusinessTypeId } from "../src/businessTypes.js";
import {
  buildEvaluationSourceManifest,
  createDeterministicPreflightArtifact,
  loadExactApprovedManifest,
  prepareOneTimeStatementEvaluationSource,
  preserveParserDecision,
  type EvaluationExecutionStage,
} from "../src/evaluationIntegrity/index.js";
import {
  OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
  calculateWorstCaseCostUsd,
} from "../src/evaluationIntegrity/providerAccounting.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../src/fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../src/genericFiservStatementParser.js";
import { parsePdf } from "../src/parser.js";
import type { ParserDriver } from "../src/parserFoundation.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { buildWholeStatementFeeIntelligenceWorkPlan } from "../src/canonical/wholeStatementFeeIntelligenceWorkPlan.js";

const FULL_INTEGRATED_STAGES: EvaluationExecutionStage[] = [
  "parser",
  "statement_investigative_intelligence",
  "whole_statement_ai_review",
  "web_search_discovery",
  "document_retrieval",
  "retrieved_document_investigative_intelligence",
  "semantic_verification",
  "canonical_admission",
  "customer_publication",
  "final_artifact",
];

const LIVE_COST_POLICY_TEMPLATE = {
  statement_investigative_intelligence: openAiResponsesPolicy("investigative_intelligence", 24_000, 3_200, 0, 0.062),
  web_search_discovery: openAiResponsesPolicy("web_search", 400_000, 2_000, 2, 0.54, "openai_responses_web_search"),
  document_retrieval: {
    pricingPolicyRef: "direct_https_retrieval_policy_v1",
    providerRoute: "pinned_https_retrieval",
    provider: "ratereveal",
    model: null,
    toolClass: "retrieval",
    maximumInputTokens: 0,
    maximumOutputTokens: 0,
    maximumToolUses: 1,
    pricing: {
      uncachedInputUsdPerMillionTokens: 0,
      cachedInputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 0,
      toolUseUsd: 0.001,
    },
    estimatedMaximumCostUsd: 0.001,
  },
  retrieved_document_investigative_intelligence: openAiResponsesPolicy("investigative_intelligence", 24_000, 3_200, 0, 0.062),
  semantic_verification: openAiResponsesPolicy("semantic_verification", 4_096, 1_000, 0, 0.01512),
  whole_statement_ai_review: {
    pricingPolicyRef: "openai_official_pricing_2026-08-08_v1",
    providerRoute: "openai_ai_sdk_generate_text_structured_output",
    provider: "openai",
    model: "gpt-5.4-mini",
    toolClass: "ai_sdk_structured_output",
    maximumInputTokens: 400_000,
    maximumOutputTokens: 5_000,
    maximumToolUses: 0,
    pricing: null,
    estimatedMaximumCostUsd: 0.1,
  },
};

const parserDrivers: ParserDriver<unknown>[] = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  genericFiservStatementDriver,
];

const args = argumentMap(process.argv.slice(2));
const sourcePath = requiredArg(args, "source-path");
const sourceDocumentId = requiredArg(args, "source-document-id");
const internalSourceRef = requiredArg(args, "internal-source-ref");
const outputDir = requiredArg(args, "output-dir");
const displayFileName = args.get("display-file-name") ?? path.basename(sourcePath);
const businessType = args.get("business-type") ?? "restaurant_food_beverage";
if (!isBusinessTypeId(businessType)) throw new Error("--business-type must be a supported business type ID.");

await mkdir(outputDir, { recursive: true });
const sourceBytes = await readFile(sourcePath);
const parsedDocument = await parsePdf(sourcePath);
const summary = analyzeStatementDocument(parsedDocument, businessType as BusinessTypeId, { sourceFileName: displayFileName });
const selectedDriverId = summary.parserSource?.driverId ?? null;
if (!selectedDriverId) throw new Error("Statement preparation requires a validated parser driver.");
const driver = parserDrivers.find((item) => item.id === selectedDriverId);
if (!driver) throw new Error(`Statement preparation does not know parser driver: ${selectedDriverId}`);
const parserOutput = driver.parse(parsedDocument, { sourceFileName: displayFileName, businessType } as never) as any;
const parserDecision = preserveParserDecision({
  decision: {
    status: parserOutput.decision.status,
    reportable: parserOutput.decision.reportable,
    confidence: parserOutput.decision.confidence,
    reason: parserOutput.decision.reason,
  },
  exactReasonCode: parserOutput.decision.status === "accepted_with_warnings"
    ? "parser_accepted_with_warnings"
    : parserOutput.decision.status === "accepted"
      ? "parser_accepted"
      : undefined,
  controls: [],
});

const sourceSha256 = `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`;
const safeRunSeed = shortHash({ sourceDocumentId, sourceSha256, businessType, selectedDriverId });
const preflight = createDeterministicPreflightArtifact({
  artifactId: `preflight_${sourceDocumentId}_${safeRunSeed}`,
  documents: [{
    sourceDocumentId,
    internalSourceRef,
    sha256: sourceSha256,
    byteCount: sourceBytes.byteLength,
    displayFileName,
    parsedProcessor: parserOutput.statementIdentity?.visibleBrand ?? parserOutput.statementIdentity?.processorFamily ?? null,
    parsedStatementPeriod: parserOutput.statementIdentity?.statementPeriodStart && parserOutput.statementIdentity?.statementPeriodEnd
      ? { start: parserOutput.statementIdentity.statementPeriodStart, end: parserOutput.statementIdentity.statementPeriodEnd }
      : null,
    parserEligibility: "eligible",
    processorLayoutFamily: "fiserv_family",
    productScopeEligibility: "eligible",
    productScopeReasonCode: "fiserv_family_supported",
    paidStageEligibility: "eligible",
    paidStageExclusionReason: null,
    selectedDriver: selectedDriverId,
    allowedExecutionStages: FULL_INTEGRATED_STAGES,
    parserRecordId: `parser_${sourceDocumentId}`,
    parserDecision,
  }],
});
const manifest = buildEvaluationSourceManifest(preflight);
const manifestPath = path.join(outputDir, "evaluation-source-manifest.json");
const sourceBindingsPath = path.join(outputDir, "source-bindings.json");
const costPolicyPath = path.join(outputDir, "cost-policy.json");
await writeJson(manifestPath, manifest);
await writeJson(sourceBindingsPath, [{ internalSourceRef, sourcePath }]);
await loadExactApprovedManifest({ manifestPath, approvedManifestHash: manifest.manifestContentHash });

const prepared = await prepareOneTimeStatementEvaluationSource({
  manifestRow: manifest.documents[0]!,
  verifiedSourceBytes: sourceBytes,
  businessType: businessType as BusinessTypeId,
});
const packet = (prepared.sanitizedPacket as any).wholeStatementReview;
if (!packet) throw new Error("Prepared statement did not produce a Package 5B packet.");
const workPlan = buildWholeStatementFeeIntelligenceWorkPlan({
  packet,
  mode: "comprehensive",
  limits: { maxAggregateInputBytes: null, maxAggregateOutputTokens: null },
});
const package5BUnits = workPlan.units.filter((unit) => unit.status === "selected").map((unit) => {
  const estimatedMaximumCostUsd = calculateWorstCaseCostUsd({
    maximumInputTokens: unit.estimatedInputBytes,
    maximumOutputTokens: unit.estimatedOutputTokens,
    maximumToolUses: 0,
    pricing: OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
  });
  return {
    workUnitRef: unit.workUnitRef,
    rowCount: unit.expectedFeeRowRefs.length,
    estimatedInputBytes: unit.estimatedInputBytes,
    estimatedOutputTokens: unit.estimatedOutputTokens,
    estimatedMaximumCostUsd,
  };
});
const package5BParentEnvelope = roundUsd(
  package5BUnits.reduce((sum, unit) => sum + unit.estimatedMaximumCostUsd, 0) + 0.000001,
);
const costPolicy = structuredClone(LIVE_COST_POLICY_TEMPLATE);
costPolicy.whole_statement_ai_review.estimatedMaximumCostUsd = package5BParentEnvelope;
await writeJson(costPolicyPath, costPolicy);

console.log(JSON.stringify({
  outputDir,
  manifestPath,
  sourceBindingsPath,
  costPolicyPath,
  manifestHash: manifest.manifestContentHash,
  sourceDocumentId,
  sourceSha256,
  selectedDriverId,
  parserDecision,
  parsedProcessor: parserOutput.statementIdentity?.visibleBrand ?? parserOutput.statementIdentity?.processorFamily ?? null,
  parsedStatementPeriod: parserOutput.statementIdentity?.statementPeriodStart && parserOutput.statementIdentity?.statementPeriodEnd
    ? { start: parserOutput.statementIdentity.statementPeriodStart, end: parserOutput.statementIdentity.statementPeriodEnd }
    : null,
  feeRowCount: parserOutput.feeLedger?.rows?.length ?? null,
  selectedFinancials: parserOutput.selectedFinancials ?? null,
  researchQuestionCount: (prepared.sanitizedPacket as any).research?.questions?.length ?? null,
  package5B: {
    plannedRows: workPlan.plannedFeeRowRefs.length,
    selectedRows: workPlan.selectedFeeRowRefs.length,
    plannedWorkUnitCount: workPlan.units.length,
    selectedWorkUnitCount: package5BUnits.length,
    parentEnvelopeUsd: package5BParentEnvelope,
    units: package5BUnits,
  },
  totalEstimatedEnvelopeUsd: roundUsd(Object.values(costPolicy).reduce((sum, policy) => sum + policy.estimatedMaximumCostUsd, 0)),
}, null, 2));

function openAiResponsesPolicy(
  toolClass: string,
  maximumInputTokens: number,
  maximumOutputTokens: number,
  maximumToolUses: number,
  estimatedMaximumCostUsd: number,
  providerRoute = "openai_responses",
) {
  return {
    pricingPolicyRef: "openai_official_pricing_2026-08-08_v1",
    providerRoute,
    provider: "openai",
    model: "gpt-5",
    toolClass,
    maximumInputTokens,
    maximumOutputTokens,
    maximumToolUses,
    pricing: {
      uncachedInputUsdPerMillionTokens: 1.25,
      cachedInputUsdPerMillionTokens: 0.125,
      outputUsdPerMillionTokens: 10,
      toolUseUsd: 0.01,
    },
    estimatedMaximumCostUsd,
  };
}

function argumentMap(values: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Arguments must be supplied as --name value pairs.");
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

function requiredArg(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new Error(`Missing required --${name} argument.`);
  return value;
}

function shortHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function roundUsd(value: number): number {
  return Math.ceil(value * 1_000_000_000) / 1_000_000_000;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
