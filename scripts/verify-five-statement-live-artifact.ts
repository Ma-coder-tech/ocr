import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { verifyEvaluationRunIntegrityArtifactV2 } from "../src/evaluationIntegrity/index.js";

const suppliedPath = process.env.RATEREVEAL_FIVE_STATEMENT_LIVE_ARTIFACT_PATH?.trim();
if (!suppliedPath) {
  throw new Error("RATEREVEAL_FIVE_STATEMENT_LIVE_ARTIFACT_PATH is required for forensic verification");
}

const observation = JSON.parse(await readFile(path.resolve(
  process.cwd(),
  "test/fixtures/evaluation/five-statement-live-work-plan-observation-v1.json",
), "utf8"));
const bytes = await readFile(path.resolve(suppliedPath));
const sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256, observation.sourceArtifactSha256, "supplied artifact SHA-256 does not match the pinned source");

const artifact = JSON.parse(bytes.toString("utf8"));
assert.equal(verifyEvaluationRunIntegrityArtifactV2(artifact), true, "supplied artifact failed integrity verification");
assert.equal(artifact.canonicalAdmissionResults.length, observation.selectedStatementCount);
assert.equal(artifact.packageFinancialInvariance.length, observation.observedFinancialInvarianceStatementCount);
assert.equal(artifact.packageFinancialInvariance.every((entry: any) =>
  entry.result.invariant === true
  && entry.result.packages.every((pkg: any) => pkg.beforeHash === pkg.afterHash)
), true, "supplied artifact does not preserve package financial invariance");

const rowCounts = artifact.canonicalAdmissionResults
  .map((result: any) => result.canonicalReferenceProof.canonicalFeeRowRefs.length)
  .sort((left: number, right: number) => left - right);
assert.deepEqual(rowCounts, observation.observedFeeRowCounts);

for (const result of artifact.canonicalAdmissionResults) {
  assert.ok(result.canonicalReferenceProof.canonicalFeeRowRefs.length > 0);
  assert.equal(
    result.researchEvidence.attempts.filter((attempt: any) => attempt.status === "completed").length,
    observation.observedCompletedResearchAttemptsPerStatement,
  );
  assert.equal(result.researchEvidence.candidates.length, observation.observedResearchCandidatesPerStatement);
  assert.equal(result.researchEvidence.candidates.every((candidate: any) =>
    candidate.retrievalStatus === "failed"
    && candidate.semanticVerificationStatus === "not_started"
    && candidate.verificationStatus === "rejected"
  ), true);
  const reasonCodes = result.researchEvidence.candidates.flatMap((candidate: any) => candidate.reasonCodes);
  assert.ok(reasonCodes.includes("fee_knowledge_retrieval_fetch_failed"));
  assert.ok(reasonCodes.includes("fee_knowledge_semantic_support_not_run"));
  assert.deepEqual(result.researchEvidence.claimSupports, []);
  assert.equal(result.admissionDisposition, "rejected");
  assert.equal(result.packageF, null);
}

const wholeStatementOutcomes = artifact.providerCallOutcomes
  .filter((outcome: any) => outcome.stage === "whole_statement_ai_review");
assert.deepEqual(
  wholeStatementOutcomes.map((outcome: any) => outcome.status).sort(),
  observation.observedWholeStatementReviewOutcomes,
);
assert.equal(
  wholeStatementOutcomes.find((outcome: any) => outcome.status === "success")?.sourceDocumentId,
  observation.observedSuccessfulSourceDocumentId,
);
assert.equal(artifact.providerCallOutcomes.filter((outcome: any) =>
  outcome.stage === "web_search_discovery" && outcome.status === "success"
).length, observation.observedWebSearchSuccessCount);
assert.equal(artifact.providerCallOutcomes.filter((outcome: any) =>
  outcome.stage === "document_retrieval"
).length, observation.observedDocumentRetrievalOutcomeCount);
assert.equal(artifact.providerCallOutcomes.filter((outcome: any) =>
  outcome.stage === "semantic_verification"
).length, observation.observedSemanticVerificationOutcomeCount);

console.log(JSON.stringify({ status: "verified", sha256, artifactPath: path.resolve(suppliedPath) }));
