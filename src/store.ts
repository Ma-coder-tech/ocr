import { assertOneOf } from "./assertOneOf.js";
import { randomUUID } from "node:crypto";
import type { BusinessTypeId } from "./businessTypes.js";
import { db, nowIso } from "./db.js";
import { JOB_STATUS_VALUES, isStatementSlot, type Job, type JobEvent, type JobStatus, type StatementSlot } from "./types.js";

const TERMINAL_JOB_RETENTION_HOURS = Math.max(1, Number(process.env.TERMINAL_JOB_RETENTION_HOURS ?? 24));
const JOB_RETRY_BASE_MS = Math.max(100, Number(process.env.JOB_RETRY_BASE_MS ?? 2_000));
const JOB_RETRY_MAX_MS = Math.max(JOB_RETRY_BASE_MS, Number(process.env.JOB_RETRY_MAX_MS ?? 30_000));
const DEFAULT_JOB_MAX_ATTEMPTS = Math.max(1, Number(process.env.JOB_MAX_ATTEMPTS ?? 3));

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(JOB_RETRY_MAX_MS, JOB_RETRY_BASE_MS * 2 ** Math.max(0, attemptCount - 1));
}

function toStatementSlot(value: unknown, field: string): StatementSlot {
  if (!isStatementSlot(value)) {
    throw new Error(`${field} must be an integer from 1 to 12.`);
  }
  return Number(value) as StatementSlot;
}

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
    uploadId: row.upload_id ? String(row.upload_id) : null,
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileType: assertOneOf(String(row.file_type), ["csv", "pdf"] as const, "analysis_jobs.file_type"),
    businessType: String(row.business_type) as BusinessTypeId,
    merchantId: row.merchant_id === null || row.merchant_id === undefined ? null : Number(row.merchant_id),
    statementSlot:
      row.statement_slot === null || row.statement_slot === undefined
        ? null
        : toStatementSlot(Number(row.statement_slot), "analysis_jobs.statement_slot"),
    replaceStatementId:
      row.replace_statement_id === null || row.replace_statement_id === undefined ? null : Number(row.replace_statement_id),
    detectedStatementPeriod: row.detected_statement_period ? String(row.detected_statement_period) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    status: assertOneOf(String(row.status), JOB_STATUS_VALUES, "analysis_jobs.status"),
    progress: Number(row.progress),
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? DEFAULT_JOB_MAX_ATTEMPTS),
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
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
  uploadId?: string | null;
  fileName: string;
  filePath: string;
  fileType: "csv" | "pdf";
  businessType: BusinessTypeId;
  merchantId?: number | null;
  statementSlot?: StatementSlot | null;
  replaceStatementId?: number | null;
  detectedStatementPeriod?: string | null;
  maxAttempts?: number | null;
}): Job {
  const now = nowIso();
  const id = randomUUID();
  const maxAttempts = Math.max(1, Number(input.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS));

  db.prepare(`
    INSERT INTO analysis_jobs (
      id, upload_id, merchant_id, file_name, file_path, file_type, business_type, statement_slot, replace_statement_id, detected_statement_period,
      status, progress, attempt_count, max_attempts, next_run_at, error, summary_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, 0, ?, NULL, NULL, NULL, ?, ?)
  `).run(
    id,
    input.uploadId ?? null,
    input.merchantId ?? null,
    input.fileName,
    input.filePath,
    input.fileType,
    input.businessType,
    input.statementSlot ?? null,
    input.replaceStatementId ?? null,
    input.detectedStatementPeriod ?? null,
    maxAttempts,
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

export function getJobByUploadId(uploadId: string): Job | undefined {
  const row = db.prepare(`SELECT * FROM analysis_jobs WHERE upload_id = ?`).get(uploadId) as Record<string, unknown> | undefined;
  return mapJob(row);
}

export function listStatementJobsForMerchant(merchantId: number): Job[] {
  const rows = db
    .prepare(`
      SELECT *
      FROM analysis_jobs
      WHERE merchant_id = ?
        AND statement_slot IS NOT NULL
      ORDER BY created_at ASC
    `)
    .all(merchantId) as Array<Record<string, unknown>>;
  return rows.map((row) => mapJob(row)!).filter(Boolean);
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
  patch: Partial<
    Pick<
      Job,
      | "uploadId"
      | "status"
      | "progress"
      | "error"
      | "summary"
      | "detectedStatementPeriod"
      | "merchantId"
      | "statementSlot"
      | "replaceStatementId"
      | "attemptCount"
      | "maxAttempts"
      | "nextRunAt"
    >
  >,
  message?: string,
): Job {
  const current = getJob(id);
  if (!current) {
    throw new Error(`Job ${id} not found`);
  }

  const nextStatus = patch.status ?? current.status;
  const nextProgress = patch.progress ?? current.progress;
  const nextError = hasOwn(patch, "error") ? patch.error ?? null : current.error ?? null;
  const nextSummary = hasOwn(patch, "summary") ? patch.summary : current.summary;
  const nextUploadId = patch.uploadId !== undefined ? patch.uploadId : current.uploadId ?? null;
  const nextDetectedStatementPeriod =
    patch.detectedStatementPeriod !== undefined ? patch.detectedStatementPeriod : current.detectedStatementPeriod ?? null;
  const nextMerchantId = patch.merchantId !== undefined ? patch.merchantId : current.merchantId ?? null;
  const nextStatementSlot = patch.statementSlot !== undefined ? patch.statementSlot : current.statementSlot ?? null;
  const nextReplaceStatementId =
    patch.replaceStatementId !== undefined ? patch.replaceStatementId : current.replaceStatementId ?? null;
  const nextAttemptCount = patch.attemptCount ?? current.attemptCount;
  const nextMaxAttempts = patch.maxAttempts ?? current.maxAttempts;
  const nextNextRunAt = patch.nextRunAt !== undefined ? patch.nextRunAt : current.nextRunAt ?? null;
  const updatedAt = nowIso();

  db.prepare(`
    UPDATE analysis_jobs
    SET upload_id = ?, merchant_id = ?, statement_slot = ?, replace_statement_id = ?, detected_statement_period = ?,
        status = ?, progress = ?, attempt_count = ?, max_attempts = ?, next_run_at = ?, error = ?, summary_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextUploadId,
    nextMerchantId,
    nextStatementSlot,
    nextReplaceStatementId,
    nextDetectedStatementPeriod,
    nextStatus,
    nextProgress,
    nextAttemptCount,
    nextMaxAttempts,
    nextNextRunAt,
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
  return updateJob(id, { status: "failed", progress: 100, error, nextRunAt: null }, error);
}

export function stageUpdate(id: string, status: JobStatus, progress: number, message: string): Job {
  return updateJob(id, { status, progress }, message);
}

export function startJobAttempt(id: string): Job {
  const current = getJob(id);
  if (!current) {
    throw new Error(`Job ${id} not found`);
  }
  const attemptCount = current.attemptCount + 1;
  return updateJob(
    id,
    {
      status: "verifying_statement",
      progress: 10,
      error: undefined,
      attemptCount,
      nextRunAt: null,
    },
    `Verifying statement format (attempt ${attemptCount} of ${current.maxAttempts})`,
  );
}

export function retryJobOrFail(id: string, error: string): { job: Job; retrying: boolean; delayMs: number } {
  const current = getJob(id);
  if (!current) {
    throw new Error(`Job ${id} not found`);
  }

  if (current.attemptCount >= current.maxAttempts) {
    return { job: failJob(id, error), retrying: false, delayMs: 0 };
  }

  const delayMs = retryDelayMs(current.attemptCount);
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  const job = updateJob(
    id,
    {
      status: "queued",
      progress: 0,
      error,
      nextRunAt,
    },
    `Analysis attempt ${current.attemptCount} failed; retrying in ${Math.ceil(delayMs / 1000)} seconds`,
  );
  return { job, retrying: true, delayMs };
}

export function listQueuedJobs(): Job[] {
  const rows = db
    .prepare(`
      SELECT * FROM analysis_jobs
      WHERE status = 'queued'
        AND (next_run_at IS NULL OR next_run_at <= ?)
      ORDER BY created_at ASC
    `)
    .all(nowIso()) as Array<Record<string, unknown>>;
  return rows.map((row) => mapJob(row)!).filter(Boolean);
}

export function getNextQueuedJob(): Job | undefined {
  return listQueuedJobs()[0];
}

export function getNextQueuedJobDelayMs(): number | null {
  const row = db
    .prepare(`
      SELECT next_run_at
      FROM analysis_jobs
      WHERE status = 'queued'
        AND next_run_at IS NOT NULL
        AND next_run_at > ?
      ORDER BY next_run_at ASC
      LIMIT 1
    `)
    .get(nowIso()) as { next_run_at?: string } | undefined;
  if (!row?.next_run_at) return null;
  return Math.max(0, new Date(row.next_run_at).getTime() - Date.now());
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
    SET status = 'queued', progress = 0, error = NULL, next_run_at = NULL, updated_at = ?
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

export function assignJobMetadata(id: string, patch: { merchantId?: number | null; statementSlot?: StatementSlot | null; detectedStatementPeriod?: string | null }): Job {
  return updateJob(id, patch);
}
