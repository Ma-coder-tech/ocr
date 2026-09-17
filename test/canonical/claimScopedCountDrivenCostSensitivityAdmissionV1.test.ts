import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedCountDrivenCostSensitivityAdmissionV1 } from "../../src/canonical/claimScopedCountDrivenCostSensitivityAdmissionV1.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import { assessCanonicalExactCountRateArithmetic } from "../../src/canonical/exactSourceArithmeticBridge.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { InternalAnalystPricingModelInput } from "../../src/canonical/internalAnalystFindingV1.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

describe("Claim-Scoped Count-Driven Cost Sensitivity Admission v1", () => {
  let basys: Awaited<ReturnType<typeof buildCase>>;
  let nxgen: Awaited<ReturnType<typeof buildCase>>;
  let paysafeFebruary: Awaited<ReturnType<typeof buildCase>>;

  beforeAll(async () => {
    [basys, nxgen, paysafeFebruary] = await Promise.all([
      buildCase("fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "restaurant_food_beverage"),
      buildCase("fiserv_NXGEN_VORTAX_Sep_2022.pdf", "retail"),
      buildCase("fiserv_PAYSAFE_Febr_2024.pdf", "professional_services"),
    ]);
  }, 30_000);

  it("admits the audited BASYS extension only through exact generalized predicates", () => {
    const admission = basys.profile.countDrivenCostSensitivityAdmission;
    expect(admission.aggregate).toMatchObject({
      existingAdmissionCount: 0,
      newlyAdmittedChargeCount: 8,
      newlyAdmittedReferencedAmountMinor: 23_646,
      admittedChargeCount: 8,
      admittedReferencedAmountMinor: 23_646,
      additiveSensitivityAmountMinor: 0,
    });
    expect(basys.profile.costStructureSensitivity.countDrivenChargeRefs).toHaveLength(8);
    expect(admission.admissions.filter((record) => record.eventPopulation.identity === "printed_authorization_or_access_events")).toHaveLength(7);
    expect(admission.admissions.filter((record) => record.eventPopulation.identity === "printed_avs_requests")).toHaveLength(1);
    expect(admission.admissions.map((record) => [record.count, record.perEventRateDollars, record.referencedChargedAmountMinor]))
      .toEqual(expect.arrayContaining([
        [497, "0.07", 3_479], [1, "0.07", 7], [2_670, "0.07", 18_690], [17, "0.07", 119],
        [69, "0.07", 483], [3, "0.07", 21], [118, "0.07", 826], [21, "0.01", 21],
      ]));
  });

  it("admits the five NXGEN CPU records without changing their ancillary cost-stack classification", () => {
    const admission = nxgen.profile.countDrivenCostSensitivityAdmission;
    const added = admission.admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
    expect(admission.aggregate).toMatchObject({
      existingAdmissionCount: 1,
      existingReferencedAmountMinor: 780,
      newlyAdmittedChargeCount: 5,
      newlyAdmittedReferencedAmountMinor: 6_925,
      admittedChargeCount: 6,
      admittedReferencedAmountMinor: 7_705,
    });
    expect(added.map((record) => [record.count, record.perEventRateDollars, record.referencedChargedAmountMinor]))
      .toEqual(expect.arrayContaining([[71, "0.25", 1_775], [4, "0.25", 100], [111, "0.25", 2_775], [79, "0.25", 1_975], [12, "0.25", 300]]));
    for (const record of added) {
      expect(record.eventPopulation).toMatchObject({
        mechanic: "authorization_events",
        identity: "printed_authorization_or_access_events",
        preservationStatus: "EXACT_GOVERNED_VALUE_PRESERVED",
      });
      const item = nxgen.profile.chargedCostProfile.items.find((candidate) => candidate.rdEconomicChargeRef === record.rdChargeRef);
      expect(item?.productCostConcept).toBe("ANCILLARY_SERVICE_ECONOMICS");
      expect(nxgen.decomposition.rows.find((row) => row.feeRowId === record.commercialFeeRowRef)?.commercialDollarCategory)
        .toBe("PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY");
    }
  });

  it("requires exact count-rate arithmetic and leaves mismatches excluded with precise blockers", () => {
    const mismatches = paysafeFebruary.profile.countDrivenCostSensitivityAdmission.excludedCandidates
      .filter((candidate) => candidate.blockers.includes("COUNT_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE"));
    expect(mismatches.length).toBeGreaterThanOrEqual(2);
    expect(mismatches.map((candidate) => candidate.referencedChargedAmountMinor)).toEqual(expect.arrayContaining([33, 640]));
    expect(paysafeFebruary.profile.countDrivenCostSensitivityAdmission.aggregate.newlyAdmittedChargeCount).toBe(0);
  });

  it("uses exact rational arithmetic with nearest-cent half-away-from-zero rounding", () => {
    expect(assessCanonicalExactCountRateArithmetic({ count: 1, perEventRateDollars: "0.005", chargedAmountMinor: 1 }))
      .toMatchObject({ status: "reproduces", exactAmount: { numeratorMinorUnits: "1", denominator: "2", roundedAmountMinor: 1 } });
    expect(assessCanonicalExactCountRateArithmetic({ count: 3, perEventRateDollars: "0.015", chargedAmountMinor: 5 }))
      .toMatchObject({ status: "reproduces", exactAmount: { numeratorMinorUnits: "9", denominator: "2", roundedAmountMinor: 5 } });
  });

  it("withholds a duplicated source-occurrence binding even when its arithmetic still reproduces", () => {
    const input = structuredClone(basys);
    const record = input.profile.countDrivenCostSensitivityAdmission.admissions[0]!;
    const item = input.profile.chargedCostProfile.items.find((candidate) => candidate.rdEconomicChargeRef === record.rdChargeRef)!;
    item.rdSourceOccurrenceRefs.push(record.sourceOccurrenceRef);
    const result = buildClaimScopedCountDrivenCostSensitivityAdmissionV1({
      economic: input.economic,
      commercialDecomposition: input.decomposition,
      chargedCostItems: input.profile.chargedCostProfile.items,
      existingCountDrivenChargeRefs: [],
      canonicalAnalysis: input.canonical,
    });
    expect(result.admissions.some((candidate) => candidate.rdChargeRef === record.rdChargeRef)).toBe(false);
    expect(result.excludedCandidates.find((candidate) => candidate.rdChargeRef === record.rdChargeRef)?.blockers)
      .toContain("SOURCE_OCCURRENCE_NOT_UNIQUE");
  });

  it("preserves a governed batch population without collapsing it into transactions", () => {
    const input = structuredClone(basys);
    const record = input.profile.countDrivenCostSensitivityAdmission.admissions[0]!;
    const row = input.decomposition.rows.find((candidate) => candidate.feeRowId === record.commercialFeeRowRef)!;
    row.mechanicAndPopulation.mechanic = "batches";
    row.mechanicAndPopulation.population = "printed_settlement_batches";
    const result = rebuildAdmission(input);
    const admitted = result.admissions.find((candidate) => candidate.rdChargeRef === record.rdChargeRef)!;
    expect(admitted.eventPopulation).toMatchObject({
      mechanic: "batches",
      identity: "printed_settlement_batches",
      preservationStatus: "EXACT_GOVERNED_VALUE_PRESERVED",
    });
  });

  it("withholds incompatible count populations instead of merging their operands", () => {
    const input = structuredClone(basys);
    const record = input.profile.countDrivenCostSensitivityAdmission.admissions.find((candidate) => {
      const occurrence = input.economic.pricingAnalysis.foundation.sourceModel.occurrences
        .find((value) => value.id === candidate.sourceOccurrenceRef);
      const item = input.profile.chargedCostProfile.items.find((value) => value.rdEconomicChargeRef === candidate.rdChargeRef);
      return typeof occurrence?.printedCount === "number" && Boolean(item?.pricingComponentRefs.length);
    })!;
    const item = input.profile.chargedCostProfile.items.find((value) => value.rdEconomicChargeRef === record.rdChargeRef)!;
    const component = input.economic.pricingAnalysis.pricingArchitecture.observedPricingComponents
      .find((value) => item.pricingComponentRefs.includes(value.id))!;
    component.basisType = "transaction_count";
    component.appliedCount = record.count + 1;
    component.perItemAmount = { amountMinor: 7, currency: "USD" };
    const result = rebuildAdmission(input);
    expect(result.admissions.find((candidate) => candidate.rdChargeRef === record.rdChargeRef)).toBeUndefined();
    const excluded = result.excludedCandidates.find((candidate) => candidate.rdChargeRef === record.rdChargeRef)!;
    expect(excluded.blockers).toEqual(expect.arrayContaining([
      "COUNT_NOT_KNOWN",
      "COUNT_RATE_EVIDENCE_CONFLICT",
      "COUNT_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE",
    ]));
  });

  it("fails each safety boundary without fee-name fallback", () => {
    const input = structuredClone(basys);
    const original = input.profile.countDrivenCostSensitivityAdmission.admissions[0]!;
    const item = input.profile.chargedCostProfile.items.find((candidate) => candidate.rdEconomicChargeRef === original.rdChargeRef)!;
    const row = input.decomposition.rows.find((candidate) => candidate.feeRowId === original.commercialFeeRowRef)!;
    row.mechanicAndPopulation.populationState = "unresolved";
    row.participants.merchantFacingPriceController = { state: "unresolved", value: null };
    row.commercialDollarCategory = "SHARED_BUNDLED_OR_UNRESOLVED";
    const occurrence = input.economic.pricingAnalysis.foundation.sourceModel.occurrences
      .find((candidate) => candidate.id === original.sourceOccurrenceRef)!;
    occurrence.printedCount = null;
    occurrence.printedRate = null;
    const arithmetic = input.canonical.feeLedger.partitionSourceProvenance.rowArithmetic
      .find((candidate) => candidate.feeRowId === original.commercialFeeRowRef);
    if (arithmetic) {
      arithmetic.formulaBasis = "unknown";
      arithmetic.itemCount = null;
      arithmetic.sourceUnitBasis = null;
      arithmetic.printedPerItemRate = null;
      arithmetic.printedPerUnitRate = null;
    }
    const result = buildClaimScopedCountDrivenCostSensitivityAdmissionV1({
      economic: input.economic,
      commercialDecomposition: input.decomposition,
      chargedCostItems: input.profile.chargedCostProfile.items,
      existingCountDrivenChargeRefs: [],
      canonicalAnalysis: input.canonical,
    });
    const excluded = result.excludedCandidates.find((candidate) => candidate.rdChargeRef === item.rdEconomicChargeRef)!;
    expect(excluded.blockers).toEqual(expect.arrayContaining([
      "EVENT_POPULATION_NOT_GOVERNED_EXPLICIT",
      "COUNT_NOT_KNOWN",
      "PER_EVENT_RATE_NOT_KNOWN",
      "COUNT_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE",
      "MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED",
      "SHARED_BUNDLED_OR_UPPER_BOUND",
      "EVENT_POPULATION_NOT_PRESERVED_EXACTLY",
    ]));
  });

  it("references one RD charge per record, reproduces exact cents, and contributes zero dollars", () => {
    for (const fixture of [basys, nxgen, paysafeFebruary]) {
      for (const record of fixture.profile.countDrivenCostSensitivityAdmission.admissions) {
        expect(record.arithmetic.status).toBe("reproduces");
        expect(record.arithmetic.exactAmount?.roundedAmountMinor).toBe(record.referencedChargedAmountMinor);
        expect(record.merchantFacingProviderControl).toMatchObject({ state: "SUPPORTED", value: "acquiring_side_program" });
        expect(record.additiveContributionMinor).toBe(0);
        expect(fixture.profile.costStructureSensitivity.countDrivenChargeRefs).toContain(record.rdChargeRef);
      }
      expect(new Set(fixture.profile.countDrivenCostSensitivityAdmission.admissions.map((record) => record.rdChargeRef)).size)
        .toBe(fixture.profile.countDrivenCostSensitivityAdmission.admissions.length);
      expect(fixture.profile.countDrivenCostSensitivityAdmission.safety).toMatchObject({
        rdIsSoleAdditiveLedger: true,
        rdMutationAllowed: false,
        canonicalMutationAllowed: false,
        costStackCategoryMutationAllowed: false,
        sensitivityCreatesAdditiveDollars: false,
        populationSubstitutionAllowed: false,
        feeNameInferenceAllowed: false,
        causalInferenceAllowed: false,
        merchantFaultInferenceAllowed: false,
        avoidabilityInferenceAllowed: false,
        negotiabilityInferenceAllowed: false,
        comparisonInputCount: 0,
        savingsOutputCount: 0,
        annualizationOutputCount: 0,
        aiOrWebOperationCount: 0,
        newKnowledgeAdmissionCount: 0,
        customerRoutingAllowed: false,
      });
    }
  });

  it("keeps qualification and count sensitivity non-additive when both describe the same RD charge", () => {
    const driver = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
      economic: basys.economic,
      currentRelationshipProfile: basys.profile,
      commercialDecomposition: basys.decomposition,
    });
    const driverFinding = driver.findings[0]!;
    const sensitivityRecord = structuredClone(basys.profile.countDrivenCostSensitivityAdmission.admissions[0]!);
    sensitivityRecord.rdChargeRef = driverFinding.rdChargeRefs[0]!;

    expect(driverFinding.rdChargeRefs).toContain(sensitivityRecord.rdChargeRef);
    expect(driverFinding.additiveContributionMinor).toBe(0);
    expect(sensitivityRecord.additiveContributionMinor).toBe(0);
    expect(driverFinding.additiveContributionMinor + sensitivityRecord.additiveContributionMinor).toBe(0);
  });

  it("does not mutate canonical truth, RD, decomposition, or charged-cost totals", () => {
    for (const fixture of [basys, nxgen, paysafeFebruary]) {
      expect(fingerprint(fixture.canonical)).toBe(fixture.canonicalFingerprint);
      expect(fingerprint(fixture.economic)).toBe(fixture.rdFingerprint);
      expect(fingerprint(fixture.decomposition)).toBe(fixture.decompositionFingerprint);
      expect(fingerprint(fixture.profile.chargedCostProfile)).toBe(fixture.chargedCostFingerprint);
    }
  });
});

async function buildCase(file: string, businessType: BusinessTypeId) {
  const safeStatementId = file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: file, businessType });
  const legacy = analyzeStatementDocument(inspected.document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error(`pricing unavailable ${file}`);
  }
  const pricing: InternalAnalystPricingModelInput = {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: canonical.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
  const knowledge = new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: pricing,
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const profile = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: canonical,
    commercialDecomposition: decomposition,
  }).profile;
  return {
    canonical,
    economic: inspected.economic,
    decomposition,
    profile,
    canonicalFingerprint: fingerprint(canonical),
    rdFingerprint: fingerprint(inspected.economic),
    decompositionFingerprint: fingerprint(decomposition),
    chargedCostFingerprint: fingerprint(profile.chargedCostProfile),
  };
}

function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function rebuildAdmission(input: Awaited<ReturnType<typeof buildCase>>) {
  return buildClaimScopedCountDrivenCostSensitivityAdmissionV1({
    economic: input.economic,
    commercialDecomposition: input.decomposition,
    chargedCostItems: input.profile.chargedCostProfile.items,
    existingCountDrivenChargeRefs: [],
    canonicalAnalysis: input.canonical,
  });
}
