import path from "node:path";
import Database from "better-sqlite3";
import { customerFinancialsAuthorized } from "../src/customerFinancialAuthority.js";
import type { AnalysisSummary } from "../src/types.js";

const filename = path.resolve(process.argv[2] ?? "data/feeclear.sqlite");
const database = new Database(filename, { readonly: true, fileMustExist: true });
type Row = { id: string | number; summary: string | null };
function disposition(raw: string | null): "authorized" | "explicitly_denied" | "missing_decision" | "invalid_summary" {
  if (!raw) return "invalid_summary";
  try {
    const summary = JSON.parse(raw) as AnalysisSummary;
    if (summary.parserDecision?.reportable === false
      || summary.parserDecision?.validationState?.customerFacingTotalsAllowed === false) {
      return "explicitly_denied";
    }
    if (summary.sourceType === "pdf" && !summary.parserDecision) return "missing_decision";
    return customerFinancialsAuthorized(summary) ? "authorized" : "invalid_summary";
  } catch { return "invalid_summary"; }
}
function counts(rows: Row[]) {
  const result = { total: rows.length, authorized: 0, explicitly_denied: 0,
    missing_decision: 0, invalid_summary: 0 };
  for (const row of rows) result[disposition(row.summary)]++;
  return result;
}
try {
  const statements = database.prepare("SELECT id, source_job_id AS sourceJobId, analysis_summary_json AS summary FROM statements")
    .all() as Array<Row & { sourceJobId: string | null }>;
  const completedJobs = database.prepare("SELECT id, summary_json AS summary FROM analysis_jobs WHERE status = 'completed'")
    .all() as Row[];
  const eligibleByStatementId = new Map(statements.map((row) => [Number(row.id),
    disposition(row.summary) === "authorized"]));
  const comparisons = database.prepare("SELECT statement_1_id AS firstId, statement_2_id AS secondId FROM comparisons")
    .all() as Array<{ firstId: number; secondId: number }>;
  const jobIds = new Set((database.prepare("SELECT id FROM analysis_jobs").all() as Array<{ id: string }>).map((row) => row.id));
  console.log(JSON.stringify({ source: path.basename(filename), readOnly: true,
    savedStatements: counts(statements), completedJobs: counts(completedJobs),
    savedStatementAuditLink: { matchingSourceJob: statements.filter((row) => row.sourceJobId && jobIds.has(row.sourceJobId)).length,
      missingSourceJob: statements.filter((row) => !row.sourceJobId || !jobIds.has(row.sourceJobId)).length },
    comparisons: { total: comparisons.length,
      withUnauthorizedInput: comparisons.filter((row) => !eligibleByStatementId.get(row.firstId)
        || !eligibleByStatementId.get(row.secondId)).length } }, null, 2));
} finally { database.close(); }
