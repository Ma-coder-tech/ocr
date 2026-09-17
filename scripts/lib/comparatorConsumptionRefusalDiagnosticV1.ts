import type { CommercialSourceGovernanceRegistryV1 } from "../../src/canonical/commercialSourceGovernanceV1.js";

export const COMPARATOR_CONSUMPTION_REFUSAL_DIAGNOSTIC_V1 =
  "comparator_consumption_refusal_diagnostic_2026_09_11_v1" as const;

export const COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01 = {
  document: "RateReveal Comparator Consumption / Refusal Diagnostic — Product Test Matrix v0.1",
  sha256: "e95d9901251f66d3959adb76b07adbc4c1ccecff67abe1799b2f82845a576b00",
} as const;

export type ComparisonStrengthV1 = "exact_component" | "bounded_component" | "conditional_scenario" | "unavailable";
export type CommercialFactStateV1 = "KNOWN" | "KNOWN_ABSENT" | "UNKNOWN";
export type GateStateV1 = "matched" | "conditional" | "unknown" | "mismatch" | "not_required";

export type ComparatorConsumptionDiagnosticCaseV1 = {
  caseId: string;
  providerIdentity: string;
  offerIdentity: string;
  salesChannel: string;
  merchantChannel: string;
  matchedPopulation: string;
  economicLayer: string;
  sourceApplicableWhen: "current" | "historical_period_matched" | "current_unknown_effective_from" | "period_bounded" | "historical_unavailable";
  merchantEligibilityStatus: string;
  commercialFactState: CommercialFactStateV1;
  decompositionStrength: string;
  comparisonStrength: ComparisonStrengthV1;
  disposition: string;
  gates: {
    offerIdentity: GateStateV1;
    merchantChannel: GateStateV1;
    population: GateStateV1;
    eligibility: GateStateV1;
    merchantApproval: GateStateV1;
    requestedScope: GateStateV1;
    sourcePeriod: GateStateV1;
  };
  sourceObservationRefs: string[];
  componentVersionRefs: string[];
  allowedClaim: string;
  refusedClaims: string[];
  refusalReasons: string[];
  smallestUnlocker: string | null;
  currentUpperBoundMinor?: number;
  candidateExactMinor?: number;
  allowCrossOfferEvidence?: boolean;
};

export type ComparatorConsumptionDiagnosticResultV1 = Omit<ComparatorConsumptionDiagnosticCaseV1, "gates"> & {
  diagnosticVersion: typeof COMPARATOR_CONSUMPTION_REFUSAL_DIAGNOSTIC_V1;
  productAuthority: typeof COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01;
  gateStates: ComparatorConsumptionDiagnosticCaseV1["gates"];
  evidenceBinding: {
    sourceObservationRefs: string[];
    componentVersionRefs: string[];
    allRefsGovernedOrProductControl: boolean;
  };
  directionalArithmetic: null | {
    currentRangeMinor: { low: number | null; high: number };
    candidateExactMinor: number;
    differenceRangeCurrentMinusCandidateMinor: { low: null; high: number };
    candidateExceedsCurrentByAtLeastMinor: number | null;
    preciseSavingsClaimAllowed: false;
  };
  claimPermissions: {
    scopedEvidenceUseAllowed: boolean;
    completeTotalCostClaimAllowed: boolean;
    merchantApprovalClaimAllowed: boolean;
    historicalAvailabilityClaimAllowed: boolean;
    negotiabilityOrRemovabilityClaimAllowed: false;
    overpaymentOrMarketGradeAllowed: false;
    preciseSavingsClaimAllowed: false;
    switchingRecommendationAllowed: false;
    customerFacingComparatorOutputAllowed: false;
    reusableKnowledgeAdmissionAllowed: false;
    canonicalMutationAllowed: false;
  };
};

export function evaluateComparatorConsumptionDiagnosticV1(input: {
  testCase: ComparatorConsumptionDiagnosticCaseV1;
  registries: CommercialSourceGovernanceRegistryV1[];
}): ComparatorConsumptionDiagnosticResultV1 {
  const c = input.testCase;
  const observations = input.registries.flatMap((registry) => registry.sourceObservations);
  const components = input.registries.flatMap((registry) => registry.priceComponentVersions);
  const missingObservations = c.sourceObservationRefs.filter((ref) => !observations.some((item) => item.observationId === ref));
  const missingComponents = c.componentVersionRefs.filter((ref) => !components.some((item) => item.componentVersionId === ref));
  if (missingObservations.length || missingComponents.length) {
    throw new Error(`${c.caseId}: missing governed evidence refs ${[...missingObservations, ...missingComponents].join(", ")}`);
  }
  for (const ref of c.componentVersionRefs) {
    const component = components.find((item) => item.componentVersionId === ref)!;
    if (component.admission.lifecycle !== "admitted" && !c.allowCrossOfferEvidence) {
      throw new Error(`${c.caseId}: candidate component ${ref} cannot drive governed consumption.`);
    }
  }
  const blockers = Object.entries(c.gates).filter(([, state]) => state === "unknown" || state === "mismatch");
  if (c.comparisonStrength === "unavailable" && blockers.length === 0 && c.commercialFactState !== "UNKNOWN") {
    throw new Error(`${c.caseId}: unavailable comparison has no explicit blocker.`);
  }
  if (c.comparisonStrength === "exact_component") {
    const incompatible = [c.gates.offerIdentity, c.gates.merchantChannel, c.gates.population, c.gates.sourcePeriod].some((state) => state === "unknown" || state === "mismatch");
    if (incompatible || c.commercialFactState === "UNKNOWN") throw new Error(`${c.caseId}: exact component use lacks exact scope.`);
  }
  if (c.comparisonStrength === "conditional_scenario") {
    const conditional = Object.values(c.gates).includes("conditional") || c.sourceApplicableWhen === "current_unknown_effective_from";
    if (!conditional) throw new Error(`${c.caseId}: conditional scenario has no visible condition.`);
  }
  if (c.comparisonStrength === "bounded_component" && !/bound|conditional/i.test(c.decompositionStrength)) {
    throw new Error(`${c.caseId}: bounded result lacks bounded decomposition.`);
  }
  if (c.smallestUnlocker === null && blockers.length > 0) throw new Error(`${c.caseId}: blocked case requires a smallest unlocker.`);

  const directionalArithmetic = c.currentUpperBoundMinor === undefined || c.candidateExactMinor === undefined
    ? null
    : {
        currentRangeMinor: { low: null, high: c.currentUpperBoundMinor },
        candidateExactMinor: c.candidateExactMinor,
        differenceRangeCurrentMinusCandidateMinor: { low: null, high: c.currentUpperBoundMinor - c.candidateExactMinor },
        candidateExceedsCurrentByAtLeastMinor: c.candidateExactMinor > c.currentUpperBoundMinor
          ? c.candidateExactMinor - c.currentUpperBoundMinor
          : null,
        preciseSavingsClaimAllowed: false as const,
      };
  const scopedEvidenceUseAllowed = c.comparisonStrength !== "unavailable" || c.allowedClaim.length > 0;
  return Object.freeze({
    ...c,
    diagnosticVersion: COMPARATOR_CONSUMPTION_REFUSAL_DIAGNOSTIC_V1,
    productAuthority: COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01,
    gateStates: c.gates,
    evidenceBinding: {
      sourceObservationRefs: [...c.sourceObservationRefs],
      componentVersionRefs: [...c.componentVersionRefs],
      allRefsGovernedOrProductControl: true,
    },
    directionalArithmetic,
    claimPermissions: {
      scopedEvidenceUseAllowed,
      completeTotalCostClaimAllowed: false,
      merchantApprovalClaimAllowed: c.gates.merchantApproval === "matched",
      historicalAvailabilityClaimAllowed: c.sourceApplicableWhen === "historical_period_matched" && c.gates.sourcePeriod === "matched",
      negotiabilityOrRemovabilityClaimAllowed: false,
      overpaymentOrMarketGradeAllowed: false,
      preciseSavingsClaimAllowed: false,
      switchingRecommendationAllowed: false,
      customerFacingComparatorOutputAllowed: false,
      reusableKnowledgeAdmissionAllowed: false,
      canonicalMutationAllowed: false,
    },
  });
}

const AN = {
  obs: "commercial_source_obs_authorize_net_direct_gateway_pricing_2026_09_10_v1",
  updater: "commercial_source_obs_authorize_net_account_updater_datasheet_2026_09_10_v1",
};
const H = { h1: "obs_helcim_h1_fee_disclosures_v1", h2: "obs_helcim_h2_public_pricing_v1", h3: "obs_helcim_h3_acceptable_use_v1", h4: "obs_helcim_h4_terms_v1" };
const D = { d1: "obs_dharma_d1_retail_v1", d2: "obs_dharma_d2_virtual_v1", d3: "obs_dharma_d3_high_volume_v1", d4: "obs_dharma_d4_supported_businesses_v1", d5: "obs_dharma_d5_closure_v1", d6: "obs_dharma_d6_pci_v1", dc: "obs_dharma_calculator_conflict_v1", d8: "obs_dharma_referral_isolation_v1" };

type CasePatch = Partial<Omit<ComparatorConsumptionDiagnosticCaseV1, "gates">> & { gates?: Partial<ComparatorConsumptionDiagnosticCaseV1["gates"]> };
function testCase(caseId: string, patch: CasePatch): ComparatorConsumptionDiagnosticCaseV1 {
  const base: ComparatorConsumptionDiagnosticCaseV1 = {
    caseId, providerIdentity: "product_matrix_synthetic_control", offerIdentity: "claim-specific comparison control", salesChannel: "not_applicable",
    merchantChannel: "scoped", matchedPopulation: "explicitly matched population", economicLayer: "claim_specific_component",
    sourceApplicableWhen: "current", merchantEligibilityStatus: "applicable_for_scoped_claim", commercialFactState: "KNOWN",
    decompositionStrength: "exact scoped component", comparisonStrength: "exact_component", disposition: "USE",
    gates: { offerIdentity: "matched", merchantChannel: "matched", population: "matched", eligibility: "matched", merchantApproval: "not_required", requestedScope: "matched", sourcePeriod: "matched" },
    sourceObservationRefs: [], componentVersionRefs: [], allowedClaim: "Use the exactly matched component only.",
    refusedClaims: ["Complete total-cost conclusion."], refusalReasons: ["Only the stated claim scope is established."], smallestUnlocker: null,
  };
  return { ...base, ...patch, caseId, gates: { ...base.gates, ...patch.gates } };
}

const conditional = { comparisonStrength: "conditional_scenario" as const, disposition: "USE_CONDITIONALLY", gates: { merchantApproval: "conditional" as const }, merchantEligibilityStatus: "merchant_approval_unknown" };
const unavailable = { comparisonStrength: "unavailable" as const, disposition: "REFUSE" };

export function comparatorConsumptionProductTestMatrixV01(): ComparatorConsumptionDiagnosticCaseV1[] {
  return [
    testCase("AN-01", { providerIdentity: "authorize_net", offerIdentity: "Gateway only", salesChannel: "direct", merchantChannel: "gateway", matchedPopulation: "gateway transaction events and settled batches", economicLayer: "gateway", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: [AN.obs], componentVersionRefs: ["commercial_component_authorize_net_gateway_monthly_v1", "commercial_component_authorize_net_gateway_transaction_v1", "commercial_component_authorize_net_gateway_batch_v1"], allowedClaim: "Apply the governed monthly gateway, gateway-event, and settled-batch charges to their matching populations.", refusedClaims: ["Complete merchant processing cost."], refusalReasons: ["The offer is gateway-only and excludes acquiring."], smallestUnlocker: null }),
    testCase("AN-02", { ...unavailable, providerIdentity: "authorize_net", offerIdentity: "Gateway only", salesChannel: "direct", merchantChannel: "gateway", matchedPopulation: "complete processing economics", economicLayer: "gateway plus acquiring", sourceApplicableWhen: "current_unknown_effective_from", commercialFactState: "UNKNOWN", decompositionStrength: "gateway exact; acquiring unknown", gates: { requestedScope: "unknown" }, sourceObservationRefs: [AN.obs], componentVersionRefs: ["commercial_component_authorize_net_acquiring_percentage_v1", "commercial_component_authorize_net_acquiring_per_item_v1"], allowedClaim: "Model the gateway portion only.", refusedClaims: ["Complete alternative-processing comparison.", "Zero acquiring cost."], refusalReasons: ["Acquiring percentage, per-item, interchange treatment, and chargeback pricing are not supplied."], smallestUnlocker: "A qualifying merchant-acquiring offer covering the missing layers." }),
    testCase("AN-03", { ...unavailable, providerIdentity: "authorize_net", offerIdentity: "Account Updater", salesChannel: "direct", merchantChannel: "card_on_file_ancillary", matchedPopulation: "successful account updates", economicLayer: "ancillary service", sourceApplicableWhen: "current_unknown_effective_from", decompositionStrength: "known unit price; unknown merchant population", gates: { population: "unknown" }, sourceObservationRefs: [AN.updater], componentVersionRefs: ["commercial_component_authorize_net_account_updater_v1"], allowedClaim: "Retain $0.25 per successful update as a conditional ancillary term.", refusedClaims: ["Exact Account Updater amount.", "Zero Account Updater cost."], refusalReasons: ["Successful update count and non-use are both unproved."], smallestUnlocker: "Successful Account Updater event count or evidence the service is not used." }),
    testCase("AN-04", { providerIdentity: "authorize_net", offerIdentity: "Gateway only", salesChannel: "direct", merchantChannel: "gateway", matchedPopulation: "gateway-side scoped field", economicLayer: "gateway", sourceApplicableWhen: "current_unknown_effective_from", commercialFactState: "KNOWN_ABSENT", decompositionStrength: "exact scoped absence", sourceObservationRefs: [AN.obs], componentVersionRefs: ["commercial_component_authorize_net_gateway_discount_rate_v1"], allowedClaim: "Use the explicit zero only inside the gateway scope.", refusedClaims: ["Zero acquiring cost.", "Zero merchant processing cost."], refusalReasons: ["Scoped gateway absence cannot cross into acquiring economics."], smallestUnlocker: "Merchant-account acquiring terms for an acquiring claim." }),

    testCase("H-01", { ...conditional, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "card_present", matchedPopulation: "card-present volume and transactions in the qualifying rolling-volume tier", economicLayer: "acquiring markup", sourceApplicableWhen: "period_bounded", sourceObservationRefs: [H.h1, H.h4], componentVersionRefs: ["component_helcim_t1_card_present_rate_v1", "component_helcim_t1_card_present_item_v1"], allowedClaim: "Apply the matching governed card-present tier components as a conditional public-price scenario.", refusedClaims: ["Merchant is approved by Helcim."], refusalReasons: ["Public price and channel facts do not establish underwriting approval."], smallestUnlocker: "Merchant-specific approval only for an approval claim." }),
    testCase("H-02", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "card_not_present", matchedPopulation: "card-not-present transactions", economicLayer: "acquiring markup", sourceApplicableWhen: "period_bounded", decompositionStrength: "channel mismatch", gates: { merchantChannel: "mismatch" }, sourceObservationRefs: [H.h1], componentVersionRefs: ["component_helcim_t1_card_present_rate_v1"], allowedClaim: "No card-present price may be applied to card-not-present activity.", refusedClaims: ["Substitution of cheaper CP price for CNP."], refusalReasons: ["The merchant channel and governed component channel differ."], smallestUnlocker: "Correct CNP population and applicable CNP terms." }),
    testCase("H-03", { ...conditional, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "mixed_cp_cnp", matchedPopulation: "separately known CP and CNP volume/count populations", economicLayer: "acquiring markup", sourceApplicableWhen: "period_bounded", sourceObservationRefs: [H.h1, H.h4], componentVersionRefs: ["component_helcim_t1_card_present_rate_v1", "component_helcim_t1_card_present_item_v1", "component_helcim_t1_card_not_present_rate_v1", "component_helcim_t1_card_not_present_item_v1"], allowedClaim: "Apply CP and CNP economics separately to their matched populations as a conditional scenario.", refusedClaims: ["One channel price across all merchant volume."], refusalReasons: ["Channel-specific components remain separate."], smallestUnlocker: null }),
    testCase("H-04", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "mixed_unknown_split", matchedPopulation: "CP versus CNP split", economicLayer: "acquiring markup", sourceApplicableWhen: "period_bounded", decompositionStrength: "known channel terms; unresolved merchant mix", gates: { merchantChannel: "unknown", population: "unknown" }, sourceObservationRefs: [H.h1], componentVersionRefs: ["component_helcim_t1_card_present_rate_v1", "component_helcim_t1_card_not_present_rate_v1"], allowedClaim: "State that both channel prices exist and the merchant mix is unresolved.", refusedClaims: ["Exact blended result.", "Invented 50/50 allocation."], refusalReasons: ["The channel population split is missing."], smallestUnlocker: "CP versus CNP volume and transaction split." }),
    testCase("H-05", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "known", matchedPopulation: "three-month rolling card-based processing average", economicLayer: "tier qualification", sourceApplicableWhen: "period_bounded", decompositionStrength: "tier input unresolved", gates: { population: "unknown" }, sourceObservationRefs: [H.h1], componentVersionRefs: ["component_helcim_t1_card_present_rate_v1"], allowedClaim: "Preserve candidate tiers as internal scenarios.", refusedClaims: ["Tier assignment from one statement headline volume."], refusalReasons: ["The printed month is not proved equivalent to the governed rolling population."], smallestUnlocker: "The qualifying volume used by the tier rule." }),
    testCase("H-06", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "known", matchedPopulation: "more than $5M monthly card volume", economicLayer: "custom acquiring price", sourceApplicableWhen: "current", commercialFactState: "UNKNOWN", decompositionStrength: "public numeric price unavailable", gates: { requestedScope: "unknown" }, sourceObservationRefs: [H.h2], componentVersionRefs: [], allowedClaim: "State that pricing above the public range requires a custom quote.", refusedClaims: ["Mathematical extension of the last public tier."], refusalReasons: ["No governed numeric public price applies above $5M."], smallestUnlocker: "Merchant-specific Helcim quote." }),
    testCase("H-07", { ...conditional, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "otherwise matched activity", economicLayer: "public processing offer", sourceApplicableWhen: "current", merchantEligibilityStatus: "review_required", gates: { eligibility: "conditional", merchantApproval: "conditional" }, sourceObservationRefs: [H.h3, H.h4], componentVersionRefs: [], allowedClaim: "Use public pricing only as a scenario subject to review and approval.", refusedClaims: ["Merchant approved.", "Merchant rejected."], refusalReasons: ["Review-required is neither approval nor prohibition."], smallestUnlocker: "Merchant-specific underwriting decision." }),
    testCase("H-08", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "merchant activity", economicLayer: "public processing offer", sourceApplicableWhen: "current", merchantEligibilityStatus: "publicly_prohibited", decompositionStrength: "offer inapplicable", gates: { eligibility: "mismatch" }, sourceObservationRefs: [H.h3], componentVersionRefs: [], allowedClaim: "Record that the governed Helcim offer is inapplicable to this merchant condition.", refusedClaims: ["Hypothetical savings using an unobtainable offer."], refusalReasons: ["The governed public prohibition blocks applicability."], smallestUnlocker: "A different applicable provider or offer, not another Helcim rate." }),
    testCase("H-09", { ...conditional, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "otherwise matched activity", economicLayer: "public processing offer", sourceApplicableWhen: "current", merchantEligibilityStatus: "no_known_public_block", sourceObservationRefs: [H.h3, H.h4], componentVersionRefs: [], allowedClaim: "State no known public block and calculate a conditional scenario if other rules pass.", refusedClaims: ["Merchant approved."], refusalReasons: ["Negative screening is not approval."], smallestUnlocker: "Merchant-specific approval for an approval claim." }),
    testCase("H-10", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "disputes", matchedPopulation: "chargeback cases split by won/lost outcome", economicLayer: "chargeback assessment and conditional refund", sourceApplicableWhen: "current_unknown_effective_from", decompositionStrength: "known gross fee; conditional net outcome", gates: { population: "unknown" }, sourceObservationRefs: [H.h2], componentVersionRefs: ["component_helcim_chargeback_gross_v1"], allowedClaim: "Model the gross chargeback fee or describe the conditional refund rule.", refusedClaims: ["Exact net chargeback cost.", "All cases permanently cost full fee or all are refunded."], refusalReasons: ["Winning and losing dispute populations are unknown."], smallestUnlocker: "Won versus lost dispute outcomes." }),
    testCase("H-11", { ...unavailable, providerIdentity: "helcim", offerIdentity: "Helcim U.S. direct public processing", salesChannel: "direct", merchantChannel: "recurring", matchedPopulation: "recurring-payment transaction volume", economicLayer: "recurring surcharge", sourceApplicableWhen: "current_unknown_effective_from", decompositionStrength: "known rate; unknown scoped volume", gates: { population: "unknown" }, sourceObservationRefs: [H.h2], componentVersionRefs: ["component_helcim_recurring_surcharge_v1"], allowedClaim: "Retain the recurring increment as a scoped term.", refusedClaims: ["Apply recurring increment to all CNP or all volume.", "Exact recurring amount."], refusalReasons: ["Recurring-payment population is unknown."], smallestUnlocker: "Recurring-payment volume." }),

    ...dharmaCases(),
    ...crossProviderCases(),
  ];
}

function dharmaCases(): ComparatorConsumptionDiagnosticCaseV1[] {
  const high = [D.d3, D.d4];
  return [
    testCase("D-01", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "Standard Retail / Storefront", salesChannel: "direct", merchantChannel: "card_present", matchedPopulation: "matching retail activity", economicLayer: "interchange-plus provider components", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: [D.d1], componentVersionRefs: ["component_dharma_retail_monthly_v1", "component_dharma_retail_vmd_margin_v1", "component_dharma_retail_vmd_auth_v1"], allowedClaim: "Apply Standard Retail components conditionally to matching activity.", refusedClaims: ["Use High Volume merely because its rate is lower."], refusalReasons: ["No High-Volume qualification branch is established."], smallestUnlocker: null }),
    testCase("D-02", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "Standard Virtual / Online", salesChannel: "direct", merchantChannel: "card_not_present", matchedPopulation: "matching online activity", economicLayer: "interchange-plus provider components", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: [D.d2], componentVersionRefs: ["component_dharma_virtual_monthly_v1", "component_dharma_virtual_vmd_margin_v1", "component_dharma_virtual_vmd_auth_v1"], allowedClaim: "Apply Virtual/Online components conditionally to matching online activity.", refusedClaims: ["Use Standard Retail CP pricing for online activity."], refusalReasons: ["Offer and merchant channels must match."], smallestUnlocker: null }),
    testCase("D-03", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "High Volume", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "monthly card sales over $100,000", economicLayer: "offer qualification", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: high, componentVersionRefs: [], allowedClaim: "The volume branch independently satisfies the governed OR qualification.", refusedClaims: ["Require the transaction-count branch too."], refusalReasons: ["The admitted predicate is disjunctive."], smallestUnlocker: null }),
    testCase("D-04", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "High Volume", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "more than 5,000 monthly transactions", economicLayer: "offer qualification", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: high, componentVersionRefs: [], allowedClaim: "The transaction-count branch independently satisfies the governed OR qualification.", refusedClaims: ["Reject High Volume because monthly dollars are below $100,000."], refusalReasons: ["The admitted predicate is disjunctive."], smallestUnlocker: null }),
    testCase("D-05", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "High Volume", salesChannel: "direct", merchantChannel: "restaurant", matchedPopulation: "qualifying restaurant activity with average ticket below $25", economicLayer: "offer qualification", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: high, componentVersionRefs: [], allowedClaim: "The low-ticket restaurant branch may qualify because the ticket is below both wordings.", refusedClaims: ["Expand low-ticket branch to unrelated businesses."], refusalReasons: ["The branch is merchant-type scoped."], smallestUnlocker: null }),
    testCase("D-06", { ...unavailable, providerIdentity: "dharma_merchant_services", offerIdentity: "High Volume", salesChannel: "direct", merchantChannel: "restaurant", matchedPopulation: "restaurant average ticket exactly $25", economicLayer: "offer qualification", sourceApplicableWhen: "current_unknown_effective_from", decompositionStrength: "unresolved qualification boundary", gates: { requestedScope: "unknown" }, sourceObservationRefs: [D.d3], componentVersionRefs: [], allowedClaim: "Record UNRESOLVED_QUALIFICATION_BOUNDARY.", refusedClaims: ["$25 qualifies.", "$25 does not qualify."], refusalReasons: ["First-party boundary wording conflicts and no other OR branch applies."], smallestUnlocker: "Authoritative clarification of the exact-$25 boundary." }),
    testCase("D-07", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "High Volume", salesChannel: "direct", merchantChannel: "restaurant", matchedPopulation: "6,000 monthly transactions", economicLayer: "offer qualification", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: high, componentVersionRefs: [], allowedClaim: "The transaction-count OR branch qualifies independently of the exact-$25 uncertainty.", refusedClaims: ["Let the unresolved ticket boundary block another satisfied branch."], refusalReasons: ["One satisfied OR branch is sufficient."], smallestUnlocker: null }),
    testCase("D-08", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "High Volume", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "otherwise matching activity", economicLayer: "offer eligibility", sourceApplicableWhen: "current_unknown_effective_from", merchantEligibilityStatus: "review_required", gates: { eligibility: "conditional", merchantApproval: "conditional" }, sourceObservationRefs: [D.d4], componentVersionRefs: [], allowedClaim: "Use the public offer only as a review-required conditional scenario.", refusedClaims: ["Automatic rejection.", "Confirmed approval."], refusalReasons: ["Review-required is not a final underwriting decision."], smallestUnlocker: "Merchant-specific underwriting decision." }),
    testCase("D-09", { providerIdentity: "dharma_merchant_services", offerIdentity: "Standard Retail / Storefront", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "ordinary account months versus non-compliant months", economicLayer: "PCI compliance and non-compliance", sourceApplicableWhen: "current_unknown_effective_from", commercialFactState: "KNOWN_ABSENT", decompositionStrength: "bounded by scoped absence plus conditional component", comparisonStrength: "bounded_component", disposition: "USE_SCOPED_ABSENCE", sourceObservationRefs: [D.d1, D.d6], componentVersionRefs: ["component_dharma_retail_pci_compliance_fee_absent_v1", "component_dharma_retail_pci_noncompliance_v1"], allowedClaim: "Keep ordinary PCI-compliance fee absence separate from conditional non-compliance charge.", refusedClaims: ["Dharma has no PCI-related charges."], refusalReasons: ["Merchant PCI status and conditional non-compliance applicability are unknown."], smallestUnlocker: "Merchant PCI-compliance status." }),
    testCase("D-10", { providerIdentity: "dharma_merchant_services", offerIdentity: "Standard Retail / Storefront", salesChannel: "direct", merchantChannel: "account_closure", matchedPopulation: "account closure events", economicLayer: "fixed administrative closure charge", sourceApplicableWhen: "current_unknown_effective_from", sourceObservationRefs: [D.d5], componentVersionRefs: ["component_dharma_retail_closure_v1"], allowedClaim: "Use the governed $49 amount as an account closure fee only.", refusedClaims: ["Classify closure fee as Early Termination Fee."], refusalReasons: ["The governed identities are distinct."], smallestUnlocker: null }),
    testCase("D-11", { ...unavailable, providerIdentity: "dharma_merchant_services", offerIdentity: "Standard Retail / Storefront", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "account months", economicLayer: "monthly plan fee", sourceApplicableWhen: "current_unknown_effective_from", decompositionStrength: "governed source conflict", gates: { requestedScope: "unknown" }, sourceObservationRefs: [D.d1, D.dc], componentVersionRefs: ["component_dharma_retail_monthly_v1", "candidate_dharma_calculator_retail_monthly_v1"], allowCrossOfferEvidence: true, allowedClaim: "Preserve the source conflict and use unaffected terms only.", refusedClaims: ["Pick the lower monthly value.", "Average conflicting values."], refusalReasons: ["Conflicting observations require governed precedence, not arithmetic reconciliation."], smallestUnlocker: "Product source precedence clarification or merchant-specific quote." }),
    testCase("D-12", { ...unavailable, providerIdentity: "dharma_merchant_services", offerIdentity: "Standard Retail / Storefront", salesChannel: "direct", merchantChannel: "matched", matchedPopulation: "2024 merchant activity", economicLayer: "historical alternative pricing", sourceApplicableWhen: "historical_unavailable", decompositionStrength: "current evidence only", gates: { sourcePeriod: "mismatch" }, sourceObservationRefs: [D.d1], componentVersionRefs: ["component_dharma_retail_monthly_v1"], allowedClaim: "Describe the terms only as current evidence where otherwise applicable.", refusedClaims: ["Claim today's pricing was available in 2024."], refusalReasons: ["Effective-from date is unknown and current capture cannot rewrite history."], smallestUnlocker: "Period-applicable historical Dharma evidence." }),
    testCase("D-13", { ...conditional, providerIdentity: "dharma_merchant_services", offerIdentity: "Direct or Teghkhuman referral—identity must be established", salesChannel: "direct_or_referral", merchantChannel: "matched", matchedPopulation: "offer-scoped merchant activity", economicLayer: "channel-specific commercial offer", sourceApplicableWhen: "current_unknown_effective_from", gates: { offerIdentity: "conditional" }, sourceObservationRefs: [D.d1, D.d8], componentVersionRefs: ["component_dharma_retail_monthly_v1"], allowCrossOfferEvidence: true, allowedClaim: "Compare only against the established direct or referral offer identity.", refusedClaims: ["Mix referral pricing into Dharma Direct.", "Universal Dharma price."], refusalReasons: ["Same brand does not collapse distinct sellers and channels."], smallestUnlocker: "Exact offer/channel the merchant is eligible to obtain." }),
  ];
}

function crossProviderCases(): ComparatorConsumptionDiagnosticCaseV1[] {
  const matrix = `${COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01.document}@sha256:${COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01.sha256}`;
  const p = (id: string, patch: CasePatch) => testCase(id, { ...patch, sourceObservationRefs: [], componentVersionRefs: [], refusalReasons: [...(patch.refusalReasons ?? []), `Synthetic boundary control only; authority=${matrix}.`] });
  return [
    p("X-01", { allowedClaim: "Compare the exact matched provider-controlled component on matching activity.", refusedClaims: ["Complete total-cost conclusion."], refusalReasons: ["One component does not establish all economic layers."], smallestUnlocker: "Missing total-cost layers only if a complete comparison is requested." }),
    p("X-02", { comparisonStrength: "bounded_component", disposition: "USE_BOUNDED", decompositionStrength: "provider-controlled upper bound", currentUpperBoundMinor: 50_000, candidateExactMinor: 35_000, allowedClaim: "Candidate component is $350; current comparable component has a $500 ceiling.", refusedClaims: ["$150 savings."], refusalReasons: ["Current actual cost may be below $350."], smallestUnlocker: "Exact current provider-controlled dollars." }),
    p("X-03", { comparisonStrength: "bounded_component", disposition: "USE_DIRECTIONAL_BOUND", decompositionStrength: "provider-controlled upper bound", currentUpperBoundMinor: 50_000, candidateExactMinor: 60_000, allowedClaim: "Candidate component exceeds even the current ceiling by at least $100 on matched scope.", refusedClaims: ["Complete provider-economics conclusion."], refusalReasons: ["Only one component is aligned."], smallestUnlocker: "Complete matched economics for a full-provider conclusion." }),
    p("X-04", { ...unavailable, merchantChannel: "sales_and_authorizations", matchedPopulation: "authorizations versus settled transactions", economicLayer: "per-item charges", decompositionStrength: "unit/population mismatch", gates: { population: "mismatch" }, allowedClaim: "Explain that the fees use different transaction populations.", refusedClaims: ["Use 1,000 or 1,250 as both fee populations."], refusalReasons: ["Authorization and settlement populations are not interchangeable."], smallestUnlocker: "Matching populations and precise billing bases." }),
    p("X-05", { decompositionStrength: "exact scoped component with other layers unresolved", allowedClaim: "Compare only the aligned service layer.", refusedClaims: ["Total savings.", "Complete alternative cost."], refusalReasons: ["Acquiring, gateway, ancillary, or bundled layers remain unresolved."], smallestUnlocker: "Missing aligned economic components." }),
    p("X-06", { ...unavailable, commercialFactState: "UNKNOWN", decompositionStrength: "unknown", gates: { requestedScope: "unknown" }, allowedClaim: "State that the value is unavailable.", refusedClaims: ["Convert UNKNOWN to zero, KNOWN_ABSENT, or market value."], refusalReasons: ["No evidence establishes value or absence."], smallestUnlocker: "Evidence establishing the value or explicit absence." }),
    p("X-07", { commercialFactState: "KNOWN_ABSENT", decompositionStrength: "exact scoped absence", allowedClaim: "Treat the exact scoped component as absent.", refusedClaims: ["Generalize absence to other offers, services, channels, or layers."], refusalReasons: ["Absence is claim- and scope-specific."], smallestUnlocker: null }),
    p("X-08", { ...conditional, allowedClaim: "If eligible and approved, apply published terms to matched activity.", refusedClaims: ["Merchant can get this price.", "Merchant approved."], refusalReasons: ["Public relevance does not establish merchant-specific availability."], smallestUnlocker: "Merchant-specific approval or quote." }),
    p("X-09", { ...unavailable, offerIdentity: "direct versus reseller/partner unresolved", salesChannel: "unknown", decompositionStrength: "offer identity mismatch", gates: { offerIdentity: "unknown" }, allowedClaim: "Require exact commercial channel and offer identity before comparison.", refusedClaims: ["Treat Direct, reseller, ISO, referral, and partner prices as interchangeable."], refusalReasons: ["Brand equality is not offer-identity equality."], smallestUnlocker: "Exact commercial channel and offer identity." }),
    p("X-10", { ...unavailable, sourceApplicableWhen: "historical_unavailable", decompositionStrength: "current alternative evidence only", gates: { sourcePeriod: "mismatch" }, allowedClaim: "Use current evidence only for a present-day conditional scenario.", refusedClaims: ["Claim today's offer existed in the historical statement period."], refusalReasons: ["Current evidence is not period-matched historical evidence."], smallestUnlocker: "Historical period-applicable source." }),
  ];
}
