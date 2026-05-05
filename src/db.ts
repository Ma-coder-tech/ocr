import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVercel = Boolean(process.env.VERCEL) || Boolean(process.env.VERCEL_ENV);
const configuredDbPath = process.env.FEECLEAR_DB_PATH?.trim();
const dbPath = configuredDbPath || (isVercel
  ? path.join("/tmp", "ocr-data", "feeclear.sqlite")
  : path.resolve(__dirname, "..", "data", "feeclear.sqlite"));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log("[db] path =", dbPath);

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

function hasColumn(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function ensureColumn(tableName: string, columnName: string, sqlType: string): void {
  if (hasColumn(tableName, columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      business_type TEXT,
      free_statements_remaining INTEGER NOT NULL DEFAULT 2,
      chosen_path TEXT,
      statement_2_period TEXT,
      statement_2_processor TEXT,
      statement_2_volume REAL,
      statement_2_total_fees REAL,
      statement_2_effective_rate REAL,
      statement_2_benchmark_verdict TEXT,
      statement_2_processor_markup REAL,
      statement_2_processor_markup_bps REAL,
      statement_2_card_network_fees REAL,
      comparison_alert_type TEXT,
      comparison_effective_rate_delta REAL,
      comparison_fees_delta REAL,
      comparison_processor_markup_bps_delta REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id TEXT PRIMARY KEY,
      upload_id TEXT,
      merchant_id INTEGER REFERENCES merchants(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      business_type TEXT NOT NULL,
      statement_slot INTEGER,
      replace_statement_id INTEGER,
      detected_statement_period TEXT,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_run_at TEXT,
      error TEXT,
      summary_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
      at TEXT NOT NULL,
      stage TEXT NOT NULL,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS statement_uploads (
      id TEXT PRIMARY KEY,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      detected_statement_period TEXT,
      validation_status TEXT NOT NULL,
      validation_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL,
      period_key TEXT NOT NULL,
      statement_period TEXT NOT NULL,
      processor_name TEXT,
      business_type TEXT NOT NULL,
      total_volume REAL NOT NULL,
      total_fees REAL NOT NULL,
      effective_rate REAL NOT NULL,
      analysis_status TEXT NOT NULL DEFAULT 'completed',
      benchmark_verdict TEXT NOT NULL,
      benchmark_low REAL NOT NULL,
      benchmark_high REAL NOT NULL,
      processor_markup REAL,
      processor_markup_bps REAL,
      card_network_fees REAL,
      analysis_summary_json TEXT NOT NULL,
      source_job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(merchant_id, slot)
    );

    CREATE TABLE IF NOT EXISTS comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
      statement_1_id INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
      statement_2_id INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      effective_rate_delta REAL NOT NULL,
      fees_delta REAL NOT NULL,
      volume_delta REAL NOT NULL,
      processor_markup_delta REAL,
      processor_markup_bps_delta REAL,
      card_network_fees_delta REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON analysis_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_merchant ON analysis_jobs(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON analysis_jobs(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_merchant ON statement_uploads(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_job_events_job ON analysis_job_events(job_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_statements_merchant_period ON statements(merchant_id, period_key);
  `);

  ensureColumn("merchants", "statement_2_period", "TEXT");
  ensureColumn("merchants", "statement_2_processor", "TEXT");
  ensureColumn("merchants", "statement_2_volume", "REAL");
  ensureColumn("merchants", "statement_2_total_fees", "REAL");
  ensureColumn("merchants", "statement_2_effective_rate", "REAL");
  ensureColumn("merchants", "statement_2_benchmark_verdict", "TEXT");
  ensureColumn("merchants", "statement_2_processor_markup", "REAL");
  ensureColumn("merchants", "statement_2_processor_markup_bps", "REAL");
  ensureColumn("merchants", "statement_2_card_network_fees", "REAL");
  ensureColumn("merchants", "comparison_alert_type", "TEXT");
  ensureColumn("merchants", "comparison_effective_rate_delta", "REAL");
  ensureColumn("merchants", "comparison_fees_delta", "REAL");
  ensureColumn("merchants", "comparison_processor_markup_bps_delta", "REAL");
  ensureColumn("merchants", "free_statements_remaining", "INTEGER NOT NULL DEFAULT 2");
  ensureColumn("merchants", "chosen_path", "TEXT");
  ensureColumn("analysis_jobs", "upload_id", "TEXT");
  ensureColumn("analysis_jobs", "merchant_id", "INTEGER");
  ensureColumn("analysis_jobs", "statement_slot", "INTEGER");
  ensureColumn("analysis_jobs", "replace_statement_id", "INTEGER");
  ensureColumn("analysis_jobs", "detected_statement_period", "TEXT");
  ensureColumn("analysis_jobs", "attempt_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("analysis_jobs", "max_attempts", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn("analysis_jobs", "next_run_at", "TEXT");
  ensureColumn("statements", "analysis_status", "TEXT NOT NULL DEFAULT 'completed'");
  ensureColumn("statements", "processor_markup_bps", "REAL");
  ensureColumn("comparisons", "processor_markup_bps_delta", "REAL");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_due ON analysis_jobs(status, next_run_at, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_upload_id ON analysis_jobs(upload_id) WHERE upload_id IS NOT NULL;
  `);
}

migrate();

export function nowIso(): string {
  return new Date().toISOString();
}
