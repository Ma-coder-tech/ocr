import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../../src/analyzer.js";
import { buildCanonicalRuntimeAnalysis } from "../../src/canonical/runtimeAdapter.js";
import { buildAverageTicket, emptyTransactionCounts, transactionCountsFromParserSupport } from "../../src/canonical/transactionCounts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { moneyFromNumber } from "../../src/canonical/money.js";
import { buildSingleStatementReportV1 } from "../../src/reporting/v1/index.js";
import type { ParsedDocument } from "../../src/parser.js";
import type { CanonicalStatementAnalysis, CanonicalTransactionCounts, CanonicalVolumePopulation } from "../../src/canonical/types.js";

describe("canonical runtime evidence lineage", () => {
  it("preserves card-type subtotal candidates without selecting the count fact", () => {
    const counts = transactionCountsFromParserSupport({
      primaryCount: 15,
      supportingCounts: [{ role: "card_type_items", value: 15, reason: "Card-type subtotal count." }],
      evidenceRefs: ["ev_card_type_items"],
      parserId: "synthetic_parser",
      parserVersion: null,
    });

    expect(counts.cardTypeItems).toMatchObject({
      status: "unavailable",
      value: null,
      selectedCandidateId: null,
    });
    expect(counts.cardTypeItems.candidates).toHaveLength(1);
    expect(counts.cardTypeItems.candidates[0]).toMatchObject({
      id: "cand_count_card_type_items_15",
      value: 15,
      selected: false,
      evidenceRefs: ["ev_card_type_items"],
    });
  });

  it("selects submitted and settled counts only when they are unique and evidenced", () => {
    const submitted = transactionCountsFromParserSupport({
      primaryCount: null,
      supportingCounts: [{ role: "submitted_transactions", value: 25, reason: "Statement-level submitted count." }],
      evidenceRefs: ["ev_submitted_count"],
      parserId: "synthetic_parser",
      parserVersion: null,
    });
    const settled = transactionCountsFromParserSupport({
      primaryCount: null,
      supportingCounts: [{ role: "settled_transactions", value: 20, reason: "Statement-level settled count." }],
      evidenceRefs: ["ev_settled_count"],
      parserId: "synthetic_parser",
      parserVersion: null,
    });

    expect(submitted.submittedTransactions.status).toBe("selected");
    expect(submitted.submittedTransactions.selectedCandidateId).toBe("cand_count_submitted_transactions_25");
    expect(submitted.submittedTransactions.candidates[0]?.selected).toBe(true);
    expect(settled.settledTransactions.status).toBe("selected");
    expect(settled.settledTransactions.selectedCandidateId).toBe("cand_count_settled_transactions_20");
  });

  it("keeps authorization, gross-sale, refund, and chargeback counts supporting only", () => {
    const counts = transactionCountsFromParserSupport({
      primaryCount: null,
      supportingCounts: [
        { role: "authorizations", value: 9, reason: "Auth population." },
        { role: "gross_sale_items", value: 8, reason: "Gross-sale subtotal." },
        { role: "refunds", value: 2, reason: "Refund population." },
        { role: "chargebacks", value: 1, reason: "Chargeback population." },
      ],
      evidenceRefs: ["ev_supporting_counts"],
      parserId: "synthetic_parser",
      parserVersion: null,
    });

    expect(counts.authorizations.status).toBe("unavailable");
    expect(counts.cardTypeItems.status).toBe("unavailable");
    expect(counts.refunds.status).toBe("unavailable");
    expect(counts.chargebacks.status).toBe("unavailable");
    for (const fact of [counts.authorizations, counts.cardTypeItems, counts.refunds, counts.chargebacks]) {
      expect(fact.selectedCandidateId).toBeNull();
      expect(fact.candidates[0]?.selected).toBe(false);
    }
  });

  it("does not fabricate evidence or select conflicting counts", () => {
    const missingEvidence = transactionCountsFromParserSupport({
      primaryCount: null,
      supportingCounts: [{ role: "submitted_transactions", value: 25, reason: "No source evidence." }],
      evidenceRefs: [],
      parserId: "synthetic_parser",
      parserVersion: null,
    });
    const conflicting = transactionCountsFromParserSupport({
      primaryCount: null,
      supportingCounts: [
        { role: "submitted_transactions", value: 25, reason: "First source." },
        { role: "submitted_transactions", value: 26, reason: "Second source." },
      ],
      evidenceRefs: ["ev_conflicting_counts"],
      parserId: "synthetic_parser",
      parserVersion: null,
    });

    expect(missingEvidence.submittedTransactions.status).toBe("unavailable");
    expect(missingEvidence.submittedTransactions.selectedCandidateId).toBeNull();
    expect(missingEvidence.submittedTransactions.candidates[0]?.evidenceRefs).toEqual([]);
    expect(conflicting.submittedTransactions.status).toBe("unavailable");
    expect(conflicting.submittedTransactions.selectedCandidateId).toBeNull();
    expect(conflicting.submittedTransactions.candidates.map((candidate) => candidate.selected)).toEqual([false, false]);
  });

  it("keeps average ticket unavailable unless count and volume populations match", () => {
    expect(averageTicket("submitted_sales", transactionCounts({ submittedTransactions: 25 }))).toEqual({
      amountMinor: 4000,
      currency: "USD",
    });
    expect(averageTicket("settled_sales", transactionCounts({ settledTransactions: 20 }))).toEqual({
      amountMinor: 5000,
      currency: "USD",
    });
    expect(averageTicket("submitted_sales", transactionCounts({ authorizations: 25 }))).toBeNull();
    expect(averageTicket("submitted_sales", transactionCounts({ cardTypeItems: 25 }))).toBeNull();
    expect(averageTicket("submitted_sales", transactionCounts({ settledTransactions: 20 }))).toBeNull();
  });

  it("validates safe core facts and effective rate when transaction count is unavailable", () => {
    const result = buildCanonicalRuntimeAnalysis({
      document: syntheticCoreTotalsDocument(),
      businessType: "retail",
      runtimeDocumentRef: "job_h1_1_missing_count",
      legacySummary: analyzeDocument(syntheticCoreTotalsDocument(), "retail"),
    });

    expect(result.analysis.validation.status).toBe("valid");
    expect(result.analysis.financialFacts.processedSales.status).toBe("selected");
    expect(result.analysis.financialFacts.totalFees.status).toBe("selected");
    expect(result.analysis.financialFacts.rateRevealCalculatedAllInRate.status).toBe("selected");
    expect(result.analysis.financialFacts.transactionCounts.submittedTransactions.status).toBe("unavailable");
    expect(result.analysis.financialFacts.averageTicket.value).toBeNull();
    expect(() => validateCanonicalStatementAnalysis(result.analysis)).not.toThrow();
  });

  it("keeps all selected fact candidate references internally consistent", () => {
    const analysis = buildCanonicalRuntimeAnalysis({
      document: syntheticCoreTotalsDocument(),
      businessType: "retail",
      runtimeDocumentRef: "job_h1_1_candidate_refs",
    }).analysis;

    for (const [path, fact] of factValues(analysis)) {
      if (fact.status !== "selected" || !fact.selectedCandidateId) continue;
      expect(fact.candidates.some((candidate: any) => candidate.id === fact.selectedCandidateId && candidate.selected), path).toBe(true);
    }
  });

  it("does not let shadow execution mutate AnalysisSummary or Report V1 inputs", () => {
    const document = syntheticCoreTotalsDocument();
    const summary = analyzeDocument(document, "retail");
    const beforeSummary = JSON.parse(JSON.stringify(summary));
    const beforeReport = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "h1-1-report-invariance",
      generatedAt: "2026-07-27T00:00:00.000Z",
    });

    buildCanonicalRuntimeAnalysis({
      document,
      businessType: "retail",
      runtimeDocumentRef: "job_h1_1_invariance",
      legacySummary: summary,
    });

    const afterReport = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "h1-1-report-invariance",
      generatedAt: "2026-07-27T00:00:00.000Z",
    });
    expect(summary).toEqual(beforeSummary);
    expect(afterReport).toEqual(beforeReport);
  });

  it("keeps deterministic core facts unchanged when OpenAI-related env values differ", () => {
    const document = syntheticCoreTotalsDocument();
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    try {
      delete process.env.OPENAI_API_KEY;
      const disabled = buildCanonicalRuntimeAnalysis({
        document,
        businessType: "retail",
        runtimeDocumentRef: "job_h1_1_ai_disabled",
      }).analysis;
      process.env.OPENAI_API_KEY = "local_test_key_not_used_by_canonical_runtime";
      const enabled = buildCanonicalRuntimeAnalysis({
        document,
        businessType: "retail",
        runtimeDocumentRef: "job_h1_1_ai_enabled",
      }).analysis;

      expect(coreSnapshot(enabled)).toEqual(coreSnapshot(disabled));
    } finally {
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });

  it("keeps unsupported and unusable inputs honestly unavailable", () => {
    for (const document of [unsupportedCsvDocument(), unusablePdfDocument()]) {
      const analysis = buildCanonicalRuntimeAnalysis({
        document,
        businessType: "other",
        runtimeDocumentRef: `job_h1_1_${document.sourceType}`,
      }).analysis;

      expect(analysis.validation.status).toBe("valid");
      expect(analysis.feeLedger.status).toBe("unavailable");
      expect(analysis.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual({ amountMinor: 0, currency: "USD" });
    }
  });
});

function transactionCounts(values: Partial<Record<keyof CanonicalTransactionCounts, number>>): CanonicalTransactionCounts {
  const counts = emptyTransactionCounts();
  for (const [field, value] of Object.entries(values)) {
    counts[field as keyof CanonicalTransactionCounts] = selectedFact({
      value,
      confidence: "high",
      evidenceRefs: [`ev_${field}`],
      selectionReason: `Verified ${field}.`,
    });
  }
  return counts;
}

function averageTicket(volumePopulation: CanonicalVolumePopulation, counts: CanonicalTransactionCounts) {
  return buildAverageTicket({
    processedSales: selectedFact({
      value: moneyFromNumber(1000)!,
      confidence: "high",
      evidenceRefs: ["ev_sales"],
      selectionReason: "Verified sales.",
    }),
    selectedVolumePopulation: volumePopulation,
    transactionCounts: counts,
    calculationRef: "calc_average_ticket",
    evidence: [],
  }).averageTicket.value;
}

function factValues(analysis: CanonicalStatementAnalysis): Array<[string, any]> {
  const values: Array<[string, any]> = [];
  function visit(value: any, path: string) {
    if (!value || typeof value !== "object") return;
    if ("status" in value && "candidates" in value && Array.isArray(value.candidates)) {
      values.push([path, value]);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "evidence" || key === "calculations") continue;
      visit(child, `${path}.${key}`);
    }
  }
  visit(analysis, "analysis");
  return values;
}

function coreSnapshot(analysis: CanonicalStatementAnalysis) {
  return {
    processedSales: analysis.financialFacts.processedSales,
    totalFees: analysis.financialFacts.totalFees,
    effectiveRate: analysis.financialFacts.rateRevealCalculatedAllInRate,
    ledgerStatus: analysis.feeLedger.status,
  };
}

function syntheticCoreTotalsDocument(): ParsedDocument {
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
    ...syntheticCoreTotalsDocument(),
    sourceType: "csv",
    headers: ["label", "amount"],
    rows: [{ label: "Other processor service charge", amount: 25 }],
    textPreview: "Other processor service charge 25",
  };
}

function unusablePdfDocument(): ParsedDocument {
  return {
    sourceType: "pdf",
    headers: [],
    rows: [],
    textPreview: "",
    extraction: {
      mode: "unusable",
      qualityScore: 0,
      reasons: ["Synthetic image-only PDF."],
      lineCount: 0,
      amountTokenCount: 0,
      hasExtractableText: false,
    },
  };
}
