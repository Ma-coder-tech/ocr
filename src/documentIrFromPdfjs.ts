import type { ParsedDocument } from "./parser.js";
import {
  blankGeometry,
  countAmountTokens,
  makeEvidence,
  type DocumentIR,
  type DocumentLine,
  type DocumentPage,
} from "./documentIr.js";

export function documentIrFromPdfjsParsedDocument(
  doc: ParsedDocument,
  options: { sourceFileName?: string | null; id?: string } = {},
): DocumentIR {
  const lines = doc.rows
    .map((row, index): DocumentLine | null => {
      const text = String(row.content ?? "").trim();
      if (!text) return null;
      const pageNumber = parsePageNumber(row.page);
      const id = `pdfjs-line-${index}`;
      return {
        id,
        text,
        pageNumber,
        confidence: null,
        source: "pdfjs",
        ...blankGeometry(),
        evidence: [makeEvidence({ source: "pdfjs", sourceId: id, pageNumber, text })],
      };
    })
    .filter((line): line is DocumentLine => line !== null);

  const pages = groupLinesIntoPages(lines);
  const text = lines.map((line) => line.text).join("\n");
  const quality = {
    source: "pdfjs" as const,
    pageCount: pages.length,
    lineCount: lines.length,
    wordCount: countWords(text),
    tableCount: 0,
    tableCellCount: 0,
    amountTokenCount: doc.extraction.amountTokenCount || countAmountTokens(text),
    hasText: doc.extraction.hasExtractableText,
    notes: doc.extraction.reasons,
  };

  return {
    id: options.id ?? "document-ir-pdfjs",
    sourceFileName: options.sourceFileName ?? null,
    extractionSources: ["pdfjs"],
    pages,
    sections: [],
    quality: {
      bySource: [quality],
      merged: quality,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      mergeStrategy: "single_source_pdfjs",
    },
  };
}

function parsePageNumber(value: unknown): number {
  const match = String(value ?? "").match(/page-(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function groupLinesIntoPages(lines: DocumentLine[]): DocumentPage[] {
  const pageNumbers = [...new Set(lines.map((line) => line.pageNumber))].sort((left, right) => left - right);
  return pageNumbers.map((pageNumber) => ({
    pageNumber,
    width: null,
    height: null,
    unit: null,
    lines: lines.filter((line) => line.pageNumber === pageNumber),
    words: [],
    tables: [],
  }));
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
