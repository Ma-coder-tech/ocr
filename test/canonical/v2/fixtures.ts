import type { ParsedDocument } from "../../../src/parser.js";

export type V2SyntheticStatementOptions = {
  grossSales?: number;
  refunds?: number;
  netSubmitted?: number;
  totalFees?: number;
  amountFunded?: number;
  grossSaleCount?: number | null;
  refundCount?: number | null;
  adjustment?: number;
  chargeback?: number;
  chargebackFee?: number;
  feeCredit?: number;
  includeSensitiveLabel?: boolean;
};

export function v2SyntheticStatement(options: V2SyntheticStatementOptions = {}): {
  document: ParsedDocument;
  parserOutput: Record<string, unknown>;
  feeRowAdmissions: Array<{ feeRowIndex: number; role: "chargeback_fee"; basis: "approved_synthetic" }>;
} {
  const grossSales = options.grossSales ?? 1_000;
  const refunds = options.refunds ?? 100;
  const netSubmitted = options.netSubmitted ?? grossSales - refunds;
  const totalFees = options.totalFees ?? 45;
  const adjustment = options.adjustment ?? -4;
  const chargeback = options.chargeback ?? -6;
  const amountFunded = options.amountFunded ?? netSubmitted + adjustment + chargeback - totalFees;
  const grossSaleCount = options.grossSaleCount === undefined ? 20 : options.grossSaleCount;
  const refundCount = options.refundCount === undefined ? 2 : options.refundCount;
  const chargebackFee = options.chargebackFee ?? 15;
  const feeCredit = options.feeCredit ?? -1;
  const otherFee = totalFees - chargebackFee - feeCredit;
  const sensitiveDescription = options.includeSensitiveLabel
    ? "Chargeback fee merchant 123456789 contact owner@example.com"
    : "Chargeback fee";
  const rows: ParsedDocument["rows"] = [
    { page: "page-1", content: "SUMMARY" },
    { page: "page-1", content: `Gross Sales | $${grossSales.toFixed(2)}` },
    { page: "page-1", content: `Refunds | $${refunds.toFixed(2)}` },
    { page: "page-1", content: `Total Amount Submitted | $${netSubmitted.toFixed(2)}` },
    { page: "page-1", content: `Fees | -$${totalFees.toFixed(2)}` },
    { page: "page-1", content: `Total Amount Processed | $${amountFunded.toFixed(2)}` },
    { page: "page-2", content: "SUMMARY BY CARD TYPE" },
    { page: "page-2", content: `Gross sale items | ${grossSaleCount ?? "unknown"}` },
    { page: "page-2", content: `Refund items | ${refundCount ?? "unknown"}` },
    { page: "page-3", content: "FEES" },
    { page: "page-3", content: `${sensitiveDescription} | $${chargebackFee.toFixed(2)}` },
    { page: "page-3", content: `Statement fee | $${otherFee.toFixed(2)}` },
    { page: "page-3", content: `Fee credit | -$${Math.abs(feeCredit).toFixed(2)}` },
    { page: "page-4", content: "SUMMARY BY BATCH" },
    { page: "page-4", content: `08/31/26 | B1 | $${netSubmitted.toFixed(2)} | $${adjustment.toFixed(2)} | $${chargeback.toFixed(2)} | $${totalFees.toFixed(2)} | $${amountFunded.toFixed(2)}` },
  ];
  const supportingTransactionCounts = [
    ...(grossSaleCount === null ? [] : [{ role: "gross_sale_items", value: grossSaleCount, reason: "Gross-sale subtotal count." }]),
    ...(refundCount === null ? [] : [{ role: "refunds", value: refundCount, reason: "Refund subtotal count." }]),
    { role: "card_type_items", value: 999, reason: "Narrow card-type subtotal that is not a gross-sale population." },
  ];
  const evidence = [
    evidenceRow("grossSales", "SUMMARY", 1, 1, rows[1]!.content, grossSales),
    evidenceRow("refunds", "SUMMARY", 1, 2, rows[2]!.content, refunds),
    evidenceRow("totalVolume", "SUMMARY", 1, 3, rows[3]!.content, netSubmitted),
    evidenceRow("totalFees", "SUMMARY", 1, 4, rows[4]!.content, totalFees),
    evidenceRow("amountFunded", "SUMMARY", 1, 5, rows[5]!.content, amountFunded),
    evidenceRow("adjustmentsChargebacks", "SUMMARY", 1, 5, rows[5]!.content, adjustment + chargeback),
    evidenceRow("thirdPartyTransactions", "SUMMARY", 1, 3, rows[3]!.content, 0),
  ];
  return {
    feeRowAdmissions: chargebackFee > 0
      ? [{ feeRowIndex: 0, role: "chargeback_fee", basis: "approved_synthetic" }]
      : [],
    document: {
      sourceType: "pdf",
      headers: [],
      rows,
      textPreview: rows.map((row) => row.content).join("\n"),
      extraction: {
        mode: "structured",
        qualityScore: 1,
        reasons: [],
        lineCount: rows.length,
        amountTokenCount: 12,
        hasExtractableText: true,
      },
    },
    parserOutput: {
      statementIdentity: {
        processorFamily: "Fiserv / First Data",
        statementFamily: "approved synthetic Fiserv foundation fixture",
        statementPeriodStart: "2026-08-01",
        statementPeriodEnd: "2026-08-31",
      },
      selectedFinancials: {
        totalVolume: netSubmitted,
        totalFees,
        effectiveRate: netSubmitted === 0 ? 0 : totalFees / netSubmitted,
        amountFunded,
        grossSales,
        refunds,
        adjustmentsChargebacks: adjustment + chargeback,
        thirdPartyTransactions: 0,
        transactionCount: {
          primaryTransactionCount: 777,
          supportingTransactionCounts,
        },
      },
      candidateTotals: [
        candidate("gross_sales", "Gross Sales", grossSales, "SUMMARY", 1, rows[1]!.content, false),
        candidate("total_volume", "Total Amount Submitted", netSubmitted, "SUMMARY", 1, rows[3]!.content, true),
        candidate("total_fees", "Fees", totalFees, "SUMMARY", 1, rows[4]!.content, true),
        candidate("amount_funded", "Total Amount Processed", amountFunded, "SUMMARY", 1, rows[5]!.content, true),
      ],
      evidence,
      feeLedger: {
        status: "reconciled",
        rows: [
          feeRow(sensitiveDescription, chargebackFee, rows[10]!.content, 3),
          feeRow("Statement fee", otherFee, rows[11]!.content, 3),
          feeRow("Fee credit", feeCredit, rows[12]!.content, 3),
        ],
      },
      fundingBatchLedger: {
        status: "reconciled",
        rows: [{
          dateSubmitted: "08/31/26",
          batchNumber: "B1",
          amountSubmitted: netSubmitted,
          thirdPartyTransactions: 0,
          adjustments: adjustment,
          chargebacks: chargeback,
          feesCharged: totalFees,
          amountFunded,
          formulaResult: amountFunded,
          delta: 0,
          tolerance: 0.01,
          status: "pass",
          evidenceLine: rows[14]!.content,
          pageNumber: 4,
          notes: [],
        }],
      },
      reconciliationResults: [
        {
          identity: "headline:submitted_plus_adjustments_minus_fees_eq_processed",
          status: "RECON_OK",
          stated: amountFunded,
          computed: amountFunded,
          delta: 0,
          toleranceBand: 0.01,
          evidence: { section: "SUMMARY", pageNumber: 1 },
        },
        {
          identity: "cross_reference:card_type_submitted_eq_selected_submitted",
          status: "RECON_OK",
          stated: netSubmitted,
          computed: netSubmitted,
          delta: 0,
          toleranceBand: 0.01,
          evidence: { section: "SUMMARY BY CARD TYPE", pageNumber: 2 },
        },
        {
          identity: "fee_detail:all_line_items_eq_total_fees",
          status: "RECON_OK",
          stated: totalFees,
          computed: totalFees,
          delta: 0,
          toleranceBand: 0.01,
          evidence: { section: "FEES", pageNumber: 3 },
        },
      ],
    },
  };
}

function evidenceRow(field: string, sourceSection: string, pageNumber: number, lineIndex: number, evidenceLine: unknown, value: number) {
  return { field, sourceSection, pageNumber, lineIndex, evidenceLine: String(evidenceLine), value };
}

function candidate(
  roleCandidate: string,
  label: string,
  amount: number,
  sourceSection: string,
  pageNumber: number,
  evidenceLine: unknown,
  selected: boolean,
) {
  return {
    roleCandidate,
    label,
    amount,
    sourceSection,
    pageNumber,
    evidenceLine: String(evidenceLine),
    selected,
    selectionReason: selected ? "Synthetic authoritative control." : null,
    rejectionReason: selected ? null : "Not selected as the legacy effective-rate denominator.",
    confidence: "high",
  };
}

function feeRow(description: string, amount: number, evidenceLine: unknown, pageNumber: number) {
  return {
    description,
    amount,
    sourceSection: "FEES",
    evidenceLine: String(evidenceLine),
    pageNumber,
    confidence: "high",
    volumeBasis: null,
    count: null,
    rate: null,
  };
}
