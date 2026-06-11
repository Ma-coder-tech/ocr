import path from "node:path";
import { describe, expect, it } from "vitest";
import { attachFiservDocumentSections } from "../src/fiservDocumentSections.js";
import { parseFiservFirstDataProcessorStatement } from "../src/fiservFirstDataParser.js";
import {
  compareFiservProcessorFundingBatchLedgers,
  extractFiservProcessorFundingBatchLedgerFromDocumentIr,
} from "../src/fiservProcessorBatchFundingFromDocumentIr.js";
import { documentIrFromPdfjsParsedDocument } from "../src/documentIrFromPdfjs.js";
import { parsePdf } from "../src/parser.js";

const PROCESSOR_BRANDED_FIXTURES = [
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
];

describe("Fiserv processor-branded batch funding extraction from DocumentIR", () => {
  it.each(PROCESSOR_BRANDED_FIXTURES)("matches the parser's source-of-truth batch funding ledger for %s", async (fileName) => {
    const fixturePath = path.resolve(process.cwd(), "test", "fixtures", "pdfs", fileName);
    const doc = await parsePdf(fixturePath);
    const parsed = parseFiservFirstDataProcessorStatement(doc, { sourceFileName: fileName }) as any;
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: fileName }));
    const actual = extractFiservProcessorFundingBatchLedgerFromDocumentIr(ir);
    const differences = compareFiservProcessorFundingBatchLedgers({
      documentIr: actual,
      legacy: parsed.fundingBatchLedger,
    });

    expect(differences).toEqual([]);
    expect(parsed.warnings.filter((warning: any) => warning.code.startsWith("document_ir_batch_funding_ledger_mismatch"))).toEqual([]);
    expect(actual.status).toBe(parsed.fundingBatchLedger.status);
    expect(actual.rowCount).toBe(parsed.fundingBatchLedger.rowCount);
    expect(actual.anomalyCount).toBe(parsed.fundingBatchLedger.anomalyCount);
    expect(actual.submittedTotal).toBe(parsed.fundingBatchLedger.submittedTotal);
    expect(actual.fundedTotal).toBe(parsed.fundingBatchLedger.fundedTotal);
    expect(actual.feesChargedTotal).toBe(parsed.fundingBatchLedger.feesChargedTotal);
    expect(actual.controlSubmittedTotal).toBe(parsed.fundingBatchLedger.controlSubmittedTotal);
    expect(actual.controlFundedTotal).toBe(parsed.fundingBatchLedger.controlFundedTotal);
    expect(actual.controlFeesChargedTotal).toBe(parsed.fundingBatchLedger.controlFeesChargedTotal);
  });

  it("preserves the Paysafe 02/27 printed row anomaly", async () => {
    const fileName = "fiserv_PAYSAFE_Febr_2024.pdf";
    const fixturePath = path.resolve(process.cwd(), "test", "fixtures", "pdfs", fileName);
    const doc = await parsePdf(fixturePath);
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: fileName }));
    const ledger = extractFiservProcessorFundingBatchLedgerFromDocumentIr(ir);
    const feb27 = ledger.rows.find((row) => row.dateSubmitted === "02/27/24");

    expect(feb27).toMatchObject({
      batchNumber: "98056271397",
      amountSubmitted: 2410.94,
      feesCharged: 48.22,
      amountFunded: 2344.1,
      formulaResult: 2362.72,
      delta: -18.62,
      status: "fail",
    });
  });

  it("repairs date/batch rows split after their money columns", async () => {
    const fileName = "fiserv_PAYSAFE_Febr_2024.pdf";
    const fixturePath = path.resolve(process.cwd(), "test", "fixtures", "pdfs", fileName);
    const doc = await parsePdf(fixturePath);
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: fileName }));
    const ledger = extractFiservProcessorFundingBatchLedgerFromDocumentIr(ir);
    const feb29 = ledger.rows.find((row) => row.dateSubmitted === "02/29/24");

    expect(feb29).toMatchObject({
      batchNumber: "98034049791",
      amountSubmitted: 1350.36,
      feesCharged: 37.44,
      amountFunded: 1312.92,
      status: "pass",
    });
  });
});
