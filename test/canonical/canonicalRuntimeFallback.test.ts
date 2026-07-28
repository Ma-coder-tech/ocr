import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  runCanonicalRuntimeShadow,
  setCanonicalRuntimeShadowDiagnosticSinkForLocalUse,
} from "../../src/canonical/runtimeShadow.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import { CanonicalStatementValidationError } from "../../src/canonical/validate.js";
import { buildSingleStatementReportV1 } from "../../src/reporting/v1/index.js";
import { analyzeDocument } from "../../src/analyzer.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical runtime shadow fallback", () => {
  it("does no canonical runtime work when the shadow flag is absent, false, or malformed", async () => {
    for (const value of [undefined, "false", "TRUE", "yes", "1"]) {
      const buildAnalysis = vi.fn();
      const result = await runCanonicalRuntimeShadow({
        document: syntheticSummaryDocument(),
        businessType: "retail",
        summary: analyzeDocument(syntheticSummaryDocument(), "retail"),
        runtimeDocumentRef: "job_disabled",
        env: value === undefined ? {} : { RATEREVEAL_CANONICAL_SHADOW_ENABLED: value },
        buildAnalysis,
      });

      expect(result.status).toBe("disabled");
      expect(buildAnalysis).not.toHaveBeenCalled();
    }
  });

  it("executes canonical construction once when the shadow flag is true", async () => {
    const document = syntheticSummaryDocument();
    const summary = analyzeDocument(document, "retail");
    const built = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_enabled",
      legacySummary: summary,
    });
    const buildAnalysis = vi.fn(() => built);
    const sink = { record: vi.fn() };

    const result = await runCanonicalRuntimeShadow({
      document,
      businessType: "retail",
      summary,
      runtimeDocumentRef: "job_enabled",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      buildAnalysis,
      sink,
    });

    expect(result.status).toBe("completed");
    expect(buildAnalysis).toHaveBeenCalledOnce();
    expect(sink.record).toHaveBeenCalledOnce();
  });

  it("lets approved local worker/UAT runs observe redacted diagnostics through an injected in-memory sink", async () => {
    const diagnostics: unknown[] = [];
    setCanonicalRuntimeShadowDiagnosticSinkForLocalUse({
      record(diagnostic) {
        diagnostics.push(diagnostic);
      },
    });

    try {
      const document = syntheticSummaryDocument();
      await runCanonicalRuntimeShadow({
        document,
        summary: analyzeDocument(document, "retail"),
        businessType: "retail",
        runtimeDocumentRef: "job_local_shadow_observation",
        env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      });
    } finally {
      setCanonicalRuntimeShadowDiagnosticSinkForLocalUse(null);
    }

    expect(diagnostics).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toMatch(/statement\.pdf|\/Users|merchant|account|provider error|rawPrompt|rawResponse/i);
  });

  it("keeps worker-local observation disabled when the flag is absent", async () => {
    const sink = { record: vi.fn() };
    setCanonicalRuntimeShadowDiagnosticSinkForLocalUse(sink);

    try {
      const document = syntheticSummaryDocument();
      await runCanonicalRuntimeShadow({
        document,
        summary: analyzeDocument(document, "retail"),
        businessType: "retail",
        runtimeDocumentRef: "job_local_shadow_disabled",
        env: {},
      });
    } finally {
      setCanonicalRuntimeShadowDiagnosticSinkForLocalUse(null);
    }

    expect(sink.record).not.toHaveBeenCalled();
  });

  it("does not mutate AnalysisSummary or the existing Report V1 DTO", async () => {
    const document = syntheticSummaryDocument();
    const summary = analyzeDocument(document, "retail");
    const beforeSummary = JSON.parse(JSON.stringify(summary));
    const reportBefore = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "report-shadow-invariance",
      generatedAt: "2026-07-27T00:00:00.000Z",
    });

    await runCanonicalRuntimeShadow({
      document,
      businessType: "retail",
      summary,
      runtimeDocumentRef: "job_report_invariance",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
    });

    const reportAfter = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "report-shadow-invariance",
      generatedAt: "2026-07-27T00:00:00.000Z",
    });
    expect(summary).toEqual(beforeSummary);
    expect(reportAfter).toEqual(reportBefore);
  });

  it("does not mutate AI-stage metadata, customer summary, or Report V1 DTO when readiness mapping runs", async () => {
    const document = syntheticSummaryDocument();
    const summary = {
      ...analyzeDocument(document, "retail"),
      fiservFeeAnalysisV2: {
        aiAnomalyReview: {
          status: "no_anomalies",
          attempted: true,
          anomalyCount: 0,
          overrideCount: 0,
          appliedOverrideCount: 0,
          provider: "openai",
          model: "private-model",
        },
        runtimeFeeClassificationReview: {
          type: "runtime_fee_classification_review",
          policyVersion: "canonical_runtime_fee_classification_review_v1",
          status: "not_needed",
          reviewedFeeRowRefs: [],
          suggestions: [],
          absenceProof: "deterministic_absence_proven:material_unresolved_fee_rows",
          limitationCodes: [],
          reasonCodes: ["runtime_fee_classification_reviewed"],
          authoritative: false,
          financialMutationAllowed: false,
          providerDetailsStripped: true,
        },
      },
    };
    const beforeSummary = JSON.parse(JSON.stringify(summary));
    const reportBefore = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "report-shadow-ai-readiness-invariance",
      generatedAt: "2026-07-27T00:00:00.000Z",
    });

    await runCanonicalRuntimeShadow({
      document,
      businessType: "retail",
      summary,
      runtimeDocumentRef: "job_report_ai_readiness_invariance",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
    });

    const reportAfter = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "report-shadow-ai-readiness-invariance",
      generatedAt: "2026-07-27T00:00:00.000Z",
    });
    expect(summary).toEqual(beforeSummary);
    expect(reportAfter).toEqual(reportBefore);
  });

  it("isolates shadow construction and canonical validation failures", async () => {
    const document = syntheticSummaryDocument();
    const summary = analyzeDocument(document, "retail");
    const failing = await runCanonicalRuntimeShadow({
      document,
      businessType: "retail",
      summary,
      runtimeDocumentRef: "job_shadow_failure",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      buildAnalysis: () => {
        throw new Error("network unavailable");
      },
    });
    const validation = await runCanonicalRuntimeShadow({
      document,
      businessType: "retail",
      summary,
      runtimeDocumentRef: "job_validation_failure",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      buildAnalysis: () => {
        throw new Error("Canonical statement analysis validation failed: synthetic failure.");
      },
    });

    expect(failing.status).toBe("shadow_failed");
    expect(validation.status).toBe("canonical_validation_failed");
    expect(validation.diagnostic?.constructionStageReached).toBe("canonical_validation_failed");
    expect(validation.diagnostic?.validationFailureCodes).toEqual(["canonical_validation_failed"]);
    expect(summary).toEqual(analyzeDocument(document, "retail"));
  });

  it("reports safe validation-failure codes and pre-validation construction state", async () => {
    const document = syntheticSummaryDocument();
    const summary = analyzeDocument(document, "retail");
    const built = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_prevalidation_diagnostics",
      legacySummary: summary,
    });
    const invalid = {
      ...built.analysis,
      financialFacts: {
        ...built.analysis.financialFacts,
        processedSales: {
          ...built.analysis.financialFacts.processedSales,
          evidenceRefs: [],
        },
      },
    };
    const result = await runCanonicalRuntimeShadow({
      document,
      businessType: "retail",
      summary,
      runtimeDocumentRef: "job_prevalidation_diagnostics",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      buildAnalysis: () => {
        throw new CanonicalStatementValidationError(
          ["financialFacts.processedSales is selected without evidence or calculation."],
          [],
          invalid,
        );
      },
    });

    expect(result.status).toBe("canonical_validation_failed");
    expect(result.diagnostic?.validationFailureCodes).toEqual(["selected_fact_without_evidence_or_calculation"]);
    expect(result.diagnostic?.constructionStageReached).toBe("canonical_validation_failed");
    expect(result.diagnostic?.preValidationCoreFactAvailability.processedSales).toBe("selected");
    expect(result.diagnostic?.preValidationLedgerStatus).toBe(built.analysis.feeLedger.status);
    expect(JSON.stringify(result.diagnostic)).not.toMatch(/processedSales is selected without evidence/i);
  });

  it("isolates diagnostic sink failures", async () => {
    const result = await runCanonicalRuntimeShadow({
      document: syntheticSummaryDocument(),
      businessType: "retail",
      summary: analyzeDocument(syntheticSummaryDocument(), "retail"),
      runtimeDocumentRef: "job_sink_failure",
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      sink: {
        record() {
          throw new Error("sink unavailable");
        },
      },
    });

    expect(result.status).toBe("completed");
  });

  it("allows merchant contract ownership buckets without losing canonical core or ledger diagnostics", async () => {
    const document = syntheticSummaryDocument();
    const summary = analyzeDocument(document, "retail");

    for (const count of [1, 2, 3]) {
      const result = await runCanonicalRuntimeShadow({
        document,
        businessType: "retail",
        summary,
        runtimeDocumentRef: `job_merchant_contract_bucket_${count}`,
        env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
        buildAnalysis: () => ({
          analysis: analysisWithOwnershipBuckets(document, summary, Array.from({ length: count }, () => "merchant_contract")),
        }),
      });

      expect(result.status).toBe("completed");
      expect(result.diagnostic?.canonicalSummary.ownershipBucketCounts).toContainEqual({ bucket: "merchant_contract", count });
      expect(result.diagnostic?.preValidationCoreFactAvailability.processedSales).toBe("selected");
      expect(result.diagnostic?.preValidationCoreFactAvailability.totalFees).toBe("selected");
      expect(result.diagnostic?.preValidationLedgerStatus).toBe("unavailable");
    }
  });

  it("emits ownership bucket diagnostics independent of input order", async () => {
    const document = syntheticSummaryDocument();
    const summary = analyzeDocument(document, "retail");
    const commonInput = {
      document,
      businessType: "retail" as const,
      summary,
      env: { RATEREVEAL_CANONICAL_SHADOW_ENABLED: "true" },
      now: () => 1,
    };
    const left = await runCanonicalRuntimeShadow({
      ...commonInput,
      runtimeDocumentRef: "job_bucket_order_left",
      buildAnalysis: () => ({ analysis: analysisWithOwnershipBuckets(document, summary, ["processor", "merchant_contract", "processor"]) }),
    });
    const right = await runCanonicalRuntimeShadow({
      ...commonInput,
      runtimeDocumentRef: "job_bucket_order_right",
      buildAnalysis: () => ({ analysis: analysisWithOwnershipBuckets(document, summary, ["processor", "processor", "merchant_contract"]) }),
    });

    expect(left.status).toBe("completed");
    expect(right.status).toBe("completed");
    expect(left.diagnostic?.canonicalSummary.ownershipBucketCounts).toEqual(right.diagnostic?.canonicalSummary.ownershipBucketCounts);
    expect(left.diagnostic?.canonicalSummary.actionabilityBucketCounts).toEqual(right.diagnostic?.canonicalSummary.actionabilityBucketCounts);
  });

  it("does not import persistence or artifact write paths from H1 shadow modules", () => {
    const files = [
      "src/canonical/runtimeAiCapabilityAdapter.ts",
      "src/canonical/runtimeAdapter.ts",
      "src/canonical/runtimeShadow.ts",
      "src/canonical/runtimeShadowComparison.ts",
      "src/canonical/runtimeShadowRedaction.ts",
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toMatch(/better-sqlite3|from "\.\.\/store|from "\.\.\/db|from "\.\.\/accountStore|from "\.\/store|from "\.\/db|accountStore/i);
      expect(source).not.toMatch(/\b(?:writeFile|appendFile|createWriteStream|mkdir|rm|unlink)\b/i);
      expect(source).not.toMatch(/["'](?:artifacts|data\/feeclear|data\/uploads)/i);
    }
  });
});

function syntheticSummaryDocument(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: [
      { content: "SYNTHETIC STATEMENT - NOT REAL MERCHANT DATA", page: "page-1" },
      { content: "Total Amount Submitted | $1,234.56", page: "page-1" },
      { content: "Fees Charged | -$43.21", page: "page-1" },
    ],
    textPreview: "SYNTHETIC STATEMENT Total Amount Submitted $1,234.56 Fees Charged -$43.21",
    extraction: {
      mode: "structured",
      qualityScore: 0.9,
      reasons: ["Synthetic test document."],
      lineCount: 3,
      amountTokenCount: 2,
      hasExtractableText: true,
    },
  };
}

function analysisWithOwnershipBuckets(document: ParsedDocument, summary: ReturnType<typeof analyzeDocument>, buckets: string[]) {
  const built = buildCanonicalRuntimeAnalysis({
    document,
    businessType: "retail",
    runtimeDocumentRef: "job_bucket_analysis",
    legacySummary: summary,
  }).analysis;
  return {
    ...built,
    feeOwnershipActionability: {
      ...built.feeOwnershipActionability,
      rowClassifications: buckets.map((bucket, index) => ({
        feeRowId: `fee_row_${index}`,
        selected: {
          ownership: { economicBeneficiary: bucket },
          actionabilityCeiling: index % 2 === 0 ? "verify_only" : "potentially_actionable",
        },
        candidates: [],
        conflictStatus: "none",
      })),
    },
  } as typeof built;
}
