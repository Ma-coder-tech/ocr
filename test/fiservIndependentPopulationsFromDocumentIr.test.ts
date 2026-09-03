import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { documentIrFromPdfjsParsedDocument } from "../src/documentIrFromPdfjs.js";
import { attachFiservDocumentSections } from "../src/fiservDocumentSections.js";
import {
  extractFiservIndependentAdjustmentChargeback,
  extractFiservIndependentCardSummary,
  extractFiservIndependentFundingBatchPopulation,
  qualifyFiservIndependentSplitPopulations,
} from "../src/fiservIndependentPopulationsFromDocumentIr.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";

const fixtures = {
  basys: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  wells: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
  clover: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  paysafe: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  vortax: "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  zero: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  priority: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
} as const;
const documents = new Map<keyof typeof fixtures, ParsedDocument>();

function ir(caseId: keyof typeof fixtures) {
  const fileName = fixtures[caseId];
  return attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(documents.get(caseId)!, { sourceFileName: fileName }));
}

beforeAll(async () => {
  await Promise.all((Object.entries(fixtures) as Array<[keyof typeof fixtures, string]>).map(async ([caseId, fileName]) => {
    documents.set(caseId, await parsePdf(path.resolve(process.cwd(), "test", "fixtures", "pdfs", fileName)));
  }));
}, 30_000);

describe("independent supported-Fiserv populations from DocumentIR", () => {
  it("extracts explicit gross/refund amounts and counts from both card-summary layouts", () => {
    expect(extractFiservIndependentCardSummary(ir("basys"))).toMatchObject({
      status: "mapped",
      grossVolume: { value: 17_128_393 },
      refundVolume: { value: 0 },
      submittedVolume: { value: 17_128_393 },
      grossCount: { value: 3_310 },
      refundCount: { value: 0 },
      submittedCount: { value: 3_310 },
      formulaStatus: "pass",
    });
    expect(extractFiservIndependentCardSummary(ir("wells"))).toMatchObject({
      status: "mapped",
      grossVolume: { value: 17_741_744 },
      refundVolume: { value: 1_672 },
      submittedVolume: { value: 17_740_072 },
      grossCount: { value: 4_136 },
      refundCount: { value: 2 },
      submittedCount: { value: 4_138 },
      formulaStatus: "pass",
    });
  });

  it("retains printed card populations when their independent formula contradicts the source", () => {
    expect(extractFiservIndependentCardSummary(ir("clover"))).toMatchObject({
      status: "mapped",
      grossVolume: { value: 290_000 },
      refundVolume: { value: 50_000 },
      submittedVolume: { value: 120_000 },
      formulaDeltaMinor: 120_000,
      formulaStatus: "fail",
    });
  });

  it("reconciles explicit adjustment rows and explicit no-chargeback sections", () => {
    expect(extractFiservIndependentAdjustmentChargeback(ir("wells"))).toMatchObject({
      adjustments: {
        status: "mapped",
        rows: [{ value: -108 }],
        printedTotal: { value: -108 },
        rowSumMinor: -108,
        totalControlStatus: "pass",
      },
      chargebacks: {
        status: "explicit_none",
        rows: [],
        printedTotal: { value: 0 },
        totalControlStatus: "pass",
      },
    });
  });

  it("does not turn sign alone into chargeback-principal or representment semantics", () => {
    const extracted = extractFiservIndependentAdjustmentChargeback(ir("wells"));
    extracted.chargebacks = {
      status: "mapped",
      rows: [{
        value: -26_556,
        lineId: "synthetic-line-identity-only",
        pageNumber: 6,
        evidenceLine: "02/02/18 | THE CARDHOLDER DID NOT AUTHORIZE THE CHARGE. | -$265.56",
        description: "THE CARDHOLDER DID NOT AUTHORIZE THE CHARGE.",
      }],
      printedTotal: {
        value: -26_556,
        lineId: "synthetic-total-identity-only",
        pageNumber: 6,
        evidenceLine: "Total | -$265.56",
      },
      rowSumMinor: -26_556,
      totalControlStatus: "pass",
      explicitNoneEvidence: null,
    };
    expect(qualifyFiservIndependentSplitPopulations(extracted)).toMatchObject({
      chargebackPrincipalDebitAmount: {
        status: "withheld",
        valueMinor: null,
        reasonCodes: expect.arrayContaining(["chargeback_reversal_section_contains_unclassified_subtype_rows"]),
      },
      chargebackRepresentmentAmount: {
        status: "withheld",
        valueMinor: null,
        reasonCodes: expect.arrayContaining(["chargeback_reversal_section_contains_unclassified_subtype_rows"]),
      },
    });
  });

  it("preserves processor-presented combined no-activity without manufacturing split zeros", () => {
    const extracted = extractFiservIndependentAdjustmentChargeback(ir("paysafe"));
    expect(extracted.combined).toMatchObject({
      status: "explicit_none",
      printedTotal: { value: 0 },
      explicitNoneEvidence: { evidenceLine: expect.stringMatching(/no adjustments\/chargebacks/i) },
      totalControlStatus: "pass",
    });
    expect(qualifyFiservIndependentSplitPopulations(extracted)).toMatchObject({
      settlementAdjustmentAmount: { status: "withheld", valueMinor: null,
        reasonCodes: expect.arrayContaining([
          "processor_presented_combined_no_activity_preserved_without_split_zero_inference",
        ]) },
      chargebackPrincipalDebitAmount: { status: "withheld", valueMinor: null },
      chargebackRepresentmentAmount: { status: "withheld", valueMinor: null },
    });

    const numericOnly = structuredClone(extracted);
    numericOnly.combined.status = "mapped";
    numericOnly.combined.explicitNoneEvidence = null;
    expect(qualifyFiservIndependentSplitPopulations(numericOnly)).toMatchObject({
      settlementAdjustmentAmount: { status: "withheld", valueMinor: null },
      chargebackPrincipalDebitAmount: { status: "withheld", valueMinor: null },
      chargebackRepresentmentAmount: { status: "withheld", valueMinor: null },
    });
  });

  it("preserves a Chargebacks/Reversals row when its subtype is not explicitly proven", () => {
    const document = structuredClone(ir("priority"));
    for (const line of document.pages.flatMap((page) => page.lines)
      .filter((item) => /\|\s*ADJUSTMENT\s*\|/i.test(item.text))) {
      line.text = line.text.replace(/\bADJUSTMENT\b/i, "CHARGEBACK/REVERSAL");
    }
    const extracted = extractFiservIndependentAdjustmentChargeback(document);
    expect(extracted.combined.rows.every((row) => row.classification === "chargeback_or_reversal")).toBe(true);

    const proofs = qualifyFiservIndependentSplitPopulations(extracted);
    expect(proofs.chargebackPrincipalDebitAmount).toMatchObject({
      status: "withheld",
      reasonCodes: expect.arrayContaining(["combined_section_preserves_ambiguous_chargeback_or_reversal_rows"]),
    });
    expect(proofs.chargebackRepresentmentAmount.status).toBe("withheld");
  });

  it("classifies every reconciled combined detail row before deriving split populations", () => {
    const extracted = extractFiservIndependentAdjustmentChargeback(ir("priority"));
    expect(extracted.combined).toMatchObject({
      status: "mapped",
      rows: [
        { value: -6_317, classification: "settlement_adjustment" },
        { value: 5_717, classification: "settlement_adjustment" },
      ],
      printedTotal: { value: -600 },
      rowSumMinor: -600,
      totalControlStatus: "pass",
    });
    expect(qualifyFiservIndependentSplitPopulations(extracted)).toMatchObject({
      settlementAdjustmentAmount: { status: "proven", valueMinor: -600,
        proofBasis: "combined_exhaustive_classified_rows" },
      chargebackPrincipalDebitAmount: { status: "proven", valueMinor: 0 },
      chargebackRepresentmentAmount: { status: "proven", valueMinor: 0 },
    });

    extracted.combined.rows[0]!.classification = "unresolved";
    const withheld = qualifyFiservIndependentSplitPopulations(extracted).settlementAdjustmentAmount;
    expect(withheld.status).toBe("withheld");
    expect(withheld.reasonCodes).toContain("combined_section_contains_unclassified_rows");
  });

  it("counts only explicit dated funding batches, excluding Month End Charge rows", () => {
    const population = extractFiservIndependentFundingBatchPopulation(ir("paysafe"));
    expect(population).toMatchObject({ status: "mapped", count: 9 });
    expect(population.rows).toHaveLength(9);
    expect(population.rows.every((row) => /^\d+$/.test(row.batchNumber))).toBe(true);
  });

  it("keeps batch identity available when independent amount controls warn", () => {
    expect(extractFiservIndependentFundingBatchPopulation(ir("vortax"))).toMatchObject({
      status: "mapped_with_warnings",
      populationKind: "funding_batches",
      count: 26,
      limitations: expect.arrayContaining([
        expect.stringMatching(/15 dated adjustment-only or zero-submitted rows/i),
        expect.stringMatching(/amount reconciliation has warnings/i),
      ]),
    });
  });

  it.each(["basys", "wells", "clover"] as const)(
    "recognizes %s daily funding summaries without mislabeling their rows as batches",
    (caseId) => {
      expect(extractFiservIndependentFundingBatchPopulation(ir(caseId))).toMatchObject({
        status: "not_mapped",
        populationKind: "daily_funding_summary",
        rows: [],
        count: null,
        limitations: [expect.stringMatching(/dated daily totals are not funding batches/i)],
      });
    },
  );

  it("excludes adjustment-only rows from an otherwise source-bounded submitted-batch population", () => {
    expect(extractFiservIndependentFundingBatchPopulation(ir("priority"))).toMatchObject({
      status: "mapped",
      populationKind: "funding_batches",
      count: 30,
      limitations: [expect.stringMatching(/2 dated adjustment-only or zero-submitted rows/i)],
    });
  });

  it("fails closed on duplicate submitted-batch identities", () => {
    const document = structuredClone(ir("paysafe"));
    const lines = document.pages.flatMap((page) => page.lines);
    const row = lines.find((line) => /^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*\d+\s*\|\s*\$/i.test(line.text))!;
    const headerContinuation = lines.find((line) => /^submitted\s*\|\s*number\s*\|/i.test(line.text))!;
    headerContinuation.text = row.text;
    expect(extractFiservIndependentFundingBatchPopulation(document)).toMatchObject({
      status: "not_mapped",
      count: null,
      limitations: [expect.stringMatching(/duplicate submitted funding-batch identity/i)],
    });
  });

  it("fails closed on orphan continuation rows and ambiguous table totals", () => {
    const orphan = structuredClone(ir("paysafe"));
    const orphanRow = orphan.pages.flatMap((page) => page.lines)
      .find((line) => /^\d{2}\/\d{2}(?:\/\d{2})?\s*\|\s*\d+\s*\|\s*\$/i.test(line.text))!;
    orphanRow.text = cellIdentity(orphanRow.text);
    expect(extractFiservIndependentFundingBatchPopulation(orphan)).toMatchObject({
      status: "not_mapped",
      count: null,
      limitations: [expect.stringMatching(/identity continuation row has no adjacent/i)],
    });

    const ambiguous = structuredClone(ir("paysafe"));
    const headerContinuation = ambiguous.pages.flatMap((page) => page.lines)
      .find((line) => /^submitted\s*\|\s*number\s*\|/i.test(line.text))!;
    headerContinuation.text = "Total | $1.00 | 0.00 | 0.00 | 0.00 | $1.00";
    expect(extractFiservIndependentFundingBatchPopulation(ambiguous)).toMatchObject({
      status: "not_mapped",
      count: null,
      limitations: [expect.stringMatching(/multiple possible printed funding totals/i)],
    });
  });

  it("represents an explicit zero-row funding table as a supported zero population", () => {
    expect(extractFiservIndependentFundingBatchPopulation(ir("zero"))).toMatchObject({
      status: "mapped",
      rows: [],
      count: 0,
      populationAnchor: { evidenceLine: expect.stringMatching(/^Total\s*\|/i) },
    });
  });
});

function cellIdentity(text: string): string {
  return text.split("|").slice(0, 2).map((cell) => cell.trim()).join(" | ");
}
