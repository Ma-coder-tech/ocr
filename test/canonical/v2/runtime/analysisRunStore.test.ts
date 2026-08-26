import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { categorySubjectCode, unboundedKnowledgeScope } from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge } from "../knowledge/knowledgeFixtures.js";

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
      ["rf_resolution", "valid"], ["rd", "valid"], ["re", "valid"], ["claim_inventory", "valid"], ["rh", "valid"],
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
    expect(loadedDb.db.prepare(`SELECT COUNT(*) AS count FROM canonical_analysis_run_stages WHERE run_id = ?`).get(first.runId)).toEqual({ count: 9 });

    const changedDocument = structuredClone(document);
    changedDocument.rows[0] = { ...changedDocument.rows[0], content: `${String(changedDocument.rows[0]?.content ?? "")} changed` };
    expect(() => runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document: changedDocument }))
      .toThrow("ANALYSIS_RUN_SOURCE_FINGERPRINT_MISMATCH");

    loadedDb.db.prepare(`UPDATE canonical_analysis_runs SET implementation_version = ? WHERE job_id = ?`)
      .run("prior_accepted_implementation", job.id);
    const upgraded = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const afterUpgrade = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(upgraded.runId).toBe(first.runId);
    expect(afterUpgrade).toMatchObject({
      attemptCount: 2,
      schemaVersion: "canonical_analysis_run_v3",
      implementationVersion: "rf_first_claim_resolution_v1",
    });
    expect(afterUpgrade.stages).toHaveLength(9);
    expect(afterUpgrade.stages.every((stage) => stage.status === "valid" && stage.artifact !== null)).toBe(true);

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

  it("reruns the same durable run when the immutable RF snapshot changes and then remains idempotent", async () => {
    const [{ parsePdf }, store, runStore, loadedDb] = await Promise.all([
      import("../../../../src/parser.js"),
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const document = await parsePdf(fixture);
    const job = store.createJob({ fileName: "statement.pdf", filePath: fixture, fileType: "pdf", businessType: "retail" });
    const baseline = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const target = baseline.artifacts.rd!.economicLayer.charges.find((charge) =>
      charge.contributionStatus === "contributes_unresolved",
    )!;
    const occurrence = baseline.artifacts.rb!.sourceModel.occurrences.find((item) => item.id === target.contributingOccurrenceRef)!;
    const subjectCode = categorySubjectCode(occurrence.sourceLabel);
    const entry = admittedKnowledge({
      id: "durable-category-map",
      claimType: "stable_facet_mapping",
      subjectCode,
      value: { kind: "mapping", canonicalCode: "other_source_grounded_fee", sourceCode: subjectCode },
      scope: unboundedKnowledgeScope(),
      effectiveFrom: "2020-01-01",
      evidence: [{ ref: "reviewed-durable-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    const rfKnowledge = { entries: [entry], tenantRef: "tenant-a", accountRef: "account-a" };

    const resolved = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document, rfKnowledge });
    const afterResolution = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(resolved.runId).toBe(baseline.runId);
    expect(afterResolution.attemptCount).toBe(2);
    expect(afterResolution.rfSnapshotHash).toBe(resolved.artifacts.rfResolution!.snapshot.snapshotHash);
    expect(afterResolution.rfContextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(resolved.artifacts.rd!.economicLayer.charges.find((charge) => charge.id === target.id))
      .toMatchObject({ category: "other_source_grounded_fee", categoryResolution: "proven" });

    const changedBoundary = runStore.executeDurableCanonicalAnalysisRun({
      jobId: job.id,
      document,
      rfKnowledge: { ...rfKnowledge, accountRef: "account-b" },
    });
    expect(changedBoundary.runId).toBe(resolved.runId);
    expect(runStore.getPersistedAnalysisRunForJob(job.id)!.attemptCount).toBe(3);

    const repeated = runStore.executeDurableCanonicalAnalysisRun({
      jobId: job.id,
      document,
      rfKnowledge: { ...rfKnowledge, accountRef: "account-b" },
    });
    expect(repeated).toEqual(changedBoundary);
    expect(runStore.getPersistedAnalysisRunForJob(job.id)!.attemptCount).toBe(3);
  }, 30_000);
});
