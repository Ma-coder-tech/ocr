import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import type { ParsedDocument } from "../src/parser.js";

function sectionedMerchantStatementDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "MERCHANT STATEMENT SUMMARY" },
      { content: "Total Sales | $10,000.00" },
      { content: "Total Fees | $300.00" },
      { content: "INTERCHANGE DETAIL" },
      { content: "Card Type | Transaction Count | Volume | Rate | Per Item Fee | Total Paid" },
      { content: "Visa Rewards | 100 | $10,000.00 | 1.70% | $0.10 | $180.00" },
      { content: "PROCESSING FEES" },
      { content: "Processor Markup Total | $80.00" },
      { content: "ACCOUNT FEES" },
      { content: "PCI Fee | $20.00" },
      {
        content:
          "Monthly Minimum | Minimum Amount | $25.00 | Actual Markup | $5.00 | Difference Charged | $20.00 | Monthly Volume | $10,000.00",
      },
      { content: "NOTICES" },
      { content: "Effective May 2026 gateway pricing may increase by $999.00 for some merchants." },
    ],
    textPreview:
      "MERCHANT STATEMENT SUMMARY Total Sales $10,000.00 Total Fees $300.00 INTERCHANGE DETAIL Visa Rewards PROCESSING FEES Processor Markup Total $80.00 ACCOUNT FEES PCI Fee $20.00 Monthly Minimum Difference Charged $20.00 NOTICES pricing may increase by $999.00",
    extraction: {
      mode: "structured",
      qualityScore: 0.92,
      reasons: [],
      lineCount: 13,
      amountTokenCount: 12,
      hasExtractableText: true,
    },
  };
}

function genericCsvDoc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["Month", "Sales Volume", "Processing Fee"],
    rows: [
      { Month: "January 2026", "Sales Volume": 1000, "Processing Fee": -20 },
      { Month: "February 2026", "Sales Volume": 2000, "Processing Fee": -40 },
    ],
    textPreview: "Month Sales Volume Processing Fee January 2026 February 2026",
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 4,
      hasExtractableText: true,
    },
  };
}

describe("section-first analyzer rollup", () => {
  it("uses statement sections for economics without double-counting summary totals or notices", () => {
    const summary = analyzeDocument(sectionedMerchantStatementDoc(), "other");

    expect(summary.totalVolume).toBe(10000);
    expect(summary.totalFees).toBe(300);
    expect(summary.effectiveRate).toBe(3);
    expect(summary.feeBreakdown.map((row) => row.label)).toEqual(
      expect.arrayContaining(["card brand interchange detail", "Processor Markup Total", "PCI Fee", "monthly minimum top-up"]),
    );
    expect(summary.feeBreakdown.some((row) => row.amount === 999)).toBe(false);
    expect(summary.feeBreakdown.find((row) => row.label === "card brand interchange detail")).toMatchObject({
      amount: 180,
      feeClass: "card_brand_pass_through",
    });
    expect(summary.feeBreakdown.find((row) => row.label === "Processor Markup Total")).toMatchObject({
      amount: 80,
      feeClass: "processor_markup",
    });
    expect(summary.feeBreakdown.find((row) => row.label === "monthly minimum top-up")).toMatchObject({
      amount: 20,
      feeClass: "processor_service_add_on",
    });
    expect(summary.dataQuality.map((signal) => signal.message).join(" ")).toContain("section-first statement rollup");
  });

  it("keeps generic numeric-column analysis as a fallback when sections are absent", () => {
    const summary = analyzeDocument(genericCsvDoc(), "other");

    expect(summary.totalVolume).toBe(3000);
    expect(summary.totalFees).toBe(60);
    expect(summary.effectiveRate).toBe(2);
    expect(summary.dataQuality.map((signal) => signal.message).join(" ")).not.toContain("section-first statement rollup");
  });
});
