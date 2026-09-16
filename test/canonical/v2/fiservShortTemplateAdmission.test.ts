import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { fiservFirstDataShortStatementDriver } from "../../../src/fiservFirstDataParser.js";
import { parsePdf } from "../../../src/parser.js";
import {
  buildCanonicalEconomicsV2FromFiserv,
  resolveFiservShortTemplateAdmission,
} from "../../../src/canonical/v2/index.js";

const fixture = "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf";

describe("versioned Fiserv short structural admission", () => {
  it("admits only the approved evidence-bound capabilities and derives gross/gross average ticket", async () => {
    const document = await parsePdf(fixture);
    const parserOutput = fiservFirstDataShortStatementDriver.parse(document);
    const base = { document, parserOutput, sourceDocumentRef: "SHORT-STRUCTURAL-TEST",
      parserId: fiservFirstDataShortStatementDriver.id, provenanceStatus: "observational" as const };
    const observational = buildCanonicalEconomicsV2FromFiserv(base);
    const resolution = resolveFiservShortTemplateAdmission({ driverId: fiservFirstDataShortStatementDriver.id,
      parserOutput, observationalFoundation: observational });
    expect(resolution).not.toBeNull();
    expect(resolution?.templateAdmission).toMatchObject({
      detectedVersion: "1.0.0", identityStatus: "proven", admissionStatus: "admitted", completenessStatus: "unknown",
      admissionAuthority: { lifecycle: "admitted_with_conditions", authorityClass: "product_owner" },
    });
    expect(resolution?.templateAdmission.capabilities?.filter((item) => item.status === "supported").map((item) => item.capability)).toEqual([
      "processor_identity", "statement_period", "gross_sale_volume", "refund_volume", "canonical_net_submitted_card_volume",
      "gross_sale_transaction_count", "submitted_transaction_count", "fee_total", "settlement_adjustments", "fee_detail",
      "reconciliation_controls", "non_fee_financial_flow_exclusions",
    ]);

    const admitted = buildCanonicalEconomicsV2FromFiserv({ ...base, templateAdmission: resolution!.templateAdmission,
      sectionAdmissions: resolution!.sectionAdmissions });
    expect(admitted.validation).toMatchObject({ status: "valid", errors: [] });
    expect(admitted.templateCapability.completenessStatus).toBe("unknown");
    expect(admitted.financialPopulations).toMatchObject({
      grossSaleVolume: { provenanceStatus: "authoritative", value: { amountMinor: 290_000 } },
      refundVolume: { provenanceStatus: "authoritative", value: { amountMinor: 50_000 } },
      canonicalNetSubmittedCardVolume: { provenanceStatus: "authoritative", value: { amountMinor: 240_000 } },
      totalStatementProcessingFees: { provenanceStatus: "authoritative", value: { amountMinor: 14_131 } },
      grossSaleTransactionCount: { provenanceStatus: "authoritative", value: 8 },
      submittedTransactionCount: { provenanceStatus: "authoritative", value: 10 },
      settlementAdjustmentAmount: { provenanceStatus: "authoritative", value: { amountMinor: -120_000 } },
    });
    expect(admitted.metrics.headlineAverageTicket).toMatchObject({ state: "defined", value: { amountMinor: 36_250 } });
  }, 30_000);

  it("fails closed when the driver or a required reconciliation control does not match", async () => {
    const document = await parsePdf(fixture);
    const parserOutput = fiservFirstDataShortStatementDriver.parse(document) as any;
    const observational = buildCanonicalEconomicsV2FromFiserv({ document, parserOutput, sourceDocumentRef: "SHORT-FAIL-CLOSED",
      parserId: fiservFirstDataShortStatementDriver.id, provenanceStatus: "observational" });
    expect(resolveFiservShortTemplateAdmission({ driverId: "fiserv_first_data_full_statement", parserOutput,
      observationalFoundation: observational })).toBeNull();
    const missingControl = structuredClone(parserOutput);
    missingControl.reconciliationResults = missingControl.reconciliationResults.filter((item: any) =>
      item.identity !== "fee_detail:all_line_items_eq_total_fees");
    expect(resolveFiservShortTemplateAdmission({ driverId: fiservFirstDataShortStatementDriver.id, parserOutput: missingControl,
      observationalFoundation: observational })).toBeNull();
  }, 30_000);

  it("contains no statement id, filename, checksum, merchant, or fixture-value identity condition", async () => {
    const source = await readFile("src/canonical/v2/fiservShortTemplateAdmission.ts", "utf8");
    expect(source).not.toMatch(/fsv-03-clover-short-jun|SAMPLE_MERCHANT|merchantName|sourceFingerprint|sourceDocumentRef|2400|141\.31|500|1200/);
    expect(source).toContain("gross - refunds - net");
    expect(source).toContain("feeRowSum - fees");
  });
});
