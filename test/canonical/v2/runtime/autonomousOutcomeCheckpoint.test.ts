import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanonicalAdaptiveContinuationState,
  CanonicalAutonomousResearchLifecycle,
} from "../../../../src/canonical/v2/runtime/adaptiveContinuationTypes.js";
import type { CanonicalAutonomousOutcomeCompletion } from "../../../../src/canonical/v2/runtime/adaptiveExecutionTypes.js";

describe("durable AnalysisRun autonomous-outcome checkpoint", () => {
  let dbModule: typeof import("../../../../src/db.js");
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
  });

  afterEach(async () => {
    try { dbModule?.db.close(); } catch { /* restart coverage may already close it */ }
    delete process.env.FEECLEAR_DB_PATH;
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it.each([
    ["trustworthy_completion_no_further_material_work", "trustworthy_complete"],
    ["trustworthy_completion_with_safely_unresolved", "trustworthy_complete"],
    ["continuation_judgment_unresolved", "stopped_unresolved"],
    ["operational_degradation_blocks_judgment", "stopped_operationally"],
    ["indeterminate_reconciliation_required", "reconciliation_required"],
  ] as Array<[CanonicalAutonomousResearchLifecycle, CanonicalAutonomousOutcomeCompletion]>)
  ("persists approved lifecycle %s as %s without changing AnalysisRun status", async (lifecycle, completion) => {
    const setup = await syntheticRun(lifecycle);
    const before = setup.db.db.prepare(`SELECT status, completed_at FROM canonical_analysis_runs WHERE id = ?`)
      .get(setup.runId);

    const checkpoint = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId,
      financialFoundationHashAtCycleStart: "financial-1",
    });
    const persisted = setup.store.getPersistedAnalysisRun(setup.runId)!;
    const after = setup.db.db.prepare(`SELECT status, completed_at FROM canonical_analysis_runs WHERE id = ?`)
      .get(setup.runId);

    expect(checkpoint).toMatchObject({
      checkpointRevision: 1,
      checkpointKind: "settled",
      lifecycle,
      completion,
      authority: "production_internal_canonical",
      analysisRunStatusCompatibility: "pre_adaptive_status_meaning_unchanged",
      customerReportAuthority: "legacy_report_unchanged",
      financialFoundationIntegrity: { cycleStartHash: "financial-1", cycleEndHash: "financial-1", preserved: true },
    });
    expect(checkpoint.binding).toMatchObject({
      sourceFingerprint: "source-1",
      rfSnapshotHash: "rf-snapshot-1",
      rfContextHash: "rf-context-1",
      financialFoundationHash: "financial-1",
      semanticHash: "semantic-1",
      canonicalStateHash: "canonical-1",
      semanticRevision: 1,
      planHash: "plan-1",
      planGeneration: 1,
      executionGeneration: 2,
      continuationRevision: 1,
      continuationStateHash: `state-${lifecycle}`,
      rhArtifactHash: null,
    });
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(persisted.autonomousOutcome?.checkpointHash).toBe(checkpoint.checkpointHash);
    expect(after).toEqual(before);
  });

  it("is idempotent for the same settled state and creates a successor only after true lineage changes", async () => {
    const setup = await syntheticRun("continuation_judgment_unresolved");
    const first = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    const replay = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    expect(replay).toEqual(first);
    expect(outcomeCount(setup.db.db, setup.runId)).toBe(1);

    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET semantic_revision = 2, semantic_hash = 'semantic-2',
      canonical_state_hash = 'canonical-2' WHERE id = ?`).run(setup.runId);
    expect(setup.store.getPersistedAnalysisRun(setup.runId)!.autonomousOutcomeIntegrity).toMatchObject({ status: "stale" });

    const nextState = continuationState("trustworthy_completion_with_safely_unresolved", 2, 2, "semantic-2", "canonical-2");
    insertContinuation(setup.db.db, setup.runId, nextState);
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET continuation_revision = 2,
      continuation_lifecycle = ?, continuation_state_hash = ? WHERE id = ?`)
      .run(nextState.lifecycle, nextState.stateHash, setup.runId);
    const successor = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });

    expect(successor).toMatchObject({ checkpointRevision: 2, completion: "trustworthy_complete" });
    expect(successor.checkpointHash).not.toBe(first.checkpointHash);
    expect(outcomeCount(setup.db.db, setup.runId)).toBe(2);
    expect(setup.store.getPersistedAnalysisRun(setup.runId)!.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
  });

  it("refuses to publish a settled checkpoint while semantic convergence or authorized work remains", async () => {
    const convergence = await syntheticRun("convergence_required");
    await expect(() => convergence.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: convergence.runId, financialFoundationHashAtCycleStart: "financial-1",
    })).toThrow("canonical_autonomous_outcome_lifecycle_not_settled");
    expect(outcomeCount(convergence.db.db, convergence.runId)).toBe(0);

    const ready = await syntheticRun("continuation_ready_provider_execution_authorized");
    await expect(() => ready.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: ready.runId, financialFoundationHashAtCycleStart: "financial-1",
    })).toThrow("canonical_autonomous_outcome_lifecycle_not_settled");
    expect(outcomeCount(ready.db.db, ready.runId)).toBe(0);
  });

  it("records an execution interruption without claiming analytical completion and can later be superseded", async () => {
    const setup = await syntheticRun("continuation_ready_provider_execution_authorized");
    const interrupted = setup.store.persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    expect(interrupted).toMatchObject({
      checkpointKind: "execution_interrupted",
      completion: null,
      interruption: { phase: "adaptive_execution", reasonCode: "adaptive_execution_interrupted_before_outcome_settlement" },
    });
    expect(setup.store.getPersistedAnalysisRun(setup.runId)!.autonomousOutcomeIntegrity.status).toBe("current");

    const settledState = continuationState("continuation_judgment_unresolved", 2, 1, "semantic-1", "canonical-1");
    insertContinuation(setup.db.db, setup.runId, settledState);
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET continuation_revision = 2,
      continuation_lifecycle = ?, continuation_state_hash = ? WHERE id = ?`)
      .run(settledState.lifecycle, settledState.stateHash, setup.runId);
    const settled = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });

    expect(settled).toMatchObject({ checkpointRevision: 2, checkpointKind: "settled", completion: "stopped_unresolved" });
    expect(outcomeCount(setup.db.db, setup.runId)).toBe(2);
  });

  it("never regresses the active pointer when an older interrupted state is replayed after settlement", async () => {
    const setup = await syntheticRun("continuation_judgment_unresolved");
    const interrupted = setup.store.persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    const settled = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    const replayedInterruption = setup.store.persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    let persisted = setup.store.getPersistedAnalysisRun(setup.runId)!;

    expect(interrupted).toMatchObject({ checkpointRevision: 1, checkpointKind: "execution_interrupted" });
    expect(settled).toMatchObject({
      checkpointRevision: 2,
      checkpointKind: "settled",
      parentCheckpoint: { checkpointRevision: 1, checkpointHash: interrupted.checkpointHash },
    });
    expect(replayedInterruption).toEqual(settled);
    expect(persisted.autonomousOutcomeRevision).toBe(2);
    expect(persisted.autonomousOutcomeHash).toBe(settled.checkpointHash);
    expect(persisted.autonomousOutcome).toEqual(settled);
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(outcomeCount(setup.db.db, setup.runId)).toBe(2);

    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET autonomous_outcome_revision = 1,
      autonomous_outcome_hash = ? WHERE id = ?`).run(interrupted.checkpointHash, setup.runId);
    expect(setup.store.getPersistedAnalysisRun(setup.runId)!.autonomousOutcomeIntegrity).toEqual({
      status: "invalid", reasonCodes: ["autonomous_outcome_pointer_not_lineage_head"],
    });
    const healedReplay = setup.store.persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    persisted = setup.store.getPersistedAnalysisRun(setup.runId)!;
    expect(healedReplay).toEqual(settled);
    expect(persisted.autonomousOutcomeRevision).toBe(2);
    expect(persisted.autonomousOutcomeHash).toBe(settled.checkpointHash);
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
  });

  it("detects deletion of an older non-current checkpoint and refuses to extend truncated lineage", async () => {
    const setup = await syntheticRun("continuation_judgment_unresolved");
    setup.store.persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });

    setup.db.db.prepare(`DELETE FROM canonical_analysis_autonomous_outcome_revisions
      WHERE run_id = ? AND outcome_revision = 1`).run(setup.runId);
    const truncated = setup.store.getPersistedAnalysisRun(setup.runId)!;

    expect(truncated.autonomousOutcome).toBeNull();
    expect(truncated.autonomousOutcomeIntegrity).toMatchObject({ status: "invalid" });
    expect(truncated.autonomousOutcomeIntegrity.reasonCodes).toEqual(expect.arrayContaining([
      expect.stringMatching(/^autonomous_outcome_revision_gap:/),
      expect.stringMatching(/^autonomous_outcome_root_parent_invalid:/),
    ]));
    expect(() => setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    })).toThrow("canonical_autonomous_outcome_history_invalid");
  });

  it("truthfully records an interruption between semantic convergence and continuation readjudication", async () => {
    const setup = await syntheticRun("continuation_ready_provider_execution_authorized");
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET semantic_revision = 2, semantic_hash = 'semantic-2',
      canonical_state_hash = 'canonical-2' WHERE id = ?`).run(setup.runId);

    const interrupted = setup.store.persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    const persisted = setup.store.getPersistedAnalysisRun(setup.runId)!;

    expect(interrupted).toMatchObject({
      checkpointKind: "execution_interrupted",
      completion: null,
      continuationBindingStatus: "stale_at_interruption",
      binding: { semanticRevision: 2, semanticHash: "semantic-2", continuationRevision: 1 },
    });
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
  });

  it("survives restart with the same hash and append-only checkpoint", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ratereveal-outcome-checkpoint-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "checkpoint.sqlite");
    process.env.FEECLEAR_DB_PATH = databasePath;
    const setup = await syntheticRun("indeterminate_reconciliation_required");
    const checkpoint = setup.store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });
    setup.db.db.close();

    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = databasePath;
    const [store, loadedDb] = await Promise.all([
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const restarted = store.getPersistedAnalysisRun(setup.runId)!;
    const replay = store.persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: setup.runId, financialFoundationHashAtCycleStart: "financial-1",
    });

    expect(restarted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(restarted.autonomousOutcome?.checkpointHash).toBe(checkpoint.checkpointHash);
    expect(replay).toEqual(checkpoint);
    expect(outcomeCount(loadedDb.db, setup.runId)).toBe(1);
    expect(() => loadedDb.db.prepare(`UPDATE canonical_analysis_autonomous_outcome_revisions
      SET outcome_hash = 'tampered' WHERE run_id = ? AND outcome_revision = 1`).run(setup.runId))
      .toThrow("canonical_autonomous_outcome_checkpoint_is_immutable");
  });

  async function syntheticRun(lifecycle: CanonicalAutonomousResearchLifecycle) {
    const [storeModule, store, loadedDb] = await Promise.all([
      import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const job = storeModule.createJob({ fileName: "statement.pdf", filePath: "/tmp/statement.pdf", fileType: "pdf",
      businessType: "retail" });
    const runId = `run-${job.id}`;
    const now = new Date().toISOString();
    loadedDb.db.prepare(`INSERT INTO canonical_analysis_runs
      (id, job_id, source_document_ref, source_fingerprint, schema_version, implementation_version, policy_version,
       status, family_status, parser_driver_id, attempt_count, canonical_truth_hash, financial_foundation_hash,
       semantic_hash, canonical_state_hash, semantic_revision, rg_plan_hash, rg_plan_generation,
       rg_execution_generation, continuation_revision, continuation_lifecycle, continuation_state_hash,
       rf_snapshot_hash, rf_context_hash, rf_catalog_status, limitations_json, created_at, started_at, completed_at, updated_at)
      VALUES (?, ?, 'job-source', 'source-1', 'canonical_analysis_run_v9', 'adaptive_continuation_execution_loop_v1',
       'frozen_product_model_runtime_policy_v0_2', 'completed_with_limitations', 'proven',
       'fiserv_first_data_short_statement', 1, 'truth-1', 'financial-1', 'semantic-1', 'canonical-1', 1,
       'plan-1', 1, 2, 1, ?, ?, 'rf-snapshot-1', 'rf-context-1', 'available', '[]', ?, ?, ?, ?)`)
      .run(runId, job.id, lifecycle, `state-${lifecycle}`, now, now, now, now);
    insertContinuation(loadedDb.db, runId, continuationState(lifecycle, 1, 1, "semantic-1", "canonical-1"));
    return { runId, store, db: loadedDb };
  }
});

function continuationState(lifecycle: CanonicalAutonomousResearchLifecycle, controllerRevision: number,
  semanticRevision: number, semanticHash: string, canonicalStateHash: string): CanonicalAdaptiveContinuationState {
  return {
    schemaVersion: "canonical_adaptive_continuation_v1_2",
    runId: "synthetic",
    controllerRevision,
    binding: {
      semanticRevision,
      semanticHash,
      canonicalStateHash,
      planHash: "plan-1",
      planGeneration: 1,
      rfSnapshotHash: "rf-snapshot-1",
    },
    lifecycle,
    decisions: [],
    cumulativeResource: {
      providerCalls: 3, searchCalls: 1, aiCalls: 2, tokensObserved: 40, tokenAccountingComplete: true,
      retrievalBytes: 512, retrievalDocuments: 1, retries: 0, operationReservations: 3, workReservations: 1,
      elapsedMsObserved: 20, providerCodes: ["test-provider"], terminalReasons: [],
    },
    continuationReadyAtomicClaimIds: lifecycle === "continuation_ready_provider_execution_authorized" ? ["claim-1"] : [],
    providerExecution: "continuation_authorized_existing_executor",
    secondPassProviderCalls: 0,
    stateHash: `state-${lifecycle}`,
    reasonCodes: [`reason-${lifecycle}`],
    createdAt: new Date().toISOString(),
  };
}

function insertContinuation(database: import("better-sqlite3").Database, runId: string,
  state: CanonicalAdaptiveContinuationState): void {
  database.prepare(`INSERT INTO canonical_analysis_continuation_revisions
    (run_id, controller_revision, semantic_revision, semantic_hash, canonical_state_hash, plan_hash,
     plan_generation, rf_snapshot_hash, lifecycle, state_hash, state_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(runId, state.controllerRevision, state.binding.semanticRevision, state.binding.semanticHash,
      state.binding.canonicalStateHash, state.binding.planHash, state.binding.planGeneration,
      state.binding.rfSnapshotHash, state.lifecycle, state.stateHash, JSON.stringify({ ...state, runId }), state.createdAt);
}

function outcomeCount(database: import("better-sqlite3").Database, runId: string): number {
  return Number((database.prepare(`SELECT COUNT(*) AS count FROM canonical_analysis_autonomous_outcome_revisions
    WHERE run_id = ?`).get(runId) as { count: number }).count);
}
