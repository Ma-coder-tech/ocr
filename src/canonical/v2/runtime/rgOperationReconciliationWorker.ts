import { randomUUID } from "node:crypto";

import { executeDurableCanonicalAdaptiveLoop } from "./adaptiveExecution.js";
import type { CanonicalAdaptiveExecutionResult } from "./adaptiveExecutionTypes.js";
import type { CanonicalRgEvidenceExecutionPorts } from "./rgEvidenceExecution.js";
import { createProductionRgEvidencePortsFromEnvironment } from "./rgLiveEvidencePorts.js";
import {
  claimCanonicalRgReconciliationIntent,
  ensureCanonicalRgReconciliationIntent,
  getCanonicalRgReconciliationIntent,
  getNextCanonicalRgReconciliationDelayMs,
  listCanonicalRunsRequiringRgReconciliation,
  listDueCanonicalRgReconciliationIntents,
  releaseCanonicalRgReconciliationIntentAfterFailure,
  settleCanonicalRgReconciliationIntentAfterCycle,
} from "./rgOperationReconciliationStore.js";

const queue = new Set<string>();
let busy = false;
let tickScheduled = false;
let delayedTick: ReturnType<typeof setTimeout> | null = null;
let delayedTickAt = 0;

export function enqueueCanonicalRgOperationReconciliation(
  runId: string,
  ports = createProductionRgEvidencePortsFromEnvironment(runId),
): void {
  const intent = ensureCanonicalRgReconciliationIntent(runId, ports);
  if (intent && Date.parse(intent.nextRunAt) <= Date.now()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export function hydrateCanonicalRgOperationReconciliationIntents(): void {
  for (const runId of listCanonicalRunsRequiringRgReconciliation()) {
    const ports = createProductionRgEvidencePortsFromEnvironment(runId);
    ensureCanonicalRgReconciliationIntent(runId, ports);
  }
  for (const intent of listDueCanonicalRgReconciliationIntents()) queue.add(intent.intent.intentId);
  scheduleFromDurableState();
}

export async function processCanonicalRgOperationReconciliationIntent(input: {
  intentId: string;
  workerId?: string;
  ports?: CanonicalRgEvidenceExecutionPorts;
}): Promise<CanonicalAdaptiveExecutionResult | null> {
  const workerId = input.workerId ?? `canonical-rg-reconciliation-worker-${randomUUID()}`;
  const claimed = claimCanonicalRgReconciliationIntent(input.intentId, workerId);
  if (!claimed) return null;
  try {
    const ports = input.ports ?? createProductionRgEvidencePortsFromEnvironment(claimed.intent.runId);
    const result = await executeDurableCanonicalAdaptiveLoop({ runId: claimed.intent.runId,
      workerId, ports, reconciliationIntentId: claimed.intent.intentId });
    settleCanonicalRgReconciliationIntentAfterCycle(claimed.intent.intentId, workerId);
    enqueueCanonicalRgOperationReconciliation(claimed.intent.runId, ports);
    return result;
  } catch (error) {
    releaseCanonicalRgReconciliationIntentAfterFailure(claimed.intent.intentId, workerId, safeReason(error));
    throw error;
  }
}

async function tick(): Promise<void> {
  if (busy) return;
  for (const intent of listDueCanonicalRgReconciliationIntents()) queue.add(intent.intent.intentId);
  const intentId = queue.values().next().value as string | undefined;
  if (!intentId) {
    scheduleFromDurableState();
    return;
  }
  queue.delete(intentId);
  busy = true;
  try { await processCanonicalRgOperationReconciliationIntent({ intentId }); }
  catch (error) {
    const intent = getCanonicalRgReconciliationIntent(intentId);
    console.error("[canonical-rg-reconciliation-degraded]", {
      runId: intent?.intent.runId ?? null, intentId, reason: safeReason(error),
    });
  } finally {
    busy = false;
    scheduleTick();
  }
}

function scheduleFromDurableState(): void {
  for (const intent of listDueCanonicalRgReconciliationIntents()) queue.add(intent.intent.intentId);
  if (queue.size > 0) { scheduleTick(); return; }
  const delayMs = getNextCanonicalRgReconciliationDelayMs();
  if (delayMs !== null) scheduleTickAfter(delayMs);
}

function scheduleTick(): void {
  if (delayedTick) { clearTimeout(delayedTick); delayedTick = null; delayedTickAt = 0; }
  if (tickScheduled) return;
  tickScheduled = true;
  setTimeout(() => { tickScheduled = false; void tick(); }, 0);
}

function scheduleTickAfter(delayMs: number): void {
  const bounded = Math.max(0, delayMs);
  if (bounded === 0) { scheduleTick(); return; }
  const targetAt = Date.now() + bounded;
  if (delayedTick && delayedTickAt <= targetAt) return;
  if (delayedTick) clearTimeout(delayedTick);
  delayedTickAt = targetAt;
  delayedTick = setTimeout(() => { delayedTick = null; delayedTickAt = 0; scheduleTick(); }, bounded);
  delayedTick.unref?.();
}

function safeReason(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 240) || "canonical_rg_reconciliation_unknown_failure";
}
