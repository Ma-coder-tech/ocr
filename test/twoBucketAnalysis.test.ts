import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "../src/parser.js";
import { buildTwoBucketAnalysis } from "../src/twoBucketAnalysis.js";
import type { AnalysisSummary, StatementEconomicRollup } from "../src/types.js";

function parsedDocument(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    textPreview: "",
    extraction: {
      mode: "structured",
      qualityScore: 90,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 3,
      hasExtractableText: true,
    },
    rows: [
      { content: "Total fees due $300.00" },
      { content: "Total Interchange Charges/Program Fees $180.00" },
      { content: "Total Service Charges  $120.00" },
    ],
  };
}

function uninformativeDocument(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    textPreview: "",
    extraction: {
      mode: "structured",
      qualityScore: 90,
      reasons: [],
      lineCount: 1,
      amountTokenCount: 0,
      hasExtractableText: true,
    },
    rows: [{ content: "Monthly statement summary" }],
  };
}

function summary(): AnalysisSummary {
  return { totalFees: 300 } as AnalysisSummary;
}

function structuredRollup(overrides: Partial<StatementEconomicRollup> = {}): StatementEconomicRollup {
  return {
    totalVolume: 10000,
    totalFees: 300,
    cardBrandPassThrough: 180,
    processorMarkup: 100,
    addOnFees: 20,
    confidence: 0.8,
    feeRows: [
      {
        label: "card brand interchange detail",
        amount: 180,
        bucket: "card_brand_pass_through",
        sourceSection: "Interchange detail",
        evidenceLine: "Rollup from captured interchange audit rows",
        rowIndex: -1,
        confidence: 0.8,
      },
      {
        label: "processor markup detail",
        amount: 100,
        bucket: "processor_markup",
        sourceSection: "Processor markup detail",
        evidenceLine: "Rollup from captured processor markup rows",
        rowIndex: -1,
        confidence: 0.8,
      },
      {
        label: "monthly service fee",
        amount: 20,
        bucket: "add_on_fees",
        sourceSection: "Fees",
        evidenceLine: "Monthly Service Fee $20.00",
        rowIndex: 22,
        confidence: 0.8,
      },
    ],
    ...overrides,
  };
}

describe("two-bucket analysis source selection", () => {
  it("prefers reportable structured rollup over text extraction", () => {
    const analysis = buildTwoBucketAnalysis(parsedDocument(), summary(), { economicRollup: structuredRollup() });

    expect(analysis.source).toBe("structured_rollup");
    expect(analysis.available).toBe(true);
    expect(analysis.cardBrandTotal).toBe(180);
    expect(analysis.processorControlledTotal).toBe(120);
  });

  it("falls back to statement text when structured rollup confidence is too low", () => {
    const analysis = buildTwoBucketAnalysis(parsedDocument(), summary(), {
      economicRollup: structuredRollup({
        confidence: 0.3,
        cardBrandPassThrough: 50,
        processorMarkup: 250,
        addOnFees: null,
      }),
    });

    expect(analysis.source).toBe("statement_text");
    expect(analysis.available).toBe(true);
    expect(analysis.cardBrandTotal).toBe(180);
    expect(analysis.processorControlledTotal).toBe(120);
  });

  it("uses classified summary fee rows when stronger sources are unavailable", () => {
    const analysis = buildTwoBucketAnalysis(
      uninformativeDocument(),
      {
        totalFees: 300,
        interchangeAudit: { totalPaid: 180 },
        feeBreakdown: [
          {
            label: "Processor Markup",
            amount: 100,
            sharePct: 33.33,
            feeClass: "processor_markup",
            broadType: "Processor",
            classificationConfidence: "high",
          },
          {
            label: "Monthly Service Fee",
            amount: 20,
            sharePct: 6.67,
            feeClass: "processor_service_add_on",
            broadType: "Service / compliance",
            classificationConfidence: "high",
          },
        ],
      } as AnalysisSummary,
    );

    expect(analysis.source).toBe("summary_fee_rows");
    expect(analysis.available).toBe(true);
    expect(analysis.cardBrandTotal).toBe(180);
    expect(analysis.processorControlledTotal).toBe(120);
  });

  it("reads Fiserv processor-branded card and miscellaneous fee totals as a two-bucket split", () => {
    const doc: ParsedDocument = {
      sourceType: "pdf",
      headers: [],
      textPreview: "",
      extraction: {
        mode: "structured",
        qualityScore: 90,
        reasons: [],
        lineCount: 4,
        amountTokenCount: 4,
        hasExtractableText: true,
      },
      rows: [
        { content: "FEES CHARGED" },
        { content: "Total Card Fees | -$1,542.28" },
        { content: "Total Miscellaneous Fees | -23.45" },
        { content: "Total (Miscellaneous Fees and Card Fees) | -$1,565.73" },
      ],
    };

    const analysis = buildTwoBucketAnalysis(doc, { totalFees: 1565.73 } as AnalysisSummary);

    expect(analysis.source).toBe("statement_text");
    expect(analysis.available).toBe(true);
    expect(analysis.totalFees).toBe(1565.73);
    expect(analysis.cardBrandTotal).toBe(1542.28);
    expect(analysis.processorControlledTotal).toBe(23.45);
    expect(analysis.reconciliationDeltaUsd).toBe(0);
  });
});
