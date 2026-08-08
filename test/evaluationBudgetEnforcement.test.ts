import { describe, expect, it } from "vitest";
import {
  OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS,
  OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS,
  openAiSemanticSupportAdapter,
  openAiWebSearchAdapter,
} from "../src/canonical/feeKnowledgeResearch.js";
import { wholeStatementFeeIntelligenceProviderAdapter } from "../src/canonical/wholeStatementFeeIntelligenceRuntime.js";
import {
  EvaluationCostBudgetLedger,
  accountingFromProviderUsage,
  assertApprovedLiveCallMetadata,
  calculateWorstCaseCostUsd,
  executeBudgetedProviderCall,
  livePackage5BProviderSettings,
  type CostReservationInput,
} from "../src/evaluationIntegrity/index.js";

const openAiPricing = {
  uncachedInputUsdPerMillionTokens: 1.25,
  cachedInputUsdPerMillionTokens: 0.125,
  outputUsdPerMillionTokens: 10,
  toolUseUsd: 0.01,
};

describe("live-evaluation budget enforcement", () => {
  it("disables Package 5B SDK retries and cannot fall through from explicit OpenAI to Anthropic", async () => {
    let generateTextCalls = 0;
    let generateObjectCalls = 0;
    let anthropicFactoryCalls = 0;
    let observedOptions: Record<string, unknown> | null = null;
    let observedUsage: unknown = null;
    const approvedSettings = livePackage5BProviderSettings(reservation({
      callId: "package_5b",
      capability: "ai_sdk",
      providerRoute: "openai_responses_via_ai_sdk",
      model: "gpt-5.4-mini",
      toolClass: "structured_output",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 5_000,
      maximumToolUses: 0,
      pricing: {
        uncachedInputUsdPerMillionTokens: 0.75,
        cachedInputUsdPerMillionTokens: 0.075,
        outputUsdPerMillionTokens: 4.5,
        toolUseUsd: 0,
      },
      estimatedMaximumCostUsd: 0.3225,
    }));
    const adapter = wholeStatementFeeIntelligenceProviderAdapter({
      ...approvedSettings,
      openAiApiKey: "synthetic-openai-key",
      anthropicApiKey: "synthetic-anthropic-key",
      onProviderUsage: (usage) => { observedUsage = usage; },
      sdk: {
        generateText: async (options) => {
          generateTextCalls += 1;
          observedOptions = options;
          return {
            output: { safe: true },
            usage: {
              inputTokens: 100,
              inputTokenDetails: { cacheReadTokens: 20 },
              outputTokens: 10,
            },
            response: { id: "resp_package_5b" },
          };
        },
        generateObject: async () => {
          generateObjectCalls += 1;
          throw new Error("Anthropic must not be reached");
        },
        Output: { object: () => ({}) },
        createOpenAI: () => () => ({}),
        createAnthropic: () => {
          anthropicFactoryCalls += 1;
          return () => ({});
        },
      },
    });

    await adapter({ type: "synthetic_package_5b", admittedFeeRows: [] } as any, {
      abortSignal: new AbortController().signal,
    });

    expect(generateTextCalls).toBe(1);
    expect(generateObjectCalls).toBe(0);
    expect(anthropicFactoryCalls).toBe(0);
    expect(approvedSettings).toMatchObject({ provider: "openai", openAiModelName: "gpt-5.4-mini", maxRetries: 0 });
    expect(observedOptions).toMatchObject({ maxRetries: 0, maxOutputTokens: 5_000 });
    expect(observedUsage).toEqual({
      requestId: "resp_package_5b",
      inputTokens: 100,
      cachedInputTokens: 20,
      outputTokens: 10,
    });
  });

  it("puts hard output and tool ceilings in the web-search Responses request and captures usage", async () => {
    let body: Record<string, unknown> | null = null;
    let sends = 0;
    let usage: unknown = null;
    const adapter = openAiWebSearchAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      maximumInputTokens: 400_000,
      maximumOutputTokens: OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS,
      maximumToolUses: 1,
      onUsage: (observed) => { usage = observed; },
      fetchImpl: async (_url, init) => {
        sends += 1;
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          id: "resp_search",
          usage: { input_tokens: 1200, output_tokens: 80, input_tokens_details: { cached_tokens: 200 } },
          output: [{ type: "web_search_call", action: { type: "search", sources: [] } }],
        });
      },
    });

    await adapter(searchRequest(), { abortSignal: new AbortController().signal });

    expect(sends).toBe(1);
    expect(body).toMatchObject({ max_output_tokens: 2_000, max_tool_calls: 1 });
    expect(usage).toEqual({
      requestId: "resp_search",
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 80,
      webSearchToolCalls: 1,
    });
  });

  it("puts the hard output ceiling in semantic Responses requests and captures zero tool calls", async () => {
    let body: Record<string, unknown> | null = null;
    let usage: unknown = null;
    const request = semanticRequest();
    const adapter = openAiSemanticSupportAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      maximumInputTokens: 4_096,
      maximumOutputTokens: OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS,
      maximumToolUses: 0,
      onUsage: (observed) => { usage = observed; },
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          id: "resp_semantic",
          usage: { input_tokens: 300, output_tokens: 40, input_tokens_details: { cached_tokens: 50 } },
          output: [{
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ decision: "supports", reasonCodes: ["synthetic_support"] }) }],
          }],
        });
      },
    });

    await adapter(request as any, { abortSignal: new AbortController().signal });

    expect(body).toMatchObject({ max_output_tokens: 1_000 });
    expect(body).not.toHaveProperty("tools");
    expect(usage).toEqual({
      requestId: "resp_semantic",
      inputTokens: 300,
      cachedInputTokens: 50,
      outputTokens: 40,
      webSearchToolCalls: 0,
    });
  });

  it("blocks missing, invalid, or inconsistent output ceilings before a provider send", async () => {
    let sends = 0;
    const send = async (metadata: CostReservationInput) => {
      assertApprovedLiveCallMetadata("web_search_discovery", metadata);
      sends += 1;
    };
    const valid = reservation({
      callId: "search_limit",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 2_000,
      maximumToolUses: 1,
      estimatedMaximumCostUsd: 0.53,
    });

    await expect(send({ ...valid, maximumOutputTokens: null })).rejects.toThrow("approved_maximum_output_tokens_inconsistent");
    await expect(send({ ...valid, maximumOutputTokens: 0 })).rejects.toThrow("approved_maximum_output_tokens_inconsistent");
    await expect(send({ ...valid, maximumOutputTokens: 1_999 })).rejects.toThrow("approved_maximum_output_tokens_inconsistent");
    expect(sends).toBe(0);
  });

  it("prices uncached input, cached input, output, and web-search calls from approved policy", () => {
    const metadata = reservation({
      callId: "observed_search",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 2_000,
      maximumToolUses: 1,
      estimatedMaximumCostUsd: 0.53,
    });
    const accounting = accountingFromProviderUsage({
      approvedCallMetadata: metadata,
      durationMs: 25,
      usage: {
        requestId: "resp_accounted",
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 100,
        toolEvents: [{ type: "web_search", count: 1 }],
      },
    });

    expect(calculateWorstCaseCostUsd(metadata)).toBe(0.53);
    expect(accounting).toMatchObject({
      requestId: "resp_accounted",
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 100,
      observedOrEstimatedFinalCostUsd: 0.012025,
      billingDisposition: "observed",
    });
  });

  it("releases unused reservation after observed cost and retains it when billing is unknown", () => {
    const ledger = new EvaluationCostBudgetLedger(2);
    const observed = reservation({
      callId: "observed",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 2_000,
      maximumToolUses: 1,
      estimatedMaximumCostUsd: 0.53,
    });
    const unknown = reservation({
      callId: "unknown",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 2_000,
      maximumToolUses: 1,
      estimatedMaximumCostUsd: 0.53,
    });
    ledger.reserve(observed);
    ledger.reserve(unknown);
    ledger.finalize("observed", {
      status: "success",
      durationMs: 10,
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 100,
      toolEvents: [{ type: "web_search", count: 1 }],
      observedOrEstimatedFinalCostUsd: 0.012025,
      billingDisposition: "observed",
    });
    ledger.finalize("unknown", { status: "failure", durationMs: 10, billingDisposition: "unknown" });

    expect(ledger.snapshot()).toMatchObject({
      cumulativeReservedUsd: 1.06,
      cumulativeObservedUsd: 0.012025,
      cumulativeBudgetCommittedUsd: 0.542025,
      cumulativeReleasedUsd: 0.517975,
      entries: [
        { cachedInputTokens: 200, billingDisposition: "observed" },
        { observedOrEstimatedFinalCostUsd: null, billingDisposition: "unknown", worstCaseReservedCostUsd: 0.53 },
      ],
    });
  });

  it("blocks insufficient worst-case budget before send and does not let a later call bypass it", async () => {
    const ledger = new EvaluationCostBudgetLedger(0.75);
    let sends = 0;
    await executeBudgetedProviderCall({
      ledger,
      reservation: reservation({
        callId: "first",
        maximumInputTokens: 400_000,
        maximumOutputTokens: 2_000,
        maximumToolUses: 1,
        estimatedMaximumCostUsd: 0.53,
      }),
      invoke: async () => {
        sends += 1;
        throw new Error("possible billable failure");
      },
    }).catch(() => undefined);
    await expect(executeBudgetedProviderCall({
      ledger,
      reservation: reservation({
        callId: "second",
        maximumInputTokens: 400_000,
        maximumOutputTokens: 2_000,
        maximumToolUses: 1,
        estimatedMaximumCostUsd: 0.53,
      }),
      invoke: async () => {
        sends += 1;
        return { value: true, accounting: { durationMs: 1, observedOrEstimatedFinalCostUsd: 0 } };
      },
    })).rejects.toMatchObject({ code: "insufficient_budget_reservation" });
    expect(sends).toBe(1);
  });

  it("keeps retrieval free of fabricated AI token billing", () => {
    const ledger = new EvaluationCostBudgetLedger(0.01);
    const retrieval = {
      ...reservation({
        callId: "retrieval",
        maximumInputTokens: 0,
        maximumOutputTokens: 0,
        maximumToolUses: 1,
        estimatedMaximumCostUsd: 0.001,
      }),
      provider: "external_https",
      model: null,
      pricing: {
        uncachedInputUsdPerMillionTokens: 0,
        cachedInputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        toolUseUsd: 0,
      },
    };
    ledger.reserve(retrieval);
    ledger.finalize("retrieval", {
      status: "success",
      durationMs: 5,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      toolEvents: [],
      observedOrEstimatedFinalCostUsd: 0,
      billingDisposition: "provider_confirmed_zero",
    });

    expect(ledger.snapshot()).toMatchObject({
      cumulativeObservedUsd: 0,
      cumulativeBudgetCommittedUsd: 0,
      cumulativeReleasedUsd: 0.001,
      entries: [{ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, toolEvents: [] }],
    });
  });
});

function reservation(overrides: Partial<CostReservationInput> & Pick<CostReservationInput, "callId">): CostReservationInput {
  return {
    callId: overrides.callId,
    attempt: 1,
    retryOfCallId: null,
    capability: "web_search",
    pricingPolicyRef: "openai_official_pricing_2026-08-08_v1",
    providerRoute: "openai_responses_web_search",
    provider: "openai",
    model: "gpt-5",
    toolClass: "web_search",
    maximumInputTokens: 400_000,
    maximumOutputTokens: 2_000,
    maximumToolUses: 1,
    pricing: openAiPricing,
    estimatedMaximumCostUsd: 0.53,
    ...overrides,
  };
}

function searchRequest() {
  return {
    attemptId: "research_budget_test",
    questions: [{
      feeRowRef: "fee_row",
      sanitizedQuestionCategory: "classification",
      triggerReason: "material_unfamiliar_label",
      processorOrNetwork: "Synthetic Processor",
      feeLabel: "Synthetic Fee",
      statementSection: "fees",
      statementPeriodYear: "2026",
      deterministicCategory: "unknown_needs_review",
      deterministicEconomicOwner: "unknown",
      deterministicContractualController: "unknown",
      deterministicActionabilityCeiling: "verify_only",
      deterministicConfidence: "low",
      semanticQuestion: "Find official documentation.",
    }],
    limits: {
      policyVersion: "fee_knowledge_research_policy_v1",
      maxSearchCalls: 2,
      maxRetrievalCandidates: 5,
      totalDeadlineMs: 15_000,
      maxResultCandidatesPerSearch: 5,
    },
  } as any;
}

function semanticRequest() {
  return {
    structuredClaim: {
      claimKind: "classification",
      feeLabel: "Synthetic Fee",
      processorOrNetwork: "Synthetic Processor",
      statementPeriodYear: "2026",
      proposedCategory: "unknown_needs_review",
      likelyEconomicOwner: "unknown",
      likelyContractualController: "unknown",
      conditions: [],
      exclusions: [],
      maximumConfidence: "low",
      actionabilityCeiling: "verify_only",
      ruleValue: null,
      applicationBasis: "not_evaluated",
    },
    documentFingerprint: "fingerprint",
    locatorTextHash: "locator",
    boundedEvidenceExcerpt: "Synthetic bounded evidence.",
    applicability: { processorOrNetwork: true, jurisdiction: null, transactionContext: null, statementPeriod: true },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
