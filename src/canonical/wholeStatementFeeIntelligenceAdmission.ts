import { createHash } from "node:crypto";
import {
  buildCanonicalAiAdmissionAudit,
  createValidatedDiagnosticReferenceSets,
  diagnosticSignalsFromValidationErrors,
  extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt,
  passedDiagnosticSignals,
  validateCanonicalAiAdmissionAudit,
  type CanonicalAiAdmissionAudit,
} from "./aiAdmissionDiagnostics.js";
import { buildCanonicalAiCapabilities, type CanonicalAiCapabilityHarnessInput } from "./buildCanonicalAiCapabilities.js";
import { buildCanonicalCustomerState } from "./customerStateResolver.js";
import {
  buildCanonicalClaimSupportDecision,
  calculateRuntimeClaimSupportDecisionRef,
} from "./feeKnowledgeClaimSupportDecision.js";
import type { ApprovedFeeKnowledgeSourceRegistry, FeeKnowledgeSourcePacket } from "./feeKnowledgeTypes.js";
import {
  deterministicReuseFeeClassificationCapabilityInput,
  type RuntimeAiCapabilitySnapshot,
} from "./runtimeAiCapabilityAdapter.js";
import { deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement } from "./runtimeFeeClassificationReviewReuse.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalStatementAnalysis,
} from "./types.js";
import { validateCanonicalStatementAnalysis } from "./validate.js";
import type { CanonicalWholeStatementFeeIntelligenceValidationResult } from "./wholeStatementFeeIntelligenceReview.js";

export const CANONICAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ADMISSION_VERSION =
  "canonical_whole_statement_fee_intelligence_admission_v1" as const;

export type CanonicalWholeStatementFeeIntelligenceAdmission = {
  type: typeof CANONICAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ADMISSION_VERSION;
  executionStatus: "completed" | "failed" | "timed_out";
  validationStatus: "passed" | "failed";
  groundingStatus: "grounded" | "rejected" | "incomplete";
  admissionDisposition: "admitted" | "rejected" | "safety_blocked";
  executionRef: string;
  wholeStatementOutput: CanonicalAiWholeStatementFeeIntelligenceOutput | null;
  validationErrors: string[];
  acceptedClaimSupportRefs: string[];
  rejectedClaimSupportRefs: string[];
  researchAttemptRefs: string[];
  safeCounts: {
    researchAttemptCount: number;
    researchCandidateCount: number;
    claimSupportCount: number;
    acceptedClaimSupportCount: number;
    reviewedFeeRowCount: number;
  };
  reasonCodes: string[];
  package5aDiagnosticRef: string;
  authoritative: false;
  financialMutationAllowed: false;
};

export type CanonicalWholeStatementAdmissionResult = {
  admission: CanonicalWholeStatementFeeIntelligenceAdmission;
  analysis: CanonicalStatementAnalysis;
  aiAdmissionAudit: CanonicalAiAdmissionAudit;
  runtimeFeeClassificationReview: CanonicalRuntimeFeeClassificationReview;
  runtimeFeeClassificationReusePacketRef: string | null;
};

export function admitWholeStatementFeeIntelligence(input: {
  analysis: CanonicalStatementAnalysis;
  validation: CanonicalWholeStatementFeeIntelligenceValidationResult;
  sourcePacket: FeeKnowledgeSourcePacket;
  registry?: ApprovedFeeKnowledgeSourceRegistry | null;
  executionStatus?: "completed" | "failed" | "timed_out";
}): CanonicalWholeStatementAdmissionResult {
  const before = protectedFinancialHash(input.analysis);
  const executionStatus = input.executionStatus ?? "completed";
  const linkageErrors = validateResearchLinkage(input.sourcePacket);
  const supportDecisions = input.sourcePacket.claimSupports.map((support) => buildCanonicalClaimSupportDecision({
    support,
    sourcePacket: input.sourcePacket,
    registry: input.registry ?? null,
  }));
  const supportReferenceErrors = validateOutputSupportReferences(input.validation.output, supportDecisions);
  const incompleteResearch = input.sourcePacket.researchAttempts.some((attempt) => attempt.status !== "completed");
  const incompleteCandidates = input.sourcePacket.researchCandidates.some((candidate) =>
    candidate.retrievalStatus !== "retrieved_text"
      || !["completed", "unsupported"].includes(candidate.semanticVerificationStatus)
      || !candidate.sourceFingerprint
      || !candidate.locatorHash
      || !candidate.claimSupportDecisionRef,
  );
  const validationErrors = safeValidationErrors(input.validation.ok ? [] : input.validation.errors);
  const researchSafetyBlocked = input.sourcePacket.researchAttempts.some((attempt) => attempt.status === "safety_blocked")
    || input.sourcePacket.researchCandidates.some((candidate) => candidate.retrievalStatus === "safety_blocked"
      || candidate.semanticVerificationStatus === "safety_blocked"
      || candidate.verificationStatus === "safety_blocked");
  const safetyBlocked = researchSafetyBlocked
    || input.validation.output.reviewStatus === "safety_blocked"
    || input.validation.errors.some((error) => /forbidden|privacy|safety|sensitive/i.test(error));
  const eligible = executionStatus === "completed"
    && input.validation.ok
    && input.validation.output.reviewStatus === "completed"
    && !incompleteResearch
    && !incompleteCandidates
    && linkageErrors.length === 0
    && supportReferenceErrors.length === 0
    && input.sourcePacket.registryValidation.status === "valid";

  const acceptedClaimSupportRefs = supportDecisions
    .filter((decision) => decision.disposition === "accepted")
    .map((decision) => decision.claimSupportRef)
    .sort();
  const rejectedClaimSupportRefs = supportDecisions
    .filter((decision) => decision.disposition === "rejected")
    .map((decision) => decision.claimSupportRef)
    .sort();

  const provisional = eligible
    ? rebuildWholeStatementCapability(input.analysis, input.validation.output, `ai_exec_${"0".repeat(32)}`, "completed")
    : safetyBlocked
      ? rebuildWholeStatementCapability(input.analysis, null, `ai_exec_${"0".repeat(32)}`, "safety_blocked")
      : structuredClone(input.analysis);
  const snapshot = admissionSnapshot({
    output: input.validation.output,
    admitted: eligible,
    sourcePacket: input.sourcePacket,
    executionStatus,
    safetyBlocked,
    validationErrors: [
      ...validationErrors,
      ...linkageErrors,
      ...supportReferenceErrors,
      ...(safetyBlocked ? ["whole_statement_fee_intelligence_privacy_safety_blocked"] : []),
    ],
  });
  const aiAdmissionAudit = buildCanonicalAiAdmissionAudit({
    capabilities: provisional.aiCapabilities.capabilities,
    attempts: [snapshot],
  });
  const diagnostic = aiAdmissionAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review")!;
  if (!diagnostic.executionRef) throw new Error("whole_statement_execution_reference_missing");
  const auditErrors = validateCanonicalAiAdmissionAudit(aiAdmissionAudit);
  const admitted = eligible && auditErrors.length === 0;
  const analysis = admitted
    ? rebuildWholeStatementCapability(input.analysis, input.validation.output, diagnostic.executionRef, "completed")
    : safetyBlocked
      ? rebuildWholeStatementCapability(input.analysis, null, diagnostic.executionRef, "safety_blocked")
      : structuredClone(input.analysis);
  if (protectedFinancialHash(analysis) !== before) throw new Error("packages_b_e_changed_during_whole_statement_admission");

  const fallbackFeeClassificationReuse = deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
    analysis,
    source: {
      executionStatus,
      admissionDisposition: admitted ? "rejected" : safetyBlocked ? "safety_blocked" : "rejected",
      wholeStatementOutput: null,
    },
  });
  const feeClassificationComposition = composeFeeClassificationReuse({
    analysis,
    aiAdmissionAudit,
    originalAnalysis: input.analysis,
    output: input.validation.output,
    executionStatus,
    admissionDisposition: admitted ? "admitted" : safetyBlocked ? "safety_blocked" : "rejected",
    beforeProtectedFinancialHash: before,
    safetyBlocked,
  });
  const finalAnalysis = feeClassificationComposition?.analysis ?? analysis;
  const finalAiAdmissionAudit = feeClassificationComposition?.aiAdmissionAudit ?? aiAdmissionAudit;
  const feeClassificationReuse = feeClassificationComposition?.feeClassificationReuse ?? fallbackFeeClassificationReuse;
  const finalDiagnostic = finalAiAdmissionAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review")!;
  if (!finalDiagnostic.executionRef) throw new Error("whole_statement_execution_reference_missing");

  return {
    analysis: finalAnalysis,
    aiAdmissionAudit: finalAiAdmissionAudit,
    runtimeFeeClassificationReview: feeClassificationReuse.review,
    runtimeFeeClassificationReusePacketRef: feeClassificationReuse.packetRef,
    admission: {
      type: CANONICAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ADMISSION_VERSION,
      executionStatus,
      validationStatus: input.validation.ok ? "passed" : "failed",
      groundingStatus: admitted ? "grounded" : incompleteResearch || incompleteCandidates ? "incomplete" : "rejected",
      admissionDisposition: admitted ? "admitted" : safetyBlocked ? "safety_blocked" : "rejected",
      executionRef: finalDiagnostic.executionRef,
      wholeStatementOutput: admitted ? input.validation.output : null,
      validationErrors,
      acceptedClaimSupportRefs,
      rejectedClaimSupportRefs,
      researchAttemptRefs: input.sourcePacket.researchAttempts.map((attempt) => attempt.attemptId).sort(),
      safeCounts: {
        researchAttemptCount: input.sourcePacket.researchAttempts.length,
        researchCandidateCount: input.sourcePacket.researchCandidates.length,
        claimSupportCount: input.sourcePacket.claimSupports.length,
        acceptedClaimSupportCount: acceptedClaimSupportRefs.length,
        reviewedFeeRowCount: input.validation.output.coverageProof.reviewedFeeRowRefs.length,
      },
      reasonCodes: [...new Set([
        admitted ? "whole_statement_admission_grounded" : safetyBlocked ? "whole_statement_admission_safety_blocked" : "whole_statement_admission_rejected",
        ...(incompleteResearch || incompleteCandidates ? ["whole_statement_research_incomplete"] : []),
        ...linkageErrors,
        ...supportReferenceErrors,
        ...input.sourcePacket.registryValidation.reasonCodes,
        ...(auditErrors.length ? ["whole_statement_package5a_audit_invalid"] : []),
      ])].sort(),
      package5aDiagnosticRef: finalDiagnostic.id,
      authoritative: false,
      financialMutationAllowed: false,
    },
  };
}

function composeFeeClassificationReuse(input: {
  analysis: CanonicalStatementAnalysis;
  aiAdmissionAudit: CanonicalAiAdmissionAudit;
  originalAnalysis: CanonicalStatementAnalysis;
  output: CanonicalAiWholeStatementFeeIntelligenceOutput;
  executionStatus: "completed" | "failed" | "timed_out";
  admissionDisposition: "admitted" | "rejected" | "safety_blocked";
  beforeProtectedFinancialHash: string;
  safetyBlocked: boolean;
}): {
  analysis: CanonicalStatementAnalysis;
  aiAdmissionAudit: CanonicalAiAdmissionAudit;
  feeClassificationReuse: ReturnType<typeof deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement>;
} | null {
  try {
    const feeClassificationReuse = deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
      analysis: input.analysis,
      source: {
        executionStatus: input.executionStatus,
        admissionDisposition: input.admissionDisposition,
        wholeStatementOutput: input.admissionDisposition === "admitted" ? input.output : null,
      },
    });
    const feeClassificationCapability = deterministicReuseFeeClassificationCapabilityInput({
      analysis: input.analysis,
      review: feeClassificationReuse.review,
      packetRef: feeClassificationReuse.packetRef,
    });
    const provisionalFinalAnalysis = rebuildWithExtraCapability(input.analysis, feeClassificationCapability.harnessInput);
    const finalAiAdmissionAudit = extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt({
      audit: input.aiAdmissionAudit,
      capabilities: provisionalFinalAnalysis.aiCapabilities.capabilities,
      attempt: feeClassificationCapability.snapshot,
    });
    if (!finalAiAdmissionAudit) return null;
    const finalDiagnostic = finalAiAdmissionAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review");
    if (!finalDiagnostic?.executionRef) return null;
    const finalBaseAnalysis = input.admissionDisposition === "admitted"
      ? rebuildWholeStatementCapability(input.originalAnalysis, input.output, finalDiagnostic.executionRef, "completed")
      : input.safetyBlocked
        ? rebuildWholeStatementCapability(input.originalAnalysis, null, finalDiagnostic.executionRef, "safety_blocked")
        : structuredClone(input.originalAnalysis);
    const finalAnalysis = rebuildWithExtraCapability(finalBaseAnalysis, feeClassificationCapability.harnessInput);
    if (protectedFinancialHash(finalAnalysis) !== input.beforeProtectedFinancialHash) return null;
    return { analysis: finalAnalysis, aiAdmissionAudit: finalAiAdmissionAudit, feeClassificationReuse };
  } catch {
    return null;
  }
}

export function validateResearchLinkage(packet: FeeKnowledgeSourcePacket): string[] {
  const errors: string[] = [];
  const attempts = new Map(packet.researchAttempts.map((attempt) => [attempt.attemptId, attempt]));
  const candidates = new Map(packet.researchCandidates.map((candidate) => [candidate.candidateId, candidate]));
  const supportsByCandidate = new Map<string, FeeKnowledgeSourcePacket["claimSupports"]>();
  if (attempts.size !== packet.researchAttempts.length) errors.push("whole_statement_research_attempt_duplicate");
  if (candidates.size !== packet.researchCandidates.length) errors.push("whole_statement_research_candidate_duplicate");
  for (const attempt of packet.researchAttempts) {
    if (attempt.resultCount !== attempt.candidateIds.length || new Set(attempt.candidateIds).size !== attempt.candidateIds.length) {
      errors.push("whole_statement_research_attempt_count_invalid");
    }
    for (const candidateId of attempt.candidateIds) {
      const candidate = candidates.get(candidateId);
      if (!candidate || candidate.attemptId !== attempt.attemptId || candidate.questionRef !== attempt.questionRef || candidate.feeRowRef !== attempt.feeRowRef) {
        errors.push("whole_statement_research_candidate_parentage_invalid");
      }
    }
  }
  for (const candidate of packet.researchCandidates) {
    const attempt = attempts.get(candidate.attemptId);
    if (!attempt || !attempt.candidateIds.includes(candidate.candidateId)) errors.push("whole_statement_research_attempt_candidate_missing");
  }
  for (const support of packet.claimSupports.filter((item) => item.candidateId !== null)) {
    const candidate = candidates.get(support.candidateId!);
    supportsByCandidate.set(support.candidateId!, [...(supportsByCandidate.get(support.candidateId!) ?? []), support]);
    if (!candidate || candidate.feeRowRef !== support.feeRowRef
      || candidate.sourceFingerprint !== support.documentFingerprint
      || candidate.locatorHash !== support.locatorTextHash
      || candidate.claimSupportDecisionRef !== calculateRuntimeClaimSupportDecisionRef({ support, candidate })) {
      errors.push("whole_statement_claim_support_linkage_invalid");
    }
  }
  for (const candidate of packet.researchCandidates) {
    const supports = supportsByCandidate.get(candidate.candidateId) ?? [];
    if (supports.length === 0 && candidate.claimSupportDecisionRef !== null) {
      errors.push("whole_statement_candidate_decision_without_support");
    }
    if (supports.length > 1) errors.push("whole_statement_candidate_support_not_unique");
  }
  return [...new Set(errors)].sort();
}

function validateOutputSupportReferences(
  output: CanonicalAiWholeStatementFeeIntelligenceOutput,
  decisions: ReturnType<typeof buildCanonicalClaimSupportDecision>[],
): string[] {
  const errors: string[] = [];
  const interpretations = new Map(output.rowInterpretations.map((record) => [record.feeRowRef, record]));
  for (const record of output.acceptanceRecords) {
    const interpretation = interpretations.get(record.feeRowRef);
    const origin = interpretation?.evidenceProvenance === "runtime_verified_documentation"
      ? "runtime_research"
      : interpretation?.evidenceProvenance === "approved_external_documentation"
        ? "approved_registry"
        : null;
    const references = resolveOutputSupportReferences({
      feeRowRef: record.feeRowRef,
      externalClaimSupportRef: record.externalClaimSupportRef,
      externalSourceRef: record.externalSourceRef,
      origin,
      decisions,
    });
    const external = record.externalClaimSupportRef !== null || record.externalSourceRef !== null;
    if (external && (references.length !== 1 || references[0]?.feeRowRef !== record.feeRowRef)) {
      errors.push("whole_statement_claim_support_reference_not_unique");
      continue;
    }
    if (["accepted", "accepted_with_conditions"].includes(record.status)
      && external
      && references[0]?.disposition !== "accepted") {
      errors.push("whole_statement_accepted_claim_support_not_eligible");
    }
  }
  return [...new Set(errors)].sort();
}

function resolveOutputSupportReferences(input: {
  feeRowRef: string;
  externalClaimSupportRef: string | null;
  externalSourceRef: string | null;
  origin: "runtime_research" | "approved_registry" | null;
  decisions: ReturnType<typeof buildCanonicalClaimSupportDecision>[];
}) {
  if (!input.origin) return [];
  if (input.externalClaimSupportRef !== null) {
    const support = input.decisions.find((decision) => decision.claimSupportRef === input.externalClaimSupportRef);
    if (!support || support.origin !== input.origin || support.feeRowRef !== input.feeRowRef) return [];
    const sourceRefs = support.origin === "runtime_research"
      ? [support.runtimeSourceRef, support.runtimeClaimRef]
      : [support.approvedSourceRef, support.approvedClaimRef];
    return input.externalSourceRef === null || sourceRefs.includes(input.externalSourceRef) ? [support] : [];
  }
  if (input.externalSourceRef === null) return [];
  return input.decisions.filter((support) => support.origin === input.origin
    && support.feeRowRef === input.feeRowRef
    && (support.origin === "runtime_research"
      ? support.runtimeSourceRef === input.externalSourceRef || support.runtimeClaimRef === input.externalSourceRef
      : support.approvedSourceRef === input.externalSourceRef || support.approvedClaimRef === input.externalSourceRef));
}

function rebuildWholeStatementCapability(
  analysis: CanonicalStatementAnalysis,
  output: CanonicalAiWholeStatementFeeIntelligenceOutput | null,
  executionRef: string,
  status: "completed" | "safety_blocked",
): CanonicalStatementAnalysis {
  const harnessInputs: CanonicalAiCapabilityHarnessInput[] = analysis.aiCapabilities.capabilities.map((record) => ({
    capability: record.capability,
    status: record.capability === "whole_statement_fee_intelligence_review" ? status : record.status,
    output: record.capability === "whole_statement_fee_intelligence_review" ? output : record.output,
    executionRef: record.capability === "whole_statement_fee_intelligence_review" ? executionRef : record.executionRef,
    independentReviewRefs: record.independentReviewRefs,
  }));
  if (!harnessInputs.some((item) => item.capability === "whole_statement_fee_intelligence_review")) {
    harnessInputs.push({ capability: "whole_statement_fee_intelligence_review", status, output, executionRef, independentReviewRefs: [] });
  }
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs,
    deterministicRuntimeSafetyReview: analysis.aiCapabilities.deterministicRuntimeSafetyReview,
  });
  return validateCanonicalStatementAnalysis({
    ...structuredClone(analysis),
    aiCapabilities,
    customerState: buildCanonicalCustomerState({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      aiCapabilities,
    }),
  });
}

function rebuildWithExtraCapability(
  analysis: CanonicalStatementAnalysis,
  harnessInput: CanonicalAiCapabilityHarnessInput,
): CanonicalStatementAnalysis {
  const harnessInputs: CanonicalAiCapabilityHarnessInput[] = analysis.aiCapabilities.capabilities.map((record) => ({
    capability: record.capability,
    status: record.capability === harnessInput.capability ? harnessInput.status : record.status,
    output: record.capability === harnessInput.capability ? harnessInput.output : record.output,
    executionRef: record.capability === harnessInput.capability ? harnessInput.executionRef : record.executionRef,
    independentReviewRefs: record.capability === harnessInput.capability ? harnessInput.independentReviewRefs : record.independentReviewRefs,
  }));
  if (!harnessInputs.some((item) => item.capability === harnessInput.capability)) harnessInputs.push(harnessInput);
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs,
    deterministicRuntimeSafetyReview: analysis.aiCapabilities.deterministicRuntimeSafetyReview,
  });
  return validateCanonicalStatementAnalysis({
    ...structuredClone(analysis),
    aiCapabilities,
    customerState: buildCanonicalCustomerState({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      aiCapabilities,
    }),
  });
}

function admissionSnapshot(input: {
  output: CanonicalAiWholeStatementFeeIntelligenceOutput;
  admitted: boolean;
  sourcePacket: FeeKnowledgeSourcePacket;
  executionStatus: "completed" | "failed" | "timed_out";
  safetyBlocked: boolean;
  validationErrors: string[];
}): RuntimeAiCapabilitySnapshot {
  const feeRowRefs = input.output.coverageProof.expectedFeeRowRefs;
  const evidenceRefs = input.output.evidenceRefs;
  const questionRefs = input.sourcePacket.researchAttempts.map((attempt) => attempt.questionRef);
  const candidateRefs = input.sourcePacket.researchCandidates.map((candidate) => candidate.candidateId);
  const completed = input.admitted;
  const normalizedStatus = completed ? "completed" : input.safetyBlocked ? "safety_blocked"
    : input.executionStatus === "timed_out" ? "timed_out" : input.executionStatus === "failed" ? "failed" : "rejected";
  const passedStages = ["response_parse", "schema_validation", "evidence_citation", "linkage", "deterministic_reconciliation", "privacy_safety"] as const;
  return {
    capability: "whole_statement_fee_intelligence_review",
    attempted: true,
    normalizedStatus,
    safeCounts: {
      expectedFeeRowCount: feeRowRefs.length,
      reviewedFeeRowCount: input.output.coverageProof.reviewedFeeRowRefs.length,
      acceptedRecordCount: input.output.acceptanceRecords.filter((record) => ["accepted", "accepted_with_conditions"].includes(record.status)).length,
      needsVerificationCount: input.output.acceptanceRecords.filter((record) => record.status === "needs_verification").length,
      humanReviewCount: input.output.acceptanceRecords.filter((record) => record.status === "human_review").length,
      rejectedRecordCount: input.output.acceptanceRecords.filter((record) => record.status === "rejected").length,
    },
    executionRef: null,
    reasonCodes: [completed ? "whole_statement_fee_intelligence_completed" : normalizedStatus === "timed_out" ? "whole_statement_fee_intelligence_timed_out" : normalizedStatus === "failed" ? "whole_statement_fee_intelligence_failed" : normalizedStatus === "safety_blocked" ? "whole_statement_fee_intelligence_safety_blocked" : "whole_statement_fee_intelligence_rejected"],
    diagnosticSignals: completed
      ? passedDiagnosticSignals(input.sourcePacket.claimSupports.length > 0 ? [...passedStages, "source_quality"] : passedStages)
      : normalizedStatus === "safety_blocked"
        ? [{ stage: "privacy_safety", state: "failed", reasonCode: "forbidden_content", fieldPath: null }]
        : diagnosticSignalsFromValidationErrors(input.validationErrors),
    diagnosticReferences: { feeRowRefs, evidenceRefs, questionRefs, candidateRefs },
    trustedDiagnosticReferenceSets: createValidatedDiagnosticReferenceSets({ feeRowRefs, evidenceRefs, questionRefs, candidateRefs }),
  };
}

function safeValidationErrors(errors: readonly string[]): string[] {
  return [...new Set(errors.filter((error) => /^whole_statement_fee_intelligence_[a-z0-9_.\[\]-]{1,180}$/i.test(error)))].sort();
}

function protectedFinancialHash(analysis: CanonicalStatementAnalysis): string {
  return createHash("sha256").update(JSON.stringify({
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
  })).digest("hex");
}
