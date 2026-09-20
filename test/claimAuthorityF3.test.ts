import { describe, expect, it } from "vitest";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { createF1ClaimGraph } from "../src/claimAuthorityF1/graph.js";
import type { ClaimDimension, F1ClaimDraft, F1ClaimGraph } from "../src/claimAuthorityF1/types.js";
import { compareAdmittedPublicRate } from "../src/claimAuthorityF3/comparison.js";
import { resolveAdmittedPrivateClaims, resolveAdmittedPublicClaims, tryResolveAdmittedPublicClaims } from "../src/claimAuthorityF3/resolver.js";
import { createF3PublicSnapshot, validateF3PublicSnapshot } from "../src/claimAuthorityF3/snapshot.js";
import type { F3PublicAssertion, F3PublicScope, F3PublicSnapshot } from "../src/claimAuthorityF3/types.js";
import type { ParsedDocument } from "../src/parser.js";

const scope: F3PublicScope = {
  geography: "US", network: "visa", program: "assessment", feeIdentity: "visa_assessment",
  population: "settled_sales", basis: "gross_settled_volume", unit: "percent",
};
const observedRef = { kind: "fact", path: "financialFacts.processorStatedRate", selectedCandidateId: null } as const;
const period = { start: "2024-04-01", end: "2024-04-30" };
const recordedAt = "2026-08-01T00:00:00.000Z";

function assertion(overrides: Partial<F3PublicAssertion> = {}): F3PublicAssertion {
  return {
    assertionId: "visa_assessment_2024", version: "1", lane: "governed_network_regulator",
    source: { documentId: "visa_schedule_apr_2024", sha256: "a".repeat(64), publisher: "Visa", publishedOn: "2024-03-01", retrievedAt: "2026-07-01T00:00:00.000Z" },
    admission: { reviewerId: "reviewer_1", decisionId: "admission_1", admittedAt: "2026-07-02T00:00:00.000Z" },
    validPeriod: { start: "2024-04-01", end: "2024-12-31" }, scope,
    dimensions: ["reference_comparison"], value: { kind: "rate", decimal: "2.0740" },
    limitations: ["Published reference only; merchant contract and processor retention unknown."],
    conflictsWith: [], supersedes: [], ...overrides,
  };
}
function canonical(withSyntheticRate = true): CanonicalStatementAnalysis {
  const lines = ["Merchant: F3 Synthetic Cafe", "Processor: Fiserv", "Statement Period: 04/01/2024 - 04/30/2024", "Fees Charged | -$30.00"];
  const document: ParsedDocument = {
    sourceType: "pdf", headers: [], rows: lines.map((content) => ({ content, page: "page-1" })), textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, reasons: ["F3 hand-authored fixture"], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true },
  };
  const analysis = buildCanonicalRuntimeAnalysis({ document, businessType: "restaurant_food_beverage", runtimeDocumentRef: "f3_synthetic_statement" }).analysis;
  if (withSyntheticRate) analysis.financialFacts.processorStatedRate = {
    value: "2.0740", status: "selected", confidence: "high", selectedCandidateId: null,
    evidenceRefs: [], selectionReason: "F3 hand-authored rate fixture", candidates: [], limitations: [],
  };
  return analysis;
}
function draft(dimension: ClaimDimension, key = dimension, semanticCode = "observed_rate_matches_admitted_reference"): F1ClaimDraft {
  return {
    candidateKey: key, subject: observedRef, dimension, semanticCode,
    value: { kind: "known", representation: "semantic_code", code: semanticCode },
    reasoning: { primaryClass: "governed_public_dependency", supportingClasses: ["governed_public_dependency"], ruleId: "f3_shadow_test", ruleVersion: "v1" },
    authority: { requiredLanes: [], satisfiedLanes: [], assessment: "not_evaluated" },
    resolution: { status: "candidate_only", reasonCode: "hand_authored_test", blockedDimensions: [] },
    temporal: period, universality: "merchant_account_specific", evidenceRefs: [], calculationRefs: [], canonicalRefs: [], policyDependency: null,
  };
}
function context(dimensions: ClaimDimension[] = ["reference_comparison"], withSyntheticRate = true): { analysis: CanonicalStatementAnalysis; graph: F1ClaimGraph; claimIds: string[] } {
  const analysis = canonical(withSyntheticRate);
  const graph = createF1ClaimGraph(analysis, dimensions.map((dimension, index) => draft(dimension, `${dimension}_${index}`)));
  return { analysis, graph, claimIds: dimensions.map((dimension, index) => graph.claims.find((claim) => claim.candidateKey === `${dimension}_${index}`)!.claimId) };
}
function query(snapshot: F3PublicSnapshot, ctx = context(), claimId = ctx.claimIds[0]!) {
  return { ...ctx, claimId, snapshot, snapshotId: snapshot.snapshotId, scope };
}

describe("F3 pinned external authority sidecar", () => {
  it("canonicalizes and freezes snapshots, checks source/admission chronology, and detects tampering", () => {
    const first = assertion();
    const second = assertion({ assertionId: "alternate_same_rate", version: "2", source: { ...first.source, documentId: "second_document", sha256: "b".repeat(64) } });
    const a = createF3PublicSnapshot(recordedAt, [first, second]);
    const b = createF3PublicSnapshot(recordedAt, [second, first]);
    expect(a).toEqual(b);
    expect(Object.isFrozen(a.assertions[0])).toBe(true);
    validateF3PublicSnapshot(structuredClone(a));
    const changed = structuredClone(a);
    changed.assertions[0]!.value = { kind: "rate", decimal: "9.99" };
    expect(() => validateF3PublicSnapshot(changed)).toThrow(/digest mismatch/);
    expect(() => createF3PublicSnapshot("2026-07-01T00:00:00.000Z", [first])).toThrow(/admission chronology/);
    expect(() => createF3PublicSnapshot(recordedAt, [assertion({ validPeriod: { start: "2024-02-30", end: "2024-12-31" } })])).toThrow(/effective dates/);
    expect(() => createF3PublicSnapshot(recordedAt, [assertion({ source: { ...first.source, sha256: "not_a_hash" } })])).toThrow(/source provenance/);
  });

  it("replays the pinned snapshot across later corpus changes and preserves valid and recorded time", () => {
    const ctx = context();
    const beforeAdmission = createF3PublicSnapshot("2026-07-01T00:00:00.000Z", []);
    expect(resolveAdmittedPublicClaims(query(beforeAdmission, ctx))).toMatchObject({ status: "missing_authority", reasonCode: "no_admitted_assertion" });
    const admitted = createF3PublicSnapshot(recordedAt, [assertion()]);
    const first = resolveAdmittedPublicClaims(query(admitted, ctx));
    expect(first).toMatchObject({ status: "matched", snapshotId: admitted.snapshotId, analysisPeriod: period });
    expect(first.selectedAssertions).toEqual([{ assertionId: "visa_assessment_2024", version: "1", sourceSha256: "a".repeat(64), admittedAt: "2026-07-02T00:00:00.000Z", validPeriod: assertion().validPeriod }]);
    const later = createF3PublicSnapshot("2026-09-01T00:00:00.000Z", [assertion(), assertion({ assertionId: "later_2026_rate", validPeriod: { start: "2026-01-01", end: "2026-12-31" }, value: { kind: "rate", decimal: "3.0" }, source: { ...assertion().source, documentId: "later_doc", sha256: "c".repeat(64) } })]);
    expect(resolveAdmittedPublicClaims(query(structuredClone(admitted), ctx))).toEqual(first);
    expect(resolveAdmittedPublicClaims(query(later, ctx)).selectedAssertions).toEqual(first.selectedAssertions);
    expect(() => resolveAdmittedPublicClaims({ ...query(admitted, ctx), snapshotId: later.snapshotId })).toThrow(/pin mismatch/);
  });

  it("refuses historical back-projection and keeps missing dimension, scope, and conflict explicit", () => {
    const ctx = context(["reference_comparison", "contractual_pass_through", "economic_broad_category"]);
    const future = createF3PublicSnapshot(recordedAt, [assertion({ validPeriod: { start: "2025-01-01", end: "2026-12-31" } })]);
    expect(resolveAdmittedPublicClaims(query(future, ctx))).toMatchObject({ status: "refused", reasonCode: "period_not_covered", selectedAssertions: [] });
    const partial = createF3PublicSnapshot(recordedAt, [assertion({ validPeriod: { start: "2024-04-15", end: "2024-12-31" } })]);
    expect(resolveAdmittedPublicClaims(query(partial, ctx))).toMatchObject({ status: "refused", reasonCode: "period_not_covered" });
    const retroactive = createF3PublicSnapshot(recordedAt, [assertion({ source: { ...assertion().source, publishedOn: "2025-01-01" } })]);
    expect(resolveAdmittedPublicClaims(query(retroactive, ctx))).toMatchObject({ status: "refused", reasonCode: "publication_after_period_start" });
    const current = createF3PublicSnapshot(recordedAt, [assertion()]);
    expect(resolveAdmittedPublicClaims({ ...query(current, ctx), scope: { ...scope, population: "authorizations" } })).toMatchObject({ status: "missing_authority", reasonCode: "scope_incompatible" });
    expect(resolveAdmittedPublicClaims(query(current, ctx, ctx.claimIds[1]))).toMatchObject({ status: "refused", reasonCode: "public_lane_forbidden" });
    expect(resolveAdmittedPublicClaims(query(current, ctx, ctx.claimIds[2]))).toMatchObject({ status: "refused", reasonCode: "public_lane_forbidden" });
    const benchmarkOnly = createF3PublicSnapshot(recordedAt, [assertion({ dimensions: ["benchmark"] })]);
    expect(resolveAdmittedPublicClaims(query(benchmarkOnly, ctx))).toMatchObject({ status: "missing_authority", reasonCode: "dimension_not_authorized" });
    const conflicting = createF3PublicSnapshot(recordedAt, [assertion(), assertion({ assertionId: "other_rate", source: { ...assertion().source, documentId: "other_doc", sha256: "d".repeat(64) }, value: { kind: "rate", decimal: "2.10" } })]);
    expect(resolveAdmittedPublicClaims(query(conflicting, ctx))).toMatchObject({ status: "conflict", reasonCode: "conflicting_assertions", conflictingAssertionIds: ["other_rate", "visa_assessment_2024"] });
    const linkedConflict = createF3PublicSnapshot(recordedAt, [assertion({ conflictsWith: ["same_rate_other_source"] }), assertion({ assertionId: "same_rate_other_source", source: { ...assertion().source, documentId: "same_rate_doc", sha256: "e".repeat(64) } })]);
    expect(resolveAdmittedPublicClaims(query(linkedConflict, ctx))).toMatchObject({ status: "conflict", reasonCode: "conflicting_assertions" });
    expect(() => createF3PublicSnapshot(recordedAt, [assertion({ dimensions: ["contractual_pass_through"] as never })])).toThrow(/unauthorized public dimension/);
    expect(tryResolveAdmittedPublicClaims({ ...query(current, ctx), snapshotId: "unrecognized" })).toEqual({ status: "unavailable", result: null, failureCode: "invalid_pinned_authority_input" });
  });

  it("keeps merchant-private evidence in an unavailable tenant/account port", () => {
    expect(resolveAdmittedPrivateClaims({ tenantId: "tenant_1", accountId: "account_1", snapshotId: "private_snapshot_1", dimension: "contractual_pass_through", analysisPeriod: period })).toMatchObject({
      standing: "unavailable_private_authority_port", status: "missing_authority", reasonCode: "private_snapshot_store_not_implemented", opaqueEvidenceIds: [],
    });
    expect(() => resolveAdmittedPrivateClaims({ tenantId: "", accountId: "account_1", snapshotId: "private_snapshot_1", dimension: "contractual_pass_through", analysisPeriod: period })).toThrow(/private scope/);
  });

  it("computes exact narrow equality without proving pass-through, at-cost, markup, or savings", () => {
    const ctx = context();
    const snapshot = createF3PublicSnapshot(recordedAt, [assertion()]);
    const before = JSON.stringify(ctx.analysis);
    const reportBefore = JSON.stringify(ctx.analysis.customerState);
    const equal = compareAdmittedPublicRate({ ...query(snapshot, ctx), observedCanonicalRef: observedRef });
    expect(equal).toMatchObject({ status: "equal_within_tolerance", observedRate: "2.0740", referenceRate: "2.0740", difference: "0.0000", standing: "shadow_only_narrow_reference_comparison" });
    expect(Object.keys(equal).sort()).toEqual(["comparisonVersion", "difference", "observedCanonicalRef", "observedRate", "reasonCode", "referenceRate", "resolution", "roundingPolicy", "standing", "status", "tolerance"].sort());
    const lower = createF3PublicSnapshot(recordedAt, [assertion({ value: { kind: "rate", decimal: "2.0700" } })]);
    expect(compareAdmittedPublicRate({ ...query(lower, ctx), observedCanonicalRef: observedRef })).toMatchObject({ status: "above_reference", difference: "0.0040", tolerance: "0" });
    expect(JSON.stringify(ctx.analysis)).toBe(before);
    expect(JSON.stringify(ctx.analysis.customerState)).toBe(reportBefore);
  });

  it("leaves unsupported observed rates and conflicting references unknown or conflicted", () => {
    const ordinary = context(["reference_comparison"], false);
    const published = createF3PublicSnapshot(recordedAt, [assertion()]);
    expect(compareAdmittedPublicRate({ ...query(published, ordinary), observedCanonicalRef: observedRef })).toMatchObject({ status: "unknown", reasonCode: "observed_rate_unavailable" });
    const ctx = context();
    const snapshot = createF3PublicSnapshot(recordedAt, [assertion()]);
    ctx.analysis.financialFacts.processorStatedRate.value = null;
    // Rebind to the updated canonical digest: the old graph cannot be replayed after mutation.
    expect(() => compareAdmittedPublicRate({ ...query(snapshot, ctx), observedCanonicalRef: observedRef })).toThrow(/canonical input\/version drift/);
    const rebound = context();
    const future = createF3PublicSnapshot(recordedAt, [assertion({ validPeriod: { start: "2025-01-01", end: "2026-12-31" } })]);
    expect(compareAdmittedPublicRate({ ...query(future, rebound), observedCanonicalRef: observedRef })).toMatchObject({ status: "refused", reasonCode: "reference_period_not_covered" });
  });
});
