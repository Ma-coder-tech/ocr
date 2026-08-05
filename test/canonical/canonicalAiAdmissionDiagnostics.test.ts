import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../../src/analyzer.js";
import {
  buildCanonicalAiAdmissionAudit,
  diagnosticSignalsFromValidationErrors,
  validateCanonicalAiAdmissionAudit,
  type CanonicalAiAdmissionAttemptSource,
} from "../../src/canonical/aiAdmissionDiagnostics.js";
import { buildCanonicalCustomerReportProjection } from "../../src/canonical/customerReportProjection.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import { buildRuntimeAiCapabilityHarnessInputs } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import {
  buildCanonicalRuntimeFeeClassificationReviewPacket,
  type CanonicalRuntimeFeeClassificationReviewPacket,
} from "../../src/canonical/runtimeFeeClassificationReview.js";
import { provePackagesBEFinancialInvariance } from "../../src/evaluationIntegrity/invariance.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type {
  CanonicalRuntimeFeeClassificationReview,
  CanonicalRuntimeFeeClassificationReviewStatus,
  CanonicalStatementAnalysis,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";
import type { AnalysisSummary } from "../../src/types.js";

type MutableAttemptShape = Record<string, unknown> & {
  references: Record<string, unknown>;
  reasonCodes: string[];
  safeFieldPaths: string[];
  safeCounts: Record<string, unknown>;
};

type MutableAuditShape = Record<string, unknown> & {
  attempts: MutableAttemptShape[];
};

describe("canonical AI admission diagnostics", () => {
  it("returns a valid sibling audit without placing diagnostics in canonical analysis or projection", () => {
    const result = runtimeResult(completedAnomaly());
    const projection = buildCanonicalCustomerReportProjection(projectionSafeAnalysis(result.analysis), {
      purpose: "synthetic_fixture_validation_only",
    });

    expect(validateCanonicalAiAdmissionAudit(result.aiAdmissionAudit)).toEqual([]);
    expect(result.aiAdmissionAudit.policyVersion).toBe("canonical_ai_admission_audit_v1");
    expect("aiAdmissionAudit" in (result.analysis as unknown as Record<string, unknown>)).toBe(false);
    expect("internalDiagnostics" in (result.analysis.aiCapabilities as unknown as Record<string, unknown>)).toBe(false);
    expect(JSON.stringify(projection)).not.toMatch(/aiAdmissionAudit|executionRef|responseParseState|providerDetailsPersisted/);
  });

  it("keeps CanonicalStatementAnalysis closed to internal diagnostic payloads", () => {
    const analysis = structuredClone(runtimeResult(completedAnomaly()).analysis);
    (analysis.aiCapabilities as unknown as Record<string, unknown>).internalDiagnostics = [];

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/internal diagnostic records must not be attached/i);
  });

  it("does not change analysis, customer state, projection, or Packages B-E", () => {
    const first = runtimeResult(completedAnomaly());
    const second = runtimeResult(completedAnomaly());
    const firstProjection = buildCanonicalCustomerReportProjection(projectionSafeAnalysis(first.analysis), { purpose: "synthetic_fixture_validation_only" });
    const secondProjection = buildCanonicalCustomerReportProjection(projectionSafeAnalysis(second.analysis), { purpose: "synthetic_fixture_validation_only" });
    const invariance = provePackagesBEFinancialInvariance(packagesBE(first.analysis), packagesBE(second.analysis));

    expect(first.analysis).toEqual(second.analysis);
    expect(first.analysis.customerState).toEqual(second.analysis.customerState);
    expect(firstProjection).toEqual(secondProjection);
    expect(invariance.invariant).toBe(true);
    expect(invariance.mismatchPaths).toEqual([]);
  });

  it("preserves existing statuses, readiness, fallback, and limitation codes", () => {
    for (const metadata of [
      completedAnomaly(),
      { status: "failed", attempted: true },
      { status: "timed_out", attempted: true },
      { status: "safety_blocked", attempted: true },
      { status: "applied", attempted: true, anomalyCount: 1, overrideCount: 0, appliedOverrideCount: 0 },
      { status: "disabled", attempted: false },
    ]) {
      const first = runtimeResult(metadata);
      const second = runtimeResult(metadata);
      expect(first.analysis.aiCapabilities).toEqual(second.analysis.aiCapabilities);
      expect(first.analysis.customerState).toEqual(second.analysis.customerState);
    }
  });

  it("does not fabricate passed stages from coarse successful anomaly metadata", () => {
    const record = attempt(runtimeResult(completedAnomaly()).aiAdmissionAudit, "full_statement_anomaly_review");

    expect(record.schemaValidationState).toBe("passed");
    expect(record.reasonCodes).toContain("runtime_status_count_consistency_validated");
    expect({
      responseParseState: record.responseParseState,
      evidenceCitationState: record.evidenceCitationState,
      sourceQualityState: record.sourceQualityState,
      linkageState: record.linkageState,
      deterministicReconciliationState: record.deterministicReconciliationState,
      privacySafetyState: record.privacySafetyState,
    }).toEqual({
      responseParseState: "not_observed",
      evidenceCitationState: "not_observed",
      sourceQualityState: "not_observed",
      linkageState: "not_observed",
      deterministicReconciliationState: "not_observed",
      privacySafetyState: "not_observed",
    });
  });

  it("reports only status-appropriate fee-classification stages for every internal status", () => {
    const noMaterial = noMaterialFeeReviewAnalysis(runtimeResult(completedAnomaly()).analysis);
    const material = materialFeeReviewAnalysis(noMaterial);
    const statuses: CanonicalRuntimeFeeClassificationReviewStatus[] = [
      "completed_no_suggestions",
      "completed_with_diagnostic_suggestions",
      "safety_blocked",
      "failed",
      "timed_out",
      "rejected",
      "disabled",
      "not_needed",
    ];

    for (const status of statuses) {
      const analysis = status === "not_needed" ? noMaterial : material;
      const packet = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
      const review = feeReviewForStatus(status, packet);
      const adapted = buildRuntimeAiCapabilityHarnessInputs({
        analysis,
        summary: summaryWithFeeReview(review),
      });
      const snapshot = adapted.snapshots.find((item) => item.capability === "fee_classification_review")!;
      const capabilities = structuredClone(noMaterial.aiCapabilities.capabilities);
      const capability = capabilities.find((item) => item.capability === "fee_classification_review")!;
      capability.status = snapshot.normalizedStatus;
      capability.output = null;
      const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [snapshot] });
      const record = attempt(audit, "fee_classification_review");

      expect(validateCanonicalAiAdmissionAudit(audit), status).toEqual([]);
      if (status === "completed_no_suggestions" || status === "completed_with_diagnostic_suggestions") {
        expect(record.schemaValidationState, status).toBe("passed");
        expect(record.evidenceCitationState, status).toBe("passed");
        expect(record.linkageState, status).toBe("passed");
        expect(record.deterministicReconciliationState, status).toBe("passed");
        expect(record.privacySafetyState, status).toBe("passed");
      } else if (status === "safety_blocked") {
        expect(record.privacySafetyState).toBe("failed");
        expect(record.reasonCodes).toContain("runtime_fee_classification_review_safety_blocked");
        expect(record.reasonCodes).not.toContain("privacy_safety_validated");
      } else if (status === "disabled" || status === "not_needed") {
        expect(record.executionState, status).toBe("not_started");
        expect([
          record.schemaValidationState,
          record.evidenceCitationState,
          record.sourceQualityState,
          record.linkageState,
          record.deterministicReconciliationState,
          record.privacySafetyState,
        ], status).toEqual(Array(6).fill("not_applicable"));
      } else {
        expect([
          record.responseParseState,
          record.schemaValidationState,
          record.evidenceCitationState,
          record.sourceQualityState,
          record.linkageState,
          record.deterministicReconciliationState,
          record.privacySafetyState,
        ], status).toEqual(Array(7).fill("not_observed"));
      }
    }
  });

  it("retains validated fee-review packet references without requiring Package F output", () => {
    const noMaterial = noMaterialFeeReviewAnalysis(runtimeResult(completedAnomaly()).analysis);
    const material = materialFeeReviewAnalysis(noMaterial);
    const packet = buildCanonicalRuntimeFeeClassificationReviewPacket(material);
    const review = feeReviewForStatus("completed_with_diagnostic_suggestions", packet);
    const adapted = buildRuntimeAiCapabilityHarnessInputs({
      analysis: material,
      summary: summaryWithFeeReview(review),
    });
    const snapshot = adapted.snapshots.find((item) => item.capability === "fee_classification_review")!;
    const capabilities = structuredClone(noMaterial.aiCapabilities.capabilities);
    const capability = capabilities.find((item) => item.capability === "fee_classification_review")!;
    capability.status = "completed_diagnostic";
    capability.output = null;
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [snapshot] });
    const record = attempt(audit, "fee_classification_review");
    const expectedFeeRowRef = packet.materialFeeRowRefs[0]!;
    const expectedEvidenceRef = packet.evidenceRefsByFeeRowRef[expectedFeeRowRef]![0]!;

    expect(validateCanonicalAiAdmissionAudit(audit)).toEqual([]);
    expect(record.references.feeRowRefs).toContain(expectedFeeRowRef);
    expect(record.references.evidenceRefs).toContain(expectedEvidenceRef);
    expect(capability.output).toBeNull();
  });

  it("assigns unique safe execution references only to attempted results", () => {
    const first = runtimeResult(completedAnomaly()).aiAdmissionAudit;
    const second = runtimeResult(completedAnomaly()).aiAdmissionAudit;
    const firstAttempt = attempt(first, "full_statement_anomaly_review");
    const secondAttempt = attempt(second, "full_statement_anomaly_review");

    expect(firstAttempt.executionRef).toMatch(/^ai_exec_[a-z0-9]{32}$/);
    expect(secondAttempt.executionRef).toMatch(/^ai_exec_[a-z0-9]{32}$/);
    expect(firstAttempt.executionRef).not.toBe(secondAttempt.executionRef);
    expect(runtimeResult({ status: "disabled", attempted: false }).aiAdmissionAudit.attempts.every((record) =>
      record.executionState === "not_started" ? record.executionRef === null : true,
    )).toBe(true);
  });

  it("records typed reasons for disabled, not-needed, absent, and deterministic substitution cases", () => {
    const audit = runtimeResult({ status: "disabled", attempted: false }).aiAdmissionAudit;
    const anomaly = attempt(audit, "full_statement_anomaly_review");
    const documentQuality = attempt(audit, "document_quality_review");
    const narrative = attempt(audit, "merchant_narrative");

    expect(anomaly.notStartedReason).toBe("capability_disabled");
    expect(documentQuality.notStartedReason).toBe("capability_not_required");
    expect(narrative.executionState).toBe("not_observed");
    expect(narrative.executionRef).toBeNull();
    expect(narrative.notStartedReason).toBeNull();
    expect(narrative.reasonCodes).toContain("runtime_metadata_unavailable");
    expect([
      narrative.responseParseState,
      narrative.schemaValidationState,
      narrative.evidenceCitationState,
      narrative.sourceQualityState,
      narrative.linkageState,
      narrative.deterministicReconciliationState,
      narrative.privacySafetyState,
    ]).toEqual(Array(7).fill("not_observed"));
    expect(anomaly.executionState).toBe("not_started");
    expect(anomaly.executionRef).toBeNull();
    expect(documentQuality.executionState).toBe("not_started");

    const capabilities = structuredClone(runtimeResult(completedAnomaly()).analysis.aiCapabilities.capabilities);
    const substituted = capabilities.find((record) => record.capability === "full_statement_anomaly_review")!;
    substituted.status = "not_needed";
    substituted.trigger.absenceProof = "deterministic_runtime_safety_substitution:canonical_runtime_safety_review_v1";
    const substitutedRecord = attempt(buildCanonicalAiAdmissionAudit({ capabilities }), "full_statement_anomaly_review");
    expect(substitutedRecord.notStartedReason).toBe("deterministic_substitution");
    expect(substitutedRecord.reasonCodes).toContain("deterministic_anomaly_substitution_applied");
  });

  it("preserves duplicate attempts as deterministic diagnostic rejections", () => {
    const capabilities = runtimeResult(completedAnomaly()).analysis.aiCapabilities.capabilities;
    const source = diagnosticSource("completed");
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [source, structuredClone(source)] });
    const duplicates = audit.attempts.filter((record) => record.capability === "full_statement_anomaly_review");

    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((record) => record.attemptOrdinal)).toEqual([1, 2]);
    expect(duplicates.every((record) => record.admissionState === "rejected")).toBe(true);
    expect(duplicates.every((record) => record.reasonCodes.includes("duplicate_capability_input"))).toBe(true);
  });

  it("uses not_observed for coarse failures instead of inventing parse or schema detail", () => {
    const record = attempt(runtimeResult({ status: "failed", attempted: true }).aiAdmissionAudit, "full_statement_anomaly_review");

    expect(record.executionState).toBe("failed");
    expect(record.responseParseState).toBe("not_observed");
    expect(record.schemaValidationState).toBe("not_observed");
    expect(record.evidenceCitationState).toBe("not_observed");
    expect(record.linkageState).toBe("not_observed");
    expect(record.deterministicReconciliationState).toBe("not_observed");
  });

  it("maps only known validation errors to exact allowlisted stages, codes, and paths", () => {
    const signals = diagnosticSignalsFromValidationErrors([
      "runtime_fee_classification_review_not_plain_object:raw payload",
      "runtime_fee_classification_review_suggestions[0]_evidence_ref_mismatch:secret-ref",
      "runtime_fee_classification_review_suggestions[0]_candidate_ref_mismatch:secret-candidate",
      "runtime_fee_classification_review_row_not_in_packet:secret-row",
      "runtime_fee_classification_review_forbidden_value:/Users/private/statement.pdf",
      "arbitrary exception from OpenAI model gpt-secret",
    ]);
    const serialized = JSON.stringify(signals);

    expect(signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "response_parse", state: "failed", reasonCode: "invalid_response_shape" }),
      expect.objectContaining({ stage: "evidence_citation", state: "failed", reasonCode: "broken_evidence_reference" }),
      expect.objectContaining({ stage: "deterministic_reconciliation", state: "failed", reasonCode: "broken_classification_candidate_reference" }),
      expect.objectContaining({ stage: "linkage", state: "failed", reasonCode: "broken_fee_row_reference" }),
      expect.objectContaining({ stage: "privacy_safety", state: "failed", reasonCode: "forbidden_content" }),
      expect.objectContaining({ stage: null, state: null, reasonCode: "unclassified_internal_failure" }),
    ]));
    expect(serialized).not.toMatch(/secret-ref|secret-candidate|secret-row|Users|statement\.pdf|OpenAI|gpt-secret/);
  });

  it("keeps every stage unobserved for an arbitrary exception", () => {
    const rawError = "Azure OpenAI gpt-4o failed at /Users/private/merchant.pdf";
    const source = {
      ...diagnosticSource("failed"),
      diagnosticSignals: diagnosticSignalsFromValidationErrors([rawError, "arbitrary evidence_ref provider_details schema failure"]),
    };
    const capabilities = capabilitiesWithStatus(runtimeResult(completedAnomaly()).analysis, "full_statement_anomaly_review", "failed");
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [source] });
    const record = attempt(audit, "full_statement_anomaly_review");

    expect(record.reasonCodes).toContain("unclassified_internal_failure");
    expect([
      record.responseParseState,
      record.schemaValidationState,
      record.evidenceCitationState,
      record.sourceQualityState,
      record.linkageState,
      record.deterministicReconciliationState,
      record.privacySafetyState,
    ]).toEqual(Array(7).fill("not_observed"));
    expect(JSON.stringify(audit)).not.toContain(rawError);
    expect(JSON.stringify(audit)).not.toMatch(/Azure|OpenAI|gpt-4o|Users|merchant\.pdf/);
  });

  it("preserves known runtime validator safety errors without retaining the unsafe field", () => {
    const summary = analyzeDocument(statement(), "restaurant_food_beverage");
    summary.fiservFeeAnalysisV2 = {
      runtimeFeeClassificationReview: {
        type: "runtime_fee_classification_review",
        policyVersion: "canonical_runtime_fee_classification_review_v1",
        status: "completed_no_suggestions",
        reviewedFeeRowRefs: [],
        suggestions: [],
        absenceProof: null,
        limitationCodes: [],
        reasonCodes: [],
        authoritative: false,
        financialMutationAllowed: false,
        providerDetailsStripped: true,
        provider: "OpenAI",
      },
    } as unknown as AnalysisSummary["fiservFeeAnalysisV2"];
    const result = buildCanonicalRuntimeAnalysis({
      document: statement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_package_5a_validator",
      legacySummary: summary,
    });
    const record = attempt(result.aiAdmissionAudit, "fee_classification_review");

    expect(record.privacySafetyState).toBe("failed");
    expect(record.reasonCodes).toContain("forbidden_content");
    expect(record.safeFieldPaths).toContain("review");
    expect(JSON.stringify(result.aiAdmissionAudit)).not.toContain("OpenAI");
  });

  it("drops unsafe fields, references, counts, and execution refs from hostile diagnostic input", () => {
    const capabilities = capabilitiesWithStatus(runtimeResult(completedAnomaly()).analysis, "full_statement_anomaly_review", "failed");
    const providerReferences = [
      "anthropic_reference",
      "gpt4_candidate",
      "claude_packet",
      "gemini_reference",
      "google_model_ref",
      "azure_openai_ref",
      "bedrock_claude_ref",
    ];
    const hostile = {
      ...diagnosticSource("failed"),
      executionRef: "ai_exec_openai1234",
      reasonCodes: ["OpenAI failed for Jane Merchant at /Users/private/statement.pdf"],
      safeCounts: { anomalyCount: 1, apiKeyCount: 99 },
      diagnosticReferences: {
        factRefs: ["financialFacts.processedSales", ...providerReferences],
        evidenceRefs: ["https://example.com/private", "/Users/private/statement.pdf", `ev_${"a".repeat(20)}`, ...providerReferences],
        feeRowRefs: [`feerow_${"b".repeat(24)}`, ...providerReferences],
        questionRefs: [`question_${"c".repeat(16)}`, ...providerReferences],
        candidateRefs: [`candidate_${"d".repeat(16)}`, ...providerReferences],
        packetRefs: [`packet_${"e".repeat(16)}`, ...providerReferences],
      },
      trustedDiagnosticReferenceSets: {
        references: {
          evidenceRefs: [`ev_${"a".repeat(20)}`],
          feeRowRefs: [`feerow_${"b".repeat(24)}`],
        },
      },
      diagnosticSignals: [
        {
          stage: "schema_validation",
          state: "failed",
          reasonCode: "unclassified_internal_failure",
          fieldPath: "review",
        },
      ],
    } as CanonicalAiAdmissionAttemptSource;
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [hostile] });
    const record = attempt(audit, "full_statement_anomaly_review");
    const serialized = JSON.stringify(audit);

    expect(validateCanonicalAiAdmissionAudit(audit)).toEqual([]);
    expect(record.executionRef).toMatch(/^ai_exec_[a-z0-9]{32}$/);
    expect(record.reasonCodes).toContain("unsafe_execution_reference_replaced");
    expect(record.reasonCodes).toContain("unclassified_internal_failure");
    expect(record.reasonCodes).toContain("unverified_diagnostic_reference_dropped");
    expect(record.safeCounts).toEqual({ anomalyCount: 1 });
    expect(Object.values(record.references).every((references) => references.length === 0)).toBe(true);
    expect(record.schemaValidationState).toBe("not_observed");
    expect(serialized).not.toMatch(/Jane|Users|statement\.pdf|example\.com|apiKeyCount|openai|anthropic|gpt4|claude|gemini|google|azure|bedrock/i);

    for (const executionRef of [
      `ai_exec_${"a".repeat(32)}`,
      "ai_exec_openai1234",
      "ai_exec_gpt4_candidate",
      "ai_exec_anthropic_reference",
      "ai_exec_claude_packet",
      "ai_exec_gemini_reference",
      "ai_exec_google_model",
      "ai_exec_azure_openai",
      "ai_exec_bedrock_claude",
    ]) {
      const replacement = attempt(
        buildCanonicalAiAdmissionAudit({ capabilities, attempts: [{ ...diagnosticSource("failed"), executionRef }] }),
        "full_statement_anomaly_review",
      );
      expect(replacement.executionRef).toMatch(/^ai_exec_[a-f0-9]{32}$/);
      expect(replacement.executionRef).not.toBe(executionRef);
      expect(replacement.reasonCodes).toContain("unsafe_execution_reference_replaced");
    }
  });

  it("retains references only when a canonical capability output proves membership", () => {
    const result = runtimeResult(completedAnomaly());
    const capabilities = structuredClone(result.analysis.aiCapabilities.capabilities);
    const anomaly = capabilities.find((record) => record.capability === "full_statement_anomaly_review")!;
    const evidenceRef = result.analysis.evidence[0]!.id;
    anomaly.output!.factRefs = ["financialFacts.processedSales"];
    anomaly.output!.evidenceRefs = [evidenceRef];
    const source = {
      ...diagnosticSource("completed"),
      diagnosticReferences: {
        factRefs: ["financialFacts.processedSales", "financialFacts.unknown"],
        evidenceRefs: [evidenceRef, `ev_${"0".repeat(20)}`],
      },
    };
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [source] });
    const record = attempt(audit, "full_statement_anomaly_review");

    expect(validateCanonicalAiAdmissionAudit(audit)).toEqual([]);
    expect(record.references.factRefs).toEqual(["financialFacts.processedSales"]);
    expect(record.references.evidenceRefs).toEqual([evidenceRef]);
    expect(record.reasonCodes).toContain("unverified_diagnostic_reference_dropped");
    expect(JSON.stringify(audit)).not.toMatch(/financialFacts\.unknown|ev_0{20}/);
  });

  it("enforces bidirectional stage and reason consistency", () => {
    const valid = runtimeResult(completedAnomaly()).aiAdmissionAudit;
    const cases: Array<(audit: MutableAuditShape) => void> = [
      (audit) => {
        const record = audit.attempts[0]!;
        record.privacySafetyState = "failed";
        record.reasonCodes = [...record.reasonCodes, "privacy_safety_validated"].sort();
      },
      (audit) => {
        const record = audit.attempts[0]!;
        record.schemaValidationState = "not_observed";
        record.reasonCodes = [...record.reasonCodes, "schema_validated"].sort();
      },
      (audit) => {
        const record = audit.attempts[0]!;
        record.evidenceCitationState = "passed";
        record.reasonCodes = [...record.reasonCodes, "broken_evidence_reference", "evidence_references_validated"].sort();
      },
      (audit) => {
        const record = audit.attempts[0]!;
        record.evidenceCitationState = "not_observed";
        record.reasonCodes = [...record.reasonCodes, "broken_evidence_reference"].sort();
      },
      (audit) => {
        const record = audit.attempts.find((attempt) => attempt.capability === "document_quality_review")!;
        record.reasonCodes = [...record.reasonCodes, "schema_validated"].sort();
      },
      (audit) => {
        const record = audit.attempts.find((attempt) => attempt.capability === "document_quality_review")!;
        record.reasonCodes = [...record.reasonCodes, "broken_evidence_reference"].sort();
      },
      (audit) => {
        audit.attempts[0]!.privacySafetyState = "passed";
      },
      (audit) => {
        audit.attempts[0]!.evidenceCitationState = "failed";
      },
    ];

    for (const mutate of cases) {
      const malformed = mutableAudit(valid);
      mutate(malformed);
      expect(validateCanonicalAiAdmissionAudit(malformed)).toContain("attempt_stage_reason_inconsistent");
    }
  });

  it("rejects safe metadata assigned to the wrong capability", () => {
    const valid = runtimeResult(completedAnomaly()).aiAdmissionAudit;
    const cases: Array<{
      expected: string;
      capability: CanonicalAiAdmissionAttemptSource["capability"];
      mutate: (record: MutableAttemptShape) => void;
    }> = [
      { expected: "attempt_capability_safe_count_mismatch", capability: "full_statement_anomaly_review", mutate: (record) => { record.safeCounts.factCount = 1; } },
      { expected: "attempt_capability_safe_count_mismatch", capability: "merchant_narrative", mutate: (record) => { record.safeCounts.anomalyCount = 1; } },
      { expected: "attempt_capability_safe_count_mismatch", capability: "fee_classification_review", mutate: (record) => { record.safeCounts.acceptedRecordCount = 1; } },
      { expected: "attempt_capability_safe_count_mismatch", capability: "whole_statement_fee_intelligence_review", mutate: (record) => { record.safeCounts.materialFeeRowCount = 1; } },
      { expected: "attempt_capability_field_path_mismatch", capability: "full_statement_anomaly_review", mutate: (record) => { record.safeFieldPaths = ["runtime.aiMerchantNarrative"]; } },
      { expected: "attempt_capability_field_path_mismatch", capability: "merchant_narrative", mutate: (record) => { record.safeFieldPaths = ["runtime.aiAnomalyReview"]; } },
      { expected: "attempt_capability_field_path_mismatch", capability: "fee_classification_review", mutate: (record) => { record.safeFieldPaths = ["runtime.aiAnomalyReview.status"]; } },
      { expected: "attempt_capability_field_path_mismatch", capability: "whole_statement_fee_intelligence_review", mutate: (record) => { record.safeFieldPaths = ["review"]; } },
    ];

    for (const item of cases) {
      const malformed = mutableAudit(valid);
      const record = malformed.attempts.find((attempt) => attempt.capability === item.capability)!;
      item.mutate(record);
      expect(validateCanonicalAiAdmissionAudit(malformed), item.capability).toContain(item.expected);
    }
  });

  it("drops cross-capability metadata during audit construction", () => {
    const capabilities = runtimeResult(completedAnomaly()).analysis.aiCapabilities.capabilities;
    const source: CanonicalAiAdmissionAttemptSource = {
      ...diagnosticSource("completed"),
      safeCounts: { anomalyCount: 0, factCount: 12 },
      diagnosticSignals: [{
        stage: "schema_validation",
        state: "passed",
        reasonCode: "runtime_status_count_consistency_validated",
        fieldPath: "runtime.aiMerchantNarrative",
      }],
    };
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [source] });
    const record = attempt(audit, "full_statement_anomaly_review");

    expect(validateCanonicalAiAdmissionAudit(audit)).toEqual([]);
    expect(record.safeCounts).toEqual({ anomalyCount: 0 });
    expect(record.safeFieldPaths).toEqual([]);
  });

  it("rejects malformed runtime audit objects across the closed contract", () => {
    const valid = runtimeResult(completedAnomaly()).aiAdmissionAudit;
    expect(validateCanonicalAiAdmissionAudit(valid)).toEqual([]);

    const cases: Array<{
      name: string;
      expected: string;
      mutate: (audit: MutableAuditShape) => void;
    }> = [
      { name: "unknown top-level field", expected: "audit_unknown_field", mutate: (audit) => { audit.provider = "OpenAI"; } },
      { name: "unknown attempt field", expected: "attempt_unknown_field", mutate: (audit) => { audit.attempts[0]!.model = "gpt-4"; } },
      { name: "unknown reference category", expected: "attempt_references_unknown_field", mutate: (audit) => { audit.attempts[0]!.references.providerRefs = []; } },
      { name: "missing reference category", expected: "attempt_references_required_field_missing", mutate: (audit) => { delete audit.attempts[0]!.references.packetRefs; } },
      { name: "execution state enum", expected: "attempt_execution_state_invalid", mutate: (audit) => { audit.attempts[0]!.executionState = "provider_failed"; } },
      { name: "admission state enum", expected: "attempt_admission_state_invalid", mutate: (audit) => { audit.attempts[0]!.admissionState = "accepted_by_model"; } },
      { name: "not-started reason enum", expected: "attempt_not_started_reason_invalid", mutate: (audit) => { stoppedAttempt(audit).notStartedReason = "provider_disabled"; } },
      { name: "final status enum", expected: "attempt_final_canonical_status_invalid", mutate: (audit) => { audit.attempts[0]!.finalCanonicalStatus = "provider_completed"; } },
      { name: "missing capability", expected: "attempt_capability_missing", mutate: (audit) => { audit.attempts.pop(); } },
      {
        name: "duplicate capability ordinal",
        expected: "attempt_capability_ordinal_duplicate",
        mutate: (audit) => { audit.attempts.splice(1, 0, structuredClone(audit.attempts[0]!)); },
      },
      {
        name: "noncontiguous ordinal",
        expected: "attempt_capability_ordinals_noncontiguous",
        mutate: (audit) => {
          audit.attempts[0]!.attemptOrdinal = 2;
          audit.attempts[0]!.id = "ai_admission_attempt_full_statement_anomaly_review_2";
        },
      },
      { name: "execution reference consistency", expected: "attempt_execution_ref_invalid", mutate: (audit) => { audit.attempts[0]!.executionRef = null; } },
      { name: "provider execution reference", expected: "attempt_execution_ref_invalid", mutate: (audit) => { audit.attempts[0]!.executionRef = "ai_exec_openai1234"; } },
      { name: "not-started reason consistency", expected: "attempt_not_started_reason_missing", mutate: (audit) => { stoppedAttempt(audit).notStartedReason = null; } },
      {
        name: "unobserved execution reference",
        expected: "attempt_execution_ref_unexpected",
        mutate: (audit) => { audit.attempts.find((record) => record.executionState === "not_observed")!.executionRef = "ai_exec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; },
      },
      {
        name: "unobserved not-started reason",
        expected: "attempt_not_started_reason_unexpected",
        mutate: (audit) => { audit.attempts.find((record) => record.executionState === "not_observed")!.notStartedReason = "capability_disabled"; },
      },
      {
        name: "unobserved runtime-metadata reason",
        expected: "attempt_runtime_metadata_reason_missing",
        mutate: (audit) => {
          const record = audit.attempts.find((attempt) => attempt.executionState === "not_observed")!;
          record.reasonCodes = record.reasonCodes.filter((reason) => reason !== "runtime_metadata_unavailable");
        },
      },
      { name: "admission and final-status consistency", expected: "attempt_admission_status_inconsistent", mutate: (audit) => { audit.attempts[0]!.admissionState = "rejected"; } },
      { name: "stage and reason consistency", expected: "attempt_stage_reason_inconsistent", mutate: (audit) => { audit.attempts[0]!.schemaValidationState = "failed"; } },
      { name: "top-level persistence", expected: "audit_persistence_declaration_invalid", mutate: (audit) => { audit.rawPromptPersisted = true; } },
      { name: "attempt persistence", expected: "attempt_persistence_declaration_invalid", mutate: (audit) => { audit.attempts[0]!.rawResponsePersisted = true; } },
      { name: "reason code", expected: "attempt_reason_code_invalid", mutate: (audit) => { audit.attempts[0]!.reasonCodes.push("raw_provider_exception"); } },
      { name: "admission reason", expected: "attempt_admission_reason_code_missing", mutate: (audit) => { audit.attempts[0]!.reasonCodes = audit.attempts[0]!.reasonCodes.filter((code) => code !== "canonical_admission_admitted"); } },
      { name: "field path", expected: "attempt_field_path_invalid", mutate: (audit) => { audit.attempts[0]!.safeFieldPaths.push("/Users/private/statement.pdf"); } },
      { name: "count", expected: "attempt_safe_count_invalid", mutate: (audit) => { audit.attempts[0]!.safeCounts.providerTokens = 1; } },
      { name: "reference", expected: "attempt_reference_invalid", mutate: (audit) => { audit.attempts[0]!.references.evidenceRefs = ["ev_openai_model_ref"]; } },
      { name: "nonexistent canonical reference", expected: "attempt_reference_unverified", mutate: (audit) => { audit.attempts[0]!.references.evidenceRefs = [`ev_${"f".repeat(20)}`]; } },
      { name: "execution and final-status consistency", expected: "attempt_execution_final_status_inconsistent", mutate: (audit) => { audit.attempts[0]!.executionState = "failed"; } },
      {
        name: "capability reason mismatch",
        expected: "attempt_capability_reason_code_mismatch",
        mutate: (audit) => {
          const narrative = audit.attempts.find((item) => item.capability === "merchant_narrative")!;
          narrative.reasonCodes = [...narrative.reasonCodes, "runtime_anomaly_review_failed"].sort();
        },
      },
      {
        name: "deterministic attempt order",
        expected: "attempt_order_invalid",
        mutate: (audit) => {
          [audit.attempts[0], audit.attempts[1]] = [audit.attempts[1]!, audit.attempts[0]!];
        },
      },
    ];

    for (const item of cases) {
      const malformed = mutableAudit(valid);
      item.mutate(malformed);
      expect(validateCanonicalAiAdmissionAudit(malformed), item.name).toContain(item.expected);
    }

    const capabilities = runtimeResult(completedAnomaly()).analysis.aiCapabilities.capabilities;
    const source = diagnosticSource("completed");
    const duplicateAudit = buildCanonicalAiAdmissionAudit({ capabilities, attempts: [source, structuredClone(source)] });
    expect(validateCanonicalAiAdmissionAudit(duplicateAudit)).toEqual([]);
    const malformedDuplicate = mutableAudit(duplicateAudit);
    malformedDuplicate.attempts[0]!.admissionState = "admitted";
    expect(validateCanonicalAiAdmissionAudit(malformedDuplicate)).toContain("attempt_duplicate_rejection_inconsistent");
  });

  it("orders capability records and duplicate ordinals deterministically without mutating inputs", () => {
    const capabilities = runtimeResult(completedAnomaly()).analysis.aiCapabilities.capabilities;
    const attempts = [
      { ...diagnosticSource("completed"), capability: "merchant_narrative" as const },
      diagnosticSource("completed"),
      diagnosticSource("completed"),
    ];
    const beforeCapabilities = structuredClone(capabilities);
    const beforeAttempts = structuredClone(attempts);
    const audit = buildCanonicalAiAdmissionAudit({ capabilities, attempts });

    expect(audit.attempts.map((record) => `${record.capability}:${record.attemptOrdinal}`)).toEqual([
      "full_statement_anomaly_review:1",
      "full_statement_anomaly_review:2",
      "whole_statement_fee_intelligence_review:1",
      "fee_classification_review:1",
      "notice_change_review:1",
      "benchmark_category_review:1",
      "merchant_narrative:1",
      "document_quality_review:1",
    ]);
    expect(capabilities).toEqual(beforeCapabilities);
    expect(attempts).toEqual(beforeAttempts);
  });

  it("keeps financial and opportunity projections invariant across diagnostic permutations", () => {
    const base = runtimeResult(completedAnomaly()).analysis;
    for (const metadata of [
      { status: "failed", attempted: true },
      { status: "timed_out", attempted: true },
      { status: "safety_blocked", attempted: true },
      { status: "disabled", attempted: false },
      { status: "applied", attempted: true, anomalyCount: 3, overrideCount: 0, appliedOverrideCount: 0 },
    ]) {
      const variant = runtimeResult(metadata).analysis;
      const proof = provePackagesBEFinancialInvariance(packagesBE(base), packagesBE(variant));
      expect(proof.invariant, JSON.stringify(metadata)).toBe(true);
      expect(proof.mismatchPaths).toEqual([]);
    }
  });
});

function runtimeResult(aiAnomalyReview: Record<string, unknown>) {
  return buildCanonicalRuntimeAnalysis({
    document: statement(),
    businessType: "restaurant_food_beverage",
    runtimeDocumentRef: "job_package_5a_synthetic",
    legacySummary: summaryWithAi(aiAnomalyReview),
  });
}

function summaryWithAi(aiAnomalyReview: Record<string, unknown>): AnalysisSummary {
  return {
    ...analyzeDocument(statement(), "restaurant_food_beverage"),
    fiservFeeAnalysisV2: { aiAnomalyReview } as AnalysisSummary["fiservFeeAnalysisV2"],
  };
}

function summaryWithFeeReview(review: CanonicalRuntimeFeeClassificationReview): AnalysisSummary {
  const summary = summaryWithAi(completedAnomaly());
  summary.fiservFeeAnalysisV2 = {
    ...(summary.fiservFeeAnalysisV2 ?? {}),
    runtimeFeeClassificationReview: review,
  } as AnalysisSummary["fiservFeeAnalysisV2"];
  return summary;
}

function noMaterialFeeReviewAnalysis(source: CanonicalStatementAnalysis): CanonicalStatementAnalysis {
  const analysis = structuredClone(source);
  for (const row of analysis.feeLedger.rows) {
    if (row.role === "unknown_unresolved") row.role = "individual_charge";
  }
  for (const classification of analysis.feeOwnershipActionability.rowClassifications) {
    classification.selected.category = "administrative_fee";
    classification.selected.ownership = {
      collector: "processor",
      economicBeneficiary: "processor",
      contractualController: "processor",
    };
    classification.selected.actionabilityCeiling = "not_actionable";
    classification.selected.documentationRequirement = "none";
    classification.selected.confidence = "high";
    classification.conflictStatus = "none";
    classification.conflictReason = null;
  }
  return analysis;
}

function materialFeeReviewAnalysis(source: CanonicalStatementAnalysis): CanonicalStatementAnalysis {
  const analysis = structuredClone(source);
  const evidenceRef = `ev_${"1".repeat(20)}`;
  const sourceOccurrenceId = `srcocc_${"2".repeat(24)}`;
  const feeRowId = `feerow_${"3".repeat(24)}`;
  const candidateId = `feecand_${"4".repeat(16)}`;
  analysis.evidence.push({
    id: evidenceRef,
    documentId: "doc_package_5a_synthetic",
    pageNumber: 1,
    section: "fees",
    lineId: "package_5a_fee_line",
    rowIndex: 1,
    extractedText: null,
    normalizedText: null,
    sourceRole: "fee_row",
    confidence: "medium",
    extractionObservations: [],
    parserInterpretations: [],
    customerSafe: { excerpt: null, redactionApplied: true },
  });
  analysis.feeLedger.sourceOccurrences.push({
    id: sourceOccurrenceId,
    evidenceRef,
    documentId: "doc_package_5a_synthetic",
    pageNumber: 1,
    section: "fees",
    lineId: "package_5a_fee_line",
    rowIndex: 1,
    normalizedSourceText: null,
  });
  analysis.feeLedger.rows.push({
    id: feeRowId,
    role: "unknown_unresolved",
    sourceOccurrenceIds: [sourceOccurrenceId],
    parserInterpretationIds: [],
    selectedLabel: "Synthetic unresolved fee",
    selectedAmount: { amountMinor: 1000, currency: "USD" },
    signedAmount: { amountMinor: -1000, currency: "USD" },
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
  });
  analysis.feeOwnershipActionability.rowClassifications.push({
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
        ruleId: "package_5a_synthetic_unknown",
        ruleVersion: "1.0.0",
        ruleProvenance: "Synthetic Package 5A diagnostic fixture.",
        evidenceRefs: [evidenceRef],
        reference: null,
        authoritative: true,
        reason: "Synthetic unresolved classification.",
        permissionConsequences: [],
        limitations: [],
      },
    ],
    conflictStatus: "unresolved",
    conflictReason: "Synthetic unresolved classification.",
  });
  return analysis;
}

function feeReviewForStatus(
  status: CanonicalRuntimeFeeClassificationReviewStatus,
  packet: CanonicalRuntimeFeeClassificationReviewPacket,
): CanonicalRuntimeFeeClassificationReview {
  const reviewedFeeRowRefs =
    status === "completed_no_suggestions" || status === "completed_with_diagnostic_suggestions"
      ? [...packet.materialFeeRowRefs]
      : [];
  const firstFeeRowRef = packet.materialFeeRowRefs[0] ?? null;
  const suggestions =
    status === "completed_with_diagnostic_suggestions" && firstFeeRowRef
      ? [
          {
            feeRowRef: firstFeeRowRef,
            evidenceRefs: [...(packet.evidenceRefsByFeeRowRef[firstFeeRowRef] ?? [])],
            currentClassificationCandidateRef: null,
            suggestedCategory: "unknown_needs_review" as const,
            confidence: "low" as const,
            disposition: "confirm_existing" as const,
            reasonCodes: [],
            authoritative: false as const,
          },
        ]
      : [];
  return {
    type: "runtime_fee_classification_review",
    policyVersion: "canonical_runtime_fee_classification_review_v1",
    status,
    reviewedFeeRowRefs,
    suggestions,
    absenceProof: status === "not_needed" ? packet.absenceProof : null,
    limitationCodes: [],
    reasonCodes: [],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function completedAnomaly(): Record<string, unknown> {
  return {
    status: "no_anomalies",
    attempted: true,
    anomalyCount: 0,
    overrideCount: 0,
    appliedOverrideCount: 0,
  };
}

function diagnosticSource(status: CanonicalAiAdmissionAttemptSource["normalizedStatus"]): CanonicalAiAdmissionAttemptSource {
  return {
    capability: "full_statement_anomaly_review",
    attempted: !["disabled", "not_needed"].includes(status),
    normalizedStatus: status,
    safeCounts: { anomalyCount: 0 },
    executionRef: null,
    reasonCodes: status === "completed" ? ["runtime_anomaly_review_no_issues_found"] : ["runtime_anomaly_review_failed"],
  };
}

function attempt(audit: ReturnType<typeof buildCanonicalAiAdmissionAudit>, capability: CanonicalAiAdmissionAttemptSource["capability"]) {
  return audit.attempts.find((record) => record.capability === capability)!;
}

function capabilitiesWithStatus(
  analysis: CanonicalStatementAnalysis,
  capabilityId: CanonicalAiAdmissionAttemptSource["capability"],
  status: CanonicalAiAdmissionAttemptSource["normalizedStatus"],
) {
  const capabilities = structuredClone(analysis.aiCapabilities.capabilities);
  const capability = capabilities.find((item) => item.capability === capabilityId)!;
  capability.status = status;
  if (status !== "completed" && status !== "completed_diagnostic") capability.output = null;
  return capabilities;
}

function mutableAudit(audit: unknown): MutableAuditShape {
  return structuredClone(audit) as MutableAuditShape;
}

function stoppedAttempt(audit: MutableAuditShape): MutableAttemptShape {
  return audit.attempts.find((record) => record.executionState === "not_started")!;
}

function packagesBE(analysis: CanonicalStatementAnalysis) {
  return {
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
  };
}

function projectionSafeAnalysis(source: CanonicalStatementAnalysis): CanonicalStatementAnalysis {
  const analysis = structuredClone(source);
  const evidenceRef = analysis.evidence[0]!.id;
  analysis.identity.processorName = {
    ...analysis.identity.processorName,
    value: "Fiserv",
    status: "selected",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.identity.processorFamily = {
    ...analysis.identity.processorFamily,
    value: "Fiserv / First Data",
    status: "selected",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.identity.statementPeriod = {
    ...analysis.identity.statementPeriod,
    value: { start: "2026-01-01", end: "2026-01-31" },
    status: "selected",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    limitations: [],
  };
  analysis.feeLedger.status = "available";
  analysis.feeLedger.uniqueChargeTotal = structuredClone(analysis.financialFacts.totalFees.value);
  analysis.feeLedger.controls = [];
  analysis.feeLedger.rows = [];
  analysis.customerState.axes = {
    analysisReadiness: "verified",
    dataIntegrity: "reconciled",
    ratePosition: "unavailable",
    opportunityPosture: "none",
    explanationReadiness: "deterministic_fallback",
  };
  analysis.customerState.primaryState = "verified_benchmark_unavailable";
  analysis.customerState.visibility = {
    ...analysis.customerState.visibility,
    showCoreMetrics: true,
    showEffectiveRate: true,
    showBenchmark: false,
    showFeeInventory: true,
    showOwnershipActionability: false,
    showDeterministicOpportunity: false,
    showEstimatedOpportunity: false,
    showVerificationAmounts: false,
    showEvidenceCalculations: false,
    showActions: false,
    showCustomerExplanation: true,
  };
  setPermission(analysis, "core_metrics", true);
  setPermission(analysis, "effective_rate", true);
  setPermission(analysis, "benchmark", false);
  setPermission(analysis, "fee_inventory", true);
  setPermission(analysis, "customer_explanation", true);
  analysis.customerState.explanation = {
    ...analysis.customerState.explanation,
    source: "deterministic_fallback",
    prohibitedLanguageCheck: "passed",
    sections: [{ kind: "summary", text: "Verified statement details are available.", factRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef] }],
  };
  return analysis;
}

function setPermission(
  analysis: CanonicalStatementAnalysis,
  key: CanonicalStatementAnalysis["customerState"]["permissions"][number]["key"],
  permitted: boolean,
): void {
  const permission = analysis.customerState.permissions.find((item) => item.key === key)!;
  permission.permitted = permitted;
  permission.reasonCodes = [permitted ? "section_permitted" : "section_unavailable"];
  permission.limitationCodes = permitted ? [] : ["section_unavailable"];
}

function statement(): ParsedDocument {
  const lines = [
    "Merchant: Package Five A Synthetic",
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
      qualityScore: 1,
      reasons: ["Synthetic Package 5A fixture."],
      lineCount: lines.length,
      amountTokenCount: 3,
      hasExtractableText: true,
    },
  };
}
