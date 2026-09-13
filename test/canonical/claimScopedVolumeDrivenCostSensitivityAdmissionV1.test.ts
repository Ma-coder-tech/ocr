import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildClaimScopedVolumeDrivenCostSensitivityAdmissionV1 } from "../../src/canonical/claimScopedVolumeDrivenCostSensitivityAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import { assessCanonicalExactVolumeRateArithmetic } from "../../src/canonical/exactSourceArithmeticBridge.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { InternalAnalystPricingModelInput } from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

describe("Claim-Scoped Volume-Driven Cost Sensitivity Admission v1", () => {
  let november: Awaited<ReturnType<typeof buildCase>>;
  let clover: Awaited<ReturnType<typeof buildCase>>;
  let basys: Awaited<ReturnType<typeof buildCase>>;
  let nxgen: Awaited<ReturnType<typeof buildCase>>;
  let wells: Awaited<ReturnType<typeof buildCase>>;

  beforeAll(async () => {
    [november, clover, basys, nxgen, wells] = await Promise.all([
      buildCase("Nov_2024_Statement.pdf", "restaurant_food_beverage"),
      buildCase("SAMPLE_MERCHANT4_CLOVER.pdf", "restaurant_food_beverage"),
      buildCase("fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "restaurant_food_beverage"),
      buildCase("fiserv_NXGEN_VORTAX_Sep_2022.pdf", "retail"),
      buildCase("fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", "restaurant_food_beverage"),
    ]);
  }, 40_000);

  it("admits the audited generalized cohort through exact base-rate arithmetic", () => {
    expect(november.profile.volumeDrivenCostSensitivityAdmission.aggregate).toMatchObject({ newlyAdmittedChargeCount: 8, newlyAdmittedReferencedAmountMinor: 6_118 });
    expect(clover.profile.volumeDrivenCostSensitivityAdmission.aggregate).toMatchObject({ newlyAdmittedChargeCount: 8, newlyAdmittedReferencedAmountMinor: 6_117 });
    expect(wells.profile.volumeDrivenCostSensitivityAdmission.aggregate).toMatchObject({ newlyAdmittedChargeCount: 1, newlyAdmittedReferencedAmountMinor: 13 });
    const admissions = [november, clover, wells].flatMap((fixture) => fixture.profile.volumeDrivenCostSensitivityAdmission.admissions);
    expect(admissions).toHaveLength(17);
    expect(admissions.reduce((total, record) => total + record.referencedChargedAmountMinor, 0)).toBe(12_248);
    for (const record of admissions) {
      expect(record.arithmetic.status).toBe("reproduces");
      expect(record.arithmetic.exactAmount?.roundedAmountMinor).toBe(record.referencedChargedAmountMinor);
      expect(record.economicClassification).toEqual({
        layer: "acquiring_commercial",
        dollarCategory: "PROVIDER_CONTROLLED_VARIABLE",
        dollarAttribution: "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE",
      });
      expect(record.merchantFacingProviderControl).toMatchObject({ state: "SUPPORTED", value: "acquiring_side_program" });
      expect(record.additiveContributionMinor).toBe(0);
    }
  });

  it("keeps network, shared/bundled, and malformed BASYS percentage rows excluded", () => {
    expect(november.profile.volumeDrivenCostSensitivityAdmission.excludedCandidates.some((record) =>
      record.blockers.includes("CARD_NETWORK_ECONOMICS_EXCLUDED"))).toBe(true);
    expect(november.profile.volumeDrivenCostSensitivityAdmission.excludedCandidates.some((record) =>
      record.blockers.includes("SHARED_BUNDLED_OR_UPPER_BOUND"))).toBe(true);
    const malformed = basys.profile.volumeDrivenCostSensitivityAdmission.excludedCandidates.filter((record) =>
      record.commercialDollarCategory === "PROVIDER_CONTROLLED_VARIABLE" && record.blockers.includes("BASE_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE"));
    expect(malformed).toHaveLength(5);
    expect(malformed.map((record) => record.normalizedRate)).toEqual(expect.arrayContaining(["7", "3"]));
    expect(basys.profile.volumeDrivenCostSensitivityAdmission.admissions).toHaveLength(0);
  });

  it("fails closed for interchange and government/regulatory economic classifications", () => {
    const interchange = mutateFirstAdmission(november, ({ row }) => {
      row.economicLayer = { state: "supported", value: "issuer_interchange" };
      row.commercialDollarCategory = "INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE";
    });
    expect(interchange.excludedCandidates.find((record) => record.blockers.includes("ISSUER_INTERCHANGE_ECONOMICS_EXCLUDED"))).toBeTruthy();

    const government = mutateFirstAdmission(november, ({ row }) => {
      row.economicLayer = { state: "supported", value: "government_or_nonprocessing_pass_through" };
      row.commercialDollarCategory = "GOVERNMENT_NONPROCESSING_OR_OTHER";
    });
    expect(government.excludedCandidates.find((record) => record.blockers.includes("GOVERNMENT_REGULATORY_ECONOMICS_EXCLUDED"))).toBeTruthy();
  });

  it("requires base, normalized rate, reproduced arithmetic, provider control, and an exact non-upper-bound attribution", () => {
    const result = mutateFirstAdmission(november, ({ item, row, component, occurrence }) => {
      component.appliedBaseAmount = null;
      component.rate = null;
      component.printedRate = null;
      component.printedRateUnit = null;
      row.participants.collector = { state: "supported", value: "acquiring_side_program" };
      row.participants.merchantFacingPriceController = { state: "unresolved", value: null };
      row.commercialDollarCategory = "SHARED_BUNDLED_OR_UNRESOLVED";
      row.commercialDollarAttribution.kind = "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY";
      row.claimPermissions.exactProviderControlledDollarsAllowed = false;
      row.claimPermissions.providerControlledUpperBoundAllowed = true;
      item.rdSourceOccurrenceRefs.push(occurrence.id);
    });
    const excluded = result.excludedCandidates.find((record) => record.rdChargeRef === "economic_charge_030")!;
    expect(excluded.blockers).toEqual(expect.arrayContaining([
      "SOURCE_OCCURRENCE_NOT_UNIQUE",
      "BILLED_MONETARY_BASE_NOT_KNOWN",
      "NORMALIZED_RATE_NOT_KNOWN",
      "BASE_RATE_NOT_SAME_OCCURRENCE_COMPONENT",
      "BASE_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE",
      "MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED",
      "EXACT_PROVIDER_CONTROLLED_DOLLARS_NOT_SUPPORTED",
      "SHARED_BUNDLED_OR_UPPER_BOUND",
    ]));
  });

  it("rejects conflicting rate normalization and count/composite overlap", () => {
    const conflict = mutateFirstAdmission(november, ({ component }) => {
      component.printedRate = "0.002";
    });
    expect(conflict.excludedCandidates.find((record) => record.rdChargeRef === "economic_charge_030")?.blockers).toEqual(expect.arrayContaining([
      "NORMALIZED_RATE_NOT_KNOWN", "BASE_RATE_EVIDENCE_CONFLICT", "BASE_TIMES_RATE_DOES_NOT_REPRODUCE_CHARGE",
    ]));

    const composite = mutateFirstAdmission(november, ({ component }) => { component.appliedCount = 2; });
    expect(composite.excludedCandidates.find((record) => record.rdChargeRef === "economic_charge_030")?.blockers).toContain("COUNT_DRIVEN_OR_COMPOSITE_OVERLAP");
  });

  it("uses exact rational nearest-cent half-away-from-zero rounding", () => {
    expect(assessCanonicalExactVolumeRateArithmetic({ billedBaseMinor: 1, normalizedRate: "0.5", chargedAmountMinor: 1 }))
      .toMatchObject({ status: "reproduces", exactAmount: { numeratorMinorUnits: "1", denominator: "2", roundedAmountMinor: 1 } });
    expect(assessCanonicalExactVolumeRateArithmetic({ billedBaseMinor: 3, normalizedRate: "0.5", chargedAmountMinor: 2 }))
      .toMatchObject({ status: "reproduces", exactAmount: { numeratorMinorUnits: "3", denominator: "2", roundedAmountMinor: 2 } });
  });

  it("keeps RD, canonical truth, charged costs, and count sensitivity unchanged and non-additive", () => {
    for (const fixture of [november, clover, basys, nxgen, wells]) {
      expect(fingerprint(fixture.canonical)).toBe(fixture.canonicalFingerprint);
      expect(fingerprint(fixture.economic)).toBe(fixture.rdFingerprint);
      expect(fingerprint(fixture.decomposition)).toBe(fixture.decompositionFingerprint);
      expect(fingerprint(fixture.profile.chargedCostProfile)).toBe(fixture.chargedCostFingerprint);
      expect(fingerprint(fixture.profile.countDrivenCostSensitivityAdmission)).toBe(fixture.countSensitivityFingerprint);
      expect(fixture.profile.costStructureSensitivity.additiveDriverContributionMinor).toBe(0);
      expect(new Set(fixture.profile.volumeDrivenCostSensitivityAdmission.admissions.map((record) => record.rdChargeRef)).size)
        .toBe(fixture.profile.volumeDrivenCostSensitivityAdmission.admissions.length);
    }
  });

  it("keeps qualification and volume sensitivity non-additive on the same RD reference", () => {
    const driver = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
      economic: nxgen.economic,
      currentRelationshipProfile: nxgen.profile,
      commercialDecomposition: nxgen.decomposition,
    });
    const finding = driver.findings[0]!;
    const sensitivity = structuredClone(november.profile.volumeDrivenCostSensitivityAdmission.admissions[0]!);
    sensitivity.rdChargeRef = finding.rdChargeRefs[0]!;
    expect(finding.rdChargeRefs).toContain(sensitivity.rdChargeRef);
    expect(finding.additiveContributionMinor + sensitivity.additiveContributionMinor).toBe(0);
  });
});

async function buildCase(file: string, businessType: BusinessTypeId) {
  const safeStatementId = file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: file, businessType });
  const knowledge = new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: deterministicPricing(inspected.document, file, businessType, canonical),
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
    countSensitivityFingerprint: fingerprint(profile.countDrivenCostSensitivityAdmission),
  };
}

function mutateFirstAdmission(
  fixture: Awaited<ReturnType<typeof buildCase>>,
  mutate: (value: {
    item: Awaited<ReturnType<typeof buildCase>>["profile"]["chargedCostProfile"]["items"][number];
    row: Awaited<ReturnType<typeof buildCase>>["decomposition"]["rows"][number];
    component: Awaited<ReturnType<typeof buildCase>>["economic"]["pricingAnalysis"]["pricingArchitecture"]["observedPricingComponents"][number];
    occurrence: Awaited<ReturnType<typeof buildCase>>["economic"]["pricingAnalysis"]["foundation"]["sourceModel"]["occurrences"][number];
  }) => void,
) {
  const input = structuredClone(fixture);
  const admitted = input.profile.volumeDrivenCostSensitivityAdmission.admissions[0]!;
  const item = input.profile.chargedCostProfile.items.find((candidate) => candidate.rdEconomicChargeRef === admitted.rdChargeRef)!;
  const row = input.decomposition.rows.find((candidate) => candidate.feeRowId === admitted.commercialFeeRowRef)!;
  const component = input.economic.pricingAnalysis.pricingArchitecture.observedPricingComponents
    .find((candidate) => candidate.id === admitted.pricingComponentRef)!;
  const occurrence = input.economic.pricingAnalysis.foundation.sourceModel.occurrences
    .find((candidate) => candidate.id === admitted.sourceOccurrenceRef)!;
  mutate({ item, row, component, occurrence });
  return buildClaimScopedVolumeDrivenCostSensitivityAdmissionV1({
    economic: input.economic,
    commercialDecomposition: input.decomposition,
    chargedCostItems: input.profile.chargedCostProfile.items,
    existingVolumeDrivenChargeRefs: [],
    countDrivenChargeRefs: input.profile.costStructureSensitivity.countDrivenChargeRefs,
  });
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
