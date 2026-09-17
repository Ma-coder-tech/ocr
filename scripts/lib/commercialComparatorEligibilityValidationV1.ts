export const COMMERCIAL_COMPARATOR_ELIGIBILITY_VALIDATION_V1 =
  "commercial_comparator_eligibility_validation_2026_09_10_v1" as const;

export type ComparatorEligibilityStatusV1 =
  | "publicly_prohibited"
  | "restricted_additional_underwriting"
  | "not_publicly_disqualified"
  | "confirmed_available"
  | "not_evaluated";

export type ComparatorSourceLaneV1 =
  | "current_public_offer"
  | "merchant_specific_quote"
  | "public_contract"
  | "gateway_only"
  | "indicative_pricing"
  | "company_yield"
  | "wholesale_buy_rate"
  | "retired_v1_v7_band";

export type ComparatorClaimScopeV1 =
  | "public_offer_cost_scenario"
  | "provider_component_price"
  | "complete_total_cost"
  | "payment_only_total_cost"
  | "fixed_fee_existence"
  | "public_contract_price";

export type ComparatorCompatibilityV1 = "match" | "normalizable_complete" | "mismatch" | "unknown";
export type ComparatorDecompositionPermissionV1 =
  | "exact_provider_controlled_dollars"
  | "provider_upper_bound_only"
  | "shared_or_unresolved"
  | "complete_total_cost"
  | "fee_existence_only";

export type ComparatorCalculationV1 =
  | {
      kind: "linear_component";
      volumeMinor: number;
      eventCount: number;
      currentAmountMinor: number | null;
      adValoremBps: number;
      perEventMinor: number;
      monthlyMinor: number;
    }
  | {
      kind: "mixed_channel_linear";
      cardPresentVolumeMinor: number;
      cardPresentCount: number;
      cardNotPresentVolumeMinor: number;
      cardNotPresentCount: number;
      unknownVolumeMinor: number;
      unknownCount: number;
      cardPresentBps: number;
      cardPresentPerEventMinor: number;
      cardNotPresentBps: number;
      cardNotPresentPerEventMinor: number;
      monthlyMinor: number;
      currentAmountMinor: number | null;
    }
  | { kind: "fixed_fee"; comparatorAmountMinor: number; currentAmountMinor: number | null }
  | { kind: "complete_total_cost"; comparatorAmountMinor: number; currentAmountMinor: number };

export type CommercialComparatorDiagnosticCaseV1 = {
  caseId: string;
  fixtureKind: "gold_replay" | "synthetic_boundary";
  syntheticAuthority: "none" | null;
  merchantContextFacts: {
    statementFile: string | null;
    businessType: string | null;
    riskContext: string | null;
    volumeMinor: number | null;
    transactionCount: number | null;
    averageTicketMinor: number | null;
    channel: string | null;
    partnerSoldClover: boolean | null;
  };
  comparator: {
    provider: string;
    offer: string;
    sourceLane: ComparatorSourceLaneV1;
    sourceRef: string;
    sourceCurrent: boolean;
    sourceCompleteness: "complete_for_claim" | "incomplete" | "approximate_starting_price";
    reusableKnowledgeAuthority: false;
  };
  eligibilityStatus: ComparatorEligibilityStatusV1;
  merchantSpecificApprovalKnown: boolean;
  offerQualification: CommercialComparatorDiagnosticCaseV1["offerQualification"];
  offerQualification: "qualified" | "not_qualified" | "additional_underwriting" | "not_evaluated";
  claimScope: ComparatorClaimScopeV1;
  pricingModelCompatibility: ComparatorCompatibilityV1;
  populationCompatibility: ComparatorCompatibilityV1;
  channelCompatibility: ComparatorCompatibilityV1;
  serviceScope: "matched" | "fee_scope_matched" | "material_unpriced_difference" | "unknown";
  serviceScopeDifferences: string[];
  decompositionPermission: ComparatorDecompositionPermissionV1;
  calculation: ComparatorCalculationV1 | null;
  publicContractDirectComparabilityEstablished: boolean;
  periodUse: "exact_month" | "persistent_or_annualized";
  periodRepresentative: boolean | null;
};

export type CommercialComparatorDiagnosticResultV1 = {
  validationVersion: typeof COMMERCIAL_COMPARATOR_ELIGIBILITY_VALIDATION_V1;
  caseId: string;
  fixtureKind: CommercialComparatorDiagnosticCaseV1["fixtureKind"];
  merchantContextFacts: CommercialComparatorDiagnosticCaseV1["merchantContextFacts"];
  comparator: CommercialComparatorDiagnosticCaseV1["comparator"];
  eligibilityStatus: ComparatorEligibilityStatusV1;
  merchantSpecificApprovalKnown: boolean;
  pricingModelCompatibility: ComparatorCompatibilityV1;
  populationCompatibility: ComparatorCompatibilityV1;
  channelCompatibility: ComparatorCompatibilityV1;
  scopeDifferences: string[];
  decompositionPermission: ComparatorDecompositionPermissionV1;
  calculationPermitted: boolean;
  calculation: {
    state: "exact" | "bounded" | "not_permitted";
    comparatorAmountMinor: number | null;
    comparatorAmountRangeMinor: { low: number; high: number } | null;
    differenceFromCurrentMinor: number | null;
    differenceRangeMinor: { low: number; high: number } | null;
  };
  strongestAllowedCommercialClaim: string;
  blockedStrongerClaims: string[];
  reasons: string[];
  confidence: {
    decomposition: "high" | "medium" | "low" | "unresolved";
    source: "high" | "medium" | "low" | "unresolved";
    applicability: "high" | "medium" | "low" | "unresolved";
    period: "high" | "medium" | "low" | "not_relevant";
    weakestRelevant: "high" | "medium" | "low" | "unresolved";
  };
  permissions: {
    conditionalScenarioAllowed: boolean;
    confirmedAvailabilityLanguageAllowed: boolean;
    likeForLikeComponentLanguageAllowed: boolean;
    directionalEvidenceLanguageAllowed: boolean;
    expensiveOrReasonableGradeAllowed: false;
    preciseSavingsClaimAllowed: false;
    switchingRecommendationAllowed: false;
    customerFacingAuthorityAllowed: false;
    reusableKnowledgeAdmissionAllowed: false;
    canonicalMutationAllowed: false;
  };
};

export function evaluateDharmaPublishedQualificationV1(input: {
  monthlyVolumeMinor: number;
  monthlyTransactionCount: number;
  businessType: string;
  averageTicketMinor: number | null;
  riskOrFutureDeliveryReviewRequired: boolean;
}): {
  status: "qualified" | "additional_underwriting" | "not_qualified";
  qualifyingBases: Array<"monthly_volume_over_100k" | "monthly_transactions_over_5000" | "low_ticket_restaurant">;
  explanation: string;
} {
  if (input.riskOrFutureDeliveryReviewRequired) {
    return {
      status: "additional_underwriting",
      qualifyingBases: [],
      explanation: "Risk, future-delivery, or recurring characteristics require separate provider review; published high-volume terms are not confirmed.",
    };
  }
  const qualifyingBases: Array<"monthly_volume_over_100k" | "monthly_transactions_over_5000" | "low_ticket_restaurant"> = [];
  if (input.monthlyVolumeMinor > 10_000_000) qualifyingBases.push("monthly_volume_over_100k");
  if (input.monthlyTransactionCount > 5_000) qualifyingBases.push("monthly_transactions_over_5000");
  if (/restaurant/i.test(input.businessType) && input.averageTicketMinor !== null && input.averageTicketMinor < 2_500) {
    qualifyingBases.push("low_ticket_restaurant");
  }
  return qualifyingBases.length > 0
    ? { status: "qualified", qualifyingBases, explanation: "At least one published Dharma qualification branch is satisfied without interpolation." }
    : { status: "not_qualified", qualifyingBases, explanation: "None of the published volume, transaction-count, or low-ticket restaurant branches is established." };
}

const UNIVERSALLY_BLOCKED = [
  "expensive_or_reasonable_grade",
  "above_market_claim",
  "precise_achievable_savings",
  "switching_recommendation",
  "provider_profit_or_retention",
];

export function evaluateCommercialComparatorDiagnosticCaseV1(
  input: CommercialComparatorDiagnosticCaseV1,
): CommercialComparatorDiagnosticResultV1 {
  const reasons: string[] = [];
  const blocked = [...UNIVERSALLY_BLOCKED];
  let directional = false;
  let fatal = false;

  if (input.fixtureKind === "synthetic_boundary" && input.syntheticAuthority !== "none") {
    throw new Error(`Synthetic fixture ${input.caseId} must have no evidence authority.`);
  }
  if (input.comparator.reusableKnowledgeAuthority !== false) {
    throw new Error(`Comparator fixture ${input.caseId} cannot admit reusable knowledge.`);
  }

  if (input.comparator.sourceLane === "retired_v1_v7_band") {
    fatal = true;
    reasons.push("V1-V7 bands are retired and cannot drive a comparator decision.");
  }
  if (["company_yield", "wholesale_buy_rate"].includes(input.comparator.sourceLane)) {
    fatal = true;
    reasons.push("Company yield and wholesale/buy-rate observations are not merchant-available comparator prices.");
  }
  if (input.comparator.sourceLane === "gateway_only" && input.claimScope !== "fixed_fee_existence") {
    fatal = true;
    reasons.push("Gateway-only pricing cannot be projected into acquiring or total processing pricing.");
  }
  if (input.comparator.sourceLane === "indicative_pricing") {
    directional = true;
    reasons.push("Indicative pricing is directional context, not a confirmed standing offer.");
  }
  if (input.comparator.sourceLane === "public_contract") {
    if (input.publicContractDirectComparabilityEstablished) {
      reasons.push("The synthetic matched-enterprise control affirmatively aligns contract scope and permits stronger executed-price comparison.");
    } else {
      directional = true;
      reasons.push("The public contract lacks affirmative merchant, scale, channel, risk, population, service, term, or procurement comparability.");
    }
  }
  if (input.comparator.provider === "Clover Direct" && input.merchantContextFacts.partnerSoldClover === true) {
    fatal = true;
    reasons.push("Clover Direct terms cannot be projected onto a partner-sold Clover account.");
  }
  if (input.eligibilityStatus === "publicly_prohibited" || input.offerQualification === "not_qualified") {
    fatal = true;
    reasons.push("The merchant is publicly prohibited or does not satisfy the provider offer's published qualification function.");
  } else if (input.eligibilityStatus === "restricted_additional_underwriting" || input.offerQualification === "additional_underwriting") {
    reasons.push("Restricted/additional-underwriting status is conditional, not automatic rejection or confirmed approval.");
  } else if (input.eligibilityStatus === "not_publicly_disqualified") {
    reasons.push("Not publicly disqualified is only a negative screen; merchant approval remains unconfirmed.");
  } else if (input.eligibilityStatus === "not_evaluated") {
    fatal = true;
    reasons.push("Provider-specific public eligibility screening has not been completed for this merchant context.");
  }

  if (input.populationCompatibility === "mismatch") {
    fatal = true;
    reasons.push("The comparator and merchant charge use different billable populations; no conversion is authorized.");
  } else if (input.populationCompatibility === "unknown") {
    fatal = true;
    reasons.push("The billed population needed for this comparison is not established.");
  }
  if (input.channelCompatibility === "mismatch") {
    fatal = true;
    reasons.push("The comparator channel does not match the merchant activity channel.");
  } else if (input.channelCompatibility === "unknown" && input.calculation?.kind !== "mixed_channel_linear") {
    fatal = true;
    reasons.push("The channel required by the comparator is unknown and no bounded channel calculation is available.");
  }
  if (input.pricingModelCompatibility === "mismatch") {
    fatal = true;
    reasons.push("The requested comparison mixes incompatible pricing layers or models without complete normalization.");
  } else if (input.pricingModelCompatibility === "unknown") {
    fatal = true;
    reasons.push("Pricing-layer/model compatibility is not established.");
  }

  if (
    input.claimScope === "provider_component_price" &&
    input.decompositionPermission !== "exact_provider_controlled_dollars"
  ) {
    fatal = true;
    reasons.push("Provider dollars are only an upper bound or shared/unresolved; precise provider-markup comparison is not permitted.");
  }
  if (
    input.claimScope === "complete_total_cost" &&
    input.decompositionPermission !== "complete_total_cost"
  ) {
    fatal = true;
    reasons.push("A complete same-scope total-cost basis is not established on the merchant side.");
  }
  if (input.comparator.sourceCompleteness !== "complete_for_claim") {
    fatal = true;
    reasons.push("The published source is incomplete or only an approximate starting price for the requested calculation.");
  }
  if (!input.comparator.sourceCurrent) {
    directional = true;
    reasons.push("Current applicability is not established; age alone neither validates nor invalidates the source.");
  }

  if (input.serviceScope === "material_unpriced_difference") {
    reasons.push("Material unpriced service differences are disclosed and not assigned invented dollar values.");
    if (!directional && ["complete_total_cost", "public_contract_price"].includes(input.claimScope)) fatal = true;
  } else if (!directional && input.serviceScope === "unknown" && ["complete_total_cost", "public_contract_price"].includes(input.claimScope)) {
    fatal = true;
    reasons.push("Overall provider-price comparison requires broader service-scope evidence than is available.");
  }
  if (input.periodUse === "persistent_or_annualized" && input.periodRepresentative !== true) {
    fatal = true;
    reasons.push("Period representativeness is insufficient for persistence or annualization.");
  } else if (input.periodUse === "exact_month" && input.periodRepresentative === false) {
    reasons.push("Seasonality does not block exact-month arithmetic because no persistent or annualized claim is made.");
  }

  const calculated = !fatal && !directional && input.calculation
    ? calculate(input.calculation, input.channelCompatibility)
    : notPermittedCalculation();
  const calculationPermitted = calculated.state !== "not_permitted";
  const confirmed = calculationPermitted && input.merchantSpecificApprovalKnown &&
    (input.eligibilityStatus === "confirmed_available" || input.comparator.sourceLane === "merchant_specific_quote");
  const conditional = calculationPermitted && !confirmed && input.eligibilityStatus !== "publicly_prohibited";
  const component = calculationPermitted && input.claimScope === "provider_component_price";

  let strongest: string;
  if (input.claimScope === "fixed_fee_existence" && !fatal) {
    strongest = "Comparable providers may price this category at $0 as a separately billed fee; that supports commercial reviewability, not pure-profit or total-cost conclusions.";
  } else if (directional && !fatal) {
    strongest = "Directional or executed-price context only; direct merchant applicability is not established.";
  } else if (fatal) {
    strongest = "No price comparison is permitted; retain only the source observation and explicit refusal reasons.";
  } else if (confirmed) {
    strongest = "The merchant-specific approved or quoted terms can be applied to the same scoped activity; no overpayment or switching conclusion follows.";
  } else if (component) {
    strongest = conditional
      ? "A conditional like-for-like component rate and exact-month dollar difference may be shown, assuming the merchant qualifies and the published terms apply; omitted components remain disclosed."
      : "A like-for-like component rate and exact-month dollar difference may be shown with omitted components disclosed.";
  } else if (calculated.state === "bounded") {
    strongest = "A conditional bounded public-offer scenario may be shown; underwriting and the unknown channel allocation remain explicit.";
  } else {
    strongest = "A conditional public-offer scenario may be shown for this exact activity, assuming qualification and published terms apply.";
  }

  if (!input.merchantSpecificApprovalKnown) blocked.push("confirmed_available_to_merchant");
  if (input.decompositionPermission === "provider_upper_bound_only" || input.decompositionPermission === "shared_or_unresolved") {
    blocked.push("precise_provider_markup_comparison");
  }
  if (input.serviceScope === "material_unpriced_difference" || input.serviceScope === "unknown") {
    blocked.push("overall_provider_value_conclusion");
  }

  const confidence = confidenceFor(input, fatal, directional);
  return {
    validationVersion: COMMERCIAL_COMPARATOR_ELIGIBILITY_VALIDATION_V1,
    caseId: input.caseId,
    fixtureKind: input.fixtureKind,
    merchantContextFacts: input.merchantContextFacts,
    comparator: input.comparator,
    eligibilityStatus: input.eligibilityStatus,
    merchantSpecificApprovalKnown: input.merchantSpecificApprovalKnown,
    offerQualification: input.offerQualification,
    pricingModelCompatibility: input.pricingModelCompatibility,
    populationCompatibility: input.populationCompatibility,
    channelCompatibility: input.channelCompatibility,
    scopeDifferences: input.serviceScopeDifferences,
    decompositionPermission: input.decompositionPermission,
    calculationPermitted,
    calculation: calculated,
    strongestAllowedCommercialClaim: strongest,
    blockedStrongerClaims: unique(blocked),
    reasons: unique(reasons),
    confidence,
    permissions: {
      conditionalScenarioAllowed: conditional,
      confirmedAvailabilityLanguageAllowed: confirmed,
      likeForLikeComponentLanguageAllowed: component,
      directionalEvidenceLanguageAllowed: directional,
      expensiveOrReasonableGradeAllowed: false,
      preciseSavingsClaimAllowed: false,
      switchingRecommendationAllowed: false,
      customerFacingAuthorityAllowed: false,
      reusableKnowledgeAdmissionAllowed: false,
      canonicalMutationAllowed: false,
    },
  };
}

function calculate(calculation: ComparatorCalculationV1, channel: ComparatorCompatibilityV1) {
  if (calculation.kind === "fixed_fee") {
    return exact(calculation.comparatorAmountMinor, calculation.currentAmountMinor);
  }
  if (calculation.kind === "complete_total_cost") {
    return exact(calculation.comparatorAmountMinor, calculation.currentAmountMinor);
  }
  if (calculation.kind === "linear_component") {
    const amount = percentageAmount(calculation.volumeMinor, calculation.adValoremBps) +
      calculation.eventCount * calculation.perEventMinor + calculation.monthlyMinor;
    return exact(amount, calculation.currentAmountMinor);
  }
  const known =
    percentageAmount(calculation.cardPresentVolumeMinor, calculation.cardPresentBps) +
    calculation.cardPresentCount * calculation.cardPresentPerEventMinor +
    percentageAmount(calculation.cardNotPresentVolumeMinor, calculation.cardNotPresentBps) +
    calculation.cardNotPresentCount * calculation.cardNotPresentPerEventMinor +
    calculation.monthlyMinor;
  if (calculation.unknownVolumeMinor === 0 && calculation.unknownCount === 0) {
    return exact(known, calculation.currentAmountMinor);
  }
  if (channel !== "unknown" && channel !== "normalizable_complete") return notPermittedCalculation();
  const cpUnknown = percentageAmount(calculation.unknownVolumeMinor, calculation.cardPresentBps) +
    calculation.unknownCount * calculation.cardPresentPerEventMinor;
  const cnpUnknown = percentageAmount(calculation.unknownVolumeMinor, calculation.cardNotPresentBps) +
    calculation.unknownCount * calculation.cardNotPresentPerEventMinor;
  const low = known + Math.min(cpUnknown, cnpUnknown);
  const high = known + Math.max(cpUnknown, cnpUnknown);
  return {
    state: "bounded" as const,
    comparatorAmountMinor: null,
    comparatorAmountRangeMinor: { low, high },
    differenceFromCurrentMinor: null,
    differenceRangeMinor: calculation.currentAmountMinor === null
      ? null
      : { low: calculation.currentAmountMinor - high, high: calculation.currentAmountMinor - low },
  };
}

function exact(comparatorAmountMinor: number, currentAmountMinor: number | null) {
  return {
    state: "exact" as const,
    comparatorAmountMinor,
    comparatorAmountRangeMinor: null,
    differenceFromCurrentMinor: currentAmountMinor === null ? null : currentAmountMinor - comparatorAmountMinor,
    differenceRangeMinor: null,
  };
}

function notPermittedCalculation() {
  return {
    state: "not_permitted" as const,
    comparatorAmountMinor: null,
    comparatorAmountRangeMinor: null,
    differenceFromCurrentMinor: null,
    differenceRangeMinor: null,
  };
}

function percentageAmount(volumeMinor: number, basisPoints: number): number {
  return Math.round((volumeMinor * basisPoints) / 10_000);
}

function confidenceFor(input: CommercialComparatorDiagnosticCaseV1, fatal: boolean, directional: boolean) {
  const decomposition = input.decompositionPermission === "exact_provider_controlled_dollars" || input.decompositionPermission === "complete_total_cost"
    ? "high" as const
    : input.decompositionPermission === "provider_upper_bound_only" || input.decompositionPermission === "fee_existence_only"
      ? "medium" as const
      : "unresolved" as const;
  const source = input.comparator.sourceCompleteness === "complete_for_claim" && input.comparator.sourceCurrent
    ? "high" as const
    : input.comparator.sourceLane === "public_contract" || input.comparator.sourceLane === "indicative_pricing"
      ? "medium" as const
      : "low" as const;
  const applicability = fatal ? "unresolved" as const
    : input.merchantSpecificApprovalKnown ? "high" as const
    : input.eligibilityStatus === "restricted_additional_underwriting" ? "low" as const
    : directional ? "low" as const
    : "medium" as const;
  const period = input.periodUse === "exact_month"
    ? "not_relevant" as const
    : input.periodRepresentative === true ? "high" as const : "low" as const;
  const relevant = [decomposition, source, applicability, ...(period === "not_relevant" ? [] : [period])];
  const rank = { unresolved: 0, low: 1, medium: 2, high: 3 } as const;
  const weakestRelevant = relevant.reduce<"high" | "medium" | "low" | "unresolved">(
    (lowest, value) => rank[value] < rank[lowest] ? value : lowest,
    "high",
  );
  return { decomposition, source, applicability, period, weakestRelevant };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
