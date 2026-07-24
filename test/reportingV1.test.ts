import { describe, expect, it } from "vitest";
import { buildSingleStatementCustomerReport } from "../src/reporting/index.js";
import { buildSingleStatementReportV1, buildUnableToAnalyzeReportV1 } from "../src/reporting/v1/index.js";
import { aggregateOpportunity } from "../src/reporting/v1/opportunity.js";
import { singleStatementReportV1Policy } from "../src/reporting/v1/policyConfig.js";
import { normalizeReconciliation } from "../src/reporting/v1/reconcile.js";
import { resolveReportState, type ResolveReportStateInput } from "../src/reporting/v1/resolveState.js";
import { validateSingleStatementReportV1 } from "../src/reporting/v1/schema.js";
import { confidenceFromScore } from "../src/reporting/v1/utils.js";
import type { OpportunitySummary, ReportFinding, ReportMetrics } from "../src/reporting/v1/types.js";
import type { AnalysisSummary, StructuredFeeFinding } from "../src/types.js";

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

function structuredFeeFinding(overrides: Partial<StructuredFeeFinding> = {}): StructuredFeeFinding {
  return {
    kind: "risk_fee",
    label: "Risk Fee",
    amountUsd: 10,
    ratePercent: null,
    affectedVolumeUsd: null,
    estimatedImpactUsd: null,
    sourceSection: "Fees",
    evidenceLine: "Risk Fee 10.00",
    rowIndex: 1,
    confidence: 0.9,
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

  it("defaults structured finding cadence to unknown unless approved policy or explicit evidence applies", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        structuredFeeFindings: [
          structuredFeeFinding({ kind: "risk_fee", label: "Risk Fee", amountUsd: 20, evidenceLine: "Risk Fee 20.00" }),
          structuredFeeFinding({ kind: "risk_fee", label: "Monthly Risk Fee", amountUsd: 30, evidenceLine: "Monthly Risk Fee 30.00", rowIndex: 2 }),
          structuredFeeFinding({ kind: "pci_non_compliance", label: "PCI Non Compliance", amountUsd: 40, rowIndex: 3 }),
          structuredFeeFinding({ kind: "customer_intelligence_suite", label: "Customer Intelligence Suite", amountUsd: 50, rowIndex: 4 }),
          structuredFeeFinding({ kind: "non_emv", label: "Non EMV Assessment", amountUsd: 60, rowIndex: 5 }),
        ],
      }),
      reportId: "cadence",
      generatedAt: NOW,
    });

    const byType = Object.fromEntries(report.findings.map((item) => [item.sourceFindingType, item]));
    const risk = report.findings.find((item) => item.title === "Risk Fee")!;
    const explicitMonthlyRisk = report.findings.find((item) => item.title === "Monthly Risk Fee")!;

    expect(risk.cadence).toBe("unknown");
    expect(risk.estimatedAnnualImpactUsd).toBeNull();
    expect(risk.includedInOpportunityTotal).toBe(false);
    expect(explicitMonthlyRisk.cadence).toBe("monthly");
    expect(explicitMonthlyRisk.estimatedAnnualImpactUsd).toBe(360);
    expect(byType.pci_non_compliance.cadence).toBe("monthly");
    expect(byType.customer_intelligence_suite.cadence).toBe("monthly");
    expect(byType.non_emv.impactClassification).toBe("verification_only");
    expect(report.opportunitySummary.excludedFindingIds).toContain(risk.id);
    expect(report.opportunitySummary.excludedFindingIds).toContain(byType.non_emv.id);
  });

  it("covers required report-state fixture cases and material thresholds", () => {
    const cases: Array<[string, ResolveReportStateInput, string, string]> = [
      ["healthy", resolveInput(), "healthy", "competitive_rate_no_findings"],
      [
        "healthy_with_opportunities",
        resolveInput({ findings: [finding({ id: "small", estimatedAnnualImpactUsd: 120, currentAnnualizedAmountUsd: 120 })] }),
        "healthy_with_opportunities",
        "competitive_rate_with_findings",
      ],
      [
        "above_benchmark_without_removable_fee",
        resolveInput({ benchmark: { ...resolveInput().benchmark, status: "above", deltaFromUpperRate: 0.49 } }),
        "above_benchmark_review",
        "rate_above_benchmark",
      ],
      [
        "eligible_annual_material",
        resolveInput({ opportunitySummary: opportunity({ totalEligibleAnnualOpportunityUsd: 1000, totalEligibleMonthlyOpportunityUsd: 83.33 }) }),
        "material_overpayment",
        "material_processor_cost",
      ],
      [
        "share_of_fees_material",
        resolveInput({ opportunitySummary: opportunity({ totalEligibleAnnualOpportunityUsd: 500, totalEligibleMonthlyOpportunityUsd: 30 }) }),
        "material_overpayment",
        "material_processor_cost",
      ],
      [
        "benchmark_gap_with_supported_model",
        resolveInput({
          metrics: metrics(1000),
          benchmark: { ...resolveInput().benchmark, status: "above", deltaFromUpperRate: 0.5 },
          opportunitySummary: opportunity({ estimatedAnnualOpportunityUsd: 500, totalEligibleAnnualOpportunityUsd: 500, totalEligibleMonthlyOpportunityUsd: 41.67 }),
        }),
        "material_overpayment",
        "material_benchmark_gap",
      ],
      [
        "verification_annualized",
        resolveInput({ opportunitySummary: opportunity({ verificationAnnualizedAmountUsd: 250 }) }),
        "verification_required",
        "material_verification_amount",
      ],
      [
        "verification_share",
        resolveInput({ opportunitySummary: opportunity({ verificationMonthlyAmountUsd: 30 }) }),
        "verification_required",
        "material_verification_amount",
      ],
      ["low_confidence_partial", resolveInput({ dataQuality: { ...resolveInput().dataQuality, overallConfidence: "low" } }), "low_confidence", "analysis_confidence_low"],
      ["reconciliation_failure", resolveInput({ reconciliation: { ...resolveInput().reconciliation, status: "fail" } }), "reconciliation_failure", "reconciliation_delta_exceeded"],
      ["unable_to_analyze", resolveInput({ analysisFailed: true }), "unable_to_analyze", "unreadable_document"],
      [
        "missing_benchmark",
        resolveInput({ benchmark: { ...resolveInput().benchmark, status: "unavailable", eligible: false, source: null, omissionReason: "benchmark_unavailable" } }),
        "low_confidence",
        "benchmark_unavailable",
      ],
      [
        "no_findings_inadequate_coverage",
        resolveInput({ reconciliation: { ...resolveInput().reconciliation, status: "warning" } }),
        "low_confidence",
        "fee_coverage_insufficient",
      ],
    ];

    for (const [name, input, code, reason] of cases) {
      const resolved = resolveReportState(input);
      expect(resolved.code, name).toBe(code);
      expect(resolved.reasons, name).toContain(reason);
    }
  });

  it("covers confidence threshold boundaries", () => {
    expect(confidenceFromScore(0.8)).toBe("high");
    expect(confidenceFromScore(0.7999)).toBe("medium");
    expect(confidenceFromScore(0.6)).toBe("medium");
    expect(confidenceFromScore(0.5999)).toBe("low");
  });

  it("covers reconciliation coverage and delta boundaries", () => {
    const makeReconciliation = (coveragePct: number, reconciliationDeltaUsd: number) =>
      normalizeReconciliation(
        summary({
          totalFees: 100,
          twoBucketAnalysis: {
            source: "summary_fee_rows",
            totalFees: 100,
            cardBrandTotal: 50,
            processorOwnedTotal: 50 - reconciliationDeltaUsd,
            processorControlledTotal: 50 - reconciliationDeltaUsd,
            unknownTotal: 100 - coveragePct,
            cardBrandSharePct: null,
            processorOwnedSharePct: null,
            processorControlledSharePct: null,
            coveragePct,
            reconciliationDeltaUsd,
            available: true,
            reason: "Boundary.",
            evidence: { totalFees: [], cardBrand: [], processorOwned: [] },
          },
        }),
        { evidenceRefs: ["ev"], calculationRef: "calc_reconciliation" },
      );

    expect(makeReconciliation(84.99, 0).status).toBe("warning");
    expect(makeReconciliation(85, 2).status).toBe("pass");
    expect(makeReconciliation(100, 1.99).status).toBe("pass");
    expect(makeReconciliation(100, 2.01).status).toBe("fail");
  });

  it("resolves supersession graph before aggregation, including reverse order and chains", () => {
    const reverseOrder = aggregateOpportunity([
      finding({ id: "child", aggregationKey: "child", estimatedAnnualImpactUsd: 900, currentAnnualizedAmountUsd: 900 }),
      finding({ id: "parent", aggregationKey: "parent", estimatedAnnualImpactUsd: 600, currentAnnualizedAmountUsd: 600, supersedesFindingIds: ["child"] }),
    ]);
    expect(reverseOrder.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(600);
    expect(reverseOrder.opportunitySummary.includedFindingIds).toEqual(["parent"]);
    expect(reverseOrder.opportunitySummary.excludedFindingIds).toContain("child");

    const chained = aggregateOpportunity([
      finding({ id: "grandparent", aggregationKey: "grandparent", estimatedAnnualImpactUsd: 700, currentAnnualizedAmountUsd: 700, supersedesFindingIds: ["parent"] }),
      finding({ id: "parent", aggregationKey: "parent", estimatedAnnualImpactUsd: 600, currentAnnualizedAmountUsd: 600, supersedesFindingIds: ["child"] }),
      finding({ id: "child", aggregationKey: "child", estimatedAnnualImpactUsd: 500, currentAnnualizedAmountUsd: 500 }),
    ]);
    expect(chained.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(700);
    expect(chained.opportunitySummary.excludedFindingIds).toEqual(expect.arrayContaining(["parent", "child"]));
  });

  it("excludes invalid or circular supersession relationships rather than double counting uncertain amounts", () => {
    const invalid = aggregateOpportunity([
      finding({ id: "invalid_parent", aggregationKey: "invalid_parent", estimatedAnnualImpactUsd: 800, currentAnnualizedAmountUsd: 800, supersedesFindingIds: ["missing"] }),
      finding({ id: "supported", aggregationKey: "supported", estimatedAnnualImpactUsd: 300, currentAnnualizedAmountUsd: 300 }),
    ]);
    expect(invalid.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(300);
    expect(invalid.opportunitySummary.includedFindingIds).toEqual(["supported"]);
    expect(invalid.opportunitySummary.excludedFindingIds).toContain("invalid_parent");

    const circular = aggregateOpportunity([
      finding({ id: "a", aggregationKey: "a", estimatedAnnualImpactUsd: 800, currentAnnualizedAmountUsd: 800, supersedesFindingIds: ["b"] }),
      finding({ id: "b", aggregationKey: "b", estimatedAnnualImpactUsd: 700, currentAnnualizedAmountUsd: 700, supersedesFindingIds: ["a"] }),
      finding({ id: "supported", aggregationKey: "supported", estimatedAnnualImpactUsd: 300, currentAnnualizedAmountUsd: 300 }),
    ]);
    expect(circular.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(300);
    expect(circular.opportunitySummary.excludedFindingIds).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("keeps one-time, unknown-cadence, verification-only, low-confidence, and overlap-risk findings out of annual opportunity", () => {
    const result = aggregateOpportunity([
      finding({ id: "one_time", aggregationKey: "one_time", cadence: "one_time", estimatedAnnualImpactUsd: 1000, currentAnnualizedAmountUsd: 1000 }),
      finding({ id: "unknown", aggregationKey: "unknown", cadence: "unknown", estimatedAnnualImpactUsd: 1000, currentAnnualizedAmountUsd: 1000 }),
      finding({ id: "verify", aggregationKey: "verify", impactClassification: "verification_only", currentMonthlyAmountUsd: 30, currentAnnualizedAmountUsd: 360, estimatedAnnualImpactUsd: 360 }),
      finding({ id: "low", aggregationKey: "low", confidence: "low", estimatedAnnualImpactUsd: 1000, currentAnnualizedAmountUsd: 1000 }),
      finding({ id: "overlap", aggregationKey: "overlap", overlapRisk: "possible", estimatedAnnualImpactUsd: 1000, currentAnnualizedAmountUsd: 1000 }),
    ]);

    expect(result.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(result.opportunitySummary.verificationAnnualizedAmountUsd).toBe(360);
    expect(result.opportunitySummary.excludedFindingIds).toEqual(expect.arrayContaining(["one_time", "unknown", "verify", "low", "overlap"]));
  });

  it("builds boundary fixtures for missing merchant, missing benchmark, unknown pricing, and unavailable values", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        benchmark: { status: "unavailable", lowerRate: null, upperRate: null, segment: null, deltaFromUpperRate: 0 },
        totalVolume: null,
        processorName: "Unknown",
      }),
      reportId: "boundary-fixture",
      generatedAt: NOW,
      context: { merchantName: null },
    });

    expect(report.reportState.code).toBe("unable_to_analyze");
    expect(report.identity.merchantName.status).toBe("unavailable");
    expect(report.identity.processorName.status).toBe("unavailable");
    expect(report.benchmark.eligible).toBe(false);
    expect(report.pricingModel.model).toBe("unknown");
    expect(report.metrics.processedSales.value).toBeNull();
  });

  it("uses full schemas and integrity checks for unsupported versions, calculations, and component visibility", () => {
    const report = buildSingleStatementReportV1({ analysis: summary(), reportId: "report-3", generatedAt: NOW });

    expect(() => validateSingleStatementReportV1({ ...report, contractVersion: "unsupported" } as never)).toThrow();
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        metrics: {
          ...report.metrics,
          effectiveRate: {
            ...report.metrics.effectiveRate,
            calculationRef: "missing_calc",
          },
        },
      }),
    ).toThrow(/calculationRef is broken/);
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        componentVisibility: {
          ...report.componentVisibility,
          benchmark: { status: "hide" },
        },
      }),
    ).toThrow(/hidden without an omission reason/);
  });

  it("validates opportunity id partitions and included finding eligibility", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        structuredFeeFindings: [
          structuredFeeFinding({ kind: "pci_non_compliance", label: "PCI Non Compliance", amountUsd: 100, rowIndex: 1 }),
          structuredFeeFinding({ kind: "risk_fee", label: "Risk Fee", amountUsd: 20, rowIndex: 2 }),
        ],
      }),
      reportId: "opportunity-integrity",
      generatedAt: NOW,
    });
    const includedId = report.opportunitySummary.includedFindingIds[0]!;
    const excludedId = report.opportunitySummary.excludedFindingIds[0]!;
    expect(includedId).toBeTruthy();
    expect(excludedId).toBeTruthy();
    expect(() => validateSingleStatementReportV1(report)).not.toThrow();

    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        opportunitySummary: { ...report.opportunitySummary, includedFindingIds: [includedId, includedId] },
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        opportunitySummary: { ...report.opportunitySummary, includedFindingIds: [includedId, "missing"] },
      }),
    ).toThrow(/unknown finding missing/);
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        opportunitySummary: { ...report.opportunitySummary, excludedFindingIds: [excludedId, includedId] },
      }),
    ).toThrow(/both included and excluded/);
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        opportunitySummary: { ...report.opportunitySummary, excludedFindingIds: [] },
      }),
    ).toThrow(/does not classify/);
    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        findings: report.findings.map((item) => (item.id === includedId ? { ...item, includedInOpportunityTotal: false } : item)),
      }),
    ).toThrow(/includedInOpportunityTotal is false/);

    const includedFinding = report.findings.find((item) => item.id === includedId)!;
    const ineligibleCases: Array<[string, Partial<ReportFinding>, RegExp]> = [
      ["low confidence", { confidence: "low" }, /low confidence/],
      ["verification-only", { impactClassification: "verification_only" }, /unsupported impact classification/],
      ["unknown cadence", { cadence: "unknown" }, /unsupported cadence unknown/],
      ["missing calculation", { calculationRef: undefined }, /no calculationRef/],
      ["broken calculation", { calculationRef: "missing_calc" }, /calculationRef is broken/],
    ];

    for (const [name, override, error] of ineligibleCases) {
      expect(
        () =>
          validateSingleStatementReportV1({
            ...report,
            findings: report.findings.map((item) => (item.id === includedFinding.id ? { ...item, ...override } : item)),
          }),
        name,
      ).toThrow(error);
    }
  });
});
