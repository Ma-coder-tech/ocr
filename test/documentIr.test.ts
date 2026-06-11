import { describe, expect, it } from "vitest";
import type { AzureLayoutDocument } from "../src/azureDocumentIntelligence.js";
import { documentIrFromAzureLayout } from "../src/documentIrFromAzure.js";
import { documentIrFromPdfjsParsedDocument } from "../src/documentIrFromPdfjs.js";
import {
  assessFiservFirstDataFamily,
  attachFiservDocumentSections,
  detectFiservDocumentSections,
} from "../src/fiservDocumentSections.js";
import { mergeDocumentIr } from "../src/mergeDocumentIr.js";
import type { ParsedDocument } from "../src/parser.js";

describe("DocumentIR foundation", () => {
  it("preserves pdfjs as primary text and attaches Azure tables as layout evidence", () => {
    const pdfjsIr = documentIrFromPdfjsParsedDocument(fakePdfjsDocument(), { sourceFileName: "sample.pdf" });
    const azureIr = documentIrFromAzureLayout(fakeAzureLayout(), { sourceFileName: "sample.pdf" });
    const merged = mergeDocumentIr([pdfjsIr, azureIr], { sourceFileName: "sample.pdf" });

    expect(merged.extractionSources).toEqual(["pdfjs", "azure_document_intelligence"]);
    expect(merged.pages.flatMap((page) => page.lines.map((line) => line.source))).toEqual(
      Array(fakePdfjsDocument().rows.length).fill("pdfjs"),
    );
    expect(merged.pages[0]?.tables).toHaveLength(1);
    expect(merged.pages[0]?.tables[0]?.cells.map((cell) => cell.text)).toContain("Submitted Amount");
    expect(merged.metadata.mergeStrategy).toBe("pdfjs_text_plus_azure_layout");
  });

  it("recognizes Fiserv family and detects sections by structure instead of exact brand", () => {
    const merged = mergeDocumentIr([
      documentIrFromPdfjsParsedDocument(fakePdfjsDocument(), { sourceFileName: "merchant-one-variant.pdf" }),
      documentIrFromAzureLayout(fakeAzureLayout(), { sourceFileName: "merchant-one-variant.pdf" }),
    ]);
    const family = assessFiservFirstDataFamily(merged);
    const sections = detectFiservDocumentSections(merged);

    expect(family.isLikelyFiservFirstData).toBe(true);
    expect(family.matchedSignals).toEqual(
      expect.arrayContaining(["THIS IS NOT A BILL", "Merchant Number", "Statement Period", "Fees Charged"]),
    );
    expect(family.decisionReason).toContain("Accepted");
    expect(sections.map((section) => section.type)).toEqual(
      expect.arrayContaining(["summary", "funding", "fees"]),
    );
    expect(sections.map((section) => section.familySectionType)).toEqual(
      expect.arrayContaining(["summary", "amounts_funded_by_batch", "fees_charged"]),
    );
  });

  it("does not accept generic merchant-statement labels without a Fiserv brand or funding cluster", () => {
    const ir = documentIrFromPdfjsParsedDocument(fakeGenericMerchantStatement());
    const family = assessFiservFirstDataFamily(ir);

    expect(family.isLikelyFiservFirstData).toBe(false);
    expect(family.matchedSignals).toEqual(expect.arrayContaining(["Merchant Number", "Statement Period", "Fees Charged"]));
    expect(family.decisionReason).toContain("Not accepted");
  });

  it("accepts white-label Fiserv structure when the funding table is distinctive but the brand is absent", () => {
    const merged = mergeDocumentIr([
      documentIrFromPdfjsParsedDocument(fakeWhiteLabelFiservStructure(), { sourceFileName: "white-label.pdf" }),
      documentIrFromAzureLayout(fakeAzureLayout(), { sourceFileName: "white-label.pdf" }),
    ]);
    const family = assessFiservFirstDataFamily(merged);

    expect(family.isLikelyFiservFirstData).toBe(true);
    expect(family.matchedSignals).toEqual(expect.arrayContaining(["THIS IS NOT A BILL", "Amounts Funded by Batch", "Fees Charged"]));
    expect(family.decisionReason).toContain("funding and fee-section structure");
  });

  it("attaches detected sections back onto the IR for downstream family modules", () => {
    const ir = documentIrFromPdfjsParsedDocument(fakePdfjsDocument());
    const withSections = attachFiservDocumentSections(ir);

    expect(withSections.sections.length).toBeGreaterThan(0);
    expect(ir.sections).toHaveLength(0);
  });

  it("builds page-local section line ranges that stop before the next section heading", () => {
    const ir = documentIrFromPdfjsParsedDocument(fakeMultiSectionDocument());
    const sections = detectFiservDocumentSections(ir);
    const summary = sections.find((section) => section.familySectionType === "summary");
    const fees = sections.find((section) => section.familySectionType === "fees_charged");
    const funding = sections.find((section) => section.familySectionType === "amounts_funded_by_batch");

    expect(summary?.lineIds).toEqual(["pdfjs-line-0", "pdfjs-line-1"]);
    expect(summary?.endLineId).toBe("pdfjs-line-1");
    expect(fees?.lineIds).toEqual(["pdfjs-line-2", "pdfjs-line-3"]);
    expect(fees?.endLineId).toBe("pdfjs-line-3");
    expect(funding?.startLineId).toBe("pdfjs-line-4");
    expect(funding?.lineIds).toEqual(["pdfjs-line-4", "pdfjs-line-5"]);
  });
});

function fakePdfjsDocument(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content", "page"],
    rows: [
      { page: "page-1", content: "Page 1 of 4 | THIS IS NOT A BILL" },
      { page: "page-1", content: "Statement Period | 10/01/25 - 10/31/25 | Merchant Number | 4228993800141883" },
      { page: "page-1", content: "SUMMARY | An overview of account activity for the statement period." },
      { page: "page-1", content: "Amounts Submitted | Third Party Transactions | Adjustments/Chargebacks | Fees Charged | Amount Funded" },
      { page: "page-2", content: "FEES CHARGED | Date | Type | Description | Volume | Rate | Total" },
    ],
    textPreview:
      "THIS IS NOT A BILL Statement Period Merchant Number SUMMARY Amounts Submitted Fees Charged Amount Funded",
    extraction: {
      mode: "structured",
      qualityScore: 0.85,
      reasons: [],
      lineCount: 5,
      amountTokenCount: 3,
      hasExtractableText: true,
    },
  };
}

function fakeGenericMerchantStatement(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content", "page"],
    rows: [
      { page: "page-1", content: "Statement Period | 10/01/25 - 10/31/25 | Merchant Number | 123456789" },
      { page: "page-1", content: "SUMMARY" },
      { page: "page-2", content: "FEES CHARGED | Total Fees | $100.00" },
    ],
    textPreview: "Statement Period Merchant Number SUMMARY Fees Charged",
    extraction: {
      mode: "structured",
      qualityScore: 0.78,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 1,
      hasExtractableText: true,
    },
  };
}

function fakeWhiteLabelFiservStructure(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content", "page"],
    rows: [
      { page: "page-1", content: "THIS IS NOT A BILL" },
      { page: "page-1", content: "Statement Period | 12/01/25 - 12/31/25 | Merchant Number | 987654321" },
      { page: "page-2", content: "FEES CHARGED | Date | Type | Description | Volume | Rate | Total" },
    ],
    textPreview: "THIS IS NOT A BILL Statement Period Merchant Number Fees Charged",
    extraction: {
      mode: "structured",
      qualityScore: 0.8,
      reasons: [],
      lineCount: 3,
      amountTokenCount: 1,
      hasExtractableText: true,
    },
  };
}

function fakeMultiSectionDocument(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content", "page"],
    rows: [
      { page: "page-1", content: "SUMMARY | An overview of account activity for the statement period." },
      { page: "page-1", content: "Amounts Submitted | $100.00 | Fees Charged | $5.00 | Amount Funded | $95.00" },
      { page: "page-1", content: "FEES CHARGED" },
      { page: "page-1", content: "02/29/24 | CF | NABU FEES | 10 | 0.01950 | -0.20" },
      { page: "page-2", content: "AMOUNTS FUNDED BY BATCH | Date Submitted | Submitted Amount | Amount Processed" },
      { page: "page-2", content: "02/29/24 | $100.00 | $95.00" },
    ],
    textPreview: "SUMMARY Amounts Submitted Fees Charged Amount Funded AMOUNTS FUNDED BY BATCH",
    extraction: {
      mode: "structured",
      qualityScore: 0.86,
      reasons: [],
      lineCount: 6,
      amountTokenCount: 8,
      hasExtractableText: true,
    },
  };
}

function fakeAzureLayout(): AzureLayoutDocument {
  return {
    source: "azure_document_intelligence",
    modelId: "prebuilt-layout",
    apiVersion: "2024-11-30",
    content:
      "SUMMARY Amounts Submitted Fees Charged Date Submitted Submitted Amount Chargebacks/Reversals Adjustments Fees Amount Processed",
    pages: [
      {
        pageNumber: 1,
        width: 8.5,
        height: 11,
        unit: "inch",
        lines: [{ content: "SUMMARY", pageNumber: 1 }],
        words: [],
      },
    ],
    tables: [
      {
        rowCount: 2,
        columnCount: 6,
        boundingRegions: [{ pageNumber: 1 }],
        cells: [
          {
            content: "Date Submitted",
            rowIndex: 0,
            columnIndex: 0,
            rowSpan: 1,
            columnSpan: 1,
            kind: "columnHeader",
            boundingRegions: [{ pageNumber: 1 }],
          },
          {
            content: "Submitted Amount",
            rowIndex: 0,
            columnIndex: 1,
            rowSpan: 1,
            columnSpan: 1,
            kind: "columnHeader",
            boundingRegions: [{ pageNumber: 1 }],
          },
          {
            content: "Amount Processed",
            rowIndex: 0,
            columnIndex: 5,
            rowSpan: 1,
            columnSpan: 1,
            kind: "columnHeader",
            boundingRegions: [{ pageNumber: 1 }],
          },
        ],
      },
    ],
    metrics: {
      pageCount: 1,
      lineCount: 1,
      wordCount: 8,
      tableCount: 1,
      tableCellCount: 3,
      amountTokenCount: 0,
    },
  };
}
