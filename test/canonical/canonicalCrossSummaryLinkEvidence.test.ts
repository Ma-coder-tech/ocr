import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCrossSummaryLinkEvidence } from "../../src/canonical/crossSummaryLinkEvidence.js";
import { makeEvidenceRecord } from "../../src/canonical/evidence.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeRollupAssessments } from "../../src/canonical/feeRollupEvidence.js";
import { moneyFromNumber } from "../../src/canonical/money.js";
import type { ParsedDocument } from "../../src/parser.js";
import type { CanonicalCalculationRecord, CanonicalEvidenceRecord } from "../../src/canonical/types.js";

describe("cross-summary link evidence v2", () => {
  it("proves fee recap, headline-to-fee, and headline/fee-to-funding links from comparable printed evidence", () => {
    const fixture = crossSummaryFixture(true);
    const layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);

    expect(layer.adjudicationPolicyVersion).toBe("cross_summary_reconciliation_adjudication_v1");
    expect(layer.relationships.filter((relationship) => relationship.status === "proven").map((relationship) => relationship.evaluatedCandidateType)).toEqual(
      expect.arrayContaining([
        "same_measure_same_population",
        "component_rollup",
      ]),
    );
    expect(
      layer.relationships.some((relationship) =>
        relationship.status === "proven" &&
        relationship.leftSummaryId.includes("fee_control") &&
        relationship.rightSummaryId === "summary_funding_fee_amount"),
    ).toBe(true);
    expect(
      layer.relationships.filter((relationship) => relationship.status === "proven").every((relationship) =>
        relationship.comparison.measure === "compatible" &&
        relationship.comparison.period === "same_statement_period" &&
        relationship.comparison.grain === "compatible" &&
        relationship.comparison.identifiers === "matched" &&
        relationship.comparison.explicitLinkEvidence === "present"),
    ).toBe(true);
    expect(layer.relationships.every((relationship) => relationship.countingTreatment === "reference_only_no_addition")).toBe(true);
    expect(
      layer.relationships
        .filter((relationship) => relationship.status === "proven")
        .every((relationship) => relationship.adjudication.outcome === "resolved_by_reusable_rule" && relationship.adjudication.reusableRuleId !== null),
    ).toBe(true);
    expect(fixture.input.feeLedger.uniqueChargeTotal).toEqual({ amountMinor: 1000, currency: "USD" });
  });

  it("keeps equal-dollar relationships unknown when explicit measure or funding-layout evidence is absent", () => {
    const fixture = crossSummaryFixture(false, true);
    const layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    const mysteryNode = layer.nodes.find((node) => node.printedLabel === "Mystery total")!;
    const mysteryRelationship = layer.relationships.find((relationship) => relationship.rightSummaryId === mysteryNode.id)!;
    const fundingRelationships = layer.relationships.filter((relationship) =>
      relationship.leftSummaryId.includes("funding_") || relationship.rightSummaryId.includes("funding_"),
    );

    expect(mysteryNode.amount).toEqual({ amountMinor: 1000, currency: "USD" });
    expect(mysteryRelationship.status).toBe("unknown");
    expect(mysteryRelationship.relationshipType).toBe("unknown");
    expect(mysteryRelationship.reasonCodes).toContain("explicit_link_evidence_missing");
    expect(fundingRelationships.length).toBeGreaterThan(0);
    expect(fundingRelationships.every((relationship) => relationship.status === "unknown")).toBe(true);
    expect(layer.limitations.join(" ")).toMatch(/matching dollar amounts|unknown|reference-only/i);
  });

  it("proves an exact printed section partition independently of a two-cent detail mismatch", () => {
    const fixture = crossSummaryFixture(true);
    const grand = fixture.input.feeLedger.controls.find((control) => control.basis === "grand_control")!;
    grand.status = "verification_required";
    grand.actualAmount = moneyFromNumber(9.98);
    grand.deltaMinor = -2;

    const layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    const headlineToGrand = layer.relationships.find(
      (relationship) => relationship.leftSummaryId === "summary_headline_fees" && relationship.rightSummaryId.includes(grand.id),
    )!;
    const componentRelationships = layer.relationships.filter(
      (relationship) => relationship.evaluatedCandidateType === "component_rollup",
    );

    expect(headlineToGrand.status).toBe("proven");
    expect(headlineToGrand.adjudication).toMatchObject({
      relationshipClass: "resolved_independent_printed_totals",
      reusableRuleId: "independent_printed_total_identity_v1",
    });
    expect(componentRelationships.every((relationship) => relationship.status === "proven")).toBe(true);
    expect(componentRelationships.every((relationship) => relationship.adjudication.relationshipClass === "resolved_complete_fee_partition")).toBe(true);
    expect(layer.feeRollups).toMatchObject([{ status: "proven_complete_exact", membershipStatus: "complete_non_overlapping", residualMinor: 0, residualAttribution: "not_needed_exact", countingTreatment: "reference_only_no_addition" }]);
    expect(fixture.input.feeLedger.uniqueChargeTotal).toEqual({ amountMinor: 1000, currency: "USD" });
  });

  it("withholds missing and overlapping partitions and does not excuse a small residual", () => {
    const fixture = crossSummaryFixture(true);
    const sections = fixture.input.feeLedger.controls.filter((control) => control.basis === "section_control");
    const originalAssignments = structuredClone(fixture.input.feeLedger.partitionSourceProvenance.assignments);
    sections[0]!.expectedAmount = { amountMinor: 601, currency: "USD" };
    let rollup = buildCanonicalFeeRollupAssessments(fixture.input.feeLedger)[0]!;
    expect(rollup).toMatchObject({ status: "unresolved", membershipStatus: "complete_non_overlapping", residualMinor: 1, residualAttribution: "unresolved" });
    expect(rollup.reasonCodes).toContain("nonzero_residual_lacks_exact_rounding_attribution");
    const secondAssignment = fixture.input.feeLedger.partitionSourceProvenance.assignments.find((item) => item.sectionControlRef === sections[1]!.id)!;
    secondAssignment.status = "ambiguous";
    secondAssignment.sectionControlRef = null;
    secondAssignment.candidateSectionControlRefs = [sections[0]!.id, sections[1]!.id];
    secondAssignment.ruleId = null;
    rollup = buildCanonicalFeeRollupAssessments(fixture.input.feeLedger)[0]!;
    expect(rollup.status).toBe("unresolved");
    expect(rollup.membershipStatus).toBe("overlapping_members");
    expect(rollup.overlappingFeeRowIds).toEqual([secondAssignment.feeRowId]);
    fixture.input.feeLedger.partitionSourceProvenance.assignments = structuredClone(originalAssignments);
    const unassigned = fixture.input.feeLedger.partitionSourceProvenance.assignments.find((item) => item.sectionControlRef === sections[1]!.id)!;
    unassigned.status = "unassigned";
    unassigned.sectionControlRef = null;
    unassigned.candidateSectionControlRefs = [];
    unassigned.printedSectionLabel = null;
    unassigned.ruleId = null;
    rollup = buildCanonicalFeeRollupAssessments(fixture.input.feeLedger)[0]!;
    expect(rollup.membershipStatus).toBe("incomplete_controls");
    expect(rollup.missingFeeRowIds).toEqual([unassigned.feeRowId]);
  });

  it("attributes a residual only when exact unrounded arithmetic reconstructs every printed total", () => {
    const fixture = crossSummaryFixture(true);
    const sections = fixture.input.feeLedger.controls.filter((control) => control.basis === "section_control");
    const grand = fixture.input.feeLedger.controls.find((control) => control.basis === "grand_control")!;
    sections[0]!.expectedAmount = { amountMinor: 601, currency: "USD" };
    grand.roundingBridge = {
      policyVersion: "fee_rollup_rounding_bridge_v1",
      method: "exact_unrounded_partition_bridge",
      sectionAmountsMicros: [
        { controlRef: sections[0]!.id, amountMicros: 6_005_000 },
        { controlRef: sections[1]!.id, amountMicros: 3_995_000 },
      ],
      grandAmountMicros: 10_000_000,
      roundingMode: "nearest_cent_half_away_from_zero",
      evidenceRefs: [...new Set([...sections.flatMap((section) => section.evidenceRefs), ...grand.evidenceRefs])],
    };
    let rollup = buildCanonicalFeeRollupAssessments(fixture.input.feeLedger)[0]!;
    expect(rollup).toMatchObject({ status: "proven_complete_with_rounding", residualMinor: 1, residualAttribution: "proven_exact_rounding_bridge" });
    expect(rollup.roundingEvidenceRefs.length).toBeGreaterThan(0);
    grand.roundingBridge.evidenceRefs = [...grand.evidenceRefs];
    rollup = buildCanonicalFeeRollupAssessments(fixture.input.feeLedger)[0]!;
    expect(rollup.status).toBe("unresolved");
    grand.roundingBridge.evidenceRefs = [...new Set([...sections.flatMap((section) => section.evidenceRefs), ...grand.evidenceRefs])];
    grand.roundingBridge.grandAmountMicros += 1;
    rollup = buildCanonicalFeeRollupAssessments(fixture.input.feeLedger)[0]!;
    expect(rollup.status).toBe("unresolved");
    expect(rollup.residualAttribution).toBe("unresolved");
  });

  it("adjudicates a warning-state funding ledger per directly printed total without accepting its detail reconciliation", () => {
    const fixture = crossSummaryFixture(true);
    const funding = (fixture.input.parserOutput.fundingBatchLedger as Record<string, unknown>);
    funding.status = "reconciled_with_warnings";
    funding.anomalyCount = 2;
    funding.feesChargedDelta = 18.6;

    const layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    const fundingRelationships = layer.relationships.filter((relationship) =>
      relationship.leftSummaryId.includes("funding_") || relationship.rightSummaryId.includes("funding_"),
    );

    expect(fundingRelationships).toHaveLength(4);
    expect(fundingRelationships.every((relationship) => relationship.status === "proven")).toBe(true);
    expect(
      fundingRelationships.every((relationship) =>
        relationship.adjudication.relationshipClass === "resolved_measure_scoped_funding_warning" &&
        relationship.adjudication.reusableRuleId === "measure_scoped_funding_warning_v1",
      ),
    ).toBe(true);
  });

  it("keeps small endpoint differences and unreconciled funding structures unknown", () => {
    const fixture = crossSummaryFixture(true);
    const funding = (fixture.input.parserOutput.fundingBatchLedger as Record<string, unknown>);
    funding.controlFeesChargedTotal = 10.02;
    funding.evidenceLine = "Total | $1,000.00 | $0.00 | $0.00 | $0.00 | $10.02 | $989.98";
    fixture.input.doc.rows[fixture.input.doc.rows.length - 1]!.content = String(funding.evidenceLine);

    let layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    let headlineToFundingFees = layer.relationships.find(
      (relationship) => relationship.leftSummaryId === "summary_headline_fees" && relationship.rightSummaryId === "summary_funding_fee_amount",
    )!;
    expect(headlineToFundingFees.status).toBe("unknown");
    expect(headlineToFundingFees.reasonCodes).toContain("amount_does_not_corroborate");
    expect(headlineToFundingFees.adjudication.relationshipClass).toBe("unresolved_amount_conflict");

    funding.controlFeesChargedTotal = 10;
    funding.evidenceLine = "Total | $1,000.00 | $0.00 | $0.00 | $0.00 | N/A | $990.00";
    fixture.input.doc.rows[fixture.input.doc.rows.length - 1]!.content = String(funding.evidenceLine);
    layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    headlineToFundingFees = layer.relationships.find(
      (relationship) => relationship.leftSummaryId === "summary_headline_fees" && relationship.rightSummaryId === "summary_funding_fee_amount",
    )!;
    expect(headlineToFundingFees.comparison.amount).toBe("corroborates");
    expect(headlineToFundingFees.status).toBe("unknown");
    expect(headlineToFundingFees.adjudication.relationshipClass).toBe("unresolved_incomplete_or_conflicting_controls");

    funding.status = "unreconciled";
    funding.evidenceLine = "Total | $1,000.00 | $0.00 | $0.00 | $0.00 | $10.00 | $990.00";
    fixture.input.doc.rows[fixture.input.doc.rows.length - 1]!.content = String(funding.evidenceLine);
    layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    headlineToFundingFees = layer.relationships.find(
      (relationship) => relationship.leftSummaryId === "summary_headline_fees" && relationship.rightSummaryId === "summary_funding_fee_amount",
    )!;
    expect(headlineToFundingFees.status).toBe("unknown");
    expect(headlineToFundingFees.adjudication.relationshipClass).toBe("unresolved_incomplete_or_conflicting_controls");
    expect(headlineToFundingFees.adjudication.reusableRuleId).toBeNull();
  });

  it("does not borrow a matching total from a neighboring summary table", () => {
    const fixture = crossSummaryFixture(true);
    fixture.input.doc.rows.splice(fixture.input.doc.rows.length - 1, 0, {
      content: "SUMMARY BY CARD TYPE",
      page: "page-1",
    });

    const layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);
    const fundingRelationships = layer.relationships.filter((relationship) =>
      relationship.leftSummaryId.includes("funding_") || relationship.rightSummaryId.includes("funding_"),
    );

    expect(fundingRelationships.length).toBeGreaterThan(0);
    expect(fundingRelationships.every((relationship) => relationship.status === "unknown")).toBe(true);
    expect(
      fundingRelationships.every(
        (relationship) => relationship.adjudication.relationshipClass === "unresolved_incomplete_or_conflicting_controls",
      ),
    ).toBe(true);
  });
});

function crossSummaryFixture(includeFundingHeader: boolean, includeMysteryControl = false) {
  const lines = [
    "Processor: Fiserv",
    "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00",
    "Fees Charged | -$10.00",
    "Total Amount Funded to Your Bank | $990.00",
    "Card Assessment Fee | -$6.00",
    "Monthly Service Fee | -$4.00",
    "Total Card Fees | -$6.00",
    "Total Miscellaneous Fees | -$4.00",
    "Total (Miscellaneous Fees and Card Fees) | -$10.00",
    ...(includeMysteryControl ? ["Mystery total | -$10.00"] : []),
    ...(includeFundingHeader
      ? ["Date | Batch | Amount Submitted | Third Party Transactions | Adjustments | Chargebacks | Fees Charged | Amount Funded"]
      : []),
    "Total | $1,000.00 | $0.00 | $0.00 | $0.00 | $10.00 | $990.00",
  ];
  const doc = document(lines);
  const base = buildCanonicalStatementFactsFromParsedDocument(doc, {
    sourceFileName: "cross-summary-links.pdf",
    businessType: "restaurant",
    preferExtractedRows: true,
  });
  const evidence = new Map<string, CanonicalEvidenceRecord>(base.evidence.map((item) => [item.id, item]));
  const fundedEvidence = makeEvidenceRecord({
    documentId: base.identity.sourceDocumentRef,
    pageNumber: 1,
    rowIndex: 4,
    extractedText: lines[4]!,
    sourceRole: "selected_fact",
  });
  evidence.set(fundedEvidence.id, fundedEvidence);
  base.identity.statementPeriod = selectedFact({
    value: { start: "2026-01-01", end: "2026-01-31" },
    confidence: "high",
    evidenceRefs: [base.financialFacts.processedSales.evidenceRefs[0]!],
    selectionReason: "Synthetic statement-period evidence.",
  });
  base.financialFacts.amountFunded = selectedFact({
    value: moneyFromNumber(990)!,
    confidence: "high",
    evidenceRefs: [fundedEvidence.id],
    selectionReason: "Printed funded total.",
  });
  const calculations: CanonicalCalculationRecord[] = [];
  const feeLedger = buildCanonicalFeeLedger({
    doc,
    documentId: base.identity.sourceDocumentRef,
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows: [
          feeRow("Card Assessment Fee", 6, lines[5]!, "CF", "cardFees"),
          feeRow("Monthly Service Fee", 4, lines[6]!, "MISC", "miscellaneousFees"),
        ],
        controls: [
          control("Total Card Fees", 6, lines[7]!),
          control("Total Miscellaneous Fees", 4, lines[8]!),
          control("Total (Miscellaneous Fees and Card Fees)", 10, lines[9]!),
          ...(includeMysteryControl ? [control("Mystery total", 10, "Mystery total | -$10.00")] : []),
        ],
        printedTotal: 10,
        delta: 0,
      },
    },
  });
  const fundingBatchLedger = {
    status: "reconciled",
    evidenceLine: lines.at(-1),
    controlSubmittedTotal: 1000,
    controlFeesChargedTotal: 10,
    controlFundedTotal: 990,
    submittedDelta: 0,
    feesChargedDelta: 0,
    fundedDelta: 0,
  };
  return {
    input: {
      doc,
      documentId: base.identity.sourceDocumentRef,
      identity: base.identity,
      financialFacts: base.financialFacts,
      feeLedger,
      parserOutput: { fundingBatchLedger },
      evidence,
    },
  };
}

function feeRow(description: string, amount: number, evidenceLine: string, type: string, bucket: string) {
  return { description, amount, evidenceLine, sourceSection: "FEES CHARGED", pageNumber: 1, confidence: "high", type, bucket };
}

function control(label: string, amount: number, evidenceLine: string) {
  return { label, rowSum: amount, printedTotal: amount, delta: 0, evidenceLine };
}

function document(lines: string[]): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: ["Synthetic cross-summary link fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}
