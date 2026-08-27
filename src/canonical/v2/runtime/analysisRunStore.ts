import { randomUUID } from "node:crypto";

import type { ParsedDocument } from "../../../parser.js";
import { db, nowIso } from "../../../db.js";
import type { CanonicalEconomicsV2CompletenessStatus } from "../types.js";
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
        status, family_status, parser_driver_id, attempt_count, canonical_truth_hash, rf_snapshot_hash, rf_context_hash,
        rf_catalog_status, rf_catalog_binding_json, limitations_json, result_json,
        created_at, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 'unresolved', NULL, ?, NULL, ?, ?, ?, ?, '[]', NULL, ?, ?, NULL, ?)
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
  db.prepare(`
    UPDATE canonical_analysis_run_stages
    SET status = ?, artifact_json = ?, artifact_hash = ?, errors_json = ?, warnings_json = ?, limitations_json = ?,
        resource_json = ?, completed_at = ?, elapsed_ms = ?, updated_at = ?
    WHERE run_id = ? AND stage = ?
  `).run(outcome.status, artifact === null || artifact === undefined ? null : JSON.stringify(artifact), outcome.artifactHash,
    JSON.stringify(outcome.errors), JSON.stringify(outcome.warnings), JSON.stringify(outcome.limitations),
    JSON.stringify(emptyResource(elapsedMs)), now, elapsedMs, now, runId, outcome.stage);
}

function finishRun(run: CanonicalAnalysisRun) {
  const now = nowIso();
  const resultWithoutArtifacts = { ...run, artifacts: undefined };
  db.prepare(`
    UPDATE canonical_analysis_runs
    SET status = ?, family_status = ?, parser_driver_id = ?, canonical_truth_hash = ?, limitations_json = ?,
        result_json = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(run.status, run.familyStatus, run.parser.driverId, run.canonicalTruthHash, JSON.stringify(run.limitations),
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
    result,
  };
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
    rh: artifact("rh") as CanonicalAnalysisArtifacts["rh"],
  };
}

function emptyResource(elapsedMs: number | null): PersistedAnalysisRunStage["resource"] {
  return { execution: "deterministic_local", provider: null, model: null, calls: 0, tokens: null,
    retrievalBytes: 0, retries: 0, elapsedMs };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
