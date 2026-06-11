import { describe, expect, it } from "vitest";
import {
  findLastRow,
  findRow,
  integerTokens,
  requireAmount,
  requireSignedAmount,
  rowContent,
  signedMoneyTokens,
  type RawExtractedDocument,
} from "../src/parserFoundation.js";

const doc: RawExtractedDocument = {
  sourceType: "pdf",
  headers: ["content", "page", "label", "value"],
  rows: [
    { content: "Header", page: "page-1" },
    { content: "Total Amount Submitted | $2,400.00", page: "page-1", label: "Total Amount Submitted", value: 2400 },
    { content: "Fees | -$141.31", page: "page-1", label: "Fees", value: 141.31 },
    { content: "TOTAL | -$1,200.00", page: "page-2" },
  ],
  textPreview: "Header Total Amount Submitted Fees",
  extraction: {
    mode: "structured",
    qualityScore: 0.9,
    reasons: [],
    lineCount: 4,
    amountTokenCount: 3,
    hasExtractableText: true,
  },
};

describe("parser foundation helpers", () => {
  it("preserves raw row evidence before any financial decision is made", () => {
    const row = findRow(doc, (candidate) => rowContent(candidate).includes("Total Amount Submitted"), "submitted total");

    expect(row).toMatchObject({
      index: 1,
      content: "Total Amount Submitted | $2,400.00",
      pageNumber: 1,
    });
    expect(requireAmount(row, "submitted total")).toBe(2400);
  });

  it("can find the last matching evidence row and preserve signed values when needed", () => {
    const row = findLastRow(doc, (candidate) => rowContent(candidate).startsWith("TOTAL"), "adjustment total");

    expect(row.pageNumber).toBe(2);
    expect(requireSignedAmount(row, "adjustment total")).toBe(-1200);
  });

  it("extracts numeric tokens without deciding their financial meaning", () => {
    expect(signedMoneyTokens("Total | 8 | $2,900.00 | 2 | -$500.00 | 10 | $1,200.00")).toEqual([
      2900,
      -500,
      1200,
    ]);
    expect(integerTokens("Total | 8 | $2,900.00 | 2 | -$500.00 | 10 | $1,200.00")).toEqual([8, 2, 10]);
  });
});
