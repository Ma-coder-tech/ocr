import type {
  ControlState,
  Hypothesis,
  InferenceEvidenceFactorEvaluation,
  InferenceVerificationClassification,
  InferenceVerificationRecipeDefinition,
  InferenceVerificationRequest,
  InferenceVerificationResult,
  Observation,
} from "./types.js";

function rejected(
  request: InferenceVerificationRequest,
  reason: string,
): InferenceVerificationResult {
  return {
    requestId: request.requestId,
    recipeId: request.recipeId,
    candidateId: request.candidateId,
    validationState: "rejected",
    controlState: "unresolved",
    classification: "irrelevant",
    observationRefs: request.roleBindings.map((binding) => binding.observationRef).sort(),
    componentResults: [],
    reason,
  };
}

function componentState(left: unknown, right: unknown, ordered = false): ControlState {
  if (typeof left === "number" && typeof right === "number") {
    return (ordered ? left < right : left === right) ? "pass" : "fail";
  }
  if (typeof left === "string" && typeof right === "string") {
    return (ordered ? left < right : left === right) ? "pass" : "fail";
  }
  return "unresolved";
}

function executeAcceptedRequest(
  hypothesis: Hypothesis,
  request: InferenceVerificationRequest,
  recipe: InferenceVerificationRecipeDefinition,
  observations: Map<string, Observation>,
): InferenceVerificationResult {
  const candidate = recipe.candidates.find((item) => item.id === request.candidateId);
  if (!candidate) return rejected(request, "The provider selected an unapproved RateReveal verification candidate.");
  const expectedRoles = recipe.roles.map((role) => role.role);
  const bindingByRole = new Map(request.roleBindings.map((binding) => [binding.role, binding]));
  const candidateBindingByRole = new Map(candidate.roleBindings.map((binding) => [binding.role, binding]));
  if (request.roleBindings.length !== expectedRoles.length
      || bindingByRole.size !== request.roleBindings.length
      || candidateBindingByRole.size !== candidate.roleBindings.length
      || candidate.roleBindings.length !== expectedRoles.length
      || expectedRoles.some((role) => !bindingByRole.has(role)
        || candidateBindingByRole.get(role)?.observationRef !== bindingByRole.get(role)?.observationRef)) {
    return rejected(request, "The request did not resolve to one intact RateReveal-approved candidate relationship.");
  }
  for (const role of recipe.roles) {
    const observationRef = bindingByRole.get(role.role)!.observationRef;
    const observation = observations.get(observationRef);
    if (!role.allowedObservationRefs.includes(observationRef) || !observation
        || !role.allowedKinds.includes(observation.kind)
        || (observation.authority !== "source_printed" && observation.authority !== "deterministic_extraction")) {
      return rejected(request, `The source binding for role ${role.role} is not permitted by RateReveal.`);
    }
  }

  const value = (role: typeof expectedRoles[number]) =>
    observations.get(bindingByRole.get(role)!.observationRef)!.value;
  const componentResults: InferenceVerificationResult["componentResults"] = recipe.checkType === "row_pair_match"
    ? [
        { component: "amount_equality", state: componentState(value("left_amount"), value("right_amount")) },
        { component: "count_equality", state: componentState(value("left_count"), value("right_count")) },
        { component: "temporal_order", state: componentState(value("earlier_date"), value("later_date"), true) },
      ]
    : [{ component: "identifier_equality", state: componentState(value("left_identifier"), value("right_identifier")) }];
  const controlState: ControlState = componentResults.some((component) => component.state === "fail")
    ? "fail"
    : componentResults.some((component) => component.state === "unresolved")
      ? "unresolved"
      : "pass";
  const impact = candidate.alternativeImpacts.find((item) =>
    item.alternativeId === hypothesis.inferenceTopic?.alternativeId);
  const classification: InferenceVerificationClassification = controlState === "unresolved"
    ? "unresolved"
    : impact
      ? controlState === "pass" ? impact.pass : impact.fail
      : "irrelevant";
  const evidenceFactor: InferenceEvidenceFactorEvaluation | undefined = impact
      && (classification === "supporting" || classification === "contradicting")
    ? {
        factorId: `verification.${recipe.id}.${candidate.id}.${request.requestId}`,
        effect: classification === "supporting" ? "supports" : "contradicts",
        diagnosticity: impact.diagnosticity,
        independenceGroupId: impact.independenceGroupId,
        controlIds: [],
        state: "satisfied",
      }
    : undefined;
  return {
    requestId: request.requestId,
    recipeId: request.recipeId,
    candidateId: request.candidateId,
    validationState: "accepted",
    controlState,
    classification,
    observationRefs: request.roleBindings.map((binding) => binding.observationRef).sort(),
    componentResults,
    ...(evidenceFactor ? { evidenceFactor } : {}),
    reason: controlState === "pass"
      ? recipe.checkType === "row_pair_match"
        ? "RateReveal verified amount equality, count equality, and temporal order from the bound source observations."
        : "RateReveal verified identifier equality from the bound source observations."
      : controlState === "fail"
        ? "At least one RateReveal-owned verification component failed."
        : "At least one required source value was unavailable or type-incompatible.",
  };
}

export function executeInferenceVerificationRequests(
  hypotheses: Hypothesis[],
  observations: Observation[],
): Map<string, InferenceVerificationResult[]> {
  const byObservationId = new Map(observations.map((observation) => [observation.id, observation]));
  const results = new Map<string, InferenceVerificationResult[]>();
  for (const hypothesis of hypotheses) {
    if (hypothesis.ownership.kind !== "provider") continue;
    const requests = hypothesis.inference?.verificationRequests ?? [];
    const recipes = new Map((hypothesis.inferenceTopic?.verificationRecipes ?? [])
      .map((recipe) => [recipe.id, recipe]));
    const seenRequestIds = new Set<string>();
    results.set(hypothesis.id, requests.map((request) => {
      if (!request.requestId.trim() || seenRequestIds.has(request.requestId)) {
        return rejected(request, "The verification request identity is empty or duplicated.");
      }
      seenRequestIds.add(request.requestId);
      const recipe = recipes.get(request.recipeId);
      if (!recipe) return rejected(request, "The provider selected an unapproved verification recipe.");
      return executeAcceptedRequest(hypothesis, request, recipe, byObservationId);
    }));
  }
  return results;
}
