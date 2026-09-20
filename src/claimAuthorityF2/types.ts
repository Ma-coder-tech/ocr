import type { AuthorityLane, CanonicalRef, ClaimDimension, F1ClaimGraph, ReasoningClass, UniversalityScope } from "../claimAuthorityF1/types.js";
import type { CanonicalStatementAnalysis } from "../canonical/types.js";

export const F2_EVALUATOR_VERSION = "claim_authority_evaluator_f2_v1" as const;
export const completenessGateIds = ["observed_page_fact", "statement_total", "fee_composition", "pricing_architecture", "comparison", "actionability", "savings"] as const;
export type CompletenessGateId = (typeof completenessGateIds)[number];
export const denominatorPolicyIds = ["accounting_completeness", "economic_classification_completeness", "merchant_facing_completeness"] as const;
export type DenominatorPolicyId = (typeof denominatorPolicyIds)[number];
export type Period = { start: string; end: string };

// F2 accepts caller-supplied test attestations only. No retrieval, persistence, or source admission exists here.
export type F2TestAttestation = {
  id: string;
  claimId: string;
  lane: AuthorityLane;
  facets: string[];
  effectivePeriod: Period | null;
  scope: UniversalityScope;
  subjectKey: string;
  provenance: "hand_authored_non_authoritative_test";
  privateAccountKey: string | null;
  promotedToGlobal: boolean;
  reviewedPromotion: boolean;
};

export type F2GateInput = {
  gate: CompletenessGateId;
  subjectKey: string | null;
  evidence: string[];
};
export type F2DenominatorInput = {
  policy: DenominatorPolicyId;
  basis: "printed_gross_fees" | "signed_canonical_total";
  printedGrossRef: CanonicalRef | null;
  separatelyAccountedFor: string[];
};
export type F2PolicyInput = {
  claimId: string;
  ruleId: string;
  ruleVersion: string;
  decision: "permit" | "block";
  facet: "materiality" | "visibility" | "blocking" | "priority" | "reportability" | "wording_action_ceiling";
  attestationId: string;
};
export type F2Supersession = {
  conflictId: string;
  winningClaimId: string;
  reviewedRuleId: string;
  reviewedRuleVersion: string;
  reviewDecisionId: string;
  reviewStatus: "admitted";
  provenance: "hand_authored_non_authoritative_test";
};
export type F2NarrowingLink = { strongClaimId: string; narrowerClaimId: string };

export type F2EvaluationInput = {
  analysis: CanonicalStatementAnalysis;
  graph: F1ClaimGraph;
  attestations: F2TestAttestation[];
  gates: F2GateInput[];
  denominators: F2DenominatorInput[];
  policy: F2PolicyInput[];
  supersessions: F2Supersession[];
  narrowingLinks: F2NarrowingLink[];
  accountKey: string | null;
  requestedPositiveClaimIds: string[];
};

export type F2Status = "supported" | "partially_supported" | "unresolved" | "refused" | "conflict" | "policy_blocked" | "incomplete_document" | "missing_authority";
export type F2HardFailure = "unsupported_positive_admission" | "evidence_lane_leakage" | "historical_back_projection" | "merchant_private_to_global_unreviewed_promotion";
export type F2GateDecision = { gate: CompletenessGateId; subjectKey: string | null; status: "eligible" | "partial" | "blocked" | "unknown"; missingEvidence: string[] };
export type F2DenominatorDecision = { policy: DenominatorPolicyId; status: "eligible" | "blocked" | "unknown"; missingEvidence: string[]; printedGrossRef: CanonicalRef | null };
export type F2ClaimDecision = {
  claimId: string;
  dimension: ClaimDimension;
  semanticCode: string;
  status: F2Status;
  evaluationOutcome: "correct_answer" | "correct_refusal" | "unresolved" | "hard_failure";
  admittedValue: "canonical_reference" | "semantic_code" | "unknown" | "not_applicable";
  reasonCode: string;
  satisfiedLanes: AuthorityLane[];
  missingLaneAlternatives: AuthorityLane[][];
  requiredFacets: string[];
  missingFacets: string[];
  requiredGates: CompletenessGateId[];
  blockedGates: CompletenessGateId[];
  attestationIds: string[];
  conflictIds: string[];
  blockedDimensions: ClaimDimension[];
  narrowerSupportedClaimIds: string[];
  policyDecision: "not_required" | "permitted" | "blocked" | "missing";
  policyAttestationId: string | null;
  hardFailures: F2HardFailure[];
};
export type F2Evaluation = {
  evaluatorVersion: typeof F2_EVALUATOR_VERSION;
  graphId: string;
  decisions: F2ClaimDecision[];
  gateDecisions: F2GateDecision[];
  denominatorDecisions: F2DenominatorDecision[];
  hardFailures: F2HardFailure[];
  status: "shadow_only";
  authorityStanding: "hand_authored_non_authoritative_test";
};

export type F2Rule = {
  dimension: ClaimDimension;
  allowedReasoning: ReasoningClass[];
  allowedLanes: AuthorityLane[];
  laneAlternatives: AuthorityLane[][];
  requiredGates: CompletenessGateId[];
  requiredFacets: string[];
  facetLanes: Record<string, AuthorityLane[]>;
  missingAuthorityOutcome: "refused" | "missing_authority";
};
