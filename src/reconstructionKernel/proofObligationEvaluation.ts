import type {
  InferenceTopic,
  Observation,
  ProofObligationBinding,
  ProofObligationBindingEvaluation,
  ProofObligationObservationRequirement,
  ProofObligationValidation,
} from "./types.js";

export const PROOF_OBLIGATION_MODEL_VERSION = "ratereveal-proof-obligations-v1" as const;

/**
 * Validates provider bindings against RateReveal-owned proof obligations and
 * source observations. Natural-language rationale and missing-proof prose are
 * intentionally absent from this API: they are audit material, not evidence.
 */
export function evaluateProofObligationBindings(
  topic: InferenceTopic,
  alternativeId: string,
  bindings: ProofObligationBinding[],
  observations: Observation[],
): ProofObligationValidation {
  const alternative = topic.materialAlternatives.find((candidate) => candidate.id === alternativeId);
  if (!alternative) throw new Error(`Unknown RateReveal material alternative ${alternativeId}.`);

  const obligationById = new Map(topic.proofObligations.map((obligation) => [obligation.id, obligation]));
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));
  const required = alternative.requiredProofObligationIds;
  const requiredSet = new Set(required);
  const errors: string[] = [];

  for (const binding of bindings) {
    if (!requiredSet.has(binding.obligationId)) {
      errors.push(`Binding references non-required proof obligation ${binding.obligationId}.`);
    }
  }

  const evaluations = required.map<ProofObligationBindingEvaluation>((obligationId) => {
    const evaluationErrors: string[] = [];
    const obligation = obligationById.get(obligationId);
    if (!obligation) {
      evaluationErrors.push(`Required proof obligation ${obligationId} is not defined by RateReveal.`);
      return { obligationId, valid: false, errors: evaluationErrors };
    }

    const matches = bindings.filter((binding) => binding.obligationId === obligationId);
    if (matches.length !== 1) {
      evaluationErrors.push(`Expected exactly one binding for ${obligationId}; received ${matches.length}.`);
      return { obligationId, valid: false, errors: evaluationErrors };
    }
    const binding = matches[0];

    if (binding.gapKind !== obligation.gapKind) {
      evaluationErrors.push(`Gap kind ${binding.gapKind} does not match ${obligation.gapKind}.`);
    }
    if (binding.missingProperty !== obligation.missingProperty) {
      evaluationErrors.push(`Missing property ${binding.missingProperty} does not match ${obligation.missingProperty}.`);
    }
    if (new Set(binding.resolutionEvidenceKinds).size !== binding.resolutionEvidenceKinds.length) {
      evaluationErrors.push("Resolution evidence kinds must not be repeated.");
    }
    if (binding.resolutionEvidenceKinds.length === 0
      || binding.resolutionEvidenceKinds.some((kind) => !obligation.resolutionEvidenceKinds.includes(kind))) {
      evaluationErrors.push("Resolution evidence must select at least one RateReveal-permitted evidence kind.");
    }

    const requiredRoles = new Set(obligation.observationRequirements.map((requirement) => requirement.role));
    const bindingRoles = binding.observationBindings.map((entry) => entry.role);
    if (new Set(bindingRoles).size !== bindingRoles.length) {
      evaluationErrors.push("Observation roles must not be repeated.");
    }
    for (const role of bindingRoles) {
      if (!requiredRoles.has(role)) evaluationErrors.push(`Observation role ${role} is not required by ${obligationId}.`);
    }
    for (const requirement of obligation.observationRequirements) {
      validateObservationRequirement(requirement, binding.observationBindings, observationById, evaluationErrors);
    }

    return { obligationId, valid: evaluationErrors.length === 0, errors: evaluationErrors };
  });

  for (const evaluation of evaluations) errors.push(...evaluation.errors.map((error) => `${evaluation.obligationId}: ${error}`));
  return {
    modelVersion: PROOF_OBLIGATION_MODEL_VERSION,
    requiredObligationIds: structuredClone(required),
    validatedObligationIds: evaluations.filter((evaluation) => evaluation.valid).map((evaluation) => evaluation.obligationId),
    evaluations,
    errors,
  };
}

function validateObservationRequirement(
  requirement: ProofObligationObservationRequirement,
  bindings: ProofObligationBinding["observationBindings"],
  observationById: Map<string, Observation>,
  errors: string[],
): void {
  const matches = bindings.filter((binding) => binding.role === requirement.role);
  if (matches.length !== 1) {
    errors.push(`Role ${requirement.role} must be bound exactly once; received ${matches.length}.`);
    return;
  }
  const refs = matches[0].observationRefs;
  if (!sameStringSet(refs, requirement.observationRefs)) {
    errors.push(`Role ${requirement.role} is not bound to the RateReveal-required source observations.`);
    return;
  }
  for (const reference of refs) {
    const observation = observationById.get(reference);
    if (!observation) {
      errors.push(`Role ${requirement.role} references unknown observation ${reference}.`);
      continue;
    }
    if (!requirement.allowedKinds.includes(observation.kind)) {
      errors.push(`Role ${requirement.role} references disallowed observation kind ${observation.kind}.`);
    }
    if (requirement.valueState === "missing" && observation.value !== null) {
      errors.push(`Role ${requirement.role} requires a missing source value.`);
    }
    if (requirement.valueState === "present" && observation.value === null) {
      errors.push(`Role ${requirement.role} requires a present source value.`);
    }
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
