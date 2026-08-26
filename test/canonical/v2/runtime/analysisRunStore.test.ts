import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");

describe("durable canonical AnalysisRun persistence", () => {
  let dbModule: typeof import("../../../../src/db.js");

  beforeEach(() => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
  });

  afterEach(() => {
    dbModule?.db.close();
    delete process.env.FEECLEAR_DB_PATH;
  });

  it("persists one versioned run and idempotent stage checkpoints per production job", async () => {
    const [{ parsePdf }, { fiservFirstDataShortStatementDriver }, store, runStore, loadedDb] = await Promise.all([
      import("../../../../src/parser.js"),
      import("../../../../src/fiservFirstDataParser.js"),
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const document = await parsePdf(fixture);
    const rawIdentity = (fiservFirstDataShortStatementDriver.parse(document) as any).statementIdentity;
    const job = store.createJob({ fileName: "statement.pdf", filePath: fixture, fileType: "pdf", businessType: "retail" });

    const first = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const persisted = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(persisted).toMatchObject({
      id: first.runId,
      jobId: job.id,
      status: "completed_with_limitations",
      familyStatus: "proven",
      attemptCount: 1,
      canonicalTruthHash: first.canonicalTruthHash,
    });
    expect(persisted.stages.map((stage) => [stage.stage, stage.status])).toEqual([
      ["source_ingress", "valid"], ["capability_admission", "valid"], ["rb", "valid"], ["rc", "valid"],
      ["rd", "valid"], ["re", "valid"], ["rh", "valid"],
    ]);
    expect(persisted.stages.every((stage) => stage.claimRef && stage.evidenceObjective && stage.expectedDecisionEffect)).toBe(true);
    expect(persisted.stages.every((stage) => stage.artifactHash && stage.resource.execution === "deterministic_local"
      && stage.resource.provider === null && stage.resource.calls === 0 && stage.resource.retrievalBytes === 0)).toBe(true);
    const hashes = persisted.stages.map((stage) => stage.artifactHash);

    const second = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const afterSecond = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(second).toEqual(first);
    expect(afterSecond.id).toBe(persisted.id);
    expect(afterSecond.attemptCount).toBe(1);
    expect(afterSecond.stages.map((stage) => stage.artifactHash)).toEqual(hashes);
    expect(loadedDb.db.prepare(`SELECT COUNT(*) AS count FROM canonical_analysis_runs WHERE job_id = ?`).get(job.id)).toEqual({ count: 1 });
    expect(loadedDb.db.prepare(`SELECT COUNT(*) AS count FROM canonical_analysis_run_stages WHERE run_id = ?`).get(first.runId)).toEqual({ count: 7 });

    const changedDocument = structuredClone(document);
    changedDocument.rows[0] = { ...changedDocument.rows[0], content: `${String(changedDocument.rows[0]?.content ?? "")} changed` };
    expect(() => runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document: changedDocument }))
      .toThrow("ANALYSIS_RUN_SOURCE_FINGERPRINT_MISMATCH");

    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain(fixture);
    expect(serialized).not.toMatch(/"(?:merchantName|merchantNumber|sourceFileName|evidenceLine)"/i);
    expect(serialized).not.toContain(String(rawIdentity.merchantName));
    expect(serialized).not.toContain(String(rawIdentity.merchantNumber));
  }, 30_000);

  it("restarts a failed attempt from empty checkpoints without retaining stale authority", async () => {
    const [{ parsePdf }, store, runStore, loadedDb] = await Promise.all([
      import("../../../../src/parser.js"),
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const document = await parsePdf(fixture);
    const job = store.createJob({ fileName: "statement.pdf", filePath: fixture, fileType: "pdf", businessType: "retail" });

    expect(() => runStore.executeDurableCanonicalAnalysisRun({
      jobId: job.id,
      document,
      sourceProfile: { statementCompleteness: "invalid" as never },
    })).toThrow("INVALID_STATEMENT_COMPLETENESS");
    const failed = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(failed).toMatchObject({ status: "failed", attemptCount: 1, result: null, canonicalTruthHash: null });
    expect(failed.stages.every((stage) => stage.status === "pending" && stage.artifact === null)).toBe(true);

    const recovered = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const persisted = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(persisted).toMatchObject({ id: recovered.runId, attemptCount: 2, status: recovered.status });
    expect(persisted.stages.every((stage) => stage.status === "valid" && stage.artifact !== null)).toBe(true);
  }, 30_000);
});
