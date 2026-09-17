import { evaluateControls } from "./controls.js";
import { routeEvidenceNeeds } from "./evidenceRouting.js";
import { generateDeterministicFeatures } from "./features.js";
import { executeInferenceVerificationRequests } from "./inferenceVerification.js";
import type { ReconstructionInput, ReconstructionResult } from "./types.js";
import { resolveLimits, validateReconstructionInput } from "./validation.js";
import { adjudicateHypotheses, enumeratePossibleWorlds, intersectCanonicalClaims } from "./worlds.js";

export function reconstructStatement(input: ReconstructionInput): ReconstructionResult {
  const limits = resolveLimits(input);
  const errors = validateReconstructionInput(input, limits);
  if (errors.length > 0) {
    return {
      statementId: input.statementId,
      status: "invalid_input",
      errors,
      features: [],
      controlResults: [],
      hypothesisResults: [],
      possibleWorlds: [],
      canonicalClaims: [],
      unresolvedHypothesisGroupIds: [],
      evidenceRoutes: [],
      limits,
    };
  }

  const features = generateDeterministicFeatures(input.observations);
  const controlResults = evaluateControls(input.controls, input.observations);
  const verificationResults = executeInferenceVerificationRequests(input.hypotheses, input.observations);
  const hypothesisResults = adjudicateHypotheses(input.hypotheses, controlResults, verificationResults);
  const enumeration = enumeratePossibleWorlds(input.hypotheses, hypothesisResults, input.baseClaims, limits.maxPossibleWorlds);
  // Provider proposals participate in the explanatory possible-world surface, but
  // never in the authority calculation. This makes canonical truth invariant to
  // provider choice, confidence, proposal count, grouping, or world overflow.
  const authorityHypotheses = input.hypotheses.filter((hypothesis) =>
    hypothesis.ownership.kind === "deterministic_system");
  const authorityHypothesisIds = new Set(authorityHypotheses.map((hypothesis) => hypothesis.id));
  const authorityResults = hypothesisResults.filter((result) => authorityHypothesisIds.has(result.hypothesisId));
  const authorityEnumeration = enumeratePossibleWorlds(
    authorityHypotheses,
    authorityResults,
    input.baseClaims,
    limits.maxPossibleWorlds,
  );
  const canonicalClaims = intersectCanonicalClaims(
    authorityEnumeration.worlds,
    input.baseClaims,
    controlResults,
    input.observations,
  );
  const evidenceRoutes = routeEvidenceNeeds(input.evidenceNeeds);
  const overflowError = [
    ...(enumeration.overflow
      ? [`Possible-world bound exceeded (${limits.maxPossibleWorlds}); proposal-world exploration was withheld.`]
      : []),
    ...(authorityEnumeration.overflow
      ? [`Authoritative deterministic possible-world bound exceeded (${limits.maxPossibleWorlds}); hypothesis-dependent claims were withheld.`]
      : []),
  ];

  return {
    statementId: input.statementId,
    status: enumeration.overflow || authorityEnumeration.overflow ? "bounded_overflow" : "complete",
    errors: overflowError,
    features,
    controlResults,
    hypothesisResults,
    possibleWorlds: enumeration.worlds,
    canonicalClaims,
    unresolvedHypothesisGroupIds: [...enumeration.unresolvedGroupIds].sort(),
    evidenceRoutes,
    limits,
  };
}
