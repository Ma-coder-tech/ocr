import { describe, expect, it } from "vitest";
import { compareCanonicalToLegacy } from "../../src/canonical/runtimeShadowComparison.js";
import {
  assertRedactedCanonicalShadowDiagnostic,
  findSensitiveDiagnosticPath,
  type RedactedCanonicalShadowDiagnostic,
} from "../../src/canonical/runtimeShadowRedaction.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import { analyzeDocument } from "../../src/analyzer.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical runtime shadow comparison and redaction", () => {
  it("classifies deterministic structural differences independent of legacy input order", () => {
    const document = syntheticSummaryDocument();
    const canonical = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_order_independent",
      legacySummary: analyzeDocument(document, "retail"),
    }).analysis;
    const left = {
      ...analyzeDocument(document, "retail"),
      feeBreakdown: [
        { label: "Processor Fee", amount: 10, sharePct: 50 },
        { label: "Network Fee", amount: 10, sharePct: 50 },
      ],
    };
    const right = {
      ...left,
      feeBreakdown: [...left.feeBreakdown].reverse(),
    };

    expect(compareCanonicalToLegacy({ canonical, legacy: left })).toEqual(compareCanonicalToLegacy({ canonical, legacy: right }));
  });

  it("does not treat legacy output as ground truth when canonical core totals are unavailable", () => {
    const legacy = analyzeDocument(syntheticSummaryDocument(), "retail");
    const canonical = buildCanonicalRuntimeAnalysis({
      document: {
        ...syntheticSummaryDocument(),
        rows: [{ content: "SYNTHETIC STATEMENT - NOT REAL MERCHANT DATA", page: "page-1" }],
        textPreview: "SYNTHETIC STATEMENT",
      },
      businessType: "retail",
      runtimeDocumentRef: "job_unavailable_core",
      legacySummary: legacy,
    }).analysis;
    const comparison = compareCanonicalToLegacy({ canonical, legacy });

    const coreDifferences = comparison.differences.filter((difference) => difference.key.startsWith("core."));
    expect(coreDifferences.length).toBeGreaterThan(0);
    expect(coreDifferences.every((difference) => difference.category === "requires_human_review")).toBe(true);
    expect(comparison.categories.canonical_regression).toBe(0);
  });

  it("classifies known duplicated legacy fee aliases without duplicating canonical charges", () => {
    const document = syntheticSummaryDocument();
    const canonical = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_duplicate_aliases",
      legacySummary: analyzeDocument(document, "retail"),
    }).analysis;
    const legacy = {
      ...analyzeDocument(document, "retail"),
      feeBreakdown: [
        { label: "Monthly Service Fee", amount: 10, sharePct: 50 },
        { label: "Monthly Service Fee", amount: 10, sharePct: 50 },
      ],
    };

    const duplicate = compareCanonicalToLegacy({ canonical, legacy }).differences.find(
      (difference) => difference.key === "fees.duplicate_legacy_aliases",
    );
    expect(duplicate?.category).toBe("known_legacy_defect");
    expect(duplicate?.reasonCode).toBe("duplicate_legacy_fee_aliases_detected");
  });

  it("keeps legacy savings, AI amounts, and master estimates out of canonical comparison totals", () => {
    const document = syntheticSummaryDocument();
    const legacy = {
      ...analyzeDocument(document, "retail"),
      estimatedAnnualSavings: 12000,
      fiservFeeAnalysisV2: {
        estimatedAnnualSavings: { estimated: 12000, components: [{ label: "AI", annualImpact: 12000 }] },
        ai: { status: "completed", amount: 12000 },
      },
      structuredFeeFindings: [
        {
          kind: "pci_non_compliance" as const,
          label: "PCI",
          amountUsd: 100,
          ratePercent: null,
          affectedVolumeUsd: null,
          estimatedImpactUsd: 1200,
          sourceSection: "Synthetic",
          evidenceLine: "Synthetic PCI",
          rowIndex: 0,
          confidence: 0.9,
        },
      ],
    };
    const canonical = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_legacy_rejected",
      legacySummary: legacy,
    }).analysis;
    const comparison = compareCanonicalToLegacy({ canonical, legacy });

    expect(canonical.opportunityEngine.summary.totalEligibleAnnualAmount.amountMinor).toBe(0);
    expect(comparison.differences.some((difference) => difference.reasonCode === "legacy_savings_not_admitted_to_canonical_total")).toBe(true);
    expect(JSON.stringify(comparison)).not.toContain("AI");
    expect(JSON.stringify(comparison)).not.toContain("PCI");
  });

  it("rejects sensitive keys and nested sensitive values", () => {
    expect(findSensitiveDiagnosticPath({ nested: { merchantName: "Example" } })).toBe("diagnostic.nested.merchantName");
    expect(findSensitiveDiagnosticPath({ nested: { merchant_name: "Example" } })).toBe("diagnostic.nested.merchant_name");
    expect(findSensitiveDiagnosticPath({ nested: { merchantId: "m_123" } })).toBe("diagnostic.nested.merchantId");
    expect(findSensitiveDiagnosticPath({ nested: { merchant_id: "m_123" } })).toBe("diagnostic.nested.merchant_id");
    expect(findSensitiveDiagnosticPath({ nested: { merchantNumber: "12345678" } })).toBe("diagnostic.nested.merchantNumber");
    expect(findSensitiveDiagnosticPath({ nested: { merchant_account: "12345678" } })).toBe("diagnostic.nested.merchant_account");
    expect(findSensitiveDiagnosticPath({ nested: { value: "/Users/example/uploads/statement.pdf" } })).toBe("diagnostic.nested.value");
    expect(findSensitiveDiagnosticPath({ nested: { value: "abcdef0123456789abcdef0123456789" } })).toBe("diagnostic.nested.value");
    expect(findSensitiveDiagnosticPath({ nested: { value: "raw statement text: total fees" } })).toBe("diagnostic.nested.value");
    expect(findSensitiveDiagnosticPath({ nested: { value: "merchant contract: customer-specific note" } })).toBe("diagnostic.nested.value");
    expect(findSensitiveDiagnosticPath({ nested: { value: "merchant_contract" } })).toBe("diagnostic.nested.value");
    expect(findSensitiveDiagnosticPath({ nested: [{ response: "synthetic" }] })).toBe("diagnostic.nested[0].response");
    expect(findSensitiveDiagnosticPath({ nested: [new Error("provider error: account 12345678")] })).toBe("diagnostic.nested[0].message");
  });

  it("accepts merchant_contract only as an ownership bucket value in the typed diagnostic field", () => {
    const diagnostic = minimalDiagnostic();
    diagnostic.canonicalSummary.ownershipBucketCounts = [{ bucket: "merchant_contract", count: 12 }];

    expect(assertRedactedCanonicalShadowDiagnostic(diagnostic)).toEqual(diagnostic);
    expect(findSensitiveDiagnosticPath({ canonicalSummary: { ownershipBucketCounts: [{ bucket: "merchant_contract", count: 12 }] } })).toBeNull();
    expect(findSensitiveDiagnosticPath({ canonicalSummary: { actionabilityBucketCounts: [{ bucket: "merchant_contract", count: 12 }] } })).toBe(
      "diagnostic.canonicalSummary.actionabilityBucketCounts[0].bucket",
    );
    expect(findSensitiveDiagnosticPath({ canonicalSummary: { ownershipBucketCounts: { merchant_contract: 12 } } })).toBe(
      "diagnostic.canonicalSummary.ownershipBucketCounts.merchant_contract",
    );
  });

  it("accepts only redacted diagnostic payloads", () => {
    const diagnostic = minimalDiagnostic();
    expect(assertRedactedCanonicalShadowDiagnostic(diagnostic)).toEqual(diagnostic);
    expect(() =>
      assertRedactedCanonicalShadowDiagnostic({
        ...diagnostic,
        comparison: {
          ...diagnostic.comparison,
          differences: [
            {
              key: "bad",
              category: "requires_human_review",
              reasonCode: "bad_sensitive_value",
              legacy: "merchant account 12345678",
              canonical: "unavailable",
            },
          ],
        },
      }),
    ).toThrow(/redaction validation/i);
  });
});

function minimalDiagnostic(): RedactedCanonicalShadowDiagnostic {
  return {
    schemaVersion: "canonical_shadow_diagnostic_v1",
    policyVersion: "canonical_runtime_shadow_policy_v1",
    status: "completed",
    runtimeDocumentRef: "job_safe",
    durationMs: 1,
    sourceType: "pdf",
    businessTypeProvided: true,
    constructionStageReached: "canonical_analysis_validated",
    validationFailureCodes: [],
    preValidationCoreFactAvailability: {
      processedSales: "selected",
      totalFees: "selected",
      statementPeriod: "selected",
      effectiveRate: "selected",
      transactionCount: "unavailable",
      averageTicket: "unavailable",
    },
    preValidationLedgerStatus: "available",
    inputAdmission: [{ input: "legacy_savings_totals", status: "rejected", reasonCode: "legacy_savings_rejected" }],
    canonicalSummary: {
      validationStatus: "valid",
      readinessStatus: "financially_ready",
      warningCount: 0,
      errorCount: 0,
      primaryState: "verified_benchmark_unavailable",
      feeRowCount: 0,
      uniqueFeeRowCount: 0,
      duplicateRepresentationCount: 0,
      ownershipBucketCounts: [],
      actionabilityBucketCounts: [],
      opportunityTotals: {
        deterministicEligibleAnnual: { amountMinor: 0, currency: "USD", purpose: "deterministic_eligible_annual" },
        approvedEstimatedAnnual: { amountMinor: 0, currency: "USD", purpose: "approved_estimated_annual" },
        verificationOnlyObserved: { amountMinor: 0, currency: "USD", purpose: "verification_only_observed" },
        excludedObserved: { amountMinor: 0, currency: "USD", purpose: "excluded_observed" },
        nonAnnualizedObserved: { amountMinor: 0, currency: "USD", purpose: "non_annualized_observed" },
      },
      benchmarkStatus: "unavailable",
      benchmarkPosition: "unavailable",
      permissionDecisionCounts: { permitted: 1, denied: 10 },
      actionGuidanceTypeCounts: {},
      explanationReadiness: "deterministic_fallback",
    },
    comparison: {
      categories: { expected_improvement: 0, known_legacy_defect: 0, canonical_regression: 0, requires_human_review: 0 },
      differences: [],
    },
  };
}

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
