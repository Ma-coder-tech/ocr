import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FISERV_OBSERVATION_SUBJECT_RULES,
  extractPublicDocument,
  enforceProcessorPresentationSemanticCoverage,
  processorPresentationLocatorTargets,
  registryRuleForSubject,
  type CandidateClaimSupport,
  type ExtractedLocator,
  type RuntimeResearchQuestion,
} from "../../../../src/canonical/v2/index.js";

const assessmentSubject = "fiserv_multi_network_assessment_fee_historical_presentation";

function locator(locatorId: string, page: number, text: string): ExtractedLocator {
  return { locatorId, documentId: "document-fiserv-2022", documentFingerprint: "f".repeat(64), page,
    sectionCode: "pdf_page", lineStart: page, lineEnd: page, text };
}

function question(subjectCode = assessmentSubject): RuntimeResearchQuestion {
  return { questionId: `question-${subjectCode}`, subjectCode } as RuntimeResearchQuestion;
}

function support(itemId: string): CandidateClaimSupport {
  return {
    itemId, supportId: `support-${itemId}`, questionId: `question-${assessmentSubject}`, claimType: "processor_term",
    subjectCode: assessmentSubject, candidateId: "candidate-fiserv-2022", documentId: "document-fiserv-2022",
    locatorId: `locator-${itemId}`, documentFingerprint: "f".repeat(64), investigativeObservationId: itemId,
    sourceAuthority: "processor_publication", sourceEffectiveFrom: null, sourceEffectiveTo: null, applicabilityScope: {},
    proposedValue: { kind: "term", termCode: assessmentSubject, termValue: "official_definition_found" },
    assertionBasisCode: "claim_specific_semantic_support", verificationStatus: "supported_candidate", limitationCodes: [],
    admissionAuthority: "none", financialMutationAllowed: false,
  } as CandidateClaimSupport;
}

describe("bounded historical Fiserv processor-presentation authority", () => {
  it("keeps the four corrected subjects on processor_term without asserting network authority", () => {
    const fullRules = FISERV_OBSERVATION_SUBJECT_RULES.filter((rule) =>
      rule.eligibleTemplateFamilies.includes("fiserv_first_data_full_statement"));
    expect(fullRules).toHaveLength(4);
    expect(fullRules.every((rule) => rule.claimType === "processor_term"
      && rule.questionClass === "observed_processor_term_historical_presentation"
      && rule.requiredSourceAuthorities.join() === "processor_publication"
      && rule.limitations.includes("processor_publication_not_network_authority")
      && rule.limitations.includes("fiserv_cardpointe_publication_scope_only")
      && rule.limitations.includes("historical_processor_presentation_only"))).toBe(true);
    expect(fullRules.map((rule) => rule.subjectCode)).toEqual([
      "fiserv_multi_network_assessment_fee_historical_presentation",
      "fiserv_discover_network_authorization_fee_historical_presentation",
      "fiserv_discover_data_usage_fee_historical_presentation",
      "fiserv_visa_transaction_integrity_fee_historical_presentation",
    ]);
  });

  it("grounds the assessment subject in four explicit network dimensions and three exact page locators", () => {
    const locators = [
      locator("visa", 1, "Visa Assessment Fee DB and Visa Assessment Fee CR are presented here."),
      locator("mastercard", 4, "Mastercard Assessment Fee is presented here."),
      locator("discover-amex", 6, "Discover Assessment Fee and American Express Assessment Fee / AMEX Assessment Fee are presented here."),
    ];
    const coverage = processorPresentationLocatorTargets({ subjectCode: assessmentSubject, locators });
    expect(coverage.requiredCoverageCodes).toEqual([
      "visa_assessment_presentation", "mastercard_assessment_presentation",
      "discover_assessment_presentation", "american_express_assessment_presentation",
    ]);
    expect(coverage.missingCoverageCodes).toEqual([]);
    expect(coverage.targets.map((target) => [target.coverageCode, target.locator.locatorId])).toEqual([
      ["visa_assessment_presentation", "visa"],
      ["mastercard_assessment_presentation", "mastercard"],
      ["discover_assessment_presentation", "discover-amex"],
      ["american_express_assessment_presentation", "discover-amex"],
    ]);
  });

  it("retains bounded public locator text beyond 512 characters so later fee rows remain groundable", async () => {
    const text = `${"public processor schedule ".repeat(28)} Discover Network Authorization Fee is rendered as Network Authorization Fee.`;
    const content = new TextEncoder().encode(text);
    const fingerprint = createHash("sha256").update(content).digest("hex");
    const extraction = await extractPublicDocument({ questionId: "question", candidateId: "candidate", documentId: "document",
      expectedDocumentFingerprint: fingerprint, mimeType: "text/plain", content, maximumOutputBytes: 10_000 });
    expect(extraction.locators[0]!.text.length).toBeGreaterThan(512);
    expect(processorPresentationLocatorTargets({
      subjectCode: "fiserv_discover_network_authorization_fee_historical_presentation",
      locators: extraction.locators,
    }).missingCoverageCodes).toEqual([]);
  });

  it("does not let Visa-only evidence satisfy Mastercard, Discover, or American Express coverage", () => {
    const coverage = processorPresentationLocatorTargets({ subjectCode: assessmentSubject,
      locators: [locator("visa", 1, "Visa Assessment Fee DB and Visa Assessment Fee CR are presented here.")] });
    expect(coverage.targets.map((target) => target.coverageCode)).toEqual(["visa_assessment_presentation"]);
    expect(coverage.missingCoverageCodes).toEqual([
      "mastercard_assessment_presentation", "discover_assessment_presentation", "american_express_assessment_presentation",
    ]);
    const result = enforceProcessorPresentationSemanticCoverage({ questions: [question()], supports: [support("visa")],
      bindings: [{ itemId: "visa", questionId: `question-${assessmentSubject}`, coverageCode: "visa_assessment_presentation" }] });
    expect(result.incompleteQuestionIds).toEqual([`question-${assessmentSubject}`]);
    expect(result.supports[0]).toMatchObject({ verificationStatus: "partially_supported",
      limitationCodes: expect.arrayContaining(["locator_coverage_visa_assessment_presentation",
        "processor_presentation_locator_coverage_incomplete"]) });
  });

  it("retains supported status only when every independently verified network coverage item is present", () => {
    const codes = registryRuleForSubject(assessmentSubject)!.processorPresentationLocatorCoverage.map((item) => item.coverageCode);
    const supports = codes.map((code) => support(code));
    const result = enforceProcessorPresentationSemanticCoverage({ questions: [question()], supports,
      bindings: codes.map((code) => ({ itemId: code, questionId: `question-${assessmentSubject}`, coverageCode: code })) });
    expect(result.incompleteQuestionIds).toEqual([]);
    expect(result.supports.every((item) => item.verificationStatus === "supported_candidate"
      && item.limitationCodes.includes("processor_presentation_locator_coverage_complete"))).toBe(true);
  });

  it("requires Discover context and rejects PayPal-only authorization evidence", () => {
    const subjectCode = "fiserv_discover_network_authorization_fee_historical_presentation";
    const paypalOnly = processorPresentationLocatorTargets({ subjectCode,
      locators: [locator("paypal", 6, "PayPal Network Authorization Fee and PayPal Network Auth Fee are presented here.")] });
    expect(paypalOnly.targets).toEqual([]);
    expect(paypalOnly.missingCoverageCodes).toEqual(["discover_network_authorization_presentation"]);
    const discover = processorPresentationLocatorTargets({ subjectCode,
      locators: [locator("discover", 6, "Discover Network Authorization Fee is rendered as Network Authorization Fee.")] });
    expect(discover.missingCoverageCodes).toEqual([]);
    expect(discover.targets[0]?.coverageCode).toBe("discover_network_authorization_presentation");
  });
});
