import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "../src/parser.js";
import { detectPreflightFailure } from "../src/preflight.js";

function makeParsedDocument(text: string): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [{ content: text }],
    textPreview: text,
    extraction: {
      mode: "text_only",
      qualityScore: 0.5,
      reasons: [],
      lineCount: 1,
      amountTokenCount: (text.match(/\d/g) ?? []).length,
      hasExtractableText: true,
    },
  };
}

describe("detectPreflightFailure", () => {
  it("flags likely bank statements", () => {
    const parsed = makeParsedDocument(
      "Account Summary Beginning Balance Ending Balance Available Balance Deposits and Additions Checks Paid",
    );

    expect(detectPreflightFailure(parsed)).toContain("This looks like a bank statement");
  });

  it("allows likely processor statements", () => {
    const parsed = makeParsedDocument(
      "Merchant Statement Payment Processing Interchange Markup Assessment Dues Processing Fee Fees Charged PCI",
    );

    expect(detectPreflightFailure(parsed)).toBeNull();
  });

  it("flags empty or non-processor files with too few fee signals", () => {
    const parsed = makeParsedDocument("invoice total due");
    parsed.extraction.amountTokenCount = 0;

    expect(detectPreflightFailure(parsed)).toContain("We couldn't find payment fee data");
  });
});
