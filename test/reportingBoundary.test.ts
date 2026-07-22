import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePdf } from "../src/parser.js";
import { buildSingleStatementCustomerReport } from "../src/reporting/index.js";
import { analyzeStatementDocumentWithOptionalAi } from "../src/statementParserOrchestrator.js";
import type { AnalysisSummary } from "../src/types.js";
import { buildResultsViewModel, type JobResponse } from "../web/src/reportAdapter.js";

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

async function phase1FixtureReport(input: {
  fixtureName: string;
  businessType: AnalysisSummary["businessType"];
  businessLabel: string;
  merchantName: string;
}) {
  const filePath = path.resolve(process.cwd(), "test", "fixtures", "pdfs", input.fixtureName);
  const parsed = await parsePdf(filePath);
  const analysis = await analyzeStatementDocumentWithOptionalAi(parsed, input.businessType, { sourceFileName: input.fixtureName });
  const report = buildSingleStatementCustomerReport({
    kind: "single_statement_result",
    analysis,
    context: { merchantName: input.merchantName },
  });
  const viewModel = buildResultsViewModel(
    {
      id: `job-${input.fixtureName}`,
      fileName: input.fixtureName,
      businessType: input.businessType,
      status: "completed",
      progress: 100,
      error: null,
      summary: analysis,
      customerReport: report,
    } satisfies JobResponse,
    input.businessLabel,
  );

  return { analysis, report, viewModel };
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

describe("single-statement customer report boundary", () => {
  it("normalizes a clean report without visible savings or visible findings", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary(),
    });

    expect(report.state).toBe("Clean");
    expect(report.findings).toEqual([]);
    expect(report.savings).toMatchObject({ annualAmount: 0, displayAmount: null, basis: "visible_findings" });
    expect(report.positiveFindings.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes an actionable report and derives savings only from visible finding impact", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
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
            confidence: 0.9,
          },
        ],
      }),
    });

    expect(report.state).toBe("Actionable");
    expect(report.findings).toHaveLength(1);
    expect(report.savings.annualAmount).toBe(299.4);
    expect(report.savings.displayAmount).toBe("$299/yr");
  });

  it("turns an above-benchmark report with no line-item fixes into a visible action state", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary({
        effectiveRate: 4.5,
        benchmark: { status: "above", lowerRate: 2, upperRate: 3, segment: "Retail benchmark", deltaFromUpperRate: 1.5 },
      }),
    });

    expect(report.state).toBe("Actionable");
    expect(report.findings).toEqual([expect.objectContaining({ id: "benchmark_rate_above", severity: "watch" })]);
    expect(report.savings.annualAmount).toBe(0);
  });

  it("keeps limited reports from rendering exact metrics, savings, or positive findings", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary({ totalVolume: 0, totalFees: 0, effectiveRate: 0 }),
    });

    expect(report.state).toBe("Limited");
    expect(report.metrics).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.positiveFindings).toEqual([]);
    expect(report.savings.annualAmount).toBe(0);
  });

  it("populates positive findings from at least four verified healthy signals", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary({
        benchmark: { status: "below", lowerRate: 2, upperRate: 4, segment: "Retail benchmark", deltaFromUpperRate: -0.25 },
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
          evidence: { totalFees: [], cardBrand: [], processorOwned: [] },
        },
        fiservFeeAnalysisV2: {
          findings: [
            {
              kind: "authorization_ratio_healthy",
              severity: "info",
              title: "Authorization-to-transaction ratio is healthy",
              amount: null,
              evidence: ["No issue."],
            },
          ],
        },
      }),
    });

    expect(report.positiveFindings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "positive_rate_within_benchmark",
        "positive_itemized_pricing",
        "positive_fee_split_readable",
        "positive_authorization_ratio_healthy",
      ]),
    );
  });

  it("does not let the web adapter render raw summary numbers when the DTO withheld metrics", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary({ totalVolume: 0, totalFees: 0, effectiveRate: 0 }),
    });
    const viewModel = buildResultsViewModel(
      {
        id: "job-1",
        fileName: "statement.pdf",
        businessType: "retail",
        status: "completed",
        progress: 100,
        error: null,
        summary: summary({ totalVolume: 10000, totalFees: 300, effectiveRate: 3 }),
        customerReport: report,
      } satisfies JobResponse,
      "Retail",
    );

    expect(viewModel.stats.effectiveRate).toBeNull();
    expect(viewModel.stats.totalFees).toBeNull();
    expect(viewModel.stats.volume).toBeNull();
    expect(viewModel.pricing).toBeNull();
  });

  it("keeps the business picker from offering a generic Other card", () => {
    const appSource = readFileSync(new URL("../web/src/App.tsx", import.meta.url), "utf8");

    expect(appSource).not.toContain('id: "other"');
    expect(appSource).not.toContain('label: "Other"');
  });

  it("renders Phase 1 test statements 1 and 2 without the visible report regressions", async () => {
    const elNuevo = await phase1FixtureReport({
      fixtureName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
      businessType: "restaurant_food_beverage",
      businessLabel: "Restaurant",
      merchantName: "El Nuevo Tequila Mexican",
    });
    const xpressFix = await phase1FixtureReport({
      fixtureName: "fiserv_ABDUL_BASHER_Aug_2025.pdf",
      businessType: "professional_services",
      businessLabel: "Professional services",
      merchantName: "XPRESS FIX",
    });

    expect(elNuevo.report.state).toBe("Actionable");
    expect(elNuevo.viewModel.benchmark.label).toBe("Below benchmark (2.20%–3.80%)");
    expect(elNuevo.viewModel.stats.totalFees).toBe("$2,954");
    expect(elNuevo.viewModel.stats.annualSavings).toMatch(/^\$[\d,]+$/);
    expect(elNuevo.viewModel.stats.annualSavings).not.toContain(".");
    expect(elNuevo.report.findings.map((finding) => finding.title)).toEqual(
      expect.arrayContaining([
        "Mastercard assessment fee needs documentation.",
        "Network authorization fee needs documentation.",
      ]),
    );
    expect(elNuevo.report.findings.find((finding) => finding.title === "Network authorization fee needs documentation.")?.description).not.toContain(
      "processor-controlled per-transaction fee",
    );

    for (const { report, viewModel } of [elNuevo, xpressFix]) {
      const titles = report.findings.map((finding) => finding.title);
      expect(new Set(titles).size).toBe(titles.length);
      for (const question of viewModel.actionItems.processorQuestions) {
        for (const title of titles) expect(question).not.toContain(title);
      }
      for (const finding of report.findings) {
        if (!finding.evidenceSummary) continue;
        const description = normalizedText(finding.description);
        const evidence = normalizedText(finding.evidenceSummary);
        expect(description === evidence || description.startsWith(evidence) || evidence.startsWith(description)).toBe(false);
      }
    }

    expect(xpressFix.report.state).toBe("Actionable");
    expect(xpressFix.viewModel.stats.totalFees).toBe("$91");
    expect(xpressFix.viewModel.stats.annualSavings).toBe("$335");
    expect(xpressFix.viewModel.stats.annualSavings).not.toBe("$337");
  }, 30_000);

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
          title: "Cancel this service if you don't use it.",
          description: "Confirm whether this service is active, contracted, and useful. If not, ask to cancel it and remove the fee.",
          confidence: "medium",
        }),
      ]),
    );
  });

  it("bridges customer-actionable Fiserv V2 findings into the RateReveal result", () => {
    const report = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary({
        structuredFeeFindings: [],
        suspiciousFees: [],
        fiservFeeAnalysisV2: {
          findings: [
            {
              kind: "junk_fee",
              severity: "warning",
              title: "REGULATORY PRODUCT is avoidable or negotiable",
              amount: 3.95,
              evidence: ["REGULATORY PRODUCT | -$3.95"],
            },
            {
              kind: "per_auth_fee_benchmark",
              severity: "warning",
              title: "Per-authorization fee is above competitive benchmark",
              amount: 123.81,
              evidence: ["Processor per-auth fees are above benchmark."],
            },
            {
              kind: "authorization_ratio_healthy",
              severity: "info",
              title: "Authorization-to-transaction ratio is healthy",
              amount: null,
              evidence: ["No issue."],
            },
            {
              kind: "rate_exceeds_reference",
              severity: "warning",
              title: "Tiny network fee exceeds the reference rate",
              amount: 0.01,
              evidence: ["Tiny item."],
            },
          ],
          estimatedAnnualSavings: {
            components: [
              {
                kind: "junk_fee",
                label: "REGULATORY PRODUCT is avoidable or negotiable",
                annualImpact: 47.4,
                tier: "confirmed",
                confidence: "high",
                sourceFindingKind: "junk_fee",
              },
              {
                kind: "per_auth_fee_benchmark",
                label: "Per-authorization fee is above competitive benchmark",
                annualImpact: 1485.72,
                tier: "negotiable",
                confidence: "medium",
                sourceFindingKind: "per_auth_fee_benchmark",
              },
              {
                kind: "rate_exceeds_reference",
                label: "Tiny network fee exceeds the reference rate",
                annualImpact: 0.12,
                tier: "investigative",
                confidence: "low",
                sourceFindingKind: "rate_exceeds_reference",
              },
            ],
          },
        },
      }),
    });

    expect(report.situation).toBe("within_with_flags");
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Ask to remove the regulatory product.",
          annualImpact: "$47.40",
          severity: "fix",
        }),
        expect.objectContaining({
          title: "Your per-transaction fee is high. Negotiate this.",
          annualImpact: "$1,485.72",
          severity: "watch",
        }),
      ]),
    );
    expect(report.findings.some((finding) => finding.title.includes("Authorization-to-transaction"))).toBe(false);
    expect(report.findings.some((finding) => finding.title.includes("Tiny Network"))).toBe(false);
  });
});
