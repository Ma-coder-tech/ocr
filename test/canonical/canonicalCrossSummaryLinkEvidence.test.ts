import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCrossSummaryLinkEvidence } from "../../src/canonical/crossSummaryLinkEvidence.js";
import { makeEvidenceRecord } from "../../src/canonical/evidence.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { moneyFromNumber } from "../../src/canonical/money.js";
import type { ParsedDocument } from "../../src/parser.js";
import type { CanonicalCalculationRecord, CanonicalEvidenceRecord } from "../../src/canonical/types.js";

describe("cross-summary link evidence v2", () => {
  it("proves fee recap, headline-to-fee, and headline/fee-to-funding links from comparable printed evidence", () => {
    const fixture = crossSummaryFixture(true);
    const layer = buildCanonicalCrossSummaryLinkEvidence(fixture.input);

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
