import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { validateCanonicalAiCapabilityLayer } from "../../src/canonical/aiCapabilityValidation.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildRuntimeAiCapabilityHarnessInputs } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import {
  buildCanonicalRuntimeFeeClassificationReviewPacket,
  validateCanonicalRuntimeFeeClassificationReview,
  type CanonicalRuntimeFeeClassificationReviewPacket,
} from "../../src/canonical/runtimeFeeClassificationReview.js";
import type {
  CanonicalFeeClassificationResolution,
  CanonicalFeeRow,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { AnalysisSummary } from "../../src/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical runtime fee classification review", () => {
  it("accepts exact canonical fee-row and evidence refs without making suggestions authoritative", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    const review = validReview(packet, "completed_with_diagnostic_suggestions");
    const result = validateCanonicalRuntimeFeeClassificationReview(review, analysis);

    expect(result.ok).toBe(true);
    expect(result.review).toMatchObject({
      status: "completed_with_diagnostic_suggestions",
      absenceProof: null,
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    });
    expect(result.review.reviewedFeeRowRefs).toEqual(packet.materialFeeRowRefs);
    expect(result.review.suggestions).toHaveLength(packet.materialFeeRowRefs.length);
    expect(result.review.suggestions.every((suggestion) => suggestion.authoritative === false)).toBe(true);
  });

  it("rejects unknown rows, evidence refs from another row, and mismatched Package D candidate refs", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    const [first, second] = packet.materialFeeRowRefs;
    const cases = [
      {
        ...validReview(packet, "completed_with_diagnostic_suggestions"),
        reviewedFeeRowRefs: [...packet.materialFeeRowRefs, "feerow_unknown"],
      },
      {
        ...validReview(packet, "completed_with_diagnostic_suggestions"),
        suggestions: [
          {
            ...validReview(packet, "completed_with_diagnostic_suggestions").suggestions[0]!,
            evidenceRefs: packet.evidenceRefsByFeeRowRef[second]!,
          },
        ],
      },
      {
        ...validReview(packet, "completed_with_diagnostic_suggestions"),
        suggestions: [
          {
            ...validReview(packet, "completed_with_diagnostic_suggestions").suggestions[0]!,
            currentClassificationCandidateRef: packet.classificationCandidateRefsByFeeRowRef[second]![0]!,
          },
        ],
      },
      {
        ...validReview(packet, "completed_with_diagnostic_suggestions"),
        suggestions: [
          {
            ...validReview(packet, "completed_with_diagnostic_suggestions").suggestions[0]!,
            feeRowRef: first,
            evidenceRefs: packet.evidenceRefsByFeeRowRef[first]!,
            currentClassificationCandidateRef: "candidate_invented",
          },
        ],
      },
    ];

    for (const review of cases) {
      const result = validateCanonicalRuntimeFeeClassificationReview(review, analysis);
      expect(result.ok).toBe(false);
      expect(result.review.status).toBe("rejected");
      expect(result.review.suggestions).toEqual([]);
    }
  });

  it("rejects duplicate and conflicting suggestions and rows outside the supplied packet", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    const suggestion = validReview(packet, "completed_with_diagnostic_suggestions").suggestions[0]!;
    const duplicate = {
      ...validReview(packet, "completed_with_diagnostic_suggestions"),
      reviewedFeeRowRefs: [packet.materialFeeRowRefs[0]!, packet.materialFeeRowRefs[0]!],
      suggestions: [suggestion, suggestion],
    };
    const conflicting = {
      ...validReview(packet, "completed_with_diagnostic_suggestions"),
      suggestions: [{ ...suggestion, suggestedCategory: "administrative_fee" }, { ...suggestion, suggestedCategory: "processor_markup" }],
    };
    const outsidePopulation = {
      ...validReview(packet, "completed_with_diagnostic_suggestions"),
      suggestions: [{ ...suggestion, feeRowRef: "feerow_outside_packet" }],
    };

    for (const review of [duplicate, conflicting, outsidePopulation]) {
      expect(validateCanonicalRuntimeFeeClassificationReview(review, analysis).ok).toBe(false);
    }
  });

  it("normalizes reviewed row and suggestion order deterministically", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    const left = validReview(packet, "completed_with_diagnostic_suggestions");
    const right = { ...left, suggestions: [...left.suggestions].reverse() };
    const reorderedRows = { ...left, reviewedFeeRowRefs: [...left.reviewedFeeRowRefs].reverse() };

    expect(validateCanonicalRuntimeFeeClassificationReview(left, analysis).review).toEqual(
      validateCanonicalRuntimeFeeClassificationReview(right, analysis).review,
    );
    expect(validateCanonicalRuntimeFeeClassificationReview(left, analysis).review).toEqual(
      validateCanonicalRuntimeFeeClassificationReview(reorderedRows, analysis).review,
    );
  });

  it("rejects forbidden financial, authority, provider, path, prompt, and nested unknown fields", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    const base = validReview(packet, "completed_with_diagnostic_suggestions");
    const cases = [
      { ...base, amountMinor: 100 },
      { ...base, provider: "openai" },
      { ...base, prompt: "raw prompt" },
      { ...base, filename: "statement.pdf" },
      { ...base, suggestions: [{ ...base.suggestions[0]!, calculation: "amount times rate" }] },
      { ...base, suggestions: [{ ...base.suggestions[0]!, reasonCodes: ["freeform customer text"] }] },
    ];

    for (const review of cases) {
      const result = validateCanonicalRuntimeFeeClassificationReview(review, analysis);
      expect(result.ok).toBe(false);
      expect(["rejected", "safety_blocked"]).toContain(result.review.status);
      expect(JSON.stringify(result.review)).not.toMatch(/openai|statement\.pdf|raw prompt|amount times rate|customer text/i);
    }
  });

  it("rejects inherited/prototype fields instead of trusting them", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    const inherited = Object.create(validReview(packet, "not_needed"));
    const result = validateCanonicalRuntimeFeeClassificationReview(inherited, analysis);

    expect(result.ok).toBe(false);
    expect(result.review.status).toBe("rejected");
  });

  it("requires deterministic absence before not_needed can be accepted", () => {
    const noMaterial = noMaterialAnalysis();
    const noMaterialPacket = packetFor(noMaterial);
    const material = materialAnalysis();
    const materialPacket = packetFor(material);
    const staleProof = validReview(noMaterialPacket, "not_needed");

    expect(validateCanonicalRuntimeFeeClassificationReview(validReview(noMaterialPacket, "not_needed"), noMaterial).ok).toBe(true);
    expect(validateCanonicalRuntimeFeeClassificationReview(validReview(materialPacket, "not_needed"), material).ok).toBe(false);
    expect(validateCanonicalRuntimeFeeClassificationReview({ ...staleProof, absenceProof: null }, noMaterial).ok).toBe(false);
    expect(validateCanonicalRuntimeFeeClassificationReview(staleProof, material).ok).toBe(false);
  });

  it("represents diagnostic execution separately from unresolved classification and limited readiness", () => {
    const analysis = materialAnalysis();
    const before = financialProjection(analysis);
    const beforeCustomerState = buildCanonicalCustomerState({ ...analysis });
    const review = validReview(packetFor(analysis), "completed_with_diagnostic_suggestions");
    const adapted = buildRuntimeAiCapabilityHarnessInputs({
      analysis,
      summary: summaryWithRuntimeReview(review),
    });
    const aiCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: adapted.harnessInputs,
    });
    const feeCapability = aiCapabilities.capabilities.find((capability) => capability.capability === "fee_classification_review")!;

    expect(adapted.snapshots.find((snapshot) => snapshot.capability === "fee_classification_review")).toMatchObject({
      normalizedStatus: "completed_diagnostic",
      runtimeReviewStatus: "completed_with_diagnostic_suggestions",
      reasonCodes: ["runtime_fee_classification_review_diagnostic_only"],
      runtimeFeeClassificationReview: {
        status: "completed_with_diagnostic_suggestions",
        suggestions: expect.any(Array),
      },
    });
    expect(feeCapability.status).toBe("completed_diagnostic");
    expect(feeCapability.output).toBeNull();
    expect(aiCapabilities.summary.financialReadiness).toBe("limited");
    const customerState = buildCanonicalCustomerState({ ...analysis, aiCapabilities });
    expect(customerState.primaryState).toBe(beforeCustomerState.primaryState);
    expect(financialProjection({ ...analysis, aiCapabilities })).toEqual(before);
    expect(analysis.feeOwnershipActionability.rowClassifications.every((classification) => classification.selected.category === "unknown_needs_review")).toBe(true);
  });

  it("keeps completed no-suggestion reviews limited when material Package D classifications remain unresolved", () => {
    const analysis = materialAnalysis();
    const review = validReview(packetFor(analysis), "completed_no_suggestions");
    const adapted = buildRuntimeAiCapabilityHarnessInputs({
      analysis,
      summary: summaryWithRuntimeReview(review),
    });
    const aiCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: adapted.harnessInputs,
    });
    const feeCapability = aiCapabilities.capabilities.find((capability) => capability.capability === "fee_classification_review")!;

    expect(feeCapability.status).toBe("completed_diagnostic");
    expect(feeCapability.output).toBeNull();
    expect(aiCapabilities.summary.financialReadiness).toBe("limited");
  });

  it("rejects completed_diagnostic Package F records that carry customer-safe output", () => {
    const analysis = materialAnalysis();
    const aiCapabilities = buildCanonicalAiCapabilities({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      evidence: analysis.evidence,
      harnessInputs: [
        {
          capability: "fee_classification_review",
          status: "completed_diagnostic",
          output: {
            type: "fee_classification_review",
            authoritative: false,
            evidenceRefs: ["ev_fee_a"],
            factRefs: [],
            limitationCodes: [],
            suggestions: [
              {
                feeRowId: "feerow_material_a",
                suggestedCategory: "processor_markup",
                confidence: "medium",
                reasonCodes: ["runtime_fee_classification_diagnostic_suggestion"],
                safeExplanation: "Diagnostic review suggests human verification.",
                authoritative: false,
              },
            ],
          },
        },
      ],
    });
    const errors: string[] = [];

    validateCanonicalAiCapabilityLayer({ ...analysis, aiCapabilities }, errors);

    expect(errors).toContain("Package F capability ai_capability_fee_classification_review has diagnostic status carrying customer-safe output.");
  });

  it("maps disabled, failed, timed-out, rejected, and safety-blocked reviews without carrying output", () => {
    const analysis = materialAnalysis();
    const packet = packetFor(analysis);
    for (const status of ["disabled", "failed", "timed_out", "rejected", "safety_blocked"] as const) {
      const adapted = buildRuntimeAiCapabilityHarnessInputs({
        analysis,
        summary: summaryWithRuntimeReview(validReview(packet, status)),
      });
      const input = adapted.harnessInputs.find((candidate) => candidate.capability === "fee_classification_review")!;
      expect(input).toMatchObject({ capability: "fee_classification_review", status });
      expect(input.output).toBeNull();
    }
  });
});

function packetFor(analysis: CanonicalStatementAnalysis): CanonicalRuntimeFeeClassificationReviewPacket {
  return buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
}

function validReview(
  packet: CanonicalRuntimeFeeClassificationReviewPacket,
  status: CanonicalRuntimeFeeClassificationReview["status"],
): CanonicalRuntimeFeeClassificationReview {
  if (status === "not_needed") return validReviewSkeleton(status);
  if (["disabled", "failed", "timed_out", "rejected", "safety_blocked"].includes(status)) {
    return {
      ...validReviewSkeleton(status),
      reviewedFeeRowRefs: [],
      suggestions: [],
      limitationCodes: status === "disabled" ? ["provider_unavailable"] : ["ai_output_rejected"],
    };
  }
  const reviewedFeeRowRefs = [...packet.materialFeeRowRefs].sort();
  const suggestions =
    status === "completed_no_suggestions"
      ? []
      : reviewedFeeRowRefs.map((feeRowRef) => ({
          feeRowRef,
          evidenceRefs: packet.evidenceRefsByFeeRowRef[feeRowRef]!,
          currentClassificationCandidateRef: packet.selectedClassificationCandidateRefByFeeRowRef[feeRowRef],
          suggestedCategory: "processor_markup" as const,
          confidence: "medium" as const,
          disposition: "suggest_alternative" as const,
          reasonCodes: ["runtime_fee_classification_diagnostic_suggestion"],
          authoritative: false as const,
        }));
  return {
    ...validReviewSkeleton(status),
    reviewedFeeRowRefs,
    suggestions,
    limitationCodes: ["material_fee_classification_review_required"],
  };
}

function validReviewSkeleton(status: CanonicalRuntimeFeeClassificationReview["status"]): CanonicalRuntimeFeeClassificationReview {
  return {
    type: "runtime_fee_classification_review",
    policyVersion: "canonical_runtime_fee_classification_review_v1",
    status,
    reviewedFeeRowRefs: [],
    suggestions: [],
    absenceProof: status === "not_needed" ? "deterministic_absence_proven:material_unresolved_fee_rows" : null,
    limitationCodes: [],
    reasonCodes: ["runtime_fee_classification_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function summaryWithRuntimeReview(review: CanonicalRuntimeFeeClassificationReview): AnalysisSummary {
  return {
    averageTicket: 10,
    fees: 30,
    volume: 1000,
    transactions: 100,
    benchmarkRate: 0.035,
    effectiveRate: 0.03,
    potentialSavings: 0,
    statementSummary: "",
    statementPeriod: "2026-01",
    fiservFeeAnalysisV2: {
      aiAnomalyReview: {
        status: "no_anomalies",
        attempted: true,
        anomalyCount: 0,
        overrideCount: 0,
        appliedOverrideCount: 0,
      },
      runtimeFeeClassificationReview: review,
      ai: {
        status: "applied",
        suggestionCount: 99,
        appliedSuggestionCount: 99,
      },
    },
  } as AnalysisSummary;
}

function materialAnalysis(): CanonicalStatementAnalysis {
  const analysis = noMaterialAnalysis();
  const feeOne = feeRow("feerow_material_a", "ev_fee_a", 1000);
  const feeTwo = feeRow("feerow_material_b", "ev_fee_b", 2000);
  const feeEvidence = [evidenceRecord("ev_fee_a"), evidenceRecord("ev_fee_b")];
  return {
    ...analysis,
    evidence: feeEvidence,
    feeLedger: {
      policyVersion: "canonical_fee_ledger_v1",
      status: "partial",
      sourceOccurrences: [
        { id: "src_fee_a", evidenceRef: "ev_fee_a", documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l1", rowIndex: 1, normalizedSourceText: null },
        { id: "src_fee_b", evidenceRef: "ev_fee_b", documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l2", rowIndex: 2, normalizedSourceText: null },
      ],
      parserInterpretations: [],
      rows: [feeOne, feeTwo],
      uniqueChargeTotal: money(3000),
      controls: [],
      limitations: ["Synthetic unresolved fixture."],
    },
    feeOwnershipActionability: {
      policyVersion: "fee_ownership_actionability_v1",
      taxonomyVersion: "fee_taxonomy_v1",
      ruleRegistryVersion: "fee_ownership_rules_v1",
      aiSuggestionPolicyVersion: "fee_ai_suggestion_policy_v1",
      humanOverridePolicyVersion: "fee_human_override_policy_v1",
      status: "partial",
      rowClassifications: [classification(feeOne.id), classification(feeTwo.id)],
      spreadAssertions: [],
      aiSuggestions: [],
      humanOverrides: [],
      limitations: ["Synthetic unresolved fixture."],
    },
  };
}

function noMaterialAnalysis(): CanonicalStatementAnalysis {
  return buildCanonicalStatementFactsFromParsedDocument(syntheticStatement(), {
    businessType: "restaurant_food_beverage",
    sourceFileName: "runtime-fee-classification-review",
  });
}

function classification(feeRowId: string): CanonicalFeeClassificationResolution {
  const candidateId = `candidate_${feeRowId}`;
  return {
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
        ruleId: "synthetic_unknown",
        ruleVersion: "1.0.0",
        ruleProvenance: "Synthetic test fixture.",
        evidenceRefs: [feeRowId.endsWith("_a") ? "ev_fee_a" : "ev_fee_b"],
        reference: null,
        authoritative: false,
        reason: "Synthetic unresolved classification.",
        permissionConsequences: [],
        limitations: [],
      },
    ],
    conflictStatus: "unresolved",
    conflictReason: "Synthetic unresolved classification.",
  };
}

function feeRow(id: string, evidenceRef: string, amountMinor: number): CanonicalFeeRow {
  const sourceOccurrenceId = evidenceRef === "ev_fee_a" ? "src_fee_a" : "src_fee_b";
  return {
    id,
    role: "unknown_unresolved",
    sourceOccurrenceIds: [sourceOccurrenceId],
    parserInterpretationIds: [],
    selectedLabel: "Opaque synthetic fee",
    selectedAmount: money(amountMinor),
    signedAmount: money(-amountMinor),
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
  };
}

function evidenceRecord(id: string) {
  return {
    id,
    documentId: "doc_synthetic",
    pageNumber: 1,
    section: "fees",
    lineId: id,
    rowIndex: id.endsWith("_a") ? 1 : 2,
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

function syntheticStatement(): ParsedDocument {
  const lines = [
    "Merchant: Synthetic",
    "Processor: Fiserv",
    "Statement Period: 01/01/2026 - 01/31/2026",
    "Total Amount Submitted | $1,000.00",
    "Fees Charged | -$30.00",
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: {
      mode: "structured",
      qualityScore: 1,
      reasons: ["Synthetic H1.3c fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}

function financialProjection(analysis: CanonicalStatementAnalysis): Record<string, unknown> {
  return {
    processedSales: analysis.financialFacts.processedSales,
    totalFees: analysis.financialFacts.totalFees,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
  };
}
