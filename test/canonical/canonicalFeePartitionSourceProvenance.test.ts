import { describe, expect, it } from "vitest";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeRollupAssessments } from "../../src/canonical/feeRollupEvidence.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("fee partition source provenance v1", () => {
  it("assigns rows to exact printed source sections while preserving orthogonal arithmetic controls", () => {
    const ledger = ledgerFrom({
      rows: [
        row("Interchange row", 6, "TRANSACTION FEES", "Interchange charges", "Interchange row | $100.00 | 6.00% | -$6.00", { volumeBasis: 100 }),
        row("Service row", 4, "TRANSACTION FEES", "Service charges", "Service row | 20 | 0.20 | -$4.00", { count: 20 }),
        row("Account row", 1, "ACCOUNT FEES", "Fees", "Account row | -$1.00"),
      ],
      controls: [
        control("Total Transaction Fees", 10),
        control("Total Account Fees", 1),
        control("Total Interchange Charges", 6),
        control("Total Service Charges", 4),
        control("Total Fees", 1),
        control("Generic Fee Grand Total", 11),
      ],
    });

    const provenance = ledger.partitionSourceProvenance;
    expect(provenance).toMatchObject({
      status: "available",
      assignmentMode: "explicit_source_section_labels",
      authority: "diagnostic_relationship_only",
    });
    expect(provenance.assignments.every((assignment) => assignment.status === "assigned")).toBe(true);
    expect(provenance.assignments.map((assignment) => assignment.printedSectionLabel)).toEqual([
      "Total Transaction Fees",
      "Total Transaction Fees",
      "Total Account Fees",
    ]);
    expect(provenance.sectionControlRefs).toHaveLength(2);
    expect(provenance.arithmeticControlRefs).toHaveLength(3);
    expect(buildCanonicalFeeRollupAssessments(ledger)[0]).toMatchObject({
      status: "proven_complete_exact",
      membershipStatus: "complete_non_overlapping",
      residualMinor: 0,
    });
  });

  it("preserves complete rate-volume and per-item operands and distinguishes amount-only and partial rows", () => {
    const ledger = ledgerFrom({
      rows: [
        row("Rate row", 6, "TRANSACTION FEES", "Interchange charges", "Rate row | $100.00 | 6.00% | -$6.00", { volumeBasis: 100 }),
        row("Per item row", 4, "TRANSACTION FEES", "Service charges", "Per item row | 20 | 0.20 | -$4.00", { count: 20 }),
        row("Flat row", 1, "ACCOUNT FEES", "Fees", "Flat row | -$1.00"),
        row("Count without rate", 1, "ACCOUNT FEES", "Fees", "Count without rate | 3 items | -$1.00", { count: 3 }),
      ],
      controls: [control("Total Transaction Fees", 10), control("Total Account Fees", 2), control("Generic Fee Grand Total", 12)],
    });
    const arithmetic = new Map(
      ledger.partitionSourceProvenance.rowArithmetic.map((item) => [ledger.rows.find((row) => row.id === item.feeRowId)!.selectedLabel, item]),
    );

    expect(arithmetic.get("Rate row")).toMatchObject({ status: "complete", formulaBasis: "rate_times_volume", volumeBasis: { amountMinor: 10000 }, chargedAmount: { amountMinor: 600 } });
    expect(arithmetic.get("Rate row")!.fieldEvidenceRefs.rate.length).toBeGreaterThan(0);
    expect(arithmetic.get("Per item row")).toMatchObject({ status: "complete", formulaBasis: "per_item", itemCount: 20, chargedAmount: { amountMinor: 400 } });
    expect(arithmetic.get("Flat row")).toMatchObject({ status: "charged_amount_only", formulaBasis: "unknown" });
    expect(arithmetic.get("Count without rate")).toMatchObject({ status: "partial", missingFields: ["per_item_rate"] });
  });

  it("promotes safely recovered table operands into arithmetic provenance", () => {
    const ledger = ledgerFrom({
      rows: [
        row("DISC 1", 0.56, "TRANSACTION FEES", "Fees", "08/31/25 | CF | DISC 1 | 281.07 | 0.00200 | -$0.56"),
        row("OTHER ITEM FEES", 0.3, "TRANSACTION FEES", "Fees", "08/31/25 | CF | OTHER ITEM FEES | 3.00 | 0.10000 | -$0.30"),
        row("KILOBYTE AUTH FEE US", 0.04, "TRANSACTION FEES", "Fees", "08/31/25 | CF | KILOBYTE AUTH FEE US | 18.35 | 0.00229 | -$0.04"),
      ],
      controls: [control("Total Transaction Fees", 0.9), control("Generic Fee Grand Total", 0.9)],
    });
    const arithmetic = new Map(
      ledger.partitionSourceProvenance.rowArithmetic.map((item) => [ledger.rows.find((row) => row.id === item.feeRowId)!.selectedLabel, item]),
    );

    expect(arithmetic.get("DISC 1")).toMatchObject({ status: "complete", formulaBasis: "rate_times_volume", operandRecovery: { status: "recovered" } });
    expect(arithmetic.get("OTHER ITEM FEES")).toMatchObject({ status: "complete", formulaBasis: "per_item", operandRecovery: { status: "recovered" } });
    expect(arithmetic.get("KILOBYTE AUTH FEE US")).toMatchObject({
      status: "complete",
      formulaBasis: "source_units_times_per_unit",
      sourceUnitBasis: "18.35",
      sourceUnit: "kilobytes",
      operandRecovery: { status: "recovered" },
    });
  });

  it("keeps duplicate section candidates ambiguous instead of choosing by amount", () => {
    const ledger = ledgerFrom({
      rows: [row("Account row", 1, "ACCOUNT FEES", "Fees", "Account row | -$1.00")],
      controls: [control("Total Account Fees", 1), control("Total Account Charges", 1), control("Generic Fee Grand Total", 1)],
    });
    expect(ledger.partitionSourceProvenance.status).toBe("partial");
    expect(ledger.partitionSourceProvenance.assignments[0]).toMatchObject({
      status: "ambiguous",
      sectionControlRef: null,
    });
    expect(ledger.partitionSourceProvenance.assignments[0]!.candidateSectionControlRefs).toHaveLength(2);
    expect(buildCanonicalFeeRollupAssessments(ledger)[0]!.status).toBe("unresolved");
  });

  it("proves a one-cent residual only when exact printed operands reproduce rows, sections, and grand total", () => {
    const ledger = ledgerFrom({
      rows: [
        row("Alpha", 6.01, "SECTION A FEES", "Fees", "Alpha | 1 | 6.005 | -$6.01", { count: 1 }),
        row("Beta", 4, "SECTION B FEES", "Fees", "Beta | 1 | 3.995 | -$4.00", { count: 1 }),
      ],
      controls: [control("Total Section A Fees", 6.01), control("Total Section B Fees", 4), control("Generic Fee Grand Total", 10)],
    });
    const rollup = buildCanonicalFeeRollupAssessments(ledger)[0]!;

    expect(rollup).toMatchObject({
      status: "proven_complete_with_rounding",
      residualMinor: 1,
      residualAttribution: "proven_exact_rounding_bridge",
      sourceArithmetic: {
        status: "proven_rounding",
        reasonCode: "exact_source_arithmetic_proves_rounding",
        reconstructedFeeRowIds: expect.arrayContaining(ledger.rows.map((item) => item.id)),
        incompleteFeeRowIds: [],
        ambiguousFeeRowIds: [],
        mismatchedFeeRowIds: [],
        grandAmount: { numeratorMinorUnits: "1000", denominator: "1", roundedAmountMinor: 1000 },
      },
    });
    expect(rollup.sourceArithmetic.sectionAmounts.map((item) => item.reproducesPrintedTotal)).toEqual([true, true]);
    expect(rollup.roundingEvidenceRefs.length).toBeGreaterThan(0);
  });

  it("withholds rounding when any participating row lacks source operands", () => {
    const ledger = ledgerFrom({
      rows: [
        row("Alpha", 6.01, "SECTION A FEES", "Fees", "Alpha | -$6.01"),
        row("Beta", 4, "SECTION B FEES", "Fees", "Beta | 1 | 3.995 | -$4.00", { count: 1 }),
      ],
      controls: [control("Total Section A Fees", 6.01), control("Total Section B Fees", 4), control("Generic Fee Grand Total", 10)],
    });
    const rollup = buildCanonicalFeeRollupAssessments(ledger)[0]!;

    expect(rollup.status).toBe("unresolved");
    expect(rollup.sourceArithmetic).toMatchObject({ status: "unresolved", reasonCode: "incomplete_source_arithmetic" });
    expect(rollup.sourceArithmetic.incompleteFeeRowIds).toHaveLength(1);
  });

  it("withholds rounding when exact source arithmetic does not reproduce a printed row charge", () => {
    const ledger = ledgerFrom({
      rows: [
        row("Alpha", 6.01, "SECTION A FEES", "Fees", "Alpha | 1 | 6.004 | -$6.01", { count: 1 }),
        row("Beta", 4, "SECTION B FEES", "Fees", "Beta | 1 | 3.995 | -$4.00", { count: 1 }),
      ],
      controls: [control("Total Section A Fees", 6.01), control("Total Section B Fees", 4), control("Generic Fee Grand Total", 10)],
    });
    const rollup = buildCanonicalFeeRollupAssessments(ledger)[0]!;

    expect(rollup.status).toBe("unresolved");
    expect(rollup.sourceArithmetic).toMatchObject({ status: "unresolved", reasonCode: "source_arithmetic_row_mismatch" });
    expect(rollup.sourceArithmetic.mismatchedFeeRowIds).toHaveLength(1);
  });
});

function ledgerFrom(input: { rows: Record<string, unknown>[]; controls: Record<string, unknown>[] }) {
  const lines = [...input.rows.map((item) => String(item.evidenceLine)), ...input.controls.map((item) => String(item.evidenceLine))];
  return buildCanonicalFeeLedger({
    doc: document(lines),
    parserOutput: { feeLedger: { rows: input.rows, controls: input.controls, printedTotal: Number(input.controls.at(-1)!.printedTotal), delta: 0 } },
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    documentId: "doc_fee_partition_provenance",
    evidence: new Map(),
    calculations: [],
  });
}

function row(description: string, amount: number, sourceSection: string, type: string, evidenceLine: string, extra: Record<string, unknown> = {}) {
  return { description, amount, sourceSection, type, bucket: sourceSection === "TRANSACTION FEES" ? "cardFees" : "miscellaneousFees", evidenceLine, pageNumber: 1, confidence: "high", ...extra };
}

function control(label: string, amount: number) {
  return { label, rowSum: amount, printedTotal: amount, delta: 0, evidenceLine: `${label} | -$${amount.toFixed(2)}` };
}

function document(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, reasons: ["Synthetic fee partition provenance fixture."], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true },
  };
}
