import { mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorityAdmissionForCandidate, createPublicSourceAuthorityAdmission, formatInternalAnalysisMarkdown,
  planRuntimeResearchQuestions, validateInvestigativeMember, validateInternalStatementAnalysisV1,
  validatePublicSourceEvidenceManifestV1, validateRgInternalAuditV1, writeInternalAnalysisBundle,
  projectRfAuditSummary,
  internalAnalysisTerminalStatus,
} from "../../../../src/canonical/v2/index.js";
import { officialSourceAdmission, questionOrigin, unknownItem } from "../intelligence/intelligenceFixtures.js";

describe("bounded live-boundary corrections", () => {
  it("rejects wrong-product, wrong-program, marketing, and wrong-family pages on an official origin", () => {
    const admission = createPublicSourceAuthorityAdmission({ ...officialSourceAdmission, admissionId: "specific-admission",
      publicationFamilyCode: "visa_rules", allowedPathPrefixes: ["/rules/visa"], allowedProcessorPrograms: ["program-a"] });
    const question = planRuntimeResearchQuestions({ entries: [], unknownQueue: [unknownItem()], origins: [questionOrigin()], maximumSelectedQuestions: 1 })[0]!;
    const candidate = (url: string) => ({ candidateId: "candidate", questionId: question.questionId, attemptId: "attempt", url,
      claimedAuthority: "official_network_publication" as const, sourceTypeCode: "official_rule", rank: 1, publicationDate: null,
      effectiveFrom: null, effectiveTo: null, locatorHint: null, selectionReasonCode: "test", retrievalEligibility: "wrong_authority" as const,
      authorityAdmissionRef: null, authorityPublicationFamilyCode: null });
    expect(authorityAdmissionForCandidate({ candidate: candidate("https://example.com/rules/visa/current"), question, admissions: [admission] })?.publicationFamilyCode).toBe("visa_rules");
    for (const url of ["https://example.com/products/clover/rule", "https://example.com/marketing/generic", "https://example.com/rules/mastercard/current", "https://example.com/archive/visa-rule"]) {
      expect(authorityAdmissionForCandidate({ candidate: candidate(url), question, admissions: [admission] })).toBeNull();
    }
    expect(authorityAdmissionForCandidate({ candidate: candidate("https://example.com/rules/visa/current"),
      question: { ...question, scope: { ...question.scope, processorProgram: "different-program" } }, admissions: [admission] })).toBeNull();
    expect(authorityAdmissionForCandidate({ candidate: { ...candidate("https://example.com/marketing/generic"), rank: 1 }, question, admissions: [admission] })).toBeNull();
    expect(authorityAdmissionForCandidate({ candidate: { ...candidate("https://example.com/rules/visa/current"), rank: 999 }, question, admissions: [admission] })).not.toBeNull();
  });

  it.each(["processor_controlled_fee", "avoidable_fee", "fee_should_be_removed", "overcharge", "merchant_savings", "processor_profit", "negotiable_markup"])(
    "rejects prohibited processor-term semantics: %s", (termValue) => {
      const value = { itemId: "item", questionId: "question", candidateId: "candidate", documentId: "document", locatorId: "locator",
        documentFingerprint: "a".repeat(64), interpretationCode: "bounded_public_term_definition",
        proposedValue: { kind: "term", termCode: "application_fee_terminology", termValue }, sourceAuthorityCandidate: "processor_publication",
        effectiveFromCandidate: null, effectiveToCandidate: null, limitationCodes: [], financialMutationAllowed: false };
      expect(validateInvestigativeMember(value, { itemId: "item", questionId: "question", candidateId: "candidate", documentId: "document",
        documentFingerprint: "a".repeat(64), claimType: "processor_term", subjectCode: "application_fee_terminology", sourceAuthority: "processor_publication" }))
        .toContain("investigative_neutral_vocabulary_required");
    });

  it("rejects unknown artifact/manifest keys and escapes untrusted Markdown", () => {
    const analysis = baseAnalysis();
    expect(validateInternalStatementAnalysisV1({ ...analysis, unexpected: true } as never)).toContain("internal_analysis_shape_invalid");
    expect(validateInternalStatementAnalysisV1({ ...analysis, canonicalFacts: {} } as never)).toContain("internal_analysis_array_shape_invalid");
    const manifest = baseManifest();
    expect(validatePublicSourceEvidenceManifestV1({ ...manifest, unexpected: true } as never)).toContain("public_source_manifest_shape_invalid");
    expect(validatePublicSourceEvidenceManifestV1({ ...manifest, entries: [{ ...manifest.entries[0]!, unexpected: true }] } as never)).toContain("public_source_manifest_entry_shape_invalid");
    const finding = { findingId: "finding", kind: "unresolved_question", title: "Question", displayValue: null, statementEvidenceRefs: [], knowledgeRefs: [],
      researchEvidenceRefs: [], questionOriginRefs: [], proposedValue: null, authority: "unresolved", supportStatus: "verification_unavailable", scopeAndPeriod: "period",
      limitations: [], canonicalMutationAllowed: false, unexpected: true };
    expect(validateInternalStatementAnalysisV1({ ...analysis, unresolvedQuestions: [finding] } as never)).toContain("internal_analysis_finding_shape_or_lane_invalid");
    const markdown = formatInternalAnalysisMarkdown(analysis as never, { ...manifest, entries: [{ ...manifest.entries[0]!, sourceTitle: "](# injected)\n# heading<script>" }] } as never);
    expect(markdown).not.toContain("\n# heading"); expect(markdown).not.toContain("<script>"); expect(markdown).toContain("\\# heading\\<script\\>");
  });

  it("fails invalid bundles before any partial artifact write", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "invalid-internal-bundle-"));
    await expect(writeInternalAnalysisBundle(output, { ...baseAnalysis(), unexpected: true } as never, baseAudit() as never, baseManifest() as never)).rejects.toThrow("invalid_internal_analysis_bundle");
    expect(await readdir(output)).toEqual([]);
  });

  it("refuses existing and symlink artifact targets without overwriting", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "safe-internal-bundle-")); const outside = path.join(os.tmpdir(), `outside-${Date.now()}.json`);
    await writeFile(outside, "do-not-overwrite", "utf8"); await symlink(outside, path.join(output, "internal-analysis.json"));
    await expect(writeInternalAnalysisBundle(output, baseAnalysis() as never, baseAudit() as never, { ...baseManifest(), entries: [] } as never)).rejects.toThrow("artifact_exists");
  });

  it("projects bounded RF audit summaries without private candidate identities", () => {
    const privatePacket = (suffix: string, tenantRef: string, accountRef: string, merchantPrivateValue: string) => ({
      candidateId: `rg-candidate:semantic-support-${suffix.repeat(24)}`, lifecycle: "candidate", privacy: "private_by_default",
      proposedVisibility: "account_private", requiresHumanAdmission: true, tenantRef, accountRef, merchantPrivateValue,
      provenance: { adapter: "bounded_intelligence_runtime", sourceRecordRef: "rg-evidence:semantic-support-safe",
        sourceVersion: "canonical_intelligence_v2_runtime_v1" } }) as never;
    expect(projectRfAuditSummary({ candidatePackets: [], automaticAdmissionCount: 0 })).toEqual({
      projectedCandidateCount: 0, automaticAdmissionCount: 0, projectionStatus: "completed_no_candidates",
      reasonCodes: ["no_supported_rf_candidates_projected", "automatic_knowledge_admission_none"], candidateSummaries: [],
    });
    const firstPrivateContext = privatePacket("a", "tenant-private-123", "account-private-456", "merchant-private-one");
    const changedPrivateContext = privatePacket("a", "different-tenant-private", "different-account-private", "different-merchant-private");
    expect(projectRfAuditSummary({ candidatePackets: [firstPrivateContext], automaticAdmissionCount: 0 }))
      .toEqual(projectRfAuditSummary({ candidatePackets: [changedPrivateContext], automaticAdmissionCount: 0 }));
    const multiple = projectRfAuditSummary({ candidatePackets: [firstPrivateContext,
      privatePacket("b", "tenant-private-789", "account-private-012", "merchant-private-two")],
      automaticAdmissionCount: 3 });
    expect(multiple).toMatchObject({ projectedCandidateCount: 2, automaticAdmissionCount: 3,
      projectionStatus: "completed_with_candidates", reasonCodes: expect.arrayContaining(["automatic_knowledge_admission_reported"]),
      candidateSummaries: [expect.objectContaining({ lifecycle: "candidate", privacy: "private_by_default",
        proposedVisibility: "account_private", requiresHumanAdmission: true, provenanceAdapter: "bounded_intelligence_runtime",
        projectionStatus: "projected_for_human_review" }), expect.any(Object)] });
    expect(JSON.stringify(multiple)).not.toMatch(/merchant-private|tenant-private|account-private-456|source-record/i);
    expect(() => projectRfAuditSummary({ candidatePackets: [{ ...firstPrivateContext,
      candidateId: "merchant-private-candidate-id" } as never], automaticAdmissionCount: 0 }))
      .toThrow("rf_audit_candidate_identity_unsafe");
  });

  it("validates exact-authority PDF retrieval provenance and fails malformed audit summaries closed", () => {
    const fingerprint = "a".repeat(64);
    const retrieval = { questionId: "question", candidateId: "candidate", documentId: "document",
      requestedUrl: "https://example.com/approved.pdf", finalUrl: "https://cdn.example.com/approved.pdf",
      documentFingerprint: fingerprint, authorityAdmissionRef: "approved-publication-v1",
      fingerprintMatchState: "matched_approved_fingerprint", state: "retrieved_extracted", mimeType: "application/pdf",
      byteLength: 12_345, locatorIds: ["locator-one"], reasonCodes: ["deterministic_locator_grounded"] };
    const candidateSummary = { candidateRef: `rf-audit-candidate-${"b".repeat(24)}`, lifecycle: "candidate",
      privacy: "private_by_default", proposedVisibility: "account_private", requiresHumanAdmission: true,
      provenanceAdapter: "bounded_intelligence_runtime", provenanceCode: "canonical_intelligence_v2_runtime_v1",
      projectionStatus: "projected_for_human_review",
      reasonCodes: ["private_by_default", "human_admission_required", "candidate_not_automatically_admitted"] };
    const audit = { ...baseAudit(), retrievalOutcomes: [retrieval], rfProjection: { projectedCandidateCount: 1,
      automaticAdmissionCount: 0, projectionStatus: "completed_with_candidates",
      reasonCodes: ["rf_candidates_projected_for_human_review", "automatic_knowledge_admission_none"],
      candidateSummaries: [candidateSummary] } };
    expect(validateRgInternalAuditV1(audit as never)).toEqual([]);
    const automaticAdmissionReported = { ...audit, rfProjection: { ...audit.rfProjection, automaticAdmissionCount: 2,
      reasonCodes: ["rf_candidates_projected_for_human_review", "automatic_knowledge_admission_reported"] } };
    expect(validateRgInternalAuditV1(automaticAdmissionReported as never)).toEqual([]);
    expect(automaticAdmissionReported.rfProjection.automaticAdmissionCount).toBe(2);
    for (const malformed of [
      { ...audit, rfProjection: { ...audit.rfProjection, candidateSummaries: [{ ...candidateSummary, lifecycle: "admitted" }] } },
      { ...audit, rfProjection: { ...audit.rfProjection, candidateSummaries: [{ ...candidateSummary, privacy: "public" }] } },
      { ...audit, rfProjection: { ...audit.rfProjection, candidateSummaries: [{ ...candidateSummary, proposedVisibility: "world_public" }] } },
      { ...audit, rfProjection: { ...audit.rfProjection, projectedCandidateCount: 2 } },
      { ...audit, rfProjection: { ...audit.rfProjection, candidateSummaries: [{ ...candidateSummary, candidateRef: "tenant-private-123" }] } },
      { ...audit, merchantPrivatePayload: "must-not-be-accepted" },
      { ...audit, retrievalOutcomes: [{ ...retrieval, finalUrl: "http://example.com/approved.pdf" }] },
      { ...audit, retrievalOutcomes: [{ ...retrieval, documentFingerprint: "not-a-fingerprint" }] },
      { ...audit, retrievalOutcomes: [{ ...retrieval, fingerprintMatchState: "looks_close" }] },
      { ...audit, retrievalOutcomes: [{ ...retrieval, mimeType: "application/pdf; arbitrary=true" }] },
      { ...audit, retrievalOutcomes: [{ ...retrieval, locatorIds: ["safe", "not safe"] }] },
    ]) expect(validateRgInternalAuditV1(malformed as never)).not.toEqual([]);
  });

  it("distinguishes deterministic fatal, provider unavailable, research unavailable, and legitimate unresolved completion", () => {
    const runtime = (overrides: Record<string, unknown>) => ({ canonicalTruthPreserved: true, terminalStatus: "completed", searchAttempts: [],
      diagnostics: { stageStatuses: {}, reasonCodes: [] }, ...overrides }) as never;
    expect(internalAnalysisTerminalStatus(runtime({ canonicalTruthPreserved: false }), false)).toBe("blocked_fatal_deterministic_failure");
    expect(internalAnalysisTerminalStatus(runtime({ terminalStatus: "disabled_no_provider" }), true)).toBe("provider_unavailable");
    expect(internalAnalysisTerminalStatus(runtime({ terminalStatus: "invalid", diagnostics: { stageStatuses: { semantic: "malformed_output" }, reasonCodes: ["malformed_provider_output"] } }), true)).toBe("research_unavailable");
    expect(internalAnalysisTerminalStatus(runtime({ terminalStatus: "completed_unresolved" }), true)).toBe("completed_with_unresolved");
    expect(internalAnalysisTerminalStatus(runtime({}), false)).toBe("completed");
  });
});

function baseAnalysis() { return { schemaVersion: "internal_statement_analysis_v1", audience: "internal_analyst_only", authority: "shadow_non_authoritative",
  amendmentIds: ["E2E-AMEND-001-OBSERVATION-TO-INVESTIGATION", "E2E-AMEND-002-LIVE-RESEARCH-OUTCOME"], safeStatementId: "safe", runId: "run", evaluatedAt: "2026-08-24T00:00:00.000Z",
  executionStatus: "completed", researchOutcome: "research_completed", researchQuestionOutcomes: [],
  terminalStatus: "completed", canonicalBeforeHash: "a".repeat(64), canonicalAfterHash: "a".repeat(64), canonicalTruthPreserved: true, canonicalFacts: [], statementObservations: [],
  admittedKnowledge: [], supportedResearchFindings: [], investigativeHypotheses: [], contradictions: [], unresolvedQuestions: [], recommendations: [], impact: [], limitations: [] }; }
function baseManifest() { return { schemaVersion: "public_source_evidence_manifest_v1", privacy: "internal_pre_uat_public_evidence", downloadedBodiesPersisted: false,
  entries: [{ evidenceId: "evidence", supportId: "support", questionId: "question", candidateId: "candidate", sourceUrl: "https://example.com/rules/visa/current",
    sourceTitle: "Public title", sourceAuthority: "official_network_publication", authorityAdmissionRef: "admission", retrievedAt: "2026-08-24T00:00:00.000Z",
    documentId: "document", documentFingerprint: "a".repeat(64), locator: { locatorId: "locator", page: 1, sectionCode: "rule", lineStart: 1, lineEnd: 1 },
    boundedSupportingExcerpt: "Public excerpt", semanticVerification: "supported_candidate", limitations: [] }] }; }
function baseAudit() { return { schemaVersion: "rg_internal_analysis_audit_v2", runId: "run", executionMode: "injected_evaluation", externalNetworkCallCount: 0,
  liveTimingPolicy: { amendmentId: "RG-AMEND-011-INTERNAL-LIVE-TIMING-V2", searchTimeoutMs: 40_000, globalWallTimeMs: 180_000 },
  providerOperationReceipts: [], searchAttempts: [], retrievalOutcomes: [], questions: [], verificationOutcomes: [], budget: { profile: "RG-FREE-v1", limits: {}, consumed: {}, remaining: {}, reservations: [], exhaustedDimensions: [] },
  diagnostics: { schemaVersion: "canonical_intelligence_v2_diagnostics_v1", stageStatuses: {}, counts: {}, elapsedMs: {}, providerCodes: [], modelCodes: [], tokenUsage: 0, reasonCodes: [] },
  observationPlanning: { schemaVersion: "observation_planning_audit_v1", registryId: "fiserv_observation_subject_registry",
    registryVersion: "2.0.0", templateFamily: "fiserv_first_data_short_structural_mapping", rawNonzeroObservationCount: 0,
    normalizedObservationIdentityCount: 0, mappedSubjectCount: 0, suppressedObservationCount: 0,
    suppressedCountsByReason: {}, observations: [], subjects: [], eligibleSubjectCount: 0, selectedQuestionCount: 0, subjectDecisions: [] },
  rfProjection: { projectedCandidateCount: 0, automaticAdmissionCount: 0, projectionStatus: "completed_no_candidates",
    reasonCodes: ["no_supported_rf_candidates_projected", "automatic_knowledge_admission_none"], candidateSummaries: [] },
  canonicalBeforeHash: "same", canonicalAfterHash: "same", canonicalTruthPreserved: true, rfSnapshotHash: "hash", rfEntryRefs: [], policyVersions: [] }; }
