import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AccountStoreModule = typeof import("../src/accountStore.js");
type DbModule = typeof import("../src/db.js");

function makeSummary(
  period = "2024-10",
  overrides: {
    totalVolume?: number;
    processorMarkupAmount?: number;
    processorMarkupBps?: number | null;
    cardNetworkFees?: number;
  } = {},
) {
  const totalVolume = overrides.totalVolume ?? 1000;
  const processorMarkupAmount = overrides.processorMarkupAmount ?? 15;
  const cardNetworkFees = overrides.cardNetworkFees ?? 10;
  const totalFees = processorMarkupAmount + cardNetworkFees;
  const processorMarkupBps = overrides.processorMarkupBps ?? null;
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
    processorMarkupAudit: {
      rows:
        processorMarkupBps === null
          ? []
          : [
              {
                label: "Visa Credit",
                cardBrand: "Visa" as const,
                transactionCount: 100,
                volume: totalVolume,
                ratePercent: processorMarkupBps / 100,
                rateBps: processorMarkupBps,
                effectiveRateBps: processorMarkupBps,
                perItemFee: null,
                totalPaid: processorMarkupAmount,
                expectedTotalPaid: processorMarkupAmount,
                sourceSection: "Blended fee presentation",
                evidenceLine: "Test processor markup row",
                rowIndex: 1,
                confidence: 0.82,
              },
            ],
      rowCount: processorMarkupBps === null ? 0 : 1,
      transactionCount: processorMarkupBps === null ? null : 100,
      volume: processorMarkupBps === null ? null : totalVolume,
      totalPaid: processorMarkupBps === null ? null : processorMarkupAmount,
      weightedAverageRateBps: processorMarkupBps,
      effectiveRateBps: processorMarkupBps,
      confidence: processorMarkupBps === null ? 0 : 0.82,
    },
    kpis: [],
    feeBreakdown: [
      {
        label: "Processor Fees",
        amount: processorMarkupAmount,
        sharePct: 60,
        feeClass: "processor_markup" as const,
        broadType: "Processor" as const,
        classificationConfidence: "high" as const,
        classificationRule: "E018",
        classificationReason: "Test classified processor fee.",
      },
      {
        label: "Card Brand / Network Fees",
        amount: cardNetworkFees,
        sharePct: 40,
        feeClass: "card_brand_pass_through" as const,
        broadType: "Pass-through" as const,
        classificationConfidence: "high" as const,
        classificationRule: "E017",
        classificationReason: "Test classified pass-through fee.",
      },
    ],
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
    expect(inserted.processorMarkup).toBe(15);
    expect(inserted.processorMarkupBps).toBeNull();
    expect(inserted.cardNetworkFees).toBe(10);

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

  it("persists normalized processor markup bps and compares markup pricing separately from dollars", () => {
    const merchant = accountStore.createMerchantAccount({
      email: "markup-bps@example.com",
      firstName: "Markup",
      lastName: "Monitor",
      passwordHash: "hash",
      businessType: "retail",
    });

    const first = accountStore.persistStatementFromSummary({
      merchantId: merchant.id,
      slot: 1,
      summary: makeSummary("2024-10", {
        totalVolume: 10000,
        processorMarkupAmount: 80,
        processorMarkupBps: 80,
        cardNetworkFees: 120,
      }),
      sourceJobId: "job-1",
    });
    const second = accountStore.persistStatementFromSummary({
      merchantId: merchant.id,
      slot: 2,
      summary: makeSummary("2024-11", {
        totalVolume: 20000,
        processorMarkupAmount: 120,
        processorMarkupBps: 60,
        cardNetworkFees: 240,
      }),
      sourceJobId: "job-2",
    });

    const comparison = accountStore.createOrReplaceComparison(merchant.id);
    const refreshedMerchant = accountStore.getMerchantById(merchant.id);

    expect(first.processorMarkup).toBe(80);
    expect(first.processorMarkupBps).toBe(80);
    expect(second.processorMarkup).toBe(120);
    expect(second.processorMarkupBps).toBe(60);
    expect(comparison.processorMarkupDelta).toBe(40);
    expect(comparison.processorMarkupBpsDelta).toBe(-20);
    expect(refreshedMerchant?.statement2ProcessorMarkupBps).toBe(60);
    expect(refreshedMerchant?.comparisonProcessorMarkupBpsDelta).toBe(-20);
  });
});
