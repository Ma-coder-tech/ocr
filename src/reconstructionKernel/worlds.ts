import type {
  CanonicalClaim,
  Claim,
  ControlResult,
  Hypothesis,
  HypothesisResult,
  PossibleWorld,
  PossibleWorldClaim,
  Observation,
  QualifiedInferenceStrength,
  InferenceVerificationResult,
} from "./types.js";
import { evaluateInferenceEvidencePosture } from "./inferenceEvidencePosture.js";

function stableValue(value: Claim["value"]): string {
  return JSON.stringify(value);
}

function claimIdentity(claim: Claim): string {
  return `${claim.key}:${stableValue(claim.value)}`;
}

function canonicalEligible(
  claim: PossibleWorldClaim,
  controls: Map<string, ControlResult>,
  observations: Map<string, Observation>,
): boolean {
  if (claim.owner.kind === "hypothesis_claim"
    && claim.owner.hypothesisOwnership.kind === "provider") return false;
  if (claim.support === "source_observation") return true;
  return claim.support === "deterministic_derivation" &&
    (claim.controlRefs?.length ?? 0) > 0 &&
    claim.controlRefs!.every((controlId) => controls.get(controlId)?.state === "pass") &&
    claim.observationRefs.every((observationRef) => truthEligibleObservation(observationRef, observations, new Set()));
}

function truthEligibleObservation(
  observationRef: string,
  observations: Map<string, Observation>,
  visiting: Set<string>,
): boolean {
  const observation = observations.get(observationRef);
  if (!observation || observation.authority === "parser_candidate") return false;
  if (observation.authority === "source_printed") return true;
  if (visiting.has(observationRef)) return false;
  const related = observation.relatedObservationRefs ?? [];
  if (related.length === 0) return true;
  const next = new Set(visiting).add(observationRef);
  return related.every((reference) => truthEligibleObservation(reference, observations, next));
}

export function adjudicateHypotheses(
  hypotheses: Hypothesis[],
  controlResults: ControlResult[],
  verificationResults: Map<string, InferenceVerificationResult[]> = new Map(),
): HypothesisResult[] {
  const controls = new Map(controlResults.map((result) => [result.controlId, result]));
  return [...hypotheses]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((hypothesis) => {
      const required = hypothesis.requiredControlIds.map((id) => controls.get(id)!);
      const contradictions = (hypothesis.contradictedByControlIds ?? []).map((id) => controls.get(id)!);
      const contradiction = contradictions.find((result) => result.state === "pass");
      if (contradiction) {
        return {
          hypothesisId: hypothesis.id,
          groupId: hypothesis.groupId,
          state: "rejected" as const,
          interpretationState: "rejected" as const,
          ownership: hypothesis.ownership,
          evidenceClass: hypothesis.evidenceClass,
          alternativeCoverage: hypothesis.alternativeCoverage,
          ...(hypothesis.inference ? { inference: hypothesis.inference } : {}),
          reason: `Contradicted by deterministic control ${contradiction.controlId}.`,
        };
      }
      const failed = required.find((result) => result.state === "fail");
      if (failed) {
        return {
          hypothesisId: hypothesis.id,
          groupId: hypothesis.groupId,
          state: "rejected" as const,
          interpretationState: "rejected" as const,
          ownership: hypothesis.ownership,
          evidenceClass: hypothesis.evidenceClass,
          alternativeCoverage: hypothesis.alternativeCoverage,
          ...(hypothesis.inference ? { inference: hypothesis.inference } : {}),
          reason: `Required deterministic control ${failed.controlId} failed.`,
        };
      }
      const allRequiredPassed = required.length > 0 && required.every((result) => result.state === "pass");
      const deterministicProof = hypothesis.ownership.kind === "deterministic_system"
        && hypothesis.evidenceClass === "claim_proof"
        && hypothesis.alternativeCoverage === "exhaustive_for_claim";
      if (allRequiredPassed && deterministicProof) {
        return {
          hypothesisId: hypothesis.id,
          groupId: hypothesis.groupId,
          state: "supported" as const,
          interpretationState: "confirmed_fact" as const,
          ownership: hypothesis.ownership,
          evidenceClass: hypothesis.evidenceClass,
          alternativeCoverage: hypothesis.alternativeCoverage,
          ...(hypothesis.inference ? { inference: hypothesis.inference } : {}),
          reason: "Claim-sufficient deterministic proof passed and alternatives are exhausted for this claim.",
        };
      }
      const qualification: {
        strength: QualifiedInferenceStrength;
        reasonCodes: string[];
        evidencePosture?: HypothesisResult["evidencePosture"];
      } = hypothesis.ownership.kind === "provider"
        ? qualifyProviderInference(hypothesis, hypotheses, controls, verificationResults.get(hypothesis.id) ?? [])
        : qualifyDeterministicInference(hypothesis, allRequiredPassed);
      if (hypothesis.ownership.kind === "provider" && qualification.evidencePosture?.outcome === "contradicted") {
        return {
          hypothesisId: hypothesis.id,
          groupId: hypothesis.groupId,
          state: "rejected" as const,
          interpretationState: "rejected" as const,
          ownership: hypothesis.ownership,
          evidenceClass: hypothesis.evidenceClass,
          alternativeCoverage: hypothesis.alternativeCoverage,
          ...(hypothesis.inference ? { inference: hypothesis.inference } : {}),
          ...(hypothesis.inferenceTopic ? { inferenceTopicId: hypothesis.inferenceTopic.topicId } : {}),
          ...(hypothesis.inference ? { providerReportedConfidence: hypothesis.inference.confidence } : {}),
          qualifiedInferenceStrength: qualification.strength,
          qualificationReasonCodes: qualification.reasonCodes,
          evidencePosture: qualification.evidencePosture,
          verificationResults: verificationResults.get(hypothesis.id) ?? [],
          reason: "The selected interpretation is contradicted by RateReveal-owned deterministic evidence.",
        };
      }
      return {
        hypothesisId: hypothesis.id,
        groupId: hypothesis.groupId,
        state: "viable_unresolved" as const,
        interpretationState: interpretationStateForStrength(qualification.strength),
        ownership: hypothesis.ownership,
        evidenceClass: hypothesis.evidenceClass,
        alternativeCoverage: hypothesis.alternativeCoverage,
        ...(hypothesis.inference ? { inference: hypothesis.inference } : {}),
        ...(hypothesis.inferenceTopic ? { inferenceTopicId: hypothesis.inferenceTopic.topicId } : {}),
        ...(hypothesis.ownership.kind === "provider" && hypothesis.inference
          ? { providerReportedConfidence: hypothesis.inference.confidence } : {}),
        qualifiedInferenceStrength: qualification.strength,
        qualificationReasonCodes: qualification.reasonCodes,
        ...(qualification.evidencePosture ? { evidencePosture: qualification.evidencePosture } : {}),
        ...(hypothesis.ownership.kind === "provider"
          ? { verificationResults: verificationResults.get(hypothesis.id) ?? [] } : {}),
        reason: hypothesis.ownership.kind === "provider"
          ? "Provider reasoning remains a non-authoritative inference; deterministic proof and alternative exhaustion are not provider-controlled."
          : required.length === 0
            ? "No deterministic proof was supplied."
            : allRequiredPassed
              ? "Compatible evidence passed, but it is not claim-sufficient exhaustive proof."
              : "At least one required deterministic control is unresolved.",
      };
    });
}

function qualifyProviderInference(
  hypothesis: Hypothesis,
  hypotheses: Hypothesis[],
  controls: Map<string, ControlResult>,
  verificationResults: InferenceVerificationResult[],
): { strength: QualifiedInferenceStrength; reasonCodes: string[]; evidencePosture: HypothesisResult["evidencePosture"] } {
  const competingAlternativeCount = hypotheses.filter((candidate) =>
    candidate.id !== hypothesis.id && candidate.groupId === hypothesis.groupId).length;
  const evidencePosture = evaluateInferenceEvidencePosture(
    hypothesis,
    controls,
    competingAlternativeCount,
    verificationResults.flatMap((result) => result.evidenceFactor ? [result.evidenceFactor] : []),
  );
  return {
    strength: evidencePosture.qualifiedStrength,
    reasonCodes: evidencePosture.reasonCodes,
    evidencePosture,
  };
}

function qualifyDeterministicInference(
  hypothesis: Hypothesis,
  allRequiredPassed: boolean,
): { strength: QualifiedInferenceStrength; reasonCodes: string[] } {
  if (!hypothesis.inference) {
    return { strength: "unknown_competing", reasonCodes: ["no_inference_strength_asserted"] };
  }
  if (hypothesis.inference.confidence === "high" && allRequiredPassed) {
    return { strength: "strong", reasonCodes: ["deterministic_compatibility_controls_passed"] };
  }
  return {
    strength: confidenceAsStrength(hypothesis.inference.confidence),
    reasonCodes: [allRequiredPassed ? "deterministic_compatibility_controls_passed" : "deterministic_proof_unresolved"],
  };
}

function confidenceAsStrength(confidence: "low" | "medium" | "high"): Exclude<QualifiedInferenceStrength, "unknown_competing"> {
  return confidence === "high" ? "strong" : confidence === "medium" ? "moderate" : "weak";
}

function interpretationStateForStrength(strength: QualifiedInferenceStrength): HypothesisResult["interpretationState"] {
  if (strength === "strong") return "strong_inference";
  if (strength === "moderate") return "moderate_inference";
  if (strength === "weak") return "weak_inference";
  return "unknown_or_competing_interpretations";
}

interface WorldEnumeration {
  overflow: boolean;
  worlds: PossibleWorld[];
  unresolvedGroupIds: string[];
}

function cartesian<T>(groups: T[][], limit: number): { overflow: boolean; rows: T[][] } {
  let rows: T[][] = [[]];
  for (const group of groups) {
    if (rows.length * group.length > limit) return { overflow: true, rows: [] };
    rows = rows.flatMap((row) => group.map((item) => [...row, item]));
  }
  return { overflow: false, rows };
}

export function enumeratePossibleWorlds(
  hypotheses: Hypothesis[],
  results: HypothesisResult[],
  baseClaims: Claim[],
  maxPossibleWorlds: number,
): WorldEnumeration {
  const byHypothesis = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const grouped = new Map<string, HypothesisResult[]>();
  for (const result of results) {
    const group = grouped.get(result.groupId) ?? [];
    group.push(result);
    grouped.set(result.groupId, group);
  }

  const unresolvedGroupIds: string[] = [];
  const choices = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupId, group]) => {
      const supported = group.filter((result) => result.state === "supported");
      if (supported.length > 0) return supported;
      const unresolved = group.filter((result) => result.state === "viable_unresolved");
      if (unresolved.length > 0) {
        unresolvedGroupIds.push(groupId);
        // Preserve an explicit unknown/unmodelled world. A lone plausible hypothesis
        // is not exhaustive and therefore cannot become truth by default.
        return [undefined, ...unresolved];
      }
      return [undefined];
    });

  const product = cartesian(choices, maxPossibleWorlds);
  if (product.overflow) return { overflow: true, worlds: [], unresolvedGroupIds };
  const rows = choices.length === 0 ? [[]] : product.rows;
  const worlds = rows.map((row, index) => {
    const selected = row.filter((item): item is HypothesisResult => item !== undefined);
    const hypothesisIds = selected.map((item) => item.hypothesisId).sort();
    const claims: PossibleWorldClaim[] = [
      ...baseClaims.map((claim): PossibleWorldClaim => ({ ...claim, owner: { kind: "base_claim" } })),
      ...selected.flatMap((item) => {
        const hypothesis = byHypothesis.get(item.hypothesisId);
        return (hypothesis?.claims ?? []).map((claim): PossibleWorldClaim => ({
          ...claim,
          owner: {
            kind: "hypothesis_claim",
            hypothesisId: hypothesis!.id,
            hypothesisOwnership: hypothesis!.ownership,
          },
        }));
      }),
    ].sort((left, right) => claimIdentity(left).localeCompare(claimIdentity(right)));
    return { id: `world-${String(index + 1).padStart(3, "0")}`, hypothesisIds, claims };
  });
  return { overflow: false, worlds, unresolvedGroupIds };
}

export function intersectCanonicalClaims(
  worlds: PossibleWorld[],
  baseClaimsOnOverflow: Claim[] = [],
  controlResults: ControlResult[] = [],
  inputObservations: Observation[] = [],
): CanonicalClaim[] {
  const controls = new Map(controlResults.map((result) => [result.controlId, result]));
  const observations = new Map(inputObservations.map((observation) => [observation.id, observation]));
  const sourceWorlds: PossibleWorld[] = worlds.length > 0 ? worlds : [{
    id: "overflow-invariants",
    hypothesisIds: [],
    claims: baseClaimsOnOverflow.map((claim) => ({ ...claim, owner: { kind: "base_claim" } })),
  }];
  const first = sourceWorlds[0]!;
  const candidates = new Map<string, PossibleWorldClaim>();
  for (const claim of first.claims) {
    if (canonicalEligible(claim, controls, observations)) candidates.set(claimIdentity(claim), claim);
  }

  const canonical: CanonicalClaim[] = [];
  for (const [identity, claim] of candidates) {
    const matchingByWorld = sourceWorlds.map((world) =>
      world.claims.filter((candidate) => canonicalEligible(candidate, controls, observations) && claimIdentity(candidate) === identity),
    );
    const presentEverywhere = matchingByWorld.every((matches) => matches.length > 0);
    const conflictingValueExists = sourceWorlds.some((world) =>
      world.claims.some((candidate) =>
        canonicalEligible(candidate, controls, observations) && candidate.key === claim.key && stableValue(candidate.value) !== stableValue(claim.value),
      ),
    );
    if (!presentEverywhere || conflictingValueExists) continue;
    const allMatches = matchingByWorld.flat();
    const { owner: _owner, ...canonicalClaim } = claim;
    canonical.push({
      ...canonicalClaim,
      observationRefs: [...new Set(allMatches.flatMap((match) => match.observationRefs))].sort(),
      controlRefs: [...new Set(allMatches.flatMap((match) => match.controlRefs ?? []))].sort(),
      invariantAcrossWorldCount: sourceWorlds.length,
    });
  }
  return canonical.sort((left, right) => left.key.localeCompare(right.key));
}
