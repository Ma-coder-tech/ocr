import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS } from "../src/canonical/v2/kernelAuthorityContract.js";
import { parsePdf } from "../src/parser.js";
import {
  adaptParsedDocumentToObservationPacket,
  bindReplayObservations,
  runRecordedHypothesisExperiment,
  verifyReplaySourceProvenance,
  type ReconstructionInput,
  type InferenceTopic,
  type RecordedHypothesisExperimentResult,
  type RecordedProposalReviewRule,
  type StatementHypothesisProposer,
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
): Promise<RecordedHypothesisExperimentResult> {
  const loaded = loadedCases.get(caseId)!;
  return runRecordedHypothesisExperiment({
    reconstructionInput: loaded.input,
    sourceBinding: loaded.sourceBinding,
    sourceBytes: loaded.bytes,
    proposer,
    inferenceTopics: inferenceTopicsByCase[caseId],
    reviewRules,
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
    }));
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
  });

  it("finds Wells Fargo proposals explanatory but not novel and keeps lifecycle unresolved", async () => {
    const result = await runCase(
      "wells-fargo-september-2024",
      wellsRecordedProposer,
      wellsRecordedReviewRules,
    );

    expect(result.status).toBe("evaluated");
    expect(result.canonicalTruthInvariant).toBe(true);
    expect(result.proposalReviews.map((review) => review.utility)).toEqual([
      "existing_interpretation_explained",
      "existing_interpretation_explained",
    ]);
    expect(result.proposalReviews.every((review) => review.confidenceWithinReviewCeiling)).toBe(true);
    expect(result.augmented.canonicalClaims.some((claim) => claim.key === "shipping_tax.same_lifecycle")).toBe(false);
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "related-tax-amendment" }),
      qualifiedInferenceStrength: "moderate",
    }));
    expect(result.augmented.hypothesisResults).toContainEqual(expect.objectContaining({
      ownership: expect.objectContaining({ proposalId: "reference-reuse-only" }),
      qualifiedInferenceStrength: "weak",
    }));
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
        expected: { "related-tax-amendment": "moderate", "reference-reuse-only": "weak" },
      },
      {
        caseId: "vortax-september-2022" as const,
        proposer: vortaxRecordedProposer,
        rules: vortaxRecordedReviewRules,
        expected: { "rows-linked": "weak", "count-correlation-only": "weak" },
      },
    ];

    for (const item of cases) {
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
  });
});
