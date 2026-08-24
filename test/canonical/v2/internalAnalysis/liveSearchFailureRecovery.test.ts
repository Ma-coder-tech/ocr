import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LiveOperationTransportError,
  runFiservInternalAnalysisEvaluationV1,
  type RuntimeClock,
  type SearchRequest,
  validateRgInternalAuditV1,
} from "../../../../src/canonical/v2/index.js";
import { createInjectedStatement1Fixture } from "./injectedStatement1Fixture.js";

const statementOne = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
const safeReceiptDiagnostics = {
  httpStatus: null, localRequestId: null, providerRequestId: null, providerResponseId: null,
  requestedModelIdentifier: null, returnedModelIdentifier: null, finishReason: null, toolExecutionState: null,
  annotationCount: null, normalizedCandidateCount: null, providerErrorType: null, providerErrorCode: null,
  providerErrorParam: null, structuredOutputValidation: "not_applicable" as const,
};

class TimeoutAwareInjectedClock implements RuntimeClock {
  private current = 0;
  readonly requestedTimeouts: number[] = [];
  constructor(private readonly elapsedByOperation: number[]) {}
  nowMs(): number { return this.current; }
  async runWithTimeout<T>(timeoutMs: number, operation: () => Promise<T>) {
    this.requestedTimeouts.push(timeoutMs);
    this.current += this.elapsedByOperation.shift() ?? 1;
    try { return { status: "completed" as const, value: await operation() }; }
    catch (error) {
      return error instanceof LiveOperationTransportError && error.transportState === "timed_out"
        ? { status: "timeout" as const }
        : { status: "failed" as const, reasonCode: error instanceof Error ? error.message : "injected_operation_failed" };
    }
  }
}

describe("Statement 1 live-search failure recovery", () => {
  it("retains retrieved and grounded public evidence as explicitly unverified when investigation fails", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "statement-one-investigation-failure-evidence-"));
    const injected = createInjectedStatement1Fixture();
    injected.ports.investigative = {
      providerCode: "injected_openai_responses_contract", modelCode: "injected_investigative_model",
      async investigate(request) {
        injected.providerAudit.record({ receiptId: "injected-investigative-failure", reservationId: request.reservationId,
          operationId: request.reservationId.slice(0, -":call".length), operation: "investigative_model",
          providerCode: "injected_openai_responses_contract", logicalAttempt: 1, actualSendCount: 0, retryCount: 0,
          sendState: "not_sent", completionState: "failed", elapsedMs: 1, usageState: "known", outputTokens: null,
          providerRequestCount: null, usageCostUsd: 0, providerConfigurationCode: "injected_failure_v1", httpStatus: null,
          localRequestId: null, providerRequestId: null, providerResponseId: null, requestedModelIdentifier: null,
          returnedModelIdentifier: null, finishReason: null, toolExecutionState: null, annotationCount: null,
          normalizedCandidateCount: null, providerErrorType: null, providerErrorCode: null, providerErrorParam: null,
          structuredOutputValidation: "not_reached", safeReasonCode: "injected_investigative_failure" });
        throw new Error("injected_investigative_failure");
      },
    };
    const result = await runFiservInternalAnalysisEvaluationV1({
      statementPaths: [statementOne], safeStatementId: "fsv-03-clover-short-jun",
      runVersion: "run-3-foundational-admissions-pricing-fixed", outputDirectory,
      sourceProfile: { statementCompleteness: "unknown" }, internalRunId: "statement-one-investigation-failure-evidence",
      evaluatedAt: "2026-08-24T00:00:00.000Z", tenantRef: "tenant-private-fixture", accountRef: "account-private-fixture",
      admittedKnowledge: [], ports: injected.ports, providerAudit: injected.providerAudit,
      providerPreflight: injected.providerPreflight, publicSourceAuthorityAdmissions: injected.publicSourceAuthorityAdmissions,
    });
    expect(result.runtime.documents).toEqual([expect.objectContaining({ state: "retrieved_extracted", locatorIds: expect.any(Array) })]);
    expect(result.runtime.supports).toEqual([]);
    expect(result.publicEvidence.entries).toEqual([expect.objectContaining({ semanticVerification: "verification_unavailable",
      sourceAuthority: "processor_publication", authorityAdmissionRef: expect.any(String), documentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      limitations: expect.arrayContaining(["source_existence_and_provenance_established", "semantic_verification_not_completed",
        "not_supported_research_finding", "canonical_and_economic_authority_unchanged"]) })]);
    expect(result.analysis.supportedResearchFindings).toEqual([]);
    expect(result.analysis.recommendations).not.toContainEqual(expect.objectContaining({ kind: "supported_economic_action" }));
    expect(result.analysis.impact.some((item) => item.state.startsWith("potential_reduction"))).toBe(false);
    expect(result.analysis.canonicalTruthPreserved).toBe(true);
    expect(result.analysis.canonicalBeforeHash).toBe(result.analysis.canonicalAfterHash);
    expect(validateRgInternalAuditV1(result.rgAudit)).toEqual([]);
  }, 30_000);

  it("fails missing search-tool execution evidence closed without an adaptive search", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "statement-one-search-tool-unverified-"));
    const injected = createInjectedStatement1Fixture();
    let calls = 0;
    injected.ports.search = {
      providerCode: "injected_openrouter_search_contract",
      async search(request: SearchRequest) {
        calls += 1;
        injected.providerAudit.record({ receiptId: "unverified-search-receipt", reservationId: request.reservationId,
          operationId: request.attemptId, operation: "search", providerCode: "injected_openrouter_search_contract",
          logicalAttempt: 1, actualSendCount: 0, retryCount: 0, sendState: "not_sent", completionState: "failed",
          elapsedMs: 1, usageState: "known", outputTokens: null, providerRequestCount: null, usageCostUsd: 0,
          providerConfigurationCode: "injected_openrouter_perplexity_v1", ...safeReceiptDiagnostics,
          safeReasonCode: "search_tool_execution_unverified" });
        return { attemptId: request.attemptId, questionId: request.questionId, candidates: [], suggestedAdaptiveReason: null,
          providerMetadata: { providerResponseId: "injected-unverified", modelIdentifier: "openai/gpt-5.2", finishReason: "stop",
            webSearchRequestCount: null, annotationCount: 0, normalizedCandidateCount: 0,
            providerCompletionState: "completed" as const, toolExecutionState: "unverified" as const },
          outputAccounting: "search_discovery_not_model_generation" as const };
      },
    };
    const result = await runFiservInternalAnalysisEvaluationV1({
      statementPaths: [statementOne], safeStatementId: "fsv-03-clover-short-jun",
      runVersion: "run-3-foundational-admissions-pricing-fixed", outputDirectory,
      sourceProfile: { statementCompleteness: "unknown" }, internalRunId: "statement-one-search-tool-unverified",
      evaluatedAt: "2026-08-24T00:00:00.000Z", tenantRef: "tenant-private-fixture", accountRef: "account-private-fixture",
      admittedKnowledge: [], ports: injected.ports, providerAudit: injected.providerAudit,
      providerPreflight: injected.providerPreflight, publicSourceAuthorityAdmissions: injected.publicSourceAuthorityAdmissions,
    });
    expect(calls).toBe(1);
    expect(result.runtime.searchAttempts).toEqual([expect.objectContaining({ status: "failed",
      reasonCodes: ["search_tool_execution_unverified"], providerMetadata: expect.objectContaining({ toolExecutionState: "unverified" }) })]);
    expect(result.analysis.researchOutcome).toBe("search_tool_execution_unverified");
    expect(result.analysis.researchQuestionOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionClass: "application_fee_public_definition", outcome: "search_tool_execution_unverified" }),
      expect.objectContaining({ questionClass: "non_swiped_discount_public_definition", outcome: "research_completed" }),
    ]));
    expect(result.rgAudit.externalNetworkCallCount).toBe(0);
    expect(validateRgInternalAuditV1(result.rgAudit)).toEqual([]);
  }, 30_000);

  it.each([
    { firstOutcome: "timeout" as const, failureCall: 1, expectedAttemptStatus: "timeout", expectedReservationState: "timeout", expectedReason: "search_timeout" },
    { firstOutcome: "timeout" as const, failureCall: 2, expectedAttemptStatus: "timeout", expectedReservationState: "timeout", expectedReason: "search_timeout" },
    { firstOutcome: "malformed" as const, failureCall: 1, expectedAttemptStatus: "failed", expectedReservationState: "failed", expectedReason: "openrouter_search_response_malformed" },
  ])("keeps mixed $firstOutcome/no-candidate research unresolved with a valid bundle", async ({ firstOutcome, failureCall, expectedAttemptStatus, expectedReservationState, expectedReason }) => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), `statement-one-${firstOutcome}-recovery-`));
    const injected = createInjectedStatement1Fixture();
    const clock = new TimeoutAwareInjectedClock(firstOutcome === "timeout"
      ? (failureCall === 1 ? [40_001, 1] : [1, 40_001]) : [1, 1]);
    injected.ports.clock = clock;
    let calls = 0;
    injected.ports.search = {
      providerCode: "injected_openrouter_search_contract",
      async search(request: SearchRequest) {
        calls += 1;
        const isFailure = calls === failureCall;
        const completionState = isFailure ? (firstOutcome === "timeout" ? "timed_out" : "failed") : "completed";
        injected.providerAudit.record({
          receiptId: `mixed-search-receipt-${calls}`,
          reservationId: request.reservationId,
          operationId: request.attemptId,
          operation: "search",
          providerCode: "injected_openrouter_search_contract",
          logicalAttempt: 1,
          actualSendCount: 0,
          retryCount: 0,
          sendState: "not_sent",
          completionState,
          elapsedMs: isFailure && firstOutcome === "timeout" ? 40_001 : 1,
          usageState: "known",
          outputTokens: null,
          providerRequestCount: isFailure ? null : 0,
          usageCostUsd: isFailure ? null : 0,
          providerConfigurationCode: "injected_openrouter_perplexity_v1",
          ...safeReceiptDiagnostics,
          safeReasonCode: isFailure ? (firstOutcome === "timeout" ? "provider_operation_failed" : "openrouter_search_response_malformed") : "search_completed_no_candidates",
        });
        if (isFailure) {
          if (firstOutcome === "timeout") throw new LiveOperationTransportError("timed_out", "provider_operation_failed");
          throw new Error("openrouter_search_response_malformed");
        }
        return { attemptId: request.attemptId, questionId: request.questionId, candidates: [], suggestedAdaptiveReason: null,
          providerMetadata: { providerResponseId: `injected-mixed-${calls}`, modelIdentifier: "openai/gpt-5.2", finishReason: "stop",
            webSearchRequestCount: 1, annotationCount: 0, normalizedCandidateCount: 0,
            providerCompletionState: "completed" as const, toolExecutionState: "verified" as const },
          outputAccounting: "search_discovery_not_model_generation" as const };
      },
    };

    const result = await runFiservInternalAnalysisEvaluationV1({
      statementPaths: [statementOne], safeStatementId: "fsv-03-clover-short-jun",
      runVersion: "run-3-foundational-admissions-pricing-fixed", outputDirectory,
      sourceProfile: { statementCompleteness: "unknown" }, internalRunId: `statement-one-${firstOutcome}-recovery`,
      evaluatedAt: "2026-08-24T00:00:00.000Z", tenantRef: "tenant-private-fixture", accountRef: "account-private-fixture",
      admittedKnowledge: [], ports: injected.ports, providerAudit: injected.providerAudit,
      providerPreflight: injected.providerPreflight, publicSourceAuthorityAdmissions: injected.publicSourceAuthorityAdmissions,
    });

    const expectedSearchCalls = failureCall === 1 ? 1 : 2;
    expect(calls).toBe(expectedSearchCalls);
    expect(result.investigationOrigins.origins).toHaveLength(2);
    expect(result.runtime.searchAttempts).toHaveLength(expectedSearchCalls);
    expect(clock.requestedTimeouts).toEqual([
      ...Array(expectedSearchCalls).fill(40_000), 12_000, 12_000, 20_000, 20_000,
    ]);
    expect(result.runtime.searchAttempts[failureCall - 1]).toMatchObject({ status: expectedAttemptStatus, candidateIds: [], reasonCodes: [expectedReason] });
    if (failureCall === 2) expect(result.runtime.searchAttempts[0]).toMatchObject({ status: "no_candidates", candidateIds: [],
      reasonCodes: ["provider_search_completed_zero_candidates"] });
    expect(result.runtime.candidates).toHaveLength(1);
    expect(result.runtime.documents).toHaveLength(1);
    expect(result.runtime.supports).toHaveLength(1);
    expect(result.analysis).toMatchObject({ executionStatus: "completed",
      researchOutcome: firstOutcome === "timeout" ? "research_unavailable_due_to_timeout" : "provider_failure",
      terminalStatus: "research_unavailable", canonicalTruthPreserved: true });
    expect(result.analysis.researchQuestionOutcomes.map((outcome) => outcome.outcome)).toEqual([
      firstOutcome === "timeout" ? "research_unavailable_due_to_timeout" : "provider_failure", "research_completed",
    ]);
    const nonSwipedOutcome = result.analysis.researchQuestionOutcomes.find((outcome) => outcome.questionClass === "non_swiped_discount_public_definition")!;
    const applicationOutcome = result.analysis.researchQuestionOutcomes.find((outcome) => outcome.questionClass === "application_fee_public_definition")!;
    expect(nonSwipedOutcome.publicResearchStillPossible).toBe(true);
    expect(applicationOutcome.publicResearchStillPossible).toBe(false);
    expect(result.analysis.recommendations.filter((recommendation) => recommendation.kind === "documentation_request")).toHaveLength(1);
    if (firstOutcome === "timeout") {
      const timedOutQuestion = applicationOutcome;
      const timedOutFinding = result.analysis.unresolvedQuestions.find((finding) => finding.findingId.endsWith(createHash("sha256")
        .update(timedOutQuestion.questionId).digest("hex").slice(0, 20)))!;
      expect(timedOutFinding.limitations).toEqual(expect.arrayContaining([
        "public_research_provider_timed_out", "no_conclusion_about_public_source_availability",
      ]));
    }
    expect(result.analysis.unresolvedQuestions).toHaveLength(1);
    expect(result.analysis.supportedResearchFindings).toHaveLength(1);
    expect(result.analysis.recommendations).not.toContainEqual(expect.objectContaining({ kind: "supported_economic_action" }));
    expect(result.analysis.impact.some((item) => item.state.startsWith("potential_reduction"))).toBe(false);
    expect(result.rgAudit.externalNetworkCallCount).toBe(0);
    expect(result.rgAudit.providerOperationReceipts).toHaveLength(expectedSearchCalls + 3);
    expect(result.rgAudit.providerOperationReceipts.every((receipt) => receipt.retryCount === 0 && receipt.actualSendCount === 0)).toBe(true);
    const failureReceipt = result.rgAudit.providerOperationReceipts.find((receipt) => receipt.operation === "search"
      && receipt.completionState === (firstOutcome === "timeout" ? "timed_out" : "failed"))!;
    const failureReservation = result.rgAudit.budget.reservations.find((reservation) => reservation.reservationId === failureReceipt.reservationId);
    expect(failureReceipt.completionState).toBe(firstOutcome === "timeout" ? "timed_out" : "failed");
    expect(failureReservation?.state).toBe(expectedReservationState);
    expect(validateRgInternalAuditV1(result.rgAudit)).toEqual([]);
    expect(result.analysis.canonicalBeforeHash).toBe(result.analysis.canonicalAfterHash);
    expect((await readdir(outputDirectory)).sort()).toEqual([
      "internal-analysis.json", "internal-analysis.md", "public-source-evidence.json", "review.md",
      "rg-audit.json", "rh-projection.json", "run-audit.json",
    ]);
    const projection = await readFile(path.join(outputDirectory, "rh-projection.json"));
    expect(createHash("sha256").update(projection).digest("hex"))
      .toBe("5e2fc1e17eaaacb4e891be1986f43982b139d94ef6e3bb092b5bcfee407158ac");
  }, 30_000);
});
