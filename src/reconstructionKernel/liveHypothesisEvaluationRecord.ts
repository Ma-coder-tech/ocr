import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { LiveProviderAttemptAudit } from "./liveHypothesisProvider.js";
import type { RecordedHypothesisExperimentResult } from "./recordedHypothesisExperiment.js";
import type { InferenceTopic } from "./types.js";

export const LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION = "ratereveal-live-hypothesis-evaluation-record-v7" as const;
export const LIVE_INFERENCE_TOPIC_REGISTRY_VERSION = "ratereveal-approved-topic-registry-v6" as const;

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
  };
}

export interface ImmutableLiveHypothesisEvaluationRecord {
  integrity: {
    algorithm: "sha256";
    payloadSha256: string;
  };
  payload: LiveHypothesisEvaluationRecordPayload;
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
    },
  };
  return {
    integrity: {
      algorithm: "sha256",
      payloadSha256: createHash("sha256").update(stableJson(payload)).digest("hex"),
    },
    payload,
  };
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
