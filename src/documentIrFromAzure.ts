import type { AzureLayoutDocument } from "./azureDocumentIntelligence.js";
import {
  bboxFromPolygon,
  countAmountTokens,
  makeEvidence,
  type DocumentIR,
  type DocumentLine,
  type DocumentPage,
  type DocumentTable,
  type DocumentWord,
} from "./documentIr.js";

export function documentIrFromAzureLayout(
  layout: AzureLayoutDocument,
  options: { sourceFileName?: string | null; id?: string } = {},
): DocumentIR {
  const pages: DocumentPage[] = layout.pages.map((page) => {
    const lines: DocumentLine[] = page.lines.map((line, index) => {
      const id = `azure-page-${page.pageNumber}-line-${index}`;
      const polygon = line.polygon ?? null;
      return {
        id,
        text: line.content,
        pageNumber: page.pageNumber,
        confidence: null,
        source: "azure_document_intelligence",
        polygon,
        bbox: bboxFromPolygon(polygon),
        evidence: [
          makeEvidence({
            source: "azure_document_intelligence",
            sourceId: id,
            pageNumber: page.pageNumber,
            text: line.content,
          }),
        ],
      };
    });

    const words: DocumentWord[] = page.words.map((word, index) => {
      const id = `azure-page-${page.pageNumber}-word-${index}`;
      const polygon = word.polygon ?? null;
      return {
        id,
        text: word.content,
        pageNumber: page.pageNumber,
        confidence: word.confidence,
        source: "azure_document_intelligence",
        polygon,
        bbox: bboxFromPolygon(polygon),
      };
    });

    return {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      unit: page.unit,
      lines,
      words,
      tables: [],
    };
  });

  const tables: DocumentTable[] = layout.tables.map((table, tableIndex) => {
    const firstRegion = table.boundingRegions[0] ?? table.cells[0]?.boundingRegions[0];
    const pageNumber = firstRegion?.pageNumber ?? 1;
    const tableId = `azure-table-${tableIndex}`;
    const evidenceText = table.cells
      .slice(0, 12)
      .map((cell) => cell.content)
      .filter(Boolean)
      .join(" | ");
    return {
      id: tableId,
      pageNumber,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      source: "azure_document_intelligence",
      polygon: firstRegion?.polygon ?? null,
      bbox: bboxFromPolygon(firstRegion?.polygon),
      evidence: [
        makeEvidence({
          source: "azure_document_intelligence",
          sourceId: tableId,
          pageNumber,
          text: evidenceText,
        }),
      ],
      cells: table.cells.map((cell, cellIndex) => {
        const cellRegion = cell.boundingRegions[0];
        const cellPageNumber = cellRegion?.pageNumber ?? pageNumber;
        const cellId = `${tableId}-cell-${cellIndex}`;
        return {
          id: cellId,
          text: cell.content,
          pageNumber: cellPageNumber,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          rowSpan: cell.rowSpan,
          columnSpan: cell.columnSpan,
          kind: cell.kind,
          confidence: null,
          source: "azure_document_intelligence",
          polygon: cellRegion?.polygon ?? null,
          bbox: bboxFromPolygon(cellRegion?.polygon),
          evidence: [
            makeEvidence({
              source: "azure_document_intelligence",
              sourceId: cellId,
              pageNumber: cellPageNumber,
              text: cell.content,
            }),
          ],
        };
      }),
    };
  });

  for (const table of tables) {
    const page = pages.find((candidate) => candidate.pageNumber === table.pageNumber);
    page?.tables.push(table);
  }

  const quality = {
    source: "azure_document_intelligence" as const,
    pageCount: layout.metrics.pageCount,
    lineCount: layout.metrics.lineCount,
    wordCount: layout.metrics.wordCount,
    tableCount: layout.metrics.tableCount,
    tableCellCount: layout.metrics.tableCellCount,
    amountTokenCount: layout.metrics.amountTokenCount || countAmountTokens(layout.content),
    hasText: layout.metrics.lineCount > 0 || layout.metrics.wordCount > 0,
    notes: [],
  };

  return {
    id: options.id ?? "document-ir-azure",
    sourceFileName: options.sourceFileName ?? null,
    extractionSources: ["azure_document_intelligence"],
    pages,
    sections: [],
    quality: {
      bySource: [quality],
      merged: quality,
    },
    metadata: {
      createdAt: new Date().toISOString(),
      mergeStrategy: "single_source_azure_document_intelligence",
    },
  };
}
