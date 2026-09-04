import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import {
  aggregateIndependentInferenceSupport,
  capInferenceStrength,
  evaluateInferenceEvidenceFactor,
  inferenceStrengthFromIndependentSupport,
} from "./inferenceEvidencePosture.js";
import type {
  ControlResult,
  Hypothesis,
  HypothesisResult,
  InferenceEvidenceFactorEvaluation,
  InferenceTopic,
  RateRevealAlternativeEvidencePosture,
  VerifiedInferenceEvidence,
} from "./types.js";

export const ALTERNATIVE_EVIDENCE_POSTURE_MODEL_VERSION =
  "ratereveal-alternative-evidence-posture-v1" as const;
export const VERIFIED_INFERENCE_EVIDENCE_MODEL_VERSION =
  "ratereveal-verified-inference-evidence-v1" as const;

/**
 * Produces a posture for every RateReveal-owned alternative from controls and
 * source-bound verification evidence. Provider proposals and confidence are
 * deliberately absent from this API.
 */
export function evaluateAlternativeEvidencePostures(input: {
  topics: InferenceTopic[];
  controlResults: ControlResult[];
  verifiedEvidence?: VerifiedInferenceEvidence[];
}): RateRevealAlternativeEvidencePosture[] {
  const controls = new Map(input.controlResults.map((result) => [result.controlId, result]));
  const verifiedEvidence = input.verifiedEvidence ?? [];

  return input.topics.flatMap((topic) => topic.materialAlternatives.map((alternative) => {
    const policy = topic.qualification;
    const configuredFactors = policy.evidenceFactors
      .filter((factor) => factor.alternativeIds.includes(alternative.id))
      .map((factor) => evaluateInferenceEvidenceFactor(factor, controls));
    const persistedFactors = verifiedEvidence
      .filter((item) => item.topicId === topic.id && item.alternativeId === alternative.id)
      .map((item) => structuredClone(item.factor));
    const factorEvaluations = deduplicateFactors([...configuredFactors, ...persistedFactors]);
    const independentSupportGroups = aggregateIndependentInferenceSupport(factorEvaluations);
    const baseStrength = inferenceStrengthFromIndependentSupport(independentSupportGroups);
    const compatibility = policy.compatibilityControlIds.map((id) => controls.get(id));
    const failedCompatibility = compatibility.filter((result) => result?.state === "fail");
    const unresolvedCompatibility = compatibility.filter((result) => !result || result.state === "unresolved");
    const contradictions = factorEvaluations
      .filter((factor) => factor.effect === "contradicts" && factor.state === "satisfied");
    const common = {
      modelVersion: ALTERNATIVE_EVIDENCE_POSTURE_MODEL_VERSION,
      topicId: topic.id,
      alternativeId: alternative.id,
      factorEvaluations,
      satisfiedSupportFactorIds: factorEvaluations
        .filter((factor) => factor.effect === "supports" && factor.state === "satisfied")
        .map((factor) => factor.factorId),
      unresolvedFactorIds: factorEvaluations
        .filter((factor) => factor.state === "unresolved")
        .map((factor) => factor.factorId),
      independentSupportGroups,
      baseStrength,
      sourceCompleteness: policy.sourceCompleteness,
      unresolvedProofObligationIds: [...alternative.requiredProofObligationIds],
      providerProposalRequired: false as const,
      providerConfidenceUsed: false as const,
    };

    if (failedCompatibility.length > 0 || contradictions.length > 0) {
      return {
        ...common,
        outcome: "contradicted" as const,
        satisfiedContradictionFactorIds: contradictions.map((factor) => factor.factorId),
        qualifiedStrength: "unknown_competing" as const,
        reasonCodes: [
          "provider_proposal_excluded_from_presentation_posture",
          "provider_confidence_excluded_from_qualification",
          ...(failedCompatibility.length > 0 ? ["deterministic_compatibility_control_failed"] : []),
          ...(contradictions.length > 0 ? ["deterministic_contradiction_factor_satisfied"] : []),
        ],
      };
    }

    let qualifiedStrength = capInferenceStrength(baseStrength, policy.maximumStrength);
    const reasonCodes = [
      "provider_proposal_excluded_from_presentation_posture",
      "provider_confidence_excluded_from_qualification",
      `topic_maximum_strength_${policy.maximumStrength}`,
      `source_completeness_${policy.sourceCompleteness}`,
    ];
    if (unresolvedCompatibility.length > 0) {
      qualifiedStrength = "unknown_competing";
      reasonCodes.push("deterministic_compatibility_control_unresolved");
    } else {
      reasonCodes.push("deterministic_compatibility_controls_passed");
    }
    if (policy.completenessRequirement === "complete_statement_required"
      && policy.sourceCompleteness !== "proven_complete") {
      qualifiedStrength = "unknown_competing";
      reasonCodes.push("required_statement_completeness_not_proven");
    } else if (policy.sourceCompleteness === "proven_incomplete") {
      qualifiedStrength = capInferenceStrength(qualifiedStrength, "weak");
      reasonCodes.push("source_proven_incomplete");
    }

    if (baseStrength === "unknown_competing") reasonCodes.push("no_verified_support_for_alternative");
    if (qualifiedStrength !== baseStrength) reasonCodes.push("ratereveal_policy_capped_evidence_strength");

    return {
      ...common,
      outcome: "qualified" as const,
      satisfiedContradictionFactorIds: [],
      qualifiedStrength,
      reasonCodes,
    };
  }));
}

/** Extracts only accepted, deterministic verification outcomes into a source-bound ledger. */
export function verifiedInferenceEvidenceFromResults(input: {
  sourceContentSha256: string;
  providerHypotheses: Hypothesis[];
  hypothesisResults: HypothesisResult[];
}): VerifiedInferenceEvidence[] {
  const resultByHypothesisId = new Map(input.hypothesisResults.map((result) => [result.hypothesisId, result]));
  const evidence = input.providerHypotheses.flatMap((hypothesis): VerifiedInferenceEvidence[] => {
    const topic = hypothesis.inferenceTopic;
    const result = resultByHypothesisId.get(hypothesis.id);
    if (!topic || !result) return [];
    return (result.verificationResults ?? []).flatMap((verification) =>
      verification.validationState === "accepted" && verification.evidenceFactor
        ? [{
            modelVersion: VERIFIED_INFERENCE_EVIDENCE_MODEL_VERSION,
            sourceContentSha256: input.sourceContentSha256,
            topicId: topic.topicId,
            alternativeId: topic.alternativeId,
            factor: structuredClone(verification.evidenceFactor),
            verification: {
              requestId: verification.requestId,
              recipeId: verification.recipeId,
              candidateId: verification.candidateId,
            },
            verificationResult: structuredClone(verification),
          }]
        : []);
  });
  return mergeVerifiedInferenceEvidence([], evidence);
}

export function mergeVerifiedInferenceEvidence(
  persisted: VerifiedInferenceEvidence[],
  additions: VerifiedInferenceEvidence[],
): VerifiedInferenceEvidence[] {
  const merged = new Map<string, VerifiedInferenceEvidence>();
  for (const item of [...persisted, ...additions]) {
    const key = [
      item.sourceContentSha256,
      item.topicId,
      item.alternativeId,
      item.factor.factorId,
      item.factor.independenceGroupId,
    ].join("|");
    merged.set(key, structuredClone(item));
  }
  return [...merged.values()].sort((left, right) =>
    left.topicId.localeCompare(right.topicId)
    || left.alternativeId.localeCompare(right.alternativeId)
    || left.factor.factorId.localeCompare(right.factor.factorId));
}

// Saved JSON crosses a runtime boundary; TypeScript types alone cannot validate it.
const savedFactorSchema = z.object({
  factorId: z.string().min(1),
  effect: z.enum(["supports", "contradicts"]),
  diagnosticity: z.enum(["contextual", "material", "decisive"]),
  independenceGroupId: z.string().min(1),
  controlIds: z.array(z.string()).length(0),
  state: z.literal("satisfied"),
}).strict();
const savedEvidenceSchema = z.object({
  modelVersion: z.literal(VERIFIED_INFERENCE_EVIDENCE_MODEL_VERSION),
  sourceContentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  topicId: z.string().min(1),
  alternativeId: z.string().min(1),
  factor: savedFactorSchema,
  verification: z.object({
    requestId: z.string().trim().min(1), recipeId: z.string().min(1), candidateId: z.string().min(1),
  }).strict(),
  verificationResult: z.object({
    requestId: z.string(), recipeId: z.string(), candidateId: z.string(),
    validationState: z.literal("accepted"),
    controlState: z.enum(["pass", "fail"]),
    classification: z.enum(["supporting", "contradicting"]),
    observationRefs: z.array(z.string()),
    componentResults: z.array(z.object({
      component: z.enum(["amount_equality", "count_equality", "temporal_order", "identifier_equality"]),
      state: z.enum(["pass", "fail", "unresolved"]),
    }).strict()),
    evidenceFactor: savedFactorSchema,
    reason: z.string(),
  }).strict(),
}).strict();

export function validateVerifiedInferenceEvidence(input: {
  sourceContentSha256: string;
  topics: InferenceTopic[];
  evidence: unknown;
}): string[] {
  const topics = new Map(input.topics.map((topic) => [topic.id, topic]));
  const parsed = z.array(savedEvidenceSchema).safeParse(input.evidence);
  if (!parsed.success) return ["Persisted inference evidence is incomplete or malformed."];
  return parsed.data.flatMap((item) => {
    const topic = topics.get(item.topicId);
    if (item.modelVersion !== VERIFIED_INFERENCE_EVIDENCE_MODEL_VERSION) {
      return [`Persisted inference evidence ${item.factor.factorId} has an unsupported model version.`];
    }
    if (item.sourceContentSha256 !== input.sourceContentSha256) {
      return [`Persisted inference evidence ${item.factor.factorId} is bound to a different source fingerprint.`];
    }
    if (!topic?.materialAlternatives.some((alternative) => alternative.id === item.alternativeId)) {
      return [`Persisted inference evidence ${item.factor.factorId} names an unapproved topic alternative.`];
    }
    const recipe = topic.verificationRecipes.find((candidate) => candidate.id === item.verification.recipeId);
    const candidate = recipe?.candidates.find((entry) => entry.id === item.verification.candidateId);
    const impact = candidate?.alternativeImpacts.find((entry) => entry.alternativeId === item.alternativeId);
    const expectedFactorPrefix = `verification.${item.verification.recipeId}.${item.verification.candidateId}.`;
    const verificationResult = item.verificationResult;
    const expectedObservationRefs = candidate?.roleBindings.map((binding) => binding.observationRef).sort() ?? [];
    const expectedComponents = recipe?.checkType === "row_pair_match"
      ? ["amount_equality", "count_equality", "temporal_order"]
      : recipe?.checkType === "identifier_pair_match" ? ["identifier_equality"] : [];
    const actualComponents = verificationResult.componentResults.map((component) => component.component);
    if (expectedComponents.length === 0
        || !isDeepStrictEqual([...actualComponents].sort(), [...expectedComponents].sort())) {
      return ["Persisted inference evidence must contain exactly the complete verification recipe components."];
    }
    const recomputedControlState = verificationResult.componentResults.some((component) => component.state === "fail")
      ? "fail"
      : verificationResult.componentResults.some((component) => component.state === "unresolved")
        ? "unresolved"
        : "pass";
    const expectedClassification = impact
      ? recomputedControlState === "pass" ? impact.pass
        : recomputedControlState === "fail" ? impact.fail
          : "unresolved"
      : "irrelevant";
    if (!recipe || !candidate || !impact
      || item.factor.effect !== (expectedClassification === "supporting" ? "supports" : "contradicts")
      || item.factor.diagnosticity !== impact.diagnosticity
      || item.factor.independenceGroupId !== impact.independenceGroupId
      || item.factor.state !== "satisfied"
      || item.factor.factorId !== `${expectedFactorPrefix}${item.verification.requestId}`
      || verificationResult.requestId !== item.verification.requestId
      || verificationResult.recipeId !== item.verification.recipeId
      || verificationResult.candidateId !== item.verification.candidateId
      || verificationResult.validationState !== "accepted"
      || (verificationResult.controlState !== "pass" && verificationResult.controlState !== "fail")
      || (verificationResult.classification !== "supporting" && verificationResult.classification !== "contradicting")
      || verificationResult.controlState !== recomputedControlState
      || verificationResult.classification !== expectedClassification
      || JSON.stringify([...verificationResult.observationRefs].sort()) !== JSON.stringify(expectedObservationRefs)
      || verificationResult.evidenceFactor === undefined
      || !isDeepStrictEqual(verificationResult.evidenceFactor, item.factor)) {
      return [`Persisted inference evidence ${item.factor.factorId} does not match its RateReveal-owned verification recipe and candidate.`];
    }
    return [];
  });
}

function deduplicateFactors(
  factors: InferenceEvidenceFactorEvaluation[],
): InferenceEvidenceFactorEvaluation[] {
  const deduplicated = new Map<string, InferenceEvidenceFactorEvaluation>();
  for (const factor of factors) {
    const key = `${factor.factorId}|${factor.independenceGroupId}`;
    deduplicated.set(key, structuredClone(factor));
  }
  return [...deduplicated.values()].sort((left, right) => left.factorId.localeCompare(right.factorId));
}
