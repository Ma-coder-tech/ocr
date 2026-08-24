import { createHash } from "node:crypto";
import { canonicalJson } from "../knowledge/knowledgeSafety.js";
import type { KnowledgeEntry } from "../knowledge/knowledgeTypes.js";
import type { IntelligencePorts, PublicSourceAuthorityAdmission } from "../intelligence/intelligenceTypes.js";
import { RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET } from "../intelligence/budgetLedger.js";
import { runBoundedIntelligenceRuntime } from "../intelligence/runtime.js";
import { assertInternalProviderPreflight, assertLivePortsBound, requireLiveCapabilityBinding } from "../intelligence/providerPreflight.js";
import type { InternalProviderPreflightInputV1 } from "../intelligence/providerPreflight.js";
import type { InternalLiveExecutionCapabilityV1 } from "../intelligence/providerPreflight.js";
import { RG_INTERNAL_LIVE_TIMING_AMENDMENT_ID, RG_SEMANTIC_AMENDMENT_IDS } from "../intelligence/intelligenceTypes.js";
import { ProviderOperationAuditLog } from "../intelligence/providerAdapters.js";
import { runFiservOneStatementEvaluation } from "../evaluation/fiservEvaluationHarness.js";
import type { RunFiservOneStatementInput } from "../evaluation/fiservEvaluationHarness.js";
import { buildStatementObservationInvestigationOrigins } from "./observationOrigins.js";
import { buildInternalStatementAnalysisV1 } from "./internalAnalysisProjection.js";
import { writeInternalAnalysisBundle } from "./internalAnalysisBundle.js";
import type { InternalStatementAnalysisV1, PublicSourceEvidenceManifestV1, RgInternalAuditV1 } from "./internalAnalysisTypes.js";
import { E2E_INTERNAL_ANALYSIS_AMENDMENT_ID } from "./internalAnalysisTypes.js";

export type RunFiservInternalAnalysisInputV1 = RunFiservOneStatementInput & {
  internalRunId: string;
  evaluatedAt: string;
  tenantRef: string;
  accountRef: string;
  admittedKnowledge: KnowledgeEntry[];
  publicSourceAuthorityAdmissions: PublicSourceAuthorityAdmission[];
  ports: IntelligencePorts;
  providerAudit: ProviderOperationAuditLog;
  providerPreflight: Omit<InternalProviderPreflightInputV1, "runId" | "outputDirectory" | "questionContexts">;
  liveCapability?: InternalLiveExecutionCapabilityV1;
};

export async function runFiservInternalAnalysisEvaluationV1(input: RunFiservInternalAnalysisInputV1): Promise<{
  analysis: InternalStatementAnalysisV1;
  publicEvidence: PublicSourceEvidenceManifestV1;
  rgAudit: RgInternalAuditV1;
  runtime: Awaited<ReturnType<typeof runBoundedIntelligenceRuntime>>;
  investigationOrigins: ReturnType<typeof buildStatementObservationInvestigationOrigins>;
  deterministicAudit: Awaited<ReturnType<typeof runFiservOneStatementEvaluation>>["audit"];
  bundleFiles: string[];
}> {
  const deterministic = await runFiservOneStatementEvaluation(input);
  if ([deterministic.deterministic.foundation, deterministic.deterministic.pricing, deterministic.deterministic.economic,
    deterministic.deterministic.synthesis].some((stage) => stage.validation.status !== "valid")) {
    throw new Error("internal_analysis_deterministic_stage_invalid");
  }
  const origins = buildStatementObservationInvestigationOrigins({ foundation: deterministic.deterministic.foundation,
    admittedKnowledge: input.admittedKnowledge, tenantRef: input.tenantRef, accountRef: input.accountRef });
  if (input.providerPreflight.executionMode === "external_provider") {
    if (!input.liveCapability) throw new Error("internal_live_execution_capability_required");
    requireLiveCapabilityBinding(input.liveCapability); assertLivePortsBound(input.liveCapability, input.ports);
    if (input.liveCapability.runId !== input.internalRunId || input.liveCapability.outputDirectory !== input.outputDirectory) throw new Error("internal_live_capability_run_or_output_mismatch");
    if (input.liveCapability.authorityRegistryHash !== hashCanonical(input.publicSourceAuthorityAdmissions)) throw new Error("internal_live_capability_authority_registry_mismatch");
  } else {
    assertInternalProviderPreflight({ ...input.providerPreflight, runId: input.internalRunId, outputDirectory: input.outputDirectory,
      questionContexts: origins.providerContexts });
  }
  const canonicalTruth = {
    foundation: deterministic.deterministic.foundation,
    pricing: deterministic.deterministic.pricing,
    economic: deterministic.deterministic.economic,
    synthesis: deterministic.deterministic.synthesis,
    admittedKnowledge: input.admittedKnowledge,
  };
  const canonicalBeforeHash = hashCanonical(canonicalTruth);
  const runtime = await runBoundedIntelligenceRuntime({
    runId: input.internalRunId,
    canonicalTruth,
    canonicalReferenceIds: [...new Set(origins.origins.flatMap((origin) => [...origin.occurrenceRefs, ...origin.evidenceRefs]))],
    admittedKnowledge: input.admittedKnowledge,
    unknownQueue: origins.unknownQueue,
    questionOrigins: origins.runtimeOrigins,
    providerQuestionContexts: origins.origins.map((origin, index) => ({ unknownRef: origin.unknownRef, context: origins.providerContexts[index]! })),
    publicSourceAuthorityAdmissions: input.publicSourceAuthorityAdmissions,
    profile: RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET,
    deterministicNotApplicableUnknownRefs: [],
    languageInputs: [],
    providerExecution: input.providerPreflight.executionMode === "external_provider" ? "internal_live_evaluation" : "injected_evaluation",
  }, input.ports);
  const canonicalAfterHash = hashCanonical(canonicalTruth);
  const publicEvidence = publicEvidenceManifest(runtime.privateReviewBundles, input.evaluatedAt);
  const analysis = buildInternalStatementAnalysisV1({ safeStatementId: input.safeStatementId, runId: input.internalRunId,
    evaluatedAt: input.evaluatedAt, foundation: deterministic.deterministic.foundation, origins: origins.origins,
    admittedKnowledge: input.admittedKnowledge, runtime, publicEvidence,
    publicSourceAuthorityAdmissions: input.publicSourceAuthorityAdmissions, canonicalBeforeHash, canonicalAfterHash });
  const receipts = input.providerAudit.snapshot();
  const rgAudit: RgInternalAuditV1 = {
    schemaVersion: "rg_internal_analysis_audit_v1", runId: input.internalRunId,
    executionMode: input.providerPreflight.executionMode === "injected_evaluation" ? "injected_evaluation" : "internal_live_evaluation",
    externalNetworkCallCount: receipts.reduce((sum, item) => sum + item.actualSendCount, 0),
    liveTimingPolicy: { amendmentId: RG_INTERNAL_LIVE_TIMING_AMENDMENT_ID,
      searchTimeoutMs: RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET.searchTimeoutMs,
      globalWallTimeMs: RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET.globalWallTimeMs },
    providerOperationReceipts: receipts,
    searchAttempts: runtime.searchAttempts.map((attempt) => ({ ...attempt,
      queryTerms: [...attempt.queryTerms], candidateIds: [...attempt.candidateIds], reasonCodes: [...attempt.reasonCodes],
      providerMetadata: attempt.providerMetadata ? { ...attempt.providerMetadata } : null })),
    questions: runtime.questions.map((question) => ({ questionId: question.questionId, subjectCode: question.subjectCode,
      originatingUnknownRef: question.originatingUnknownRef, eligibility: question.eligibility, selection: question.selection,
      reasonCodes: [...question.reasonCodes] })),
    verificationOutcomes: runtime.supports.map((support) => ({ supportId: support.supportId, questionId: support.questionId,
      candidateId: support.candidateId, documentId: support.documentId, locatorId: support.locatorId,
      status: support.verificationStatus, reasonCodes: [...support.limitationCodes] })),
    budget: runtime.budget, diagnostics: runtime.diagnostics, canonicalBeforeHash, canonicalAfterHash,
    canonicalTruthPreserved: canonicalBeforeHash === canonicalAfterHash && runtime.canonicalTruthPreserved,
    rfSnapshotHash: hashCanonical(input.admittedKnowledge),
    rfEntryRefs: input.admittedKnowledge.map((entry) => entry.id).sort(),
    policyVersions: [E2E_INTERNAL_ANALYSIS_AMENDMENT_ID, RG_INTERNAL_LIVE_TIMING_AMENDMENT_ID, ...RG_SEMANTIC_AMENDMENT_IDS],
  };
  if (input.providerPreflight.executionMode === "injected_evaluation" && rgAudit.externalNetworkCallCount !== 0) {
    throw new Error("injected_evaluation_external_network_call_detected");
  }
  const bundleFiles = await writeInternalAnalysisBundle(input.outputDirectory, analysis, rgAudit, publicEvidence,
    input.liveCapability?.outputRoot ?? input.outputDirectory);
  return { analysis, publicEvidence, rgAudit, runtime, investigationOrigins: origins, deterministicAudit: deterministic.audit,
    bundleFiles: [...bundleFiles, "rh-projection.json", "review.md", "run-audit.json"] };
}

function publicEvidenceManifest(bundles: Awaited<ReturnType<typeof runBoundedIntelligenceRuntime>>["privateReviewBundles"], evaluatedAt: string): PublicSourceEvidenceManifestV1 {
  return {
    schemaVersion: "public_source_evidence_manifest_v1", privacy: "internal_pre_uat_public_evidence", downloadedBodiesPersisted: false,
    entries: bundles.map((bundle) => ({ evidenceId: `public-evidence-${createHash("sha256").update(`${bundle.supportId}\0${bundle.documentFingerprint}\0${bundle.locatorId}`).digest("hex").slice(0, 20)}`,
      supportId: bundle.supportId, questionId: bundle.questionId, candidateId: bundle.candidateId,
      sourceUrl: bundle.sourceUrl, sourceTitle: bundle.sourceTitle,
      sourceAuthority: bundle.sourceAuthority, authorityAdmissionRef: bundle.sourceAuthorityAdmissionRef, retrievedAt: evaluatedAt,
      documentId: bundle.documentId, documentFingerprint: bundle.documentFingerprint,
      locator: { locatorId: bundle.locatorId, page: bundle.locatorPage, sectionCode: bundle.locatorSectionCode,
        lineStart: bundle.locatorLineStart, lineEnd: bundle.locatorLineEnd }, boundedSupportingExcerpt: bundle.locatorTextExcerpt.slice(0, 512),
      semanticVerification: bundle.semanticDecision, limitations: [...bundle.limitationCodes] })),
  };
}
function hashCanonical(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
