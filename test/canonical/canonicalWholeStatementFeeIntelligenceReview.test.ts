import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../../src/analyzer.js";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildCanonicalRuntimeAnalysisWithRuntimeAi } from "../../src/canonical/runtimeAdapter.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { runWholeStatementFeeIntelligenceRuntime } from "../../src/canonical/wholeStatementFeeIntelligenceRuntime.js";
import { buildSingleStatementReportV1 } from "../../src/reporting/v1/index.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReview,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import type {
  CanonicalAiCapabilityOutput,
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalFeeRow,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical whole-statement fee intelligence review", () => {
  it("builds a sanitized packet covering every admitted fee row, not only material unresolved rows", () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis);

    expect(packet.admittedFeeRows.map((row) => row.feeRowRef)).toEqual([
      "feerow_known_charge",
      "feerow_section_subtotal",
      "feerow_bucket_total",
      "feerow_statement_control_total",
      "feerow_interchange_detail",
      "feerow_info_rate",
      "feerow_zero_reference",
      "feerow_adjustment",
      "feerow_credit",
      "feerow_duplicate",
      "feerow_supporting",
      "feerow_verification_only",
      "feerow_unresolved",
    ]);
    expect(packet.admittedFeeRows.map((row) => row.role)).toEqual([
      "individual_charge",
      "section_subtotal",
      "fee_bucket_total",
      "statement_control_total",
      "interchange_detail_row",
      "informational_rate_row",
      "zero_dollar_reference_row",
      "adjustment",
      "credit",
      "duplicate_representation",
      "supporting_evidence_only",
      "individual_charge",
      "unknown_unresolved",
    ]);
    expect(packet.admittedFeeRows.filter((row) => row.contributesToUniqueTotal === false).map((row) => row.feeRowRef)).toEqual([
      "feerow_section_subtotal",
      "feerow_bucket_total",
      "feerow_statement_control_total",
      "feerow_info_rate",
      "feerow_zero_reference",
      "feerow_duplicate",
      "feerow_supporting",
      "feerow_verification_only",
    ]);
    expect(packet.admittedFeeRows.find((row) => row.feeRowRef === "feerow_verification_only")?.currentLimitations).toContain(
      "Verification-only row.",
    );
    expect(packet.admittedFeeRows.map((row) => row.feeRowRef)).toEqual(analysis.feeLedger.rows.map((row) => row.id));
    expect(JSON.stringify(packet)).not.toMatch(/\$|statement\.pdf|merchant account/i);
  });

  it("accepts exact row coverage and creates deterministic semantic acceptance records without financial authority", () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, {
      approvedExternalSourceRefs: ["approved_doc_alpha"],
    });
    const review = validReview(packet, {
      approvedExternalSourceRef: "approved_doc_alpha",
      industryInferenceRowRef: "feerow_unresolved",
    });
    const result = validateWholeStatementFeeIntelligenceReview(review, analysis, {
      approvedExternalSourceRefs: ["approved_doc_alpha"],
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.output.reviewStatus).toBe("completed");
    expect(result.output.coverageProof).toMatchObject({ exactCoverage: true, missingFeeRowRefs: [] });
    expect(result.output.rowInterpretations).toHaveLength(packet.admittedFeeRows.length);
    expect(result.output.acceptanceRecords.map((record) => [record.feeRowRef, record.status])).toContainEqual([
      "feerow_unresolved",
      "accepted_with_conditions",
    ]);
    expect(result.output.acceptanceRecords.every((record) => record.immutableFeeRowRef === record.feeRowRef)).toBe(true);
    expect(result.output.financialMutationAllowed).toBe(false);
    expect(result.output.authoritative).toBe(false);
    expect(JSON.stringify(result.output)).not.toMatch(/openai|anthropic|gpt|claude|raw prompt|raw response|statement\.pdf/i);
  });

  it("rejects missing, duplicated, unknown, and malformed row coverage while preserving sanitized diagnostics", () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis);
    const base = validReview(packet);
    const cases = [
      { review: { ...base, rowInterpretations: base.rowInterpretations.slice(1) }, expected: { missingFeeRowRefs: ["feerow_known_charge"] } },
      { review: { ...base, rowInterpretations: [base.rowInterpretations[0]!, ...base.rowInterpretations] }, expected: { duplicatedFeeRowRefs: ["feerow_known_charge"] } },
      { review: { ...base, rowInterpretations: [{ ...base.rowInterpretations[0]!, feeRowRef: "feerow_unknown" }, ...base.rowInterpretations.slice(1)] }, expected: { unknownFeeRowRefs: ["feerow_unknown"], missingFeeRowRefs: ["feerow_known_charge"] } },
      { review: { ...base, rowInterpretations: [{ ...base.rowInterpretations[0]!, feeRowRef: "../bad" }, ...base.rowInterpretations.slice(1)] }, expected: { malformedFeeRowRefs: ["malformed_fee_row_ref"], malformedFeeRowRefCount: 1, missingFeeRowRefs: ["feerow_known_charge"] } },
    ];

    for (const { review, expected } of cases) {
      const result = validateWholeStatementFeeIntelligenceReview(review, analysis);
      expect(result.ok).toBe(false);
      expect(result.output.reviewStatus).toBe("rejected");
      expect(result.output.rowInterpretations).toEqual([]);
      expect(result.output.acceptanceRecords).toEqual([]);
      expect(result.output.coverageProof).toMatchObject({ exactCoverage: false, ...expected });
      expect(JSON.stringify(result.output.coverageProof)).not.toMatch(/\.\.\/bad/);
    }
  });

  it("makes every deterministic row-acceptance outcome reachable without AI-selected acceptance status", () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis, {
      approvedExternalSourceRefs: ["approved_doc_alpha"],
    });
    const review = validReview(packet, {
      approvedExternalSourceRef: "approved_doc_alpha",
      overrides: {
        feerow_known_charge: { evidenceProvenance: "statement_evidence", externalSourceRef: null, confidence: "high", recommendedDisposition: "supported" },
        feerow_bucket_total: { evidenceProvenance: "industry_inference", confidence: "medium", recommendedDisposition: "supported" },
        feerow_statement_control_total: { recommendedDisposition: "insufficient_evidence", missingEvidence: ["Needs contract support."] },
        feerow_interchange_detail: { evidenceProvenance: "approved_external_documentation", externalSourceRef: "unapproved_doc" },
        feerow_info_rate: { recommendedDisposition: "human_review", evidenceProvenance: "human_review" },
      },
    });
    const result = validateWholeStatementFeeIntelligenceReview(review, analysis, {
      approvedExternalSourceRefs: ["approved_doc_alpha"],
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(Object.fromEntries(result.output.acceptanceRecords.map((record) => [record.feeRowRef, record.status]))).toMatchObject({
      feerow_known_charge: "accepted",
      feerow_bucket_total: "accepted_with_conditions",
      feerow_statement_control_total: "needs_verification",
      feerow_interchange_detail: "rejected",
      feerow_info_rate: "human_review",
    });
    expect(result.output.acceptanceRecords.find((record) => record.feeRowRef === "feerow_interchange_detail")?.acceptedSemanticFields).toEqual({
      category: null,
      likelyEconomicOwner: null,
      likelyContractualController: null,
      actionabilityCeiling: null,
      evidenceProvenance: null,
    });

    const forged = {
      ...review,
      rowInterpretations: [{ ...review.rowInterpretations[0]!, acceptanceStatus: "accepted" }, ...review.rowInterpretations.slice(1)],
    };
    const forgedResult = validateWholeStatementFeeIntelligenceReview(forged, analysis);
    expect(forgedResult.ok).toBe(false);
    expect(forgedResult.output.acceptanceRecords).toEqual([]);
  });

  it("does not let fabricated sources, contradictions, or privacy failures become trusted accepted records", () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis);
    const contradiction = validReview(packet, {
      overrides: {
        feerow_known_charge: { conflicts: ["Conflicts with statement section."], recommendedDisposition: "conflicting_evidence" },
        feerow_bucket_total: { evidenceProvenance: "merchant_evidence" },
      },
    });
    const accepted = validateWholeStatementFeeIntelligenceReview(contradiction, analysis);
    expect(accepted.ok).toBe(true);
    expect(Object.fromEntries(accepted.output.acceptanceRecords.map((record) => [record.feeRowRef, record.status]))).toMatchObject({
      feerow_known_charge: "needs_verification",
      feerow_bucket_total: "rejected",
    });

    const fabricated = validReview(packet, {
      overrides: {
        feerow_known_charge: { evidenceProvenance: "statement_evidence", externalSourceRef: "fabricated_doc" },
      },
    });
    const fabricatedResult = validateWholeStatementFeeIntelligenceReview(fabricated, analysis);
    expect(fabricatedResult.ok).toBe(false);
    expect(fabricatedResult.output.acceptanceRecords).toEqual([]);

    const privacyBlocked = { ...validReview(packet), rawPrompt: "raw prompt" };
    const privacyResult = validateWholeStatementFeeIntelligenceReview(privacyBlocked, analysis);
    expect(privacyResult.output.reviewStatus).toBe("safety_blocked");
    expect(privacyResult.output.acceptanceRecords).toEqual([]);
  });

  it("blocks forbidden financial/provider/raw/sensitive fields and unsupported strong inference", () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis);
    const base = validReview(packet);
    const cases = [
      { ...base, provider: "openai" },
      { ...base, rawPrompt: "raw prompt" },
      { ...base, amountMinor: 123 },
      { ...base, rowInterpretations: [{ ...base.rowInterpretations[0]!, proposedActionabilityCeiling: "potentially_actionable", evidenceProvenance: "industry_inference" }, ...base.rowInterpretations.slice(1)] },
      { ...base, rowInterpretations: [{ ...base.rowInterpretations[0]!, conciseRationale: "It mentions $123." }, ...base.rowInterpretations.slice(1)] },
    ];

    for (const review of cases) {
      const result = validateWholeStatementFeeIntelligenceReview(review, analysis);
      expect(result.ok).toBe(false);
      expect(["rejected", "safety_blocked"]).toContain(result.output.reviewStatus);
      expect(JSON.stringify(result.output)).not.toMatch(/openai|raw prompt|123/i);
    }
  });

  it("executes the runtime producer and actively aborts timed-out execution", async () => {
    const analysis = everyRowAnalysis();
    const completed = await runWholeStatementFeeIntelligenceRuntime({
      analysis,
      options: {
        enabled: true,
        adapter: async (packet) => validReview(packet),
      },
    });
    const disabled = await runWholeStatementFeeIntelligenceRuntime({ analysis, options: { enabled: false } });
    let abortSignal: AbortSignal | null = null;
    let lateCompleted = false;
    const timedOut = await runWholeStatementFeeIntelligenceRuntime({
      analysis,
      options: {
        enabled: true,
        timeoutMs: 1,
        adapter: async (_packet, context) => {
          abortSignal = context.abortSignal;
          return new Promise((resolve) => {
            setTimeout(() => {
              lateCompleted = true;
              resolve(validReview(_packet));
            }, 20);
          });
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(completed.reviewStatus).toBe("completed");
    expect(completed.coverageProof.exactCoverage).toBe(true);
    expect(disabled.reviewStatus).toBe("disabled");
    expect(disabled.coverageProof.exactCoverage).toBe(false);
    expect(timedOut.reviewStatus).toBe("timed_out");
    expect(timedOut.rowInterpretations).toEqual([]);
    expect(abortSignal?.aborted).toBe(true);
    expect(lateCompleted).toBe(true);
    expect(timedOut.reviewStatus).toBe("timed_out");
  });

  it("passes abort signals through both supported provider transports", async () => {
    const analysis = everyRowAnalysis();
    const packet = buildWholeStatementFeeIntelligencePacket(analysis);
    let anthropicSignal: AbortSignal | null = null;
    let openAiSignal: AbortSignal | null = null;
    const sdk = {
      generateObject: async (options: Record<string, unknown>) => {
        anthropicSignal = options.abortSignal as AbortSignal;
        return { object: validReview(packet) };
      },
      generateText: async (options: Record<string, unknown>) => {
        openAiSignal = options.abortSignal as AbortSignal;
        return { output: validReview(packet) };
      },
      Output: { object: () => ({}) },
      createAnthropic: () => () => ({}),
      createOpenAI: () => () => ({}),
    };

    const anthropic = await runWholeStatementFeeIntelligenceRuntime({
      analysis,
      options: { enabled: true, provider: "anthropic", anthropicApiKey: "test-key", sdk },
    });
    const openai = await runWholeStatementFeeIntelligenceRuntime({
      analysis,
      options: { enabled: true, provider: "openai", openAiApiKey: "test-key", sdk },
    });

    expect(anthropic.reviewStatus).toBe("completed");
    expect(openai.reviewStatus).toBe("completed");
    expect(anthropicSignal).toBeInstanceOf(AbortSignal);
    expect(openAiSignal).toBeInstanceOf(AbortSignal);
  });

  it("aborts the provider transport on timeout and ignores late provider completion", async () => {
    const analysis = everyRowAnalysis();
    let providerSignal: AbortSignal | null = null;
    let lateCompleted = false;
    const timedOut = await runWholeStatementFeeIntelligenceRuntime({
      analysis,
      options: {
        enabled: true,
        provider: "anthropic",
        anthropicApiKey: "test-key",
        timeoutMs: 1,
        sdk: {
          generateObject: async (options: Record<string, unknown>) => {
            providerSignal = options.abortSignal as AbortSignal;
            return new Promise((resolve) => {
              setTimeout(() => {
                lateCompleted = true;
                resolve({ object: validReview(buildWholeStatementFeeIntelligencePacket(analysis)) });
              }, 20);
            });
          },
          createAnthropic: () => () => ({}),
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(timedOut.reviewStatus).toBe("timed_out");
    expect(providerSignal?.aborted).toBe(true);
    expect(lateCompleted).toBe(true);
    expect(timedOut.acceptanceRecords).toEqual([]);
  });

  it("runs the mandatory runtime slot in canonical shadow and keeps Packages B-E invariant on safe failure", async () => {
    const document = syntheticStatement();
    const baseline = buildCanonicalStatementFactsFromParsedDocument(document, {
      businessType: "restaurant_food_beverage",
      sourceAnalysisId: "job_h1_4b_runtime",
      sourceFileName: null,
    });
    const result = await buildCanonicalRuntimeAnalysisWithRuntimeAi({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_h1_4b_runtime",
      wholeStatementFeeIntelligence: {
        enabled: true,
        adapter: async (packet) => validReview(packet),
      },
    });
    const capability = result.analysis.aiCapabilities.capabilities.find(
      (record) => record.capability === "whole_statement_fee_intelligence_review",
    )!;

    expect(capability.status).toBe("failed");
    expect(capability.output).toBeNull();
    expect(result.runtimeAiCapabilitySnapshots.find((snapshot) => snapshot.capability === "whole_statement_fee_intelligence_review")).toMatchObject({
      attempted: true,
      normalizedStatus: "failed",
    });
    expect(financialProjection(result.analysis)).toEqual(financialProjection(baseline));
  });

  it("preserves unsuccessful runtime coverage diagnostics without creating trusted AI output or mutating B-E/Report V1", async () => {
    const document = syntheticRuntimeFeeStatement();
    const legacySummary = analyzeDocument(document, "restaurant_food_beverage");
    const legacyBefore = JSON.parse(JSON.stringify(legacySummary));
    const reportBefore = buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "report-h1-4b-runtime-diagnostic",
      generatedAt: "2026-07-31T00:00:00.000Z",
    });
    const baseline = buildCanonicalStatementFactsFromParsedDocument(document, {
      businessType: "restaurant_food_beverage",
      sourceAnalysisId: "job_h1_4b_runtime_diagnostic",
      sourceFileName: null,
    });

    const incomplete = await buildCanonicalRuntimeAnalysisWithRuntimeAi({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_h1_4b_runtime_diagnostic",
      legacySummary,
      wholeStatementFeeIntelligence: {
        enabled: true,
        adapter: async (packet) => ({
          ...validReview(packet),
          rowInterpretations: validReview(packet).rowInterpretations.slice(1),
        }),
      },
    });
    const incompleteCapability = wholeStatementCapability(incomplete.analysis);
    const incompleteRuntimeReview = wholeStatementRuntimeReview(incomplete);

    expect(incompleteCapability.status).toBe("rejected");
    expect(incompleteCapability.output).toBeNull();
    expect(incompleteCapability.limitationCodes).toContain("whole_statement_fee_intelligence_review_required");
    expect(incomplete.analysis.aiCapabilities.summary.financialReadiness).toBe("limited");
    expect(incompleteRuntimeReview.reviewStatus).toBe("rejected");
    expect(incompleteRuntimeReview.coverageProof.exactCoverage).toBe(false);
    expect(incompleteRuntimeReview.coverageProof.expectedFeeRowRefs.length).toBeGreaterThan(0);
    expect(incompleteRuntimeReview.coverageProof.reviewedFeeRowRefs).toHaveLength(
      incompleteRuntimeReview.coverageProof.expectedFeeRowRefs.length - 1,
    );
    expect(incompleteRuntimeReview.coverageProof.missingFeeRowRefs).toHaveLength(1);
    expect(incompleteRuntimeReview.coverageProof.reviewedFeeRowRefs).not.toContain(
      incompleteRuntimeReview.coverageProof.missingFeeRowRefs[0],
    );
    expect(incompleteRuntimeReview.coverageProof.duplicatedFeeRowRefs).toEqual([]);
    expect(incompleteRuntimeReview.coverageProof.unknownFeeRowRefs).toEqual([]);
    expect(incompleteRuntimeReview.coverageProof.malformedFeeRowRefs).toEqual([]);
    expect(incompleteRuntimeReview.coverageProof.malformedFeeRowRefCount).toBe(0);
    expect(incompleteRuntimeReview.acceptanceRecordCount).toBe(0);
    expect(incompleteRuntimeReview.authoritative).toBe(false);
    expect(financialProjection(incomplete.analysis)).toEqual(financialProjection(baseline));

    const safetyBlocked = await buildCanonicalRuntimeAnalysisWithRuntimeAi({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_h1_4b_runtime_safety_diagnostic",
      legacySummary,
      wholeStatementFeeIntelligence: {
        enabled: true,
        adapter: async (packet) => {
          const review = validReview(packet);
          return {
            ...review,
            rawPrompt: "raw prompt with unsafe-file.pdf",
            rowInterpretations: [
              { ...review.rowInterpretations[0]!, feeRowRef: "../unsafe-file.pdf" },
              ...review.rowInterpretations.slice(1),
            ],
          };
        },
      },
    });
    const safetyCapability = wholeStatementCapability(safetyBlocked.analysis);
    const safetyRuntimeReview = wholeStatementRuntimeReview(safetyBlocked);

    expect(safetyCapability.status).toBe("safety_blocked");
    expect(safetyCapability.output).toBeNull();
    expect(safetyCapability.limitationCodes).toContain("whole_statement_fee_intelligence_review_required");
    expect(safetyBlocked.analysis.aiCapabilities.summary.financialReadiness).toBe("limited");
    expect(safetyRuntimeReview.reviewStatus).toBe("safety_blocked");
    expect(safetyRuntimeReview.coverageProof.exactCoverage).toBe(false);
    expect(safetyRuntimeReview.coverageProof.malformedFeeRowRefs).toEqual(["malformed_fee_row_ref"]);
    expect(safetyRuntimeReview.coverageProof.malformedFeeRowRefCount).toBe(1);
    expect(safetyRuntimeReview.acceptanceRecordCount).toBe(0);
    expect(JSON.stringify(safetyRuntimeReview)).not.toMatch(/raw prompt|unsafe-file|openai|anthropic|gpt|claude/i);
    expect(financialProjection(safetyBlocked.analysis)).toEqual(financialProjection(baseline));

    const completed = await buildCanonicalRuntimeAnalysisWithRuntimeAi({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_h1_4b_runtime_completed",
      legacySummary,
      wholeStatementFeeIntelligence: {
        enabled: true,
        adapter: async (packet) => validReview(packet),
      },
    });
    const completedCapability = wholeStatementCapability(completed.analysis);
    const completedRuntimeReview = wholeStatementRuntimeReview(completed);
    expect(completedCapability.status).toBe("completed");
    expect(completedCapability.output?.type).toBe("whole_statement_fee_intelligence_review");
    expect(completedRuntimeReview.reviewStatus).toBe("completed");
    expect(completedRuntimeReview.coverageProof.exactCoverage).toBe(true);
    expect(completedRuntimeReview.acceptanceRecordCount).toBeGreaterThan(0);
    expect(financialProjection(completed.analysis)).toEqual(financialProjection(baseline));

    const reportAfter = buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "report-h1-4b-runtime-diagnostic",
      generatedAt: "2026-07-31T00:00:00.000Z",
    });
    expect(legacySummary).toEqual(legacyBefore);
    expect(reportAfter).toEqual(reportBefore);
  });

  it("runs a 12-case synthetic H1.4b invariance matrix without mutating B-E or legacy Report V1 output", async () => {
    const cases = [
      { name: "completed safe review", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => validReview(packet) }, expectedStatus: "completed", completed: true },
      { name: "disabled review", options: { enabled: false }, expectedStatus: "disabled", completed: false },
      { name: "provider failure", options: { enabled: true, adapter: async () => { throw new Error("provider unavailable"); } }, expectedStatus: "failed", completed: false },
      { name: "timeout", options: { enabled: true, timeoutMs: 1, adapter: async () => new Promise(() => undefined) }, expectedStatus: "timed_out", completed: false },
      { name: "malformed output", options: { enabled: true, adapter: async () => ({ malformed: true }) }, expectedStatus: "rejected", completed: false },
      { name: "rejected output", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => ({ ...validReview(packet), reviewStatus: "rejected", rowInterpretations: [] }) }, expectedStatus: "rejected", completed: false },
      { name: "safety-blocked output", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => ({ ...validReview(packet), rawPrompt: "raw prompt" }) }, expectedStatus: "safety_blocked", completed: false },
      { name: "incomplete coverage", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => ({ ...validReview(packet), rowInterpretations: validReview(packet).rowInterpretations.slice(1) }) }, expectedStatus: "rejected", completed: false },
      { name: "unfamiliar fee labels", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => validReview(packet, { industryInferenceRowRef: "feerow_unresolved" }) }, expectedStatus: "completed", completed: true },
      { name: "unresolved material classification", options: { enabled: false }, expectedStatus: "disabled", completed: false },
      { name: "unavailable ledger", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => validReview(packet) }, expectedStatus: "failed", completed: false, mutate: unavailableLedger },
      { name: "unsafe core facts", options: { enabled: true, adapter: async (packet: CanonicalWholeStatementFeeIntelligencePacket) => validReview(packet) }, expectedStatus: "completed", completed: true, mutate: unsafeCoreFacts },
    ] as const;
    const legacySummary = analyzeDocument(syntheticStatement(), "restaurant_food_beverage");
    const legacyBefore = JSON.parse(JSON.stringify(legacySummary));
    const reportBefore = buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "report-h1-4b-matrix",
      generatedAt: "2026-07-31T00:00:00.000Z",
    });

    const results = [];
    for (const item of cases) {
      const analysis = everyRowAnalysis();
      item.mutate?.(analysis);
      const baselineProjection = financialProjection(analysis);
      const output = await runWholeStatementFeeIntelligenceRuntime({ analysis, options: item.options });
      const finalAnalysis = analysisWithWholeStatementOutput(analysis, output);
      const h1Capability = finalAnalysis.aiCapabilities.capabilities.find((record) => record.capability === "whole_statement_fee_intelligence_review")!;
      const strongActions = finalAnalysis.customerState.actionGuidance.filter(
        (action) => action.actionType === "request_removal" || action.actionType === "request_repricing",
      );

      expect(output.reviewStatus, item.name).toBe(item.expectedStatus);
      expect(financialProjection(finalAnalysis), item.name).toEqual(baselineProjection);
      expect(finalAnalysis.customerState.visibility.visibleEligibleAnnualAmount.amountMinor, item.name).toBe(0);
      expect(strongActions, item.name).toEqual([]);
      if (item.completed) {
        expect(h1Capability.limitationCodes, item.name).not.toContain("whole_statement_fee_intelligence_review_required");
      } else {
        expect(h1Capability.limitationCodes, item.name).toContain("whole_statement_fee_intelligence_review_required");
        expect(finalAnalysis.aiCapabilities.summary.financialReadiness, item.name).not.toBe("ready");
        expect(finalAnalysis.customerState.primaryState, item.name).not.toMatch(/competitive|opportunity_identified|material_fee_opportunity/);
      }
      results.push({ name: item.name, status: output.reviewStatus, readiness: finalAnalysis.aiCapabilities.summary.financialReadiness });
    }

    const reportAfter = buildSingleStatementReportV1({
      analysis: legacySummary,
      reportId: "report-h1-4b-matrix",
      generatedAt: "2026-07-31T00:00:00.000Z",
    });
    expect(results.map((item) => item.name)).toHaveLength(12);
    expect(legacySummary).toEqual(legacyBefore);
    expect(reportAfter).toEqual(reportBefore);
  });
});

function analysisWithWholeStatementOutput(
  analysis: CanonicalStatementAnalysis,
  output: CanonicalAiWholeStatementFeeIntelligenceOutput,
): CanonicalStatementAnalysis {
  const cloned = JSON.parse(JSON.stringify(analysis)) as CanonicalStatementAnalysis;
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: cloned.identity,
    financialFacts: cloned.financialFacts,
    feeLedger: cloned.feeLedger,
    feeOwnershipActionability: cloned.feeOwnershipActionability,
    opportunityEngine: cloned.opportunityEngine,
    evidence: cloned.evidence,
    harnessInputs: [
      { capability: "full_statement_anomaly_review", status: "completed", output: fullStatementOutput(cloned) },
      { capability: "fee_classification_review", status: "completed", output: feeClassificationOutput(cloned) },
      {
        capability: "whole_statement_fee_intelligence_review",
        status: output.reviewStatus,
        output: output.reviewStatus === "completed" ? output : null,
      },
    ],
  });
  return {
    ...cloned,
    aiCapabilities,
    customerState: buildCanonicalCustomerState({
      identity: cloned.identity,
      financialFacts: cloned.financialFacts,
      feeLedger: cloned.feeLedger,
      feeOwnershipActionability: cloned.feeOwnershipActionability,
      opportunityEngine: cloned.opportunityEngine,
      aiCapabilities,
    }),
  };
}

function wholeStatementCapability(analysis: CanonicalStatementAnalysis) {
  return analysis.aiCapabilities.capabilities.find(
    (record) => record.capability === "whole_statement_fee_intelligence_review",
  )!;
}

function wholeStatementRuntimeReview(result: Awaited<ReturnType<typeof buildCanonicalRuntimeAnalysisWithRuntimeAi>>) {
  return result.runtimeAiCapabilitySnapshots.find(
    (snapshot) => snapshot.capability === "whole_statement_fee_intelligence_review",
  )!.runtimeWholeStatementFeeIntelligenceReview!;
}

function fullStatementOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]?.id;
  return {
    type: "full_statement_anomaly_review",
    authoritative: false,
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    factRefs: [],
    limitationCodes: [],
    observations: [],
  };
}

function feeClassificationOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]?.id;
  return {
    type: "fee_classification_review",
    authoritative: false,
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
    factRefs: [],
    limitationCodes: [],
    suggestions: [],
  };
}

function unavailableLedger(analysis: CanonicalStatementAnalysis): void {
  analysis.feeLedger = {
    ...analysis.feeLedger,
    status: "unavailable",
    sourceOccurrences: [],
    rows: [],
    uniqueChargeTotal: null,
    controls: [],
    limitations: ["Synthetic unavailable ledger."],
  };
  analysis.feeOwnershipActionability = {
    ...analysis.feeOwnershipActionability,
    rowClassifications: [],
    limitations: ["Synthetic unavailable ledger."],
  };
}

function unsafeCoreFacts(analysis: CanonicalStatementAnalysis): void {
  analysis.financialFacts.processedSales.value = { amountMinor: 0, currency: "USD" };
}

function validReview(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  options: {
    approvedExternalSourceRef?: string;
    industryInferenceRowRef?: string;
    overrides?: Record<string, Partial<ReturnType<typeof interpretationForRow>>>;
  } = {},
) {
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: "completed",
    evidenceRefs: packet.admittedFeeRows.flatMap((row) => row.evidenceRefs),
    factRefs: [],
    limitationCodes: [],
    rowInterpretations: packet.admittedFeeRows.map((row) => ({
      ...interpretationForRow(row, options),
      ...(options.overrides?.[row.feeRowRef] ?? {}),
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function interpretationForRow(
  row: CanonicalWholeStatementFeeIntelligencePacket["admittedFeeRows"][number],
  options: { approvedExternalSourceRef?: string; industryInferenceRowRef?: string },
) {
  const externalSourceRef = row.feeRowRef === "feerow_known_charge" && options.approvedExternalSourceRef ? options.approvedExternalSourceRef : null;
  const industry = row.feeRowRef === options.industryInferenceRowRef;
  return {
    feeRowRef: row.feeRowRef,
    proposedCategory: row.feeRowRef === "feerow_credit" ? "credit" : row.feeRowRef === "feerow_unresolved" ? "unknown_needs_review" : "processor_markup",
    likelyEconomicOwner: industry ? "unknown" : "processor",
    likelyContractualController: industry ? "unknown" : "merchant_contract",
    proposedActionabilityCeiling: industry ? "verify_only" : "not_actionable",
    confidence: industry ? "medium" : "high",
    conciseRationale: "Statement row label and section context support this semantic interpretation.",
    evidenceProvenance: externalSourceRef ? "approved_external_documentation" : industry ? "industry_inference" : "statement_evidence",
    evidenceRefs: row.evidenceRefs,
    externalSourceRef,
    externalClaimSupportRef: null,
    conflicts: [] as string[],
    missingEvidence: [] as string[],
    recommendedDisposition: "supported",
    authoritative: false,
  };
}

function everyRowAnalysis(): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
    businessType: "restaurant_food_beverage",
    sourceFileName: "h1-4b-synthetic",
  });
  const rows = [
    feeRow("feerow_known_charge", "ev_fee_known", "src_fee_known", "Monthly Service Fee", "individual_charge", true, -1000),
    feeRow("feerow_section_subtotal", "ev_fee_section_total", "src_fee_section_total", "Monthly Fee Section Subtotal", "section_subtotal", false, -1000),
    feeRow("feerow_bucket_total", "ev_fee_bucket", "src_fee_bucket", "Fee Bucket Total", "fee_bucket_total", false, -1000),
    feeRow("feerow_statement_control_total", "ev_fee_control", "src_fee_control", "Statement Control Total", "statement_control_total", false, -1000),
    feeRow("feerow_interchange_detail", "ev_fee_interchange", "src_fee_interchange", "Visa CPS Detail", "interchange_detail_row", true, -300),
    feeRow("feerow_info_rate", "ev_fee_info_rate", "src_fee_info_rate", "Qualified Rate 2.50 percent", "informational_rate_row", false, 0),
    feeRow("feerow_zero_reference", "ev_fee_zero", "src_fee_zero", "Reference Fee", "zero_dollar_reference_row", false, 0),
    feeRow("feerow_adjustment", "ev_fee_adjustment", "src_fee_adjustment", "Monthly Adjustment", "adjustment", true, -200),
    feeRow("feerow_credit", "ev_fee_credit", "src_fee_credit", "Monthly Credit", "credit", true, 500),
    feeRow("feerow_duplicate", "ev_fee_duplicate", "src_fee_duplicate", "Duplicate Display", "duplicate_representation", false, -1000),
    feeRow("feerow_supporting", "ev_fee_supporting", "src_fee_supporting", "Supporting Fee Note", "supporting_evidence_only", false, 0),
    feeRow("feerow_verification_only", "ev_fee_verify", "src_fee_verify", "Verification Only Monthly Item", "individual_charge", false, -400),
    feeRow("feerow_unresolved", "ev_fee_unresolved", "src_fee_unresolved", "Opaque Statement Item", "unknown_unresolved", true, -700),
  ] satisfies CanonicalFeeRow[];
  return {
    ...analysis,
    evidence: rows.map((row, index) => evidenceRecord(row.contributionDecision.evidenceRefs[0]!, index + 1)),
    feeLedger: {
      ...analysis.feeLedger,
      status: "partial",
      sourceOccurrences: rows.map((row, index) => ({
        id: row.sourceOccurrenceIds[0]!,
        evidenceRef: row.contributionDecision.evidenceRefs[0]!,
        documentId: "doc_h1_4b",
        pageNumber: 1,
        section: "fees",
        lineId: `line_${index + 1}`,
        rowIndex: index + 1,
        normalizedSourceText: null,
      })),
      rows,
      uniqueChargeTotal: money(-1700),
      controls: [],
      limitations: ["Synthetic partial ledger for whole-statement review."],
    },
  };
}

function feeRow(
  id: string,
  evidenceRef: string,
  sourceOccurrenceId: string,
  label: string,
  role: CanonicalFeeRow["role"],
  contributes: boolean,
  signedAmountMinor: number,
): CanonicalFeeRow {
  return {
    id,
    role,
    sourceOccurrenceIds: [sourceOccurrenceId],
    parserInterpretationIds: [],
    selectedLabel: label,
    selectedAmount: money(Math.abs(signedAmountMinor)),
    signedAmount: money(signedAmountMinor),
    contributesToUniqueTotal: contributes,
    contributionDecision: {
      contributes,
      reasonCode: contributes
        ? "individual_charge_included"
        : role === "duplicate_representation"
          ? "duplicate_representation_excluded"
          : role === "supporting_evidence_only"
            ? "supporting_evidence_only_excluded"
            : role === "section_subtotal" || role === "fee_bucket_total" || role === "statement_control_total"
              ? "subtotal_or_control_excluded"
              : role === "informational_rate_row"
                ? "rate_only_excluded"
                : "zero_amount_excluded",
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
    limitations: role === "unknown_unresolved" ? ["Requires semantic review."] : id === "feerow_verification_only" ? ["Verification-only row."] : [],
  };
}

function evidenceRecord(id: string, index: number) {
  return {
    id,
    documentId: "doc_h1_4b",
    pageNumber: 1,
    section: "fees",
    lineId: `line_${index}`,
    rowIndex: index,
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

function financialProjection(analysis: CanonicalStatementAnalysis): Record<string, unknown> {
  return {
    processedSales: analysis.financialFacts.processedSales,
    totalFees: analysis.financialFacts.totalFees,
    transactionCounts: analysis.financialFacts.transactionCounts,
    averageTicket: analysis.financialFacts.averageTicket,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
  };
}

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: H1B Synthetic",
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
    extraction: {
      mode: "structured",
      qualityScore: 0.99,
      warnings: [],
      pageCount: 1,
    },
  };
}

function syntheticRuntimeFeeStatement(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: ["content"],
    rows: [
      { content: "SYNTHETIC STATEMENT - NOT REAL BUSINESS DATA" },
      { content: "Fiserv synthetic processing statement" },
      { content: "Synthetic Reference | TEST0001" },
      { content: "Customer Service | 800-000-0000 | Statement Period | 02/01/24 - 02/29/24" },
      { content: "Total Amount Submitted | $1,565.73" },
      { content: "Total Amount Processed | $1,565.73" },
      { content: "Fees Charged | -$15.00" },
      { content: "Total Amount Funded To Your Bank | $1,550.73" },
      { content: "FEES CHARGED" },
      { content: "Date | Type | Description | Volume | Rate | Total" },
      { content: "02/29/24 | CF | SYNTHETIC CARD FEE | $1,000.00 | -10.00" },
      { content: "Total Card Fees | -$10.00" },
      { content: "02/29/24 | MISC | SYNTHETIC STATEMENT FEE | -5.00" },
      { content: "Total Miscellaneous Fees | -5.00" },
      { content: "Total (Miscellaneous Fees and Card Fees) | -$15.00" },
    ],
    textPreview: "SYNTHETIC STATEMENT Fiserv Total Amount Submitted $1,565.73 Fees Charged -$15.00 Total Amount Funded To Your Bank $1,550.73 FEES CHARGED Total (Miscellaneous Fees and Card Fees) -$15.00",
    extraction: {
      mode: "structured",
      qualityScore: 0.99,
      reasons: ["Synthetic test document."],
      lineCount: 15,
      amountTokenCount: 9,
      hasExtractableText: true,
    },
  };
}
