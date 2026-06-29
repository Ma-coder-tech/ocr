import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const FIXTURE_ROOT = path.join(process.cwd(), "test", "fixtures", "pdfs");

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
});
