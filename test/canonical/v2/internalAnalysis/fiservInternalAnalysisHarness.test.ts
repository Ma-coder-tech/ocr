import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
  createPublicSourceAuthorityAdmission,
  runFiservInternalAnalysisEvaluationV1,
  validateInternalStatementAnalysisV1,
  validatePublicSourceEvidenceManifestV1,
  validateRgInternalAuditV1,
} from "../../../../src/canonical/v2/index.js";
import { createInjectedStatement1Fixture } from "./injectedStatement1Fixture.js";

const statementOne = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");

describe("Statement 1 end-to-end internal analysis vertical slice", () => {
  it("runs the real PDF through deterministic truth and injected RG providers without network calls or canonical mutation", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "internal-analysis-statement-one-"));
    const injected = createInjectedStatement1Fixture();
    const result = await runFiservInternalAnalysisEvaluationV1({
      statementPaths: [statementOne], safeStatementId: "fsv-03-clover-short-jun",
      runVersion: "run-3-foundational-admissions-pricing-fixed", outputDirectory,
      sourceProfile: { statementCompleteness: "unknown" }, internalRunId: "statement-one-injected-vertical-slice",
      evaluatedAt: "2026-08-23T00:00:00.000Z", tenantRef: "tenant-private-fixture", accountRef: "account-private-fixture",
      admittedKnowledge: [], ports: injected.ports, providerAudit: injected.providerAudit,
      providerPreflight: injected.providerPreflight, publicSourceAuthorityAdmissions: injected.publicSourceAuthorityAdmissions,
    });
    expect((await readdir(outputDirectory)).sort()).toEqual([
      "internal-analysis.json", "internal-analysis.md", "public-source-evidence.json", "review.md",
      "rg-audit.json", "rh-projection.json", "run-audit.json",
    ]);
    expect(result.deterministicAudit).toMatchObject({
      safeStatementId: "fsv-03-clover-short-jun", runVersion: "run-3-foundational-admissions-pricing-fixed",
      finalPublicExperience: "analysis_with_open_questions",
      stageValidation: { rb: "valid", rc: "valid", rd: "valid", re: "valid", rh: "valid" },
      readiness: { outcome: { state: "statement_completeness_unknown" } },
      admission: { mappingId: "fiserv_first_data_short_structural_mapping" },
    });
    expect(result.investigationOrigins.origins).toHaveLength(2);
    expect(result.investigationOrigins.origins.map((item) => item.questionClass)).toEqual([
      "application_fee_public_definition", "non_swiped_discount_public_definition",
    ]);
    expect(result.runtime.questions.map((item) => [item.subjectCode, item.eligibility, item.selection])).toEqual([
      ["application_fee_terminology", "eligible", "selected"],
      ["non_swiped_discount_terminology", "eligible", "selected"],
    ]);
    expect(result.runtime.candidates).toHaveLength(1);
    expect(result.runtime.candidates[0]).toMatchObject({
      authorityPublicationFamilyCode: "first_data_us_swipe_non_swipe_statement_guide",
      selectionReasonCode: "known_exact_authority_admission",
    });
    expect(result.runtime.searchAttempts.find((item) => item.questionId === result.runtime.questions
      .find((question) => question.subjectCode === "application_fee_terminology")!.questionId)).toMatchObject({
      status: "no_candidates", candidateIds: [], reasonCodes: ["all_discovery_candidates_rejected_by_authority"],
    });
    expect(result.runtime.searchAttempts.map((attempt) => ({ kind: attempt.kind, adaptiveReason: attempt.adaptiveReason }))).toEqual([
      { kind: "initial", adaptiveReason: null },
      { kind: "adaptive", adaptiveReason: "zero_candidates_safe_query_variant" },
    ]);
    expect(result.runtime.supports.map((item) => item.verificationStatus)).toEqual(["supported_candidate"]);
    expect(result.runtime.supports[0]!.subjectCode).toBe("non_swiped_discount_terminology");
    expect(result.runtime.supports[0]!.limitationCodes).toEqual(expect.arrayContaining([
      "terminology_example_presentation_only", "public_scope_applicability_unproven", "ownership_control_and_savings_unresolved",
      "public_definition_does_not_establish_account_applicability",
    ]));
    expect(result.runtime.candidatePackets).toHaveLength(1);
    expect(result.runtime.candidatePackets[0]).toMatchObject({ lifecycle: "candidate", requiresHumanAdmission: true,
      privacy: "private_by_default", proposedVisibility: "account_private", provenance: { adapter: "bounded_intelligence_runtime" },
      limitations: expect.arrayContaining(["public_definition_does_not_establish_account_applicability"]) });
    expect(result.runtime.automaticAdmissionCount).toBe(0);
    expect(result.runtime.privateReviewBundles[0]!.candidatePacketId).toBe(result.runtime.candidatePackets[0]!.candidateId);
    expect(result.analysis).toMatchObject({ executionStatus: "completed", researchOutcome: "source_rejected_by_authority_policy",
      terminalStatus: "completed_with_unresolved", canonicalTruthPreserved: true });
    expect(result.analysis.researchQuestionOutcomes).toEqual([
      expect.objectContaining({ questionClass: "application_fee_public_definition", outcome: "source_rejected_by_authority_policy",
        retainedCandidateCount: 0, publicResearchStillPossible: false }),
      expect.objectContaining({ questionClass: "non_swiped_discount_public_definition", outcome: "research_completed",
        retainedCandidateCount: 1, publicResearchStillPossible: true }),
    ]);
    expect(result.analysis.supportedResearchFindings).toHaveLength(1);
    expect(result.analysis.supportedResearchFindings[0]!.proposedValue).toMatchObject({
      kind: "term", termCode: "non_swiped_discount_terminology", termValue: "official_definition_found",
    });
    expect(result.publicEvidence.entries[0]!.limitations).toEqual(expect.arrayContaining([
      "terminology_example_presentation_only", "public_scope_applicability_unproven", "ownership_control_and_savings_unresolved",
    ]));
    expect(result.analysis.investigativeHypotheses).toHaveLength(0);
    expect(result.analysis.contradictions).toHaveLength(0);
    expect(result.analysis.unresolvedQuestions).toHaveLength(1);
    expect(result.analysis.unresolvedQuestions[0]!.title).toMatch(/application fee/i);
    expect(result.analysis.recommendations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "verification_action", "documentation_request",
    ]));
    expect(result.analysis.recommendations).not.toContainEqual(expect.objectContaining({ kind: "research_followup" }));
    expect(result.analysis.recommendations).not.toContainEqual(expect.objectContaining({ kind: "supported_economic_action" }));
    expect(result.analysis.recommendations).toContainEqual(expect.objectContaining({ kind: "verification_action",
      actionabilityCeiling: "verification_only" }));
    expect(result.analysis.recommendations).toContainEqual(expect.objectContaining({ kind: "documentation_request",
      actionabilityCeiling: "documentation_only", merchantControl: "unresolved",
      title: "Request the merchant agreement or fee schedule for the observed $99.00 Application Fee and document its contractual citation, calculation basis or fee formula, effective date or period, and applicability to this merchant account; obtain a processor explanation if those documents are insufficient." }));
    expect(result.analysis.impact.map((item) => ({ state: item.state, amountMinor: item.amountMinor, annualized: item.annualized })))
      .toEqual([{ state: "observed_cost", amountMinor: 9_900, annualized: false },
        { state: "observed_cost", amountMinor: 4_231, annualized: false }]);
    expect(result.analysis.impact.some((item) => item.state.startsWith("potential_reduction"))).toBe(false);
    expect(result.analysis.canonicalBeforeHash).toBe(result.analysis.canonicalAfterHash);
    expect(result.rgAudit).toMatchObject({ executionMode: "injected_evaluation", externalNetworkCallCount: 0,
      canonicalTruthPreserved: true, budget: { profile: "RG-FREE-v1" } });
    expect(result.rgAudit.observationPlanning).toMatchObject({ schemaVersion: "observation_planning_audit_v1",
      registryId: "fiserv_observation_subject_registry", registryVersion: "2.0.0",
      rawNonzeroObservationCount: 6, normalizedObservationIdentityCount: 6, mappedSubjectCount: 2,
      suppressedObservationCount: 4, eligibleSubjectCount: 2, selectedQuestionCount: 2,
      subjects: [
        expect.objectContaining({ subjectCode: "application_fee_terminology", occurrenceCount: 1 }),
        expect.objectContaining({ subjectCode: "non_swiped_discount_terminology", occurrenceCount: 1 }),
      ],
      subjectDecisions: [
        expect.objectContaining({ subjectCode: "application_fee_terminology", selection: "selected",
          sourceAuthorityAvailability: "dynamic_discovery_permitted_no_current_source_admission" }),
        expect.objectContaining({ subjectCode: "non_swiped_discount_terminology", selection: "selected",
          sourceAuthorityAvailability: "existing_admitted_public_authority_available" }),
      ] });
    expect(JSON.stringify(result.rgAudit.observationPlanning)).not.toMatch(/SAMPLE_MERCHANT|tenant-private|account-private|\.pdf\b/i);
    expect(result.rgAudit.rfProjection).toEqual({ projectedCandidateCount: 1, automaticAdmissionCount: 0,
      projectionStatus: "completed_with_candidates",
      reasonCodes: ["rf_candidates_projected_for_human_review", "automatic_knowledge_admission_none"],
      candidateSummaries: [expect.objectContaining({ candidateRef: expect.stringMatching(/^rf-audit-candidate-[a-f0-9]{24}$/),
        lifecycle: "candidate", privacy: "private_by_default", proposedVisibility: "account_private",
        requiresHumanAdmission: true, provenanceAdapter: "bounded_intelligence_runtime",
        provenanceCode: "canonical_intelligence_v2_runtime_v1", projectionStatus: "projected_for_human_review" })] });
    expect(JSON.stringify(result.rgAudit.rfProjection)).not.toMatch(/tenant-private-fixture|account-private-fixture/);
    const applicationCandidateAudits = result.rgAudit.searchAttempts.flatMap((attempt) => attempt.candidateAudits);
    expect(applicationCandidateAudits).toHaveLength(6);
    expect(applicationCandidateAudits.every((candidate) => candidate.authorityDecision === "rejected_by_authority_policy"
      && candidate.reasonCodes.includes("source_not_admitted_by_authority_registry") && candidate.retrievalAttempted === false)).toBe(true);
    expect(applicationCandidateAudits.map((candidate) => Object.keys(candidate).sort())).toEqual(Array.from({ length: 6 }, () => [
      "authorityAdmissionRef", "authorityDecision", "candidateId", "claimedAuthority", "consideredUrl", "derivedAuthority", "normalizedUrl",
      "rank", "reasonCodes", "retrievalAttempted", "sourceDomain", "sourceOrigin", "sourceTypeCode",
    ]));
    expect(JSON.stringify(applicationCandidateAudits)).not.toMatch(/snippet|title|assistant|commentary|merchant-private|account-private/i);
    expect(result.rgAudit.retrievalOutcomes).toEqual([expect.objectContaining({ candidateId: result.runtime.candidates[0]!.candidateId,
      requestedUrl: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL, finalUrl: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
      documentFingerprint: result.publicEvidence.entries[0]!.documentFingerprint,
      authorityAdmissionRef: "injected_fiserv_first_data_us_swipe_non_swipe_statement_guide_v1",
      fingerprintMatchState: "matched_approved_fingerprint", state: "retrieved_extracted", mimeType: "text/html",
      byteLength: expect.any(Number), locatorIds: expect.arrayContaining([result.publicEvidence.entries[0]!.locator.locatorId]) })]);
    expect(result.rgAudit.budget.consumed).toMatchObject({ search_calls: 2, adaptive_searches: 1, candidates: 1, retrieval_documents: 1,
      investigative_ai_calls: 1, semantic_verification_calls: 1, semantic_support_items: 1, language_calls: 0,
      model_output_tokens: 320 });
    expect(result.rgAudit.providerOperationReceipts).toHaveLength(5);
    expect(result.rgAudit.providerOperationReceipts.every((receipt) => receipt.actualSendCount === 0
      && receipt.sendState === "not_sent" && receipt.retryCount === 0)).toBe(true);
    expect(injected.downloadedBuffers).toHaveLength(1);
    expect(injected.downloadedBuffers.every((buffer) => buffer.every((byte) => byte === 0))).toBe(true);
    const providerPayload = injected.providerPayloads.join("\n");
    expect(providerPayload).not.toMatch(/tenant-private|account-private|SAMPLE_MERCHANT|\.pdf\b|\/Users\/|\$\s*\d|9900|4231/i);
    for (const origin of result.investigationOrigins.origins) {
      expect(providerPayload).not.toContain(origin.originId); expect(providerPayload).not.toContain(origin.unknownRef);
      for (const ref of [...origin.occurrenceRefs, ...origin.evidenceRefs]) expect(providerPayload).not.toContain(ref);
    }
    expect(result.investigationOrigins.providerContexts.every((context) => /^provider-context-[0-9a-f-]{36}$/.test(context.providerContextId))).toBe(true);
    expect(validateInternalStatementAnalysisV1(result.analysis)).toEqual([]);
    expect(validatePublicSourceEvidenceManifestV1(result.publicEvidence)).toEqual([]);
    expect(validateRgInternalAuditV1(result.rgAudit)).toEqual([]);
    const tamperedPlanningAudit = structuredClone(result.rgAudit);
    tamperedPlanningAudit.observationPlanning.subjects[0]!.registryRuleId =
      tamperedPlanningAudit.observationPlanning.subjects[1]!.registryRuleId;
    expect(validateRgInternalAuditV1(tamperedPlanningAudit)).toContain("rg_internal_audit_observation_planning_invalid");
    const serializedInternal = `${await readFile(path.join(outputDirectory, "internal-analysis.json"), "utf8")}${await readFile(path.join(outputDirectory, "rg-audit.json"), "utf8")}${await readFile(path.join(outputDirectory, "public-source-evidence.json"), "utf8")}`;
    const withoutApprovedPublicDocumentUrl = serializedInternal.replaceAll(FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL, "https://approved-public-source.invalid/document");
    expect(withoutApprovedPublicDocumentUrl).not.toMatch(/raw prompt|raw response|chain.of.thought|SAMPLE_MERCHANT|\/Users\/|\.pdf\b/i);
    expect(JSON.parse(await readFile(path.join(outputDirectory, "public-source-evidence.json"), "utf8"))).toMatchObject({ downloadedBodiesPersisted: false });
    const deterministicReview = await readFile(path.join(outputDirectory, "review.md"), "utf8");
    const internalReview = await readFile(path.join(outputDirectory, "internal-analysis.md"), "utf8");
    expect(deterministicReview).toContain("RG: disabled_no_provider; live research/provider activity: none");
    expect(internalReview).toContain("Provider-disabled markers in `review.md` and `run-audit.json` describe that deterministic phase only.");
    expect(internalReview).toContain("The subsequent RG phase ran in `injected_evaluation` mode");
    expect(internalReview).toContain("Execution status: **completed**");
    expect(internalReview).toContain("Research outcome: **source_rejected_by_authority_policy**");
    const projection = await readFile(path.join(outputDirectory, "rh-projection.json"));
    expect(createHash("sha256").update(projection).digest("hex"))
      .toBe("aca1c2d06383ef42bf93c2dca91ad4e6819cd6ddfb2ad1bd91079333aea9a92c");
  }, 30_000);

  it("fails a changed known-source fingerprint closed before investigation", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "internal-analysis-fingerprint-mismatch-"));
    const injected = createInjectedStatement1Fixture();
    injected.publicSourceAuthorityAdmissions = [createPublicSourceAuthorityAdmission({
      ...injected.publicSourceAuthorityAdmissions[0]!, approvedDocumentFingerprints: ["0".repeat(64)],
    })];
    const result = await runFiservInternalAnalysisEvaluationV1({
      statementPaths: [statementOne], safeStatementId: "fsv-03-clover-short-jun",
      runVersion: "run-3-foundational-admissions-pricing-fixed", outputDirectory,
      sourceProfile: { statementCompleteness: "unknown" }, internalRunId: "statement-one-fingerprint-mismatch",
      evaluatedAt: "2026-08-24T00:00:00.000Z", tenantRef: "tenant-private-fixture", accountRef: "account-private-fixture",
      admittedKnowledge: [], ports: injected.ports, providerAudit: injected.providerAudit,
      providerPreflight: injected.providerPreflight, publicSourceAuthorityAdmissions: injected.publicSourceAuthorityAdmissions,
    });
    expect(result.runtime.documents).toEqual([expect.objectContaining({ state: "safety_blocked",
      documentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), fingerprintMatchState: "mismatched_approved_fingerprint",
      reasonCodes: ["source_authority_document_fingerprint_mismatch"] })]);
    expect(result.rgAudit.retrievalOutcomes).toEqual([expect.objectContaining({ state: "safety_blocked",
      requestedUrl: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL, finalUrl: FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
      fingerprintMatchState: "mismatched_approved_fingerprint", locatorIds: [],
      reasonCodes: ["source_authority_document_fingerprint_mismatch"] })]);
    expect(validateRgInternalAuditV1(result.rgAudit)).toEqual([]);
    expect(result.runtime.supports).toEqual([]);
    expect(result.rgAudit.providerOperationReceipts.some((receipt) => receipt.operation === "investigative_model"
      || receipt.operation === "semantic_model")).toBe(false);
    expect(result.analysis.canonicalBeforeHash).toBe(result.analysis.canonicalAfterHash);
  }, 30_000);

  it("does not promote retrieved known-source evidence without independent semantic verification", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "internal-analysis-semantic-required-"));
    const injected = createInjectedStatement1Fixture();
    injected.ports.semantic = undefined;
    const result = await runFiservInternalAnalysisEvaluationV1({
      statementPaths: [statementOne], safeStatementId: "fsv-03-clover-short-jun",
      runVersion: "run-3-foundational-admissions-pricing-fixed", outputDirectory,
      sourceProfile: { statementCompleteness: "unknown" }, internalRunId: "statement-one-semantic-required",
      evaluatedAt: "2026-08-24T00:00:00.000Z", tenantRef: "tenant-private-fixture", accountRef: "account-private-fixture",
      admittedKnowledge: [], ports: injected.ports, providerAudit: injected.providerAudit,
      providerPreflight: injected.providerPreflight, publicSourceAuthorityAdmissions: injected.publicSourceAuthorityAdmissions,
    });
    expect(result.runtime.documents).toEqual([expect.objectContaining({ state: "retrieved_extracted" })]);
    expect(result.runtime.diagnostics.stageStatuses).toMatchObject({ investigative_intelligence: "completed",
      semantic_verification: "disabled_no_provider" });
    expect(result.runtime.supports).toEqual([]);
    expect(result.analysis.supportedResearchFindings).toEqual([]);
    expect(result.analysis.canonicalBeforeHash).toBe(result.analysis.canonicalAfterHash);
  }, 30_000);
});
