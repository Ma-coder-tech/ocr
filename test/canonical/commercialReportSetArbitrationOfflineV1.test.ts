import { describe, expect, it } from "vitest";
import {
  buildCommercialReportSetOfflineIntegrationV1,
  validateCommercialReportSetMerchantCopyV1,
  type CommercialReportCandidateContextV1,
} from "../../src/canonical/commercialReportSetArbitrationOfflineV1.js";
import {
  MERCHANT_COMMERCIAL_FINDING_PERMISSION_PROJECTION_V1,
  MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1,
  type MerchantCommercialFindingDecisionV1,
  type MerchantCommercialFindingShadowProjectionV1,
  type MerchantSafeCommercialFindingV1,
} from "../../src/canonical/merchantCommercialFindingPermissionProjectionV1.js";
import { buildProductionReportProjection } from "../../src/canonical/productionReportProjection.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { package3Analysis } from "./package3TestFixture.js";

describe("Commercial Report-Set Arbitration & Offline Integration v1", () => {
  it("maps existing findings by Product meaning instead of treating the legacy three-level priority as equivalent", () => {
    const base = completedProjection();
    const source = buildProductionReportProjection(package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]));
    const integrity = structuredClone(source.report!.priorityFindings.items[0]!);
    integrity.priority = "routine";
    integrity.merchantTitle = "Fee reconciliation failure needs review";
    integrity.whyDeservesAttention = "The fee total does not reconcile to the supported rows.";
    base.report!.priorityFindings = { heading: "What deserves attention", status: "shown", items: [integrity] };
    const result = buildCommercialReportSetOfflineIntegrationV1({
      productionProjection: base,
      commercialShadowProjection: shadow([decision("commercial-review", { action: "review" })]),
      candidateContexts: [context("commercial-review")],
    });
    expect(result.existingAttentionLedger[0]).toMatchObject({ id: integrity.id, productPriority: 1 });
    expect(result.selectionLedger[0]?.disposition).toBe("suppressed_by_higher_priority_risk");
  });

  it("suppresses a commercial pricing review below a Priority-1 financial-integrity issue", () => {
    const result = run([decision("review", { action: "review" })], {
      existingRisk: { financialIntegrityActive: true },
    });
    expect(result.commercialPlacement.priorityFindings).toEqual([]);
    expect(result.commercialPlacement.actionToolkit).toEqual([]);
    expect(result.selectionLedger[0]).toMatchObject({ disposition: "suppressed_by_higher_priority_risk", productPriority: 3 });
  });

  it("holds an invalidated review and elevates its unresolved VERIFY, but leaves a nonblocking VERIFY below a safe review", () => {
    const decisions = [
      decision("review-a", { action: "review" }),
      decision("verify-a", { mode: "verify" }),
      decision("review-b", { action: "review", component: "Monthly service pricing" }),
      decision("verify-b", { mode: "verify", component: "Account approval" }),
    ];
    const result = run(decisions, {
      contexts: decisions.map((item) => context(item.candidateId, {
        component: item.customerSafeRecord!.component,
        verifyImpact: item.candidateId === "verify-a" ? "invalidates_or_materially_changes_review" : "normal",
      })),
      dependencies: [
        { verifyCandidateId: "verify-a", reviewCandidateId: "review-a", unresolved: true, effect: "invalidates_or_materially_changes" },
        { verifyCandidateId: "verify-b", reviewCandidateId: "review-b", unresolved: true, effect: "nonblocking" },
      ],
    });
    expect(result.selectionLedger.find((item) => item.candidateId === "review-a")).toMatchObject({ disposition: "held_by_verify_dependency", linkedVerifyCandidateId: "verify-a" });
    expect(result.selectionLedger.find((item) => item.candidateId === "verify-a")?.productPriority).toBe(2);
    expect(result.selectionLedger.find((item) => item.candidateId === "review-b")?.disposition).toBe("displayed");
    expect(result.commercialPlacement.priorityFindings).toHaveLength(1);
  });

  it("keeps a commercial-only VERIFY in Questions without changing an analysis-completed experience or hero", () => {
    const base = completedProjection();
    const beforeHero = JSON.stringify(base.report!.hero);
    const beforeProjection = JSON.stringify(base);
    const result = buildCommercialReportSetOfflineIntegrationV1({
      productionProjection: base,
      commercialShadowProjection: shadow([decision("verify", { mode: "verify" })]),
      candidateContexts: [context("verify", { verifyImpact: "normal" })],
    });
    expect(result.integratedReportCandidate.experience).toBe("analysis_completed");
    expect(result.integratedReportCandidate.report!.openQuestions.items).toHaveLength(1);
    expect(JSON.stringify(result.integratedReportCandidate.report!.hero)).toBe(beforeHero);
    expect(JSON.stringify(base)).toBe(beforeProjection);
    expect(result.heroByteEquivalent).toBe(true);
  });

  it("shows no commercial content when canonical analysis is unable to complete", () => {
    const base = unableProjection();
    const result = buildCommercialReportSetOfflineIntegrationV1({
      productionProjection: base,
      commercialShadowProjection: shadow([decision("review", { action: "review" })]),
    });
    expect(result.integratedReportCandidate.report).toBeNull();
    expect(result.commercialPlacement).toMatchObject({ priorityFindings: [], questionsToResolve: [], actionToolkit: [] });
    expect(result.selectionLedger[0]?.disposition).toBe("withheld_in_unable_experience");
  });

  it("keeps the exact component difference beside its scope and gives EXPLAIN no primary CTA", () => {
    const result = run([
      decision("review", { action: "review", differenceMinor: 4_800 }),
      decision("explain", { mode: "explain", direction: "current_less", component: "Gateway transaction pricing" }),
    ]);
    const review = result.commercialPlacement.priorityFindings[0]!;
    expect(review.whatThisLikelyMeans).toContain("$48.00");
    expect(review.whatThisLikelyMeans).toContain("statement's matched activity");
    expect(result.commercialPlacement.actionToolkit.some((item) => item.title.includes("Gateway transaction"))).toBe(false);
  });

  it("promotes only a fully evidenced conditional stoppable charge to VERIFY", () => {
    const complete = decision("pci", { mode: "explain", component: "PCI non-compliance charge" });
    const incomplete = decision("other", { mode: "explain", component: "Application charge" });
    const result = run([complete, incomplete], {
      conditionalCharges: [
        {
          candidateId: "pci",
          acceptedEvidenceEstablishesConditionalCharge: true,
          concreteMerchantVerifiableCondition: "the account being out of PCI compliance",
          resolvingCouldStopOrPreventCharge: true,
          whoCanConfirm: "your provider's compliance team",
          exactAnswerOrDocument: "the current PCI compliance status and effective date",
          conclusionMayChange: "whether future incidence of this charge may stop",
        },
        {
          candidateId: "other",
          acceptedEvidenceEstablishesConditionalCharge: true,
          concreteMerchantVerifiableCondition: null,
          resolvingCouldStopOrPreventCharge: true,
          whoCanConfirm: null,
          exactAnswerOrDocument: null,
          conclusionMayChange: null,
        },
      ],
    });
    expect(result.commercialPlacement.questionsToResolve).toHaveLength(1);
    expect(result.commercialPlacement.questionsToResolve[0]?.question).toContain("PCI compliance");
    expect(result.commercialPlacement.supportingDetails.some((item) => item.summary.includes("Application"))).toBe(true);
    expect(JSON.stringify([
      ...result.commercialPlacement.questionsToResolve.flatMap((item) => [item.question, item.whatRateRevealKnows, item.whatRemainsUncertain, item.safeNextStep]),
      ...result.commercialPlacement.supportingDetails.flatMap((item) => [item.title, item.summary, item.scope]),
    ])).not.toMatch(/removable|savings/i);
  });

  it("demotes an overlapping chargeback-fee review beneath material dispute risk", () => {
    const result = run([decision("chargeback", { action: "review", component: "Chargeback fee" })], {
      existingRisk: { disputeRiskLinks: [{ commercialCandidateId: "chargeback", existingFindingId: "dispute-risk" }] },
    });
    expect(result.commercialPlacement.priorityFindings).toEqual([]);
    expect(result.commercialPlacement.supportingDetails).toHaveLength(1);
    expect(result.selectionLedger[0]).toMatchObject({ disposition: "demoted", productPriority: 5 });
  });

  it("shows the three most consequential VERIFY items and retains the fourth internally without a tally", () => {
    const decisions = [1, 2, 3, 4].map((number) => decision(`verify-${number}`, { mode: "verify", differenceMinor: number * 1_000 }));
    const result = run(decisions, { contexts: decisions.map((item, index) => context(item.candidateId, {
      verifyImpact: "normal",
      component: `Commercial fact ${index + 1}`,
      alternativePricing: `fact-${index + 1}`,
    })) });
    expect(result.commercialPlacement.questionsToResolve).toHaveLength(3);
    expect(result.selectionLedger.filter((item) => item.disposition === "omitted_by_verify_cap")).toHaveLength(1);
    expect(JSON.stringify(result.commercialPlacement)).not.toMatch(/(?:fourth|omitted|\d+ (?:questions|blockers|opportunities))/i);
  });

  it("does not consolidate differently priced card programs and uses the weakest strength for a compatible group", () => {
    const visa = decision("visa", { action: "review", component: "Authorization pricing" });
    const amex = decision("amex", { action: "review", component: "Authorization pricing" });
    const mc = decision("mc", { action: "review", component: "Authorization pricing" });
    const result = run([visa, amex, mc], {
      contexts: [
        context("visa", { program: "visa_mc_discover", alternativePricing: "10-cents", strength: "high" }),
        context("amex", { program: "amex", alternativePricing: "15-cents", strength: "high" }),
        context("mc", { program: "visa_mc_discover", alternativePricing: "10-cents", strength: "medium" }),
      ],
    });
    expect(result.commercialPlacement.priorityFindings).toHaveLength(2);
    expect(result.selectionLedger.filter((item) => item.disposition === "consolidated")).toHaveLength(1);
    const combined = result.commercialPlacement.priorityFindings.find((item) => item.evidenceStatus === "Supported with limitations");
    expect(combined?.confidence).toBe("medium");
  });

  it("does not treat matching unknown scope fields as proof that rows may consolidate", () => {
    const result = buildCommercialReportSetOfflineIntegrationV1({
      productionProjection: completedProjection(),
      commercialShadowProjection: shadow([
        decision("unknown-a", { action: "review" }),
        decision("unknown-b", { action: "review" }),
      ]),
    });
    expect(result.commercialPlacement.priorityFindings).toHaveLength(2);
    expect(result.selectionLedger.every((item) => item.disposition === "displayed")).toBe(true);
  });

  it("keeps same-offer counterevidence visible after selection", () => {
    const counter = decision("current-less", { mode: "explain", direction: "current_less", component: "Monthly pricing" });
    counter.visibility.permitted = false;
    const result = run([
      decision("current-more", { action: "review", direction: "current_more" }),
      counter,
    ], {
      contexts: [
        context("current-more", { scope: "offer-scope", offer: "Provider A:Offer A" }),
        context("current-less", { scope: "offer-scope", offer: "Provider A:Offer A", component: "Monthly pricing" }),
      ],
    });
    expect(result.commercialPlacement.priorityFindings).toHaveLength(1);
    expect(result.commercialPlacement.supportingDetails).toHaveLength(1);
    expect(result.validation.directionalFairnessSafe).toBe(true);
  });

  it("anchors named comparisons to one offer and renders another offer generically", () => {
    const dharma = decision("dharma", { action: "review", provider: "Dharma", offer: "Retail" });
    const helcim = decision("helcim", { action: "review", provider: "Helcim", offer: "Interchange Plus", component: "Monthly service pricing" });
    const result = run([dharma, helcim], {
      contexts: [
        context("dharma", { offer: "Dharma:Retail" }),
        context("helcim", { offer: "Helcim:Interchange Plus", component: "Monthly service pricing" }),
      ],
    });
    const copy = JSON.stringify(result.commercialPlacement);
    expect((copy.match(/Dharma/g) ?? []).length).toBeGreaterThan(0);
    expect(copy).not.toContain("Helcim");
    expect(copy).toContain("cannot be combined");
    expect(result.validation.namedOfferCoherent).toBe(true);
  });

  it("is deterministic across input ordering", () => {
    const decisions = [decision("b", { mode: "verify" }), decision("a", { action: "review" }), decision("c", { mode: "explain" })];
    const contexts = decisions.map((item) => context(item.candidateId));
    const one = run(decisions, { contexts });
    const two = run([...decisions].reverse(), { contexts: [...contexts].reverse() });
    expect(one.integratedReportCandidate).toEqual(two.integratedReportCandidate);
    expect(one.selectionLedger).toEqual(two.selectionLedger);
  });

  it("uses the neutral report limitation and passes merchant-copy/cumulative checks", () => {
    const unavailable = decision("blocked", { mode: "unavailable" });
    const result = run([unavailable]);
    expect(result.commercialPlacement.methodologyLimitations).toEqual([
      "Public-price comparison was limited for this statement. Where RateReveal could not make a reliable comparison, that does not mean the pricing is good or bad.",
    ]);
    expect(result.validation).toMatchObject({ valid: true, cumulativeClaimSafe: true, customerCopySafe: true });
    expect(validateCommercialReportSetMerchantCopyV1(result.integratedReportCandidate)).toEqual([]);
    expect(JSON.stringify(result.commercialPlacement)).not.toMatch(/\b\d+\s+(?:pricing issues|opportunities|comparisons|blockers)\b/i);
  });

  it("fails closed when individually supplied copy creates a prohibited cumulative claim", () => {
    const unsafe = decision("unsafe", { action: "review" });
    unsafe.customerSafeRecord!.summary = "This is savings across your provider relationship.";
    const result = run([unsafe]);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContain("prohibited_outcome_language");
    expect(result.commercialPlacement.priorityFindings).toEqual([]);
    expect(result.selectionLedger[0]?.disposition).toBe("withheld_by_cumulative_claim_validator");
  });

  it("requires affirmative independence before showing commercial content beside canonical open questions", () => {
    const base = buildProductionReportProjection(package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]));
    expect(base.experience).toBe("analysis_available_with_open_questions");
    const hidden = buildCommercialReportSetOfflineIntegrationV1({
      productionProjection: base,
      commercialShadowProjection: shadow([decision("review", { action: "review" })]),
    });
    const shown = buildCommercialReportSetOfflineIntegrationV1({
      productionProjection: base,
      commercialShadowProjection: shadow([decision("review", { action: "review" })]),
      candidateContexts: [context("review", { independentlySafe: true })],
    });
    expect(hidden.commercialPlacement.priorityFindings).toEqual([]);
    expect(shown.commercialPlacement.priorityFindings).toHaveLength(1);
    expect(shown.integratedReportCandidate.experience).toBe(base.experience);
  });
});

type DecisionPatch = {
  action?: "review";
  mode?: "explain" | "verify" | "unavailable";
  direction?: "current_more" | "current_less";
  component?: string;
  provider?: string;
  offer?: string;
  differenceMinor?: number;
};

function decision(id: string, patch: DecisionPatch = {}): MerchantCommercialFindingDecisionV1 {
  const mode = patch.action ? "comparison" : patch.mode === "unavailable" ? "comparison_unavailable" : patch.mode ?? "explain";
  const recordAction = patch.action ? "REVIEW_CURRENT_PRICING" : mode === "verify" || mode === "comparison_unavailable" ? "VERIFY" : "EXPLAIN";
  const component = patch.component ?? "Authorization pricing";
  const provider = patch.provider ?? "Provider A";
  const offer = patch.offer ?? "Offer A";
  const difference = patch.differenceMinor ?? 4_800;
  const direction = patch.direction ?? "current_more";
  return {
    candidateId: id,
    presentationGroupId: `${provider}:${offer}:scope`,
    findingValidity: "valid",
    comparisonValidity: mode === "comparison_unavailable" ? "unavailable" : mode === "comparison" || patch.direction ? "valid_exact" : "not_a_comparison",
    visibility: { permitted: true, mode },
    action: { permitted: patch.action === "review", type: patch.action ? "REVIEW_CURRENT_PRICING" : "NONE" },
    materiality: {
      state: patch.action ? "review_threshold_met" : mode === "comparison_unavailable" ? "cannot_evaluate" : "explain_only",
      absoluteDifferenceMinor: difference,
      relativeBasisPoints: 800,
    },
    direction: direction === "current_more" ? "current_costs_more" : "current_costs_less",
    namedAlternativePermitted: mode !== "comparison_unavailable",
    internalSignalIgnored: true,
    reasonCodes: [],
    evidenceRefs: ["statement", "published"],
    customerSafeRecord: record({ mode, action: recordAction, component, provider, offer, difference, direction }),
  };
}

function record(input: {
  mode: MerchantSafeCommercialFindingV1["displayMode"];
  action: MerchantSafeCommercialFindingV1["merchantAction"]["type"];
  component: string;
  provider: string;
  offer: string;
  difference: number;
  direction: "current_more" | "current_less";
}): MerchantSafeCommercialFindingV1 {
  const unavailable = input.mode === "comparison_unavailable";
  const comparison = input.mode === "comparison" || input.direction === "current_less";
  return {
    displayMode: input.mode,
    title: unavailable ? "A reliable component comparison is not available" : input.action === "VERIFY" ? "A business condition needs confirmation" : "Comparable component information",
    summary: unavailable
      ? `RateReveal identified a possible comparison involving ${input.component}, but the required activity is not established.`
      : `The statement establishes ${input.component}. A comparable ${input.provider} ${input.offer} public offer lists the same component.`,
    component: input.component,
    alternative: unavailable ? null : { provider: input.provider, offer: input.offer },
    matchedActivity: comparison ? "authorizations on this statement" : null,
    comparableComponentDifference: comparison ? { amountMinor: input.difference, currency: "USD", direction: input.direction } : null,
    comparisonBlocker: unavailable ? "The exact billing population is not established." : null,
    smallestUnlocker: unavailable ? "The exact billing population from the provider." : null,
    conditions: [],
    scopeNote: unavailable ? "This does not mean the current pricing is good or bad." : "This applies only to the component and activity shown for this statement.",
    merchantAction: { type: input.action, text: input.action === "REVIEW_CURRENT_PRICING" ? "Ask the current provider to review this component." : input.action === "VERIFY" ? "Confirm the missing fact." : "Use this information as context." },
  };
}

function context(id: string, patch: {
  component?: string;
  program?: string;
  alternativePricing?: string;
  strength?: CommercialReportCandidateContextV1["evidenceStrength"];
  scope?: string;
  offer?: string;
  verifyImpact?: NonNullable<CommercialReportCandidateContextV1["verify"]>["impact"];
  independentlySafe?: boolean;
} = {}): CommercialReportCandidateContextV1 {
  return {
    candidateId: id,
    economicComponent: patch.component ?? "Authorization pricing",
    providerPricingLogic: "provider-controlled per authorization",
    population: "authorizations",
    channel: "card_present",
    cardProgramTreatment: patch.program ?? "all_supported_cards",
    alternativePricingIdentity: patch.alternativePricing ?? "10-cents",
    commercialScope: patch.scope ?? "authorization-scope",
    alternativeOfferIdentity: patch.offer ?? "Provider A:Offer A",
    evidenceStrength: patch.strength ?? "high",
    independentlySafeFromCanonicalOpenQuestions: patch.independentlySafe ?? true,
    ...(patch.verifyImpact ? {
      verify: {
        impact: patch.verifyImpact,
        missingFact: "Confirm the exact billing population.",
        whyItMatters: "The population determines whether the comparison applies.",
        whoCanConfirm: "your current provider",
        exactAnswerOrDocument: "the statement-period billing population",
        conclusionMayChange: "whether the component comparison is reliable",
      },
    } : {}),
  };
}

function shadow(decisions: MerchantCommercialFindingDecisionV1[]): MerchantCommercialFindingShadowProjectionV1 {
  return {
    projectionVersion: MERCHANT_COMMERCIAL_FINDING_PERMISSION_PROJECTION_V1,
    productAuthority: MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1,
    mode: "shadow_offline",
    realCustomerRoutingAllowed: false,
    decisions,
    customerSafeProjection: {
      findings: decisions.flatMap((item) => item.customerSafeRecord ? [item.customerSafeRecord] : []),
      reportLimitation: decisions.some((item) => item.visibility.mode === "comparison_unavailable")
        ? "Public-price comparison was limited for this statement. Where RateReveal could not make a reliable comparison, that does not mean the pricing is good or bad."
        : null,
    },
    permissions: {
      customerReportRoutingAllowed: false,
      marketVerdictAllowed: false,
      gradeAllowed: false,
      overpaymentAllowed: false,
      savingsAllowed: false,
      annualizationAllowed: false,
      switchingAllowed: false,
      providerRankingAllowed: false,
      canonicalMutationAllowed: false,
      sourceMutationAllowed: false,
      aiOrWebResearchAllowed: false,
      newKnowledgeAdmissionAllowed: false,
    },
  };
}

function completedProjection() {
  const analysis = completedAnalysis();
  return buildProductionReportProjection(analysis);
}

function completedAnalysis(): CanonicalStatementAnalysis {
  const analysis = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 80 }]);
  for (const item of analysis.merchantAttention.items) {
    item.surfaceEligibility.priorityFinding = false;
    item.surfaceEligibility.actionToolkit = false;
    item.questionToResolve = null;
    item.actionToolkit = null;
    item.inventoryDisposition = "routine_context";
  }
  analysis.customerState.axes.analysisReadiness = "verified";
  analysis.customerState.axes.dataIntegrity = "reconciled";
  analysis.customerState.axes.opportunityPosture = "none";
  analysis.customerState.primaryState = "verified_benchmark_unavailable";
  const action = analysis.customerState.permissions.find((item) => item.key === "actions")!;
  action.permitted = false;
  analysis.customerState.visibility.showActions = false;
  const verification = analysis.customerState.permissions.find((item) => item.key === "verification_amounts")!;
  verification.permitted = false;
  analysis.customerState.visibility.showVerificationAmounts = false;
  return analysis;
}

function unableProjection() {
  const analysis = completedAnalysis();
  analysis.customerState.primaryState = "unable_to_analyze";
  analysis.customerState.axes.analysisReadiness = "unavailable";
  return buildProductionReportProjection(analysis);
}

function run(decisions: MerchantCommercialFindingDecisionV1[], options: {
  contexts?: CommercialReportCandidateContextV1[];
  dependencies?: Parameters<typeof buildCommercialReportSetOfflineIntegrationV1>[0]["verifyDependencies"];
  conditionalCharges?: Parameters<typeof buildCommercialReportSetOfflineIntegrationV1>[0]["conditionalCharges"];
  existingRisk?: Parameters<typeof buildCommercialReportSetOfflineIntegrationV1>[0]["existingRisk"];
} = {}) {
  return buildCommercialReportSetOfflineIntegrationV1({
    productionProjection: completedProjection(),
    commercialShadowProjection: shadow(decisions),
    candidateContexts: options.contexts ?? decisions.map((item) => context(item.candidateId, { component: item.customerSafeRecord?.component })),
    verifyDependencies: options.dependencies,
    conditionalCharges: options.conditionalCharges,
    existingRisk: options.existingRisk,
  });
}
