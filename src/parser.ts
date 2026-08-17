import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
import {
  runIsolatedPdfParser,
  type PdfParserIsolationOptions,
  type PdfParserStageDiagnostic,
} from "./pdfParserIsolation.js";

const PDF_PARSE_TIMEOUT_MS = Number(process.env.PDF_PARSE_TIMEOUT_MS ?? 60_000);

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

export async function parsePdf(
  filePath: string,
  jobId?: string,
  runtimeOptions: PdfParserIsolationOptions = {},
): Promise<ParsedDocument> {
  const buffer = await fs.readFile(filePath);
  return parsePdfBytes(buffer, jobId, runtimeOptions);
}

export async function parsePdfBytes(
  bytes: Uint8Array,
  jobId?: string,
  runtimeOptions: PdfParserIsolationOptions = {},
): Promise<ParsedDocument> {
  const timeoutMs = runtimeOptions.timeoutMs ?? PDF_PARSE_TIMEOUT_MS;
  if (jobId) {
    console.log(`[job:${jobId}] pdf-layout-parse-start timeout=${timeoutMs}ms isolation=worker_thread`);
  } else {
    console.log(`[pdf-layout-parse] start timeout=${timeoutMs}ms isolation=worker_thread`);
  }

  let pageCount: number | null = null;
  const startedAt = Date.now();
  const lines = await runIsolatedPdfParser(Buffer.from(bytes), {
    ...runtimeOptions,
    timeoutMs,
    onStage: (diagnostic) => {
      if (diagnostic.stage === "document_loaded") pageCount = diagnostic.pageCount ?? null;
      logPdfParserStage(jobId, diagnostic);
      runtimeOptions.onStage?.(diagnostic);
    },
  });
  const rows = buildStructuredPdfRows(lines).slice(0, 1500);
  const extraction = summarizePdfExtraction(rows, lines);
  const text = lines.map((line) => line.text).join(" ");

  const completion = {
    stage: "completed",
    elapsedMs: Math.max(0, Date.now() - startedAt),
    pageCount,
    lineCount: lines.length,
    timeoutMechanism: "worker_thread_termination",
    canvasRuntime: "not_required_for_text_extraction",
  };
  if (jobId) {
    console.info(`[job:${jobId}] pdf-layout-parse-complete`, JSON.stringify(completion));
  } else {
    console.info("[pdf-layout-parse] complete", JSON.stringify(completion));
  }

  return {
    sourceType: "pdf",
    headers: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
    rows,
    textPreview: text.slice(0, 1500),
    extraction,
  };
}

function logPdfParserStage(jobId: string | undefined, diagnostic: PdfParserStageDiagnostic): void {
  if (!jobId) return;
  console.info(`[job:${jobId}] pdf-layout-stage`, JSON.stringify(diagnostic));
}
