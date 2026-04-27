import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import { buildHiddenMarkupAudit } from "../src/hiddenMarkupAudit.js";
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

function hiddenMarkupInsideInterchangeDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "INTERCHANGE DETAIL" },
      { content: "Card Type | Transaction Count | Volume | Rate | Per Item Fee | Total Paid" },
      { content: "Visa Processor Markup | 10 | $1,000.00 | 0.20% | $0.10 | $3.00" },
    ],
    textPreview:
      "INTERCHANGE DETAIL Card Type Transaction Count Volume Rate Per Item Fee Total Paid Visa Processor Markup $1,000.00 0.20% $0.10 $3.00",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 5,
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

function worldpaySplitPerItemDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "Worldpay Merchant Statement" },
      { content: "PROCESSING FEES" },
      { content: "Transaction Fee | $0.10" },
      { content: "AUTHORIZATION FEES" },
      { content: "Authorization Fee | $0.10" },
      { content: "Total Volume | $1,000.00" },
      { content: "Total Fees | $20.00" },
    ],
    textPreview:
      "Worldpay Merchant Statement Worldpay PROCESSING FEES Transaction Fee $0.10 AUTHORIZATION FEES Authorization Fee $0.10",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 7,
      amountTokenCount: 4,
      hasExtractableText: true,
    },
  };
}

function worldpayMissingAuthorizationDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "Worldpay Merchant Statement" },
      { content: "PROCESSING FEES" },
      { content: "Transaction Fee | $0.10" },
      { content: "Total Volume | $1,000.00" },
      { content: "Total Fees | $10.00" },
    ],
    textPreview: "Worldpay Merchant Statement Worldpay PROCESSING FEES Transaction Fee $0.10",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: [],
      lineCount: 5,
      amountTokenCount: 3,
      hasExtractableText: true,
    },
  };
}

function structuredAddOnFeeDoc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["content", "Fee Name", "Amount", "Rate", "Affected Volume"],
    rows: [
      { content: "OTHER FEES" },
      { "Fee Name": "PCI Non-Compliance Fee", Amount: "$39.95" },
      { "Fee Name": "Non-EMV Penalty", Amount: "$25.00", Rate: "1.00%", "Affected Volume": "$12,000.00" },
      { "Fee Name": "Non-EMV Volume Markup", Rate: "1.00%", "Affected Volume": "$12,000.00" },
      { "Fee Name": "Portfolio Risk Fee", Amount: "$18.50" },
      { "Fee Name": "Customer Intelligence Suite", Amount: "$55.00" },
    ],
    textPreview:
      "OTHER FEES PCI Non-Compliance Fee Non-EMV Penalty Portfolio Risk Fee Customer Intelligence Suite $39.95 $25.00 1.00% $12,000.00 $18.50 $55.00",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 5,
      amountTokenCount: 8,
      hasExtractableText: true,
    },
  };
}

function bundledPricingDoc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["content", "Qualification", "Rate", "Volume", "Fee Amount"],
    rows: [
      { content: "PROCESSING FEES" },
      { Qualification: "Qualified", Rate: "1.79%", Volume: "$10,000.00", "Fee Amount": "$179.00" },
      { Qualification: "Mid-Qualified", Rate: "4.09%", Volume: "$2,000.00", "Fee Amount": "$81.80" },
      { Qualification: "Non-Qualified", Rate: "4.99%", Volume: "$1,000.00", "Fee Amount": "$49.90" },
    ],
    textPreview: "PROCESSING FEES Qualified Mid-Qualified Non-Qualified 1.79% 4.09% 4.99%",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 4,
      amountTokenCount: 9,
      hasExtractableText: true,
    },
  };
}

function downgradeInterchangeDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "INTERCHANGE DETAIL" },
      { content: "Card Type | Transaction Count | Volume | Rate | Per Item Fee | Total Paid" },
      { content: "Visa Non-Qualified EIRF | 43 | $8,920.00 | 2.30% | $0.10 | $209.46" },
    ],
    textPreview: "INTERCHANGE DETAIL Visa Non-Qualified EIRF 43 $8,920.00 2.30% $0.10 $209.46",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 5,
      hasExtractableText: true,
    },
  };
}

function noticeSectionDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "IMPORTANT NOTICES" },
      {
        content:
          "Effective September 1, 2026 billing change applies to processing fees; go online for full details. Continued use of your account means you accept these terms.",
      },
    ],
    textPreview:
      "IMPORTANT NOTICES Effective September 1, 2026 billing change applies to processing fees go online for full details continued use accept these terms",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 2,
      amountTokenCount: 0,
      hasExtractableText: true,
    },
  };
}

describe("interchange audit extraction", () => {
  it("uses structured add-on fee sections for PCI, non-EMV, risk, and unused-suite checks", async () => {
    const doc = structuredAddOnFeeDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.structuredFeeFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "pci_non_compliance", amountUsd: 39.95 }),
        expect.objectContaining({
          kind: "non_emv",
          amountUsd: 25,
          ratePercent: 1,
          affectedVolumeUsd: 12000,
          estimatedImpactUsd: 145,
        }),
        expect.objectContaining({
          kind: "non_emv",
          label: "Non-EMV Volume Markup",
          amountUsd: null,
          ratePercent: 1,
          affectedVolumeUsd: 12000,
          estimatedImpactUsd: 120,
        }),
        expect.objectContaining({ kind: "risk_fee", amountUsd: 18.5 }),
        expect.objectContaining({ kind: "customer_intelligence_suite", amountUsd: 55 }),
      ]),
    );

    const checklist = await evaluateChecklistReport(doc, summary);
    expect(checklist.universal.results.find((result) => result.id === "E023")?.status).toBe("fail");
    expect(checklist.universal.results.find((result) => result.id === "E024")?.evidence.join(" ")).toContain(
      "modeledImpact=$145.00",
    );
    expect(checklist.universal.results.find((result) => result.id === "E025")?.status).toBe("warning");
    const unnecessaryFees = checklist.crossProcessor.results.find((result) => result.title.includes("unnecessary fees"));
    expect(unnecessaryFees?.status).toBe("warning");
    expect(unnecessaryFees?.reason).toContain("structured fee sections");
  });

  it("models bundled pricing only when section-backed qualified buckets are captured", async () => {
    const doc = bundledPricingDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.bundledPricing).toMatchObject({
      active: true,
      highestRatePercent: 4.99,
      totalVolumeUsd: 13000,
      totalFeesUsd: 310.7,
    });
    expect(summary.bundledPricing.buckets.map((bucket) => bucket.qualification)).toEqual([
      "qualified",
      "mid_qualified",
      "non_qualified",
    ]);

    const checklist = await evaluateChecklistReport(doc, summary);
    const bundledRule = checklist.universal.results.find((result) => result.id === "E038");
    expect(bundledRule?.status).toBe("warning");
    expect(bundledRule?.reason).toContain("highest captured rate is 4.99%");
  });

  it("estimates downgrade penalty from structured interchange rows", async () => {
    const doc = downgradeInterchangeDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.downgradeAnalysis).toMatchObject({
      affectedVolumeUsd: 8920,
      estimatedPenaltyLowUsd: 26.76,
      estimatedPenaltyHighUsd: 35.68,
    });
    expect(summary.downgradeAnalysis.rows[0]).toMatchObject({
      indicators: ["non-qualified", "EIRF"],
      transactionCount: 43,
      volumeUsd: 8920,
    });

    const checklist = await evaluateChecklistReport(doc, summary);
    const downgradeRule = checklist.universal.results.find((result) => result.id === "E043");
    expect(downgradeRule?.status).toBe("warning");
    expect(downgradeRule?.reason).toContain("$26.76-$35.68");
  });

  it("evaluates notice risks from parsed notice sections instead of generic website text", async () => {
    const doc = noticeSectionDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.noticeFindings.map((finding) => finding.kind)).toEqual(
      expect.arrayContaining(["fee_change", "online_only", "acceptance_by_use", "effective_date"]),
    );

    const checklist = await evaluateChecklistReport(doc, summary);
    expect(checklist.universal.results.find((result) => result.id === "E014")?.status).toBe("warning");
    expect(checklist.universal.results.find((result) => result.id === "E015")?.status).toBe("warning");
    expect(checklist.universal.results.find((result) => result.id === "E015")?.evidence.join(" ")).toContain("online_only");
  });

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
    const hiddenMarkup = checklist.crossProcessor.results.find((result) => result.title.includes("hidden markup"));
    expect(hiddenMarkup?.status).toBe("unknown");
    expect(hiddenMarkup?.reason).toContain("trusted card-brand schedule references were missing");
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

  it("flags processor markup labels embedded inside interchange detail rows", async () => {
    const doc = hiddenMarkupInsideInterchangeDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.statementSections.some((section) => section.type === "interchange_detail")).toBe(true);
    expect(summary.interchangeAuditRows).toHaveLength(1);
    expect(summary.interchangeAuditRows[0]).toMatchObject({
      label: "Visa Processor Markup",
      totalPaid: 3,
    });

    const checklist = await evaluateChecklistReport(doc, summary);
    const hiddenMarkup = checklist.crossProcessor.results.find((result) => result.title.includes("hidden markup"));
    expect(hiddenMarkup?.status).toBe("warning");
    expect(hiddenMarkup?.evidence.join(" ")).toContain("Interchange row carries processor-markup wording");
  });

  it("quantifies schedule-based hidden markup when trusted references match row descriptors", async () => {
    const doc = csvInterchangeDoc();
    const summary = analyzeDocument(doc, "other");
    const audit = buildHiddenMarkupAudit(summary.interchangeAuditRows, [
      {
        referenceId: "test-visa-rewards",
        version: "test-2024",
        brand: "Visa",
        descriptor: "Visa Rewards",
        descriptorPattern: "visa rewards",
        rateBps: 150,
        perItemFee: 0.1,
        source: "test trusted schedule",
        confidence: 0.95,
      },
      {
        referenceId: "test-mastercard-debit",
        version: "test-2024",
        brand: "Mastercard",
        descriptor: "Mastercard Debit",
        descriptorPattern: "mastercard debit",
        rateBps: 150,
        perItemFee: 0.1,
        source: "test trusted schedule",
        confidence: 0.95,
      },
    ]);

    expect(audit.status).toBe("warning");
    expect(audit.matchedRowCount).toBe(2);
    expect(audit.flaggedRowCount).toBe(1);
    expect(audit.hiddenMarkupUsd).toBe(3.2);
    expect(audit.rows[0]).toMatchObject({
      label: "Visa Rewards",
      expectedCardBrandCost: 16,
      actualTotalPaid: 19.2,
      embeddedMarkupUsd: 3.2,
      embeddedMarkupBps: 32,
      status: "warning",
    });
    expect(audit.rows[1]).toMatchObject({
      label: "Mastercard Debit",
      status: "pass",
    });

    const checklist = await evaluateChecklistReport(doc, { ...summary, hiddenMarkupAudit: audit });
    const hiddenMarkup = checklist.crossProcessor.results.find((result) => result.title.includes("hidden markup"));
    expect(hiddenMarkup?.status).toBe("warning");
    expect(hiddenMarkup?.evidence.join(" ")).toContain("Schedule delta");
  });

  it("does not validate schedule deltas from calculated expected paid when extracted paid is missing", () => {
    const summary = analyzeDocument(interchangeWithoutPaidDoc(), "other");
    const audit = buildHiddenMarkupAudit(summary.interchangeAuditRows, [
      {
        referenceId: "test-visa-rewards",
        version: "test-2024",
        brand: "Visa",
        descriptor: "Visa Rewards",
        descriptorPattern: "visa rewards",
        rateBps: 150,
        perItemFee: 0.1,
        source: "test trusted schedule",
        confidence: 0.95,
      },
    ]);

    expect(audit.status).toBe("unknown");
    expect(audit.flaggedRowCount).toBe(0);
    expect(audit.rows[0]).toMatchObject({
      label: "Visa Rewards",
      actualTotalPaid: null,
      status: "unknown",
    });
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
    const hiddenMarkup = checklist.crossProcessor.results.find((result) => result.title.includes("hidden markup"));
    expect(hiddenMarkup?.status).toBe("warning");
    expect(hiddenMarkup?.reason).toContain("Processor-owned markup");
    expect(hiddenMarkup?.evidence.join(" ")).toContain("processor=$80.00");
  });

  it("combines section-supported transaction and authorization fees into true all-in per-item cost", async () => {
    const doc = worldpaySplitPerItemDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.perItemFeeModel).toMatchObject({
      transactionFee: 0.1,
      authorizationFee: 0.1,
      allInPerItemFee: 0.2,
    });
    expect(summary.perItemFeeModel.components.map((component) => component.kind)).toEqual(["transaction", "authorization"]);

    const checklist = await evaluateChecklistReport(doc, summary);
    const perItemUniversal = checklist.universal.results.find((result) => result.id === "E019");
    expect(perItemUniversal?.status).toBe("pass");

    const combineCheck = checklist.processorSpecific.results.find((result) => result.title.includes("Combine transaction and authorization"));
    expect(combineCheck?.status).toBe("pass");
    expect(combineCheck?.reason).toContain("0.2000");
  });

  it("does not compute all-in per-item cost when authorization fee is not statement-supported", async () => {
    const doc = worldpayMissingAuthorizationDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.perItemFeeModel).toMatchObject({
      transactionFee: 0.1,
      authorizationFee: null,
      allInPerItemFee: null,
    });

    const checklist = await evaluateChecklistReport(doc, summary);
    const perItemUniversal = checklist.universal.results.find((result) => result.id === "E019");
    expect(perItemUniversal?.status).toBe("warning");
    expect(perItemUniversal?.reason).toContain("authorization fee was not captured");

    const combineCheck = checklist.processorSpecific.results.find((result) => result.title.includes("Combine transaction and authorization"));
    expect(combineCheck?.status).toBe("warning");
  });
});
