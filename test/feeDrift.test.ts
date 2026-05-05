import { describe, expect, it } from "vitest";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import { detectFeeDrift } from "../src/feeDrift.js";
import type { ParsedDocument } from "../src/parser.js";
import type { AnalysisSummary } from "../src/types.js";

function summary(overrides: Partial<AnalysisSummary> = {}): AnalysisSummary {
  return {
    businessType: "other",
    processorName: "Test Processor",
    sourceType: "csv",
    statementPeriod: "January 2026",
    executiveSummary: "",
    totalVolume: 10000,
    totalFees: 300,
    effectiveRate: 3,
    estimatedMonthlyVolume: 10000,
    estimatedMonthlyFees: 300,
    estimatedAnnualFees: 3600,
    estimatedAnnualSavings: 0,
    benchmark: { segment: "Other", lowerRate: 2, upperRate: 4, status: "within", deltaFromUpperRate: 0 },
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
      status: "not_applicable",
      confidence: 0,
    },
    structuredFeeFindings: [],
    bundledPricing: {
      active: false,
      buckets: [],
      highestRatePercent: null,
      totalVolumeUsd: null,
      totalFeesUsd: null,
      confidence: 0,
    },
    noticeFindings: [],
    repricingEvents: [],
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
    confidence: "medium",
    ...overrides,
  };
}

function doc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["content"],
    rows: [{ content: "Total Volume $10000" }, { content: "Total Fees $300" }],
    textPreview: "Total Volume $10000 Total Fees $300",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 2,
      amountTokenCount: 2,
      hasExtractableText: true,
    },
  };
}

describe("fee drift detection", () => {
  it("flags newly introduced recurring fees from normalized line-item facts", () => {
    const earlier = summary();
    const later = summary({
      feeBreakdown: [
        {
          label: "Customer Intelligence Suite",
          amount: 55,
          sharePct: 18.33,
          feeClass: "processor_service_add_on",
          broadType: "Service / compliance",
          sourceSection: "Account fees",
          evidenceLine: "Customer Intelligence Suite $55.00",
          classificationConfidence: "high",
        },
      ],
    });

    const drift = detectFeeDrift(earlier, later);

    expect(drift.status).toBe("warning");
    expect(drift.findings[0]).toMatchObject({
      kind: "recurring_fee_added",
      severity: "critical",
      normalizedKey: "customer_intelligence_suite",
      laterAmountUsd: 55,
    });
  });

  it("flags processor markup and authorization fee increases without relying on total-fee movement", () => {
    const earlier = summary({
      processorMarkupAudit: {
        rows: [],
        rowCount: 0,
        transactionCount: null,
        volume: null,
        totalPaid: 100,
        weightedAverageRateBps: null,
        effectiveRateBps: 45,
        confidence: 0.9,
      },
      perItemFeeModel: {
        transactionFee: null,
        authorizationFee: 0.1,
        allInPerItemFee: 0.1,
        components: [
          {
            kind: "authorization",
            amount: 0.1,
            sourceSection: "Authorization fees",
            evidenceLine: "Authorization fee $0.10",
            rowIndex: 1,
            confidence: 0.9,
          },
        ],
        confidence: 0.9,
      },
    });
    const later = summary({
      processorMarkupAudit: {
        rows: [],
        rowCount: 0,
        transactionCount: null,
        volume: null,
        totalPaid: 120,
        weightedAverageRateBps: null,
        effectiveRateBps: 58,
        confidence: 0.9,
      },
      perItemFeeModel: {
        transactionFee: null,
        authorizationFee: 0.2,
        allInPerItemFee: 0.2,
        components: [
          {
            kind: "authorization",
            amount: 0.2,
            sourceSection: "Authorization fees",
            evidenceLine: "Authorization fee $0.20",
            rowIndex: 1,
            confidence: 0.9,
          },
        ],
        confidence: 0.9,
      },
    });

    const drift = detectFeeDrift(earlier, later);

    expect(drift.findings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["rate_increase", "per_item_increase"]),
    );
    expect(drift.findings.find((finding) => finding.kind === "rate_increase")?.rateDeltaBps).toBe(13);
    expect(drift.findings.find((finding) => finding.kind === "per_item_increase")?.perItemDeltaUsd).toBe(0.1);
  });

  it("uses drift findings for the loaded cross-processor checklist rule when a prior month exists", async () => {
    const earlier = summary();
    const later = summary({
      feeBreakdown: [
        {
          label: "Gateway fee",
          amount: 19.95,
          sharePct: 6.65,
          feeClass: "processor_service_add_on",
          broadType: "Service / compliance",
          sourceSection: "Account fees",
          evidenceLine: "Gateway fee $19.95",
          classificationConfidence: "high",
        },
      ],
    });

    const checklist = await evaluateChecklistReport(doc(), later, { previousSummary: earlier });
    const driftRule = checklist.crossProcessor.results.find((result) => result.title.includes("fee drift"));

    expect(driftRule?.status).toBe("warning");
    expect(driftRule?.reason).toContain("fee drift finding");
    expect(driftRule?.evidence.join(" ")).toContain("Gateway fee");
  });
});
