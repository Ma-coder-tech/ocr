import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability } from "../../src/canonical/feeOwnershipActionability.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
  WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import { aggregateCanonicalOpportunityComponents, buildCanonicalOpportunityEngine, type CanonicalOpportunityInput } from "../../src/canonical/opportunityEngine.js";
import { selectedFact, unavailableFact } from "../../src/canonical/facts.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import type {
  CanonicalAiCapabilityOutput,
  CanonicalCustomerRateComparison,
  CanonicalOpportunityTargetProvenance,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

describe("canonical customer state resolver", () => {
  it("resolves every primary state from deterministic axes without benchmark inference", () => {
    const unable = readyAnalysis();
    unable.financialFacts.processedSales = unavailableFact("Synthetic missing core total.");
    refreshCustomerState(unable);
    expect(unable.customerState.primaryState).toBe("unable_to_analyze");

    const withheld = baseAnalysis();
    refreshCustomerState(withheld);
    expect(withheld.customerState.primaryState).toBe("analysis_withheld");

    const limited = readyAnalysis();
    limited.feeLedger.status = "partial";
    refreshCustomerState(limited);
    expect(limited.customerState.primaryState).toBe("analysis_limited");
    expect(limited.customerState.visibility.visibleEligibleAnnualAmount).toEqual(money(0));

    const failedFeeLedger = readyAnalysis();
    failedFeeLedger.feeLedger.controls[0]!.status = "blocked";
    refreshCustomerState(failedFeeLedger);
    expect(failedFeeLedger.customerState.primaryState).toBe("analysis_limited");
    expect(failedFeeLedger.customerState.axes.dataIntegrity).toBe("failed");
    expect(failedFeeLedger.customerState.visibility.showCoreMetrics).toBe(true);
    expect(failedFeeLedger.customerState.visibility.visibleEligibleAnnualAmount).toEqual(money(0));

    const verification = readyAnalysis();
    refreshCustomerState(verification);
    expect(verification.customerState.primaryState).toBe("verification_needed");
    expect(verification.customerState.visibility.visibleEligibleAnnualAmount).toEqual(money(0));

    const benchmarkUnavailable = readyAnalysis();
    clearOpportunities(benchmarkUnavailable);
    refreshCustomerState(benchmarkUnavailable);
    expect(benchmarkUnavailable.customerState.primaryState).toBe("verified_benchmark_unavailable");
    expect(benchmarkUnavailable.customerState.axes.ratePosition).toBe("unavailable");

    const competitiveNoOpportunity = readyAnalysis();
    clearOpportunities(competitiveNoOpportunity);
    refreshCustomerState(competitiveNoOpportunity, qualifiedBenchmark(competitiveNoOpportunity, "within_reference"));
    expect(competitiveNoOpportunity.customerState.primaryState).toBe("competitive_no_opportunity");

    const competitiveWithOpportunity = readyAnalysis();
    addEligibleOpportunity(competitiveWithOpportunity, 10, 5, 60);
    refreshCustomerState(competitiveWithOpportunity, qualifiedBenchmark(competitiveWithOpportunity, "below_reference"));
    expect(competitiveWithOpportunity.customerState.primaryState).toBe("competitive_with_opportunity");
    expect(competitiveWithOpportunity.customerState.axes.ratePosition).toBe("below_reference");

    const rateReview = readyAnalysis();
    clearOpportunities(rateReview);
    refreshCustomerState(rateReview, qualifiedBenchmark(rateReview, "above_reference"));
    expect(rateReview.customerState.primaryState).toBe("rate_review_needed");

    const rateReviewWithOpportunity = readyAnalysis();
    addEligibleOpportunity(rateReviewWithOpportunity, 10, 5, 60);
    refreshCustomerState(rateReviewWithOpportunity, qualifiedBenchmark(rateReviewWithOpportunity, "above_reference"));
    expect(rateReviewWithOpportunity.customerState.primaryState).toBe("rate_review_with_opportunity");

    const feeOpportunity = readyAnalysis();
    addEligibleOpportunity(feeOpportunity, 10, 5, 60);
    refreshCustomerState(feeOpportunity);
    expect(feeOpportunity.customerState.primaryState).toBe("fee_opportunity_identified");

    const material = readyAnalysis({ sales: 10_000, fees: 500, monthlyFee: 100 });
    addEligibleOpportunity(material, 100, 0, 1200);
    refreshCustomerState(material, qualifiedBenchmark(material, "within_reference"));
    expect(material.customerState.primaryState).toBe("material_fee_opportunity");
    expect(material.customerState.axes.ratePosition).toBe("within_reference");
  });

  it("keeps state resolution input-order independent", () => {
    const first = readyAnalysis({ monthlyFee: 10, secondMonthlyFee: 12 });
    const firstInput = eligibleInput(first, 10, 5, 60, "a", 0);
    first.calculations.push(calc(firstInput.calculation.calculationRef, first.opportunityEngine.components[0]!.evidenceRefs, money(10), money(5), money(60)));
    const secondInput = eligibleInput(first, 12, 8, 48, "b", 1);
    first.calculations.push(calc(secondInput.calculation.calculationRef, first.opportunityEngine.components[1]!.evidenceRefs, money(12), money(8), money(48)));
    first.opportunityEngine = buildCanonicalOpportunityEngine({
      feeLedger: first.feeLedger,
      feeOwnershipActionability: first.feeOwnershipActionability,
      evidence: first.evidence,
      statementPeriodVerified: true,
      opportunityInputs: [secondInput, firstInput],
    });
    refreshReadyAi(first);
    refreshCustomerState(first);

    const second = structuredClone(first) as CanonicalStatementAnalysis;
    second.opportunityEngine.components = [...second.opportunityEngine.components].reverse();
    second.opportunityEngine.summary = aggregateCanonicalOpportunityComponents(second.opportunityEngine.components);
    refreshCustomerState(second);

    expect(second.customerState.axes).toEqual(first.customerState.axes);
    expect(second.customerState.primaryState).toBe(first.customerState.primaryState);
    expect(validateCanonicalStatementAnalysis(second).validation.status).toBe("valid");
  });

  it("keeps approved estimates separate from deterministic eligible totals", () => {
    const analysis = readyAnalysis();
    addEstimatedOpportunity(analysis, 10, 5, 60);
    refreshCustomerState(analysis);

    expect(analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount).toEqual(money(0));
    expect(analysis.opportunityEngine.summary.approvedEstimatedAnnualAmount).toEqual(money(60));
    expect(analysis.customerState.visibility.visibleDeterministicAnnualAmount).toEqual(money(0));
    expect(analysis.customerState.visibility.visibleApprovedEstimatedAnnualAmount).toEqual(money(60));
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toBe("valid");
  });

  it("enforces materiality thresholds at exact cent and ratio boundaries", () => {
    const underDollar = readyAnalysis({ sales: 41_666.67, fees: 833.33 });
    addAnnualDeterministicOpportunity(underDollar, 999.99, "under_dollar");
    refreshCustomerState(underDollar);
    expect(underDollar.customerState.materiality.material).toBe(false);

    const atDollar = readyAnalysis({ sales: 41_666.67, fees: 833.33 });
    addAnnualDeterministicOpportunity(atDollar, 1000, "at_dollar");
    refreshCustomerState(atDollar);
    expect(atDollar.customerState.materiality.annualEligibleOpportunity.amountMinor).toBe(100000);
    expect(atDollar.customerState.materiality.material).toBe(true);

    const feeRatioUnder = readyAnalysis({ sales: 100_000, fees: 834.17 });
    addAnnualDeterministicOpportunity(feeRatioUnder, 1000, "fee_ratio_under");
    refreshCustomerState(feeRatioUnder);
    expect(Number(feeRatioUnder.customerState.materiality.totalFeesRatio)).toBeLessThan(0.1);
    expect(feeRatioUnder.customerState.materiality.material).toBe(false);

    const feeRatioAt = readyAnalysis({ sales: 100_000, fees: 833.33 });
    addAnnualDeterministicOpportunity(feeRatioAt, 1000, "fee_ratio_at");
    refreshCustomerState(feeRatioAt);
    expect(Number(feeRatioAt.customerState.materiality.totalFeesRatio)).toBeGreaterThanOrEqual(0.1);
    expect(feeRatioAt.customerState.materiality.material).toBe(true);

    const volumeRatioUnder = readyAnalysis({ sales: 41_876.05, fees: 20_000 });
    addAnnualDeterministicOpportunity(volumeRatioUnder, 1000, "volume_ratio_under");
    refreshCustomerState(volumeRatioUnder);
    expect(Number(volumeRatioUnder.customerState.materiality.processedVolumeRatio)).toBeLessThan(0.002);
    expect(volumeRatioUnder.customerState.materiality.material).toBe(false);

    const volumeRatioAt = readyAnalysis({ sales: 41_666.67, fees: 20_000 });
    addAnnualDeterministicOpportunity(volumeRatioAt, 1000, "volume_ratio_at");
    refreshCustomerState(volumeRatioAt);
    expect(Number(volumeRatioAt.customerState.materiality.processedVolumeRatio)).toBe(0.002);
    expect(Number(volumeRatioAt.customerState.materiality.processedVolumeRatio)).toBeGreaterThanOrEqual(0.002);
    expect(volumeRatioAt.customerState.materiality.material).toBe(true);

    const oneThresholdPassing = readyAnalysis({ sales: 41_666.67, fees: 20_000 });
    addAnnualDeterministicOpportunity(oneThresholdPassing, 1000, "one_relative_threshold");
    refreshCustomerState(oneThresholdPassing);
    expect(Number(oneThresholdPassing.customerState.materiality.totalFeesRatio)).toBeLessThan(0.1);
    expect(Number(oneThresholdPassing.customerState.materiality.processedVolumeRatio)).toBeGreaterThanOrEqual(0.002);
    expect(oneThresholdPassing.customerState.materiality.material).toBe(true);

    const bothThresholdsFailing = readyAnalysis({ sales: 100_000, fees: 20_000 });
    addAnnualDeterministicOpportunity(bothThresholdsFailing, 1000, "both_relative_thresholds_fail");
    refreshCustomerState(bothThresholdsFailing);
    expect(bothThresholdsFailing.customerState.materiality.material).toBe(false);
  });

  it("uses the fallback threshold only when annualized denominators are unavailable", () => {
    const underFallback = readyAnalysis();
    underFallback.identity.statementPeriod.value = { start: "2026-01-01", end: "2026-02-15" };
    addAnnualDeterministicOpportunity(underFallback, 4999.99, "under_fallback");
    refreshCustomerState(underFallback);
    expect(underFallback.customerState.materiality.annualizedTotalFees).toBeNull();
    expect(underFallback.customerState.materiality.annualizedProcessedVolume).toBeNull();
    expect(underFallback.customerState.materiality.usedFallbackThreshold).toBe(true);
    expect(underFallback.customerState.materiality.material).toBe(false);

    const atFallback = readyAnalysis();
    atFallback.identity.statementPeriod.value = { start: "2026-01-01", end: "2026-02-15" };
    addAnnualDeterministicOpportunity(atFallback, 5000, "at_fallback");
    refreshCustomerState(atFallback);
    expect(atFallback.customerState.materiality.annualEligibleOpportunity.amountMinor).toBe(500000);
    expect(atFallback.customerState.materiality.material).toBe(true);

    const incompatibleCurrency = readyAnalysis();
    (incompatibleCurrency.financialFacts.totalFees.value as any).currency = "EUR";
    addAnnualDeterministicOpportunity(incompatibleCurrency, 5000, "currency_fallback");
    refreshCustomerState(incompatibleCurrency);
    expect(incompatibleCurrency.customerState.materiality.annualizedTotalFees).toBeNull();
    expect(incompatibleCurrency.customerState.materiality.usedFallbackThreshold).toBe(true);

    const missingDenominators = readyAnalysis();
    missingDenominators.financialFacts.totalFees = unavailableFact("Synthetic missing denominator.");
    addAnnualDeterministicOpportunity(missingDenominators, 5000, "missing_denominator");
    refreshCustomerState(missingDenominators);
    expect(missingDenominators.customerState.primaryState).toBe("unable_to_analyze");
    expect(missingDenominators.customerState.materiality.usedFallbackThreshold).toBe(true);
  });

  it("does not annualize already annual eligible opportunity a second time", () => {
    const analysis = readyAnalysis({ sales: 10_000, fees: 500, monthlyFee: 100 });
    addAnnualDeterministicOpportunity(analysis, 1200, "single_annualization");
    refreshCustomerState(analysis);

    expect(analysis.opportunityEngine.summary.totalEligibleAnnualAmount).toEqual(money(1200));
    expect(analysis.customerState.materiality.annualEligibleOpportunity).toEqual(money(1200));
    expect(Number(analysis.customerState.materiality.totalFeesRatio)).toBe(0.2);
  });

  it("does not let verification, exclusion, overlap, unproven cadence, or rate position affect materiality unsafely", () => {
    const verificationOnly = readyAnalysis({ sales: 1000, fees: 30, monthlyFee: 1000 });
    refreshCustomerState(verificationOnly);
    expect(verificationOnly.opportunityEngine.summary.verificationOnlyObservedAmount.amountMinor).toBeGreaterThan(0);
    expect(verificationOnly.customerState.materiality.material).toBe(false);
    expect(verificationOnly.opportunityEngine.summary.masterSavingsAnnualAmount).toEqual(money(0));

    const excluded = readyAnalysis({ sales: 1000, fees: 30, monthlyFee: 1000 });
    excluded.opportunityEngine.components[0]!.eligibility = "excluded";
    excluded.opportunityEngine.components[0]!.inclusionStatus = "excluded";
    excluded.opportunityEngine.summary = aggregateCanonicalOpportunityComponents(excluded.opportunityEngine.components);
    refreshCustomerState(excluded);
    expect(excluded.customerState.materiality.material).toBe(false);

    const unprovenCadence = readyAnalysis();
    const input = eligibleInput(unprovenCadence, 10, 5, 60, "unproven_cadence");
    unprovenCadence.calculations.push(calc(input.calculation.calculationRef, unprovenCadence.opportunityEngine.components[0]!.evidenceRefs, money(10), money(5), money(60)));
    input.cadence = { ...input.cadence, value: "unknown", proven: false, annualizationAllowed: false, frequencyPerYear: null, proof: "not_proven" };
    unprovenCadence.opportunityEngine = buildCanonicalOpportunityEngine({
      feeLedger: unprovenCadence.feeLedger,
      feeOwnershipActionability: unprovenCadence.feeOwnershipActionability,
      evidence: unprovenCadence.evidence,
      statementPeriodVerified: true,
      opportunityInputs: [input],
    });
    expect(() => validateCanonicalStatementAnalysis(unprovenCadence)).toThrow(/non-annualizable cadence|proven recurring cadence/i);

    const materialWithBenchmark = readyAnalysis({ sales: 10_000, fees: 500, monthlyFee: 100 });
    addAnnualDeterministicOpportunity(materialWithBenchmark, 1200, "material_rate_position");
    refreshCustomerState(materialWithBenchmark, qualifiedBenchmark(materialWithBenchmark, "within_reference"));
    expect(materialWithBenchmark.customerState.materiality.material).toBe(true);
    expect(materialWithBenchmark.customerState.axes.ratePosition).toBe("within_reference");
  });

  it("applies state precedence for conflicting inputs", () => {
    const unsafeWithOpportunity = readyAnalysis();
    addAnnualDeterministicOpportunity(unsafeWithOpportunity, 5000, "unsafe_opportunity");
    unsafeWithOpportunity.financialFacts.processedSales = unavailableFact("Synthetic unsafe core total.");
    refreshCustomerState(unsafeWithOpportunity);
    expect(unsafeWithOpportunity.customerState.primaryState).toBe("unable_to_analyze");

    const withheldWithOpportunity = baseAnalysis();
    addAnnualDeterministicOpportunity(withheldWithOpportunity, 5000, "withheld_opportunity");
    withheldWithOpportunity.aiCapabilities = buildCanonicalAiCapabilities({
      ...withheldWithOpportunity,
      evidence: withheldWithOpportunity.evidence,
    });
    withheldWithOpportunity.customerState = buildCanonicalCustomerState({ ...withheldWithOpportunity });
    expect(withheldWithOpportunity.customerState.primaryState).toBe("analysis_withheld");

    const limitedMaterial = readyAnalysis({ sales: 10_000, fees: 500, monthlyFee: 100 });
    addAnnualDeterministicOpportunity(limitedMaterial, 1200, "limited_material");
    limitedMaterial.feeLedger.status = "partial";
    refreshCustomerState(limitedMaterial);
    expect(limitedMaterial.customerState.primaryState).toBe("analysis_limited");
    expect(limitedMaterial.customerState.visibility.visibleEligibleAnnualAmount).toEqual(money(0));

    const materialAboveBenchmark = readyAnalysis({ sales: 10_000, fees: 500, monthlyFee: 100 });
    addAnnualDeterministicOpportunity(materialAboveBenchmark, 1200, "material_above");
    refreshCustomerState(materialAboveBenchmark, qualifiedBenchmark(materialAboveBenchmark, "above_reference"));
    expect(materialAboveBenchmark.customerState.primaryState).toBe("material_fee_opportunity");
    expect(materialAboveBenchmark.customerState.axes.ratePosition).toBe("above_reference");

    const competitiveVerification = readyAnalysis();
    refreshCustomerState(competitiveVerification, qualifiedBenchmark(competitiveVerification, "within_reference"));
    expect(competitiveVerification.customerState.primaryState).toBe("verification_needed");

    const benchmarkUnavailableWithOpportunity = readyAnalysis();
    addAnnualDeterministicOpportunity(benchmarkUnavailableWithOpportunity, 60, "benchmark_unavailable_opportunity");
    refreshCustomerState(benchmarkUnavailableWithOpportunity);
    expect(benchmarkUnavailableWithOpportunity.customerState.primaryState).toBe("fee_opportunity_identified");

    const staleProjection = readyAnalysis();
    addAnnualDeterministicOpportunity(staleProjection, 5000, "stale_projection");
    staleProjection.customerState.primaryState = "verification_needed";
    expect(() => validateCanonicalStatementAnalysis(staleProjection)).toThrow(/primary state does not reconstruct/i);

    const malformedReason = readyAnalysis();
    malformedReason.customerState.reasonCodes = ["Bad Reason"];
    expect(() => validateCanonicalStatementAnalysis(malformedReason)).toThrow(/reason code .* malformed/i);

    const badBenchmark = readyAnalysis();
    const comparison = qualifiedBenchmark(badBenchmark, "within_reference");
    comparison.benchmarkRef!.version = "";
    refreshCustomerState(badBenchmark, comparison);
    expect(() => validateCanonicalStatementAnalysis(badBenchmark)).toThrow(/versioned, applicable benchmark reference/i);
  });

  it("rejects impossible customer-state mutations", () => {
    const competitive = readyAnalysis();
    clearOpportunities(competitive);
    refreshCustomerState(competitive);
    competitive.customerState.primaryState = "competitive_no_opportunity";
    expect(() => validateCanonicalStatementAnalysis(competitive)).toThrow(/competitive state requires a qualified within\/below benchmark/i);

    const material = readyAnalysis();
    refreshCustomerState(material);
    material.customerState.primaryState = "material_fee_opportunity";
    expect(() => validateCanonicalStatementAnalysis(material)).toThrow(/primary state does not reconstruct|material state fails/i);

    const exposed = readyAnalysis();
    exposed.feeLedger.status = "partial";
    addEligibleOpportunity(exposed, 10, 5, 60);
    refreshCustomerState(exposed);
    exposed.customerState.visibility.visibleEligibleAnnualAmount = money(60);
    expect(() => validateCanonicalStatementAnalysis(exposed)).toThrow(/exposes eligible totals|visibility does not reconstruct/i);
  });
});

function baseAnalysis(options: { sales?: number; fees?: number; monthlyFee?: number; secondMonthlyFee?: number } = {}): CanonicalStatementAnalysis {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(statement(options), {
    sourceFileName: "package-g.pdf",
    businessType: "restaurant",
    preferExtractedRows: true,
  });
  analysis.identity.statementPeriod = selectedFact({
    value: { start: "2026-01-01", end: "2026-01-31" },
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package G verified statement period.",
  });
  analysis.identity.processorFamily = selectedFact({
    value: "fiserv",
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package G processor context.",
  });
  analysis.identity.processorName = selectedFact({
    value: "Fiserv",
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package G processor context.",
  });
  analysis.identity.businessType = selectedFact({
    value: "restaurant",
    confidence: "high",
    evidenceRefs: [analysis.evidence[0]!.id],
    selectionReason: "Synthetic Package G business context.",
  });
  const feeAmount = options.monthlyFee ?? 10;
  const secondFeeAmount = options.secondMonthlyFee ?? null;
  const ledgerRows = [
    {
      network: null,
      type: null,
      description: "Monthly CPU GTWY",
      amount: feeAmount,
      sourceSection: "Fees",
      evidenceLine: `Monthly CPU GTWY | -$${feeAmount.toFixed(2)}`,
      pageNumber: 1,
      confidence: "high",
    },
    ...(secondFeeAmount === null
      ? []
      : [
          {
            network: null,
            type: null,
            description: "Monthly PROC FEE",
            amount: secondFeeAmount,
            sourceSection: "Fees",
            evidenceLine: `Monthly PROC FEE | -$${secondFeeAmount.toFixed(2)}`,
            pageNumber: 1,
            confidence: "high",
          },
        ]),
  ];
  const rowSum = feeAmount + (secondFeeAmount ?? 0);
  const evidence = new Map();
  const calculations: any[] = [];
  analysis.feeLedger = buildCanonicalFeeLedger({
    doc: statement(options),
    documentId: "doc_package_g",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows: ledgerRows,
        controls: [{ label: "Total Fees", rowSum, printedTotal: rowSum, delta: 0, evidenceLine: `Total Fees | -$${rowSum.toFixed(2)}` }],
        printedTotal: rowSum,
        delta: 0,
      },
    },
  });
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
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
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
  });
  refreshCustomerState(analysis);
  return analysis;
}

function readyAnalysis(options: { sales?: number; fees?: number; monthlyFee?: number; secondMonthlyFee?: number } = {}): CanonicalStatementAnalysis {
  const analysis = baseAnalysis(options);
  refreshReadyAi(analysis);
  refreshCustomerState(analysis);
  return analysis;
}

function refreshReadyAi(analysis: CanonicalStatementAnalysis): void {
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    ...analysis,
    evidence: analysis.evidence,
    harnessInputs: [
      { capability: "full_statement_anomaly_review", status: "completed", output: fullAnomalyOutput(analysis) },
      { capability: "whole_statement_fee_intelligence_review", status: "completed", output: wholeStatementOutput(analysis) },
    ],
  });
}

function refreshCustomerState(analysis: CanonicalStatementAnalysis, rateComparison?: CanonicalCustomerRateComparison): void {
  analysis.customerState = buildCanonicalCustomerState({ ...analysis, evidence: analysis.evidence, rateComparison });
}

function clearOpportunities(analysis: CanonicalStatementAnalysis): void {
  analysis.opportunityEngine.components = [];
  analysis.opportunityEngine.summary = aggregateCanonicalOpportunityComponents([]);
  analysis.opportunityEngine.status = "unavailable";
  refreshReadyAi(analysis);
}

function addEligibleOpportunity(analysis: CanonicalStatementAnalysis, observed: number, target: number, result: number, suffix = "eligible"): void {
  const input = eligibleInput(analysis, observed, target, result, suffix);
  analysis.calculations.push(calc(input.calculation.calculationRef, analysis.opportunityEngine.components[0]!.evidenceRefs, money(observed), money(target), money(result)));
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
    opportunityInputs: [input],
  });
  refreshReadyAi(analysis);
}

function addEstimatedOpportunity(analysis: CanonicalStatementAnalysis, observed: number, target: number, result: number): void {
  const input = eligibleInput(analysis, observed, target, result, "estimated");
  input.eligibility = "approved_estimate";
  input.targetProvenance = {
    ...input.targetProvenance,
    sourceType: "ratereveal_policy",
    referenceId: "pkg_g_estimate_policy",
    authoritativeForDeterministic: false,
    approvedForEstimate: true,
  };
  analysis.calculations.push(calc(input.calculation.calculationRef, analysis.opportunityEngine.components[0]!.evidenceRefs, money(observed), money(target), money(result)));
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
    opportunityInputs: [input],
  });
  refreshReadyAi(analysis);
}

function addAnnualDeterministicOpportunity(analysis: CanonicalStatementAnalysis, annualAmount: number, suffix: string): void {
  const base = analysis.opportunityEngine.components[0]!;
  const calcRef = `calc_pkg_g_annual_${suffix}`;
  const result = money(annualAmount);
  analysis.calculations.push({
    id: calcRef,
    formulaCode: "opportunity_annual_delta",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [{ label: "Annual eligible amount", value: result, unit: "money", evidenceRefs: base.evidenceRefs }],
    result,
    unit: "money",
    roundingPolicy: "money_minor_units_usd_v1",
  });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
    opportunityInputs: [
      {
        id: `pkg_g_annual_${suffix}`,
        kind: "rate_repricing",
        eligibility: "deterministic",
        feeRowIds: [base.feeRowRefs[0]!.feeRowId],
        target: {
          type: "model_monetary",
          modelId: `pkg_g_annual_model_${suffix}`,
          modelVersion: "1.0.0",
          amount: result,
          unit: "annual_amount",
          aiSourced: false,
        },
        targetProvenance: provenance(analysis, suffix),
        cadence: {
          value: "monthly",
          proven: true,
          annualizationAllowed: true,
          frequencyPerYear: 12,
          proof: "fee_label_explicit",
          evidenceRefs: base.evidenceRefs,
          reason: "Synthetic Package G monthly cadence.",
          aiSourced: false,
        },
        calculation: {
          calculationRef: calcRef,
          formulaCode: "opportunity_annual_delta",
          inputRefs: [base.feeRowRefs[0]!.feeRowId],
          result,
          annualized: true,
          evidenceRefs: base.evidenceRefs,
        },
        confidence: "high",
        evidenceRefs: base.evidenceRefs,
      },
    ],
  });
  refreshReadyAi(analysis);
}

function eligibleInput(analysis: CanonicalStatementAnalysis, observed: number, target: number, result: number, suffix: string, componentIndex = 0): CanonicalOpportunityInput {
  const base = analysis.opportunityEngine.components[componentIndex]!;
  return {
    id: `pkg_g_${suffix}`,
    kind: "fee_removal",
    eligibility: "deterministic",
    feeRowIds: [base.feeRowRefs[0]!.feeRowId],
    target: { type: "monetary", amount: money(target), unit: "monthly_charge", aiSourced: false },
    targetProvenance: provenance(analysis, suffix),
    cadence: {
      value: "monthly",
      proven: true,
      annualizationAllowed: true,
      frequencyPerYear: 12,
      proof: "fee_label_explicit",
      evidenceRefs: base.evidenceRefs,
      reason: "Synthetic Package G monthly cadence.",
      aiSourced: false,
    },
    calculation: {
      calculationRef: `calc_pkg_g_${suffix}`,
      formulaCode: "opportunity_monthly_delta_times_12",
      inputRefs: [base.feeRowRefs[0]!.feeRowId],
      result: money(result),
      annualized: true,
      evidenceRefs: base.evidenceRefs,
    },
    confidence: "high",
    evidenceRefs: base.evidenceRefs,
  };
}

function qualifiedBenchmark(
  analysis: CanonicalStatementAnalysis,
  position: Exclude<CanonicalCustomerRateComparison["position"], "unavailable">,
): CanonicalCustomerRateComparison {
  const evidenceRef = analysis.evidence[0]!.id;
  const calculationRef = `calc_pkg_g_benchmark_${position}`;
  if (!analysis.calculations.some((calculation) => calculation.id === calculationRef)) {
    analysis.calculations.push({
      id: calculationRef,
      formulaCode: "ratereveal_all_in_effective_rate",
      formulaVersion: "canonical_customer_benchmark_policy_v1",
      inputs: [{ label: "RateReveal calculated all-in rate", value: analysis.financialFacts.rateRevealCalculatedAllInRate.value, unit: "decimal_rate", evidenceRefs: [evidenceRef] }],
      result: analysis.financialFacts.rateRevealCalculatedAllInRate.value,
      unit: "decimal_rate",
      roundingPolicy: "decimal_rate_6_places_v1",
    });
  }
  return {
    policyVersion: "canonical_customer_benchmark_policy_v1",
    status: "qualified",
    position,
    benchmarkRef: {
      referenceId: "pkg_g_qualified_benchmark",
      version: "1.0.0",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      applicableProcessor: "fiserv",
      applicableBusinessType: "restaurant",
      applicableChannel: "unknown",
      applicableCardEnvironment: "unknown",
      methodology: "Synthetic qualified benchmark boundary.",
      limitations: ["Synthetic Package G test only."],
      evidenceRefs: [evidenceRef],
      qualified: true,
      opportunityApproved: false,
      aiSourced: false,
    },
    calculationRef,
    evidenceRefs: [evidenceRef],
    reasonCodes: ["qualified_benchmark_reference"],
    aiSourced: false,
  };
}

function fullAnomalyOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const evidenceRef = analysis.evidence[0]!.id;
  return {
    type: "full_statement_anomaly_review",
    authoritative: false,
    evidenceRefs: [evidenceRef],
    factRefs: ["financialFacts.processedSales", "financialFacts.totalFees"],
    limitationCodes: [],
    observations: [{ id: "pkg_g_obs", severity: "info", summary: "Canonical totals reconcile for the synthetic test.", affectedFactRefs: ["financialFacts.processedSales", "financialFacts.totalFees"], evidenceRefs: [evidenceRef], authoritative: false }],
  };
}

function wholeStatementOutput(analysis: CanonicalStatementAnalysis): CanonicalAiCapabilityOutput {
  const rowRefs = analysis.feeLedger.rows.map((row) => row.id).sort();
  const evidenceByRow = new Map(
    analysis.feeLedger.rows.map((row) => [
      row.id,
      [...new Set(row.contributionDecision.evidenceRefs)].sort(),
    ]),
  );
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    authoritative: false,
    evidenceRefs: [...new Set([...evidenceByRow.values()].flat())].sort(),
    factRefs: [],
    limitationCodes: [],
    reviewStatus: "completed",
    coverageProof: {
      policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
      expectedFeeRowRefs: rowRefs,
      reviewedFeeRowRefs: rowRefs,
      missingFeeRowRefs: [],
      duplicatedFeeRowRefs: [],
      unknownFeeRowRefs: [],
      malformedFeeRowRefs: [],
      exactCoverage: true,
    },
    rowInterpretations: rowRefs.map((feeRowRef) => ({
      feeRowRef,
      proposedCategory: "processor_markup",
      likelyEconomicOwner: "processor",
      likelyContractualController: "merchant_contract",
      proposedActionabilityCeiling: "not_actionable",
      confidence: "high",
      conciseRationale: "Statement row label and section context support this semantic interpretation.",
      evidenceProvenance: "statement_evidence",
      evidenceRefs: evidenceByRow.get(feeRowRef) ?? [],
      externalSourceRef: null,
      conflicts: [],
      missingEvidence: [],
      recommendedDisposition: "supported",
      authoritative: false,
    })),
    acceptanceRecords: rowRefs.map((feeRowRef) => ({
      feeRowRef,
      policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
      status: "accepted",
      acceptedSemanticFields: {
        category: "processor_markup",
        likelyEconomicOwner: "processor",
        likelyContractualController: "merchant_contract",
        actionabilityCeiling: "not_actionable",
        evidenceProvenance: "statement_evidence",
      },
      evidenceRefs: evidenceByRow.get(feeRowRef) ?? [],
      externalSourceRef: null,
      reasonCodes: ["whole_statement_fee_intelligence_accepted"],
      conflicts: [],
      actionabilityCeiling: "not_actionable",
      immutableFeeRowRef: feeRowRef,
    })),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function provenance(analysis: CanonicalStatementAnalysis, suffix: string): CanonicalOpportunityTargetProvenance {
  return {
    sourceType: "merchant_contract",
    referenceId: `pkg_g_contract_${suffix}`,
    version: "1.0.0",
    policyOwner: "rr_policy_owner",
    reviewer: "rr_reviewer",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    applicableProcessor: "fiserv",
    applicableBusinessType: "restaurant",
    applicableChannel: "unknown",
    applicableCardEnvironment: "unknown",
    methodology: "Synthetic Package G deterministic target.",
    limitations: [],
    opportunityApproved: true,
    authoritativeForDeterministic: true,
    approvedForEstimate: false,
    evidenceRefs: [analysis.evidence[0]!.id],
    aiSourced: false,
  };
}

function calc(id: string | null, evidenceRefs: string[], observed: MoneyAmount, target: MoneyAmount, result: MoneyAmount) {
  return {
    id: id!,
    formulaCode: "opportunity_monthly_delta_times_12" as const,
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [
      { label: "Observed monthly amount", value: observed, unit: "money" as const, evidenceRefs },
      { label: "Target monthly amount", value: target, unit: "money" as const, evidenceRefs },
    ],
    result,
    unit: "money" as const,
    roundingPolicy: "money_minor_units_usd_v1",
  };
}

function statement(options: { sales?: number; fees?: number; monthlyFee?: number } = {}): ParsedDocument {
  const sales = (options.sales ?? 1000).toFixed(2);
  const fees = (options.fees ?? 30).toFixed(2);
  const monthlyFee = (options.monthlyFee ?? 10).toFixed(2);
  const lines = [
    "Merchant: Package G Cafe",
    "Processor: Fiserv",
    "Statement Period: 01/01/2026 - 01/31/2026",
    `Total Amount Submitted | $${sales}`,
    `Fees Charged | -$${fees}`,
    `Monthly Service Fee | -$${monthlyFee}`,
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, reasons: ["Synthetic Package G fixture."], lineCount: lines.length, amountTokenCount: lines.length, hasExtractableText: true },
  };
}

function money(dollars: number): MoneyAmount {
  return { amountMinor: Math.round(dollars * 100), currency: "USD" };
}
