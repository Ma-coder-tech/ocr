import type { CanonicalAutonomousResearchLifecycle, CanonicalContinuationResourceAccounting } from "./adaptiveContinuationTypes.js";
import type { CanonicalRgWorkItem } from "./rgWorkLedger.js";

export const ADAPTIVE_EXECUTION_SCHEMA_VERSION = "canonical_adaptive_execution_v1" as const;
export const AUTONOMOUS_OUTCOME_CHECKPOINT_SCHEMA_VERSION = "canonical_analysis_autonomous_outcome_checkpoint_v1" as const;

export type CanonicalAutonomousOutcomeCompletion =
  | "trustworthy_complete"
  | "stopped_unresolved"
  | "stopped_operationally"
  | "reconciliation_required";

export type CanonicalAutonomousOutcomeCheckpoint = {
  schemaVersion: typeof AUTONOMOUS_OUTCOME_CHECKPOINT_SCHEMA_VERSION;
  checkpointRevision: number;
  checkpointHash: string;
  runId: string;
  authority: "production_internal_canonical";
  checkpointKind: "settled" | "execution_interrupted";
  lifecycle: CanonicalAutonomousResearchLifecycle;
  completion: CanonicalAutonomousOutcomeCompletion | null;
  binding: {
    sourceFingerprint: string;
    rfSnapshotHash: string;
    rfContextHash: string;
    financialFoundationHash: string | null;
    semanticHash: string | null;
    canonicalStateHash: string | null;
    semanticRevision: number;
    planHash: string | null;
    planGeneration: number;
    executionGeneration: number;
    continuationRevision: number;
    continuationStateHash: string | null;
    rhArtifactHash: string | null;
  };
  continuationReasonCodes: string[];
  cumulativeResource: CanonicalContinuationResourceAccounting;
  continuationBindingStatus: "current" | "stale_at_interruption" | "unavailable_at_interruption";
  interruption: null | {
    phase: "adaptive_execution";
    reasonCode: "adaptive_execution_interrupted_before_outcome_settlement";
  };
  financialFoundationIntegrity: {
    cycleStartHash: string | null;
    cycleEndHash: string | null;
    preserved: boolean;
  };
  analysisRunStatusCompatibility: "pre_adaptive_status_meaning_unchanged";
  customerReportAuthority: "legacy_report_unchanged";
  createdAt: string;
};

export type CanonicalAutonomousOutcomeIntegrity = {
  status: "current" | "stale" | "not_checkpointed" | "invalid";
  reasonCodes: string[];
};

export type CanonicalAdaptiveOperationalPolicy = {
  authority: "deployment_emergency_circuit_breaker_only";
  analyticalCompletionAuthority: "none";
  maximumCumulativeProviderCalls: number;
  maximumCumulativeRetrievalBytes: number;
  maximumCumulativeElapsedMs: number;
  maximumConcurrentWork: 1;
};

export type CanonicalContinuationExecutionGrant = {
  schemaVersion: typeof ADAPTIVE_EXECUTION_SCHEMA_VERSION;
  grantId: string;
  runId: string;
  executionGeneration: number;
  controllerRevision: number;
  continuationStateHash: string;
  decisionId: string;
  disposition: "newly_eligible" | "justified_refinement";
  atomicClaimId: string;
  facet: string;
  binding: {
    semanticRevision: number;
    semanticHash: string | null;
    canonicalStateHash: string | null;
    planHash: string;
    planGeneration: number;
    rfSnapshotHash: string;
  };
  baseWorkItemId: string;
  priorWorkContractFingerprint: string;
  effectiveWorkContractFingerprint: string;
  effectiveWorkItem: CanonicalRgWorkItem;
  excludedDocumentFingerprints: string[];
  resourceBaseline: CanonicalContinuationResourceAccounting;
  operationalPolicy: CanonicalAdaptiveOperationalPolicy;
  providerExecution: "authorized_exact_claim_delta";
  analyticalCompletionEffect: "none";
  createdAt: string;
};

export type CanonicalAdaptiveExecutionResult = {
  schemaVersion: typeof ADAPTIVE_EXECUTION_SCHEMA_VERSION;
  runId: string;
  lifecycle: CanonicalAutonomousResearchLifecycle;
  controllerRevision: number;
  executionGeneration: number;
  executedGrantIds: string[];
  providerCallsObserved: number;
  semanticRevision: number;
  financialFoundationHashBefore: string | null;
  financialFoundationHashAfter: string | null;
  financialFoundationPreserved: true;
  customerReportAuthority: "legacy_report_unchanged";
  completion: CanonicalAutonomousOutcomeCompletion;
  outcomeCheckpointRevision: number;
  outcomeCheckpointHash: string;
};

export function canonicalAutonomousCompletionForLifecycle(
  lifecycle: CanonicalAutonomousResearchLifecycle,
): CanonicalAutonomousOutcomeCompletion {
  if (lifecycle === "trustworthy_completion_no_further_material_work"
    || lifecycle === "trustworthy_completion_with_safely_unresolved") return "trustworthy_complete";
  if (lifecycle === "indeterminate_reconciliation_required") return "reconciliation_required";
  if (lifecycle === "operational_degradation_blocks_judgment") return "stopped_operationally";
  return "stopped_unresolved";
}
