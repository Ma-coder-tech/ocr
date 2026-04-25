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
});
