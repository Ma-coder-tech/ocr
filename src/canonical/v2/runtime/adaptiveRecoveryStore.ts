import { createHash, randomUUID } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import { getPersistedAnalysisRun } from "./analysisRunStore.js";
import {
  ADAPTIVE_RECOVERY_SCHEMA_VERSION,
  type CanonicalAnalysisRecoveryEvent,
  type CanonicalAnalysisRecoveryIntent,
  type CanonicalAnalysisRecoveryIntentState,
  type CanonicalAnalysisRecoveryRecord,
  type CanonicalAnalysisRecoveryWaitGate,
} from "./adaptiveRecoveryTypes.js";

const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 2 * 60_000;
const DEFAULT_LEASE_MS = 10 * 60_000;

export function ensureCanonicalAnalysisRecoveryIntent(runId: string): CanonicalAnalysisRecoveryRecord | null {
  supersedeStaleRecoveryIntents(runId);
  const persisted = getPersistedAnalysisRun(runId);
  const outcome = persisted?.autonomousOutcome;
  if (!persisted || persisted.familyStatus !== "proven" || !outcome
    || persisted.autonomousOutcomeIntegrity.status !== "current"
    || outcome.checkpointKind !== "settled" || outcome.completion !== "stopped_operationally"
    || outcome.lifecycle !== "operational_degradation_blocks_judgment") return null;
  const state = persisted.continuationRevisions.at(-1);
  if (!state || state.controllerRevision !== outcome.binding.continuationRevision
    || state.stateHash !== outcome.binding.continuationStateHash
    || state.lifecycle === "indeterminate_reconciliation_required") return null;
  const decision = state.decisions.filter((item) => item.disposition === "operationally_degraded_retry_eligible"
    && item.degradation?.continuationPermission === "bounded_retry_eligible"
    && (["provider_unavailable_before_send", "provider_rejection", "before_send_failure_retry_eligible"].includes(item.degradation.subtype)
      || (item.degradation.subtype === "resource_or_runtime_exhaustion"
        && item.degradation.reasonCodes.some((reason) => (reason.startsWith("rg_generation_zero_emergency_")
          && reason.endsWith("_not_analytical_completion"))
          || /^(?:rg|rg_generation_zero)_operational_allowance_temporarily_unavailable_not_analytical_completion$/.test(reason)))))
    .sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId))[0];
  if (!decision || !state.binding.planHash || !persisted.autonomousOutcomeHash
    || !persisted.continuationStateHash) return null;
  const existing = db.prepare(`SELECT intent_id FROM canonical_analysis_recovery_intents
    WHERE run_id = ? AND outcome_revision = ? AND decision_id = ?`).get(runId,
    outcome.checkpointRevision, decision.decisionId) as { intent_id: string } | undefined;
  if (existing) return getCanonicalAnalysisRecoveryIntent(existing.intent_id);

  const createdAt = nowIso();
  const intentBase = {
    schemaVersion: ADAPTIVE_RECOVERY_SCHEMA_VERSION,
    intentId: `analysis-recovery-${digest({ runId, outcomeHash: outcome.checkpointHash,
      decisionId: decision.decisionId }).slice(0, 32)}`,
    runId,
    binding: {
      outcomeRevision: outcome.checkpointRevision,
      outcomeHash: outcome.checkpointHash,
      sourceFingerprint: persisted.sourceFingerprint,
      financialFoundationHash: persisted.financialFoundationHash,
      semanticRevision: persisted.semanticRevision,
      semanticHash: persisted.semanticHash,
      canonicalStateHash: persisted.canonicalStateHash,
      planHash: state.binding.planHash,
      planGeneration: state.binding.planGeneration,
      executionGeneration: persisted.rgExecutionGeneration,
      continuationRevision: state.controllerRevision,
      continuationStateHash: state.stateHash,
      rfSnapshotHash: persisted.rfSnapshotHash,
    },
    authorization: {
      decisionId: decision.decisionId,
      atomicClaimId: decision.atomicClaimId,
      facet: decision.facet,
      disposition: "operationally_degraded_retry_eligible" as const,
      continuationPermission: "bounded_retry_eligible" as const,
      degradationSubtype: decision.degradation!.subtype as
        "provider_unavailable_before_send" | "provider_rejection" | "before_send_failure_retry_eligible" | "resource_or_runtime_exhaustion",
    },
    analyticalCompletionEffect: "none" as const,
    customerReportAuthority: "legacy_report_unchanged" as const,
    createdAt,
  };
  const intent: CanonicalAnalysisRecoveryIntent = { ...intentBase, intentHash: digest(intentBase) };
  const delayMs = recoveryDelayMs(runId, decision.atomicClaimId);
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  const scheduled = recoveryEvent({ intentId: intent.intentId, eventSequence: 1, parentEventHash: null,
    eventType: "scheduled", fromState: null, toState: "scheduled", workerId: null,
    reasonCode: "current_outcome_contains_exact_retry_eligible_operational_state", occurredAt: createdAt });
  const transaction = db.transaction(() => {
    const current = getPersistedAnalysisRun(runId);
    if (!current || !recoveryIntentMatchesCurrent(intent, current)) {
      throw new Error("canonical_recovery_intent_stale_before_persistence");
    }
    db.prepare(`INSERT INTO canonical_analysis_recovery_intents
      (intent_id, run_id, outcome_revision, outcome_hash, controller_revision, decision_id, atomic_claim_id,
       state, next_run_at, lease_owner, lease_expires_at, dispatch_count, latest_event_sequence,
       latest_event_hash, intent_json, intent_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, NULL, NULL, 0, 1, ?, ?, ?, ?, ?)`)
      .run(intent.intentId, runId, intent.binding.outcomeRevision, intent.binding.outcomeHash,
        intent.binding.continuationRevision, intent.authorization.decisionId, intent.authorization.atomicClaimId,
        nextRunAt, scheduled.eventHash, JSON.stringify(intent), intent.intentHash, createdAt, createdAt);
    insertRecoveryEvent(scheduled);
  });
  try { transaction(); }
  catch (error) {
    const raced = db.prepare(`SELECT intent_id FROM canonical_analysis_recovery_intents
      WHERE run_id = ? AND outcome_revision = ? AND decision_id = ?`).get(runId,
      outcome.checkpointRevision, decision.decisionId) as { intent_id: string } | undefined;
    if (raced) return getCanonicalAnalysisRecoveryIntent(raced.intent_id);
    throw error;
  }
  return getCanonicalAnalysisRecoveryIntent(intent.intentId);
}

export function reconcileCanonicalAnalysisRecoveryIntents(): CanonicalAnalysisRecoveryRecord[] {
  const runIds = db.prepare(`SELECT id FROM canonical_analysis_runs
    WHERE autonomous_outcome_revision > 0 ORDER BY updated_at, id`).all() as Array<{ id: string }>;
  return runIds.map(({ id }) => ensureCanonicalAnalysisRecoveryIntent(id)).filter(isPresent);
}

export function getCanonicalAnalysisRecoveryIntent(intentId: string): CanonicalAnalysisRecoveryRecord | null {
  const row = db.prepare(`SELECT * FROM canonical_analysis_recovery_intents WHERE intent_id = ?`).get(intentId) as
    Record<string, unknown> | undefined;
  return row ? mapRecoveryRecord(row) : null;
}

export function listCanonicalAnalysisRecoveryIntents(runId: string): CanonicalAnalysisRecoveryRecord[] {
  const rows = db.prepare(`SELECT * FROM canonical_analysis_recovery_intents WHERE run_id = ?
    ORDER BY outcome_revision, created_at, intent_id`).all(runId) as Array<Record<string, unknown>>;
  return rows.map(mapRecoveryRecord);
}

export function waitCanonicalAnalysisRecoveryIntentForOperationalReset(
  intentId: string,
  reasonCode: string,
  waitGate?: CanonicalAnalysisRecoveryWaitGate,
): CanonicalAnalysisRecoveryRecord | null {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record) return null;
  if (!recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    supersedeRecoveryIntent(intentId, null, "recovery_binding_no_longer_current");
    return null;
  }
  if (!["scheduled", "waiting_for_operational_reset"].includes(record.state)) return null;
  if (record.state === "waiting_for_operational_reset"
    && canonicalJson(record.waitGate) === canonicalJson(waitGate ?? null)) return record;
  const fromState = record.state;
  const event = recoveryEvent({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType: "waiting_for_operational_reset",
    fromState, toState: "waiting_for_operational_reset", workerId: null,
    reasonCode, waitGate: waitGate ?? null, occurredAt: nowIso() });
  const nextRunAt = waitGate?.nextEligibleAt ?? record.nextRunAt;
  const transaction = db.transaction(() => {
    const updated = db.prepare(`UPDATE canonical_analysis_recovery_intents
      SET state = 'waiting_for_operational_reset', lease_owner = NULL, lease_expires_at = NULL,
          next_run_at = ?, latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = ?`)
      .run(nextRunAt, event.eventSequence, event.eventHash, event.occurredAt, intentId,
        record.latestEventSequence, fromState);
    if (updated.changes === 1) insertRecoveryEvent(event);
  });
  transaction();
  return getCanonicalAnalysisRecoveryIntent(intentId);
}

export function admitCanonicalAnalysisRecoveryIntentAfterOperationalReset(
  intentId: string,
): CanonicalAnalysisRecoveryRecord | null {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record) return null;
  if (!recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    supersedeRecoveryIntent(intentId, null, "recovery_binding_no_longer_current");
    return null;
  }
  if (record.state === "scheduled") return record;
  if (record.state !== "waiting_for_operational_reset") return null;
  const occurredAt = nowIso();
  const event = recoveryEvent({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType: "operational_reset_admitted",
    fromState: "waiting_for_operational_reset", toState: "scheduled", workerId: null,
    reasonCode: "current_operational_allowance_admits_useful_recovery", waitGate: null, occurredAt });
  const transaction = db.transaction(() => {
    const updated = db.prepare(`UPDATE canonical_analysis_recovery_intents
      SET state = 'scheduled', next_run_at = ?, lease_owner = NULL, lease_expires_at = NULL,
          latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = 'waiting_for_operational_reset'`)
      .run(occurredAt, event.eventSequence, event.eventHash, occurredAt, intentId, record.latestEventSequence);
    if (updated.changes === 1) insertRecoveryEvent(event);
  });
  transaction();
  return getCanonicalAnalysisRecoveryIntent(intentId);
}

export function listDueCanonicalAnalysisRecoveryIntents(): CanonicalAnalysisRecoveryRecord[] {
  const now = nowIso();
  const rows = db.prepare(`SELECT * FROM canonical_analysis_recovery_intents
    WHERE (state IN ('scheduled', 'waiting_for_operational_reset') AND next_run_at <= ?)
       OR (state = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
    ORDER BY next_run_at, created_at, intent_id`).all(now, now) as Array<Record<string, unknown>>;
  const due: CanonicalAnalysisRecoveryRecord[] = [];
  for (const row of rows) {
    const record = mapRecoveryRecord(row);
    if (record.state === "waiting_for_operational_reset"
      && (!record.waitGate?.nextEligibleAt || record.waitGate.kind === "provider_readiness_change"
        || record.waitGate.kind === "exceptional_runaway_hold")) continue;
    if (record.state === "leased" && record.leaseOwner
      && activeAdaptiveCycleLease(record.intent.runId, record.leaseOwner, now)) continue;
    if (recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) due.push(record);
    else supersedeRecoveryIntent(record.intent.intentId, null, "recovery_binding_no_longer_current");
  }
  return due;
}

export function getNextCanonicalAnalysisRecoveryDelayMs(): number | null {
  const rows = db.prepare(`SELECT * FROM canonical_analysis_recovery_intents
    WHERE state IN ('scheduled', 'waiting_for_operational_reset') OR (state = 'leased' AND lease_expires_at IS NOT NULL)
    ORDER BY created_at, intent_id`).all() as Array<Record<string, unknown>>;
  const wakeTimes = rows.map(mapRecoveryRecord).map((record) => {
    if (record.state === "scheduled") return Date.parse(record.nextRunAt);
    if (record.state === "waiting_for_operational_reset") {
      return record.waitGate?.nextEligibleAt ? Date.parse(record.waitGate.nextEligibleAt) : Number.POSITIVE_INFINITY;
    }
    const activeCycleExpiry = record.leaseOwner
      ? activeAdaptiveCycleLease(record.intent.runId, record.leaseOwner, nowIso()) : null;
    return Math.max(Date.parse(record.leaseExpiresAt!), activeCycleExpiry ? Date.parse(activeCycleExpiry) : 0);
  });
  const finiteWakeTimes = wakeTimes.filter(Number.isFinite);
  if (finiteWakeTimes.length === 0) return null;
  return Math.max(0, Math.min(...finiteWakeTimes) - Date.now());
}

export function claimCanonicalAnalysisRecoveryIntent(intentId: string, workerId: string): CanonicalAnalysisRecoveryRecord | null {
  const existing = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!existing || !recoveryIntentMatchesCurrent(existing.intent, getPersistedAnalysisRun(existing.intent.runId))) {
    if (existing) supersedeRecoveryIntent(intentId, workerId, "recovery_binding_no_longer_current");
    return null;
  }
  const now = new Date();
  if (existing.state === "scheduled" && Date.parse(existing.nextRunAt) > now.getTime()) return null;
  if (existing.state === "leased" && existing.leaseExpiresAt && Date.parse(existing.leaseExpiresAt) > now.getTime()) return null;
  if (existing.state === "leased" && existing.leaseOwner
    && activeAdaptiveCycleLease(existing.intent.runId, existing.leaseOwner, now.toISOString())) return null;
  if (!["scheduled", "leased"].includes(existing.state)) return null;
  const eventType = existing.state === "leased" ? "lease_recovered" : "leased";
  const leaseExpiresAt = new Date(now.getTime() + recoveryLeaseMs()).toISOString();
  const event = recoveryEvent({ intentId, eventSequence: existing.latestEventSequence + 1,
    parentEventHash: existing.latestEventHash, eventType, fromState: existing.state, toState: "leased",
    workerId, reasonCode: eventType === "lease_recovered" ? "expired_recovery_lease_reclaimed" : "due_recovery_claimed",
    occurredAt: now.toISOString() });
  const transaction = db.transaction(() => {
    const result = db.prepare(`UPDATE canonical_analysis_recovery_intents
      SET state = 'leased', lease_owner = ?, lease_expires_at = ?, dispatch_count = dispatch_count + 1,
          latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = ?
        AND (state = 'scheduled' OR lease_expires_at <= ?)`)
      .run(workerId, leaseExpiresAt, event.eventSequence, event.eventHash, event.occurredAt, intentId,
        existing.latestEventSequence, existing.state, event.occurredAt);
    if (result.changes !== 1) throw new Error("canonical_recovery_intent_concurrent_claim");
    insertRecoveryEvent(event);
  });
  try { transaction(); } catch (error) {
    if (error instanceof Error && error.message === "canonical_recovery_intent_concurrent_claim") return null;
    throw error;
  }
  return getCanonicalAnalysisRecoveryIntent(intentId);
}

export function settleCanonicalAnalysisRecoveryIntentAfterCycle(
  intentId: string,
  workerId: string,
): "completed" | "scheduled" {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId) {
    throw new Error("canonical_recovery_intent_lease_mismatch");
  }
  if (recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    const nextRunAt = new Date(Date.now() + recoveryDelayMs(record.intent.runId,
      record.intent.authorization.atomicClaimId)).toISOString();
    transitionLeasedRecoveryIntent(intentId, workerId, "rescheduled_retry_eligible", "scheduled",
      "exact_claim_remains_bounded_retry_eligible", nextRunAt);
    return "scheduled";
  }
  transitionLeasedRecoveryIntent(intentId, workerId, "completed", "completed",
    "recovery_cycle_produced_successor_outcome");
  return "completed";
}

export function renewCanonicalAnalysisRecoveryIntentLease(intentId: string, workerId: string): void {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId
    || !activeAdaptiveCycleLease(record.intent.runId, workerId, nowIso())) {
    throw new Error("canonical_recovery_intent_lease_renewal_invalid");
  }
  const occurredAt = nowIso();
  const leaseExpiresAt = new Date(Date.now() + recoveryLeaseMs()).toISOString();
  const event = recoveryEvent({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType: "lease_renewed", fromState: "leased", toState: "leased",
    workerId, reasonCode: "active_adaptive_cycle_recovery_lease_renewed", occurredAt });
  const transaction = db.transaction(() => {
    const updated = db.prepare(`UPDATE canonical_analysis_recovery_intents SET lease_expires_at = ?,
      latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = 'leased' AND lease_owner = ?`)
      .run(leaseExpiresAt, event.eventSequence, event.eventHash, occurredAt, intentId,
        record.latestEventSequence, workerId);
    if (updated.changes !== 1) throw new Error("canonical_recovery_intent_concurrent_lease_renewal");
    insertRecoveryEvent(event);
  });
  transaction();
}

export function canonicalAnalysisRecoveryHeartbeatMs(): number {
  return Math.max(1, Math.min(60_000, Math.floor(recoveryLeaseMs() / 3)));
}

export function releaseCanonicalAnalysisRecoveryIntentAfterFailure(
  intentId: string,
  workerId: string,
  reasonCode: string,
): void {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId) return;
  if (!recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    transitionLeasedRecoveryIntent(intentId, workerId, "superseded", "superseded",
      "recovery_failure_left_binding_noncurrent");
    return;
  }
  const nextRunAt = new Date(Date.now() + recoveryDelayMs(record.intent.runId,
    record.intent.authorization.atomicClaimId)).toISOString();
  transitionLeasedRecoveryIntent(intentId, workerId, "released_after_failure", "scheduled", reasonCode, nextRunAt);
}

export function assertClaimedCanonicalAnalysisRecoveryIntent(
  intentId: string,
  workerId: string,
): CanonicalAnalysisRecoveryRecord {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId
    || !record.leaseExpiresAt || Date.parse(record.leaseExpiresAt) <= Date.now()) {
    throw new Error("canonical_recovery_claimed_intent_required");
  }
  if (!recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    throw new Error("canonical_recovery_intent_stale_binding");
  }
  return record;
}

function supersedeStaleRecoveryIntents(runId: string): void {
  const rows = db.prepare(`SELECT intent_id FROM canonical_analysis_recovery_intents
    WHERE run_id = ? AND state IN ('scheduled', 'waiting_for_operational_reset', 'leased') ORDER BY created_at`)
    .all(runId) as Array<{ intent_id: string }>;
  for (const row of rows) {
    const record = getCanonicalAnalysisRecoveryIntent(row.intent_id);
    if (record && !recoveryIntentMatchesCurrent(record.intent, getPersistedAnalysisRun(runId))) {
      supersedeRecoveryIntent(row.intent_id, null, "newer_or_changed_authoritative_outcome");
    }
  }
}

function supersedeRecoveryIntent(intentId: string, workerId: string | null, reasonCode: string): void {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record || ["completed", "superseded"].includes(record.state)) return;
  const event = recoveryEvent({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType: "superseded", fromState: record.state,
    toState: "superseded", workerId, reasonCode, occurredAt: nowIso() });
  const transaction = db.transaction(() => {
    const updated = db.prepare(`UPDATE canonical_analysis_recovery_intents SET state = 'superseded',
      lease_owner = NULL, lease_expires_at = NULL, latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = ?`).run(event.eventSequence,
      event.eventHash, event.occurredAt, intentId, record.latestEventSequence, record.state);
    if (updated.changes !== 1) return;
    insertRecoveryEvent(event);
  });
  transaction();
}

function transitionLeasedRecoveryIntent(
  intentId: string,
  workerId: string,
  eventType: "completed" | "superseded" | "released_after_failure" | "rescheduled_retry_eligible",
  toState: "completed" | "superseded" | "scheduled",
  reasonCode: string,
  nextRunAt?: string,
): void {
  const record = getCanonicalAnalysisRecoveryIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId) {
    throw new Error("canonical_recovery_intent_lease_mismatch");
  }
  const occurredAt = nowIso();
  const event = recoveryEvent({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType, fromState: "leased", toState, workerId,
    reasonCode, occurredAt });
  const transaction = db.transaction(() => {
    const updated = db.prepare(`UPDATE canonical_analysis_recovery_intents SET state = ?, next_run_at = ?,
      lease_owner = NULL, lease_expires_at = NULL, latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = 'leased' AND lease_owner = ?`)
      .run(toState, nextRunAt ?? record.nextRunAt, event.eventSequence, event.eventHash, occurredAt,
        intentId, record.latestEventSequence, workerId);
    if (updated.changes !== 1) throw new Error("canonical_recovery_intent_concurrent_transition");
    insertRecoveryEvent(event);
  });
  transaction();
}

function recoveryIntentMatchesCurrent(
  intent: CanonicalAnalysisRecoveryIntent,
  persisted: ReturnType<typeof getPersistedAnalysisRun>,
): boolean {
  if (!persisted?.result || persisted.familyStatus !== "proven") return false;
  const outcome = persisted.autonomousOutcome;
  const state = persisted.continuationRevisions.at(-1);
  if (!outcome || outcome.checkpointKind !== "settled" || outcome.completion !== "stopped_operationally"
    || outcome.lifecycle !== "operational_degradation_blocks_judgment" || !state
    || state.lifecycle === "indeterminate_reconciliation_required") return false;
  const decision = state.decisions.find((item) => item.decisionId === intent.authorization.decisionId);
  const persistedRecoveryGrant = persisted.continuationExecutionGrants.find((item) =>
    item.controllerRevision === intent.binding.continuationRevision
    && item.decisionId === intent.authorization.decisionId
    && item.disposition === "operationally_degraded_retry_eligible");
  const outcomeIntegrityPermitsRecovery = persisted.autonomousOutcomeIntegrity.status === "current"
    || (Boolean(persistedRecoveryGrant) && persisted.autonomousOutcomeIntegrity.status === "stale"
      && persisted.autonomousOutcomeIntegrity.reasonCodes.length === 1
      && persisted.autonomousOutcomeIntegrity.reasonCodes[0] === "autonomous_outcome_stale_binding:executionGeneration");
  const executionBindingCurrent = persisted.rgExecutionGeneration === intent.binding.executionGeneration
    || (persisted.rgExecutionGeneration === intent.binding.executionGeneration + 1 && Boolean(persistedRecoveryGrant));
  return outcomeIntegrityPermitsRecovery
    && outcome.checkpointRevision === intent.binding.outcomeRevision
    && outcome.checkpointHash === intent.binding.outcomeHash
    && persisted.sourceFingerprint === intent.binding.sourceFingerprint
    && persisted.financialFoundationHash === intent.binding.financialFoundationHash
    && persisted.semanticRevision === intent.binding.semanticRevision
    && persisted.semanticHash === intent.binding.semanticHash
    && persisted.canonicalStateHash === intent.binding.canonicalStateHash
    && persisted.rgPlanHash === intent.binding.planHash
    && persisted.rgPlanGeneration === intent.binding.planGeneration
    && executionBindingCurrent
    && persisted.continuationRevision === intent.binding.continuationRevision
    && persisted.continuationStateHash === intent.binding.continuationStateHash
    && persisted.rfSnapshotHash === intent.binding.rfSnapshotHash
    && decision?.atomicClaimId === intent.authorization.atomicClaimId
    && decision.facet === intent.authorization.facet
    && decision.disposition === "operationally_degraded_retry_eligible"
    && decision.degradation?.continuationPermission === "bounded_retry_eligible"
    && decision.degradation.subtype === intent.authorization.degradationSubtype;
}

function mapRecoveryRecord(row: Record<string, unknown>): CanonicalAnalysisRecoveryRecord {
  const intent = JSON.parse(String(row.intent_json)) as CanonicalAnalysisRecoveryIntent;
  const expectedHash = recoveryIntentHash(intent);
  if (intent.intentId !== String(row.intent_id) || intent.intentHash !== String(row.intent_hash)
    || intent.intentHash !== expectedHash) throw new Error("canonical_recovery_intent_integrity_invalid");
  const events = recoveryEvents(intent.intentId);
  const latest = events.at(-1);
  if (!latest || latest.eventSequence !== Number(row.latest_event_sequence)
    || latest.eventHash !== String(row.latest_event_hash) || latest.toState !== String(row.state)) {
    throw new Error("canonical_recovery_event_lineage_invalid");
  }
  const waitGate = latest.waitGate ?? null;
  if (waitGate && !recoveryWaitGateValid(waitGate)) {
    throw new Error("canonical_recovery_wait_gate_integrity_invalid");
  }
  if (String(row.state) !== "waiting_for_operational_reset" && waitGate !== null) {
    throw new Error("canonical_recovery_wait_gate_state_invalid");
  }
  return {
    intent,
    state: String(row.state) as CanonicalAnalysisRecoveryIntentState,
    nextRunAt: String(row.next_run_at),
    leaseOwner: nullable(row.lease_owner),
    leaseExpiresAt: nullable(row.lease_expires_at),
    dispatchCount: Number(row.dispatch_count),
    latestEventSequence: Number(row.latest_event_sequence),
    latestEventHash: String(row.latest_event_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    waitGate,
  };
}

function recoveryWaitGateValid(gate: CanonicalAnalysisRecoveryWaitGate): boolean {
  const timed = gate.kind === "operational_allowance" || gate.kind === "provider_cooldown";
  return gate.schemaVersion === "canonical_analysis_recovery_wait_gate_v1"
    && ["operational_allowance", "provider_cooldown", "provider_readiness_change",
      "exceptional_runaway_hold"].includes(gate.kind)
    && (timed ? gate.nextEligibleAt !== null && Number.isFinite(Date.parse(gate.nextEligibleAt))
      : gate.nextEligibleAt === null)
    && /^[a-f0-9]{64}$/.test(gate.operationalPolicyHash)
    && (gate.providerConfigurationHash === null || /^[a-f0-9]{64}$/.test(gate.providerConfigurationHash))
    && /^[a-z][a-z0-9_]{0,191}$/.test(gate.reasonCode)
    && gate.analyticalCompletionEffect === "none";
}

function recoveryEvents(intentId: string): CanonicalAnalysisRecoveryEvent[] {
  const rows = db.prepare(`SELECT event_json, event_hash FROM canonical_analysis_recovery_events
    WHERE intent_id = ? ORDER BY event_sequence`).all(intentId) as Array<{ event_json: string; event_hash: string }>;
  let priorHash: string | null = null;
  return rows.map((row, index) => {
    const event = JSON.parse(row.event_json) as CanonicalAnalysisRecoveryEvent;
    if (event.eventSequence !== index + 1 || event.parentEventHash !== priorHash
      || event.eventHash !== row.event_hash || event.eventHash !== recoveryEventHash(event)) {
      throw new Error("canonical_recovery_event_lineage_invalid");
    }
    priorHash = event.eventHash;
    return event;
  });
}

function recoveryEvent(input: Omit<CanonicalAnalysisRecoveryEvent, "eventId" | "eventHash">): CanonicalAnalysisRecoveryEvent {
  const base = { eventId: `analysis-recovery-event-${randomUUID()}`, ...input };
  return { ...base, eventHash: digest(base) };
}

function recoveryEventHash(event: CanonicalAnalysisRecoveryEvent): string {
  const { eventHash: _eventHash, ...base } = event;
  return digest(base);
}

function recoveryIntentHash(intent: CanonicalAnalysisRecoveryIntent): string {
  const { intentHash: _intentHash, ...base } = intent;
  return digest(base);
}

function insertRecoveryEvent(event: CanonicalAnalysisRecoveryEvent): void {
  db.prepare(`INSERT INTO canonical_analysis_recovery_events
    (event_id, intent_id, event_sequence, parent_event_hash, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(event.eventId, event.intentId, event.eventSequence,
    event.parentEventHash, event.eventType, JSON.stringify(event), event.eventHash, event.occurredAt);
}

function recoveryDelayMs(runId: string, atomicClaimId: string): number {
  const prior = db.prepare(`SELECT COALESCE(SUM(dispatch_count), 0) AS count FROM canonical_analysis_recovery_intents
    WHERE run_id = ? AND atomic_claim_id = ?`).get(runId, atomicClaimId) as { count: number };
  const base = nonnegativeOperationalInteger("CANONICAL_RECOVERY_BASE_DELAY_MS", DEFAULT_BASE_DELAY_MS);
  const maximum = positiveOperationalInteger("CANONICAL_RECOVERY_MAX_DELAY_MS", DEFAULT_MAX_DELAY_MS);
  return Math.min(maximum, base * (2 ** Math.min(Number(prior.count), 10)));
}

function recoveryLeaseMs(): number {
  return positiveOperationalInteger("CANONICAL_RECOVERY_LEASE_MS", DEFAULT_LEASE_MS);
}

function activeAdaptiveCycleLease(runId: string, workerId: string, at: string): string | null {
  const row = db.prepare(`SELECT adaptive_cycle_owner, adaptive_cycle_lease_expires_at
    FROM canonical_analysis_runs WHERE id = ?`).get(runId) as
    { adaptive_cycle_owner: string | null; adaptive_cycle_lease_expires_at: string | null } | undefined;
  return row?.adaptive_cycle_owner === workerId && row.adaptive_cycle_lease_expires_at
    && row.adaptive_cycle_lease_expires_at > at ? row.adaptive_cycle_lease_expires_at : null;
}

function positiveOperationalInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function nonnegativeOperationalInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function nullable(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
