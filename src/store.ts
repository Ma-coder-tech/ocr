import { assertOneOf } from "./assertOneOf.js";
import { randomUUID } from "node:crypto";
import type { BusinessTypeId } from "./businessTypes.js";
import { db, nowIso } from "./db.js";
import { JOB_STATUS_VALUES, type Job, type JobEvent, type JobStatus } from "./types.js";

const TERMINAL_JOB_RETENTION_HOURS = Math.max(1, Number(process.env.TERMINAL_JOB_RETENTION_HOURS ?? 24));

function mapJob(row: Record<string, unknown> | undefined): Job | undefined {
  if (!row) return undefined;
  let summary: Job["summary"] | undefined;
  if (row.summary_json) {
    try {
      summary = JSON.parse(String(row.summary_json)) as Job["summary"];
    } catch (e) {
      console.error("[store] corrupt summary_json for job", row.id, e);
      summary = undefined;
    }
  }

  return {
    id: String(row.id),
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileType: assertOneOf(String(row.file_type), ["csv", "pdf"] as const, "analysis_jobs.file_type"),
    businessType: String(row.business_type) as BusinessTypeId,
    merchantId: row.merchant_id === null || row.merchant_id === undefined ? null : Number(row.merchant_id),
    statementSlot: row.statement_slot === null || row.statement_slot === undefined ? null : (Number(row.statement_slot) as 1 | 2),
    detectedStatementPeriod: row.detected_statement_period ? String(row.detected_statement_period) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    status: assertOneOf(String(row.status), JOB_STATUS_VALUES, "analysis_jobs.status"),
    progress: Number(row.progress),
    error: row.error ? String(row.error) : undefined,
    summary,
    events: listEvents(String(row.id)),
  };
}

function isTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "failed";
}

export function pruneJobs(): void {
  const cutoffIso = new Date(Date.now() - TERMINAL_JOB_RETENTION_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare(`
    DELETE FROM analysis_jobs
    WHERE status IN ('completed', 'failed')
      AND updated_at < ?
      AND merchant_id IS NULL
  `).run(cutoffIso);
}

export function createJob(input: {
  fileName: string;
  filePath: string;
  fileType: "csv" | "pdf";
  businessType: BusinessTypeId;
  merchantId?: number | null;
  statementSlot?: 1 | 2 | null;
  detectedStatementPeriod?: string | null;
}): Job {
  const now = nowIso();
  const id = randomUUID();

  db.prepare(`
    INSERT INTO analysis_jobs (
      id, merchant_id, file_name, file_path, file_type, business_type, statement_slot, detected_statement_period,
      status, progress, error, summary_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, NULL, NULL, ?, ?)
  `).run(
    id,
    input.merchantId ?? null,
    input.fileName,
    input.filePath,
    input.fileType,
    input.businessType,
    input.statementSlot ?? null,
    input.detectedStatementPeriod ?? null,
    now,
    now,
  );

  db.prepare(`
    INSERT INTO analysis_job_events (job_id, at, stage, message) VALUES (?, ?, 'queued', 'Job queued')
  `).run(id, now);

  return getJob(id)!;
}

export function getJob(id: string): Job | undefined {
  const row = db.prepare(`SELECT * FROM analysis_jobs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapJob(row);
}

export function listEvents(id: string): JobEvent[] {
  const rows = db
    .prepare(`SELECT at, stage, message FROM analysis_job_events WHERE job_id = ? ORDER BY id ASC`)
    .all(id) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    at: String(row.at),
    stage: String(row.stage) as JobStatus,
    message: String(row.message),
  }));
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "progress" | "error" | "summary" | "detectedStatementPeriod" | "merchantId" | "statementSlot">>,
  message?: string,
): Job {
  const current = getJob(id);
  if (!current) {
    throw new Error(`Job ${id} not found`);
  }

  const nextStatus = patch.status ?? current.status;
  const nextProgress = patch.progress ?? current.progress;
  const nextError = patch.error ?? current.error ?? null;
  const nextSummary = patch.summary ?? current.summary;
  const nextDetectedStatementPeriod =
    patch.detectedStatementPeriod !== undefined ? patch.detectedStatementPeriod : current.detectedStatementPeriod ?? null;
  const nextMerchantId = patch.merchantId !== undefined ? patch.merchantId : current.merchantId ?? null;
  const nextStatementSlot = patch.statementSlot !== undefined ? patch.statementSlot : current.statementSlot ?? null;
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE analysis_jobs
    SET merchant_id = ?, statement_slot = ?, detected_statement_period = ?, status = ?, progress = ?, error = ?, summary_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextMerchantId,
    nextStatementSlot,
    nextDetectedStatementPeriod,
    nextStatus,
    nextProgress,
    nextError,
    nextSummary ? JSON.stringify(nextSummary) : null,
    updatedAt,
    id,
  );

  if (message) {
    db.prepare(`
      INSERT INTO analysis_job_events (job_id, at, stage, message) VALUES (?, ?, ?, ?)
    `).run(id, updatedAt, nextStatus, message);
  }

  return getJob(id)!;
}

export function failJob(id: string, error: string): Job {
  return updateJob(id, { status: "failed", progress: 100, error }, error);
}

export function stageUpdate(id: string, status: JobStatus, progress: number, message: string): Job {
  return updateJob(id, { status, progress }, message);
}

export function listQueuedJobs(): Job[] {
  const rows = db
    .prepare(`
      SELECT * FROM analysis_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
    `)
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => mapJob(row)!).filter(Boolean);
}

export function getNextQueuedJob(): Job | undefined {
  return listQueuedJobs()[0];
}

export function requeueInterruptedJobs(): number {
  const rows = db
    .prepare(`
      SELECT id
      FROM analysis_jobs
      WHERE status NOT IN ('queued', 'completed', 'failed')
      ORDER BY created_at ASC
    `)
    .all() as Array<{ id: string }>;

  if (!rows.length) {
    return 0;
  }

  const updatedAt = nowIso();
  db.prepare(`
    UPDATE analysis_jobs
    SET status = 'queued', progress = 0, error = NULL, updated_at = ?
    WHERE status NOT IN ('queued', 'completed', 'failed')
  `).run(updatedAt);

  const insertEvent = db.prepare(`
    INSERT INTO analysis_job_events (job_id, at, stage, message)
    VALUES (?, ?, 'queued', 'Job resumed after server restart')
  `);
  for (const row of rows) {
    insertEvent.run(row.id, updatedAt);
  }

  return rows.length;
}

export function assignJobMetadata(id: string, patch: { merchantId?: number | null; statementSlot?: 1 | 2 | null; detectedStatementPeriod?: string | null }): Job {
  return updateJob(id, patch);
}
