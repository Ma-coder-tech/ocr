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

function advancedReviewMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ai: {
      status: "not_needed",
      provider: null,
      model: null,
      unresolvedInputRowCount: 0,
      suggestionCount: 0,
      appliedSuggestionCount: 0,
      skippedSuggestionCount: 0,
      notes: ["No V2 Fiserv fee rows required AI classification."],
    },
    benchmarkCategoryAi: {
      status: "not_needed",
      provider: null,
      model: null,
      attempted: false,
      applied: false,
      notes: ["Benchmark category was already resolved by user selection or deterministic statement evidence."],
    },
    aiNoticeExtraction: {
      status: "no_fee_changes",
      provider: "openai",
      model: "gpt-test",
      noticeCount: 0,
      feeChangeCount: 0,
      notes: ["No fee changes announced in this statement period."],
    },
    aiAnomalyReview: {
      status: "applied",
      provider: "openai",
      model: "gpt-test",
      attempted: true,
      anomalyCount: 0,
      notes: ["Required advanced statement review completed."],
    },
    aiMerchantNarrative: {
      status: "failed",
      provider: null,
      model: null,
      attempted: true,
      notes: ["Optional narrative was unavailable."],
    },
    ...overrides,
  };
}

function advancedFiservAnalysis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rows: [
      {
        rowIndex: 1,
        description: "Processor Pricing Review",
        amount: 20,
        feeType: "processor_fixed",
        sourceSection: "FEES",
        matchConfidence: "high",
        referenceId: null,
        proofStatus: "processor_controlled",
        expectedAmount: null,
        delta: null,
        reason: "Processor-controlled fee.",
        evidenceLine: "Processor Pricing Review 20.00",
      },
    ],
    findings: [
      {
        kind: "pricing_opportunity",
        severity: "high",
        title: "Processor pricing can be reviewed",
        amount: 20,
        evidence: ["Processor Pricing Review 20.00"],
        action: "negotiate_processor_rate",
        monthlyCost: 20,
        annualEstimate: 240,
        componentImpactEstimate: null,
      },
    ],
    estimatedAnnualSavings: {
      estimated: 240,
      confidence: "high",
      basis: "Supported advanced review estimate.",
      components: [
        {
          kind: "pricing_opportunity",
          label: "Processor pricing can be reviewed",
          annualImpact: 240,
          tier: "confirmed",
          confidence: "high",
          sourceFindingKind: "pricing_opportunity",
        },
      ],
    },
    ...advancedReviewMetadata(),
    ...overrides,
  };
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

function eligibleOpportunity(id: string, annual = 120): OpportunitySummary {
  return opportunity({
    deterministicMonthlyImpactUsd: annual / 12,
    deterministicAnnualImpactUsd: annual,
    totalEligibleMonthlyOpportunityUsd: annual / 12,
    totalEligibleAnnualOpportunityUsd: annual,
    annualizationBasis: "monthly_charge_times_12",
    includedFindingIds: [id],
  });
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
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.opportunitySummary.includedFindingIds).toEqual([]);
    expect(report.opportunitySummary.excludedFindingIds).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.positiveFindings).toEqual([]);
    expect(report.feeInventory).toMatchObject({ status: "unavailable", rows: [], observedRowCount: 0, displayedRowCount: 0, omissionReason: "not_extracted" });
    expect(report.feeComposition).toMatchObject({ status: "unavailable", rows: [], omissionReason: "not_extracted" });
    expect(report.details).toEqual({ evidence: [], calculations: [] });
    expect(report.componentVisibility.opportunity_summary).toMatchObject({ status: "hide", reason: "not_extracted" });
  });

  it("projects completed summaries that resolve unable_to_analyze into a non-financial diagnostic payload", () => {
    const base = summary();
    const report = buildSingleStatementReportV1({
      analysis: summary({
        structuredFeeFindings: [structuredFeeFinding({ kind: "pci_non_compliance", label: "Monthly PCI Non Compliance", amountUsd: 50 })],
        parserDecision: {
          ...base.parserDecision!,
          status: "needs_review",
          reportable: false,
          reason: "Blocked fixture.",
          validationState: {
            ...base.parserDecision!.validationState!,
            customerFacingTotalsAllowed: false,
            feeClassificationAllowed: false,
            blockingReasons: ["Top-level statement totals did not validate."],
          },
        },
      }),
      reportId: "unable-completed-summary",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("unable_to_analyze");
    expect(report.dataQuality.reasons.some((reason) => reason.severity === "critical")).toBe(true);
    expect(report.metrics.processedSales.value).toBeNull();
    expect(report.opportunitySummary).toMatchObject({
      deterministicAnnualImpactUsd: 0,
      estimatedAnnualOpportunityUsd: 0,
      totalEligibleAnnualOpportunityUsd: 0,
      verificationMonthlyAmountUsd: 0,
      includedFindingIds: [],
      excludedFindingIds: [],
    });
    expect(report.findings).toEqual([]);
    expect(report.benchmark.omissionReason).toBe("parser_blocked");
    expect(report.feeInventory).toMatchObject({ status: "unavailable", rows: [], omissionReason: "parser_blocked" });
    expect(report.feeComposition).toMatchObject({ status: "unavailable", rows: [], omissionReason: "parser_blocked" });
    expect(report.componentVisibility.fee_inventory).toMatchObject({ status: "hide", reason: "parser_blocked" });
    expect(report.verdict.title).toMatch(/Parser validation blocked/);
    expect(report.limitations).toEqual([
      expect.objectContaining({
        code: "partial_extraction",
        message: "RateReveal withheld financial conclusions because parser validation did not approve this statement.",
      }),
    ]);
    expect(report.details).toEqual({ evidence: [], calculations: [] });
    expect(() => validateSingleStatementReportV1(report)).not.toThrow();
  });

  it("blocks PDF summaries with a missing parser decision instead of trusting totals alone", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        parserDecision: undefined,
        structuredFeeFindings: [structuredFeeFinding({ kind: "pci_non_compliance", label: "Monthly PCI Non Compliance", amountUsd: 50 })],
      }),
      reportId: "missing-parser-decision",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("unable_to_analyze");
    expect(report.dataQuality.reportable).toBe(false);
    expect(report.dataQuality.customerFacingTotalsAllowed).toBe(false);
    expect(report.dataQuality.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "parser_decision_missing",
          severity: "critical",
          message: "RateReveal could not confirm parser validation for this statement, so customer-facing financial conclusions are withheld.",
        }),
      ]),
    );
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.benchmark.omissionReason).toBe("parser_blocked");
    expect(report.feeInventory.omissionReason).toBe("parser_blocked");
    expect(report.feeComposition.omissionReason).toBe("parser_blocked");
    expect(report.componentVisibility.benchmark).toMatchObject({ status: "hide", reason: "parser_blocked" });
    expect(report.verdict.title).toMatch(/Parser validation blocked/);
    expect(report.limitations[0]?.message).toBe("RateReveal withheld financial conclusions because parser validation did not approve this statement.");
  });

  it("uses one canonical non-parser omission reason for critical financial restrictions", () => {
    const base = summary();
    const report = buildSingleStatementReportV1({
      analysis: summary({
        parserDecision: {
          ...base.parserDecision!,
          status: "needs_review",
          reportable: false,
          reason: "Statement quality review blocked financial conclusions.",
        },
        dataQuality: [{ level: "critical", message: "Statement image quality was insufficient for financial reporting." }],
      }),
      reportId: "non-parser-financial-block",
      generatedAt: NOW,
    });

    expect(report.reportState).toMatchObject({ code: "unable_to_analyze", reasons: ["parser_blocked"] });
    expect(report.benchmark.omissionReason).toBe("insufficient_evidence");
    expect(report.feeInventory.omissionReason).toBe("insufficient_evidence");
    expect(report.feeComposition.omissionReason).toBe("insufficient_evidence");
    expect(report.componentVisibility.benchmark).toMatchObject({ status: "hide", reason: "insufficient_evidence" });
    expect(report.componentVisibility.fee_inventory).toMatchObject({ status: "hide", reason: "insufficient_evidence" });
    expect(report.componentVisibility.fee_composition).toMatchObject({ status: "hide", reason: "insufficient_evidence" });
    expect(report.componentVisibility.action_toolkit.message).toBe("Only retry guidance is available for this report state.");
    expect(report.verdict.title).toBe("We could not verify enough of this statement to produce a reliable report.");
    expect(report.actionToolkit.summary).toBe("Upload the complete original PDF or a clearer copy.");
    expect(report.limitations[0]?.message).toBe("RateReveal could not verify enough of this statement to produce a reliable financial report.");
    expect(
      JSON.stringify({
        benchmark: report.benchmark,
        feeInventory: report.feeInventory,
        feeComposition: report.feeComposition,
        componentVisibility: report.componentVisibility,
        verdict: report.verdict,
        actionToolkit: report.actionToolkit,
        limitations: report.limitations,
      }),
    ).not.toContain("parser_blocked");
  });

  it("suppresses eligible opportunity for low-confidence reports while preserving diagnostic fee rows", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        confidence: "low",
        parserDecision: {
          ...summary().parserDecision!,
          confidence: "low",
        },
        structuredFeeFindings: [structuredFeeFinding({ kind: "pci_non_compliance", label: "Monthly PCI Non Compliance", amountUsd: 50 })],
      }),
      reportId: "low-confidence-suppression",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("low_confidence");
    expect(report.componentVisibility.opportunity_summary.status).toBe("hide");
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.opportunitySummary.includedFindingIds).toEqual([]);
    expect(report.feeInventory.rows.length).toBeGreaterThan(0);
    expect(report.feeInventory.rows.every((row) => row.findingId === null && (row.relatedFindingIds ?? []).length === 0)).toBe(true);
    expect(() => validateSingleStatementReportV1(report)).not.toThrow();
  });

  it("suppresses eligible opportunity for reconciliation failures while preserving reconciliation diagnostics", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        structuredFeeFindings: [structuredFeeFinding({ kind: "pci_non_compliance", label: "Monthly PCI Non Compliance", amountUsd: 50 })],
        twoBucketAnalysis: {
          source: "summary_fee_rows",
          totalFees: 300,
          cardBrandTotal: 100,
          processorOwnedTotal: 50,
          processorControlledTotal: 50,
          unknownTotal: 0,
          cardBrandSharePct: null,
          processorOwnedSharePct: null,
          processorControlledSharePct: null,
          coveragePct: 100,
          reconciliationDeltaUsd: 150,
          available: true,
          reason: "Material reconciliation delta.",
          evidence: { totalFees: [], cardBrand: [], processorOwned: [] },
        },
      }),
      reportId: "reconciliation-suppression",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("reconciliation_failure");
    expect(report.componentVisibility.opportunity_summary.status).toBe("hide");
    expect(report.reconciliation.status).toBe("fail");
    expect(report.reconciliation.deltaUsd.value).toBe(150);
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.opportunitySummary.includedFindingIds).toEqual([]);
    expect(report.feeInventory.rows.length).toBeGreaterThan(0);
    expect(() => validateSingleStatementReportV1(report)).not.toThrow();
  });

  it("keeps verification-only findings out of healthy_with_opportunities and eligible opportunity", () => {
    const resolved = resolveReportState(
      resolveInput({
        findings: [finding({ id: "verify_only", impactClassification: "verification_only", currentMonthlyAmountUsd: 10, currentAnnualizedAmountUsd: 120 })],
        opportunitySummary: opportunity({ verificationMonthlyAmountUsd: 10, verificationAnnualizedAmountUsd: 120, excludedFindingIds: ["verify_only"] }),
      }),
    );
    expect(resolved.code).toBe("healthy");

    const material = resolveReportState(
      resolveInput({
        findings: [finding({ id: "verify_only", impactClassification: "verification_only", currentMonthlyAmountUsd: 30, currentAnnualizedAmountUsd: 360 })],
        opportunitySummary: opportunity({ verificationMonthlyAmountUsd: 30, verificationAnnualizedAmountUsd: 360, excludedFindingIds: ["verify_only"] }),
      }),
    );
    expect(material.code).toBe("verification_required");
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
    expect(
      resolveReportState(
        resolveInput({
          findings: [finding({ id: "small", includedInOpportunityTotal: true, estimatedAnnualImpactUsd: 120, currentAnnualizedAmountUsd: 120 })],
          opportunitySummary: eligibleOpportunity("small"),
        }),
      ).code,
    ).toBe("healthy_with_opportunities");
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
        resolveInput({
          findings: [finding({ id: "small", includedInOpportunityTotal: true, estimatedAnnualImpactUsd: 120, currentAnnualizedAmountUsd: 120 })],
          opportunitySummary: eligibleOpportunity("small"),
        }),
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

  it("allows a complete OpenAI-backed advanced review when Anthropic is absent or failed outside the final stage result", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        benchmark: { status: "above", lowerRate: 1.8, upperRate: 2.5, segment: "Retail benchmark", deltaFromUpperRate: 0.5 },
        dataQuality: [
          { level: "info", message: "AI full statement anomaly review status: applied via openai; anomalies 0." },
          { level: "info", message: "AI notice extraction status: no_fee_changes via openai; notices 0; fee changes 0." },
        ],
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          aiNoticeExtraction: {
            status: "no_fee_changes",
            provider: "openai",
            model: "gpt-test",
            noticeCount: 0,
            feeChangeCount: 0,
            notes: ["Anthropic notice extraction failed before OpenAI completed the review."],
          },
        }),
      }),
      reportId: "package-3-2-openai-success",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("above_benchmark_review");
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(240);
    expect(report.opportunitySummary.includedFindingIds).toEqual(["fiserv_v2_master_estimated_savings"]);
    expect(JSON.stringify(report.dataQuality.reasons)).not.toMatch(/openai|anthropic|api key|billing/i);
    expect(report.dataQuality.reasons.map((reason) => reason.message)).toContain("Advanced statement review status: applied; anomalies 0.");
  });

  it("downgrades parser-valid reports when a required advanced statement review stage is disabled", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          aiAnomalyReview: {
            status: "disabled",
            provider: null,
            model: null,
            attempted: false,
            anomalyCount: 0,
            notes: ["Advanced statement review was disabled."],
          },
        }),
      }),
      reportId: "package-3-2-disabled-required-review",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("low_confidence");
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.opportunitySummary.includedFindingIds).toEqual([]);
    expect(report.componentVisibility.opportunity_summary).toMatchObject({ status: "hide", reason: "low_confidence" });
    expect(report.dataQuality.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "advanced_anomaly_review_incomplete",
          severity: "warning",
          message: "RateReveal could not complete the required advanced statement review, so savings conclusions are withheld.",
        }),
      ]),
    );
  });

  it("downgrades parser-valid reports when a required advanced statement review stage fails", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          aiAnomalyReview: {
            status: "failed",
            provider: null,
            model: null,
            attempted: true,
            anomalyCount: 0,
            notes: ["Advanced statement review failed across configured providers."],
          },
        }),
      }),
      reportId: "package-3-2-failed-required-review",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("low_confidence");
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.findings.every((finding) => !finding.includedInOpportunityTotal)).toBe(true);
  });

  it("requires structured proof before accepting not_needed for required advanced review stages", () => {
    const valid = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          ai: {
            status: "not_needed",
            provider: null,
            model: null,
            unresolvedInputRowCount: 0,
            suggestionCount: 0,
            appliedSuggestionCount: 0,
            skippedSuggestionCount: 0,
            notes: ["No V2 Fiserv fee rows required AI classification."],
          },
        }),
      }),
      reportId: "package-3-2-valid-not-needed",
      generatedAt: NOW,
    });
    expect(valid.reportState.code).toBe("healthy_with_opportunities");
    expect(valid.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(240);

    const invalid = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          ai: {
            status: "not_needed",
            provider: null,
            model: null,
            unresolvedInputRowCount: 0,
            suggestionCount: 0,
            appliedSuggestionCount: 0,
            skippedSuggestionCount: 0,
            notes: [],
          },
        }),
      }),
      reportId: "package-3-2-invalid-not-needed",
      generatedAt: NOW,
    });
    expect(invalid.reportState.code).toBe("low_confidence");
    expect(invalid.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
  });

  it("downgrades older Fiserv summaries that lack structured advanced-review metadata without breaking validation", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: {
          rows: [
            {
              rowIndex: 1,
              description: "Legacy Processor Fee",
              amount: 20,
              feeType: "processor_fixed",
              sourceSection: "FEES",
              matchConfidence: "high",
              referenceId: null,
              proofStatus: "processor_controlled",
              expectedAmount: null,
              delta: null,
              reason: "Legacy summary predates structured advanced-review metadata.",
              evidenceLine: "Legacy Processor Fee 20.00",
            },
          ],
          findings: [
            {
              kind: "legacy_pricing_opportunity",
              severity: "high",
              title: "Legacy pricing opportunity",
              amount: 20,
              evidence: ["Legacy Processor Fee 20.00"],
              action: "negotiate_processor_rate",
              monthlyCost: 20,
              annualEstimate: 240,
              componentImpactEstimate: null,
            },
          ],
          estimatedAnnualSavings: {
            estimated: 240,
            confidence: "high",
            basis: "Legacy summary with no structured advanced-review metadata.",
            components: [{ kind: "legacy_pricing_opportunity", label: "Legacy pricing opportunity", annualImpact: 240, tier: "confirmed", confidence: "high", sourceFindingKind: "legacy_pricing_opportunity" }],
          },
        },
      }),
      reportId: "package-3-2-legacy-metadata-missing",
      generatedAt: NOW,
    });

    expect(report.reportState.code).toBe("low_confidence");
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.opportunitySummary.includedFindingIds).toEqual([]);
    expect(report.dataQuality.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "advanced_anomaly_review_incomplete",
        "advanced_notice_review_incomplete",
        "advanced_benchmark_review_incomplete",
        "advanced_fee_classification_incomplete",
      ]),
    );
  });

  it("downgrades notice review failures only when statement notice text required the advanced review", () => {
    const required = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          noticeText: "Important fee updates may apply.",
          aiNoticeExtraction: {
            status: "disabled",
            provider: null,
            model: null,
            noticeCount: 0,
            feeChangeCount: 0,
            notes: ["Advanced notice review was disabled."],
          },
        }),
      }),
      reportId: "package-3-2-notice-required",
      generatedAt: NOW,
    });
    expect(required.reportState.code).toBe("low_confidence");
    expect(required.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);

    const notNeeded = buildSingleStatementReportV1({
      analysis: summary({
        fiservFeeAnalysisV2: advancedFiservAnalysis({
          noticeText: "",
          aiNoticeExtraction: {
            status: "not_needed",
            provider: null,
            model: null,
            noticeCount: 0,
            feeChangeCount: 0,
            notes: ["No statement notice block was available for advanced extraction."],
          },
        }),
      }),
      reportId: "package-3-2-notice-not-needed",
      generatedAt: NOW,
    });
    expect(notNeeded.reportState.code).toBe("healthy_with_opportunities");
    expect(notNeeded.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(240);
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
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.benchmark.omissionReason).toBe("not_verified");
    expect(report.feeInventory).toMatchObject({ status: "unavailable", rows: [], omissionReason: "not_verified" });
    expect(report.feeComposition).toMatchObject({ status: "unavailable", rows: [], omissionReason: "not_verified" });
    expect(report.componentVisibility.opportunity_summary).toMatchObject({ status: "hide", reason: "not_verified" });
    expect(report.verdict.title).toBe("Core statement totals were not verified.");
    expect(report.limitations[0]?.message).toBe("RateReveal withheld financial conclusions because core statement totals were not verified.");
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

  it("validates Report V1 state invariants and rejects contradictory payloads", () => {
    const healthy = buildSingleStatementReportV1({ analysis: summary(), reportId: "state-invariants-healthy", generatedAt: NOW });
    expect(() =>
      validateSingleStatementReportV1({
        ...healthy,
        opportunitySummary: eligibleOpportunity("missing"),
      }),
    ).toThrow(/healthy must have zero eligible opportunity|unknown finding missing/);

    const eligible = buildSingleStatementReportV1({
      analysis: summary({
        structuredFeeFindings: [structuredFeeFinding({ kind: "risk_fee", label: "Monthly Risk Fee", amountUsd: 20, evidenceLine: "Monthly Risk Fee 20.00" })],
      }),
      reportId: "state-invariants-opportunity",
      generatedAt: NOW,
    });
    expect(eligible.reportState.code).toBe("healthy_with_opportunities");
    expect(eligible.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(240);
    expect(eligible.opportunitySummary.includedFindingIds.length).toBe(1);

    expect(() =>
      validateSingleStatementReportV1({
        ...eligible,
        findings: eligible.findings.map((item) => (item.includedInOpportunityTotal ? { ...item, impactClassification: "verification_only" } : item)),
      }),
    ).toThrow(/unsupported impact classification verification_only|requires at least one eligible/);

    const blocked = buildUnableToAnalyzeReportV1({ reportId: "state-invariants-blocked", generatedAt: NOW });
    expect(() =>
      validateSingleStatementReportV1({
        ...blocked,
        feeInventory: {
          ...blocked.feeInventory,
          status: "available",
        },
      }),
    ).toThrow(/unavailable empty fee inventory/);
  });

  it("enriches Fiserv fee inventory rows with evidence, calculation details, and verification relationships", () => {
    const evidenceLine = "Visa Assessment | volume 1000.00 | rate 0.12 | amount 12.00";
    const report = buildSingleStatementReportV1({
      analysis: summary({
        feeBreakdown: [],
        fiservFeeAnalysisV2: {
          ...advancedReviewMetadata(),
          rows: [
            {
              rowIndex: 7,
              description: "Visa Assessment",
              canonicalName: "Visa Assessment",
              amount: 12,
              volumeBasis: 1000,
              count: null,
              rate: 0.12,
              feeType: "card_brand_network_fee",
              sourceSection: "FEES",
              matchConfidence: "high",
              referenceId: "visa_assessment_reference",
              proofStatus: "indeterminate",
              expectedAmount: 10,
              delta: 2,
              reason: "Observed amount is above the explicit expected amount.",
              evidenceLine,
            },
          ],
          findings: [
            {
              kind: "rate_exceeds_reference",
              severity: "high",
              title: "Visa Assessment is above the reference amount",
              amount: 12,
              evidence: [evidenceLine],
              action: "request_pass_through_documentation",
              monthlyCost: 12,
              annualEstimate: 144,
              componentImpactEstimate: null,
            },
          ],
        },
      }),
      reportId: "package-2-fiserv-row",
      generatedAt: NOW,
    });

    const fee = report.feeInventory.rows.find((row) => row.originalLabel === "Visa Assessment")!;
    expect(fee).toMatchObject({
      observedAmountUsd: 12,
      observedRatePct: 0.12,
      comparisonTargetType: "network_schedule",
      differenceUsd: 2,
      findingId: expect.any(String),
    });
    expect(fee.relatedFindingIds).toEqual([fee.findingId]);
    expect(report.details.evidence.find((item) => item.id === fee.evidenceRefs[0])?.statementPage).toBeNull();
    expect(report.details.calculations.find((item) => item.id === fee.calculationRef)).toMatchObject({
      formulaCode: "observed_minus_expected_amount",
      result: 2,
    });
    expect(report.findings.find((finding) => finding.id === fee.findingId)?.feeRowIds).toContain(fee.id);
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(0);
  });

  it("uses relatedFindingIds for many-to-many fee relationships while keeping the primary link non-superseded", () => {
    const evidenceLine = "Monthly Platform Fee | amount 10.00";
    const report = buildSingleStatementReportV1({
      analysis: summary({
        feeBreakdown: [],
        fiservFeeAnalysisV2: {
          ...advancedReviewMetadata(),
          rows: [
            {
              rowIndex: 9,
              description: "Monthly Platform Fee",
              canonicalName: "Monthly Platform Fee",
              amount: 10,
              volumeBasis: null,
              count: null,
              rate: null,
              feeType: "processor_fixed",
              sourceSection: "FEES",
              matchConfidence: "high",
              referenceId: null,
              proofStatus: "processor_controlled",
              expectedAmount: null,
              delta: null,
              reason: "Processor-controlled fixed fee.",
              evidenceLine,
            },
          ],
          findings: [
            {
              kind: "junk_fee",
              severity: "warning",
              title: "Monthly Platform Fee is negotiable",
              amount: 10,
              evidence: [evidenceLine],
              action: "negotiate_processor_rate",
              monthlyCost: 10,
              annualEstimate: 120,
              componentImpactEstimate: null,
            },
          ],
          estimatedAnnualSavings: {
            estimated: 120,
            confidence: "high",
            basis: "Single supported master opportunity.",
            components: [{ kind: "junk_fee", label: "Monthly Platform Fee is negotiable", annualImpact: 120, tier: "confirmed", confidence: "high", sourceFindingKind: "junk_fee" }],
          },
        },
      }),
      reportId: "package-2-related-findings",
      generatedAt: NOW,
    });

    const fee = report.feeInventory.rows.find((row) => row.originalLabel === "Monthly Platform Fee")!;
    expect(fee.relatedFindingIds?.length).toBe(2);
    expect(fee.findingId).toBe("fiserv_v2_master_estimated_savings");
    expect(report.findings.find((finding) => finding.id === fee.findingId)?.supersedesFindingIds?.length).toBe(1);
    expect(report.opportunitySummary.includedFindingIds).toEqual(["fiserv_v2_master_estimated_savings"]);
    expect(report.opportunitySummary.totalEligibleAnnualOpportunityUsd).toBe(120);
  });

  it("preserves similar but distinct same-amount fee labels instead of suffix-deduping them", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        feeBreakdown: [
          {
            label: "Visa Assessment Fee",
            amount: 12,
            sharePct: 4,
            feeClass: "card_brand_pass_through",
            broadType: "Pass-through",
            sourceSection: "SUMMARY FEES",
            evidenceLine: "Visa Assessment Fee 12.00",
            classificationConfidence: "high",
          },
        ],
        fiservFeeAnalysisV2: {
          ...advancedReviewMetadata(),
          rows: [
            {
              rowIndex: 11,
              description: "Visa Assessment",
              amount: 12,
              feeType: "card_brand_network_fee",
              sourceSection: "DETAIL FEES",
              matchConfidence: "high",
              referenceId: null,
              proofStatus: "proven",
              expectedAmount: null,
              delta: null,
              reason: "Observed network assessment.",
              evidenceLine: "Visa Assessment 12.00",
            },
          ],
        },
      }),
      reportId: "package-2-distinct-similar-fees",
      generatedAt: NOW,
    });

    expect(report.feeInventory.rows.map((row) => row.originalLabel).sort()).toEqual(["Visa Assessment", "Visa Assessment Fee"]);
  });

  it("derives observed-versus-expected difference when explicit expected amount exists and delta is missing", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        feeBreakdown: [],
        fiservFeeAnalysisV2: {
          ...advancedReviewMetadata(),
          rows: [
            {
              rowIndex: 12,
              description: "Network Access Fee",
              amount: 15,
              feeType: "card_brand_network_fee",
              sourceSection: "FEES",
              matchConfidence: "high",
              referenceId: "network_access_reference",
              proofStatus: "indeterminate",
              expectedAmount: 9,
              delta: null,
              reason: "Explicit expected amount is available.",
              evidenceLine: "Network Access Fee 15.00",
            },
          ],
        },
      }),
      reportId: "package-2-missing-delta",
      generatedAt: NOW,
    });

    const fee = report.feeInventory.rows.find((row) => row.originalLabel === "Network Access Fee")!;
    const calculation = report.details.calculations.find((item) => item.id === fee.calculationRef)!;
    expect(fee.differenceUsd).toBe(6);
    expect(calculation.result).toBe(6);
  });

  it("ignores a supplied delta that disagrees with observed minus expected", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        feeBreakdown: [],
        fiservFeeAnalysisV2: {
          ...advancedReviewMetadata(),
          rows: [
            {
              rowIndex: 13,
              description: "Network Rate Fee",
              amount: 15,
              feeType: "card_brand_network_fee",
              sourceSection: "FEES",
              matchConfidence: "high",
              referenceId: "network_rate_reference",
              proofStatus: "indeterminate",
              expectedAmount: 9,
              delta: 99,
              reason: "Parser supplied delta disagrees with observed minus expected.",
              evidenceLine: "Network Rate Fee 15.00",
            },
          ],
        },
      }),
      reportId: "package-2-disagreeing-delta",
      generatedAt: NOW,
    });

    const fee = report.feeInventory.rows.find((row) => row.originalLabel === "Network Rate Fee")!;
    const calculation = report.details.calculations.find((item) => item.id === fee.calculationRef)!;
    expect(fee.differenceUsd).toBe(6);
    expect(calculation.result).toBe(6);
  });

  it("rejects fee row differences that do not match the referenced calculation result", () => {
    const report = buildSingleStatementReportV1({
      analysis: summary({
        feeBreakdown: [],
        fiservFeeAnalysisV2: {
          ...advancedReviewMetadata(),
          rows: [
            {
              rowIndex: 14,
              description: "Network Difference Fee",
              amount: 15,
              feeType: "card_brand_network_fee",
              sourceSection: "FEES",
              matchConfidence: "high",
              referenceId: "network_difference_reference",
              proofStatus: "indeterminate",
              expectedAmount: 9,
              delta: 6,
              reason: "Explicit expected amount is available.",
              evidenceLine: "Network Difference Fee 15.00",
            },
          ],
        },
      }),
      reportId: "package-2-difference-validation",
      generatedAt: NOW,
    });
    const fee = report.feeInventory.rows.find((row) => row.originalLabel === "Network Difference Fee")!;

    expect(() =>
      validateSingleStatementReportV1({
        ...report,
        feeInventory: {
          ...report.feeInventory,
          rows: report.feeInventory.rows.map((row) => (row.id === fee.id ? { ...row, differenceUsd: 5 } : row)),
        },
      }),
    ).toThrow(/differenceUsd 5 does not match calculation/);
  });
});
