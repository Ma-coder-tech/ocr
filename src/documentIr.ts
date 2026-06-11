export type DocumentExtractionSource = "pdfjs" | "azure_document_intelligence";

export type DocumentBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentGeometry = {
  bbox: DocumentBoundingBox | null;
  polygon: number[] | null;
};

export type DocumentEvidence = {
  source: DocumentExtractionSource;
  sourceId: string;
  pageNumber: number;
  confidence: number | null;
  text: string;
};

export type DocumentWord = DocumentGeometry & {
  id: string;
  text: string;
  pageNumber: number;
  confidence: number | null;
  source: DocumentExtractionSource;
};

export type DocumentLine = DocumentGeometry & {
  id: string;
  text: string;
  pageNumber: number;
  confidence: number | null;
  source: DocumentExtractionSource;
  evidence: DocumentEvidence[];
};

export type DocumentCell = DocumentGeometry & {
  id: string;
  text: string;
  pageNumber: number;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  kind: string | null;
  confidence: number | null;
  source: DocumentExtractionSource;
  evidence: DocumentEvidence[];
};

export type DocumentTable = DocumentGeometry & {
  id: string;
  pageNumber: number;
  rowCount: number;
  columnCount: number;
  cells: DocumentCell[];
  source: DocumentExtractionSource;
  evidence: DocumentEvidence[];
};

export type DocumentPage = {
  pageNumber: number;
  width: number | null;
  height: number | null;
  unit: string | null;
  lines: DocumentLine[];
  words: DocumentWord[];
  tables: DocumentTable[];
};

export type DocumentSectionType =
  | "summary"
  | "funding"
  | "fees"
  | "interchange"
  | "card_activity"
  | "tax_reporting"
  | "account"
  | "notices"
  | "unknown";

export type DocumentSection = {
  id: string;
  type: DocumentSectionType;
  family: string | null;
  familySectionType: string | null;
  label: string;
  pageNumber: number;
  startLineId: string | null;
  endLineId: string | null;
  lineIds: string[];
  tableIds: string[];
  confidence: number;
  detectionMethod: "heading_match" | "table_heading_match" | "layout_heuristic";
  evidence: DocumentEvidence[];
};

export type DocumentExtractionQuality = {
  source: DocumentExtractionSource;
  pageCount: number;
  lineCount: number;
  wordCount: number;
  tableCount: number;
  tableCellCount: number;
  amountTokenCount: number;
  hasText: boolean;
  notes: string[];
};

export type DocumentIR = {
  id: string;
  sourceFileName: string | null;
  extractionSources: DocumentExtractionSource[];
  pages: DocumentPage[];
  sections: DocumentSection[];
  quality: {
    bySource: DocumentExtractionQuality[];
    merged: DocumentExtractionQuality;
  };
  metadata: {
    createdAt: string;
    mergeStrategy: string;
  };
};

export function countAmountTokens(text: string): number {
  return text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g)?.length ?? 0;
}

export function makeEvidence(input: {
  source: DocumentExtractionSource;
  sourceId: string;
  pageNumber: number;
  confidence?: number | null;
  text: string;
}): DocumentEvidence {
  return {
    source: input.source,
    sourceId: input.sourceId,
    pageNumber: input.pageNumber,
    confidence: input.confidence ?? null,
    text: input.text,
  };
}

export function blankGeometry(): DocumentGeometry {
  return { bbox: null, polygon: null };
}

export function bboxFromPolygon(polygon: number[] | null | undefined): DocumentBoundingBox | null {
  if (!polygon || polygon.length < 4) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < polygon.length - 1; index += 2) {
    const x = polygon[index];
    const y = polygon[index + 1];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x!);
      ys.push(y!);
    }
  }
  if (xs.length === 0 || ys.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function emptyQuality(source: DocumentExtractionSource): DocumentExtractionQuality {
  return {
    source,
    pageCount: 0,
    lineCount: 0,
    wordCount: 0,
    tableCount: 0,
    tableCellCount: 0,
    amountTokenCount: 0,
    hasText: false,
    notes: [],
  };
}
