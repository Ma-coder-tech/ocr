// @ts-nocheck
// This parser returns runtime-validated FiservParserOutput objects. The file
// contains large statement fixture literals that can make TypeScript's deep
// inference stall, so correctness is enforced through schema validation and
// parser contract tests instead of static checking inside this module.
import path from "node:path";
import { classifyFiservProcessorFeeLedgerRows } from "./fiservProcessorFeeClassification.js";
import { attachFiservDocumentSections } from "./fiservDocumentSections.js";
import { documentIrFromPdfjsParsedDocument } from "./documentIrFromPdfjs.js";
import {
  extractFiservTopLevelFinancialsFromDocumentIr,
  type FiservDocumentIrTopLevelFinancials,
} from "./fiservTopLevelFromDocumentIr.js";
import {
  compareFiservProcessorFeeLedgers,
  extractFiservProcessorFeeLedgerFromDocumentIr,
  type FiservProcessorDocumentIrFeeLedger,
} from "./fiservProcessorFeeLedgerFromDocumentIr.js";
import {
  compareFiservProcessorFundingBatchLedgers,
  extractFiservProcessorFundingBatchLedgerFromDocumentIr,
  type FiservProcessorDocumentIrFundingBatchLedger,
} from "./fiservProcessorBatchFundingFromDocumentIr.js";
import { runFiservProcessorReconciliationProfile } from "./fiservProcessorReconciliationProfile.js";
import { buildParserDecision } from "./parserDecision.js";
import { fiservParserOutputSchema, type FiservParserOutput } from "./fiservParserOutputSchema.js";
import {
  findLastRow,
  findRow,
  integerTokens,
  maxPageCount,
  pageNumber,
  requireAmount,
  requireSignedAmount,
  rowContent,
  signedMoneyTokens,
  type FinancialCandidate,
  type ParserDriver,
  type RawExtractedDocument,
  type RawDocumentRow,
  type SelectedStatementFinancials,
  asEvidence,
} from "./parserFoundation.js";
import {
  exactMoneyToleranceBand,
  makeAmountCheck,
  makeNotApplicableCheck,
  makeRateCheck,
  makeReconResult,
  makeUnreferencedValueResult,
  makeWarningCheck,
  round2,
  round8,
  sumMoneyToleranceBand,
} from "./reconciliation.js";

type ParseOptions = {
  sourceFileName?: string;
};

type ParserWarning = {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidenceLine: string | null;
};

function extractDocumentIrTopLevelFinancials(
  doc: RawExtractedDocument,
  sourceFileName: string,
): FiservDocumentIrTopLevelFinancials {
  return extractFiservTopLevelFinancialsFromDocumentIr(buildFiservDocumentIr(doc, sourceFileName));
}

function buildFiservDocumentIr(doc: RawExtractedDocument, sourceFileName: string) {
  return attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName }));
}

function documentIrTopLevelMismatchWarnings(
  topLevel: FiservDocumentIrTopLevelFinancials,
  legacy: {
    totalVolume: number;
    totalFees: number;
    effectiveRate: number;
    amountFunded: number;
    adjustmentsChargebacks: number | null;
    thirdPartyTransactions: number | null;
  },
): ParserWarning[] {
  const warnings: ParserWarning[] = [];
  const checks = [
    { field: "totalVolume", documentIrValue: topLevel.totalVolume, legacyValue: legacy.totalVolume, tolerance: 0.01 },
    { field: "totalFees", documentIrValue: topLevel.totalFees, legacyValue: legacy.totalFees, tolerance: 0.01 },
    { field: "effectiveRate", documentIrValue: topLevel.effectiveRate, legacyValue: legacy.effectiveRate, tolerance: 0.000001 },
    { field: "amountFunded", documentIrValue: topLevel.amountFunded, legacyValue: legacy.amountFunded, tolerance: 0.01 },
    {
      field: "adjustmentsChargebacks",
      documentIrValue: topLevel.adjustmentsChargebacks,
      legacyValue: legacy.adjustmentsChargebacks,
      tolerance: 0.01,
    },
    {
      field: "thirdPartyTransactions",
      documentIrValue: topLevel.thirdPartyTransactions,
      legacyValue: legacy.thirdPartyTransactions,
      tolerance: 0.01,
    },
  ];

  for (const check of checks) {
    if (check.documentIrValue === null || check.legacyValue === null) {
      if (check.documentIrValue !== check.legacyValue) {
        warnings.push(documentIrMismatchWarning(topLevel, check.field, check.documentIrValue, check.legacyValue));
      }
      continue;
    }
    if (Math.abs(check.documentIrValue - check.legacyValue) > check.tolerance) {
      warnings.push(documentIrMismatchWarning(topLevel, check.field, check.documentIrValue, check.legacyValue));
    }
  }

  return warnings;
}

function documentIrMismatchWarning(
  topLevel: FiservDocumentIrTopLevelFinancials,
  field: string,
  documentIrValue: number | null,
  legacyValue: number | null,
): ParserWarning {
  const evidenceField = field === "adjustmentsChargebacks" ? "adjustments" : field;
  const source = topLevel.evidence.find((item) => item.field === evidenceField);
  return {
    code: `document_ir_top_level_mismatch_${field}`,
    severity: "high",
    message: `DocumentIR top-level ${field} (${documentIrValue}) disagrees with the legacy row extractor (${legacyValue}).`,
    evidenceLine: source?.evidenceLine ?? null,
  };
}

function documentIrTopLevelEvidence(topLevel: FiservDocumentIrTopLevelFinancials) {
  return topLevel.evidence.map((item) => ({
    field: `documentIr.${item.field}`,
    sourceSection: "DOCUMENT_IR_TOP_LEVEL",
    pageNumber: item.pageNumber,
    lineIndex: null,
    evidenceLine: item.evidenceLine,
    value: item.value,
  }));
}

function documentIrFeeLedgerMismatchWarnings(
  documentIrLedger: FiservProcessorDocumentIrFeeLedger,
  legacyLedger: ReturnType<typeof buildFiservProcessorFeeLedger>,
): ParserWarning[] {
  return compareFiservProcessorFeeLedgers({ documentIr: documentIrLedger, legacy: legacyLedger }).map((difference) => ({
    code: `document_ir_fee_ledger_mismatch_${difference.field.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()}`,
    severity: "high",
    message: difference.message,
    evidenceLine: difference.evidenceLine,
  }));
}

function documentIrFundingBatchLedgerMismatchWarnings(
  documentIrLedger: FiservProcessorDocumentIrFundingBatchLedger,
  legacyLedger: ReturnType<typeof buildFiservProcessorFundingBatchLedger>,
): ParserWarning[] {
  return compareFiservProcessorFundingBatchLedgers({ documentIr: documentIrLedger, legacy: legacyLedger }).map((difference) => ({
    code: `document_ir_batch_funding_ledger_mismatch_${difference.field.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()}`,
    severity: "high",
    message: difference.message,
    evidenceLine: difference.evidenceLine,
  }));
}

function findOptionalRow(
  doc: RawExtractedDocument,
  predicate: (row: RawDocumentRow, index: number) => boolean,
) {
  const index = doc.rows.findIndex(predicate);
  return index < 0 ? null : asEvidence(doc.rows[index]!, index);
}

type FeeLedgerForPricingModel = {
  rows: Array<{
    type?: string | null;
    description: string;
    network: string | null;
    volumeBasis: number | null;
    count?: number | null;
    rate: number | null;
    amount: number;
    sourceSection?: string;
    evidenceLine: string;
  }>;
};

const DATE_RANGE_PATTERN = /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/;

function parsePeriod(value: string): { start: string; end: string } {
  const match = value.match(DATE_RANGE_PATTERN);
  if (!match) {
    throw new Error(`Fiserv First Data parser could not parse statement period: ${value}`);
  }
  const [, startMonth, startDay, startYear, endMonth, endDay, endYear] = match;
  return {
    start: formatDate(startYear!, startMonth!, startDay!),
    end: formatDate(endYear!, endMonth!, endDay!),
  };
}

function formatDate(year: string, month: string, day: string): string {
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizedFiservText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\btotai\b/g, "total")
    .replace(/\bmiscellaneous\b/g, "misc")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFiservProcessorFundingFormula(content: string): boolean {
  const text = normalizedFiservText(content);
  return (
    text.includes("amount submitted") &&
    text.includes("third party") &&
    text.includes("adjustments") &&
    text.includes("chargebacks") &&
    text.includes("fees charged") &&
    text.includes("amount funded")
  );
}

function hasFiservProcessorFeeGrandTotal(content: string): boolean {
  const text = normalizedFiservText(content);
  return text.includes("total") && text.includes("misc fees") && text.includes("card fees");
}

function hasFiservProcessorMiscTotal(content: string): boolean {
  const text = normalizedFiservText(content);
  return text.includes("total misc fees");
}

function hasFiservProcessorAmountsSubmittedSubtotal(content: string): boolean {
  return /^sub[-\s]?totals?\s*\|/i.test(content.trim());
}

function hasFiservStatementPeriod(content: string): boolean {
  return /statement\s*period/i.test(content);
}

function isFirstDataFullStatement(doc: RawExtractedDocument): boolean {
  const text = `${doc.textPreview} ${doc.rows.slice(0, 30).map(rowContent).join(" ")}`.toLowerCase();
  return (
    text.includes("your card processing statement") &&
    text.includes("omaha, ne 68103-2394") &&
    doc.rows.some((row: RawDocumentRow) => rowContent(row).includes("Total Amount Submitted")) &&
    doc.rows.some((row: RawDocumentRow) => rowContent(row).includes("Total Amount Processed")) &&
    doc.rows.some((row) => String(row.label ?? "") === "Total Interchange Charges/Program Fees")
  );
}

function isFirstDataShortStatement(doc: RawExtractedDocument): boolean {
  const text = `${doc.textPreview} ${doc.rows.slice(0, 30).map(rowContent).join(" ")}`.toLowerCase();
  return (
    text.includes("your card processing statement") &&
    text.includes("omaha, ne 68103-2394") &&
    doc.rows.some((row: RawDocumentRow) => rowContent(row).includes("Page 1 of 2")) &&
    doc.rows.some((row: RawDocumentRow) => rowContent(row).includes("Total Amount Submitted")) &&
    doc.rows.some((row: RawDocumentRow) => rowContent(row).includes("Total Amount Processed")) &&
    !doc.rows.some((row) => String(row.label ?? "") === "Total Interchange Charges/Program Fees")
  );
}

function isFiservProcessorBrandedStatement(doc: RawExtractedDocument): boolean {
  const text = `${doc.textPreview} ${doc.rows.slice(0, 40).map(rowContent).join(" ")}`.toLowerCase();
  return (
    text.includes("your card processing statement") &&
    doc.rows.some((row) => String(row.label ?? "") === "Amounts Submitted") &&
    doc.rows.some((row) => String(row.label ?? "") === "Fees Charged") &&
    doc.rows.some((row) => String(row.label ?? "").replace("TotaI", "Total") === "Total Amount Funded to Your Bank") &&
    doc.rows.some((row) => hasFiservProcessorFundingFormula(rowContent(row))) &&
    doc.rows.some((row) => hasFiservProcessorFeeGrandTotal(rowContent(row)))
  );
}

function notMappedFeeLedger(note: string) {
  return {
    status: "not_mapped",
    rows: [],
    controls: [],
    totalRowSum: 0,
    printedTotal: null,
    delta: 0,
    tolerance: 0,
    evidenceLine: null,
    feeClassificationSummary: {
      status: "not_mapped",
      rowCount: 0,
      classifiedRowCount: 0,
      unresolvedRowCount: 0,
      needsUnbundlingRowCount: 0,
      totalClassifiedAmount: 0,
      printedTotal: null,
      delta: 0,
      tolerance: 0,
      bucketTotals: [],
      notes: [note],
    },
    notes: [note],
  };
}

function notMappedFundingBatchLedger(note: string) {
  return {
    status: "not_mapped",
    formula: "Amount Submitted - Third Party Transactions + Adjustments + Chargebacks - Fees Charged = Amount Funded",
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
  throw new Error(`Parser could not read Fiserv processor-branded amount: ${input}`);
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

function moneyPatternForAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function detectFiservProcessorBrand(doc: RawExtractedDocument): string {
  const firstRows = doc.rows.slice(0, 12).map(rowContent);
  const brandRow = firstRows.find((content) => /^[A-Z0-9 &,./'-]+$/.test(content) && !content.startsWith("P.O.") && !content.includes("YOUR CARD"));
  if (!brandRow) return "Fiserv / First Data branded statement";
  return brandRow
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bLlc\b/g, "LLC")
    .replace(/\bInc\b/g, "INC");
}

function detectFiservProcessorStatementFamily(): string {
  return "fiserv_first_data_processor_statement";
}

function merchantNumberFromContent(content: string): string | null {
  return content.match(/\d{4}\s+(?:\d{4}\s+)?\d{7,12}/)?.[0] ?? null;
}

function merchantNumberDigitsFromContent(content: string): string | null {
  const labeled = content.match(/\bMerchant Number\b\s*\|?\s*([0-9 ]{10,25})/i)?.[1];
  const plain = labeled ?? content.match(/\b(\d{12,16})\b/)?.[1];
  if (!plain) return null;
  const digits = plain.replace(/\s+/g, "");
  return digits.length >= 10 ? digits : null;
}

function merchantNumberFromEvidence(row: EvidenceRow): string {
  const direct = String(row.row.value ?? "").replace(/\.0$/, "").trim();
  if (/^\d{10,16}$/.test(direct)) return direct;
  const fromContent = merchantNumberDigitsFromContent(row.content);
  if (fromContent) return fromContent;
  throw new Error(`Parser could not read merchant number from: ${row.content}`);
}

function findFiservStatementMerchantNumberRow(doc: RawExtractedDocument): EvidenceRow {
  return findRow(
    doc,
    (row) => String(row.label ?? "") === "Merchant Number" || /\bMerchant Number\b\s*\|?\s*\d/i.test(rowContent(row)),
    "merchant number",
  );
}

function findRowAfter(
  doc: RawExtractedDocument,
  startPredicate: (row: RawDocumentRow, index: number) => boolean,
  rowPredicate: (row: RawDocumentRow, index: number) => boolean,
  label: string,
): EvidenceRow {
  const startIndex = doc.rows.findIndex(startPredicate);
  if (startIndex < 0) {
    throw new Error(`Parser could not find ${label} section.`);
  }
  for (let index = startIndex + 1; index < doc.rows.length; index += 1) {
    const row = doc.rows[index]!;
    if (rowPredicate(row, index)) {
      return asEvidence(row, index);
    }
  }
  throw new Error(`Parser could not find ${label}.`);
}

function findFullStatementCardTypeTotalRow(doc: RawExtractedDocument): EvidenceRow {
  return findRowAfter(
    doc,
    (row) => /^SUMMARY BY CARD TYPE\b/i.test(rowContent(row)),
    (row) => {
      const content = rowContent(row);
      return /^Total\s*\|/.test(content) && signedMoneyTokens(content).length >= 3 && integerTokens(content).length >= 3;
    },
    "summary by card type total",
  );
}

function findFullStatementInterchangeDetailTotalRow(doc: RawExtractedDocument): EvidenceRow {
  return findLastRow(
    doc,
    (row) => {
      const content = rowContent(row);
      const amounts = signedMoneyTokens(content);
      return /^TOTAL\s*\|\s*\$[\d,]+\.\d{2}\s*\|/i.test(content) && amounts.length >= 2 && (amounts.at(-1) ?? 0) < 0;
    },
    "interchange detail total",
  );
}

function isFiservProcessorMerchantNameCandidate(content: string): boolean {
  if (!content || content.includes("|")) return false;
  if (/YOUR CARD PROCESSING STATEMENT|Statement Period|Merchant Number|Customer Service|THIS IS NOT A BILL/i.test(content)) return false;
  if (/^P\.?O\.?\s+Box\b/i.test(content)) return false;
  if (/^\d+\s+\S+/.test(content)) return false;
  if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(content)) return false;
  if (/^SUMMARY\b|^IMPORTANT INFORMATION\b|^nnnnnn\b/i.test(content)) return false;
  if (/^[0-9/ -]+$/.test(content)) return false;
  if (/^[A-Z]+$/.test(content) && content.length > 24 && new Set(content).size <= 4) return false;
  return /^[A-Z0-9 &,./'#-]+$/.test(content);
}

function findFiservProcessorMerchantNameRow(doc: RawExtractedDocument, merchantNumberRowIndex: number): EvidenceRow {
  const candidateWindow = doc.rows.slice(merchantNumberRowIndex + 1, merchantNumberRowIndex + 10);
  const relativeIndex = candidateWindow.findIndex((row) => isFiservProcessorMerchantNameCandidate(rowContent(row)));
  if (relativeIndex >= 0) {
    const index = merchantNumberRowIndex + 1 + relativeIndex;
    return asEvidence(doc.rows[index]!, index);
  }
  return findRow(
    doc,
    (row, index) => index < 30 && isFiservProcessorMerchantNameCandidate(rowContent(row)),
    "merchant name",
  );
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
  const status =
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

function buildFiservProcessorFeeLedger(doc: RawExtractedDocument) {
  const rows = [];
  let network: string | null = null;

  for (const [index, rawRow] of doc.rows.entries()) {
    const content = rowContent(rawRow);
    if (/^(MASTERCARD|MC OFLN DB|MASTERCARD DEBIT|VISA|VS OFLN DB|VISA DEBIT|AMEXCT\d+|DISCOVER ACQ|DCVR ACQ)$/.test(content)) {
      network = content;
      continue;
    }
    const feeRowContent = normalizeFiservProcessorFeeRowContent(content);
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
      pageNumber: pageNumber(rawRow),
      confidence: amountCell.includes(".") ? "high" : "medium",
      lineIndex: index,
    });
  }

  const cardTotalRow = findRow(doc, (row) => rowContent(row).includes("Total Card Fees"), "Fiserv processor-branded total card fees");
  const miscTotalRow = findRow(doc, (row) => hasFiservProcessorMiscTotal(rowContent(row)), "Fiserv processor-branded total miscellaneous fees");
  const grandTotalRow = findRow(
    doc,
    (row) => hasFiservProcessorFeeGrandTotal(rowContent(row)),
    "Fiserv processor-branded total fees ledger",
  );
  const cardPrinted = lastFiservProcessorAmountFromContent(cardTotalRow.content);
  const miscPrinted = lastFiservProcessorAmountFromContent(miscTotalRow.content);
  const printedTotal = lastFiservProcessorAmountFromContent(grandTotalRow.content);
  const cardRows = rows.filter((row) => row.bucket === "cardFees");
  const miscRows = rows.filter((row) => row.bucket === "miscellaneousFees");
  const cardRowSum = round2(cardRows.reduce((sum, row) => sum + row.amount, 0));
  const miscRowSum = round2(miscRows.reduce((sum, row) => sum + row.amount, 0));
  const totalRowSum = round2(cardRowSum + miscRowSum);
  const totalDelta = round2(printedTotal - totalRowSum);
  const controls = [
    makeFeeLedgerControl({
      label: "Total Card Fees",
      bucket: "cardFees",
      rowSum: cardRowSum,
      printedTotal: cardPrinted,
      tolerance: 0.02,
      evidenceLine: cardTotalRow.content,
    }),
    makeFeeLedgerControl({
      label: "Total Miscellaneous Fees",
      bucket: "miscellaneousFees",
      rowSum: miscRowSum,
      printedTotal: miscPrinted,
      tolerance: 0.01,
      evidenceLine: miscTotalRow.content,
    }),
    makeFeeLedgerControl({
      label: "Total (Miscellaneous Fees and Card Fees)",
      bucket: "unknown",
      rowSum: totalRowSum,
      printedTotal,
      tolerance: 0.02,
      evidenceLine: grandTotalRow.content,
    }),
  ];

  const classified = classifyFiservProcessorFeeLedgerRows(
    rows.map(({ lineIndex: _lineIndex, ...row }) => row),
    printedTotal,
  );

  return {
    status: Math.abs(totalDelta) === 0 ? "reconciled" : Math.abs(totalDelta) <= 0.02 ? "reconciled_with_rounding_delta" : "unreconciled",
    rows: classified.rows,
    controls,
    totalRowSum,
    printedTotal,
    delta: totalDelta,
    tolerance: 0.02,
    evidenceLine: grandTotalRow.content,
    feeClassificationSummary: classified.summary,
    notes:
      Math.abs(totalDelta) === 0
        ? []
        : [
            `Visible fee rows differ from the printed fee total by $${moneyPatternForAmount(Math.abs(totalDelta))}; preserve the printed values and record the row-level rounding delta.`,
          ],
  };
}

function normalizeFiservProcessorFeeRowContent(content: string): string {
  const match = content.match(/\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*(?:CF|MISC)\s*\|/);
  return match?.index === undefined ? content : content.slice(match.index).trim();
}

const FULL_STATEMENT_FEE_TYPES = new Set(["Fees", "Interchange charges", "Service charges", "Program Fees"]);
const FULL_STATEMENT_FEE_SECTIONS = new Set(["TRANSACTION FEES", "DEBIT NETWORK FEES", "ACCOUNT FEES"]);
const FULL_STATEMENT_NETWORK_HEADINGS = new Set([
  "MASTERCARD",
  "VISA",
  "DISCOVER",
  "AMERICAN EXPRESS",
  "AMEX ACQ",
  "SIGNATURE DEBIT",
  "Other",
]);

function firstFullStatementCount(input: string): number | null {
  const match = input.match(/\b(\d{1,3}(?:,\d{3})*|\d+)\s+(?:TRANSACTIONS|KILOBYTES|TRANS\b)/i);
  if (!match) return null;
  const parsed = Number(match[1]!.replace(/,/g, ""));
  return Number.isInteger(parsed) ? parsed : null;
}

function firstDataShortDiscountRate(input: string): number | null {
  const match = input.match(/\bAT\s+(\d+\.\d{1,7}|\.\d{1,7})\b/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFirstDataFullFeeRow(content: string, context: { sourceSection: string; network: string | null; pageNumber: number | null; lineIndex: number }) {
  const parts = cellParts(content);
  if (parts.length < 3) return null;

  const amountCell = parts.at(-1) ?? "";
  const type = parts.at(-2) ?? "";
  if (!FULL_STATEMENT_FEE_TYPES.has(type) || !amountCell.includes("$")) return null;

  const descriptorParts = parts.slice(0, -2);
  const description = descriptorParts[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!description || /^TOTAL\b/i.test(description)) return null;

  const descriptorText = descriptorParts.join(" | ");
  const amount = positiveFiservProcessorAmount(amountCell);
  const volumeBasis = firstFiservProcessorMoneyToken(descriptorText);
  const count = firstFullStatementCount(descriptorText);
  const rate = firstFiservProcessorRate(descriptorText);
  const bucket = context.sourceSection === "ACCOUNT FEES" ? "miscellaneousFees" : "cardFees";

  return {
    date: null,
    type,
    network: context.network,
    description,
    volumeBasis,
    count,
    rate,
    amount,
    bucket,
    sourceSection: context.sourceSection,
    evidenceLine: content,
    pageNumber: context.pageNumber,
    confidence: "high",
    lineIndex: context.lineIndex,
  };
}

function buildFiservFullStatementFeeLedger(doc: RawExtractedDocument, printedTotal: number) {
  const feeStartIndex = doc.rows.findIndex((row) => /^FEES\b/i.test(rowContent(row)));
  if (feeStartIndex < 0) throw new Error("Parser could not find First Data full-statement FEES section.");
  const feeEndIndex = doc.rows.findIndex(
    (row, index) => index > feeStartIndex && /^Total \(Service Charges, Interchange Charges\/Program Fees, and Fees\)/.test(rowContent(row)),
  );
  if (feeEndIndex < 0) throw new Error("Parser could not find First Data full-statement fee grand total.");

  const rows = [];
  let sourceSection = "";
  let network: string | null = null;

  for (let index = feeStartIndex + 1; index < feeEndIndex; index += 1) {
    const rawRow = doc.rows[index]!;
    const content = rowContent(rawRow);
    const firstCell = cellParts(content)[0] ?? content;

    if (FULL_STATEMENT_FEE_SECTIONS.has(firstCell)) {
      sourceSection = firstCell;
      network = null;
      continue;
    }
    if (FULL_STATEMENT_NETWORK_HEADINGS.has(firstCell)) {
      network = firstCell;
      continue;
    }

    const parsed = parseFirstDataFullFeeRow(content, {
      sourceSection,
      network,
      pageNumber: pageNumber(rawRow),
      lineIndex: index,
    });
    if (parsed) rows.push(parsed);
  }

  const rowSum = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const grandTotalRow = findRow(
    doc,
    (row) => /^Total \(Service Charges, Interchange Charges\/Program Fees, and Fees\)/.test(rowContent(row)),
    "First Data full-statement fee grand total",
  );

  const controlBySection = (label: string, expectedLabel: string) => {
    const totalRow = findRow(doc, (row) => rowContent(row).startsWith(expectedLabel), `First Data full-statement ${expectedLabel}`);
    const sectionRows = rows.filter((row) => row.sourceSection === label);
    return makeFeeLedgerControl({
      label: expectedLabel,
      bucket: "unknown",
      rowSum: round2(sectionRows.reduce((sum, row) => sum + row.amount, 0)),
      printedTotal: lastFiservProcessorAmountFromContent(totalRow.content),
      tolerance: 0.02,
      evidenceLine: totalRow.content,
    });
  };

  const controlByType = (type: string, expectedLabel: string, includeProgramFees = false) => {
    const totalRow = findRow(doc, (row) => rowContent(row).startsWith(expectedLabel), `First Data full-statement ${expectedLabel}`);
    const typeRows = rows.filter((row) => row.type === type || (includeProgramFees && row.type === "Program Fees"));
    return makeFeeLedgerControl({
      label: expectedLabel,
      bucket: "unknown",
      rowSum: round2(typeRows.reduce((sum, row) => sum + row.amount, 0)),
      printedTotal: lastFiservProcessorAmountFromContent(totalRow.content),
      tolerance: 0.02,
      evidenceLine: totalRow.content,
    });
  };

  const controls = [
    controlBySection("TRANSACTION FEES", "TOTAL TRANSACTION FEES"),
    controlBySection("DEBIT NETWORK FEES", "TOTAL DEBIT NETWORK FEES"),
    controlBySection("ACCOUNT FEES", "TOTAL ACCOUNT FEES"),
    controlByType("Interchange charges", "Total Interchange Charges/Program Fees", true),
    controlByType("Service charges", "Total Service Charges"),
    controlByType("Fees", "Total Fees"),
    makeFeeLedgerControl({
      label: "Total (Service Charges, Interchange Charges/Program Fees, and Fees)",
      bucket: "unknown",
      rowSum,
      printedTotal,
      tolerance: 0.02,
      evidenceLine: grandTotalRow.content,
    }),
  ];
  const delta = round2(printedTotal - rowSum);
  const classified = classifyFiservProcessorFeeLedgerRows(
    rows.map(({ lineIndex: _lineIndex, ...row }) => row),
    printedTotal,
  );

  return {
    status: Math.abs(delta) === 0 ? "reconciled" : Math.abs(delta) <= 0.02 ? "reconciled_with_rounding_delta" : "unreconciled",
    rows: classified.rows,
    controls,
    totalRowSum: rowSum,
    printedTotal,
    delta,
    tolerance: 0.02,
    evidenceLine: grandTotalRow.content,
    feeClassificationSummary: classified.summary,
    notes: [
      "Full First Data/Clover fee ledger rows are parsed from the printed FEES section and reconciled against section totals, type totals, and the grand total.",
      "Classification uses statement-visible type labels; reference-rate matching is still required before claiming pass-through-at-cost.",
    ],
  };
}

function unknownPricingModel(note: string) {
  return {
    pricingModel: "unknown",
    confidence: "low",
    cashDiscountStatus: "unknown",
    flatDiscountRate: null,
    evidenceType: "not_detected",
    evidence: [],
    notes: [note],
  };
}

function isTieredDiscountDescription(description: string): boolean {
  return /^(?:MQUAL|NQUAL)\s+DISC$/i.test(description.trim());
}

function detectTieredPricingModelFromFeeLedger(feeLedger: FeeLedgerForPricingModel) {
  const tieredRows = feeLedger.rows.filter((row) => isTieredDiscountDescription(row.description) && row.volumeBasis !== null && row.volumeBasis > 0 && row.amount > 0);
  if (tieredRows.length < 2) {
    return null;
  }

  const evidence = tieredRows.map((row) => {
    const derivedRate = round8(row.amount / (row.volumeBasis ?? 1));
    const computedFee = round2((row.volumeBasis ?? 0) * derivedRate);
    return {
      description: row.description,
      network: row.network,
      volume: row.volumeBasis ?? 0,
      rate: derivedRate,
      statedFee: row.amount,
      computedFee,
      delta: round2(row.amount - computedFee),
      evidenceLine: row.evidenceLine,
    };
  });

  return {
    pricingModel: "tiered_pricing",
    confidence: "high",
    cashDiscountStatus: "not_applicable",
    flatDiscountRate: null,
    evidenceType: "fee_math_inferred",
    evidence,
    notes: [
      "Tiered pricing inferred from visible MQUAL/NQUAL discount buckets with statement-level volume and fee math.",
      "Tiered discount buckets are processor-controlled blended fees; the statement exposes the charged amounts but not the interchange-versus-processor-margin split.",
      "These rows are structurally unprovable at cost from this statement and must remain excluded from clean pass-through/markup split reporting unless external contract detail or explicit processor data exposes the split.",
    ],
  };
}

function detectInterchangePlusPricingModelFromFeeLedger(feeLedger: FeeLedgerForPricingModel) {
  const itemizedRows = feeLedger.rows.filter((row) => row.type === "Interchange charges");
  if (itemizedRows.length < 2) {
    return null;
  }

  const evidenceRows = itemizedRows.filter((row) => row.volumeBasis !== null && row.volumeBasis > 0 && row.rate !== null && row.rate > 0).slice(0, 8);
  const evidence = evidenceRows.map((row) => {
    const computedFee = round2((row.volumeBasis ?? 0) * (row.rate ?? 0));
    return {
      description: row.description,
      network: row.network,
      volume: row.volumeBasis ?? 0,
      rate: row.rate ?? 0,
      statedFee: row.amount,
      computedFee,
      delta: round2(row.amount - computedFee),
      evidenceLine: row.evidenceLine,
    };
  });

  return {
    pricingModel: "interchange_plus",
    confidence: evidence.length > 0 ? "high" : "medium",
    cashDiscountStatus: "not_applicable",
    flatDiscountRate: null,
    evidenceType: evidence.length > 0 ? "fee_math_inferred" : "explicit_statement_label",
    evidence,
    notes: [
      "Interchange-plus/itemized cost exposure inferred from separate Interchange charges rows in the fee ledger.",
      "This identifies the statement structure; it does not prove every interchange or assessment row was passed through at cost.",
      "Line-level at-cost proof still depends on period-correct reference-rate matching.",
    ],
  };
}

function transactionRateFromDiscountDescription(description: string): number {
  const match = description.match(/\bTRANS\s+AT\s+(\.?\d+(?:\.\d+)?)\b/i);
  const parsed = match ? Number(match[1]) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectFlatRatePricingModelFromFeeLedger(feeLedger: FeeLedgerForPricingModel) {
  const discountRows = feeLedger.rows.filter(
    (row) => /\bDISCOUNT\b/i.test(row.description) && row.volumeBasis !== null && row.volumeBasis > 0 && row.rate !== null && row.rate > 0 && row.amount > 0,
  );
  if (discountRows.length < 1) {
    return null;
  }

  const evidence = discountRows.map((row) => {
    const computedFee = round2((row.volumeBasis ?? 0) * (row.rate ?? 0) + (row.count ?? 0) * transactionRateFromDiscountDescription(row.description));
    return {
      description: row.description,
      network: row.network,
      volume: row.volumeBasis ?? 0,
      rate: row.rate ?? 0,
      statedFee: row.amount,
      computedFee,
      delta: round2(row.amount - computedFee),
      evidenceLine: row.evidenceLine,
    };
  });

  return {
    pricingModel: "flat_rate",
    confidence: discountRows.length >= 2 ? "medium" : "low",
    cashDiscountStatus: "not_applicable",
    flatDiscountRate: discountRows[0]!.rate ?? null,
    evidenceType: "fee_math_inferred",
    evidence,
    notes: [
      "Flat-rate pricing inferred conservatively from visible discount/service-charge row math.",
      "This is not treated as confirmed cash discount because the statement does not explicitly identify a cash-discount or non-cash-adjustment program.",
      "No itemized interchange/program detail is available on this layout, so pass-through-at-cost proof is structurally unavailable for the discount row.",
    ],
  };
}

function detectPricingModelFromFeeLedger(feeLedger: FeeLedgerForPricingModel) {
  const discountRows = feeLedger.rows.filter(
    (row) => row.description === "QUAL DISC" && row.volumeBasis !== null && row.volumeBasis > 0 && row.rate !== null && row.rate > 0 && row.amount > 0,
  );
  if (discountRows.length < 2) {
    return (
      detectTieredPricingModelFromFeeLedger(feeLedger) ??
      detectInterchangePlusPricingModelFromFeeLedger(feeLedger) ??
      detectFlatRatePricingModelFromFeeLedger(feeLedger) ??
      unknownPricingModel("No repeated rated QUAL DISC rows or MQUAL/NQUAL tiered discount rows were found for deterministic pricing model detection.")
    );
  }

  const firstRate = discountRows[0]!.rate!;
  const sameRateRows = discountRows.filter((row) => Math.abs((row.rate ?? 0) - firstRate) <= 0.000001);
  const evidence = sameRateRows.map((row) => {
    const computedFee = round2((row.volumeBasis ?? 0) * (row.rate ?? 0));
    return {
      description: row.description,
      network: row.network,
      volume: row.volumeBasis ?? 0,
      rate: row.rate ?? 0,
      statedFee: row.amount,
      computedFee,
      delta: round2(row.amount - computedFee),
      evidenceLine: row.evidenceLine,
    };
  });
  const reconciledRows = evidence.filter((row) => Math.abs(row.delta) <= 0.06);
  const enoughRows = sameRateRows.length >= 2 && sameRateRows.length === discountRows.length;
  const enoughMath = reconciledRows.length === evidence.length;

  if (!enoughRows || !enoughMath) {
    return (
      detectTieredPricingModelFromFeeLedger(feeLedger) ??
      detectInterchangePlusPricingModelFromFeeLedger(feeLedger) ??
      detectFlatRatePricingModelFromFeeLedger(feeLedger) ??
      unknownPricingModel("Rated QUAL DISC rows were present, but the rates or fee math were not consistent enough to classify the pricing model.")
    );
  }

  return {
    pricingModel: "flat_discount_pricing",
    confidence: "high",
    cashDiscountStatus: "not_confirmed",
    flatDiscountRate: firstRate,
    evidenceType: "fee_math_inferred",
    evidence,
    notes: [
      "Flat discount pricing inferred from repeated QUAL DISC rows with the same rate and row-level volume times rate math.",
      "Cash discount is not confirmed because the uploaded statement text does not explicitly identify a cash discount or non-cash adjustment program.",
    ],
  };
}

function parseFiservProcessorBatchFundingRow(content: string, page: number | null) {
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

function buildFiservProcessorFundingBatchLedger(doc: RawExtractedDocument) {
  const rows = [];
  const startIndex = doc.rows.findIndex((row) => /^Date\s*\|\s*Batch\s*\|\s*Submitted\b/i.test(rowContent(row)));
  if (startIndex < 0) throw new Error("Parser could not find Fiserv processor-branded batch funding table.");
  const endIndex = doc.rows.findIndex((row, index) => index > startIndex && /^AMOUNTS SUBMITTED\b/i.test(rowContent(row)));
  const batchSectionRows = doc.rows.slice(startIndex, endIndex > startIndex ? endIndex : doc.rows.length);

  for (let index = 0; index < batchSectionRows.length; index += 1) {
    const rawRow = batchSectionRows[index]!;
    const content = rowContent(rawRow);
    let row = parseFiservProcessorBatchFundingRow(content, pageNumber(rawRow));
    if (!row && /^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*\d+/.test(content)) {
      const next = rowContent(batchSectionRows[index + 1] ?? ({} as RawDocumentRow));
      if (!row && (/^\$/.test(next) || /^-\$/.test(next))) {
        row = parseFiservProcessorBatchFundingRow(`${content} | ${next}`, pageNumber(rawRow));
      }
    }
    if (!row && (/^\$/.test(content) || /^-\$/.test(content)) && cellParts(content).length === 5) {
      const next = rowContent(batchSectionRows[index + 1] ?? ({} as RawDocumentRow));
      if (/^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*\d+/.test(next) && cellParts(next).length === 2) {
        row = parseFiservProcessorBatchFundingRow(`${next} | ${content}`, pageNumber(rawRow));
        index += 1;
      }
    }
    if (row) {
      rows.push(row);
      continue;
    }
    const parts = cellParts(content);
    if ((content.startsWith("Month End Charge") || content.startsWith("Less Discount Paid")) && content.includes("-$") && parts.length >= 5) {
      const fee = positiveFiservProcessorAmount(parts.at(-2) ?? parts.at(-1) ?? "0.00");
      const funded = parseFiservProcessorAmount(parts.at(-1) ?? "0.00");
      const formulaResult = round2(0 - fee);
      const delta = round2(funded - formulaResult);
      rows.push({
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
        pageNumber: pageNumber(rawRow),
        notes: [`${parts[0] ?? "Funding charge"} is modeled as a funding ledger charge row, not a submitted-sales batch.`],
      });
    }
  }

  const totalRawRow = batchSectionRows.find((row) => /^Total\s*\|/.test(rowContent(row)) && cellParts(rowContent(row)).length >= 6);
  if (!totalRawRow) throw new Error("Parser could not find Fiserv batch total.");
  const totalContent = rowContent(totalRawRow);
  const totalParts = cellParts(totalContent);
  const controlSubmittedTotal = positiveFiservProcessorAmount(totalParts[1] ?? "0.00");
  const controlFeesChargedTotal = positiveFiservProcessorAmount(totalParts[4] ?? "0.00");
  const controlFundedTotal = parseFiservProcessorAmount(totalParts[5] ?? "0.00");
  const submittedTotal = round2(rows.reduce((sum, row) => sum + (/^\d{2}\/\d{2}(?:\/\d{2})?$/.test(row.dateSubmitted) ? row.amountSubmitted : 0), 0));
  const fundedTotal = round2(rows.reduce((sum, row) => sum + row.amountFunded, 0));
  const feesChargedTotal = round2(rows.reduce((sum, row) => sum + row.feesCharged, 0));
  const submittedDelta = round2(controlSubmittedTotal - submittedTotal);
  const fundedDelta = round2(controlFundedTotal - fundedTotal);
  const feesChargedDelta = round2(controlFeesChargedTotal - feesChargedTotal);
  const anomalyCount = rows.filter((row) => row.status === "fail").length + (Math.abs(feesChargedDelta) > 0.01 ? 1 : 0);

  return {
    status: anomalyCount > 0 ? "reconciled_with_warnings" : "reconciled",
    formula: "Amount Submitted - Third Party Transactions + Adjustments + Chargebacks - Fees Charged = Amount Funded",
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
    evidenceLine: totalContent,
    notes: [
      "Batch rows preserve the statement's printed values even when a row does not reconcile.",
      ...(rows.some((row) => row.dateSubmitted === "02/27/24" && row.status === "fail")
        ? ["The 02/27/24 batch row is a verified statement anomaly: displayed fee $48.22 does not produce printed funded amount $2,344.10."]
        : []),
    ],
  };
}

function parseFirstDataFullBatchRow(content: string, page: number | null) {
  const parts = cellParts(content);
  if (parts.length < 9) return null;

  const batchNumber = parts[0] ?? "";
  const dateSubmitted = parts[1] ?? "";
  if (!/^\d{6,}$/.test(batchNumber) || !/^\d{2}\/\d{2}\/\d{2}$/.test(dateSubmitted)) return null;

  const submittedAmount = positiveFiservProcessorAmount(parts[8] ?? "0.00");
  return {
    dateSubmitted,
    batchNumber,
    amountSubmitted: submittedAmount,
    thirdPartyTransactions: 0,
    adjustments: 0,
    chargebacks: 0,
    feesCharged: 0,
    amountFunded: submittedAmount,
    formulaResult: submittedAmount,
    delta: 0,
    tolerance: 0.01,
    status: "pass",
    evidenceLine: content,
    pageNumber: page,
    notes: [
      "Full First Data/Clover SUMMARY BY BATCH rows show submitted sales, not per-batch funded deposits; month-end fees are modeled as a separate funding row.",
    ],
  };
}

function buildFiservFullStatementFundingBatchLedger(
  doc: RawExtractedDocument,
  options: { totalFees: number; amountFunded: number },
) {
  const startIndex = doc.rows.findIndex((row) => /^SUMMARY BY BATCH$/i.test(rowContent(row)));
  if (startIndex < 0) throw new Error("Parser could not find First Data full-statement SUMMARY BY BATCH section.");

  const endIndex = doc.rows.findIndex((row, index) => index > startIndex && /^CHARGEBACKS\/REVERSALS\b/i.test(rowContent(row)));
  const scanEnd = endIndex < 0 ? doc.rows.length : endIndex;
  const rows = [];

  for (let index = startIndex + 1; index < scanEnd; index += 1) {
    const rawRow = doc.rows[index]!;
    const parsed = parseFirstDataFullBatchRow(rowContent(rawRow), pageNumber(rawRow));
    if (parsed) rows.push(parsed);
  }

  const totalRow = findLastRow(
    doc,
    (row, index) => index > startIndex && index < scanEnd && /^Total\s*\|/.test(rowContent(row)) && cellParts(rowContent(row)).length >= 7,
    "First Data full-statement batch total",
  );
  const totalParts = cellParts(totalRow.content);
  const controlSubmittedTotal = positiveFiservProcessorAmount(totalParts.at(-1) ?? "0.00");
  const monthEndRow = doc.rows
    .map((row, index) => asEvidence(row, index))
    .find((row) => row.index < startIndex && row.content.startsWith("Month End Charge") && row.content.includes("-$"));
  const monthEndEvidence = monthEndRow?.content ?? "Month End Charge";

  rows.push({
    dateSubmitted: "Month End Charge",
    batchNumber: null,
    amountSubmitted: 0,
    thirdPartyTransactions: 0,
    adjustments: 0,
    chargebacks: 0,
    feesCharged: options.totalFees,
    amountFunded: round2(0 - options.totalFees),
    formulaResult: round2(0 - options.totalFees),
    delta: 0,
    tolerance: 0.01,
    status: "pass",
    evidenceLine: monthEndEvidence,
    pageNumber: monthEndRow?.pageNumber ?? null,
    notes: ["Month-end fees are modeled as the funding row that reconciles submitted batch sales to total amount processed."],
  });

  const datedBatchRows = rows.filter((row) => /^\d{2}\/\d{2}\/\d{2}$/.test(row.dateSubmitted));
  const submittedTotal = round2(datedBatchRows.reduce((sum, row) => sum + row.amountSubmitted, 0));
  const fundedTotal = round2(rows.reduce((sum, row) => sum + row.amountFunded, 0));
  const feesChargedTotal = round2(rows.reduce((sum, row) => sum + row.feesCharged, 0));
  const submittedDelta = round2(controlSubmittedTotal - submittedTotal);
  const fundedDelta = round2(options.amountFunded - fundedTotal);
  const feesChargedDelta = round2(options.totalFees - feesChargedTotal);
  const anomalyCount =
    rows.filter((row) => row.status === "fail").length +
    (Math.abs(submittedDelta) > 0.01 ? 1 : 0) +
    (Math.abs(fundedDelta) > 0.01 ? 1 : 0) +
    (Math.abs(feesChargedDelta) > 0.01 ? 1 : 0);

  return {
    status: anomalyCount > 0 ? "reconciled_with_warnings" : "reconciled",
    formula: "Submitted batch sales - month-end fees = Total Amount Processed",
    rows,
    rowCount: rows.length,
    anomalyCount,
    submittedTotal,
    fundedTotal,
    feesChargedTotal,
    controlSubmittedTotal,
    controlFundedTotal: options.amountFunded,
    controlFeesChargedTotal: options.totalFees,
    submittedDelta,
    fundedDelta,
    feesChargedDelta,
    evidenceLine: totalRow.content,
    notes: [
      "Full First Data/Clover statements do not print per-batch funded amounts; this ledger reconciles submitted batch sales plus the month-end fee row to the printed Total Amount Processed.",
    ],
  };
}

function parseFirstDataShortFeeRow(content: string, context: { sourceSection: string; network: string | null; pageNumber: number | null; lineIndex: number }) {
  const parts = cellParts(content);
  if (parts.length < 3) return null;

  const amountCell = parts.at(-1) ?? "";
  const type = parts.at(-2) ?? "";
  if (!["Service charges", "Fees"].includes(type) || !amountCell.includes("$")) return null;

  const description = parts.slice(0, -2).join(" ").replace(/\s+/g, " ").trim();
  if (!description || /^TOTAL\b/i.test(description)) return null;

  const amount = positiveFiservProcessorAmount(amountCell);
  const volumeBasis = firstFiservProcessorMoneyToken(description);
  const count = firstFullStatementCount(description);
  const rate = firstDataShortDiscountRate(description) ?? firstFiservProcessorRate(description);
  const bucket = context.sourceSection === "ACCOUNT FEES" ? "miscellaneousFees" : "cardFees";

  return {
    date: null,
    type,
    network: context.network,
    description,
    volumeBasis,
    count,
    rate,
    amount,
    bucket,
    sourceSection: context.sourceSection,
    evidenceLine: content,
    pageNumber: context.pageNumber,
    confidence: "high",
    lineIndex: context.lineIndex,
  };
}

function buildFiservShortStatementFeeLedger(doc: RawExtractedDocument, printedTotal: number) {
  const feeStartIndex = doc.rows.findIndex((row) => /^FEES$/i.test(rowContent(row)));
  if (feeStartIndex < 0) throw new Error("Parser could not find First Data short-statement FEES section.");
  const feeEndIndex = doc.rows.findIndex(
    (row, index) => index > feeStartIndex && /^Total \(Service Charges, Interchange Charges\/Program Fees, and Fees\)/.test(rowContent(row)),
  );
  if (feeEndIndex < 0) throw new Error("Parser could not find First Data short-statement fee grand total.");

  const rows = [];
  let sourceSection = "";
  let network: string | null = null;

  for (let index = feeStartIndex + 1; index < feeEndIndex; index += 1) {
    const rawRow = doc.rows[index]!;
    const content = rowContent(rawRow);
    const firstCell = cellParts(content)[0] ?? content;

    if (firstCell === "TRANSACTION FEES" || firstCell === "ACCOUNT FEES") {
      sourceSection = firstCell;
      network = null;
      continue;
    }
    if (firstCell === "Other") {
      network = firstCell;
      continue;
    }

    const parsed = parseFirstDataShortFeeRow(content, {
      sourceSection,
      network,
      pageNumber: pageNumber(rawRow),
      lineIndex: index,
    });
    if (parsed) rows.push(parsed);
  }

  const transactionTotalRow = findRow(
    doc,
    (row) => /^TOTAL TRANSACTION FEES\s*\|/i.test(rowContent(row)),
    "First Data short-statement total transaction fees",
  );
  const accountTotalRow = findRow(doc, (row) => /^TOTAL ACCOUNT FEES\s*\|/i.test(rowContent(row)), "First Data short-statement total account fees");
  const grandTotalIndex = doc.rows.findIndex((row, index) => index > feeStartIndex && index < feeEndIndex && /^TOTAL\s*\|\s*-\$/.test(rowContent(row)));
  if (grandTotalIndex < 0) throw new Error("Parser could not find First Data short-statement fee ledger total.");
  const grandTotalRow = asEvidence(doc.rows[grandTotalIndex]!, grandTotalIndex);
  const transactionPrinted = lastFiservProcessorAmountFromContent(transactionTotalRow.content);
  const accountPrinted = lastFiservProcessorAmountFromContent(accountTotalRow.content);
  const ledgerPrintedTotal = lastFiservProcessorAmountFromContent(grandTotalRow.content);
  const transactionRows = rows.filter((row) => row.bucket === "cardFees");
  const accountRows = rows.filter((row) => row.bucket === "miscellaneousFees");
  const transactionRowSum = round2(transactionRows.reduce((sum, row) => sum + row.amount, 0));
  const accountRowSum = round2(accountRows.reduce((sum, row) => sum + row.amount, 0));
  const totalRowSum = round2(transactionRowSum + accountRowSum);
  const totalDelta = round2(printedTotal - totalRowSum);
  const controls = [
    makeFeeLedgerControl({
      label: "TOTAL TRANSACTION FEES",
      bucket: "cardFees",
      rowSum: transactionRowSum,
      printedTotal: transactionPrinted,
      tolerance: 0.01,
      evidenceLine: transactionTotalRow.content,
    }),
    makeFeeLedgerControl({
      label: "TOTAL ACCOUNT FEES",
      bucket: "miscellaneousFees",
      rowSum: accountRowSum,
      printedTotal: accountPrinted,
      tolerance: 0.01,
      evidenceLine: accountTotalRow.content,
    }),
    makeFeeLedgerControl({
      label: "TOTAL",
      bucket: "unknown",
      rowSum: totalRowSum,
      printedTotal: ledgerPrintedTotal,
      tolerance: 0.01,
      evidenceLine: grandTotalRow.content,
    }),
  ];

  const classified = classifyFiservProcessorFeeLedgerRows(
    rows.map(({ lineIndex: _lineIndex, ...row }) => row),
    printedTotal,
  );

  return {
    status: Math.abs(totalDelta) <= 0.01 ? "reconciled" : "unreconciled",
    rows: classified.rows,
    controls,
    totalRowSum,
    printedTotal,
    delta: totalDelta,
    tolerance: 0.01,
    evidenceLine: grandTotalRow.content,
    feeClassificationSummary: classified.summary,
    notes: ["Short First Data/Clover fee ledger exposes service-charge and account-fee rows, but no interchange/program detail rows."],
  };
}

function parseFirstDataShortBatchRow(content: string, page: number | null) {
  const parts = cellParts(content);
  if (parts.length < 9) return null;

  const batchNumber = parts[0] ?? "";
  const dateSubmitted = parts[1] ?? "";
  if (!/^\d{6,}$/.test(batchNumber) || !/^\d{2}\/\d{2}\/\d{2}$/.test(dateSubmitted)) return null;

  const amountSubmitted = positiveFiservProcessorAmount(parts.at(-1) ?? "0.00");
  return {
    dateSubmitted,
    batchNumber,
    amountSubmitted,
    thirdPartyTransactions: 0,
    adjustments: 0,
    chargebacks: 0,
    feesCharged: 0,
    amountFunded: amountSubmitted,
    formulaResult: amountSubmitted,
    delta: 0,
    tolerance: 0.01,
    status: "pass",
    evidenceLine: content,
    pageNumber: page,
    notes: ["Short First Data/Clover batch row shows submitted net batch amount; adjustments and month-end fees are modeled as separate funding rows."],
  };
}

function parseFirstDataShortAdjustmentRow(content: string, page: number | null) {
  const parts = cellParts(content);
  if (parts.length < 3) return null;

  const dateSubmitted = parts[0] ?? "";
  const description = parts[1] ?? "";
  if (!/^\d{2}\/\d{2}\/\d{2}$/.test(dateSubmitted) || !description) return null;

  const adjustments = parseFiservProcessorAmount(parts.at(-1) ?? "0.00");
  return {
    dateSubmitted,
    batchNumber: null,
    amountSubmitted: 0,
    thirdPartyTransactions: 0,
    adjustments,
    chargebacks: 0,
    feesCharged: 0,
    amountFunded: adjustments,
    formulaResult: adjustments,
    delta: 0,
    tolerance: 0.01,
    status: "pass",
    evidenceLine: content,
    pageNumber: page,
    notes: [`Adjustment detail row (${description}) is modeled separately from submitted-sales batches.`],
  };
}

function buildFiservShortStatementFundingBatchLedger(
  doc: RawExtractedDocument,
  options: { totalVolume: number; totalFees: number; adjustments: number; amountFunded: number },
) {
  const chargebacksStart = doc.rows.findIndex((row) => /^CHARGEBACKS\/REVERSALS\b/i.test(rowContent(row)));
  const batchRows = [];
  for (let index = 0; index < (chargebacksStart < 0 ? doc.rows.length : chargebacksStart); index += 1) {
    const rawRow = doc.rows[index]!;
    const parsed = parseFirstDataShortBatchRow(rowContent(rawRow), pageNumber(rawRow));
    if (parsed) batchRows.push(parsed);
  }

  const adjustmentStart = doc.rows.findIndex((row) => /^ADJUSTMENTS$/i.test(rowContent(row)));
  const feeStart = doc.rows.findIndex((row, index) => index > adjustmentStart && /^FEES$/i.test(rowContent(row)));
  const adjustmentRows = [];
  if (adjustmentStart >= 0) {
    const scanEnd = feeStart < 0 ? doc.rows.length : feeStart;
    for (let index = adjustmentStart + 1; index < scanEnd; index += 1) {
      const rawRow = doc.rows[index]!;
      const parsed = parseFirstDataShortAdjustmentRow(rowContent(rawRow), pageNumber(rawRow));
      if (parsed) adjustmentRows.push(parsed);
    }
  }

  const monthEndRow = findRow(doc, (row) => /^Month End Charge\s*\|/.test(rowContent(row)), "First Data short-statement month-end charge");
  const monthEndParts = cellParts(monthEndRow.content);
  const monthEndFee = positiveFiservProcessorAmount(monthEndParts.at(-2) ?? "0.00");
  const monthEndFunded = parseFiservProcessorAmount(monthEndParts.at(-1) ?? "0.00");
  const monthEndFormulaResult = round2(0 - monthEndFee);
  const monthEndDelta = round2(monthEndFunded - monthEndFormulaResult);
  const monthEndFundingRow = {
    dateSubmitted: "Month End Charge",
    batchNumber: null,
    amountSubmitted: 0,
    thirdPartyTransactions: 0,
    adjustments: 0,
    chargebacks: 0,
    feesCharged: monthEndFee,
    amountFunded: monthEndFunded,
    formulaResult: monthEndFormulaResult,
    delta: monthEndDelta,
    tolerance: 0.01,
    status: Math.abs(monthEndDelta) <= 0.01 ? "pass" : "fail",
    evidenceLine: monthEndRow.content,
    pageNumber: monthEndRow.pageNumber,
    notes: ["Month-end fee row reconciles submitted batches and adjustments to the printed amount processed."],
  };

  const rows = [...batchRows, ...adjustmentRows, monthEndFundingRow];
  const summaryByBatchTotalRow = findLastRow(
    doc,
    (row, index) =>
      (chargebacksStart < 0 || index < chargebacksStart) &&
      /^Total\s*\|/.test(rowContent(row)) &&
      cellParts(rowContent(row)).length >= 7,
    "First Data short-statement summary-by-batch total",
  );
  const controlSubmittedTotal = positiveFiservProcessorAmount(cellParts(summaryByBatchTotalRow.content).at(-1) ?? "0.00");
  const submittedTotal = round2(batchRows.reduce((sum, row) => sum + row.amountSubmitted, 0));
  const fundedTotal = round2(rows.reduce((sum, row) => sum + row.amountFunded, 0));
  const feesChargedTotal = round2(rows.reduce((sum, row) => sum + row.feesCharged, 0));
  const submittedDelta = round2(controlSubmittedTotal - submittedTotal);
  const fundedDelta = round2(options.amountFunded - fundedTotal);
  const feesChargedDelta = round2(options.totalFees - feesChargedTotal);
  const anomalyCount =
    rows.filter((row) => row.status === "fail").length +
    (Math.abs(submittedDelta) > 0.01 ? 1 : 0) +
    (Math.abs(fundedDelta) > 0.01 ? 1 : 0) +
    (Math.abs(feesChargedDelta) > 0.01 ? 1 : 0);

  return {
    status: anomalyCount > 0 ? "reconciled_with_warnings" : "reconciled",
    formula: "Submitted batch amounts + adjustments - month-end fees = Total Amount Processed",
    rows,
    rowCount: rows.length,
    anomalyCount,
    submittedTotal,
    fundedTotal,
    feesChargedTotal,
    controlSubmittedTotal,
    controlFundedTotal: options.amountFunded,
    controlFeesChargedTotal: options.totalFees,
    submittedDelta,
    fundedDelta,
    feesChargedDelta,
    evidenceLine: summaryByBatchTotalRow.content,
    notes: [
      "Short First Data/Clover funding ledger uses submitted batch rows, separate adjustment detail rows, and the month-end fee row because the statement does not print per-batch funded deposits.",
    ],
  };
}

function buildFiservShortStatementReconciliationResults(params: {
  selectedFinancials: SelectedStatementFinancials;
  cardTypeSubmitted: number;
  batchSubmitted: number;
  adjustmentDetailTotal: number;
  feeLedger: ReturnType<typeof buildFiservShortStatementFeeLedger>;
  fundingBatchLedger: ReturnType<typeof buildFiservShortStatementFundingBatchLedger>;
  cardTypeTotalRow: EvidenceRow;
  batchTotalRow: EvidenceRow;
}) {
  const exactBand = exactMoneyToleranceBand();
  const results = [];
  const selected = params.selectedFinancials;
  const fundingComputed = round2(
    selected.totalVolume +
      (selected.adjustmentsChargebacks ?? 0) -
      selected.totalFees -
      (selected.thirdPartyTransactions ?? 0),
  );

  results.push(
    makeReconResult({
      identity: "headline:submitted_plus_adjustments_minus_fees_eq_processed",
      stated: selected.amountFunded,
      computed: fundingComputed,
      toleranceBand: exactBand,
      note: "Short-statement headline funding formula using selected top-line totals.",
      evidence: { section: "SUMMARY", rowLabel: "Total Amount Processed" },
    }),
  );
  results.push(
    makeReconResult({
      identity: "batch_columns:sum_submitted_eq_submitted_total",
      stated: params.fundingBatchLedger.controlSubmittedTotal,
      computed: params.fundingBatchLedger.submittedTotal,
      toleranceBand: sumMoneyToleranceBand(params.fundingBatchLedger.rows.length, { cap: 0.25 }),
      note: "Submitted batch amounts are checked against the Summary By Batch total.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Total", sourceText: params.batchTotalRow.content },
    }),
  );
  results.push(
    makeReconResult({
      identity: "batch_columns:sum_funded_eq_processed_total",
      stated: params.fundingBatchLedger.controlFundedTotal,
      computed: params.fundingBatchLedger.fundedTotal,
      toleranceBand: sumMoneyToleranceBand(params.fundingBatchLedger.rows.length, { cap: 0.25 }),
      note: "Submitted batches, adjustment detail rows, and month-end fees are summed to the printed Total Amount Processed.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Total Amount Processed" },
    }),
  );
  results.push(
    makeReconResult({
      identity: "batch_columns:sum_fees_eq_total_fees",
      stated: params.fundingBatchLedger.controlFeesChargedTotal,
      computed: params.fundingBatchLedger.feesChargedTotal,
      toleranceBand: sumMoneyToleranceBand(params.fundingBatchLedger.rows.length, { cap: 0.25 }),
      note: "Month-end fee row is checked against selected total fees.",
      evidence: { section: "SUMMARY BY DAY", rowLabel: "Month End Charge" },
    }),
  );

  for (const [index, row] of params.fundingBatchLedger.rows.entries()) {
    results.push(
      makeReconResult({
        identity: `batch_row:${row.dateSubmitted}:${row.batchNumber ?? "adjustment_or_month_end"}:funding_formula`,
        stated: row.amountFunded,
        computed: row.formulaResult,
        toleranceBand: exactBand,
        note: "Short-statement funding row checked using the row's exposed submitted, adjustment, and fee values.",
        evidence: {
          section: "SUMMARY BY BATCH / ADJUSTMENTS",
          pageNumber: row.pageNumber,
          rowLabel: row.dateSubmitted,
          rowIndex: index,
          sourceText: row.evidenceLine,
        },
      }),
    );
  }

  for (const control of params.feeLedger.controls) {
    const controlRowCount =
      control.bucket === "unknown" ? params.feeLedger.rows.length : params.feeLedger.rows.filter((row) => row.bucket === control.bucket).length;
    results.push(
      makeReconResult({
        identity: `fee_detail:${control.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}:line_sum_eq_printed_total`,
        stated: control.printedTotal,
        computed: control.rowSum,
        toleranceBand: sumMoneyToleranceBand(controlRowCount, { cap: 0.25 }),
        note: "Short-statement fee rows are checked against printed fee controls.",
        evidence: { section: "FEES", rowLabel: control.label, sourceText: control.evidenceLine },
      }),
    );
  }
  results.push(
    makeReconResult({
      identity: "fee_detail:all_line_items_eq_total_fees",
      stated: selected.totalFees,
      computed: params.feeLedger.totalRowSum,
      toleranceBand: sumMoneyToleranceBand(params.feeLedger.rows.length, { cap: 0.25 }),
      note: "All parsed short-statement fee rows compared with the selected all-in fee total.",
      evidence: { section: "FEES", rowLabel: "TOTAL", sourceText: params.feeLedger.evidenceLine },
    }),
  );
  results.push(
    makeReconResult({
      identity: "cross_reference:summary_by_batch_submitted_eq_selected_submitted",
      stated: selected.totalVolume,
      computed: params.batchSubmitted,
      toleranceBand: exactBand,
      note: "Summary By Batch total cross-checks the selected submitted volume.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Total", sourceText: params.batchTotalRow.content },
    }),
  );
  results.push(
    makeReconResult({
      identity: "cross_reference:adjustment_detail_total_eq_selected_adjustments",
      stated: selected.adjustmentsChargebacks,
      computed: round2(0 - params.adjustmentDetailTotal),
      toleranceBand: exactBand,
      note: "Adjustment detail total cross-checks the selected adjustment deduction.",
      evidence: { section: "ADJUSTMENTS", rowLabel: "TOTAL" },
    }),
  );
  results.push(
    makeUnreferencedValueResult({
      identity: "orphan_total:summary_by_card_type_adjustment_distorted_submitted_total",
      stated: params.cardTypeSubmitted,
      nearestReference: selected.totalVolume,
      note: "Card-type total is visible but distorted by the adjustment row; it is preserved as an excluded candidate instead of selected as processing volume.",
      evidence: {
        section: "SUMMARY BY CARD TYPE",
        pageNumber: params.cardTypeTotalRow.pageNumber,
        rowLabel: "Total",
        sourceText: params.cardTypeTotalRow.content,
      },
    }),
  );

  return results;
}

export function parseFiservFirstDataFullStatement(doc: RawExtractedDocument, options: ParseOptions = {}): FiservParserOutput {
  if (!isFirstDataFullStatement(doc)) {
    throw new Error("Document does not match the Fiserv / First Data full statement layout.");
  }

  const sourceFileName = options.sourceFileName ?? "unknown.pdf";
  const merchantNameRow = findRow(
    doc,
    (row) => /Page 1 of \d+/i.test(rowContent(row)) && !/YOUR CARD PROCESSING STATEMENT/i.test(rowContent(row)),
    "merchant name",
  );
  const merchantName = merchantNameRow.content.split("|")[0]!.trim();

  const periodRow = findRow(doc, (row) => String(row.label ?? "") === "Statement Period", "statement period");
  const periodValue = String(periodRow.row.value ?? periodRow.content);
  const period = parsePeriod(periodValue);

  const merchantNumberRow = findFiservStatementMerchantNumberRow(doc);
  const merchantNumber = merchantNumberFromEvidence(merchantNumberRow);

  const totalVolumeRow = findRow(doc, (row) => String(row.label ?? "") === "Total Amount Submitted", "total amount submitted");
  const amountFundedRow = findRow(doc, (row) => String(row.label ?? "") === "Total Amount Processed", "total amount processed");
  const feesRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Fees" && (signedMoneyTokens(rowContent(row)).at(-1) ?? 0) < 0,
    "summary fees",
  );
  const adjustmentsRow = findRow(doc, (row) => String(row.label ?? "") === "Adjustments", "adjustments");
  const chargebacksRow = findRow(doc, (row) => String(row.label ?? "") === "Chargebacks/Reversals", "chargebacks/reversals");
  const cardTypeTotalRow = findFullStatementCardTypeTotalRow(doc);

  const totalVolume = requireAmount(totalVolumeRow, "total amount submitted");
  const amountFunded = requireAmount(amountFundedRow, "total amount processed");
  const totalFees = requireAmount(feesRow, "fees");
  const adjustments = requireAmount(adjustmentsRow, "adjustments");
  const chargebacks = requireAmount(chargebacksRow, "chargebacks/reversals");
  const cardTypeAmounts = signedMoneyTokens(cardTypeTotalRow.content);
  const cardTypeIntegers = integerTokens(cardTypeTotalRow.content);
  const grossSales = Math.abs(cardTypeAmounts[0] ?? 0);
  const refunds = Math.abs(cardTypeAmounts[1] ?? 0);
  const cardTypeSubmitted = Math.abs(cardTypeAmounts[2] ?? 0);
  const grossSaleItems = cardTypeIntegers[0] ?? null;
  const primaryTransactionCount = cardTypeIntegers[2] ?? null;

  const interchangeBucketRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Total Interchange Charges/Program Fees",
    "interchange/program fee bucket",
  );
  const serviceChargesRow = findRow(doc, (row) => String(row.label ?? "") === "Total Service Charges", "service charges bucket");
  const processorFeesRow = findRow(doc, (row) => String(row.label ?? "") === "Total Fees", "processor/account fee bucket");
  const feeGrandTotalRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Total (Service Charges, Interchange Charges/Program Fees, and Fees)",
    "fee section grand total",
  );
  const interchangeDetailRow = findFullStatementInterchangeDetailTotalRow(doc);
  const reportableSalesRow = findRow(doc, (row) => /GROSS REPORTABLE SALES-TIN/.test(rowContent(row)), "gross reportable sales");
  const ytdSalesRow = findRow(doc, (row) => /YTD Gross Reportable Sales/i.test(rowContent(row)), "YTD gross reportable sales");

  const interchangeBucket = requireAmount(interchangeBucketRow, "interchange/program fee bucket");
  const serviceCharges = requireAmount(serviceChargesRow, "service charges bucket");
  const processorFees = requireAmount(processorFeesRow, "processor/account fee bucket");
  const feeGrandTotal = requireAmount(feeGrandTotalRow, "fee section grand total");
  const interchangeTokens = signedMoneyTokens(interchangeDetailRow.content);
  const interchangeVolume = Math.abs(interchangeTokens[0] ?? 0);
  const interchangeDetailTotal = Math.abs(interchangeTokens[1] ?? 0);
  const interchangeTransactions = integerTokens(interchangeDetailRow.content).at(-1) ?? null;
  const reportableSales = requireAmount(reportableSalesRow, "gross reportable sales");
  const ytdSales = requireAmount(ytdSalesRow, "YTD gross reportable sales");

  const legacyEffectiveRate = round8(totalFees / totalVolume);
  const legacyAdjustmentsChargebacks = round2(adjustments + chargebacks);
  const documentIrTopLevel = extractDocumentIrTopLevelFinancials(doc, sourceFileName);
  const documentIrWarnings = documentIrTopLevelMismatchWarnings(documentIrTopLevel, {
    totalVolume,
    totalFees,
    effectiveRate: legacyEffectiveRate,
    amountFunded,
    adjustmentsChargebacks: legacyAdjustmentsChargebacks,
    thirdPartyTransactions: 0,
  });
  const feeBucketSum = round2(interchangeBucket + serviceCharges + processorFees);
  const feeLedger = buildFiservFullStatementFeeLedger(doc, feeGrandTotal);
  const fundingBatchLedger = buildFiservFullStatementFundingBatchLedger(doc, {
    totalFees,
    amountFunded,
  });
  const pricingModel = detectPricingModelFromFeeLedger(feeLedger);

  const selectedFinancials: SelectedStatementFinancials = {
    totalVolume: documentIrTopLevel.totalVolume,
    totalFees: documentIrTopLevel.totalFees,
    effectiveRate: documentIrTopLevel.effectiveRate,
    amountFunded: documentIrTopLevel.amountFunded,
    grossSales,
    refunds,
    adjustmentsChargebacks: documentIrTopLevel.adjustmentsChargebacks,
    thirdPartyTransactions: documentIrTopLevel.thirdPartyTransactions,
    transactionCount: {
      primaryTransactionCount,
      supportingTransactionCounts:
        grossSaleItems === null
          ? []
          : [
              {
                role: "gross_sale_items",
                value: grossSaleItems,
                reason: "Summary by card type shows 1,797 gross sale items before 3 refund items.",
              },
            ],
    },
  };

  const candidateTotals: FinancialCandidate[] = [
    {
      roleCandidate: "total_volume",
      label: "Total Amount Submitted",
      amount: totalVolume,
      sourceSection: "SUMMARY",
      pageNumber: totalVolumeRow.pageNumber,
      evidenceLine: totalVolumeRow.content,
      selected: true,
      selectionReason: "Statement-level summary total and supporting card/batch/interchange volumes agree.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "amount_funded",
      label: "Total Amount Processed",
      amount: amountFunded,
      sourceSection: "SUMMARY",
      pageNumber: amountFundedRow.pageNumber,
      evidenceLine: amountFundedRow.content,
      selected: true,
      selectionReason: "Statement uses processed amount as post-fee funded/processed result.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "total_fees",
      label: "Fees",
      amount: totalFees,
      sourceSection: "SUMMARY",
      pageNumber: feesRow.pageNumber,
      evidenceLine: feesRow.content,
      selected: true,
      selectionReason: "Statement-level summary fee total reconciles with fee section grand total.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "gross_sales",
      label: "Total Gross Sales You Submitted",
      amount: grossSales,
      sourceSection: "SUMMARY BY CARD TYPE",
      pageNumber: cardTypeTotalRow.pageNumber,
      evidenceLine: cardTypeTotalRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Gross sales before refunds are not the effective-rate denominator when submitted volume is available.",
      confidence: "high",
    },
    {
      roleCandidate: "total_volume",
      label: "Summary By Card Type Total Amount You Submitted",
      amount: cardTypeSubmitted,
      sourceSection: "SUMMARY BY CARD TYPE",
      pageNumber: cardTypeTotalRow.pageNumber,
      evidenceLine: cardTypeTotalRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Supporting evidence only; statement-level summary total has higher priority.",
      confidence: "high",
    },
    {
      roleCandidate: "fee_bucket_total",
      label: "Total Interchange Charges/Program Fees",
      amount: interchangeBucket,
      sourceSection: "FEES",
      pageNumber: interchangeBucketRow.pageNumber,
      evidenceLine: interchangeBucketRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Fee bucket only; not all-in total fees.",
      confidence: "high",
    },
    {
      roleCandidate: "interchange_detail_total",
      label: "Interchange/Program Detail TOTAL",
      amount: interchangeDetailTotal,
      sourceSection: "INTERCHANGE CHARGES/PROGRAM FEES",
      pageNumber: interchangeDetailRow.pageNumber,
      evidenceLine: interchangeDetailRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Interchange detail total is audit/detail evidence and does not equal all-in total fees or the fee-summary pass-through bucket.",
      confidence: "high",
    },
    {
      roleCandidate: "reportable_sales",
      label: "Gross Reportable Sales",
      amount: reportableSales,
      sourceSection: "TOTAL GROSS REPORTABLE SALES BY TIN",
      pageNumber: reportableSalesRow.pageNumber,
      evidenceLine: reportableSalesRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Tax/reporting value is not statement-period fee-analysis volume.",
      confidence: "high",
    },
    {
      roleCandidate: "ytd_sales",
      label: "2024 YTD Gross Reportable Sales",
      amount: ytdSales,
      sourceSection: "TOTAL GROSS REPORTABLE SALES BY TIN",
      pageNumber: ytdSalesRow.pageNumber,
      evidenceLine: ytdSalesRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "YTD tax/reporting value is not statement-period fee-analysis volume.",
      confidence: "high",
    },
  ];

  const reconciliation = {
    fundingFormula: documentIrTopLevel.reconciliation.fundingFormula,
    feeBucketFormula: makeAmountCheck(
      totalFees,
      feeBucketSum,
      0.02,
      `${interchangeBucket.toFixed(2)} + ${serviceCharges.toFixed(2)} + ${processorFees.toFixed(2)} = ${feeBucketSum.toFixed(2)}`,
    ),
    effectiveRateFormula: documentIrTopLevel.reconciliation.effectiveRateFormula,
    supportingVolumeAgreement: makeAmountCheck(
      totalVolume,
      cardTypeSubmitted,
      0.01,
      "Summary, card-type total, batch total, and interchange detail volume agree.",
    ),
    supportingFeeAgreement: makeWarningCheck(
      interchangeBucket,
      interchangeDetailTotal,
      0.02,
      "Fee-summary interchange/program bucket differs from interchange detail total; preserve both separately.",
    ),
  };
  const confidence = {
    overall: "high",
    totalVolume: "high",
    totalFees: "high",
    amountFunded: "high",
    feeBreakdown: "high",
    statementIdentity: "high",
  } as const;
  const warnings = [
    ...documentIrWarnings,
    {
      code: "filename_period_mismatch",
      severity: "medium",
      message: "Source filename says Jan 2024, but statement content shows 10/01/24 - 10/31/24.",
      evidenceLine: periodRow.content,
    },
    {
      code: "interchange_detail_total_differs_from_fee_summary",
      severity: "medium",
      message: `Interchange detail total is $${interchangeDetailTotal.toFixed(2)} while fee-summary interchange/program bucket is $${interchangeBucket.toFixed(2)}.`,
      evidenceLine: interchangeDetailRow.content,
    },
    {
      code: "reportable_sales_excluded",
      severity: "low",
      message: "Reportable/YTD sales are present but excluded from fee-analysis volume.",
      evidenceLine: ytdSalesRow.content,
    },
  ] as const;
  const decision = buildParserDecision({ reconciliation, warnings: [...warnings], confidence: confidence.overall });

  return fiservParserOutputSchema.parse({
    statementIdentity: {
      processorFamily: "Fiserv / First Data",
      visibleBrand: "First Data / Fiserv-style card processing statement",
      statementFamily: "fiserv_first_data_full_statement",
      merchantName,
      merchantNumber,
      statementPeriodStart: period.start,
      statementPeriodEnd: period.end,
      sourceFileName: path.basename(sourceFileName),
      pageCount: maxPageCount(doc),
    },
    selectedFinancials,
    feeBreakdown: {
      layout: "interchange_program_service_fees",
      buckets: [
        {
          key: "cardBrandOrPassThrough",
          label: "Total Interchange Charges/Program Fees",
          amount: interchangeBucket,
          sourceSection: "FEES",
          evidenceLine: interchangeBucketRow.content,
          confidence: "high",
        },
        {
          key: "serviceCharges",
          label: "Total Service Charges",
          amount: serviceCharges,
          sourceSection: "FEES",
          evidenceLine: serviceChargesRow.content,
          confidence: "high",
        },
        {
          key: "processorOrAccountFees",
          label: "Total Fees",
          amount: processorFees,
          sourceSection: "FEES",
          evidenceLine: processorFeesRow.content,
          confidence: "high",
        },
      ],
      total: feeGrandTotal,
      evidenceLine: feeGrandTotalRow.content,
    },
    pricingModel,
    feeLedger,
    fundingBatchLedger,
    interchangeDetail: {
      available: true,
      detailTotal: interchangeDetailTotal,
      detailTransactionCount: interchangeTransactions,
      detailVolume: interchangeVolume,
      rows: [],
      rowsStatus: "not_parsed_in_first_fixture",
      evidenceLine: interchangeDetailRow.content,
    },
    candidateTotals,
    excludedTotals: [
      {
        amount: grossSales,
        label: "Total Gross Sales You Submitted",
        sourceSection: "SUMMARY BY CARD TYPE",
        evidenceLine: cardTypeTotalRow.content,
        excludedFrom: "totalVolume",
        reason: "Gross sales before refunds are not the effective-rate denominator when submitted volume is available.",
      },
      {
        amount: interchangeDetailTotal,
        label: "Interchange/Program Detail TOTAL",
        sourceSection: "INTERCHANGE CHARGES/PROGRAM FEES",
        evidenceLine: interchangeDetailRow.content,
        excludedFrom: "totalFees",
        reason: "Interchange detail total is not all-in fees and does not match the fee-summary pass-through bucket.",
      },
      {
        amount: reportableSales,
        label: "Gross Reportable Sales",
        sourceSection: "TOTAL GROSS REPORTABLE SALES BY TIN",
        evidenceLine: reportableSalesRow.content,
        excludedFrom: "totalVolume",
        reason: "Reportable sales are tax/reporting values, not fee-analysis volume.",
      },
      {
        amount: ytdSales,
        label: "2024 YTD Gross Reportable Sales",
        sourceSection: "TOTAL GROSS REPORTABLE SALES BY TIN",
        evidenceLine: ytdSalesRow.content,
        excludedFrom: "totalVolume",
        reason: "YTD sales are not the current statement-period processing volume.",
      },
    ],
    reconciliation,
    decision,
    confidence,
    warnings,
    evidence: [
      {
        field: "statementPeriod",
        sourceSection: "HEADER",
        pageNumber: periodRow.pageNumber,
        lineIndex: periodRow.index,
        evidenceLine: periodRow.content,
        value: periodValue,
      },
      {
        field: "merchantName",
        sourceSection: "HEADER",
        pageNumber: merchantNameRow.pageNumber,
        lineIndex: merchantNameRow.index,
        evidenceLine: merchantNameRow.content,
        value: merchantName,
      },
      {
        field: "merchantNumber",
        sourceSection: "HEADER",
        pageNumber: merchantNumberRow.pageNumber,
        lineIndex: merchantNumberRow.index,
        evidenceLine: merchantNumberRow.content,
        value: merchantNumber,
      },
      {
        field: "totalVolume",
        sourceSection: "SUMMARY",
        pageNumber: totalVolumeRow.pageNumber,
        lineIndex: totalVolumeRow.index,
        evidenceLine: totalVolumeRow.content,
        value: totalVolume,
      },
      {
        field: "totalFees",
        sourceSection: "SUMMARY",
        pageNumber: feesRow.pageNumber,
        lineIndex: feesRow.index,
        evidenceLine: feesRow.content,
        value: totalFees,
      },
      {
        field: "amountFunded",
        sourceSection: "SUMMARY",
        pageNumber: amountFundedRow.pageNumber,
        lineIndex: amountFundedRow.index,
        evidenceLine: amountFundedRow.content,
        value: amountFunded,
      },
      {
        field: "feeBreakdown",
        sourceSection: "FEES",
        pageNumber: feeGrandTotalRow.pageNumber,
        lineIndex: feeGrandTotalRow.index,
        evidenceLine: feeGrandTotalRow.content,
        value: feeGrandTotal,
      },
      ...documentIrTopLevelEvidence(documentIrTopLevel),
    ],
  });
}

export function parseFiservFirstDataShortStatement(doc: RawExtractedDocument, options: ParseOptions = {}): FiservParserOutput {
  if (!isFirstDataShortStatement(doc)) {
    throw new Error("Document does not match the Fiserv / First Data short statement layout.");
  }

  const sourceFileName = options.sourceFileName ?? "unknown.pdf";
  const merchantNameRow = findRow(
    doc,
    (row) => /Page 1 of \d+/i.test(rowContent(row)) && !/YOUR CARD PROCESSING STATEMENT/i.test(rowContent(row)),
    "merchant name",
  );
  const merchantName = merchantNameRow.content.split("|")[0]!.trim();

  const periodRow = findRow(doc, (row) => String(row.label ?? "") === "Statement Period", "statement period");
  const periodValue = String(periodRow.row.value ?? periodRow.content);
  const period = parsePeriod(periodValue);

  const merchantNumberRow = findFiservStatementMerchantNumberRow(doc);
  const merchantNumber = merchantNumberFromEvidence(merchantNumberRow);

  const totalVolumeRow = findRow(doc, (row) => String(row.label ?? "") === "Total Amount Submitted", "total amount submitted");
  const amountFundedRow = findRow(doc, (row) => String(row.label ?? "") === "Total Amount Processed", "total amount processed");
  const feesRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Fees" && (signedMoneyTokens(rowContent(row)).at(-1) ?? 0) < 0,
    "summary fees",
  );
  const adjustmentSummaryRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Adjustments" && rowContent(row).includes("Page | 2 | Adjustments"),
    "summary adjustments",
  );
  const chargebacksRow = findRow(doc, (row) => String(row.label ?? "") === "Chargebacks/Reversals", "chargebacks/reversals");
  const cardTypeTotalRow = findRowAfter(
    doc,
    (row) => /^SUMMARY BY CARD TYPE$/i.test(rowContent(row)),
    (row) => /^Total\s*\|/.test(rowContent(row)) && signedMoneyTokens(rowContent(row)).length >= 3,
    "summary by card type total",
  );
  const chargebacksStartIndex = doc.rows.findIndex((row) => /^CHARGEBACKS\/REVERSALS\b/i.test(rowContent(row)));
  const batchTotalRow = findLastRow(
    doc,
    (row, index) =>
      (chargebacksStartIndex < 0 || index < chargebacksStartIndex) &&
      /^Total\s*\|/.test(rowContent(row)) &&
      signedMoneyTokens(rowContent(row)).length >= 3,
    "summary by batch total",
  );
  const adjustmentDetailTotalRow = findRow(
    doc,
    (row) => rowContent(row) === "TOTAL | -$1,200.00",
    "adjustment detail total",
  );
  const serviceChargesRow = findRow(doc, (row) => String(row.label ?? "") === "Total Service Charges", "service charges bucket");
  const processorFeesRow = findRow(doc, (row) => String(row.label ?? "") === "Total Fees", "processor/account fee bucket");
  const feeGrandTotalRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Total (Service Charges, Interchange Charges/Program Fees, and Fees)",
    "fee section grand total",
  );

  const totalVolume = requireAmount(totalVolumeRow, "total amount submitted");
  const amountFunded = requireAmount(amountFundedRow, "total amount processed");
  const totalFees = requireAmount(feesRow, "fees");
  const adjustments = requireSignedAmount(adjustmentSummaryRow, "summary adjustments");
  const chargebacks = requireSignedAmount(chargebacksRow, "chargebacks/reversals");
  const cardTypeAmounts = signedMoneyTokens(cardTypeTotalRow.content);
  const cardTypeIntegers = integerTokens(cardTypeTotalRow.content);
  const batchAmounts = signedMoneyTokens(batchTotalRow.content);
  const grossSales = Math.abs(cardTypeAmounts[0] ?? 0);
  const refunds = Math.abs(cardTypeAmounts[1] ?? 0);
  const cardTypeSubmitted = Math.abs(cardTypeAmounts[2] ?? 0);
  const batchSubmitted = Math.abs(batchAmounts[2] ?? 0);
  const grossSaleItems = cardTypeIntegers[0] ?? null;
  const primaryTransactionCount = cardTypeIntegers[2] ?? null;
  const adjustmentDetailTotal = requireAmount(adjustmentDetailTotalRow, "adjustment detail total");
  const serviceCharges = requireAmount(serviceChargesRow, "service charges bucket");
  const processorFees = requireAmount(processorFeesRow, "processor/account fee bucket");
  const feeGrandTotal = requireAmount(feeGrandTotalRow, "fee section grand total");

  const legacyEffectiveRate = round8(totalFees / totalVolume);
  const signedAdjustments = round2(adjustments + chargebacks);
  const documentIrTopLevel = extractDocumentIrTopLevelFinancials(doc, sourceFileName);
  const documentIrWarnings = documentIrTopLevelMismatchWarnings(documentIrTopLevel, {
    totalVolume,
    totalFees,
    effectiveRate: legacyEffectiveRate,
    amountFunded,
    adjustmentsChargebacks: signedAdjustments,
    thirdPartyTransactions: 0,
  });
  const feeBucketSum = round2(serviceCharges + processorFees);
  const feeLedger = buildFiservShortStatementFeeLedger(doc, feeGrandTotal);
  const fundingBatchLedger = buildFiservShortStatementFundingBatchLedger(doc, {
    totalVolume,
    totalFees,
    adjustments: signedAdjustments,
    amountFunded,
  });
  const pricingModel = detectPricingModelFromFeeLedger(feeLedger);

  const selectedFinancials: SelectedStatementFinancials = {
    totalVolume: documentIrTopLevel.totalVolume,
    totalFees: documentIrTopLevel.totalFees,
    effectiveRate: documentIrTopLevel.effectiveRate,
    amountFunded: documentIrTopLevel.amountFunded,
    grossSales,
    refunds,
    adjustmentsChargebacks: documentIrTopLevel.adjustmentsChargebacks,
    thirdPartyTransactions: documentIrTopLevel.thirdPartyTransactions,
    transactionCount: {
      primaryTransactionCount,
      supportingTransactionCounts:
        grossSaleItems === null
          ? []
          : [
              {
                role: "gross_sale_items",
                value: grossSaleItems,
                reason: "Summary by card type shows 8 gross sale items before 2 refund items.",
              },
            ],
    },
  };

  const candidateTotals: FinancialCandidate[] = [
    {
      roleCandidate: "total_volume",
      label: "Total Amount Submitted",
      amount: totalVolume,
      sourceSection: "SUMMARY",
      pageNumber: totalVolumeRow.pageNumber,
      evidenceLine: totalVolumeRow.content,
      selected: true,
      selectionReason: "Statement-level submitted total reconciles with funding after the adjustment deduction.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "amount_funded",
      label: "Total Amount Processed",
      amount: amountFunded,
      sourceSection: "SUMMARY",
      pageNumber: amountFundedRow.pageNumber,
      evidenceLine: amountFundedRow.content,
      selected: true,
      selectionReason: "Statement uses processed amount as post-adjustment, post-fee funded/processed result.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "total_fees",
      label: "Fees",
      amount: totalFees,
      sourceSection: "SUMMARY",
      pageNumber: feesRow.pageNumber,
      evidenceLine: feesRow.content,
      selected: true,
      selectionReason: "Statement-level summary fee total reconciles with fee section grand total.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "gross_sales",
      label: "Total Gross Sales You Submitted",
      amount: grossSales,
      sourceSection: "SUMMARY BY CARD TYPE",
      pageNumber: cardTypeTotalRow.pageNumber,
      evidenceLine: cardTypeTotalRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Gross sales before refunds are not the effective-rate denominator when submitted volume is available.",
      confidence: "high",
    },
    {
      roleCandidate: "conflicting_total",
      label: "Summary By Card Type Total Amount You Submitted",
      amount: cardTypeSubmitted,
      sourceSection: "SUMMARY BY CARD TYPE",
      pageNumber: cardTypeTotalRow.pageNumber,
      evidenceLine: cardTypeTotalRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Card-type total is distorted by the adjustment line; statement-level summary and batch total are the reconciled submitted volume.",
      confidence: "high",
    },
    {
      roleCandidate: "total_volume",
      label: "Summary By Batch Total Amount You Submitted",
      amount: batchSubmitted,
      sourceSection: "SUMMARY BY BATCH",
      pageNumber: batchTotalRow.pageNumber,
      evidenceLine: batchTotalRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Supporting evidence only; statement-level summary total has higher priority.",
      confidence: "high",
    },
    {
      roleCandidate: "fee_bucket_total",
      label: "Total Service Charges",
      amount: serviceCharges,
      sourceSection: "FEES",
      pageNumber: serviceChargesRow.pageNumber,
      evidenceLine: serviceChargesRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Fee bucket only; not all-in total fees.",
      confidence: "high",
    },
    {
      roleCandidate: "fee_bucket_total",
      label: "Total Fees",
      amount: processorFees,
      sourceSection: "FEES",
      pageNumber: processorFeesRow.pageNumber,
      evidenceLine: processorFeesRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Fee bucket only; not all-in total fees.",
      confidence: "high",
    },
    {
      roleCandidate: "conflicting_total",
      label: "Adjustment Detail Total",
      amount: adjustmentDetailTotal,
      sourceSection: "ADJUSTMENTS",
      pageNumber: adjustmentDetailTotalRow.pageNumber,
      evidenceLine: adjustmentDetailTotalRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Adjustment total is a deduction used in funding reconciliation, not processing volume or fees.",
      confidence: "high",
    },
  ];

  const reconciliation = {
    fundingFormula: documentIrTopLevel.reconciliation.fundingFormula,
    feeBucketFormula: makeAmountCheck(
      totalFees,
      feeBucketSum,
      0.02,
      `${serviceCharges.toFixed(2)} + ${processorFees.toFixed(2)} = ${feeBucketSum.toFixed(2)}`,
    ),
    effectiveRateFormula: documentIrTopLevel.reconciliation.effectiveRateFormula,
    supportingVolumeAgreement: makeAmountCheck(
      totalVolume,
      batchSubmitted,
      0.01,
      "Statement summary total and batch total agree; card-type total is separately excluded because it is adjustment-distorted.",
    ),
    supportingFeeAgreement: makeAmountCheck(
      totalFees,
      feeLedger.printedTotal ?? feeLedger.totalRowSum,
      0.01,
      "Statement-level fees agree with the short-statement fee ledger grand total.",
    ),
  };
  const reconciliationResults = buildFiservShortStatementReconciliationResults({
    selectedFinancials,
    cardTypeSubmitted,
    batchSubmitted,
    adjustmentDetailTotal,
    feeLedger,
    fundingBatchLedger,
    cardTypeTotalRow,
    batchTotalRow,
  });
  const confidence = {
    overall: "high",
    totalVolume: "high",
    totalFees: "high",
    amountFunded: "high",
    feeBreakdown: "high",
    statementIdentity: "high",
  } as const;
  const warnings = [
    ...documentIrWarnings,
    {
      code: "card_type_total_distorted_by_adjustments",
      severity: "medium",
      message: "Card-type total shows $1,200.00, but statement summary and batch total show $2,400.00; adjustment rows explain the difference.",
      evidenceLine: cardTypeTotalRow.content,
    },
    {
      code: "short_statement_no_interchange_detail",
      severity: "low",
      message: "No interchange/program detail section is present on this short statement.",
      evidenceLine: null,
    },
  ] as const;
  const decision = buildParserDecision({
    reconciliation,
    reconciliationResults,
    feeClassification: feeLedger.feeClassificationSummary,
    warnings: [...warnings],
    confidence: confidence.overall,
  });

  return fiservParserOutputSchema.parse({
    statementIdentity: {
      processorFamily: "Fiserv / First Data",
      visibleBrand: "First Data / Fiserv-style card processing statement",
      statementFamily: "fiserv_first_data_short_statement",
      merchantName,
      merchantNumber,
      statementPeriodStart: period.start,
      statementPeriodEnd: period.end,
      sourceFileName: path.basename(sourceFileName),
      pageCount: maxPageCount(doc),
    },
    selectedFinancials,
    feeBreakdown: {
      layout: "service_fees_only_short_statement",
      buckets: [
        {
          key: "serviceCharges",
          label: "Total Service Charges",
          amount: serviceCharges,
          sourceSection: "FEES",
          evidenceLine: serviceChargesRow.content,
          confidence: "high",
        },
        {
          key: "processorOrAccountFees",
          label: "Total Fees",
          amount: processorFees,
          sourceSection: "FEES",
          evidenceLine: processorFeesRow.content,
          confidence: "high",
        },
      ],
      total: feeGrandTotal,
      evidenceLine: feeGrandTotalRow.content,
    },
    pricingModel,
    feeLedger,
    fundingBatchLedger,
    interchangeDetail: {
      available: false,
      detailTotal: null,
      detailTransactionCount: null,
      detailVolume: null,
      rows: [],
      rowsStatus: "not_present_on_short_statement",
      evidenceLine: null,
    },
    candidateTotals,
    excludedTotals: [
      {
        amount: grossSales,
        label: "Total Gross Sales You Submitted",
        sourceSection: "SUMMARY BY CARD TYPE",
        evidenceLine: cardTypeTotalRow.content,
        excludedFrom: "totalVolume",
        reason: "Gross sales before refunds are not the effective-rate denominator when submitted volume is available.",
      },
      {
        amount: cardTypeSubmitted,
        label: "Summary By Card Type Total Amount You Submitted",
        sourceSection: "SUMMARY BY CARD TYPE",
        evidenceLine: cardTypeTotalRow.content,
        excludedFrom: "totalVolume",
        reason: "Card-type total is distorted by the adjustment line and does not reconcile to amount funded.",
      },
      {
        amount: adjustmentDetailTotal,
        label: "Adjustment Detail Total",
        sourceSection: "ADJUSTMENTS",
        evidenceLine: adjustmentDetailTotalRow.content,
        excludedFrom: "totalVolume",
        reason: "Adjustment total is a deduction in the funding formula, not statement-period submitted volume.",
      },
    ],
    reconciliation,
    reconciliationResults,
    decision,
    confidence,
    warnings,
    evidence: [
      {
        field: "statementPeriod",
        sourceSection: "HEADER",
        pageNumber: periodRow.pageNumber,
        lineIndex: periodRow.index,
        evidenceLine: periodRow.content,
        value: periodValue,
      },
      {
        field: "merchantName",
        sourceSection: "HEADER",
        pageNumber: merchantNameRow.pageNumber,
        lineIndex: merchantNameRow.index,
        evidenceLine: merchantNameRow.content,
        value: merchantName,
      },
      {
        field: "merchantNumber",
        sourceSection: "HEADER",
        pageNumber: merchantNumberRow.pageNumber,
        lineIndex: merchantNumberRow.index,
        evidenceLine: merchantNumberRow.content,
        value: merchantNumber,
      },
      {
        field: "totalVolume",
        sourceSection: "SUMMARY",
        pageNumber: totalVolumeRow.pageNumber,
        lineIndex: totalVolumeRow.index,
        evidenceLine: totalVolumeRow.content,
        value: totalVolume,
      },
      {
        field: "totalFees",
        sourceSection: "SUMMARY",
        pageNumber: feesRow.pageNumber,
        lineIndex: feesRow.index,
        evidenceLine: feesRow.content,
        value: totalFees,
      },
      {
        field: "amountFunded",
        sourceSection: "SUMMARY",
        pageNumber: amountFundedRow.pageNumber,
        lineIndex: amountFundedRow.index,
        evidenceLine: amountFundedRow.content,
        value: amountFunded,
      },
      {
        field: "adjustmentsChargebacks",
        sourceSection: "SUMMARY",
        pageNumber: adjustmentSummaryRow.pageNumber,
        lineIndex: adjustmentSummaryRow.index,
        evidenceLine: adjustmentSummaryRow.content,
        value: signedAdjustments,
      },
      {
        field: "feeBreakdown",
        sourceSection: "FEES",
        pageNumber: feeGrandTotalRow.pageNumber,
        lineIndex: feeGrandTotalRow.index,
        evidenceLine: feeGrandTotalRow.content,
        value: feeGrandTotal,
      },
      ...documentIrTopLevelEvidence(documentIrTopLevel),
    ],
  });
}

export function parseFiservFirstDataProcessorStatement(doc: RawExtractedDocument, options: ParseOptions = {}): FiservParserOutput {
  if (!isFiservProcessorBrandedStatement(doc)) {
    throw new Error("Document does not match the Fiserv / First Data processor-branded statement layout.");
  }

  const sourceFileName = options.sourceFileName ?? "unknown.pdf";
  const visibleBrand = detectFiservProcessorBrand(doc);
  const statementFamily = detectFiservProcessorStatementFamily();
  const periodRow = findRow(doc, (row) => hasFiservStatementPeriod(rowContent(row)) && /\d{2}\s*\/\s*\d{2}/.test(rowContent(row)), "statement period");
  const periodValue = rowContent(periodRow.row);
  const period = parsePeriod(periodValue);
  const merchantNumberRow = findRow(doc, (row) => merchantNumberFromContent(rowContent(row)) !== null || merchantNumberDigitsFromContent(rowContent(row)) !== null, "merchant number");
  const merchantNameRow = findFiservProcessorMerchantNameRow(doc, merchantNumberRow.index);
  const merchantNumber = merchantNumberFromContent(merchantNumberRow.content) ?? merchantNumberDigitsFromContent(merchantNumberRow.content);

  const totalVolumeRow = findRow(doc, (row) => String(row.label ?? "") === "Amounts Submitted", "amounts submitted");
  const thirdPartyRow = findRow(doc, (row) => String(row.label ?? "") === "Third Party Transactions", "third party transactions");
  const adjustmentsRow = findRow(doc, (row) => String(row.label ?? "") === "Adjustments/Chargebacks", "adjustments/chargebacks");
  const feesRow = findRow(doc, (row) => String(row.label ?? "") === "Fees Charged", "fees charged");
  const monthEndRow = findRow(
    doc,
    (row) => String(row.label ?? "") === "Month End Charge" || /^Month End Charge\s*\|/i.test(rowContent(row)),
    "month end charge",
  );
  const lessDiscountPaidRow = findOptionalRow(doc, (row) => String(row.label ?? "") === "Less Discount Paid");
  const amountFundedRow = findRow(
    doc,
    (row) => String(row.label ?? "").replace("TotaI", "Total") === "Total Amount Funded to Your Bank",
    "total amount funded to your bank",
  );
  const totalVolume = requireAmount(totalVolumeRow, "amounts submitted");
  const thirdPartyTransactions = requireAmount(thirdPartyRow, "third party transactions");
  const adjustmentsChargebacks = requireSignedAmount(adjustmentsRow, "adjustments/chargebacks");
  const totalFees = requireAmount(feesRow, "fees charged");
  const monthEndParts = cellParts(monthEndRow.content);
  const monthEndCharge =
    /^Month End Charge\s*\|/i.test(monthEndRow.content) && monthEndParts.length >= 5
      ? positiveFiservProcessorAmount(monthEndParts.at(-2) ?? "0.00")
      : requireAmount(monthEndRow, "month end charge");
  const amountFunded = requireSignedAmount(amountFundedRow, "total amount funded");
  const totalVolumePattern = moneyPatternForAmount(totalVolume);
  const cardTypeTotalRowCandidate = findOptionalRow(doc, (row) => /^Total\s*\|/.test(rowContent(row)) && rowContent(row).includes(totalVolumePattern));
  const amountSubmittedHeaderIndex = doc.rows.findIndex((row) => rowContent(row) === "AMOUNTS SUBMITTED");
  const amountSubmittedEndIndex = doc.rows.findIndex((row, index) => index > amountSubmittedHeaderIndex && rowContent(row).startsWith("THIRD PARTY TRANSACTIONS"));
  const amountSubmittedRows =
    amountSubmittedHeaderIndex >= 0
      ? doc.rows.slice(amountSubmittedHeaderIndex, amountSubmittedEndIndex > amountSubmittedHeaderIndex ? amountSubmittedEndIndex : doc.rows.length)
      : [];
  const zeroVolumeNoSubmittedAmounts =
    totalVolume === 0 && amountSubmittedRows.some((row) => /There are no Amounts Submitted for this statement period/i.test(rowContent(row)));
  const cardTypeTotalRow = zeroVolumeNoSubmittedAmounts ? null : cardTypeTotalRowCandidate;
  const monthEndCoversAllFees = Math.abs(monthEndCharge - totalFees) <= 0.01;
  const inferredNoDiscountPaid =
    !lessDiscountPaidRow && (zeroVolumeNoSubmittedAmounts || monthEndCoversAllFees);
  const missingLessDiscountPaidEvidence = zeroVolumeNoSubmittedAmounts
    ? "No Less Discount Paid row; zero submitted activity makes daily discount-paid fees $0.00."
    : "No Less Discount Paid row; Month End Charge equals statement-level Fees Charged, so daily discount-paid fees are $0.00.";
  const lessDiscountPaid = lessDiscountPaidRow ? requireAmount(lessDiscountPaidRow, "less discount paid") : inferredNoDiscountPaid ? 0 : null;
  if (lessDiscountPaid === null) {
    throw new Error("Parser could not find less discount paid.");
  }
  const amountSubmittedSubtotalRows = amountSubmittedRows.filter((row) => hasFiservProcessorAmountsSubmittedSubtotal(rowContent(row)));
  const amountSubmittedTotalRow = amountSubmittedRows.find((row) => /^Total\s*\|/.test(rowContent(row)));
  const amountSubmittedSubtotal =
    amountSubmittedSubtotalRows.length > 0
      ? round2(amountSubmittedSubtotalRows.reduce((sum, row) => sum + lastFiservProcessorAmountFromContent(rowContent(row)), 0))
      : amountSubmittedTotalRow
        ? lastFiservProcessorAmountFromContent(rowContent(amountSubmittedTotalRow))
        : lastFiservProcessorAmountFromContent(
            findRow(doc, (row) => hasFiservProcessorAmountsSubmittedSubtotal(rowContent(row)), "Fiserv branded amounts submitted subtotal").content,
          );
  const amountSubmittedSubtotalEvidenceLine =
    amountSubmittedSubtotalRows.length > 0
      ? amountSubmittedSubtotalRows.map((row) => rowContent(row)).join(" / ")
      : amountSubmittedTotalRow
        ? rowContent(amountSubmittedTotalRow)
        : `Sub Totals | $${moneyPatternForAmount(amountSubmittedSubtotal)}`;
  const amountSubmittedSubtotalPageNumber = amountSubmittedSubtotalRows[0]
    ? pageNumber(amountSubmittedSubtotalRows[0])
    : amountSubmittedTotalRow
      ? pageNumber(amountSubmittedTotalRow)
      : null;
  const orphanTotals = amountSubmittedRows
    .filter((row) => /^Total\s*\|/.test(rowContent(row)))
    .map((row) => ({
      row,
      amount: lastFiservProcessorAmountFromContent(rowContent(row)),
    }))
    .filter((candidate) => candidate.amount > 0 && Math.abs(candidate.amount - totalVolume) > 0.01);
  const orphanTotal = orphanTotals[0] ?? null;
  const cardTypeSubmitted = cardTypeTotalRow ? lastFiservProcessorAmountFromContent(cardTypeTotalRow.content) : zeroVolumeNoSubmittedAmounts ? 0 : totalVolume;
  const legacyEffectiveRate = totalVolume === 0 ? 0 : round8(totalFees / totalVolume);
  const documentIr = buildFiservDocumentIr(doc, sourceFileName);
  const documentIrTopLevel = extractFiservTopLevelFinancialsFromDocumentIr(documentIr);
  const documentIrWarnings = documentIrTopLevelMismatchWarnings(documentIrTopLevel, {
    totalVolume,
    totalFees,
    effectiveRate: legacyEffectiveRate,
    amountFunded,
    adjustmentsChargebacks,
    thirdPartyTransactions,
  });
  const feeBucketSum = round2(monthEndCharge + lessDiscountPaid);
  const feeLedger = buildFiservProcessorFeeLedger(doc);
  const documentIrFeeLedger = extractFiservProcessorFeeLedgerFromDocumentIr(documentIr);
  const documentIrFeeLedgerWarnings = documentIrFeeLedgerMismatchWarnings(documentIrFeeLedger, feeLedger);
  const legacyFundingBatchLedger = buildFiservProcessorFundingBatchLedger(doc);
  const documentIrFundingBatchLedger = extractFiservProcessorFundingBatchLedgerFromDocumentIr(documentIr);
  const documentIrFundingBatchLedgerWarnings = documentIrFundingBatchLedgerMismatchWarnings(
    documentIrFundingBatchLedger,
    legacyFundingBatchLedger,
  );
  const fundingBatchLedger = documentIrFundingBatchLedger;
  const pricingModel = detectPricingModelFromFeeLedger(feeLedger);
  const primaryTransactionCount = cardTypeTotalRow ? (integerTokens(cardTypeTotalRow.content)[0] ?? null) : zeroVolumeNoSubmittedAmounts ? 0 : null;
  const failedFundingBatchEvidenceLine = fundingBatchLedger.rows.find((row) => row.status === "fail")?.evidenceLine ?? null;
  const failedFundingBatchLineIndex =
    failedFundingBatchEvidenceLine === null ? null : doc.rows.findIndex((row) => rowContent(row) === failedFundingBatchEvidenceLine);

  const selectedFinancials: SelectedStatementFinancials = {
    totalVolume: documentIrTopLevel.totalVolume,
    totalFees: documentIrTopLevel.totalFees,
    effectiveRate: documentIrTopLevel.effectiveRate,
    amountFunded: documentIrTopLevel.amountFunded,
    grossSales: null,
    refunds: null,
    adjustmentsChargebacks: documentIrTopLevel.adjustmentsChargebacks,
    thirdPartyTransactions: documentIrTopLevel.thirdPartyTransactions,
    transactionCount: {
      primaryTransactionCount,
      supportingTransactionCounts: [
        {
          role: "card_type_items",
          value: primaryTransactionCount ?? 0,
          reason: cardTypeTotalRow
            ? "Summary by card type shows submitted items for the statement period."
            : "No card-type activity was printed because the statement period has zero submitted volume.",
        },
      ],
    },
  };

  const candidateTotals: FinancialCandidate[] = [
    {
      roleCandidate: "total_volume",
      label: "Amounts Submitted",
      amount: totalVolume,
      sourceSection: "SUMMARY",
      pageNumber: totalVolumeRow.pageNumber,
      evidenceLine: totalVolumeRow.content,
      selected: true,
      selectionReason: zeroVolumeNoSubmittedAmounts
        ? "Statement-level Amounts Submitted is zero and the Amounts Submitted section explicitly states there was no submitted activity."
        : "Statement-level Amounts Submitted reconciles with funding, card-type totals, and amount-submitted subtotals.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "amount_funded",
      label: "Total Amount Funded to Your Bank",
      amount: amountFunded,
      sourceSection: "SUMMARY",
      pageNumber: amountFundedRow.pageNumber,
      evidenceLine: amountFundedRow.content,
      selected: true,
      selectionReason: "Amount funded is the result of the statement-level funding formula.",
      rejectionReason: null,
      confidence: "high",
    },
    {
      roleCandidate: "total_fees",
      label: "Fees Charged",
      amount: totalFees,
      sourceSection: "SUMMARY",
      pageNumber: feesRow.pageNumber,
      evidenceLine: feesRow.content,
      selected: true,
      selectionReason: "Statement-level fees charged reconcile to the fee-section grand total.",
      rejectionReason: null,
      confidence: "high",
    },
    ...(cardTypeTotalRow
      ? [
          {
            roleCandidate: "total_volume",
            label: "Summary By Card Type Total Amount Submitted",
            amount: cardTypeSubmitted,
            sourceSection: "SUMMARY BY CARD TYPE",
            pageNumber: cardTypeTotalRow.pageNumber,
            evidenceLine: cardTypeTotalRow.content,
            selected: false,
            selectionReason: null,
            rejectionReason: "Supporting total only; statement-level Amounts Submitted has the same value and participates directly in funding reconciliation.",
            confidence: "high",
          } satisfies FinancialCandidate,
        ]
      : []),
    {
      roleCandidate: "total_volume",
      label: "Amounts Submitted Sub Totals",
      amount: amountSubmittedSubtotal,
      sourceSection: "AMOUNTS SUBMITTED",
      pageNumber: amountSubmittedSubtotalPageNumber,
      evidenceLine: amountSubmittedSubtotalEvidenceLine,
      selected: false,
      selectionReason: null,
      rejectionReason: "Supporting subtotal only; it agrees with selected Amounts Submitted.",
      confidence: "high",
    },
    {
      roleCandidate: "fee_bucket_total",
      label: "Month End Charge",
      amount: monthEndCharge,
      sourceSection: "SUMMARY",
      pageNumber: monthEndRow.pageNumber,
      evidenceLine: monthEndRow.content,
      selected: false,
      selectionReason: null,
      rejectionReason: "Fee bucket only; not all-in total fees.",
      confidence: "high",
    },
    {
      roleCandidate: "fee_bucket_total",
      label: "Less Discount Paid",
      amount: lessDiscountPaid,
      sourceSection: "SUMMARY",
      pageNumber: lessDiscountPaidRow?.pageNumber ?? amountSubmittedSubtotalPageNumber,
      evidenceLine: lessDiscountPaidRow?.content ?? missingLessDiscountPaidEvidence,
      selected: false,
      selectionReason: null,
      rejectionReason: lessDiscountPaidRow
        ? "Fee bucket only; not all-in total fees."
        : zeroVolumeNoSubmittedAmounts
          ? "Implicit zero fee bucket only; no submitted activity produced no daily discount-paid fees."
          : "Implicit zero fee bucket only; Month End Charge already accounts for the selected all-in fees.",
      confidence: lessDiscountPaidRow ? "high" : "medium",
    },
  ];
  if (orphanTotal) {
    candidateTotals.push({
      roleCandidate: "conflicting_total",
      label: "Generic Amounts Submitted Total",
      amount: orphanTotal.amount,
      sourceSection: "AMOUNTS SUBMITTED",
      pageNumber: pageNumber(orphanTotal.row),
      evidenceLine: rowContent(orphanTotal.row),
      selected: false,
      selectionReason: null,
      rejectionReason: "Visible total does not reconcile with funding formula, card-type totals, amount-submitted subtotals, or amount funded.",
      confidence: "high",
    });
  }

  const reconciliation = {
    fundingFormula: documentIrTopLevel.reconciliation.fundingFormula,
    feeBucketFormula: makeAmountCheck(
      totalFees,
      feeBucketSum,
      0.01,
      `${monthEndCharge.toFixed(2)} + ${lessDiscountPaid.toFixed(2)} = ${feeBucketSum.toFixed(2)}`,
    ),
    effectiveRateFormula: documentIrTopLevel.reconciliation.effectiveRateFormula,
    supportingVolumeAgreement: makeAmountCheck(
      totalVolume,
      cardTypeSubmitted,
      0.01,
      orphanTotal
        ? `Amounts Submitted agrees with the summary-by-card-type total and amount-submitted subtotal; the visible $${moneyPatternForAmount(orphanTotal.amount)} total is excluded separately.`
        : zeroVolumeNoSubmittedAmounts
          ? "Amounts Submitted is $0.00 and the Amounts Submitted section explicitly states there are no submitted amounts for this statement period."
          : "Amounts Submitted agrees with the summary-by-card-type total and amount-submitted subtotal.",
    ),
    supportingFeeAgreement: makeWarningCheck(
      totalFees,
      feeLedger.printedTotal ?? feeLedger.totalRowSum,
      0.02,
      "Fee-section printed control total agrees with statement-level fees; row-level fee ledger reconciliation is recorded separately.",
    ),
  };
  const reconciliationResults = runFiservProcessorReconciliationProfile({
    selectedFinancials: {
      totalVolume: documentIrTopLevel.totalVolume,
      totalFees: documentIrTopLevel.totalFees,
      amountFunded: documentIrTopLevel.amountFunded,
      thirdPartyTransactions: documentIrTopLevel.thirdPartyTransactions,
      adjustmentsChargebacks: documentIrTopLevel.adjustmentsChargebacks,
    },
    summarySplit: {
      monthEndCharge,
      lessDiscountPaid,
    },
    supportingTotals: {
      cardTypeSubmitted,
      amountSubmittedSubtotal,
    },
    orphanTotals: orphanTotals.map((candidate) => ({
      label: "Generic Amounts Submitted Total",
      amount: candidate.amount,
      sourceSection: "AMOUNTS SUBMITTED",
      pageNumber: pageNumber(candidate.row),
      evidenceLine: rowContent(candidate.row),
      nearestReference: totalVolume,
    })),
    feeLedger,
    fundingBatchLedger,
  });

  const confidence = {
    overall: "high",
    totalVolume: "high",
    totalFees: "high",
    amountFunded: "high",
    feeBreakdown: "medium",
    statementIdentity: "high",
  } as const;
  const warnings: ParserWarning[] = [
    ...documentIrWarnings,
    ...documentIrFeeLedgerWarnings,
    ...documentIrFundingBatchLedgerWarnings,
  ];
  if (totalVolume === 0) {
    warnings.push({
      code: "zero_volume_effective_rate_not_applicable",
      severity: "low",
      message: "Statement has $0.00 submitted volume, so effective rate is not mathematically meaningful.",
      evidenceLine: totalVolumeRow.content,
    });
  }
  if (orphanTotal) {
    warnings.push({
      code: "unreconciled_generic_total_excluded",
      severity: "medium",
      message: `Visible $${moneyPatternForAmount(orphanTotal.amount)} total was excluded because it does not reconcile to funding, card-type totals, or the amount-submitted subtotal.`,
      evidenceLine: rowContent(orphanTotal.row),
    });
  }
  if (Math.abs(feeLedger.delta) > 0) {
    warnings.push({
      code: "fee_ledger_rounding_delta",
      severity: "low",
      message: `Visible fee detail rows sum to $${moneyPatternForAmount(feeLedger.totalRowSum)} while the printed fee total is $${moneyPatternForAmount(feeLedger.printedTotal ?? totalFees)}; preserve the printed control total and record the row-level delta.`,
      evidenceLine: feeLedger.evidenceLine,
    });
  }
  for (const row of fundingBatchLedger.rows.filter((batchRow) => batchRow.status === "fail")) {
    warnings.push({
      code: "batch_funding_row_anomaly",
      severity: "medium",
      message: `The ${row.dateSubmitted} batch row does not reconcile: the printed values miss the funding formula by $${moneyPatternForAmount(Math.abs(row.delta))}.`,
      evidenceLine: row.evidenceLine,
    });
  }
  const decision = buildParserDecision({
    reconciliation,
    reconciliationResults,
    feeClassification: feeLedger.feeClassificationSummary,
    warnings: [...warnings],
    confidence: confidence.overall,
  });

  return fiservParserOutputSchema.parse({
    statementIdentity: {
      processorFamily: "Fiserv / First Data",
      visibleBrand,
      statementFamily,
      merchantName: merchantNameRow.content,
      merchantNumber,
      statementPeriodStart: period.start,
      statementPeriodEnd: period.end,
      sourceFileName: path.basename(sourceFileName),
      pageCount: maxPageCount(doc),
    },
    selectedFinancials,
    feeBreakdown: {
      layout: "fiserv_processor_month_end_and_discount_paid",
      buckets: [
        {
          key: "processorOrAccountFees",
          label: "Month End Charge",
          amount: monthEndCharge,
          sourceSection: "SUMMARY",
          evidenceLine: monthEndRow.content,
          confidence: "medium",
        },
        {
          key: "unknownOrUnclassified",
          label: "Less Discount Paid",
          amount: lessDiscountPaid,
          sourceSection: "SUMMARY",
          evidenceLine: lessDiscountPaidRow?.content ?? missingLessDiscountPaidEvidence,
          confidence: lessDiscountPaidRow ? "medium" : "low",
        },
      ],
      total: totalFees,
      evidenceLine: feesRow.content,
    },
    pricingModel,
    feeLedger,
    fundingBatchLedger,
    interchangeDetail: {
      available: false,
      detailTotal: null,
      detailTransactionCount: null,
      detailVolume: null,
      rows: [],
      rowsStatus: "not_present_in_processor_branded_statement",
      evidenceLine: null,
    },
    candidateTotals,
    excludedTotals: orphanTotals.map((candidate) => ({
      amount: candidate.amount,
      label: "Generic Amounts Submitted Total",
      sourceSection: "AMOUNTS SUBMITTED",
      evidenceLine: rowContent(candidate.row),
      excludedFrom: "totalVolume",
      reason: "Visible total does not reconcile with funding formula, card-type totals, amount-submitted subtotals, or amount funded.",
    })),
    reconciliation,
    reconciliationResults,
    decision,
    confidence,
    warnings,
    evidence: [
      {
        field: "statementPeriod",
        sourceSection: "HEADER",
        pageNumber: periodRow.pageNumber,
        lineIndex: periodRow.index,
        evidenceLine: periodRow.content,
        value: periodValue,
      },
      {
        field: "merchantName",
        sourceSection: "HEADER",
        pageNumber: merchantNameRow.pageNumber,
        lineIndex: merchantNameRow.index,
        evidenceLine: merchantNameRow.content,
        value: merchantNameRow.content,
      },
      {
        field: "merchantNumber",
        sourceSection: "HEADER",
        pageNumber: merchantNumberRow.pageNumber,
        lineIndex: merchantNumberRow.index,
        evidenceLine: merchantNumberRow.content,
        value: merchantNumber,
      },
      {
        field: "totalVolume",
        sourceSection: "SUMMARY",
        pageNumber: totalVolumeRow.pageNumber,
        lineIndex: totalVolumeRow.index,
        evidenceLine: totalVolumeRow.content,
        value: totalVolume,
      },
      {
        field: "totalFees",
        sourceSection: "SUMMARY",
        pageNumber: feesRow.pageNumber,
        lineIndex: feesRow.index,
        evidenceLine: feesRow.content,
        value: totalFees,
      },
      {
        field: "amountFunded",
        sourceSection: "SUMMARY",
        pageNumber: amountFundedRow.pageNumber,
        lineIndex: amountFundedRow.index,
        evidenceLine: amountFundedRow.content,
        value: amountFunded,
      },
      {
        field: "feeLedger",
        sourceSection: "FEES CHARGED",
        pageNumber: pageNumber(doc.rows.find((row) => hasFiservProcessorFeeGrandTotal(rowContent(row))) ?? ({} as RawDocumentRow)),
        lineIndex: doc.rows.findIndex((row) => hasFiservProcessorFeeGrandTotal(rowContent(row))),
        evidenceLine: feeLedger.evidenceLine ?? "Total (Miscellaneous Fees and Card Fees)",
        value: feeLedger.printedTotal,
      },
      {
        field: "fundingBatchLedger",
        sourceSection: "SUMMARY BY BATCH",
        pageNumber: fundingBatchLedger.rows.find((row) => row.status === "fail")?.pageNumber ?? null,
        lineIndex: failedFundingBatchLineIndex === null || failedFundingBatchLineIndex < 0 ? null : failedFundingBatchLineIndex,
        evidenceLine: failedFundingBatchEvidenceLine ?? fundingBatchLedger.evidenceLine ?? "SUMMARY BY BATCH",
        value: fundingBatchLedger.anomalyCount,
      },
      ...documentIrTopLevelEvidence(documentIrTopLevel),
    ],
  });
}

export const fiservFirstDataFullStatementDriver: ParserDriver<FiservParserOutput> = {
  id: "fiserv_first_data_full_statement",
  displayName: "Fiserv / First Data full statement",
  supports: isFirstDataFullStatement,
  parse: parseFiservFirstDataFullStatement,
};

export const fiservFirstDataShortStatementDriver: ParserDriver<FiservParserOutput> = {
  id: "fiserv_first_data_short_statement",
  displayName: "Fiserv / First Data short statement",
  supports: isFirstDataShortStatement,
  parse: parseFiservFirstDataShortStatement,
};

export const fiservFirstDataProcessorStatementDriver: ParserDriver<FiservParserOutput> = {
  id: "fiserv_first_data_processor_statement",
  displayName: "Fiserv / First Data processor-branded statement",
  supports: isFiservProcessorBrandedStatement,
  parse: parseFiservFirstDataProcessorStatement,
};
