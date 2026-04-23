import { randomUUID } from "node:crypto";
import { assertOneOf } from "./assertOneOf.js";
import { BENCHMARK_STATUS_VALUES, type AnalysisSummary, type BenchmarkStatus, type Job } from "./types.js";
import { BUSINESS_TYPE_IDS, type BusinessTypeId } from "./businessTypes.js";
import { db, nowIso } from "./db.js";
import { formatPeriodKey, parsePeriodKey } from "./periods.js";
import { sessionExpiryIso } from "./auth.js";
import { isCardBrandPassThrough, isProcessorCoreFee } from "./feeClassification.js";

export type MerchantAccount = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  businessType: BusinessTypeId | null;
  freeStatementsRemaining: number;
  chosenPath: "audit" | "monitor" | null;
  createdAt: string;
  updatedAt: string;
  statement2Period: string | null;
  statement2Processor: string | null;
  statement2Volume: number | null;
  statement2TotalFees: number | null;
  statement2EffectiveRate: number | null;
  statement2BenchmarkVerdict: BenchmarkStatus | null;
  statement2ProcessorMarkup: number | null;
  statement2CardNetworkFees: number | null;
  comparisonAlertType: ComparisonAlertType | null;
  comparisonEffectiveRateDelta: number | null;
  comparisonFeesDelta: number | null;
};

export type SessionRecord = {
  id: number;
  merchantId: number;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
};

export type StatementRecord = {
  id: number;
  merchantId: number;
  slot: 1 | 2;
  periodKey: string;
  statementPeriod: string;
  processorName: string | null;
  businessType: BusinessTypeId;
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  benchmarkVerdict: BenchmarkStatus;
  benchmarkLow: number;
  benchmarkHigh: number;
  processorMarkup: number | null;
  cardNetworkFees: number | null;
  analysisSummary: AnalysisSummary;
  sourceJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ComparisonAlertType =
  | "rate_up_above_benchmark"
  | "rate_up_within_benchmark"
  | "both_above_benchmark"
  | "rate_down"
  | "rate_flat_within_benchmark";

export const COMPARISON_ALERT_TYPE_VALUES = [
  "rate_up_above_benchmark",
  "rate_up_within_benchmark",
  "both_above_benchmark",
  "rate_down",
  "rate_flat_within_benchmark",
] as const satisfies readonly ComparisonAlertType[];

export const CHOSEN_PATH_VALUES = ["audit", "monitor"] as const satisfies readonly NonNullable<MerchantAccount["chosenPath"]>[];
export const STATEMENT_UPLOAD_STATUS_VALUES = ["ready", "error"] as const satisfies readonly StatementUploadRecord["validationStatus"][];

export type ComparisonRecord = {
  id: number;
  merchantId: number;
  statement1Id: number;
  statement2Id: number;
  alertType: ComparisonAlertType;
  effectiveRateDelta: number;
  feesDelta: number;
  volumeDelta: number;
  processorMarkupDelta: number | null;
  cardNetworkFeesDelta: number | null;
  createdAt: string;
  updatedAt: string;
};

export type StatementUploadRecord = {
  id: string;
  merchantId: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  detectedStatementPeriod: string | null;
  validationStatus: "ready" | "error";
  validationError: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapMerchant(row: Record<string, unknown> | undefined): MerchantAccount | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    businessType: row.business_type ? assertOneOf(String(row.business_type), BUSINESS_TYPE_IDS, "merchants.business_type") : null,
    freeStatementsRemaining: Number(row.free_statements_remaining),
    chosenPath: row.chosen_path ? assertOneOf(String(row.chosen_path), CHOSEN_PATH_VALUES, "merchants.chosen_path") : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    statement2Period: row.statement_2_period ? String(row.statement_2_period) : null,
    statement2Processor: row.statement_2_processor ? String(row.statement_2_processor) : null,
    statement2Volume: row.statement_2_volume === null || row.statement_2_volume === undefined ? null : Number(row.statement_2_volume),
    statement2TotalFees: row.statement_2_total_fees === null || row.statement_2_total_fees === undefined ? null : Number(row.statement_2_total_fees),
    statement2EffectiveRate:
      row.statement_2_effective_rate === null || row.statement_2_effective_rate === undefined ? null : Number(row.statement_2_effective_rate),
    statement2BenchmarkVerdict: row.statement_2_benchmark_verdict
      ? assertOneOf(String(row.statement_2_benchmark_verdict), BENCHMARK_STATUS_VALUES, "merchants.statement_2_benchmark_verdict")
      : null,
    statement2ProcessorMarkup:
      row.statement_2_processor_markup === null || row.statement_2_processor_markup === undefined
        ? null
        : Number(row.statement_2_processor_markup),
    statement2CardNetworkFees:
      row.statement_2_card_network_fees === null || row.statement_2_card_network_fees === undefined
        ? null
        : Number(row.statement_2_card_network_fees),
    comparisonAlertType: row.comparison_alert_type
      ? assertOneOf(String(row.comparison_alert_type), COMPARISON_ALERT_TYPE_VALUES, "merchants.comparison_alert_type")
      : null,
    comparisonEffectiveRateDelta:
      row.comparison_effective_rate_delta === null || row.comparison_effective_rate_delta === undefined
        ? null
        : Number(row.comparison_effective_rate_delta),
    comparisonFeesDelta:
      row.comparison_fees_delta === null || row.comparison_fees_delta === undefined ? null : Number(row.comparison_fees_delta),
  };
}

function mapStatement(row: Record<string, unknown> | undefined): StatementRecord | null {
  if (!row) return null;

  let analysisSummary: AnalysisSummary;
  try {
    analysisSummary = JSON.parse(String(row.analysis_summary_json)) as AnalysisSummary;
  } catch (e) {
    console.error("[accountStore] corrupt analysis_summary_json for statement", row.id, e);
    throw new Error(`Statement ${row.id} has corrupt analysis data. Manual repair required.`);
  }

  return {
    id: Number(row.id),
    merchantId: Number(row.merchant_id),
    slot: Number(row.slot) as 1 | 2,
    periodKey: String(row.period_key),
    statementPeriod: String(row.statement_period),
    processorName: row.processor_name ? String(row.processor_name) : null,
    businessType: assertOneOf(String(row.business_type), BUSINESS_TYPE_IDS, "statements.business_type"),
    totalVolume: Number(row.total_volume),
    totalFees: Number(row.total_fees),
    effectiveRate: Number(row.effective_rate),
    benchmarkVerdict: assertOneOf(String(row.benchmark_verdict), BENCHMARK_STATUS_VALUES, "statements.benchmark_verdict"),
    benchmarkLow: Number(row.benchmark_low),
    benchmarkHigh: Number(row.benchmark_high),
    processorMarkup: row.processor_markup === null || row.processor_markup === undefined ? null : Number(row.processor_markup),
    cardNetworkFees:
      row.card_network_fees === null || row.card_network_fees === undefined ? null : Number(row.card_network_fees),
    analysisSummary,
    sourceJobId: row.source_job_id ? String(row.source_job_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapComparison(row: Record<string, unknown> | undefined): ComparisonRecord | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    merchantId: Number(row.merchant_id),
    statement1Id: Number(row.statement_1_id),
    statement2Id: Number(row.statement_2_id),
    alertType: assertOneOf(String(row.alert_type), COMPARISON_ALERT_TYPE_VALUES, "comparisons.alert_type"),
    effectiveRateDelta: Number(row.effective_rate_delta),
    feesDelta: Number(row.fees_delta),
    volumeDelta: Number(row.volume_delta),
    processorMarkupDelta:
      row.processor_markup_delta === null || row.processor_markup_delta === undefined ? null : Number(row.processor_markup_delta),
    cardNetworkFeesDelta:
      row.card_network_fees_delta === null || row.card_network_fees_delta === undefined ? null : Number(row.card_network_fees_delta),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSession(row: Record<string, unknown> | undefined): SessionRecord | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    merchantId: Number(row.merchant_id),
    tokenHash: String(row.token_hash),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

function mapUpload(row: Record<string, unknown> | undefined): StatementUploadRecord | null {
  if (!row) return null;
  return {
    id: String(row.id),
    merchantId: Number(row.merchant_id),
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileSize: Number(row.file_size),
    detectedStatementPeriod: row.detected_statement_period ? String(row.detected_statement_period) : null,
    validationStatus: assertOneOf(String(row.validation_status), STATEMENT_UPLOAD_STATUS_VALUES, "statement_uploads.validation_status"),
    validationError: row.validation_error ? String(row.validation_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveFeeComponentAmounts(summary: AnalysisSummary): { processorMarkup: number | null; cardNetworkFees: number | null } {
  const buckets = Array.isArray(summary.feeBreakdown) ? summary.feeBreakdown : [];
  if (!buckets.length) {
    return { processorMarkup: null, cardNetworkFees: null };
  }

  let processorMarkup = 0;
  let cardNetworkFees = 0;

  for (const row of buckets) {
    const amount = Number(row.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (isCardBrandPassThrough(row)) {
      cardNetworkFees += amount;
      continue;
    }

    if (isProcessorCoreFee(row)) {
      processorMarkup += amount;
    }
  }

  return {
    processorMarkup: processorMarkup > 0 ? round2(processorMarkup) : null,
    cardNetworkFees: cardNetworkFees > 0 ? round2(cardNetworkFees) : null,
  };
}

function determineAlertType(statement1: StatementRecord, statement2: StatementRecord): ComparisonAlertType {
  const delta = round2(statement2.effectiveRate - statement1.effectiveRate);
  const absDelta = Math.abs(delta);
  const bothAbove = statement1.benchmarkVerdict === "above" && statement2.benchmarkVerdict === "above";
  const laterAbove = statement2.benchmarkVerdict === "above";
  const bothWithinOrBelow =
    statement1.benchmarkVerdict !== "above" &&
    statement2.benchmarkVerdict !== "above";

  if (bothAbove) return "both_above_benchmark";
  if (delta < -0.01) return "rate_down";
  if (laterAbove && delta >= -0.01) return "rate_up_above_benchmark";
  if (bothWithinOrBelow && absDelta <= 0.05) return "rate_flat_within_benchmark";
  return "rate_up_within_benchmark";
}

export function createMerchantAccount(input: {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  businessType?: BusinessTypeId | null;
}): MerchantAccount {
  const now = nowIso();
  const result = db
    .prepare(`
      INSERT INTO merchants (
        email, first_name, last_name, password_hash, business_type, free_statements_remaining, chosen_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 2, NULL, ?, ?)
    `)
    .run(input.email.toLowerCase(), input.firstName, input.lastName, input.passwordHash, input.businessType ?? null, now, now);

  return getMerchantById(Number(result.lastInsertRowid))!;
}

export function getMerchantById(id: number): MerchantAccount | null {
  const row = db.prepare(`SELECT * FROM merchants WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return mapMerchant(row);
}

export function getMerchantByEmail(email: string): MerchantAccount | null {
  const row = db.prepare(`SELECT * FROM merchants WHERE email = ?`).get(email.toLowerCase()) as Record<string, unknown> | undefined;
  return mapMerchant(row);
}

export function getMerchantPasswordHash(email: string): string | null {
  const row = db.prepare(`SELECT password_hash FROM merchants WHERE email = ?`).get(email.toLowerCase()) as { password_hash?: string } | undefined;
  return row?.password_hash ?? null;
}

export function updateMerchantBusinessType(merchantId: number, businessType: BusinessTypeId): void {
  db.prepare(`UPDATE merchants SET business_type = ?, updated_at = ? WHERE id = ?`).run(businessType, nowIso(), merchantId);
}

export function createSessionRecord(merchantId: number, tokenHash: string, expiresAt: string): SessionRecord {
  const now = nowIso();
  const result = db
    .prepare(`
      INSERT INTO sessions (merchant_id, token_hash, created_at, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(merchantId, tokenHash, now, expiresAt, now);

  return mapSession(
    db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(Number(result.lastInsertRowid)) as Record<string, unknown> | undefined,
  )!;
}

export function getSessionRecord(tokenHash: string): SessionRecord | null {
  const row = db.prepare(`SELECT * FROM sessions WHERE token_hash = ?`).get(tokenHash) as Record<string, unknown> | undefined;
  return mapSession(row);
}

export function touchSessionRecord(tokenHash: string): void {
  db.prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`).run(nowIso(), sessionExpiryIso(), tokenHash);
}

export function deleteSessionRecord(tokenHash: string): void {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function deleteExpiredSessions(): void {
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(nowIso());
}

export function createStatementUpload(input: {
  merchantId: number;
  fileName: string;
  filePath: string;
  fileSize: number;
  detectedStatementPeriod: string | null;
  validationStatus: "ready" | "error";
  validationError: string | null;
}): StatementUploadRecord {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO statement_uploads (
      id, merchant_id, file_name, file_path, file_size, detected_statement_period, validation_status, validation_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.merchantId,
    input.fileName,
    input.filePath,
    input.fileSize,
    input.detectedStatementPeriod,
    input.validationStatus,
    input.validationError,
    now,
    now,
  );
  return getStatementUploadForMerchant(id, input.merchantId)!;
}

export function getStatementUploadForMerchant(id: string, merchantId: number): StatementUploadRecord | null {
  const row = db
    .prepare(`SELECT * FROM statement_uploads WHERE id = ? AND merchant_id = ?`)
    .get(id, merchantId) as Record<string, unknown> | undefined;
  return mapUpload(row);
}

export function deleteStatementUpload(id: string, merchantId: number): void {
  db.prepare(`DELETE FROM statement_uploads WHERE id = ? AND merchant_id = ?`).run(id, merchantId);
}

export function getStatementByMerchantSlot(merchantId: number, slot: 1 | 2): StatementRecord | null {
  const row = db
    .prepare(`SELECT * FROM statements WHERE merchant_id = ? AND slot = ?`)
    .get(merchantId, slot) as Record<string, unknown> | undefined;
  return mapStatement(row);
}

export function getStatementsForMerchant(merchantId: number): StatementRecord[] {
  const rows = db
    .prepare(`SELECT * FROM statements WHERE merchant_id = ? ORDER BY slot ASC`)
    .all(merchantId) as Array<Record<string, unknown>>;
  return rows.map((row) => mapStatement(row)!).filter(Boolean);
}

export function persistStatementFromSummary(input: {
  merchantId: number;
  slot: 1 | 2;
  summary: AnalysisSummary;
  sourceJobId?: string | null;
  preferredPeriodKey?: string | null;
}): StatementRecord {
  const tx = db.transaction(() => {
    const periodKey = input.preferredPeriodKey ?? parsePeriodKey(input.summary.statementPeriod) ?? nowIso().slice(0, 7);
    const statementPeriod = formatPeriodKey(periodKey);
    const processorName = input.summary.processorName === "Unknown" ? null : input.summary.processorName;
    const benchmarkVerdict = input.summary.benchmark.status;
    const { processorMarkup, cardNetworkFees } = deriveFeeComponentAmounts(input.summary);
    const now = nowIso();
    const existing = getStatementByMerchantSlot(input.merchantId, input.slot);

    if (existing) {
      db.prepare(`
        UPDATE statements SET
          period_key = ?,
          statement_period = ?,
          processor_name = ?,
          business_type = ?,
          total_volume = ?,
          total_fees = ?,
          effective_rate = ?,
          benchmark_verdict = ?,
          benchmark_low = ?,
          benchmark_high = ?,
          processor_markup = ?,
          card_network_fees = ?,
          analysis_summary_json = ?,
          source_job_id = ?,
          updated_at = ?
        WHERE merchant_id = ? AND slot = ?
      `).run(
        periodKey,
        statementPeriod,
        processorName,
        input.summary.businessType,
        round2(input.summary.totalVolume),
        round2(input.summary.totalFees),
        round2(input.summary.effectiveRate),
        benchmarkVerdict,
        round2(input.summary.benchmark.lowerRate),
        round2(input.summary.benchmark.upperRate),
        processorMarkup,
        cardNetworkFees,
        JSON.stringify(input.summary),
        input.sourceJobId ?? null,
        now,
        input.merchantId,
        input.slot,
      );
    } else {
      db.prepare(`
        INSERT INTO statements (
          merchant_id, slot, period_key, statement_period, processor_name, business_type, total_volume, total_fees,
          effective_rate, benchmark_verdict, benchmark_low, benchmark_high, processor_markup, card_network_fees,
          analysis_summary_json, source_job_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.merchantId,
        input.slot,
        periodKey,
        statementPeriod,
        processorName,
        input.summary.businessType,
        round2(input.summary.totalVolume),
        round2(input.summary.totalFees),
        round2(input.summary.effectiveRate),
        benchmarkVerdict,
        round2(input.summary.benchmark.lowerRate),
        round2(input.summary.benchmark.upperRate),
        processorMarkup,
        cardNetworkFees,
        JSON.stringify(input.summary),
        input.sourceJobId ?? null,
        now,
        now,
      );
    }

    updateMerchantBusinessType(input.merchantId, input.summary.businessType);
    if (input.slot === 1) {
      db.prepare(`
        UPDATE merchants
        SET free_statements_remaining = CASE WHEN free_statements_remaining > 1 THEN free_statements_remaining - 1 ELSE free_statements_remaining END,
            updated_at = ?
        WHERE id = ?
      `).run(nowIso(), input.merchantId);
    }

    const statement = getStatementByMerchantSlot(input.merchantId, input.slot)!;

    if (input.slot === 2) {
      db.prepare(`
        UPDATE merchants
        SET
          statement_2_period = ?,
          statement_2_processor = ?,
          statement_2_volume = ?,
          statement_2_total_fees = ?,
          statement_2_effective_rate = ?,
          statement_2_benchmark_verdict = ?,
          statement_2_processor_markup = ?,
          statement_2_card_network_fees = ?,
          free_statements_remaining = 0,
          updated_at = ?
        WHERE id = ?
      `).run(
        statement.statementPeriod,
        statement.processorName,
        statement.totalVolume,
        statement.totalFees,
        statement.effectiveRate,
        statement.benchmarkVerdict,
        statement.processorMarkup,
        statement.cardNetworkFees,
        nowIso(),
        input.merchantId,
      );
    }

    return statement;
  });

  return tx();
}

export function createOrReplaceComparison(merchantId: number): ComparisonRecord {
  const tx = db.transaction(() => {
    const statement1 = getStatementByMerchantSlot(merchantId, 1);
    const statement2 = getStatementByMerchantSlot(merchantId, 2);
    if (!statement1 || !statement2) {
      throw new Error("Both statements are required before comparison can be created.");
    }

    const effectiveRateDelta = round2(statement2.effectiveRate - statement1.effectiveRate);
    const feesDelta = round2(statement2.totalFees - statement1.totalFees);
    const volumeDelta = round2(statement2.totalVolume - statement1.totalVolume);
    const processorMarkupDelta =
      statement1.processorMarkup === null || statement2.processorMarkup === null
        ? null
        : round2(statement2.processorMarkup - statement1.processorMarkup);
    const cardNetworkFeesDelta =
      statement1.cardNetworkFees === null || statement2.cardNetworkFees === null
        ? null
        : round2(statement2.cardNetworkFees - statement1.cardNetworkFees);
    const alertType = determineAlertType(statement1, statement2);
    const now = nowIso();

    const existing = db.prepare(`SELECT * FROM comparisons WHERE merchant_id = ?`).get(merchantId) as Record<string, unknown> | undefined;
    if (existing) {
      db.prepare(`
        UPDATE comparisons
        SET statement_1_id = ?, statement_2_id = ?, alert_type = ?, effective_rate_delta = ?, fees_delta = ?, volume_delta = ?,
            processor_markup_delta = ?, card_network_fees_delta = ?, updated_at = ?
        WHERE merchant_id = ?
      `).run(
        statement1.id,
        statement2.id,
        alertType,
        effectiveRateDelta,
        feesDelta,
        volumeDelta,
        processorMarkupDelta,
        cardNetworkFeesDelta,
        now,
        merchantId,
      );
    } else {
      db.prepare(`
        INSERT INTO comparisons (
          merchant_id, statement_1_id, statement_2_id, alert_type, effective_rate_delta, fees_delta, volume_delta,
          processor_markup_delta, card_network_fees_delta, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        merchantId,
        statement1.id,
        statement2.id,
        alertType,
        effectiveRateDelta,
        feesDelta,
        volumeDelta,
        processorMarkupDelta,
        cardNetworkFeesDelta,
        now,
        now,
      );
    }

    db.prepare(`
      UPDATE merchants
      SET comparison_alert_type = ?, comparison_effective_rate_delta = ?, comparison_fees_delta = ?, updated_at = ?
      WHERE id = ?
    `).run(alertType, effectiveRateDelta, feesDelta, nowIso(), merchantId);

    return getComparisonForMerchant(merchantId)!;
  });

  return tx();
}

export function getComparisonForMerchant(merchantId: number): ComparisonRecord | null {
  const row = db
    .prepare(`SELECT * FROM comparisons WHERE merchant_id = ?`)
    .get(merchantId) as Record<string, unknown> | undefined;
  return mapComparison(row);
}

export function setMerchantChosenPath(merchantId: number, chosenPath: "audit" | "monitor"): void {
  db.prepare(`UPDATE merchants SET chosen_path = ?, updated_at = ? WHERE id = ?`).run(chosenPath, nowIso(), merchantId);
}

export function resetMerchantDevState(merchantId: number): void {
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM statements WHERE merchant_id = ?`).run(merchantId);
    db.prepare(`DELETE FROM comparisons WHERE merchant_id = ?`).run(merchantId);
    db.prepare(`
      UPDATE merchants
      SET
        free_statements_remaining = 2,
        chosen_path = NULL,
        statement_2_period = NULL,
        statement_2_processor = NULL,
        statement_2_volume = NULL,
        statement_2_total_fees = NULL,
        statement_2_effective_rate = NULL,
        statement_2_benchmark_verdict = NULL,
        statement_2_processor_markup = NULL,
        statement_2_card_network_fees = NULL,
        comparison_alert_type = NULL,
        comparison_effective_rate_delta = NULL,
        comparison_fees_delta = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(now, merchantId);
  });

  tx();
}

export function setMerchantFreeStatementsRemaining(merchantId: number, value: number): void {
  db.prepare(`
    UPDATE merchants
    SET free_statements_remaining = ?, updated_at = ?
    WHERE id = ?
  `).run(value, nowIso(), merchantId);
}

export function getMerchantDashboardContext(merchantId: number): {
  merchant: MerchantAccount;
  statement1: StatementRecord | null;
  statement2: StatementRecord | null;
  comparison: ComparisonRecord | null;
} | null {
  const merchant = getMerchantById(merchantId);
  if (!merchant) return null;
  return {
    merchant,
    statement1: getStatementByMerchantSlot(merchantId, 1),
    statement2: getStatementByMerchantSlot(merchantId, 2),
    comparison: getComparisonForMerchant(merchantId),
  };
}

export function claimStatementOneJob(input: {
  merchantId: number;
  job: Job;
}): StatementRecord {
  if (!input.job.summary) {
    throw new Error("Statement analysis is not complete yet.");
  }

  const summary = input.job.summary;
  const periodKey = parsePeriodKey(summary.statementPeriod) ?? parsePeriodKey(input.job.detectedStatementPeriod ?? "") ?? null;
  const claimed = persistStatementFromSummary({
    merchantId: input.merchantId,
    slot: 1,
    summary,
    sourceJobId: input.job.id,
    preferredPeriodKey: periodKey,
  });

  return claimed;
}
