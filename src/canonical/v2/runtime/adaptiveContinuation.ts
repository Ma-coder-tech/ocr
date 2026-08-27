import { createHash } from "node:crypto";

import { db, nowIso } from "../../../db.js";
import { canonicalJson } from "../canonicalJson.js";
import { dynamicallyBindPublisherOrigin } from "./rgPublisherOriginAuthority.js";
import type { CanonicalRgVerificationJudgment } from "./rgEvidenceExecution.js";
import type { CanonicalRgClaimAdmission, CanonicalRgOperation, CanonicalRgWorkItem } from "./rgWorkLedger.js";
import { getPersistedAnalysisRun, type PersistedAnalysisRunRecord } from "./analysisRunStore.js";
import {
  ADAPTIVE_CONTINUATION_SCHEMA_VERSION,
  type CanonicalAdaptiveContinuationState,
  type CanonicalClaimContinuationDecision,
  type CanonicalContinuationDegradation,
  type CanonicalContinuationOperationDelta,
  type CanonicalContinuationProgress,
  type CanonicalContinuationResourceAccounting,
} from "./adaptiveContinuationTypes.js";

type WorkAttempt = {
  planHash: string;
  work: CanonicalRgWorkItem;
  admission: CanonicalRgClaimAdmission | null;
  operations: CanonicalRgOperation[];
};

const EMPTY_RESOURCE: CanonicalContinuationResourceAccounting = {
  providerCalls: 0,
  searchCalls: 0,
  aiCalls: 0,
  tokensObserved: 0,
  tokenAccountingComplete: true,
  retrievalBytes: 0,
  retrievalDocuments: 0,
  retries: 0,
  operationReservations: 0,
  workReservations: 0,
  elapsedMsObserved: 0,
  providerCodes: [],
  terminalReasons: [],
};

export function adjudicateDurableCanonicalContinuation(input: {
  runId: string;
  expectedSemanticRevision?: number;
  expectedSemanticHash?: string | null;
  expectedPlanHash?: string | null;
}): CanonicalAdaptiveContinuationState {
  const persisted = getPersistedAnalysisRun(input.runId);
  if (!persisted?.result) throw new Error("adaptive_continuation_analysis_run_unavailable");
  const planHash = persisted.result.artifacts.rgWorkLedger?.planHash ?? null;
  if (input.expectedSemanticRevision !== undefined && input.expectedSemanticRevision !== persisted.semanticRevision) {
    throw new Error("adaptive_continuation_stale_semantic_revision");
  }
  if (input.expectedSemanticHash !== undefined && input.expectedSemanticHash !== persisted.semanticHash) {
    throw new Error("adaptive_continuation_stale_semantic_hash");
  }
  if (input.expectedPlanHash !== undefined && input.expectedPlanHash !== planHash) {
    throw new Error("adaptive_continuation_stale_plan_generation");
  }

  const built = buildAdaptiveContinuationState(persisted);
  const existing = persisted.continuationRevisions.find((item) => item.stateHash === built.stateHash);
  if (existing) return existing;
  return persistContinuationState(persisted, built);
}

export function buildAdaptiveContinuationState(
  persisted: PersistedAnalysisRunRecord,
): CanonicalAdaptiveContinuationState {
  if (!persisted.result) throw new Error("adaptive_continuation_analysis_run_unavailable");
  const planHash = persisted.result.artifacts.rgWorkLedger?.planHash ?? null;
  const history = collectAttempts(persisted, planHash);
  const latestSemantic = persisted.semanticRevisions.at(-1);
  const semanticDispositionByClaim = new Map(latestSemantic?.applications.map((item) => [item.atomicClaimId, item]) ?? []);
  const resolvedAtoms = new Set(persisted.result.artifacts.rd?.economicLayer.semanticApplications
    .map((item) => item.atomicClaimId) ?? []);
  const currentAdmissionByClaim = new Map(persisted.rgClaimAdmissions.map((item) => [item.atomicClaimId, item]));
  const currentWorkByClaim = new Map(persisted.rgWorkItems.map((item) => [item.atomicClaimId, item]));
  const priorDecisionByClaim = new Map<string, CanonicalClaimContinuationDecision>();
  for (const revision of persisted.continuationRevisions) {
    for (const decision of revision.decisions) priorDecisionByClaim.set(decision.atomicClaimId, decision);
  }
  const atomicClaimIds = unique([
    ...currentAdmissionByClaim.keys(),
    ...priorDecisionByClaim.keys(),
    ...history.map((item) => item.work.atomicClaimId),
  ]);
  const decisions: CanonicalClaimContinuationDecision[] = [];
  for (const atomicClaimId of atomicClaimIds) {
    const admission = currentAdmissionByClaim.get(atomicClaimId)
      ?? latestHistoricalAdmission(history, atomicClaimId)
      ?? admissionFromPriorDecision(priorDecisionByClaim.get(atomicClaimId));
    if (!admission) continue;
    const currentWork = currentWorkByClaim.get(atomicClaimId) ?? null;
    const attempts = history.filter((item) => item.work.atomicClaimId === atomicClaimId);
    const semanticDisposition = semanticDispositionByClaim.get(atomicClaimId);
    decisions.push(decideClaim({ persisted, planHash: planHash ?? "", admission, currentWork, attempts,
      priorDecision: priorDecisionByClaim.get(atomicClaimId) ?? null,
      semanticDisposition, resolved: resolvedAtoms.has(atomicClaimId) }));
  }
  decisions.sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId));
  const lifecycle = lifecycleFor(decisions);
  const continuationReadyAtomicClaimIds = decisions.filter((item) =>
    item.disposition === "newly_eligible" || item.disposition === "justified_refinement")
    .map((item) => item.atomicClaimId).sort();
  const reasonCodes = lifecycleReasons(lifecycle, decisions);
  const cumulativeResource = aggregateResources(history, persisted.rgExecutionEvents);
  const binding = {
    semanticRevision: persisted.semanticRevision,
    semanticHash: persisted.semanticHash,
    canonicalStateHash: persisted.canonicalStateHash,
    planHash,
    rfSnapshotHash: persisted.rfSnapshotHash,
  };
  const stateHash = digest({ schemaVersion: ADAPTIVE_CONTINUATION_SCHEMA_VERSION, runId: persisted.id, binding,
    lifecycle, decisions, cumulativeResource, continuationReadyAtomicClaimIds,
    providerExecution: "regenerated_plan_disabled", secondPassProviderCalls: 0, reasonCodes });
  return {
    schemaVersion: ADAPTIVE_CONTINUATION_SCHEMA_VERSION,
    runId: persisted.id,
    controllerRevision: persisted.continuationRevision + 1,
    binding,
    lifecycle,
    decisions,
    cumulativeResource,
    continuationReadyAtomicClaimIds,
    providerExecution: "regenerated_plan_disabled",
    secondPassProviderCalls: 0,
    stateHash,
    reasonCodes,
    createdAt: nowIso(),
  };
}

function decideClaim(input: {
  persisted: PersistedAnalysisRunRecord;
  planHash: string;
  admission: CanonicalRgClaimAdmission;
  currentWork: CanonicalRgWorkItem | null;
  attempts: WorkAttempt[];
  priorDecision: CanonicalClaimContinuationDecision | null;
  semanticDisposition: PersistedAnalysisRunRecord["semanticRevisions"][number]["applications"][number] | undefined;
  resolved: boolean;
}): CanonicalClaimContinuationDecision {
  const currentFingerprint = input.currentWork ? workContractFingerprint(input.admission, input.currentWork) : null;
  const priorFingerprints = unique(input.attempts.filter((item) => item.planHash !== input.planHash).map((item) => item.admission
    ? workContractFingerprint(item.admission, item.work)
    : digest(workProjection(item.work))));
  const evidenceRefs = unique([
    ...input.attempts.flatMap((item) => item.work.verifiedEvidenceRefs),
    ...(input.semanticDisposition?.evidenceRefs ?? []),
  ]);
  const progress = uniqueProgress(input.attempts.flatMap(progressForAttempt));
  const cumulativeResource = aggregateResources(input.attempts, input.persisted.rgExecutionEvents);
  const base = {
    atomicClaimId: input.admission.atomicClaimId,
    claimClass: input.admission.claimClass,
    facet: input.admission.facet,
    currentPlanHash: input.planHash,
    currentWorkItemId: input.currentWork?.workItemId ?? null,
    currentWorkContractFingerprint: currentFingerprint,
    priorWorkContractFingerprints: priorFingerprints,
    materiality: input.admission.materiality,
    decisionTier: input.admission.decisionTier,
    evidenceRefs,
    progress,
    cumulativeResource,
    regeneratedProviderExecution: "disabled" as const,
  };
  const make = (disposition: CanonicalClaimContinuationDecision["disposition"], reasonCodes: string[],
    degradation: CanonicalContinuationDegradation | null = null,
    nextOperationDelta: CanonicalContinuationOperationDelta | null = null): CanonicalClaimContinuationDecision => {
    const decisionId = `continuation-${digest({ ...base, disposition, reasonCodes, degradation, nextOperationDelta }).slice(0, 32)}`;
    return { decisionId, ...base, disposition, nextOperationDelta, degradation, reasonCodes: unique(reasonCodes) };
  };

  if (input.resolved || input.semanticDisposition?.disposition === "applied" ||
    input.semanticDisposition?.disposition === "already_resolved_by_rf") {
    return make("already_resolved", ["exact_atomic_claim_supported_to_current_permitted_ceiling"]);
  }
  if (input.semanticDisposition?.disposition === "verified_but_unapplied_contract_insufficient" ||
    input.semanticDisposition?.disposition === "withheld_conflicting_rf_and_rg" ||
    input.semanticDisposition?.disposition === "withheld_conflicting_current_run_evidence") {
    return make("verified_but_canonically_unapplied", [input.semanticDisposition.disposition,
      "canonical_representability_unchanged_no_repeat_research"]);
  }
  const latestAttempt = latestAttemptFor(input.attempts, input.currentWork);
  if (latestAttempt?.work.executionState === "completed_verified_evidence") {
    return make("convergence_required", ["new_verified_evidence_requires_deterministic_semantic_convergence"]);
  }
  const degradation = latestAttempt ? degradationFor(latestAttempt.work) : null;
  if (degradation) {
    const disposition = degradation.continuationPermission === "bounded_retry_eligible"
      ? "operationally_degraded_retry_eligible"
      : degradation.continuationPermission === "reconciliation_required"
        ? "operationally_degraded_reconciliation_required"
        : "operationally_degraded_withheld";
    return make(disposition, degradation.reasonCodes, degradation);
  }
  if (!input.currentWork) {
    if (["withheld_non_public_evidence_required", "withheld_no_authorized_research_mapping"].includes(input.admission.researchAdmission)) {
      return make("safely_unresolved", [input.admission.researchAdmission,
        "evidence_objective_not_resolvable_through_authorized_public_channel"]);
    }
    if (input.admission.researchAdmission === "withheld_rf_catalog_unavailable") {
      const unavailable: CanonicalContinuationDegradation = { subtype: "other_operational_failure",
        continuationPermission: "withheld_operationally", reasonCodes: ["bound_rf_catalog_unavailable"] };
      return make("operationally_degraded_withheld", unavailable.reasonCodes, unavailable);
    }
    return make("not_eligible", [input.admission.researchAdmission, `materiality_${input.admission.materiality}`]);
  }
  if (input.currentWork.executionState === "planned_for_durable_execution") {
    const priorSameContract = input.attempts.filter((item) => item.planHash !== input.planHash && item.admission &&
      workContractFingerprint(item.admission, item.work) === currentFingerprint);
    const refinable = latestProgressDelta(priorSameContract, currentFingerprint!, input.currentWork.evidenceObjective);
    if (refinable) return make("justified_refinement", ["concrete_prior_progress_and_changed_next_evidence_objective"], null, refinable);
    if (priorSameContract.some((item) => item.work.executionState === "completed_unresolved")) {
      if (repeatedNonImprovingAttempts(priorSameContract)) {
        return make("safely_unresolved", ["cumulative_repeated_non_improving_attempts", "diminishing_returns_established"]);
      }
      return make("continuation_uncertain_not_authorized", ["unchanged_work_contract_after_weak_unresolved_outcome",
        "no_concrete_refinement_delta"]);
    }
    if (input.priorDecision && input.priorDecision.disposition === "not_eligible") {
      return make("newly_eligible", ["previously_noneligible_claim_now_has_material_research_authority",
        "work_contract_authority_changed"]);
    }
    if (input.attempts.some((item) => item.planHash !== input.planHash)) {
      return make("newly_eligible", ["work_contract_materiality_scope_or_permission_basis_changed"]);
    }
    return make("newly_eligible", ["first_admitted_material_work_contract"]);
  }
  if (input.currentWork.executionState === "completed_unresolved") {
    const refinable = latestProgressDelta([latestAttempt!], currentFingerprint!, input.currentWork.evidenceObjective);
    if (refinable) return make("justified_refinement", ["concrete_progress_exposes_legitimately_resolvable_gap"], null, refinable);
    const unresolvedAttempts = input.attempts.filter((item) => item.work.executionState === "completed_unresolved");
    if (repeatedNonImprovingAttempts(unresolvedAttempts)) {
      return make("safely_unresolved", ["cumulative_repeated_non_improving_attempts", "diminishing_returns_established"]);
    }
    return make("continuation_uncertain_not_authorized", [input.currentWork.stopReason ?? "research_outcome_unresolved",
      "single_weak_outcome_is_not_analytical_exhaustion", "no_concrete_refinement_delta"]);
  }
  return make("continuation_uncertain_not_authorized", ["work_state_not_admissible_for_continuation"]);
}

function collectAttempts(persisted: PersistedAnalysisRunRecord, currentPlanHash: string | null): WorkAttempt[] {
  const archivedClaims = new Map<string, CanonicalRgClaimAdmission>();
  const archivedWorks = new Map<string, { planHash: string; work: CanonicalRgWorkItem }>();
  const archivedOperations = new Map<string, CanonicalRgOperation>();
  for (const event of persisted.rgExecutionEvents.filter((item) => item.eventType === "superseded_plan_snapshot")) {
    const value = record(event.event);
    const planHash = string(value.priorPlanHash);
    if (!planHash) continue;
    const admission = value.claimAdmission as CanonicalRgClaimAdmission | undefined;
    const work = value.workItem as CanonicalRgWorkItem | undefined;
    const operation = value.operation as CanonicalRgOperation | undefined;
    if (admission?.atomicClaimId) archivedClaims.set(`${planHash}:${admission.atomicClaimId}`, admission);
    if (work?.workItemId) archivedWorks.set(`${planHash}:${work.workItemId}`, { planHash, work });
    if (operation?.operationId) archivedOperations.set(`${planHash}:${operation.operationId}`, operation);
  }
  const attempts: WorkAttempt[] = [];
  for (const { planHash, work } of archivedWorks.values()) {
    attempts.push({ planHash, work, admission: archivedClaims.get(`${planHash}:${work.atomicClaimId}`) ?? null,
      operations: [...archivedOperations.values()].filter((item) => item.planHash === planHash && item.workItemId === work.workItemId) });
  }
  if (currentPlanHash) {
    for (const work of persisted.rgWorkItems) {
      attempts.push({ planHash: currentPlanHash, work,
        admission: persisted.rgClaimAdmissions.find((item) => item.atomicClaimId === work.atomicClaimId) ?? null,
        operations: persisted.rgOperations.filter((item) => item.workItemId === work.workItemId && item.planHash === currentPlanHash) });
    }
  }
  return attempts.sort((left, right) => left.planHash.localeCompare(right.planHash) ||
    left.work.workItemId.localeCompare(right.work.workItemId));
}

function progressForAttempt(attempt: WorkAttempt): CanonicalContinuationProgress[] {
  if (!attempt.admission) return [];
  const output: CanonicalContinuationProgress[] = [];
  for (const verification of attempt.operations.filter((item) => item.kind === "independent_verification" && item.state === "completed")) {
    const result = record(verification.result);
    const judgment = (result.judgment ?? result) as CanonicalRgVerificationJudgment;
    if (judgment.sourceAuthorityStatus !== "verified") continue;
    const retrieval = attempt.operations.find((item) => item.kind === "public_retrieval" &&
      item.candidateId === verification.candidateId && item.state === "completed");
    const investigation = attempt.operations.find((item) => item.kind === "investigation" &&
      item.candidateId === verification.candidateId && item.state === "completed");
    const document = record(retrieval?.result);
    const investigated = record(investigation?.result);
    const publicScope = Object.fromEntries(Object.entries(attempt.work.knowledgeQuery.scope)
      .filter(([key, value]) => key !== "tenantRef" && key !== "accountRef" && typeof value === "string")) as Record<string, string>;
    const authorityClass = string(investigated.sourceAuthorityCandidate);
    const publisherIdentityCode = string(judgment.publisherIdentityCode);
    if (!retrieval || !investigation || !verification.candidateId || !authorityClass || !publisherIdentityCode) continue;
    const proof = dynamicallyBindPublisherOrigin({ sourceOrigin: string(document.sourceOrigin), finalUrl: string(document.finalUrl),
      publisherIdentityCode, authorityClass: authorityClass as "official_network_publication" | "processor_publication",
      publicScope });
    const documentFingerprint = string(document.documentFingerprint);
    if (!proof || !documentFingerprint) continue;
    const common = { sourcePlanHash: attempt.planHash, workItemId: attempt.work.workItemId,
      operationId: verification.operationId, candidateId: verification.candidateId, documentFingerprint,
      authorityBindingId: proof.bindingId };
    if (judgment.periodStatus === "wrong_period" && !periodApplies(attempt.work.knowledgeQuery.asOf,
      judgment.effectiveFrom, judgment.effectiveTo)) output.push({ kind: "correct_authority_wrong_period", ...common,
      remainingGap: "period_applicable_official_publication_required" });
    else if (judgment.scopeStatus === "wrong_scope" && judgment.semanticSupportStatus === "supported") {
      output.push({ kind: "refinable_scope_mismatch", ...common,
        remainingGap: "scope_applicable_official_publication_required" });
    } else if (judgment.scopeStatus === "applicable" && judgment.periodStatus === "applicable" &&
      ["partial", "unsupported"].includes(judgment.semanticSupportStatus)) {
      output.push({ kind: "official_document_insufficient_locator_or_subsection", ...common,
        remainingGap: "exact_support_locator_or_subsection_required" });
    }
  }
  return output;
}

function latestProgressDelta(attempts: WorkAttempt[], currentFingerprint: string,
  evidenceObjective: string): CanonicalContinuationOperationDelta | null {
  const progress = attempts.flatMap(progressForAttempt).at(-1);
  if (!progress) return null;
  const kind = progress.kind === "correct_authority_wrong_period" ? "period_refinement"
    : progress.kind === "refinable_scope_mismatch" ? "scope_refinement" : "locator_subsection_refinement";
  const nextEvidenceObjective = `${evidenceObjective} Refinement gap: ${progress.remainingGap}. Exclude previously insufficient document fingerprints.`;
  const nextWorkContractFingerprint = digest({ priorWorkContractFingerprint: currentFingerprint, kind,
    remainingGap: progress.remainingGap, nextEvidenceObjective, excludedDocumentFingerprints: [progress.documentFingerprint] });
  if (nextWorkContractFingerprint === currentFingerprint || nextEvidenceObjective === evidenceObjective) return null;
  return { kind, priorWorkContractFingerprint: currentFingerprint, nextWorkContractFingerprint,
    priorEvidenceObjective: evidenceObjective, nextEvidenceObjective, requiredGap: progress.kind,
    excludedDocumentFingerprints: [progress.documentFingerprint], providerExecution: "disabled_for_this_slice" };
}

function degradationFor(work: CanonicalRgWorkItem): CanonicalContinuationDegradation | null {
  const reason = work.stopReason ?? "operational_degradation_reason_unavailable";
  if (work.executionState === "indeterminate_after_send") return { subtype: "indeterminate_after_send",
    continuationPermission: "reconciliation_required", reasonCodes: [reason, "blind_retry_prohibited"] };
  if (work.executionState === "degraded_provider_unavailable") return { subtype: "provider_unavailable_before_send",
    continuationPermission: "bounded_retry_eligible", reasonCodes: [reason, "existing_bounded_retry_policy_applies"] };
  if (work.executionState === "degraded_emergency_circuit_breaker") {
    const resource = /(?:resource|time|token|cost|budget|ceiling)/i.test(reason);
    return { subtype: resource ? "resource_or_runtime_exhaustion" : "emergency_circuit_breaker",
      continuationPermission: "withheld_operationally",
      reasonCodes: [reason, "operational_degradation_is_not_analytical_completion"] };
  }
  return null;
}

function repeatedNonImprovingAttempts(attempts: WorkAttempt[]): boolean {
  const terminal = attempts.filter((item): item is WorkAttempt & { admission: CanonicalRgClaimAdmission } =>
    item.work.executionState === "completed_unresolved" && item.admission !== null);
  return terminal.length >= 2 && terminal.every((item) => progressForAttempt(item).length === 0) &&
    new Set(terminal.map((item) => workContractFingerprint(item.admission, item.work))).size === 1;
}

function workContractFingerprint(admission: CanonicalRgClaimAdmission, work: CanonicalRgWorkItem): string {
  return digest({
    atomicClaimId: admission.atomicClaimId,
    claimClass: admission.claimClass,
    facet: admission.facet,
    parentClaimIds: admission.parentClaimIds,
    opaqueSubjectCode: admission.opaqueSubjectCode,
    scopeFingerprint: admission.scopeFingerprint,
    statementPeriod: admission.statementPeriod,
    direction: admission.direction,
    knowledgeQuery: work.knowledgeQuery,
    evidenceObjective: work.evidenceObjective,
    expectedKnowledgeValueConstraint: work.expectedKnowledgeValueConstraint,
    requiredSourceAuthorities: work.requiredSourceAuthorities,
    materiality: admission.materiality,
    decisionTier: admission.decisionTier,
    decisionBasis: admission.decisionBasis,
    expectedDecisionEffects: work.expectedDecisionEffects,
  });
}

function aggregateResources(attempts: WorkAttempt[], events: PersistedAnalysisRunRecord["rgExecutionEvents"]): CanonicalContinuationResourceAccounting {
  const operations = new Map<string, CanonicalRgOperation>();
  const retryDecisions = new Set<string>();
  const terminalReasons = new Set<string>();
  const workItemIds = new Set<string>();
  for (const attempt of attempts) {
    workItemIds.add(attempt.work.workItemId);
    for (const operation of attempt.operations) operations.set(`${operation.planHash}:${operation.operationId}`, operation);
    for (const retry of attempt.work.retryDecisions) retryDecisions.add(retry.decisionId);
    if (attempt.work.stopReason) terminalReasons.add(attempt.work.stopReason);
  }
  const output = structuredClone(EMPTY_RESOURCE);
  output.retries = retryDecisions.size;
  output.workReservations = new Set(events.filter((item) =>
    item.eventType === "work_reserved" && workItemIds.has(item.workItemId))
    .map((item) => item.eventId)).size;
  output.operationReservations = operations.size;
  output.terminalReasons = [...terminalReasons].sort();
  const providerCodes = new Set<string>();
  for (const operation of operations.values()) {
    output.providerCalls += operation.receipt.calls;
    if (operation.kind === "public_search") output.searchCalls += operation.receipt.calls;
    if (["investigation", "independent_verification"].includes(operation.kind)) output.aiCalls += operation.receipt.calls;
    output.retrievalBytes += operation.receipt.retrievalBytes;
    if (operation.kind === "public_retrieval" && operation.state === "completed") output.retrievalDocuments += 1;
    if (operation.receipt.tokens === null) output.tokenAccountingComplete = false;
    else output.tokensObserved += operation.receipt.tokens;
    if (operation.receipt.providerCode) providerCodes.add(operation.receipt.providerCode);
    const started = Date.parse(operation.createdAt); const ended = Date.parse(operation.updatedAt);
    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) output.elapsedMsObserved += ended - started;
  }
  output.providerCodes = [...providerCodes].sort();
  return output;
}

function lifecycleFor(decisions: CanonicalClaimContinuationDecision[]): CanonicalAdaptiveContinuationState["lifecycle"] {
  if (decisions.some((item) => item.disposition === "convergence_required")) return "convergence_required";
  if (decisions.some((item) => item.disposition === "operationally_degraded_reconciliation_required")) {
    return "indeterminate_reconciliation_required";
  }
  if (decisions.some((item) => item.disposition === "operationally_degraded_retry_eligible" ||
    item.disposition === "operationally_degraded_withheld")) return "operational_degradation_blocks_judgment";
  if (decisions.some((item) => item.disposition === "newly_eligible" || item.disposition === "justified_refinement")) {
    return "continuation_ready_provider_execution_disabled";
  }
  if (decisions.some((item) => item.disposition === "continuation_uncertain_not_authorized")) {
    return "continuation_judgment_unresolved";
  }
  if (decisions.some((item) => item.disposition === "safely_unresolved" ||
    item.disposition === "verified_but_canonically_unapplied")) return "trustworthy_completion_with_safely_unresolved";
  return "trustworthy_completion_no_further_material_work";
}

function lifecycleReasons(lifecycle: CanonicalAdaptiveContinuationState["lifecycle"],
  decisions: CanonicalClaimContinuationDecision[]): string[] {
  return unique([lifecycle, ...decisions.flatMap((item) => item.reasonCodes)]);
}

function persistContinuationState(persisted: PersistedAnalysisRunRecord,
  state: CanonicalAdaptiveContinuationState): CanonicalAdaptiveContinuationState {
  const transaction = db.transaction(() => {
    const row = db.prepare(`SELECT semantic_revision, semantic_hash, canonical_state_hash, continuation_revision,
      continuation_state_hash, rf_snapshot_hash, result_json FROM canonical_analysis_runs WHERE id = ?`)
      .get(persisted.id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("adaptive_continuation_analysis_run_unavailable");
    if (Number(row.semantic_revision) !== state.binding.semanticRevision || nullable(row.semantic_hash) !== state.binding.semanticHash ||
      nullable(row.canonical_state_hash) !== state.binding.canonicalStateHash || String(row.rf_snapshot_hash) !== state.binding.rfSnapshotHash) {
      throw new Error("adaptive_continuation_stale_semantic_binding");
    }
    const planRow = db.prepare(`SELECT artifact_json FROM canonical_analysis_run_stages WHERE run_id = ? AND stage = 'rg_planning'`)
      .get(persisted.id) as { artifact_json: string | null } | undefined;
    const durablePlanHash = planRow?.artifact_json ? string(record(JSON.parse(planRow.artifact_json)).planHash) : null;
    if (durablePlanHash !== state.binding.planHash) throw new Error("adaptive_continuation_stale_plan_generation");
    const already = db.prepare(`SELECT state_json FROM canonical_analysis_continuation_revisions
      WHERE run_id = ? AND state_hash = ?`).get(persisted.id, state.stateHash) as { state_json: string } | undefined;
    if (already) return JSON.parse(already.state_json) as CanonicalAdaptiveContinuationState;
    const priorRevision = Number(row.continuation_revision ?? 0);
    if (priorRevision !== persisted.continuationRevision) throw new Error("adaptive_continuation_concurrent_revision_conflict");
    const revision = priorRevision + 1;
    const createdAt = state.createdAt;
    const stored = { ...state, controllerRevision: revision };
    db.prepare(`INSERT INTO canonical_analysis_continuation_revisions
      (run_id, controller_revision, semantic_revision, semantic_hash, canonical_state_hash, plan_hash,
       rf_snapshot_hash, lifecycle, state_hash, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(persisted.id, revision, stored.binding.semanticRevision, stored.binding.semanticHash,
        stored.binding.canonicalStateHash, stored.binding.planHash, stored.binding.rfSnapshotHash, stored.lifecycle,
        stored.stateHash, JSON.stringify(stored), createdAt);
    const insertDecision = db.prepare(`INSERT INTO canonical_analysis_continuation_decisions
      (run_id, controller_revision, decision_id, atomic_claim_id, disposition, work_contract_fingerprint,
       decision_json, decision_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const decision of stored.decisions) insertDecision.run(persisted.id, revision, decision.decisionId,
      decision.atomicClaimId, decision.disposition, decision.currentWorkContractFingerprint,
      JSON.stringify(decision), digest(decision), createdAt);
    const summary = row.result_json ? record(JSON.parse(String(row.result_json))) : {};
    summary.autonomousLifecycle = {
      schemaVersion: ADAPTIVE_CONTINUATION_SCHEMA_VERSION,
      controllerRevision: revision,
      state: stored.lifecycle,
      boundSemanticRevision: stored.binding.semanticRevision,
      boundSemanticHash: stored.binding.semanticHash,
      boundPlanHash: stored.binding.planHash,
      continuationReadyCount: stored.continuationReadyAtomicClaimIds.length,
      providerExecution: "regenerated_plan_disabled",
      secondPassProviderCalls: 0,
      stateHash: stored.stateHash,
      reasonCodes: stored.reasonCodes,
    };
    const updated = db.prepare(`UPDATE canonical_analysis_runs SET continuation_revision = ?, continuation_lifecycle = ?,
      continuation_state_hash = ?, result_json = ?, updated_at = ? WHERE id = ? AND continuation_revision = ?`)
      .run(revision, stored.lifecycle, stored.stateHash, JSON.stringify(summary), createdAt, persisted.id, priorRevision);
    if (updated.changes !== 1) throw new Error("adaptive_continuation_concurrent_revision_conflict");
    return stored;
  });
  return transaction();
}

function latestAttemptFor(attempts: WorkAttempt[], current: CanonicalRgWorkItem | null): WorkAttempt | null {
  if (current) return attempts.find((item) => item.work.workItemId === current.workItemId && item.work === current)
    ?? attempts.filter((item) => item.work.workItemId === current.workItemId).at(-1) ?? null;
  return attempts.at(-1) ?? null;
}

function latestHistoricalAdmission(attempts: WorkAttempt[], atomicClaimId: string): CanonicalRgClaimAdmission | null {
  return attempts.filter((item) => item.work.atomicClaimId === atomicClaimId && item.admission).at(-1)?.admission ?? null;
}

function admissionFromPriorDecision(decision: CanonicalClaimContinuationDecision | undefined): CanonicalRgClaimAdmission | null {
  if (!decision) return null;
  return {
    atomicClaimId: decision.atomicClaimId, parentClaimIds: [], claimClass: decision.claimClass, facet: decision.facet,
    opaqueSubjectCode: "prior_lineage", scopeFingerprint: "prior_lineage", statementPeriod: null,
    direction: "not_monetary", canonicalRefs: [], occurrenceRefs: [], evidenceRefs: [],
    magnitude: { amountMinor: null, authoritativeStatementCostMinor: null, relativeBasisPoints: null,
      relativeSignificance: "unavailable", tier: "unavailable", reasonCodes: ["prior_lineage_only"] },
    decisionTier: decision.decisionTier, decisionReasonCodes: decision.reasonCodes,
    decisionBasis: { atomicFacet: decision.facet, presentlyReachableEffects: [], independentBlockingFacets: [],
      independentBlockingPrerequisiteCodes: [], admissibleOutcomes: [] }, materiality: decision.materiality,
    researchAdmission: "withheld_no_authorized_research_mapping", knowledgeQuery: null,
    expectedKnowledgeValueConstraint: null, requiredSourceAuthorities: [], evidenceObjective: "prior_lineage",
    expectedDecisionEffects: [], limitations: ["Prior continuation lineage retained after claim left the active plan."],
  };
}

function workProjection(work: CanonicalRgWorkItem) {
  return { atomicClaimId: work.atomicClaimId, requestedOperation: work.requestedOperation,
    evidenceObjective: work.evidenceObjective, expectedDecisionEffects: work.expectedDecisionEffects,
    knowledgeQuery: work.knowledgeQuery, expectedKnowledgeValueConstraint: work.expectedKnowledgeValueConstraint,
    requiredSourceAuthorities: work.requiredSourceAuthorities, materialityContractVersion: work.materialityContractVersion };
}

function uniqueProgress(values: CanonicalContinuationProgress[]): CanonicalContinuationProgress[] {
  const map = new Map(values.map((item) => [digest(item), item]));
  return [...map.values()].sort((left, right) => left.operationId.localeCompare(right.operationId));
}

function unique<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort();
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function periodApplies(asOf: string, effectiveFrom: string | null, effectiveTo: string | null): boolean {
  return (effectiveFrom === null || asOf >= effectiveFrom) && (effectiveTo === null || asOf < effectiveTo);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
