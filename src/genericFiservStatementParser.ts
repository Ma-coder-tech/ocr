// Generic Fiserv-family fallback parser. This intentionally favors reconciled,
// evidence-backed extraction over layout-specific assumptions.
import path from "node:path";
import { buildFiservFeeAnalysisV2FromRawRows } from "./fiservFeeAnalysis.js";
import { classifyFiservProcessorFeeLedgerRows } from "./fiservProcessorFeeClassification.js";
import { fiservParserOutputSchema, type FiservParserOutput } from "./fiservParserOutputSchema.js";
import { buildParserDecision } from "./parserDecision.js";
import {
  maxPageCount,
  signedMoneyTokens,
  type ParserDriver,
  type RawExtractedDocument,
} from "./parserFoundation.js";
import {
  cleanStatementText,
  extractStatementAnatomy,
  statementCorpus,
  statementLines,
  type StatementLine,
} from "./statementAnatomy.js";
import type { BusinessTypeId } from "./businessTypes.js";
import { extractRepricingEventsFromNoticeLines, type RepricingNoticeLine } from "./repricingNotices.js";
import {
  exactMoneyToleranceBand,
  makeAmountCheck,
  makeNotApplicableCheck,
  makeRateCheck,
  makeReconResult,
  makeWarningCheck,
  round2,
  round8,
  sumMoneyToleranceBand,
} from "./reconciliation.js";

type GenericLine = {
  row: StatementLine["row"];
  index: number;
  content: string;
  normalized: string;
  pageNumber: number | null;
};

type GenericFeeRow = {
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

type GenericFundingBatchRow = {
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
  status: "pass" | "warning" | "fail" | "not_applicable";
  evidenceLine: string;
  pageNumber: number | null;
  notes: string[];
};

type RequiredAmount = {
  label: string;
  amount: number;
  line: GenericLine;
};

const FUNDING_FORMULA = "Amount Submitted - Third Party Transactions + Adjustments + Chargebacks - Fees Charged = Amount Funded";

const NETWORK_HEADINGS = new Map<RegExp, string>([
  [/^MASTERCARD$/i, "MASTERCARD"],
  [/^VISA$/i, "VISA"],
  [/^DISCOVER$/i, "DISCOVER"],
  [/^AMERICAN EXPRESS$/i, "AMERICAN EXPRESS"],
  [/^AMEX ACQ$/i, "AMEX ACQ"],
]);

const SECTION_HEADINGS = [
  "TRANSACTION FEES",
  "FEES CHARGED",
  "DEBIT NETWORK FEES",
  "ACCOUNT FEES",
  "EQUIPMENT",
  "CARD FEES",
  "MISCELLANEOUS FEES",
];

export const genericFiservStatementDriver: ParserDriver<FiservParserOutput> = {
  id: "generic_fiserv_family_statement",
  displayName: "Generic Fiserv-family statement",
  supports: isGenericFiservFamilyStatement,
  parse: parseGenericFiservFamilyStatement,
};

export function isGenericFiservFamilyStatement(doc: RawExtractedDocument): boolean {
  if (doc.sourceType !== "pdf") return false;
  const text = corpus(doc);
  const hasCardProcessingStatement = /\byour card processing statement\b/i.test(text);
  const hasFiservLikeFeeSummary =
    /\btotal amount submitted\b/i.test(text) &&
    /\btotal amount processed\b/i.test(text) &&
    /\btotal \(service charges,\s*interchange charges(?:\/program fees)?,\s*and fees\)/i.test(text);
  const hasFeeRows =
    /\btransaction fees\b/i.test(text) &&
    /\binterchange charges\b/i.test(text) &&
    /\bservice charges\b/i.test(text) &&
    /\btotal transaction fees\b/i.test(text);
  const hasProcessorBrandedSummary =
    /\bfees charged\b/i.test(text) &&
    /\btotal amount funded to your bank\b/i.test(text) &&
    /\btotal \(miscellaneous fees and card fees\)/i.test(text);
  const hasKnownFiservFamilyBrand = /\bbasyspro\.com\b|\bbasys\b|\bfiserv\b|\bfirst data\b|\bclover\b/i.test(text);
  return (hasCardProcessingStatement || hasKnownFiservFamilyBrand) && ((hasFiservLikeFeeSummary && hasFeeRows) || hasProcessorBrandedSummary);
}

export function parseGenericFiservFamilyStatement(
  doc: RawExtractedDocument,
  options: { sourceFileName?: string; businessType?: BusinessTypeId | null } = {},
): FiservParserOutput {
  const sourceFileName = options.sourceFileName ?? "uploaded-statement.pdf";
  const lines = documentLines(doc);
  const anatomy = extractStatementAnatomy(lines);
  const sourceBaseName = path.basename(sourceFileName);
  const merchantName = extractMerchantName(lines) ?? "Unknown merchant";
  const merchantNumber = extractMerchantNumber(lines);
  const period = extractStatementPeriod(lines);
  const visibleBrand = inferVisibleBrand(lines, sourceBaseName);
  const totalVolume = { ...anatomy.totalVolume, label: anatomy.totalVolume.label };
  const totalFees = { ...anatomy.totalFees, label: anatomy.totalFees.label };
  const amountFunded = { ...anatomy.amountFunded, label: anatomy.amountFunded.label };
  const adjustmentsChargebacks = anatomy.adjustmentsChargebacks;
  const thirdPartyTransactions = anatomy.thirdPartyTransactions;
  const feeLedger = buildGenericFeeLedger(lines, {
    statementPeriodStart: period.start,
    processorName: visibleBrand,
    merchantNumber,
  });
  const fundingBatchLedger = buildGenericFundingBatchLedger(lines);
  const primaryTransactionCount = extractPrimaryTransactionCount(lines);
  const effectiveRate = anatomy.effectiveRate;
  const fundingExpected = round2(totalVolume.amount - (thirdPartyTransactions ?? 0) + adjustmentsChargebacks - totalFees.amount);
  const feeBucketExpected = feeLedger.printedTotal ?? feeLedger.totalRowSum;
  const feeBucketFormula = makeWarningCheck(
    totalFees.amount,
    feeBucketExpected,
    0.02,
    `Printed fee total ${totalFees.amount.toFixed(2)} compared to generic fee ledger total ${feeBucketExpected.toFixed(2)}.`,
  );
  const reconciliation = {
    fundingFormula: makeAmountCheck(
      fundingExpected,
      amountFunded.amount,
      0.01,
      `${totalVolume.amount.toFixed(2)} - ${(thirdPartyTransactions ?? 0).toFixed(2)} + ${adjustmentsChargebacks.toFixed(2)} - ${totalFees.amount.toFixed(2)} = ${fundingExpected.toFixed(2)}`,
    ),
    feeBucketFormula,
    effectiveRateFormula:
      totalVolume.amount === 0
        ? makeNotApplicableCheck("Effective rate is not applicable because selected volume is $0.00.")
        : makeRateCheck(
            effectiveRate,
            totalFees.amount / totalVolume.amount,
            0.000001,
            `${totalFees.amount.toFixed(2)} / ${totalVolume.amount.toFixed(2)} = ${effectiveRate.toFixed(8)}`,
          ),
    supportingVolumeAgreement: makeWarningCheck(
      totalVolume.amount,
      optionalCardTypeTotal(lines)?.amount ?? totalVolume.amount,
      0.01,
      "Selected Total Amount Submitted compared with the supporting card-type total when present.",
    ),
    supportingFeeAgreement: makeWarningCheck(
      totalFees.amount,
      feeLedger.printedTotal ?? feeLedger.totalRowSum,
      0.02,
      "Generic fee ledger rows are reconciled to the printed all-in fee total.",
    ),
  };
  const reconciliationResults = [
    makeReconResult({
      identity: "headline:funding_formula",
      stated: amountFunded.amount,
      computed: fundingExpected,
      toleranceBand: exactMoneyToleranceBand(),
      evidence: evidenceFor(amountFunded, "SUMMARY"),
    }),
    makeReconResult({
      identity: "headline:effective_rate_formula",
      stated: effectiveRate,
      computed: totalVolume.amount === 0 ? null : round8(totalFees.amount / totalVolume.amount),
      toleranceBand: 0.000001,
      evidence: evidenceFor(totalFees, "SUMMARY"),
    }),
    makeReconResult({
      identity: "fee_detail:generic_row_sum_eq_printed_total",
      stated: feeLedger.printedTotal,
      computed: feeLedger.totalRowSum,
      toleranceBand: sumMoneyToleranceBand(feeLedger.rows.length, { minimum: 0.02, cap: 0.05 }),
      evidence: {
        section: "FEES",
        pageNumber: feeLedger.evidenceLine ? lineForContent(lines, feeLedger.evidenceLine)?.pageNumber : null,
        sourceText: feeLedger.evidenceLine,
      },
    }),
    makeReconResult({
      identity: "batch_columns:generic_submitted_total",
      stated: fundingBatchLedger.controlSubmittedTotal,
      computed: fundingBatchLedger.submittedTotal,
      toleranceBand: exactMoneyToleranceBand(),
      evidence: {
        section: "FUNDING",
        pageNumber: fundingBatchLedger.evidenceLine ? lineForContent(lines, fundingBatchLedger.evidenceLine)?.pageNumber : null,
        sourceText: fundingBatchLedger.evidenceLine,
      },
    }),
    makeReconResult({
      identity: "batch_columns:generic_fees_charged_total",
      stated: fundingBatchLedger.controlFeesChargedTotal,
      computed: fundingBatchLedger.feesChargedTotal,
      toleranceBand: exactMoneyToleranceBand(),
      evidence: {
        section: "FUNDING",
        pageNumber: fundingBatchLedger.evidenceLine ? lineForContent(lines, fundingBatchLedger.evidenceLine)?.pageNumber : null,
        sourceText: fundingBatchLedger.evidenceLine,
      },
    }),
    makeReconResult({
      identity: "batch_columns:generic_funded_total",
      stated: fundingBatchLedger.controlFundedTotal,
      computed: fundingBatchLedger.fundedTotal,
      toleranceBand: exactMoneyToleranceBand(),
      evidence: {
        section: "FUNDING",
        pageNumber: fundingBatchLedger.evidenceLine ? lineForContent(lines, fundingBatchLedger.evidenceLine)?.pageNumber : null,
        sourceText: fundingBatchLedger.evidenceLine,
      },
    }),
  ];
  const fallbackConfidence =
    (feeLedger.status === "reconciled" || feeLedger.status === "reconciled_with_rounding_delta") &&
    fundingBatchLedger.status === "reconciled"
      ? "high"
      : "medium";
  const warnings = [
    {
      code: "generic_fiserv_family_fallback_used",
      severity: "medium" as const,
      message:
        fundingBatchLedger.status === "reconciled"
          ? "Used the generic Fiserv-family fallback parser after strict layout parsing was unavailable or unsafe; totals, fee rows, and funding rows are reconciled, but the parser remains pattern-based rather than layout-specific."
          : "Used the generic Fiserv-family fallback parser after strict layout parsing was unavailable or unsafe; totals and fee rows are reconciled, but generic funding detail remains unverified.",
      evidenceLine: feeLedger.evidenceLine,
    },
  ];
  const decision = buildParserDecision({
    reconciliation,
    reconciliationResults,
    feeClassification: feeLedger.feeClassificationSummary,
    warnings,
    confidence: fallbackConfidence,
  });
  const pricingModel = pricingModelFromGenericLedger(feeLedger);
  const noticeLines = extractNoticeLines(lines);
  const noticeText = noticeLines.map((line) => line.evidenceLine).join("\n").trim() || null;
  const fiservFeeAnalysisV2 = buildFiservFeeAnalysisV2FromRawRows({
    rows: feeLedger.rows,
    printedTotal: feeLedger.printedTotal,
    totalVolume: totalVolume.amount,
    totalFees: totalFees.amount,
    transactionCount: primaryTransactionCount,
    pricingModel,
    statementPeriodStart: period.start,
    statementPeriodEnd: period.end,
    merchantName,
    userSelectedBusinessType: options.businessType,
    ytdGrossSales: null,
    notices: extractRepricingEventsFromNoticeLines(noticeLines),
    noticeText,
    fundingBatchRows: fundingBatchLedger.rows,
  });

  return fiservParserOutputSchema.parse({
    statementIdentity: {
      processorFamily: "Fiserv-family",
      visibleBrand,
      statementFamily: "generic_fiserv_family_statement",
      merchantName,
      merchantNumber,
      statementPeriodStart: period.start,
      statementPeriodEnd: period.end,
      sourceFileName: sourceBaseName,
      pageCount: maxPageCount(doc),
    },
    selectedFinancials: {
      totalVolume: totalVolume.amount,
      totalFees: totalFees.amount,
      effectiveRate,
      amountFunded: amountFunded.amount,
      grossSales: null,
      refunds: null,
      adjustmentsChargebacks,
      thirdPartyTransactions,
      transactionCount: {
        primaryTransactionCount,
        supportingTransactionCounts:
          primaryTransactionCount === null
            ? []
            : [
                {
                  role: "card_type_items",
                  value: primaryTransactionCount,
                  reason: "Generic card-type total row exposes submitted item count for the statement period.",
                },
              ],
      },
    },
    feeBreakdown: genericFeeBreakdown(feeLedger, totalFees.amount),
    pricingModel,
    feeLedger,
    fundingBatchLedger,
    interchangeDetail: {
      available: false,
      detailTotal: null,
      detailTransactionCount: null,
      detailVolume: null,
      rows: [],
      rowsStatus: "not_mapped_by_generic_fallback",
      evidenceLine: null,
    },
    candidateTotals: anatomy.candidates,
    excludedTotals: anatomy.excludedTotals,
    reconciliation,
    reconciliationResults,
    decision,
    confidence: {
      overall: fallbackConfidence,
      totalVolume: "high",
      totalFees: "high",
      amountFunded: "high",
      feeBreakdown: feeLedger.status === "unreconciled" ? "low" : fallbackConfidence,
      statementIdentity: merchantName === "Unknown merchant" ? "medium" : "high",
    },
    fiservFeeAnalysisV2,
    warnings,
    evidence: [
      evidenceEntry("statementPeriod", "HEADER", period.line, `${period.start} to ${period.end}`),
      evidenceEntry("merchantName", "HEADER", lineForContent(lines, merchantName), merchantName),
      evidenceEntry("merchantNumber", "HEADER", lineForMerchantNumber(lines), merchantNumber),
      evidenceEntry("totalVolume", "SUMMARY", totalVolume.line, totalVolume.amount),
      evidenceEntry("totalFees", "SUMMARY", totalFees.line, totalFees.amount),
      evidenceEntry("amountFunded", "SUMMARY", amountFunded.line, amountFunded.amount),
      evidenceEntry("feeLedger", "FEES", lineForContent(lines, feeLedger.evidenceLine ?? ""), feeLedger.printedTotal),
      evidenceEntry("fundingBatchLedger", "FUNDING", lineForContent(lines, fundingBatchLedger.evidenceLine ?? ""), fundingBatchLedger.anomalyCount),
    ].filter((entry) => entry.evidenceLine),
  });
}

function buildGenericFeeLedger(lines: GenericLine[], classificationContext = {}) {
  const rows = parseGenericFeeRows(lines);
  const printedTotal = genericFeeGrandTotal(lines)?.amount ?? null;
  const totalRowSum = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const delta = printedTotal === null ? 0 : round2(printedTotal - totalRowSum);
  const controls = buildControls(lines, rows, printedTotal, totalRowSum);
  const classified = classifyFiservProcessorFeeLedgerRows(rows, printedTotal, classificationContext);
  return {
    status: printedTotal === null ? "not_mapped" : Math.abs(delta) === 0 ? "reconciled" : Math.abs(delta) <= 0.05 ? "reconciled_with_rounding_delta" : "unreconciled",
    rows: classified.rows,
    controls,
    totalRowSum,
    printedTotal,
    delta,
    tolerance: 0.05,
    evidenceLine: genericFeeGrandTotal(lines)?.line.content ?? null,
    feeClassificationSummary: classified.summary,
    notes: [
      "Generic Fiserv-family fee ledger rows are extracted from visible fee sections and reconciled against the printed all-in fee total.",
      "This fallback preserves row evidence and enables AI classification; funding detail is parsed separately when a submitted/fees/processed table can be reconciled.",
    ],
  };
}

function parseGenericFeeRows(lines: GenericLine[]): GenericFeeRow[] {
  const rows: GenericFeeRow[] = [];
  let activeSection = "";
  let activeNetwork: string | null = null;
  const start = lines.findIndex((line) => isGenericFeeSectionStart(line.content));
  if (start < 0) return rows;
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      (/^INTERCHANGE(?: CHARGES\/PROGRAM FEES)?\b/i.test(line.content) ||
        /^Total dollar amount of aggregate reportable payment card transactions/i.test(line.content)),
  );
  const feeLines = lines.slice(start, end > start ? end : lines.length);

  for (const line of feeLines) {
    const content = line.content.trim();
    const heading = headingFor(content);
    if (heading) {
      activeSection = heading;
      if (heading !== "TRANSACTION FEES") activeNetwork = null;
      continue;
    }
    const networkHeading = networkHeadingFor(content);
    if (networkHeading) {
      activeNetwork = networkHeading;
      continue;
    }
    if (/^total\b/i.test(content)) continue;
    const parsed = parseFeeLine(content, activeSection, activeNetwork, line.pageNumber);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

function isGenericFeeSectionStart(content: string): boolean {
  if (/^TRANSACTION FEES\b/i.test(content)) return true;
  if (/^FEES CHARGED\s*$/i.test(content)) return true;
  return false;
}

function parseFeeLine(content: string, activeSection: string, activeNetwork: string | null, page: number | null): GenericFeeRow | null {
  const processorBranded = parseProcessorBrandedFeeLine(content, activeSection, page);
  if (processorBranded) return processorBranded;

  const parts = cellParts(content);
  if (parts.length < 2) return null;
  const typeIndex = parts.findIndex((part) => /^(?:Interchange charges|Service charges|Fees)$/i.test(part));
  if (typeIndex < 0 || typeIndex >= parts.length - 1) return null;
  const type = canonicalType(parts[typeIndex]!);
  const amount = lastAmount(content);
  if (amount === null) return null;
  const descriptionParts = parts.slice(0, typeIndex);
  const description = (descriptionParts[0] ?? "").replace(/\s+/g, " ").trim();
  if (!description || /^type$/i.test(description)) return null;
  return {
    date: null,
    type,
    network: inferNetwork(activeNetwork, description),
    description,
    volumeBasis: volumeBasisFromContent(content),
    count: countFromContent(content),
    rate: rateFromContent(content),
    amount,
    bucket: type === "Fees" && activeSection !== "TRANSACTION FEES" ? "miscellaneousFees" : "cardFees",
    sourceSection: activeSection || "FEES",
    evidenceLine: content,
    pageNumber: page,
    confidence: "high",
  };
}

function parseProcessorBrandedFeeLine(content: string, activeSection: string, page: number | null): GenericFeeRow | null {
  const parts = cellParts(content);
  if (parts.length < 4 || !isFullDateToken(parts[0] ?? "")) return null;
  const bucketCode = (parts[1] ?? "").toUpperCase();
  if (bucketCode !== "CF" && bucketCode !== "MISC") return null;
  const amount = lastAmount(content);
  const description = (parts[2] ?? "").replace(/^\*+/, "").replace(/\s+/g, " ").trim();
  if (!description || amount === null) return null;
  const count = parts.slice(3, -1).map((part) => firstIntegerFromCell(part)).find((value) => value !== null) ?? null;
  const rate = parts.slice(3, -1).map((part) => firstRateFromCell(part)).find((value) => value !== null) ?? null;
  return {
    date: parts[0]!,
    type: bucketCode === "CF" ? "Card Fees" : "Fees",
    network: inferNetwork(null, description),
    description,
    volumeBasis: null,
    count,
    rate,
    amount,
    bucket: bucketCode === "MISC" ? "miscellaneousFees" : "cardFees",
    sourceSection: activeSection || "FEES CHARGED",
    evidenceLine: content,
    pageNumber: page,
    confidence: "medium",
  };
}

function buildControls(lines: GenericLine[], rows: GenericFeeRow[], printedTotal: number | null, totalRowSum: number) {
  return [
    controlFromRows(lines, rows, "Total Transaction Fees", "TRANSACTION FEES", (row) => row.sourceSection === "TRANSACTION FEES"),
    controlFromRows(lines, rows, "Total Debit Network Fees", "DEBIT NETWORK FEES", (row) => row.sourceSection === "DEBIT NETWORK FEES"),
    controlFromRows(lines, rows, "Total Account Fees", "ACCOUNT FEES", (row) => row.sourceSection === "ACCOUNT FEES"),
    controlFromRows(lines, rows, "Total Equipment Fees", "EQUIPMENT", (row) => row.sourceSection === "EQUIPMENT"),
    controlFromRows(lines, rows, "Total Interchange Charges", "FEES", (row) => row.type === "Interchange charges"),
    controlFromRows(lines, rows, "Total Interchange Charges/Program Fees", "FEES", (row) => row.type === "Interchange charges" || row.type === "Program Fees"),
    controlFromRows(lines, rows, "Total Service Charges", "FEES", (row) => row.type === "Service charges"),
    controlFromRows(lines, rows, "Total Fees", "FEES", (row) => row.type === "Fees"),
    controlFromRows(lines, rows, "Total Card Fees", "CARD FEES", (row) => row.bucket === "cardFees"),
    controlFromRows(lines, rows, "Total Miscellaneous Fees", "MISCELLANEOUS FEES", (row) => row.bucket === "miscellaneousFees"),
    makeControl({
      label: "Generic Fee Grand Total",
      bucket: "unknown",
      rowSum: totalRowSum,
      printedTotal,
      tolerance: 0.05,
      evidenceLine: genericFeeGrandTotal(lines)?.line.content ?? null,
    }),
  ].filter((control): control is NonNullable<typeof control> => Boolean(control));
}

function controlFromRows(lines: GenericLine[], rows: GenericFeeRow[], label: string, sourceSection: string, predicate: (row: GenericFeeRow) => boolean) {
  const printed = optionalLineAmount(lines, new RegExp(`^${escapeRegExp(label)}\\b`, "i"));
  if (!printed) return null;
  return makeControl({
    label,
    bucket: sourceSection === "ACCOUNT FEES" || sourceSection === "EQUIPMENT" ? "miscellaneousFees" : "cardFees",
    rowSum: round2(rows.filter(predicate).reduce((sum, row) => sum + row.amount, 0)),
    printedTotal: printed.amount,
    tolerance: 0.05,
    evidenceLine: printed.line.content,
  });
}

function makeControl(params: {
  label: string;
  bucket: "cardFees" | "miscellaneousFees" | "unknown";
  rowSum: number;
  printedTotal: number | null;
  tolerance: number;
  evidenceLine: string | null;
}) {
  const delta = params.printedTotal === null ? 0 : round2(params.printedTotal - params.rowSum);
  return {
    label: params.label,
    bucket: params.bucket,
    rowSum: round2(params.rowSum),
    printedTotal: params.printedTotal,
    delta,
    tolerance: params.tolerance,
    status: params.printedTotal === null ? "not_mapped" : Math.abs(delta) === 0 ? "reconciled" : Math.abs(delta) <= params.tolerance ? "reconciled_with_rounding_delta" : "unreconciled",
    evidenceLine: params.evidenceLine,
  };
}

function genericFeeBreakdown(feeLedger: ReturnType<typeof buildGenericFeeLedger>, totalFees: number) {
  const amountFor = (label: string, fallback: number) => feeLedger.controls.find((control) => control.label === label)?.printedTotal ?? fallback;
  const interchange = amountFor("Total Interchange Charges", amountFor("Total Interchange Charges/Program Fees", amountFor("Total Card Fees", 0)));
  const service = amountFor("Total Service Charges", 0);
  const fees = amountFor("Total Fees", amountFor("Total Miscellaneous Fees", 0));
  return {
    layout: "generic_fiserv_family_fee_sections",
    buckets: [
      {
        key: "cardBrandOrPassThrough",
        label: feeLedger.controls.some((control) => control.label === "Total Card Fees") ? "Card Fees" : "Interchange Charges",
        amount: interchange,
        sourceSection: "FEES",
        evidenceLine:
          feeLedger.controls.find((control) => control.label === "Total Interchange Charges")?.evidenceLine ??
          feeLedger.controls.find((control) => control.label === "Total Interchange Charges/Program Fees")?.evidenceLine ??
          feeLedger.controls.find((control) => control.label === "Total Card Fees")?.evidenceLine ??
          feeLedger.evidenceLine ??
          "Generic card fee total",
        confidence: "medium",
      },
      {
        key: "serviceCharges",
        label: "Service Charges",
        amount: service,
        sourceSection: "FEES",
        evidenceLine: feeLedger.controls.find((control) => control.label === "Total Service Charges")?.evidenceLine ?? feeLedger.evidenceLine ?? "Total Service Charges",
        confidence: "medium",
      },
      {
        key: "processorOrAccountFees",
        label: feeLedger.controls.some((control) => control.label === "Total Miscellaneous Fees") ? "Miscellaneous Fees" : "Fees",
        amount: fees,
        sourceSection: "FEES",
        evidenceLine: feeLedger.controls.find((control) => control.label === "Total Fees")?.evidenceLine ?? feeLedger.evidenceLine ?? "Total Fees",
        confidence: "medium",
      },
    ].filter((bucket) => bucket.amount > 0),
    total: totalFees,
    evidenceLine: feeLedger.evidenceLine ?? "Generic fee ledger total",
  };
}

function pricingModelFromGenericLedger(feeLedger: ReturnType<typeof buildGenericFeeLedger>) {
  const hasInterchangeRows = feeLedger.rows.filter((row) => row.type === "Interchange charges" || row.type === "Card Fees").length >= 2;
  return {
    pricingModel: hasInterchangeRows ? "interchange_plus" : "unknown",
    confidence: hasInterchangeRows ? "medium" : "low",
    cashDiscountStatus: "unknown",
    flatDiscountRate: null,
    evidenceType: hasInterchangeRows ? "explicit_statement_label" : "not_detected",
    evidence: [],
    notes: hasInterchangeRows
      ? [
          "Generic fallback inferred interchange-plus/itemized exposure from visible Interchange charges rows and reconciled fee-section totals.",
          "This is a structure inference only; pass-through-at-cost proof still requires row-level reference matching or processor documentation.",
        ]
      : ["Generic fallback could not determine pricing model from visible fee rows."],
  };
}

function buildGenericFundingBatchLedger(lines: GenericLine[]) {
  const section = bestFundingSection(lines);
  if (!section) return notMappedFundingBatchLedger("Generic Fiserv-family fallback could not identify a funding table with submitted, fee, and funded/processed columns.");

  const rows: GenericFundingBatchRow[] = [];
  let totalLine: GenericLine | null = null;
  let controlSubmittedTotal: number | null = null;
  let controlFeesChargedTotal: number | null = null;
  let controlFundedTotal: number | null = null;

  for (const line of section.lines) {
    const content = line.content.trim();
    const parsedTotal = parseGenericFundingTotalRow(content);
    if (parsedTotal) {
      totalLine = line;
      controlSubmittedTotal = parsedTotal.controlSubmittedTotal;
      controlFeesChargedTotal = parsedTotal.controlFeesChargedTotal;
      controlFundedTotal = parsedTotal.controlFundedTotal;
      continue;
    }

    const parsed = parseGenericFundingRow(content, line.pageNumber);
    if (parsed) rows.push(parsed);
  }

  if (!totalLine || controlSubmittedTotal === null || controlFeesChargedTotal === null || controlFundedTotal === null) {
    return {
      ...notMappedFundingBatchLedger("Generic Fiserv-family fallback found a funding section but could not identify a printed funding control total."),
      rows,
      rowCount: rows.length,
    };
  }

  const rowFeesTotal = round2(rows.reduce((sum, row) => sum + row.feesCharged, 0));
  if (rowFeesTotal === 0 && controlFeesChargedTotal > 0) {
    rows.push({
      dateSubmitted: "Month End Fees",
      batchNumber: null,
      amountSubmitted: 0,
      thirdPartyTransactions: 0,
      adjustments: 0,
      chargebacks: 0,
      feesCharged: controlFeesChargedTotal,
      amountFunded: -controlFeesChargedTotal,
      formulaResult: -controlFeesChargedTotal,
      delta: 0,
      tolerance: 0.01,
      status: "pass",
      evidenceLine: totalLine.content,
      pageNumber: totalLine.pageNumber,
      notes: [
        "Statement-level fees are modeled as a funding ledger charge row because detail funding rows print zero fees and the control total applies fees at period end.",
      ],
    });
  }

  const submittedTotal = round2(rows.reduce((sum, row) => sum + (isDatedFundingRow(row.dateSubmitted) ? row.amountSubmitted : 0), 0));
  const fundedTotal = round2(rows.reduce((sum, row) => sum + row.amountFunded, 0));
  const feesChargedTotal = round2(rows.reduce((sum, row) => sum + row.feesCharged, 0));
  const submittedDelta = round2(controlSubmittedTotal - submittedTotal);
  const fundedDelta = round2(controlFundedTotal - fundedTotal);
  const feesChargedDelta = round2(controlFeesChargedTotal - feesChargedTotal);
  const anomalyCount =
    rows.filter((row) => row.status === "fail").length +
    [submittedDelta, fundedDelta, feesChargedDelta].filter((delta) => Math.abs(delta) > 0.01).length;

  return {
    status: anomalyCount === 0 ? "reconciled" : Math.abs(submittedDelta) <= 1 && Math.abs(fundedDelta) <= 1 && Math.abs(feesChargedDelta) <= 1 ? "reconciled_with_warnings" : "unreconciled",
    formula: FUNDING_FORMULA,
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
    evidenceLine: totalLine.content,
    notes: [
      `Generic funding ledger selected ${section.label} because it exposes submitted, fee, and processed/funded columns.`,
      "Funding rows are reconciled by formula and by printed section control totals.",
    ],
  };
}

function notMappedFundingBatchLedger(note: string) {
  return {
    status: "not_mapped",
    formula: FUNDING_FORMULA,
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

function bestFundingSection(lines: GenericLine[]): { label: string; lines: GenericLine[] } | null {
  const candidates = fundingSectionCandidates(lines);
  return (
    candidates
      .map((candidate) => ({ ...candidate, score: fundingSectionScore(candidate.lines) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.lines[0]!.index - right.lines[0]!.index)[0] ?? null
  );
}

function fundingSectionCandidates(lines: GenericLine[]): Array<{ label: string; lines: GenericLine[] }> {
  const candidates: Array<{ label: string; lines: GenericLine[] }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const content = lines[index]!.content.trim();
    if (!isFundingSectionStart(content)) continue;
    const end = fundingSectionEndIndex(lines, index + 1);
    candidates.push({
      label: fundingSectionLabel(content),
      lines: lines.slice(index, end),
    });
  }
  return candidates;
}

function isFundingSectionStart(content: string): boolean {
  const text = normalizedPlainText(content);
  if (/^summary by day\b/.test(text)) return true;
  if (/^amounts funded by batch\b/.test(text)) return true;
  if (/^date\b/.test(text) && /\bsubmitted\b/.test(text) && /\bfees?\b/.test(text) && /\b(?:processed|funded)\b/.test(text)) return true;
  return false;
}

function fundingSectionEndIndex(lines: GenericLine[], start: number): number {
  let sawTotal = false;
  for (let index = start; index < lines.length; index += 1) {
    const content = lines[index]!.content.trim();
    if (parseGenericFundingTotalRow(content)) sawTotal = true;
    if (
      sawTotal &&
      /^(?:summary by card type|summary by batch|chargebacks\/reversals|adjustments\b|transaction fees|fees\b|interchange\b|account fees\b|total gross reportable sales)\b/i.test(
        content,
      )
    ) {
      return index;
    }
    if (!sawTotal && index > start && /^summary by batch\b/i.test(content)) return index;
  }
  return lines.length;
}

function fundingSectionLabel(content: string): string {
  if (/^summary by day\b/i.test(content)) return "SUMMARY BY DAY";
  if (/^amounts funded by batch\b/i.test(content)) return "AMOUNTS FUNDED BY BATCH";
  return "GENERIC FUNDING TABLE";
}

function fundingSectionScore(lines: GenericLine[]): number {
  const parsedRows = lines.filter((line) => parseGenericFundingRow(line.content, line.pageNumber)).length;
  const hasControlTotal = lines.some((line) => parseGenericFundingTotalRow(line.content));
  const headerText = lines.slice(0, 8).map((line) => line.content).join(" ");
  const hasFundingColumns = /\bsubmitted\b/i.test(headerText) && /\bfees?\b/i.test(headerText) && /\b(?:processed|funded)\b/i.test(headerText);
  return parsedRows + (hasControlTotal ? 10 : 0) + (hasFundingColumns ? 5 : 0);
}

function parseGenericFundingRow(content: string, page: number | null): GenericFundingBatchRow | null {
  return parseDatedFundingRow(content, page) ?? parseDatedBatchFundingRow(content, page);
}

function parseDatedFundingRow(content: string, page: number | null): GenericFundingBatchRow | null {
  const parts = cellParts(content);
  if (parts.length < 6 || !isDateToken(parts[0]!)) return null;
  const amountSubmitted = positiveMoneyFromCell(parts[1]);
  const chargebacks = signedMoneyFromCell(parts[2]);
  const adjustments = signedMoneyFromCell(parts[3]);
  const feesCharged = positiveMoneyFromCell(parts[4]);
  const amountFunded = signedMoneyFromCell(parts[5]);
  if (amountSubmitted === null || chargebacks === null || adjustments === null || feesCharged === null || amountFunded === null) return null;
  return makeFundingRow({
    dateSubmitted: parts[0]!,
    batchNumber: null,
    amountSubmitted,
    thirdPartyTransactions: 0,
    adjustments,
    chargebacks,
    feesCharged,
    amountFunded,
    evidenceLine: content,
    pageNumber: page,
    notes: [],
  });
}

function parseDatedBatchFundingRow(content: string, page: number | null): GenericFundingBatchRow | null {
  const parts = cellParts(content);
  if (parts.length < 7 || !isDateToken(parts[0]!)) return null;
  const amountSubmitted = positiveMoneyFromCell(parts[2]);
  const thirdPartyTransactions = positiveMoneyFromCell(parts[3]);
  const adjustments = signedMoneyFromCell(parts[4]);
  const feesCharged = positiveMoneyFromCell(parts[5]);
  const amountFunded = signedMoneyFromCell(parts[6]);
  if (
    amountSubmitted === null ||
    thirdPartyTransactions === null ||
    adjustments === null ||
    feesCharged === null ||
    amountFunded === null
  ) {
    return null;
  }
  return makeFundingRow({
    dateSubmitted: parts[0]!,
    batchNumber: parts[1] ?? null,
    amountSubmitted,
    thirdPartyTransactions,
    adjustments,
    chargebacks: 0,
    feesCharged,
    amountFunded,
    evidenceLine: content,
    pageNumber: page,
    notes: [],
  });
}

function parseGenericFundingTotalRow(content: string): {
  controlSubmittedTotal: number;
  controlFeesChargedTotal: number;
  controlFundedTotal: number;
} | null {
  const parts = cellParts(content);
  if (!/^total$/i.test(parts[0] ?? "")) return null;

  if (parts.length >= 6) {
    const submitted = positiveMoneyFromCell(parts[1]);
    const second = signedMoneyFromCell(parts[2]) ?? 0;
    const third = signedMoneyFromCell(parts[3]) ?? 0;
    const fees = positiveMoneyFromCell(parts[4]);
    const funded = signedMoneyFromCell(parts[5]);
    const directDelta =
      submitted !== null && fees !== null && funded !== null ? Math.abs(round2(submitted + second + third - fees - funded)) : Number.POSITIVE_INFINITY;
    const thirdPartyDelta =
      submitted !== null && fees !== null && funded !== null
        ? Math.abs(round2(submitted - Math.abs(second) + third - fees - funded))
        : Number.POSITIVE_INFINITY;
    if (submitted !== null && fees !== null && funded !== null && Math.min(directDelta, thirdPartyDelta) <= 1) {
      return {
        controlSubmittedTotal: submitted,
        controlFeesChargedTotal: fees,
        controlFundedTotal: funded,
      };
    }
  }

  return null;
}

function makeFundingRow(input: {
  dateSubmitted: string;
  batchNumber: string | null;
  amountSubmitted: number;
  thirdPartyTransactions: number;
  adjustments: number;
  chargebacks: number;
  feesCharged: number;
  amountFunded: number;
  evidenceLine: string;
  pageNumber: number | null;
  notes: string[];
}): GenericFundingBatchRow {
  const formulaResult = round2(
    input.amountSubmitted - input.thirdPartyTransactions + input.adjustments + input.chargebacks - input.feesCharged,
  );
  const delta = round2(input.amountFunded - formulaResult);
  return {
    ...input,
    formulaResult,
    delta,
    tolerance: 0.01,
    status: Math.abs(delta) <= 0.01 ? "pass" : "fail",
    notes:
      Math.abs(delta) <= 0.01
        ? input.notes
        : [...input.notes, `Displayed funding formula misses the printed funded/processed amount by $${Math.abs(delta).toFixed(2)}.`],
  };
}

function isDatedFundingRow(input: string): boolean {
  return isDateToken(input);
}

function isDateToken(input: string): boolean {
  return /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(input.trim());
}

function isFullDateToken(input: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(input.trim());
}

function firstIntegerFromCell(input: string): number | null {
  const match = input.trim().match(/^\d{1,6}$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isInteger(parsed) ? parsed : null;
}

function firstRateFromCell(input: string): number | null {
  const match = input.trim().match(/^\.?\d+\.\d+$/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractNoticeLines(lines: GenericLine[]): RepricingNoticeLine[] {
  const start = lines.findIndex((line) => /^important information\b/i.test(line.content));
  if (start < 0) return [];
  const collected: RepricingNoticeLine[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(?:SUMMARY BY|TRANSACTION FEES|FEES\b|INTERCHANGE\b|ACCOUNT FEES\b|TOTAL GROSS REPORTABLE SALES)\b/i.test(line.content)) break;
    collected.push({
      rowIndex: line.index,
      sourceSection: "Statement notices",
      evidenceLine: line.content,
    });
  }
  return collected;
}

function extractStatementPeriod(lines: GenericLine[]) {
  const line = lines.find((candidate) => /\bstatement period\b/i.test(candidate.content));
  if (!line) throw new Error("Generic Fiserv fallback could not find statement period.");
  const match = line.content.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (!match) throw new Error(`Generic Fiserv fallback could not parse statement period: ${line.content}`);
  return {
    start: isoDate(Number(match[1]), Number(match[2]), Number(match[3])),
    end: isoDate(Number(match[4]), Number(match[5]), Number(match[6])),
    line,
  };
}

function extractMerchantName(lines: GenericLine[]): string | null {
  const pageOne = lines.filter((line) => line.pageNumber === 1).slice(0, 12);
  const pageLine = pageOne.find((line) => /\bpage\s+1\s+of\b/i.test(line.content) && !/^page\b/i.test(line.content));
  const fromPageLine = pageLine?.content.split("|")[0]?.trim();
  if (fromPageLine && /[A-Z]/.test(fromPageLine) && !/YOUR CARD PROCESSING STATEMENT/i.test(fromPageLine)) return fromPageLine;
  return (
    pageOne
      .map((line) => line.content.split("|")[0]?.trim() ?? "")
      .find((content) => /^[A-Z0-9 '&.-]{4,}$/.test(content) && !/STATEMENT|MERCHANT|CUSTOMER|PHONE|ADDRESS|\d{5}/i.test(content)) ?? null
  );
}

function extractMerchantNumber(lines: GenericLine[]): string | null {
  const line = lineForMerchantNumber(lines);
  return line?.content.match(/\bMerchant Number\b\s*\|\s*([A-Z0-9-]+)/i)?.[1] ?? null;
}

function inferVisibleBrand(lines: GenericLine[], sourceFileName: string): string {
  const text = `${sourceFileName}\n${lines.map((line) => line.content).join("\n")}`;
  if (/\bbasys\b|\bbasyspro\.com\b/i.test(text)) return "Basys";
  if (/\bclover\b/i.test(text)) return "Clover";
  if (/\bfirst data\b/i.test(text)) return "First Data";
  if (/\bfiserv\b/i.test(text)) return "Fiserv";
  return "Fiserv-family statement";
}

function requireLineAmount(lines: GenericLine[], pattern: RegExp, label: string): RequiredAmount {
  const amount = optionalLineAmount(lines, pattern);
  if (!amount) throw new Error(`Generic Fiserv fallback could not find ${label}.`);
  return { ...amount, label };
}

function optionalLineAmount(lines: GenericLine[], pattern: RegExp): RequiredAmount | null {
  const line = lines.find((candidate) => pattern.test(candidate.content));
  if (!line) return null;
  const amount = lastAmount(line.content);
  return amount === null ? null : { label: line.content, amount, line };
}

function genericFeeGrandTotal(lines: GenericLine[]): RequiredAmount | null {
  return (
    optionalLineAmount(lines, /^total\s*\(\s*service charges,\s*interchange charges(?:\/program fees)?,\s*and fees\s*\)/i) ??
    optionalLineAmount(lines, /^total\s*\(\s*misc(?:ellaneous)? fees and card fees\s*\)/i)
  );
}

function optionalCardTypeTotal(lines: GenericLine[]): RequiredAmount | null {
  return lines
    .filter((line) => /^TOTAL\s*\|/i.test(line.content) && signedMoneyTokens(line.content).length >= 3)
    .map((line) => {
      const amount = signedMoneyTokens(line.content).map(Math.abs)[0];
      return amount === undefined ? null : { label: "Summary By Card Type Total", amount, line };
    })
    .find(Boolean) ?? null;
}

function extractPrimaryTransactionCount(lines: GenericLine[]): number | null {
  const total = lines.find((line) => /^TOTAL\s*\|/i.test(line.content) && /\|\s*\d{1,3}(?:,\d{3})*\s*\|/.test(line.content));
  if (!total) return null;
  const parts = cellParts(total.content);
  const token = parts.find((part) => /^\d{1,3}(?:,\d{3})*$|^\d+$/.test(part.trim()));
  const parsed = token ? Number(token.replace(/,/g, "")) : null;
  return Number.isInteger(parsed) ? parsed : null;
}

function headingFor(content: string): string | null {
  for (const heading of SECTION_HEADINGS) {
    if (new RegExp(`^${escapeRegExp(heading)}\\b`, "i").test(content)) return heading;
  }
  return null;
}

function networkHeadingFor(content: string): string | null {
  for (const [pattern, network] of NETWORK_HEADINGS) {
    if (pattern.test(content)) return network;
  }
  return null;
}

function canonicalType(value: string): string {
  if (/^interchange charges$/i.test(value)) return "Interchange charges";
  if (/^service charges$/i.test(value)) return "Service charges";
  return "Fees";
}

function inferNetwork(activeNetwork: string | null, description: string): string | null {
  const text = description.toUpperCase();
  if (/^(MC|MASTERCARD)\b/.test(text)) return "MASTERCARD";
  if (/^(VI|VISA)\b/.test(text)) return "VISA";
  if (/^(DISC|DISCOVER|DSCVR)\b/.test(text)) return "DISCOVER";
  if (/^(AMEX|AXP|AMERICAN EXPRESS)\b/.test(text)) return "AMEX";
  return activeNetwork;
}

function volumeBasisFromContent(content: string): number | null {
  const times = content.match(/\bTIMES\s+\$?([\d,]+(?:\.\d{1,2})?)/i);
  if (times) return parseMoneyToken(times[1]!);
  const total = content.match(/\bTRANS(?:ACTIONS?)?\s+TOTALING\s+\|\s+\$?([\d,]+(?:\.\d{1,2})?)/i);
  if (total) return parseMoneyToken(total[1]!);
  return null;
}

function countFromContent(content: string): number | null {
  const match = content.match(/\b(\d{1,6})\s+TRANS(?:ACTIONS?)?\b/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : null;
}

function rateFromContent(content: string): number | null {
  const at = content.match(/\bAT\s+(\.?\d+(?:\.\d+)?)\b/i);
  const disc = content.match(/\b(\.?\d+(?:\.\d+)?)\s+DISC RATE\b/i);
  const times = content.match(/\b(\.?\d+(?:\.\d+)?)\s+TIMES\b/i);
  const token = at?.[1] ?? disc?.[1] ?? times?.[1] ?? null;
  if (!token) return null;
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function lastAmount(content: string): number | null {
  const lastCell = cellParts(content).at(-1);
  if (lastCell !== undefined) {
    const lastCellValues = signedMoneyTokens(cleanStatementText(lastCell));
    const lastCellAmount = lastCellValues.at(-1);
    if (lastCellAmount !== undefined) return Math.abs(lastCellAmount);
    const compact = compactCentAmountFromCell(lastCell);
    if (compact !== null) return compact;
  }
  const values = signedMoneyTokens(cleanStatementText(content));
  const amount = values.at(-1);
  if (amount !== undefined) return Math.abs(amount);
  return compactCentAmountFromCell(lastCell);
}

function compactCentAmountFromCell(input: string | undefined): number | null {
  if (input === undefined) return null;
  const normalized = cleanStatementText(input)
    .replace(/[$,\s]/g, "")
    .trim();
  if (!/^-?\d{3,}$/.test(normalized)) return null;
  const parsed = Number(normalized) / 100;
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function parseMoneyToken(input: string): number | null {
  const parsed = Number(input.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function signedMoneyFromCell(input: string | undefined): number | null {
  if (input === undefined) return null;
  const normalized = cleanStatementText(input)
    .replace(/\(([^)]+)\)/g, "-$1")
    .replace(/[$,\s]/g, "")
    .trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveMoneyFromCell(input: string | undefined): number | null {
  const parsed = signedMoneyFromCell(input);
  return parsed === null ? null : Math.abs(parsed);
}

function cellParts(content: string): string[] {
  return content
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function documentLines(doc: RawExtractedDocument): GenericLine[] {
  return statementLines(doc);
}

function lineForContent(lines: GenericLine[], content: string | null): GenericLine | null {
  if (!content) return null;
  return lines.find((line) => line.content === content || line.content.includes(content)) ?? null;
}

function lineForMerchantNumber(lines: GenericLine[]): GenericLine | null {
  return lines.find((candidate) => /\bMerchant Number\b/i.test(candidate.content)) ?? null;
}

function evidenceFor(item: RequiredAmount, section: string) {
  return {
    section,
    pageNumber: item.line.pageNumber,
    sourceText: item.line.content,
  };
}

function evidenceEntry(field: string, sourceSection: string, line: GenericLine | null, value: string | number | null) {
  return {
    field,
    sourceSection,
    pageNumber: line?.pageNumber ?? null,
    lineIndex: line?.index ?? null,
    evidenceLine: line?.content ?? "",
    value,
  };
}

function isoDate(month: number, day: number, year: number): string {
  const fullYear = year < 100 ? 2000 + year : year;
  return `${fullYear.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function corpus(doc: RawExtractedDocument): string {
  return statementCorpus(doc);
}

function normalizedPlainText(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
