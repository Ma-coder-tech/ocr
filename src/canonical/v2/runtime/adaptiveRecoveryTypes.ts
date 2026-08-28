export const ADAPTIVE_RECOVERY_SCHEMA_VERSION = "canonical_analysis_recovery_v1" as const;

export type CanonicalAnalysisRecoveryIntent = {
  schemaVersion: typeof ADAPTIVE_RECOVERY_SCHEMA_VERSION;
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
  authorization: {
    decisionId: string;
    atomicClaimId: string;
    facet: string;
    disposition: "operationally_degraded_retry_eligible";
    continuationPermission: "bounded_retry_eligible";
    degradationSubtype: "provider_unavailable_before_send" | "before_send_failure_retry_eligible";
  };
  analyticalCompletionEffect: "none";
  customerReportAuthority: "legacy_report_unchanged";
  createdAt: string;
};

export type CanonicalAnalysisRecoveryIntentState = "scheduled" | "leased" | "completed" | "superseded";

export type CanonicalAnalysisRecoveryRecord = {
  intent: CanonicalAnalysisRecoveryIntent;
  state: CanonicalAnalysisRecoveryIntentState;
  nextRunAt: string;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  dispatchCount: number;
  latestEventSequence: number;
  latestEventHash: string;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalAnalysisRecoveryEvent = {
  eventId: string;
  intentId: string;
  eventSequence: number;
  parentEventHash: string | null;
  eventType: "scheduled" | "leased" | "lease_recovered" | "completed" | "superseded" | "released_after_failure";
  fromState: CanonicalAnalysisRecoveryIntentState | null;
  toState: CanonicalAnalysisRecoveryIntentState;
  workerId: string | null;
  reasonCode: string;
  occurredAt: string;
  eventHash: string;
};
