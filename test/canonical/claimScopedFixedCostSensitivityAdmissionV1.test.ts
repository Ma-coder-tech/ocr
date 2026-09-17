import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedFixedCostSensitivityAdmissionV1 } from "../../src/canonical/claimScopedFixedCostSensitivityAdmissionV1.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { InternalAnalystPricingModelInput } from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

const GOLD: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];

describe("Claim-Scoped Fixed Cost Sensitivity Admission v1", () => {
  let fixtures: Awaited<ReturnType<typeof buildCase>>[];

  beforeAll(async () => {
    fixtures = await Promise.all(GOLD.map(({ file, businessType }) => buildCase(file, businessType)));
  }, 60_000);

  it("admits exactly the generalized statement-proven fixed cohort", () => {
    const records = fixtures.flatMap((fixture) => fixture.profile.fixedCostSensitivityAdmission.admissions);
    expect(records).toHaveLength(13);
    expect(sum(records.map((record) => record.referencedChargedAmountMinor))).toBe(9_541);
    expect(records.filter((record) => record.cadence.type === "monthly")).toHaveLength(10);
    expect(sum(records.filter((record) => record.cadence.type === "monthly").map((record) => record.referencedChargedAmountMinor))).toBe(5_284);
    expect(records.filter((record) => record.cadence.type === "statement_period")).toHaveLength(3);
    expect(sum(records.filter((record) => record.cadence.type === "statement_period").map((record) => record.referencedChargedAmountMinor))).toBe(4_257);
    expect(records.filter((record) => record.cadence.type === "annual")).toHaveLength(0);
    for (const record of records) {
      expect(Object.isFrozen(record)).toBe(true);
      expect(record.fixedBehavior).toMatchObject({ state: "PROVEN", amountKnown: true, amountActivityIndependent: true });
      expect(record.cadence).toMatchObject({ state: "PROVEN", source: "STATEMENT_EXPLICIT" });
      expect(record.merchantFacingControl.state).not.toBe("SUPPORTED");
      expect(record.negotiability.state).toBe("UNKNOWN");
      expect(record.avoidability.state).toBe("UNKNOWN");
      expect(record.annualization).toEqual({ allowed: false, annualizedAmountMinor: null });
      expect(record.additiveContributionMinor).toBe(0);
    }
    expect(fixtures.every((fixture) => Object.isFrozen(fixture.profile.fixedCostSensitivityAdmission))).toBe(true);
  });

  it("admits explicit monthly and statement-period charges while keeping control separate", () => {
    const monthly = findAdmission(fixtures, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "economic_charge_105");
    expect(monthly).toMatchObject({
      referencedChargedAmountMinor: 1_495,
      cadence: { type: "monthly", source: "STATEMENT_EXPLICIT" },
      economicCategory: { value: "SHARED_BUNDLED_OR_UNRESOLVED" },
    });
    const statement = findAdmission(fixtures, "fiserv_ABDUL_BASHER_Aug_2025.pdf", "economic_charge_050");
    expect(statement).toMatchObject({ referencedChargedAmountMinor: 1_000, cadence: { type: "statement_period" } });
    expect(statement.merchantFacingControl.state).not.toBe("SUPPORTED");
  });

  it("allows an external/network fixed charge without implying processor control", () => {
    const record = findAdmission(fixtures, "Nov_2024_Statement.pdf", "economic_charge_128");
    expect(record).toMatchObject({
      referencedChargedAmountMinor: 125,
      cadence: { type: "monthly" },
      economicCategory: { value: "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM" },
      merchantFacingControl: { state: "UNKNOWN" },
    });
  });

  it("does not infer cadence from one appearance, a fixed-looking name, or governed recurrence metadata", () => {
    const base = fixture(fixtures, "fiserv_ABDUL_BASHER_Aug_2025.pdf");
    const result = rebuild(base, "economic_charge_050", ({ row }) => {
      row.printedLabel = "FIXED APPLICATION FEE";
      row.recurrence = { state: "EXPLICIT_CADENCE_SUPPORTED", cadence: "monthly", evidenceRefs: [...row.evidenceRefs] };
    });
    expect(excluded(result, "economic_charge_050").blockers).toEqual(expect.arrayContaining([
      "CADENCE_NOT_EXPLICIT_FROM_STATEMENT", "FEE_NAME_ONLY_NOT_ADMISSIBLE",
    ]));
  });

  it("rejects monthly labels when operands or mechanics prove variable behavior", () => {
    const base = fixture(fixtures, "Nov_2024_Statement.pdf");
    const candidate = base.profile.fixedCostSensitivityAdmission.excludedCandidates
      .find((record) => record.rdChargeRef === "economic_charge_107")!;
    expect(candidate.printedLabel).toContain("MONTHLY ADVANTAGE FEE");
    expect(candidate.blockers).toEqual(expect.arrayContaining([
      "VOLUME_OR_PERCENTAGE_GOVERNED_AMOUNT", "VARIABLE_OPERANDS_PRESENT",
    ]));
  });

  it("rejects count-driven and mixed/minimum mechanics independent of fee-name intuition", () => {
    const wells = fixture(fixtures, "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");
    const countDriven = wells.profile.fixedCostSensitivityAdmission.excludedCandidates
      .find((record) => record.rdChargeRef === "economic_charge_074")!;
    expect(countDriven.blockers).toContain("COUNT_GOVERNED_AMOUNT");

    const clover = fixture(fixtures, "SAMPLE_MERCHANT4_CLOVER.pdf");
    const minimum = clover.profile.fixedCostSensitivityAdmission.excludedCandidates
      .find((record) => record.rdChargeRef === "economic_charge_001")!;
    expect(minimum.blockers).toEqual(expect.arrayContaining([
      "COUNT_GOVERNED_AMOUNT", "MINIMUM_GOVERNED_AMOUNT", "COUNT_VOLUME_OR_MIXED_OVERLAP",
    ]));
  });

  it("rejects overlap with count, volume, and mixed/minimum sensitivity", () => {
    const base = fixture(fixtures, "fiserv_ABDUL_BASHER_Aug_2025.pdf");
    for (const overrides of [
      { countDrivenChargeRefs: ["economic_charge_050"] },
      { volumeDrivenChargeRefs: ["economic_charge_050"] },
      { mixedMinimumChargeRefs: ["economic_charge_050"] },
    ]) {
      const result = rebuild(base, "economic_charge_050", () => undefined, overrides);
      expect(excluded(result, "economic_charge_050").blockers).toContain("COUNT_VOLUME_OR_MIXED_OVERLAP");
    }
  });

  it("fails closed on an ambiguous source bridge", () => {
    const base = fixture(fixtures, "fiserv_ABDUL_BASHER_Aug_2025.pdf");
    const input = structuredClone(base);
    const item = input.profile.chargedCostProfile.items.find((value) => value.rdEconomicChargeRef === "economic_charge_050")!;
    item.rdSourceOccurrenceRefs.push(item.rdSourceOccurrenceRefs[0]!);
    const result = buildClaimScopedFixedCostSensitivityAdmissionV1({
      economic: input.economic, commercialDecomposition: input.decomposition,
      chargedCostItems: input.profile.chargedCostProfile.items, existingFixedCostChargeRefs: [],
      countDrivenChargeRefs: input.profile.costStructureSensitivity.countDrivenChargeRefs,
      volumeDrivenChargeRefs: input.profile.costStructureSensitivity.volumeDrivenChargeRefs,
      mixedMinimumChargeRefs: input.profile.costStructureSensitivity.mixedMinimumChargeRefs,
    });
    expect(excluded(result, "economic_charge_050").blockers).toContain("SOURCE_OCCURRENCE_NOT_UNIQUE");
  });

  it("preserves upstream and sibling artifacts and never creates additive dollars", () => {
    for (const item of fixtures) {
      expect(fingerprint(item.canonical)).toBe(item.canonicalFingerprint);
      expect(fingerprint(item.economic)).toBe(item.rdFingerprint);
      expect(fingerprint(item.decomposition)).toBe(item.decompositionFingerprint);
      expect(fingerprint(item.profile.chargedCostProfile)).toBe(item.chargedCostFingerprint);
      expect(fingerprint(item.profile.countDrivenCostSensitivityAdmission)).toBe(item.countFingerprint);
      expect(fingerprint(item.profile.volumeDrivenCostSensitivityAdmission)).toBe(item.volumeFingerprint);
      expect(fingerprint(item.profile.mixedMinimumCostSensitivityAdmission)).toBe(item.mixedFingerprint);
      expect(fingerprint(item.qualification)).toBe(item.qualificationFingerprint);
      expect(item.profile.fixedCostSensitivityAdmission.aggregate.additiveSensitivityAmountMinor).toBe(0);
      expect(item.profile.costStructureSensitivity.additiveDriverContributionMinor).toBe(0);
      const fixed = item.profile.costStructureSensitivity.fixedCostDrivenChargeRefs;
      expect(new Set(fixed).size).toBe(fixed.length);
      expect(fixed.some((ref) => item.profile.costStructureSensitivity.countDrivenChargeRefs.includes(ref) ||
        item.profile.costStructureSensitivity.volumeDrivenChargeRefs.includes(ref) ||
        item.profile.costStructureSensitivity.mixedMinimumChargeRefs.includes(ref))).toBe(false);
    }
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
    document: inspected.document, economic: inspected.economic, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  }).profile;
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic, currentRelationshipProfile: profile, commercialDecomposition: decomposition,
  });
  return {
    file, canonical, economic: inspected.economic, decomposition, profile, qualification,
    canonicalFingerprint: fingerprint(canonical), rdFingerprint: fingerprint(inspected.economic),
    decompositionFingerprint: fingerprint(decomposition), chargedCostFingerprint: fingerprint(profile.chargedCostProfile),
    countFingerprint: fingerprint(profile.countDrivenCostSensitivityAdmission),
    volumeFingerprint: fingerprint(profile.volumeDrivenCostSensitivityAdmission),
    mixedFingerprint: fingerprint(profile.mixedMinimumCostSensitivityAdmission), qualificationFingerprint: fingerprint(qualification),
  };
}

function rebuild(
  base: Awaited<ReturnType<typeof buildCase>>,
  chargeRef: string,
  mutate: (value: { row: any; component: any; occurrence: any }) => void,
  overrides: { countDrivenChargeRefs?: string[]; volumeDrivenChargeRefs?: string[]; mixedMinimumChargeRefs?: string[] } = {},
) {
  const input = structuredClone(base);
  const item = input.profile.chargedCostProfile.items.find((value) => value.rdEconomicChargeRef === chargeRef)!;
  const row = input.decomposition.rows.find((value) => value.feeRowId === item.commercialFeeRowRef)!;
  const component = input.economic.pricingAnalysis.pricingArchitecture.observedPricingComponents
    .find((value) => item.pricingComponentRefs.includes(value.id))!;
  const occurrence = input.economic.pricingAnalysis.foundation.sourceModel.occurrences
    .find((value) => item.rdSourceOccurrenceRefs.includes(value.id))!;
  mutate({ row, component, occurrence });
  return buildClaimScopedFixedCostSensitivityAdmissionV1({
    economic: input.economic, commercialDecomposition: input.decomposition,
    chargedCostItems: input.profile.chargedCostProfile.items, existingFixedCostChargeRefs: [],
    countDrivenChargeRefs: overrides.countDrivenChargeRefs ?? input.profile.costStructureSensitivity.countDrivenChargeRefs.filter((ref) => ref !== chargeRef),
    volumeDrivenChargeRefs: overrides.volumeDrivenChargeRefs ?? input.profile.costStructureSensitivity.volumeDrivenChargeRefs.filter((ref) => ref !== chargeRef),
    mixedMinimumChargeRefs: overrides.mixedMinimumChargeRefs ?? input.profile.costStructureSensitivity.mixedMinimumChargeRefs.filter((ref) => ref !== chargeRef),
  });
}

function fixture(values: Awaited<ReturnType<typeof buildCase>>[], file: string) { return values.find((value) => value.file === file)!; }
function findAdmission(values: Awaited<ReturnType<typeof buildCase>>[], file: string, ref: string) {
  return fixture(values, file).profile.fixedCostSensitivityAdmission.admissions.find((record) => record.rdChargeRef === ref)!;
}
function excluded(result: ReturnType<typeof buildClaimScopedFixedCostSensitivityAdmissionV1>, ref: string) {
  return result.excludedCandidates.find((record) => record.rdChargeRef === ref)!;
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null, deterministic: true };
}

function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
