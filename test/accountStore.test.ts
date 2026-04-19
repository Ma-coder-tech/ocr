import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AccountStoreModule = typeof import("../src/accountStore.js");
type DbModule = typeof import("../src/db.js");

function makeSummary(period = "2024-10") {
  return {
    businessType: "retail" as const,
    processorName: "Test Processor",
    sourceType: "pdf" as const,
    statementPeriod: period,
    executiveSummary: "Test summary",
    totalVolume: 1000,
    totalFees: 25,
    effectiveRate: 2.5,
    estimatedMonthlyVolume: 1000,
    estimatedMonthlyFees: 25,
    estimatedAnnualFees: 300,
    estimatedAnnualSavings: 0,
    benchmark: {
      segment: "Retail benchmark",
      lowerRate: 1.8,
      upperRate: 3.2,
      status: "within" as const,
      deltaFromUpperRate: 0,
    },
    kpis: [],
    feeBreakdown: [{ label: "Processor Fees", amount: 25, sharePct: 100 }],
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

describe("accountStore", () => {
  let accountStore: AccountStoreModule;
  let dbModule: DbModule;

  beforeEach(async () => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    accountStore = await import("../src/accountStore.js");
    dbModule = await import("../src/db.js");
  });

  afterEach(() => {
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
  });

  it("creates merchants and sessions and cleans up expired sessions", () => {
    const merchant = accountStore.createMerchantAccount({
      email: "merchant@example.com",
      firstName: "Test",
      lastName: "Merchant",
      passwordHash: "hash",
      businessType: "retail",
    });

    expect(accountStore.getMerchantByEmail("merchant@example.com")?.id).toBe(merchant.id);

    const expired = accountStore.createSessionRecord(merchant.id, "expired-token", "2000-01-01T00:00:00.000Z");
    const active = accountStore.createSessionRecord(merchant.id, "active-token", "2999-01-01T00:00:00.000Z");

    expect(accountStore.getSessionRecord(expired.tokenHash)?.tokenHash).toBe("expired-token");
    expect(accountStore.getSessionRecord(active.tokenHash)?.tokenHash).toBe("active-token");

    accountStore.deleteExpiredSessions();

    expect(accountStore.getSessionRecord(expired.tokenHash)).toBeNull();
    expect(accountStore.getSessionRecord(active.tokenHash)?.tokenHash).toBe("active-token");
  });

  it("persists statement summaries through insert and update paths", () => {
    const merchant = accountStore.createMerchantAccount({
      email: "statement@example.com",
      firstName: "Statement",
      lastName: "Owner",
      passwordHash: "hash",
      businessType: "retail",
    });

    const inserted = accountStore.persistStatementFromSummary({
      merchantId: merchant.id,
      slot: 1,
      summary: makeSummary("2024-10"),
      sourceJobId: "job-1",
    });

    expect(inserted.statementPeriod).toBe("October 2024");
    expect(inserted.totalFees).toBe(25);

    const updated = accountStore.persistStatementFromSummary({
      merchantId: merchant.id,
      slot: 1,
      summary: {
        ...makeSummary("2024-11"),
        totalFees: 30,
        estimatedMonthlyFees: 30,
        estimatedAnnualFees: 360,
      },
      sourceJobId: "job-2",
    });

    expect(updated.id).toBe(inserted.id);
    expect(updated.statementPeriod).toBe("November 2024");
    expect(updated.totalFees).toBe(30);
    expect(updated.sourceJobId).toBe("job-2");
  });
});
