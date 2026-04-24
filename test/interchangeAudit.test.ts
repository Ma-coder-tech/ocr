import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import type { ParsedDocument } from "../src/parser.js";

function csvInterchangeDoc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["content", "Card Type", "Transaction Count", "Volume", "Rate", "Per Item Fee", "Fee Amount"],
    rows: [
      { content: "INTERCHANGE DETAIL" },
      {
        "Card Type": "Visa Rewards",
        "Transaction Count": 10,
        Volume: 1000,
        Rate: "1.82%",
        "Per Item Fee": "$0.10",
        "Fee Amount": "$19.20",
      },
      {
        "Card Type": "Mastercard Debit",
        "Transaction Count": 20,
        Volume: 2000,
        Rate: "1.50%",
        "Per Item Fee": "$0.10",
        "Fee Amount": "$32.00",
      },
    ],
    textPreview: "INTERCHANGE DETAIL Visa Rewards Mastercard Debit",
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 10,
      hasExtractableText: true,
    },
  };
}

function pdfLineInterchangeDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "INTERCHANGE DETAIL" },
      { content: "Card Type | Transaction Count | Volume | Rate | Per Item Fee | Total Paid" },
      { content: "Visa Rewards | 10 | $1,000.00 | 1.82% | $0.10 | $19.20" },
      { content: "Mastercard Debit | 20 | $2,000.00 | 1.50% | $0.10 | $32.00" },
      { content: "SALES SUMMARY" },
      { content: "Total Volume | $3,000.00" },
      { content: "Total Fees | $51.20" },
    ],
    textPreview:
      "INTERCHANGE DETAIL Card Type Transaction Count Volume Rate Per Item Fee Total Paid Visa Rewards Mastercard Debit Total Volume $3,000.00 Total Fees $51.20",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 7,
      amountTokenCount: 10,
      hasExtractableText: true,
    },
  };
}

function brandedSalesSummaryDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "PROCESSING ACTIVITY SUMMARY" },
      { content: "Card Type | Transaction Count | Net Sales | Processing Fees" },
      { content: "Visa | 28 | $3,769.00 | $12.22" },
      { content: "Mastercard | 8 | $1,857.50 | $5.45" },
      { content: "Total Volume | $5,626.50" },
      { content: "Total Fees | $17.67" },
    ],
    textPreview: "PROCESSING ACTIVITY SUMMARY Visa Mastercard Total Volume $5,626.50 Total Fees $17.67",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 6,
      amountTokenCount: 8,
      hasExtractableText: true,
    },
  };
}

function interchangeWithoutPaidDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "INTERCHANGE DETAIL" },
      { content: "Card Type | Transaction Count | Volume | Rate | Per Item Fee" },
      { content: "Visa Rewards | 10 | $1,000.00 | 1.82% | $0.10" },
      { content: "Mastercard Debit | 20 | $2,000.00 | 1.50% | $0.10" },
    ],
    textPreview: "INTERCHANGE DETAIL Card Type Transaction Count Volume Rate Per Item Fee Visa Rewards Mastercard Debit",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 4,
      amountTokenCount: 8,
      hasExtractableText: true,
    },
  };
}

function tsysBlendedRowsDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "TSYS MERCHANT STATEMENT" },
      { content: "PROCESSING ACTIVITY SUMMARY" },
      { content: "Card Type | Transaction Count | Total Sales | Rate | Per Item Fee | Amount" },
      { content: "Visa Credit | 100 | $10,000.00 | 0.65 | $0.15 | $80.00" },
      { content: "Visa Credit | 100 | $10,000.00 | 0.80 | $0.00 | $80.00" },
    ],
    textPreview:
      "TSYS MERCHANT STATEMENT PROCESSING ACTIVITY SUMMARY Card Type Transaction Count Total Sales Rate Per Item Fee Amount Visa Credit",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 5,
      amountTokenCount: 8,
      hasExtractableText: true,
    },
  };
}

describe("interchange audit extraction", () => {
  it("preserves CSV interchange rows before summary fee rollup", async () => {
    const summary = analyzeDocument(csvInterchangeDoc(), "other");

    expect(summary.statementSections.some((section) => section.type === "interchange_detail")).toBe(true);
    expect(summary.interchangeAuditRows).toHaveLength(2);
    expect(summary.interchangeAudit).toMatchObject({
      rowCount: 2,
      transactionCount: 30,
      volume: 3000,
      totalPaid: 51.2,
      weightedAverageRateBps: 160.67,
      totalVariance: 0,
    });

    expect(summary.interchangeAuditRows[0]).toMatchObject({
      label: "Visa Rewards",
      cardBrand: "Visa",
      cardType: "Rewards",
      transactionCount: 10,
      volume: 1000,
      ratePercent: 1.82,
      rateBps: 182,
      perItemFee: 0.1,
      totalPaid: 19.2,
      expectedTotalPaid: 19.2,
      variance: 0,
    });
    expect(summary.feeBreakdown.some((row) => row.broadType === "Pass-through")).toBe(true);

    const checklist = await evaluateChecklistReport(csvInterchangeDoc(), summary);
    const detailCapture = checklist.universal.results.find((result) => result.id === "E011");
    expect(detailCapture?.status).toBe("pass");
  });

  it("maps PDF table lines into interchange audit rows", () => {
    const summary = analyzeDocument(pdfLineInterchangeDoc(), "other");

    expect(summary.interchangeAuditRows).toHaveLength(2);
    expect(summary.interchangeAuditRows[1]).toMatchObject({
      label: "Mastercard Debit",
      cardBrand: "Mastercard",
      cardType: "Debit",
      transactionCount: 20,
      volume: 2000,
      ratePercent: 1.5,
      rateBps: 150,
      perItemFee: 0.1,
      totalPaid: 32,
      expectedTotalPaid: 32,
      variance: 0,
    });
  });

  it("does not treat brand-only sales summary rows as interchange detail", () => {
    const summary = analyzeDocument(brandedSalesSummaryDoc(), "other");

    expect(summary.statementSections.some((section) => section.type === "summary")).toBe(true);
    expect(summary.interchangeAuditRows).toHaveLength(0);
    expect(summary.interchangeAudit.rowCount).toBe(0);
    expect(summary.processorMarkupAudit).toMatchObject({
      rowCount: 2,
      volume: 5626.5,
      totalPaid: 17.67,
      effectiveRateBps: 31.4,
    });
  });

  it("keeps extracted paid separate from expected paid and warns checklist E011 when paid is missing", async () => {
    const doc = interchangeWithoutPaidDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.interchangeAuditRows).toHaveLength(2);
    expect(summary.interchangeAuditRows[0]).toMatchObject({
      label: "Visa Rewards",
      transactionCount: 10,
      volume: 1000,
      ratePercent: 1.82,
      perItemFee: 0.1,
      totalPaid: null,
      expectedTotalPaid: 19.2,
      variance: null,
    });
    expect(summary.interchangeAudit.totalPaid).toBeNull();

    const checklist = await evaluateChecklistReport(doc, summary);
    const detailCapture = checklist.universal.results.find((result) => result.id === "E011");
    expect(detailCapture?.status).toBe("warning");
    expect(detailCapture?.reason).toContain("calculated expected paid only");
  });

  it("splits TSYS blended rows into interchange and processor markup components", async () => {
    const doc = tsysBlendedRowsDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.blendedFeeSplits).toHaveLength(1);
    expect(summary.blendedFeeSplits[0]).toMatchObject({
      label: "Visa Credit",
      cardBrand: "Visa",
      transactionCount: 100,
      volume: 10000,
      processorMarkup: {
        ratePercent: 0.65,
        rateBps: 65,
        perItemFee: 0.15,
        totalPaid: 80,
        expectedTotalPaid: 80,
      },
      interchange: {
        ratePercent: 0.8,
        rateBps: 80,
        perItemFee: 0,
        totalPaid: 80,
        expectedTotalPaid: 80,
      },
    });
    expect(summary.processorMarkupAudit).toMatchObject({
      rowCount: 1,
      transactionCount: 100,
      volume: 10000,
      totalPaid: 80,
      weightedAverageRateBps: 65,
      effectiveRateBps: 80,
    });
    expect(summary.processorMarkupAudit.rows[0]).toMatchObject({
      label: "Visa Credit",
      rateBps: 65,
      effectiveRateBps: 80,
      perItemFee: 0.15,
      totalPaid: 80,
    });
    expect(summary.interchangeAuditRows).toHaveLength(1);
    expect(summary.interchangeAuditRows[0]).toMatchObject({
      label: "Visa Credit",
      ratePercent: 0.8,
      totalPaid: 80,
    });
    expect(summary.totalFees).toBe(160);
    expect(summary.feeBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "card brand interchange detail",
          amount: 80,
          feeClass: "card_brand_pass_through",
        }),
        expect.objectContaining({
          label: "processor markup detail",
          amount: 80,
          feeClass: "processor_markup",
        }),
      ]),
    );

    const checklist = await evaluateChecklistReport(doc, summary);
    const blendedUniversal = checklist.universal.results.find((result) => result.id === "E013");
    expect(blendedUniversal?.status).toBe("pass");
    const processorSplit = checklist.processorSpecific.results.find((result) => result.title.includes("Split blended rows"));
    expect(processorSplit?.status).toBe("pass");
  });
});
