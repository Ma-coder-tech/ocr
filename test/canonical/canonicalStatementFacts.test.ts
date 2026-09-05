import { describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument, canonicalActualValues } from "../../src/canonical/buildCanonicalFacts.js";
import { makeEvidenceRecord, attachParserInterpretation } from "../../src/canonical/evidence.js";
import { selectedFact } from "../../src/canonical/facts.js";
import { moneyFromDecimalString, moneyFromNumber } from "../../src/canonical/money.js";
import { buildAverageTicket, emptyTransactionCounts, transactionCountsFromParserSupport } from "../../src/canonical/transactionCounts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type { ParsedDocument } from "../../src/parser.js";
import type { CanonicalStatementAnalysis, CanonicalTransactionCounts, CanonicalVolumePopulation } from "../../src/canonical/types.js";

describe("canonical statement facts", () => {
  it("builds canonical money, effective-rate basis, and unavailable average ticket from extracted rows", () => {
    const analysis = buildCanonicalStatementFactsFromParsedDocument(syntheticSummaryDocument(), {
      sourceFileName: "synthetic-summary.pdf",
      businessType: "restaurant",
    });
    const actual = canonicalActualValues(analysis);

    expect(actual["financialFacts.processedSales"]).toEqual({ amountMinor: 123456, currency: "USD" });
    expect(actual["financialFacts.totalFees"]).toEqual({ amountMinor: 4321, currency: "USD" });
    expect(actual["financialFacts.effectiveRate.rateRevealCalculatedAllInRate"]).toBe("0.035000");
    expect(actual["financialFacts.effectiveRate.numeratorFeeBasis"]).toBe("all_in_processing_fees");
    expect(actual["financialFacts.effectiveRate.denominatorVolumeBasis"]).toBe("submitted_sales");
    expect(actual["financialFacts.effectiveRate.processorStatedRate"]).toBeNull();
    expect(actual["financialFacts.averageTicket"]).toBeNull();
    expect(actual["financialFacts.averageTicketBasis.allowed"]).toBe(false);
    expect(analysis.validation.status).toBe("valid");
  });

  it("does not promote card-type item counts to submitted transactions or average ticket", () => {
    const counts = transactionCountsFromParserSupport({
      primaryCount: 300,
      supportingCounts: [{ role: "card_type_items", value: 300, reason: "Narrow card-type total row." }],
      evidenceRefs: ["ev_card_type_count"],
      parserId: "fiserv_first_data_processor_statement",
      parserVersion: null,
    });
    const processedSales = selectedFact({
      value: moneyFromNumber(100000)!,
      confidence: "high",
      evidenceRefs: ["ev_sales"],
      selectionReason: "Verified submitted sales.",
    });
    const average = buildAverageTicket({
      processedSales,
      selectedVolumePopulation: "submitted_sales",
      transactionCounts: counts,
      calculationRef: "calc_average_ticket",
      evidence: [],
    });

    expect(counts.cardTypeItems.value).toBeNull();
    expect(counts.cardTypeItems.status).toBe("unavailable");
    expect(counts.cardTypeItems.selectedCandidateId).toBeNull();
    expect(counts.cardTypeItems.candidates).toHaveLength(1);
    expect(counts.cardTypeItems.candidates[0]).toMatchObject({
      value: 300,
      selected: false,
      rejectionReason: "Count population is not approved as a statement-level average-ticket denominator.",
    });
    expect(counts.submittedTransactions.value).toBeNull();
    expect(average.basis.allowed).toBe(false);
    expect(average.basis.selectedCountType).toBeNull();
    expect(average.averageTicket.value).toBeNull();
  });

  it("allows average ticket only when sales and count populations match", () => {
    const submittedCounts = emptyTransactionCounts();
    submittedCounts.submittedTransactions = selectedFact({
      value: 25,
      confidence: "high",
      evidenceRefs: ["ev_submitted_count"],
      selectionReason: "Verified submitted transaction count.",
    });
    const settledCounts = emptyTransactionCounts();
    settledCounts.settledTransactions = selectedFact({
      value: 20,
      confidence: "high",
      evidenceRefs: ["ev_settled_count"],
      selectionReason: "Verified settled transaction count.",
    });
    const processedSales = selectedFact({
      value: moneyFromNumber(1000)!,
      confidence: "high",
      evidenceRefs: ["ev_sales"],
      selectionReason: "Verified sales.",
    });

    expect(
      buildAverageTicket({
        processedSales,
        selectedVolumePopulation: "submitted_sales",
        transactionCounts: submittedCounts,
        calculationRef: "calc_submitted_avg",
        evidence: [],
      }).averageTicket.value,
    ).toEqual({ amountMinor: 4000, currency: "USD" });

    expect(
      buildAverageTicket({
        processedSales,
        selectedVolumePopulation: "settled_sales",
        transactionCounts: settledCounts,
        calculationRef: "calc_settled_avg",
        evidence: [],
      }).averageTicket.value,
    ).toEqual({ amountMinor: 5000, currency: "USD" });

    expect(
      buildAverageTicket({
        processedSales,
        selectedVolumePopulation: "submitted_sales",
        transactionCounts: settledCounts,
        calculationRef: "calc_incompatible_avg",
        evidence: [],
      }).averageTicket.value,
    ).toBeNull();
  });

  it("covers universal transaction-count population rules", () => {
    expect(averageTicketValue({ volumePopulation: "submitted_sales", countField: "submittedTransactions", count: 25 })).toEqual({
      amountMinor: 4000,
      currency: "USD",
    });
    expect(averageTicketValue({ volumePopulation: "settled_sales", countField: "settledTransactions", count: 20 })).toEqual({
      amountMinor: 5000,
      currency: "USD",
    });
    expect(averageTicketValue({ volumePopulation: "submitted_sales", countField: "authorizations", count: 25 })).toBeNull();
    expect(
      averageTicketValue({
        volumePopulation: "submitted_sales",
        countField: "submittedTransactions",
        count: 25,
        competingCountField: "cardTypeItems",
        competingCount: 300,
      }),
    ).toEqual({ amountMinor: 4000, currency: "USD" });
    expect(averageTicketFromDocument(multipleTotalRowsDocument())["financialFacts.processedSales"]).toEqual({
      amountMinor: 123456,
      currency: "USD",
    });
    expect(averageTicketValue({ volumePopulation: "submitted_sales" })).toBeNull();
    expect(
      averageTicketValue({
        volumePopulation: "submitted_sales",
        countField: "submittedTransactions",
        count: 25,
        competingCountField: "unknownCounts",
        competingCount: 99,
      }),
    ).toEqual({ amountMinor: 4000, currency: "USD" });
    expect(averageTicketValue({ volumePopulation: "submitted_sales", countField: "refunds", count: 3 })).toBeNull();
    expect(averageTicketValue({ volumePopulation: "submitted_sales", countField: "chargebacks", count: 2 })).toBeNull();
    expect(averageTicketValue({ volumePopulation: "submitted_sales", countField: "submittedTransactions", count: 25, sales: 0 })).toBeNull();
    expect(averageTicketValue({ volumePopulation: "submitted_sales", countField: "settledTransactions", count: 20 })).toBeNull();
  });

  it("parses canonical money safely as integer cents", () => {
    expect(moneyFromDecimalString("$1,234.565")).toEqual({ amountMinor: 123457, currency: "USD" });
    expect(moneyFromDecimalString("-12.345")).toEqual({ amountMinor: -1235, currency: "USD" });
    expect(moneyFromDecimalString("not money")).toBeNull();
    expect(moneyFromNumber(Number.NaN)).toBeNull();
    expect(moneyFromNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(moneyFromNumber(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(moneyFromDecimalString("900719925474099199.99")).toBeNull();
  });

  it("rejects canonical validation contradictions", () => {
    const valid = buildCanonicalStatementFactsFromParsedDocument(syntheticSummaryDocument(), {
      sourceFileName: "synthetic-summary.pdf",
      businessType: "restaurant",
    });

    const withoutEvidence = structuredClone(valid) as CanonicalStatementAnalysis;
    withoutEvidence.financialFacts.processedSales.evidenceRefs = [];
    expect(() => validateCanonicalStatementAnalysis(withoutEvidence)).toThrow(/without evidence or calculation/);

    const badAverage = structuredClone(valid) as CanonicalStatementAnalysis;
    badAverage.financialFacts.averageTicket = selectedFact({
      value: { amountMinor: 1000, currency: "USD" },
      confidence: "high",
      evidenceRefs: [valid.evidence[0]!.id],
      selectionReason: "Invalid test value.",
    });
    expect(() => validateCanonicalStatementAnalysis(badAverage)).toThrow(/Average ticket has a value/);

    const unsupportedRate = structuredClone(valid) as CanonicalStatementAnalysis;
    unsupportedRate.financialFacts.effectiveRateBasis.numeratorFeeBasis = "unsupported";
    expect(() => validateCanonicalStatementAnalysis(unsupportedRate)).toThrow(/Selected effective rate requires explicit supported/);

    const brokenRef = structuredClone(valid) as CanonicalStatementAnalysis;
    brokenRef.financialFacts.totalFees.evidenceRefs = ["ev_missing"];
    expect(() => validateCanonicalStatementAnalysis(brokenRef)).toThrow(/broken/);

    const authorityExpansion = structuredClone(valid) as CanonicalStatementAnalysis;
    authorityExpansion.crossSummaryLinkEvidence.authority = "financial_authority" as never;
    expect(() => validateCanonicalStatementAnalysis(authorityExpansion)).toThrow(/diagnostic-only/);

    const unsupportedAdjudication = structuredClone(valid) as CanonicalStatementAnalysis;
    unsupportedAdjudication.crossSummaryLinkEvidence.adjudicationPolicyVersion = "unsupported" as never;
    expect(() => validateCanonicalStatementAnalysis(unsupportedAdjudication)).toThrow(/adjudication policy/);

    const unsupportedFeeRollup = structuredClone(valid) as CanonicalStatementAnalysis;
    unsupportedFeeRollup.crossSummaryLinkEvidence.feeRollupPolicyVersion = "unsupported" as never;
    expect(() => validateCanonicalStatementAnalysis(unsupportedFeeRollup)).toThrow(/roll-up completeness/);

    const unsupportedFeeRollupManifest = structuredClone(valid) as CanonicalStatementAnalysis;
    unsupportedFeeRollupManifest.versionManifest.feeRollupCompletenessPolicyVersion = "unsupported" as never;
    expect(() => validateCanonicalStatementAnalysis(unsupportedFeeRollupManifest)).toThrow(/fee_rollup_completeness/);

    const contradictoryCandidate = structuredClone(valid) as CanonicalStatementAnalysis;
    contradictoryCandidate.financialFacts.processedSales.candidates.push(
      {
        id: "cand_one",
        role: "statement_level_total",
        value: { amountMinor: 1000, currency: "USD" },
        evidenceRefs: [valid.evidence[0]!.id],
        parserId: null,
        parserVersion: null,
        extractionMethod: "pdf_text",
        confidence: "high",
        selected: true,
        selectionReason: "Selected for invalid test.",
        rejectionReason: null,
      },
      {
        id: "cand_two",
        role: "statement_level_total",
        value: { amountMinor: 2000, currency: "USD" },
        evidenceRefs: [valid.evidence[0]!.id],
        parserId: null,
        parserVersion: null,
        extractionMethod: "pdf_text",
        confidence: "high",
        selected: true,
        selectionReason: "Also selected for invalid test.",
        rejectionReason: null,
      },
    );
    expect(() => validateCanonicalStatementAnalysis(contradictoryCandidate)).toThrow(/multiple selected candidates/);

    const missingManifest = structuredClone(valid) as CanonicalStatementAnalysis;
    (missingManifest as any).versionManifest = undefined;
    expect(() => validateCanonicalStatementAnalysis(missingManifest)).toThrow(/version manifest/);
  });

  it("keeps source evidence identity stable across parser-version interpretations", () => {
    const evidence = makeEvidenceRecord({
      documentId: "doc_test",
      pageNumber: 1,
      rowIndex: 7,
      extractedText: "Total Amount Submitted | $1,234.56",
      sourceRole: "selected_fact",
    });
    const first = attachParserInterpretation(evidence, {
      parserId: "parser",
      parserVersion: "v1",
      interpretedRole: "processedSales",
      interpretedValue: moneyFromNumber(1234.56),
      confidence: "high",
    });
    const second = attachParserInterpretation(evidence, {
      parserId: "parser",
      parserVersion: "v2",
      interpretedRole: "processedSales",
      interpretedValue: moneyFromNumber(1234.56),
      confidence: "high",
    });

    expect(first.id).toBe(second.id);
    expect(first.parserInterpretations[0]?.id).not.toBe(second.parserInterpretations[0]?.id);
  });
});

function averageTicketValue(input: {
  volumePopulation: CanonicalVolumePopulation;
  countField?: keyof CanonicalTransactionCounts;
  count?: number;
  competingCountField?: keyof CanonicalTransactionCounts;
  competingCount?: number;
  sales?: number;
}) {
  const counts = emptyTransactionCounts();
  if (input.countField && input.count !== undefined) {
    counts[input.countField] = selectedFact({
      value: input.count,
      confidence: "high",
      evidenceRefs: [`ev_${input.countField}`],
      selectionReason: `Verified ${input.countField}.`,
    });
  }
  if (input.competingCountField && input.competingCount !== undefined) {
    counts[input.competingCountField] = selectedFact({
      value: input.competingCount,
      confidence: "medium",
      evidenceRefs: [`ev_${input.competingCountField}`],
      selectionReason: `Preserved ${input.competingCountField}.`,
    });
  }
  const processedSales = selectedFact({
    value: moneyFromNumber(input.sales ?? 1000)!,
    confidence: "high",
    evidenceRefs: ["ev_sales"],
    selectionReason: "Verified sales.",
  });
  return buildAverageTicket({
    processedSales,
    selectedVolumePopulation: input.volumePopulation,
    transactionCounts: counts,
    calculationRef: "calc_average_ticket",
    evidence: [],
  }).averageTicket.value;
}

function averageTicketFromDocument(doc: ParsedDocument) {
  return canonicalActualValues(
    buildCanonicalStatementFactsFromParsedDocument(doc, {
      sourceFileName: "synthetic-multiple-total-rows.pdf",
      businessType: "restaurant",
      preferExtractedRows: true,
    }),
  );
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

function multipleTotalRowsDocument(): ParsedDocument {
  return {
    ...syntheticSummaryDocument(),
    rows: [
      { content: "Total Amount Submitted | $1,234.56", page: "page-1" },
      { content: "YTD Total Amount Submitted | $9,999.99", page: "page-1" },
      { content: "Fees Charged | -$43.21", page: "page-1" },
    ],
    textPreview: "Total Amount Submitted $1,234.56 YTD Total Amount Submitted $9,999.99 Fees Charged -$43.21",
  };
}
