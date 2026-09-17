import { assessCanonicalExactFeeRowArithmetic } from "./exactSourceArithmeticBridge.js";
import type { GovernedKnowledgeResolution } from "./governedPaymentKnowledgeAuthority.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const COMMERCIAL_DECOMPOSITION_CONTRACT_V1 =
  "claim_specific_commercial_decomposition_contract_2026_09_10_v1" as const;

export type CommercialDollarCategoryV1 =
  | "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM"
  | "INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE"
  | "PROVIDER_CONTROLLED_VARIABLE"
  | "PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY"
  | "SHARED_BUNDLED_OR_UNRESOLVED"
  | "GOVERNMENT_NONPROCESSING_OR_OTHER"
  | "NOT_APPLICABLE";

export type CommercialDollarAttributionKindV1 =
  | "PERIOD_SCOPED_NETWORK_RELATED_BILLED_AMOUNT"
  | "NETWORK_RELATED_BILLED_AMOUNT_NOT_AT_PAR"
  | "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE"
  | "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY"
  | "BROAD_PROVIDER_OR_THIRD_PARTY_CATEGORY_NOT_RETENTION"
  | "SHARED_BUNDLED_OR_UNRESOLVED"
  | "GOVERNMENT_OR_NONPROCESSING_UNRESOLVED_RECIPIENT"
  | "NOT_APPLICABLE";

export type CommercialDecompositionRowV1 = {
  feeRowId: string;
  printedLabel: string;
  contributesToCanonicalTotal: boolean;
  billedAmountMinor: number;
  identity: {
    exactState: string;
    exactValue: string | null;
    familyState: string;
    familyValue: string | null;
  };
  mechanicAndPopulation: {
    mechanicState: string;
    mechanic: string | null;
    populationState: string;
    population: string | null;
  };
  economicLayer: { state: string; value: string | null };
  participants: {
    collector: { state: string; value: string | null };
    economicBeneficiary: { state: string; value: string | null };
    ruleSetter: { state: string; value: string | null };
    priceSetter: { state: string; value: string | null };
    merchantFacingPriceController: { state: string; value: string | null };
  };
  cardinality: { state: string; value: string | null };
  printedArithmetic: {
    status: "reproduces" | "does_not_reproduce" | "unavailable";
    chargedAmountMinor: number | null;
    reconstructedRoundedAmountMinor: number | null;
    reasonCode: string;
  };
  commercialDollarCategory: CommercialDollarCategoryV1;
  commercialDollarAttribution: {
    kind: CommercialDollarAttributionKindV1;
    amountMinor: number;
    providerControlledMinimumContributionMinor: number;
    providerControlledUpperBoundContributionMinor: number;
    periodScopedUnderlyingContributionMinor: number;
    unresolvedContributionMinor: number;
    rationale: string;
  };
  claimPermissions: {
    exactProviderControlledDollarsAllowed: boolean;
    providerControlledUpperBoundAllowed: boolean;
    periodScopedUnderlyingBilledDollarsAllowed: boolean;
    networkRelatedAttributionAllowed: boolean;
    officialNetworkParLanguageAllowed: false;
    confirmedNoProviderUpliftLanguageAllowed: false;
    providerRetentionOrProfitLanguageAllowed: false;
    overallCommercialGradeAllowed: false;
    savingsTargetAllowed: false;
  };
  action: {
    actionClass: string;
    text: string;
    merchantAgreementRequiredForAction: false;
    merchantAgreementRequiredForContractConclusion: boolean;
  };
  recurrence: {
    state: "EXPLICIT_CADENCE_SUPPORTED" | "CURRENT_PERIOD_OCCURRENCE_ONLY" | "NOT_APPLICABLE";
    cadence: "monthly" | "annual" | null;
    annualizationAllowed: false;
    reason: string;
  };
  evidenceRefs: string[];
  limitations: string[];
};

export type CommercialDecompositionContractV1 = {
  contractVersion: typeof COMMERCIAL_DECOMPOSITION_CONTRACT_V1;
  authorityVersion: GovernedKnowledgeResolution["authorityVersion"];
  statement: {
    processorFamily: string | null;
    statementPeriod: CanonicalStatementAnalysis["identity"]["statementPeriod"]["value"];
    totalCanonicalFeesMinor: number;
    contributingRowTotalMinor: number;
  };
  rows: CommercialDecompositionRowV1[];
  aggregate: {
    categoryTotalsMinor: Record<Exclude<CommercialDollarCategoryV1, "NOT_APPLICABLE">, number>;
    attributedContributingRowsMinor: number;
    canonicalRowReconciliationResidualMinor: number;
    reconcilesToCanonicalFees: boolean;
    doubleCountedDollarsMinor: 0;
    unresolvedIncludingCanonicalResidualMinor: number;
  };
  residualCompleteness: {
    state: "EXACT_ROW_LEDGER_WITHOUT_PROVIDER_RESIDUAL" | "ROW_LEDGER_WITH_CANONICAL_RESIDUAL";
    exactCanonicalRowResidualMinor: number;
    exactProviderResidualAllowed: false;
    exactProviderResidualMinor: null;
    providerControlledMinimumMinor: number;
    providerControlledUpperBound: {
      state: "SUPPORTED_BOUNDED" | "SAME_AS_MINIMUM";
      amountMinor: number;
    };
    periodScopedUnderlyingBilledAmountMinor: number;
    networkRelatedBilledAmountMinor: number;
    exactOfficialNetworkParAmountMinor: null;
    unresolvedRemainderMinor: number;
    reasons: string[];
  };
  permissions: {
    internalAnalystOnly: true;
    customerRenderingAllowed: false;
    overallCommercialGradeAllowed: false;
    savingsTargetAllowed: false;
    switchingRecommendationAllowed: false;
    canonicalMutationAllowed: false;
    aiOrResearchMutationAllowed: false;
  };
};

export function buildCommercialDecompositionContractV1(input: {
  analysis: CanonicalStatementAnalysis;
  knowledge: GovernedKnowledgeResolution;
}): CommercialDecompositionContractV1 {
  const rows = input.analysis.feeLedger.rows.map((row) => buildRow(row, input.analysis, input.knowledge));
  const contributing = rows.filter((row) => row.contributesToCanonicalTotal && row.billedAmountMinor > 0);
  const canonicalTotal = input.analysis.financialFacts.totalFees.value;
  if (!canonicalTotal) throw new Error("Commercial decomposition requires a canonical total-fees fact.");
  const totalCanonicalFeesMinor = canonicalTotal.amountMinor;
  const contributingRowTotalMinor = sum(contributing.map((row) => row.billedAmountMinor));
  const canonicalResidual = totalCanonicalFeesMinor - contributingRowTotalMinor;
  const categoryTotalsMinor = emptyCategoryTotals();
  contributing.forEach((row) => {
    if (row.commercialDollarCategory !== "NOT_APPLICABLE") categoryTotalsMinor[row.commercialDollarCategory] += row.billedAmountMinor;
  });
  const attributed = sum(Object.values(categoryTotalsMinor));
  const providerMinimum = sum(contributing.map((row) => row.commercialDollarAttribution.providerControlledMinimumContributionMinor));
  const providerUpperBound = sum(contributing.map((row) => row.commercialDollarAttribution.providerControlledUpperBoundContributionMinor));
  const periodScopedUnderlying = sum(contributing.map((row) => row.commercialDollarAttribution.periodScopedUnderlyingContributionMinor));
  const networkRelated = sum(contributing.filter((row) => row.claimPermissions.networkRelatedAttributionAllowed).map((row) => row.billedAmountMinor));
  const unresolvedRows = sum(contributing.map((row) => row.commercialDollarAttribution.unresolvedContributionMinor));
  const unresolvedRemainder = unresolvedRows + Math.max(0, canonicalResidual);

  return deepFreeze({
    contractVersion: COMMERCIAL_DECOMPOSITION_CONTRACT_V1,
    authorityVersion: input.knowledge.authorityVersion,
    statement: {
      processorFamily: input.analysis.identity.processorFamily.value,
      statementPeriod: input.analysis.identity.statementPeriod.value,
      totalCanonicalFeesMinor,
      contributingRowTotalMinor,
    },
    rows,
    aggregate: {
      categoryTotalsMinor,
      attributedContributingRowsMinor: attributed,
      canonicalRowReconciliationResidualMinor: canonicalResidual,
      reconcilesToCanonicalFees: attributed + canonicalResidual === totalCanonicalFeesMinor,
      doubleCountedDollarsMinor: 0,
      unresolvedIncludingCanonicalResidualMinor: unresolvedRemainder,
    },
    residualCompleteness: {
      state: canonicalResidual === 0 ? "EXACT_ROW_LEDGER_WITHOUT_PROVIDER_RESIDUAL" : "ROW_LEDGER_WITH_CANONICAL_RESIDUAL",
      exactCanonicalRowResidualMinor: canonicalResidual,
      exactProviderResidualAllowed: false,
      exactProviderResidualMinor: null,
      providerControlledMinimumMinor: providerMinimum,
      providerControlledUpperBound: {
        state: providerUpperBound > providerMinimum ? "SUPPORTED_BOUNDED" : "SAME_AS_MINIMUM",
        amountMinor: providerUpperBound,
      },
      periodScopedUnderlyingBilledAmountMinor: periodScopedUnderlying,
      networkRelatedBilledAmountMinor: networkRelated,
      exactOfficialNetworkParAmountMinor: null,
      unresolvedRemainderMinor: unresolvedRemainder,
      reasons: unique([
        "Provider residual is never inferred by subtraction without complete, separable component evidence.",
        "Network-related billed dollars do not certify official par or exclude acquiring uplift.",
        providerUpperBound > providerMinimum ? "Some acquiring-controlled prices contain inseparable underlying cost, so only a provider upper bound is exposed." : null,
        unresolvedRows > 0 ? "Shared, bundled, or unresolved row composition remains visible." : null,
        canonicalResidual !== 0 ? "The canonical fee total includes a row-ledger reconciliation residual that is not assigned to a participant." : null,
      ].filter((value): value is string => Boolean(value))),
    },
    permissions: {
      internalAnalystOnly: true,
      customerRenderingAllowed: false,
      overallCommercialGradeAllowed: false,
      savingsTargetAllowed: false,
      switchingRecommendationAllowed: false,
      canonicalMutationAllowed: false,
      aiOrResearchMutationAllowed: false,
    },
  });
}

function buildRow(
  row: CanonicalFeeRow,
  analysis: CanonicalStatementAnalysis,
  knowledge: GovernedKnowledgeResolution,
): CommercialDecompositionRowV1 {
  const open = knowledge.openWorldDeterminants.rowsByFeeRowId[row.id];
  const adjudication = knowledge.commercialClassificationAdjudication.rowsByFeeRowId[row.id];
  if (!open || !adjudication) throw new Error(`Missing governed commercial inputs for ${row.id}`);
  const amountMinor = row.contributesToUniqueTotal ? row.selectedAmount?.amountMinor ?? 0 : 0;
  const arithmeticSource = analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === row.id) ?? null;
  const arithmetic = assessCanonicalExactFeeRowArithmetic(arithmeticSource);
  const classification = classify(row, open, adjudication, amountMinor);
  const explicitMonthly = /\b(?:MONTHLY|MTHLY|PER MONTH)\b/i.test(row.selectedLabel);
  const explicitAnnual = /\b(?:ANNUAL|YEARLY)\b/i.test(row.selectedLabel);
  const recurrence = !row.contributesToUniqueTotal
    ? { state: "NOT_APPLICABLE" as const, cadence: null, annualizationAllowed: false as const, reason: "Non-contributing rows do not receive commercial recurrence claims." }
    : explicitMonthly || explicitAnnual
      ? { state: "EXPLICIT_CADENCE_SUPPORTED" as const, cadence: explicitMonthly ? "monthly" as const : "annual" as const, annualizationAllowed: false as const, reason: "The printed label supports cadence, but one statement does not authorize annualized savings or a forecast." }
      : { state: "CURRENT_PERIOD_OCCURRENCE_ONLY" as const, cadence: null, annualizationAllowed: false as const, reason: "Only the current statement-period occurrence is established; appearance alone does not prove recurrence." };
  const evidenceRefs = unique([
    ...open.matchedRuleRefs,
    ...open.family.evidenceRefs,
    ...open.d1EconomicLayerAndControl.economicLayer.evidenceRefs,
    ...open.d1EconomicLayerAndControl.merchantFacingPriceController.evidenceRefs,
    ...open.d2MechanicAndPopulation.mechanic.evidenceRefs,
    ...open.d2MechanicAndPopulation.population.evidenceRefs,
    ...adjudication.evidenceRefs,
    ...arithmetic.evidenceRefs,
  ]);
  return {
    feeRowId: row.id,
    printedLabel: row.selectedLabel,
    contributesToCanonicalTotal: row.contributesToUniqueTotal,
    billedAmountMinor: amountMinor,
    identity: {
      exactState: open.exactIdentity.state,
      exactValue: open.exactIdentity.value,
      familyState: open.family.state,
      familyValue: open.family.value,
    },
    mechanicAndPopulation: {
      mechanicState: open.d2MechanicAndPopulation.mechanic.state,
      mechanic: open.d2MechanicAndPopulation.mechanic.value,
      populationState: open.d2MechanicAndPopulation.population.state,
      population: open.d2MechanicAndPopulation.population.value,
    },
    economicLayer: claimPair(open.d1EconomicLayerAndControl.economicLayer),
    participants: {
      collector: claimPair(open.d1EconomicLayerAndControl.collector),
      economicBeneficiary: claimPair(open.d1EconomicLayerAndControl.economicBeneficiary),
      ruleSetter: claimPair(open.d1EconomicLayerAndControl.ruleSetter),
      priceSetter: claimPair(open.d1EconomicLayerAndControl.priceSetter),
      merchantFacingPriceController: claimPair(open.d1EconomicLayerAndControl.merchantFacingPriceController),
    },
    cardinality: claimPair(open.cardinality),
    printedArithmetic: {
      status: arithmetic.status,
      chargedAmountMinor: arithmetic.chargedAmountMinor,
      reconstructedRoundedAmountMinor: arithmetic.exactAmount?.roundedAmountMinor ?? null,
      reasonCode: arithmetic.reasonCode,
    },
    commercialDollarCategory: classification.category,
    commercialDollarAttribution: classification.attribution,
    claimPermissions: classification.permissions,
    action: {
      actionClass: open.d4Actionability.actionClass,
      text: open.d4Actionability.action,
      merchantAgreementRequiredForAction: false,
      merchantAgreementRequiredForContractConclusion: open.d4Actionability.merchantAgreementRequiredForContractConclusion,
    },
    recurrence,
    evidenceRefs,
    limitations: unique([...row.limitations, ...open.limitations, ...adjudication.limitations, ...classification.limitations]),
  };
}

function classify(
  row: CanonicalFeeRow,
  open: GovernedKnowledgeResolution["openWorldDeterminants"]["rowsByFeeRowId"][string],
  adjudication: GovernedKnowledgeResolution["commercialClassificationAdjudication"]["rowsByFeeRowId"][string],
  amountMinor: number,
): {
  category: CommercialDollarCategoryV1;
  attribution: CommercialDecompositionRowV1["commercialDollarAttribution"];
  permissions: CommercialDecompositionRowV1["claimPermissions"];
  limitations: string[];
} {
  if (!row.contributesToUniqueTotal || amountMinor <= 0 || open.family.value === "F13") {
    return result("NOT_APPLICABLE", "NOT_APPLICABLE", amountMinor, "This row contributes no positive canonical charge to the commercial-dollar ledger.");
  }

  const policy = adjudication.commercialDollarPolicy;
  if (policy === "NETWORK_RELATED_BILLED_AMOUNT_PERIOD_SCOPED_STRONG") {
    const incidence = adjudication.actionClass === "N2";
    return result(
      incidence ? "INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE" : "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM",
      "PERIOD_SCOPED_NETWORK_RELATED_BILLED_AMOUNT",
      amountMinor,
      "Scoped historical evidence strongly attributes the billed amount to network economics while official network par and universal pass-through remain unasserted.",
      { periodScopedUnderlying: amountMinor, networkRelated: true },
    );
  }
  if (policy === "NETWORK_RELATED_BILLED_AMOUNT_NOT_CERTIFIED_AT_PAR") {
    return result(
      "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM",
      "NETWORK_RELATED_BILLED_AMOUNT_NOT_AT_PAR",
      amountMinor,
      "The governed network family is supported, but exact at-par composition and any provider uplift remain unresolved.",
      { networkRelated: true },
    );
  }
  if (policy === "EXACT_PROVIDER_CONTROLLED_MERCHANT_FACING_PRICE") {
    return result(
      "PROVIDER_CONTROLLED_VARIABLE",
      "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE",
      amountMinor,
      "The full billed amount is an affirmatively provider-controlled merchant-facing price; this is not a claim of profit or retention.",
      { providerMinimum: amountMinor, providerUpperBound: amountMinor, exactProvider: true },
    );
  }
  if (policy === "ACQUIRING_CONTROLLED_PRICE_BUT_SHARED_BUNDLED_DOLLARS") {
    return result(
      "SHARED_BUNDLED_OR_UNRESOLVED",
      "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY",
      amountMinor,
      "The acquiring side controls the tier price, but underlying cost is inseparable; the billed amount is only an upper bound on provider-controlled dollars.",
      { providerUpperBound: amountMinor, unresolved: amountMinor },
    );
  }
  if (policy === "SHARED_BUNDLED_OR_UNRESOLVED_DOLLARS") {
    return result("SHARED_BUNDLED_OR_UNRESOLVED", "SHARED_BUNDLED_OR_UNRESOLVED", amountMinor, adjudication.explanation, { unresolved: amountMinor });
  }
  if (policy === "GOVERNMENT_OR_NONPROCESSING_UNRESOLVED_RECIPIENT") {
    return result("GOVERNMENT_NONPROCESSING_OR_OTHER", "GOVERNMENT_OR_NONPROCESSING_UNRESOLVED_RECIPIENT", amountMinor, adjudication.explanation);
  }

  const layer = open.d1EconomicLayerAndControl.economicLayer.value;
  const controller = open.d1EconomicLayerAndControl.merchantFacingPriceController;
  const shared = open.cardinality.value === "multiple_components" || open.attributes.includes("bundled_or_composite");
  if (layer === "issuer_interchange") {
    return result("INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE", "NETWORK_RELATED_BILLED_AMOUNT_NOT_AT_PAR", amountMinor, "Interchange economics are externally set while qualification and incidence may be operationally sensitive.", { networkRelated: true });
  }
  if (layer === "card_network") {
    const category = open.d4Actionability.actionClass === "N2"
      ? "INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE"
      : "UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM";
    return result(category, "NETWORK_RELATED_BILLED_AMOUNT_NOT_AT_PAR", amountMinor, "Governed evidence supports network-related economics without certifying official par or absence of uplift.", { networkRelated: true });
  }
  if (layer === "government_or_nonprocessing_pass_through") {
    return result("GOVERNMENT_NONPROCESSING_OR_OTHER", "GOVERNMENT_OR_NONPROCESSING_UNRESOLVED_RECIPIENT", amountMinor, "The broad external/non-processing lane is supported while exact recipient remains unresolved.");
  }
  if (shared) {
    const providerUpperBound = controller.value === "acquiring_side_program" ? amountMinor : 0;
    return result("SHARED_BUNDLED_OR_UNRESOLVED", providerUpperBound > 0 ? "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY" : "SHARED_BUNDLED_OR_UNRESOLVED", amountMinor, "Composition is not separable, so the amount remains shared or unresolved.", { providerUpperBound, unresolved: amountMinor });
  }
  const providerControl = layer === "acquiring_commercial" && controller.state === "supported" && controller.value === "acquiring_side_program";
  if (providerControl) {
    const fixed = open.d3Materiality.volumeSensitivity === "fixed_or_periodic";
    return result(
      fixed ? "PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY" : "PROVIDER_CONTROLLED_VARIABLE",
      "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE",
      amountMinor,
      "Economic layer and merchant-facing acquiring-side price control are affirmatively supported and no stronger network or bundling evidence applies.",
      { providerMinimum: amountMinor, providerUpperBound: amountMinor, exactProvider: true },
    );
  }
  if (["technology_or_service", "security_compliance_or_risk", "equipment_or_physical"].includes(layer ?? "") || ["F7", "F9", "F10", "F11"].includes(open.family.value ?? "")) {
    return result("PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY", "BROAD_PROVIDER_OR_THIRD_PARTY_CATEGORY_NOT_RETENTION", amountMinor, "A broad provider/service/ancillary category is supported, but exact provider retention is not.");
  }
  return result("SHARED_BUNDLED_OR_UNRESOLVED", "SHARED_BUNDLED_OR_UNRESOLVED", amountMinor, "The governed claims do not permit participant-specific dollar attribution.", { unresolved: amountMinor });
}

function result(
  category: CommercialDollarCategoryV1,
  kind: CommercialDollarAttributionKindV1,
  amountMinor: number,
  rationale: string,
  values: {
    providerMinimum?: number;
    providerUpperBound?: number;
    periodScopedUnderlying?: number;
    unresolved?: number;
    exactProvider?: boolean;
    networkRelated?: boolean;
  } = {},
) {
  return {
    category,
    attribution: {
      kind,
      amountMinor,
      providerControlledMinimumContributionMinor: values.providerMinimum ?? 0,
      providerControlledUpperBoundContributionMinor: values.providerUpperBound ?? values.providerMinimum ?? 0,
      periodScopedUnderlyingContributionMinor: values.periodScopedUnderlying ?? 0,
      unresolvedContributionMinor: values.unresolved ?? 0,
      rationale,
    },
    permissions: {
      exactProviderControlledDollarsAllowed: values.exactProvider ?? false,
      providerControlledUpperBoundAllowed: (values.providerUpperBound ?? 0) > (values.providerMinimum ?? 0),
      periodScopedUnderlyingBilledDollarsAllowed: (values.periodScopedUnderlying ?? 0) > 0,
      networkRelatedAttributionAllowed: values.networkRelated ?? false,
      officialNetworkParLanguageAllowed: false as const,
      confirmedNoProviderUpliftLanguageAllowed: false as const,
      providerRetentionOrProfitLanguageAllowed: false as const,
      overallCommercialGradeAllowed: false as const,
      savingsTargetAllowed: false as const,
    },
    limitations: unique([
      "Commercial-dollar attribution does not mutate canonical fee identity, amount, membership, or arithmetic.",
      values.exactProvider ? "Provider-controlled merchant price is not synonymous with provider retention or profit." : null,
      values.networkRelated ? "Network-related attribution is not universal official-par certification and does not prove absence of provider uplift." : null,
    ].filter((value): value is string => Boolean(value))),
  };
}

function claimPair<T>(claim: { state: string; value: T | null }) {
  return { state: claim.state, value: claim.value === null ? null : String(claim.value) };
}

function emptyCategoryTotals(): Record<Exclude<CommercialDollarCategoryV1, "NOT_APPLICABLE">, number> {
  return {
    UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM: 0,
    INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE: 0,
    PROVIDER_CONTROLLED_VARIABLE: 0,
    PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY: 0,
    SHARED_BUNDLED_OR_UNRESOLVED: 0,
    GOVERNMENT_NONPROCESSING_OR_OTHER: 0,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
