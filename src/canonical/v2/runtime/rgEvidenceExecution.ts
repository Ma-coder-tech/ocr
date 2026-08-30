import { createHash, randomUUID } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalRgClaimValue, KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import { normalizeSafeHttpsUrl } from "../intelligence/retrievalSafety.js";
import { getPersistedAnalysisRun, type PersistedAnalysisRunRecord } from "./analysisRunStore.js";
import type {
  CanonicalAdaptiveOperationalPolicy,
  CanonicalContinuationExecutionGrant,
} from "./adaptiveExecutionTypes.js";
import type { CanonicalRgOperationReconciliationPort, CanonicalRgReconciliationCapability } from "./rgOperationReconciliationTypes.js";
import { assertClaimedCanonicalRgReconciliationIntent } from "./rgOperationReconciliationStore.js";
import { dynamicallyBindPublisherOrigin, type CanonicalRgPublisherOriginProof } from "./rgPublisherOriginAuthority.js";
import { persistedVerifiedEvidenceIntegrityValid } from "./rgEvidenceIntegrity.js";
export { persistedVerifiedEvidenceIntegrityValid } from "./rgEvidenceIntegrity.js";
import {
  canonicalRgWorkContractFingerprint,
  type CanonicalRgClaimAdmission,
  type CanonicalRgOperation,
  type CanonicalRgProviderDiagnostics,
  type CanonicalRgWorkItem,
} from "./rgWorkLedger.js";

export const RG_EVIDENCE_EXECUTION_SCHEMA_VERSION = "canonical_rg_evidence_execution_v1_2" as const;

const MAX_CANDIDATES_PER_WORK_ITEM = 2;
const MAX_BEFORE_SEND_ATTEMPTS = 2;
const WORK_RESERVATION_MS = 5 * 60_000;

export type CanonicalRgSearchIntent = {
  schemaVersion: "canonical_rg_search_intent_v1_1";
  intentId: string;
  runId: string;
  planHash: string;
  workItemId: string;
  atomicClaimId: string;
  facet: CanonicalRgClaimAdmission["facet"];
  claimType: CanonicalRgWorkItem["knowledgeQuery"]["claimType"];
  publicSubjectConcept: string;
  publicScope: Record<string, string>;
  asOf: string;
  statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  evidenceObjective: string;
  queryTerms: string[];
  queryText: string;
  privacy: {
    status: "validated_public_concepts_only";
    forbiddenPrivateValuesObserved: 0;
    compiler: "deterministic_claim_lineage_v1";
  };
  continuation: null | {
    executionGrantId: string;
    executionGeneration: number;
    kind: NonNullable<CanonicalRgWorkItem["continuationContract"]>["kind"] | "newly_eligible";
    requiredGap: NonNullable<CanonicalRgWorkItem["continuationContract"]>["requiredGap"] | null;
    excludedDocumentFingerprints: string[];
    publicRefinementTerms: string[];
  };
};

export type CanonicalRgDiscoveryCandidate = {
  candidateId: string;
  url: string;
  title: string;
  claimedAuthority: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  publicationDate: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type CanonicalRgRetrievedDocument = {
  candidateId: string;
  requestedUrl: string;
  finalUrl: string;
  sourceOrigin: string;
  documentId: string;
  documentFingerprint: string;
  mimeType: string;
  byteLength: number;
  independentlyRetrieved: true;
  locators: Array<{
    locatorId: string;
    page: number | null;
    sectionCode: string | null;
    lineStart: number;
    lineEnd: number;
    textExcerpt: string;
  }>;
};

export type CanonicalRgInvestigatedCandidate = {
  investigationId: string;
  candidateId: string;
  documentId: string;
  documentFingerprint: string;
  locatorId: string;
  proposedValue: CanonicalRgClaimValue;
  sourceAuthorityCandidate: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  publisherIdentityCode: string;
  publicationTitle: string;
  publicationVersion: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  limitationCodes: string[];
  financialMutationAllowed: false;
};

export type CanonicalRgFrozenCandidate = CanonicalRgInvestigatedCandidate & {
  frozenCandidateHash: string;
  frozenAt: string;
};

export type CanonicalRgVerificationJudgment = {
  frozenCandidateHash: string;
  sourceAuthorityStatus: "verified" | "unverified" | "wrong_authority";
  semanticSupportStatus: "supported" | "partial" | "unsupported" | "contradicted";
  exactAtomicClaimSupport: boolean;
  publisherIdentityCode: string;
  authorityLocatorId: string;
  supportLocatorId: string;
  scopeStatus: "applicable" | "wrong_scope" | "unresolved";
  periodStatus: "applicable" | "wrong_period" | "unresolved";
  effectiveFrom: string | null;
  effectiveTo: string | null;
  limitationCodes: string[];
};

export type CanonicalRgVerifiedEvidence = {
  schemaVersion: "canonical_rg_verified_evidence_v1_1" | "canonical_rg_verified_evidence_v1_2" | "canonical_rg_verified_evidence_v1_3";
  evidenceId: string;
  runId: string;
  planHash: string;
  executionGrantId: string | null;
  executionGeneration: number;
  workItemId: string;
  atomicClaimId: string;
  facet: CanonicalRgClaimAdmission["facet"];
  intentId: string;
  candidateId: string;
  sourceUrl: string;
  sourceOrigin: string;
  sourceAuthority: Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
  publisherIdentityCode: string;
  publicationTitle: string;
  publicationVersion: string | null;
  documentId: string;
  documentFingerprint: string;
  investigatorLocatorId: string;
  authorityLocatorId: string;
  authorityLocatorExcerpt: string;
  supportLocatorId: string;
  supportLocatorExcerpt: string;
  originPublisherProof: CanonicalRgPublisherOriginProof;
  proposedValue: CanonicalRgClaimValue;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  applicabilityScope: Record<string, string>;
  scopeFingerprint?: string;
  statementPeriod: CanonicalRgClaimAdmission["statementPeriod"];
  frozenCandidateHash: string;
  currentRunSupport: "verified_claim_scoped_candidate_support";
  reusableKnowledgeState: "candidate_not_promoted";
  rfAdmissionAuthority: "none";
  automaticKnowledgePromotion: false;
  canonicalFinancialMutationAllowed: false;
  limitations: string[];
};

export type RgEvidencePortReceipt = {
  providerCode: string;
  providerRequestId: string | null;
  calls: number;
  tokens: number | null;
  retrievalBytes: number;
  providerDiagnostics?: CanonicalRgProviderDiagnostics | null;
};

export type RgEvidencePortResult<T> = { value: T; receipt: RgEvidencePortReceipt };

export type CanonicalRgRuntimeReadiness = {
  schemaVersion: "canonical_rg_runtime_readiness_v1";
  availability: "available" | "unavailable";
  authorization: "standing_provider_authorization";
  bindingSource: "production_process_environment";
  providerBindings: Array<{
    operation: "public_search" | "investigation" | "independent_verification";
    providerCode: string;
    modelCode: string;
    endpointOrigin: string;
  }>;
  privacy: {
    publicSearch: "validated_public_concepts_only";
    approvedAiContext: "complete_analysis_run_permitted";
    providerStorage: "disabled";
    secretPersistence: "prohibited";
  };
  reasonCodes: string[];
  configurationHash: string;
  readinessHash: string;
};

export type CanonicalRgEvidenceExecutionPorts = {
  availability: "available" | "unavailable";
  unavailabilityReasonCodes: string[];
  runtimeReadiness?: CanonicalRgRuntimeReadiness;
  reconciliationCapability?: CanonicalRgReconciliationCapability;
  reconciliation?: CanonicalRgOperationReconciliationPort;
  search(input: { intent: CanonicalRgSearchIntent; maximumCandidates: number }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgDiscoveryCandidate[]>>;
  retrieve(input: { intent: CanonicalRgSearchIntent; candidate: CanonicalRgDiscoveryCandidate; maximumBytes: number }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgRetrievedDocument>>;
  investigate(input: {
    intent: CanonicalRgSearchIntent;
    admission: CanonicalRgClaimAdmission;
    expectedValueConstraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"];
    candidate: CanonicalRgDiscoveryCandidate;
    document: CanonicalRgRetrievedDocument;
    currentRunContext: unknown;
  }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgInvestigatedCandidate>>;
  verify(input: {
    intent: CanonicalRgSearchIntent;
    admission: CanonicalRgClaimAdmission;
    expectedValueConstraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"];
    candidate: CanonicalRgDiscoveryCandidate;
    document: CanonicalRgRetrievedDocument;
    frozenCandidate: CanonicalRgFrozenCandidate;
  }, onSend: () => void): Promise<RgEvidencePortResult<CanonicalRgVerificationJudgment>>;
};

export class RgEvidenceTransportError extends Error {
  constructor(public readonly transportState: "before_send" | "provider_rejected" | "after_send" | "timed_out" | "cancelled", reasonCode: string,
    public readonly receipt: RgEvidencePortReceipt | null = null) {
    super(reasonCode);
  }
}

export type CanonicalRgCompletedUnusableResult = {
  schemaVersion: "canonical_rg_completed_unusable_result_v1";
  outcome: "completed_unusable";
  reasonCode: string;
};

/** A side-effect-free retrieval result was received, but cannot be used as evidence. */
export class RgEvidenceCompletedUnusableError extends Error {
  constructor(reasonCode: string, public readonly receipt: RgEvidencePortReceipt) {
    super(reasonCode);
  }
}

export type CanonicalRgEvidenceExecutionResult = {
  schemaVersion: typeof RG_EVIDENCE_EXECUTION_SCHEMA_VERSION;
  runId: string;
  planHash: string | null;
  workItemsConsidered: number;
  workItemsCompletedWithEvidence: number;
  workItemsCompletedUnresolved: number;
  workItemsDegraded: number;
  verifiedEvidence: CanonicalRgVerifiedEvidence[];
  canonicalTruthHashBefore: string | null;
  canonicalTruthHashAfter: string | null;
  canonicalTruthPreserved: true;
};

type GenerationZeroOperationalScope = {
  policy: CanonicalAdaptiveOperationalPolicy;
  planHash: string;
  cycleStartedAtMs: number;
  baseline: { providerCalls: number; retrievalBytes: number; elapsedMsObserved: number };
  existingOperationIds: Set<string>;
};

export async function executeDurableCanonicalRgEvidence(input: {
  runId: string;
  ports: CanonicalRgEvidenceExecutionPorts;
  workerId?: string;
  cycleOwnerId?: string;
  executionGrantId?: string;
  reconciliationResume?: { intentId: string; workItemId: string };
  operationalPolicy?: CanonicalAdaptiveOperationalPolicy;
}): Promise<CanonicalRgEvidenceExecutionResult> {
  const persisted = getPersistedAnalysisRun(input.runId);
  if (!persisted?.result) throw new Error("rg_evidence_analysis_run_unavailable");
  validateRuntimeReadiness(input.ports);
  const reconciliation = input.reconciliationResume
    ? assertClaimedCanonicalRgReconciliationIntent(input.reconciliationResume.intentId, input.cycleOwnerId ?? "")
    : null;
  if (reconciliation && (reconciliation.intent.runId !== input.runId
    || !reconciliation.intent.operations.some((item) => item.workItemId === input.reconciliationResume!.workItemId)
    || persisted.rgOperations.some((operation) => operation.state === "indeterminate_after_send"))) {
    throw new Error("rg_evidence_reconciliation_resume_binding_invalid");
  }
  const resumedWork = reconciliation
    ? persisted.rgWorkItems.find((item) => item.workItemId === input.reconciliationResume!.workItemId) ?? null
    : null;
  if (reconciliation && (!resumedWork || resumedWork.executionState !== "planned_for_durable_execution")) {
    throw new Error("rg_evidence_reconciliation_resume_work_unavailable");
  }
  const effectiveGrantId = input.executionGrantId ?? resumedWork?.executionAuthorization?.grantId;
  const executionGrant = effectiveGrantId
    ? persisted.continuationExecutionGrants.find((item) => item.grantId === effectiveGrantId) ?? null
    : null;
  if ((persisted.continuationRevision > 0 || persisted.semanticRevision > 0) && !executionGrant && !reconciliation) {
    throw new Error("rg_evidence_regenerated_or_readjudicated_plan_execution_disabled");
  }
  if (executionGrant) validateExecutionGrantBinding(persisted, executionGrant, input.cycleOwnerId);
  const ledger = persisted.result.artifacts.rgWorkLedger;
  if (!ledger || ledger.validation.status !== "valid") throw new Error("rg_evidence_valid_work_ledger_required");
  if (persisted.canonicalTruthHash !== persisted.result.canonicalTruthHash) throw new Error("rg_evidence_canonical_truth_binding_mismatch");
  const workerId = input.workerId ?? `rg-worker-${randomUUID()}`;
  const beforeHash = persisted.canonicalTruthHash;
  const verifiedEvidence: CanonicalRgVerifiedEvidence[] = [];
  let completedUnresolved = 0;
  let degraded = 0;

  const selectedWork = reconciliation
    ? persisted.rgWorkItems.filter((item) => item.workItemId === input.reconciliationResume!.workItemId)
    : executionGrant
    ? persisted.rgWorkItems.filter((item) => item.workItemId === executionGrant.baseWorkItemId)
    : persisted.rgWorkItems;
  const generationZeroOperationalScope = !reconciliation && !executionGrant
    && persisted.continuationRevision === 0 && persisted.semanticRevision === 0 && input.operationalPolicy
    ? createGenerationZeroOperationalScope(input.runId, ledger.planHash, input.operationalPolicy)
    : null;
  if (selectedWork[0] && input.ports.runtimeReadiness) {
    appendEvent(input.runId, selectedWork[0].workItemId, null, "production_rg_runtime_readiness_observed", {
      readiness: input.ports.runtimeReadiness,
      operationalPolicy: generationZeroOperationalScope?.policy ?? null,
      analyticalCompletionEffect: "none",
      secretMaterialPersisted: false,
    });
  }
  for (const planned of selectedWork) {
    const admission = persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === planned.atomicClaimId);
    if (!admission || admission.researchAdmission !== "admitted_to_rg_work_ledger" || admission.materiality !== "material") continue;
    if (planHashForWork(input.runId, planned.workItemId) !== ledger.planHash) throw new Error("rg_evidence_stale_work_item_plan_binding");
    const latest = workItemFromDb(input.runId, planned.workItemId);
    if (!latest) throw new Error("rg_evidence_persisted_work_item_missing");
    if (admission.facet === "recurrence" && (admission.expectedKnowledgeValueConstraint?.kind !== "synthesis_recurrence"
      || admission.expectedKnowledgeValueConstraint.recurrenceBasis !== "verified_schedule"
      || latest.expectedKnowledgeValueConstraint.kind !== "synthesis_recurrence"
      || latest.expectedKnowledgeValueConstraint.recurrenceBasis !== "verified_schedule")) {
      throw new Error("rg_recurrence_public_evidence_route_binding_invalid");
    }
    if (latest.executionState === "completed_verified_evidence") {
      const retained = verifiedEvidenceFromOperations(input.runId, latest.workItemId, executionGrant?.grantId ?? null);
      if (retained.length === 0 || retained.some((item) => !latest.verifiedEvidenceRefs.includes(item.evidenceId))) {
        throw new Error("rg_verified_evidence_persistence_invalid");
      }
      verifiedEvidence.push(...retained);
      continue;
    }
    if (["completed_unresolved", "degraded_emergency_circuit_breaker", "indeterminate_after_send"].includes(latest.executionState)) {
      if (latest.executionState === "completed_unresolved") completedUnresolved += 1; else degraded += 1;
      continue;
    }
    const generationZeroCeiling = operationalCeilingReason(input.runId, null, generationZeroOperationalScope);
    if (generationZeroCeiling) {
      terminalizeWork(input.runId, latest, "degraded_emergency_circuit_breaker", "degraded",
        generationZeroCeiling, [], workerId);
      degraded += 1;
      continue;
    }
    if (input.ports.availability !== "available") {
      terminalizeWork(input.runId, latest, "degraded_provider_unavailable", "degraded",
        input.ports.unavailabilityReasonCodes[0] ?? "rg_provider_unavailable", [], workerId);
      degraded += 1;
      continue;
    }
    const reservation = reserveWork(input.runId, latest, workerId);
    if (!reservation) continue;
    const result = await executeWorkItem({ runId: input.runId, planHash: ledger.planHash, workItem: reservation,
      admission, ports: input.ports, workerId, currentRunContext: persisted.result, executionGrant,
      generationZeroOperationalScope });
    if (result.state === "verified") verifiedEvidence.push(...result.evidence);
    else if (result.state === "unresolved") completedUnresolved += 1;
    else {
      degraded += 1;
      const current = workItemFromDb(input.runId, planned.workItemId);
      if (current?.executionState === "indeterminate_after_send") break;
    }
  }

  const after = getPersistedAnalysisRun(input.runId);
  if (!after || after.canonicalTruthHash !== beforeHash || after.result?.canonicalTruthHash !== beforeHash) {
    throw new Error("rg_evidence_mutated_canonical_truth");
  }
  return {
    schemaVersion: RG_EVIDENCE_EXECUTION_SCHEMA_VERSION,
    runId: input.runId,
    planHash: ledger.planHash,
    workItemsConsidered: selectedWork.length,
    workItemsCompletedWithEvidence: new Set(verifiedEvidence.map((item) => item.workItemId)).size,
    workItemsCompletedUnresolved: completedUnresolved,
    workItemsDegraded: degraded,
    verifiedEvidence,
    canonicalTruthHashBefore: beforeHash,
    canonicalTruthHashAfter: after.canonicalTruthHash,
    canonicalTruthPreserved: true,
  };
}

async function executeWorkItem(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission;
  ports: CanonicalRgEvidenceExecutionPorts;
  workerId: string;
  currentRunContext: unknown;
  executionGrant: CanonicalContinuationExecutionGrant | null;
  generationZeroOperationalScope: GenerationZeroOperationalScope | null;
}): Promise<{ state: "verified"; evidence: CanonicalRgVerifiedEvidence[] } | { state: "unresolved" | "degraded"; evidence: [] }> {
  let intent: CanonicalRgSearchIntent;
  try {
    intent = compileCanonicalRgSearchIntent(input.runId, input.planHash, input.workItem, input.admission);
  } catch (error) {
    terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved", safeReason(error), [], input.workerId);
    return { state: "unresolved", evidence: [] };
  }
  const search = await runExternalOperation({ ...input, kind: "public_search", candidateId: null,
    providerCode: "public_search", operationInput: { intent, maximumCandidates: MAX_CANDIDATES_PER_WORK_ITEM },
    projectResult: sanitizeSearchResult,
    call: (onSend) => input.ports.search({ intent, maximumCandidates: MAX_CANDIDATES_PER_WORK_ITEM }, onSend) });
  if (search.state !== "completed") return finishFailedOperation(input, search.operation);
  const candidates = validateSearchCandidates(search.value as CanonicalRgDiscoveryCandidate[], intent);
  if (candidates.length === 0) {
    terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved", "rg_search_no_valid_candidates", [], input.workerId);
    return { state: "unresolved", evidence: [] };
  }

  const evidence: CanonicalRgVerifiedEvidence[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) appendExtensionDecision(input.runId, input.workItem.workItemId, "extended", "prior_candidate_did_not_produce_verified_support");
    const retrieval = await runExternalOperation({ ...input, kind: "public_retrieval", candidateId: candidate.candidateId,
      providerCode: "independent_https_retrieval", operationInput: { intentId: intent.intentId, candidate },
      projectResult: sanitizeRetrievedDocument,
      call: (onSend) => input.ports.retrieve({ intent, candidate, maximumBytes: 5_242_880 }, onSend) });
    if (retrieval.state !== "completed") {
      if (retrieval.operation.state === "indeterminate_after_send" || operationStoppedByCircuitBreaker(retrieval.operation)) {
        return finishFailedOperation(input, retrieval.operation);
      }
      continue;
    }
    const document = validateRetrievedDocument(retrieval.value as CanonicalRgRetrievedDocument, candidate);
    if (!document) continue;
    if (intent.continuation?.excludedDocumentFingerprints.includes(document.documentFingerprint)) {
      appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped",
        "continuation_excluded_previously_insufficient_document");
      continue;
    }
    const investigation = await runExternalOperation({ ...input, kind: "investigation", candidateId: candidate.candidateId,
      providerCode: "approved_ai_investigation", operationInput: { intent, candidate, documentFingerprint: document.documentFingerprint },
      projectResult: sanitizeInvestigatedCandidate,
      call: (onSend) => input.ports.investigate({ intent, admission: input.admission,
        expectedValueConstraint: input.workItem.expectedKnowledgeValueConstraint, candidate, document,
        currentRunContext: input.currentRunContext }, onSend) });
    if (investigation.state !== "completed") {
      if (investigation.operation.state === "indeterminate_after_send" || operationStoppedByCircuitBreaker(investigation.operation)) {
        return finishFailedOperation(input, investigation.operation);
      }
      continue;
    }
    const investigated = validateInvestigatedCandidate(investigation.value as CanonicalRgInvestigatedCandidate,
      input.workItem, input.admission, candidate, document);
    if (!investigated) continue;
    const frozenCandidate = freezeCandidate(investigated, investigation.operation.updatedAt);
    const durableVerification = priorVerificationOperationForCandidate({ runId: input.runId, planHash: input.planHash,
      workItem: input.workItem, candidateId: candidate.candidateId,
      documentFingerprint: document.documentFingerprint, frozenCandidateHash: frozenCandidate.frozenCandidateHash,
      executionGrant: input.executionGrant });
    const verification = durableVerification
      ? replayDurableVerificationOperation(input.runId, durableVerification)
      : await runExternalOperation({ ...input, kind: "independent_verification", candidateId: candidate.candidateId,
        providerCode: "approved_ai_independent_verification", operationInput: { intent, candidate,
          documentFingerprint: document.documentFingerprint, frozenCandidate },
        projectResult: sanitizeVerificationJudgment,
        call: (onSend) => input.ports.verify({ intent, admission: input.admission,
          expectedValueConstraint: input.workItem.expectedKnowledgeValueConstraint, candidate, document, frozenCandidate }, onSend) });
    if (verification.state !== "completed") {
      if (verification.operation.state === "indeterminate_after_send" || operationStoppedByCircuitBreaker(verification.operation)) {
        return finishFailedOperation(input, verification.operation);
      }
      continue;
    }
    const verified = validateVerification({ runId: input.runId, planHash: input.planHash, intent,
      workItem: input.workItem, admission: input.admission, candidate, document, frozenCandidate,
      judgment: verification.value as CanonicalRgVerificationJudgment });
    if (verified) {
      attachVerifiedEvidence(input.runId, verification.operation, verified);
      evidence.push(verified);
    }
    if (verified) break;
  }
  if (evidence.length > 0) {
    terminalizeWork(input.runId, input.workItem, "completed_verified_evidence", "verified_evidence",
      "rg_verified_claim_scoped_evidence_obtained", evidence.map((item) => item.evidenceId), input.workerId);
    appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped", "exact_claim_support_verified_early_completion");
    return { state: "verified", evidence };
  }
  if (candidates.length >= MAX_CANDIDATES_PER_WORK_ITEM) {
    terminalizeWork(input.runId, input.workItem, "degraded_emergency_circuit_breaker", "degraded",
      "rg_emergency_candidate_ceiling_reached_with_claim_unresolved", [], input.workerId);
    appendExtensionDecision(input.runId, input.workItem.workItemId, "stopped", "emergency_candidate_ceiling_not_completeness");
    return { state: "degraded", evidence: [] };
  }
  terminalizeWork(input.runId, input.workItem, "completed_unresolved", "unresolved",
    "rg_no_candidate_passed_dynamic_authority_and_exact_support", [], input.workerId);
  return { state: "unresolved", evidence: [] };
}

function finishFailedOperation(
  input: { runId: string; workItem: CanonicalRgWorkItem; workerId: string },
  operation: CanonicalRgOperation,
): { state: "degraded"; evidence: [] } {
  const indeterminate = operation.state === "indeterminate_after_send";
  const providerRejected = operation.state === "provider_rejected";
  terminalizeWork(input.runId, input.workItem, indeterminate ? "indeterminate_after_send"
    : providerRejected ? "degraded_provider_unavailable" : "degraded_emergency_circuit_breaker",
    "degraded", operation.receipt.reasonCode, [], input.workerId);
  return { state: "degraded", evidence: [] };
}

function operationStoppedByCircuitBreaker(operation: CanonicalRgOperation): boolean {
  return operation.state === "failed_before_send"
    && operation.receipt.reasonCode.endsWith("_not_analytical_completion");
}

export function compileCanonicalRgSearchIntent(
  runId: string,
  planHash: string,
  workItem: CanonicalRgWorkItem,
  admission: CanonicalRgClaimAdmission,
): CanonicalRgSearchIntent {
  if (admission.atomicClaimId !== workItem.atomicClaimId || admission.researchAdmission !== "admitted_to_rg_work_ledger"
    || admission.materiality !== "material" || workItem.requestedOperation !== "claim_scoped_public_research") {
    throw new Error("rg_search_intent_work_not_admitted");
  }
  const persisted = getPersistedAnalysisRun(runId);
  const rb = persisted?.result?.artifacts.rb;
  const rd = persisted?.result?.artifacts.rd;
  if (!persisted || !rb || !rd) throw new Error("rg_search_intent_canonical_lineage_unavailable");
  const chargeRefs = new Set(admission.canonicalRefs);
  const relevantCharges = rd.economicLayer.charges.filter((charge) => chargeRefs.has(charge.id));
  const occurrenceRefs = new Set([
    ...admission.occurrenceRefs,
    ...relevantCharges.flatMap((charge) => charge.sourceOccurrenceRefs),
    ...relevantCharges.flatMap((charge) => charge.contributingOccurrenceRef ? [charge.contributingOccurrenceRef] : []),
  ]);
  const labels = rb.sourceModel.occurrences.filter((occurrence) => occurrenceRefs.has(occurrence.id))
    .map((occurrence) => safePublicSubjectConcept(occurrence.sourceLabel)).filter((value): value is string => value !== null);
  const publicSubjectConcept = [...new Set(labels)].sort((left, right) => left.length - right.length || left.localeCompare(right))[0];
  if (!publicSubjectConcept) throw new Error("rg_search_intent_public_subject_unavailable");
  const publicScope = Object.fromEntries(Object.entries(workItem.knowledgeQuery.scope)
    .filter(([key, value]) => key !== "tenantRef" && key !== "accountRef" && typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value))
    .map(([key, value]) => [key, String(value)]));
  const processorConcept = publicScope.processor ?? publicScope.processorProgram ?? publicScope.network ?? "payment processing";
  const facetConcept = publicSearchFacetConcept(workItem.expectedKnowledgeValueConstraint, admission.facet);
  const periodYear = workItem.knowledgeQuery.asOf.slice(0, 4);
  const publicRefinementTerms = refinementTerms(workItem.continuationContract?.kind ?? null);
  const queryTerms = [processorConcept.replaceAll("_", " "), publicSubjectConcept, facetConcept, "official publication", periodYear,
    ...publicRefinementTerms];
  const queryText = queryTerms.map((term, index) => index === 1 ? `"${term}"` : term).join(" ");
  validatePublicQuery(queryText, { runId, planHash, workItem, admission });
  const base = { runId, planHash, workItemId: workItem.workItemId, atomicClaimId: admission.atomicClaimId,
    facet: admission.facet, claimType: workItem.knowledgeQuery.claimType, publicSubjectConcept, publicScope,
    asOf: workItem.knowledgeQuery.asOf, statementPeriod: admission.statementPeriod,
    requiredSourceAuthorities: [...workItem.requiredSourceAuthorities].sort(), evidenceObjective: workItem.evidenceObjective,
    queryTerms, queryText,
    continuation: workItem.executionAuthorization ? {
      executionGrantId: workItem.executionAuthorization.grantId,
      executionGeneration: workItem.executionAuthorization.executionGeneration,
      kind: workItem.continuationContract?.kind ?? "newly_eligible" as const,
      requiredGap: workItem.continuationContract?.requiredGap ?? null,
      excludedDocumentFingerprints: [...(workItem.continuationContract?.excludedDocumentFingerprints ?? [])].sort(),
      publicRefinementTerms,
    } : null };
  return {
    schemaVersion: "canonical_rg_search_intent_v1_1",
    intentId: `rg-intent-${digest(base).slice(0, 32)}`,
    ...base,
    privacy: { status: "validated_public_concepts_only", forbiddenPrivateValuesObserved: 0,
      compiler: "deterministic_claim_lineage_v1" },
  };
}

function publicSearchFacetConcept(
  constraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"],
  facet: CanonicalRgClaimAdmission["facet"],
): string {
  switch (constraint.kind) {
    case "mapping": return facet === "economic_category" ? "economic category classification" : `${facet.replaceAll("_", " ")} mapping`;
    case "role": return `${constraint.controlDimension.replaceAll("_", " ")} participant role`;
    case "boolean": return `${facet.replaceAll("_", " ")} merchant availability`;
    case "synthesis_constraint_identity": return "constraint rule or requirement identity";
    case "synthesis_constraint_action_effect": return `constraint effect on ${constraint.safeActionCode.replaceAll("_", " ")}`;
    case "synthesis_condition_state": return `${constraint.conditionCode.replaceAll("_", " ")} condition for ${constraint.safeActionCode.replaceAll("_", " ")}`;
    case "synthesis_economic_driver": return "economic cost driver";
    case "synthesis_recurrence": return "verified fee schedule cadence recurrence";
    case "synthesis_counterfactual": return "statement period economic counterfactual";
    case "synthesis_safe_action": return `supported merchant action ${constraint.allowedSafeActionCodes.join(" or ").replaceAll("_", " ")}`;
    case "synthesis_merchant_influence": return `${constraint.influenceKind.replaceAll("_", " ")} for ${constraint.safeActionCode.replaceAll("_", " ")}`;
  }
}

function refinementTerms(kind: NonNullable<CanonicalRgWorkItem["continuationContract"]>["kind"] | null): string[] {
  if (kind === "period_refinement") return ["effective date"];
  if (kind === "scope_refinement") return ["applicability scope"];
  if (kind === "locator_subsection_refinement") return ["schedule section"];
  return [];
}

function safePublicSubjectConcept(value: string): string | null {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 3 || normalized.length > 120 || !/[A-Za-z]{2}/.test(normalized)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 &'()+,./:-]*$/.test(normalized)) return null;
  if (/(?:https?:\/\/|www\.|@|\$|\b\d{6,}\b|\b(?:mid|merchant|account)\s*(?:id|number)?\b|api[_ -]?key|password|secret|ignore (?:all|previous)|system prompt|tool call|(?:^|[\/])(?:users|home|private|tmp)[\/])/i.test(normalized)) return null;
  return normalized;
}

function validatePublicQuery(query: string, binding: { runId: string; planHash: string; workItem: CanonicalRgWorkItem; admission: CanonicalRgClaimAdmission }): void {
  if (query.length < 8 || query.length > 320 || /[\r\n\0]/.test(query)) throw new Error("rg_search_intent_query_invalid");
  const privateValues = [binding.runId, binding.planHash, binding.workItem.workItemId, binding.admission.atomicClaimId,
    binding.admission.opaqueSubjectCode, binding.admission.scopeFingerprint,
    binding.workItem.knowledgeQuery.scope.tenantRef, binding.workItem.knowledgeQuery.scope.accountRef]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (privateValues.some((value) => query.includes(value))
    || /(?:https?:\/\/|www\.|@|\$|\b\d{6,}\b|\b(?:mid|merchant|account)\s*(?:id|number)?\b|api[_ -]?key|password|secret|ignore (?:all|previous)|system prompt|tool call)/i.test(query)) {
    throw new Error("rg_search_intent_private_or_untrusted_content_blocked");
  }
}

type OperationCallResult =
  | { state: "completed"; value: unknown; operation: CanonicalRgOperation }
  | { state: "failed"; value: null; operation: CanonicalRgOperation };

async function runExternalOperation<T>(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission;
  workerId: string;
  kind: CanonicalRgOperation["kind"];
  candidateId: string | null;
  providerCode: string;
  operationInput: unknown;
  projectResult(value: T): unknown;
  call(onSend: () => void): Promise<RgEvidencePortResult<T>>;
  executionGrant: CanonicalContinuationExecutionGrant | null;
  generationZeroOperationalScope: GenerationZeroOperationalScope | null;
}): Promise<OperationCallResult> {
  const inputHash = digest(input.operationInput);
  const ceilingReason = operationalCeilingReason(input.runId, input.executionGrant,
    input.generationZeroOperationalScope);
  if (ceilingReason) {
    const operationId = `rg-op-${digest({ runId: input.runId, planHash: input.planHash,
      executionGrantId: input.executionGrant?.grantId ?? null, workItemId: input.workItem.workItemId,
      kind: input.kind, candidateId: input.candidateId, attempt: 1, inputHash }).slice(0, 32)}`;
    const existing = operationFromDb(input.runId, operationId);
    const reserved = existing ?? reserveOperation({ ...input, operationId, attempt: 1, inputHash });
    const failed = existing?.state === "failed_before_send" ? existing
      : settleOperation(input.runId, reserved, "failed_before_send", null, null, ceilingReason);
    appendRetryDecision(input.runId, input.workItem.workItemId, operationId, "no_retry",
      "emergency_operational_ceiling_not_analytical_completion");
    return { state: "failed", value: null, operation: failed };
  }
  for (let attempt = 1; attempt <= MAX_BEFORE_SEND_ATTEMPTS; attempt += 1) {
    const operationId = `rg-op-${digest({ runId: input.runId, planHash: input.planHash,
      executionGrantId: input.executionGrant?.grantId ?? null, workItemId: input.workItem.workItemId,
      kind: input.kind, candidateId: input.candidateId, attempt, inputHash }).slice(0, 32)}`;
    const existing = operationFromDb(input.runId, operationId);
    if (existing?.state === "completed") return isCompletedUnusableResult(existing.result)
      ? { state: "failed", value: null, operation: existing }
      : { state: "completed", value: replayableCompletedOperationResult(existing), operation: existing };
    if (existing?.state === "provider_rejected") return { state: "failed", value: null, operation: existing };
    if (existing?.state === "failed_before_send") {
      if (attempt < MAX_BEFORE_SEND_ATTEMPTS) continue;
      return { state: "failed", value: null, operation: existing };
    }
    if (existing?.state === "sent" || existing?.state === "indeterminate_after_send") {
      const indeterminate = existing.state === "indeterminate_after_send" ? existing : settleOperation(input.runId, existing,
        "indeterminate_after_send", null, null, "rg_operation_prior_send_completion_unknown");
      return { state: "failed", value: null, operation: indeterminate };
    }
    const operation = existing ? rebindReservedOperation(input.runId, existing, input.workerId)
      : reserveOperation({ ...input, operationId, attempt, inputHash });
    let sent = false;
    try {
      const result = await input.call(() => { markOperationSent(input.runId, operation.operationId, input.workerId); sent = true; });
      const projected = input.projectResult(result.value);
      const settled = settleOperation(input.runId, operation, "completed", projected, result.receipt, "rg_operation_completed");
      incrementResource(input.runId, input.workItem.workItemId, input.kind, result.receipt);
      return { state: "completed", value: projected, operation: settled };
    } catch (error) {
      if (error instanceof RgEvidenceCompletedUnusableError) {
        if (input.kind !== "public_retrieval" || !sent) {
          throw new Error("rg_completed_unusable_outcome_invalid");
        }
        const reason = safeReason(error);
        const completedUnusable: CanonicalRgCompletedUnusableResult = {
          schemaVersion: "canonical_rg_completed_unusable_result_v1",
          outcome: "completed_unusable",
          reasonCode: reason,
        };
        const settled = settleOperation(input.runId, operation, "completed", completedUnusable, error.receipt, reason);
        incrementResource(input.runId, input.workItem.workItemId, input.kind, error.receipt);
        appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
          "no_retry", "completed_unusable_public_retrieval_no_retry");
        return { state: "failed", value: null, operation: settled };
      }
      const providerRejected = error instanceof RgEvidenceTransportError && error.transportState === "provider_rejected";
      const afterSend = !providerRejected && (sent || (error instanceof RgEvidenceTransportError && error.transportState !== "before_send"));
      const reason = safeReason(error);
      const errorReceipt = error instanceof RgEvidenceTransportError ? error.receipt : null;
      const settled = settleOperation(input.runId, operation,
        providerRejected ? "provider_rejected" : afterSend ? "indeterminate_after_send" : "failed_before_send",
        null, errorReceipt, reason);
      if (afterSend || providerRejected) incrementResource(input.runId, input.workItem.workItemId, input.kind, {
        providerCode: errorReceipt?.providerCode ?? input.providerCode,
        providerRequestId: errorReceipt?.providerRequestId ?? null,
        calls: errorReceipt?.calls ?? 1, tokens: errorReceipt?.tokens ?? null,
        retrievalBytes: errorReceipt?.retrievalBytes ?? 0,
        providerDiagnostics: errorReceipt?.providerDiagnostics ?? null,
      });
      appendRetryDecision(input.runId, input.workItem.workItemId, operation.operationId,
        !afterSend && !providerRejected && attempt < MAX_BEFORE_SEND_ATTEMPTS ? "retry" : "no_retry",
        providerRejected ? "known_provider_rejection_no_immediate_retry"
          : afterSend ? "indeterminate_after_send_no_blind_retry" : attempt < MAX_BEFORE_SEND_ATTEMPTS
          ? "before_send_failure_bounded_retry" : "before_send_retry_limit_reached");
      if (afterSend || providerRejected || attempt === MAX_BEFORE_SEND_ATTEMPTS) return { state: "failed", value: null, operation: settled };
    }
  }
  throw new Error("rg_operation_retry_state_invalid");
}

function isCompletedUnusableResult(value: unknown): value is CanonicalRgCompletedUnusableResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.schemaVersion === "canonical_rg_completed_unusable_result_v1"
    && result.outcome === "completed_unusable" && typeof result.reasonCode === "string"
    && /^[a-z][a-z0-9_:.-]{0,191}$/.test(result.reasonCode);
}

function replayableCompletedOperationResult(operation: CanonicalRgOperation): unknown {
  if (operation.kind !== "independent_verification") return operation.result;
  return verificationEnvelopeFromResult(operation.result)?.judgment ?? operation.result;
}

function priorVerificationOperationForCandidate(input: {
  runId: string;
  planHash: string;
  workItem: CanonicalRgWorkItem;
  candidateId: string;
  documentFingerprint: string;
  frozenCandidateHash: string;
  executionGrant: CanonicalContinuationExecutionGrant | null;
}): CanonicalRgOperation | null {
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations
    WHERE run_id = ? AND work_item_id = ? AND plan_hash = ? ORDER BY updated_at DESC, operation_id DESC`)
    .all(input.runId, input.workItem.workItemId, input.planHash) as Array<{ operation_json: string }>;
  const operations = rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation)
    .filter((operation) => operation.kind === "independent_verification"
      && operation.candidateId === input.candidateId
      && (operation.executionGrantId ?? null) === (input.executionGrant?.grantId ?? null)
      && (operation.input as { documentFingerprint?: unknown }).documentFingerprint === input.documentFingerprint
      && (operation.input as { frozenCandidate?: { frozenCandidateHash?: unknown } }).frozenCandidate?.frozenCandidateHash
        === input.frozenCandidateHash);
  const ambiguous = operations.find((operation) => operation.state === "sent"
    || operation.state === "indeterminate_after_send");
  return ambiguous ?? operations.find((operation) => operation.state === "completed") ?? null;
}

function replayDurableVerificationOperation(runId: string, operation: CanonicalRgOperation): OperationCallResult {
  if (operation.state === "completed") return { state: "completed",
    value: replayableCompletedOperationResult(operation), operation };
  const indeterminate = operation.state === "indeterminate_after_send" ? operation
    : settleOperation(runId, operation, "indeterminate_after_send", null, null,
      "rg_operation_prior_send_completion_unknown");
  return { state: "failed", value: null, operation: indeterminate };
}

function verificationEnvelopeFromResult(value: unknown): {
  judgment: CanonicalRgVerificationJudgment;
  verifiedEvidence: CanonicalRgVerifiedEvidence;
} | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const hasEnvelopeField = Object.hasOwn(record, "judgment") || Object.hasOwn(record, "verifiedEvidence");
  if (!hasEnvelopeField) return null;
  if (!record.judgment || typeof record.judgment !== "object"
    || !record.verifiedEvidence || typeof record.verifiedEvidence !== "object") {
    throw new Error("rg_verified_evidence_persisted_envelope_invalid");
  }
  return { judgment: record.judgment as CanonicalRgVerificationJudgment,
    verifiedEvidence: record.verifiedEvidence as CanonicalRgVerifiedEvidence };
}

function reserveWork(runId: string, workItem: CanonicalRgWorkItem, workerId: string): CanonicalRgWorkItem | null {
  const now = new Date();
  if (workItem.reservation && new Date(workItem.reservation.expiresAt).getTime() > now.getTime()
    && workItem.reservation.workerId !== workerId) return null;
  const reservation = { reservationId: `rg-work-reservation-${randomUUID()}`, workerId, reservedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + WORK_RESERVATION_MS).toISOString() };
  const updated: CanonicalRgWorkItem = { ...workItem, state: "executing", executionState: "executing", reservation,
    progress: { ...workItem.progress, state: "in_progress" } };
  const result = db.prepare(`UPDATE canonical_rg_work_items SET state = ?, execution_state = ?, work_item_json = ?, updated_at = ?
    WHERE run_id = ? AND work_item_id = ? AND plan_hash = ? AND work_item_json = ?`).run(updated.state, updated.executionState,
    JSON.stringify(updated), nowIso(), runId, updated.workItemId, planHashForWork(runId, updated.workItemId), JSON.stringify(workItem));
  if (result.changes !== 1) return null;
  appendEvent(runId, updated.workItemId, null, "work_reserved", { reservation });
  return updated;
}

function reserveOperation(input: {
  runId: string; planHash: string; workItem: CanonicalRgWorkItem; admission: CanonicalRgClaimAdmission;
  workerId: string; kind: CanonicalRgOperation["kind"]; candidateId: string | null; providerCode: string;
  operationInput: unknown; operationId: string; attempt: number; inputHash: string;
  executionGrant: CanonicalContinuationExecutionGrant | null;
}): CanonicalRgOperation {
  const now = nowIso();
  const reservation = { reservationId: `rg-operation-reservation-${randomUUID()}`, workerId: input.workerId,
    reservedAt: now, expiresAt: new Date(Date.now() + WORK_RESERVATION_MS).toISOString() };
  const operation: CanonicalRgOperation = {
    operationId: input.operationId, workItemId: input.workItem.workItemId, atomicClaimId: input.admission.atomicClaimId,
    planHash: input.planHash, executionGrantId: input.executionGrant?.grantId ?? null,
    executionGeneration: input.executionGrant?.executionGeneration ?? 0,
    kind: input.kind, attempt: input.attempt, candidateId: input.candidateId,
    state: "reserved", reservation,
    receipt: { sendState: "not_sent", completionState: "reserved", providerCode: input.providerCode,
      providerRequestId: null, calls: 0, tokens: null, retrievalBytes: 0, reasonCode: "rg_operation_reserved",
      providerDiagnostics: null },
    input: structuredClone(input.operationInput), inputHash: input.inputHash, result: null, createdAt: now, updatedAt: now,
  };
  db.prepare(`INSERT INTO canonical_rg_operations
    (run_id, operation_id, work_item_id, state, operation_json, plan_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.runId, operation.operationId, operation.workItemId,
    operation.state, JSON.stringify(operation), input.planHash, now, now);
  appendEvent(input.runId, operation.workItemId, operation.operationId, "operation_reserved", operation);
  return operation;
}

function rebindReservedOperation(runId: string, operation: CanonicalRgOperation, workerId: string): CanonicalRgOperation {
  if (operation.state !== "reserved") throw new Error("rg_operation_not_reservable");
  if (operation.reservation.workerId === workerId) return operation;
  if (new Date(operation.reservation.expiresAt).getTime() > Date.now()) throw new Error("rg_operation_reservation_active");
  const now = nowIso();
  const updated: CanonicalRgOperation = { ...operation, reservation: {
    reservationId: `rg-operation-reservation-${randomUUID()}`, workerId, reservedAt: now,
    expiresAt: new Date(Date.now() + WORK_RESERVATION_MS).toISOString(),
  }, updatedAt: now };
  updateOperation(runId, updated);
  appendEvent(runId, updated.workItemId, updated.operationId, "operation_rereserved_after_expired_lease", {
    priorWorkerId: operation.reservation.workerId, reservation: updated.reservation,
  });
  return updated;
}

function markOperationSent(runId: string, operationId: string, workerId: string): void {
  const operation = operationFromDb(runId, operationId);
  if (!operation || operation.state !== "reserved") throw new Error("rg_operation_send_without_reservation");
  if (operation.reservation.workerId !== workerId || new Date(operation.reservation.expiresAt).getTime() <= Date.now()) {
    throw new Error("rg_operation_send_reservation_invalid");
  }
  const updated: CanonicalRgOperation = { ...operation, state: "sent", receipt: { ...operation.receipt,
    sendState: "sent", calls: 1, reasonCode: "rg_operation_sent" }, updatedAt: nowIso() };
  updateOperation(runId, updated);
  appendEvent(runId, updated.workItemId, updated.operationId, "operation_sent", { receipt: updated.receipt });
}

function settleOperation(runId: string, operation: CanonicalRgOperation,
  state: Extract<CanonicalRgOperation["state"], "completed" | "failed_before_send" | "provider_rejected" | "indeterminate_after_send">,
  result: unknown | null, receipt: RgEvidencePortReceipt | null, reasonCode: string): CanonicalRgOperation {
  const latest = operationFromDb(runId, operation.operationId) ?? operation;
  const updated: CanonicalRgOperation = { ...latest, state, result,
    receipt: { ...latest.receipt,
      sendState: latest.receipt.sendState,
      completionState: state === "completed" ? "completed" : state === "provider_rejected" ? "provider_rejected"
        : state === "indeterminate_after_send" ? "indeterminate" : "failed",
      providerCode: receipt?.providerCode ?? latest.receipt.providerCode,
      providerRequestId: receipt?.providerRequestId ?? latest.receipt.providerRequestId,
      calls: receipt?.calls ?? latest.receipt.calls,
      tokens: receipt?.tokens ?? latest.receipt.tokens,
      retrievalBytes: receipt?.retrievalBytes ?? latest.receipt.retrievalBytes,
      reasonCode,
      providerDiagnostics: receipt?.providerDiagnostics ?? latest.receipt.providerDiagnostics ?? null,
    }, updatedAt: nowIso() };
  updateOperation(runId, updated);
  appendEvent(runId, updated.workItemId, updated.operationId, `operation_${state}`, {
    state, receipt: updated.receipt, resultHash: result === null ? null : digest(result),
  });
  return updated;
}

function updateOperation(runId: string, operation: CanonicalRgOperation): void {
  db.prepare(`UPDATE canonical_rg_operations SET state = ?, operation_json = ?, updated_at = ?
    WHERE run_id = ? AND operation_id = ? AND plan_hash = ?`).run(operation.state, JSON.stringify(operation),
    operation.updatedAt, runId, operation.operationId, operation.planHash);
}

function terminalizeWork(runId: string, original: CanonicalRgWorkItem,
  executionState: CanonicalRgWorkItem["executionState"], progressState: CanonicalRgWorkItem["progress"]["state"],
  stopReason: string, verifiedEvidenceRefs: string[], workerId: string): void {
  const current = workItemFromDb(runId, original.workItemId) ?? original;
  if (current.reservation && current.reservation.workerId !== workerId) throw new Error("rg_work_terminalization_reservation_mismatch");
  const operationCount = Number((db.prepare(`SELECT COUNT(*) AS count FROM canonical_rg_operations WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, current.workItemId) as { count: number }).count);
  const updated: CanonicalRgWorkItem = { ...current, state: "terminal", executionState, reservation: null,
    progress: { state: progressState, operationsAttempted: operationCount, evidenceItemsObserved: verifiedEvidenceRefs.length },
    stopReason, verifiedEvidenceRefs: [...new Set(verifiedEvidenceRefs)].sort() };
  db.prepare(`UPDATE canonical_rg_work_items SET state = ?, execution_state = ?, work_item_json = ?, updated_at = ?
    WHERE run_id = ? AND work_item_id = ?`).run(updated.state, updated.executionState, JSON.stringify(updated),
    nowIso(), runId, updated.workItemId);
  appendEvent(runId, updated.workItemId, null, "work_terminal", { executionState, progressState, stopReason,
    verifiedEvidenceRefs: updated.verifiedEvidenceRefs });
}

function incrementResource(runId: string, workItemId: string, kind: CanonicalRgOperation["kind"], receipt: RgEvidencePortReceipt): void {
  const item = workItemFromDb(runId, workItemId); if (!item) return;
  const currentTokens = item.resourceConsumption.tokens;
  const tokens = receipt.tokens === null || currentTokens === null ? null : currentTokens + receipt.tokens;
  const updated: CanonicalRgWorkItem = { ...item, resourceConsumption: {
    providerCalls: item.resourceConsumption.providerCalls + receipt.calls,
    searchCalls: item.resourceConsumption.searchCalls + (kind === "public_search" ? receipt.calls : 0),
    retrievalBytes: item.resourceConsumption.retrievalBytes + receipt.retrievalBytes,
    aiCalls: item.resourceConsumption.aiCalls + (["investigation", "independent_verification"].includes(kind) ? receipt.calls : 0),
    tokens,
  } };
  db.prepare(`UPDATE canonical_rg_work_items SET work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ?`)
    .run(JSON.stringify(updated), nowIso(), runId, workItemId);
}

function appendExtensionDecision(runId: string, workItemId: string, decision: "extended" | "stopped", reasonCode: string): void {
  const item = workItemFromDb(runId, workItemId); if (!item) return;
  const createdAt = nowIso();
  const entry = { decisionId: `rg-extension-${digest({ runId, workItemId, decision, reasonCode, count: item.extensionDecisions.length })}`,
    decision, reasonCode, createdAt };
  const updated = { ...item, extensionDecisions: [...item.extensionDecisions, entry] };
  db.prepare(`UPDATE canonical_rg_work_items SET work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ?`)
    .run(JSON.stringify(updated), createdAt, runId, workItemId);
  appendEvent(runId, workItemId, null, "extension_decision", entry);
}

function appendRetryDecision(runId: string, workItemId: string, operationId: string,
  decision: "retry" | "no_retry", reasonCode: string): void {
  const item = workItemFromDb(runId, workItemId); if (!item) return;
  const createdAt = nowIso();
  const entry = { decisionId: `rg-retry-${digest({ runId, workItemId, operationId, decision, reasonCode })}`,
    operationId, decision, reasonCode, createdAt };
  const updated = { ...item, retryDecisions: [...item.retryDecisions, entry] };
  db.prepare(`UPDATE canonical_rg_work_items SET work_item_json = ?, updated_at = ? WHERE run_id = ? AND work_item_id = ?`)
    .run(JSON.stringify(updated), createdAt, runId, workItemId);
  appendEvent(runId, workItemId, operationId, "retry_decision", entry);
}

function sanitizeSearchResult(value: CanonicalRgDiscoveryCandidate[]): CanonicalRgDiscoveryCandidate[] {
  return Array.isArray(value) ? value.slice(0, MAX_CANDIDATES_PER_WORK_ITEM).map((item) => ({
    candidateId: item?.candidateId, url: item?.url, title: item?.title, claimedAuthority: item?.claimedAuthority,
    publicationDate: item?.publicationDate, effectiveFrom: item?.effectiveFrom, effectiveTo: item?.effectiveTo,
  })) : [];
}

function sanitizeRetrievedDocument(value: CanonicalRgRetrievedDocument): CanonicalRgRetrievedDocument {
  return {
    candidateId: value?.candidateId, requestedUrl: value?.requestedUrl, finalUrl: value?.finalUrl,
    sourceOrigin: value?.sourceOrigin, documentId: value?.documentId, documentFingerprint: value?.documentFingerprint,
    mimeType: value?.mimeType, byteLength: value?.byteLength, independentlyRetrieved: value?.independentlyRetrieved,
    locators: Array.isArray(value?.locators) ? value.locators.slice(0, 200).map((locator) => ({
      locatorId: locator?.locatorId, page: locator?.page, sectionCode: locator?.sectionCode,
      lineStart: locator?.lineStart, lineEnd: locator?.lineEnd,
      textExcerpt: typeof locator?.textExcerpt === "string" ? locator.textExcerpt.slice(0, 4096) : locator?.textExcerpt,
    })) : [],
  };
}

function sanitizeInvestigatedCandidate(value: CanonicalRgInvestigatedCandidate): CanonicalRgInvestigatedCandidate {
  return {
    investigationId: value?.investigationId, candidateId: value?.candidateId, documentId: value?.documentId,
    documentFingerprint: value?.documentFingerprint, locatorId: value?.locatorId,
    proposedValue: structuredClone(value?.proposedValue), sourceAuthorityCandidate: value?.sourceAuthorityCandidate,
    publisherIdentityCode: value?.publisherIdentityCode, publicationTitle: value?.publicationTitle,
    publicationVersion: value?.publicationVersion, effectiveFrom: value?.effectiveFrom, effectiveTo: value?.effectiveTo,
    limitationCodes: Array.isArray(value?.limitationCodes) ? value.limitationCodes.slice(0, 50) : [],
    financialMutationAllowed: value?.financialMutationAllowed,
  };
}

function sanitizeVerificationJudgment(value: CanonicalRgVerificationJudgment): CanonicalRgVerificationJudgment {
  return {
    frozenCandidateHash: value?.frozenCandidateHash, sourceAuthorityStatus: value?.sourceAuthorityStatus,
    semanticSupportStatus: value?.semanticSupportStatus, exactAtomicClaimSupport: value?.exactAtomicClaimSupport,
    publisherIdentityCode: value?.publisherIdentityCode, authorityLocatorId: value?.authorityLocatorId,
    supportLocatorId: value?.supportLocatorId, scopeStatus: value?.scopeStatus, periodStatus: value?.periodStatus,
    effectiveFrom: value?.effectiveFrom, effectiveTo: value?.effectiveTo,
    limitationCodes: Array.isArray(value?.limitationCodes) ? value.limitationCodes.slice(0, 50) : [],
  };
}

export function projectCanonicalRgReconciledOperationResult(
  kind: CanonicalRgOperation["kind"],
  value: unknown,
): unknown {
  if (kind === "public_search") return sanitizeSearchResult(value as CanonicalRgDiscoveryCandidate[]);
  if (kind === "public_retrieval") return sanitizeRetrievedDocument(value as CanonicalRgRetrievedDocument);
  if (kind === "investigation") return sanitizeInvestigatedCandidate(value as CanonicalRgInvestigatedCandidate);
  return sanitizeVerificationJudgment(value as CanonicalRgVerificationJudgment);
}

function validateSearchCandidates(values: CanonicalRgDiscoveryCandidate[], intent: CanonicalRgSearchIntent): CanonicalRgDiscoveryCandidate[] {
  if (!Array.isArray(values)) return [];
  const output: CanonicalRgDiscoveryCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of values.slice(0, MAX_CANDIDATES_PER_WORK_ITEM)) {
    try {
      const url = normalizeSafeHttpsUrl(candidate.url);
      if (url !== candidate.url || seen.has(url) || !intent.requiredSourceAuthorities.includes(candidate.claimedAuthority)
        || !isSafeId(candidate.candidateId) || !safePublicText(candidate.title, 200)
        || !validNullableDay(candidate.publicationDate) || !validNullableDay(candidate.effectiveFrom)
        || !validNullableDay(candidate.effectiveTo)) continue;
      seen.add(url); output.push(structuredClone(candidate));
    } catch { /* rejected by runtime guard */ }
  }
  return output;
}

function validateRetrievedDocument(document: CanonicalRgRetrievedDocument,
  candidate: CanonicalRgDiscoveryCandidate): CanonicalRgRetrievedDocument | null {
  try {
    const requested = normalizeSafeHttpsUrl(document.requestedUrl);
    const final = normalizeSafeHttpsUrl(document.finalUrl);
    if (document.candidateId !== candidate.candidateId || requested !== candidate.url || final !== requested
      || document.independentlyRetrieved !== true
      || document.sourceOrigin !== new URL(final).origin || !isSafeId(document.documentId)
      || !/^[a-f0-9]{64}$/.test(document.documentFingerprint) || !safePublicText(document.mimeType, 100)
      || !Number.isSafeInteger(document.byteLength) || document.byteLength < 1 || document.byteLength > 5_242_880
      || !Array.isArray(document.locators) || document.locators.length === 0 || document.locators.length > 200) return null;
    const locatorIds = new Set<string>();
    for (const locator of document.locators) {
      if (!isSafeId(locator.locatorId) || !Number.isSafeInteger(locator.lineStart) || !Number.isSafeInteger(locator.lineEnd)
        || locator.lineStart < 1 || locator.lineEnd < locator.lineStart || !safePublicText(locator.textExcerpt, 4096)
        || (locator.page !== null && (!Number.isSafeInteger(locator.page) || locator.page < 1))
        || locatorIds.has(locator.locatorId)) return null;
      locatorIds.add(locator.locatorId);
    }
    return structuredClone(document);
  } catch { return null; }
}

function validateInvestigatedCandidate(value: CanonicalRgInvestigatedCandidate, workItem: CanonicalRgWorkItem,
  admission: CanonicalRgClaimAdmission, candidate: CanonicalRgDiscoveryCandidate,
  document: CanonicalRgRetrievedDocument): CanonicalRgInvestigatedCandidate | null {
  if (!isSafeId(value.investigationId) || value.candidateId !== candidate.candidateId || value.documentId !== document.documentId
    || value.documentFingerprint !== document.documentFingerprint || !document.locators.some((item) => item.locatorId === value.locatorId)
    || value.sourceAuthorityCandidate !== candidate.claimedAuthority || !workItem.requiredSourceAuthorities.includes(value.sourceAuthorityCandidate)
    || !isSafeCode(value.publisherIdentityCode) || !safePublicText(value.publicationTitle, 200)
    || !validNullableDay(value.effectiveFrom) || !validNullableDay(value.effectiveTo)
    || value.financialMutationAllowed !== false || !valueMatchesConstraint(value.proposedValue, workItem.expectedKnowledgeValueConstraint, admission)) return null;
  return structuredClone(value);
}

function freezeCandidate(value: CanonicalRgInvestigatedCandidate, frozenAt: string): CanonicalRgFrozenCandidate {
  return Object.freeze({ ...structuredClone(value), frozenCandidateHash: digest(value), frozenAt });
}

function validateVerification(input: {
  runId: string; planHash: string; intent: CanonicalRgSearchIntent; workItem: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission; candidate: CanonicalRgDiscoveryCandidate;
  document: CanonicalRgRetrievedDocument; frozenCandidate: CanonicalRgFrozenCandidate;
  judgment: CanonicalRgVerificationJudgment;
}): CanonicalRgVerifiedEvidence | null {
  const { judgment, frozenCandidate, document, admission, workItem } = input;
  const locatorIds = new Set(document.locators.map((item) => item.locatorId));
  if (judgment.frozenCandidateHash !== frozenCandidate.frozenCandidateHash
    || judgment.sourceAuthorityStatus !== "verified" || judgment.semanticSupportStatus !== "supported"
    || judgment.exactAtomicClaimSupport !== true || judgment.scopeStatus !== "applicable" || judgment.periodStatus !== "applicable"
    || judgment.publisherIdentityCode !== frozenCandidate.publisherIdentityCode
    || !publisherIdentityApplicable(judgment.publisherIdentityCode, input.intent.publicScope,
      frozenCandidate.sourceAuthorityCandidate)
    || !locatorIds.has(judgment.authorityLocatorId) || !locatorIds.has(judgment.supportLocatorId)
    || !validNullableDay(judgment.effectiveFrom) || !validNullableDay(judgment.effectiveTo)
    || judgment.effectiveFrom !== frozenCandidate.effectiveFrom || judgment.effectiveTo !== frozenCandidate.effectiveTo
    || !periodApplicable(workItem.knowledgeQuery.asOf, judgment.effectiveFrom, judgment.effectiveTo)) return null;
  const investigatorLocator = document.locators.find((item) => item.locatorId === frozenCandidate.locatorId);
  const authorityLocator = document.locators.find((item) => item.locatorId === judgment.authorityLocatorId);
  const supportLocator = document.locators.find((item) => item.locatorId === judgment.supportLocatorId);
  const originPublisherProof = dynamicallyBindPublisherOrigin({
    sourceOrigin: document.sourceOrigin,
    finalUrl: document.finalUrl,
    publisherIdentityCode: judgment.publisherIdentityCode,
    authorityClass: frozenCandidate.sourceAuthorityCandidate,
    publicScope: input.intent.publicScope,
  });
  if (!investigatorLocator || !authorityLocator || !supportLocator || !originPublisherProof) return null;
  const evidenceBase = { runId: input.runId, planHash: input.planHash,
    executionGrantId: workItem.executionAuthorization?.grantId ?? null,
    executionGeneration: workItem.executionAuthorization?.executionGeneration ?? 0,
    workItemId: workItem.workItemId,
    atomicClaimId: admission.atomicClaimId, facet: admission.facet, intentId: input.intent.intentId,
    candidateId: input.candidate.candidateId, documentFingerprint: document.documentFingerprint,
    investigatorLocatorId: investigatorLocator.locatorId, authorityLocatorId: authorityLocator.locatorId,
    supportLocatorId: supportLocator.locatorId, frozenCandidateHash: frozenCandidate.frozenCandidateHash,
    originPublisherBindingId: originPublisherProof.bindingId, scopeFingerprint: admission.scopeFingerprint };
  return {
    schemaVersion: "canonical_rg_verified_evidence_v1_3",
    evidenceId: `rg-evidence-${digest(evidenceBase).slice(0, 32)}`,
    ...evidenceBase,
    sourceUrl: document.finalUrl,
    sourceOrigin: document.sourceOrigin,
    sourceAuthority: frozenCandidate.sourceAuthorityCandidate,
    publisherIdentityCode: frozenCandidate.publisherIdentityCode,
    publicationTitle: frozenCandidate.publicationTitle,
    publicationVersion: frozenCandidate.publicationVersion,
    documentId: document.documentId,
    authorityLocatorExcerpt: authorityLocator.textExcerpt,
    supportLocatorExcerpt: supportLocator.textExcerpt,
    originPublisherProof,
    proposedValue: structuredClone(frozenCandidate.proposedValue),
    effectiveFrom: judgment.effectiveFrom,
    effectiveTo: judgment.effectiveTo,
    applicabilityScope: structuredClone(input.intent.publicScope),
    scopeFingerprint: admission.scopeFingerprint,
    statementPeriod: admission.statementPeriod,
    currentRunSupport: "verified_claim_scoped_candidate_support",
    reusableKnowledgeState: "candidate_not_promoted",
    rfAdmissionAuthority: "none",
    automaticKnowledgePromotion: false,
    canonicalFinancialMutationAllowed: false,
    limitations: [...new Set([...frozenCandidate.limitationCodes, ...judgment.limitationCodes])].sort(),
  };
}

function publisherIdentityApplicable(publisherIdentityCode: string, publicScope: Record<string, string>,
  authority: CanonicalRgVerifiedEvidence["sourceAuthority"]): boolean {
  const identities = authority === "official_network_publication"
    ? [publicScope.network]
    : [publicScope.processor, publicScope.processorProgram, publicScope.acquirer, publicScope.isoReseller];
  return identities.includes(publisherIdentityCode);
}

function valueMatchesConstraint(value: CanonicalRgClaimValue, constraint: CanonicalRgWorkItem["expectedKnowledgeValueConstraint"],
  admission: CanonicalRgClaimAdmission): boolean {
  if (!value || typeof value !== "object") return false;
  if (constraint.kind === "mapping") return value.kind === "mapping" && value.sourceCode === constraint.sourceCode
    && isSafeCode(value.canonicalCode);
  if (constraint.kind === "role") return value.kind === "role" && value.controlDimension === constraint.controlDimension
    && ["proven", "unresolved", "conflicting", "unavailable", "not_applicable"].includes(value.state)
    && (value.participantRole === null || isSafeCode(value.participantRole));
  if (constraint.kind === "boolean") return value.kind === "boolean" && typeof value.value === "boolean"
    && admission.facet === "merchant_lever";
  if (constraint.kind === "synthesis_constraint_identity") return value.kind === constraint.kind
    && ["applicable", "not_applicable"].includes(value.applicability) && isSafeCode(value.governingAuthorityCode);
  if (constraint.kind === "synthesis_economic_driver") return value.kind === constraint.kind
    && isSafeCode(value.driverType) && isSafeCode(value.populationPredicateCode);
  if (constraint.kind === "synthesis_recurrence") return value.kind === constraint.kind
    && value.recurrenceBasis === constraint.recurrenceBasis
    && Number.isFinite(value.occurrencesPerYear) && value.occurrencesPerYear > 0 && value.occurrencesPerYear <= 366;
  if (constraint.kind === "synthesis_counterfactual") return value.kind === constraint.kind
    && ["verification_only", "exact_deterministic_delta"].includes(value.resultState)
    && value.currency === "USD" && (value.alternativeAmountMinor === null
      || Number.isSafeInteger(value.alternativeAmountMinor) && value.alternativeAmountMinor >= 0)
    && (value.resultState === "verification_only" ? value.alternativeAmountMinor === null : value.alternativeAmountMinor !== null)
    && Array.isArray(value.assumptionCodes) && value.assumptionCodes.every(isSafeCode)
    && Array.isArray(value.implementationDependencyCodes) && value.implementationDependencyCodes.every(isSafeCode);
  if (constraint.kind === "synthesis_safe_action") return value.kind === constraint.kind
    && constraint.allowedSafeActionCodes.includes(value.safeActionCode)
    && isSafeCode(value.safeActionCode) && isSafeCode(value.mechanismCode)
    && (value.verificationRequirementCode === null || isSafeCode(value.verificationRequirementCode))
    && (value.requestTargetCode === null || isSafeCode(value.requestTargetCode))
    && Array.isArray(value.implementationDependencyCodes) && value.implementationDependencyCodes.every(isSafeCode)
    && (!["request_governing_documentation", "verify_account_capability_or_configuration",
      "request_pricing_application_review"].includes(value.safeActionCode)
      || value.verificationRequirementCode !== null);
  if (constraint.kind === "synthesis_merchant_influence") return value.kind === constraint.kind
    && value.safeActionCode === constraint.safeActionCode && value.influenceKind === constraint.influenceKind;
  if (constraint.kind === "synthesis_constraint_action_effect") return value.kind === constraint.kind
    && value.safeActionCode === constraint.safeActionCode && value.constraintAtomicClaimId === constraint.constraintAtomicClaimId;
  return value.kind === "synthesis_condition_state" && value.safeActionCode === constraint.safeActionCode
    && value.constraintAtomicClaimId === constraint.constraintAtomicClaimId && value.conditionCode === constraint.conditionCode;
}

function periodApplicable(asOf: string, effectiveFrom: string | null, effectiveTo: string | null): boolean {
  return (effectiveFrom === null || asOf >= effectiveFrom) && (effectiveTo === null || asOf < effectiveTo);
}

function workItemFromDb(runId: string, workItemId: string): CanonicalRgWorkItem | null {
  const row = db.prepare(`SELECT work_item_json FROM canonical_rg_work_items WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, workItemId) as { work_item_json: string } | undefined;
  return row ? JSON.parse(row.work_item_json) as CanonicalRgWorkItem : null;
}

function operationFromDb(runId: string, operationId: string): CanonicalRgOperation | null {
  const row = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ? AND operation_id = ?`)
    .get(runId, operationId) as { operation_json: string } | undefined;
  return row ? JSON.parse(row.operation_json) as CanonicalRgOperation : null;
}

function planHashForWork(runId: string, workItemId: string): string {
  const row = db.prepare(`SELECT plan_hash FROM canonical_rg_work_items WHERE run_id = ? AND work_item_id = ?`)
    .get(runId, workItemId) as { plan_hash: string } | undefined;
  return row?.plan_hash ?? "";
}

function validateExecutionGrantBinding(persisted: PersistedAnalysisRunRecord,
  grant: CanonicalContinuationExecutionGrant, cycleOwnerId: string | undefined): void {
  if (!cycleOwnerId) throw new Error("rg_evidence_continuation_cycle_owner_required");
  const lease = db.prepare(`SELECT adaptive_cycle_owner, adaptive_cycle_lease_expires_at FROM canonical_analysis_runs WHERE id = ?`)
    .get(persisted.id) as { adaptive_cycle_owner: string | null; adaptive_cycle_lease_expires_at: string | null } | undefined;
  if (!lease || lease.adaptive_cycle_owner !== cycleOwnerId || !lease.adaptive_cycle_lease_expires_at
    || lease.adaptive_cycle_lease_expires_at <= new Date().toISOString()) throw new Error("rg_evidence_continuation_cycle_lease_invalid");
  const work = persisted.rgWorkItems.find((item) => item.workItemId === grant.baseWorkItemId);
  const admission = persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === grant.atomicClaimId);
  if (grant.runId !== persisted.id || grant.executionGeneration !== persisted.rgExecutionGeneration
    || grant.controllerRevision !== persisted.continuationRevision
    || grant.continuationStateHash !== persisted.continuationStateHash
    || grant.binding.semanticRevision !== persisted.semanticRevision || grant.binding.semanticHash !== persisted.semanticHash
    || grant.binding.canonicalStateHash !== persisted.canonicalStateHash || grant.binding.planHash !== persisted.rgPlanHash
    || grant.binding.planGeneration !== persisted.rgPlanGeneration || grant.binding.rfSnapshotHash !== persisted.rfSnapshotHash
    || !work || !admission || work.atomicClaimId !== grant.atomicClaimId
    || work.executionAuthorization?.grantId !== grant.grantId
    || work.executionAuthorization.effectiveWorkContractFingerprint !== grant.effectiveWorkContractFingerprint
    || canonicalRgWorkContractFingerprint(admission, work) !== grant.effectiveWorkContractFingerprint) {
    throw new Error("rg_evidence_continuation_grant_binding_invalid");
  }
}

function operationalCeilingReason(runId: string,
  grant: CanonicalContinuationExecutionGrant | null,
  generationZero: GenerationZeroOperationalScope | null = null): string | null {
  if (!grant && !generationZero) return null;
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ?`)
    .all(runId) as Array<{ operation_json: string }>;
  const allOperations = rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation);
  if (generationZero) {
    const currentOperations = allOperations.filter((item) => item.planHash === generationZero.planHash
      && (item.executionGrantId ?? null) === null && !generationZero.existingOperationIds.has(item.operationId));
    const providerCalls = generationZero.baseline.providerCalls
      + currentOperations.reduce((sum, item) => sum + item.receipt.calls, 0);
    const retrievalBytes = generationZero.baseline.retrievalBytes
      + currentOperations.reduce((sum, item) => sum + item.receipt.retrievalBytes, 0);
    const elapsedMs = generationZero.baseline.elapsedMsObserved
      + Math.max(0, Date.now() - generationZero.cycleStartedAtMs);
    if (providerCalls >= generationZero.policy.maximumCumulativeProviderCalls) {
      return "rg_generation_zero_emergency_cumulative_provider_call_ceiling_reached_not_analytical_completion";
    }
    if (retrievalBytes >= generationZero.policy.maximumCumulativeRetrievalBytes) {
      return "rg_generation_zero_emergency_cumulative_retrieval_byte_ceiling_reached_not_analytical_completion";
    }
    if (elapsedMs >= generationZero.policy.maximumCumulativeElapsedMs) {
      return "rg_generation_zero_emergency_cumulative_elapsed_ceiling_reached_not_analytical_completion";
    }
    return null;
  }
  const operations = allOperations.filter((item) => (item.executionGrantId ?? null) === grant!.grantId);
  const currentCalls = operations.reduce((sum, item) => sum + item.receipt.calls, 0);
  const currentBytes = operations.reduce((sum, item) => sum + item.receipt.retrievalBytes, 0);
  const elapsed = Math.max(0, Date.now() - Date.parse(grant!.createdAt));
  if (grant!.resourceBaseline.providerCalls + currentCalls >= grant!.operationalPolicy.maximumCumulativeProviderCalls) {
    return "rg_emergency_cumulative_provider_call_ceiling_reached_not_analytical_completion";
  }
  if (grant!.resourceBaseline.retrievalBytes + currentBytes >= grant!.operationalPolicy.maximumCumulativeRetrievalBytes) {
    return "rg_emergency_cumulative_retrieval_byte_ceiling_reached_not_analytical_completion";
  }
  if (grant!.resourceBaseline.elapsedMsObserved + elapsed >= grant!.operationalPolicy.maximumCumulativeElapsedMs) {
    return "rg_emergency_cumulative_elapsed_ceiling_reached_not_analytical_completion";
  }
  return null;
}

function createGenerationZeroOperationalScope(
  runId: string,
  planHash: string,
  policy: CanonicalAdaptiveOperationalPolicy,
): GenerationZeroOperationalScope {
  validateGenerationZeroOperationalPolicy(policy);
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ?`)
    .all(runId) as Array<{ operation_json: string }>;
  const existing = rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation)
    .filter((item) => item.planHash === planHash && (item.executionGrantId ?? null) === null);
  return {
    policy: structuredClone(policy),
    planHash,
    cycleStartedAtMs: Date.now(),
    baseline: {
      providerCalls: existing.reduce((sum, item) => sum + item.receipt.calls, 0),
      retrievalBytes: existing.reduce((sum, item) => sum + item.receipt.retrievalBytes, 0),
      elapsedMsObserved: existing.reduce((sum, item) => sum
        + Math.max(0, Date.parse(item.updatedAt) - Date.parse(item.createdAt)), 0),
    },
    existingOperationIds: new Set(existing.map((item) => item.operationId)),
  };
}

function validateGenerationZeroOperationalPolicy(policy: CanonicalAdaptiveOperationalPolicy): void {
  if (policy.authority !== "deployment_emergency_circuit_breaker_only"
    || policy.analyticalCompletionAuthority !== "none" || policy.maximumConcurrentWork !== 1
    || !Number.isSafeInteger(policy.maximumCumulativeProviderCalls) || policy.maximumCumulativeProviderCalls < 1
    || !Number.isSafeInteger(policy.maximumCumulativeRetrievalBytes) || policy.maximumCumulativeRetrievalBytes < 1
    || !Number.isSafeInteger(policy.maximumCumulativeElapsedMs) || policy.maximumCumulativeElapsedMs < 1) {
    throw new Error("rg_generation_zero_operational_policy_invalid");
  }
}

function validateRuntimeReadiness(ports: CanonicalRgEvidenceExecutionPorts): void {
  const readiness = ports.runtimeReadiness;
  if (!readiness) return;
  const { readinessHash, ...base } = readiness;
  const validBindings = readiness.providerBindings.every((binding) =>
    ["public_search", "investigation", "independent_verification"].includes(binding.operation)
    && /^[a-z][a-z0-9_]{0,95}$/.test(binding.providerCode)
    && /^[a-z0-9][a-z0-9_]{0,95}$/.test(binding.modelCode)
    && ["https://openrouter.ai", "https://api.openai.com"].includes(binding.endpointOrigin));
  if (readiness.schemaVersion !== "canonical_rg_runtime_readiness_v1"
    || readiness.authorization !== "standing_provider_authorization"
    || readiness.bindingSource !== "production_process_environment"
    || readiness.availability !== ports.availability
    || readiness.privacy.publicSearch !== "validated_public_concepts_only"
    || readiness.privacy.approvedAiContext !== "complete_analysis_run_permitted"
    || readiness.privacy.providerStorage !== "disabled"
    || readiness.privacy.secretPersistence !== "prohibited"
    || !/^[a-f0-9]{64}$/.test(readiness.configurationHash)
    || readinessHash !== digest(base) || !validBindings
    || (readiness.availability === "available" && readiness.providerBindings.length !== 3)
    || (readiness.availability === "unavailable" && (readiness.providerBindings.length !== 0
      || readiness.reasonCodes.join("\0") !== ports.unavailabilityReasonCodes.join("\0")))) {
    throw new Error("rg_runtime_readiness_binding_invalid");
  }
}

function verifiedEvidenceFromOperations(runId: string, workItemId: string,
  executionGrantId: string | null): CanonicalRgVerifiedEvidence[] {
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations
    WHERE run_id = ? AND work_item_id = ? AND state = 'completed' ORDER BY operation_id`).all(runId, workItemId) as Array<{ operation_json: string }>;
  return rows.map((row) => JSON.parse(row.operation_json) as CanonicalRgOperation)
    .filter((operation) => operation.kind === "independent_verification"
      && (operation.executionGrantId ?? null) === executionGrantId)
    .flatMap((operation) => {
      const result = operation.result as { judgment?: CanonicalRgVerificationJudgment; verifiedEvidence?: CanonicalRgVerifiedEvidence } | null;
      return result?.judgment?.semanticSupportStatus === "supported"
        && persistedVerifiedEvidenceIntegrityValid(result.verifiedEvidence) ? [result.verifiedEvidence] : [];
    });
}


function attachVerifiedEvidence(runId: string, operation: CanonicalRgOperation, evidence: CanonicalRgVerifiedEvidence): void {
  const current = operationFromDb(runId, operation.operationId);
  if (!current || current.state !== "completed") throw new Error("rg_verified_evidence_operation_not_completed");
  const existingEnvelope = verificationEnvelopeFromResult(current.result);
  if (existingEnvelope) {
    if (!persistedVerifiedEvidenceIntegrityValid(existingEnvelope.verifiedEvidence)
      || digest(existingEnvelope.verifiedEvidence) !== digest(evidence)) {
      throw new Error("rg_verified_evidence_replay_mismatch");
    }
    return;
  }
  const judgment = current.result as CanonicalRgVerificationJudgment;
  const updated = { ...current, result: { judgment, verifiedEvidence: evidence }, updatedAt: nowIso() };
  updateOperation(runId, updated);
  appendEvent(runId, current.workItemId, current.operationId, "verified_evidence_persisted", {
    evidenceId: evidence.evidenceId, evidenceHash: digest(evidence), atomicClaimId: evidence.atomicClaimId,
    documentFingerprint: evidence.documentFingerprint, authorityLocatorId: evidence.authorityLocatorId,
    supportLocatorId: evidence.supportLocatorId, originPublisherBindingId: evidence.originPublisherProof.bindingId,
    automaticKnowledgePromotion: false, canonicalFinancialMutationAllowed: false,
  });
}

function appendEvent(runId: string, workItemId: string, operationId: string | null, eventType: string, event: unknown): void {
  const createdAt = nowIso();
  const eventHash = digest({ runId, workItemId, operationId, eventType, event });
  const eventId = `rg-event-${digest({ eventHash, createdAt, nonce: randomUUID() })}`;
  db.prepare(`INSERT INTO canonical_rg_execution_events
    (event_id, run_id, work_item_id, operation_id, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(eventId, runId, workItemId, operationId, eventType,
    JSON.stringify(event), eventHash, createdAt);
}

export function appendCanonicalRgExecutionEvent(
  runId: string,
  workItemId: string,
  operationId: string | null,
  eventType: string,
  event: unknown,
): void {
  appendEvent(runId, workItemId, operationId, eventType, event);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
}
function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(value);
}
function safePublicText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}
function validNullableDay(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function safeReason(error: unknown): string {
  const value = error instanceof Error ? error.message : "rg_operation_failed";
  return /^[a-z][a-z0-9_:.-]{0,191}$/.test(value) ? value : "rg_operation_failed";
}
function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}
