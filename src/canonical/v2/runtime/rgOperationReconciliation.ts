import { createHash } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import {
  appendCanonicalRgExecutionEvent,
  projectCanonicalRgReconciledOperationResult,
  type CanonicalRgEvidenceExecutionPorts,
  type RgEvidencePortReceipt,
} from "./rgEvidenceExecution.js";
import {
  assertClaimedCanonicalRgReconciliationIntent,
  recordCanonicalRgReconciliationLookup,
} from "./rgOperationReconciliationStore.js";
import {
  RG_OPERATION_RECONCILIATION_SCHEMA_VERSION,
  type CanonicalRgReconciliationLookupReceipt,
  type CanonicalRgReconciliationOutcome,
  type CanonicalRgReconciliationProof,
} from "./rgOperationReconciliationTypes.js";
import type { CanonicalRgOperation, CanonicalRgWorkItem } from "./rgWorkLedger.js";

export type CanonicalRgReconciliationCycleResult = {
  runId: string;
  intentId: string;
  status: "resolved_all" | "pending" | "unsupported";
  resolvedOperationIds: string[];
  resumedWorkItemIds: string[];
  lookupCalls: number;
  originalProviderSends: 0;
};

export async function reconcileClaimedCanonicalRgOperations(input: {
  runId: string;
  intentId: string;
  workerId: string;
  ports: CanonicalRgEvidenceExecutionPorts;
}): Promise<CanonicalRgReconciliationCycleResult> {
  const record = assertClaimedCanonicalRgReconciliationIntent(input.intentId, input.workerId);
  if (record.intent.runId !== input.runId) throw new Error("canonical_rg_reconciliation_run_mismatch");
  const port = input.ports.reconciliation;
  const portCapability = port?.capability;
  const capability = input.ports.reconciliationCapability ?? portCapability;
  if (!port || !portCapability || !capability || canonicalJson(portCapability) !== canonicalJson(capability)
    || capability.mode !== "provider_authenticated_original_operation_lookup"
    || capability.originalOperationResend !== "prohibited"
    || capability.merchantPrivateContextTransmission !== "none"
    || capability.lookupRepeatability !== "side_effect_free_status_lookup_only") {
    recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_unsupported",
      "trusted_original_operation_lookup_capability_unavailable");
    return result(input, "unsupported", [], [], 0);
  }

  const resolvedOperationIds: string[] = [];
  let lookupCalls = 0;
  let unsupported = false;
  for (const bound of record.intent.operations) {
    const operation = operationFromDb(input.runId, bound.operationId);
    if (!operation) throw new Error("canonical_rg_reconciliation_bound_operation_missing");
    if (operation.state !== "indeterminate_after_send") {
      if (!reconciliationResolutionEventValid(input.runId, operation)) {
        throw new Error("canonical_rg_reconciliation_resolution_lineage_missing");
      }
      resolvedOperationIds.push(operation.operationId);
      continue;
    }
    let outcome: CanonicalRgReconciliationOutcome;
    try {
      outcome = await port.reconcileOriginalOperation({ runId: input.runId, operationId: operation.operationId,
        workItemId: operation.workItemId, atomicClaimId: operation.atomicClaimId, kind: operation.kind,
        inputHash: operation.inputHash, providerCode: operation.receipt.providerCode,
        providerRequestId: operation.receipt.providerRequestId! });
    } catch (error) {
      recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_failed", safeReason(error));
      continue;
    }
    if (!outcome || !["completed", "not_executed", "pending", "unsupported"].includes(outcome.status)) {
      recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_failed",
        "original_operation_reconciliation_outcome_invalid");
      continue;
    }
    if (outcome.status === "unsupported") {
      recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_unsupported",
        safeReason(outcome.reasonCode));
      unsupported = true;
      continue;
    }
    if (!validLookupReceipt(outcome.lookupReceipt)) {
      lookupCalls += 1;
      appendCanonicalRgExecutionEvent(input.runId, operation.workItemId, operation.operationId,
        "operation_reconciliation_lookup_accounted", {
          intentId: input.intentId,
          lookupReceipt: { providerCode: "unverified_reconciliation_lookup_receipt", calls: 1, tokens: null },
          originalOperationResent: false, merchantPrivateContextTransmitted: false,
          accountingLimitationCode: "reconciliation_lookup_receipt_invalid",
        });
      recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_failed",
        "original_operation_reconciliation_lookup_receipt_invalid");
      continue;
    }
    lookupCalls += outcome.lookupReceipt.calls;
    appendCanonicalRgExecutionEvent(input.runId, operation.workItemId, operation.operationId,
      "operation_reconciliation_lookup_accounted", {
        intentId: input.intentId, lookupReceipt: outcome.lookupReceipt,
        originalOperationResent: false, merchantPrivateContextTransmitted: false,
      });
    if (!validProof(outcome.proof, operation, outcome.status)) {
      recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_failed",
        "original_operation_reconciliation_proof_invalid");
      continue;
    }
    if (outcome.status === "pending") {
      appendCanonicalRgExecutionEvent(input.runId, operation.workItemId, operation.operationId,
        "operation_reconciliation_pending", safeProofProjection(outcome.proof));
      recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_pending",
        "provider_proves_original_operation_still_pending");
      continue;
    }
    if (outcome.status === "completed") {
      if (!validOriginalReceipt(outcome.originalReceipt, operation)) {
        recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_failed",
          "reconciled_original_receipt_binding_invalid");
        continue;
      }
      const projected = projectCanonicalRgReconciledOperationResult(operation.kind, outcome.result);
      resolveOperation(input.runId, operation, "completed", projected, outcome.originalReceipt,
        outcome.proof, input.intentId);
    } else {
      resolveOperation(input.runId, operation, "failed_before_send", null, null,
        outcome.proof, input.intentId);
    }
    recordCanonicalRgReconciliationLookup(input.intentId, input.workerId, "lookup_resolved",
      outcome.status === "completed" ? "original_operation_completed_result_recovered"
        : "provider_proved_original_operation_not_executed");
    resolvedOperationIds.push(operation.operationId);
  }

  const remaining = record.intent.operations.filter((bound) =>
    operationFromDb(input.runId, bound.operationId)?.state === "indeterminate_after_send");
  if (remaining.length > 0) return result(input, unsupported ? "unsupported" : "pending",
    resolvedOperationIds, [], lookupCalls);
  const resumedWorkItemIds = reopenResolvedWorkItems(input.runId, record.intent.operations.map((item) => item.workItemId),
    input.intentId);
  return result(input, "resolved_all", resolvedOperationIds, resumedWorkItemIds, lookupCalls);
}

export function canonicalRgReconciliationProofFingerprint(
  proof: Omit<CanonicalRgReconciliationProof, "proofFingerprint">,
): string {
  return digest(proof);
}

function resolveOperation(
  runId: string,
  operation: CanonicalRgOperation,
  state: "completed" | "failed_before_send",
  projectedResult: unknown | null,
  receipt: RgEvidencePortReceipt | null,
  proof: CanonicalRgReconciliationProof,
  intentId: string,
): void {
  const current = operationFromDb(runId, operation.operationId);
  if (!current || current.state !== "indeterminate_after_send" || current.inputHash !== operation.inputHash) {
    throw new Error("canonical_rg_reconciliation_operation_concurrent_transition");
  }
  const updated: CanonicalRgOperation = { ...current, state, result: projectedResult,
    receipt: { ...current.receipt,
      completionState: state === "completed" ? "completed" : "failed",
      providerCode: receipt?.providerCode ?? current.receipt.providerCode,
      providerRequestId: receipt?.providerRequestId ?? current.receipt.providerRequestId,
      calls: current.receipt.calls,
      tokens: receipt?.tokens ?? current.receipt.tokens,
      retrievalBytes: receipt?.retrievalBytes ?? current.receipt.retrievalBytes,
      reasonCode: state === "completed" ? "rg_operation_completed_by_trusted_reconciliation"
        : "rg_operation_reconciled_not_executed_retry_permitted",
    }, updatedAt: nowIso() };
  db.transaction(() => {
    const changed = db.prepare(`UPDATE canonical_rg_operations SET state = ?, operation_json = ?, updated_at = ?
      WHERE run_id = ? AND operation_id = ? AND plan_hash = ? AND state = 'indeterminate_after_send'
        AND operation_json = ?`).run(updated.state, JSON.stringify(updated), updated.updatedAt,
      runId, updated.operationId, updated.planHash, JSON.stringify(current));
    if (changed.changes !== 1) throw new Error("canonical_rg_reconciliation_operation_concurrent_transition");
    appendCanonicalRgExecutionEvent(runId, updated.workItemId, updated.operationId,
      state === "completed" ? "operation_reconciled_completed" : "operation_reconciled_not_executed", {
        intentId, proof: safeProofProjection(proof), resultHash: projectedResult === null ? null : digest(projectedResult),
        originalOperationResent: false,
      });
  })();
}

function reopenResolvedWorkItems(runId: string, workItemIds: string[], intentId: string): string[] {
  const reopened: string[] = [];
  for (const workItemId of [...new Set(workItemIds)].sort()) {
    const current = workItemFromDb(runId, workItemId);
    if (!current || current.executionState !== "indeterminate_after_send") continue;
    const indeterminate = db.prepare(`SELECT 1 FROM canonical_rg_operations
      WHERE run_id = ? AND work_item_id = ? AND state = 'indeterminate_after_send' LIMIT 1`).get(runId, workItemId);
    if (indeterminate) continue;
    const updated: CanonicalRgWorkItem = { ...current, state: "planned",
      executionState: "planned_for_durable_execution", reservation: null,
      progress: { ...current.progress, state: "not_started" }, stopReason: null };
    db.transaction(() => {
      const changed = db.prepare(`UPDATE canonical_rg_work_items SET state = ?, execution_state = ?,
        work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ? AND work_item_json = ?`)
        .run(updated.state, updated.executionState, JSON.stringify(updated), nowIso(), runId,
          workItemId, JSON.stringify(current));
      if (changed.changes !== 1) throw new Error("canonical_rg_reconciliation_work_reopen_conflict");
      appendCanonicalRgExecutionEvent(runId, workItemId, null, "work_reopened_after_operation_reconciliation", {
        intentId, operationIds: operationIdsForWork(runId, workItemId), originalOperationResent: false,
      });
    })();
    reopened.push(workItemId);
  }
  return reopened;
}

function validProof(
  proof: CanonicalRgReconciliationProof,
  operation: CanonicalRgOperation,
  status: Exclude<CanonicalRgReconciliationOutcome["status"], "unsupported">,
): boolean {
  if (!proof || !["completed", "not_executed", "pending"].includes(status)
    || proof.schemaVersion !== RG_OPERATION_RECONCILIATION_SCHEMA_VERSION
    || !safeId(proof.proofId) || proof.operationId !== operation.operationId
    || proof.inputHash !== operation.inputHash || proof.providerCode !== operation.receipt.providerCode
    || !operation.receipt.providerRequestId || proof.providerRequestId !== operation.receipt.providerRequestId
    || !validIso(proof.observedAt) || proof.authority !== "provider_authenticated_original_operation_lookup"
    || proof.originalOperationStatus !== status || proof.originalOperationResent !== false
    || proof.merchantPrivateContextTransmitted !== false || !/^[a-f0-9]{64}$/.test(proof.proofFingerprint)) return false;
  const { proofFingerprint: _proofFingerprint, ...base } = proof;
  return proof.proofFingerprint === canonicalRgReconciliationProofFingerprint(base);
}

function validOriginalReceipt(receipt: unknown, operation: CanonicalRgOperation): receipt is RgEvidencePortReceipt {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Partial<RgEvidencePortReceipt>;
  return value.providerCode === operation.receipt.providerCode
    && value.providerRequestId === operation.receipt.providerRequestId
    && value.calls === 1 && (value.tokens === null || (Number.isSafeInteger(value.tokens) && Number(value.tokens) >= 0))
    && Number.isSafeInteger(value.retrievalBytes) && Number(value.retrievalBytes) >= 0;
}

function validLookupReceipt(receipt: unknown): receipt is CanonicalRgReconciliationLookupReceipt {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Partial<CanonicalRgReconciliationLookupReceipt>;
  return safeId(value.providerCode) && value.calls === 1
    && (value.tokens === null || (Number.isSafeInteger(value.tokens) && Number(value.tokens) >= 0));
}

function reconciliationResolutionEventValid(runId: string, operation: CanonicalRgOperation): boolean {
  const row = db.prepare(`SELECT event_type, event_json, event_hash FROM canonical_rg_execution_events
    WHERE run_id = ? AND operation_id = ? AND event_type IN
      ('operation_reconciled_completed', 'operation_reconciled_not_executed') ORDER BY rowid DESC LIMIT 1`)
    .get(runId, operation.operationId) as { event_type: string; event_json: string; event_hash: string } | undefined;
  if (!row) return false;
  const event = JSON.parse(row.event_json) as unknown;
  return row.event_hash === digest({ runId, workItemId: operation.workItemId,
    operationId: operation.operationId, eventType: row.event_type, event });
}

function safeProofProjection(proof: CanonicalRgReconciliationProof): CanonicalRgReconciliationProof {
  return structuredClone(proof);
}

function operationFromDb(runId: string, operationId: string): CanonicalRgOperation | null {
  const row = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ? AND operation_id = ?`)
    .get(runId, operationId) as { operation_json: string } | undefined;
  return row ? JSON.parse(row.operation_json) as CanonicalRgOperation : null;
}

function workItemFromDb(runId: string, workItemId: string): CanonicalRgWorkItem | null {
  const row = db.prepare(`SELECT work_item_json FROM canonical_rg_work_items WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, workItemId) as { work_item_json: string } | undefined;
  return row ? JSON.parse(row.work_item_json) as CanonicalRgWorkItem : null;
}

function operationIdsForWork(runId: string, workItemId: string): string[] {
  return (db.prepare(`SELECT operation_id FROM canonical_rg_operations WHERE run_id = ? AND work_item_id = ?
    ORDER BY created_at, operation_id`).all(runId, workItemId) as Array<{ operation_id: string }>).map((row) => row.operation_id);
}

function result(input: { runId: string; intentId: string }, status: CanonicalRgReconciliationCycleResult["status"],
  resolvedOperationIds: string[], resumedWorkItemIds: string[], lookupCalls: number): CanonicalRgReconciliationCycleResult {
  return { runId: input.runId, intentId: input.intentId, status,
    resolvedOperationIds: [...new Set(resolvedOperationIds)].sort(),
    resumedWorkItemIds: [...new Set(resumedWorkItemIds)].sort(), lookupCalls, originalProviderSends: 0 };
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
}

function safeReason(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 191) || "rg_reconciliation_lookup_failed";
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
