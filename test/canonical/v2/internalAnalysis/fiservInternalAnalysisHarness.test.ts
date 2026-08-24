import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL,
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
    expect(result.runtime.candidates[0]).toMatchObject({ candidateId: "injected-non-swiped-definition",
      authorityPublicationFamilyCode: "first_data_us_swipe_non_swipe_statement_guide" });
    expect(result.runtime.searchAttempts.find((item) => item.questionId === result.runtime.questions
      .find((question) => question.subjectCode === "application_fee_terminology")!.questionId)).toMatchObject({
      status: "no_candidates", candidateIds: [], reasonCodes: ["no_eligible_discovery_candidates"],
    });
    expect(result.runtime.supports.map((item) => item.verificationStatus)).toEqual(["supported_candidate"]);
    expect(result.runtime.supports[0]!.subjectCode).toBe("non_swiped_discount_terminology");
    expect(result.runtime.supports[0]!.limitationCodes).toEqual(expect.arrayContaining([
      "terminology_example_presentation_only", "public_scope_applicability_unproven", "ownership_control_and_savings_unresolved",
    ]));
    expect(result.analysis).toMatchObject({ terminalStatus: "completed_with_unresolved", canonicalTruthPreserved: true });
    expect(result.analysis.supportedResearchFindings).toHaveLength(1);
    expect(result.analysis.supportedResearchFindings[0]!.proposedValue).toMatchObject({
      kind: "term", termCode: "non_swiped_discount_terminology", termValue: "official_definition_found",
    });
    expect(result.analysis.investigativeHypotheses).toHaveLength(0);
    expect(result.analysis.unresolvedQuestions).toHaveLength(1);
    expect(result.analysis.unresolvedQuestions[0]!.title).toMatch(/application fee/i);
    expect(result.analysis.recommendations.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "verification_action", "documentation_request",
    ]));
    expect(result.analysis.recommendations).not.toContainEqual(expect.objectContaining({ kind: "research_followup" }));
    expect(result.analysis.recommendations).not.toContainEqual(expect.objectContaining({ kind: "supported_economic_action" }));
    expect(result.analysis.impact.map((item) => ({ state: item.state, amountMinor: item.amountMinor, annualized: item.annualized })))
      .toEqual([{ state: "observed_cost", amountMinor: 9_900, annualized: false },
        { state: "observed_cost", amountMinor: 4_231, annualized: false }]);
    expect(result.analysis.impact.some((item) => item.state.startsWith("potential_reduction"))).toBe(false);
    expect(result.analysis.canonicalBeforeHash).toBe(result.analysis.canonicalAfterHash);
    expect(result.rgAudit).toMatchObject({ executionMode: "injected_evaluation", externalNetworkCallCount: 0,
      canonicalTruthPreserved: true, budget: { profile: "RG-FREE-v1" } });
    expect(result.rgAudit.budget.consumed).toMatchObject({ search_calls: 2, candidates: 1, retrieval_documents: 1,
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
    const serializedInternal = `${await readFile(path.join(outputDirectory, "internal-analysis.json"), "utf8")}${await readFile(path.join(outputDirectory, "rg-audit.json"), "utf8")}${await readFile(path.join(outputDirectory, "public-source-evidence.json"), "utf8")}`;
    const withoutApprovedPublicDocumentUrl = serializedInternal.replaceAll(FISERV_FIRST_DATA_US_SWIPE_NON_SWIPE_URL, "https://approved-public-source.invalid/document");
    expect(withoutApprovedPublicDocumentUrl).not.toMatch(/raw prompt|raw response|chain.of.thought|SAMPLE_MERCHANT|\/Users\/|\.pdf\b/i);
    expect(JSON.parse(await readFile(path.join(outputDirectory, "public-source-evidence.json"), "utf8"))).toMatchObject({ downloadedBodiesPersisted: false });
    const projection = await readFile(path.join(outputDirectory, "rh-projection.json"));
    expect(createHash("sha256").update(projection).digest("hex"))
      .toBe("5e2fc1e17eaaacb4e891be1986f43982b139d94ef6e3bb092b5bcfee407158ac");
  }, 30_000);
});
