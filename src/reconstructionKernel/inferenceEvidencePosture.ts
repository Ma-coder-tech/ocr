import type {
  ControlResult,
  Hypothesis,
  InferenceEvidenceDiagnosticity,
  InferenceEvidenceFactorDefinition,
  InferenceEvidenceFactorEvaluation,
  InferenceEvidencePosture,
  QualifiedInferenceStrength,
} from "./types.js";

export const INFERENCE_EVIDENCE_POSTURE_MODEL_VERSION = "ratereveal-inference-evidence-posture-v1" as const;

const diagnosticityRank: Record<InferenceEvidenceDiagnosticity, number> = {
  contextual: 1,
  material: 2,
  decisive: 3,
};

const strengthRank: Record<QualifiedInferenceStrength, number> = {
  unknown_competing: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

function evaluateFactor(
  factor: InferenceEvidenceFactorDefinition,
  controls: Map<string, ControlResult>,
): InferenceEvidenceFactorEvaluation {
  const results = factor.controlIds.map((controlId) => controls.get(controlId));
  let state: InferenceEvidenceFactorEvaluation["state"];
  if (factor.activation === "all_pass") {
    state = results.some((result) => result?.state === "fail")
      ? "not_satisfied"
      : results.some((result) => !result || result.state === "unresolved")
        ? "unresolved"
        : "satisfied";
  } else {
    state = results.some((result) => result?.state === "fail")
      ? "satisfied"
      : results.some((result) => !result || result.state === "unresolved")
        ? "unresolved"
        : "not_satisfied";
  }
  return {
    factorId: factor.id,
    effect: factor.effect,
    diagnosticity: factor.diagnosticity,
    independenceGroupId: factor.independenceGroupId,
    controlIds: [...factor.controlIds],
    state,
  };
}

function aggregateIndependentSupport(
  factors: InferenceEvidenceFactorEvaluation[],
): InferenceEvidencePosture["independentSupportGroups"] {
  const groups = new Map<string, InferenceEvidenceFactorEvaluation[]>();
  for (const factor of factors.filter((item) => item.effect === "supports" && item.state === "satisfied")) {
    const group = groups.get(factor.independenceGroupId) ?? [];
    group.push(factor);
    groups.set(factor.independenceGroupId, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([independenceGroupId, members]) => ({
      independenceGroupId,
      diagnosticity: members.reduce((strongest, member) =>
        diagnosticityRank[member.diagnosticity] > diagnosticityRank[strongest]
          ? member.diagnosticity
          : strongest, members[0]!.diagnosticity),
      factorIds: members.map((member) => member.factorId).sort(),
    }));
}

function strengthFromIndependentSupport(
  groups: InferenceEvidencePosture["independentSupportGroups"],
): QualifiedInferenceStrength {
  const decisive = groups.filter((group) => group.diagnosticity === "decisive").length;
  const material = groups.filter((group) => group.diagnosticity === "material").length;
  const contextual = groups.filter((group) => group.diagnosticity === "contextual").length;
  if (decisive > 0 || material >= 2) return "strong";
  if (material > 0 || contextual >= 2) return "moderate";
  if (contextual > 0) return "weak";
  return "unknown_competing";
}

function capStrength(
  strength: QualifiedInferenceStrength,
  ceiling: QualifiedInferenceStrength,
): QualifiedInferenceStrength {
  return strengthRank[strength] <= strengthRank[ceiling] ? strength : ceiling;
}

/**
 * Qualifies provider-selected alternatives solely from RateReveal-owned controls
 * and policy. Provider confidence is deliberately absent from this API.
 */
export function evaluateInferenceEvidencePosture(
  hypothesis: Hypothesis,
  controls: Map<string, ControlResult>,
  competingAlternativeCount: number,
): InferenceEvidencePosture {
  const topic = hypothesis.inferenceTopic;
  const inference = hypothesis.inference;
  if (!topic || !inference) {
    return {
      modelVersion: INFERENCE_EVIDENCE_POSTURE_MODEL_VERSION,
      alternativeId: topic?.alternativeId ?? "unknown",
      outcome: "qualified",
      factorEvaluations: [],
      satisfiedSupportFactorIds: [],
      satisfiedContradictionFactorIds: [],
      unresolvedFactorIds: [],
      independentSupportGroups: [],
      baseStrength: "unknown_competing",
      qualifiedStrength: "unknown_competing",
      sourceCompleteness: topic?.qualification.sourceCompleteness ?? "unproven",
      unresolvedProofObligationIds: topic?.requiredProofObligationIds ?? [],
      allMaterialEvidenceNeedsAcknowledged: false,
      allRequiredProofObligationsValidated: false,
      providerConfidenceUsed: false,
      reasonCodes: ["ratereveal_topic_or_provider_inference_missing", "provider_confidence_excluded_from_qualification"],
    };
  }

  const policy = topic.qualification;
  const applicableFactors = policy.evidenceFactors
    .filter((factor) => factor.alternativeIds.includes(topic.alternativeId));
  const factorEvaluations = applicableFactors.map((factor) => evaluateFactor(factor, controls));
  const independentSupportGroups = aggregateIndependentSupport(factorEvaluations);
  const baseStrength = strengthFromIndependentSupport(independentSupportGroups);
  const compatibility = policy.compatibilityControlIds.map((id) => controls.get(id));
  const failedCompatibility = compatibility.filter((result) => result?.state === "fail");
  const unresolvedCompatibility = compatibility.filter((result) => !result || result.state === "unresolved");
  const satisfiedContradictions = factorEvaluations
    .filter((factor) => factor.effect === "contradicts" && factor.state === "satisfied");
  const acknowledged = new Set(inference.acknowledgedEvidenceNeedIds ?? []);
  const allMaterialEvidenceNeedsAcknowledged = policy.materialEvidenceNeedIds.every((id) => acknowledged.has(id));
  const validated = new Set(inference.proofObligationValidation?.validatedObligationIds ?? []);
  const allRequiredProofObligationsValidated = topic.requiredProofObligationIds.every((id) => validated.has(id))
    && (inference.proofObligationValidation?.errors.length ?? 1) === 0;
  const commonReasonCodes = [
    "provider_confidence_excluded_from_qualification",
    `topic_maximum_strength_${policy.maximumStrength}`,
    `source_completeness_${policy.sourceCompleteness}`,
    ...(competingAlternativeCount > 0 ? ["competing_alternatives_retained"] : ["implicit_unknown_alternative_retained"]),
  ];

  if (failedCompatibility.length > 0 || satisfiedContradictions.length > 0) {
    return {
      modelVersion: INFERENCE_EVIDENCE_POSTURE_MODEL_VERSION,
      alternativeId: topic.alternativeId,
      outcome: "contradicted",
      factorEvaluations,
      satisfiedSupportFactorIds: factorEvaluations.filter((item) => item.effect === "supports" && item.state === "satisfied").map((item) => item.factorId),
      satisfiedContradictionFactorIds: satisfiedContradictions.map((item) => item.factorId),
      unresolvedFactorIds: factorEvaluations.filter((item) => item.state === "unresolved").map((item) => item.factorId),
      independentSupportGroups,
      baseStrength,
      qualifiedStrength: "unknown_competing",
      sourceCompleteness: policy.sourceCompleteness,
      unresolvedProofObligationIds: [...topic.requiredProofObligationIds],
      allMaterialEvidenceNeedsAcknowledged,
      allRequiredProofObligationsValidated,
      providerConfidenceUsed: false,
      reasonCodes: [
        ...commonReasonCodes,
        ...(failedCompatibility.length > 0 ? ["deterministic_compatibility_control_failed"] : []),
        ...(satisfiedContradictions.length > 0 ? ["deterministic_contradiction_factor_satisfied"] : []),
      ],
    };
  }

  let qualifiedStrength = capStrength(baseStrength, policy.maximumStrength);
  const reasonCodes = [...commonReasonCodes];
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
    qualifiedStrength = capStrength(qualifiedStrength, "weak");
    reasonCodes.push("source_proven_incomplete");
  } else if (policy.completenessRequirement === "observed_rows_sufficient") {
    reasonCodes.push("topic_is_bounded_to_observed_rows");
  } else {
    reasonCodes.push("required_statement_completeness_proven");
  }
  if (!allMaterialEvidenceNeedsAcknowledged) {
    qualifiedStrength = capStrength(qualifiedStrength, "weak");
    reasonCodes.push("material_proof_gap_not_acknowledged");
  } else {
    reasonCodes.push("material_proof_gaps_acknowledged");
  }
  if (!allRequiredProofObligationsValidated) {
    qualifiedStrength = capStrength(qualifiedStrength, "weak");
    reasonCodes.push("material_proof_obligation_not_validated");
  } else {
    reasonCodes.push("material_proof_obligations_validated");
  }
  if (baseStrength === "unknown_competing") reasonCodes.push("no_verified_support_for_selected_alternative");
  if (qualifiedStrength !== baseStrength) reasonCodes.push("ratereveal_policy_capped_evidence_strength");

  return {
    modelVersion: INFERENCE_EVIDENCE_POSTURE_MODEL_VERSION,
    alternativeId: topic.alternativeId,
    outcome: "qualified",
    factorEvaluations,
    satisfiedSupportFactorIds: factorEvaluations.filter((item) => item.effect === "supports" && item.state === "satisfied").map((item) => item.factorId),
    satisfiedContradictionFactorIds: [],
    unresolvedFactorIds: factorEvaluations.filter((item) => item.state === "unresolved").map((item) => item.factorId),
    independentSupportGroups,
    baseStrength,
    qualifiedStrength,
    sourceCompleteness: policy.sourceCompleteness,
    unresolvedProofObligationIds: [...topic.requiredProofObligationIds],
    allMaterialEvidenceNeedsAcknowledged,
    allRequiredProofObligationsValidated,
    providerConfidenceUsed: false,
    reasonCodes,
  };
}
