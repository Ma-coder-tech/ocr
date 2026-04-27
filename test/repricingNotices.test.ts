import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import type { ParsedDocument } from "../src/parser.js";
import { extractRepricingEventsFromNoticeLines } from "../src/repricingNotices.js";

function repricingNoticeDoc(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "IMPORTANT NOTICES" },
      { content: "Effective September 1, 2026" },
      { content: "Monthly service fee will increase" },
      { content: "from $29.95 to $49.95. Continued use of your account means you accept these terms." },
      { content: "SUMMARY" },
      { content: "Total Sales | $10,000.00" },
      { content: "Total Fees | $300.00" },
    ],
    textPreview:
      "IMPORTANT NOTICES Effective September 1 2026 Monthly service fee will increase from $29.95 to $49.95 Continued use accept terms SUMMARY Total Sales 10000 Total Fees 300",
    extraction: {
      mode: "structured",
      qualityScore: 0.94,
      reasons: [],
      lineCount: 7,
      amountTokenCount: 4,
      hasExtractableText: true,
    },
  };
}

describe("repricing notice extraction", () => {
  it("extracts old/new values from multi-line notice windows", () => {
    const events = extractRepricingEventsFromNoticeLines([
      { rowIndex: 1, sourceSection: "Important notices", evidenceLine: "Effective September 1, 2026" },
      { rowIndex: 2, sourceSection: "Important notices", evidenceLine: "Monthly service fee will increase" },
      {
        rowIndex: 3,
        sourceSection: "Important notices",
        evidenceLine: "from $29.95 to $49.95. Continued use of your account means you accept these terms.",
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "fee_increase",
      feeLabel: "monthly service fee",
      effectiveDate: "September 1, 2026",
      disclosureStyle: "acceptance_by_use",
      oldValue: { value: 29.95, valueType: "money", source: "explicit" },
      newValue: { value: 49.95, valueType: "money", source: "explicit" },
      deltaValue: { value: 20, valueType: "money", source: "inferred" },
    });
  });

  it("extracts new-fee and basis-point increase events without inventing old values", () => {
    const events = extractRepricingEventsFromNoticeLines([
      {
        rowIndex: 1,
        sourceSection: "Statement notices",
        evidenceLine: "Effective 09/01/2026, a new PCI compliance fee of $19.95 will apply.",
      },
      {
        rowIndex: 2,
        sourceSection: "Statement notices",
        evidenceLine: "Rates will increase by 10 basis points beginning May 2026.",
      },
    ]);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "new_fee",
          feeLabel: "pci compliance fee",
          newValue: expect.objectContaining({ value: 19.95, valueType: "money", source: "explicit" }),
        }),
        expect.objectContaining({
          kind: "rate_increase",
          oldValue: null,
          newValue: null,
          deltaValue: expect.objectContaining({ value: 10, valueType: "basis_points", source: "explicit" }),
        }),
      ]),
    );
  });

  it("handles sub-dollar fee notation without deriving impossible old values", () => {
    const events = extractRepricingEventsFromNoticeLines([
      {
        rowIndex: 1,
        sourceSection: "Statement notices",
        evidenceLine: "Effective May 2026, authorization fee will increase by $.02 to $.10 per transaction.",
      },
      {
        rowIndex: 2,
        sourceSection: "Statement notices",
        evidenceLine: "Effective June 2026, gateway fee will increase by $20.00 to $10.00.",
      },
    ]);

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeLabel: "authorization fee",
          oldValue: expect.objectContaining({ value: 0.08, valueType: "money", cadence: "per_item" }),
          newValue: expect.objectContaining({ value: 0.1, valueType: "money", cadence: "per_item" }),
          deltaValue: expect.objectContaining({ value: 0.02, valueType: "money", source: "explicit" }),
        }),
        expect.objectContaining({
          feeLabel: "gateway fee",
          oldValue: null,
          newValue: expect.objectContaining({ value: 10, valueType: "money" }),
          deltaValue: expect.objectContaining({ value: 20, valueType: "money", source: "explicit" }),
        }),
      ]),
    );
  });

  it("carries repricing events through analysis and checklist without adding notice amounts to fee breakdown", async () => {
    const summary = analyzeDocument(repricingNoticeDoc(), "other");

    expect(summary.repricingEvents).toHaveLength(1);
    expect(summary.repricingEvents?.[0].newValue).toMatchObject({ value: 49.95 });
    expect(summary.feeBreakdown.some((row) => row.amount === 49.95 || row.amount === 29.95)).toBe(false);

    const checklist = await evaluateChecklistReport(repricingNoticeDoc(), summary);
    expect(checklist.universal.results.find((result) => result.id === "E014")?.status).toBe("warning");
    expect(checklist.universal.results.find((result) => result.id === "E041")?.status).toBe("warning");
    expect(checklist.universal.results.find((result) => result.id === "E041")?.evidence.join(" ")).toContain(
      "old=$29.95",
    );
  });
});
