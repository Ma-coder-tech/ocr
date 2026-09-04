import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION,
  LIVE_INFERENCE_EVIDENCE_AUDIT_VERSION,
  buildLiveHypothesisEvaluationRecord,
  liveHypothesisEvaluationPayloadSha256,
  replayLiveInferenceEvidenceAudit,
  runRecordedHypothesisExperiment,
  validateVerifiedInferenceEvidence,
  type HypothesisProposalRequest,
  type ImmutableLiveHypothesisEvaluationRecord,
  type LiveProviderAttemptAudit,
  type LiveProviderPrivacyConfiguration,
  type RecordedHypothesisExperimentResult,
  type StatementHypothesisProposer,
} from "../src/reconstructionKernel/index.js";
import {
  cloverInferenceTopics,
  cloverRecordedProposer,
  cloverRecordedReviewRules,
} from "./fixtures/reconstructionKernel/recordedHypothesisProposals.js";
import { cloverDuplicateResubmission } from "./fixtures/reconstructionKernel/rescueCorpus.js";

const sourceBytes = Buffer.from("approved-source-bound-statement-for-evidence-audit-v1");
const sourceContentSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const sourceDocumentRef = "approved-evaluation-document:generic-evidence-audit";

const privacy: LiveProviderPrivacyConfiguration = {
  verifiedAt: "2026-09-05T00:00:00.000Z",
  verificationBasis: ["offline-test"],
  trainingUse: "api_inputs_not_used_to_train_by_default_unless_organization_explicitly_opts_in",
  responseStorage: "disabled_store_false",
  promptCacheRetention: "provider_default_in_memory",
  abuseMonitoringRetention: "up_to_30_days_unless_organization_has_approved_modified_or_zero_data_retention",
  organizationZdrOrMamEnrollment: "not_verified",
  tools: "none",
  conversationState: "none",
  backgroundMode: "disabled",
};

async function buildRecord(selectContradictingCandidate = false): Promise<{
  record: ImmutableLiveHypothesisEvaluationRecord;
  canonicalTruth: string;
  originalMerchantConclusion: RecordedHypothesisExperimentResult["inferencePresentations"][number]["merchantConclusion"];
}> {
  let packet: HypothesisProposalRequest | null = null;
  const proposer: StatementHypothesisProposer = {
    providerId: cloverRecordedProposer.providerId,
    async propose(request) {
      packet = structuredClone(request);
      const response = await cloverRecordedProposer.propose(request);
      if (selectContradictingCandidate) {
        const check = request.inferenceTopics[0]!.verificationChecks[0]!;
        const candidate = check.candidates.find((item) =>
          item.description.startsWith("The first rejected row paired with the second"))!;
        response.hypotheses[0]!.inference.verificationRequests = [{
          requestId: "verify-cross-pair-for-audit",
          verificationRef: check.verificationRef,
          candidateRef: candidate.candidateRef,
        }];
      }
      return response;
    },
  };
  const result = await runRecordedHypothesisExperiment({
    reconstructionInput: structuredClone(cloverDuplicateResubmission),
    sourceBinding: { sourceDocumentRef, sourceContentSha256 },
    sourceBytes,
    proposer,
    inferenceTopics: structuredClone(cloverInferenceTopics),
    reviewRules: structuredClone(cloverRecordedReviewRules),
  });
  if (!packet) throw new Error("The recorded proposer did not receive a source-bound packet.");
  const attempt: LiveProviderAttemptAudit = {
    attemptNumber: 1,
    automaticRetryCount: 0,
    startedAt: "2026-09-05T00:00:00.000Z",
    completedAt: "2026-09-05T00:00:01.000Z",
    endpoint: "offline-recorded-provider",
    exactDeveloperPrompt: "offline-recorded-provider",
    exactSourceBoundPacket: packet,
    exactRequestBody: {},
    httpStatus: 200,
    providerRequestId: "offline-request",
    returnedModel: "offline-recorded-model",
    providerResponseId: "offline-response",
    fullProviderResponse: {},
    normalizedResponse: null,
    outcome: "completed",
    failure: null,
  };
  return {
    record: buildLiveHypothesisEvaluationRecord({
      statementId: cloverDuplicateResubmission.statementId,
      sourceContentSha256,
      topic: cloverInferenceTopics[0]!,
      providerId: proposer.providerId,
      requestedModel: "offline-recorded-model",
      reasoningEffort: "none",
      maxOutputTokens: 0,
      privacy,
      attempt,
      result,
    }),
    canonicalTruth: result.canonicalTruthBefore,
    originalMerchantConclusion: structuredClone(result.inferencePresentations[0]!.merchantConclusion),
  };
}

function rehash(record: ImmutableLiveHypothesisEvaluationRecord): void {
  record.integrity.payloadSha256 = liveHypothesisEvaluationPayloadSha256(record.payload);
}

describe("durable live inference evidence audit", () => {
  it("preserves and independently replays the evidence behind the merchant conclusion", async () => {
    const { record, canonicalTruth, originalMerchantConclusion } = await buildRecord();
    const audit = record.payload.evaluation.rateRevealEvidenceAudit;

    expect(record.payload.recordVersion).toBe(LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION);
    expect(audit.modelVersion).toBe(LIVE_INFERENCE_EVIDENCE_AUDIT_VERSION);
    expect(audit.sourceContentSha256).toBe(sourceContentSha256);
    expect(audit.relevantControlResults.length).toBeGreaterThan(0);
    expect(audit.verifiedInferenceEvidence).toContainEqual(expect.objectContaining({
      sourceContentSha256,
      topicId: "clover.duplicate-resubmission",
      alternativeId: "clover.same-lifecycle",
      verificationResult: expect.objectContaining({
        validationState: "accepted",
        controlState: "pass",
        classification: "supporting",
        componentResults: [
          { component: "amount_equality", state: "pass" },
          { component: "count_equality", state: "pass" },
          { component: "temporal_order", state: "pass" },
        ],
      }),
    }));
    expect(audit.alternativeEvidencePostures).toContainEqual(expect.objectContaining({
      alternativeId: "clover.same-lifecycle",
      qualifiedStrength: "strong",
      unresolvedProofObligationIds: ["stable-row-identity-linkage"],
      providerProposalRequired: false,
      providerConfidenceUsed: false,
    }));
    expect(audit.inferencePresentations[0]?.merchantConclusion).toEqual(originalMerchantConclusion);
    expect(record.payload.evaluation.canonicalTruthBefore).toBe(canonicalTruth);
    expect(record.payload.evaluation.canonicalTruthAfter).toBe(canonicalTruth);

    const replay = replayLiveInferenceEvidenceAudit(record, sourceContentSha256);
    expect(replay.valid).toBe(true);
    expect(replay.errors).toEqual([]);
    expect(replay.alternativeEvidencePostures).toEqual(audit.alternativeEvidencePostures);
    expect(replay.merchantConclusions).toEqual([
      audit.inferencePresentations[0]!.merchantConclusion,
    ]);
  });

  it("detects payload tampering even when the stored conclusion still looks plausible", async () => {
    const { record } = await buildRecord();
    record.payload.evaluation.rateRevealEvidenceAudit.alternativeEvidencePostures[0]!.qualifiedStrength = "moderate";

    const replay = replayLiveInferenceEvidenceAudit(record, sourceContentSha256);
    expect(replay.valid).toBe(false);
    expect(replay.errors).toEqual(expect.arrayContaining([
      "Evaluation record payload integrity hash does not match.",
    ]));
  });

  it("preserves deterministic contradiction evidence as an auditable non-leading posture", async () => {
    const { record } = await buildRecord(true);
    const audit = record.payload.evaluation.rateRevealEvidenceAudit;

    expect(audit.verifiedInferenceEvidence).toContainEqual(expect.objectContaining({
      alternativeId: "clover.same-lifecycle",
      factor: expect.objectContaining({ effect: "contradicts", state: "satisfied" }),
      verificationResult: expect.objectContaining({
        controlState: "fail",
        classification: "contradicting",
      }),
    }));
    expect(audit.alternativeEvidencePostures).toContainEqual(expect.objectContaining({
      alternativeId: "clover.same-lifecycle",
      outcome: "contradicted",
      qualifiedStrength: "unknown_competing",
    }));
    expect(audit.inferencePresentations[0]?.merchantConclusion.state).toBe("unresolved");
    expect(replayLiveInferenceEvidenceAudit(record, sourceContentSha256)).toEqual(expect.objectContaining({
      valid: true,
      errors: [],
    }));
  });

  it.each([
    "empty", "missing", "duplicate", "wrong_recipe", "invalid_state",
    "inverted_effect", "missing_result", "null_component",
  ])("rejects saved verification corruption: %s, even after rehashing", async (mutation) => {
    const { record } = await buildRecord();
    const evidence = record.payload.evaluation.rateRevealEvidenceAudit.verifiedInferenceEvidence;
    const item = evidence[0]!;
    const result = item.verificationResult;
    if (mutation === "empty") result.componentResults = [];
    if (mutation === "missing") result.componentResults.pop();
    if (mutation === "duplicate") result.componentResults[2] = structuredClone(result.componentResults[0]!);
    if (mutation === "wrong_recipe") result.componentResults = [{ component: "identifier_equality", state: "pass" }];
    if (mutation === "invalid_state") (result.componentResults[0] as any).state = "accepted";
    if (mutation === "null_component") (result.componentResults as any[])[0] = null;
    if (mutation === "missing_result") delete (item as any).verificationResult;
    if (mutation === "inverted_effect") {
      item.factor.effect = "contradicts";
      result.evidenceFactor = structuredClone(item.factor);
    }
    expect(validateVerifiedInferenceEvidence({ sourceContentSha256, topics: cloverInferenceTopics, evidence }).length)
      .toBeGreaterThan(0);
    rehash(record);
    const replay = replayLiveInferenceEvidenceAudit(record, sourceContentSha256);
    expect(replay.valid).toBe(false);
    expect(replay.merchantConclusions).toEqual([]);

    const proposer = { providerId: "must-not-run", propose: async () => { throw new Error("must not run"); } };
    const experiment = await runRecordedHypothesisExperiment({
      reconstructionInput: structuredClone(cloverDuplicateResubmission),
      sourceBinding: { sourceDocumentRef, sourceContentSha256 }, sourceBytes,
      inferenceTopics: cloverInferenceTopics, proposer, persistedVerifiedInferenceEvidence: evidence,
    });
    expect(experiment.status).toBe("source_rejected");
    expect(experiment.verifiedInferenceEvidence).toEqual([]);
    expect(experiment.canonicalTruthInvariant).toBe(true);
  });

  it.each([null, {}, { payload: {} }])("fails closed for a truncated record: %j", (record) => {
    expect(replayLiveInferenceEvidenceAudit(record as any)).toEqual(expect.objectContaining({
      valid: false, alternativeEvidencePostures: [], merchantConclusions: [],
    }));
  });

  it("rejects a saved contradiction rewritten as support", async () => {
    const { record } = await buildRecord(true);
    const evidence = record.payload.evaluation.rateRevealEvidenceAudit.verifiedInferenceEvidence;
    expect(evidence[0]!.factor.effect).toBe("contradicts");
    evidence[0]!.factor.effect = "supports";
    evidence[0]!.verificationResult.evidenceFactor = structuredClone(evidence[0]!.factor);
    rehash(record);
    expect(replayLiveInferenceEvidenceAudit(record, sourceContentSha256).valid).toBe(false);
  });

  it("detects source mismatch, missing controls, and a rehashed conclusion rewrite", async () => {
    const { record } = await buildRecord();
    expect(replayLiveInferenceEvidenceAudit(record, "0".repeat(64)).errors)
      .toContain("Evaluation record does not belong to the expected source statement.");

    const missingControl = structuredClone(record);
    missingControl.payload.evaluation.rateRevealEvidenceAudit.relevantControlResults.pop();
    rehash(missingControl);
    expect(replayLiveInferenceEvidenceAudit(missingControl, sourceContentSha256).errors.join(" "))
      .toMatch(/missing required control|do not reproduce/);

    const rewrittenVerification = structuredClone(record);
    rewrittenVerification.payload.evaluation.rateRevealEvidenceAudit
      .verifiedInferenceEvidence[0]!.verificationResult.componentResults[0]!.state = "fail";
    rehash(rewrittenVerification);
    expect(replayLiveInferenceEvidenceAudit(rewrittenVerification, sourceContentSha256).errors.join(" "))
      .toContain("does not match its RateReveal-owned verification recipe and candidate");

    const rewrittenConclusion = structuredClone(record);
    rewrittenConclusion.payload.evaluation.rateRevealEvidenceAudit.inferencePresentations[0]!.merchantConclusion = {
      state: "unresolved",
      text: "We cannot tell which explanation is more likely yet.",
      alternativeId: null,
      qualifiedInferenceStrength: "unknown_competing",
    };
    rehash(rewrittenConclusion);
    expect(replayLiveInferenceEvidenceAudit(rewrittenConclusion, sourceContentSha256).errors)
      .toContain("Recorded merchant conclusion does not reproduce from the preserved evidence posture.");

    const missingAudit = structuredClone(record) as unknown as {
      payload: { evaluation: { rateRevealEvidenceAudit?: unknown } };
      integrity: ImmutableLiveHypothesisEvaluationRecord["integrity"];
    };
    delete missingAudit.payload.evaluation.rateRevealEvidenceAudit;
    expect(replayLiveInferenceEvidenceAudit(
      missingAudit as unknown as ImmutableLiveHypothesisEvaluationRecord,
      sourceContentSha256,
    ).errors).toContain("Evaluation record has no durable RateReveal inference evidence audit.");
  });
});
