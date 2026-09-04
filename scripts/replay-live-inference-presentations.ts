import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import {
  buildInferencePresentations,
  evaluateAlternativeEvidencePostures,
  mergeVerifiedInferenceEvidence,
  reconstructStatement,
  replayLiveInferenceEvidenceAudit,
  routeEvidenceNeeds,
  validateVerifiedInferenceEvidence,
  verifiedInferenceEvidenceFromResults,
  type Hypothesis,
  type HypothesisResult,
  type InferenceEvidencePosture,
  type InferenceTopic,
  type InferenceVerificationResult,
  type QualifiedInferenceStrength,
  type VerifiedInferenceEvidence,
} from "../src/reconstructionKernel/index.js";
import {
  cloverInferenceTopics,
  paysafeInferenceTopics,
  vortaxInferenceTopics,
  wellsInferenceTopics,
} from "../test/fixtures/reconstructionKernel/recordedHypothesisProposals.js";
import { realStatementReplayCases } from "../test/fixtures/reconstructionKernel/realStatementReplay.js";

type JsonObject = Record<string, any>;

const artifactRoot = "artifacts/live-hypothesis-evaluation";
const outputPath = join(
  artifactRoot,
  "offline-presentation-replay",
  "current-policy-replay.json",
);

const topicsByStatementId = new Map<string, InferenceTopic[]>([
  ["clover-duplicate-resubmission", cloverInferenceTopics],
  ["paysafe-october-2025", paysafeInferenceTopics],
  ["wells-fargo-september-2024", wellsInferenceTopics],
  ["vortax-september-2022", vortaxInferenceTopics],
]);
const inputsByStatementId = new Map(realStatementReplayCases.map((item) => [
  item.definition.id,
  item.definition.inputTemplate,
]));

const files = (await listJsonFiles(artifactRoot))
  .filter((path) => !path.includes("/offline-presentation-replay/"));
const parsed = await Promise.all(files.map(async (path) => ({
  path,
  record: JSON.parse(await readFile(path, "utf8")) as JsonObject,
})));
const records = parsed.filter(({ record }) =>
  typeof record.payload?.recordVersion === "string"
  && record.payload.recordVersion.startsWith("ratereveal-live-hypothesis-evaluation-record-v"));

const integrityFailures = records.flatMap(({ path, record }) => {
  const expected = record.integrity?.payloadSha256;
  const actual = createHash("sha256").update(stableJson(record.payload)).digest("hex");
  return expected === actual ? [] : [{ path, expected, actual }];
});
if (integrityFailures.length > 0) {
  throw new Error(`Immutable record integrity failed: ${JSON.stringify(integrityFailures, null, 2)}`);
}

const supersededHashes = new Set(records.flatMap(({ record }) =>
  typeof record.payload.supersedesIntegritySha256 === "string"
    ? [record.payload.supersedesIntegritySha256]
    : []));
const uniqueRecords = records.filter(({ record }) =>
  !supersededHashes.has(record.integrity.payloadSha256));

const verifiedEvidenceBySource = new Map<string, VerifiedInferenceEvidence[]>();
const replayed = uniqueRecords
  .sort((left, right) => String(left.record.payload.createdAt).localeCompare(String(right.record.payload.createdAt)))
  .map(({ path, record }) => {
    const sourceContentSha256 = record.payload.approvedDocument.sourceContentSha256 as string;
    const replay = replayRecord(
      path,
      record,
      verifiedEvidenceBySource.get(sourceContentSha256) ?? [],
    );
    verifiedEvidenceBySource.set(sourceContentSha256, replay.verifiedInferenceEvidence);
    return replay;
  });

const byStatement = [...topicsByStatementId.keys()].map((statementId) => {
  const runs = replayed.filter((run) => run.statementId === statementId);
  return {
    statementId,
    runCount: runs.length,
    compatibleRunCount: runs.filter((run) => run.contractDisposition === "current_contract_replayed").length,
    failClosedLegacyRunCount: runs.filter((run) => run.contractDisposition === "legacy_contract_rejected").length,
    merchantConclusionStates: countBy(runs, (run) => run.merchantConclusion.state),
    merchantConclusionTexts: countBy(runs, (run) => run.merchantConclusion.text),
    providerConfidenceValues: countBy(
      runs.flatMap((run) => run.internalHypotheses),
      (item) => item.providerReportedConfidence ?? "none",
    ),
    qualifiedStrengthValues: countBy(
      runs.flatMap((run) => run.internalHypotheses),
      (item) => item.qualifiedInferenceStrength ?? "none",
    ),
    allCanonicalTruthInvariant: runs.every((run) => run.canonicalTruthInvariant),
  };
});

const report = {
  reportVersion: "ratereveal-offline-live-presentation-replay-v1",
  generatedAt: new Date().toISOString(),
  source: {
    artifactRoot,
    immutableRecordCount: records.length,
    integrityVerifiedCount: records.length,
    integrityFailures,
    supersededDuplicateCount: records.length - uniqueRecords.length,
    uniqueProviderInvocationCount: uniqueRecords.length,
    recordVersions: countBy(uniqueRecords, ({ record }) => record.payload.recordVersion),
  },
  policy: {
    implementation: "ratereveal-inference-presentation-v1",
    legacyHandling: "Records that predate the current structured proof-obligation/evidence-posture contract are rejected at the current provider boundary. RateReveal-owned deterministic alternative postures still remain available.",
    providerConfidenceUsedByPresentation: false,
    providerProposalRequiredByPresentation: false,
    verifiedEvidencePersistence: "Source-bound deterministic verification evidence is carried forward chronologically for the same immutable source fingerprint.",
  },
  summary: {
    allCanonicalTruthInvariant: replayed.every((run) => run.canonicalTruthInvariant),
    allPreservedVerificationEvidenceValidated: true,
    durableV8AuditReplayCount: replayed.filter((run) => run.durableEvidenceAuditDisposition === "v8_audit_replayed").length,
    historicalEvidenceReconstructionCount: replayed.filter((run) =>
      run.durableEvidenceAuditDisposition === "historical_evidence_reconstructed").length,
    currentContractReplayCount: replayed.filter((run) => run.contractDisposition === "current_contract_replayed").length,
    legacyFailClosedReplayCount: replayed.filter((run) => run.contractDisposition === "legacy_contract_rejected").length,
    byStatement,
  },
  runs: replayed,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...report.source, summary: report.summary }, null, 2));

function replayRecord(
  path: string,
  record: JsonObject,
  persistedVerifiedEvidence: VerifiedInferenceEvidence[],
) {
  const payload = record.payload;
  const evaluation = payload.evaluation;
  const statementId = payload.approvedDocument.statementId as string;
  const topics = topicsByStatementId.get(statementId);
  const input = inputsByStatementId.get(statementId);
  if (!topics || !input) throw new Error(`No current approved replay case for ${statementId}.`);

  const currentCompatible = isCurrentContractRecord(payload);
  const recordedAudit = payload.evaluation?.rateRevealEvidenceAudit;
  const v8AuditReplay = payload.recordVersion === "ratereveal-live-hypothesis-evaluation-record-v8"
    ? replayLiveInferenceEvidenceAudit(record)
    : null;
  if (v8AuditReplay && !v8AuditReplay.valid) {
    throw new Error(`v8 evidence audit failed for ${path}: ${v8AuditReplay.errors.join(" ")}`);
  }
  const providerHypotheses = currentCompatible
    ? evaluation.acceptedProviderHypotheses as Hypothesis[]
    : [];
  const hypothesisResults = currentCompatible
    ? resultsFromRecord(providerHypotheses, evaluation.providerAndQualifiedConfidence ?? [])
    : [];
  const verifiedInferenceEvidence = mergeVerifiedInferenceEvidence(
    persistedVerifiedEvidence,
    Array.isArray(recordedAudit?.verifiedInferenceEvidence)
      ? recordedAudit.verifiedInferenceEvidence as VerifiedInferenceEvidence[]
      : currentCompatible
      ? verifiedInferenceEvidenceFromResults({
          sourceContentSha256: payload.approvedDocument.sourceContentSha256,
          providerHypotheses,
          hypothesisResults,
        })
      : [],
  );
  const evidenceValidationErrors = validateVerifiedInferenceEvidence({
    sourceContentSha256: payload.approvedDocument.sourceContentSha256,
    topics,
    evidence: verifiedInferenceEvidence,
  });
  if (evidenceValidationErrors.length > 0) {
    throw new Error(`Preserved verification evidence failed replay for ${path}: ${evidenceValidationErrors.join(" ")}`);
  }
  const alternativeEvidencePostures = evaluateAlternativeEvidencePostures({
    topics,
    controlResults: reconstructStatement(structuredClone(input)).controlResults,
    verifiedEvidence: verifiedInferenceEvidence,
  });
  const presentations = buildInferencePresentations({
    topics,
    providerHypotheses,
    hypothesisResults,
    alternativeEvidencePostures,
    evidenceNeeds: input.evidenceNeeds,
    evidenceRoutes: routeEvidenceNeeds(input.evidenceNeeds),
  });
  if (presentations.length !== 1) throw new Error(`Expected one presentation for ${statementId}.`);
  const presentation = presentations[0]!;
  const confidenceByProposalId = new Map<string, JsonObject>((evaluation.providerAndQualifiedConfidence ?? [])
    .map((item: JsonObject) => [item.proposalId as string, item]));

  return {
    sourcePath: relative(".", path),
    integritySha256: record.integrity.payloadSha256,
    recordVersion: payload.recordVersion,
    createdAt: payload.createdAt,
    statementId,
    provider: {
      requestedModel: payload.provider?.requestedModel ?? null,
      returnedModel: payload.provider?.returnedModel ?? null,
      reasoningEffort: payload.provider?.reasoningEffort ?? null,
      responseId: payload.invocation?.providerResponseId ?? null,
    },
    historicalEvaluationStatus: evaluation.status,
    historicalErrors: evaluation.errors,
    contractDisposition: currentCompatible ? "current_contract_replayed" : "legacy_contract_rejected",
    durableEvidenceAuditDisposition: v8AuditReplay ? "v8_audit_replayed" : "historical_evidence_reconstructed",
    verifiedInferenceEvidence,
    alternativeEvidencePostures,
    internalHypotheses: (evaluation.acceptedProviderHypotheses ?? []).map((hypothesis: Hypothesis) => {
      const proposalId = hypothesis.ownership.kind === "provider"
        ? hypothesis.ownership.proposalId
        : hypothesis.id;
      const confidence = confidenceByProposalId.get(proposalId);
      return {
        proposalId,
        alternativeId: hypothesis.inferenceTopic?.alternativeId ?? null,
        providerReportedConfidence: confidence?.providerReportedConfidence ?? hypothesis.inference?.confidence ?? null,
        qualifiedInferenceStrength: confidence?.qualifiedInferenceStrength ?? null,
        evidencePostureOutcome: confidence?.evidencePosture?.outcome ?? null,
        missingProof: confidence?.missingProof ?? hypothesis.inference?.missingProof ?? [],
        acceptedByCurrentReplay: currentCompatible,
      };
    }),
    merchantConclusion: presentation.merchantConclusion,
    uncertaintyDisclosure: presentation.resolutionEvidenceNeeds.map((need) => ({
      evidenceNeedId: need.evidenceNeedId,
      description: need.description,
      missingProperties: need.proofObligations.map((obligation) => obligation.missingProperty),
      resolutionEvidenceKinds: [...new Set(need.proofObligations.flatMap((obligation) =>
        obligation.resolutionEvidenceKinds))],
    })),
    presentationReasonCodes: presentation.reasonCodes,
    canonicalTruthInvariant: evaluation.canonicalTruthInvariant === true
      && evaluation.canonicalTruthBefore === evaluation.canonicalTruthAfter,
  };
}

function isCurrentContractRecord(payload: JsonObject): boolean {
  const version = String(payload.recordVersion);
  if (version !== "ratereveal-live-hypothesis-evaluation-record-v6"
    && version !== "ratereveal-live-hypothesis-evaluation-record-v7"
    && version !== "ratereveal-live-hypothesis-evaluation-record-v8") return false;
  const topic = payload.topicRegistry?.exactTopic;
  if (!Array.isArray(topic?.proofObligations) || !Array.isArray(topic?.verificationRecipes)) return false;
  return (payload.evaluation?.acceptedProviderHypotheses ?? []).every((hypothesis: JsonObject) => {
    const proposalId = hypothesis.ownership?.proposalId;
    const score = (payload.evaluation.providerAndQualifiedConfidence ?? [])
      .find((item: JsonObject) => item.proposalId === proposalId);
    return score?.evidencePosture != null;
  });
}

function resultsFromRecord(
  hypotheses: Hypothesis[],
  scores: JsonObject[],
): HypothesisResult[] {
  const scoreByProposalId = new Map(scores.map((item) => [item.proposalId as string, item]));
  return hypotheses.map((hypothesis) => {
    if (hypothesis.ownership.kind !== "provider") throw new Error("Live replay accepted a non-provider hypothesis.");
    const score = scoreByProposalId.get(hypothesis.ownership.proposalId);
    if (!score?.evidencePosture) throw new Error(`Missing evidence posture for ${hypothesis.ownership.proposalId}.`);
    const strength = score.qualifiedInferenceStrength as QualifiedInferenceStrength;
    const contradicted = score.evidencePosture.outcome === "contradicted";
    return {
      hypothesisId: hypothesis.id,
      groupId: hypothesis.groupId,
      state: contradicted ? "rejected" : "viable_unresolved",
      interpretationState: contradicted
        ? "rejected"
        : strength === "strong"
          ? "strong_inference"
          : strength === "moderate"
            ? "moderate_inference"
            : strength === "weak"
              ? "weak_inference"
              : "unknown_or_competing_interpretations",
      ownership: structuredClone(hypothesis.ownership),
      evidenceClass: hypothesis.evidenceClass,
      alternativeCoverage: hypothesis.alternativeCoverage,
      inference: structuredClone(hypothesis.inference),
      inferenceTopicId: hypothesis.inferenceTopic?.topicId,
      providerReportedConfidence: score.providerReportedConfidence ?? undefined,
      qualifiedInferenceStrength: strength,
      qualificationReasonCodes: structuredClone(score.qualificationReasonCodes ?? []),
      evidencePosture: structuredClone(score.evidencePosture as InferenceEvidencePosture),
      verificationResults: structuredClone((score.verificationResults ?? []) as InferenceVerificationResult[]),
      reason: "Replayed from an integrity-verified immutable live evaluation record.",
    };
  });
}

async function listJsonFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root)) {
    const path = join(root, entry);
    const details = await stat(path);
    if (details.isDirectory()) result.push(...await listJsonFiles(path));
    else if (entry.endsWith(".json")) result.push(path);
  }
  return result;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function countBy<T>(items: T[], selector: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
