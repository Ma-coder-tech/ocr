import { lstat, mkdir, mkdtemp, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildFeeKnowledgeSourcePacket } from "../src/canonical/feeKnowledgeRegistry.js";
import {
  FEE_KNOWLEDGE_RESEARCH_LIMITS,
  verifyCandidate,
  type FeeKnowledgeResearchQuestion,
} from "../src/canonical/feeKnowledgeResearch.js";
import { retrieveFeeKnowledgeDocument } from "../src/canonical/feeKnowledgeRetrieval.js";
import { buildWholeStatementFeeIntelligencePacket, validateWholeStatementFeeIntelligenceReview } from "../src/canonical/wholeStatementFeeIntelligenceReview.js";
import {
  FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
  FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
  type ApprovedFeeKnowledgeSourceRegistry,
  type FeeKnowledgeClaimSupportRecord,
  type FeeKnowledgeDomainIdentityPolicy,
  type FeeKnowledgeSemanticSupportDecision,
  type FeeKnowledgeStructuredClaim,
} from "../src/canonical/feeKnowledgeTypes.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis, MoneyAmount } from "../src/canonical/types.js";
import type { ParsedDocument } from "../src/parser.js";
import {
  EvaluationCostBudgetLedger,
  buildEvaluationRunIntegrityArtifact,
  buildEvaluationRunIntegrityArtifactV1,
  buildEvaluationRunIntegrityArtifactV2,
  buildEvaluationExpectedResearchQuestionProjection,
  calculateEvaluationCanonicalReferenceProjectionHash,
  calculateEvaluationClaimSupportDecisionRef,
  calculateEvaluationResearchQuestionRef,
  deriveEvaluationApprovedRegistryScopeBasis,
  buildEvaluationSourceManifest,
  createDeterministicPreflightArtifact,
  createLifecycleLedger,
  lifecycleRefs,
  preserveParserDecision,
  provePackagesBEFinancialInvariance,
  recordAiLifecycleState,
  recordLifecycleStage,
  sha256Canonical,
  validateExecutionSet,
  verifyEvaluationRunIntegrityArtifact,
  verifyEvaluationRunIntegrityArtifactByType,
  verifyEvaluationRunIntegrityArtifactV1,
  verifyEvaluationRunIntegrityArtifactV2,
  writeAndVerifyEvaluationRunIntegrityArtifactV2,
  writeAndVerifyEvaluationRunIntegrityArtifactV2ForTesting,
  type EvaluationCanonicalAdmissionResultInput,
  type EvaluationResearchClaimSupportProof,
  type EvaluationRunIntegrityArtifactV2,
  type OneTimeStatementEvaluationPacket,
  type PackagesBEProjectionInput,
} from "../src/evaluationIntegrity/index.js";

const SOURCE_ID = "doc_artifact_v2";
const EXECUTION_REF = `ai_exec_${"a".repeat(32)}`;
const RESULT_ID = "admission_result_document_one";
const ADMISSION_REF = EXECUTION_REF;
const DIAGNOSTIC_REF = "ai_admission_attempt_whole_statement_fee_intelligence_review_1";
const FIXTURE_QUESTION_CONTRACT = {
  feeRowRef: "feerow_one",
  questionOrdinal: 1,
  sanitizedQuestionCategory: "classification" as const,
  triggerReason: "material_unfamiliar_label" as const,
};
const FIXTURE_QUESTION_REF = calculateEvaluationResearchQuestionRef(fixtureResearchQuestion(), 1);

describe("Evaluation Run Integrity Artifact V2", () => {
  it("keeps the V1 builder and serialized artifact byte-identical", () => {
    const fixture = artifactFixture();
    const original = buildEvaluationRunIntegrityArtifact(fixture.v1Input);
    const explicit = buildEvaluationRunIntegrityArtifactV1(fixture.v1Input);
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(original));
    expect(explicit.artifactContentHash).toBe(original.artifactContentHash);
    expect(verifyEvaluationRunIntegrityArtifact(original)).toBe(true);
  });

  it("does not alter existing V1 fixtures or default verification", () => {
    const fixture = artifactFixture();
    const artifact = buildEvaluationRunIntegrityArtifact(fixture.v1Input);
    expect(artifact.type).toBe("evaluation_run_integrity_artifact_v1");
    expect("canonicalAdmissionResults" in artifact).toBe(false);
    expect(verifyEvaluationRunIntegrityArtifact(artifact)).toBe(true);
  });

  it("keeps version-specific verification closed across V1 and V2", () => {
    const fixture = artifactFixture();
    const v1 = buildEvaluationRunIntegrityArtifact(fixture.v1Input);
    const v2 = buildFixtureArtifact(fixture);
    expect(verifyEvaluationRunIntegrityArtifactV1(v1)).toBe(true);
    expect(verifyEvaluationRunIntegrityArtifactV1(v2)).toBe(false);
    expect(verifyEvaluationRunIntegrityArtifactV2(v1)).toBe(false);
    expect(verifyEvaluationRunIntegrityArtifactV2(v2)).toBe(true);
  });

  it("dispatches only exact supported artifact types", () => {
    const fixture = artifactFixture();
    const v1 = buildEvaluationRunIntegrityArtifact(fixture.v1Input);
    const v2 = buildFixtureArtifact(fixture);
    expect(verifyEvaluationRunIntegrityArtifactByType(v1)).toBe(true);
    expect(verifyEvaluationRunIntegrityArtifactByType(v2)).toBe(true);
    expect(verifyEvaluationRunIntegrityArtifactByType({ ...v2, type: "evaluation_run_integrity_artifact_v3" })).toBe(false);
    expect(verifyEvaluationRunIntegrityArtifactByType({ ...v2, type: "Evaluation_Run_Integrity_Artifact_V2" })).toBe(false);
  });

  it("builds, writes, independently reads, and verifies a valid synthetic V2 artifact", async () => {
    const fixture = artifactFixture();
    const artifact = buildFixtureArtifact(fixture);
    const directory = await mkdtemp(path.join(tmpdir(), "evaluation-artifact-v2-"));
    const outputPath = path.join(directory, "artifact.json");
    expect(await writeAndVerifyEvaluationRunIntegrityArtifactV2({ artifact, outputPath })).toBe(outputPath);
    expect(verifyEvaluationRunIntegrityArtifactV2(JSON.parse(await readFile(outputPath, "utf8")))).toBe(true);
  });

  it("invalidates the artifact when any nested admission field changes without matching hashes", () => {
    const artifact = validArtifact();
    artifact.canonicalAdmissionResults[0]!.researchEvidence.claimSupports[0]!.evidenceDecision = "contradicted";
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("rejects unknown fields and unsupported admission-result versions even with recomputed hashes", () => {
    const unknownField = validArtifact() as unknown as Record<string, any>;
    unknownField.canonicalAdmissionResults[0].researchEvidence.claimSupports[0].publisherProse = "documentation";
    resign(unknownField);
    expect(verifyEvaluationRunIntegrityArtifactV2(unknownField)).toBe(false);

    const unknownVersion = validArtifact() as unknown as Record<string, any>;
    unknownVersion.canonicalAdmissionResults[0].type = "evaluation_canonical_admission_result_v2";
    resign(unknownVersion);
    expect(verifyEvaluationRunIntegrityArtifactV2(unknownVersion)).toBe(false);

    const inheritedUnknown = validArtifact() as unknown as Record<string, any>;
    inheritedUnknown.lifecycleLedger.documents[0].events[0].unexpected = "field";
    resign(inheritedUnknown);
    expect(verifyEvaluationRunIntegrityArtifactV2(inheritedUnknown)).toBe(false);
  });

  it("rejects admission source IDs outside the approved manifest", () => {
    const artifact = validArtifact();
    artifact.canonicalAdmissionResults[0]!.sourceDocumentId = "doc_unapproved";
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("rejects every mismatched execution reference", () => {
    const paths: Array<(artifact: EvaluationRunIntegrityArtifactV2) => void> = [
      (a) => { a.canonicalAdmissionResults[0]!.admission.executionRef = `ai_exec_${"b".repeat(32)}`; },
      (a) => { a.canonicalAdmissionResults[0]!.packageF!.executionRef = `ai_exec_${"b".repeat(32)}`; },
      (a) => { a.canonicalAdmissionResults[0]!.package5a.executionRef = `ai_exec_${"b".repeat(32)}`; },
      (a) => { lifecycleAdmissionEvent(a).capabilityExecutionRef = `ai_exec_${"b".repeat(32)}`; },
    ];
    for (const mutate of paths) {
      const artifact = validArtifact();
      mutate(artifact);
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }
  });

  it("rejects safe-shaped diagnostic references outside validated Package F and research sets", () => {
    const artifact = validArtifact();
    artifact.canonicalAdmissionResults[0]!.package5a.diagnosticRefs = ["feerow_nonexistent"];
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("rejects an admitted disposition without its admitted Package F output", () => {
    const artifact = validArtifact();
    artifact.canonicalAdmissionResults[0]!.packageF = null;
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("rejects rejected or safety-blocked admission carrying Package F output", () => {
    for (const disposition of ["rejected", "safety_blocked"] as const) {
      const artifact = validArtifact();
      const result = artifact.canonicalAdmissionResults[0]!;
      result.admissionDisposition = disposition;
      result.admission.admissionDisposition = disposition;
      result.package5a.admissionState = "rejected";
      result.package5a.finalCanonicalStatus = disposition === "safety_blocked" ? "safety_blocked" : "rejected";
      if (disposition === "safety_blocked") result.package5a.stageStates.privacySafety = "failed";
      lifecycleAdmissionEvent(artifact).state = disposition === "safety_blocked" ? "blocked" : "withheld";
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }
  });

  it("rejects missing or disposition-inconsistent lifecycle admission events", () => {
    const missing = validArtifact();
    const document = missing.lifecycleLedger.documents[0]!;
    document.events = document.events.filter((event) => event.stage !== "canonical_admission");
    resign(missing);
    expect(verifyEvaluationRunIntegrityArtifactV2(missing)).toBe(false);

    const inconsistent = validArtifact();
    lifecycleAdmissionEvent(inconsistent).state = "withheld";
    resign(inconsistent);
    expect(verifyEvaluationRunIntegrityArtifactV2(inconsistent)).toBe(false);
  });

  it("reconciles canonical and publication AI states for every admission disposition", () => {
    expect(verifyEvaluationRunIntegrityArtifactV2(validArtifact())).toBe(true);
    expect(verifyEvaluationRunIntegrityArtifactV2(rejectedArtifact())).toBe(true);
    expect(verifyEvaluationRunIntegrityArtifactV2(safetyBlockedArtifact())).toBe(true);

    const admittedStateMissing = validArtifact();
    admittedStateMissing.lifecycleLedger.documents[0]!.aiStates.canonical_admitted = { state: "not_reached", reasonCodes: ["stage_not_reached"] };
    resign(admittedStateMissing);
    expect(verifyEvaluationRunIntegrityArtifactV2(admittedStateMissing)).toBe(false);

    const admittedReasonWrong = validArtifact();
    admittedReasonWrong.lifecycleLedger.documents[0]!.aiStates.canonical_admitted.reasonCodes = ["canonical_admission_rejected"];
    resign(admittedReasonWrong);
    expect(verifyEvaluationRunIntegrityArtifactV2(admittedReasonWrong)).toBe(false);

    for (const artifact of [rejectedArtifact(), safetyBlockedArtifact()]) {
      artifact.lifecycleLedger.documents[0]!.aiStates.canonical_admitted = { state: "completed", reasonCodes: ["canonical_admission_admitted"] };
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }

    for (const artifact of [rejectedArtifact(), safetyBlockedArtifact()]) {
      lifecycleAdmissionEvent(artifact).state = "completed";
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }

    const customerStateCompleted = validArtifact();
    customerStateCompleted.lifecycleLedger.documents[0]!.aiStates.customer_published = { state: "completed", reasonCodes: ["customer_publication_completed"] };
    resign(customerStateCompleted);
    expect(verifyEvaluationRunIntegrityArtifactV2(customerStateCompleted)).toBe(false);

    const hiddenPublicationRef = validArtifact();
    lifecycleAdmissionEvent(hiddenPublicationRef).customerPublicationRef = "publication_unexpected";
    resign(hiddenPublicationRef);
    expect(verifyEvaluationRunIntegrityArtifactV2(hiddenPublicationRef)).toBe(false);
  });

  it("rejects customer publication in either result or lifecycle", () => {
    const resultPublished = validArtifact() as unknown as Record<string, any>;
    resultPublished.canonicalAdmissionResults[0].customerPublished = true;
    resign(resultPublished);
    expect(verifyEvaluationRunIntegrityArtifactV2(resultPublished)).toBe(false);

    const lifecyclePublished = validArtifact();
    const event = lifecyclePublished.lifecycleLedger.documents[0]!.events.find((item) => item.stage === "customer_publication")!;
    event.state = "completed";
    event.customerPublicationRef = "publication_unsafe";
    resign(lifecyclePublished);
    expect(verifyEvaluationRunIntegrityArtifactV2(lifecyclePublished)).toBe(false);
  });

  it("rejects authority and financial-mutation permissions at every envelope boundary", () => {
    const mutations: Array<(result: Record<string, any>) => void> = [
      (r) => { r.authoritative = true; },
      (r) => { r.financialMutationAllowed = true; },
      (r) => { r.admission.authoritative = true; },
      (r) => { r.admission.financialMutationAllowed = true; },
      (r) => { r.packageF.authoritative = true; },
      (r) => { r.packageF.financialMutationAllowed = true; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0]);
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }
  });

  it.each([
    "$123",
    "2.9%",
    "25 bps",
    "https://unsafe.example/document",
    "/private/tmp/source.pdf",
    "sk-secretcredentialvalue",
    "OpenAI gpt-5 provider detail",
    "Anthropic Claude model detail",
    "merchant_name_acme",
    "raw prompt and response",
  ])("rejects sensitive or customer-identifying content: %s", (unsafe) => {
    const artifact = validArtifact();
    artifact.canonicalAdmissionResults[0]!.packageF!.output.rowInterpretations[0]!.conciseRationale = unsafe;
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("preserves every approved dotted fact reference without treating machine fields as prose", () => {
    for (const factRef of [
      "identity.merchantName",
      "financialFacts.processedSales",
      "financialFacts.totalFees",
      "financialFacts.rateRevealCalculatedAllInRate",
      "financialFacts.effectiveRateBasis",
      "opportunityEngine.summary",
      "opportunityEngine.components",
      "aiCapabilities.summary",
      "customerState.primaryState",
      "customerState.axes",
      "customerState.rateComparison",
      "customerState.visibility",
      "customerState.actionGuidance",
    ]) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      const result = artifact.canonicalAdmissionResults[0];
      result.packageF.output.factRefs = [factRef];
      result.canonicalReferenceProof.approvedFactRefs = [factRef];
      result.canonicalReferenceProof.canonicalReferenceProjectionHash = calculateEvaluationCanonicalReferenceProjectionHash(result.canonicalReferenceProof);
      result.package5a.diagnosticRefs = ["feerow_one", factRef].sort();
      result.resultId = "admission_result_merchant_reference";
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    }
  });

  it("still rejects merchant-name words in prose and unapproved dotted references", () => {
    const unsafeProse = validArtifact();
    unsafeProse.canonicalAdmissionResults[0]!.packageF!.output.rowInterpretations[0]!.conciseRationale = "Merchant name must remain internal.";
    resign(unsafeProse);
    expect(verifyEvaluationRunIntegrityArtifactV2(unsafeProse)).toBe(false);

    const foreignFact = validArtifact() as unknown as Record<string, any>;
    foreignFact.canonicalAdmissionResults[0].packageF.output.factRefs = ["identity.internalMerchantLabel"];
    foreignFact.canonicalAdmissionResults[0].canonicalReferenceProof.approvedFactRefs = ["identity.internalMerchantLabel"];
    foreignFact.canonicalAdmissionResults[0].canonicalReferenceProof.canonicalReferenceProjectionHash = calculateEvaluationCanonicalReferenceProjectionHash(foreignFact.canonicalAdmissionResults[0].canonicalReferenceProof);
    expectResignedInvalid(foreignFact);
  });

  it("rejects orphaned attempts, candidates, and claim supports", () => {
    const mutations: Array<(result: Record<string, any>) => void> = [
      (r) => { r.researchEvidence.attempts[0].candidateRefs.push("candidate_missing"); r.researchEvidence.attempts[0].candidateRefs.sort(); },
      (r) => { r.researchEvidence.candidates[0].researchAttemptRef = "research_attempt_missing"; },
      (r) => { r.researchEvidence.claimSupports[0].candidateRef = "candidate_missing"; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0]);
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }
  });

  it("rejects accepted/rejected support partition gaps and overlaps", () => {
    const gap = validArtifact();
    gap.canonicalAdmissionResults[0]!.admission.rejectedClaimSupportRefs = [];
    resign(gap);
    expect(verifyEvaluationRunIntegrityArtifactV2(gap)).toBe(false);

    const overlap = validArtifact();
    overlap.canonicalAdmissionResults[0]!.admission.rejectedClaimSupportRefs = ["claim_support_a", "claim_support_b"];
    resign(overlap);
    expect(verifyEvaluationRunIntegrityArtifactV2(overlap)).toBe(false);
  });

  it("binds support disposition, exact reasons, and partition independently", () => {
    const staleDisposition = validArtifact() as unknown as Record<string, any>;
    staleDisposition.canonicalAdmissionResults[0].researchEvidence.claimSupports[0].disposition = "rejected";
    expectResignedInvalid(staleDisposition);

    const cleanSupportRejected = validArtifact() as unknown as Record<string, any>;
    const clean = cleanSupportRejected.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
    clean.disposition = "rejected";
    rebindSupportDecision(clean);
    cleanSupportRejected.canonicalAdmissionResults[0].admission.acceptedClaimSupportRefs = [];
    cleanSupportRejected.canonicalAdmissionResults[0].admission.rejectedClaimSupportRefs = ["claim_support_a", "claim_support_b"];
    refreshSupportDecisionProof(cleanSupportRejected.canonicalAdmissionResults[0]);
    expectResignedInvalid(cleanSupportRejected);

    const unsupportedAccepted = validArtifact() as unknown as Record<string, any>;
    const unsupported = unsupportedAccepted.canonicalAdmissionResults[0].researchEvidence.claimSupports[1];
    unsupported.disposition = "accepted";
    rebindSupportDecision(unsupported);
    unsupportedAccepted.canonicalAdmissionResults[0].admission.acceptedClaimSupportRefs = ["claim_support_a", "claim_support_b"];
    unsupportedAccepted.canonicalAdmissionResults[0].admission.rejectedClaimSupportRefs = [];
    refreshSupportDecisionProof(unsupportedAccepted.canonicalAdmissionResults[0]);
    expectResignedInvalid(unsupportedAccepted);

    const wrongReason = validArtifact() as unknown as Record<string, any>;
    const support = wrongReason.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
    support.reasonCodes = ["fee_knowledge_unsupported"];
    rebindSupportDecision(support);
    refreshSupportDecisionProof(wrongReason.canonicalAdmissionResults[0]);
    expectResignedInvalid(wrongReason);
  });

  it("requires exact status counts for every canonical acceptance state", async () => {
    const accepted = await realRuntimeCanonicalArtifact();
    expect(accepted.artifact.canonicalAdmissionResults[0]!.admission.safeCounts).toMatchObject({
      acceptedRecordCount: 1,
      needsVerificationRecordCount: 0,
      humanReviewRecordCount: 0,
      rejectedRecordCount: 0,
    });

    for (const key of ["acceptedRecordCount", "needsVerificationRecordCount", "humanReviewRecordCount", "rejectedRecordCount"] as const) {
      const artifact = structuredClone(accepted.artifact) as unknown as Record<string, any>;
      artifact.canonicalAdmissionResults[0].admission.safeCounts[key] += 1;
      expectResignedInvalid(artifact);
    }

    const humanReview = validArtifact() as unknown as Record<string, any>;
    setStatementOnlyPackageF(humanReview, canonicalStatementOnlyOutput({ recommendedDisposition: "human_review" }));
    resign(humanReview);
    expect(verifyEvaluationRunIntegrityArtifactV2(humanReview)).toBe(true);
    expect(humanReview.canonicalAdmissionResults[0].admission.safeCounts).toMatchObject({
      acceptedRecordCount: 0,
      needsVerificationRecordCount: 0,
      humanReviewRecordCount: 1,
      rejectedRecordCount: 0,
    });
  });

  it("rejects plausible but nonexistent limitation and output reason codes", () => {
    const unknownLimitation = validArtifact() as unknown as Record<string, any>;
    unknownLimitation.canonicalAdmissionResults[0].packageF.output.limitationCodes = ["plausible_nonexistent_limitation"];
    expectResignedInvalid(unknownLimitation);

    const unknownReason = validArtifact() as unknown as Record<string, any>;
    unknownReason.canonicalAdmissionResults[0].packageF.output.reasonCodes = ["whole_statement_fee_intelligence_plausible_nonexistent_reason"];
    expectResignedInvalid(unknownReason);
  });

  it("constructs the packet proof from the supplied packet and rejects stale packet bindings", () => {
    const fixture = artifactFixture();
    const packet = fixturePreparedPacket();
    const artifact = buildFixtureArtifact(fixture);
    expect(artifact.canonicalAdmissionResults[0]!.canonicalReferenceProof.preparedSanitizedPacketContentHash).toBe(sha256Canonical(packet));

    const stalePacket = structuredClone(packet) as unknown as Record<string, any>;
    stalePacket.wholeStatementReview.statementContext.processorName = "Changed Processor";
    expect(() => buildEvaluationRunIntegrityArtifactV2({
      ...fixture.v1Input,
      canonicalAdmissionResults: [fixture.result],
      preparedSanitizedPackets: [{ resultId: fixture.result.resultId, packet: stalePacket as never }],
    })).toThrow("prepared-packet hash failed closed");
  });

  it("hashes the complete prepared packet when only a research question changes", () => {
    const original = fixturePreparedPacket();
    const changed = fixturePreparedPacket({
      wholeStatementReview: original.wholeStatementReview,
      questions: [fixtureResearchQuestion({ feeLabel: "Changed synthetic label" })],
    });
    expect(sha256Canonical(changed.wholeStatementReview)).toBe(sha256Canonical(original.wholeStatementReview));
    expect(sha256Canonical(changed)).not.toBe(sha256Canonical(original));
  });

  it.each([
    ["fee label", { feeLabel: "Changed service charge" }],
    ["processor or network", { processorOrNetwork: "Changed synthetic network" }],
    ["statement section", { statementSection: "Changed fee section" }],
    ["statement-period year", { statementPeriodYear: "2031" }],
    ["deterministic category", { deterministicCategory: "service_fee" }],
    ["deterministic economic owner", { deterministicEconomicOwner: "network" }],
    ["deterministic contractual controller", { deterministicContractualController: "merchant_contract" }],
    ["deterministic actionability", { deterministicActionabilityCeiling: "verify_only" }],
    ["deterministic confidence", { deterministicConfidence: "medium" }],
    ["semantic question", { semanticQuestion: "What supports this changed synthetic classification?" }],
  ] satisfies Array<[string, Partial<FeeKnowledgeResearchQuestion>]>)
  ("changes the opaque question reference when only %s changes", (_label, change) => {
    const original = fixtureResearchQuestion();
    const changed = fixtureResearchQuestion(change);
    expect(calculateEvaluationResearchQuestionRef(changed, 1))
      .not.toBe(calculateEvaluationResearchQuestionRef(original, 1));
  });

  it("rejects reuse of an original attempt reference after the exact prepared question changes", () => {
    const originalQuestion = fixtureResearchQuestion();
    const changedQuestion = fixtureResearchQuestion({ feeLabel: "Changed service charge" });
    const originalRef = calculateEvaluationResearchQuestionRef(originalQuestion, 1);
    const artifact = buildFixtureArtifactForResearchQuestions({ questions: [changedQuestion] }) as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    expect(result.canonicalReferenceProof.expectedResearchQuestions.questions[0].questionRef).not.toBe(originalRef);
    result.researchEvidence.attempts[0].questionRef = originalRef;
    for (const candidate of result.researchEvidence.candidates) candidate.questionRef = originalRef;
    for (const support of result.researchEvidence.claimSupports) {
      support.questionRef = originalRef;
      rebindSupportDecision(support);
    }
    refreshSupportDecisionProof(result);
    expectResignedInvalid(artifact);
  });

  it("assigns different references to questions with the same safe projection but different semantic content", () => {
    const first = fixtureResearchQuestion();
    const second = fixtureResearchQuestion({ semanticQuestion: "What documentation supports this synthetic fee?" });
    expect(calculateEvaluationResearchQuestionRef(first, 1)).not.toBe(calculateEvaluationResearchQuestionRef(second, 1));
    const projection = buildEvaluationExpectedResearchQuestionProjection(fixturePreparedPacket({ questions: [first, second] }));
    expect(projection.questions[0]).toMatchObject({ feeRowRef: "feerow_one", sanitizedQuestionCategory: "classification", triggerReason: "material_unfamiliar_label" });
    expect(projection.questions[1]).toMatchObject({ feeRowRef: "feerow_one", sanitizedQuestionCategory: "classification", triggerReason: "material_unfamiliar_label" });
    expect(projection.questions[0]!.questionRef).not.toBe(projection.questions[1]!.questionRef);
  });

  it("hashes the complete prepared packet when only a research limit changes", () => {
    const original = fixturePreparedPacket();
    const changedLimits = {
      ...FEE_KNOWLEDGE_RESEARCH_LIMITS,
      maxRetrievalCandidates: 4,
    } as unknown as OneTimeStatementEvaluationPacket["research"]["limits"];
    const changed = fixturePreparedPacket({
      wholeStatementReview: original.wholeStatementReview,
      questions: original.research.questions,
      limits: changedLimits,
    });
    expect(sha256Canonical(changed.wholeStatementReview)).toBe(sha256Canonical(original.wholeStatementReview));
    expect(sha256Canonical(changed)).not.toBe(sha256Canonical(original));
  });

  it("rejects a changed research population while the whole-statement packet is unchanged", () => {
    const fixture = artifactFixture();
    const original = fixturePreparedPacket();
    const changed = fixturePreparedPacket({
      wholeStatementReview: original.wholeStatementReview,
      questions: [fixtureResearchQuestion({ triggerReason: "contradicted_source" })],
    });
    expect(() => buildEvaluationRunIntegrityArtifactV2({
      ...fixture.v1Input,
      canonicalAdmissionResults: [fixture.result],
      preparedSanitizedPackets: [{ resultId: fixture.result.resultId, packet: changed }],
    })).toThrow("prepared-packet hash failed closed");
  });

  it("rejects an omitted expected attempt after every artifact hash is recomputed", () => {
    const artifact = buildFixtureArtifactForResearchQuestions({
      questions: [fixtureResearchQuestion(), fixtureResearchQuestion()],
    }) as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    const removed = result.researchEvidence.attempts.pop();
    result.admission.researchAttemptRefs = result.admission.researchAttemptRefs
      .filter((ref: string) => ref !== removed.researchAttemptRef);
    result.admission.safeCounts.researchAttemptCount -= 1;
    expectResignedInvalid(artifact);
  });

  it("rejects a foreign attempt outside the prepared question population", () => {
    const artifact = buildFixtureArtifactForResearchQuestions({
      questions: [fixtureResearchQuestion(), fixtureResearchQuestion()],
    }) as unknown as Record<string, any>;
    const foreignQuestion = fixtureResearchQuestion({ semanticQuestion: "Foreign synthetic question." });
    addAttempt(artifact, {
      researchAttemptRef: "research_attempt_tertiary",
      questionRef: calculateEvaluationResearchQuestionRef(foreignQuestion, 3),
      questionOrdinal: 3,
      sanitizedQuestionCategory: "classification",
      triggerReason: "material_unfamiliar_label",
      candidateRefs: [],
      resultCount: 0,
      status: "completed",
      reasonCodes: ["fee_knowledge_research_completed"],
    });
    expectResignedInvalid(artifact);
  });

  it("records budget exhaustion for the third prepared question and refuses complete admission", () => {
    const prepared = prepareFixtureResearchQuestions({
      questions: [fixtureResearchQuestion(), fixtureResearchQuestion(), fixtureResearchQuestion()],
      statuses: ["completed", "completed", "budget_exhausted"],
    });
    expect(prepared.result.researchEvidence.attempts).toContainEqual(expect.objectContaining({
      questionOrdinal: 3,
      status: "budget_exhausted",
      reasonCodes: ["fee_knowledge_research_budget_exhausted"],
    }));
    expect(() => buildEvaluationRunIntegrityArtifactV2({
      ...prepared.fixture.v1Input,
      canonicalAdmissionResults: [prepared.result],
      preparedSanitizedPackets: [{ resultId: prepared.result.resultId, packet: prepared.packet }],
    })).toThrow("Evaluation Artifact V2 validation failed closed");
  });

  it("keeps two prepared questions for the same fee row separately represented", () => {
    const artifact = buildFixtureArtifactForResearchQuestions({
      questions: [fixtureResearchQuestion(), fixtureResearchQuestion()],
    });
    const result = artifact.canonicalAdmissionResults[0]!;
    expect(result.canonicalReferenceProof.expectedResearchQuestions.questions).toHaveLength(2);
    expect(new Set(result.canonicalReferenceProof.expectedResearchQuestions.questions.map((question) => question.questionRef)).size).toBe(2);
    expect(result.researchEvidence.attempts.map((attempt) => attempt.questionRef).sort()).toEqual(
      result.canonicalReferenceProof.expectedResearchQuestions.questions.map((question) => question.questionRef).sort(),
    );
  });

  it("rejects every question-to-attempt metadata mismatch after rehashing", () => {
    const mutations: Array<(attempt: Record<string, any>) => void> = [
      (attempt) => { attempt.feeRowRef = "feerow_foreign"; },
      (attempt) => { attempt.questionOrdinal = 2; },
      (attempt) => { attempt.sanitizedQuestionCategory = "published_rule"; },
      (attempt) => { attempt.triggerReason = "contradicted_source"; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0].researchEvidence.attempts[0]);
      expectResignedInvalid(artifact);
    }
  });

  it("rejects duplicate expected question references after all hashes are recomputed", () => {
    const artifact = buildFixtureArtifactForResearchQuestions({
      questions: [fixtureResearchQuestion(), fixtureResearchQuestion()],
    }) as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    const questions = result.canonicalReferenceProof.expectedResearchQuestions.questions;
    questions[1].questionRef = questions[0].questionRef;
    result.canonicalReferenceProof.canonicalReferenceProjectionHash = calculateEvaluationCanonicalReferenceProjectionHash(result.canonicalReferenceProof);
    expectResignedInvalid(artifact);
  });

  it("cryptographically covers both the complete packet binding and unchanged Package F output", () => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    const originalWholeStatementOutput = structuredClone(artifact.canonicalAdmissionResults[0].packageF.output);
    artifact.canonicalAdmissionResults[0].canonicalReferenceProof.preparedSanitizedPacketContentHash = `sha256:${"f".repeat(64)}`;
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);

    const packageFMutation = validArtifact() as unknown as Record<string, any>;
    packageFMutation.canonicalAdmissionResults[0].packageF.output = originalWholeStatementOutput;
    packageFMutation.canonicalAdmissionResults[0].packageF.output.rowInterpretations[0].confidence = "medium";
    expect(verifyEvaluationRunIntegrityArtifactV2(packageFMutation)).toBe(false);
  });

  it("keeps research prose and processor labels out of the expected-question projection", () => {
    const projection = buildEvaluationExpectedResearchQuestionProjection(fixturePreparedPacket());
    const serialized = JSON.stringify(projection);
    for (const hiddenValue of [
      "Synthetic processor",
      "Service charge",
      "Fees",
      "2030",
      "processor_markup",
      "potentially_actionable",
      "How is this synthetic service charge classified?",
    ]) expect(serialized).not.toContain(hiddenValue);
    expect(projection.questions[0]).toEqual({ questionRef: FIXTURE_QUESTION_REF, ...FIXTURE_QUESTION_CONTRACT });
  });

  it("blocks V2 verification when Packages B-E invariance is false or incomplete", () => {
    const artifact = validArtifact();
    const result = artifact.packageFinancialInvariance[0]!.result;
    result.packages[2]!.invariant = false;
    result.packages[2]!.mismatchPaths = ["package_d.rows[0].classification"];
    result.invariant = false;
    result.liveRunBlocked = true;
    result.mismatchPaths = ["package_d.rows[0].classification"];
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("requires the exact Packages B-E invariance versions, package order, and canonical hashes", () => {
    const mutations: Array<(result: Record<string, any>) => void> = [
      (result) => { result.type = "packages_b_e_financial_invariance_v2"; },
      (result) => { result.projectionVersion = "packages_b_e_financial_invariance_projection_v3"; },
      (result) => { result.packages[1].projectionVersion = "package_c_fee_ledger_projection_v3"; },
      (result) => { result.packages[3] = structuredClone(result.packages[2]); },
      (result) => { result.packages.pop(); },
      (result) => { [result.packages[0], result.packages[1]] = [result.packages[1], result.packages[0]]; },
      (result) => { result.packages[0].beforeHash = "same_arbitrary_text"; result.packages[0].afterHash = "same_arbitrary_text"; },
      (result) => { result.beforeCombinedHash = "same_arbitrary_text"; result.afterCombinedHash = "same_arbitrary_text"; },
      (result) => { result.packages[0].beforeHash = `sha256:${"A".repeat(64)}`; result.packages[0].afterHash = `sha256:${"A".repeat(64)}`; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.packageFinancialInvariance[0].result);
      expectResignedInvalid(artifact);
    }
  });

  it("enforces canonical ordering and produces deterministic nested and top-level hashes", () => {
    const first = validArtifact();
    const second = validArtifact();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.canonicalAdmissionResults[0]!.resultContentHash).toBe(second.canonicalAdmissionResults[0]!.resultContentHash);
    expect(first.artifactContentHash).toBe(second.artifactContentHash);

    first.canonicalAdmissionResults[0]!.researchEvidence.candidates.reverse();
    resign(first);
    expect(verifyEvaluationRunIntegrityArtifactV2(first)).toBe(false);
  });

  it("does not mutate V1 inputs or canonical-admission result inputs", () => {
    const fixture = artifactFixture();
    const beforeV1 = structuredClone(fixture.v1Input);
    const beforeResult = structuredClone(fixture.result);
    buildFixtureArtifact(fixture);
    expect(fixture.v1Input).toEqual(beforeV1);
    expect(fixture.result).toEqual(beforeResult);
  });

  it("preserves every canonical research enum value that the former V2 projection lost", () => {
    const mutations: Array<(support: Record<string, any>) => void> = [
      ...["classification", "published_rule", "merchant_application", "unavailable", "unsupported"].map((value) => (support: Record<string, any>) => { support.structuredClaim.claimKind = value; }),
      ...[null, "interchange", "card_brand_network_assessment", "network_access_or_authorization", "processor_markup", "processor_per_item_fee", "administrative_fee", "service_fee", "compliance_fee", "equipment_or_lease", "third_party_product", "chargeback_or_dispute", "funding_adjustment", "tax_or_government", "credit", "unknown_needs_review"].map((value) => (support: Record<string, any>) => { support.structuredClaim.proposedCategory = value; }),
      ...[null, "network", "card_brand", "issuer_or_interchange", "processor", "third_party", "merchant_contract", "tax_or_government", "unknown"].map((value) => (support: Record<string, any>) => { support.structuredClaim.likelyEconomicOwner = value; }),
      ...[null, "network", "card_brand", "issuer_or_interchange", "processor", "third_party", "merchant_contract", "tax_or_government", "unknown"].map((value) => (support: Record<string, any>) => { support.structuredClaim.likelyContractualController = value; }),
      ...["high", "medium", "low"].map((value) => (support: Record<string, any>) => { support.structuredClaim.maximumConfidence = value; }),
      ...["potentially_actionable", "verify_only", "not_actionable", "unknown"].map((value) => (support: Record<string, any>) => { support.structuredClaim.actionabilityCeiling = value; }),
      ...["not_evaluated", "statement_basis_matches", "statement_basis_mismatch", "not_applicable"].map((value) => (support: Record<string, any>) => { support.structuredClaim.applicationBasis = value; }),
      ...["supports", "partially_supports", "does_not_support", "contradicts", "unsupported"].map((value) => (support: Record<string, any>) => { support.semanticDecision = value; }),
      ...["verified_classification", "verified_rule", "verified_application", "possible_interpretation", "needs_verification", "conflicting_evidence", "unsupported", "source_unavailable", "source_inapplicable"].map((value) => (support: Record<string, any>) => { support.evidenceDecision = value; support.reasonCodes = [`fee_knowledge_${value}`]; }),
      (support) => { support.applicability = { processorOrNetwork: false, jurisdiction: true, transactionContext: false, statementPeriod: false }; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[1];
      mutate(support);
      rebindSupportDecision(support);
      refreshSupportDecisionProof(artifact.canonicalAdmissionResults[0]);
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    }
  });

  it.each(["fee_classification", "network_assessment", "review_only", "exact_fee_row", "applicable", "contradicted"])("rejects former lossy V2 enum value %s", (legacyValue) => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[1];
    if (legacyValue === "fee_classification") support.structuredClaim.claimKind = legacyValue;
    else if (legacyValue === "network_assessment") support.structuredClaim.proposedCategory = legacyValue;
    else if (legacyValue === "review_only") support.structuredClaim.actionabilityCeiling = legacyValue;
    else if (legacyValue === "exact_fee_row") support.structuredClaim.applicationBasis = legacyValue;
    else if (legacyValue === "applicable") support.applicability.statementPeriod = legacyValue;
    else support.evidenceDecision = legacyValue;
    rebindSupportDecision(support);
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
  });

  it("rejects incomplete research execution inside an admitted result", () => {
    for (const [status, reason] of [["budget_exhausted", "fee_knowledge_research_budget_exhausted"], ["failed", "fee_knowledge_research_failed"], ["timed_out", "fee_knowledge_research_timed_out"], ["safety_blocked", "fee_knowledge_research_safety_blocked"], ["unsupported_model", "fee_knowledge_web_search_model_unsupported"]]) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      Object.assign(artifact.canonicalAdmissionResults[0].researchEvidence.attempts[0], { status, reasonCodes: [reason] });
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }
  });

  it.each([
    ["failed", "fee_knowledge_research_failed"],
    ["timed_out", "fee_knowledge_research_timed_out"],
  ])("preserves completed candidate records when a later research attempt %s", (status, reason) => {
    const artifact = rejectedArtifact() as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    Object.assign(result.researchEvidence.attempts[0], { status, reasonCodes: [reason] });
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    expect(result.admissionDisposition).toBe("rejected");
    expect(result.researchEvidence.attempts[0].resultCount).toBe(2);
    expect(result.researchEvidence.candidates).toHaveLength(2);
  });

  it.each([
    ["disabled", "fee_knowledge_research_disabled"],
    ["not_needed", "fee_knowledge_research_not_needed"],
    ["budget_exhausted", "fee_knowledge_research_budget_exhausted"],
    ["unsupported_model", "fee_knowledge_web_search_model_unsupported"],
  ])("rejects retained candidates for non-discovery attempt status %s", (status, reason) => {
    const artifact = rejectedArtifact() as unknown as Record<string, any>;
    Object.assign(artifact.canonicalAdmissionResults[0].researchEvidence.attempts[0], { status, reasonCodes: [reason] });
    expectResignedInvalid(artifact);
  });

  it("accepts a pre-discovery safety block with no retained candidates", () => {
    const artifact = safetyBlockedResearchArtifact("pre_discovery");
    const result = artifact.canonicalAdmissionResults[0]!;
    expect(result.researchEvidence.attempts[0]).toMatchObject({
      status: "safety_blocked",
      resultCount: 0,
      candidateRefs: [],
      reasonCodes: ["fee_knowledge_research_safety_blocked"],
    });
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
  });

  it.each([
    ["retrieval", "safety_blocked", "not_started", "fee_knowledge_url_private_ip"],
    ["semantic", "retrieved_text", "safety_blocked", "fee_knowledge_semantic_safety_blocked"],
  ] as const)("accepts a post-discovery %s safety block with exact candidate parentage", (mode, retrievalStatus, semanticStatus, safetyReason) => {
    const artifact = safetyBlockedResearchArtifact(mode);
    const result = artifact.canonicalAdmissionResults[0]!;
    const attempt = result.researchEvidence.attempts[0]!;
    const candidate = result.researchEvidence.candidates[0]!;
    expect(candidate).toMatchObject({
      researchAttemptRef: attempt.researchAttemptRef,
      questionRef: attempt.questionRef,
      feeRowRef: attempt.feeRowRef,
      verificationStatus: "safety_blocked",
      retrievalStatus,
      semanticVerificationStatus: semanticStatus,
      claimSupportRefs: [],
    });
    expect(candidate.reasonCodes).toContain(safetyReason);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
  });

  it("rejects a non-safety candidate retained by a safety-blocked attempt", () => {
    const artifact = safetyBlockedResearchArtifact("retrieval") as unknown as Record<string, any>;
    Object.assign(artifact.canonicalAdmissionResults[0].researchEvidence.candidates[0], {
      verificationStatus: "verified_candidate_limited",
      retrievalStatus: "retrieved_text",
      semanticVerificationStatus: "completed",
      reasonCodes: ["fee_knowledge_text_retrieved", "fee_knowledge_unsupported"],
    });
    expectResignedInvalid(artifact);
  });

  it("rejects accepted claim support carried by a retained safety-blocked candidate", () => {
    const artifact = safetyBlockedResearchArtifact("retrieval") as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    const acceptedSupport = structuredClone((validArtifact() as unknown as Record<string, any>)
      .canonicalAdmissionResults[0].researchEvidence.claimSupports[0]);
    result.researchEvidence.candidates[0].claimSupportRefs = [acceptedSupport.claimSupportRef];
    result.researchEvidence.claimSupports = [acceptedSupport];
    result.admission.acceptedClaimSupportRefs = [acceptedSupport.claimSupportRef];
    result.admission.safeCounts.claimSupportCount = 1;
    result.canonicalReferenceProof.claimSupportRefs = [acceptedSupport.claimSupportRef];
    refreshSupportDecisionProof(result);
    expectResignedInvalid(artifact);
  });

  it("allows only rejected support on a retained safety-blocked candidate", () => {
    const artifact = safetyBlockedResearchArtifact("semantic") as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    const rejectedSupport = claimSupport("a", "rejected", "unsupported");
    result.researchEvidence.candidates[0].claimSupportRefs = [rejectedSupport.claimSupportRef];
    result.researchEvidence.claimSupports = [rejectedSupport];
    result.admission.rejectedClaimSupportRefs = [rejectedSupport.claimSupportRef];
    result.admission.safeCounts.claimSupportCount = 1;
    result.canonicalReferenceProof.claimSupportRefs = [rejectedSupport.claimSupportRef];
    refreshSupportDecisionProof(result);
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
  });

  it("rejects the wrong safety-attempt reason family", () => {
    const artifact = safetyBlockedResearchArtifact("retrieval") as unknown as Record<string, any>;
    artifact.canonicalAdmissionResults[0].researchEvidence.attempts[0].reasonCodes = ["fee_knowledge_research_failed"];
    expectResignedInvalid(artifact);
  });

  it.each([
    ["retrieval", ["fee_knowledge_retrieval_fetch_failed", "fee_knowledge_semantic_support_not_run"]],
    ["semantic", ["fee_knowledge_semantic_failed", "fee_knowledge_text_retrieved"]],
  ] as const)("rejects a forged %s safety reason", (mode, reasonCodes) => {
    const artifact = safetyBlockedResearchArtifact(mode) as unknown as Record<string, any>;
    artifact.canonicalAdmissionResults[0].researchEvidence.candidates[0].reasonCodes = [...reasonCodes].sort();
    expectResignedInvalid(artifact);
  });

  it.each(["researchAttemptRef", "questionRef", "feeRowRef"] as const)("rejects foreign safety-candidate %s parentage", (field) => {
    const artifact = safetyBlockedResearchArtifact("retrieval") as unknown as Record<string, any>;
    const candidate = artifact.canonicalAdmissionResults[0].researchEvidence.candidates[0];
    candidate[field] = field === "researchAttemptRef"
      ? "research_attempt_foreign"
      : field === "questionRef"
        ? `question_${"f".repeat(64)}`
        : "feerow_foreign";
    expectResignedInvalid(artifact);
  });

  it("applies normal candidate-count limits to safety-blocked retention", () => {
    const artifact = safetyBlockedResearchArtifact("retrieval") as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    const candidateRefs = Array.from({ length: FEE_KNOWLEDGE_RESEARCH_LIMITS.maxResultCandidatesPerSearch + 1 }, (_, index) => `candidate_safety_${index + 1}`);
    Object.assign(result.researchEvidence.attempts[0], { candidateRefs, resultCount: candidateRefs.length });
    expectResignedInvalid(artifact);
  });

  it("never admits or attaches Package F to a safety-blocked research graph", () => {
    const safetyArtifact = safetyBlockedResearchArtifact("retrieval");
    expect(safetyArtifact.canonicalAdmissionResults[0]!.admissionDisposition).toBe("safety_blocked");
    expect(safetyArtifact.canonicalAdmissionResults[0]!.packageF).toBeNull();

    const packageF = safetyBlockedResearchArtifact("retrieval") as unknown as Record<string, any>;
    packageF.canonicalAdmissionResults[0].packageF = structuredClone((validArtifact() as unknown as Record<string, any>)
      .canonicalAdmissionResults[0].packageF);
    expectResignedInvalid(packageF);

    const admitted = validArtifact() as unknown as Record<string, any>;
    Object.assign(admitted.canonicalAdmissionResults[0].researchEvidence.attempts[0], {
      status: "safety_blocked",
      reasonCodes: ["fee_knowledge_research_safety_blocked"],
    });
    expectResignedInvalid(admitted);
  });

  it("rejects admission when an unused second candidate has incomplete retrieval", () => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    Object.assign(result.researchEvidence.candidates[1], {
      verificationStatus: "rejected",
      retrievalStatus: "failed",
      semanticVerificationStatus: "not_started",
      reasonCodes: ["fee_knowledge_retrieval_fetch_failed", "fee_knowledge_semantic_support_not_run"],
    });
    expect(result.packageF.output.rowInterpretations[0].externalClaimSupportRef).toBe("claim_support_a");
    expect(result.researchEvidence.candidates[1].claimSupportRefs).toEqual(["claim_support_b"]);
    expectResignedInvalid(artifact);
  });

  it("retains a fully processed unsupported second candidate as rejected evidence", () => {
    const artifact = validArtifact();
    const result = artifact.canonicalAdmissionResults[0]!;
    expect(result.researchEvidence.candidates[1]).toMatchObject({
      verificationStatus: "verified_candidate_limited",
      retrievalStatus: "retrieved_text",
      semanticVerificationStatus: "completed",
      claimSupportRefs: ["claim_support_b"],
    });
    expect(result.admission.rejectedClaimSupportRefs).toContain("claim_support_b");
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
  });

  it("rejects admission when a fully processed candidate is missing its terminal support proof", () => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    const result = artifact.canonicalAdmissionResults[0];
    result.researchEvidence.candidates[1].claimSupportRefs = [];
    result.researchEvidence.claimSupports = result.researchEvidence.claimSupports
      .filter((support: Record<string, any>) => support.claimSupportRef !== "claim_support_b");
    result.admission.rejectedClaimSupportRefs = [];
    result.admission.safeCounts.claimSupportCount = 1;
    result.canonicalReferenceProof.claimSupportRefs = ["claim_support_a"];
    refreshSupportDecisionProof(result);
    expectResignedInvalid(artifact);
  });

  it("rejects failed retrieval or semantic verification for a selected candidate", () => {
    for (const mutate of [(candidate: Record<string, any>) => { candidate.retrievalStatus = "failed"; }, (candidate: Record<string, any>) => { candidate.semanticVerificationStatus = "parse_failed"; }]) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0].researchEvidence.candidates[0]);
      resign(artifact);
      expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
    }
  });

  it("requires exact retrieval reason families for every candidate retrieval state", () => {
    const cases = [
      { retrievalStatus: "retrieved_text", semanticVerificationStatus: "completed", verificationStatus: "verified_candidate_limited", reasonCodes: ["fee_knowledge_text_retrieved", "fee_knowledge_unsupported"] },
      { retrievalStatus: "retrieval_succeeded_text_unavailable", semanticVerificationStatus: "not_started", verificationStatus: "source_unavailable", reasonCodes: ["fee_knowledge_semantic_support_not_run", "fee_knowledge_text_unavailable"] },
      { retrievalStatus: "unavailable", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_http_404", "fee_knowledge_semantic_support_not_run"] },
      { retrievalStatus: "failed", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_retrieval_fetch_failed", "fee_knowledge_semantic_support_not_run"] },
      { retrievalStatus: "timed_out", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_retrieval_timed_out", "fee_knowledge_semantic_support_not_run"] },
      { retrievalStatus: "safety_blocked", semanticVerificationStatus: "not_started", verificationStatus: "safety_blocked", reasonCodes: ["fee_knowledge_semantic_support_not_run", "fee_knowledge_url_private_ip"] },
      { retrievalStatus: "unsupported_content_type", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_content_type_unsupported", "fee_knowledge_semantic_support_not_run"] },
      { retrievalStatus: "oversized", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_response_oversized", "fee_knowledge_semantic_support_not_run"] },
      { retrievalStatus: "malformed", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_pdf_parse_failed", "fee_knowledge_semantic_support_not_run"] },
      { retrievalStatus: "encrypted", semanticVerificationStatus: "not_started", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_pdf_encrypted", "fee_knowledge_semantic_support_not_run"] },
    ];
    for (const changes of cases) {
      const valid = candidateStateArtifact();
      Object.assign(valid.canonicalAdmissionResults[0].researchEvidence.candidates[1], changes);
      resign(valid);
      expect(verifyEvaluationRunIntegrityArtifactV2(valid)).toBe(true);

      const hostile = candidateStateArtifact();
      Object.assign(hostile.canonicalAdmissionResults[0].researchEvidence.candidates[1], changes, {
        reasonCodes: changes.semanticVerificationStatus === "not_started" ? ["fee_knowledge_semantic_support_not_run"] : ["fee_knowledge_unsupported"],
      });
      expectResignedInvalid(hostile);
    }
  });

  it("requires exact semantic reason families for every candidate semantic state", () => {
    const cases = [
      { semanticVerificationStatus: "not_started", verificationStatus: "provisional", reasonCodes: ["fee_knowledge_semantic_support_not_run", "fee_knowledge_text_retrieved"] },
      { semanticVerificationStatus: "completed", verificationStatus: "verified_candidate_limited", reasonCodes: ["fee_knowledge_text_retrieved", "fee_knowledge_unsupported"] },
      { semanticVerificationStatus: "failed", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_semantic_failed", "fee_knowledge_text_retrieved"] },
      { semanticVerificationStatus: "timed_out", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_semantic_timed_out", "fee_knowledge_text_retrieved"] },
      { semanticVerificationStatus: "parse_failed", verificationStatus: "rejected", reasonCodes: ["fee_knowledge_semantic_parse_failed", "fee_knowledge_text_retrieved"] },
      { semanticVerificationStatus: "safety_blocked", verificationStatus: "safety_blocked", reasonCodes: ["fee_knowledge_semantic_safety_blocked", "fee_knowledge_text_retrieved"] },
      { semanticVerificationStatus: "unsupported", verificationStatus: "verified_candidate_limited", reasonCodes: ["fee_knowledge_semantic_unsupported", "fee_knowledge_text_retrieved"] },
    ];
    for (const changes of cases) {
      const valid = candidateStateArtifact();
      Object.assign(valid.canonicalAdmissionResults[0].researchEvidence.candidates[1], changes);
      resign(valid);
      expect(verifyEvaluationRunIntegrityArtifactV2(valid)).toBe(true);

      const hostile = candidateStateArtifact();
      Object.assign(hostile.canonicalAdmissionResults[0].researchEvidence.candidates[1], changes, { reasonCodes: ["fee_knowledge_text_retrieved"] });
      expectResignedInvalid(hostile);
    }
  });

  it("rejects success or verified-evidence reasons attached to non-success candidate states", () => {
    for (const reason of ["fee_knowledge_text_retrieved", "fee_knowledge_pdf_text_retrieved", "fee_knowledge_verified_classification"]) {
      const artifact = candidateStateArtifact();
      Object.assign(artifact.canonicalAdmissionResults[0].researchEvidence.candidates[1], {
        retrievalStatus: "failed",
        semanticVerificationStatus: "not_started",
        verificationStatus: "rejected",
        reasonCodes: ["fee_knowledge_retrieval_fetch_failed", "fee_knowledge_semantic_support_not_run", reason].sort(),
      });
      expectResignedInvalid(artifact);
    }
  });

  it("rejects unknown research statuses and non-allowlisted research reasons", () => {
    const mutations = [
      (result: Record<string, any>) => { result.researchEvidence.attempts[0].status = "unknown"; },
      (result: Record<string, any>) => { result.researchEvidence.candidates[1].verificationStatus = "unknown"; },
      (result: Record<string, any>) => { result.researchEvidence.candidates[1].retrievalStatus = "unknown"; },
      (result: Record<string, any>) => { result.researchEvidence.candidates[1].semanticVerificationStatus = "unknown"; },
      (result: Record<string, any>) => { result.researchEvidence.candidates[1].reasonCodes = ["syntactically_safe_but_unknown"]; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0]);
      expectResignedInvalid(artifact);
    }
  });

  it("enforces exclusive attempt, question, candidate, and support parentage", () => {
    const sharedCandidate = validArtifact() as unknown as Record<string, any>;
    addAttempt(sharedCandidate, { researchAttemptRef: "research_attempt_secondary", questionRef: "question_secondary", candidateRefs: ["candidate_a"], resultCount: 1, status: "completed", reasonCodes: ["fee_knowledge_research_completed"] });
    expectResignedInvalid(sharedCandidate);

    const sharedSupport = validArtifact() as unknown as Record<string, any>;
    sharedSupport.canonicalAdmissionResults[0].researchEvidence.candidates[1].claimSupportRefs = ["claim_support_a", "claim_support_b"];
    expectResignedInvalid(sharedSupport);

    const duplicateQuestion = validArtifact() as unknown as Record<string, any>;
    addAttempt(duplicateQuestion, { researchAttemptRef: "research_attempt_secondary", questionRef: "question_primary", candidateRefs: [], resultCount: 0, status: "not_needed", reasonCodes: ["fee_knowledge_research_not_needed"] });
    expectResignedInvalid(duplicateQuestion);

    const wrongCount = validArtifact() as unknown as Record<string, any>;
    wrongCount.canonicalAdmissionResults[0].researchEvidence.attempts[0].resultCount = 1;
    expectResignedInvalid(wrongCount);
  });

  it("rejects foreign canonical fee-row, evidence, and fact references after rehashing", () => {
    const mutations = [
      (result: Record<string, any>) => { result.packageF.output.rowInterpretations[0].feeRowRef = "feerow_foreign"; },
      (result: Record<string, any>) => { result.packageF.output.evidenceRefs = ["evidence_foreign"]; },
      (result: Record<string, any>) => { result.packageF.output.factRefs = ["fact_foreign"]; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0]);
      expectResignedInvalid(artifact);
    }
  });

  it("binds canonical reference populations to the sanitized packet reference hash", () => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    artifact.canonicalAdmissionResults[0].canonicalReferenceProof.canonicalEvidenceRefs.push("evidence_foreign");
    artifact.canonicalAdmissionResults[0].canonicalReferenceProof.canonicalEvidenceRefs.sort();
    expectResignedInvalid(artifact);
  });

  it("rejects forged or stale claim-support decision references", () => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0].claimSupportDecisionRef = `claim_support_decision_${"f".repeat(64)}`;
    expectResignedInvalid(artifact);
  });

  it("rejects accepted inapplicable, contradictory, or unverified support", () => {
    const mutations = [
      (support: Record<string, any>) => { support.applicability.processorOrNetwork = false; },
      (support: Record<string, any>) => { support.applicability.statementPeriod = false; },
      (support: Record<string, any>) => { support.semanticDecision = "contradicts"; },
      (support: Record<string, any>) => { support.contradictionCodes = ["deterministic_mismatch"]; },
      (support: Record<string, any>) => { support.evidenceDecision = "needs_verification"; support.reasonCodes = ["fee_knowledge_needs_verification"]; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
      mutate(support);
      rebindSupportDecision(support);
      expectResignedInvalid(artifact);
    }
  });

  it("rejects Package 5A execution and final-status inconsistencies", () => {
    for (const [executionState, finalCanonicalStatus] of [["failed", "rejected"], ["timed_out", "failed"], ["completed", "timed_out"]]) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      Object.assign(artifact.canonicalAdmissionResults[0].package5a, { executionState, finalCanonicalStatus });
      expectResignedInvalid(artifact);
    }
  });

  it("rejects disposition and reason-code inconsistencies", () => {
    const admittedWithRejection = validArtifact() as unknown as Record<string, any>;
    admittedWithRejection.canonicalAdmissionResults[0].reasonCodes = ["canonical_admission_rejected"];
    expectResignedInvalid(admittedWithRejection);

    const rejectedWithAdmission = rejectedArtifact() as unknown as Record<string, any>;
    rejectedWithAdmission.canonicalAdmissionResults[0].admission.reasonCodes = ["canonical_admission_admitted"];
    expectResignedInvalid(rejectedWithAdmission);
  });

  it("requires an exact V2 projection reason for a source-quality failure", () => {
    const valid = rejectedArtifact();
    expect(verifyEvaluationRunIntegrityArtifactV2(valid)).toBe(true);
    const missing = structuredClone(valid) as unknown as Record<string, any>;
    missing.canonicalAdmissionResults[0].package5a.projectionReasonCodes = [];
    expectResignedInvalid(missing);
  });

  it.each([
    ["artifact_v2_source_quality_failed", "sourceQuality"],
    ["artifact_v2_fingerprint_mismatch", "sourceQuality"],
    ["artifact_v2_locator_mismatch", "sourceQuality"],
    ["artifact_v2_applicability_failed", "deterministicReconciliation"],
    ["artifact_v2_research_parentage_invalid", "linkage"],
    ["artifact_v2_deterministic_contradiction", "deterministicReconciliation"],
  ])("truthfully represents closed projection failure %s", (projectionReason, failedStage) => {
    const artifact = rejectedArtifact() as unknown as Record<string, any>;
    const projection = artifact.canonicalAdmissionResults[0].package5a;
    projection.stageStates.sourceQuality = "passed";
    if (!projection.reasonCodes.includes("source_quality_validated")) projection.reasonCodes.push("source_quality_validated");
    projection.projectionReasonCodes = [projectionReason];
    projection.stageStates[failedStage] = "failed";
    const passedReasonByStage: Record<string, string> = {
      sourceQuality: "source_quality_validated",
      linkage: "linkage_validated",
      deterministicReconciliation: "deterministic_reconciliation_validated",
    };
    projection.reasonCodes = projection.reasonCodes.filter((reason: string) => reason !== passedReasonByStage[failedStage]).sort();
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
  });

  it("accepts canonical statement-only Package F output unchanged with field-aware prose", () => {
    const canonical = canonicalStatementOnlyOutput({
      conciseRationale: "Statement row 1 context supports this classification.",
      conflicts: ["Conflict item 2 remains unresolved."],
      missingEvidence: ["Contract support item 3 is unavailable."],
      recommendedDisposition: "insufficient_evidence",
    });
    const artifact = validArtifact() as unknown as Record<string, any>;
    setStatementOnlyPackageF(artifact, canonical);
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    expect(artifact.canonicalAdmissionResults[0].packageF.output).toEqual(canonical);
  });

  it.each(["$123", "2.9%", "25 bps", "/Users/example/statement.pdf", "OpenAI GPT model", "raw prompt response", "merchant account identifier"])(
    "rejects independently rehashed forbidden Package F explanatory content: %s",
    (unsafe) => {
      const artifact = validArtifact() as unknown as Record<string, any>;
      artifact.canonicalAdmissionResults[0].packageF.output.rowInterpretations[0].conciseRationale = unsafe;
      expectResignedInvalid(artifact);
    },
  );

  it("reconciles every interpretation and acceptance field after independent rehashing", () => {
    const mutations: Array<(result: Record<string, any>) => void> = [
      (r) => { r.packageF.output.acceptanceRecords[0].acceptedSemanticFields.category = "service_fee"; },
      (r) => { r.packageF.output.acceptanceRecords[0].acceptedSemanticFields.likelyEconomicOwner = "network"; },
      (r) => { r.packageF.output.acceptanceRecords[0].status = "accepted_with_conditions"; },
      (r) => { r.packageF.output.acceptanceRecords[0].actionabilityCeiling = "verify_only"; r.packageF.output.acceptanceRecords[0].acceptedSemanticFields.actionabilityCeiling = "verify_only"; },
      (r) => { r.packageF.output.rowInterpretations[0].evidenceProvenance = "statement_evidence"; },
      (r) => { r.packageF.output.acceptanceRecords[0].externalClaimSupportRef = "claim_support_b"; },
      (r) => { r.packageF.output.acceptanceRecords[0].conflicts = ["Conflicting documentation remains."]; },
      (r) => { r.packageF.output.acceptanceRecords[0].reasonCodes = ["whole_statement_fee_intelligence_accepted"]; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0]);
      expectResignedInvalid(artifact);
    }
  });

  it("accepts a typed active approved-registry support and rejects inactive or prose-bearing proof", () => {
    const artifact = approvedRegistryArtifact();
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    for (const mutate of [
      (support: Record<string, any>) => { support.approvedSourceLifecycle = "superseded"; },
      (support: Record<string, any>) => { support.approvedSourceApplicable = false; },
      (support: Record<string, any>) => { support.publisher = "Processor documentation publisher"; },
    ]) {
      const hostile = structuredClone(artifact) as unknown as Record<string, any>;
      const support = hostile.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
      mutate(support);
      rebindSupportDecision(support);
      expectResignedInvalid(hostile);
    }
  });

  it("binds approved-registry scope basis into the support decision and enforces scope consistency", () => {
    const staleDecision = approvedRegistryArtifact() as unknown as Record<string, any>;
    const staleSupport = staleDecision.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
    staleSupport.approvedRegistryScopeBasis = "unrestricted_broader_official";
    staleSupport.applicability.processorOrNetwork = false;
    expectResignedInvalid(staleDecision);

    for (const mutate of [
      (support: Record<string, any>) => { support.applicability.processorOrNetwork = false; },
      (support: Record<string, any>) => { support.approvedRegistryScopeBasis = "unrestricted_broader_official"; support.applicability.processorOrNetwork = true; },
    ]) {
      const artifact = approvedRegistryArtifact() as unknown as Record<string, any>;
      const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
      mutate(support);
      rebindSupportDecision(support);
      refreshSupportDecisionProof(artifact.canonicalAdmissionResults[0]);
      expectResignedInvalid(artifact);
    }

    const runtime = validArtifact() as unknown as Record<string, any>;
    const runtimeSupport = runtime.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
    runtimeSupport.approvedRegistryScopeBasis = "exact_processor_or_network";
    rebindSupportDecision(runtimeSupport);
    refreshSupportDecisionProof(runtime.canonicalAdmissionResults[0]);
    expectResignedInvalid(runtime);
  });

  it("enforces exact accepted support policy and closed contradiction codes", () => {
    const mutations = [
      (s: Record<string, any>) => { s.structuredClaim.claimKind = "published_rule"; },
      (s: Record<string, any>) => { s.structuredClaim.proposedCategory = null; },
      (s: Record<string, any>) => { s.applicability.jurisdiction = false; },
      (s: Record<string, any>) => { s.applicability.transactionContext = false; },
      (s: Record<string, any>) => { s.hasStructuredClaimExclusions = true; },
      (s: Record<string, any>) => { s.hasSupportExclusions = true; },
      (s: Record<string, any>) => { s.finalConfidence = "medium"; },
      (s: Record<string, any>) => { s.finalActionabilityCeiling = "verify_only"; },
      (s: Record<string, any>) => { s.contradictionCodes = ["syntactically_valid_but_unknown"]; },
    ];
    for (const mutate of mutations) {
      const artifact = validArtifact() as unknown as Record<string, any>;
      const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
      mutate(support);
      rebindSupportDecision(support);
      expectResignedInvalid(artifact);
    }
  });

  it("requires verified-application calculation proof and exact rule comparison", () => {
    const artifact = validArtifact() as unknown as Record<string, any>;
    const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
    Object.assign(support.structuredClaim, { claimKind: "merchant_application", applicationBasis: "statement_basis_matches" });
    Object.assign(support, { evidenceDecision: "verified_application", reasonCodes: ["fee_knowledge_verified_application"], rateOrAmountComparison: "matches_published_rule", hasDeterministicCalculationProof: true });
    rebindSupportDecision(support);
    refreshSupportDecisionProof(artifact.canonicalAdmissionResults[0]);
    resign(artifact);
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    for (const mutation of [
      (s: Record<string, any>) => { s.hasDeterministicCalculationProof = false; },
      (s: Record<string, any>) => { s.rateOrAmountComparison = "not_evaluated"; },
      (s: Record<string, any>) => { s.structuredClaim.applicationBasis = "not_evaluated"; },
    ]) {
      const hostile = structuredClone(artifact) as unknown as Record<string, any>;
      const changed = hostile.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
      mutation(changed);
      rebindSupportDecision(changed);
      expectResignedInvalid(hostile);
    }
  });

  it("distinguishes truthful statement-only and externally grounded source-quality stages", () => {
    const external = validArtifact();
    expect(external.canonicalAdmissionResults[0]!.package5a.stageStates.sourceQuality).toBe("passed");
    expect(verifyEvaluationRunIntegrityArtifactV2(external)).toBe(true);

    const statementOnly = validArtifact() as unknown as Record<string, any>;
    setStatementOnlyPackageF(statementOnly, canonicalStatementOnlyOutput());
    resign(statementOnly);
    expect(statementOnly.canonicalAdmissionResults[0].package5a.stageStates.sourceQuality).toBe("not_applicable");
    expect(statementOnly.canonicalAdmissionResults[0].package5a.reasonCodes).not.toContain("source_quality_validated");
    expect(verifyEvaluationRunIntegrityArtifactV2(statementOnly)).toBe(true);
  });

  it("rejects valid evidence swapped between canonical rows", () => {
    const artifact = twoRowStatementArtifact() as unknown as Record<string, any>;
    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    const output = artifact.canonicalAdmissionResults[0].packageF.output;
    output.rowInterpretations[0].evidenceRefs = ["evidence_two"];
    output.acceptanceRecords[0].evidenceRefs = ["evidence_two"];
    expectResignedInvalid(artifact);
  });

  it("accepts unchanged real canonical runtime research output with distinct source, claim, candidate, and support identities", async () => {
    const fixture = await realRuntimeCanonicalArtifact();
    expect(verifyEvaluationRunIntegrityArtifactV2(fixture.artifact)).toBe(true);
    expect(JSON.stringify(fixture.artifact.canonicalAdmissionResults[0]!.packageF!.output)).toBe(fixture.canonicalOutputBytes);
    expect(fixture.support.sourceId).not.toBe(fixture.support.candidateId);
    expect(fixture.support.claimId).not.toBe(fixture.support.sourceId);
    expect(fixture.support.locatorTextHash).toMatch(/^[a-f0-9]{16}$/);
    expect(fixture.support.documentFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fixture.artifact.canonicalAdmissionResults[0]!.packageF!.output.factRefs).toEqual(["financialFacts.processedSales"]);
  });

  it("preserves real canonical conditions, exclusions, unsupported evidence, and mixed support partitions", async () => {
    const conditional = await realRuntimeCanonicalArtifact({ conditions: ["Applies when the documented service is enabled."] });
    expect(verifyEvaluationRunIntegrityArtifactV2(conditional.artifact)).toBe(true);
    expect(conditional.artifact.canonicalAdmissionResults[0]!.packageF!.output.acceptanceRecords[0]!.status).toBe("accepted_with_conditions");
    expect(conditional.artifact.canonicalAdmissionResults[0]!.admission.acceptedClaimSupportRefs).toEqual([conditional.support.claimSupportId]);

    const excluded = await realRuntimeCanonicalArtifact({ exclusions: ["Does not apply to a different service tier."] });
    expect(verifyEvaluationRunIntegrityArtifactV2(excluded.artifact)).toBe(true);
    expect(excluded.artifact.canonicalAdmissionResults[0]!.packageF!.output.acceptanceRecords[0]!.status).toBe("needs_verification");
    expect(excluded.artifact.canonicalAdmissionResults[0]!.packageF!.output.acceptanceRecords[0]!.acceptedSemanticFields.category).toBeNull();
    expect(excluded.artifact.canonicalAdmissionResults[0]!.admission.safeCounts.needsVerificationRecordCount).toBe(1);

    const unsupported = await realRuntimeCanonicalArtifact({ semanticDecision: "unsupported" });
    expect(verifyEvaluationRunIntegrityArtifactV2(unsupported.artifact)).toBe(true);
    expect(unsupported.artifact.canonicalAdmissionResults[0]!.packageF!.output.acceptanceRecords[0]!.status).toBe("rejected");
    expect(unsupported.artifact.canonicalAdmissionResults[0]!.admission.rejectedClaimSupportRefs).toEqual([unsupported.support.claimSupportId]);
    expect(unsupported.artifact.canonicalAdmissionResults[0]!.admission.safeCounts.rejectedRecordCount).toBe(1);

    const mixed = await realRuntimeCanonicalArtifact({ includeRejectedSupport: true });
    expect(verifyEvaluationRunIntegrityArtifactV2(mixed.artifact)).toBe(true);
    expect(mixed.artifact.canonicalAdmissionResults[0]!.admission.acceptedClaimSupportRefs).toHaveLength(1);
    expect(mixed.artifact.canonicalAdmissionResults[0]!.admission.rejectedClaimSupportRefs).toHaveLength(1);
    expect(mixed.artifact.canonicalAdmissionResults[0]!.researchEvidence.claimSupports).toHaveLength(2);
  });

  it("preserves a uniquely resolved runtime source-only reference under the canonical status rules", async () => {
    const sourceOnly = await realRuntimeCanonicalArtifact({ sourceOnly: true });
    expect(verifyEvaluationRunIntegrityArtifactV2(sourceOnly.artifact)).toBe(true);
    const output = sourceOnly.artifact.canonicalAdmissionResults[0]!.packageF!.output;
    expect(output.rowInterpretations[0]!.externalClaimSupportRef).toBeNull();
    expect(output.rowInterpretations[0]!.externalSourceRef).toBe(sourceOnly.support.sourceId);
    expect(output.acceptanceRecords[0]!.status).toBe("rejected");
    expect(sourceOnly.artifact.canonicalAdmissionResults[0]!.admission.acceptedClaimSupportRefs).toEqual([sourceOnly.support.claimSupportId]);
  });

  it("matches canonical confidence admission without adding a final-support-confidence rule", async () => {
    const fixture = await realRuntimeCanonicalArtifact({
      finalSupportConfidence: "medium",
      claimMaximumConfidence: "high",
      interpretationConfidence: "high",
    });
    const output = fixture.artifact.canonicalAdmissionResults[0]!.packageF!.output;
    expect(output.acceptanceRecords[0]!.status).toBe("accepted");
    expect(fixture.support.confidence).toBe("medium");
    expect(fixture.support.structuredClaim.maximumConfidence).toBe("high");
    expect(output.rowInterpretations[0]!.confidence).toBe("high");
    expect(JSON.stringify(output)).toBe(fixture.canonicalOutputBytes);
    expect(verifyEvaluationRunIntegrityArtifactV2(fixture.artifact)).toBe(true);
  });

  it("rejects swapped real runtime identities, foreign dotted facts, and forged real hash proofs", async () => {
    const cases: Array<(result: Record<string, any>) => void> = [
      (result) => { result.packageF.output.rowInterpretations[0].externalSourceRef = result.researchEvidence.claimSupports[0].candidateRef; result.packageF.output.acceptanceRecords[0].externalSourceRef = result.researchEvidence.claimSupports[0].candidateRef; },
      (result) => { result.packageF.output.rowInterpretations[0].externalSourceRef = result.researchEvidence.claimSupports[0].runtimeClaimRef; result.researchEvidence.claimSupports[0].runtimeClaimRef = result.researchEvidence.claimSupports[0].runtimeSourceRef; rebindSupportDecision(result.researchEvidence.claimSupports[0]); },
      (result) => { result.packageF.output.factRefs = ["financialFacts.foreignValue"]; result.canonicalReferenceProof.approvedFactRefs = ["financialFacts.foreignValue"]; result.canonicalReferenceProof.canonicalReferenceProjectionHash = calculateEvaluationCanonicalReferenceProjectionHash(result.canonicalReferenceProof); },
      (result) => { result.researchEvidence.claimSupports[0].locatorTextHash = "f".repeat(16); rebindSupportDecision(result.researchEvidence.claimSupports[0]); },
      (result) => { result.researchEvidence.claimSupports[0].runtimeDocumentFingerprint = null; rebindSupportDecision(result.researchEvidence.claimSupports[0]); },
    ];
    for (const mutate of cases) {
      const fixture = await realRuntimeCanonicalArtifact();
      const artifact = fixture.artifact as unknown as Record<string, any>;
      mutate(artifact.canonicalAdmissionResults[0]);
      expectResignedInvalid(artifact);
    }
  });

  it("accepts exact-matching real approved-registry proof without misrepresenting it as a document fingerprint", () => {
    const fixture = realApprovedRegistryCanonicalArtifact();
    expect(verifyEvaluationRunIntegrityArtifactV2(fixture.artifact)).toBe(true);
    expect(JSON.stringify(fixture.artifact.canonicalAdmissionResults[0]!.packageF!.output)).toBe(fixture.canonicalOutputBytes);
    expect(fixture.support.documentFingerprint).toMatch(/^registry_[a-f0-9]{16}$/);
    const projected = fixture.artifact.canonicalAdmissionResults[0]!.researchEvidence.claimSupports[0]!;
    expect(projected.approvedRegistryVerificationRef).toBe(fixture.support.documentFingerprint);
    expect(projected.approvedRegistryProofLevel).toBe("verification_reference_only");
    expect(projected.approvedRegistryScopeBasis).toBe("exact_processor_or_network");
    expect(fixture.scopeBasis).toBe("exact_processor_or_network");
    expect(projected.approvedContentFingerprint).toBeNull();
    expect(projected.runtimeDocumentFingerprint).toBeNull();
  });

  it("accepts real unrestricted broader official documentation under canonical registry scope rules", () => {
    const fixture = realApprovedRegistryCanonicalArtifact({ registry: unrestrictedApprovedRegistry() });
    expect(fixture.support.applicability.processorOrNetwork).toBe(false);
    expect(fixture.scopeBasis).toBe("unrestricted_broader_official");
    const projected = fixture.artifact.canonicalAdmissionResults[0]!.researchEvidence.claimSupports[0]!;
    expect(projected.approvedRegistryScopeBasis).toBe("unrestricted_broader_official");
    expect(projected.applicability.processorOrNetwork).toBe(false);
    expect(projected.disposition).toBe("accepted");
    expect(verifyEvaluationRunIntegrityArtifactV2(fixture.artifact)).toBe(true);
  });

  it("rejects a real processor-restricted registry mismatch", () => {
    const analysis = realCanonicalAnalysis();
    const registry = mismatchedApprovedRegistry();
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry });
    const support = sourcePacket.claimSupports.find((item) => item.claimId === "claim_real_registry")!;
    expect(support.evidenceDecision).toBe("source_inapplicable");
    expect(support.applicability.processorOrNetwork).toBe(false);
    expect(deriveEvaluationApprovedRegistryScopeBasis({ support, sourcePacket, registry }))
      .toBe("processor_or_network_mismatch");

    const artifact = approvedRegistryArtifact() as unknown as Record<string, any>;
    const projected = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
    Object.assign(projected, {
      approvedRegistryScopeBasis: "processor_or_network_mismatch",
      approvedSourceApplicable: false,
      applicability: { ...projected.applicability, processorOrNetwork: false },
      evidenceDecision: "source_inapplicable",
      reasonCodes: ["fee_knowledge_source_inapplicable"],
      disposition: "rejected",
    });
    rebindSupportDecision(projected);
    refreshSupportDecisionProof(artifact.canonicalAdmissionResults[0]);
    expectResignedInvalid(artifact);
  });

  it("accepts an unambiguous approved source-only reference and rejects ambiguous or foreign source references", () => {
    const sourceOnly = realApprovedRegistryCanonicalArtifact({ sourceOnly: true });
    expect(verifyEvaluationRunIntegrityArtifactV2(sourceOnly.artifact)).toBe(true);
    const output = sourceOnly.artifact.canonicalAdmissionResults[0]!.packageF!.output;
    expect(output.rowInterpretations[0]!.externalClaimSupportRef).toBeNull();
    expect(output.rowInterpretations[0]!.externalSourceRef).toBe(sourceOnly.support.sourceId);

    const foreign = structuredClone(sourceOnly.artifact) as unknown as Record<string, any>;
    foreign.canonicalAdmissionResults[0].packageF.output.rowInterpretations[0].externalSourceRef = "approved_source_missing";
    foreign.canonicalAdmissionResults[0].packageF.output.acceptanceRecords[0].externalSourceRef = "approved_source_missing";
    expectResignedInvalid(foreign);

    const ambiguous = structuredClone(sourceOnly.artifact) as unknown as Record<string, any>;
    const result = ambiguous.canonicalAdmissionResults[0];
    const duplicate = structuredClone(result.researchEvidence.claimSupports[0]);
    duplicate.claimSupportRef = "claim_support_approved_duplicate";
    rebindSupportDecision(duplicate);
    result.researchEvidence.claimSupports.push(duplicate);
    result.researchEvidence.claimSupports.sort((left: Record<string, any>, right: Record<string, any>) => left.claimSupportRef.localeCompare(right.claimSupportRef));
    result.admission.acceptedClaimSupportRefs.push(duplicate.claimSupportRef);
    result.admission.acceptedClaimSupportRefs.sort();
    result.admission.safeCounts.claimSupportCount += 1;
    refreshSupportDecisionProof(result);
    expectResignedInvalid(ambiguous);
  });

  it("rejects a registry fallback projected as a document SHA or with a forged locator", () => {
    for (const mutate of [
      (support: Record<string, any>) => { support.runtimeDocumentFingerprint = `sha256:${"a".repeat(64)}`; },
      (support: Record<string, any>) => { support.approvedContentFingerprint = support.approvedRegistryVerificationRef; support.approvedRegistryProofLevel = "content_fingerprint_verified"; },
      (support: Record<string, any>) => { support.locatorTextHash = "forged_locator"; },
    ]) {
      const fixture = realApprovedRegistryCanonicalArtifact();
      const artifact = fixture.artifact as unknown as Record<string, any>;
      const support = artifact.canonicalAdmissionResults[0].researchEvidence.claimSupports[0];
      mutate(support);
      rebindSupportDecision(support);
      expectResignedInvalid(artifact);
    }
  });

  it("rejects repository-internal and symlink-escaped V2 output paths", async () => {
    const artifact = validArtifact();
    const internal = path.join(process.cwd(), ".artifact-v2-internal.json");
    await expect(writeAndVerifyEvaluationRunIntegrityArtifactV2({ artifact, outputPath: internal })).rejects.toThrow();
    await expect(lstat(internal)).rejects.toThrow();

    const outside = await mkdtemp(path.join(tmpdir(), "artifact-v2-link-"));
    const link = path.join(outside, "repository-link");
    await symlink(process.cwd(), link);
    const escaped = path.join(link, "artifact-v2-escaped.json");
    await expect(writeAndVerifyEvaluationRunIntegrityArtifactV2({ artifact, outputPath: escaped })).rejects.toThrow();
    await expect(lstat(escaped)).rejects.toThrow();
  });

  it("removes pending and published files after post-write verification failure", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "artifact-v2-cleanup-"));
    const outputPath = path.join(directory, "artifact.json");
    const pendingPath = `${outputPath}.pending`;
    let readCount = 0;
    await expect(writeAndVerifyEvaluationRunIntegrityArtifactV2ForTesting(
      { artifact: validArtifact(), outputPath },
      {
        mkdir,
        rename,
        unlink,
        writeFile,
        readFile: (async (filePath: Parameters<typeof readFile>[0], options: Parameters<typeof readFile>[1]) => {
          readCount += 1;
          if (readCount === 2) return "{}";
          return readFile(filePath, options as never);
        }) as typeof readFile,
      },
    )).rejects.toThrow("Published Evaluation Artifact V2 failed independent verification");
    await expect(lstat(pendingPath)).rejects.toThrow();
    await expect(lstat(outputPath)).rejects.toThrow();
  });
});

function validArtifact(): EvaluationRunIntegrityArtifactV2 {
  const fixture = artifactFixture();
  return buildFixtureArtifact(fixture);
}

function candidateStateArtifact(): Record<string, any> {
  const artifact = rejectedArtifact() as unknown as Record<string, any>;
  const result = artifact.canonicalAdmissionResults[0];
  result.researchEvidence.candidates[1].claimSupportRefs = [];
  result.researchEvidence.claimSupports = result.researchEvidence.claimSupports
    .filter((support: Record<string, any>) => support.claimSupportRef !== "claim_support_b");
  result.admission.rejectedClaimSupportRefs = [];
  result.admission.safeCounts.claimSupportCount = 1;
  result.canonicalReferenceProof.claimSupportRefs = ["claim_support_a"];
  refreshSupportDecisionProof(result);
  return artifact;
}

function buildFixtureArtifact(fixture: ReturnType<typeof artifactFixture>): EvaluationRunIntegrityArtifactV2 {
  return buildEvaluationRunIntegrityArtifactV2({
    ...fixture.v1Input,
    canonicalAdmissionResults: [fixture.result],
    preparedSanitizedPackets: [{ resultId: fixture.result.resultId, packet: fixturePreparedPacket() }],
  });
}

function rejectedArtifact(): EvaluationRunIntegrityArtifactV2 {
  const artifact = validArtifact() as unknown as Record<string, any>;
  const result = artifact.canonicalAdmissionResults[0];
  result.admissionDisposition = "rejected";
  result.reasonCodes = ["canonical_admission_rejected"];
  result.packageF = null;
  Object.assign(result.admission, {
    executionStatus: "completed",
    validationStatus: "failed",
    groundingStatus: "rejected",
    admissionDisposition: "rejected",
    validationErrorCodes: ["whole_statement_evidence_invalid"],
    reasonCodes: ["canonical_admission_rejected"],
  });
  Object.assign(result.admission.safeCounts, {
    reviewedFeeRowCount: 0,
    acceptedRecordCount: 0,
    needsVerificationRecordCount: 0,
    humanReviewRecordCount: 0,
    rejectedRecordCount: 0,
  });
  result.package5a.admissionState = "rejected";
  result.package5a.finalCanonicalStatus = "rejected";
  result.package5a.stageStates.sourceQuality = "failed";
  result.package5a.reasonCodes = result.package5a.reasonCodes
    .filter((reason: string) => reason !== "canonical_admission_admitted" && reason !== "source_quality_validated")
    .concat("canonical_admission_rejected")
    .sort();
  result.package5a.projectionReasonCodes = ["artifact_v2_source_quality_failed"];
  recordAiLifecycleState({
    ledger: artifact.lifecycleLedger,
    sourceDocumentId: SOURCE_ID,
    stateName: "canonical_admitted",
    state: "withheld",
    reasonCodes: ["canonical_admission_rejected"],
  });
  const event = lifecycleAdmissionEvent(artifact as unknown as EvaluationRunIntegrityArtifactV2);
  event.state = "withheld";
  event.reasonCodes = ["canonical_admission_rejected"];
  resign(artifact);
  return artifact as unknown as EvaluationRunIntegrityArtifactV2;
}

function safetyBlockedArtifact(): EvaluationRunIntegrityArtifactV2 {
  const artifact = rejectedArtifact() as unknown as Record<string, any>;
  const result = artifact.canonicalAdmissionResults[0];
  result.admissionDisposition = "safety_blocked";
  result.reasonCodes = ["canonical_admission_safety_blocked"];
  result.admission.admissionDisposition = "safety_blocked";
  result.admission.validationErrorCodes = ["whole_statement_privacy_safety_blocked"];
  result.admission.reasonCodes = ["canonical_admission_safety_blocked"];
  result.package5a.finalCanonicalStatus = "safety_blocked";
  result.package5a.stageStates.privacySafety = "failed";
  result.package5a.reasonCodes = result.package5a.reasonCodes
    .filter((reason: string) => reason !== "canonical_admission_rejected" && reason !== "privacy_safety_validated")
    .concat("canonical_admission_rejected", "whole_statement_fee_intelligence_safety_blocked")
    .sort();
  recordAiLifecycleState({
    ledger: artifact.lifecycleLedger,
    sourceDocumentId: SOURCE_ID,
    stateName: "canonical_admitted",
    state: "blocked",
    reasonCodes: ["canonical_admission_safety_blocked"],
  });
  const event = lifecycleAdmissionEvent(artifact as unknown as EvaluationRunIntegrityArtifactV2);
  event.state = "blocked";
  event.reasonCodes = ["canonical_admission_safety_blocked"];
  resign(artifact);
  return artifact as unknown as EvaluationRunIntegrityArtifactV2;
}

function safetyBlockedResearchArtifact(mode: "pre_discovery" | "retrieval" | "semantic"): EvaluationRunIntegrityArtifactV2 {
  const artifact = safetyBlockedArtifact() as unknown as Record<string, any>;
  const result = artifact.canonicalAdmissionResults[0];
  const attempt = result.researchEvidence.attempts[0];
  const candidate = structuredClone(result.researchEvidence.candidates[0]);
  Object.assign(attempt, {
    status: "safety_blocked",
    resultCount: mode === "pre_discovery" ? 0 : 1,
    candidateRefs: mode === "pre_discovery" ? [] : [candidate.candidateRef],
    reasonCodes: ["fee_knowledge_research_safety_blocked"],
  });
  if (mode !== "pre_discovery") {
    Object.assign(candidate, {
      verificationStatus: "safety_blocked",
      retrievalStatus: mode === "retrieval" ? "safety_blocked" : "retrieved_text",
      semanticVerificationStatus: mode === "retrieval" ? "not_started" : "safety_blocked",
      claimSupportRefs: [],
      reasonCodes: mode === "retrieval"
        ? ["fee_knowledge_semantic_support_not_run", "fee_knowledge_url_private_ip"]
        : ["fee_knowledge_semantic_safety_blocked", "fee_knowledge_text_retrieved"],
    });
  }
  result.researchEvidence.candidates = mode === "pre_discovery" ? [] : [candidate];
  result.researchEvidence.claimSupports = [];
  result.admission.acceptedClaimSupportRefs = [];
  result.admission.rejectedClaimSupportRefs = [];
  result.admission.safeCounts.evidenceCandidateCount = result.researchEvidence.candidates.length;
  result.admission.safeCounts.claimSupportCount = 0;
  result.canonicalReferenceProof.candidateRefs = result.researchEvidence.candidates.map((item: Record<string, any>) => item.candidateRef);
  result.canonicalReferenceProof.claimSupportRefs = [];
  refreshSupportDecisionProof(result);
  resign(artifact);
  return artifact as unknown as EvaluationRunIntegrityArtifactV2;
}

function canonicalStatementOnlyOutput(overrides: Record<string, unknown> = {}) {
  const analysis = canonicalDifferentialAnalysis();
  const review = {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1",
    reviewStatus: "completed",
    evidenceRefs: ["evidence_one"],
    factRefs: [],
    limitationCodes: [],
    rowInterpretations: [{
      feeRowRef: "feerow_one",
      proposedCategory: "processor_markup",
      likelyEconomicOwner: "processor",
      likelyContractualController: "processor",
      proposedActionabilityCeiling: "potentially_actionable",
      confidence: "high",
      conciseRationale: "Statement context supports this classification.",
      evidenceProvenance: "statement_evidence",
      evidenceRefs: ["evidence_one"],
      externalSourceRef: null,
      externalClaimSupportRef: null,
      conflicts: [],
      missingEvidence: [],
      recommendedDisposition: "supported",
      authoritative: false,
      ...overrides,
    }],
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
  const validated = validateWholeStatementFeeIntelligenceReview(review, analysis);
  expect(validated.ok).toBe(true);
  return validated.output;
}

function canonicalDifferentialAnalysis(): Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability" | "evidence"> {
  return {
    identity: {
      sourceDocumentRef: "source_artifact_v2",
      processorName: { value: "Fiserv", status: "verified", evidenceRefs: ["evidence_one"], limitationCodes: [] },
      statementPeriod: { value: { start: "2030-01-01", end: "2030-01-31" }, status: "verified", evidenceRefs: ["evidence_one"], limitationCodes: [] },
      businessType: { value: null, status: "unavailable", evidenceRefs: [], limitationCodes: [] },
    },
    feeLedger: {
      status: "reconciled",
      rows: [{
        id: "feerow_one",
        role: "individual_charge",
        selectedLabel: "Service charge",
        selectedAmount: { amountMinor: -1000, currency: "USD" },
        signedAmount: { amountMinor: -1000, currency: "USD" },
        contributesToUniqueTotal: true,
        contributionDecision: { reasonCode: "individual_charge_included", evidenceRefs: ["evidence_one"] },
        sourceOccurrenceIds: ["occurrence_one"],
        limitations: [],
      }],
      sourceOccurrences: [{ id: "occurrence_one", evidenceRef: "evidence_one" }],
    },
    feeOwnershipActionability: { rowClassifications: [] },
    evidence: [{ id: "evidence_one" }],
  } as unknown as Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability" | "evidence">;
}

function fixtureResearchQuestion(overrides: Partial<FeeKnowledgeResearchQuestion> = {}): FeeKnowledgeResearchQuestion {
  return {
    feeRowRef: "feerow_one",
    sanitizedQuestionCategory: "classification",
    triggerReason: "material_unfamiliar_label",
    processorOrNetwork: "Synthetic processor",
    feeLabel: "Service charge",
    statementSection: "Fees",
    statementPeriodYear: "2030",
    deterministicCategory: "processor_markup",
    deterministicEconomicOwner: "processor",
    deterministicContractualController: "processor",
    deterministicActionabilityCeiling: "potentially_actionable",
    deterministicConfidence: "high",
    semanticQuestion: "How is this synthetic service charge classified?",
    ...overrides,
  };
}

function fixturePreparedPacket(options: {
  wholeStatementReview?: ReturnType<typeof buildWholeStatementFeeIntelligencePacket>;
  questions?: FeeKnowledgeResearchQuestion[];
  limits?: OneTimeStatementEvaluationPacket["research"]["limits"];
} = {}): OneTimeStatementEvaluationPacket {
  return {
    type: "one_time_statement_evaluation_packet_v1",
    wholeStatementReview: options.wholeStatementReview
      ?? buildWholeStatementFeeIntelligencePacket(canonicalDifferentialAnalysis(), null),
    research: {
      questions: options.questions ?? [fixtureResearchQuestion()],
      limits: options.limits ?? structuredClone(FEE_KNOWLEDGE_RESEARCH_LIMITS),
    },
  };
}

function prepareFixtureResearchQuestions(options: {
  questions: FeeKnowledgeResearchQuestion[];
  statuses?: Array<"completed" | "budget_exhausted">;
  limits?: OneTimeStatementEvaluationPacket["research"]["limits"];
}) {
  const fixture = artifactFixture();
  const result = fixture.result as unknown as Record<string, any>;
  const packet = fixturePreparedPacket({ questions: options.questions, limits: options.limits });
  const expected = buildEvaluationExpectedResearchQuestionProjection(packet);
  const attemptRefs = ["research_attempt_primary", "research_attempt_secondary", "research_attempt_tertiary"];
  result.researchEvidence.attempts = expected.questions.map((question, index) => {
    const status = options.statuses?.[index] ?? "completed";
    return {
      researchAttemptRef: attemptRefs[index] ?? `research_attempt_question_${index + 1}`,
      ...question,
      status,
      resultCount: index === 0 && status === "completed" ? 2 : 0,
      candidateRefs: index === 0 && status === "completed" ? ["candidate_a", "candidate_b"] : [],
      reasonCodes: [status === "completed" ? "fee_knowledge_research_completed" : "fee_knowledge_research_budget_exhausted"],
    };
  }).sort((left, right) => left.researchAttemptRef.localeCompare(right.researchAttemptRef));
  const firstQuestion = expected.questions[0]!;
  for (const candidate of result.researchEvidence.candidates) candidate.questionRef = firstQuestion.questionRef;
  for (const support of result.researchEvidence.claimSupports) {
    support.questionRef = firstQuestion.questionRef;
    rebindSupportDecision(support);
  }
  result.admission.researchAttemptRefs = result.researchEvidence.attempts
    .map((attempt: Record<string, any>) => attempt.researchAttemptRef)
    .sort();
  result.admission.safeCounts.researchAttemptCount = expected.questions.length;
  Object.assign(result.canonicalReferenceProof, {
    expectedResearchQuestions: expected,
    preparedSanitizedPacketContentHash: sha256Canonical(packet),
    wholeStatementPacketContentHash: sha256Canonical(packet.wholeStatementReview),
  });
  refreshSupportDecisionProof(result);
  return { fixture, result, packet };
}

function buildFixtureArtifactForResearchQuestions(options: Parameters<typeof prepareFixtureResearchQuestions>[0]): EvaluationRunIntegrityArtifactV2 {
  const { fixture, result, packet } = prepareFixtureResearchQuestions(options);
  return buildEvaluationRunIntegrityArtifactV2({
    ...fixture.v1Input,
    canonicalAdmissionResults: [result],
    preparedSanitizedPackets: [{ resultId: result.resultId, packet }],
  });
}

function setStatementOnlyPackageF(artifact: Record<string, any>, output: ReturnType<typeof canonicalStatementOnlyOutput>): void {
  const result = artifact.canonicalAdmissionResults[0];
  result.packageF.output = output;
  updatePackageFCounts(result, output);
  result.package5a.stageStates.sourceQuality = "not_applicable";
  result.package5a.reasonCodes = result.package5a.reasonCodes.filter((reason: string) => reason !== "source_quality_validated");
}

function updatePackageFCounts(result: Record<string, any>, output: { acceptanceRecords: Array<{ status: string }> }): void {
  result.admission.safeCounts.reviewedFeeRowCount = output.acceptanceRecords.length;
  result.admission.safeCounts.acceptedRecordCount = output.acceptanceRecords
    .filter((record) => record.status === "accepted" || record.status === "accepted_with_conditions").length;
  result.admission.safeCounts.needsVerificationRecordCount = output.acceptanceRecords
    .filter((record) => record.status === "needs_verification").length;
  result.admission.safeCounts.humanReviewRecordCount = output.acceptanceRecords
    .filter((record) => record.status === "human_review").length;
  result.admission.safeCounts.rejectedRecordCount = output.acceptanceRecords
    .filter((record) => record.status === "rejected").length;
}

function approvedRegistryArtifact(): EvaluationRunIntegrityArtifactV2 {
  return realApprovedRegistryCanonicalArtifact().artifact;
}

function twoRowStatementArtifact(): EvaluationRunIntegrityArtifactV2 {
  const artifact = validArtifact() as unknown as Record<string, any>;
  const result = artifact.canonicalAdmissionResults[0];
  setStatementOnlyPackageF(artifact, canonicalStatementOnlyOutput());
  const interpretation = structuredClone(result.packageF.output.rowInterpretations[0]);
  const acceptance = structuredClone(result.packageF.output.acceptanceRecords[0]);
  Object.assign(interpretation, { feeRowRef: "feerow_two", evidenceRefs: ["evidence_two"], conciseRationale: "Second statement row context supports this classification." });
  Object.assign(acceptance, { feeRowRef: "feerow_two", immutableFeeRowRef: "feerow_two", evidenceRefs: ["evidence_two"] });
  result.packageF.output.rowInterpretations.push(interpretation);
  result.packageF.output.acceptanceRecords.push(acceptance);
  result.packageF.output.evidenceRefs = ["evidence_one", "evidence_two"];
  Object.assign(result.packageF.output.coverageProof, { expectedFeeRowRefs: ["feerow_one", "feerow_two"], reviewedFeeRowRefs: ["feerow_one", "feerow_two"] });
  result.canonicalReferenceProof.canonicalFeeRowRefs = ["feerow_one", "feerow_two"];
  result.canonicalReferenceProof.canonicalEvidenceRefs = ["evidence_one", "evidence_two"];
  result.canonicalReferenceProof.canonicalFeeRowEvidencePopulation = [
    { feeRowRef: "feerow_one", evidenceRefs: ["evidence_one"], contributesToUniqueTotal: true },
    { feeRowRef: "feerow_two", evidenceRefs: ["evidence_two"], contributesToUniqueTotal: true },
  ];
  result.canonicalReferenceProof.canonicalReferenceProjectionHash = calculateEvaluationCanonicalReferenceProjectionHash(result.canonicalReferenceProof);
  result.admission.safeCounts.reviewedFeeRowCount = 2;
  result.admission.safeCounts.acceptedRecordCount = 2;
  result.admission.safeCounts.needsVerificationRecordCount = 0;
  result.admission.safeCounts.humanReviewRecordCount = 0;
  result.admission.safeCounts.rejectedRecordCount = 0;
  result.package5a.diagnosticRefs = ["feerow_one", "feerow_two"];
  resign(artifact);
  return artifact as unknown as EvaluationRunIntegrityArtifactV2;
}

async function realRuntimeCanonicalArtifact(options: {
  conditions?: string[];
  exclusions?: string[];
  semanticDecision?: FeeKnowledgeSemanticSupportDecision["decision"];
  includeRejectedSupport?: boolean;
  sourceOnly?: boolean;
  finalSupportConfidence?: "high" | "medium" | "low";
  claimMaximumConfidence?: "high" | "medium" | "low";
  interpretationConfidence?: "high" | "medium";
} = {}) {
  const analysis = realCanonicalAnalysis();
  const question = realResearchQuestion(analysis);
  const attemptRef = "research_attempt_real_runtime";
  const retrieved = await retrieveFeeKnowledgeDocument("https://syntheticprocessor.test/fees", {
    abortSignal: new AbortController().signal,
    fetchImpl: async () => new Response(
      "<html><body><p>Synthetic Processor official guide explains the Monthly Service Fee classification for 2026 card processing.</p></body></html>",
      { status: 200, headers: { "content-type": "text/html" } },
    ),
    resolveHost: async () => ["93.184.216.34"],
  });
  const verification = await verifyCandidate({
    candidateId: "candidate_real_runtime",
    attemptId: attemptRef,
    candidate: { url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" },
    retrieved,
    question,
    domainIdentityPolicy: realDomainPolicy(),
    semanticSupport: realSemanticDecision(options.semanticDecision ?? "supports", {
      ...realStructuredClaim(question),
      conditions: options.conditions ?? [],
      exclusions: options.exclusions ?? [],
    }),
  });
  expect(verification.claimSupport).not.toBeNull();
  if ((options.semanticDecision ?? "supports") === "supports") {
    expect(verification.candidate.verificationStatus).toBe("runtime_verified_documentation");
  }
  const support = verification.claimSupport!;
  if ((options.conditions?.length ?? 0) > 0 || (options.exclusions?.length ?? 0) > 0 || options.claimMaximumConfidence) {
    support.structuredClaim = {
      ...support.structuredClaim,
      conditions: [...(options.conditions ?? [])],
      exclusions: [...(options.exclusions ?? [])],
      maximumConfidence: options.claimMaximumConfidence ?? support.structuredClaim.maximumConfidence,
    };
    support.semanticSupport = {
      ...support.semanticSupport,
      structuredClaim: support.structuredClaim,
    };
  }
  if (options.finalSupportConfidence) support.confidence = options.finalSupportConfidence;
  const rejectedAttemptRef = "research_attempt_real_rejected";
  const rejectedVerification = options.includeRejectedSupport
    ? await verifyCandidate({
        candidateId: "candidate_real_runtime_rejected",
        attemptId: rejectedAttemptRef,
        candidate: { url: "https://syntheticprocessor.test/fees", title: "Synthetic Guide", publisher: "Synthetic Processor" },
        retrieved,
        question,
        domainIdentityPolicy: realDomainPolicy(),
        semanticSupport: realSemanticDecision("unsupported", realStructuredClaim(question)),
      })
    : null;
  if (rejectedVerification) expect(rejectedVerification.claimSupport).not.toBeNull();
  const supports = [support, ...(rejectedVerification?.claimSupport ? [rejectedVerification.claimSupport] : [])];
  const candidates = [verification.candidate, ...(rejectedVerification ? [rejectedVerification.candidate] : [])];
  const sourcePacket = buildFeeKnowledgeSourcePacket({
    analysis,
    registry: null,
    runtimeClaimSupports: supports,
    researchCandidates: candidates,
  });
  const packet = buildWholeStatementFeeIntelligencePacket(analysis, null, sourcePacket);
  const preparedEvaluationPacket: OneTimeStatementEvaluationPacket = {
    type: "one_time_statement_evaluation_packet_v1",
    wholeStatementReview: packet,
    research: {
      questions: [question, ...(rejectedVerification ? [question] : [])],
      limits: structuredClone(FEE_KNOWLEDGE_RESEARCH_LIMITS),
    },
  };
  const expectedQuestions = buildEvaluationExpectedResearchQuestionProjection(preparedEvaluationPacket).questions;
  const questionRef = expectedQuestions[0]!.questionRef;
  const rejectedQuestionRef = expectedQuestions[1]?.questionRef;
  const validated = validateWholeStatementFeeIntelligenceReview(
    realWholeStatementReview(packet, {
      evidenceProvenance: "runtime_verified_documentation",
      externalSourceRef: support.sourceId,
      externalClaimSupportRef: options.sourceOnly ? null : support.claimSupportId,
      confidence: options.interpretationConfidence ?? "medium",
    }),
    analysis,
    null,
    sourcePacket,
  );
  expect(validated.ok).toBe(true);
  if (options.sourceOnly) expect(validated.output.acceptanceRecords[0]?.status).toBe("rejected");
  const canonicalOutputBytes = JSON.stringify(validated.output);
  const supportProofs = [
    projectRuntimeSupport(support, attemptRef, questionRef),
    ...(rejectedVerification?.claimSupport ? [projectRuntimeSupport(rejectedVerification.claimSupport, rejectedAttemptRef, rejectedQuestionRef!)] : []),
  ];
  const attemptProofs = [
    { researchAttemptRef: attemptRef, ...expectedQuestions[0]!, status: "completed", resultCount: 1, candidateRefs: [verification.candidate.candidateId], reasonCodes: ["fee_knowledge_research_completed"] },
    ...(rejectedVerification ? [{ researchAttemptRef: rejectedAttemptRef, ...expectedQuestions[1]!, status: "completed", resultCount: 1, candidateRefs: [rejectedVerification.candidate.candidateId], reasonCodes: ["fee_knowledge_research_completed"] }] : []),
  ];
  const candidateProofs = candidates.map((candidate, index) => ({
    candidateRef: candidate.candidateId,
    researchAttemptRef: index === 0 ? attemptRef : rejectedAttemptRef,
    questionRef: index === 0 ? questionRef : rejectedQuestionRef!,
    feeRowRef: support.feeRowRef,
    verificationStatus: candidate.verificationStatus,
    retrievalStatus: retrieved.status,
    semanticVerificationStatus: "completed" as const,
    claimSupportRefs: supports.filter((item) => item.candidateId === candidate.candidateId).map((item) => item.claimSupportId),
    reasonCodes: [...new Set([...retrieved.reasonCodes, ...candidate.reasonCodes])].sort(),
  }));
  const artifact = artifactFromRealCanonical({
    output: validated.output,
    supportProofs,
    preparedPacket: preparedEvaluationPacket,
    attempts: attemptProofs,
    candidates: candidateProofs,
  });
  return { artifact, support, supports, sourcePacket, canonicalOutputBytes };
}

function realApprovedRegistryCanonicalArtifact(options: {
  sourceOnly?: boolean;
  registry?: ApprovedFeeKnowledgeSourceRegistry;
} = {}) {
  const analysis = realCanonicalAnalysis();
  const registry = options.registry ?? realApprovedRegistry();
  const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry });
  const support = sourcePacket.claimSupports.find((item) => item.evidenceDecision === "verified_classification")!;
  expect(support).toBeDefined();
  const scopeBasis = deriveEvaluationApprovedRegistryScopeBasis({ support, sourcePacket, registry });
  expect(scopeBasis).not.toBeNull();
  const packet = buildWholeStatementFeeIntelligencePacket(analysis, registry, sourcePacket);
  const preparedEvaluationPacket: OneTimeStatementEvaluationPacket = {
    type: "one_time_statement_evaluation_packet_v1",
    wholeStatementReview: packet,
    research: { questions: [], limits: structuredClone(FEE_KNOWLEDGE_RESEARCH_LIMITS) },
  };
  const validated = validateWholeStatementFeeIntelligenceReview(
    realWholeStatementReview(packet, {
      evidenceProvenance: "approved_external_documentation",
      externalSourceRef: support.sourceId,
      externalClaimSupportRef: options.sourceOnly ? null : support.claimSupportId,
      confidence: "high",
    }),
    analysis,
    registry,
    sourcePacket,
  );
  expect(validated.ok).toBe(true);
  const canonicalOutputBytes = JSON.stringify(validated.output);
  const artifact = artifactFromRealCanonical({
    output: validated.output,
    supportProofs: [projectApprovedSupport(support, sourcePacket.registryVersion, scopeBasis!)],
    preparedPacket: preparedEvaluationPacket,
  });
  return { artifact, support, sourcePacket, canonicalOutputBytes, scopeBasis };
}

function artifactFromRealCanonical(input: {
  output: ReturnType<typeof validateWholeStatementFeeIntelligenceReview>["output"];
  supportProofs: Array<ReturnType<typeof projectRuntimeSupport> | ReturnType<typeof projectApprovedSupport>>;
  preparedPacket: OneTimeStatementEvaluationPacket;
  attempts?: Array<Record<string, any>>;
  candidates?: Array<Record<string, any>>;
}): EvaluationRunIntegrityArtifactV2 {
  const fixture = artifactFixture();
  const result = fixture.result as unknown as Record<string, any>;
  const row = input.output.rowInterpretations[0]!;
  const evidenceRefs = [...row.evidenceRefs].sort();
  const candidateRefs = (input.candidates ?? []).map((candidate) => candidate.candidateRef).sort();
  const claimSupportRefs = input.supportProofs.map((support) => support.claimSupportRef).sort();
  const claimSupportDecisionRefs = input.supportProofs.map((support) => support.claimSupportDecisionRef).sort();
  const expectedResearchQuestions = buildEvaluationExpectedResearchQuestionProjection(input.preparedPacket);
  const referenceProof = {
    canonicalFeeRowRefs: [row.feeRowRef],
    canonicalEvidenceRefs: evidenceRefs,
    canonicalFeeRowEvidencePopulation: [{ feeRowRef: row.feeRowRef, evidenceRefs, contributesToUniqueTotal: true }],
    approvedFactRefs: ["financialFacts.processedSales"],
    candidateRefs,
    claimSupportRefs,
    claimSupportDecisionRefs,
    expectedResearchQuestions,
    preparedSanitizedPacketContentHash: sha256Canonical(input.preparedPacket),
    wholeStatementPacketContentHash: sha256Canonical(input.preparedPacket.wholeStatementReview),
  };
  result.packageF.output = input.output;
  result.admission.acceptedClaimSupportRefs = input.supportProofs.filter((support) => support.disposition === "accepted").map((support) => support.claimSupportRef).sort();
  result.admission.rejectedClaimSupportRefs = input.supportProofs.filter((support) => support.disposition === "rejected").map((support) => support.claimSupportRef).sort();
  result.admission.researchAttemptRefs = (input.attempts ?? []).map((attempt) => attempt.researchAttemptRef).sort();
  result.admission.safeCounts = {
    reviewedFeeRowCount: input.output.acceptanceRecords.length,
    acceptedRecordCount: input.output.acceptanceRecords.filter((record) => record.status === "accepted" || record.status === "accepted_with_conditions").length,
    needsVerificationRecordCount: input.output.acceptanceRecords.filter((record) => record.status === "needs_verification").length,
    humanReviewRecordCount: input.output.acceptanceRecords.filter((record) => record.status === "human_review").length,
    rejectedRecordCount: input.output.acceptanceRecords.filter((record) => record.status === "rejected").length,
    researchAttemptCount: input.attempts?.length ?? 0,
    evidenceCandidateCount: input.candidates?.length ?? 0,
    claimSupportCount: input.supportProofs.length,
  };
  result.researchEvidence = {
    type: "evaluation_research_evidence_proof_v1",
    attempts: [...(input.attempts ?? [])].sort((left, right) => left.researchAttemptRef.localeCompare(right.researchAttemptRef)),
    candidates: [...(input.candidates ?? [])].sort((left, right) => left.candidateRef.localeCompare(right.candidateRef)),
    claimSupports: [...input.supportProofs].sort((left, right) => left.claimSupportRef.localeCompare(right.claimSupportRef)),
  };
  result.canonicalReferenceProof = {
    type: "evaluation_canonical_reference_proof_v1",
    ...referenceProof,
    canonicalReferenceProjectionHash: calculateEvaluationCanonicalReferenceProjectionHash(referenceProof),
  };
  result.package5a.diagnosticRefs = [row.feeRowRef, "financialFacts.processedSales"].sort();
  return buildEvaluationRunIntegrityArtifactV2({
    ...fixture.v1Input,
    canonicalAdmissionResults: [result],
    preparedSanitizedPackets: [{ resultId: result.resultId, packet: input.preparedPacket }],
  });
}

function projectRuntimeSupport(support: FeeKnowledgeClaimSupportRecord, attemptRef: string, questionRef: string) {
  return bindProjectedSupport({
    claimSupportRef: support.claimSupportId,
    origin: "runtime_research" as const,
    runtimeSourceRef: support.sourceId,
    runtimeClaimRef: support.claimId,
    candidateRef: support.candidateId,
    researchAttemptRef: attemptRef,
    questionRef,
    approvedSourceRef: null,
    approvedClaimRef: null,
    approvedRegistryVersionRef: null,
    approvedSourceLifecycle: null,
    approvedSourceApplicable: null,
    approvedRegistryVerificationRef: null,
    approvedContentFingerprint: null,
    approvedRegistryProofLevel: null,
    approvedRegistryScopeBasis: null,
    feeRowRef: support.feeRowRef,
    runtimeDocumentFingerprint: support.documentFingerprint,
    locatorTextHash: support.locatorTextHash,
    ...safeSupportSemantics(support),
  });
}

function projectApprovedSupport(
  support: FeeKnowledgeClaimSupportRecord,
  registryVersion: string,
  approvedRegistryScopeBasis: NonNullable<EvaluationResearchClaimSupportProof["approvedRegistryScopeBasis"]>,
) {
  const contentFingerprint = SHA256_FOR_TEST.test(support.documentFingerprint) ? support.documentFingerprint : null;
  return bindProjectedSupport({
    claimSupportRef: support.claimSupportId,
    origin: "approved_registry" as const,
    runtimeSourceRef: null,
    runtimeClaimRef: null,
    candidateRef: null,
    researchAttemptRef: null,
    questionRef: null,
    approvedSourceRef: support.sourceId,
    approvedClaimRef: support.claimId,
    approvedRegistryVersionRef: registryVersion,
    approvedSourceLifecycle: "active" as const,
    approvedSourceApplicable: true,
    approvedRegistryVerificationRef: contentFingerprint ? `registry_${"b".repeat(16)}` : support.documentFingerprint,
    approvedContentFingerprint: contentFingerprint,
    approvedRegistryProofLevel: contentFingerprint ? "content_fingerprint_verified" as const : "verification_reference_only" as const,
    approvedRegistryScopeBasis,
    feeRowRef: support.feeRowRef,
    runtimeDocumentFingerprint: null,
    locatorTextHash: support.locatorTextHash,
    ...safeSupportSemantics(support),
  });
}

const SHA256_FOR_TEST = /^sha256:[a-f0-9]{64}$/;

function safeSupportSemantics(support: FeeKnowledgeClaimSupportRecord) {
  return {
    structuredClaim: {
      claimKind: support.structuredClaim.claimKind,
      proposedCategory: support.structuredClaim.proposedCategory,
      likelyEconomicOwner: support.structuredClaim.likelyEconomicOwner,
      likelyContractualController: support.structuredClaim.likelyContractualController,
      maximumConfidence: support.structuredClaim.maximumConfidence,
      actionabilityCeiling: support.structuredClaim.actionabilityCeiling,
      applicationBasis: support.structuredClaim.applicationBasis,
    },
    semanticDecision: support.semanticSupport.decision,
    applicability: support.applicability,
    rateOrAmountComparison: support.rateOrAmountComparison,
    hasDeterministicCalculationProof: support.semanticSupport.reasonCodes.includes("deterministic_calculation_matches"),
    hasConditions: support.structuredClaim.conditions.length > 0,
    hasStructuredClaimExclusions: support.structuredClaim.exclusions.length > 0,
    hasSupportExclusions: support.exclusions.length > 0,
    finalConfidence: support.confidence,
    finalActionabilityCeiling: support.actionabilityCeiling,
    evidenceDecision: support.evidenceDecision,
    contradictionCodes: [...support.contradictions].sort(),
  };
}

function bindProjectedSupport<T extends Record<string, any>>(decision: T) {
  const disposition = projectedSupportIsAccepted(decision) ? "accepted" as const : "rejected" as const;
  const completed = {
    ...decision,
    reasonCodes: [`fee_knowledge_${decision.evidenceDecision}`],
    disposition,
  };
  return { ...completed, claimSupportDecisionRef: calculateEvaluationClaimSupportDecisionRef(completed as never) };
}

function projectedSupportIsAccepted(support: Record<string, any>): boolean {
  const claim = support.structuredClaim;
  const evidenceShapeValid = support.evidenceDecision === "verified_classification"
    ? claim.claimKind === "classification" && claim.proposedCategory !== null
    : support.evidenceDecision === "verified_rule"
      ? claim.claimKind === "published_rule"
      : support.evidenceDecision === "verified_application"
        && claim.claimKind === "merchant_application"
        && claim.applicationBasis === "statement_basis_matches"
        && support.rateOrAmountComparison === "matches_published_rule"
        && support.hasDeterministicCalculationProof === true;
  const scopeValid = support.origin === "runtime_research"
    ? support.applicability.processorOrNetwork === true
    : support.approvedRegistryScopeBasis === "exact_processor_or_network"
      ? support.applicability.processorOrNetwork === true
      : support.approvedRegistryScopeBasis === "unrestricted_broader_official"
        && support.applicability.processorOrNetwork === false;
  const originValid = support.origin === "runtime_research"
    || (support.origin === "approved_registry" && support.approvedSourceLifecycle === "active" && support.approvedSourceApplicable === true);
  return evidenceShapeValid
    && originValid
    && support.semanticDecision === "supports"
    && scopeValid
    && support.applicability.statementPeriod === true
    && support.applicability.jurisdiction !== false
    && support.applicability.transactionContext !== false
    && support.contradictionCodes.length === 0
    && support.hasStructuredClaimExclusions === false
    && support.hasSupportExclusions === false;
}

function realCanonicalAnalysis(): CanonicalStatementAnalysis {
  const document = realParsedDocument();
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    businessType: "restaurant_food_beverage",
    sourceAnalysisId: "job_artifact_v2_real_canonical",
    sourceFileName: null,
  });
  const feeRow: CanonicalFeeRow = {
    id: "feerow_monthly_service",
    role: "individual_charge",
    sourceOccurrenceIds: ["source_occurrence_monthly_service"],
    parserInterpretationIds: [],
    selectedLabel: "Monthly Service Fee",
    selectedAmount: realMoney(1000),
    signedAmount: realMoney(-1000),
    contributesToUniqueTotal: true,
    contributionDecision: {
      contributes: true,
      reasonCode: "individual_charge_included",
      controlRefs: [],
      evidenceRefs: ["evidence_monthly_service"],
      signedAmountBasis: "fee_charge_magnitude",
      grossNetBasis: "fee_charge_gross",
      confidence: "medium",
      limitations: [],
    },
    mergeReason: null,
    mergeConfidence: "medium",
    rejectedAmountCandidates: [],
    limitations: [],
  };
  return {
    ...analysis,
    identity: {
      ...analysis.identity,
      processorName: {
        value: "Synthetic Processor",
        status: "verified",
        evidenceRefs: ["evidence_monthly_service"],
        limitationCodes: [],
      },
    },
    evidence: [{
      id: "evidence_monthly_service",
      documentId: "document_artifact_v2_real",
      pageNumber: 1,
      section: "fees",
      lineId: "line_monthly_service",
      rowIndex: 1,
      extractedText: null,
      normalizedText: null,
      sourceRole: "fee_row",
      confidence: "medium",
      extractionObservations: [],
      parserInterpretations: [],
      customerSafe: { excerpt: null, redactionApplied: true },
    }],
    feeLedger: {
      ...analysis.feeLedger,
      status: "partial",
      rows: [feeRow],
      sourceOccurrences: [{
        id: "source_occurrence_monthly_service",
        evidenceRef: "evidence_monthly_service",
        documentId: "document_artifact_v2_real",
        pageNumber: 1,
        section: "fees",
        lineId: "line_monthly_service",
        rowIndex: 1,
        normalizedSourceText: null,
      }],
      uniqueChargeTotal: realMoney(-1000),
      controls: [],
      limitations: ["Synthetic partial ledger for Artifact V2 integration."],
    },
  };
}

function realParsedDocument(): ParsedDocument {
  const lines = [
    "Merchant: Artifact Fixture",
    "Processor: Synthetic Processor",
    "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00",
    "Fees Charged | -$30.00",
    "Monthly Service Fee | -$10.00",
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 0.95, warnings: [], pageCount: 1 },
  };
}

function realMoney(amountMinor: number): MoneyAmount {
  return { amountMinor, currency: "USD" };
}

function realResearchQuestion(analysis: CanonicalStatementAnalysis) {
  return {
    feeRowRef: analysis.feeLedger.rows[0]!.id,
    sanitizedQuestionCategory: "classification" as const,
    triggerReason: "material_unfamiliar_label" as const,
    processorOrNetwork: "Synthetic Processor",
    feeLabel: "Monthly Service Fee",
    statementSection: "individual_charge",
    statementPeriodYear: "2026",
    deterministicCategory: "network_access_or_authorization" as const,
    deterministicEconomicOwner: "processor" as const,
    deterministicContractualController: "merchant_contract" as const,
    deterministicActionabilityCeiling: "verify_only" as const,
    deterministicConfidence: "high" as const,
    semanticQuestion: "Find official documentation explaining this fee classification.",
  };
}

function realDomainPolicy(): FeeKnowledgeDomainIdentityPolicy {
  return {
    policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
    reviewedPublisherDomains: [{
      publisherId: "synthetic_processor_test",
      aliases: ["synthetic processor"],
      officialDomains: ["syntheticprocessor.test"],
    }],
    identityEvidence: [{
      type: "fee_knowledge_domain_identity_evidence",
      policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
      publisherId: "synthetic_processor_test",
      publisherDisplayName: "Synthetic Processor",
      officialDomain: "syntheticprocessor.test",
      evidenceUrl: "https://syntheticprocessor.test/identity",
      evidenceLocator: "Synthetic fixture identity record",
      evidenceSummary: "Synthetic fixture identity proof without fee conclusions.",
      reviewedAt: "2026-08-01",
      establishesFeeConclusion: false,
    }],
  };
}

function realStructuredClaim(question: ReturnType<typeof realResearchQuestion>): FeeKnowledgeStructuredClaim {
  return {
    claimKind: "classification",
    feeLabel: question.feeLabel,
    processorOrNetwork: question.processorOrNetwork,
    statementPeriodYear: question.statementPeriodYear,
    proposedCategory: question.deterministicCategory,
    likelyEconomicOwner: question.deterministicEconomicOwner,
    likelyContractualController: question.deterministicContractualController,
    conditions: [],
    exclusions: [],
    maximumConfidence: question.deterministicConfidence,
    actionabilityCeiling: question.deterministicActionabilityCeiling,
    ruleValue: null,
    applicationBasis: "not_evaluated",
  };
}

function realSemanticDecision(
  decision: FeeKnowledgeSemanticSupportDecision["decision"],
  structuredClaim: FeeKnowledgeStructuredClaim,
): FeeKnowledgeSemanticSupportDecision {
  return {
    type: "fee_knowledge_semantic_support_decision",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    decision,
    structuredClaim,
    reasonCodes: [`semantic_${decision}`],
    providerDetailsStripped: true,
  };
}

function realWholeStatementReview(
  packet: ReturnType<typeof buildWholeStatementFeeIntelligencePacket>,
  external: {
    evidenceProvenance: "runtime_verified_documentation" | "approved_external_documentation";
    externalSourceRef: string;
    externalClaimSupportRef: string | null;
    confidence: "high" | "medium";
  },
) {
  return {
    type: "whole_statement_fee_intelligence_review" as const,
    reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1" as const,
    reviewStatus: "completed" as const,
    evidenceRefs: packet.admittedFeeRows.flatMap((row) => row.evidenceRefs),
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    rowInterpretations: packet.admittedFeeRows.map((row) => ({
      feeRowRef: row.feeRowRef,
      proposedCategory: "network_access_or_authorization" as const,
      likelyEconomicOwner: "processor" as const,
      likelyContractualController: "merchant_contract" as const,
      proposedActionabilityCeiling: "verify_only" as const,
      confidence: external.confidence,
      conciseRationale: "Verified documentation supports this fee classification.",
      evidenceProvenance: external.evidenceProvenance,
      evidenceRefs: row.evidenceRefs,
      externalSourceRef: external.externalSourceRef,
      externalClaimSupportRef: external.externalClaimSupportRef,
      conflicts: [],
      missingEvidence: [],
      recommendedDisposition: "supported" as const,
      authoritative: false as const,
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false as const,
    financialMutationAllowed: false as const,
    providerDetailsStripped: true as const,
  };
}

function realApprovedRegistry(): ApprovedFeeKnowledgeSourceRegistry {
  return {
    registrySchemaVersion: "fee_knowledge_registry_v1",
    registryVersion: "synthetic_registry_v1",
    policyVersion: "fee_knowledge_policy_v1",
    sources: [{
      sourceId: "source_real_registry",
      registrySchemaVersion: "fee_knowledge_registry_v1",
      policyVersion: "fee_knowledge_policy_v1",
      lifecycle: "active",
      kind: "official_processor_documentation",
      title: "Synthetic Official Fee Guide",
      publisher: "Synthetic Processor",
      canonicalUrl: "https://syntheticprocessor.test/fees",
      domainIdentity: {
        policyVersion: "fee_knowledge_policy_v1",
        publisherId: "synthetic_processor",
        officialDomains: ["syntheticprocessor.test"],
        aliases: ["synthetic processor"],
        verificationBasis: "registry_reviewed",
      },
      publicationDate: "2026-01-01",
      effectivePeriod: { from: "2026-01-01", through: null },
      retrievalDate: "2026-08-01",
      lastVerificationDate: "2026-08-01",
      reverifyAfterDate: null,
      jurisdiction: ["US"],
      market: ["card_payments"],
      processorIds: ["synthetic processor"],
      networkIds: [],
      aliases: ["synthetic processor"],
      supersedesSourceId: null,
      supersededBySourceId: null,
      contentFingerprint: null,
      displayPermission: "displayable",
      claims: [{
        claimId: "claim_real_registry",
        claimType: "classification",
        feeLabels: ["Monthly Service Fee"],
        categories: [],
        processorIds: ["synthetic processor"],
        networkIds: [],
        semanticConclusion: {
          category: "network_access_or_authorization",
          likelyEconomicOwner: "processor",
          likelyContractualController: "merchant_contract",
        },
        conditions: [],
        exclusions: [],
        maximumConfidence: "high",
        actionabilityCeiling: "verify_only",
        effectivePeriod: { from: "2026-01-01", through: null },
        sourceLocator: "Synthetic fee section",
        customerSafeParaphrase: "Synthetic documentation describes the access fee.",
        displayPermission: "displayable",
      }],
    }],
  };
}

function unrestrictedApprovedRegistry(): ApprovedFeeKnowledgeSourceRegistry {
  const registry = structuredClone(realApprovedRegistry());
  const source = registry.sources[0]!;
  source.processorIds = [];
  source.networkIds = [];
  source.aliases = [];
  source.claims[0]!.processorIds = [];
  source.claims[0]!.networkIds = [];
  return registry;
}

function mismatchedApprovedRegistry(): ApprovedFeeKnowledgeSourceRegistry {
  const registry = structuredClone(realApprovedRegistry());
  const source = registry.sources[0]!;
  source.processorIds = ["omega acquiring platform"];
  source.networkIds = [];
  source.aliases = ["omega acquiring platform"];
  source.claims[0]!.processorIds = ["omega acquiring platform"];
  source.claims[0]!.networkIds = [];
  return registry;
}

function addAttempt(artifact: Record<string, any>, attempt: Record<string, any>): void {
  const result = artifact.canonicalAdmissionResults[0];
  result.researchEvidence.attempts.push({ ...attempt, feeRowRef: "feerow_one" });
  result.researchEvidence.attempts.sort((left: Record<string, any>, right: Record<string, any>) => left.researchAttemptRef.localeCompare(right.researchAttemptRef));
  result.admission.researchAttemptRefs.push(attempt.researchAttemptRef);
  result.admission.researchAttemptRefs.sort();
  result.admission.safeCounts.researchAttemptCount += 1;
}

function rebindSupportDecision(support: Record<string, any>): void {
  support.claimSupportDecisionRef = calculateEvaluationClaimSupportDecisionRef(support);
}

function refreshSupportDecisionProof(result: Record<string, any>): void {
  result.canonicalReferenceProof.claimSupportDecisionRefs = result.researchEvidence.claimSupports
    .map((support: Record<string, any>) => support.claimSupportDecisionRef)
    .sort();
  result.canonicalReferenceProof.canonicalReferenceProjectionHash = calculateEvaluationCanonicalReferenceProjectionHash(result.canonicalReferenceProof);
}

function expectResignedInvalid(artifact: Record<string, any>): void {
  resign(artifact);
  expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(false);
}

function artifactFixture() {
  const parserDecision = preserveParserDecision({
    decision: { status: "accepted", reportable: true, confidence: "high", reason: "Synthetic structural controls passed." },
    controls: [],
  });
  const preflight = createDeterministicPreflightArtifact({
    artifactId: "preflight_artifact_v2_fixture",
    documents: [{
      sourceDocumentId: SOURCE_ID,
      internalSourceRef: "source_artifact_v2",
      sha256: `sha256:${"0".repeat(64)}`,
      byteCount: 32,
      displayFileName: "synthetic-fixture.pdf",
      parsedProcessor: "fiserv_family",
      parsedStatementPeriod: { start: "2030-01-01", end: "2030-01-31" },
      parserEligibility: "eligible",
      processorLayoutFamily: "fiserv_family",
      productScopeEligibility: "eligible",
      productScopeReasonCode: "fiserv_family_supported",
      paidStageEligibility: "eligible",
      paidStageExclusionReason: null,
      selectedDriver: "fiserv_first_data_full_statement",
      allowedExecutionStages: ["parser", "whole_statement_ai_review", "web_search_discovery", "document_retrieval", "semantic_verification", "canonical_admission", "final_artifact"],
      parserRecordId: "parser_artifact_v2",
      parserDecision,
    }],
  });
  const manifest = buildEvaluationSourceManifest(preflight);
  const executionPermit = validateExecutionSet({
    manifest,
    manifestPath: "/approved/internal/manifest.json",
    approvedManifestHash: manifest.manifestContentHash,
    observedSources: manifest.documents.map((document) => ({
      sourceDocumentId: document.sourceDocumentId,
      internalSourceRef: document.internalSourceRef,
      sha256: document.sha256,
      byteCount: document.byteCount,
      displayFileName: document.displayFileName,
      displayMetadataStatementPeriod: document.parsedStatementPeriod,
    })),
    requestedExecutions: [{ sourceDocumentId: SOURCE_ID, stages: ["parser", "whole_statement_ai_review", "web_search_discovery", "document_retrieval", "semantic_verification", "canonical_admission", "final_artifact"] }],
  });
  const lifecycleLedger = createLifecycleLedger(manifest);
  recordAiLifecycleState({
    ledger: lifecycleLedger,
    sourceDocumentId: SOURCE_ID,
    stateName: "canonical_admitted",
    state: "completed",
    reasonCodes: ["canonical_admission_admitted"],
  });
  recordLifecycleStage(lifecycleLedger, lifecycleRefs({
    sourceDocumentId: SOURCE_ID,
    stage: "canonical_admission",
    state: "completed",
    reasonCodes: ["canonical_admission_admitted"],
    manifestRowRef: SOURCE_ID,
    preflightRecordRef: manifest.parentPreflightArtifactId,
    parserRecordRef: "parser_artifact_v2",
    capabilityExecutionRef: EXECUTION_REF,
    canonicalAdmissionRef: ADMISSION_REF,
  }));
  const packages = syntheticPackages();
  const v1Input: Parameters<typeof buildEvaluationRunIntegrityArtifact>[0] = {
    manifest,
    approvedManifestHash: manifest.manifestContentHash,
    executionPermit,
    lifecycleLedger,
    packageFinancialInvariance: [{ sourceDocumentId: SOURCE_ID, result: provePackagesBEFinancialInvariance(packages, structuredClone(packages)) }],
    costBudgetLedger: new EvaluationCostBudgetLedger(10).snapshot(),
    providerCallOutcomes: [],
    finalStatus: "completed",
    reasonCodes: ["artifact_v2_fixture_completed"],
  };
  return { v1Input, result: admissionResult() };
}

function admissionResult(): EvaluationCanonicalAdmissionResultInput {
  const preparedPacket = fixturePreparedPacket();
  const expectedResearchQuestions = buildEvaluationExpectedResearchQuestionProjection(preparedPacket);
  const referenceProof = {
    canonicalFeeRowRefs: ["feerow_one"],
    canonicalEvidenceRefs: ["evidence_one"],
    canonicalFeeRowEvidencePopulation: [{ feeRowRef: "feerow_one", evidenceRefs: ["evidence_one"], contributesToUniqueTotal: true }],
    approvedFactRefs: ["financialFacts.processedSales"],
    candidateRefs: ["candidate_a", "candidate_b"],
    claimSupportRefs: ["claim_support_a", "claim_support_b"],
    claimSupportDecisionRefs: [
      claimSupport("a", "accepted", "verified_classification").claimSupportDecisionRef,
      claimSupport("b", "rejected", "unsupported").claimSupportDecisionRef,
    ].sort(),
    expectedResearchQuestions,
    preparedSanitizedPacketContentHash: sha256Canonical(preparedPacket),
    wholeStatementPacketContentHash: sha256Canonical(preparedPacket.wholeStatementReview),
  };
  return {
    type: "evaluation_canonical_admission_result_v1",
    resultId: RESULT_ID,
    sourceDocumentId: SOURCE_ID,
    capabilityId: "whole_statement_fee_intelligence_review",
    executionRef: EXECUTION_REF,
    admission: {
      type: "canonical_whole_statement_fee_intelligence_admission_v1",
      capabilityId: "whole_statement_fee_intelligence_review",
      executionRef: EXECUTION_REF,
      executionStatus: "completed",
      validationStatus: "passed",
      groundingStatus: "grounded",
      admissionDisposition: "admitted",
      acceptedClaimSupportRefs: ["claim_support_a"],
      rejectedClaimSupportRefs: ["claim_support_b"],
      researchAttemptRefs: ["research_attempt_primary"],
      validationErrorCodes: [],
      reasonCodes: ["canonical_admission_admitted"],
      safeCounts: { reviewedFeeRowCount: 1, acceptedRecordCount: 1, needsVerificationRecordCount: 0, humanReviewRecordCount: 0, rejectedRecordCount: 0, researchAttemptCount: 1, evidenceCandidateCount: 2, claimSupportCount: 2 },
      package5aDiagnosticRef: DIAGNOSTIC_REF,
      authoritative: false,
      financialMutationAllowed: false,
    },
    packageF: {
      type: "evaluation_package_f_whole_statement_capability_v1",
      capabilityId: "whole_statement_fee_intelligence_review",
      executionRef: EXECUTION_REF,
      output: {
        type: "whole_statement_fee_intelligence_review",
        reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1",
        authoritative: false,
        evidenceRefs: ["evidence_one"],
        factRefs: ["financialFacts.processedSales"],
        limitationCodes: [],
        reviewStatus: "completed",
        coverageProof: {
          policyVersion: "whole_statement_fee_intelligence_coverage_v1",
          expectedFeeRowRefs: ["feerow_one"],
          reviewedFeeRowRefs: ["feerow_one"],
          missingFeeRowRefs: [],
          duplicatedFeeRowRefs: [],
          unknownFeeRowRefs: [],
          malformedFeeRowRefs: [],
          malformedFeeRowRefCount: 0,
          exactCoverage: true,
        },
        rowInterpretations: [{
          feeRowRef: "feerow_one",
          proposedCategory: "processor_markup",
          likelyEconomicOwner: "processor",
          likelyContractualController: "processor",
          proposedActionabilityCeiling: "potentially_actionable",
          confidence: "high",
          conciseRationale: "Structured documentation supports this classification.",
          evidenceProvenance: "runtime_verified_documentation",
          evidenceRefs: ["evidence_one"],
          externalSourceRef: `runtime_source_${"a".repeat(16)}`,
          externalClaimSupportRef: "claim_support_a",
          conflicts: [],
          missingEvidence: [],
          recommendedDisposition: "supported",
          authoritative: false,
        }],
        acceptanceRecords: [{
          feeRowRef: "feerow_one",
          policyVersion: "whole_statement_fee_intelligence_acceptance_v1",
          status: "accepted",
          acceptedSemanticFields: {
            category: "processor_markup",
            likelyEconomicOwner: "processor",
            likelyContractualController: "processor",
            actionabilityCeiling: "potentially_actionable",
            evidenceProvenance: "runtime_verified_documentation",
          },
          evidenceRefs: ["evidence_one"],
          externalSourceRef: `runtime_source_${"a".repeat(16)}`,
          externalClaimSupportRef: "claim_support_a",
          reasonCodes: ["whole_statement_fee_intelligence_accepted", "whole_statement_fee_intelligence_runtime_verified_documentation"],
          conflicts: [],
          actionabilityCeiling: "potentially_actionable",
          immutableFeeRowRef: "feerow_one",
        }],
        reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
        financialMutationAllowed: false,
        providerDetailsStripped: true,
      },
      sourceReferencesValidatedAgainstProof: true,
      authoritative: false,
      financialMutationAllowed: false,
    },
    package5a: {
      type: "evaluation_package_5a_admission_projection_v1",
      diagnosticRef: DIAGNOSTIC_REF,
      capabilityId: "whole_statement_fee_intelligence_review",
      executionRef: EXECUTION_REF,
      executionState: "completed",
      admissionState: "admitted",
      finalCanonicalStatus: "completed",
      stageStates: { responseParse: "passed", schemaValidation: "passed", evidenceCitation: "passed", sourceQuality: "passed", linkage: "passed", deterministicReconciliation: "passed", privacySafety: "passed" },
      reasonCodes: [
        "canonical_admission_admitted",
        "deterministic_reconciliation_validated",
        "evidence_references_validated",
        "linkage_validated",
        "privacy_safety_validated",
        "response_shape_validated",
        "schema_validated",
        "source_quality_validated",
      ],
      projectionReasonCodes: [],
      diagnosticRefs: ["feerow_one", "financialFacts.processedSales"],
      rawPromptPersisted: false,
      rawResponsePersisted: false,
      rawStatementTextPersisted: false,
      providerDetailsPersisted: false,
    },
    researchEvidence: {
      type: "evaluation_research_evidence_proof_v1",
      attempts: [{
        researchAttemptRef: "research_attempt_primary",
        questionRef: FIXTURE_QUESTION_REF,
        feeRowRef: "feerow_one",
        questionOrdinal: 1,
        sanitizedQuestionCategory: "classification",
        triggerReason: "material_unfamiliar_label",
        status: "completed",
        resultCount: 2,
        candidateRefs: ["candidate_a", "candidate_b"],
        reasonCodes: ["fee_knowledge_research_completed"],
      }],
      candidates: [
        { candidateRef: "candidate_a", researchAttemptRef: "research_attempt_primary", questionRef: FIXTURE_QUESTION_REF, feeRowRef: "feerow_one", verificationStatus: "runtime_verified_documentation", retrievalStatus: "retrieved_text", semanticVerificationStatus: "completed", claimSupportRefs: ["claim_support_a"], reasonCodes: ["fee_knowledge_text_retrieved", "fee_knowledge_verified_classification"] },
        { candidateRef: "candidate_b", researchAttemptRef: "research_attempt_primary", questionRef: FIXTURE_QUESTION_REF, feeRowRef: "feerow_one", verificationStatus: "verified_candidate_limited", retrievalStatus: "retrieved_text", semanticVerificationStatus: "completed", claimSupportRefs: ["claim_support_b"], reasonCodes: ["fee_knowledge_text_retrieved", "fee_knowledge_unsupported"] },
      ],
      claimSupports: [claimSupport("a", "accepted", "verified_classification"), claimSupport("b", "rejected", "unsupported")],
    },
    canonicalReferenceProof: {
      type: "evaluation_canonical_reference_proof_v1",
      ...referenceProof,
      canonicalReferenceProjectionHash: calculateEvaluationCanonicalReferenceProjectionHash(referenceProof),
    },
    lifecycleAdmissionRef: ADMISSION_REF,
    admissionDisposition: "admitted",
    reasonCodes: ["canonical_admission_admitted"],
    authoritative: false,
    financialMutationAllowed: false,
    customerPublished: false,
  };
}

function claimSupport(suffix: "a" | "b", disposition: "accepted" | "rejected", evidenceDecision: "verified_classification" | "unsupported") {
  const decision = {
    claimSupportRef: `claim_support_${suffix}`,
    origin: "runtime_research" as const,
    runtimeSourceRef: `runtime_source_${suffix.repeat(16)}`,
    runtimeClaimRef: `runtime_claim_${suffix.repeat(16)}`,
    candidateRef: `candidate_${suffix}`,
    researchAttemptRef: "research_attempt_primary",
    questionRef: FIXTURE_QUESTION_REF,
    approvedSourceRef: null,
    approvedClaimRef: null,
    approvedRegistryVersionRef: null,
    approvedSourceLifecycle: null,
    approvedSourceApplicable: null,
    approvedRegistryVerificationRef: null,
    approvedContentFingerprint: null,
    approvedRegistryProofLevel: null,
    approvedRegistryScopeBasis: null,
    feeRowRef: "feerow_one",
    runtimeDocumentFingerprint: `sha256:${(suffix === "a" ? "1" : "3").repeat(64)}`,
    locatorTextHash: (suffix === "a" ? "2" : "4").repeat(16),
    structuredClaim: {
      claimKind: "classification" as const,
      proposedCategory: "processor_markup" as const,
      likelyEconomicOwner: "processor" as const,
      likelyContractualController: "processor" as const,
      maximumConfidence: "high" as const,
      actionabilityCeiling: "potentially_actionable" as const,
      applicationBasis: "statement_basis_matches" as const,
    },
    semanticDecision: disposition === "accepted" ? "supports" as const : "unsupported" as const,
    applicability: { processorOrNetwork: true, jurisdiction: null, transactionContext: null, statementPeriod: true },
    rateOrAmountComparison: "not_evaluated" as const,
    hasDeterministicCalculationProof: false,
    hasConditions: false,
    hasStructuredClaimExclusions: false,
    hasSupportExclusions: false,
    finalConfidence: "high" as const,
    finalActionabilityCeiling: "potentially_actionable" as const,
    evidenceDecision,
    contradictionCodes: [],
  };
  const completed = {
    ...decision,
    reasonCodes: [`fee_knowledge_${evidenceDecision}`],
    disposition,
  };
  return { ...completed, claimSupportDecisionRef: calculateEvaluationClaimSupportDecisionRef(completed) };
}

function syntheticPackages(): PackagesBEProjectionInput {
  return {
    financialFacts: { type: "synthetic_package_b", facts: [] },
    feeLedger: { type: "synthetic_package_c", rows: [] },
    feeOwnershipActionability: { type: "synthetic_package_d", classifications: [] },
    opportunityEngine: { type: "synthetic_package_e", components: [] },
    calculations: [],
  } as unknown as PackagesBEProjectionInput;
}

function lifecycleAdmissionEvent(artifact: EvaluationRunIntegrityArtifactV2): Record<string, any> {
  return artifact.lifecycleLedger.documents[0]!.events.find((event) => event.stage === "canonical_admission") as unknown as Record<string, any>;
}

function resign(artifact: Record<string, any> | EvaluationRunIntegrityArtifactV2): void {
  const result = artifact.canonicalAdmissionResults[0];
  const { resultContentHash: _resultHash, ...resultContent } = result;
  result.resultContentHash = sha256Canonical(resultContent);
  const { artifactContentHash: _artifactHash, ...artifactContent } = artifact;
  artifact.artifactContentHash = sha256Canonical(artifactContent);
}
