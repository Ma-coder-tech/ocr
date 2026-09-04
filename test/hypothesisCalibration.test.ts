import { describe, expect, it } from "vitest";

import {
  buildHypothesisProposalRequest,
  collectRecordedProviderHypotheses,
  reconstructStatement,
  validateProviderResponse,
  type HypothesisProposalRequest,
  type HypothesisProposalResponse,
  type InferenceTopic,
  type ProviderHypothesisProposal,
  type ReconstructionInput,
  type StatementHypothesisProposer,
} from "../src/reconstructionKernel/index.js";
import {
  offlineLiveConfidenceRuns,
  offlineProofGapCalibrationCases,
} from "./fixtures/reconstructionKernel/offlineHypothesisCalibration.js";
import {
  cloverInferenceTopics,
  paysafeInferenceTopics,
  proofObligationBindingsForAlternative,
  wellsInferenceTopics,
} from "./fixtures/reconstructionKernel/recordedHypothesisProposals.js";
import {
  cloverDuplicateResubmission,
  paysafeOctober2025,
  wellsFargoSeptember2024,
} from "./fixtures/reconstructionKernel/rescueCorpus.js";

const topicsByStatement = {
  "clover-duplicate-resubmission": cloverInferenceTopics[0]!,
  "paysafe-october-2025": paysafeInferenceTopics[0]!,
  "wells-fargo-september-2024": wellsInferenceTopics[0]!,
};
type StatementId = keyof typeof topicsByStatement;

const inputsByStatement: Record<StatementId, ReconstructionInput> = {
  "clover-duplicate-resubmission": cloverDuplicateResubmission,
  "paysafe-october-2025": paysafeOctober2025,
  "wells-fargo-september-2024": wellsFargoSeptember2024,
};

function requestFor(statementId: StatementId): HypothesisProposalRequest {
  const input = inputsByStatement[statementId];
  return buildHypothesisProposalRequest(
    input.statementId,
    input.observations,
    { sourceDocumentRef: `approved-evaluation-document:${statementId}`, sourceContentSha256: "a".repeat(64) },
    [topicsByStatement[statementId]],
    input.evidenceNeeds,
  );
}

function alternativeIndex(topic: InferenceTopic, alternativeId: string): number {
  const index = topic.materialAlternatives.findIndex((alternative) => alternative.id === alternativeId);
  if (index < 0) throw new Error(`Unknown fixture alternative ${alternativeId}.`);
  return index;
}

function proposalFor(
  request: HypothesisProposalRequest,
  index: number,
  missingProof = ["Audit explanation only."],
): ProviderHypothesisProposal {
  const topic = request.inferenceTopics[0]!;
  const alternative = topic.materialAlternatives[index]!;
  return {
    id: `calibration-${index}`,
    topicRef: topic.topicRef,
    alternativeRef: alternative.alternativeRef,
    description: "Source-bound offline calibration proposal.",
    observationRefs: topic.observationRefs,
    events: [],
    populations: [],
    claims: [{ ...alternative.claim, observationRefs: topic.observationRefs }],
    inference: {
      confidence: index === 0 ? "high" : "low",
      rationale: "The supplied rows favor this interpretation while the competing interpretation remains possible.",
      missingProof,
      acknowledgedEvidenceNeedRefs: topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
      proofObligationBindings: proofObligationBindingsForAlternative(request, alternative.alternativeRef),
      verificationRequests: [],
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

async function collectResponse(statementId: StatementId, response: HypothesisProposalResponse) {
  const input = inputsByStatement[statementId];
  const proposer: StatementHypothesisProposer = {
    providerId: response.providerId,
    async propose() { return structuredClone(response); },
  };
  return collectRecordedProviderHypotheses(
    proposer,
    input.statementId,
    input.observations,
    { sourceDocumentRef: `approved-evaluation-document:${statementId}`, sourceContentSha256: "a".repeat(64) },
    [topicsByStatement[statementId]],
    input.evidenceNeeds,
  );
}

describe("offline structured proof-obligation calibration", () => {
  it("makes all 31 historical wordings qualification-neutral when the same valid structure is supplied", async () => {
    expect(offlineProofGapCalibrationCases).toHaveLength(31);
    const outcomes = await Promise.all(offlineProofGapCalibrationCases.map(async (calibrationCase) => {
      const statementId = calibrationCase.statementId;
      const request = requestFor(statementId);
      const index = alternativeIndex(topicsByStatement[statementId], calibrationCase.alternativeId);
      const response = responseFor(request, `wording-neutral-${calibrationCase.id}`, [index]);
      response.hypotheses[0]!.inference.missingProof = structuredClone(calibrationCase.missingProof);
      const collected = await collectResponse(statementId, response);
      return {
        accepted: collected.errors.length === 0,
        modelVersion: collected.hypotheses[0]?.inference?.proofObligationValidation?.modelVersion,
      };
    }));
    expect(outcomes.every((outcome) => outcome.accepted)).toBe(true);
    expect(new Set(outcomes.map((outcome) => outcome.modelVersion))).toEqual(
      new Set(["ratereveal-proof-obligations-v1"]),
    );
  });

  it("removes the three prior live false negatives without adding phrase-specific rules", async () => {
    const priorFalseNegativeIds = new Set([
      "clover-live-v3-inflected-correspondence",
      "paysafe-live-v3-absent-component",
      "wells-live-v3-transaction-linkage",
    ]);
    const cases = offlineProofGapCalibrationCases.filter((item) => priorFalseNegativeIds.has(item.id));
    expect(cases).toHaveLength(3);
    const accepted = await Promise.all(cases.map(async (item) => {
      const request = requestFor(item.statementId);
      const index = alternativeIndex(topicsByStatement[item.statementId], item.alternativeId);
      const response = responseFor(request, `prior-false-negative-${item.id}`, [index]);
      response.hypotheses[0]!.inference.missingProof = structuredClone(item.missingProof);
      return (await collectResponse(item.statementId, response)).errors.length === 0;
    }));
    expect(accepted).toEqual([true, true, true]);
  });

  it("rejects absent, invented, incomplete, and incorrectly source-bound obligations", async () => {
    const request = requestFor("clover-duplicate-resubmission");
    const mutations: Array<(proposal: ProviderHypothesisProposal) => void> = [
      (proposal) => { proposal.inference.proofObligationBindings = []; },
      (proposal) => { proposal.inference.proofObligationBindings[0]!.proofObligationRef = "provider-invented-obligation"; },
      (proposal) => { proposal.inference.proofObligationBindings[0]!.observationBindings.pop(); },
      (proposal) => {
        const binding = proposal.inference.proofObligationBindings[0]!;
        [binding.observationBindings[0]!.observationRefs, binding.observationBindings[1]!.observationRefs]
          = [binding.observationBindings[1]!.observationRefs, binding.observationBindings[0]!.observationRefs];
      },
      (proposal) => { proposal.inference.proofObligationBindings[0]!.missingProperty = "row_level_temporal_link"; },
      (proposal) => { proposal.inference.proofObligationBindings[0]!.resolutionEvidenceKinds = ["row_level_date"]; },
      (proposal) => {
        (proposal.inference.proofObligationBindings[0] as unknown as Record<string, unknown>).authority = "confirmed";
      },
    ];
    const outcomes = await Promise.all(mutations.map(async (mutate, index) => {
      const response = responseFor(request, `invalid-structure-${index}`, [0]);
      mutate(response.hypotheses[0]!);
      return collectResponse("clover-duplicate-resubmission", response);
    }));
    expect(outcomes.every((outcome) => outcome.hypotheses.length === 0 && outcome.errors.length > 0)).toBe(true);
  });

  it("does not let polished prose substitute for missing structure", async () => {
    const request = requestFor("clover-duplicate-resubmission");
    const response = responseFor(request, "prose-is-not-proof", [0]);
    response.hypotheses[0]!.inference.missingProof = [
      "A stable source identifier linking each rejected row to its corresponding later submitted row is missing.",
    ];
    response.hypotheses[0]!.inference.proofObligationBindings = [];
    const collected = await collectResponse("clover-duplicate-resubmission", response);
    expect(collected.hypotheses).toEqual([]);
    expect(collected.errors.join(" ")).toContain("must bind proof obligation");
  });

  it("rejects invalid RateReveal-owned obligation definitions before provider execution", () => {
    const topicWithForeignSource = structuredClone(cloverInferenceTopics[0]!);
    topicWithForeignSource.proofObligations[0]!.observationRequirements[0]!.observationRefs = ["paysafe.fees"];
    expect(() => buildHypothesisProposalRequest(
      cloverDuplicateResubmission.statementId,
      cloverDuplicateResubmission.observations,
      { sourceDocumentRef: "approved-evaluation-document:clover", sourceContentSha256: "a".repeat(64) },
      [topicWithForeignSource],
      cloverDuplicateResubmission.evidenceNeeds,
    )).toThrow(/invalid source-role requirement/);

    const topicWithFalsePresence = structuredClone(cloverInferenceTopics[0]!);
    topicWithFalsePresence.proofObligations[0]!.observationRequirements[0]!.valueState = "present";
    expect(() => buildHypothesisProposalRequest(
      cloverDuplicateResubmission.statementId,
      cloverDuplicateResubmission.observations,
      { sourceDocumentRef: "approved-evaluation-document:clover", sourceContentSha256: "a".repeat(64) },
      [topicWithFalsePresence],
      cloverDuplicateResubmission.evidenceNeeds,
    )).toThrow(/expects present source evidence that is missing/);
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
    const request = requestFor("clover-duplicate-resubmission");
    expect(validateProviderResponse(responseFor(request, "calibration-provider", [0]), request, "calibration-provider")).toEqual([]);
    expect(validateProviderResponse(responseFor(request, "calibration-provider", [0, 1]), request, "calibration-provider")).toEqual([]);
  });

  it("fails closed when anchoring causes a material alternative to be omitted", () => {
    const request = requestFor("clover-duplicate-resubmission");
    const response = responseFor(request, "anchored-provider", [0]);
    response.alternativeCoverage.splice(1, 1);
    expect(validateProviderResponse(response, request, "anchored-provider").join(" ")).toContain(
      "material-alternative-0002 must be addressed exactly once; received 0",
    );
  });

  it("fails closed on invented, duplicate, and internally inconsistent alternative assessments", () => {
    const request = requestFor("clover-duplicate-resubmission");
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
  });

  it("keeps canonical truth invariant for accepted and rejected structured answers", async () => {
    const request = requestFor("clover-duplicate-resubmission");
    const baseline = reconstructStatement(cloverDuplicateResubmission);
    const valid = await collectResponse(
      "clover-duplicate-resubmission",
      responseFor(request, "valid-structured-provider", [0]),
    );
    const validInput = structuredClone(cloverDuplicateResubmission);
    validInput.hypotheses.push(...valid.hypotheses);
    expect(reconstructStatement(validInput).canonicalClaims).toEqual(baseline.canonicalClaims);

    const invalidResponse = responseFor(request, "invalid-structured-provider", [0]);
    invalidResponse.hypotheses[0]!.inference.proofObligationBindings = [];
    const invalid = await collectResponse("clover-duplicate-resubmission", invalidResponse);
    expect(invalid.hypotheses).toEqual([]);
    expect(reconstructStatement(cloverDuplicateResubmission).canonicalClaims).toEqual(baseline.canonicalClaims);
  });
});
