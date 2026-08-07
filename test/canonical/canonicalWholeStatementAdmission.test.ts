import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildFeeKnowledgeSourcePacket } from "../../src/canonical/feeKnowledgeRegistry.js";
import { admitWholeStatementFeeIntelligence, validateResearchLinkage } from "../../src/canonical/wholeStatementFeeIntelligenceAdmission.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReview,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import { validateCanonicalAiAdmissionAudit } from "../../src/canonical/aiAdmissionDiagnostics.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical whole-statement admission", () => {
  it("admits a validated statement-grounded review without changing Packages B-E", () => {
    const analysis = syntheticAnalysis();
    const before = financialProjection(analysis);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview(validReview(packet), analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const result = admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket });
    const capability = result.analysis.aiCapabilities.capabilities.find((item) => item.capability === "whole_statement_fee_intelligence_review")!;

    expect(result.admission).toMatchObject({ admissionDisposition: "admitted", groundingStatus: "grounded", authoritative: false, financialMutationAllowed: false });
    expect(result.admission.executionRef).toMatch(/^ai_exec_[a-f0-9]{32}$/);
    expect(capability).toMatchObject({ status: "completed", groundingStatus: "grounded", executionRef: result.admission.executionRef });
    expect(financialProjection(result.analysis)).toEqual(before);
    expect(validateCanonicalAiAdmissionAudit(result.aiAdmissionAudit)).toEqual([]);
  });

  it("fails closed on unsafe review output and retains only a fresh internal execution reference", () => {
    const analysis = syntheticAnalysis();
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview({ ...validReview(packet), rawPrompt: "unsafe private payload" }, analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const result = admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket });

    expect(result.admission.admissionDisposition).toBe("safety_blocked");
    expect(result.admission.wholeStatementOutput).toBeNull();
    expect(result.admission.executionRef).toMatch(/^ai_exec_[a-f0-9]{32}$/);
    expect(JSON.stringify(result)).not.toContain("unsafe private payload");
  });

  it("rejects incomplete or foreign research linkage without mutating the input", () => {
    const analysis = syntheticAnalysis();
    const before = structuredClone(analysis);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    sourcePacket.researchAttempts.push({
      type: "fee_knowledge_research_attempt",
      policyVersion: "fee_knowledge_research_policy_v1",
      attemptId: "research_deadbeefdeadbeef",
      questionRef: `question_${"d".repeat(64)}`,
      feeRowRef: "feerow_deadbeefdeadbeefdeadbeef",
      sanitizedQuestionCategory: "classification",
      triggerReason: "material_unfamiliar_label",
      status: "timed_out",
      resultCount: 1,
      candidateIds: ["candidate_foreignforeign1"],
      reasonCodes: ["fee_knowledge_research_timed_out"],
      providerDetailsStripped: true,
    });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview(validReview(packet), analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const result = admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket, executionStatus: "timed_out" });

    expect(validateResearchLinkage(sourcePacket)).toContain("whole_statement_research_candidate_parentage_invalid");
    expect(result.admission).toMatchObject({ admissionDisposition: "rejected", groundingStatus: "incomplete", executionStatus: "timed_out" });
    expect(result.admission.wholeStatementOutput).toBeNull();
    expect(analysis).toEqual(before);
  });

  it("derives safety directly from a safety-blocked research graph", () => {
    const analysis = syntheticAnalysis();
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const feeRowRef = `feerow_${"a".repeat(24)}`;
    sourcePacket.researchAttempts.push({
      type: "fee_knowledge_research_attempt",
      policyVersion: "fee_knowledge_research_policy_v1",
      attemptId: "research_aaaaaaaaaaaaaaaa",
      questionRef: `question_${"a".repeat(64)}`,
      feeRowRef,
      sanitizedQuestionCategory: "classification",
      triggerReason: "material_unfamiliar_label",
      status: "safety_blocked",
      resultCount: 0,
      candidateIds: [],
      reasonCodes: ["fee_knowledge_research_safety_blocked"],
      providerDetailsStripped: true,
    });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const validation = validateWholeStatementFeeIntelligenceReview(validReview(packet), analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    expect(validation.ok).toBe(true);

    const result = admitWholeStatementFeeIntelligence({ analysis, validation, sourcePacket });
    const diagnostic = result.aiAdmissionAudit.attempts.find((attempt) => attempt.capability === "whole_statement_fee_intelligence_review")!;

    expect(result.admission).toMatchObject({ admissionDisposition: "safety_blocked", groundingStatus: "incomplete", wholeStatementOutput: null });
    expect(result.analysis.aiCapabilities.capabilities.find((item) => item.capability === "whole_statement_fee_intelligence_review")?.status)
      .not.toBe("completed");
    expect(diagnostic).toMatchObject({ finalCanonicalStatus: "safety_blocked", privacySafetyState: "failed" });
    expect(result.admission.reasonCodes).toContain("whole_statement_admission_safety_blocked");
  });

});

function validReview(packet: ReturnType<typeof buildWholeStatementFeeIntelligencePacket>) {
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
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function syntheticAnalysis(): CanonicalStatementAnalysis {
  return buildCanonicalStatementFactsFromParsedDocument(syntheticDocument(), {
    businessType: "restaurant_food_beverage",
    sourceAnalysisId: "package_5b_synthetic",
    sourceFileName: null,
  });
}

function syntheticDocument(): ParsedDocument {
  const lines = [
    "SYNTHETIC STATEMENT",
    "Processor: Fiserv",
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
