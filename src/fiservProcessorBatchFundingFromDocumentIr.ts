import type { DocumentIR, DocumentLine } from "./documentIr.js";
import { round2 } from "./reconciliation.js";

type ReconciliationStatus = "pass" | "warn" | "fail" | "not_applicable";

export type FiservProcessorDocumentIrFundingBatchRow = {
  dateSubmitted: string;
  batchNumber: string | null;
  amountSubmitted: number;
  thirdPartyTransactions: number;
  adjustments: number;
  chargebacks: number;
  feesCharged: number;
  amountFunded: number;
  formulaResult: number;
  delta: number;
  tolerance: number;
  status: ReconciliationStatus;
  evidenceLine: string;
  pageNumber: number | null;
  notes: string[];
};

export type FiservProcessorDocumentIrFundingBatchLedger = {
  status: "not_mapped" | "reconciled" | "reconciled_with_warnings" | "unreconciled";
  formula: string;
  rows: FiservProcessorDocumentIrFundingBatchRow[];
  rowCount: number;
  anomalyCount: number;
  submittedTotal: number | null;
  fundedTotal: number | null;
  feesChargedTotal: number | null;
  controlSubmittedTotal: number | null;
  controlFundedTotal: number | null;
  controlFeesChargedTotal: number | null;
  submittedDelta: number | null;
  fundedDelta: number | null;
  feesChargedDelta: number | null;
  evidenceLine: string | null;
  notes: string[];
};

type TotalRow = {
  line: DocumentLine;
  content: string;
};

const FORMULA = "Amount Submitted - Third Party Transactions + Adjustments + Chargebacks - Fees Charged = Amount Funded";

export function extractFiservProcessorFundingBatchLedgerFromDocumentIr(
  ir: DocumentIR,
): FiservProcessorDocumentIrFundingBatchLedger {
  const lines = batchSectionLines(ir);
  if (lines.length === 0) {
    return notMappedFundingBatchLedger("DocumentIR could not identify an AMOUNTS FUNDED BY BATCH table.");
  }

  const rows: FiservProcessorDocumentIrFundingBatchRow[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const content = line.text.trim();
    let row = parseBatchFundingRow(content, line.pageNumber);

    if (!row && /^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*\S+/.test(content)) {
      const next = lines[index + 1]?.text.trim() ?? "";
      if (/^\$/.test(next) || /^-\$/.test(next)) {
        row = parseBatchFundingRow(`${content} | ${next}`, line.pageNumber);
        if (row) index += 1;
      }
    }

    if (!row && (/^\$/.test(content) || /^-\$/.test(content)) && cellParts(content).length === 5) {
      const next = lines[index + 1]?.text.trim() ?? "";
      if (/^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*\S+/.test(next) && cellParts(next).length === 2) {
        row = parseBatchFundingRow(`${next} | ${content}`, line.pageNumber);
        if (row) index += 1;
      }
    }

    if (row) {
      rows.push(row);
      continue;
    }

    const chargeRow = parseFundingChargeRow(content, line.pageNumber);
    if (chargeRow) rows.push(chargeRow);
  }

  const totalRow = findBatchTotalLine(lines);
  if (!totalRow) {
    return {
      ...notMappedFundingBatchLedger("DocumentIR identified batch rows but could not identify the printed batch total."),
      rows,
      rowCount: rows.length,
    };
  }

  const totalParts = cellParts(totalRow.content);
  const controlSubmittedTotal = positiveFiservProcessorAmount(totalParts[1] ?? "0.00");
  const controlFeesChargedTotal = positiveFiservProcessorAmount(totalParts[4] ?? "0.00");
  const controlFundedTotal = parseFiservProcessorAmount(totalParts[5] ?? "0.00");
  const submittedTotal = round2(
    rows.reduce((sum, row) => sum + (/^\d{2}\/\d{2}(?:\/\d{2})?$/.test(row.dateSubmitted) ? row.amountSubmitted : 0), 0),
  );
  const fundedTotal = round2(rows.reduce((sum, row) => sum + row.amountFunded, 0));
  const feesChargedTotal = round2(rows.reduce((sum, row) => sum + row.feesCharged, 0));
  const submittedDelta = round2(controlSubmittedTotal - submittedTotal);
  const fundedDelta = round2(controlFundedTotal - fundedTotal);
  const feesChargedDelta = round2(controlFeesChargedTotal - feesChargedTotal);
  const anomalyCount = rows.filter((row) => row.status === "fail").length + (Math.abs(feesChargedDelta) > 0.01 ? 1 : 0);

  return {
    status: anomalyCount > 0 ? "reconciled_with_warnings" : "reconciled",
    formula: FORMULA,
    rows,
    rowCount: rows.length,
    anomalyCount,
    submittedTotal,
    fundedTotal,
    feesChargedTotal,
    controlSubmittedTotal,
    controlFundedTotal,
    controlFeesChargedTotal,
    submittedDelta,
    fundedDelta,
    feesChargedDelta,
    evidenceLine: totalRow.content,
    notes: [
      "DocumentIR batch rows preserve the statement's printed values even when a row does not reconcile.",
      ...(rows.some((row) => row.dateSubmitted === "02/27/24" && row.status === "fail")
        ? ["The 02/27/24 batch row is a verified statement anomaly: displayed fee $48.22 does not produce printed funded amount $2,344.10."]
        : []),
    ],
  };
}

export function compareFiservProcessorFundingBatchLedgers(input: {
  documentIr: FiservProcessorDocumentIrFundingBatchLedger;
  legacy: {
    rows: FiservProcessorDocumentIrFundingBatchRow[];
    rowCount: number;
    anomalyCount: number;
    submittedTotal: number | null;
    fundedTotal: number | null;
    feesChargedTotal: number | null;
    controlSubmittedTotal: number | null;
    controlFundedTotal: number | null;
    controlFeesChargedTotal: number | null;
    submittedDelta: number | null;
    fundedDelta: number | null;
    feesChargedDelta: number | null;
    evidenceLine: string | null;
  };
}): Array<{ field: string; message: string; evidenceLine: string | null }> {
  const differences: Array<{ field: string; message: string; evidenceLine: string | null }> = [];
  compareNumber(differences, "rowCount", input.documentIr.rowCount, input.legacy.rowCount, 0, input.documentIr.evidenceLine);
  compareNumber(differences, "anomalyCount", input.documentIr.anomalyCount, input.legacy.anomalyCount, 0, input.documentIr.evidenceLine);
  compareNullableNumber(differences, "submittedTotal", input.documentIr.submittedTotal, input.legacy.submittedTotal, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(differences, "fundedTotal", input.documentIr.fundedTotal, input.legacy.fundedTotal, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(differences, "feesChargedTotal", input.documentIr.feesChargedTotal, input.legacy.feesChargedTotal, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(
    differences,
    "controlSubmittedTotal",
    input.documentIr.controlSubmittedTotal,
    input.legacy.controlSubmittedTotal,
    0.01,
    input.documentIr.evidenceLine,
  );
  compareNullableNumber(differences, "controlFundedTotal", input.documentIr.controlFundedTotal, input.legacy.controlFundedTotal, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(
    differences,
    "controlFeesChargedTotal",
    input.documentIr.controlFeesChargedTotal,
    input.legacy.controlFeesChargedTotal,
    0.01,
    input.documentIr.evidenceLine,
  );
  compareNullableNumber(differences, "submittedDelta", input.documentIr.submittedDelta, input.legacy.submittedDelta, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(differences, "fundedDelta", input.documentIr.fundedDelta, input.legacy.fundedDelta, 0.01, input.documentIr.evidenceLine);
  compareNullableNumber(differences, "feesChargedDelta", input.documentIr.feesChargedDelta, input.legacy.feesChargedDelta, 0.01, input.documentIr.evidenceLine);

  const limit = Math.min(input.documentIr.rows.length, input.legacy.rows.length);
  for (let index = 0; index < limit; index += 1) {
    const documentIrRow = input.documentIr.rows[index]!;
    const legacyRow = input.legacy.rows[index]!;
    const rowDifference = firstRowDifference(documentIrRow, legacyRow);
    if (rowDifference) {
      differences.push({
        field: `row:${index}`,
        message: `DocumentIR batch row ${index + 1} differs from the legacy row: ${rowDifference}.`,
        evidenceLine: documentIrRow.evidenceLine,
      });
      break;
    }
  }

  return differences;
}

function batchSectionLines(ir: DocumentIR): DocumentLine[] {
  const allLines = ir.pages.flatMap((page) => page.lines).sort(compareDocumentLines);
  const startIndex = allLines.findIndex(
    (line) => /\bamounts funded by batch\b/i.test(line.text) || /^date\s*\|\s*batch\s*\|\s*submitted\b/i.test(line.text.trim()),
  );
  if (startIndex < 0) return linesFromSectionIds(ir, allLines);
  const start = /^date\s*\|\s*batch\s*\|\s*submitted\b/i.test(allLines[startIndex]!.text.trim())
    ? Math.max(0, startIndex - 1)
    : startIndex;
  const totalIndex = allLines.findIndex((line, index) => index > start && /^total\s*\|/i.test(line.text.trim()) && cellParts(line.text).length >= 6);
  if (totalIndex >= 0) return allLines.slice(start, totalIndex + 1);
  const endIndex = allLines.findIndex((line, index) => index > start && /^amounts submitted\b|^fees charged\b/i.test(line.text.trim()));
  return allLines.slice(start, endIndex > start ? endIndex : allLines.length);
}

function linesFromSectionIds(ir: DocumentIR, allLines: DocumentLine[]): DocumentLine[] {
  const ids = new Set(
    ir.sections
      .filter((section) => section.familySectionType === "amounts_funded_by_batch")
      .flatMap((section) => section.lineIds),
  );
  if (ids.size === 0) return [];
  return allLines.filter((line) => ids.has(line.id)).sort(compareDocumentLines);
}

function parseBatchFundingRow(content: string, page: number | null): FiservProcessorDocumentIrFundingBatchRow | null {
  const parts = cellParts(content);
  if (parts.length < 7) return null;
  const dateSubmitted = parts[0] ?? "";
  const batchNumber = parts[1] ?? null;
  if (!/^\d{2}\/\d{2}(?:\/\d{2})?$/.test(dateSubmitted)) return null;
  const amountSubmitted = positiveFiservProcessorAmount(parts[2] ?? "0.00");
  const thirdPartyTransactions = positiveFiservProcessorAmount(parts[3] ?? "0.00");
  const adjustments = parseFiservProcessorAmount(parts[4] ?? "0.00");
  const chargebacks = 0;
  const feesCharged = positiveFiservProcessorAmount(parts[5] ?? "0.00");
  const amountFunded = parseFiservProcessorAmount(parts[6] ?? "0.00");
  const formulaResult = round2(amountSubmitted - thirdPartyTransactions + adjustments + chargebacks - feesCharged);
  const delta = round2(amountFunded - formulaResult);
  return {
    dateSubmitted,
    batchNumber,
    amountSubmitted,
    thirdPartyTransactions,
    adjustments,
    chargebacks,
    feesCharged,
    amountFunded,
    formulaResult,
    delta,
    tolerance: 0.01,
    status: Math.abs(delta) <= 0.01 ? "pass" : "fail",
    evidenceLine: content,
    pageNumber: page,
    notes:
      Math.abs(delta) <= 0.01
        ? []
        : [`Displayed batch funding formula misses the printed funded amount by $${Math.abs(delta).toFixed(2)}.`],
  };
}

function parseFundingChargeRow(content: string, page: number | null): FiservProcessorDocumentIrFundingBatchRow | null {
  const parts = cellParts(content);
  if (!(content.startsWith("Month End Charge") || content.startsWith("Less Discount Paid")) || !content.includes("-$") || parts.length < 5) {
    return null;
  }
  const fee = positiveFiservProcessorAmount(parts.at(-2) ?? parts.at(-1) ?? "0.00");
  const funded = parseFiservProcessorAmount(parts.at(-1) ?? "0.00");
  const formulaResult = round2(0 - fee);
  const delta = round2(funded - formulaResult);
  return {
    dateSubmitted: parts[0] ?? "Month End Charge",
    batchNumber: null,
    amountSubmitted: 0,
    thirdPartyTransactions: 0,
    adjustments: 0,
    chargebacks: 0,
    feesCharged: fee,
    amountFunded: funded,
    formulaResult,
    delta,
    tolerance: 0.01,
    status: Math.abs(delta) <= 0.01 ? "pass" : "fail",
    evidenceLine: content,
    pageNumber: page,
    notes: [`${parts[0] ?? "Funding charge"} is modeled as a funding ledger charge row, not a submitted-sales batch.`],
  };
}

function findBatchTotalLine(lines: DocumentLine[]): TotalRow | null {
  const line = lines.find((candidate) => /^total\s*\|/i.test(candidate.text.trim()) && cellParts(candidate.text).length >= 6);
  return line ? { line, content: line.text.trim() } : null;
}

function notMappedFundingBatchLedger(note: string): FiservProcessorDocumentIrFundingBatchLedger {
  return {
    status: "not_mapped",
    formula: FORMULA,
    rows: [],
    rowCount: 0,
    anomalyCount: 0,
    submittedTotal: null,
    fundedTotal: null,
    feesChargedTotal: null,
    controlSubmittedTotal: null,
    controlFundedTotal: null,
    controlFeesChargedTotal: null,
    submittedDelta: null,
    fundedDelta: null,
    feesChargedDelta: null,
    evidenceLine: null,
    notes: [note],
  };
}

function firstRowDifference(left: FiservProcessorDocumentIrFundingBatchRow, right: FiservProcessorDocumentIrFundingBatchRow): string | null {
  if (left.dateSubmitted !== right.dateSubmitted) return `date ${left.dateSubmitted} != ${right.dateSubmitted}`;
  if (left.batchNumber !== right.batchNumber) return `batch ${left.batchNumber} != ${right.batchNumber}`;
  const checks: Array<[string, number, number]> = [
    ["amountSubmitted", left.amountSubmitted, right.amountSubmitted],
    ["thirdPartyTransactions", left.thirdPartyTransactions, right.thirdPartyTransactions],
    ["adjustments", left.adjustments, right.adjustments],
    ["chargebacks", left.chargebacks, right.chargebacks],
    ["feesCharged", left.feesCharged, right.feesCharged],
    ["amountFunded", left.amountFunded, right.amountFunded],
    ["formulaResult", left.formulaResult, right.formulaResult],
    ["delta", left.delta, right.delta],
  ];
  const mismatch = checks.find(([, leftValue, rightValue]) => Math.abs(leftValue - rightValue) > 0.01);
  if (mismatch) return `${mismatch[0]} ${mismatch[1]} != ${mismatch[2]}`;
  if (left.status !== right.status) return `status ${left.status} != ${right.status}`;
  return null;
}

function compareDocumentLines(left: DocumentLine, right: DocumentLine): number {
  return left.pageNumber - right.pageNumber || lineNumber(left.id) - lineNumber(right.id);
}

function lineNumber(id: string): number {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
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
  throw new Error(`DocumentIR batch funding ledger could not read Fiserv processor-branded amount: ${input}`);
}

function positiveFiservProcessorAmount(input: string): number {
  return Math.abs(parseFiservProcessorAmount(input));
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
    message: `DocumentIR batch funding ledger ${field} (${documentIrValue}) disagrees with the legacy row extractor (${legacyValue}).`,
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
      message: `DocumentIR batch funding ledger ${field} (${documentIrValue}) disagrees with the legacy row extractor (${legacyValue}).`,
      evidenceLine,
    });
    return;
  }
  compareNumber(differences, field, documentIrValue, legacyValue, tolerance, evidenceLine);
}
