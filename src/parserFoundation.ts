import type { ParsedDocument } from "./parser.js";
import type { BusinessTypeId } from "./businessTypes.js";

export type RawExtractedDocument = ParsedDocument;
export type RawDocumentRow = ParsedDocument["rows"][number];

export type EvidenceRow = {
  row: RawDocumentRow;
  index: number;
  content: string;
  pageNumber: number | null;
};

export type ParserConfidence = "high" | "medium" | "low" | "needs_review";

export type FinancialCandidateRole =
  | "total_volume"
  | "gross_sales"
  | "amount_funded"
  | "total_fees"
  | "interchange_detail_total"
  | "fee_bucket_total"
  | "reportable_sales"
  | "ytd_sales"
  | "conflicting_total";

export type FinancialCandidate = {
  roleCandidate: FinancialCandidateRole;
  label: string;
  amount: number;
  sourceSection: string;
  pageNumber: number | null;
  evidenceLine: string;
  selected: boolean;
  selectionReason: string | null;
  rejectionReason: string | null;
  confidence: ParserConfidence;
};

export type StatementCandidateSet = {
  totals: FinancialCandidate[];
};

export type SelectedFinancialFacts = {
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  amountFunded: number;
  grossSales: number | null;
  refunds: number | null;
  adjustmentsChargebacks: number | null;
  thirdPartyTransactions: number | null;
};

export type SupportingTransactionCount = {
  role: string;
  value: number;
  reason: string;
};

export type SelectedStatementFinancials = SelectedFinancialFacts & {
  transactionCount: {
    primaryTransactionCount: number | null;
    supportingTransactionCounts: SupportingTransactionCount[];
  };
};

export type ParserDecisionStatus = "accepted" | "accepted_with_warnings" | "needs_review" | "unsupported" | "failed";

export type ParserDecision = {
  status: ParserDecisionStatus;
  reason: string;
  confidence: ParserConfidence;
  reportable: boolean;
  validationState?: ParserValidationState;
};

export type ParserValidationLevel = "validated" | "validated_with_rounding" | "warning" | "failed" | "missing" | "not_evaluated";

export type ParserValidationState = {
  topLevelTotals: ParserValidationLevel;
  feeLedger: ParserValidationLevel;
  batchLedger: ParserValidationLevel;
  feeClassification: ParserValidationLevel;
  orphanTotals: "none" | "present" | "not_evaluated";
  customerFacingTotalsAllowed: boolean;
  feeLedgerAllowed: boolean;
  batchDetailAllowed: boolean;
  feeClassificationAllowed: boolean;
  blockingReasons: string[];
  warningReasons: string[];
};

export type ParserDriverOptions = {
  sourceFileName?: string;
  businessType?: BusinessTypeId | null;
};

export type ParserDriver<TOutput = unknown> = {
  id: string;
  displayName: string;
  supports: (doc: RawExtractedDocument) => boolean;
  parse: (doc: RawExtractedDocument, options?: ParserDriverOptions) => TOutput;
};

export function rowContent(row: RawDocumentRow): string {
  return String(row.content ?? "").trim();
}

export function pageNumber(row: RawDocumentRow): number | null {
  const match = String(row.page ?? "").match(/page-(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function asEvidence(row: RawDocumentRow, index: number): EvidenceRow {
  return {
    row,
    index,
    content: rowContent(row),
    pageNumber: pageNumber(row),
  };
}

export function findRow(
  doc: RawExtractedDocument,
  predicate: (row: RawDocumentRow, index: number) => boolean,
  label: string,
): EvidenceRow {
  const index = doc.rows.findIndex(predicate);
  if (index < 0) {
    throw new Error(`Parser could not find ${label}.`);
  }
  return asEvidence(doc.rows[index]!, index);
}

export function findLastRow(
  doc: RawExtractedDocument,
  predicate: (row: RawDocumentRow, index: number) => boolean,
  label: string,
): EvidenceRow {
  for (let index = doc.rows.length - 1; index >= 0; index -= 1) {
    const row = doc.rows[index]!;
    if (predicate(row, index)) {
      return asEvidence(row, index);
    }
  }
  throw new Error(`Parser could not find ${label}.`);
}

export function maxPageCount(doc: RawExtractedDocument): number {
  return Math.max(1, ...doc.rows.map(pageNumber).filter((page): page is number => page !== null));
}

export function toMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value);
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

export function signedMoneyTokens(content: string): number[] {
  return [...content.matchAll(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+\.\d{2}/g)]
    .map((match) => Number(match[0].replace(/[$,]/g, "")))
    .filter(Number.isFinite);
}

export function integerTokens(content: string): number[] {
  return content
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => /^-?\d{1,3}(?:,\d{3})*$|^-?\d+$/.test(cell))
    .map((cell) => Number(cell.replace(/,/g, "")))
    .filter(Number.isInteger);
}

export function requireAmount(evidence: EvidenceRow, label: string): number {
  const direct = toMoney(evidence.row.value);
  if (direct !== null) return direct;
  const tokens = signedMoneyTokens(evidence.content);
  const last = tokens.at(-1);
  if (last !== undefined) return Math.abs(last);
  throw new Error(`Parser could not read amount for ${label}.`);
}

export function requireSignedAmount(evidence: EvidenceRow, label: string): number {
  const tokens = signedMoneyTokens(evidence.content);
  const last = tokens.at(-1);
  if (last !== undefined) return last;
  const direct = toMoney(evidence.row.value);
  if (direct !== null) return direct;
  throw new Error(`Parser could not read signed amount for ${label}.`);
}
