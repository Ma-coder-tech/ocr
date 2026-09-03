import { describe, expect, it } from "vitest";

import {
  buildHypothesisProposalRequest,
  collectRecordedProviderHypotheses,
  evaluateProofGapUnderstanding,
  reconstructStatement,
  validateProviderResponse,
  type HypothesisProposalRequest,
  type HypothesisProposalResponse,
  type ProviderHypothesisProposal,
  type StatementHypothesisProposer,
} from "../src/reconstructionKernel/index.js";
import {
  offlineLiveConfidenceRuns,
  offlineProofGapCalibrationCases,
} from "./fixtures/reconstructionKernel/offlineHypothesisCalibration.js";
import {
  cloverInferenceTopics,
  paysafeInferenceTopics,
  wellsInferenceTopics,
} from "./fixtures/reconstructionKernel/recordedHypothesisProposals.js";
import { cloverDuplicateResubmission } from "./fixtures/reconstructionKernel/rescueCorpus.js";

const topicsByStatement = {
  "clover-duplicate-resubmission": cloverInferenceTopics[0]!,
  "paysafe-october-2025": paysafeInferenceTopics[0]!,
  "wells-fargo-september-2024": wellsInferenceTopics[0]!,
};

function cloverRequest(): HypothesisProposalRequest {
  return buildHypothesisProposalRequest(
    cloverDuplicateResubmission.statementId,
    cloverDuplicateResubmission.observations,
    { sourceDocumentRef: "approved-evaluation-document:clover-duplicate-resubmission", sourceContentSha256: "a".repeat(64) },
    cloverInferenceTopics,
    cloverDuplicateResubmission.evidenceNeeds,
  );
}

function proposalFor(
  request: HypothesisProposalRequest,
  alternativeIndex: number,
  missingProof = "A stable reference linking each rejected row to its later submitted batch is missing.",
): ProviderHypothesisProposal {
  const topic = request.inferenceTopics[0]!;
  const alternative = topic.materialAlternatives[alternativeIndex]!;
  return {
    id: `calibration-${alternativeIndex}`,
    topicRef: topic.topicRef,
    alternativeRef: alternative.alternativeRef,
    description: "Source-bound offline calibration proposal.",
    observationRefs: topic.observationRefs,
    events: [],
    populations: [],
    claims: [{ ...alternative.claim, observationRefs: topic.observationRefs }],
    inference: {
      confidence: alternativeIndex === 0 ? "high" : "low",
      rationale: "The supplied rows favor this interpretation while the competing interpretation remains possible.",
      missingProof: [missingProof],
      acknowledgedEvidenceNeedRefs: topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
    },
  };
}

function responseFor(
  request: HypothesisProposalRequest,
  providerId: string,
  proposedAlternativeIndexes: number[],
): HypothesisProposalResponse {
  const topic = request.inferenceTopics[0]!;
  const hypotheses = proposedAlternativeIndexes.map((index) => proposalFor(request, index));
  return {
    providerId,
    hypotheses,
    alternativeCoverage: topic.materialAlternatives.map((alternative, index) => {
      const proposed = proposedAlternativeIndexes.includes(index);
      return {
        topicRef: topic.topicRef,
        alternativeRef: alternative.alternativeRef,
        disposition: proposed ? "proposed" as const : "not_supported" as const,
        reasonCode: proposed ? "proposal_supplied" as const : "insufficient_source_evidence" as const,
        rationale: proposed
          ? "A matching source-bound proposal is supplied."
          : "The cited rows are compatible with this alternative but do not support a useful proposal.",
        observationRefs: topic.observationRefs,
        acknowledgedEvidenceNeedRefs: topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
      };
    }),
  };
}

describe("offline AI hypothesis calibration", () => {
  it("classifies all 31 recorded, live-derived, paraphrase, and adversarial proof-gap cases as expected", () => {
    expect(offlineProofGapCalibrationCases).toHaveLength(31);
    const outcomes = offlineProofGapCalibrationCases.map((calibrationCase) => {
      const topic = topicsByStatement[calibrationCase.statementId];
      const result = evaluateProofGapUnderstanding(topic, calibrationCase.alternativeId, calibrationCase.missingProof);
      return { id: calibrationCase.id, understood: result.requiredConceptIds.every((id) => result.understoodConceptIds.includes(id)) };
    });
    expect(outcomes).toEqual(offlineProofGapCalibrationCases.map((calibrationCase) => ({
      id: calibrationCase.id,
      understood: calibrationCase.expectedUnderstood,
    })));
  });

  it("recognizes every semantically valid proof gap from the approved recorded live runs", () => {
    const liveCases = offlineProofGapCalibrationCases.filter((calibrationCase) => calibrationCase.source === "live-evaluation-record");
    expect(liveCases).toHaveLength(14);
    expect(liveCases.every((calibrationCase) => {
      const result = evaluateProofGapUnderstanding(
        topicsByStatement[calibrationCase.statementId],
        calibrationCase.alternativeId,
        calibrationCase.missingProof,
      );
      return result.understoodConceptIds.length === result.requiredConceptIds.length;
    })).toBe(true);
  });

  it("recognizes the three exact v3 live phrasings that exposed bounded vocabulary gaps", () => {
    const v3CaseIds = new Set([
      "clover-live-v3-inflected-correspondence",
      "paysafe-live-v3-absent-component",
      "wells-live-v3-transaction-linkage",
    ]);
    const liveV3Cases = offlineProofGapCalibrationCases.filter((calibrationCase) => v3CaseIds.has(calibrationCase.id));
    expect(liveV3Cases).toHaveLength(3);
    expect(liveV3Cases.map((calibrationCase) => {
      const result = evaluateProofGapUnderstanding(
        topicsByStatement[calibrationCase.statementId],
        calibrationCase.alternativeId,
        calibrationCase.missingProof,
      );
      return {
        id: calibrationCase.id,
        understood: result.evaluations.every((evaluation) => evaluation.understood),
      };
    })).toEqual(liveV3Cases.map((calibrationCase) => ({ id: calibrationCase.id, understood: true })));
  });

  it("rejects identifier echo, generic language, and incomplete concept fragments", () => {
    const adversarialFailures = offlineProofGapCalibrationCases.filter((calibrationCase) => !calibrationCase.expectedUnderstood);
    expect(adversarialFailures).toHaveLength(10);
    expect(adversarialFailures.every((calibrationCase) => {
      const result = evaluateProofGapUnderstanding(
        topicsByStatement[calibrationCase.statementId],
        calibrationCase.alternativeId,
        calibrationCase.missingProof,
      );
      return result.understoodConceptIds.length === 0;
    })).toBe(true);
  });

  it("records the pre-calibration confidence inconsistency and alternative omission from the six live runs", () => {
    expect(offlineLiveConfidenceRuns).toHaveLength(6);
    expect(offlineLiveConfidenceRuns.filter((run) => run.statementId === "clover-duplicate-resubmission")
      .map((run) => run.values.same)).toEqual(["high", "medium"]);
    expect(offlineLiveConfidenceRuns.filter((run) => run.statementId === "wells-fargo-september-2024")
      .map((run) => run.values.same)).toEqual(["medium", "low"]);
    expect(offlineLiveConfidenceRuns.filter((run) => run.statementId === "paysafe-october-2025")
      .map((run) => run.values.component)).toEqual(["omitted", "medium"]);
  });

  it("accepts complete proposed-or-not-supported coverage for every RateReveal alternative", () => {
    const request = cloverRequest();
    expect(validateProviderResponse(responseFor(request, "calibration-provider", [0]), request, "calibration-provider")).toEqual([]);
    expect(validateProviderResponse(responseFor(request, "calibration-provider", [0, 1]), request, "calibration-provider")).toEqual([]);
  });

  it("fails closed when anchoring causes a material alternative to be omitted", () => {
    const request = cloverRequest();
    const response = responseFor(request, "anchored-provider", [0]);
    response.alternativeCoverage.splice(1, 1);
    expect(validateProviderResponse(response, request, "anchored-provider").join(" ")).toContain(
      "material-alternative-0002 must be addressed exactly once; received 0",
    );
  });

  it("fails closed on invented, duplicate, and internally inconsistent alternative assessments", () => {
    const request = cloverRequest();
    const invented = responseFor(request, "malformed-provider", [0]);
    invented.alternativeCoverage[1]!.alternativeRef = "provider-created-alternative";
    expect(validateProviderResponse(invented, request, "malformed-provider").join(" ")).toContain(
      "does not select a material alternative from its RateReveal-owned topic",
    );

    const duplicate = responseFor(request, "malformed-provider", [0]);
    duplicate.alternativeCoverage.push(structuredClone(duplicate.alternativeCoverage[0]!));
    expect(validateProviderResponse(duplicate, request, "malformed-provider").join(" ")).toContain(
      "must be addressed exactly once; received 2",
    );

    const inconsistent = responseFor(request, "malformed-provider", [0]);
    inconsistent.alternativeCoverage[0]!.disposition = "not_supported";
    inconsistent.alternativeCoverage[0]!.reasonCode = "insufficient_source_evidence";
    expect(validateProviderResponse(inconsistent, request, "malformed-provider").join(" ")).toContain(
      "cannot also have a matching hypothesis",
    );

    const missingCoverage = responseFor(request, "malformed-provider", [0]) as unknown as Record<string, unknown>;
    delete missingCoverage.alternativeCoverage;
    expect(validateProviderResponse(
      missingCoverage as unknown as HypothesisProposalResponse,
      request,
      "malformed-provider",
    ).join(" ")).toContain("alternativeCoverage must be an array");

    const authorityAttempt = responseFor(request, "malformed-provider", [0]);
    (authorityAttempt.alternativeCoverage[0] as unknown as Record<string, unknown>).canonicalAuthority = "approved";
    expect(validateProviderResponse(authorityAttempt, request, "malformed-provider").join(" ")).toContain(
      "prohibited authority metadata canonicalAuthority",
    );
  });

  it("keeps superficial proof-gap wording weak and canonical truth invariant", async () => {
    const providerId = "superficial-proof-gap-provider";
    const proposer: StatementHypothesisProposer = {
      providerId,
      async propose(request) {
        const response = responseFor(request, providerId, [0]);
        response.hypotheses[0] = proposalFor(request, 0, "evidence-need-0001: more information is needed.");
        return response;
      },
    };
    const collected = await collectRecordedProviderHypotheses(
      proposer,
      cloverDuplicateResubmission.statementId,
      cloverDuplicateResubmission.observations,
      { sourceDocumentRef: "approved-evaluation-document:clover-duplicate-resubmission", sourceContentSha256: "a".repeat(64) },
      cloverInferenceTopics,
      cloverDuplicateResubmission.evidenceNeeds,
    );
    expect(collected.errors).toEqual([]);
    const input = structuredClone(cloverDuplicateResubmission);
    const baseline = reconstructStatement(input);
    input.hypotheses.push(...collected.hypotheses);
    const augmented = reconstructStatement(input);
    expect(augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ providerId }),
      providerReportedConfidence: "high",
      qualifiedInferenceStrength: "weak",
      qualificationReasonCodes: expect.arrayContaining(["material_proof_gap_concept_not_understood"]),
    }));
    expect(augmented.canonicalClaims).toEqual(baseline.canonicalClaims);
    expect(augmented.possibleWorlds.some((world) => !world.hypothesisIds.includes(collected.hypotheses[0]!.id))).toBe(true);
  });
});
