import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import { analyzeDocument } from "../../src/analyzer.js";
import type { CanonicalAiCapabilityOutput } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical AI financial invariance", () => {
  it("does not change canonical financial facts or Package E totals when diagnostics change", () => {
    const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
      sourceFileName: "package-f-invariance.pdf",
      businessType: "restaurant_food_beverage",
    });
    const before = financialProjection(analysis);
    const output = groundedAnomalyOutput(analysis.evidence[0]!.id);

    analysis.aiCapabilities = buildCanonicalAiCapabilities({
      ...analysis,
      evidence: analysis.evidence,
      harnessInputs: [
        { capability: "full_statement_anomaly_review", status: "completed", output, executionRef: "ai_exec_aaaaaaaa" },
      ],
    });
    const afterFirstDiagnostic = financialProjection(analysis);

    analysis.aiCapabilities = buildCanonicalAiCapabilities({
      ...analysis,
      evidence: analysis.evidence,
      harnessInputs: [
        { capability: "full_statement_anomaly_review", status: "completed", output, executionRef: "ai_exec_bbbbbbbb" },
      ],
    });
    const afterSecondDiagnostic = financialProjection(analysis);

    expect(afterFirstDiagnostic).toEqual(before);
    expect(afterSecondDiagnostic).toEqual(before);
    expect(JSON.stringify(analysis.aiCapabilities.capabilities)).not.toMatch(/openai|anthropic|claude|gpt/i);
  });

  it("does not mutate Packages B-E when capability order, suggestion order, optional narrative, or required failure states change", () => {
    const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
      sourceFileName: "package-f-invariance-variants.pdf",
      businessType: "restaurant_food_beverage",
    });
    const before = financialProjection(analysis);
    const variants = [
      [{ capability: "full_statement_anomaly_review" as const, status: "failed" as const }],
      [{ capability: "full_statement_anomaly_review" as const, status: "timed_out" as const }],
      [{ capability: "full_statement_anomaly_review" as const, status: "safety_blocked" as const }],
      [{ capability: "document_quality_review" as const, status: "failed" as const }],
      [
        {
          capability: "merchant_narrative" as const,
          status: "completed" as const,
          output: safeNarrativeOutput(analysis.evidence[0]!.id),
        },
      ],
      [
        {
          capability: "merchant_narrative" as const,
          status: "completed" as const,
          output: unsafeNarrativeOutput(analysis.evidence[0]!.id),
        },
      ],
      [
        {
          capability: "fee_classification_review" as const,
          status: "completed" as const,
          output: feeSuggestionOutput(analysis.evidence[0]!.id, ["b", "a"]),
        },
        {
          capability: "full_statement_anomaly_review" as const,
          status: "completed" as const,
          output: groundedAnomalyOutput(analysis.evidence[0]!.id),
        },
      ],
      [
        {
          capability: "full_statement_anomaly_review" as const,
          status: "completed" as const,
          output: groundedAnomalyOutput(analysis.evidence[0]!.id),
        },
        {
          capability: "fee_classification_review" as const,
          status: "completed" as const,
          output: feeSuggestionOutput(analysis.evidence[0]!.id, ["a", "b"]),
        },
      ],
    ];

    for (const harnessInputs of variants) {
      const variant = structuredClone(analysis);
      variant.aiCapabilities = buildCanonicalAiCapabilities({ ...variant, evidence: variant.evidence, harnessInputs });
      expect(financialProjection(variant)).toEqual(before);
    }
  });

  it("does not mutate Packages B-E when runtime AI readiness metadata changes", () => {
    const document = syntheticStatement();
    const base = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_financial_invariance_base",
      legacySummary: runtimeSummary({}),
    }).analysis;
    const before = financialProjection(base);
    const variants = [
      { status: "no_anomalies", attempted: true, anomalyCount: 0, overrideCount: 0, appliedOverrideCount: 0, provider: "openai" },
      { status: "applied", attempted: true, anomalyCount: 2, overrideCount: 0, appliedOverrideCount: 0, provider: "anthropic" },
      { status: "applied", attempted: true, anomalyCount: 0, overrideCount: 1, appliedOverrideCount: 1, overrides: [{ correctedValue: "unsafe" }] },
      { status: "disabled", attempted: false },
      { status: "failed", attempted: true, notes: ["timeout after configured limit"] },
      { status: "malformed", attempted: true },
    ];

    for (const aiAnomalyReview of variants) {
      const analysis = buildCanonicalRuntimeAnalysis({
        document,
        businessType: "restaurant_food_beverage",
        runtimeDocumentRef: "job_runtime_financial_invariance_variant",
        legacySummary: runtimeSummary({ aiAnomalyReview }),
      }).analysis;
      expect(financialProjection(analysis)).toEqual(before);
    }
  });
});

function financialProjection(analysis: ReturnType<typeof buildCanonicalStatementFactsFromParsedDocument>): Record<string, unknown> {
  return {
    processedSales: analysis.financialFacts.processedSales.value,
    totalFees: analysis.financialFacts.totalFees.value,
    allInRate: analysis.financialFacts.rateRevealCalculatedAllInRate.value,
    deterministicEligible: analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount,
    approvedEstimated: analysis.opportunityEngine.summary.approvedEstimatedAnnualAmount,
    verificationOnly: analysis.opportunityEngine.summary.verificationOnlyObservedAmount,
    nonAnnualized: analysis.opportunityEngine.summary.nonAnnualizedObservedAmount,
    componentIds: analysis.opportunityEngine.components.map((component) => component.id),
  };
}

function groundedAnomalyOutput(evidenceRef: string): CanonicalAiCapabilityOutput {
  return {
    type: "full_statement_anomaly_review",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    observations: [
      {
        id: "obs_grounded",
        severity: "info",
        summary: "Diagnostic-only observation.",
        affectedFactRefs: ["financialFacts.processedSales"],
        evidenceRefs: [evidenceRef],
        authoritative: false,
      },
    ],
  };
}

function safeNarrativeOutput(evidenceRef: string): CanonicalAiCapabilityOutput {
  return {
    type: "merchant_narrative",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    sections: [{ kind: "verified_facts", text: "RateReveal reviewed canonical facts and kept review items separate.", factRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef] }],
  };
}

function unsafeNarrativeOutput(evidenceRef: string): CanonicalAiCapabilityOutput {
  return {
    ...safeNarrativeOutput(evidenceRef),
    sections: [{ kind: "verified_facts", text: "You will save $10.", factRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef] }],
  } as CanonicalAiCapabilityOutput;
}

function feeSuggestionOutput(evidenceRef: string, ids: string[]): CanonicalAiCapabilityOutput {
  return {
    type: "fee_classification_review",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: [],
    limitationCodes: [],
    suggestions: ids.map((id) => ({
      feeRowId: "",
      suggestedCategory: "unknown_needs_review",
      confidence: "low",
      reasonCodes: [id],
      safeExplanation: "Diagnostic-only suggestion.",
      authoritative: false,
    })),
  };
}

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: Package F Cafe",
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
      reasons: ["Synthetic Package F fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}

function runtimeSummary(fiservFeeAnalysisV2: Record<string, unknown>) {
  return {
    ...analyzeDocument(syntheticStatement(), "restaurant_food_beverage"),
    fiservFeeAnalysisV2,
  };
}
