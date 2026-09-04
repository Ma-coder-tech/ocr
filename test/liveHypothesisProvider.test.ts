import { describe, expect, it } from "vitest";

import {
  OpenAiLiveHypothesisProposer,
  assertLiveEvaluationPacketSafe,
  stableLiveProposalId,
  type HypothesisProposalRequest,
} from "../src/reconstructionKernel/index.js";

function request(): HypothesisProposalRequest {
  return {
    schemaVersion: "source_bound_hypothesis_proposal_v6",
    sourceDocument: {
      documentId: "approved-case",
      sourceDocumentRef: "approved-evaluation-document:approved-case",
      sourceContentSha256: "a".repeat(64),
    },
    observations: [{
      observationRef: "source-observation-0001",
      kind: "amount",
      value: 1,
      sourceAuthority: "source_printed",
      sourceLocation: { page: 1, section: "fees", row: "TOTAL FEES | $0.01" },
      extractedText: "TOTAL FEES | $0.01",
      relatedObservationRefs: [],
    }],
    allowedObservationRefs: ["source-observation-0001"],
    inferenceTopics: [{
      topicRef: "inference-topic-0001",
      question: "What explains the gap?",
      observationRefs: ["source-observation-0001"],
      allowedClaims: [{ key: "gap.explanation", allowedValues: ["rounding"] }],
      materialAlternatives: [{
        alternativeRef: "material-alternative-0001",
        description: "The visible gap is rounding.",
        claim: { key: "gap.explanation", value: "rounding" },
        requiredProofObligationRefs: ["proof-obligation-0001"],
      }],
      proofObligations: [{
        proofObligationRef: "proof-obligation-0001",
        description: "The underlying calculation basis is missing.",
        gapKind: "calculation_basis",
        requiredObservationRoles: [{ role: "reported_total", description: "The printed reported total." }],
        missingProperty: "underlying_calculation_basis",
        permittedResolutionEvidenceKinds: ["unrounded_source_amounts"],
      }],
      verificationChecks: [],
      knownEvidenceGaps: [{ evidenceNeedRef: "evidence-need-0001", description: "Unrounded inputs are missing.", material: true }],
    }],
    authorityPolicy: {
      providerOutput: "proposal_only",
      canonicalAuthority: "prohibited",
      controlSelection: "prohibited",
      verificationSemantics: "ratereveal_owned",
      verificationResultAssignment: "prohibited",
    },
  };
}

describe("live hypothesis provider boundary", () => {
  it("sends one stateless structured request and records the full response without credentials", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImplementation: typeof fetch = async (_url, init) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: "resp_test",
        model: "gpt-5.6-terra-2026-08-01",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              hypotheses: [{
                topicRef: "inference-topic-0001",
                alternativeRef: "material-alternative-0001",
                description: "Displayed rounding is compatible with the gap.",
                observationRefs: ["source-observation-0001"],
                events: [],
                populations: [],
                claims: [{ key: "gap.explanation", value: "rounding", observationRefs: ["source-observation-0001"] }],
                inference: {
                  confidence: "medium",
                  rationale: "The row is compatible with rounding, while an omitted component remains an alternative.",
                  missingProof: ["Unrounded inputs are missing."],
                  acknowledgedEvidenceNeedRefs: ["evidence-need-0001"],
                  proofObligationBindings: [{
                    proofObligationRef: "proof-obligation-0001",
                    gapKind: "calculation_basis",
                    observationBindings: [{ role: "reported_total", observationRefs: ["source-observation-0001"] }],
                    missingProperty: "underlying_calculation_basis",
                    resolutionEvidenceKinds: ["unrounded_source_amounts"],
                  }],
                  verificationRequests: [],
                },
              }],
              alternativeCoverage: [{
                topicRef: "inference-topic-0001",
                alternativeRef: "material-alternative-0001",
                disposition: "proposed",
                reasonCode: "proposal_supplied",
                rationale: "The source observations support a rounding proposal.",
                observationRefs: ["source-observation-0001"],
                acknowledgedEvidenceNeedRefs: ["evidence-need-0001"],
              }],
            }),
          }],
        }],
      }), { status: 200, headers: { "x-request-id": "request_test" } });
    };
    const proposer = new OpenAiLiveHypothesisProposer({
      apiKey: "test-only-key",
      model: "gpt-5.6-terra",
      reasoningEffort: "high",
      maxOutputTokens: 1_000,
      timeoutMs: 5_000,
      fetchImplementation,
    });

    const result = await proposer.propose(request());

    expect(sentBody).toMatchObject({ model: "gpt-5.6-terra", store: false, reasoning: { effort: "high" } });
    expect(sentBody).not.toHaveProperty("tools");
    expect(JSON.stringify(sentBody)).not.toContain("test-only-key");
    expect(JSON.stringify(sentBody)).toContain("alternativeCoverage");
    expect(JSON.stringify(sentBody)).toContain("material-alternative-0001");
    expect(JSON.stringify(sentBody)).toContain("proofObligationBindings");
    expect(result.hypotheses[0]?.id).toBe(stableLiveProposalId("inference-topic-0001", "gap.explanation", "rounding"));
    expect(result.alternativeCoverage).toHaveLength(1);
    expect(proposer.getAttemptAudits()).toEqual([expect.objectContaining({
      attemptNumber: 1,
      automaticRetryCount: 0,
      httpStatus: 200,
      providerRequestId: "request_test",
      returnedModel: "gpt-5.6-terra-2026-08-01",
      outcome: "completed",
    })]);
  });

  it("rejects a local path and observations outside the selected topic before send", () => {
    const localPath = request();
    localPath.sourceDocument.sourceDocumentRef = "/private/tmp/input.pdf";
    expect(() => assertLiveEvaluationPacketSafe(localPath)).toThrow(/opaque approved-evaluation/);

    const extraObservation = request();
    extraObservation.observations.push({
      ...extraObservation.observations[0]!,
      observationRef: "source-observation-0002",
    });
    expect(() => assertLiveEvaluationPacketSafe(extraObservation)).toThrow(/outside the selected topic/);
  });
});
