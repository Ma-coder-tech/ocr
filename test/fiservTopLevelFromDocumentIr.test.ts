import path from "node:path";
import { describe, expect, it } from "vitest";
import { attachFiservDocumentSections } from "../src/fiservDocumentSections.js";
import {
  parseFiservFirstDataFullStatement,
  parseFiservFirstDataProcessorStatement,
  parseFiservFirstDataShortStatement,
} from "../src/fiservFirstDataParser.js";
import { extractFiservTopLevelFinancialsFromDocumentIr } from "../src/fiservTopLevelFromDocumentIr.js";
import { documentIrFromPdfjsParsedDocument } from "../src/documentIrFromPdfjs.js";
import { parsePdf } from "../src/parser.js";

const FULL_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "SAMPLE_MERCHANT4_CLOVER.pdf");
const SHORT_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
const PAYSAFE_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_PAYSAFE_Febr_2024.pdf");

describe("Fiserv top-level extraction from DocumentIR", () => {
  it("extracts full-statement top-level totals from DocumentIR", async () => {
    const doc = await parsePdf(FULL_PDF_PATH);
    const expected = parseFiservFirstDataFullStatement(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" }) as any;
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: "SAMPLE_MERCHANT4_CLOVER.pdf" }));
    const actual = extractFiservTopLevelFinancialsFromDocumentIr(ir);

    expect(actual.layoutFamily).toBe("first_data_statement");
    expect(actual.totalVolume).toBe(expected.selectedFinancials.totalVolume);
    expect(actual.totalFees).toBe(expected.selectedFinancials.totalFees);
    expect(actual.amountFunded).toBe(expected.selectedFinancials.amountFunded);
    expect(actual.adjustmentsChargebacks).toBe(expected.selectedFinancials.adjustmentsChargebacks);
    expect(actual.thirdPartyTransactions).toBe(expected.selectedFinancials.thirdPartyTransactions);
    expect(actual.effectiveRate).toBe(expected.selectedFinancials.effectiveRate);
    expect(actual.reconciliation.fundingFormula.status).toBe("pass");
    expect(actual.evidence.map((item) => item.field)).toEqual(
      expect.arrayContaining(["totalVolume", "totalFees", "amountFunded"]),
    );
  });

  it("extracts short-statement top-level totals from DocumentIR", async () => {
    const doc = await parsePdf(SHORT_PDF_PATH);
    const expected = parseFiservFirstDataShortStatement(doc, { sourceFileName: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf" }) as any;
    const ir = attachFiservDocumentSections(
      documentIrFromPdfjsParsedDocument(doc, { sourceFileName: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf" }),
    );
    const actual = extractFiservTopLevelFinancialsFromDocumentIr(ir);

    expect(actual.layoutFamily).toBe("first_data_statement");
    expect(actual.totalVolume).toBe(expected.selectedFinancials.totalVolume);
    expect(actual.totalFees).toBe(expected.selectedFinancials.totalFees);
    expect(actual.amountFunded).toBe(expected.selectedFinancials.amountFunded);
    expect(actual.adjustmentsChargebacks).toBe(expected.selectedFinancials.adjustmentsChargebacks);
    expect(actual.thirdPartyTransactions).toBe(expected.selectedFinancials.thirdPartyTransactions);
    expect(actual.effectiveRate).toBe(expected.selectedFinancials.effectiveRate);
    expect(actual.reconciliation.fundingFormula.status).toBe("pass");
  });

  it("extracts processor-branded top-level totals from DocumentIR", async () => {
    const doc = await parsePdf(PAYSAFE_PDF_PATH);
    const expected = parseFiservFirstDataProcessorStatement(doc, { sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf" }) as any;
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf" }));
    const actual = extractFiservTopLevelFinancialsFromDocumentIr(ir);

    expect(actual.layoutFamily).toBe("fiserv_processor_branded");
    expect(actual.totalVolume).toBe(expected.selectedFinancials.totalVolume);
    expect(actual.totalFees).toBe(expected.selectedFinancials.totalFees);
    expect(actual.amountFunded).toBe(expected.selectedFinancials.amountFunded);
    expect(actual.adjustmentsChargebacks).toBe(expected.selectedFinancials.adjustmentsChargebacks);
    expect(actual.thirdPartyTransactions).toBe(expected.selectedFinancials.thirdPartyTransactions);
    expect(actual.effectiveRate).toBe(expected.selectedFinancials.effectiveRate);
    expect(actual.reconciliation.fundingFormula.status).toBe("pass");
    expect(actual.evidence.find((item) => item.field === "amountFunded")?.evidenceLine).toContain("TotaI Amount Funded");
  });
});
