import { createPublicSourceAuthorityAdmission, validatePublicSourceAuthorityAdmissions } from "./sourceAuthority.js";
import type { PublicSourceAuthorityAdmission } from "./intelligenceTypes.js";

export const FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL =
  "https://merchants.fiserv.com/content/dam/firstdata/us/en/documents/pdf/How_to_Read_Your_statement_swipe_Non_swipe.pdf";

export const FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256 =
  "9c3bf4ca1ff9440d73fce523608cb5b524b021a652da35a3aa64f59e34610617";

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

export const PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS: readonly PublicSourceAuthorityAdmission[] = Object.freeze([
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
]);

validatePublicSourceAuthorityAdmissions(PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS);
