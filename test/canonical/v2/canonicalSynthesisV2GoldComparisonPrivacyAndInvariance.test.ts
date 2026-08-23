import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2SynthesisAnalysis,
  buildObservationalCanonicalEconomicsV2FromFiservPricing,
  canonicalSynthesisPrivacySafeDiagnostics,
  compareLegacyAndCanonicalSynthesisV2,
  observeCanonicalSynthesisV2ForGold,
  observeFiservEconomicsInCanonicalSynthesisV2,
  type LegacySynthesisObservation,
} from "../../../src/canonical/v2/index.js";
import {
  evaluateGoldAssertion,
  loadCurrentBaseline,
  loadGoldContract,
  loadToleranceRules,
  type GoldObservation,
} from "../../../scripts/gold-contract-lib.js";
import { economicPricing } from "./economicFixtures.js";
import { buildSynthesis, money, synthesisInput } from "./synthesisFixtures.js";

describe("Canonical Economics V2 RE Gold, comparison, privacy, and invariance", () => {
  it("matches RE-owned S4 flow assertions", async () => {
    const observation = observeCanonicalSynthesisV2ForGold(buildSynthesis(), { caseId: "S4" });
    await expectGoldMatches("S4", ["S4-FEES", "S4-REVENUE", "S4-RETAINED", "S4-THIRD-PARTY", "S4-NET-BURDEN", "S4-NO-GROSS-BURDEN"], observation);
  });

  it("matches S7 instruction isolation", async () => {
    const observation = observeCanonicalSynthesisV2ForGold(buildSynthesis(), { caseId: "S7" });
    await expectGoldMatches("S7", ["S7-INSTRUCTION", "S7-PROMOTION", "S7-NO-SECRET"], observation);
  });

  it("matches S9 denominator mismatch refusal", async () => {
    const input = synthesisInput();
    input.counterfactuals![0]!.populationCompatibility = "incompatible";
    const observation = observeCanonicalSynthesisV2ForGold(buildCanonicalEconomicsV2SynthesisAnalysis(input), { caseId: "S9" });
    await expectGoldMatches("S9", ["S9-STATE", "S9-NO-CONVERSION"], observation);
  });

  it("matches S10 savings refusal when the counterfactual is unsupported", async () => {
    const input = synthesisInput();
    input.claims!.find((item) => item.key === "keyed_condition")!.proof = {
      derivabilityTier: "unresolved", evidenceClass: "unresolved", assertionBasis: "source_fact", evidenceRefs: [],
    };
    const observation = observeCanonicalSynthesisV2ForGold(buildCanonicalEconomicsV2SynthesisAnalysis(input), { caseId: "S10" });
    await expectGoldMatches("S10", ["S10-SAVINGS", "S10-NO-SAVINGS"], observation);
  });

  it("projects semantic theme coverage without requiring exact one-label output", async () => {
    const observation = observeCanonicalSynthesisV2ForGold(buildSynthesis(), { caseId: "G5" });
    expect(observation.themeCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        semanticThemeCodes: expect.arrayContaining(["THEME_PREMIUM_REWARDS_MAJOR_COST_DRIVER"]),
        preservesEconomicMeaning: true,
        preservesEvidenceBoundaries: true,
        preservesActionability: true,
        overstatesCertainty: false,
        createsUnsupportedSavingsOrActionability: false,
      }),
    ]));
    await expectGoldMatches("G5", ["G5-THEME-PREMIUM", "G5-THEME-OPERATIONS"], { ...observation, sourceStatus: "available" });
  });

  it("reports zero unexpected divergence for aligned shared synthesis facts", () => {
    const analysis = buildSynthesis();
    const legacy: LegacySynthesisObservation = {
      drivers: analysis.synthesisLayer.drivers.map((driver) => ({
        id: driver.id,
        driverType: driver.driverType,
        populationRefs: driver.populationRefs,
        observedCost: driver.observedCost,
        attributionMethod: driver.attributionMethod,
        positiveEvidenceProven: true,
        treatedAsOpportunity: false,
        summedDespiteOverlap: false,
      })),
      counterfactuals: [{
        id: analysis.synthesisLayer.counterfactuals[0]!.id,
        resultAmount: money(125),
        targetProvenanceProven: true,
        populationCompatibilityProven: true,
        cadenceProven: true,
        annualized: false,
      }],
      levers: [{
        id: analysis.synthesisLayer.merchantLevers[0]!.id,
        state: "eligible_supported",
        controlProven: true,
        impact: money(125),
      }],
      collapsesSpecialEconomicFlows: false,
      appliesFutureNoticeToCurrentPeriod: false,
      promotesSignalToCausalityOrRiskWithoutProof: false,
      themeSemanticCoverageCodes: [...new Set(analysis.synthesisLayer.themes.flatMap((item) => item.semanticCoverageCodes))],
      duplicateThemeQuestionCount: 0,
      emitsMerchantFacingThemeProse: false,
    };
    const comparison = compareLegacyAndCanonicalSynthesisV2(legacy, analysis);

    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.counts.unexpected_divergence).toBe(0);
    expect(comparison.items.every((item) => item.classification === "same_semantic_fact")).toBe(true);
  });

  it("classifies each demonstrated legacy semantic shortcut under the approved amendments", () => {
    const analysis = buildSynthesis();
    const comparison = compareLegacyAndCanonicalSynthesisV2({
      drivers: [{
        id: analysis.synthesisLayer.drivers[0]!.id,
        driverType: "premium_rewards_mix",
        populationRefs: analysis.synthesisLayer.drivers[0]!.populationRefs,
        observedCost: money(900),
        attributionMethod: "exclusive_partition",
        positiveEvidenceProven: false,
        treatedAsOpportunity: true,
        summedDespiteOverlap: true,
      }],
      counterfactuals: [{
        id: analysis.synthesisLayer.counterfactuals[0]!.id,
        resultAmount: money(500),
        targetProvenanceProven: false,
        populationCompatibilityProven: false,
        cadenceProven: false,
        annualized: true,
      }],
      levers: [{ id: analysis.synthesisLayer.merchantLevers[0]!.id, state: "eligible_supported", controlProven: false, impact: money(500) }],
      collapsesSpecialEconomicFlows: true,
      appliesFutureNoticeToCurrentPeriod: true,
      promotesSignalToCausalityOrRiskWithoutProof: true,
      themeSemanticCoverageCodes: [],
      duplicateThemeQuestionCount: 2,
      emitsMerchantFacingThemeProse: true,
    }, analysis);

    expect(new Set(comparison.items.map((item) => item.amendmentId).filter(Boolean))).toEqual(new Set([
      "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY",
      "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION",
      "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL",
      "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER",
      "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS",
      "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION",
      "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY",
      "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS",
    ]));
    expect(comparison.hasUnexpectedDivergence).toBe(false);
  });

  it("marks an unexplained proven population difference as unexpected divergence", () => {
    const analysis = buildSynthesis();
    const comparison = compareLegacyAndCanonicalSynthesisV2({
      drivers: [{
        id: analysis.synthesisLayer.drivers[0]!.id,
        driverType: "premium_rewards_mix",
        populationRefs: [analysis.economicAnalysis.pricingAnalysis.foundation.financialPopulations.grossSaleVolume.id],
        observedCost: money(900),
        attributionMethod: "overlapping_declared",
        positiveEvidenceProven: true,
        treatedAsOpportunity: false,
        summedDespiteOverlap: false,
      }],
      counterfactuals: [], levers: [], collapsesSpecialEconomicFlows: false, appliesFutureNoticeToCurrentPeriod: false,
      promotesSignalToCausalityOrRiskWithoutProof: false, themeSemanticCoverageCodes: null, duplicateThemeQuestionCount: 0,
      emitsMerchantFacingThemeProse: false,
    }, analysis);

    expect(comparison.hasUnexpectedDivergence).toBe(true);
    expect(comparison.items).toContainEqual(expect.objectContaining({ classification: "unexpected_divergence", reasonCode: "proven_driver_population_disagrees" }));
  });

  it("emits non-financial privacy-safe diagnostics", () => {
    const analysis = buildSynthesis();
    const diagnostics = canonicalSynthesisPrivacySafeDiagnostics(analysis);
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics).toMatchObject({
      validationStatus: "valid",
      driverCounts: { supported: 3, unresolved: 0, unavailable: 0 },
      overlapRefusalCount: 1,
      themeCount: 2,
      hasUnexpectedDivergence: false,
    });
    expect(serialized).not.toContain("Synthetic private processor identity");
    expect(serialized).not.toContain("amountMinor");
    expect(serialized).not.toContain("admitted_premium_rewards_population");
    expect(serialized).not.toContain("sourceOccurrence");
  });

  it("keeps observational Fiserv synthesis empty and non-authoritative", () => {
    const observationalEconomic = buildObservationalCanonicalEconomicsV2FromFiservPricing(economicPricing());
    const before = structuredClone(observationalEconomic);
    const synthesis = observeFiservEconomicsInCanonicalSynthesisV2(observationalEconomic);

    expect(synthesis.validation.status).toBe("valid");
    expect(synthesis.economicAnalysis).toEqual(before);
    expect(synthesis.synthesisLayer.drivers).toEqual([]);
    expect(synthesis.synthesisLayer.counterfactuals).toEqual([]);
    expect(synthesis.synthesisLayer.merchantLevers).toEqual([]);
    expect(synthesis.synthesisLayer.themes).toEqual([]);
    expect(synthesis.synthesisLayer.refundEconomics.status).toBe("unavailable");
    expect(synthesis.synthesisLayer.amexEconomics.status).toBe("unavailable");
  });
});

async function expectGoldMatches(caseId: string, assertionIds: string[], observation: GoldObservation): Promise<void> {
  const [contract, tolerances, baseline] = await Promise.all([loadGoldContract(), loadToleranceRules(), loadCurrentBaseline()]);
  const goldCase = contract.cases.find((item) => item.case_id === caseId)!;
  for (const assertionId of assertionIds) {
    const assertion = goldCase.assertions.find((item) => item.assertion_id === assertionId)!;
    expect(assertion, `Missing finalized Gold assertion ${assertionId}`).toBeDefined();
    expect(evaluateGoldAssertion(assertion, observation, tolerances, baseline), assertionId).toMatchObject({ outcome: "pass" });
  }
}
