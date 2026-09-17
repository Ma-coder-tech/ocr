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
  type CommercialPredicateV1,
  type CommercialPriceComponentVersionV1,
  type CommercialPromotionVersionV1,
  type CommercialPublicPolicyVersionV1,
  type CommercialServiceScopeVersionV1,
  type CommercialSourceObservationV1,
} from "./commercialSourceGovernanceV1.js";

export const COMMERCIAL_SOURCE_BATCH_1B_HELCIM_DHARMA_V1 =
  "commercial_source_batch_1b_helcim_dharma_2026_09_10_v1" as const;

export const COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY = {
  document: "RateReveal_Helcim_Dharma_Batch_1B_Evidence_Pack_FINAL_Product_Adjudicated_v1.md",
  sha256: "391c4c1ee04a511baf029a58b30dd45c6d1d9c5d72bdf3c0e363ae7b10b62e6d",
  section: "all",
} as const;

export const BATCH_1B_FIRST_PARTY_SOURCES = {
  helcimFeeDisclosures: "https://legal.helcim.com/us/fee-disclosures/",
  helcimPricing: "https://www.helcim.com/pricing/",
  helcimAcceptableUse: "https://legal.helcim.com/us/acceptable-use-policy/",
  helcimTerms: "https://legal.helcim.com/us/terms-of-service/",
  dharmaRetail: "https://dharmamerchantservices.com/industries/retail-small-business/rates-fees/",
  dharmaVirtual: "https://dharmamerchantservices.com/industries/ecommerce-online/rates-fees/",
  dharmaHighVolume: "https://dharmamerchantservices.com/pricing/high-volume-pricing/",
  dharmaSupportedBusinesses: "https://dharmamerchantservices.com/faq/supported-businesses/",
  dharmaClosure: "https://dharmamerchantservices.com/faq/is-there-a-closure-fee/",
  dharmaPci: "https://dharmamerchantservices.com/resources/pci-compliance/",
  dharmaCalculator: "https://dharmamerchantservices.com/calculate-costs/cut-the-fat/",
  dharmaReferralControl: "https://dharmamerchantservices.com/getting-started/teghkhuman/",
} as const;

const UNKNOWN_PERIOD: CommercialEffectivePeriodV1 = { knowledge: "effective_period_unknown", effectiveFrom: null, effectiveTo: null };
const HELCIM_H1_PERIOD: CommercialEffectivePeriodV1 = { knowledge: "partial_interval_known", effectiveFrom: "2026-04-01", effectiveTo: null };
const HELCIM_H4_PERIOD: CommercialEffectivePeriodV1 = { knowledge: "partial_interval_known", effectiveFrom: "2025-07-31", effectiveTo: null };
const ADMISSION: CommercialAdmissionV1 = {
  lifecycle: "admitted",
  authorityClass: "product_owner",
  authorityRef: `${COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY.document}#all`,
  admittedAt: "2026-09-10T00:00:00.000Z",
  proposedBy: "human",
};
const CANDIDATE: CommercialAdmissionV1 = { lifecycle: "candidate", authorityClass: null, authorityRef: null, admittedAt: null, proposedBy: "deterministic_import" };

export const HELCIM_DIRECT_PROCESSING_IDENTITY_V1: CommercialOfferIdentityV1 = {
  providerBrand: "helcim", sellerIdentity: "helcim_direct", distributionChannel: "direct", namedOffer: "Helcim U.S. direct public processing",
  productScope: "all_in_one_processing", geography: "United States", currency: "USD", pricingModel: "interchange_plus_cost_plus_tiered_margin", sourceNature: "first_party_public_offer",
};
export const DHARMA_STANDARD_RETAIL_IDENTITY_V1 = dharmaIdentity("Standard Retail / Storefront");
export const DHARMA_STANDARD_VIRTUAL_IDENTITY_V1 = dharmaIdentity("Standard Virtual / Online");
export const DHARMA_HIGH_VOLUME_IDENTITY_V1 = dharmaIdentity("High Volume");
export const DHARMA_PROVIDER_POLICY_IDENTITY_V1: CommercialOfferIdentityV1 = {
  ...dharmaIdentity("Provider-wide public policy evidence"), productScope: "other", pricingModel: "provider_policy_not_a_price_offer", sourceNature: "public_provider_offer",
};
export const DHARMA_CALCULATOR_OBSERVATION_IDENTITY_V1: CommercialOfferIdentityV1 = {
  ...dharmaIdentity("Direct-plan calculator observation"), productScope: "other", pricingModel: "dynamic_calculator_observation", sourceNature: "public_provider_offer",
};
export const DHARMA_REFERRAL_CONTROL_IDENTITY_V1: CommercialOfferIdentityV1 = {
  ...dharmaIdentity("Teghkhuman referral / special offer"), sellerIdentity: "dharma_referral_teghkhuman", distributionChannel: "isv_referral", sourceNature: "reseller_partner_offer",
};

const H1_EXTRACT = [
  "Effective April 1, 2026. Tier assignment uses a three-month rolling processing average of all card-based transactions.",
  "$0-$50,000: card-present 0.40% + $0.08; card-not-present 0.50% + $0.25.",
  "$50,001-$100,000: card-present 0.35% + $0.07; card-not-present 0.45% + $0.20.",
  "$100,001-$500,000: card-present 0.25% + $0.07; card-not-present 0.35% + $0.20.",
  "$500,001-$1,000,000: card-present 0.20% + $0.06; card-not-present 0.25% + $0.15.",
  "$1,000,001+: card-present 0.15% + $0.06; card-not-present 0.15% + $0.15.",
  "Card-present means chip/PIN, chip/signature, swipe, and tap/NFC. Card-not-present/keyed includes Virtual Terminal, Card Vault, and Ecommerce manual entry.",
  "Helcim states that interchange and network costs are passed through and its margin is added; this is a provider-offer representation, not independent network-par proof.",
].join("\n");
const H2_EXTRACT = [
  "Current public presentation shows the top posted tier as $1M-$5M and directs merchants above $5M to contact sales for custom pricing.",
  "Current direct public pricing states no account monthly, monthly minimum, statement, signup/setup, PCI compliance, cancellation/termination, card/customer-data migration, or annual fee.",
  "Chargeback assessment is $15 per occurrence and is fully refunded when the merchant wins.",
  "Applicable recurring-payment transactions add 0.4%. ACH reject/return is $5. Tap to Pay on iPhone is $0.10 per approved transaction. Mobile Data Service is $7 monthly. Level 2/3 optimization retains 30% of generated interchange savings.",
].join("\n");
const H3_EXTRACT = [
  "The Acceptable Use Policy separately identifies prohibited businesses and restricted businesses requiring additional review.",
  "Product-adjudicated prohibited examples include specified delayed-delivery, travel/timeshare, gambling, cannabis, crypto/NFT, money-service/debt, weapon/firearm, and online/mail/telephone tobacco/vape categories.",
  "Product-adjudicated restricted examples include charities, crowdfunding, licensed telemedicine, membership/gyms, auctions/art/collectibles/luxury/jewelry, hardware/software, events/advance ticketing, lodging/hotels, and marketplaces/payment facilitators.",
  "Restricted does not mean rejected; absence of a listed issue does not mean approved.",
].join("\n");
const H4_EXTRACT = "Helcim may reject an application. A public price is not merchant-specific approval or confirmed availability.";

const observations: CommercialSourceObservationV1[] = [
  obs("obs_helcim_h1_fee_disclosures_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.helcimFeeDisclosures, "Helcim U.S. Fee Disclosures", H1_EXTRACT, HELCIM_H1_PERIOD, "2026-02-02"),
  obs("obs_helcim_h2_public_pricing_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.helcimPricing, "Helcim public pricing", H2_EXTRACT, UNKNOWN_PERIOD, null),
  obs("obs_helcim_h3_acceptable_use_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.helcimAcceptableUse, "Helcim U.S. Acceptable Use Policy", H3_EXTRACT, UNKNOWN_PERIOD, "2025-08-15", "official_provider_policy"),
  obs("obs_helcim_h4_terms_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.helcimTerms, "Helcim U.S. Merchant Terms", H4_EXTRACT, HELCIM_H4_PERIOD, "2025-06-30", "official_provider_policy"),
  obs("obs_dharma_d1_retail_v1", DHARMA_STANDARD_RETAIL_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaRetail, "Dharma Small Business & Retail Rates", dharmaPlanExtract("retail"), UNKNOWN_PERIOD, null),
  obs("obs_dharma_d2_virtual_v1", DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaVirtual, "Dharma Virtual & Online Rates", dharmaPlanExtract("virtual"), UNKNOWN_PERIOD, null),
  obs("obs_dharma_d3_high_volume_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaHighVolume, "Dharma High-Volume Pricing", dharmaPlanExtract("high_volume"), UNKNOWN_PERIOD, null),
  obs("obs_dharma_d4_supported_businesses_v1", DHARMA_PROVIDER_POLICY_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaSupportedBusinesses, "Dharma Supported Businesses", "Known high-risk accounts are not applicable to High Volume. Future-delivery, custom-built, deposit, recurring-billing, and other source-defined may-apply conditions require review rather than automatic rejection. No listed issue is not approval.", UNKNOWN_PERIOD, null, "official_provider_policy"),
  obs("obs_dharma_d5_closure_v1", DHARMA_PROVIDER_POLICY_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaClosure, "Dharma Closure Fee FAQ", "Account closure fee is $49. Early termination fee is separately stated as absent. Closure and early termination are distinct constructs.", UNKNOWN_PERIOD, null),
  obs("obs_dharma_d6_pci_v1", DHARMA_PROVIDER_POLICY_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaPci, "Dharma PCI Compliance", "PCI compliance fee is absent. A separate PCI non-compliance fee is $39.95 per month when the source-defined non-compliance condition applies.", UNKNOWN_PERIOD, null),
  obs("obs_dharma_calculator_conflict_v1", DHARMA_CALCULATOR_OBSERVATION_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaCalculator, "Dharma Cut the Fat calculator", "Calculator displays $25 monthly for Standard Retail, $25 for Standard Virtual, and $20 for High Volume; these conflict with the specifically scoped current plan pages.", UNKNOWN_PERIOD, null, "official_provider_pricing", { standardRetailMonthlyMinor: 2500, standardVirtualMonthlyMinor: 2500, highVolumeMonthlyMinor: 2000 }),
  obs("obs_dharma_referral_isolation_v1", DHARMA_REFERRAL_CONTROL_IDENTITY_V1, BATCH_1B_FIRST_PARTY_SOURCES.dharmaReferralControl, "Dharma referral/special-offer isolation control", "Referral/special-offer page states High Volume at $12 monthly. Product authorizes this only as channel-isolation evidence; it is not direct Dharma pricing.", UNKNOWN_PERIOD, null),
];

const H1 = "obs_helcim_h1_fee_disclosures_v1";
const H2 = "obs_helcim_h2_public_pricing_v1";
const H3 = "obs_helcim_h3_acceptable_use_v1";
const H4 = "obs_helcim_h4_terms_v1";
const D1 = "obs_dharma_d1_retail_v1";
const D2 = "obs_dharma_d2_virtual_v1";
const D3 = "obs_dharma_d3_high_volume_v1";
const D4 = "obs_dharma_d4_supported_businesses_v1";
const D5 = "obs_dharma_d5_closure_v1";
const D6 = "obs_dharma_d6_pci_v1";
const DC = "obs_dharma_calculator_conflict_v1";

const helcimComponents: CommercialPriceComponentVersionV1[] = [];
const tiers = [
  { id: "t1", min: null, max: 5_000_000, cpRate: 40, cpItem: 8, cnpRate: 50, cnpItem: 25, wording: "$0-$50,000" },
  { id: "t2", min: 5_000_000, max: 10_000_000, cpRate: 35, cpItem: 7, cnpRate: 45, cnpItem: 20, wording: "$50,001-$100,000" },
  { id: "t3", min: 10_000_000, max: 50_000_000, cpRate: 25, cpItem: 7, cnpRate: 35, cnpItem: 20, wording: "$100,001-$500,000" },
  { id: "t4", min: 50_000_000, max: 100_000_000, cpRate: 20, cpItem: 6, cnpRate: 25, cnpItem: 15, wording: "$500,001-$1,000,000" },
  { id: "t5", min: 100_000_000, max: 500_000_000, cpRate: 15, cpItem: 6, cnpRate: 15, cnpItem: 15, wording: "H1 $1,000,001+; current H2 public scope limited to $1M-$5M" },
];
for (const tier of tiers) {
  for (const channel of ["card_present", "card_not_present"] as const) {
    const applicability = tierPredicate(tier.min, tier.max, channel);
    const rate = channel === "card_present" ? tier.cpRate : tier.cnpRate;
    const item = channel === "card_present" ? tier.cpItem : tier.cnpItem;
    const refs = tier.id === "t5" ? [H1, H2] : [H1];
    helcimComponents.push(component(`component_helcim_${tier.id}_${channel}_rate_v1`, HELCIM_DIRECT_PROCESSING_IDENTITY_V1, `processing_margin_${tier.id}_${channel}_rate`, knownRate(rate), "percent_of_card_charge_volume", `${channel}_card_charge_volume_in_${tier.id}`, `${tier.wording}; ${channel}; percentage margin`, HELCIM_H1_PERIOD, refs, applicability));
    helcimComponents.push(component(`component_helcim_${tier.id}_${channel}_item_v1`, HELCIM_DIRECT_PROCESSING_IDENTITY_V1, `processing_margin_${tier.id}_${channel}_per_transaction`, knownMoney(item), "per_card_transaction", `${channel}_card_transactions_in_${tier.id}`, `${tier.wording}; ${channel}; per transaction`, HELCIM_H1_PERIOD, refs, applicability));
  }
}
for (const name of ["account_monthly_fee", "monthly_minimum", "statement_fee", "signup_setup_fee", "pci_compliance_fee", "cancellation_termination_fee", "card_customer_data_migration_fee", "annual_fee"]) {
  helcimComponents.push(component(`component_helcim_${name}_absent_v1`, HELCIM_DIRECT_PROCESSING_IDENTITY_V1, name, absentMoney(), name === "annual_fee" ? "per_year" : "per_month", `helcim_direct_${name}`, `No ${name.replaceAll("_", " ")}`, UNKNOWN_PERIOD, [H2]));
}
helcimComponents.push(component("component_helcim_chargeback_gross_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "chargeback_assessment", knownMoney(1500), "per_chargeback_case", "chargeback_occurrences", "$15 per occurrence; fully refunded when resolved in merchant favor", UNKNOWN_PERIOD, [H2], null, {
  kind: "full_fee_refund", condition: fact("chargeback_resolved_in_merchant_favor", "eq", true), result: "net_zero_for_assessed_component", sourceFaithfulWording: "Full fee refund / net zero when resolved in merchant favor.",
}));
helcimComponents.push(component("component_helcim_recurring_surcharge_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "recurring_payment_additional_margin", knownRate(40), "percent_of_card_charge_volume", "applicable_recurring_payment_transaction_volume", "+0.4% for applicable recurring-payment transactions", UNKNOWN_PERIOD, [H2], fact("transaction_is_recurring", "eq", true)));
helcimComponents.push(component("component_helcim_ach_return_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "ach_reject_return_fee", knownMoney(500), "per_ach_reject_or_return", "rejected_or_returned_ach_transactions", "$5 per rejected or returned bank-network transaction", UNKNOWN_PERIOD, [H2]));
helcimComponents.push(component("component_helcim_tap_to_pay_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "tap_to_pay_on_iphone_fee", knownMoney(10), "per_approved_tap_to_pay_transaction", "approved_tap_to_pay_on_iphone_transactions", "$0.10 per approved transaction", UNKNOWN_PERIOD, [H2]));
helcimComponents.push(component("component_helcim_mobile_data_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "mobile_data_service_fee", knownMoney(700), "per_month", "subscribed_mobile_data_service_months", "$7 per month with the stated allowance", UNKNOWN_PERIOD, [H2]));
helcimComponents.push(component("component_helcim_level23_retention_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "level_2_3_optimization_retained_savings", knownRate(3000), "percent_of_generated_interchange_savings", "generated_level_2_3_interchange_savings", "Helcim retains 30% of generated interchange savings", UNKNOWN_PERIOD, [H2]));

const dharmaComponents = [
  ...dharmaPlanComponents(DHARMA_STANDARD_RETAIL_IDENTITY_V1, D1, "retail", 2000, 15, 25, 8, 8),
  ...dharmaPlanComponents(DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, D2, "virtual", 2000, 20, 30, 11, 11),
  ...dharmaPlanComponents(DHARMA_HIGH_VOLUME_IDENTITY_V1, D3, "high_volume", 1500, 10, 20, 8, 11),
];
for (const [identity, prefix, source] of [[DHARMA_STANDARD_RETAIL_IDENTITY_V1, "retail", D1], [DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, "virtual", D2], [DHARMA_HIGH_VOLUME_IDENTITY_V1, "high_volume", D3]] as const) {
  dharmaComponents.push(component(`component_dharma_${prefix}_closure_v1`, identity, "account_closure_fee", knownMoney(4900), "other", "account_closure_events", "$49 account closure fee; not an early termination fee", UNKNOWN_PERIOD, [source, D5]));
  dharmaComponents.push(component(`component_dharma_${prefix}_chargeback_v1`, identity, "chargeback_fee", knownMoney(2500), "per_chargeback_case", "chargeback_instances", "$25 per chargeback instance", UNKNOWN_PERIOD, [source]));
  for (const absent of ["avs_fee", "batch_fee", "pci_compliance_fee", "early_termination_fee"]) {
    dharmaComponents.push(component(`component_dharma_${prefix}_${absent}_absent_v1`, identity, absent, absentMoney(), absent === "batch_fee" ? "per_batch" : "other", `${prefix}_${absent}`, `No ${absent.replaceAll("_", " ")}`, UNKNOWN_PERIOD, [source, ...(absent === "pci_compliance_fee" ? [D6] : [])]));
  }
  dharmaComponents.push(component(`component_dharma_${prefix}_pci_noncompliance_v1`, identity, "pci_noncompliance_fee", knownMoney(3995), "per_month", "months_while_source_defined_pci_noncompliance_applies", "$39.95 monthly when the source-defined PCI non-compliance condition applies", UNKNOWN_PERIOD, [D6], fact("pci_non_compliant", "eq", true)));
}
for (const absent of ["annual_fee", "monthly_minimum"]) dharmaComponents.push(component(`component_dharma_retail_${absent}_absent_v1`, DHARMA_STANDARD_RETAIL_IDENTITY_V1, absent, absentMoney(), absent === "annual_fee" ? "per_year" : "per_month", `retail_${absent}`, `No ${absent.replaceAll("_", " ")}`, UNKNOWN_PERIOD, [D1]));
dharmaComponents.push(component("component_dharma_retail_account_updater_unknown_v1", DHARMA_STANDARD_RETAIL_IDENTITY_V1, "normalized_account_updater_service_price", { state: "UNKNOWN", value: null }, "other", "unresolved_account_updater_construct", "Source says 'Account Update Fee: No'; construct match to a governed Account Updater product/mechanic is unresolved", UNKNOWN_PERIOD, [D1]));

const calculatorCandidates = [
  component("candidate_dharma_calculator_retail_monthly_v1", DHARMA_STANDARD_RETAIL_IDENTITY_V1, "monthly_plan_fee", knownMoney(2500), "per_month", "account_months", "Calculator: Standard Retail $25 monthly", UNKNOWN_PERIOD, [DC], null, null, CANDIDATE),
  component("candidate_dharma_calculator_virtual_monthly_v1", DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, "monthly_plan_fee", knownMoney(2500), "per_month", "account_months", "Calculator: Standard Virtual $25 monthly", UNKNOWN_PERIOD, [DC], null, null, CANDIDATE),
  component("candidate_dharma_calculator_high_volume_monthly_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, "monthly_plan_fee", knownMoney(2000), "per_month", "account_months", "Calculator: High Volume $20 monthly", UNKNOWN_PERIOD, [DC], null, null, CANDIDATE),
];

const helcimPolicies = [
  policy("policy_helcim_prohibited_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "PUBLICLY_PROHIBITED", "Product-adjudicated prohibited categories remain the enumerated H3 categories; prohibited is not a synonym for generic high-risk.", merchantTypes([
    "specified_delayed_delivery", "major_airline_cruise_car_rental_travel_tour_timeshare", "specified_gambling", "cannabis", "crypto_or_nft", "specified_financial_debt_or_money_service", "certain_weapon_or_firearm", "online_mail_or_telephone_tobacco_or_vape",
  ]), [H3], UNKNOWN_PERIOD),
  policy("policy_helcim_restricted_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED", "Product-adjudicated restricted categories require review and are not rejected by this public-policy state.", merchantTypes([
    "charity", "crowdfunding", "licensed_telemedicine", "gym_or_membership", "auction_art_collectible_luxury_or_jewelry", "hardware_or_software", "event_or_advance_ticketing", "lodging_or_hotel", "marketplace_or_payment_facilitator",
  ]), [H3], UNKNOWN_PERIOD),
  policy("policy_helcim_no_known_block_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, "NO_KNOWN_PUBLIC_BLOCK", "No matched public block is not approval; Helcim may still reject an application.", fact("merchant_type", "eq", "no_listed_h3_issue"), [H3, H4], UNKNOWN_PERIOD),
];
const dharmaHighPolicies = [
  policy("policy_dharma_high_risk_not_applicable_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, "PUBLICLY_PROHIBITED", "Known high-risk account: High-Volume offer is not applicable; this is offer applicability, not a universal rejection claim.", fact("known_high_risk", "eq", true), [D4], UNKNOWN_PERIOD),
  policy("policy_dharma_future_delivery_review_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, "PUBLICLY_RESTRICTED_OR_REVIEW_REQUIRED", "Future-delivery/custom-built/deposit/recurring/open-ended billing conditions may require review; they are not automatic rejection.", fact("future_delivery_or_custom_deposit_or_open_ended_billing", "eq", true), [D4], UNKNOWN_PERIOD),
  policy("policy_dharma_no_known_block_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, "NO_KNOWN_PUBLIC_BLOCK", "No listed issue means no known public block, not merchant approval.", fact("risk_review_required", "eq", false), [D4], UNKNOWN_PERIOD),
];
const genericPolicies = [
  policy("policy_dharma_retail_unknown_v1", DHARMA_STANDARD_RETAIL_IDENTITY_V1, "PUBLIC_POLICY_UNKNOWN", null, null, [D1], UNKNOWN_PERIOD),
  policy("policy_dharma_virtual_unknown_v1", DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, "PUBLIC_POLICY_UNKNOWN", null, null, [D2], UNKNOWN_PERIOD),
];

const services = [
  ...includedServices(DHARMA_STANDARD_RETAIL_IDENTITY_V1, "retail", D1),
  ...includedServices(DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, "virtual", D2),
  ...includedServices(DHARMA_HIGH_VOLUME_IDENTITY_V1, "high_volume", D3),
];
const promotions = [
  promotion("promotion_helcim_unknown_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, H2),
  promotion("promotion_dharma_retail_unknown_v1", DHARMA_STANDARD_RETAIL_IDENTITY_V1, D1),
  promotion("promotion_dharma_virtual_unknown_v1", DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, D2),
  promotion("promotion_dharma_high_volume_unknown_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, D3),
];

const helcimComposition = composition("offer_helcim_direct_processing_v1", HELCIM_DIRECT_PROCESSING_IDENTITY_V1, helcimComponents, helcimPolicies, [], promotions[0]!, [H1, H2, H3, H4], HELCIM_H1_PERIOD);
const retailComposition = composition("offer_dharma_standard_retail_v1", DHARMA_STANDARD_RETAIL_IDENTITY_V1, dharmaComponents.filter((x) => x.offerIdentity.namedOffer === "Standard Retail / Storefront"), [genericPolicies[0]!], services.filter((x) => x.offerIdentity.namedOffer === "Standard Retail / Storefront"), promotions[1]!, [D1, D5, D6], UNKNOWN_PERIOD);
const virtualComposition = composition("offer_dharma_standard_virtual_v1", DHARMA_STANDARD_VIRTUAL_IDENTITY_V1, dharmaComponents.filter((x) => x.offerIdentity.namedOffer === "Standard Virtual / Online"), [genericPolicies[1]!], services.filter((x) => x.offerIdentity.namedOffer === "Standard Virtual / Online"), promotions[2]!, [D2, D5, D6], UNKNOWN_PERIOD);
const highVolumeQualification: CommercialPredicateV1 = { op: "or", conditions: [
  fact("monthly_volume_minor", "gt", 10_000_000),
  fact("transaction_count", "gt", 5000),
  { op: "and", conditions: [fact("merchant_type", "eq", "restaurant"), fact("average_ticket_minor", "lt", 2500)] },
] };
const highComposition = composition("offer_dharma_high_volume_v1", DHARMA_HIGH_VOLUME_IDENTITY_V1, dharmaComponents.filter((x) => x.offerIdentity.namedOffer === "High Volume"), dharmaHighPolicies, services.filter((x) => x.offerIdentity.namedOffer === "High Volume"), promotions[3]!, [D3, D4, D5, D6], UNKNOWN_PERIOD, highVolumeQualification, {
  field: "average_ticket_minor", exactValue: 2500, state: "UNRESOLVED_QUALIFICATION_BOUNDARY", appliesWhen: fact("merchant_type", "eq", "restaurant"), sourceObservationRefs: [D3], reason: "First-party wording conflicts between 'less than $25' and '$25 or less'; exactly $25 remains unresolved unless another OR branch independently qualifies.",
}, fact("known_high_risk", "eq", true));

export const HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 = createCommercialSourceGovernanceRegistryV1({
  sourceObservations: observations,
  priceComponentVersions: [...helcimComponents, ...dharmaComponents, ...calculatorCandidates],
  publicPolicyVersions: [...helcimPolicies, ...genericPolicies, ...dharmaHighPolicies],
  predicateProposals: [],
  merchantAvailabilityEvidence: [],
  serviceScopeVersions: services,
  promotionVersions: promotions,
  offerCompositionVersions: [helcimComposition, retailComposition, virtualComposition, highComposition],
  conflicts: [
    resolvedCalculatorConflict("conflict_dharma_retail_monthly_calculator_v1", "component_dharma_retail_monthly_v1", calculatorCandidates[0]!.componentVersionId),
    resolvedCalculatorConflict("conflict_dharma_virtual_monthly_calculator_v1", "component_dharma_virtual_monthly_v1", calculatorCandidates[1]!.componentVersionId),
    resolvedCalculatorConflict("conflict_dharma_high_volume_monthly_calculator_v1", "component_dharma_high_volume_monthly_v1", calculatorCandidates[2]!.componentVersionId),
  ],
});

function dharmaIdentity(namedOffer: string): CommercialOfferIdentityV1 {
  return { providerBrand: "dharma_merchant_services", sellerIdentity: "dharma_direct", distributionChannel: "direct", namedOffer, productScope: "all_in_one_processing", geography: "United States", currency: "USD", pricingModel: "interchange_plus", sourceNature: "first_party_public_offer" };
}
function obs(id: string, identity: CommercialOfferIdentityV1, locator: string, documentIdentity: string, extract: string, period: CommercialEffectivePeriodV1, lastModifiedDate: string | null, sourceClass: CommercialSourceObservationV1["provenance"]["sourceClass"] = "official_provider_pricing", calculatorOutputs?: Record<string, number>): CommercialSourceObservationV1 {
  return { observationId: id, observationVersion: 1, supersedesObservationId: null, offerIdentity: identity, provenance: { sourceClass, sourceLocator: locator, documentIdentity, captureMethod: calculatorOutputs ? "dynamic_calculator" : "product_adjudicated_document", observedAt: "2026-09-10T00:00:00.000Z", publicationDate: null, lastModifiedDate, effectivePeriod: period, lastVerifiedAt: "2026-09-10T00:00:00.000Z", retrievabilityLimitation: "Product-adjudicated source extract is preserved; immutable raw first-party page bytes are not present in this checkpoint.", rawArtifactRef: `${COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY.document}@sha256:${COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY.sha256}` }, sourceFaithfulExtract: extract, calculatorCapture: calculatorOutputs ? { exactInputs: {}, exactOutputs: calculatorOutputs, selectionState: {}, termsAndFootnotes: [], reproducibilityLimitation: "Product-adjudicated calculator observation; no live replay was authorized." } : null, fingerprints: { f1RawSourceDocument: COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY.sha256, f2RelevantCommercialExtract: commercialSourceFingerprintsV1({ rawSourceDocument: "unused", relevantCommercialExtract: extract }).f2RelevantCommercialExtract } };
}
function component(id: string, identity: CommercialOfferIdentityV1, componentIdentity: string, completeness: CommercialPriceComponentVersionV1["completeness"], unit: CommercialPriceComponentVersionV1["unit"], population: string, wording: string, period: CommercialEffectivePeriodV1, refs: string[], applicabilityPredicate: CommercialPredicateV1 | null = null, conditionalAdjustment: CommercialPriceComponentVersionV1["conditionalAdjustment"] = null, admission: CommercialAdmissionV1 = ADMISSION): CommercialPriceComponentVersionV1 {
  const semantic = { componentIdentity, offerIdentity: identity, completeness, unit, billedPopulation: population, sourceFaithfulPopulationWording: wording, channelScope: identity.distributionChannel, brandOrProductScope: identity.namedOffer, effectivePeriod: period, sourceObservationRefs: refs, pricePresentation: "exact" as const, directionalBound: "none" as const, applicabilityPredicate, conditionalAdjustment };
  return { componentVersionId: id, version: 1, supersedesComponentVersionId: null, ...semantic, admission, f3GovernedSemantic: governedCommercialComponentSemanticFingerprintV1(semantic) };
}
function policy(id: string, identity: CommercialOfferIdentityV1, status: CommercialPublicPolicyVersionV1["status"], wording: string | null, predicate: CommercialPredicateV1 | null, refs: string[], period: CommercialEffectivePeriodV1): CommercialPublicPolicyVersionV1 {
  const semantic = { offerIdentity: identity, status, sourceFaithfulWording: wording, normalizedPredicate: predicate, effectivePeriod: period, sourceObservationRefs: refs };
  return { policyVersionId: id, version: 1, ...semantic, predicateAdmission: ADMISSION, f3GovernedSemantic: governedCommercialPolicySemanticFingerprintV1(semantic) };
}
function promotion(id: string, identity: CommercialOfferIdentityV1, ref: string): CommercialPromotionVersionV1 {
  const semantic = { offerIdentity: identity, status: "unknown" as const, conditions: [], durationOrExpiration: null, reversionTerms: null, commitmentRequirements: [], effectivePeriod: identity.providerBrand === "helcim" ? HELCIM_H1_PERIOD : UNKNOWN_PERIOD, sourceObservationRefs: [ref] };
  return { promotionVersionId: id, version: 1, ...semantic, admission: ADMISSION, f3GovernedSemantic: governedCommercialPromotionSemanticFingerprintV1(semantic) };
}
function composition(id: string, identity: CommercialOfferIdentityV1, components: CommercialPriceComponentVersionV1[], policies: CommercialPublicPolicyVersionV1[], scopedServices: CommercialServiceScopeVersionV1[], promo: CommercialPromotionVersionV1, refs: string[], period: CommercialEffectivePeriodV1, qualificationPredicate: CommercialPredicateV1 | null = null, qualificationBoundary: CommercialOfferCompositionVersionV1["qualificationBoundary"] = null, disqualifyingPredicate: CommercialPredicateV1 | null = null): CommercialOfferCompositionVersionV1 {
  const semantic = { offerIdentity: identity, componentVersionRefs: components.filter((x) => x.admission.lifecycle === "admitted").map((x) => x.componentVersionId), publicPolicyVersionRefs: policies.map((x) => x.policyVersionId), serviceScopeVersionRefs: scopedServices.map((x) => x.serviceVersionId), promotionVersionRefs: [promo.promotionVersionId], sourceObservationRefs: refs, effectivePeriod: period, lifecycle: "active_available_last_known" as const, verification: "currently_verified" as const, qualificationPredicate, qualificationBoundary, disqualifyingPredicate };
  return { compositionVersionId: id, version: 1, supersedesCompositionVersionId: null, ...semantic, admission: ADMISSION, f3GovernedSemantic: governedCommercialCompositionSemanticFingerprintV1(semantic) };
}
function service(id: string, identity: CommercialOfferIdentityV1, serviceIdentity: string, state: CommercialServiceScopeVersionV1["state"], ref: string): CommercialServiceScopeVersionV1 {
  const semantic = { offerIdentity: identity, serviceIdentity, state, effectivePeriod: UNKNOWN_PERIOD, sourceObservationRefs: [ref] };
  return { serviceVersionId: id, version: 1, ...semantic, admission: ADMISSION, f3GovernedSemantic: governedCommercialServiceSemanticFingerprintV1(semantic) };
}
function includedServices(identity: CommercialOfferIdentityV1, prefix: string, ref: string): CommercialServiceScopeVersionV1[] { return [service(`service_dharma_${prefix}_virtual_terminal_v1`, identity, "virtual_terminal_without_separate_fee", "KNOWN_INCLUDED", ref), service(`service_dharma_${prefix}_mobile_processing_v1`, identity, "mobile_processing_without_separate_fee", "KNOWN_INCLUDED", ref)]; }
function dharmaPlanComponents(identity: CommercialOfferIdentityV1, ref: string, prefix: string, monthly: number, vmdRate: number, amexRate: number, cpItem: number, cnpItem: number): CommercialPriceComponentVersionV1[] {
  const result = [component(`component_dharma_${prefix}_monthly_v1`, identity, "monthly_plan_fee", knownMoney(monthly), "per_month", "account_months", `$${(monthly / 100).toFixed(2)} monthly`, UNKNOWN_PERIOD, [ref]), component(`component_dharma_${prefix}_vmd_margin_v1`, identity, "visa_mastercard_discover_processing_margin", knownRate(vmdRate), "percent_of_card_charge_volume", "visa_mastercard_discover_card_charge_volume", `${(vmdRate / 100).toFixed(2)}% provider margin; stated pass-through-at-cost is provider-offer representation only`, UNKNOWN_PERIOD, [ref]), component(`component_dharma_${prefix}_amex_margin_v1`, identity, "amex_processing_margin", knownRate(amexRate), "percent_of_card_charge_volume", "amex_card_charge_volume", `${(amexRate / 100).toFixed(2)}% provider margin`, UNKNOWN_PERIOD, [ref])];
  if (prefix === "high_volume") {
    result.push(component(`component_dharma_${prefix}_cp_auth_v1`, identity, "card_present_authorization_fee", knownMoney(cpItem), "per_authorization", "card_present_authorizations", "$0.08 per card-present authorization", UNKNOWN_PERIOD, [ref]));
    result.push(component(`component_dharma_${prefix}_cnp_auth_v1`, identity, "card_not_present_authorization_fee", knownMoney(cnpItem), "per_authorization", "card_not_present_authorizations", "$0.11 per card-not-present authorization", UNKNOWN_PERIOD, [ref]));
  } else {
    result.push(component(`component_dharma_${prefix}_vmd_auth_v1`, identity, "visa_mastercard_discover_authorization_fee", knownMoney(cpItem), "per_authorization", "visa_mastercard_discover_authorizations", `$${(cpItem / 100).toFixed(2)} per authorization`, UNKNOWN_PERIOD, [ref]));
    result.push(component(`component_dharma_${prefix}_amex_auth_v1`, identity, "amex_authorization_fee", knownMoney(cnpItem), "per_authorization", "amex_authorizations", `$${(cnpItem / 100).toFixed(2)} per authorization`, UNKNOWN_PERIOD, [ref]));
  }
  return result;
}
function tierPredicate(min: number | null, max: number, channel: string): CommercialPredicateV1 { const ranges: CommercialPredicateV1[] = [fact("three_month_rolling_card_volume_minor", "lte", max), fact("channel", "eq", channel)]; if (min !== null) ranges.unshift(fact("three_month_rolling_card_volume_minor", "gt", min)); return { op: "and", conditions: ranges }; }
function fact(field: Extract<CommercialPredicateV1, { op: "fact" }>["field"], comparator: Extract<CommercialPredicateV1, { op: "fact" }>["comparator"], value: string | number | boolean): CommercialPredicateV1 { return { op: "fact", field, comparator, value }; }
function merchantTypes(values: string[]): CommercialPredicateV1 { return { op: "or", conditions: values.map((value) => fact("merchant_type", "eq", value)) }; }
function knownMoney(amountMinor: number): CommercialPriceComponentVersionV1["completeness"] { return { state: "KNOWN", value: { kind: "money", amountMinor, currency: "USD" } }; }
function knownRate(basisPoints: number): CommercialPriceComponentVersionV1["completeness"] { return { state: "KNOWN", value: { kind: "rate", basisPoints, currency: null } }; }
function absentMoney(): CommercialPriceComponentVersionV1["completeness"] { return { state: "KNOWN_ABSENT", value: null, observedAbsentValue: { kind: "money", amountMinor: 0, currency: "USD" } }; }
function resolvedCalculatorConflict(id: string, selected: string, candidate: string) { return { conflictId: id, sameScopeKey: id, componentVersionRefs: [selected, candidate], state: "resolved" as const, resolution: { selectedComponentVersionRef: selected, authorityRef: `${COMMERCIAL_SOURCE_BATCH_1B_PRODUCT_AUTHORITY.document}#calculator-conflict`, resolvedAt: "2026-09-10T00:00:00.000Z", reason: "Product selected the plan-specific current rate page for governed direct-plan consumption while retaining the calculator value as a conflicting maintenance candidate; no averaging or source-count voting." } }; }
function dharmaPlanExtract(plan: "retail" | "virtual" | "high_volume"): string {
  if (plan === "retail") return "Standard Retail: $20 monthly; Visa/Mastercard/Discover 0.15% + $0.08 per authorization; Amex 0.25% + $0.08 per authorization; $49 closure; $25 chargeback; no AVS, batch, PCI compliance, annual, monthly minimum, or early termination fee; Virtual Terminal and Mobile Processing included. 'Account Update Fee: No' is preserved without mapping it to a specific updater construct. Provider says interchange and assessments pass through at cost; provider-offer term only.";
  if (plan === "virtual") return "Standard Virtual/Online: $20 monthly; Visa/Mastercard/Discover 0.20% + $0.11 per authorization; Amex 0.30% + $0.11 per authorization; $49 closure; $25 chargeback; no AVS, batch, or PCI compliance fee; Virtual Terminal and Mobile Processing included. The $0.11 remains an authorization population and includes AVS.";
  return "High Volume: $15 monthly; Visa/Mastercard/Discover 0.10%; Amex 0.20%; card-present $0.08 per authorization; card-not-present $0.11 per authorization; $49 closure; $25 chargeback; no AVS, batch, or PCI compliance fee. Qualification is monthly card sales >$100,000 OR >5,000 transactions/month OR a qualifying low-ticket restaurant branch. Restaurant wording conflicts between 'less than $25' and '$25 or less'; exactly $25 remains unresolved. Dharma operates on TSYS or First Data platforms, which does not make this TSYS/Fiserv pricing.";
}
