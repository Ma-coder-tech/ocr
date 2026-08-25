import { describe, expect, it } from "vitest";
import {
  deterministicThemeLanguageFallback,
  ingestKnowledgeCandidatePacket,
  supportToKnowledgeCandidatePacket,
  validateKnowledgeCandidatePacket,
  validateSemanticSupport,
  validateThemeLanguageCandidate,
  providerSafeScope,
  type CandidateClaimSupport,
  type RuntimeResearchQuestion,
} from "../../../../src/canonical/v2/index.js";
import { questionOrigin, queryScope, unknownItem } from "./intelligenceFixtures.js";
import { planRuntimeResearchQuestions } from "../../../../src/canonical/v2/index.js";

function question(): RuntimeResearchQuestion {
  return planRuntimeResearchQuestions({ entries: [], unknownQueue: [unknownItem()], origins: [questionOrigin()], maximumSelectedQuestions: 4 })[0]!;
}

function support(overrides: Partial<CandidateClaimSupport> = {}): CandidateClaimSupport {
  const item = question();
  return {
    itemId: "item-1",
    supportId: "support-1",
    questionId: item.questionId,
    claimType: item.claimType,
    subjectCode: item.subjectCode,
    candidateId: "candidate-1",
    documentId: "document-1",
    locatorId: "locator-1",
    documentFingerprint: "fingerprint-1",
    investigativeObservationId: "item-1",
    sourceAuthority: "official_network_publication",
    sourceEffectiveFrom: "2026-01-01",
    sourceEffectiveTo: null,
    applicabilityScope: providerSafeScope(queryScope),
    proposedValue: { kind: "rule", ruleCode: "visa_future_rule", outcomeCode: "applies" },
    assertionBasisCode: "claim_specific_semantic_verification",
    verificationStatus: "supported_candidate",
    limitationCodes: [],
    admissionAuthority: "none",
    financialMutationAllowed: false,
    ...overrides,
  };
}

describe("Canonical Intelligence V2 semantic verification, RF ingress, and theme language", () => {
  it("rejects substring support, authority mismatch, period mismatch, and locator swaps", () => {
    const runtimeQuestion = question();
    const candidate = {
      candidateId: "candidate-1", questionId: runtimeQuestion.questionId, attemptId: "attempt-1",
      claimedAuthority: "official_network_publication" as const, sourceTypeCode: "official_rule", rank: 1,
      publicationDate: null, effectiveFrom: null, effectiveTo: null, locatorHint: null, selectionReasonCode: "official_authority", retrievalEligibility: "eligible" as const, authorityAdmissionRef: "admission-1",
    };
    const locator = { locatorId: "locator-1", documentId: "document-1", documentFingerprint: "fingerprint-1", page: 1, sectionCode: "rule", lineStart: 1, lineEnd: 1, text: "The publication mentions the term." };
    const validate = (value: CandidateClaimSupport) => validateSemanticSupport({ question: runtimeQuestion, candidate, locator, support: value, expectedObservationId: "item-1", expectedProposedValue: support().proposedValue });
    expect(validate(support({ assertionBasisCode: "keyword_match" })).status).toBe("unsupported");
    expect(validate(support({ sourceAuthority: "processor_publication" })).status).toBe("wrong_authority");
    expect(validate(support({ sourceEffectiveFrom: "2027-01-01" })).status).toBe("wrong_period");
    expect(validate(support({ locatorId: "locator-other" })).status).toBe("malformed");
  });

  it("creates only the approved account-private, human-admission-required RF candidate provenance", () => {
    const packet = supportToKnowledgeCandidatePacket({ runId: "run-1", question: question(), support: support({ limitationCodes: [
      "public_definition_does_not_establish_account_applicability",
      "public_scope_applicability_unproven",
      "ownership_control_and_savings_unresolved",
      "no_economic_category_or_savings_inference",
    ] }) });
    expect(validateKnowledgeCandidatePacket(packet)).toEqual([]);
    expect(ingestKnowledgeCandidatePacket(packet)).toMatchObject({
      lifecycle: "candidate",
      requiresHumanAdmission: true,
      privacy: "private_by_default",
      proposedVisibility: "account_private",
      tenantRef: "tenant-a",
      accountRef: "account-a",
      provenance: { adapter: "bounded_intelligence_runtime" },
      limitations: expect.arrayContaining([
        "public_definition_does_not_establish_account_applicability",
        "public_scope_applicability_unproven",
        "ownership_control_and_savings_unresolved",
      ]),
    });
    const weakened = { ...packet, proposedVisibility: "reusable" as const, tenantRef: null, accountRef: null };
    expect(validateKnowledgeCandidatePacket(weakened)).toContain("bounded_intelligence_candidate_requires_account_private_boundary");
    const raw = { ...packet, provenance: { ...packet.provenance, sourceRecordRef: "https://private.example/source.pdf" } };
    expect(validateKnowledgeCandidatePacket(raw)).toContain("bounded_intelligence_candidate_contains_private_payload");
    const privateAccountReference = { ...packet, provenance: { ...packet.provenance, sourceRecordRef: "account_merchant_987654321" } };
    expect(validateKnowledgeCandidatePacket(privateAccountReference)).toContain("bounded_intelligence_candidate_contains_private_payload");
    const accountIdentifier = { ...packet, limitations: [...packet.limitations, "account_merchant_987654321"] };
    expect(validateKnowledgeCandidatePacket(accountIdentifier)).toContain("bounded_intelligence_candidate_limitation_code_unapproved");
    const statementText = { ...packet, limitations: [...packet.limitations, "Merchant Number 987654321 was charged $99.00"] };
    expect(validateKnowledgeCandidatePacket(statementText)).toContain("bounded_intelligence_candidate_limitation_code_unapproved");
    const arbitraryCanonicalCode = { ...packet, limitations: [...packet.limitations, "safe_looking_but_unregistered_code"] };
    expect(validateKnowledgeCandidatePacket(arbitraryCanonicalCode)).toContain("bounded_intelligence_candidate_limitation_code_unapproved");
  });

  it("rejects strengthened merchant language and always returns a deterministic fallback", () => {
    const input = { itemId: "language-1", themeRef: "theme-1", themeType: "pricing_structure", factRefs: ["fact-1"], driverRefs: [], leverRefs: [], limitationCodes: ["ownership_unresolved"], actionabilityCode: "verification_only", uncertaintyState: "unresolved" as const };
    const fallback = deterministicThemeLanguageFallback(input);
    expect(fallback).toMatchObject({ source: "deterministic_fallback", customerVisible: false, reportPermission: "none", authority: "non_authoritative_candidate" });
    const strengthened = validateThemeLanguageCandidate(input, { ...fallback, text: "Demand a refund because you were overcharged and can save $500.", source: "provider_candidate" });
    expect(strengthened.accepted).toBe(false);
    expect(strengthened.candidate.text).toBe(fallback.text);
    expect(strengthened.candidate.validation).toBe("rejected_strengthening");
  });
});
