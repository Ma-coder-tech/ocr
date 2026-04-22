import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { parse } from "csv-parse/sync";

const PDF_PARSE_TIMEOUT_MS = Number(process.env.PDF_PARSE_TIMEOUT_MS ?? 30_000);
const require = createRequire(import.meta.url);
const PDFJS_STANDARD_FONT_DATA_URL = `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}/`;

export type ParsedDocument = {
  sourceType: "csv" | "pdf";
  headers: string[];
  rows: Array<Record<string, string | number>>;
  textPreview: string;
  extraction: ExtractionDiagnostics;
};

export type ExtractionMode = "structured" | "text_only" | "unusable";

export type ExtractionDiagnostics = {
  mode: ExtractionMode;
  qualityScore: number;
  reasons: string[];
  lineCount: number;
  amountTokenCount: number;
  hasExtractableText: boolean;
};

type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfCell = {
  text: string;
  x0: number;
  x1: number;
};

type PdfLine = {
  page: number;
  y: number;
  cells: PdfCell[];
  text: string;
};

function isLikelyHeaderCell(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v.includes("month") ||
    v.includes("year") ||
    v.includes("fee") ||
    v.includes("volume") ||
    v.includes("amount") ||
    v.includes("deposit") ||
    v.includes("transaction")
  );
}

function detectCsvLayout(raw: string): { delimiter: string; headerRowIndex: number } {
  const delimiters = [",", ";", "\t", "|"];
  let best = { delimiter: ",", headerRowIndex: 0, score: -1 };

  for (const delimiter of delimiters) {
    let matrix: string[][] = [];
    try {
      matrix = parse(raw, {
        columns: false,
        skip_empty_lines: false,
        trim: true,
        relax_column_count: true,
        bom: true,
        delimiter,
      }) as string[][];
    } catch {
      continue;
    }

    for (let i = 0; i < Math.min(matrix.length, 50); i += 1) {
      const row = matrix[i] ?? [];
      const nonEmpty = row.filter((cell) => String(cell).trim().length > 0);
      const headerLike = nonEmpty.filter((cell) => isLikelyHeaderCell(String(cell))).length;
      const score = nonEmpty.length * 2 + headerLike * 6;
      // Allow narrow statements (2-3 columns) while still preferring header-like rows.
      if (score > best.score && nonEmpty.length >= 2 && (headerLike > 0 || i === 0)) {
        best = { delimiter, headerRowIndex: i, score };
      }
    }
  }

  return { delimiter: best.delimiter, headerRowIndex: best.headerRowIndex };
}

function safeNum(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input !== "string") {
    return null;
  }
  const normalized = input.replace(/^\((.*)\)$/, "-$1");
  const cleaned = normalized.replace(/[$,%\s,]/g, "").trim();
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRateLikeField(key: string, rawValue: string): boolean {
  const k = key.toLowerCase();
  if (k.includes("rate") || k.includes("pct") || k.includes("percent") || k.includes("bps") || k.includes("basis")) {
    return true;
  }
  return rawValue.includes("%");
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function collapseRepeatedHalves(input: string): string {
  const normalized = collapseWhitespace(input);
  if (normalized.length < 6) return normalized;
  if (normalized.length % 2 === 0) {
    const half = normalized.length / 2;
    const left = normalized.slice(0, half).trim();
    const right = normalized.slice(half).trim();
    if (left && left === right) return left;
  }
  return normalized.replace(/^(.{3,}?)\1+$/u, "$1");
}

function cleanPdfCellText(input: string): string {
  return collapseRepeatedHalves(input.replace(/\s*[:|]+\s*/g, (match) => (match.includes(":") ? ":" : " ")));
}

function isValueLikeText(input: string): boolean {
  const value = collapseWhitespace(input);
  if (!value) return false;
  if (safeNum(value) !== null) return true;
  if (/^\(?-?\$?\d[\d,]*\.\d{2}\)?$/.test(value)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{2,4})?$/.test(value)) return true;
  if (/^[a-z]{3,9}\s+\d{4}$/i.test(value)) return true;
  return false;
}

function looksLikeLabelText(input: string): boolean {
  const value = collapseWhitespace(input);
  if (!value) return false;
  if (!/[a-z]/i.test(value)) return false;
  if (/^(page|website|customer service)$/i.test(value)) return false;
  return true;
}

function splitPdfLineIntoCells(items: PdfTextItem[]): PdfCell[] {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  const cells: PdfCell[] = [];
  let current: PdfCell | null = null;

  for (const item of sorted) {
    const text = cleanPdfCellText(item.str);
    if (!text) continue;

    if (!current) {
      current = { text, x0: item.x, x1: item.x + item.width };
      continue;
    }

    const gap = item.x - current.x1;
    const threshold = Math.max(12, item.height * 1.2);
    if (gap > threshold) {
      cells.push({ ...current, text: cleanPdfCellText(current.text) });
      current = { text, x0: item.x, x1: item.x + item.width };
      continue;
    }

    current.text = cleanPdfCellText(`${current.text}${gap > 1 ? " " : ""}${text}`);
    current.x1 = Math.max(current.x1, item.x + item.width);
  }

  if (current) {
    cells.push({ ...current, text: cleanPdfCellText(current.text) });
  }

  return cells.filter((cell) => cell.text.length > 0);
}

function groupPdfItemsIntoLines(items: PdfTextItem[], pageNumber: number): PdfLine[] {
  const buckets = new Map<number, PdfTextItem[]>();

  for (const item of items) {
    const bucketY = Math.round(item.y * 2) / 2;
    let existingKey: number | null = null;
    for (const key of buckets.keys()) {
      if (Math.abs(key - bucketY) <= 1.5) {
        existingKey = key;
        break;
      }
    }
    const targetKey = existingKey ?? bucketY;
    const current = buckets.get(targetKey) ?? [];
    current.push(item);
    buckets.set(targetKey, current);
  }

  return [...buckets.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([y, group]) => {
      const cells = splitPdfLineIntoCells(group);
      return {
        page: pageNumber,
        y,
        cells,
        text: collapseWhitespace(cells.map((cell) => cell.text).join(" | ")),
      };
    })
    .filter((line) => line.text.length > 0);
}

function parsePdfFieldValue(input: string): string | number {
  const cleaned = collapseRepeatedHalves(input);
  const numeric = safeNum(cleaned);
  return numeric === null ? cleaned : Math.abs(numeric);
}

function extractPdfLabelValue(line: PdfLine): { label: string; value: string | number; kind: string } | null {
  if (line.cells.length < 2) return null;

  const cells = line.cells.map((cell) => ({
    ...cell,
    text: cleanPdfCellText(cell.text),
  }));
  const valueIndex = [...cells.keys()].reverse().find((index) => isValueLikeText(cells[index]?.text ?? ""));
  if (valueIndex === undefined || valueIndex <= 0) return null;

  let labelIndex = -1;
  for (let index = valueIndex - 1; index >= 0; index -= 1) {
    if (looksLikeLabelText(cells[index]?.text ?? "")) {
      labelIndex = index;
      break;
    }
  }
  if (labelIndex < 0) return null;

  let label = collapseRepeatedHalves(cells[labelIndex]?.text ?? "").replace(/[:\-]+$/g, "").trim();
  if (!label || /^(page|fees due)$/i.test(label)) return null;

  const rawValue = collapseRepeatedHalves(cells[valueIndex]?.text ?? "");
  const value = parsePdfFieldValue(rawValue);
  const kind = typeof value === "number" ? "amount" : "field";

  if (typeof value === "number" && value <= 0) {
    return { label, value: Math.abs(value), kind };
  }

  if (typeof value === "string" && !isValueLikeText(value)) {
    return null;
  }

  return { label, value, kind };
}

async function extractPdfLines(buffer: Buffer): Promise<PdfLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
  }).promise;

  const lines: PdfLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => "str" in item)
      .map((item) => ({
        str: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: item.width ?? 0,
        height: item.height ?? 0,
      }))
      .filter((item) => item.str.length > 0);

    lines.push(...groupPdfItemsIntoLines(items, pageNumber));
  }

  return lines;
}

function buildStructuredPdfRows(lines: PdfLine[]): Array<Record<string, string | number>> {
  return lines.map((line) => {
    const field = extractPdfLabelValue(line);
    const row: Record<string, string | number> = {
      content: line.text,
      page: `page-${line.page}`,
    };
    if (field) {
      row.label = field.label;
      row.value = field.value;
      row.kind = field.kind;
    }
    return row;
  });
}

function summarizePdfExtraction(rows: Array<Record<string, string | number>>, lines: PdfLine[]): ExtractionDiagnostics {
  const text = lines.map((line) => line.text).join(" ");
  const amountTokenCount = text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)?.length ?? 0;
  const feeSignals = (text.match(/fee|charge|discount|assessment|markup|interchange|statement/gi) ?? []).length;
  const structuredFieldCount = rows.filter(
    (row) => typeof row.label === "string" && (typeof row.value === "number" || typeof row.value === "string"),
  ).length;
  const hasExtractableText = lines.length > 0;
  const hasStructuredSignal =
    structuredFieldCount >= 8 &&
    rows.some((row) => typeof row.label === "string" && /fee|charge|discount|interchange/i.test(row.label)) &&
    rows.some((row) => typeof row.label === "string" && /volume|sales|amount submitted|processed|funded|deposit/i.test(row.label));

  const reasons: string[] = [];
  let mode: ExtractionMode = "unusable";
  let qualityScore = 0;

  if (!hasExtractableText) {
    reasons.push("No extractable text was found in this PDF (likely image-only/scanned).");
  } else if (hasStructuredSignal) {
    mode = "structured";
    reasons.push("PDF was parsed with layout-aware positioned text extraction and structured field recovery.");
    qualityScore = Math.min(0.92, 0.55 + Math.min(0.2, structuredFieldCount / 40) + Math.min(0.1, amountTokenCount / 250));
  } else {
    mode = "text_only";
    reasons.push("PDF was parsed as text lines only; structured field recovery was not confident enough yet.");
    if (amountTokenCount < 10) {
      reasons.push("Very few numeric amount tokens were found in extracted text.");
    }
    if (feeSignals < 2) {
      reasons.push("Very few fee-related terms were found in extracted text.");
    }
    qualityScore = Math.min(0.5, 0.18 + Math.min(0.2, amountTokenCount / 200) + Math.min(0.08, feeSignals / 40));
  }

  return {
    mode,
    qualityScore,
    reasons,
    lineCount: lines.length,
    amountTokenCount,
    hasExtractableText,
  };
}

export async function parseCsv(filePath: string): Promise<ParsedDocument> {
  const raw = await fs.readFile(filePath, "utf8");
  const { delimiter, headerRowIndex } = detectCsvLayout(raw);
  const sliced = raw.split(/\r?\n/).slice(headerRowIndex).join("\n");
  const records = parse(sliced, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
    delimiter,
  }) as Array<Record<string, string>>;

  const headers = Object.keys(records[0] ?? {}).filter((h) => h.trim().length > 0);
  const rows = records.slice(0, 5000).map((row) => {
    const normalized: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!key.trim()) continue;
      if (typeof value === "string" && isRateLikeField(key, value)) {
        // Preserve rate semantics as text so analyzers do not confuse percentages with amount fields.
        normalized[key] = value.trim();
        continue;
      }
      const n = safeNum(value);
      normalized[key] = n ?? value;
    }
    return normalized;
  });

  return {
    sourceType: "csv",
    headers,
    rows,
    textPreview: JSON.stringify(rows.slice(0, 3)).slice(0, 1200),
    extraction: {
      mode: "structured",
      qualityScore: rows.length > 0 ? 1 : 0.6,
      reasons: rows.length > 0 ? [] : ["CSV parsed but no data rows were found after header detection."],
      lineCount: rows.length,
      amountTokenCount: JSON.stringify(rows).match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)?.length ?? 0,
      hasExtractableText: rows.length > 0,
    },
  };
}

export async function parsePdf(filePath: string, jobId?: string): Promise<ParsedDocument> {
  const buffer = await fs.readFile(filePath);
  if (jobId) {
    console.log(`[job:${jobId}] pdf-layout-parse-start timeout=${PDF_PARSE_TIMEOUT_MS}ms`);
  } else {
    console.log(`[pdf-layout-parse] start timeout=${PDF_PARSE_TIMEOUT_MS}ms`);
  }

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("PDF parsing timed out. The file may be corrupted or too complex to process."));
    }, PDF_PARSE_TIMEOUT_MS);
  });

  const lines = await Promise.race([extractPdfLines(buffer), timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
  const rows = buildStructuredPdfRows(lines).slice(0, 1500);
  const extraction = summarizePdfExtraction(rows, lines);
  const text = lines.map((line) => line.text).join(" ");

  return {
    sourceType: "pdf",
    headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
    rows,
    textPreview: text.slice(0, 1500),
    extraction,
  };
}
