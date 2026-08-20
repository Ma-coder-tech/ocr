import path from "node:path";
import { describe, expect, it } from "vitest";
import { genericFiservStatementDriver } from "../src/genericFiservStatementParser.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { parsePdf } from "../src/parser.js";
import { extractStructuredStatementFacts } from "../src/statementSections.js";
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

  it("preserves all Jefes fee charges and the complete 73-row wide interchange table", async () => {
    const fixture = path.join(FIXTURE_ROOT, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");
    const parsed = await parsePdf(fixture);
    const output = genericFiservStatementDriver.parse(parsed, {
      sourceFileName: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
      businessType: "restaurant",
    }) as any;
    const structured = extractStructuredStatementFacts(parsed, { processorId: genericFiservStatementDriver.id });
    const canonical = buildCanonicalStatementFactsFromParsedDocument(parsed, {
      sourceFileName: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
      businessType: "restaurant",
    });

    expect(output.feeLedger.rows).toHaveLength(105);
    expect(new Set(output.feeLedger.rows.map((row: any) => `${row.description}|${row.amount}`)).size).toBe(105);
    expect(Number(output.feeLedger.rows.reduce((sum: number, row: any) => sum + row.amount, 0).toFixed(2))).toBe(3552.45);
    expect(canonical.feeLedger.rows).toHaveLength(105);
    expect(canonical.feeLedger.sourceOccurrences).toHaveLength(105);
    expect(canonical.feeLedger.uniqueChargeTotal).toEqual({ amountMinor: 355245, currency: "USD" });
    expect(canonical.feeLedger.controls.at(-1)).toMatchObject({
      label: "Unique canonical fee total to printed fee total",
      status: "pass",
      deltaMinor: 0,
    });

    expect(structured.interchangeAudit).toMatchObject({
      rowCount: 73,
      transactionCount: 3310,
      volume: 171283.93,
      totalPaid: 2850.23,
    });
    expect(Math.abs(structured.interchangeAudit.totalVariance ?? Infinity)).toBeLessThanOrEqual(0.1);
    expect(new Set(structured.interchangeAuditRows.map((row) => `${row.pageNumber}|${row.rowIndex}|${row.label}`)).size).toBe(73);
    expect(structured.interchangeAuditRows.every((row) => row.pageNumber === 6 || row.pageNumber === 7)).toBe(true);
    expect(structured.interchangeAuditRows.every((row) => row.evidenceLine.startsWith(`${row.label} |`))).toBe(true);

    const expectedBrandTotals = {
      Mastercard: { count: 24, transactionCount: 492, volume: 25317.39, totalPaid: 466.53 },
      Visa: { count: 31, transactionCount: 2634, volume: 135961.9, totalPaid: 2131.77 },
      Discover: { count: 10, transactionCount: 68, volume: 3485.04, totalPaid: 75.69 },
      AmEx: { count: 8, transactionCount: 116, volume: 6519.6, totalPaid: 176.24 },
    } as const;
    for (const [brand, expected] of Object.entries(expectedBrandTotals)) {
      const rows = structured.interchangeAuditRows.filter((row) => row.cardBrand === brand);
      expect(rows).toHaveLength(expected.count);
      expect(rows.reduce((sum, row) => sum + (row.transactionCount ?? 0), 0)).toBe(expected.transactionCount);
      expect(Number(rows.reduce((sum, row) => sum + (row.volume ?? 0), 0).toFixed(2))).toBe(expected.volume);
      expect(Number(rows.reduce((sum, row) => sum + (row.totalPaid ?? 0), 0).toFixed(2))).toBe(expected.totalPaid);
    }

    const preferred = structured.interchangeAuditRows.find((row) => row.label === "VI-SIGNATURE PREFERRED CRP ELC");
    expect(preferred).toMatchObject({
      cardBrand: "Visa",
      salesSharePercent: 25,
      transactionSharePercent: 23,
      transactionCount: 611,
      volume: 33949.67,
      ratePercent: 2.4,
      rateBps: 240,
      perItemFee: 0.1,
      totalPaid: 875.91,
      pageNumber: 6,
    });
    expect(structured.interchangeAuditRows.find((row) => row.label === "MC-KEY ENTERED (DB)")).toMatchObject({
      salesSharePercent: 5,
      transactionSharePercent: 4,
      transactionCount: 19,
      volume: 1273.33,
      ratePercent: 1.65,
      perItemFee: 0.15,
      totalPaid: 23.87,
    });
    expect(structured.interchangeAuditRows.find((row) => row.label === "VI-SIGNATURE CARD ELECTRONIC")).toMatchObject({
      cardBrand: "Visa",
      transactionCount: 224,
      volume: 11525.4,
      ratePercent: 2.3,
      perItemFee: 0.1,
      totalPaid: 287.49,
      pageNumber: 7,
    });
    expect(structured.interchangeAuditRows.find((row) => row.label === "VI-CPS/RESTAURANT CREDIT")).toMatchObject({
      cardBrand: "Visa",
      cardType: "Credit",
      transactionCount: 39,
      volume: 1935.87,
      ratePercent: 1.54,
      perItemFee: 0.1,
      totalPaid: 33.72,
      pageNumber: 7,
    });

    const productCredit = canonical.feeLedger.rows.find((row) => row.selectedLabel.includes("VI-CPS/RESTAURANT CREDIT"));
    expect(productCredit).toMatchObject({
      role: "individual_charge",
      selectedAmount: { amountMinor: 3372, currency: "USD" },
      signedAmount: { amountMinor: 3372, currency: "USD" },
      contributesToUniqueTotal: true,
    });

    const assessments = output.feeLedger.rows.filter((row: any) => /ASSESSMENT/i.test(row.description));
    expect(assessments.map((row: any) => [row.description, row.amount, row.volumeBasis, row.rate])).toEqual([
      ["MASTERCARD ASSESSMENT FEE .0012 TIMES $25317.39", 30.38, 25317.39, 12],
      ["VISA ASSESSMENT FEE DB .0013 TIMES $74283.58", 96.56, 74283.58, 13],
      ["VISA ASSESSMENT FEE CR .0014 TIMES $61678.32", 86.36, 61678.32, 14],
      ["DISCOVER DUES/ASSESSMENT FEE .0013 TIMES $3485.04", 4.53, 3485.04, 13],
      ["AMEX ASSESSMENT FEE .0015 TIMES $6519.6", 9.8, 6519.6, 15],
    ]);
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
