import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import { validateF1ClaimGraph } from "../claimAuthorityF1/graph.js";
import type { ClaimDimension, F1ClaimGraph } from "../claimAuthorityF1/types.js";
import { F2_EVALUATOR_VERSION } from "../claimAuthorityF2/types.js";
import { validateF3Period, validateF3PublicSnapshot } from "./snapshot.js";
import {
  F3_AUTHORITY_POLICY_VERSION, F3_RESOLVER_VERSION,
  type F3PrivateResolution, type F3PublicResolution, type F3PublicScope, type F3PublicSnapshot, type F3Period,
} from "./types.js";

const publicDimensions: ClaimDimension[] = ["official_normalized_identity", "reference_comparison", "benchmark", "recurrence", "cadence"];

export type F3PublicQuery = {
  analysis: CanonicalStatementAnalysis;
  graph: F1ClaimGraph;
  claimId: string;
  snapshot: F3PublicSnapshot;
  snapshotId: string;
  scope: F3PublicScope;
};

function sameScope(a: F3PublicScope, b: F3PublicScope): boolean {
  return a.geography === b.geography && a.network === b.network && a.program === b.program
    && a.feeIdentity === b.feeIdentity && a.population === b.population && a.basis === b.basis && a.unit === b.unit;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// This pure port accepts an already admitted snapshot. It never reads a live corpus,
// searches the web, or converts the result into an F2 test attestation.
export function resolveAdmittedPublicClaims(query: F3PublicQuery): F3PublicResolution {
  validateF1ClaimGraph(query.graph, query.analysis);
  validateF3PublicSnapshot(query.snapshot);
  if (query.snapshotId !== query.snapshot.snapshotId) throw new Error("F3 snapshot pin mismatch");
  const claim = query.graph.claims.find((item) => item.claimId === query.claimId);
  if (!claim) throw new Error("F3 claim is absent from pinned graph");
  const period = claim.temporal;
  if (period !== null) validateF3Period(period);
  const base = {
    resolverVersion: F3_RESOLVER_VERSION, standing: "shadow_only_admitted_snapshot_interface" as const,
    snapshotId: query.snapshotId, graphId: query.graph.graphId, canonicalVersionDigest: query.graph.canonicalVersionDigest,
    authorityPolicyVersion: F3_AUTHORITY_POLICY_VERSION, claimEvaluatorVersion: F2_EVALUATOR_VERSION,
    claimId: claim.claimId, dimension: claim.dimension, analysisPeriod: period === null ? null : { ...period },
  };
  const result = (status: F3PublicResolution["status"], reasonCode: F3PublicResolution["reasonCode"], matches: F3PublicResolution["selectedAssertions"] = [], conflictingAssertionIds: string[] = []): F3PublicResolution =>
    freeze({ ...base, status, reasonCode, selectedAssertions: structuredClone(matches), conflictingAssertionIds: [...conflictingAssertionIds] });
  if (!publicDimensions.includes(claim.dimension)) return result("refused", "public_lane_forbidden");
  if (period === null) return result("refused", "claim_period_missing");
  const byDimension = query.snapshot.assertions.filter((assertion) => assertion.dimensions.includes(claim.dimension as never));
  if (query.snapshot.assertions.length === 0) return result("missing_authority", "no_admitted_assertion");
  if (!byDimension.length) return result("missing_authority", "dimension_not_authorized");
  const byScope = byDimension.filter((assertion) => sameScope(assertion.scope, query.scope));
  if (!byScope.length) return result("missing_authority", "scope_incompatible");
  const byEffectiveStart = byScope.filter((assertion) => assertion.validPeriod.start <= period.start);
  if (!byEffectiveStart.length) return result("refused", "period_not_covered");
  // A publication made after the statement period began cannot silently rewrite
  // the historical decision, even if it declares a retroactive valid interval.
  const published = byEffectiveStart.filter((assertion) => assertion.source.publishedOn <= period.start);
  if (!published.length) return result("refused", "publication_after_period_start");
  const bounded = published.filter((assertion) => assertion.validPeriod.state === "explicit_bounded" && assertion.validPeriod.end >= period.end);
  const unresolved = published.filter((assertion) => assertion.validPeriod.state === "unresolved_end");
  // Unresolved assertions can conflict with a bounded assertion, but cannot supply
  // the missing end needed for period coverage. Order and supersedes never choose a winner.
  const candidates = [...bounded, ...unresolved];
  if (!candidates.length) return result("refused", "period_not_covered");
  const values = new Set(candidates.map((assertion) => assertion.value.kind === "rate" ? `rate:${assertion.value.decimal}` : `semantic:${assertion.value.code}`));
  const ids = new Set(candidates.map((assertion) => assertion.assertionId));
  const explicitConflict = candidates.some((assertion) => assertion.conflictsWith.some((id) => ids.has(id)));
  if (values.size > 1 || explicitConflict) return result("conflict", "conflicting_assertions", [], candidates.map((item) => item.assertionId).sort());
  if (!bounded.length) return result("missing_authority", "effective_end_unresolved");
  return result("matched", "admitted_match", bounded.map((item) => ({
    assertionId: item.assertionId, version: item.version, sourceSha256: item.source.sha256,
    admittedAt: item.admission.admittedAt, validPeriod: item.validPeriod,
  })));
}

export function tryResolveAdmittedPublicClaims(query: F3PublicQuery):
  | { status: "available"; result: F3PublicResolution }
  | { status: "unavailable"; result: null; failureCode: "invalid_pinned_authority_input" } {
  try { return { status: "available", result: resolveAdmittedPublicClaims(query) }; }
  catch { return { status: "unavailable", result: null, failureCode: "invalid_pinned_authority_input" }; }
}

// Future private evidence must come from a separately authorized tenant/account store.
// No public assertion, caller-provided document, or F2 test attestation can satisfy this port.
export function resolveAdmittedPrivateClaims(input: {
  tenantId: string; accountId: string; snapshotId: string; dimension: ClaimDimension; analysisPeriod: F3Period;
}): F3PrivateResolution {
  if (![input.tenantId, input.accountId, input.snapshotId].every((value) => typeof value === "string" && value.trim().length > 0)) throw new Error("F3 private scope is required");
  validateF3Period(input.analysisPeriod);
  return Object.freeze({
    standing: "unavailable_private_authority_port", status: "missing_authority",
    reasonCode: "private_snapshot_store_not_implemented", tenantId: input.tenantId,
    accountId: input.accountId, snapshotId: input.snapshotId, dimension: input.dimension,
    analysisPeriod: Object.freeze({ ...input.analysisPeriod }), opaqueEvidenceIds: Object.freeze([]) as unknown as [],
  });
}
