import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  evaluateAlternativeEvidencePostures,
  validateVerifiedInferenceEvidence,
} from "./alternativeEvidencePosture.js";
import {
  replayMerchantInferenceConclusion,
  type InferencePresentation,
  type MerchantInferenceConclusion,
} from "./inferencePresentation.js";
import type { LiveProviderAttemptAudit } from "./liveHypothesisProvider.js";
import type { RecordedHypothesisExperimentResult } from "./recordedHypothesisExperiment.js";
import type {
  ControlResult,
  InferenceTopic,
  RateRevealAlternativeEvidencePosture,
  VerifiedInferenceEvidence,
} from "./types.js";

export const LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION = "ratereveal-live-hypothesis-evaluation-record-v8" as const;
export const LIVE_INFERENCE_TOPIC_REGISTRY_VERSION = "ratereveal-approved-topic-registry-v6" as const;
export const LIVE_INFERENCE_EVIDENCE_AUDIT_VERSION = "ratereveal-inference-evidence-audit-v1" as const;

export interface LiveProviderPrivacyConfiguration {
  verifiedAt: string;
  verificationBasis: string[];
  trainingUse: "api_inputs_not_used_to_train_by_default_unless_organization_explicitly_opts_in";
  responseStorage: "disabled_store_false";
  promptCacheRetention: "provider_default_in_memory";
  abuseMonitoringRetention: "up_to_30_days_unless_organization_has_approved_modified_or_zero_data_retention";
  organizationZdrOrMamEnrollment: "not_verified" | "modified_abuse_monitoring" | "zero_data_retention";
  tools: "none";
  conversationState: "none";
  backgroundMode: "disabled";
}

export interface LiveHypothesisEvaluationRecordPayload {
  recordVersion: typeof LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION;
  supersedesIntegritySha256?: string;
  createdAt: string;
  evaluationOnly: true;
  approvedDocument: {
    statementId: string;
    sourceContentSha256: string;
    sourceDocumentRef: string;
    pdfTransmitted: false;
    merchantIdentityTransmitted: false;
    merchantLocationTransmitted: false;
    publicMerchantResearchUsed: false;
  };
  topicRegistry: {
    version: typeof LIVE_INFERENCE_TOPIC_REGISTRY_VERSION;
    exactTopic: InferenceTopic;
    providerCreatedTopicsAllowed: false;
  };
  provider: {
    providerId: string;
    requestedModel: string;
    returnedModel: string | null;
    endpoint: string;
    reasoningEffort: string;
    maxOutputTokens: number;
    privacy: LiveProviderPrivacyConfiguration;
  };
  invocation: LiveProviderAttemptAudit;
  evaluation: {
    status: RecordedHypothesisExperimentResult["status"];
    errors: string[];
    canonicalTruthBefore: string;
    canonicalTruthAfter: string;
    canonicalTruthInvariant: boolean;
    acceptedProviderHypotheses: RecordedHypothesisExperimentResult["acceptedProviderHypotheses"];
    alternativeCoverage: RecordedHypothesisExperimentResult["alternativeCoverage"];
    allMaterialAlternativesAddressed: boolean;
    providerAndQualifiedConfidence: Array<{
      proposalId: string;
      providerReportedConfidence: string | null;
      qualifiedInferenceStrength: string | null;
      qualificationReasonCodes: string[];
      evidencePosture: RecordedHypothesisExperimentResult["augmented"]["hypothesisResults"][number]["evidencePosture"] | null;
      verificationResults: RecordedHypothesisExperimentResult["augmented"]["hypothesisResults"][number]["verificationResults"];
      rationale: string | null;
      missingProof: string[];
      requiredMaterialEvidenceNeedIds: string[];
      acknowledgedEvidenceNeedIds: string[];
      unacknowledgedMaterialEvidenceNeedIds: string[];
      proofObligationBindings: NonNullable<RecordedHypothesisExperimentResult["acceptedProviderHypotheses"][number]["inference"]>["proofObligationBindings"];
      proofObligationValidation: NonNullable<RecordedHypothesisExperimentResult["acceptedProviderHypotheses"][number]["inference"]>["proofObligationValidation"] | null;
      competingAlternativeProposalIds: string[];
      strongInferenceExplanation: {
        whyStrong: string;
        competingAlternativeProposalIds: string[];
        missingForConfirmation: string[];
      } | null;
      claims: Array<{ key: string; value: unknown }>;
    }>;
    proposalReviews: RecordedHypothesisExperimentResult["proposalReviews"];
    unknownAlternativeRetainedForEveryProviderGroup: boolean;
    explanatoryWorldCountBefore: number;
    explanatoryWorldCountAfter: number;
    crossOriginContradictionWorldCount: number;
    rateRevealEvidenceAudit: {
      modelVersion: typeof LIVE_INFERENCE_EVIDENCE_AUDIT_VERSION;
      sourceContentSha256: string;
      topicId: string;
      relevantControlResults: ControlResult[];
      verifiedInferenceEvidence: VerifiedInferenceEvidence[];
      alternativeEvidencePostures: RateRevealAlternativeEvidencePosture[];
      inferencePresentations: InferencePresentation[];
      providerProposalRequiredForPresentation: false;
      providerConfidenceUsedForQualification: false;
      canonicalAuthorityGranted: false;
    };
  };
}

export interface ImmutableLiveHypothesisEvaluationRecord {
  integrity: {
    algorithm: "sha256";
    payloadSha256: string;
  };
  payload: LiveHypothesisEvaluationRecordPayload;
}

export interface LiveInferenceEvidenceAuditReplay {
  valid: boolean;
  errors: string[];
  sourceContentSha256: string;
  alternativeEvidencePostures: RateRevealAlternativeEvidencePosture[];
  merchantConclusions: MerchantInferenceConclusion[];
}

export function buildLiveHypothesisEvaluationRecord(input: {
  statementId: string;
  sourceContentSha256: string;
  topic: InferenceTopic;
  providerId: string;
  requestedModel: string;
  reasoningEffort: string;
  maxOutputTokens: number;
  privacy: LiveProviderPrivacyConfiguration;
  attempt: LiveProviderAttemptAudit;
  result: RecordedHypothesisExperimentResult;
}): ImmutableLiveHypothesisEvaluationRecord {
  const providerResults = new Map(input.result.augmented.hypothesisResults
    .filter((item) => item.ownership.kind === "provider")
    .map((item) => [item.ownership.kind === "provider" ? item.ownership.proposalId : item.hypothesisId, item]));
  const relevantControlIds = topicRelevantControlIds(input.topic);
  const relevantControlResults = input.result.augmented.controlResults
    .filter((result) => relevantControlIds.has(result.controlId))
    .map((result) => structuredClone(result))
    .sort((left, right) => left.controlId.localeCompare(right.controlId));
  const payload: LiveHypothesisEvaluationRecordPayload = {
    recordVersion: LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION,
    createdAt: input.attempt.completedAt,
    evaluationOnly: true,
    approvedDocument: {
      statementId: input.statementId,
      sourceContentSha256: input.sourceContentSha256,
      sourceDocumentRef: input.attempt.exactSourceBoundPacket.sourceDocument.sourceDocumentRef,
      pdfTransmitted: false,
      merchantIdentityTransmitted: false,
      merchantLocationTransmitted: false,
      publicMerchantResearchUsed: false,
    },
    topicRegistry: {
      version: LIVE_INFERENCE_TOPIC_REGISTRY_VERSION,
      exactTopic: structuredClone(input.topic),
      providerCreatedTopicsAllowed: false,
    },
    provider: {
      providerId: input.providerId,
      requestedModel: input.requestedModel,
      returnedModel: input.attempt.returnedModel,
      endpoint: input.attempt.endpoint,
      reasoningEffort: input.reasoningEffort,
      maxOutputTokens: input.maxOutputTokens,
      privacy: structuredClone(input.privacy),
    },
    invocation: structuredClone(input.attempt),
    evaluation: {
      status: input.result.status,
      errors: structuredClone(input.result.errors),
      canonicalTruthBefore: input.result.canonicalTruthBefore,
      canonicalTruthAfter: input.result.canonicalTruthAfter,
      canonicalTruthInvariant: input.result.canonicalTruthInvariant,
      acceptedProviderHypotheses: structuredClone(input.result.acceptedProviderHypotheses),
      alternativeCoverage: structuredClone(input.result.alternativeCoverage),
      allMaterialAlternativesAddressed: input.result.allMaterialAlternativesAddressed,
      providerAndQualifiedConfidence: input.result.acceptedProviderHypotheses.map((hypothesis) => {
        const proposalId = hypothesis.ownership.kind === "provider" ? hypothesis.ownership.proposalId : hypothesis.id;
        const qualified = providerResults.get(proposalId);
        const requiredMaterialEvidenceNeedIds = structuredClone(input.topic.qualification.materialEvidenceNeedIds);
        const acknowledgedEvidenceNeedIds = structuredClone(hypothesis.inference?.acknowledgedEvidenceNeedIds ?? []);
        const acknowledged = new Set(acknowledgedEvidenceNeedIds);
        const competingAlternativeProposalIds = [
          ...input.result.acceptedProviderHypotheses
            .filter((candidate) => candidate.groupId === hypothesis.groupId && candidate.id !== hypothesis.id)
            .map((candidate) => candidate.ownership.kind === "provider" ? candidate.ownership.proposalId : candidate.id),
          "implicit-unknown-or-unmodelled-alternative",
        ];
        return {
          proposalId,
          providerReportedConfidence: hypothesis.inference?.confidence ?? null,
          qualifiedInferenceStrength: qualified?.qualifiedInferenceStrength ?? null,
          qualificationReasonCodes: structuredClone(qualified?.qualificationReasonCodes ?? []),
          evidencePosture: structuredClone(qualified?.evidencePosture ?? null),
          verificationResults: structuredClone(qualified?.verificationResults ?? []),
          rationale: hypothesis.inference?.rationale ?? null,
          missingProof: structuredClone(hypothesis.inference?.missingProof ?? []),
          requiredMaterialEvidenceNeedIds,
          acknowledgedEvidenceNeedIds,
          unacknowledgedMaterialEvidenceNeedIds: requiredMaterialEvidenceNeedIds.filter((id) => !acknowledged.has(id)),
          proofObligationBindings: structuredClone(hypothesis.inference?.proofObligationBindings ?? []),
          proofObligationValidation: structuredClone(hypothesis.inference?.proofObligationValidation ?? null),
          competingAlternativeProposalIds,
          strongInferenceExplanation: qualified?.qualifiedInferenceStrength === "strong" && hypothesis.inference
            ? {
                whyStrong: hypothesis.inference.rationale,
                competingAlternativeProposalIds,
                missingForConfirmation: structuredClone(hypothesis.inference.missingProof),
              }
            : null,
          claims: hypothesis.claims.map((claim) => ({ key: claim.key, value: claim.value })),
        };
      }),
      proposalReviews: structuredClone(input.result.proposalReviews),
      unknownAlternativeRetainedForEveryProviderGroup: input.result.unknownAlternativeRetainedForEveryProviderGroup,
      explanatoryWorldCountBefore: input.result.explanatoryWorldCountBefore,
      explanatoryWorldCountAfter: input.result.explanatoryWorldCountAfter,
      crossOriginContradictionWorldCount: input.result.crossOriginContradictionWorldCount,
      rateRevealEvidenceAudit: {
        modelVersion: LIVE_INFERENCE_EVIDENCE_AUDIT_VERSION,
        sourceContentSha256: input.sourceContentSha256,
        topicId: input.topic.id,
        relevantControlResults,
        verifiedInferenceEvidence: structuredClone(input.result.verifiedInferenceEvidence
          .filter((evidence) => evidence.topicId === input.topic.id)),
        alternativeEvidencePostures: structuredClone(input.result.alternativeEvidencePostures
          .filter((posture) => posture.topicId === input.topic.id)),
        inferencePresentations: structuredClone(input.result.inferencePresentations
          .filter((presentation) => presentation.topicId === input.topic.id)),
        providerProposalRequiredForPresentation: false,
        providerConfidenceUsedForQualification: false,
        canonicalAuthorityGranted: false,
      },
    },
  };
  const record: ImmutableLiveHypothesisEvaluationRecord = {
    integrity: {
      algorithm: "sha256",
      payloadSha256: liveHypothesisEvaluationPayloadSha256(payload),
    },
    payload,
  };
  const replay = replayLiveInferenceEvidenceAudit(record, input.sourceContentSha256);
  if (!replay.valid) {
    throw new Error(`Cannot build invalid live inference evidence audit: ${replay.errors.join(" ")}`);
  }
  return record;
}

export function liveHypothesisEvaluationPayloadSha256(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

/**
 * Validates an immutable v8 record and independently replays its RateReveal
 * alternative postures and merchant conclusions from the preserved evidence.
 */
export function replayLiveInferenceEvidenceAudit(
  record: ImmutableLiveHypothesisEvaluationRecord,
  expectedSourceContentSha256?: string,
): LiveInferenceEvidenceAuditReplay {
  try {
    const replay = replayEvidenceAudit(record, expectedSourceContentSha256);
    return replay.valid ? replay : { ...replay, alternativeEvidencePostures: [], merchantConclusions: [] };
  } catch {
    return {
      valid: false, errors: ["Evaluation record is incomplete or malformed."],
      sourceContentSha256: expectedSourceContentSha256 ?? "",
      alternativeEvidencePostures: [], merchantConclusions: [],
    };
  }
}

function replayEvidenceAudit(
  record: ImmutableLiveHypothesisEvaluationRecord,
  expectedSourceContentSha256?: string,
): LiveInferenceEvidenceAuditReplay {
  const errors: string[] = [];
  const payload = record.payload;
  const sourceSha = payload.approvedDocument.sourceContentSha256;
  const audit = (payload.evaluation as Partial<LiveHypothesisEvaluationRecordPayload["evaluation"]>)
    .rateRevealEvidenceAudit;
  if (!audit) {
    return {
      valid: false,
      errors: ["Evaluation record has no durable RateReveal inference evidence audit."],
      sourceContentSha256: sourceSha,
      alternativeEvidencePostures: [],
      merchantConclusions: [],
    };
  }
  const packetSource = payload.invocation.exactSourceBoundPacket.sourceDocument;
  const topic = payload.topicRegistry.exactTopic;

  if (record.integrity.algorithm !== "sha256") errors.push("Evaluation record uses an unsupported integrity algorithm.");
  if (record.integrity.payloadSha256 !== liveHypothesisEvaluationPayloadSha256(payload)) {
    errors.push("Evaluation record payload integrity hash does not match.");
  }
  if (payload.recordVersion !== LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION) {
    errors.push(`Evaluation record version ${String(payload.recordVersion)} is not replayable by the v8 evidence audit.`);
  }
  if (audit.modelVersion !== LIVE_INFERENCE_EVIDENCE_AUDIT_VERSION) {
    errors.push("Evaluation record has an unsupported inference evidence audit version.");
  }
  if (payload.evaluationOnly !== true
      || payload.topicRegistry.providerCreatedTopicsAllowed !== false
      || packetSource.documentId !== payload.approvedDocument.statementId) {
    errors.push("Evaluation record violates the bounded evaluation topic contract.");
  }
  if (packetSource.sourceContentSha256 !== sourceSha
      || payload.invocation.exactSourceBoundPacket.authorityPolicy.providerOutput !== "proposal_only"
      || payload.invocation.exactSourceBoundPacket.authorityPolicy.canonicalAuthority !== "prohibited"
      || payload.invocation.exactSourceBoundPacket.authorityPolicy.verificationResultAssignment !== "prohibited") {
    errors.push("Evaluation record violates the source-bound provider authority contract.");
  }
  if (!/^[a-f0-9]{64}$/.test(sourceSha)) errors.push("Approved source fingerprint is not a SHA-256 digest.");
  if (expectedSourceContentSha256 !== undefined && sourceSha !== expectedSourceContentSha256) {
    errors.push("Evaluation record does not belong to the expected source statement.");
  }
  if (audit.sourceContentSha256 !== sourceSha
      || packetSource.sourceContentSha256 !== sourceSha) {
    errors.push("Inference evidence audit source fingerprint does not match the approved source statement.");
  }
  if (packetSource.sourceDocumentRef !== payload.approvedDocument.sourceDocumentRef) {
    errors.push("Provider packet source identity does not match the approved evaluation document.");
  }
  if (audit.topicId !== topic.id) errors.push("Inference evidence audit topic does not match the approved topic.");
  if (audit.providerProposalRequiredForPresentation !== false
      || audit.providerConfidenceUsedForQualification !== false
      || audit.canonicalAuthorityGranted !== false) {
    errors.push("Inference evidence audit violates the provider or canonical-authority boundary.");
  }
  if (payload.evaluation.canonicalTruthInvariant !== true
      || payload.evaluation.canonicalTruthBefore !== payload.evaluation.canonicalTruthAfter) {
    errors.push("Evaluation record does not preserve canonical truth invariance.");
  }

  const requiredControlIds = topicRelevantControlIds(topic);
  const recordedControlIds = new Set(audit.relevantControlResults.map((result) => result.controlId));
  if (recordedControlIds.size !== audit.relevantControlResults.length) {
    errors.push("Inference evidence audit contains duplicate relevant control results.");
  }
  for (const controlId of requiredControlIds) {
    if (!recordedControlIds.has(controlId)) errors.push(`Inference evidence audit is missing required control ${controlId}.`);
  }
  for (const controlId of recordedControlIds) {
    if (!requiredControlIds.has(controlId)) errors.push(`Inference evidence audit contains unrelated control ${controlId}.`);
  }
  errors.push(...validateVerifiedInferenceEvidence({
    sourceContentSha256: sourceSha,
    topics: [topic],
    evidence: audit.verifiedInferenceEvidence,
  }));

  // Invalid evidence must never produce a usable replay conclusion, even if a
  // caller accidentally ignores `valid`.
  if (errors.length > 0) return {
    valid: false, errors, sourceContentSha256: sourceSha,
    alternativeEvidencePostures: [], merchantConclusions: [],
  };

  const alternativeEvidencePostures = evaluateAlternativeEvidencePostures({
    topics: [topic],
    controlResults: audit.relevantControlResults,
    verifiedEvidence: audit.verifiedInferenceEvidence,
  });
  if (stableJson(alternativeEvidencePostures) !== stableJson(audit.alternativeEvidencePostures)) {
    errors.push("Recorded alternative evidence postures do not reproduce from the preserved evidence.");
  }

  const merchantConclusion = replayMerchantInferenceConclusion(topic, alternativeEvidencePostures);
  const storedPresentation = audit.inferencePresentations.find((presentation) => presentation.topicId === topic.id);
  if (!storedPresentation || stableJson(storedPresentation.merchantConclusion) !== stableJson(merchantConclusion)) {
    errors.push("Recorded merchant conclusion does not reproduce from the preserved evidence posture.");
  }
  if (audit.inferencePresentations.length !== 1) {
    errors.push("Inference evidence audit must contain exactly one presentation for its approved topic.");
  }

  return {
    valid: errors.length === 0,
    errors,
    sourceContentSha256: sourceSha,
    alternativeEvidencePostures,
    merchantConclusions: [merchantConclusion],
  };
}

function topicRelevantControlIds(topic: InferenceTopic): Set<string> {
  return new Set([
    ...topic.qualification.compatibilityControlIds,
    ...topic.qualification.evidenceFactors.flatMap((factor) => factor.controlIds),
  ]);
}

export async function writeImmutableLiveHypothesisEvaluationRecord(
  outputDirectory: string,
  record: ImmutableLiveHypothesisEvaluationRecord,
): Promise<string> {
  const statement = safeFileSegment(record.payload.approvedDocument.statementId);
  const timestamp = record.payload.createdAt.replace(/[:.]/g, "-");
  const path = join(outputDirectory, `${timestamp}-${statement}-${record.integrity.payloadSha256.slice(0, 12)}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return path;
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "statement";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
