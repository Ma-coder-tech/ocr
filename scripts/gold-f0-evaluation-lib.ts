import { isDeepStrictEqual } from "node:util";
import type {
  AuthorityLane,
  EvaluationOutcome,
  NormalizedAuthorityAssertion,
  NormalizedAuthorityRegister,
  ReasoningClass,
  UniversalityScope,
} from "./gold-authority-derivability-lib.js";
import { authorityLanes, reasoningClasses, universalityScopes } from "./gold-authority-derivability-lib.js";

// Offline candidate-output contract. This is deliberately not imported by runtime code.
export type F0Candidate = {
  assertionId: string;
  decision: "answer" | "refuse" | "unresolved";
  observed?: unknown;
  dimension: string;
  reasoningClass: ReasoningClass;
  reasoningClasses?: ReasoningClass[];
  authorityLanes: AuthorityLane[];
  evidenceStatus: "verified" | "missing" | "extraction_failed";
  refusalReason?: string;
  presentedAs?: "product_policy" | "financial_fact" | "industry_fact";
  evidenceEffectiveFrom?: string;
  evidenceEffectiveTo?: string;
  universality: UniversalityScope;
  privatePromotionReviewed?: boolean;
};

export const zeroToleranceCategories = [
  "unsupported_positive_admission",
  "evidence_lane_leakage",
  "historical_back_projection",
  "merchant_private_to_global_unreviewed_promotion",
] as const;
export type ZeroToleranceCategory = (typeof zeroToleranceCategories)[number];

export type F0Result = {
  assertionId: string;
  caseId: string;
  outcome: EvaluationOutcome;
  hardFailures: ZeroToleranceCategory[];
  semanticStatus: NormalizedAuthorityAssertion["resolution"]["semanticStatus"];
  sourceExecutionStatus: NormalizedAuthorityAssertion["provenance"]["sourceExecutionStatus"];
  sourceIdentityStatus: NormalizedAuthorityAssertion["authority"]["sourceIdentityStatus"];
  evidenceMappingStatus: NormalizedAuthorityAssertion["provenance"]["evidenceMappingStatus"];
};

function expectedMatches(expected: unknown, observed: unknown): boolean {
  if (!expected || typeof expected !== "object") return false;
  const target = expected as { kind?: string; value?: unknown; state?: unknown; present?: unknown; coverage_code?: unknown };
  if (target.kind === "value") return isDeepStrictEqual(target.value, observed);
  if (target.kind === "state") return isDeepStrictEqual(target.state, observed);
  if (target.kind === "conclusion") return isDeepStrictEqual(target.present, observed);
  if (target.kind === "semantic_theme_coverage") {
    if (!observed || typeof observed !== "object") return false;
    const theme = observed as Record<string, unknown>;
    return Array.isArray(theme.semanticThemeCodes)
      && theme.semanticThemeCodes.includes(target.coverage_code)
      && theme.preservesEconomicMeaning === true
      && theme.preservesEvidenceBoundaries === true
      && theme.preservesActionability === true
      && theme.overstatesCertainty === false
      && theme.createsUnsupportedSavingsOrActionability === false;
  }
  return false;
}

function isLater(effectiveFrom: string | undefined, period: string | null): boolean {
  return Boolean(effectiveFrom && period && /^\d{4}-\d{2}$/.test(effectiveFrom) && effectiveFrom > period);
}

function isEarlier(effectiveTo: string | undefined, period: string | null): boolean {
  return Boolean(effectiveTo && period && /^\d{4}-\d{2}$/.test(effectiveTo) && effectiveTo < period);
}

export function assertF0Candidates(value: unknown): asserts value is F0Candidate[] {
  if (!Array.isArray(value)) throw new Error("F0 candidates must be an array");
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") throw new Error(`Invalid F0 candidate at ${index}`);
    const entry = item as Record<string, unknown>;
    if (typeof entry.assertionId !== "string" || !["answer", "refuse", "unresolved"].includes(String(entry.decision))
      || typeof entry.dimension !== "string" || !reasoningClasses.includes(entry.reasoningClass as ReasoningClass)
      || !Array.isArray(entry.authorityLanes) || entry.authorityLanes.some((lane) => !authorityLanes.includes(lane))
      || !["verified", "missing", "extraction_failed"].includes(String(entry.evidenceStatus))
      || (entry.refusalReason !== undefined && typeof entry.refusalReason !== "string")
      || (entry.presentedAs !== undefined && !["product_policy", "financial_fact", "industry_fact"].includes(String(entry.presentedAs)))
      || (entry.privatePromotionReviewed !== undefined && typeof entry.privatePromotionReviewed !== "boolean")
      || (entry.reasoningClasses !== undefined && (!Array.isArray(entry.reasoningClasses) || entry.reasoningClasses.some((reason) => !reasoningClasses.includes(reason))))) {
      throw new Error(`Invalid F0 candidate at ${index}`);
    }
    if (!universalityScopes.includes(entry.universality as UniversalityScope)) throw new Error(`Invalid F0 universality at ${index}`);
    if (entry.evidenceEffectiveFrom !== undefined && (typeof entry.evidenceEffectiveFrom !== "string" || !/^\d{4}-\d{2}$/.test(entry.evidenceEffectiveFrom))) throw new Error(`Invalid F0 effective period at ${index}`);
    if (entry.evidenceEffectiveTo !== undefined && (typeof entry.evidenceEffectiveTo !== "string" || !/^\d{4}-\d{2}$/.test(entry.evidenceEffectiveTo))) throw new Error(`Invalid F0 effective period at ${index}`);
    if (typeof entry.evidenceEffectiveFrom === "string" && typeof entry.evidenceEffectiveTo === "string" && entry.evidenceEffectiveFrom > entry.evidenceEffectiveTo) throw new Error(`Invalid F0 effective interval at ${index}`);
  }
}

export function evaluateF0Assertion(assertion: NormalizedAuthorityAssertion, candidate?: F0Candidate): F0Result {
  const hardFailures: ZeroToleranceCategory[] = [];
  const add = (category: ZeroToleranceCategory) => {
    if (!hardFailures.includes(category)) hardFailures.push(category);
  };
  const result = (outcome: EvaluationOutcome): F0Result => ({
    assertionId: assertion.assertionId,
    caseId: assertion.caseId,
    outcome,
    hardFailures,
    semanticStatus: assertion.resolution.semanticStatus,
    sourceExecutionStatus: assertion.provenance.sourceExecutionStatus,
    sourceIdentityStatus: assertion.authority.sourceIdentityStatus,
    evidenceMappingStatus: assertion.provenance.evidenceMappingStatus,
  });

  if (candidate && candidate.assertionId !== assertion.assertionId) throw new Error(`Candidate ID mismatch: ${candidate.assertionId}`);
  if (candidate?.decision === "answer") {
    if (assertion.claim.polarity === "prohibited") add("unsupported_positive_admission");
    if (assertion.temporal.backProjectionProhibited && isLater(candidate.evidenceEffectiveFrom, assertion.temporal.effectivePeriod)) {
      add("historical_back_projection");
    }
    if (candidate.authorityLanes.some((lane) => !assertion.authority.requiredLanes.includes(lane))) {
      add("evidence_lane_leakage");
    }
    if (candidate.authorityLanes.includes("merchant_private_contract_or_correspondence")
      && candidate.universality !== "merchant_account_specific"
      && !candidate.privatePromotionReviewed) {
      add("merchant_private_to_global_unreviewed_promotion");
    }
  }

  // Frozen semantic approval never substitutes for authoritative source mapping.
  const sourceStatus = assertion.provenance.sourceExecutionStatus;
  if (sourceStatus === "not_source_executable" || sourceStatus === "source_unavailable") {
    if (candidate?.decision === "answer") {
      add("unsupported_positive_admission");
      return result("unsupported_inference");
    }
    return result(sourceStatus === "not_source_executable" ? "source_mapping_incomplete" : "missing_source_authority");
  }
  if (assertion.resolution.status === "gold_ambiguity" || assertion.resolution.semanticStatus === "gold_ambiguity") {
    return result("gold_ambiguity");
  }
  if (!candidate || candidate.evidenceStatus === "extraction_failed") return result("extraction_failure");
  if (candidate.dimension !== assertion.claim.dimension) return result("incorrect_conclusion");
  if (candidate.universality !== assertion.universality) return result("incorrect_conclusion");
  const policy = assertion.productPolicy.dependsOnReviewedPolicy || assertion.reasoning.primaryClass === "product_policy_judgment";
  if (policy && candidate.presentedAs !== "product_policy") return result("policy_mismatch");
  if (!policy && candidate.presentedAs === "product_policy") return result("policy_mismatch");
  if (candidate.decision === "refuse") {
    if (!candidate.refusalReason) return result("incorrect_conclusion");
    if (candidate.evidenceStatus === "verified" && (
      !assertion.reasoning.allowedClasses.includes(candidate.reasoningClass)
      || !candidate.authorityLanes.includes(assertion.authority.primaryLane)
    )) return result("missing_source_authority");
    if (assertion.claim.polarity === "prohibited" || assertion.resolution.semanticStatus === "refused") {
      return result(candidate.refusalReason === "prohibited_positive_claim" ? "correct_refusal" : "incorrect_conclusion");
    }
    if (candidate.evidenceStatus === "missing" && candidate.refusalReason === "missing_authority") return result("correct_refusal");
    return result("incorrect_conclusion");
  }
  if (candidate.decision === "unresolved") {
    const expected = assertion.claim.expected as { kind?: string; state?: unknown };
    return result(assertion.resolution.semanticStatus === "unresolved"
      && expected.kind === "state"
      && candidate.refusalReason === expected.state ? "correct_refusal" : "incorrect_conclusion");
  }

  if (assertion.claim.polarity === "prohibited") {
    return result(policy ? "policy_mismatch" : "unsupported_inference");
  }
  if (candidate.evidenceStatus !== "verified"
    || (assertion.temporal.effectivePeriodDependency && assertion.temporal.effectivePeriod !== null && !candidate.evidenceEffectiveFrom)
    || (assertion.temporal.effectivePeriodDependency && isEarlier(candidate.evidenceEffectiveTo, assertion.temporal.effectivePeriod))
    || !assertion.reasoning.allowedClasses.includes(candidate.reasoningClass)
    || assertion.reasoning.requiredClasses.some((required) => !(candidate.reasoningClasses ?? [candidate.reasoningClass]).includes(required))
    || assertion.authority.requiredLanes.some((lane) => !candidate.authorityLanes.includes(lane))
    || hardFailures.length > 0) {
    add("unsupported_positive_admission");
    return result("unsupported_inference");
  }
  return result(expectedMatches(assertion.claim.expected, candidate.observed) ? "correct_answer" : "incorrect_conclusion");
}

export function evaluateF0Register(register: NormalizedAuthorityRegister, candidates: F0Candidate[]): F0Result[] {
  const byId = new Map<string, F0Candidate>();
  const known = new Set(register.assertions.map((item) => item.assertionId));
  for (const candidate of candidates) {
    if (!known.has(candidate.assertionId)) throw new Error(`Unknown candidate assertion: ${candidate.assertionId}`);
    if (byId.has(candidate.assertionId)) throw new Error(`Duplicate candidate assertion: ${candidate.assertionId}`);
    byId.set(candidate.assertionId, candidate);
  }
  return register.assertions.map((assertion) => evaluateF0Assertion(assertion, byId.get(assertion.assertionId)));
}
