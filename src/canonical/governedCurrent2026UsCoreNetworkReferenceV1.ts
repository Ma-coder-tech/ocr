import { createHash } from "node:crypto";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";
import type { GovernedUsNetworkRowResolution, GovernedUsNetworkValue } from "./governedUsNetworkFeeEvidence2020_2026V1.js";
import type { GovernedMastercardFocusedRowResolution, LineToFeeCardinalityState } from "./governedMastercardFocusedEvidence2024_2026V1.js";

export const GOVERNED_CURRENT_2026_US_CORE_NETWORK_REFERENCE_V1 =
  "governed_current_2026_us_core_network_reference_historical_current_firewall_2026_09_09_v1" as const;

export type Current2026ReferenceConfidence =
  | "CURRENT_CONFIRMED_CHANGE"
  | "CURRENT_WORKING_REFERENCE_STRONG"
  | "CURRENT_WORKING_REFERENCE_LIKELY"
  | "CURRENT_RATE_UNRESOLVED";

export type Current2026ReferenceUnit = GovernedUsNetworkValue["unit"] | "population" | "no_maximum_cap";

export type GovernedCurrent2026Source = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceClass: "G1_product_domain_adjudication" | "E2_public_merchant_document" | "E4_processor_or_acquirer" | "E7_public_industry_reference";
  publicationDate: string | null;
  retainedThrough: string;
  retainedPackageFingerprint: string;
  immutable: true;
  rowClaims: Array<{
    claimId: string;
    assertion: string;
    currencyState: "dated_current_change" | "row_specific_current" | "stale_or_conflicting" | "historical";
    effectiveFrom: string | null;
  }>;
  limitations: string[];
};

export type GovernedCurrent2026ReferenceRecord = {
  recordId: string;
  kind: "dated_current_change" | "current_working_reference" | "current_unresolved";
  network: "Visa" | "Mastercard" | "Discover" | "American Express";
  identity: string;
  matchPatterns: string[];
  excludePatterns: string[];
  matchIdentityValues: string[];
  confidence: Current2026ReferenceConfidence;
  values: Array<{ variantId: string; value: number | string; unit: Current2026ReferenceUnit; scope: string }>;
  candidateValues: Array<{ value: number | string; unit: Current2026ReferenceUnit }>;
  rejectedCandidates: Array<{ value: number | string; unit: Current2026ReferenceUnit; disposition: "unsupported_stale_or_error_candidate"; origin: "unresolved" }>;
  priorValues: Array<{ value: number | string; unit: Current2026ReferenceUnit; effectiveThrough: string | null }>;
  effectiveFrom: string | null;
  referenceApplicabilityFrom: string;
  geographyScope: "United States merchant acquiring";
  productScope: string;
  sourceRefs: string[];
  rowCurrencyEvidenceRefs: string[];
  conflicts: string[];
  limitations: string[];
  prohibitedClaims: string[];
  admissionStatus: "admitted";
};

export type GovernedCurrent2026Rule = {
  ruleId: "CUR-26-01" | "CUR-26-02" | "CUR-26-03" | "CUR-26-04" | "CUR-26-05";
  title: string;
  admittedClaim: string;
  prohibitedClaims: string[];
  sourceRefs: string[];
  sourceFingerprints: string[];
  reviewedAt: "2026-09-07" | "2026-09-09";
  admissionStatus: "admitted";
};

export type Current2026LocationCaseResolution = {
  caseId: "PAYSAFE_LOCATION_CASE_A_2025_10" | "PAYSAFE_LOCATION_CASE_B_2025_09";
  independentlyEvaluated: true;
  uniqueSourceOccurrenceVerified: true;
  exactLabelVerified: true;
  processorProgramEvidence: "Fiserv / First Data statement; Paysafe merchant program label";
  feeInventoryEvidenceRefs: string[];
  missingComponentPossibility: "WEAKENED_NOT_EXCLUDED";
  billedAboveAvailableReference: "STRONG";
  acquiringSideUplift: "LIKELY";
  contractualViolation: "UNRESOLVED";
  excessCommercialController: "UNRESOLVED";
  excessEconomicBeneficiary: "UNRESOLVED";
  limitations: string[];
};

export type GovernedCurrent2026RowResolution = {
  feeRowId: string;
  applicable: boolean;
  reference: {
    state: Current2026ReferenceConfidence | "NOT_APPLICABLE";
    matchedRecordIds: string[];
    values: GovernedCurrent2026ReferenceRecord["values"];
    historicalValues: GovernedCurrent2026ReferenceRecord["priorValues"];
    effectiveFrom: string | null;
    evidenceRefs: string[];
    conflicts: string[];
    rowCurrencyEstablished: boolean;
    pageLevelCurrencyInferenceAllowed: false;
    sourceCountVotingAllowed: false;
    officialNetworkParEstablished: false;
    merchantPricingVerdictEstablished: false;
  };
  currentReferenceMaintenance: {
    state: Current2026ReferenceConfidence | "NOT_APPLICABLE";
    matchedRecordIds: string[];
    candidateValues: GovernedCurrent2026ReferenceRecord["candidateValues"];
    rejectedCandidates: GovernedCurrent2026ReferenceRecord["rejectedCandidates"];
    evidenceRefs: string[];
    conflicts: string[];
    retainedSeparatelyFromHistoricalConclusion: true;
  };
  historicalApplication:
    | "DATED_CHANGE_APPLIES_TO_STATEMENT_PERIOD"
    | "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE"
    | "CURRENT_REFERENCE_ONLY_NOT_APPLIED_TO_HISTORICAL_STATEMENT"
    | "CURRENT_REFERENCE_APPLIES_TO_CURRENT_STATEMENT"
    | "CURRENT_RATE_UNRESOLVED"
    | "NOT_APPLICABLE";
  currentMechanicOrPopulation: string | null;
  lineToFeeCardinality: {
    state: LineToFeeCardinalityState;
    confidence: "STRONG" | "LIKELY" | "UNRESOLVED";
    comparisonAllowed: boolean;
    evidenceRefs: string[];
    explanation: string;
  };
  merchantComparisonPermitted: boolean;
  research: { priority: "high" | "normal" | "none"; question: string | null; reasonCodes: string[] };
  locationCase: Current2026LocationCaseResolution | null;
  matchedRuleRefs: string[];
  limitations: string[];
};

export type GovernedCurrent2026UsCoreNetworkResolution = {
  catalogVersion: typeof GOVERNED_CURRENT_2026_US_CORE_NETWORK_REFERENCE_V1;
  sources: GovernedCurrent2026Source[];
  records: GovernedCurrent2026ReferenceRecord[];
  rules: GovernedCurrent2026Rule[];
  rowsByFeeRowId: Readonly<Record<string, GovernedCurrent2026RowResolution>>;
  diagnostics: {
    applicableRows: number;
    confirmedChangeRows: number;
    workingStrongRows: number;
    workingLikelyRows: number;
    unresolvedRows: number;
    historicalValuesPreservedRows: number;
    locationCasesIndependentlyEvaluated: number;
    confirmedNetworkParRows: 0;
    merchantPricingVerdictsFromReferenceRows: 0;
  };
  maintenancePolicy: {
    cadence: "at_least_quarterly";
    immediateReviewTriggers: readonly ["known_card_brand_release", "new_statement_reference_conflict"];
    requiresBulletinAndLevelSources: true;
    immutableEvidence: true;
    correctionMethod: "new_adjudication_layer";
    reviewedAt: "2026-09-07";
    reviewDueBy: "2026-12-07";
  };
  canonicalMutationAllowed: false;
  limitations: string[];
};

export type CurrentEvidenceCandidate = {
  candidateId: string;
  value: number | string;
  datedChangePeriodMatched: boolean;
  rowSpecificCurrentEvidence: boolean;
  sourceQuality: 1 | 2 | 3 | 4;
  independentlyCorroborated: boolean;
  sourceCount: number;
  staleOrConflicting: boolean;
};

const PRODUCT_PACK = "RateReveal_Current_2026_US_Core_Network_Reference_FINAL_Product_Adjudicated.md";
const PRODUCT_PACK_SHA256 = "c56f815e911d6955d0a006e9ccfd24d56c4b4bbb071450489e3e7a7b6c86eecd";
const PRODUCT_REQUEST_SHA256 = "d67c339f15a046da7aa8b3b1d166ceeecc2e4e01f9d039bbaaecbfb1b6048f08";
const CONFLICT_ADJUDICATION_PACK = "RateReveal_Governed_Conflict_Adjudication_FINAL_Product_Adjudicated.md";
const CONFLICT_ADJUDICATION_SHA256 = "f457a284011d031820c8a8b099e26220bf9171149f3595e1c56ae4419c2d483d";
const CURRENT_REFERENCE_MAINTENANCE_AS_OF = "2026-09-09";

const SOURCES: GovernedCurrent2026Source[] = [
  {
    sourceId: "rr_product_governed_conflict_adjudication_final",
    title: "RateReveal Governed Conflict Adjudication — Final Product-Adjudicated Version",
    publisher: "RateReveal Product/domain review",
    sourceClass: "G1_product_domain_adjudication",
    publicationDate: "2026-09-09",
    retainedThrough: CONFLICT_ADJUDICATION_PACK,
    retainedPackageFingerprint: CONFLICT_ADJUDICATION_SHA256,
    immutable: true,
    rowClaims: [
      { claimId: "historical_current_firewall", assertion: "Current-reference uncertainty cannot reopen a period-matched historical conclusion.", currencyState: "row_specific_current", effectiveFrom: "2026-09-09" },
      { claimId: "mastercard_2024_assessment", assertion: "The September 2024 0.1475% row is strongly explained by 0.14% ABVF plus a plausible 0.0075% license component; markup is not required but a small acquiring-side uplift is not excluded.", currencyState: "historical", effectiveFrom: "2024-04-05" },
      { claimId: "discover_auth_current", assertion: "Post-April-17-2021 Discover Network Authorization is $0.0190; $0.025 is an unsupported candidate of unresolved origin.", currencyState: "dated_current_change", effectiveFrom: "2021-04-17" },
      { claimId: "visa_base_ii_identity", assertion: "Base II System File Transmission and Transmission are one fee family; Base II Network Access is a separate family.", currencyState: "row_specific_current", effectiveFrom: "2025-01-01" },
      { claimId: "mastercard_location_projection_cleanup", assertion: "Canonical excluded MCCs 8398 and 8661 control; immutable raw 8393 and 8938 assertions do not surface as current governed conflicts.", currencyState: "row_specific_current", effectiveFrom: "2026-09-09" },
    ],
    limitations: ["The adjudication does not establish universal network par, processor retention, or the exact current 2026 Base II Transmission transition."],
  },
  {
    sourceId: "rr_product_current_2026_us_core_network_final",
    title: "RateReveal Current 2026 U.S. Core Network Reference — Final Product-Adjudicated Version",
    publisher: "RateReveal Product/domain review",
    sourceClass: "G1_product_domain_adjudication",
    publicationDate: "2026-09-07",
    retainedThrough: PRODUCT_PACK,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    immutable: true,
    rowClaims: [
      { claimId: "product_current_reference_decisions", assertion: "Admit only Product-approved row-level current claims and confidence states.", currencyState: "row_specific_current", effectiveFrom: "2026-09-07" },
    ],
    limitations: ["Product adjudication governs admission; underlying public sources retain their own evidence classes."],
  },
  {
    sourceId: "fiserv_2026_card_brand_updates",
    title: "Fiserv 2026 Card Brand Updates",
    publisher: "Fiserv",
    sourceClass: "E4_processor_or_acquirer",
    publicationDate: "2026-06",
    retainedThrough: PRODUCT_PACK,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    immutable: true,
    rowClaims: [
      { claimId: "visa_dcsf_2026_06", assertion: "Foreign-card U.S. CNP DCSF changed to 0.035% with $0.01 minimum.", currencyState: "dated_current_change", effectiveFrom: "2026-06-01" },
      { claimId: "mc_dispute_image_2026_07", assertion: "Dispute Image Fee changed to $0.23.", currencyState: "dated_current_change", effectiveFrom: "2026-07-01" },
      { claimId: "mc_dispute_case_2026_07", assertion: "Dispute Case Fee changed to $1.55.", currencyState: "dated_current_change", effectiveFrom: "2026-07-01" },
      { claimId: "mc_fallback_2026", assertion: "Fallback Avoidance is 0.10%; April/June wording remains ambiguous.", currencyState: "dated_current_change", effectiveFrom: null },
      { claimId: "mc_mchip_2026_08", assertion: "M/Chip Deployment Performance is $12 per terminal per recurring 30-day period.", currencyState: "dated_current_change", effectiveFrom: "2026-08-01" },
    ],
    limitations: ["This change bulletin does not establish unlisted core rate levels by silence.", "Fallback effective-date wording remains ambiguous."],
  },
  {
    sourceId: "maintained_public_2026_reference_set",
    title: "Maintained public processor, acquiring, merchant-document, and industry reference set",
    publisher: "Multiple retained publishers",
    sourceClass: "E7_public_industry_reference",
    publicationDate: "2026",
    retainedThrough: PRODUCT_PACK,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    immutable: true,
    rowClaims: [
      { claimId: "mastercard_location_current", assertion: "Mastercard Location Fee is $1.25 with the governed qualifying-location exclusions.", currencyState: "row_specific_current", effectiveFrom: null },
      { claimId: "mastercard_assessment_stale_conflict", assertion: "One current page repeats 0.13% ABVF despite the dated 2024 increase.", currencyState: "stale_or_conflicting", effectiveFrom: null },
      { claimId: "visa_misuse_stale_copies", assertion: "Multiple current-looking sources still repeat the historical $0.09 Visa Misuse value.", currencyState: "stale_or_conflicting", effectiveFrom: null },
      { claimId: "visa_base_ii_conflict", assertion: "Sources conflict between $0.0025 System File/Transmission and $0.0027 Transmission plus $0.0025 Network Access.", currencyState: "stale_or_conflicting", effectiveFrom: "2025-01-01" },
    ],
    limitations: ["Currency is established per row; this source record deliberately contains both current and stale/conflicting claims."],
  },
  {
    sourceId: "dated_2024_2025_processor_change_set",
    title: "Retained dated processor/platform change sources, 2024–2025",
    publisher: "Multiple retained processor/platform publishers",
    sourceClass: "E4_processor_or_acquirer",
    publicationDate: "2025",
    retainedThrough: PRODUCT_PACK,
    retainedPackageFingerprint: PRODUCT_PACK_SHA256,
    immutable: true,
    rowClaims: [
      { claimId: "mc_non_us_nabu_2024_04_15", assertion: "Non-U.S. NABU is $0.0295 for the supported scope.", currencyState: "dated_current_change", effectiveFrom: "2024-04-15" },
      { claimId: "visa_misuse_2025_01", assertion: "Visa Misuse increased from $0.09 to $0.15.", currencyState: "dated_current_change", effectiveFrom: "2025-01-01" },
      { claimId: "visa_dcsf_population_2025_01", assertion: "Visa DCSF moved from clearing/settlement activity to authorization activity.", currencyState: "dated_current_change", effectiveFrom: "2025-01-01" },
      { claimId: "mc_digital_no_cap_2025_10", assertion: "Mastercard Digital Enablement maximum cap was removed.", currencyState: "dated_current_change", effectiveFrom: "2025-10-01" },
      { claimId: "mc_credential_continuity_2025_04", assertion: "Mastercard Credential Continuity changed to $0.09.", currencyState: "dated_current_change", effectiveFrom: "2025-04-01" },
      { claimId: "mc_tpe_excessive_auth_2025_01", assertion: "Mastercard TPE Excessive Authorization changed to $0.50.", currencyState: "dated_current_change", effectiveFrom: "2025-01-01" },
    ],
    limitations: ["Each row retains its own effective date and scope."],
  },
];

const RECORDS: GovernedCurrent2026ReferenceRecord[] = [
  change("CUR26-CHG-VISA-MISUSE", "Visa", "visa_misuse_of_authorization", ["VISA.*MISUSE"], ["visa_misuse_of_authorization"], "2025-01-01", [v("event", 0.15, "usd_per_event", "applicable Misuse event")], [pv(0.09, "usd_per_event", "2024-12-31")], ["dated_2024_2025_processor_change_set#visa_misuse_2025_01"], ["Exact clearing/reversal windows remain separately versioned."]),
  { ...change("CUR26-CHG-VISA-DCSF-POP", "Visa", "visa_digital_commerce_service_fee_population", ["(?:VISA|VI).*DIGITAL COMMERCE (?:SVC|SVCS|SERVICE)"], ["visa_digital_commerce_service_fee"], "2025-01-01", [v("population", "authorization activity", "population", "applicable DCSF activity")], [pv("clearing/settlement activity", "population", "2024-12-31")], ["dated_2024_2025_processor_change_set#visa_dcsf_population_2025_01"]), excludePatterns: ["TOKEN"] },
  { ...change("CUR26-CHG-VISA-DCSF-RATE", "Visa", "visa_foreign_card_us_cnp_dcsf", ["(?:VISA|VI).*DIGITAL COMMERCE (?:SVC|SVCS|SERVICE)"], ["visa_digital_commerce_service_fee"], "2026-06-01", [v("ad_valorem", 0.00035, "decimal_rate", "foreign-card U.S. CNP"), v("minimum", 0.01, "usd_per_event", "minimum")], [pv(0.000075, "decimal_rate", "2026-05-31"), pv(0.0075, "usd_per_event", "2026-05-31")], ["fiserv_2026_card_brand_updates#visa_dcsf_2026_06"]), excludePatterns: ["TOKEN"], limitations: ["June 2026 token fees are separate charges and are not included in this foreign-card DCSF record."] },
  record("CUR26-CHG-MC-NABU-NON-US", "dated_current_change", "Mastercard", "mastercard_nabu_non_us_issuer", ["(?:MASTERCARD|MC).*NTWK ACCESS AUTH FEE NONUS", "(?:MASTERCARD|MC).*NABU.*NON.?US"], ["mastercard_network_access_and_brand_usage_non_us_issuer"], "CURRENT_WORKING_REFERENCE_STRONG", [v("event", 0.0295, "usd_per_event", "U.S. merchant / non-U.S. issuer")], [], "2024-04-15", ["dated_2024_2025_processor_change_set#mc_non_us_nabu_2024_04_15"], []),
  change("CUR26-CHG-MC-DIGITAL-NO-CAP", "Mastercard", "mastercard_digital_enablement_no_maximum", ["(?:MASTERCARD|MC).*DIGITAL ENABLEMENT"], ["mastercard_digital_enablement_fee"], "2025-10-01", [v("ad_valorem", 0.0002, "decimal_rate", "applicable CNP transaction"), v("minimum", 0.02, "usd_per_event", "minimum"), v("maximum", "none", "no_maximum_cap", "maximum cap removed")], [pv(0.20, "usd_per_event", "2025-09-30")], ["dated_2024_2025_processor_change_set#mc_digital_no_cap_2025_10"]),
  change("CUR26-CHG-MC-CREDENTIAL-CONTINUITY", "Mastercard", "mastercard_credential_continuity", ["(?:MASTERCARD|MC).*CREDENTIAL CONTINUITY"], [], "2025-04-01", [v("event", 0.09, "usd_per_event", "applicable event")], [], ["dated_2024_2025_processor_change_set#mc_credential_continuity_2025_04"]),
  change("CUR26-CHG-MC-TPE-EXCESSIVE-AUTH", "Mastercard", "mastercard_tpe_excessive_authorization", ["(?:MASTERCARD|MC).*(?:TPE.*EXCESSIVE|EXCESSIVE AUTH)"], [], "2025-01-01", [v("event", 0.50, "usd_per_event", "applicable excessive-authorization event")], [], ["dated_2024_2025_processor_change_set#mc_tpe_excessive_auth_2025_01"], ["Exact trigger construction remains separately scoped."]),
  change("CUR26-CHG-MC-DISPUTE-IMAGE", "Mastercard", "mastercard_dispute_image_fee", ["(?:MASTERCARD|MC).*DISPUTE IMAGE"], ["mastercard_dispute_image_fee"], "2026-07-01", [v("event", 0.23, "usd_per_event", "dispute image")], [pv(0.20, "usd_per_event", "2026-06-30")], ["fiserv_2026_card_brand_updates#mc_dispute_image_2026_07"]),
  change("CUR26-CHG-MC-DISPUTE-CASE", "Mastercard", "mastercard_dispute_case_fee", ["(?:MASTERCARD|MC).*DISPUTE CASE"], ["mastercard_dispute_case_fee"], "2026-07-01", [v("event", 1.55, "usd_per_event", "dispute case")], [pv(1.35, "usd_per_event", "2026-06-30")], ["fiserv_2026_card_brand_updates#mc_dispute_case_2026_07"]),
  change("CUR26-CHG-MC-FALLBACK", "Mastercard", "mastercard_fallback_avoidance_fee", ["(?:MASTERCARD|MC).*FALLBACK AVOIDANCE"], ["mastercard_fallback_avoidance_fee"], null, [v("ad_valorem", 0.001, "decimal_rate", "applicable fallback transaction")], [], ["fiserv_2026_card_brand_updates#mc_fallback_2026"], ["Fiserv's April/June 2026 date wording is preserved; no single exact effective date is invented."]),
  change("CUR26-CHG-MC-MCHIP", "Mastercard", "mastercard_mchip_deployment_performance", ["(?:MASTERCARD|MC).*M.?CHIP.*DEPLOYMENT"], ["mastercard_mchip_deployment_performance_program_fee"], "2026-08-01", [v("terminal", 12, "usd_per_terminal_30_days", "terminal / recurring 30-day period")], [], ["fiserv_2026_card_brand_updates#mc_mchip_2026_08"]),
  { ...change("CUR26-CHG-DISCOVER-NETWORK-AUTH", "Discover", "discover_network_authorization_fee", ["(?:DISCOVER|DCVR).*NETWORK AUTH"], ["discover_network_authorization_fee"], "2021-04-17", [v("authorization", 0.019, "usd_per_event", "post-April-17-2021 network authorization")], [pv(0.0025, "usd_per_event", "2021-04-16")], ["rr_product_governed_conflict_adjudication_final#discover_auth_current"]), rejectedCandidates: [{ value: 0.025, unit: "usd_per_event", disposition: "unsupported_stale_or_error_candidate", origin: "unresolved" }] },
  change("CUR26-CHG-VISA-BASE-II-TRANSMISSION", "Visa", "visa_base_ii_system_file_transmission_fee", ["(?:VISA|VI).*BASE ?II(?: SYSTEM FILE)?(?: TRANSMISSION)?(?: FEE)?$"], ["visa_base_ii_system_file_fee", "visa_base_ii_system_file_transmission_fee", "visa_base_ii_transmission_fee"], "2025-01-01", [v("transmission", 0.0025, "usd_per_event", "January 2025 Transmission reference")], [pv(0.0018, "usd_per_event", "2024-12-31")], ["rr_product_governed_conflict_adjudication_final#visa_base_ii_identity"]),

  working("CUR26-WRK-VISA-APF", "Visa", "visa_domestic_acquirer_processing_fee", ["(?:VISA|VI).*(?:ACQUIRER PROCESSING|CR VCHER FEE US D/P|APF)"], ["visa_acquirer_processing_fee"], [v("credit", 0.0195, "usd_per_event", "U.S. credit"), v("debit_prepaid", 0.0155, "usd_per_event", "U.S. debit/prepaid")]),
  working("CUR26-WRK-VISA-ASSESSMENT", "Visa", "visa_domestic_assessment", ["VISA.*ASSESSMENT"], ["visa_assessment_credit", "visa_assessment_debit"], [v("credit", 0.0014, "decimal_rate", "credit"), v("debit_prepaid", 0.0013, "decimal_rate", "debit/prepaid")]),
  working("CUR26-WRK-VISA-TIF", "Visa", "visa_transaction_integrity_fee", ["(?:VISA|VI).*TRANSACTION INTEGRITY"], ["visa_transaction_integrity_fee"], [v("event", 0.10, "usd_per_event", "supported product/trigger scope")]),
  working("CUR26-WRK-VISA-ZERO-FLOOR", "Visa", "visa_zero_floor_limit", ["(?:VISA|VI).*ZERO FLOOR"], ["visa_zero_floor_limit"], [v("event", 0.20, "usd_per_event", "qualifying event")]),
  working("CUR26-WRK-VISA-ISA-IAF", "Visa", "visa_international_assessment_family", ["(?:VISA|VI).*(?:INTERNATIONAL SERVICE|INTERNATIONAL ACQUIRER|ISA|IAF)"], ["visa_international_service_assessment", "visa_international_acquirer_fee"], [v("isa_usd", 0.01, "decimal_rate", "ISA, USD settlement"), v("isa_non_usd", 0.014, "decimal_rate", "ISA, non-USD settlement"), v("iaf", 0.0045, "decimal_rate", "IAF base"), v("iaf_high_risk", 0.009, "decimal_rate", "supported high-risk MCC scope")]),
  working("CUR26-WRK-MC-NABU-US", "Mastercard", "mastercard_nabu_domestic", ["(?:MASTERCARD|MC).*NABU(?!.*NON.?US)"], ["mastercard_network_access_and_brand_usage"], [v("event", 0.0195, "usd_per_event", "supported domestic scope")]),
  working("CUR26-WRK-MC-LOCATION", "Mastercard", "mastercard_location_fee", ["(?:MASTERCARD|MC).*(?:MONTHLY )?LOCATION FEE"], ["mastercard_location_fee"], [v("location_month", 1.25, "usd_per_location_month", "qualifying location/month; under-$200, MCC 8398, and MCC 8661 exclusions")]),
  working("CUR26-WRK-MC-GLOBAL-CROSS-BORDER", "Mastercard", "mastercard_global_acquirer_cross_border", ["(?:MASTERCARD|MC).*(?:GLOBAL ACQUIRER|ACQ SUPPORT|CROSS.?BORDER)|US CROSS BORDER"], ["mastercard_global_acquirer_support_fee", "mastercard_cross_border_fee"], [v("global_acquirer", 0.0085, "decimal_rate", "Global Acquirer Support"), v("cross_border_usd", 0.006, "decimal_rate", "cross-border USD settlement"), v("cross_border_non_usd", 0.01, "decimal_rate", "cross-border non-USD settlement")]),
  working("CUR26-WRK-DISCOVER-ASSESSMENT", "Discover", "discover_assessment", ["(?:DISCOVER|DCVR).*?(?:ASSESSMENT|DUES & ASSESSMENTS)"], ["discover_assessment"], [v("assessment", 0.0014, "decimal_rate", "supported U.S. acquiring scope")]),
  { ...working("CUR26-WRK-VISA-BASE-II-NETWORK-ACCESS", "Visa", "visa_base_ii_network_access_fee", ["(?:VISA|VI).*BASE ?II NETWORK ACCESS"], ["visa_base_ii_network_access_fee"], [v("network_access", 0.0025, "usd_per_event", "separate Base II Network Access fee where applicable")]), sourceRefs: ["rr_product_governed_conflict_adjudication_final#visa_base_ii_identity"] },
  working("CUR26-WRK-AMEX-OPTBLUE-ASSESSMENT", "American Express", "amex_optblue_assessment", ["(?:AMEX|AMERICAN EXPRESS).*ASSESSMENT"], ["american_express_general_assessment"], [v("assessment", 0.00165, "decimal_rate", "acquired/OptBlue context")]),

  unresolved("CUR26-UNR-MC-ASSESSMENT", "Mastercard", "mastercard_assessment_2026", ["(?:MASTERCARD|MC).*(?:ASSESSMENT|DUES & ASSESSMENTS)"], ["mastercard_assessment"], [cv(0.0013, "decimal_rate"), cv(0.001375, "decimal_rate"), cv(0.0014, "decimal_rate"), cv(0.001475, "decimal_rate")], ["Known April 2024 increase conflicts with a current table carrying the old base value."]),
  unresolved("CUR26-UNR-VISA-BASE-II-TRANSMISSION", "Visa", "visa_base_ii_system_file_transmission_fee_2026", ["(?:VISA|VI).*BASE ?II(?: SYSTEM FILE)?(?: TRANSMISSION)?(?: FEE)?$"], ["visa_base_ii_system_file_fee", "visa_base_ii_system_file_transmission_fee", "visa_base_ii_transmission_fee"], [cv(0.0025, "usd_per_event"), cv(0.0027, "usd_per_event")], ["The exact current 2026 Base II Transmission value and effective transition remain unresolved."], "2026-01-01"),
  unresolved("CUR26-UNR-VISA-FANF", "Visa", "visa_fanf_tier_values", ["VISA.*(?:FIXED ACQUIRER NETWORK|FANF)"], ["visa_fixed_acquirer_network_fee"], [], ["Mechanic is usable; current tier values are not admitted."]),
  unresolved("CUR26-UNR-MC-CONNECTIVITY", "Mastercard", "mastercard_connectivity_kilobyte_value", ["(?:MASTERCARD|MC).*?(?:CONNECTIVITY|KILOBYTE)"], ["mastercard_connectivity_kilobyte_fee"], [cv(0.002294, "usd_per_kilobyte"), cv(0.0035, "usd_per_kilobyte")], ["Current kilobyte value conflicts across sources."]),
  unresolved("CUR26-UNR-AMEX-INTERNATIONAL", "American Express", "amex_international_cross_border_value", ["(?:AMEX|AMERICAN EXPRESS).*(?:INTERNATIONAL|CROSS.?BORDER)"], [], [cv(0.01, "decimal_rate"), cv(0.006, "decimal_rate")], ["Conflicting 1.00% and 0.60% descriptions remain unresolved."]),
  unresolved("CUR26-UNR-MC-AUTH-INTEGRITY", "Mastercard", "mastercard_pre_final_auth_integrity_values", ["(?:MASTERCARD|MC).*(?:PRE.?AUTH|FINAL AUTH).*INTEGRITY"], ["mastercard_pre_authorization_processing_integrity", "mastercard_final_authorization_processing_integrity"], [], ["2023 mechanics may remain supported; current values are unresolved."]),
];

const RULES: GovernedCurrent2026Rule[] = [
  rule("CUR-26-01", "Row-level currency", "Currency is decided per fee claim/row; a page may contain both current and stale values.", ["page_level_current_flag_authorizes_all_rows"]),
  rule("CUR-26-02", "Contemporaneity outranks stale consensus", "Period-matched dated changes and row-specific currency evidence outrank stale source-count consensus.", ["majority_source_vote_overrides_dated_change"]),
  conflictRule("CUR-26-03", "Historical/current firewall", "A current-reference uncertainty is retained separately and cannot reopen a historical statement conclusion supported by period-matched evidence.", ["current_uncertainty_reopens_historical_conclusion", "current_reference_silently_overwrites_historical_adjudication"]),
  conflictRule("CUR-26-04", "Related-fee source vintage", "When related fees change together, undated agreement may show shared source vintage rather than present applicability.", ["undated_related_fee_agreement_proves_current_applicability"]),
  conflictRule("CUR-26-05", "Identity and cardinality before rate", "Name variants may establish a fee family, but matching values cannot merge separate fee identities and one printed line may represent one fee, multiple components, one component, or unresolved composition.", ["matching_rate_establishes_identity", "base_ii_transmission_equals_network_access", "one_line_always_equals_one_fee"]),
];

export function governedCurrent2026SourcesV1(): GovernedCurrent2026Source[] { return structuredClone(SOURCES); }
export function governedCurrent2026ReferenceRecordsV1(): GovernedCurrent2026ReferenceRecord[] { return structuredClone(RECORDS); }
export function governedCurrent2026RulesV1(): GovernedCurrent2026Rule[] { return structuredClone(RULES); }

export function adjudicateCurrentEvidenceCandidates(candidates: CurrentEvidenceCandidate[]): CurrentEvidenceCandidate | null {
  const usable = candidates.filter((item) => !item.staleOrConflicting);
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => evidenceWeight(b) - evidenceWeight(a) || a.candidateId.localeCompare(b.candidateId))[0]!;
}

export function resolveCurrentReferenceForClaim(input: { label: string; identity?: string | null; asOf: string }): {
  records: GovernedCurrent2026ReferenceRecord[];
  effectiveValues: GovernedCurrent2026ReferenceRecord["values"];
  historicalValues: GovernedCurrent2026ReferenceRecord["priorValues"];
  state: Current2026ReferenceConfidence | "NOT_APPLICABLE";
} {
  const matches = matchRecords(input.label, input.identity ?? null);
  if (matches.length === 0) return { records: [], effectiveValues: [], historicalValues: [], state: "NOT_APPLICABLE" };
  const active = matches.filter((item) => input.asOf >= item.referenceApplicabilityFrom);
  const historicalValues = matches.flatMap((item) => item.priorValues.filter((value) => !value.effectiveThrough || input.asOf <= value.effectiveThrough));
  if (active.length === 0) {
    const historicalRecords = matches.filter((item) => item.priorValues.some((value) => !value.effectiveThrough || input.asOf <= value.effectiveThrough));
    return {
      records: structuredClone(historicalRecords),
      effectiveValues: [],
      historicalValues: structuredClone(historicalValues),
      state: historicalValues.length > 0 ? "CURRENT_CONFIRMED_CHANGE" : "NOT_APPLICABLE",
    };
  }
  const unresolvedRecord = active.find((item) => item.confidence === "CURRENT_RATE_UNRESOLVED");
  if (unresolvedRecord) return { records: structuredClone(active), effectiveValues: [], historicalValues: structuredClone(historicalValues), state: "CURRENT_RATE_UNRESOLVED" };
  const dated = active.filter((item) => item.kind === "dated_current_change");
  const chosen = dated.length > 0 ? dated : active.filter((item) => item.kind === "current_working_reference");
  if (chosen.length === 0 && historicalValues.length > 0) {
    return { records: structuredClone(active), effectiveValues: [], historicalValues: structuredClone(historicalValues), state: "CURRENT_CONFIRMED_CHANGE" };
  }
  const state = chosen.some((item) => item.confidence === "CURRENT_CONFIRMED_CHANGE")
    ? "CURRENT_CONFIRMED_CHANGE"
    : chosen.some((item) => item.confidence === "CURRENT_WORKING_REFERENCE_STRONG")
      ? "CURRENT_WORKING_REFERENCE_STRONG"
      : "CURRENT_WORKING_REFERENCE_LIKELY";
  return { records: structuredClone(active), effectiveValues: chosen.flatMap((item) => structuredClone(item.values)), historicalValues: structuredClone(historicalValues), state };
}

export function resolveGovernedCurrent2026UsCoreNetworkReferenceV1(input: {
  analysis: CanonicalStatementAnalysis;
  usNetworkRowsByFeeRowId: Readonly<Record<string, GovernedUsNetworkRowResolution>>;
  mastercardFocusedRowsByFeeRowId: Readonly<Record<string, GovernedMastercardFocusedRowResolution>>;
  asOf: string;
}): GovernedCurrent2026UsCoreNetworkResolution {
  const rows = input.analysis.feeLedger.rows.map((row) => resolveRow(input.analysis, row, input.usNetworkRowsByFeeRowId[row.id]!, input.mastercardFocusedRowsByFeeRowId[row.id]!, input.asOf));
  return deepFreeze({
    catalogVersion: GOVERNED_CURRENT_2026_US_CORE_NETWORK_REFERENCE_V1,
    sources: governedCurrent2026SourcesV1(), records: governedCurrent2026ReferenceRecordsV1(), rules: governedCurrent2026RulesV1(),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    diagnostics: {
      applicableRows: rows.filter((row) => row.applicable).length,
      confirmedChangeRows: rows.filter((row) => row.reference.state === "CURRENT_CONFIRMED_CHANGE").length,
      workingStrongRows: rows.filter((row) => row.reference.state === "CURRENT_WORKING_REFERENCE_STRONG").length,
      workingLikelyRows: rows.filter((row) => row.reference.state === "CURRENT_WORKING_REFERENCE_LIKELY").length,
      unresolvedRows: rows.filter((row) => row.currentReferenceMaintenance.state === "CURRENT_RATE_UNRESOLVED").length,
      historicalValuesPreservedRows: rows.filter((row) => row.historicalApplication === "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE").length,
      locationCasesIndependentlyEvaluated: rows.filter((row) => row.locationCase).length,
      confirmedNetworkParRows: 0, merchantPricingVerdictsFromReferenceRows: 0,
    },
    maintenancePolicy: { cadence: "at_least_quarterly", immediateReviewTriggers: ["known_card_brand_release", "new_statement_reference_conflict"], requiresBulletinAndLevelSources: true, immutableEvidence: true, correctionMethod: "new_adjudication_layer", reviewedAt: "2026-09-07", reviewDueBy: "2026-12-07" },
    canonicalMutationAllowed: false,
    limitations: ["Current-reference confidence is not a merchant pricing verdict, official network par, or proof of at-par pass-through.", "The Gold corpus ends in 2025; current-2026 coverage is attached for forward use while each historical row keeps its period-specific analysis."],
  });
}

export function governedCurrent2026FingerprintV1(): string { return createHash("sha256").update(JSON.stringify({ catalogVersion: GOVERNED_CURRENT_2026_US_CORE_NETWORK_REFERENCE_V1, sources: SOURCES, records: RECORDS, rules: RULES })).digest("hex"); }

function resolveRow(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow, base: GovernedUsNetworkRowResolution, focused: GovernedMastercardFocusedRowResolution, asOf: string): GovernedCurrent2026RowResolution {
  const periodEnd = analysis.identity.statementPeriod.value?.end ?? asOf;
  const statementClaim = resolveCurrentReferenceForClaim({ label: row.selectedLabel, identity: base.identity.value, asOf: periodEnd });
  const maintenanceClaim = resolveCurrentReferenceForClaim({ label: row.selectedLabel, identity: base.identity.value, asOf: CURRENT_REFERENCE_MAINTENANCE_AS_OF });
  if (statementClaim.records.length === 0 && maintenanceClaim.records.length === 0) return notApplicable(row.id);
  const records = statementClaim.state === "NOT_APPLICABLE" ? [] : statementClaim.records;
  const maintenanceRecords = maintenanceClaim.records;
  const effectiveFrom = records.filter((item) => item.kind === "dated_current_change").map((item) => item.effectiveFrom).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null;
  const changeRecords = records.filter((item) => item.kind === "dated_current_change");
  const beforeChangeWithHistoricalValue = statementClaim.historicalValues.length > 0 && changeRecords.some((item) => item.effectiveFrom && periodEnd < item.effectiveFrom);
  const changeApplies = changeRecords.some((item) => item.effectiveFrom && periodEnd >= item.effectiveFrom);
  const historicalApplication = statementClaim.state === "CURRENT_RATE_UNRESOLVED"
    ? "CURRENT_RATE_UNRESOLVED" as const
    : beforeChangeWithHistoricalValue
      ? "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE" as const
      : changeApplies
        ? "DATED_CHANGE_APPLIES_TO_STATEMENT_PERIOD" as const
        : periodEnd >= "2026-01-01" && statementClaim.state !== "NOT_APPLICABLE"
          ? "CURRENT_REFERENCE_APPLIES_TO_CURRENT_STATEMENT" as const
          : "CURRENT_REFERENCE_ONLY_NOT_APPLIED_TO_HISTORICAL_STATEMENT" as const;
  const locationCase = resolveLocationCase(analysis, row, focused);
  const currentMechanicOrPopulation = maintenanceRecords.find((item) => item.recordId === "CUR26-CHG-VISA-DCSF-POP")?.values[0]?.value.toString() ??
    (maintenanceRecords.find((item) => item.recordId === "CUR26-CHG-MC-DIGITAL-NO-CAP") ? "0.02% with $0.02 minimum and no maximum cap from October 2025" : null);
  const unresolvedForStatement = statementClaim.state === "CURRENT_RATE_UNRESOLVED";
  const merchantComparisonPermitted = periodEnd >= "2026-01-01" && !unresolvedForStatement && statementClaim.effectiveValues.length > 0;
  const lineToFeeCardinality = resolveCurrentCardinality(row, base, focused, maintenanceRecords);
  return {
    feeRowId: row.id, applicable: true,
    reference: { state: statementClaim.state, matchedRecordIds: records.map((item) => item.recordId), values: statementClaim.effectiveValues, historicalValues: statementClaim.historicalValues, effectiveFrom, evidenceRefs: [...new Set(records.flatMap((item) => item.sourceRefs))], conflicts: unresolvedForStatement ? records.flatMap((item) => item.conflicts) : [], rowCurrencyEstablished: statementClaim.state !== "NOT_APPLICABLE" && !unresolvedForStatement, pageLevelCurrencyInferenceAllowed: false, sourceCountVotingAllowed: false, officialNetworkParEstablished: false, merchantPricingVerdictEstablished: false },
    currentReferenceMaintenance: { state: maintenanceClaim.state, matchedRecordIds: maintenanceRecords.map((item) => item.recordId), candidateValues: maintenanceRecords.flatMap((item) => item.candidateValues), rejectedCandidates: maintenanceRecords.flatMap((item) => item.rejectedCandidates), evidenceRefs: [...new Set(maintenanceRecords.flatMap((item) => item.sourceRefs))], conflicts: maintenanceRecords.flatMap((item) => item.conflicts), retainedSeparatelyFromHistoricalConclusion: true },
    historicalApplication, currentMechanicOrPopulation, lineToFeeCardinality, merchantComparisonPermitted,
    research: unresolvedForStatement ? { priority: "high", question: `Resolve the statement-period identity/value conflict for ${row.selectedLabel} using row-specific dated evidence; do not use page currency or source-count voting.`, reasonCodes: ["statement_period_rate_unresolved"] } : { priority: "none", question: null, reasonCodes: [] },
    locationCase, matchedRuleRefs: ["CUR-26-01", "CUR-26-02", "CUR-26-03", "CUR-26-04", "CUR-26-05"],
    limitations: [...new Set([...records, ...maintenanceRecords].flatMap((item) => [...item.conflicts, ...item.limitations]))],
  };
}

function resolveLocationCase(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow, focused: GovernedMastercardFocusedRowResolution): Current2026LocationCaseResolution | null {
  if (!focused.locationFee2025 || normalize(row.selectedLabel) !== "MASTERCARD MC LOCATION FEE" || row.sourceOccurrenceIds.length !== 1) return null;
  const statementRef = analysis.identity.sourceDocumentRef;
  const caseId = statementRef === "doc_19a4477fecfb1432" ? "PAYSAFE_LOCATION_CASE_A_2025_10" as const : statementRef === "doc_1d37bac7aeadf39c" ? "PAYSAFE_LOCATION_CASE_B_2025_09" as const : null;
  if (!caseId) return null;
  const inventory = analysis.feeLedger.rows.filter((item) => item.id !== row.id && item.contributesToUniqueTotal && (item.selectedAmount?.amountMinor ?? 0) > 0);
  const expectedPeriod = caseId === "PAYSAFE_LOCATION_CASE_A_2025_10" ? "2025-10" : "2025-09";
  if (!analysis.identity.statementPeriod.value?.end.startsWith(expectedPeriod) || !analysis.identity.processorFamily.value?.includes("Fiserv") || inventory.length < 3) return null;
  return {
    caseId, independentlyEvaluated: true, uniqueSourceOccurrenceVerified: true, exactLabelVerified: true,
    processorProgramEvidence: "Fiserv / First Data statement; Paysafe merchant program label",
    feeInventoryEvidenceRefs: inventory.flatMap((item) => item.sourceOccurrenceIds), missingComponentPossibility: "WEAKENED_NOT_EXCLUDED",
    billedAboveAvailableReference: "STRONG", acquiringSideUplift: "LIKELY", contractualViolation: "UNRESOLVED", excessCommercialController: "UNRESOLVED", excessEconomicBeneficiary: "UNRESOLVED",
    limitations: [caseId === "PAYSAFE_LOCATION_CASE_A_2025_10" ? "A broad separate Mastercard/network/account fee inventory weakens, but does not mathematically exclude, a bundled component." : "This distinct zero-volume statement separately itemizes monthly service, online access, and minimum-discount charges; that independently weakens, but does not exclude, a bundled component in the Location Fee line."],
  };
}

function resolveCurrentCardinality(
  row: CanonicalFeeRow,
  base: GovernedUsNetworkRowResolution,
  focused: GovernedMastercardFocusedRowResolution,
  records: GovernedCurrent2026ReferenceRecord[],
): GovernedCurrent2026RowResolution["lineToFeeCardinality"] {
  const text = normalize(row.selectedLabel);
  if (/BASE II/.test(text)) {
    const transmission = records.some((record) => record.identity.includes("base_ii_system_file_transmission"));
    const networkAccess = records.some((record) => record.identity === "visa_base_ii_network_access_fee");
    if (transmission || networkAccess) return { state: "one_fee_supported", confidence: "STRONG", comparisonAllowed: true, evidenceRefs: ["CUR-26-05", ...records.flatMap((record) => record.sourceRefs)], explanation: transmission ? "System File Transmission and Transmission are supported name variants of one fee family; the separate Base II Network Access family is not merged into this line." : "Base II Network Access is a separate one-fee family and is not merged with Transmission because of similar values." };
    return { state: "unresolved", confidence: "UNRESOLVED", comparisonAllowed: false, evidenceRefs: ["CUR-26-05"], explanation: "The Base II wording is insufficient to decide Transmission versus Network Access or bundled composition." };
  }
  if (focused.applicable) return structuredClone(focused.lineToFeeCardinality);
  if (base.identity.state === "supported") return { state: "one_fee_supported", confidence: "STRONG", comparisonAllowed: true, evidenceRefs: ["CUR-26-05", ...base.identity.evidenceRefs], explanation: "The existing governed identity supports one fee for this row; hidden economic allocation is not inferred." };
  return { state: "unresolved", confidence: "UNRESOLVED", comparisonAllowed: false, evidenceRefs: ["CUR-26-05"], explanation: "Line-to-fee cardinality remains unresolved." };
}

function matchRecords(label: string, identity: string | null): GovernedCurrent2026ReferenceRecord[] {
  const text = normalize(label);
  return RECORDS.filter((record) => !record.excludePatterns.some((pattern) => new RegExp(pattern).test(text)) && (record.matchIdentityValues.includes(identity ?? "") || record.matchPatterns.some((pattern) => new RegExp(pattern).test(text))));
}
function evidenceWeight(item: CurrentEvidenceCandidate): number { return (item.datedChangePeriodMatched ? 1_000_000 : 0) + (item.rowSpecificCurrentEvidence ? 100_000 : 0) + item.sourceQuality * 10_000 + (item.independentlyCorroborated ? 1_000 : 0) + Math.min(item.sourceCount, 999); }
function v(variantId: string, value: number | string, unit: Current2026ReferenceUnit, scope: string) { return { variantId, value, unit, scope }; }
function cv(value: number | string, unit: Current2026ReferenceUnit) { return { value, unit }; }
function pv(value: number | string, unit: Current2026ReferenceUnit, effectiveThrough: string | null) { return { value, unit, effectiveThrough }; }
function change(recordId: string, network: GovernedCurrent2026ReferenceRecord["network"], identity: string, matchPatterns: string[], matchIdentityValues: string[], effectiveFrom: string | null, values: GovernedCurrent2026ReferenceRecord["values"], priorValues: GovernedCurrent2026ReferenceRecord["priorValues"], sourceRefs: string[], conflicts: string[] = []): GovernedCurrent2026ReferenceRecord { return record(recordId, "dated_current_change", network, identity, matchPatterns, matchIdentityValues, "CURRENT_CONFIRMED_CHANGE", values, priorValues, effectiveFrom, sourceRefs, conflicts); }
function working(recordId: string, network: GovernedCurrent2026ReferenceRecord["network"], identity: string, matchPatterns: string[], matchIdentityValues: string[], values: GovernedCurrent2026ReferenceRecord["values"]): GovernedCurrent2026ReferenceRecord { return record(recordId, "current_working_reference", network, identity, matchPatterns, matchIdentityValues, "CURRENT_WORKING_REFERENCE_STRONG", values, [], null, ["rr_product_current_2026_us_core_network_final#stable-working-references"], []); }
function unresolved(recordId: string, network: GovernedCurrent2026ReferenceRecord["network"], identity: string, matchPatterns: string[], matchIdentityValues: string[], candidateValues: GovernedCurrent2026ReferenceRecord["candidateValues"], conflicts: string[], referenceApplicabilityFrom = "2026-01-01"): GovernedCurrent2026ReferenceRecord { return { ...record(recordId, "current_unresolved", network, identity, matchPatterns, matchIdentityValues, "CURRENT_RATE_UNRESOLVED", [], [], null, ["rr_product_current_2026_us_core_network_final#unresolved-values"], conflicts), referenceApplicabilityFrom, candidateValues }; }
function record(recordId: string, kind: GovernedCurrent2026ReferenceRecord["kind"], network: GovernedCurrent2026ReferenceRecord["network"], identity: string, matchPatterns: string[], matchIdentityValues: string[], confidence: Current2026ReferenceConfidence, values: GovernedCurrent2026ReferenceRecord["values"], priorValues: GovernedCurrent2026ReferenceRecord["priorValues"], effectiveFrom: string | null, sourceRefs: string[], conflicts: string[]): GovernedCurrent2026ReferenceRecord { return { recordId, kind, network, identity, matchPatterns, excludePatterns: [], matchIdentityValues, confidence, values, candidateValues: [], rejectedCandidates: [], priorValues, effectiveFrom, referenceApplicabilityFrom: effectiveFrom ?? "2026-01-01", geographyScope: "United States merchant acquiring", productScope: "Record-specific scope in the Product-adjudicated package", sourceRefs, rowCurrencyEvidenceRefs: sourceRefs, conflicts, limitations: [], prohibitedClaims: ["official_network_par_from_public_reference", "merchant_pricing_verdict_from_reference_state"], admissionStatus: "admitted" }; }
function rule(ruleId: GovernedCurrent2026Rule["ruleId"], title: string, admittedClaim: string, prohibitedClaims: string[]): GovernedCurrent2026Rule { return { ruleId, title, admittedClaim, prohibitedClaims, sourceRefs: [PRODUCT_PACK], sourceFingerprints: [PRODUCT_PACK_SHA256, PRODUCT_REQUEST_SHA256], reviewedAt: "2026-09-07", admissionStatus: "admitted" }; }
function conflictRule(ruleId: GovernedCurrent2026Rule["ruleId"], title: string, admittedClaim: string, prohibitedClaims: string[]): GovernedCurrent2026Rule { return { ruleId, title, admittedClaim, prohibitedClaims, sourceRefs: [CONFLICT_ADJUDICATION_PACK], sourceFingerprints: [CONFLICT_ADJUDICATION_SHA256], reviewedAt: "2026-09-09", admissionStatus: "admitted" }; }
function notApplicable(feeRowId: string): GovernedCurrent2026RowResolution { return { feeRowId, applicable: false, reference: { state: "NOT_APPLICABLE", matchedRecordIds: [], values: [], historicalValues: [], effectiveFrom: null, evidenceRefs: [], conflicts: [], rowCurrencyEstablished: false, pageLevelCurrencyInferenceAllowed: false, sourceCountVotingAllowed: false, officialNetworkParEstablished: false, merchantPricingVerdictEstablished: false }, currentReferenceMaintenance: { state: "NOT_APPLICABLE", matchedRecordIds: [], candidateValues: [], rejectedCandidates: [], evidenceRefs: [], conflicts: [], retainedSeparatelyFromHistoricalConclusion: true }, historicalApplication: "NOT_APPLICABLE", currentMechanicOrPopulation: null, lineToFeeCardinality: { state: "unresolved", confidence: "UNRESOLVED", comparisonAllowed: false, evidenceRefs: [], explanation: "No current-reference record applies." }, merchantComparisonPermitted: false, research: { priority: "none", question: null, reasonCodes: [] }, locationCase: null, matchedRuleRefs: [], limitations: [] }; }
function normalize(value: string): string { return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
