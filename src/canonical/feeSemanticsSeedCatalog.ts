import {
  FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
  emptyFeeSemanticScope,
  type FeeSemanticAliasAssertion,
  type FeeSemanticAssertion,
  type FeeSemanticCatalog,
  type FeeSemanticConcept,
  type FeeSemanticEvidenceRecord,
  type FeeSemanticScope,
} from "./feeSemanticsEvidenceModel.js";
import {
  QUALIFIED_FEE_SEMANTICS_CATALOG_SCHEMA_VERSION,
  QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
  createQualifiedFeeSemanticCatalog,
  feeSemanticClaimPacketFingerprint,
  type FeeSemanticAdmissionRecord,
  type FeeSemanticCatalogAuditEvent,
  type FeeSemanticSourceSnapshot,
  type QualifiedFeeSemanticCatalog,
} from "./qualifiedFeeSemanticsCatalog.js";

export const QUALIFIED_FEE_SEMANTICS_SEED_CATALOG_VERSION = "qualified_fee_semantics_seed_2026_09_06_v1" as const;
const REVIEWED_AT = "2026-09-06T00:00:00Z";
const REVIEWER_REF = "payments_domain_review_2026_09";
const REVIEW_DUE = "2027-03-06";

const US = emptyFeeSemanticScope({ geographies: ["us"] });
const US_VISA = emptyFeeSemanticScope({ geographies: ["us"], networkIds: ["visa"] });
const US_MC = emptyFeeSemanticScope({ geographies: ["us"], networkIds: ["mastercard"] });
const US_DISCOVER = emptyFeeSemanticScope({ geographies: ["us"], networkIds: ["discover"] });
const US_AMEX = emptyFeeSemanticScope({ geographies: ["us"], networkIds: ["american_express"] });
const EPI_US = emptyFeeSemanticScope({ geographies: ["us"], processorIds: ["electronic_payments"] });
const FISERV_US = emptyFeeSemanticScope({ geographies: ["us"], processorIds: ["fiserv_first_data"] });
const VISA_EU_2023 = emptyFeeSemanticScope({ effectiveFrom: "2023-07-01", geographies: ["europe"], networkIds: ["visa"] });
const VISA_AP_OLD_DCF = emptyFeeSemanticScope({ effectiveFrom: "2025-07-01", effectiveTo: "2026-04-01", geographies: ["ap"], networkIds: ["visa"] });
const VISA_AP_DCSF = emptyFeeSemanticScope({ effectiveFrom: "2026-04-01", geographies: ["ap"], networkIds: ["visa"] });

const evidence = (evidenceId: string, input: Omit<FeeSemanticEvidenceRecord, "evidenceId">): FeeSemanticEvidenceRecord => ({ evidenceId, ...input });
const externalEvidence = (
  evidenceId: string,
  input: Pick<FeeSemanticEvidenceRecord, "sourceAuthority" | "title" | "publisher" | "sourceUrl" | "sourceLocator" | "scope"> & Partial<Pick<FeeSemanticEvidenceRecord, "qualification" | "limitations">>,
): FeeSemanticEvidenceRecord => evidence(evidenceId, {
  evidenceClass: "qualified_external_research",
  qualification: input.qualification ?? "qualified",
  reviewedAt: REVIEWED_AT.slice(0, 10),
  visibility: "reusable",
  limitations: input.limitations ?? [],
  ...input,
});
const observationEvidence = (evidenceId: string, sourceLocator: string, scope: FeeSemanticScope): FeeSemanticEvidenceRecord => evidence(evidenceId, {
  evidenceClass: "statement_local",
  sourceAuthority: "repeated_statement_observation",
  qualification: "candidate",
  title: "Sanitized repeated statement-label observation",
  publisher: "RateReveal evaluation corpus",
  sourceUrl: null,
  sourceLocator,
  reviewedAt: null,
  scope,
  visibility: "reusable",
  limitations: ["Recurrence establishes only that a label is used; it does not establish economic meaning."],
});
const aiEvidence = (evidenceId: string, sourceLocator: string): FeeSemanticEvidenceRecord => evidence(evidenceId, {
  evidenceClass: "ai_hypothesis",
  sourceAuthority: "ai_inference",
  qualification: "candidate",
  title: "AI investigation hypothesis",
  publisher: "RateReveal investigator",
  sourceUrl: null,
  sourceLocator,
  reviewedAt: null,
  scope: emptyFeeSemanticScope(),
  visibility: "reusable",
  limitations: ["AI output is a research lead and cannot verify a fee meaning."],
});
const alias = (aliasId: string, text: string, evidenceRefs: string[], scope = emptyFeeSemanticScope(), status: FeeSemanticAliasAssertion["status"] = "admitted"): FeeSemanticAliasAssertion => ({
  aliasId, alias: text, status, evidenceRefs, scope,
});
const assertion = (assertionId: string, axis: FeeSemanticAssertion["axis"], value: string, evidenceRefs: string[], scope = emptyFeeSemanticScope(), status: FeeSemanticAssertion["status"] = "admitted", limitations: string[] = []): FeeSemanticAssertion => ({
  assertionId, axis, value, status, evidenceRefs, scope, limitations,
});
const concept = (conceptId: string, displayName: string, kind: FeeSemanticConcept["kind"], aliases: FeeSemanticAliasAssertion[], assertions: FeeSemanticAssertion[]): FeeSemanticConcept => ({
  conceptId, displayName, kind, componentConceptIds: [], aliases, assertions,
});

const EVIDENCE: FeeSemanticEvidenceRecord[] = [
  externalEvidence("chase_payment_brand_fee_support_2026", {
    sourceAuthority: "processor_support_documentation",
    title: "Merchant Services Statement Support",
    publisher: "Chase Payment Solutions",
    sourceUrl: "https://www.chase.com/business/support/payments/statements-and-fees",
    sourceLocator: "Payment brand, NABU, AVS, assessment, access, and processing-integrity fee definitions",
    scope: US,
    limitations: ["Identity and applicability support only; no merchant-specific rate or pass-through conclusion is admitted."],
  }),
  externalEvidence("visa_authorization_reversal_requirements_2024", {
    sourceAuthority: "official_network_publication",
    title: "Authorization and Reversal Processing Requirements for Merchants",
    publisher: "Visa",
    sourceUrl: "https://usa.visa.com/content/dam/VCOM/regional/na/us/support-legal/documents/authorization-and-reversal-processing-best-practices-for-merchants.pdf",
    sourceLocator: "Processing integrity fees; Misuse of Authorization System Fee; Unmatched Clearing Fee",
    scope: US_VISA,
    limitations: ["The Visa Rules govern if the guide conflicts; this seed does not admit a rate."],
  }),
  externalEvidence("visa_split_shipment_processing_2020", {
    sourceAuthority: "official_network_publication",
    title: "Processing Split-Shipment Card-Absent Transactions",
    publisher: "Visa",
    sourceUrl: "https://usa.visa.com/dam/VCOM/global/support-legal/documents/processing-split-shipment-card-absent-best%20practices.pdf",
    sourceLocator: "Authorization, reversal, clearing, and Processing Integrity Fees",
    scope: US_VISA,
    limitations: ["Supports a Visa fee family and processing conditions, not the literal alias PROGRAM INTEGRITY FEE."],
  }),
  externalEvidence("visa_partial_authorization_service_2017", {
    sourceAuthority: "official_network_publication",
    title: "Visa Partial Authorization Service",
    publisher: "Visa",
    sourceUrl: "https://bd.visa.com/dam/VCOM/global/support-legal/documents/visa-partial-authorization-service.pdf",
    sourceLocator: "Improper authorized-amount data may lead to a Transaction Integrity Fee on impacted debit transactions",
    scope: US_VISA,
    limitations: ["Supports fee identity and debit-transaction context; no current rate or merchant-specific application is admitted."],
  }),
  externalEvidence("first_financial_interchange_fee_guide", {
    sourceAuthority: "processor_publication",
    title: "Miscellaneous Interchange Fees Defined",
    publisher: "First Financial USA",
    sourceUrl: "https://cdn-sc.ffusa.com/ffusa/pdf/toolbox/interchange_fees.pdf",
    sourceLocator: "Visa, Mastercard, and Discover statement fee labels and applicability descriptions",
    scope: US,
    limitations: ["Processor-published secondary evidence; no seed rate is admitted."],
  }),
  externalEvidence("shift4_statement_glossary_2026", {
    sourceAuthority: "processor_support_documentation",
    title: "End-to-End Billing Matrix & Statement Glossary",
    publisher: "Shift4",
    sourceUrl: "https://shift4.zendesk.com/hc/en-us/articles/14382700830739-End-to-End-Billing-Matrix-Statement-Glossary",
    sourceLocator: "Mastercard, Discover, and American Express fee names, codes, and applicability",
    scope: US,
    limitations: ["Processor glossary supports listed identities in the stated U.S. context; pricing correctness remains unproven."],
  }),
  externalEvidence("electronic_payments_statement_guide", {
    sourceAuthority: "processor_publication",
    title: "Merchant Statements: What You Need to Know",
    publisher: "Electronic Payments",
    sourceUrl: "https://staging.electronicpayments.com/blog/merchant-statements/",
    sourceLocator: "INTERCHANGE, DUES & ASSESSMENTS, DISC 1, and CPU GTWY terminology",
    scope: EPI_US,
    limitations: ["CPU GTWY and DISC aliases are admitted only for the documented processor context."],
  }),
  externalEvidence("solidgate_visa_processing_integrity_2026", {
    sourceAuthority: "processor_publication",
    title: "New Visa fees: Reduce costs with Solidgate's 2-step flow",
    publisher: "Solidgate",
    sourceUrl: "https://solidgate.com/blog/visa-processing-integrity-program-fees/",
    sourceLocator: "Visa Processing Integrity Program fee family in Europe from July 2023",
    scope: VISA_EU_2023,
    limitations: ["Supports the European Visa fee family and named members; does not establish PROGRAM INTEGRITY FEE as a universal or literal network fee name."],
  }),
  externalEvidence("braintree_ap_digital_commerce_fee_2025", {
    sourceAuthority: "processor_support_documentation",
    title: "2026 Network Updates",
    publisher: "Braintree",
    sourceUrl: "https://developer.paypal.com/braintree/articles/risk-and-security/compliance/network-updates/2026",
    sourceLocator: "Asia-Pacific historical Digital Commerce Fee name introduced July 2025",
    scope: VISA_AP_OLD_DCF,
    limitations: ["Applies only to the listed Asia-Pacific countries and period represented by this scope."],
  }),
  externalEvidence("braintree_ap_digital_commerce_services_fee_2026", {
    sourceAuthority: "processor_support_documentation",
    title: "2026 Network Updates",
    publisher: "Braintree",
    sourceUrl: "https://developer.paypal.com/braintree/articles/risk-and-security/compliance/network-updates/2026",
    sourceLocator: "Asia-Pacific rename to Digital Commerce Services Fee effective April 2026",
    scope: VISA_AP_DCSF,
    limitations: ["Applies only to the listed Asia-Pacific countries and period represented by this scope."],
  }),
  observationEvidence("fiserv_cpu_gtwy_label_observation", "CPU GTWY appears on Fiserv-family statements without a defining legend", FISERV_US),
  observationEvidence("fiserv_regulatory_product_label_observation", "REGULATORY PRODUCT appears on Fiserv-family statements without a defining legend", FISERV_US),
  aiEvidence("ai_program_integrity_research_hypothesis", "PROGRAM INTEGRITY FEE may refer to Visa or Mastercard processing-integrity concepts; network and specific program evidence are required"),
];

const CONCEPTS: FeeSemanticConcept[] = [
  concept("interchange_fee", "Interchange fee", "processor_neutral", [
    alias("alias_interchange", "INTERCHANGE", ["chase_payment_brand_fee_support_2026"]),
    alias("alias_interchange_charges", "INTERCHANGE CHARGES", ["chase_payment_brand_fee_support_2026"]),
  ], [
    assertion("interchange_identity", "identity", "interchange_fee", ["chase_payment_brand_fee_support_2026"]),
    assertion("interchange_ownership", "ownership", "issuer_interchange_system", ["chase_payment_brand_fee_support_2026"]),
  ]),
  concept("network_assessment_fee", "Card-network assessment fee", "processor_neutral", [
    alias("alias_dues_assessments", "DUES & ASSESSMENTS", ["chase_payment_brand_fee_support_2026"]),
  ], [
    assertion("assessment_identity", "identity", "network_assessment_fee", ["chase_payment_brand_fee_support_2026"]),
    assertion("assessment_unit", "assessment_unit", "gross_transaction_amount", ["chase_payment_brand_fee_support_2026"]),
    assertion("assessment_ownership", "ownership", "applicable_card_network", ["chase_payment_brand_fee_support_2026"]),
  ]),
  concept("authorization_service_fee", "Authorization service fee", "processor_neutral", [
    alias("alias_authorization_fee", "AUTHORIZATION FEE", ["chase_payment_brand_fee_support_2026"]),
    alias("alias_network_authorization_fee_generic", "NETWORK AUTHORIZATION FEE", ["chase_payment_brand_fee_support_2026"]),
  ], [
    assertion("authorization_service_identity", "identity", "authorization_service_fee", ["chase_payment_brand_fee_support_2026"]),
    assertion("authorization_service_unit", "assessment_unit", "authorization_event", ["chase_payment_brand_fee_support_2026"]),
  ]),
  concept("address_verification_service_fee", "Address verification service fee", "processor_neutral", [
    alias("alias_avs_fee", "AVS FEE", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"]),
    alias("alias_address_verification_fee", "ADDRESS VERIFICATION FEE", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"]),
    alias("alias_addr_verification_srv_fee", "ADDR VERIFICATION SRV FEE", ["shift4_statement_glossary_2026"]),
  ], [
    assertion("avs_identity", "identity", "address_verification_service_fee", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"]),
    assertion("avs_unit", "assessment_unit", "address_verification_event", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"]),
  ]),
  concept("gateway_service_fee", "Gateway service fee", "processor_neutral", [
    alias("alias_gateway_fee", "GATEWAY FEE", ["electronic_payments_statement_guide"], EPI_US),
  ], [
    assertion("gateway_identity", "identity", "gateway_service_fee", ["electronic_payments_statement_guide"], EPI_US),
  ]),
  concept("processor_percentage_markup", "Processor percentage markup", "processor_specific", [
    alias("alias_epi_disc_1", "DISC 1", ["electronic_payments_statement_guide"], EPI_US),
    alias("alias_epi_disc_6", "DISC 6", ["electronic_payments_statement_guide"], EPI_US),
  ], [
    assertion("epi_discount_identity", "identity", "processor_percentage_markup", ["electronic_payments_statement_guide"], EPI_US),
    assertion("epi_discount_owner", "ownership", "electronic_payments_processor", ["electronic_payments_statement_guide"], EPI_US),
  ]),
  concept("mastercard_network_access_brand_usage", "Mastercard Network Access and Brand Usage", "network_specific", [
    alias("alias_nabu_fees", "NABU FEES", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"], US_MC),
    alias("alias_mc_nabu_auth", "MC NABU AUTH", ["shift4_statement_glossary_2026"], US_MC),
    alias("alias_mc_nabu_returns", "MC NABU RETURNS", ["shift4_statement_glossary_2026"], US_MC),
  ], [
    assertion("nabu_identity", "identity", "mastercard_network_access_brand_usage", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"], US_MC),
    assertion("nabu_unit", "assessment_unit", "authorization_or_refund_record", ["chase_payment_brand_fee_support_2026", "shift4_statement_glossary_2026"], US_MC),
    assertion("nabu_owner", "ownership", "mastercard_network", ["chase_payment_brand_fee_support_2026"], US_MC),
    assertion("nabu_applicability", "applicability", "us_domestic_authorizations_and_refunds", ["chase_payment_brand_fee_support_2026"], US_MC),
  ]),
  concept("visa_acquirer_processing_fee", "Visa Acquirer Processing Fee", "network_specific", [
    alias("alias_acqr_processor_fees", "ACQR PROCESSOR FEES", ["first_financial_interchange_fee_guide"], US_VISA),
    alias("alias_network_acquirer_processing_fee", "NETWORK ACQUIRER PROCESSING FEE", ["chase_payment_brand_fee_support_2026"], US_VISA),
    alias("alias_napf", "NAPF", ["chase_payment_brand_fee_support_2026"], US_VISA),
  ], [
    assertion("visa_apf_identity", "identity", "visa_acquirer_processing_fee", ["first_financial_interchange_fee_guide", "chase_payment_brand_fee_support_2026"], US_VISA),
    assertion("visa_apf_unit", "assessment_unit", "authorization_event", ["first_financial_interchange_fee_guide"], US_VISA),
    assertion("visa_apf_owner", "ownership", "visa_network", ["chase_payment_brand_fee_support_2026"], US_VISA),
    assertion("visa_apf_applicability", "applicability", "us_acquired_credit_authorizations", ["first_financial_interchange_fee_guide"], US_VISA),
  ]),
  concept("visa_transaction_integrity_fee", "Visa Transaction Integrity Fee", "network_specific", [
    alias("alias_visa_trans_integrity", "VISA TRANS INTEGRITY FEE", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
    alias("alias_tran_integrity_fee", "TRAN INTEGRITY FEE", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
    alias("alias_vi_transaction_integrity_fee", "VI TRANSACTION INTEGRITY FEE", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
  ], [
    assertion("visa_tif_identity", "identity", "visa_transaction_integrity_fee", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
    assertion("visa_tif_unit", "assessment_unit", "nonqualifying_debit_or_prepaid_transaction", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
    assertion("visa_tif_owner", "ownership", "visa_network", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
    assertion("visa_tif_applicability", "applicability", "visa_debit_or_prepaid_cps_nonqualification", ["first_financial_interchange_fee_guide", "visa_partial_authorization_service_2017"], US_VISA),
  ]),
  concept("visa_processing_integrity_fee_family", "Visa processing integrity fee family", "network_specific", [
    alias("alias_visa_processing_integrity_fees", "VISA PROCESSING INTEGRITY FEES", ["visa_authorization_reversal_requirements_2024", "visa_split_shipment_processing_2020"], US_VISA),
    alias("alias_processing_integrity_program_fees_eu", "PROCESSING INTEGRITY PROGRAM FEES", ["solidgate_visa_processing_integrity_2026"], VISA_EU_2023),
    alias("candidate_program_integrity_fee_visa", "PROGRAM INTEGRITY FEE", ["solidgate_visa_processing_integrity_2026", "visa_authorization_reversal_requirements_2024", "ai_program_integrity_research_hypothesis"], emptyFeeSemanticScope({ networkIds: ["visa"] }), "candidate"),
  ], [
    assertion("visa_processing_integrity_family_identity_us", "identity", "visa_processing_integrity_fee_family", ["visa_authorization_reversal_requirements_2024", "visa_split_shipment_processing_2020"], US_VISA),
    assertion("visa_processing_integrity_family_identity_eu", "identity", "visa_processing_integrity_fee_family", ["solidgate_visa_processing_integrity_2026"], VISA_EU_2023),
    assertion("visa_processing_integrity_family_owner", "ownership", "visa_network", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_processing_integrity_family_applicability", "applicability", "authorization_reversal_or_clearing_noncompliance", ["visa_authorization_reversal_requirements_2024", "visa_split_shipment_processing_2020"], US_VISA),
  ]),
  concept("visa_misuse_of_authorization_system_fee", "Visa Misuse of Authorization System Fee", "network_specific", [
    alias("alias_misuse_authorization_system_fee", "MISUSE OF AUTHORIZATION SYSTEM FEE", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    alias("alias_misuse_auth_fees", "MISUSE AUTH FEES", ["first_financial_interchange_fee_guide"], US_VISA),
  ], [
    assertion("visa_misuse_identity", "identity", "visa_misuse_of_authorization_system_fee", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_misuse_unit", "assessment_unit", "unmatched_authorization", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_misuse_owner", "ownership", "visa_network", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_misuse_applicability", "applicability", "authorization_not_matched_to_clearing_or_reversal", ["visa_authorization_reversal_requirements_2024"], US_VISA),
  ]),
  concept("visa_unmatched_clearing_fee", "Visa Unmatched Clearing Fee", "network_specific", [
    alias("alias_unmatched_clearing_fee", "UNMATCHED CLEARING FEE", ["visa_authorization_reversal_requirements_2024"], US_VISA),
  ], [
    assertion("visa_unmatched_clearing_identity", "identity", "visa_unmatched_clearing_fee", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_unmatched_clearing_unit", "assessment_unit", "unmatched_clearing_transaction", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_unmatched_clearing_owner", "ownership", "visa_network", ["visa_authorization_reversal_requirements_2024"], US_VISA),
    assertion("visa_unmatched_clearing_applicability", "applicability", "clearing_not_matched_to_authorization", ["visa_authorization_reversal_requirements_2024"], US_VISA),
  ]),
  concept("visa_zero_floor_limit_fee", "Visa Zero Floor Limit Fee", "network_specific", [
    alias("alias_zero_floor_fees", "ZERO FLOOR FEES", ["first_financial_interchange_fee_guide"], US_VISA),
    alias("alias_zero_floor_limit_fee", "ZERO FLOOR LIMIT FEE", ["first_financial_interchange_fee_guide"], US_VISA),
  ], [
    assertion("visa_zero_floor_identity", "identity", "visa_zero_floor_limit_fee", ["first_financial_interchange_fee_guide"], US_VISA),
    assertion("visa_zero_floor_unit", "assessment_unit", "cleared_transaction_without_proper_authorization", ["first_financial_interchange_fee_guide"], US_VISA),
    assertion("visa_zero_floor_owner", "ownership", "visa_network", ["first_financial_interchange_fee_guide"], US_VISA),
    assertion("visa_zero_floor_applicability", "applicability", "clearing_without_matched_approved_or_partially_approved_authorization", ["first_financial_interchange_fee_guide"], US_VISA),
  ]),
  concept("mastercard_processing_integrity_fee_family", "Mastercard processing integrity fee family", "network_specific", [
    alias("alias_mc_processing_integrity", "MC PROCESSING INTEGRITY", ["chase_payment_brand_fee_support_2026", "first_financial_interchange_fee_guide"], US_MC),
    alias("alias_mc_integrity_fee", "MC INTEGRITY FEE", ["shift4_statement_glossary_2026"], US_MC),
    alias("candidate_program_integrity_fee_mastercard", "PROGRAM INTEGRITY FEE", ["chase_payment_brand_fee_support_2026", "first_financial_interchange_fee_guide", "ai_program_integrity_research_hypothesis"], US_MC, "candidate"),
  ], [
    assertion("mc_processing_integrity_identity", "identity", "mastercard_processing_integrity_fee_family", ["chase_payment_brand_fee_support_2026", "first_financial_interchange_fee_guide"], US_MC),
    assertion("mc_processing_integrity_owner", "ownership", "mastercard_network", ["chase_payment_brand_fee_support_2026"], US_MC),
    assertion("mc_processing_integrity_applicability", "applicability", "authorization_timeliness_reversal_or_clearing_condition", ["chase_payment_brand_fee_support_2026", "first_financial_interchange_fee_guide"], US_MC),
  ]),
  concept("discover_data_usage_fee", "Discover Data Usage Fee", "network_specific", [
    alias("alias_dscv_data_usage_fee", "DSCV DATA USAGE FEE", ["first_financial_interchange_fee_guide", "shift4_statement_glossary_2026"], US_DISCOVER),
    alias("alias_discover_data_usage_fee", "DISCOVER DATA USAGE FEE", ["shift4_statement_glossary_2026"], US_DISCOVER),
  ], [
    assertion("discover_data_usage_identity", "identity", "discover_data_usage_fee", ["first_financial_interchange_fee_guide", "shift4_statement_glossary_2026"], US_DISCOVER),
    assertion("discover_data_usage_unit", "assessment_unit", "us_authorization_transaction", ["first_financial_interchange_fee_guide", "shift4_statement_glossary_2026"], US_DISCOVER),
    assertion("discover_data_usage_owner", "ownership", "discover_network", ["shift4_statement_glossary_2026"], US_DISCOVER),
  ]),
  concept("discover_network_authorization_fee", "Discover Network Authorization Fee", "network_specific", [
    alias("alias_dscv_auth_fee", "DSCV AUTH FEE", ["first_financial_interchange_fee_guide"], US_DISCOVER),
    alias("alias_discover_network_authorization_fee", "DISCOVER NETWORK AUTHORIZATION FEE", ["shift4_statement_glossary_2026"], US_DISCOVER),
  ], [
    assertion("discover_auth_identity", "identity", "discover_network_authorization_fee", ["first_financial_interchange_fee_guide", "shift4_statement_glossary_2026"], US_DISCOVER),
    assertion("discover_auth_unit", "assessment_unit", "discover_network_authorization", ["first_financial_interchange_fee_guide", "shift4_statement_glossary_2026"], US_DISCOVER),
    assertion("discover_auth_owner", "ownership", "discover_network", ["shift4_statement_glossary_2026"], US_DISCOVER),
  ]),
  concept("american_express_program_continuation_fee", "American Express Program Continuation Fee", "network_specific", [
    alias("alias_am_pgrm_cont_fee", "AM PGRM CONT FEE", ["shift4_statement_glossary_2026"], US_AMEX),
  ], [
    assertion("amex_program_continuation_identity", "identity", "american_express_program_continuation_fee", ["shift4_statement_glossary_2026"], US_AMEX),
    assertion("amex_program_continuation_unit", "assessment_unit", "american_express_charge", ["shift4_statement_glossary_2026"], US_AMEX),
    assertion("amex_program_continuation_owner", "ownership", "american_express_network", ["shift4_statement_glossary_2026"], US_AMEX),
  ]),
  concept("visa_digital_commerce_services_fee", "Visa Digital Commerce Services Fee", "network_specific", [
    alias("alias_digital_commerce_fee_historical", "DIGITAL COMMERCE FEE", ["braintree_ap_digital_commerce_fee_2025"], VISA_AP_OLD_DCF),
    alias("alias_digital_commerce_services_fee", "DIGITAL COMMERCE SERVICES FEE", ["braintree_ap_digital_commerce_services_fee_2026"], VISA_AP_DCSF),
    alias("alias_dcsf", "DCSF", ["braintree_ap_digital_commerce_services_fee_2026"], VISA_AP_DCSF),
  ], [
    assertion("visa_dcf_identity_historical", "identity", "visa_digital_commerce_services_fee", ["braintree_ap_digital_commerce_fee_2025"], VISA_AP_OLD_DCF),
    assertion("visa_dcsf_identity_current", "identity", "visa_digital_commerce_services_fee", ["braintree_ap_digital_commerce_services_fee_2026"], VISA_AP_DCSF),
    assertion("visa_dcsf_owner_current", "ownership", "visa_network", ["braintree_ap_digital_commerce_services_fee_2026"], VISA_AP_DCSF),
    assertion("visa_dcsf_applicability_current", "applicability", "ap_digital_commerce_services_bundle", ["braintree_ap_digital_commerce_services_fee_2026"], VISA_AP_DCSF),
  ]),
  concept("electronic_payments_cpu_gateway_authorization", "Electronic Payments CPU/gateway authorization fee", "processor_specific", [
    alias("alias_epi_cpu_gtwy", "CPU GTWY", ["electronic_payments_statement_guide"], EPI_US),
    alias("candidate_fiserv_cpu_gtwy", "CPU GTWY", ["fiserv_cpu_gtwy_label_observation"], FISERV_US, "candidate"),
  ], [
    assertion("epi_cpu_gtwy_identity", "identity", "electronic_payments_cpu_gateway_authorization", ["electronic_payments_statement_guide"], EPI_US),
    assertion("epi_cpu_gtwy_unit", "assessment_unit", "authorization_request", ["electronic_payments_statement_guide"], EPI_US),
  ]),
  concept("unresolved_regulatory_product", "Unresolved Regulatory Product label", "proprietary", [
    alias("candidate_regulatory_product", "REGULATORY PRODUCT", ["fiserv_regulatory_product_label_observation"], FISERV_US, "candidate"),
  ], [
    assertion("candidate_regulatory_product_identity", "identity", "unresolved_regulatory_product", ["fiserv_regulatory_product_label_observation"], FISERV_US, "candidate", ["Processor or ISO documentation is required before admission."]),
  ]),
];

const BASE_CATALOG: FeeSemanticCatalog = {
  modelVersion: FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
  catalogVersion: QUALIFIED_FEE_SEMANTICS_SEED_CATALOG_VERSION,
  evidence: EVIDENCE,
  concepts: CONCEPTS,
};

const HISTORICAL_SUBJECTS = new Set(["alias_digital_commerce_fee_historical", "visa_dcf_identity_historical"]);
const REJECTED_SUBJECTS = new Set([
  "candidate_program_integrity_fee_visa",
  "candidate_program_integrity_fee_mastercard",
  "candidate_fiserv_cpu_gtwy",
  "candidate_regulatory_product",
  "candidate_regulatory_product_identity",
]);

const ADMITTED_SUBJECTS = new Set<string>([
  ...CONCEPTS.filter((item) => item.aliases.some((aliasItem) => aliasItem.status === "admitted") || item.assertions.some((assertionItem) => assertionItem.status === "admitted")).map((item) => item.conceptId),
  ...CONCEPTS.flatMap((item) => item.aliases.filter((aliasItem) => aliasItem.status === "admitted").map((aliasItem) => aliasItem.aliasId)),
  ...CONCEPTS.flatMap((item) => item.assertions.filter((assertionItem) => assertionItem.status === "admitted").map((assertionItem) => assertionItem.assertionId)),
]);

function sourceSnapshots(): FeeSemanticSourceSnapshot[] {
  return EVIDENCE.map((item) => {
    const historical = item.evidenceId === "braintree_ap_digital_commerce_fee_2025";
    const current = item.evidenceId === "braintree_ap_digital_commerce_services_fee_2026";
    return {
      snapshotId: `snapshot_${item.evidenceId}`,
      evidenceRef: item.evidenceId,
      catalogVersion: QUALIFIED_FEE_SEMANTICS_SEED_CATALOG_VERSION,
      lifecycle: historical ? "superseded" : "active",
      qualificationDecision: item.qualification === "qualified" ? "qualified" : "candidate",
      fingerprintAlgorithm: "sha256",
      fingerprintScope: "qualified_claim_packet",
      fingerprint: feeSemanticClaimPacketFingerprint(item),
      capturedAt: REVIEWED_AT,
      reviewedAt: item.qualification === "qualified" ? REVIEWED_AT : null,
      reviewDueAt: item.qualification === "qualified" ? REVIEW_DUE : null,
      reviewerRole: item.qualification === "qualified" ? "payments_domain_reviewer" : null,
      reviewerRef: item.qualification === "qualified" ? REVIEWER_REF : null,
      supersedesSnapshotRefs: current ? ["snapshot_braintree_ap_digital_commerce_fee_2025"] : [],
      supersededBySnapshotRef: historical ? "snapshot_braintree_ap_digital_commerce_services_fee_2026" : null,
    };
  });
}

function subjectEvidenceRefs(subjectRef: string): string[] {
  for (const item of CONCEPTS) {
    if (item.conceptId === subjectRef) return [...new Set([...item.aliases, ...item.assertions].filter((child) => child.status === "admitted").flatMap((child) => child.evidenceRefs))].sort();
    const aliasItem = item.aliases.find((child) => child.aliasId === subjectRef);
    if (aliasItem) return [...aliasItem.evidenceRefs].sort();
    const assertionItem = item.assertions.find((child) => child.assertionId === subjectRef);
    if (assertionItem) return [...assertionItem.evidenceRefs].sort();
  }
  return [];
}

function subjectType(subjectRef: string): FeeSemanticAdmissionRecord["subjectType"] {
  if (CONCEPTS.some((item) => item.conceptId === subjectRef)) return "concept";
  if (CONCEPTS.some((item) => item.aliases.some((child) => child.aliasId === subjectRef))) return "alias";
  return "assertion";
}

function admissions(): FeeSemanticAdmissionRecord[] {
  const records: FeeSemanticAdmissionRecord[] = [];
  for (const subjectRef of [...ADMITTED_SUBJECTS].sort()) {
    const historical = HISTORICAL_SUBJECTS.has(subjectRef);
    const isCurrentAlias = subjectRef === "alias_digital_commerce_services_fee";
    const isCurrentIdentity = subjectRef === "visa_dcsf_identity_current";
    const predecessor = isCurrentAlias ? "admission_alias_digital_commerce_fee_historical" : isCurrentIdentity ? "admission_visa_dcf_identity_historical" : null;
    const successor = subjectRef === "alias_digital_commerce_fee_historical" ? "admission_alias_digital_commerce_services_fee" : subjectRef === "visa_dcf_identity_historical" ? "admission_visa_dcsf_identity_current" : null;
    records.push({
      admissionId: `admission_${subjectRef}`,
      catalogVersion: QUALIFIED_FEE_SEMANTICS_SEED_CATALOG_VERSION,
      subjectType: subjectType(subjectRef),
      subjectRef,
      lifecycle: historical ? "historical" : "active",
      reviewerRole: "payments_domain_reviewer",
      reviewerRef: REVIEWER_REF,
      decidedAt: REVIEWED_AT,
      sourceSnapshotRefs: subjectEvidenceRefs(subjectRef).filter((ref) => EVIDENCE.find((item) => item.evidenceId === ref)?.qualification === "qualified").map((ref) => `snapshot_${ref}`),
      supersedesAdmissionRefs: predecessor ? [predecessor] : [],
      supersededByAdmissionRef: successor,
      reasonCodes: [historical ? "fee_semantics_historical_alias_retained_for_period" : "fee_semantics_claim_specifically_reviewed_and_admitted"],
    });
  }
  for (const subjectRef of [...REJECTED_SUBJECTS].sort()) {
    records.push({
      admissionId: `admission_${subjectRef}`,
      catalogVersion: QUALIFIED_FEE_SEMANTICS_SEED_CATALOG_VERSION,
      subjectType: subjectType(subjectRef),
      subjectRef,
      lifecycle: "rejected",
      reviewerRole: "payments_domain_reviewer",
      reviewerRef: REVIEWER_REF,
      decidedAt: REVIEWED_AT,
      sourceSnapshotRefs: subjectEvidenceRefs(subjectRef).map((ref) => `snapshot_${ref}`),
      supersedesAdmissionRefs: [],
      supersededByAdmissionRef: null,
      reasonCodes: [subjectRef.includes("program_integrity")
        ? "program_integrity_literal_alias_not_established_and_network_ambiguous"
        : "candidate_evidence_does_not_establish_reusable_identity"],
    });
  }
  return records;
}

function auditTrail(snapshots: FeeSemanticSourceSnapshot[], admissionRecords: FeeSemanticAdmissionRecord[]): FeeSemanticCatalogAuditEvent[] {
  return [
    ...snapshots.map((item): FeeSemanticCatalogAuditEvent => ({
      auditEventId: `audit_${item.snapshotId}`,
      policyVersion: QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
      eventType: "source_captured",
      subjectRef: item.evidenceRef,
      admissionRef: null,
      sourceSnapshotRefs: [item.snapshotId],
      occurredAt: REVIEWED_AT,
      reviewerRole: item.reviewerRole,
      reviewerRef: item.reviewerRef,
      reasonCodes: [item.qualificationDecision === "qualified" ? "source_claim_packet_reviewed" : "candidate_source_preserved_without_admission"],
    })),
    ...admissionRecords.map((item): FeeSemanticCatalogAuditEvent => ({
      auditEventId: `audit_${item.admissionId}`,
      policyVersion: QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
      eventType: item.lifecycle === "rejected" ? "knowledge_rejected" : item.lifecycle === "historical" ? "knowledge_retained_historically" : "knowledge_admitted",
      subjectRef: item.subjectRef,
      admissionRef: item.admissionId,
      sourceSnapshotRefs: [...item.sourceSnapshotRefs],
      occurredAt: item.decidedAt,
      reviewerRole: item.reviewerRole,
      reviewerRef: item.reviewerRef,
      reasonCodes: [...item.reasonCodes],
    })),
  ];
}

const SNAPSHOTS = sourceSnapshots();
const ADMISSIONS = admissions();

export const QUALIFIED_FEE_SEMANTICS_SEED_V1: QualifiedFeeSemanticCatalog = createQualifiedFeeSemanticCatalog({
  schemaVersion: QUALIFIED_FEE_SEMANTICS_CATALOG_SCHEMA_VERSION,
  governancePolicyVersion: QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
  catalog: BASE_CATALOG,
  sourceSnapshots: SNAPSHOTS,
  admissions: ADMISSIONS,
  auditTrail: auditTrail(SNAPSHOTS, ADMISSIONS),
});
