import {
  countAmountTokens,
  emptyQuality,
  type DocumentExtractionQuality,
  type DocumentExtractionSource,
  type DocumentIR,
  type DocumentPage,
} from "./documentIr.js";

export function mergeDocumentIr(
  documents: DocumentIR[],
  options: { sourceFileName?: string | null; id?: string } = {},
): DocumentIR {
  if (documents.length === 0) {
    throw new Error("Cannot merge DocumentIR without at least one source document.");
  }

  const pdfjs = documents.find((doc) => doc.extractionSources.includes("pdfjs"));
  const primaryTextDoc = pdfjs ?? documents[0]!;
  const pageNumbers = [...new Set(documents.flatMap((doc) => doc.pages.map((page) => page.pageNumber)))].sort(
    (left, right) => left - right,
  );

  const pages: DocumentPage[] = pageNumbers.map((pageNumber) => {
    const primaryPage = primaryTextDoc.pages.find((page) => page.pageNumber === pageNumber);
    const sourcePages = documents.flatMap((doc) => doc.pages.filter((page) => page.pageNumber === pageNumber));
    const bestGeometryPage = sourcePages.find((page) => page.width !== null || page.height !== null);
    return {
      pageNumber,
      width: bestGeometryPage?.width ?? null,
      height: bestGeometryPage?.height ?? null,
      unit: bestGeometryPage?.unit ?? null,
      lines: primaryPage?.lines ?? sourcePages.flatMap((page) => page.lines),
      words: sourcePages.flatMap((page) => page.words),
      tables: sourcePages.flatMap((page) => page.tables),
    };
  });

  const extractionSources = unique(documents.flatMap((doc) => doc.extractionSources));
  const bySource = extractionSources.map((source) => mergeQualityForSource(source, documents));
  const allText = pages.flatMap((page) => page.lines.map((line) => line.text)).join("\n");
  const mergedSource = primaryTextDoc.extractionSources[0] ?? "pdfjs";
  const explicitWordCount = pages.reduce((sum, page) => sum + page.words.length, 0);
  const primaryWordCount = primaryTextDoc.quality.merged.wordCount;
  const mergedQuality: DocumentExtractionQuality = {
    source: mergedSource,
    pageCount: pages.length,
    lineCount: pages.reduce((sum, page) => sum + page.lines.length, 0),
    wordCount: Math.max(explicitWordCount, primaryWordCount),
    tableCount: pages.reduce((sum, page) => sum + page.tables.length, 0),
    tableCellCount: pages.reduce((sum, page) => sum + page.tables.reduce((tableSum, table) => tableSum + table.cells.length, 0), 0),
    amountTokenCount: Math.max(countAmountTokens(allText), primaryTextDoc.quality.merged.amountTokenCount),
    hasText: allText.trim().length > 0,
    notes: [
      "Merged conservatively: primary text comes from pdfjs when available; Azure contributes layout tables/cells.",
    ],
  };

  return {
    id: options.id ?? "document-ir-merged",
    sourceFileName: options.sourceFileName ?? primaryTextDoc.sourceFileName,
    extractionSources,
    pages,
    sections: [],
    quality: {
      bySource,
      merged: mergedQuality,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      mergeStrategy: pdfjs ? "pdfjs_text_plus_azure_layout" : "single_or_non_pdfjs_sources",
    },
  };
}

function mergeQualityForSource(source: DocumentExtractionSource, documents: DocumentIR[]): DocumentExtractionQuality {
  const qualities = documents.flatMap((doc) => doc.quality.bySource.filter((quality) => quality.source === source));
  if (qualities.length === 0) return emptyQuality(source);
  return {
    source,
    pageCount: Math.max(...qualities.map((quality) => quality.pageCount)),
    lineCount: qualities.reduce((sum, quality) => sum + quality.lineCount, 0),
    wordCount: qualities.reduce((sum, quality) => sum + quality.wordCount, 0),
    tableCount: qualities.reduce((sum, quality) => sum + quality.tableCount, 0),
    tableCellCount: qualities.reduce((sum, quality) => sum + quality.tableCellCount, 0),
    amountTokenCount: qualities.reduce((sum, quality) => sum + quality.amountTokenCount, 0),
    hasText: qualities.some((quality) => quality.hasText),
    notes: qualities.flatMap((quality) => quality.notes),
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
