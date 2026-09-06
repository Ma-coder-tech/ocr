import { createHash } from "node:crypto";

import { db } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalAdaptiveOperationalPolicy, CanonicalOperationalAllowancePolicyV1 } from "./adaptiveExecutionTypes.js";
import type { CanonicalRgOperation } from "./rgWorkLedger.js";

export type CanonicalOperationalAllowanceDecision = {
  admitted: boolean;
  kind: "available" | "temporarily_unavailable" | "exceptional_runaway_hold";
  nextEligibleAt: string | null;
  reasonCode: string;
  policyHash: string;
  available: { providerCalls: number; retrievalBytes: number; activeElapsedMs: number; providerCostUsd: number };
  historical: { providerCalls: number; retrievalBytes: number; elapsedMs: number; providerCostUsd: number };
  analyticalCompletionEffect: "none";
};

type Consumption = { atMs: number; amount: number };

export function canonicalOperationalAllowanceDecision(
  runId: string,
  policy: CanonicalAdaptiveOperationalPolicy,
  atMs = Date.now(),
): CanonicalOperationalAllowanceDecision | null {
  const allowance = policy.operationalAllowance;
  if (!allowance) return null;
  validateAllowancePolicy(policy, allowance);
  const operations = operationRows(runId);
  const sentEvents = db.prepare(`SELECT operation_id, created_at FROM canonical_rg_execution_events
    WHERE run_id = ? AND event_type = 'operation_sent' ORDER BY created_at, event_id`).all(runId) as
    Array<{ operation_id: string | null; created_at: string }>;
  const providerConsumptions: Consumption[] = sentEvents
    .filter((event) => event.operation_id !== null)
    .map((event) => ({ atMs: validTime(event.created_at), amount: 1 }));
  const retrievalConsumptions: Consumption[] = operations.filter((operation) => operation.receipt.retrievalBytes > 0)
    .map((operation) => ({ atMs: validTime(operation.updatedAt), amount: operation.receipt.retrievalBytes }));
  const elapsedConsumptions: Consumption[] = operations
    .filter((operation) => operation.receipt.calls > 0
      && ["completed", "provider_rejected", "failed_before_send"].includes(operation.state))
    .map((operation) => ({ atMs: validTime(operation.updatedAt),
      amount: Math.max(0, validTime(operation.updatedAt) - validTime(operation.createdAt)) }));
  const costConsumptions: Consumption[] = operations
    .filter((operation) => typeof operation.receipt.providerDiagnostics?.usageCostUsd === "number"
      && operation.receipt.providerDiagnostics.usageCostUsd > 0)
    .map((operation) => ({ atMs: validTime(operation.updatedAt),
      amount: operation.receipt.providerDiagnostics!.usageCostUsd! }));
  const historical = {
    providerCalls: providerConsumptions.reduce((sum, item) => sum + item.amount, 0),
    retrievalBytes: retrievalConsumptions.reduce((sum, item) => sum + item.amount, 0),
    elapsedMs: elapsedConsumptions.reduce((sum, item) => sum + item.amount, 0),
    providerCostUsd: costConsumptions.reduce((sum, item) => sum + item.amount, 0),
  };
  const policyHash = digest(allowance);
  if (historical.providerCalls >= allowance.exceptionalMaximumHistoricalProviderCalls
    || historical.retrievalBytes >= allowance.exceptionalMaximumHistoricalRetrievalBytes
    || historical.elapsedMs >= allowance.exceptionalMaximumHistoricalElapsedMs
    || historical.providerCostUsd >= allowance.exceptionalMaximumHistoricalProviderCostUsd) {
    return { admitted: false, kind: "exceptional_runaway_hold", nextEligibleAt: null,
      reasonCode: "rg_exceptional_operational_runaway_guard_reached_not_analytical_completion", policyHash,
      available: { providerCalls: 0, retrievalBytes: 0, activeElapsedMs: 0, providerCostUsd: 0 }, historical,
      analyticalCompletionEffect: "none" };
  }
  const calls = bucket(providerConsumptions, allowance.providerCallBurstCapacity,
    allowance.providerCallRefillPerMinute, atMs);
  const bytes = bucket(retrievalConsumptions, allowance.retrievalByteBurstCapacity,
    allowance.retrievalByteRefillPerMinute, atMs);
  const elapsed = bucket(elapsedConsumptions, allowance.activeElapsedMsBurstCapacity,
    allowance.activeElapsedMsRefillPerMinute, atMs);
  const cost = bucket(costConsumptions, allowance.providerCostUsdBurstCapacity,
    allowance.providerCostUsdRefillPerMinute, atMs, allowance.providerCostUsdMinimumDispatchAllowance);
  const nextMs = Math.max(calls.nextEligibleMs, bytes.nextEligibleMs, elapsed.nextEligibleMs, cost.nextEligibleMs);
  const available = { providerCalls: calls.available, retrievalBytes: bytes.available,
    activeElapsedMs: elapsed.available, providerCostUsd: cost.available };
  if (calls.available < 1 || bytes.available < 1 || elapsed.available < 1
    || cost.available < allowance.providerCostUsdMinimumDispatchAllowance) {
    return { admitted: false, kind: "temporarily_unavailable", nextEligibleAt: new Date(nextMs).toISOString(),
      reasonCode: "rg_operational_allowance_temporarily_unavailable_not_analytical_completion", policyHash,
      available, historical, analyticalCompletionEffect: "none" };
  }
  return { admitted: true, kind: "available", nextEligibleAt: new Date(atMs).toISOString(),
    reasonCode: "rg_operational_allowance_available", policyHash, available, historical,
    analyticalCompletionEffect: "none" };
}

function bucket(consumptions: Consumption[], capacity: number, refillPerMinute: number, atMs: number,
  minimum = 1):
  { available: number; nextEligibleMs: number } {
  let available = capacity;
  let priorMs = consumptions.length > 0 ? Math.min(consumptions[0]!.atMs, atMs) : atMs;
  for (const item of consumptions.sort((left, right) => left.atMs - right.atMs)) {
    if (item.atMs > atMs) break;
    available = Math.min(capacity, available + ((Math.max(0, item.atMs - priorMs) * refillPerMinute) / 60_000));
    available -= item.amount;
    priorMs = item.atMs;
  }
  available = Math.min(capacity, available + ((Math.max(0, atMs - priorMs) * refillPerMinute) / 60_000));
  if (available >= minimum) return { available, nextEligibleMs: atMs };
  const waitMs = Math.ceil(((minimum - available) * 60_000) / refillPerMinute);
  return { available, nextEligibleMs: atMs + waitMs };
}

function operationRows(runId: string): CanonicalRgOperation[] {
  return (db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ? ORDER BY created_at, operation_id`)
    .all(runId) as Array<{ operation_json: string }>).map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation);
}

function validateAllowancePolicy(policy: CanonicalAdaptiveOperationalPolicy,
  allowance: CanonicalOperationalAllowancePolicyV1): void {
  const positive = [allowance.providerCallBurstCapacity, allowance.providerCallRefillPerMinute,
    allowance.retrievalByteBurstCapacity, allowance.retrievalByteRefillPerMinute,
    allowance.activeElapsedMsBurstCapacity, allowance.activeElapsedMsRefillPerMinute,
    allowance.providerCostUsdBurstCapacity, allowance.providerCostUsdRefillPerMinute,
    allowance.providerCostUsdMinimumDispatchAllowance,
    allowance.exceptionalMaximumHistoricalProviderCalls, allowance.exceptionalMaximumHistoricalRetrievalBytes,
    allowance.exceptionalMaximumHistoricalElapsedMs, allowance.exceptionalMaximumHistoricalProviderCostUsd];
  if (allowance.schemaVersion !== "canonical_operational_allowance_policy_v1"
    || allowance.semantics !== "dispatch_permission_only_not_analytical_completion"
    || positive.some((value) => !Number.isFinite(value) || value <= 0)
    || allowance.exceptionalMaximumHistoricalProviderCalls <= allowance.providerCallBurstCapacity
    || allowance.exceptionalMaximumHistoricalRetrievalBytes <= allowance.retrievalByteBurstCapacity
    || allowance.exceptionalMaximumHistoricalElapsedMs <= allowance.activeElapsedMsBurstCapacity
    || allowance.exceptionalMaximumHistoricalProviderCostUsd <= allowance.providerCostUsdBurstCapacity
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(allowance.providerConfigurationRevision)
    || policy.maximumConcurrentWork !== 1) throw new Error("canonical_operational_allowance_policy_invalid");
}

function validTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("canonical_operational_allowance_history_time_invalid");
  return parsed;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
