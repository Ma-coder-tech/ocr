import { mkdtemp, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorityAdmissionForCandidate, createPublicSourceAuthorityAdmission, formatInternalAnalysisMarkdown,
  planRuntimeResearchQuestions, validateInvestigativeMember, validateInternalStatementAnalysisV1,
  validatePublicSourceEvidenceManifestV1, writeInternalAnalysisBundle,
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
function baseAudit() { return { schemaVersion: "rg_internal_analysis_audit_v1", runId: "run", executionMode: "injected_evaluation", externalNetworkCallCount: 0,
  liveTimingPolicy: { amendmentId: "RG-AMEND-011-INTERNAL-LIVE-TIMING-V2", searchTimeoutMs: 40_000, globalWallTimeMs: 180_000 },
  providerOperationReceipts: [], searchAttempts: [], retrievalOutcomes: [], questions: [], verificationOutcomes: [], budget: { profile: "RG-FREE-v1", limits: {}, consumed: {}, remaining: {}, reservations: [], exhaustedDimensions: [] },
  diagnostics: { schemaVersion: "canonical_intelligence_v2_diagnostics_v1", stageStatuses: {}, counts: {}, elapsedMs: {}, providerCodes: [], modelCodes: [], tokenUsage: 0, reasonCodes: [] },
  canonicalBeforeHash: "same", canonicalAfterHash: "same", canonicalTruthPreserved: true, rfSnapshotHash: "hash", rfEntryRefs: [], policyVersions: [] }; }
