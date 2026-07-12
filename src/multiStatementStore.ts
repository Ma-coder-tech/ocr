import { randomUUID } from "node:crypto";
import { assertOneOf } from "./assertOneOf.js";
import type { BusinessTypeId } from "./businessTypes.js";
import type { ComparisonStatementInput } from "./multiStatementComparisonInput.js";
import type { MultiStatementAnalysis } from "./multiStatementComparisonEngine.js";
import type { MultiStatementGlobalReport } from "./reporting/buildMultiStatement.js";
import { db, nowIso } from "./db.js";

export type MultiStatementJobStatus =
  | "created"
  | "validating_uploads"
  | "processing_statements"
  | "partially_failed"
  | "comparing"
  | "generating_report"
  | "completed"
  | "failed"
  | "cancelled";

export const MULTI_STATEMENT_JOB_STATUS_VALUES = [
  "created",
  "validating_uploads",
  "processing_statements",
  "partially_failed",
  "comparing",
  "generating_report",
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly MultiStatementJobStatus[];

export type MultiStatementJobFileStatus =
  | "uploaded"
  | "validated"
  | "parsing"
  | "analyzing"
  | "adapted"
  | "completed"
  | "failed"
  | "excluded";

export const MULTI_STATEMENT_JOB_FILE_STATUS_VALUES = [
  "uploaded",
  "validated",
  "parsing",
  "analyzing",
  "adapted",
  "completed",
  "failed",
  "excluded",
] as const satisfies readonly MultiStatementJobFileStatus[];

export type MultiStatementIdentityMatchStatus = "pending" | "matched" | "mismatch" | "needs_review";
export const MULTI_STATEMENT_IDENTITY_MATCH_STATUS_VALUES = [
  "pending",
  "matched",
  "mismatch",
  "needs_review",
] as const satisfies readonly MultiStatementIdentityMatchStatus[];

export type MultiStatementNarrativeStatus = "disabled" | "applied" | "failed";

export type MultiStatementJobRecord = {
  id: string;
  merchantId: number | null;
  status: MultiStatementJobStatus;
  businessType: BusinessTypeId;
  requestedStatementCount: number;
  completedStatementCount: number;
  failedStatementCount: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  missingPeriods: string[];
  processorFamily: string | null;
  isoName: string | null;
  merchantNameDetected: string | null;
  identityMatchStatus: MultiStatementIdentityMatchStatus | null;
  pipelineVersion: string | null;
  adapterVersion: string | null;
  comparisonEngineVersion: string | null;
  reportVersion: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type MultiStatementJobFileRecord = {
  id: string;
  multiStatementJobId: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  contentHash: string | null;
  status: MultiStatementJobFileStatus;
  detectedPeriod: string | null;
  detectedMerchantName: string | null;
  detectedMerchantNumber: string | null;
  detectedProcessor: string | null;
  detectedIso: string | null;
  singleStatementJobId: string | null;
  statementId: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MultiStatementInputRecord = {
  id: string;
  multiStatementJobId: string;
  statementId: number | null;
  statementPeriod: string;
  comparisonInput: ComparisonStatementInput;
  inputSchemaVersion: string;
  sourceSummaryHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MultiStatementAnalysisRecord = {
  id: string;
  multiStatementJobId: string;
  analysis: MultiStatementAnalysis;
  analysisSchemaVersion: string;
  engineVersion: string;
  createdAt: string;
};

export type MultiStatementReportRecord = {
  id: string;
  multiStatementJobId: string;
  report: MultiStatementGlobalReport;
  reportMarkdown: string | null;
  reportSchemaVersion: string;
  narrativeStatus: MultiStatementNarrativeStatus;
  narrativeProvider: string | null;
  narrativeModel: string | null;
  narrative: unknown | null;
  benchmarkStatus: string | null;
  averageEffectiveRate: number | null;
  estimatedAnnualSavings: number | null;
  createdAt: string;
  updatedAt: string;
};

export type MultiStatementJobEventRecord = {
  id: number;
  multiStatementJobId: string;
  at: string;
  stage: string;
  message: string;
  metadata: unknown | null;
};

function parseJson<T>(value: unknown, fallback: T, context: string): T {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} contains corrupt JSON: ${detail}`);
  }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapJob(row: Record<string, unknown> | undefined): MultiStatementJobRecord | null {
  if (!row) return null;
  const identityMatchStatus = row.identity_match_status
    ? assertOneOf(
        String(row.identity_match_status),
        MULTI_STATEMENT_IDENTITY_MATCH_STATUS_VALUES,
        "multi_statement_jobs.identity_match_status",
      )
    : null;
  return {
    id: String(row.id),
    merchantId: nullableNumber(row.merchant_id),
    status: assertOneOf(String(row.status), MULTI_STATEMENT_JOB_STATUS_VALUES, "multi_statement_jobs.status"),
    businessType: String(row.business_type) as BusinessTypeId,
    requestedStatementCount: Number(row.requested_statement_count),
    completedStatementCount: Number(row.completed_statement_count),
    failedStatementCount: Number(row.failed_statement_count),
    dateRangeStart: nullableString(row.date_range_start),
    dateRangeEnd: nullableString(row.date_range_end),
    missingPeriods: parseJson<string[]>(row.missing_periods_json, [], `multi-statement job ${row.id} missing_periods_json`),
    processorFamily: nullableString(row.processor_family),
    isoName: nullableString(row.iso_name),
    merchantNameDetected: nullableString(row.merchant_name_detected),
    identityMatchStatus,
    pipelineVersion: nullableString(row.pipeline_version),
    adapterVersion: nullableString(row.adapter_version),
    comparisonEngineVersion: nullableString(row.comparison_engine_version),
    reportVersion: nullableString(row.report_version),
    error: nullableString(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: nullableString(row.completed_at),
  };
}

function mapJobFile(row: Record<string, unknown> | undefined): MultiStatementJobFileRecord | null {
  if (!row) return null;
  return {
    id: String(row.id),
    multiStatementJobId: String(row.multi_statement_job_id),
    originalFileName: String(row.original_file_name),
    filePath: String(row.file_path),
    fileSize: Number(row.file_size),
    contentHash: nullableString(row.content_hash),
    status: assertOneOf(String(row.status), MULTI_STATEMENT_JOB_FILE_STATUS_VALUES, "multi_statement_job_files.status"),
    detectedPeriod: nullableString(row.detected_period),
    detectedMerchantName: nullableString(row.detected_merchant_name),
    detectedMerchantNumber: nullableString(row.detected_merchant_number),
    detectedProcessor: nullableString(row.detected_processor),
    detectedIso: nullableString(row.detected_iso),
    singleStatementJobId: nullableString(row.single_statement_job_id),
    statementId: nullableNumber(row.statement_id),
    error: nullableString(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapInput(row: Record<string, unknown> | undefined): MultiStatementInputRecord | null {
  if (!row) return null;
  return {
    id: String(row.id),
    multiStatementJobId: String(row.multi_statement_job_id),
    statementId: nullableNumber(row.statement_id),
    statementPeriod: String(row.statement_period),
    comparisonInput: parseJson<ComparisonStatementInput>(
      row.comparison_input_json,
      {} as ComparisonStatementInput,
      `multi-statement input ${row.id}`,
    ),
    inputSchemaVersion: String(row.input_schema_version),
    sourceSummaryHash: nullableString(row.source_summary_hash),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapAnalysis(row: Record<string, unknown> | undefined): MultiStatementAnalysisRecord | null {
  if (!row) return null;
  return {
    id: String(row.id),
    multiStatementJobId: String(row.multi_statement_job_id),
    analysis: parseJson<MultiStatementAnalysis>(row.analysis_json, {} as MultiStatementAnalysis, `multi-statement analysis ${row.id}`),
    analysisSchemaVersion: String(row.analysis_schema_version),
    engineVersion: String(row.engine_version),
    createdAt: String(row.created_at),
  };
}

function mapReport(row: Record<string, unknown> | undefined): MultiStatementReportRecord | null {
  if (!row) return null;
  return {
    id: String(row.id),
    multiStatementJobId: String(row.multi_statement_job_id),
    report: parseJson<MultiStatementGlobalReport>(row.report_json, {} as MultiStatementGlobalReport, `multi-statement report ${row.id}`),
    reportMarkdown: nullableString(row.report_markdown),
    reportSchemaVersion: String(row.report_schema_version),
    narrativeStatus: assertOneOf(
      String(row.narrative_status),
      ["disabled", "applied", "failed"] as const,
      "multi_statement_reports.narrative_status",
    ),
    narrativeProvider: nullableString(row.narrative_provider),
    narrativeModel: nullableString(row.narrative_model),
    narrative: parseJson<unknown | null>(row.narrative_json, null, `multi-statement report ${row.id} narrative_json`),
    benchmarkStatus: nullableString(row.benchmark_status),
    averageEffectiveRate: nullableNumber(row.average_effective_rate),
    estimatedAnnualSavings: nullableNumber(row.estimated_annual_savings),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): MultiStatementJobEventRecord {
  return {
    id: Number(row.id),
    multiStatementJobId: String(row.multi_statement_job_id),
    at: String(row.at),
    stage: String(row.stage),
    message: String(row.message),
    metadata: parseJson<unknown | null>(row.metadata_json, null, `multi-statement job event ${row.id} metadata_json`),
  };
}

export function appendMultiStatementJobEvent(input: {
  multiStatementJobId: string;
  stage: string;
  message: string;
  metadata?: unknown;
}): MultiStatementJobEventRecord {
  const at = nowIso();
  const result = db
    .prepare(
      `
        INSERT INTO multi_statement_job_events (multi_statement_job_id, at, stage, message, metadata_json)
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.multiStatementJobId,
      at,
      input.stage,
      input.message,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
    );
  const row = db
    .prepare(`SELECT * FROM multi_statement_job_events WHERE id = ?`)
    .get(result.lastInsertRowid) as Record<string, unknown>;
  return mapEvent(row);
}

export function createMultiStatementJob(input: {
  merchantId?: number | null;
  businessType: BusinessTypeId;
  requestedStatementCount: number;
  pipelineVersion?: string | null;
  adapterVersion?: string | null;
  comparisonEngineVersion?: string | null;
  reportVersion?: string | null;
}): MultiStatementJobRecord {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `
      INSERT INTO multi_statement_jobs (
        id, merchant_id, status, business_type, requested_statement_count, completed_statement_count, failed_statement_count,
        missing_periods_json, pipeline_version, adapter_version, comparison_engine_version, report_version, created_at, updated_at
      ) VALUES (?, ?, 'created', ?, ?, 0, 0, '[]', ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.merchantId ?? null,
    input.businessType,
    input.requestedStatementCount,
    input.pipelineVersion ?? null,
    input.adapterVersion ?? null,
    input.comparisonEngineVersion ?? null,
    input.reportVersion ?? null,
    now,
    now,
  );
  appendMultiStatementJobEvent({
    multiStatementJobId: id,
    stage: "created",
    message: "Multi-statement job created",
    metadata: { requestedStatementCount: input.requestedStatementCount },
  });
  return getMultiStatementJob(id)!;
}

export function getMultiStatementJob(id: string): MultiStatementJobRecord | null {
  const row = db.prepare(`SELECT * FROM multi_statement_jobs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapJob(row);
}

export function listMultiStatementJobsForMerchant(merchantId: number): MultiStatementJobRecord[] {
  const rows = db
    .prepare(`SELECT * FROM multi_statement_jobs WHERE merchant_id = ? ORDER BY created_at DESC`)
    .all(merchantId) as Array<Record<string, unknown>>;
  return rows.map((row) => mapJob(row)).filter((job): job is MultiStatementJobRecord => job !== null);
}

export function listRunnableMultiStatementJobs(): MultiStatementJobRecord[] {
  const rows = db
    .prepare(
      `
        SELECT *
        FROM multi_statement_jobs
        WHERE status NOT IN ('completed', 'failed', 'cancelled')
        ORDER BY created_at ASC
      `,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => mapJob(row)).filter((job): job is MultiStatementJobRecord => job !== null);
}

export function updateMultiStatementJobStatus(
  id: string,
  patch: Partial<{
    status: MultiStatementJobStatus;
    completedStatementCount: number;
    failedStatementCount: number;
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
    missingPeriods: string[];
    processorFamily: string | null;
    isoName: string | null;
    merchantNameDetected: string | null;
    identityMatchStatus: MultiStatementIdentityMatchStatus | null;
    pipelineVersion: string | null;
    adapterVersion: string | null;
    comparisonEngineVersion: string | null;
    reportVersion: string | null;
    error: string | null;
    completedAt: string | null;
  }>,
  message?: string,
): MultiStatementJobRecord {
  const current = getMultiStatementJob(id);
  if (!current) throw new Error(`Multi-statement job ${id} not found.`);
  const status = patch.status ?? current.status;
  const isTerminalStatus = status === "completed" || status === "failed" || status === "cancelled";
  const completedAt =
    patch.completedAt !== undefined ? patch.completedAt : isTerminalStatus && !current.completedAt ? nowIso() : current.completedAt;
  const updatedAt = nowIso();

  db.prepare(
    `
      UPDATE multi_statement_jobs
      SET status = ?,
          completed_statement_count = ?,
          failed_statement_count = ?,
          date_range_start = ?,
          date_range_end = ?,
          missing_periods_json = ?,
          processor_family = ?,
          iso_name = ?,
          merchant_name_detected = ?,
          identity_match_status = ?,
          pipeline_version = ?,
          adapter_version = ?,
          comparison_engine_version = ?,
          report_version = ?,
          error = ?,
          updated_at = ?,
          completed_at = ?
      WHERE id = ?
    `,
  ).run(
    status,
    patch.completedStatementCount ?? current.completedStatementCount,
    patch.failedStatementCount ?? current.failedStatementCount,
    patch.dateRangeStart !== undefined ? patch.dateRangeStart : current.dateRangeStart,
    patch.dateRangeEnd !== undefined ? patch.dateRangeEnd : current.dateRangeEnd,
    JSON.stringify(patch.missingPeriods ?? current.missingPeriods),
    patch.processorFamily !== undefined ? patch.processorFamily : current.processorFamily,
    patch.isoName !== undefined ? patch.isoName : current.isoName,
    patch.merchantNameDetected !== undefined ? patch.merchantNameDetected : current.merchantNameDetected,
    patch.identityMatchStatus !== undefined ? patch.identityMatchStatus : current.identityMatchStatus,
    patch.pipelineVersion !== undefined ? patch.pipelineVersion : current.pipelineVersion,
    patch.adapterVersion !== undefined ? patch.adapterVersion : current.adapterVersion,
    patch.comparisonEngineVersion !== undefined ? patch.comparisonEngineVersion : current.comparisonEngineVersion,
    patch.reportVersion !== undefined ? patch.reportVersion : current.reportVersion,
    patch.error !== undefined ? patch.error : current.error,
    updatedAt,
    completedAt,
    id,
  );

  if (message) appendMultiStatementJobEvent({ multiStatementJobId: id, stage: status, message });
  return getMultiStatementJob(id)!;
}

export function addMultiStatementJobFile(input: {
  multiStatementJobId: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  contentHash?: string | null;
  status?: MultiStatementJobFileStatus;
}): MultiStatementJobFileRecord {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `
      INSERT INTO multi_statement_job_files (
        id, multi_statement_job_id, original_file_name, file_path, file_size, content_hash, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.multiStatementJobId,
    input.originalFileName,
    input.filePath,
    input.fileSize,
    input.contentHash ?? null,
    input.status ?? "uploaded",
    now,
    now,
  );
  return getMultiStatementJobFile(id)!;
}

export function getMultiStatementJobFile(id: string): MultiStatementJobFileRecord | null {
  const row = db.prepare(`SELECT * FROM multi_statement_job_files WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapJobFile(row);
}

export function listMultiStatementJobFiles(multiStatementJobId: string): MultiStatementJobFileRecord[] {
  const rows = db
    .prepare(`SELECT * FROM multi_statement_job_files WHERE multi_statement_job_id = ? ORDER BY created_at ASC`)
    .all(multiStatementJobId) as Array<Record<string, unknown>>;
  return rows.map((row) => mapJobFile(row)).filter((file): file is MultiStatementJobFileRecord => file !== null);
}

export function updateMultiStatementJobFileStatus(
  id: string,
  patch: Partial<{
    status: MultiStatementJobFileStatus;
    detectedPeriod: string | null;
    detectedMerchantName: string | null;
    detectedMerchantNumber: string | null;
    detectedProcessor: string | null;
    detectedIso: string | null;
    singleStatementJobId: string | null;
    statementId: number | null;
    error: string | null;
  }>,
): MultiStatementJobFileRecord {
  const current = getMultiStatementJobFile(id);
  if (!current) throw new Error(`Multi-statement job file ${id} not found.`);
  db.prepare(
    `
      UPDATE multi_statement_job_files
      SET status = ?,
          detected_period = ?,
          detected_merchant_name = ?,
          detected_merchant_number = ?,
          detected_processor = ?,
          detected_iso = ?,
          single_statement_job_id = ?,
          statement_id = ?,
          error = ?,
          updated_at = ?
      WHERE id = ?
    `,
  ).run(
    patch.status ?? current.status,
    patch.detectedPeriod !== undefined ? patch.detectedPeriod : current.detectedPeriod,
    patch.detectedMerchantName !== undefined ? patch.detectedMerchantName : current.detectedMerchantName,
    patch.detectedMerchantNumber !== undefined ? patch.detectedMerchantNumber : current.detectedMerchantNumber,
    patch.detectedProcessor !== undefined ? patch.detectedProcessor : current.detectedProcessor,
    patch.detectedIso !== undefined ? patch.detectedIso : current.detectedIso,
    patch.singleStatementJobId !== undefined ? patch.singleStatementJobId : current.singleStatementJobId,
    patch.statementId !== undefined ? patch.statementId : current.statementId,
    patch.error !== undefined ? patch.error : current.error,
    nowIso(),
    id,
  );
  return getMultiStatementJobFile(id)!;
}

export function saveComparisonInput(input: {
  multiStatementJobId: string;
  statementId?: number | null;
  statementPeriod: string;
  comparisonInput: ComparisonStatementInput;
  inputSchemaVersion: string;
  sourceSummaryHash?: string | null;
}): MultiStatementInputRecord {
  const existing = db
    .prepare(`SELECT * FROM multi_statement_inputs WHERE multi_statement_job_id = ? AND statement_period = ?`)
    .get(input.multiStatementJobId, input.statementPeriod) as Record<string, unknown> | undefined;
  const id = existing ? String(existing.id) : randomUUID();
  const now = nowIso();
  if (existing) {
    db.prepare(
      `
        UPDATE multi_statement_inputs
        SET statement_id = ?,
            comparison_input_json = ?,
            input_schema_version = ?,
            source_summary_hash = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(
      input.statementId ?? null,
      JSON.stringify(input.comparisonInput),
      input.inputSchemaVersion,
      input.sourceSummaryHash ?? null,
      now,
      id,
    );
  } else {
    db.prepare(
      `
        INSERT INTO multi_statement_inputs (
          id, multi_statement_job_id, statement_id, statement_period, comparison_input_json, input_schema_version,
          source_summary_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      input.multiStatementJobId,
      input.statementId ?? null,
      input.statementPeriod,
      JSON.stringify(input.comparisonInput),
      input.inputSchemaVersion,
      input.sourceSummaryHash ?? null,
      now,
      now,
    );
  }
  return getComparisonInput(id)!;
}

export function getComparisonInput(id: string): MultiStatementInputRecord | null {
  const row = db.prepare(`SELECT * FROM multi_statement_inputs WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapInput(row);
}

export function getComparisonInputsForJob(multiStatementJobId: string): MultiStatementInputRecord[] {
  const rows = db
    .prepare(`SELECT * FROM multi_statement_inputs WHERE multi_statement_job_id = ? ORDER BY statement_period ASC`)
    .all(multiStatementJobId) as Array<Record<string, unknown>>;
  return rows.map((row) => mapInput(row)).filter((input): input is MultiStatementInputRecord => input !== null);
}

export function saveMultiStatementAnalysis(input: {
  multiStatementJobId: string;
  analysis: MultiStatementAnalysis;
  analysisSchemaVersion: string;
  engineVersion: string;
}): MultiStatementAnalysisRecord {
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `
      INSERT INTO multi_statement_analyses (
        id, multi_statement_job_id, analysis_json, analysis_schema_version, engine_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(id, input.multiStatementJobId, JSON.stringify(input.analysis), input.analysisSchemaVersion, input.engineVersion, createdAt);
  return getMultiStatementAnalysis(id)!;
}

export function getMultiStatementAnalysis(id: string): MultiStatementAnalysisRecord | null {
  const row = db.prepare(`SELECT * FROM multi_statement_analyses WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapAnalysis(row);
}

export function getLatestMultiStatementAnalysisForJob(multiStatementJobId: string): MultiStatementAnalysisRecord | null {
  const row = db
    .prepare(`SELECT * FROM multi_statement_analyses WHERE multi_statement_job_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(multiStatementJobId) as Record<string, unknown> | undefined;
  return mapAnalysis(row);
}

export function saveMultiStatementReport(input: {
  multiStatementJobId: string;
  report: MultiStatementGlobalReport;
  reportMarkdown?: string | null;
  reportSchemaVersion: string;
  narrativeStatus: MultiStatementNarrativeStatus;
  narrativeProvider?: string | null;
  narrativeModel?: string | null;
  narrative?: unknown;
}): MultiStatementReportRecord {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(
    `
      INSERT INTO multi_statement_reports (
        id, multi_statement_job_id, report_json, report_markdown, report_schema_version, narrative_status,
        narrative_provider, narrative_model, narrative_json, benchmark_status, average_effective_rate, estimated_annual_savings,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.multiStatementJobId,
    JSON.stringify(input.report),
    input.reportMarkdown ?? null,
    input.reportSchemaVersion,
    input.narrativeStatus,
    input.narrativeProvider ?? null,
    input.narrativeModel ?? null,
    input.narrative === undefined ? null : JSON.stringify(input.narrative),
    input.report.executiveSummary.benchmark.status,
    finiteNumberOrNull(input.report.executiveSummary.averageEffectiveRate.rawValue),
    finiteNumberOrNull(input.report.executiveSummary.headlineSavings.rawValue),
    now,
    now,
  );
  return getMultiStatementReport(id)!;
}

export function getMultiStatementReport(id: string): MultiStatementReportRecord | null {
  const row = db.prepare(`SELECT * FROM multi_statement_reports WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapReport(row);
}

export function getLatestMultiStatementReportForJob(multiStatementJobId: string): MultiStatementReportRecord | null {
  const row = db
    .prepare(`SELECT * FROM multi_statement_reports WHERE multi_statement_job_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(multiStatementJobId) as Record<string, unknown> | undefined;
  return mapReport(row);
}

export function getLatestMultiStatementReportForMerchant(merchantId: number): MultiStatementReportRecord | null {
  const row = db
    .prepare(
      `
        SELECT reports.*
        FROM multi_statement_reports reports
        JOIN multi_statement_jobs jobs ON jobs.id = reports.multi_statement_job_id
        WHERE jobs.merchant_id = ?
        ORDER BY reports.created_at DESC, reports.rowid DESC
        LIMIT 1
      `,
    )
    .get(merchantId) as Record<string, unknown> | undefined;
  return mapReport(row);
}

export function listMultiStatementJobEvents(multiStatementJobId: string): MultiStatementJobEventRecord[] {
  const rows = db
    .prepare(`SELECT * FROM multi_statement_job_events WHERE multi_statement_job_id = ? ORDER BY id ASC`)
    .all(multiStatementJobId) as Array<Record<string, unknown>>;
  return rows.map(mapEvent);
}
