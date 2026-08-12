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
  oneTimeLiveCostPolicyTemplate,
  oneTimeSlotExpandedCostEnvelope,
} from "../src/evaluationIntegrity/oneTimeLiveCostPolicy.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../src/fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../src/genericFiservStatementParser.js";
import { parsePdf } from "../src/parser.js";
import type { ParserDriver } from "../src/parserFoundation.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import {
  buildWholeStatementFeeIntelligenceWorkPlan,
  wholeStatementFeeIntelligenceAggregateOutputCeiling,
  wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes,
  wholeStatementFeeIntelligenceWorkUnitOutputReserveTokens,
} from "../src/canonical/wholeStatementFeeIntelligenceWorkPlan.js";

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
const selectedPackage5BUnits = workPlan.units.filter((unit) => unit.status === "selected");
const package5BUnitsAtDeterministicCeilings = selectedPackage5BUnits.map((unit) => {
  const maximumInputTokens = wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes({
    unit,
    researchLimits: (prepared.sanitizedPacket as any).research.limits,
  });
  const maximumOutputTokens = wholeStatementFeeIntelligenceWorkUnitOutputReserveTokens({
    unit,
    parentMaximumOutputTokens: 5_000,
    aggregateOutputCeiling: null,
  });
  const estimatedMaximumCostUsd = calculateWorstCaseCostUsd({
    maximumInputTokens,
    maximumOutputTokens,
    maximumToolUses: 0,
    pricing: OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
  });
  return {
    workUnitRef: unit.workUnitRef,
    rowCount: unit.expectedFeeRowRefs.length,
    estimatedInputBytes: unit.estimatedInputBytes,
    maximumInputTokens,
    maximumOutputTokens,
    estimatedOutputTokens: unit.estimatedOutputTokens,
    estimatedMaximumCostUsd,
  };
});
const package5BParentEnvelope = roundUsd(
  package5BUnitsAtDeterministicCeilings.reduce((sum, unit) => sum + unit.estimatedMaximumCostUsd, 0) + 0.000001,
);
const costPolicy = oneTimeLiveCostPolicyTemplate(package5BParentEnvelope);
const aggregateOutputCeiling = wholeStatementFeeIntelligenceAggregateOutputCeiling({
  parentMaximumOutputTokens: costPolicy.whole_statement_ai_review.maximumOutputTokens,
  parentEstimatedMaximumCostUsd: costPolicy.whole_statement_ai_review.estimatedMaximumCostUsd,
  parentMaximumToolUses: costPolicy.whole_statement_ai_review.maximumToolUses,
  pricing: OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
  units: selectedPackage5BUnits,
  researchLimits: (prepared.sanitizedPacket as any).research.limits,
  calculateWorstCaseCostUsd,
});
const package5BUnits = selectedPackage5BUnits.map((unit) => {
  const maximumInputTokens = wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes({
    unit,
    researchLimits: (prepared.sanitizedPacket as any).research.limits,
  });
  const maximumOutputTokens = wholeStatementFeeIntelligenceWorkUnitOutputReserveTokens({
    unit,
    parentMaximumOutputTokens: costPolicy.whole_statement_ai_review.maximumOutputTokens,
    aggregateOutputCeiling,
  });
  return {
    workUnitRef: unit.workUnitRef,
    rowCount: unit.expectedFeeRowRefs.length,
    estimatedInputBytes: unit.estimatedInputBytes,
    maximumInputTokens,
    maximumOutputTokens,
    estimatedOutputTokens: unit.estimatedOutputTokens,
    estimatedMaximumCostUsd: calculateWorstCaseCostUsd({
      maximumInputTokens,
      maximumOutputTokens,
      maximumToolUses: 0,
      pricing: OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
    }),
  };
});
await writeJson(costPolicyPath, costPolicy);
const slotExpandedEnvelope = oneTimeSlotExpandedCostEnvelope(costPolicy, FULL_INTEGRATED_STAGES);

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
  costEnvelope: {
    slotExpanded: true,
    stages: slotExpandedEnvelope.stages,
    totalEstimatedEnvelopeUsd: slotExpandedEnvelope.totalEstimatedEnvelopeUsd,
  },
}, null, 2));

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
