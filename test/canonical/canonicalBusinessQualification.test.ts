import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
  it("loads only the five product-approved RateReveal launch references", () => {
    const registry = loadQualifiedBenchmarkRegistry();
    expect(registry.normalRuntimeNetworkRequired).toBe(false);
    expect(registry.entries.map((entry) => [entry.segmentId, entry.channel, entry.riskClass, entry.range, entry.confidence])).toEqual([
      ["restaurant_food_service", "card_present", "standard", { low: "0.018000", high: "0.029000" }, "low"],
      ["grocery_specialty_food", "card_present", "standard", { low: "0.016000", high: "0.026000" }, "low"],
      ["general_retail", "card_present", "standard", { low: "0.025000", high: "0.035000" }, "medium"],
      ["ecommerce", "card_not_present", "standard", { low: "0.023000", high: "0.032000" }, "medium"],
      ["high_risk_retail", "card_present", "high_risk", { low: "0.035000", high: "0.065000" }, "low"],
    ]);
    expect(registry.entries.every((entry) => entry.productApproval.status === "approved_for_merchant_display")).toBe(true);
    expect(registry.unavailableCoverage.length).toBeGreaterThanOrEqual(5);
  });

  it("admits an approved RateReveal synthesis without requiring external publication of exact endpoints", () => {
    const registry = eligibleTestRegistry();
    registry.entries[0]!.range = { low: "0.018111", high: "0.028999" };
    expect(validateQualifiedBenchmarkRegistry(registry).entries[0]!.range).toEqual({ low: "0.018111", high: "0.028999" });
  });

  it("rejects missing evidence linkage, rationale, confidence, approval, and applicability", () => {
    const missingEvidence = eligibleTestRegistry();
    missingEvidence.entries[0]!.sourceIds = [];
    expect(() => validateQualifiedBenchmarkRegistry(missingEvidence)).toThrow(/research evidence linkage/);

    const missingRationale = eligibleTestRegistry();
    missingRationale.entries[0]!.synthesis.rateRevealRationale = "";
    expect(() => validateQualifiedBenchmarkRegistry(missingRationale)).toThrow(/synthesis/);

    const missingConfidence = eligibleTestRegistry();
    missingConfidence.entries[0]!.confidence = undefined as never;
    expect(() => validateQualifiedBenchmarkRegistry(missingConfidence)).toThrow(/missing confidence/);

    const unapproved = eligibleTestRegistry();
    unapproved.entries[0]!.productApproval.status = "candidate" as never;
    expect(() => validateQualifiedBenchmarkRegistry(unapproved)).toThrow(/product approval/);

    const missingApplicability = eligibleTestRegistry();
    missingApplicability.entries[0]!.channel = "unknown" as never;
    expect(() => validateQualifiedBenchmarkRegistry(missingApplicability)).toThrow(/unsupported channel/);
  });

  it("rejects missing research source metadata and legacy-only locators", () => {
    const sourceId = eligibleTestRegistry().entries[0]!.sourceIds[0]!;
    const legacyLocator = eligibleTestRegistry();
    legacyLocator.sourceRecords.find((source) => source.sourceId === sourceId)!.locator = "repository:data/fiserv-fee-analysis/mcc_benchmark_reference.json#sources";
    expect(() => validateQualifiedBenchmarkRegistry(legacyLocator)).toThrow(/traceable research metadata/);

    const bundledPublisher = eligibleTestRegistry();
    bundledPublisher.sourceRecords.find((source) => source.sourceId === sourceId)!.publisher = "Publisher One and Publisher Two";
    expect(() => validateQualifiedBenchmarkRegistry(bundledPublisher)).toThrow(/traceable research metadata/);
  });

  it("rejects invalid, inverted, and overlapping references instead of choosing a default", () => {
    const inverted = eligibleTestRegistry();
    inverted.entries[0]!.range = { low: "0.030000", high: "0.020000" };
    expect(() => validateQualifiedBenchmarkRegistry(inverted)).toThrow(/invalid range/);
    const overlappingRegistry = eligibleTestRegistry();
    overlappingRegistry.entries.push({ ...overlappingRegistry.entries[0]!, referenceId: "duplicate_applicability" });
    expect(() => validateQualifiedBenchmarkRegistry(overlappingRegistry)).toThrow(/overlap for the same qualification factors/);
  });

  it("qualifies a low-confidence approved restaurant reference without creating savings", () => {
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
    expect(result.rateComparison).toMatchObject({
      status: "qualified",
      position: "within_reference",
      benchmarkRef: {
        segmentId: "restaurant_food_service",
        range: { low: "0.018000", high: "0.029000" },
        confidence: "low",
        synthesis: { methodVersion: "ratereveal_market_informed_synthesis_v1" },
        opportunityApproved: false,
        aiSourced: false,
      },
    });
    expect(JSON.stringify(result.rateComparison)).not.toMatch(/"(?:savings|overpayment|recoverable|annualImpact|monthlyImpact)"\s*:/i);
  });

  it("performs zero mandatory network calls on the normal benchmark path", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = qualify({ selectedCategoryId: "restaurant_food_beverage", freeTextDescription: "Restaurant" });
      expect(result.rateComparison.status).toBe("qualified");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("resolves specialty grocery without collapsing it into general retail", () => {
    const result = qualify({ selectedCategoryId: "retail", freeTextDescription: "Specialty grocery market", effectiveRate: "0.024000" });
    expect(result.businessQualification.resolvedSegmentId).toBe("grocery_specialty_food");
    expect(result.rateComparison).toMatchObject({ status: "qualified", position: "within_reference", benchmarkRef: { confidence: "low" } });
  });

  it("keeps general card-present retail and e-commerce as separate approved tuples", () => {
    const retail = qualify({ selectedCategoryId: "retail", freeTextDescription: "General merchandise retail store", effectiveRate: "0.036000" });
    expect(retail.businessQualification.resolvedSegmentId).toBe("general_retail");
    expect(retail.rateComparison).toMatchObject({ status: "qualified", position: "above_reference", benchmarkRef: { channel: "card_present" } });

    const ecommerce = qualify({ selectedCategoryId: "ecommerce", freeTextDescription: "Online ecommerce store", channel: "card_not_present", effectiveRate: "0.030000" });
    expect(ecommerce.businessQualification.resolvedSegmentId).toBe("ecommerce");
    expect(ecommerce.rateComparison).toMatchObject({ status: "qualified", position: "within_reference", benchmarkRef: { channel: "card_not_present" } });
  });

  it("requires explicit supported high-risk confirmation before applying the approved vape reference", () => {
    const unconfirmed = qualify({ selectedCategoryId: "smoke_vape_cbd", freeTextDescription: "Vape shop", effectiveRate: "0.050000" });
    expect(unconfirmed.businessQualification.status).toBe("confirmation_required");
    expect(unconfirmed.businessQualification.confirmationRequirement?.reasonCode).toBe("high_risk_activity_confirmation_required");
    expect(unconfirmed.rateComparison.status).toBe("confirmation_required");

    const confirmed = qualify({
      selectedCategoryId: "smoke_vape_cbd",
      freeTextDescription: "Vape shop",
      effectiveRate: "0.050000",
      confirmedSegmentId: "high_risk_retail",
      confirmedRiskClass: "high_risk",
    });
    expect(confirmed.businessQualification.status).toBe("qualified");
    expect(confirmed.rateComparison).toMatchObject({ status: "qualified", position: "within_reference", benchmarkRef: { confidence: "low" } });
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

    const changedRangeRegistry = structuredClone(historicalRegistry);
    changedRangeRegistry.entries.find((entry) => entry.segmentId === "restaurant_food_service")!.range = { low: "0.000001", high: "0.000002" };
    const changedRange = buildCanonicalStatementFactsFromParsedDocument(doc, {
      sourceFileName: "fixture.pdf",
      businessType: "restaurant_food_beverage",
      businessProfile: profile,
      benchmarkRegistry: changedRangeRegistry,
    });
    expect(changedRange.customerState.rateComparison.position).not.toBe(qualified.customerState.rateComparison.position);
    expect(changedRange.financialFacts).toEqual(qualified.financialFacts);
    expect(changedRange.feeLedger).toEqual(qualified.feeLedger);
    expect(changedRange.feeOwnershipActionability).toEqual(qualified.feeOwnershipActionability);
    expect(changedRange.opportunityEngine).toEqual(qualified.opportunityEngine);

    const tampered = structuredClone(qualified);
    const calculation = tampered.calculations.find((item) => item.id === tampered.customerState.rateComparison.calculationRef)!;
    calculation.inputs.find((item) => item.label === "Reference range upper boundary")!.value = "0.099000";
    expect(() => validateCanonicalStatementAnalysis(tampered)).toThrow(/benchmark position does not reconstruct/);

    const unsupportedProvenance = structuredClone(qualified);
    unsupportedProvenance.customerState.rateComparison.benchmarkRef!.sourceRecords![0]!.locator =
      "repository:data/fiserv-fee-analysis/mcc_benchmark_reference.json#sources";
    expect(() => validateCanonicalStatementAnalysis(unsupportedProvenance)).toThrow(/approved, traceable RateReveal synthesis/);

    const unsupportedSynthesis = structuredClone(qualified);
    unsupportedSynthesis.customerState.rateComparison.benchmarkRef!.synthesis!.rateRevealRationale = "";
    expect(() => validateCanonicalStatementAnalysis(unsupportedSynthesis)).toThrow(/approved, traceable RateReveal synthesis/);

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
  confirmedSegmentId?: string;
  confirmedRiskClass?: "standard" | "high_risk";
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
      confirmation: {
        confirmedSegmentId: options.confirmedSegmentId ?? null,
        confirmedRiskClass: options.confirmedRiskClass ?? null,
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
  registry.version = "test-ratereveal-synthesis-v1";
  return validateQualifiedBenchmarkRegistry(registry);
}
