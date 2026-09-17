import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const GOVERNED_COMMERCIAL_CLASSIFICATION_ADJUDICATION_V1 =
  "governed_commercial_classification_adjudication_product_2026_09_10_v1" as const;

export type GovernedCommercialAdjudicationFamily =
  | "mastercard_nabu_authorization"
  | "mastercard_connectivity_kilobyte"
  | "visa_isa_base"
  | "fiserv_amex_program_cost_merchant_price"
  | "tiered_qual_mqual_nqual"
  | "mastercard_dispute_image"
  | "mastercard_dispute_case"
  | "visa_dispute_no_acceptance"
  | "generic_exception_or_return"
  | "mastercard_assessment_01475"
  | "regulatory_product";

export type GovernedCommercialDollarPolicy =
  | "NETWORK_RELATED_BILLED_AMOUNT_PERIOD_SCOPED_STRONG"
  | "NETWORK_RELATED_BILLED_AMOUNT_NOT_CERTIFIED_AT_PAR"
  | "EXACT_PROVIDER_CONTROLLED_MERCHANT_FACING_PRICE"
  | "ACQUIRING_CONTROLLED_PRICE_BUT_SHARED_BUNDLED_DOLLARS"
  | "SHARED_BUNDLED_OR_UNRESOLVED_DOLLARS"
  | "GOVERNMENT_OR_NONPROCESSING_UNRESOLVED_RECIPIENT";

type ParticipantValue =
  | "issuer_or_network"
  | "card_network"
  | "acquiring_side_program"
  | "technology_or_service_provider"
  | "government_or_third_party";

export type GovernedCommercialClassificationAdjudicationRowV1 = {
  feeRowId: string;
  applicable: boolean;
  adjudicatedFamily: GovernedCommercialAdjudicationFamily | null;
  exactIdentity: string | null;
  openWorldFamily: "F2" | "F3" | "F5" | "F8" | "F12" | null;
  economicLayer:
    | "card_network"
    | "acquiring_commercial"
    | "government_or_nonprocessing_pass_through"
    | null;
  mechanic: string | null;
  population: string | null;
  cardinality: "single_fee" | "multiple_components" | "bounded_component" | null;
  collector: "processor_or_acquirer" | null;
  economicBeneficiary: Exclude<ParticipantValue, "issuer_or_network"> | null;
  ruleSetter: ParticipantValue | null;
  priceSetter: ParticipantValue | null;
  merchantFacingPriceController: Exclude<ParticipantValue, "issuer_or_network"> | null;
  actionClass: "N1" | "N2" | "N3" | "N5" | "N7" | null;
  commercialDollarPolicy: GovernedCommercialDollarPolicy | null;
  confidence: "STRONG" | "CATEGORY_ONLY" | "UNRESOLVED";
  evidenceRefs: string[];
  explanation: string;
  limitations: string[];
  researchWarrantRequired: boolean;
  renderingPermissions: {
    exactIdentityAllowed: boolean;
    networkRelatedLanguageAllowed: boolean;
    acquiringSideLanguageAllowed: boolean;
    exactProviderControlledDollarsAllowed: boolean;
    officialNetworkParLanguageAllowed: false;
    noProviderUpliftLanguageAllowed: false;
    providerRetentionOrProfitLanguageAllowed: false;
  };
};

export type GovernedCommercialClassificationAdjudicationResolutionV1 = {
  catalogVersion: typeof GOVERNED_COMMERCIAL_CLASSIFICATION_ADJUDICATION_V1;
  productAuthority: {
    sourceRef: string;
    sha256: string;
    status: "product_domain_adjudicated";
    reviewedAt: "2026-09-10";
  };
  rules: ReturnType<typeof governedCommercialClassificationAdjudicationRulesV1>;
  rowsByFeeRowId: Readonly<Record<string, GovernedCommercialClassificationAdjudicationRowV1>>;
  diagnostics: {
    affectedRows: number;
    exactIdentityRows: number;
    networkRelatedRows: number;
    exactProviderControlledMerchantPriceRows: number;
    sharedOrBundledRows: number;
  };
  canonicalMutationAllowed: false;
};

const PRODUCT_AUTHORITY_REF =
  "RateReveal_Governed_Commercial_Classification_Adjudication_FINAL_Product_Adjudicated_v1.md";
const PRODUCT_AUTHORITY_SHA256 =
  "5223734a0755a66b8a63d96d4e6d20cfc963ba12bd341f7dae22e98c030d21c3";

export function governedCommercialClassificationAdjudicationRulesV1() {
  const common = {
    authorityRef: PRODUCT_AUTHORITY_REF,
    authoritySha256: PRODUCT_AUTHORITY_SHA256,
    reviewedAt: "2026-09-10" as const,
    admissionStatus: "product_adjudicated_admitted" as const,
  };
  return [
    { ...common, ruleId: "RR-GCCA-01", claim: "Identity, economic layer, price control, cardinality, and commercial-dollar attribution are independent claims." },
    { ...common, ruleId: "RR-GCCA-02", claim: "Exact/scoped governed fee-family evidence outranks processor/template, statement-local, and generic token or per-item fallbacks when scope applies." },
    { ...common, ruleId: "RR-GCCA-03", claim: "Network-related attribution never by itself certifies official network par, absence of acquiring uplift, or universal pass-through." },
    { ...common, ruleId: "RR-GCCA-04", claim: "Acquiring-side merchant-facing price control never by itself establishes provider retention, profit, or separable provider dollars." },
    { ...common, ruleId: "RR-GCCA-05", claim: "Tiered QUAL/MQUAL/NQUAL rows retain acquiring-side price control but remain bundled/shared for dollar attribution without component evidence." },
    { ...common, ruleId: "RR-GCCA-06", claim: "Generic return, chargeback, and ACH-reject labels do not inherit the exact network treatment of governed network-named dispute fees." },
  ];
}

export function resolveGovernedCommercialClassificationAdjudicationV1(input: {
  analysis: CanonicalStatementAnalysis;
  geography: string | null;
}): GovernedCommercialClassificationAdjudicationResolutionV1 {
  const periodEnd = input.analysis.identity.statementPeriod.value?.end ?? "0001-01-01";
  const processorFamily = input.analysis.identity.processorFamily.value ?? "";
  const supportedScope = /FISERV|FIRST DATA/i.test(processorFamily) && input.geography === "us";
  const rows = input.analysis.feeLedger.rows.map((row) => resolveRow(row, periodEnd, supportedScope));
  const affected = rows.filter((row) => row.applicable);
  return deepFreeze({
    catalogVersion: GOVERNED_COMMERCIAL_CLASSIFICATION_ADJUDICATION_V1,
    productAuthority: {
      sourceRef: PRODUCT_AUTHORITY_REF,
      sha256: PRODUCT_AUTHORITY_SHA256,
      status: "product_domain_adjudicated",
      reviewedAt: "2026-09-10",
    },
    rules: governedCommercialClassificationAdjudicationRulesV1(),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    diagnostics: {
      affectedRows: affected.length,
      exactIdentityRows: affected.filter((row) => row.exactIdentity !== null).length,
      networkRelatedRows: affected.filter((row) => row.economicLayer === "card_network").length,
      exactProviderControlledMerchantPriceRows: affected.filter((row) => row.commercialDollarPolicy === "EXACT_PROVIDER_CONTROLLED_MERCHANT_FACING_PRICE").length,
      sharedOrBundledRows: affected.filter((row) => row.commercialDollarPolicy === "SHARED_BUNDLED_OR_UNRESOLVED_DOLLARS" || row.commercialDollarPolicy === "ACQUIRING_CONTROLLED_PRICE_BUT_SHARED_BUNDLED_DOLLARS").length,
    },
    canonicalMutationAllowed: false,
  });
}

function resolveRow(row: CanonicalFeeRow, periodEnd: string, supportedScope: boolean): GovernedCommercialClassificationAdjudicationRowV1 {
  if (!supportedScope) return notApplicable(row.id);
  const label = normalize(row.selectedLabel);
  const year = Number(periodEnd.slice(0, 4));
  const statementEvidence = row.sourceOccurrenceIds;
  const commonEvidence = ["RR-GCCA-01", "RR-GCCA-02", ...statementEvidence];

  if (/\bMC NETWORK ACCESS AUTH FEE\b/.test(label) && year >= 2020 && year <= 2026) {
    return adjudicated(row, {
      adjudicatedFamily: "mastercard_nabu_authorization",
      exactIdentity: "mastercard_network_access_and_brand_usage_authorization",
      openWorldFamily: "F3",
      economicLayer: "card_network",
      mechanic: "per authorization record",
      population: "printed Mastercard authorization records",
      cardinality: "single_fee",
      collector: "processor_or_acquirer",
      economicBeneficiary: "card_network",
      ruleSetter: "card_network",
      priceSetter: "card_network",
      merchantFacingPriceController: null,
      actionClass: "N1",
      commercialDollarPolicy: year === 2024
        ? "NETWORK_RELATED_BILLED_AMOUNT_PERIOD_SCOPED_STRONG"
        : "NETWORK_RELATED_BILLED_AMOUNT_NOT_CERTIFIED_AT_PAR",
      confidence: "STRONG",
      evidenceRefs: [...commonEvidence, "RR-GCCA-03", "wells_fargo_payment_network_pass_through_2021_01#mastercard_nabu_authorization"],
      explanation: "Scoped Product-adjudicated alias evidence identifies this as Mastercard NABU/Network Access Authorization; generic acquiring per-item fallback is inapplicable.",
      limitations: year === 2020
        ? ["The 2021 schedule strongly supports alias lineage but does not manufacture a period-matched 2020 official-par claim."]
        : ["A matching billed rate does not certify universal official par or exclude acquiring uplift."],
      researchWarrantRequired: false,
    });
  }

  if (/\b(?:MC AUTH CONNECTIVITY FEE|KILOBYTE AUTH FEE US|KILOBYTE CLEARING FEE US|MC CLEARING CONNECTIVITY FEE)\b/.test(label) && year >= 2021) {
    const authorization = /AUTH/.test(label);
    return adjudicated(row, {
      adjudicatedFamily: "mastercard_connectivity_kilobyte",
      exactIdentity: authorization ? "mastercard_authorization_connectivity_kilobyte_fee" : "mastercard_clearing_connectivity_kilobyte_fee",
      openWorldFamily: "F3",
      economicLayer: "card_network",
      mechanic: "per kilobyte of network connectivity data",
      population: authorization ? "printed authorization-connectivity kilobytes" : "printed clearing-connectivity kilobytes",
      cardinality: "single_fee",
      collector: "processor_or_acquirer",
      economicBeneficiary: "card_network",
      ruleSetter: "card_network",
      priceSetter: "card_network",
      merchantFacingPriceController: null,
      actionClass: "N1",
      commercialDollarPolicy: "NETWORK_RELATED_BILLED_AMOUNT_NOT_CERTIFIED_AT_PAR",
      confidence: "STRONG",
      evidenceRefs: [...commonEvidence, "RR-GCCA-03", "bank_of_hawaii_mastercard_notice_2021_10#connectivity_restructure", "fiserv_pass_through_schedule_2022_04#mastercard_connectivity_kilobyte"],
      explanation: "Dated restructuring and Fiserv naming evidence establish the Mastercard connectivity/kilobyte family and data-volume mechanic.",
      limitations: ["The exact historical network par/effective transition is not established for every statement period; provider uplift is not assumed or excluded."],
      researchWarrantRequired: false,
    });
  }

  if (/\bVISA INTL SERVICE FEE BASE\b/.test(label) && year >= 2020 && year <= 2026) {
    return adjudicated(row, {
      adjudicatedFamily: "visa_isa_base",
      exactIdentity: "visa_international_service_assessment_base",
      openWorldFamily: "F2",
      economicLayer: "card_network",
      mechanic: "ad valorem on qualifying international Visa volume settled in USD",
      population: "qualifying non-U.S.-issued Visa volume settled in USD",
      cardinality: "single_fee",
      collector: "processor_or_acquirer",
      economicBeneficiary: "card_network",
      ruleSetter: "card_network",
      priceSetter: "card_network",
      merchantFacingPriceController: null,
      actionClass: "N1",
      commercialDollarPolicy: "NETWORK_RELATED_BILLED_AMOUNT_PERIOD_SCOPED_STRONG",
      confidence: "STRONG",
      evidenceRefs: [...commonEvidence, "RR-GCCA-03", "wells_fargo_payment_network_pass_through_2021_01#visa_isa_base", "fiserv_pass_through_schedule_2022_04#visa_isa_base"],
      explanation: "The scoped descriptor and population identify the Visa International Service Assessment Base/USD-settlement family; generic account/admin fallback is inapplicable.",
      limitations: ["The historical row is strongly attributable to underlying Visa network economics without creating a universal official-par claim."],
      researchWarrantRequired: false,
    });
  }

  if (/\bPROGRAM COST FEE AX\b/.test(label) && year === 2020) {
    return adjudicated(row, {
      adjudicatedFamily: "fiserv_amex_program_cost_merchant_price",
      exactIdentity: "fiserv_first_data_program_cost_fee_ax",
      openWorldFamily: "F5",
      economicLayer: "acquiring_commercial",
      mechanic: "ad valorem on the printed Amex volume base",
      population: "printed Amex acquired-program volume",
      cardinality: "single_fee",
      collector: "processor_or_acquirer",
      economicBeneficiary: null,
      ruleSetter: "acquiring_side_program",
      priceSetter: "acquiring_side_program",
      merchantFacingPriceController: "acquiring_side_program",
      actionClass: "N3",
      commercialDollarPolicy: "EXACT_PROVIDER_CONTROLLED_MERCHANT_FACING_PRICE",
      confidence: "STRONG",
      evidenceRefs: [...commonEvidence, "RR-GCCA-04", "fiserv_first_data_merchant_application#program_cost_fee_ax_3al"],
      explanation: "Product identifies this as a distinct configurable Fiserv/First Data merchant-facing Amex program-price construct; the full billed amount is provider-controlled merchant-facing price, not proven profit or retention.",
      limitations: ["Ultimate beneficiary and retention are unresolved.", "No CNP-surcharge split or underlying program-cost allocation is permitted without period-specific component evidence."],
      researchWarrantRequired: false,
    });
  }

  if (/\b(?:QUAL|MQUAL|NQUAL) DISC\b/.test(label)) {
    return adjudicated(row, {
      adjudicatedFamily: "tiered_qual_mqual_nqual",
      exactIdentity: null,
      openWorldFamily: "F5",
      economicLayer: "acquiring_commercial",
      mechanic: "ad valorem merchant-facing tier price",
      population: "printed tier-qualified merchant sales volume",
      cardinality: "multiple_components",
      collector: "processor_or_acquirer",
      economicBeneficiary: null,
      ruleSetter: "acquiring_side_program",
      priceSetter: "acquiring_side_program",
      merchantFacingPriceController: "acquiring_side_program",
      actionClass: "N3",
      commercialDollarPolicy: "ACQUIRING_CONTROLLED_PRICE_BUT_SHARED_BUNDLED_DOLLARS",
      confidence: "STRONG",
      evidenceRefs: [...commonEvidence, "RR-GCCA-04", "RR-GCCA-05", "RR-B1-00", "RR-B1-01"],
      explanation: "The acquiring side controls the tier price, while the billed row may include inseparable interchange/program cost and therefore is not exact provider markup or residual.",
      limitations: ["Tier labels do not prove merchant fault, avoidable downgrade, underlying interchange allocation, provider retention, or exact provider spread."],
      researchWarrantRequired: false,
    });
  }

  const exactDispute = exactNetworkDispute(label, year);
  if (exactDispute) return adjudicated(row, { ...exactDispute, evidenceRefs: [...commonEvidence, "RR-GCCA-03", ...exactDispute.evidenceRefs] });

  if (/\b(?:RETURNS?|CHARGEBACKS?|ACH REJECT(?: FEE)?)\b/.test(label)) {
    return adjudicated(row, {
      adjudicatedFamily: "generic_exception_or_return",
      exactIdentity: null,
      openWorldFamily: "F8",
      economicLayer: null,
      mechanic: /ACH REJECT/.test(label) ? "per printed ACH rejection event where supported" : "per printed return or chargeback event where supported",
      population: "printed exception-event population where supported",
      cardinality: "multiple_components",
      collector: "processor_or_acquirer",
      economicBeneficiary: null,
      ruleSetter: null,
      priceSetter: null,
      merchantFacingPriceController: null,
      actionClass: "N7",
      commercialDollarPolicy: "SHARED_BUNDLED_OR_UNRESOLVED_DOLLARS",
      confidence: "CATEGORY_ONLY",
      evidenceRefs: [...commonEvidence, "RR-GCCA-06"],
      explanation: "A generic exception label and count do not establish network charge, provider service price, principal movement, beneficiary, retention, or component composition.",
      limitations: ["Provider or merchant documents are the preferred next evidence source when the amount is material and decision-relevant."],
      researchWarrantRequired: false,
    });
  }

  if (/\bMASTERCARD ASSESSMENT FEE 0 001475\b/.test(label) && year === 2024) {
    return adjudicated(row, {
      adjudicatedFamily: "mastercard_assessment_01475",
      exactIdentity: "mastercard_assessment",
      openWorldFamily: "F2",
      economicLayer: "card_network",
      mechanic: "ad valorem assessment with bounded possible bundled components",
      population: "printed Mastercard assessed sales volume",
      cardinality: "multiple_components",
      collector: "processor_or_acquirer",
      economicBeneficiary: "card_network",
      ruleSetter: "card_network",
      priceSetter: "card_network",
      merchantFacingPriceController: null,
      actionClass: "N1",
      commercialDollarPolicy: "SHARED_BUNDLED_OR_UNRESOLVED_DOLLARS",
      confidence: "STRONG",
      evidenceRefs: [...commonEvidence, "RR-GCCA-03", "MC-FOCUSED-01", "MC-FOCUSED-02", "RR-MCF-08"],
      explanation: "The Mastercard assessment identity is supported; 0.14% ABVF plus a plausible 0.0075% license component is a strong bounded explanation, not proof of exact composition.",
      limitations: ["Confirmed at-par status is prohibited and a small acquiring-side uplift cannot be fully excluded."],
      researchWarrantRequired: false,
    });
  }

  if (/\bREGULATORY PRODUCT\b/.test(label)) {
    return adjudicated(row, {
      adjudicatedFamily: "regulatory_product",
      exactIdentity: null,
      openWorldFamily: "F12",
      economicLayer: "government_or_nonprocessing_pass_through",
      mechanic: "fixed or printed current-period charge",
      population: "current statement-period occurrence",
      cardinality: "single_fee",
      collector: "processor_or_acquirer",
      economicBeneficiary: "government_or_third_party",
      ruleSetter: "government_or_third_party",
      priceSetter: "government_or_third_party",
      merchantFacingPriceController: "government_or_third_party",
      actionClass: "N5",
      commercialDollarPolicy: "GOVERNMENT_OR_NONPROCESSING_UNRESOLVED_RECIPIENT",
      confidence: "CATEGORY_ONLY",
      evidenceRefs: [...commonEvidence, "OWD-01", "OWD-02"],
      explanation: "Existing F12 semantics place this in a government/non-processing lane without forcing it into network or provider economics.",
      limitations: ["The exact recipient and pass-through correctness remain unresolved."],
      researchWarrantRequired: false,
    });
  }

  return notApplicable(row.id);
}

function exactNetworkDispute(label: string, year: number): Omit<GovernedCommercialClassificationAdjudicationRowV1, "feeRowId" | "applicable" | "renderingPermissions"> | null {
  if (year !== 2022) return null;
  const base = {
    openWorldFamily: "F3" as const,
    economicLayer: "card_network" as const,
    cardinality: "single_fee" as const,
    collector: "processor_or_acquirer" as const,
    economicBeneficiary: "card_network" as const,
    ruleSetter: "card_network" as const,
    priceSetter: "card_network" as const,
    merchantFacingPriceController: null,
    commercialDollarPolicy: "NETWORK_RELATED_BILLED_AMOUNT_PERIOD_SCOPED_STRONG" as const,
    confidence: "STRONG" as const,
    researchWarrantRequired: false,
  };
  if (/\bMC DISPUTE IMAGE FEE\b/.test(label)) return {
    ...base,
    adjudicatedFamily: "mastercard_dispute_image",
    exactIdentity: "mastercard_dispute_image_fee",
    mechanic: "per dispute image or supporting-document delivery event",
    population: "printed dispute-image events",
    actionClass: "N1",
    evidenceRefs: ["wells_fargo_payment_network_pass_through_2021_01#mastercard_dispute_image_0_20"],
    explanation: "Period-preceding exact processor pass-through evidence supports the Mastercard dispute-image identity and $0.20 event mechanic.",
    limitations: ["This does not create universal official Mastercard par certification."],
  };
  if (/\bMC DISPUTE CASE FEE\b/.test(label)) return {
    ...base,
    adjudicatedFamily: "mastercard_dispute_case",
    exactIdentity: "mastercard_dispute_case_fee",
    mechanic: "per incoming dispute claim or case",
    population: "printed incoming dispute cases",
    actionClass: "N1",
    evidenceRefs: ["wells_fargo_payment_network_pass_through_2021_01#mastercard_dispute_case_1_35"],
    explanation: "Period-preceding exact processor pass-through evidence supports the Mastercard dispute-case identity and $1.35 event mechanic.",
    limitations: ["This does not create universal official Mastercard par certification."],
  };
  if (/\bVISA DISPUTE NO ACCEPT\b/.test(label)) return {
    ...base,
    adjudicatedFamily: "visa_dispute_no_acceptance",
    exactIdentity: "visa_no_acceptance_dispute_fee",
    mechanic: "per dispute claim not accepted or responded to within the applicable response period",
    population: "printed no-acceptance dispute events",
    actionClass: "N2",
    evidenceRefs: ["wells_fargo_payment_network_pass_through_2021_01#visa_no_acceptance_0_75"],
    explanation: "Period-preceding exact processor pass-through evidence supports the Visa No Acceptance identity and $0.75 event mechanic; operational behavior may affect incidence.",
    limitations: ["Who controlled the response workflow and the exact operational remedy remain unresolved.", "Identity is label/mechanic-driven, not inferred from the shared $0.75 rate."],
  };
  return null;
}

function adjudicated(
  row: CanonicalFeeRow,
  value: Omit<GovernedCommercialClassificationAdjudicationRowV1, "feeRowId" | "applicable" | "renderingPermissions">,
): GovernedCommercialClassificationAdjudicationRowV1 {
  return {
    feeRowId: row.id,
    applicable: true,
    ...value,
    renderingPermissions: {
      exactIdentityAllowed: value.exactIdentity !== null,
      networkRelatedLanguageAllowed: value.economicLayer === "card_network",
      acquiringSideLanguageAllowed: value.economicLayer === "acquiring_commercial",
      exactProviderControlledDollarsAllowed: value.commercialDollarPolicy === "EXACT_PROVIDER_CONTROLLED_MERCHANT_FACING_PRICE",
      officialNetworkParLanguageAllowed: false,
      noProviderUpliftLanguageAllowed: false,
      providerRetentionOrProfitLanguageAllowed: false,
    },
  };
}

function notApplicable(feeRowId: string): GovernedCommercialClassificationAdjudicationRowV1 {
  return {
    feeRowId,
    applicable: false,
    adjudicatedFamily: null,
    exactIdentity: null,
    openWorldFamily: null,
    economicLayer: null,
    mechanic: null,
    population: null,
    cardinality: null,
    collector: null,
    economicBeneficiary: null,
    ruleSetter: null,
    priceSetter: null,
    merchantFacingPriceController: null,
    actionClass: null,
    commercialDollarPolicy: null,
    confidence: "UNRESOLVED",
    evidenceRefs: [],
    explanation: "No Product-adjudicated commercial-classification override applies.",
    limitations: [],
    researchWarrantRequired: false,
    renderingPermissions: {
      exactIdentityAllowed: false,
      networkRelatedLanguageAllowed: false,
      acquiringSideLanguageAllowed: false,
      exactProviderControlledDollarsAllowed: false,
      officialNetworkParLanguageAllowed: false,
      noProviderUpliftLanguageAllowed: false,
      providerRetentionOrProfitLanguageAllowed: false,
    },
  };
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
