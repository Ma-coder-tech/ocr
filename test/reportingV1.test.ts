import { describe, expect, it } from "vitest";
import { buildSingleStatementCustomerReport } from "../src/reporting/index.js";
import { buildSingleStatementReportV1, buildUnableToAnalyzeReportV1 } from "../src/reporting/v1/index.js";
import { aggregateOpportunity } from "../src/reporting/v1/opportunity.js";
import { singleStatementReportV1Policy } from "../src/reporting/v1/policyConfig.js";
import { normalizeReconciliation } from "../src/reporting/v1/reconcile.js";
import { resolveReportState, type ResolveReportStateInput } from "../src/reporting/v1/resolveState.js";
import { validateSingleStatementReportV1 } from "../src/reporting/v1/schema.js";
import type { OpportunitySummary, ReportFinding, ReportMetrics } from "../src/reporting/v1/types.js";
import type { AnalysisSummary } from "../src/types.js";

const NOW = "2026-07-24T00:00:00.000Z";

function summary(overrides: Partial<AnalysisSummary> = {}): AnalysisSummary {
  return {
    businessType: "retail",
    processorName: "Clover",
    sourceType: "pdf",
    statementPeriod: "2026-06",
    executiveSummary: "Internal summary",
    totalVolume: 10000,
    totalFees: 300,
    estimatedMonthlyVolume: 10000,
    estimatedMonthlyFees: 300,
    estimatedAnnualFees: 3600,
    estimatedAnnualSavings: 0,
    effectiveRate: 3,
    benchmark: { status: "within", lowerRate: 1.8, upperRate: 3.2, segment: "Retail benchmark", deltaFromUpperRate: -0.2 },
    statementSections: [],
    interchangeAudit: { rows: [], rowCount: 0, transactionCount: null, volume: null, totalPaid: null, weightedAverageRateBps: null, totalVariance: null, confidence: 0 },
    interchangeAuditRows: [],
    blendedFeeSplits: [],
    processorMarkupAudit: { rows: [], rowCount: 0, transactionCount: null, volume: null, totalPaid: null, weightedAverageRateBps: null, effectiveRateBps: null, confidence: 0 },
    hiddenMarkupAudit: { rows: [], rowCount: 0, matchedRowCount: 0, flaggedRowCount: 0, hiddenMarkupUsd: null, hiddenMarkupBps: null, status: "not_applicable", confidence: 0 },
    structuredFeeFindings: [],
    bundledPricing: { active: false, buckets: [], highestRatePercent: null, totalVolumeUsd: null, totalFeesUsd: null, confidence: 0 },
    noticeFindings: [],
    downgradeAnalysis: { rows: [], affectedVolumeUsd: null, estimatedPenaltyLowUsd: null, estimatedPenaltyHighUsd: null, confidence: 0 },
    perItemFeeModel: { transactionFee: null, authorizationFee: null, allInPerItemFee: null, components: [], confidence: 0 },
    guideMeasures: { monthlyMinimum: null, expressFundingPremium: null, savingsShareAdjustment: null },
    level3Optimization: {
      eligible: false,
      confidence: 0,
      eligibleVolumeUsd: null,
      rateDeltaBps: null,
      requiredFields: [],
      capturedFields: [],
      missingFields: [],
      detectedSignals: [],
      estimatedMonthlySavingsUsd: null,
      estimatedAnnualSavingsUsd: null,
      evidence: [],
    },
    kpis: [],
    feeBreakdown: [
      {
        label: "Interchange",
        amount: 180,
        sharePct: 60,
        feeClass: "card_brand_pass_through",
        broadType: "Pass-through",
        sourceSection: "Fees",
        evidenceLine: "Interchange 180.00",
        classificationConfidence: "high",
      },
      {
        label: "Processor Fee",
        amount: 120,
        sharePct: 40,
        feeClass: "processor_markup",
        broadType: "Processor",
        sourceSection: "Fees",
        evidenceLine: "Processor Fee 120.00",
        classificationConfidence: "high",
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
    confidence: "high",
    parserDecision: {
      status: "accepted",
      reason: "Validated parser fixture.",
      confidence: "high",
      reportable: true,
      validationState: {
        topLevelTotals: "validated",
        feeLedger: "validated",
        batchLedger: "not_evaluated",
        feeClassification: "validated",
        orphanTotals: "none",
        customerFacingTotalsAllowed: true,
        feeLedgerAllowed: true,
        batchDetailAllowed: false,
        feeClassificationAllowed: true,
        blockingReasons: [],
        warningReasons: [],
      },
    },
    checklistReport: {
      extractionMode: "structured",
      extractionQualityScore: 0.95,
      extractionReasons: ["structured extraction"],
      processorDetection: {
        detectedProcessorId: "fiserv_first_data_interchange_plus",
        detectedProcessorName: "Fiserv / First Data",
        rulePackId: "fiserv_first_data_interchange_plus",
        confidence: 0.95,
        matchedKeywords: ["fiserv"],
        source: "text_preview",
      },
      universal: { total: 0, pass: 0, fail: 0, warning: 0, unknown: 0, notApplicable: 0, results: [] },
      processorSpecific: { total: 0, pass: 0, fail: 0, warning: 0, unknown: 0, notApplicable: 0, results: [], processorId: null, processorName: null },
      crossProcessor: { total: 0, pass: 0, fail: 0, warning: 0, unknown: 0, notApplicable: 0, results: [] },
    },
    ...overrides,
  } as AnalysisSummary;
}

function finding(overrides: Partial<ReportFinding>): ReportFinding {
  return {
    id: "finding",
    sourceFindingType: "test",
    category: "processor_markup",
    disposition: "request_removal",
    impactClassification: "deterministic",
    title: "Test finding",
    explanation: "Test",
    merchantAction: "Act",
    processorQuestion: "Question",
    currentMonthlyAmountUsd: 100,
    currentAnnualizedAmountUsd: 1200,
    cadence: "monthly",
    targetMonthlyAmountUsd: null,
    targetRatePct: null,
    estimatedMonthlyImpactUsd: 100,
    estimatedAnnualImpactUsd: 1200,
    impactLevel: "high",
    easeLevel: "unknown",
    confidence: "high",
    originalStatementLabels: [],
    feeRowIds: [],
    evidenceRefs: [],
    calculationRef: "calc",
    assumptions: [],
    limitations: [],
    includedInOpportunityTotal: false,
    rank: 1,
    aggregationKey: "finding",
    overlapRisk: "none",
    ...overrides,
  };
}

function metrics(totalFees = 300): ReportMetrics {
  return {
    processedSales: { value: 10000, status: "observed", confidence: "high", evidenceRefs: ["ev"] },
    totalFees: { value: totalFees, status: "observed", confidence: "high", evidenceRefs: ["ev"] },
    effectiveRate: { value: 3, status: "calculated", confidence: "high", evidenceRefs: ["ev"], calculationRef: "calc_rate" },
    transactionCount: { value: null, status: "unavailable", confidence: null, evidenceRefs: [], unavailableReason: "not_verified" },
    averageTicket: { value: null, status: "unavailable", confidence: null, evidenceRefs: [], unavailableReason: "not_verified" },
  };
}

function opportunity(overrides: Partial<OpportunitySummary> = {}): OpportunitySummary {
  return {
    deterministicMonthlyImpactUsd: 0,
    deterministicAnnualImpactUsd: 0,
    estimatedMonthlyOpportunityUsd: 0,
    estimatedAnnualOpportunityUsd: 0,
    totalEligibleMonthlyOpportunityUsd: 0,
    totalEligibleAnnualOpportunityUsd: 0,
    verificationMonthlyAmountUsd: 0,
    verificationAnnualizedAmountUsd: null,
    currency: "USD",
    annualizationBasis: "none",
    includedFindingIds: [],
    excludedFindingIds: [],
    ...overrides,
  };
}

function resolveInput(overrides: Partial<ResolveReportStateInput> = {}): ResolveReportStateInput {
  return {
    dataQuality: {
      extractionMode: "structured",
      overallConfidence: "high",
      qualityScore: 0.95,
      reportable: true,
      customerFacingTotalsAllowed: true,
      feeClassificationAllowed: true,
      reasons: [],
    },
    reconciliation: {
      status: "pass",
      totalFees: { value: 300, status: "observed", confidence: "high", evidenceRefs: ["ev"] },
      classifiedFeesTotal: { value: 300, status: "calculated", confidence: "high", evidenceRefs: ["ev"], calculationRef: "calc_recon" },
      unclassifiedAmount: { value: 0, status: "calculated", confidence: "high", evidenceRefs: ["ev"], calculationRef: "calc_recon" },
      coveragePct: { value: 100, status: "calculated", confidence: "high", evidenceRefs: ["ev"], calculationRef: "calc_recon" },
      deltaUsd: { value: 0, status: "calculated", confidence: "high", evidenceRefs: ["ev"], calculationRef: "calc_recon" },
      toleranceUsd: 6,
      reasons: [],
    },
    metrics: metrics(),
    benchmark: {
      status: "within",
      eligible: true,
      segment: "Retail benchmark",
      lowerRate: 1.8,
      upperRate: 3.2,
      effectiveRate: 3,
      deltaFromUpperRate: 0,
      source: {
        sourceId: "source",
        name: "Internal",
        version: "v1",
        methodologyLabel: "Internal directional range",
      },
      confidence: "medium",
    },
    opportunitySummary: opportunity(),
    findings: [],
    evaluatedAt: NOW,
    ...overrides,
  };
}

describe("SingleStatementReportV1 safety foundation", () => {
  it("builds a validated healthy report beside the unchanged legacy report", () => {
    const analysis = summary();
    const legacy = buildSingleStatementCustomerReport({ kind: "single_statement_result", analysis });
    const report = buildSingleStatementReportV1({ analysis, reportId: "report-1", generatedAt: NOW, sourceFileName: "statement.pdf" });

    expect(legacy.state).toBe("Clean");
    expect(report.contractVersion).toBe("single_statement_report_v1");
    expect(report.policyVersion).toBe(singleStatementReportV1Policy.policyVersion);
    expect(report.reportState.code).toBe("healthy");
    expect(report.benchmark.source).toMatchObject({
      sourceId: "ratereveal_directional_business_type_ranges_2026_07",
      methodologyLabel: "Internal directional range selected from the merchant's declared business type.",
    });
    expect(report.limitations.some((limitation) => limitation.message.includes("not an independently verified market rate"))).toBe(true);
  });

  it("builds unable_to_analyze without an AnalysisSummary", () => {
    const report = buildUnableToAnalyzeReportV1({ reportId: "failed-job", generatedAt: NOW, reason: "Parser failed." });
    expect(report.reportState.code).toBe("unable_to_analyze");
    expect(report.metrics.totalFees.value).toBeNull();
    expect(report.componentVisibility.opportunity_summary).toMatchObject({ status: "hide", reason: "parser_blocked" });
  });

  it("resolves all eight states with precedence and inclusive thresholds", () => {
    expect(resolveReportState(resolveInput({ analysisFailed: true })).code).toBe("unable_to_analyze");
    expect(resolveReportState(resolveInput({ reconciliation: { ...resolveInput().reconciliation, status: "fail" } })).code).toBe("reconciliation_failure");
    expect(resolveReportState(resolveInput({ dataQuality: { ...resolveInput().dataQuality, overallConfidence: "low" } })).code).toBe("low_confidence");
    expect(
      resolveReportState(
        resolveInput({
          opportunitySummary: opportunity({ verificationAnnualizedAmountUsd: 250 }),
        }),
      ).code,
    ).toBe("verification_required");
    expect(
      resolveReportState(
        resolveInput({
          opportunitySummary: opportunity({ totalEligibleAnnualOpportunityUsd: 1000, totalEligibleMonthlyOpportunityUsd: 83.33 }),
        }),
      ).code,
    ).toBe("material_overpayment");
    expect(
      resolveReportState(
        resolveInput({
          benchmark: { ...resolveInput().benchmark, status: "above", deltaFromUpperRate: 0.49 },
        }),
      ).code,
    ).toBe("above_benchmark_review");
    expect(resolveReportState(resolveInput({ findings: [finding({ id: "small", estimatedAnnualImpactUsd: 120, currentAnnualizedAmountUsd: 120 })] })).code).toBe(
      "healthy_with_opportunities",
    );
    expect(resolveReportState(resolveInput()).code).toBe("healthy");
  });

  it("lets material overpayment override verification when an independent eligible opportunity qualifies", () => {
    const resolved = resolveReportState(
      resolveInput({
        opportunitySummary: opportunity({
          verificationAnnualizedAmountUsd: 250,
          totalEligibleAnnualOpportunityUsd: 1000,
          totalEligibleMonthlyOpportunityUsd: 83.33,
        }),
      }),
    );
    expect(resolved.code).toBe("material_overpayment");
  });

  it("normalizes reconciliation boundaries inclusively", () => {
    const atCoverage = normalizeReconciliation(
      summary({
        totalFees: 100,
        twoBucketAnalysis: {
          source: "summary_fee_rows",
          totalFees: 100,
          cardBrandTotal: 42.5,
          processorOwnedTotal: 42.5,
          processorControlledTotal: 42.5,
          unknownTotal: 15,
          cardBrandSharePct: null,
          processorOwnedSharePct: null,
          processorControlledSharePct: null,
          coveragePct: 85,
          reconciliationDeltaUsd: 2,
          available: true,
          reason: "At boundary.",
          evidence: { totalFees: [], cardBrand: [], processorOwned: [] },
        },
      }),
      { evidenceRefs: ["ev"], calculationRef: "calc_reconciliation" },
    );
    const aboveDelta = normalizeReconciliation(
      summary({
        totalFees: 100,
        twoBucketAnalysis: {
          source: "summary_fee_rows",
          totalFees: 100,
          cardBrandTotal: 50,
          processorOwnedTotal: 47.99,
          processorControlledTotal: 47.99,
          unknownTotal: 0,
          cardBrandSharePct: null,
          processorOwnedSharePct: null,
          processorControlledSharePct: null,
          coveragePct: 97.99,
          reconciliationDeltaUsd: 2.01,
          available: true,
          reason: "Above boundary.",
          evidence: { totalFees: [], cardBrand: [], processorOwned: [] },
        },
      }),
      { evidenceRefs: ["ev"], calculationRef: "calc_reconciliation" },
    );

    expect(atCoverage.status).toBe("pass");
    expect(atCoverage.toleranceUsd).toBe(2);
    expect(aboveDelta.status).toBe("fail");
  });

  it("aggregates only eligible opportunities and records exclusions", () => {
    const result = aggregateOpportunity([
      finding({ id: "parent", aggregationKey: "modeled", estimatedAnnualImpactUsd: 1200, supersedesFindingIds: ["child"] }),
      finding({ id: "child", aggregationKey: "child", estimatedAnnualImpactUsd: 200 }),
      finding({ id: "duplicate", aggregationKey: "modeled", estimatedAnnualImpactUsd: 100 }),
      finding({ id: "verify", impactClassification: "verification_only", currentMonthlyAmountUsd: 50, currentAnnualizedAmountUsd: 600, estimatedAnnualImpactUsd: 600 }),
      finding({ id: "low", confidence: "low", aggregationKey: "low", estimatedAnnualImpactUsd: 500 }),
      finding({ id: "unknown", cadence: "unknown", aggregationKey: "unknown", estimatedAnnualImpactUsd: 500 }),
      finding({ id: "overlap", aggregationKey: "overlap", overlapRisk: "possible", estimatedAnnualImpactUsd: 500 }),
    ]);

    expect(result.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(1200);
    expect(result.opportunitySummary.includedFindingIds).toEqual(["parent"]);
    expect(result.opportunitySummary.excludedFindingIds).toEqual(expect.arrayContaining(["child", "duplicate", "verify", "low", "unknown", "overlap"]));
    expect(result.opportunitySummary.verificationAnnualizedAmountUsd).toBe(600);
  });

  it("rejects broken references and invalid value wrappers", () => {
    const report = buildSingleStatementReportV1({ analysis: summary(), reportId: "report-2", generatedAt: NOW });
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        metrics: {
          ...report.metrics,
          totalFees: {
            ...report.metrics.totalFees,
            evidenceRefs: ["missing"],
          },
        },
      }),
    ).toThrow(/broken/);
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        metrics: {
          ...report.metrics,
          processedSales: {
            ...report.metrics.processedSales,
            status: "unavailable",
          },
        },
      }),
    ).toThrow(/unavailable/);
  });
});
