import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_EVALUATION_TIMEOUT_POLICY,
  ONE_TIME_RESEARCH_REQUEST_SLOTS,
  liveEvaluationEffectiveTimeoutMs,
  runWithLiveEvaluationTimeout,
  type LiveEvaluationTimedStage,
} from "../src/evaluationIntegrity/index.js";

describe("live evaluation reliability policy", () => {
  afterEach(() => vi.useRealTimers());

  it("defines separate deterministic per-call and research-graph limits", () => {
    expect(LIVE_EVALUATION_TIMEOUT_POLICY).toEqual({
      policyVersion: "live_evaluation_timeout_policy_v2",
      perCallMs: {
        web_search_discovery: 90_000,
        document_retrieval: 30_000,
        statement_investigative_intelligence: 120_000,
        retrieved_document_investigative_intelligence: 120_000,
        semantic_verification: 60_000,
        whole_statement_ai_review: 300_000,
      },
      researchGraphTotalMs: 660_000,
    });
    expect(liveEvaluationEffectiveTimeoutMs({
      stage: "web_search_discovery",
      remainingResearchGraphMs: 12_345,
    })).toBe(12_345);
    expect(liveEvaluationEffectiveTimeoutMs({
      stage: "web_search_discovery",
      remainingResearchGraphMs: 100_000,
    })).toBe(90_000);
  });

  it.each([
    ["web_search_discovery", 90_000, "fee_knowledge_web_search_timed_out"],
    ["document_retrieval", 30_000, "fee_knowledge_retrieval_timed_out"],
    ["statement_investigative_intelligence", 120_000, "fee_knowledge_statement_investigative_timed_out"],
    ["retrieved_document_investigative_intelligence", 120_000, "fee_knowledge_retrieved_document_investigative_timed_out"],
    ["semantic_verification", 60_000, "fee_knowledge_semantic_timed_out"],
    ["whole_statement_ai_review", 300_000, "whole_statement_ai_review_timed_out"],
  ] as const)("aborts %s once at its exact per-call deadline", async (stage, timeoutMs, reasonCode) => {
    vi.useFakeTimers();
    let aborts = 0;
    const pending = runWithLiveEvaluationTimeout({
      stage: stage as LiveEvaluationTimedStage,
      scope: "per_call",
      timeoutMs,
      operation: async (signal) => new Promise<never>(() => {
        signal.addEventListener("abort", () => { aborts += 1; }, { once: true });
      }),
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "provider_timeout",
      evaluationTimeoutScope: "per_call",
      reasonCode,
    });

    await vi.advanceTimersByTimeAsync(timeoutMs - 1);
    expect(aborts).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(aborts).toBe(1);
  });

  it("allows a controlled 16-second discovery operation and still enforces the graph deadline", async () => {
    vi.useFakeTimers();
    const discovery = runWithLiveEvaluationTimeout({
      stage: "web_search_discovery",
      scope: "per_call",
      timeoutMs: LIVE_EVALUATION_TIMEOUT_POLICY.perCallMs.web_search_discovery,
      operation: async () => new Promise<string>((resolve) => setTimeout(() => resolve("completed"), 16_000)),
    });
    await vi.advanceTimersByTimeAsync(16_000);
    await expect(discovery).resolves.toBe("completed");

    const graphDeadline = runWithLiveEvaluationTimeout({
      stage: "semantic_verification",
      scope: "research_graph",
      timeoutMs: 15_000,
      operation: async () => new Promise<never>(() => undefined),
    });
    const rejection = expect(graphDeadline).rejects.toMatchObject({
      code: "provider_timeout",
      evaluationTimeoutScope: "research_graph",
      reasonCode: "fee_knowledge_research_graph_timed_out",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it("preserves the approved five-statement reservation total and captured failure shape", async () => {
    const fixture = JSON.parse(await readFile(
      path.resolve(process.cwd(), "test/fixtures/evaluation/live-research-timeout-summary-v1.json"),
      "utf8",
    ));
    expect(fixture).toMatchObject({
      selectedStatementCount: 5,
      observedOutcomes: {
        webSearchTimeouts: 5,
        laterWebSearchCancellations: 5,
        retrievalCancellations: 25,
        semanticCancellations: 25,
        wholeStatementCancellations: 5,
      },
      requiredCorrectedBehavior: {
        researchFailureCancelsOnlyResearchCalls: true,
        wholeStatementReviewRemainsEligible: true,
        unknownBillingRetainsReservation: true,
      },
    });
    const perStatementReservation = 0.3225
      + ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch * 0.53
      + ONE_TIME_RESEARCH_REQUEST_SLOTS.retrieval * 0.001
      + ONE_TIME_RESEARCH_REQUEST_SLOTS.semanticVerification * 0.01512;
    expect(perStatementReservation * fixture.selectedStatementCount).toBeCloseTo(12.8573, 6);
  });
});
