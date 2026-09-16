import type { BoundedIntelligenceRuntimeResult, IntelligenceDifferenceClassification } from "./intelligenceTypes.js";
import { RG_SEMANTIC_AMENDMENT_IDS, type RgSemanticAmendmentId } from "./intelligenceTypes.js";

export type IntelligenceComparisonItem = {
  dimension: string;
  legacyValue: unknown;
  v2Value: unknown;
  classification: IntelligenceDifferenceClassification;
  amendmentId: RgSemanticAmendmentId | null;
  reasonCode: string;
};

export function compareLegacyIntelligenceObservation(params: {
  dimension: string;
  legacyValue: unknown;
  v2Value: unknown;
  classification: IntelligenceDifferenceClassification;
  amendmentId?: RgSemanticAmendmentId | null;
  reasonCode: string;
}): IntelligenceComparisonItem {
  const amendmentId = params.amendmentId ?? null;
  const allowedByDimension: Record<string, RgSemanticAmendmentId> = {
    question_selection: "RG-AMEND-001-DETERMINISTIC-QUESTION-SELECTION", knowledge_precedence: "RG-AMEND-002-ADMITTED-KNOWLEDGE-FIRST",
    execution_budget: "RG-AMEND-003-RESERVATION-BOUNDED-EXECUTION", research_identity: "RG-AMEND-004-IDENTITY-COMPLETE-RESEARCH-GRAPH",
    support_basis: "RG-AMEND-005-SEMANTIC-NOT-SUBSTRING-SUPPORT", admission_authority: "RG-AMEND-006-CANDIDATE-NOT-ADMISSION",
    failure_behavior: "RG-AMEND-007-FAILURE-PRESERVES-CANONICAL-TRUTH", ai_authority: "RG-AMEND-008-AI-NON-MUTATION",
    untrusted_content: "RG-AMEND-009-UNTRUSTED-CONTENT-ISOLATION", theme_language: "RG-AMEND-010-BOUNDED-THEME-LANGUAGE-CANDIDATE",
  };
  if (params.classification === "approved_semantic_amendment" && (!amendmentId || !RG_SEMANTIC_AMENDMENT_IDS.includes(amendmentId)
    || allowedByDimension[params.dimension] !== amendmentId)) {
    return { ...params, classification: "unexpected_divergence", amendmentId: null };
  }
  if (params.classification !== "approved_semantic_amendment" && amendmentId !== null) {
    return { ...params, classification: "unexpected_divergence", amendmentId: null };
  }
  return { ...params, amendmentId };
}

export function hasUnexpectedIntelligenceDivergence(items: readonly IntelligenceComparisonItem[]): boolean {
  return items.some((item) => item.classification === "unexpected_divergence");
}

const CONSTRUCTION_COMPARISON = [
  ["question_selection", "legacy_opportunity_driven", "deterministic_unknown_queue", "RG-AMEND-001-DETERMINISTIC-QUESTION-SELECTION"],
  ["knowledge_precedence", "legacy_inline_rules", "admitted_rf_first", "RG-AMEND-002-ADMITTED-KNOWLEDGE-FIRST"],
  ["execution_budget", "legacy_unbounded", "reservation_bounded", "RG-AMEND-003-RESERVATION-BOUNDED-EXECUTION"],
  ["research_identity", "legacy_partial", "identity_complete_graph", "RG-AMEND-004-IDENTITY-COMPLETE-RESEARCH-GRAPH"],
  ["support_basis", "legacy_substring_permitted", "claim_specific_semantic", "RG-AMEND-005-SEMANTIC-NOT-SUBSTRING-SUPPORT"],
  ["admission_authority", "legacy_ai_enrichment", "candidate_human_admission_required", "RG-AMEND-006-CANDIDATE-NOT-ADMISSION"],
  ["failure_behavior", "legacy_partial_mutation_possible", "canonical_truth_preserved", "RG-AMEND-007-FAILURE-PRESERVES-CANONICAL-TRUTH"],
  ["ai_authority", "legacy_mutating", "non_mutating", "RG-AMEND-008-AI-NON-MUTATION"],
  ["untrusted_content", "legacy_prompt_surface", "data_only_isolated", "RG-AMEND-009-UNTRUSTED-CONTENT-ISOLATION"],
  ["theme_language", "legacy_customer_projection", "non_authoritative_candidate", "RG-AMEND-010-BOUNDED-THEME-LANGUAGE-CANDIDATE"],
] as const;

export function buildLegacyIntelligenceComparison(result: BoundedIntelligenceRuntimeResult): IntelligenceComparisonItem[] {
  const invariants: Record<(typeof CONSTRUCTION_COMPARISON)[number][0], boolean> = {
    question_selection: result.questions.filter((item) => item.selection === "selected").length <= result.budget.limits.search_calls,
    knowledge_precedence: result.questions.filter((item) => item.eligibility === "rf_resolved").every((item) => item.selection === "not_eligible"),
    execution_budget: Object.entries(result.budget.consumed).every(([key, value]) => value <= result.budget.limits[key as keyof typeof result.budget.limits]),
    research_identity: result.supports.every((item) => Boolean(item.questionId && item.candidateId && item.documentId && item.locatorId && item.documentFingerprint && item.investigativeObservationId)),
    support_basis: result.supports.filter((item) => item.verificationStatus === "supported_candidate").every((item) => !/(?:keyword|substring|term_presence)/.test(item.assertionBasisCode)),
    admission_authority: result.automaticAdmissionCount === 0 && result.candidatePackets.every((item) => item.lifecycle === "candidate" && item.requiresHumanAdmission),
    failure_behavior: result.canonicalTruthPreserved,
    ai_authority: result.supports.every((item) => item.financialMutationAllowed === false && item.admissionAuthority === "none"),
    untrusted_content: result.securityEvents.filter((item) => item.category === "untrusted_instruction_detected").every((item) => item.disposition === "ignored_data_only"),
    theme_language: result.languageCandidates.every((item) => !item.customerVisible && item.reportPermission === "none" && item.authority === "non_authoritative_candidate"),
  };
  return CONSTRUCTION_COMPARISON.map(([dimension, legacyValue, v2Value, amendmentId]) => ({
    dimension, legacyValue, v2Value,
    classification: invariants[dimension] ? "approved_semantic_amendment" : "unexpected_divergence",
    amendmentId: invariants[dimension] ? amendmentId : null,
    reasonCode: invariants[dimension] ? "construction_backed_approved_transition" : "construction_invariant_failed",
  }));
}
