import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalFeeOwnershipActionability } from "../src/canonical/feeOwnershipActionability.js";
import { buildCanonicalFeeLedger } from "../src/canonical/feeLedger.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { buildF4DecisionGraph, evaluateF4Shadow, tryEvaluateF4Shadow } from "../src/claimAuthorityF4/shadow.js";
import { createF3PublicSnapshot } from "../src/claimAuthorityF3/snapshot.js";
import type { F3PublicSnapshot } from "../src/claimAuthorityF3/types.js";
import type { ParsedDocument } from "../src/parser.js";

const pilotDir = new URL("../data/authority/f3-us-visa-pilot/", import.meta.url);
const snapshot = JSON.parse(readFileSync(new URL("snapshot.json", pilotDir), "utf8")) as F3PublicSnapshot;

function document(lines: string[]): ParsedDocument {
  return { sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"), extraction: { mode: "structured", qualityScore: 1, reasons: ["F4 synthetic statement"],
      lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true } };
}

function fixture(): CanonicalStatementAnalysis {
  const statement = document([
    "Merchant: F4 Synthetic Cafe", "Processor: Fiserv", "Statement Period: 09/01/2026 - 09/30/2026",
    "Total Amount Submitted | $100.00", "Fees Charged | -$1.00", "QUAL DISC | -$1.00",
  ]);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(statement,
    { sourceFileName: "f4-synthetic.pdf", preferExtractedRows: true });
  const evidence = new Map();
  const calculations: CanonicalStatementAnalysis["calculations"] = [];
  const ledger = buildCanonicalFeeLedger({ doc: statement, documentId: analysis.identity.sourceDocumentRef,
    matched: { driverId: "f4_synthetic_parser", driverName: "F4 synthetic parser" }, evidence, calculations,
    parserOutput: { feeLedger: { rows: [{ network: null, type: null, description: "QUAL DISC", amount: 1,
      sourceSection: "Service Charges", evidenceLine: "QUAL DISC | -$1.00", pageNumber: 1, confidence: "high" }],
      controls: [{ label: "Total Fees", rowSum: 1, printedTotal: 1, delta: 0, evidenceLine: "Fees Charged | -$1.00" }],
      printedTotal: 1, delta: 0 } } });
  analysis.feeLedger = ledger;
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(ledger);
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  const period = { start: "2026-09-01", end: "2026-09-30" };
  analysis.identity.statementPeriod = { value: period, status: "selected", confidence: "high",
    selectedCandidateId: "f4_synthetic_period", evidenceRefs: [], selectionReason: "synthetic_test_period",
    candidates: [{ id: "f4_synthetic_period", role: "user_supplied", value: period, evidenceRefs: [],
      parserId: null, parserVersion: null, extractionMethod: "manual_input", confidence: "high",
      selected: true, selectionReason: "synthetic_test_period", rejectionReason: null }], limitations: [] };
  return analysis;
}

function decision(analysis: CanonicalStatementAnalysis, suffix: string) {
  const report = evaluateF4Shadow({ analysis });
  const found = report.decisions.find((item) => item.key.endsWith(suffix));
  if (!found) throw new Error(`Missing decision ${suffix}`);
  return found;
}

function setPeriod(analysis: CanonicalStatementAnalysis, start: string, end: string): void {
  const value = { start, end };
  analysis.identity.statementPeriod.value = value;
  analysis.identity.statementPeriod.candidates[0].value = value;
}

describe("F4 shadow migration", () => {
  it("keeps an observed broad component while refusing label-based processor markup and private conclusions", () => {
    const analysis = fixture();
    const row = analysis.feeLedger.rows[0];
    expect(row).toBeDefined();
    expect(analysis.feeOwnershipActionability.rowClassifications[0]?.selected.category).toBe("processor_markup");
    expect(decision(analysis, ":component")).toMatchObject({ status: "supported", dimension: "economic_broad_category" });
    expect(decision(analysis, ":markup")).toMatchObject({ status: "refused", dimension: "economic_broad_category" });
    expect(decision(analysis, ":collector")).toMatchObject({ status: "unknown", dimension: "collector" });
    expect(decision(analysis, ":economic_beneficiary")).toMatchObject({ status: "unknown", dimension: "economic_beneficiary" });
    expect(decision(analysis, ":contractual_controller")).toMatchObject({ status: "unknown", dimension: "contractual_controller" });
    expect(decision(analysis, ":merchant_facing_price_controller")).toMatchObject({ status: "unknown", dimension: "merchant_facing_price_controller" });
    expect(decision(analysis, ":retained_margin_recipient")).toMatchObject({ status: "unknown", dimension: "retained_margin_recipient" });
    expect(decision(analysis, ":actionability")).toMatchObject({ status: "refused", dimension: "actionability" });
    expect(decision(analysis, ":savings")).toMatchObject({ status: "refused", dimension: "savings" });
    const report = evaluateF4Shadow({ analysis });
    expect(report.comparisons.find((item) => item.decisionKey.endsWith(":markup"))).toMatchObject({
      comparisonBasis: "exact_semantic", currentValue: "processor_markup", currentStatus: "supported",
      shadowStatus: "refused", relation: "stronger_refusal",
    });
    expect(report.comparisons.find((item) => item.decisionKey.endsWith(":component"))?.relation).toBe("agreement");
    expect(report.comparisons.find((item) => item.decisionKey.endsWith(":collector"))?.relation).toBe("unresolved_unknown");
    expect(report.comparisons.reduce<Record<string, number>>((counts, item) => {
      counts[item.relation] = (counts[item.relation] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ agreement: 3, stronger_refusal: 2, unresolved_unknown: 3 });
  });

  it("binds only source-backed, canonically included interchange detail to the broad component", () => {
    const analysis = fixture();
    const row = analysis.feeLedger.rows[0];
    row.role = "interchange_detail_row";
    row.contributionDecision.reasonCode = "pass_through_fee_charge_included";
    expect(decision(analysis, ":component").status).toBe("supported");
    expect(decision(analysis, ":markup").status).toBe("refused");
    expect(decision(analysis, ":collector").status).toBe("unknown");
    expect(decision(analysis, ":contractual_controller").status).toBe("unknown");
    expect(decision(analysis, ":actionability").status).toBe("refused");
    expect(decision(analysis, ":savings").status).toBe("refused");

    row.contributionDecision.reasonCode = "interchange_without_control_coverage";
    expect(decision(analysis, ":component").status).toBe("unknown");
    row.contributionDecision.reasonCode = "pass_through_fee_charge_included";
    analysis.feeLedger.sourceOccurrences[0].pageNumber = null;
    expect(decision(analysis, ":component").status).toBe("unknown");
  });

  it("holds canonical money, selected semantics, opportunity and customer output byte-for-byte, and replays deterministically", () => {
    const analysis = fixture();
    const before = JSON.stringify(analysis);
    const graph = buildF4DecisionGraph(analysis);
    const first = evaluateF4Shadow({ analysis });
    const replay = evaluateF4Shadow({ analysis });
    expect(first).toEqual(replay);
    expect(first.reportId).toBe(replay.reportId);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.f1GraphId).toBe(graph.graphId);
    expect(graph.claims.every((claim) => claim.authority.satisfiedLanes.length === 0)).toBe(true);
    expect(graph.claims.find((claim) => claim.candidateKey.endsWith(":markup")))
      .toMatchObject({ value: { representation: "semantic_code", code: "processor_markup" },
        resolution: { status: "candidate_only" } });
    expect(JSON.stringify(analysis)).toBe(before);
    expect(first.standing).toBe("shadow_only_no_production_consumer");
    expect(first.decisions.every((item) => item.satisfiedLanes.every((lane) => lane !== "merchant_private_contract_or_correspondence"))).toBe(true);
  });

  it("uses exact F3 scope, date and dimension but does not turn a public benchmark into merchant applicability", () => {
    const analysis = fixture();
    expect(analysis.identity.statementPeriod.value).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    const rowId = analysis.feeLedger.rows[0].id;
    const scope = snapshot.assertions[0].scope;
    const pdf = readFileSync(new URL("visa-usa-interchange-reimbursement-fees-2026-04-18.pdf", pilotDir));
    expect(createHash("sha256").update(pdf).digest("hex")).toBe("2c34e719746a8710e0f78342b9f435b637911f6ed072ae1b1728a06768b2b5bd");
    const input = { analysis, publicProbe: { feeRowId: rowId, scope, snapshot, snapshotId: snapshot.snapshotId } };
    const report = evaluateF4Shadow(input);
    expect(report.publicProbe?.resolution).toMatchObject({ status: "refused", reasonCode: "publication_after_period_start" });
    expect(report.publicProbe?.merchantApplicability).toBe("not_established");
    expect(report.decisions.find((item) => item.key.endsWith(":benchmark"))).toMatchObject({ status: "unknown" });
    const later = fixture();
    setPeriod(later, "2026-09-10", "2026-09-30");
    expect(evaluateF4Shadow({ ...input, analysis: later }).publicProbe?.resolution).toMatchObject({
      status: "missing_authority", reasonCode: "effective_end_unresolved",
    });
    const earlier = fixture();
    setPeriod(earlier, "2026-04-01", "2026-04-15");
    expect(evaluateF4Shadow({ ...input, analysis: earlier }).publicProbe?.resolution).toMatchObject({
      status: "refused", reasonCode: "period_not_covered",
    });
    expect(evaluateF4Shadow({ ...input, analysis: later, publicProbe: { ...input.publicProbe,
      scope: { ...scope, geography: "CA" } } }).publicProbe?.resolution).toMatchObject({
      status: "missing_authority", reasonCode: "scope_incompatible",
    });
    const syntheticBounded = { ...snapshot.assertions[0], assertionId: "test_only_bounded_reference",
      version: "f4_test_fixture_v1", source: { ...snapshot.assertions[0].source,
        documentId: "f4_test_fixture_bounded_publication", publisher: "F4 Test Publisher",
        sha256: createHash("sha256").update("F4 test-only bounded publication").digest("hex") },
      admission: { ...snapshot.assertions[0].admission, reviewerId: "f4_test_fixture_only",
        decisionId: "f4_test_fixture_only" },
      validPeriod: { state: "explicit_bounded" as const, start: "2026-04-18", end: "2026-12-31" },
      limitations: ["Synthetic test fixture; no real Visa effective end is asserted."],
    };
    const noDimension = createF3PublicSnapshot(snapshot.recordedAt,
      [{ ...syntheticBounded, dimensions: ["cadence"] }]);
    expect(evaluateF4Shadow({ ...input, analysis: later, publicProbe: { ...input.publicProbe,
      snapshot: noDimension, snapshotId: noDimension.snapshotId } }).publicProbe?.resolution).toMatchObject({
      status: "missing_authority", reasonCode: "dimension_not_authorized",
    });
    // An independently authorized bounded fixture would resolve the public period,
    // while merchant applicability and downstream conclusions still remain closed.
    const bounded = createF3PublicSnapshot(snapshot.recordedAt, [syntheticBounded]);
    const boundedReport = evaluateF4Shadow({ ...input, analysis: later, publicProbe: {
      ...input.publicProbe, snapshot: bounded, snapshotId: bounded.snapshotId } });
    expect(boundedReport.publicProbe?.resolution).toMatchObject({ status: "matched", reasonCode: "admitted_match" });
    expect(boundedReport.publicProbe?.merchantApplicability).toBe("not_established");
    expect(boundedReport.decisions.find((item) => item.key.endsWith(":benchmark"))?.status).toBe("unknown");
    expect(boundedReport.decisions.find((item) => item.key.endsWith(":savings"))?.status).toBe("refused");
    expect(boundedReport.decisions.find((item) => item.key.endsWith(":actionability"))?.status).toBe("refused");
    expect(boundedReport.decisions.find((item) => item.key.endsWith(":contractual_controller"))?.status).toBe("unknown");
    for (const [field, value] of [["population", "unrelated_transactions"], ["basis", "unrelated_basis"], ["unit", "basis_points"]] as const) {
      expect(evaluateF4Shadow({ ...input, analysis: later, publicProbe: { ...input.publicProbe,
        scope: { ...scope, [field]: value } } }).publicProbe?.resolution).toMatchObject({
        status: "missing_authority", reasonCode: "scope_incompatible",
      });
    }
    const conflict = createF3PublicSnapshot(snapshot.recordedAt, [...bounded.assertions,
      { ...bounded.assertions[0], assertionId: "test_only_conflicting_rate", value: { kind: "rate", decimal: "0.0310" } }]);
    const conflictReport = evaluateF4Shadow({ ...input, analysis: later, publicProbe: {
      ...input.publicProbe, snapshot: conflict, snapshotId: conflict.snapshotId } });
    expect(conflictReport.publicProbe?.resolution).toMatchObject({ status: "conflict", reasonCode: "conflicting_assertions" });
    const reversed = createF3PublicSnapshot(snapshot.recordedAt, [...conflict.assertions].reverse());
    expect(reversed.snapshotId).toBe(conflict.snapshotId);
    expect(evaluateF4Shadow({ ...input, analysis: later, publicProbe: {
      ...input.publicProbe, snapshot: reversed, snapshotId: reversed.snapshotId } }).publicProbe?.resolution)
      .toEqual(conflictReport.publicProbe?.resolution);
    const tampered = structuredClone(snapshot);
    tampered.assertions[0].dimensions = ["cadence"];
    expect(evaluateF4Shadow({ ...input, publicProbe: { ...input.publicProbe, snapshot: tampered } }).publicProbe).toMatchObject({
      resolution: null, failureCode: "invalid_pinned_authority_input",
    });
  });

  it("lets completeness gates block savings independently of an observed fee component", () => {
    const analysis = fixture();
    analysis.financialFacts.totalFees.status = "unavailable";
    analysis.financialFacts.totalFees.value = null;
    analysis.feeLedger.controls = [];
    expect(decision(analysis, ":component").status).toBe("supported");
    const saving = decision(analysis, ":savings");
    expect(saving.status).toBe("refused");
    expect(saving.missingGates).toEqual(expect.arrayContaining(["statement_total", "fee_composition", "savings"]));
  });

  it("does not turn a parser label or selected fee amount into source-backed component proof", () => {
    const analysis = fixture();
    analysis.feeLedger.sourceOccurrences[0].pageNumber = null;
    expect(decision(analysis, ":component")).toMatchObject({ status: "unknown" });
    expect(decision(analysis, ":markup")).toMatchObject({ status: "refused" });
  });

  it("fails closed on invalid canonical input or an invalid public pin", () => {
    const analysis = fixture();
    analysis.validation.status = "invalid";
    expect(tryEvaluateF4Shadow({ analysis })).toMatchObject({ status: "unavailable", report: null });
    const duplicate = fixture();
    duplicate.feeOwnershipActionability.rowClassifications.push(
      structuredClone(duplicate.feeOwnershipActionability.rowClassifications[0]));
    expect(tryEvaluateF4Shadow({ analysis: duplicate })).toMatchObject({ status: "unavailable", report: null });
    expect(() => buildF4DecisionGraph(fixture(), "nonexistent_row")).toThrow(/public probe row absent/);
  });
});
