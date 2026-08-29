import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanonicalRgDiscoveryCandidate,
  CanonicalRgEvidenceExecutionPorts,
  CanonicalRgInvestigatedCandidate,
  CanonicalRgRetrievedDocument,
  CanonicalRgVerificationJudgment,
} from "../../../../src/canonical/v2/runtime/rgEvidenceExecution.js";

const fixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");

describe("durable continuation-authorized adaptive execution", () => {
  let dbModule: typeof import("../../../../src/db.js");
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
  });

  afterEach(async () => {
    try { dbModule?.db.close(); } catch { /* restart tests may already close it */ }
    delete process.env.FEECLEAR_DB_PATH;
    delete process.env.CANONICAL_RECOVERY_BASE_DELAY_MS;
    delete process.env.CANONICAL_RECOVERY_LEASE_MS;
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("executes only a controller-authorized refinement, excludes prior evidence, converges, and stops on remaining uncertainty", async () => {
    const setup = await setupOneWorkItem();
    const observations = { calls: [] as string[], maximumExcludedFingerprintsObserved: 0, targetAtomicClaimId: "" };
    observations.targetAtomicClaimId = setup.persisted.rgWorkItems[0]!.atomicClaimId;
    const ports = adaptivePorts(observations, false, true);

    const result = await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId, ports,
      workerId: "adaptive-worker-a", operationalPolicy: operationalPolicy(1_000) });
    const persisted = setup.store.getPersistedAnalysisRun(setup.run.runId)!;
    const targetGrants = persisted.continuationExecutionGrants
      .filter((item) => item.atomicClaimId === observations.targetAtomicClaimId)
      .sort((left, right) => left.executionGeneration - right.executionGeneration);
    const [periodGrant, scopeGrant] = targetGrants;
    const targetEvidence = persisted.externalEvidenceRegistry.find((item) => item.atomicClaimId === observations.targetAtomicClaimId)!;

    expect(targetGrants).toHaveLength(2);
    expect(periodGrant).toMatchObject({ disposition: "justified_refinement", executionGeneration: 1,
      providerExecution: "authorized_exact_claim_delta", analyticalCompletionEffect: "none",
      effectiveWorkItem: { continuationContract: { kind: "period_refinement",
        requiredGap: "correct_authority_wrong_period", excludedDocumentFingerprints: [expect.any(String)] } } });
    expect(scopeGrant).toMatchObject({ disposition: "justified_refinement", executionGeneration: 2,
      providerExecution: "authorized_exact_claim_delta", analyticalCompletionEffect: "none",
      effectiveWorkItem: { continuationContract: { kind: "scope_refinement",
        requiredGap: "refinable_scope_mismatch",
        excludedDocumentFingerprints: [expect.any(String), expect.any(String)] } } });
    expect(periodGrant!.effectiveWorkContractFingerprint).not.toBe(periodGrant!.priorWorkContractFingerprint);
    expect(scopeGrant!.effectiveWorkContractFingerprint).not.toBe(scopeGrant!.priorWorkContractFingerprint);
    expect(observations.maximumExcludedFingerprintsObserved).toBe(2);
    expect(targetEvidence).toMatchObject({ executionGrantId: scopeGrant!.grantId,
      executionGeneration: scopeGrant!.executionGeneration, atomicClaimId: scopeGrant!.atomicClaimId });
    expect(persisted.semanticRevision).toBeGreaterThan(0);
    expect(persisted.financialFoundationHash).toBe(setup.run.financialFoundationHash);
    expect(result).toMatchObject({ lifecycle: "continuation_judgment_unresolved",
      completion: "stopped_unresolved", financialFoundationPreserved: true,
      customerReportAuthority: "legacy_report_unchanged" });
    expect(result).toMatchObject({
      outcomeCheckpointRevision: persisted.autonomousOutcomeRevision,
      outcomeCheckpointHash: persisted.autonomousOutcomeHash,
    });
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(persisted.autonomousOutcome).toMatchObject({
      checkpointKind: "settled",
      lifecycle: result.lifecycle,
      completion: result.completion,
      binding: { semanticRevision: persisted.semanticRevision, executionGeneration: persisted.rgExecutionGeneration },
    });
    expect(result.executedGrantIds).toEqual(expect.arrayContaining([periodGrant!.grantId, scopeGrant!.grantId]));
    const operationGrantIds = new Set([
      ...persisted.rgOperations.map((item) => item.executionGrantId),
      ...persisted.rgExecutionEvents.map((item) => (item.event as { operation?: { executionGrantId?: string | null } })
        .operation?.executionGrantId ?? null),
    ]);
    expect(result.executedGrantIds.every((grantId) => persisted.continuationExecutionGrants.some((item) =>
      item.grantId === grantId))).toBe(true);
    expect(operationGrantIds.has(periodGrant!.grantId)).toBe(true);
    expect(operationGrantIds.has(scopeGrant!.grantId)).toBe(true);
    expect(persisted.result!.manifest.customerReportAuthority).toBe("legacy_report_unchanged");
    expect(observations.calls.filter((item) => item === "target-continuation-search")).toHaveLength(2);
  }, 30_000);

  it("serializes the AnalysisRun cycle and never executes continuation work without its immutable grant", async () => {
    const setup = await setupReadyRefinement();
    const calls: string[] = [];
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const began = new Promise<void>((resolve) => { started = resolve; });
    const ports = unresolvedPorts(calls, async () => { started(); await gate; });

    await expect(setup.executor.executeDurableCanonicalRgEvidence({ runId: setup.run.runId, ports }))
      .rejects.toThrow("rg_evidence_regenerated_or_readjudicated_plan_execution_disabled");
    const first = setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId, ports,
      workerId: "cycle-owner-a", operationalPolicy: operationalPolicy(1_000) });
    await Promise.race([began, first.then(() => { throw new Error("adaptive_cycle_completed_before_provider_gate"); })]);
    await expect(setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId, ports,
      workerId: "cycle-owner-b", operationalPolicy: operationalPolicy(1_000) }))
      .rejects.toThrow("adaptive_execution_cycle_lease_unavailable");
    release();
    const result = await first;

    expect(result).toMatchObject({ executionGeneration: 1, completion: "stopped_unresolved" });
    expect(calls).toEqual(["continuation-search"]);
    expect(setup.store.getPersistedAnalysisRun(setup.run.runId)!.continuationExecutionGrants).toHaveLength(1);
    expect(setup.store.getPersistedAnalysisRun(setup.run.runId)!.autonomousOutcomeRevisions).toHaveLength(1);
  }, 30_000);

  it("treats cumulative operational exhaustion as degradation without a provider send or analytical completion", async () => {
    const setup = await setupReadyRefinement();
    const calls: string[] = [];
    const baseline = setup.store.getPersistedAnalysisRun(setup.run.runId)!.continuationRevisions.at(-1)!.cumulativeResource.providerCalls;
    const result = await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: unresolvedPorts(calls), workerId: "ceiling-worker", operationalPolicy: operationalPolicy(baseline) });
    const persisted = setup.store.getPersistedAnalysisRun(setup.run.runId)!;

    expect(calls).toEqual([]);
    expect(result).toMatchObject({ lifecycle: "operational_degradation_blocks_judgment",
      completion: "stopped_operationally" });
    expect(persisted.rgWorkItems[0]).toMatchObject({ executionState: "degraded_emergency_circuit_breaker",
      stopReason: "rg_emergency_cumulative_provider_call_ceiling_reached_not_analytical_completion" });
    expect(persisted.continuationRevisions.at(-1)!.decisions[0]).toMatchObject({
      disposition: "operationally_degraded_withheld",
      degradation: { subtype: "resource_or_runtime_exhaustion", continuationPermission: "withheld_operationally" },
    });
    expect(persisted.continuationRevisions.at(-1)!.decisions[0]!.disposition).not.toBe("safely_unresolved");
  }, 30_000);

  it("durably records an unexpected adaptive interruption without asserting completion", async () => {
    const setup = await setupReadyRefinement();
    const calls: string[] = [];
    const ports = unresolvedPorts(calls, async () => {
      setup.db.db.prepare(`UPDATE canonical_analysis_runs SET financial_foundation_hash = 'mutated-foundation'
        WHERE id = ?`).run(setup.run.runId);
    });

    await expect(setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId, ports,
      workerId: "integrity-failure-worker", operationalPolicy: operationalPolicy(1_000) }))
      .rejects.toThrow("adaptive_execution_financial_foundation_mutation");
    const persisted = setup.store.getPersistedAnalysisRun(setup.run.runId)!;

    expect(calls).toEqual(["continuation-search"]);
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(persisted.autonomousOutcome).toMatchObject({
      checkpointKind: "execution_interrupted",
      completion: null,
      interruption: { reasonCode: "adaptive_execution_interrupted_before_outcome_settlement" },
      financialFoundationIntegrity: { preserved: false, cycleEndHash: "mutated-foundation" },
      customerReportAuthority: "legacy_report_unchanged",
    });
  }, 30_000);

  it("reuses one durable unconsumed grant after restart and does not duplicate the provider send", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ratereveal-adaptive-restart-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "adaptive.sqlite");
    process.env.FEECLEAR_DB_PATH = databasePath;
    const setup = await setupReadyRefinement();
    const state = setup.store.getPersistedAnalysisRun(setup.run.runId)!.continuationRevisions.at(-1)!;
    const expires = new Date(Date.now() + 60_000).toISOString();
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_owner = ?, adaptive_cycle_lease_expires_at = ? WHERE id = ?`)
      .run("crashed-worker", expires, setup.run.runId);
    const grant = setup.adaptive.authorizeNextDurableCanonicalContinuationExecution({ runId: setup.run.runId,
      controllerRevision: state.controllerRevision, continuationStateHash: state.stateHash,
      operationalPolicy: operationalPolicy(1_000), cycleOwnerId: "crashed-worker" });
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_lease_expires_at = ? WHERE id = ?`)
      .run("2000-01-01T00:00:00.000Z", setup.run.runId);
    setup.db.db.close();

    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = databasePath;
    const [adaptive, store, loadedDb] = await Promise.all([
      import("../../../../src/canonical/v2/runtime/adaptiveExecution.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const calls: string[] = [];
    const result = await adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: unresolvedPorts(calls), workerId: "restart-worker", operationalPolicy: operationalPolicy(1_000) });
    const persisted = store.getPersistedAnalysisRun(setup.run.runId)!;

    expect(result.executedGrantIds).toEqual([grant.grantId]);
    expect(calls).toEqual(["continuation-search"]);
    expect(persisted.continuationExecutionGrants).toHaveLength(1);
    expect(persisted.rgExecutionGeneration).toBe(1);
    expect(persisted.rgOperations.filter((item) => item.executionGrantId === grant.grantId)).toHaveLength(1);
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(persisted.autonomousOutcome?.checkpointHash).toBe(result.outcomeCheckpointHash);
    expect(() => loadedDb.db.prepare(`UPDATE canonical_analysis_continuation_execution_grants
      SET grant_hash = 'tampered' WHERE run_id = ? AND grant_id = ?`).run(setup.run.runId, grant.grantId))
      .toThrow("canonical_continuation_execution_grant_is_immutable");
  }, 30_000);

  it("durably resumes only the exact retry-eligible claim and leaves the legacy job payload untouched", async () => {
    process.env.CANONICAL_RECOVERY_BASE_DELAY_MS = "0";
    const setup = await setupReadyRefinement();
    const legacyBefore = setup.db.db.prepare(`SELECT status, progress, summary_json FROM analysis_jobs WHERE id = ?`)
      .get(setup.job.id);
    const first = await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: { ...unresolvedPorts([]), availability: "unavailable",
        unavailabilityReasonCodes: ["synthetic_provider_unavailable"] },
      workerId: "initial-degraded-worker", operationalPolicy: operationalPolicy(1_000) });
    const recoveryStore = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js");
    const recoveryWorker = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryWorker.js");
    const [intent] = recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId);
    const calls: string[] = [];

    expect(first).toMatchObject({ completion: "stopped_operationally",
      lifecycle: "operational_degradation_blocks_judgment" });
    expect(intent).toMatchObject({ state: "scheduled", dispatchCount: 0,
      intent: { authorization: { disposition: "operationally_degraded_retry_eligible",
        continuationPermission: "bounded_retry_eligible" }, analyticalCompletionEffect: "none",
        customerReportAuthority: "legacy_report_unchanged" } });
    const ordinaryCalls: string[] = [];
    const ordinaryReplay = await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: unresolvedPorts(ordinaryCalls), workerId: "ordinary-adaptive-replay",
      operationalPolicy: operationalPolicy(1_000) });
    expect(ordinaryReplay.executedGrantIds).toEqual([]);
    expect(ordinaryCalls).toEqual([]);
    expect(ordinaryReplay.outcomeCheckpointRevision).toBe(first.outcomeCheckpointRevision);
    const recovered = await recoveryWorker.processCanonicalAnalysisRecoveryIntent({ intentId: intent!.intent.intentId,
      workerId: "recovery-worker", ports: unresolvedPorts(calls) });
    const persisted = setup.store.getPersistedAnalysisRun(setup.run.runId)!;
    const retryGrant = persisted.continuationExecutionGrants.find((item) =>
      item.disposition === "operationally_degraded_retry_eligible");

    expect(recovered).toMatchObject({ completion: "stopped_unresolved", executedGrantIds: [retryGrant!.grantId] });
    expect(retryGrant).toMatchObject({ providerExecution: "authorized_exact_claim_operational_retry",
      analyticalCompletionEffect: "none", atomicClaimId: intent!.intent.authorization.atomicClaimId });
    expect(calls).toEqual(["continuation-search"]);
    expect(recoveryStore.getCanonicalAnalysisRecoveryIntent(intent!.intent.intentId)).toMatchObject({
      state: "completed", dispatchCount: 1, leaseOwner: null, leaseExpiresAt: null,
    });
    expect(persisted.autonomousOutcomeRevision).toBe(first.outcomeCheckpointRevision + 1);
    expect(persisted.autonomousOutcomeIntegrity).toEqual({ status: "current", reasonCodes: [] });
    expect(persisted.financialFoundationHash).toBe(setup.run.financialFoundationHash);
    expect(setup.db.db.prepare(`SELECT status, progress, summary_json FROM analysis_jobs WHERE id = ?`)
      .get(setup.job.id)).toEqual(legacyBefore);
    expect(() => setup.db.db.prepare(`UPDATE canonical_analysis_recovery_intents SET intent_hash = 'tampered'
      WHERE intent_id = ?`).run(intent!.intent.intentId)).toThrow("canonical_analysis_recovery_intent_binding_is_immutable");
    setup.db.db.prepare(`DELETE FROM canonical_analysis_recovery_events WHERE intent_id = ? AND event_sequence = 1`)
      .run(intent!.intent.intentId);
    expect(() => recoveryStore.getCanonicalAnalysisRecoveryIntent(intent!.intent.intentId))
      .toThrow("canonical_recovery_event_lineage_invalid");
  }, 30_000);

  it("keeps an exact retry-eligible claim durably scheduled across a prolonged provider outage", async () => {
    process.env.CANONICAL_RECOVERY_BASE_DELAY_MS = "0";
    const setup = await setupReadyRefinement();
    const unavailablePorts = { ...unresolvedPorts([]), availability: "unavailable" as const,
      unavailabilityReasonCodes: ["synthetic_prolonged_provider_outage"] };
    await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: unavailablePorts, workerId: "initial-outage-worker", operationalPolicy: operationalPolicy(1_000) });
    const recoveryStore = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js");
    const recoveryWorker = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryWorker.js");
    const scheduledIntentIds: string[] = [];

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const scheduled = recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId)
        .filter((item) => item.state === "scheduled");
      expect(scheduled).toHaveLength(1);
      scheduledIntentIds.push(scheduled[0]!.intent.intentId);
      const result = await recoveryWorker.processCanonicalAnalysisRecoveryIntent({
        intentId: scheduled[0]!.intent.intentId,
        workerId: `prolonged-outage-worker-${cycle}`,
        ports: unavailablePorts,
      });
      const persisted = setup.store.getPersistedAnalysisRun(setup.run.runId)!;
      expect(result).toMatchObject({ lifecycle: "operational_degradation_blocks_judgment",
        completion: "stopped_operationally" });
      expect(persisted.continuationRevisions.at(-1)!.decisions.some((item) =>
        item.atomicClaimId === scheduled[0]!.intent.authorization.atomicClaimId
        && item.disposition === "operationally_degraded_retry_eligible"
        && item.degradation?.continuationPermission === "bounded_retry_eligible")).toBe(true);
      expect(recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId)
        .filter((item) => item.state === "scheduled")).toHaveLength(1);
    }

    expect(new Set(scheduledIntentIds).size).toBeLessThan(scheduledIntentIds.length);
    expect(recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId)
      .reduce((sum, item) => sum + item.dispatchCount, 0)).toBe(4);
  }, 30_000);

  it("renews a live recovery lease and rejects a competing claimant during a long adaptive cycle", async () => {
    process.env.CANONICAL_RECOVERY_BASE_DELAY_MS = "0";
    process.env.CANONICAL_RECOVERY_LEASE_MS = "45";
    const setup = await setupReadyRefinement();
    await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: { ...unresolvedPorts([]), availability: "unavailable",
        unavailabilityReasonCodes: ["synthetic_provider_unavailable"] },
      workerId: "initial-degraded-worker", operationalPolicy: operationalPolicy(1_000) });
    const recoveryStore = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js");
    const recoveryWorker = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryWorker.js");
    const [intent] = recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId);
    const calls: string[] = [];
    const competingCalls: string[] = [];
    let releaseSearch!: () => void;
    let markSearchStarted!: () => void;
    const searchStarted = new Promise<void>((resolve) => { markSearchStarted = resolve; });
    const searchRelease = new Promise<void>((resolve) => { releaseSearch = resolve; });
    const liveRecovery = recoveryWorker.processCanonicalAnalysisRecoveryIntent({
      intentId: intent!.intent.intentId,
      workerId: "long-running-recovery-worker",
      ports: unresolvedPorts(calls, async () => { markSearchStarted(); await searchRelease; }),
    });

    await searchStarted;
    await new Promise((resolve) => setTimeout(resolve, 140));
    const during = recoveryStore.getCanonicalAnalysisRecoveryIntent(intent!.intent.intentId)!;
    expect(during).toMatchObject({ state: "leased", leaseOwner: "long-running-recovery-worker" });
    expect(Date.parse(during.leaseExpiresAt!)).toBeGreaterThan(Date.now());
    expect(Number((setup.db.db.prepare(`SELECT COUNT(*) AS count FROM canonical_analysis_recovery_events
      WHERE intent_id = ? AND event_type = 'lease_renewed'`).get(intent!.intent.intentId) as { count: number }).count))
      .toBeGreaterThan(0);
    setup.db.db.prepare(`UPDATE canonical_analysis_recovery_intents SET lease_expires_at = ? WHERE intent_id = ?`)
      .run("2000-01-01T00:00:00.000Z", intent!.intent.intentId);
    expect(await recoveryWorker.processCanonicalAnalysisRecoveryIntent({
      intentId: intent!.intent.intentId,
      workerId: "competing-recovery-worker",
      ports: unresolvedPorts(competingCalls),
    })).toBeNull();
    expect(competingCalls).toEqual([]);

    releaseSearch();
    const result = await liveRecovery;
    const persisted = setup.store.getPersistedAnalysisRun(setup.run.runId)!;
    const retryGrant = persisted.continuationExecutionGrants.find((item) =>
      item.disposition === "operationally_degraded_retry_eligible")!;
    expect(result).toMatchObject({ completion: "stopped_unresolved" });
    expect(calls).toEqual(["continuation-search"]);
    expect(persisted.rgOperations.filter((item) => item.kind === "public_search"
      && item.executionGrantId === retryGrant.grantId)).toHaveLength(1);
    expect(recoveryStore.getCanonicalAnalysisRecoveryIntent(intent!.intent.intentId)).toMatchObject({
      state: "completed", dispatchCount: 1, leaseOwner: null,
    });
  }, 30_000);

  it("recovers an expired intent and persisted retry grant after restart without a duplicate send", async () => {
    process.env.CANONICAL_RECOVERY_BASE_DELAY_MS = "0";
    process.env.CANONICAL_RECOVERY_LEASE_MS = "60000";
    const directory = await mkdtemp(path.join(os.tmpdir(), "ratereveal-recovery-restart-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "recovery.sqlite");
    process.env.FEECLEAR_DB_PATH = databasePath;
    const setup = await setupReadyRefinement();
    await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: { ...unresolvedPorts([]), availability: "unavailable",
        unavailabilityReasonCodes: ["synthetic_provider_unavailable"] },
      workerId: "initial-degraded-worker", operationalPolicy: operationalPolicy(1_000) });
    const recoveryStore = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js");
    const [intent] = recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId);
    const claimed = recoveryStore.claimCanonicalAnalysisRecoveryIntent(intent!.intent.intentId, "crashed-recovery-worker")!;
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_owner = ?, adaptive_cycle_lease_expires_at = ?
      WHERE id = ?`).run("crashed-recovery-worker", new Date(Date.now() + 60_000).toISOString(), setup.run.runId);
    const state = setup.store.getPersistedAnalysisRun(setup.run.runId)!.continuationRevisions.at(-1)!;
    const grant = setup.adaptive.authorizeNextDurableCanonicalContinuationExecution({ runId: setup.run.runId,
      controllerRevision: state.controllerRevision, continuationStateHash: state.stateHash,
      operationalPolicy: operationalPolicy(1_000), cycleOwnerId: "crashed-recovery-worker",
      recoveryIntentId: claimed.intent.intentId, recoveryDecisionId: claimed.intent.authorization.decisionId });
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_lease_expires_at = ? WHERE id = ?`)
      .run("2000-01-01T00:00:00.000Z", setup.run.runId);
    const outcomeRevisionBeforeOrdinaryReplay = setup.store.getPersistedAnalysisRun(setup.run.runId)!
      .autonomousOutcomeRevision;
    const ordinaryCalls: string[] = [];
    await expect(setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: unresolvedPorts(ordinaryCalls), workerId: "ordinary-restart-worker",
      operationalPolicy: operationalPolicy(1_000) }))
      .rejects.toThrow("adaptive_execution_claimed_recovery_intent_required");
    expect(ordinaryCalls).toEqual([]);
    expect(setup.store.getPersistedAnalysisRun(setup.run.runId)!.autonomousOutcomeRevision)
      .toBe(outcomeRevisionBeforeOrdinaryReplay);
    setup.db.db.prepare(`UPDATE canonical_analysis_recovery_intents SET lease_expires_at = ? WHERE intent_id = ?`)
      .run("2000-01-01T00:00:00.000Z", intent!.intent.intentId);
    setup.db.db.close();

    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = databasePath;
    const [recoveryWorker, recoveryStoreAfter, runStore, loadedDb] = await Promise.all([
      import("../../../../src/canonical/v2/runtime/adaptiveRecoveryWorker.js"),
      import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const calls: string[] = [];
    const result = await recoveryWorker.processCanonicalAnalysisRecoveryIntent({ intentId: intent!.intent.intentId,
      workerId: "restart-recovery-worker", ports: unresolvedPorts(calls) });
    const persisted = runStore.getPersistedAnalysisRun(setup.run.runId)!;

    expect(result?.executedGrantIds).toEqual([grant.grantId]);
    expect(calls).toEqual(["continuation-search"]);
    expect(persisted.continuationExecutionGrants.filter((item) =>
      item.disposition === "operationally_degraded_retry_eligible")).toHaveLength(1);
    expect(persisted.rgOperations.filter((item) => item.executionGrantId === grant.grantId)).toHaveLength(1);
    expect(recoveryStoreAfter.getCanonicalAnalysisRecoveryIntent(intent!.intent.intentId)).toMatchObject({
      state: "completed", dispatchCount: 2,
    });
  }, 30_000);

  it("permits one recovery claimant and never schedules withheld or reconciliation-required outcomes", async () => {
    process.env.CANONICAL_RECOVERY_BASE_DELAY_MS = "0";
    const setup = await setupReadyRefinement();
    await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: { ...unresolvedPorts([]), availability: "unavailable",
        unavailabilityReasonCodes: ["synthetic_provider_unavailable"] },
      workerId: "initial-degraded-worker", operationalPolicy: operationalPolicy(1_000) });
    const recoveryStore = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js");
    const [intent] = recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId);
    expect(recoveryStore.claimCanonicalAnalysisRecoveryIntent(intent!.intent.intentId, "claimant-a")).not.toBeNull();
    expect(recoveryStore.claimCanonicalAnalysisRecoveryIntent(intent!.intent.intentId, "claimant-b")).toBeNull();

    const withheld = await setupReadyRefinement();
    const baseline = withheld.store.getPersistedAnalysisRun(withheld.run.runId)!.continuationRevisions.at(-1)!
      .cumulativeResource.providerCalls;
    await withheld.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: withheld.run.runId,
      ports: unresolvedPorts([]), workerId: "withheld-worker", operationalPolicy: operationalPolicy(baseline) });
    expect(recoveryStore.ensureCanonicalAnalysisRecoveryIntent(withheld.run.runId)).toBeNull();
    expect(recoveryStore.listCanonicalAnalysisRecoveryIntents(withheld.run.runId)).toEqual([]);

    const reconciliation = await setupReadyRefinement();
    const transport = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const afterSendPorts = unresolvedPorts([]);
    afterSendPorts.search = async (_input, onSend) => {
      onSend();
      throw new transport.RgEvidenceTransportError("after_send", "synthetic_after_send_ambiguity");
    };
    const result = await reconciliation.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: reconciliation.run.runId,
      ports: afterSendPorts, workerId: "indeterminate-worker", operationalPolicy: operationalPolicy(1_000) });
    expect(result.completion).toBe("reconciliation_required");
    expect(recoveryStore.ensureCanonicalAnalysisRecoveryIntent(reconciliation.run.runId)).toBeNull();
    expect(recoveryStore.listCanonicalAnalysisRecoveryIntents(reconciliation.run.runId)).toEqual([]);
  }, 30_000);

  it("supersedes a stale recovery binding without a grant or provider send", async () => {
    process.env.CANONICAL_RECOVERY_BASE_DELAY_MS = "0";
    const setup = await setupReadyRefinement();
    await setup.adaptive.executeDurableCanonicalAdaptiveLoop({ runId: setup.run.runId,
      ports: { ...unresolvedPorts([]), availability: "unavailable",
        unavailabilityReasonCodes: ["synthetic_provider_unavailable"] },
      workerId: "initial-degraded-worker", operationalPolicy: operationalPolicy(1_000) });
    const recoveryStore = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryStore.js");
    const recoveryWorker = await import("../../../../src/canonical/v2/runtime/adaptiveRecoveryWorker.js");
    const [intent] = recoveryStore.listCanonicalAnalysisRecoveryIntents(setup.run.runId);
    setup.db.db.prepare(`UPDATE canonical_analysis_runs SET semantic_hash = 'stale-semantic-binding' WHERE id = ?`)
      .run(setup.run.runId);
    const calls: string[] = [];

    expect(await recoveryWorker.processCanonicalAnalysisRecoveryIntent({ intentId: intent!.intent.intentId,
      workerId: "stale-binding-worker", ports: unresolvedPorts(calls) })).toBeNull();
    expect(calls).toEqual([]);
    expect(recoveryStore.getCanonicalAnalysisRecoveryIntent(intent!.intent.intentId)).toMatchObject({
      state: "superseded", dispatchCount: 0,
    });
    expect(setup.store.getPersistedAnalysisRun(setup.run.runId)!.continuationExecutionGrants
      .filter((item) => item.disposition === "operationally_degraded_retry_eligible")).toEqual([]);
  }, 30_000);

  async function setupOneWorkItem() {
    const [{ parsePdf }, storeModule, runStore, executor, adaptive, loadedDb] = await Promise.all([
      import("../../../../src/parser.js"), import("../../../../src/store.js"),
      import("../../../../src/canonical/v2/runtime/analysisRunStore.js"),
      import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js"),
      import("../../../../src/canonical/v2/runtime/adaptiveExecution.js"), import("../../../../src/db.js"),
    ]);
    dbModule = loadedDb;
    const document = await parsePdf(fixture);
    const job = storeModule.createJob({ fileName: "statement.pdf", filePath: fixture, fileType: "pdf", businessType: "retail" });
    const run = runStore.executeDurableCanonicalAnalysisRun({ jobId: job.id, document });
    const persisted = runStore.getPersistedAnalysisRun(run.runId)!;
    const target = persisted.rgWorkItems.find((item) => {
      const admission = persisted.rgClaimAdmissions.find((claim) => claim.atomicClaimId === item.atomicClaimId)!;
      const labels = persisted.result!.artifacts.rb!.sourceModel.occurrences
        .filter((occurrence) => admission.occurrenceRefs.includes(occurrence.id)).map((occurrence) => occurrence.sourceLabel);
      return item.requiredSourceAuthorities.includes("processor_publication")
        && typeof (item.knowledgeQuery.scope.processor ?? item.knowledgeQuery.scope.processorProgram) === "string"
        && labels.some((label) => /^[A-Za-z][A-Za-z ]{2,80}$/.test(label));
    });
    if (!target) throw new Error("adaptive_test_requires_processor_work");
    for (const item of persisted.rgWorkItems) if (item.workItemId !== target.workItemId) {
      loadedDb.db.prepare(`DELETE FROM canonical_rg_work_items WHERE run_id = ? AND work_item_id = ?`).run(run.runId, item.workItemId);
    }
    for (const admission of persisted.rgClaimAdmissions) if (admission.atomicClaimId !== target.atomicClaimId) {
      loadedDb.db.prepare(`DELETE FROM canonical_rg_claim_admissions WHERE run_id = ? AND atomic_claim_id = ?`)
        .run(run.runId, admission.atomicClaimId);
    }
    return { run, persisted: runStore.getPersistedAnalysisRun(run.runId)!, store: runStore,
      executor, adaptive, db: loadedDb, document, job };
  }

  async function setupReadyRefinement() {
    const setup = await setupOneWorkItem();
    const observations = { calls: [] as string[], maximumExcludedFingerprintsObserved: 0,
      targetAtomicClaimId: setup.persisted.rgWorkItems[0]!.atomicClaimId };
    const ports = adaptivePorts(observations, true);
    await setup.executor.executeDurableCanonicalRgEvidence({ runId: setup.run.runId, ports });
    const controller = await import("../../../../src/canonical/v2/runtime/adaptiveContinuation.js");
    const state = controller.adjudicateDurableCanonicalContinuation({ runId: setup.run.runId });
    expect(state.lifecycle).toBe("continuation_ready_provider_execution_authorized");
    return setup;
  }
});

function adaptivePorts(observations: { calls: string[]; maximumExcludedFingerprintsObserved: number; targetAtomicClaimId: string },
  initialOnly = false, multiPass = false): CanonicalRgEvidenceExecutionPorts {
  return {
    availability: "available", unavailabilityReasonCodes: [],
    async search({ intent }, onSend) {
      const isTarget = intent.atomicClaimId === observations.targetAtomicClaimId;
      if (!isTarget) { observations.calls.push("adjacent-search-unresolved"); onSend(); return { value: [], receipt: receipt("search") }; }
      const continuation = intent.continuation !== null;
      observations.calls.push(continuation ? "target-continuation-search" : "target-initial-search"); onSend();
      if (initialOnly && continuation) return { value: [], receipt: receipt("search") };
      const wrong = candidate(intent.intentId, "wrong-period");
      if (multiPass && intent.continuation?.kind === "period_refinement") {
        return { value: [candidate(intent.intentId, "wrong-scope")], receipt: receipt("search") };
      }
      if (multiPass && intent.continuation?.kind === "scope_refinement") {
        return { value: [candidate(intent.intentId, "applicable-period")], receipt: receipt("search") };
      }
      return { value: continuation ? [wrong, candidate(intent.intentId, "applicable-period")] : [wrong], receipt: receipt("search") };
    },
    async retrieve({ intent, candidate }, onSend) {
      observations.calls.push(`retrieve-${candidate.title}`); onSend();
      const fingerprint = createHash("sha256").update(candidate.url).digest("hex");
      observations.maximumExcludedFingerprintsObserved = Math.max(observations.maximumExcludedFingerprintsObserved,
        intent.continuation?.excludedDocumentFingerprints.length ?? 0);
      return { value: document(candidate, fingerprint), receipt: { ...receipt("retrieve"), retrievalBytes: 512 } };
    },
    async investigate(input, onSend) {
      observations.calls.push(`investigate-${input.candidate.title}`); onSend();
      return { value: investigation(input, input.candidate.title === "wrong-period" ? "2099-01-01" : null), receipt: receipt("investigate") };
    },
    async verify(input, onSend) {
      observations.calls.push(`verify-${input.candidate.title}`); onSend();
      const wrong = input.candidate.title === "wrong-period";
      const locator = input.document.locators[0]!.locatorId;
      return { value: { frozenCandidateHash: input.frozenCandidate.frozenCandidateHash,
        sourceAuthorityStatus: "verified", semanticSupportStatus: "supported", exactAtomicClaimSupport: true,
        publisherIdentityCode: input.frozenCandidate.publisherIdentityCode, authorityLocatorId: locator,
        supportLocatorId: locator, scopeStatus: input.candidate.title === "wrong-scope" ? "wrong_scope" : "applicable",
        periodStatus: wrong ? "wrong_period" : "applicable",
        effectiveFrom: input.frozenCandidate.effectiveFrom, effectiveTo: input.frozenCandidate.effectiveTo,
        limitationCodes: [] } as CanonicalRgVerificationJudgment, receipt: receipt("verify") };
    },
  };
}

function unresolvedPorts(calls: string[], beforeReturn?: () => Promise<void>): CanonicalRgEvidenceExecutionPorts {
  const unavailable = async (): Promise<never> => { throw new Error("unexpected_provider_stage"); };
  return { availability: "available", unavailabilityReasonCodes: [],
    async search(_input, onSend) { calls.push("continuation-search"); onSend(); await beforeReturn?.(); return { value: [], receipt: receipt("search") }; },
    retrieve: unavailable, investigate: unavailable, verify: unavailable };
}

function candidate(intentId: string, title: string): CanonicalRgDiscoveryCandidate {
  return { candidateId: `candidate-${title}-${intentId}`, url: `https://merchants.fiserv.com/${title}`,
    title, claimedAuthority: "processor_publication", publicationDate: "2024-01-01",
    effectiveFrom: null, effectiveTo: null };
}

function document(candidateValue: CanonicalRgDiscoveryCandidate, fingerprint: string): CanonicalRgRetrievedDocument {
  return { candidateId: candidateValue.candidateId, requestedUrl: candidateValue.url, finalUrl: candidateValue.url,
    sourceOrigin: new URL(candidateValue.url).origin, documentId: `document-${fingerprint.slice(0, 24)}`,
    documentFingerprint: fingerprint, mimeType: "text/html", byteLength: 512, independentlyRetrieved: true,
    locators: [{ locatorId: `locator-${fingerprint.slice(0, 24)}`, page: null, sectionCode: "support",
      lineStart: 1, lineEnd: 2, textExcerpt: "Official Fiserv exact claim support." }] };
}

function investigation(input: Parameters<CanonicalRgEvidenceExecutionPorts["investigate"]>[0],
  effectiveFrom: string | null): CanonicalRgInvestigatedCandidate {
  const constraint = input.expectedValueConstraint;
  const proposedValue = constraint.kind === "mapping"
    ? { kind: "mapping" as const, canonicalCode: "other_source_grounded_fee", sourceCode: constraint.sourceCode }
    : constraint.kind === "role"
      ? { kind: "role" as const, participantRole: "processor_platform" as const,
        controlDimension: constraint.controlDimension, state: "proven" as const }
      : { kind: "boolean" as const, value: true };
  const publisher = input.intent.publicScope.processor ?? input.intent.publicScope.processorProgram;
  if (!publisher) throw new Error("adaptive_test_publisher_missing");
  return { investigationId: `investigation-${input.candidate.candidateId}`, candidateId: input.candidate.candidateId,
    documentId: input.document.documentId, documentFingerprint: input.document.documentFingerprint,
    locatorId: input.document.locators[0]!.locatorId, proposedValue,
    sourceAuthorityCandidate: "processor_publication", publisherIdentityCode: publisher,
    publicationTitle: input.candidate.title, publicationVersion: "v1", effectiveFrom, effectiveTo: null,
    limitationCodes: [], financialMutationAllowed: false };
}

function receipt(providerCode: string) {
  return { providerCode, providerRequestId: null, calls: 1, retrievalBytes: 0, tokens: 1 };
}

function operationalPolicy(maximumCumulativeProviderCalls: number) {
  return { authority: "deployment_emergency_circuit_breaker_only" as const,
    analyticalCompletionAuthority: "none" as const, maximumCumulativeProviderCalls,
    maximumCumulativeRetrievalBytes: 100_000_000, maximumCumulativeElapsedMs: 60_000_000,
    maximumConcurrentWork: 1 as const };
}
