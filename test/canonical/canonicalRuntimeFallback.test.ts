import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  runCanonicalRuntimeShadow,
  setCanonicalRuntimeShadowDiagnosticSinkForLocalUse,
} from "../../src/canonical/runtimeShadow.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
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
    expect(summary).toEqual(analyzeDocument(document, "retail"));
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

  it("does not import persistence or artifact write paths from H1 shadow modules", () => {
    const files = [
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
