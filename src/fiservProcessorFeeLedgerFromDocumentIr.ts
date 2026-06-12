import type { DocumentIR, DocumentLine } from "./documentIr.js";
import {
  classifyFiservProcessorFeeLedgerRows,
  type FiservProcessorFeeClassificationContext,
} from "./fiservProcessorFeeClassification.js";
import { round2 } from "./reconciliation.js";

export type FiservProcessorDocumentIrFeeLedgerRow = {
  date: string | null;
  type: string | null;
  network: string | null;
  description: string;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  amount: number;
  bucket: "cardFees" | "miscellaneousFees" | "unknown";
  sourceSection: string;
  evidenceLine: string;
  pageNumber: number | null;
  confidence: "high" | "medium" | "low";
};

export type FiservProcessorDocumentIrFeeLedger = {
  status: "not_mapped" | "reconciled" | "reconciled_with_rounding_delta" | "unreconciled";
  rows: Array<FiservProcessorDocumentIrFeeLedgerRow & { classification: ReturnType<typeof classifyFiservProcessorFeeLedgerRows>["rows"][number]["classification"] }>;
  controls: Array<{
    label: string;
    bucket: "cardFees" | "miscellaneousFees" | "unknown";
    rowSum: number;
    printedTotal: number | null;
    delta: number;
    tolerance: number;
    status: "not_mapped" | "reconciled" | "reconciled_with_rounding_delta" | "unreconciled";
    evidenceLine: string | null;
  }>;
  totalRowSum: number;
  printedTotal: number | null;
  delta: number;
  tolerance: number;
  evidenceLine: string | null;
  feeClassificationSummary: ReturnType<typeof classifyFiservProcessorFeeLedgerRows>["summary"];
  notes: string[];
};

type ParsedFeeRow = FiservProcessorDocumentIrFeeLedgerRow & {
  lineId: string;
};

type FeeLedgerControlStatus = FiservProcessorDocumentIrFeeLedger["controls"][number]["status"];

type TotalLine = {
  line: DocumentLine;
  amount: number;
};

const NETWORK_HEADING_PATTERN =
  /^(MASTERCARD|MC OFLN DB|MASTERCARD DEBIT|VISA|VS OFLN DB|VISA DEBIT|AMEXCT\d+|DISCOVER ACQ|DCVR ACQ)$/;

export function extractFiservProcessorFeeLedgerFromDocumentIr(
  ir: DocumentIR,
  classificationContext: Omit<FiservProcessorFeeClassificationContext, "statementCostExposure"> = {},
): FiservProcessorDocumentIrFeeLedger {
  const lines = feeSectionLines(ir);
  if (lines.length === 0) {
    return notMappedFeeLedger("DocumentIR could not identify a FEES CHARGED section.");
  }

  const parsedRows = parseFeeRows(lines);
  const rows = parsedRows.map(({ lineId: _lineId, ...row }) => row);
  const cardTotal = findTotalLine(lines, (text) => text.includes("total card fees"));
  const miscTotal = findTotalLine(lines, hasMiscFeeTotal);
  const grandTotal = findTotalLine(lines, hasGrandFeeTotal);
  const cardRows = rows.filter((row) => row.bucket === "cardFees");
  const miscRows = rows.filter((row) => row.bucket === "miscellaneousFees");
  const cardRowSum = sumAmounts(cardRows);
  const miscRowSum = sumAmounts(miscRows);
  const totalRowSum = round2(cardRowSum + miscRowSum);
  const printedTotal = grandTotal?.amount ?? null;
  const delta = printedTotal === null ? 0 : round2(printedTotal - totalRowSum);
  const controls = [
    makeFeeLedgerControl({
      label: "Total Card Fees",
      bucket: "cardFees",
      rowSum: cardRowSum,
      printedTotal: cardTotal?.amount ?? null,
      tolerance: 0.02,
      evidenceLine: cardTotal?.line.text ?? null,
    }),
    makeFeeLedgerControl({
      label: "Total Miscellaneous Fees",
      bucket: "miscellaneousFees",
      rowSum: miscRowSum,
      printedTotal: miscTotal?.amount ?? null,
      tolerance: 0.01,
      evidenceLine: miscTotal?.line.text ?? null,
    }),
    makeFeeLedgerControl({
      label: "Total (Miscellaneous Fees and Card Fees)",
      bucket: "unknown",
      rowSum: totalRowSum,
      printedTotal,
      tolerance: 0.02,
      evidenceLine: grandTotal?.line.text ?? null,
    }),
  ];
  const classified = classifyFiservProcessorFeeLedgerRows(rows, printedTotal, classificationContext);

  return {
    status: printedTotal === null ? "not_mapped" : Math.abs(delta) === 0 ? "reconciled" : Math.abs(delta) <= 0.02 ? "reconciled_with_rounding_delta" : "unreconciled",
    rows: classified.rows,
    controls,
    totalRowSum,
    printedTotal,
    delta,
    tolerance: 0.02,
    evidenceLine: grandTotal?.line.text ?? null,
    feeClassificationSummary: classified.summary,
    notes:
      Math.abs(delta) === 0
        ? []
        : [
            `DocumentIR fee rows differ from the printed fee total by $${moneyPatternForAmount(Math.abs(delta))}; preserve the printed values and record the row-level rounding delta.`,
          ],
  };
}

export function compareFiservProcessorFeeLedgers(input: {
  documentIr: FiservProcessorDocumentIrFeeLedger;
  legacy: {
    rows: Array<{ description: string; amount: number; bucket: string; network: string | null }>;
    totalRowSum: number;
    printedTotal: number | null;
    delta: number;
  };
}): Array<{ field: string; message: string; evidenceLine: string | null }> {
  const differences: Array<{ field: string; message: string; evidenceLine: string | null }> = [];
  compareNumber(differences, "rowCount", input.documentIr.rows.length, input.legacy.rows.length, 0, input.documentIr.evidenceLine);
  compareNumber(differences, "totalRowSum", input.documentIr.totalRowSum, input.legacy.totalRowSum, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(differences, "printedTotal", input.documentIr.printedTotal, input.legacy.printedTotal, 0.01, input.documentIr.evidenceLine);
  compareNumber(differences, "delta", input.documentIr.delta, input.legacy.delta, 0.01, input.documentIr.evidenceLine);

  const limit = Math.min(input.documentIr.rows.length, input.legacy.rows.length);
  for (let index = 0; index < limit; index += 1) {
    const documentIrRow = input.documentIr.rows[index]!;
    const legacyRow = input.legacy.rows[index]!;
    if (
      documentIrRow.description !== legacyRow.description ||
      documentIrRow.network !== legacyRow.network ||
      Math.abs(documentIrRow.amount - legacyRow.amount) > 0.01 ||
      documentIrRow.bucket !== legacyRow.bucket
    ) {
      differences.push({
        field: `row:${index}`,
        message: `DocumentIR fee row ${index + 1} (${documentIrRow.network ?? "no network"} / ${documentIrRow.description}, $${documentIrRow.amount.toFixed(2)}, ${documentIrRow.bucket}) differs from the legacy row (${legacyRow.network ?? "no network"} / ${legacyRow.description}, $${legacyRow.amount.toFixed(2)}, ${legacyRow.bucket}).`,
        evidenceLine: documentIrRow.evidenceLine,
      });
      break;
    }
  }

  return differences;
}

function feeSectionLines(ir: DocumentIR): DocumentLine[] {
  const allLines = ir.pages.flatMap((page) => page.lines).sort(compareDocumentLines);
  const ledgerBoundedLines = linesFromFeeHeadingToLegend(allLines);
  if (ledgerBoundedLines.length > 0) return ledgerBoundedLines;

  const ids = new Set(
    ir.sections
      .filter((section) => section.familySectionType === "fees_charged")
      .flatMap((section) => section.lineIds),
  );
  if (ids.size > 0) {
    return allLines.filter((line) => ids.has(line.id)).sort(compareDocumentLines);
  }

  const startIndex = allLines.findIndex((line) => /^fees charged$/i.test(line.text.trim()));
  if (startIndex < 0) return [];
  const endIndex = allLines.findIndex((line, index) => index > startIndex && /^fee type legend\b/i.test(line.text.trim()));
  return allLines.slice(startIndex, endIndex < 0 ? allLines.length : endIndex + 1).sort(compareDocumentLines);
}

function linesFromFeeHeadingToLegend(lines: DocumentLine[]): DocumentLine[] {
  const startIndex = lines.findIndex((line) => /^fees charged$/i.test(line.text.trim()));
  if (startIndex < 0) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && /^fee type legend\b/i.test(line.text.trim()));
  if (endIndex < 0) return [];
  return lines.slice(startIndex, endIndex + 1);
}

function compareDocumentLines(left: DocumentLine, right: DocumentLine): number {
  return left.pageNumber - right.pageNumber || lineNumber(left.id) - lineNumber(right.id);
}

function lineNumber(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function parseFeeRows(lines: DocumentLine[]): ParsedFeeRow[] {
  const rows: ParsedFeeRow[] = [];
  let network: string | null = null;

  for (const line of lines) {
    const content = line.text.trim();
    const normalizedHeading = content.replace(/\s+/g, " ").trim();
    if (NETWORK_HEADING_PATTERN.test(normalizedHeading)) {
      network = normalizedHeading;
      continue;
    }
    const feeRowContent = normalizeFeeRowContent(content);
    if (!/^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*(CF|MISC)\s*\|/.test(feeRowContent)) continue;

    const parts = cellParts(feeRowContent);
    const date = parts[0] ?? null;
    const type = parts[1] ?? null;
    const description = parts[2]?.replace(/\s+/g, " ").trim() ?? "";
    const amountCell = parts.at(-1) ?? "0.00";
    const amount = positiveFiservProcessorAmount(amountCell);
    const middle = parts.slice(3, -1);
    const middleText = middle.join(" | ");
    const volumeBasis = firstFiservProcessorMoneyToken(middleText);
    const rate = firstFiservProcessorRate(middleText);
    const count = volumeBasis === null ? firstFiservProcessorInteger(middle[0] ?? "") : null;
    const bucket = type === "MISC" ? "miscellaneousFees" : type === "CF" ? "cardFees" : "unknown";

    rows.push({
      date,
      type,
      network: type === "CF" ? network : null,
      description,
      volumeBasis,
      count,
      rate,
      amount,
      bucket,
      sourceSection: "FEES CHARGED",
      evidenceLine: content,
      pageNumber: line.pageNumber,
      confidence: amountCell.includes(".") ? "high" : "medium",
      lineId: line.id,
    });
  }

  return rows;
}

function normalizeFeeRowContent(content: string): string {
  const match = content.match(/\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*(?:CF|MISC)\s*\|/);
  return match?.index === undefined ? content : content.slice(match.index).trim();
}

function findTotalLine(lines: DocumentLine[], predicate: (normalizedText: string) => boolean): TotalLine | null {
  const line = lines.find((candidate) => predicate(normalizedFiservText(candidate.text)));
  return line ? { line, amount: lastFiservProcessorAmountFromContent(line.text) } : null;
}

function makeFeeLedgerControl(params: {
  label: string;
  bucket: "cardFees" | "miscellaneousFees" | "unknown";
  rowSum: number;
  printedTotal: number | null;
  tolerance: number;
  evidenceLine: string | null;
}) {
  const delta = params.printedTotal === null ? 0 : round2(params.printedTotal - params.rowSum);
  const status: FeeLedgerControlStatus =
    params.printedTotal === null
      ? "not_mapped"
      : Math.abs(delta) === 0
        ? "reconciled"
        : Math.abs(delta) <= params.tolerance
          ? "reconciled_with_rounding_delta"
          : "unreconciled";
  return {
    label: params.label,
    bucket: params.bucket,
    rowSum: round2(params.rowSum),
    printedTotal: params.printedTotal,
    delta,
    tolerance: params.tolerance,
    status,
    evidenceLine: params.evidenceLine,
  };
}

function notMappedFeeLedger(note: string): FiservProcessorDocumentIrFeeLedger {
  const classified = classifyFiservProcessorFeeLedgerRows([], null);
  return {
    status: "not_mapped",
    rows: [],
    controls: [],
    totalRowSum: 0,
    printedTotal: null,
    delta: 0,
    tolerance: 0,
    evidenceLine: null,
    feeClassificationSummary: { ...classified.summary, notes: [note] },
    notes: [note],
  };
}

function normalizedFiservText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\btotai\b/g, "total")
    .replace(/\bmiscellaneous\b/g, "misc")
    .replace(/\s+/g, " ")
    .trim();
}

function hasGrandFeeTotal(text: string): boolean {
  return text.includes("total") && text.includes("misc fees") && text.includes("card fees");
}

function hasMiscFeeTotal(text: string): boolean {
  return text.includes("total misc fees");
}

function cellParts(content: string): string[] {
  return content
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function parseFiservProcessorAmount(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, "");
  const sign = cleaned.startsWith("-") ? -1 : 1;
  const digits = cleaned.replace(/^-/, "");
  if (digits.includes(".")) {
    const parsed = Number(digits);
    if (Number.isFinite(parsed)) return sign * parsed;
  }
  if (/^\d+$/.test(digits)) {
    const parsed = Number(digits) / 100;
    if (Number.isFinite(parsed)) return sign * parsed;
  }
  throw new Error(`DocumentIR fee ledger could not read Fiserv processor-branded amount: ${input}`);
}

function positiveFiservProcessorAmount(input: string): number {
  return Math.abs(parseFiservProcessorAmount(input));
}

function lastFiservProcessorAmountFromContent(content: string): number {
  return positiveFiservProcessorAmount(cellParts(content).at(-1) ?? content);
}

function firstFiservProcessorMoneyToken(input: string): number | null {
  const match = input.match(/\$[\d,\s]+\.\d{2}|\b\d{1,3}(?:,\d{3})+\.\d{2}\b|\b\d{4,}\.\d{2}\b/);
  return match ? positiveFiservProcessorAmount(match[0]) : null;
}

function firstFiservProcessorRate(input: string): number | null {
  const matches = [...input.matchAll(/(?:^|[\s|])(\d+\.\d{1,7}|\.\d{1,7})(?=\s|$)/g)];
  const match = matches.at(-1);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFiservProcessorInteger(input: string): number | null {
  const match = input.trim().match(/^\d+$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isInteger(parsed) ? parsed : null;
}

function sumAmounts(rows: Array<{ amount: number }>): number {
  return round2(rows.reduce((sum, row) => sum + row.amount, 0));
}

function moneyPatternForAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function compareNumber(
  differences: Array<{ field: string; message: string; evidenceLine: string | null }>,
  field: string,
  documentIrValue: number,
  legacyValue: number,
  tolerance: number,
  evidenceLine: string | null,
) {
  if (Math.abs(documentIrValue - legacyValue) <= tolerance) return;
  differences.push({
    field,
    message: `DocumentIR fee ledger ${field} (${documentIrValue}) disagrees with the legacy row extractor (${legacyValue}).`,
    evidenceLine,
  });
}

function compareNullableNumber(
  differences: Array<{ field: string; message: string; evidenceLine: string | null }>,
  field: string,
  documentIrValue: number | null,
  legacyValue: number | null,
  tolerance: number,
  evidenceLine: string | null,
) {
  if (documentIrValue === null || legacyValue === null) {
    if (documentIrValue === legacyValue) return;
    differences.push({
      field,
      message: `DocumentIR fee ledger ${field} (${documentIrValue}) disagrees with the legacy row extractor (${legacyValue}).`,
      evidenceLine,
    });
    return;
  }
  compareNumber(differences, field, documentIrValue, legacyValue, tolerance, evidenceLine);
}
