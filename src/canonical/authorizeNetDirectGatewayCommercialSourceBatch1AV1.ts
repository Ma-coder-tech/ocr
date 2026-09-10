import {
  commercialSourceFingerprintsV1,
  createCommercialSourceGovernanceRegistryV1,
  governedCommercialComponentSemanticFingerprintV1,
  governedCommercialCompositionSemanticFingerprintV1,
  governedCommercialPolicySemanticFingerprintV1,
  governedCommercialPromotionSemanticFingerprintV1,
  governedCommercialServiceSemanticFingerprintV1,
  type CommercialAdmissionV1,
  type CommercialEffectivePeriodV1,
  type CommercialOfferCompositionVersionV1,
  type CommercialOfferIdentityV1,
  type CommercialPriceComponentVersionV1,
  type CommercialPromotionVersionV1,
  type CommercialPublicPolicyVersionV1,
  type CommercialServiceScopeVersionV1,
  type CommercialSourceObservationV1,
} from "./commercialSourceGovernanceV1.js";

export const AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_BATCH_1A_V1 =
  "authorize_net_direct_gateway_commercial_source_batch_1a_2026_09_10_v1" as const;

export const AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY = {
  document: "RateReveal_Comparator_Claim_and_Commercial_Source_Governance_FINAL_Product_Adjudicated_v1.md",
  sha256: "ad2c258fb6f7aaa3ffeee881736d5212776f4b016e4ba5553c1c05dcf53c216e",
  section: "24",
} as const;

const UNKNOWN_PERIOD: CommercialEffectivePeriodV1 = {
  knowledge: "effective_period_unknown",
  effectiveFrom: null,
  effectiveTo: null,
};

const ADMISSION: CommercialAdmissionV1 = {
  lifecycle: "admitted",
  authorityClass: "product_owner",
  authorityRef: `${AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.document}#24`,
  admittedAt: "2026-09-10T00:00:00.000Z",
  proposedBy: "human",
};

export const AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1: CommercialOfferIdentityV1 = {
  providerBrand: "authorize_net",
  sellerIdentity: "authorize_net_direct",
  distributionChannel: "direct",
  namedOffer: "gateway_only_offer_name_not_preserved_in_product_authority",
  productScope: "gateway_only",
  geography: "US",
  currency: "USD",
  pricingModel: "gateway_fee_schedule",
  sourceNature: "product_adjudicated_source_summary",
};

export const AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1: CommercialOfferIdentityV1 = {
  providerBrand: "authorize_net",
  sellerIdentity: "authorize_net_direct",
  distributionChannel: "direct",
  namedOffer: "account_updater_component_source_value_not_preserved_in_product_authority",
  productScope: "ancillary_service",
  geography: "US",
  currency: "USD",
  pricingModel: "ancillary_per_successful_update",
  sourceNature: "product_adjudicated_source_summary",
};

const PRICING_EXTRACT = "a gateway-only/direct pricing view can show a $25 monthly gateway charge, $0.10 transaction and batch components, and explicit zero values for some card-processing gateway fields";
const UPDATER_EXTRACT = "Account Updater has its own per-successful-update pricing.";

const pricingObservation: CommercialSourceObservationV1 = observation({
  observationId: "commercial_source_obs_authorize_net_direct_gateway_2026_09_10_v1",
  identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
  extract: PRICING_EXTRACT,
  limitation: "The governing Product document preserves the adjudicated values but not the underlying first-party URL, exact offer name, publication date, effective date, or names of the zero-valued card-processing fields.",
});

const updaterObservation: CommercialSourceObservationV1 = observation({
  observationId: "commercial_source_obs_authorize_net_account_updater_2026_09_10_v1",
  identity: AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
  extract: UPDATER_EXTRACT,
  limitation: "The governing Product document establishes the per-successful-update mechanic but does not preserve the amount, underlying first-party URL, publication date, or effective date.",
});

const components: CommercialPriceComponentVersionV1[] = [
  component({
    id: "commercial_component_authorize_net_gateway_monthly_v1",
    identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
    componentIdentity: "monthly_gateway_charge",
    completeness: { state: "KNOWN", value: { kind: "money", amountMinor: 2500, currency: "USD" } },
    unit: "per_month",
    population: "gateway_account_month",
    observationRef: pricingObservation.observationId,
  }),
  component({
    id: "commercial_component_authorize_net_gateway_transaction_v1",
    identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
    componentIdentity: "gateway_transaction_charge",
    completeness: { state: "KNOWN", value: { kind: "money", amountMinor: 10, currency: "USD" } },
    unit: "per_gateway_transaction",
    population: "gateway_transactions",
    observationRef: pricingObservation.observationId,
  }),
  component({
    id: "commercial_component_authorize_net_gateway_batch_v1",
    identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
    componentIdentity: "gateway_batch_charge",
    completeness: { state: "KNOWN", value: { kind: "money", amountMinor: 10, currency: "USD" } },
    unit: "per_batch",
    population: "gateway_batches",
    observationRef: pricingObservation.observationId,
  }),
  component({
    id: "commercial_component_authorize_net_card_processing_percentage_v1",
    identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
    componentIdentity: "card_processing_percentage_field",
    completeness: { state: "UNKNOWN", value: null },
    unit: "percent_of_volume",
    population: "card_processing_volume",
    observationRef: pricingObservation.observationId,
  }),
  component({
    id: "commercial_component_authorize_net_card_processing_per_item_v1",
    identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
    componentIdentity: "card_processing_per_item_field",
    completeness: { state: "UNKNOWN", value: null },
    unit: "other",
    population: "card_processing_items",
    observationRef: pricingObservation.observationId,
  }),
  component({
    id: "commercial_component_authorize_net_chargeback_v1",
    identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
    componentIdentity: "chargeback_charge",
    completeness: { state: "UNKNOWN", value: null },
    unit: "other",
    population: "chargeback_cases",
    observationRef: pricingObservation.observationId,
  }),
  component({
    id: "commercial_component_authorize_net_account_updater_v1",
    identity: AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
    componentIdentity: "account_updater_successful_update_charge",
    completeness: { state: "UNKNOWN", value: null },
    unit: "per_successful_update",
    population: "successful_account_updates",
    observationRef: updaterObservation.observationId,
  }),
];

const gatewayPolicy = publicPolicy({
  id: "commercial_policy_authorize_net_gateway_public_policy_unknown_v1",
  identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
  observationRef: pricingObservation.observationId,
});
const updaterPolicy = publicPolicy({
  id: "commercial_policy_authorize_net_account_updater_public_policy_unknown_v1",
  identity: AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
  observationRef: updaterObservation.observationId,
});

const services: CommercialServiceScopeVersionV1[] = [
  service("commercial_service_authorize_net_gateway_included_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "payment_gateway", "KNOWN_INCLUDED", pricingObservation.observationId),
  service("commercial_service_authorize_net_acquiring_excluded_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "merchant_acquiring", "KNOWN_EXCLUDED", pricingObservation.observationId),
  service("commercial_service_authorize_net_account_updater_unknown_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "account_updater", "UNKNOWN", pricingObservation.observationId),
  service("commercial_service_authorize_net_updater_scope_v1", AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1, "account_updater", "KNOWN_INCLUDED", updaterObservation.observationId),
];

const gatewayPromotion = promotion("commercial_promotion_authorize_net_gateway_unknown_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, pricingObservation.observationId);
const updaterPromotion = promotion("commercial_promotion_authorize_net_updater_unknown_v1", AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1, updaterObservation.observationId);

const gatewayComposition = composition({
  id: "commercial_offer_authorize_net_direct_gateway_composition_v1",
  identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
  componentRefs: components.filter((item) => item.offerIdentity.productScope === "gateway_only").map((item) => item.componentVersionId),
  policyRef: gatewayPolicy.policyVersionId,
  serviceRefs: services.filter((item) => item.offerIdentity.productScope === "gateway_only").map((item) => item.serviceVersionId),
  promotionRef: gatewayPromotion.promotionVersionId,
});
const updaterComposition = composition({
  id: "commercial_offer_authorize_net_account_updater_composition_v1",
  identity: AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
  componentRefs: components.filter((item) => item.offerIdentity.productScope === "ancillary_service").map((item) => item.componentVersionId),
  policyRef: updaterPolicy.policyVersionId,
  serviceRefs: services.filter((item) => item.offerIdentity.productScope === "ancillary_service").map((item) => item.serviceVersionId),
  promotionRef: updaterPromotion.promotionVersionId,
});

export const AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 = createCommercialSourceGovernanceRegistryV1({
  sourceObservations: [pricingObservation, updaterObservation],
  priceComponentVersions: components,
  publicPolicyVersions: [gatewayPolicy, updaterPolicy],
  predicateProposals: [],
  merchantAvailabilityEvidence: [],
  serviceScopeVersions: services,
  promotionVersions: [gatewayPromotion, updaterPromotion],
  offerCompositionVersions: [gatewayComposition, updaterComposition],
  conflicts: [],
});

function observation(input: { observationId: string; identity: CommercialOfferIdentityV1; extract: string; limitation: string }): CommercialSourceObservationV1 {
  return {
    observationId: input.observationId,
    observationVersion: 1,
    supersedesObservationId: null,
    offerIdentity: input.identity,
    provenance: {
      sourceClass: "product_adjudication",
      sourceLocator: `${AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.document}#24`,
      documentIdentity: AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.document,
      captureMethod: "product_adjudicated_document",
      observedAt: "2026-09-10T00:00:00.000Z",
      publicationDate: "2026-09-10",
      effectivePeriod: UNKNOWN_PERIOD,
      lastVerifiedAt: "2026-09-10T00:00:00.000Z",
      retrievabilityLimitation: input.limitation,
      rawArtifactRef: `${AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.document}@sha256:${AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.sha256}`,
    },
    sourceFaithfulExtract: input.extract,
    calculatorCapture: null,
    fingerprints: {
      f1RawSourceDocument: AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.sha256,
      f2RelevantCommercialExtract: commercialSourceFingerprintsV1({ rawSourceDocument: "unused", relevantCommercialExtract: input.extract }).f2RelevantCommercialExtract,
    },
  };
}

function component(input: {
  id: string;
  identity: CommercialOfferIdentityV1;
  componentIdentity: string;
  completeness: CommercialPriceComponentVersionV1["completeness"];
  unit: CommercialPriceComponentVersionV1["unit"];
  population: string;
  observationRef: string;
}): CommercialPriceComponentVersionV1 {
  const semantic = {
    componentIdentity: input.componentIdentity,
    offerIdentity: input.identity,
    completeness: input.completeness,
    unit: input.unit,
    billedPopulation: input.population,
    channelScope: input.identity.distributionChannel,
    brandOrProductScope: input.identity.productScope,
    effectivePeriod: UNKNOWN_PERIOD,
    sourceObservationRefs: [input.observationRef],
    pricePresentation: "exact" as const,
    directionalBound: "none" as const,
  };
  return {
    componentVersionId: input.id,
    version: 1,
    supersedesComponentVersionId: null,
    ...semantic,
    admission: ADMISSION,
    f3GovernedSemantic: governedCommercialComponentSemanticFingerprintV1(semantic),
  };
}

function publicPolicy(input: { id: string; identity: CommercialOfferIdentityV1; observationRef: string }): CommercialPublicPolicyVersionV1 {
  const semantic = {
    offerIdentity: input.identity,
    status: "PUBLIC_POLICY_UNKNOWN" as const,
    sourceFaithfulWording: null,
    normalizedPredicate: null,
    effectivePeriod: UNKNOWN_PERIOD,
    sourceObservationRefs: [input.observationRef],
  };
  return {
    policyVersionId: input.id,
    version: 1,
    ...semantic,
    predicateAdmission: ADMISSION,
    f3GovernedSemantic: governedCommercialPolicySemanticFingerprintV1(semantic),
  };
}

function service(
  id: string,
  identity: CommercialOfferIdentityV1,
  serviceIdentity: string,
  state: CommercialServiceScopeVersionV1["state"],
  observationRef: string,
): CommercialServiceScopeVersionV1 {
  const semantic = { offerIdentity: identity, serviceIdentity, state, effectivePeriod: UNKNOWN_PERIOD, sourceObservationRefs: [observationRef] };
  return {
    serviceVersionId: id,
    version: 1,
    ...semantic,
    admission: ADMISSION,
    f3GovernedSemantic: governedCommercialServiceSemanticFingerprintV1(semantic),
  };
}

function promotion(id: string, identity: CommercialOfferIdentityV1, observationRef: string): CommercialPromotionVersionV1 {
  const semantic = {
    offerIdentity: identity,
    status: "unknown" as const,
    conditions: [],
    durationOrExpiration: null,
    reversionTerms: null,
    commitmentRequirements: [],
    effectivePeriod: UNKNOWN_PERIOD,
    sourceObservationRefs: [observationRef],
  };
  return {
    promotionVersionId: id,
    version: 1,
    ...semantic,
    admission: ADMISSION,
    f3GovernedSemantic: governedCommercialPromotionSemanticFingerprintV1(semantic),
  };
}

function composition(input: {
  id: string;
  identity: CommercialOfferIdentityV1;
  componentRefs: string[];
  policyRef: string;
  serviceRefs: string[];
  promotionRef: string;
}): CommercialOfferCompositionVersionV1 {
  const semantic = {
    offerIdentity: input.identity,
    componentVersionRefs: input.componentRefs,
    publicPolicyVersionRefs: [input.policyRef],
    serviceScopeVersionRefs: input.serviceRefs,
    promotionVersionRefs: [input.promotionRef],
    effectivePeriod: UNKNOWN_PERIOD,
    lifecycle: "active_available_last_known" as const,
    verification: "currently_verified" as const,
  };
  return {
    compositionVersionId: input.id,
    version: 1,
    supersedesCompositionVersionId: null,
    ...semantic,
    admission: ADMISSION,
    f3GovernedSemantic: governedCommercialCompositionSemanticFingerprintV1(semantic),
  };
}
