import { createHash, randomUUID } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import { executeDurableCanonicalAdaptiveLoop, productionAdaptiveOperationalPolicy } from "./adaptiveExecution.js";
import type { CanonicalAdaptiveExecutionResult, CanonicalAdaptiveOperationalPolicy } from "./adaptiveExecutionTypes.js";
import type { CanonicalRgEvidenceExecutionPorts } from "./rgEvidenceExecution.js";
import { createProductionRgEvidencePortsFromEnvironment } from "./rgLiveEvidencePorts.js";
import { getPersistedAnalysisRun } from "./analysisRunStore.js";
import { canonicalOperationalAllowanceDecision } from "./adaptiveOperationalAllowance.js";
import type { CanonicalAnalysisRecoveryRecord, CanonicalAnalysisRecoveryWaitGate } from "./adaptiveRecoveryTypes.js";
import type { CanonicalRgOperation } from "./rgWorkLedger.js";
import {
  admitCanonicalAnalysisRecoveryIntentAfterOperationalReset,
  claimCanonicalAnalysisRecoveryIntent,
  settleCanonicalAnalysisRecoveryIntentAfterCycle,
  ensureCanonicalAnalysisRecoveryIntent,
  getCanonicalAnalysisRecoveryIntent,
  getNextCanonicalAnalysisRecoveryDelayMs,
  listDueCanonicalAnalysisRecoveryIntents,
  reconcileCanonicalAnalysisRecoveryIntents,
  releaseCanonicalAnalysisRecoveryIntentAfterFailure,
  waitCanonicalAnalysisRecoveryIntentForOperationalReset,
} from "./adaptiveRecoveryStore.js";

const queue = new Set<string>();
let busy = false;
let tickScheduled = false;
let delayedTick: ReturnType<typeof setTimeout> | null = null;
let delayedTickAt = 0;

export function enqueueCanonicalAnalysisRecovery(runId: string): void {
  const ports = createProductionRgEvidencePortsFromEnvironment(runId);
  const intent = refreshOperationalRecoveryAdmission(ensureCanonicalAnalysisRecoveryIntent(runId),
    productionAdaptiveOperationalPolicy(), ports);
  if (intent?.state === "scheduled" && Date.parse(intent.nextRunAt) <= Date.now()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export function hydrateCanonicalAnalysisRecoveryIntents(): void {
  const policy = productionAdaptiveOperationalPolicy();
  for (const intent of reconcileCanonicalAnalysisRecoveryIntents()) {
    refreshOperationalRecoveryAdmission(intent, policy,
      createProductionRgEvidencePortsFromEnvironment(intent.intent.runId));
  }
  for (const intent of listDueCanonicalAnalysisRecoveryIntents()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export async function processCanonicalAnalysisRecoveryIntent(input: {
  intentId: string;
  workerId?: string;
  ports?: CanonicalRgEvidenceExecutionPorts;
  operationalPolicy?: CanonicalAdaptiveOperationalPolicy;
}): Promise<CanonicalAdaptiveExecutionResult | null> {
  const workerId = input.workerId ?? `canonical-recovery-worker-${randomUUID()}`;
  const operationalPolicy = input.operationalPolicy ?? productionAdaptiveOperationalPolicy();
  const record = getCanonicalAnalysisRecoveryIntent(input.intentId);
  const ports = input.ports ?? (record ? createProductionRgEvidencePortsFromEnvironment(record.intent.runId) : undefined);
  const admitted = refreshOperationalRecoveryAdmission(record, operationalPolicy, ports);
  if (!admitted || admitted.state === "waiting_for_operational_reset") return null;
  const claimed = claimCanonicalAnalysisRecoveryIntent(input.intentId, workerId);
  if (!claimed) return null;
  try {
    const result = await executeDurableCanonicalAdaptiveLoop({
      runId: claimed.intent.runId,
      workerId,
      ports: ports ?? createProductionRgEvidencePortsFromEnvironment(claimed.intent.runId),
      recoveryIntentId: claimed.intent.intentId,
      operationalPolicy,
    });
    settleCanonicalAnalysisRecoveryIntentAfterCycle(claimed.intent.intentId, workerId);
    ensureCanonicalAnalysisRecoveryIntent(claimed.intent.runId);
    const { enqueueCanonicalRgOperationReconciliation } = await import("./rgOperationReconciliationWorker.js");
    enqueueCanonicalRgOperationReconciliation(claimed.intent.runId,
      input.ports ?? createProductionRgEvidencePortsFromEnvironment(claimed.intent.runId));
    return result;
  } catch (error) {
    releaseCanonicalAnalysisRecoveryIntentAfterFailure(claimed.intent.intentId, workerId, safeReason(error));
    throw error;
  }
}

function refreshOperationalRecoveryAdmission(
  record: ReturnType<typeof getCanonicalAnalysisRecoveryIntent>,
  policy: CanonicalAdaptiveOperationalPolicy,
  ports?: CanonicalRgEvidenceExecutionPorts,
): ReturnType<typeof getCanonicalAnalysisRecoveryIntent> {
  if (!record || !["scheduled", "waiting_for_operational_reset"].includes(record.state)) return record;
  const admission = operationalRecoveryAdmission(record, policy, ports);
  if (!admission.admitted) {
    return waitCanonicalAnalysisRecoveryIntentForOperationalReset(record.intent.intentId,
      admission.reasonCode, admission.waitGate);
  }
  return admitCanonicalAnalysisRecoveryIntentAfterOperationalReset(record.intent.intentId);
}

function operationalRecoveryAdmission(record: CanonicalAnalysisRecoveryRecord,
  policy: CanonicalAdaptiveOperationalPolicy, ports?: CanonicalRgEvidenceExecutionPorts):
  { admitted: true } | { admitted: false; reasonCode: string; waitGate?: CanonicalAnalysisRecoveryWaitGate } {
  const runId = record.intent.runId;
  const state = getPersistedAnalysisRun(runId)?.continuationRevisions.at(-1);
  if (!state || policy.authority !== "deployment_emergency_circuit_breaker_only"
    || policy.analyticalCompletionAuthority !== "none" || policy.maximumConcurrentWork !== 1) {
    return { admitted: false, reasonCode: "recovery_operational_policy_invalid_waiting_for_reset" };
  }
  if (policy.operationalAllowance) {
    const allowance = canonicalOperationalAllowanceDecision(runId, policy);
    if (!allowance) return { admitted: false, reasonCode: "recovery_operational_allowance_unavailable" };
    const policyHash = allowance.policyHash;
    const readinessHash = digest({ runtimeConfigurationHash: ports?.runtimeReadiness?.configurationHash ?? null,
      providerConfigurationRevision: policy.operationalAllowance.providerConfigurationRevision });
    if (ports?.availability === "unavailable") {
      return blocked("provider_readiness_change", null, policyHash, readinessHash,
        "recovery_provider_or_configuration_not_ready_waiting_for_identity_change");
    }
    const providerGate = providerRecoveryGate(record, policyHash, readinessHash);
    const allowanceGate = !allowance.admitted
      ? blocked(allowance.kind === "exceptional_runaway_hold" ? "exceptional_runaway_hold" : "operational_allowance",
        allowance.nextEligibleAt, policyHash, readinessHash,
        allowance.kind === "exceptional_runaway_hold"
          ? "recovery_exceptional_runaway_guard_waiting_for_operational_release"
          : "recovery_operational_allowance_waiting_until_next_eligible_at") : null;
    const blocking = latestBlockingGate([providerGate, allowanceGate].filter(isBlockingGate));
    if (blocking) return blocking;
    return { admitted: true };
  }
  if (state.cumulativeResource.providerCalls >= policy.maximumCumulativeProviderCalls) {
    return { admitted: false,
      reasonCode: "recovery_cumulative_provider_call_ceiling_exhausted_waiting_for_operational_reset" };
  }
  if (state.cumulativeResource.retrievalBytes >= policy.maximumCumulativeRetrievalBytes) {
    return { admitted: false,
      reasonCode: "recovery_cumulative_retrieval_byte_ceiling_exhausted_waiting_for_operational_reset" };
  }
  if (state.cumulativeResource.elapsedMsObserved >= policy.maximumCumulativeElapsedMs) {
    return { admitted: false,
      reasonCode: "recovery_cumulative_elapsed_ceiling_exhausted_waiting_for_operational_reset" };
  }
  return { admitted: true };
}

function latestBlockingGate(gates: Array<ReturnType<typeof blocked>>): ReturnType<typeof blocked> | null {
  const nonTimed = gates.find((gate) => gate.waitGate.nextEligibleAt === null);
  if (nonTimed) return nonTimed;
  return gates.sort((left, right) => Date.parse(right.waitGate.nextEligibleAt!)
    - Date.parse(left.waitGate.nextEligibleAt!))[0] ?? null;
}

function isBlockingGate(value: ReturnType<typeof blocked> | null): value is ReturnType<typeof blocked> {
  return value !== null;
}

function providerRecoveryGate(record: CanonicalAnalysisRecoveryRecord, policyHash: string,
  readinessHash: string): ReturnType<typeof blocked> | null {
  if (record.intent.authorization.degradationSubtype === "resource_or_runtime_exhaustion") return null;
  if (record.intent.authorization.degradationSubtype === "provider_unavailable_before_send"
    || record.intent.authorization.degradationSubtype === "before_send_failure_retry_eligible") {
    const nextEligibleAt = new Date(Date.parse(record.intent.createdAt)
      + providerCooldownMs(record, "provider_unavailable_before_send", 0)).toISOString();
    return Date.parse(nextEligibleAt) > Date.now()
      ? blocked("provider_cooldown", nextEligibleAt, policyHash, readinessHash,
        "recovery_transient_provider_cooldown_active") : null;
  }
  const persisted = getPersistedAnalysisRun(record.intent.runId);
  const latest = persisted?.rgOperations.filter((operation) => operation.atomicClaimId === record.intent.authorization.atomicClaimId
    && operation.state === "provider_rejected")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.operationId.localeCompare(left.operationId))[0] as
    CanonicalRgOperation | undefined;
  if (!latest || latest.receipt.calls === 0) return null;
  const reason = latest.receipt.reasonCode;
  const diagnostics = latest.receipt.providerDiagnostics;
  const readinessFailure = /(authentication|authorization|account|model|configuration|credential)/.test(reason)
    || [400, 401, 402, 403, 404, 415, 422].includes(diagnostics?.httpStatus ?? -1);
  if (readinessFailure) {
    if (record.waitGate?.kind === "provider_readiness_change"
      && record.waitGate.providerConfigurationHash !== readinessHash) return null;
    return blocked("provider_readiness_change", null, policyHash, readinessHash,
      "recovery_provider_rejection_waiting_for_configuration_identity_change");
  }
  const retryAfterAt = diagnostics?.retryAfterAt ?? null;
  if (retryAfterAt !== null && !Number.isFinite(Date.parse(retryAfterAt))) {
    return blocked("exceptional_runaway_hold", null, policyHash, readinessHash,
      "recovery_provider_retry_after_receipt_invalid_fail_closed");
  }
  const nextEligibleAt = retryAfterAt
    ?? new Date(Date.parse(latest.updatedAt) + providerCooldownMs(record, reason,
      persisted?.rgOperations.filter((operation) => operation.atomicClaimId === record.intent.authorization.atomicClaimId
        && operation.state === "provider_rejected").length ?? 0)).toISOString();
  if (Date.parse(nextEligibleAt) <= Date.now()) return null;
  return blocked("provider_cooldown", nextEligibleAt, policyHash, readinessHash,
    retryAfterAt ? "recovery_provider_retry_after_cooldown_active" : "recovery_transient_provider_cooldown_active");
}

function providerCooldownMs(record: CanonicalAnalysisRecoveryRecord, reasonCode: string,
  providerRejectionCount: number): number {
  const base = nonnegativeOperationalInteger("RG_PROVIDER_COOLDOWN_BASE_MS", 2_000);
  const maximum = positiveOperationalInteger("RG_PROVIDER_COOLDOWN_MAX_MS", 120_000);
  const rateLimitedBase = nonnegativeOperationalInteger("RG_PROVIDER_RATE_LIMIT_COOLDOWN_BASE_MS", 10_000);
  const start = /rate_limited/.test(reasonCode) ? rateLimitedBase : base;
  const priorAttempts = Math.max(record.dispatchCount, Math.max(0, providerRejectionCount - 1));
  return Math.min(maximum, start * (2 ** Math.min(priorAttempts, 8)));
}

function blocked(kind: CanonicalAnalysisRecoveryWaitGate["kind"], nextEligibleAt: string | null,
  policyHash: string, readinessHash: string | null, reasonCode: string):
  { admitted: false; reasonCode: string; waitGate: CanonicalAnalysisRecoveryWaitGate } {
  return { admitted: false, reasonCode, waitGate: { schemaVersion: "canonical_analysis_recovery_wait_gate_v1",
    kind, nextEligibleAt, operationalPolicyHash: policyHash, providerConfigurationHash: readinessHash,
    reasonCode, analyticalCompletionEffect: "none" } };
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function positiveOperationalInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function nonnegativeOperationalInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

async function tick(): Promise<void> {
  if (busy) return;
  for (const intent of listDueCanonicalAnalysisRecoveryIntents()) queue.add(intent.intent.intentId);
  const intentId = queue.values().next().value as string | undefined;
  if (!intentId) {
    scheduleFromDurableState();
    return;
  }
  queue.delete(intentId);
  busy = true;
  try {
    await processCanonicalAnalysisRecoveryIntent({ intentId });
  } catch (error) {
    const intent = getCanonicalAnalysisRecoveryIntent(intentId);
    console.error("[canonical-recovery-degraded]", {
      runId: intent?.intent.runId ?? null,
      intentId,
      reason: safeReason(error),
    });
  } finally {
    busy = false;
    scheduleTick();
  }
}

function scheduleFromDurableState(): void {
  for (const intent of listDueCanonicalAnalysisRecoveryIntents()) queue.add(intent.intent.intentId);
  if (queue.size > 0) {
    scheduleTick();
    return;
  }
  const delayMs = getNextCanonicalAnalysisRecoveryDelayMs();
  if (delayMs !== null) scheduleTickAfter(delayMs);
}

function scheduleTick(): void {
  if (delayedTick) {
    clearTimeout(delayedTick);
    delayedTick = null;
    delayedTickAt = 0;
  }
  if (tickScheduled) return;
  tickScheduled = true;
  setTimeout(() => {
    tickScheduled = false;
    void tick();
  }, 0);
}

function scheduleTickAfter(delayMs: number): void {
  const bounded = Math.min(Math.max(0, delayMs), 60 * 60_000);
  if (bounded === 0) {
    scheduleTick();
    return;
  }
  const targetAt = Date.now() + bounded;
  if (delayedTick && delayedTickAt <= targetAt) return;
  if (delayedTick) clearTimeout(delayedTick);
  delayedTickAt = targetAt;
  delayedTick = setTimeout(() => {
    delayedTick = null;
    delayedTickAt = 0;
    scheduleTick();
  }, bounded);
  delayedTick.unref?.();
}

function safeReason(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 240) || "canonical_recovery_unknown_failure";
}
