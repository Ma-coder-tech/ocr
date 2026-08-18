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
  classifyWholeStatementFeeIntelligenceWorkUnitFailure,
  mergeWholeStatementFeeIntelligenceWorkUnitResults,
  wholeStatementFeeIntelligenceAggregateOutputCeiling,
  wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes,
  wholeStatementFeeIntelligenceWorkUnitOutputReserveTokens,
  wholeStatementFeeIntelligenceWorkUnitResultFromValidation,
  type WholeStatementFeeIntelligenceWorkUnitResult,
} from "../../src/canonical/wholeStatementFeeIntelligenceWorkPlan.js";
import { wholeStatementFeeIntelligenceProviderInputBytes } from "../../src/canonical/wholeStatementFeeIntelligenceProviderInput.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdfBytes, type ParsedDocument } from "../../src/parser.js";
import {
  OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
  calculateWorstCaseCostUsd,
} from "../../src/evaluationIntegrity/providerAccounting.js";
import {
  ONE_TIME_PAID_STAGE_ORDER,
  oneTimeLiveCostPolicyTemplate,
  oneTimeSlotExpandedCostEnvelope,
  verifyEvaluationRunIntegrityArtifactV2,
} from "../../src/evaluationIntegrity/index.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";

const LIVE_ARTIFACT_PATH = "/private/tmp/ratereveal-five-statement-live-final-20260808T220413Z/evaluation-run-integrity-artifact.json";
const LIVE_ARTIFACT_SHA256 = "c3e286e20f3d2a8235d6d721873f2f0be8703288ac224b1002674db152ce494a";
const REAL_134_ROW_STATEMENT_PATH = "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf";
const REAL_STATEMENT_1_PATH = "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf";
const FULL_INTEGRATED_STAGES = [
  "parser",
  "statement_investigative_intelligence",
  "whole_statement_ai_review",
  "web_search_discovery",
  "document_retrieval",
  "retrieved_document_investigative_intelligence",
  "semantic_verification",
  "canonical_admission",
  "customer_publication",
  "final_artifact",
] as const;

describe("whole-statement fee intelligence work plan", () => {
  it("classifies local Package 5B provider-send metadata failures as pre-send unavailability", () => {
    const classified = classifyWholeStatementFeeIntelligenceWorkUnitFailure(
      new Error("approved_maximum_output_tokens_inconsistent"),
    );

    expect(classified).toMatchObject({
      status: "not_attempted_provider_unavailable",
      outcomeClass: "provider_unavailable_before_send",
      requestId: null,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    });
    expect(classified.reasonCodes).toContain("whole_statement_fee_intelligence_provider_unavailable_before_send");
    expect(classified.reasonCodes).not.toContain("whole_statement_fee_intelligence_work_unit_send_status_uncertain");
  });

  it("classifies post-response AI SDK structured-output failures without calling them network failures", () => {
    const error = Object.assign(new Error("No object generated."), {
      name: "SafeProviderFailureError",
      reasonCode: "provider_structured_output_failed",
      reasonCodes: [
        "provider_http_send_initiated",
        "provider_http_status_200",
        "provider_http_status_class_2xx",
        "provider_phase_sdk_structured_output_handling",
        "provider_response_received",
        "provider_sdk_error_class_ai_nooutputgeneratederror",
        "provider_structured_output_failed",
        "provider_transport_ai_sdk_generate_text_structured_output",
      ],
      accounting: {
        requestId: "req_safe_structured_output",
        inputTokens: 100,
        cachedInputTokens: 10,
        outputTokens: 2_500,
      },
    });

    const classified = classifyWholeStatementFeeIntelligenceWorkUnitFailure(error);

    expect(classified).toMatchObject({
      status: "failed",
      outcomeClass: "provider_schema_failed",
      requestId: "req_safe_structured_output",
      inputTokens: 100,
      cachedInputTokens: 10,
      outputTokens: 2_500,
    });
    expect(classified.reasonCodes).toContain("provider_structured_output_failed");
    expect(classified.reasonCodes).not.toContain("provider_network_failed");
  });

  it("sizes Package 5B output ceilings from empirical structured-output headroom", () => {
    const planFor = (rowCount: number) => {
      const analysis = expandedAnalysis(rowCount);
      const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
      const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
      return buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive", limits: { maxRowsPerUnit: rowCount } });
    };

    expect(planFor(8).units[0]!.estimatedOutputTokens).toBe(2_500);
    expect(planFor(10).units[0]!.estimatedOutputTokens).toBe(2_600);
    expect(planFor(18).units[0]!.estimatedOutputTokens).toBe(4_120);
    expect(planFor(30).units[0]!.estimatedOutputTokens).toBe(5_000);
  });

  it("reserves Package 5B input for bounded live evidence context instead of statement-only packet bytes", () => {
    const analysis = expandedAnalysis(28);
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({ packet, mode: "comprehensive" });
    const limits = {
      maxSearchCalls: 4,
      maxRetrievalCandidates: 10,
      maxAdaptiveFollowUpCalls: 1,
    };

    for (const unit of plan.units) {
      const reserved = wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes({ unit, researchLimits: limits });
      expect(reserved).toBeGreaterThan(unit.estimatedInputBytes);
      expect(reserved).toBe(unit.estimatedInputBytes + 9_000 + 52_000 + unit.expectedFeeRowRefs.length * 2_200);
    }
  });

  it("matches statement #1 prep reporting to slot-expanded production reservations", async () => {
    const bytes = await readFile(REAL_STATEMENT_1_PATH);
    const document = await parsePdfBytes(bytes);
    const summary = analyzeStatementDocument(document, "restaurant_food_beverage", { sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf" });
    const analysis = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "statement_1_prep_envelope_regression",
      legacySummary: summary,
    }).analysis;
    const sourcePacket = buildFeeKnowledgeSourcePacket({ analysis, registry: null });
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, { approvedExternalSourceRefs: [] }, sourcePacket);
    const plan = buildWholeStatementFeeIntelligenceWorkPlan({
      packet,
      mode: "comprehensive",
      limits: { maxAggregateInputBytes: null, maxAggregateOutputTokens: null },
    });
    const researchLimits = {
      maxSearchCalls: 4,
      maxRetrievalCandidates: 10,
      maxAdaptiveFollowUpCalls: 1,
    };
    const selectedUnits = plan.units.filter((unit) => unit.status === "selected");
    const package5BParentEnvelope = roundUsd(selectedUnits.reduce((sum, unit) => sum + calculateWorstCaseCostUsd({
      maximumInputTokens: wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes({ unit, researchLimits }),
      maximumOutputTokens: wholeStatementFeeIntelligenceWorkUnitOutputReserveTokens({
        unit,
        parentMaximumOutputTokens: 5_000,
        aggregateOutputCeiling: null,
      }),
      maximumToolUses: 0,
      pricing: OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
    }), 0) + 0.000001);
    const costPolicy = oneTimeLiveCostPolicyTemplate(package5BParentEnvelope);
    const aggregateOutputCeiling = wholeStatementFeeIntelligenceAggregateOutputCeiling({
      parentMaximumOutputTokens: costPolicy.whole_statement_ai_review.maximumOutputTokens,
      parentEstimatedMaximumCostUsd: costPolicy.whole_statement_ai_review.estimatedMaximumCostUsd,
      parentMaximumToolUses: costPolicy.whole_statement_ai_review.maximumToolUses,
      pricing: OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING,
      units: selectedUnits,
      researchLimits,
      calculateWorstCaseCostUsd,
    });
    const workUnitReservations = selectedUnits.map((unit) => ({
      rowCount: unit.expectedFeeRowRefs.length,
      maximumInputTokens: wholeStatementFeeIntelligenceEvidenceAwareInputReserveBytes({ unit, researchLimits }),
      maximumOutputTokens: wholeStatementFeeIntelligenceWorkUnitOutputReserveTokens({
        unit,
        parentMaximumOutputTokens: costPolicy.whole_statement_ai_review.maximumOutputTokens,
        aggregateOutputCeiling,
      }),
    }));
    const slotExpandedEnvelope = oneTimeSlotExpandedCostEnvelope(costPolicy, FULL_INTEGRATED_STAGES);
    const singleCopyStageSum = ONE_TIME_PAID_STAGE_ORDER.reduce((sum, stage) => sum + costPolicy[stage].estimatedMaximumCostUsd, 0);

    expect(analysis.feeLedger.rows).toHaveLength(28);
    expect(workUnitReservations).toEqual([
      { rowCount: 18, maximumInputTokens: 126_750, maximumOutputTokens: 4_120 },
      { rowCount: 10, maximumInputTokens: 98_691, maximumOutputTokens: 2_600 },
    ]);
    expect(package5BParentEnvelope).toBe(0.19932175);
    expect(singleCopyStageSum).toBe(0.40944175);
    expect(slotExpandedEnvelope.totalEstimatedEnvelopeUsd).toBe(1.44252175);
    expect(singleCopyStageSum).toBeLessThan(slotExpandedEnvelope.totalEstimatedEnvelopeUsd);
  }, 30_000);

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
      limits: { maxRowsPerUnit: 18, maxAggregateOutputTokens: 7_000 },
    });

    expect(plan.units.some((unit) => unit.status === "not_selected_budget")).toBe(true);
    expect(plan.units.filter((unit) => unit.status === "not_selected_budget").flatMap((unit) => unit.selectionReasonCodes))
      .toContain("whole_statement_fee_intelligence_work_unit_not_selected_budget");
    expect(plan.units.some((unit) => unit.status === "failed")).toBe(false);
  });

  it("calculates the real 134-row comprehensive live canary budget from exact serialized provider-input reservations", async () => {
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
      maximumOutputTokens: unit.estimatedOutputTokens,
      maximumToolUses: 0,
      worstCaseCostUsd: calculateWorstCaseCostUsd({
        maximumInputTokens: unit.estimatedInputBytes,
        maximumOutputTokens: unit.estimatedOutputTokens,
        maximumToolUses: 0,
        pricing,
      }),
    }));
    const worstCaseTotalUsd = Number(workUnits.reduce((sum, unit) => sum + unit.worstCaseCostUsd, 0).toFixed(9));

    expect(analysis.feeLedger.rows).toHaveLength(134);
    expect(workUnits.map((unit) => unit.rowCount)).toEqual([18, 18, 18, 18, 18, 18, 18, 8]);
    expect(plan.units.map((unit) => unit.estimatedInputBytes)).toEqual(plan.units.map((unit) =>
      wholeStatementFeeIntelligenceProviderInputBytes(unit.packet)
    ));
    expect(workUnits.map((unit) => unit.maximumInputTokens)).toEqual([
      26396,
      26727,
      26350,
      26356,
      26706,
      26400,
      26338,
      13122,
    ]);
    expect(workUnits.map((unit) => unit.maximumOutputTokens)).toEqual([
      4_120,
      4_120,
      4_120,
      4_120,
      4_120,
      4_120,
      4_120,
      2_500,
    ]);
    expect(workUnits.map((unit) => unit.worstCaseCostUsd)).toEqual([
      0.038337,
      0.03858525,
      0.0383025,
      0.038307,
      0.0385695,
      0.03834,
      0.0382935,
      0.0210915,
    ]);
    expect(worstCaseTotalUsd).toBe(0.28982625);
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

function roundUsd(value: number): number {
  return Math.ceil(value * 1_000_000_000) / 1_000_000_000;
}
