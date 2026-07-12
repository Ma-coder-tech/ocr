import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessTypeId } from "../src/businessTypes.js";
import type { ComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import type { AnalysisSummary } from "../src/types.js";

type DbModule = typeof import("../src/db.js");
type StoreModule = typeof import("../src/multiStatementStore.js");
type OrchestratorModule = typeof import("../src/multiStatementOrchestrator.js");

const BUSINESS_TYPE = "restaurant_food_beverage" satisfies BusinessTypeId;

function comparisonInput(
  period: string,
  overrides: Partial<ComparisonStatementInput> = {},
): ComparisonStatementInput {
  const input: ComparisonStatementInput = {
    statementPeriod: period,
    sourceAnalysisId: `source-${period}`,
    pipelineVersion: "test-pipeline",
    merchant: {
      id: null,
      merchantNumber: "merchant-123",
      merchantName: "Pepe's Mexican Restaurant",
      isoName: "Wells Fargo",
      processorPlatform: "fiserv_first_data",
      address: null,
      merchantCategory: "restaurant_food_beverage",
      merchantCategoryConfidence: "high",
      merchantChannel: "card_present",
    },
    financials: {
      totalVolume: 100_000,
      totalFees: 2_490,
      effectiveRate: 0.0249,
      rateUnit: "decimal",
      totalTransactions: 2_000,
      averageTicket: 50,
    },
    pricingModel: { model: "interchange_plus", confidence: "high" },
    processorControlledTotal: 550,
    processorControlledPct: 0.0055,
    benchmark: {
      status: "within",
      segment: "Restaurant / Food Service",
      categoryLabel: "Restaurant / Food Service",
      lowerRate: 0.0195,
      upperRate: 0.0245,
      effectiveRate: 0.0249,
      annualVolume: 1_200_000,
      estimatedAnnualOverpayment: null,
      message: "Within benchmark.",
    },
    estimatedAnnualSavings: { conservative: 25, estimated: 50, maximum: 75 },
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

  return {
    ...input,
    ...overrides,
    merchant: { ...input.merchant, ...overrides.merchant },
    financials: { ...input.financials, ...overrides.financials },
  };
}

function uploadFile(originalFileName: string) {
  return {
    originalFileName,
    filePath: `/tmp/${originalFileName}`,
    fileSize: 1000,
  };
}

function depsFor(statementsByFile: Record<string, ComparisonStatementInput>) {
  return {
    parsePdf: async (filePath: string) => {
      if (filePath.includes("fail")) {
        throw new Error(`Cannot parse ${filePath}`);
      }
      return { sourceType: "pdf", headers: [], rows: [], textPreview: "", extraction: {} } as any;
    },
    analyzeStatement: async (
      _document: any,
      _businessType: BusinessTypeId,
      options: { sourceFileName: string },
    ) => ({ __sourceFileName: options.sourceFileName }) as unknown as AnalysisSummary,
    adaptStatement: (summary: AnalysisSummary) => {
      const fileName = (summary as any).__sourceFileName;
      const statement = statementsByFile[fileName];
      if (!statement) throw new Error(`No adapted fixture for ${fileName}`);
      return statement;
    },
  };
}

describe("runMultiStatementAnalysis", () => {
  let dbModule: DbModule;
  let store: StoreModule;
  let orchestrator: OrchestratorModule;

  beforeEach(async () => {
    vi.resetModules();
    process.env.FEECLEAR_DB_PATH = ":memory:";
    dbModule = await import("../src/db.js");
    store = await import("../src/multiStatementStore.js");
    orchestrator = await import("../src/multiStatementOrchestrator.js");
  });

  afterEach(() => {
    dbModule.db.close();
    delete process.env.FEECLEAR_DB_PATH;
  });

  it("can create a queued job first and process that existing job later", async () => {
    const created = orchestrator.createMultiStatementAnalysisJob({
      businessType: BUSINESS_TYPE,
      files: [uploadFile("nov.pdf"), uploadFile("dec.pdf")],
      narrative: { enabled: false },
    });

    expect(created.status).toBe("created");
    expect(created.report).toBeNull();
    expect(store.listMultiStatementJobFiles(created.jobId).map((file) => file.status)).toEqual([
      "uploaded",
      "uploaded",
    ]);

    const processed = await orchestrator.processMultiStatementAnalysisJob(
      created.jobId,
      { narrative: { enabled: false } },
      depsFor({
        "nov.pdf": comparisonInput("2024-11"),
        "dec.pdf": comparisonInput("2024-12"),
      }),
    );

    expect(processed.status).toBe("completed");
    expect(processed.includedPeriods).toEqual(["2024-11", "2024-12"]);
    expect(processed.report?.kind).toBe("multi_statement_global");
    expect(store.getComparisonInputsForJob(created.jobId)).toHaveLength(2);
  });

  it("completes a happy-path multi-statement job and stores every artifact", async () => {
    const result = await orchestrator.runMultiStatementAnalysis(
      {
        businessType: BUSINESS_TYPE,
        files: [uploadFile("nov.pdf"), uploadFile("dec.pdf"), uploadFile("jan.pdf")],
        narrative: { enabled: false },
      },
      depsFor({
        "nov.pdf": comparisonInput("2024-11"),
        "dec.pdf": comparisonInput("2024-12", {
          financials: { totalVolume: 110_000, totalFees: 2_700, effectiveRate: 0.0245 },
        }),
        "jan.pdf": comparisonInput("2025-01", {
          financials: { totalVolume: 105_000, totalFees: 2_650, effectiveRate: 0.0252 },
        }),
      }),
    );

    expect(result.status).toBe("completed");
    expect(result.includedPeriods).toEqual(["2024-11", "2024-12", "2025-01"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.excludedFiles).toEqual([]);
    expect(result.report?.kind).toBe("multi_statement_global");
    expect(store.getComparisonInputsForJob(result.jobId)).toHaveLength(3);
    expect(store.getLatestMultiStatementAnalysisForJob(result.jobId)?.id).toBe(result.analysisId);
    expect(store.getLatestMultiStatementReportForJob(result.jobId)?.id).toBe(result.reportId);
    expect(store.listMultiStatementJobEvents(result.jobId).map((event) => event.stage)).toContain("job_completed");
  });

  it("records a failed file and still completes from the successful statements", async () => {
    const result = await orchestrator.runMultiStatementAnalysis(
      {
        businessType: BUSINESS_TYPE,
        files: [uploadFile("nov.pdf"), uploadFile("fail-dec.pdf"), uploadFile("jan.pdf")],
        narrative: { enabled: false },
      },
      depsFor({
        "nov.pdf": comparisonInput("2024-11"),
        "jan.pdf": comparisonInput("2025-01"),
      }),
    );

    expect(result.status).toBe("completed");
    expect(result.includedPeriods).toEqual(["2024-11", "2025-01"]);
    expect(result.missingPeriods).toEqual(["2024-12"]);
    expect(result.failedFiles).toHaveLength(1);
    expect(result.failedFiles[0].originalFileName).toBe("fail-dec.pdf");
    expect(result.failedFiles[0].errorMessage).toContain("Cannot parse");
    expect(store.getComparisonInputsForJob(result.jobId)).toHaveLength(2);
  });

  it("fails the job when no statements can be processed", async () => {
    const result = await orchestrator.runMultiStatementAnalysis(
      {
        businessType: BUSINESS_TYPE,
        files: [uploadFile("fail-nov.pdf"), uploadFile("fail-dec.pdf")],
        narrative: { enabled: false },
      },
      depsFor({}),
    );

    expect(result.status).toBe("failed");
    expect(result.report).toBeNull();
    expect(result.failedFiles).toHaveLength(2);
    expect(store.getComparisonInputsForJob(result.jobId)).toHaveLength(0);
    expect(store.getLatestMultiStatementAnalysisForJob(result.jobId)).toBeNull();
  });

  it("excludes later-uploaded duplicate periods and compares the first occurrence", async () => {
    const result = await orchestrator.runMultiStatementAnalysis(
      {
        businessType: BUSINESS_TYPE,
        files: [uploadFile("nov.pdf"), uploadFile("dec-a.pdf"), uploadFile("dec-b.pdf")],
        narrative: { enabled: false },
      },
      depsFor({
        "nov.pdf": comparisonInput("2024-11"),
        "dec-a.pdf": comparisonInput("2024-12", {
          sourceAnalysisId: "first-december",
        }),
        "dec-b.pdf": comparisonInput("2024-12", {
          sourceAnalysisId: "duplicate-december",
        }),
      }),
    );

    expect(result.status).toBe("completed");
    expect(result.includedPeriods).toEqual(["2024-11", "2024-12"]);
    expect(result.excludedFiles).toHaveLength(1);
    expect(result.excludedFiles[0]).toEqual(
      expect.objectContaining({
        originalFileName: "dec-b.pdf",
        exclusionReason: "duplicate period",
      }),
    );
    expect(store.getComparisonInputsForJob(result.jobId)).toHaveLength(2);
    expect(
      store
        .getComparisonInputsForJob(result.jobId)
        .map((record) => record.comparisonInput.sourceAnalysisId),
    ).toContain("first-december");
  });

  it("fails when successful statements appear to belong to different merchants", async () => {
    const result = await orchestrator.runMultiStatementAnalysis(
      {
        businessType: BUSINESS_TYPE,
        files: [uploadFile("pepe.pdf"), uploadFile("other.pdf")],
        narrative: { enabled: false },
      },
      depsFor({
        "pepe.pdf": comparisonInput("2024-11"),
        "other.pdf": comparisonInput("2024-12", {
          merchant: {
            merchantNumber: "merchant-999",
            merchantName: "Other Restaurant",
            isoName: "Wells Fargo",
          },
        }),
      }),
    );

    expect(result.status).toBe("failed");
    expect(result.report).toBeNull();
    expect(result.excludedFiles).toEqual([]);
    expect(store.getMultiStatementJob(result.jobId)?.error).toContain(
      "different merchants",
    );
    expect(store.getComparisonInputsForJob(result.jobId)).toHaveLength(0);
  });

  it("supports a single uploaded PDF without crashing the comparison/report flow", async () => {
    const result = await orchestrator.runMultiStatementAnalysis(
      {
        businessType: BUSINESS_TYPE,
        files: [uploadFile("nov.pdf")],
        narrative: { enabled: false },
      },
      depsFor({ "nov.pdf": comparisonInput("2024-11") }),
    );

    expect(result.status).toBe("completed");
    expect(result.includedPeriods).toEqual(["2024-11"]);
    expect(result.report?.executiveSummary.statementCount).toBe(1);
    expect(result.failedFiles).toEqual([]);
    expect(result.excludedFiles).toEqual([]);
  });
});
