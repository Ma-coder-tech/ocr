import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBusinessQualificationAndRateComparison,
  type CanonicalBusinessProfileInput,
} from "../../src/canonical/businessQualification.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { makeEvidenceRecord } from "../../src/canonical/evidence.js";
import { selectedFact, unavailableFact } from "../../src/canonical/facts.js";
import {
  loadQualifiedBenchmarkRegistry,
  validateQualifiedBenchmarkRegistry,
  type QualifiedBenchmarkRegistry,
} from "../../src/canonical/qualifiedBenchmarkRegistry.js";
import { emptyTransactionCounts } from "../../src/canonical/transactionCounts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import { parsePdf } from "../../src/parser.js";
import type {
  CanonicalCalculationRecord,
  CanonicalEvidenceRecord,
  CanonicalFinancialFacts,
  CanonicalStatementIdentity,
} from "../../src/canonical/types.js";

const EL_NUEVO_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");

describe("Package 1 canonical business qualification", () => {
  it("fails closed with no merchant-facing entries after the provenance review", () => {
    const registry = loadQualifiedBenchmarkRegistry();
    expect(registry.normalRuntimeNetworkRequired).toBe(false);
    expect(registry.entries).toEqual([]);
    expect(registry.sourceRecords).toEqual([]);
    expect(registry.provenanceReview.candidateRangeAssessments).toEqual([
      expect.objectContaining({ segmentId: "restaurant_food_service", previousRange: { low: "0.021000", high: "0.026000" }, decision: "unavailable" }),
      expect.objectContaining({ segmentId: "grocery_specialty_food", previousRange: { low: "0.018000", high: "0.023000" }, decision: "unavailable" }),
    ]);
  });

  it("rejects a merchant-facing entry without sufficient provenance", () => {
    const registry = eligibleTestRegistry();
    registry.entries[0]!.sourceIds = [];
    expect(() => validateQualifiedBenchmarkRegistry(registry)).toThrow(/source provenance/);
  });

  it("rejects legacy locators, bundled publishers, missing dates, and unpinned content", () => {
    const legacyLocator = eligibleTestRegistry();
    legacyLocator.sourceRecords[0]!.locator = "repository:data/fiserv-fee-analysis/mcc_benchmark_reference.json#sources";
    expect(() => validateQualifiedBenchmarkRegistry(legacyLocator)).toThrow(/direct HTTPS locator/);

    const bundledPublisher = eligibleTestRegistry();
    bundledPublisher.sourceRecords[0]!.publisher = "Publisher One and Publisher Two";
    expect(() => validateQualifiedBenchmarkRegistry(bundledPublisher)).toThrow(/one publisher/);

    const missingPublicationDate = eligibleTestRegistry();
    missingPublicationDate.sourceRecords[0]!.publishedAt = "";
    expect(() => validateQualifiedBenchmarkRegistry(missingPublicationDate)).toThrow(/publication/);

    const unpinnedContent = eligibleTestRegistry();
    unpinnedContent.sourceRecords[0]!.contentDigestSha256 = "not-a-digest";
    expect(() => validateQualifiedBenchmarkRegistry(unpinnedContent)).toThrow(/SHA-256/);
  });

  it("rejects prose-and-source-count provenance when exact boundaries do not reconstruct", () => {
    const registry = eligibleTestRegistry();
    registry.entries[0]!.derivation.lowerBound.result = "0.020000";
    expect(() => validateQualifiedBenchmarkRegistry(registry)).toThrow(/does not reconstruct to the displayed range/);

    const unlinkedMetric = eligibleTestRegistry();
    unlinkedMetric.entries[0]!.derivation.inputs[0]!.metricId = "unsupported_metric";
    expect(() => validateQualifiedBenchmarkRegistry(unlinkedMetric)).toThrow(/does not reconstruct from a linked source metric/);
  });

  it("rejects unsupported factors and overlapping entries instead of choosing a default", () => {
    const invalidFactorRegistry = eligibleTestRegistry();
    invalidFactorRegistry.entries[0]!.channel = "unknown" as never;
    expect(() => validateQualifiedBenchmarkRegistry(invalidFactorRegistry)).toThrow(/unsupported channel/);

    const overlappingRegistry = eligibleTestRegistry();
    overlappingRegistry.entries.push({ ...overlappingRegistry.entries[0]!, referenceId: "duplicate_applicability" });
    expect(() => validateQualifiedBenchmarkRegistry(overlappingRegistry)).toThrow(/overlap for the same qualification factors/);
  });

  it("keeps restaurant business qualification but returns unavailable with the reviewed registry", () => {
    const result = qualify({
      merchantName: "Neighborhood dining company",
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Mexican restaurant and bar",
      effectiveRate: "0.025000",
    });
    expect(result.businessQualification).toMatchObject({
      status: "qualified",
      resolvedSegmentId: "restaurant_food_service",
      risk: { value: "standard", status: "qualified" },
      channel: { value: "card_present", status: "qualified" },
      annualVolume: { tier: "100k_500k", status: "qualified", source: "statement_month_x12" },
    });
    expect(result.rateComparison).toMatchObject({ status: "unavailable", position: "unavailable", benchmarkRef: null, calculationRef: null });
  });

  it("qualifies only a reproducibly derived injected reference and never creates savings", () => {
    const result = qualify({
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Restaurant",
      effectiveRate: "0.025000",
      registry: eligibleTestRegistry(),
    });
    expect(result.rateComparison).toMatchObject({
      status: "qualified",
      position: "within_reference",
      benchmarkRef: {
        segmentId: "restaurant_food_service",
        range: { low: "0.021000", high: "0.026000" },
        derivation: { methodVersion: "qualified_benchmark_linear_derivation_v1" },
        opportunityApproved: false,
        aiSourced: false,
      },
    });
    expect(JSON.stringify(result.rateComparison)).not.toMatch(/savings|overpayment|recoverable|annualImpact|monthlyImpact/i);
  });

  it("resolves specialty grocery without collapsing it into general retail but withholds the unsupported range", () => {
    const result = qualify({ selectedCategoryId: "retail", freeTextDescription: "Specialty grocery market", effectiveRate: "0.024000" });
    expect(result.businessQualification.resolvedSegmentId).toBe("grocery_specialty_food");
    expect(result.rateComparison).toMatchObject({ status: "unavailable", position: "unavailable", benchmarkRef: null });
  });

  it("uses merchant declaration over a weak merchant-name alternative", () => {
    const result = qualify({ merchantName: "Main Street Retail Group", selectedCategoryId: "restaurant_food_beverage", freeTextDescription: "Restaurant" });
    expect(result.businessQualification.status).toBe("qualified");
    expect(result.businessQualification.resolvedSegmentId).toBe("restaurant_food_service");
    expect(result.businessQualification.alternatives).toContainEqual(expect.objectContaining({ segmentId: "general_retail", source: "merchant_name_signal", authoritative: false }));
  });

  it("requires confirmation when standard retail conflicts with strong high-risk context", () => {
    const result = qualify({ merchantName: "Downtown Vape and Smoke", selectedCategoryId: "retail", freeTextDescription: "General retail store" });
    expect(result.businessQualification.status).toBe("confirmation_required");
    expect(result.businessQualification.conflicts).toContainEqual(expect.objectContaining({ kind: "high_risk_conflict", material: true }));
    expect(result.rateComparison).toMatchObject({ status: "confirmation_required", position: "unavailable", benchmarkRef: null, calculationRef: null });
  });

  it("preserves an explicit MCC separately and requires confirmation when it conflicts with declaration", () => {
    const result = qualify({
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Restaurant",
      statementLines: ["MERCHANT CATEGORY CODE | 5411"],
    });
    expect(result.businessQualification.accountCoding).toMatchObject({
      source: "explicit_statement",
      actualMcc: { value: "5411", status: "selected" },
    });
    expect(result.businessQualification.merchantDeclaration.freeTextDescription).toBe("Restaurant");
    expect(result.businessQualification.conflicts).toContainEqual(expect.objectContaining({ kind: "mcc_conflict", material: true }));
    expect(result.rateComparison.status).toBe("confirmation_required");
  });

  it("does not fabricate MCC from declaration, merchant name, AI, or loose statement text", () => {
    const result = qualify({
      merchantName: "MCC 5812 Restaurant Group",
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Restaurant MCC 5812",
      statementLines: ["Merchant memo says MCC 5812 but this is not an account-coding field"],
      aiSuggestion: { segmentId: "restaurant_food_service", confidence: "high", reason: "Suggested restaurant" },
    });
    expect(result.businessQualification.accountCoding).toMatchObject({ source: "not_available", actualMcc: { value: null, status: "unavailable" } });
  });

  it("requires confirmation when a supported statement contains conflicting explicit MCC values", () => {
    const result = qualify({
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Restaurant",
      statementLines: ["MCC: 5812", "MERCHANT CATEGORY CODE | 5411"],
    });
    expect(result.businessQualification.accountCoding).toMatchObject({ source: "conflicting_statement_values", actualMcc: { value: null, status: "ambiguous" } });
    expect(result.businessQualification.conflicts).toContainEqual(expect.objectContaining({ id: "conflict_multiple_explicit_mcc_values", material: true }));
    expect(result.businessQualification.status).toBe("confirmation_required");
    expect(result.rateComparison.status).toBe("confirmation_required");
  });

  it("fails closed when an explicit MCC is outside the approved deterministic mapping", () => {
    const result = qualify({
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Restaurant",
      statementLines: ["MCC: 7999"],
    });
    expect(result.businessQualification.accountCoding.actualMcc.value).toBe("7999");
    expect(result.businessQualification.conflicts).toContainEqual(expect.objectContaining({ id: "conflict_unmapped_explicit_mcc", material: true }));
    expect(result.businessQualification.status).toBe("confirmation_required");
    expect(result.rateComparison.status).toBe("confirmation_required");
  });

  it("keeps business type and card-not-present channel distinct and withholds unsupported coverage", () => {
    const result = qualify({ selectedCategoryId: "restaurant_food_beverage", freeTextDescription: "Restaurant", channel: "card_not_present" });
    expect(result.businessQualification).toMatchObject({ status: "qualified", resolvedSegmentId: "restaurant_food_service", channel: { value: "card_not_present" } });
    expect(result.rateComparison).toMatchObject({ status: "unavailable", position: "unavailable", benchmarkRef: null });
  });

  it("retains AI disagreement only as a non-authoritative alternative", () => {
    const result = qualify({
      selectedCategoryId: "restaurant_food_beverage",
      freeTextDescription: "Restaurant",
      aiSuggestion: { segmentId: "general_retail", confidence: "high", reason: "Model disagreed" },
    });
    expect(result.businessQualification.status).toBe("qualified");
    expect(result.businessQualification.resolvedSegmentId).toBe("restaurant_food_service");
    expect(result.businessQualification.aiAuthoritative).toBe(false);
    expect(result.businessQualification.alternatives).toContainEqual(expect.objectContaining({ source: "ai_suggestion", authoritative: false }));
  });

  it.each([
    ["Mobile phone repair", "mobile_phone_repair"],
    ["Veterinary clinic", "professional_services"],
    ["Auto repair and tire shop", "auto_repair"],
    ["Online ecommerce store", "general_retail"],
  ])("resolves %s but returns unavailable when no admitted reference covers it", (description, segmentId) => {
    const result = qualify({ freeTextDescription: description });
    expect(result.businessQualification).toMatchObject({ status: "qualified", resolvedSegmentId: segmentId });
    expect(result.rateComparison.status).toBe("unavailable");
  });

  it("requires confirmation for an ambiguous business declaration", () => {
    const result = qualify({ selectedCategoryId: "other", freeTextDescription: "Local family business" });
    expect(result.businessQualification.status).toBe("confirmation_required");
    expect(result.businessQualification.confirmationRequirement?.reasonCode).toBe("business_declaration_required");
    expect(result.rateComparison.status).toBe("confirmation_required");
  });

  it("withholds historical statements outside the entry's complete applicable period", () => {
    const result = qualify({ selectedCategoryId: "restaurant_food_beverage", freeTextDescription: "Restaurant", period: { start: "2024-09-01", end: "2024-09-30" } });
    expect(result.businessQualification.status).toBe("qualified");
    expect(result.rateComparison).toMatchObject({ status: "unavailable", reasonCodes: ["qualified_reference_not_available_for_factors_or_period"] });
  });

  it("requires confirmation when a one-month annualized estimate is near a volume-tier boundary", () => {
    const result = qualify({ selectedCategoryId: "restaurant_food_beverage", freeTextDescription: "Restaurant", processedSalesUsd: 8_333.33 });
    expect(result.businessQualification.annualVolume).toMatchObject({ status: "confirmation_required", tier: "under_100k" });
    expect(result.businessQualification.status).toBe("confirmation_required");
    expect(result.rateComparison.status).toBe("confirmation_required");
  });

  it("validates a fully qualified comparison without changing Packages B–E", async () => {
    const doc = await parsePdf(EL_NUEVO_PDF_PATH);
    const profile: CanonicalBusinessProfileInput = {
      merchantDeclaration: { selectedCategoryId: "restaurant_food_beverage", freeTextDescription: "Mexican restaurant and bar" },
      confirmation: { confirmedChannel: "card_present", confirmedAnnualVolumeUsd: 300_000 },
      market: "US",
    };
    const baseline = buildCanonicalStatementFactsFromParsedDocument(doc, {
      sourceFileName: "fixture.pdf",
      businessType: "restaurant_food_beverage",
      businessProfile: profile,
    });
    const historicalRegistry = registryForPeriod("2024-01-01", "2024-12-31");
    const qualified = buildCanonicalStatementFactsFromParsedDocument(doc, {
      sourceFileName: "fixture.pdf",
      businessType: "restaurant_food_beverage",
      businessProfile: profile,
      benchmarkRegistry: historicalRegistry,
    });

    expect(baseline.customerState.rateComparison.status).toBe("unavailable");
    expect(qualified.validation.status).toMatch(/^valid/);
    expect(qualified.businessQualification.status).toBe("qualified");
    expect(qualified.customerState.rateComparison.status).toBe("qualified");
    expect(qualified.financialFacts).toEqual(baseline.financialFacts);
    expect(qualified.feeLedger).toEqual(baseline.feeLedger);
    expect(qualified.feeOwnershipActionability).toEqual(baseline.feeOwnershipActionability);
    expect(qualified.opportunityEngine).toEqual(baseline.opportunityEngine);

    const tampered = structuredClone(qualified);
    const calculation = tampered.calculations.find((item) => item.id === tampered.customerState.rateComparison.calculationRef)!;
    calculation.inputs.find((item) => item.label === "Reference range upper boundary")!.value = "0.099000";
    expect(() => validateCanonicalStatementAnalysis(tampered)).toThrow(/benchmark position does not reconstruct/);

    const unsupportedProvenance = structuredClone(qualified);
    unsupportedProvenance.customerState.rateComparison.benchmarkRef!.sourceRecords![0]!.locator =
      "repository:data/fiserv-fee-analysis/mcc_benchmark_reference.json#sources";
    expect(() => validateCanonicalStatementAnalysis(unsupportedProvenance)).toThrow(/derivation does not reconstruct from concrete source metrics/);

    const unsupportedDerivation = structuredClone(qualified);
    unsupportedDerivation.customerState.rateComparison.benchmarkRef!.derivation!.upperBound.result = "0.025000";
    expect(() => validateCanonicalStatementAnalysis(unsupportedDerivation)).toThrow(/derivation does not reconstruct from concrete source metrics/);

    const fabricatedMcc = structuredClone(qualified);
    const looseMccEvidence = makeEvidenceRecord({
      documentId: fabricatedMcc.identity.sourceDocumentRef,
      pageNumber: 1,
      rowIndex: 0,
      section: "statement_identity",
      extractedText: "Merchant memo says MCC 5812 but this is not an account-coding field",
      sourceRole: "account_coding",
      confidence: "high",
      extractionMethod: "pdf_text",
    });
    fabricatedMcc.evidence.push(looseMccEvidence);
    fabricatedMcc.businessQualification.accountCoding = {
      source: "explicit_statement",
      actualMcc: selectedFact({ value: "5812", confidence: "high", evidenceRefs: [looseMccEvidence.id], selectionReason: "Fabricated mutation." }),
    };
    expect(() => validateCanonicalStatementAnalysis(fabricatedMcc)).toThrow(/not an explicitly labeled MCC statement field/);
  });
});

function qualify(options: {
  merchantName?: string;
  selectedCategoryId?: string | null;
  freeTextDescription?: string | null;
  effectiveRate?: string;
  processedSalesUsd?: number;
  channel?: "card_present" | "card_not_present" | "mixed";
  period?: { start: string; end: string };
  statementLines?: string[];
  aiSuggestion?: CanonicalBusinessProfileInput["aiSuggestion"];
  registry?: QualifiedBenchmarkRegistry;
}) {
  const evidence = new Map<string, CanonicalEvidenceRecord>();
  const context = makeEvidenceRecord({
    documentId: "doc_package_1_fixture",
    pageNumber: 1,
    rowIndex: 0,
    section: "fixture",
    extractedText: "Synthetic Package 1 fixture context",
    sourceRole: "selected_fact",
    confidence: "high",
    extractionMethod: "document_ir",
  });
  evidence.set(context.id, context);
  const period = options.period ?? { start: "2026-08-01", end: "2026-08-31" };
  const processedSalesUsd = options.processedSalesUsd ?? 25_000;
  const effectiveRate = options.effectiveRate ?? "0.025000";
  const identity: CanonicalStatementIdentity = {
    merchantName: selectedFact({ value: options.merchantName ?? "Fixture Merchant", confidence: "high", evidenceRefs: [context.id], selectionReason: "Fixture identity." }),
    merchantIdentifier: unavailableFact("Not needed for Package 1 fixture."),
    processorName: selectedFact({ value: "Fiserv", confidence: "high", evidenceRefs: [context.id], selectionReason: "Fixture processor." }),
    processorFamily: selectedFact({ value: "Fiserv / First Data", confidence: "high", evidenceRefs: [context.id], selectionReason: "Fixture processor family." }),
    statementPeriod: selectedFact({ value: period, confidence: "high", evidenceRefs: [context.id], selectionReason: "Fixture period." }),
    businessType: selectedFact({ value: options.selectedCategoryId ?? "other", confidence: "high", evidenceRefs: [context.id], selectionReason: "Fixture legacy declaration." }),
    sourceDocumentRef: "doc_package_1_fixture",
  };
  const financialFacts = financialFactsFixture(processedSalesUsd, effectiveRate, context.id);
  const channel = options.channel ?? "card_present";
  const statementLines = options.statementLines ?? [];
  const doc = {
    sourceType: "pdf" as const,
    headers: [],
    rows: statementLines.map((content, index) => ({ content, page: "page-1", rowIndex: index })),
    textPreview: statementLines.join(" "),
    extraction: { mode: "structured" as const, qualityScore: 1, reasons: [], lineCount: statementLines.length, amountTokenCount: 0, hasExtractableText: true },
  };
  const calculations: CanonicalCalculationRecord[] = [];
  return buildBusinessQualificationAndRateComparison({
    doc,
    matchedParserId: "fiserv_first_data_full_statement_v1",
    parserOutput: {
      fiservFeeAnalysisV2: {
        merchantChannelAnalysis: {
          status: "detected",
          merchantChannel: channel,
          confidence: "high",
          signals: [{ type: channel === "card_present" ? "card_present" : "card_not_present", description: "Fixture channel", evidenceLine: `Explicit ${channel} statement signal`, rowIndex: 50 }],
        },
      },
    },
    identity,
    financialFacts,
    profile: {
      merchantDeclaration: {
        selectedCategoryId: options.selectedCategoryId ?? null,
        freeTextDescription: options.freeTextDescription ?? null,
      },
      market: "US",
      aiSuggestion: options.aiSuggestion,
    },
    registry: options.registry,
    evidence,
    calculations,
  });
}

function financialFactsFixture(processedSalesUsd: number, effectiveRate: string, evidenceRef: string): CanonicalFinancialFacts {
  const processedSales = { amountMinor: Math.round(processedSalesUsd * 100), currency: "USD" as const };
  const totalFees = { amountMinor: Math.round(processedSales.amountMinor * Number(effectiveRate)), currency: "USD" as const };
  return {
    processedSales: selectedFact({ value: processedSales, confidence: "high", evidenceRefs: [evidenceRef], selectionReason: "Fixture processed sales." }),
    totalFees: selectedFact({ value: totalFees, confidence: "high", evidenceRefs: [evidenceRef], selectionReason: "Fixture total fees." }),
    rateRevealCalculatedAllInRate: selectedFact({ value: effectiveRate, confidence: "high", evidenceRefs: [evidenceRef], selectionReason: "Fixture deterministic rate.", calculationRef: "calc_fixture_rate" }),
    processorStatedRate: unavailableFact("Not needed."),
    effectiveRateBasis: {
      policyVersion: "effective_rate_basis_v1",
      numeratorFeeBasis: "all_in_processing_fees",
      denominatorVolumeBasis: "submitted_sales",
      refundsTreatment: "not_present",
      cashAdvanceTreatment: "not_present",
      equipmentFeeTreatment: "included",
      chargebackTreatment: "included",
      oneTimeFeeTreatment: "included",
      populationCompatibility: "compatible",
      rateSource: "ratereveal_calculated",
      processorStatedRate: unavailableFact("Not needed."),
      calculationRef: "calc_fixture_rate",
      explanation: "Fixture deterministic effective-rate basis.",
    },
    transactionCounts: emptyTransactionCounts(),
    averageTicketBasis: { selectedCountType: null, selectedVolumePopulation: "submitted_sales", allowed: false, reason: "Not needed.", evidenceRefs: [] },
    averageTicket: unavailableFact("Not needed."),
    amountFunded: unavailableFact("Not needed."),
    adjustments: unavailableFact("Not needed."),
    credits: unavailableFact("Not needed."),
    refunds: unavailableFact("Not needed."),
  };
}

function registryForPeriod(effectiveFrom: string, effectiveTo: string): QualifiedBenchmarkRegistry {
  const registry = eligibleTestRegistry();
  registry.version = `test-${effectiveFrom}-${effectiveTo}`;
  registry.entries = registry.entries.map((entry) => ({ ...entry, effectiveFrom, effectiveTo }));
  return registry;
}

function eligibleTestRegistry(): QualifiedBenchmarkRegistry {
  const registry = structuredClone(loadQualifiedBenchmarkRegistry());
  registry.version = "test-reproducible-reference-v1";
  registry.sourceRecords = [
    {
      sourceId: "test_source_alpha",
      documentId: "test_document_alpha_v1",
      title: "Test quantitative cost study alpha",
      publisher: "PublisherAlpha",
      independenceGroup: "publisher_alpha",
      sourceType: "industry_analysis",
      locator: "https://evidence.example.test/alpha-v1.pdf",
      locationWithinSource: "Table 2, restaurant card-present observations",
      publishedAt: "2026-07-01",
      effectiveFrom: null,
      effectiveTo: null,
      accessedAt: "2026-08-15",
      contentDigestSha256: "a".repeat(64),
      reviewedAt: "2026-08-15",
      supportedClaim: "Provides independently measured lower and upper restaurant effective-rate inputs for the test derivation.",
      quantitativeValues: [
        { metricId: "alpha_lower", label: "Alpha lower observation", value: "0.020000", unit: "decimal_rate", locationWithinSource: "Table 2, row lower" },
        { metricId: "alpha_upper", label: "Alpha upper observation", value: "0.025000", unit: "decimal_rate", locationWithinSource: "Table 2, row upper" },
      ],
      limitations: ["Synthetic source used only to verify the admission architecture.", "Does not authorize a production merchant-facing reference."],
    },
    {
      sourceId: "test_source_beta",
      documentId: "test_document_beta_v1",
      title: "Test quantitative cost study beta",
      publisher: "PublisherBeta",
      independenceGroup: "publisher_beta",
      sourceType: "industry_analysis",
      locator: "https://evidence.example.test/beta-v1.pdf",
      locationWithinSource: "Dataset summary, restaurant card-present observations",
      publishedAt: "2026-07-15",
      effectiveFrom: null,
      effectiveTo: null,
      accessedAt: "2026-08-15",
      contentDigestSha256: "b".repeat(64),
      reviewedAt: "2026-08-15",
      supportedClaim: "Provides a second independent lower and upper restaurant effective-rate input for the test derivation.",
      quantitativeValues: [
        { metricId: "beta_lower", label: "Beta lower observation", value: "0.022000", unit: "decimal_rate", locationWithinSource: "Dataset summary, lower observation" },
        { metricId: "beta_upper", label: "Beta upper observation", value: "0.027000", unit: "decimal_rate", locationWithinSource: "Dataset summary, upper observation" },
      ],
      limitations: ["Synthetic source used only to verify the admission architecture.", "Does not authorize a production merchant-facing reference."],
    },
  ];
  registry.entries = [
    {
      referenceId: "test_restaurant_reproducible_reference",
      displayLabel: "Restaurant / Food Service",
      segmentId: "restaurant_food_service",
      riskClass: "standard",
      channel: "card_present",
      annualVolumeTier: "100k_500k",
      applicableProcessor: "fiserv",
      effectiveFrom: "2026-06-01",
      effectiveTo: "2026-10-31",
      range: { low: "0.021000", high: "0.026000" },
      confidence: "medium",
      merchantDisplayEligible: true,
      materiallyAboveDelta: null,
      sourceIds: ["test_source_alpha", "test_source_beta"],
      derivation: {
        methodVersion: "qualified_benchmark_linear_derivation_v1",
        summary: "The test range is the equal-weight arithmetic mean of two independent lower observations and two independent upper observations, with no offset.",
        inputs: [
          { inputId: "alpha_lower_input", sourceId: "test_source_alpha", metricId: "alpha_lower", value: "0.020000", unit: "decimal_rate" },
          { inputId: "beta_lower_input", sourceId: "test_source_beta", metricId: "beta_lower", value: "0.022000", unit: "decimal_rate" },
          { inputId: "alpha_upper_input", sourceId: "test_source_alpha", metricId: "alpha_upper", value: "0.025000", unit: "decimal_rate" },
          { inputId: "beta_upper_input", sourceId: "test_source_beta", metricId: "beta_upper", value: "0.027000", unit: "decimal_rate" },
        ],
        lowerBound: {
          offset: "0.000000",
          terms: [
            { inputId: "alpha_lower_input", weight: "0.500000" },
            { inputId: "beta_lower_input", weight: "0.500000" },
          ],
          result: "0.021000",
        },
        upperBound: {
          offset: "0.000000",
          terms: [
            { inputId: "alpha_upper_input", weight: "0.500000" },
            { inputId: "beta_upper_input", weight: "0.500000" },
          ],
          result: "0.026000",
        },
        assumptions: [
          "Equal weighting is explicit and used only for the synthetic test fixture.",
          "All inputs are already normalized to the same all-in decimal-rate basis.",
        ],
        reviewedAt: "2026-08-15",
      },
      methodology: "Synthetic reproducible reference used only to verify that concrete sources and both exact boundaries are required before qualification.",
      limitations: ["This fixture is not production benchmark evidence.", "It exists only to exercise Package 1 admission and canonical invariance."],
    },
  ];
  return validateQualifiedBenchmarkRegistry(registry);
}
