import { describe, expect, it } from "vitest";
import {
  buildCanonicalRuntimeAnalysis,
  canonicalRuntimeInputAdmissionTable,
  opaqueRuntimeRef,
} from "../../src/canonical/runtimeAdapter.js";
import { analyzeDocument } from "../../src/analyzer.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical runtime adapter", () => {
  it("keeps the explicit H1 input-admission table conservative", () => {
    const table = canonicalRuntimeInputAdmissionTable();

    expect(table.find((row) => row.input === "parsed_document_rows_and_extraction_diagnostics")?.status).toBe("canonical_evidence");
    expect(table.find((row) => row.input === "runtime_business_type")?.status).toBe("provisional_with_limitation");
    expect(table.find((row) => row.input === "legacy_core_totals")?.status).toBe("diagnostic_only");

    for (const rejected of [
      "legacy_savings_totals",
      "fiserv_master_savings",
      "legacy_structured_findings",
      "legacy_processor_hidden_markup_amounts",
      "legacy_benchmark_savings",
      "ai_generated_amounts",
      "report_v1_totals_or_state",
      "visible_string_amounts",
      "fee_breakdown_aliases_without_canonical_source_identity",
    ]) {
      expect(table.find((row) => row.input === rejected)?.status, rejected).toBe("rejected");
    }

    expect(table.find((row) => row.input === "approved_package_e_runtime_opportunity_inputs")?.status).toBe("unavailable");
  });

  it("builds canonical analysis from cloned runtime evidence without admitting legacy savings", () => {
    const document = syntheticSummaryDocument();
    const legacySummary = {
      ...analyzeDocument(document, "retail"),
      estimatedAnnualSavings: 9999,
      savingsOpportunities: [{ title: "Legacy savings", detail: "Legacy only", impactUsd: 9999 }],
    };
    const beforeDocument = JSON.parse(JSON.stringify(document));
    const beforeSummary = JSON.parse(JSON.stringify(legacySummary));

    const result = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_safe_shadow_ref",
      legacySummary,
    });

    expect(document).toEqual(beforeDocument);
    expect(legacySummary).toEqual(beforeSummary);
    expect(result.analysis.sourceAnalysisId).toBe("job_safe_shadow_ref");
    expect(result.analysis.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
    expect(result.analysis.opportunityEngine.summary.masterSavingsAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
    expect(JSON.stringify(result.analysis)).not.toContain("9999");
  });

  it("does not use filenames, paths, or malformed refs as canonical runtime identity", () => {
    expect(opaqueRuntimeRef("statement.pdf")).toBe("runtime_document_unknown");
    expect(opaqueRuntimeRef("/Users/example/uploads/statement.pdf")).toBe("runtime_document_unknown");
    expect(opaqueRuntimeRef("abcdef0123456789abcdef0123456789")).toBe("runtime_document_unknown");
    expect(opaqueRuntimeRef("merchant_12345")).toBe("runtime_document_unknown");
    expect(opaqueRuntimeRef("job_123456")).toBe("job_123456");
  });

  it("degrades unsupported processor patterns conservatively without eligible opportunity", () => {
    for (const document of [syntheticSummaryDocument(), unsupportedCsvDocument()]) {
      const result = buildCanonicalRuntimeAnalysis({
        document,
        businessType: "professional_services",
        runtimeDocumentRef: `job_${document.sourceType}_unsupported`,
        legacySummary: analyzeDocument(document, "professional_services"),
      });

      expect(result.analysis.validation.status).toBe("valid");
      expect(result.analysis.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
    }
  });

  it("keeps statement-frequency and unknown-cadence amounts out of canonical annual totals in H1", () => {
    const result = buildCanonicalRuntimeAnalysis({
      document: syntheticSummaryDocument(),
      businessType: "other",
      runtimeDocumentRef: "job_cadence_shadow",
      legacySummary: analyzeDocument(syntheticSummaryDocument(), "other"),
    });

    expect(result.analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
    expect(result.analysis.opportunityEngine.summary.approvedEstimatedAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
    expect(result.analysis.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
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

function unsupportedCsvDocument(): ParsedDocument {
  return {
    ...syntheticSummaryDocument(),
    sourceType: "csv",
    headers: ["label", "amount"],
    rows: [
      { content: "Total Amount Submitted | $2,000.00", label: "Total Amount Submitted", amount: 2000 },
      { content: "Fees Charged | -$50.00", label: "Fees Charged", amount: -50 },
      { content: "Independent Processor Service Fee | -$10.00", label: "Independent Processor Service Fee", amount: -10 },
    ],
    textPreview: "Unsupported CSV processor totals",
  };
}
