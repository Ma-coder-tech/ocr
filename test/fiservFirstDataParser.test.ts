import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  parseFiservFirstDataFullStatement,
  parseFiservFirstDataProcessorStatement,
  parseFiservFirstDataShortStatement,
} from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";

const FULL_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "SAMPLE_MERCHANT4_CLOVER.pdf");
const FULL_EXPECTED_PATH = path.resolve(process.cwd(), "data", "fixtures", "fiserv", "first-data-full-oct-2024.expected.json");
const SHORT_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
const SHORT_EXPECTED_PATH = path.resolve(process.cwd(), "data", "fixtures", "fiserv", "first-data-short-june-2024.expected.json");
const PAYSAFE_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_PAYSAFE_Febr_2024.pdf");
const PRIORITY_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf");
const NOVEMBER_FULL_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "Nov_2024_Statement.pdf");
const WELLS_FARGO_FULL_PDF_PATH = path.resolve(
  process.cwd(),
  "test",
  "fixtures",
  "pdfs",
  "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
);
const NXGEN_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf");
const PHILIP_FUTURMARKET_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf");
const ABDUL_BASHER_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_ABDUL_BASHER_Aug_2025.pdf");
const PHILIP_FUTURMARKET_ZERO_VOLUME_PDF_PATH = path.resolve(
  process.cwd(),
  "test",
  "fixtures",
  "pdfs",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
);

describe("Fiserv First Data full statement parser", () => {
  it("extracts selected financials with evidence and reconciliation from the Clover October fixture", async () => {
    const [doc, expectedRaw] = await Promise.all([parsePdf(FULL_PDF_PATH), fs.readFile(FULL_EXPECTED_PATH, "utf8")]);
    const expected = JSON.parse(expectedRaw);

    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(true);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(false);

    const actual = parseFiservFirstDataFullStatement(doc, {
      sourceFileName: expected.statementIdentity.sourceFileName,
    });

    expect(actual.statementIdentity).toEqual(expected.statementIdentity);
    expect(actual.selectedFinancials).toEqual(expected.selectedFinancials);
    expect(actual.feeBreakdown).toEqual(expected.feeBreakdown);
    expect(actual.feeLedger).toEqual(expected.feeLedger);
    expect(actual.fundingBatchLedger).toEqual(expected.fundingBatchLedger);
    expect(actual.interchangeDetail).toEqual(expected.interchangeDetail);
    expect(actual.candidateTotals).toEqual(expected.candidateTotals);
    expect(actual.excludedTotals).toEqual(expected.excludedTotals);
    expect(actual.reconciliation).toEqual(expected.reconciliation);
    expect(actual.decision).toEqual(expected.decision);
    expect(actual.confidence).toEqual(expected.confidence);
    expect(actual.warnings).toEqual(expected.warnings);

    expect(actual.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "totalVolume",
          evidenceLine: "Page | 1 | Total Amount Submitted | $52,460.55",
          value: 52460.55,
        }),
        expect.objectContaining({
          field: "totalFees",
          evidenceLine: "Page | 4 | Fees | -$1,312.55",
          value: 1312.55,
        }),
        expect.objectContaining({
          field: "feeBreakdown",
          evidenceLine: "Total (Service Charges, Interchange Charges/Program Fees, and Fees) | -$1,312.55",
          value: 1312.55,
        }),
      ]),
    );
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled",
      totalRowSum: 1312.55,
      printedTotal: 1312.55,
      delta: 0,
    });
    expect(actual.feeLedger.rows).toHaveLength(134);
    expect(actual.feeLedger.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "TOTAL TRANSACTION FEES",
          rowSum: 1210.89,
          printedTotal: 1210.89,
          status: "reconciled",
        }),
        expect.objectContaining({
          label: "TOTAL DEBIT NETWORK FEES",
          rowSum: 23.63,
          printedTotal: 23.63,
          status: "reconciled",
        }),
        expect.objectContaining({
          label: "TOTAL ACCOUNT FEES",
          rowSum: 78.03,
          printedTotal: 78.03,
          status: "reconciled",
        }),
        expect.objectContaining({
          label: "Total Interchange Charges/Program Fees",
          rowSum: 955.2,
          printedTotal: 955.2,
          status: "reconciled",
        }),
        expect.objectContaining({
          label: "Total Service Charges",
          rowSum: 89.12,
          printedTotal: 89.12,
          status: "reconciled",
        }),
        expect.objectContaining({
          label: "Total Fees",
          rowSum: 268.23,
          printedTotal: 268.23,
          status: "reconciled",
        }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2).toMatchObject({
      version: "2.0",
      normalization: {
        rowCount: 134,
        fuzzyMatchCount: 37,
        aiCandidateCount: 5,
      },
      pricingModel: {
        pricingModel: "interchange_plus",
        confidence: "high",
        analysisStatus: "ic_plus_ready",
      },
      processorMarkupAnalysis: {
        status: "ready",
      },
    });
    expect(actual.fiservFeeAnalysisV2.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feeType: "interchange", amount: 806.59, rows: 68 }),
        expect.objectContaining({ feeType: "card_brand_network", amount: 83.23, rows: 19 }),
        expect.objectContaining({ feeType: "pin_debit_interchange", amount: 20.63, rows: 10 }),
        expect.objectContaining({ feeType: "suspicious_pass_through_like_fee", amount: 57.97, rows: 3 }),
        expect.objectContaining({ feeType: "processor_pct_markup", amount: 81.62, rows: 9 }),
        expect.objectContaining({ feeType: "compliance_penalty", amount: 49.95, rows: 1 }),
        expect.objectContaining({ feeType: "third_party_service", amount: 16.83, rows: 1 }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.interchangeReconciliation).toMatchObject({
      summaryTotal: 955.2,
      detailTableTotal: 806.59,
      gap: 148.61,
      explainedGapTotal: 148.61,
      unexplainedGap: 0,
      status: "explained_structural_difference",
    });
    expect(actual.fiservFeeAnalysisV2.processorMarkupAnalysis).toMatchObject({
      nonAmexSalesDiscountRate: 0.001,
      amexSalesDiscountRate: 0.0055,
      hiddenPctMarkupRows: [
        expect.objectContaining({
          description: "MONTHLY ADVANTAGE FEE MCVDB 0.0003 TIMES $47229.33",
          rate: 0.0003,
          amount: 14.17,
        }),
      ],
    });
    expect(actual.fiservFeeAnalysisV2.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "suspicious_uniform_rate",
          action: "request_pass_through_documentation",
          amount: 42.43,
        }),
        expect.objectContaining({
          kind: "penalty_or_configuration_fee",
          action: "fix_terminal_or_gateway_configuration",
          amount: 49.95,
        }),
        expect.objectContaining({
          kind: "third_party_service_fee",
          action: "verify_third_party_service",
          amount: 16.83,
        }),
        expect.objectContaining({
          kind: "hidden_percentage_markup",
          action: "negotiate_processor_rate",
          amount: 14.17,
        }),
      ]),
    );
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "MASTERCARD",
          description: "MASTERCARD ASSESSMENT FEE 0.0014 TIMES $12147.20",
          type: "Interchange charges",
          amount: 17.01,
          classification: expect.objectContaining({
            economicBucket: "card_brand_pass_through",
            atCostStatus: "indeterminate",
            atCostReasonCode: "NO_REFERENCE_FOR_PERIOD",
            passedThroughAtCostKnown: false,
            costExposure: "itemized",
            comparedValue: 0.0014,
            comparedBasis: "stated_rate",
          }),
        }),
        expect.objectContaining({
          network: "VISA",
          description: "VISA SALES DISCOUNT 0.001 DISC RATE TIMES $8429.68",
          type: "Service charges",
          amount: 8.43,
          classification: expect.objectContaining({
            economicBucket: "processor_controlled_flat_discount_fee",
            atCostStatus: "not_applicable",
            atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
            costExposure: "itemized",
            marginAmountKnown: true,
          }),
        }),
        expect.objectContaining({
          network: null,
          description: "MANAGED SECURITY NON VALIDATED",
          sourceSection: "ACCOUNT FEES",
          amount: 49.95,
          classification: expect.objectContaining({
            economicBucket: "miscellaneous_or_statement_fee",
            atCostStatus: "not_applicable",
            atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
          }),
        }),
      ]),
    );
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated",
      rowCount: 134,
      classifiedRowCount: 134,
      unresolvedRowCount: 0,
      needsUnbundlingRowCount: 0,
      totalClassifiedAmount: 1312.55,
      printedTotal: 1312.55,
      delta: 0,
    });
    expect(actual.pricingModel).toMatchObject({
      pricingModel: "interchange_plus",
      confidence: "high",
      cashDiscountStatus: "not_applicable",
      flatDiscountRate: null,
      evidenceType: "fee_math_inferred",
    });
    expect(actual.pricingModel.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "MASTERCARD ASSESSMENT FEE 0.0014 TIMES $12147.20",
          network: "MASTERCARD",
          volume: 12147.2,
          rate: 0.0014,
          statedFee: 17.01,
          computedFee: 17.01,
          delta: 0,
        }),
        expect.objectContaining({
          description: "VISA ASSESSMENT FEE DB 0.0013 TIMES $25402.79",
          network: "VISA",
          volume: 25402.79,
          rate: 0.0013,
          statedFee: 33.02,
          computedFee: 33.02,
          delta: 0,
        }),
      ]),
    );
    expect(actual.pricingModel.notes).toEqual(
      expect.arrayContaining([expect.stringContaining("does not prove every interchange or assessment row was passed through at cost")]),
    );
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 52,
      anomalyCount: 0,
      submittedTotal: 52460.55,
      fundedTotal: 51148,
      feesChargedTotal: 1312.55,
      controlSubmittedTotal: 52460.55,
      controlFundedTotal: 51148,
      controlFeesChargedTotal: 1312.55,
      submittedDelta: 0,
      fundedDelta: 0,
      feesChargedDelta: 0,
    });
    expect(actual.fundingBatchLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          batchNumber: "858000300742",
          dateSubmitted: "09/30/24",
          amountSubmitted: 922.4,
          amountFunded: 922.4,
          feesCharged: 0,
          status: "pass",
        }),
        expect.objectContaining({
          batchNumber: null,
          dateSubmitted: "Month End Charge",
          amountSubmitted: 0,
          amountFunded: -1312.55,
          feesCharged: 1312.55,
          status: "pass",
        }),
      ]),
    );
  });

  it("extracts selected financials from the short June statement without using the distorted card-type total", async () => {
    const [doc, expectedRaw] = await Promise.all([parsePdf(SHORT_PDF_PATH), fs.readFile(SHORT_EXPECTED_PATH, "utf8")]);
    const expected = JSON.parse(expectedRaw);

    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(false);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(true);

    expect(() => parseFiservFirstDataFullStatement(doc, { sourceFileName: expected.statementIdentity.sourceFileName })).toThrow(
      "Document does not match the Fiserv / First Data full statement layout.",
    );

    const actual = parseFiservFirstDataShortStatement(doc, {
      sourceFileName: expected.statementIdentity.sourceFileName,
    });

    expect(actual.statementIdentity).toEqual(expected.statementIdentity);
    expect(actual.selectedFinancials).toEqual(expected.selectedFinancials);
    expect(actual.feeBreakdown).toEqual(expected.feeBreakdown);
    expect(actual.feeLedger).toEqual(expected.feeLedger);
    expect(actual.fundingBatchLedger).toEqual(expected.fundingBatchLedger);
    expect(actual.interchangeDetail).toEqual(expected.interchangeDetail);
    expect(actual.candidateTotals).toEqual(expected.candidateTotals);
    expect(actual.excludedTotals).toEqual(expected.excludedTotals);
    expect(actual.reconciliation).toEqual(expected.reconciliation);
    expect(actual.reconciliationResults).toEqual(expected.reconciliationResults);
    expect(actual.decision).toEqual(expected.decision);
    expect(actual.confidence).toEqual(expected.confidence);
    expect(actual.warnings).toEqual(expected.warnings);
    expect(actual.evidence).toEqual(expected.evidence);
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled",
      totalRowSum: 141.31,
      printedTotal: 141.31,
      delta: 0,
    });
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "NON SWIPED DISCOUNT $1,450.00 AT .028900 , 4 TRANS AT .100000",
          volumeBasis: 1450,
          count: 4,
          rate: 0.0289,
          amount: 42.31,
          classification: expect.objectContaining({
            economicBucket: "processor_controlled_flat_discount_fee",
            atCostStatus: "unprovable_by_model",
            atCostReasonCode: "FLAT_RATE_PROGRAM",
          }),
        }),
        expect.objectContaining({
          description: "APPLICATION FEE",
          amount: 99,
          classification: expect.objectContaining({
            economicBucket: "miscellaneous_or_statement_fee",
            atCostStatus: "not_applicable",
          }),
        }),
      ]),
    );
    expect(actual.pricingModel).toMatchObject({
      pricingModel: "flat_rate",
      confidence: "low",
      cashDiscountStatus: "not_applicable",
      flatDiscountRate: 0.0289,
      evidenceType: "fee_math_inferred",
    });
    expect(actual.pricingModel.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "NON SWIPED DISCOUNT $1,450.00 AT .028900 , 4 TRANS AT .100000",
          network: "Other",
          volume: 1450,
          rate: 0.0289,
          statedFee: 42.31,
          computedFee: 42.31,
          delta: 0,
        }),
      ]),
    );
    expect(actual.pricingModel.notes).toEqual(expect.arrayContaining([expect.stringContaining("not treated as confirmed cash discount")]));
    expect(actual.fiservFeeAnalysisV2).toMatchObject({
      version: "2.0",
      normalization: {
        rowCount: 2,
        fuzzyMatchCount: 1,
      },
      pricingModel: {
        pricingModel: "flat_rate",
        confidence: "low",
        analysisStatus: "universal_only_pending_model_rules",
      },
      processorMarkupAnalysis: {
        status: "pending_pricing_model_rules",
      },
    });
    expect(actual.fiservFeeAnalysisV2.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "pricing_model_pending_rules",
        }),
      ]),
    );
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 10,
      anomalyCount: 0,
      submittedTotal: 2400,
      fundedTotal: 1058.69,
      feesChargedTotal: 141.31,
      controlSubmittedTotal: 2400,
      controlFundedTotal: 1058.69,
      controlFeesChargedTotal: 141.31,
    });
    expect(actual.decision.validationState).toMatchObject({
      feeLedger: "validated",
      batchLedger: "validated",
      feeClassification: "validated",
      customerFacingTotalsAllowed: true,
      feeLedgerAllowed: true,
      batchDetailAllowed: true,
      feeClassificationAllowed: true,
    });
  });

  it("parses the November full statement variant with plain-text merchant number and expanded fee heading", async () => {
    const doc = await parsePdf(NOVEMBER_FULL_PDF_PATH);

    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(true);

    const actual = parseFiservFirstDataFullStatement(doc, {
      sourceFileName: "Nov_2024_Statement.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Clover",
      statementFamily: "fiserv_first_data_full_statement",
      merchantName: "PEPES MEXICAN RESTURANT",
      merchantNumber: "526361338886",
      statementPeriodStart: "2024-11-01",
      statementPeriodEnd: "2024-11-30",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 53291.02,
      totalFees: 1330.96,
      amountFunded: 51960.06,
      effectiveRate: 0.02497531,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: 0,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled",
      totalRowSum: 1330.96,
      printedTotal: 1330.96,
      delta: 0,
    });
    expect(actual.feeLedger.rows).toHaveLength(134);
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled_with_warnings",
      rowCount: 38,
      submittedTotal: 53261.75,
      controlSubmittedTotal: 53261.75,
      controlFundedTotal: 51960.06,
      controlFeesChargedTotal: 1330.96,
    });
    expect(actual.decision).toMatchObject({
      status: "needs_review",
      reportable: false,
    });
  });

  it("routes Wells Fargo-branded First Data full statements by structure instead of bank logo", async () => {
    const doc = await parsePdf(WELLS_FARGO_FULL_PDF_PATH);

    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(true);
    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(false);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(false);

    const actual = parseFiservFirstDataFullStatement(doc, {
      sourceFileName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Wells Fargo",
      processorFamily: "Fiserv / First Data",
      statementFamily: "fiserv_first_data_full_statement",
      merchantName: "EL NUEVO TEQUILA MEXICAN",
      merchantNumber: "324136827999",
      statementPeriodStart: "2024-09-01",
      statementPeriodEnd: "2024-09-30",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 177400.72,
      totalFees: 2954.38,
      amountFunded: 174445.26,
      effectiveRate: 0.01665371,
      adjustmentsChargebacks: -1.08,
      thirdPartyTransactions: 0,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled",
      totalRowSum: 2954.38,
      printedTotal: 2954.38,
      delta: 0,
    });
    expect(actual.feeLedger.rows).toHaveLength(104);
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      unresolvedRowCount: 0,
    });
    expect(actual.feeLedger.feeClassificationSummary.residualAnalysis).toMatchObject({
      knownProcessorFeeAmount: 600.61,
      markupOrUnknownPoolAmount: 600.61,
      residualUnclassifiedAmount: 0,
    });
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 32,
      anomalyCount: 0,
      submittedTotal: 177400.72,
      feesChargedTotal: 2954.38,
      fundedTotal: 174445.26,
      submittedDelta: 0,
      fundedDelta: 0,
      feesChargedDelta: 0,
    });
    expect(actual.fiservFeeAnalysisV2).toMatchObject({
      version: "2.0",
      normalization: {
        rowCount: 104,
        aiCandidateCount: 4,
      },
      pricingModel: {
        pricingModel: "interchange_plus",
        confidence: "high",
        analysisStatus: "ic_plus_ready",
      },
      processorMarkupAnalysis: {
        status: "ready",
        processorControlledTotal: 526.48,
        processorPctMarkupTotal: 0,
        processorPerItemTotal: 488.03,
        junkFeeTotal: 35.95,
      },
      authorizationAnalysis: {
        status: "ready",
        authorizationCount: 4244,
        authRatio: 1.03,
        estimatedExcessAuthCost: 0,
      },
      perAuthBenchmarkAnalysis: {
        status: "ready",
        currentRate: 0.11,
        competitiveLow: 0.05,
        competitiveHigh: 0.07,
        monthlySavings: 169.76,
        annualSavings: 2037.12,
        dominant: true,
      },
      effectiveRateBenchmarkAnalysis: {
        categoryId: "restaurant",
        verdict: "below_range",
      },
    });
    expect(actual.fiservFeeAnalysisV2.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "DISCOVER DUES/ASSESSMENT FEE 0.0014 TIMES $2094.14",
          feeType: "card_brand_network",
          proofStatus: "likely",
          referenceRate: 0.0014,
          rateComparison: "matches_reference",
          amount: 2.93,
        }),
        expect.objectContaining({
          description: "DISCOVER WATS AUTH FEE 62 TRANSACTIONS AT 0.11",
          feeType: "processor_per_item",
          amount: 6.82,
        }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "authorization_ratio_healthy",
        }),
        expect.objectContaining({
          kind: "per_auth_fee_benchmark",
          amount: 466.84,
        }),
        expect.objectContaining({
          kind: "effective_rate_positive_benchmark",
        }),
        expect.objectContaining({
          kind: "junk_fixed_fee_summary",
          amount: 35.95,
        }),
        expect.objectContaining({
          kind: "penalty_or_configuration_fee",
          amount: 0.1,
        }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.merchantChannelAnalysis).toMatchObject({
      merchantChannel: "mixed",
      confidence: "high",
    });
    expect(actual.decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
    });
    expect(actual.warnings.map((warning: any) => warning.code)).not.toContain("filename_period_mismatch");
  });

  it("models Paysafe as a Fiserv processor-branded statement with fee ledger and batch funding anomalies", async () => {
    const doc = await parsePdf(PAYSAFE_PDF_PATH);

    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(true);
    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(false);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(false);

    const actual = parseFiservFirstDataProcessorStatement(doc, {
      sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Paysafe Payment Processing",
      statementFamily: "fiserv_first_data_processor_statement",
      merchantName: "M P PAINTING LLC",
      merchantNumber: "4223 698701145467",
      statementPeriodStart: "2024-02-01",
      statementPeriodEnd: "2024-02-29",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 36912.94,
      totalFees: 1565.73,
      amountFunded: 35347.21,
      effectiveRate: 0.04241683,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: 0,
    });

    expect(actual.candidateTotals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Amounts Submitted",
          amount: 36912.94,
          selected: true,
        }),
        expect.objectContaining({
          label: "Generic Amounts Submitted Total",
          amount: 38758.59,
          selected: false,
        }),
      ]),
    );
    expect(actual.excludedTotals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 38758.59,
          excludedFrom: "totalVolume",
        }),
      ]),
    );

    expect(actual.feeLedger).toMatchObject({
      status: "reconciled_with_rounding_delta",
      totalRowSum: 1565.71,
      printedTotal: 1565.73,
      delta: 0.02,
    });
    expect(actual.feeLedger.rows).toHaveLength(28);
    expect(actual.feeLedger.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Total Card Fees",
          rowSum: 1542.26,
          printedTotal: 1542.28,
          delta: 0.02,
          status: "reconciled_with_rounding_delta",
        }),
        expect.objectContaining({
          label: "Total Miscellaneous Fees",
          rowSum: 23.45,
          printedTotal: 23.45,
          delta: 0,
          status: "reconciled",
        }),
      ]),
    );
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "MASTERCARD",
          description: "MQUAL DISC",
          amount: 205.59,
          classification: expect.objectContaining({
            economicBucket: "processor_controlled_tiered_fee",
            atCostStatus: "unprovable_by_model",
            atCostReasonCode: "BLENDED_TIERED_BUCKET",
            costExposure: "blended",
            needsUnbundling: true,
            effectiveRatePct: 3.4,
          }),
        }),
        expect.objectContaining({
          network: "VS OFLN DB",
          description: "NQUAL DISC",
          amount: 468.73,
          classification: expect.objectContaining({
            economicBucket: "processor_controlled_tiered_fee",
            atCostStatus: "unprovable_by_model",
            atCostReasonCode: "BLENDED_TIERED_BUCKET",
            costExposure: "blended",
            needsUnbundling: true,
            effectiveRatePct: 6,
          }),
        }),
        expect.objectContaining({
          network: "VISA",
          description: "CR DUES AND ASSESS",
          amount: 21.06,
          classification: expect.objectContaining({
            economicBucket: "card_brand_pass_through",
            atCostStatus: "indeterminate",
            atCostReasonCode: "NO_REFERENCE_FOR_PERIOD",
            passedThroughAtCostKnown: false,
            costExposure: "itemized",
          }),
        }),
        expect.objectContaining({
          network: "VS OFLN DB",
          description: "OTHER ITEM FEES",
          amount: 0.4,
          bucket: "cardFees",
          classification: expect.objectContaining({
            economicBucket: "processor_transaction_or_auth",
            atCostStatus: "not_applicable",
            atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
          }),
        }),
        expect.objectContaining({
          description: "BATCH HEADER",
          amount: 6.4,
          bucket: "miscellaneousFees",
          classification: expect.objectContaining({
            economicBucket: "processor_transaction_or_auth",
            atCostStatus: "not_applicable",
            atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
          }),
        }),
        expect.objectContaining({
          description: "**ADDITIONAL FEES",
          amount: 9.48,
          bucket: "miscellaneousFees",
          classification: expect.objectContaining({
            economicBucket: "unknown_needs_review",
            atCostStatus: "indeterminate",
            atCostReasonCode: "BASE_UNKNOWN",
            costExposure: "hidden",
          }),
        }),
      ]),
    );
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated_with_unresolved_rows",
      rowCount: 28,
      classifiedRowCount: 28,
      unresolvedRowCount: 1,
      needsUnbundlingRowCount: 4,
      totalClassifiedAmount: 1565.71,
      printedTotal: 1565.73,
      delta: 0.02,
    });
    expect(actual.feeLedger.feeClassificationSummary.bucketTotals).toEqual(
      expect.arrayContaining([
        { economicBucket: "processor_controlled_tiered_fee", amount: 1458.15, rowCount: 4 },
        { economicBucket: "card_brand_pass_through", amount: 61.18, rowCount: 10 },
        { economicBucket: "processor_transaction_or_auth", amount: 29.33, rowCount: 6 },
        { economicBucket: "unknown_needs_review", amount: 9.48, rowCount: 1 },
        { economicBucket: "miscellaneous_or_statement_fee", amount: 7.57, rowCount: 1 },
        { economicBucket: "zero_amount_no_charge", amount: 0, rowCount: 6 },
      ]),
    );
    expect(actual.pricingModel).toMatchObject({
      pricingModel: "tiered_pricing",
      confidence: "high",
      cashDiscountStatus: "not_applicable",
      flatDiscountRate: null,
      evidenceType: "fee_math_inferred",
    });
    expect(actual.pricingModel.evidence).toHaveLength(4);
    expect(actual.pricingModel.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "MQUAL DISC",
          network: "MASTERCARD",
          volume: 6046.7,
          statedFee: 205.59,
          computedFee: 205.59,
          delta: 0,
        }),
        expect.objectContaining({
          description: "NQUAL DISC",
          network: "VS OFLN DB",
          volume: 7812.27,
          statedFee: 468.73,
          computedFee: 468.73,
          delta: 0,
        }),
      ]),
    );
    expect(actual.pricingModel.evidence.find((row: any) => row.description === "MQUAL DISC" && row.network === "MASTERCARD")?.rate).toBeCloseTo(0.034, 5);
    expect(actual.pricingModel.evidence.find((row: any) => row.description === "NQUAL DISC" && row.network === "VS OFLN DB")?.rate).toBeCloseTo(0.06, 5);
    expect(actual.pricingModel.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("processor-controlled blended fees"),
        expect.stringContaining("structurally unprovable at cost"),
      ]),
    );

    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled_with_warnings",
      rowCount: 18,
      controlSubmittedTotal: 36912.94,
      controlFundedTotal: 35347.21,
      controlFeesChargedTotal: 1565.73,
      submittedDelta: 0,
      fundedDelta: -0.01,
    });
    const feb27 = actual.fundingBatchLedger.rows.find((row: any) => row.dateSubmitted === "02/27/24");
    expect(feb27).toMatchObject({
      batchNumber: "98056271397",
      amountSubmitted: 2410.94,
      feesCharged: 48.22,
      amountFunded: 2344.1,
      formulaResult: 2362.72,
      delta: -18.62,
      status: "fail",
    });

    expect(actual.reconciliation.fundingFormula.status).toBe("pass");
    expect(actual.reconciliation.feeBucketFormula.status).toBe("pass");
    expect(actual.reconciliationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identity: "headline:submitted_minus_third_party_plus_adjustments_minus_fees_eq_funded",
          status: "RECON_OK",
          stated: 35347.21,
          computed: 35347.21,
          delta: 0,
        }),
        expect.objectContaining({
          identity: "fee_detail:all_line_items_eq_total_fees",
          status: "RECON_ROUNDING",
          stated: 1565.73,
          computed: 1565.71,
          delta: 0.02,
        }),
        expect.objectContaining({
          identity: "batch_row:02/27/24:98056271397:funding_formula",
          status: "RECON_MATERIAL_BREAK",
          stated: 2344.1,
          computed: 2362.72,
          delta: -18.62,
          impliedCorrect: 66.84,
        }),
        expect.objectContaining({
          identity: "summary_split:daily_fee_column_eq_less_discount_paid",
          status: "RECON_MATERIAL_BREAK",
          stated: 1023.35,
          computed: 1004.75,
          delta: 18.6,
        }),
        expect.objectContaining({
          identity: "orphan_total:generic_amounts_submitted_total",
          status: "RECON_UNREFERENCED_VALUE",
          stated: 38758.59,
          computed: 36912.94,
          delta: 1845.65,
        }),
      ]),
    );
    expect(actual.decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        topLevelTotals: "validated",
        feeLedger: "validated_with_rounding",
        batchLedger: "failed",
        feeClassification: "warning",
        orphanTotals: "present",
        customerFacingTotalsAllowed: true,
        feeLedgerAllowed: true,
        batchDetailAllowed: false,
        feeClassificationAllowed: false,
        blockingReasons: [],
      },
    });
    expect(actual.decision.validationState.warningReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("batch_row:02/27/24:98056271397:funding_formula"),
        expect.stringContaining("orphan_total:generic_amounts_submitted_total"),
        expect.stringContaining("fee_detail:all_line_items_eq_total_fees"),
      ]),
    );
    expect(actual.warnings.map((warning: any) => warning.code)).toEqual(
      expect.arrayContaining(["unreconciled_generic_total_excluded", "fee_ledger_rounding_delta", "batch_funding_row_anomaly"]),
    );
  });

  it("accepts a processor-branded Paysafe variant with compact formula text and abbreviated misc fee labels", async () => {
    const doc = await parsePdf(PHILIP_FUTURMARKET_PDF_PATH);

    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(true);
    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(false);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(false);

    const actual = fiservFirstDataProcessorStatementDriver.parse(doc, {
      sourceFileName: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Paysafe Payment Processing",
      statementFamily: "fiserv_first_data_processor_statement",
      merchantName: "PHILIP FUTUREMARKET LLC",
      merchantNumber: "4228993800141883",
      statementPeriodStart: "2025-10-01",
      statementPeriodEnd: "2025-10-31",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 8010.7,
      totalFees: 378.55,
      amountFunded: 7632.15,
      effectiveRate: 0.04725555,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: 0,
    });
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 10,
      anomalyCount: 0,
      submittedTotal: 8010.7,
      feesChargedTotal: 378.55,
      fundedTotal: 7632.15,
      submittedDelta: 0,
      feesChargedDelta: 0,
      fundedDelta: 0,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled_with_rounding_delta",
      totalRowSum: 378.54,
      printedTotal: 378.55,
      delta: 0.01,
    });
    expect(actual.feeLedger.rows).toHaveLength(50);
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "VISA",
          description: "DISC 6",
          amount: 0,
          evidenceLine: "0044464510/31/25 | CF | DISC 6 | 0.01990 | 0.00",
        }),
      ]),
    );
    expect(actual.feeLedger.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Total (Miscellaneous Fees and Card Fees)",
          printedTotal: 378.55,
          evidenceLine: "Total (Misc Fees and Card Fees) | -$378.55",
          status: "reconciled_with_rounding_delta",
        }),
      ]),
    );
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated_with_unresolved_rows",
      rowCount: 50,
      unresolvedRowCount: 9,
      needsUnbundlingRowCount: 4,
      totalClassifiedAmount: 378.54,
      printedTotal: 378.55,
      delta: 0.01,
    });
    expect(actual.pricingModel).toMatchObject({
      pricingModel: "tiered_pricing",
      confidence: "high",
      cashDiscountStatus: "not_applicable",
    });
    expect(actual.decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        topLevelTotals: "validated",
        feeLedger: "validated_with_rounding",
        batchLedger: "validated",
        customerFacingTotalsAllowed: true,
        feeLedgerAllowed: true,
        batchDetailAllowed: true,
        feeClassificationAllowed: false,
      },
    });
  });

  it("accepts a processor-branded monthly-fee-only statement with zero submitted volume", async () => {
    const doc = await parsePdf(PHILIP_FUTURMARKET_ZERO_VOLUME_PDF_PATH);

    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(true);
    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(false);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(false);

    const actual = parseFiservFirstDataProcessorStatement(doc, {
      sourceFileName: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Paysafe Payment Processing",
      statementFamily: "fiserv_first_data_processor_statement",
      merchantName: "PHILIP FUTUREMARKET LLC",
      merchantNumber: "4228993800141883",
      statementPeriodStart: "2025-09-01",
      statementPeriodEnd: "2025-09-30",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 0,
      totalFees: 44.9,
      amountFunded: -44.9,
      effectiveRate: 0,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: 0,
      transactionCount: {
        primaryTransactionCount: 0,
      },
    });
    expect(actual.reconciliation).toMatchObject({
      fundingFormula: {
        status: "pass",
        expected: -44.9,
        actual: -44.9,
      },
      feeBucketFormula: {
        status: "pass",
        expected: 44.9,
        actual: 44.9,
      },
      effectiveRateFormula: {
        status: "not_applicable",
        expected: null,
        actual: null,
      },
      supportingVolumeAgreement: {
        status: "pass",
        expected: 0,
        actual: 0,
      },
    });
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 1,
      submittedTotal: 0,
      fundedTotal: -44.9,
      feesChargedTotal: 44.9,
      controlSubmittedTotal: 0,
      controlFundedTotal: -44.9,
      controlFeesChargedTotal: 44.9,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled",
      totalRowSum: 44.9,
      printedTotal: 44.9,
      delta: 0,
    });
    expect(actual.feeLedger.rows).toHaveLength(6);
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated_with_unresolved_rows",
      rowCount: 6,
      unresolvedRowCount: 5,
      needsUnbundlingRowCount: 0,
      totalClassifiedAmount: 44.9,
      printedTotal: 44.9,
      delta: 0,
    });
    expect(actual.decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        topLevelTotals: "validated",
        feeLedger: "validated",
        batchLedger: "validated",
        customerFacingTotalsAllowed: true,
        feeLedgerAllowed: true,
        batchDetailAllowed: true,
        feeClassificationAllowed: false,
      },
    });
    expect(actual.warnings.map((warning: any) => warning.code)).toEqual(["zero_volume_effective_rate_not_applicable"]);
  });

  it("parses NXGEN as a processor-branded Fiserv statement when the merchant name has no legal suffix", async () => {
    const doc = await parsePdf(NXGEN_PDF_PATH);

    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(true);

    const actual = parseFiservFirstDataProcessorStatement(doc, {
      sourceFileName: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Nxgen Payment Services",
      statementFamily: "fiserv_first_data_processor_statement",
      merchantName: "VORTAX",
      merchantNumber: "5347 0178 0303111",
      statementPeriodStart: "2022-09-01",
      statementPeriodEnd: "2022-09-30",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 42638.08,
      totalFees: 2007.73,
      amountFunded: 40842.11,
      effectiveRate: 0.04708772,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: 211.76,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled_with_rounding_delta",
      totalRowSum: 2007.71,
      printedTotal: 2007.73,
      delta: 0.02,
    });
    expect(actual.feeLedger.rows).toHaveLength(67);
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled_with_warnings",
      rowCount: 43,
      controlSubmittedTotal: 42638.08,
      controlFundedTotal: 40842.11,
      controlFeesChargedTotal: 2007.73,
    });
    expect(actual.fundingBatchLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dateSubmitted: "08/25/22",
          batchNumber: "090422MOADJ",
          amountSubmitted: 0,
          thirdPartyTransactions: 0,
          adjustments: -249.99,
          feesCharged: 0,
          amountFunded: -249.99,
          formulaResult: -249.99,
          status: "pass",
        }),
      ]),
    );
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated_with_rounding_delta",
      rowCount: 67,
      classifiedRowCount: 67,
      unresolvedRowCount: 0,
      needsUnbundlingRowCount: 0,
      totalClassifiedAmount: 2007.71,
      printedTotal: 2007.73,
      delta: 0.02,
    });
    expect(actual.feeLedger.feeClassificationSummary.bucketTotals).toEqual(
      expect.arrayContaining([
        { economicBucket: "card_brand_pass_through", amount: 899.98, rowCount: 38 },
        { economicBucket: "processor_controlled_flat_discount_fee", amount: 652.48, rowCount: 6 },
        { economicBucket: "miscellaneous_or_statement_fee", amount: 375.61, rowCount: 6 },
        { economicBucket: "processor_transaction_or_auth", amount: 79.64, rowCount: 11 },
        { economicBucket: "zero_amount_no_charge", amount: 0, rowCount: 6 },
      ]),
    );
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "MASTERCARD",
          description: "INTERCHANGE",
          amount: 259.91,
          classification: expect.objectContaining({
            economicBucket: "card_brand_pass_through",
            atCostStatus: "unprovable_by_line",
            atCostReasonCode: "LUMP_LINE_NOT_DECOMPOSABLE",
            passedThroughAtCostKnown: false,
          }),
        }),
        expect.objectContaining({
          network: "MASTERCARD",
          description: "DUES & ASSESSMENTS",
          amount: 14.47,
          classification: expect.objectContaining({
            economicBucket: "card_brand_pass_through",
            atCostStatus: "indeterminate",
            atCostReasonCode: "NO_REFERENCE_FOR_PERIOD",
            passedThroughAtCostKnown: false,
          }),
        }),
        expect.objectContaining({
          network: "MASTERCARD",
          description: "ECI CPU-G",
          amount: 17.75,
          classification: expect.objectContaining({
            economicBucket: "processor_transaction_or_auth",
            atCostStatus: "not_applicable",
            atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
          }),
        }),
        expect.objectContaining({
          description: "PCI MONTHLY FEE",
          amount: 7.99,
          classification: expect.objectContaining({
            economicBucket: "miscellaneous_or_statement_fee",
            atCostStatus: "not_applicable",
            atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
          }),
        }),
      ]),
    );
    expect(actual.pricingModel).toMatchObject({
      pricingModel: "flat_discount_pricing",
      confidence: "high",
      cashDiscountStatus: "not_confirmed",
      flatDiscountRate: 0.015,
    });
    expect(actual.decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        feeClassification: "validated_with_rounding",
        feeClassificationAllowed: true,
      },
    });
  });

  it("models Priority Payment Systems as a Fiserv flat-discount statement without confirming cash discount", async () => {
    const doc = await parsePdf(PRIORITY_PDF_PATH);

    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(true);
    expect(fiservFirstDataFullStatementDriver.supports(doc)).toBe(false);
    expect(fiservFirstDataShortStatementDriver.supports(doc)).toBe(false);

    const actual = fiservFirstDataProcessorStatementDriver.parse(doc, {
      sourceFileName: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Priority Payment Systems",
      statementFamily: "fiserv_first_data_processor_statement",
      merchantName: "JAMAICA FISH MARKET, INC",
      merchantNumber: "5544 0200 0609669",
      statementPeriodStart: "2024-12-01",
      statementPeriodEnd: "2024-12-31",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 80591.44,
      totalFees: 3082.82,
      amountFunded: 77502.62,
      effectiveRate: 0.03825245,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: -6,
    });
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 34,
      anomalyCount: 0,
      submittedTotal: 80591.44,
      feesChargedTotal: 3082.82,
      fundedTotal: 77502.62,
      submittedDelta: 0,
      feesChargedDelta: 0,
      fundedDelta: 0,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled",
      totalRowSum: 3082.82,
      printedTotal: 3082.82,
      delta: 0,
    });
    expect(actual.feeLedger.rows).toHaveLength(14);
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated",
      rowCount: 14,
      classifiedRowCount: 14,
      unresolvedRowCount: 0,
      needsUnbundlingRowCount: 0,
      totalClassifiedAmount: 3082.82,
      printedTotal: 3082.82,
      delta: 0,
    });
    expect(actual.feeLedger.feeClassificationSummary.bucketTotals).toEqual(
      expect.arrayContaining([
        { economicBucket: "processor_controlled_flat_discount_fee", amount: 3062.82, rowCount: 6 },
        { economicBucket: "miscellaneous_or_statement_fee", amount: 20, rowCount: 2 },
        { economicBucket: "zero_amount_no_charge", amount: 0, rowCount: 6 },
      ]),
    );
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "QUAL DISC",
          network: "VISA",
          classification: expect.objectContaining({
            economicBucket: "processor_controlled_flat_discount_fee",
            atCostStatus: "unprovable_by_model",
            atCostReasonCode: "FLAT_RATE_PROGRAM",
            costExposure: "flat",
            passedThroughAtCostKnown: false,
          }),
        }),
      ]),
    );
    expect(actual.pricingModel).toMatchObject({
      pricingModel: "flat_discount_pricing",
      confidence: "high",
      cashDiscountStatus: "not_confirmed",
      flatDiscountRate: 0.038,
      evidenceType: "fee_math_inferred",
    });
    expect(actual.pricingModel.evidence).toHaveLength(6);
    expect(actual.pricingModel.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "QUAL DISC",
          network: "VISA",
          volume: 16465.34,
          rate: 0.038,
          statedFee: 625.68,
          computedFee: 625.68,
          delta: 0,
        }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2).toMatchObject({
      pricingModel: {
        pricingModel: "single_tier_qualified",
        confidence: "high",
        analysisStatus: "universal_only_pending_model_rules",
      },
      bundledPricingBenchmark: {
        status: "ready",
        benchmarkMode: "bundled_estimate",
        businessCategory: {
          id: "grocery_specialty_food",
          source: "merchant_name_inference",
          confidence: "medium",
        },
        volumeTier: "500k_2m",
        effectiveRate: 0.03825245,
        adjustedBenchmarkRate: {
          low: 0.0165,
          high: 0.0215,
        },
        estimatedPassThroughCost: {
          low: 859.63,
          high: 1160.03,
        },
        estimatedProcessorMargin: {
          low: 1922.79,
          high: 2223.19,
        },
        estimatedCompetitiveCost: {
          low: 1078.04,
          high: 1393.44,
        },
        estimatedAnnualSavings: {
          low: 20272.56,
          high: 24057.36,
        },
        confidence: "medium",
        unusedTierRows: 6,
        billbackRisk: true,
      },
      savingsSummary: {
        annualLow: 36488.81,
        annualHigh: 40318.61,
        opportunities: 3,
      },
    });
    expect(actual.fiservFeeAnalysisV2.bundledPricingBenchmark.cardMix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardType: "visa_debit", volume: 31717.94, pctOfVolume: 39.36 }),
        expect.objectContaining({ cardType: "visa_credit", volume: 16465.34, pctOfVolume: 20.43 }),
        expect.objectContaining({ cardType: "amex", volume: 6103.48, pctOfVolume: 7.57 }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "bundled_effective_rate_above_benchmark",
          severity: "high",
          action: "request_interchange_plus_quote",
        }),
        expect.objectContaining({
          kind: "bundled_pricing_savings_opportunity",
          savingsEstimate: {
            low: 20272.56,
            high: 24057.36,
            basis: "Estimated annual savings from bundled-pricing benchmark model. Not pass-through proof.",
          },
        }),
        expect.objectContaining({
          kind: "single_tier_qualified_structure",
          action: "request_pass_through_documentation",
        }),
      ]),
    );
    expect(actual.interchangeDetail).toMatchObject({
      available: false,
      rowsStatus: "not_present_in_processor_branded_statement",
    });
    expect(actual.reconciliationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identity: "headline:submitted_minus_third_party_plus_adjustments_minus_fees_eq_funded",
          status: "RECON_OK",
          stated: 77502.62,
          computed: 77502.62,
          delta: 0,
        }),
        expect.objectContaining({
          identity: "fee_detail:all_line_items_eq_total_fees",
          status: "RECON_OK",
          stated: 3082.82,
          computed: 3082.82,
          delta: 0,
        }),
        expect.objectContaining({
          identity: "summary_split:daily_fee_column_eq_less_discount_paid",
          status: "RECON_OK",
          stated: 3062.82,
          computed: 3062.82,
          delta: 0,
        }),
      ]),
    );
    expect(actual.excludedTotals).toEqual([]);
    expect(actual.warnings).toEqual([]);
    expect(actual.decision).toMatchObject({
      status: "accepted",
      reportable: true,
      validationState: {
        topLevelTotals: "validated",
        feeLedger: "validated",
        batchLedger: "validated",
        feeClassification: "validated",
        orphanTotals: "none",
        customerFacingTotalsAllowed: true,
        feeLedgerAllowed: true,
        batchDetailAllowed: true,
        feeClassificationAllowed: true,
        blockingReasons: [],
        warningReasons: [],
      },
    });
  });

  it("accepts processor-branded statements where Month End Charge accounts for all fees and Less Discount Paid is absent", async () => {
    const doc = await parsePdf(ABDUL_BASHER_PDF_PATH);

    expect(fiservFirstDataProcessorStatementDriver.supports(doc)).toBe(true);

    const actual = parseFiservFirstDataProcessorStatement(doc, {
      sourceFileName: "fiserv_ABDUL_BASHER_Aug_2025.pdf",
    }) as any;

    expect(actual.statementIdentity).toMatchObject({
      visibleBrand: "Merchant One",
      statementFamily: "fiserv_first_data_processor_statement",
      merchantName: "XPRESS FIX",
      merchantNumber: "5189934211169970",
      statementPeriodStart: "2025-08-01",
      statementPeriodEnd: "2025-08-31",
    });
    expect(actual.selectedFinancials).toMatchObject({
      totalVolume: 2712.11,
      totalFees: 91.19,
      amountFunded: 2620.92,
      effectiveRate: 0.03362327,
      thirdPartyTransactions: 0,
      adjustmentsChargebacks: 0,
    });
    expect(actual.feeBreakdown.buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Month End Charge",
          amount: 91.19,
          evidenceLine: "Month End Charge | 0.00 | 0.00 | 0.00 | -$91.19 | -$91.19",
        }),
        expect.objectContaining({
          label: "Less Discount Paid",
          amount: 0,
          evidenceLine: "No Less Discount Paid row; Month End Charge equals statement-level Fees Charged, so daily discount-paid fees are $0.00.",
        }),
      ]),
    );
    expect(actual.reconciliation).toMatchObject({
      fundingFormula: {
        status: "pass",
        expected: 2620.92,
        actual: 2620.92,
      },
      feeBucketFormula: {
        status: "pass",
        expected: 91.19,
        actual: 91.19,
        explanation: "91.19 + 0.00 = 91.19",
      },
    });
    expect(actual.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 21,
      anomalyCount: 0,
      submittedTotal: 2712.11,
      feesChargedTotal: 91.19,
      fundedTotal: 2620.92,
    });
    expect(actual.feeLedger).toMatchObject({
      status: "reconciled_with_rounding_delta",
      totalRowSum: 91.2,
      printedTotal: 91.19,
      delta: -0.01,
    });
    expect(actual.feeLedger.feeClassificationSummary).toMatchObject({
      status: "validated_with_rounding_delta",
      rowCount: 51,
      classifiedRowCount: 51,
      unresolvedRowCount: 0,
      needsUnbundlingRowCount: 0,
      totalClassifiedAmount: 91.2,
      printedTotal: 91.19,
      delta: -0.01,
    });
    expect(actual.feeLedger.feeClassificationSummary.bucketTotals).toEqual([
      { economicBucket: "card_brand_pass_through", amount: 43.74, rowCount: 29 },
      { economicBucket: "processor_transaction_or_auth", amount: 27.9, rowCount: 12 },
      { economicBucket: "miscellaneous_or_statement_fee", amount: 13.95, rowCount: 2 },
      { economicBucket: "processor_controlled_flat_discount_fee", amount: 5.61, rowCount: 7 },
      { economicBucket: "zero_amount_no_charge", amount: 0, rowCount: 1 },
    ]);
    expect(actual.fiservFeeAnalysisV2).toMatchObject({
      version: "2.0",
      normalization: {
        rowCount: 51,
        exactMatchCount: 50,
        fuzzyMatchCount: 0,
        aiCandidateCount: 0,
        unmatchedCount: 1,
      },
      pricingModel: {
        pricingModel: "interchange_plus",
        confidence: "high",
        analysisStatus: "ic_plus_ready",
      },
      rateVerification: {
        proven: 6,
        likely: 2,
        processorControlled: 21,
        indeterminate: 20,
        notEnoughDetail: 2,
      },
      processorMarkupAnalysis: {
        status: "ready",
        processorControlledTotal: 47.46,
        processorMarkupRate: 0.01749929,
        processorPctMarkupTotal: 5.61,
        processorPerItemTotal: 27.9,
        processorFixedTotal: 13.95,
        junkFeeTotal: 13.95,
        perItemStacking: {
          detected: true,
          fees: ["OTHER ITEM FEES ($0.10)", "CPU GTWY ($0.10)", "SALES ITEMS ($0.10)"],
          totalPerItem: 0.3,
          perItemAsPctOfAverageTicket: 0.00707936,
        },
      },
      reconciliation: {
        basisTotal: 91.19,
        rowTotal: 91.2,
        residual: 0.01,
        status: "pass",
      },
    });
    expect(actual.fiservFeeAnalysisV2.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feeLabel: "STAR PIN DEBIT NETWORK ANNUAL FEE",
          newValue: expect.objectContaining({ value: 20.95, cadence: "annual" }),
          deltaValue: expect.objectContaining({ value: 2 }),
          effectiveDate: "October 2025 statement",
          disclosureStyle: "acceptance_by_use",
        }),
        expect.objectContaining({
          feeLabel: "ACCEL PIN DEBIT NETWORK ANNUAL FEE",
          newValue: expect.objectContaining({ value: 21.95, cadence: "annual" }),
          deltaValue: expect.objectContaining({ value: 2 }),
          effectiveDate: "October 2025 statement",
          disclosureStyle: "acceptance_by_use",
        }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.buckets).toEqual(
      expect.arrayContaining([
        { feeType: "interchange", amount: 35.94, rows: 6, pctOfFees: 39.41 },
        { feeType: "card_brand_network", amount: 7.8, rows: 23, pctOfFees: 8.55 },
        { feeType: "processor_pct_markup", amount: 5.61, rows: 7, pctOfFees: 6.15 },
        { feeType: "processor_per_item", amount: 27.9, rows: 12, pctOfFees: 30.6 },
        { feeType: "processor_fixed", amount: 13.95, rows: 2, pctOfFees: 15.3 },
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "rate_exceeds_reference",
          title: "AMEX ACQR TRANSACTION FEE exceeds the reference rate",
        }),
        expect.objectContaining({
          kind: "processor_per_item_stacking",
          title: "Multiple processor per-item fees are stacked",
          amount: 27.9,
        }),
        expect.objectContaining({
          kind: "junk_fee",
          title: "REGULATORY PRODUCT is avoidable or negotiable",
          amount: 3.95,
        }),
        expect.objectContaining({
          kind: "junk_fixed_fee_summary",
          amount: 13.95,
        }),
      ]),
    );
    expect(actual.fiservFeeAnalysisV2.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardTypeSection: "AMEXCT043",
          description: "AMEX ACQR TRANSACTION FEE",
          proofStatus: "indeterminate",
          rateComparison: "above_reference",
          referenceRate: 0.02,
          comparedBasis: "stated_rate",
        }),
        expect.objectContaining({
          cardTypeSection: "VS OFLN DB",
          description: "ACQR PROCESSOR FEES",
          proofStatus: "proven",
          referenceRate: 0.0155,
        }),
        expect.objectContaining({
          cardTypeSection: "VS OFLN DB",
          description: "BIN ICA FEE",
          feeType: "card_brand_network",
          proofStatus: "not_enough_detail",
        }),
      ]),
    );
    expect(actual.feeLedger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "MASTERCARD",
          description: "CPU GTWY",
          amount: 4,
          evidenceLine: "0045247508/31/25 | CF | CPU GTWY | 40.00 | 0.1000 | -$4.00",
        }),
        expect.objectContaining({
          network: "VISA",
          description: "FIXED NETWORK CP FEE",
          amount: 1.45,
          classification: expect.objectContaining({
            economicBucket: "card_brand_pass_through",
            confidence: "high",
            rule: "FISERV_CARD_BRAND_ASSESSMENT_LABEL",
            passedThroughAtCostKnown: false,
          }),
        }),
        expect.objectContaining({
          network: null,
          description: "SALES ITEMS",
          amount: 6.4,
          classification: expect.objectContaining({
            economicBucket: "processor_transaction_or_auth",
            confidence: "medium",
            rule: "FISERV_GENERIC_SALES_ITEM_FEE",
          }),
        }),
        expect.objectContaining({
          network: null,
          description: "REGULATORY PRODUCT",
          amount: 3.95,
          classification: expect.objectContaining({
            economicBucket: "miscellaneous_or_statement_fee",
            confidence: "high",
            rule: "FISERV_MISCELLANEOUS_ACCOUNT_FEE",
          }),
        }),
        expect.objectContaining({
          network: "VISA",
          description: "DISC 1",
          amount: 0.79,
          classification: expect.objectContaining({
            economicBucket: "processor_controlled_flat_discount_fee",
            confidence: "medium",
            rule: "FISERV_PROCESSOR_DISCOUNT_LABEL_EVIDENCE",
          }),
        }),
      ]),
    );
    expect(actual.decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        topLevelTotals: "validated",
        feeLedger: "validated_with_rounding",
        batchLedger: "validated",
        feeClassification: "validated_with_rounding",
        customerFacingTotalsAllowed: true,
        feeLedgerAllowed: true,
        feeClassificationAllowed: true,
      },
    });
  });
});
