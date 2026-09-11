export const INTERNAL_COMMERCIAL_COMPARISON_FINDING_V1 =
  "internal_commercial_comparison_finding_2026_09_11_v1" as const;

export const INTERNAL_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V01 = {
  document: "RateReveal Comparator Consumer Boundary v0.1",
  sha256: "bfc6366dd61bc9b4e4e3b90f5203151f87716a5ba1e8331bc00757d05232a3ad",
} as const;

export type AcceptedComparatorDiagnosticV1 = {
  caseId: string;
  providerIdentity: string;
  offerIdentity: string;
  salesChannel: string;
  merchantChannel: string;
  matchedPopulation: string;
  economicLayer: string;
  sourceApplicableWhen: string;
  merchantEligibilityStatus: string;
  commercialFactState: "KNOWN" | "KNOWN_ABSENT" | "UNKNOWN";
  decompositionStrength: string;
  comparisonStrength: "exact_component" | "bounded_component" | "conditional_scenario" | "unavailable";
  allowedClaim: string;
  refusedClaims: string[];
  refusalReasons: string[];
  smallestUnlocker: string | null;
  sourceObservationRefs: string[];
  componentVersionRefs: string[];
  gateStates: {
    offerIdentity: string;
    merchantChannel: string;
    population: string;
    eligibility: string;
    merchantApproval: string;
    requestedScope: string;
    sourcePeriod: string;
  };
  claimPermissions: {
    customerFacingComparatorOutputAllowed: false;
    reusableKnowledgeAdmissionAllowed: false;
    canonicalMutationAllowed: false;
    overpaymentOrMarketGradeAllowed: false;
    preciseSavingsClaimAllowed: false;
    switchingRecommendationAllowed: false;
  };
};

export type InternalComparisonEconomicsV1 = {
  currency: "USD";
  unitLabel: string;
  matchedPopulationCount: number | null;
  currentUnitPriceMinor: number | null;
  alternativeUnitPriceMinor: number | null;
  currentAmount: { state: "EXACT" | "UPPER_BOUND" | "UNKNOWN"; amountMinor: number | null };
  alternativeAmount: { state: "EXACT" | "UNKNOWN"; amountMinor: number | null };
};

export type InternalCommercialComparisonFindingV1 = {
  findingVersion: typeof INTERNAL_COMMERCIAL_COMPARISON_FINDING_V1;
  productAuthority: typeof INTERNAL_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V01;
  diagnosticCaseId: string;
  status:
    | "VALID_EXACT_COMPONENT_COMPARISON"
    | "VALID_CONDITIONAL_COMPONENT_COMPARISON"
    | "VALID_BOUNDED_COMPONENT_COMPARISON"
    | "COMPARISON_UNAVAILABLE";
  currentProvider: string;
  statementFamily: string;
  alternative: { provider: string; offer: string; salesChannel: string };
  scope: {
    merchantChannel: string;
    matchedPopulation: string;
    economicLayer: string;
    sourceApplicableWhen: string;
    merchantEligibilityStatus: string;
    commercialFactState: AcceptedComparatorDiagnosticV1["commercialFactState"];
    decompositionStrength: string;
    comparisonStrength: AcceptedComparatorDiagnosticV1["comparisonStrength"];
  };
  economics: {
    currency: "USD" | null;
    unitLabel: string | null;
    matchedPopulationCount: number | null;
    currentUnitPriceMinor: number | null;
    alternativeUnitPriceMinor: number | null;
    unitDifferenceMinor: number | null;
    currentAmountState: "EXACT" | "UPPER_BOUND" | "UNKNOWN" | "NOT_SUPPLIED";
    currentAmountMinor: number | null;
    alternativeAmountState: "EXACT" | "UNKNOWN" | "NOT_SUPPLIED";
    alternativeAmountMinor: number | null;
    matchedComponentDifference: {
      state: "EXACT" | "DIRECTIONAL_BOUND" | "NOT_ESTABLISHED";
      currentMinusAlternativeMinor: number | null;
      alternativeExceedsCurrentByAtLeastMinor: number | null;
    };
  };
  conclusion: {
    whatThisProves: string;
    whatThisDoesNotProve: string[];
    refusalReasons: string[];
    smallestUnlocker: string | null;
  };
  evidenceRefs: string[];
  limitations: string[];
  action: {
    signal: "REVIEW_CURRENT_PRICING" | "NONE";
    meaning: string;
    possibleMerchantAction: string | null;
  };
  permissions: {
    internalAnalystFindingAllowed: true;
    customerRenderingAllowed: false;
    aboveOrBelowMarketVerdictAllowed: false;
    expensiveOrCheapLanguageAllowed: false;
    processorOrOverallGradeAllowed: false;
    overpaymentVerdictAllowed: false;
    savingsClaimAllowed: false;
    annualSavingsProjectionAllowed: false;
    switchingRecommendationAllowed: false;
    bestProviderRankingAllowed: false;
    merchantApprovalAssumptionAllowed: false;
    unknownToZeroAllowed: false;
    upperBoundToExactAllowed: false;
    unrelatedComponentAggregationAllowed: false;
    canonicalMutationAllowed: false;
  };
};

export function buildInternalCommercialComparisonFindingV1(input: {
  acceptedDiagnostic: AcceptedComparatorDiagnosticV1;
  currentProvider: string;
  statementFamily: string;
  currentEvidenceRefs: string[];
  economics?: InternalComparisonEconomicsV1 | null;
}): InternalCommercialComparisonFindingV1 {
  const diagnostic = input.acceptedDiagnostic;
  assertAcceptedDiagnostic(diagnostic);
  const economics = input.economics ?? null;
  if (diagnostic.comparisonStrength === "unavailable" && economics !== null) {
    throw new Error(`${diagnostic.caseId}: refused diagnostic cannot carry comparison arithmetic into the consumer.`);
  }
  if (economics) validateEconomics(diagnostic, economics);

  const status = statusFor(diagnostic.comparisonStrength);
  const amounts = calculateAmounts(diagnostic, economics);
  const conditionalPrefix = diagnostic.comparisonStrength === "conditional_scenario"
    ? `If the merchant qualifies for and is approved under ${diagnostic.offerIdentity}, `
    : "";
  const proof = proofFor(diagnostic, amounts, conditionalPrefix);
  const review = amounts.matchedComponentDifference.state === "EXACT"
    && (amounts.matchedComponentDifference.currentMinusAlternativeMinor ?? 0) > 0
    && diagnostic.comparisonStrength !== "unavailable";
  const universalRefusals = [
    "This does not establish that the alternative provider is cheaper overall.",
    "This does not establish merchant approval or availability.",
    "This does not establish processor wrongdoing or overpayment.",
    "This is not guaranteed savings and is not a switching recommendation.",
    "This does not establish an above-market, below-market, expensive, or cheap verdict.",
  ];
  return deepFreeze({
    findingVersion: INTERNAL_COMMERCIAL_COMPARISON_FINDING_V1,
    productAuthority: INTERNAL_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V01,
    diagnosticCaseId: diagnostic.caseId,
    status,
    currentProvider: input.currentProvider,
    statementFamily: input.statementFamily,
    alternative: { provider: diagnostic.providerIdentity, offer: diagnostic.offerIdentity, salesChannel: diagnostic.salesChannel },
    scope: {
      merchantChannel: diagnostic.merchantChannel,
      matchedPopulation: diagnostic.matchedPopulation,
      economicLayer: diagnostic.economicLayer,
      sourceApplicableWhen: diagnostic.sourceApplicableWhen,
      merchantEligibilityStatus: diagnostic.merchantEligibilityStatus,
      commercialFactState: diagnostic.commercialFactState,
      decompositionStrength: diagnostic.decompositionStrength,
      comparisonStrength: diagnostic.comparisonStrength,
    },
    economics: amounts,
    conclusion: {
      whatThisProves: proof,
      whatThisDoesNotProve: unique([...diagnostic.refusedClaims, ...universalRefusals]),
      refusalReasons: [...diagnostic.refusalReasons],
      smallestUnlocker: diagnostic.smallestUnlocker,
    },
    evidenceRefs: unique([...input.currentEvidenceRefs, ...diagnostic.sourceObservationRefs, ...diagnostic.componentVersionRefs]),
    limitations: unique([
      `Conclusion strength is capped at ${diagnostic.comparisonStrength}.`,
      diagnostic.comparisonStrength === "conditional_scenario" ? "Public relevance is not merchant approval." : null,
      diagnostic.comparisonStrength === "bounded_component" ? "A bound is not an exact current amount." : null,
      diagnostic.comparisonStrength === "unavailable" ? "No comparative arithmetic or stronger conclusion is permitted." : null,
    ].filter((value): value is string => value !== null)),
    action: {
      signal: review ? "REVIEW_CURRENT_PRICING" : "NONE",
      meaning: review
        ? "Enough matched-component evidence exists to justify asking the current processor about this component; no removal, wrongdoing, overpayment, or negotiation outcome is implied."
        : "The finding does not currently support a pricing-review signal.",
      possibleMerchantAction: review ? "Ask the current processor whether this pricing component can be reviewed." : null,
    },
    permissions: {
      internalAnalystFindingAllowed: true,
      customerRenderingAllowed: false,
      aboveOrBelowMarketVerdictAllowed: false,
      expensiveOrCheapLanguageAllowed: false,
      processorOrOverallGradeAllowed: false,
      overpaymentVerdictAllowed: false,
      savingsClaimAllowed: false,
      annualSavingsProjectionAllowed: false,
      switchingRecommendationAllowed: false,
      bestProviderRankingAllowed: false,
      merchantApprovalAssumptionAllowed: false,
      unknownToZeroAllowed: false,
      upperBoundToExactAllowed: false,
      unrelatedComponentAggregationAllowed: false,
      canonicalMutationAllowed: false,
    },
  });
}

function validateEconomics(diagnostic: AcceptedComparatorDiagnosticV1, economics: InternalComparisonEconomicsV1): void {
  if (economics.matchedPopulationCount !== null && (!Number.isInteger(economics.matchedPopulationCount) || economics.matchedPopulationCount < 0)) throw new Error("Matched population count must be a nonnegative integer.");
  for (const value of [economics.currentUnitPriceMinor, economics.alternativeUnitPriceMinor, economics.currentAmount.amountMinor, economics.alternativeAmount.amountMinor]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error("Comparison economics require nonnegative integer minor units.");
  }
  if ((economics.currentAmount.state === "UNKNOWN") !== (economics.currentAmount.amountMinor === null)) throw new Error("Current UNKNOWN amount must be null and known/bounded amount must be present.");
  if ((economics.alternativeAmount.state === "UNKNOWN") !== (economics.alternativeAmount.amountMinor === null)) throw new Error("Alternative UNKNOWN amount must be null and exact amount must be present.");
  if ((diagnostic.comparisonStrength === "exact_component" || diagnostic.comparisonStrength === "conditional_scenario")
    && (economics.currentAmount.state !== "EXACT" || economics.alternativeAmount.state !== "EXACT")) {
    throw new Error(`${diagnostic.caseId}: exact or conditional component arithmetic requires exact matched amounts.`);
  }
  if (diagnostic.comparisonStrength === "bounded_component" && economics.currentAmount.state !== "UPPER_BOUND") {
    throw new Error(`${diagnostic.caseId}: bounded comparison must preserve the current upper bound.`);
  }
}

function calculateAmounts(diagnostic: AcceptedComparatorDiagnosticV1, economics: InternalComparisonEconomicsV1 | null): InternalCommercialComparisonFindingV1["economics"] {
  if (!economics) return { currency: null, unitLabel: null, matchedPopulationCount: null, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, unitDifferenceMinor: null, currentAmountState: "NOT_SUPPLIED", currentAmountMinor: null, alternativeAmountState: "NOT_SUPPLIED", alternativeAmountMinor: null, matchedComponentDifference: { state: "NOT_ESTABLISHED", currentMinusAlternativeMinor: null, alternativeExceedsCurrentByAtLeastMinor: null } };
  const current = economics.currentAmount.amountMinor;
  const alternative = economics.alternativeAmount.amountMinor;
  const unitDifference = economics.currentUnitPriceMinor !== null && economics.alternativeUnitPriceMinor !== null
    ? economics.currentUnitPriceMinor - economics.alternativeUnitPriceMinor
    : null;
  if (diagnostic.comparisonStrength === "bounded_component") {
    const adverse = current !== null && alternative !== null && alternative > current ? alternative - current : null;
    return { currency: economics.currency, unitLabel: economics.unitLabel, matchedPopulationCount: economics.matchedPopulationCount, currentUnitPriceMinor: economics.currentUnitPriceMinor, alternativeUnitPriceMinor: economics.alternativeUnitPriceMinor, unitDifferenceMinor: unitDifference, currentAmountState: economics.currentAmount.state, currentAmountMinor: current, alternativeAmountState: economics.alternativeAmount.state, alternativeAmountMinor: alternative, matchedComponentDifference: { state: "DIRECTIONAL_BOUND", currentMinusAlternativeMinor: null, alternativeExceedsCurrentByAtLeastMinor: adverse } };
  }
  return { currency: economics.currency, unitLabel: economics.unitLabel, matchedPopulationCount: economics.matchedPopulationCount, currentUnitPriceMinor: economics.currentUnitPriceMinor, alternativeUnitPriceMinor: economics.alternativeUnitPriceMinor, unitDifferenceMinor: unitDifference, currentAmountState: economics.currentAmount.state, currentAmountMinor: current, alternativeAmountState: economics.alternativeAmount.state, alternativeAmountMinor: alternative, matchedComponentDifference: { state: current !== null && alternative !== null ? "EXACT" : "NOT_ESTABLISHED", currentMinusAlternativeMinor: current !== null && alternative !== null ? current - alternative : null, alternativeExceedsCurrentByAtLeastMinor: null } };
}

function proofFor(diagnostic: AcceptedComparatorDiagnosticV1, economics: InternalCommercialComparisonFindingV1["economics"], conditionalPrefix: string): string {
  if (diagnostic.comparisonStrength === "unavailable") {
    const unlocker = diagnostic.smallestUnlocker ?? "none identified";
    return `${diagnostic.allowedClaim} ${diagnostic.refusalReasons.join(" ")} Smallest unlocker: ${unlocker}${/[.!?]$/.test(unlocker) ? "" : "."}`;
  }
  if (economics.matchedComponentDifference.state === "EXACT") {
    const difference = economics.matchedComponentDifference.currentMinusAlternativeMinor ?? 0;
    if (difference > 0) return `${conditionalPrefix}the current matched component costs ${money(difference)} more on the analyzed activity than the comparable public component.`;
    if (difference < 0) return `${conditionalPrefix}the alternative matched component costs ${money(Math.abs(difference))} more on the analyzed activity than the current component.`;
    return `${conditionalPrefix}the matched component costs are equal for the analyzed activity.`;
  }
  if (economics.matchedComponentDifference.state === "DIRECTIONAL_BOUND") {
    const adverse = economics.matchedComponentDifference.alternativeExceedsCurrentByAtLeastMinor;
    if (adverse !== null) return `The alternative component is at least ${money(adverse)} more expensive than the maximum possible current comparable component on the matched scope.`;
    return `The current component is known only to be at or below ${money(economics.currentAmountMinor ?? 0)}; the evidence does not establish an exact difference or savings amount.`;
  }
  return diagnostic.allowedClaim;
}

function statusFor(strength: AcceptedComparatorDiagnosticV1["comparisonStrength"]): InternalCommercialComparisonFindingV1["status"] {
  if (strength === "exact_component") return "VALID_EXACT_COMPONENT_COMPARISON";
  if (strength === "conditional_scenario") return "VALID_CONDITIONAL_COMPONENT_COMPARISON";
  if (strength === "bounded_component") return "VALID_BOUNDED_COMPONENT_COMPARISON";
  return "COMPARISON_UNAVAILABLE";
}

function assertAcceptedDiagnostic(diagnostic: AcceptedComparatorDiagnosticV1): void {
  if (diagnostic.claimPermissions.customerFacingComparatorOutputAllowed || diagnostic.claimPermissions.reusableKnowledgeAdmissionAllowed || diagnostic.claimPermissions.canonicalMutationAllowed || diagnostic.claimPermissions.overpaymentOrMarketGradeAllowed || diagnostic.claimPermissions.preciseSavingsClaimAllowed || diagnostic.claimPermissions.switchingRecommendationAllowed) {
    throw new Error(`${diagnostic.caseId}: consumer accepts only evidence-controlled diagnostic results with all stronger permissions disabled.`);
  }
}

function money(amountMinor: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountMinor / 100); }
function unique(values: string[]): string[] { return [...new Set(values)]; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
