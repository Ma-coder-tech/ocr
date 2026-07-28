import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities, type CanonicalAiCapabilityHarnessInput } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import {
  addDeterministicAnomalySubstitution,
  CANONICAL_RUNTIME_SAFETY_REVIEW_CHECK_IDS,
  buildDeterministicRuntimeSafetyReview,
} from "../../src/canonical/deterministicRuntimeSafetyReview.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability } from "../../src/canonical/feeOwnershipActionability.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { buildCanonicalOpportunityEngine } from "../../src/canonical/opportunityEngine.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type { RuntimeAiCapabilitySnapshot } from "../../src/canonical/runtimeAiCapabilityAdapter.js";
import type { ParsedDocument } from "../../src/parser.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";

describe("canonical deterministic runtime safety review", () => {
  it("uses a versioned deterministic substitution for absent or disabled anomaly AI without creating AI output", () => {
    const absent = applyRuntimeReadiness(analysisWithLedger("available"), [], []);
    const disabled = applyRuntimeReadiness(analysisWithLedger("available"), [harness("disabled")], [snapshot("disabled")]);

    for (const analysis of [absent, disabled]) {
      const anomaly = capability(analysis, "full_statement_anomaly_review");
      expect(anomaly).toMatchObject({
        status: "not_needed",
        output: null,
        executionRef: null,
        groundingStatus: "not_applicable",
      });
      expect(anomaly.trigger.reasonCode).toBe("deterministic_absence_proven");
      expect(anomaly.trigger.absenceProof).toBe("deterministic_runtime_safety_substitution:canonical_runtime_safety_review_v1");
      expect(analysis.aiCapabilities.deterministicRuntimeSafetyReview).toMatchObject({
        policyVersion: "canonical_runtime_safety_review_v1",
        anomalySubstitutionAllowed: true,
        aiAuthorityUsed: false,
        financialMutationAllowed: false,
        shadowComparisonUsed: false,
      });
      expect(analysis.aiCapabilities.deterministicRuntimeSafetyReview?.checks.map((check) => check.checkId)).toEqual([
        ...CANONICAL_RUNTIME_SAFETY_REVIEW_CHECK_IDS,
      ]);
      expect(analysis.aiCapabilities.deterministicRuntimeSafetyReview?.anomalySubstitutionProof).toMatchObject({
        reviewId: "canonical_runtime_safety_review",
        policyVersion: "canonical_runtime_safety_review_v1",
      });
      expect(JSON.stringify(analysis.aiCapabilities)).not.toMatch(/openai|anthropic|claude|gpt|private-model|rawPrompt|rawResponse|billing|api.?key/i);
      expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
    }
  });

  it("keeps partial ledgers analysis_limited with core metrics visible and opportunity/actions hidden", () => {
    const analysis = applyRuntimeReadiness(analysisWithLedger("partial"), [harness("disabled")], [snapshot("disabled")]);

    expect(analysis.feeLedger.status).toBe("partial");
    expect(analysis.aiCapabilities.deterministicRuntimeSafetyReview?.status).toBe("limited");
    expect(capability(analysis, "full_statement_anomaly_review").status).toBe("not_needed");
    expect(analysis.aiCapabilities.summary.financialReadiness).not.toBe("withheld");
    expect(analysis.customerState.primaryState).toBe("analysis_limited");
    expect(analysis.customerState.visibility.showCoreMetrics).toBe(true);
    expect(analysis.customerState.visibility.showEffectiveRate).toBe(true);
    expect(analysis.customerState.visibility.showDeterministicOpportunity).toBe(false);
    expect(analysis.customerState.visibility.showEstimatedOpportunity).toBe(false);
    expect(analysis.customerState.visibility.showActions).toBe(false);
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("blocks deterministic substitution when a monetary control is blocking", () => {
    const analysis = analysisWithLedger("available");
    analysis.feeLedger.status = "partial";
    analysis.feeLedger.controls[0]!.status = "blocked";
    const blocked = applyRuntimeReadiness(analysis, [harness("disabled")], [snapshot("disabled")]);

    expect(blocked.aiCapabilities.deterministicRuntimeSafetyReview?.status).toBe("withheld");
    expect(blocked.aiCapabilities.deterministicRuntimeSafetyReview?.checks.find((check) => check.checkId === "fee_ledger_controls_nonblocking")).toMatchObject({
      status: "withheld",
      reasonCode: "fee_ledger_blocked_control",
    });
    expect(capability(blocked, "full_statement_anomaly_review").status).toBe("disabled");
    expect(blocked.aiCapabilities.summary.financialReadiness).toBe("withheld");
  });

  it("does not substitute anomaly AI when core facts or fee ledgers are unavailable", () => {
    const unavailableLedger = applyRuntimeReadiness(analysisWithLedger("unavailable"), [harness("disabled")], [snapshot("disabled")]);
    const unsafeCore = analysisWithLedger("available");
    unsafeCore.financialFacts.processedSales.value = { amountMinor: 0, currency: "USD" };
    const unsafe = applyRuntimeReadiness(unsafeCore, [harness("disabled")], [snapshot("disabled")]);

    expect(unavailableLedger.aiCapabilities.deterministicRuntimeSafetyReview?.status).toBe("unavailable");
    expect(capability(unavailableLedger, "full_statement_anomaly_review").status).toBe("disabled");
    expect(unavailableLedger.aiCapabilities.summary.financialReadiness).toBe("withheld");
    expect(unsafe.aiCapabilities.deterministicRuntimeSafetyReview?.status).toBe("withheld");
    expect(capability(unsafe, "full_statement_anomaly_review").status).toBe("disabled");
    expect(unsafe.aiCapabilities.summary.financialReadiness).toBe("withheld");
  });

  it("preserves failed, timed-out, rejected, and safety-blocked anomaly statuses as financial blockers", () => {
    for (const status of ["failed", "timed_out", "rejected", "safety_blocked"] as const) {
      const analysis = applyRuntimeReadiness(analysisWithLedger("available"), [harness(status)], [snapshot(status, status === "safety_blocked" ? { appliedOverrideCount: 1 } : {})]);
      expect(capability(analysis, "full_statement_anomaly_review").status).toBe(status);
      expect(analysis.aiCapabilities.deterministicRuntimeSafetyReview?.anomalySubstitutionAllowed).toBe(false);
      expect(analysis.aiCapabilities.summary.financialReadiness).toBe("withheld");
      expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
    }
  });

  it("does not let material unresolved fee classification create verified conclusions, actions, or eligible savings", () => {
    const analysis = analysisWithLedger("available");
    forceMaterialUnresolvedClassification(analysis);
    const ready = applyRuntimeReadiness(analysis, [harness("disabled")], [snapshot("disabled")]);
    const feeClassification = capability(ready, "fee_classification_review");

    expect(feeClassification.required).toBe(true);
    expect(feeClassification.financialReadinessOnFailure).toBe("limited");
    expect(ready.aiCapabilities.summary.financialReadiness).toBe("limited");
    expect(ready.customerState.primaryState).toBe("analysis_limited");
    expect(ready.customerState.axes.opportunityPosture).toBe("verification_only");
    expect(ready.customerState.primaryState).not.toMatch(/competitive|opportunity_identified|material_fee_opportunity/);
    expect(ready.customerState.primaryState).not.toBe("competitive_no_opportunity");
    expect(ready.customerState.visibility.visibleEligibleAnnualAmount.amountMinor).toBe(0);
    expect(ready.customerState.actionGuidance).toEqual([]);
    expect(ready.customerState.actionGuidance.some((action) => action.actionType === "request_removal" || action.actionType === "request_repricing")).toBe(false);
  });

  it("rejects forged not_needed anomaly review records without the deterministic safety proof", () => {
    const analysis = analysisWithLedger("available");
    analysis.aiCapabilities = buildCanonicalAiCapabilities({
      ...analysis,
      evidence: analysis.evidence,
      harnessInputs: [{ capability: "full_statement_anomaly_review", status: "not_needed" }],
    });

    expect(() => validateCanonicalStatementAnalysis(analysis)).toThrow(/not_needed when trigger evidence is present/i);
  });

  it("rejects forged, missing, duplicate, unsupported, contradictory, and stale deterministic safety reviews", () => {
    const cases: Array<[string, (analysis: CanonicalStatementAnalysis) => void, RegExp]> = [
      [
        "missing check",
        (analysis) => {
          analysis.aiCapabilities.deterministicRuntimeSafetyReview!.checks.pop();
        },
        /missing check|checks do not reconstruct/i,
      ],
      [
        "duplicate check",
        (analysis) => {
          const check = analysis.aiCapabilities.deterministicRuntimeSafetyReview!.checks[0]!;
          analysis.aiCapabilities.deterministicRuntimeSafetyReview!.checks.push({ ...check });
        },
        /duplicate check|checks do not reconstruct/i,
      ],
      [
        "unsupported check",
        (analysis) => {
          (analysis.aiCapabilities.deterministicRuntimeSafetyReview!.checks[0] as any).checkId = "unsafe_extra_check";
        },
        /unsupported check|missing check/i,
      ],
      [
        "contradictory check",
        (analysis) => {
          analysis.aiCapabilities.deterministicRuntimeSafetyReview!.checks[0]!.status = "withheld";
        },
        /checks do not reconstruct|status does not match/i,
      ],
      [
        "forged status",
        (analysis) => {
          analysis.aiCapabilities.deterministicRuntimeSafetyReview!.status = "withheld";
        },
        /status does not match/i,
      ],
      [
        "stale after core mutation",
        (analysis) => {
          analysis.financialFacts.processedSales.value = { amountMinor: 0, currency: "USD" };
        },
        /checks do not reconstruct|status does not match|substitution flag does not match/i,
      ],
      [
        "proof detached from review",
        (analysis) => {
          (analysis.aiCapabilities.deterministicRuntimeSafetyReview!.anomalySubstitutionProof as any).reviewId = "other_review";
        },
        /proof is not tied|not_needed when trigger evidence is present/i,
      ],
    ];

    for (const [label, mutate, pattern] of cases) {
      const analysis = applyRuntimeReadiness(analysisWithLedger("available"), [harness("disabled")], [snapshot("disabled")]);
      mutate(analysis);
      expect(() => validateCanonicalStatementAnalysis(analysis), label).toThrow(pattern);
    }
  });

  it("keeps Packages B-E invariant across deterministic substitution, disabled, failed, and reordered metadata", () => {
    const base = analysisWithLedger("available");
    const before = financialProjection(base);
    const variants = [
      applyRuntimeReadiness(structuredClone(base), [], []),
      applyRuntimeReadiness(structuredClone(base), [harness("disabled")], [snapshot("disabled")]),
      applyRuntimeReadiness(structuredClone(base), [harness("failed")], [snapshot("failed")]),
      applyRuntimeReadiness(structuredClone(base), [harness("safety_blocked"), { capability: "merchant_narrative", status: "failed" }], [snapshot("safety_blocked", { appliedOverrideCount: 1 })]),
      applyRuntimeReadiness(structuredClone(base), [{ capability: "merchant_narrative", status: "failed" }, harness("disabled")], [snapshot("disabled")]),
    ];

    for (const analysis of variants) {
      expect(financialProjection(analysis)).toEqual(before);
    }
  });
});

function applyRuntimeReadiness(
  analysis: CanonicalStatementAnalysis,
  harnessInputs: CanonicalAiCapabilityHarnessInput[],
  snapshots: RuntimeAiCapabilitySnapshot[],
): CanonicalStatementAnalysis {
  const review = buildDeterministicRuntimeSafetyReview({ analysis, runtimeAiCapabilitySnapshots: snapshots });
  const finalHarness = addDeterministicAnomalySubstitution({ harnessInputs, review, runtimeAiCapabilitySnapshots: snapshots });
  const aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs: finalHarness,
    deterministicRuntimeSafetyReview: review,
  });
  return validateCanonicalStatementAnalysis({
    ...analysis,
    aiCapabilities,
    customerState: buildCanonicalCustomerState({
      identity: analysis.identity,
      financialFacts: analysis.financialFacts,
      feeLedger: analysis.feeLedger,
      feeOwnershipActionability: analysis.feeOwnershipActionability,
      opportunityEngine: analysis.opportunityEngine,
      aiCapabilities,
    }),
  });
}

function analysisWithLedger(status: "available" | "partial" | "unavailable"): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(statement(), {
    sourceFileName: "package-h1-3b.pdf",
    businessType: "restaurant",
    preferExtractedRows: true,
  });
  const evidenceRef = analysis.evidence[0]!.id;
  analysis.identity.statementPeriod = selectedFact({
    value: { start: "2026-01-01", end: "2026-01-31" },
    confidence: "high",
    evidenceRefs: [evidenceRef],
    selectionReason: "Synthetic verified statement period.",
  });
  analysis.identity.processorFamily = selectedFact({
    value: "fiserv",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    selectionReason: "Synthetic processor context.",
  });
  analysis.identity.processorName = selectedFact({
    value: "Fiserv",
    confidence: "high",
    evidenceRefs: [evidenceRef],
    selectionReason: "Synthetic processor context.",
  });

  if (status !== "unavailable") {
    const evidence = new Map();
    const calculations = [];
    const printedTotal = status === "partial" ? 10.02 : 10;
    analysis.feeLedger = buildCanonicalFeeLedger({
      doc: statement(),
      documentId: "doc_package_h1_3b",
      matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
      evidence,
      calculations,
      parserOutput: {
        feeLedger: {
          rows: [
            {
              network: null,
              type: null,
              description: "Monthly CPU GTWY",
              amount: 10,
              sourceSection: "Fees",
              evidenceLine: "Monthly CPU GTWY | -$10.00",
              pageNumber: 1,
              confidence: "high",
            },
          ],
          controls: [{ label: "Total Fees", rowSum: 10, printedTotal, delta: printedTotal - 10, evidenceLine: `Total Fees | -$${printedTotal.toFixed(2)}` }],
          printedTotal,
          delta: printedTotal - 10,
        },
      },
    });
    analysis.evidence = [...analysis.evidence, ...evidence.values()];
    analysis.calculations = [...analysis.calculations, ...calculations];
  }

  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(analysis.feeLedger, {
    processorFamily: "fiserv",
    statementPeriodStart: "2026-01-01",
  });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
  });
  analysis.aiCapabilities = buildCanonicalAiCapabilities({ ...analysis, evidence: analysis.evidence });
  analysis.customerState = buildCanonicalCustomerState({ ...analysis });
  return validateCanonicalStatementAnalysis(analysis);
}

function capability(analysis: CanonicalStatementAnalysis, id: string) {
  return analysis.aiCapabilities.capabilities.find((item) => item.capability === id)!;
}

function forceMaterialUnresolvedClassification(analysis: CanonicalStatementAnalysis): void {
  const classification = analysis.feeOwnershipActionability.rowClassifications[0]!;
  classification.selected = {
    ...classification.selected,
    category: "unknown_needs_review",
    ownership: { collector: "unknown", economicBeneficiary: "unknown", contractualController: "unknown" },
    actionabilityCeiling: "unknown",
    confidence: "low",
  };
  classification.candidates = classification.candidates.map((candidate, index) =>
    index === 0
      ? {
          ...candidate,
          category: "unknown_needs_review",
          ownership: { collector: "unknown", economicBeneficiary: "unknown", contractualController: "unknown" },
          actionabilityCeiling: "unknown",
          confidence: "low",
          authoritative: false,
        }
      : candidate,
  );
  classification.conflictStatus = "unresolved";
  classification.conflictReason = "Synthetic unresolved Package D classification.";
  analysis.feeOwnershipActionability.status = "partial";
}

function harness(status: CanonicalAiCapabilityHarnessInput["status"]): CanonicalAiCapabilityHarnessInput {
  return { capability: "full_statement_anomaly_review", status };
}

function snapshot(status: RuntimeAiCapabilitySnapshot["normalizedStatus"], safeCounts: Record<string, number> = {}): RuntimeAiCapabilitySnapshot {
  return {
    capability: "full_statement_anomaly_review",
    attempted: status !== "disabled",
    normalizedStatus: status,
    safeCounts,
    executionRef: null,
    reasonCodes: [],
  };
}

function financialProjection(analysis: CanonicalStatementAnalysis): Record<string, unknown> {
  return {
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
  };
}

function statement(): ParsedDocument {
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
      reasons: ["Synthetic Package H1.3b fixture."],
      lineCount: lines.length,
      amountTokenCount: lines.length,
      hasExtractableText: true,
    },
  };
}
