import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fiservParserOutputSchema } from "../src/fiservParserOutputSchema.js";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "data",
  "fixtures",
  "fiserv",
  "first-data-full-oct-2024.expected.json",
);

describe("fiserv parser output schema", () => {
  it("validates the First Data/Fiserv full-statement expected output fixture", async () => {
    const raw = await fs.readFile(FIXTURE_PATH, "utf8");
    const fixture = fiservParserOutputSchema.parse(JSON.parse(raw));
    const financials = fixture.selectedFinancials;
    const feeBucketSum = fixture.feeBreakdown.buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
    const expectedFunded =
      financials.totalVolume -
      (financials.thirdPartyTransactions ?? 0) +
      (financials.adjustmentsChargebacks ?? 0) -
      financials.totalFees;

    expect(fixture.statementIdentity.statementFamily).toBe("fiserv_first_data_full_statement");
    expect(fixture.statementIdentity.statementPeriodStart).toBe("2024-10-01");
    expect(financials.totalVolume).toBe(52460.55);
    expect(financials.totalFees).toBe(1312.55);
    expect(feeBucketSum).toBeCloseTo(financials.totalFees, 2);
    expect(expectedFunded).toBeCloseTo(financials.amountFunded, 2);
    expect(financials.totalFees / financials.totalVolume).toBeCloseTo(financials.effectiveRate, 8);
    expect(fixture.decision.status).toBe("accepted_with_warnings");
    expect(fixture.decision.reportable).toBe(true);
    expect(fixture.excludedTotals.some((total) => total.label.includes("YTD"))).toBe(true);
    expect(fixture.warnings.map((warning) => warning.code)).toContain("interchange_detail_total_differs_from_fee_summary");
  });
});
