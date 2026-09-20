import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { createF1ClaimGraph } from "../src/claimAuthorityF1/graph.js";
import type { F1ClaimDraft } from "../src/claimAuthorityF1/types.js";
import { compareAdmittedPublicRate } from "../src/claimAuthorityF3/comparison.js";
import { resolveAdmittedPublicClaims } from "../src/claimAuthorityF3/resolver.js";
import { createF3PublicSnapshot, validateF3PublicSnapshot } from "../src/claimAuthorityF3/snapshot.js";
import type { F3Period, F3PublicAssertion, F3PublicSnapshot } from "../src/claimAuthorityF3/types.js";
import type { ParsedDocument } from "../src/parser.js";

const directory = fileURLToPath(new URL("../data/authority/f3-us-visa-pilot/", import.meta.url));
const pdf = readFileSync(`${directory}visa-usa-interchange-reimbursement-fees-2026-04-18.pdf`);
const snapshot = JSON.parse(readFileSync(`${directory}snapshot.json`, "utf8")) as F3PublicSnapshot;
const sourceUrl = "https://usa.visa.com/content/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf";
const sourceSha256 = "2c34e719746a8710e0f78342b9f435b637911f6ed072ae1b1728a06768b2b5bd";
const rows = [
  { id: "visa_us_credit_voucher_non_passenger_consumer_credit_2026_04_18", population: "non_passenger_transport_consumer_credit_credit_voucher", decimal: "0.0176", printed: "Non-Passenger Transport — Consumer Credit 1.76%" },
  { id: "visa_us_credit_voucher_mail_phone_ecommerce_consumer_credit_2026_04_18", population: "mail_phone_order_ecommerce_consumer_credit_credit_voucher", decimal: "0.0205", printed: "Mail/Phone Order and eCommerce Merchants — Consumer Credit 2.05%" },
  { id: "visa_us_credit_voucher_debit_2026_04_18", population: "debit_credit_voucher", decimal: "0.0000", printed: "Credit Voucher — Debit 0.00%" },
] as const;

function context(period: F3Period) {
  const lines = ["Merchant: F3 Synthetic Test Merchant", "Processor: Fiserv", `Statement Period: ${period.start} - ${period.end}`, "Fees Charged | -$30.00"];
  const document: ParsedDocument = {
    sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })), textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, reasons: ["F3 hand-authored fixture"], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true },
  };
  const analysis: CanonicalStatementAnalysis = buildCanonicalRuntimeAnalysis({ document, businessType: "restaurant_food_beverage", runtimeDocumentRef: "f3_visa_pilot_synthetic_statement" }).analysis;
  const subject = { kind: "fact", path: "financialFacts.processorStatedRate", selectedCandidateId: null } as const;
  const draft: F1ClaimDraft = {
    candidateKey: "visa_us_credit_voucher_benchmark", subject, dimension: "benchmark", semanticCode: "published_benchmark",
    value: { kind: "known", representation: "semantic_code", code: "published_benchmark" },
    reasoning: { primaryClass: "governed_public_dependency", supportingClasses: ["governed_public_dependency"], ruleId: "f3_visa_pilot_shadow_test", ruleVersion: "v1" },
    authority: { requiredLanes: [], satisfiedLanes: [], assessment: "not_evaluated" },
    resolution: { status: "candidate_only", reasonCode: "hand_authored_test", blockedDimensions: [] },
    temporal: period, universality: "merchant_account_specific", evidenceRefs: [], calculationRefs: [], canonicalRefs: [], policyDependency: null,
  };
  const graph = createF1ClaimGraph(analysis, [draft]);
  const claimId = graph.claims[0]!.claimId;
  return { analysis, graph, claimId, observedCanonicalRef: subject };
}

function query(period: F3Period, assertion: F3PublicAssertion, pinned = snapshot) {
  const ctx = context(period);
  return { ...ctx, snapshot: pinned, snapshotId: pinned.snapshotId, scope: assertion.scope };
}

describe("real U.S. Visa F3 admission pilot", () => {
  it("pins the exact Visa bytes and only the three source-supported U.S. benchmark rows", async () => {
    expect(createHash("sha256").update(pdf).digest("hex")).toBe(sourceSha256);
    const sourcePdf = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
    const introduction = (await (await sourcePdf.getPage(3)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
    expect(introduction).toContain("within the 50 United States and the District of Columbia");
    const page = await sourcePdf.getPage(23);
    const extracted = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
    expect(extracted).toContain("Visa U.S.A. Other Transactions Interchange Reimbursement Fees");
    expect(extracted).toContain("Rates Effective April 18, 2026");
    expect(extracted).toContain("Credit Voucher Transaction Type Rate");
    for (const row of rows) expect(extracted).toContain(row.printed);
    validateF3PublicSnapshot(snapshot);
    expect(createF3PublicSnapshot(snapshot.recordedAt, snapshot.assertions)).toEqual(snapshot);
    expect(snapshot.assertions).toHaveLength(3);
    for (const row of rows) {
      const assertion = snapshot.assertions.find((item) => item.assertionId === row.id)!;
      expect(assertion).toMatchObject({
        lane: "governed_network_regulator", source: { documentId: sourceUrl, sha256: sourceSha256, publisher: "Visa", publishedOn: "2026-09-07" },
        validPeriod: { state: "unresolved_end", start: "2026-04-18", end: null },
        scope: { geography: "US_50_STATES_DC", network: "visa", program: "visa_usa_other_transactions_credit_voucher", population: row.population, basis: "credit_voucher_transaction_value", unit: "decimal_fraction" },
        dimensions: ["benchmark"], value: { kind: "rate", decimal: row.decimal },
      });
      expect(assertion.admission.admittedAt <= snapshot.recordedAt).toBe(true);
      expect(assertion.source.retrievedAt <= assertion.admission.admittedAt).toBe(true);
    }
    expect(snapshot.snapshotId).toBe("f3_snapshot_952b92bcb298bdf74f2f70e98a2418ad31691873ee6e5c4229e90f157d5ee22f");
  });

  it("admits knowledge but refuses pre-effective and unpublished history and leaves monthly coverage unknown", () => {
    for (const assertion of snapshot.assertions) {
      const before = query({ start: "2026-03-01", end: "2026-03-31" }, assertion);
      expect(resolveAdmittedPublicClaims(before)).toMatchObject({ status: "refused", reasonCode: "period_not_covered", selectedAssertions: [] });
      const afterEffectiveBeforePublication = query({ start: "2026-05-01", end: "2026-05-31" }, assertion);
      expect(resolveAdmittedPublicClaims(afterEffectiveBeforePublication)).toMatchObject({ status: "refused", reasonCode: "publication_after_period_start" });
      const monthly = query({ start: "2026-10-01", end: "2026-10-31" }, assertion);
      const canonicalBefore = JSON.stringify(monthly.analysis);
      const resolution = resolveAdmittedPublicClaims(monthly);
      expect(resolution).toMatchObject({ status: "missing_authority", reasonCode: "effective_end_unresolved", selectedAssertions: [] });
      expect(resolveAdmittedPublicClaims({ ...monthly, snapshot: structuredClone(snapshot) })).toEqual(resolution);
      expect(JSON.stringify(monthly.analysis)).toBe(canonicalBefore);
      expect(compareAdmittedPublicRate(monthly)).toMatchObject({ status: "refused", reasonCode: "claim_not_reference_comparison" });
      expect(resolveAdmittedPublicClaims({ ...monthly, scope: { ...monthly.scope, geography: "CA" } })).toMatchObject({ status: "missing_authority", reasonCode: "scope_incompatible" });
      expect(resolveAdmittedPublicClaims({ ...monthly, scope: { ...monthly.scope, population: "unrelated_transactions" } })).toMatchObject({ status: "missing_authority", reasonCode: "scope_incompatible" });
    }
  });

  it("accepts a later explicit bound without rewriting the original and keeps conflicts order-independent", () => {
    const original = snapshot.assertions.find((item) => item.assertionId === rows[0].id)!;
    const period = { start: "2026-11-01", end: "2026-11-30" };
    const originalQuery = query(period, original);
    expect(resolveAdmittedPublicClaims(originalQuery)).toMatchObject({ status: "missing_authority", reasonCode: "effective_end_unresolved" });
    // Synthetic authority is test-only: a later source explicitly restates the
    // same row and bounds it. It is never part of the real Visa pilot snapshot.
    const later: F3PublicAssertion = {
      ...structuredClone(original), assertionId: "test_only_visa_bounded_successor", version: "test_only_v2",
      source: { documentId: "test_only_visa_bounded_notice", sha256: "f".repeat(64), publisher: "Visa", publishedOn: "2026-10-01", retrievedAt: "2026-10-01T10:00:00.000Z" },
      admission: { reviewerId: "test_only", decisionId: "test_only_bounded_notice", admittedAt: "2026-10-02T00:00:00.000Z" },
      validPeriod: { state: "explicit_bounded", start: "2026-04-18", end: "2026-12-31" },
      limitations: ["Synthetic later source for resolver test only."], supersedes: [original.assertionId],
    };
    const merelyLinked = createF3PublicSnapshot("2026-10-02T01:00:00.000Z", [
      ...snapshot.assertions, { ...later, validPeriod: { state: "unresolved_end", start: "2026-04-18", end: null } },
    ]);
    expect(resolveAdmittedPublicClaims(query(period, original, merelyLinked))).toMatchObject({
      status: "missing_authority", reasonCode: "effective_end_unresolved",
    });
    const bounded = createF3PublicSnapshot("2026-10-02T01:00:00.000Z", [...snapshot.assertions, later]);
    expect(resolveAdmittedPublicClaims(query(period, original, bounded))).toMatchObject({
      status: "matched", reasonCode: "admitted_match", selectedAssertions: [{ assertionId: later.assertionId }],
    });
    expect(resolveAdmittedPublicClaims(originalQuery)).toMatchObject({ status: "missing_authority", reasonCode: "effective_end_unresolved" });
    expect(resolveAdmittedPublicClaims(query({ start: "2026-09-10", end: "2026-09-30" }, original, bounded))).toMatchObject({ status: "missing_authority", reasonCode: "effective_end_unresolved" });
    const contradictory = { ...later, value: { kind: "rate" as const, decimal: "0.0199" } };
    const conflictA = createF3PublicSnapshot("2026-10-02T01:00:00.000Z", [...snapshot.assertions, contradictory]);
    const conflictB = createF3PublicSnapshot("2026-10-02T01:00:00.000Z", [contradictory, ...snapshot.assertions].reverse());
    expect(conflictA).toEqual(conflictB);
    expect(resolveAdmittedPublicClaims(query(period, original, conflictA))).toMatchObject({
      status: "conflict", reasonCode: "conflicting_assertions", selectedAssertions: [],
      conflictingAssertionIds: [original.assertionId, contradictory.assertionId].sort(),
    });
  });
});
