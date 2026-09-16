import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2SynthesisAnalysis,
  compareLegacyAndCanonicalSynthesisV2,
  observeCanonicalSynthesisV2ForGold,
  type CanonicalEconomicsV2SynthesisAnalysis,
  type LegacySynthesisObservation,
} from "../../../src/canonical/v2/index.js";
import { buildSynthesis, money, synthesisInput, supportedProof } from "./synthesisFixtures.js";

describe("Canonical Economics V2 RE bounded-correction adversarial admission", () => {
  it("rejects an arbitrary driver predicate and a cost pool unrelated to the charge", () => {
    const predicate = synthesisInput();
    predicate.drivers![0]!.populationPredicateCode = "recognizable_rewards_label" as never;
    expect(build(predicate).synthesisLayer.drivers[0]).toMatchObject({ status: "unresolved", observedCost: null });

    const pool = synthesisInput();
    pool.drivers![0]!.relevantCostPoolRef = "issuer_interchange_cost";
    expect(build(pool).synthesisLayer.drivers[0]).toMatchObject({ status: "unresolved", observedCost: null });
  });

  it("does not let an arbitrary allocation string authorize addition", () => {
    const input = synthesisInput();
    const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    input.claims!.push(currentClaim(input, "allocation_relationship", "attribution_relationship", "arbitrary_allocation", "exclusive_within_group"));
    input.attributionRelationships!.push({
      key: "arbitrary_allocation", relationshipType: "exclusive_within_group", driverKeys: ["keyed", "regulated"],
      allocationCalculationRef: "truthy_but_unregistered", additiveAggregationAllowed: true,
      relationshipClaimKey: "allocation_relationship", proof: input.drivers![0]!.proof,
    });
    expect(period).toBeTruthy();
    expect(build(input).synthesisLayer.attributionRelationships.at(-1)).toMatchObject({ additiveAggregationAllowed: false, allocationCalculationRef: null });
  });

  it("enforces reciprocal supersession and removes superseded contribution and impact", () => {
    const input = synthesisInput();
    input.claims!.push(
      currentClaim(input, "supersedes_claim", "attribution_relationship", "keyed_supersedes", "supersedes"),
      currentClaim(input, "superseded_by_claim", "attribution_relationship", "regulated_superseded", "superseded_by"),
    );
    input.attributionRelationships!.push(
      { key: "keyed_supersedes", relationshipType: "supersedes", driverKeys: ["keyed", "regulated"], relationshipClaimKey: "supersedes_claim", reciprocalRelationshipKey: "regulated_superseded", proof: input.drivers![0]!.proof },
      { key: "regulated_superseded", relationshipType: "superseded_by", driverKeys: ["regulated", "keyed"], relationshipClaimKey: "superseded_by_claim", reciprocalRelationshipKey: "keyed_supersedes", proof: input.drivers![0]!.proof },
    );
    input.drivers!.find((item) => item.key === "regulated")!.relationshipKeys!.push("keyed_supersedes", "regulated_superseded");
    input.counterfactuals![0]!.relationshipKeys!.push("keyed_supersedes");
    const layer = build(input).synthesisLayer;
    expect(layer.drivers.find((item) => item.driverType === "regulated_debit")!.contributionStatus).toBe("superseded");
    expect(layer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", exactDelta: null });
  });

  it("rejects contradictory or missing reciprocal supersession", () => {
    const input = synthesisInput();
    input.claims!.push(currentClaim(input, "bad_supersession_claim", "attribution_relationship", "bad_supersession", "supersedes"));
    input.attributionRelationships!.push({
      key: "bad_supersession", relationshipType: "supersedes", driverKeys: ["keyed", "regulated"],
      relationshipClaimKey: "bad_supersession_claim", reciprocalRelationshipKey: "missing", proof: input.drivers![0]!.proof,
    });
    expect(build(input).synthesisLayer.attributionRelationships.at(-1)!.relationshipType).toBe("unresolved");
  });

  it("ignores arbitrary formula, provenance, and calculation strings for exact impact", () => {
    const input = synthesisInput();
    Object.assign(input.counterfactuals![0]!, {
      targetClaimKey: null, alternativeConditionClaimKey: null, assumptionClaimKeys: [], calculationKey: null,
      alternativeProvenanceId: "made_up_target", formulaCode: "made_up_formula", calculationRef: "made_up_calculation",
    });
    expect(build(input).synthesisLayer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", exactDelta: null, calculationRef: null });
  });

  it("rejects arbitrary numeric conditional bounds that are not recomputed", () => {
    const input = synthesisInput();
    Object.assign(input.counterfactuals![0]!, {
      requestedResultState: "bounded_conditional_delta", exactDelta: null, lowerBound: money(-9_999_999), upperBound: money(9_999_999),
      conditionCode: "admitted_merchant_controlled_acceptance_method",
    });
    Object.assign(input.calculations!.find((item) => item.key === "keyed_delta_calculation")!, {
      kind: "counterfactual_bounded_delta", inputAmounts: [money(350), money(225), money(250)], resultAmount: null,
      lowerResultAmount: money(-9_999_999), upperResultAmount: money(9_999_999),
    });
    expect(build(input).synthesisLayer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", lowerBound: null, upperBound: null });
  });

  it("does not treat unrelated one-statement evidence as cadence proof", () => {
    const input = synthesisInput();
    Object.assign(input.counterfactuals![0]!, { annualized: true, recurrenceProven: true, cadenceEvidenceRefs: input.drivers![0]!.proof.evidenceRefs });
    expect(build(input).synthesisLayer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", recurrenceProven: false, exactDelta: null });
  });

  it("rejects processor control and generic operational evidence as merchant influence", () => {
    const processor = synthesisInput();
    const processorParticipant = processor.economicAnalysis.economicLayer.participants.find((item) => item.roles.includes("processor_platform"))!;
    const controlClaim = processor.claims!.find((item) => item.key === "merchant_change_right")!;
    controlClaim.participantRefs = [processorParticipant.id];
    expect(build(processor).synthesisLayer.merchantLevers[0]!.state).toBe("candidate_requires_verification");

    const operational = synthesisInput();
    operational.merchantLevers![0]!.leverType = "operational_process_change";
    operational.claims!.find((item) => item.key === "merchant_change_right")!.kind = "merchant_operational_controllability";
    expect(build(operational).synthesisLayer.merchantLevers[0]!.state).toBe("candidate_requires_verification");
  });

  it("admits refund dimensions independently and refuses generic cross-field proof", () => {
    const input = synthesisInput();
    input.refundEconomics!.underlyingCostReturnClaimKey = null;
    input.refundEconomics!.processorPricingReturnClaimKey = "refund_basis";
    const refund = build(input).synthesisLayer.refundEconomics;
    expect(refund).toMatchObject({ status: "supported", underlyingCostReturnState: "unresolved", processorPricingReturnState: "unresolved", percentagePricingBasis: "gross_sales" });
  });

  it("rejects arbitrary Amex mapping and an unrelated charge/control margin claim", () => {
    const mapping = synthesisInput();
    mapping.amexEconomics!.acceptanceModeMappingRef = "arbitrary_mapping";
    expect(build(mapping).synthesisLayer.amexEconomics).toMatchObject({ acceptanceMode: "unknown", acceptanceModeMappingRef: null });

    const margin = synthesisInput();
    const period = margin.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    const charge = margin.economicAnalysis.economicLayer.charges.find((item) => item.subtype === "service_admin")!;
    const role = margin.economicAnalysis.economicLayer.roleClaims.find((item) => item.dimension === "negotiator_change_authority")!;
    margin.claims!.push({
      key: "unrelated_amex_margin", kind: "amex_margin_component", subjectKey: "amex", claimCode: "amex_margin",
      chargeRefs: [charge.id], roleClaimRefs: [role.id], periodStart: period.start, periodEnd: period.end, proof: margin.drivers![0]!.proof,
    });
    Object.assign(margin.amexEconomics!, { marginClaimKey: "unrelated_amex_margin", marginChargeRefs: [charge.id], ownershipRoleRefs: [role.id] });
    expect(build(margin).synthesisLayer.amexEconomics.marginState).toBe("unresolved");
  });

  it("does not let generic service evidence prove usage or removability", () => {
    const input = synthesisInput();
    const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    const service = input.accountServices![0]!;
    input.claims!.push({
      key: "generic_usage", kind: "service_usage", subjectKey: "gateway_service", claimCode: "usage_proven",
      chargeRefs: service.chargeRefs, occurrenceRefs: [input.drivers![0]!.sourceOccurrenceRefs![0]!],
      periodStart: period.start, periodEnd: period.end, proof: service.proof,
    });
    service.state = "charge_observed_usage_proven";
    service.usageClaimKey = "generic_usage";
    expect(build(input).synthesisLayer.accountServices[0]).toMatchObject({ state: "charge_observed_usage_unknown", usageClaimRef: null });
  });

  it("recomputes S4 and rejects inconsistent result, sign, currency, period, and missing flows", () => {
    const inconsistent = synthesisInput();
    inconsistent.merchantPricingPrograms![0]!.netMerchantBorneCost = money(9999);
    expect(build(inconsistent).synthesisLayer.merchantPricingPrograms[0]!.netBurdenState).toBe("unavailable");

    for (const mutate of [
      (input: ReturnType<typeof synthesisInput>) => { input.calculations!.find((item) => item.key === "dual_pricing_net_calculation")!.inputAmounts![0] = money(-10000); },
      (input: ReturnType<typeof synthesisInput>) => { input.claims!.find((item) => item.key === "program_revenue")!.moneyValue = { currency: "EUR" as never, amountMinor: 8000 }; },
      (input: ReturnType<typeof synthesisInput>) => { input.claims!.find((item) => item.key === "program_revenue")!.periodEnd = "2026-09-30"; },
      (input: ReturnType<typeof synthesisInput>) => { input.merchantPricingPrograms![0]!.flowClaimKeys = input.merchantPricingPrograms![0]!.flowClaimKeys!.slice(0, 4); },
    ]) {
      const input = synthesisInput(); mutate(input);
      expect(build(input).synthesisLayer.merchantPricingPrograms[0]!.netBurdenState).toBe("unavailable");
    }
  });

  it("does not let generic statement evidence prove off-statement absence", () => {
    const input = synthesisInput();
    input.offStatementExposures![0]!.state = "known_absent_with_evidence";
    input.offStatementExposures![0]!.stateClaimKey = "generic_absence";
    input.claims!.push(currentClaim(input, "generic_absence", "off_statement_absence", "equipment_lease", "no_equipment_lease"));
    expect(build(input).synthesisLayer.offStatementExposures[0]!.state).toBe("unknown_whether_exists");
  });

  it("does not allow future-notice evidence to authorize current impact", () => {
    const input = synthesisInput();
    const futureProof = input.notices![0]!.proof;
    input.counterfactuals![0]!.proof = futureProof;
    for (const claim of input.claims!.filter((item) => item.subjectKey === "keyed_delta")) claim.proof = futureProof;
    input.calculations!.find((item) => item.key === "keyed_delta_calculation")!.proof = futureProof;
    expect(build(input).synthesisLayer.counterfactuals[0]).toMatchObject({ resultState: "verification_only", exactDelta: null });
  });

  it("does not promote generic source evidence to operational causality", () => {
    const input = synthesisInput();
    input.claims!.push(currentClaim(input, "generic_causality", "operational_causality", "keyed_signal", "keyed_causes_cost"));
    input.operationalSignals![0]!.causalStatus = "causal_relationship_supported";
    input.operationalSignals![0]!.causalityClaimKey = "generic_causality";
    expect(build(input).synthesisLayer.operationalSignals[0]).toMatchObject({ causalStatus: "unresolved", causalityClaimRef: null });
  });

  it("validates dispute numerator and denominator roles instead of trusting compatibility", () => {
    const input = synthesisInput();
    const facts = input.economicAnalysis.pricingAnalysis.foundation.financialPopulations;
    const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    input.claims!.push({
      key: "risk_compatibility", kind: "risk_population_compatibility", subjectKey: "risk", claimCode: "chargeback_to_gross_sales",
      populationRefs: [facts.chargebackCount.id, facts.grossSaleTransactionCount.id, facts.chargebackPrincipalDebitAmount.id, facts.grossSaleVolume.id],
      scopeCode: "same_period_compatible_events", periodStart: period.start, periodEnd: period.end, proof: input.accountRisk!.proof,
    });
    input.accountRisk!.compatibilityClaimKey = "risk_compatibility";
    input.accountRisk!.denominatorCompatibility = "compatible";
    input.accountRisk!.disputeDebitCountFactRef = facts.refundTransactionCount.id;
    expect(build(input).synthesisLayer.accountRisk).toMatchObject({ state: "observed_unreconciled", descriptiveRatioByCount: null, descriptiveRatioByValue: null });
  });

  it("preserves provenance per merged theme contribution and caps theme actionability", () => {
    const input = synthesisInput();
    const unsupportedProof = { derivabilityTier: "unresolved" as const, evidenceClass: "hypothesis_only" as const, assertionBasis: "ai_hypothesis" as const, evidenceRefs: [] };
    input.themes!.push({
      key: "unsupported_duplicate", claimKey: null, economicQuestionCode: "major_processing_mix_driver", actionBoundaryCode: "explanation_only",
      themeType: "major_economic_driver", driverKeys: ["keyed"], materiality: "material", actionabilityState: "eligible_supported",
      priorityClass: "account_survival", semanticCoverageCodes: ["THEME_UNSUPPORTED_AI_PROMOTION"], proof: unsupportedProof,
    });
    const theme = build(input).synthesisLayer.themes.find((item) => item.economicQuestionCode === "major_processing_mix_driver")!;
    expect(theme.semanticCoverageCodes).not.toContain("THEME_UNSUPPORTED_AI_PROMOTION");
    expect(theme.contributions).toContainEqual(expect.objectContaining({ status: "unresolved", semanticCoverageCodes: [] }));

    const actionability = synthesisInput();
    actionability.merchantLevers![0]!.merchantInfluenceClaimKey = null;
    const operationalTheme = build(actionability).synthesisLayer.themes.find((item) => item.economicQuestionCode === "keyed_operational_signal")!;
    expect(operationalTheme.actionabilityState).toBe("unresolved");
  });
});

describe("Canonical Economics V2 RE deep comparison and Gold projection", () => {
  it("never falls back to the first canonical driver, counterfactual, or lever", () => {
    const analysis = buildSynthesis();
    const legacy = alignedLegacy(analysis);
    legacy.drivers[0]!.id = "missing-driver";
    legacy.counterfactuals[0]!.id = "missing-counterfactual";
    legacy.levers[0]!.id = "missing-lever";
    const report = compareLegacyAndCanonicalSynthesisV2(legacy, analysis);
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ fact: "driver:missing-driver:identity", classification: "unexpected_divergence" }),
      expect.objectContaining({ fact: "counterfactual:missing-counterfactual", classification: "v2_unavailable_or_ambiguous" }),
      expect.objectContaining({ fact: "lever:missing-lever", classification: "v2_unavailable_or_ambiguous" }),
    ]));
  });

  it("detects driver population, predicate, and cost-pool divergences", () => {
    const analysis = buildSynthesis();
    const legacy = alignedLegacy(analysis);
    legacy.drivers[0]!.populationRefs = [analysis.economicAnalysis.pricingAnalysis.foundation.financialPopulations.grossSaleVolume.id];
    legacy.drivers[0]!.populationPredicateCode = "other_source_supported_population";
    legacy.drivers[0]!.relevantCostPoolRef = "issuer_interchange_cost";
    const report = compareLegacyAndCanonicalSynthesisV2(legacy, analysis);
    expect(report.items.filter((item) => item.classification === "unexpected_divergence").map((item) => item.reasonCode)).toEqual(expect.arrayContaining([
      "proven_driver_population_disagrees", "driver_predicate_disagrees", "driver_cost_pool_disagrees",
    ]));
  });

  it("detects target, formula, impact, and cadence divergence", () => {
    const analysis = buildSynthesis();
    const legacy = alignedLegacy(analysis);
    Object.assign(legacy.counterfactuals[0]!, { targetProvenanceId: "wrong", formulaCode: "wrong", resultAmount: money(126), annualized: true, cadenceProven: true });
    const reasons = compareLegacyAndCanonicalSynthesisV2(legacy, analysis).items.filter((item) => item.classification === "unexpected_divergence").map((item) => item.reasonCode);
    expect(reasons).toEqual(expect.arrayContaining(["counterfactual_delta_disagrees", "counterfactual_target_provenance_disagrees", "counterfactual_formula_disagrees", "counterfactual_cadence_disagrees"]));
  });

  it("detects risk compatibility and theme actionability divergence", () => {
    const analysis = buildSynthesis();
    const legacy = alignedLegacy(analysis);
    legacy.riskDenominatorCompatibility = "compatible";
    legacy.themeActionabilityByQuestion = { keyed_operational_signal: "not_available" };
    const reasons = compareLegacyAndCanonicalSynthesisV2(legacy, analysis).items.filter((item) => item.classification === "unexpected_divergence").map((item) => item.reasonCode);
    expect(reasons).toEqual(expect.arrayContaining(["risk_denominator_compatibility_disagrees", "theme_actionability_disagrees"]));
  });

  it("projects newly modeled RE fields generically without case-ID branches", () => {
    const observation = observeCanonicalSynthesisV2ForGold(buildSynthesis());
    expect(observation.values).toMatchObject({
      "mix.premium_rewards_volume_share": 0.4,
      "mix.premium_rewards_interchange_pool_share": 0.6,
      "mix.regulated_debit_program_cost": 2.5,
    });
    expect(observation.states).toMatchObject({
      "notice.future_candidate": "observed_not_current",
      "notice.current_economic_effect": "none_from_future_notice",
      "refund.underlying_cost_return": "mixed_by_scope",
      "service.gateway": "charge_observed_usage_unknown",
      "opportunity.savings": "canonical_savings_not_projected_by_re",
    });
    expect(observation.enforcedProhibitions).toEqual(expect.arrayContaining(["SAVINGS_WITHOUT_VALID_COUNTERFACTUAL", "GROSS_PROCESSOR_FEES_AS_NET_MERCHANT_BURDEN"]));
  });
});

function build(input: ReturnType<typeof synthesisInput>) { return buildCanonicalEconomicsV2SynthesisAnalysis(input); }

function currentClaim(input: ReturnType<typeof synthesisInput>, key: string, kind: Parameters<typeof addClaim>[2], subjectKey: string, claimCode: string) {
  const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
  return addClaim(key, subjectKey, kind, claimCode, input.drivers![0]!.populationRefs[0]!, input.drivers![0]!.sourceOccurrenceRefs![0]!, period.start, period.end, input.drivers![0]!.proof);
}

function addClaim(
  key: string, subjectKey: string, kind: import("../../../src/canonical/v2/index.js").CanonicalSynthesisClaimKind,
  claimCode: string, populationRef: string, occurrenceRef: string, periodStart: string, periodEnd: string,
  proof: ReturnType<typeof supportedProof>,
) {
  return { key, kind, subjectKey, claimCode, populationRefs: [populationRef], occurrenceRefs: [occurrenceRef], periodStart, periodEnd, proof };
}

function alignedLegacy(analysis: CanonicalEconomicsV2SynthesisAnalysis): LegacySynthesisObservation {
  const counterfactual = analysis.synthesisLayer.counterfactuals[0]!;
  return {
    drivers: analysis.synthesisLayer.drivers.map((driver) => ({
      id: driver.id, driverType: driver.driverType, populationRefs: driver.populationRefs, observedCost: driver.observedCost,
      attributionMethod: driver.attributionMethod, populationPredicateCode: driver.populationPredicateCode,
      relevantCostPoolRef: driver.relevantCostPoolRef, positiveEvidenceProven: true, treatedAsOpportunity: false, summedDespiteOverlap: false,
    })),
    counterfactuals: [{
      id: counterfactual.id, resultAmount: counterfactual.exactDelta, targetProvenanceProven: true,
      populationCompatibilityProven: true, cadenceProven: counterfactual.recurrenceProven, annualized: counterfactual.annualized,
      observedPopulationRefs: counterfactual.observedPopulationRefs, alternativePopulationRefs: counterfactual.alternativePopulationRefs,
      targetProvenanceId: counterfactual.alternativeProvenanceId, formulaCode: counterfactual.formulaCode,
      baselinePeriod: counterfactual.baselinePeriod, impactPeriod: counterfactual.impactPeriod,
    }],
    levers: analysis.synthesisLayer.merchantLevers.map((lever) => ({ id: lever.id, state: lever.state, controlProven: true, impact: lever.calculatedImpact })),
    collapsesSpecialEconomicFlows: false, appliesFutureNoticeToCurrentPeriod: false, promotesSignalToCausalityOrRiskWithoutProof: false,
    themeSemanticCoverageCodes: [...new Set(analysis.synthesisLayer.themes.flatMap((item) => item.semanticCoverageCodes))],
    duplicateThemeQuestionCount: 0, emitsMerchantFacingThemeProse: false,
  };
}
