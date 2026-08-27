import type { CanonicalAutonomousResearchLifecycle, CanonicalContinuationResourceAccounting } from "./adaptiveContinuationTypes.js";
import type { CanonicalRgWorkItem } from "./rgWorkLedger.js";

export const ADAPTIVE_EXECUTION_SCHEMA_VERSION = "canonical_adaptive_execution_v1" as const;

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
  completion: "trustworthy_complete" | "stopped_unresolved" | "stopped_operationally" | "reconciliation_required";
};
