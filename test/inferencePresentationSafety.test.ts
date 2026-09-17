import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS } from "../src/canonical/v2/kernelAuthorityContract.js";
import {
  UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
  buildInferencePresentations,
  runRecordedHypothesisExperiment,
  type EvidenceNeed,
  type EvidenceRoute,
  type Hypothesis,
  type HypothesisProposalResponse,
  type HypothesisResult,
  type InferenceEvidencePosture,
  type InferenceTopic,
  type QualifiedInferenceStrength,
  type RateRevealAlternativeEvidencePosture,
  type ReconstructionInput,
  type StatementHypothesisProposer,
} from "../src/reconstructionKernel/index.js";

const statementId = "presentation-safety-fixture";
const evidenceNeed: EvidenceNeed = {
  id: "safety.stable-link",
  hypothesisGroupId: "safety.relationship",
  description: "Obtain a stable source identifier or explicit source relationship.",
  material: true,
  availableScopes: ["statement_local", "private_authorized"],
};
const evidenceRoute: EvidenceRoute = {
  evidenceNeedId: evidenceNeed.id,
  scope: "statement_local",
  publicRgBlocked: true,
  reason: "Statement-local evidence must be exhausted first.",
};
const topic: InferenceTopic = {
  id: "safety.relationship",
  hypothesisGroupId: "safety.relationship",
  question: "Are the two source observations part of one relationship or separate?",
  observationRefs: ["safety.amount", "safety.missing-id"],
  allowedClaims: [{ key: "safety.same_relationship", allowedValues: [true, false] }],
  materialAlternatives: [
    {
      id: "safety.same",
      description: "The observations belong to the same relationship.",
      claim: { key: "safety.same_relationship", value: true },
      requiredProofObligationIds: ["safety-proof"],
      requiredVerificationRecipeIds: [],
    },
    {
      id: "safety.separate",
      description: "The observations belong to separate relationships.",
      claim: { key: "safety.same_relationship", value: false },
      requiredProofObligationIds: ["safety-proof"],
      requiredVerificationRecipeIds: [],
    },
  ],
  proofObligations: [{
    id: "safety-proof",
    description: "Stable source identity must link or distinguish the observations.",
    evidenceNeedIds: [evidenceNeed.id],
    gapKind: "identity_linkage",
    observationRequirements: [
      {
        role: "subject",
        description: "The observed amount.",
        observationRefs: ["safety.amount"],
        allowedKinds: ["amount"],
        valueState: "present",
      },
      {
        role: "missing_subject_attribute",
        description: "The missing stable identifier.",
        observationRefs: ["safety.missing-id"],
        allowedKinds: ["identifier"],
        valueState: "missing",
      },
    ],
    missingProperty: "stable_identity_link",
    resolutionEvidenceKinds: ["stable_source_identifier", "explicit_source_relation"],
  }],
  verificationRecipes: [],
  qualification: {
    maximumStrength: "strong",
    compatibilityControlIds: [],
    evidenceFactors: [],
    materialEvidenceNeedIds: [evidenceNeed.id],
    sourceCompleteness: "unproven",
    completenessRequirement: "observed_rows_sufficient",
  },
};

function providerHypothesis(
  proposalId: string,
  alternativeId: "safety.same" | "safety.separate",
  confidence: "low" | "medium" | "high" = "high",
): Hypothesis {
  const alternative = topic.materialAlternatives.find((item) => item.id === alternativeId)!;
  return {
    id: `provider.safety.${proposalId}`,
    groupId: topic.hypothesisGroupId,
    origin: "recorded_provider",
    ownership: { kind: "provider", providerId: "adversarial-fixture", proposalId, immutable: true },
    evidenceClass: "compatibility_only",
    alternativeCoverage: "non_exhaustive",
    inference: {
      confidence,
      rationale: "Provider explanation retained for audit only.",
      missingProof: ["Stable source identity is missing."],
      acknowledgedEvidenceNeedIds: [evidenceNeed.id],
    },
    inferenceTopic: {
      topicId: topic.id,
      hypothesisGroupId: topic.hypothesisGroupId,
      alternativeId,
      requiredProofObligationIds: [...alternative.requiredProofObligationIds],
      proofObligations: structuredClone(topic.proofObligations),
      verificationRecipes: [],
      immutable: true,
      qualification: structuredClone(topic.qualification),
    },
    description: "Provider prose must not control the merchant conclusion.",
    observationRefs: ["safety.amount"],
    events: [],
    populations: [],
    claims: [{
      key: alternative.claim.key,
      value: alternative.claim.value,
      support: "ai_hypothesis",
      observationRefs: ["safety.amount"],
    }],
    requiredControlIds: [],
    contradictedByControlIds: [],
  };
}

function hypothesisResult(
  hypothesis: Hypothesis,
  strength: QualifiedInferenceStrength,
  evidencePosture?: InferenceEvidencePosture,
): HypothesisResult {
  return {
    hypothesisId: hypothesis.id,
    groupId: hypothesis.groupId,
    state: "viable_unresolved",
    interpretationState: strength === "strong"
      ? "strong_inference"
      : strength === "moderate"
        ? "moderate_inference"
        : strength === "weak"
          ? "weak_inference"
          : "unknown_or_competing_interpretations",
    ownership: hypothesis.ownership,
    evidenceClass: hypothesis.evidenceClass,
    alternativeCoverage: hypothesis.alternativeCoverage,
    inference: hypothesis.inference,
    inferenceTopicId: topic.id,
    providerReportedConfidence: hypothesis.inference?.confidence,
    qualifiedInferenceStrength: strength,
    evidencePosture,
    reason: "Synthetic RateReveal-qualified posture for presentation safety testing.",
  };
}

function contradictedPosture(alternativeId: string): InferenceEvidencePosture {
  return {
    modelVersion: "ratereveal-inference-evidence-posture-v1",
    alternativeId,
    outcome: "contradicted",
    factorEvaluations: [],
    satisfiedSupportFactorIds: [],
    satisfiedContradictionFactorIds: ["deterministic-contradiction"],
    unresolvedFactorIds: [],
    independentSupportGroups: [],
    baseStrength: "unknown_competing",
    qualifiedStrength: "unknown_competing",
    sourceCompleteness: "unproven",
    unresolvedProofObligationIds: ["safety-proof"],
    allMaterialEvidenceNeedsAcknowledged: true,
    allRequiredProofObligationsValidated: true,
    providerConfidenceUsed: false,
    reasonCodes: ["deterministic_evidence_contradicts_interpretation"],
  };
}

function alternativePosture(
  alternativeId: "safety.same" | "safety.separate",
  strength: QualifiedInferenceStrength,
  outcome: "qualified" | "contradicted" = "qualified",
): RateRevealAlternativeEvidencePosture {
  return {
    modelVersion: "ratereveal-alternative-evidence-posture-v1",
    topicId: topic.id,
    alternativeId,
    outcome,
    factorEvaluations: [],
    satisfiedSupportFactorIds: [],
    satisfiedContradictionFactorIds: outcome === "contradicted" ? ["deterministic-contradiction"] : [],
    unresolvedFactorIds: [],
    independentSupportGroups: [],
    baseStrength: strength,
    qualifiedStrength: outcome === "contradicted" ? "unknown_competing" : strength,
    sourceCompleteness: "unproven",
    unresolvedProofObligationIds: ["safety-proof"],
    providerProposalRequired: false,
    providerConfidenceUsed: false,
    reasonCodes: ["synthetic_rate_reveal_evidence_posture"],
  };
}

function present(
  hypotheses: Hypothesis[],
  results: HypothesisResult[],
  postures: RateRevealAlternativeEvidencePosture[] = [
    alternativePosture("safety.same", "unknown_competing"),
    alternativePosture("safety.separate", "unknown_competing"),
  ],
) {
  return buildInferencePresentations({
    topics: [topic],
    providerHypotheses: hypotheses,
    hypothesisResults: results,
    alternativeEvidencePostures: postures,
    evidenceNeeds: [evidenceNeed],
    evidenceRoutes: [evidenceRoute],
  })[0]!;
}

function expectUnresolved(presentation: ReturnType<typeof present>): void {
  expect(presentation.merchantConclusion).toEqual({
    state: "unresolved",
    text: UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
    alternativeId: null,
    qualifiedInferenceStrength: "unknown_competing",
  });
}

describe("inference presentation adversarial safety matrix", () => {
  it("keeps tied moderate alternatives unresolved while retaining both internally", () => {
    const same = providerHypothesis("same-moderate", "safety.same");
    const separate = providerHypothesis("separate-moderate", "safety.separate");
    const presentation = present(
      [same, separate],
      [hypothesisResult(same, "moderate"), hypothesisResult(separate, "moderate")],
      [alternativePosture("safety.same", "moderate"), alternativePosture("safety.separate", "moderate")],
    );

    expectUnresolved(presentation);
    expect(presentation.reasonCodes).toContain("no_meaningful_evidence_advantage_over_alternatives");
    expect(presentation.internalHypotheses).toHaveLength(2);
  });

  it("keeps a high-confidence weak-only hypothesis unresolved and available internally", () => {
    const weak = providerHypothesis("weak-high-confidence", "safety.same", "high");
    const presentation = present(
      [weak],
      [hypothesisResult(weak, "weak")],
      [alternativePosture("safety.same", "weak"), alternativePosture("safety.separate", "unknown_competing")],
    );

    expectUnresolved(presentation);
    expect(presentation.reasonCodes).toEqual(["evidence_too_weak_to_favor_an_alternative"]);
    expect(presentation.internalHypotheses).toEqual([expect.objectContaining({
      proposalId: "weak-high-confidence",
      qualifiedInferenceStrength: "weak",
      eligibleForLeadingConclusion: false,
    })]);
  });

  it("never presents a deterministically contradicted interpretation as the leader", () => {
    const contradicted = providerHypothesis("contradicted", "safety.same");
    const weak = providerHypothesis("remaining-weak", "safety.separate");
    const presentation = present(
      [contradicted, weak],
      [
        hypothesisResult(contradicted, "strong", contradictedPosture("safety.same")),
        hypothesisResult(weak, "weak"),
      ],
      [alternativePosture("safety.same", "unknown_competing", "contradicted"), alternativePosture("safety.separate", "weak")],
    );

    expectUnresolved(presentation);
    expect(presentation.internalHypotheses).toContainEqual(expect.objectContaining({
      proposalId: "contradicted",
      eligibleForLeadingConclusion: false,
    }));
  });

  it("allows one moderate alternative to lead only when it strictly outranks the competitor", () => {
    const moderate = providerHypothesis("moderate", "safety.same", "low");
    const weak = providerHypothesis("weak", "safety.separate", "high");
    const presentation = present(
      [moderate, weak],
      [hypothesisResult(moderate, "moderate"), hypothesisResult(weak, "weak")],
      [alternativePosture("safety.same", "moderate"), alternativePosture("safety.separate", "weak")],
    );

    expect(presentation.merchantConclusion).toEqual({
      state: "leading_interpretation",
      text: "The observations belong to the same relationship.",
      alternativeId: "safety.same",
      qualifiedInferenceStrength: "moderate",
    });
  });

  it.each([
    ["malformed hypotheses", "malformed"],
    ["incomplete alternative coverage", "incomplete"],
    ["provider failure", "failure"],
    ["no proposed alternative", "none"],
  ] as const)("fails closed for %s", async (_label, behavior) => {
    const providerId = `adversarial-${behavior}`;
    const proposer: StatementHypothesisProposer = {
      providerId,
      async propose(request): Promise<HypothesisProposalResponse> {
        if (behavior === "failure") throw new Error("Synthetic provider outage.");
        if (behavior === "malformed") {
          return {
            providerId,
            hypotheses: "not-an-array",
            alternativeCoverage: [],
          } as unknown as HypothesisProposalResponse;
        }
        const assessments = request.inferenceTopics.flatMap((offeredTopic) =>
          offeredTopic.materialAlternatives.map((alternative) => ({
            topicRef: offeredTopic.topicRef,
            alternativeRef: alternative.alternativeRef,
            disposition: "not_supported" as const,
            reasonCode: "insufficient_source_evidence" as const,
            rationale: "The bounded evidence does not support selecting this alternative.",
            observationRefs: offeredTopic.observationRefs,
            acknowledgedEvidenceNeedRefs: offeredTopic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
          })));
        return {
          providerId,
          hypotheses: [],
          alternativeCoverage: behavior === "incomplete" ? assessments.slice(0, 1) : assessments,
        };
      },
    };
    const sourceBytes = new TextEncoder().encode("approved offline presentation safety fixture");
    const reconstructionInput: ReconstructionInput = {
      statementId,
      observations: [
        {
          id: "safety.amount",
          kind: "amount",
          value: 1_000,
          authority: "source_printed",
          locator: { documentId: statementId, section: "summary" },
        },
        {
          id: "safety.missing-id",
          kind: "identifier",
          value: null,
          authority: "source_printed",
          locator: { documentId: statementId, section: "detail" },
        },
      ],
      baseClaims: [{
        key: "submitted.net_amount_minor",
        value: 1_000,
        support: "source_observation",
        observationRefs: ["safety.amount"],
      }],
      controls: [],
      hypotheses: [],
      evidenceNeeds: [evidenceNeed],
    };
    const result = await runRecordedHypothesisExperiment({
      reconstructionInput,
      sourceBinding: {
        sourceDocumentRef: "approved-offline-fixture:presentation-safety",
        sourceContentSha256: createHash("sha256").update(sourceBytes).digest("hex"),
      },
      sourceBytes,
      proposer,
      inferenceTopics: [topic],
    });

    expect(result.status).toBe(behavior === "none" ? "evaluated" : "provider_rejected");
    expect(result.acceptedProviderHypotheses).toEqual([]);
    expectUnresolved(result.inferencePresentations[0]!);
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.canonicalTruthAfter).toBe(result.canonicalTruthBefore);
  });

  it("keeps resolution evidence and the five-fact authority allowlist intact", () => {
    expect(present([], []).resolutionEvidenceNeeds).toEqual([expect.objectContaining({
      evidenceNeedId: "safety.stable-link",
      proofObligations: [expect.objectContaining({
        missingProperty: "stable_identity_link",
        resolutionEvidenceKinds: ["stable_source_identifier", "explicit_source_relation"],
      })],
    })]);
    expect(RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS).toEqual([
      "grossSaleVolume",
      "refundVolume",
      "grossSaleTransactionCount",
      "refundTransactionCount",
      "submittedTransactionCount",
    ]);
  });
});
