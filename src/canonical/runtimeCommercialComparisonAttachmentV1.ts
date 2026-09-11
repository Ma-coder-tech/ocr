import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "./authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCommercialDecompositionContractV1 } from "./commercialDecompositionContractV1.js";
import {
  evaluateCommercialOfferQualificationV1,
  evaluateCommercialPredicateV1,
  type CommercialOfferCompositionVersionV1,
  type CommercialPredicateFactFieldV1,
  type CommercialPriceComponentVersionV1,
  type CommercialSourceGovernanceRegistryV1,
} from "./commercialSourceGovernanceV1.js";
import type { GovernedKnowledgeResolution } from "./governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "./helcimDharmaCommercialSourceBatch1BV1.js";
import type { InternalAnalystMerchantContext } from "./internalAnalystFindingV1.js";
import {
  buildInternalCommercialComparisonFindingV1,
  type AcceptedComparatorDiagnosticV1,
  type InternalCommercialComparisonFindingV1,
} from "./internalCommercialComparisonFindingV1.js";
import type { CanonicalStatementAnalysis } from "./types.js";

export const RUNTIME_COMMERCIAL_COMPARISON_ATTACHMENT_V1 =
  "runtime_commercial_comparison_attachment_2026_09_11_v1" as const;

export const RUNTIME_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V1 = {
  document: "RateReveal Runtime Commercial Comparison Attachment v1",
  sha256: "5254a2f8bf0932a6cba2f428b1c30f00de8ff83d9a263abeb9f2ad9031f2fcd8",
} as const;

export type RuntimeCommercialComponentKindV1 =
  | "authorization_fee"
  | "gateway_transaction_fee"
  | "gateway_batch_fee";

export type RuntimeActivityChannelV1 = "card_present" | "card_not_present" | "mixed" | "gateway" | "unknown";
export type RuntimeCardBrandScopeV1 = "visa" | "mastercard" | "discover" | "amex" | "all_card_brands" | "unknown";

export type RuntimeCurrentCommercialComponentV1 = {
  componentRef: string;
  feeRowId: string;
  printedLabel: string;
  componentKind: RuntimeCommercialComponentKindV1;
  channel: RuntimeActivityChannelV1;
  cardBrandScope: RuntimeCardBrandScopeV1;
  economicLayer: string | null;
  unit: "per_authorization" | "per_gateway_transaction" | "per_batch";
  populationLabel: string;
  populationCount: number;
  currentUnitPriceMinor: number;
  currentAmount: { state: "EXACT" | "UPPER_BOUND"; amountMinor: number };
  currentComponentEvidenceRefs: string[];
  populationEvidenceRefs: string[];
};

export type RuntimeCommercialMerchantFactsV1 = {
  facts: Partial<Record<CommercialPredicateFactFieldV1, string | number | boolean>>;
  channel: RuntimeActivityChannelV1;
  evidenceRefsByFact: Partial<Record<CommercialPredicateFactFieldV1, string[]>>;
  unresolvedFacts: string[];
};

export type RuntimeCurrentCommercialFactSignalV1 = {
  feeRowId: string;
  printedLabel: string;
  factIdentity: "account_closure_fee" | "early_termination_fee" | "batch_fee" | "pci_compliance_fee" | "annual_fee" | "monthly_minimum";
  evidenceRefs: string[];
};

export type RuntimeCommercialComparisonAttemptV1 = {
  attemptId: string;
  currentComponentRef: string | null;
  alternativeComponentRef: string | null;
  alternativeProvider: string;
  alternativeOffer: string;
  result:
    | "MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON"
    | "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE"
    | "COMMERCIAL_FACT_IDENTITY_EVIDENCE"
    | "COMPARISON_UNAVAILABLE";
  comparisonPerformed: boolean;
  stoppingReason: string | null;
  smallestUnlocker: string | null;
  finding: InternalCommercialComparisonFindingV1;
};

export type RuntimeCommercialComparisonAttachmentV1 = {
  attachmentVersion: typeof RUNTIME_COMMERCIAL_COMPARISON_ATTACHMENT_V1;
  productAuthority: typeof RUNTIME_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V1;
  mode: "internal_analyst_only";
  customerFacingAuthority: "none";
  statement: {
    statementRef: string;
    processorName: string;
    processorFamily: string;
    statementPeriod: { start: string; end: string };
  };
  deterministicBaseline: {
    processedSalesMinor: number;
    businessType: string;
    merchantChannel: RuntimeActivityChannelV1;
    feeRowsEvaluated: number;
    pricingModel: {
      state: string;
      model: string;
      confidence: string;
      relevantPopulation: string | null;
    } | null;
    commercialEconomics: {
      totalCanonicalFeesMinor: number;
      providerControlledMinimumMinor: number;
      providerControlledUpperBoundMinor: number;
      providerControlledUpperBoundState: string;
      unresolvedIncludingCanonicalResidualMinor: number;
    } | null;
    currentProviderControlledComponents: RuntimeCurrentCommercialComponentV1[];
    currentCommercialFactSignals: RuntimeCurrentCommercialFactSignalV1[];
    merchantFacts: RuntimeCommercialMerchantFactsV1;
  };
  attempts: RuntimeCommercialComparisonAttemptV1[];
  summary: {
    governedOffersConsidered: number;
    currentComponentsEstablished: number;
    matchedComparisons: number;
    qualificationEvidenceOnly: number;
    commercialFactsOnly: number;
    blockedComparisons: number;
    result: "COMPARISON_AVAILABLE" | "COMPARISON_BLOCKED" | "NO_APPLICABLE_GOVERNED_ALTERNATIVE";
    explanation: string;
  };
  permissions: {
    internalAnalystOnly: true;
    customerRenderingAllowed: false;
    marketVerdictAllowed: false;
    gradeAllowed: false;
    overpaymentVerdictAllowed: false;
    savingsOrAnnualizationAllowed: false;
    switchingOrProviderRankingAllowed: false;
    canonicalMutationAllowed: false;
    aiOrWebResearchAllowed: false;
    newCommercialKnowledgeAdmissionAllowed: false;
  };
  limitations: string[];
};

type RuntimeStatementScopeV1 = {
  statementRef: string;
  processorName: string;
  processorFamily: string;
  statementPeriod: { start: string; end: string };
  processedSalesMinor: number;
  businessType: string;
  feeRowsEvaluated?: number;
  pricingModel?: RuntimeCommercialComparisonAttachmentV1["deterministicBaseline"]["pricingModel"];
  commercialEconomics?: RuntimeCommercialComparisonAttachmentV1["deterministicBaseline"]["commercialEconomics"];
};

type AlternativeCandidateV1 = {
  registry: CommercialSourceGovernanceRegistryV1;
  composition: CommercialOfferCompositionVersionV1;
  component: CommercialPriceComponentVersionV1;
  componentKind: RuntimeCommercialComponentKindV1;
  channel: RuntimeActivityChannelV1;
  cardBrandScope: RuntimeCardBrandScopeV1;
  amountMinor: number;
};

const GOVERNED_COMMERCIAL_REGISTRIES_V1 = [
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
] as const;

/**
 * Attaches comparison consumption after canonical and governed statement analysis.
 * It reads canonical facts and admitted commercial knowledge but mutates neither.
 */
export function buildRuntimeCommercialComparisonAttachmentV1(input: {
  analysis: CanonicalStatementAnalysis;
  knowledge: GovernedKnowledgeResolution;
  merchantContext: InternalAnalystMerchantContext;
}): RuntimeCommercialComparisonAttachmentV1 {
  const processorName = input.analysis.identity.processorName.value;
  const processorFamily = input.analysis.identity.processorFamily.value;
  const statementPeriod = input.analysis.identity.statementPeriod.value;
  const processedSales = input.analysis.financialFacts.processedSales.value;
  const businessType = input.analysis.identity.businessType.value;
  if (!processorName || !processorFamily || !statementPeriod || !processedSales || !businessType) {
    throw new Error("runtime_commercial_comparison_requires_complete_supported_statement_baseline");
  }
  const decomposition = buildCommercialDecompositionContractV1({ analysis: input.analysis, knowledge: input.knowledge });
  const currentComponents = extractRuntimeCurrentCommercialComponentsV1({
    analysis: input.analysis,
    decomposition,
    merchantContext: input.merchantContext,
  });
  const merchantFacts = buildRuntimeCommercialMerchantFactsV1(input.analysis, input.merchantContext);
  const currentFactSignals = extractCurrentCommercialFactSignals(input.analysis);
  return evaluateRuntimeCommercialComparisonFactsV1({
    statement: {
      statementRef: input.analysis.identity.sourceDocumentRef,
      processorName,
      processorFamily,
      statementPeriod,
      processedSalesMinor: processedSales.amountMinor,
      businessType,
      feeRowsEvaluated: decomposition.rows.length,
      pricingModel: {
        state: input.knowledge.pricingLayers.pricingModel.state,
        model: input.knowledge.pricingLayers.pricingModel.model,
        confidence: input.knowledge.pricingLayers.pricingModel.confidence,
        relevantPopulation: input.knowledge.pricingLayers.pricingModel.relevantPopulation,
      },
      commercialEconomics: {
        totalCanonicalFeesMinor: decomposition.statement.totalCanonicalFeesMinor,
        providerControlledMinimumMinor: decomposition.residualCompleteness.providerControlledMinimumMinor,
        providerControlledUpperBoundMinor: decomposition.residualCompleteness.providerControlledUpperBound.amountMinor,
        providerControlledUpperBoundState: decomposition.residualCompleteness.providerControlledUpperBound.state,
        unresolvedIncludingCanonicalResidualMinor: decomposition.aggregate.unresolvedIncludingCanonicalResidualMinor,
      },
    },
    currentComponents,
    currentFactSignals,
    merchantFacts,
  });
}

/** A testable evidence-bound evaluator; production callers should use the canonical wrapper above. */
export function evaluateRuntimeCommercialComparisonFactsV1(input: {
  statement: RuntimeStatementScopeV1;
  currentComponents: RuntimeCurrentCommercialComponentV1[];
  currentFactSignals?: RuntimeCurrentCommercialFactSignalV1[];
  merchantFacts: RuntimeCommercialMerchantFactsV1;
  registries?: CommercialSourceGovernanceRegistryV1[];
}): RuntimeCommercialComparisonAttachmentV1 {
  const registries = input.registries ?? [...GOVERNED_COMMERCIAL_REGISTRIES_V1];
  const candidates = alternativeCandidates(registries);
  const attempts: RuntimeCommercialComparisonAttemptV1[] = [];

  for (const current of input.currentComponents) {
    const sameKind = candidates.filter((candidate) => candidate.componentKind === current.componentKind
      && (current.componentKind !== "authorization_fee" || brandCompatible(current.cardBrandScope, candidate.cardBrandScope)));
    for (const alternative of sameKind) {
      attempts.push(evaluateCandidate(input.statement, current, alternative, input.merchantFacts));
    }
  }

  for (const signal of input.currentFactSignals ?? []) {
    attempts.push(...commercialFactAttempts(input.statement, signal, registries));
  }

  for (const { registry, composition } of admittedCompositions(registries)) {
    if (!composition.qualificationPredicate) continue;
    const qualification = evaluateCommercialOfferQualificationV1(composition, input.merchantFacts.facts);
    if (qualification.state !== "QUALIFIED") continue;
    if (!compositionEvidenceAvailableForStatement(input.statement.statementPeriod, registry, composition)) continue;
    const alreadyAttempted = attempts.some((attempt) => attempt.alternativeOffer === composition.offerIdentity.namedOffer);
    const comparisonPerformed = attempts.some((attempt) => attempt.alternativeOffer === composition.offerIdentity.namedOffer && attempt.comparisonPerformed);
    if (!alreadyAttempted || !comparisonPerformed) {
      attempts.push(qualificationEvidenceAttempt(input.statement, registry, composition, qualification.reasons));
    }
  }

  const matched = attempts.filter((attempt) => attempt.comparisonPerformed).length;
  const blocked = attempts.filter((attempt) => attempt.result === "COMPARISON_UNAVAILABLE").length;
  const qualificationOnly = attempts.filter((attempt) => attempt.result === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE").length;
  const factOnly = attempts.filter((attempt) => attempt.result === "COMMERCIAL_FACT_IDENTITY_EVIDENCE").length;
  const result = matched > 0 ? "COMPARISON_AVAILABLE" : blocked > 0 ? "COMPARISON_BLOCKED" : "NO_APPLICABLE_GOVERNED_ALTERNATIVE";
  const explanation = matched > 0
    ? "At least one current component, governed alternative component, and legitimately shared population were independently bound."
    : blocked > 0
      ? "At least one plausible component alignment was attempted, but a required evidence gate remained unresolved or mismatched."
      : "No admitted alternative component safely matched an established current merchant component; this is not a no-savings conclusion.";

  return deepFreeze({
    attachmentVersion: RUNTIME_COMMERCIAL_COMPARISON_ATTACHMENT_V1,
    productAuthority: RUNTIME_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V1,
    mode: "internal_analyst_only",
    customerFacingAuthority: "none",
    statement: {
      statementRef: input.statement.statementRef,
      processorName: input.statement.processorName,
      processorFamily: input.statement.processorFamily,
      statementPeriod: input.statement.statementPeriod,
    },
    deterministicBaseline: {
      processedSalesMinor: input.statement.processedSalesMinor,
      businessType: input.statement.businessType,
      merchantChannel: input.merchantFacts.channel,
      feeRowsEvaluated: input.statement.feeRowsEvaluated ?? 0,
      pricingModel: input.statement.pricingModel ?? null,
      commercialEconomics: input.statement.commercialEconomics ?? null,
      currentProviderControlledComponents: input.currentComponents,
      currentCommercialFactSignals: input.currentFactSignals ?? [],
      merchantFacts: input.merchantFacts,
    },
    attempts,
    summary: {
      governedOffersConsidered: admittedCompositions(registries).length,
      currentComponentsEstablished: input.currentComponents.length,
      matchedComparisons: matched,
      qualificationEvidenceOnly: qualificationOnly,
      commercialFactsOnly: factOnly,
      blockedComparisons: blocked,
      result,
      explanation,
    },
    permissions: {
      internalAnalystOnly: true,
      customerRenderingAllowed: false,
      marketVerdictAllowed: false,
      gradeAllowed: false,
      overpaymentVerdictAllowed: false,
      savingsOrAnnualizationAllowed: false,
      switchingOrProviderRankingAllowed: false,
      canonicalMutationAllowed: false,
      aiOrWebResearchAllowed: false,
      newCommercialKnowledgeAdmissionAllowed: false,
    },
    limitations: [
      "A component comparison is not a total-cost comparison, market judgment, savings claim, or provider recommendation.",
      "Public offer relevance does not establish merchant approval or merchant-specific availability.",
      "Authorization, settled-transaction, gateway-event, and batch populations are never substituted for one another.",
      "Current-only commercial evidence is not projected backward into a historical statement period.",
      "Authorize.net gateway-only evidence is never treated as complete acquiring economics.",
      "No AI, web research, candidate pricing, or unadmitted commercial knowledge participates in this attachment.",
    ],
  });
}

export function extractRuntimeCurrentCommercialComponentsV1(input: {
  analysis: CanonicalStatementAnalysis;
  decomposition: ReturnType<typeof buildCommercialDecompositionContractV1>;
  merchantContext: InternalAnalystMerchantContext;
}): RuntimeCurrentCommercialComponentV1[] {
  const arithmeticByRow = new Map(input.analysis.feeLedger.partitionSourceProvenance.rowArithmetic.map((row) => [row.feeRowId, row]));
  const rowById = new Map(input.analysis.feeLedger.rows.map((row) => [row.id, row]));
  const components: RuntimeCurrentCommercialComponentV1[] = [];

  for (const row of input.decomposition.rows) {
    if (!row.contributesToCanonicalTotal || row.billedAmountMinor <= 0) continue;
    const amountState = row.commercialDollarAttribution.kind === "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE"
      ? "EXACT"
      : row.commercialDollarAttribution.kind === "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY"
        ? "UPPER_BOUND"
        : null;
    if (!amountState || row.printedArithmetic.status !== "reproduces") continue;
    const canonicalRow = rowById.get(row.feeRowId);
    const arithmetic = arithmeticByRow.get(row.feeRowId);
    if (!canonicalRow || !arithmetic || arithmetic.formulaBasis !== "per_item" || arithmetic.itemCount === null || !arithmetic.printedPerItemRate) continue;
    const currentUnitPriceMinor = arithmetic.printedPerItemRate.normalizedFractionalRate === null
      ? null
      : exactWholeCentMinor(arithmetic.printedPerItemRate.normalizedFractionalRate);
    if (currentUnitPriceMinor === null) continue;
    const componentKind = currentComponentKind(row.printedLabel, row.mechanicAndPopulation.mechanic, row.mechanicAndPopulation.population);
    if (!componentKind) continue;
    const unit = componentKind === "authorization_fee" ? "per_authorization" : componentKind === "gateway_transaction_fee" ? "per_gateway_transaction" : "per_batch";
    const channel = currentChannel(row.printedLabel, input.merchantContext.channel, componentKind);
    components.push({
      componentRef: `canonical_fee_component:${row.feeRowId}`,
      feeRowId: row.feeRowId,
      printedLabel: row.printedLabel,
      componentKind,
      channel,
      cardBrandScope: currentBrand(row.printedLabel),
      economicLayer: row.economicLayer.value,
      unit,
      populationLabel: row.mechanicAndPopulation.population ?? unit,
      populationCount: arithmetic.itemCount,
      currentUnitPriceMinor,
      currentAmount: { state: amountState, amountMinor: row.billedAmountMinor },
      currentComponentEvidenceRefs: unique([
        `canonical_fee_row:${row.feeRowId}`,
        ...canonicalRow.contributionDecision.evidenceRefs,
        ...row.evidenceRefs,
        ...arithmetic.fieldEvidenceRefs.perUnitRate,
        ...arithmetic.fieldEvidenceRefs.chargedAmount,
      ]),
      populationEvidenceRefs: unique([
        ...arithmetic.fieldEvidenceRefs.count,
        `canonical_fee_population:${row.feeRowId}`,
      ]),
    });
  }
  return components;
}

function buildRuntimeCommercialMerchantFactsV1(
  analysis: CanonicalStatementAnalysis,
  context: InternalAnalystMerchantContext,
): RuntimeCommercialMerchantFactsV1 {
  const facts: RuntimeCommercialMerchantFactsV1["facts"] = {
    channel: context.channel,
    known_high_risk: context.riskClass === "high_risk" ? true : context.riskClass === "standard" ? false : undefined,
  };
  const evidenceRefsByFact: RuntimeCommercialMerchantFactsV1["evidenceRefsByFact"] = {
    channel: context.evidenceRefs,
    known_high_risk: context.evidenceRefs,
  };
  if (analysis.financialFacts.processedSales.value) {
    facts.monthly_volume_minor = analysis.financialFacts.processedSales.value.amountMinor;
    evidenceRefsByFact.monthly_volume_minor = analysis.financialFacts.processedSales.evidenceRefs;
  }
  const selectedCount = selectedTransactionCount(analysis);
  if (selectedCount) {
    facts.transaction_count = selectedCount.value;
    evidenceRefsByFact.transaction_count = selectedCount.evidenceRefs;
  }
  if (analysis.financialFacts.averageTicket.value) {
    facts.average_ticket_minor = analysis.financialFacts.averageTicket.value.amountMinor;
    evidenceRefsByFact.average_ticket_minor = analysis.financialFacts.averageTicket.evidenceRefs;
  }
  const merchantType = normalizedMerchantType(context.verticalId ?? analysis.identity.businessType.value);
  if (merchantType) {
    facts.merchant_type = merchantType;
    evidenceRefsByFact.merchant_type = unique([...context.evidenceRefs, ...analysis.identity.businessType.evidenceRefs]);
  }
  const unresolvedFacts = unique([
    "three_month_rolling_card_volume_minor",
    facts.transaction_count === undefined ? "transaction_count" : null,
    facts.average_ticket_minor === undefined ? "average_ticket_minor" : null,
    context.channel === "mixed" ? "card_present_vs_card_not_present_population_split" : null,
    context.channel === "unknown" ? "merchant_channel" : null,
    context.riskClass === "unknown" ? "merchant_risk_class" : null,
  ].filter((value): value is string => value !== null));
  return { facts, channel: context.channel, evidenceRefsByFact, unresolvedFacts };
}

function evaluateCandidate(
  statement: RuntimeStatementScopeV1,
  current: RuntimeCurrentCommercialComponentV1,
  alternative: AlternativeCandidateV1,
  merchantFacts: RuntimeCommercialMerchantFactsV1,
): RuntimeCommercialComparisonAttemptV1 {
  const channel = channelGate(current.channel, alternative.channel);
  const currentPopulation = runtimeCurrentPopulationIdentity(current);
  const alternativePopulation = runtimeAlternativePopulationIdentity(alternative.component);
  const brandPopulationCompatible = current.componentKind !== "authorization_fee"
    || brandCompatible(current.cardBrandScope, alternative.cardBrandScope);
  const population = !brandPopulationCompatible
    ? "mismatch"
    : currentPopulation === null || alternativePopulation === null
      ? "unknown"
      : currentPopulation === alternativePopulation
        ? "matched"
        : "mismatch";
  const qualification = evaluateCommercialOfferQualificationV1(alternative.composition, merchantFacts.facts);
  const eligibility = qualificationGate(alternative.composition, qualification.state);
  const period = sourcePeriodGate(statement.statementPeriod, alternative);
  const applicability = alternative.component.applicabilityPredicate
    ? evaluateCommercialPredicateV1(alternative.component.applicabilityPredicate, merchantFacts.facts)
    : "satisfied";
  const applicabilityGate = applicability === "satisfied" ? "matched" : applicability === "not_satisfied" ? "mismatch" : "unknown";
  const sourcePeriod = period.state === "matched" ? "matched" : "mismatch";
  const blockers = [
    period.state === "mismatch" ? { reason: period.reason, unlocker: "Period-applicable governed commercial evidence for the statement period." } : null,
    channel === "mismatch" ? { reason: "The current merchant activity channel does not match the governed alternative component channel.", unlocker: "A governed alternative component for the merchant's established channel." } : null,
    channel === "unknown" ? { reason: "The current component cannot be assigned to a compatible card-present or card-not-present population.", unlocker: "CP versus CNP transaction and volume split for the current component." } : null,
    population === "mismatch" ? { reason: "The current billing population does not match the governed alternative component population.", unlocker: "A governed alternative component covering the same billing population." } : null,
    population === "unknown" ? { reason: "The current and alternative billing populations cannot be shown to be the same.", unlocker: "Exact current and alternative billing-population identity." } : null,
    eligibility === "mismatch" ? { reason: "The governed offer is not applicable under the established qualification or risk facts.", unlocker: "A different admitted offer whose qualification rules are satisfied." } : null,
    eligibility === "unknown" ? { reason: qualification.reasons.join(" ") || "Offer qualification remains unresolved.", unlocker: qualificationUnlocker(alternative.composition, merchantFacts) } : null,
    applicabilityGate === "mismatch" ? { reason: "The component's admitted applicability predicate is not satisfied.", unlocker: "A component whose admitted applicability predicate matches the merchant activity." } : null,
    applicabilityGate === "unknown" ? { reason: "The component's admitted applicability predicate cannot be evaluated from available merchant facts.", unlocker: predicateUnlocker(alternative.component) } : null,
  ].filter((value): value is { reason: string; unlocker: string } => value !== null);
  const comparisonStrength: AcceptedComparatorDiagnosticV1["comparisonStrength"] = blockers.length > 0
    ? "unavailable"
    : current.currentAmount.state === "UPPER_BOUND"
      ? "bounded_component"
      : "conditional_scenario";
  const diagnostic = runtimeDiagnostic({
    caseId: `runtime:${statement.statementRef}:${current.feeRowId}:${alternative.component.componentVersionId}`,
    alternative,
    current,
    comparisonStrength,
    channelGate: channel,
    populationGate: population,
    eligibilityGate: eligibility,
    applicabilityGate,
    sourcePeriodGate: sourcePeriod,
    sourceApplicableWhen: period.sourceApplicableWhen,
    refusalReasons: blockers.map((blocker) => blocker.reason),
    smallestUnlocker: blockers[0]?.unlocker ?? null,
  });
  const matchedComparison = blockers.length === 0 ? {
    componentLabel: componentLabel(current.componentKind),
    economics: {
      currency: "USD" as const,
      unitLabel: current.unit.replaceAll("_", " "),
      matchedPopulationCount: current.populationCount,
      currentUnitPriceMinor: current.currentUnitPriceMinor,
      alternativeUnitPriceMinor: alternative.amountMinor,
      currentAmount: current.currentAmount,
      alternativeAmount: { state: "EXACT" as const, amountMinor: current.populationCount * alternative.amountMinor },
    },
    currentComponentEvidenceRefs: current.currentComponentEvidenceRefs,
    alternativeComponentEvidenceRefs: unique([alternative.component.componentVersionId, ...alternative.component.sourceObservationRefs]),
    matchedPopulationEvidenceRefs: current.populationEvidenceRefs,
  } : null;
  const finding = buildInternalCommercialComparisonFindingV1({
    acceptedDiagnostic: diagnostic,
    currentProvider: statement.processorName,
    statementFamily: statement.processorFamily,
    currentEvidenceRefs: current.currentComponentEvidenceRefs,
    matchedComparison,
  });
  return {
    attemptId: diagnostic.caseId,
    currentComponentRef: current.componentRef,
    alternativeComponentRef: alternative.component.componentVersionId,
    alternativeProvider: alternative.component.offerIdentity.providerBrand,
    alternativeOffer: alternative.component.offerIdentity.namedOffer,
    result: finding.findingKind === "COMPARISON_UNAVAILABLE_BLOCKER" ? "COMPARISON_UNAVAILABLE" : finding.findingKind,
    comparisonPerformed: finding.comparisonPerformed,
    stoppingReason: blockers[0]?.reason ?? null,
    smallestUnlocker: blockers[0]?.unlocker ?? null,
    finding,
  };
}

function qualificationEvidenceAttempt(
  statement: RuntimeStatementScopeV1,
  registry: CommercialSourceGovernanceRegistryV1,
  composition: CommercialOfferCompositionVersionV1,
  reasons: string[],
): RuntimeCommercialComparisonAttemptV1 {
  const sourceRefs = unique([
    ...composition.sourceObservationRefs,
    ...composition.componentVersionRefs.flatMap((ref) => registry.priceComponentVersions.find((component) => component.componentVersionId === ref)?.sourceObservationRefs ?? []),
  ]);
  const diagnostic = baseDiagnostic({
    caseId: `runtime:${statement.statementRef}:${composition.compositionVersionId}:qualification`,
    providerIdentity: composition.offerIdentity.providerBrand,
    offerIdentity: composition.offerIdentity.namedOffer,
    salesChannel: composition.offerIdentity.distributionChannel,
    merchantChannel: "merchant qualification facts",
    matchedPopulation: "offer qualification population",
    economicLayer: "offer qualification",
    sourceApplicableWhen: "current_unknown_effective_from",
    merchantEligibilityStatus: "qualified_public_predicate_merchant_approval_unknown",
    commercialFactState: "KNOWN",
    decompositionStrength: "offer qualification evidence only",
    comparisonStrength: "conditional_scenario",
    allowedClaim: reasons.join(" ") || "The admitted public qualification predicate is satisfied.",
    refusedClaims: ["A current-versus-alternative price comparison.", "Merchant approval or availability."],
    refusalReasons: ["No exact current merchant component was independently bound to this qualification evidence."],
    smallestUnlocker: "An exact current component and matching population for a component comparison.",
    sourceObservationRefs: sourceRefs,
    componentVersionRefs: [],
    gateStates: {
      offerIdentity: "matched",
      merchantChannel: "not_required",
      population: "not_required",
      eligibility: "matched",
      merchantApproval: "conditional",
      requestedScope: "matched",
      sourcePeriod: "matched",
    },
  });
  const finding = buildInternalCommercialComparisonFindingV1({
    acceptedDiagnostic: diagnostic,
    currentProvider: statement.processorName,
    statementFamily: statement.processorFamily,
    currentEvidenceRefs: [],
  });
  return {
    attemptId: diagnostic.caseId,
    currentComponentRef: null,
    alternativeComponentRef: null,
    alternativeProvider: composition.offerIdentity.providerBrand,
    alternativeOffer: composition.offerIdentity.namedOffer,
    result: "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE",
    comparisonPerformed: false,
    stoppingReason: "Qualification evidence alone does not establish a current-versus-alternative comparison.",
    smallestUnlocker: diagnostic.smallestUnlocker,
    finding,
  };
}

function commercialFactAttempts(
  statement: RuntimeStatementScopeV1,
  signal: RuntimeCurrentCommercialFactSignalV1,
  registries: CommercialSourceGovernanceRegistryV1[],
): RuntimeCommercialComparisonAttemptV1[] {
  const attempts: RuntimeCommercialComparisonAttemptV1[] = [];
  for (const { registry, composition } of admittedCompositions(registries)) {
    for (const ref of composition.componentVersionRefs) {
      const component = registry.priceComponentVersions.find((item) => item.componentVersionId === ref);
      if (!component || component.admission.lifecycle !== "admitted" || component.componentIdentity !== signal.factIdentity) continue;
      if (component.completeness.state === "UNKNOWN") continue;
      const period = sourcePeriodGate(statement.statementPeriod, { registry, component });
      if (period.state !== "matched") continue;
      const state = component.completeness.state;
      const wording = state === "KNOWN_ABSENT"
        ? `${component.offerIdentity.namedOffer} has governed scoped absence evidence for ${signal.factIdentity.replaceAll("_", " ")}.`
        : `${component.offerIdentity.namedOffer} has governed identity evidence for ${signal.factIdentity.replaceAll("_", " ")}.`;
      const diagnostic = baseDiagnostic({
        caseId: `runtime:${statement.statementRef}:${signal.feeRowId}:${component.componentVersionId}:commercial_fact`,
        providerIdentity: component.offerIdentity.providerBrand,
        offerIdentity: component.offerIdentity.namedOffer,
        salesChannel: component.offerIdentity.distributionChannel,
        merchantChannel: "not required for this identity fact",
        matchedPopulation: component.billedPopulation,
        economicLayer: "commercial fact identity evidence",
        sourceApplicableWhen: period.sourceApplicableWhen,
        merchantEligibilityStatus: "not evaluated for identity-only evidence",
        commercialFactState: state,
        decompositionStrength: "claim-specific commercial identity evidence only",
        comparisonStrength: "exact_component",
        allowedClaim: wording,
        refusedClaims: [
          "A current-versus-alternative price comparison.",
          "Comparative arithmetic or a REVIEW_CURRENT_PRICING signal.",
          "Generalizing the fact beyond the governed offer, channel, component, or period.",
        ],
        refusalReasons: ["Commercial identity or scoped absence evidence is not itself a matched economic comparison."],
        smallestUnlocker: "Independent current-component, alternative-component, and matched-population evidence for any requested comparison.",
        sourceObservationRefs: component.sourceObservationRefs,
        componentVersionRefs: [component.componentVersionId],
        gateStates: {
          offerIdentity: "matched",
          merchantChannel: "not_required",
          population: "not_required",
          eligibility: "not_required",
          merchantApproval: "not_required",
          requestedScope: "matched",
          sourcePeriod: "matched",
        },
      });
      const finding = buildInternalCommercialComparisonFindingV1({
        acceptedDiagnostic: diagnostic,
        currentProvider: statement.processorName,
        statementFamily: statement.processorFamily,
        currentEvidenceRefs: signal.evidenceRefs,
      });
      attempts.push({
        attemptId: diagnostic.caseId,
        currentComponentRef: `canonical_fee_fact:${signal.feeRowId}`,
        alternativeComponentRef: component.componentVersionId,
        alternativeProvider: component.offerIdentity.providerBrand,
        alternativeOffer: component.offerIdentity.namedOffer,
        result: "COMMERCIAL_FACT_IDENTITY_EVIDENCE",
        comparisonPerformed: false,
        stoppingReason: "Commercial fact evidence does not independently establish a comparison.",
        smallestUnlocker: diagnostic.smallestUnlocker,
        finding,
      });
    }
  }
  return attempts;
}

function runtimeDiagnostic(input: {
  caseId: string;
  alternative: AlternativeCandidateV1;
  current: RuntimeCurrentCommercialComponentV1;
  comparisonStrength: AcceptedComparatorDiagnosticV1["comparisonStrength"];
  channelGate: "matched" | "mismatch" | "unknown";
  populationGate: "matched" | "mismatch" | "unknown";
  eligibilityGate: "matched" | "mismatch" | "unknown" | "not_required";
  applicabilityGate: "matched" | "mismatch" | "unknown";
  sourcePeriodGate: "matched" | "mismatch";
  sourceApplicableWhen: string;
  refusalReasons: string[];
  smallestUnlocker: string | null;
}): AcceptedComparatorDiagnosticV1 {
  const gatewayOnly = input.alternative.component.offerIdentity.productScope === "gateway_only";
  const unavailable = input.comparisonStrength === "unavailable";
  return baseDiagnostic({
    caseId: input.caseId,
    providerIdentity: input.alternative.component.offerIdentity.providerBrand,
    offerIdentity: input.alternative.component.offerIdentity.namedOffer,
    salesChannel: input.alternative.component.offerIdentity.distributionChannel,
    merchantChannel: input.current.channel,
    matchedPopulation: input.current.populationLabel,
    economicLayer: input.current.componentKind === "authorization_fee" ? "provider-controlled authorization component" : "gateway component",
    sourceApplicableWhen: input.sourceApplicableWhen,
    merchantEligibilityStatus: input.eligibilityGate === "matched" ? "public_predicate_satisfied_approval_unknown" : input.eligibilityGate,
    commercialFactState: "KNOWN",
    decompositionStrength: input.current.currentAmount.state === "UPPER_BOUND" ? "provider-controlled upper bound" : "exact provider-controlled component",
    comparisonStrength: input.comparisonStrength,
    allowedClaim: unavailable
      ? "No current-versus-alternative arithmetic is permitted while a required evidence gate is unresolved or mismatched."
      : `Compare only the matched ${componentLabel(input.current.componentKind)} on its established population.`,
    refusedClaims: unique([
      "Complete alternative-processing cost.",
      "Above-market, below-market, expensive, cheap, grade, overpayment, savings, annualization, switching, or provider-ranking conclusions.",
      gatewayOnly ? "Treating gateway-only pricing as complete acquiring economics." : "Treating one component as complete provider economics.",
    ]),
    refusalReasons: unique([
      ...(input.refusalReasons.length > 0
        ? input.refusalReasons
        : [gatewayOnly ? "Authorize.net evidence is limited to the matched gateway scope." : "Only one claim-specific component is aligned."]),
      "Public offer relevance does not establish merchant approval or merchant-specific availability.",
    ]),
    smallestUnlocker: input.smallestUnlocker,
    sourceObservationRefs: input.alternative.component.sourceObservationRefs,
    componentVersionRefs: [input.alternative.component.componentVersionId],
    gateStates: {
      offerIdentity: "matched",
      merchantChannel: input.channelGate,
      population: input.populationGate,
      eligibility: input.eligibilityGate,
      merchantApproval: "conditional",
      requestedScope: input.applicabilityGate,
      sourcePeriod: input.sourcePeriodGate,
    },
  });
}

function baseDiagnostic(input: Omit<AcceptedComparatorDiagnosticV1, "claimPermissions">): AcceptedComparatorDiagnosticV1 {
  return {
    ...input,
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

function alternativeCandidates(registries: CommercialSourceGovernanceRegistryV1[]): AlternativeCandidateV1[] {
  const results: AlternativeCandidateV1[] = [];
  for (const { registry, composition } of admittedCompositions(registries)) {
    for (const ref of composition.componentVersionRefs) {
      const component = registry.priceComponentVersions.find((item) => item.componentVersionId === ref);
      if (!component || component.admission.lifecycle !== "admitted" || component.completeness.state !== "KNOWN") continue;
      if (component.completeness.value.kind !== "money" || component.completeness.value.currency !== "USD") continue;
      if (component.pricePresentation !== "exact" || component.directionalBound !== "none") continue;
      const kind = alternativeComponentKind(component);
      if (!kind) continue;
      if (registry.conflicts.some((conflict) => conflict.state === "unresolved" && conflict.componentVersionRefs.includes(component.componentVersionId))) continue;
      results.push({
        registry,
        composition,
        component,
        componentKind: kind,
        channel: alternativeChannel(component),
        cardBrandScope: alternativeBrand(component),
        amountMinor: component.completeness.value.amountMinor,
      });
    }
  }
  return results;
}

function admittedCompositions(registries: CommercialSourceGovernanceRegistryV1[]) {
  return registries.flatMap((registry) => registry.offerCompositionVersions
    .filter((composition) => composition.admission.lifecycle === "admitted")
    .map((composition) => ({ registry, composition })));
}

function sourcePeriodGate(statement: { start: string; end: string }, alternative: {
  registry: CommercialSourceGovernanceRegistryV1;
  component: CommercialPriceComponentVersionV1;
}): {
  state: "matched" | "mismatch";
  sourceApplicableWhen: string;
  reason: string;
} {
  const period = alternative.component.effectivePeriod;
  if (period.knowledge !== "effective_period_unknown") {
    const startsInTime = period.effectiveFrom === null || period.effectiveFrom <= statement.start;
    const endsInTime = period.effectiveTo === null || statement.end < period.effectiveTo;
    return startsInTime && endsInTime
      ? { state: "matched", sourceApplicableWhen: "historical_period_matched", reason: "The governed component period covers the statement period." }
      : { state: "mismatch", sourceApplicableWhen: "historical_unavailable", reason: "The governed component effective period does not cover the statement period." };
  }
  const observedDates = alternative.component.sourceObservationRefs
    .map((ref) => alternative.registry.sourceObservations.find((observation) => observation.observationId === ref)?.provenance.observedAt.slice(0, 10) ?? null)
    .filter((date): date is string => date !== null);
  if (observedDates.length !== alternative.component.sourceObservationRefs.length || observedDates.some((date) => date > statement.end)) {
    return {
      state: "mismatch",
      sourceApplicableWhen: "historical_unavailable",
      reason: "The alternative has current-only or later-observed evidence and cannot be projected backward into this statement period.",
    };
  }
  return {
    state: "matched",
    sourceApplicableWhen: "current_unknown_effective_from",
    reason: "The source was observed by the statement end, but its effective-from date is unknown; use is a current conditional scenario only.",
  };
}

function compositionEvidenceAvailableForStatement(
  statement: { start: string; end: string },
  registry: CommercialSourceGovernanceRegistryV1,
  composition: CommercialOfferCompositionVersionV1,
): boolean {
  const period = composition.effectivePeriod;
  if (period.knowledge !== "effective_period_unknown") {
    return (period.effectiveFrom === null || period.effectiveFrom <= statement.start)
      && (period.effectiveTo === null || statement.end < period.effectiveTo);
  }
  if (composition.sourceObservationRefs.length === 0) return false;
  return composition.sourceObservationRefs.every((ref) => {
    const observed = registry.sourceObservations.find((observation) => observation.observationId === ref)?.provenance.observedAt.slice(0, 10);
    return observed !== undefined && observed <= statement.end;
  });
}

function currentComponentKind(label: string, mechanic: string | null, population: string | null): RuntimeCommercialComponentKindV1 | null {
  const text = `${label} ${mechanic ?? ""} ${population ?? ""}`.toLowerCase();
  if (text.includes("gateway") && text.includes("batch")) return "gateway_batch_fee";
  if (text.includes("gateway") && text.includes("transaction")) return "gateway_transaction_fee";
  if (/\bauth(?:orization)?\b|\bwats\b/.test(text)) return "authorization_fee";
  return null;
}

function extractCurrentCommercialFactSignals(analysis: CanonicalStatementAnalysis): RuntimeCurrentCommercialFactSignalV1[] {
  const signals: RuntimeCurrentCommercialFactSignalV1[] = [];
  for (const row of analysis.feeLedger.rows) {
    if (!row.selectedLabel || !row.contributesToUniqueTotal || (row.selectedAmount?.amountMinor ?? 0) <= 0) continue;
    const upper = row.selectedLabel.toUpperCase();
    const factIdentity = /ACCOUNT\s+CLOSURE|CLOSURE\s+FEE/.test(upper)
      ? "account_closure_fee"
      : /EARLY\s+TERMINATION|TERMINATION\s+FEE/.test(upper)
        ? "early_termination_fee"
        : /\bBATCH(?:\s+SETTLEMENT)?\s+FEE\b/.test(upper)
          ? "batch_fee"
          : /\bPCI\s+COMPLIANCE\s+FEE\b/.test(upper)
            ? "pci_compliance_fee"
            : /\bANNUAL\s+FEE\b/.test(upper)
              ? "annual_fee"
              : /\bMONTHLY\s+MINIMUM\b/.test(upper)
                ? "monthly_minimum"
                : null;
    if (!factIdentity) continue;
    signals.push({
      feeRowId: row.id,
      printedLabel: row.selectedLabel,
      factIdentity,
      evidenceRefs: unique([`canonical_fee_row:${row.id}`, ...row.contributionDecision.evidenceRefs]),
    });
  }
  return signals;
}

function alternativeComponentKind(component: CommercialPriceComponentVersionV1): RuntimeCommercialComponentKindV1 | null {
  if (component.unit === "per_authorization") return "authorization_fee";
  if (component.unit === "per_gateway_transaction") return "gateway_transaction_fee";
  if (component.unit === "per_batch" && component.componentIdentity === "gateway_batch_charge") return "gateway_batch_fee";
  return null;
}

function currentChannel(label: string, fallback: InternalAnalystMerchantContext["channel"], kind: RuntimeCommercialComponentKindV1): RuntimeActivityChannelV1 {
  if (kind === "gateway_batch_fee" || kind === "gateway_transaction_fee") return "gateway";
  const upper = label.toUpperCase();
  if (/\bCNP\b|NONSWIPE|NON-SWIPE|KEYED|ECOM|ONLINE/.test(upper)) return "card_not_present";
  if (/\bCP\b|CARD PRESENT|CARD-PRESENT|SWIPE|CHIP|CONTACTLESS/.test(upper)) return "card_present";
  return fallback;
}

function alternativeChannel(component: CommercialPriceComponentVersionV1): RuntimeActivityChannelV1 {
  const text = `${component.componentIdentity} ${component.billedPopulation} ${component.offerIdentity.namedOffer}`.toLowerCase();
  if (component.offerIdentity.productScope === "gateway_only") return "gateway";
  if (text.includes("card_not_present") || text.includes("virtual") || text.includes("online")) return "card_not_present";
  if (text.includes("card_present") || text.includes("retail") || text.includes("storefront")) return "card_present";
  return "unknown";
}

function currentBrand(label: string): RuntimeCardBrandScopeV1 {
  const upper = label.toUpperCase();
  if (/AMEX|AMERICAN EXPRESS|AXP/.test(upper)) return "amex";
  if (/MASTERCARD|\bMC\b/.test(upper)) return "mastercard";
  if (/DISCOVER|\bDS\b/.test(upper)) return "discover";
  if (/\bVISA\b|\bVI\b/.test(upper)) return "visa";
  return "unknown";
}

function alternativeBrand(component: CommercialPriceComponentVersionV1): RuntimeCardBrandScopeV1 {
  const text = `${component.componentIdentity} ${component.billedPopulation}`.toLowerCase();
  if (text.includes("amex")) return "amex";
  if (text.includes("visa_mastercard_discover")) return "all_card_brands";
  if (text.includes("card_present") || text.includes("card_not_present") || component.offerIdentity.productScope === "gateway_only") return "all_card_brands";
  return "unknown";
}

function channelGate(current: RuntimeActivityChannelV1, alternative: RuntimeActivityChannelV1): "matched" | "mismatch" | "unknown" {
  if (current === "mixed" || current === "unknown" || alternative === "unknown") return "unknown";
  return current === alternative ? "matched" : "mismatch";
}

function brandCompatible(current: RuntimeCardBrandScopeV1, alternative: RuntimeCardBrandScopeV1): boolean {
  if (alternative === "all_card_brands") return current !== "unknown";
  return current === alternative;
}

function runtimeCurrentPopulationIdentity(current: RuntimeCurrentCommercialComponentV1): string | null {
  const text = `${current.printedLabel} ${current.populationLabel}`.toLowerCase().replaceAll("-", "_");
  if (/settled.*(?:sale|transaction)|(?:sale|transaction).*settled/.test(text)) return "settled_transactions";
  if (/attempt(?:ed|s)?.*auth|auth.*attempt/.test(text)) return "authorization_attempts";
  if (/approved.*auth|auth.*approved/.test(text)) return "approved_authorizations";
  if (current.unit === "per_gateway_transaction") return "gateway_transactions";
  if (current.unit === "per_batch") return "settled_batches";
  if (/authorization|\bauth\b|\bwats\b/.test(text) || current.unit === "per_authorization") return "authorizations";
  return null;
}

function runtimeAlternativePopulationIdentity(component: CommercialPriceComponentVersionV1): string | null {
  const text = component.billedPopulation.toLowerCase().replaceAll("-", "_");
  if (/settled.*(?:sale|transaction)|(?:sale|transaction).*settled/.test(text)) return "settled_transactions";
  if (/attempt(?:ed|s)?.*auth|auth.*attempt/.test(text)) return "authorization_attempts";
  if (/approved.*auth|auth.*approved/.test(text)) return "approved_authorizations";
  if (component.unit === "per_gateway_transaction") return "gateway_transactions";
  if (component.unit === "per_batch") return "settled_batches";
  if (/authorization|\bauth\b/.test(text) || component.unit === "per_authorization") return "authorizations";
  return null;
}

function qualificationGate(
  composition: CommercialOfferCompositionVersionV1,
  state: ReturnType<typeof evaluateCommercialOfferQualificationV1>["state"],
): "matched" | "mismatch" | "unknown" | "not_required" {
  if (!composition.qualificationPredicate && !composition.disqualifyingPredicate) return "not_required";
  if (state === "QUALIFIED") return "matched";
  if (state === "NOT_QUALIFIED" || state === "NOT_APPLICABLE") return "mismatch";
  return "unknown";
}

function qualificationUnlocker(composition: CommercialOfferCompositionVersionV1, facts: RuntimeCommercialMerchantFactsV1): string {
  if (composition.qualificationBoundary && facts.facts[composition.qualificationBoundary.field] === composition.qualificationBoundary.exactValue) {
    return composition.qualificationBoundary.reason;
  }
  return "The smallest missing merchant fact needed to resolve the admitted offer qualification predicate.";
}

function predicateUnlocker(component: CommercialPriceComponentVersionV1): string {
  const fields = predicateFields(component.applicabilityPredicate);
  return fields.length > 0 ? `Evidence for ${fields.join(", ")}.` : "Evidence satisfying the component applicability condition.";
}

function predicateFields(predicate: CommercialPriceComponentVersionV1["applicabilityPredicate"]): string[] {
  if (!predicate) return [];
  if ("conditions" in predicate) return unique(predicate.conditions.flatMap((condition) => predicateFields(condition)));
  return [predicate.field];
}

function selectedTransactionCount(analysis: CanonicalStatementAnalysis): { value: number; evidenceRefs: string[] } | null {
  const keyByType = {
    submitted_transactions: "submittedTransactions",
    settled_transactions: "settledTransactions",
    authorizations: "authorizations",
    captures: "captures",
    refunds: "refunds",
    chargebacks: "chargebacks",
    network_transactions: "networkTransactions",
    card_type_items: "cardTypeItems",
    audit_specific: "auditSpecificCounts",
    unknown: "unknownCounts",
  } as const;
  const selected = analysis.financialFacts.averageTicketBasis.selectedCountType;
  if (!selected) return null;
  const fact = analysis.financialFacts.transactionCounts[keyByType[selected]];
  return fact.value === null ? null : { value: fact.value, evidenceRefs: fact.evidenceRefs };
}

function normalizedMerchantType(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("restaurant") || normalized.includes("food_beverage")) return "restaurant";
  return normalized;
}

function exactWholeCentMinor(value: string): number | null {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const minor = Number(value) * 100;
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

function componentLabel(kind: RuntimeCommercialComponentKindV1): string {
  if (kind === "authorization_fee") return "authorization pricing component";
  if (kind === "gateway_transaction_fee") return "gateway transaction pricing component";
  return "gateway batch pricing component";
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
