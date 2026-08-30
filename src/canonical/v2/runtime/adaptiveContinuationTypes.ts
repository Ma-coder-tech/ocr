import type { CanonicalAtomicClaimFacet } from "./atomicClaims.js";
import type { CanonicalUnresolvedClaimClass } from "./unresolvedClaims.js";

export const ADAPTIVE_CONTINUATION_SCHEMA_VERSION = "canonical_adaptive_continuation_v1_2" as const;

export type CanonicalAutonomousResearchLifecycle =
  | "awaiting_first_pass_outcome"
  | "convergence_required"
  | "continuation_ready_provider_execution_disabled"
  | "continuation_ready_provider_execution_authorized"
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
  sourcePlanGeneration: number;
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
  providerExecution: "requires_immutable_execution_grant";
};

export type CanonicalContinuationDegradation = {
  subtype:
    | "provider_unavailable_before_send"
    | "provider_rejection"
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
  currentPlanGeneration: number;
  currentWorkItemId: string | null;
  currentWorkContractFingerprint: string | null;
  priorWorkContractFingerprints: string[];
  priorPlanGenerations: number[];
  disposition: CanonicalContinuationDisposition;
  materiality: "material" | "contextual" | "immaterial" | "unresolved";
  decisionTier: "D0" | "D1" | "D2";
  evidenceRefs: string[];
  progress: CanonicalContinuationProgress[];
  nextOperationDelta: CanonicalContinuationOperationDelta | null;
  degradation: CanonicalContinuationDegradation | null;
  cumulativeResource: CanonicalContinuationResourceAccounting;
  reasonCodes: string[];
  regeneratedProviderExecution: "disabled" | "authorized_exact_claim_delta" | "executed_exact_claim_delta";
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
    planGeneration: number;
    rfSnapshotHash: string;
  };
  lifecycle: CanonicalAutonomousResearchLifecycle;
  decisions: CanonicalClaimContinuationDecision[];
  cumulativeResource: CanonicalContinuationResourceAccounting;
  continuationReadyAtomicClaimIds: string[];
  providerExecution: "continuation_authorized_existing_executor";
  secondPassProviderCalls: number;
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
  boundPlanGeneration: number;
  continuationReadyCount: number;
  providerExecution: "continuation_authorized_existing_executor";
  secondPassProviderCalls: number;
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
    boundPlanGeneration: 0,
    continuationReadyCount: 0,
    providerExecution: "continuation_authorized_existing_executor",
    secondPassProviderCalls: 0,
    stateHash: null,
    reasonCodes: ["first_pass_rg_outcome_not_yet_adjudicated"],
  };
}
