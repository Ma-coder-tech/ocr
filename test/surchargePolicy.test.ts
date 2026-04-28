import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import type { ParsedDocument } from "../src/parser.js";

function docFromLines(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: lines.map((content) => ({ content })),
    textPreview: lines.join(" "),
    extraction: {
      mode: "structured",
      qualityScore: 0.95,
      reasons: [],
      lineCount: lines.length,
      amountTokenCount: 0,
      hasExtractableText: true,
    },
  };
}

describe("surcharge policy checklist evaluation", () => {
  it("does not treat ordinary debit statement text as surcharge context", async () => {
    const doc = docFromLines([
      "PROCESSING ACTIVITY SUMMARY",
      "Visa Debit Sales | 24 | $1,200.00",
      "Mastercard Debit Network Fee | $4.50",
      "Total Volume | $1,200.00",
      "Total Fees | $24.00",
    ]);
    const summary = analyzeDocument(doc, "other");
    const checklist = await evaluateChecklistReport(doc, summary);

    expect(checklist.universal.results.find((result) => result.id === "E061")?.status).toBe("not_applicable");
    expect(checklist.universal.results.find((result) => result.id === "E063")?.status).toBe("not_applicable");
    expect(checklist.universal.results.find((result) => result.id === "E064")?.status).toBe("not_applicable");
    expect(checklist.universal.results.find((result) => result.id === "E064")?.reason).toContain("ordinary debit");

    const debitExclusion = checklist.crossProcessor.results.find((result) => result.title.includes("debit exclusion"));
    expect(debitExclusion?.status).toBe("not_applicable");
  });

  it("passes debit surcharge prohibition when surcharge policy excludes debit", async () => {
    const doc = docFromLines([
      "Surcharge Program: Credit card surcharge rate 3.00% applies to eligible credit transactions only.",
      "Debit cards are excluded from surcharge.",
      "Surcharge debit identification uses BIN automation to identify debit cards before checkout.",
    ]);
    const summary = analyzeDocument(doc, "other");
    const checklist = await evaluateChecklistReport(doc, summary);

    expect(checklist.universal.results.find((result) => result.id === "E063")?.status).toBe("pass");
    expect(checklist.universal.results.find((result) => result.id === "E064")?.status).toBe("pass");

    const debitExclusion = checklist.crossProcessor.results.find((result) => result.title.includes("debit exclusion"));
    const debitControls = checklist.crossProcessor.results.find((result) => result.title.includes("debit identification controls"));
    expect(debitExclusion?.status).toBe("pass");
    expect(debitControls?.status).toBe("pass");
  });

  it("treats credit-only surcharge language as debit exclusion evidence", async () => {
    const doc = docFromLines(["Surcharge Program: 2.75% surcharge applies to eligible credit transactions only."]);
    const summary = analyzeDocument(doc, "other");
    const checklist = await evaluateChecklistReport(doc, summary);

    expect(checklist.universal.results.find((result) => result.id === "E064")?.status).toBe("pass");
  });

  it("does not fail negated debit-surcharge language", async () => {
    const doc = docFromLines([
      "Surcharge Program: 3.00% surcharge applies to credit card transactions.",
      "Debit cards are not charged a surcharge.",
      "No surcharge on PIN debit cards.",
    ]);
    const summary = analyzeDocument(doc, "other");
    const checklist = await evaluateChecklistReport(doc, summary);

    expect(checklist.universal.results.find((result) => result.id === "E064")?.status).toBe("pass");

    const debitExclusion = checklist.crossProcessor.results.find((result) => result.title.includes("debit exclusion"));
    expect(debitExclusion?.status).toBe("pass");
  });

  it("fails when parsed policy language says debit is surcharged", async () => {
    const doc = docFromLines(["Surcharge applies to debit and credit cards at 3.50%."]);
    const summary = analyzeDocument(doc, "other");
    const checklist = await evaluateChecklistReport(doc, summary);

    expect(checklist.universal.results.find((result) => result.id === "E063")?.status).toBe("fail");
    expect(checklist.universal.results.find((result) => result.id === "E064")?.status).toBe("fail");
    expect(checklist.universal.results.find((result) => result.id === "E064")?.evidence.join(" ")).toContain("debit");

    const debitExclusion = checklist.crossProcessor.results.find((result) => result.title.includes("debit exclusion"));
    expect(debitExclusion?.status).toBe("fail");
  });
});
