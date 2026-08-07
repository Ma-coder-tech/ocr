import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildRuntimeAiCapabilityHarnessInputs } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import {
  buildCanonicalRuntimeFeeClassificationProducerPacket,
  runCanonicalRuntimeFeeClassificationReviewProducer,
  type CanonicalRuntimeFeeClassificationProducerPacket,
} from "../../src/canonical/runtimeFeeClassificationReviewProducer.js";
import {
  buildCanonicalRuntimeFeeClassificationReviewPacket,
  type CanonicalRuntimeFeeClassificationReviewPacket,
} from "../../src/canonical/runtimeFeeClassificationReview.js";
import { provePackagesBEFinancialInvariance } from "../../src/evaluationIntegrity/invariance.js";
import type { ParsedDocument } from "../../src/parser.js";
import type {
  CanonicalFeeClassificationResolution,
  CanonicalFeeRow,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalRuntimeFeeClassificationReviewStatus,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { AnalysisSummary } from "../../src/types.js";

describe("canonical runtime fee classification review producer", () => {
  it("builds a deterministic safe producer packet with useful row semantics and exact validation linkage", () => {
    const analysis = materialAnalysis();
    const validationPacket = validationPacketFor(analysis);
    const producerPacket = producerPacketFor(analysis);

    expect(producerPacket).toMatchObject({
      type: "canonical_runtime_fee_classification_producer_packet",
      policyVersion: "canonical_runtime_fee_classification_producer_packet_v1",
      validationPacketPolicyVersion: validationPacket.policyVersion,
      absenceProof: null,
    });
    expect(producerPacket.materialUnresolvedRows.map((row) => row.feeRowRef)).toEqual(validationPacket.materialFeeRowRefs);
    expect(producerPacket.materialUnresolvedRows.map((row) => row.feeRowRef)).toEqual(["feerow_material_a", "feerow_material_b"]);
    expect(producerPacket.materialUnresolvedRows.some((row) => row.feeRowRef === "feerow_resolved")).toBe(false);
    expect(producerPacket.materialUnresolvedRows.every((row) => row.sanitizedFeeLabel === "Opaque synthetic fee")).toBe(true);
    expect(producerPacket.materialUnresolvedRows.every((row) => row.role === "unknown_unresolved")).toBe(true);

    for (const row of producerPacket.materialUnresolvedRows) {
      expect(row.evidenceRefs).toEqual(validationPacket.evidenceRefsByFeeRowRef[row.feeRowRef]);
      expect(row.selectedClassificationCandidateRef).toEqual(validationPacket.selectedClassificationCandidateRefByFeeRowRef[row.feeRowRef]);
      expect(row.currentClassificationCandidates.map((candidate) => candidate.candidateRef)).toEqual(
        validationPacket.classificationCandidateRefsByFeeRowRef[row.feeRowRef],
      );
      expect(row.currentClassificationCandidates[0]).toEqual({
        candidateRef: `candidate_${row.feeRowRef}`,
        category: "unknown_needs_review",
        confidence: "low",
        sourceType: "safe_default",
      });
    }
  });

  it("keeps unsafe labels withheld and excludes forbidden packet content", () => {
    const analysis = materialAnalysis({
      labelByRow: {
        feerow_material_a: "Statement path /Users/private/merchant.pdf $10.00",
        feerow_material_b: "Processor fee 2.95%",
      },
    });
    const packet = producerPacketFor(analysis);
    const serialized = JSON.stringify(packet);

    expect(packet.materialUnresolvedRows.every((row) => row.sanitizedFeeLabel === "[fee_label_withheld]")).toBe(true);
    expect(packet.materialUnresolvedRows.every((row) => row.labelStatus === "withheld")).toBe(true);
    expect(serialized).not.toMatch(/\$|2\.95|amount|total|rate|percentage|transactionCount|opportunity|savings|target|cadence|calculation/i);
    expect(serialized).not.toMatch(/merchant|account|filename|fileName|\/Users|\/private|\.pdf|\.csv|raw|excerpt|provider|model|prompt|response|api.?key|openai|anthropic|gpt|claude/i);
  });

  it("allows non-identifying fee terminology with ordinary numeric descriptors", () => {
    const allowedLabels = [
      "PCI DSS 4.0 Fee",
      "Level 2 Data Fee",
      "Billing Support Fee",
      "Merchant Account Maintenance Fee",
    ];

    for (const label of allowedLabels) {
      const packet = producerPacketFor(materialAnalysis({ labelByRow: { feerow_material_a: label } }));
      const row = packet.materialUnresolvedRows.find((item) => item.feeRowRef === "feerow_material_a")!;
      const serialized = JSON.stringify(packet);

      expect(row.sanitizedFeeLabel).toBe(label);
      expect(row.labelStatus).toBe("available");
      expect(serialized).not.toMatch(/\$|2\.95%|10 bps|USD 12\.50|\/Users|\/private|statement\.pdf|merchant id|account number|api.?key|credential|raw response|openai|gpt/i);
    }
  });

  it("withholds labels containing actual financial values, identifiers, paths, credentials, providers, or raw content", () => {
    const unsafeLabels = [
      "Monthly Fee $10.00",
      "Processor Fee 2.95%",
      "Assessment 10 bps",
      "USD 12.50",
      "Rate 0.35",
      "Amount 12.50",
      "Merchant ID: 123456789",
      "Account Number 987654321",
      "Statement path /Users/private/statement.pdf",
      "file statement.pdf",
      "API key sk-test123456789",
      "OpenAI model gpt-4o raw response",
    ];

    for (const label of unsafeLabels) {
      const packet = producerPacketFor(materialAnalysis({ labelByRow: { feerow_material_a: label } }));
      const row = packet.materialUnresolvedRows.find((item) => item.feeRowRef === "feerow_material_a")!;

      expect(row.sanitizedFeeLabel, label).toBe("[fee_label_withheld]");
      expect(row.labelStatus, label).toBe("withheld");
    }

    const serialized = JSON.stringify(producerPacketFor(materialAnalysis({
      labelByRow: {
        feerow_material_a: "Merchant ID: 123456789",
        feerow_material_b: "OpenAI model gpt-4o raw response",
      },
    })));
    expect(serialized).not.toMatch(/\$|2\.95|10 bps|USD 12\.50|Rate 0\.35|Amount 12\.50|123456789|987654321|\/Users|\/private|statement\.pdf|api.?key|credential|raw response|openai|gpt-4o/i);
  });

  it("returns not_needed without calling the adapter when deterministic absence proof applies", async () => {
    let called = false;
    const analysis = noMaterialAnalysis();
    const review = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      adapter: () => {
        called = true;
        return validReview(validationPacketFor(analysis), "failed");
      },
    });

    expect(called).toBe(false);
    expect(review).toMatchObject({
      status: "not_needed",
      absenceProof: "deterministic_absence_proven:material_unresolved_fee_rows",
      reviewedFeeRowRefs: [],
      suggestions: [],
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    });
  });

  it("returns disabled when execution is disabled or no adapter is supplied", async () => {
    const analysis = materialAnalysis();
    const noAdapter = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis);
    let called = false;
    const disabled = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      enabled: false,
      adapter: () => {
        called = true;
        return validReview(validationPacketFor(analysis), "completed_no_suggestions");
      },
    });

    expect(noAdapter.status).toBe("disabled");
    expect(noAdapter.suggestions).toEqual([]);
    expect(disabled.status).toBe("disabled");
    expect(disabled.suggestions).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns failed for injected adapter failures", async () => {
    const review = await runCanonicalRuntimeFeeClassificationReviewProducer(materialAnalysis(), {
      adapter: () => {
        throw new Error("synthetic failure with provider-like detail that must not surface");
      },
    });

    expect(review.status).toBe("failed");
    expect(review.suggestions).toEqual([]);
    expect(JSON.stringify(review)).not.toMatch(/provider-like detail|synthetic failure/i);
  });

  it("times out with AbortController and ignores a late adapter result", async () => {
    const analysis = materialAnalysis();
    let signalSeen = false;
    let lateResolved = false;
    const review = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      timeoutMs: 5,
      adapter: ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            signalSeen = true;
          });
          setTimeout(() => {
            lateResolved = true;
            resolve(validReview(validationPacketFor(analysis), "completed_no_suggestions"));
          }, 25);
        }),
    });

    expect(review.status).toBe("timed_out");
    expect(review.suggestions).toEqual([]);
    expect(signalSeen).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(lateResolved).toBe(true);
    expect(review.status).toBe("timed_out");
  });

  it("validates completed no-suggestion and completed diagnostic-suggestion adapter results", async () => {
    const analysis = materialAnalysis();
    const packet = validationPacketFor(analysis);
    const noSuggestions = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      adapter: () => validReview(packet, "completed_no_suggestions"),
    });
    const diagnosticSuggestions = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      adapter: () => validReview(packet, "completed_with_diagnostic_suggestions"),
    });

    expect(noSuggestions.status).toBe("completed_no_suggestions");
    expect(noSuggestions.reviewedFeeRowRefs).toEqual(packet.materialFeeRowRefs);
    expect(noSuggestions.suggestions).toEqual([]);
    expect(diagnosticSuggestions.status).toBe("completed_with_diagnostic_suggestions");
    expect(diagnosticSuggestions.reviewedFeeRowRefs).toEqual(packet.materialFeeRowRefs);
    expect(diagnosticSuggestions.suggestions).toHaveLength(packet.materialFeeRowRefs.length);
    expect(diagnosticSuggestions.suggestions.every((suggestion) => suggestion.authoritative === false)).toBe(true);
  });

  it("fails closed for incomplete coverage and foreign row, evidence, and candidate refs", async () => {
    const analysis = materialAnalysis();
    const packet = validationPacketFor(analysis);
    const [first, second] = packet.materialFeeRowRefs;
    const valid = validReview(packet, "completed_with_diagnostic_suggestions");
    const cases: CanonicalRuntimeFeeClassificationReview[] = [
      { ...valid, reviewedFeeRowRefs: [first!] },
      { ...valid, reviewedFeeRowRefs: [...packet.materialFeeRowRefs, "feerow_unknown"] },
      { ...valid, suggestions: [{ ...valid.suggestions[0]!, evidenceRefs: packet.evidenceRefsByFeeRowRef[second!]! }] },
      { ...valid, suggestions: [{ ...valid.suggestions[0]!, currentClassificationCandidateRef: packet.classificationCandidateRefsByFeeRowRef[second!]![0]! }] },
      { ...valid, suggestions: [{ ...valid.suggestions[0]!, currentClassificationCandidateRef: "candidate_foreign" }] },
    ];

    for (const candidate of cases) {
      const review = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, { adapter: () => candidate });
      expect(review.status).toBe("rejected");
      expect(review.suggestions).toEqual([]);
    }
  });

  it("rejects or safety-blocks forbidden financial, provider, raw, merchant, and path content", async () => {
    const analysis = materialAnalysis();
    const packet = validationPacketFor(analysis);
    const base = validReview(packet, "completed_with_diagnostic_suggestions");
    const review = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      adapter: () => ({
        ...base,
        amountMinor: 123,
        provider: "openai",
        rawResponse: "merchant account /Users/private/file.pdf",
      }),
    });

    expect(["rejected", "safety_blocked"]).toContain(review.status);
    expect(review.suggestions).toEqual([]);
    expect(JSON.stringify(review)).not.toMatch(/123|openai|merchant account|\/Users|file\.pdf/i);
  });

  it("keeps structured safety-blocked results terminal and suggestion-free", async () => {
    const analysis = materialAnalysis();
    const review = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      adapter: () => ({
        ...validReview(validationPacketFor(analysis), "safety_blocked"),
        reasonCodes: ["runtime_fee_classification_safety_blocked"],
      }),
    });

    expect(review.status).toBe("safety_blocked");
    expect(review.suggestions).toEqual([]);
  });

  it("does not mutate Packages B-E for every terminal review status", async () => {
    for (const status of [
      "not_needed",
      "disabled",
      "failed",
      "timed_out",
      "completed_no_suggestions",
      "completed_with_diagnostic_suggestions",
      "rejected",
      "safety_blocked",
    ] as const) {
      const analysis = status === "not_needed" ? noMaterialAnalysis() : materialAnalysis();
      const analysisBefore = structuredClone(analysis);
      const before = packagesBE(analysis);
      await runProducerForStatus(analysis, status);
      const invariance = provePackagesBEFinancialInvariance(before, packagesBE(analysis));

      expect(invariance.invariant, status).toBe(true);
      expect(invariance.mismatchPaths, status).toEqual([]);
      expect(analysis, status).toEqual(analysisBefore);
    }
  });

  it("keeps high-confidence diagnostic alternatives out of Package D, Package E, and customer readiness", async () => {
    const analysis = materialAnalysis();
    const before = structuredClone(packagesBE(analysis));
    const packet = validationPacketFor(analysis);
    const review = await runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      adapter: () => ({
        ...validReview(packet, "completed_with_diagnostic_suggestions"),
        suggestions: packet.materialFeeRowRefs.map((feeRowRef) => ({
          feeRowRef,
          evidenceRefs: packet.evidenceRefsByFeeRowRef[feeRowRef]!,
          currentClassificationCandidateRef: packet.selectedClassificationCandidateRefByFeeRowRef[feeRowRef],
          suggestedCategory: "processor_markup",
          confidence: "high",
          disposition: "suggest_alternative",
          reasonCodes: ["runtime_fee_classification_diagnostic_suggestion"],
          authoritative: false,
        })),
      }),
    });
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
    const materialRows = new Set(packet.materialFeeRowRefs);
    const materialClassifications = analysis.feeOwnershipActionability.rowClassifications.filter((row) => materialRows.has(row.feeRowId));

    expect(review.status).toBe("completed_with_diagnostic_suggestions");
    expect(feeCapability.status).toBe("completed_diagnostic");
    expect(feeCapability.output).toBeNull();
    expect(aiCapabilities.summary.financialReadiness).toBe("limited");
    expect(materialClassifications.every((row) => row.selected.category === "unknown_needs_review")).toBe(true);
    expect(materialClassifications.every((row) => row.conflictStatus === "unresolved")).toBe(true);
    expect(materialClassifications.every((row) => row.selected.ownership.economicBeneficiary === "unknown")).toBe(true);
    expect(materialClassifications.every((row) => row.selected.actionabilityCeiling === "unknown")).toBe(true);
    expect(analysis.feeOwnershipActionability.rowClassifications.find((row) => row.feeRowId === "feerow_resolved")?.selected.category).toBe("service_fee");
    expect(packagesBE(analysis)).toEqual(before);
  });
});

function producerPacketFor(analysis: CanonicalStatementAnalysis): CanonicalRuntimeFeeClassificationProducerPacket {
  return buildCanonicalRuntimeFeeClassificationProducerPacket(analysis);
}

function validationPacketFor(analysis: CanonicalStatementAnalysis): CanonicalRuntimeFeeClassificationReviewPacket {
  return buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
}

async function runProducerForStatus(
  analysis: CanonicalStatementAnalysis,
  status: CanonicalRuntimeFeeClassificationReviewStatus,
): Promise<CanonicalRuntimeFeeClassificationReview> {
  if (status === "not_needed") return runCanonicalRuntimeFeeClassificationReviewProducer(analysis);
  if (status === "disabled") return runCanonicalRuntimeFeeClassificationReviewProducer(analysis, { enabled: false, adapter: () => ({}) });
  if (status === "failed") return runCanonicalRuntimeFeeClassificationReviewProducer(analysis, { adapter: () => { throw new Error("synthetic"); } });
  if (status === "timed_out") {
    return runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
      timeoutMs: 1,
      adapter: () => new Promise((resolve) => setTimeout(() => resolve(validReview(validationPacketFor(analysis), "completed_no_suggestions")), 10)),
    });
  }
  return runCanonicalRuntimeFeeClassificationReviewProducer(analysis, {
    adapter: () => validReview(validationPacketFor(analysis), status),
  });
}

function validReview(
  packet: CanonicalRuntimeFeeClassificationReviewPacket,
  status: CanonicalRuntimeFeeClassificationReviewStatus,
): CanonicalRuntimeFeeClassificationReview {
  if (status === "not_needed") return validReviewSkeleton(status, packet.absenceProof);
  if (["disabled", "failed", "timed_out", "rejected", "safety_blocked"].includes(status)) {
    return {
      ...validReviewSkeleton(status, null),
      reviewedFeeRowRefs: [],
      suggestions: [],
      limitationCodes: status === "disabled" ? ["provider_unavailable"] : ["ai_output_rejected"],
    };
  }
  const reviewedFeeRowRefs = [...packet.materialFeeRowRefs].sort();
  return {
    ...validReviewSkeleton(status, null),
    reviewedFeeRowRefs,
    suggestions:
      status === "completed_no_suggestions"
        ? []
        : reviewedFeeRowRefs.map((feeRowRef) => ({
            feeRowRef,
            evidenceRefs: packet.evidenceRefsByFeeRowRef[feeRowRef]!,
            currentClassificationCandidateRef: packet.selectedClassificationCandidateRefByFeeRowRef[feeRowRef],
            suggestedCategory: "processor_markup",
            confidence: "medium",
            disposition: "suggest_alternative",
            reasonCodes: ["runtime_fee_classification_diagnostic_suggestion"],
            authoritative: false,
          })),
    limitationCodes: ["material_fee_classification_review_required"],
  };
}

function validReviewSkeleton(
  status: CanonicalRuntimeFeeClassificationReviewStatus,
  absenceProof: string | null,
): CanonicalRuntimeFeeClassificationReview {
  return {
    type: "runtime_fee_classification_review",
    policyVersion: "canonical_runtime_fee_classification_review_v1",
    status,
    reviewedFeeRowRefs: [],
    suggestions: [],
    absenceProof: status === "not_needed" ? absenceProof : null,
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
    },
  } as AnalysisSummary;
}

function materialAnalysis(options: { labelByRow?: Record<string, string> } = {}): CanonicalStatementAnalysis {
  const analysis = noMaterialAnalysis();
  const feeOne = feeRow("feerow_material_a", "ev_fee_a", 1000, options.labelByRow?.feerow_material_a ?? "Opaque synthetic fee");
  const feeTwo = feeRow("feerow_material_b", "ev_fee_b", 2000, options.labelByRow?.feerow_material_b ?? "Opaque synthetic fee");
  const resolved = feeRow("feerow_resolved", "ev_fee_c", 500, "Resolved service fee", "individual_charge");
  const feeEvidence = [evidenceRecord("ev_fee_a"), evidenceRecord("ev_fee_b"), evidenceRecord("ev_fee_c")];
  return {
    ...analysis,
    evidence: feeEvidence,
    feeLedger: {
      policyVersion: "canonical_fee_ledger_v1",
      status: "partial",
      sourceOccurrences: [
        { id: "src_fee_a", evidenceRef: "ev_fee_a", documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l1", rowIndex: 1, normalizedSourceText: null },
        { id: "src_fee_b", evidenceRef: "ev_fee_b", documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l2", rowIndex: 2, normalizedSourceText: null },
        { id: "src_fee_c", evidenceRef: "ev_fee_c", documentId: "doc_synthetic", pageNumber: 1, section: "fees", lineId: "l3", rowIndex: 3, normalizedSourceText: null },
      ],
      parserInterpretations: [],
      rows: [feeOne, feeTwo, resolved],
      uniqueChargeTotal: money(3500),
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
      rowClassifications: [unknownClassification(feeOne.id), unknownClassification(feeTwo.id), resolvedClassification(resolved.id)],
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
    sourceFileName: "runtime-fee-classification-review-producer",
  });
}

function unknownClassification(feeRowId: string): CanonicalFeeClassificationResolution {
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

function resolvedClassification(feeRowId: string): CanonicalFeeClassificationResolution {
  const candidateId = `candidate_${feeRowId}`;
  return {
    feeRowId,
    selected: {
      candidateId,
      category: "service_fee",
      ownership: { collector: "processor", economicBeneficiary: "processor", contractualController: "processor" },
      actionabilityCeiling: "verify_only",
      documentationRequirement: "recommended",
      confidence: "medium",
      selectionReason: "Synthetic deterministic classification.",
      rejectedCandidateIds: [],
    },
    candidates: [
      {
        id: candidateId,
        feeRowId,
        category: "service_fee",
        ownership: { collector: "processor", economicBeneficiary: "processor", contractualController: "processor" },
        actionabilityCeiling: "verify_only",
        documentationRequirement: "recommended",
        confidence: "medium",
        sourceType: "deterministic_rule",
        ruleId: "synthetic_resolved",
        ruleVersion: "1.0.0",
        ruleProvenance: "Synthetic deterministic fixture.",
        evidenceRefs: ["ev_fee_c"],
        reference: null,
        authoritative: true,
        reason: "Synthetic resolved classification.",
        permissionConsequences: [],
        limitations: [],
      },
    ],
    conflictStatus: "none",
    conflictReason: null,
  };
}

function feeRow(
  id: string,
  evidenceRef: string,
  amountMinor: number,
  label: string,
  role: CanonicalFeeRow["role"] = "unknown_unresolved",
): CanonicalFeeRow {
  const sourceOccurrenceId = evidenceRef === "ev_fee_a" ? "src_fee_a" : evidenceRef === "ev_fee_b" ? "src_fee_b" : "src_fee_c";
  return {
    id,
    role,
    sourceOccurrenceIds: [sourceOccurrenceId],
    parserInterpretationIds: [],
    selectedLabel: label,
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
    rowIndex: id.endsWith("_a") ? 1 : id.endsWith("_b") ? 2 : 3,
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
      reasons: ["Synthetic Package 5C.2A fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
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
