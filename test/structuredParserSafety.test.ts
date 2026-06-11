import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "../src/parser.js";
import { extractStructuredStatementFacts } from "../src/statementSections.js";

function fiservProcessorBrandedFeeDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    textPreview: "",
    extraction: {
      mode: "structured",
      qualityScore: 90,
      reasons: [],
      lineCount: 18,
      amountTokenCount: 12,
      hasExtractableText: true,
    },
    rows: [
      { content: "PO BOX 3429, THOUSAND OAKS CA 91359" },
      { content: "Merchant Number | 4223 698701145467" },
      { content: "Customer Service | 800-324-9825 | Statement Period | 02/01/24 - 02/29/24" },
      { content: "Date | Total" },
      { content: "02/29/24 | $38,758.59" },
      { content: "Total | $38,758.59" },
      { content: "FEES CHARGED" },
      { content: "Date | Type | Description | Volume | Rate | Total" },
      { content: "02/29/24 | CF | MQUAL DISC | $6,046.70 | -205.59" },
      { content: "02/29/24 | CF | NQUAL DISC | $8,015.38 | -272.52" },
      { content: "Total Card Fees | -$1,542.28" },
      { content: "02/29/24 | MISC | STATEMENT FEE | -7.57" },
      { content: "Total Miscellaneous Fees | -23.45" },
      { content: "Total (Miscellaneous Fees and Card Fees) | -$1,565.73" },
      { content: "**For detailed information regarding Additional Fees, please contact Merchant Services at 800-554-2777" },
      { content: "FEB | Gross Reportable Sales - TIN XXXXX9304 | $36,912.94" },
      { content: "Page 6 of 6" },
      { content: "nnnnnn 06 06 025377 170097R" },
    ],
  };
}

describe("structured parser safety", () => {
  it("extracts Fiserv processor-branded fee totals without accepting metadata as economic rows", () => {
    const facts = extractStructuredStatementFacts(fiservProcessorBrandedFeeDoc(), { trace: true });

    expect(facts.economicRollup.totalVolume).toBe(38758.59);
    expect(facts.economicRollup.totalFees).toBe(1565.73);
    expect(facts.economicRollup.cardBrandPassThrough).toBe(1542.28);
    expect(facts.economicRollup.addOnFees).toBe(23.45);
    expect(facts.economicRollup.feeRows).toHaveLength(2);

    const evidence = facts.economicRollup.feeRows.map((row) => row.evidenceLine).join("\n");
    expect(evidence).not.toContain("Merchant Number");
    expect(evidence).not.toContain("PO BOX");
    expect(evidence).not.toContain("Customer Service");
    expect(evidence).not.toContain("Page 6 of 6");

    const rejectedReasons = facts.parserTrace?.events
      .filter((event) => event.type === "rejected_row")
      .map((event) => (event.type === "rejected_row" ? event.reason : ""));
    expect(rejectedReasons).toEqual(
      expect.arrayContaining(["merchant identifier", "mailing address", "statement metadata", "page number"]),
    );
  });
});
