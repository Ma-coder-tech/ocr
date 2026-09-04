import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS } from "../src/canonical/v2/kernelAuthorityContract.js";
import { parsePdf } from "../src/parser.js";
import {
  adaptParsedDocumentToObservationPacket,
  bindReplayObservations,
  runRecordedHypothesisExperiment,
  UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
  verifyReplaySourceProvenance,
  type ReconstructionInput,
  type InferenceTopic,
  type RecordedHypothesisExperimentResult,
  type RecordedProposalReviewRule,
  type StatementHypothesisProposer,
  type VerifiedInferenceEvidence,
} from "../src/reconstructionKernel/index.js";
import {
  cloverRecordedProposer,
  cloverRecordedReviewRules,
  cloverInferenceTopics,
  misleadingHighConfidenceProposer,
  paysafeRecordedProposer,
  paysafeRecordedReviewRules,
  paysafeInferenceTopics,
  unavailableRecordedProposer,
  vortaxRecordedProposer,
  vortaxRecordedReviewRules,
  vortaxInferenceTopics,
  wellsRecordedProposer,
  wellsRecordedReviewRules,
  wellsInferenceTopics,
} from "./fixtures/reconstructionKernel/recordedHypothesisProposals.js";
import { realStatementReplayCases } from "./fixtures/reconstructionKernel/realStatementReplay.js";

type CaseId = "clover-duplicate-resubmission" | "paysafe-october-2025" | "wells-fargo-september-2024" | "vortax-september-2022";

interface LoadedCase {
  input: ReconstructionInput;
  bytes: Uint8Array;
  sourceBinding: { sourceDocumentRef: string; sourceContentSha256: string };
}

const loadedCases = new Map<CaseId, LoadedCase>();
const inferenceTopicsByCase: Record<CaseId, InferenceTopic[]> = {
  "clover-duplicate-resubmission": cloverInferenceTopics,
  "paysafe-october-2025": paysafeInferenceTopics,
  "wells-fargo-september-2024": wellsInferenceTopics,
  "vortax-september-2022": vortaxInferenceTopics,
};

function unsupportedAlternativeCoverage(request: Parameters<StatementHypothesisProposer["propose"]>[0]) {
  return request.inferenceTopics.flatMap((topic) => topic.materialAlternatives.map((alternative) => ({
    topicRef: topic.topicRef,
    alternativeRef: alternative.alternativeRef,
    disposition: "not_supported" as const,
    reasonCode: "insufficient_source_evidence" as const,
    rationale: "The supplied source observations are insufficient to support this alternative.",
    observationRefs: topic.observationRefs,
    acknowledgedEvidenceNeedRefs: topic.knownEvidenceGaps.map((gap) => gap.evidenceNeedRef),
  })));
}

function withProviderConfidence(
  proposer: StatementHypothesisProposer,
  confidence: "low" | "medium" | "high",
): StatementHypothesisProposer {
  const providerId = `${proposer.providerId}-${confidence}-confidence-replay`;
  return {
    providerId,
    async propose(request) {
      const response = await proposer.propose(request);
      return {
        ...response,
        providerId,
        hypotheses: response.hypotheses.map((hypothesis) => ({
          ...hypothesis,
          inference: { ...hypothesis.inference, confidence },
        })),
      };
    },
  };
}

function withoutVerificationRequests(proposer: StatementHypothesisProposer): StatementHypothesisProposer {
  const providerId = `${proposer.providerId}-without-verification`;
  return {
    providerId,
    async propose(request) {
      const response = await proposer.propose(request);
      return {
        ...response,
        providerId,
        hypotheses: response.hypotheses.map((hypothesis) => ({
          ...hypothesis,
          inference: { ...hypothesis.inference, verificationRequests: [] },
        })),
      };
    },
  };
}

function weakWellsReferenceReuseOnlyProposer(): StatementHypothesisProposer {
  const providerId = "recorded-evaluation-wells-weak-reference-reuse-only";
  return {
    providerId,
    async propose(request) {
      const response = await wellsRecordedProposer.propose(request);
      const selected = response.hypotheses.find((hypothesis) => hypothesis.id === "reference-reuse-only")!;
      return {
        providerId,
        hypotheses: [{ ...selected }],
        alternativeCoverage: response.alternativeCoverage.map((assessment) =>
          assessment.alternativeRef === selected.alternativeRef
            ? assessment
            : {
                ...assessment,
                disposition: "not_supported" as const,
                reasonCode: "insufficient_source_evidence" as const,
                rationale: "The bounded source evidence does not support selecting this alternative.",
              }),
      };
    },
  };
}

async function loadCase(caseId: CaseId): Promise<LoadedCase> {
  const replayCase = realStatementReplayCases.find((candidate) => candidate.definition.id === caseId)!;
  const [document, bytes] = await Promise.all([parsePdf(replayCase.pdfPath), readFile(replayCase.pdfPath)]);
  const packet = adaptParsedDocumentToObservationPacket(caseId, document);
  const provenance = verifyReplaySourceProvenance(
    { bytes, manifest: replayCase.sourceManifest },
    packet,
    replayCase.definition,
  );
  if (!provenance.verified) throw new Error(provenance.errors.join("\n"));
  const bound = bindReplayObservations(packet, replayCase.definition.bindings);
  if (bound.errors.length > 0) throw new Error(bound.errors.join("\n"));
  return {
    input: { ...structuredClone(replayCase.definition.inputTemplate), observations: bound.observations },
    bytes,
    sourceBinding: {
      sourceDocumentRef: replayCase.pdfPath,
      sourceContentSha256: replayCase.sourceManifest.contentSha256,
    },
  };
}

async function runCase(
  caseId: CaseId,
  proposer: StatementHypothesisProposer,
  reviewRules: RecordedProposalReviewRule[],
  persistedVerifiedInferenceEvidence: VerifiedInferenceEvidence[] = [],
): Promise<RecordedHypothesisExperimentResult> {
  const loaded = loadedCases.get(caseId)!;
  return runRecordedHypothesisExperiment({
    reconstructionInput: loaded.input,
    sourceBinding: loaded.sourceBinding,
    sourceBytes: loaded.bytes,
    proposer,
    inferenceTopics: inferenceTopicsByCase[caseId],
    reviewRules,
    persistedVerifiedInferenceEvidence,
  });
}

beforeAll(async () => {
  for (const caseId of [
    "clover-duplicate-resubmission",
    "paysafe-october-2025",
    "wells-fargo-september-2024",
    "vortax-september-2022",
  ] as const) {
    loadedCases.set(caseId, await loadCase(caseId));
  }
}, 30_000);

describe("recorded, source-bound AI hypothesis experiment", () => {
  it("represents Clover as a strong reject/resubmission inference without confirming lifecycle identity", async () => {
    const result = await runCase(
      "clover-duplicate-resubmission",
      cloverRecordedProposer,
      cloverRecordedReviewRules,
    );

    expect(result.status).toBe("evaluated");
    expect(result.errors).toEqual([]);
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.canonicalTruthAfter).toBe(result.canonicalTruthBefore);
    expect(result.augmented.canonicalClaims.some((claim) => claim.key === "batches.same_lifecycle")).toBe(false);
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "likely-reject-resubmission" }),
      state: "viable_unresolved",
      interpretationState: "strong_inference",
      providerReportedConfidence: "high",
      qualifiedInferenceStrength: "strong",
      evidenceClass: "compatibility_only",
      alternativeCoverage: "non_exhaustive",
      verificationResults: [expect.objectContaining({
        requestId: "verify-second-row-pair",
        candidateId: "clover.second-reject-to-second-submission",
        validationState: "accepted",
        controlState: "pass",
        classification: "supporting",
        componentResults: [
          { component: "amount_equality", state: "pass" },
          { component: "count_equality", state: "pass" },
          { component: "temporal_order", state: "pass" },
        ],
      })],
    }));
    expect(result.baseline.controlResults.some((control) => [
      "clover.second.amounts.match", "clover.second.counts.match", "clover.second.time.ordered",
      "clover.second.lifecycle.valid",
    ].includes(control.controlId))).toBe(false);
    expect(result.baseline.hypothesisResults.filter((hypothesis) =>
      hypothesis.ownership.kind === "provider")).toEqual([]);
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "separate-batches-remain-possible" }),
      interpretationState: "unknown_or_competing_interpretations",
      providerReportedConfidence: "medium",
      qualifiedInferenceStrength: "unknown_competing",
    }));
    expect(result.proposalReviews.map((review) => review.utility)).toEqual([
      "existing_interpretation_explained",
      "existing_interpretation_explained",
    ]);
    expect(result.proposalReviews.every((review) => review.proofObligationsValidated)).toBe(true);
    expect(result.allMaterialAlternativesAddressed).toBe(true);
    expect(result.unknownAlternativeRetainedForEveryProviderGroup).toBe(true);
    expect(result.inferencePresentations).toEqual([expect.objectContaining({
      topicId: "clover.duplicate-resubmission",
      authority: "non_authoritative_inference_presentation",
      merchantConclusion: {
        state: "leading_interpretation",
        text: "The rejected rows and later submitted rows belong to the same lifecycle.",
        alternativeId: "clover.same-lifecycle",
        qualifiedInferenceStrength: "strong",
      },
      resolutionEvidenceNeeds: [expect.objectContaining({
        evidenceNeedId: "clover.batch-identity",
        proofObligations: [expect.objectContaining({
          proofObligationId: "stable-row-identity-linkage",
          missingProperty: "stable_identity_link",
        })],
      })],
    })]);

    const withoutVerification = await runCase(
      "clover-duplicate-resubmission",
      withoutVerificationRequests(cloverRecordedProposer),
      cloverRecordedReviewRules,
    );
    expect(withoutVerification.status).toBe("provider_rejected");
    expect(withoutVerification.errors.join(" ")).toContain("must select exactly one candidate for required verification");
    expect(withoutVerification.canonicalTruthAfter).toBe(result.canonicalTruthAfter);
  });

  it("adds two genuinely new, appropriately uncertain explanations for the PaySafe one-cent fee gap", async () => {
    const result = await runCase(
      "paysafe-october-2025",
      paysafeRecordedProposer,
      paysafeRecordedReviewRules,
    );

    expect(result.status).toBe("evaluated");
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.proposalReviews.map((review) => review.utility)).toEqual([
      "new_competing_interpretation",
      "new_competing_interpretation",
    ]);
    expect(result.proposalReviews.every((review) => review.confidenceWithinReviewCeiling)).toBe(true);
    expect(result.augmented.hypothesisResults.filter((hypothesis) =>
      hypothesis.ownership.kind === "provider").every((hypothesis) =>
      hypothesis.interpretationState === "weak_inference")).toBe(true);
    expect(result.augmented.canonicalClaims.some((claim) => claim.key === "fees.visible_gap_explanation")).toBe(false);
    expect(result.explanatoryWorldCountAfter).toBeGreaterThan(result.explanatoryWorldCountBefore);
    expect(result.unknownAlternativeRetainedForEveryProviderGroup).toBe(true);
    expect(result.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "unresolved",
      text: UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
      alternativeId: null,
      qualifiedInferenceStrength: "unknown_competing",
    });
    expect(result.inferencePresentations[0]?.internalHypotheses.map((hypothesis) =>
      hypothesis.qualifiedInferenceStrength)).toEqual(["weak", "weak"]);
    expect(result.inferencePresentations[0]?.resolutionEvidenceNeeds[0]).toEqual(expect.objectContaining({
      evidenceNeedId: "paysafe.fee-cent-gap",
      proofObligations: expect.arrayContaining([
        expect.objectContaining({ resolutionEvidenceKinds: expect.arrayContaining(["processor_rounding_method"]) }),
        expect.objectContaining({ resolutionEvidenceKinds: expect.arrayContaining(["complete_fee_detail"]) }),
      ]),
    }));
  });

  it("finds Wells Fargo proposals explanatory but not novel and keeps lifecycle unresolved", async () => {
    let offeredCandidateDescriptions: string[] = [];
    const inspectingProposer: StatementHypothesisProposer = {
      providerId: wellsRecordedProposer.providerId,
      async propose(request) {
        offeredCandidateDescriptions = request.inferenceTopics.flatMap((topic) =>
          topic.verificationChecks.flatMap((check) => check.candidates.map((candidate) => candidate.description)));
        return wellsRecordedProposer.propose(request);
      },
    };
    const result = await runCase(
      "wells-fargo-september-2024",
      inspectingProposer,
      wellsRecordedReviewRules,
    );

    expect(result.status).toBe("evaluated");
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.proposalReviews.map((review) => review.utility)).toEqual([
      "existing_interpretation_explained",
      "existing_interpretation_explained",
    ]);
    expect(result.proposalReviews.every((review) => review.confidenceWithinReviewCeiling)).toBe(true);
    expect(offeredCandidateDescriptions.some((description) => description.includes("sales-tax adjustment"))).toBe(false);
    expect(offeredCandidateDescriptions).toHaveLength(2);
    expect(result.augmented.canonicalClaims.some((claim) => claim.key === "shipping_tax.same_lifecycle")).toBe(false);
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "related-tax-amendment" }),
      qualifiedInferenceStrength: "weak",
      verificationResults: [],
      evidencePosture: expect.objectContaining({
        independentSupportGroups: [expect.objectContaining({
          independenceGroupId: "wells.shared-source-reference",
        })],
      }),
    }));
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "reference-reuse-only" }),
      qualifiedInferenceStrength: "weak",
    }));
    expect(result.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "unresolved",
      text: UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
      alternativeId: null,
      qualifiedInferenceStrength: "unknown_competing",
    });
    expect(result.alternativeEvidencePostures).toContainEqual(expect.objectContaining({
      alternativeId: "wells.same-lifecycle",
      baseStrength: "weak",
      qualifiedStrength: "weak",
      providerProposalRequired: false,
    }));

    const weakOnly = await runCase(
      "wells-fargo-september-2024",
      weakWellsReferenceReuseOnlyProposer(),
      wellsRecordedReviewRules.filter((rule) => rule.proposalId === "reference-reuse-only"),
    );
    expect(weakOnly.status).toBe("evaluated");
    expect(weakOnly.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "unresolved",
      text: UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
      alternativeId: null,
      qualifiedInferenceStrength: "unknown_competing",
    });
    expect(weakOnly.inferencePresentations[0]?.internalHypotheses).toEqual([
      expect.objectContaining({
        proposalId: "reference-reuse-only",
        qualifiedInferenceStrength: "weak",
        eligibleForLeadingConclusion: false,
      }),
    ]);
    expect(weakOnly.inferencePresentations[0]?.resolutionEvidenceNeeds[0]).toEqual(expect.objectContaining({
      evidenceNeedId: "wells.shipping-tax-order",
      proofObligations: [expect.objectContaining({
        missingProperty: "row_level_temporal_link",
        resolutionEvidenceKinds: ["row_level_date", "explicit_temporal_relation"],
      })],
    }));
    expect(weakOnly.canonicalTruthAfter).toBe(result.canonicalTruthAfter);
  });

  it("retains source-bound verified evidence when a later provider call fails", async () => {
    const learned = await runCase(
      "clover-duplicate-resubmission",
      cloverRecordedProposer,
      cloverRecordedReviewRules,
    );
    expect(learned.verifiedInferenceEvidence).toContainEqual(expect.objectContaining({
      topicId: "clover.duplicate-resubmission",
      alternativeId: "clover.same-lifecycle",
      verification: expect.objectContaining({
        candidateId: "clover.second-reject-to-second-submission",
      }),
    }));

    const providerFailure = await runCase(
      "clover-duplicate-resubmission",
      unavailableRecordedProposer,
      [],
      learned.verifiedInferenceEvidence,
    );

    expect(providerFailure.status).toBe("provider_rejected");
    expect(providerFailure.acceptedProviderHypotheses).toEqual([]);
    expect(providerFailure.inferencePresentations[0]?.internalHypotheses).toEqual([]);
    expect(providerFailure.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "leading_interpretation",
      text: "The rejected rows and later submitted rows belong to the same lifecycle.",
      alternativeId: "clover.same-lifecycle",
      qualifiedInferenceStrength: "strong",
    });
    expect(providerFailure.canonicalTruthInvariant).toBe(true);

    const wrongSourceEvidence = structuredClone(learned.verifiedInferenceEvidence);
    wrongSourceEvidence[0]!.sourceContentSha256 = "0".repeat(64);
    const rejectedEvidence = await runCase(
      "clover-duplicate-resubmission",
      unavailableRecordedProposer,
      [],
      wrongSourceEvidence,
    );
    expect(rejectedEvidence.status).toBe("source_rejected");
    expect(rejectedEvidence.errors.join(" ")).toContain("different source fingerprint");
    expect(rejectedEvidence.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "leading_interpretation",
      text: "The rejected rows and later submitted rows belong to the same lifecycle.",
      alternativeId: "clover.same-lifecycle",
      qualifiedInferenceStrength: "moderate",
    });
  });

  it("replays all four approved evidence packets identically across low, medium, and high provider confidence", async () => {
    const cases = [
      {
        caseId: "clover-duplicate-resubmission" as const,
        proposer: cloverRecordedProposer,
        rules: cloverRecordedReviewRules,
        expected: { "likely-reject-resubmission": "strong", "separate-batches-remain-possible": "unknown_competing" },
      },
      {
        caseId: "paysafe-october-2025" as const,
        proposer: paysafeRecordedProposer,
        rules: paysafeRecordedReviewRules,
        expected: { "display-rounding-gap": "weak", "unobserved-fee-component": "weak" },
      },
      {
        caseId: "wells-fargo-september-2024" as const,
        proposer: wellsRecordedProposer,
        rules: wellsRecordedReviewRules,
        expected: { "related-tax-amendment": "weak", "reference-reuse-only": "weak" },
      },
      {
        caseId: "vortax-september-2022" as const,
        proposer: vortaxRecordedProposer,
        rules: vortaxRecordedReviewRules,
        expected: { "rows-linked": "weak", "count-correlation-only": "weak" },
      },
    ];

    for (const item of cases) {
      let firstPresentationProjection: string | undefined;
      for (const confidence of ["low", "medium", "high"] as const) {
        const result = await runCase(item.caseId, withProviderConfidence(item.proposer, confidence), item.rules);
        const actual = Object.fromEntries(result.augmented.hypothesisResults
          .filter((hypothesis) => hypothesis.ownership.kind === "provider")
          .map((hypothesis) => [
            hypothesis.ownership.kind === "provider" ? hypothesis.ownership.proposalId : hypothesis.id,
            hypothesis.qualifiedInferenceStrength,
          ]));
        expect(actual).toEqual(item.expected);
        expect(result.augmented.hypothesisResults
          .filter((hypothesis) => hypothesis.ownership.kind === "provider")
          .every((hypothesis) => hypothesis.providerReportedConfidence === confidence
            && hypothesis.evidencePosture?.providerConfidenceUsed === false)).toBe(true);
        expect(result.canonicalTruthInvariant).toBe(true);
        expect(result.inferencePresentations.every((presentation) =>
          presentation.internalHypotheses.every((hypothesis) =>
            hypothesis.qualifiedInferenceStrength === item.expected[hypothesis.proposalId as keyof typeof item.expected]))).toBe(true);
        const presentationProjection = JSON.stringify(result.inferencePresentations.map((presentation) => ({
          merchantConclusion: presentation.merchantConclusion,
          resolutionEvidenceNeeds: presentation.resolutionEvidenceNeeds,
          reasonCodes: presentation.reasonCodes,
        })));
        firstPresentationProjection ??= presentationProjection;
        expect(presentationProjection).toBe(firstPresentationProjection);
      }
    }
  });

  it("keeps VORTAX row linkage weak and unresolved because identity proof and page 11 are missing", async () => {
    const result = await runCase(
      "vortax-september-2022",
      vortaxRecordedProposer,
      vortaxRecordedReviewRules,
    );

    expect(result.status).toBe("evaluated");
    expect(result.errors).toEqual([]);
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.canonicalTruthAfter).toBe(result.canonicalTruthBefore);
    expect(result.allMaterialAlternativesAddressed).toBe(true);
    expect(result.proposalReviews.every((review) => review.proofObligationsValidated)).toBe(true);
    expect(result.augmented.canonicalClaims.some((claim) => claim.key === "adjustments.chargebacks.row_linked")).toBe(false);
    expect(result.augmented.hypothesisResults.filter((hypothesis) =>
      hypothesis.ownership.kind === "provider").every((hypothesis) =>
      hypothesis.qualifiedInferenceStrength === "weak"
      && hypothesis.qualificationReasonCodes?.includes("source_proven_incomplete") === true)).toBe(true);
    expect(result.unknownAlternativeRetainedForEveryProviderGroup).toBe(true);
    expect(result.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "unresolved",
      text: UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
      alternativeId: null,
      qualifiedInferenceStrength: "unknown_competing",
    });
    expect(result.inferencePresentations[0]?.resolutionEvidenceNeeds[0]).toEqual(expect.objectContaining({
      evidenceNeedId: "vortax.obtain-missing-page",
      proofObligations: expect.arrayContaining([
        expect.objectContaining({ resolutionEvidenceKinds: ["complete_source_document"] }),
      ]),
    }));
  });

  it("reconciles provider and deterministic alternatives under RateReveal-owned topics", async () => {
    const clover = await runCase(
      "clover-duplicate-resubmission",
      cloverRecordedProposer,
      cloverRecordedReviewRules,
    );
    const wells = await runCase(
      "wells-fargo-september-2024",
      wellsRecordedProposer,
      wellsRecordedReviewRules,
    );
    const paysafe = await runCase(
      "paysafe-october-2025",
      paysafeRecordedProposer,
      paysafeRecordedReviewRules,
    );

    expect(clover.crossOriginContradictionWorldCount).toBe(0);
    expect(wells.crossOriginContradictionWorldCount).toBe(0);
    expect(paysafe.crossOriginContradictionWorldCount).toBe(0);
    expect(clover.canonicalTruthInvariant).toBe(true);
    expect(wells.canonicalTruthInvariant).toBe(true);
  });

  it("keeps a structured high-confidence answer weak when it omits the material evidence acknowledgement", async () => {
    const rule: RecordedProposalReviewRule = {
      proposalId: "unsupported-high-confidence-answer",
      expectedClaims: [{ key: "batches.same_lifecycle", value: true }],
      confidenceCeiling: "medium",
      requiredProofObligationIds: ["stable-row-identity-linkage"],
    };
    const result = await runCase(
      "clover-duplicate-resubmission",
      misleadingHighConfidenceProposer("clover"),
      [rule],
    );

    expect(result.status).toBe("evaluated");
    expect(result.proposalReviews).toEqual([expect.objectContaining({
      proposalId: "unsupported-high-confidence-answer",
      utility: "weak_or_misleading",
      proofObligationsValidated: true,
      confidenceWithinReviewCeiling: false,
    })]);
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "unsupported-high-confidence-answer" }),
      interpretationState: "weak_inference",
      providerReportedConfidence: "high",
      qualifiedInferenceStrength: "weak",
      qualificationReasonCodes: expect.arrayContaining(["material_proof_gap_not_acknowledged"]),
    }));
    expect(result.canonicalTruthInvariant).toBe(true);
  });

  it("fails closed on changed source bytes and never invokes the recorded proposer", async () => {
    const loaded = loadedCases.get("clover-duplicate-resubmission")!;
    const bytes = Uint8Array.from(loaded.bytes);
    bytes[bytes.length - 1] ^= 1;
    let invoked = false;
    const proposer: StatementHypothesisProposer = {
      providerId: "must-not-run",
      async propose(request) {
        invoked = true;
        return { providerId: "must-not-run", hypotheses: [], alternativeCoverage: unsupportedAlternativeCoverage(request) };
      },
    };
    const result = await runRecordedHypothesisExperiment({
      reconstructionInput: loaded.input,
      sourceBinding: loaded.sourceBinding,
      sourceBytes: bytes,
      proposer,
      inferenceTopics: cloverInferenceTopics,
    });

    expect(result.status).toBe("source_rejected");
    expect(invoked).toBe(false);
    expect(result.acceptedProviderHypotheses).toEqual([]);
    expect(result.canonicalTruthInvariant).toBe(true);
  });

  it("keeps canonical truth byte-identical when the recorded provider fails", async () => {
    const result = await runCase(
      "paysafe-october-2025",
      unavailableRecordedProposer,
      [],
    );

    expect(result.status).toBe("provider_rejected");
    expect(result.errors.join(" ")).toContain("deterministic reconstruction remains authoritative");
    expect(result.canonicalTruthAfter).toBe(result.canonicalTruthBefore);
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.inferencePresentations[0]?.merchantConclusion.text).toBe(
      UNRESOLVED_MERCHANT_INFERENCE_CONCLUSION,
    );
  });

  it("does not change the five-fact Kernel authority allowlist", () => {
    expect(RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS).toEqual([
      "grossSaleVolume",
      "refundVolume",
      "grossSaleTransactionCount",
      "refundTransactionCount",
      "submittedTransactionCount",
    ]);
  });

  it("puts exact approved row text, page, section, and row identity in the offline proposal packet", async () => {
    const loaded = loadedCases.get("clover-duplicate-resubmission")!;
    let observedPacket = "";
    const proposer: StatementHypothesisProposer = {
      providerId: "recorded-context-inspector",
      async propose(request) {
        observedPacket = JSON.stringify(request);
        return {
          providerId: "recorded-context-inspector",
          hypotheses: [],
          alternativeCoverage: unsupportedAlternativeCoverage(request),
        };
      },
    };
    const result = await runRecordedHypothesisExperiment({
      reconstructionInput: loaded.input,
      sourceBinding: loaded.sourceBinding,
      sourceBytes: loaded.bytes,
      proposer,
      inferenceTopics: cloverInferenceTopics,
    });

    expect(result.status).toBe("evaluated");
    expect(observedPacket).toContain("ELECTRONIC DEPOSIT REJECTS");
    expect(observedPacket).toContain("source-row-");
    expect(observedPacket).toContain("adjustments");
    expect(observedPacket).toMatch(/\"page\":\d+/);
    expect(observedPacket).not.toContain("clover.rejected.amount");
    expect(result.inferencePresentations[0]?.merchantConclusion).toEqual({
      state: "leading_interpretation",
      text: "The rejected rows and later submitted rows belong to the same lifecycle.",
      alternativeId: "clover.same-lifecycle",
      qualifiedInferenceStrength: "moderate",
    });
  });
});
