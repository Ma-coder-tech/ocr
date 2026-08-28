import { createHash, randomUUID } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import { adjudicateDurableCanonicalContinuation } from "./adaptiveContinuation.js";
import type { CanonicalClaimContinuationDecision } from "./adaptiveContinuationTypes.js";
import {
  ADAPTIVE_EXECUTION_SCHEMA_VERSION,
  canonicalAutonomousCompletionForLifecycle,
  type CanonicalAdaptiveExecutionResult,
  type CanonicalAdaptiveOperationalPolicy,
  type CanonicalContinuationExecutionGrant,
} from "./adaptiveExecutionTypes.js";
import { executeDurableCanonicalRgEvidence, type CanonicalRgEvidenceExecutionPorts } from "./rgEvidenceExecution.js";
import { canonicalRgWorkContractFingerprint, type CanonicalRgWorkItem } from "./rgWorkLedger.js";
import {
  assertClaimedCanonicalAnalysisRecoveryIntent,
  ensureCanonicalAnalysisRecoveryIntent,
} from "./adaptiveRecoveryStore.js";
import {
  getPersistedAnalysisRun,
  persistInterruptedCanonicalAutonomousOutcomeCheckpoint,
  persistSettledCanonicalAutonomousOutcomeCheckpoint,
} from "./analysisRunStore.js";
import { convergeDurableCanonicalAnalysisRun } from "./semanticConvergence.js";

const CYCLE_LEASE_MS = 10 * 60_000;
const CYCLE_HEARTBEAT_MS = 60_000;

export function productionAdaptiveOperationalPolicy(): CanonicalAdaptiveOperationalPolicy {
  return {
    authority: "deployment_emergency_circuit_breaker_only",
    analyticalCompletionAuthority: "none",
    maximumCumulativeProviderCalls: positiveOperationalInteger("RG_ADAPTIVE_MAX_PROVIDER_CALLS", 96),
    maximumCumulativeRetrievalBytes: positiveOperationalInteger("RG_ADAPTIVE_MAX_RETRIEVAL_BYTES", 52_428_800),
    maximumCumulativeElapsedMs: positiveOperationalInteger("RG_ADAPTIVE_MAX_ELAPSED_MS", 2_700_000),
    maximumConcurrentWork: 1,
  };
}

export async function executeDurableCanonicalAdaptiveLoop(input: {
  runId: string;
  ports: CanonicalRgEvidenceExecutionPorts;
  workerId?: string;
  operationalPolicy?: CanonicalAdaptiveOperationalPolicy;
  recoveryIntentId?: string;
}): Promise<CanonicalAdaptiveExecutionResult> {
  const workerId = input.workerId ?? `adaptive-worker-${randomUUID()}`;
  const policy = input.operationalPolicy ?? productionAdaptiveOperationalPolicy();
  validateOperationalPolicy(policy);
  acquireCycleLease(input.runId, workerId);
  let leaseFailure: Error | null = null;
  const heartbeat = setInterval(() => {
    try { renewCycleLease(input.runId, workerId); }
    catch (error) { leaseFailure = error instanceof Error ? error : new Error("adaptive_execution_cycle_lease_lost"); }
  }, CYCLE_HEARTBEAT_MS);
  heartbeat.unref();
  const before = getPersistedAnalysisRun(input.runId);
  if (!before?.result) {
    clearInterval(heartbeat);
    releaseCycleLease(input.runId, workerId);
    throw new Error("adaptive_execution_analysis_run_unavailable");
  }
  if (!input.recoveryIntentId && hasCurrentOperationalRecoveryGrant(before)) {
    clearInterval(heartbeat);
    releaseCycleLease(input.runId, workerId);
    throw new Error("adaptive_execution_claimed_recovery_intent_required");
  }
  const financialFoundationHashBefore = before.financialFoundationHash;
  const executedGrantIds: string[] = [];
  let recovery: ReturnType<typeof assertClaimedCanonicalAnalysisRecoveryIntent> | null = null;
  let recoveryGrantExecuted = false;
  try {
    recovery = input.recoveryIntentId
      ? assertClaimedCanonicalAnalysisRecoveryIntent(input.recoveryIntentId, workerId)
      : null;
    if (recovery && recovery.intent.runId !== input.runId) throw new Error("adaptive_execution_recovery_run_mismatch");
    let persisted = before;
    if (persisted.continuationRevision === 0) {
      assertHeartbeatHealthy(leaseFailure);
      renewCycleLease(input.runId, workerId);
      await executeDurableCanonicalRgEvidence({ runId: input.runId, ports: input.ports,
        workerId, cycleOwnerId: workerId });
      persisted = getPersistedAnalysisRun(input.runId)!;
      adjudicateDurableCanonicalContinuation({ runId: input.runId,
        expectedSemanticRevision: persisted.semanticRevision, expectedSemanticHash: persisted.semanticHash,
        expectedPlanHash: persisted.result!.artifacts.rgWorkLedger?.planHash ?? null,
        expectedPlanGeneration: persisted.rgPlanGeneration });
    }

    for (;;) {
      assertHeartbeatHealthy(leaseFailure);
      renewCycleLease(input.runId, workerId);
      persisted = getPersistedAnalysisRun(input.runId)!;
      let state = persisted.continuationRevisions.at(-1)
        ?? adjudicateDurableCanonicalContinuation({ runId: input.runId });
      if (state.lifecycle === "convergence_required") {
        convergeDurableCanonicalAnalysisRun({ runId: input.runId, cycleOwnerId: workerId });
        const converged = getPersistedAnalysisRun(input.runId)!;
        state = adjudicateDurableCanonicalContinuation({ runId: input.runId,
          expectedSemanticRevision: converged.semanticRevision, expectedSemanticHash: converged.semanticHash,
          expectedPlanHash: converged.result!.artifacts.rgWorkLedger?.planHash ?? null,
          expectedPlanGeneration: converged.rgPlanGeneration });
      }
      if (recoveryGrantExecuted) break;
      if (state.lifecycle === "indeterminate_reconciliation_required") break;
      const recoveryDecisionId = recovery?.intent.authorization.decisionId ?? null;
      const recoveryDecisionAvailable = recoveryDecisionId !== null && state.decisions.some((item) =>
        item.decisionId === recoveryDecisionId && item.disposition === "operationally_degraded_retry_eligible");
      if (recovery && !recoveryDecisionAvailable) throw new Error("adaptive_execution_recovery_decision_stale");
      if (!recoveryDecisionAvailable && state.continuationReadyAtomicClaimIds.length === 0) break;
      const grant = authorizeNextDurableCanonicalContinuationExecution({ runId: input.runId,
        controllerRevision: state.controllerRevision, continuationStateHash: state.stateHash,
        operationalPolicy: policy, cycleOwnerId: workerId,
        recoveryIntentId: recovery?.intent.intentId, recoveryDecisionId: recoveryDecisionId ?? undefined });
      renewCycleLease(input.runId, workerId);
      await executeDurableCanonicalRgEvidence({ runId: input.runId, ports: input.ports, workerId,
        cycleOwnerId: workerId, executionGrantId: grant.grantId });
      assertHeartbeatHealthy(leaseFailure);
      executedGrantIds.push(grant.grantId);
      if (grant.disposition === "operationally_degraded_retry_eligible") recoveryGrantExecuted = true;
      const executed = getPersistedAnalysisRun(input.runId)!;
      adjudicateDurableCanonicalContinuation({ runId: input.runId,
        expectedSemanticRevision: executed.semanticRevision, expectedSemanticHash: executed.semanticHash,
        expectedPlanHash: executed.result!.artifacts.rgWorkLedger?.planHash ?? null,
        expectedPlanGeneration: executed.rgPlanGeneration });
    }

    const after = getPersistedAnalysisRun(input.runId)!;
    const finalState = after.continuationRevisions.at(-1)!;
    if (after.financialFoundationHash !== financialFoundationHashBefore) {
      throw new Error("adaptive_execution_financial_foundation_mutation");
    }
    const outcomeCheckpoint = persistSettledCanonicalAutonomousOutcomeCheckpoint({
      runId: input.runId,
      financialFoundationHashAtCycleStart: financialFoundationHashBefore,
    });
    if (!recovery) {
      try { ensureCanonicalAnalysisRecoveryIntent(input.runId); }
      catch (error) {
        console.error("[canonical-recovery-intent-degraded]", error instanceof Error ? error.message : error);
      }
    }
    return {
      schemaVersion: ADAPTIVE_EXECUTION_SCHEMA_VERSION,
      runId: input.runId,
      lifecycle: finalState.lifecycle,
      controllerRevision: finalState.controllerRevision,
      executionGeneration: after.rgExecutionGeneration,
      executedGrantIds,
      providerCallsObserved: finalState.cumulativeResource.providerCalls,
      semanticRevision: after.semanticRevision,
      financialFoundationHashBefore,
      financialFoundationHashAfter: after.financialFoundationHash,
      financialFoundationPreserved: true,
      customerReportAuthority: "legacy_report_unchanged",
      completion: canonicalAutonomousCompletionForLifecycle(finalState.lifecycle),
      outcomeCheckpointRevision: outcomeCheckpoint.checkpointRevision,
      outcomeCheckpointHash: outcomeCheckpoint.checkpointHash,
    };
  } catch (error) {
    try {
      persistInterruptedCanonicalAutonomousOutcomeCheckpoint({
        runId: input.runId,
        financialFoundationHashAtCycleStart: financialFoundationHashBefore,
      });
    } catch {
      // Preserve the original adaptive failure; a missing checkpoint remains fail-closed on read.
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
    releaseCycleLease(input.runId, workerId);
  }
}

export function authorizeNextDurableCanonicalContinuationExecution(input: {
  runId: string;
  controllerRevision: number;
  continuationStateHash: string;
  operationalPolicy: CanonicalAdaptiveOperationalPolicy;
  cycleOwnerId: string;
  recoveryIntentId?: string;
  recoveryDecisionId?: string;
}): CanonicalContinuationExecutionGrant {
  validateOperationalPolicy(input.operationalPolicy);
  assertCycleLease(input.runId, input.cycleOwnerId);
  const persisted = getPersistedAnalysisRun(input.runId);
  if (!persisted?.result) throw new Error("adaptive_execution_analysis_run_unavailable");
  const state = persisted.continuationRevisions.find((item) => item.controllerRevision === input.controllerRevision);
  if (!state || state.stateHash !== input.continuationStateHash || state.controllerRevision !== persisted.continuationRevision) {
    throw new Error("adaptive_execution_stale_continuation_binding");
  }
  if (state.lifecycle === "indeterminate_reconciliation_required") {
    throw new Error("adaptive_execution_indeterminate_reconciliation_required");
  }
  const recovery = input.recoveryIntentId
    ? assertClaimedCanonicalAnalysisRecoveryIntent(input.recoveryIntentId, input.cycleOwnerId)
    : null;
  if ((input.recoveryIntentId === undefined) !== (input.recoveryDecisionId === undefined)
    || (recovery && (recovery.intent.runId !== input.runId
      || recovery.intent.authorization.decisionId !== input.recoveryDecisionId))) {
    throw new Error("adaptive_execution_recovery_authorization_invalid");
  }
  const decision = nextAuthorizedDecision(state.decisions, input.recoveryDecisionId ?? null);
  const normalContinuation = decision && state.continuationReadyAtomicClaimIds.includes(decision.atomicClaimId)
    && (decision.disposition === "newly_eligible" || decision.disposition === "justified_refinement");
  const recoveryContinuation = decision?.disposition === "operationally_degraded_retry_eligible"
    && recovery?.intent.authorization.atomicClaimId === decision.atomicClaimId
    && decision.degradation?.continuationPermission === "bounded_retry_eligible";
  if (!decision || (!normalContinuation && !recoveryContinuation)) {
    throw new Error("adaptive_execution_no_continuation_authorized_work");
  }
  const existing = persisted.continuationExecutionGrants.find((item) => item.controllerRevision === state.controllerRevision
    && item.decisionId === decision.decisionId);
  if (existing) return existing;
  const admission = persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === decision.atomicClaimId);
  const currentWork = persisted.rgWorkItems.find((item) => item.atomicClaimId === decision.atomicClaimId);
  if (!admission || !currentWork || currentWork.workItemId !== decision.currentWorkItemId) {
    throw new Error("adaptive_execution_exact_work_binding_unavailable");
  }
  const currentFingerprint = canonicalRgWorkContractFingerprint(admission, normalizedWork(currentWork));
  if (currentFingerprint !== decision.currentWorkContractFingerprint) {
    throw new Error("adaptive_execution_work_contract_binding_mismatch");
  }
  const effective = materializeEffectiveWork(currentWork, decision);
  const effectiveFingerprint = canonicalRgWorkContractFingerprint(admission, effective);
  if (decision.nextOperationDelta && effectiveFingerprint !== decision.nextOperationDelta.nextWorkContractFingerprint) {
    throw new Error("adaptive_execution_delta_materialization_mismatch");
  }
  const executionGeneration = persisted.rgExecutionGeneration + 1;
  const createdAt = nowIso();
  const grantBase = {
    runId: persisted.id, executionGeneration, controllerRevision: state.controllerRevision,
    continuationStateHash: state.stateHash, decisionId: decision.decisionId,
    disposition: decision.disposition as CanonicalContinuationExecutionGrant["disposition"],
    atomicClaimId: decision.atomicClaimId, facet: decision.facet,
    binding: { semanticRevision: state.binding.semanticRevision, semanticHash: state.binding.semanticHash,
      canonicalStateHash: state.binding.canonicalStateHash, planHash: state.binding.planHash!,
      planGeneration: state.binding.planGeneration, rfSnapshotHash: state.binding.rfSnapshotHash },
    baseWorkItemId: currentWork.workItemId, priorWorkContractFingerprint: currentFingerprint,
    effectiveWorkContractFingerprint: effectiveFingerprint,
    excludedDocumentFingerprints: decision.nextOperationDelta?.excludedDocumentFingerprints ?? [],
    resourceBaseline: state.cumulativeResource, operationalPolicy: input.operationalPolicy,
    providerExecution: decision.disposition === "operationally_degraded_retry_eligible"
      ? "authorized_exact_claim_operational_retry" as const : "authorized_exact_claim_delta" as const,
    analyticalCompletionEffect: "none" as const,
    createdAt,
  };
  const grantId = `continuation-grant-${digest(grantBase).slice(0, 32)}`;
  const authorizedWork: CanonicalRgWorkItem = { ...effective,
    executionAuthorization: { grantId, executionGeneration, controllerRevision: state.controllerRevision,
      decisionId: decision.decisionId, effectiveWorkContractFingerprint: effectiveFingerprint } };
  const grant: CanonicalContinuationExecutionGrant = {
    schemaVersion: ADAPTIVE_EXECUTION_SCHEMA_VERSION, grantId, ...grantBase, effectiveWorkItem: authorizedWork,
  };
  const transaction = db.transaction(() => {
    assertCycleLease(input.runId, input.cycleOwnerId);
    const row = db.prepare(`SELECT semantic_revision, semantic_hash, canonical_state_hash, rg_plan_hash,
      rg_plan_generation, rg_execution_generation, continuation_revision, continuation_state_hash, rf_snapshot_hash
      FROM canonical_analysis_runs WHERE id = ?`).get(input.runId) as Record<string, unknown> | undefined;
    if (!row || Number(row.semantic_revision) !== grant.binding.semanticRevision
      || nullable(row.semantic_hash) !== grant.binding.semanticHash
      || nullable(row.canonical_state_hash) !== grant.binding.canonicalStateHash
      || nullable(row.rg_plan_hash) !== grant.binding.planHash
      || Number(row.rg_plan_generation) !== grant.binding.planGeneration
      || Number(row.rg_execution_generation) !== executionGeneration - 1
      || Number(row.continuation_revision) !== grant.controllerRevision
      || nullable(row.continuation_state_hash) !== grant.continuationStateHash
      || String(row.rf_snapshot_hash) !== grant.binding.rfSnapshotHash) {
      throw new Error("adaptive_execution_concurrent_or_stale_binding");
    }
    const workRow = db.prepare(`SELECT work_item_json, plan_hash FROM canonical_rg_work_items
      WHERE run_id = ? AND work_item_id = ?`).get(input.runId, currentWork.workItemId) as
      { work_item_json: string; plan_hash: string } | undefined;
    if (!workRow || workRow.plan_hash !== grant.binding.planHash || workRow.work_item_json !== JSON.stringify(currentWork)) {
      throw new Error("adaptive_execution_concurrent_work_conflict");
    }
    db.prepare(`INSERT INTO canonical_analysis_continuation_execution_grants
      (run_id, execution_generation, grant_id, controller_revision, decision_id, atomic_claim_id,
       semantic_revision, plan_hash, plan_generation, work_contract_fingerprint, grant_json, grant_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.runId, executionGeneration, grantId,
      grant.controllerRevision, grant.decisionId, grant.atomicClaimId, grant.binding.semanticRevision,
      grant.binding.planHash, grant.binding.planGeneration, grant.effectiveWorkContractFingerprint,
      JSON.stringify(grant), digest(grant), createdAt);
    const updated = db.prepare(`UPDATE canonical_rg_work_items SET state = ?, execution_state = ?, work_item_json = ?, updated_at = ?
      WHERE run_id = ? AND work_item_id = ? AND plan_hash = ? AND work_item_json = ?`).run(authorizedWork.state,
      authorizedWork.executionState, JSON.stringify(authorizedWork), createdAt, input.runId, authorizedWork.workItemId,
      grant.binding.planHash, JSON.stringify(currentWork));
    if (updated.changes !== 1) throw new Error("adaptive_execution_concurrent_work_conflict");
    db.prepare(`UPDATE canonical_analysis_runs SET rg_execution_generation = ?, updated_at = ?
      WHERE id = ? AND rg_execution_generation = ?`).run(executionGeneration, createdAt, input.runId,
      executionGeneration - 1);
    appendExecutionEvent(input.runId, authorizedWork.workItemId, "continuation_execution_authorized", {
      grantId, executionGeneration, controllerRevision: grant.controllerRevision, decisionId: grant.decisionId,
      atomicClaimId: grant.atomicClaimId, effectiveWorkContractFingerprint: grant.effectiveWorkContractFingerprint,
      analyticalCompletionEffect: "none",
    });
  });
  transaction();
  return grant;
}

function materializeEffectiveWork(work: CanonicalRgWorkItem,
  decision: CanonicalClaimContinuationDecision): CanonicalRgWorkItem {
  const base = normalizedWork(work);
  if (decision.disposition === "newly_eligible") {
    if (decision.nextOperationDelta) throw new Error("adaptive_execution_new_work_has_unexpected_delta");
    return { ...structuredClone(base), state: "planned", executionState: "planned_for_durable_execution",
      reservation: null, progress: { ...base.progress, state: "not_started" }, stopReason: null,
      executionAuthorization: null };
  }
  if (decision.disposition === "operationally_degraded_retry_eligible") {
    if (decision.nextOperationDelta || decision.degradation?.continuationPermission !== "bounded_retry_eligible") {
      throw new Error("adaptive_execution_invalid_operational_retry");
    }
    return { ...structuredClone(base), state: "planned", executionState: "planned_for_durable_execution",
      reservation: null, progress: { ...base.progress, state: "not_started" }, stopReason: null,
      executionAuthorization: null };
  }
  const delta = decision.nextOperationDelta;
  if (decision.disposition !== "justified_refinement" || !delta
    || delta.priorWorkContractFingerprint !== decision.currentWorkContractFingerprint) {
    throw new Error("adaptive_execution_invalid_refinement_delta");
  }
  return { ...structuredClone(base), state: "planned", executionState: "planned_for_durable_execution",
    evidenceObjective: delta.nextEvidenceObjective, reservation: null,
    progress: { ...base.progress, state: "not_started" }, stopReason: null, executionAuthorization: null,
    continuationContract: { kind: delta.kind, requiredGap: delta.requiredGap,
      priorWorkContractFingerprint: delta.priorWorkContractFingerprint,
      excludedDocumentFingerprints: [...new Set(delta.excludedDocumentFingerprints)].sort() } };
}

function normalizedWork(work: CanonicalRgWorkItem): CanonicalRgWorkItem {
  return { ...work, continuationContract: work.continuationContract ?? null,
    executionAuthorization: work.executionAuthorization ?? null };
}

function nextAuthorizedDecision(decisions: CanonicalClaimContinuationDecision[], recoveryDecisionId: string | null): CanonicalClaimContinuationDecision | null {
  if (recoveryDecisionId) {
    return decisions.find((item) => item.decisionId === recoveryDecisionId
      && item.disposition === "operationally_degraded_retry_eligible") ?? null;
  }
  return decisions.filter((item) => item.disposition === "newly_eligible" || item.disposition === "justified_refinement")
    .sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId))[0] ?? null;
}

function hasCurrentOperationalRecoveryGrant(persisted: NonNullable<ReturnType<typeof getPersistedAnalysisRun>>): boolean {
  const state = persisted.continuationRevisions.at(-1);
  if (!state) return false;
  return persisted.continuationExecutionGrants.some((grant) =>
    grant.disposition === "operationally_degraded_retry_eligible"
    && grant.controllerRevision === state.controllerRevision
    && grant.continuationStateHash === state.stateHash
    && grant.executionGeneration === persisted.rgExecutionGeneration
    && state.decisions.some((decision) => decision.decisionId === grant.decisionId
      && decision.atomicClaimId === grant.atomicClaimId
      && decision.disposition === "operationally_degraded_retry_eligible"));
}

function acquireCycleLease(runId: string, workerId: string): void {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CYCLE_LEASE_MS).toISOString();
  const updated = db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_owner = ?,
    adaptive_cycle_lease_expires_at = ?, updated_at = ? WHERE id = ? AND
    (adaptive_cycle_owner IS NULL OR adaptive_cycle_lease_expires_at IS NULL OR adaptive_cycle_lease_expires_at <= ?
      OR adaptive_cycle_owner = ?)`).run(workerId, expiresAt, now.toISOString(), runId, now.toISOString(), workerId);
  if (updated.changes !== 1) throw new Error("adaptive_execution_cycle_lease_unavailable");
}

function renewCycleLease(runId: string, workerId: string): void {
  const now = new Date();
  const updated = db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_lease_expires_at = ?, updated_at = ?
    WHERE id = ? AND adaptive_cycle_owner = ? AND adaptive_cycle_lease_expires_at > ?`).run(
    new Date(now.getTime() + CYCLE_LEASE_MS).toISOString(), now.toISOString(), runId, workerId, now.toISOString());
  if (updated.changes !== 1) throw new Error("adaptive_execution_cycle_lease_lost");
}

function assertCycleLease(runId: string, workerId: string): void {
  const row = db.prepare(`SELECT adaptive_cycle_owner, adaptive_cycle_lease_expires_at FROM canonical_analysis_runs WHERE id = ?`)
    .get(runId) as { adaptive_cycle_owner: string | null; adaptive_cycle_lease_expires_at: string | null } | undefined;
  if (!row || row.adaptive_cycle_owner !== workerId || !row.adaptive_cycle_lease_expires_at
    || row.adaptive_cycle_lease_expires_at <= new Date().toISOString()) throw new Error("adaptive_execution_cycle_lease_invalid");
}

function releaseCycleLease(runId: string, workerId: string): void {
  db.prepare(`UPDATE canonical_analysis_runs SET adaptive_cycle_owner = NULL, adaptive_cycle_lease_expires_at = NULL,
    updated_at = ? WHERE id = ? AND adaptive_cycle_owner = ?`).run(nowIso(), runId, workerId);
}

function validateOperationalPolicy(policy: CanonicalAdaptiveOperationalPolicy): void {
  if (policy.authority !== "deployment_emergency_circuit_breaker_only"
    || policy.analyticalCompletionAuthority !== "none" || policy.maximumConcurrentWork !== 1
    || ![policy.maximumCumulativeProviderCalls, policy.maximumCumulativeRetrievalBytes,
      policy.maximumCumulativeElapsedMs].every((item) => Number.isSafeInteger(item) && item > 0)) {
    throw new Error("adaptive_execution_operational_policy_invalid");
  }
}

function assertHeartbeatHealthy(failure: Error | null): void {
  if (failure) throw failure;
}

function positiveOperationalInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function appendExecutionEvent(runId: string, workItemId: string, eventType: string, event: unknown): void {
  const eventJson = JSON.stringify(event);
  db.prepare(`INSERT INTO canonical_rg_execution_events
    (event_id, run_id, work_item_id, operation_id, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`).run(`rg-event-${randomUUID()}`, runId, workItemId, eventType,
    eventJson, digest(event), nowIso());
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function nullable(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
