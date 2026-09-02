import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildStatementObservationInvestigationOrigins,
  buildInternalStatementAnalysisV1,
  runBoundedIntelligenceRuntime,
  runFiservOneStatementEvaluation,
  unboundedKnowledgeScope,
  type FiservDeterministicEvaluationContext,
  type KnowledgeEntry,
  type RuntimeClock,
} from "../../../../src/canonical/v2/index.js";

const statementOne = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
let deterministic: FiservDeterministicEvaluationContext;

class Clock implements RuntimeClock {
  private current = 0;
  nowMs(): number { return this.current; }
  async runWithTimeout<T>(_timeoutMs: number, operation: () => Promise<T>) {
    this.current += 1;
    return { status: "completed" as const, value: await operation() };
  }
}

function termEntry(id: string, subjectCode: "application_fee_terminology" | "non_swiped_discount_terminology", termValue: string): KnowledgeEntry {
  return { id, version: 1, claimType: "processor_term", subjectCode,
    value: { kind: "term", termCode: subjectCode, termValue }, scope: unboundedKnowledgeScope(), visibility: "reusable",
    tenantRef: null, accountRef: null, effectiveFrom: null, effectiveTo: null,
    evidence: [{ ref: `evidence-${id}`, sourceAuthority: "processor_publication", private: false }],
    admission: { lifecycle: "admitted", authorityClass: "authorized_domain_reviewer", authorityRef: "review-role",
      admittedAt: "2026-08-01T00:00:00Z", conditions: [] }, supersedes: [], limitations: [], confidence: "high" };
}

beforeAll(async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "origin-rf-foundation-"));
  deterministic = (await runFiservOneStatementEvaluation({ statementPaths: [statementOne], safeStatementId: "statement-one-origin-tests",
    runVersion: "origin-tests", outputDirectory, sourceProfile: { statementCompleteness: "unknown" } })).deterministic;
}, 30_000);

describe("Statement-observation origin eligibility and RF-first wiring", () => {
  it("is stable, material only for nonzero charges, deduplicated by occurrence, and rejects unregistered labels", () => {
    const first = buildStatementObservationInvestigationOrigins({ foundation: deterministic.foundation, admittedKnowledge: [],
      tenantRef: "tenant-a", accountRef: "account-a" });
    const second = buildStatementObservationInvestigationOrigins({ foundation: deterministic.foundation, admittedKnowledge: [],
      tenantRef: "tenant-a", accountRef: "account-a" });
    expect(first.origins).toEqual(second.origins);
    expect(first.origins).toHaveLength(2);
    expect(first.origins.every((origin) => origin.occurrenceRefs.length > 0 && origin.evidenceRefs.length > 0
      && origin.observedAmountMinor !== 0 && origin.canonicalMutationAllowed === false)).toBe(true);
    expect(first.rejected.length).toBeGreaterThan(0);
    expect(first.rejected.every((item) => item.reasonCode === "observation_label_not_registered")).toBe(true);

    const duplicated = structuredClone(deterministic.foundation);
    const application = duplicated.sourceModel.occurrences.find((item) => item.sourceLabel.toLowerCase().includes("application fee"))!;
    duplicated.sourceModel.occurrences.push(structuredClone(application));
    const deduplicated = buildStatementObservationInvestigationOrigins({ foundation: duplicated, admittedKnowledge: [],
      tenantRef: "tenant-a", accountRef: "account-a" });
    expect(deduplicated.origins.find((item) => item.questionClass === "application_fee_public_definition")!.occurrenceRefs)
      .toEqual(first.origins.find((item) => item.questionClass === "application_fee_public_definition")!.occurrenceRefs);

    const zeroed = structuredClone(deterministic.foundation);
    for (const occurrence of zeroed.sourceModel.occurrences) if (occurrence.sourceLabel.toLowerCase().includes("application fee")) {
      occurrence.printedAmount = occurrence.printedAmount ? { ...occurrence.printedAmount, amountMinor: 0 } : null;
    }
    expect(buildStatementObservationInvestigationOrigins({ foundation: zeroed, admittedKnowledge: [], tenantRef: "tenant-a", accountRef: "account-a" })
      .origins.map((item) => item.questionClass)).toEqual(["non_swiped_discount_public_definition"]);
  });

  it("does not search an RF-resolved question and preserves an RF conflict as non-eligible", async () => {
    const run = async (entries: KnowledgeEntry[]) => {
      const origins = buildStatementObservationInvestigationOrigins({ foundation: deterministic.foundation, admittedKnowledge: entries,
        tenantRef: "tenant-a", accountRef: "account-a" });
      let searches = 0;
      const result = await runBoundedIntelligenceRuntime({ runId: `rf-wiring-${entries.length}-${entries.map((item) => item.id).join("-")}`,
        canonicalTruth: deterministic.foundation, canonicalReferenceIds: origins.origins.flatMap((item) => [...item.occurrenceRefs, ...item.evidenceRefs]),
        admittedKnowledge: entries, unknownQueue: origins.unknownQueue, questionOrigins: origins.runtimeOrigins,
        providerQuestionContexts: origins.origins.map((origin, index) => ({ unknownRef: origin.unknownRef, context: origins.providerContexts[index]! })),
        publicSourceAuthorityAdmissions: [], deterministicNotApplicableUnknownRefs: [], languageInputs: [] }, {
        clock: new Clock(), search: { providerCode: "injected_no_candidate_search", async search(request) { searches += 1;
          return { attemptId: request.attemptId, questionId: request.questionId, candidates: [], suggestedAdaptiveReason: null,
            providerMetadata: { providerResponseId: `injected-rf-${searches}`, modelIdentifier: "injected-search",
              finishReason: "stop", webSearchRequestCount: 1, annotationCount: 0, normalizedCandidateCount: 0,
              providerCompletionState: "completed" as const, toolExecutionState: "verified" as const },
            outputAccounting: "search_discovery_not_model_generation" }; } },
      });
      return { result, searches, origins };
    };
    const resolved = await run([termEntry("application-admitted", "application_fee_terminology", "defined_public_term")]);
    expect(resolved.searches).toBe(2);
    expect(resolved.result.questions.find((item) => item.subjectCode === "application_fee_terminology"))
      .toMatchObject({ eligibility: "rf_resolved", selection: "not_eligible", rfResolution: { status: "resolved_single" } });
    const conflict = await run([
      termEntry("application-conflict-a", "application_fee_terminology", "definition_a"),
      termEntry("application-conflict-b", "application_fee_terminology", "definition_b"),
    ]);
    expect(conflict.searches).toBe(2);
    expect(conflict.result.questions.find((item) => item.subjectCode === "application_fee_terminology"))
      .toMatchObject({ eligibility: "unresolved_review_required", selection: "not_eligible", rfResolution: { status: "unresolved_conflict" } });
    expect(conflict.result.rfConflictsPreserved).toBe(true);
    const analysis = buildInternalStatementAnalysisV1({ safeStatementId: "statement-one-rf-conflict", runId: "rf-conflict-artifact",
      evaluatedAt: "2026-08-24T00:00:00.000Z", foundation: deterministic.foundation, origins: conflict.origins.origins,
      admittedKnowledge: [termEntry("application-conflict-a", "application_fee_terminology", "definition_a"),
        termEntry("application-conflict-b", "application_fee_terminology", "definition_b")], runtime: conflict.result,
      publicEvidence: { schemaVersion: "public_source_evidence_manifest_v1", privacy: "internal_pre_uat_public_evidence", downloadedBodiesPersisted: false, entries: [] },
      publicSourceAuthorityAdmissions: [],
      canonicalBeforeHash: "same", canonicalAfterHash: "same" });
    expect(analysis.unresolvedQuestions).toEqual(expect.arrayContaining([expect.objectContaining({
      title: expect.stringContaining("Admitted knowledge conflicts"), authority: "unresolved", limitations: expect.arrayContaining(["rf_conflict_preserved_no_ai_arbitration"]),
    })]));
    expect(analysis.admittedKnowledge).toEqual([]);
    expect(analysis.recommendations).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "documentation_request" })]));
    const documentationRequests = analysis.recommendations.filter((item) => item.kind === "documentation_request");
    expect(documentationRequests.map((item) => item.title)).toEqual(expect.arrayContaining([
      expect.stringContaining("observed $99.00 Application Fee"),
      expect.stringContaining("observed $42.31 Non Swiped Discount"),
    ]));
    expect(documentationRequests.every((item) => item.actionabilityCeiling === "documentation_only"
      && item.merchantControl === "unresolved")).toBe(true);
  });
});
