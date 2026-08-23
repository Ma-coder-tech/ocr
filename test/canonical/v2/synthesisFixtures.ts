import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  buildCanonicalEconomicsV2SynthesisAnalysis,
  type BuildCanonicalEconomicsV2SynthesisInput,
  type CanonicalEconomicsV2EconomicAnalysis,
  type CanonicalEconomicsV2SynthesisAnalysis,
  type CanonicalSynthesisClaimKind,
  type CanonicalSynthesisProofAdmission,
} from "../../../src/canonical/v2/index.js";
import { approvedEconomicInput, buildApprovedEconomics } from "./economicFixtures.js";

export function money(amountMinor: number) { return { currency: "USD" as const, amountMinor }; }

export function economicWithNegotiator(): CanonicalEconomicsV2EconomicAnalysis {
  const input = approvedEconomicInput();
  const statementCharge = input.charges!.find((item) => item.key === "statement_fee")!;
  const occurrence = input.pricingAnalysis.foundation.sourceModel.occurrences.find((item) => item.id === statementCharge.contributingOccurrenceRef)!;
  input.participants!.push({
    key: "merchant", identity: null, identityStatus: "unresolved", roles: ["merchant"], roleResolution: "proven",
    evidenceRefs: [occurrence.evidenceRef], derivabilityTier: "stated_on_statement", assertionBasis: "source_fact", confidence: "unavailable",
  });
  input.roleClaims!.push({
    key: "merchant_negotiator", chargeKey: "statement_fee", dimension: "negotiator_change_authority", participantKey: "merchant",
    resolution: "proven", evidenceRefs: [occurrence.evidenceRef], derivabilityTier: "stated_on_statement",
    assertionBasis: "source_fact", confidence: "unavailable",
  });
  statementCharge.roleClaimKeys!.push("merchant_negotiator");
  return buildCanonicalEconomicsV2EconomicAnalysis(input);
}

export function synthesisInput(
  economicAnalysis: CanonicalEconomicsV2EconomicAnalysis = economicWithNegotiator(),
): BuildCanonicalEconomicsV2SynthesisInput {
  const foundation = economicAnalysis.pricingAnalysis.foundation;
  const pricing = economicAnalysis.pricingAnalysis.pricingArchitecture;
  const evidenceRef = foundation.sourceModel.evidence[0]!.id;
  const occurrenceRef = foundation.sourceModel.occurrences.find((item) => item.evidenceRef === evidenceRef)?.id ?? foundation.sourceModel.occurrences[0]!.id;
  const noticeEvidenceRef = foundation.sourceModel.evidence.find((item) => item.id !== evidenceRef)!.id;
  const noticeOccurrenceRef = foundation.sourceModel.occurrences.find((item) => item.evidenceRef === noticeEvidenceRef)!.id;
  const pricingPopulationRef = pricing.pricingPopulations[0]!.id;
  const pricingComponentRef = pricing.observedPricingComponents[0]!.id;
  const statementCharge = economicAnalysis.economicLayer.charges.find((item) => item.subtype === "service_admin")!;
  const costBucket = economicAnalysis.economicLayer.costStack.buckets.find((item) => item.chargeRefs.includes(statementCharge.id))!;
  const negotiator = economicAnalysis.economicLayer.roleClaims.find((item) => item.dimension === "negotiator_change_authority")!;
  const merchant = economicAnalysis.economicLayer.participants.find((item) => item.roles.includes("merchant"))!;
  const facts = foundation.financialPopulations;
  const period = foundation.identity.statementPeriod!;
  const proof = supportedProof(evidenceRef);
  const currentClaim = (key: string, kind: CanonicalSynthesisClaimKind, subjectKey: string, claimCode: string, extras: Record<string, unknown> = {}) => ({
    key, kind, subjectKey, claimCode, periodStart: period.start, periodEnd: period.end, proof, ...extras,
  });
  const assumptions = ["same_period_and_scope"];

  return {
    economicAnalysis,
    dependencies: [
      { key: "admitted_rule", kind: "requires_external_rule_or_schedule", status: "satisfied_by_admitted_evidence", evidenceRefs: [evidenceRef] },
      { key: "merchant_contract", kind: "requires_merchant_pricing_document", status: "required", limitations: ["Merchant contract has not been admitted."] },
    ],
    claims: [
      currentClaim("rewards_population", "driver_population_identity", "rewards", "premium_rewards_population", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("rewards_cost_pool", "driver_cost_pool_relationship", "rewards", "processor_service_cost_pool", { chargeRefs: [statementCharge.id], costBucketKind: costBucket.kind }),
      currentClaim("rewards_share", "driver_share_basis", "rewards", "observed_population_and_cost_pool_shares", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("keyed_population", "driver_population_identity", "keyed", "keyed_card_not_present_population", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("keyed_cost_pool", "driver_cost_pool_relationship", "keyed", "processor_service_cost_pool", { chargeRefs: [statementCharge.id], costBucketKind: costBucket.kind }),
      currentClaim("regulated_population", "driver_population_identity", "regulated", "regulated_debit_population", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("regulated_cost_pool", "driver_cost_pool_relationship", "regulated", "processor_service_cost_pool", { chargeRefs: [statementCharge.id], costBucketKind: costBucket.kind }),
      currentClaim("overlap_claim", "attribution_relationship", "rewards_keyed_overlap", "overlaps_with", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("cf_attribution_claim", "attribution_relationship", "keyed_counterfactual_attribution", "counterfactual_attribution", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("keyed_target", "counterfactual_target", "keyed_delta", "observed_keyed_cost", { populationRefs: [pricingPopulationRef], chargeRefs: [statementCharge.id] }),
      currentClaim("keyed_condition", "counterfactual_alternative_condition", "keyed_delta", "admitted_merchant_controlled_acceptance_method", { populationRefs: [pricingPopulationRef], pricingComponentRefs: [pricingComponentRef] }),
      currentClaim("keyed_assumption", "counterfactual_assumption", "keyed_delta", assumptions[0]!, { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("merchant_change_right", "merchant_change_right", "pricing_change", "merchant_pricing_term_change_right", { chargeRefs: [statementCharge.id], roleClaimRefs: [negotiator.id], participantRefs: [merchant.id] }),
      currentClaim("refund_population", "refund_population", "refund", "refund_population", { populationRefs: [facts.refundVolume.id, facts.refundTransactionCount.id], occurrenceRefs: [occurrenceRef] }),
      currentClaim("refund_underlying", "refund_underlying_cost_return", "refund", "mixed_by_scope", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("refund_basis", "refund_percentage_basis", "refund", "gross_sales", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("refund_scope", "refund_scope", "refund", "admitted_refund_scope", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("gateway_charge", "service_charge_observed", "gateway_service", "gateway_charge_observed", { chargeRefs: [statementCharge.id], occurrenceRefs: [occurrenceRef] }),
      ...([
        ["program_fees", "statement_observed_processor_fees", money(10000)],
        ["program_revenue", "consumer_facing_revenue", money(8000)],
        ["program_retained", "merchant_retained_amount", money(6000)],
        ["program_third_party", "third_party_retention", money(2000)],
        ["program_offsets", "offsets", money(0)],
      ] as const).map(([key, scopeCode, moneyValue]) => currentClaim(key, "pricing_program_flow", "dual_pricing", scopeCode,
        { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef], scopeCode, moneyValue })),
      { key: "future_notice_term", kind: "future_notice_term", subjectKey: "future_notice", claimCode: "future_network_fee_candidate",
        occurrenceRefs: [noticeOccurrenceRef], periodStart: "2027-01-01", periodEnd: "2027-01-01", proof: supportedProof(noticeEvidenceRef) },
      currentClaim("keyed_signal_association", "operational_association", "keyed_signal", "keyed_activity_observed", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("theme_rewards", "theme_contribution", "cost_driver_theme_a", "THEME_PREMIUM_REWARDS_MAJOR_COST_DRIVER", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("theme_regulated", "theme_contribution", "cost_driver_theme_b", "THEME_REGULATED_DEBIT_LOWERS_UNDERLYING_COST", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
      currentClaim("theme_operations", "theme_contribution", "operations_theme", "THEME_KEYED_DOWNGRADE_POPULATIONS_REQUIRE_REVIEW", { populationRefs: [pricingPopulationRef], occurrenceRefs: [occurrenceRef] }),
    ],
    calculations: [
      { key: "rewards_share_calculation", kind: "driver_share", subjectKey: "rewards", inputClaimKeys: ["rewards_share"],
        populationRefs: [pricingPopulationRef], allocationShares: ["0.4", "0.6"], periodStart: period.start, periodEnd: period.end, proof },
      { key: "keyed_delta_calculation", kind: "counterfactual_exact_delta", subjectKey: "keyed_delta",
        populationRefs: [pricingPopulationRef], inputClaimKeys: ["keyed_target", "keyed_condition", "keyed_assumption"],
        inputAmounts: [money(350), money(225)], resultAmount: money(125), periodStart: period.start, periodEnd: period.end, proof },
      { key: "dual_pricing_net_calculation", kind: "pricing_program_net_burden", subjectKey: "dual_pricing",
        populationRefs: [pricingPopulationRef], inputClaimKeys: ["program_fees", "program_revenue", "program_retained", "program_third_party", "program_offsets"],
        inputAmounts: [money(10000), money(8000), money(6000), money(2000), money(0)], resultAmount: money(4000),
        periodStart: period.start, periodEnd: period.end, proof },
    ],
    drivers: [
      { key: "rewards", driverType: "premium_rewards_mix", populationRefs: [pricingPopulationRef], populationPredicateCode: "premium_rewards_population",
        sourceOccurrenceRefs: [occurrenceRef], economicChargeRefs: [statementCharge.id], pricingComponentRefs: [pricingComponentRef],
        observedVolume: money(40000), observedCount: 40, observedCost: money(900), attributionMethod: "overlapping_declared",
        relevantCostPoolRef: costBucket.kind, shareOfPopulation: "0.4", shareOfRelevantCostPool: "0.6", relationshipKeys: ["rewards_keyed_overlap"],
        populationClaimKey: "rewards_population", costPoolClaimKey: "rewards_cost_pool", shareClaimKey: "rewards_share",
        shareCalculationKey: "rewards_share_calculation", proof },
      { key: "keyed", driverType: "keyed_card_not_present", populationRefs: [pricingPopulationRef], populationPredicateCode: "keyed_card_not_present_population",
        sourceOccurrenceRefs: [occurrenceRef], economicChargeRefs: [statementCharge.id], pricingComponentRefs: [pricingComponentRef],
        observedVolume: money(15000), observedCount: 20, observedCost: money(350), attributionMethod: "counterfactual_delta",
        relevantCostPoolRef: costBucket.kind, relationshipKeys: ["rewards_keyed_overlap", "keyed_counterfactual_attribution"], counterfactualKey: "keyed_delta",
        populationClaimKey: "keyed_population", costPoolClaimKey: "keyed_cost_pool", proof },
      { key: "regulated", driverType: "regulated_debit", populationRefs: [pricingPopulationRef], populationPredicateCode: "regulated_debit_population",
        sourceOccurrenceRefs: [occurrenceRef], economicChargeRefs: [statementCharge.id], observedVolume: money(50000), observedCount: 60,
        observedCost: money(250), attributionMethod: "exclusive_partition", relevantCostPoolRef: costBucket.kind,
        relationshipKeys: ["keyed_counterfactual_attribution"], populationClaimKey: "regulated_population", costPoolClaimKey: "regulated_cost_pool", proof },
    ],
    attributionRelationships: [
      { key: "rewards_keyed_overlap", relationshipType: "overlaps_with", driverKeys: ["rewards", "keyed"], additiveAggregationAllowed: true, relationshipClaimKey: "overlap_claim", proof },
      { key: "keyed_counterfactual_attribution", relationshipType: "counterfactual_attribution", driverKeys: ["keyed", "regulated"], additiveAggregationAllowed: false, relationshipClaimKey: "cf_attribution_claim", proof },
    ],
    counterfactuals: [{
      key: "keyed_delta", observedPopulationRefs: [pricingPopulationRef], observedChargeRefs: [statementCharge.id], observedCost: money(350),
      alternativePopulationRefs: [pricingPopulationRef], alternativeEvidenceRefs: [evidenceRef], populationCompatibility: "compatible",
      assumptions, baselinePeriod: `${period.start}/${period.end}`, impactPeriod: `${period.start}/${period.end}`,
      relationshipKeys: ["keyed_counterfactual_attribution"], requestedResultState: "exact_deterministic_delta", exactDelta: money(125),
      targetClaimKey: "keyed_target", alternativeConditionClaimKey: "keyed_condition", assumptionClaimKeys: ["keyed_assumption"],
      calculationKey: "keyed_delta_calculation", proof,
    }],
    merchantLevers: [{
      key: "pricing_change", leverType: "pricing_term_change", requestedState: "eligible_supported", driverKeys: ["keyed"],
      chargeRefs: [statementCharge.id], counterfactualKey: "keyed_delta", controlRoleRefs: [negotiator.id],
      requiredControlDimensions: ["negotiator_change_authority"], merchantInfluenceClaimKey: "merchant_change_right",
      safeActionCode: "verify_admitted_pricing_term_change_variable", prohibitedClaimCodes: ["CUSTOMER_SAVINGS_PROMISE", "REMOVE_FEE_COMMAND"], proof,
    }],
    refundEconomics: {
      requestedStatus: "supported", refundVolumeFactRef: facts.refundVolume.id, refundCountFactRef: facts.refundTransactionCount.id,
      pricingPopulationRefs: [pricingPopulationRef], sourceOccurrenceRefs: [occurrenceRef], returnFeeChargeRefs: [], retainedFeeChargeRefs: [],
      underlyingCostReturnState: "mixed_by_scope", processorPricingReturnState: "unresolved", percentagePricingBasis: "gross_sales",
      populationClaimKey: "refund_population", underlyingCostReturnClaimKey: "refund_underlying", percentageBasisClaimKey: "refund_basis", scopeClaimKey: "refund_scope", proof,
    },
    amexEconomics: {
      requestedStatus: "unresolved", acceptanceMode: "optblue_like", acceptanceModeMappingRef: null,
      pricingPopulationRefs: [pricingPopulationRef], duplicateVolumeLinkageRefs: [], observedChargeRefs: [statementCharge.id],
      marginChargeRefs: [], requestedMarginState: "proven", ownershipRoleRefs: [], proof,
    },
    accountServices: [{ key: "gateway_service", serviceType: "gateway", state: "charge_observed_usage_unknown", chargeRefs: [statementCharge.id],
      participantRoleRefs: [], usageEvidenceRefs: [], potentiallyDuplicativeWithRefs: [], chargeClaimKey: "gateway_charge", proof }],
    merchantPricingPrograms: [{
      key: "dual_pricing", programType: "dual_pricing", requestedStatus: "supported", coveredPopulationRefs: [pricingPopulationRef],
      statementObservedProcessorFees: money(10000), consumerFacingRevenue: money(8000), merchantRetainedAmount: money(6000),
      thirdPartyRetention: money(2000), offsets: money(0), netMerchantBorneCost: money(4000), netBurdenCalculationRef: null,
      flowClaimKeys: ["program_fees", "program_revenue", "program_retained", "program_third_party", "program_offsets"],
      netBurdenCalculationKey: "dual_pricing_net_calculation", refundTreatment: "unresolved", proof,
    }],
    offStatementExposures: [{ key: "equipment_lease", exposureType: "equipment_lease", state: "unknown_whether_exists", observedAmount: null,
      sourceOccurrenceRefs: [], proof: unresolvedProof("Off-statement equipment evidence is unavailable.") }],
    notices: [{ key: "future_notice", sourceOccurrenceRefs: [noticeOccurrenceRef], noticeDate: "2025-01-15", claimedEffectiveDate: "2027-01-01",
      claimType: "claimed_network_rule", verificationState: "not_independently_verified", requestedPeriodApplicability: "current",
      candidateEconomicChangeCode: "future_network_fee_candidate", termClaimKey: "future_notice_term", proof: supportedProof(noticeEvidenceRef) }],
    operationalSignals: [{ key: "keyed_signal", signalType: "keyed_cnp", requestedStatus: "supported", populationRefs: [pricingPopulationRef],
      observedValueCode: "keyed_activity_observed", strength: "medium", causalStatus: "observed_only", economicDriverKeys: ["keyed"],
      associationClaimKey: "keyed_signal_association", proof }],
    accountRisk: {
      requestedState: "descriptive_ratios_available", disputeDebitAmountFactRef: facts.chargebackPrincipalDebitAmount.id,
      disputeDebitCountFactRef: facts.chargebackCount.id, representmentAmountFactRef: facts.chargebackRepresentmentAmount.id,
      feeChargeRefs: economicAnalysis.economicLayer.charges.filter((item) => item.subtype === "chargeback_fee").map((item) => item.id),
      countDenominatorFactRef: facts.grossSaleTransactionCount.id, valueDenominatorFactRef: facts.grossSaleVolume.id,
      denominatorCompatibility: "unresolved", monitoringStatus: "unresolved", proof,
    },
    themes: [
      { key: "cost_driver_theme_a", claimKey: "theme_rewards", economicQuestionCode: "major_processing_mix_driver", actionBoundaryCode: "explanation_only",
        themeType: "major_economic_driver", driverKeys: ["rewards"], materiality: "material", actionabilityState: "unresolved",
        priorityClass: "material_economics", semanticCoverageCodes: ["THEME_PREMIUM_REWARDS_MAJOR_COST_DRIVER"], proof },
      { key: "cost_driver_theme_b", claimKey: "theme_regulated", economicQuestionCode: "major_processing_mix_driver", actionBoundaryCode: "explanation_only",
        themeType: "major_economic_driver", driverKeys: ["regulated"], materiality: "material", actionabilityState: "unresolved",
        priorityClass: "material_economics", semanticCoverageCodes: ["THEME_REGULATED_DEBIT_LOWERS_UNDERLYING_COST"], proof },
      { key: "operations_theme", claimKey: "theme_operations", economicQuestionCode: "keyed_operational_signal", actionBoundaryCode: "review_only",
        themeType: "operational_signal", driverKeys: ["keyed"], signalKeys: ["keyed_signal"], leverKeys: ["pricing_change"],
        materiality: "contextual", actionabilityState: "eligible_supported", priorityClass: "operational_review",
        semanticCoverageCodes: ["THEME_KEYED_DOWNGRADE_POPULATIONS_REQUIRE_REVIEW"], proof },
    ],
    demonstratedAmendments: [
      { id: "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY", synthesisKeys: ["rewards"] },
      { id: "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION", synthesisKeys: ["rewards_keyed_overlap"] },
      { id: "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL", synthesisKeys: ["keyed_delta"] },
      { id: "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER", synthesisKeys: ["pricing_change"] },
      { id: "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS", synthesisKeys: ["dual_pricing"] },
      { id: "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION", synthesisKeys: ["future_notice"] },
      { id: "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY", synthesisKeys: ["keyed_signal"] },
      { id: "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS", synthesisKeys: ["cost_driver_theme_a"] },
    ],
  };
}

export function buildSynthesis(input: BuildCanonicalEconomicsV2SynthesisInput = synthesisInput()): CanonicalEconomicsV2SynthesisAnalysis {
  return buildCanonicalEconomicsV2SynthesisAnalysis(input);
}

export function supportedProof(evidenceRef: string): CanonicalSynthesisProofAdmission {
  return { derivabilityTier: "stated_on_statement", evidenceClass: "statement_confirmed", assertionBasis: "source_fact",
    confidence: "unavailable", evidenceRefs: [evidenceRef] };
}

export function unresolvedProof(reason: string): CanonicalSynthesisProofAdmission {
  return { derivabilityTier: "unresolved", evidenceClass: "unresolved", assertionBasis: "source_fact",
    confidence: "unavailable", evidenceRefs: [], limitations: [reason] };
}

export function baselineEconomics(): CanonicalEconomicsV2EconomicAnalysis { return buildApprovedEconomics(); }
