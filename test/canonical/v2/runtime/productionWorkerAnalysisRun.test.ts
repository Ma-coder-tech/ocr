import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");

describe("production worker canonical AnalysisRun integration", () => {
  let dbModule: typeof import("../../../../src/db.js");
  const priorAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const priorOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    dbModule?.db.close();
    delete process.env.FEECLEAR_DB_PATH;
    if (priorAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = priorAnthropicKey;
    if (priorOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorOpenAiKey;
  });

  it("creates the durable V2 run on the normal job path without changing the legacy summary contract", async () => {
    const [store, worker, runStore, loadedDb] = await Promise.all([
      import("../../../../src/store.js"),
      import("../../../../src/worker.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const job = store.createJob({ fileName: "customer-upload.pdf", filePath: fixture, fileType: "pdf",
      businessType: "retail", maxAttempts: 1 });

    await worker.processJob(job.id);

    const completed = store.getJob(job.id);
    const canonical = runStore.getPersistedAnalysisRunForJob(job.id);
    expect(completed).toMatchObject({ status: "completed", progress: 100, summary: { businessType: "retail" } });
    expect(completed?.summary).not.toHaveProperty("canonicalAnalysisRun");
    expect(canonical).toMatchObject({
      jobId: job.id, status: "completed_with_limitations", familyStatus: "proven", rfCatalogStatus: "available",
      rfCatalogBinding: {
        source: "governed_catalog", availability: "available", entryRefs: [],
        visibility: { mode: "anonymous_run", accountPrivateKnowledge: "excluded", tenantPrivateKnowledge: "disabled" },
      },
    });
    expect(canonical?.result?.artifacts.rfResolution).toMatchObject({
      knowledgeBinding: { source: "governed_catalog", availability: "available" },
      snapshot: { entryCount: 0 }, validation: { status: "valid" },
    });
    expect(canonical?.result?.artifacts.rh).not.toBeNull();
    expect(canonical?.result?.artifacts.unresolvedClaims).toMatchObject({
      businessContextAuthority: "excluded_from_canonical_economics",
      benchmarkExecution: "disabled",
    });
    expect(JSON.stringify(canonical?.result?.artifacts)).not.toContain('"businessType"');
    expect(canonical?.result?.artifacts.rgWorkLedger).toMatchObject({
      authority: "claim_admission_and_planning_only",
      providerExecution: "durable_claim_bound_executor_after_planning",
      searchExecution: "typed_privacy_safe_search_intent_only",
      retrievalExecution: "independent_https_retrieval_required",
      aiExecution: "separate_investigation_and_verification_only",
      materialityContract: { version: "canonical_materiality_contract_v1", businessTypeAuthority: "excluded" },
      operations: [], validation: { status: "valid" },
    });
    expect(canonical?.rgClaimAdmissions.length).toBeGreaterThan(0);
    expect(canonical?.rgWorkItems.length).toBe(canonical?.result?.artifacts.rgWorkLedger!.workItems.length);
    expect(canonical?.rgWorkItems.every((item) => item.executionState === "degraded_provider_unavailable"
      && item.stopReason?.includes("missing"))).toBe(true);
    expect(canonical?.rgOperations).toEqual([]);
    expect(canonical?.continuationRevisions).toHaveLength(1);
    expect(canonical?.result?.autonomousLifecycle).toMatchObject({
      controllerRevision: 1,
      state: "operational_degradation_blocks_judgment",
      providerExecution: "continuation_authorized_existing_executor",
      secondPassProviderCalls: 0,
    });
    expect(canonical?.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(canonical?.autonomousOutcome).toMatchObject({
      checkpointKind: "settled",
      lifecycle: "operational_degradation_blocks_judgment",
      completion: "stopped_operationally",
      authority: "production_internal_canonical",
      customerReportAuthority: "legacy_report_unchanged",
      analysisRunStatusCompatibility: "pre_adaptive_status_meaning_unchanged",
    });
    expect(canonical?.autonomousOutcome?.binding).toMatchObject({
      sourceFingerprint: canonical?.sourceFingerprint,
      financialFoundationHash: canonical?.financialFoundationHash,
      semanticHash: canonical?.semanticHash,
      canonicalStateHash: canonical?.canonicalStateHash,
      semanticRevision: canonical?.semanticRevision,
      planHash: canonical?.rgPlanHash,
      planGeneration: canonical?.rgPlanGeneration,
      executionGeneration: canonical?.rgExecutionGeneration,
      continuationRevision: canonical?.continuationRevision,
      continuationStateHash: canonical?.continuationStateHash,
      rhArtifactHash: canonical?.stages.find((stage) => stage.stage === "rh")?.artifactHash,
    });
    const degradedDecisions = canonical?.continuationRevisions[0]?.decisions.filter((item) =>
      item.disposition === "operationally_degraded_retry_eligible") ?? [];
    expect(degradedDecisions).toHaveLength(canonical?.rgWorkItems.length ?? 0);
    expect(degradedDecisions.every((item) => item.degradation?.subtype === "provider_unavailable_before_send"
      && item.degradation.continuationPermission === "bounded_retry_eligible")).toBe(true);
    expect(canonical?.stages).toHaveLength(10);
  }, 30_000);
});
