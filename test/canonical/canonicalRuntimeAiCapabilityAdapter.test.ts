import { describe, expect, it } from "vitest";
import { buildRuntimeAiCapabilityHarnessInputs } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { analyzeDocument } from "../../src/analyzer.js";
import type { CanonicalAiCapabilityOutput } from "../../src/canonical/types.js";
import type { AnalysisSummary } from "../../src/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical runtime AI capability adapter", () => {
  it("maps successful no-issues anomaly review to completed readiness without changing Packages B-E", () => {
    const document = syntheticStatement();
    const baseline = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_baseline",
      legacySummary: summaryWithAi({}),
    }).analysis;
    const ready = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_ready",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "no_anomalies",
          attempted: true,
          anomalyCount: 0,
          overrideCount: 0,
          appliedOverrideCount: 0,
          provider: "openai",
          model: "gpt-private",
          rawError: "provider error should be ignored",
        },
      }),
    }).analysis;

    const anomaly = ready.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!;
    expect(anomaly).toMatchObject({ status: "completed", groundingStatus: "grounded" });
    expect(anomaly.output).toMatchObject({ type: "full_statement_anomaly_review", observations: [] });
    expect(ready.aiCapabilities.summary.financialReadiness).toBe("ready");
    expect(financialProjection(ready)).toEqual(financialProjection(baseline));
    expect(JSON.stringify(ready.aiCapabilities)).not.toMatch(/openai|anthropic|gpt-private|claude|rawError|api.?key|billing/i);
  });

  it("keeps Packages B-E invariant across runtime AI status, provider, and input-order variants", () => {
    const document = syntheticStatement();
    const before = financialProjection(
      buildCanonicalRuntimeAnalysis({
        document,
        businessType: "restaurant_food_beverage",
        runtimeDocumentRef: "job_runtime_ai_invariance_base",
        legacySummary: summaryWithAi({}),
      }).analysis,
    );
    const variants = [
      { status: "disabled", attempted: false },
      { status: "failed", attempted: true, notes: ["stable failure code only"] },
      { status: "failed", attempted: true, notes: ["AI full statement anomaly review timed out after configured timeout."] },
      { status: "timed_out", attempted: true },
      { status: "safety_blocked", attempted: true },
      { status: "unexpected_status", attempted: true },
      { status: "no_anomalies", attempted: true, anomalyCount: 0, overrideCount: 0, appliedOverrideCount: 0, provider: "anthropic" },
      { provider: "openai", appliedOverrideCount: 0, overrideCount: 0, anomalyCount: 1, attempted: true, status: "applied", amountMinor: 999 },
      { appliedOverrideCount: 0, status: "applied", anomalyCount: 1, attempted: true, overrideCount: 0, provider: "anthropic", target: "unsafe" },
    ];

    for (const aiAnomalyReview of variants) {
      const analysis = buildCanonicalRuntimeAnalysis({
        document,
        businessType: "restaurant_food_beverage",
        runtimeDocumentRef: "job_runtime_ai_invariance_variant",
        legacySummary: summaryWithAi({ aiAnomalyReview }),
      }).analysis;
      expect(financialProjection(analysis)).toEqual(before);
    }
  });

  it("maps applied anomaly overrides to safety_blocked without importing the override", () => {
    const analysis = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_override",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "applied",
          attempted: true,
          anomalyCount: 0,
          overrideCount: 1,
          appliedOverrideCount: 1,
          overrides: [{ field: "pricing_model", correctedValue: "interchange_plus", reason: "raw statement text" }],
        },
      }),
    }).analysis;
    const anomaly = analysis.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!;

    expect(anomaly.status).toBe("safety_blocked");
    expect(anomaly.output).toBeNull();
    expect(analysis.aiCapabilities.summary.financialReadiness).toBe("withheld");
    expect(JSON.stringify(analysis)).not.toMatch(/interchange_plus|correctedValue/i);
  });

  it("maps malformed successful anomaly metadata to rejected", () => {
    const analysis = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_invalid",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "no_anomalies",
          attempted: true,
          anomalyCount: "0",
          overrideCount: 0,
          appliedOverrideCount: 0,
        },
      }),
    }).analysis;

    expect(analysis.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!.status).toBe("rejected");
    expect(analysis.aiCapabilities.summary.financialReadiness).toBe("withheld");
  });

  it("ignores inherited runtime fields and rejects contradictory override metadata", () => {
    const inherited = Object.create({
      status: "no_anomalies",
      attempted: true,
      anomalyCount: 0,
      overrideCount: 0,
      appliedOverrideCount: 0,
    });
    const inheritedAnalysis = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_inherited",
      legacySummary: summaryWithAi({ aiAnomalyReview: inherited }),
    }).analysis;
    const contradictory = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_contradictory_override",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "applied",
          attempted: true,
          anomalyCount: 0,
          overrideCount: 0,
          appliedOverrideCount: 1,
        },
      }),
    }).analysis;

    expect(inheritedAnalysis.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!.status).toBe("disabled");
    expect(contradictory.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!.status).toBe("safety_blocked");
    expect(inheritedAnalysis.aiCapabilities.summary.financialReadiness).toBe("withheld");
    expect(contradictory.aiCapabilities.summary.financialReadiness).toBe("withheld");
  });

  it("keeps suggested override metadata non-authoritative and content-free", () => {
    const analysis = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_suggested_override",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "applied",
          attempted: true,
          anomalyCount: 0,
          overrideCount: 2,
          appliedOverrideCount: 0,
          overrides: [
            { correctedValue: "interchange_plus", reason: "raw statement text" },
            { correctedValue: "flat_rate", reason: "private path /Users/example/statement.pdf" },
          ],
        },
      }),
    }).analysis;
    const anomaly = analysis.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!;

    expect(anomaly.status).toBe("completed");
    expect(anomaly.output && "observations" in anomaly.output ? anomaly.output.observations : []).toHaveLength(2);
    expect(JSON.stringify(anomaly)).not.toMatch(/interchange_plus|flat_rate|raw statement text|\/Users|statement\.pdf/i);
  });

  it("requires structured timeout status instead of free-form timeout notes", () => {
    const notedFailure = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_timeout_note",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "failed",
          attempted: true,
          notes: ["AI full statement anomaly review timed out after configured timeout."],
        },
      }),
    }).analysis;
    const explicitTimeout = buildCanonicalRuntimeAnalysis({
      document: syntheticStatement(),
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_ai_timeout_structured",
      legacySummary: summaryWithAi({
        aiAnomalyReview: {
          status: "timed_out",
          attempted: true,
        },
      }),
    }).analysis;

    expect(notedFailure.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!.status).toBe("failed");
    expect(explicitTimeout.aiCapabilities.capabilities.find((capability) => capability.capability === "full_statement_anomaly_review")!.status).toBe("timed_out");
    expect(notedFailure.aiCapabilities.summary.financialReadiness).toBe("withheld");
    expect(explicitTimeout.aiCapabilities.summary.financialReadiness).toBe("withheld");
  });

  it("does not satisfy fee-classification review from legacy sidecar status alone", () => {
    const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
      businessType: "restaurant_food_beverage",
      sourceFileName: "runtime-ai-fee-sidecar.pdf",
    });
    const adapted = buildRuntimeAiCapabilityHarnessInputs({
      analysis,
      summary: summaryWithAi({
        ai: {
          status: "applied",
          unresolvedInputRowCount: 4,
          suggestionCount: 4,
          appliedSuggestionCount: 4,
          skippedSuggestionCount: 0,
        },
      }),
    });

    expect(adapted.harnessInputs.some((input) => input.capability === "fee_classification_review")).toBe(false);
  });

  it("does not allow legacy runtime narrative metadata to self-declare Package F output", () => {
    const document = syntheticStatement();
    const base = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_narrative_base",
      legacySummary: summaryWithAi({
        aiAnomalyReview: completedAnomaly(),
      }),
    }).analysis;
    const narrative = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_runtime_narrative_safe",
      legacySummary: summaryWithAi({
        aiAnomalyReview: completedAnomaly(),
        aiMerchantNarrative: {
          status: "applied",
          attempted: true,
          factCount: 1,
          factsUsed: ["canonical"],
          provider: "openai",
          model: "gpt-private",
          canonicalOutput: safeNarrativeOutput(base.evidence[0]!.id),
        },
      }),
    }).analysis;

    expect(narrative.aiCapabilities.capabilities.find((capability) => capability.capability === "merchant_narrative")!.status).toBe("rejected");
    expect(narrative.aiCapabilities.summary.explanationReadiness).toBe("deterministic_fallback");
    expect(narrative.aiCapabilities.summary.financialReadiness).toBe("ready");
    expect(financialProjection(narrative)).toEqual(financialProjection(base));
    expect(JSON.stringify(narrative.aiCapabilities)).not.toMatch(/openai|gpt-private/i);
  });

  it("rejects unsafe or unavailable narrative output and keeps deterministic fallback", () => {
    for (const aiMerchantNarrative of [
      { status: "failed", attempted: true, notes: ["provider error should not surface"] },
      { status: "applied", attempted: true, factCount: 1, factsUsed: ["canonical"] },
      { status: "applied", attempted: true, factCount: 1, factsUsed: ["canonical"], canonicalOutput: unsafeNarrativeOutput("missing_ev") },
    ]) {
      const analysis = buildCanonicalRuntimeAnalysis({
        document: syntheticStatement(),
        businessType: "restaurant_food_beverage",
        runtimeDocumentRef: "job_runtime_narrative_fallback",
        legacySummary: summaryWithAi({
          aiAnomalyReview: completedAnomaly(),
          aiMerchantNarrative,
        }),
      }).analysis;

      expect(analysis.aiCapabilities.summary.explanationReadiness).toBe("deterministic_fallback");
      expect(JSON.stringify(analysis.aiCapabilities)).not.toMatch(/provider error|missing_ev/i);
    }
  });
});

function financialProjection(analysis: ReturnType<typeof buildCanonicalRuntimeAnalysis>["analysis"]): Record<string, unknown> {
  return {
    processedSales: analysis.financialFacts.processedSales,
    totalFees: analysis.financialFacts.totalFees,
    transactionCounts: analysis.financialFacts.transactionCounts,
    averageTicket: analysis.financialFacts.averageTicket,
    feeLedger: {
      status: analysis.feeLedger.status,
      rows: analysis.feeLedger.rows,
      controls: analysis.feeLedger.controls,
      uniqueChargeTotal: analysis.feeLedger.uniqueChargeTotal,
    },
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
  };
}

function summaryWithAi(fiservFeeAnalysisV2: Record<string, unknown>): AnalysisSummary {
  return {
    ...analyzeDocument(syntheticStatement(), "restaurant_food_beverage"),
    fiservFeeAnalysisV2,
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

function safeNarrativeOutput(evidenceRef: string): CanonicalAiCapabilityOutput {
  return {
    type: "merchant_narrative",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales"],
    limitationCodes: [],
    sections: [
      {
        kind: "verified_facts",
        text: "RateReveal reviewed canonical facts and kept review items separate.",
        factRefs: ["financialFacts.processedSales"],
        evidenceRefs: [evidenceRef],
      },
    ],
  };
}

function unsafeNarrativeOutput(evidenceRef: string): CanonicalAiCapabilityOutput {
  return {
    ...safeNarrativeOutput(evidenceRef),
    sections: [
      {
        kind: "verified_facts",
        text: "You will save $10.",
        factRefs: ["financialFacts.processedSales"],
        evidenceRefs: [evidenceRef],
      },
    ],
  } as CanonicalAiCapabilityOutput;
}

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: Package H Runtime Synthetic",
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
      reasons: ["Synthetic Package H runtime fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}
