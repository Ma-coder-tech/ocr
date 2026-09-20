import type { AuthorityLane, ClaimDimension, F1ClaimGraph } from "../claimAuthorityF1/types.js";

export const F3_SNAPSHOT_VERSION = "claim_authority_public_snapshot_f3_v2" as const;
export const F3_RESOLVER_VERSION = "claim_authority_public_resolver_f3_v2" as const;
export const F3_COMPARISON_VERSION = "claim_authority_reference_comparison_f3_v2" as const;
export const F3_AUTHORITY_POLICY_VERSION = "claim_authority_public_scope_f3_v2" as const;

export type F3Period = { start: string; end: string }; // Inclusive calendar dates.
// Admission can preserve an effective start without asserting an unsupported end.
// Only explicit_bounded can cover a bounded statement-period claim.
export type F3Validity =
  | { state: "explicit_bounded"; start: string; end: string }
  | { state: "unresolved_end"; start: string; end: null };
export type F3PublicLane = Extract<AuthorityLane, "governed_network_regulator" | "governed_processor_acquirer_publication" | "governed_public_mixed">;
export type F3PublicDimension = Extract<ClaimDimension,
  "official_normalized_identity" | "reference_comparison" | "benchmark" | "recurrence" | "cadence">;

// Every field is exact-match. Null means the source explicitly has no network/program scope,
// never a wildcard. No merchant account or private-contract field exists in this schema.
export type F3PublicScope = {
  geography: string;
  network: string | null;
  program: string | null;
  feeIdentity: string;
  population: string;
  basis: string;
  unit: string;
};

export type F3PublicAssertion = {
  assertionId: string;
  version: string;
  lane: F3PublicLane;
  source: { documentId: string; sha256: string; publisher: string; publishedOn: string; retrievedAt: string };
  admission: { reviewerId: string; decisionId: string; admittedAt: string };
  validPeriod: F3Validity;
  scope: F3PublicScope;
  dimensions: F3PublicDimension[];
  value: { kind: "rate"; decimal: string } | { kind: "semantic_code"; code: string };
  limitations: string[];
  conflictsWith: string[];
  supersedes: string[];
};

export type F3PublicSnapshot = {
  schemaVersion: typeof F3_SNAPSHOT_VERSION;
  snapshotId: string;
  recordedAt: string;
  assertions: F3PublicAssertion[];
};

export type F3PublicResolution = {
  resolverVersion: typeof F3_RESOLVER_VERSION;
  standing: "shadow_only_admitted_snapshot_interface";
  snapshotId: string;
  graphId: F1ClaimGraph["graphId"];
  canonicalVersionDigest: string;
  authorityPolicyVersion: typeof F3_AUTHORITY_POLICY_VERSION;
  claimEvaluatorVersion: string;
  claimId: string;
  dimension: ClaimDimension;
  analysisPeriod: F3Period | null;
  status: "matched" | "missing_authority" | "conflict" | "refused";
  reasonCode: "admitted_match" | "no_admitted_assertion" | "dimension_not_authorized" | "scope_incompatible" | "period_not_covered" | "effective_end_unresolved" | "publication_after_period_start" | "conflicting_assertions" | "public_lane_forbidden" | "claim_period_missing";
  selectedAssertions: { assertionId: string; version: string; sourceSha256: string; admittedAt: string; validPeriod: F3Validity }[];
  conflictingAssertionIds: string[];
};

export type F3PrivateResolution = {
  standing: "unavailable_private_authority_port";
  status: "missing_authority";
  reasonCode: "private_snapshot_store_not_implemented";
  tenantId: string;
  accountId: string;
  snapshotId: string;
  dimension: ClaimDimension;
  analysisPeriod: F3Period;
  opaqueEvidenceIds: [];
};
