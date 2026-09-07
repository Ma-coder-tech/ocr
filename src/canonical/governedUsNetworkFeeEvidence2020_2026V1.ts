import { createHash } from "node:crypto";
import type {
  GovernedDatedNetworkFeeEvidenceResolution,
  GovernedDatedNetworkRowResolution,
  GovernedNetworkFeeFamily,
} from "./governedDatedNetworkFeeEvidenceV1.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const GOVERNED_US_NETWORK_FEE_EVIDENCE_2020_2026_V1 =
  "governed_us_network_fee_evidence_2020_2026_product_adjudicated_2026_09_07_v1" as const;

export type GovernedUsNetworkEvidenceClass =
  | "G1_product_domain_adjudication"
  | "E4_processor_or_acquirer_schedule"
  | "E4_processor_change_bulletin";

export type GovernedUsNetworkSource = {
  sourceId: string;
  title: string;
  publisher: string;
  evidenceClass: GovernedUsNetworkEvidenceClass;
  publicationDate: string;
  publicationDatePrecision: "day" | "month";
  sourceVersion: string;
  sourceLocator: string;
  retainedThrough: string;
  retainedPackageFingerprint: string;
  reviewStatus: "product_adjudicated_admitted";
  geographyScope: string;
  limitations: string[];
};

export type GovernedUsNetworkValue = {
  variantId: string;
  value: number;
  unit:
    | "decimal_rate"
    | "usd_per_event"
    | "usd_per_kilobyte"
    | "usd_per_location_month"
    | "usd_per_terminal_30_days";
  productScope: string;
  matchTokens: string[];
  minimum: boolean;
  maximum: boolean;
};

export type GovernedUsNetworkReferenceRecord = {
  recordId: string;
  sourceId: string;
  network: "Visa" | "Mastercard" | "Discover" | "American Express";
  family: GovernedNetworkFeeFamily;
  identity: string;
  matchPatterns: string[];
  evidenceClass: GovernedUsNetworkEvidenceClass;
  evidenceLocator: string;
  sourceDate: string;
  sourceDatePrecision: "month";
  referencePeriod: {
    effectiveFrom: string;
    effectiveThrough: string;
    basis: "schedule_as_of_month" | "dated_change";
    datePrecision: "month" | "year";
  };
  lifecycle: "documented_reference" | "announced_change";
  implementationState: "documented_for_reference_period" | "unconfirmed";
  geographyScope: string;
  productScope: string;
  identityClaim: string;
  mechanicClaim: string;
  populationClaim: string;
  values: GovernedUsNetworkValue[];
  priorValues: GovernedUsNetworkValue[];
  confidence: "STRONG";
  knownGaps: string[];
  conflicts: string[];
  officialNetworkPublication: false;
  statementDerived: false;
};

export type GovernedUsNetworkRule = {
  ruleId: string;
  title: string;
  admittedClaim: string;
  prohibitedClaims: string[];
  evidenceClass: "G1_product_domain_adjudication";
  sourceRefs: string[];
  sourceFingerprints: string[];
  reviewedAt: "2026-09-07";
  admissionStatus: "admitted";
};

export type GovernedUsNetworkRowResolution = {
  feeRowId: string;
  applicable: boolean;
  identity: {
    state: "supported" | "not_strengthened" | "not_applicable";
    value: string | null;
    confidence: "STRONG" | "UNRESOLVED";
    evidenceRefs: string[];
  };
  mechanic: {
    state: "supported" | "not_strengthened" | "not_applicable";
    value: string | null;
    confidence: "STRONG" | "UNRESOLVED";
    evidenceRefs: string[];
    supersedesEarlierSimplification: boolean;
    mechanicChangeInferred: false;
  };
  population: {
    state: "supported" | "not_strengthened" | "not_applicable";
    value: string | null;
    confidence: "STRONG" | "UNRESOLVED";
    forcedToGatewayAuthorizationCount: false;
    economicCharacterInferredFromCount: false;
    evidenceRefs: string[];
  };
  reference: {
    state:
      | "period_matched_processor_reference"
      | "adjacent_period_processor_reference"
      | "current_material_identity_mechanic_only"
      | "ambiguous_product_variant"
      | "no_applicable_reference"
      | "not_applicable";
    evidenceClass: GovernedUsNetworkEvidenceClass | null;
    matchedRecordIds: string[];
    candidateValues: GovernedUsNetworkValue[];
    sourceDate: string | null;
    effectiveFrom: string | null;
    effectiveThrough: string | null;
    officialNetworkParEstablished: false;
    historicalNetworkParEstablished: false;
    adjacentPeriodOnly: boolean;
    current2026CoreValueEstablished: boolean;
  };
  billedObservation: GovernedDatedNetworkRowResolution["billedObservation"];
  comparison: {
    state:
      | "consistent_with_period_reference"
      | "consistent_with_adjacent_period_reference"
      | "candidate_above_reference"
      | "different_with_unresolved_historical_gap"
      | "population_or_product_scope_unresolved"
      | "not_comparable";
    statementValue: number | null;
    referenceValue: number | null;
    unit: GovernedUsNetworkValue["unit"] | null;
    difference: number | null;
    passThroughAtParEstablished: false;
    confirmedMarkupEstablished: false;
    renderingText: string;
  };
  correction: {
    nabuAuthorizationOnlyRemoved: boolean;
    digitalEnablementBoundedMechanicApplied: boolean;
    dataUsageSettlementPopulationStrengthened: boolean;
    presentationChangePreserved: boolean;
    historicalGapPreserved: boolean;
  };
  sourceConflicts: string[];
  research: {
    priority: "high" | "normal" | "none";
    reasonCodes: string[];
    question: string | null;
  };
  renderingPermissions: {
    officialParLanguageAllowed: false;
    confirmedAtParLanguageAllowed: false;
    confirmedMarkupLanguageAllowed: false;
    adjacentReferenceLanguageAllowed: boolean;
    announcementAsImplementationAllowed: false;
    crossMerchantHistoryAllowed: false;
    backwardProjectionFrom2026Allowed: false;
  };
  matchedRuleRefs: string[];
  limitations: string[];
};

export type GovernedUsNetworkFeeEvidenceResolution = {
  catalogVersion: typeof GOVERNED_US_NETWORK_FEE_EVIDENCE_2020_2026_V1;
  sources: GovernedUsNetworkSource[];
  records: GovernedUsNetworkReferenceRecord[];
  rules: GovernedUsNetworkRule[];
  rowsByFeeRowId: Readonly<Record<string, GovernedUsNetworkRowResolution>>;
  diagnostics: {
    applicableRows: number;
    identityStrengthenedRows: number;
    mechanicStrengthenedRows: number;
    populationStrengthenedRows: number;
    periodMatchedReferenceRows: number;
    adjacentPeriodReferenceRows: number;
    lackingCurrent2026CoreValueRows: number;
    aboveReferenceCandidateRows: number;
    confirmedMarkupRows: 0;
    confirmedAtParRows: 0;
    officialNetworkParRows: 0;
    nabuCorrectedRows: number;
    digitalEnablementCorrectedRows: number;
    sourceConflictRows: number;
  };
  canonicalMutationAllowed: false;
  limitations: string[];
};

const PRODUCT_REQUEST_REF = "RateReveal_Product_US_Network_Fee_Evidence_Admission_2026_09_07";
const PRODUCT_REQUEST_SHA256 = "ad9ad7a3503a5db0db68674ef3897b0d6842bfeaef374bdd0a5cae0dea7fb7e3";
const PRODUCT_PACK_REF = "RateReveal_US_Network_Fee_Evidence_Pack_2020-2026_FINAL_Product_Adjudicated.md";
const PRODUCT_PACK_SHA256 = "e9af92f905f8dc1fbe9445099fc9e92df1fd87d786787d6a61e19df6b46ee5dd";

const SOURCES: GovernedUsNetworkSource[] = [
  {
    sourceId: "rr_product_us_network_pack_2020_2026_final",
    title: "RateReveal U.S. Network-Fee Evidence Pack, 2020-2026 — Final Product-Adjudicated Version",
    publisher: "RateReveal Product/domain review",
    evidenceClass: "G1_product_domain_adjudication",
    publicationDate: "2026-09-07",
    publicationDatePrecision: "day",
    sourceVersion: "final_product_adjudicated",
    sourceLocator: PRODUCT_PACK_REF,
    retainedThrough: PRODUCT_PACK_REF,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    reviewStatus: "product_adjudicated_admitted",
    geographyScope: "United States merchant acquiring",
    limitations: ["This package governs admission and source classification; it does not transform processor evidence into primary network evidence."],
  },
  {
    sourceId: "fiserv_card_brand_pass_through_guide_2023_04",
    title: "Fiserv Reference Guide for Card Brand Pass Through Fees",
    publisher: "Fiserv",
    evidenceClass: "E4_processor_or_acquirer_schedule",
    publicationDate: "2023-04-01",
    publicationDatePrecision: "month",
    sourceVersion: "Spring/April 2023",
    sourceLocator: `${PRODUCT_PACK_REF}#S-A`,
    retainedThrough: PRODUCT_PACK_REF,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    reviewStatus: "product_adjudicated_admitted",
    geographyScope: "United States and U.S. Territories, subject to fee-specific product scope",
    limitations: [
      "The guide is Fiserv processor evidence, not primary Visa, Mastercard, Discover, or American Express evidence.",
      "Its values are a point-in-time April 2023 reference and are not silently projected to other years.",
    ],
  },
  {
    sourceId: "fiserv_card_brand_updates_2026_06",
    title: "Fiserv Card Brand Updates",
    publisher: "Fiserv",
    evidenceClass: "E4_processor_change_bulletin",
    publicationDate: "2026-06-01",
    publicationDatePrecision: "month",
    sourceVersion: "June 2026 retained update",
    sourceLocator: `${PRODUCT_PACK_REF}#S-B`,
    retainedThrough: PRODUCT_PACK_REF,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    reviewStatus: "product_adjudicated_admitted",
    geographyScope: "United States acquiring changes described by the retained bulletin",
    limitations: [
      "This change bulletin proves the listed Fiserv-announced changes, not a comprehensive table of unchanged 2026 core rates.",
      "Announcement evidence does not automatically prove implementation.",
    ],
  },
];

const RULES: GovernedUsNetworkRule[] = [
  admittedRule("RR-USN-01", "Processor schedules remain processor evidence", "The April 2023 Fiserv guide is strong dated processor evidence and never becomes primary network publication evidence.", ["fiserv_schedule_called_official_network_publication"]),
  admittedRule("RR-USN-02", "Reference value applicability is period scoped", "A dated reference supports comparison only for its evidenced period; current or adjacent material cannot establish historical par.", ["current_value_projected_backward", "adjacent_value_called_historical_par"]),
  admittedRule("RR-USN-03", "Adjacent matches use evidence-attributed language", "An adjacent-period match may be described only as consistent with the available dated reference.", ["adjacent_period_confirmed_at_par", "adjacent_period_confirmed_markup"]),
  admittedRule("RR-USN-04", "Visa APF variants remain product and geography scoped", "The four April 2023 Visa APF variants remain separate and require product/geography evidence before a value is selected.", ["generic_apf_selects_rate", "domestic_apf_applied_non_us"]),
  admittedRule("RR-USN-05", "Visa exception mechanics are versioned", "The April 2023 Misuse, Zero Floor, and TIF values/mechanics are not projected to other periods without qualified date coverage.", ["2023_trigger_projected_backward", "2023_trigger_projected_forward"]),
  admittedRule("RR-USN-06", "FANF structure does not supply tier rates", "FANF structural mechanics may be supported while tier values remain unresolved until the actual tables are retained.", ["fanf_tier_rate_invented"]),
  admittedRule("RR-USN-07", "NABU is not authorization-only", "The April 2023 Fiserv NABU population includes authorization records, Collection Only, and Return/Credit settled transactions in its stated scope.", ["nabu_count_forced_to_gateway_authorizations", "nabu_authorization_only"]),
  admittedRule("RR-USN-08", "Digital Enablement is one bounded mechanic", "The April 2023 Fiserv structure is 0.02% with a $0.02 minimum and $0.20 maximum where applicable; separate printed components do not prove a mechanic change.", ["digital_enablement_min_proves_mechanic_change", "digital_enablement_percent_proves_different_fee"]),
  admittedRule("RR-USN-09", "Location and assessment divergences remain candidates", "The 2025 $3.00 Mastercard Location Fee and 2024 0.1475% Mastercard Assessment remain high-priority research candidates, not confirmed markup.", ["location_fee_confirmed_markup", "mastercard_assessment_confirmed_markup"]),
  admittedRule("RR-USN-10", "Location MCC exclusions remain conflicted", "Conflicting Fiserv and secondary excluded-MCC lists are retained without selecting either as settled knowledge.", ["location_mcc_exclusions_settled"]),
  admittedRule("RR-USN-11", "Data Usage population and economics remain separately evidenced", "The April 2023 Fiserv guide supports Discover Data Usage as per network card sales transaction; count matching alone still proves no economic owner.", ["data_usage_owner_from_count", "data_usage_2020_change_date_invented"]),
  admittedRule("RR-USN-12", "Program Integrity and Amex histories preserve gaps", "Separated 2020, 2022/2023, and 2025 evidence points retain unresolved intervals and are never interpolated.", ["program_integrity_interpolated", "amex_additional_increase_date_invented"]),
  admittedRule("RR-USN-13", "Cross-border and integrity labels do not prove continuity", "Similar labels alone cannot establish one continuous fee or a mechanic change.", ["similar_label_proves_continuity", "similar_label_proves_mechanic_change"]),
  admittedRule("RR-USN-14", "2026 bulletins are change-only evidence", "Only listed 2026 changes are admitted; silence does not confirm unchanged core rates.", ["no_2026_change_means_2023_rate_current", "change_bulletin_is_complete_schedule"]),
  admittedRule("RR-USN-15", "Statements and participant axes stay independent", "Statement billing, reference values, collector, beneficiary, rule setter, and merchant-facing price controller remain separate claims.", ["statement_value_becomes_reference", "collection_proves_benefit", "network_identity_proves_price_controller"]),
];

const APRIL_2023_SOURCE = "fiserv_card_brand_pass_through_guide_2023_04";
const JUNE_2026_SOURCE = "fiserv_card_brand_updates_2026_06";
const APRIL_2023_PERIOD = { effectiveFrom: "2023-04-01", effectiveThrough: "2023-04-30", basis: "schedule_as_of_month" as const, datePrecision: "month" as const };

const RECORDS: GovernedUsNetworkReferenceRecord[] = [
  record("visa_assessment_debit_2023_04", "Visa", "network_assessment", "visa_assessment_debit", ["VISA.*ASSESSMENT.*(?:DB|DEBIT)"], "Visa assessment on debit volume", "assessed ad valorem", "applicable Visa debit volume", [value("debit", 0.0013, "decimal_rate", "Visa debit", ["DB", "DEBIT"])]),
  record("visa_assessment_credit_2023_04", "Visa", "network_assessment", "visa_assessment_credit", ["VISA.*ASSESSMENT.*(?:CR|CREDIT)"], "Visa assessment on credit volume", "assessed ad valorem", "applicable Visa credit volume", [value("credit", 0.0014, "decimal_rate", "Visa credit", ["CR", "CREDIT"])]),
  record("visa_isa_2023_04", "Visa", "visa_international_service_assessment", "visa_international_service_assessment", ["VISA.*(?:INTERNATIONAL SERVICE|ISA)"], "Visa International Service Assessment", "ad valorem with base and enhanced variants", "qualifying international Visa volume", [value("base", 0.01, "decimal_rate", "base ISA", ["ISA"]), value("enhanced", 0.014, "decimal_rate", "enhanced ISA", ["ENHANCED"])]),
  record("visa_iaf_2023_04", "Visa", "visa_international_acquirer", "visa_international_acquirer_fee", ["VISA.*(?:INTERNATIONAL ACQUIRER|IAF)"], "Visa International Acquirer Fee", "ad valorem with a scoped high-risk variant", "qualifying non-U.S.-issued Visa volume", [value("base", 0.0045, "decimal_rate", "base IAF", ["IAF"]), value("high_risk", 0.009, "decimal_rate", "specified high-risk MCCs", ["HIGH RISK"])]),
  record("visa_apf_2023_04", "Visa", "visa_acquirer_processing_or_access", "visa_acquirer_processing_fee", ["VISA.*(?:ACQUIRER PROCESSING|(?:^| )APF(?: |$))"], "Visa Acquirer Processing Fee", "per authorization with product/geography variants", "qualified Visa authorization records", [
    value("us_debit_prepaid", 0.0155, "usd_per_event", "U.S. debit/prepaid", ["US", "DEBIT", "PREPAID", "D/P"]),
    value("us_credit", 0.0195, "usd_per_event", "U.S. credit", ["US", "CREDIT"]),
    value("non_us_debit_prepaid", 0.0355, "usd_per_event", "non-U.S. debit/prepaid", ["NON US", "DEBIT", "PREPAID", "D/P"]),
    value("non_us_credit", 0.0395, "usd_per_event", "non-U.S. credit", ["NON US", "CREDIT"]),
  ]),
  record("visa_misuse_2023_04", "Visa", "visa_misuse", "visa_misuse_of_authorization", ["VISA.*MISUSE"], "Visa Misuse of Authorization", "per unmatched approved or partially approved authorization under the dated rule", "T&E authorizations unmatched within 20 days; other authorizations unmatched within 10 days, in the April 2023 Fiserv scope", [value("event", 0.09, "usd_per_event", "qualifying event", ["MISUSE"])]),
  record("visa_zero_floor_2023_04", "Visa", "visa_zero_floor_limit", "visa_zero_floor_limit", ["VISA.*ZERO FLOOR"], "Visa Zero Floor Limit", "per qualifying settlement lacking the required authorization relationship", "qualifying Zero Floor events in the April 2023 Fiserv scope", [value("event", 0.20, "usd_per_event", "qualifying event", ["ZERO FLOOR"])]),
  record("visa_tif_2023_04", "Visa", "visa_transaction_integrity", "visa_transaction_integrity_fee", ["(?:VISA|(?:^| )VI(?: |$)|(?:^| )VS(?: |$)).*(?:TRANSACTION INTEGRITY|TRAN INTEGRITY|INTEGRITY FEE)"], "Visa Transaction Integrity Fee", "per specified U.S. transaction failing/requesting the dated CPS treatment", "specified U.S.-merchant/U.S.-issued transaction scope in the April 2023 Fiserv guide", [value("event", 0.10, "usd_per_event", "qualifying event", ["INTEGRITY"])]),
  record("visa_base_ii_system_file_2023_04", "Visa", "clearing_or_data_record_family", "visa_base_ii_system_file_fee", ["(?:VISA|(?:^| )VI(?: |$)).*BASE ?II SYSTEM FILE"], "Visa Base II System File Fee", "per system-file/data record", "qualified Base II system-file records", [value("record", 0.0018, "usd_per_event", "system-file record", ["SYSTEM FILE"])]),
  record("visa_fanf_structure_2023_04", "Visa", "network_fixed_acquirer_network_fee", "visa_fixed_acquirer_network_fee", ["VISA.*(?:FIXED ACQUIRER NETWORK|(?:^| )FANF(?: |$))"], "Visa Fixed Acquirer Network Fee", "monthly structure varies between card-present and card-not-present programs", "active-location/MCC or monthly gross Visa sales tiers", [], [], ["Actual period-specific FANF tier tables were not retained; no tier value is admitted."]),
  record("mastercard_assessment_2023_04", "Mastercard", "network_assessment", "mastercard_assessment", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*(?:ASSESSMENT|DUES & ASSESSMENTS)"], "Mastercard assessment", "0.13% base plus 0.01% on transactions at or above $1,000", "applicable Mastercard volume with a separately scoped high-ticket component", [value("base", 0.0013, "decimal_rate", "base assessment", ["ASSESSMENT"]), value("high_ticket_addition", 0.0001, "decimal_rate", "transactions >= $1,000, additive", [">= 1000"])]),
  record("mastercard_cross_border_2023_04", "Mastercard", "mastercard_cross_border", "mastercard_cross_border_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*CROSS.?BORDER"], "Mastercard cross-border fee", "ad valorem with settlement-currency variants", "U.S. merchant cross-border volume", [value("usd_settlement", 0.006, "decimal_rate", "USD settlement", ["USD"]), value("non_usd_settlement", 0.01, "decimal_rate", "non-USD settlement", ["NON USD"])]),
  record("mastercard_nabu_2023_04", "Mastercard", "mastercard_network_access_or_authorization", "mastercard_network_access_and_brand_usage", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*(?:^| )NABU(?: |$)"], "Mastercard Network Access and Brand Usage", "per documented message/record in scope, not authorization-only", "authorization records, Collection Only, and Return/Credit settled transactions for stated U.S.-merchant/U.S.-cardholder scope", [value("us_scope", 0.0195, "usd_per_event", "stated U.S. scope", ["NABU"])]),
  record("mastercard_global_acquirer_2023_04", "Mastercard", "mastercard_global_acquirer", "mastercard_global_acquirer_support_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*GLOBAL ACQUIRER"], "Mastercard Global Acquirer Support Fee", "ad valorem", "qualifying non-U.S.-issued Mastercard volume", [value("base", 0.0085, "decimal_rate", "documented scope", ["GLOBAL ACQUIRER"])]),
  record("mastercard_digital_enablement_2023_04", "Mastercard", "network_digital_enablement", "mastercard_digital_enablement_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*DIGITAL ENABLEMENT"], "Mastercard Digital Enablement Fee", "one bounded ad-valorem formula: 0.02%, $0.02 minimum, $0.20 maximum where applicable", "applicable card-not-present transactions", [value("ad_valorem", 0.0002, "decimal_rate", "ad-valorem component", ["DIGITAL ENABLEMENT"]), minimumValue("minimum", 0.02, "usd_per_event", "minimum-bound component", ["MIN"]), maximumValue("maximum", 0.20, "usd_per_event", "maximum-bound component", ["MAX"])]),
  record("mastercard_pre_auth_integrity_2023_04", "Mastercard", "network_exception_or_integrity_family", "mastercard_pre_authorization_processing_integrity", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*(?:PROCESSING INTEGRITY.*PRE.?AUTH|PRE.?AUTH.*PROCESSING INTEGRITY)"], "Mastercard Pre-Authorization processing-integrity structure", "separate pre-authorization structure", "scope defined in the April 2023 Fiserv guide", []),
  record("mastercard_undefined_auth_integrity_2023_04", "Mastercard", "network_exception_or_integrity_family", "mastercard_undefined_authorization_processing_integrity", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*(?:PROCESSING INTEGRITY.*UNDEFINED AUTH|UNDEFINED AUTH.*PROCESSING INTEGRITY)"], "Mastercard Undefined Authorization processing-integrity structure", "separate undefined-authorization structure", "scope defined in the April 2023 Fiserv guide", []),
  record("mastercard_final_auth_integrity_2023_04", "Mastercard", "network_exception_or_integrity_family", "mastercard_final_authorization_processing_integrity", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*(?:PROCESSING INTEGRITY.*FINAL AUTH|FINAL AUTH.*PROCESSING INTEGRITY)"], "Mastercard Final Authorization processing-integrity structure", "separate final-authorization structure", "scope defined in the April 2023 Fiserv guide", []),
  record("mastercard_location_2023_04", "Mastercard", "network_merchant_location", "mastercard_location_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*LOCATION FEE"], "Mastercard Location Fee", "monthly per qualifying merchant location", "location accepts at least one Mastercard transaction and has at least $200 monthly gross Mastercard volume", [value("monthly_location", 1.25, "usd_per_location_month", "qualifying location/month", ["LOCATION"])] , ["Excluded-MCC list remains conflicted: the retained Fiserv guide states 8393 and 8661; secondary material states 8661 and 8398."]),
  record("mastercard_connectivity_kb_2023_04", "Mastercard", "clearing_or_data_record_family", "mastercard_connectivity_kilobyte_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*CONNECTIVITY.*(?:KILOBYTE|(?:^| )KB(?: |$))"], "Mastercard Connectivity Kilobyte fee", "per documented kilobyte", "documented connectivity kilobytes", [value("kilobyte", 0.002294, "usd_per_kilobyte", "kilobyte", ["KILOBYTE", "KB"])]),
  record("discover_network_authorization_2023_04", "Discover", "discover_network_authorization", "discover_network_authorization_fee", ["DISCOVER.*(?:NETWORK AUTHORIZATION|NETWORK AUTH|AUTHORIZATION FEE)"], "Discover Network Authorization Fee", "per authorization", "Discover authorization records", [value("authorization", 0.019, "usd_per_event", "authorization", ["AUTH"])]),
  record("discover_data_usage_2023_04", "Discover", "clearing_or_data_record_family", "discover_data_usage_fee", ["(?:DISCOVER|DSCV|DCVR).*DATA USAGE"], "Discover Data Usage Fee", "per network card sales transaction", "settlement-side network card sales transactions", [value("sales_transaction", 0.0025, "usd_per_event", "network card sales transaction", ["DATA USAGE"])]),
  record("discover_program_integrity_2023_04", "Discover", "discover_program_integrity", "discover_program_integrity_fee", ["(?:DISCOVER|DSCV|DCVR|DS).*PROGRAM INTEGRITY"], "Discover Program Integrity Fee", "per qualifying program-integrity transaction", "qualifying program-integrity transaction under the April 2023 Fiserv scope", [value("event", 0.10, "usd_per_event", "qualifying event", ["PROGRAM INTEGRITY"])] , [], ["The exact change date from the 2020 $0.05 announcement to the April 2023 $0.10 reference is unresolved."]),
  record("amex_assessment_2023_04", "American Express", "amex_acquired_program_network_transaction", "american_express_general_assessment", ["(?:AMEX|AMERICAN EXPRESS).*ASSESSMENT"], "American Express General Assessment", "ad valorem", "applicable acquired/OptBlue American Express volume", [value("assessment", 0.00165, "decimal_rate", "documented 2023 scope", ["ASSESSMENT"])] , [], ["The exact date of the additional increase after the announced 2020 step to 0.16% remains unresolved."]),

  changeRecord("visa_cnp_token_fee_2026_06", "Visa", "network_digital_enablement", "visa_card_not_present_token_fee", ["VISA.*(?:CNP|CARD NOT PRESENT).*TOKEN"], "2026-06-01", "0.015% with $0.01 minimum", [value("ad_valorem", 0.00015, "decimal_rate", "card-not-present token", ["CNP"]), minimumValue("minimum", 0.01, "usd_per_event", "minimum", ["MIN"])]),
  changeRecord("visa_cross_border_cp_token_fee_2026_06", "Visa", "visa_international_service_assessment", "visa_cross_border_card_present_token_fee", ["VISA.*CROSS.?BORDER.*(?:CP|CARD PRESENT).*TOKEN"], "2026-06-01", "0.05%", [value("ad_valorem", 0.0005, "decimal_rate", "cross-border card-present token", ["CROSS BORDER"])]),
  changeRecord("visa_cp_token_fee_2026_06", "Visa", "network_digital_enablement", "visa_card_present_token_fee", ["VISA(?!.*CROSS.?BORDER).*(?:CP|CARD PRESENT).*TOKEN"], "2026-06-01", "0.01%", [value("ad_valorem", 0.0001, "decimal_rate", "card-present token", ["CP"])]),
  changeRecord("visa_foreign_cnp_digital_commerce_2026_06", "Visa", "network_digital_enablement", "visa_foreign_card_cnp_digital_commerce_service_fee", ["VISA.*(?:FOREIGN|NON US).*(?:CNP|CARD NOT PRESENT).*DIGITAL COMMERCE"], "2026-06-01", "0.0075% to 0.035%; minimum $0.0075 to $0.01", [value("new_ad_valorem", 0.00035, "decimal_rate", "foreign-card CNP", ["DIGITAL COMMERCE"]), minimumValue("new_minimum", 0.01, "usd_per_event", "minimum", ["MIN"])], [value("old_ad_valorem", 0.000075, "decimal_rate", "prior foreign-card CNP value", ["DIGITAL COMMERCE"]), minimumValue("old_minimum", 0.0075, "usd_per_event", "prior minimum", ["MIN"])]),
  changeRecord("mastercard_fallback_avoidance_2026", "Mastercard", "network_exception_or_integrity_family", "mastercard_fallback_avoidance_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*FALLBACK AVOIDANCE"], "2026-01-01", "0.10% for applicable fallback transactions", [value("ad_valorem", 0.001, "decimal_rate", "applicable fallback transaction", ["FALLBACK"])], [], "year"),
  changeRecord("mastercard_mchip_deployment_2026_08", "Mastercard", "network_exception_or_integrity_family", "mastercard_mchip_deployment_performance_program_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*M.?CHIP.*DEPLOYMENT"], "2026-08-01", "$12 per terminal per recurring 30-day period", [value("terminal", 12, "usd_per_terminal_30_days", "terminal/30 days", ["TERMINAL"])]),
  changeRecord("mastercard_dispute_image_2026_07", "Mastercard", "network_exception_or_integrity_family", "mastercard_dispute_image_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*DISPUTE IMAGE"], "2026-07-01", "$0.20 to $0.23", [value("new_value", 0.23, "usd_per_event", "dispute image", ["DISPUTE IMAGE"])], [value("old_value", 0.20, "usd_per_event", "prior dispute image value", ["DISPUTE IMAGE"])]),
  changeRecord("mastercard_dispute_case_2026_07", "Mastercard", "network_exception_or_integrity_family", "mastercard_dispute_case_fee", ["(?:MASTERCARD|(?:^| )MC(?: |$)).*DISPUTE CASE"], "2026-07-01", "$1.35 to $1.55", [value("new_value", 1.55, "usd_per_event", "dispute case", ["DISPUTE CASE"])], [value("old_value", 1.35, "usd_per_event", "prior dispute case value", ["DISPUTE CASE"])]),
];

export function governedUsNetworkSources2020_2026V1(): GovernedUsNetworkSource[] {
  return structuredClone(SOURCES);
}

export function governedUsNetworkReferenceRecords2020_2026V1(): GovernedUsNetworkReferenceRecord[] {
  return structuredClone(RECORDS);
}

export function governedUsNetworkRules2020_2026V1(): GovernedUsNetworkRule[] {
  return structuredClone(RULES);
}

export function resolveGovernedUsNetworkFeeEvidence2020_2026V1(input: {
  analysis: CanonicalStatementAnalysis;
  datedNetworkEvidence: GovernedDatedNetworkFeeEvidenceResolution;
}): GovernedUsNetworkFeeEvidenceResolution {
  const rows = input.analysis.feeLedger.rows.map((row) => resolveRow(
    input.analysis,
    row,
    input.datedNetworkEvidence.rowsByFeeRowId[row.id]!,
  ));
  return deepFreeze({
    catalogVersion: GOVERNED_US_NETWORK_FEE_EVIDENCE_2020_2026_V1,
    sources: governedUsNetworkSources2020_2026V1(),
    records: governedUsNetworkReferenceRecords2020_2026V1(),
    rules: governedUsNetworkRules2020_2026V1(),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    diagnostics: {
      applicableRows: rows.filter((row) => row.applicable).length,
      identityStrengthenedRows: rows.filter((row) => row.identity.state === "supported").length,
      mechanicStrengthenedRows: rows.filter((row) => row.mechanic.state === "supported").length,
      populationStrengthenedRows: rows.filter((row) => row.population.state === "supported").length,
      periodMatchedReferenceRows: rows.filter((row) => row.reference.state === "period_matched_processor_reference").length,
      adjacentPeriodReferenceRows: rows.filter((row) => row.reference.state === "adjacent_period_processor_reference").length,
      lackingCurrent2026CoreValueRows: rows.filter((row) => row.applicable && !row.reference.current2026CoreValueEstablished).length,
      aboveReferenceCandidateRows: rows.filter((row) => row.comparison.state === "candidate_above_reference").length,
      confirmedMarkupRows: 0,
      confirmedAtParRows: 0,
      officialNetworkParRows: 0,
      nabuCorrectedRows: rows.filter((row) => row.correction.nabuAuthorizationOnlyRemoved).length,
      digitalEnablementCorrectedRows: rows.filter((row) => row.correction.digitalEnablementBoundedMechanicApplied).length,
      sourceConflictRows: rows.filter((row) => row.sourceConflicts.length > 0).length,
    },
    canonicalMutationAllowed: false,
    limitations: [
      "Every admitted external value is Fiserv processor/acquirer evidence; this milestone admits no primary network publication value.",
      "April 2023 schedule values are point-in-time references. Statements outside April 2023 receive at most adjacent-period or identity/mechanic support.",
      "June 2026 material is a change bulletin and cannot confirm unchanged 2026 core rates by silence.",
      "No statement observation becomes a reference value, no adjacent match becomes confirmed at par, and no candidate divergence becomes confirmed markup.",
    ],
  });
}

function resolveRow(
  analysis: CanonicalStatementAnalysis,
  row: CanonicalFeeRow,
  dated: GovernedDatedNetworkRowResolution,
): GovernedUsNetworkRowResolution {
  if (!dated.applicable) return notApplicable(row.id);
  const text = normalize(row.selectedLabel);
  const matched = RECORDS.filter((record) => record.matchPatterns.some((pattern) => new RegExp(pattern).test(text)));
  const best = matched[0] ?? null;
  const evidenceRefs = best ? [best.recordId, best.sourceId, best.evidenceLocator] : [];
  const statementPeriod = dated.billedObservation?.statementPeriod;
  const temporal = best && statementPeriod ? temporalState(best, statementPeriod) : "no_applicable_reference" as const;
  const candidates = best ? selectValues(best, text) : [];
  const ambiguousProductVariant = Boolean(best && best.values.length > 1 && candidates.length !== 1 && best.recordId !== "mastercard_digital_enablement_2023_04" && best.recordId !== "mastercard_assessment_2023_04");
  const referenceState = ambiguousProductVariant
    ? "ambiguous_product_variant" as const
    : best && temporal === "period_matched"
      ? "period_matched_processor_reference" as const
      : best && temporal === "adjacent"
        ? "adjacent_period_processor_reference" as const
        : best
          ? "current_material_identity_mechanic_only" as const
          : "no_applicable_reference" as const;
  const statementValue = billedValue(row, dated, text);
  const comparison = compare(best, candidates, statementValue, referenceState, statementPeriod?.end ?? null, text);
  const isNabu = best?.recordId === "mastercard_nabu_2023_04";
  const isDigital = best?.recordId === "mastercard_digital_enablement_2023_04";
  const isDataUsage = best?.recordId === "discover_data_usage_2023_04";
  const isPresentation = best?.family === "visa_international_acquirer" || best?.family === "mastercard_global_acquirer";
  const sourceConflicts = best?.conflicts ?? [];
  const research = researchFor(best, comparison, statementPeriod?.end ?? null);
  return {
    feeRowId: row.id,
    applicable: true,
    identity: {
      state: best ? "supported" : "not_strengthened",
      value: best?.identity ?? null,
      confidence: best ? "STRONG" : "UNRESOLVED",
      evidenceRefs,
    },
    mechanic: {
      state: best ? "supported" : "not_strengthened",
      value: best?.mechanicClaim ?? null,
      confidence: best ? "STRONG" : "UNRESOLVED",
      evidenceRefs,
      supersedesEarlierSimplification: isNabu || isDigital,
      mechanicChangeInferred: false,
    },
    population: {
      state: best ? "supported" : "not_strengthened",
      value: best?.populationClaim ?? null,
      confidence: best ? "STRONG" : "UNRESOLVED",
      forcedToGatewayAuthorizationCount: false,
      economicCharacterInferredFromCount: false,
      evidenceRefs,
    },
    reference: {
      state: referenceState,
      evidenceClass: best?.evidenceClass ?? null,
      matchedRecordIds: matched.map((record) => record.recordId),
      candidateValues: structuredClone(candidates),
      sourceDate: best?.sourceDate ?? null,
      effectiveFrom: best?.referencePeriod.effectiveFrom ?? null,
      effectiveThrough: best?.referencePeriod.effectiveThrough ?? null,
      officialNetworkParEstablished: false,
      historicalNetworkParEstablished: false,
      adjacentPeriodOnly: referenceState === "adjacent_period_processor_reference",
      current2026CoreValueEstablished: Boolean(best?.sourceId === JUNE_2026_SOURCE),
    },
    billedObservation: dated.billedObservation,
    comparison,
    correction: {
      nabuAuthorizationOnlyRemoved: isNabu,
      digitalEnablementBoundedMechanicApplied: isDigital,
      dataUsageSettlementPopulationStrengthened: isDataUsage,
      presentationChangePreserved: Boolean(isPresentation && dated.historicalComparison.announcementEvidenceRefs.length > 0),
      historicalGapPreserved: Boolean(
        best?.recordId === "discover_program_integrity_2023_04" ||
        best?.recordId === "amex_assessment_2023_04" ||
        comparison.state === "different_with_unresolved_historical_gap"
      ),
    },
    sourceConflicts,
    research,
    renderingPermissions: {
      officialParLanguageAllowed: false,
      confirmedAtParLanguageAllowed: false,
      confirmedMarkupLanguageAllowed: false,
      adjacentReferenceLanguageAllowed: referenceState === "adjacent_period_processor_reference",
      announcementAsImplementationAllowed: false,
      crossMerchantHistoryAllowed: false,
      backwardProjectionFrom2026Allowed: false,
    },
    matchedRuleRefs: rulesFor(best, comparison),
    limitations: [
      "Identity, mechanic/population, reference value, statement-billed value, collector, beneficiary, and merchant-facing controller remain separate claims.",
      "The reference source is Fiserv processor evidence and is not characterized as a primary network publication.",
      ...(best?.knownGaps ?? []),
      ...sourceConflicts,
    ],
  };
}

function temporalState(record: GovernedUsNetworkReferenceRecord, period: { start: string; end: string }): "period_matched" | "adjacent" | "identity_only" {
  if (period.end >= record.referencePeriod.effectiveFrom && period.start <= record.referencePeriod.effectiveThrough) return "period_matched";
  if (record.sourceId === JUNE_2026_SOURCE) return "identity_only";
  const statementYear = Number.parseInt(period.end.slice(0, 4), 10);
  return statementYear >= 2020 && statementYear <= 2026 ? "adjacent" : "identity_only";
}

function selectValues(record: GovernedUsNetworkReferenceRecord, text: string): GovernedUsNetworkValue[] {
  if (record.recordId === "mastercard_digital_enablement_2023_04") {
    if (/\bMIN\b/.test(text)) return record.values.filter((item) => item.minimum);
    if (/\bMAX\b/.test(text)) return record.values.filter((item) => item.maximum);
    return record.values.filter((item) => !item.minimum && !item.maximum);
  }
  if (record.recordId === "mastercard_assessment_2023_04") return record.values;
  if (record.values.length <= 1) return record.values;
  const matched = record.values.filter((item) => item.matchTokens.some((token) => text.includes(normalize(token))));
  return matched.length === 1 ? matched : record.values;
}

function billedValue(row: CanonicalFeeRow, dated: GovernedDatedNetworkRowResolution, text: string): number | null {
  const original = dated.billedObservation?.printedRate?.original;
  if (original && Number.isFinite(Number.parseFloat(original))) return Number.parseFloat(original);
  const rawLabel = row.selectedLabel.toUpperCase();
  const assessedRate = rawLabel.match(/(?:ASSESSMENT FEE|DUES\/ASSESSMENT FEE)\s+(\d*\.?\d+)\s+TIMES/);
  if (assessedRate && Number.isFinite(Number.parseFloat(assessedRate[1]!))) return Number.parseFloat(assessedRate[1]!);
  if (/LOCATION FEE/.test(text) && row.selectedAmount) return row.selectedAmount.amountMinor / 100;
  return null;
}

function compare(
  record: GovernedUsNetworkReferenceRecord | null,
  candidates: GovernedUsNetworkValue[],
  statementValue: number | null,
  referenceState: GovernedUsNetworkRowResolution["reference"]["state"],
  statementDate: string | null,
  text: string,
): GovernedUsNetworkRowResolution["comparison"] {
  const base = {
    statementValue,
    referenceValue: null,
    unit: null,
    difference: null,
    passThroughAtParEstablished: false as const,
    confirmedMarkupEstablished: false as const,
  };
  if (!record || statementValue === null || candidates.length === 0) {
    return { ...base, state: "not_comparable", renderingText: "No safely comparable statement value and dated reference variant are both available." };
  }
  if (record.recordId === "mastercard_assessment_2023_04" && Math.abs(statementValue - 0.001475) < 1e-9) {
    return { ...base, state: "candidate_above_reference", statementValue, referenceValue: 0.0013, unit: "decimal_rate", difference: statementValue - 0.0013, renderingText: "The 0.1475% billed observation is a high-priority above-reference candidate, but no period-matched 2024 reference is held and no markup is confirmed." };
  }
  if (record.recordId === "mastercard_assessment_2023_04" && candidates.length > 1) {
    return { ...base, state: "population_or_product_scope_unresolved", statementValue, referenceValue: 0.0013, unit: "decimal_rate", difference: statementValue - 0.0013, renderingText: "The April 2023 Fiserv guide has a base and separately scoped high-ticket component; the statement population does not permit a confirmed comparison." };
  }
  const candidate = candidates[0]!;
  const difference = statementValue - candidate.value;
  if (record.recordId === "mastercard_location_2023_04" && statementDate?.startsWith("2025") && Math.abs(statementValue - 3) < 1e-9) {
    return { ...base, state: "candidate_above_reference", statementValue, referenceValue: candidate.value, unit: candidate.unit, difference, renderingText: "This merchant was billed $3.00 per month; the closest strong Fiserv reference held is $1.25 per qualifying location/month in April 2023. This is a strong acquiring-side-uplift candidate, not confirmed network-fee markup." };
  }
  if (Math.abs(difference) < 1e-9) {
    if (referenceState === "period_matched_processor_reference") {
      return { ...base, state: "consistent_with_period_reference", statementValue, referenceValue: candidate.value, unit: candidate.unit, difference: 0, renderingText: "The billed value is consistent with the applicable dated Fiserv processor reference; this does not by itself establish primary-network par or merchant-facing pass-through at par." };
    }
    if (referenceState === "adjacent_period_processor_reference") {
      return { ...base, state: "consistent_with_adjacent_period_reference", statementValue, referenceValue: candidate.value, unit: candidate.unit, difference: 0, renderingText: "The billed value is consistent with the available April 2023 Fiserv reference, but no period-matched source is held and confirmed at-par language is prohibited." };
    }
  }
  if (record.recordId === "discover_data_usage_2023_04" || record.recordId === "discover_program_integrity_2023_04" || record.recordId === "amex_assessment_2023_04") {
    return { ...base, state: "different_with_unresolved_historical_gap", statementValue, referenceValue: candidate.value, unit: candidate.unit, difference, renderingText: "The dated billed observation differs from the available reference point; the intervening change date and continuity remain unresolved and are not interpolated." };
  }
  return { ...base, state: "population_or_product_scope_unresolved", statementValue, referenceValue: candidate.value, unit: candidate.unit, difference, renderingText: "A dated reference exists, but product, population, mechanic, or period scope is insufficient for a responsible price conclusion." };
}

function researchFor(
  record: GovernedUsNetworkReferenceRecord | null,
  comparison: GovernedUsNetworkRowResolution["comparison"],
  statementDate: string | null,
): GovernedUsNetworkRowResolution["research"] {
  if (comparison.state === "candidate_above_reference" && record?.recordId === "mastercard_location_2023_04") {
    return { priority: "high", reasonCodes: ["closest_reference_gap", "candidate_above_reference", "merchant_facing_price_control_unresolved"], question: `Obtain a period-matched ${statementDate?.slice(0, 4) ?? "2025"} Mastercard/Fiserv Location Fee source, resolve program scope and the excluded-MCC conflict, and determine whether the $3.00 billed amount includes an acquiring-side uplift without presuming markup.` };
  }
  if (comparison.state === "candidate_above_reference" && record?.recordId === "mastercard_assessment_2023_04") {
    return { priority: "high", reasonCodes: ["missing_2024_reference", "candidate_above_reference", "population_blending_possible"], question: "Obtain a period-matched 2024 Mastercard/Fiserv assessment reference and population detail sufficient to resolve the 0.1475% billed observation without presuming markup." };
  }
  if (record?.recordId === "visa_fanf_structure_2023_04") {
    return { priority: "high", reasonCodes: ["missing_tier_table"], question: "Retain the applicable period-specific Visa FANF tier table before making any tier-rate comparison." };
  }
  return { priority: "none", reasonCodes: [], question: null };
}

function rulesFor(record: GovernedUsNetworkReferenceRecord | null, comparison: GovernedUsNetworkRowResolution["comparison"]): string[] {
  const refs = ["RR-USN-01", "RR-USN-02", "RR-USN-03", "RR-USN-15"];
  if (!record) return refs;
  if (record.recordId === "visa_apf_2023_04") refs.push("RR-USN-04");
  if (["visa_misuse_2023_04", "visa_zero_floor_2023_04", "visa_tif_2023_04"].includes(record.recordId)) refs.push("RR-USN-05");
  if (record.recordId === "visa_fanf_structure_2023_04") refs.push("RR-USN-06");
  if (record.recordId === "mastercard_nabu_2023_04") refs.push("RR-USN-07");
  if (record.recordId === "mastercard_digital_enablement_2023_04") refs.push("RR-USN-08");
  if (comparison.state === "candidate_above_reference") refs.push("RR-USN-09");
  if (record.recordId === "mastercard_location_2023_04") refs.push("RR-USN-10");
  if (record.recordId === "discover_data_usage_2023_04") refs.push("RR-USN-11");
  if (record.recordId === "discover_program_integrity_2023_04" || record.recordId === "amex_assessment_2023_04") refs.push("RR-USN-12");
  if (record.family === "mastercard_cross_border" || record.family === "network_exception_or_integrity_family") refs.push("RR-USN-13");
  if (record.sourceId === JUNE_2026_SOURCE) refs.push("RR-USN-14");
  return [...new Set(refs)];
}

function notApplicable(feeRowId: string): GovernedUsNetworkRowResolution {
  return {
    feeRowId,
    applicable: false,
    identity: { state: "not_applicable", value: null, confidence: "UNRESOLVED", evidenceRefs: [] },
    mechanic: { state: "not_applicable", value: null, confidence: "UNRESOLVED", evidenceRefs: [], supersedesEarlierSimplification: false, mechanicChangeInferred: false },
    population: { state: "not_applicable", value: null, confidence: "UNRESOLVED", forcedToGatewayAuthorizationCount: false, economicCharacterInferredFromCount: false, evidenceRefs: [] },
    reference: { state: "not_applicable", evidenceClass: null, matchedRecordIds: [], candidateValues: [], sourceDate: null, effectiveFrom: null, effectiveThrough: null, officialNetworkParEstablished: false, historicalNetworkParEstablished: false, adjacentPeriodOnly: false, current2026CoreValueEstablished: false },
    billedObservation: null,
    comparison: { state: "not_comparable", statementValue: null, referenceValue: null, unit: null, difference: null, passThroughAtParEstablished: false, confirmedMarkupEstablished: false, renderingText: "No governed U.S. network reference analysis applies." },
    correction: { nabuAuthorizationOnlyRemoved: false, digitalEnablementBoundedMechanicApplied: false, dataUsageSettlementPopulationStrengthened: false, presentationChangePreserved: false, historicalGapPreserved: false },
    sourceConflicts: [],
    research: { priority: "none", reasonCodes: [], question: null },
    renderingPermissions: { officialParLanguageAllowed: false, confirmedAtParLanguageAllowed: false, confirmedMarkupLanguageAllowed: false, adjacentReferenceLanguageAllowed: false, announcementAsImplementationAllowed: false, crossMerchantHistoryAllowed: false, backwardProjectionFrom2026Allowed: false },
    matchedRuleRefs: [],
    limitations: [],
  };
}

function record(
  recordId: string,
  network: GovernedUsNetworkReferenceRecord["network"],
  family: GovernedNetworkFeeFamily,
  identity: string,
  matchPatterns: string[],
  identityClaim: string,
  mechanicClaim: string,
  populationClaim: string,
  values: GovernedUsNetworkValue[],
  conflicts: string[] = [],
  knownGaps: string[] = [],
): GovernedUsNetworkReferenceRecord {
  return {
    recordId,
    sourceId: APRIL_2023_SOURCE,
    network,
    family,
    identity,
    matchPatterns,
    evidenceClass: "E4_processor_or_acquirer_schedule",
    evidenceLocator: `${PRODUCT_PACK_REF}#${recordId}`,
    sourceDate: "2023-04-01",
    sourceDatePrecision: "month",
    referencePeriod: APRIL_2023_PERIOD,
    lifecycle: "documented_reference",
    implementationState: "documented_for_reference_period",
    geographyScope: "United States and U.S. Territories subject to product scope",
    productScope: values.map((item) => item.productScope).join("; ") || populationClaim,
    identityClaim,
    mechanicClaim,
    populationClaim,
    values,
    priorValues: [],
    confidence: "STRONG",
    knownGaps,
    conflicts,
    officialNetworkPublication: false,
    statementDerived: false,
  };
}

function changeRecord(
  recordId: string,
  network: GovernedUsNetworkReferenceRecord["network"],
  family: GovernedNetworkFeeFamily,
  identity: string,
  matchPatterns: string[],
  effectiveFrom: string,
  claim: string,
  values: GovernedUsNetworkValue[],
  priorValues: GovernedUsNetworkValue[] = [],
  datePrecision: "month" | "year" = "month",
): GovernedUsNetworkReferenceRecord {
  const [effectiveYear, effectiveMonth] = effectiveFrom.split("-").map(Number);
  const effectiveThrough = datePrecision === "year"
    ? `${effectiveFrom.slice(0, 4)}-12-31`
    : new Date(Date.UTC(effectiveYear!, effectiveMonth!, 0)).toISOString().slice(0, 10);

  return {
    recordId,
    sourceId: JUNE_2026_SOURCE,
    network,
    family,
    identity,
    matchPatterns,
    evidenceClass: "E4_processor_change_bulletin",
    evidenceLocator: `${PRODUCT_PACK_REF}#${recordId}`,
    sourceDate: "2026-06-01",
    sourceDatePrecision: "month",
    referencePeriod: { effectiveFrom, effectiveThrough, basis: "dated_change", datePrecision },
    lifecycle: "announced_change",
    implementationState: "unconfirmed",
    geographyScope: "United States scope described by the retained Fiserv change bulletin",
    productScope: values.map((item) => item.productScope).join("; "),
    identityClaim: claim,
    mechanicClaim: claim,
    populationClaim: values.map((item) => item.productScope).join("; "),
    values,
    priorValues,
    confidence: "STRONG",
    knownGaps: ["The retained bulletin is change-only evidence and does not confirm unchanged 2026 core rates.", ...(datePrecision === "year" ? ["Only year precision is retained for this change; the exact effective date is unresolved."] : [])],
    conflicts: [],
    officialNetworkPublication: false,
    statementDerived: false,
  };
}

function value(
  variantId: string,
  amount: number,
  unit: GovernedUsNetworkValue["unit"],
  productScope: string,
  matchTokens: string[],
): GovernedUsNetworkValue {
  return { variantId, value: amount, unit, productScope, matchTokens, minimum: false, maximum: false };
}

function minimumValue(...input: Parameters<typeof value>): GovernedUsNetworkValue {
  return { ...value(...input), minimum: true };
}

function maximumValue(...input: Parameters<typeof value>): GovernedUsNetworkValue {
  return { ...value(...input), maximum: true };
}

function admittedRule(ruleId: string, title: string, admittedClaim: string, prohibitedClaims: string[]): GovernedUsNetworkRule {
  return {
    ruleId,
    title,
    admittedClaim,
    prohibitedClaims,
    evidenceClass: "G1_product_domain_adjudication",
    sourceRefs: [PRODUCT_REQUEST_REF, PRODUCT_PACK_REF],
    sourceFingerprints: [PRODUCT_REQUEST_SHA256, PRODUCT_PACK_SHA256],
    reviewedAt: "2026-09-07",
    admissionStatus: "admitted",
  };
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function governedUsNetworkFeeEvidenceFingerprint2020_2026V1(): string {
  return createHash("sha256").update(JSON.stringify({ sources: SOURCES, records: RECORDS, rules: RULES })).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
