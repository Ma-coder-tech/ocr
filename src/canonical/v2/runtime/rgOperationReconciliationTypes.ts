import type { CanonicalRgOperation } from "./rgWorkLedger.js";

export const RG_OPERATION_RECONCILIATION_SCHEMA_VERSION = "canonical_rg_operation_reconciliation_v1" as const;

export type CanonicalRgReconciliationCapability = {
  mode: "unsupported" | "provider_authenticated_original_operation_lookup";
  reasonCodes: string[];
  originalOperationResend: "prohibited";
  merchantPrivateContextTransmission: "none";
  lookupRepeatability: "side_effect_free_status_lookup_only";
};

export type CanonicalRgReconciliationProof = {
  schemaVersion: typeof RG_OPERATION_RECONCILIATION_SCHEMA_VERSION;
  proofId: string;
  operationId: string;
  inputHash: string;
  providerCode: string;
  providerRequestId: string;
  observedAt: string;
  authority: "provider_authenticated_original_operation_lookup";
  originalOperationStatus: "completed" | "not_executed" | "pending";
  originalOperationResent: false;
  merchantPrivateContextTransmitted: false;
  proofFingerprint: string;
};

export type CanonicalRgReconciliationLookupReceipt = {
  providerCode: string;
  calls: 1;
  tokens: number | null;
};

export type CanonicalRgReconciliationOutcome =
  | { status: "completed"; proof: CanonicalRgReconciliationProof; result: unknown;
      originalReceipt: { providerCode: string; providerRequestId: string; calls: 1;
        tokens: number | null; retrievalBytes: number }; lookupReceipt: CanonicalRgReconciliationLookupReceipt }
  | { status: "not_executed"; proof: CanonicalRgReconciliationProof;
      lookupReceipt: CanonicalRgReconciliationLookupReceipt }
  | { status: "pending"; proof: CanonicalRgReconciliationProof;
      lookupReceipt: CanonicalRgReconciliationLookupReceipt }
  | { status: "unsupported"; reasonCode: string };

export type CanonicalRgOperationReconciliationPort = {
  capability: CanonicalRgReconciliationCapability;
  reconcileOriginalOperation(input: {
    runId: string;
    operationId: string;
    workItemId: string;
    atomicClaimId: string;
    kind: CanonicalRgOperation["kind"];
    inputHash: string;
    providerCode: string;
    providerRequestId: string;
  }): Promise<CanonicalRgReconciliationOutcome>;
};

export type CanonicalRgReconciliationIntent = {
  schemaVersion: typeof RG_OPERATION_RECONCILIATION_SCHEMA_VERSION;
  intentId: string;
  intentHash: string;
  runId: string;
  binding: {
    outcomeRevision: number;
    outcomeHash: string;
    sourceFingerprint: string;
    financialFoundationHash: string | null;
    semanticRevision: number;
    semanticHash: string | null;
    canonicalStateHash: string | null;
    planHash: string;
    planGeneration: number;
    executionGeneration: number;
    continuationRevision: number;
    continuationStateHash: string;
    rfSnapshotHash: string;
  };
  operations: Array<{
    operationId: string;
    workItemId: string;
    atomicClaimId: string;
    kind: CanonicalRgOperation["kind"];
    inputHash: string;
    providerCode: string;
    providerRequestId: string;
  }>;
  authorization: "reconcile_original_operations_only";
  originalOperationResend: "prohibited";
  analyticalCompletionEffect: "none";
  customerReportAuthority: "legacy_report_unchanged";
  createdAt: string;
};

export type CanonicalRgReconciliationIntentState = "scheduled" | "leased" | "completed" | "unsupported" | "superseded";

export type CanonicalRgReconciliationRecord = {
  intent: CanonicalRgReconciliationIntent;
  state: CanonicalRgReconciliationIntentState;
  nextRunAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  dispatchCount: number;
  latestEventSequence: number;
  latestEventHash: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalRgReconciliationEvent = {
  eventId: string;
  intentId: string;
  eventSequence: number;
  parentEventHash: string | null;
  eventType: "scheduled" | "leased" | "lease_recovered" | "lease_renewed" | "lookup_pending"
    | "lookup_failed" | "lookup_unsupported" | "lookup_resolved" | "rescheduled_pending"
    | "completed" | "unsupported" | "superseded" | "released_after_failure";
  fromState: CanonicalRgReconciliationIntentState | null;
  toState: CanonicalRgReconciliationIntentState;
  workerId: string | null;
  reasonCode: string;
  occurredAt: string;
  eventHash: string;
};
