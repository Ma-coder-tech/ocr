import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { retrieveFeeKnowledgeDocument } from "../src/canonical/feeKnowledgeRetrieval.js";
import { openAiWebSearchAdapter } from "../src/canonical/feeKnowledgeResearch.js";
import { safeProviderFailureError } from "../src/canonical/providerFailureDiagnostics.js";
import { FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION } from "../src/canonical/feeKnowledgeTypes.js";
import type { CanonicalFactValue } from "../src/canonical/types.js";
import {
  EvaluationCostBudgetLedger,
  EvaluationIntegrityError,
  accountingFromProviderUsage,
  buildEvaluationRunIntegrityArtifact,
  buildEvaluationSourceManifest,
  blockUnmanifestedLiveEvaluationEntrypoint,
  assertOutsideRepositoryArtifactPath,
  calculateManifestContentHash,
  createDeterministicPreflightArtifact,
  createLifecycleLedger,
  executeBudgetedProviderCall,
  loadExactApprovedManifest,
  observeEvaluationSourceFile,
  prepareApprovedExecution,
  preserveParserDecision,
  provePackagesBEFinancialInvariance,
  excludedFinancialProjectionKeys,
  runManifestDrivenLiveEvaluation,
  recordAiLifecycleState,
  ONE_TIME_RESEARCH_REQUEST_SLOTS,
  sha256Canonical,
  verifyEvaluationRunIntegrityArtifact,
  verifyEvaluationRunIntegrityArtifactV2,
  type DeterministicPreflightDocument,
  type EvaluationExecutionStage,
  type ObservedEvaluationSource,
  type PackagesBEProjectionInput,
  type RequestedDocumentExecution,
} from "../src/evaluationIntegrity/index.js";
import { createHash } from "node:crypto";

const eligibleStages: EvaluationExecutionStage[] = [
  "parser",
  "whole_statement_ai_review",
  "web_search_discovery",
  "document_retrieval",
  "semantic_verification",
  "canonical_admission",
  "customer_publication",
  "final_artifact",
];

describe("evaluation-run integrity", () => {
  it("observes checksum and byte count from local bytes without retaining the local path", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "evaluation-source-observation-"));
    const sourcePath = path.join(directory, "display-name.pdf");
    const bytes = "SANITIZED STRUCTURAL FIXTURE";
    await writeFile(sourcePath, bytes);

    const observed = await observeEvaluationSourceFile({
      sourceDocumentId: "doc_observed",
      internalSourceRef: "upload_observed",
      sourcePath,
      displayFileName: "display-name.pdf",
    });

    expect(observed.byteCount).toBe(Buffer.byteLength(bytes));
    expect(observed.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(observed)).not.toContain(sourcePath);
  });

  it("allows the exact approved source set in dry-run mode", async () => {
    const fixture = await approvedFixture();
    const result = await prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: fixture.observed,
      requestedExecutions: fixture.requests,
    });

    expect(result.permit.selectedCount).toBe(4);
    expect(result.permit.recalculatedManifestHash).toBe(fixture.manifest.manifestContentHash);
    expect(result.permit.documents.some((item) => item.sourceDocumentId === "doc_unsupported" && item.selectedDriver === null)).toBe(true);
  });

  it.each([
    ["compatible source A substituted for source B", "doc_beta", checksum("alpha")],
    ["period-compatible source substituted for the submitted source", "doc_alpha", checksum("gamma")],
  ])("fails before provider invocation when %s", async (_name, sourceDocumentId, replacementChecksum) => {
    const fixture = await approvedFixture();
    const observed = fixture.observed.map((item) => item.sourceDocumentId === sourceDocumentId ? { ...item, sha256: replacementChecksum } : item);
    let providerInvocations = 0;

    await expect(prepareThenInvoke(fixture, observed, () => { providerInvocations += 1; })).rejects.toMatchObject({
      code: "source_substituted",
    });
    expect(providerInvocations).toBe(0);
  });

  it("fails before provider invocation when an expected checksum is missing", async () => {
    const fixture = await approvedFixture();
    let providerInvocations = 0;
    await expect(prepareThenInvoke(fixture, fixture.observed.filter((item) => item.sourceDocumentId !== "doc_beta"), () => {
      providerInvocations += 1;
    })).rejects.toMatchObject({ code: "expected_source_missing" });
    expect(providerInvocations).toBe(0);
  });

  it("fails before provider invocation when an unexpected checksum is added", async () => {
    const fixture = await approvedFixture();
    let providerInvocations = 0;
    await expect(prepareThenInvoke(fixture, [...fixture.observed, observedSource("doc_extra", "extra")], () => {
      providerInvocations += 1;
    })).rejects.toMatchObject({ code: "unexpected_source_present" });
    expect(providerInvocations).toBe(0);
  });

  it("rejects a manifest modified after approval", async () => {
    const fixture = await approvedFixture();
    const modified = structuredClone(fixture.manifest);
    modified.documents[0]!.byteCount += 1;
    await writeFile(fixture.manifestPath, `${JSON.stringify(modified)}\n`);

    await expect(loadExactApprovedManifest({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
    })).rejects.toMatchObject({ code: "manifest_hash_mismatch" });
  });

  it("rejects a valid regenerated manifest when its hash was not explicitly approved", async () => {
    const fixture = await approvedFixture();
    const changedPreflight = createDeterministicPreflightArtifact({
      artifactId: "preflight_regenerated_without_approval",
      documents: fixture.manifest.documents.map((item) => ({
        sourceDocumentId: item.sourceDocumentId,
        internalSourceRef: item.internalSourceRef,
        sha256: item.sha256,
        byteCount: item.byteCount,
        displayFileName: item.displayFileName,
        parsedProcessor: item.parsedProcessor,
        parsedStatementPeriod: item.parsedStatementPeriod,
        parserEligibility: item.parserEligibility,
        processorLayoutFamily: item.processorLayoutFamily,
        productScopeEligibility: item.productScopeEligibility,
        productScopeReasonCode: item.productScopeReasonCode,
        paidStageEligibility: item.paidStageEligibility,
        paidStageExclusionReason: item.paidStageExclusionReason,
        selectedDriver: item.selectedDriver,
        allowedExecutionStages: item.allowedExecutionStages,
        parserRecordId: item.parserRecordId,
        parserDecision: item.parserDecision,
      })),
    });
    const regenerated = buildEvaluationSourceManifest(changedPreflight);
    await writeFile(fixture.manifestPath, `${JSON.stringify(regenerated)}\n`);

    await expect(loadExactApprovedManifest({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
    })).rejects.toMatchObject({ code: "approved_manifest_hash_mismatch" });
  });

  it("rejects the same display filename with a different checksum", async () => {
    const fixture = await approvedFixture();
    const original = fixture.observed.find((item) => item.sourceDocumentId === "doc_alpha")!;
    const observed = fixture.observed.map((item) => item.sourceDocumentId === "doc_alpha"
      ? { ...item, displayFileName: original.displayFileName, sha256: checksum("different-content") }
      : item);
    await expect(prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: observed,
      requestedExecutions: fixture.requests,
    })).rejects.toMatchObject({ code: "source_substituted" });
  });

  it("accepts a different display filename for the same checksum and follows the approved duplicate decision", async () => {
    const fixture = await approvedFixture();
    const observed = fixture.observed.map((item) => item.sourceDocumentId === "doc_gamma_copy"
      ? { ...item, displayFileName: "renamed-copy.pdf" }
      : item);
    const result = await prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: observed,
      requestedExecutions: fixture.requests,
    });

    expect(result.permit.documents.map((item) => item.sourceDocumentId)).toContain("doc_gamma");
    expect(result.permit.documents.map((item) => item.sourceDocumentId)).not.toContain("doc_gamma_copy");
    expect(result.manifest.duplicateDecisions.find((item) => item.groupMembers.length === 2)).toMatchObject({
      selectedRepresentative: "doc_gamma",
      exclusions: [{ sourceDocumentId: "doc_gamma_copy", reason: "duplicate_checksum_non_representative" }],
    });
  });

  it("rejects a duplicate checksum group without one selected representative", async () => {
    const fixture = await approvedFixture();
    const modified = structuredClone(fixture.manifest);
    for (const row of modified.documents.filter((item) => item.sha256 === checksum("gamma"))) {
      row.selectedDuplicateRepresentative = false;
      row.duplicateExclusionReason = "duplicate_checksum_non_representative";
    }
    modified.selectedDocumentCount -= 1;
    modified.manifestContentHash = calculateManifestContentHash(modified);
    await writeFile(fixture.manifestPath, `${JSON.stringify(modified)}\n`);

    await expect(loadExactApprovedManifest({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: modified.manifestContentHash,
    })).rejects.toMatchObject({ code: "duplicate_decision_mismatch" });
  });

  it("rejects a duplicate decision that does not name every excluded member", async () => {
    const fixture = await approvedFixture();
    const modified = structuredClone(fixture.manifest);
    const decision = modified.duplicateDecisions.find((item) => item.checksum === checksum("gamma"))!;
    decision.exclusions[0]!.sourceDocumentId = "doc_alpha";
    modified.manifestContentHash = calculateManifestContentHash(modified);
    await writeFile(fixture.manifestPath, `${JSON.stringify(modified)}\n`);

    await expect(loadExactApprovedManifest({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: modified.manifestContentHash,
    })).rejects.toMatchObject({ code: "duplicate_decision_mismatch" });
  });

  it("retains filename-period disagreement without changing checksum identity", async () => {
    const fixture = await approvedFixture();
    const observed = fixture.observed.map((item) => item.sourceDocumentId === "doc_alpha"
      ? { ...item, displayMetadataStatementPeriod: { start: "2030-11-01", end: "2030-11-30" } }
      : item);
    const result = await prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: observed,
      requestedExecutions: fixture.requests,
    });

    expect(result.permit.diagnostics).toContainEqual(expect.objectContaining({
      code: "filename_period_disagrees_with_parsed_period",
      sourceDocumentId: "doc_alpha",
    }));
    expect(result.permit.documents.find((item) => item.sourceDocumentId === "doc_alpha")?.sha256).toBe(checksum("alpha"));
  });

  it("rejects a stage not authorized by the manifest", async () => {
    const fixture = await approvedFixture();
    const requests = fixture.requests.map((request) => request.sourceDocumentId === "doc_beta"
      ? { ...request, stages: [...request.stages, "customer_publication" as const] }
      : request);
    const modifiedPreflight = createDeterministicPreflightArtifact({
      artifactId: "preflight_stage_restriction",
      documents: fixture.preflight.documents.map((document) => document.sourceDocumentId === "doc_beta"
        ? { ...document, allowedExecutionStages: document.allowedExecutionStages.filter((stage) => stage !== "customer_publication") }
        : document),
    });
    const modifiedManifest = buildEvaluationSourceManifest(modifiedPreflight);
    await writeFile(fixture.manifestPath, `${JSON.stringify(modifiedManifest)}\n`);
    await expect(prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: modifiedManifest.manifestContentHash,
      observedSources: fixture.observed,
      requestedExecutions: requests,
    })).rejects.toMatchObject({ code: "stage_not_authorized" });
  });

  it("keeps Anthony parser- and external-stage-ineligible", async () => {
    const fixture = await approvedFixture();
    const requests = fixture.requests.map((request) => request.sourceDocumentId === "doc_unsupported"
      ? { ...request, stages: ["parser", "whole_statement_ai_review"] as EvaluationExecutionStage[] }
      : request);
    await expect(prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: fixture.observed,
      requestedExecutions: requests,
    })).rejects.toMatchObject({ code: "paid_stage_parser_ineligible" });
  });

  it("keeps Nxgen/Vortax parser-compatible but product-scope-ineligible for external stages", async () => {
    const fixture = await approvedFixture();
    const row = fixture.manifest.documents.find((item) => item.sourceDocumentId === "doc_beta")!;
    expect(row).toMatchObject({
      parserEligibility: "eligible",
      processorLayoutFamily: "nxgen_vortax",
      productScopeEligibility: "ineligible",
      productScopeReasonCode: "processor_layout_out_of_product_scope",
      paidStageEligibility: "ineligible",
      paidStageExclusionReason: "product_scope_ineligible",
      allowedExecutionStages: ["parser", "final_artifact"],
    });
    const requests = fixture.requests.map((request) => request.sourceDocumentId === "doc_beta"
      ? { ...request, stages: ["parser", "whole_statement_ai_review"] as EvaluationExecutionStage[] }
      : request);

    await expect(prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: fixture.observed,
      requestedExecutions: requests,
    })).rejects.toMatchObject({ code: "paid_stage_product_scope_ineligible" });
  });

  it("prevents invocation when remaining budget cannot cover the reservation", async () => {
    const ledger = new EvaluationCostBudgetLedger(10);
    ledger.reserve(costReservation({ callId: "call_1", estimatedMaximumCostUsd: 9.5 }));
    ledger.finalize("call_1", { status: "failure", durationMs: 10, billingDisposition: "unknown" });
    let invoked = false;

    await expect(executeBudgetedProviderCall({
      ledger,
      reservation: costReservation({ callId: "call_2", capability: "semantic_verification", estimatedMaximumCostUsd: 0.51 }),
      invoke: async () => {
        invoked = true;
        return { value: true, accounting: { durationMs: 1, observedOrEstimatedFinalCostUsd: 0.1 } };
      },
    })).rejects.toMatchObject({ code: "insufficient_budget_reservation" });
    expect(invoked).toBe(false);
  });

  it("accounts for failed calls and retries as independent reservations", async () => {
    const ledger = new EvaluationCostBudgetLedger(10);
    await expect(executeBudgetedProviderCall({
      ledger,
      reservation: costReservation({ callId: "attempt_1", capability: "web_search", estimatedMaximumCostUsd: 1 }),
      invoke: async () => { throw new Error("sanitized failure"); },
    })).rejects.toThrow("sanitized failure");
    await executeBudgetedProviderCall({
      ledger,
      reservation: costReservation({ callId: "attempt_2", attempt: 2, retryOfCallId: "attempt_1", capability: "web_search", estimatedMaximumCostUsd: 1 }),
      invoke: async () => ({
        value: true,
        accounting: {
          requestId: "req_sanitized",
          durationMs: 20,
          inputTokens: 100,
          outputTokens: 20,
          toolEvents: [{ type: "web_search", count: 1 }],
          observedOrEstimatedFinalCostUsd: 0.25,
        },
      }),
    });
    const snapshot = ledger.snapshot();

    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0]).toMatchObject({ status: "failure", billingDisposition: "unknown", estimatedMaximumCostUsd: 1 });
    expect(snapshot.entries[1]).toMatchObject({ status: "success", retryOfCallId: "attempt_1", observedOrEstimatedFinalCostUsd: 0.25 });
    expect(snapshot.cumulativeReservedUsd).toBe(2);
    expect(snapshot.cumulativeObservedUsd).toBe(0.25);
    expect(snapshot.cumulativeBudgetCommittedUsd).toBe(1.25);
    expect(snapshot.cumulativeReleasedUsd).toBe(0.75);
    expect(snapshot.remainingBudgetUsd).toBe(8.75);
    expect(snapshot.entries[1]).toMatchObject({
      currency: "USD",
      fixedPointScale: 1_000_000_000,
      pricingPolicyRef: "sanitized_pricing_policy_v1",
      provider: "sanitized_provider",
      model: "sanitized_model",
      toolClass: "web_search",
      maximumInputTokens: 1000000,
      maximumOutputTokens: 50000,
      maximumToolUses: 2,
      attemptKind: "retry",
    });
  });

  it("does not invoke a retry that cannot receive a new full reservation", async () => {
    const ledger = new EvaluationCostBudgetLedger(1);
    ledger.reserve(costReservation({ callId: "failed_parent", estimatedMaximumCostUsd: 0.75 }));
    ledger.finalize("failed_parent", { status: "failure", durationMs: 4, billingDisposition: "unknown" });
    let invoked = 0;

    await expect(executeBudgetedProviderCall({
      ledger,
      reservation: costReservation({
        callId: "blocked_retry",
        attempt: 2,
        retryOfCallId: "failed_parent",
        estimatedMaximumCostUsd: 0.26,
      }),
      invoke: async () => {
        invoked += 1;
        return { value: true, accounting: { durationMs: 1, observedOrEstimatedFinalCostUsd: 0.01 } };
      },
    })).rejects.toMatchObject({ code: "insufficient_budget_reservation" });
    expect(invoked).toBe(0);
    expect(ledger.snapshot()).toMatchObject({ cumulativeBudgetCommittedUsd: 0.75, remainingBudgetUsd: 0.25 });
  });

  it("retains the full reservation for an unknown potentially billable timeout", () => {
    const ledger = new EvaluationCostBudgetLedger(2);
    ledger.reserve(costReservation({ callId: "timed_out_call", capability: "semantic_verification", estimatedMaximumCostUsd: 0.8 }));
    ledger.finalize("timed_out_call", { status: "timeout", durationMs: 30_000, billingDisposition: "unknown" });

    expect(ledger.snapshot()).toMatchObject({
      cumulativeReservedUsd: 0.8,
      cumulativeBudgetCommittedUsd: 0.8,
      cumulativeReleasedUsd: 0,
      remainingBudgetUsd: 1.2,
      entries: [{ status: "timeout", worstCaseReservedCostUsd: 0.8, billingDisposition: "unknown" }],
    });
  });

  it("keeps Packages B-E invariant when only true runtime metadata changes", () => {
    const before = financialPackages();
    const after = structuredClone(before);
    (after.opportunityEngine as any).runtimeMetadata = { requestId: "request_changed", timestamp: "2030-01-01" };
    const result = provePackagesBEFinancialInvariance(before, after);

    expect(result.invariant).toBe(true);
    expect(result.packages.every((item) => item.beforeHash === item.afterHash)).toBe(true);
    expect(result.liveRunBlocked).toBe(false);
  });

  it("excludes only reviewed runtime, provider, timestamp, and evidence-location keys", () => {
    expect([...excludedFinancialProjectionKeys]).toEqual([
      "createdAt", "updatedAt", "timestamp", "timestamps", "requestId", "requestIds", "executionRef",
      "provider", "providerRoute", "model", "runtimeMetadata", "reviewedAt", "documentId", "pageNumber",
      "lineId", "rowIndex", "normalizedSourceText",
    ]);
    for (const semanticKey of [
      "label", "originalLabel", "displayName", "description", "selectedLabel", "selectionReason",
      "rejectionReason", "reason", "reasonCode", "explanation", "limitations", "inclusionReasonCodes",
      "exclusionReasonCodes", "cadence", "calculation", "actionabilityCeiling",
    ]) {
      expect(excludedFinancialProjectionKeys.has(semanticKey), semanticKey).toBe(false);
    }
  });

  it("protects CanonicalFeeRow.selectedLabel in Package C at the exact path", () => {
    const before = financialPackages();
    const after = structuredClone(before);
    after.feeLedger.rows[0]!.selectedLabel = "Changed authoritative fee label";
    const result = provePackagesBEFinancialInvariance(before, after);

    expect(result.packages.find((item) => item.package === "package_c")?.invariant).toBe(false);
    expect(result.beforeCombinedHash).not.toBe(result.afterCombinedHash);
    expect(result.mismatchPaths).toEqual(["package_c.rows[0].selectedLabel"]);
  });

  it.each([
    ["Package B explanation", "package_b.effectiveRateBasis.explanation", (value: PackagesBEProjectionInput) => { value.financialFacts.effectiveRateBasis.explanation = "Changed calculation meaning."; }],
    ["Package C parser label", "package_c.parserInterpretations[0].label", (value: PackagesBEProjectionInput) => { value.feeLedger.parserInterpretations[0]!.label = "Changed parsed fee label"; }],
    ["Package C control label", "package_c.controls[0].label", (value: PackagesBEProjectionInput) => { value.feeLedger.controls[0]!.label = "Changed reconciliation control"; }],
    ["Package C rejection reason", "package_c.rows[0].rejectedAmountCandidates[0].reason", (value: PackagesBEProjectionInput) => { value.feeLedger.rows[0]!.rejectedAmountCandidates[0]!.reason = "Changed selection basis."; }],
    ["Package D selection reason", "package_d.rowClassifications[0].selected.selectionReason", (value: PackagesBEProjectionInput) => { value.feeOwnershipActionability.rowClassifications[0]!.selected.selectionReason = "Changed classification selection."; }],
    ["Package D candidate reason", "package_d.rowClassifications[0].candidates[0].reason", (value: PackagesBEProjectionInput) => { value.feeOwnershipActionability.rowClassifications[0]!.candidates[0]!.reason = "Changed classification meaning."; }],
    ["Package E cadence reason", "package_e.components[0].cadence.reason", (value: PackagesBEProjectionInput) => { value.opportunityEngine.components[0]!.cadence.reason = "Changed cadence proof."; }],
    ["Package E exclusion reason", "package_e.components[0].exclusionReasonCodes[0]", (value: PackagesBEProjectionInput) => { value.opportunityEngine.components[0]!.exclusionReasonCodes.push("changed_exclusion"); }],
    ["Package E calculation input label", "package_e.canonicalCalculationRecords[0].inputs[0].label", (value: PackagesBEProjectionInput) => { value.calculations![0]!.inputs[0]!.label = "Changed calculation input"; }],
  ])("protects semantic %s fields", (_label, expectedPath, mutate) => {
    const before = financialPackages();
    const after = structuredClone(before);
    mutate(after);
    const result = provePackagesBEFinancialInvariance(before, after);
    expect(result.invariant).toBe(false);
    expect(result.beforeCombinedHash).not.toBe(result.afterCombinedHash);
    expect(result.mismatchPaths).toEqual([expectedPath]);
  });

  it("detects a financial mutation at its exact Package E path", () => {
    const before = financialPackages();
    const after = structuredClone(before);
    (after.opportunityEngine as any).summary.totalEligibleAnnualAmount.amountMinor = 1201;
    const result = provePackagesBEFinancialInvariance(before, after);

    expect(result.invariant).toBe(false);
    expect(result.liveRunBlocked).toBe(true);
    expect(result.mismatchPaths).toEqual(["package_e.summary.totalEligibleAnnualAmount.amountMinor"]);
  });

  it.each([
    ["Package B", "package_b", "package_b.processedSales.value.amountMinor", (value: any) => { value.financialFacts.processedSales.value.amountMinor = 100_001; }],
    ["Package C", "package_c", "package_c.parserInterpretations[0].amount.amountMinor", (value: any) => { value.feeLedger.parserInterpretations[0].amount.amountMinor = 3001; }],
    ["Package D", "package_d", "package_d.rowClassifications[0].selected.category", (value: any) => { value.feeOwnershipActionability.rowClassifications[0].selected.category = "administrative_fee"; }],
    ["Package E", "package_e", "package_e.components[0].inclusionStatus", (value: any) => { value.opportunityEngine.components[0].inclusionStatus = "excluded"; }],
  ])("changes the %s and combined hashes at the exact path", (_label, packageName, expectedPath, mutate) => {
    const before = financialPackages();
    const after = structuredClone(before);
    mutate(after);
    const result = provePackagesBEFinancialInvariance(before, after);
    const changed = result.packages.find((item) => item.package === packageName)!;

    expect(changed.beforeHash).not.toBe(changed.afterHash);
    expect(result.beforeCombinedHash).not.toBe(result.afterCombinedHash);
    expect(result.mismatchPaths).toEqual([expectedPath]);
    expect(result.packages.filter((item) => item.package !== packageName).every((item) => item.invariant)).toBe(true);
  });

  it("distinguishes missing, null, zero, empty, and reordered canonical values", () => {
    const variants = [
      (() => { const value = financialPackages(); delete (value.financialFacts as any).adjustments; return value; })(),
      (() => { const value = financialPackages(); (value.financialFacts as any).adjustments = null; return value; })(),
      (() => { const value = financialPackages(); (value.financialFacts as any).adjustments = 0; return value; })(),
      (() => { const value = financialPackages(); (value.financialFacts as any).adjustments = []; return value; })(),
      (() => { const value = financialPackages(); (value.financialFacts as any).adjustments = {}; return value; })(),
    ];
    const hashes = variants.map((value) => provePackagesBEFinancialInvariance(value as PackagesBEProjectionInput, value as PackagesBEProjectionInput).packages[0]!.beforeHash);
    expect(new Set(hashes).size).toBe(variants.length);

    const before = financialPackages();
    const reordered = structuredClone(before);
    reordered.feeLedger.parserInterpretations.reverse();
    const result = provePackagesBEFinancialInvariance(before, reordered);
    expect(result.packages.find((item) => item.package === "package_c")?.invariant).toBe(false);
    expect(result.mismatchPaths.some((item) => item.startsWith("package_c.parserInterpretations[0]"))).toBe(true);
  });

  it("includes top-level canonical calculation records referenced by Package E", () => {
    const before = financialPackages();
    const after = structuredClone(before);
    (after.calculations[0]!.result as { amountMinor: number }).amountMinor = 1201;
    const result = provePackagesBEFinancialInvariance(before, after);

    expect(result.packages.find((item) => item.package === "package_e")?.invariant).toBe(false);
    expect(result.mismatchPaths).toEqual(["package_e.canonicalCalculationRecords[0].result.amountMinor"]);
  });

  it("reaches the fake live transport only after manifest, scope, stage, byte, and budget gates pass", async () => {
    const fixture = await approvedFixture();
    const events: string[] = [];
    let adapterConstructions = 0;
    let transportInvocations = 0;
    const receivedPackets: unknown[] = [];
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "success-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => {
        events.push(`resolve:${row.sourceDocumentId}`);
        return fixture.sourceBytesByRef.get(row.internalSourceRef)!;
      },
      onAdapterCreatedForTesting: () => {
        adapterConstructions += 1;
        events.push("adapter");
      },
      transportForTesting: async (transportInput) => {
        events.push("invoke");
        transportInvocations += 1;
        receivedPackets.push(transportInput.sanitizedPacket);
        expect(Object.keys(transportInput).sort()).toEqual(["approvedCallMetadata", "reservedCallId", "sanitizedPacket", "sourceDocumentId", "stage"]);
        expect(transportInput.approvedCallMetadata.callId).toBe(transportInput.reservedCallId);
        return {
          value: true,
          accounting: { durationMs: 2, inputTokens: 100, outputTokens: 20, observedOrEstimatedFinalCostUsd: 0.1, billingDisposition: "observed" },
          lifecycle: { generated: true, schemaValid: true, evidenceValidated: true, policyAccepted: true },
        };
      },
    });

    expect(adapterConstructions).toBe(1);
    expect(transportInvocations).toBe(2);
    expect(events.indexOf("adapter")).toBeGreaterThan(events.findLastIndex((item) => item.startsWith("resolve:")));
    expect(receivedPackets).toEqual([
      { packetVersion: "sanitized_packet_v1", fixtureSeed: "alpha" },
      { packetVersion: "sanitized_packet_v1", fixtureSeed: "gamma" },
    ]);
    expect(result.costLedger).toMatchObject({ cumulativeReservedUsd: 1, cumulativeObservedUsd: 0.2, cumulativeReleasedUsd: 0.8 });
    expect(result.liveRunBlocked).toBe(false);
    expect(result.artifact.executionPermit.manifestPath).toBe("internal:approved_manifest");
    expect(JSON.stringify(result.artifact)).not.toContain(fixture.directory);
    const alphaLifecycle = result.lifecycleLedger.documents.find((item) => item.sourceDocumentId === "doc_alpha")!;
    expect(alphaLifecycle.aiStates).toMatchObject({
      executed: { state: "completed" },
      generated: { state: "completed" },
      schema_valid: { state: "completed" },
      evidence_validated: { state: "completed" },
      policy_accepted: { state: "completed" },
      canonical_admitted: { state: "not_reached" },
      customer_published: { state: "not_reached" },
    });
    expect(alphaLifecycle.events.find((event) => event.stage === "research_retrieval")?.state).toBe("not_reached");
    expect(alphaLifecycle.events.find((event) => event.stage === "final_artifact")).toMatchObject({
      state: "completed",
      finalArtifactRef: "self:artifactContentHash",
    });
    expect(verifyEvaluationRunIntegrityArtifact(result.artifact)).toBe(true);
  });

  it("records reached research, semantic, admission, publication, and provider references from actual calls", async () => {
    const fixture = await approvedFixture();
    const stages = ["whole_statement_ai_review", "web_search_discovery", "document_retrieval", "semantic_verification"] as const;
    const requestedExecutions = fixture.requests.map((request) => request.sourceDocumentId === "doc_alpha"
      ? { ...request, stages: ["parser", ...stages, "canonical_admission", "customer_publication", "final_artifact"] as EvaluationExecutionStage[] }
      : request);
    const calls = stages.map((stage, index) => ({
      sourceDocumentId: "doc_alpha",
      stage,
      reservation: costReservation({
        callId: `lifecycle_call_${index + 1}`,
        capability: stage === "whole_statement_ai_review"
          ? "ai_sdk"
          : stage === "web_search_discovery"
            ? "web_search"
            : stage === "document_retrieval"
              ? "retrieval"
              : "semantic_verification",
        estimatedMaximumCostUsd: 0.5,
      }),
    }));
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions,
      approvedBudgetUsd: 10,
      calls,
      outputArtifactPath: path.join(fixture.directory, "complete-lifecycle.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      transportForTesting: async ({ reservedCallId, stage }) => ({
        value: true,
        accounting: {
          requestId: `request_${reservedCallId}`,
          durationMs: 2,
          inputTokens: 10,
          outputTokens: 2,
          observedOrEstimatedFinalCostUsd: 0.1,
          billingDisposition: "observed",
        },
        lifecycle: {
          generated: true,
          schemaValid: true,
          evidenceValidated: true,
          policyAccepted: true,
          canonicalAdmitted: stage === "semantic_verification",
          customerPublished: stage === "semantic_verification",
          researchRetrievalRefs: stage === "web_search_discovery" || stage === "document_retrieval" ? [`research:${reservedCallId}`] : [],
          semanticVerificationRef: stage === "semantic_verification" ? `semantic:${reservedCallId}` : null,
          canonicalAdmissionRef: stage === "semantic_verification" ? `admission:${reservedCallId}` : null,
          customerPublicationRef: stage === "semantic_verification" ? `publication:${reservedCallId}` : null,
          reasonCodes: [`completed_${stage}`],
        },
      }),
    });

    const lifecycle = result.lifecycleLedger.documents.find((item) => item.sourceDocumentId === "doc_alpha")!;
    expect(lifecycle.events.filter((event) => event.stage === "capability_execution")).toHaveLength(4);
    expect(lifecycle.events.filter((event) => event.stage === "provider_request").map((event) => event.providerRequestRef)).toEqual(
      calls.map((call) => `provider:${call.reservation.callId}`),
    );
    expect(lifecycle.events.filter((event) => event.stage === "research_retrieval").flatMap((event) => event.researchRetrievalRefs)).toEqual([
      "research:lifecycle_call_2",
      "research:lifecycle_call_3",
    ]);
    expect(lifecycle.events.find((event) => event.stage === "semantic_verification")).toMatchObject({
      state: "completed",
      semanticVerificationRef: "semantic:lifecycle_call_4",
    });
    expect(lifecycle.events.find((event) => event.stage === "canonical_admission")).toMatchObject({
      state: "completed",
      canonicalAdmissionRef: "admission:lifecycle_call_4",
    });
    expect(lifecycle.events.find((event) => event.stage === "customer_publication")).toMatchObject({
      state: "completed",
      customerPublicationRef: "publication:lifecycle_call_4",
    });
    expect(Object.values(lifecycle.aiStates).every((state) => state.state === "completed")).toBe(true);
  });

  it("preserves deterministic legacy script behavior and blocks only each --live-ai branch", async () => {
    expect(() => blockUnmanifestedLiveEvaluationEntrypoint("legacy-test")).toThrow("Unmanifested live evaluation entry point is disabled");
    for (const relativePath of ["scripts/run-two-pdf-multi-statement-report.ts", "scripts/run-pepe-orchestrator-integration.ts"]) {
      const source = await readFile(path.resolve(process.cwd(), relativePath), "utf8");
      const guard = source.indexOf("if (liveAi) blockUnmanifestedLiveEvaluationEntrypoint(\"");
      const sourceSelection = Math.min(
        ...[source.indexOf("const inputs:"), source.indexOf("const pdfs =")].filter((index) => index >= 0),
      );
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(guard).toBeLessThan(sourceSelection);
      expect(source).toContain("analyzeStatementDocument");
    }
  });

  it("removes paid-provider bypasses from statement fixture and live-preview generators", async () => {
    const fixtureGenerator = await readFile(path.resolve(process.cwd(), "scripts/generate-el-nuevo-tequila-fixtures.ts"), "utf8");
    expect(fixtureGenerator).toContain("analyzeStatementDocument(");
    expect(fixtureGenerator).not.toContain("analyzeStatementDocumentWithOptionalAi");

    const previewGenerator = await readFile(path.resolve(process.cwd(), "scripts/generate-el-nuevo-tequila-global-report.ts"), "utf8");
    const guard = previewGenerator.indexOf("blockUnmanifestedLiveEvaluationEntrypoint(\"generate-el-nuevo");
    const providerInvocation = previewGenerator.indexOf("await maybeRunMultiStatementNarrativeAiForGlobalReport");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(providerInvocation);

    const liveRunner = await readFile(path.resolve(process.cwd(), "scripts/evaluation-run-integrity-run.ts"), "utf8");
    expect(liveRunner).toContain('args.get("adapter-id") ?? "one_time_statement_evaluation_v1"');
    expect(liveRunner).toContain("repositoryEvaluationAdapterIds");
    expect(liveRunner).not.toContain("pathToFileURL");
    expect(liveRunner).not.toContain('requiredArg(args, "adapter")');
  });

  it("keeps the fake transport untouched when resolved bytes do not match the manifest", async () => {
    const fixture = await approvedFixture();
    let adapterConstructions = 0;
    let transportInvocations = 0;

    await expect(runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "substitution-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => row.sourceDocumentId === "doc_alpha"
        ? Buffer.from("substituted bytes")
        : fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      onAdapterCreatedForTesting: () => {
        adapterConstructions += 1;
      },
      transportForTesting: async () => {
        transportInvocations += 1;
        return successfulTransportResult();
      },
    })).rejects.toMatchObject({ code: "source_substituted" });
    expect(adapterConstructions).toBe(0);
    expect(transportInvocations).toBe(0);
  });

  it("keeps the fake transport untouched when verified bytes mutate before packet construction completes", async () => {
    const fixture = await approvedFixture();
    let adapterConstructions = 0;
    let transportInvocations = 0;

    await expect(runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "mutation-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      beforePacketPreparationForTesting: (_sourceDocumentId, verifiedSourceBytes) => {
        verifiedSourceBytes[0] = (verifiedSourceBytes[0] ?? 0) ^ 0xff;
      },
      onAdapterCreatedForTesting: () => { adapterConstructions += 1; },
      transportForTesting: async () => {
        transportInvocations += 1;
        return successfulTransportResult();
      },
    })).rejects.toThrow();
    expect(adapterConstructions).toBe(0);
    expect(transportInvocations).toBe(0);
  });

  it("rejects source identity inside the sanitized packet before transport invocation", async () => {
    const fixture = await approvedFixture();
    const unsafeBytes = Buffer.from(JSON.stringify({
      type: "verified_canonical_evaluation_packet_v1",
      sanitizedPacket: { packetVersion: "sanitized_packet_v1", filePath: "/sensitive/source.pdf" },
      canonicalState: financialPackages(),
    }));
    const preflight = createDeterministicPreflightArtifact({
      artifactId: "preflight_source_identity_rejection",
      documents: fixture.preflight.documents.map((document) => document.sourceDocumentId === "doc_alpha"
        ? { ...document, sha256: checksumBytes(unsafeBytes), byteCount: unsafeBytes.byteLength }
        : document),
    });
    const manifest = buildEvaluationSourceManifest(preflight);
    await writeFile(fixture.manifestPath, `${JSON.stringify(manifest)}\n`);
    const sourceBytesByRef = new Map(fixture.sourceBytesByRef);
    sourceBytesByRef.set("source_alpha", unsafeBytes);
    let adapterConstructions = 0;
    let transportInvocations = 0;

    await expect(runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "identity-leak-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => sourceBytesByRef.get(row.internalSourceRef)!,
      onAdapterCreatedForTesting: () => { adapterConstructions += 1; },
      transportForTesting: async () => { transportInvocations += 1; return successfulTransportResult(); },
    })).rejects.toMatchObject({ code: "sanitized_packet_source_identity_leak" });
    expect(adapterConstructions).toBe(0);
    expect(transportInvocations).toBe(0);
  });

  it("rejects repository-contained artifacts even when launched from a repository subdirectory", async () => {
    const repositoryRoot = process.cwd();
    const implementation = await readFile(path.join(repositoryRoot, "src/evaluationIntegrity/execution.ts"), "utf8");
    expect(implementation).not.toContain("path.relative(process.cwd()");
    expect(implementation).toContain("fileURLToPath(import.meta.url)");
    await expect(assertOutsideRepositoryArtifactPath(
      path.join(repositoryRoot, "artifacts/forbidden-evaluation-artifact.json"),
    )).rejects.toThrow("Evaluation artifact must be written outside the repository");
    const directory = await mkdtemp(path.join(tmpdir(), "evaluation-repository-alias-"));
    const repositoryAlias = path.join(directory, "repository-link");
    await symlink(repositoryRoot, repositoryAlias, "dir");
    await expect(assertOutsideRepositoryArtifactPath(
      path.join(repositoryAlias, "artifacts/forbidden-through-symlink.json"),
    )).rejects.toThrow("Evaluation artifact must be written outside the repository");
  });

  it("runs the repository one-time evaluation chain through fakes using only the exact verified packet", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const invocations = { whole: 0, search: 0, retrieval: 0, semantic: 0 };
    let adapterConstructions = 0;
    let preparedPacket: any = null;
    let wholePacket: any = null;
    let searchedFeeLabel = "";
    let searchedQuestionCount = 0;
    const approvedCallMetadata: Array<{
      callId: string;
      parentCallId?: string | null;
      operationKind?: string;
      provider: string;
      model: string | null;
      toolClass: string;
    }> = [];

    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: oneTimePaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "one-time-success-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      businessType: "restaurant_food_beverage",
      resolveSourceBytes: async () => fixture.bytes,
      afterPacketPreparedForTesting: (_sourceDocumentId, packet) => { preparedPacket = packet; },
      onAdapterCreatedForTesting: () => { adapterConstructions += 1; },
      oneTimeServicesForTesting: {
        wholeStatementReview: async (packet, serviceContext) => {
          invocations.whole += 1;
          wholePacket = structuredClone(packet);
          approvedCallMetadata.push(serviceContext.approvedCallMetadata);
          return externalRequestResult({}, "request_whole", "whole_statement_ai_review");
        },
        webSearchDiscovery: async (request, serviceContext) => {
          invocations.search += 1;
          approvedCallMetadata.push(serviceContext.approvedCallMetadata);
          searchedFeeLabel = request.questions[0]!.feeLabel;
          searchedQuestionCount = request.questions.length;
          return externalRequestResult(
            [{ url: "https://syntheticprocessor.test/official-fee-guide", title: "Official fee guide", publisher: "Synthetic Processor" }],
            "request_search",
            "web_search",
          );
        },
        documentRetrieval: async (url, options) => {
          invocations.retrieval += 1;
          approvedCallMetadata.push(options.approvedCallMetadata);
          const document = await retrieveFeeKnowledgeDocument(url, {
            abortSignal: options.abortSignal,
            resolveHost: async () => ["93.184.216.34"],
            fetchImpl: async () => new Response(
              `<html><body><h1>Official fee guide</h1><p>${searchedFeeLabel} is described in this published processing guide.</p></body></html>`,
              { status: 200, headers: { "content-type": "text/html" } },
            ),
          });
          return externalRequestResult(document, "request_retrieval", "document_retrieval");
        },
        semanticVerification: async (request, serviceContext) => {
          invocations.semantic += 1;
          approvedCallMetadata.push(serviceContext.approvedCallMetadata);
          return externalRequestResult({
            type: "fee_knowledge_semantic_support_decision",
            policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
            decision: "supports",
            structuredClaim: request.structuredClaim,
            reasonCodes: ["fake_semantic_support"],
            providerDetailsStripped: true,
          }, "request_semantic", "semantic_verification");
        },
      },
    });

    expect(adapterConstructions).toBe(1);
    expect(invocations.whole).toBeGreaterThan(0);
    expect(invocations.search).toBe(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(searchedQuestionCount).toBe(1);
    expect(invocations.retrieval).toBe(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(invocations.semantic).toBeGreaterThan(0);
    expect(invocations.semantic).toBeLessThanOrEqual(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(wholePacket.admittedFeeRows.length).toBeLessThanOrEqual(preparedPacket.wholeStatementReview.admittedFeeRows.length);
    expect(wholePacket.sourceProvenancePacket.researchAttempts.length).toBeGreaterThan(0);
    expect(result.finalStatus).toBe("completed");
    expect(result.packageFinancialInvariance[0]!.result.invariant).toBe(true);
    expect(result.packageFinancialInvariance[0]!.result.packages.every((item) => item.beforeHash === item.afterHash)).toBe(true);
    const expectedOneTimeCalls = oneTimePaidCalls();
    const nonWorkUnitOutcomes = result.providerCallOutcomes.filter((item) => item.operationKind !== "package_5b_work_unit");
    const workUnitOutcomes = result.providerCallOutcomes.filter((item) => item.operationKind === "package_5b_work_unit");
    const sentWorkUnitOutcomes = workUnitOutcomes.filter((item) => item.status !== "cancelled_before_send");
    expect(nonWorkUnitOutcomes.map((item) => item.stage)).toEqual(expectedOneTimeCalls.map((call) => call.stage));
    expect(sentWorkUnitOutcomes).toHaveLength(invocations.whole);
    expect(workUnitOutcomes.every((item) => item.stage === "whole_statement_ai_review")).toBe(true);
    expect(result.costLedger.entries.filter((item) => item.requestId === "request_search")).toHaveLength(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(result.costLedger.entries.filter((item) => item.requestId === "request_retrieval")).toHaveLength(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(result.costLedger.entries.filter((item) => item.requestId === "request_semantic")).toHaveLength(invocations.semantic);
    const reservationByCall = new Map(expectedOneTimeCalls.map((call) => [call.reservation.callId, call.reservation]));
    const wholeCallId = expectedOneTimeCalls.find((call) => call.stage === "whole_statement_ai_review")!.reservation.callId;
    const wholeReservation = reservationByCall.get(wholeCallId)!;
    expect(result.costLedger.entries.find((item) => item.callId === wholeCallId))
      .toMatchObject({ capability: "ai_sdk", status: "success", requestId: null });
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    expect(result.artifact.canonicalAdmissionResults[0]!.package5bWorkPlan?.units.filter((unit) => unit.requestId === "request_whole"))
      .toHaveLength(invocations.whole);
    const parentMetadata = approvedCallMetadata.filter((metadata) => reservationByCall.has(metadata.callId));
    const childWholeMetadata = approvedCallMetadata.filter((metadata) => metadata.parentCallId === wholeCallId);
    expect(parentMetadata).toHaveLength(approvedCallMetadata.length - invocations.whole);
    expect(childWholeMetadata).toHaveLength(invocations.whole);
    expect(parentMetadata.every((metadata) => {
      const reservation = reservationByCall.get(metadata.callId);
      return reservation?.provider === metadata.provider
        && reservation.model === metadata.model
        && reservation.toolClass === metadata.toolClass;
    })).toBe(true);
    expect(childWholeMetadata.every((metadata) =>
      metadata.operationKind === "package_5b_work_unit"
      && metadata.provider === wholeReservation.provider
      && metadata.model === wholeReservation.model
      && metadata.toolClass === wholeReservation.toolClass
    )).toBe(true);
    expect(result.costLedger.entries.every((item) => item.status === "success")).toBe(true);
    expect(result.costLedger.entries.filter((item) => item.requestId !== null && item.operationKind !== "package_5b_work_unit")
      .every((item) => item.billingDisposition === "observed" && item.observedOrEstimatedFinalCostUsd === 0.1)).toBe(true);
    expect(result.costLedger.entries.filter((item) => item.operationKind === "package_5b_work_unit" && item.status === "success")
      .every((item) => item.billingDisposition === "observed" && item.observedOrEstimatedFinalCostUsd === FAKE_WHOLE_STATEMENT_OBSERVED_COST_USD)).toBe(true);
    expect(result.costLedger.entries.filter((item) => item.operationKind === "package_5b_work_unit" && item.status === "cancelled_before_send")
      .every((item) => item.billingDisposition === "provider_confirmed_zero" && item.observedOrEstimatedFinalCostUsd === 0)).toBe(true);
    const lifecycle = result.lifecycleLedger.documents[0]!;
    expect(lifecycle.aiStates.canonical_admitted.state).toBe("withheld");
    expect(lifecycle.aiStates.customer_published.state).toBe("not_reached");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    if (result.artifact.type !== "evaluation_run_integrity_artifact_v2") throw new Error("expected V2 artifact");
    const candidates = result.artifact.canonicalAdmissionResults[0]!.researchEvidence.candidates;
    expect(candidates).toHaveLength(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(candidates.every((candidate) => candidate.retrievalStatus === "retrieved_text" && candidate.semanticVerificationStatus === "completed")).toBe(true);
    expect(candidates.every((candidate) => candidate.safeRetrievalDiagnostics?.outcomeClass === "successful_usable_retrieval")).toBe(true);
    expect(candidates.every((candidate) => candidate.safeRetrievalDiagnostics?.sourceDomain === "syntheticprocessor.test")).toBe(true);
    expect(candidates.every((candidate) => candidate.safeRetrievalDiagnostics?.documentFingerprint?.startsWith("sha256:"))).toBe(true);
    const serviceExposed = JSON.stringify({ preparedPacket, wholePacket });
    const audited = JSON.stringify(result.artifact);
    expect(audited).not.toContain("https://syntheticprocessor.test/official-fee-guide");
    expect(serviceExposed).not.toContain(fixture.sourcePath);
    expect(serviceExposed).not.toContain("approved-statement.pdf");
    expect(audited).not.toContain(fixture.sourcePath);
    expect(audited).not.toContain("approved-statement.pdf");
    expect(result.artifact.sourceIdentity[0]).not.toHaveProperty("displayFileName");
    expect(result.artifact.sourceIdentity[0]!.displayFileNameHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(audited).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]/);
  }, 30_000);

  it("releases stage reservations when no external retrieval or semantic request is sent", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const invocations = { whole: 0, search: 0, retrieval: 0, semantic: 0 };
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: oneTimePaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "one-time-no-candidates-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      resolveSourceBytes: async () => fixture.bytes,
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => { invocations.whole += 1; return externalRequestResult({}, "request_whole_empty", "whole_statement_ai_review"); },
        webSearchDiscovery: async () => { invocations.search += 1; return externalRequestResult([], "request_search_empty", "web_search"); },
        documentRetrieval: async () => { invocations.retrieval += 1; throw new Error("must not run"); },
        semanticVerification: async (request) => {
          invocations.semantic += 1;
          return externalRequestResult({
            type: "fee_knowledge_semantic_support_decision",
            policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
            decision: "unsupported",
            structuredClaim: request.structuredClaim,
            reasonCodes: ["must_not_run"],
            providerDetailsStripped: true,
          }, "request_semantic_must_not_run", "semantic_verification");
        },
      },
    });

    expect(invocations.whole).toBeGreaterThan(0);
    expect(invocations).toMatchObject({ search: ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch, retrieval: 0, semantic: 0 });
    expect(result.costLedger.entries.filter((item) => item.requestId === "request_search_empty")).toHaveLength(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(result.costLedger.entries.at(-1)).toMatchObject({ status: "success" });
    expect(result.costLedger.entries.filter((item) => item.requestId === null && item.capability !== "ai_sdk").every((item) => item.status === "success" && item.observedOrEstimatedFinalCostUsd === 0 && item.billingDisposition === "provider_confirmed_zero")).toBe(true);
    const expectedObservedCost = 0.1 * ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch + FAKE_WHOLE_STATEMENT_OBSERVED_COST_USD * invocations.whole;
    expect(result.costLedger.cumulativeObservedUsd).toBeCloseTo(expectedObservedCost);
    expect(result.costLedger.cumulativeBudgetCommittedUsd).toBeCloseTo(expectedObservedCost);
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
  }, 30_000);

  it("retains web-search timeouts as research limitations and still invokes Package 5B", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const invocations = { whole: 0, search: 0, retrieval: 0, semantic: 0 };
    const timeout = Object.assign(new Error("private fake timeout detail"), {
      name: "AbortError",
      accounting: { requestId: "request_fake_timeout", durationMs: 50, inputTokens: 20, outputTokens: 0 },
    });
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: oneTimePaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "one-time-timeout-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      resolveSourceBytes: async () => fixture.bytes,
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => {
          invocations.whole += 1;
          return externalRequestResult({}, "request_whole_after_research_timeout", "whole_statement_ai_review");
        },
        webSearchDiscovery: async () => { invocations.search += 1; throw timeout; },
        documentRetrieval: async () => { invocations.retrieval += 1; throw new Error("must not run"); },
        semanticVerification: async (request) => {
          invocations.semantic += 1;
          return {
            type: "fee_knowledge_semantic_support_decision",
            policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
            decision: "unsupported",
            structuredClaim: request.structuredClaim,
            reasonCodes: ["must_not_run"],
            providerDetailsStripped: true,
          };
        },
      },
    });

    expect(invocations.whole).toBeGreaterThan(0);
    expect(invocations).toMatchObject({ search: ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch, retrieval: 0, semantic: 0 });
    expect(result.finalStatus).toBe("completed");
    expect(result.costLedger.entries[0]).toMatchObject({ status: "timeout", billingDisposition: "unknown", requestId: "request_fake_timeout" });
    expect(result.costLedger.entries.filter((item) => item.capability === "web_search").every((item) => item.status === "timeout")).toBe(true);
    expect(result.costLedger.entries.filter((item) => ["retrieval", "semantic_verification"].includes(item.capability)).every((item) => item.status === "success" && item.requestId === null)).toBe(true);
    expect(result.costLedger.entries.at(-1)).toMatchObject({ status: "success" });
    expect(result.providerCallOutcomes.filter((item) => item.stage === "web_search_discovery").every((item) => item.status === "timeout")).toBe(true);
    expect(result.providerCallOutcomes.filter((item) => ["document_retrieval", "semantic_verification"].includes(item.stage)).every((item) => item.status === "success")).toBe(true);
    expect(result.providerCallOutcomes.at(-1)).toMatchObject({ stage: "whole_statement_ai_review", status: "success" });
    expect(JSON.stringify(result.artifact)).not.toContain("private fake timeout detail");
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
    expect(JSON.parse(await readFile(result.artifactPath, "utf8"))).toEqual(result.artifact);
  }, 30_000);

  it("persists only normalized provider failure diagnostics and a safe request ID", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const rawSecret = "raw-openai-body-with-private-request-data";
    const providerError = safeProviderFailureError(null, {
      status: 400,
      headers: new Headers({ "x-request-id": "req_safe_artifact_400" }),
      body: { error: { type: "invalid_request_error", code: "invalid_json_schema", message: rawSecret } },
    });
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: oneTimePaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "one-time-safe-provider-failure-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      resolveSourceBytes: async () => fixture.bytes,
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => externalRequestResult({}, "request_whole_after_safe_failure", "whole_statement_ai_review"),
        webSearchDiscovery: async () => { throw providerError; },
        documentRetrieval: async () => { throw new Error("must not run"); },
        semanticVerification: async () => { throw new Error("must not run"); },
      },
    });

    const failedSearch = result.artifact.providerCallOutcomes.find((outcome) => outcome.stage === "web_search_discovery");
    expect(failedSearch).toMatchObject({
      status: "failure",
      requestId: "req_safe_artifact_400",
    });
    expect(failedSearch?.reasonCodes).toEqual(expect.arrayContaining([
      "provider_error_code_invalid_json_schema",
      "provider_error_type_invalid_request_error",
      "provider_http_status_400",
      "provider_schema_rejected",
    ]));
    expect(JSON.stringify(result.artifact)).not.toContain(rawSecret);
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
  }, 30_000);

  it("classifies HTTP 200 AI SDK structured-output handling errors without network language", () => {
    const error = Object.assign(new Error("No output generated."), {
      name: "AI_NoOutputGeneratedError",
      usage: {
        inputTokens: 1_234,
        inputTokenDetails: { cacheReadTokens: 100 },
        outputTokens: 1_916,
      },
    });
    const safe = safeProviderFailureError(error, {
      status: 200,
      headers: new Headers({ "x-request-id": "req_safe_no_output" }),
    }, {
      operationPhase: "sdk_structured_output_handling",
      transport: "ai_sdk_generate_text_structured_output",
      httpSendInitiated: true,
      providerResponseReceived: true,
      httpStatus: 200,
      requestId: "req_safe_no_output",
    });

    expect(safe.reasonCode).toBe("provider_structured_output_failed");
    expect(safe.reasonCodes).toEqual(expect.arrayContaining([
      "provider_http_send_initiated",
      "provider_http_status_200",
      "provider_http_status_class_2xx",
      "provider_phase_sdk_structured_output_handling",
      "provider_response_received",
      "provider_sdk_error_class_ai_nooutputgeneratederror",
      "provider_structured_output_failed",
      "provider_transport_ai_sdk_generate_text_structured_output",
    ]));
    expect(safe.reasonCodes).not.toContain("provider_network_failed");
    expect(safe.accounting).toMatchObject({
      requestId: "req_safe_no_output",
      inputTokens: 1_234,
      cachedInputTokens: 100,
      outputTokens: 1_916,
    });
  });

  it("persists required-tool failure without provider response text", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const rawProviderText = "private arbitrary policy output without a web search call";
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: oneTimePaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "one-time-required-tool-failure-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      resolveSourceBytes: async () => fixture.bytes,
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => externalRequestResult({}, "request_whole_after_required_tool_failure", "whole_statement_ai_review"),
        webSearchDiscovery: async (request, context) => openAiWebSearchAdapter({
          apiKey: "synthetic-key",
          modelName: "gpt-5",
          fetchImpl: async () => new Response(JSON.stringify({
            id: "resp_safe_required_tool",
            usage: { input_tokens: 10, output_tokens: 5 },
            output: [{ type: "message", content: [{ type: "output_text", text: rawProviderText }] }],
          }), { status: 200, headers: { "content-type": "application/json" } }),
        })(request, context),
        documentRetrieval: async () => { throw new Error("must not run"); },
        semanticVerification: async () => { throw new Error("must not run"); },
      },
    });

    const failedSearch = result.artifact.providerCallOutcomes.find((outcome) => outcome.stage === "web_search_discovery");
    expect(failedSearch).toMatchObject({
      status: "failure",
      requestId: "resp_safe_required_tool",
      reasonCodes: ["provider_required_tool_missing"],
    });
    expect(JSON.stringify(result.artifact)).not.toContain(rawProviderText);
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
  }, 30_000);

  it("fails closed above two observable web actions while retaining only safe usage accounting", async () => {
    const fixture = await approvedOneTimePdfFixture();
    const invocations = { whole: 0, search: 0, retrieval: 0, semantic: 0 };
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: oneTimePaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "one-time-web-action-limit-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      resolveSourceBytes: async () => fixture.bytes,
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => {
          invocations.whole += 1;
          return externalRequestResult({}, "request_whole_after_web_action_limit", "whole_statement_ai_review");
        },
        webSearchDiscovery: async (_request, context) => {
          invocations.search += 1;
          accountingFromProviderUsage({
            approvedCallMetadata: {
              ...context.approvedCallMetadata,
              maximumInputTokens: 400_000,
              maximumOutputTokens: 2_000,
              maximumToolUses: 2,
              estimatedMaximumCostUsd: 0.54,
              pricing: {
                uncachedInputUsdPerMillionTokens: 1.25,
                cachedInputUsdPerMillionTokens: 0.125,
                outputUsdPerMillionTokens: 10,
                toolUseUsd: 0.01,
              },
            },
            durationMs: 30,
            usage: {
              requestId: "resp_three_web_actions",
              inputTokens: 8_720,
              cachedInputTokens: 4_352,
              outputTokens: 1_564,
              toolEvents: [
                { type: "web_search.search", count: 1 },
                { type: "web_search.open_page", count: 1 },
                { type: "web_search.find_in_page", count: 1 },
              ],
            },
          });
          throw new Error("accounting limit must fail");
        },
        documentRetrieval: async () => { invocations.retrieval += 1; throw new Error("must not run"); },
        semanticVerification: async () => { invocations.semantic += 1; throw new Error("must not run"); },
      },
    });

    expect(invocations.whole).toBeGreaterThan(0);
    expect(invocations).toMatchObject({ search: ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch, retrieval: 0, semantic: 0 });
    expect(result.providerCallOutcomes.filter((outcome) => outcome.stage === "web_search_discovery")).toHaveLength(ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch);
    expect(result.providerCallOutcomes[0]).toMatchObject({
      stage: "web_search_discovery",
      status: "failure",
      requestId: "resp_three_web_actions",
      reasonCodes: ["provider_usage_exceeded_approved_transport_limits"],
    });
    expect(result.providerCallOutcomes[1]).toMatchObject({
      stage: "web_search_discovery",
      status: "failure",
      requestId: "resp_three_web_actions",
      reasonCodes: ["provider_usage_exceeded_approved_transport_limits"],
    });
    expect(result.costLedger.entries[0]).toMatchObject({
      status: "failure",
      billingDisposition: "unknown",
      requestId: "resp_three_web_actions",
      inputTokens: 8_720,
      cachedInputTokens: 4_352,
      outputTokens: 1_564,
      toolEvents: [
        { type: "web_search.find_in_page", count: 1 },
        { type: "web_search.open_page", count: 1 },
        { type: "web_search.search", count: 1 },
      ],
    });
    expect(result.providerCallOutcomes.filter((outcome) => ["document_retrieval", "semantic_verification"].includes(outcome.stage)).every((outcome) => outcome.status === "success")).toBe(true);
    expect(result.providerCallOutcomes.at(-1)).toMatchObject({ stage: "whole_statement_ai_review", status: "success" });
    expect(verifyEvaluationRunIntegrityArtifactV2(result.artifact)).toBe(true);
  }, 30_000);

  it("does not construct or invoke the adapter when product scope rejects a paid stage", async () => {
    const fixture = await approvedFixture();
    let adapterConstructions = 0;
    let transportInvocations = 0;
    const requests = fixture.requests.map((request) => request.sourceDocumentId === "doc_beta"
      ? { ...request, stages: ["parser", "whole_statement_ai_review", "final_artifact"] as EvaluationExecutionStage[] }
      : request);

    await expect(runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: requests,
      approvedBudgetUsd: 10,
      calls: [{ sourceDocumentId: "doc_beta", stage: "whole_statement_ai_review", reservation: costReservation({ callId: "beta_call", estimatedMaximumCostUsd: 0.5 }) }],
      outputArtifactPath: path.join(fixture.directory, "scope-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      onAdapterCreatedForTesting: () => { adapterConstructions += 1; },
      transportForTesting: async () => { transportInvocations += 1; return successfulTransportResult(); },
    })).rejects.toMatchObject({ code: "paid_stage_product_scope_ineligible" });
    expect(adapterConstructions).toBe(0);
    expect(transportInvocations).toBe(0);
  });

  it("does not construct or invoke the fake transport when the complete call plan cannot be reserved", async () => {
    const fixture = await approvedFixture();
    let adapterConstructions = 0;
    let transportInvocations = 0;
    const calls = approvedPaidCalls().map((call) => ({
      ...call,
      reservation: { ...call.reservation, estimatedMaximumCostUsd: 5.01 },
    }));

    await expect(runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls,
      outputArtifactPath: path.join(fixture.directory, "budget-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      onAdapterCreatedForTesting: () => {
        adapterConstructions += 1;
      },
      transportForTesting: async () => { transportInvocations += 1; return successfulTransportResult(); },
    })).rejects.toMatchObject({ code: "insufficient_budget_reservation" });
    expect(adapterConstructions).toBe(0);
    expect(transportInvocations).toBe(0);
  });

  it("does not invoke a one-time external retry that lacks its own full reservation", async () => {
    const fixture = await approvedOneTimePdfFixture();
    let adapterConstructions = 0;
    let serviceInvocations = 0;
    const calls = [
      {
        sourceDocumentId: "doc_one_time_fiserv",
        stage: "web_search_discovery" as const,
        reservation: costReservation({ callId: "one_time_initial", capability: "web_search", estimatedMaximumCostUsd: 0.6 }),
      },
      {
        sourceDocumentId: "doc_one_time_fiserv",
        stage: "web_search_discovery" as const,
        reservation: costReservation({
          callId: "one_time_retry",
          attempt: 2,
          retryOfCallId: "one_time_initial",
          capability: "web_search",
          estimatedMaximumCostUsd: 0.41,
        }),
      },
      {
        sourceDocumentId: "doc_one_time_fiserv",
        stage: "document_retrieval" as const,
        reservation: costReservation({ callId: "one_time_retrieval", capability: "retrieval", estimatedMaximumCostUsd: 0.1 }),
      },
      {
        sourceDocumentId: "doc_one_time_fiserv",
        stage: "semantic_verification" as const,
        reservation: costReservation({ callId: "one_time_semantic", capability: "semantic_verification", estimatedMaximumCostUsd: 0.1 }),
      },
      {
        sourceDocumentId: "doc_one_time_fiserv",
        stage: "whole_statement_ai_review" as const,
        reservation: costReservation({ callId: "one_time_whole", capability: "ai_sdk", estimatedMaximumCostUsd: 0.1 }),
      },
    ];

    await expect(runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 1,
      calls,
      outputArtifactPath: path.join(fixture.directory, "retry-budget-artifact.json"),
      adapterId: "one_time_statement_evaluation_v1",
      resolveSourceBytes: async () => fixture.bytes,
      onAdapterCreatedForTesting: () => { adapterConstructions += 1; },
      oneTimeServicesForTesting: {
        wholeStatementReview: async () => { serviceInvocations += 1; return {}; },
      },
    })).rejects.toMatchObject({ code: "insufficient_budget_reservation" });
    expect(adapterConstructions).toBe(0);
    expect(serviceInvocations).toBe(0);
  });

  it("constructs no adapter for every manifest, checksum, duplicate, scope, stage, packet, and budget gate failure", async () => {
    const scenarios: Array<{
      name: string;
      configure: (fixture: Awaited<ReturnType<typeof approvedFixture>>) => Promise<Record<string, unknown>>;
    }> = [
      {
        name: "approved manifest hash",
        configure: async () => ({ approvedManifestHash: checksum("unapproved-manifest") }),
      },
      {
        name: "parent preflight hash",
        configure: async (fixture) => {
          const modified = structuredClone(fixture.manifest);
          modified.parentPreflightArtifactHash = checksum("tampered-parent-preflight");
          modified.manifestContentHash = calculateManifestContentHash(modified);
          await writeFile(fixture.manifestPath, `${JSON.stringify(modified)}\n`);
          return { approvedManifestHash: modified.manifestContentHash };
        },
      },
      {
        name: "duplicate decision",
        configure: async (fixture) => {
          const modified = structuredClone(fixture.manifest);
          for (const row of modified.documents.filter((item) => item.sha256 === checksum("gamma"))) {
            row.selectedDuplicateRepresentative = false;
            row.duplicateExclusionReason = "duplicate_checksum_non_representative";
          }
          modified.selectedDocumentCount -= 1;
          modified.manifestContentHash = calculateManifestContentHash(modified);
          await writeFile(fixture.manifestPath, `${JSON.stringify(modified)}\n`);
          return { approvedManifestHash: modified.manifestContentHash };
        },
      },
      {
        name: "selected count",
        configure: async (fixture) => {
          const modified = structuredClone(fixture.manifest);
          modified.selectedDocumentCount += 1;
          modified.manifestContentHash = calculateManifestContentHash(modified);
          await writeFile(fixture.manifestPath, `${JSON.stringify(modified)}\n`);
          return { approvedManifestHash: modified.manifestContentHash };
        },
      },
      {
        name: "stage authorization",
        configure: async (fixture) => {
          const modifiedPreflight = createDeterministicPreflightArtifact({
            artifactId: "preflight_runner_stage_restriction",
            documents: fixture.preflight.documents.map((document) => document.sourceDocumentId === "doc_alpha"
              ? { ...document, allowedExecutionStages: document.allowedExecutionStages.filter((stage) => stage !== "canonical_admission") }
              : document),
          });
          const modifiedManifest = buildEvaluationSourceManifest(modifiedPreflight);
          await writeFile(fixture.manifestPath, `${JSON.stringify(modifiedManifest)}\n`);
          return {
            approvedManifestHash: modifiedManifest.manifestContentHash,
            requestedExecutions: fixture.requests.map((request) => request.sourceDocumentId === "doc_alpha"
              ? { ...request, stages: [...request.stages, "canonical_admission"] }
              : request),
          };
        },
      },
      {
        name: "Anthony parser eligibility",
        configure: async (fixture) => ({
          requestedExecutions: fixture.requests.map((request) => request.sourceDocumentId === "doc_unsupported"
            ? { ...request, stages: [...request.stages, "whole_statement_ai_review"] }
            : request),
        }),
      },
      {
        name: "Nxgen product scope",
        configure: async (fixture) => ({
          requestedExecutions: fixture.requests.map((request) => request.sourceDocumentId === "doc_beta"
            ? { ...request, stages: [...request.stages, "whole_statement_ai_review"] }
            : request),
        }),
      },
      {
        name: "complete checksum set",
        configure: async (fixture) => ({
          resolveSourceBytes: async (row: any) => row.sourceDocumentId === "doc_alpha"
            ? Buffer.from("substituted source")
            : fixture.sourceBytesByRef.get(row.internalSourceRef)!,
        }),
      },
      {
        name: "packet construction bytes",
        configure: async () => ({
          beforePacketPreparationForTesting: (_sourceDocumentId: string, bytes: Uint8Array) => { bytes[0] = (bytes[0] ?? 0) ^ 0xff; },
        }),
      },
      {
        name: "complete budget reservation",
        configure: async () => ({
          calls: approvedPaidCalls().map((call) => ({ ...call, reservation: { ...call.reservation, estimatedMaximumCostUsd: 5.01 } })),
        }),
      },
    ];

    for (const scenario of scenarios) {
      const fixture = await approvedFixture();
      let adapterConstructions = 0;
      const overrides = await scenario.configure(fixture);
      const request = {
        manifestPath: fixture.manifestPath,
        approvedManifestHash: fixture.manifest.manifestContentHash,
        requestedExecutions: fixture.requests,
        approvedBudgetUsd: 10,
        calls: approvedPaidCalls(),
        outputArtifactPath: path.join(fixture.directory, `gate-${scenario.name.replace(/[^a-z]+/gi, "-")}.json`),
        adapterId: "verified_canonical_packet_v1" as const,
        resolveSourceBytes: async (row: any) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
        onAdapterCreatedForTesting: () => { adapterConstructions += 1; },
        transportForTesting: async () => successfulTransportResult(),
        ...overrides,
      };
      await expect(runManifestDrivenLiveEvaluation(request as any), scenario.name).rejects.toThrow();
      expect(adapterConstructions, scenario.name).toBe(0);
    }
  });

  it("contains no merchant-specific production conditions in the Package 1 runtime", async () => {
    const runtimeFiles = [
      "src/evaluationIntegrity/execution.ts",
      "src/evaluationIntegrity/manifest.ts",
      "src/evaluationIntegrity/oneTimeStatementEvaluationAdapter.ts",
      "src/evaluationIntegrity/repositoryAdapter.ts",
      "scripts/evaluation-run-integrity-run.ts",
    ];
    const runtime = (await Promise.all(runtimeFiles.map((file) => readFile(path.resolve(process.cwd(), file), "utf8")))).join("\n");
    expect(runtime).not.toMatch(/PAYSAFE|FUTURMARKET|EL_NUEVO|JEFES|ABDUL|BASHER|PHILIP/i);
    expect(runtime).not.toContain("test/fixtures/pdfs/");
  });

  it("blocks the real runner and records exact hashes and paths when Package C mutates", async () => {
    const fixture = await approvedFixture();
    const mutated = financialPackages();
    mutated.feeLedger.rows[0]!.selectedAmount.amountMinor = 3001;
    let calls = 0;
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "invariance-failure.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      transportForTesting: async () => {
        calls += 1;
        return {
          ...successfulTransportResult(),
          canonicalState: mutated as any,
          lifecycle: {
            generated: true,
            schemaValid: true,
            evidenceValidated: true,
            policyAccepted: true,
            canonicalAdmitted: true,
            customerPublished: true,
          },
        };
      },
    });

    const proof = result.packageFinancialInvariance.find((item) => item.sourceDocumentId === "doc_alpha")!.result;
    expect(calls).toBe(1);
    expect(result).toMatchObject({ finalStatus: "blocked", liveRunBlocked: true, reasonCodes: ["packages_b_e_financial_invariance_failed"] });
    expect(proof.mismatchPaths).toEqual(["package_c.rows[0].selectedAmount.amountMinor"]);
    expect(proof.packages.find((item) => item.package === "package_c")).toMatchObject({ invariant: false });
    expect(proof.packages.filter((item) => item.package !== "package_c").every((item) => item.beforeHash === item.afterHash)).toBe(true);
    expect(proof.beforeCombinedHash).not.toBe(proof.afterCombinedHash);
    expect(result.blockedPackages).toEqual(["package_c"]);
    expect(result.financialMismatchPaths).toEqual(["package_c.rows[0].selectedAmount.amountMinor"]);
    expect(result.providerCallOutcomes[1]).toMatchObject({ status: "cancelled_before_send" });
    const blockedLifecycle = result.lifecycleLedger.documents.find((item) => item.sourceDocumentId === "doc_alpha")!;
    expect(blockedLifecycle.aiStates.canonical_admitted.state).toBe("not_reached");
    expect(blockedLifecycle.aiStates.customer_published.state).toBe("not_reached");
    expect(blockedLifecycle.events.find((event) => event.stage === "customer_publication")?.state).toBe("withheld");
    expect(verifyEvaluationRunIntegrityArtifact(result.artifact)).toBe(true);
  });

  it("writes a verified timeout artifact and retains the failed reservation conservatively", async () => {
    const fixture = await approvedFixture();
    const timeout = Object.assign(new Error("raw provider detail must not escape"), {
      name: "AbortError",
      accounting: { requestId: "request_safe_1", durationMs: 25, inputTokens: 50, outputTokens: 4 },
    });
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "timeout-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      transportForTesting: async () => { throw timeout; },
    });

    expect(result.finalStatus).toBe("timed_out");
    expect(result.costLedger.entries[0]).toMatchObject({ status: "timeout", requestId: "request_safe_1", billingDisposition: "unknown", inputTokens: 50, outputTokens: 4 });
    expect(result.costLedger.entries[1]).toMatchObject({ status: "cancelled_before_send", billingDisposition: "provider_confirmed_zero" });
    expect(result.costLedger).toMatchObject({ cumulativeBudgetCommittedUsd: 0.5, cumulativeReleasedUsd: 0.5 });
    expect(JSON.stringify(result.artifact)).not.toContain("raw provider detail");
    expect(verifyEvaluationRunIntegrityArtifact(result.artifact)).toBe(true);
  });

  it("fails closed and writes a verified artifact when observed cost exceeds its reservation", async () => {
    const fixture = await approvedFixture();
    let invocations = 0;
    const result = await runManifestDrivenLiveEvaluation({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      requestedExecutions: fixture.requests,
      approvedBudgetUsd: 10,
      calls: approvedPaidCalls(),
      outputArtifactPath: path.join(fixture.directory, "cost-overrun-artifact.json"),
      adapterId: "verified_canonical_packet_v1",
      resolveSourceBytes: async (row) => fixture.sourceBytesByRef.get(row.internalSourceRef)!,
      transportForTesting: async () => {
        invocations += 1;
        return {
          value: { rawProviderResponse: "must never be persisted" },
          accounting: {
            requestId: "request_cost_overrun",
            durationMs: 8,
            inputTokens: 100,
            outputTokens: 20,
            toolEvents: [{ type: "ai_sdk", count: 1 }],
            observedOrEstimatedFinalCostUsd: 0.75,
            billingDisposition: "observed",
          },
        };
      },
    });

    expect(invocations).toBe(1);
    expect(result).toMatchObject({ finalStatus: "failed", reasonCodes: ["cost_exceeded_reservation"] });
    expect(result.providerCallOutcomes).toEqual([
      expect.objectContaining({ callId: "approved_call_1", status: "failure", requestId: "request_cost_overrun", reasonCodes: ["cost_exceeded_reservation"] }),
      expect.objectContaining({ callId: "approved_call_2", status: "cancelled_before_send", requestId: null }),
    ]);
    expect(result.costLedger.entries[0]).toMatchObject({
      status: "failure",
      requestId: "request_cost_overrun",
      observedOrEstimatedFinalCostUsd: 0.75,
      billingDisposition: "observed",
    });
    expect(result.costLedger.entries[1]).toMatchObject({
      status: "cancelled_before_send",
      observedOrEstimatedFinalCostUsd: 0,
      billingDisposition: "provider_confirmed_zero",
    });
    expect(result.costLedger).toMatchObject({ cumulativeObservedUsd: 0.75, cumulativeBudgetCommittedUsd: 0.75, cumulativeReleasedUsd: 0.25 });
    expect(JSON.stringify(result.artifact)).not.toContain("must never be persisted");
    expect(verifyEvaluationRunIntegrityArtifact(result.artifact)).toBe(true);
    expect(JSON.parse(await readFile(result.artifactPath, "utf8"))).toEqual(result.artifact);
  });

  it("retains parser controls and produces a self-proving final internal artifact", async () => {
    const fixture = await approvedFixture();
    const { manifest, permit } = await prepareApprovedExecution({
      manifestPath: fixture.manifestPath,
      approvedManifestHash: fixture.manifest.manifestContentHash,
      observedSources: fixture.observed,
      requestedExecutions: fixture.requests,
    });
    const ledger = createLifecycleLedger(manifest);
    recordAiLifecycleState({ ledger, sourceDocumentId: "doc_alpha", stateName: "executed", state: "completed", reasonCodes: ["dry_run_execution"] });
    const cost = new EvaluationCostBudgetLedger(10);
    const artifact = buildEvaluationRunIntegrityArtifact({
      manifest,
      approvedManifestHash: manifest.manifestContentHash,
      executionPermit: permit,
      lifecycleLedger: ledger,
      packageFinancialInvariance: manifest.documents.map((document) => ({
        sourceDocumentId: document.sourceDocumentId,
        result: provePackagesBEFinancialInvariance(financialPackages() as any, financialPackages() as any),
      })),
      costBudgetLedger: cost.snapshot(),
      providerCallOutcomes: [],
      finalStatus: "completed",
      reasonCodes: ["artifact_unit_test"],
    });

    expect(manifest.documents[0]?.parserDecision.failedControls[0]).toMatchObject({
      controlId: "supporting_volume_agreement",
      basisId: "submitted_volume",
      populationId: "net_submitted_less_refunds",
      expected: 1000,
      actual: 990,
      delta: -10,
      tolerance: 0.01,
      reportabilityImpact: "blocking",
    });
    expect(artifact.lifecycleLedger.documents[0]?.events.map((event) => event.stage)).toEqual([
      "manifest_row", "preflight_record", "parser_record", "capability_execution", "provider_request", "research_retrieval",
      "semantic_verification", "canonical_admission", "customer_publication", "final_artifact",
    ]);
    expect(artifact.lifecycleLedger.documents[0]?.events.at(-1)).toMatchObject({ state: "not_reached" });
    expect(verifyEvaluationRunIntegrityArtifact(artifact)).toBe(true);
  });
});

async function approvedFixture() {
  const preflight = createDeterministicPreflightArtifact({
    artifactId: "preflight_sanitized_set_v1",
    documents: [
      preflightDocument("doc_alpha", "source_alpha", "alpha", "eligible", "fiserv_family"),
      preflightDocument("doc_beta", "source_beta", "beta", "eligible", "nxgen_vortax"),
      preflightDocument("doc_gamma", "source_gamma", "gamma", "eligible", "fiserv_family"),
      preflightDocument("doc_gamma_copy", "source_gamma_copy", "gamma", "eligible", "fiserv_family"),
      preflightDocument("doc_unsupported", "source_unsupported", "unsupported", "unsupported", "unknown"),
    ],
  });
  const manifest = buildEvaluationSourceManifest(preflight);
  const directory = await mkdtemp(path.join(tmpdir(), "evaluation-integrity-test-"));
  const manifestPath = path.join(directory, "approved-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const observed = manifest.documents.map((document): ObservedEvaluationSource => ({
    sourceDocumentId: document.sourceDocumentId,
    internalSourceRef: document.internalSourceRef,
    sha256: document.sha256,
    byteCount: document.byteCount,
    displayFileName: document.displayFileName,
    displayMetadataStatementPeriod: document.parsedStatementPeriod,
  }));
  const requests = manifest.documents
    .filter((document) => document.selectedDuplicateRepresentative)
    .map((document): RequestedDocumentExecution => ({
      sourceDocumentId: document.sourceDocumentId,
      stages: document.paidStageEligibility === "eligible"
        ? ["parser", "whole_statement_ai_review", "final_artifact"]
        : ["parser", "final_artifact"],
    }));
  const sourceBytesByRef = new Map(manifest.documents.map((document) => [
    document.internalSourceRef,
    fixtureBytes(seedForDocument(document.sourceDocumentId)),
  ]));
  return { preflight, manifest, manifestPath, directory, observed, requests, sourceBytesByRef };
}

async function approvedOneTimePdfFixture() {
  const sourcePath = path.resolve(process.cwd(), "test/fixtures/pdfs/Nov_2024_Statement.pdf");
  const bytes = await readFile(sourcePath);
  const sourceDocumentId = "doc_one_time_fiserv";
  const preflight = createDeterministicPreflightArtifact({
    artifactId: "preflight_one_time_fiserv_v1",
    documents: [{
      sourceDocumentId,
      internalSourceRef: "source_one_time_fiserv",
      sha256: checksumBytes(bytes),
      byteCount: bytes.byteLength,
      displayFileName: "approved-statement.pdf",
      parsedProcessor: "fiserv_family",
      parsedStatementPeriod: { start: "2024-11-01", end: "2024-11-30" },
      parserEligibility: "eligible",
      processorLayoutFamily: "fiserv_family",
      productScopeEligibility: "eligible",
      productScopeReasonCode: "fiserv_family_supported",
      paidStageEligibility: "eligible",
      paidStageExclusionReason: null,
      selectedDriver: "fiserv_first_data_full_statement",
      allowedExecutionStages: eligibleStages,
      parserRecordId: "parser_one_time_fiserv",
      parserDecision: preserveParserDecision({
        decision: { status: "accepted", reportable: true, confidence: "high", reason: "Approved deterministic parser fixture." },
        controls: [],
      }),
    }],
  });
  const manifest = buildEvaluationSourceManifest(preflight);
  const directory = await mkdtemp(path.join(tmpdir(), "evaluation-one-time-test-"));
  const manifestPath = path.join(directory, "approved-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const requests: RequestedDocumentExecution[] = [{
    sourceDocumentId,
    stages: eligibleStages,
  }];
  return { sourcePath, bytes, preflight, manifest, manifestPath, directory, requests };
}

function preflightDocument(
  sourceDocumentId: string,
  internalSourceRef: string,
  hashSeed: string,
  eligibility: "eligible" | "unsupported",
  processorLayoutFamily: "fiserv_family" | "nxgen_vortax" | "unknown",
): DeterministicPreflightDocument {
  const reportable = eligibility === "eligible" && sourceDocumentId !== "doc_alpha";
  const parserDecision = eligibility === "unsupported"
    ? preserveParserDecision({
        decision: { status: "unsupported", reportable: false, confidence: "needs_review", reason: "No structural parser family safely matched." },
        exactReasonCode: "parser_text_unavailable",
        controls: [],
      })
    : preserveParserDecision({
        decision: reportable
          ? { status: "accepted", reportable: true, confidence: "high", reason: "Accepted because required reconciliation checks passed." }
          : { status: "needs_review", reportable: false, confidence: "needs_review", reason: "Blocked by failed reconciliation check(s): supportingVolumeAgreement." },
        controls: reportable ? [] : [{
          controlId: "supporting_volume_agreement",
          check: { status: "fail", expected: 1000, actual: 990, delta: -10, tolerance: 0.01, explanation: "Sanitized population mismatch." },
          basisId: "submitted_volume",
          populationId: "net_submitted_less_refunds",
          reportabilityImpact: "blocking",
        }],
      });
  return {
    sourceDocumentId,
    internalSourceRef,
    sha256: checksum(hashSeed),
    byteCount: fixtureBytes(hashSeed).byteLength,
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
    allowedExecutionStages: eligibility === "eligible" && processorLayoutFamily === "fiserv_family" ? eligibleStages : ["parser", "final_artifact"],
    parserRecordId: `parser_${sourceDocumentId}`,
    parserDecision,
  };
}

function observedSource(sourceDocumentId: string, seed: string): ObservedEvaluationSource {
  return {
    sourceDocumentId,
    internalSourceRef: `source_${sourceDocumentId}`,
    sha256: checksum(seed),
    byteCount: fixtureBytes(seed).byteLength,
    displayFileName: `${sourceDocumentId}.pdf`,
  };
}

function checksum(seed: string): string {
  return checksumBytes(fixtureBytes(seed));
}

function checksumBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fixtureBytes(seed: string): Buffer {
  return Buffer.from(JSON.stringify({
    type: "verified_canonical_evaluation_packet_v1",
    sanitizedPacket: { packetVersion: "sanitized_packet_v1", fixtureSeed: seed },
    canonicalState: financialPackages(),
  }));
}

function seedForDocument(sourceDocumentId: string): string {
  if (sourceDocumentId === "doc_gamma_copy") return "gamma";
  if (sourceDocumentId === "doc_unsupported") return "unsupported";
  return sourceDocumentId.replace(/^doc_/, "");
}

async function prepareThenInvoke(
  fixture: Awaited<ReturnType<typeof approvedFixture>>,
  observedSources: ObservedEvaluationSource[],
  provider: () => void,
) {
  const result = await prepareApprovedExecution({
    manifestPath: fixture.manifestPath,
    approvedManifestHash: fixture.manifest.manifestContentHash,
    observedSources,
    requestedExecutions: fixture.requests,
  });
  provider();
  return result;
}

function financialPackages() {
  return {
    financialFacts: canonicalFinancialFactsFixture(),
    feeLedger: canonicalFeeLedgerFixture(),
    feeOwnershipActionability: canonicalOwnershipFixture(),
    opportunityEngine: canonicalOpportunityFixture(),
    calculations: canonicalCalculationsFixture(),
  } satisfies PackagesBEProjectionInput;
}

function selectedFact<T>(id: string, value: T): CanonicalFactValue<T> {
  return {
    value,
    status: "selected",
    confidence: "high",
    selectedCandidateId: `${id}_candidate`,
    evidenceRefs: [`ev_${id}`],
    selectionReason: "Selected by the deterministic canonical fixture.",
    candidates: [{
      id: `${id}_candidate`,
      role: "statement_level_total",
      value: structuredClone(value),
      evidenceRefs: [`ev_${id}`],
      parserId: "fixture_parser",
      parserVersion: "1",
      extractionMethod: "pdf_text",
      confidence: "high",
      selected: true,
      selectionReason: "Selected by the deterministic canonical fixture.",
      rejectionReason: null,
    }],
    limitations: [],
  };
}

function canonicalFinancialFactsFixture(): PackagesBEProjectionInput["financialFacts"] {
  const unavailableMoney = (id: string) => selectedFact(id, null as { amountMinor: number; currency: "USD" } | null);
  const unavailableCount = (id: string) => selectedFact(id, null as number | null);
  return {
    processedSales: selectedFact("processed_sales", { amountMinor: 100_000, currency: "USD" }),
    totalFees: selectedFact("total_fees", { amountMinor: 3000, currency: "USD" }),
    rateRevealCalculatedAllInRate: selectedFact("effective_rate", "0.030000"),
    processorStatedRate: selectedFact("processor_rate", "0.031000" as string | null),
    effectiveRateBasis: {
      policyVersion: "effective_rate_basis_v1",
      numeratorFeeBasis: "all_in_processing_fees",
      denominatorVolumeBasis: "submitted_sales",
      refundsTreatment: "not_present",
      cashAdvanceTreatment: "not_present",
      equipmentFeeTreatment: "not_present",
      chargebackTreatment: "not_present",
      oneTimeFeeTreatment: "not_present",
      populationCompatibility: "compatible",
      rateSource: "both",
      processorStatedRate: selectedFact("basis_processor_rate", "0.031000" as string | null),
      calculationRef: "calculation_effective_rate",
      explanation: "All processing fees divided by submitted sales.",
    },
    transactionCounts: {
      submittedTransactions: selectedFact("submitted_count", 42 as number | null),
      settledTransactions: selectedFact("settled_count", 40 as number | null),
      authorizations: unavailableCount("authorizations"),
      captures: unavailableCount("captures"),
      refunds: unavailableCount("refund_count"),
      chargebacks: unavailableCount("chargebacks"),
      networkTransactions: unavailableCount("network_count"),
      cardTypeItems: unavailableCount("card_items"),
      auditSpecificCounts: unavailableCount("audit_count"),
      unknownCounts: unavailableCount("unknown_count"),
    },
    averageTicketBasis: {
      selectedCountType: "submitted_transactions",
      selectedVolumePopulation: "submitted_sales",
      allowed: true,
      reason: "Submitted count and volume populations agree.",
      evidenceRefs: ["ev_processed_sales"],
      calculationRef: "calculation_average_ticket",
    },
    averageTicket: selectedFact("average_ticket", { amountMinor: 2381, currency: "USD" } as { amountMinor: number; currency: "USD" } | null),
    amountFunded: unavailableMoney("amount_funded"),
    adjustments: unavailableMoney("adjustments"),
    credits: unavailableMoney("credits"),
    refunds: unavailableMoney("refunds"),
  };
}

function canonicalFeeLedgerFixture(): PackagesBEProjectionInput["feeLedger"] {
  return {
    policyVersion: "canonical_fee_ledger_v1",
    status: "available",
    sourceOccurrences: [{
      id: "occurrence_1",
      evidenceRef: "ev_fee_1",
      documentId: "document_1",
      pageNumber: 2,
      section: "fees",
      lineId: "line_20",
      rowIndex: 1,
      normalizedSourceText: "Monthly service fee 30.00",
    }],
    parserInterpretations: [
      canonicalFeeInterpretation("interpretation_1", "Monthly service fee", "individual_charge"),
      canonicalFeeInterpretation("interpretation_2", "Fee section control", "section_subtotal"),
    ],
    rows: [{
      id: "fee_1",
      role: "individual_charge",
      sourceOccurrenceIds: ["occurrence_1"],
      parserInterpretationIds: ["interpretation_1"],
      selectedLabel: "Monthly service fee",
      selectedAmount: { amountMinor: 3000, currency: "USD" },
      signedAmount: { amountMinor: 3000, currency: "USD" },
      contributesToUniqueTotal: true,
      contributionDecision: {
        contributes: true,
        reasonCode: "individual_charge_included",
        controlRefs: ["control_1"],
        evidenceRefs: ["ev_fee_1"],
        signedAmountBasis: "fee_charge_magnitude",
        grossNetBasis: "fee_charge_gross",
        confidence: "high",
        limitations: [],
      },
      mergeReason: "same_source_occurrence",
      mergeConfidence: "high",
      rejectedAmountCandidates: [{
        amount: { amountMinor: 3100, currency: "USD" },
        interpretationId: "interpretation_2",
        reason: "Section subtotal is not the selected individual charge.",
      }],
      limitations: [],
    }],
    uniqueChargeTotal: { amountMinor: 3000, currency: "USD" },
    uniqueChargeCalculationRef: "calculation_unique_fee_total",
    controls: [{
      id: "control_1",
      type: "printed_charge_sum",
      label: "Printed fee total",
      evidenceRefs: ["ev_fee_1"],
      expectedAmount: { amountMinor: 3000, currency: "USD" },
      actualAmount: { amountMinor: 3000, currency: "USD" },
      deltaMinor: 0,
      toleranceMinor: 1,
      tolerancePolicyId: "exact_minor_units_v1",
      status: "pass",
      derivationGroupId: "fee_total_group",
      coveredFeeRowIds: ["fee_1"],
      basis: "section_control",
      amountBasis: "fee_charge_gross",
      independence: "printed_source_control",
      parserReportedActualAmount: { amountMinor: 3000, currency: "USD" },
      reconstructedFromCoveredRows: true,
      reconstructionFormula: "covered_rows_fee_charge_gross",
      reasonCode: "printed_charge_sum_matches",
      explanation: "The printed total matches the selected fee row.",
    }],
    limitations: [],
  };
}

function canonicalFeeInterpretation(
  id: string,
  label: string,
  rowRole: PackagesBEProjectionInput["feeLedger"]["parserInterpretations"][number]["rowRole"],
): PackagesBEProjectionInput["feeLedger"]["parserInterpretations"][number] {
  return {
    id,
    sourceOccurrenceId: "occurrence_1",
    parserId: "fixture_parser",
    parserVersion: "1",
    label,
    amount: { amountMinor: 3000, currency: "USD" },
    signedAmount: { amountMinor: 3000, currency: "USD" },
    rowRole,
    section: "fees",
    pageNumber: 2,
    printedRate: null,
    printedPerItemRate: null,
    itemCount: null,
    volume: null,
    confidence: "high",
  };
}

function canonicalOwnershipFixture(): PackagesBEProjectionInput["feeOwnershipActionability"] {
  const ownership = { collector: "processor", economicBeneficiary: "processor", contractualController: "processor" } as const;
  return {
    policyVersion: "fee_ownership_actionability_v1",
    taxonomyVersion: "fee_taxonomy_v1",
    ruleRegistryVersion: "fee_ownership_rules_v1",
    aiSuggestionPolicyVersion: "fee_ai_suggestion_policy_v1",
    humanOverridePolicyVersion: "fee_human_override_policy_v1",
    status: "available",
    rowClassifications: [{
      feeRowId: "fee_1",
      selected: {
        candidateId: "candidate_1",
        category: "service_fee",
        ownership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "recommended",
        confidence: "high",
        selectionReason: "Deterministic service-fee rule selected.",
        rejectedCandidateIds: [],
      },
      candidates: [{
        id: "candidate_1",
        feeRowId: "fee_1",
        category: "service_fee",
        ownership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "recommended",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "service_fee_rule",
        ruleVersion: "1",
        ruleProvenance: "ratereveal_rule_registry",
        evidenceRefs: ["ev_fee_1"],
        reference: null,
        authoritative: true,
        reason: "The canonical label matches the deterministic service-fee rule.",
        permissionConsequences: ["verify_before_customer_savings"],
        limitations: [],
      }],
      conflictStatus: "none",
      conflictReason: null,
    }],
    spreadAssertions: [],
    aiSuggestions: [],
    humanOverrides: [],
    limitations: [],
  };
}

function canonicalOpportunityFixture(): PackagesBEProjectionInput["opportunityEngine"] {
  const ownership = { collector: "processor", economicBeneficiary: "processor", contractualController: "processor" } as const;
  return {
    policyVersion: "canonical_opportunity_engine_v1",
    targetPolicyVersion: "opportunity_target_policy_v1",
    cadencePolicyVersion: "opportunity_cadence_policy_v1",
    benchmarkPolicyVersion: "opportunity_benchmark_policy_v1",
    aiBoundaryPolicyVersion: "opportunity_ai_boundary_policy_v1",
    status: "available",
    components: [{
      id: "opportunity_1",
      policyVersion: "canonical_opportunity_engine_v1",
      kind: "fee_removal",
      eligibility: "deterministic",
      inclusionStatus: "included",
      feeRowRefs: [{ feeRowId: "fee_1", role: "base", classificationCandidateId: "candidate_1" }],
      ownership,
      actionabilityCeiling: "verify_only",
      observedAmount: {
        amount: { amountMinor: 100, currency: "USD" },
        source: "canonical_fee_row",
        evidenceRefs: ["ev_fee_1"],
        aiSourced: false,
      },
      target: {
        type: "zero_removal",
        removalCondition: "Written processor confirmation.",
        proofEvidenceRefs: ["ev_fee_1"],
        aiSourced: false,
      },
      targetProvenance: {
        sourceType: "ratereveal_policy",
        referenceId: "target_policy_1",
        version: "1",
        policyOwner: "ratereveal",
        reviewer: null,
        effectiveFrom: null,
        effectiveTo: null,
        applicableProcessor: "fiserv",
        applicableBusinessType: "restaurant_food_beverage",
        applicableChannel: null,
        applicableCardEnvironment: null,
        methodology: "Removal only after written confirmation.",
        limitations: [],
        opportunityApproved: true,
        authoritativeForDeterministic: true,
        approvedForEstimate: false,
        evidenceRefs: ["ev_fee_1"],
        aiSourced: false,
      },
      cadence: {
        value: "monthly",
        proven: true,
        annualizationAllowed: true,
        frequencyPerYear: 12,
        proof: "fee_label_explicit",
        evidenceRefs: ["ev_fee_1"],
        reason: "The canonical fee label establishes monthly cadence.",
        aiSourced: false,
      },
      calculation: {
        calculationRef: "calculation_1",
        formulaCode: "opportunity_monthly_delta_times_12",
        formulaVersion: "canonical_opportunity_formula_v1",
        inputRefs: ["fee_1"],
        result: { amountMinor: 1200, currency: "USD" },
        resultUnit: "money",
        annualized: true,
        evidenceRefs: ["ev_fee_1"],
        aiSourced: false,
      },
      overlap: {
        aggregationKey: "fee_1:removal",
        exclusiveGroupKey: null,
        supersedesComponentIds: [],
        supersededByComponentId: null,
        overlapsWithComponentIds: [],
        resolution: "none",
        reason: null,
      },
      confidence: "high",
      inclusionReasonCodes: ["deterministic_target_and_cadence"],
      exclusionReasonCodes: [],
      evidenceRefs: ["ev_fee_1"],
      limitations: [],
    }],
    summary: {
      deterministicEligibleAnnualAmount: { amountMinor: 1200, currency: "USD" },
      approvedEstimatedAnnualAmount: { amountMinor: 0, currency: "USD" },
      totalEligibleAnnualAmount: { amountMinor: 1200, currency: "USD" },
      verificationOnlyObservedAmount: { amountMinor: 0, currency: "USD" },
      excludedObservedAmount: { amountMinor: 0, currency: "USD" },
      nonAnnualizedObservedAmount: { amountMinor: 0, currency: "USD" },
      masterSavingsAnnualAmount: { amountMinor: 1200, currency: "USD" },
      deterministicComponentIds: ["opportunity_1"],
      approvedEstimatedComponentIds: [],
      verificationOnlyComponentIds: [],
      excludedComponentIds: [],
      nonAnnualizedComponentIds: [],
      supersededComponentIds: [],
      summaryCalculationRefs: ["calculation_1"],
      limitations: [],
    },
    limitations: [],
  };
}

function canonicalCalculationsFixture(): NonNullable<PackagesBEProjectionInput["calculations"]> {
  return [{
    id: "calculation_1",
    formulaCode: "opportunity_monthly_delta_times_12",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [{
      label: "Monthly removable fee",
      value: { amountMinor: 100, currency: "USD" },
      unit: "money",
      evidenceRefs: ["ev_fee_1"],
    }],
    result: { amountMinor: 1200, currency: "USD" },
    unit: "money",
    roundingPolicy: "minor_units_half_away_from_zero",
  }];
}

function costReservation(input: {
  callId: string;
  attempt?: number;
  retryOfCallId?: string | null;
  capability?: "direct_responses" | "ai_sdk" | "web_search" | "retrieval" | "semantic_verification";
  estimatedMaximumCostUsd: number;
}) {
  const capability = input.capability ?? "direct_responses";
  return {
    callId: input.callId,
    attempt: input.attempt ?? 1,
    retryOfCallId: input.retryOfCallId ?? null,
    capability,
    pricingPolicyRef: "sanitized_pricing_policy_v1",
    providerRoute: "sanitized_route",
    provider: "sanitized_provider",
    model: "sanitized_model",
    toolClass: capability,
    maximumInputTokens: 1000000,
    maximumOutputTokens: 50000,
    maximumToolUses: capability === "web_search" ? 2 : capability === "retrieval" ? 1 : 0,
    pricing: {
      uncachedInputUsdPerMillionTokens: 0,
      cachedInputUsdPerMillionTokens: 0,
      outputUsdPerMillionTokens: 2,
      toolUseUsd: 0,
    },
    estimatedMaximumCostUsd: input.estimatedMaximumCostUsd,
  };
}

function approvedPaidCalls() {
  return ["doc_alpha", "doc_gamma"].map((sourceDocumentId, index) => ({
    sourceDocumentId,
    stage: "whole_statement_ai_review" as const,
    reservation: costReservation({ callId: `approved_call_${index + 1}`, capability: "ai_sdk", estimatedMaximumCostUsd: 0.5 }),
  }));
}

function oneTimePaidCalls() {
  const stages = [
    ...Array.from({ length: ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch }, () => ["web_search_discovery", "web_search"] as const),
    ...Array.from({ length: ONE_TIME_RESEARCH_REQUEST_SLOTS.retrieval }, () => ["document_retrieval", "retrieval"] as const),
    ...Array.from({ length: ONE_TIME_RESEARCH_REQUEST_SLOTS.semanticVerification }, () => ["semantic_verification", "semantic_verification"] as const),
    ["whole_statement_ai_review", "ai_sdk"] as const,
  ];
  return stages.map(([stage, capability], index) => ({
    sourceDocumentId: "doc_one_time_fiserv",
    stage: stage as "whole_statement_ai_review" | "web_search_discovery" | "document_retrieval" | "semantic_verification",
    reservation: costReservation({
      callId: `one_time_call_${index + 1}`,
      capability: capability as "ai_sdk" | "web_search" | "retrieval" | "semantic_verification",
      estimatedMaximumCostUsd: 0.5,
    }),
  }));
}

const FAKE_WHOLE_STATEMENT_OBSERVED_COST_USD = 0.001;

function externalRequestResult<T>(value: T, requestId: string, toolType: string) {
  const observedOrEstimatedFinalCostUsd = toolType === "whole_statement_ai_review"
    ? FAKE_WHOLE_STATEMENT_OBSERVED_COST_USD
    : 0.1;
  return {
    type: "one_time_external_request_result_v1" as const,
    value,
    accounting: {
      requestId,
      durationMs: 5,
      inputTokens: 10,
      outputTokens: 2,
      toolEvents: [{ type: toolType, count: 1 }],
      observedOrEstimatedFinalCostUsd,
      billingDisposition: "observed" as const,
    },
  };
}

function successfulTransportResult() {
  return {
    value: true,
    accounting: {
      durationMs: 1,
      inputTokens: 10,
      outputTokens: 2,
      observedOrEstimatedFinalCostUsd: 0.1,
      billingDisposition: "observed" as const,
    },
  };
}
