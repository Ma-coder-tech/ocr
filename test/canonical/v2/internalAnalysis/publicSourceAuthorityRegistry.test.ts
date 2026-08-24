import { describe, expect, it } from "vitest";
import {
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256,
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
  PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS,
  authorityAdmissionForCandidate,
  createPublicSourceAuthorityAdmission,
  knownExactDocumentCandidatesForQuestion,
  safePublicSearchQuery,
  verifyRetrievedDocumentAuthority,
  type DiscoveryCandidate,
  type RuntimeResearchQuestion,
} from "../../../../src/canonical/v2/index.js";

const exactPath = new URL(FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL).pathname;

function question(subjectCode = "non_swiped_discount_terminology", overrides: Partial<RuntimeResearchQuestion> = {}): RuntimeResearchQuestion {
  const scope = { tenantRef: "tenant-test", accountRef: "account-test", processor: "fiserv_family", processorProgram: "fiserv_first_data",
    region: "us", jurisdiction: "us" };
  return {
    questionId: `question-${subjectCode}`, claimType: "processor_term", subjectCode, originatingUnknownRef: `unknown-${subjectCode}`,
    originatingDependencyRefs: [], originatingThemeRefs: [], relatedCanonicalRefs: ["statement-observation"], scope, asOf: "2024-06-30",
    requiredSourceAuthorities: ["processor_publication"], requiredEvidenceClasses: ["official_processor_terminology"], materiality: "material",
    blockingEffect: "limits_authority", priority: "material_operational_action", reportDecisionCode: `${subjectCode}_review`,
    possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"], publicResearchPlausible: true,
    rfResolution: { status: "unresolved_no_admitted_knowledge", claimType: "processor_term", subjectCode, value: null,
      selectedEntryRefs: [], corroboratingEntryRefs: [], rejectedCounts: {}, conflictEntryCount: 0, asOf: "2024-06-30", scope,
      sourceAuthorities: [] }, eligibility: "eligible", selection: "selected", reasonCodes: [], limitations: [], ...overrides,
  };
}

function candidate(url = FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL, overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return { candidateId: "candidate", questionId: "question-non_swiped_discount_terminology", attemptId: "attempt", url,
    title: "How to Read Your Statement - Swipe Non-Swipe", claimedAuthority: "processor_publication",
    sourceTypeCode: "official_processor_terminology", rank: 999, publicationDate: null, effectiveFrom: null, effectiveTo: null,
    locatorHint: "Non swiped discount", selectionReasonCode: "provider_discovery_only",
    discoveryMetadata: { providerCode: "search_provider", configurationCode: "bounded_search_v1",
      sourceDomain: new URL(url).hostname, providerRank: 999, providerSnippetUsedAsEvidence: false },
    retrievalEligibility: "wrong_authority", authorityAdmissionRef: null, authorityPublicationFamilyCode: null, ...overrides };
}

describe("production public-source authority registry", () => {
  it("generates a deterministic retrieval candidate only for the exact admitted Non-Swiped question", () => {
    const nonSwiped = question();
    const known = knownExactDocumentCandidatesForQuestion({ question: nonSwiped,
      admissions: PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS });
    expect(known).toHaveLength(1);
    expect(known[0]).toMatchObject({ url: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
      selectionReasonCode: "known_exact_authority_admission", retrievalEligibility: "eligible",
      authorityAdmissionRef: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION.admissionId,
      discoveryMetadata: { providerCode: "rate_reveal_authority_registry", configurationCode: "known_exact_document_v1",
        providerSnippetUsedAsEvidence: false } });
    expect(knownExactDocumentCandidatesForQuestion({ question: question("application_fee_terminology"),
      admissions: PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS })).toEqual([]);
  });

  it("constructs natural public queries from safe 2024 context without private statement data or expected answers", () => {
    const application = question("application_fee_terminology");
    const context = { schemaVersion: "provider_safe_question_context_v1" as const,
      providerContextId: "provider-context-00000000-0000-4000-8000-000000000000",
      questionClass: "application_fee_public_definition", claimType: "processor_term" as const,
      subjectCode: "application_fee_terminology", safeResearchLabel: "application fee",
      questionText: "Does an eligible authoritative public source define application fee terminology?",
      processorProgram: "fiserv_first_data", periodYear: "2024", allowedContext: "public_product_terminology_only" as const };
    const initial = safePublicSearchQuery({ question: application, context, kind: "initial" });
    const adaptive = safePublicSearchQuery({ question: application, context, kind: "adaptive" });
    expect(initial.queryText).toBe("application fee Fiserv First Data payment processing official documentation United States 2024 definition");
    expect(adaptive.queryText).toBe("application fee Fiserv First Data payment processing public support guide fee schedule terminology United States 2024");
    expect(initial.queryText).not.toMatch(/application_fee|tenant|account|merchant|statement|\.pdf|official_definition_found/i);
    expect(adaptive.queryText).not.toBe(initial.queryText);
  });

  it("contains one exact-document Non-Swiped admission and no Application Fee admission", () => {
    expect(PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS).toEqual([FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION]);
    expect(FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION).toMatchObject({
      admissionId: "fiserv_first_data_us_swipe_non_swipe_statement_guide_v1", admissionVersion: 1,
      origin: "https://merchants.fiserv.com", publicationFamilyCode: "first_data_us_swipe_non_swipe_statement_guide",
      pathMatchMode: "exact_document", maximumEvidentiaryScope: "terminology_example_presentation_only",
      allowedSubjectCodes: ["non_swiped_discount_terminology"], allowedProcessorPrograms: ["fiserv_first_data"],
      allowedGeographyCodes: ["us"], allowedPathPrefixes: [exactPath],
      approvedDocumentFingerprints: [FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256],
      publicationMetadata: { title: "How to Read Your Statement - Swipe Non-Swipe", version: null, publicationDate: null,
        samplePeriodStart: "2018-05-01", samplePeriodEnd: "2018-05-31", effectiveFrom: null, effectiveTo: null,
        periodApplicabilityPolicy: "historical_example_only", retrievalVerifiedOn: "2026-08-24" },
    });
    expect(PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS.some((item) => item.allowedSubjectCodes.includes("application_fee_terminology"))).toBe(false);
  });

  it("admits only the exact US path, claim, subject, program, source type, and geography regardless of rank", () => {
    const exact = candidate(); const nonSwiped = question();
    expect(authorityAdmissionForCandidate({ candidate: exact, question: nonSwiped,
      admissions: PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS })?.admissionId).toBe(FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION.admissionId);
    const rejected: Array<[DiscoveryCandidate, RuntimeResearchQuestion]> = [
      [candidate("https://merchants.fiserv.com/content/dam/firstdata/us/en/documents/pdf/How_To_Read_Your_Statement_Interchange_Plus_Pricing.pdf"), nonSwiped],
      [candidate("https://merchants.fiserv.com/content/dam/firstdata/ca/en/pdf/CA-Merchant-Terms.pdf"), nonSwiped],
      [candidate("https://merchants.fiserv.com/content/dam/firstdata/au/en/documents/FDMSA_Merchant_Agreement_General_Terms_PDF.pdf"), nonSwiped],
      [candidate("https://merchants.fiserv.com/en-us/customer-center/merchants/frequent-support-topics/"), nonSwiped],
      [candidate(`${FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL}/child`), nonSwiped],
      [exact, question("application_fee_terminology")],
      [exact, question("non_swiped_discount_terminology", { scope: { ...nonSwiped.scope, processorProgram: "different_program" } })],
      [exact, question("non_swiped_discount_terminology", { scope: { ...nonSwiped.scope, region: "ca", jurisdiction: "ca" } })],
      [{ ...exact, claimedAuthority: "official_network_publication" }, nonSwiped],
      [{ ...exact, sourceTypeCode: "generic_marketing" }, nonSwiped],
    ];
    for (const [source, researchQuestion] of rejected) {
      expect(authorityAdmissionForCandidate({ candidate: source, question: researchQuestion,
        admissions: PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS })).toBeNull();
    }
  });

  it("requires the independently retrieved final document to retain the exact path and approved fingerprint", () => {
    const exact = candidate(); const nonSwiped = question();
    expect(verifyRetrievedDocumentAuthority({ admission: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
      candidate: exact, question: nonSwiped, finalUrl: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
      documentFingerprint: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256 })).toEqual({
      eligible: true, reasonCode: "source_authority_retrieved_document_verified",
    });
    expect(verifyRetrievedDocumentAuthority({ admission: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
      candidate: exact, question: nonSwiped, finalUrl: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
      documentFingerprint: "0".repeat(64) })).toEqual({
      eligible: false, reasonCode: "source_authority_document_fingerprint_mismatch",
    });
    expect(verifyRetrievedDocumentAuthority({ admission: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
      candidate: exact, question: nonSwiped, finalUrl: "https://merchants.fiserv.com/en-us/features/payments-101-glossary/",
      documentFingerprint: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_SHA256 })).toEqual({
      eligible: false, reasonCode: "source_authority_final_document_mismatch",
    });
  });

  it("rejects exact-document schema entries without a fingerprint, explicit geography, or exact path", () => {
    for (const invalid of [
      { approvedDocumentFingerprints: [] },
      { allowedGeographyCodes: [] },
      { allowedPathPrefixes: ["/content/dam/firstdata/us/en/documents/pdf/*"] },
      { publicationMetadata: { ...FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION.publicationMetadata,
        periodApplicabilityPolicy: "documented_effective_period" as const, effectiveFrom: null, effectiveTo: null } },
    ]) {
      expect(() => createPublicSourceAuthorityAdmission({ ...FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION, ...invalid })).toThrow("invalid_public_source_authority_admission");
    }
  });

  it("keeps path-family matching explicit and bounded when that separate mode is selected", () => {
    const family = createPublicSourceAuthorityAdmission({
      ...FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_ADMISSION,
      admissionId: "bounded_path_family_test",
      pathMatchMode: "path_family",
      allowedPathPrefixes: ["/content/dam/firstdata/us/en/documents/pdf"],
      approvedDocumentFingerprints: [],
    });
    expect(authorityAdmissionForCandidate({ candidate: candidate(), question: question(), admissions: [family] })).toBe(family);
    expect(authorityAdmissionForCandidate({
      candidate: candidate("https://merchants.fiserv.com/content/dam/firstdata/us/en/documents/other/guide.pdf"),
      question: question(), admissions: [family],
    })).toBeNull();
  });

  it("rejects plausible Application Fee sources because no production admission exists", () => {
    const application = question("application_fee_terminology");
    for (const url of [
      "https://www.paysafe.com/us-en/merchant-welcome-portal/faqs/",
      "https://docs.stripe.com/api/application_fees",
      "https://www.sec.gov/Archives/edgar/data/896429/000162828020009890/a20200331-exx101.htm",
      "https://merchants.fiserv.com/content/dam/firstdata/au/en/documents/FDMSA_Merchant_Agreement_General_Terms_PDF.pdf",
      "https://merchants.fiserv.com/en-us/features/payments-101-glossary/",
      "https://example.com/blog/application-fee",
    ]) {
      expect(authorityAdmissionForCandidate({ candidate: candidate(url, { questionId: application.questionId, rank: 1,
        discoveryMetadata: { providerCode: "search_provider", configurationCode: "bounded_search_v1", sourceDomain: new URL(url).hostname,
          providerRank: 1, providerSnippetUsedAsEvidence: false } }), question: application,
      admissions: PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS })).toBeNull();
    }
  });
});
