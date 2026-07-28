import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { canonicalActualValues, buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { determineAiCapabilityNeeds } from "../../src/canonical/aiCapabilityPolicy.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type { CanonicalAiCapabilityOutput, CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical AI capability boundary", () => {
  it("keeps provider-neutral capability records and withholds financial readiness when required review is unavailable", () => {
    const analysis = packageFAnalysis();

    expect(analysis.aiCapabilities.capabilities.map((record) => record.capability).sort()).toEqual([
      "benchmark_category_review",
      "document_quality_review",
      "fee_classification_review",
      "full_statement_anomaly_review",
      "merchant_narrative",
      "notice_change_review",
    ]);
    expect(analysis.aiCapabilities.capabilities.find((record) => record.capability === "full_statement_anomaly_review")).toMatchObject({
      required: true,
      status: "disabled",
      financialReadinessOnFailure: "withheld",
    });
    expect(analysis.aiCapabilities.summary.financialReadiness).toBe("withheld");
    expect(JSON.stringify(canonicalActualValues(analysis))).not.toMatch(/openai|anthropic|claude|gpt|providerFamily|providerModelRef/i);
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("accepts grounded typed diagnostic output without creating financial authority", () => {
    const analysis = packageFAnalysis();
    const output: CanonicalAiCapabilityOutput = {
      type: "full_statement_anomaly_review",
      authoritative: false,
      evidenceRefs: [analysis.evidence[0]!.id],
      factRefs: ["financialFacts.processedSales", "financialFacts.totalFees"],
      limitationCodes: [],
      observations: [
        {
          id: "obs_1",
          severity: "info",
          summary: "Canonical totals reconcile to the statement-level evidence.",
          affectedFactRefs: ["financialFacts.processedSales", "financialFacts.totalFees"],
          evidenceRefs: [analysis.evidence[0]!.id],
          authoritative: false,
        },
      ],
    };
    analysis.aiCapabilities = buildCanonicalAiCapabilities({
      ...analysis,
      evidence: analysis.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output }],
    });

    expect(analysis.aiCapabilities.summary.financialReadiness).toBe("ready");
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("rejects AI outputs that contain financial-impact or provider-specific fields", () => {
    const analysis = packageFAnalysis();
    const unsafeOutput = {
      type: "full_statement_anomaly_review",
      authoritative: false,
      evidenceRefs: [analysis.evidence[0]!.id],
      factRefs: ["financialFacts.totalFees"],
      limitationCodes: [],
      provider: "openai",
      observations: [
        {
          id: "obs_unsafe",
          severity: "review",
          summary: "Unsupported financial impact.",
          estimatedImpact: 100,
          affectedFactRefs: ["financialFacts.totalFees"],
          evidenceRefs: [analysis.evidence[0]!.id],
          authoritative: false,
        },
      ],
    } as unknown as CanonicalAiCapabilityOutput;
    analysis.aiCapabilities = buildCanonicalAiCapabilities({
      ...analysis,
      evidence: analysis.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: unsafeOutput }],
    });

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/forbidden financial-impact|provider-specific/i);
  });

  it("keeps the directional benchmark category diagnostic-only unless deterministic category evidence exists", () => {
    const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), { sourceFileName: "package-f-unknown-business.pdf" });

    expect(analysis.aiCapabilities.capabilities.find((record) => record.capability === "benchmark_category_review")).toMatchObject({
      required: true,
      status: "disabled",
      financialReadinessOnFailure: "limited",
    });
    expect(analysis.aiCapabilities.summary.financialReadiness).toBe("withheld");
    expect(analysis.aiCapabilities.summary.limitationCodes).toContain("benchmark_category_not_verified");
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("aggregates readiness from the complete v1 status matrix without depending on input order", () => {
    const ready = packageFAnalysis();
    ready.aiCapabilities = buildCanonicalAiCapabilities({
      ...ready,
      evidence: ready.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", ready) }],
    });
    expect(ready.aiCapabilities.summary.financialReadiness).toBe("ready");

    for (const status of ["failed", "timed_out", "disabled", "safety_blocked"] as const) {
      const analysis = packageFAnalysis();
      analysis.aiCapabilities = buildCanonicalAiCapabilities({
        ...analysis,
        evidence: analysis.evidence,
        harnessInputs: [{ capability: "full_statement_anomaly_review", status }],
      });
      expect(analysis.aiCapabilities.summary.financialReadiness, status).toBe("withheld");
    }

    const invalidOutput = packageFAnalysis();
    invalidOutput.aiCapabilities = buildCanonicalAiCapabilities({
      ...invalidOutput,
      evidence: invalidOutput.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: { ...outputForCapability("full_statement_anomaly_review", invalidOutput), impactUsd: 1 } as any }],
    });
    expect(invalidOutput.aiCapabilities.summary.financialReadiness).toBe("withheld");

    const unknownBenchmark = buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), { sourceFileName: "package-f-benchmark-limited.pdf" });
    unknownBenchmark.aiCapabilities = buildCanonicalAiCapabilities({
      ...unknownBenchmark,
      evidence: unknownBenchmark.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", unknownBenchmark) }],
    });
    expect(unknownBenchmark.aiCapabilities.summary.financialReadiness).toBe("limited");

    const notice = buildCanonicalStatementFactsFromParsedDocument(syntheticNoticeStatement(), {
      sourceFileName: "package-f-notice-limited.pdf",
      businessType: "restaurant",
    });
    notice.evidence[0]!.normalizedText = `${notice.evidence[0]!.normalizedText ?? ""} Important Notice: service terms may change.`;
    notice.aiCapabilities = buildCanonicalAiCapabilities({
      ...notice,
      evidence: notice.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", notice) }],
    });
    expect(notice.aiCapabilities.summary.financialReadiness).toBe("limited");

    const optionalFailure = packageFAnalysis();
    optionalFailure.aiCapabilities = buildCanonicalAiCapabilities({
      ...optionalFailure,
      evidence: optionalFailure.evidence,
      harnessInputs: [
        { capability: "document_quality_review", status: "failed" },
        { capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", optionalFailure) },
      ],
    });
    expect(optionalFailure.aiCapabilities.summary.financialReadiness).toBe("ready");

    const duplicateOutcomes = packageFAnalysis();
    duplicateOutcomes.aiCapabilities = buildCanonicalAiCapabilities({
      ...duplicateOutcomes,
      evidence: duplicateOutcomes.evidence,
      harnessInputs: [
        { capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", duplicateOutcomes) },
        { capability: "full_statement_anomaly_review", status: "failed" },
      ],
    });
    expect(duplicateOutcomes.aiCapabilities.summary.financialReadiness).toBe("withheld");

    const firstOrder = packageFAnalysis();
    firstOrder.aiCapabilities = buildCanonicalAiCapabilities({
      ...firstOrder,
      evidence: firstOrder.evidence,
      harnessInputs: [
        { capability: "merchant_narrative", status: "completed", output: outputForCapability("merchant_narrative", firstOrder) },
        { capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", firstOrder) },
      ],
    });
    const secondOrder = packageFAnalysis();
    secondOrder.aiCapabilities = buildCanonicalAiCapabilities({
      ...secondOrder,
      evidence: secondOrder.evidence,
      harnessInputs: [
        { capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", secondOrder) },
        { capability: "merchant_narrative", status: "completed", output: outputForCapability("merchant_narrative", secondOrder) },
      ],
    });
    expect(firstOrder.aiCapabilities.summary).toEqual(secondOrder.aiCapabilities.summary);
  });

  it("rejects incomplete, duplicated, spoofed, or malformed capability records", () => {
    const cases: Array<[string, (analysis: CanonicalStatementAnalysis) => void, RegExp]> = [
      [
        "duplicate record id",
        (analysis) => {
          analysis.aiCapabilities.capabilities[1]!.id = analysis.aiCapabilities.capabilities[0]!.id;
        },
        /duplicate capability record id/i,
      ],
      [
        "duplicate capability result",
        (analysis) => {
          analysis.aiCapabilities.capabilities.push({ ...analysis.aiCapabilities.capabilities[0]!, id: "ai_capability_duplicate" });
        },
        /duplicate capability records/i,
      ],
      [
        "missing required capability",
        (analysis) => {
          analysis.aiCapabilities.capabilities = analysis.aiCapabilities.capabilities.filter((record) => record.capability !== "full_statement_anomaly_review");
        },
        /capability full_statement_anomaly_review is missing/i,
      ],
      [
        "unsupported capability",
        (analysis) => {
          (analysis.aiCapabilities.capabilities[0] as any).capability = "unsupported_capability";
        },
        /unsupported/i,
      ],
      [
        "unsupported status",
        (analysis) => {
          (analysis.aiCapabilities.capabilities[0] as any).status = "finished";
        },
        /unsupported status/i,
      ],
      [
        "required marked optional",
        (analysis) => {
          analysis.aiCapabilities.capabilities.find((record) => record.capability === "full_statement_anomaly_review")!.required = false;
        },
        /incorrect required flag/i,
      ],
      [
        "optional marked required",
        (analysis) => {
          analysis.aiCapabilities.capabilities.find((record) => record.capability === "document_quality_review")!.required = true;
        },
        /incorrect required flag/i,
      ],
      [
        "not_needed with trigger present",
        (analysis) => {
          const record = analysis.aiCapabilities.capabilities.find((item) => item.capability === "full_statement_anomaly_review")!;
          record.status = "not_needed";
          record.trigger.absenceProof = "Incorrectly suppressed required review.";
        },
        /not_needed when trigger evidence is present/i,
      ],
      [
        "completed without output",
        (analysis) => {
          const record = analysis.aiCapabilities.capabilities.find((item) => item.capability === "full_statement_anomaly_review")!;
          record.status = "completed";
          record.output = null;
        },
        /completed without valid typed output/i,
      ],
      [
        "failed with output",
        (analysis) => {
          analysis.aiCapabilities = buildCanonicalAiCapabilities({
            ...analysis,
            evidence: analysis.evidence,
            harnessInputs: [{ capability: "full_statement_anomaly_review", status: "completed", output: outputForCapability("full_statement_anomaly_review", analysis) }],
          });
          analysis.aiCapabilities.capabilities.find((item) => item.capability === "full_statement_anomaly_review")!.status = "failed";
        },
        /unsuccessful status carrying output/i,
      ],
      [
        "broken independent review ref",
        (analysis) => {
          analysis.aiCapabilities.capabilities[0]!.independentReviewRefs = ["missing_review_ref"];
        },
        /broken independent-review reference/i,
      ],
      [
        "malformed execution ref",
        (analysis) => {
          analysis.aiCapabilities.capabilities[0]!.executionRef = "openai-model-ref";
        },
        /malformed or non-opaque executionRef|provider-specific/i,
      ],
      [
        "internal diagnostics attached",
        (analysis) => {
          (analysis.aiCapabilities as any).internalDiagnostics = [];
        },
        /internal diagnostic records must not be attached/i,
      ],
    ];

    for (const [label, mutate, pattern] of cases) {
      const analysis = packageFAnalysis();
      mutate(analysis);
      expect(() => validateCanonicalStatementAnalysis(analysis), label).toThrow(pattern);
    }
  });

  it("rejects forbidden or unknown fields for every capability-specific output", () => {
    const capabilities = [
      "full_statement_anomaly_review",
      "fee_classification_review",
      "notice_change_review",
      "benchmark_category_review",
      "merchant_narrative",
      "document_quality_review",
    ] as const;
    const forbiddenKeys = [
      "impactUsd",
      "savings",
      "annualizedAmount",
      "observedAmount",
      "target",
      "cadence",
      "ownership",
      "actionability",
      "calculation",
      "formula",
      "eligibility",
      "reportState",
      "pricingModelOverride",
      "parserDecisionOverride",
      "appliedParserDecisionOverride",
    ];

    for (const capability of capabilities) {
      const topLevel = outputForCapability(capability, packageFAnalysis()) as any;
      topLevel.unexpected = true;
      expectOutputRejected(capability, topLevel, /unknown field unexpected/i);

      const nested = outputForCapability(capability, packageFAnalysis()) as any;
      nested.extra = { arbitrary: { impactUsd: 100 } };
      expectOutputRejected(capability, nested, /unknown field extra|forbidden financial-impact/i);

      for (const key of forbiddenKeys) {
        const output = outputForCapability(capability, packageFAnalysis()) as any;
        output[key] = key === "cadence" ? "monthly" : "unsafe";
        expectOutputRejected(capability, output, /forbidden financial-impact|unknown field/i);
      }
    }
  });

  it("applies conditional materiality v1 to unresolved fee-classification needs", () => {
    const analysis = packageFAnalysis();
    const zeroDollar = feeClassificationNeed(analysis, 0, "unknown_needs_review", "unknown");
    expect(zeroDollar.required).toBe(false);
    expect(zeroDollar.failureFinancialReadiness).toBe("ready");

    const nonzeroUnknownCategory = feeClassificationNeed(analysis, 500, "unknown_needs_review", "unknown");
    expect(nonzeroUnknownCategory.required).toBe(true);
    expect(nonzeroUnknownCategory.failureFinancialReadiness).toBe("limited");

    const nonzeroUnresolvedOwnership = feeClassificationNeed(analysis, 500, "processor_markup", "unknown");
    expect(nonzeroUnresolvedOwnership.required).toBe(true);
    expect(nonzeroUnresolvedOwnership.failureFinancialReadiness).toBe("limited");
  });
});

function packageFAnalysis(): CanonicalStatementAnalysis {
  return buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
    sourceFileName: "package-f.pdf",
    businessType: "restaurant",
  });
}

function expectOutputRejected(capability: CanonicalAiCapabilityOutput["type"], output: CanonicalAiCapabilityOutput, pattern: RegExp): void {
  const analysis = packageFAnalysis();
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    ...analysis,
    evidence: analysis.evidence,
    harnessInputs: [{ capability, status: "completed", output }],
  });
  expect(() => validateCanonicalStatementAnalysis(analysis), capability).toThrow(pattern);
}

function outputForCapability(capability: CanonicalAiCapabilityOutput["type"], analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]!.id;
  if (capability === "full_statement_anomaly_review") {
    return {
      type: capability,
      authoritative: false,
      evidenceRefs: [evidenceRef],
      factRefs: ["financialFacts.processedSales"],
      limitationCodes: [],
      observations: [{ id: "obs_1", severity: "info", summary: "Grounded diagnostic observation.", affectedFactRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef], authoritative: false }],
    };
  }
  if (capability === "fee_classification_review") {
    return { type: capability, authoritative: false, evidenceRefs: [evidenceRef], factRefs: [], limitationCodes: [], suggestions: [] };
  }
  if (capability === "notice_change_review") {
    return {
      type: capability,
      authoritative: false,
      evidenceRefs: [evidenceRef],
      factRefs: [],
      limitationCodes: [],
      noticeSuggestions: [{ id: "notice_1", noticeEvidenceRef: evidenceRef, safeSummary: "Notice text needs review.", observedTextRefs: [evidenceRef], authoritative: false }],
    };
  }
  if (capability === "benchmark_category_review") {
    return { type: capability, authoritative: false, evidenceRefs: [evidenceRef], factRefs: [], limitationCodes: [], suggestions: [{ categoryId: "restaurant", confidence: "low", evidenceRefs: [evidenceRef], limitationCodes: ["benchmark_category_not_verified"], authoritative: false }] };
  }
  if (capability === "merchant_narrative") {
    return {
      type: capability,
      authoritative: false,
      evidenceRefs: [evidenceRef],
      factRefs: ["financialFacts.processedSales"],
      limitationCodes: [],
      sections: [{ kind: "verified_facts", text: "RateReveal reviewed the canonical facts and kept review items separate.", factRefs: ["financialFacts.processedSales"], evidenceRefs: [evidenceRef] }],
    };
  }
  return { type: capability, authoritative: false, evidenceRefs: [evidenceRef], factRefs: [], limitationCodes: [], observations: [{ id: "quality_1", summary: "Document quality diagnostic only.", evidenceRefs: [evidenceRef], authoritative: false }] };
}

function feeClassificationNeed(
  analysis: CanonicalStatementAnalysis,
  amountMinor: number,
  category: string,
  economicBeneficiary: string,
): ReturnType<typeof determineAiCapabilityNeeds>[number] {
  const evidenceRef = analysis.evidence[0]!.id;
  const feeLedger = {
    ...analysis.feeLedger,
    sourceOccurrences: [{ id: "occ_materiality", evidenceRef }],
    rows: [
      {
        id: "fee_materiality",
        role: "individual_charge",
        sourceOccurrenceIds: ["occ_materiality"],
        parserInterpretationIds: [],
        selectedLabel: "Unresolved Fee",
        selectedAmount: { amountMinor, currency: "USD" },
        signedAmount: { amountMinor: -amountMinor, currency: "USD" },
        contributesToUniqueTotal: true,
        mergeReason: null,
        mergeConfidence: "high",
        rejectedAmountCandidates: [],
        limitations: [],
      },
    ],
  } as any;
  const selected = {
    candidateId: "cand_materiality",
    category,
    ownership: { collector: "processor", economicBeneficiary, contractualController: "unknown" },
    actionabilityCeiling: economicBeneficiary === "unknown" ? "unknown" : "verify_only",
    documentationRequirement: "blocking",
    confidence: "low",
    selectionReason: "Synthetic materiality policy check.",
    rejectedCandidateIds: [],
  };
  const feeOwnershipActionability = {
    ...analysis.feeOwnershipActionability,
    rowClassifications: [
      {
        feeRowId: "fee_materiality",
        selected,
        candidates: [
          {
            ...selected,
            id: "cand_materiality",
            feeRowId: "fee_materiality",
            sourceType: "safe_default",
            ruleId: "synthetic_materiality",
            ruleVersion: "1",
            ruleProvenance: "Synthetic materiality policy check.",
            evidenceRefs: [evidenceRef],
            reference: null,
            authoritative: false,
            reason: "Synthetic materiality policy check.",
            permissionConsequences: [],
            limitations: [],
          },
        ],
        conflictStatus: "unresolved",
        conflictReason: "Synthetic unresolved classification.",
      },
    ],
  } as any;
  return determineAiCapabilityNeeds({
    identity: analysis.identity,
    feeLedger,
    feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidenceText: [],
  }).find((need) => need.capability === "fee_classification_review")!;
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

function syntheticNoticeStatement(): ParsedDocument {
  const doc = syntheticStatement();
  const notice = "Important Notice: service terms may change after this statement.";
  doc.rows = [...doc.rows, { content: notice, page: "page-1" }];
  doc.textPreview = `${doc.textPreview}\n${notice}`;
  return doc;
}
