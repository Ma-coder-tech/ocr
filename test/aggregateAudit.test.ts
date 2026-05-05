import { describe, expect, it } from "vitest";
import { buildAggregateAudit } from "../src/aggregateAudit.js";
import { collectFeeFacts } from "../src/feeFacts.js";
import type { AnalysisSummary } from "../src/types.js";
import type { StatementRecord } from "../src/accountStore.js";

type SummaryOptions = {
  volume?: number;
  totalFees?: number;
  benchmarkHigh?: number;
  processorMarkupAmount?: number | null;
  processorMarkupBps?: number | null;
  cardNetworkFees?: number | null;
  gatewayFee?: number | null;
};

function summary(period: string, options: SummaryOptions = {}): AnalysisSummary {
  const volume = options.volume ?? 10_000;
  const totalFees = options.totalFees ?? 260;
  const processorMarkupAmount = options.processorMarkupAmount === undefined ? 80 : options.processorMarkupAmount;
  const processorMarkupBps = options.processorMarkupBps === undefined ? 80 : options.processorMarkupBps;
  const cardNetworkFees = options.cardNetworkFees === undefined ? 130 : options.cardNetworkFees;
  const gatewayFee = options.gatewayFee ?? null;
  const effectiveRate = Number(((totalFees / volume) * 100).toFixed(2));
  const benchmarkHigh = options.benchmarkHigh ?? 3.2;

  return {
    businessType: "retail",
    processorName: "Test Processor",
    sourceType: "pdf",
    statementPeriod: period,
    executiveSummary: "Test summary",
    totalVolume: volume,
    totalFees,
    effectiveRate,
    estimatedMonthlyVolume: volume,
    estimatedMonthlyFees: totalFees,
    estimatedAnnualFees: totalFees * 12,
    estimatedAnnualSavings: 0,
    benchmark: {
      segment: "Retail benchmark",
      lowerRate: 1.8,
      upperRate: benchmarkHigh,
      status: effectiveRate > benchmarkHigh ? "above" : effectiveRate < 1.8 ? "below" : "within",
      deltaFromUpperRate: Number((effectiveRate - benchmarkHigh).toFixed(2)),
    },
    statementSections: [],
    interchangeAudit: {
      rows: [],
      rowCount: 0,
      transactionCount: null,
      volume: null,
      totalPaid: cardNetworkFees,
      weightedAverageRateBps: null,
      totalVariance: null,
      confidence: cardNetworkFees === null ? 0 : 0.8,
    },
    interchangeAuditRows: [],
    blendedFeeSplits: [],
    processorMarkupAudit: {
      rows: [],
      rowCount: processorMarkupBps === null && processorMarkupAmount === null ? 0 : 1,
      transactionCount: null,
      volume: processorMarkupAmount === null ? null : volume,
      totalPaid: processorMarkupAmount,
      weightedAverageRateBps: processorMarkupBps,
      effectiveRateBps: processorMarkupBps,
      confidence: processorMarkupBps === null && processorMarkupAmount === null ? 0 : 0.85,
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
    feeBreakdown: [
      ...(processorMarkupAmount === null
        ? []
        : [
            {
              label: "Processor Fees",
              amount: processorMarkupAmount,
              sharePct: 30,
              feeClass: "processor_markup" as const,
              broadType: "Processor" as const,
              classificationConfidence: "high" as const,
            },
          ]),
      ...(cardNetworkFees === null
        ? []
        : [
            {
              label: "Card Brand / Network Fees",
              amount: cardNetworkFees,
              sharePct: 50,
              feeClass: "card_brand_pass_through" as const,
              broadType: "Pass-through" as const,
              classificationConfidence: "high" as const,
            },
          ]),
      ...(gatewayFee === null
        ? []
        : [
            {
              label: "Gateway fee",
              amount: gatewayFee,
              sharePct: 8,
              feeClass: "processor_service_add_on" as const,
              broadType: "Service / compliance" as const,
              sourceSection: "Account fees",
              evidenceLine: `Gateway fee $${gatewayFee.toFixed(2)}`,
              classificationConfidence: "high" as const,
            },
          ]),
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
  };
}

function statement(id: number, period: string, options: SummaryOptions = {}): StatementRecord {
  const analysisSummary = summary(period, options);
  const processorMarkup = options.processorMarkupAmount === undefined ? 80 : options.processorMarkupAmount;
  const processorMarkupBps = options.processorMarkupBps === undefined ? 80 : options.processorMarkupBps;
  const cardNetworkFees = options.cardNetworkFees === undefined ? 130 : options.cardNetworkFees;

  return {
    id,
    merchantId: 1,
    slot: id as StatementRecord["slot"],
    periodKey: period,
    statementPeriod: period,
    processorName: "Test Processor",
    businessType: "retail",
    totalVolume: analysisSummary.totalVolume,
    totalFees: analysisSummary.totalFees,
    effectiveRate: analysisSummary.effectiveRate,
    analysisStatus: "completed",
    benchmarkVerdict: analysisSummary.benchmark.status,
    benchmarkLow: analysisSummary.benchmark.lowerRate,
    benchmarkHigh: analysisSummary.benchmark.upperRate,
    processorMarkup,
    processorMarkupBps,
    cardNetworkFees,
    analysisSummary,
    sourceJobId: `job-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function statements(count: number, optionsForIndex: (index: number) => SummaryOptions = () => ({})): StatementRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return statement(index + 1, `2025-${month}`, optionsForIndex(index));
  });
}

describe("aggregate audit engine", () => {
  it("produces a useful baseline from one statement", () => {
    const audit = buildAggregateAudit([statement(1, "2025-01", { totalFees: 280 })]);

    expect(audit.statementCount).toBe(1);
    expect(audit.trends.effective_rate.direction).toBe("baseline");
    expect(audit.bestMonth?.periodKey).toBe("2025-01");
    expect(audit.worstMonth?.periodKey).toBe("2025-01");
    expect(audit.verdict.status).toBe("watch");
  });

  it("handles two statements and surfaces newly added fees", () => {
    const audit = buildAggregateAudit([
      statement(1, "2025-01", { totalFees: 250 }),
      statement(2, "2025-02", { totalFees: 310, gatewayFee: 25 }),
    ]);

    expect(audit.statementCount).toBe(2);
    expect(audit.trends.total_fees.direction).toBe("up");
    expect(audit.feeChanges.newFees.some((fee) => fee.normalizedKey === "gateway_fee")).toBe(true);
    expect(audit.feeChanges.driftFindings.some((finding) => finding.normalizedKey === "gateway_fee")).toBe(true);
  });

  it("does not report synthetic processor markup rollups as new fees", () => {
    const audit = buildAggregateAudit([
      statement(1, "2025-01", { processorMarkupAmount: null, processorMarkupBps: null }),
      statement(2, "2025-02", { processorMarkupAmount: null, processorMarkupBps: 95 }),
    ]);

    expect(audit.trends.processor_markup.observedPointCount).toBe(1);
    expect(audit.feeChanges.newFees.some((fee) => fee.normalizedKey === "processor_markup_effective_rate")).toBe(false);
    expect(audit.feeChanges.driftFindings.some((finding) => finding.normalizedKey === "processor_markup_effective_rate")).toBe(false);
  });

  it("calculates average monthly trend changes over elapsed calendar months", () => {
    const audit = buildAggregateAudit([
      statement(1, "2025-01", { totalFees: 100 }),
      statement(2, "2025-12", { totalFees: 210 }),
    ]);

    expect(audit.trends.total_fees.absoluteDelta).toBe(110);
    expect(audit.trends.total_fees.averageMonthlyChange).toBe(10);
  });

  it("tracks new fees across a five-statement partial history", () => {
    const audit = buildAggregateAudit(statements(5, (index) => ({ gatewayFee: index >= 2 ? 19.95 : null })));

    const gateway = audit.feeChanges.newFees.find((fee) => fee.normalizedKey === "gateway_fee");
    expect(audit.statementCount).toBe(5);
    expect(gateway?.firstSeenPeriod).toBe("2025-03");
    expect(gateway?.monthsPresent).toBe(3);
    expect(audit.feeChanges.recurringNuisanceFees.some((fee) => fee.normalizedKey === "gateway_fee")).toBe(true);
  });

  it("degrades gracefully across seven statements with missing markup metrics", () => {
    const audit = buildAggregateAudit(
      statements(7, (index) => ({
        processorMarkupAmount: index % 2 === 0 ? null : 90,
        processorMarkupBps: index % 2 === 0 ? null : 90,
      })),
    );

    expect(audit.statementCount).toBe(7);
    expect(audit.trends.processor_markup.observedPointCount).toBe(3);
    expect(audit.coverage.missingMetricNotes.some((note) => note.includes("Processor markup"))).toBe(true);
    expect(audit.verdict.confidence).toBe("high");
  });

  it("handles twelve statements and models annualized benchmark overpayment", () => {
    const audit = buildAggregateAudit(
      statements(12, () => ({
        volume: 10_000,
        totalFees: 320,
        benchmarkHigh: 2.5,
      })),
    );

    expect(audit.statementCount).toBe(12);
    expect(audit.coverage.hasFullTwelveMonthHistory).toBe(true);
    expect(audit.benchmark.monthsAboveBenchmark).toBe(12);
    expect(audit.annualizedOverpayment.annualizedOverpaymentUsd).toBe(840);
    expect(audit.verdict.status).toBe("urgent");
  });

  it("preserves known fee amounts when a higher-priority fact has no amount", () => {
    const analysis = summary("2025-01");
    analysis.feeBreakdown = [
      {
        label: "PCI Non Compliance Fee",
        amount: 40,
        sharePct: 12,
        feeClass: "compliance_remediation",
        broadType: "Service / compliance",
        sourceSection: "Account fees",
        evidenceLine: "PCI Non Compliance Fee $40.00",
        classificationConfidence: "medium",
      },
    ];
    analysis.structuredFeeFindings = [
      {
        kind: "pci_non_compliance",
        label: "PCI Non Compliance",
        amountUsd: null,
        ratePercent: null,
        affectedVolumeUsd: null,
        estimatedImpactUsd: null,
        sourceSection: "Account fees",
        evidenceLine: "PCI Non Compliance",
        rowIndex: 1,
        confidence: 0.95,
      },
    ];

    expect(collectFeeFacts(analysis).get("pci_non_compliance")?.amountUsd).toBe(40);
  });
});
