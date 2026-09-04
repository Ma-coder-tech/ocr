import { createHash } from "node:crypto";

import { reconstructStatement } from "./kernel.js";
import {
  collectRecordedProviderHypotheses,
  type ProviderAlternativeCoverageAssessment,
  type HypothesisProposalSourceBinding,
  type StatementHypothesisProposer,
} from "./provider.js";
import type {
  Hypothesis,
  InferenceTopic,
  InferenceConfidenceLevel,
  ReconstructionInput,
  ReconstructionResult,
  ScalarValue,
} from "./types.js";

export type RecordedExperimentStatus = "evaluated" | "source_rejected" | "provider_rejected";
export type RecordedProposalUtility =
  | "new_competing_interpretation"
  | "existing_interpretation_explained"
  | "weak_or_misleading"
  | "unreviewed";

export interface RecordedProposalReviewRule {
  proposalId: string;
  expectedClaims: Array<{ key: string; value: ScalarValue }>;
  confidenceCeiling: InferenceConfidenceLevel;
  requiredProofObligationIds: string[];
}

export interface RecordedProposalReview {
  proposalId: string;
  utility: RecordedProposalUtility;
  claimsMatchReviewRule: boolean;
  proofObligationsValidated: boolean;
  confidenceWithinReviewCeiling: boolean;
  addsClaimValueNotInDeterministicBaseline: boolean;
  reasons: string[];
}

export interface RecordedHypothesisExperimentInput {
  reconstructionInput: ReconstructionInput;
  sourceBinding: HypothesisProposalSourceBinding;
  sourceBytes: Uint8Array;
  proposer: StatementHypothesisProposer;
  inferenceTopics: InferenceTopic[];
  reviewRules?: RecordedProposalReviewRule[];
}

export interface RecordedHypothesisExperimentResult {
  status: RecordedExperimentStatus;
  errors: string[];
  baseline: ReconstructionResult;
  augmented: ReconstructionResult;
  acceptedProviderHypotheses: Hypothesis[];
  proposalReviews: RecordedProposalReview[];
  alternativeCoverage: ProviderAlternativeCoverageAssessment[];
  allMaterialAlternativesAddressed: boolean;
  canonicalTruthBefore: string;
  canonicalTruthAfter: string;
  canonicalTruthInvariant: boolean;
  unknownAlternativeRetainedForEveryProviderGroup: boolean;
  explanatoryWorldCountBefore: number;
  explanatoryWorldCountAfter: number;
  crossOriginContradictionWorldCount: number;
}

export async function runRecordedHypothesisExperiment(
  input: RecordedHypothesisExperimentInput,
): Promise<RecordedHypothesisExperimentResult> {
  const reconstructionInput = structuredClone(input.reconstructionInput);
  const baseline = reconstructStatement(reconstructionInput);
  const canonicalTruthBefore = serializeCanonicalTruth(baseline);
  const observedFingerprint = createHash("sha256").update(input.sourceBytes).digest("hex");

  if (observedFingerprint !== input.sourceBinding.sourceContentSha256) {
    return terminalResult(
      "source_rejected",
      [`Recorded proposal source SHA-256 ${observedFingerprint} does not match approved ${input.sourceBinding.sourceContentSha256}.`],
      baseline,
      canonicalTruthBefore,
    );
  }

  const collected = await collectRecordedProviderHypotheses(
    input.proposer,
    reconstructionInput.statementId,
    reconstructionInput.observations,
    input.sourceBinding,
    input.inferenceTopics,
    reconstructionInput.evidenceNeeds,
  );
  if (collected.errors.length > 0) {
    return terminalResult("provider_rejected", collected.errors, baseline, canonicalTruthBefore);
  }

  const augmentedInput = structuredClone(reconstructionInput);
  augmentedInput.hypotheses.push(...collected.hypotheses);
  const augmented = reconstructStatement(augmentedInput);
  const canonicalTruthAfter = serializeCanonicalTruth(augmented);
  const proposalReviews = reviewProposals(
    collected.hypotheses,
    reconstructionInput.hypotheses,
    input.reviewRules ?? [],
  );

  return {
    status: "evaluated",
    errors: augmented.errors,
    baseline,
    augmented,
    acceptedProviderHypotheses: collected.hypotheses,
    proposalReviews,
    alternativeCoverage: collected.alternativeCoverage,
    allMaterialAlternativesAddressed: true,
    canonicalTruthBefore,
    canonicalTruthAfter,
    canonicalTruthInvariant: canonicalTruthBefore === canonicalTruthAfter,
    unknownAlternativeRetainedForEveryProviderGroup: unknownAlternativeRetained(
      augmented,
      collected.hypotheses,
    ),
    explanatoryWorldCountBefore: baseline.possibleWorlds.length,
    explanatoryWorldCountAfter: augmented.possibleWorlds.length,
    crossOriginContradictionWorldCount: countCrossOriginContradictionWorlds(augmented),
  };
}

function terminalResult(
  status: Extract<RecordedExperimentStatus, "source_rejected" | "provider_rejected">,
  errors: string[],
  baseline: ReconstructionResult,
  canonicalTruthBefore: string,
): RecordedHypothesisExperimentResult {
  return {
    status,
    errors,
    baseline,
    augmented: baseline,
    acceptedProviderHypotheses: [],
    proposalReviews: [],
    alternativeCoverage: [],
    allMaterialAlternativesAddressed: false,
    canonicalTruthBefore,
    canonicalTruthAfter: canonicalTruthBefore,
    canonicalTruthInvariant: true,
    unknownAlternativeRetainedForEveryProviderGroup: true,
    explanatoryWorldCountBefore: baseline.possibleWorlds.length,
    explanatoryWorldCountAfter: baseline.possibleWorlds.length,
    crossOriginContradictionWorldCount: 0,
  };
}

function serializeCanonicalTruth(result: ReconstructionResult): string {
  return JSON.stringify(result.canonicalClaims);
}

function confidenceRank(confidence: InferenceConfidenceLevel): number {
  return confidence === "low" ? 1 : confidence === "medium" ? 2 : 3;
}

function claimIdentity(key: string, value: ScalarValue): string {
  return `${key}:${JSON.stringify(value)}`;
}

function reviewProposals(
  providerHypotheses: Hypothesis[],
  deterministicHypotheses: Hypothesis[],
  rules: RecordedProposalReviewRule[],
): RecordedProposalReview[] {
  const ruleByProposalId = new Map(rules.map((rule) => [rule.proposalId, rule]));
  const deterministicClaims = new Set(deterministicHypotheses.flatMap((hypothesis) =>
    hypothesis.ownership.kind === "deterministic_system"
      ? hypothesis.claims.map((claim) => claimIdentity(claim.key, claim.value))
      : []));

  return providerHypotheses.map<RecordedProposalReview>((hypothesis) => {
    const proposalId = hypothesis.ownership.kind === "provider"
      ? hypothesis.ownership.proposalId
      : hypothesis.id;
    const rule = ruleByProposalId.get(proposalId);
    if (!rule) {
      return {
        proposalId,
        utility: "unreviewed",
        claimsMatchReviewRule: false,
        proofObligationsValidated: false,
        confidenceWithinReviewCeiling: false,
        addsClaimValueNotInDeterministicBaseline: false,
        reasons: ["No recorded evaluation rule exists for this proposal."],
      };
    }

    const actualClaims = new Set(hypothesis.claims.map((claim) => claimIdentity(claim.key, claim.value)));
    const expectedClaims = rule.expectedClaims.map((claim) => claimIdentity(claim.key, claim.value));
    const claimsMatchReviewRule = expectedClaims.length > 0
      && actualClaims.size === expectedClaims.length
      && expectedClaims.every((identity) => actualClaims.has(identity));
    const validatedObligationIds = new Set(hypothesis.inference?.proofObligationValidation?.validatedObligationIds ?? []);
    const proofObligationsValidated = rule.requiredProofObligationIds.length > 0
      && rule.requiredProofObligationIds.every((obligationId) => validatedObligationIds.has(obligationId));
    const confidenceWithinReviewCeiling = hypothesis.inference !== undefined
      && confidenceRank(hypothesis.inference.confidence) <= confidenceRank(rule.confidenceCeiling);
    const addsClaimValueNotInDeterministicBaseline = expectedClaims.some((identity) =>
      !deterministicClaims.has(identity));
    const reasons: string[] = [];
    if (!claimsMatchReviewRule) reasons.push("Proposal claims do not match the recorded case review rule.");
    if (!proofObligationsValidated) reasons.push("Proposal does not validly bind every RateReveal proof obligation required by the recorded case review rule.");
    if (!confidenceWithinReviewCeiling) reasons.push("Provider-reported confidence exceeds the recorded case review ceiling.");
    const utility: RecordedProposalUtility = reasons.length > 0
      ? "weak_or_misleading"
      : addsClaimValueNotInDeterministicBaseline
        ? "new_competing_interpretation"
        : "existing_interpretation_explained";

    return {
      proposalId,
      utility,
      claimsMatchReviewRule,
      proofObligationsValidated,
      confidenceWithinReviewCeiling,
      addsClaimValueNotInDeterministicBaseline,
      reasons,
    };
  }).sort((left, right) => left.proposalId.localeCompare(right.proposalId));
}

function unknownAlternativeRetained(
  result: ReconstructionResult,
  providerHypotheses: Hypothesis[],
): boolean {
  const providerGroups = new Map<string, string[]>();
  for (const hypothesis of providerHypotheses) {
    const group = providerGroups.get(hypothesis.groupId) ?? [];
    group.push(hypothesis.id);
    providerGroups.set(hypothesis.groupId, group);
  }
  return [...providerGroups.values()].every((hypothesisIds) =>
    result.possibleWorlds.some((world) =>
      hypothesisIds.every((hypothesisId) => !world.hypothesisIds.includes(hypothesisId))));
}

function countCrossOriginContradictionWorlds(result: ReconstructionResult): number {
  return result.possibleWorlds.filter((world) => {
    const claimsByKey = new Map<string, typeof world.claims>();
    for (const claim of world.claims) {
      const claims = claimsByKey.get(claim.key) ?? [];
      claims.push(claim);
      claimsByKey.set(claim.key, claims);
    }
    return [...claimsByKey.values()].some((claims) => {
      const values = new Set(claims.map((claim) => JSON.stringify(claim.value)));
      const hasProviderClaim = claims.some((claim) => claim.owner.kind === "hypothesis_claim"
        && claim.owner.hypothesisOwnership.kind === "provider");
      const hasNonProviderClaim = claims.some((claim) => claim.owner.kind === "base_claim"
        || claim.owner.hypothesisOwnership.kind === "deterministic_system");
      return values.size > 1 && hasProviderClaim && hasNonProviderClaim;
    });
  }).length;
}
