import type { CanonicalAiAdmissionAttemptRecord } from "../canonical/aiAdmissionDiagnostics.js";
import { buildCanonicalClaimSupportDecision } from "../canonical/feeKnowledgeClaimSupportDecision.js";
import type {
  ApprovedFeeKnowledgeSourceRegistry,
  FeeKnowledgeClaimSupportRecord,
  FeeKnowledgeSourcePacket,
} from "../canonical/feeKnowledgeTypes.js";
import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import {
  buildEvaluationExpectedResearchQuestionProjection,
  calculateEvaluationCanonicalReferenceProjectionHash,
  calculateEvaluationClaimSupportDecisionRef,
} from "./canonicalAdmissionArtifact.js";
import type { FinalizedOneTimeStatementEvaluation } from "./oneTimeStatementEvaluationAdapter.js";
import { sha256Canonical } from "./stable.js";
import {
  EVALUATION_CANONICAL_ADMISSION_RESULT_VERSION,
  EVALUATION_CANONICAL_ADMISSION_VERSION,
  EVALUATION_CANONICAL_REFERENCE_PROOF_VERSION,
  EVALUATION_PACKAGE_5A_PROJECTION_VERSION,
  EVALUATION_PACKAGE_F_RECORD_VERSION,
  EVALUATION_RESEARCH_EVIDENCE_PROOF_VERSION,
  type EvaluationCanonicalAdmissionResultInput,
  type EvaluationPackage5AAdmissionProjection,
  type EvaluationPackage5BWorkPlanProjection,
  type EvaluationResearchClaimSupportProof,
} from "./types.js";

export function projectOneTimeCanonicalAdmissionResult(input: {
  sourceDocumentId: string;
  finalized: FinalizedOneTimeStatementEvaluation;
}): EvaluationCanonicalAdmissionResultInput {
  const { admission: canonical, sourcePacket, preparedPacket, registry } = input.finalized;
  if (input.finalized.wholeStatementPacketSent
    && sha256Canonical(input.finalized.wholeStatementPacketSent) !== sha256Canonical(preparedPacket.wholeStatementReview)) {
    throw new Error("package_5b_sent_whole_statement_packet_mismatch");
  }
  if (canonical.admission.executionStatus === "completed"
    && canonical.admission.admissionDisposition !== "safety_blocked"
    && !input.finalized.wholeStatementPacketSent) {
    throw new Error("package_5b_completed_execution_sent_packet_missing");
  }
  const diagnostic = canonical.aiAdmissionAudit.attempts.find((attempt) =>
    attempt.capability === "whole_statement_fee_intelligence_review",
  );
  if (!diagnostic?.executionRef) throw new Error("package_5b_execution_reference_missing");
  if (diagnostic.executionRef !== canonical.admission.executionRef) throw new Error("package_5b_execution_reference_mismatch");

  const expectedQuestions = buildEvaluationExpectedResearchQuestionProjection(preparedPacket);
  const expectedByRef = new Map(expectedQuestions.questions.map((question) => [question.questionRef, question]));
  const attempts = sourcePacket.researchAttempts.map((attempt) => {
    const expected = expectedByRef.get(attempt.questionRef);
    if (!expected) throw new Error("package_5b_foreign_research_attempt");
    return {
      researchAttemptRef: attempt.attemptId,
      questionRef: attempt.questionRef,
      feeRowRef: attempt.feeRowRef,
      questionOrdinal: expected.questionOrdinal,
      sanitizedQuestionCategory: attempt.sanitizedQuestionCategory,
      triggerReason: attempt.triggerReason,
      status: attempt.status,
      resultCount: attempt.resultCount,
      candidateRefs: [...attempt.candidateIds].sort(),
      reasonCodes: [...attempt.reasonCodes].sort(),
    };
  }).sort((left, right) => left.researchAttemptRef.localeCompare(right.researchAttemptRef));

  const supports = sourcePacket.claimSupports.map((support) => projectSupport(support, sourcePacket, registry))
    .sort((left, right) => left.claimSupportRef.localeCompare(right.claimSupportRef));
  const supportsByCandidate = new Map<string, string[]>();
  for (const support of supports) {
    if (!support.candidateRef) continue;
    supportsByCandidate.set(support.candidateRef, [...(supportsByCandidate.get(support.candidateRef) ?? []), support.claimSupportRef]);
  }
  for (const candidate of sourcePacket.researchCandidates) {
    const supportRefs = supportsByCandidate.get(candidate.candidateId) ?? [];
    if (supportRefs.length === 0 && candidate.claimSupportDecisionRef !== null) {
      throw new Error("package_5b_candidate_decision_without_support");
    }
    if (supportRefs.length > 1) throw new Error("package_5b_candidate_support_not_unique");
  }
  const candidates = sourcePacket.researchCandidates.map((candidate) => ({
    candidateRef: candidate.candidateId,
    researchAttemptRef: candidate.attemptId,
    questionRef: candidate.questionRef,
    feeRowRef: candidate.feeRowRef,
    verificationStatus: candidate.verificationStatus,
    retrievalStatus: candidate.retrievalStatus === "not_started" ? "failed" as const : candidate.retrievalStatus,
    semanticVerificationStatus: candidate.semanticVerificationStatus,
    claimSupportRefs: [...(supportsByCandidate.get(candidate.candidateId) ?? [])].sort(),
    reasonCodes: [...candidate.reasonCodes].sort(),
    safeRetrievalDiagnostics: candidate.safeRetrievalDiagnostics ? structuredClone(candidate.safeRetrievalDiagnostics) : null,
  })).sort((left, right) => left.candidateRef.localeCompare(right.candidateRef));

  const analysis = canonical.analysis;
  const canonicalFeeRowEvidencePopulation = canonicalEvidencePopulation(analysis);
  const canonicalFeeRowRefs = canonicalFeeRowEvidencePopulation.map((row) => row.feeRowRef);
  const canonicalEvidenceRefs = [...new Set(canonicalFeeRowEvidencePopulation.flatMap((row) => row.evidenceRefs))].sort();
  const approvedFactRefs = canonical.admission.wholeStatementOutput?.factRefs.slice().sort() ?? [];
  const candidateRefs = candidates.map((candidate) => candidate.candidateRef);
  const claimSupportRefs = supports.map((support) => support.claimSupportRef);
  const claimSupportDecisionRefs = supports.map((support) => support.claimSupportDecisionRef).sort();
  const referenceContent = {
    canonicalFeeRowRefs,
    canonicalEvidenceRefs,
    canonicalFeeRowEvidencePopulation,
    approvedFactRefs,
    candidateRefs,
    claimSupportRefs,
    claimSupportDecisionRefs,
    expectedResearchQuestions: expectedQuestions,
    preparedSanitizedPacketContentHash: sha256Canonical(preparedPacket),
    wholeStatementPacketContentHash: sha256Canonical(preparedPacket.wholeStatementReview),
  };
  const canonicalReferenceProof = {
    type: EVALUATION_CANONICAL_REFERENCE_PROOF_VERSION,
    ...referenceContent,
    canonicalReferenceProjectionHash: calculateEvaluationCanonicalReferenceProjectionHash(referenceContent),
  };
  const disposition = canonical.admission.admissionDisposition;
  const admitted = disposition === "admitted";
  const validationErrorCodes = admitted ? [] : [...mappedValidationErrors(canonical.admission)];
  const projectedAcceptedRefs = supports.filter((support) => support.disposition === "accepted").map((support) => support.claimSupportRef).sort();
  const projectedRejectedRefs = supports.filter((support) => support.disposition === "rejected").map((support) => support.claimSupportRef).sort();
  const acceptedClaimSupportRefs = [...canonical.admission.acceptedClaimSupportRefs].sort();
  const rejectedClaimSupportRefs = [...canonical.admission.rejectedClaimSupportRefs].sort();
  if (JSON.stringify(acceptedClaimSupportRefs) !== JSON.stringify(projectedAcceptedRefs)
    || JSON.stringify(rejectedClaimSupportRefs) !== JSON.stringify(projectedRejectedRefs)) {
    throw new Error("package_5b_canonical_support_partition_mismatch");
  }
  const output = admitted ? canonical.admission.wholeStatementOutput : null;
  if (admitted && !output) throw new Error("package_5b_admitted_output_missing");
  const statusCounts = output ? {
    accepted: output.acceptanceRecords.filter((record) => ["accepted", "accepted_with_conditions"].includes(record.status)).length,
    needsVerification: output.acceptanceRecords.filter((record) => record.status === "needs_verification").length,
    humanReview: output.acceptanceRecords.filter((record) => record.status === "human_review").length,
    rejected: output.acceptanceRecords.filter((record) => record.status === "rejected").length,
  } : { accepted: 0, needsVerification: 0, humanReview: 0, rejected: 0 };
  const resultReason = disposition === "admitted" ? "canonical_admission_admitted" as const
    : disposition === "safety_blocked" ? "canonical_admission_safety_blocked" as const
      : "canonical_admission_rejected" as const;

  return {
    type: EVALUATION_CANONICAL_ADMISSION_RESULT_VERSION,
    resultId: `admission_result_${sha256Canonical({ sourceDocumentId: input.sourceDocumentId, capability: "whole_statement_fee_intelligence_review" }).slice(7, 31)}`,
    sourceDocumentId: input.sourceDocumentId,
    capabilityId: "whole_statement_fee_intelligence_review",
    executionRef: diagnostic.executionRef,
    admission: {
      type: EVALUATION_CANONICAL_ADMISSION_VERSION,
      capabilityId: "whole_statement_fee_intelligence_review",
      executionRef: diagnostic.executionRef,
      executionStatus: canonical.admission.executionStatus,
      validationStatus: admitted ? "passed" : "failed",
      groundingStatus: admitted ? "grounded" : "rejected",
      admissionDisposition: disposition,
      acceptedClaimSupportRefs,
      rejectedClaimSupportRefs,
      researchAttemptRefs: attempts.map((attempt) => attempt.researchAttemptRef).sort(),
      validationErrorCodes,
      reasonCodes: [resultReason],
      safeCounts: {
        reviewedFeeRowCount: output?.coverageProof.reviewedFeeRowRefs.length ?? 0,
        acceptedRecordCount: statusCounts.accepted,
        needsVerificationRecordCount: statusCounts.needsVerification,
        humanReviewRecordCount: statusCounts.humanReview,
        rejectedRecordCount: statusCounts.rejected,
        researchAttemptCount: attempts.length,
        evidenceCandidateCount: candidates.length,
        claimSupportCount: supports.length,
      },
      package5aDiagnosticRef: diagnostic.id,
      authoritative: false,
      financialMutationAllowed: false,
    },
    packageF: output ? {
      type: EVALUATION_PACKAGE_F_RECORD_VERSION,
      capabilityId: "whole_statement_fee_intelligence_review",
      executionRef: diagnostic.executionRef,
      output,
      sourceReferencesValidatedAgainstProof: true,
      authoritative: false,
      financialMutationAllowed: false,
    } : null,
    package5a: projectPackage5a(diagnostic, disposition, output !== null && usesExternalEvidence(output), resultReason),
    package5bWorkPlan: input.finalized.wholeStatementWorkPlan
      ? projectPackage5bWorkPlan(input.finalized.wholeStatementWorkPlan)
      : null,
    researchEvidence: {
      type: EVALUATION_RESEARCH_EVIDENCE_PROOF_VERSION,
      attempts,
      candidates,
      claimSupports: supports,
    },
    canonicalReferenceProof,
    lifecycleAdmissionRef: diagnostic.executionRef,
    admissionDisposition: disposition,
    reasonCodes: [resultReason],
    authoritative: false,
    financialMutationAllowed: false,
    customerPublished: false,
  };
}

function projectPackage5bWorkPlan(
  merged: NonNullable<FinalizedOneTimeStatementEvaluation["wholeStatementWorkPlan"]>,
): EvaluationPackage5BWorkPlanProjection {
  const resultByUnit = new Map(merged.workUnitResults.map((result) => [result.workUnitRef, result]));
  const selectedFeeRowRefs = new Set<string>();
  for (const unit of merged.plan.units) {
    const status = resultByUnit.get(unit.workUnitRef)?.status ?? unit.status;
    if (status === "not_selected_budget" || status === "not_selected_policy") continue;
    for (const rowRef of unit.expectedFeeRowRefs) selectedFeeRowRefs.add(rowRef);
  }
  return {
    type: "evaluation_package_5b_work_plan_projection_v1",
    policyVersion: merged.plan.policyVersion,
    mode: merged.plan.mode,
    statementPacketContentHash: merged.plan.statementPacketContentHash,
    expectedFeeRowCount: merged.plan.expectedFeeRowRefs.length,
    plannedFeeRowCount: merged.plan.plannedFeeRowRefs.length,
    selectedFeeRowCount: selectedFeeRowRefs.size,
    reviewedFeeRowCount: merged.output.coverageProof.reviewedFeeRowRefs.length,
    missingFeeRowCount: merged.output.coverageProof.missingFeeRowRefs.length,
    plannedWorkUnitCount: merged.plan.units.length,
    selectedWorkUnitCount: merged.selectedWorkUnitCount,
    completedWorkUnitCount: merged.completedWorkUnitCount,
    unavailableWorkUnitCount: merged.unavailableWorkUnitCount,
    notSelectedWorkUnitCount: merged.notSelectedWorkUnitCount,
    units: merged.plan.units.map((unit) => {
      const result = resultByUnit.get(unit.workUnitRef);
      const coverage = result?.validation?.output.coverageProof;
      return {
        workUnitRef: unit.workUnitRef,
        ordinal: unit.ordinal,
        status: result?.status ?? unit.status,
        outcomeClass: result?.outcomeClass ?? "not_attempted",
        expectedFeeRowRefs: unit.expectedFeeRowRefs.slice().sort(),
        expectedRowCount: unit.expectedFeeRowRefs.length,
        reviewedRowCount: coverage?.reviewedFeeRowRefs.length ?? 0,
        missingRowCount: coverage?.missingFeeRowRefs.length ?? unit.expectedFeeRowRefs.length,
        duplicatedRowCount: coverage?.duplicatedFeeRowRefs.length ?? 0,
        unknownRowCount: coverage?.unknownFeeRowRefs.length ?? 0,
        estimatedInputBytes: unit.estimatedInputBytes,
        estimatedOutputTokens: unit.estimatedOutputTokens,
        outputTokenCeiling: unit.outputTokenCeiling,
        requestId: result?.requestId ?? null,
        inputTokens: result?.inputTokens ?? null,
        cachedInputTokens: result?.cachedInputTokens ?? null,
        outputTokens: result?.outputTokens ?? null,
        durationMs: result?.durationMs ?? null,
        billingDisposition: result?.billingDisposition ?? "unknown",
        reasonCodes: [...new Set(result?.reasonCodes ?? unit.selectionReasonCodes)].sort(),
      };
    }).sort((left, right) => left.ordinal - right.ordinal),
    rawPromptPersisted: false,
    rawResponsePersisted: false,
    providerDetailsPersisted: false,
    reasonCodes: merged.reasonCodes,
  };
}

function projectPackage5a(
  diagnostic: CanonicalAiAdmissionAttemptRecord,
  disposition: "admitted" | "rejected" | "safety_blocked",
  externalEvidenceUsed: boolean,
  resultReason: "canonical_admission_admitted" | "canonical_admission_rejected" | "canonical_admission_safety_blocked",
): EvaluationPackage5AAdmissionProjection {
  if (!diagnostic.executionRef || !["completed", "failed", "timed_out"].includes(diagnostic.executionState)) {
    throw new Error("package_5b_diagnostic_execution_state_invalid");
  }
  const reasonCodes = [...new Set([
    ...diagnostic.reasonCodes,
    disposition === "admitted" ? "canonical_admission_admitted" : "canonical_admission_rejected",
  ])].sort() as EvaluationPackage5AAdmissionProjection["reasonCodes"];
  if (disposition === "safety_blocked" && !reasonCodes.includes("whole_statement_fee_intelligence_safety_blocked")) {
    reasonCodes.push("whole_statement_fee_intelligence_safety_blocked");
    reasonCodes.sort();
  }
  const sourceQuality = externalEvidenceUsed ? diagnostic.sourceQualityState : "not_applicable";
  const filteredReasons = externalEvidenceUsed ? reasonCodes : reasonCodes.filter((reason) => reason !== "source_quality_validated");
  return {
    type: EVALUATION_PACKAGE_5A_PROJECTION_VERSION,
    diagnosticRef: diagnostic.id,
    capabilityId: "whole_statement_fee_intelligence_review",
    executionRef: diagnostic.executionRef,
    executionState: diagnostic.executionState as "completed" | "failed" | "timed_out",
    admissionState: disposition === "admitted" ? "admitted" : "rejected",
    finalCanonicalStatus: disposition === "admitted" ? "completed"
      : disposition === "safety_blocked" ? "safety_blocked"
        : diagnostic.executionState === "failed" ? "failed"
          : diagnostic.executionState === "timed_out" ? "timed_out" : "rejected",
    stageStates: {
      responseParse: diagnostic.responseParseState,
      schemaValidation: diagnostic.schemaValidationState,
      evidenceCitation: diagnostic.evidenceCitationState,
      sourceQuality,
      linkage: diagnostic.linkageState,
      deterministicReconciliation: diagnostic.deterministicReconciliationState,
      privacySafety: diagnostic.privacySafetyState,
    },
    reasonCodes: filteredReasons,
    projectionReasonCodes: [],
    diagnosticRefs: [...new Set([
      ...diagnostic.references.factRefs,
      ...diagnostic.references.evidenceRefs,
      ...diagnostic.references.feeRowRefs,
      ...diagnostic.references.questionRefs,
      ...diagnostic.references.candidateRefs,
    ])].sort(),
    rawPromptPersisted: false,
    rawResponsePersisted: false,
    rawStatementTextPersisted: false,
    providerDetailsPersisted: false,
  };
}

function projectSupport(
  support: FeeKnowledgeClaimSupportRecord,
  sourcePacket: FeeKnowledgeSourcePacket,
  registry: ApprovedFeeKnowledgeSourceRegistry | null,
): EvaluationResearchClaimSupportProof {
  const base = buildCanonicalClaimSupportDecision({ support, sourcePacket, registry });
  const claimSupportDecisionRef = calculateEvaluationClaimSupportDecisionRef(base);
  if (support.candidateId !== null) {
    const candidate = sourcePacket.researchCandidates.find((item) => item.candidateId === support.candidateId);
    if (!candidate) throw new Error("package_5b_runtime_support_candidate_missing");
    if (candidate.claimSupportDecisionRef !== claimSupportDecisionRef) {
      throw new Error("package_5b_runtime_support_decision_reference_mismatch");
    }
  }
  return { ...base, claimSupportDecisionRef } as EvaluationResearchClaimSupportProof;
}

function canonicalEvidencePopulation(analysis: CanonicalStatementAnalysis) {
  const evidenceByOccurrence = new Map(analysis.feeLedger.sourceOccurrences.map((occurrence) => [occurrence.id, occurrence.evidenceRef]));
  return analysis.feeLedger.rows.map((row) => ({
    feeRowRef: row.id,
    evidenceRefs: [...new Set([
      ...row.sourceOccurrenceIds.map((id) => evidenceByOccurrence.get(id)).filter((ref): ref is string => Boolean(ref)),
      ...row.contributionDecision.evidenceRefs,
    ])].sort(),
    contributesToUniqueTotal: row.contributesToUniqueTotal,
  })).sort((left, right) => left.feeRowRef.localeCompare(right.feeRowRef));
}

function mappedValidationErrors(admission: FinalizedOneTimeStatementEvaluation["admission"]["admission"]) {
  if (admission.admissionDisposition === "safety_blocked") return ["whole_statement_privacy_safety_blocked"] as const;
  if (admission.reasonCodes.includes("whole_statement_research_incomplete")) return ["whole_statement_research_incomplete"] as const;
  if (admission.reasonCodes.some((reason) => reason.includes("linkage") || reason.includes("parentage"))) return ["whole_statement_linkage_invalid"] as const;
  if (admission.validationErrors.some((error) => /evidence|citation/i.test(error))) return ["whole_statement_evidence_invalid"] as const;
  if (admission.validationErrors.some((error) => /schema|unknown|type|policy/i.test(error))) return ["whole_statement_schema_invalid"] as const;
  return ["whole_statement_output_invalid"] as const;
}

function usesExternalEvidence(output: NonNullable<FinalizedOneTimeStatementEvaluation["admission"]["admission"]["wholeStatementOutput"]>): boolean {
  return output.rowInterpretations.some((row) =>
    row.evidenceProvenance === "runtime_verified_documentation" || row.evidenceProvenance === "approved_external_documentation",
  );
}
