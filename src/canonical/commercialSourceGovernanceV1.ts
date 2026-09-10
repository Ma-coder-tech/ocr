import { createHash } from "node:crypto";

import { canonicalJson } from "./v2/canonicalJson.js";
import type { KnowledgeAuthorityClass } from "./v2/knowledge/knowledgeTypes.js";

export const COMMERCIAL_SOURCE_GOVERNANCE_CONTRACT_V1 =
  "commercial_source_governance_contract_2026_09_10_v1" as const;

export type CommercialDistributionChannelV1 =
  | "direct"
  | "bank_partner"
  | "iso"
  | "sub_iso"
  | "reseller"
  | "agent"
  | "isv_referral"
  | "payfac"
  | "embedded_platform"
  | "gateway_reseller"
  | "unknown";

export type CommercialSourceNatureV1 =
  | "first_party_public_offer"
  | "public_provider_offer"
  | "merchant_specific_offer"
  | "reseller_partner_offer"
  | "executed_procurement"
  | "product_adjudicated_source_summary"
  | "synthetic_test_fixture";

export type CommercialSourceClassV1 =
  | "official_provider_pricing"
  | "official_provider_policy"
  | "official_provider_product_documentation"
  | "official_provider_support"
  | "merchant_quote_or_proposal"
  | "executed_pricing_schedule"
  | "reseller_rate_sheet"
  | "public_contract"
  | "product_adjudication"
  | "synthetic_test_fixture";

export type CommercialCompletenessV1 =
  | { state: "KNOWN"; value: CommercialComponentValueV1 }
  | { state: "KNOWN_ABSENT"; value: null; observedAbsentValue: CommercialComponentValueV1 }
  | { state: "UNKNOWN"; value: null };

export type CommercialComponentValueV1 =
  | { kind: "money"; amountMinor: number; currency: string }
  | { kind: "rate"; basisPoints: number; currency: null };

export type CommercialEffectivePeriodV1 = {
  knowledge: "exact_interval_known" | "partial_interval_known" | "effective_period_unknown";
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type CommercialAdmissionV1 = {
  lifecycle: "candidate" | "pending_product_review" | "admitted" | "retired_historical";
  authorityClass: KnowledgeAuthorityClass | null;
  authorityRef: string | null;
  admittedAt: string | null;
  proposedBy: "human" | "ai_or_research" | "deterministic_import";
};

export type CommercialOfferIdentityV1 = {
  providerBrand: string;
  sellerIdentity: string;
  distributionChannel: CommercialDistributionChannelV1;
  namedOffer: string;
  productScope: "gateway_only" | "acquiring_only" | "all_in_one_processing" | "ancillary_service" | "other";
  geography: string;
  currency: string;
  pricingModel: string;
  sourceNature: CommercialSourceNatureV1;
};

export type CommercialSourceObservationV1 = {
  observationId: string;
  observationVersion: number;
  supersedesObservationId: string | null;
  offerIdentity: CommercialOfferIdentityV1;
  provenance: {
    sourceClass: CommercialSourceClassV1;
    sourceLocator: string;
    documentIdentity: string;
    captureMethod: "static_document" | "rendered_page" | "dynamic_calculator" | "product_adjudicated_document" | "synthetic_fixture";
    observedAt: string;
    publicationDate: string | null;
    lastModifiedDate: string | null;
    effectivePeriod: CommercialEffectivePeriodV1;
    lastVerifiedAt: string | null;
    retrievabilityLimitation: string | null;
    rawArtifactRef: string;
  };
  sourceFaithfulExtract: string;
  calculatorCapture: null | {
    exactInputs: Record<string, string | number | boolean>;
    exactOutputs: Record<string, string | number | boolean>;
    selectionState: Record<string, string>;
    termsAndFootnotes: string[];
    reproducibilityLimitation: string | null;
  };
  fingerprints: {
    f1RawSourceDocument: string;
    f2RelevantCommercialExtract: string;
  };
  immutableCapture?: {
    captureRecordRef: string;
    captureState: "captured" | "capture_unavailable";
    validationState:
      | "capture_matches_admitted_observation"
      | "capture_partial_but_nonconflicting"
      | "capture_unavailable"
      | "capture_conflict_requires_product_review";
    retainedFirstPartyArtifactPath: string | null;
    retainedFirstPartyArtifactSha256: string | null;
    failureResponseArtifactPath: string | null;
    failureResponseArtifactSha256: string | null;
    priorProvisionalF1Fingerprint: string;
    adjudicationAuthorityArtifactRef: string;
    retrievalTimestampUtc: string;
    relationship: "immutable_capture_to_observation_to_f2_to_f3";
  };
};

export type CommercialPriceComponentVersionV1 = {
  componentVersionId: string;
  componentIdentity: string;
  version: number;
  supersedesComponentVersionId: string | null;
  offerIdentity: CommercialOfferIdentityV1;
  completeness: CommercialCompletenessV1;
  unit:
    | "per_month"
    | "per_year"
    | "per_gateway_account_setup"
    | "per_gateway_transaction"
    | "per_batch"
    | "per_authorization"
    | "per_card_transaction"
    | "per_successful_update"
    | "per_returned_gateway_billing_debit"
    | "per_late_payment_event"
    | "per_reactivation"
    | "per_abandoned_account"
    | "per_billing_cycle"
    | "per_chargeback_case"
    | "per_ach_reject_or_return"
    | "per_approved_tap_to_pay_transaction"
    | "per_service_setup"
    | "percent_of_card_charge_volume"
    | "percent_of_volume"
    | "percent_of_generated_interchange_savings"
    | "other";
  billedPopulation: string;
  sourceFaithfulPopulationWording: string | null;
  channelScope: CommercialDistributionChannelV1;
  brandOrProductScope: string | null;
  effectivePeriod: CommercialEffectivePeriodV1;
  sourceObservationRefs: string[];
  pricePresentation: "exact" | "starting_at" | "indicative";
  directionalBound: "none" | "lower_bound" | "upper_bound";
  /** Product-admitted applicability only. Absence means the component applies to its whole offer identity. */
  applicabilityPredicate?: CommercialPredicateV1 | null;
  /** A conditional adjustment never changes the admitted gross fee into a universal zero. */
  conditionalAdjustment?: {
    kind: "full_fee_refund";
    condition: CommercialPredicateV1;
    result: "net_zero_for_assessed_component";
    sourceFaithfulWording: string;
  } | null;
  admission: CommercialAdmissionV1;
  f3GovernedSemantic: string;
};

export type CommercialPredicateV1 =
  | { op: "fact"; field:
      | "monthly_volume_minor"
      | "three_month_rolling_card_volume_minor"
      | "annual_volume_minor"
      | "transaction_count"
      | "average_ticket_minor"
      | "merchant_type"
      | "channel"
      | "card_brand"
      | "transaction_is_recurring"
      | "chargeback_resolved_in_merchant_favor"
      | "pci_non_compliant"
      | "known_high_risk"
      | "future_delivery_or_custom_deposit_or_open_ended_billing"
      | "risk_review_required";
      comparator: "eq" | "gte" | "gt" | "lte" | "lt";
      value: string | number | boolean }
  | { op: "and" | "or"; conditions: CommercialPredicateV1[] };

export type CommercialPredicateFactFieldV1 = Extract<CommercialPredicateV1, { op: "fact" }>["field"];

export type CommercialPublicPolicyVersionV1 = {
  policyVersionId: string;
  version: number;
  offerIdentity: CommercialOfferIdentityV1;
  status: "PUBLICLY_PROHIBITED" | "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED" | "NO_KNOWN_PUBLIC_BLOCK" | "PUBLIC_POLICY_UNKNOWN";
  sourceFaithfulWording: string | null;
  normalizedPredicate: CommercialPredicateV1 | null;
  predicateAdmission: CommercialAdmissionV1;
  effectivePeriod: CommercialEffectivePeriodV1;
  sourceObservationRefs: string[];
  f3GovernedSemantic: string;
};

export type CommercialPredicateProposalV1 = {
  proposalId: string;
  offerIdentity: CommercialOfferIdentityV1;
  sourceFaithfulWording: string;
  proposedPredicate: CommercialPredicateV1;
  sourceObservationRefs: string[];
  lifecycle: "candidate" | "pending_product_review";
  proposedBy: "human" | "ai_or_research";
  limitations: string[];
};

export type CommercialMerchantAvailabilityEvidenceV1 = {
  evidenceId: string;
  kind: "none" | "automated_prequalification" | "representative_written_quote" | "formal_proposal" | "approved_application" | "executed_pricing_schedule" | "current_in_force_pricing";
  merchantScopeRef: string | null;
  sourceObservationRefs: string[];
  conditions: string[];
  effectivePeriod: CommercialEffectivePeriodV1;
  admission: CommercialAdmissionV1;
};

export type CommercialServiceScopeVersionV1 = {
  serviceVersionId: string;
  version: number;
  offerIdentity: CommercialOfferIdentityV1;
  serviceIdentity: string;
  state: "KNOWN_INCLUDED" | "KNOWN_EXCLUDED" | "UNKNOWN";
  effectivePeriod: CommercialEffectivePeriodV1;
  sourceObservationRefs: string[];
  admission: CommercialAdmissionV1;
  f3GovernedSemantic: string;
};

export type CommercialPromotionVersionV1 = {
  promotionVersionId: string;
  version: number;
  offerIdentity: CommercialOfferIdentityV1;
  status: "ordinary" | "promotional" | "introductory" | "conditional" | "unknown";
  conditions: string[];
  durationOrExpiration: string | null;
  reversionTerms: string | null;
  commitmentRequirements: string[];
  effectivePeriod: CommercialEffectivePeriodV1;
  sourceObservationRefs: string[];
  admission: CommercialAdmissionV1;
  f3GovernedSemantic: string;
};

export type CommercialOfferCompositionVersionV1 = {
  compositionVersionId: string;
  version: number;
  supersedesCompositionVersionId: string | null;
  offerIdentity: CommercialOfferIdentityV1;
  componentVersionRefs: string[];
  publicPolicyVersionRefs: string[];
  serviceScopeVersionRefs: string[];
  promotionVersionRefs: string[];
  sourceObservationRefs: string[];
  effectivePeriod: CommercialEffectivePeriodV1;
  lifecycle: "prospective_future" | "active_available_last_known" | "superseded" | "withdrawn_retired";
  verification: "currently_verified" | "verification_due_or_uncertain" | "unable_to_reverify";
  qualificationPredicate?: CommercialPredicateV1 | null;
  qualificationBoundary?: {
    field: CommercialPredicateFactFieldV1;
    exactValue: string | number | boolean;
    state: "UNRESOLVED_QUALIFICATION_BOUNDARY";
    appliesWhen: CommercialPredicateV1 | null;
    sourceObservationRefs: string[];
    reason: string;
  } | null;
  disqualifyingPredicate?: CommercialPredicateV1 | null;
  admission: CommercialAdmissionV1;
  f3GovernedSemantic: string;
};

export type CommercialSourceConflictV1 = {
  conflictId: string;
  sameScopeKey: string;
  componentVersionRefs: string[];
  state: "unresolved" | "resolved";
  resolution: null | {
    selectedComponentVersionRef: string;
    authorityRef: string;
    resolvedAt: string;
    reason: string;
  };
};

export type CommercialSourceGovernanceRegistryV1 = {
  contractVersion: typeof COMMERCIAL_SOURCE_GOVERNANCE_CONTRACT_V1;
  sourceObservations: CommercialSourceObservationV1[];
  priceComponentVersions: CommercialPriceComponentVersionV1[];
  publicPolicyVersions: CommercialPublicPolicyVersionV1[];
  predicateProposals: CommercialPredicateProposalV1[];
  merchantAvailabilityEvidence: CommercialMerchantAvailabilityEvidenceV1[];
  serviceScopeVersions: CommercialServiceScopeVersionV1[];
  promotionVersions: CommercialPromotionVersionV1[];
  offerCompositionVersions: CommercialOfferCompositionVersionV1[];
  conflicts: CommercialSourceConflictV1[];
  permissions: {
    internalSourceAuthorityOnly: true;
    customerComparatorClaimsAllowed: false;
    gradesAllowed: false;
    savingsAllowed: false;
    switchingAdviceAllowed: false;
    canonicalMutationAllowed: false;
    aiSelfAdmissionAllowed: false;
  };
};

export type CommercialSourceValidationIssueV1 = { code: string; ref: string; message: string };

export type CommercialOfferResolutionV1 = {
  status: "resolved" | "unresolved_not_found" | "unresolved_channel_or_identity" | "unresolved_period" | "unresolved_not_admitted" | "unresolved_conflict" | "unresolved_not_current";
  compositionRef: string | null;
  componentVersionRefs: string[];
  reasons: string[];
  publicPolicyStatus: CommercialPublicPolicyVersionV1["status"] | null;
  merchantAvailabilityEvidence: CommercialMerchantAvailabilityEvidenceV1[];
};

export type CommercialSourceChangeClassificationV1 = {
  f1RawSourceChanged: boolean;
  f2RelevantExtractChanged: boolean;
  f3GovernedMeaningChanged: boolean;
  sourceObservationVersionRequired: boolean;
  productReviewRequired: boolean;
  governedSemanticVersionRequired: boolean;
};

export type CommercialOfferQualificationEvaluationV1 = {
  state: "QUALIFIED" | "NOT_QUALIFIED" | "UNRESOLVED_QUALIFICATION_BOUNDARY" | "UNKNOWN" | "NOT_APPLICABLE";
  reasons: string[];
};

export type CommercialComponentConflictClassificationV1 =
  | "different_scope_not_conflict"
  | "same_scope_same_semantic_meaning"
  | "genuine_same_scope_conflict";

export function commercialSourceFingerprintsV1(input: {
  rawSourceDocument: string | Uint8Array;
  relevantCommercialExtract: string;
}): CommercialSourceObservationV1["fingerprints"] {
  return {
    f1RawSourceDocument: sha256(input.rawSourceDocument),
    f2RelevantCommercialExtract: sha256(input.relevantCommercialExtract),
  };
}

export function commercialSemanticFingerprintV1(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function classifyCommercialSourceChangeV1(input: {
  previousObservation: CommercialSourceObservationV1;
  nextObservation: CommercialSourceObservationV1;
  previousF3: string;
  nextF3: string;
}): CommercialSourceChangeClassificationV1 {
  const f1RawSourceChanged = input.previousObservation.fingerprints.f1RawSourceDocument !== input.nextObservation.fingerprints.f1RawSourceDocument;
  const f2RelevantExtractChanged = input.previousObservation.fingerprints.f2RelevantCommercialExtract !== input.nextObservation.fingerprints.f2RelevantCommercialExtract;
  const f3GovernedMeaningChanged = input.previousF3 !== input.nextF3;
  return {
    f1RawSourceChanged,
    f2RelevantExtractChanged,
    f3GovernedMeaningChanged,
    sourceObservationVersionRequired: f1RawSourceChanged || f2RelevantExtractChanged,
    productReviewRequired: f2RelevantExtractChanged || f3GovernedMeaningChanged,
    governedSemanticVersionRequired: f3GovernedMeaningChanged,
  };
}

export function classifyCommercialComponentConflictV1(
  left: CommercialPriceComponentVersionV1,
  right: CommercialPriceComponentVersionV1,
): CommercialComponentConflictClassificationV1 {
  const sameScope = sameOfferIdentity(left.offerIdentity, right.offerIdentity)
    && left.componentIdentity === right.componentIdentity
    && left.unit === right.unit
    && left.billedPopulation === right.billedPopulation
    && left.channelScope === right.channelScope
    && left.brandOrProductScope === right.brandOrProductScope
    && periodsMayOverlap(left.effectivePeriod, right.effectivePeriod);
  if (!sameScope) return "different_scope_not_conflict";
  return left.f3GovernedSemantic === right.f3GovernedSemantic
    ? "same_scope_same_semantic_meaning"
    : "genuine_same_scope_conflict";
}

export function governedCommercialComponentSemanticFingerprintV1(
  input: Omit<CommercialPriceComponentVersionV1, "componentVersionId" | "version" | "supersedesComponentVersionId" | "admission" | "f3GovernedSemantic">,
): string {
  return commercialSemanticFingerprintV1({
    componentIdentity: input.componentIdentity,
    offerIdentity: input.offerIdentity,
    completeness: input.completeness,
    unit: input.unit,
    billedPopulation: input.billedPopulation,
    channelScope: input.channelScope,
    brandOrProductScope: input.brandOrProductScope,
    effectivePeriod: input.effectivePeriod,
    pricePresentation: input.pricePresentation,
    directionalBound: input.directionalBound,
    ...(input.applicabilityPredicate !== undefined ? { applicabilityPredicate: input.applicabilityPredicate } : {}),
    ...(input.conditionalAdjustment !== undefined ? { conditionalAdjustment: input.conditionalAdjustment } : {}),
  });
}

export function governedCommercialCompositionSemanticFingerprintV1(
  input: Omit<CommercialOfferCompositionVersionV1, "compositionVersionId" | "version" | "supersedesCompositionVersionId" | "admission" | "f3GovernedSemantic">,
): string {
  return commercialSemanticFingerprintV1({
    offerIdentity: input.offerIdentity,
    componentVersionRefs: input.componentVersionRefs,
    publicPolicyVersionRefs: input.publicPolicyVersionRefs,
    serviceScopeVersionRefs: input.serviceScopeVersionRefs,
    promotionVersionRefs: input.promotionVersionRefs,
    effectivePeriod: input.effectivePeriod,
    ...(input.qualificationPredicate !== undefined ? { qualificationPredicate: input.qualificationPredicate } : {}),
    ...(input.qualificationBoundary !== undefined ? { qualificationBoundary: input.qualificationBoundary } : {}),
    ...(input.disqualifyingPredicate !== undefined ? { disqualifyingPredicate: input.disqualifyingPredicate } : {}),
  });
}

export function governedCommercialPolicySemanticFingerprintV1(input: Pick<CommercialPublicPolicyVersionV1, "offerIdentity" | "status" | "normalizedPredicate" | "effectivePeriod">): string {
  return commercialSemanticFingerprintV1({ offerIdentity: input.offerIdentity, status: input.status, normalizedPredicate: input.normalizedPredicate, effectivePeriod: input.effectivePeriod });
}

export function governedCommercialServiceSemanticFingerprintV1(input: Pick<CommercialServiceScopeVersionV1, "offerIdentity" | "serviceIdentity" | "state" | "effectivePeriod">): string {
  return commercialSemanticFingerprintV1({ offerIdentity: input.offerIdentity, serviceIdentity: input.serviceIdentity, state: input.state, effectivePeriod: input.effectivePeriod });
}

export function governedCommercialPromotionSemanticFingerprintV1(input: Pick<CommercialPromotionVersionV1, "offerIdentity" | "status" | "conditions" | "durationOrExpiration" | "reversionTerms" | "commitmentRequirements" | "effectivePeriod">): string {
  return commercialSemanticFingerprintV1({ offerIdentity: input.offerIdentity, status: input.status, conditions: input.conditions, durationOrExpiration: input.durationOrExpiration, reversionTerms: input.reversionTerms, commitmentRequirements: input.commitmentRequirements, effectivePeriod: input.effectivePeriod });
}

export function createCommercialSourceGovernanceRegistryV1(
  input: Omit<CommercialSourceGovernanceRegistryV1, "contractVersion" | "permissions">,
): CommercialSourceGovernanceRegistryV1 {
  const registry: CommercialSourceGovernanceRegistryV1 = {
    contractVersion: COMMERCIAL_SOURCE_GOVERNANCE_CONTRACT_V1,
    ...structuredClone(input),
    permissions: {
      internalSourceAuthorityOnly: true,
      customerComparatorClaimsAllowed: false,
      gradesAllowed: false,
      savingsAllowed: false,
      switchingAdviceAllowed: false,
      canonicalMutationAllowed: false,
      aiSelfAdmissionAllowed: false,
    },
  };
  const issues = validateCommercialSourceGovernanceRegistryV1(registry);
  if (issues.length > 0) throw new Error(`Invalid commercial source registry: ${issues.map((issue) => `${issue.code}:${issue.ref}`).join(", ")}`);
  return deepFreeze(registry);
}

export function validateCommercialSourceGovernanceRegistryV1(
  registry: CommercialSourceGovernanceRegistryV1,
): CommercialSourceValidationIssueV1[] {
  const issues: CommercialSourceValidationIssueV1[] = [];
  const observationIds = uniqueIds(registry.sourceObservations.map((item) => item.observationId), "observation", issues);
  const componentIds = uniqueIds(registry.priceComponentVersions.map((item) => item.componentVersionId), "component", issues);
  const policyIds = uniqueIds(registry.publicPolicyVersions.map((item) => item.policyVersionId), "policy", issues);
  uniqueIds(registry.predicateProposals.map((item) => item.proposalId), "predicate_proposal", issues);
  const serviceIds = uniqueIds(registry.serviceScopeVersions.map((item) => item.serviceVersionId), "service", issues);
  const promotionIds = uniqueIds(registry.promotionVersions.map((item) => item.promotionVersionId), "promotion", issues);
  uniqueIds(registry.offerCompositionVersions.map((item) => item.compositionVersionId), "composition", issues);

  for (const observation of registry.sourceObservations) {
    checkPeriod(observation.provenance.effectivePeriod, observation.observationId, issues);
    if (observation.offerIdentity.distributionChannel === "unknown" && /direct/i.test(observation.offerIdentity.sellerIdentity)) {
      issues.push(issue("unknown_channel_must_not_imply_direct", observation.observationId, "UNKNOWN channel cannot carry a direct seller identity."));
    }
    if (observation.fingerprints.f2RelevantCommercialExtract !== sha256(observation.sourceFaithfulExtract)) {
      issues.push(issue("extract_fingerprint_mismatch", observation.observationId, "F2 does not match the preserved commercial extract."));
    }
    if (!/^[a-f0-9]{64}$/.test(observation.fingerprints.f1RawSourceDocument)) {
      issues.push(issue("invalid_raw_source_fingerprint", observation.observationId, "F1 must be a SHA-256 fingerprint."));
    }
    if (observation.immutableCapture?.captureState === "captured") {
      if (observation.immutableCapture.retainedFirstPartyArtifactPath === null
        || observation.immutableCapture.retainedFirstPartyArtifactSha256 === null
        || observation.fingerprints.f1RawSourceDocument !== observation.immutableCapture.retainedFirstPartyArtifactSha256) {
        issues.push(issue("captured_f1_link_mismatch", observation.observationId, "A captured first-party artifact must have a path and SHA matching the observation F1."));
      }
    }
    if (observation.immutableCapture?.captureState === "capture_unavailable"
      && observation.fingerprints.f1RawSourceDocument !== observation.immutableCapture.priorProvisionalF1Fingerprint) {
      issues.push(issue("unavailable_capture_replaced_provisional_f1", observation.observationId, "An unavailable first-party capture must not replace the preserved provisional Product-pack F1."));
    }
    if (observation.supersedesObservationId !== null) {
      const predecessor = registry.sourceObservations.find((item) => item.observationId === observation.supersedesObservationId);
      if (!predecessor || predecessor.observationVersion >= observation.observationVersion) {
        issues.push(issue("invalid_observation_lineage", observation.observationId, "Observation successor must reference an earlier preserved version."));
      }
    }
  }
  for (const component of registry.priceComponentVersions) {
    checkAdmission(component.admission, component.componentVersionId, issues);
    checkPeriod(component.effectivePeriod, component.componentVersionId, issues);
    checkObservationRefs(component.sourceObservationRefs, observationIds, component.componentVersionId, issues);
    if (component.completeness.state !== "KNOWN" && component.completeness.value !== null) {
      issues.push(issue("non_known_component_has_value", component.componentVersionId, "UNKNOWN and KNOWN_ABSENT must not carry a value."));
    }
    if (component.completeness.state === "KNOWN_ABSENT" && !isZeroCommercialComponentValue(component.completeness.observedAbsentValue)) {
      issues.push(issue("known_absent_must_preserve_zero_observation", component.componentVersionId, "KNOWN_ABSENT must preserve a source-observed zero money or rate value."));
    }
    if (component.completeness.state === "KNOWN" && component.completeness.value.kind === "money" && component.completeness.value.amountMinor < 0) {
      issues.push(issue("negative_price_requires_separate_credit_semantics", component.componentVersionId, "Negative prices must be modeled as supported credit/rebate terms, not a fee component."));
    }
    if (component.channelScope !== component.offerIdentity.distributionChannel) {
      issues.push(issue("component_channel_identity_mismatch", component.componentVersionId, "Component channel scope must match its offer price identity."));
    }
    if (component.conditionalAdjustment?.kind === "full_fee_refund" && component.completeness.state !== "KNOWN") {
      issues.push(issue("conditional_refund_requires_known_gross_fee", component.componentVersionId, "A conditional full-fee refund must preserve a KNOWN gross assessment."));
    }
    const expected = governedCommercialComponentSemanticFingerprintV1(component);
    if (expected !== component.f3GovernedSemantic) issues.push(issue("semantic_fingerprint_mismatch", component.componentVersionId, "F3 does not match governed component meaning."));
    if (component.supersedesComponentVersionId !== null) {
      const predecessor = registry.priceComponentVersions.find((item) => item.componentVersionId === component.supersedesComponentVersionId);
      if (!predecessor || predecessor.version >= component.version || predecessor.componentIdentity !== component.componentIdentity || !sameOfferIdentity(predecessor.offerIdentity, component.offerIdentity)) {
        issues.push(issue("invalid_component_lineage", component.componentVersionId, "Component successor must reference an earlier version of the same scoped component."));
      }
    }
  }
  for (const policy of registry.publicPolicyVersions) {
    checkAdmission(policy.predicateAdmission, policy.policyVersionId, issues);
    checkPeriod(policy.effectivePeriod, policy.policyVersionId, issues);
    checkObservationRefs(policy.sourceObservationRefs, observationIds, policy.policyVersionId, issues);
    if (policy.normalizedPredicate !== null && policy.predicateAdmission.lifecycle !== "admitted") {
      issues.push(issue("unadmitted_predicate_present", policy.policyVersionId, "A reusable normalized predicate must be Product-admitted."));
    }
    const expected = governedCommercialPolicySemanticFingerprintV1(policy);
    if (expected !== policy.f3GovernedSemantic) issues.push(issue("semantic_fingerprint_mismatch", policy.policyVersionId, "F3 does not match governed public-policy meaning."));
  }
  for (const proposal of registry.predicateProposals) {
    checkObservationRefs(proposal.sourceObservationRefs, observationIds, proposal.proposalId, issues);
    if (proposal.lifecycle !== "candidate" && proposal.lifecycle !== "pending_product_review") {
      issues.push(issue("predicate_proposal_cannot_be_authority", proposal.proposalId, "A predicate proposal must remain outside the admitted authority lane."));
    }
  }
  for (const evidence of registry.merchantAvailabilityEvidence) {
    checkAdmission(evidence.admission, evidence.evidenceId, issues);
    checkPeriod(evidence.effectivePeriod, evidence.evidenceId, issues);
    checkObservationRefs(evidence.sourceObservationRefs, observationIds, evidence.evidenceId, issues);
    if (evidence.kind !== "none" && evidence.merchantScopeRef === null) {
      issues.push(issue("merchant_availability_missing_scope", evidence.evidenceId, "Merchant-specific availability requires a merchant scope reference."));
    }
  }
  for (const service of registry.serviceScopeVersions) {
    checkAdmission(service.admission, service.serviceVersionId, issues);
    checkPeriod(service.effectivePeriod, service.serviceVersionId, issues);
    checkObservationRefs(service.sourceObservationRefs, observationIds, service.serviceVersionId, issues);
    const expected = governedCommercialServiceSemanticFingerprintV1(service);
    if (expected !== service.f3GovernedSemantic) issues.push(issue("semantic_fingerprint_mismatch", service.serviceVersionId, "F3 does not match governed service-scope meaning."));
  }
  for (const promotion of registry.promotionVersions) {
    checkAdmission(promotion.admission, promotion.promotionVersionId, issues);
    checkPeriod(promotion.effectivePeriod, promotion.promotionVersionId, issues);
    checkObservationRefs(promotion.sourceObservationRefs, observationIds, promotion.promotionVersionId, issues);
    const expected = governedCommercialPromotionSemanticFingerprintV1(promotion);
    if (expected !== promotion.f3GovernedSemantic) issues.push(issue("semantic_fingerprint_mismatch", promotion.promotionVersionId, "F3 does not match governed promotion meaning."));
  }
  for (const composition of registry.offerCompositionVersions) {
    checkAdmission(composition.admission, composition.compositionVersionId, issues);
    checkPeriod(composition.effectivePeriod, composition.compositionVersionId, issues);
    checkObservationRefs(composition.sourceObservationRefs, observationIds, composition.compositionVersionId, issues);
    checkRefs(composition.componentVersionRefs, componentIds, composition.compositionVersionId, "component", issues);
    checkRefs(composition.publicPolicyVersionRefs, policyIds, composition.compositionVersionId, "policy", issues);
    checkRefs(composition.serviceScopeVersionRefs, serviceIds, composition.compositionVersionId, "service", issues);
    checkRefs(composition.promotionVersionRefs, promotionIds, composition.compositionVersionId, "promotion", issues);
    if (composition.qualificationBoundary) {
      checkObservationRefs(composition.qualificationBoundary.sourceObservationRefs, observationIds, composition.compositionVersionId, issues);
    }
    const referencedIdentities = [
      ...composition.componentVersionRefs.map((ref) => registry.priceComponentVersions.find((item) => item.componentVersionId === ref)?.offerIdentity),
      ...composition.publicPolicyVersionRefs.map((ref) => registry.publicPolicyVersions.find((item) => item.policyVersionId === ref)?.offerIdentity),
      ...composition.serviceScopeVersionRefs.map((ref) => registry.serviceScopeVersions.find((item) => item.serviceVersionId === ref)?.offerIdentity),
      ...composition.promotionVersionRefs.map((ref) => registry.promotionVersions.find((item) => item.promotionVersionId === ref)?.offerIdentity),
    ].filter((item): item is CommercialOfferIdentityV1 => Boolean(item));
    if (referencedIdentities.some((identity) => !sameOfferIdentity(identity, composition.offerIdentity))) {
      issues.push(issue("offer_composition_identity_leak", composition.compositionVersionId, "Offer composition cannot absorb a component, policy, service, or promotion from another channel/plan/scope identity."));
    }
    const expected = governedCommercialCompositionSemanticFingerprintV1(composition);
    if (expected !== composition.f3GovernedSemantic) issues.push(issue("semantic_fingerprint_mismatch", composition.compositionVersionId, "F3 does not match governed offer composition."));
    if (composition.supersedesCompositionVersionId !== null) {
      const predecessor = registry.offerCompositionVersions.find((item) => item.compositionVersionId === composition.supersedesCompositionVersionId);
      if (!predecessor || predecessor.version >= composition.version || !sameOfferIdentity(predecessor.offerIdentity, composition.offerIdentity)) {
        issues.push(issue("invalid_composition_lineage", composition.compositionVersionId, "Offer composition successor must reference an earlier version of the same scoped offer."));
      }
    }
  }
  for (const conflict of registry.conflicts) {
    checkRefs(conflict.componentVersionRefs, componentIds, conflict.conflictId, "component", issues);
    if (conflict.state === "resolved" && conflict.resolution === null) issues.push(issue("resolved_conflict_missing_resolution", conflict.conflictId, "Resolved conflicts must retain their resolution."));
    if (conflict.state === "unresolved" && conflict.resolution !== null) issues.push(issue("unresolved_conflict_has_resolution", conflict.conflictId, "Unresolved conflicts cannot select a value."));
  }
  return issues;
}

export function resolveGovernedCommercialOfferV1(input: {
  registry: CommercialSourceGovernanceRegistryV1;
  identity: CommercialOfferIdentityV1;
  asOf: string;
  mode: "current" | "historical";
  merchantScopeRef?: string | null;
}): CommercialOfferResolutionV1 {
  const identityMatches = input.registry.offerCompositionVersions.filter((item) => sameOfferIdentity(item.offerIdentity, input.identity));
  if (identityMatches.length === 0) {
    const brandMatches = input.registry.offerCompositionVersions.some((item) => item.offerIdentity.providerBrand === input.identity.providerBrand);
    return resolution(brandMatches ? "unresolved_channel_or_identity" : "unresolved_not_found", ["No exact provider/channel/plan/scope identity matched the request."]);
  }
  const admitted = identityMatches.filter((item) => item.admission.lifecycle === "admitted");
  if (admitted.length === 0) return resolution("unresolved_not_admitted", ["Candidate and pending records cannot influence governed consumption."]);
  const temporallyApplicable = admitted.filter((item) => periodApplies(item.effectivePeriod, input.asOf, input.mode));
  if (temporallyApplicable.length === 0) return resolution("unresolved_period", ["No period-matched governed offer composition is available."]);
  const live = input.mode === "current"
    ? temporallyApplicable.filter((item) => item.lifecycle === "active_available_last_known" && item.verification === "currently_verified")
    : temporallyApplicable;
  if (live.length === 0) return resolution("unresolved_not_current", ["The offer is not both active and currently verified for a current resolution."]);
  const selected = [...live].sort((a, b) => b.version - a.version)[0]!;
  const components = selected.componentVersionRefs
    .map((ref) => input.registry.priceComponentVersions.find((item) => item.componentVersionId === ref))
    .filter((item): item is CommercialPriceComponentVersionV1 => Boolean(item));
  if (components.some((item) => item.admission.lifecycle !== "admitted" || !periodApplies(item.effectivePeriod, input.asOf, input.mode))) {
    return resolution("unresolved_period", ["A necessary component is not admitted or period-matched."]);
  }
  const unresolvedConflict = input.registry.conflicts.find((item) => item.state === "unresolved" && item.componentVersionRefs.some((ref) => selected.componentVersionRefs.includes(ref)));
  if (unresolvedConflict) return resolution("unresolved_conflict", [`Conflict ${unresolvedConflict.conflictId} remains unresolved; no value was averaged or selected.`]);
  const policies = selected.publicPolicyVersionRefs
    .map((ref) => input.registry.publicPolicyVersions.find((item) => item.policyVersionId === ref))
    .filter((item): item is CommercialPublicPolicyVersionV1 => Boolean(item));
  if (policies.some((item) => item.predicateAdmission.lifecycle !== "admitted" || !periodApplies(item.effectivePeriod, input.asOf, input.mode))) {
    return resolution("unresolved_period", ["A necessary public-policy source is not admitted or period-matched."]);
  }
  const services = selected.serviceScopeVersionRefs
    .map((ref) => input.registry.serviceScopeVersions.find((item) => item.serviceVersionId === ref))
    .filter((item): item is CommercialServiceScopeVersionV1 => Boolean(item));
  const promotions = selected.promotionVersionRefs
    .map((ref) => input.registry.promotionVersions.find((item) => item.promotionVersionId === ref))
    .filter((item): item is CommercialPromotionVersionV1 => Boolean(item));
  if ([...services, ...promotions].some((item) => item.admission.lifecycle !== "admitted" || !periodApplies(item.effectivePeriod, input.asOf, input.mode))) {
    return resolution("unresolved_period", ["A necessary service or promotion source is not admitted or period-matched."]);
  }
  const necessaryObservationRefs = unique([
    ...components.flatMap((item) => item.sourceObservationRefs),
    ...policies.flatMap((item) => item.sourceObservationRefs),
    ...services.flatMap((item) => item.sourceObservationRefs),
    ...promotions.flatMap((item) => item.sourceObservationRefs),
  ]);
  if (necessaryObservationRefs.some((ref) => {
    const observedAt = input.registry.sourceObservations.find((item) => item.observationId === ref)?.provenance.observedAt.slice(0, 10);
    return observedAt === undefined || observedAt > input.asOf;
  })) return resolution("unresolved_period", ["A necessary source observation post-dates the requested period."]);
  const merchantAvailabilityEvidence = input.registry.merchantAvailabilityEvidence.filter((item) =>
    item.admission.lifecycle === "admitted"
    && item.merchantScopeRef === (input.merchantScopeRef ?? null)
    && periodApplies(item.effectivePeriod, input.asOf, input.mode));
  return {
    status: "resolved",
    compositionRef: selected.compositionVersionId,
    componentVersionRefs: [...selected.componentVersionRefs],
    reasons: [],
    publicPolicyStatus: policies[0]?.status ?? "PUBLIC_POLICY_UNKNOWN",
    merchantAvailabilityEvidence,
  };
}

export function summarizeCommercialComponentCompletenessV1(
  components: CommercialPriceComponentVersionV1[],
): {
  knownComponentSubtotalMinor: null;
  subtotalState: "not_calculated_source_layer";
  knownComponentRefs: string[];
  knownAbsentComponentRefs: string[];
  unknownComponentRefs: string[];
  completeForRequestedComponents: boolean;
  automaticLowerBoundAllowed: boolean;
  directionalBound: null | "lower_bound" | "upper_bound";
} {
  const known = components.filter((item): item is CommercialPriceComponentVersionV1 & { completeness: Extract<CommercialCompletenessV1, { state: "KNOWN" }> } => item.completeness.state === "KNOWN");
  const unknown = components.filter((item) => item.completeness.state === "UNKNOWN");
  const partialPresentations = components.filter((item) => item.pricePresentation !== "exact");
  const bounds = unique(components.map((item) => item.directionalBound).filter((item): item is "lower_bound" | "upper_bound" => item !== "none"));
  return {
    knownComponentSubtotalMinor: null,
    subtotalState: "not_calculated_source_layer",
    knownComponentRefs: known.map((item) => item.componentVersionId),
    knownAbsentComponentRefs: components.filter((item) => item.completeness.state === "KNOWN_ABSENT").map((item) => item.componentVersionId),
    unknownComponentRefs: unknown.map((item) => item.componentVersionId),
    completeForRequestedComponents: unknown.length === 0 && partialPresentations.length === 0,
    automaticLowerBoundAllowed: unknown.length === 0 && partialPresentations.length === 0 || bounds.length === 1 && bounds[0] === "lower_bound",
    directionalBound: bounds.length === 1 ? bounds[0]! : null,
  };
}

export function evaluateCommercialPredicateV1(
  predicate: CommercialPredicateV1,
  facts: Partial<Record<CommercialPredicateFactFieldV1, string | number | boolean>>,
): "satisfied" | "not_satisfied" | "unknown" {
  if ("conditions" in predicate) {
    const children = predicate.conditions.map((item) => evaluateCommercialPredicateV1(item, facts));
    if (predicate.op === "and") return children.includes("not_satisfied") ? "not_satisfied" : children.includes("unknown") ? "unknown" : "satisfied";
    return children.includes("satisfied") ? "satisfied" : children.includes("unknown") ? "unknown" : "not_satisfied";
  }
  const actual = facts[predicate.field];
  if (actual === undefined) return "unknown";
  if (typeof actual !== typeof predicate.value) return "unknown";
  switch (predicate.comparator) {
    case "eq": return actual === predicate.value ? "satisfied" : "not_satisfied";
    case "gte": return actual >= predicate.value ? "satisfied" : "not_satisfied";
    case "gt": return actual > predicate.value ? "satisfied" : "not_satisfied";
    case "lte": return actual <= predicate.value ? "satisfied" : "not_satisfied";
    case "lt": return actual < predicate.value ? "satisfied" : "not_satisfied";
  }
  return "unknown";
}

export function evaluateCommercialOfferQualificationV1(
  composition: CommercialOfferCompositionVersionV1,
  facts: Partial<Record<CommercialPredicateFactFieldV1, string | number | boolean>>,
): CommercialOfferQualificationEvaluationV1 {
  if (composition.disqualifyingPredicate && evaluateCommercialPredicateV1(composition.disqualifyingPredicate, facts) === "satisfied") {
    return { state: "NOT_APPLICABLE", reasons: ["A Product-admitted disqualifying condition applies."] };
  }
  const boundary = composition.qualificationBoundary;
  if (boundary && facts[boundary.field] === boundary.exactValue) {
    const scope = boundary.appliesWhen ? evaluateCommercialPredicateV1(boundary.appliesWhen, facts) : "satisfied";
    const otherBranches = composition.qualificationPredicate
      ? evaluateCommercialPredicateV1(composition.qualificationPredicate, facts)
      : "unknown";
    if (otherBranches !== "satisfied" && scope === "satisfied") {
      return { state: "UNRESOLVED_QUALIFICATION_BOUNDARY", reasons: [boundary.reason] };
    }
  }
  if (!composition.qualificationPredicate) return { state: "UNKNOWN", reasons: ["No admitted qualification predicate exists for this offer."] };
  const result = evaluateCommercialPredicateV1(composition.qualificationPredicate, facts);
  if (result === "satisfied") return { state: "QUALIFIED", reasons: ["At least one admitted qualification branch is satisfied."] };
  if (result === "not_satisfied") return { state: "NOT_QUALIFIED", reasons: ["No admitted qualification branch is satisfied."] };
  return { state: "UNKNOWN", reasons: ["Available facts do not resolve all relevant qualification branches."] };
}

export function sameOfferIdentity(left: CommercialOfferIdentityV1, right: CommercialOfferIdentityV1): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function sameCommercialSemanticMeaningV1(left: { f3GovernedSemantic: string }, right: { f3GovernedSemantic: string }): boolean {
  return left.f3GovernedSemantic === right.f3GovernedSemantic;
}

function periodApplies(period: CommercialEffectivePeriodV1, asOf: string, mode: "current" | "historical"): boolean {
  if (mode === "historical" && period.knowledge === "effective_period_unknown") return false;
  if (period.effectiveFrom !== null && asOf < period.effectiveFrom) return false;
  if (period.effectiveTo !== null && asOf >= period.effectiveTo) return false;
  return true;
}

function periodsMayOverlap(left: CommercialEffectivePeriodV1, right: CommercialEffectivePeriodV1): boolean {
  if (left.knowledge === "effective_period_unknown" || right.knowledge === "effective_period_unknown") return true;
  return (left.effectiveTo === null || right.effectiveFrom === null || right.effectiveFrom < left.effectiveTo)
    && (right.effectiveTo === null || left.effectiveFrom === null || left.effectiveFrom < right.effectiveTo);
}

function checkPeriod(period: CommercialEffectivePeriodV1, ref: string, issues: CommercialSourceValidationIssueV1[]): void {
  const validDate = (value: string | null) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!validDate(period.effectiveFrom) || !validDate(period.effectiveTo) || (period.effectiveFrom !== null && period.effectiveTo !== null && period.effectiveFrom >= period.effectiveTo)) {
    issues.push(issue("invalid_effective_period", ref, "Effective period must be a valid closed-open date interval."));
  }
  if (period.knowledge === "effective_period_unknown" && (period.effectiveFrom !== null || period.effectiveTo !== null)) {
    issues.push(issue("unknown_period_has_dates", ref, "Unknown effective period must not carry inferred dates."));
  }
}

function checkAdmission(admission: CommercialAdmissionV1, ref: string, issues: CommercialSourceValidationIssueV1[]): void {
  if (admission.lifecycle === "admitted") {
    if (admission.authorityClass === null || admission.authorityRef === null || admission.admittedAt === null) {
      issues.push(issue("admission_missing_human_authority", ref, "Admitted commercial truth requires Product/human authority and time."));
    }
    if (admission.proposedBy === "ai_or_research" && admission.authorityClass === null) {
      issues.push(issue("ai_self_admission", ref, "AI/research cannot self-admit reusable commercial truth."));
    }
  }
}

function checkObservationRefs(refs: string[], known: Set<string>, owner: string, issues: CommercialSourceValidationIssueV1[]): void {
  if (refs.length === 0) issues.push(issue("missing_source_observation", owner, "Governed terms require source observation provenance."));
  checkRefs(refs, known, owner, "observation", issues);
}

function checkRefs(refs: string[], known: Set<string>, owner: string, kind: string, issues: CommercialSourceValidationIssueV1[]): void {
  for (const ref of refs) if (!known.has(ref)) issues.push(issue(`unknown_${kind}_ref`, owner, `Unknown ${kind} reference ${ref}.`));
}

function uniqueIds(values: string[], kind: string, issues: CommercialSourceValidationIssueV1[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) issues.push(issue(`duplicate_${kind}_id`, value, `Duplicate ${kind} identifier.`));
    seen.add(value);
  }
  return seen;
}

function resolution(status: CommercialOfferResolutionV1["status"], reasons: string[]): CommercialOfferResolutionV1 {
  return { status, compositionRef: null, componentVersionRefs: [], reasons, publicPolicyStatus: null, merchantAvailabilityEvidence: [] };
}

function issue(code: string, ref: string, message: string): CommercialSourceValidationIssueV1 { return { code, ref, message }; }
function isZeroCommercialComponentValue(value: CommercialComponentValueV1): boolean {
  return value.kind === "money" ? value.amountMinor === 0 : value.basisPoints === 0;
}
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
