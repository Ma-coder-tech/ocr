import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import type { ParsedDocument } from "../src/parser.js";

function guideMeasureDoc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["content", "metric", "volume", "fees"],
    rows: [
      { content: "Worldpay Merchant Statement" },
      { content: "ACCOUNT FEES" },
      {
        content:
          "Monthly Minimum | Minimum Amount | $25.00 | Actual Markup | $7.36 | Difference Charged | $17.64 | Monthly Volume | $40,000.00",
      },
      { content: "Express Merchant Funding | Premium | 5 bps | Funding Volume | $40,000.00" },
      {
        content:
          "Commercial Card Interchange Savings Adjustment | Retained Share | 75% | Gross Savings | $100.00",
      },
      { metric: "Total Volume", volume: 40000 },
      { metric: "Total Fees", fees: 500 },
    ],
    textPreview:
      "Worldpay Merchant Statement ACCOUNT FEES Monthly Minimum Minimum Amount $25.00 Actual Markup $7.36 Difference Charged $17.64 Express Merchant Funding Premium 5 bps Funding Volume $40,000.00 Commercial Card Interchange Savings Adjustment Retained Share 75% Gross Savings $100.00 Total Volume $40,000.00 Total Fees $500.00",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 7,
      amountTokenCount: 9,
      hasExtractableText: true,
    },
  };
}

function level3Doc(): ParsedDocument {
  return {
    sourceType: "csv",
    headers: ["content", "card_type", "transactions", "volume", "rate", "per_item", "fee", "metric", "fees"],
    rows: [
      { content: "Worldpay Merchant Statement" },
      { content: "INTERCHANGE DETAIL" },
      {
        card_type: "Visa Commercial Credit",
        transactions: 20,
        volume: 10000,
        rate: "2.20%",
        per_item: 0.1,
        fee: 222,
      },
      {
        card_type: "Mastercard Purchasing Card",
        transactions: 10,
        volume: 5000,
        rate: "2.10%",
        per_item: 0.1,
        fee: 106,
      },
      { metric: "Total Volume", volume: 15000 },
      { metric: "Total Fees", fees: 328 },
    ],
    textPreview:
      "Worldpay Merchant Statement INTERCHANGE DETAIL Visa Commercial Credit Mastercard Purchasing Card Total Volume $15,000.00 Total Fees $328.00",
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: 6,
      amountTokenCount: 10,
      hasExtractableText: true,
    },
  };
}

describe("structured guide-measure modeling", () => {
  it("models monthly minimum top-ups, funding premiums, and savings-share adjustments from statement sections", async () => {
    const doc = guideMeasureDoc();
    const summary = analyzeDocument(doc, "other");

    expect(summary.statementSections.some((section) => section.type === "add_on_fees")).toBe(true);
    expect(summary.guideMeasures.monthlyMinimum).toMatchObject({
      minimumUsd: 25,
      actualMarkupUsd: 7.36,
      monthlyVolumeUsd: 40000,
      topUpUsd: 17.64,
      effectiveMarkupUsd: 25,
      effectiveRateImpactPct: 0.0441,
    });
    expect(summary.guideMeasures.expressFundingPremium).toMatchObject({
      fundingVolumeUsd: 40000,
      premiumBps: 5,
      premiumUsd: 20,
    });
    expect(summary.guideMeasures.savingsShareAdjustment).toMatchObject({
      savingsSharePct: 75,
      grossSavingsUsd: 100,
      retainedSavingsUsd: 75,
    });
    expect(summary.savingsOpportunities.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Remove monthly minimum top-up",
        "Validate express funding premium",
        "Challenge savings-share adjustment",
      ]),
    );

    const checklist = await evaluateChecklistReport(doc, summary);
    expect(checklist.universal.results.find((result) => result.id === "E021")?.reason).toContain("modeled");
    expect(checklist.universal.results.find((result) => result.id === "E022")?.status).toBe("fail");
    expect(checklist.universal.results.find((result) => result.id === "E027")?.reason).toContain("$75.00");
    expect(checklist.universal.results.find((result) => result.id === "E035")?.status).toBe("fail");
  });

  it("detects Level 3 eligibility, missing data fields, and savings opportunity for commercial-card volume", async () => {
    const doc = level3Doc();
    const summary = analyzeDocument(doc, "professional_services");

    expect(summary.level3Optimization).toMatchObject({
      eligible: true,
      eligibleVolumeUsd: 15000,
      rateDeltaBps: 75,
      estimatedMonthlySavingsUsd: 112.5,
      estimatedAnnualSavingsUsd: 1350,
    });
    expect(summary.level3Optimization.missingFields).toEqual([
      "invoice_number",
      "product_code",
      "quantity",
      "item_description",
      "commodity_code",
    ]);
    expect(summary.savingsOpportunities.map((item) => item.title)).toContain("Enable Level 3 data pass-through");

    const checklist = await evaluateChecklistReport(doc, summary);
    expect(checklist.universal.results.find((result) => result.id === "E049")?.status).toBe("warning");
    expect(checklist.universal.results.find((result) => result.id === "E050")?.reason).toContain("invoice_number");
    expect(checklist.universal.results.find((result) => result.id === "E051")?.reason).toContain("$1350.00");
  });
});
