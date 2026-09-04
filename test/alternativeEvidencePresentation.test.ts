import { describe, expect, it } from "vitest";

import {
  UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
  buildInferencePresentations,
  evaluateAlternativeEvidencePostures,
  validateVerifiedInferenceEvidence,
  type ControlResult,
  type EvidenceNeed,
  type InferenceTopic,
  type VerifiedInferenceEvidence,
} from "../src/reconstructionKernel/index.js";

function genericTopic(
  namespace: string,
  includeSecondIndependentSupport: boolean,
  firstDiagnosticity: "contextual" | "material" = "material",
): InferenceTopic {
  const related = `${namespace}.related`;
  const factors: InferenceTopic["qualification"]["evidenceFactors"] = [{
    id: `${namespace}.support-one`,
    description: "One verified relationship pattern supports the interpretation.",
    alternativeIds: [related],
    effect: "supports",
    diagnosticity: firstDiagnosticity,
    independenceGroupId: `${namespace}.pattern-one`,
    controlIds: [`${namespace}.control-one`],
    activation: "all_pass",
  }];
  if (includeSecondIndependentSupport) factors.push({
    id: `${namespace}.support-two`,
    description: "A second independent verified relationship pattern supports the interpretation.",
    alternativeIds: [related],
    effect: "supports",
    diagnosticity: "material",
    independenceGroupId: `${namespace}.pattern-two`,
    controlIds: [`${namespace}.control-two`],
    activation: "all_pass",
  });
  return {
    id: `${namespace}.relationship`,
    hypothesisGroupId: `${namespace}.relationship`,
    question: "Do the observations belong to one relationship or separate relationships?",
    observationRefs: [`${namespace}.left`, `${namespace}.right`],
    allowedClaims: [{ key: `${namespace}.same_relationship`, allowedValues: [true, false] }],
    materialAlternatives: [
      {
        id: related,
        description: "The observations belong to one relationship.",
        claim: { key: `${namespace}.same_relationship`, value: true },
        requiredProofObligationIds: [`${namespace}.stable-link`],
        requiredVerificationRecipeIds: [],
      },
      {
        id: `${namespace}.separate`,
        description: "The observations belong to separate relationships.",
        claim: { key: `${namespace}.same_relationship`, value: false },
        requiredProofObligationIds: [`${namespace}.stable-link`],
        requiredVerificationRecipeIds: [],
      },
    ],
    proofObligations: [{
      id: `${namespace}.stable-link`,
      description: "Stable source linkage is required to resolve the relationship.",
      evidenceNeedIds: [`${namespace}.link-evidence`],
      gapKind: "identity_linkage",
      observationRequirements: [],
      missingProperty: "stable_identity_link",
      resolutionEvidenceKinds: ["stable_source_identifier", "explicit_source_relation"],
    }],
    verificationRecipes: [],
    qualification: {
      maximumStrength: "strong",
      compatibilityControlIds: [],
      evidenceFactors: factors,
      materialEvidenceNeedIds: [`${namespace}.link-evidence`],
      sourceCompleteness: "unproven",
      completenessRequirement: "observed_rows_sufficient",
    },
  };
}

function passingControls(namespace: string): ControlResult[] {
  return ["one", "two"].map((suffix) => ({
    controlId: `${namespace}.control-${suffix}`,
    state: "pass" as const,
    reason: "Synthetic deterministic verification passed.",
    observationRefs: [`${namespace}.left`, `${namespace}.right`],
  }));
}

function evidenceNeed(namespace: string): EvidenceNeed {
  return {
    id: `${namespace}.link-evidence`,
    hypothesisGroupId: `${namespace}.relationship`,
    description: "Obtain stable source linkage.",
    material: true,
    availableScopes: ["statement_local"],
  };
}

describe("provider-independent alternative evidence presentation", () => {
  it("applies the same evidence diagnosticity regardless of statement identity", () => {
    const first = genericTopic("statement-a", false, "contextual");
    const second = genericTopic("statement-b", false, "contextual");
    const firstPostures = evaluateAlternativeEvidencePostures({
      topics: [first],
      controlResults: passingControls("statement-a"),
    });
    const secondPostures = evaluateAlternativeEvidencePostures({
      topics: [second],
      controlResults: passingControls("statement-b"),
    });

    expect(firstPostures.map((posture) => [posture.baseStrength, posture.qualifiedStrength]))
      .toEqual(secondPostures.map((posture) => [posture.baseStrength, posture.qualifiedStrength]));
    expect(firstPostures.find((posture) => posture.alternativeId === "statement-a.related"))
      .toEqual(expect.objectContaining({
        baseStrength: "weak",
        qualifiedStrength: "weak",
        providerProposalRequired: false,
        providerConfidenceUsed: false,
      }));
  });

  it("can present sufficiently independent verified evidence without any provider proposal", () => {
    const topic = genericTopic("statement-c", true);
    const postures = evaluateAlternativeEvidencePostures({
      topics: [topic],
      controlResults: passingControls("statement-c"),
    });
    const need = evidenceNeed("statement-c");
    const presentation = buildInferencePresentations({
      topics: [topic],
      providerHypotheses: [],
      hypothesisResults: [],
      alternativeEvidencePostures: postures,
      evidenceNeeds: [need],
      evidenceRoutes: [{
        evidenceNeedId: need.id,
        scope: "statement_local",
        publicRgBlocked: false,
        reason: "Statement-local evidence remains available.",
      }],
    })[0]!;

    expect(presentation.internalHypotheses).toEqual([]);
    expect(presentation.merchantConclusion).toEqual({
      state: "leading_interpretation",
      text: "The observations belong to one relationship.",
      alternativeId: "statement-c.related",
      qualifiedInferenceStrength: "strong",
    });
  });

  it("keeps one support group unresolved and rejects invented persisted evidence", () => {
    const topic = genericTopic("statement-d", false, "contextual");
    const postures = evaluateAlternativeEvidencePostures({
      topics: [topic],
      controlResults: passingControls("statement-d"),
    });
    const need = evidenceNeed("statement-d");
    const presentation = buildInferencePresentations({
      topics: [topic],
      providerHypotheses: [],
      hypothesisResults: [],
      alternativeEvidencePostures: postures,
      evidenceNeeds: [need],
      evidenceRoutes: [],
    })[0]!;
    expect(presentation.merchantConclusion.text).toBe(UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION);

    const invented: VerifiedInferenceEvidence = {
      modelVersion: "ratereveal-verified-inference-evidence-v1",
      sourceContentSha256: "a".repeat(64),
      topicId: topic.id,
      alternativeId: "statement-d.related",
      factor: {
        factorId: "invented",
        effect: "supports",
        diagnosticity: "decisive",
        independenceGroupId: "invented",
        controlIds: [],
        state: "satisfied",
      },
      verification: { requestId: "invented", recipeId: "invented", candidateId: "invented" },
      verificationResult: {
        requestId: "invented",
        recipeId: "invented",
        candidateId: "invented",
        validationState: "accepted",
        controlState: "pass",
        classification: "supporting",
        observationRefs: [],
        componentResults: [],
        reason: "Invented evidence.",
      },
    };
    expect(validateVerifiedInferenceEvidence({
      sourceContentSha256: "a".repeat(64),
      topics: [topic],
      evidence: [invented],
    })).toEqual([expect.stringContaining("incomplete or malformed")]);
  });
});
