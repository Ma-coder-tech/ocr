import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analyzer.js";
import { evaluateChecklistReport } from "../src/checklistEngine.js";
import type { ParsedDocument } from "../src/parser.js";
import { detectProcessorIdentity } from "../src/processorDetection.js";

function parsedText(text: string): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [{ content: text }],
    textPreview: text,
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: [],
      lineCount: 1,
      amountTokenCount: 0,
      hasExtractableText: true,
    },
  };
}

describe("processor detection", () => {
  it("keeps analyzer and checklist identity aligned when an alias only appears in parsed rows", async () => {
    const parsed: ParsedDocument = {
      sourceType: "csv",
      headers: ["Sales Volume", "Processing Fee"],
      rows: [
        {
          content: "Remit processor fees to Omaha, NE 68103-2394",
          "Sales Volume": 1000,
          "Processing Fee": -25,
        },
      ],
      textPreview: "Monthly processing summary",
      extraction: {
        mode: "structured",
        qualityScore: 1,
        reasons: [],
        lineCount: 1,
        amountTokenCount: 2,
        hasExtractableText: true,
      },
    };

    const summary = analyzeDocument(parsed, "other");
    const checklist = await evaluateChecklistReport(parsed, summary);

    expect(summary.processorName).toBe("Fiserv / First Data (Interchange-Plus)");
    expect(checklist.processorDetection.detectedProcessorName).toBe(summary.processorName);
    expect(checklist.processorDetection.source).toBe("row_corpus");
    expect(checklist.processorSpecific.processorName).toBe(summary.processorName);
  });

  it("does not identify Fiserv from tier labels without an identity signal", () => {
    const detection = detectProcessorIdentity(parsedText("qualified mid-qualified non-qualified rates"));

    expect(detection.detectedProcessorName).toBeNull();
    expect(detection.rulePackId).toBeNull();
  });

  it("uses pricing context to choose the bundled Fiserv rule pack after identity is known", () => {
    const detection = detectProcessorIdentity(parsedText("First Data qualified mid-qualified non-qualified statement"));

    expect(detection.detectedProcessorName).toBe("Fiserv / First Data (Bundled)");
    expect(detection.rulePackId).toBe("fiserv_first_data_bundled");
  });
});
