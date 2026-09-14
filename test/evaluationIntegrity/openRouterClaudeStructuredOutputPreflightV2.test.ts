import { describe, expect, it } from "vitest";

import {
  OpenRouterClaudePreflightErrorV2,
  buildOpenRouterClaudeStructuredOutputPreflightRequestV2,
  countSchemaKeywordV2,
  invokeOpenRouterClaudeStructuredOutputPreflightV2,
  localSyntheticStructuredOutputSchemaV2,
  translateSchemaForAnthropicStructuredOutputsV2,
  validateFullLocalSyntheticContractV2,
} from "../../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";

const expectedOutput = Object.freeze({
  outputType: "AI_INFERENCE_ONLY",
  authority: "NON_AUTHORITATIVE",
  admissionStatus: "NOT_ADMITTED",
  truthEffect: "NONE",
  financialMutationAllowed: false,
  customerRenderingAllowed: false,
  syntheticEcho: "synthetic_preflight_only",
});

describe("OpenRouter Claude structured-output preflight v2", () => {
  it("translates only provider-facing unsupported constraints without mutating the local schema", () => {
    const localSchema = localSyntheticStructuredOutputSchemaV2();
    const translated = translateSchemaForAnthropicStructuredOutputsV2({
      ...localSchema,
      properties: {
        ...localSchema.properties as Record<string, unknown>,
        futureArrayField: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 2 },
      },
    });

    expect(countSchemaKeywordV2(localSchema, "minLength")).toBe(5);
    expect(countSchemaKeywordV2(localSchema, "maxLength")).toBe(5);
    expect(countSchemaKeywordV2(translated, "minLength")).toBe(0);
    expect(countSchemaKeywordV2(translated, "maxLength")).toBe(0);
    expect(countSchemaKeywordV2(translated, "maxItems")).toBe(0);
    expect(countSchemaKeywordV2(localSchema, "minLength")).toBe(5);
  });

  it("builds the exact bounded request without unsupported keywords or prohibited features", () => {
    const request = buildOpenRouterClaudeStructuredOutputPreflightRequestV2("test-only-key");
    const body = JSON.parse(request.body);

    expect(request.endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(Object.keys(request.headers).sort()).toEqual(["Authorization", "Content-Type", "X-OpenRouter-Metadata"].sort());
    expect(request.headers["X-OpenRouter-Metadata"]).toBe("enabled");
    expect(body).toMatchObject({
      model: "anthropic/claude-opus-4.6",
      store: false,
      stream: false,
      temperature: 0,
      max_tokens: 256,
      provider: { allow_fallbacks: false, require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: { name: "planner_transport_preflight_v2", strict: true },
      },
    });
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(countSchemaKeywordV2(body.response_format.json_schema.schema, "minLength")).toBe(0);
    expect(countSchemaKeywordV2(body.response_format.json_schema.schema, "maxLength")).toBe(0);
    expect(countSchemaKeywordV2(body.response_format.json_schema.schema, "maxItems")).toBe(0);
    expect(request.body).not.toMatch(/Gold|MID|account number|\.pdf|\/Users\//i);
    expect(request.bodyBytes).toBe(Buffer.byteLength(request.body, "utf8"));
  });

  it("makes exactly one request, validates structured output, and records safe metadata", async () => {
    let calls = 0;
    let sentInit: RequestInit | undefined;
    const result = await invokeOpenRouterClaudeStructuredOutputPreflightV2({
      apiKey: "test-only-key",
      signal: new AbortController().signal,
      fetchImplementation: async (_url, init) => {
        calls += 1;
        sentInit = init;
        return new Response(JSON.stringify({
          id: "gen-test-1",
          model: "anthropic/claude-opus-4.6",
          provider: "Anthropic",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(expectedOutput) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 80, completion_tokens: 31, total_tokens: 111, cost: 0.0042 },
          openrouter_metadata: { attempts: [{ provider_name: "Anthropic" }] },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "request-test-1",
            "x-generation-id": "generation-test-1",
          },
        });
      },
    });

    expect(calls).toBe(1);
    expect(sentInit?.redirect).toBe("error");
    expect(result.output).toEqual(expectedOutput);
    expect(result.providerSchemaValidation).toEqual({ valid: true, errors: [] });
    expect(validateFullLocalSyntheticContractV2(result.output)).toEqual({ valid: true, errors: [] });
    expect(result.telemetry).toMatchObject({
      requestedModel: "anthropic/claude-opus-4.6",
      returnedModel: "anthropic/claude-opus-4.6",
      selectedProvider: "Anthropic",
      callCount: 1,
      retries: 0,
      requestReachedOpenRouter: true,
      httpStatus: 200,
      openRouterRequestId: "request-test-1",
      generationId: "generation-test-1",
      contentType: "application/json",
      routerAttemptCount: 1,
      inputTokens: 80,
      outputTokens: 31,
      totalTokens: 111,
      accountedCostUsd: 0.0042,
      timeToHeadersMs: expect.any(Number),
      bodyReadLatencyMs: expect.any(Number),
      failureCategory: null,
    });
  });

  it("allowlists failure diagnostics and redacts credentials without retaining raw metadata", async () => {
    let captured: OpenRouterClaudePreflightErrorV2 | null = null;
    try {
      await invokeOpenRouterClaudeStructuredOutputPreflightV2({
        apiKey: "test-only-key",
        signal: new AbortController().signal,
        fetchImplementation: async () => new Response(JSON.stringify({
          error: {
            type: "invalid_request_error",
            code: "invalid_schema",
            param: "response_format",
            message: "Invalid schema for Bearer sk-or-v1-secretmaterial",
            metadata: { provider_error_code: "schema_unsupported", raw: "private-raw-diagnostic" },
          },
          openrouter_metadata: { attempts: [{ provider_name: "Anthropic", raw: "do-not-retain" }] },
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "x-request-id": "request-error-1",
            "x-generation-id": "generation-error-1",
            "retry-after": "3",
            "x-private-header": "never-retain",
          },
        }),
      });
    } catch (error) {
      captured = error as OpenRouterClaudePreflightErrorV2;
    }

    expect(captured).toBeInstanceOf(OpenRouterClaudePreflightErrorV2);
    expect(captured?.telemetry).toMatchObject({
      httpStatus: 400,
      failureCategory: "STRUCTURED_OUTPUT_INCOMPATIBILITY",
      safeErrorType: "invalid_request_error",
      safeErrorCode: "invalid_schema",
      safeErrorParameter: "response_format",
      safeErrorMessage: "Invalid schema for [authorization-redacted]",
      providerSafeErrorCode: "schema_unsupported",
      openRouterRequestId: "request-error-1",
      generationId: "generation-error-1",
      retryAfter: "3",
      selectedProvider: "Anthropic",
      routerAttemptCount: 1,
    });
    const serialized = JSON.stringify(captured?.telemetry);
    expect(serialized).not.toContain("secretmaterial");
    expect(serialized).not.toContain("private-raw-diagnostic");
    expect(serialized).not.toContain("do-not-retain");
    expect(serialized).not.toContain("never-retain");
  });

  it("classifies an aborted response-body read as a timeout without retrying", async () => {
    let calls = 0;
    let captured: OpenRouterClaudePreflightErrorV2 | null = null;
    try {
      await invokeOpenRouterClaudeStructuredOutputPreflightV2({
        apiKey: "test-only-key",
        signal: new AbortController().signal,
        fetchImplementation: async () => {
          calls += 1;
          return new Response(new ReadableStream({
            start(controller) {
              controller.error(new DOMException("This operation was aborted", "AbortError"));
            },
          }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "request-body-timeout-1",
              "x-openrouter-model": "anthropic/claude-opus-4.6",
              "x-openrouter-provider": "Anthropic",
            },
          });
        },
      });
    } catch (error) {
      captured = error as OpenRouterClaudePreflightErrorV2;
    }

    expect(calls).toBe(1);
    expect(captured).toBeInstanceOf(OpenRouterClaudePreflightErrorV2);
    expect(captured?.telemetry).toMatchObject({
      httpStatus: 200,
      requestReachedOpenRouter: true,
      openRouterRequestId: "request-body-timeout-1",
      contentType: "application/json",
      returnedModel: "anthropic/claude-opus-4.6",
      selectedProvider: "Anthropic",
      timeToHeadersMs: expect.any(Number),
      bodyReadLatencyMs: expect.any(Number),
      failureCategory: "TIMEOUT",
      callCount: 1,
      retries: 0,
    });
  });
});
