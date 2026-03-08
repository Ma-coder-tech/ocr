import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";

export type ParsedDocument = {
  sourceType: "csv" | "pdf";
  headers: string[];
  rows: Array<Record<string, string | number>>;
  textPreview: string;
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
      if (score > best.score && nonEmpty.length >= 4) {
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
  };
}

export async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const { default: pdfParse } = await import("pdf-parse");
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);

  const lines = data.text
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean)
    .slice(0, 1200);

  const rows = lines.map((line: string, index: number) => ({
    line_number: index + 1,
    content: line,
  }));

  return {
    sourceType: "pdf",
    headers: ["line_number", "content"],
    rows,
    textPreview: lines.join(" ").slice(0, 1500),
  };
}
