import type { F0Candidate } from "../../../scripts/gold-f0-evaluation-lib.js";
import type { AuthorityLane, ReasoningClass } from "../../../scripts/gold-authority-derivability-lib.js";

// Hand-authored, offline candidate outputs for adversarial tests. These are not source
// mappings, processor support, or production observations. Gold remains the oracle.
const synthetic = "synthetic_falsification_input" as const;
const policy = "reviewed_product_policy" as const;

function answer(id: string, dimension: string, observed: unknown, reasoningClass: ReasoningClass, authorityLane: AuthorityLane = synthetic): F0Candidate {
  return {
    assertionId: id, decision: "answer", observed, dimension, reasoningClass,
    authorityLanes: [authorityLane], evidenceStatus: "verified",
    presentedAs: reasoningClass === "product_policy_judgment" ? "product_policy" : "financial_fact",
    universality: reasoningClass === "product_policy_judgment" ? "product_policy_only" : "universal_acquiring_accounting",
  };
}

function refuse(id: string, dimension: string): F0Candidate {
  return {
    assertionId: id, decision: "refuse", dimension, reasoningClass: "product_policy_judgment",
    authorityLanes: [policy], evidenceStatus: "verified", refusalReason: "prohibited_positive_claim",
    presentedAs: "product_policy",
    universality: "product_policy_only",
  };
}

export const f0SyntheticCandidates: F0Candidate[] = [
  answer("S1-UNDERLYING", "pricing.architecture", "bundled_into_merchant_price", "economic_structural_inference"),
  answer("S1-SHAPE", "pricing.architecture", "scope_specific_flat_percentage", "economic_structural_inference"),
  answer("S1-SCOPE", "pricing.architecture", "scope_specific", "economic_structural_inference"),
  refuse("S1-NO-TIER", "pricing.architecture"),
  answer("S2-UNDERLYING", "pricing.architecture", "mixed_by_scope", "economic_structural_inference"),
  answer("S2-SCOPE", "pricing.architecture", "preserved", "economic_structural_inference"),
  refuse("S2-NO-COLLAPSE-IC", "policy.reasoning_constraint"),
  refuse("S2-NO-COLLAPSE-BUNDLE", "policy.reasoning_constraint"),
  answer("S3-UNDERLYING", "pricing.architecture", "separately_billed_pass_through", "economic_structural_inference"),
  answer("S3-SHAPE", "pricing.architecture", "composite_multi_component", "economic_structural_inference"),
  refuse("S3-NO-REPLACE", "policy.reasoning_constraint"),
  answer("S4-FEES", "economic.program_flow", "preserved", "direct_observation"),
  answer("S4-REVENUE", "economic.program_flow", "separately_recorded", "direct_observation"),
  answer("S4-RETAINED", "economic.program_flow", "separately_recorded", "direct_observation"),
  answer("S4-THIRD-PARTY", "economic.program_flow", "separately_recorded", "direct_observation"),
  { ...answer("S4-NET-BURDEN", "economic.program_flow", "derived_when_evidenced", "deterministic_calculation"), reasoningClasses: ["direct_observation", "deterministic_calculation"] },
  refuse("S4-NO-GROSS-BURDEN", "policy.reasoning_constraint"),
  { ...answer("S5-AMEX-MAPPING", "pricing.architecture", "requires_admitted_mapping", "governed_public_dependency", "governed_public_mixed"), authorityLanes: ["governed_public_mixed", synthetic], universality: "network_specific" },
  refuse("S5-NO-OPTBLUE", "ownership.economic_beneficiary"),
  answer("S6-ADJUSTMENT", "observation.financial", "funding_only_not_processing_cost", "economic_structural_inference"),
  refuse("S6-NO-CONTAMINATION", "economic.broad_category"),
  answer("S7-INSTRUCTION", "policy.security_boundary", 0, "product_policy_judgment", policy),
  answer("S7-PROMOTION", "reference.knowledge_status", 0, "product_policy_judgment", policy),
  refuse("S7-NO-SECRET", "policy.reasoning_constraint"),
  { assertionId: "S8-STATE", decision: "unresolved", dimension: "reference.knowledge_status", reasoningClass: "economic_structural_inference", authorityLanes: [synthetic], evidenceStatus: "verified", refusalReason: "unresolved_conflict", universality: "universal_acquiring_accounting" },
  refuse("S8-NO-AI-WINNER", "policy.reasoning_constraint"),
  { ...answer("S9-STATE", "commercial.benchmark", "blocked_denominator_mismatch", "deterministic_calculation"), reasoningClasses: ["direct_observation", "deterministic_calculation"] },
  refuse("S9-NO-CONVERSION", "commercial.savings"),
  answer("S10-OBSERVED-COST", "observation.cost", 100, "direct_observation"),
  { assertionId: "S10-SAVINGS", decision: "unresolved", dimension: "commercial.savings", reasoningClass: "product_policy_judgment", authorityLanes: [policy], evidenceStatus: "verified", refusalReason: "not_derivable_without_counterfactual", presentedAs: "product_policy", universality: "product_policy_only" },
  refuse("S10-NO-SAVINGS", "commercial.savings"),
];

export const f0GlobalProhibitionCandidates: F0Candidate[] = [
  refuse("GLOBAL-NEG-01", "pricing.architecture"),
  refuse("GLOBAL-NEG-02", "ownership.economic_beneficiary"),
  refuse("GLOBAL-NEG-03", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-04", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-05", "economic.broad_category"),
  refuse("GLOBAL-NEG-06", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-07", "ownership.economic_beneficiary"),
  refuse("GLOBAL-NEG-08", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-09", "ownership.economic_beneficiary"),
  refuse("GLOBAL-NEG-10", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-11", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-12", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-13", "pricing.architecture"),
  refuse("GLOBAL-NEG-14", "pricing.architecture"),
  refuse("GLOBAL-NEG-15", "pricing.architecture"),
  refuse("GLOBAL-NEG-16", "economic.broad_category"),
  refuse("GLOBAL-NEG-17", "economic.broad_category"),
  refuse("GLOBAL-NEG-18", "document.completeness"),
  refuse("GLOBAL-NEG-19", "document.completeness"),
  refuse("GLOBAL-NEG-20", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-21", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-22", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-23", "policy.reasoning_constraint"),
  refuse("GLOBAL-NEG-24", "commercial.savings"),
  refuse("GLOBAL-NEG-25", "policy.reasoning_constraint"),
];

export const f0ExecutableCandidates = [...f0SyntheticCandidates, ...f0GlobalProhibitionCandidates];
