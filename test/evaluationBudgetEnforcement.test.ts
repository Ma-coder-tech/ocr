import { describe, expect, it } from "vitest";
import { zodSchema } from "ai";
import {
  OPENAI_SEMANTIC_VERIFICATION_MAX_OUTPUT_TOKENS,
  OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS,
  WEB_SEARCH_PROVIDER_MAX_TOOL_CALLS,
  openAiSemanticSupportAdapter,
  openAiWebSearchAdapter,
  type OpenAiResponsesSafeUsage,
} from "../src/canonical/feeKnowledgeResearch.js";
import { wholeStatementFeeIntelligenceProviderAdapter } from "../src/canonical/wholeStatementFeeIntelligenceRuntime.js";
import {
  EvaluationCostBudgetLedger,
  accountingFromProviderUsage,
  assertApprovedLiveCallMetadata,
  calculateWorstCaseCostUsd,
  executeBudgetedProviderCall,
  livePackage5BProviderSettings,
  openAiResponsesSafeUsageForAccounting,
  WEB_SEARCH_ACCOUNTING_MAX_ACTIONS,
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
    let observedSchema: unknown = null;
    let observedUsage: unknown = null;
    const structuredOutput = {
      type: "whole_statement_fee_intelligence_review",
      reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1",
      reviewStatus: "completed",
      evidenceRefs: [],
      factRefs: [],
      limitationCodes: [],
      rowInterpretations: [],
      reasonCodes: ["whole_statement_fee_intelligence_completed"],
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    };
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
            output: structuredOutput,
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
        Output: { object: ({ schema }) => {
          observedSchema = schema;
          return { type: "mock_output_object" };
        } },
        createOpenAI: () => () => ({}),
        createAnthropic: () => {
          anthropicFactoryCalls += 1;
          return () => ({});
        },
      },
    });

    const output = await adapter({ type: "synthetic_package_5b", admittedFeeRows: [] } as any, {
      abortSignal: new AbortController().signal,
    });

    expect(generateTextCalls).toBe(1);
    expect(generateObjectCalls).toBe(0);
    expect(anthropicFactoryCalls).toBe(0);
    expect(approvedSettings).toMatchObject({ provider: "openai", openAiModelName: "gpt-5.4-mini", maxRetries: 0 });
    expect(observedOptions).toMatchObject({ maxRetries: 0, maxOutputTokens: 5_000 });
    expect(observedOptions).toHaveProperty("output", { type: "mock_output_object" });
    expect(observedOptions).not.toHaveProperty("experimental_output");
    const jsonSchema = zodSchema(observedSchema as never).jsonSchema;
    expect(allObjectPropertiesRequired(jsonSchema)).toBe(true);
    expect(JSON.stringify(jsonSchema)).toContain('"externalClaimSupportRef"');
    expect((observedSchema as { safeParse: (value: unknown) => { success: boolean } }).safeParse(structuredOutput).success).toBe(true);
    expect(output).toEqual(structuredOutput);
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
      onUsage: (observed) => { usage = observed; },
      fetchImpl: async (_url, init) => {
        sends += 1;
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          id: "resp_search",
          usage: { input_tokens: 1200, output_tokens: 80, input_tokens_details: { cached_tokens: 200 } },
          output: [{ type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: "https://www.example.com/official-fees", title: "Official fees" }] } }],
        });
      },
    });

    const candidates = await adapter(searchRequest(), { abortSignal: new AbortController().signal });

    expect(sends).toBe(1);
    expect(body).toMatchObject({
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      reasoning: { effort: "low" },
      max_output_tokens: 2_000,
      max_tool_calls: 1,
    });
    expect(body?.tools).toEqual([{ type: "web_search" }]);
    expect(JSON.stringify(body)).not.toContain("external_web_access");
    expect(JSON.stringify(body)).not.toMatch(/merchant_live_123|1234\.56/);
    expect(candidates).toEqual([{ url: "https://www.example.com/official-fees", title: "Official fees", publisher: null }]);
    expect(usage).toEqual({
      requestId: "resp_search",
      inputTokens: 1200,
      cachedInputTokens: 200,
      outputTokens: 80,
      webSearchToolCalls: 1,
      webSearchActionTypes: ["search"],
    });
  });

  it("accepts the proven two-action live shape while keeping the provider request cap at one", async () => {
    let body: Record<string, unknown> | null = null;
    let usage: OpenAiResponsesSafeUsage | null = null;
    const adapter = openAiWebSearchAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      maximumInputTokens: 400_000,
      maximumOutputTokens: OPENAI_WEB_SEARCH_MAX_OUTPUT_TOKENS,
      onUsage: (observed) => { usage = observed; },
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({
          id: "resp_two_web_actions",
          status: "completed",
          usage: { input_tokens: 8_720, output_tokens: 1_564, input_tokens_details: { cached_tokens: 4_352 } },
          output: [
            {
              type: "web_search_call",
              status: "completed",
              action: {
                type: "search",
                sources: [
                  { type: "url", url: "https://usa.visa.com/support/consumer/visa-rules.html", title: "Visa rules" },
                  { type: "url", url: "https://www.visa.com/support/small-business.html", title: "Visa small business" },
                  { type: "url", url: "https://www.visa.com/about-visa.html", title: "About Visa" },
                ],
              },
            },
            {
              type: "web_search_call",
              status: "searching",
              action: { type: "open_page", url: "https://www.visa.com/support/small-business.html" },
            },
          ],
        });
      },
    });

    const candidates = await adapter(searchRequest(), { abortSignal: new AbortController().signal });
    const safeUsage = openAiResponsesSafeUsageForAccounting(usage);
    if (!safeUsage) throw new Error("expected safe usage");
    const metadata = reservation({ callId: "two_action_search" });
    const accounting = accountingFromProviderUsage({
      usage: safeUsage,
      approvedCallMetadata: metadata,
      durationMs: 25,
    });

    expect(body).toMatchObject({ max_tool_calls: WEB_SEARCH_PROVIDER_MAX_TOOL_CALLS });
    expect(WEB_SEARCH_PROVIDER_MAX_TOOL_CALLS).toBe(1);
    expect(WEB_SEARCH_ACCOUNTING_MAX_ACTIONS).toBe(2);
    expect(candidates).toHaveLength(3);
    expect(usage).toMatchObject({
      requestId: "resp_two_web_actions",
      webSearchToolCalls: 2,
      webSearchActionTypes: ["search", "open_page"],
    });
    expect(JSON.stringify(usage)).not.toContain("visa.com");
    expect(safeUsage.toolEvents).toEqual([
      { type: "web_search.search", count: 1 },
      { type: "web_search.open_page", count: 1 },
    ]);
    expect(calculateWorstCaseCostUsd(metadata)).toBe(0.54);
    expect(accounting.observedOrEstimatedFinalCostUsd).toBe(0.041644);
    const modeledReservations = 5 * 0.3225 + 10 * 0.54 + 25 * 0.001 + 25 * 0.01512;
    expect(Number(modeledReservations.toFixed(6))).toBe(7.4155);
    expect(Number((7.5 - modeledReservations).toFixed(6))).toBe(0.0845);

    let error: unknown;
    try {
      accountingFromProviderUsage({
        usage: {
          ...safeUsage,
          toolEvents: [...safeUsage.toolEvents, { type: "web_search.find_in_page", count: 1 }],
        },
        approvedCallMetadata: metadata,
        durationMs: 30,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      reasonCode: "provider_usage_exceeded_approved_transport_limits",
      reasonCodes: ["provider_usage_exceeded_approved_transport_limits"],
      accounting: {
        requestId: "resp_two_web_actions",
        inputTokens: 8_720,
        cachedInputTokens: 4_352,
        outputTokens: 1_564,
        toolEvents: [
          { type: "web_search.search", count: 1 },
          { type: "web_search.open_page", count: 1 },
          { type: "web_search.find_in_page", count: 1 },
        ],
      },
    });
  });

  it.each([
    [400, "provider_invalid_request"],
    [401, "provider_auth_failed"],
    [403, "provider_auth_failed"],
    [429, "provider_rate_limited"],
  ] as const)("normalizes web-search HTTP %i without retaining the provider body", async (status, reasonCode) => {
    const rawSecret = `raw-provider-detail-${status}-must-not-persist`;
    const adapter = openAiWebSearchAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      fetchImpl: async () => jsonResponse({
        error: {
          type: status === 429 ? "rate_limit_error" : status === 401 || status === 403 ? "authentication_error" : "invalid_request_error",
          code: status === 429 ? "rate_limit_exceeded" : status === 401 || status === 403 ? "invalid_api_key" : "invalid_request_error",
          message: rawSecret,
        },
      }, { status, headers: { "x-request-id": `req_safe_${status}` } }),
    });

    const error = await adapter(searchRequest(), { abortSignal: new AbortController().signal }).catch((caught) => caught);

    expect(error).toMatchObject({
      reasonCode,
      accounting: { requestId: `req_safe_${status}` },
    });
    expect(error.reasonCodes).toContain(`provider_http_status_${status}`);
    expect(JSON.stringify(error)).not.toContain(rawSecret);
  });

  it.each([
    ["source title containing policy", { sourceTitle: "Official network policy guide" }],
    ["output text containing policy", { outputText: "This policy explains the published fee." }],
    ["citation URL containing policy", { citationUrl: "https://www.example.com/policy/official-fees" }],
    ["ordinary cannot-comply prose", { outputText: "A quoted example says cannot comply with an old rule." }],
  ] as const)("does not infer refusal from %s", async (_case, options) => {
    const adapter = openAiWebSearchAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      fetchImpl: async () => jsonResponse(successfulSearchPayload(options)),
    });

    const candidates = await adapter(searchRequest(), { abortSignal: new AbortController().signal });

    expect(candidates.length).toBeGreaterThan(0);
  });

  it("classifies only structural refusal content and retains the safe response ID", async () => {
    const rawSecret = "refusal text with private provider detail";
    const adapter = openAiWebSearchAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      fetchImpl: async () => jsonResponse({
        id: "resp_structural_refusal",
        usage: { input_tokens: 10, output_tokens: 5 },
        output: [
          { type: "web_search_call", action: { type: "search", sources: [] } },
          { type: "message", content: [{ type: "refusal", refusal: rawSecret }] },
        ],
      }),
    });

    const error = await adapter(searchRequest(), { abortSignal: new AbortController().signal }).catch((caught) => caught);

    expect(error).toMatchObject({
      reasonCode: "provider_refused",
      reasonCodes: ["provider_refused"],
      accounting: { requestId: "resp_structural_refusal" },
    });
    expect(JSON.stringify(error)).not.toContain(rawSecret);
  });

  it("normalizes an AI SDK schema rejection without retaining provider request data", async () => {
    let observedOptions: Record<string, unknown> | null = null;
    const rawSecret = "raw-package-5b-request-data-must-not-persist";
    const adapter = wholeStatementFeeIntelligenceProviderAdapter({
      provider: "openai",
      openAiApiKey: "synthetic-openai-key",
      openAiModelName: "gpt-5.4-mini",
      maxOutputTokens: 5_000,
      maxRetries: 0,
      sdk: {
        generateText: async (options) => {
          observedOptions = options;
          throw {
            statusCode: 400,
            responseHeaders: { "x-request-id": "req_safe_package_5b" },
            data: { error: { type: "invalid_request_error", code: "invalid_json_schema", message: rawSecret } },
            responseBody: rawSecret,
          };
        },
        generateObject: async () => { throw new Error("must not run"); },
        Output: { object: () => ({ type: "mock_output_object" }) },
        createOpenAI: () => () => ({}),
      },
    });

    const error = await adapter({ type: "synthetic_package_5b", admittedFeeRows: [] } as any, {
      abortSignal: new AbortController().signal,
    }).catch((caught) => caught);

    expect(observedOptions).toMatchObject({ maxRetries: 0, output: { type: "mock_output_object" } });
    expect(observedOptions).not.toHaveProperty("experimental_output");
    expect(error).toMatchObject({
      reasonCode: "provider_schema_rejected",
      accounting: { requestId: "req_safe_package_5b" },
    });
    expect(error.reasonCodes).toEqual(expect.arrayContaining([
      "provider_error_code_invalid_json_schema",
      "provider_error_type_invalid_request_error",
      "provider_http_status_400",
      "provider_schema_rejected",
    ]));
    expect(JSON.stringify(error)).not.toContain(rawSecret);
  });

  it("fails a successful Responses payload that did not execute web search", async () => {
    const rawProviderText = "No tool call despite ordinary policy prose.";
    const adapter = openAiWebSearchAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      fetchImpl: async () => jsonResponse({
        id: "resp_without_search",
        usage: { input_tokens: 10, output_tokens: 5 },
        output: [{ type: "message", content: [{ type: "output_text", text: rawProviderText }] }],
      }),
    });

    const error = await adapter(searchRequest(), { abortSignal: new AbortController().signal }).catch((caught) => caught);

    expect(error).toMatchObject({
      reasonCode: "provider_required_tool_missing",
      reasonCodes: ["provider_required_tool_missing"],
      accounting: { requestId: "resp_without_search" },
    });
    expect(JSON.stringify(error)).not.toContain(rawProviderText);
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
      webSearchActionTypes: [],
    });
  });

  it("degrades malformed and refused semantic responses without enabling tools", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const responses = [
      { output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] },
      { output: [{ type: "message", content: [{ type: "refusal", refusal: "declined" }] }] },
    ];
    const adapter = openAiSemanticSupportAdapter({
      apiKey: "synthetic-key",
      modelName: "gpt-5",
      maximumToolUses: 0,
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse(responses.shift());
      },
    });

    const malformed = await adapter(semanticRequest() as any, { abortSignal: new AbortController().signal });
    const refused = await adapter(semanticRequest() as any, { abortSignal: new AbortController().signal });

    expect(malformed).toMatchObject({ decision: "unsupported", reasonCodes: ["fee_knowledge_semantic_json_invalid"] });
    expect(refused).toMatchObject({ decision: "unsupported", reasonCodes: ["fee_knowledge_semantic_support_provider_failed"] });
    expect(bodies.every((body) => !("tools" in body) && !("tool_choice" in body))).toBe(true);
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
      maximumToolUses: 2,
      estimatedMaximumCostUsd: 0.54,
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
      maximumToolUses: 2,
      estimatedMaximumCostUsd: 0.54,
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

    expect(calculateWorstCaseCostUsd(metadata)).toBe(0.54);
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
      maximumToolUses: 2,
      estimatedMaximumCostUsd: 0.54,
    });
    const unknown = reservation({
      callId: "unknown",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 2_000,
      maximumToolUses: 2,
      estimatedMaximumCostUsd: 0.54,
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
      cumulativeReservedUsd: 1.08,
      cumulativeObservedUsd: 0.012025,
      cumulativeBudgetCommittedUsd: 0.552025,
      cumulativeReleasedUsd: 0.527975,
      entries: [
        { cachedInputTokens: 200, billingDisposition: "observed" },
        { observedOrEstimatedFinalCostUsd: null, billingDisposition: "unknown", worstCaseReservedCostUsd: 0.54 },
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
        maximumToolUses: 2,
        estimatedMaximumCostUsd: 0.54,
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
        maximumToolUses: 2,
        estimatedMaximumCostUsd: 0.54,
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
    maximumToolUses: 2,
    pricing: openAiPricing,
    estimatedMaximumCostUsd: 0.54,
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

function jsonResponse(value: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

function successfulSearchPayload(options: {
  sourceTitle?: string;
  outputText?: string;
  citationUrl?: string;
}) {
  const output: unknown[] = [{
    type: "web_search_call",
    action: {
      type: "search",
      sources: [{
        type: "url",
        url: "https://www.example.com/official-fees",
        title: options.sourceTitle ?? "Official fees",
      }],
    },
  }];
  if (options.outputText || options.citationUrl) {
    output.push({
      type: "message",
      content: [{
        type: "output_text",
        text: options.outputText ?? "Official source citation.",
        annotations: options.citationUrl ? [{ type: "url_citation", url: options.citationUrl, title: "Official citation" }] : [],
      }],
    });
  }
  return {
    id: "resp_non_refusal",
    usage: { input_tokens: 10, output_tokens: 5 },
    output,
  };
}

function allObjectPropertiesRequired(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(allObjectPropertiesRequired);
  if (!value || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  if (record.type === "object" && record.properties && typeof record.properties === "object") {
    const properties = Object.keys(record.properties as Record<string, unknown>).sort();
    const required = Array.isArray(record.required) ? [...record.required].sort() : [];
    if (JSON.stringify(properties) !== JSON.stringify(required)) return false;
  }
  return Object.values(record).every(allObjectPropertiesRequired);
}
