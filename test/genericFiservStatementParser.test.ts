import path from "node:path";
import { describe, expect, it } from "vitest";
import { genericFiservStatementDriver } from "../src/genericFiservStatementParser.js";
import { parsePdf } from "../src/parser.js";
import { extractStatementAnatomy, statementLines } from "../src/statementAnatomy.js";

const FIXTURE_ROOT = path.join(process.cwd(), "test", "fixtures", "pdfs");

describe("generic Fiserv-family statement parser", () => {
  it("selects reconciled Basys totals using statement anatomy candidates", async () => {
    const parsed = await parsePdf(path.join(FIXTURE_ROOT, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf"));
    const anatomy = extractStatementAnatomy(statementLines(parsed));

    expect(anatomy.totalVolume.amount).toBe(171283.93);
    expect(anatomy.totalFees.amount).toBe(3552.45);
    expect(anatomy.amountFunded.amount).toBe(167731.48);
    expect(anatomy.fundingFormulaDelta).toBe(0);
    expect(anatomy.candidates.some((candidate) => !candidate.selected && candidate.rejectionReason)).toBe(true);
  }, 60_000);

  it("parses processor-branded card-fee and miscellaneous-fee sections as a generic fallback", async () => {
    const parsed = await parsePdf(path.join(FIXTURE_ROOT, "fiserv_PAYSAFE_Febr_2024.pdf"));
    const output = genericFiservStatementDriver.parse(parsed, {
      sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf",
    }) as any;

    expect(output.selectedFinancials).toMatchObject({
      totalVolume: 36912.94,
      totalFees: 1565.73,
      amountFunded: 35347.21,
    });
    expect(output.feeLedger).toMatchObject({
      status: "reconciled_with_rounding_delta",
      printedTotal: 1565.73,
      totalRowSum: 1565.71,
      delta: 0.02,
    });
    expect(output.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: "BATCH HEADER", amount: 6.4 }),
        expect.objectContaining({ description: "ADDITIONAL FEES", amount: 9.48 }),
        expect.objectContaining({ description: "OTHER ITEM FEES", amount: 0.4 }),
      ]),
    );
  }, 60_000);
});
