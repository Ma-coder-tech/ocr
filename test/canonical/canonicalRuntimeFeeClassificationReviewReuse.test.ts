import { describe, expect, it, vi } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildFeeKnowledgeSourcePacket } from "../../src/canonical/feeKnowledgeRegistry.js";
import {
  buildCanonicalAiAdmissionAudit,
  createValidatedDiagnosticReferenceSets,
  extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt,
  passedDiagnosticSignals,
  validateCanonicalAiAdmissionAudit,
} from "../../src/canonical/aiAdmissionDiagnostics.js";
import { deterministicReuseFeeClassificationCapabilityInput } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import {
  buildCanonicalRuntimeFeeClassificationReviewPacket,
  validateCanonicalRuntimeFeeClassificationReview,
} from "../../src/canonical/runtimeFeeClassificationReview.js";
import {
  deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement,
  packetRefForAdmittedWholeStatementOutput,
} from "../../src/canonical/runtimeFeeClassificationReviewReuse.js";
import { admitWholeStatementFeeIntelligence } from "../../src/canonical/wholeStatementFeeIntelligenceAdmission.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReview,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalFeeClassificationResolution,
  CanonicalFeeRow,
  CanonicalStatementAnalysis,
  CanonicalWholeStatementFeeIntelligenceRowInterpretation,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical runtime fee classification review reuse", () => {
  it("returns deterministic not_needed when there are no material unresolved rows", () => {
    const analysis = noMaterialAnalysis();
    const result = deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
      analysis,
      source: { executionStatus: "completed", admissionDisposition: "rejected", wholeStatementOutput: null },
    });

    expect(result.review.status).toBe("not_needed");
    expect(result.review.absenceProof).toBe("deterministic_absence_proven:material_unresolved_fee_rows");
    expect(result.packetRef).toBeNull();
  });

  it("maps admitted accepted rows to confirm_existing or suggest_alternative", () => {
    const analysis = materialAnalysis();
    const packet = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
    const [sameRow, differentRow] = packet.materialFeeRowRefs;
    const output = wholeStatementOutput(analysis, {
      [sameRow!]: { proposedCategory: "unknown_needs_review" },
      [differentRow!]: { proposedCategory: "processor_markup" },
    });
    const result = successfulReuse(analysis, output);

    expect(dispositionByRow(result.review)).toMatchObject({
      [sameRow!]: "confirm_existing",
      [differentRow!]: "suggest_alternative",
    });
    expect(result.review.suggestions.find((suggestion) => suggestion.feeRowRef === differentRow)?.suggestedCategory).toBe("processor_markup");
  });

  it("keeps accepted_with_conditions diagnostic and preserves a condition reason", () => {
    const analysis = materialAnalysis({ anomalyReviewSatisfied: true });
    const row = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis).materialFeeRowRefs[0]!;
    const output = wholeStatementOutput(analysis, {
      [row]: { confidence: "medium", proposedCategory: "processor_markup" },
    });
    const result = successfulReuse(analysis, output);

    const suggestion = result.review.suggestions.find((item) => item.feeRowRef === row)!;
    expect(output.acceptanceRecords.find((record) => record.feeRowRef === row)?.status).toBe("accepted_with_conditions");
    expect(suggestion.disposition).toBe("suggest_alternative");
    expect(suggestion.reasonCodes).toContain("runtime_fee_classification_reused_whole_statement_conditions");
    expect(suggestion.authoritative).toBe(false);
  });

  it("maps insufficient, conflicting, reconciliation-only, and human-review outcomes conservatively", () => {
    const analysis = materialAnalysis();
    const [insufficientRow, conflictRow] = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis).materialFeeRowRefs;
    const insufficient = successfulReuse(analysis, wholeStatementOutput(analysis, {
      [insufficientRow!]: { recommendedDisposition: "insufficient_evidence", missingEvidence: ["Contract support unavailable."] },
    })).review;
    const conflict = successfulReuse(analysis, wholeStatementOutput(analysis, {
      [conflictRow!]: { recommendedDisposition: "conflicting_evidence", conflicts: ["Statement support conflicts."] },
    })).review;
    const reconciliationOnlyOutput = wholeStatementOutput(analysis);
    reconciliationOnlyOutput.acceptanceRecords[0] = {
      ...reconciliationOnlyOutput.acceptanceRecords[0]!,
      status: "needs_verification",
      acceptedSemanticFields: {
        category: null,
        likelyEconomicOwner: null,
        likelyContractualController: null,
        actionabilityCeiling: null,
        evidenceProvenance: null,
      },
      reasonCodes: ["whole_statement_fee_intelligence_support_needs_verification"],
    };
    const reconciliationOnly = successfulReuse(analysis, reconciliationOnlyOutput).review;
    const human = successfulReuse(analysis, wholeStatementOutput(analysis, {
      [conflictRow!]: { recommendedDisposition: "human_review", evidenceProvenance: "human_review" },
    })).review;

    expect(dispositionByRow(insufficient)[insufficientRow!]).toBe("insufficient_evidence");
    expect(dispositionByRow(conflict)[conflictRow!]).toBe("needs_human_review");
    expect(dispositionByRow(reconciliationOnly)[insufficientRow!]).toBe("needs_human_review");
    expect(dispositionByRow(human)[conflictRow!]).toBe("needs_human_review");
  });

  it("fails closed for rejected row acceptance and non-admitted Package 5B terminal states", () => {
    const analysis = materialAnalysis();
    const rejectedRowOutput = wholeStatementOutput(analysis, {
      [buildCanonicalRuntimeFeeClassificationReviewPacket(analysis).materialFeeRowRefs[0]!]: { evidenceProvenance: "merchant_evidence" },
    });

    expect(successfulReuse(analysis, rejectedRowOutput).review).toMatchObject({ status: "rejected", suggestions: [] });
    expect(deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
      analysis,
      source: { executionStatus: "completed", admissionDisposition: "rejected", wholeStatementOutput: null },
    }).review.status).toBe("rejected");
    expect(deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
      analysis,
      source: { executionStatus: "completed", admissionDisposition: "safety_blocked", wholeStatementOutput: null },
    }).review.status).toBe("safety_blocked");
    expect(deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
      analysis,
      source: { executionStatus: "timed_out", admissionDisposition: "rejected", wholeStatementOutput: null },
    }).review.status).toBe("timed_out");
    expect(deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
      analysis,
      source: { executionStatus: "failed", admissionDisposition: "rejected", wholeStatementOutput: null },
    }).review.status).toBe("failed");
  });

  it("withholds reuse packet refs unless the source is eligible for admitted reuse", () => {
    const analysis = materialAnalysis();
    const output = wholeStatementOutput(analysis);
    const brokenCoverage = structuredClone(output);
    brokenCoverage.coverageProof.exactCoverage = false;

    for (const source of [
      { executionStatus: "completed" as const, admissionDisposition: "rejected" as const, wholeStatementOutput: output },
      { executionStatus: "completed" as const, admissionDisposition: "safety_blocked" as const, wholeStatementOutput: output },
      { executionStatus: "timed_out" as const, admissionDisposition: "rejected" as const, wholeStatementOutput: output },
      { executionStatus: "failed" as const, admissionDisposition: "rejected" as const, wholeStatementOutput: output },
      { executionStatus: "completed" as const, admissionDisposition: "admitted" as const, wholeStatementOutput: brokenCoverage },
    ]) {
      const result = deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({ analysis, source });
      expect(result.review.status).not.toBe("completed_with_diagnostic_suggestions");
      expect(result.packetRef).toBeNull();
    }
  });

  it("rejects broken coverage, row cardinality, and evidence compatibility", () => {
    const analysis = materialAnalysis();
    const row = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis).materialFeeRowRefs[0]!;
    const coverageMismatch = wholeStatementOutput(analysis);
    coverageMismatch.coverageProof.exactCoverage = false;
    const missingInterpretation = wholeStatementOutput(analysis);
    missingInterpretation.rowInterpretations = missingInterpretation.rowInterpretations.filter((item) => item.feeRowRef !== row);
    const duplicateAcceptance = wholeStatementOutput(analysis);
    duplicateAcceptance.acceptanceRecords = [duplicateAcceptance.acceptanceRecords[0]!, ...duplicateAcceptance.acceptanceRecords];
    const foreignEvidence = wholeStatementOutput(analysis);
    foreignEvidence.rowInterpretations[0] = { ...foreignEvidence.rowInterpretations[0]!, evidenceRefs: [EVIDENCE_B] };
    const emptyEvidence = wholeStatementOutput(analysis);
    emptyEvidence.rowInterpretations[0] = { ...emptyEvidence.rowInterpretations[0]!, evidenceRefs: [] };

    for (const output of [coverageMismatch, missingInterpretation, duplicateAcceptance, foreignEvidence, emptyEvidence]) {
      expect(successfulReuse(analysis, output).review).toMatchObject({ status: "rejected", suggestions: [] });
    }
  });

  it("uses the selected candidate ref only from the 5C packet and passes the existing validator", () => {
    const analysis = materialAnalysis();
    const packet = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
    const result = successfulReuse(analysis, wholeStatementOutput(analysis));

    expect(result.review.suggestions.map((suggestion) => suggestion.currentClassificationCandidateRef)).toEqual(
      packet.materialFeeRowRefs.map((row) => packet.selectedClassificationCandidateRefByFeeRowRef[row]),
    );
    expect(validateCanonicalRuntimeFeeClassificationReview(result.review, analysis).ok).toBe(true);
  });

  it("wires deterministic reuse into Package F and Package 5A without a second execution", () => {
    const analysis = materialAnalysis({ anomalyReviewSatisfied: true });
    const before = financialProjection(analysis);
    const beforeCustomerActions = structuredClone(analysis.customerState.actionGuidance);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const wholePacket = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview(validWholeStatementReview(wholePacket), analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const result = admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket });
    const feeCapability = result.analysis.aiCapabilities.capabilities.find((capability) => capability.capability === "fee_classification_review")!;
    const wholeCapability = result.analysis.aiCapabilities.capabilities.find((capability) => capability.capability === "whole_statement_fee_intelligence_review")!;
    const feeAttempt = result.aiAdmissionAudit.attempts.find((attempt) => attempt.capability === "fee_classification_review")!;
    const wholeAttempt = result.aiAdmissionAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review")!;

    expect(result.admission.admissionDisposition).toBe("admitted");
    expect(result.admission.executionRef).toBe(wholeAttempt.executionRef);
    expect(wholeCapability.executionRef).toBe(result.admission.executionRef);
    expect(feeCapability).toMatchObject({ status: "completed_diagnostic", output: null, executionRef: null, independentReviewRefs: [] });
    expect(feeAttempt).toMatchObject({
      executionState: "not_started",
      executionRef: null,
      admissionState: "diagnostic_only",
      finalCanonicalStatus: "completed_diagnostic",
    });
    expect(feeAttempt.responseParseState).toBe("not_applicable");
    expect(feeAttempt.schemaValidationState).toBe("passed");
    expect(feeAttempt.evidenceCitationState).toBe("passed");
    expect(feeAttempt.linkageState).toBe("passed");
    expect(feeAttempt.deterministicReconciliationState).toBe("passed");
    expect(feeAttempt.privacySafetyState).toBe("passed");
    expect(feeAttempt.sourceQualityState).toBe("not_applicable");
    expect(feeAttempt.reasonCodes).toContain("runtime_fee_classification_review_reused_whole_statement");
    expect(feeAttempt.references.packetRefs).toEqual([result.runtimeFeeClassificationReusePacketRef]);
    expect(feeAttempt.references.packetRefs.join(" ")).not.toContain("ai_exec_");
    expect(result.runtimeFeeClassificationReview.status).toBe("completed_with_diagnostic_suggestions");
    expect(validateCanonicalAiAdmissionAudit(result.aiAdmissionAudit)).toEqual([]);
    expect(financialProjection(result.analysis)).toEqual(before);
    expect(result.analysis.feeOwnershipActionability.rowClassifications.every((classification) =>
      classification.selected.category === "unknown_needs_review"
    )).toBe(true);
    expect(result.analysis.feeLedger.rows.every((row) => row.role === "unknown_unresolved")).toBe(true);
    expect(feeCapability.output).toBeNull();
    expect(result.analysis.aiCapabilities.summary.financialReadiness).toBe("limited");
    expect(result.analysis.opportunityEngine).toEqual(before.opportunityEngine);
    expect(result.analysis.customerState.actionGuidance).toEqual(beforeCustomerActions);
    expect(result.analysis.customerState.actionGuidance).toHaveLength(0);
  });

  it("preserves upstream Package 5B terminal truth through admission fallback statuses", () => {
    const analysis = materialAnalysis();
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const wholePacket = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview(
      validWholeStatementReview(wholePacket),
      analysis,
      { approvedExternalSourceRefs: [] },
      sourcePacket,
    );

    expect(admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket, executionStatus: "failed" })
      .runtimeFeeClassificationReview.status).toBe("failed");
    expect(admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket, executionStatus: "timed_out" })
      .runtimeFeeClassificationReview.status).toBe("timed_out");
    expect(admitWholeStatementFeeIntelligence({
      analysis,
      validation: {
        ...validation,
        ok: false,
        output: { ...validation.output, reviewStatus: "safety_blocked" },
        errors: ["whole_statement_fee_intelligence_privacy_safety_blocked"],
      },
      sourcePacket,
    }).runtimeFeeClassificationReview.status).toBe("safety_blocked");
    expect(admitWholeStatementFeeIntelligence({
      analysis,
      validation: { ...validation, ok: false, errors: ["synthetic_whole_statement_rejection"] },
      sourcePacket,
    }).runtimeFeeClassificationReview.status).toBe("rejected");
  });

  it("preserves the existing Package 5B attempt identity when adding successful 5C reuse", () => {
    const analysis = materialAnalysis({ anomalyReviewSatisfied: true });
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const wholePacket = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview(validWholeStatementReview(wholePacket), analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const wholeSnapshot = wholeStatementSnapshot(validation.output);
    const wholeHarnessInput = {
      capability: "whole_statement_fee_intelligence_review" as const,
      status: "completed" as const,
      output: validation.output,
      executionRef: `ai_exec_${"0".repeat(32)}`,
      independentReviewRefs: [],
    };
    const baseCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: [wholeHarnessInput],
    });
    const baseAudit = buildCanonicalAiAdmissionAudit({
      capabilities: baseCapabilities.capabilities,
      attempts: [wholeSnapshot],
    });
    const beforeWholeAttempt = structuredClone(baseAudit.attempts.find((attempt) =>
      attempt.capability === "whole_statement_fee_intelligence_review"
    )!);
    const feeReuse = successfulReuse(analysis, validation.output);
    const feeCapability = deterministicReuseFeeClassificationCapabilityInput({
      analysis,
      review: feeReuse.review,
      packetRef: feeReuse.packetRef,
    });
    const finalCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: [wholeHarnessInput, feeCapability.harnessInput],
    });
    const extendedAudit = extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt({
      audit: baseAudit,
      capabilities: finalCapabilities.capabilities,
      attempt: feeCapability.snapshot,
    });

    expect(extendedAudit).not.toBeNull();
    expect(validateCanonicalAiAdmissionAudit(extendedAudit)).toEqual([]);
    const afterWholeAttempts = extendedAudit!.attempts.filter((attempt) => attempt.capability === "whole_statement_fee_intelligence_review");
    expect(afterWholeAttempts).toHaveLength(1);
    expect(afterWholeAttempts[0]).toEqual(beforeWholeAttempt);
    expect(afterWholeAttempts[0]!.executionRef).toBe(beforeWholeAttempt.executionRef);
    expect(afterWholeAttempts[0]!.id).toBe(beforeWholeAttempt.id);
    expect(afterWholeAttempts[0]!.attemptOrdinal).toBe(beforeWholeAttempt.attemptOrdinal);
    expect(afterWholeAttempts[0]!.executionState).toBe(beforeWholeAttempt.executionState);
    expect(afterWholeAttempts[0]!.admissionState).toBe(beforeWholeAttempt.admissionState);
    expect(afterWholeAttempts[0]!.finalCanonicalStatus).toBe(beforeWholeAttempt.finalCanonicalStatus);
    expect(afterWholeAttempts[0]!.reasonCodes).toEqual(beforeWholeAttempt.reasonCodes);
    expect(afterWholeAttempts[0]!.safeCounts).toEqual(beforeWholeAttempt.safeCounts);
    expect(afterWholeAttempts[0]!.references).toEqual(beforeWholeAttempt.references);
    expect(stageStates(afterWholeAttempts[0]!)).toEqual(stageStates(beforeWholeAttempt));
    expect(afterWholeAttempts[0]!.reasonCodes).not.toContain("unsafe_execution_reference_replaced");
    expect(afterWholeAttempts[0]!.rawPromptPersisted).toBe(false);
    expect(afterWholeAttempts[0]!.rawResponsePersisted).toBe(false);
    expect(afterWholeAttempts[0]!.rawStatementTextPersisted).toBe(false);
    expect(afterWholeAttempts[0]!.providerDetailsPersisted).toBe(false);
    const feeAttempt = extendedAudit!.attempts.find((attempt) => attempt.capability === "fee_classification_review")!;
    expect(feeAttempt).toMatchObject({
      executionState: "not_started",
      executionRef: null,
      admissionState: "diagnostic_only",
      finalCanonicalStatus: "completed_diagnostic",
    });
    expect(feeAttempt.references.packetRefs).toEqual([feeReuse.packetRef]);
  });

  it("does not let an untrusted cloned audit preserve Package 5B execution identity", () => {
    const analysis = materialAnalysis();
    const output = wholeStatementOutput(analysis);
    const wholeSnapshot = wholeStatementSnapshot(output);
    const baseCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: [{
        capability: "whole_statement_fee_intelligence_review",
        status: "completed",
        output,
        executionRef: `ai_exec_${"0".repeat(32)}`,
        independentReviewRefs: [],
      }],
    });
    const baseAudit = buildCanonicalAiAdmissionAudit({ capabilities: baseCapabilities.capabilities, attempts: [wholeSnapshot] });
    const feeReuse = successfulReuse(analysis, output);
    const feeCapability = deterministicReuseFeeClassificationCapabilityInput({
      analysis,
      review: feeReuse.review,
      packetRef: feeReuse.packetRef,
    });

    expect(extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt({
      audit: structuredClone(baseAudit),
      capabilities: baseCapabilities.capabilities,
      attempt: feeCapability.snapshot,
    })).toBeNull();
  });

  it("does not let an in-place mutated trusted audit preserve Package 5B execution identity", () => {
    const analysis = materialAnalysis();
    const output = wholeStatementOutput(analysis);
    const wholeSnapshot = wholeStatementSnapshot(output);
    const wholeHarnessInput = {
      capability: "whole_statement_fee_intelligence_review" as const,
      status: "completed" as const,
      output,
      executionRef: `ai_exec_${"0".repeat(32)}`,
      independentReviewRefs: [],
    };
    const feeReuse = successfulReuse(analysis, output);
    const feeCapability = deterministicReuseFeeClassificationCapabilityInput({
      analysis,
      review: feeReuse.review,
      packetRef: feeReuse.packetRef,
    });
    const finalCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: [wholeHarnessInput, feeCapability.harnessInput],
    });
    const baseAudit = buildCanonicalAiAdmissionAudit({
      capabilities: finalCapabilities.capabilities,
      attempts: [wholeSnapshot],
    });
    const wholeAttempt = baseAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review")!;
    wholeAttempt.executionRef = `ai_exec_${"f".repeat(32)}`;

    expect(validateCanonicalAiAdmissionAudit(baseAudit)).toEqual([]);
    expect(extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt({
      audit: baseAudit,
      capabilities: finalCapabilities.capabilities,
      attempt: feeCapability.snapshot,
    })).toBeNull();
  });

  it("keeps an already-valid Package 5B admission intact when 5C Package 5A composition fails", async () => {
    const modulePath = "../../src/canonical/aiAdmissionDiagnostics.js";
    vi.resetModules();
    vi.doMock(modulePath, async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../src/canonical/aiAdmissionDiagnostics.js")>();
      return {
        ...actual,
        extendTrustedCanonicalAiAdmissionAuditWithDeterministicFeeClassificationAttempt: () => null,
      };
    });
    try {
      const { admitWholeStatementFeeIntelligence: mockedAdmitWholeStatementFeeIntelligence } = await import(
        "../../src/canonical/wholeStatementFeeIntelligenceAdmission.js"
      );
      const analysis = materialAnalysis();
      const before = financialProjection(analysis);
      const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
      const wholePacket = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
      const validation = validateWholeStatementFeeIntelligenceReview(
        validWholeStatementReview(wholePacket),
        analysis,
        { approvedExternalSourceRefs: [] },
        sourcePacket,
      );
      const result = mockedAdmitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket });
      const wholeCapability = result.analysis.aiCapabilities.capabilities.find((capability) =>
        capability.capability === "whole_statement_fee_intelligence_review"
      )!;
      const feeCapability = result.analysis.aiCapabilities.capabilities.find((capability) => capability.capability === "fee_classification_review");
      const wholeAttempt = result.aiAdmissionAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review")!;
      const feeAttempt = result.aiAdmissionAudit.attempts.find((attempt) => attempt.capability === "fee_classification_review")!;

      expect(result.admission.admissionDisposition).toBe("admitted");
      expect(result.admission.wholeStatementOutput).toEqual(validation.output);
      expect(result.admission.acceptedClaimSupportRefs).toEqual([]);
      expect(result.admission.rejectedClaimSupportRefs).toEqual([]);
      expect(result.admission.researchAttemptRefs).toEqual([]);
      expect(result.admission.executionStatus).toBe("completed");
      expect(result.admission.executionRef).toBe(wholeAttempt.executionRef);
      expect(wholeCapability.status).toBe("completed");
      expect(wholeCapability.output).toEqual(validation.output);
      expect(result.runtimeFeeClassificationReview).toMatchObject({ status: "rejected", suggestions: [] });
      expect(result.runtimeFeeClassificationReusePacketRef).toBeNull();
      expect(feeCapability?.status).not.toBe("completed_diagnostic");
      expect(feeAttempt.finalCanonicalStatus).not.toBe("completed_diagnostic");
      expect(financialProjection(result.analysis)).toEqual(before);
    } finally {
      vi.doUnmock(modulePath);
      vi.resetModules();
    }
  });

  it("derives stable packet refs from admitted Package 5B semantic content", () => {
    const analysis = materialAnalysis();
    const output = wholeStatementOutput(analysis);
    const same = structuredClone(output);
    const changed = structuredClone(output);
    changed.rowInterpretations[0] = { ...changed.rowInterpretations[0]!, proposedCategory: "administrative_fee" };

    expect(packetRefForAdmittedWholeStatementOutput(output)).toMatch(/^packet_[a-f0-9]{32}$/);
    expect(packetRefForAdmittedWholeStatementOutput(output)).toBe(packetRefForAdmittedWholeStatementOutput(same));
    expect(packetRefForAdmittedWholeStatementOutput(output)).not.toBe(packetRefForAdmittedWholeStatementOutput(changed));
  });
});

function successfulReuse(analysis: CanonicalStatementAnalysis, output: CanonicalAiWholeStatementFeeIntelligenceOutput) {
  return deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement({
    analysis,
    source: { executionStatus: "completed", admissionDisposition: "admitted", wholeStatementOutput: output },
  });
}

function dispositionByRow(review: ReturnType<typeof successfulReuse>["review"]): Record<string, string> {
  return Object.fromEntries(review.suggestions.map((suggestion) => [suggestion.feeRowRef, suggestion.disposition]));
}

function wholeStatementSnapshot(output: CanonicalAiWholeStatementFeeIntelligenceOutput) {
  const feeRowRefs = output.coverageProof.expectedFeeRowRefs;
  const evidenceRefs = output.evidenceRefs;
  return {
    capability: "whole_statement_fee_intelligence_review" as const,
    attempted: true,
    normalizedStatus: "completed" as const,
    safeCounts: {
      expectedFeeRowCount: feeRowRefs.length,
      reviewedFeeRowCount: output.coverageProof.reviewedFeeRowRefs.length,
      acceptedRecordCount: output.acceptanceRecords.filter((record) => ["accepted", "accepted_with_conditions"].includes(record.status)).length,
      needsVerificationCount: output.acceptanceRecords.filter((record) => record.status === "needs_verification").length,
      humanReviewCount: output.acceptanceRecords.filter((record) => record.status === "human_review").length,
      rejectedRecordCount: output.acceptanceRecords.filter((record) => record.status === "rejected").length,
    },
    executionRef: null,
    reasonCodes: ["whole_statement_fee_intelligence_completed"] as const,
    diagnosticSignals: passedDiagnosticSignals([
      "response_parse",
      "schema_validation",
      "evidence_citation",
      "linkage",
      "deterministic_reconciliation",
      "privacy_safety",
    ]),
    diagnosticReferences: { feeRowRefs, evidenceRefs, questionRefs: [], candidateRefs: [] },
    trustedDiagnosticReferenceSets: createValidatedDiagnosticReferenceSets({ feeRowRefs, evidenceRefs, questionRefs: [], candidateRefs: [] }),
  };
}

function stageStates(attempt: {
  responseParseState: string;
  schemaValidationState: string;
  evidenceCitationState: string;
  sourceQualityState: string;
  linkageState: string;
  deterministicReconciliationState: string;
  privacySafetyState: string;
}) {
  return {
    responseParseState: attempt.responseParseState,
    schemaValidationState: attempt.schemaValidationState,
    evidenceCitationState: attempt.evidenceCitationState,
    sourceQualityState: attempt.sourceQualityState,
    linkageState: attempt.linkageState,
    deterministicReconciliationState: attempt.deterministicReconciliationState,
    privacySafetyState: attempt.privacySafetyState,
  };
}

function wholeStatementOutput(
  analysis: CanonicalStatementAnalysis,
  overrides: Record<string, Partial<CanonicalWholeStatementFeeIntelligenceRowInterpretation>> = {},
): CanonicalAiWholeStatementFeeIntelligenceOutput {
  const packet = buildWholeStatementFeeIntelligencePacket(analysis);
  const validation = validateWholeStatementFeeIntelligenceReview(validWholeStatementReview(packet, overrides), analysis);
  expect(validation.errors).toEqual([]);
  expect(validation.ok).toBe(true);
  return validation.output;
}

function validWholeStatementReview(
  packet: ReturnType<typeof buildWholeStatementFeeIntelligencePacket>,
  overrides: Record<string, Partial<CanonicalWholeStatementFeeIntelligenceRowInterpretation>> = {},
) {
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: "completed",
    evidenceRefs: [...new Set(packet.admittedFeeRows.flatMap((row) => row.evidenceRefs))],
    factRefs: [],
    limitationCodes: [],
    rowInterpretations: packet.admittedFeeRows.map((row) => ({
      feeRowRef: row.feeRowRef,
      proposedCategory: "processor_markup",
      likelyEconomicOwner: "processor",
      likelyContractualController: "merchant_contract",
      proposedActionabilityCeiling: "not_actionable",
      confidence: "high",
      conciseRationale: "Statement row context supports this interpretation.",
      evidenceProvenance: "statement_evidence",
      evidenceRefs: row.evidenceRefs,
      externalSourceRef: null,
      externalClaimSupportRef: null,
      conflicts: [],
      missingEvidence: [],
      recommendedDisposition: "supported",
      authoritative: false,
      ...(overrides[row.feeRowRef] ?? {}),
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

const FEE_ROW_A = `feerow_${"a".repeat(24)}`;
const FEE_ROW_B = `feerow_${"b".repeat(24)}`;
const EVIDENCE_A = `ev_${"a".repeat(20)}`;
const EVIDENCE_B = `ev_${"b".repeat(20)}`;
const CANDIDATE_A = `candidate_${"a".repeat(16)}`;
const CANDIDATE_B = `candidate_${"b".repeat(16)}`;

function materialAnalysis(options: { anomalyReviewSatisfied?: boolean } = {}): CanonicalStatementAnalysis {
  const analysis = noMaterialAnalysis();
  const feeOne = feeRow(FEE_ROW_A, EVIDENCE_A, "src_fee_a", 1000);
  const feeTwo = feeRow(FEE_ROW_B, EVIDENCE_B, "src_fee_b", 2000);
  const material = {
    ...analysis,
    evidence: [...analysis.evidence, evidenceRecord(EVIDENCE_A), evidenceRecord(EVIDENCE_B)],
    feeLedger: {
      policyVersion: "canonical_fee_ledger_v1",
      status: "partial",
      sourceOccurrences: [
        { id: "src_fee_a", evidenceRef: EVIDENCE_A, documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l1", rowIndex: 1, normalizedSourceText: null },
        { id: "src_fee_b", evidenceRef: EVIDENCE_B, documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l2", rowIndex: 2, normalizedSourceText: null },
      ],
      parserInterpretations: [],
      rows: [feeOne, feeTwo],
      uniqueChargeTotal: money(3000),
      controls: [],
      limitations: ["Synthetic unresolved fixture."],
    },
    feeOwnershipActionability: {
      policyVersion: "fee_ownership_actionability_v1",
      taxonomyVersion: "fee_taxonomy_v1",
      ruleRegistryVersion: "fee_ownership_rules_v1",
      aiSuggestionPolicyVersion: "fee_ai_suggestion_policy_v1",
      humanOverridePolicyVersion: "fee_human_override_policy_v1",
      status: "partial",
      rowClassifications: [classification(feeOne.id, CANDIDATE_A, EVIDENCE_A), classification(feeTwo.id, CANDIDATE_B, EVIDENCE_B)],
      spreadAssertions: [],
      aiSuggestions: [],
      humanOverrides: [],
      limitations: ["Synthetic unresolved fixture."],
    },
  };
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: material.identity,
    financialFacts: material.financialFacts,
    feeLedger: material.feeLedger,
    feeOwnershipActionability: material.feeOwnershipActionability,
    opportunityEngine: material.opportunityEngine,
    evidence: material.evidence,
    harnessInputs: options.anomalyReviewSatisfied
      ? [{
          capability: "full_statement_anomaly_review",
          status: "completed",
          output: fullAnomalyOutput(material),
          executionRef: null,
          independentReviewRefs: [],
        }]
      : [],
  });
  return {
    ...material,
    aiCapabilities,
    customerState: buildCanonicalCustomerState({ ...material, aiCapabilities }),
  };
}

function fullAnomalyOutput(analysis: Pick<CanonicalStatementAnalysis, "evidence">) {
  const evidenceRef = analysis.evidence[0]?.id ?? EVIDENCE_A;
  return {
    type: "full_statement_anomaly_review" as const,
    authoritative: false as const,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    observations: [{
      id: "obs_package_5c2b_fixture",
      severity: "info" as const,
      summary: "Synthetic core metrics were reviewed.",
      affectedFactRefs: ["financialFacts.processedSales"],
      evidenceRefs: [evidenceRef],
      authoritative: false as const,
    }],
  };
}

function noMaterialAnalysis(): CanonicalStatementAnalysis {
  return buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
    businessType: "restaurant_food_beverage",
    sourceFileName: null,
  });
}

function classification(feeRowId: string, candidateId: string, evidenceRef: string): CanonicalFeeClassificationResolution {
  return {
    feeRowId,
    selected: {
      candidateId,
      category: "unknown_needs_review",
      ownership: { collector: "unknown", economicBeneficiary: "unknown", contractualController: "unknown" },
      actionabilityCeiling: "unknown",
      documentationRequirement: "blocking",
      confidence: "low",
      selectionReason: "Synthetic unresolved classification.",
      rejectedCandidateIds: [],
    },
    candidates: [
      {
        id: candidateId,
        feeRowId,
        category: "unknown_needs_review",
        ownership: { collector: "unknown", economicBeneficiary: "unknown", contractualController: "unknown" },
        actionabilityCeiling: "unknown",
        documentationRequirement: "blocking",
        confidence: "low",
        sourceType: "safe_default",
        ruleId: "synthetic_unknown",
        ruleVersion: "1.0.0",
        ruleProvenance: "Synthetic test fixture.",
        evidenceRefs: [evidenceRef],
        reference: null,
        authoritative: false,
        reason: "Synthetic unresolved classification.",
        permissionConsequences: [],
        limitations: [],
      },
    ],
    conflictStatus: "unresolved",
    conflictReason: "Synthetic unresolved classification.",
  };
}

function feeRow(id: string, evidenceRef: string, sourceOccurrenceId: string, amountMinor: number): CanonicalFeeRow {
  return {
    id,
    role: "unknown_unresolved",
    sourceOccurrenceIds: [sourceOccurrenceId],
    parserInterpretationIds: [],
    selectedLabel: "Opaque synthetic fee",
    selectedAmount: money(amountMinor),
    signedAmount: money(-amountMinor),
    contributesToUniqueTotal: true,
    contributionDecision: {
      contributes: true,
      reasonCode: "individual_charge_included",
      controlRefs: [],
      evidenceRefs: [evidenceRef],
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
}

function evidenceRecord(id: string) {
  return {
    id,
    documentId: "doc_synthetic",
    pageNumber: 1,
    section: "fees",
    lineId: id,
    rowIndex: id === EVIDENCE_A ? 1 : 2,
    extractedText: null,
    normalizedText: null,
    sourceRole: "fee_row" as const,
    confidence: "medium" as const,
    extractionObservations: [],
    parserInterpretations: [],
    customerSafe: { excerpt: null, redactionApplied: true },
  };
}

function money(amountMinor: number): MoneyAmount {
  return { amountMinor, currency: "USD" };
}

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: Synthetic",
    "Processor: Fiserv",
    "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00",
    "Fees Charged | -$30.00",
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 0.99, warnings: [], pageCount: 1 },
  };
}

function financialProjection(analysis: CanonicalStatementAnalysis) {
  return structuredClone({
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
  });
}
