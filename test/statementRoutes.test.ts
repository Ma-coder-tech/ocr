import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AccountStoreModule = typeof import("../src/accountStore.js");
type AuthModule = typeof import("../src/auth.js");
type DbModule = typeof import("../src/db.js");
type StoreModule = typeof import("../src/store.js");

function makeSummary(period = "2024-10", totalVolume = 1000) {
  const totalFees = 25;
  return {
    businessType: "retail" as const,
    processorName: "Test Processor",
    sourceType: "pdf" as const,
    statementPeriod: period,
    executiveSummary: "Test summary",
    totalVolume,
    totalFees,
    effectiveRate: Number(((totalFees / totalVolume) * 100).toFixed(2)),
    estimatedMonthlyVolume: totalVolume,
    estimatedMonthlyFees: totalFees,
    estimatedAnnualFees: totalFees * 12,
    estimatedAnnualSavings: 0,
    benchmark: {
      segment: "Retail benchmark",
      lowerRate: 1.8,
      upperRate: 3.2,
      status: "within" as const,
      deltaFromUpperRate: 0,
    },
    statementSections: [],
    interchangeAudit: {
      rows: [],
      rowCount: 0,
      transactionCount: null,
      volume: null,
      totalPaid: null,
      weightedAverageRateBps: null,
      totalVariance: null,
      confidence: 0,
    },
    interchangeAuditRows: [],
    blendedFeeSplits: [],
    structuredFeeFindings: [],
    processorMarkupAudit: {
      rows: [],
      rowCount: 0,
      transactionCount: null,
      volume: null,
      totalPaid: null,
      weightedAverageRateBps: null,
      effectiveRateBps: null,
      confidence: 0,
    },
    hiddenMarkupAudit: {
      rows: [],
      rowCount: 0,
      matchedRowCount: 0,
      flaggedRowCount: 0,
      hiddenMarkupUsd: null,
      hiddenMarkupBps: null,
      status: "not_applicable" as const,
      confidence: 0,
    },
    bundledPricing: {
      active: false,
      buckets: [],
      highestRatePercent: null,
      totalVolumeUsd: null,
      totalFeesUsd: null,
      confidence: 0,
    },
    noticeFindings: [],
    downgradeAnalysis: {
      rows: [],
      affectedVolumeUsd: null,
      estimatedPenaltyLowUsd: null,
      estimatedPenaltyHighUsd: null,
      confidence: 0,
    },
    perItemFeeModel: {
      transactionFee: null,
      authorizationFee: null,
      allInPerItemFee: null,
      components: [],
      confidence: 0,
    },
    guideMeasures: {
      monthlyMinimum: null,
      expressFundingPremium: null,
      savingsShareAdjustment: null,
    },
    level3Optimization: {
      eligible: false,
      confidence: 0,
      eligibleVolumeUsd: null,
      rateDeltaBps: null,
      requiredFields: ["invoice_number", "product_code", "quantity", "item_description", "commodity_code"],
      capturedFields: [],
      missingFields: [],
      detectedSignals: [],
      estimatedMonthlySavingsUsd: null,
      estimatedAnnualSavingsUsd: null,
      evidence: [],
    },
    kpis: [],
    feeBreakdown: [],
    suspiciousFees: [],
    savingsOpportunities: [],
    negotiationChecklist: [],
    actionPlan: [],
    trend: [],
    dataQuality: [],
    dynamicFields: [],
    insights: [],
    confidence: "medium" as const,
  };
}

describe("statement dashboard routes", () => {
  let accountStore: AccountStoreModule;
  let auth: AuthModule;
  let dbModule: DbModule;
  let store: StoreModule;
  let app: (req: IncomingMessage, res: ServerResponse) => void;
  let cookie: string;
  let merchantId: number;
  let previousEnv: {
    FEECLEAR_DB_PATH: string | undefined;
    VERCEL: string | undefined;
    NODE_ENV: string | undefined;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../src/worker.js", () => ({
      enqueueJob: vi.fn(),
      hydrateQueuedJobs: vi.fn(),
    }));
    previousEnv = {
      FEECLEAR_DB_PATH: process.env.FEECLEAR_DB_PATH,
      VERCEL: process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
    };
    process.env.FEECLEAR_DB_PATH = ":memory:";
    process.env.VERCEL = "1";
    process.env.NODE_ENV = "test";

    accountStore = await import("../src/accountStore.js");
    auth = await import("../src/auth.js");
    store = await import("../src/store.js");
    dbModule = await import("../src/db.js");
    app = (await import("../src/server.js")).default;

    const merchant = accountStore.createMerchantAccount({
      email: "routes@example.com",
      firstName: "Route",
      lastName: "Tester",
      passwordHash: "hash",
      businessType: "retail",
    });
    merchantId = merchant.id;
    const token = "test-session-token";
    accountStore.createSessionRecord(merchant.id, auth.hashSessionToken(token), auth.sessionExpiryIso());
    cookie = `feeclear_session=${encodeURIComponent(token)}`;
    accountStore.persistStatementFromSummary({
      merchantId,
      summary: makeSummary("2024-10"),
      sourceJobId: "seed-job",
    });
  });

  afterEach(() => {
    dbModule.db.close();
    vi.doUnmock("../src/worker.js");
    if (previousEnv.FEECLEAR_DB_PATH === undefined) delete process.env.FEECLEAR_DB_PATH;
    else process.env.FEECLEAR_DB_PATH = previousEnv.FEECLEAR_DB_PATH;
    if (previousEnv.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousEnv.VERCEL;
    if (previousEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv.NODE_ENV;
  });

  async function api(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string; parseJson?: boolean } = {},
  ) {
    const body = init.body ?? "";
    const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
      method: init.method ?? "GET",
      url: path,
      headers: {
        cookie,
        ...(body ? { "content-length": String(Buffer.byteLength(body)) } : {}),
        ...(init.headers ?? {}),
      },
      socket: { remoteAddress: "127.0.0.1" },
    }) as unknown as IncomingMessage;

    const headers = new Map<string, string>();
    const response = await new Promise<{ status: number; headers: Map<string, string>; body: string }>((resolve) => {
      const res = {
        statusCode: 200,
        setHeader(name: string, value: number | string | readonly string[]) {
          headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
        },
        getHeader(name: string) {
          return headers.get(name.toLowerCase());
        },
        end(payload?: string | Buffer) {
          resolve({
            status: this.statusCode,
            headers,
            body: Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload ?? ""),
          });
        },
      } as unknown as ServerResponse;
      app(req, res);
    });

    const shouldParseJson = init.parseJson ?? true;
    const payload = shouldParseJson && response.body ? JSON.parse(response.body) : null;
    return { response, payload };
  }

  function createUpload(periodKey: string | null) {
    return accountStore.createStatementUpload({
      merchantId,
      fileName: "statement.pdf",
      filePath: "/tmp/statement.pdf",
      fileSize: 1024,
      detectedStatementPeriod: periodKey,
      validationStatus: "ready",
      validationError: null,
    });
  }

  function fillStatementLibrary(): void {
    for (let month = 11; month <= 12; month += 1) {
      accountStore.persistStatementFromSummary({
        merchantId,
        summary: makeSummary(`2024-${month}`),
        sourceJobId: `seed-job-${month}`,
      });
    }
    for (let month = 1; month <= 9; month += 1) {
      accountStore.persistStatementFromSummary({
        merchantId,
        summary: makeSummary(`2025-0${month}`),
        sourceJobId: `seed-job-2025-${month}`,
      });
    }
  }

  it("returns statement library metadata", async () => {
    const { response, payload } = await api("/api/dashboard/statements");

    expect(response.status).toBe(200);
    expect(payload.merchant.statementCount).toBe(1);
    expect(payload.merchant.statementLimit).toBe(12);
    expect(payload.merchant.freeStatementsRemaining).toBe(11);
    expect(payload.statements).toHaveLength(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.statements[0].periodKey).toBe("2024-10");
  });

  it("returns aggregate audit data for the saved statement library", async () => {
    accountStore.persistStatementFromSummary({
      merchantId,
      summary: makeSummary("2024-11", 1500),
      sourceJobId: "aggregate-job-2",
    });

    const { response, payload } = await api("/api/dashboard/audit");

    expect(response.status).toBe(200);
    expect(payload.merchant.statementCount).toBe(2);
    expect(payload.audit.statementCount).toBe(2);
    expect(payload.audit.trends.effective_rate.observedPointCount).toBe(2);
    expect(payload.audit.coverage.requestedStatementLimit).toBe(12);
    expect(payload.audit.bestMonth).toBeTruthy();
    expect(payload.audit.worstMonth).toBeTruthy();
  });

  it("keeps completed statements usable when a later statement job fails", async () => {
    ["2024-11", "2024-12", "2025-01"].forEach((period, index) => {
      accountStore.persistStatementFromSummary({
        merchantId,
        summary: makeSummary(period),
        sourceJobId: `completed-${index + 2}`,
      });
    });
    const failedJob = store.createJob({
      uploadId: "failed-upload",
      fileName: "bad-statement.pdf",
      filePath: "/tmp/bad-statement.pdf",
      fileType: "pdf",
      businessType: "retail",
      merchantId,
      statementSlot: 5,
      detectedStatementPeriod: "2025-02",
    });
    store.failJob(failedJob.id, "Could not extract fee totals.");

    const { response, payload } = await api("/api/dashboard/statements");

    expect(response.status).toBe(200);
    expect(payload.statements).toHaveLength(4);
    expect(payload.items).toHaveLength(5);
    expect(payload.items.slice(0, 4).map((item: { analysisStatus: string }) => item.analysisStatus)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
    const failedItem = payload.items.find((item: { jobId?: string }) => item.jobId === failedJob.id);
    expect(failedItem).toMatchObject({
      slot: 5,
      periodKey: "2025-02",
      analysisStatus: "failed",
      error: "Could not extract fee totals.",
    });
  });

  it("hides stale failed attempts after a later successful statement for the same slot and month", async () => {
    const failedJob = store.createJob({
      uploadId: "stale-failed-upload",
      fileName: "failed.pdf",
      filePath: "/tmp/failed.pdf",
      fileType: "pdf",
      businessType: "retail",
      merchantId,
      statementSlot: 2,
      detectedStatementPeriod: "2024-11",
    });
    store.failJob(failedJob.id, "Temporary failure.");
    const completed = accountStore.persistStatementFromSummary({
      merchantId,
      slot: 2,
      summary: makeSummary("2024-11"),
      sourceJobId: "successful-retry-job",
    });

    const { payload } = await api("/api/dashboard/statements");

    expect(payload.statements).toHaveLength(2);
    expect(payload.items).toHaveLength(2);
    expect(payload.items.find((item: { jobId?: string }) => item.jobId === failedJob.id)).toBeUndefined();
    expect(payload.items.find((item: { id?: number }) => item.id === completed.id)).toMatchObject({
      analysisStatus: "completed",
      periodKey: "2024-11",
    });
  });

  it("keeps a failed replacement attempt visible beside the still-usable saved statement", async () => {
    const existing = accountStore.getStatementByMerchantPeriodKey(merchantId, "2024-10")!;
    const failedJob = store.createJob({
      uploadId: "failed-replacement-upload",
      fileName: "replacement.pdf",
      filePath: "/tmp/replacement.pdf",
      fileType: "pdf",
      businessType: "retail",
      merchantId,
      statementSlot: existing.slot,
      replaceStatementId: existing.id,
      detectedStatementPeriod: existing.periodKey,
    });
    store.failJob(failedJob.id, "Replacement file could not be analyzed.");

    const { payload } = await api("/api/dashboard/statements");

    expect(payload.statements).toHaveLength(1);
    expect(payload.items).toHaveLength(2);
    expect(payload.items.find((item: { id?: number }) => item.id === existing.id)).toMatchObject({
      analysisStatus: "completed",
      periodKey: "2024-10",
    });
    expect(payload.items.find((item: { jobId?: string }) => item.jobId === failedJob.id)).toMatchObject({
      analysisStatus: "failed",
      error: "Replacement file could not be analyzed.",
    });
  });

  it("requires confirmedPeriodKey when a validated upload has no detected period", async () => {
    const upload = createUpload(null);

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id }),
    });

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Choose the statement month");
  });

  it("creates a job with a confirmed period for unknown-period uploads", async () => {
    const upload = createUpload(null);

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, confirmedPeriodKey: "2024-11" }),
    });

    expect(response.status).toBe(201);
    expect(payload.redirectTo).toMatch(/^\/dashboard\/statements\/analyze\?job=/);
    const job = store.getJob(payload.jobId);
    expect(job?.statementSlot).toBe(2);
    expect(job?.uploadId).toBe(upload.id);
    expect(job?.detectedStatementPeriod).toBe("2024-11");
  });

  it("returns the existing job when the same validated upload is started twice", async () => {
    const upload = createUpload("2024-11");

    const first = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id }),
    });
    const second = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id }),
    });

    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(200);
    expect(second.payload.jobId).toBe(first.payload.jobId);
    expect(second.payload.idempotent).toBe(true);
    const row = dbModule.db
      .prepare(`SELECT COUNT(*) AS count FROM analysis_jobs WHERE upload_id = ?`)
      .get(upload.id) as { count: number };
    expect(row.count).toBe(1);
  });

  it("retries a failed statement job without creating a duplicate statement", async () => {
    const failedJob = store.createJob({
      uploadId: "retry-upload",
      fileName: "retry.pdf",
      filePath: "/tmp/retry.pdf",
      fileType: "pdf",
      businessType: "retail",
      merchantId,
      statementSlot: 2,
      detectedStatementPeriod: "2024-11",
      maxAttempts: 1,
    });
    store.startJobAttempt(failedJob.id);
    store.failJob(failedJob.id, "Temporary analysis failure.");

    const { response, payload } = await api(`/api/dashboard/jobs/${encodeURIComponent(failedJob.id)}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(payload.jobId).toBe(failedJob.id);
    expect(accountStore.getStatementsForMerchant(merchantId)).toHaveLength(1);
    const requeued = store.getJob(failedJob.id);
    expect(requeued?.status).toBe("queued");
    expect(requeued?.attemptCount).toBe(1);
    expect(requeued?.maxAttempts).toBe(2);
  });

  it("rejects invalid confirmed periods", async () => {
    const upload = createUpload(null);

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, confirmedPeriodKey: "2024-13" }),
    });

    expect(response.status).toBe(400);
    expect(payload.error).toContain("YYYY-MM");
  });

  it("rejects duplicate confirmed periods", async () => {
    const upload = createUpload(null);

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, confirmedPeriodKey: "2024-10" }),
    });

    expect(response.status).toBe(409);
    expect(payload.existingStatement.periodKey).toBe("2024-10");
  });

  it("rejects invalid replacement ids", async () => {
    const upload = createUpload("2024-11");

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, replaceStatementId: "not-a-number" }),
    });

    expect(response.status).toBe(400);
    expect(payload.error).toContain("positive integer");
  });

  it("allows replacement when the merchant already has twelve statements", async () => {
    fillStatementLibrary();

    expect(accountStore.getStatementsForMerchant(merchantId)).toHaveLength(12);
    const target = accountStore.getStatementByMerchantPeriodKey(merchantId, "2025-09")!;
    const upload = createUpload("2025-09");

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, replaceStatementId: target.id }),
    });

    expect(response.status).toBe(201);
    const job = store.getJob(payload.jobId);
    expect(job?.statementSlot).toBe(target.slot);
    expect(job?.detectedStatementPeriod).toBe("2025-09");
  });

  it("rejects replacement when the uploaded period does not match the selected saved statement", async () => {
    const target = accountStore.getStatementByMerchantPeriodKey(merchantId, "2024-10")!;
    const upload = createUpload("2024-11");

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id, replaceStatementId: target.id }),
    });

    expect(response.status).toBe(409);
    expect(payload.error).toContain("replacement file is for November 2024");
    expect(payload.existingStatement.periodKey).toBe("2024-10");
    const row = dbModule.db.prepare(`SELECT COUNT(*) AS count FROM analysis_jobs`).get() as { count: number };
    expect(row.count).toBe(0);
  });

  it("blocks new statements when the merchant already has twelve statements", async () => {
    fillStatementLibrary();
    const upload = createUpload("2025-10");

    const { response, payload } = await api("/api/dashboard/statements/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploadId: upload.id }),
    });

    expect(response.status).toBe(403);
    expect(payload.error).toContain("up to 12 completed statements");
  });

  it("serves the generic upload page and redirects the legacy upload page", async () => {
    const uploadPage = await api("/dashboard/statements/upload", { parseJson: false });

    expect(uploadPage.response.status).toBe(200);
    expect(uploadPage.response.body).toContain("<title>Upload statement</title>");
    expect(uploadPage.response.body).toContain("/api/dashboard/statements/upload-context");

    const legacy = await api("/dashboard/upload-second");
    expect(legacy.response.status).toBe(302);
    expect(legacy.response.headers.get("location")).toBe("/dashboard/statements/upload");
  });

  it("serves the generic analyze page and redirects the legacy analyze page with the job query", async () => {
    const job = store.createJob({
      fileName: "statement.pdf",
      filePath: "/tmp/statement.pdf",
      fileType: "pdf",
      businessType: "retail",
      merchantId,
      statementSlot: 2,
      detectedStatementPeriod: "2024-11",
    });

    const analyzePage = await api(`/dashboard/statements/analyze?job=${encodeURIComponent(job.id)}`, { parseJson: false });
    expect(analyzePage.response.status).toBe(200);
    expect(analyzePage.response.body).toContain("<title>Analyzing statement</title>");
    expect(analyzePage.response.body).toContain("/api/dashboard/statements/upload-context");

    const legacy = await api(`/dashboard/analyze-second?job=${encodeURIComponent(job.id)}`);
    expect(legacy.response.status).toBe(302);
    expect(legacy.response.headers.get("location")).toBe(`/dashboard/statements/analyze?job=${encodeURIComponent(job.id)}`);
  });
});
