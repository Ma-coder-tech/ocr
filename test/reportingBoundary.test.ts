import { describe, expect, it } from "vitest";
import { buildSingleStatementCustomerReport } from "../src/reporting/index.js";
import type { AnalysisSummary } from "../src/types.js";

function summary(overrides: Partial<AnalysisSummary> = {}): AnalysisSummary {
  return {
    businessType: "retail",
    processorName: "Clover",
    sourceType: "pdf",
    statementPeriod: "2024-10",
    executiveSummary: "Internal summary",
    totalVolume: 10000,
    totalFees: 300,
    estimatedMonthlyVolume: 10000,
    estimatedMonthlyFees: 300,
    estimatedAnnualFees: 3600,
    estimatedAnnualSavings: 0,
    effectiveRate: 3,
    benchmark: { status: "within", lowerRate: 2, upperRate: 4, segment: "Retail benchmark", deltaFromUpperRate: 0 },
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
    feeBreakdown: [],
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
    },
    ...overrides,
  } as AnalysisSummary;
}

describe("single-statement customer report boundary", () => {
  it("does not expose checklist diagnostics or raw rule ids in the customer DTO", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({
        checklistReport: {
          extractionMode: "structured",
          extractionQualityScore: 90,
          extractionReasons: ["internal reason"],
          processorDetection: {
            detectedProcessorId: "clover",
            detectedProcessorName: "Clover",
            rulePackId: "clover",
            confidence: 0.9,
            matchedKeywords: ["clover"],
            source: "text_preview",
          },
          universal: {
            total: 1,
            pass: 0,
            fail: 1,
            warning: 0,
            unknown: 0,
            notApplicable: 0,
            results: [{ id: "internal_rule_id", title: "Internal rule", status: "fail", reason: "Diagnostic", evidence: ["raw"] }],
          },
          processorSpecific: {
            total: 0,
            pass: 0,
            fail: 0,
            warning: 0,
            unknown: 0,
            notApplicable: 0,
            results: [],
            processorId: "clover",
            processorName: "Clover",
          },
          crossProcessor: { total: 0, pass: 0, fail: 0, warning: 0, unknown: 0, notApplicable: 0, results: [] },
        },
      }),
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("internal_rule_id");
    expect(serialized).not.toContain("Diagnostic");
    expect(serialized).not.toContain("matchedKeywords");
  });

  it("blocks reports when core totals are unusable", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({ totalVolume: 0, totalFees: 0, effectiveRate: 0 }),
    });

    expect(report.buildState).toBe("blocked");
    expect(report.situation).toBe("data_limited");
  });

  it("blocks PDF reports when no validated parser decision is attached", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({ parserDecision: undefined }),
    });

    expect(report.buildState).toBe("blocked");
    expect(report.dataQuality.message).toContain("validated parser decision");
  });

  it("continues to allow non-PDF summaries without parser decisions", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({ sourceType: "csv", parserDecision: undefined }),
    });

    expect(report.buildState).toBe("complete");
  });

  it("returns fallback instead of an exact two-bucket split when coverage does not reconcile", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_full",
      analysis: summary({
        totalFees: 300,
        interchangeAudit: {
          rows: [],
          rowCount: 0,
          transactionCount: null,
          volume: null,
          totalPaid: 50,
          weightedAverageRateBps: null,
          totalVariance: null,
          confidence: 0.9,
        },
        feeBreakdown: [
          {
            label: "Visa Interchange",
            amount: 50,
            sharePct: 16.67,
            feeClass: "card_brand_pass_through",
            broadType: "Pass-through",
            classificationConfidence: "high",
          },
          {
            label: "Processor Markup",
            amount: 25,
            sharePct: 8.33,
            feeClass: "processor_markup",
            broadType: "Processor",
            classificationConfidence: "high",
          },
        ],
      }),
    });

    expect(report.sections.find((section) => section.id === "two_bucket_split")?.displayMode).toBe("fallback");
  });

  it("uses canonical two-bucket analysis even when summary fee rows cannot reconstruct the split", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({
        totalFees: 300,
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
        feeBreakdown: [],
        twoBucketAnalysis: {
          source: "statement_text",
          totalFees: 300,
          cardBrandTotal: 180,
          processorOwnedTotal: 120,
          processorControlledTotal: 120,
          unknownTotal: 0,
          cardBrandSharePct: 60,
          processorOwnedSharePct: 40,
          processorControlledSharePct: 40,
          coveragePct: 100,
          reconciliationDeltaUsd: 0,
          available: true,
          reason: "Card-brand and processor-controlled totals reconcile to total fees with delta 0.00.",
          evidence: {
            totalFees: [],
            cardBrand: [],
            processorOwned: [],
          },
        },
      }),
    });

    const section = report.sections.find((item) => item.id === "two_bucket_split");
    expect(section?.displayMode).toBe("exact");
    expect(section?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "card_brand_total", rawValue: 180 }),
        expect.objectContaining({ id: "processor_controlled_total", rawValue: 120 }),
      ]),
    );
  });

  it("keeps fallback when canonical two-bucket analysis does not reconcile", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({
        totalFees: 300,
        feeBreakdown: [],
        twoBucketAnalysis: {
          source: "statement_text",
          totalFees: 300,
          cardBrandTotal: 50,
          processorOwnedTotal: 25,
          processorControlledTotal: 25,
          unknownTotal: null,
          cardBrandSharePct: null,
          processorOwnedSharePct: null,
          processorControlledSharePct: null,
          coveragePct: 25,
          reconciliationDeltaUsd: 225,
          available: false,
          reason: "Two-bucket totals do not reconcile tightly enough to total fees (delta 225.00).",
          evidence: {
            totalFees: [],
            cardBrand: [],
            processorOwned: [],
          },
        },
      }),
    });

    expect(report.sections.find((section) => section.id === "two_bucket_split")?.displayMode).toBe("fallback");
  });

  it("keeps low-confidence findings out of teaser and never annualizes teaser findings", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "free_teaser",
      analysis: summary({
        structuredFeeFindings: [
          {
            kind: "pci_non_compliance",
            label: "PCI Non Compliance",
            amountUsd: 24.95,
            ratePercent: null,
            affectedVolumeUsd: null,
            estimatedImpactUsd: 24.95,
            sourceSection: "fees",
            evidenceLine: "PCI Non Compliance Fee 24.95",
            rowIndex: 1,
            confidence: 0.55,
          },
        ],
      }),
    });

    expect(report.findings.some((finding) => finding.title === "PCI non-compliance fee")).toBe(false);
    expect(report.findings.every((finding) => finding.annualImpact === undefined)).toBe(true);
  });

  it("allows medium-confidence findings in the full report with cautious copy", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_full",
      analysis: summary({
        structuredFeeFindings: [
          {
            kind: "customer_intelligence_suite",
            label: "Customer Intelligence Suite",
            amountUsd: 19.95,
            ratePercent: null,
            affectedVolumeUsd: null,
            estimatedImpactUsd: 19.95,
            sourceSection: "fees",
            evidenceLine: "Customer Intelligence Suite 19.95",
            rowIndex: 1,
            confidence: 0.7,
          },
        ],
      }),
    });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Recurring service fee",
          description: "A recurring service fee appears. Confirm whether this service is active.",
          confidence: "medium",
        }),
      ]),
    );
  });
});
