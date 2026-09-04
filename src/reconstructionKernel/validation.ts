import type {
  Claim,
  DeterministicControl,
  Hypothesis,
  KernelLimits,
  Observation,
  ReconstructionInput,
} from "./types.js";

export const DEFAULT_KERNEL_LIMITS: KernelLimits = Object.freeze({
  maxObservations: 500,
  maxControls: 250,
  maxHypotheses: 64,
  maxPossibleWorlds: 128,
});

function duplicateIds(values: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates].sort();
}

function controlObservationRefs(control: DeterministicControl): string[] {
  switch (control.kind) {
    case "equal":
    case "not_equal":
      return [control.leftObservationRef, control.rightObservationRef];
    case "compare":
      return [control.observationRef];
    case "arithmetic":
      return [...control.terms.map((term) => term.observationRef), ...(control.expectedObservationRef ? [control.expectedObservationRef] : [])];
    case "relation":
      return [control.relationObservationRef, ...control.subjectObservationRefs];
    case "temporal_order":
      return [control.earlierObservationRef, control.laterObservationRef];
    case "lifecycle_transition":
      return [control.earlierObservationRef, control.laterObservationRef].filter((value): value is string => value !== undefined);
  }
}

function validateClaim(claim: Claim, observations: Map<string, Observation>, controlIds: Set<string>, owner: string): string[] {
  const errors: string[] = [];
  if (!claim.key.trim()) errors.push(`${owner} has a claim with an empty key.`);
  if (claim.observationRefs.length === 0) errors.push(`${owner} claim ${claim.key} has no observation lineage.`);
  for (const reference of claim.observationRefs) {
    if (!observations.has(reference)) errors.push(`${owner} claim ${claim.key} references unknown observation ${reference}.`);
  }
  if (claim.support === "source_observation") {
    const nonSource = claim.observationRefs.filter((reference) => observations.get(reference)?.authority !== "source_printed");
    if (nonSource.length > 0) errors.push(`${owner} claim ${claim.key} asserts source authority from non-source observations: ${nonSource.join(", ")}.`);
  }
  if (claim.support === "deterministic_derivation" && (claim.controlRefs?.length ?? 0) === 0) {
    errors.push(`${owner} claim ${claim.key} has deterministic_derivation support but no control lineage.`);
  }
  for (const controlRef of claim.controlRefs ?? []) {
    if (!controlIds.has(controlRef)) errors.push(`${owner} claim ${claim.key} references unknown control ${controlRef}.`);
  }
  return errors;
}

function validateHypothesis(
  hypothesis: Hypothesis,
  observations: Map<string, Observation>,
  controlIds: Set<string>,
): string[] {
  const errors: string[] = [];
  if (!hypothesis.groupId.trim()) errors.push(`Hypothesis ${hypothesis.id} has an empty groupId.`);
  const providerOwned = hypothesis.ownership.kind === "provider";
  if (providerOwned && hypothesis.origin !== "ai" && hypothesis.origin !== "recorded_provider") {
    errors.push(`Provider-owned hypothesis ${hypothesis.id} cannot claim deterministic origin.`);
  }
  if (!providerOwned && hypothesis.origin !== "deterministic") {
    errors.push(`Non-provider hypothesis ${hypothesis.id} has inconsistent origin ${hypothesis.origin}.`);
  }
  if (providerOwned && hypothesis.evidenceClass !== "compatibility_only") {
    errors.push(`Provider-owned hypothesis ${hypothesis.id} cannot claim proof evidence.`);
  }
  if (providerOwned && hypothesis.alternativeCoverage !== "non_exhaustive") {
    errors.push(`Provider-owned hypothesis ${hypothesis.id} cannot claim exhaustive alternatives.`);
  }
  if (providerOwned && hypothesis.requiredControlIds.length > 0) {
    errors.push(`Provider-owned hypothesis ${hypothesis.id} cannot select deterministic controls.`);
  }
  if (providerOwned && (hypothesis.contradictedByControlIds?.length ?? 0) > 0) {
    errors.push(`Provider-owned hypothesis ${hypothesis.id} cannot select contradiction controls.`);
  }
  if (providerOwned && hypothesis.inferenceTopic
      && (!hypothesis.inferenceTopic.immutable
        || hypothesis.inferenceTopic.hypothesisGroupId !== hypothesis.groupId)) {
    errors.push(`Provider-owned hypothesis ${hypothesis.id} has an invalid system inference-topic assignment.`);
  }
  if (providerOwned && hypothesis.inferenceTopic) {
    const topic = hypothesis.inferenceTopic;
    const factorIds = topic.qualification.evidenceFactors.map((factor) => factor.id);
    if (new Set(factorIds).size !== factorIds.length) {
      errors.push(`Provider-owned hypothesis ${hypothesis.id} has duplicate RateReveal evidence factors.`);
    }
    for (const controlId of topic.qualification.compatibilityControlIds) {
      if (!controlIds.has(controlId)) {
        errors.push(`Provider-owned hypothesis ${hypothesis.id} topic references unknown compatibility control ${controlId}.`);
      }
    }
    for (const factor of topic.qualification.evidenceFactors) {
      if (!factor.id.trim() || !factor.description.trim() || !factor.independenceGroupId.trim()
          || factor.alternativeIds.length === 0 || factor.controlIds.length === 0) {
        errors.push(`Provider-owned hypothesis ${hypothesis.id} has an incomplete RateReveal evidence factor.`);
      }
      for (const controlId of factor.controlIds) {
        if (!controlIds.has(controlId)) {
          errors.push(`Provider-owned hypothesis ${hypothesis.id} evidence factor ${factor.id} references unknown control ${controlId}.`);
        }
      }
    }
  }
  if (hypothesis.evidenceClass === "claim_proof" && hypothesis.requiredControlIds.length === 0) {
    errors.push(`Proof hypothesis ${hypothesis.id} has no deterministic proof controls.`);
  }
  for (const reference of hypothesis.observationRefs) {
    if (!observations.has(reference)) errors.push(`Hypothesis ${hypothesis.id} references unknown observation ${reference}.`);
  }
  for (const controlId of [...hypothesis.requiredControlIds, ...(hypothesis.contradictedByControlIds ?? [])]) {
    if (!controlIds.has(controlId)) errors.push(`Hypothesis ${hypothesis.id} references unknown control ${controlId}.`);
  }
  for (const event of hypothesis.events) {
    for (const reference of event.observationRefs) {
      if (!observations.has(reference)) errors.push(`Event ${event.id} references unknown observation ${reference}.`);
    }
  }
  for (const population of hypothesis.populations) {
    for (const reference of population.observationRefs) {
      if (!observations.has(reference)) errors.push(`Population ${population.id} references unknown observation ${reference}.`);
    }
  }
  for (const claim of hypothesis.claims) {
    errors.push(...validateClaim(claim, observations, controlIds, `Hypothesis ${hypothesis.id}`));
    if (providerOwned && claim.support !== "ai_hypothesis") {
      errors.push(`Provider-owned hypothesis ${hypothesis.id} claim ${claim.key} must remain ai_hypothesis support.`);
    }
    if (providerOwned && (claim.controlRefs?.length ?? 0) > 0) {
      errors.push(`Provider-owned hypothesis ${hypothesis.id} claim ${claim.key} cannot claim control proof.`);
    }
  }
  return errors;
}

export function resolveLimits(input: ReconstructionInput): KernelLimits {
  return { ...DEFAULT_KERNEL_LIMITS, ...input.limits };
}

export function validateReconstructionInput(input: ReconstructionInput, limits: KernelLimits): string[] {
  const errors: string[] = [];
  if (!input.statementId.trim()) errors.push("statementId must not be empty.");
  if (input.observations.length > limits.maxObservations) errors.push(`Observation limit exceeded: ${input.observations.length}/${limits.maxObservations}.`);
  if (input.controls.length > limits.maxControls) errors.push(`Control limit exceeded: ${input.controls.length}/${limits.maxControls}.`);
  if (input.hypotheses.length > limits.maxHypotheses) errors.push(`Hypothesis limit exceeded: ${input.hypotheses.length}/${limits.maxHypotheses}.`);

  for (const duplicate of duplicateIds(input.observations)) errors.push(`Duplicate observation id ${duplicate}.`);
  for (const duplicate of duplicateIds(input.controls)) errors.push(`Duplicate control id ${duplicate}.`);
  for (const duplicate of duplicateIds(input.hypotheses)) errors.push(`Duplicate hypothesis id ${duplicate}.`);
  for (const duplicate of duplicateIds(input.evidenceNeeds)) errors.push(`Duplicate evidence need id ${duplicate}.`);

  const observations = new Map(input.observations.map((observation) => [observation.id, observation]));
  const controlIds = new Set(input.controls.map((control) => control.id));
  for (const control of input.controls) {
    for (const reference of controlObservationRefs(control)) {
      if (!observations.has(reference)) errors.push(`Control ${control.id} references unknown observation ${reference}.`);
    }
    if (control.kind === "arithmetic" && control.expectedLiteral === undefined && !control.expectedObservationRef) {
      errors.push(`Arithmetic control ${control.id} has no expected value.`);
    }
  }
  for (const claim of input.baseClaims) errors.push(...validateClaim(claim, observations, controlIds, "Base"));
  for (const hypothesis of input.hypotheses) errors.push(...validateHypothesis(hypothesis, observations, controlIds));

  return [...new Set(errors)].sort();
}
