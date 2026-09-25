import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSummary, Job } from "../src/types.js";

const denied = {
  businessType: "retail", processorName: "Clover", sourceType: "pdf",
  statementPeriod: "2024-11", executiveSummary: "Unsafe conclusion: save money",
  totalVolume: 53291.02, totalFees: 1330.96, effectiveRate: 2.5,
  estimatedMonthlyVolume: 53291.02, estimatedMonthlyFees: 1330.96,
  estimatedAnnualSavings: 1188.12,
  benchmark: { status: "above", lowerRate: 1, upperRate: 2 },
  confidence: "high", dataQuality: [],
  parserDecision: { status: "needs_review", reportable: false,
    confidence: "needs_review", reason: "supportingVolumeAgreement",
    validationState: { customerFacingTotalsAllowed: false, blockingReasons: ["unreconciled"] } },
} as unknown as AnalysisSummary;
const accepted = { ...denied,
  parserDecision: { ...denied.parserDecision!, status: "accepted", reportable: true,
    confidence: "high", validationState: { ...denied.parserDecision!.validationState!,
      customerFacingTotalsAllowed: true } },
} as AnalysisSummary;

describe("customer financial authority boundary", () => {
  it("requires an affirmative PDF decision and respects the independent totals flag", async () => {
    const { customerFinancialsAuthorized, requireCustomerFinancialAuthority } =
      await import("../src/customerFinancialAuthority.js");
    expect(customerFinancialsAuthorized(accepted)).toBe(true);
    expect(customerFinancialsAuthorized(denied)).toBe(false);
    expect(customerFinancialsAuthorized({ ...accepted, parserDecision: undefined })).toBe(false);
    expect(customerFinancialsAuthorized({ ...accepted,
      parserDecision: { ...accepted.parserDecision!, validationState: {
        ...accepted.parserDecision!.validationState!, customerFacingTotalsAllowed: false } } })).toBe(false);
    expect(customerFinancialsAuthorized({ ...denied, sourceType: "csv" })).toBe(false);
    expect(customerFinancialsAuthorized({ ...accepted, sourceType: "csv", parserDecision: undefined })).toBe(true);
    expect(customerFinancialsAuthorized({ ...accepted, sourceType: undefined } as unknown as AnalysisSummary)).toBe(false);
    expect(() => requireCustomerFinancialAuthority(denied)).toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
  });

  it("blocks public summary, comparison input, and the old needs-review reporting exception", async () => {
    const [{ toPublicReportSummary }, { buildComparisonStatementInput }, { canShowTotalVolume }] =
      await Promise.all([
        import("../src/publicReport.js"), import("../src/multiStatementComparisonInput.js"),
        import("../src/reporting/policy.js"),
      ]);
    expect(toPublicReportSummary(denied)).toBeUndefined();
    expect(toPublicReportSummary(accepted)).toMatchObject({ totalVolume: 53291.02,
      totalFees: 1330.96, effectiveRate: 2.5, estimatedAnnualSavings: 1188.12 });
    expect(() => buildComparisonStatementInput(denied)).toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    expect(canShowTotalVolume(denied).allowed).toBe(false);
  });
});

describe("historical saved statement protection", () => {
  let dbModule: typeof import("../src/db.js");
  beforeEach(() => { vi.resetModules(); process.env.FEECLEAR_DB_PATH = ":memory:"; });
  afterEach(() => { dbModule?.db.close(); delete process.env.FEECLEAR_DB_PATH; });

  it("keeps raw observations but redacts historical scalars and disables stored comparisons", async () => {
    const [account, projection, loadedDb, aggregate] = await Promise.all([
      import("../src/accountStore.js"), import("../src/customerFinancialProjection.js"),
      import("../src/db.js"), import("../src/aggregateAudit.js"),
    ]);
    dbModule = loadedDb;
    const merchant = account.createMerchantAccount({ email: "authority@example.com", firstName: "Test",
      lastName: "Merchant", passwordHash: "hash", businessType: "retail" });
    const insert = loadedDb.db.prepare(`INSERT INTO statements
      (merchant_id,slot,period_key,statement_period,processor_name,business_type,total_volume,total_fees,
       effective_rate,analysis_status,benchmark_verdict,benchmark_low,benchmark_high,analysis_summary_json,
       source_job_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'completed','above',1,2,?,?,?,?)`);
    const now = "2026-09-25T00:00:00.000Z";
    const first = insert.run(merchant.id, 1, "2024-11", "November 2024", "Clover", "retail",
      53291.02, 1330.96, 2.5, JSON.stringify(denied), "job-denied", now, now);
    const second = insert.run(merchant.id, 2, "2024-12", "December 2024", "Clover", "retail",
      53291.02, 1330.96, 2.5, JSON.stringify(accepted), "job-accepted", now, now);
    loadedDb.db.prepare(`INSERT INTO comparisons
      (merchant_id,statement_1_id,statement_2_id,alert_type,effective_rate_delta,fees_delta,volume_delta,
       created_at,updated_at) VALUES (?,?,?,'rate_flat_within_benchmark',0,0,0,?,?)`)
      .run(merchant.id, first.lastInsertRowid, second.lastInsertRowid, now, now);

    const raw = account.getStatementByMerchantSlot(merchant.id, 1)!;
    expect(raw.totalVolume).toBe(53291.02);
    expect(raw.analysisSummary.parserDecision?.reportable).toBe(false);
    const publicRow = projection.customerStatementSummaryPayload(raw);
    expect(publicRow).toMatchObject({ analysisStatus: "failed", totalVolume: null,
      totalFees: null, effectiveRate: null, benchmarkVerdict: null });
    expect(JSON.stringify(publicRow)).not.toContain("53291.02");
    expect(JSON.stringify(publicRow)).not.toContain("1188.12");
    expect(account.getAuthorizedStatementsForMerchant(merchant.id).map((statement) => statement.slot)).toEqual([2]);
    expect(account.getComparisonForMerchant(merchant.id)).toBeNull();
    expect(() => aggregate.buildAggregateAudit([raw])).toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    expect(() => account.createOrReplaceComparison(merchant.id)).toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    expect(() => account.persistStatementFromSummary({ merchantId: merchant.id, slot: 1,
      summary: denied })).toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    expect(() => account.claimStatementOneJob({ merchantId: merchant.id,
      job: { id: "new-job", status: "completed", summary: accepted } as Job })).toThrow("already saved");
    expect(account.getStatementByMerchantSlot(merchant.id, 1)?.totalVolume).toBe(53291.02);

    const historicalJob = { status: "completed", summary: denied } as Job;
    expect(projection.customerJobStatus(historicalJob)).toBe("failed");
    expect(projection.customerJobError(historicalJob)).toContain("could not verify");
  });
});

describe("production worker nonreportable decision", () => {
  let dbModule: typeof import("../src/db.js");
  beforeEach(() => { vi.resetModules(); process.env.FEECLEAR_DB_PATH = ":memory:";
    delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; });
  afterEach(() => { dbModule?.db.close(); delete process.env.FEECLEAR_DB_PATH; vi.restoreAllMocks(); });

  it("retains the November parser observation and canonical run but never completes or saves it", async () => {
    const [account, store, worker, loadedDb, runStore] = await Promise.all([
      import("../src/accountStore.js"), import("../src/store.js"), import("../src/worker.js"),
      import("../src/db.js"), import("../src/canonical/v2/runtime/analysisRunStore.js"),
    ]);
    dbModule = loadedDb;
    const merchant = account.createMerchantAccount({ email: "worker-authority@example.com", firstName: "Test",
      lastName: "Merchant", passwordHash: "hash", businessType: "retail" });
    const job = store.createJob({ fileName: "Nov_2024_Statement.pdf",
      filePath: path.resolve(process.cwd(), "test/fixtures/pdfs/Nov_2024_Statement.pdf"),
      fileType: "pdf", businessType: "retail", merchantId: merchant.id,
      statementSlot: 1, detectedStatementPeriod: "2024-11", maxAttempts: 1 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.processJob(job.id);
    const stored = store.getJob(job.id)!;
    expect(stored.status).toBe("failed");
    expect(stored.summary?.parserDecision?.reportable).toBe(false);
    expect(stored.summary?.totalVolume).toBe(53291.02);
    expect(account.getStatementsForMerchant(merchant.id)).toEqual([]);
    expect(account.getComparisonForMerchant(merchant.id)).toBeNull();
    expect(runStore.getPersistedAnalysisRunForJob(job.id)).not.toBeNull();
    const [{ buildSingleStatementCustomerReport }, { buildSingleStatementReportV1 }] = await Promise.all([
      import("../src/reporting/index.js"), import("../src/reporting/v1/index.js"),
    ]);
    const customer = buildSingleStatementCustomerReport({ kind: "single_statement_result",
      analysis: stored.summary! });
    expect(customer.buildState).toBe("blocked");
    expect(customer.metrics).toEqual([]);
    expect(customer.savings.annualAmount).toBe(0);
    expect(JSON.stringify(customer)).not.toMatch(/53291\.02|1330\.96|1188\.12/);
    const reportV1 = buildSingleStatementReportV1({ analysis: stored.summary!,
      reportId: "authority-november", generatedAt: "2026-09-25T00:00:00.000Z" });
    expect(reportV1.reportState).toMatchObject({ code: "unable_to_analyze",
      reasons: expect.arrayContaining(["parser_blocked"]) });
    expect(JSON.stringify(reportV1)).not.toMatch(/53291\.02|1330\.96|1188\.12/);
  }, 30_000);
});
