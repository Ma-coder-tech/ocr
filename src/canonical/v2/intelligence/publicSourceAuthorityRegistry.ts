import { createPublicSourceAuthorityAdmission, validatePublicSourceAuthorityAdmissions } from "./sourceAuthority.js";
import type { PublicSourceAuthorityAdmission } from "./intelligenceTypes.js";

export const FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL =
  "https://merchants.fiserv.com/content/dam/firstdata/us/en/documents/pdf/How_to_Read_Your_statement_swipe_Non_swipe.pdf";

export const FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256 =
  "9c3bf4ca1ff9440d73fce523608cb5b524b021a652da35a3aa64f59e34610617";

export const FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_URL =
  "https://support.cardpointe.com/content/dam/firstdata/cardpointe/en/support-center/pages/understanding-interchange/22.1-Pass-Through-Fee-Schedule-Spring-2022.pdf";

export const FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_SHA256 =
  "c6dd0ba734f25727f294c980fb25fdc320761f4a97bb512a1eac2ee75e69feba";

export const FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION = createPublicSourceAuthorityAdmission({
  admissionId: "fiserv_first_data_us_swipe_non_swipe_statement_guide_v1",
  admissionVersion: 1,
  authority: "processor_publication",
  origin: "https://merchants.fiserv.com",
  publicationFamilyCode: "first_data_us_swipe_non_swipe_statement_guide",
  publicationMetadata: {
    title: "How to Read Your Statement - Swipe Non-Swipe",
    version: null,
    publicationDate: null,
    samplePeriodStart: "2018-05-01",
    samplePeriodEnd: "2018-05-31",
    effectiveFrom: null,
    effectiveTo: null,
    periodApplicabilityPolicy: "historical_example_only",
    retrievalVerifiedOn: "2026-08-24",
    provenanceUrls: ["https://merchants.fiserv.com/en-us/customer-center/merchants/frequent-support-topics/"],
  },
  pathMatchMode: "exact_document",
  maximumEvidentiaryScope: "terminology_example_presentation_only",
  allowedClaimTypes: ["processor_term"],
  allowedEvidenceClasses: ["official_processor_terminology"],
  allowedSourceTypeCodes: ["official_processor_terminology"],
  allowedSubjectCodes: ["non_swiped_discount_terminology"],
  allowedProcessorPrograms: ["fiserv_first_data"],
  allowedGeographyCodes: ["us"],
  allowedPathPrefixes: [new URL(FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL).pathname],
  approvedDocumentFingerprints: [FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256],
});

export const FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_ADMISSION = createPublicSourceAuthorityAdmission({
  admissionId: "fiserv_cardpointe_card_organization_pass_through_fee_schedule_april_2022_v1",
  admissionVersion: 1,
  authority: "processor_publication",
  origin: "https://support.cardpointe.com",
  publicationFamilyCode: "fiserv_cardpointe_card_organization_pass_through_fee_schedule",
  publicationMetadata: {
    title: "Card Organization Pass-Through Fee Schedule",
    version: null,
    publicationDate: null,
    samplePeriodStart: "2022-04-01",
    samplePeriodEnd: "2022-04-30",
    effectiveFrom: null,
    effectiveTo: null,
    periodApplicabilityPolicy: "historical_example_only",
    retrievalVerifiedOn: "2026-08-25",
    provenanceUrls: [FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_URL],
  },
  pathMatchMode: "exact_document",
  maximumEvidentiaryScope: "historical_processor_presentation_only",
  allowedClaimTypes: ["processor_term"],
  allowedEvidenceClasses: ["official_processor_terminology"],
  allowedSourceTypeCodes: ["official_processor_terminology"],
  allowedSubjectCodes: [
    "fiserv_discover_data_usage_fee_historical_presentation",
    "fiserv_discover_network_authorization_fee_historical_presentation",
    "fiserv_multi_network_assessment_fee_historical_presentation",
    "fiserv_visa_transaction_integrity_fee_historical_presentation",
  ],
  allowedProcessorPrograms: ["fiserv_first_data"],
  allowedGeographyCodes: ["us"],
  allowedPathPrefixes: [new URL(FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_URL).pathname],
  approvedDocumentFingerprints: [FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_SHA256],
});

export const PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS: readonly PublicSourceAuthorityAdmission[] = Object.freeze([
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
  FISERV_CARDPOINTE_PASS_THROUGH_FEE_SCHEDULE_APRIL_2022_ADMISSION,
]);

validatePublicSourceAuthorityAdmissions(PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS);
