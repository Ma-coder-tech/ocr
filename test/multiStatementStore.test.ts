import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import type { MultiStatementAnalysis } from "../src/multiStatementComparisonEngine.js";
import type { MultiStatementGlobalReport } from "../src/reporting/buildMultiStatement.js";

type AccountStoreModule = typeof import("../src/accountStore.js");
type DbModule = typeof import("../src/db.js");
type MultiStatementStoreModule = typeof import("../src/multiStatementStore.js");

function comparisonInput(period: string): ComparisonStatementInput {
  return {
    statementPeriod: period,
    sourceAnalysisId: `source-${period}`,
    pipelineVersion: "test-pipeline",
    merchant: {
      id: null,
      merchantNumber: "123",
      merchantName: "Test Restaurant",
      isoName: "Clover / First Data",
      processorPlatform: "fiserv_first_data",
      address: null,
      merchantCategory: "restaurant_food_beverage",
      merchantCategoryConfidence: "high",
      merchantChannel: "card_present",
    },
    financials: {
      totalVolume: 1000,
      totalFees: 25,
      effectiveRate: 0.025,
      rateUnit: "decimal",
      totalTransactions: 100,
      averageTicket: 10,
    },
    pricingModel: { model: "interchange_plus", confidence: "high" },
    processorControlledTotal: 10,
    processorControlledPct: 0.01,
    benchmark: {
      status: "within",
      segment: "Restaurant / Food Service",
      categoryLabel: "Restaurant / Food Service",
      lowerRate: 0.0195,
      upperRate: 0.0245,
      effectiveRate: 0.025,
      annualVolume: 12000,
      estimatedAnnualOverpayment: null,
      message: "Within benchmark.",
    },
    estimatedAnnualSavings: { conservative: 10, estimated: 20, maximum: 30 },
    fees: [],
    notices: [],
    findings: [],
    disputes: {
      chargebacks: 0,
      chargebackFees: 0,
      achRejects: 0,
      achRejectFees: 0,
      totalDisputeCost: 0,
    },
    operationalMetrics: {
      grossSales: null,
      refunds: null,
      refundCount: null,
      refundPctOfGrossSales: null,
      cardMix: [],
      priorPeriodAdjustments: [],
      inactivePeriod: false,
      fixedFeesChargedWithNoVolume: null,
    },
    parserDecision: null,
    dataQuality: [],
  };
}

function analysis(): MultiStatementAnalysis {
  return {
    merchant: {
      id: "",
      merchantNumber: "123",
      merchantName: "Test Restaurant",
      isoName: "Clover / First Data",
      processorPlatform: "fiserv_first_data",
      address: "",
      merchantCategory: "restaurant_food_beverage",
      merchantCategoryConfidence: "high",
      merchantChannel: "card_present",
    },
    metadata: {
      totalStatementsAnalyzed: 2,
      dateRange: { start: "2024-11", end: "2024-12" },
      includedPeriods: ["2024-11", "2024-12"],
      missingPeriods: [],
      analysisTimestamp: "2026-07-12T00:00:00.000Z",
      pipelineVersion: "test",
    },
    statementResults: [],
    effectiveRateTrend: {
      periods: [],
      direction: "stable",
      lowestRate: { period: "2024-12", rate: 0.0248 },
      highestRate: { period: "2024-11", rate: 0.025 },
      averageRate: 0.0249,
      rateChange: -0.0002,
      rateChangeExplanation: null,
    },
    feeComparison: [],
    newFees: [],
    rateChanges: [],
    noticeTracking: [],
    processorMarkupTrend: { periods: [], direction: "stable", finding: null },
    volumeTrend: {
      periods: [],
      direction: "stable",
      totalVolumeAllPeriods: 2000,
      averageMonthlyVolume: 1000,
      averageMonthlyTransactions: 100,
    },
    disputeTrend: { periods: [], direction: "none", totalDisputeCostsAllPeriods: 0, finding: null },
    operationalTrend: {
      inactivePeriods: [],
      refundTrend: { periods: [], direction: "stable", finding: null },
      cardMixShifts: [],
      interchangeQualificationTrend: { applicable: false, finding: null },
      priorPeriodAdjustments: [],
    },
    pricingModelConsistency: { consistent: true, models: [], finding: null },
    cumulativeSavings: {
      totalPeriodsCovered: 2,
      dateRange: "2024-11 - 2024-12",
      alreadyOverpaid: { conservative: 10, estimated: 20, maximum: 30 },
      projectedAnnualIfUnchanged: { conservative: 100, estimated: 200, maximum: 300 },
      topRecurringIssues: [],
    },
    resolvedFees: [],
    globalFindings: [],
    actionItems: [],
    masterNarrative: "",
  };
}

function report(): MultiStatementGlobalReport {
  return {
    kind: "multi_statement_global",
    executiveSummary: {
      merchantName: "Test Restaurant",
      isoName: "Clover / First Data",
      processorPlatform: "fiserv_first_data",
      dateRange: "2024-11 - 2024-12",
      statementCount: 2,
      missingPeriods: [],
      totalVolume: { label: "Total volume", value: "$2,000.00", rawValue: 2000, unit: "money" },
      totalFees: { label: "Total fees", value: "$50.00", rawValue: 50, unit: "money" },
      averageEffectiveRate: { label: "Average effective rate", value: "2.49%", rawValue: 0.0249, unit: "percent" },
      trendDirection: "stable",
      pricingModel: "interchange_plus",
      pricingModelConsistent: true,
      headlineSavings: { label: "Projected annual savings", value: "$200.00", rawValue: 200, unit: "money" },
      benchmark: {
        status: "within",
        message: "within competitive range (1.95% - 2.45% for Restaurant / Food Service at this volume)",
        lowerRate: 0.0195,
        upperRate: 0.0245,
        estimatedAnnualOverpayment: null,
      },
    },
    effectiveRateTrend: {
      direction: "stable",
      explanation: null,
      lowest: { period: "2024-12", rate: 0.0248, displayRate: "2.48%" },
      highest: { period: "2024-11", rate: 0.025, displayRate: "2.50%" },
      averageRate: 0.0249,
      displayAverageRate: "2.49%",
      periods: [],
    },
    operationalContext: {
      inactivePeriods: [],
      refundTrend: { direction: "stable", finding: null, periods: [] },
      cardMixShifts: [],
      priorPeriodAdjustments: [],
      interchangeQualification: { applicable: false, finding: null },
    },
    disputeTrend: { direction: "none", totalDisputeCostsAllPeriods: 0, finding: null, periods: [] },
    feeChangeTimeline: [],
    topFindings: [],
    recurringAvoidableFees: [],
    cumulativeSavings: {
      alreadyOverpaid: { conservative: 10, estimated: 20, maximum: 30 },
      projectedAnnualIfUnchanged: { conservative: 100, estimated: 200, maximum: 300 },
      componentBreakdown: [],
    },
    actionItems: [],
    actionSummary: {
      totalProjectedAnnualSavings: 200,
      largestSingleOpportunity: null,
      message: "Total projected annual savings if all actions are taken: $200.00.",
    },
    masterNarrative: ["The account is within benchmark and has optimization opportunities."],
    individualReports: [],
    sourceAnalysis: { analysisTimestamp: "2026-07-12T00:00:00.000Z", pipelineVersion: "test" },
  };
}

describe("multiStatementStore", () => {
  let accountStore: AccountStoreModule;
  let dbModule: DbModule;
  let multiStatementStore: MultiStatementStoreModule;

  beforeEach(async () => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    accountStore = await import("../src/accountStore.js");
    multiStatementStore = await import("../src/multiStatementStore.js");
    dbModule = await import("../src/db.js");
  });

  afterEach(() => {
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
  });

  function merchantId() {
    return accountStore.createMerchantAccount({
      email: `merchant-${Date.now()}@example.com`,
      firstName: "Test",
      lastName: "Merchant",
      passwordHash: "hash",
      businessType: "restaurant_food_beverage",
    }).id;
  }

  it("creates a parent job, attaches files, updates independent file status, and records events", () => {
    const job = multiStatementStore.createMultiStatementJob({
      merchantId: merchantId(),
      businessType: "restaurant_food_beverage",
      requestedStatementCount: 2,
      pipelineVersion: "pipeline-v1",
      adapterVersion: "adapter-v1",
      comparisonEngineVersion: "engine-v1",
      reportVersion: "report-v1",
    });

    expect(job.status).toBe("created");
    expect(job.requestedStatementCount).toBe(2);

    const november = multiStatementStore.addMultiStatementJobFile({
      multiStatementJobId: job.id,
      originalFileName: "nov.pdf",
      filePath: "/tmp/nov.pdf",
      fileSize: 100,
      contentHash: "hash-nov",
    });
    const december = multiStatementStore.addMultiStatementJobFile({
      multiStatementJobId: job.id,
      originalFileName: "dec.pdf",
      filePath: "/tmp/dec.pdf",
      fileSize: 120,
    });

    multiStatementStore.updateMultiStatementJobFileStatus(november.id, {
      status: "completed",
      detectedPeriod: "2024-11",
      detectedMerchantName: "Test Restaurant",
      detectedProcessor: "Fiserv",
      detectedIso: "Clover / First Data",
    });
    multiStatementStore.updateMultiStatementJobFileStatus(december.id, {
      status: "failed",
      detectedPeriod: "2024-12",
      error: "Parser could not read the statement.",
    });
    const parent = multiStatementStore.updateMultiStatementJobStatus(
      job.id,
      { status: "partially_failed", completedStatementCount: 1, failedStatementCount: 1 },
      "One statement failed; completed files remain available.",
    );

    expect(parent.status).toBe("partially_failed");
    expect(parent.error).toBeNull();
    expect(multiStatementStore.listMultiStatementJobFiles(job.id).map((file) => file.status)).toEqual(["completed", "failed"]);
    expect(multiStatementStore.listMultiStatementJobEvents(job.id).map((event) => event.stage)).toEqual(["created", "partially_failed"]);
  });

  it("persists frozen comparison inputs, raw analysis, and report artifacts", () => {
    const job = multiStatementStore.createMultiStatementJob({
      merchantId: merchantId(),
      businessType: "restaurant_food_beverage",
      requestedStatementCount: 2,
    });

    const firstInput = multiStatementStore.saveComparisonInput({
      multiStatementJobId: job.id,
      statementPeriod: "2024-11",
      comparisonInput: comparisonInput("2024-11"),
      inputSchemaVersion: "comparison-input-v1",
      sourceSummaryHash: "summary-hash-1",
    });
    multiStatementStore.saveComparisonInput({
      multiStatementJobId: job.id,
      statementPeriod: "2024-12",
      comparisonInput: comparisonInput("2024-12"),
      inputSchemaVersion: "comparison-input-v1",
    });
    const updatedFirstInput = multiStatementStore.saveComparisonInput({
      multiStatementJobId: job.id,
      statementPeriod: "2024-11",
      comparisonInput: { ...comparisonInput("2024-11"), financials: { ...comparisonInput("2024-11").financials, totalVolume: 1100 } },
      inputSchemaVersion: "comparison-input-v1",
      sourceSummaryHash: "summary-hash-2",
    });

    expect(updatedFirstInput.id).toBe(firstInput.id);
    expect(multiStatementStore.getComparisonInputsForJob(job.id).map((input) => input.statementPeriod)).toEqual(["2024-11", "2024-12"]);
    expect(multiStatementStore.getComparisonInputsForJob(job.id)[0].comparisonInput.financials.totalVolume).toBe(1100);

    const savedAnalysis = multiStatementStore.saveMultiStatementAnalysis({
      multiStatementJobId: job.id,
      analysis: analysis(),
      analysisSchemaVersion: "analysis-v1",
      engineVersion: "engine-v1",
    });
    expect(multiStatementStore.getLatestMultiStatementAnalysisForJob(job.id)?.id).toBe(savedAnalysis.id);

    const savedReport = multiStatementStore.saveMultiStatementReport({
      multiStatementJobId: job.id,
      report: report(),
      reportMarkdown: "# Report",
      reportSchemaVersion: "report-v1",
      narrativeStatus: "applied",
      narrativeProvider: "openai",
      narrativeModel: "test-model",
      narrative: { paragraphs: ["The account is within benchmark."] },
    });

    const latestForJob = multiStatementStore.getLatestMultiStatementReportForJob(job.id);
    const latestForMerchant = multiStatementStore.getLatestMultiStatementReportForMerchant(job.merchantId!);

    expect(latestForJob?.id).toBe(savedReport.id);
    expect(latestForMerchant?.id).toBe(savedReport.id);
    expect(latestForJob?.reportMarkdown).toBe("# Report");
    expect(latestForJob?.benchmarkStatus).toBe("within");
    expect(latestForJob?.averageEffectiveRate).toBe(0.0249);
    expect(latestForJob?.estimatedAnnualSavings).toBe(200);
    expect(latestForJob?.narrative).toEqual({ paragraphs: ["The account is within benchmark."] });
  });
});
