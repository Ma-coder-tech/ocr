import { describe, expect, it } from "vitest";
import { buildComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import type { AnalysisSummary } from "../src/types.js";

function summary(overrides: Partial<AnalysisSummary> = {}): AnalysisSummary {
  return {
    businessType: "restaurant_food_beverage",
    processorName: "Wells Fargo",
    sourceType: "pdf",
    statementPeriod: "2024-09",
    executiveSummary: "",
    totalVolume: 177400.72,
    totalFees: 2954.38,
    effectiveRate: 1.665371,
    estimatedMonthlyVolume: 177400.72,
    estimatedMonthlyFees: 2954.38,
    estimatedAnnualFees: 35452.56,
    estimatedAnnualSavings: 1485.72,
    benchmark: { segment: "Restaurant benchmark", lowerRate: 2, upperRate: 3, status: "below", deltaFromUpperRate: -1.33 },
    statementSections: [],
    interchangeAudit: {} as AnalysisSummary["interchangeAudit"],
    interchangeAuditRows: [],
    blendedFeeSplits: [],
    processorMarkupAudit: {} as AnalysisSummary["processorMarkupAudit"],
    hiddenMarkupAudit: {} as AnalysisSummary["hiddenMarkupAudit"],
    structuredFeeFindings: [],
    bundledPricing: {} as AnalysisSummary["bundledPricing"],
    noticeFindings: [],
    downgradeAnalysis: {} as AnalysisSummary["downgradeAnalysis"],
    perItemFeeModel: {} as AnalysisSummary["perItemFeeModel"],
    guideMeasures: {} as AnalysisSummary["guideMeasures"],
    level3Optimization: {} as AnalysisSummary["level3Optimization"],
    kpis: [],
    feeBreakdown: [],
    suspiciousFees: [],
    savingsOpportunities: [],
    negotiationChecklist: [],
    actionPlan: [],
    trend: [],
    dataQuality: [{ level: "info", message: "Validated parser output was used." }],
    dynamicFields: [],
    insights: [],
    confidence: "high",
    parserSource: {
      driverId: "fiserv_first_data_full_statement",
      driverName: "Fiserv full statement",
      processorFamily: "Fiserv / First Data",
      statementFamily: "fiserv_first_data_full_statement",
    },
    parserDecision: {
      status: "accepted_with_warnings",
      reason: "Accepted with parser caveat(s).",
      confidence: "high",
      reportable: true,
    },
    ...overrides,
  } as AnalysisSummary;
}

describe("multi-statement comparison input adapter", () => {
  it("normalizes a rich single-statement analysis into comparison-ready input", () => {
    const input = buildComparisonStatementInput(
      summary({
        fiservFeeAnalysisV2: {
          pricingModel: { pricingModel: "interchange_plus", confidence: "high" },
          processorMarkupAnalysis: { processorControlledTotal: 526.48 },
          merchantChannelAnalysis: { merchantChannel: "card_present" },
          authorizationAnalysis: { transactionCount: 4138 },
          estimatedAnnualSavings: {
            conservative: 123.45,
            estimated: 1485.72,
            maximum: 2000,
          },
          rows: [
            {
              cardTypeSection: "VISA",
              description: "VISA WATS AUTH FEE",
              normalizedDescription: "WATS AUTH FEE",
              canonicalName: "WATS AUTH FEE",
              amount: 378.84,
              volumeBasis: null,
              count: 3444,
              rate: 0.11,
              feeType: "processor_per_item",
              sourceSection: "TRANSACTION FEES",
              evidenceLine: "VISA WATS AUTH FEE | 3444 TRANSACTIONS AT .110000 | Fees | -$378.84",
            },
            {
              cardTypeSection: "MASTERCARD",
              description: "MC WATS AUTH FEE",
              normalizedDescription: "WATS AUTH FEE",
              canonicalName: "WATS AUTH FEE",
              amount: 68.31,
              volumeBasis: null,
              count: 621,
              rate: 0.11,
              feeType: "processor_per_item",
              sourceSection: "TRANSACTION FEES",
              evidenceLine: "MC WATS AUTH FEE | 621 TRANSACTIONS AT .110000 | Fees | -$68.31",
            },
          ],
          aiNoticeExtraction: {
            notices: [
              {
                feeName: "WATS AUTH FEE",
                noticeType: "fee_increase",
                amount: { value: 0.13, valueType: "money", cadence: "per_item" },
                effectiveDate: "2025-01",
                confidence: "high",
                evidence: ["WATS AUTH FEE will increase to $0.13 effective January 2025."],
              },
            ],
          },
          findings: [
            {
              kind: "per_auth_fee_benchmark",
              title: "Authorization fee is above benchmark",
              severity: "warning",
              amount: 488,
              monthlyCost: 123.81,
              annualEstimate: 1485.72,
              action: "negotiate_processor_rate",
              evidence: ["Dominant per-auth fee is $0.11."],
            },
          ],
          disputeActivityAnalysis: {
            chargebackCount: 1,
            chargebackFeeTotal: 25,
            achRejectCount: 0,
            achRejectFeeTotal: 0,
            totalDisputeCost: 25,
          },
        },
      }),
      {
        sourceAnalysisId: "analysis_1",
        pipelineVersion: "2026-07-05",
        merchant: {
          id: "merchant_1",
          merchantNumber: "324136827999",
          merchantName: "EL NUEVO TEQUILA MEXICAN",
          isoName: "Wells Fargo",
          address: "Example address",
        },
      },
    );

    expect(input.sourceAnalysisId).toBe("analysis_1");
    expect(input.merchant).toMatchObject({
      id: "merchant_1",
      merchantName: "EL NUEVO TEQUILA MEXICAN",
      processorPlatform: "Fiserv / First Data",
      merchantChannel: "card_present",
    });
    expect(input.financials).toMatchObject({
      effectiveRate: 0.01665371,
      rateUnit: "decimal",
      totalTransactions: 4138,
      averageTicket: 42.87,
    });
    expect(input.processorControlledPct).toBeCloseTo(0.00296774, 8);
    expect(input.estimatedAnnualSavings).toEqual({ conservative: 123.45, estimated: 1485.72, maximum: 2000 });
    expect(input.fees).toHaveLength(2);
    expect(input.fees[0]).toMatchObject({
      compositeKey: "wats_auth_fee__visa",
      feeFamilyKey: "wats_auth_fee",
      source: "fiserv_fee_analysis_v2",
    });
    expect(input.fees[1]).toMatchObject({
      compositeKey: "wats_auth_fee__mastercard",
      feeFamilyKey: "wats_auth_fee",
    });
    expect(input.notices[0]).toMatchObject({
      noticeType: "fee_increase",
      feeName: "WATS AUTH FEE",
      amount: 0.13,
      cadence: "per_item",
      source: "ai_notice_extraction",
    });
    expect(input.findings[0]).toMatchObject({
      fingerprint: "per_auth_fee_benchmark__authorization_fee_is_above_benchmark__negotiable",
      savingsTier: "negotiable",
    });
    expect(input.disputes.totalDisputeCost).toBe(25);
    expect(input.parserDecision?.reportable).toBe(true);
    expect(input.dataQuality).toHaveLength(1);
  });

  it("falls back to summary fee breakdown when normalized fee analysis rows are absent", () => {
    const input = buildComparisonStatementInput(
      summary({
        effectiveRate: 0.025,
        feeBreakdown: [
          {
            label: "Monthly Service Charge",
            amount: 10,
            sharePct: 0.34,
            feeClass: "processor_service_add_on",
            broadType: "Service / compliance",
            sourceSection: "MISC",
            evidenceLine: "MONTHLY SERVICE CHARGE | Fees | -$10.00",
            classificationConfidence: "high",
          },
        ],
      }),
    );

    expect(input.financials.effectiveRate).toBe(0.025);
    expect(input.fees).toEqual([
      expect.objectContaining({
        compositeKey: "monthly_service_charge__misc",
        feeFamilyKey: "monthly_service_charge",
        feeType: "processor_service_add_on",
        source: "summary_fee_breakdown",
      }),
    ]);
    expect(input.processorControlledTotal).toBeNull();
    expect(input.processorControlledPct).toBeNull();
  });
});
