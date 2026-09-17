import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "./authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import type { CommercialDecompositionContractV1, CommercialDecompositionRowV1 } from "./commercialDecompositionContractV1.js";
import {
  evaluateCommercialPredicateV1,
  sameOfferIdentity,
  type CommercialEffectivePeriodV1,
  type CommercialOfferCompositionVersionV1,
  type CommercialPriceComponentVersionV1,
  type CommercialPublicPolicyVersionV1,
  type CommercialSourceGovernanceRegistryV1,
} from "./commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "./helcimDharmaCommercialSourceBatch1BV1.js";
import type { InternalCommercialComparisonFindingV1 } from "./internalCommercialComparisonFindingV1.js";
import type {
  RuntimeCommercialComparisonAttachmentV1,
  RuntimeCommercialComparisonAttemptV1,
  RuntimeCurrentCommercialComponentV1,
} from "./runtimeCommercialComparisonAttachmentV1.js";

export const MERCHANT_COMMERCIAL_FINDING_PERMISSION_PROJECTION_V1 =
  "merchant_commercial_finding_permission_projection_2026_09_11_v1" as const;

export const MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1 = {
  document: "RateReveal Merchant-Facing Commercial Finding Boundary FINAL — Product-Adjudicated v1",
  sha256: "f9315f96ef56b0a52ce60750c9e1ea2b27cc6566624a5da3a0c49e95ffc83093",
} as const;

export type MerchantCommercialComponentClassV1 = "variable" | "fixed_monthly" | "episodic" | "unsupported";
export type MerchantCommercialGateStateV1 = "matched" | "mismatch" | "unknown";
export type MerchantCommercialControlStateV1 =
  | "exact_provider_controlled"
  | "network_or_pass_through"
  | "shared_or_bundled"
  | "unresolved_controller"
  | "upper_bound_only";
export type MerchantCommercialDenominatorStateV1 = "exact" | "zero" | "unknown" | "bounded" | "incomplete";
export type MerchantCommercialPolicyStateV1 =
  | "publicly_prohibited"
  | "restricted_or_review_required"
  | "no_known_public_block"
  | "public_policy_unknown";
export type MerchantCommercialApprovalStateV1 = "merchant_specific_approved" | "approval_unknown";
export type MerchantCommercialOffsetStateV1 =
  | "complete_non_reversing"
  | "complete_reversing"
  | "incomplete"
  | "not_applicable";

export type MerchantCommercialProjectionCandidateV1 = {
  candidateId: string;
  presentationGroupId: string;
  internalFinding: InternalCommercialComparisonFindingV1;
  current: {
    componentRef: string | null;
    componentLabel: string;
    serviceIdentity: string | null;
    economicLayer: string | null;
    unit: string | null;
    billingBasis: string | null;
    populationIdentity: string | null;
    channel: string | null;
    amountState: "exact" | "upper_bound" | "unknown";
    amountMinor: number | null;
    controlState: MerchantCommercialControlStateV1;
    evidenceRefs: string[];
  };
  alternative: {
    componentRef: string | null;
    provider: string;
    offer: string;
    distributionIdentity: string;
    serviceIdentity: string | null;
    economicLayer: string | null;
    unit: string | null;
    billingBasis: string | null;
    populationIdentity: string | null;
    channel: string | null;
    amountState: "exact" | "unknown";
    amountMinor: number | null;
    evidenceRefs: string[];
  };
  matchedPopulationCount: number | null;
  matchedPopulationEvidenceRefs: string[];
  revalidation: {
    currentComponent: MerchantCommercialGateStateV1;
    alternativeComponent: MerchantCommercialGateStateV1;
    population: MerchantCommercialGateStateV1;
    economicLayer: MerchantCommercialGateStateV1;
    serviceIdentity: MerchantCommercialGateStateV1;
    unitBillingBasis: MerchantCommercialGateStateV1;
    channel: MerchantCommercialGateStateV1;
    statementPeriod: MerchantCommercialGateStateV1;
    offerIdentity: MerchantCommercialGateStateV1;
    decompositionControl: MerchantCommercialGateStateV1;
  };
  componentClass: MerchantCommercialComponentClassV1;
  cadence: "monthly" | "current_period_only" | "unknown";
  observedEventCount: number | null;
  providerControlledCost: { state: MerchantCommercialDenominatorStateV1; amountMinor: number | null };
  applicability: {
    publicPolicy: MerchantCommercialPolicyStateV1;
    approval: MerchantCommercialApprovalStateV1;
  };
  offsets: {
    state: MerchantCommercialOffsetStateV1;
    evidenceRefs: string[];
  };
  qualitativeDisplayReasonApproved: boolean;
};

export type MerchantCommercialFindingDecisionV1 = {
  candidateId: string;
  presentationGroupId: string;
  findingValidity: "valid" | "invalid";
  comparisonValidity: "valid_exact" | "valid_bounded" | "not_a_comparison" | "unavailable";
  visibility: {
    permitted: boolean;
    mode: "hidden" | "explain" | "verify" | "comparison" | "comparison_unavailable";
  };
  action: {
    permitted: boolean;
    type: "REVIEW_CURRENT_PRICING" | "NONE";
  };
  materiality: {
    state: "not_applicable" | "below_noise_floor" | "explain_only" | "review_threshold_met" | "cannot_evaluate";
    absoluteDifferenceMinor: number | null;
    relativeBasisPoints: number | null;
  };
  direction: "current_costs_more" | "current_costs_less" | "equal" | "bounded_alternative_costs_more" | "unresolved";
  namedAlternativePermitted: boolean;
  internalSignalIgnored: true;
  reasonCodes: string[];
  evidenceRefs: string[];
  customerSafeRecord: MerchantSafeCommercialFindingV1 | null;
};

export type MerchantSafeCommercialFindingV1 = {
  displayMode: "explain" | "verify" | "comparison" | "comparison_unavailable";
  title: string;
  summary: string;
  component: string;
  alternative: { provider: string; offer: string } | null;
  matchedActivity: string | null;
  comparableComponentDifference: { amountMinor: number; currency: "USD"; direction: "current_more" | "alternative_more" } | null;
  comparisonBlocker: string | null;
  smallestUnlocker: string | null;
  conditions: string[];
  scopeNote: string;
  merchantAction: { type: "EXPLAIN" | "VERIFY" | "REVIEW_CURRENT_PRICING"; text: string };
};

export type MerchantCommercialFindingShadowProjectionV1 = {
  projectionVersion: typeof MERCHANT_COMMERCIAL_FINDING_PERMISSION_PROJECTION_V1;
  productAuthority: typeof MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1;
  mode: "shadow_offline";
  realCustomerRoutingAllowed: false;
  decisions: MerchantCommercialFindingDecisionV1[];
  customerSafeProjection: {
    findings: MerchantSafeCommercialFindingV1[];
    reportLimitation: string | null;
  };
  permissions: {
    customerReportRoutingAllowed: false;
    marketVerdictAllowed: false;
    gradeAllowed: false;
    overpaymentAllowed: false;
    savingsAllowed: false;
    annualizationAllowed: false;
    switchingAllowed: false;
    providerRankingAllowed: false;
    canonicalMutationAllowed: false;
    sourceMutationAllowed: false;
    aiOrWebResearchAllowed: false;
    newKnowledgeAdmissionAllowed: false;
  };
};

const DEFAULT_REGISTRIES = [
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
] as const;

export function projectMerchantCommercialCandidatesV1(input: {
  candidates: MerchantCommercialProjectionCandidateV1[];
}): MerchantCommercialFindingShadowProjectionV1 {
  const evaluatedDecisions = input.candidates.map(evaluateMerchantCommercialFindingCandidateV1);
  const decisions = applyMerchantBlockerProjectionRule(input.candidates, evaluatedDecisions);
  enforceDirectionalFairness(decisions);
  const safe = decisions.flatMap((decision) => decision.customerSafeRecord ? [decision.customerSafeRecord] : []);
  const comparisonLimited = evaluatedDecisions.some((decision) => decision.visibility.mode === "comparison_unavailable")
    || input.candidates.some((candidate) => candidate.offsets.state === "incomplete");
  const projection: MerchantCommercialFindingShadowProjectionV1 = {
    projectionVersion: MERCHANT_COMMERCIAL_FINDING_PERMISSION_PROJECTION_V1,
    productAuthority: MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1,
    mode: "shadow_offline",
    realCustomerRoutingAllowed: false,
    decisions,
    customerSafeProjection: {
      findings: safe,
      reportLimitation: comparisonLimited
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
  const copyErrors = validateMerchantSafeCommercialProjectionV1(projection.customerSafeProjection);
  if (copyErrors.length > 0) throw new Error(`merchant_commercial_copy_invalid:${copyErrors.join(",")}`);
  return deepFreeze(projection);
}

function applyMerchantBlockerProjectionRule(
  candidates: MerchantCommercialProjectionCandidateV1[],
  decisions: MerchantCommercialFindingDecisionV1[],
): MerchantCommercialFindingDecisionV1[] {
  const seenUsefulUnlockers = new Set<string>();
  return decisions.map((decision, index) => {
    if (decision.visibility.mode !== "comparison_unavailable") return decision;
    const candidate = candidates[index]!;
    const usefulUnlockerKey = distinctMerchantUsefulUnlockerKey(candidate, decision);
    if (usefulUnlockerKey === null) return suppressMerchantBlocker(decision, "merchant_projection_report_limitation_only");
    if (seenUsefulUnlockers.has(usefulUnlockerKey)) return suppressMerchantBlocker(decision, "merchant_projection_equivalent_blocker_consolidated");
    seenUsefulUnlockers.add(usefulUnlockerKey);
    return decision;
  });
}

function distinctMerchantUsefulUnlockerKey(
  candidate: MerchantCommercialProjectionCandidateV1,
  decision: MerchantCommercialFindingDecisionV1,
): string | null {
  const failedGate = Object.entries(candidate.revalidation).find(([, state]) => state !== "matched")?.[0] ?? null;
  if (failedGate === "population") return "exact_billing_population";
  if (failedGate === "channel") return "payment_channel_population_split";
  if (failedGate === "serviceIdentity") return "service_use_or_identity";
  if (failedGate === "unitBillingBasis") return "exact_billing_basis";
  if (failedGate !== null) return null;
  if (decision.reasonCodes.includes("public_policy_unknown")) return "merchant_specific_approval_or_quote";
  if (decision.reasonCodes.includes("comparison_amount_state_mismatch")) return "exact_component_amount";
  const unlocker = candidate.internalFinding.conclusion.smallestUnlocker?.toLowerCase() ?? "";
  if (/cp\/?cnp|card.present|card.not.present|channel split/.test(unlocker)) return "payment_channel_population_split";
  if (/population|billed activity|transaction split|event count/.test(unlocker)) return "exact_billing_population";
  if (/approval|approved|merchant.specific quote|account quote/.test(unlocker)) return "merchant_specific_approval_or_quote";
  if (/billing basis|gross volume|net volume|submitted volume|refund.adjusted/.test(unlocker)) return "exact_billing_basis";
  if (/service use|service identity/.test(unlocker)) return "service_use_or_identity";
  return null;
}

function suppressMerchantBlocker(
  decision: MerchantCommercialFindingDecisionV1,
  disposition: "merchant_projection_report_limitation_only" | "merchant_projection_equivalent_blocker_consolidated",
): MerchantCommercialFindingDecisionV1 {
  return {
    ...decision,
    visibility: { permitted: false, mode: "hidden" },
    namedAlternativePermitted: false,
    reasonCodes: unique([...decision.reasonCodes, disposition]),
    customerSafeRecord: null,
  };
}

export function evaluateMerchantCommercialFindingCandidateV1(
  candidate: MerchantCommercialProjectionCandidateV1,
): MerchantCommercialFindingDecisionV1 {
  const finding = candidate.internalFinding;
  const comparisonKind = finding.findingKind === "MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON";
  const evidenceOnly = finding.findingKind === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE"
    || finding.findingKind === "COMMERCIAL_FACT_IDENTITY_EVIDENCE";
  const blocked = finding.findingKind === "COMPARISON_UNAVAILABLE_BLOCKER";
  const reasonCodes: string[] = [];
  const requiredGates = Object.entries(candidate.revalidation).filter(([, state]) => state !== "matched");
  const comparisonBindingComplete = candidate.current.evidenceRefs.length > 0
    && candidate.alternative.evidenceRefs.length > 0
    && candidate.matchedPopulationEvidenceRefs.length > 0;
  const analyticalBindingComplete = finding.evidenceRefs.length > 0;
  if (comparisonKind && !comparisonBindingComplete) reasonCodes.push("evidence_binding_incomplete");
  if ((evidenceOnly || blocked) && !analyticalBindingComplete) reasonCodes.push("analytical_evidence_binding_incomplete");
  for (const [gate, state] of requiredGates) reasonCodes.push(`${gate}_${state}`);

  const rawComparisonValidity = blocked
    ? "unavailable" as const
    : evidenceOnly || !comparisonKind
      ? "not_a_comparison" as const
      : finding.economics.matchedComponentDifference.state === "DIRECTIONAL_BOUND"
        ? "valid_bounded" as const
        : finding.economics.matchedComponentDifference.state === "EXACT"
          ? "valid_exact" as const
          : "unavailable" as const;
  const amountShapeValid = rawComparisonValidity === "valid_exact"
    ? candidate.current.amountState === "exact" && candidate.alternative.amountState === "exact"
    : rawComparisonValidity === "valid_bounded"
      ? candidate.current.amountState === "upper_bound" && candidate.alternative.amountState === "exact"
      : true;
  if (!amountShapeValid) reasonCodes.push("comparison_amount_state_mismatch");
  const validComparison = comparisonKind && comparisonBindingComplete && requiredGates.length === 0
    && amountShapeValid
    && (rawComparisonValidity === "valid_exact" || rawComparisonValidity === "valid_bounded");
  const comparisonValidity = comparisonKind && !validComparison ? "unavailable" as const : rawComparisonValidity;

  if (candidate.applicability.publicPolicy === "publicly_prohibited") reasonCodes.push("publicly_prohibited");
  if (candidate.applicability.publicPolicy === "public_policy_unknown") reasonCodes.push("public_policy_unknown");
  if (candidate.applicability.publicPolicy === "restricted_or_review_required") reasonCodes.push("public_review_required");
  if (candidate.applicability.approval === "approval_unknown") reasonCodes.push("merchant_approval_unknown");
  if (candidate.offsets.state === "complete_reversing") reasonCodes.push("known_offsets_reverse_direction");
  if (candidate.offsets.state === "incomplete") reasonCodes.push("commercial_scope_incomplete");

  const policyNamesAlternative = candidate.applicability.publicPolicy !== "publicly_prohibited"
    && (candidate.applicability.publicPolicy !== "public_policy_unknown"
      || candidate.applicability.approval === "merchant_specific_approved");
  const materiality = materialityFor(candidate, comparisonValidity);
  const direction = directionFor(finding);
  const findingValidity = blocked || evidenceOnly ? (analyticalBindingComplete ? "valid" : "invalid") : validComparison ? "valid" : "invalid";

  let visibility: MerchantCommercialFindingDecisionV1["visibility"] = { permitted: false, mode: "hidden" };
  if (blocked && !analyticalBindingComplete) {
    visibility = { permitted: false, mode: "hidden" };
  } else if (blocked || comparisonValidity === "unavailable") {
    visibility = candidate.applicability.publicPolicy === "publicly_prohibited"
      ? { permitted: false, mode: "hidden" }
      : { permitted: true, mode: "comparison_unavailable" };
  } else if (evidenceOnly && analyticalBindingComplete) {
    visibility = finding.findingKind === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE"
      ? { permitted: true, mode: "verify" }
      : { permitted: true, mode: "explain" };
  } else if (validComparison && !policyNamesAlternative) {
    visibility = candidate.applicability.publicPolicy === "publicly_prohibited"
      ? { permitted: false, mode: "hidden" }
      : { permitted: true, mode: "comparison_unavailable" };
  } else if (validComparison && materiality.state === "below_noise_floor" && !candidate.qualitativeDisplayReasonApproved) {
    visibility = { permitted: false, mode: "hidden" };
  } else if (validComparison && (candidate.offsets.state === "complete_reversing" || candidate.offsets.state === "incomplete")) {
    visibility = { permitted: true, mode: "explain" };
  } else if (validComparison && candidate.applicability.publicPolicy === "restricted_or_review_required"
    && candidate.applicability.approval !== "merchant_specific_approved") {
    visibility = { permitted: true, mode: "verify" };
  } else if (validComparison) {
    visibility = { permitted: true, mode: "comparison" };
  }

  const exactProviderControl = candidate.current.controlState === "exact_provider_controlled";
  const exactDenominator = candidate.providerControlledCost.state === "exact"
    && (candidate.providerControlledCost.amountMinor ?? 0) > 0;
  const offsetsPermitAction = candidate.offsets.state === "complete_non_reversing"
    || candidate.offsets.state === "not_applicable";
  const actionPermitted = validComparison
    && comparisonValidity === "valid_exact"
    && direction === "current_costs_more"
    && exactProviderControl
    && exactDenominator
    && offsetsPermitAction
    && (candidate.applicability.publicPolicy === "no_known_public_block"
      || candidate.applicability.approval === "merchant_specific_approved")
    && materiality.state === "review_threshold_met";
  if (finding.action.signal === "REVIEW_CURRENT_PRICING") reasonCodes.push("internal_review_signal_ignored_and_recomputed");
  if (!exactProviderControl) reasonCodes.push("provider_control_not_exact");
  if (!exactDenominator) reasonCodes.push("provider_cost_denominator_not_exact");

  const decision: MerchantCommercialFindingDecisionV1 = {
    candidateId: candidate.candidateId,
    presentationGroupId: candidate.presentationGroupId,
    findingValidity,
    comparisonValidity,
    visibility,
    action: { permitted: actionPermitted, type: actionPermitted ? "REVIEW_CURRENT_PRICING" : "NONE" },
    materiality,
    direction,
    namedAlternativePermitted: visibility.permitted && policyNamesAlternative,
    internalSignalIgnored: true,
    reasonCodes: unique(reasonCodes),
    evidenceRefs: unique([
      ...finding.evidenceRefs,
      ...candidate.current.evidenceRefs,
      ...candidate.alternative.evidenceRefs,
      ...candidate.matchedPopulationEvidenceRefs,
      ...candidate.offsets.evidenceRefs,
    ]),
    customerSafeRecord: null,
  };
  decision.customerSafeRecord = customerSafeRecord(candidate, decision);
  return deepFreeze(decision);
}

export function buildMerchantCommercialFindingShadowProjectionFromRuntimeV1(input: {
  attachment: RuntimeCommercialComparisonAttachmentV1;
  decomposition: CommercialDecompositionContractV1;
  registries?: CommercialSourceGovernanceRegistryV1[];
}): MerchantCommercialFindingShadowProjectionV1 {
  const registries = input.registries ?? [...DEFAULT_REGISTRIES];
  const candidates = input.attachment.attempts.map((attempt) => candidateFromRuntime(
    attempt,
    input.attachment,
    input.decomposition,
    registries,
  ));
  return projectMerchantCommercialCandidatesV1({
    candidates,
  });
}

export function validateMerchantSafeCommercialProjectionV1(value: unknown): string[] {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /\b(?:package|registry|source governance|hash|runtime|canonical|internal|policy implementation|evidence ref)\b/i,
    /\b(?:savings?|overpay(?:ing|ment)?|above.market|below.market|expensive|cheap|switch(?:ing)?|ranking|best provider)\b/i,
    /(?:\/(?:Users|private|tmp|var)\/|[a-z]:\\)/i,
    /\b[a-f0-9]{32,}\b/i,
  ];
  return forbidden.flatMap((pattern, index) => pattern.test(serialized) ? [`forbidden_customer_content_${index + 1}`] : []);
}

function materialityFor(
  candidate: MerchantCommercialProjectionCandidateV1,
  comparisonValidity: MerchantCommercialFindingDecisionV1["comparisonValidity"],
): MerchantCommercialFindingDecisionV1["materiality"] {
  if (comparisonValidity !== "valid_exact") {
    return { state: comparisonValidity === "valid_bounded" ? "explain_only" : "not_applicable", absoluteDifferenceMinor: null, relativeBasisPoints: null };
  }
  const difference = candidate.internalFinding.economics.matchedComponentDifference.currentMinusAlternativeMinor;
  if (difference === null) return { state: "cannot_evaluate", absoluteDifferenceMinor: null, relativeBasisPoints: null };
  const absolute = Math.abs(difference);
  const denominator = candidate.providerControlledCost;
  const relative = denominator.state === "exact" && (denominator.amountMinor ?? 0) > 0
    ? Math.floor((absolute * 10_000) / denominator.amountMinor!)
    : null;
  if (candidate.componentClass === "unsupported") return { state: "cannot_evaluate", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  if (candidate.componentClass === "variable" && absolute < 1_000) return { state: "below_noise_floor", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  if (candidate.componentClass === "fixed_monthly" && absolute <= 1_000) return { state: "below_noise_floor", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  if (difference <= 0 || denominator.state !== "exact" || (denominator.amountMinor ?? 0) <= 0) {
    return { state: "explain_only", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  }
  const relativePass = (basisPoints: number) => absolute * 10_000 >= denominator.amountMinor! * basisPoints;
  if (candidate.componentClass === "variable") {
    return { state: absolute >= 4_000 && relativePass(600) ? "review_threshold_met" : "explain_only", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  }
  if (candidate.componentClass === "fixed_monthly") {
    if (candidate.cadence !== "monthly") return { state: "cannot_evaluate", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
    return { state: absolute >= 3_000 && relativePass(200) ? "review_threshold_met" : "explain_only", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  }
  if (candidate.observedEventCount === null) return { state: "cannot_evaluate", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
  return { state: candidate.observedEventCount >= 15 && relativePass(1_000) ? "review_threshold_met" : "explain_only", absoluteDifferenceMinor: absolute, relativeBasisPoints: relative };
}

function directionFor(finding: InternalCommercialComparisonFindingV1): MerchantCommercialFindingDecisionV1["direction"] {
  const difference = finding.economics.matchedComponentDifference;
  if (difference.state === "DIRECTIONAL_BOUND") {
    return (difference.alternativeExceedsCurrentByAtLeastMinor ?? 0) > 0 ? "bounded_alternative_costs_more" : "unresolved";
  }
  if (difference.state !== "EXACT" || difference.currentMinusAlternativeMinor === null) return "unresolved";
  if (difference.currentMinusAlternativeMinor > 0) return "current_costs_more";
  if (difference.currentMinusAlternativeMinor < 0) return "current_costs_less";
  return "equal";
}

function customerSafeRecord(
  candidate: MerchantCommercialProjectionCandidateV1,
  decision: MerchantCommercialFindingDecisionV1,
): MerchantSafeCommercialFindingV1 | null {
  if (!decision.visibility.permitted || decision.visibility.mode === "hidden") return null;
  const name = decision.namedAlternativePermitted
    ? { provider: candidate.alternative.provider, offer: candidate.alternative.offer }
    : null;
  const difference = candidate.internalFinding.economics.matchedComponentDifference;
  const exact = difference.state === "EXACT" && difference.currentMinusAlternativeMinor !== null
    ? {
        amountMinor: Math.abs(difference.currentMinusAlternativeMinor),
        currency: "USD" as const,
        direction: difference.currentMinusAlternativeMinor >= 0 ? "current_more" as const : "alternative_more" as const,
      }
    : difference.state === "DIRECTIONAL_BOUND" && difference.alternativeExceedsCurrentByAtLeastMinor !== null
      ? { amountMinor: difference.alternativeExceedsCurrentByAtLeastMinor, currency: "USD" as const, direction: "alternative_more" as const }
      : null;
  const incomplete = candidate.offsets.state === "incomplete";
  const conditions = unique([
    candidate.applicability.approval === "approval_unknown" && name
      ? `If your business qualifies for and is approved under ${name.offer}, the published terms would apply only to the matched activity.`
      : null,
    candidate.applicability.publicPolicy === "restricted_or_review_required"
      ? "The published offer requires additional business review before availability can be confirmed."
      : null,
  ].filter((item): item is string => item !== null));
  const scopeNote = incomplete
    ? "We can compare this individual component, but we do not have enough complete pricing information to determine whether the alternative would cost more or less across the full relevant pricing scope."
    : candidate.offsets.state === "complete_reversing"
      ? "Other known components in the same scope reverse the direction of the isolated component difference."
      : "This conclusion applies only to the matched component and activity shown here.";
  if (decision.visibility.mode === "comparison_unavailable") {
    const unavailable = comparisonUnavailableDetails(candidate, decision);
    const blocker = merchantSafeText(
      unavailable.blocker,
      candidate,
      decision.namedAlternativePermitted,
    );
    const unlocker = merchantSafeText(
      unavailable.unlocker,
      candidate,
      decision.namedAlternativePermitted,
    );
    return {
      displayMode: "comparison_unavailable",
      title: "A reliable component comparison is not available",
      summary: `RateReveal identified a possible comparison involving ${candidate.current.componentLabel}, but ${lowerFirst(blocker)}`,
      component: candidate.current.componentLabel,
      alternative: null,
      matchedActivity: null,
      comparableComponentDifference: null,
      comparisonBlocker: blocker,
      smallestUnlocker: unlocker,
      conditions: [],
      scopeNote: "This does not mean the current pricing is good or bad.",
      merchantAction: { type: "VERIFY", text: `Confirm ${lowerFirst(withoutTerminalPunctuation(unlocker))} before relying on a comparison.` },
    };
  }
  const action = decision.action.permitted
    ? { type: "REVIEW_CURRENT_PRICING" as const, text: "Ask the current provider to review this specific pricing component." }
    : decision.visibility.mode === "verify"
      ? { type: "VERIFY" as const, text: "Confirm the remaining business or account condition before relying on this information." }
      : { type: "EXPLAIN" as const, text: "Use this information to understand the specific component; no pricing-review priority is recommended." };
  const summary = decision.comparisonValidity === "not_a_comparison"
    ? merchantSafeText(candidate.internalFinding.conclusion.whatThisProves, candidate, decision.namedAlternativePermitted)
    : differenceSummary(decision, name, exact);
  const evidenceOnly = decision.comparisonValidity === "not_a_comparison";
  return {
    displayMode: decision.visibility.mode,
    title: evidenceOnly
      ? decision.visibility.mode === "verify" ? "A published offer condition needs confirmation" : "Published commercial information"
      : decision.visibility.mode === "verify" ? "A business condition needs confirmation" : "Comparable component information",
    summary,
    component: candidate.current.componentLabel,
    alternative: name,
    matchedActivity: evidenceOnly ? null : candidate.current.populationIdentity,
    comparableComponentDifference: evidenceOnly ? null : exact,
    comparisonBlocker: null,
    smallestUnlocker: null,
    conditions,
    scopeNote: evidenceOnly ? "No current-versus-alternative price comparison was performed." : scopeNote,
    merchantAction: action,
  };
}

function comparisonUnavailableDetails(
  candidate: MerchantCommercialProjectionCandidateV1,
  decision: MerchantCommercialFindingDecisionV1,
): { blocker: string; unlocker: string } {
  const failedGate = Object.entries(candidate.revalidation).find(([, state]) => state !== "matched")?.[0] ?? null;
  const byGate: Record<string, { blocker: string; unlocker: string }> = {
    currentComponent: {
      blocker: "the current statement component is not established strongly enough.",
      unlocker: "The exact current component and its statement evidence.",
    },
    alternativeComponent: {
      blocker: "the published alternative component is not established strongly enough.",
      unlocker: "A published component matching the requested service.",
    },
    population: {
      blocker: "the current and published components do not have the same established billed activity.",
      unlocker: "A supported bridge showing that both prices apply to the same billed activity.",
    },
    economicLayer: {
      blocker: "the components do not have the same established economic layer.",
      unlocker: "Evidence that both components belong to the same gateway or acquiring scope.",
    },
    serviceIdentity: {
      blocker: "the components do not have the same established service identity.",
      unlocker: "Evidence that both prices cover the same service.",
    },
    unitBillingBasis: {
      blocker: "the units or billing bases are not directly comparable.",
      unlocker: "A supported common billing basis with every required input.",
    },
    channel: {
      blocker: "the current and published components do not cover the same established payment channel.",
      unlocker: "A supported card-present, card-not-present, or gateway activity split.",
    },
    statementPeriod: {
      blocker: "the published evidence does not apply to this statement period.",
      unlocker: "Period-applicable published evidence for this statement.",
    },
    offerIdentity: {
      blocker: "the exact provider, offer, or distribution identity is not established.",
      unlocker: "The exact public provider, offer, and distribution identity.",
    },
    decompositionControl: {
      blocker: "control of the current merchant-facing price is not established strongly enough.",
      unlocker: "Evidence establishing who controls this specific merchant-facing price.",
    },
  };
  if (failedGate) return byGate[failedGate]!;
  if (decision.reasonCodes.includes("comparison_amount_state_mismatch")) {
    return {
      blocker: "the current or published amount is not exact enough for the proposed arithmetic.",
      unlocker: "Compatible exact or explicitly bounded amounts for both components.",
    };
  }
  if (decision.reasonCodes.includes("public_policy_unknown")) {
    return {
      blocker: "public information does not establish that this offer is available to this merchant.",
      unlocker: "Merchant-specific approval or a merchant-specific quote for the named offer.",
    };
  }
  return {
    blocker: candidate.internalFinding.conclusion.refusalReasons[0] ?? "A required comparison fact is missing.",
    unlocker: candidate.internalFinding.conclusion.smallestUnlocker ?? "The missing component, activity, or account detail.",
  };
}

function merchantSafeText(
  value: string,
  candidate: MerchantCommercialProjectionCandidateV1,
  alternativeNamePermitted: boolean,
): string {
  let safe = value.replace(/\bgoverned\b/gi, "published");
  if (!alternativeNamePermitted) {
    for (const name of [candidate.alternative.provider, candidate.alternative.offer]) {
      if (name) safe = safe.replace(new RegExp(escapeRegExp(name), "gi"), "the public offer");
    }
  }
  return safe.trim();
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}

function withoutTerminalPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function differenceSummary(
  decision: MerchantCommercialFindingDecisionV1,
  name: MerchantSafeCommercialFindingV1["alternative"],
  difference: MerchantSafeCommercialFindingV1["comparableComponentDifference"],
): string {
  if (decision.comparisonValidity === "not_a_comparison") return "This information explains an offer condition or commercial fact; no price comparison was performed.";
  if (!difference) return "The current amount is bounded, so an exact component difference cannot be stated.";
  const offer = name ? `${name.provider} ${name.offer}` : "the comparable public offer";
  if (difference.direction === "current_more") return `The current matched component costs more than the comparable component under ${offer} on this statement's matched activity.`;
  return `The comparable component under ${offer} costs more than the current matched component on this statement's matched activity.`;
}

function candidateFromRuntime(
  attempt: RuntimeCommercialComparisonAttemptV1,
  attachment: RuntimeCommercialComparisonAttachmentV1,
  decomposition: CommercialDecompositionContractV1,
  registries: CommercialSourceGovernanceRegistryV1[],
): MerchantCommercialProjectionCandidateV1 {
  const current = attachment.deterministicBaseline.currentProviderControlledComponents.find((item) => item.componentRef === attempt.currentComponentRef) ?? null;
  const row = current ? decomposition.rows.find((item) => item.feeRowId === current.feeRowId) ?? null : null;
  const located = locateAlternative(attempt, registries);
  const policyComposition = located
    ? { registry: located.registry, composition: located.composition }
    : locateComposition(attempt, registries);
  const finding = attempt.finding;
  const currentService = current ? currentServiceIdentity(current) : null;
  const alternativeService = located ? alternativeServiceIdentity(located.component) : null;
  const currentPopulation = current ? populationIdentity(current.populationLabel, current.unit) : null;
  const alternativePopulation = located ? populationIdentity(located.component.billedPopulation, located.component.unit) : null;
  const policy = policyComposition
    ? evaluateGovernedCommercialPublicPolicyV1({
        registry: policyComposition.registry,
        composition: policyComposition.composition,
        facts: attachment.deterministicBaseline.merchantFacts.facts,
      })
    : "public_policy_unknown";
  const denominator = denominatorFor(attachment);
  const offsetState = located ? offsetStateFor(located.registry, located.composition, located.component) : { state: "incomplete" as const, evidenceRefs: [] };
  const isEvidenceOnly = !attempt.comparisonPerformed;
  const comparisonEvidence = finding.comparisonEvidenceBinding;
  const distribution = located ? [
    located.component.offerIdentity.providerBrand,
    located.component.offerIdentity.sellerIdentity,
    located.component.offerIdentity.distributionChannel,
    located.component.offerIdentity.namedOffer,
    located.component.offerIdentity.productScope,
  ].join(":") : "unresolved";
  return {
    candidateId: attempt.attemptId,
    presentationGroupId: located
      ? `${located.component.offerIdentity.providerBrand}:${located.component.offerIdentity.namedOffer}:${located.component.offerIdentity.productScope}`
      : `unresolved:${attempt.alternativeProvider}`,
    internalFinding: finding,
    current: {
      componentRef: current?.componentRef ?? null,
      componentLabel: finding.matchedComponentLabel ?? current?.printedLabel ?? "Commercial component",
      serviceIdentity: currentService,
      economicLayer: row?.economicLayer.value ?? current?.economicLayer ?? null,
      unit: current?.unit ?? null,
      billingBasis: current?.unit ?? null,
      populationIdentity: currentPopulation,
      channel: current?.channel ?? null,
      amountState: current?.currentAmount.state === "EXACT" ? "exact" : current?.currentAmount.state === "UPPER_BOUND" ? "upper_bound" : "unknown",
      amountMinor: current?.currentAmount.amountMinor ?? null,
      controlState: controlStateFor(row),
      evidenceRefs: comparisonEvidence?.currentComponentEvidenceRefs ?? current?.currentComponentEvidenceRefs ?? [],
    },
    alternative: {
      componentRef: located?.component.componentVersionId ?? null,
      provider: located?.component.offerIdentity.providerBrand ?? attempt.alternativeProvider,
      offer: located?.component.offerIdentity.namedOffer ?? attempt.alternativeOffer,
      distributionIdentity: distribution,
      serviceIdentity: alternativeService,
      economicLayer: located ? alternativeEconomicLayer(located.component) : null,
      unit: located?.component.unit ?? null,
      billingBasis: located?.component.unit ?? null,
      populationIdentity: alternativePopulation,
      channel: located ? alternativeChannel(located.component) : null,
      amountState: located?.component.completeness.state === "KNOWN" ? "exact" : "unknown",
      amountMinor: located?.component.completeness.state === "KNOWN" && located.component.completeness.value.kind === "money"
        ? located.component.completeness.value.amountMinor : null,
      evidenceRefs: comparisonEvidence?.alternativeComponentEvidenceRefs ?? located?.component.sourceObservationRefs ?? finding.evidenceRefs,
    },
    matchedPopulationCount: finding.economics.matchedPopulationCount,
    matchedPopulationEvidenceRefs: comparisonEvidence?.matchedPopulationEvidenceRefs ?? [],
    revalidation: {
      currentComponent: current || isEvidenceOnly ? "matched" : "unknown",
      alternativeComponent: located || isEvidenceOnly ? "matched" : "unknown",
      population: isEvidenceOnly ? "matched" : gate(currentPopulation !== null && currentPopulation === alternativePopulation),
      economicLayer: isEvidenceOnly ? "matched" : gate(Boolean(row?.economicLayer.value) && normalizeLayer(row?.economicLayer.value ?? null) === normalizeLayer(located ? alternativeEconomicLayer(located.component) : null)),
      serviceIdentity: isEvidenceOnly ? "matched" : gate(currentService !== null && currentService === alternativeService),
      unitBillingBasis: isEvidenceOnly ? "matched" : gate(Boolean(current?.unit) && current?.unit === located?.component.unit),
      channel: isEvidenceOnly ? "matched" : gate(Boolean(current?.channel) && current?.channel === (located ? alternativeChannel(located.component) : null)),
      statementPeriod: policyComposition
        ? governedEvidencePeriodGate(
            attachment.statement.statementPeriod,
            policyComposition.registry,
            policyComposition.composition,
            located?.component ?? null,
          )
        : "unknown",
      offerIdentity: policyComposition
        && policyComposition.composition.offerIdentity.providerBrand === attempt.alternativeProvider
        && policyComposition.composition.offerIdentity.namedOffer === attempt.alternativeOffer
        && policyComposition.composition.offerIdentity.distributionChannel === finding.alternative.salesChannel
        ? "matched"
        : "unknown",
      decompositionControl: isEvidenceOnly ? "matched" : gate(controlStateFor(row) !== "unresolved_controller"),
    },
    componentClass: current ? componentClassFor(current) : "unsupported",
    cadence: row?.recurrence.cadence === "monthly" ? "monthly" : row?.recurrence.state === "CURRENT_PERIOD_OCCURRENCE_ONLY" ? "current_period_only" : "unknown",
    observedEventCount: current?.populationCount ?? null,
    providerControlledCost: denominator,
    applicability: { publicPolicy: policy, approval: "approval_unknown" },
    offsets: offsetState,
    qualitativeDisplayReasonApproved: false,
  };
}

function locateAlternative(attempt: RuntimeCommercialComparisonAttemptV1, registries: CommercialSourceGovernanceRegistryV1[]) {
  if (!attempt.alternativeComponentRef) return null;
  for (const registry of registries) {
    const component = registry.priceComponentVersions.find((item) => item.componentVersionId === attempt.alternativeComponentRef);
    if (!component || component.admission.lifecycle !== "admitted") continue;
    const composition = registry.offerCompositionVersions.find((item) => item.admission.lifecycle === "admitted"
      && item.componentVersionRefs.includes(component.componentVersionId)
      && sameOfferIdentity(item.offerIdentity, component.offerIdentity));
    if (composition) return { registry, component, composition };
  }
  return null;
}

function locateComposition(attempt: RuntimeCommercialComparisonAttemptV1, registries: CommercialSourceGovernanceRegistryV1[]) {
  for (const registry of registries) {
    const composition = registry.offerCompositionVersions.find((item) => item.admission.lifecycle === "admitted"
      && item.offerIdentity.providerBrand === attempt.alternativeProvider
      && item.offerIdentity.namedOffer === attempt.alternativeOffer);
    if (composition) return { registry, composition };
  }
  return null;
}

export function evaluateGovernedCommercialPublicPolicyV1(input: {
  registry: CommercialSourceGovernanceRegistryV1;
  composition: CommercialOfferCompositionVersionV1;
  facts: Record<string, string | number | boolean | undefined>;
}): MerchantCommercialPolicyStateV1 {
  const { registry, composition, facts } = input;
  const applicable = composition.publicPolicyVersionRefs
    .map((ref) => registry.publicPolicyVersions.find((item) => item.policyVersionId === ref))
    .filter((item): item is CommercialPublicPolicyVersionV1 => Boolean(item) && item!.predicateAdmission.lifecycle === "admitted")
    .map((item) => ({ item, result: item.normalizedPredicate ? evaluateCommercialPredicateV1(item.normalizedPredicate, facts) : "unknown" as const }));
  if (applicable.some(({ item, result }) => item.status === "PUBLICLY_PROHIBITED" && result === "satisfied")) return "publicly_prohibited";
  if (applicable.some(({ item, result }) => item.status === "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED" && result === "satisfied")) return "restricted_or_review_required";
  if (applicable.some(({ item, result }) => item.status === "NO_KNOWN_PUBLIC_BLOCK" && result === "satisfied")) return "no_known_public_block";
  return "public_policy_unknown";
}

function governedEvidencePeriodGate(
  statement: { start: string; end: string },
  registry: CommercialSourceGovernanceRegistryV1,
  composition: CommercialOfferCompositionVersionV1,
  component: CommercialPriceComponentVersionV1 | null,
): MerchantCommercialGateStateV1 {
  const policies = composition.publicPolicyVersionRefs
    .map((ref) => registry.publicPolicyVersions.find((item) => item.policyVersionId === ref))
    .filter((item): item is CommercialPublicPolicyVersionV1 => Boolean(item));
  const governedRecords = [composition, ...(component ? [component] : []), ...policies];
  if (policies.length !== composition.publicPolicyVersionRefs.length) return "unknown";
  if (governedRecords.some((item) => !periodCoversStatement(item.effectivePeriod, statement))) return "mismatch";
  const sourceRefs = unique(governedRecords.flatMap((item) => item.sourceObservationRefs));
  if (sourceRefs.length === 0) return "unknown";
  const observationDates = sourceRefs.map((ref) => registry.sourceObservations
    .find((item) => item.observationId === ref)?.provenance.observedAt.slice(0, 10) ?? null);
  if (observationDates.some((date) => date === null)) return "unknown";
  return observationDates.some((date) => date! > statement.end) ? "mismatch" : "matched";
}

function periodCoversStatement(period: CommercialEffectivePeriodV1, statement: { start: string; end: string }): boolean {
  if (period.knowledge === "effective_period_unknown") return true;
  return (period.effectiveFrom === null || period.effectiveFrom <= statement.start)
    && (period.effectiveTo === null || statement.end < period.effectiveTo);
}

function offsetStateFor(
  registry: CommercialSourceGovernanceRegistryV1,
  composition: CommercialOfferCompositionVersionV1,
  selected: CommercialPriceComponentVersionV1,
): MerchantCommercialProjectionCandidateV1["offsets"] {
  const others = composition.componentVersionRefs
    .filter((ref) => ref !== selected.componentVersionId)
    .map((ref) => registry.priceComponentVersions.find((item) => item.componentVersionId === ref))
    .filter((item): item is CommercialPriceComponentVersionV1 => Boolean(item));
  if (others.length === 0) return { state: "not_applicable", evidenceRefs: [] };
  if (others.every((item) => item.completeness.state === "KNOWN_ABSENT")) {
    return { state: "complete_non_reversing", evidenceRefs: unique(others.flatMap((item) => [item.componentVersionId, ...item.sourceObservationRefs])) };
  }
  return { state: "incomplete", evidenceRefs: unique(others.flatMap((item) => [item.componentVersionId, ...item.sourceObservationRefs])) };
}

function denominatorFor(attachment: RuntimeCommercialComparisonAttachmentV1): MerchantCommercialProjectionCandidateV1["providerControlledCost"] {
  const economics = attachment.deterministicBaseline.commercialEconomics;
  if (!economics) return { state: "unknown", amountMinor: null };
  if (economics.providerControlledMinimumMinor === 0 && economics.providerControlledUpperBoundMinor === 0) return { state: "zero", amountMinor: 0 };
  if (economics.providerControlledUpperBoundState !== "SAME_AS_MINIMUM") return { state: "bounded", amountMinor: economics.providerControlledUpperBoundMinor };
  if (economics.unresolvedIncludingCanonicalResidualMinor !== 0) return { state: "incomplete", amountMinor: economics.providerControlledMinimumMinor };
  return { state: "exact", amountMinor: economics.providerControlledMinimumMinor };
}

function controlStateFor(row: CommercialDecompositionRowV1 | null): MerchantCommercialControlStateV1 {
  if (!row) return "unresolved_controller";
  if (row.commercialDollarAttribution.kind === "EXACT_PROVIDER_CONTROLLED_MERCHANT_PRICE") return "exact_provider_controlled";
  if (row.commercialDollarAttribution.kind === "PROVIDER_CONTROLLED_PRICE_UPPER_BOUND_ONLY") return "upper_bound_only";
  if (row.commercialDollarAttribution.kind === "PERIOD_SCOPED_NETWORK_RELATED_BILLED_AMOUNT"
    || row.commercialDollarAttribution.kind === "NETWORK_RELATED_BILLED_AMOUNT_NOT_AT_PAR") return "network_or_pass_through";
  if (row.commercialDollarAttribution.kind === "SHARED_BUNDLED_OR_UNRESOLVED") return "shared_or_bundled";
  return "unresolved_controller";
}

function componentClassFor(current: RuntimeCurrentCommercialComponentV1): MerchantCommercialComponentClassV1 {
  if (["per_authorization", "per_gateway_transaction", "per_batch"].includes(current.unit)) return "variable";
  return "unsupported";
}

function currentServiceIdentity(current: RuntimeCurrentCommercialComponentV1): string {
  if (current.componentKind === "authorization_fee") return "authorization_service";
  if (current.componentKind === "gateway_transaction_fee") return "gateway_transaction_service";
  return "gateway_batch_service";
}

function alternativeServiceIdentity(component: CommercialPriceComponentVersionV1): string | null {
  if (component.unit === "per_authorization") return "authorization_service";
  if (component.unit === "per_gateway_transaction") return "gateway_transaction_service";
  if (component.unit === "per_batch" && component.componentIdentity === "gateway_batch_charge") return "gateway_batch_service";
  if (component.unit === "per_month") return "monthly_service";
  if (component.unit === "per_chargeback_case") return "chargeback_service";
  if (component.unit.startsWith("percent_")) return "provider_percentage_pricing";
  return null;
}

function alternativeEconomicLayer(component: CommercialPriceComponentVersionV1): string {
  return component.offerIdentity.productScope === "gateway_only" ? "gateway" : "acquiring_commercial";
}

function alternativeChannel(component: CommercialPriceComponentVersionV1): string {
  if (component.offerIdentity.productScope === "gateway_only") return "gateway";
  const text = `${component.componentIdentity} ${component.billedPopulation} ${component.offerIdentity.namedOffer}`.toLowerCase();
  if (text.includes("card_not_present") || text.includes("virtual") || text.includes("online")) return "card_not_present";
  if (text.includes("card_present") || text.includes("retail") || text.includes("storefront")) return "card_present";
  return "unknown";
}

function populationIdentity(value: string, unit: string): string | null {
  const text = value.toLowerCase().replaceAll("-", "_");
  if (/approved.*auth|auth.*approved/.test(text)) return "approved_authorizations";
  if (/attempt.*auth|auth.*attempt/.test(text)) return "authorization_attempts";
  if (/settled.*(?:sale|transaction)|(?:sale|transaction).*settled/.test(text)) return "settled_transactions";
  if (/gateway.*transaction/.test(text) || unit === "per_gateway_transaction") return "gateway_transactions";
  if (/batch/.test(text) || unit === "per_batch") return "settled_batches";
  if (/authorization|\bauth\b/.test(text) || unit === "per_authorization") return "authorizations";
  if (/chargeback|dispute/.test(text) || unit === "per_chargeback_case") return "chargeback_cases";
  if (/sale|transaction/.test(text) || unit === "per_card_transaction") return "card_transactions";
  if (/volume/.test(text) || unit.startsWith("percent_")) return text.includes("refund") ? "refund_adjusted_volume" : text.includes("net") ? "net_volume" : text.includes("gross") ? "gross_volume" : text.includes("submitted") ? "submitted_volume" : "card_charge_volume";
  if (/month/.test(text) || unit === "per_month") return "account_months";
  return null;
}

function normalizeLayer(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("gateway")) return "gateway";
  if (value.includes("acquiring")) return "acquiring_commercial";
  if (value.includes("network") || value.includes("interchange")) return "network_or_interchange";
  return value;
}

function enforceDirectionalFairness(decisions: MerchantCommercialFindingDecisionV1[]): void {
  const groups = new Map<string, MerchantCommercialFindingDecisionV1[]>();
  for (const decision of decisions) groups.set(decision.presentationGroupId, [...(groups.get(decision.presentationGroupId) ?? []), decision]);
  for (const group of groups.values()) {
    const visibleWorse = group.some((item) => item.visibility.permitted && item.direction === "current_costs_more");
    const hiddenBetter = group.filter((item) => !item.visibility.permitted
      && item.direction === "current_costs_less"
      && item.materiality.state !== "below_noise_floor");
    if (visibleWorse && hiddenBetter.length > 0) {
      throw new Error(`directional_fairness_violation:${hiddenBetter.map((item) => item.candidateId).join(",")}`);
    }
  }
}

function gate(condition: boolean): MerchantCommercialGateStateV1 { return condition ? "matched" : "mismatch"; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
