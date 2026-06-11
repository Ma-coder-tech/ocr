import {
  exactMoneyToleranceBand,
  makeReconResult,
  makeUnreferencedValueResult,
  round2,
  sumMoneyToleranceBand,
  type ReconciliationResult,
} from "./reconciliation.js";

type FiservProcessorFeeLedgerRow = {
  amount: number;
  bucket: string;
};

type FiservProcessorFeeLedgerControl = {
  label: string;
  bucket: string;
  rowSum: number;
  printedTotal: number | null;
  evidenceLine: string | null;
};

type FiservProcessorFeeLedger = {
  rows: FiservProcessorFeeLedgerRow[];
  controls: FiservProcessorFeeLedgerControl[];
  totalRowSum: number;
  printedTotal: number | null;
  evidenceLine: string | null;
};

type FiservProcessorFundingBatchRow = {
  dateSubmitted: string;
  batchNumber: string | null;
  amountSubmitted: number;
  thirdPartyTransactions: number;
  adjustments: number;
  chargebacks: number;
  feesCharged: number;
  amountFunded: number;
  formulaResult: number;
  evidenceLine: string;
  pageNumber: number | null;
};

type FiservProcessorFundingBatchLedger = {
  rows: FiservProcessorFundingBatchRow[];
  submittedTotal: number | null;
  fundedTotal: number | null;
  feesChargedTotal: number | null;
  controlSubmittedTotal: number | null;
  controlFundedTotal: number | null;
  controlFeesChargedTotal: number | null;
  evidenceLine: string | null;
};

type FiservProcessorReconciliationProfileInput = {
  selectedFinancials: {
    totalVolume: number;
    totalFees: number;
    amountFunded: number;
    thirdPartyTransactions: number | null;
    adjustmentsChargebacks: number | null;
  };
  summarySplit: {
    monthEndCharge: number;
    lessDiscountPaid: number;
  };
  supportingTotals: {
    cardTypeSubmitted: number;
    amountSubmittedSubtotal: number;
  };
  orphanTotals: Array<{
    label: string;
    amount: number;
    sourceSection: string;
    pageNumber: number | null;
    evidenceLine: string;
    nearestReference?: number | null;
  }>;
  feeLedger: FiservProcessorFeeLedger;
  fundingBatchLedger: FiservProcessorFundingBatchLedger;
};

function moneySum(values: number[]): number {
  return round2(values.reduce((sum, value) => sum + value, 0));
}

function isDatedBatchRow(row: FiservProcessorFundingBatchRow): boolean {
  return /^\d{2}\/\d{2}(?:\/\d{2})?$/.test(row.dateSubmitted);
}

export function runFiservProcessorReconciliationProfile(input: FiservProcessorReconciliationProfileInput): ReconciliationResult[] {
  const exactBand = exactMoneyToleranceBand();
  const batchRows = input.fundingBatchLedger.rows;
  const datedBatchRows = batchRows.filter(isDatedBatchRow);
  const feeRows = input.feeLedger.rows;
  const results: ReconciliationResult[] = [];

  const fundingComputed = round2(
    input.selectedFinancials.totalVolume -
      (input.selectedFinancials.thirdPartyTransactions ?? 0) +
      (input.selectedFinancials.adjustmentsChargebacks ?? 0) -
      input.selectedFinancials.totalFees,
  );
  results.push(
    makeReconResult({
      identity: "headline:submitted_minus_third_party_plus_adjustments_minus_fees_eq_funded",
      stated: input.selectedFinancials.amountFunded,
      computed: fundingComputed,
      toleranceBand: exactBand,
      note: "Statement-level funding formula using selected top-line totals.",
      evidence: { section: "SUMMARY", rowLabel: "Total Amount Funded to Your Bank" },
    }),
  );

  results.push(
    makeReconResult({
      identity: "batch_columns:sum_submitted_eq_submitted_total",
      stated: input.fundingBatchLedger.controlSubmittedTotal ?? input.selectedFinancials.totalVolume,
      computed: input.fundingBatchLedger.submittedTotal,
      toleranceBand: sumMoneyToleranceBand(datedBatchRows.length, { cap: 0.25 }),
      note: "Batch submitted column sum checked independently from the headline funding formula.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Total", sourceText: input.fundingBatchLedger.evidenceLine },
    }),
  );

  results.push(
    makeReconResult({
      identity: "batch_columns:sum_funded_eq_funded_total",
      stated: input.fundingBatchLedger.controlFundedTotal ?? input.selectedFinancials.amountFunded,
      computed: input.fundingBatchLedger.fundedTotal,
      toleranceBand: sumMoneyToleranceBand(batchRows.length, { cap: 0.25 }),
      note: "Batch funded column sum checked independently from per-row funding identities.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Total", sourceText: input.fundingBatchLedger.evidenceLine },
    }),
  );

  results.push(
    makeReconResult({
      identity: "batch_columns:sum_fees_plus_month_end_eq_total_fees",
      stated: input.fundingBatchLedger.controlFeesChargedTotal ?? input.selectedFinancials.totalFees,
      computed: input.fundingBatchLedger.feesChargedTotal,
      toleranceBand: sumMoneyToleranceBand(batchRows.length, { cap: 0.25 }),
      note: "This catches daily-fee column breaks even when submitted and funded totals foot.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Total", sourceText: input.fundingBatchLedger.evidenceLine },
    }),
  );

  for (const [index, row] of batchRows.entries()) {
    const impliedFee = round2(row.amountSubmitted - row.thirdPartyTransactions + row.adjustments + row.chargebacks - row.amountFunded);
    results.push(
      makeReconResult({
        identity: `batch_row:${row.dateSubmitted}:${row.batchNumber ?? "month_end"}:funding_formula`,
        stated: row.amountFunded,
        computed: row.formulaResult,
        impliedCorrect: impliedFee,
        toleranceBand: exactBand,
        note:
          row.dateSubmitted === "Month End Charge"
            ? "Month-end charge is modeled as a funding-ledger adjustment row."
            : "Per-batch funding formula checked even when batch column totals reconcile.",
        evidence: {
          section: "SUMMARY BY BATCH",
          pageNumber: row.pageNumber,
          rowLabel: row.dateSubmitted,
          rowIndex: index,
          sourceText: row.evidenceLine,
        },
      }),
    );
  }

  for (const control of input.feeLedger.controls) {
    const controlRowCount = control.bucket === "unknown" ? feeRows.length : feeRows.filter((row) => row.bucket === control.bucket).length;
    results.push(
      makeReconResult({
        identity: `fee_detail:${control.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}:line_sum_eq_printed_total`,
        stated: control.printedTotal,
        computed: control.rowSum,
        toleranceBand: sumMoneyToleranceBand(controlRowCount, { cap: 0.25 }),
        note: "Fee-detail displayed rows are preserved separately from printed control totals.",
        evidence: { section: "FEES CHARGED", rowLabel: control.label, sourceText: control.evidenceLine },
      }),
    );
  }

  results.push(
    makeReconResult({
      identity: "fee_detail:all_line_items_eq_total_fees",
      stated: input.selectedFinancials.totalFees,
      computed: input.feeLedger.totalRowSum,
      toleranceBand: sumMoneyToleranceBand(feeRows.length, { cap: 0.25 }),
      note: "All parsed fee-detail rows compared with the selected all-in fee total.",
      evidence: { section: "FEES CHARGED", rowLabel: "Total (Miscellaneous Fees and Card Fees)", sourceText: input.feeLedger.evidenceLine },
    }),
  );

  results.push(
    makeReconResult({
      identity: "summary_split:month_end_plus_less_discount_eq_total_fees",
      stated: input.selectedFinancials.totalFees,
      computed: round2(input.summarySplit.monthEndCharge + input.summarySplit.lessDiscountPaid),
      toleranceBand: exactBand,
      note: "Summary fee split checked against the all-in fee total.",
      evidence: { section: "SUMMARY", rowLabel: "Fees Charged" },
    }),
  );

  results.push(
    makeReconResult({
      identity: "summary_split:daily_fee_column_eq_less_discount_paid",
      stated: input.summarySplit.lessDiscountPaid,
      computed: moneySum(
        batchRows.some((row) => row.dateSubmitted === "Less Discount Paid")
          ? batchRows.filter((row) => row.dateSubmitted === "Less Discount Paid").map((row) => row.feesCharged)
          : datedBatchRows.map((row) => row.feesCharged),
      ),
      toleranceBand: sumMoneyToleranceBand(datedBatchRows.length, { cap: 0.25 }),
      note: "Independent path to discount-paid fees; uses explicit Less Discount Paid funding row when present, otherwise sums dated batch fee rows.",
      evidence: { section: "SUMMARY BY BATCH", rowLabel: "Fees Charged" },
    }),
  );

  results.push(
    makeReconResult({
      identity: "cross_reference:card_type_submitted_eq_selected_submitted",
      stated: input.selectedFinancials.totalVolume,
      computed: input.supportingTotals.cardTypeSubmitted,
      toleranceBand: exactBand,
      note: "Card-type submitted total cross-checks the selected submitted volume.",
      evidence: { section: "SUMMARY BY CARD TYPE", rowLabel: "Total" },
    }),
  );

  results.push(
    makeReconResult({
      identity: "cross_reference:amounts_submitted_subtotal_eq_selected_submitted",
      stated: input.selectedFinancials.totalVolume,
      computed: input.supportingTotals.amountSubmittedSubtotal,
      toleranceBand: exactBand,
      note: "Amounts Submitted subtotal cross-checks the selected submitted volume.",
      evidence: { section: "AMOUNTS SUBMITTED", rowLabel: "Sub Totals" },
    }),
  );

  for (const orphan of input.orphanTotals) {
    results.push(
      makeUnreferencedValueResult({
        identity: `orphan_total:${orphan.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
        stated: orphan.amount,
        nearestReference: orphan.nearestReference ?? input.selectedFinancials.totalVolume,
        note: "Printed candidate total is visible but not explained by the selected funding, card-type, subtotal, or fee identities.",
        evidence: {
          section: orphan.sourceSection,
          pageNumber: orphan.pageNumber,
          rowLabel: orphan.label,
          sourceText: orphan.evidenceLine,
        },
      }),
    );
  }

  return results;
}
