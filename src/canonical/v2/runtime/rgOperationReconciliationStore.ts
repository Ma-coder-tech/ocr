import { createHash, randomUUID } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import { getPersistedAnalysisRun } from "./analysisRunStore.js";
import type { CanonicalRgEvidenceExecutionPorts } from "./rgEvidenceExecution.js";
import {
  RG_OPERATION_RECONCILIATION_SCHEMA_VERSION,
  type CanonicalRgReconciliationEvent,
  type CanonicalRgReconciliationIntent,
  type CanonicalRgReconciliationIntentState,
  type CanonicalRgReconciliationRecord,
} from "./rgOperationReconciliationTypes.js";

const DEFAULT_BASE_DELAY_MS = 30_000;
const DEFAULT_MAX_DELAY_MS = 15 * 60_000;
const DEFAULT_LEASE_MS = 10 * 60_000;

export function ensureCanonicalRgReconciliationIntent(
  runId: string,
  ports: CanonicalRgEvidenceExecutionPorts,
): CanonicalRgReconciliationRecord | null {
  supersedeStaleIntents(runId);
  if (!reconciliationPortSupported(ports)) return null;
  const persisted = getPersistedAnalysisRun(runId);
  const outcome = persisted?.autonomousOutcome;
  const continuation = persisted?.continuationRevisions.at(-1);
  if (!persisted?.result || persisted.familyStatus !== "proven" || !outcome || !continuation
    || persisted.autonomousOutcomeIntegrity.status !== "current"
    || outcome.checkpointKind !== "settled" || outcome.completion !== "reconciliation_required"
    || outcome.lifecycle !== "indeterminate_reconciliation_required"
    || continuation.lifecycle !== "indeterminate_reconciliation_required"
    || continuation.controllerRevision !== outcome.binding.continuationRevision
    || continuation.stateHash !== outcome.binding.continuationStateHash
    || !persisted.rgPlanHash || !persisted.continuationStateHash) return null;
  const operations = persisted.rgOperations.filter((operation) => operation.state === "indeterminate_after_send")
    .sort((left, right) => left.operationId.localeCompare(right.operationId));
  if (operations.length === 0 || operations.some((operation) => !safeProviderCorrelation(
    operation.receipt.providerCode, operation.receipt.providerRequestId, operation.inputHash))) return null;
  const existing = db.prepare(`SELECT intent_id FROM canonical_rg_reconciliation_intents
    WHERE run_id = ? AND outcome_revision = ?`).get(runId, outcome.checkpointRevision) as
    { intent_id: string } | undefined;
  if (existing) return getCanonicalRgReconciliationIntent(existing.intent_id);

  const createdAt = nowIso();
  const intentBase = {
    schemaVersion: RG_OPERATION_RECONCILIATION_SCHEMA_VERSION,
    intentId: `rg-reconciliation-${digest({ runId, outcomeHash: outcome.checkpointHash,
      operationIds: operations.map((operation) => operation.operationId) }).slice(0, 32)}`,
    runId,
    binding: {
      outcomeRevision: outcome.checkpointRevision,
      outcomeHash: outcome.checkpointHash,
      sourceFingerprint: persisted.sourceFingerprint,
      financialFoundationHash: persisted.financialFoundationHash,
      semanticRevision: persisted.semanticRevision,
      semanticHash: persisted.semanticHash,
      canonicalStateHash: persisted.canonicalStateHash,
      planHash: persisted.rgPlanHash,
      planGeneration: persisted.rgPlanGeneration,
      executionGeneration: persisted.rgExecutionGeneration,
      continuationRevision: persisted.continuationRevision,
      continuationStateHash: persisted.continuationStateHash,
      rfSnapshotHash: persisted.rfSnapshotHash,
    },
    operations: operations.map((operation) => ({
      operationId: operation.operationId,
      workItemId: operation.workItemId,
      atomicClaimId: operation.atomicClaimId,
      kind: operation.kind,
      inputHash: operation.inputHash,
      providerCode: operation.receipt.providerCode,
      providerRequestId: operation.receipt.providerRequestId!,
    })),
    authorization: "reconcile_original_operations_only" as const,
    originalOperationResend: "prohibited" as const,
    analyticalCompletionEffect: "none" as const,
    customerReportAuthority: "legacy_report_unchanged" as const,
    createdAt,
  };
  const intent: CanonicalRgReconciliationIntent = { ...intentBase, intentHash: digest(intentBase) };
  const scheduled = event({ intentId: intent.intentId, eventSequence: 1, parentEventHash: null,
    eventType: "scheduled", fromState: null, toState: "scheduled", workerId: null,
    reasonCode: "current_outcome_contains_provider_correlated_indeterminate_operations", occurredAt: createdAt });
  const transaction = db.transaction(() => {
    if (!intentMatchesCurrent(intent, getPersistedAnalysisRun(runId))) {
      throw new Error("canonical_rg_reconciliation_intent_stale_before_persistence");
    }
    db.prepare(`INSERT INTO canonical_rg_reconciliation_intents
      (intent_id, run_id, outcome_revision, outcome_hash, controller_revision, state, next_run_at,
       lease_owner, lease_expires_at, dispatch_count, latest_event_sequence, latest_event_hash,
       intent_json, intent_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'scheduled', ?, NULL, NULL, 0, 1, ?, ?, ?, ?, ?)`)
      .run(intent.intentId, runId, intent.binding.outcomeRevision, intent.binding.outcomeHash,
        intent.binding.continuationRevision, createdAt, scheduled.eventHash, JSON.stringify(intent),
        intent.intentHash, createdAt, createdAt);
    insertEvent(scheduled);
  });
  try { transaction(); }
  catch (error) {
    const raced = db.prepare(`SELECT intent_id FROM canonical_rg_reconciliation_intents
      WHERE run_id = ? AND outcome_revision = ?`).get(runId, outcome.checkpointRevision) as
      { intent_id: string } | undefined;
    if (raced) return getCanonicalRgReconciliationIntent(raced.intent_id);
    throw error;
  }
  return getCanonicalRgReconciliationIntent(intent.intentId);
}

export function listCanonicalRunsRequiringRgReconciliation(): string[] {
  return (db.prepare(`SELECT id FROM canonical_analysis_runs
    WHERE continuation_lifecycle = 'indeterminate_reconciliation_required'
    ORDER BY updated_at, id`).all() as Array<{ id: string }>).map((row) => row.id);
}

export function getCanonicalRgReconciliationIntent(intentId: string): CanonicalRgReconciliationRecord | null {
  const row = db.prepare(`SELECT * FROM canonical_rg_reconciliation_intents WHERE intent_id = ?`).get(intentId) as
    Record<string, unknown> | undefined;
  return row ? mapRecord(row) : null;
}

export function listCanonicalRgReconciliationIntents(runId: string): CanonicalRgReconciliationRecord[] {
  return (db.prepare(`SELECT * FROM canonical_rg_reconciliation_intents WHERE run_id = ?
    ORDER BY outcome_revision, created_at, intent_id`).all(runId) as Array<Record<string, unknown>>).map(mapRecord);
}

export function listDueCanonicalRgReconciliationIntents(): CanonicalRgReconciliationRecord[] {
  const now = nowIso();
  const rows = db.prepare(`SELECT * FROM canonical_rg_reconciliation_intents
    WHERE (state = 'scheduled' AND next_run_at <= ?)
       OR (state = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
    ORDER BY next_run_at, created_at, intent_id`).all(now, now) as Array<Record<string, unknown>>;
  const due: CanonicalRgReconciliationRecord[] = [];
  for (const row of rows) {
    const record = mapRecord(row);
    if (record.state === "leased" && record.leaseOwner
      && activeAdaptiveCycleLease(record.intent.runId, record.leaseOwner, now)) continue;
    if (intentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) due.push(record);
    else supersedeIntent(record.intent.intentId, null, "reconciliation_binding_no_longer_current");
  }
  return due;
}

export function getNextCanonicalRgReconciliationDelayMs(): number | null {
  const rows = db.prepare(`SELECT * FROM canonical_rg_reconciliation_intents
    WHERE state = 'scheduled' OR (state = 'leased' AND lease_expires_at IS NOT NULL)
    ORDER BY created_at, intent_id`).all() as Array<Record<string, unknown>>;
  const wakeTimes = rows.map(mapRecord).map((record) => {
    if (record.state === "scheduled") return Date.parse(record.nextRunAt);
    const active = record.leaseOwner ? activeAdaptiveCycleLease(record.intent.runId, record.leaseOwner, nowIso()) : null;
    return Math.max(Date.parse(record.leaseExpiresAt!), active ? Date.parse(active) : 0);
  });
  return wakeTimes.length === 0 ? null : Math.max(0, Math.min(...wakeTimes) - Date.now());
}

export function claimCanonicalRgReconciliationIntent(
  intentId: string,
  workerId: string,
): CanonicalRgReconciliationRecord | null {
  const current = getCanonicalRgReconciliationIntent(intentId);
  if (!current || !intentMatchesCurrent(current.intent, getPersistedAnalysisRun(current.intent.runId))) {
    if (current) supersedeIntent(intentId, workerId, "reconciliation_binding_no_longer_current");
    return null;
  }
  const now = new Date();
  if (current.state === "scheduled" && Date.parse(current.nextRunAt) > now.getTime()) return null;
  if (current.state === "leased" && current.leaseExpiresAt && Date.parse(current.leaseExpiresAt) > now.getTime()) return null;
  if (current.state === "leased" && current.leaseOwner
    && activeAdaptiveCycleLease(current.intent.runId, current.leaseOwner, now.toISOString())) return null;
  if (!["scheduled", "leased"].includes(current.state)) return null;
  const eventType = current.state === "leased" ? "lease_recovered" : "leased";
  const leaseExpiresAt = new Date(now.getTime() + leaseMs()).toISOString();
  const leased = event({ intentId, eventSequence: current.latestEventSequence + 1,
    parentEventHash: current.latestEventHash, eventType, fromState: current.state, toState: "leased",
    workerId, reasonCode: eventType === "lease_recovered" ? "expired_reconciliation_lease_reclaimed"
      : "due_reconciliation_claimed", occurredAt: now.toISOString() });
  const transaction = db.transaction(() => {
    const result = db.prepare(`UPDATE canonical_rg_reconciliation_intents
      SET state = 'leased', lease_owner = ?, lease_expires_at = ?, dispatch_count = dispatch_count + 1,
          latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = ?
        AND (state = 'scheduled' OR lease_expires_at <= ?)`)
      .run(workerId, leaseExpiresAt, leased.eventSequence, leased.eventHash, leased.occurredAt,
        intentId, current.latestEventSequence, current.state, leased.occurredAt);
    if (result.changes !== 1) throw new Error("canonical_rg_reconciliation_concurrent_claim");
    insertEvent(leased);
  });
  try { transaction(); } catch (error) {
    if (error instanceof Error && error.message === "canonical_rg_reconciliation_concurrent_claim") return null;
    throw error;
  }
  return getCanonicalRgReconciliationIntent(intentId);
}

export function assertClaimedCanonicalRgReconciliationIntent(
  intentId: string,
  workerId: string,
): CanonicalRgReconciliationRecord {
  const record = getCanonicalRgReconciliationIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId || !record.leaseExpiresAt
    || Date.parse(record.leaseExpiresAt) <= Date.now()) throw new Error("canonical_rg_reconciliation_claimed_intent_required");
  if (!intentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    throw new Error("canonical_rg_reconciliation_intent_stale_binding");
  }
  return record;
}

export function renewCanonicalRgReconciliationIntentLease(intentId: string, workerId: string): void {
  const record = getCanonicalRgReconciliationIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId
    || !activeAdaptiveCycleLease(record.intent.runId, workerId, nowIso())) {
    throw new Error("canonical_rg_reconciliation_lease_renewal_invalid");
  }
  const occurredAt = nowIso();
  const renewed = event({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType: "lease_renewed", fromState: "leased", toState: "leased",
    workerId, reasonCode: "active_adaptive_cycle_reconciliation_lease_renewed", occurredAt });
  transition(record, renewed, "leased", new Date(Date.now() + leaseMs()).toISOString(), workerId);
}

export function canonicalRgReconciliationHeartbeatMs(): number {
  return Math.max(1, Math.min(60_000, Math.floor(leaseMs() / 3)));
}

export function recordCanonicalRgReconciliationLookup(
  intentId: string,
  workerId: string,
  eventType: "lookup_pending" | "lookup_failed" | "lookup_unsupported" | "lookup_resolved",
  reasonCode: string,
): void {
  const record = assertClaimedCanonicalRgReconciliationIntent(intentId, workerId);
  const occurredAt = nowIso();
  const recorded = event({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType, fromState: "leased", toState: "leased",
    workerId, reasonCode, occurredAt });
  transition(record, recorded, "leased", record.leaseExpiresAt!, workerId);
}

export function settleCanonicalRgReconciliationIntentAfterCycle(intentId: string, workerId: string): CanonicalRgReconciliationIntentState {
  const record = getCanonicalRgReconciliationIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId) {
    throw new Error("canonical_rg_reconciliation_lease_mismatch");
  }
  if (!intentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    transitionLeased(record, workerId, "completed", "completed", "reconciliation_cycle_produced_successor_outcome");
    return "completed";
  }
  const unresolved = record.intent.operations.some((bound) => {
    const row = db.prepare(`SELECT state FROM canonical_rg_operations WHERE run_id = ? AND operation_id = ?`)
      .get(record.intent.runId, bound.operationId) as { state: string } | undefined;
    return row?.state === "indeterminate_after_send";
  });
  if (!unresolved) {
    transitionLeased(record, workerId, "completed", "completed", "all_original_operations_trustworthily_reconciled");
    return "completed";
  }
  const cycleEvents = events(intentId).filter((item) => item.eventSequence > latestLeaseSequence(intentId));
  if (cycleEvents.some((item) => item.eventType === "lookup_unsupported")) {
    transitionLeased(record, workerId, "unsupported", "unsupported", "original_operation_lookup_not_supported");
    return "unsupported";
  }
  const nextRunAt = new Date(Date.now() + delayMs(record.dispatchCount)).toISOString();
  transitionLeased(record, workerId, "rescheduled_pending", "scheduled",
    "original_operation_resolution_still_pending", nextRunAt);
  return "scheduled";
}

export function releaseCanonicalRgReconciliationIntentAfterFailure(
  intentId: string,
  workerId: string,
  reasonCode: string,
): void {
  const record = getCanonicalRgReconciliationIntent(intentId);
  if (!record || record.state !== "leased" || record.leaseOwner !== workerId) return;
  if (!intentMatchesCurrent(record.intent, getPersistedAnalysisRun(record.intent.runId))) {
    transitionLeased(record, workerId, "superseded", "superseded", "reconciliation_failure_left_binding_noncurrent");
    return;
  }
  transitionLeased(record, workerId, "released_after_failure", "scheduled", reasonCode,
    new Date(Date.now() + delayMs(record.dispatchCount)).toISOString());
}

function supersedeStaleIntents(runId: string): void {
  const rows = db.prepare(`SELECT intent_id FROM canonical_rg_reconciliation_intents
    WHERE run_id = ? AND state IN ('scheduled', 'leased') ORDER BY created_at`).all(runId) as Array<{ intent_id: string }>;
  for (const row of rows) {
    const record = getCanonicalRgReconciliationIntent(row.intent_id);
    if (record && !intentMatchesCurrent(record.intent, getPersistedAnalysisRun(runId))) {
      supersedeIntent(row.intent_id, null, "newer_or_changed_authoritative_outcome");
    }
  }
}

function supersedeIntent(intentId: string, workerId: string | null, reasonCode: string): void {
  const record = getCanonicalRgReconciliationIntent(intentId);
  if (!record || ["completed", "unsupported", "superseded"].includes(record.state)) return;
  const superseded = event({ intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType: "superseded", fromState: record.state,
    toState: "superseded", workerId, reasonCode, occurredAt: nowIso() });
  transition(record, superseded, "superseded", record.nextRunAt, workerId);
}

function transitionLeased(
  record: CanonicalRgReconciliationRecord,
  workerId: string,
  eventType: CanonicalRgReconciliationEvent["eventType"],
  toState: CanonicalRgReconciliationIntentState,
  reasonCode: string,
  nextRunAt = record.nextRunAt,
): void {
  const occurredAt = nowIso();
  const next = event({ intentId: record.intent.intentId, eventSequence: record.latestEventSequence + 1,
    parentEventHash: record.latestEventHash, eventType, fromState: "leased", toState,
    workerId, reasonCode, occurredAt });
  transition(record, next, toState, nextRunAt, workerId);
}

function transition(
  record: CanonicalRgReconciliationRecord,
  next: CanonicalRgReconciliationEvent,
  toState: CanonicalRgReconciliationIntentState,
  nextRunAt: string,
  workerId: string | null,
): void {
  const transaction = db.transaction(() => {
    const updated = db.prepare(`UPDATE canonical_rg_reconciliation_intents SET state = ?, next_run_at = ?,
      lease_owner = ?, lease_expires_at = ?, latest_event_sequence = ?, latest_event_hash = ?, updated_at = ?
      WHERE intent_id = ? AND latest_event_sequence = ? AND state = ?`)
      .run(toState, nextRunAt, toState === "leased" ? workerId : null,
        toState === "leased" ? new Date(Date.now() + leaseMs()).toISOString() : null,
        next.eventSequence, next.eventHash, next.occurredAt, record.intent.intentId,
        record.latestEventSequence, record.state);
    if (updated.changes !== 1) throw new Error("canonical_rg_reconciliation_concurrent_transition");
    insertEvent(next);
  });
  transaction();
}

function intentMatchesCurrent(
  intent: CanonicalRgReconciliationIntent,
  persisted: ReturnType<typeof getPersistedAnalysisRun>,
): boolean {
  if (!persisted?.result || persisted.familyStatus !== "proven") return false;
  const outcome = persisted.autonomousOutcome;
  const continuation = persisted.continuationRevisions.at(-1);
  if (!outcome || !continuation || outcome.checkpointKind !== "settled"
    || outcome.completion !== "reconciliation_required" || outcome.lifecycle !== "indeterminate_reconciliation_required"
    || continuation.lifecycle !== "indeterminate_reconciliation_required") return false;
  const boundOperations = new Map(intent.operations.map((operation) => [operation.operationId, operation]));
  const currentOperationIds = persisted.rgOperations.filter((operation) => operation.state === "indeterminate_after_send")
    .map((operation) => operation.operationId);
  if (currentOperationIds.some((operationId) => !boundOperations.has(operationId))) return false;
  return outcome.checkpointRevision === intent.binding.outcomeRevision
    && outcome.checkpointHash === intent.binding.outcomeHash
    && persisted.sourceFingerprint === intent.binding.sourceFingerprint
    && persisted.financialFoundationHash === intent.binding.financialFoundationHash
    && persisted.semanticRevision === intent.binding.semanticRevision
    && persisted.semanticHash === intent.binding.semanticHash
    && persisted.canonicalStateHash === intent.binding.canonicalStateHash
    && persisted.rgPlanHash === intent.binding.planHash
    && persisted.rgPlanGeneration === intent.binding.planGeneration
    && persisted.rgExecutionGeneration === intent.binding.executionGeneration
    && persisted.continuationRevision === intent.binding.continuationRevision
    && persisted.continuationStateHash === intent.binding.continuationStateHash
    && persisted.rfSnapshotHash === intent.binding.rfSnapshotHash
    && intent.operations.every((bound) => persisted.rgOperations.some((operation) =>
      operation.operationId === bound.operationId && operation.workItemId === bound.workItemId
      && operation.atomicClaimId === bound.atomicClaimId && operation.kind === bound.kind
      && operation.inputHash === bound.inputHash && operation.receipt.providerCode === bound.providerCode
      && operation.receipt.providerRequestId === bound.providerRequestId));
}

function reconciliationPortSupported(ports: CanonicalRgEvidenceExecutionPorts): boolean {
  const portCapability = ports.reconciliation?.capability;
  const capability = ports.reconciliationCapability ?? portCapability;
  return Boolean(ports.reconciliation && portCapability && capability
    && canonicalJson(portCapability) === canonicalJson(capability)
    && capability.mode === "provider_authenticated_original_operation_lookup"
    && capability.originalOperationResend === "prohibited"
    && capability.merchantPrivateContextTransmission === "none"
    && capability.lookupRepeatability === "side_effect_free_status_lookup_only");
}

function safeProviderCorrelation(providerCode: string, providerRequestId: string | null, inputHash: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(providerCode)
    && typeof providerRequestId === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(providerRequestId)
    && /^[a-f0-9]{64}$/.test(inputHash);
}

function mapRecord(row: Record<string, unknown>): CanonicalRgReconciliationRecord {
  const intent = JSON.parse(String(row.intent_json)) as CanonicalRgReconciliationIntent;
  if (intent.intentId !== String(row.intent_id) || intent.intentHash !== String(row.intent_hash)
    || intent.intentHash !== intentHash(intent) || intent.runId !== String(row.run_id)
    || intent.binding.outcomeRevision !== Number(row.outcome_revision)
    || intent.binding.outcomeHash !== String(row.outcome_hash)
    || intent.binding.continuationRevision !== Number(row.controller_revision)
    || intent.createdAt !== String(row.created_at)) {
    throw new Error("canonical_rg_reconciliation_intent_integrity_invalid");
  }
  const lineage = events(intent.intentId);
  const latest = lineage.at(-1);
  if (!latest || latest.eventSequence !== Number(row.latest_event_sequence)
    || latest.eventHash !== String(row.latest_event_hash) || latest.toState !== String(row.state)) {
    throw new Error("canonical_rg_reconciliation_event_lineage_invalid");
  }
  return { intent, state: String(row.state) as CanonicalRgReconciliationIntentState,
    nextRunAt: String(row.next_run_at), leaseOwner: nullable(row.lease_owner),
    leaseExpiresAt: nullable(row.lease_expires_at), dispatchCount: Number(row.dispatch_count),
    latestEventSequence: Number(row.latest_event_sequence), latestEventHash: String(row.latest_event_hash),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function events(intentId: string): CanonicalRgReconciliationEvent[] {
  const rows = db.prepare(`SELECT event_json, event_hash FROM canonical_rg_reconciliation_events
    WHERE intent_id = ? ORDER BY event_sequence`).all(intentId) as Array<{ event_json: string; event_hash: string }>;
  let priorHash: string | null = null;
  return rows.map((row, index) => {
    const value = JSON.parse(row.event_json) as CanonicalRgReconciliationEvent;
    if (value.eventSequence !== index + 1 || value.parentEventHash !== priorHash
      || value.eventHash !== row.event_hash || value.eventHash !== eventHash(value)) {
      throw new Error("canonical_rg_reconciliation_event_lineage_invalid");
    }
    priorHash = value.eventHash;
    return value;
  });
}

function latestLeaseSequence(intentId: string): number {
  return events(intentId).filter((item) => item.eventType === "leased" || item.eventType === "lease_recovered").at(-1)?.eventSequence ?? 0;
}

function event(input: Omit<CanonicalRgReconciliationEvent, "eventId" | "eventHash">): CanonicalRgReconciliationEvent {
  const base = { eventId: `rg-reconciliation-event-${randomUUID()}`, ...input };
  return { ...base, eventHash: digest(base) };
}

function eventHash(value: CanonicalRgReconciliationEvent): string {
  const { eventHash: _eventHash, ...base } = value;
  return digest(base);
}

function intentHash(value: CanonicalRgReconciliationIntent): string {
  const { intentHash: _intentHash, ...base } = value;
  return digest(base);
}

function insertEvent(value: CanonicalRgReconciliationEvent): void {
  db.prepare(`INSERT INTO canonical_rg_reconciliation_events
    (event_id, intent_id, event_sequence, parent_event_hash, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(value.eventId, value.intentId, value.eventSequence,
    value.parentEventHash, value.eventType, JSON.stringify(value), value.eventHash, value.occurredAt);
}

function activeAdaptiveCycleLease(runId: string, workerId: string, at: string): string | null {
  const row = db.prepare(`SELECT adaptive_cycle_owner, adaptive_cycle_lease_expires_at
    FROM canonical_analysis_runs WHERE id = ?`).get(runId) as
    { adaptive_cycle_owner: string | null; adaptive_cycle_lease_expires_at: string | null } | undefined;
  return row?.adaptive_cycle_owner === workerId && row.adaptive_cycle_lease_expires_at
    && row.adaptive_cycle_lease_expires_at > at ? row.adaptive_cycle_lease_expires_at : null;
}

function delayMs(dispatchCount: number): number {
  const base = nonnegativeOperationalInteger("CANONICAL_RG_RECONCILIATION_BASE_DELAY_MS", DEFAULT_BASE_DELAY_MS);
  const maximum = positiveOperationalInteger("CANONICAL_RG_RECONCILIATION_MAX_DELAY_MS", DEFAULT_MAX_DELAY_MS);
  return Math.min(maximum, base * (2 ** Math.min(dispatchCount, 10)));
}

function leaseMs(): number {
  return positiveOperationalInteger("CANONICAL_RG_RECONCILIATION_LEASE_MS", DEFAULT_LEASE_MS);
}

function positiveOperationalInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function nonnegativeOperationalInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function nullable(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
