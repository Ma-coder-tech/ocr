import { describe, expect, it } from "vitest";
import { buildCanonicalFeeLedger, mergeInterpretations } from "../../src/canonical/feeLedger.js";
import { occurrenceFromEvidence, sourceOccurrenceId } from "../../src/canonical/feeLedgerIdentity.js";
import { makeEvidenceRecord } from "../../src/canonical/evidence.js";
import {
  diagnosticPerItemControl,
  diagnosticRateVolumeControl,
  fundingFormulaControl,
  parsePrintedRate,
  perItemToleranceMinor,
  printedMonetaryControl,
  rateTimesVolumeToleranceMinor,
} from "../../src/canonical/feeLedgerReconciliation.js";
import { moneyFromNumber } from "../../src/canonical/money.js";
import type { CanonicalCalculationRecord, CanonicalEvidenceRecord, CanonicalFeeParserInterpretation } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical fee ledger", () => {
  it("preserves source-occurrence identity when row role interpretation changes", () => {
    const evidence = makeEvidenceRecord({
      documentId: "doc_role_change",
      pageNumber: 2,
      lineId: "pdfjs-line-12",
      rowIndex: 12,
      section: "FEES",
      extractedText: "Review Row | -$9.99",
      sourceRole: "fee_row",
    });

    const unknownOccurrence = occurrenceFromEvidence({ evidence });
    const chargeOccurrence = occurrenceFromEvidence({ evidence });
    const directId = sourceOccurrenceId({
      documentId: evidence.documentId,
      pageNumber: evidence.pageNumber,
      section: evidence.section,
      lineId: evidence.lineId,
      rowIndex: evidence.rowIndex,
      normalizedSourceText: evidence.normalizedText,
    });

    expect(unknownOccurrence.id).toBe(chargeOccurrence.id);
    const unknownInterpretation = feeInterpretation("int_unknown", unknownOccurrence.id, "Review Row", 9.99);
    unknownInterpretation.rowRole = "unknown_unresolved";
    const chargeInterpretation = feeInterpretation("int_charge", chargeOccurrence.id, "Review Row", 9.99);
    chargeInterpretation.rowRole = "individual_charge";
    expect(unknownInterpretation.sourceOccurrenceId).toBe(chargeInterpretation.sourceOccurrenceId);
    expect(directId).toBe(
      sourceOccurrenceId({
        documentId: evidence.documentId,
        pageNumber: evidence.pageNumber,
        section: evidence.section,
        lineId: evidence.lineId,
        rowIndex: evidence.rowIndex,
        normalizedSourceText: evidence.normalizedText,
      }),
    );
  });

  it("merges generic and processor aliases only when evidence identifies the same printed occurrence", () => {
    const evidence = new Map<string, CanonicalEvidenceRecord>();
    const calculations: CanonicalCalculationRecord[] = [];
    const ledger = buildCanonicalFeeLedger({
      doc: feeDocument([
        "MM/DD | CF | QUAL DISC | 0.0130 | $48,129.23 | -$625.68",
        "Total (Misc Fees and Card Fees) | -$625.68",
      ]),
      documentId: "doc_alias",
      matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
      evidence,
      calculations,
      parserOutput: {
        feeLedger: {
          rows: [
            {
              description: "QUAL DISC",
              amount: 625.68,
              volumeBasis: 48129.23,
              sourceSection: "FEES CHARGED",
              evidenceLine: "MM/DD | CF | QUAL DISC | 0.0130 | $48,129.23 | -$625.68",
              pageNumber: 1,
              confidence: "high",
            },
            {
              network: "VISA",
              description: "QUAL DISC",
              amount: 625.68,
              volumeBasis: 48129.23,
              sourceSection: "FEES CHARGED",
              evidenceLine: "MM/DD | CF | QUAL DISC | 0.0130 | $48,129.23 | -$625.68",
              pageNumber: 1,
              confidence: "high",
            },
          ],
          controls: [{ label: "Grand total", rowSum: 625.68, printedTotal: 625.68, delta: 0, evidenceLine: "Total (Misc Fees and Card Fees) | -$625.68" }],
          printedTotal: 625.68,
          delta: 0,
        },
      },
    });

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]?.parserInterpretationIds).toHaveLength(2);
    expect(ledger.rows[0]?.mergeReason).toBe("same_source_occurrence");
    expect(ledger.uniqueChargeTotal).toEqual({ amountMinor: 62568, currency: "USD" });
    expect(ledger.controls[0]?.status).toBe("pass");
    expect(ledger.parserInterpretations[0]?.printedRate).toMatchObject({
      original: "0.0130",
      displayedDecimalPlaces: 4,
      representation: "decimal_fraction",
      normalizedFractionalRate: "0.013",
    });
  });

  it("keeps legitimate repeated charges separate when source occurrences differ", () => {
    const first: CanonicalFeeParserInterpretation = feeInterpretation("int_1", "srcocc_1", "QUAL DISC", 347.12);
    const second: CanonicalFeeParserInterpretation = feeInterpretation("int_2", "srcocc_2", "QUAL DISC", 347.12);

    const rows = mergeInterpretations([first, second]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.mergeReason === null)).toBe(true);
    expect(rows.map((row) => row.sourceOccurrenceIds)).toEqual([["srcocc_1"], ["srcocc_2"]]);
  });

  it("does not merge same label and amount without shared occurrence evidence", () => {
    const rows = mergeInterpretations([
      feeInterpretation("int_1", "srcocc_1", "Monthly Fee", 10),
      feeInterpretation("int_2", "srcocc_2", "Monthly Fee", 10),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.mergeReason === null)).toBe(true);
  });

  it("does not use fuzzy label similarity to authorize a merge", () => {
    const rows = mergeInterpretations([
      feeInterpretation("int_1", "srcocc_1", "AUTH FEE", 0.21),
      feeInterpretation("int_2", "srcocc_2", "AVS AUTHORIZATION FEE", 0.21),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.mergeReason === null)).toBe(true);
  });

  it("makes conflicting amount interpretations unresolved and excludes them from unique total", () => {
    const rows = mergeInterpretations([
      feeInterpretation("int_1", "srcocc_shared", "Monthly Fee", 10),
      feeInterpretation("int_2", "srcocc_shared", "Monthly Fee", 12),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("unknown_unresolved");
    expect(rows[0]?.contributesToUniqueTotal).toBe(false);
    expect(rows[0]?.rejectedAmountCandidates).toHaveLength(1);
  });

  it("excludes subtotals, zero-dollar references, rate-only rows, and interchange detail rows from unique fee total", () => {
    const evidence = new Map<string, CanonicalEvidenceRecord>();
    const calculations: CanonicalCalculationRecord[] = [];
    const ledger = buildCanonicalFeeLedger({
      doc: feeDocument([
        "Monthly Fee | -$10.00",
        "Discount Reference | 0.00",
        "Rate Reference Fee | -$1.00",
        "Interchange Detail Row | -$2.00",
        "Total Fees | -$10.00",
      ]),
      documentId: "doc_roles",
      matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
      evidence,
      calculations,
      parserOutput: {
        feeLedger: {
          rows: [
            { description: "Monthly Fee", amount: 10, sourceSection: "Fees", evidenceLine: "Monthly Fee | -$10.00", pageNumber: 1 },
            { description: "Discount Reference", amount: 0, sourceSection: "Fees", evidenceLine: "Discount Reference | 0.00", pageNumber: 1 },
            { description: "Rate Reference Fee", amount: 1, sourceSection: "Fees", evidenceLine: "Rate Reference Fee | -$1.00", pageNumber: 1 },
            { description: "Interchange Detail Row", amount: 2, sourceSection: "Interchange Charges", evidenceLine: "Interchange Detail Row | -$2.00", pageNumber: 1 },
            { description: "Total Fees", amount: 10, sourceSection: "Fees", evidenceLine: "Total Fees | -$10.00", pageNumber: 1 },
          ],
          controls: [{ label: "Total Fees", rowSum: 10, printedTotal: 10, delta: 0, evidenceLine: "Total Fees | -$10.00" }],
          printedTotal: 10,
          delta: 0,
        },
      },
    });

    expect(ledger.rows.map((row) => row.role)).toEqual([
      "individual_charge",
      "zero_dollar_reference_row",
      "informational_rate_row",
      "interchange_detail_row",
      "section_subtotal",
    ]);
    expect(ledger.uniqueChargeTotal).toEqual({ amountMinor: 1000, currency: "USD" });
  });

  it("summarizes a Priority-style six-alias duplication pattern as six unique charges", () => {
    const amounts = [347.12, 548.93, 231.94, 625.68, 1205.3, 103.85];
    const lines = amounts.map((amount, index) => `MM/DD | CF | QUAL DISC | 0.0130 | $1000.00 | -$${amount.toFixed(2)}`);
    const ledger = ledgerFromRows({
      documentId: "doc_priority_pattern",
      lines: [...lines, "Total Fees | -$3062.82"],
      rows: [
        ...amounts.map((amount, index) => feeRow({ description: "QUAL DISC", amount, evidenceLine: lines[index]! })),
        ...amounts.map((amount, index) => feeRow({ network: `NETWORK ${index + 1}`, description: "QUAL DISC", amount, evidenceLine: lines[index]! })),
      ],
      printedTotal: 3062.82,
    });

    expect(ledger.parserInterpretations).toHaveLength(12);
    expect(ledger.sourceOccurrences).toHaveLength(6);
    expect(ledger.rows.filter((row) => row.contributesToUniqueTotal)).toHaveLength(6);
    expect(ledger.rows.filter((row) => row.mergeReason === "same_source_occurrence")).toHaveLength(6);
    expect(ledger.uniqueChargeTotal).toEqual({ amountMinor: 306282, currency: "USD" });
    expect(ledger.controls[0]).toMatchObject({ deltaMinor: 0, status: "pass" });
    expect(ledger.status).toBe("available");
  });

  it("summarizes an El Nuevo-style generic/processor overlap pattern without double counting", () => {
    const lines = ["Processor Fee | -$20.00", "Compliance Fee | -$5.00", "Total Fees | -$25.00"];
    const ledger = ledgerFromRows({
      documentId: "doc_overlap_pattern",
      lines,
      rows: [
        feeRow({ description: "Processor Fee", amount: 20, evidenceLine: lines[0]! }),
        feeRow({ network: "GENERIC", description: "Processor Fee", amount: 20, evidenceLine: lines[0]! }),
        feeRow({ description: "Compliance Fee", amount: 5, evidenceLine: lines[1]! }),
        feeRow({ network: "GENERIC", description: "Compliance Fee", amount: 5, evidenceLine: lines[1]! }),
      ],
      printedTotal: 25,
    });

    expect(summaryFor(ledger)).toEqual({
      sourceInterpretationCount: 4,
      canonicalSourceOccurrenceCount: 2,
      canonicalCountedChargeCount: 2,
      excludedControlSubtotalCount: 0,
      duplicateAliasCount: 2,
      uniqueCanonicalTotalMinor: 2500,
      printedControlTotalMinor: 2500,
      differenceMinor: 0,
      ledgerStatus: "available",
    });
  });

  it("summarizes legitimate repeated charges as separate counted charges", () => {
    const lines = ["Monthly Fee | -$10.00", "Monthly Fee | -$10.00", "Total Fees | -$20.00"];
    const ledger = ledgerFromRows({
      documentId: "doc_repeated_pattern",
      lines,
      rows: [
        feeRow({ description: "Monthly Fee", amount: 10, evidenceLine: lines[0]! }),
        feeRow({ description: "Monthly Fee", amount: 10, evidenceLine: lines[1]! }),
      ],
      printedTotal: 20,
    });

    expect(summaryFor(ledger)).toMatchObject({
      sourceInterpretationCount: 2,
      canonicalSourceOccurrenceCount: 2,
      canonicalCountedChargeCount: 2,
      duplicateAliasCount: 0,
      uniqueCanonicalTotalMinor: 2000,
      differenceMinor: 0,
      ledgerStatus: "available",
    });
  });

  it("summarizes subtotal-plus-components with the subtotal excluded", () => {
    const lines = ["Card Fee | -$7.00", "Service Fee | -$3.00", "Total Fees | -$10.00"];
    const ledger = ledgerFromRows({
      documentId: "doc_subtotal_pattern",
      lines,
      rows: [
        feeRow({ description: "Card Fee", amount: 7, evidenceLine: lines[0]! }),
        feeRow({ description: "Service Fee", amount: 3, evidenceLine: lines[1]! }),
        feeRow({ description: "Total Fees", amount: 10, evidenceLine: lines[2]! }),
      ],
      printedTotal: 10,
    });

    expect(summaryFor(ledger)).toMatchObject({
      sourceInterpretationCount: 3,
      canonicalSourceOccurrenceCount: 3,
      canonicalCountedChargeCount: 2,
      excludedControlSubtotalCount: 1,
      uniqueCanonicalTotalMinor: 1000,
      differenceMinor: 0,
      ledgerStatus: "available",
    });
  });

  it("summarizes credits and adjustments with explicit sign preservation", () => {
    const lines = ["Service Fee | -$10.00", "Credit Refund | $2.00", "Batch Adjustment | -$3.00", "Total Fees | -$5.00"];
    const ledger = ledgerFromRows({
      documentId: "doc_credit_adjustment_pattern",
      lines,
      rows: [
        feeRow({ description: "Service Fee", amount: 10, evidenceLine: lines[0]! }),
        feeRow({ description: "Credit Refund", amount: 2, evidenceLine: lines[1]! }),
        feeRow({ description: "Batch Adjustment", amount: 3, evidenceLine: lines[2]! }),
      ],
      printedTotal: 5,
      delta: 0,
    });

    expect(ledger.rows.map((row) => [row.role, row.signedAmount?.amountMinor])).toEqual([
      ["individual_charge", 1000],
      ["credit", -200],
      ["adjustment", -300],
    ]);
    expect(summaryFor(ledger)).toMatchObject({
      canonicalCountedChargeCount: 3,
      uniqueCanonicalTotalMinor: 500,
      printedControlTotalMinor: 500,
      differenceMinor: 0,
      ledgerStatus: "available",
    });
  });

  it("normalizes equivalent percentage, decimal-fraction, and basis-point rates", () => {
    const percent = parsePrintedRate("0.13%");
    const decimal = parsePrintedRate("0.0013");
    const bps = parsePrintedRate("13 bps");

    expect(percent.representation).toBe("percent_points");
    expect(decimal.representation).toBe("decimal_fraction");
    expect(bps.representation).toBe("basis_points");
    expect(percent.normalizedFractionalRate).toBe("0.0013");
    expect(decimal.normalizedFractionalRate).toBe("0.0013");
    expect(bps.normalizedFractionalRate).toBe("0.0013");
    expect(rateTimesVolumeToleranceMinor({ volume: moneyFromNumber(10000)!, printedRate: percent })).toBe(
      rateTimesVolumeToleranceMinor({ volume: moneyFromNumber(10000)!, printedRate: decimal }),
    );
    expect(rateTimesVolumeToleranceMinor({ volume: moneyFromNumber(10000)!, printedRate: decimal })).toBe(
      rateTimesVolumeToleranceMinor({ volume: moneyFromNumber(10000)!, printedRate: bps }),
    );
  });

  it("applies precision-aware rate, per-item, funding, and printed-control diagnostics", () => {
    const exact = printedMonetaryControl({
      id: "ctrl_exact",
      label: "Exact printed control",
      evidenceRefs: [],
      expectedAmount: moneyFromNumber(10)!,
      actualAmount: moneyFromNumber(10)!,
      derivationGroupId: "test",
    });
    const oneCent = printedMonetaryControl({
      id: "ctrl_rounding",
      label: "One-cent rounding",
      evidenceRefs: [],
      expectedAmount: { amountMinor: 1000, currency: "USD" },
      actualAmount: { amountMinor: 1001, currency: "USD" },
      derivationGroupId: "test",
      documentedOneCentRounding: true,
    });
    const greaterThanOneCent = printedMonetaryControl({
      id: "ctrl_bad",
      label: "Unexplained difference",
      evidenceRefs: [],
      expectedAmount: { amountMinor: 1000, currency: "USD" },
      actualAmount: { amountMinor: 1002, currency: "USD" },
      derivationGroupId: "test",
      documentedOneCentRounding: true,
    });

    expect(exact.status).toBe("pass");
    expect(oneCent.status).toBe("pass_with_rounding");
    expect(greaterThanOneCent.status).toBe("verification_required");

    const rateControl = diagnosticRateVolumeControl({
      id: "ctrl_rate",
      label: "Rate times volume",
      evidenceRefs: [],
      printedAmount: { amountMinor: 1300, currency: "USD" },
      volume: moneyFromNumber(10000)!,
      printedRate: parsePrintedRate("0.13%"),
      derivationGroupId: "test",
    });
    const materialRateControl = diagnosticRateVolumeControl({
      id: "ctrl_material_rate",
      label: "Material rate uncertainty",
      evidenceRefs: [],
      printedAmount: { amountMinor: 1300, currency: "USD" },
      volume: moneyFromNumber(1000000)!,
      printedRate: parsePrintedRate("0.1%"),
      derivationGroupId: "test",
      materialUncertaintyThresholdMinor: 100,
    });
    const perItemControl = diagnosticPerItemControl({
      id: "ctrl_item",
      label: "Per-item",
      evidenceRefs: [],
      printedAmount: { amountMinor: 1000, currency: "USD" },
      itemCount: 100,
      printedRate: parsePrintedRate("0.10"),
      derivationGroupId: "test",
    });
    const fundingComplete = fundingFormulaControl({
      id: "ctrl_funding",
      label: "Funding formula",
      evidenceRefs: [],
      expectedFundedAmount: { amountMinor: 9999, currency: "USD" },
      actualFundedAmount: { amountMinor: 10000, currency: "USD" },
      formulaComplete: true,
      derivationGroupId: "test",
    });
    const fundingIncomplete = fundingFormulaControl({
      id: "ctrl_funding_incomplete",
      label: "Incomplete funding formula",
      evidenceRefs: [],
      expectedFundedAmount: { amountMinor: 9999, currency: "USD" },
      actualFundedAmount: { amountMinor: 10000, currency: "USD" },
      formulaComplete: false,
      derivationGroupId: "test",
    });

    expect(rateControl.status).toBe("pass");
    expect(rateControl.toleranceMinor).toBe(rateTimesVolumeToleranceMinor({ volume: moneyFromNumber(10000)!, printedRate: parsePrintedRate("0.13%") }));
    expect(materialRateControl.status).toBe("limited");
    expect(perItemControl.status).toBe("pass");
    expect(perItemControl.toleranceMinor).toBe(perItemToleranceMinor({ itemCount: 100, printedRate: parsePrintedRate("0.10") }));
    expect(fundingComplete.status).toBe("pass");
    expect(fundingIncomplete.status).toBe("limited");
  });

  it("requires verification when rate representation is unknown", () => {
    const unknown = parsePrintedRate("rate shown in statement notes");
    expect(unknown.representation).toBe("unknown");
    expect(unknown.normalizedFractionalRate).toBeNull();
    expect(rateTimesVolumeToleranceMinor({ volume: moneyFromNumber(10000)!, printedRate: unknown })).toBeNull();
    expect(
      diagnosticRateVolumeControl({
        id: "ctrl_unknown",
        label: "Unknown rate",
        evidenceRefs: [],
        printedAmount: moneyFromNumber(10)!,
        volume: moneyFromNumber(10000)!,
        printedRate: unknown,
        derivationGroupId: "test",
      }).status,
    ).toBe("verification_required");
  });
});

function feeDocument(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: ["Synthetic canonical fee ledger fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}

function feeInterpretation(id: string, sourceOccurrenceId: string, label: string, amount: number): CanonicalFeeParserInterpretation {
  const money = moneyFromNumber(amount)!;
  return {
    id,
    sourceOccurrenceId,
    parserId: "synthetic_parser",
    parserVersion: null,
    label,
    amount: money,
    signedAmount: money,
    rowRole: "individual_charge",
    section: "FEES",
    pageNumber: 1,
    printedRate: null,
    printedPerItemRate: null,
    itemCount: null,
    volume: null,
    confidence: "high",
  };
}

function feeRow(input: { network?: string; description: string; amount: number; evidenceLine: string }) {
  return {
    network: input.network,
    description: input.description,
    amount: input.amount,
    sourceSection: "FEES",
    evidenceLine: input.evidenceLine,
    pageNumber: 1,
    confidence: "high",
  };
}

function ledgerFromRows(input: {
  documentId: string;
  lines: string[];
  rows: Record<string, unknown>[];
  printedTotal: number;
  delta?: number;
}) {
  return buildCanonicalFeeLedger({
    doc: feeDocument(input.lines),
    documentId: input.documentId,
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence: new Map<string, CanonicalEvidenceRecord>(),
    calculations: [],
    parserOutput: {
      feeLedger: {
        rows: input.rows,
        controls: [{ label: "Total Fees", rowSum: input.printedTotal, printedTotal: input.printedTotal, delta: input.delta ?? 0, evidenceLine: input.lines.at(-1) }],
        printedTotal: input.printedTotal,
        delta: input.delta ?? 0,
      },
    },
  });
}

function summaryFor(ledger: ReturnType<typeof ledgerFromRows>) {
  const control = ledger.controls[0];
  return {
    sourceInterpretationCount: ledger.parserInterpretations.length,
    canonicalSourceOccurrenceCount: ledger.sourceOccurrences.length,
    canonicalCountedChargeCount: ledger.rows.filter((row) => row.contributesToUniqueTotal).length,
    excludedControlSubtotalCount: ledger.rows.filter((row) => row.role === "section_subtotal" || row.role === "statement_control_total").length,
    duplicateAliasCount: ledger.rows.filter((row) => row.mergeReason === "same_source_occurrence").length,
    uniqueCanonicalTotalMinor: ledger.uniqueChargeTotal?.amountMinor ?? null,
    printedControlTotalMinor: control?.expectedAmount?.amountMinor ?? null,
    differenceMinor: control?.deltaMinor ?? null,
    ledgerStatus: ledger.status,
  };
}
