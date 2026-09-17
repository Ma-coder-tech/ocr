import { createHash } from "node:crypto";
import type { FeeSemanticsShadowRowResult } from "./feeSemanticsShadowStatementIntegration.js";
import type { GovernedPerItemRowResolution } from "./governedPerItemKnowledgeV1.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";

export const GOVERNED_DATED_NETWORK_FEE_EVIDENCE_V1 =
  "governed_dated_network_fee_evidence_batch3_2026_09_07_v1" as const;

export type GovernedDatedNetworkRule = {
  ruleId: string;
  priority: number;
  title: string;
  scope: "processor_agnostic" | "fiserv_family_statement_analysis";
  lifecycle: "active";
  admittedClaim: string;
  prohibitedClaims: string[];
  dependencies: string[];
  evidenceState:
    | "product_adjudicated_governance"
    | "product_adjudicated_semantics"
    | "product_adjudicated_with_e4_notice_records";
  admissionStatus: "admitted";
  evidenceClass: "G1_product_domain_adjudication";
  sourceRefs: string[];
  sourceFingerprints: string[];
  reviewedAt: "2026-09-07";
  limitations: string[];
};

export type GovernedNetworkFeeFamily =
  | "mastercard_network_access_or_authorization"
  | "visa_acquirer_processing_or_access"
  | "discover_network_authorization"
  | "amex_acquired_program_network_transaction"
  | "visa_transaction_integrity"
  | "visa_misuse"
  | "visa_zero_floor_limit"
  | "discover_program_integrity"
  | "visa_international_acquirer"
  | "visa_international_service_assessment"
  | "mastercard_global_acquirer"
  | "mastercard_cross_border"
  | "network_assessment"
  | "network_merchant_location"
  | "network_fixed_acquirer_network_fee"
  | "network_digital_enablement"
  | "clearing_or_data_record_family"
  | "network_exception_or_integrity_family"
  | "network_authorization_or_access_family";

export type GovernedNetworkNoticeEvent = {
  noticeId: string;
  sourceDocumentRef: string;
  sourceStatementPeriod: { start: string; end: string };
  sourceRef: string;
  sourceFingerprint: string;
  evidenceClass: "E4_processor_or_iso_publication";
  publisherLane: "processor_or_acquirer_statement_notice";
  network: "Visa" | "Mastercard" | "American Express" | "Discover" | "STAR" | "ACCEL";
  family: GovernedNetworkFeeFamily;
  eventType: "announced_rate_change" | "announced_new_fee" | "announced_mechanic_change" | "presentation_only" | "postponed";
  lifecycleState: "announced" | "presentation_only" | "postponed";
  implementationState: "unconfirmed";
  announcedEffectiveFrom: string | null;
  effectiveDatePrecision: "day" | "month" | "unresolved";
  effectiveThrough: null;
  sourceDate: string;
  sourceDateBasis: "statement_period_end_proxy";
  sourceVersion: string;
  reviewStatus: "admitted_as_notice_evidence";
  geographyScope: string;
  productScope: string;
  merchantScope: string;
  mechanic: string;
  announcedValue: {
    oldValue: number | null;
    newValue: number | null;
    unit: "decimal_rate" | "usd_per_event" | "usd_per_year_per_location_or_website" | null;
  } | null;
  announcedValueVariants: Array<{
    scope: string;
    value: number;
    unit: "decimal_rate" | "usd_per_event" | "usd_per_year_per_location_or_website";
  }>;
  announcedClaim: string;
  evidenceExcerpt: string;
  knownExceptions: string[];
  limitations: string[];
};

export type GovernedDatedNetworkRowResolution = {
  feeRowId: string;
  applicable: boolean;
  family: {
    state: "supported" | "category_only" | "unresolved" | "not_applicable";
    value: GovernedNetworkFeeFamily | null;
    network: string | null;
    confidence: "STRONG" | "LIKELY" | "CATEGORY_ONLY" | "UNRESOLVED";
    evidenceRefs: string[];
  };
  mechanic: {
    state: "supported" | "unresolved" | "not_applicable";
    value: string | null;
    confidence: "CONFIRMED" | "STRONG" | "LIKELY" | "UNRESOLVED";
    independentlyVersioned: true;
    continuityClaim: "not_made";
    evidenceRefs: string[];
  };
  billedObservation: {
    evidenceClass: "E1_statement";
    statementRef: string;
    statementPeriod: { start: string; end: string } | null;
    merchantAccountContinuityRef: null;
    label: string;
    amountMinor: number | null;
    printedRate: {
      original: string;
      numericValue: string;
      representation: string;
      kind: "ad_valorem" | "per_item" | "per_source_unit";
    } | null;
    establishesOfficialNetworkPar: false;
    evidenceRefs: string[];
  } | null;
  trigger: {
    state: "directional_category_only" | "unresolved" | "not_applicable";
    value: string | null;
    exactWindowOrThresholdEstablished: false;
    causationOrFaultEstablished: false;
    evidenceRefs: string[];
  };
  priceSeparation: {
    underlyingNetworkPriceSetter: "card_network" | null;
    underlyingNetworkReference: {
      state: "unresolved_no_period_matched_independent_reference" | "not_applicable";
      value: null;
      effectiveFrom: null;
      effectiveThrough: null;
      sourceDateOrVersion: null;
      reviewStatus: "not_admitted";
      evidenceRefs: string[];
    };
    merchantBilledRateOrAmountSource: "E1_statement" | null;
    collector: "processor_or_acquirer" | null;
    underlyingNetworkEconomicBeneficiary: "card_network" | null;
    merchantBilledEconomicBeneficiary: "unresolved" | null;
    merchantFacingPriceController: "unresolved" | null;
    passThroughAtPar: "not_established" | "not_applicable";
    aboveParSpread: "not_assessable" | "not_applicable";
  };
  historicalComparison: {
    state: "blocked_no_period_matched_independent_reference" | "not_applicable";
    announcementEvidenceRefs: string[];
    announcementIsImplementationEvidence: false;
    currentDocumentationMaySupplyHistoricalRate: false;
    crossMerchantObservationMaySupplyMerchantHistory: false;
    unrelatedStatementAbsenceMayProveApplicability: false;
    interpolationAllowed: false;
  };
  actionability: {
    underlyingNetworkPriceNegotiability: "ordinarily_fixed_if_reference_is_established" | "not_established";
    merchantBilledPriceReview: "allowed_without_merchant_agreement" | "verification_only";
    incidenceInfluence:
      | "behaviorally_influenceable_where_trigger_applies"
      | "configuration_review_may_change_population"
      | "business_mix_or_acceptance_driven"
      | "not_established";
    allIncidenceAvoidable: false;
    merchantFaultEstablished: false;
  };
  renderingPermissions: {
    officialParLanguageAllowed: false;
    aboveParLanguageAllowed: false;
    implementationLanguageAllowed: false;
    merchantHistoryLanguageAllowed: false;
    faultLanguageAllowed: false;
    practicalReviewActionAllowed: boolean;
  };
  matchedRuleRefs: string[];
  limitations: string[];
};

export type GovernedDatedNetworkFeeEvidenceResolution = {
  catalogVersion: typeof GOVERNED_DATED_NETWORK_FEE_EVIDENCE_V1;
  rules: GovernedDatedNetworkRule[];
  statementNotices: GovernedNetworkNoticeEvent[];
  rowsByFeeRowId: Readonly<Record<string, GovernedDatedNetworkRowResolution>>;
  diagnostics: {
    applicableRows: number;
    familySupportedRows: number;
    mechanicSupportedRows: number;
    billedObservations: number;
    officialRateReferences: 0;
    parComparisons: 0;
    announcementRecords: number;
    implementationConfirmedRecords: 0;
    presentationOnlyRecords: number;
    postponedRecords: number;
  };
  canonicalMutationAllowed: false;
  limitations: string[];
};

export type GovernedNetworkCorpusHistory = {
  family: GovernedNetworkFeeFamily;
  points: Array<{
    date: string;
    kind: "E1_billed_observation" | "E4_announcement";
    statementRef: string;
    value: string | number | null;
    unit: string | null;
  }>;
  seriesKind: "cross_merchant_observation_series";
  exactFeeContinuity: "unresolved";
  merchantHistoryAllowed: false;
  officialRateHistoryAllowed: false;
  interpolationAllowed: false;
  explicitHistoricalGap: boolean;
  limitations: string[];
};

const PRODUCT_ADJUDICATION_REF =
  "RateReveal_Product_Batch3_Dated_Network_Authorization_Access_Exception_Integrity_Evidence_Adjudication_2026_09_07";
const PRODUCT_ADJUDICATION_SHA256 = "6c984034cf405c23e757bf1499cf0afd0283a54b5c7e4c9828b441336cd642fc";
const INDEPENDENT_REVIEW_REF = "CLAUDE_RateReveal_Batch3_Dated_Network_Fee_Evidence.md";
const INDEPENDENT_REVIEW_SHA256 = "3269be0ea4594bd7644ab12c56666ebdc96dfa48735b1ddc5c8fdab05d8131ec";

const COMMON_RULE = {
  lifecycle: "active" as const,
  admissionStatus: "admitted" as const,
  evidenceClass: "G1_product_domain_adjudication" as const,
  sourceRefs: [PRODUCT_ADJUDICATION_REF, INDEPENDENT_REVIEW_REF],
  sourceFingerprints: [PRODUCT_ADJUDICATION_SHA256, INDEPENDENT_REVIEW_SHA256],
  reviewedAt: "2026-09-07" as const,
};

const RULES: GovernedDatedNetworkRule[] = [
  rule("RR-B3-01", 1, "Historical evidence is period-correct", "processor_agnostic", "Historical rate evidence follows the admitted period-correct hierarchy and fails closed outside its scope.", ["current_rate_applied_backward", "later_document_proves_historical_rate"], [], "product_adjudicated_governance", ["Primary network evidence covering the period remains superior to a contemporaneous processor notice."]),
  rule("RR-B3-02", 2, "Statements never define official network par", "processor_agnostic", "A statement proves only what that account was billed and may support cross-corpus consistency or a research trigger.", ["statement_rate_equals_network_par", "repeated_statement_rate_equals_network_par", "corpus_mode_rate_equals_network_par"], ["RR-B3-01"], "product_adjudicated_governance", []),
  rule("RR-B3-03", 3, "Rate and mechanic knowledge is date bounded", "processor_agnostic", "Authoritative rate/mechanic entries require effective scope, source date/version, and review status; out-of-period comparisons fail closed.", ["undated_authoritative_rate", "out_of_period_rate_comparison"], ["RR-B3-01"], "product_adjudicated_governance", []),
  rule("RR-B3-04", 4, "Mechanic and rate version independently", "processor_agnostic", "Similar family labels with different mechanics do not prove continuity or a mechanic change in the same fee.", ["same_label_proves_continuity", "different_mechanic_proves_fee_changed", "invalid_cross_mechanic_rate_comparison"], ["RR-B3-03"], "product_adjudicated_governance", []),
  rule("RR-B3-05", 5, "Event lifecycle is explicit", "processor_agnostic", "Announced, effective, implemented, postponed, withdrawn, presentation-only, rate-change, and mechanic-change states remain distinct.", ["announcement_equals_implementation", "presentation_change_equals_cost_increase", "postponed_fee_is_effective"], ["RR-B3-03"], "product_adjudicated_with_e4_notice_records", []),
  rule("RR-B3-06", 6, "Cross-corpus observation is not merchant history", "processor_agnostic", "Only verified same-merchant/account continuity can support a merchant-specific before/after statement.", ["cross_merchant_series_is_your_history", "unverified_name_match_proves_account_continuity"], ["RR-B3-02"], "product_adjudicated_governance", []),
  rule("RR-B3-07", 7, "Unrelated absence proves nothing", "processor_agnostic", "Absence on an unrelated merchant statement does not establish general nonimplementation or nonapplicability.", ["unrelated_absence_proves_not_implemented", "unrelated_absence_proves_not_applicable"], ["RR-B3-02"], "product_adjudicated_governance", []),
  rule("RR-B3-08", 8, "Network price and merchant-billed amount are separate", "processor_agnostic", "Rule setter, underlying network price, billed amount, collector, beneficiary, and merchant-facing controller are independently resolved; pass-through at par and above-par spread require dated independent par.", ["collection_proves_network_ownership", "network_identity_proves_billed_at_par", "network_identity_proves_merchant_price_not_reviewable", "above_par_without_reference"], ["RR-B3-02", "RR-B3-03"], "product_adjudicated_governance", []),
  rule("RR-B3-09", 9, "Historical confidence follows the weakest required layer", "processor_agnostic", "Identity/mechanic confidence may stand while historical rate comparison remains unresolved.", ["identity_confidence_becomes_rate_confidence", "current_document_supports_historical_comparison"], ["RR-B3-01", "RR-B3-08"], "product_adjudicated_governance", []),
  rule("RR-B3-10", 10, "Network authorization and access families remain scoped", "processor_agnostic", "Mastercard, Visa, Discover, American Express, and international/non-U.S. authorization/access families remain distinct; exact values require dated geography/product evidence.", ["generic_auth_rate_applies_all_networks", "domestic_rate_applies_international", "family_identity_supplies_exact_rate"], ["RR-B3-03", "RR-B3-04"], "product_adjudicated_semantics", []),
  rule("RR-B3-11", 11, "Visa Transaction Integrity stays trigger-bounded", "processor_agnostic", "Visa Transaction Integrity may resolve to an integrity/exception family, but exact triggers and transaction attribution require applicable evidence.", ["near_count_proves_tif_trigger", "tif_proves_configuration_fault", "tif_all_events_avoidable"], ["RR-B3-09"], "product_adjudicated_semantics", []),
  rule("RR-B3-12", 12, "Visa Misuse and Zero Floor remain distinct", "processor_agnostic", "Misuse and Zero Floor are directionally distinct exception families; exact historic rate, timing window, and transaction cause remain unresolved absent period-correct evidence.", ["misuse_equals_zero_floor", "exact_misuse_window_without_network_evidence", "exception_fee_proves_fault"], ["RR-B3-11"], "product_adjudicated_semantics", []),
  rule("RR-B3-13", 13, "Cross-border and international families remain distinct", "processor_agnostic", "Visa IAF/ISA, Mastercard Global Acquirer/cross-border variants, non-U.S. access/APF, and risk supplements remain separate family members.", ["all_cross_border_labels_same_fee", "presentation_only_notice_is_fee_increase", "cross_border_fee_nothing_actionable"], ["RR-B3-04", "RR-B3-08"], "product_adjudicated_semantics", []),
  rule("RR-B3-14", 14, "Statement notices are E4 announcement evidence", "fiserv_family_statement_analysis", "Dated processor/account notices preserve exact announcement, provenance, announced date, scope, event type, and later-confirmation state without becoming effective network rules automatically.", ["notice_announcement_automatically_effective", "processor_notice_is_primary_network_source"], ["RR-B3-05"], "product_adjudicated_with_e4_notice_records", []),
  rule("RR-B3-15", 15, "Discover Program Integrity keeps explicit historical gaps", "processor_agnostic", "Separated dated observations may be retained as point A and point B, but no interpolation, single-change claim, network par, or merchant history is inferred.", ["discover_program_integrity_interpolated_rate", "two_points_prove_single_change", "cross_merchant_points_are_merchant_history"], ["RR-B3-02", "RR-B3-06"], "product_adjudicated_semantics", []),
  rule("RR-B3-16", 16, "Clearing/data record population and economics remain separate", "processor_agnostic", "Count support may identify a settlement/data-record population while ownership and economics stay unresolved until qualified evidence exists.", ["data_usage_count_proves_network_fee", "count_match_proves_economic_owner"], ["RR-B3-04"], "product_adjudicated_semantics", []),
  rule("RR-B3-17", 17, "Trigger claims follow an evidence hierarchy", "processor_agnostic", "Qualified industry knowledge may support a category; exact windows/thresholds require network evidence and transaction-specific attribution requires account evidence.", ["statement_alone_proves_exact_trigger", "statement_fee_proves_causation", "statement_fee_proves_merchant_fault"], ["RR-B3-11", "RR-B3-12"], "product_adjudicated_governance", []),
  rule("RR-B3-18", 18, "Network price and incidence actionability remain separate", "processor_agnostic", "A fixed underlying network price can coexist with behaviorally influenceable incidence and merchant-facing billed-price review; no finding may claim all incidence is avoidable.", ["network_fee_not_actionable", "all_network_incidence_avoidable", "network_identity_blocks_billed_price_review"], ["RR-B3-08", "RR-B3-17"], "product_adjudicated_governance", []),
];

const BASYS_NOTICE_REF = "doc_10aa99e2187fe28f";
const DATED_2022_NOTICE_REF = "doc_e78a35bfe868b57c";

const BASYS_PRESENTATION_EXCERPT = "For NON HIGH RISK MERCHANTS: Effective April 17, 2020, the 0.45% Visa International Acquirer Fee and 0.85% Mastercard Global Acquirer Fee that you currently pay for any non-U.S. issued card transaction will appear as separate lines on your statement. Currently, these fees are included in your Interchange expense. There is no change to your overall expense for these items; we are just moving them from being included in interchange to appear separately.";
const BASYS_HIGH_RISK_EXCERPT = "For HIGH RISK MERCHANTS: Effective April 17, 2020, a 0.45% Visa International Acquirer Fee, an additional 0.45% Visa International Acquirer Fee for High Risk merchants and a 0.85% Mastercard Global Acquirer Fee that you currently pay for any non-U.S. issued card transaction will appear as separate lines on your statement. Currently, these fees are included in your Interchange expense. There is no change to your overall expense for these items; we are just moving them from being included in interchange to appear separately.";
const BASYS_ASSESSMENT_EXCERPT = "Effective April 18, 2020: American Express will increase the General Assessment Fee for the United States from 0.15% to 0.16% of the face amount of each charge. Discover is increasing the Acquirer Assessment Fee from 0.13% to 0.14% of the gross amount of the card sale.";
const BASYS_DISCOVER_PI_EXCERPT = "Discover is introducing an additional fee; Program Integrity Fee $0.05 per U.S. Mid Submission level or U.S. Base Submission Level qualified transaction.";
const BASYS_VISA_AUTH_EXCERPT = "Effective May 1, 2020, Visa will introduce two new Authorization Consistency Fees when an authorization has been declined and subsequently resubmitted with any of the following data elements changed; Country Code, MCC, Condition Code, POS Environment, Entry Mode, and ECI, Visa will assess a Data Consistency Fee of $0.10 for Domestically issued transactions and $0.15 for International transactions. In addition, Visa has defined the allowable resubmission of a declined authorization in a 30-day period. That limit will be set at 15 re-attempts. Each subsequent resubmission in a 30-day period that exceeds the limit, will be assessed a declined transaction resubmission fee of $0.10 for Domestic transactions and $0.15 for International transactions.";
const DATED_2022_STAR_EXCERPT = "THIS MESSAGE IS TO ADVISE YOU THAT THE BILLING CRITERIA FOR THE STAR PIN DEBIT NETWORK ANNUAL FEE HAS CHANGED AS FOLLOWS. EFFECTIVE NOVEMBER 2022, YOUR ACCOUNT WILL BE ASSESSED A STAR NETWORK ANNUAL FEE IN THE AMOUNT OF $16.00. THIS FEE IS ASSESSED PER PARTICIPATING LOCATION OR WEBSITE THAT IS ENABLED WITH AND/OR ACCEPTS A STAR TRANSACTION(S) IN THE MONTH OF JUNE, JULY, AND AUGUST 2022.";
const DATED_2022_ACCEL_EXCERPT = "THIS MESSAGE IS TO ADVISE YOU THAT THE BILLING CRITERIA FOR THE ACCEL PIN DEBIT NETWORK ANNUAL FEE HAS CHANGED AS FOLLOWS. EFFECTIVE DECEMBER 2022, YOUR ACCOUNT WILL BE ASSESSED A ACCEL NETWORK ANNUAL FEE IN THE AMOUNT OF $16.00. THIS FEE IS ASSESSED PER PARTICIPATING LOCATION OR WEBSITE THAT IS ENABLED WITH AND/OR ACCEPTS A ACCEL TRANSACTION(S) IN THE MONTH OF JUNE, JULY, OR AUGUST 2022.";
const DATED_2022_POSTPONED_EXCERPT = "Please be advised the Interlink System Integrity and EMV Fallback Fee(s) have been postponed from the October 2022 release to a future release date. The updated release date will be communicated when details become available.";

const NOTICES: GovernedNetworkNoticeEvent[] = [
  notice("b3_notice_basys_visa_iaf_presentation", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-lines-17-24", BASYS_PRESENTATION_EXCERPT, "Visa", "visa_international_acquirer", "presentation_only", "2020-04-17", "non-U.S.-issued card transactions", "non-high-risk merchants", "ad valorem", null, 0.0045, "decimal_rate", "The notice announced separate statement presentation of an existing 0.45% Visa IAF and expressly stated no overall-expense change."),
  notice("b3_notice_basys_mc_global_presentation", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-lines-17-24", BASYS_PRESENTATION_EXCERPT, "Mastercard", "mastercard_global_acquirer", "presentation_only", "2020-04-17", "non-U.S.-issued card transactions", "non-high-risk merchants", "ad valorem", null, 0.0085, "decimal_rate", "The notice announced separate statement presentation of an existing 0.85% Mastercard Global Acquirer fee and expressly stated no overall-expense change."),
  notice("b3_notice_basys_visa_iaf_high_risk_presentation", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-extraction-rows-20-24", BASYS_HIGH_RISK_EXCERPT, "Visa", "visa_international_acquirer", "presentation_only", "2020-04-17", "non-U.S.-issued card transactions", "high-risk merchants", "ad valorem plus stated high-risk supplement", null, 0.009, "decimal_rate", "The notice described a 0.45% Visa IAF plus an additional 0.45% for high-risk merchants as a presentation change with no overall-expense change.", [{ scope: "base Visa IAF", value: 0.0045, unit: "decimal_rate" }, { scope: "additional high-risk Visa IAF", value: 0.0045, unit: "decimal_rate" }]),
  notice("b3_notice_basys_amex_general_assessment", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-lines-25-26", BASYS_ASSESSMENT_EXCERPT, "American Express", "network_assessment", "announced_rate_change", "2020-04-18", "United States charges", "all stated merchants", "ad valorem on face amount of each charge", 0.0015, 0.0016, "decimal_rate", "The processor notice announced an American Express General Assessment increase from 0.15% to 0.16%."),
  notice("b3_notice_basys_discover_acquirer_assessment", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-lines-25-26", BASYS_ASSESSMENT_EXCERPT, "Discover", "network_assessment", "announced_rate_change", "2020-04-18", "gross card-sale amount", "all stated merchants", "ad valorem on gross card-sale amount", 0.0013, 0.0014, "decimal_rate", "The processor notice announced a Discover Acquirer Assessment increase from 0.13% to 0.14%."),
  notice("b3_notice_basys_discover_program_integrity", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-lines-27-28", BASYS_DISCOVER_PI_EXCERPT, "Discover", "discover_program_integrity", "announced_new_fee", "2020-04-18", "U.S. Mid or Base Submission qualified transactions", "all stated merchants", "per qualified transaction", null, 0.05, "usd_per_event", "The processor notice announced a $0.05 Discover Program Integrity Fee per qualifying U.S. Mid/Base Submission transaction."),
  notice("b3_notice_basys_visa_data_consistency", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-extraction-rows-29-34", BASYS_VISA_AUTH_EXCERPT, "Visa", "network_exception_or_integrity_family", "announced_new_fee", "2020-05-01", "domestic and international declined-authorization resubmissions", "all stated merchants", "per announced changed-data resubmission", null, 0.10, "usd_per_event", "The notice announced domestic $0.10 and international $0.15 Data Consistency fees for specified changed data elements after a declined authorization.", [{ scope: "domestically issued transactions", value: 0.10, unit: "usd_per_event" }, { scope: "international transactions", value: 0.15, unit: "usd_per_event" }]),
  notice("b3_notice_basys_visa_declined_resubmission", BASYS_NOTICE_REF, "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf#page-1-extraction-rows-32-34", BASYS_VISA_AUTH_EXCERPT, "Visa", "network_exception_or_integrity_family", "announced_new_fee", "2020-05-01", "domestic and international declined-authorization resubmissions", "all stated merchants", "per resubmission after the announced fifteenth re-attempt in 30 days", null, 0.10, "usd_per_event", "The notice announced domestic $0.10 and international $0.15 declined-transaction resubmission fees after 15 re-attempts in 30 days.", [{ scope: "domestic transactions", value: 0.10, unit: "usd_per_event" }, { scope: "international transactions", value: 0.15, unit: "usd_per_event" }]),
  notice("b3_notice_star_annual_2022", DATED_2022_NOTICE_REF, `${DATED_2022_NOTICE_REF}#pages-1-3-extraction-rows-25-28`, DATED_2022_STAR_EXCERPT, "STAR", "network_merchant_location", "announced_mechanic_change", "2022-11-01", "participating enabled location or website with June-August 2022 STAR activity", "the addressed merchant account", "annual per participating location or website", null, 16, "usd_per_year_per_location_or_website", "The notice announced changed billing criteria and a $16 STAR network annual fee under the stated location/website and activity criteria."),
  notice("b3_notice_accel_annual_2022", DATED_2022_NOTICE_REF, `${DATED_2022_NOTICE_REF}#pages-1-3-extraction-rows-29-31,57-60`, DATED_2022_ACCEL_EXCERPT, "ACCEL", "network_merchant_location", "announced_mechanic_change", "2022-12-01", "participating enabled location or website with June-August 2022 ACCEL activity", "the addressed merchant account", "annual per participating location or website", null, 16, "usd_per_year_per_location_or_website", "The notice announced changed billing criteria and a $16 ACCEL network annual fee under the stated location/website and activity criteria."),
  notice("b3_notice_interlink_integrity_postponed_2022", DATED_2022_NOTICE_REF, `${DATED_2022_NOTICE_REF}#page-10-lines-350-352`, DATED_2022_POSTPONED_EXCERPT, "Visa", "network_exception_or_integrity_family", "postponed", null, "Interlink System Integrity", "the addressed merchant account", "unresolved", null, null, null, "The notice postponed the Interlink System Integrity fee from the October 2022 release to an unspecified future release."),
  notice("b3_notice_emv_fallback_postponed_2022", DATED_2022_NOTICE_REF, `${DATED_2022_NOTICE_REF}#page-10-lines-350-352`, DATED_2022_POSTPONED_EXCERPT, "Visa", "network_exception_or_integrity_family", "postponed", null, "EMV fallback", "the addressed merchant account", "unresolved", null, null, null, "The notice postponed the EMV Fallback fee from the October 2022 release to an unspecified future release."),
];

export function governedDatedNetworkRulesV1(): GovernedDatedNetworkRule[] {
  return structuredClone(RULES);
}

export function governedNetworkNoticeEventsV1(): GovernedNetworkNoticeEvent[] {
  return structuredClone(NOTICES);
}

export function resolveGovernedDatedNetworkFeeEvidenceV1(input: {
  analysis: CanonicalStatementAnalysis;
  semanticRows: FeeSemanticsShadowRowResult[];
  perItemRowsByFeeRowId: Readonly<Record<string, GovernedPerItemRowResolution>>;
}): GovernedDatedNetworkFeeEvidenceResolution {
  const semanticById = new Map(input.semanticRows.map((row) => [row.feeRowId, row]));
  const rows = input.analysis.feeLedger.rows.map((row) => resolveRow({
    analysis: input.analysis,
    row,
    semantic: semanticById.get(row.id) ?? null,
    perItem: input.perItemRowsByFeeRowId[row.id] ?? null,
  }));
  const statementNotices = NOTICES.filter((notice) => notice.sourceDocumentRef === input.analysis.identity.sourceDocumentRef);
  return deepFreeze({
    catalogVersion: GOVERNED_DATED_NETWORK_FEE_EVIDENCE_V1,
    rules: governedDatedNetworkRulesV1(),
    statementNotices: structuredClone(statementNotices),
    rowsByFeeRowId: Object.fromEntries(rows.map((row) => [row.feeRowId, row])),
    diagnostics: {
      applicableRows: rows.filter((row) => row.applicable).length,
      familySupportedRows: rows.filter((row) => row.family.state === "supported").length,
      mechanicSupportedRows: rows.filter((row) => row.mechanic.state === "supported").length,
      billedObservations: rows.filter((row) => row.billedObservation).length,
      officialRateReferences: 0,
      parComparisons: 0,
      announcementRecords: statementNotices.length,
      implementationConfirmedRecords: 0,
      presentationOnlyRecords: statementNotices.filter((notice) => notice.eventType === "presentation_only").length,
      postponedRecords: statementNotices.filter((notice) => notice.eventType === "postponed").length,
    },
    canonicalMutationAllowed: false,
    limitations: [
      "Batch 3 admits no E3 network schedule and therefore no official network par or above-par comparison.",
      "E4 processor/acquirer notices prove the announcement, presentation, or postponement stated in the notice; implementation requires later confirmation.",
      "E1 billed observations remain account-and-period facts and never become official network reference rates.",
      "Cross-statement aggregation is cross-merchant consistency evidence unless verified merchant/account continuity is supplied separately.",
      "Current documentation may assist current identity/mechanic research but cannot be applied backward as a historical rate.",
    ],
  });
}

export function buildGovernedNetworkCorpusHistoryV1(
  resolutions: GovernedDatedNetworkFeeEvidenceResolution[],
): GovernedNetworkCorpusHistory[] {
  const byFamily = new Map<GovernedNetworkFeeFamily, GovernedNetworkCorpusHistory["points"]>();
  for (const resolution of resolutions) {
    for (const notice of resolution.statementNotices) {
      const points = byFamily.get(notice.family) ?? [];
      points.push({
        date: notice.announcedEffectiveFrom ?? notice.sourceDate,
        kind: "E4_announcement",
        statementRef: notice.sourceDocumentRef,
        value: notice.announcedValue?.newValue ?? null,
        unit: notice.announcedValue?.unit ?? null,
      });
      byFamily.set(notice.family, points);
    }
    for (const row of Object.values(resolution.rowsByFeeRowId)) {
      if (!row.family.value || !row.billedObservation) continue;
      const points = byFamily.get(row.family.value) ?? [];
      points.push({
        date: row.billedObservation.statementPeriod?.end ?? "0001-01-01",
        kind: "E1_billed_observation",
        statementRef: row.billedObservation.statementRef,
        value: row.billedObservation.printedRate?.numericValue ?? row.billedObservation.amountMinor,
        unit: row.billedObservation.printedRate?.kind ?? "statement_amount_minor",
      });
      byFamily.set(row.family.value, points);
    }
  }
  return [...byFamily.entries()].map(([family, points]) => {
    const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
    return {
      family,
      points: sorted,
      seriesKind: "cross_merchant_observation_series",
      exactFeeContinuity: "unresolved",
      merchantHistoryAllowed: false,
      officialRateHistoryAllowed: false,
      interpolationAllowed: false,
      explicitHistoricalGap: new Set(sorted.map((point) => point.date.slice(0, 4))).size > 1,
      limitations: [
        "Points from different source documents are not represented as one merchant's history.",
        "The series does not define network par, implementation timing, a single rate change, or values between observed dates.",
        "Similar labels with different mechanics do not prove continuity of one network-defined fee.",
      ],
    };
  });
}

function resolveRow(input: {
  analysis: CanonicalStatementAnalysis;
  row: CanonicalFeeRow;
  semantic: FeeSemanticsShadowRowResult | null;
  perItem: GovernedPerItemRowResolution | null;
}): GovernedDatedNetworkRowResolution {
  const text = normalize(`${input.row.selectedLabel} ${input.semantic?.conceptId ?? ""} ${input.semantic?.semanticAxes?.identity.value ?? ""}`);
  const family = familyFor(text);
  const network = networkFor(text, family);
  const perItemAcquiringSide = Boolean(input.perItem?.economicLayer?.startsWith("acquiring_side_"));
  const networkQualified = !perItemAcquiringSide && Boolean(
    family ||
    input.perItem?.economicLayer?.startsWith("network_"),
  );
  const refs = unique([
    ...input.row.contributionDecision.evidenceRefs,
    ...(input.semantic?.feeRowEvidenceRefs ?? []),
    ...(input.perItem?.evidenceRefs ?? []),
  ]);
  const arithmetic = input.analysis.feeLedger.partitionSourceProvenance.rowArithmetic.find((item) => item.feeRowId === input.row.id) ?? null;
  if (!networkQualified) return notApplicableRow(input.row.id);
  const mechanicValue = input.perItem?.unit.state === "supported"
    ? input.perItem.unit.value
    : arithmetic && arithmetic.formulaBasis !== "unknown" && arithmetic.formulaBasis !== "ambiguous"
      ? arithmetic.formulaBasis
      : null;
  const printed = arithmetic?.printedPerItemRate ?? arithmetic?.printedPerUnitRate ?? arithmetic?.printedRate ?? null;
  const printedKind = arithmetic?.printedPerItemRate
    ? "per_item" as const
    : arithmetic?.printedPerUnitRate
      ? "per_source_unit" as const
      : arithmetic?.printedRate
        ? "ad_valorem" as const
        : null;
  const trigger = triggerFor(family);
  const notices = family ? NOTICES.filter((notice) => notice.family === family && notice.sourceDocumentRef === input.analysis.identity.sourceDocumentRef) : [];
  const incidence = incidenceFor(family);
  const cardNetworkDefined = input.perItem?.economicLayer !== "PER_ITEM_LAYER_UNRESOLVED" && family !== "clearing_or_data_record_family" && Boolean(
    input.perItem?.economicBeneficiary === "card_network" ||
    family && !family.endsWith("_family"),
  );
  return {
    feeRowId: input.row.id,
    applicable: true,
    family: {
      state: family ? (family.endsWith("_family") ? "category_only" : "supported") : "unresolved",
      value: family,
      network,
      confidence: family ? (family.endsWith("_family") ? "CATEGORY_ONLY" : "STRONG") : "UNRESOLVED",
      evidenceRefs: refs,
    },
    mechanic: {
      state: mechanicValue ? "supported" : "unresolved",
      value: mechanicValue,
      confidence: mechanicValue ? (input.perItem?.unit.state === "supported" ? "STRONG" : "LIKELY") : "UNRESOLVED",
      independentlyVersioned: true,
      continuityClaim: "not_made",
      evidenceRefs: refs,
    },
    billedObservation: {
      evidenceClass: "E1_statement",
      statementRef: input.analysis.identity.sourceDocumentRef,
      statementPeriod: input.analysis.identity.statementPeriod.evidenceRefs.length > 0 ? input.analysis.identity.statementPeriod.value : null,
      merchantAccountContinuityRef: null,
      label: input.row.selectedLabel,
      amountMinor: input.row.selectedAmount?.amountMinor ?? null,
      printedRate: printed && printedKind ? {
        original: printed.original,
        numericValue: String(printed.numericValue),
        representation: printed.representation,
        kind: printedKind,
      } : null,
      establishesOfficialNetworkPar: false,
      evidenceRefs: refs,
    },
    trigger,
    priceSeparation: {
      underlyingNetworkPriceSetter: cardNetworkDefined ? "card_network" : null,
      underlyingNetworkReference: {
        state: cardNetworkDefined ? "unresolved_no_period_matched_independent_reference" : "not_applicable",
        value: null,
        effectiveFrom: null,
        effectiveThrough: null,
        sourceDateOrVersion: null,
        reviewStatus: "not_admitted",
        evidenceRefs: [],
      },
      merchantBilledRateOrAmountSource: "E1_statement",
      collector: "processor_or_acquirer",
      underlyingNetworkEconomicBeneficiary: cardNetworkDefined ? "card_network" : null,
      merchantBilledEconomicBeneficiary: cardNetworkDefined ? "unresolved" : null,
      merchantFacingPriceController: "unresolved",
      passThroughAtPar: cardNetworkDefined ? "not_established" : "not_applicable",
      aboveParSpread: cardNetworkDefined ? "not_assessable" : "not_applicable",
    },
    historicalComparison: {
      state: cardNetworkDefined ? "blocked_no_period_matched_independent_reference" : "not_applicable",
      announcementEvidenceRefs: notices.map((notice) => notice.noticeId),
      announcementIsImplementationEvidence: false,
      currentDocumentationMaySupplyHistoricalRate: false,
      crossMerchantObservationMaySupplyMerchantHistory: false,
      unrelatedStatementAbsenceMayProveApplicability: false,
      interpolationAllowed: false,
    },
    actionability: {
      underlyingNetworkPriceNegotiability: cardNetworkDefined ? "ordinarily_fixed_if_reference_is_established" : "not_established",
      merchantBilledPriceReview: cardNetworkDefined ? "allowed_without_merchant_agreement" : "verification_only",
      incidenceInfluence: incidence,
      allIncidenceAvoidable: false,
      merchantFaultEstablished: false,
    },
    renderingPermissions: {
      officialParLanguageAllowed: false,
      aboveParLanguageAllowed: false,
      implementationLanguageAllowed: false,
      merchantHistoryLanguageAllowed: false,
      faultLanguageAllowed: false,
      practicalReviewActionAllowed: true,
    },
    matchedRuleRefs: matchedRulesFor(family),
    limitations: [
      "Semantic identity, assessment mechanic/population, and historical rate/value carry independent confidence.",
      "The observed statement value is not an official network reference rate.",
      "No pass-through-at-par, processor spread, implementation, merchant history, or fault claim is supported by this row alone.",
    ],
  };
}

function familyFor(text: string): GovernedNetworkFeeFamily | null {
  if (/VISA.*(?:INTERNATIONAL ACQUIRER|\bIAF\b)|(?:INTERNATIONAL ACQUIRER|\bIAF\b).*VISA/.test(text)) return "visa_international_acquirer";
  if (/VISA.*(?:INTERNATIONAL SERVICE|\bISA\b)|(?:INTERNATIONAL SERVICE|\bISA\b).*VISA/.test(text)) return "visa_international_service_assessment";
  if (/MASTER ?CARD|\bMC\b/.test(text) && /GLOBAL ACQUIRER/.test(text)) return "mastercard_global_acquirer";
  if (/MASTER ?CARD|\bMC\b/.test(text) && /CROSS.?BORDER/.test(text)) return "mastercard_cross_border";
  if (/PROGRAM INTEGRITY/.test(text)) return "discover_program_integrity";
  if (/ZERO FLOOR/.test(text)) return "visa_zero_floor_limit";
  if (/MISUSE/.test(text)) return "visa_misuse";
  if (/TRANSACTION INTEGRITY|\bTIF\b|INTEGRITY FEE/.test(text) && /VISA|\bVS\b|TRANSACTION INTEGRITY|\bTIF\b/.test(text)) return "visa_transaction_integrity";
  if (/MASTER ?CARD|\bMC\b/.test(text) && /NABU|ACCESS|NETWORK AUTH|AUTHORIZATION/.test(text)) return "mastercard_network_access_or_authorization";
  if (/VISA|\bVS\b/.test(text) && /\bAPF\b|ACQUIRER PROCESSING|ACCESS|NETWORK AUTH/.test(text)) return "visa_acquirer_processing_or_access";
  if (/DISCOVER|\bDS\b/.test(text) && /AUTH|ACCESS/.test(text)) return "discover_network_authorization";
  if (/AMEX|AMERICAN EXPRESS/.test(text) && /ACQUIRED|NETWORK|TRANSACTION|AUTH/.test(text)) return "amex_acquired_program_network_transaction";
  if (/MERCHANT LOCATION|LOCATION FEE/.test(text)) return "network_merchant_location";
  if (/FIXED ACQUIRER NETWORK|\bFANF\b/.test(text)) return "network_fixed_acquirer_network_fee";
  if (/DIGITAL ENABLEMENT/.test(text)) return "network_digital_enablement";
  if (/ASSESSMENT/.test(text) && /VISA|MASTER ?CARD|\bMC\b|DISCOVER|AMEX|AMERICAN EXPRESS/.test(text)) return "network_assessment";
  if (/DATA USAGE|BASE ?II|CLEARING|SYSTEM FILE|DATA RECORD/.test(text)) return "clearing_or_data_record_family";
  if (/INTEGRITY|ZERO FLOOR|MISUSE|UNMATCHED|EXCEPTION/.test(text)) return "network_exception_or_integrity_family";
  if (/NETWORK AUTH|NABU|\bAPF\b|NETWORK ACCESS/.test(text)) return "network_authorization_or_access_family";
  return null;
}

function networkFor(text: string, family: GovernedNetworkFeeFamily | null): string | null {
  if (family?.startsWith("visa_") || /\bVISA\b|\bVS\b/.test(text)) return "Visa";
  if (family?.startsWith("mastercard_") || /MASTER ?CARD|\bMC\b/.test(text)) return "Mastercard";
  if (family?.startsWith("discover_") || /DISCOVER|\bDS\b/.test(text)) return "Discover";
  if (family?.startsWith("amex_") || /AMEX|AMERICAN EXPRESS/.test(text)) return "American Express";
  return null;
}

function triggerFor(family: GovernedNetworkFeeFamily | null): GovernedDatedNetworkRowResolution["trigger"] {
  if (family === "visa_transaction_integrity") return { state: "directional_category_only", value: "Visa integrity/exception event; exact qualifying conditions require period-correct network evidence and account-level transaction evidence.", exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false, evidenceRefs: ["RR-B3-11", "RR-B3-17"] };
  if (family === "visa_misuse") return { state: "directional_category_only", value: "Misuse lifecycle/authorization exception category, distinct from Zero Floor; exact timing window requires period-correct network evidence.", exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false, evidenceRefs: ["RR-B3-12", "RR-B3-17"] };
  if (family === "visa_zero_floor_limit") return { state: "directional_category_only", value: "Zero Floor authorization/amount-control exception category, distinct from Misuse; exact threshold and conditions require period-correct network evidence.", exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false, evidenceRefs: ["RR-B3-12", "RR-B3-17"] };
  if (family === "discover_program_integrity" || family === "network_exception_or_integrity_family") return { state: "directional_category_only", value: "Network integrity/exception category; exact qualification and transaction attribution remain unresolved.", exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false, evidenceRefs: ["RR-B3-15", "RR-B3-17"] };
  return { state: "unresolved", value: null, exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false, evidenceRefs: ["RR-B3-17"] };
}

function incidenceFor(family: GovernedNetworkFeeFamily | null): GovernedDatedNetworkRowResolution["actionability"]["incidenceInfluence"] {
  if (family && /integrity|misuse|zero_floor|exception/.test(family)) return "behaviorally_influenceable_where_trigger_applies";
  if (family && /authorization|access/.test(family)) return "configuration_review_may_change_population";
  if (family && /international|global_acquirer|cross_border/.test(family)) return "business_mix_or_acceptance_driven";
  return "not_established";
}

function matchedRulesFor(family: GovernedNetworkFeeFamily | null): string[] {
  const rules = ["RR-B3-01", "RR-B3-02", "RR-B3-03", "RR-B3-04", "RR-B3-06", "RR-B3-07", "RR-B3-08", "RR-B3-09", "RR-B3-17", "RR-B3-18"];
  if (family && /authorization|access/.test(family)) rules.push("RR-B3-10");
  if (family === "visa_transaction_integrity") rules.push("RR-B3-11");
  if (family === "visa_misuse" || family === "visa_zero_floor_limit") rules.push("RR-B3-12");
  if (family && /international|global_acquirer|cross_border/.test(family)) rules.push("RR-B3-13");
  if (family === "discover_program_integrity") rules.push("RR-B3-15");
  if (family === "clearing_or_data_record_family") rules.push("RR-B3-16");
  return unique(rules);
}

function notApplicableRow(feeRowId: string): GovernedDatedNetworkRowResolution {
  return {
    feeRowId,
    applicable: false,
    family: { state: "not_applicable", value: null, network: null, confidence: "UNRESOLVED", evidenceRefs: [] },
    mechanic: { state: "not_applicable", value: null, confidence: "UNRESOLVED", independentlyVersioned: true, continuityClaim: "not_made", evidenceRefs: [] },
    billedObservation: null,
    trigger: { state: "not_applicable", value: null, exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false, evidenceRefs: [] },
    priceSeparation: { underlyingNetworkPriceSetter: null, underlyingNetworkReference: { state: "not_applicable", value: null, effectiveFrom: null, effectiveThrough: null, sourceDateOrVersion: null, reviewStatus: "not_admitted", evidenceRefs: [] }, merchantBilledRateOrAmountSource: null, collector: null, underlyingNetworkEconomicBeneficiary: null, merchantBilledEconomicBeneficiary: null, merchantFacingPriceController: null, passThroughAtPar: "not_applicable", aboveParSpread: "not_applicable" },
    historicalComparison: { state: "not_applicable", announcementEvidenceRefs: [], announcementIsImplementationEvidence: false, currentDocumentationMaySupplyHistoricalRate: false, crossMerchantObservationMaySupplyMerchantHistory: false, unrelatedStatementAbsenceMayProveApplicability: false, interpolationAllowed: false },
    actionability: { underlyingNetworkPriceNegotiability: "not_established", merchantBilledPriceReview: "verification_only", incidenceInfluence: "not_established", allIncidenceAvoidable: false, merchantFaultEstablished: false },
    renderingPermissions: { officialParLanguageAllowed: false, aboveParLanguageAllowed: false, implementationLanguageAllowed: false, merchantHistoryLanguageAllowed: false, faultLanguageAllowed: false, practicalReviewActionAllowed: false },
    matchedRuleRefs: [],
    limitations: [],
  };
}

function notice(
  noticeId: string,
  sourceDocumentRef: string,
  sourceRef: string,
  evidenceExcerpt: string,
  network: GovernedNetworkNoticeEvent["network"],
  family: GovernedNetworkFeeFamily,
  eventType: GovernedNetworkNoticeEvent["eventType"],
  announcedEffectiveFrom: string | null,
  productScope: string,
  merchantScope: string,
  mechanic: string,
  oldValue: number | null,
  newValue: number | null,
  unit: GovernedNetworkNoticeEvent["announcedValue"] extends infer T ? T extends { unit: infer U } ? U : never : never,
  announcedClaim: string,
  announcedValueVariants: GovernedNetworkNoticeEvent["announcedValueVariants"] = [],
): GovernedNetworkNoticeEvent {
  return {
    noticeId,
    sourceDocumentRef,
    sourceStatementPeriod: sourceDocumentRef === BASYS_NOTICE_REF ? { start: "2020-03-01", end: "2020-03-31" } : { start: "2022-09-01", end: "2022-09-30" },
    sourceRef,
    sourceFingerprint: sha256(evidenceExcerpt),
    evidenceClass: "E4_processor_or_iso_publication",
    publisherLane: "processor_or_acquirer_statement_notice",
    network,
    family,
    eventType,
    lifecycleState: eventType === "postponed" ? "postponed" : eventType === "presentation_only" ? "presentation_only" : "announced",
    implementationState: "unconfirmed",
    announcedEffectiveFrom,
    effectiveDatePrecision: announcedEffectiveFrom === null ? "unresolved" : sourceDocumentRef === DATED_2022_NOTICE_REF ? "month" : "day",
    effectiveThrough: null,
    sourceDate: sourceDocumentRef === BASYS_NOTICE_REF ? "2020-03-31" : "2022-09-30",
    sourceDateBasis: "statement_period_end_proxy",
    sourceVersion: sourceDocumentRef === BASYS_NOTICE_REF ? "2020-03-statement-notice" : "2022-09-statement-notice",
    reviewStatus: "admitted_as_notice_evidence",
    geographyScope: "US merchant acquiring; additional product/geographic constraints retained in productScope",
    productScope,
    merchantScope,
    mechanic,
    announcedValue: unit ? { oldValue, newValue, unit } : null,
    announcedValueVariants,
    announcedClaim,
    evidenceExcerpt,
    knownExceptions: [],
    limitations: [
      "This is contemporaneous processor/acquirer notice evidence, not primary network documentation.",
      "The notice establishes what was announced or postponed; later implementation is not confirmed by this record.",
      "The announced value is not admitted as official network par and cannot support an above-par comparison.",
    ],
  };
}

function rule(
  ruleId: string,
  priority: number,
  title: string,
  scope: GovernedDatedNetworkRule["scope"],
  admittedClaim: string,
  prohibitedClaims: string[],
  dependencies: string[],
  evidenceState: GovernedDatedNetworkRule["evidenceState"],
  limitations: string[],
): GovernedDatedNetworkRule {
  return { ...COMMON_RULE, ruleId, priority, title, scope, admittedClaim, prohibitedClaims, dependencies, evidenceState, limitations };
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
