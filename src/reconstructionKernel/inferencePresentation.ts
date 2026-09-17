import type {
  EvidenceNeed,
  EvidenceRoute,
  Hypothesis,
  HypothesisResult,
  InferenceTopic,
  ProofObligationMissingProperty,
  ProofObligationResolutionEvidenceKind,
  QualifiedInferenceStrength,
  RateRevealAlternativeEvidencePosture,
} from "./types.js";

export const UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION =
  "We cannot tell which explanation is more likely yet." as const;

export const INFERENCE_PRESENTATION_MODEL_VERSION =
  "ratereveal-inference-presentation-v1" as const;

export interface InferencePresentationResolutionNeed {
  evidenceNeedId: string;
  description: string;
  material: boolean;
  route: EvidenceRoute | null;
  proofObligations: Array<{
    proofObligationId: string;
    description: string;
    missingProperty: ProofObligationMissingProperty;
    resolutionEvidenceKinds: ProofObligationResolutionEvidenceKind[];
  }>;
}

export interface InternalInferenceHypothesisSummary {
  hypothesisId: string;
  proposalId: string;
  alternativeId: string;
  state: HypothesisResult["state"];
  interpretationState: HypothesisResult["interpretationState"];
  qualifiedInferenceStrength: QualifiedInferenceStrength | null;
  eligibleForLeadingConclusion: boolean;
}

export type MerchantInferenceConclusion =
  | {
      state: "leading_interpretation";
      text: string;
      alternativeId: string;
      qualifiedInferenceStrength: "strong" | "moderate";
    }
  | {
      state: "unresolved";
      text: typeof UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION;
      alternativeId: null;
      qualifiedInferenceStrength: "unknown_competing";
    };

export interface InferencePresentation {
  modelVersion: typeof INFERENCE_PRESENTATION_MODEL_VERSION;
  authority: "non_authoritative_inference_presentation";
  topicId: string;
  hypothesisGroupId: string;
  question: string;
  merchantConclusion: MerchantInferenceConclusion;
  internalHypotheses: InternalInferenceHypothesisSummary[];
  alternativeEvidencePostures: RateRevealAlternativeEvidencePosture[];
  resolutionEvidenceNeeds: InferencePresentationResolutionNeed[];
  reasonCodes: string[];
}

interface AlternativePosture {
  alternativeId: string;
  description: string;
  bestStrength: QualifiedInferenceStrength | null;
}

const strengthRank: Record<QualifiedInferenceStrength, number> = {
  unknown_competing: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

/**
 * Builds a future merchant-facing projection from RateReveal-owned topics and
 * RateReveal-qualified evidence posture. Provider confidence and prose are not
 * inputs to the selection rule.
 */
export function buildInferencePresentations(input: {
  topics: InferenceTopic[];
  providerHypotheses: Hypothesis[];
  hypothesisResults: HypothesisResult[];
  alternativeEvidencePostures: RateRevealAlternativeEvidencePosture[];
  evidenceNeeds: EvidenceNeed[];
  evidenceRoutes: EvidenceRoute[];
}): InferencePresentation[] {
  const resultByHypothesisId = new Map(input.hypothesisResults.map((result) => [
    result.hypothesisId,
    result,
  ]));
  const evidenceNeedById = new Map(input.evidenceNeeds.map((need) => [need.id, need]));
  const evidenceRouteByNeedId = new Map(input.evidenceRoutes.map((route) => [
    route.evidenceNeedId,
    route,
  ]));
  const postureByTopicAlternative = new Map(input.alternativeEvidencePostures.map((posture) => [
    `${posture.topicId}|${posture.alternativeId}`,
    posture,
  ]));

  return [...input.topics]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((topic) => {
      const topicHypotheses = input.providerHypotheses.filter((hypothesis) =>
        hypothesis.ownership.kind === "provider"
        && hypothesis.inferenceTopic?.topicId === topic.id
        && hypothesis.groupId === topic.hypothesisGroupId);
      const internalHypotheses = topicHypotheses
        .map((hypothesis): InternalInferenceHypothesisSummary | null => {
          const result = resultByHypothesisId.get(hypothesis.id);
          if (!result || hypothesis.ownership.kind !== "provider" || !hypothesis.inferenceTopic) return null;
          return {
            hypothesisId: hypothesis.id,
            proposalId: hypothesis.ownership.proposalId,
            alternativeId: hypothesis.inferenceTopic.alternativeId,
            state: result.state,
            interpretationState: result.interpretationState,
            qualifiedInferenceStrength: result.qualifiedInferenceStrength ?? null,
            eligibleForLeadingConclusion: isEligibleForLeadingConclusion(result),
          };
        })
        .filter((summary): summary is InternalInferenceHypothesisSummary => summary !== null)
        .sort((left, right) => left.proposalId.localeCompare(right.proposalId));

      const alternatives = topic.materialAlternatives.map<AlternativePosture>((alternative) => {
        const posture = postureByTopicAlternative.get(`${topic.id}|${alternative.id}`);
        return {
          alternativeId: alternative.id,
          description: alternative.description,
          bestStrength: posture?.outcome === "qualified" ? posture.qualifiedStrength : null,
        };
      });

      const merchantSelection = selectMerchantInferenceConclusion(alternatives);
      const merchantConclusion = merchantSelection.conclusion;

      return {
        modelVersion: INFERENCE_PRESENTATION_MODEL_VERSION,
        authority: "non_authoritative_inference_presentation",
        topicId: topic.id,
        hypothesisGroupId: topic.hypothesisGroupId,
        question: topic.question,
        merchantConclusion,
        internalHypotheses,
        alternativeEvidencePostures: input.alternativeEvidencePostures
          .filter((posture) => posture.topicId === topic.id)
          .map((posture) => structuredClone(posture))
          .sort((left, right) => left.alternativeId.localeCompare(right.alternativeId)),
        resolutionEvidenceNeeds: resolutionEvidenceNeeds(
          topic,
          evidenceNeedById,
          evidenceRouteByNeedId,
        ),
        reasonCodes: presentationReasonCodes(
          alternatives,
          merchantSelection.hasPresentableStrength,
          merchantSelection.hasMeaningfulAdvantage,
        ),
      };
    });
}

/** Replays the merchant conclusion from RateReveal-owned alternative postures only. */
export function replayMerchantInferenceConclusion(
  topic: InferenceTopic,
  postures: RateRevealAlternativeEvidencePosture[],
): MerchantInferenceConclusion {
  const postureByAlternative = new Map(postures
    .filter((posture) => posture.topicId === topic.id)
    .map((posture) => [posture.alternativeId, posture]));
  const alternatives = topic.materialAlternatives.map<AlternativePosture>((alternative) => {
    const posture = postureByAlternative.get(alternative.id);
    return {
      alternativeId: alternative.id,
      description: alternative.description,
      bestStrength: posture?.outcome === "qualified" ? posture.qualifiedStrength : null,
    };
  });
  return selectMerchantInferenceConclusion(alternatives).conclusion;
}

function selectMerchantInferenceConclusion(alternatives: AlternativePosture[]): {
  conclusion: MerchantInferenceConclusion;
  hasPresentableStrength: boolean;
  hasMeaningfulAdvantage: boolean;
} {
  const rankedAlternatives = [...alternatives].sort((left, right) =>
    rank(right.bestStrength) - rank(left.bestStrength)
    || left.alternativeId.localeCompare(right.alternativeId));
  const leader = rankedAlternatives[0];
  const runnerUp = rankedAlternatives[1];
  const hasPresentableStrength = leader?.bestStrength === "strong" || leader?.bestStrength === "moderate";
  const hasMeaningfulAdvantage = leader !== undefined
    && rank(leader.bestStrength) > rank(runnerUp?.bestStrength ?? null);
  const conclusion: MerchantInferenceConclusion = hasPresentableStrength && hasMeaningfulAdvantage
    ? {
        state: "leading_interpretation",
        text: leader.description,
        alternativeId: leader.alternativeId,
        qualifiedInferenceStrength: leader.bestStrength as "strong" | "moderate",
      }
    : {
        state: "unresolved",
        text: UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
        alternativeId: null,
        qualifiedInferenceStrength: "unknown_competing",
      };
  return { conclusion, hasPresentableStrength, hasMeaningfulAdvantage };
}

function isEligibleForLeadingConclusion(result: HypothesisResult): boolean {
  return result.state !== "rejected"
    && result.evidencePosture?.outcome !== "contradicted"
    && (result.qualifiedInferenceStrength === "strong"
      || result.qualifiedInferenceStrength === "moderate");
}

function rank(strength: QualifiedInferenceStrength | null): number {
  return strength === null ? 0 : strengthRank[strength];
}

function resolutionEvidenceNeeds(
  topic: InferenceTopic,
  evidenceNeedById: Map<string, EvidenceNeed>,
  evidenceRouteByNeedId: Map<string, EvidenceRoute>,
): InferencePresentationResolutionNeed[] {
  return [...new Set(topic.qualification.materialEvidenceNeedIds)]
    .sort()
    .map((evidenceNeedId) => {
      const need = evidenceNeedById.get(evidenceNeedId);
      const proofObligations = topic.proofObligations
        .filter((obligation) => obligation.evidenceNeedIds.includes(evidenceNeedId))
        .map((obligation) => ({
          proofObligationId: obligation.id,
          description: obligation.description,
          missingProperty: obligation.missingProperty,
          resolutionEvidenceKinds: structuredClone(obligation.resolutionEvidenceKinds),
        }));
      return {
        evidenceNeedId,
        description: need?.description ?? "RateReveal-owned evidence requirement is unavailable.",
        material: need?.material ?? true,
        route: structuredClone(evidenceRouteByNeedId.get(evidenceNeedId) ?? null),
        proofObligations,
      };
    });
}

function presentationReasonCodes(
  alternatives: AlternativePosture[],
  hasPresentableStrength: boolean,
  hasMeaningfulAdvantage: boolean,
): string[] {
  if (hasPresentableStrength && hasMeaningfulAdvantage) {
    return [
      "rate_reveal_qualified_strength_supports_leading_interpretation",
      "leading_interpretation_has_meaningful_evidence_advantage",
    ];
  }
  if (!hasPresentableStrength && alternatives.every((alternative) =>
    alternative.bestStrength === "weak"
    || alternative.bestStrength === "unknown_competing"
    || alternative.bestStrength === null)) {
    return ["evidence_too_weak_to_favor_an_alternative"];
  }
  if (!hasMeaningfulAdvantage) return ["no_meaningful_evidence_advantage_over_alternatives"];
  return ["no_presentable_leading_interpretation"];
}
