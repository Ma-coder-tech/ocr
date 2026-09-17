import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedMixedMinimumCostSensitivityAdmissionV1 } from "../../src/canonical/claimScopedMixedMinimumCostSensitivityAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { InternalAnalystPricingModelInput } from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

describe("Claim-Scoped Mixed/Minimum Cost Sensitivity Admission v1", () => {
  let november: Awaited<ReturnType<typeof buildCase>>;
  let clover: Awaited<ReturnType<typeof buildCase>>;
  let zeroVolume: Awaited<ReturnType<typeof buildCase>>;
  let wells: Awaited<ReturnType<typeof buildCase>>;

  beforeAll(async () => {
    [november, clover, zeroVolume, wells] = await Promise.all([
      buildCase("Nov_2024_Statement.pdf", "restaurant_food_beverage"),
      buildCase("SAMPLE_MERCHANT4_CLOVER.pdf", "restaurant_food_beverage"),
      buildCase("fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", "ecommerce"),
      buildCase("fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", "restaurant_food_beverage"),
    ]);
  }, 40_000);

  it("admits only the audited exact minimum-applied-count cohort", () => {
    expect(clover.profile.mixedMinimumCostSensitivityAdmission.aggregate)
      .toMatchObject({ newlyAdmittedChargeCount: 1, newlyAdmittedReferencedAmountMinor: 174 });
    expect(wells.profile.mixedMinimumCostSensitivityAdmission.aggregate)
      .toMatchObject({ newlyAdmittedChargeCount: 1, newlyAdmittedReferencedAmountMinor: 300 });
    const admissions = [clover, wells].flatMap((fixture) => fixture.profile.mixedMinimumCostSensitivityAdmission.admissions);
    expect(admissions.map((record) => [record.rdChargeRef, record.operands.appliedMinimumCount,
      record.operands.perEventRateDollars, record.referencedChargedAmountMinor])).toEqual([
      ["economic_charge_001", 174, "0.01", 174],
      ["economic_charge_002", 300, "0.01", 300],
    ]);
    for (const record of admissions) {
      expect(record).toMatchObject({ sensitivityClass: "MIXED_OR_MINIMUM", relationshipType: "minimum_applied_count", additiveContributionMinor: 0 });
      expect(record.arithmetic).toMatchObject({ status: "reproduces", exactAmount: { roundedAmountMinor: record.referencedChargedAmountMinor } });
      expect(record.merchantFacingProviderControl).toMatchObject({ state: "SUPPORTED", value: "acquiring_side_program" });
    }
  });

  it("excludes November's unreproduced minimum-like charge and the zero-volume minimum with no applied base", () => {
    const novemberCandidate = november.profile.mixedMinimumCostSensitivityAdmission.excludedCandidates
      .find((record) => record.rdChargeRef === "economic_charge_001")!;
    expect(novemberCandidate).toMatchObject({ appliedMinimumCount: 185, perEventRateDollars: "0.01", referencedChargedAmountMinor: 186 });
    expect(novemberCandidate.arithmetic.exactAmount?.roundedAmountMinor).toBe(185);
    expect(novemberCandidate.blockers).toContain("ARITHMETIC_DOES_NOT_REPRODUCE_CHARGE");

    const zeroCandidate = zeroVolume.profile.mixedMinimumCostSensitivityAdmission.excludedCandidates
      .find((record) => record.rdChargeRef === "economic_charge_005")!;
    expect(zeroCandidate.referencedChargedAmountMinor).toBe(3_000);
    expect(zeroCandidate.blockers).toEqual(expect.arrayContaining([
      "MINIMUM_THRESHOLD_OR_APPLIED_BASE_NOT_KNOWN", "ARITHMETIC_DOES_NOT_REPRODUCE_CHARGE",
    ]));
  });

  it("fails closed when required operands are missing or conflict", () => {
    const missing = rebuild(clover, ({ occurrence, component }) => {
      occurrence.printedCount = null;
      component.appliedCount = null;
    });
    expect(candidate(missing).blockers).toEqual(expect.arrayContaining([
      "MINIMUM_THRESHOLD_OR_APPLIED_BASE_NOT_KNOWN", "ARITHMETIC_DOES_NOT_REPRODUCE_CHARGE",
    ]));

    const conflict = rebuild(clover, ({ component }) => { component.rate = "0.02"; });
    expect(candidate(conflict).blockers).toEqual(expect.arrayContaining([
      "OPERAND_EVIDENCE_CONFLICT", "OPERANDS_NOT_SAME_OCCURRENCE_COMPONENT", "ARITHMETIC_DOES_NOT_REPRODUCE_CHARGE",
    ]));
  });

  it("does not infer a minimum relationship from a vague label", () => {
    const result = rebuild(clover, ({ row }) => {
      row.printedLabel = "MINIMUM SERVICE FEE";
      row.identity = { exactState: "unresolved", exactValue: null, familyState: "unresolved", familyValue: null };
      row.mechanicAndPopulation = { mechanicState: "unresolved", mechanic: null, populationState: "unresolved", population: null };
    });
    expect(candidate(result).blockers).toEqual(expect.arrayContaining([
      "RELATIONSHIP_NOT_EXPLICITLY_GOVERNED", "FEE_NAME_ONLY_NOT_ADMISSIBLE",
    ]));
  });

  it("does not infer provider control from collection or the minimum label", () => {
    const result = rebuild(clover, ({ row }) => {
      row.participants.collector = { state: "supported", value: "processor_or_acquirer" };
      row.participants.merchantFacingPriceController = { state: "unresolved", value: null };
    });
    expect(candidate(result).blockers).toContain("MERCHANT_FACING_PROVIDER_CONTROL_NOT_SUPPORTED");
  });

  it("rejects rate-plus-item splits and bundled tier mechanics", () => {
    const split = rebuild(clover, ({ item, component, economic }) => {
      const extra = structuredClone(component);
      extra.id = `${component.id}_volume`;
      extra.appliedCount = null;
      extra.appliedBaseAmount = { amountMinor: 10_000, currency: "USD" };
      extra.rate = "0.001";
      extra.printedRate = "0.001";
      item.pricingComponentRefs.push(extra.id);
      economic.pricingAnalysis.pricingArchitecture.observedPricingComponents.push(extra);
    });
    expect(candidate(split).blockers).toEqual(expect.arrayContaining([
      "PRICING_COMPONENT_NOT_UNIQUELY_LINKED", "RATE_PLUS_ITEM_OR_SPLIT_REQUIRED",
    ]));

    const bundled = rebuild(clover, ({ component, row }) => {
      component.componentKind = "bundled";
      component.formulaRelationship = "mutually_exclusive_tier";
      row.commercialDollarCategory = "SHARED_BUNDLED_OR_UNRESOLVED";
      row.commercialDollarAttribution.kind = "SHARED_BUNDLED_OR_UNRESOLVED";
      row.claimPermissions.exactProviderControlledDollarsAllowed = false;
    });
    expect(candidate(bundled).blockers).toEqual(expect.arrayContaining([
      "EXACT_PROVIDER_CONTROLLED_DOLLARS_NOT_SUPPORTED", "UNDERLYING_OR_SHARED_ECONOMICS_EXCLUDED",
      "BUNDLED_TIER_OR_UNRESOLVED_COMPOSITE",
    ]));
  });

  it("fails closed on source ambiguity and any count or volume overlap", () => {
    const ambiguous = rebuild(clover, ({ item, occurrence }) => { item.rdSourceOccurrenceRefs.push(occurrence.id); });
    expect(candidate(ambiguous).blockers).toContain("SOURCE_OCCURRENCE_NOT_UNIQUE");

    const countOverlap = rebuild(clover, () => undefined, { countDrivenChargeRefs: ["economic_charge_001"] });
    expect(candidate(countOverlap).blockers).toContain("COUNT_OR_VOLUME_OVERLAP");
    const volumeOverlap = rebuild(clover, () => undefined, { volumeDrivenChargeRefs: ["economic_charge_001"] });
    expect(candidate(volumeOverlap).blockers).toContain("COUNT_OR_VOLUME_OVERLAP");
  });

  it("preserves canonical, RD, charged cost, count, and volume artifacts and contributes once with zero dollars", () => {
    for (const fixture of [november, clover, zeroVolume, wells]) {
      expect(fingerprint(fixture.canonical)).toBe(fixture.canonicalFingerprint);
      expect(fingerprint(fixture.economic)).toBe(fixture.rdFingerprint);
      expect(fingerprint(fixture.decomposition)).toBe(fixture.decompositionFingerprint);
      expect(fingerprint(fixture.profile.chargedCostProfile)).toBe(fixture.chargedCostFingerprint);
      expect(fingerprint(fixture.profile.countDrivenCostSensitivityAdmission)).toBe(fixture.countFingerprint);
      expect(fingerprint(fixture.profile.volumeDrivenCostSensitivityAdmission)).toBe(fixture.volumeFingerprint);
      expect(fixture.profile.mixedMinimumCostSensitivityAdmission.aggregate.additiveSensitivityAmountMinor).toBe(0);
      expect(fixture.profile.costStructureSensitivity.additiveDriverContributionMinor).toBe(0);
      const refs = fixture.profile.mixedMinimumCostSensitivityAdmission.admissions.map((record) => record.rdChargeRef);
      expect(new Set(refs).size).toBe(refs.length);
      expect(refs.some((ref) => fixture.profile.costStructureSensitivity.countDrivenChargeRefs.includes(ref) ||
        fixture.profile.costStructureSensitivity.volumeDrivenChargeRefs.includes(ref))).toBe(false);
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
    countFingerprint: fingerprint(profile.countDrivenCostSensitivityAdmission),
    volumeFingerprint: fingerprint(profile.volumeDrivenCostSensitivityAdmission),
  };
}

function rebuild(
  fixture: Awaited<ReturnType<typeof buildCase>>,
  mutate: (value: {
    item: Awaited<ReturnType<typeof buildCase>>["profile"]["chargedCostProfile"]["items"][number];
    row: Awaited<ReturnType<typeof buildCase>>["decomposition"]["rows"][number];
    component: Awaited<ReturnType<typeof buildCase>>["economic"]["pricingAnalysis"]["pricingArchitecture"]["observedPricingComponents"][number];
    occurrence: Awaited<ReturnType<typeof buildCase>>["economic"]["pricingAnalysis"]["foundation"]["sourceModel"]["occurrences"][number];
    economic: Awaited<ReturnType<typeof buildCase>>["economic"];
  }) => void,
  overrides: { countDrivenChargeRefs?: string[]; volumeDrivenChargeRefs?: string[] } = {},
) {
  const input = structuredClone(fixture);
  const admitted = input.profile.mixedMinimumCostSensitivityAdmission.admissions[0]!;
  const item = input.profile.chargedCostProfile.items.find((value) => value.rdEconomicChargeRef === admitted.rdChargeRef)!;
  const row = input.decomposition.rows.find((value) => value.feeRowId === admitted.commercialFeeRowRef)!;
  const component = input.economic.pricingAnalysis.pricingArchitecture.observedPricingComponents
    .find((value) => value.id === admitted.pricingComponentRef)!;
  const occurrence = input.economic.pricingAnalysis.foundation.sourceModel.occurrences
    .find((value) => value.id === admitted.sourceOccurrenceRef)!;
  mutate({ item, row, component, occurrence, economic: input.economic });
  return buildClaimScopedMixedMinimumCostSensitivityAdmissionV1({
    economic: input.economic,
    commercialDecomposition: input.decomposition,
    chargedCostItems: input.profile.chargedCostProfile.items,
    existingMixedMinimumChargeRefs: [],
    countDrivenChargeRefs: overrides.countDrivenChargeRefs ?? input.profile.costStructureSensitivity.countDrivenChargeRefs,
    volumeDrivenChargeRefs: overrides.volumeDrivenChargeRefs ?? input.profile.costStructureSensitivity.volumeDrivenChargeRefs,
  });
}

function candidate(result: ReturnType<typeof buildClaimScopedMixedMinimumCostSensitivityAdmissionV1>) {
  return result.excludedCandidates.find((record) => record.rdChargeRef === "economic_charge_001")!;
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
