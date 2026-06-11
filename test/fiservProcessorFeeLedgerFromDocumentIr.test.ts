import path from "node:path";
import { describe, expect, it } from "vitest";
import { attachFiservDocumentSections } from "../src/fiservDocumentSections.js";
import { parseFiservFirstDataProcessorStatement } from "../src/fiservFirstDataParser.js";
import {
  compareFiservProcessorFeeLedgers,
  extractFiservProcessorFeeLedgerFromDocumentIr,
} from "../src/fiservProcessorFeeLedgerFromDocumentIr.js";
import { documentIrFromPdfjsParsedDocument } from "../src/documentIrFromPdfjs.js";
import { parsePdf } from "../src/parser.js";

const PROCESSOR_BRANDED_FIXTURES = [
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
];

describe("Fiserv processor-branded fee ledger extraction from DocumentIR", () => {
  it.each(PROCESSOR_BRANDED_FIXTURES)("matches the legacy fee ledger for %s", async (fileName) => {
    const fixturePath = path.resolve(process.cwd(), "test", "fixtures", "pdfs", fileName);
    const doc = await parsePdf(fixturePath);
    const legacy = parseFiservFirstDataProcessorStatement(doc, { sourceFileName: fileName }) as any;
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: fileName }));
    const actual = extractFiservProcessorFeeLedgerFromDocumentIr(ir);
    const differences = compareFiservProcessorFeeLedgers({ documentIr: actual, legacy: legacy.feeLedger });

    expect(differences).toEqual([]);
    expect(actual.status).toBe(legacy.feeLedger.status);
    expect(actual.rows).toHaveLength(legacy.feeLedger.rows.length);
    expect(actual.totalRowSum).toBe(legacy.feeLedger.totalRowSum);
    expect(actual.printedTotal).toBe(legacy.feeLedger.printedTotal);
    expect(actual.delta).toBe(legacy.feeLedger.delta);
    expect(actual.feeClassificationSummary).toEqual(legacy.feeLedger.feeClassificationSummary);
  });

  it("preserves cross-page network context for Paysafe VS OFLN DB rows", async () => {
    const fileName = "fiserv_PAYSAFE_Febr_2024.pdf";
    const fixturePath = path.resolve(process.cwd(), "test", "fixtures", "pdfs", fileName);
    const doc = await parsePdf(fixturePath);
    const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(doc, { sourceFileName: fileName }));
    const ledger = extractFiservProcessorFeeLedgerFromDocumentIr(ir);

    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          network: "VS OFLN DB",
          description: "NQUAL DISC",
          amount: 468.73,
          pageNumber: 6,
        }),
      ]),
    );
  });
});
