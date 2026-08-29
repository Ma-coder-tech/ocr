import { randomUUID } from "node:crypto";

import { executeDurableCanonicalAdaptiveLoop } from "./adaptiveExecution.js";
import type { CanonicalAdaptiveExecutionResult } from "./adaptiveExecutionTypes.js";
import type { CanonicalRgEvidenceExecutionPorts } from "./rgEvidenceExecution.js";
import { createProductionRgEvidencePortsFromEnvironment } from "./rgLiveEvidencePorts.js";
import {
  claimCanonicalAnalysisRecoveryIntent,
  settleCanonicalAnalysisRecoveryIntentAfterCycle,
  ensureCanonicalAnalysisRecoveryIntent,
  getCanonicalAnalysisRecoveryIntent,
  getNextCanonicalAnalysisRecoveryDelayMs,
  listDueCanonicalAnalysisRecoveryIntents,
  reconcileCanonicalAnalysisRecoveryIntents,
  releaseCanonicalAnalysisRecoveryIntentAfterFailure,
} from "./adaptiveRecoveryStore.js";

const queue = new Set<string>();
let busy = false;
let tickScheduled = false;
let delayedTick: ReturnType<typeof setTimeout> | null = null;
let delayedTickAt = 0;

export function enqueueCanonicalAnalysisRecovery(runId: string): void {
  const intent = ensureCanonicalAnalysisRecoveryIntent(runId);
  if (intent && Date.parse(intent.nextRunAt) <= Date.now()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export function hydrateCanonicalAnalysisRecoveryIntents(): void {
  reconcileCanonicalAnalysisRecoveryIntents();
  for (const intent of listDueCanonicalAnalysisRecoveryIntents()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export async function processCanonicalAnalysisRecoveryIntent(input: {
  intentId: string;
  workerId?: string;
  ports?: CanonicalRgEvidenceExecutionPorts;
}): Promise<CanonicalAdaptiveExecutionResult | null> {
  const workerId = input.workerId ?? `canonical-recovery-worker-${randomUUID()}`;
  const claimed = claimCanonicalAnalysisRecoveryIntent(input.intentId, workerId);
  if (!claimed) return null;
  try {
    const result = await executeDurableCanonicalAdaptiveLoop({
      runId: claimed.intent.runId,
      workerId,
      ports: input.ports ?? createProductionRgEvidencePortsFromEnvironment(claimed.intent.runId),
      recoveryIntentId: claimed.intent.intentId,
    });
    settleCanonicalAnalysisRecoveryIntentAfterCycle(claimed.intent.intentId, workerId);
    ensureCanonicalAnalysisRecoveryIntent(claimed.intent.runId);
    return result;
  } catch (error) {
    releaseCanonicalAnalysisRecoveryIntentAfterFailure(claimed.intent.intentId, workerId, safeReason(error));
    throw error;
  }
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
