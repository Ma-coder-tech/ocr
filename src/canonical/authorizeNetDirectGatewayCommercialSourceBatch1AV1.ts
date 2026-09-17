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
  type CommercialSourceClassV1,
  type CommercialSourceObservationV1,
} from "./commercialSourceGovernanceV1.js";

export const AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_BATCH_1A_V1 =
  "authorize_net_direct_gateway_commercial_source_batch_1a_2026_09_10_v1" as const;

export const AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY = {
  document: "RateReveal_AuthorizeNet_Evidence_Completion_Pack_FINAL_Product_Adjudicated_v1.md",
  sha256: "774f12eb3632df2db56034b406230b41d934222e10202500b3aef8493a9fa210",
  section: "all",
} as const;

export const AUTHORIZE_NET_BATCH_1A_FIRST_PARTY_SOURCES = {
  pricing: "https://www.authorize.net/sign-up/pricing.html",
  accountUpdater: "https://www.authorize.net/content/dam/documents/en/account-updater.pdf",
  support: "https://support.authorize.net/knowledgebase/Knowledgearticle/?code=KA-07342",
} as const;

const UNKNOWN_PERIOD: CommercialEffectivePeriodV1 = {
  knowledge: "effective_period_unknown",
  effectiveFrom: null,
  effectiveTo: null,
};

const SUPPORT_TAXONOMY_PERIOD: CommercialEffectivePeriodV1 = {
  knowledge: "partial_interval_known",
  effectiveFrom: "2025-04-09",
  effectiveTo: null,
};

const ADMISSION: CommercialAdmissionV1 = {
  lifecycle: "admitted",
  authorityClass: "product_owner",
  authorityRef: `${AUTHORIZE_NET_BATCH_1A_PRODUCT_AUTHORITY.document}#all`,
  admittedAt: "2026-09-10T00:00:00.000Z",
  proposedBy: "human",
};

export const AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1: CommercialOfferIdentityV1 = {
  providerBrand: "authorize_net",
  sellerIdentity: "authorize_net_direct",
  distributionChannel: "direct",
  namedOffer: "Gateway only",
  productScope: "gateway_only",
  geography: "United States",
  currency: "USD",
  pricingModel: "gateway_fixed_plus_per_event",
  sourceNature: "first_party_public_offer",
};

export const AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1: CommercialOfferIdentityV1 = {
  providerBrand: "authorize_net",
  sellerIdentity: "authorize_net_direct",
  distributionChannel: "direct",
  namedOffer: "Account Updater",
  productScope: "ancillary_service",
  geography: "United States",
  currency: "USD",
  pricingModel: "ancillary_per_successful_update",
  sourceNature: "first_party_public_offer",
};

const PRICING_EXTRACT = [
  "Named direct offer: Gateway only.",
  "Gateway setup fee: $0.00.",
  "Monthly gateway fee: $25.",
  "Returned payment fee: $25 for a returned Authorize.net billing debit.",
  "Late payment fee: $20.",
  "Service reactivation fee: $0.",
  "Abandoned account fee: $10.",
  "Gateway transaction fee: $0.10; the relevant population includes charges, refunds, voids, declines, and related gateway credit-card transaction events.",
  "Batch fee: $0.10 for settled credit-card transaction batches.",
  "Gateway-side credit-card discount-rate field: 0.00%.",
  "Gateway-side monthly minimum: $0 per billing cycle.",
  "Gateway-side chargeback field: $0 per chargeback case.",
  "Automated Recurring Billing setup fee: $0; Automated Recurring Billing monthly fee: $0; Customer Information Manager monthly fee: $0; Advanced Fraud Detection Suite monthly fee: $0.",
  "The Gateway only offer has no gateway contract requirement, no gateway early-termination fee, and may be cancelled without a gateway cancellation penalty.",
].join("\n");
const UPDATER_EXTRACT = [
  "Account Updater is a separately priced ancillary service.",
  "Price: $0.25 per successful updated response; only a successful account update is charged.",
  "Supported card brands stated by the source: Visa and Mastercard.",
  "Stored-card records are supplied through Customer Information Manager or Automated Recurring Billing.",
].join("\n");
const SUPPORT_EXTRACT = [
  "Authorize.net distinguishes direct accounts from partner-sold accounts.",
  "The documented plan taxonomy includes Payment Gateway only as a plan distinct from a merchant account.",
  "Article KA-07342 was last modified 2025-04-09; that date supports taxonomy and architecture existence, not the historical effectiveness of the separately observed 2026 prices.",
].join("\n");

const pricingObservation: CommercialSourceObservationV1 = observation({
  observationId: "commercial_source_obs_authorize_net_direct_gateway_pricing_2026_09_10_v1",
  identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
  sourceClass: "official_provider_pricing",
  sourceLocator: AUTHORIZE_NET_BATCH_1A_FIRST_PARTY_SOURCES.pricing,
  documentIdentity: "Authorize.net U.S. pricing page — Gateway only",
  captureMethod: "rendered_page",
  publicationDate: null,
  lastModifiedDate: null,
  effectivePeriod: UNKNOWN_PERIOD,
  extract: PRICING_EXTRACT,
  limitation: "Observed current on 2026-09-10. Publication and effective dates were not stated. The repository preserves the Product-adjudicated captured content and its authority-pack fingerprint, not a raw byte snapshot of the mutable web page.",
});

const updaterObservation: CommercialSourceObservationV1 = observation({
  observationId: "commercial_source_obs_authorize_net_account_updater_datasheet_2026_09_10_v1",
  identity: AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
  sourceClass: "official_provider_product_documentation",
  sourceLocator: AUTHORIZE_NET_BATCH_1A_FIRST_PARTY_SOURCES.accountUpdater,
  documentIdentity: "Authorize.net Account Updater product datasheet",
  captureMethod: "static_document",
  publicationDate: null,
  lastModifiedDate: null,
  effectivePeriod: UNKNOWN_PERIOD,
  extract: UPDATER_EXTRACT,
  limitation: "Observed on 2026-09-10. Publication and effective dates were not stated. The repository preserves the Product-adjudicated captured content and its authority-pack fingerprint, not a raw byte snapshot of the PDF.",
});

const supportObservation: CommercialSourceObservationV1 = observation({
  observationId: "commercial_source_obs_authorize_net_support_ka_07342_2026_09_10_v1",
  identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
  sourceClass: "official_provider_support",
  sourceLocator: AUTHORIZE_NET_BATCH_1A_FIRST_PARTY_SOURCES.support,
  documentIdentity: "Authorize.net Support Center — KA-07342, How to apply for an Authorize.net account?",
  captureMethod: "rendered_page",
  publicationDate: null,
  lastModifiedDate: "2025-04-09",
  effectivePeriod: SUPPORT_TAXONOMY_PERIOD,
  extract: SUPPORT_EXTRACT,
  limitation: "The 2025-04-09 last-modified date supports direct-versus-partner and plan-taxonomy facts only. It is not evidence that the pricing page's 2026-observed prices applied in 2025.",
});

const components: CommercialPriceComponentVersionV1[] = [
  component("commercial_component_authorize_net_gateway_setup_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "gateway_setup_charge", absentMoney(), "per_gateway_account_setup", "gateway_account_setup", "Gateway setup fee", pricingObservation.observationId),
  component("commercial_component_authorize_net_gateway_monthly_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "monthly_gateway_charge", knownMoney(2500), "per_month", "gateway_account_month", "$25 per month", pricingObservation.observationId),
  component("commercial_component_authorize_net_returned_payment_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "returned_authorize_net_billing_payment_charge", knownMoney(2500), "per_returned_gateway_billing_debit", "returned_authorize_net_billing_debits", "returned Authorize.net billing debit", pricingObservation.observationId),
  component("commercial_component_authorize_net_late_payment_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "late_payment_charge", knownMoney(2000), "per_late_payment_event", "late_authorize_net_billing_payments", "late payment", pricingObservation.observationId),
  component("commercial_component_authorize_net_service_reactivation_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "service_reactivation_charge", absentMoney(), "per_reactivation", "gateway_service_reactivations", "service reactivation", pricingObservation.observationId),
  component("commercial_component_authorize_net_abandoned_account_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "abandoned_account_charge", knownMoney(1000), "per_abandoned_account", "abandoned_gateway_accounts", "abandoned account", pricingObservation.observationId),
  component("commercial_component_authorize_net_gateway_transaction_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "gateway_transaction_charge", knownMoney(10), "per_gateway_transaction", "gateway_credit_card_transaction_events", "charges, refunds, voids, declines, and related gateway credit-card transaction events", pricingObservation.observationId),
  component("commercial_component_authorize_net_gateway_batch_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "gateway_batch_charge", knownMoney(10), "per_batch", "settled_credit_card_transaction_batches", "settled credit-card transaction batches", pricingObservation.observationId),
  component("commercial_component_authorize_net_gateway_discount_rate_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "gateway_side_credit_card_discount_rate", absentRate(), "percent_of_card_charge_volume", "gateway_side_credit_card_charge_volume", "gateway-side credit-card discount-rate field", pricingObservation.observationId),
  component("commercial_component_authorize_net_gateway_monthly_minimum_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "gateway_side_monthly_minimum", absentMoney(), "per_billing_cycle", "gateway_billing_cycles", "gateway-side monthly minimum per billing cycle", pricingObservation.observationId),
  component("commercial_component_authorize_net_gateway_chargeback_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "gateway_side_chargeback_charge", absentMoney(), "per_chargeback_case", "gateway_side_chargeback_cases", "gateway-side chargeback field per chargeback case", pricingObservation.observationId),
  component("commercial_component_authorize_net_arb_setup_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "automated_recurring_billing_setup_charge", absentMoney(), "per_service_setup", "automated_recurring_billing_service_setup", "Automated Recurring Billing setup", pricingObservation.observationId),
  component("commercial_component_authorize_net_arb_monthly_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "automated_recurring_billing_monthly_charge", absentMoney(), "per_month", "automated_recurring_billing_service_month", "Automated Recurring Billing monthly", pricingObservation.observationId),
  component("commercial_component_authorize_net_cim_monthly_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "customer_information_manager_monthly_charge", absentMoney(), "per_month", "customer_information_manager_service_month", "Customer Information Manager monthly", pricingObservation.observationId),
  component("commercial_component_authorize_net_afds_monthly_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "advanced_fraud_detection_suite_monthly_charge", absentMoney(), "per_month", "advanced_fraud_detection_suite_service_month", "Advanced Fraud Detection Suite monthly", pricingObservation.observationId),
  component("commercial_component_authorize_net_acquiring_percentage_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "merchant_account_acquiring_percentage_charge", { state: "UNKNOWN", value: null }, "percent_of_card_charge_volume", "merchant_account_acquiring_card_charge_volume", null, supportObservation.observationId),
  component("commercial_component_authorize_net_acquiring_per_item_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "merchant_account_acquiring_per_item_charge", { state: "UNKNOWN", value: null }, "other", "merchant_account_acquiring_items", null, supportObservation.observationId),
  component("commercial_component_authorize_net_acquiring_chargeback_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "merchant_account_acquiring_chargeback_charge", { state: "UNKNOWN", value: null }, "per_chargeback_case", "merchant_account_acquiring_chargeback_cases", null, supportObservation.observationId),
  component("commercial_component_authorize_net_account_updater_v1", AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1, "account_updater_successful_update_charge", knownMoney(25), "per_successful_update", "successful_account_updates", "successful updated response; only a successful account update is charged", updaterObservation.observationId),
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
  service("commercial_service_authorize_net_gateway_included_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "payment_gateway", "KNOWN_INCLUDED", [pricingObservation.observationId, supportObservation.observationId]),
  service("commercial_service_authorize_net_acquiring_excluded_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "merchant_acquiring_within_gateway_only_offer", "KNOWN_EXCLUDED", [supportObservation.observationId]),
  service("commercial_service_authorize_net_account_updater_excluded_from_base_v1", AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, "account_updater_within_gateway_base_offer", "KNOWN_EXCLUDED", [pricingObservation.observationId, updaterObservation.observationId]),
  service("commercial_service_authorize_net_updater_scope_v1", AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1, "account_updater", "KNOWN_INCLUDED", [updaterObservation.observationId]),
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
  observationRefs: [pricingObservation.observationId, supportObservation.observationId],
});
const updaterComposition = composition({
  id: "commercial_offer_authorize_net_account_updater_composition_v1",
  identity: AUTHORIZE_NET_ACCOUNT_UPDATER_IDENTITY_V1,
  componentRefs: components.filter((item) => item.offerIdentity.productScope === "ancillary_service").map((item) => item.componentVersionId),
  policyRef: updaterPolicy.policyVersionId,
  serviceRefs: services.filter((item) => item.offerIdentity.productScope === "ancillary_service").map((item) => item.serviceVersionId),
  promotionRef: updaterPromotion.promotionVersionId,
  observationRefs: [updaterObservation.observationId],
});

export const AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 = createCommercialSourceGovernanceRegistryV1({
  sourceObservations: [pricingObservation, updaterObservation, supportObservation],
  priceComponentVersions: components,
  publicPolicyVersions: [gatewayPolicy, updaterPolicy],
  predicateProposals: [],
  merchantAvailabilityEvidence: [],
  serviceScopeVersions: services,
  promotionVersions: [gatewayPromotion, updaterPromotion],
  offerCompositionVersions: [gatewayComposition, updaterComposition],
  conflicts: [],
});

function observation(input: {
  observationId: string;
  identity: CommercialOfferIdentityV1;
  sourceClass: CommercialSourceClassV1;
  sourceLocator: string;
  documentIdentity: string;
  captureMethod: CommercialSourceObservationV1["provenance"]["captureMethod"];
  publicationDate: string | null;
  lastModifiedDate: string | null;
  effectivePeriod: CommercialEffectivePeriodV1;
  extract: string;
  limitation: string;
}): CommercialSourceObservationV1 {
  return {
    observationId: input.observationId,
    observationVersion: 1,
    supersedesObservationId: null,
    offerIdentity: input.identity,
    provenance: {
      sourceClass: input.sourceClass,
      sourceLocator: input.sourceLocator,
      documentIdentity: input.documentIdentity,
      captureMethod: input.captureMethod,
      observedAt: "2026-09-10T00:00:00.000Z",
      publicationDate: input.publicationDate,
      lastModifiedDate: input.lastModifiedDate,
      effectivePeriod: input.effectivePeriod,
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

function component(
  id: string,
  identity: CommercialOfferIdentityV1,
  componentIdentity: string,
  completeness: CommercialPriceComponentVersionV1["completeness"],
  unit: CommercialPriceComponentVersionV1["unit"],
  population: string,
  populationWording: string | null,
  observationRef: string,
): CommercialPriceComponentVersionV1 {
  const semantic = {
    componentIdentity,
    offerIdentity: identity,
    completeness,
    unit,
    billedPopulation: population,
    sourceFaithfulPopulationWording: populationWording,
    channelScope: identity.distributionChannel,
    brandOrProductScope: identity.productScope,
    effectivePeriod: UNKNOWN_PERIOD,
    sourceObservationRefs: [observationRef],
    pricePresentation: "exact" as const,
    directionalBound: "none" as const,
  };
  return {
    componentVersionId: id,
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
  observationRefs: string[],
): CommercialServiceScopeVersionV1 {
  const semantic = { offerIdentity: identity, serviceIdentity, state, effectivePeriod: UNKNOWN_PERIOD, sourceObservationRefs: observationRefs };
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
  observationRefs: string[];
}): CommercialOfferCompositionVersionV1 {
  const semantic = {
    offerIdentity: input.identity,
    componentVersionRefs: input.componentRefs,
    publicPolicyVersionRefs: [input.policyRef],
    serviceScopeVersionRefs: input.serviceRefs,
    promotionVersionRefs: [input.promotionRef],
    sourceObservationRefs: input.observationRefs,
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

function knownMoney(amountMinor: number): CommercialPriceComponentVersionV1["completeness"] {
  return { state: "KNOWN", value: { kind: "money", amountMinor, currency: "USD" } };
}

function absentMoney(): CommercialPriceComponentVersionV1["completeness"] {
  return { state: "KNOWN_ABSENT", value: null, observedAbsentValue: { kind: "money", amountMinor: 0, currency: "USD" } };
}

function absentRate(): CommercialPriceComponentVersionV1["completeness"] {
  return { state: "KNOWN_ABSENT", value: null, observedAbsentValue: { kind: "rate", basisPoints: 0, currency: null } };
}
