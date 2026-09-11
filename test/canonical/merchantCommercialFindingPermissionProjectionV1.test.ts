import { describe, expect, it } from "vitest";

import {
  evaluateGovernedCommercialPublicPolicyV1,
  evaluateMerchantCommercialFindingCandidateV1,
  projectMerchantCommercialCandidatesV1,
  validateMerchantSafeCommercialProjectionV1,
  type MerchantCommercialProjectionCandidateV1,
} from "../../src/canonical/merchantCommercialFindingPermissionProjectionV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  buildInternalCommercialComparisonFindingV1,
  type AcceptedComparatorDiagnosticV1,
  type InternalCommercialComparisonFindingV1,
} from "../../src/canonical/internalCommercialComparisonFindingV1.js";

describe("Merchant Commercial Finding Permission & Projection v1", () => {
  it("keeps validity, merchant visibility, and action permission independent and ignores the internal action signal", () => {
    const finding = exactFinding(1_000);
    expect(finding.action.signal).toBe("REVIEW_CURRENT_PRICING");
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({ finding, providerCostMinor: 100_000 }));
    expect(decision.findingValidity).toBe("valid");
    expect(decision.visibility).toEqual({ permitted: true, mode: "comparison" });
    expect(decision.action).toEqual({ permitted: false, type: "NONE" });
    expect(decision.internalSignalIgnored).toBe(true);
  });

  it.each([
    [999, 10_000, "below_noise_floor", false, false],
    [1_000, 10_000, "explain_only", true, false],
    [3_999, 60_000, "explain_only", true, false],
    [4_000, 66_778, "explain_only", true, false],
    [4_000, 66_666, "review_threshold_met", true, true],
  ] as const)("applies variable boundary difference=%s denominator=%s", (difference, denominator, state, visible, review) => {
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({ finding: exactFinding(difference), providerCostMinor: denominator }));
    expect(decision.materiality.state).toBe(state);
    expect(decision.visibility.permitted).toBe(visible);
    expect(decision.action.permitted).toBe(review);
  });

  it.each([
    [1_000, 100_000, "below_noise_floor", false, false],
    [1_001, 100_000, "explain_only", true, false],
    [2_999, 100_000, "explain_only", true, false],
    [3_000, 150_754, "explain_only", true, false],
    [3_000, 150_000, "review_threshold_met", true, true],
  ] as const)("applies fixed monthly boundary difference=%s denominator=%s", (difference, denominator, state, visible, review) => {
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({
      finding: exactFinding(difference), providerCostMinor: denominator, componentClass: "fixed_monthly", cadence: "monthly",
    }));
    expect(decision.materiality.state).toBe(state);
    expect(decision.visibility.permitted).toBe(visible);
    expect(decision.action.permitted).toBe(review);
  });

  it.each([
    [14, 10_000, 100_000, "explain_only", false],
    [15, 9_990, 100_000, "explain_only", false],
    [15, 10_000, 100_000, "review_threshold_met", true],
  ] as const)("applies episodic boundary events=%s difference=%s", (events, difference, denominator, state, review) => {
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({
      finding: exactFinding(difference), providerCostMinor: denominator, componentClass: "episodic", eventCount: events,
    }));
    expect(decision.materiality.state).toBe(state);
    expect(decision.action.permitted).toBe(review);
  });

  it.each([
    "network_or_pass_through",
    "shared_or_bundled",
    "unresolved_controller",
    "upper_bound_only",
  ] as const)("withholds pricing review for %s control", (controlState) => {
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({
      finding: exactFinding(5_000), providerCostMinor: 50_000, controlState,
    }));
    expect(decision.visibility.permitted).toBe(true);
    expect(decision.action.permitted).toBe(false);
  });

  it.each(["zero", "unknown", "bounded", "incomplete"] as const)("withholds pricing review for %s provider-cost denominator", (state) => {
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({
      finding: exactFinding(5_000), denominatorState: state, providerCostMinor: state === "zero" ? 0 : 50_000,
    }));
    expect(decision.action.permitted).toBe(false);
  });

  it.each([
    ["currentComponent", "current component unresolved"],
    ["alternativeComponent", "governed alternative component unresolved"],
    ["population", "authorization attempts versus approved authorizations"],
    ["population", "approved authorizations versus settled sales"],
    ["population", "settled sales versus batches"],
    ["population", "batches versus gateway events"],
    ["unitBillingBasis", "gross versus net volume"],
    ["unitBillingBasis", "net versus refund-adjusted volume"],
    ["unitBillingBasis", "refund-adjusted versus submitted volume"],
    ["economicLayer", "gateway versus acquiring"],
    ["serviceIdentity", "different service identity"],
    ["channel", "card-present versus card-not-present"],
    ["statementPeriod", "current evidence versus historical statement"],
    ["offerIdentity", "provider, offer, or distribution identity mismatch"],
    ["decompositionControl", "commercial-decomposition control unresolved"],
    ["unitBillingBasis", "per-item versus percentage"],
  ] as const)("fails closed on %s mismatch: %s", (gate, _description) => {
    const c = candidate({ finding: exactFinding(5_000), providerCostMinor: 50_000 });
    c.revalidation[gate] = "mismatch";
    const decision = evaluateMerchantCommercialFindingCandidateV1(c);
    expect(decision.comparisonValidity).toBe("unavailable");
    expect(decision.visibility.mode).toBe("comparison_unavailable");
    expect(decision.action.permitted).toBe(false);
  });

  it("refuses exact arithmetic when the bound amount states do not independently agree", () => {
    const c = candidate({ finding: exactFinding(5_000), providerCostMinor: 50_000, currentAmountState: "upper_bound" });
    const decision = evaluateMerchantCommercialFindingCandidateV1(c);
    expect(decision.comparisonValidity).toBe("unavailable");
    expect(decision.reasonCodes).toContain("comparison_amount_state_mismatch");
    expect(decision.action.permitted).toBe(false);
  });

  it("preserves both bounded directions without exact pricing-review action", () => {
    const favorableAlternative = evaluateMerchantCommercialFindingCandidateV1(candidate({ finding: boundedFinding(50_000, 35_000), currentAmountState: "upper_bound", controlState: "upper_bound_only" }));
    const adverseAlternative = evaluateMerchantCommercialFindingCandidateV1(candidate({ finding: boundedFinding(50_000, 60_000), currentAmountState: "upper_bound", controlState: "upper_bound_only" }));
    expect(favorableAlternative.direction).toBe("unresolved");
    expect(favorableAlternative.customerSafeRecord?.comparableComponentDifference).toBeNull();
    expect(adverseAlternative.direction).toBe("bounded_alternative_costs_more");
    expect(adverseAlternative.customerSafeRecord?.comparableComponentDifference?.amountMinor).toBe(10_000);
    expect([favorableAlternative, adverseAlternative].every((item) => !item.action.permitted)).toBe(true);
  });

  it("keeps prohibited, restricted, no-known-block, approval-unknown, and approved states distinct", () => {
    const base = { finding: exactFinding(5_000), providerCostMinor: 50_000 };
    const prohibited = evaluateMerchantCommercialFindingCandidateV1(candidate({ ...base, publicPolicy: "publicly_prohibited" }));
    const restricted = evaluateMerchantCommercialFindingCandidateV1(candidate({ ...base, publicPolicy: "restricted_or_review_required" }));
    const conditional = evaluateMerchantCommercialFindingCandidateV1(candidate({ ...base, publicPolicy: "no_known_public_block", approval: "approval_unknown" }));
    const approved = evaluateMerchantCommercialFindingCandidateV1(candidate({ ...base, publicPolicy: "public_policy_unknown", approval: "merchant_specific_approved" }));
    expect(prohibited.visibility).toEqual({ permitted: false, mode: "hidden" });
    expect(prohibited.namedAlternativePermitted).toBe(false);
    expect(restricted.visibility.mode).toBe("verify");
    expect(restricted.action.permitted).toBe(false);
    expect(conditional.customerSafeRecord?.conditions.join(" ")).toMatch(/qualifies.*approved/i);
    expect(conditional.action.permitted).toBe(true);
    expect(approved.namedAlternativePermitted).toBe(true);
    expect(approved.action.permitted).toBe(true);
  });

  it.each([
    ["cannabis", "publicly_prohibited"],
    ["charity", "restricted_or_review_required"],
    ["no_listed_h3_issue", "no_known_public_block"],
    ["restaurant", "public_policy_unknown"],
  ] as const)("consumes the admitted Helcim public-policy predicates for %s", (merchantType, expected) => {
    const registry = HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1;
    const composition = registry.offerCompositionVersions.find((item) => item.compositionVersionId === "offer_helcim_direct_processing_v1");
    expect(composition).toBeDefined();
    expect(evaluateGovernedCommercialPublicPolicyV1({ registry, composition: composition!, facts: { merchant_type: merchantType } })).toBe(expected);
  });

  it.each([
    [{ known_high_risk: true }, "publicly_prohibited"],
    [{ future_delivery_or_custom_deposit_or_open_ended_billing: true }, "restricted_or_review_required"],
    [{ risk_review_required: false }, "no_known_public_block"],
    [{ known_high_risk: false }, "public_policy_unknown"],
  ] as const)("consumes the admitted Dharma High Volume public-policy predicates", (facts, expected) => {
    const registry = HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1;
    const composition = registry.offerCompositionVersions.find((item) => item.compositionVersionId === "offer_dharma_high_volume_v1");
    expect(composition).toBeDefined();
    expect(evaluateGovernedCommercialPublicPolicyV1({ registry, composition: composition!, facts })).toBe(expected);
  });

  it.each([
    ["complete_non_reversing", true, "comparison"],
    ["complete_reversing", false, "explain"],
    ["incomplete", false, "explain"],
  ] as const)("applies %s offset protection", (offsetState, review, mode) => {
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({
      finding: exactFinding(5_000), providerCostMinor: 50_000, offsetState,
    }));
    expect(decision.action.permitted).toBe(review);
    expect(decision.visibility.mode).toBe(mode);
    if (offsetState === "incomplete") expect(decision.customerSafeRecord?.scopeNote).toMatch(/individual component.*full relevant pricing scope/i);
  });

  it("uses one symmetric selection rule for both material directions in a commercial scope", () => {
    const worse = candidate({ finding: exactFinding(5_000), providerCostMinor: 50_000, candidateId: "worse", groupId: "same-scope" });
    const better = candidate({ finding: exactFinding(-5_000), providerCostMinor: 50_000, candidateId: "better", groupId: "same-scope" });
    const projection = projectMerchantCommercialCandidatesV1({ candidates: [worse, better] });
    expect(projection.decisions.map((item) => [item.candidateId, item.visibility.permitted, item.direction])).toEqual([
      ["worse", true, "current_costs_more"],
      ["better", true, "current_costs_less"],
    ]);
  });

  it.each(["qualification", "commercial_fact", "blocker"] as const)("never promotes %s evidence into comparison arithmetic or review", (kind) => {
    const finding = nonComparisonFinding(kind);
    const decision = evaluateMerchantCommercialFindingCandidateV1(candidate({ finding, providerCostMinor: 50_000 }));
    expect(decision.comparisonValidity).toBe(kind === "blocker" ? "unavailable" : "not_a_comparison");
    expect(decision.action.permitted).toBe(false);
    expect(decision.customerSafeRecord?.comparableComponentDifference).toBeNull();
    if (kind !== "blocker") {
      expect(decision.customerSafeRecord?.matchedActivity).toBeNull();
      expect(decision.customerSafeRecord?.scopeNote).toMatch(/no current-versus-alternative price comparison/i);
    } else {
      expect(decision.customerSafeRecord?.comparisonBlocker).toBeTruthy();
      expect(decision.customerSafeRecord?.smallestUnlocker).toBe("A matching activity population.");
    }
  });

  it("emits merchant-safe copy and the accepted report-level limitation without tallies", () => {
    const blocked = candidate({ finding: nonComparisonFinding("blocker"), candidateId: "blocked" });
    const projection = projectMerchantCommercialCandidatesV1({ candidates: [blocked] });
    expect(projection.customerSafeProjection.reportLimitation).toContain("does not mean the pricing is good or bad");
    expect(JSON.stringify(projection.customerSafeProjection)).not.toMatch(/\b(?:count|tally|savings|registry|runtime|canonical|hash)\b/i);
    expect(validateMerchantSafeCommercialProjectionV1(projection.customerSafeProjection)).toEqual([]);
    expect(projection.realCustomerRoutingAllowed).toBe(false);
  });

  it("preserves repeated historical refusals internally while using only the report-level limitation for merchant projection", () => {
    const candidates = ["historical-a", "historical-b", "historical-c"].map((candidateId) => {
      const value = candidate({ finding: exactFinding(5_000), candidateId });
      value.revalidation.statementPeriod = "mismatch";
      return value;
    });
    const projection = projectMerchantCommercialCandidatesV1({ candidates });
    expect(projection.decisions).toHaveLength(3);
    expect(projection.decisions.every((item) => item.comparisonValidity === "unavailable")).toBe(true);
    expect(projection.decisions.every((item) => item.reasonCodes.includes("statementPeriod_mismatch"))).toBe(true);
    expect(projection.decisions.every((item) => item.reasonCodes.includes("merchant_projection_report_limitation_only"))).toBe(true);
    expect(projection.customerSafeProjection.findings).toEqual([]);
    expect(projection.customerSafeProjection.reportLimitation).toContain("does not mean the pricing is good or bad");
  });

  it("consolidates equivalent useful blockers but preserves distinct merchant-verifiable unlockers", () => {
    const populationA = candidate({ finding: exactFinding(5_000), candidateId: "population-a" });
    const populationB = candidate({ finding: exactFinding(5_000), candidateId: "population-b" });
    const channel = candidate({ finding: exactFinding(5_000), candidateId: "channel" });
    populationA.revalidation.population = "mismatch";
    populationB.revalidation.population = "mismatch";
    channel.revalidation.channel = "mismatch";
    const projection = projectMerchantCommercialCandidatesV1({ candidates: [populationA, populationB, channel] });
    expect(projection.decisions).toHaveLength(3);
    expect(projection.customerSafeProjection.findings).toHaveLength(2);
    expect(projection.decisions.find((item) => item.candidateId === "population-b")?.reasonCodes)
      .toContain("merchant_projection_equivalent_blocker_consolidated");
    expect(projection.customerSafeProjection.findings.map((item) => item.smallestUnlocker)).toEqual(expect.arrayContaining([
      "A supported bridge showing that both prices apply to the same billed activity.",
      "A supported card-present, card-not-present, or gateway activity split.",
    ]));
  });

  it("keeps a merchant-specific approval or quote blocker visible as a distinct useful next fact", () => {
    const projection = projectMerchantCommercialCandidatesV1({
      candidates: [candidate({ finding: exactFinding(5_000), candidateId: "approval", publicPolicy: "public_policy_unknown" })],
    });
    expect(projection.decisions[0]).toMatchObject({
      comparisonValidity: "valid_exact",
      visibility: { permitted: true, mode: "comparison_unavailable" },
      action: { permitted: false, type: "NONE" },
    });
    expect(projection.customerSafeProjection.findings[0]?.smallestUnlocker).toMatch(/merchant-specific approval.*quote/i);
    expect(projection.customerSafeProjection.findings[0]?.alternative).toBeNull();
    expect(projection.customerSafeProjection.reportLimitation).toContain("does not mean the pricing is good or bad");
  });
});

type CandidatePatch = {
  finding?: InternalCommercialComparisonFindingV1;
  candidateId?: string;
  groupId?: string;
  providerCostMinor?: number | null;
  denominatorState?: MerchantCommercialProjectionCandidateV1["providerControlledCost"]["state"];
  controlState?: MerchantCommercialProjectionCandidateV1["current"]["controlState"];
  componentClass?: MerchantCommercialProjectionCandidateV1["componentClass"];
  cadence?: MerchantCommercialProjectionCandidateV1["cadence"];
  eventCount?: number | null;
  publicPolicy?: MerchantCommercialProjectionCandidateV1["applicability"]["publicPolicy"];
  approval?: MerchantCommercialProjectionCandidateV1["applicability"]["approval"];
  offsetState?: MerchantCommercialProjectionCandidateV1["offsets"]["state"];
  currentAmountState?: MerchantCommercialProjectionCandidateV1["current"]["amountState"];
};

function candidate(patch: CandidatePatch = {}): MerchantCommercialProjectionCandidateV1 {
  const finding = patch.finding ?? exactFinding(5_000);
  return {
    candidateId: patch.candidateId ?? "candidate",
    presentationGroupId: patch.groupId ?? "provider:offer:scope",
    internalFinding: finding,
    current: {
      componentRef: "current:component",
      componentLabel: "Authorization pricing component",
      serviceIdentity: "authorization_service",
      economicLayer: "acquiring_commercial",
      unit: "per_authorization",
      billingBasis: "per_authorization",
      populationIdentity: "authorizations",
      channel: "card_present",
      amountState: patch.currentAmountState ?? "exact",
      amountMinor: finding.economics.currentAmountMinor,
      controlState: patch.controlState ?? "exact_provider_controlled",
      evidenceRefs: ["statement_component"],
    },
    alternative: {
      componentRef: "alternative:component",
      provider: "Published Provider",
      offer: "Published Offer",
      distributionIdentity: "published_provider:direct:published_offer",
      serviceIdentity: "authorization_service",
      economicLayer: "acquiring_commercial",
      unit: "per_authorization",
      billingBasis: "per_authorization",
      populationIdentity: "authorizations",
      channel: "card_present",
      amountState: "exact",
      amountMinor: finding.economics.alternativeAmountMinor,
      evidenceRefs: ["published_component"],
    },
    matchedPopulationCount: 5_000,
    matchedPopulationEvidenceRefs: ["statement_population"],
    revalidation: {
      currentComponent: "matched",
      alternativeComponent: "matched",
      population: "matched",
      economicLayer: "matched",
      serviceIdentity: "matched",
      unitBillingBasis: "matched",
      channel: "matched",
      statementPeriod: "matched",
      offerIdentity: "matched",
      decompositionControl: "matched",
    },
    componentClass: patch.componentClass ?? "variable",
    cadence: patch.cadence ?? "current_period_only",
    observedEventCount: patch.eventCount ?? 5_000,
    providerControlledCost: {
      state: patch.denominatorState ?? "exact",
      amountMinor: patch.providerCostMinor === undefined ? 50_000 : patch.providerCostMinor,
    },
    applicability: {
      publicPolicy: patch.publicPolicy ?? "no_known_public_block",
      approval: patch.approval ?? "approval_unknown",
    },
    offsets: { state: patch.offsetState ?? "complete_non_reversing", evidenceRefs: ["offer_scope"] },
    qualitativeDisplayReasonApproved: false,
  };
}

function exactFinding(differenceMinor: number): InternalCommercialComparisonFindingV1 {
  const current = 100_000;
  return buildInternalCommercialComparisonFindingV1({
    acceptedDiagnostic: diagnostic("conditional_scenario"),
    currentProvider: "Current Provider",
    statementFamily: "supported_fiserv",
    currentEvidenceRefs: ["statement_component"],
    matchedComparison: {
      componentLabel: "Authorization pricing component",
      economics: {
        currency: "USD",
        unitLabel: "per authorization",
        matchedPopulationCount: 5_000,
        currentUnitPriceMinor: null,
        alternativeUnitPriceMinor: null,
        currentAmount: { state: "EXACT", amountMinor: current },
        alternativeAmount: { state: "EXACT", amountMinor: current - differenceMinor },
      },
      currentComponentEvidenceRefs: ["statement_component"],
      alternativeComponentEvidenceRefs: ["published_component"],
      matchedPopulationEvidenceRefs: ["statement_population"],
    },
  });
}

function boundedFinding(currentUpperMinor: number, alternativeMinor: number): InternalCommercialComparisonFindingV1 {
  return buildInternalCommercialComparisonFindingV1({
    acceptedDiagnostic: diagnostic("bounded_component"),
    currentProvider: "Current Provider",
    statementFamily: "supported_fiserv",
    currentEvidenceRefs: ["statement_component"],
    matchedComparison: {
      componentLabel: "Authorization pricing component",
      economics: {
        currency: "USD",
        unitLabel: "matched component",
        matchedPopulationCount: null,
        currentUnitPriceMinor: null,
        alternativeUnitPriceMinor: null,
        currentAmount: { state: "UPPER_BOUND", amountMinor: currentUpperMinor },
        alternativeAmount: { state: "EXACT", amountMinor: alternativeMinor },
      },
      currentComponentEvidenceRefs: ["statement_component"],
      alternativeComponentEvidenceRefs: ["published_component"],
      matchedPopulationEvidenceRefs: ["statement_population"],
    },
  });
}

function nonComparisonFinding(kind: "qualification" | "commercial_fact" | "blocker"): InternalCommercialComparisonFindingV1 {
  const d = diagnostic(kind === "blocker" ? "unavailable" : "conditional_scenario");
  if (kind === "qualification") d.economicLayer = "offer qualification";
  if (kind === "commercial_fact") {
    d.economicLayer = "commercial fact identity evidence";
    d.gateStates.merchantApproval = "not_required";
    d.gateStates.eligibility = "not_required";
  }
  if (kind === "blocker") {
    d.gateStates.population = "mismatch";
    d.refusalReasons = ["The billed activity does not match."];
    d.smallestUnlocker = "A matching activity population.";
  }
  return buildInternalCommercialComparisonFindingV1({
    acceptedDiagnostic: d,
    currentProvider: "Current Provider",
    statementFamily: "supported_fiserv",
    currentEvidenceRefs: ["statement_component"],
  });
}

function diagnostic(strength: AcceptedComparatorDiagnosticV1["comparisonStrength"]): AcceptedComparatorDiagnosticV1 {
  return {
    caseId: `case:${strength}`,
    providerIdentity: "Published Provider",
    offerIdentity: "Published Offer",
    salesChannel: "direct",
    merchantChannel: "card_present",
    matchedPopulation: "authorizations",
    economicLayer: "acquiring commercial component",
    sourceApplicableWhen: "current",
    merchantEligibilityStatus: "no_known_public_block_approval_unknown",
    commercialFactState: "KNOWN",
    decompositionStrength: strength === "bounded_component" ? "provider-controlled upper bound" : "exact provider-controlled component",
    comparisonStrength: strength,
    allowedClaim: strength === "unavailable" ? "A reliable comparison is unavailable." : "Compare only the matched component.",
    refusedClaims: ["Complete provider economics."],
    refusalReasons: strength === "unavailable" ? ["A required comparison fact is missing."] : ["Only one component is in scope."],
    smallestUnlocker: strength === "unavailable" ? "The missing comparison fact." : null,
    sourceObservationRefs: ["published_source"],
    componentVersionRefs: ["published_component"],
    gateStates: {
      offerIdentity: "matched",
      merchantChannel: "matched",
      population: "matched",
      eligibility: "matched",
      merchantApproval: "conditional",
      requestedScope: "matched",
      sourcePeriod: "matched",
    },
    claimPermissions: {
      customerFacingComparatorOutputAllowed: false,
      reusableKnowledgeAdmissionAllowed: false,
      canonicalMutationAllowed: false,
      overpaymentOrMarketGradeAllowed: false,
      preciseSavingsClaimAllowed: false,
      switchingRecommendationAllowed: false,
    },
  };
}
