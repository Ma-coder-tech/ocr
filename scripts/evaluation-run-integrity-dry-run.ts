import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EvaluationCostBudgetLedger,
  buildEvaluationRunIntegrityArtifact,
  buildEvaluationSourceManifest,
  createDeterministicPreflightArtifact,
  createLifecycleLedger,
  lifecycleRefs,
  prepareApprovedExecution,
  preserveParserDecision,
  provePackagesBEFinancialInvariance,
  recordLifecycleStage,
  sha256Canonical,
  verifyEvaluationRunIntegrityArtifact,
  type DeterministicPreflightDocument,
  type EvaluationExecutionStage,
} from "../src/evaluationIntegrity/index.js";

const outputDir = "/private/tmp/ratereveal-evaluation-run-integrity";
const manifestPath = path.join(outputDir, "evaluation-source-manifest-v1.json");
const artifactPath = path.join(outputDir, "evaluation-run-integrity-dry-run.json");
const fullStages: EvaluationExecutionStage[] = [
  "parser",
  "whole_statement_ai_review",
  "web_search_discovery",
  "document_retrieval",
  "semantic_verification",
  "canonical_admission",
  "customer_publication",
  "final_artifact",
];

const preflight = createDeterministicPreflightArtifact({
  artifactId: "preflight_sanitized_dry_run_v1",
  documents: [
    document("doc_001", "upload_001", "one", "eligible", "fiserv_family"),
    document("doc_002", "upload_002", "two", "eligible", "fiserv_family"),
    document("doc_003", "upload_003", "three", "eligible", "nxgen_vortax"),
    document("doc_003_copy", "upload_003_copy", "three", "eligible", "nxgen_vortax"),
    document("doc_004", "upload_004", "four", "unsupported", "unknown"),
  ],
});
const manifest = buildEvaluationSourceManifest(preflight);
await mkdir(outputDir, { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const observedSources = manifest.documents.map((item) => ({
  sourceDocumentId: item.sourceDocumentId,
  internalSourceRef: item.internalSourceRef,
  sha256: item.sha256,
  byteCount: item.byteCount,
  displayFileName: item.displayFileName,
  displayMetadataStatementPeriod: item.parsedStatementPeriod,
}));
const requestedExecutions = manifest.documents
  .filter((item) => item.selectedDuplicateRepresentative)
  .map((item) => ({
    sourceDocumentId: item.sourceDocumentId,
    stages: item.paidStageEligibility === "eligible"
      ? (["parser", "whole_statement_ai_review", "final_artifact"] as EvaluationExecutionStage[])
      : (["parser", "final_artifact"] as EvaluationExecutionStage[]),
  }));
const approved = await prepareApprovedExecution({
  manifestPath,
  approvedManifestHash: manifest.manifestContentHash,
  observedSources,
  requestedExecutions,
});
const financialPackages = {
  financialFacts: { processedSales: { value: { amountMinor: 100_000, currency: "USD" } } },
  feeLedger: { status: "reconciled", rows: [{ id: "fee_1", amount: { amountMinor: 3000, currency: "USD" } }] },
  feeOwnershipActionability: { status: "complete", rowClassifications: [{ feeRowId: "fee_1", selected: { actionabilityCeiling: "verify_only" } }] },
  opportunityEngine: { status: "complete", summary: { totalEligibleAnnualAmount: { amountMinor: 0, currency: "USD" } }, components: [] },
};
const lifecycleLedger = createLifecycleLedger(manifest);
const artifactInput = {
  manifest: approved.manifest,
  approvedManifestHash: manifest.manifestContentHash,
  executionPermit: approved.permit,
  lifecycleLedger,
  packageFinancialInvariance: manifest.documents.map((document) => ({
    sourceDocumentId: document.sourceDocumentId,
    result: provePackagesBEFinancialInvariance(financialPackages as any, structuredClone(financialPackages) as any),
  })),
  costBudgetLedger: new EvaluationCostBudgetLedger(10).snapshot(),
  providerCallOutcomes: [],
  finalStatus: "completed",
  reasonCodes: ["deterministic_dry_run_completed"],
};
const draft = buildEvaluationRunIntegrityArtifact(artifactInput);
await writeFile(`${artifactPath}.pending`, `${JSON.stringify(draft, null, 2)}\n`);
if (!verifyEvaluationRunIntegrityArtifact(JSON.parse(await readFile(`${artifactPath}.pending`, "utf8")))) {
  throw new Error("Generated draft integrity artifact failed its content-hash verification.");
}
for (const document of manifest.documents) {
  recordLifecycleStage(lifecycleLedger, lifecycleRefs({
    sourceDocumentId: document.sourceDocumentId,
    stage: "final_artifact",
    state: "completed",
    reasonCodes: ["final_integrity_artifact_written_and_verified"],
    manifestRowRef: document.sourceDocumentId,
    preflightRecordRef: document.parentPreflightArtifactId,
    parserRecordRef: document.parserRecordId,
    finalArtifactRef: "self:artifactContentHash",
  }));
}
const artifact = buildEvaluationRunIntegrityArtifact(artifactInput);
await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
if (!verifyEvaluationRunIntegrityArtifact(JSON.parse(await readFile(artifactPath, "utf8")))) {
  throw new Error("Generated integrity artifact failed its content-hash verification.");
}
await unlink(`${artifactPath}.pending`);

console.log(JSON.stringify({
  manifestPath,
  artifactPath,
  manifestHash: manifest.manifestContentHash,
  expectedDocumentCount: manifest.expectedDocumentCount,
  selectedDocumentCount: manifest.selectedDocumentCount,
  externalProviderCalls: 0,
}, null, 2));

function document(
  sourceDocumentId: string,
  internalSourceRef: string,
  seed: string,
  eligibility: "eligible" | "unsupported",
  processorLayoutFamily: "fiserv_family" | "nxgen_vortax" | "unknown",
): DeterministicPreflightDocument {
  return {
    sourceDocumentId,
    internalSourceRef,
    sha256: sha256Canonical({ sanitizedFixture: seed }),
    byteCount: 2048 + seed.length,
    displayFileName: `${sourceDocumentId}.pdf`,
    parsedProcessor: eligibility === "eligible" ? processorLayoutFamily : null,
    parsedStatementPeriod: eligibility === "eligible" ? { start: "2030-01-01", end: "2030-01-31" } : null,
    parserEligibility: eligibility,
    processorLayoutFamily,
    productScopeEligibility: processorLayoutFamily === "fiserv_family" ? "eligible" : "ineligible",
    productScopeReasonCode: processorLayoutFamily === "fiserv_family"
      ? "fiserv_family_supported"
      : processorLayoutFamily === "nxgen_vortax"
        ? "processor_layout_out_of_product_scope"
        : "processor_layout_unknown",
    paidStageEligibility: eligibility === "eligible" && processorLayoutFamily === "fiserv_family" ? "eligible" : "ineligible",
    paidStageExclusionReason: eligibility !== "eligible"
      ? "parser_ineligible"
      : processorLayoutFamily !== "fiserv_family"
        ? "product_scope_ineligible"
        : null,
    selectedDriver: eligibility === "eligible" ? "sanitized_structural_driver" : null,
    allowedExecutionStages: eligibility === "eligible" && processorLayoutFamily === "fiserv_family" ? fullStages : ["parser", "final_artifact"],
    parserRecordId: `parser_${sourceDocumentId}`,
    parserDecision: preserveParserDecision({
      decision: eligibility === "eligible"
        ? { status: "accepted", reportable: true, confidence: "high", reason: "Accepted because required reconciliation checks passed." }
        : { status: "unsupported", reportable: false, confidence: "needs_review", reason: "No structural parser family safely matched." },
      exactReasonCode: eligibility === "eligible" ? "parser_accepted" : "parser_text_unavailable",
      controls: [],
    }),
  };
}
