import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "../src/parser.js";
import type { AnalysisSummary } from "../src/types.js";
import { refineTextOnlyPdfSummary } from "../src/pdfHeuristic.js";

function createBaseSummary(): AnalysisSummary {
  return {
    businessType: "other",
    processorName: "Worldpay",
    sourceType: "pdf",
    statementPeriod: "Not reliably extractable from current PDF text layer",
    executiveSummary: "",
    totalVolume: 0,
    totalFees: 0,
    effectiveRate: 0,
    estimatedMonthlyVolume: 0,
    estimatedMonthlyFees: 0,
    estimatedAnnualFees: 0,
    estimatedAnnualSavings: 0,
    benchmark: {
      segment: "Other benchmark",
      lowerRate: 2,
      upperRate: 4,
      status: "within",
      deltaFromUpperRate: 0,
    },
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
    perItemFeeModel: {
      transactionFee: null,
      authorizationFee: null,
      allInPerItemFee: null,
      components: [],
      confidence: 0,
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
    confidence: "low",
  };
}

describe("pdf heuristic recovery", () => {
  it("recovers totals from searchable PDFs when structured extraction is unavailable", () => {
    const doc: ParsedDocument = {
      sourceType: "pdf",
      headers: ["content"],
      rows: [
        { content: "PROCESSING MONTH:JUN 2018" },
        { content: "DEPOSIT SUMMARY" },
        { content: "Process Date Number Trans | Net Sales | Adjustments | Chargebacks | Disc 3rd Party Funded | Net Deposits" },
        { content: "Deposits Total | l28 | J 8,044.42 | 0.00 | 0.00 | 0.00 | 0.00" },
        { content: "18,044.42" },
        { content: "PROCESSINGACTIVITY SUMMARY" },
        { content: "Card Type | Number of Amouutof | Number of Amount of | Net Sales | Average Disc Per | Disc% | Processing" },
        { content: "Sales | Safos | Credits | Credits | Ticket | Hem | Fe.es" },
        { content: "AMEXOPTBLUE | JO | 2,208.92 | 0 | 0.00 | 2,208.92 | 220.89 | 0.1000 | 0.2500 | 6.53" },
        { content: "MASTERCARD | 8 | 1,857.50 | 0 | 0.00 | 1,857.50 | 232.19 | 0.1000 | 0.2500 | 5.45" },
        { content: "MCDEBlT | 6 | 778.00 | 0 | 0 00 | 778.00 | 129.67 | 0.1000 | 0.2500 | 2.55" },
        { content: "MCDEB!TCAP | 18 | 1,518.50 | 0 | 0.00 | 1,518.50 | 84.36 | 0.1000 | 0.2500 | 5.60" },
        { content: "VISA | 28 | 3,769.00 | 0 | 0.00 | 3,769.00 | 134.6] | 0.1000 | 0.2500 | 12.22" },
        { content: "VJSADEBIT | 3 | 901.00 | 0 | 0.00 | 901.00 | 300.33 | 0.1000 | 0.2500 | 2.56" },
        { content: "VISADEBITCAP | 55 | 7,011.50 | 0 | 0.00 | 7,0 I I.SO | 127.48 | 0.1000 | 0.2500 | 23.04" },
        { content: "Total | 128 | 18,044.42 | 0 | 0.00 | 18,044.42 | 140.97 | 57.95" },
        { content: "SURCHARGE" },
        { content: "Description | 11ems | Amount | Fee Amount" },
        { content: "Total Surcharge Fees | 223.23" },
        { content: "OTHER FEES" },
        { content: "4,154.00 MASTERCARD ASSESSMENT | 5.41" },
        { content: "3,769.00 VISACREDIT ASSESSMENT | 4.91" },
        { content: "7,912.50 VISADEBIT ASSESSMENT | 10.29" },
        { content: "2,208.92 AMEXNETWORK ASSESSMENT | 3.32" },
        { content: "20 | AMEX INQUIRIES | 2.00" },
        { content: "CHARGEBACK SERVICE FEE Tl | 7.50" },
        { content: "14 | DECLINED AlJTIIORIZATIONS | 1.40" },
        { content: "2 | DISCOVER DATA USAGE FEE | 0.04" },
        { content: "2 | DISCOVER NETWORK AUTHORIZATION FEE | 0.01" },
        { content: "4,154.00 MASTRCARD ACQUIRER FEE | 1.50" },
        { content: "20 | MASTERCARD CVC2 TRANSACTION FEE | 0.05" },
      ],
      textPreview:
        "PROCESSING MONTH:JUN 2018 DEPOSIT SUMMARY Deposits Total 18,044.42 PROCESSINGACTIVITY SUMMARY Total 57.95 SURCHARGE Total Surcharge Fees 223.23 OTHER FEES",
      extraction: {
        mode: "text_only",
        qualityScore: 0.46,
        reasons: ["PDF was parsed as text lines only; structured field recovery was not confident enough yet."],
        lineCount: 31,
        amountTokenCount: 60,
        hasExtractableText: true,
      },
    };

    const summary = refineTextOnlyPdfSummary(doc, createBaseSummary());

    expect(summary).not.toBeNull();
    expect(summary?.statementPeriod).toBe("2018-06");
    expect(summary?.totalVolume).toBe(18044.42);
    expect(summary?.totalFees).toBe(317.61);
    expect(summary?.effectiveRate).toBe(1.76);
    expect(summary?.confidence).toBe("low");
    expect(summary?.dataQuality.map((signal) => signal.message)).toContain(
      "Structured table extraction was unavailable, so the report estimated numeric totals from the searchable PDF text layer.",
    );
    expect(summary?.dataQuality.map((signal) => signal.message)).toContain(
      "A single grand-total fees row was not found, so the report combined section totals and itemized fee lines.",
    );
  });
});
