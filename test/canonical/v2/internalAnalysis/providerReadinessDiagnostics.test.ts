import { describe, expect, it } from "vitest";
import {
  assertProviderReadinessSemanticSupport,
  inspectProviderReadinessSemanticMember,
  ProviderReadinessDiagnosticLog,
  validateSemanticMember,
  validateSemanticSupport,
  type CandidateClaimSupport,
  type ProviderReadinessSemanticSupportContextV1,
  type RuntimeResearchQuestion,
  type SemanticVerificationInput,
} from "../../../../src/canonical/v2/index.js";

function fixture(): { expected: SemanticVerificationInput; member: CandidateClaimSupport } {
  const fingerprint = "a".repeat(64);
  const proposedValue = { kind: "term" as const, termCode: "application_fee_terminology", termValue: "scope_limited" };
  const expected: SemanticVerificationInput = {
    itemId: "readiness-item-001",
    question: {
      questionId: "readiness-question-investigative", claimType: "processor_term", subjectCode: "application_fee_terminology",
      asOf: "2026-08-24", scope: { processor: null, processorProgram: null, network: null, region: "us", jurisdiction: "us" },
      requiredSourceAuthorities: ["processor_publication"], requiredEvidenceClasses: ["official_processor_terminology"],
      possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"],
      limitations: ["synthetic_readiness_only", "not_production_evidence"],
    },
    candidate: {
      candidateId: "readiness-candidate-001", questionId: "readiness-question-investigative", attemptId: "readiness-attempt-001",
      title: "Synthetic public terminology", claimedAuthority: "processor_publication", sourceTypeCode: "official_processor_terminology",
      rank: 1, publicationDate: null, effectiveFrom: null, effectiveTo: null, locatorHint: null,
      selectionReasonCode: "synthetic_provider_readiness", discoveryMetadata: { providerCode: "provider_readiness_synthetic",
        configurationCode: "provider_readiness_v1", sourceDomain: "example.test", providerRank: 1, providerSnippetUsedAsEvidence: false },
      retrievalEligibility: "eligible", authorityAdmissionRef: "readiness-admission-001", authorityPublicationFamilyCode: "readiness_publication",
    },
    documentId: "readiness-document-001",
    locator: { locatorId: "readiness-locator-001", documentId: "readiness-document-001", documentFingerprint: fingerprint,
      page: null, sectionCode: "public_glossary", lineStart: 1, lineEnd: 1, text: "Synthetic public terminology." },
    proposedValue,
  };
  const member: CandidateClaimSupport = {
    itemId: expected.itemId, supportId: "readiness-support-001", questionId: expected.question.questionId,
    claimType: expected.question.claimType, subjectCode: expected.question.subjectCode, candidateId: expected.candidate.candidateId,
    documentId: expected.documentId, locatorId: expected.locator.locatorId, documentFingerprint: expected.locator.documentFingerprint,
    investigativeObservationId: expected.itemId, sourceAuthority: "processor_publication", sourceEffectiveFrom: null,
    sourceEffectiveTo: null, applicabilityScope: { ...expected.question.scope }, proposedValue,
    assertionBasisCode: "claim_specific_public_definition", verificationStatus: "supported_candidate",
    limitationCodes: ["synthetic_readiness_only", "not_production_evidence"], admissionAuthority: "none", financialMutationAllowed: false,
  };
  return { expected, member };
}

function supportContext(expected: SemanticVerificationInput): ProviderReadinessSemanticSupportContextV1 {
  const scope = { tenantRef: null, accountRef: null, ...expected.question.scope };
  const question: RuntimeResearchQuestion = {
    ...expected.question, scope, originatingUnknownRef: "readiness-unknown-001", originatingDependencyRefs: [],
    originatingThemeRefs: [], relatedCanonicalRefs: [], materiality: "contextual", blockingEffect: "informational",
    priority: "material_repeated_unknown", reportDecisionCode: "synthetic_provider_readiness", publicResearchPlausible: true,
    rfResolution: { status: "unresolved_no_admitted_knowledge", claimType: expected.question.claimType,
      subjectCode: expected.question.subjectCode, value: null, selectedEntryRefs: [], corroboratingEntryRefs: [],
      rejectedCounts: {}, conflictEntryCount: 0, asOf: expected.question.asOf, scope, sourceAuthorities: [] },
    eligibility: "eligible", selection: "selected", reasonCodes: ["synthetic_provider_readiness"],
  };
  return { question, candidate: expected.candidate, locator: expected.locator,
    expectedObservationId: expected.itemId, expectedProposedValue: expected.proposedValue };
}

describe("provider-readiness semantic diagnostics", () => {
  it("retains the unchanged production validator's complete empty issue array for a valid member", () => {
    const { expected, member } = fixture();
    const diagnostics = inspectProviderReadinessSemanticMember(member, expected);
    expect(diagnostics.semanticMemberIssues).toEqual(validateSemanticMember(member, expected));
    expect(diagnostics).toMatchObject({ semanticMemberValidationState: "passed", semanticMemberIssues: [], semanticMismatchDimensions: [] });
  });

  it("passes the same valid bound support through both unchanged production validators", () => {
    const { expected, member } = fixture(); const context = supportContext(expected);
    expect(validateSemanticMember(member, expected)).toEqual([]);
    expect(validateSemanticSupport({ ...context, support: member })).toEqual({
      status: "supported_candidate", reasonCodes: ["claim_specific_semantic_support_candidate"],
    });
    const diagnostics = new ProviderReadinessDiagnosticLog(); diagnostics.recordSemanticMember(member, expected);
    expect(assertProviderReadinessSemanticSupport(member, context, diagnostics)).toMatchObject({
      semanticMemberValidationState: "passed", semanticSupportValidationState: "passed",
      semanticSupportStatus: "supported_candidate", semanticSupportReasonCodes: ["claim_specific_semantic_support_candidate"],
    });
  });

  it.each([
    ["observation", (context: ProviderReadinessSemanticSupportContextV1) => ({ ...context, expectedObservationId: "different-observation" }),
      "semantic_candidate_document_locator_identity_mismatch"],
    ["proposed value", (context: ProviderReadinessSemanticSupportContextV1) => ({ ...context,
      expectedProposedValue: { kind: "term" as const, termCode: "application_fee_terminology", termValue: "unresolved" } }),
      "semantic_proposed_value_substitution"],
    ["locator provenance", (context: ProviderReadinessSemanticSupportContextV1) => ({ ...context,
      locator: { ...context.locator, locatorId: "different-locator" } }), "semantic_candidate_document_locator_identity_mismatch"],
  ])("fails closed when a member-valid support violates the production %s binding", (_name, mutate, expectedReason) => {
    const { expected, member } = fixture(); const diagnostics = new ProviderReadinessDiagnosticLog();
    expect(validateSemanticMember(member, expected)).toEqual([]); diagnostics.recordSemanticMember(member, expected);
    expect(() => assertProviderReadinessSemanticSupport(member, mutate(supportContext(expected)), diagnostics))
      .toThrow("provider_readiness_semantic_support_invalid");
    expect(diagnostics.snapshot()).toMatchObject({ semanticMemberValidationState: "passed",
      semanticSupportValidationState: "failed", semanticSupportStatus: "malformed" });
    expect(diagnostics.snapshot().semanticSupportReasonCodes).toContain(expectedReason);
  });

  it("preserves production wrong-authority and wrong-scope classifications without promoting or rejecting them", () => {
    const { expected, member } = fixture();
    const authorityContext = supportContext({ ...expected, candidate: { ...expected.candidate, authorityAdmissionRef: null } });
    const scopeMember = { ...member, applicabilityScope: { ...member.applicabilityScope, region: "ca" } };
    expect(validateSemanticSupport({ ...authorityContext, support: member })).toMatchObject({ status: "wrong_authority",
      reasonCodes: expect.arrayContaining(["semantic_source_authority_mismatch"]) });
    expect(validateSemanticSupport({ ...supportContext(expected), support: scopeMember })).toMatchObject({ status: "wrong_scope",
      reasonCodes: expect.arrayContaining(["semantic_scope_mismatch"]) });
    const diagnostics = new ProviderReadinessDiagnosticLog(); diagnostics.recordSemanticMember(member, expected);
    expect(assertProviderReadinessSemanticSupport(member, authorityContext, diagnostics)).toMatchObject({
      semanticSupportValidationState: "passed", semanticSupportStatus: "wrong_authority",
      semanticSupportReasonCodes: expect.arrayContaining(["semantic_source_authority_mismatch"]),
    });
  });

  it.each([
    ["question mismatch", (member: CandidateClaimSupport) => ({ ...member, questionId: "different-question" }),
      ["semantic_member_identity_mismatch"], ["question_id"]],
    ["candidate mismatch", (member: CandidateClaimSupport) => ({ ...member, candidateId: "different-candidate" }),
      ["semantic_member_identity_mismatch"], ["candidate_id"]],
    ["document and fingerprint mismatch", (member: CandidateClaimSupport) => ({ ...member, documentId: "different-document", documentFingerprint: "b".repeat(64) }),
      ["semantic_member_identity_mismatch"], ["document_fingerprint", "document_id"]],
    ["locator mismatch", (member: CandidateClaimSupport) => ({ ...member, locatorId: "different-locator" }),
      ["semantic_member_identity_mismatch"], ["locator_id"]],
    ["observation mismatch", (member: CandidateClaimSupport) => ({ ...member, investigativeObservationId: "different-observation" }),
      ["semantic_member_identity_mismatch"], ["investigative_observation_id"]],
    ["claim and subject mismatch", (member: CandidateClaimSupport) => ({ ...member, claimType: "notice_external_rule", subjectCode: "different_subject" } as CandidateClaimSupport),
      ["semantic_member_identity_mismatch"], ["claim_type", "subject_code"]],
    ["required authority mismatch", (member: CandidateClaimSupport) => ({ ...member, sourceAuthority: "official_network_publication" }),
      ["semantic_member_state_invalid"], ["required_source_authority"]],
    ["invalid effective date", (member: CandidateClaimSupport) => ({ ...member, sourceEffectiveFrom: "2026-02-31" }),
      ["semantic_period_invalid"], ["source_effective_from"]],
    ["neutral-term subject mismatch", (member: CandidateClaimSupport) => ({ ...member,
      proposedValue: { kind: "term", termCode: "non_swiped_discount_terminology", termValue: "scope_limited" } }),
      ["semantic_neutral_vocabulary_required"], ["proposed_term_subject"]],
    ["invalid admission authority", (member: CandidateClaimSupport) => ({ ...member, admissionAuthority: "human_override" } as CandidateClaimSupport),
      ["semantic_authority_strengthening"], ["admission_authority"]],
    ["prohibited financial mutation", (member: CandidateClaimSupport) => ({ ...member, financialMutationAllowed: true } as CandidateClaimSupport),
      ["semantic_authority_strengthening"], ["financial_mutation_allowed"]],
  ])("exposes %s without changing the production issue codes", (_name, mutate, expectedIssues, expectedDimensions) => {
    const { expected, member } = fixture();
    const changed = mutate(member);
    const diagnostics = inspectProviderReadinessSemanticMember(changed, expected);
    expect(diagnostics.semanticMemberIssues).toEqual(validateSemanticMember(changed, expected));
    expect(diagnostics.semanticMemberIssues).toEqual(expectedIssues);
    expect(diagnostics.semanticMismatchDimensions).toEqual(expectedDimensions);
    expect(diagnostics.semanticMemberValidationState).toBe("failed");
  });

  it("projects only allowlisted structured fields and retains no provider prose or hidden reasoning", () => {
    const { expected, member } = fixture();
    const raw = { ...member, hiddenReasoning: "secret chain of thought", assistantProse: "arbitrary provider prose", authorization: "Bearer secret" };
    const diagnostics = inspectProviderReadinessSemanticMember(raw, expected);
    expect(diagnostics.semanticMemberIssues).toEqual(["semantic_member_shape_invalid"]);
    expect(diagnostics.semanticMismatchDimensions).toContain("member_shape");
    expect(Object.keys(diagnostics.safeSemanticMemberProjection!).sort()).toEqual([
      "admissionAuthority", "applicabilityScope", "assertionBasisCode", "candidateId", "claimType", "documentFingerprint", "documentId",
      "financialMutationAllowed", "investigativeObservationId", "itemId", "limitationCodeCount", "limitationCodes", "locatorId",
      "proposedTerm", "questionId", "schemaVersion", "sourceAuthority", "sourceEffectiveFrom", "sourceEffectiveTo", "subjectCode",
      "supportId", "verificationStatus",
    ].sort());
    expect(JSON.stringify(diagnostics)).not.toMatch(/chain of thought|provider prose|Bearer|hiddenReasoning|assistantProse|authorization/);
  });

  it("retains a bounded immutable snapshot separate from provider and production analysis artifacts", () => {
    const { expected, member } = fixture(); const log = new ProviderReadinessDiagnosticLog();
    const recorded = log.recordSemanticMember({ ...member, candidateId: "different-candidate" }, expected);
    recorded.semanticMemberIssues.push("caller_mutation");
    expect(log.snapshot()).toMatchObject({ schemaVersion: "provider_readiness_diagnostics_v1", semanticMemberValidationState: "failed",
      semanticMemberIssues: ["semantic_member_identity_mismatch"], semanticMismatchDimensions: ["candidate_id"],
      semanticSupportValidationState: "not_reached", semanticSupportStatus: null, semanticSupportReasonCodes: [] });
    expect(JSON.stringify(log.snapshot())).not.toMatch(/InternalStatementAnalysis|canonicalTruth|findings|recommendations|impact|knowledge/);
  });
});
