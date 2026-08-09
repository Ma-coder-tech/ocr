import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildFeeKnowledgeSourcePacket } from "../../src/canonical/feeKnowledgeRegistry.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReviewForPacket,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import {
  buildWholeStatementFeeIntelligenceWorkPlan,
  mergeWholeStatementFeeIntelligenceWorkUnitResults,
  wholeStatementFeeIntelligenceWorkUnitResultFromValidation,
  type WholeStatementFeeIntelligenceWorkUnitResult,
} from "../../src/canonical/wholeStatementFeeIntelligenceWorkPlan.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdfBytes, type ParsedDocument } from "../../src/parser.js";
import { calculateWorstCaseCostUsd } from "../../src/evaluationIntegrity/providerAccounting.js";
import { verifyEvaluationRunIntegrityArtifactV2 } from "../../src/evaluationIntegrity/index.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";

const LIVE_ARTIFACT_PATH = "/private/tmp/ratereveal-five-statement-live-final-20260808T220413Z/evaluation-run-integrity-artifact.json";
const LIVE_ARTIFACT_SHA256 = "c3e286e20f3d2a8235d6d721873f2f0be8703288ac224b1002674db152ce494a";
const REAL_134_ROW_STATEMENT_PATH = "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf";

describe("whole-statement fee intelligence work plan", () => {
  it("uses the exact latest five-statement live artifact row counts as offline sizing fixtures", async () => {
    const artifact = await latestLiveArtifact();
    const rowCounts = artifact.canonicalAdmissionResults
      .map((result: any) => result.canonicalReferenceProof.canonicalFeeRowRefs.length)
      .sort((left: number, right: number) => left - right);

    expect(rowCounts).toEqual([28, 50, 51, 105, 134]);
    expect(artifact.providerCallOutcomes.filter((outcome: any) => outcome.stage === "whole_statement_ai_review").map((outcome: any) => outcome.status).sort())
      .toEqual(["failure", "failure", "failure", "failure", "success"]);
  });

  it("projects the exact latest five-statement live artifact with separated deterministic and intelligence semantics", async () => {
    const artifact = await latestLiveArtifact();

    expect(verifyEvaluationRunIntegrityArtifactV2(artifact)).toBe(true);
    expect(artifact.canonicalAdmissionResults).toHaveLength(5);
    expect(artifact.packageFinancialInvariance).toHaveLength(5);
    expect(artifact.packageFinancialInvariance.every((entry: any) =>
      entry.result.invariant === true
      && entry.result.packages.map((pkg: any) => pkg.beforeHash === pkg.afterHash).every(Boolean)
    )).toBe(true);

    const rowCounts = artifact.canonicalAdmissionResults
      .map((result: any) => result.canonicalReferenceProof.canonicalFeeRowRefs.length)
      .sort((left: number, right: number) => left - right);
    expect(rowCounts).toEqual([28, 50, 51, 105, 134]);

    for (const result of artifact.canonicalAdmissionResults) {
      expect(result.canonicalReferenceProof.canonicalFeeRowRefs.length).toBeGreaterThan(0);
      expect(result.researchEvidence.attempts.filter((attempt: any) => attempt.status === "completed")).toHaveLength(2);
      expect(result.researchEvidence.candidates).toHaveLength(5);
      expect(result.researchEvidence.candidates.every((candidate: any) =>
        candidate.retrievalStatus === "failed"
        && candidate.semanticVerificationStatus === "not_started"
        && candidate.verificationStatus === "rejected"
      )).toBe(true);
      expect(result.researchEvidence.candidates.flatMap((candidate: any) => candidate.reasonCodes).sort()).toContain("fee_knowledge_retrieval_fetch_failed");
      expect(result.researchEvidence.candidates.flatMap((candidate: any) => candidate.reasonCodes).sort()).toContain("fee_knowledge_semantic_support_not_run");
      expect(result.researchEvidence.claimSupports).toEqual([]);
      expect(result.admissionDisposition).toBe("rejected");
      expect(result.packageF).toBeNull();
    }

    const wholeStatementOutcomes = artifact.providerCallOutcomes.filter((outcome: any) => outcome.stage === "whole_statement_ai_review");
    expect(wholeStatementOutcomes.map((outcome: any) => outcome.status).sort()).toEqual(["failure", "failure", "failure", "failure", "success"]);
    const succeeded = wholeStatementOutcomes.find((outcome: any) => outcome.status === "success");
    expect(succeeded?.sourceDocumentId).toBe("doc_fiserv_paysafe_febr_2024_pdf");
    expect(artifact.providerCallOutcomes.filter((outcome: any) => outcome.stage === "web_search_discovery" && outcome.status === "success")).toHaveLength(10);
    expect(artifact.providerCallOutcomes.filter((outcome: any) => outcome.stage === "document_retrieval")).toHaveLength(25);
    expect(artifact.providerCallOutcomes.filter((outcome: any) => outcome.stage === "semantic_verification")).toHaveLength(25);
  });

  it("plans bounded comprehensive work units for the real five-statement shapes", async () => {
    const artifact = await latestLiveArtifact();
    const rowCounts = artifact.canonicalAdmissionResults
      .map((result: any) => result.canonicalReferenceProof.canonicalFeeRowRefs.length)
      .sort((left: number, right: number) => left - right);

    const projections = rowCounts.map((rowCount) => {
      const analysis = expandedAnalysis(rowCount);
      const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
      const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
      const plan = buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive", limits: { maxRowsPerUnit: 18 } });
      return {
        rowCount,
        plannedWorkUnits: plan.units.length,
        selectedWorkUnits: plan.units.filter((unit) => unit.status === "selected").length,
        selectedRows: plan.selectedFeeRowRefs.length,
        largestUnitRows: Math.max(...plan.units.map((unit) => unit.expectedFeeRowRefs.length)),
      };
    });

    expect(projections).toEqual([
      { rowCount: 28, plannedWorkUnits: 2, selectedWorkUnits: 2, selectedRows: 28, largestUnitRows: 18 },
      { rowCount: 50, plannedWorkUnits: 3, selectedWorkUnits: 3, selectedRows: 50, largestUnitRows: 18 },
      { rowCount: 51, plannedWorkUnits: 3, selectedWorkUnits: 3, selectedRows: 51, largestUnitRows: 18 },
      { rowCount: 105, plannedWorkUnits: 6, selectedWorkUnits: 6, selectedRows: 105, largestUnitRows: 18 },
      { rowCount: 134, plannedWorkUnits: 8, selectedWorkUnits: 8, selectedRows: 134, largestUnitRows: 18 },
    ]);
  });

  it("merges a complete 134-row review without one oversized provider response and preserves Packages B-E", () => {
    const analysis = expandedAnalysis(134);
    const before = packagesBE(analysis);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive", limits: { maxRowsPerUnit: 18 } });
    const results = completedResults(plan, analysis);
    const merged = mergeWholeStatementFeeIntelligenceWorkUnitResults({
      analysis,
      registry: { approvedExternalSourceRefs: [] },
      sourcePacket,
      fullPacket: packet,
      plan,
      results,
    });

    expect(plan.units).toHaveLength(8);
    expect(plan.units.every((unit) => unit.expectedFeeRowRefs.length <= 18)).toBe(true);
    expect(merged.validation.ok).toBe(true);
    expect(merged.output.reviewStatus).toBe("completed");
    expect(merged.output.coverageProof.reviewedFeeRowRefs).toHaveLength(134);
    expect(packagesBE(analysis)).toEqual(before);
  });

  it("isolates a failed 134-row work unit as partial intelligence without fabricating missing rows", () => {
    const analysis = expandedAnalysis(134);
    const before = packagesBE(analysis);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive", limits: { maxRowsPerUnit: 18 } });
    const results = completedResults(plan, analysis);
    const failedUnit = plan.units[3]!;
    const failed: WholeStatementFeeIntelligenceWorkUnitResult = {
      workUnitRef: failedUnit.workUnitRef,
      status: "failed",
      outcomeClass: "provider_transport_failed",
      validation: null,
      requestId: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      durationMs: 42,
      billingDisposition: "unknown",
      reasonCodes: ["provider_network_failed"],
    };
    const merged = mergeWholeStatementFeeIntelligenceWorkUnitResults({
      analysis,
      registry: { approvedExternalSourceRefs: [] },
      sourcePacket,
      fullPacket: packet,
      plan,
      results: results.map((result) => result.workUnitRef === failedUnit.workUnitRef ? failed : result),
    });

    expect(merged.validation.ok).toBe(true);
    expect(merged.output.reviewStatus).toBe("partial");
    expect(merged.completedWorkUnitCount).toBe(7);
    expect(merged.unavailableWorkUnitCount).toBe(1);
    expect(merged.output.coverageProof.reviewedFeeRowRefs).toHaveLength(116);
    expect(merged.output.coverageProof.missingFeeRowRefs).toEqual(failedUnit.expectedFeeRowRefs);
    expect(merged.output.rowInterpretations.map((row) => row.feeRowRef).some((ref) => failedUnit.expectedFeeRowRefs.includes(ref))).toBe(false);
    expect(packagesBE(analysis)).toEqual(before);
  });

  it("reports budget-unselected work as not selected rather than failed", () => {
    const analysis = expandedAnalysis(134);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({
      packet,
      mode: "comprehensive",
      limits: { maxRowsPerUnit: 18, maxAggregateOutputTokens: 4_500 },
    });

    expect(plan.units.some((unit) => unit.status === "not_selected_budget")).toBe(true);
    expect(plan.units.filter((unit) => unit.status === "not_selected_budget").flatMap((unit) => unit.selectionReasonCodes))
      .toContain("whole_statement_fee_intelligence_work_unit_not_selected_budget");
    expect(plan.units.some((unit) => unit.status === "failed")).toBe(false);
  });

  it("calculates the real 134-row comprehensive live canary budget from first-class work-unit reservations", async () => {
    const bytes = await readFile(REAL_134_ROW_STATEMENT_PATH);
    const document = await parsePdfBytes(bytes);
    const summary = analyzeStatementDocument(document, "restaurant_food_beverage");
    const analysis = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "real_134_row_package_5b_canary",
      legacySummary: summary,
    }).analysis;
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive", limits: { maxRowsPerUnit: 18 } });
    const pricing = {
      uncachedInputUsdPerMillionTokens: 0.75,
      cachedInputUsdPerMillionTokens: 0.075,
      outputUsdPerMillionTokens: 4.5,
      toolUseUsd: 0,
    };
    const workUnits = plan.units.map((unit) => ({
      ordinal: unit.ordinal,
      rowCount: unit.expectedFeeRowRefs.length,
      maximumInputTokens: unit.estimatedInputBytes,
      maximumOutputTokens: 5_000,
      maximumToolUses: 0,
      worstCaseCostUsd: calculateWorstCaseCostUsd({
        maximumInputTokens: unit.estimatedInputBytes,
        maximumOutputTokens: 5_000,
        maximumToolUses: 0,
        pricing,
      }),
    }));
    const worstCaseTotalUsd = Number(workUnits.reduce((sum, unit) => sum + unit.worstCaseCostUsd, 0).toFixed(9));

    expect(analysis.feeLedger.rows).toHaveLength(134);
    expect(workUnits.map((unit) => unit.rowCount)).toEqual([18, 18, 18, 18, 18, 18, 18, 8]);
    expect(workUnits.map((unit) => unit.worstCaseCostUsd)).toEqual([
      0.0414165,
      0.04166475,
      0.041382,
      0.0413865,
      0.041649,
      0.0414195,
      0.041373,
      0.031461,
    ]);
    expect(worstCaseTotalUsd).toBe(0.32175225);
    expect(worstCaseTotalUsd).toBeLessThan(2);
  }, 30_000);
});

async function latestLiveArtifact(): Promise<any> {
  const bytes = await readFile(LIVE_ARTIFACT_PATH);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(LIVE_ARTIFACT_SHA256);
  return JSON.parse(bytes.toString("utf8"));
}

function completedResults(
  plan: ReturnType<typeof buildWholeStatementFeeIntelligenceWorkPlan>,
  analysis: CanonicalStatementAnalysis,
): WholeStatementFeeIntelligenceWorkUnitResult[] {
  return plan.units.map((unit) => {
    const validation = validateWholeStatementFeeIntelligenceReviewForPacket(
      validReview(unit.packet),
      unit.packet,
      analysis,
      { approvedExternalSourceRefs: [] },
      unit.packet.sourceProvenancePacket,
    );
    expect(validation.ok).toBe(true);
    return wholeStatementFeeIntelligenceWorkUnitResultFromValidation({
      unit,
      validation,
      requestId: `resp_unit_${unit.ordinal}`,
      inputTokens: unit.estimatedInputBytes,
      cachedInputTokens: 0,
      outputTokens: unit.estimatedOutputTokens,
      durationMs: unit.ordinal,
      billingDisposition: "observed",
    });
  });
}

function validReview(packet: CanonicalWholeStatementFeeIntelligencePacket) {
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

function expandedAnalysis(rowCount: number): CanonicalStatementAnalysis {
  const base = buildCanonicalStatementFactsFromParsedDocument(syntheticDocument(), {
    businessType: "restaurant_food_beverage",
    sourceAnalysisId: `package_5b_${rowCount}_row_synthetic`,
    sourceFileName: null,
  });
  const rowTemplate = base.feeLedger.rows[0] ?? {
    id: "feerow_template",
    role: "individual_charge",
    sourceOccurrenceIds: [],
    parserInterpretationIds: [],
    selectedLabel: "Synthetic fee row",
    selectedAmount: null,
    signedAmount: null,
    contributesToUniqueTotal: true,
    contributionDecision: {
      contributes: true,
      reasonCode: "individual_fee_charge",
      controlRefs: [],
      evidenceRefs: [],
      signedAmountBasis: "not_applicable",
      grossNetBasis: "not_applicable",
      confidence: "high",
      limitations: [],
    },
    mergeReason: null,
    mergeConfidence: "high",
    rejectedAmountCandidates: [],
    limitations: [],
  } as CanonicalStatementAnalysis["feeLedger"]["rows"][number];
  const classificationTemplate = base.feeOwnershipActionability.rowClassifications[0] ?? {
    feeRowId: "feerow_template",
    selected: {
      candidateId: "candidate_template",
      category: "processor_markup",
      ownership: {
        collector: "processor",
        economicBeneficiary: "processor",
        contractualController: "merchant_contract",
      },
      actionabilityCeiling: "not_actionable",
      documentationRequirement: "none",
      confidence: "high",
      selectionReason: "synthetic_default",
      rejectedCandidateIds: [],
    },
    candidates: [{
      id: "candidate_template",
      feeRowId: "feerow_template",
      category: "processor_markup",
      ownership: {
        collector: "processor",
        economicBeneficiary: "processor",
        contractualController: "merchant_contract",
      },
      actionabilityCeiling: "not_actionable",
      documentationRequirement: "none",
      confidence: "high",
      sourceType: "deterministic_rule",
      ruleId: "synthetic_rule",
      ruleVersion: "v1",
      ruleProvenance: "statement",
      evidenceRefs: [],
      reference: null,
      authoritative: true,
      reason: "Synthetic deterministic classification.",
      permissionConsequences: [],
      limitations: [],
    }],
    conflictStatus: "none",
    conflictReason: null,
  } as CanonicalStatementAnalysis["feeOwnershipActionability"]["rowClassifications"][number];
  base.identity.sourceDocumentRef = `source_package_5b_${rowCount}_row_synthetic`;
  base.evidence = [];
  base.feeLedger.sourceOccurrences = [];
  base.feeLedger.rows = Array.from({ length: rowCount }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    const rowId = `feerow_pkg5b_${ordinal}`;
    const evidenceRef = `evidence_pkg5b_${ordinal}`;
    const occurrenceId = `occurrence_pkg5b_${ordinal}`;
    base.evidence.push({
      id: evidenceRef,
      documentId: base.identity.sourceDocumentRef,
      pageNumber: 1,
      section: "fees",
      lineId: `line_${ordinal}`,
      rowIndex: index,
      extractedText: null,
      normalizedText: null,
      sourceRole: "fee_row",
      confidence: "high",
      extractionObservations: [],
      parserInterpretations: [],
      customerSafe: { excerpt: `Synthetic fee row ${ordinal}.`, redactionApplied: false },
    });
    base.feeLedger.sourceOccurrences.push({ id: occurrenceId, evidenceRef } as any);
    return {
      ...structuredClone(rowTemplate),
      id: rowId,
      sourceOccurrenceIds: [occurrenceId],
      parserInterpretationIds: [],
      selectedLabel: `Synthetic fee row ${ordinal}`,
      contributionDecision: {
        ...structuredClone(rowTemplate.contributionDecision),
        evidenceRefs: [evidenceRef],
      },
      limitations: index % 7 === 0 ? ["Synthetic uncertainty marker."] : [],
    };
  });
  base.feeOwnershipActionability.rowClassifications = base.feeLedger.rows.map((row, index) => ({
    ...structuredClone(classificationTemplate),
    feeRowId: row.id,
    selected: {
      ...structuredClone(classificationTemplate.selected),
      candidateId: `candidate_pkg5b_${String(index + 1).padStart(3, "0")}`,
      confidence: index % 5 === 0 ? "medium" : "high",
    },
    candidates: [{
      ...structuredClone(classificationTemplate.candidates[0]!),
      id: `candidate_pkg5b_${String(index + 1).padStart(3, "0")}`,
      feeRowId: row.id,
      evidenceRefs: row.contributionDecision.evidenceRefs,
      confidence: index % 5 === 0 ? "medium" : "high",
    }],
  }));
  return base;
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

function packagesBE(analysis: CanonicalStatementAnalysis) {
  return structuredClone({
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
  });
}
