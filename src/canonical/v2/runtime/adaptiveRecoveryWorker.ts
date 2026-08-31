import { randomUUID } from "node:crypto";

import { executeDurableCanonicalAdaptiveLoop, productionAdaptiveOperationalPolicy } from "./adaptiveExecution.js";
import type { CanonicalAdaptiveExecutionResult, CanonicalAdaptiveOperationalPolicy } from "./adaptiveExecutionTypes.js";
import type { CanonicalRgEvidenceExecutionPorts } from "./rgEvidenceExecution.js";
import { createProductionRgEvidencePortsFromEnvironment } from "./rgLiveEvidencePorts.js";
import { getPersistedAnalysisRun } from "./analysisRunStore.js";
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
  const intent = refreshOperationalRecoveryAdmission(ensureCanonicalAnalysisRecoveryIntent(runId),
    productionAdaptiveOperationalPolicy());
  if (intent?.state === "scheduled" && Date.parse(intent.nextRunAt) <= Date.now()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export function hydrateCanonicalAnalysisRecoveryIntents(): void {
  const policy = productionAdaptiveOperationalPolicy();
  for (const intent of reconcileCanonicalAnalysisRecoveryIntents()) refreshOperationalRecoveryAdmission(intent, policy);
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
  const admitted = refreshOperationalRecoveryAdmission(getCanonicalAnalysisRecoveryIntent(input.intentId), operationalPolicy);
  if (!admitted || admitted.state === "waiting_for_operational_reset") return null;
  const claimed = claimCanonicalAnalysisRecoveryIntent(input.intentId, workerId);
  if (!claimed) return null;
  try {
    const result = await executeDurableCanonicalAdaptiveLoop({
      runId: claimed.intent.runId,
      workerId,
      ports: input.ports ?? createProductionRgEvidencePortsFromEnvironment(claimed.intent.runId),
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
): ReturnType<typeof getCanonicalAnalysisRecoveryIntent> {
  if (!record || !["scheduled", "waiting_for_operational_reset"].includes(record.state)) return record;
  const admission = operationalRecoveryAdmission(record.intent.runId, policy);
  if (!admission.admitted) {
    return waitCanonicalAnalysisRecoveryIntentForOperationalReset(record.intent.intentId, admission.reasonCode);
  }
  return admitCanonicalAnalysisRecoveryIntentAfterOperationalReset(record.intent.intentId);
}

function operationalRecoveryAdmission(runId: string, policy: CanonicalAdaptiveOperationalPolicy):
  { admitted: true } | { admitted: false; reasonCode: string } {
  const state = getPersistedAnalysisRun(runId)?.continuationRevisions.at(-1);
  if (!state || policy.authority !== "deployment_emergency_circuit_breaker_only"
    || policy.analyticalCompletionAuthority !== "none" || policy.maximumConcurrentWork !== 1) {
    return { admitted: false, reasonCode: "recovery_operational_policy_invalid_waiting_for_reset" };
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
  const bounded = Math.max(0, delayMs);
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
