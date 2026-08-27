import type { CanonicalAtomicClaimFacet } from "./atomicClaims.js";
import type { CanonicalUnresolvedClaimClass } from "./unresolvedClaims.js";

export const ADAPTIVE_CONTINUATION_SCHEMA_VERSION = "canonical_adaptive_continuation_v1" as const;

export type CanonicalAutonomousResearchLifecycle =
  | "awaiting_first_pass_outcome"
  | "convergence_required"
  | "continuation_ready_provider_execution_disabled"
  | "trustworthy_completion_no_further_material_work"
  | "trustworthy_completion_with_safely_unresolved"
  | "continuation_judgment_unresolved"
  | "operational_degradation_blocks_judgment"
  | "indeterminate_reconciliation_required";

export type CanonicalContinuationDisposition =
  | "newly_eligible"
  | "justified_refinement"
  | "already_resolved"
  | "safely_unresolved"
  | "verified_but_canonically_unapplied"
  | "operationally_degraded_retry_eligible"
  | "operationally_degraded_reconciliation_required"
  | "operationally_degraded_withheld"
  | "not_eligible"
  | "continuation_uncertain_not_authorized"
  | "convergence_required";

export type CanonicalContinuationProgress = {
  kind:
    | "correct_authority_wrong_period"
    | "official_document_insufficient_locator_or_subsection"
    | "refinable_scope_mismatch";
  sourcePlanHash: string;
  workItemId: string;
  operationId: string;
  candidateId: string;
  documentFingerprint: string;
  authorityBindingId: string;
  remainingGap: string;
};

export type CanonicalContinuationOperationDelta = {
  kind: "period_refinement" | "locator_subsection_refinement" | "scope_refinement";
  priorWorkContractFingerprint: string;
  nextWorkContractFingerprint: string;
  priorEvidenceObjective: string;
  nextEvidenceObjective: string;
  requiredGap: CanonicalContinuationProgress["kind"];
  excludedDocumentFingerprints: string[];
  providerExecution: "disabled_for_this_slice";
};

export type CanonicalContinuationDegradation = {
  subtype:
    | "provider_unavailable_before_send"
    | "before_send_failure_retry_eligible"
    | "indeterminate_after_send"
    | "emergency_circuit_breaker"
    | "resource_or_runtime_exhaustion"
    | "other_operational_failure";
  continuationPermission: "bounded_retry_eligible" | "reconciliation_required" | "withheld_operationally";
  reasonCodes: string[];
};

export type CanonicalContinuationResourceAccounting = {
  providerCalls: number;
  searchCalls: number;
  aiCalls: number;
  tokensObserved: number;
  tokenAccountingComplete: boolean;
  retrievalBytes: number;
  retrievalDocuments: number;
  retries: number;
  operationReservations: number;
  workReservations: number;
  elapsedMsObserved: number;
  providerCodes: string[];
  terminalReasons: string[];
};

export type CanonicalClaimContinuationDecision = {
  decisionId: string;
  atomicClaimId: string;
  claimClass: CanonicalUnresolvedClaimClass;
  facet: CanonicalAtomicClaimFacet;
  currentPlanHash: string;
  currentWorkItemId: string | null;
  currentWorkContractFingerprint: string | null;
  priorWorkContractFingerprints: string[];
  disposition: CanonicalContinuationDisposition;
  materiality: "material" | "contextual" | "immaterial" | "unresolved";
  decisionTier: "D0" | "D1" | "D2";
  evidenceRefs: string[];
  progress: CanonicalContinuationProgress[];
  nextOperationDelta: CanonicalContinuationOperationDelta | null;
  degradation: CanonicalContinuationDegradation | null;
  cumulativeResource: CanonicalContinuationResourceAccounting;
  reasonCodes: string[];
  regeneratedProviderExecution: "disabled";
};

export type CanonicalAdaptiveContinuationState = {
  schemaVersion: typeof ADAPTIVE_CONTINUATION_SCHEMA_VERSION;
  runId: string;
  controllerRevision: number;
  binding: {
    semanticRevision: number;
    semanticHash: string | null;
    canonicalStateHash: string | null;
    planHash: string | null;
    rfSnapshotHash: string;
  };
  lifecycle: CanonicalAutonomousResearchLifecycle;
  decisions: CanonicalClaimContinuationDecision[];
  cumulativeResource: CanonicalContinuationResourceAccounting;
  continuationReadyAtomicClaimIds: string[];
  providerExecution: "regenerated_plan_disabled";
  secondPassProviderCalls: 0;
  stateHash: string;
  reasonCodes: string[];
  createdAt: string;
};

export type CanonicalAnalysisRunAutonomousLifecycle = {
  schemaVersion: typeof ADAPTIVE_CONTINUATION_SCHEMA_VERSION;
  controllerRevision: number;
  state: CanonicalAutonomousResearchLifecycle;
  boundSemanticRevision: number;
  boundSemanticHash: string | null;
  boundPlanHash: string | null;
  continuationReadyCount: number;
  providerExecution: "regenerated_plan_disabled";
  secondPassProviderCalls: 0;
  stateHash: string | null;
  reasonCodes: string[];
};

export function initialAutonomousLifecycle(): CanonicalAnalysisRunAutonomousLifecycle {
  return {
    schemaVersion: ADAPTIVE_CONTINUATION_SCHEMA_VERSION,
    controllerRevision: 0,
    state: "awaiting_first_pass_outcome",
    boundSemanticRevision: 0,
    boundSemanticHash: null,
    boundPlanHash: null,
    continuationReadyCount: 0,
    providerExecution: "regenerated_plan_disabled",
    secondPassProviderCalls: 0,
    stateHash: null,
    reasonCodes: ["first_pass_rg_outcome_not_yet_adjudicated"],
  };
}
