import path from "node:path";
import { describe, expect, it } from "vitest";
import { genericFiservStatementDriver } from "../src/genericFiservStatementParser.js";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const FIXTURE_ROOT = path.join(process.cwd(), "test", "fixtures", "pdfs");
const FISERV_ORCHESTRATOR_FIXTURES = [
  "SAMPLE_MERCHANT4_CLOVER.pdf",
  "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "Nov_2024_Statement.pdf",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
];

describe("statement parser orchestrator", () => {
  it("uses the validated Fiserv processor-branded parser as source of truth for customer-facing totals", async () => {
    const fixturePath = path.join(FIXTURE_ROOT, "fiserv_PAYSAFE_Febr_2024.pdf");
    const parsed = await parsePdf(fixturePath);

    const summary = analyzeStatementDocument(parsed, "other", {
      sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf",
    });

    expect(summary.parserSource?.driverId).toBe("fiserv_first_data_processor_statement");
    expect(summary.parserDecision?.status).toBe("accepted_with_warnings");
    expect(summary.parserDecision?.validationState).toMatchObject({
      customerFacingTotalsAllowed: true,
      batchDetailAllowed: false,
      feeClassification: "warning",
      feeClassificationAllowed: false,
    });
    expect(summary.totalVolume).toBe(36912.94);
    expect(summary.totalFees).toBe(1565.73);
    expect(summary.effectiveRate).toBe(4.24);
    expect(summary.fiservFeeAnalysisV2?.benchmarkCategoryResolution).toMatchObject({
      categoryId: "default",
      source: "default",
      userSelectedBusinessType: "other",
      userSelectedMappedCategoryId: null,
    });
    expect(summary.feeBreakdown.map((row) => row.label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("BATCH HEADER"),
        expect.stringContaining("ADDITIONAL FEES"),
        expect.stringContaining("OTHER ITEM FEES"),
      ]),
    );
    expect(summary.feeBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.stringContaining("MQUAL DISC"),
          feeClass: "unknown",
          broadType: "Unknown",
          classificationRule: "FISERV_TIERED_DISCOUNT_BUCKET",
        }),
        expect.objectContaining({
          label: expect.stringContaining("CR DUES AND ASSESS"),
          feeClass: "card_brand_pass_through",
          broadType: "Pass-through",
        }),
        expect.objectContaining({
          label: expect.stringContaining("ADDITIONAL FEES"),
          feeClass: "unknown",
          broadType: "Unknown",
          classificationRule: "FISERV_ADDITIONAL_FEES_UNRESOLVED",
        }),
      ]),
    );
  });

  it("falls through to the generic Fiserv-family parser when a strict parser overmatches the Basys layout", async () => {
    const fixturePath = path.join(FIXTURE_ROOT, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");
    const parsed = await parsePdf(fixturePath);

    const summary = analyzeStatementDocument(parsed, "restaurant_food_beverage", {
      sourceFileName: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
    });

    expect(summary.parserSource).toMatchObject({
      driverId: "generic_fiserv_family_statement",
      processorFamily: "Fiserv-family",
      statementFamily: "generic_fiserv_family_statement",
    });
    expect(summary.processorName).toBe("Basys");
    expect(summary.statementPeriod).toBe("2020-03");
    expect(summary.totalVolume).toBe(171283.93);
    expect(summary.totalFees).toBe(3552.45);
    expect(summary.effectiveRate).toBe(2.07);
    expect(summary.parserDecision?.status).toBe("accepted_with_warnings");
    expect(summary.parserDecision?.validationState).toMatchObject({
      customerFacingTotalsAllowed: true,
      feeLedgerAllowed: true,
      batchDetailAllowed: true,
    });
    expect(summary.confidence).toBe("high");
    expect(summary.fiservFeeAnalysisV2?.reconciliation).toMatchObject({
      basisTotal: 3552.45,
      rowTotal: 3552.45,
      residual: 0,
      status: "pass",
    });
    expect(summary.feeBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.stringContaining("VISA ECR AUTH FEE"),
          feeClass: "processor_transaction_or_auth",
          broadType: "Processor",
        }),
        expect.objectContaining({
          label: expect.stringContaining("VI-SIGNATURE PREFERRED CRP ELC"),
          feeClass: "card_brand_pass_through",
          broadType: "Pass-through",
        }),
      ]),
    );
    const parserOutput = genericFiservStatementDriver.parse(parsed, {
      sourceFileName: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
      businessType: "restaurant_food_beverage",
    }) as any;
    expect(parserOutput.fundingBatchLedger).toMatchObject({
      status: "reconciled",
      rowCount: 26,
      anomalyCount: 0,
      submittedTotal: 171283.93,
      feesChargedTotal: 3552.45,
      fundedTotal: 167731.48,
      controlSubmittedTotal: 171283.93,
      controlFeesChargedTotal: 3552.45,
      controlFundedTotal: 167731.48,
      submittedDelta: 0,
      feesChargedDelta: 0,
      fundedDelta: 0,
      evidenceLine: "Total | $171,283.93 | 0.00 | 0.00 | -$3,552.45 | $167,731.48",
    });
    expect(summary.dataQuality).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: expect.stringContaining("generic Fiserv-family fallback parser"),
        }),
      ]),
    );
  }, 60_000);

  it("keeps every available Fiserv-family fixture on a parser-backed path", async () => {
    for (const fileName of FISERV_ORCHESTRATOR_FIXTURES) {
      const parsed = await parsePdf(path.join(FIXTURE_ROOT, fileName));
      const summary = analyzeStatementDocument(parsed, "other", { sourceFileName: fileName });

      expect(summary.parserSource?.driverId, fileName).toBeTruthy();
      expect(summary.parserDecision?.status, fileName).not.toBe("failed");
      expect(summary.parserDecision?.status, fileName).not.toBe("unsupported");
      expect(Number.isFinite(summary.totalVolume), fileName).toBe(true);
      expect(Number.isFinite(summary.totalFees), fileName).toBe(true);
      expect(Number.isFinite(summary.effectiveRate), fileName).toBe(true);
      expect(summary.feeBreakdown.length, fileName).toBeGreaterThan(0);
    }
  }, 180_000);
});
