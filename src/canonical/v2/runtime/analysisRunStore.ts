import { randomUUID } from "node:crypto";

import type { ParsedDocument } from "../../../parser.js";
import { db, nowIso } from "../../../db.js";
import type { CanonicalEconomicsV2CompletenessStatus } from "../types.js";
import type { CanonicalRgClaimAdmission, CanonicalRgOperation, CanonicalRgWorkItem, CanonicalRgWorkLedger } from "./rgWorkLedger.js";
import { digestCanonical } from "./integrityHashes.js";
import type {
  CanonicalCurrentRunExternalEvidenceRegistry,
  CanonicalSemanticConvergenceRevision,
} from "./semanticConvergenceTypes.js";
import type { CanonicalAdaptiveContinuationState, CanonicalContinuationResourceAccounting } from "./adaptiveContinuationTypes.js";
import {
  AUTONOMOUS_OUTCOME_CHECKPOINT_SCHEMA_VERSION,
  canonicalAutonomousCompletionForLifecycle,
  type CanonicalAutonomousOutcomeCheckpoint,
  type CanonicalAutonomousOutcomeIntegrity,
  type CanonicalContinuationExecutionGrant,
} from "./adaptiveExecutionTypes.js";
import { canonicalRfExecutionContextHash } from "./rfClaimResolution.js";
import {
  governedRfKnowledgeInput,
  loadGovernedRfCatalogSnapshot,
  reloadGovernedRfCatalogBinding,
  type GovernedRfCatalogBinding,
} from "./rfKnowledgeCatalog.js";
import { executeDeterministicCanonicalAnalysisRun, sourceFingerprintForAnalysisRun } from "./analysisRun.js";
import {
  ANALYSIS_RUN_IMPLEMENTATION_VERSION,
  ANALYSIS_RUN_POLICY_VERSION,
  ANALYSIS_RUN_SCHEMA_VERSION,
  ANALYSIS_RUN_STAGE_IDS,
  type AnalysisRunStageId,
  type AnalysisRunStageOutcome,
  type AnalysisRunStageStatus,
  type AnalysisRunStatus,
  type CanonicalAnalysisArtifacts,
  type CanonicalAnalysisRun,
} from "./analysisRunTypes.js";

export type PersistedAnalysisRunStage = {
  stage: AnalysisRunStageId;
  status: AnalysisRunStageStatus;
  claimRef: string;
  evidenceObjective: string;
  expectedDecisionEffect: string;
  artifact: unknown;
  artifactHash: string | null;
  errors: string[];
  warnings: string[];
  limitations: string[];
  resource: {
    execution: "deterministic_local";
    provider: null;
    model: null;
    calls: 0;
    tokens: null;
    retrievalBytes: 0;
    retries: 0;
    elapsedMs: number | null;
  };
  startedAt: string | null;
  completedAt: string | null;
};

export type PersistedAnalysisRunRecord = {
  id: string;
  jobId: string;
  sourceDocumentRef: string;
  sourceFingerprint: string;
  schemaVersion: string;
  implementationVersion: string;
  policyVersion: string;
  status: AnalysisRunStatus;
  familyStatus: CanonicalAnalysisRun["familyStatus"] | "unresolved";
  parserDriverId: string | null;
  attemptCount: number;
  canonicalTruthHash: string | null;
  financialFoundationHash: string | null;
  semanticHash: string | null;
  canonicalStateHash: string | null;
  semanticRevision: number;
  rgPlanHash: string | null;
  rgPlanGeneration: number;
  rgExecutionGeneration: number;
  continuationRevision: number;
  continuationLifecycle: CanonicalAnalysisRun["autonomousLifecycle"]["state"];
  continuationStateHash: string | null;
  autonomousOutcomeRevision: number;
  autonomousOutcomeHash: string | null;
  autonomousOutcome: CanonicalAutonomousOutcomeCheckpoint | null;
  autonomousOutcomeIntegrity: CanonicalAutonomousOutcomeIntegrity;
  autonomousOutcomeRevisions: CanonicalAutonomousOutcomeCheckpoint[];
  rfSnapshotHash: string;
  rfContextHash: string;
  rfCatalogStatus: "available" | "unavailable" | "unbound";
  rfCatalogBinding: GovernedRfCatalogBinding | null;
  limitations: string[];
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  stages: PersistedAnalysisRunStage[];
  rgClaimAdmissions: CanonicalRgClaimAdmission[];
  rgWorkItems: CanonicalRgWorkItem[];
  rgOperations: CanonicalRgOperation[];
  rgExecutionEvents: Array<{
    eventId: string;
    eventSequence: number;
    workItemId: string;
    operationId: string | null;
    eventType: string;
    event: unknown;
    eventHash: string;
    createdAt: string;
  }>;
  externalEvidenceRegistry: CanonicalCurrentRunExternalEvidenceRegistry["evidence"];
  externalEvidenceRegistryErrors: string[];
  semanticRevisions: CanonicalSemanticConvergenceRevision[];
  continuationRevisions: CanonicalAdaptiveContinuationState[];
  continuationExecutionGrants: CanonicalContinuationExecutionGrant[];
  result: CanonicalAnalysisRun | null;
};

export function getPersistedAnalysisRunForJob(jobId: string): PersistedAnalysisRunRecord | undefined {
  const row = db.prepare(`SELECT * FROM canonical_analysis_runs WHERE job_id = ?`).get(jobId) as Record<string, unknown> | undefined;
  return row ? mapRun(row) : undefined;
}

export function getPersistedAnalysisRun(runId: string): PersistedAnalysisRunRecord | undefined {
  const row = db.prepare(`SELECT * FROM canonical_analysis_runs WHERE id = ?`).get(runId) as Record<string, unknown> | undefined;
  return row ? mapRun(row) : undefined;
}

export function persistSettledCanonicalAutonomousOutcomeCheckpoint(input: {
  runId: string;
  financialFoundationHashAtCycleStart: string | null;
}): CanonicalAutonomousOutcomeCheckpoint {
  return persistCanonicalAutonomousOutcomeCheckpoint({ ...input, checkpointKind: "settled" });
}

export function persistInterruptedCanonicalAutonomousOutcomeCheckpoint(input: {
  runId: string;
  financialFoundationHashAtCycleStart: string | null;
}): CanonicalAutonomousOutcomeCheckpoint {
  return persistCanonicalAutonomousOutcomeCheckpoint({ ...input, checkpointKind: "execution_interrupted" });
}

function persistCanonicalAutonomousOutcomeCheckpoint(input: {
  runId: string;
  financialFoundationHashAtCycleStart: string | null;
  checkpointKind: CanonicalAutonomousOutcomeCheckpoint["checkpointKind"];
}): CanonicalAutonomousOutcomeCheckpoint {
  const transaction = db.transaction(() => {
    const run = db.prepare(`SELECT source_fingerprint, rf_snapshot_hash, rf_context_hash,
      financial_foundation_hash, semantic_hash, canonical_state_hash, semantic_revision,
      rg_plan_hash, rg_plan_generation, rg_execution_generation, continuation_revision,
      continuation_lifecycle, continuation_state_hash, autonomous_outcome_revision
      FROM canonical_analysis_runs WHERE id = ?`).get(input.runId) as Record<string, unknown> | undefined;
    if (!run) throw new Error("canonical_autonomous_outcome_analysis_run_unavailable");
    const continuationRevision = Number(run.continuation_revision ?? 0);
    const continuationRow = continuationRevision > 0
      ? db.prepare(`SELECT state_json FROM canonical_analysis_continuation_revisions
          WHERE run_id = ? AND controller_revision = ?`).get(input.runId, continuationRevision) as { state_json: string } | undefined
      : undefined;
    const continuation = continuationRow
      ? parseJson<CanonicalAdaptiveContinuationState | null>(continuationRow.state_json, null)
      : null;
    const lifecycle = String(run.continuation_lifecycle ?? "awaiting_first_pass_outcome") as
      CanonicalAnalysisRun["autonomousLifecycle"]["state"];
    if (input.checkpointKind === "settled") {
      if (!continuation || continuation.lifecycle !== lifecycle
        || continuation.stateHash !== nullableString(run.continuation_state_hash)
        || continuation.controllerRevision !== continuationRevision) {
        throw new Error("canonical_autonomous_outcome_continuation_binding_invalid");
      }
      assertContinuationCurrentForOutcome(run, continuation);
      assertContinuationSettledForOutcome(continuation);
    }
    const rh = db.prepare(`SELECT artifact_hash FROM canonical_analysis_run_stages WHERE run_id = ? AND stage = 'rh'`)
      .get(input.runId) as { artifact_hash: string | null } | undefined;
    const financialFoundationAtCheckpoint = nullableString(run.financial_foundation_hash);
    const financialFoundationPreserved = input.financialFoundationHashAtCycleStart === financialFoundationAtCheckpoint;
    if (input.checkpointKind === "settled" && !financialFoundationPreserved) {
      throw new Error("canonical_autonomous_outcome_financial_foundation_mutation");
    }
    const completion = input.checkpointKind === "settled"
      ? canonicalAutonomousCompletionForLifecycle(lifecycle)
      : null;
    const payload = {
      schemaVersion: AUTONOMOUS_OUTCOME_CHECKPOINT_SCHEMA_VERSION,
      runId: input.runId,
      authority: "production_internal_canonical" as const,
      checkpointKind: input.checkpointKind,
      lifecycle,
      completion,
      binding: {
        sourceFingerprint: String(run.source_fingerprint),
        rfSnapshotHash: String(run.rf_snapshot_hash ?? ""),
        rfContextHash: String(run.rf_context_hash ?? ""),
        financialFoundationHash: financialFoundationAtCheckpoint,
        semanticHash: nullableString(run.semantic_hash),
        canonicalStateHash: nullableString(run.canonical_state_hash),
        semanticRevision: Number(run.semantic_revision ?? 0),
        planHash: nullableString(run.rg_plan_hash),
        planGeneration: Number(run.rg_plan_generation ?? 0),
        executionGeneration: Number(run.rg_execution_generation ?? 0),
        continuationRevision,
        continuationStateHash: nullableString(run.continuation_state_hash),
        rhArtifactHash: rh?.artifact_hash ?? null,
      },
      continuationReasonCodes: continuation ? [...continuation.reasonCodes] : [],
      cumulativeResource: continuation ? { ...continuation.cumulativeResource } : emptyContinuationResource(),
      continuationBindingStatus: continuation
        ? continuationCurrentForOutcome(run, continuation) ? "current" as const : "stale_at_interruption" as const
        : "unavailable_at_interruption" as const,
      interruption: input.checkpointKind === "execution_interrupted" ? {
        phase: "adaptive_execution" as const,
        reasonCode: "adaptive_execution_interrupted_before_outcome_settlement" as const,
      } : null,
      financialFoundationIntegrity: {
        cycleStartHash: input.financialFoundationHashAtCycleStart,
        cycleEndHash: financialFoundationAtCheckpoint,
        preserved: financialFoundationPreserved,
      },
      analysisRunStatusCompatibility: "pre_adaptive_status_meaning_unchanged" as const,
      customerReportAuthority: "legacy_report_unchanged" as const,
    };
    const outcomeHash = digestCanonical(payload);
    const existing = db.prepare(`SELECT outcome_json FROM canonical_analysis_autonomous_outcome_revisions
      WHERE run_id = ? AND outcome_hash = ?`).get(input.runId, outcomeHash) as { outcome_json: string } | undefined;
    if (existing) {
      const checkpoint = parseJson<CanonicalAutonomousOutcomeCheckpoint | null>(existing.outcome_json, null);
      if (!checkpoint || canonicalAutonomousOutcomeCheckpointHash(checkpoint) !== outcomeHash) {
        throw new Error("canonical_autonomous_outcome_immutable_conflict");
      }
      db.prepare(`UPDATE canonical_analysis_runs SET autonomous_outcome_revision = ?, autonomous_outcome_hash = ?,
        updated_at = ? WHERE id = ?`).run(checkpoint.checkpointRevision, checkpoint.checkpointHash, nowIso(), input.runId);
      return checkpoint;
    }
    const maximum = db.prepare(`SELECT COALESCE(MAX(outcome_revision), 0) AS revision
      FROM canonical_analysis_autonomous_outcome_revisions WHERE run_id = ?`).get(input.runId) as { revision: number };
    const checkpoint: CanonicalAutonomousOutcomeCheckpoint = {
      ...payload,
      checkpointRevision: Number(maximum.revision) + 1,
      checkpointHash: outcomeHash,
      createdAt: nowIso(),
    };
    db.prepare(`INSERT INTO canonical_analysis_autonomous_outcome_revisions
      (run_id, outcome_revision, checkpoint_kind, lifecycle, completion, outcome_hash, outcome_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.runId, checkpoint.checkpointRevision, checkpoint.checkpointKind,
      checkpoint.lifecycle, checkpoint.completion, checkpoint.checkpointHash, JSON.stringify(checkpoint), checkpoint.createdAt);
    const updated = db.prepare(`UPDATE canonical_analysis_runs SET autonomous_outcome_revision = ?,
      autonomous_outcome_hash = ?, updated_at = ? WHERE id = ? AND autonomous_outcome_revision = ?`)
      .run(checkpoint.checkpointRevision, checkpoint.checkpointHash, checkpoint.createdAt, input.runId,
        Number(run.autonomous_outcome_revision ?? 0));
    if (updated.changes !== 1) throw new Error("canonical_autonomous_outcome_concurrent_revision_conflict");
    return checkpoint;
  });
  return transaction();
}

export function executeDurableCanonicalAnalysisRun(input: {
  jobId: string;
  sourceDocumentRef?: string;
  document: ParsedDocument;
  sourceProfile?: { statementCompleteness?: CanonicalEconomicsV2CompletenessStatus; humanReviewRequired?: boolean };
  stageBuilders?: Parameters<typeof executeDeterministicCanonicalAnalysisRun>[0]["stageBuilders"];
}): CanonicalAnalysisRun {
  const fingerprint = sourceFingerprintForAnalysisRun(input.document);
  const existing = getPersistedAnalysisRunForJob(input.jobId);
  if (existing && existing.sourceFingerprint !== fingerprint) {
    throw new Error("ANALYSIS_RUN_SOURCE_FINGERPRINT_MISMATCH");
  }
  const runId = existing?.id ?? randomUUID();
  const priorBinding = existing?.rfCatalogBinding?.availability === "available" ? existing.rfCatalogBinding : null;
  const catalogSnapshot = priorBinding
    ? reloadGovernedRfCatalogBinding(priorBinding)
    : loadGovernedRfCatalogSnapshot({ jobId: input.jobId, runId });
  const rfKnowledge = governedRfKnowledgeInput(catalogSnapshot);
  const bindingToPersist: GovernedRfCatalogBinding = priorBinding ?? {
    schemaVersion: catalogSnapshot.schemaVersion,
    source: catalogSnapshot.source,
    availability: catalogSnapshot.availability,
    snapshotHash: catalogSnapshot.snapshotHash,
    entryRefs: [...catalogSnapshot.entryRefs],
    visibility: { ...catalogSnapshot.visibility },
    limitationCodes: [...catalogSnapshot.limitationCodes],
  };
  const rfSnapshotHash = bindingToPersist.snapshotHash ?? "";
  const rfContextHash = canonicalRfExecutionContextHash(rfKnowledge);
  if (existing?.result
    && existing.schemaVersion === ANALYSIS_RUN_SCHEMA_VERSION
    && existing.implementationVersion === ANALYSIS_RUN_IMPLEMENTATION_VERSION
    && existing.policyVersion === ANALYSIS_RUN_POLICY_VERSION
    && existing.rfContextHash === rfContextHash
    && catalogSnapshot.availability === "available"
    && ["completed", "completed_with_limitations", "unsupported"].includes(existing.status)) {
    return existing.result;
  }

  const sourceDocumentRef = existing?.sourceDocumentRef ?? input.sourceDocumentRef ?? `job_${input.jobId}`;
  beginRun({ runId, jobId: input.jobId, sourceDocumentRef, fingerprint, rfSnapshotHash,
    rfContextHash, rfCatalogBinding: bindingToPersist, rfCatalogExecutionStatus: catalogSnapshot.availability,
    existingAttemptCount: existing?.attemptCount ?? 0 });
  const stageStartedAt = new Map<AnalysisRunStageId, number>();
  try {
    const execution = executeDeterministicCanonicalAnalysisRun({
      runId,
      sourceDocumentRef,
      document: input.document,
      sourceProfile: input.sourceProfile,
      executionContext: "production",
      privacySafePersistence: true,
      stageBuilders: input.stageBuilders,
      rfKnowledge,
      observer: {
        stageStarted(stage, work) {
          stageStartedAt.set(stage, Date.now());
          markStageStarted(runId, stage, work);
        },
        stageFinished(stage, outcome, artifact) {
          const startedAt = stageStartedAt.get(stage);
          finishPersistedStage(runId, outcome, artifact, startedAt === undefined ? null : Math.max(0, Date.now() - startedAt));
        },
      },
    });
    finishRun(execution.run);
    return execution.run;
  } catch (error) {
    failRun(runId, error instanceof Error ? error.message : "unknown_analysis_run_failure");
    throw error;
  }
}

function beginRun(input: {
  runId: string;
  jobId: string;
  sourceDocumentRef: string;
  fingerprint: string;
  rfSnapshotHash: string;
  rfContextHash: string;
  rfCatalogBinding: GovernedRfCatalogBinding;
  rfCatalogExecutionStatus: "available" | "unavailable";
  existingAttemptCount: number;
}) {
  const now = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO canonical_analysis_runs (
        id, job_id, source_document_ref, source_fingerprint, schema_version, implementation_version, policy_version,
        status, family_status, parser_driver_id, attempt_count, canonical_truth_hash, financial_foundation_hash,
        semantic_hash, canonical_state_hash, semantic_revision, rg_plan_hash, rg_plan_generation,
        continuation_revision, continuation_lifecycle,
        continuation_state_hash, rf_snapshot_hash, rf_context_hash,
        rf_catalog_status, rf_catalog_binding_json, limitations_json, result_json,
        created_at, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 'unresolved', NULL, ?, NULL, NULL, NULL, NULL, 0, NULL, 0, 0,
        'awaiting_first_pass_outcome', NULL, ?, ?, ?, ?, '[]', NULL, ?, ?, NULL, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        source_document_ref = excluded.source_document_ref,
        schema_version = excluded.schema_version,
        implementation_version = excluded.implementation_version,
        policy_version = excluded.policy_version,
        status = 'running',
        family_status = 'unresolved',
        parser_driver_id = NULL,
        attempt_count = excluded.attempt_count,
        canonical_truth_hash = NULL,
        financial_foundation_hash = NULL,
        semantic_hash = NULL,
        canonical_state_hash = NULL,
        semantic_revision = 0,
        rg_plan_hash = NULL,
        rg_plan_generation = 0,
        continuation_revision = 0,
        continuation_lifecycle = 'awaiting_first_pass_outcome',
        continuation_state_hash = NULL,
        autonomous_outcome_hash = NULL,
        rf_snapshot_hash = excluded.rf_snapshot_hash,
        rf_context_hash = excluded.rf_context_hash,
        rf_catalog_status = excluded.rf_catalog_status,
        rf_catalog_binding_json = excluded.rf_catalog_binding_json,
        limitations_json = '[]',
        result_json = NULL,
        started_at = excluded.started_at,
        completed_at = NULL,
        updated_at = excluded.updated_at
    `).run(input.runId, input.jobId, input.sourceDocumentRef, input.fingerprint,
      ANALYSIS_RUN_SCHEMA_VERSION, ANALYSIS_RUN_IMPLEMENTATION_VERSION, ANALYSIS_RUN_POLICY_VERSION,
      input.existingAttemptCount + 1, input.rfSnapshotHash, input.rfContextHash,
      input.rfCatalogExecutionStatus, JSON.stringify(input.rfCatalogBinding), now, now, now);
    const insertStage = db.prepare(`
      INSERT OR IGNORE INTO canonical_analysis_run_stages (
        run_id, stage, status, claim_ref, evidence_objective, expected_decision_effect, artifact_json, artifact_hash,
        errors_json, warnings_json, limitations_json, resource_json, started_at, completed_at, elapsed_ms, updated_at
      ) VALUES (?, ?, 'pending', '', '', '', NULL, NULL, '[]', '[]', '[]', ?, NULL, NULL, NULL, ?)
    `);
    for (const stage of ANALYSIS_RUN_STAGE_IDS) insertStage.run(input.runId, stage, JSON.stringify(emptyResource(null)), now);
    db.prepare(`DELETE FROM canonical_analysis_continuation_decisions WHERE run_id = ?`).run(input.runId);
    db.prepare(`DELETE FROM canonical_analysis_continuation_revisions WHERE run_id = ?`).run(input.runId);
    db.prepare(`
      UPDATE canonical_analysis_run_stages
      SET status = 'pending', claim_ref = '', evidence_objective = '', expected_decision_effect = '',
          artifact_json = NULL, artifact_hash = NULL, errors_json = '[]', warnings_json = '[]', limitations_json = '[]',
          resource_json = ?, started_at = NULL, completed_at = NULL, elapsed_ms = NULL, updated_at = ?
      WHERE run_id = ?
    `).run(JSON.stringify(emptyResource(null)), now, input.runId);
  });
  transaction();
}

function markStageStarted(runId: string, stage: AnalysisRunStageId,
  work: { claimRef: string; evidenceObjective: string; expectedDecisionEffect: string }) {
  const now = nowIso();
  db.prepare(`
    UPDATE canonical_analysis_run_stages
    SET status = 'running', claim_ref = ?, evidence_objective = ?, expected_decision_effect = ?,
        started_at = ?, completed_at = NULL, elapsed_ms = NULL, resource_json = ?, updated_at = ?
    WHERE run_id = ? AND stage = ?
  `).run(work.claimRef, work.evidenceObjective, work.expectedDecisionEffect, now, JSON.stringify(emptyResource(null)), now, runId, stage);
}

function finishPersistedStage(runId: string, outcome: AnalysisRunStageOutcome, artifact: unknown, elapsedMs: number | null) {
  const now = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE canonical_analysis_run_stages
      SET status = ?, artifact_json = ?, artifact_hash = ?, errors_json = ?, warnings_json = ?, limitations_json = ?,
          resource_json = ?, completed_at = ?, elapsed_ms = ?, updated_at = ?
      WHERE run_id = ? AND stage = ?
    `).run(outcome.status, artifact === null || artifact === undefined ? null : JSON.stringify(artifact), outcome.artifactHash,
      JSON.stringify(outcome.errors), JSON.stringify(outcome.warnings), JSON.stringify(outcome.limitations),
      JSON.stringify(emptyResource(elapsedMs)), now, elapsedMs, now, runId, outcome.stage);
    if (outcome.stage === "rg_planning" && outcome.status === "valid" && artifact) {
      persistRgWorkLedger(runId, artifact as CanonicalRgWorkLedger, now);
    }
  });
  transaction();
}

export function persistRgWorkLedger(runId: string, ledger: CanonicalRgWorkLedger, now: string) {
  const runPlan = db.prepare(`SELECT rg_plan_hash, rg_plan_generation FROM canonical_analysis_runs WHERE id = ?`)
    .get(runId) as { rg_plan_hash: string | null; rg_plan_generation: number } | undefined;
  if (!runPlan) throw new Error("canonical_analysis_run_missing_for_rg_plan");
  const existingPlans = new Set((db.prepare(`SELECT plan_hash FROM canonical_rg_claim_admissions WHERE run_id = ?
      UNION SELECT plan_hash FROM canonical_rg_work_items WHERE run_id = ?
      UNION SELECT plan_hash FROM canonical_rg_operations WHERE run_id = ?`)
    .all(runId, runId, runId) as Array<{ plan_hash: string }>).map((row) => row.plan_hash));
  if (existingPlans.size > 1) throw new Error("canonical_rg_active_plan_binding_conflict");
  const persistedPlanHash = runPlan.rg_plan_hash ?? [...existingPlans][0] ?? null;
  const priorGeneration = Math.max(Number(runPlan.rg_plan_generation ?? 0), inferRgPlanGeneration(runId));
  if (persistedPlanHash !== null && existingPlans.size === 1 && !existingPlans.has(persistedPlanHash)) {
    throw new Error("canonical_rg_active_plan_binding_conflict");
  }
  let activeGeneration = priorGeneration;
  if (persistedPlanHash !== null && persistedPlanHash !== ledger.planHash) {
    const activeWork = db.prepare(`SELECT 1 FROM canonical_rg_work_items WHERE run_id = ?
      AND (state = 'executing' OR execution_state IN ('executing', 'indeterminate_after_send')) LIMIT 1`).get(runId);
    const activeOperation = db.prepare(`SELECT 1 FROM canonical_rg_operations WHERE run_id = ?
      AND state IN ('reserved', 'sent', 'indeterminate_after_send') LIMIT 1`).get(runId);
    if (activeWork || activeOperation) throw new Error("canonical_rg_plan_replacement_execution_active");
    activeGeneration = priorGeneration + 1;
    archiveSupersededRgExecution(runId, persistedPlanHash, ledger.planHash, priorGeneration, activeGeneration, now);
    db.prepare(`DELETE FROM canonical_rg_operations WHERE run_id = ?`).run(runId);
    db.prepare(`DELETE FROM canonical_rg_work_items WHERE run_id = ?`).run(runId);
    db.prepare(`DELETE FROM canonical_rg_claim_admissions WHERE run_id = ?`).run(runId);
  }
  db.prepare(`UPDATE canonical_analysis_runs SET rg_plan_hash = ?, rg_plan_generation = ?, updated_at = ? WHERE id = ?`)
    .run(ledger.planHash, activeGeneration, now, runId);
  const insertClaim = db.prepare(`
    INSERT INTO canonical_rg_claim_admissions (
      run_id, atomic_claim_id, parent_claim_ids_json, claim_class, facet, opaque_subject_code, scope_fingerprint,
      statement_period_json, direction, amount_minor, authoritative_statement_cost_minor, economic_tier, decision_tier,
      materiality, research_admission, admission_json, plan_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, atomic_claim_id) DO UPDATE SET
      parent_claim_ids_json = excluded.parent_claim_ids_json,
      claim_class = excluded.claim_class,
      facet = excluded.facet,
      opaque_subject_code = excluded.opaque_subject_code,
      scope_fingerprint = excluded.scope_fingerprint,
      statement_period_json = excluded.statement_period_json,
      direction = excluded.direction,
      amount_minor = excluded.amount_minor,
      authoritative_statement_cost_minor = excluded.authoritative_statement_cost_minor,
      economic_tier = excluded.economic_tier,
      decision_tier = excluded.decision_tier,
      materiality = excluded.materiality,
      research_admission = excluded.research_admission,
      admission_json = excluded.admission_json,
      plan_hash = excluded.plan_hash,
      updated_at = excluded.updated_at
  `);
  for (const claim of ledger.claimAdmissions) {
    insertClaim.run(runId, claim.atomicClaimId, JSON.stringify(claim.parentClaimIds), claim.claimClass, claim.facet,
      claim.opaqueSubjectCode, claim.scopeFingerprint, claim.statementPeriod ? JSON.stringify(claim.statementPeriod) : null,
      claim.direction, claim.magnitude.amountMinor, claim.magnitude.authoritativeStatementCostMinor,
      claim.magnitude.tier, claim.decisionTier, claim.materiality, claim.researchAdmission,
      JSON.stringify(claim), ledger.planHash, now, now);
  }
  const insertWork = db.prepare(`
    INSERT INTO canonical_rg_work_items (
      run_id, work_item_id, atomic_claim_id, state, execution_state, requested_operation, work_item_json,
      plan_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, work_item_id) DO UPDATE SET
      atomic_claim_id = excluded.atomic_claim_id,
      requested_operation = excluded.requested_operation,
      plan_hash = excluded.plan_hash,
      updated_at = excluded.updated_at
  `);
  for (const item of ledger.workItems) {
    insertWork.run(runId, item.workItemId, item.atomicClaimId, item.state, item.executionState,
      item.requestedOperation, JSON.stringify(item), ledger.planHash, now, now);
  }
  const insertOperation = db.prepare(`
    INSERT INTO canonical_rg_operations (
      run_id, operation_id, work_item_id, state, operation_json, plan_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const operation of ledger.operations) {
    insertOperation.run(runId, operation.operationId, operation.workItemId, operation.state,
      JSON.stringify(operation), ledger.planHash, now, now);
  }
}

function inferRgPlanGeneration(runId: string): number {
  const rows = db.prepare(`SELECT event_type, event_json, created_at FROM canonical_rg_execution_events
    WHERE run_id = ? AND event_type IN ('superseded_plan_transition', 'superseded_plan_snapshot') ORDER BY rowid`)
    .all(runId) as Array<{ event_type: string; event_json: string; created_at: string }>;
  let generation = 0;
  let legacyGroup: string | null = null;
  for (const row of rows) {
    const event = parseJson<Record<string, unknown>>(row.event_json, {});
    const explicit = Number(event.replacementPlanGeneration);
    if (Number.isSafeInteger(explicit) && explicit >= 0) {
      generation = Math.max(generation, explicit);
      legacyGroup = null;
      continue;
    }
    if (row.event_type !== "superseded_plan_snapshot") continue;
    const group = `${row.created_at}:${String(event.priorPlanHash ?? "")}:${String(event.replacementPlanHash ?? "")}`;
    if (group !== legacyGroup) {
      generation += 1;
      legacyGroup = group;
    }
  }
  return generation;
}

function archiveSupersededRgExecution(runId: string, priorPlanHash: string, replacementPlanHash: string,
  priorPlanGeneration: number, replacementPlanGeneration: number, now: string) {
  const claims = db.prepare(`SELECT atomic_claim_id, admission_json, plan_hash FROM canonical_rg_claim_admissions WHERE run_id = ?`)
    .all(runId) as Array<{ atomic_claim_id: string; admission_json: string; plan_hash: string }>;
  const workItems = db.prepare(`SELECT work_item_id, work_item_json, plan_hash FROM canonical_rg_work_items WHERE run_id = ?`)
    .all(runId) as Array<{ work_item_id: string; work_item_json: string; plan_hash: string }>;
  const operations = db.prepare(`SELECT operation_id, work_item_id, operation_json, plan_hash FROM canonical_rg_operations WHERE run_id = ?`)
    .all(runId) as Array<{ operation_id: string; work_item_id: string; operation_json: string; plan_hash: string }>;
  const insert = db.prepare(`INSERT INTO canonical_rg_execution_events
    (event_id, run_id, work_item_id, operation_id, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, ?, 'superseded_plan_snapshot', ?, ?, ?)`);
  const transition = { priorPlanHash, replacementPlanHash, priorPlanGeneration, replacementPlanGeneration };
  const transitionHash = digestCanonical(transition);
  db.prepare(`INSERT INTO canonical_rg_execution_events
    (event_id, run_id, work_item_id, operation_id, event_type, event_json, event_hash, created_at)
    VALUES (?, ?, ?, NULL, 'superseded_plan_transition', ?, ?, ?)`)
    .run(`rg-event-${randomUUID()}`, runId, `plan-generation:${priorPlanGeneration}`, JSON.stringify(transition),
      transitionHash, now);
  for (const claim of claims) {
    const event = { priorPlanHash, replacementPlanHash, priorPlanGeneration, replacementPlanGeneration,
      claimAdmission: JSON.parse(claim.admission_json) };
    const eventHash = digestCanonical(event);
    insert.run(`rg-event-${randomUUID()}`, runId, `claim:${claim.atomic_claim_id}`, null, JSON.stringify(event), eventHash, now);
  }
  for (const item of workItems) {
    const event = { priorPlanHash, replacementPlanHash, priorPlanGeneration, replacementPlanGeneration,
      workItem: JSON.parse(item.work_item_json) };
    const eventHash = digestCanonical(event);
    insert.run(`rg-event-${randomUUID()}`, runId, item.work_item_id, null, JSON.stringify(event), eventHash, now);
  }
  for (const operation of operations) {
    const event = { priorPlanHash, replacementPlanHash, priorPlanGeneration, replacementPlanGeneration,
      operation: JSON.parse(operation.operation_json) };
    const eventHash = digestCanonical(event);
    insert.run(`rg-event-${randomUUID()}`, runId, operation.work_item_id, operation.operation_id, JSON.stringify(event), eventHash, now);
  }
}

function finishRun(run: CanonicalAnalysisRun) {
  const now = nowIso();
  const resultWithoutArtifacts = { ...run, artifacts: undefined };
  db.prepare(`
    UPDATE canonical_analysis_runs
    SET status = ?, family_status = ?, parser_driver_id = ?, canonical_truth_hash = ?, financial_foundation_hash = ?,
        semantic_hash = ?, canonical_state_hash = ?, semantic_revision = ?, limitations_json = ?,
        result_json = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(run.status, run.familyStatus, run.parser.driverId, run.canonicalTruthHash, run.financialFoundationHash,
    run.semanticHash, run.canonicalStateHash, run.semanticRevision, JSON.stringify(run.limitations),
    JSON.stringify(resultWithoutArtifacts), now, now, run.runId);
}

function failRun(runId: string, message: string) {
  const now = nowIso();
  db.prepare(`
    UPDATE canonical_analysis_runs
    SET status = 'failed', limitations_json = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify([message]), now, now, runId);
}

function mapRun(row: Record<string, unknown>): PersistedAnalysisRunRecord {
  const runId = String(row.id);
  const stages = mapStages(runId);
  const summary = parseJson<Record<string, unknown> | null>(row.result_json, null);
  const artifacts = artifactsFromStages(stages);
  const rgClaimAdmissions = mapRgClaims(runId);
  const rgWorkItems = mapRgWorkItems(runId);
  const rgOperations = mapRgOperations(runId);
  const rgExecutionEvents = mapRgExecutionEvents(runId);
  const externalEvidence = mapExternalEvidence(runId);
  const semanticRevisions = mapSemanticRevisions(runId);
  const continuationRevisions = mapContinuationRevisions(runId);
  const continuationExecutionGrants = mapContinuationExecutionGrants(runId);
  const autonomousOutcomes = mapAutonomousOutcomeRevisions(runId);
  const stagedPlanHash = artifacts.rgWorkLedger?.planHash ?? null;
  const inferredPlanGeneration = inferRgPlanGeneration(runId);
  if ((!row.rg_plan_hash && stagedPlanHash) || Number(row.rg_plan_generation ?? 0) < inferredPlanGeneration) {
    const repairedPlanHash = row.rg_plan_hash ? String(row.rg_plan_hash) : stagedPlanHash;
    const repairedPlanGeneration = Math.max(Number(row.rg_plan_generation ?? 0), inferredPlanGeneration);
    db.prepare(`UPDATE canonical_analysis_runs SET rg_plan_hash = ?, rg_plan_generation = ? WHERE id = ?`)
      .run(repairedPlanHash, repairedPlanGeneration, runId);
    row.rg_plan_hash = repairedPlanHash;
    row.rg_plan_generation = repairedPlanGeneration;
  }
  const autonomousOutcomeRevision = Number(row.autonomous_outcome_revision ?? 0);
  const autonomousOutcomeHash = nullableString(row.autonomous_outcome_hash);
  const autonomousOutcomeSelection = selectCurrentAutonomousOutcome({
    row,
    stages,
    continuationRevisions,
    outcomes: autonomousOutcomes.outcomes,
    outcomeErrors: autonomousOutcomes.errors,
    autonomousOutcomeRevision,
    autonomousOutcomeHash,
  });
  const result = summary ? ({ ...summary, artifacts } as unknown as CanonicalAnalysisRun) : null;
  return {
    id: runId,
    jobId: String(row.job_id),
    sourceDocumentRef: String(row.source_document_ref),
    sourceFingerprint: String(row.source_fingerprint),
    schemaVersion: String(row.schema_version),
    implementationVersion: String(row.implementation_version),
    policyVersion: String(row.policy_version),
    status: String(row.status) as AnalysisRunStatus,
    familyStatus: String(row.family_status) as PersistedAnalysisRunRecord["familyStatus"],
    parserDriverId: row.parser_driver_id ? String(row.parser_driver_id) : null,
    attemptCount: Number(row.attempt_count),
    canonicalTruthHash: row.canonical_truth_hash ? String(row.canonical_truth_hash) : null,
    financialFoundationHash: row.financial_foundation_hash ? String(row.financial_foundation_hash) : null,
    semanticHash: row.semantic_hash ? String(row.semantic_hash) : null,
    canonicalStateHash: row.canonical_state_hash ? String(row.canonical_state_hash) : null,
    semanticRevision: Number(row.semantic_revision ?? 0),
    rgPlanHash: row.rg_plan_hash ? String(row.rg_plan_hash) : null,
    rgPlanGeneration: Number(row.rg_plan_generation ?? 0),
    rgExecutionGeneration: Number(row.rg_execution_generation ?? 0),
    continuationRevision: Number(row.continuation_revision ?? 0),
    continuationLifecycle: String(row.continuation_lifecycle ?? "awaiting_first_pass_outcome") as PersistedAnalysisRunRecord["continuationLifecycle"],
    continuationStateHash: row.continuation_state_hash ? String(row.continuation_state_hash) : null,
    autonomousOutcomeRevision,
    autonomousOutcomeHash,
    autonomousOutcome: autonomousOutcomeSelection.outcome,
    autonomousOutcomeIntegrity: autonomousOutcomeSelection.integrity,
    autonomousOutcomeRevisions: autonomousOutcomes.outcomes,
    rfSnapshotHash: String(row.rf_snapshot_hash ?? ""),
    rfContextHash: String(row.rf_context_hash ?? ""),
    rfCatalogStatus: String(row.rf_catalog_status ?? "unbound") as PersistedAnalysisRunRecord["rfCatalogStatus"],
    rfCatalogBinding: parseJson<GovernedRfCatalogBinding | null>(row.rf_catalog_binding_json, null),
    limitations: parseJson<string[]>(row.limitations_json, []),
    createdAt: String(row.created_at),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at),
    stages,
    rgClaimAdmissions,
    rgWorkItems,
    rgOperations,
    rgExecutionEvents,
    externalEvidenceRegistry: externalEvidence.evidence,
    externalEvidenceRegistryErrors: externalEvidence.errors,
    semanticRevisions,
    continuationRevisions,
    continuationExecutionGrants,
    result,
  };
}

export function persistCanonicalSemanticConvergence(input: {
  run: CanonicalAnalysisRun;
  revision: CanonicalSemanticConvergenceRevision;
  registry: CanonicalCurrentRunExternalEvidenceRegistry;
}): void {
  const existing = db.prepare(`SELECT revision_json FROM canonical_analysis_semantic_revisions
    WHERE run_id = ? AND semantic_hash = ?`).get(input.run.runId, input.revision.semanticHash) as { revision_json: string } | undefined;
  if (existing) return;
  const now = input.revision.createdAt;
  const transaction = db.transaction(() => {
    const insertEvidence = db.prepare(`INSERT OR IGNORE INTO canonical_analysis_external_evidence
      (run_id, evidence_id, evidence_json, evidence_hash, source_plan_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const evidence of input.registry.evidence) {
      const json = JSON.stringify(evidence);
      insertEvidence.run(input.run.runId, evidence.evidenceId, json, digestCanonical(evidence), evidence.planHash, now);
      const stored = db.prepare(`SELECT evidence_hash FROM canonical_analysis_external_evidence WHERE run_id = ? AND evidence_id = ?`)
        .get(input.run.runId, evidence.evidenceId) as { evidence_hash: string };
      if (stored.evidence_hash !== digestCanonical(evidence)) throw new Error("semantic_convergence_external_evidence_immutable_conflict");
    }
    db.prepare(`INSERT INTO canonical_analysis_semantic_revisions
      (run_id, revision, parent_semantic_hash, financial_foundation_hash, semantic_hash, canonical_state_hash,
       evidence_registry_hash, prior_plan_hash, next_plan_hash, revision_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.run.runId, input.revision.revision,
      input.revision.parentSemanticHash, input.revision.financialFoundationHash, input.revision.semanticHash,
      input.revision.canonicalStateHash, input.revision.evidenceRegistryHash, input.revision.priorPlanHash,
      input.revision.nextPlanHash, JSON.stringify(input.revision), now);
    const insertApplication = db.prepare(`INSERT INTO canonical_analysis_semantic_applications
      (run_id, revision, application_id, atomic_claim_id, facet, source_kind, disposition,
       application_json, application_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const application of input.revision.applications) {
      insertApplication.run(input.run.runId, input.revision.revision, application.applicationId,
        application.atomicClaimId, application.facet, application.sourceKind, application.disposition,
        JSON.stringify(application), digestCanonical(application), now);
    }
    const insertStageRevision = db.prepare(`INSERT INTO canonical_analysis_stage_revisions
      (run_id, revision, stage, artifact_json, artifact_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const stages: Array<[AnalysisRunStageId, unknown]> = [
      ["rd", input.run.artifacts.rd], ["re", input.run.artifacts.re],
      ["claim_inventory", input.run.artifacts.unresolvedClaims], ["rg_planning", input.run.artifacts.rgWorkLedger],
      ["rh", input.run.artifacts.rh],
    ];
    for (const [stage, artifact] of stages) {
      const artifactJson = artifact === null ? null : JSON.stringify(artifact);
      const artifactHash = artifact === null ? null : digestCanonical(artifact);
      insertStageRevision.run(input.run.runId, input.revision.revision, stage, artifactJson, artifactHash, now);
      db.prepare(`UPDATE canonical_analysis_run_stages SET artifact_json = ?, artifact_hash = ?, updated_at = ?
        WHERE run_id = ? AND stage = ?`).run(artifactJson, artifactHash, now, input.run.runId, stage);
    }
    if (input.run.artifacts.rgWorkLedger) persistRgWorkLedger(input.run.runId, input.run.artifacts.rgWorkLedger, now);
    const resultWithoutArtifacts = { ...input.run, artifacts: undefined };
    db.prepare(`UPDATE canonical_analysis_runs SET canonical_truth_hash = ?, financial_foundation_hash = ?, semantic_hash = ?,
      canonical_state_hash = ?, semantic_revision = ?, limitations_json = ?, result_json = ?, updated_at = ? WHERE id = ?`)
      .run(input.run.canonicalTruthHash, input.run.financialFoundationHash, input.run.semanticHash,
        input.run.canonicalStateHash, input.run.semanticRevision, JSON.stringify(input.run.limitations),
        JSON.stringify(resultWithoutArtifacts), now, input.run.runId);
  });
  transaction();
}

function mapStages(runId: string): PersistedAnalysisRunStage[] {
  const rows = db.prepare(`SELECT * FROM canonical_analysis_run_stages WHERE run_id = ? ORDER BY rowid ASC`).all(runId) as Record<string, unknown>[];
  return rows.map((row) => ({
    stage: String(row.stage) as AnalysisRunStageId,
    status: String(row.status) as AnalysisRunStageStatus,
    claimRef: String(row.claim_ref),
    evidenceObjective: String(row.evidence_objective),
    expectedDecisionEffect: String(row.expected_decision_effect),
    artifact: parseJson(row.artifact_json, null),
    artifactHash: row.artifact_hash ? String(row.artifact_hash) : null,
    errors: parseJson<string[]>(row.errors_json, []),
    warnings: parseJson<string[]>(row.warnings_json, []),
    limitations: parseJson<string[]>(row.limitations_json, []),
    resource: parseJson(row.resource_json, emptyResource(null)),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  }));
}

function artifactsFromStages(stages: PersistedAnalysisRunStage[]): CanonicalAnalysisArtifacts {
  const artifact = (stage: AnalysisRunStageId) => stages.find((item) => item.stage === stage)?.artifact ?? null;
  return {
    rb: artifact("rb") as CanonicalAnalysisArtifacts["rb"],
    rc: artifact("rc") as CanonicalAnalysisArtifacts["rc"],
    rfResolution: artifact("rf_resolution") as CanonicalAnalysisArtifacts["rfResolution"],
    rd: artifact("rd") as CanonicalAnalysisArtifacts["rd"],
    re: artifact("re") as CanonicalAnalysisArtifacts["re"],
    unresolvedClaims: artifact("claim_inventory") as CanonicalAnalysisArtifacts["unresolvedClaims"],
    rgWorkLedger: artifact("rg_planning") as CanonicalAnalysisArtifacts["rgWorkLedger"],
    rh: artifact("rh") as CanonicalAnalysisArtifacts["rh"],
  };
}

function mapRgClaims(runId: string): CanonicalRgClaimAdmission[] {
  const rows = db.prepare(`SELECT admission_json FROM canonical_rg_claim_admissions WHERE run_id = ? ORDER BY atomic_claim_id`).all(runId) as Array<{ admission_json: string }>;
  return rows.map((row) => parseJson<CanonicalRgClaimAdmission>(row.admission_json, null as never));
}

function mapRgWorkItems(runId: string): CanonicalRgWorkItem[] {
  const rows = db.prepare(`SELECT work_item_json FROM canonical_rg_work_items WHERE run_id = ? ORDER BY work_item_id`).all(runId) as Array<{ work_item_json: string }>;
  return rows.map((row) => parseJson<CanonicalRgWorkItem>(row.work_item_json, null as never));
}

function mapRgOperations(runId: string): CanonicalRgOperation[] {
  const rows = db.prepare(`SELECT operation_json FROM canonical_rg_operations WHERE run_id = ? ORDER BY created_at, rowid`)
    .all(runId) as Array<{ operation_json: string }>;
  return rows.map((row) => parseJson<CanonicalRgOperation>(row.operation_json, null as never));
}

function mapRgExecutionEvents(runId: string): PersistedAnalysisRunRecord["rgExecutionEvents"] {
  const rows = db.prepare(`SELECT rowid AS event_sequence, * FROM canonical_rg_execution_events
    WHERE run_id = ? ORDER BY rowid`)
    .all(runId) as Record<string, unknown>[];
  return rows.map((row) => ({
    eventId: String(row.event_id),
    eventSequence: Number(row.event_sequence),
    workItemId: String(row.work_item_id),
    operationId: row.operation_id ? String(row.operation_id) : null,
    eventType: String(row.event_type),
    event: parseJson(row.event_json, null),
    eventHash: String(row.event_hash),
    createdAt: String(row.created_at),
  }));
}

function mapExternalEvidence(runId: string): {
  evidence: CanonicalCurrentRunExternalEvidenceRegistry["evidence"];
  errors: string[];
} {
  const rows = db.prepare(`SELECT evidence_id, evidence_json, evidence_hash FROM canonical_analysis_external_evidence
    WHERE run_id = ? ORDER BY evidence_id`).all(runId) as Array<{
      evidence_id: string; evidence_json: string; evidence_hash: string;
    }>;
  const evidence: CanonicalCurrentRunExternalEvidenceRegistry["evidence"] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const value = parseJson<CanonicalCurrentRunExternalEvidenceRegistry["evidence"][number] | null>(row.evidence_json, null);
    if (!value || value.evidenceId !== row.evidence_id || digestCanonical(value) !== row.evidence_hash) {
      errors.push(`external_evidence_persisted_hash_invalid:${row.evidence_id}`);
    } else {
      evidence.push(value);
    }
  }
  return { evidence, errors };
}

function mapSemanticRevisions(runId: string): CanonicalSemanticConvergenceRevision[] {
  const rows = db.prepare(`SELECT revision_json FROM canonical_analysis_semantic_revisions WHERE run_id = ? ORDER BY revision`)
    .all(runId) as Array<{ revision_json: string }>;
  return rows.map((row) => parseJson(row.revision_json, null as never));
}

function mapContinuationRevisions(runId: string): CanonicalAdaptiveContinuationState[] {
  const rows = db.prepare(`SELECT state_json FROM canonical_analysis_continuation_revisions
    WHERE run_id = ? ORDER BY controller_revision`).all(runId) as Array<{ state_json: string }>;
  return rows.map((row) => parseJson(row.state_json, null as never));
}

function mapContinuationExecutionGrants(runId: string): CanonicalContinuationExecutionGrant[] {
  const rows = db.prepare(`SELECT grant_json FROM canonical_analysis_continuation_execution_grants
    WHERE run_id = ? ORDER BY execution_generation`).all(runId) as Array<{ grant_json: string }>;
  return rows.map((row) => parseJson(row.grant_json, null as never));
}

function mapAutonomousOutcomeRevisions(runId: string): {
  outcomes: CanonicalAutonomousOutcomeCheckpoint[];
  errors: string[];
} {
  const rows = db.prepare(`SELECT outcome_revision, outcome_hash, outcome_json
    FROM canonical_analysis_autonomous_outcome_revisions WHERE run_id = ? ORDER BY outcome_revision`)
    .all(runId) as Array<{ outcome_revision: number; outcome_hash: string; outcome_json: string }>;
  const outcomes: CanonicalAutonomousOutcomeCheckpoint[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const checkpoint = parseJson<CanonicalAutonomousOutcomeCheckpoint | null>(row.outcome_json, null);
    if (!checkpoint || checkpoint.runId !== runId || checkpoint.checkpointRevision !== Number(row.outcome_revision)
      || checkpoint.checkpointHash !== row.outcome_hash
      || canonicalAutonomousOutcomeCheckpointHash(checkpoint) !== row.outcome_hash) {
      errors.push(`autonomous_outcome_persisted_hash_invalid:${row.outcome_revision}`);
      continue;
    }
    outcomes.push(checkpoint);
  }
  return { outcomes, errors };
}

function selectCurrentAutonomousOutcome(input: {
  row: Record<string, unknown>;
  stages: PersistedAnalysisRunStage[];
  continuationRevisions: CanonicalAdaptiveContinuationState[];
  outcomes: CanonicalAutonomousOutcomeCheckpoint[];
  outcomeErrors: string[];
  autonomousOutcomeRevision: number;
  autonomousOutcomeHash: string | null;
}): { outcome: CanonicalAutonomousOutcomeCheckpoint | null; integrity: CanonicalAutonomousOutcomeIntegrity } {
  if (input.outcomeErrors.length > 0) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: [...input.outcomeErrors] } };
  }
  if (!input.autonomousOutcomeHash || input.autonomousOutcomeRevision === 0) {
    return { outcome: null, integrity: { status: "not_checkpointed", reasonCodes: ["autonomous_outcome_not_checkpointed"] } };
  }
  const outcome = input.outcomes.find((item) => item.checkpointRevision === input.autonomousOutcomeRevision
    && item.checkpointHash === input.autonomousOutcomeHash) ?? null;
  if (!outcome) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_pointer_invalid"] } };
  }
  const latestContinuation = input.continuationRevisions.at(-1) ?? null;
  const boundContinuation = input.continuationRevisions.find((item) =>
    item.controllerRevision === outcome.binding.continuationRevision
    && item.stateHash === outcome.binding.continuationStateHash) ?? null;
  const rhArtifactHash = input.stages.find((stage) => stage.stage === "rh")?.artifactHash ?? null;
  const expected = {
    sourceFingerprint: String(input.row.source_fingerprint),
    rfSnapshotHash: String(input.row.rf_snapshot_hash ?? ""),
    rfContextHash: String(input.row.rf_context_hash ?? ""),
    financialFoundationHash: nullableString(input.row.financial_foundation_hash),
    semanticHash: nullableString(input.row.semantic_hash),
    canonicalStateHash: nullableString(input.row.canonical_state_hash),
    semanticRevision: Number(input.row.semantic_revision ?? 0),
    planHash: nullableString(input.row.rg_plan_hash),
    planGeneration: Number(input.row.rg_plan_generation ?? 0),
    executionGeneration: Number(input.row.rg_execution_generation ?? 0),
    continuationRevision: Number(input.row.continuation_revision ?? 0),
    continuationStateHash: nullableString(input.row.continuation_state_hash),
    rhArtifactHash,
  };
  const staleReasons: string[] = [];
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (outcome.binding[key] !== expected[key]) staleReasons.push(`autonomous_outcome_stale_binding:${key}`);
  }
  if (latestContinuation && (latestContinuation.controllerRevision !== expected.continuationRevision
    || latestContinuation.stateHash !== expected.continuationStateHash)) {
    staleReasons.push("autonomous_outcome_stale_continuation_lineage");
  }
  if (boundContinuation && (digestCanonical(outcome.continuationReasonCodes) !== digestCanonical(boundContinuation.reasonCodes)
    || digestCanonical(outcome.cumulativeResource) !== digestCanonical(boundContinuation.cumulativeResource))) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_continuation_projection_invalid"] } };
  }
  const expectedContinuationBindingStatus = boundContinuation
    ? continuationMatchesOutcomeBinding(outcome, boundContinuation) ? "current" : "stale_at_interruption"
    : "unavailable_at_interruption";
  if (outcome.continuationBindingStatus !== expectedContinuationBindingStatus
    || (outcome.checkpointKind === "settled" && outcome.continuationBindingStatus !== "current")) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_continuation_binding_status_invalid"] } };
  }
  if (outcome.lifecycle !== String(input.row.continuation_lifecycle ?? "awaiting_first_pass_outcome")) {
    staleReasons.push("autonomous_outcome_stale_lifecycle");
  }
  if (outcome.checkpointKind === "settled"
    && outcome.completion !== canonicalAutonomousCompletionForLifecycle(outcome.lifecycle)) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_completion_mapping_invalid"] } };
  }
  if (outcome.checkpointKind === "settled" && boundContinuation
    && !continuationIsSettledForOutcome(boundContinuation)) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_lifecycle_not_settled"] } };
  }
  if (outcome.checkpointKind === "execution_interrupted" && outcome.completion !== null) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_interruption_claims_completion"] } };
  }
  const foundationPreserved = outcome.financialFoundationIntegrity.cycleStartHash
    === outcome.financialFoundationIntegrity.cycleEndHash;
  if (outcome.financialFoundationIntegrity.preserved !== foundationPreserved
    || outcome.financialFoundationIntegrity.cycleEndHash !== outcome.binding.financialFoundationHash
    || (outcome.checkpointKind === "settled" && !foundationPreserved)) {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_financial_foundation_integrity_invalid"] } };
  }
  if (outcome.authority !== "production_internal_canonical"
    || outcome.customerReportAuthority !== "legacy_report_unchanged"
    || outcome.analysisRunStatusCompatibility !== "pre_adaptive_status_meaning_unchanged") {
    return { outcome: null, integrity: { status: "invalid", reasonCodes: ["autonomous_outcome_authority_boundary_invalid"] } };
  }
  return staleReasons.length > 0
    ? { outcome, integrity: { status: "stale", reasonCodes: staleReasons } }
    : { outcome, integrity: { status: "current", reasonCodes: [] } };
}

function canonicalAutonomousOutcomeCheckpointHash(checkpoint: CanonicalAutonomousOutcomeCheckpoint): string {
  const { checkpointRevision: _revision, checkpointHash: _hash, createdAt: _createdAt, ...payload } = checkpoint;
  return digestCanonical(payload);
}

function assertContinuationCurrentForOutcome(
  run: Record<string, unknown>,
  continuation: CanonicalAdaptiveContinuationState,
): void {
  if (!continuationCurrentForOutcome(run, continuation)) {
    throw new Error("canonical_autonomous_outcome_stale_continuation_binding");
  }
}

function continuationCurrentForOutcome(
  run: Record<string, unknown>,
  continuation: CanonicalAdaptiveContinuationState,
): boolean {
  return continuation.binding.semanticRevision === Number(run.semantic_revision ?? 0)
    && continuation.binding.semanticHash === nullableString(run.semantic_hash)
    && continuation.binding.canonicalStateHash === nullableString(run.canonical_state_hash)
    && continuation.binding.planHash === nullableString(run.rg_plan_hash)
    && continuation.binding.planGeneration === Number(run.rg_plan_generation ?? 0)
    && continuation.binding.rfSnapshotHash === String(run.rf_snapshot_hash ?? "");
}

function continuationMatchesOutcomeBinding(
  outcome: CanonicalAutonomousOutcomeCheckpoint,
  continuation: CanonicalAdaptiveContinuationState,
): boolean {
  return continuation.binding.semanticRevision === outcome.binding.semanticRevision
    && continuation.binding.semanticHash === outcome.binding.semanticHash
    && continuation.binding.canonicalStateHash === outcome.binding.canonicalStateHash
    && continuation.binding.planHash === outcome.binding.planHash
    && continuation.binding.planGeneration === outcome.binding.planGeneration
    && continuation.binding.rfSnapshotHash === outcome.binding.rfSnapshotHash;
}

function assertContinuationSettledForOutcome(continuation: CanonicalAdaptiveContinuationState): void {
  if (!continuationIsSettledForOutcome(continuation)) {
    throw new Error("canonical_autonomous_outcome_lifecycle_not_settled");
  }
}

function continuationIsSettledForOutcome(continuation: CanonicalAdaptiveContinuationState): boolean {
  if (continuation.lifecycle === "indeterminate_reconciliation_required") return true;
  if (continuation.lifecycle === "awaiting_first_pass_outcome" || continuation.lifecycle === "convergence_required") return false;
  return continuation.continuationReadyAtomicClaimIds.length === 0;
}

function emptyContinuationResource(): CanonicalContinuationResourceAccounting {
  return {
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
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function emptyResource(elapsedMs: number | null): PersistedAnalysisRunStage["resource"] {
  return { execution: "deterministic_local", provider: null, model: null, calls: 0, tokens: null,
    retrievalBytes: 0, retries: 0, elapsedMs };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
