import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { maybeRunMultiStatementNarrativeAiForGlobalReport } from "../src/multiStatementNarrativeAi.js";
import { compareMultiStatementAnalyses } from "../src/multiStatementComparisonEngine.js";
import type { ComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import { buildMultiStatementGlobalReport, renderMultiStatementGlobalReportMarkdown } from "../src/reporting/buildMultiStatement.js";

const FIXTURE_PATH = path.join(process.cwd(), "test", "fixtures", "multi-statement", "el_nuevo_tequila_multi_statement.generated.json");

type Fixture = {
  statements: ComparisonStatementInput[];
};

function fixture(): Fixture {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

function report() {
  const data = fixture();
  const analysis = compareMultiStatementAnalyses(data.statements, {
    analysisTimestamp: "2026-07-06T00:00:00.000Z",
    pipelineVersion: "test",
  });
  return buildMultiStatementGlobalReport(analysis);
}

describe("multi-statement global report", () => {
  it("assembles the Section 5 merchant-facing report from comparison output", () => {
    const result = report();

    expect(result.kind).toBe("multi_statement_global");
    expect(result.executiveSummary).toMatchObject({
      merchantName: "EL NUEVO TEQUILA MEXICAN",
      dateRange: "2024-09 - 2025-04",
      statementCount: 7,
      missingPeriods: ["2025-02"],
      trendDirection: "increasing",
      pricingModel: "interchange_plus",
    });
    expect(result.executiveSummary.averageEffectiveRate.rawValue).toBe(0.01700199);
    expect(result.executiveSummary.averageEffectiveRate.value).toBe("1.70%");
    expect(result.executiveSummary.headlineSavings.rawValue).toBe(2163.24);
    expect(result.effectiveRateTrend.periods.find((period) => period.period === "2024-12")).toMatchObject({
      displayRate: "1.35%",
      displayVolume: "$240,000.00",
    });
    expect(result.disputeTrend).toMatchObject({
      direction: "increasing",
      totalDisputeCostsAllPeriods: 200,
    });
    expect(result.feeChangeTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period: "2024-11",
          feeName: "REGULATORY PRODUCT",
          cumulativeImpact: 19.75,
          projectedAnnualImpact: 47.4,
          noticeFound: false,
        }),
        expect.objectContaining({
          period: "2025-01",
          feeName: "WATS AUTH FEE",
          cumulativeImpact: 236.38,
          projectedAnnualImpact: 975.84,
          noticeFound: true,
          noticePeriod: "2024-11",
        }),
        expect.objectContaining({
          period: "2025-04",
          feeName: "SUPPLY SHIPPING & HANDLING",
          cumulativeImpact: 4,
          projectedAnnualImpact: 48,
          noticeFound: false,
        }),
        expect.objectContaining({
          period: "2025-04",
          feeName: "MONTHLY SERVICE CHARGE",
          cumulativeImpact: 5,
          projectedAnnualImpact: 60,
          noticeFound: false,
        }),
      ]),
    );
    expect(result.topFindings.map((finding) => finding.fingerprint)).toEqual([
      "managed_security_non_validated__confirmed",
      "silent_fixed_fee_increases__confirmed",
      "regulatory_product__confirmed",
      "wats_auth_fee_increase__negotiable",
    ]);
    expect(result.topFindings.find((finding) => finding.fingerprint === "managed_security_non_validated__confirmed")?.explanation).toContain(
      "PCI compliance validation has not been completed",
    );
    expect(result.topFindings.find((finding) => finding.fingerprint === "regulatory_product__confirmed")?.explanation).toContain(
      "We couldn't tie this fee to a published card brand requirement",
    );
    expect(result.topFindings.find((finding) => finding.fingerprint === "wats_auth_fee_increase__negotiable")?.explanation).toContain(
      "processor-controlled per-transaction fee",
    );
    expect(result.recurringAvoidableFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeName: "PAPER STATEMENT FEE",
          monthlyAmount: 10,
          monthsPresent: 7,
          cumulativeTotal: 70,
          projectedAnnual: 120,
          action: "Switch to electronic statements.",
        }),
        expect.objectContaining({
          feeName: "SUPPLY SHIPPING & HANDLING",
          monthlyAmount: 19.95,
          monthsPresent: 7,
          cumulativeTotal: 115.65,
          projectedAnnual: 239.4,
        }),
        expect.objectContaining({
          feeName: "MONTHLY SERVICE CHARGE",
          monthlyAmount: 15,
          monthsPresent: 7,
          cumulativeTotal: 75,
          projectedAnnual: 180,
        }),
        expect.objectContaining({
          feeName: "Transaction Integrity Fee (TIF)",
          monthsPresent: 7,
          cumulativeTotal: 0.7,
          projectedAnnual: 1.2,
        }),
      ]),
    );
    expect(result.cumulativeSavings.alreadyOverpaid).toEqual({
      conservative: 381,
      estimated: 617.38,
      maximum: 617.38,
    });
    expect(result.cumulativeSavings.projectedAnnualIfUnchanged).toEqual({
      conservative: 1187.4,
      estimated: 2163.24,
      maximum: 2163.24,
    });
    expect(result.actionSummary).toMatchObject({
      totalProjectedAnnualSavings: 2163.24,
      largestSingleOpportunity: {
        expectedAnnualSavings: 975.84,
      },
    });
    expect(result.actionItems.find((item) => item.action === "Negotiate the processor-controlled rate.")?.includes).toEqual([
      expect.objectContaining({
        title: "WATS AUTH FEE increase",
        expectedAnnualSavings: 975.84,
      }),
    ]);
  });

  it("renders a markdown report preview with all global sections", () => {
    const markdown = renderMultiStatementGlobalReportMarkdown(report());

    expect(markdown).toContain("# Multi-statement processing review: EL NUEVO TEQUILA MEXICAN");
    expect(markdown).toContain("## Executive summary");
    expect(markdown).toContain("## Fee percentage trend");
    expect(markdown).toContain("## Dispute trend");
    expect(markdown).toContain("## Fee change timeline");
    expect(markdown).toContain("## Top findings");
    expect(markdown).toContain("## Recurring fees");
    expect(markdown).toContain("## Fees worth challenging");
    expect(markdown).toContain("## Action items");
    expect(markdown).toContain("## Master narrative");
    expect(markdown).toContain("2025-02");
    expect(markdown).toContain("REGULATORY PRODUCT");
    expect(markdown).toContain("WATS AUTH FEE");
    expect(markdown).toContain("You paid a processor-controlled per-transaction fee");
    expect(markdown).not.toContain("WATS AUTH FEE changed from $0.11 to $0.13 in 2025-01. Contact your processor for details about this fee.");
    expect(markdown).toContain("Total projected annual savings if all actions are taken: $2,163.24");
    expect(markdown).toContain("Includes: WATS AUTH FEE increase ($975.84)");
  });
});

describe("multi-statement narrative AI", () => {
  it("builds a grounded master narrative from the global report", async () => {
    const globalReport = report();
    let prompt = "";

    const result = await maybeRunMultiStatementNarrativeAiForGlobalReport(globalReport, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "multi-statement-narrative-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          const packet = JSON.parse(prompt.split("Fact packet:\n\n").at(-1) ?? "{}") as {
            facts: Array<{ id: string; topic: string; text: string }>;
          };
          const fact = (text: string) => packet.facts.find((item) => item.text.includes(text))?.id ?? packet.facts[0]!.id;
          return {
            object: {
              paragraphs: [
                {
                  text: "The largest cumulative issue is the WATS AUTH FEE increase, which has added $236.38 across the analyzed months and projects to $975.84 per year if it stays in place.",
                  factIds: [fact("WATS AUTH FEE")],
                },
                {
                  text: "MANAGED SECURITY NON VALIDATED appeared in March with $99.90 charged so far and a $599.40 projected annual cost, while REGULATORY PRODUCT first appeared in November without prior notice and has cost $19.75 so far.",
                  factIds: [fact("MANAGED SECURITY NON VALIDATED"), fact("REGULATORY PRODUCT")],
                },
                {
                  text: "The January WATS AUTH FEE increase from $0.11 to $0.13 was tied to the November notice; the April SUPPLY SHIPPING & HANDLING and MONTHLY SERVICE CHARGE increases had no prior notice found.",
                  factIds: [fact("WATS AUTH FEE"), fact("SUPPLY SHIPPING & HANDLING"), fact("MONTHLY SERVICE CHARGE")],
                },
                {
                  text: "The effective rate fluctuated because December volume diluted fixed fees, then January and March fee changes pushed costs back up; February is missing from the review.",
                  factIds: [fact("Effective rate trend"), fact("Missing statement periods")],
                },
                {
                  text: "Dispute activity increased, with March showing five chargebacks and $125.00 in dispute cost; prioritize PCI validation for $599.40 annual savings, fixed-fee investigation for $108.00 annual savings, and WATS negotiation for $975.84 annual savings.",
                  factIds: [fact("Dispute trend"), fact("Complete PCI validation"), fact("reverse or justify"), fact("Negotiate")],
                },
              ],
              notes: ["Grounded in report facts."],
            },
          };
        },
      },
    });

    expect(prompt).toContain("You are a merchant services advisor");
    expect(prompt).toContain("Return 4-6 merchant-facing paragraphs");
    expect(prompt).toContain("Use ONLY the provided facts");
    expect(prompt).toContain("Do not invent, recompute, or round dollar amounts");
    expect(prompt).toContain("Use the action facts in their provided priority order");
    expect(prompt).toContain("speaking directly to the business owner");
    expect(prompt).toContain("Do not repeat fee labels without explaining what they mean");
    expect(result.aiMultiStatementNarrative).toMatchObject({
      status: "applied",
      provider: "anthropic",
      model: "multi-statement-narrative-test-model",
      attempted: true,
    });
    expect(result.aiMultiStatementNarrative.paragraphs).toHaveLength(5);
    expect(result.report.masterNarrative).toHaveLength(5);
    expect(result.report.masterNarrative.join("\n")).toContain("$599.40");
    expect(result.report.masterNarrative.join("\n")).toContain("February");
    expect(result.aiMultiStatementNarrative.factsUsed.length).toBeGreaterThan(4);
  });

  it("records disabled status when no narrative credentials are configured", async () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await maybeRunMultiStatementNarrativeAiForGlobalReport(report());

      expect(result.aiMultiStatementNarrative).toMatchObject({
        status: "disabled",
        provider: null,
        model: null,
        attempted: false,
      });
      expect(result.aiMultiStatementNarrative.notes).toContain("AI multi-statement narrative generation requires ANTHROPIC_API_KEY or OPENAI_API_KEY.");
      expect(result.report.masterNarrative).toEqual([]);
    } finally {
      if (originalAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      }
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });
});
