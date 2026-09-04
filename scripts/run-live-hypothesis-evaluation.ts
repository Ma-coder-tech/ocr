import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { config as loadDotEnv } from "dotenv";

import { parsePdf } from "../src/parser.js";
import {
  LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION,
  LIVE_INFERENCE_TOPIC_REGISTRY_VERSION,
  OpenAiLiveHypothesisProposer,
  adaptParsedDocumentToObservationPacket,
  bindReplayObservations,
  buildLiveHypothesisEvaluationRecord,
  runRecordedHypothesisExperiment,
  stableLiveProposalId,
  verifyReplaySourceProvenance,
  writeImmutableLiveHypothesisEvaluationRecord,
  type InferenceTopic,
  type LiveProviderPrivacyConfiguration,
  type RecordedProposalReviewRule,
} from "../src/reconstructionKernel/index.js";
import {
  cloverInferenceTopics,
  cloverRecordedReviewRules,
  wellsInferenceTopics,
  wellsRecordedReviewRules,
} from "../test/fixtures/reconstructionKernel/recordedHypothesisProposals.js";
import { realStatementReplayCases } from "../test/fixtures/reconstructionKernel/realStatementReplay.js";

const MODEL = "gpt-5.6-terra";
const REASONING_EFFORT = "high" as const;
const MAX_OUTPUT_TOKENS = 3_000;
const REPETITIONS_PER_CASE = 1;
const environmentPath = process.env.RATEREVEAL_EVAL_ENV_PATH
  ?? "/Users/martialmahougnonamoussou/Projects/OCR/.env";
loadDotEnv({ path: environmentPath, override: false, quiet: true });

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error(`OPENAI_API_KEY is not available from ${environmentPath}.`);

const runId = `live-hypothesis-evaluation-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const outputDirectory = join(process.cwd(), "artifacts", "live-hypothesis-evaluation", runId);
const verifiedAt = new Date().toISOString();
const privacy: LiveProviderPrivacyConfiguration = {
  verifiedAt,
  verificationBasis: [
    "https://developers.openai.com/api/docs/guides/your-data",
    "https://developers.openai.com/tracks/building-agents#how-to-choose",
    "GET https://api.openai.com/v1/models returned gpt-5.6-terra for this API key before the experiment",
  ],
  trainingUse: "api_inputs_not_used_to_train_by_default_unless_organization_explicitly_opts_in",
  responseStorage: "disabled_store_false",
  promptCacheRetention: "provider_default_in_memory",
  abuseMonitoringRetention: "up_to_30_days_unless_organization_has_approved_modified_or_zero_data_retention",
  organizationZdrOrMamEnrollment: "not_verified",
  tools: "none",
  conversationState: "none",
  backgroundMode: "disabled",
};

const cases = [
  {
    id: "clover-duplicate-resubmission",
    topics: cloverInferenceTopics,
    reviewRules: cloverRecordedReviewRules,
  },
  {
    id: "wells-fargo-september-2024",
    topics: wellsInferenceTopics,
    reviewRules: wellsRecordedReviewRules,
  },
] as const;

const summaries: Array<Record<string, unknown>> = [];
const recordPaths: string[] = [];

for (const evaluationCase of cases) {
  const replayCase = realStatementReplayCases.find((candidate) => candidate.definition.id === evaluationCase.id);
  if (!replayCase) throw new Error(`Missing approved replay case ${evaluationCase.id}.`);
  if (evaluationCase.topics.length !== 1) throw new Error(`Case ${evaluationCase.id} must have exactly one approved topic.`);

  const [document, bytes] = await Promise.all([
    parsePdf(replayCase.pdfPath),
    readFile(replayCase.pdfPath),
  ]);
  const packet = adaptParsedDocumentToObservationPacket(evaluationCase.id, document);
  const provenance = verifyReplaySourceProvenance(
    { bytes, manifest: replayCase.sourceManifest },
    packet,
    replayCase.definition,
  );
  if (!provenance.verified) throw new Error(provenance.errors.join("\n"));
  const bound = bindReplayObservations(packet, replayCase.definition.bindings);
  if (bound.errors.length > 0) throw new Error(bound.errors.join("\n"));

  const reconstructionInput = {
    ...structuredClone(replayCase.definition.inputTemplate),
    observations: bound.observations,
  };
  const sourceBinding = {
    sourceDocumentRef: `approved-evaluation-document:${evaluationCase.id}`,
    sourceContentSha256: replayCase.sourceManifest.contentSha256,
  };
  const liveRules = liveReviewRules(evaluationCase.reviewRules);
  const caseRuns: Array<Record<string, unknown>> = [];

  for (let repetition = 1; repetition <= REPETITIONS_PER_CASE; repetition += 1) {
    const proposer = new OpenAiLiveHypothesisProposer({
      apiKey,
      model: MODEL,
      reasoningEffort: REASONING_EFFORT,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: 60_000,
    });
    const result = await runRecordedHypothesisExperiment({
      reconstructionInput,
      sourceBinding,
      sourceBytes: bytes,
      proposer,
      inferenceTopics: evaluationCase.topics,
      reviewRules: liveRules,
    });
    const attempts = proposer.getAttemptAudits();
    if (attempts.length !== 1) throw new Error(`Expected exactly one provider attempt for ${evaluationCase.id} run ${repetition}.`);
    const attempt = attempts[0]!;
    const record = buildLiveHypothesisEvaluationRecord({
      statementId: evaluationCase.id,
      sourceContentSha256: replayCase.sourceManifest.contentSha256,
      topic: evaluationCase.topics[0]!,
      providerId: proposer.providerId,
      requestedModel: MODEL,
      reasoningEffort: REASONING_EFFORT,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      privacy,
      attempt,
      result,
    });
    const recordPath = await writeImmutableLiveHypothesisEvaluationRecord(outputDirectory, record);
    recordPaths.push(recordPath);
    const runSummary = {
      repetition,
      recordPath,
      recordSha256: record.integrity.payloadSha256,
      status: result.status,
      errors: result.errors,
      canonicalTruthInvariant: result.canonicalTruthInvariant,
      providerResponseId: attempt.providerResponseId,
      returnedModel: attempt.returnedModel,
      httpStatus: attempt.httpStatus,
      outcome: attempt.outcome,
      hypothesisSignatures: result.acceptedProviderHypotheses.map((hypothesis) => ({
        claims: hypothesis.claims.map((claim) => `${claim.key}:${JSON.stringify(claim.value)}`).sort(),
        providerConfidence: hypothesis.inference?.confidence ?? null,
        missingProof: hypothesis.inference?.missingProof ?? [],
      })),
      qualifiedStrengths: result.augmented.hypothesisResults
        .filter((hypothesis) => hypothesis.ownership.kind === "provider")
        .map((hypothesis) => ({
          proposalId: hypothesis.ownership.kind === "provider" ? hypothesis.ownership.proposalId : hypothesis.hypothesisId,
          strength: hypothesis.qualifiedInferenceStrength ?? null,
          reasonCodes: hypothesis.qualificationReasonCodes ?? [],
          verificationResults: hypothesis.verificationResults ?? [],
        })),
      proposalReviews: result.proposalReviews,
      inferencePresentations: result.inferencePresentations,
      unknownAlternativeRetained: result.unknownAlternativeRetainedForEveryProviderGroup,
      explanatoryWorldCountBefore: result.explanatoryWorldCountBefore,
      explanatoryWorldCountAfter: result.explanatoryWorldCountAfter,
      crossOriginContradictionWorldCount: result.crossOriginContradictionWorldCount,
    };
    caseRuns.push(runSummary);
    process.stdout.write(`${JSON.stringify({ caseId: evaluationCase.id, ...runSummary })}\n`);
  }

  const signatures = caseRuns.map((run) => JSON.stringify(run.hypothesisSignatures));
  const strengthSignatures = caseRuns.map((run) => JSON.stringify(run.qualifiedStrengths));
  summaries.push({
    caseId: evaluationCase.id,
    topicId: evaluationCase.topics[0]!.id,
    repetitions: REPETITIONS_PER_CASE,
    semanticClaimAndConfidenceStable: new Set(signatures).size === 1,
    qualifiedStrengthStable: new Set(strengthSignatures).size === 1,
    allCanonicalTruthInvariant: caseRuns.every((run) => run.canonicalTruthInvariant === true),
    allRunsRetainedUnknownAlternative: caseRuns.every((run) => run.unknownAlternativeRetained === true),
    runs: caseRuns,
  });
}

const summaryPayload = {
  summaryVersion: "ratereveal-live-hypothesis-evaluation-summary-v2",
  compatibleRecordVersion: LIVE_HYPOTHESIS_EVALUATION_RECORD_VERSION,
  topicRegistryVersion: LIVE_INFERENCE_TOPIC_REGISTRY_VERSION,
  runId,
  createdAt: new Date().toISOString(),
  evaluationOnly: true,
  model: MODEL,
  reasoningEffort: REASONING_EFFORT,
  repetitionsPerCase: REPETITIONS_PER_CASE,
  totalProviderCalls: cases.length * REPETITIONS_PER_CASE,
  automaticRetries: 0,
  privacy,
  cases: summaries,
  recordPaths,
};
const summarySha256 = createHash("sha256").update(JSON.stringify(summaryPayload)).digest("hex");
await mkdir(outputDirectory, { recursive: true });
const summaryPath = join(outputDirectory, `summary-${summarySha256.slice(0, 12)}.json`);
await writeFile(summaryPath, `${JSON.stringify({ integrity: { algorithm: "sha256", payloadSha256: summarySha256 }, payload: summaryPayload }, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ complete: true, summaryPath, summarySha256, recordCount: recordPaths.length })}\n`);

function liveReviewRules(rules: readonly RecordedProposalReviewRule[]): RecordedProposalReviewRule[] {
  return rules.map((rule) => {
    if (rule.expectedClaims.length !== 1) throw new Error("Live evaluation review rules require exactly one expected claim.");
    const claim = rule.expectedClaims[0]!;
    return {
      ...structuredClone(rule),
      proposalId: stableLiveProposalId("inference-topic-0001", claim.key, claim.value),
    };
  });
}
