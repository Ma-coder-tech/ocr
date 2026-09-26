import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = (name: string) => path.resolve(process.cwd(), "test/fixtures/pdfs", name);
const flag = "RATEREVEAL_PHASE2_FEE_CHARGE_V1_ENABLED";
const previousFlag = process.env[flag];

describe("new-upload Phase 2 fee result", () => {
  let dbModule: typeof import("../src/db.js");
  beforeEach(() => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    process.env[flag] = "true";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    dbModule?.db.close();
    delete process.env.FEECLEAR_DB_PATH;
    if (previousFlag === undefined) delete process.env[flag]; else process.env[flag] = previousFlag;
    vi.restoreAllMocks();
  });

  it("emits one audited fee fact for November without completing or saving broad analysis", async () => {
    const [account, store, worker, projection, fee, loadedDb, report, reportV1, comparison, aggregate] =
      await Promise.all([
        import("../src/accountStore.js"), import("../src/store.js"), import("../src/worker.js"),
        import("../src/customerFinancialProjection.js"), import("../src/phase2FeeFact.js"),
        import("../src/db.js"), import("../src/reporting/index.js"),
        import("../src/reporting/v1/index.js"), import("../src/multiStatementComparisonInput.js"),
        import("../src/aggregateAudit.js"),
      ]);
    dbModule = loadedDb;
    const merchant = account.createMerchantAccount({ email: "phase2-nov@example.com",
      firstName: "Fee", lastName: "Fact", passwordHash: "hash", businessType: "retail" });
    const job = store.createJob({ fileName: "Nov_2024_Statement.pdf",
      filePath: fixture("Nov_2024_Statement.pdf"), fileType: "pdf", businessType: "retail",
      merchantId: merchant.id, statementSlot: 1, detectedStatementPeriod: "2024-11", maxAttempts: 1 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.processJob(job.id);
    const stored = store.getJob(job.id)!;
    expect(stored.status).toBe("fee_fact_available");
    expect(store.hasReplayablePhase2FeeAuditForFile(job.filePath)).toBe(true);
    expect(stored.summary?.parserDecision?.reportable).toBe(false);
    expect(stored.phase2FeeAudit).toMatchObject({ decision: "eligible",
      permissionVersion: "phase2_printed_fee_charge_permission_v1",
      candidate: { amount: { sourceDebitMinor: -133096,
        displayChargeMagnitudeMinor: 133096 }, proof: { proofId: expect.stringMatching(/^neutral-proof-v2:/),
        factEvidenceRefs: expect.any(Array), controlRefs: expect.arrayContaining([
          "fee_component_sum", "fee_summary_alignment"]) } } });
    expect(projection.customerJobStatus(stored)).toBe("fee_fact_available");
    expect(fee.publicPhase2FeeFact(stored.phase2FeeAudit)?.displayChargeMagnitudeMinor).toBe(133096);
    expect(account.getStatementsForMerchant(merchant.id)).toEqual([]);
    expect(account.getComparisonForMerchant(merchant.id)).toBeNull();
    expect(projection.customerStatementSummaryPayload({ id: 99, slot: 1, periodKey: "2024-11",
      statementPeriod: "November 2024", businessType: "retail", sourceJobId: "historical-only",
      analysisSummary: stored.summary!, createdAt: "2024-11-30", updatedAt: "2024-11-30" } as never))
      .toMatchObject({ analysisStatus: "failed", totalVolume: null, totalFees: null,
        effectiveRate: null, benchmarkVerdict: null });
    expect(report.buildSingleStatementCustomerReport({ kind: "single_statement_result",
      analysis: stored.summary! }).metrics).toEqual([]);
    expect(reportV1.buildSingleStatementReportV1({ analysis: stored.summary!,
      reportId: "phase2-nov", generatedAt: "2026-09-26T00:00:00.000Z" })
      .reportState.code).toBe("unable_to_analyze");
    expect(() => comparison.buildComparisonStatementInput(stored.summary!))
      .toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    expect(() => aggregate.buildAggregateAudit([{ analysisSummary: stored.summary! }] as never))
      .toThrow("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
    process.env[flag] = "false";
    expect(projection.customerJobStatus(stored)).toBe("failed");
    expect(fee.publicPhase2FeeFact(stored.phase2FeeAudit)).toBeNull();
    expect(store.hasReplayablePhase2FeeAuditForFile(job.filePath)).toBe(true);
    process.env[flag] = "true";
    expect(projection.customerJobStatus(store.getJob(job.id)!)).toBe("fee_fact_available");
  }, 30_000);

  it("keeps a reportable Sample analysis complete while carrying a separate fee fact", async () => {
    const [store, worker, projection, fee, loadedDb] = await Promise.all([
      import("../src/store.js"), import("../src/worker.js"),
      import("../src/customerFinancialProjection.js"), import("../src/phase2FeeFact.js"),
      import("../src/db.js"),
    ]);
    dbModule = loadedDb;
    const job = store.createJob({ fileName: "SAMPLE_MERCHANT4_CLOVER.pdf",
      filePath: fixture("SAMPLE_MERCHANT4_CLOVER.pdf"), fileType: "pdf", businessType: "retail",
      maxAttempts: 1 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.processJob(job.id);
    const stored = store.getJob(job.id)!;
    expect(stored.status).toBe("completed");
    expect(store.hasReplayablePhase2FeeAuditForFile(job.filePath)).toBe(true);
    expect(stored.summary?.parserDecision?.reportable).toBe(true);
    expect(stored.phase2FeeAudit?.decision).toBe("eligible");
    expect(projection.customerJobStatus(stored)).toBe("completed");
    expect(fee.publicPhase2FeeFact(stored.phase2FeeAudit)?.displayChargeMagnitudeMinor).toBe(131255);
    process.env[flag] = "false";
    expect(projection.customerJobStatus(stored)).toBe("completed");
    expect(fee.publicPhase2FeeFact(stored.phase2FeeAudit)).toBeNull();
  }, 30_000);
});
