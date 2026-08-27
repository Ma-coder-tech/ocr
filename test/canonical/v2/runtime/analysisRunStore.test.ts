import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  categorySubjectCode,
  unboundedKnowledgeScope,
  type KnowledgeAuditEvent,
  type KnowledgeEntry,
} from "../../../../src/canonical/v2/index.js";
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
      rfCatalogStatus: "available",
    });
    expect(persisted.rfCatalogBinding).toMatchObject({
      source: "governed_catalog", availability: "available", entryRefs: [],
      visibility: { mode: "anonymous_run", accountPrivateKnowledge: "excluded", tenantPrivateKnowledge: "disabled" },
    });
    expect(first.artifacts.rfResolution).toMatchObject({
      knowledgeBinding: { source: "governed_catalog", availability: "available" },
      snapshot: { entryCount: 0, validation: { status: "valid" } },
      validation: { status: "valid" },
    });
    expect(persisted.stages.map((stage) => [stage.stage, stage.status])).toEqual([
      ["source_ingress", "valid"], ["capability_admission", "valid"], ["rb", "valid"], ["rc", "valid"],
      ["rf_resolution", "valid"], ["rd", "valid"], ["re", "valid"], ["claim_inventory", "valid"],
      ["rg_planning", "valid"], ["rh", "valid"],
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
    expect(loadedDb.db.prepare(`SELECT COUNT(*) AS count FROM canonical_analysis_run_stages WHERE run_id = ?`).get(first.runId)).toEqual({ count: 10 });
    expect(persisted.rgClaimAdmissions).toEqual(first.artifacts.rgWorkLedger!.claimAdmissions);
    expect(persisted.rgWorkItems).toEqual(first.artifacts.rgWorkLedger!.workItems);
    expect(persisted.rgOperations).toEqual([]);
    expect(loadedDb.db.prepare(`SELECT COUNT(*) AS count FROM canonical_rg_operations WHERE run_id = ?`).get(first.runId))
      .toEqual({ count: 0 });

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
      schemaVersion: "canonical_analysis_run_v7",
      implementationVersion: "current_run_semantic_convergence_v1_1",
    });
    expect(afterUpgrade.stages).toHaveLength(10);
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

  it("binds each run to one governed immutable RF snapshot while later jobs see newly admitted versions", async () => {
    const [{ parsePdf }, store, runStore, catalog, loadedDb] = await Promise.all([
      import("../../../../src/parser.js"),
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/canonical/v2/runtime/rfKnowledgeCatalog.js"),
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
    const admitted = admittedKnowledge({
      id: "durable-category-map-admitted",
      version: 2,
      claimType: "stable_facet_mapping",
      subjectCode,
      value: { kind: "mapping", canonicalCode: "other_source_grounded_fee", sourceCode: subjectCode },
      scope: unboundedKnowledgeScope(),
      effectiveFrom: "2020-01-01",
      evidence: [{ ref: "reviewed-durable-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    const candidate: KnowledgeEntry = {
      ...admitted,
      id: "durable-category-map-candidate",
      version: 1,
      admission: { lifecycle: "candidate", authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] },
      confidence: "unresolved",
    };
    const created: KnowledgeAuditEvent = {
      eventId: "durable-category-map-created", entryRef: candidate.id, previousEntryRef: null, eventType: "created",
      authorityClass: null, authorityRef: null, occurredAt: "2026-01-01T00:00:00Z",
      priorVersion: null, nextVersion: 1, priorState: null, nextState: "candidate",
      priorVisibility: null, nextVisibility: "reusable", reasonCodes: ["created_candidate"],
      policyVersion: "payments_knowledge_library_v0_2",
    };
    const admission: KnowledgeAuditEvent = {
      eventId: "durable-category-map-admission", entryRef: admitted.id, previousEntryRef: candidate.id, eventType: "admitted",
      authorityClass: admitted.admission.authorityClass, authorityRef: admitted.admission.authorityRef,
      occurredAt: admitted.admission.admittedAt!, priorVersion: 1, nextVersion: 2,
      priorState: "candidate", nextState: "admitted", priorVisibility: "reusable", nextVisibility: "reusable",
      reasonCodes: ["claim_evidence_verified"], policyVersion: "payments_knowledge_library_v0_2",
    };
    catalog.appendGovernedRfKnowledgeVersion({ entry: candidate, auditEvent: created });
    catalog.appendGovernedRfKnowledgeVersion({ entry: admitted, auditEvent: admission });

    const stillBound = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    expect(stillBound).toEqual(baseline);
    expect(runStore.getPersistedAnalysisRunForJob(job.id)!.attemptCount).toBe(1);

    const laterJob = store.createJob({ fileName: "later.pdf", filePath: fixture, fileType: "pdf", businessType: "retail" });
    const resolved = runStore.executeDurableCanonicalAnalysisRun({ jobId: laterJob.id, document });
    const afterResolution = runStore.getPersistedAnalysisRunForJob(laterJob.id)!;
    expect(afterResolution).toMatchObject({ attemptCount: 1, rfCatalogStatus: "available" });
    expect(afterResolution.rfCatalogBinding?.entryRefs).toEqual([`${admitted.id}@${admitted.version}`]);
    expect(afterResolution.rfSnapshotHash).toBe(resolved.artifacts.rfResolution!.snapshot.snapshotHash);
    expect(resolved.artifacts.rfResolution!.knowledgeBinding).toMatchObject({
      source: "governed_catalog", availability: "available", visibilityMode: "anonymous_run",
      tenantPrivateKnowledge: "disabled",
    });
    expect(resolved.artifacts.rd!.economicLayer.charges.find((charge) => charge.id === target.id))
      .toMatchObject({ category: "other_source_grounded_fee", categoryResolution: "proven" });

    const repeated = runStore.executeDurableCanonicalAnalysisRun({ jobId: laterJob.id, document });
    expect(repeated).toEqual(resolved);
    expect(runStore.getPersistedAnalysisRunForJob(laterJob.id)!.attemptCount).toBe(1);
  }, 30_000);

  it("distinguishes catalog unavailability and preserves independently proven canonical economics", async () => {
    const [{ parsePdf }, store, runStore, loadedDb] = await Promise.all([
      import("../../../../src/parser.js"),
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const document = await parsePdf(fixture);
    const job = store.createJob({ fileName: "statement.pdf", filePath: fixture, fileType: "pdf", businessType: "retail" });
    loadedDb.db.exec(`DROP TABLE canonical_rf_knowledge_entries`);

    const run = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const persisted = runStore.getPersistedAnalysisRunForJob(job.id)!;
    expect(run.status).toBe("completed_with_limitations");
    expect(run.stageOutcomes.rf_resolution).toMatchObject({ status: "invalid" });
    expect(run.stageOutcomes.rf_resolution.errors).toEqual(expect.arrayContaining([
      "rf_knowledge_catalog_unavailable", "rf_catalog_read_or_validation_failed",
    ]));
    expect(run.artifacts.rfResolution).toMatchObject({
      knowledgeBinding: { source: "governed_catalog", availability: "unavailable" },
      validation: { status: "invalid" },
    });
    expect(run.stageOutcomes.rb.status).toBe("valid");
    expect(run.stageOutcomes.rd.status).toBe("valid");
    expect(run.stageOutcomes.claim_inventory.status).toBe("valid");
    expect(run.stageOutcomes.rg_planning.status).toBe("valid");
    expect(run.artifacts.rgWorkLedger).toMatchObject({
      rfBinding: { availability: "unavailable" },
      workItems: [], operations: [], validation: { status: "valid" },
    });
    expect(run.artifacts.rgWorkLedger!.claimAdmissions.every((claim) =>
      claim.researchAdmission === "withheld_rf_catalog_unavailable")).toBe(true);
    expect(run.artifacts.rd!.economicLayer.charges.length).toBeGreaterThan(0);
    expect(run.canonicalTruthHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted).toMatchObject({ rfCatalogStatus: "unavailable", rfSnapshotHash: "" });
    expect(persisted.rfCatalogBinding?.limitationCodes).toContain("rf_catalog_read_or_validation_failed");
  }, 30_000);
});
