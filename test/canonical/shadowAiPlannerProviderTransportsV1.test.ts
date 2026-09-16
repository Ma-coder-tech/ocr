import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  compileShadowAiPlannerProviderRequestV1,
  type ShadowAiPlannerDraftV1,
  type ShadowAiPlannerTransportAdapterV1,
} from "../../src/canonical/shadowAiPlannerProviderNeutralV1.js";
import { runShadowAiProviderNeutralPlannerV1 } from "../../src/canonical/shadowAiPlannerProviderNeutralRuntimeV1.js";
import { qualifyShadowAiPlannerProviderV1 } from "../../src/canonical/shadowAiPlannerProviderQualificationV1.js";
import {
  createOpenAiDirectPlannerAdapterV1,
  createOpenRouterPlannerAdapterV1,
  normalizeOpenAiPlannerResponseV1,
  normalizeOpenRouterPlannerResponseV1,
  ShadowAiPlannerTransportErrorV1,
  type ShadowAiPlannerFetchV1,
  type ShadowAiPlannerTransportSessionV1,
} from "../../src/canonical/shadowAiPlannerProviderTransportsV1.js";
import {
  parseShadowAiPlannerStrictJsonObjectV1,
  ShadowAiPlannerStrictJsonErrorV1,
} from "../../src/canonical/shadowAiPlannerStrictJsonV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  type ShadowAiEconomicResolutionPacketV1,
} from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";

const pricing = {
  inputUsdMicrosPerMillionTokens: 1_000_000,
  outputUsdMicrosPerMillionTokens: 2_000_000,
};
const generation = {
  maximumOutputTokens: 4_000,
  reasoningEffort: "none" as const,
  verbosity: "low" as const,
};
const openRouterRouting = {
  onlyProvider: "openai",
  dataCollection: "deny" as const,
  maximumPromptPriceUsdPerMillionTokens: 1.75,
  maximumCompletionPriceUsdPerMillionTokens: 14,
};

describe("Provider-neutral planner transports v1", () => {
  it("rejects duplicate JSON object keys before materialization", () => {
    expect(() => parseShadowAiPlannerStrictJsonObjectV1('{"outer":{"value":1,"value":2}}'))
      .toThrowError(expect.objectContaining<Partial<ShadowAiPlannerStrictJsonErrorV1>>({
        safeCode: "shadow_planner_provider_json_duplicate_key",
      }));
    expect(parseShadowAiPlannerStrictJsonObjectV1('{"text":"\\\"same\\\":1,\\\"same\\\":2"}'))
      .toEqual({ text: '"same":1,"same":2' });
  });

  it("normalizes a completed OpenAI Responses envelope without assuming the first output item", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("openai-normalize"));
    const normalized = normalizeOpenAiPlannerResponseV1({
      responseText: JSON.stringify(openAiEnvelope(JSON.stringify(validDraft(compiled)), "test-openai-model")),
      httpStatus: 200,
      headerRequestId: "req_header_openai",
      latencyMs: 17,
      pricing,
      requestSha256: "a".repeat(64),
      schemaSha256: "b".repeat(64),
    });

    expect(normalized.rawDraft).toEqual(validDraft(compiled));
    expect(normalized.usage).toEqual({ inputTokens: 10, outputTokens: 20, estimatedCostUsdMicros: 50, latencyMs: 17 });
    expect(normalized.providerRequestId).toBe("req_header_openai");
    expect(normalized.returnedModel).toBe("test-openai-model");
  });

  it("normalizes one completed OpenRouter Responses envelope and preserves only safe routing telemetry", () => {
    const compiled = compileShadowAiPlannerProviderRequestV1(packet("openrouter-normalize"));
    const normalized = normalizeOpenRouterPlannerResponseV1({
      responseText: JSON.stringify(openRouterEnvelope(JSON.stringify(validDraft(compiled)), "test/openrouter-model")),
      httpStatus: 200,
      headerRequestId: null,
      latencyMs: 23,
      pricing,
      requestSha256: "c".repeat(64),
      schemaSha256: "d".repeat(64),
    });

    expect(normalized.rawDraft).toEqual(validDraft(compiled));
    expect(normalized.providerRequestId).toBe("resp_openrouter_test");
    expect(normalized.safeTelemetry).toMatchObject({
      finishReason: "completed",
      routedProvider: "test-provider",
      httpStatus: 200,
    });
  });

  it("executes direct OpenAI exactly once and binds the returned draft locally", async () => {
    const inputPacket = packet("openai-runtime");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    const calls: Array<{ url: string; body: string; authorization: string | undefined }> = [];
    const fetchImpl: ShadowAiPlannerFetchV1 = async (url, init) => {
      calls.push({ url, body: init.body, authorization: init.headers.Authorization });
      return response(JSON.stringify(openAiEnvelope(JSON.stringify(validDraft(compiled)), "test-openai-model")), "req_openai_runtime");
    };
    const adapter = createOpenAiDirectPlannerAdapterV1({
      apiKey: "openai-test-secret",
      model: "test-openai-model",
      generation,
      pricing,
      fetchImpl,
      clock: sequenceClock(100, 125),
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status, JSON.stringify(run)).toBe("COMPLETED");
    expect(run.plan).toMatchObject({ issueId: "openai-runtime", authority: "NON_AUTHORITATIVE", truthEffect: "NONE" });
    expect(run.accounting).toMatchObject({ providerCallAttempts: 1, providerCallCompleted: 1, providerNetworkCalls: 1, retries: 0 });
    expect(run.provider).toMatchObject({ requestedModel: "test-openai-model", returnedModel: "test-openai-model", httpStatus: 200 });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).not.toContain("openai-runtime");
    expect(calls[0].body).not.toContain(inputPacket.immutableInputHash);
    expect(calls[0].body).not.toContain("openai-test-secret");
    expect(calls[0].authorization).toBe("Bearer openai-test-secret");
  });

  it("executes OpenRouter Responses exactly once with pinned routing and binds locally", async () => {
    const inputPacket = packet("openrouter-responses-runtime");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    const calls: Array<{ url: string; body: string; metadata: string | undefined }> = [];
    const fetchImpl: ShadowAiPlannerFetchV1 = async (url, init) => {
      calls.push({ url, body: init.body, metadata: init.headers["X-OpenRouter-Metadata"] });
      return response(JSON.stringify(openRouterEnvelope(
        JSON.stringify(validDraft(compiled)),
        "test/openrouter-model",
        "openai",
      )), "req_openrouter_runtime");
    };
    const adapter = createOpenRouterPlannerAdapterV1({
      apiKey: "openrouter-test-secret",
      model: "test/openrouter-model",
      generation,
      routing: openRouterRouting,
      pricing,
      fetchImpl,
      clock: sequenceClock(200, 227),
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status, JSON.stringify(run)).toBe("COMPLETED");
    expect(run.plan).toMatchObject({
      issueId: "openrouter-responses-runtime",
      authority: "NON_AUTHORITATIVE",
      truthEffect: "NONE",
    });
    expect(run.provider).toMatchObject({
      adapterId: "openrouter-responses-v1",
      requestedModel: "test/openrouter-model",
      returnedModel: "test/openrouter-model",
      routedProvider: "openai",
      httpStatus: 200,
    });
    expect(adapter.safeConfiguration).toMatchObject({
      verbosity: "low",
      verbosityControl: "PROVIDER_NEUTRAL_INSTRUCTION",
      providerFallbackAllowed: false,
      routedProviderConstraint: "openai",
      dataCollection: "deny",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/responses");
    expect(calls[0].metadata).toBe("enabled");
    expect(calls[0].body).not.toContain("openrouter-responses-runtime");
    expect(calls[0].body).not.toContain(inputPacket.immutableInputHash);
    expect(calls[0].body).not.toContain("openrouter-test-secret");
  });

  it("rejects a duplicate draft key from a completed provider response", async () => {
    const inputPacket = packet("duplicate-draft-runtime");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    const valid = JSON.stringify(validDraft(compiled));
    const duplicate = valid.replace("{", '{"unresolvedQuestion":"forged",');
    const adapter = createOpenAiDirectPlannerAdapterV1({
      apiKey: "test-key",
      model: "test-openai-model",
      generation,
      pricing,
      fetchImpl: async () => response(JSON.stringify(openAiEnvelope(duplicate, "test-openai-model"))),
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("SAFETY_BLOCKED");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toEqual(["shadow_planner_provider_json_duplicate_key:draft"]);
    expect(run.accounting).toMatchObject({ providerCallAttempts: 1, providerCallCompleted: 1, retries: 0 });
  });

  it("rejects OpenAI refusal and OpenRouter truncation or fallback evidence", () => {
    const openAi = openAiEnvelope("{}", "test-openai-model");
    (openAi.output[1] as any).content = [{ type: "refusal", refusal: "not retained" }];
    expectTransportSafety(() => normalizeOpenAiPlannerResponseV1(normalizeInput(JSON.stringify(openAi))),
      "shadow_planner_openai_refusal");

    const truncated = openRouterEnvelope("{}", "test/openrouter-model");
    truncated.status = "incomplete";
    expectTransportSafety(() => normalizeOpenRouterPlannerResponseV1(normalizeInput(JSON.stringify(truncated))),
      "shadow_planner_openrouter_response_truncated");

    const fallback = openRouterEnvelope("{}", "test/openrouter-model");
    fallback.openrouter_metadata.attempt = 2;
    expectTransportSafety(() => normalizeOpenRouterPlannerResponseV1(normalizeInput(JSON.stringify(fallback))),
      "shadow_planner_openrouter_fallback_detected");

    const missingRoute = openRouterEnvelope("{}", "test/openrouter-model");
    (missingRoute as any).openrouter_metadata = undefined;
    expectTransportSafety(() => normalizeOpenRouterPlannerResponseV1(normalizeInput(JSON.stringify(missingRoute))),
      "shadow_planner_openrouter_routing_metadata_missing");
  });

  it("returns only a safe classification for provider HTTP rejection", async () => {
    const inputPacket = packet("openrouter-http-failure");
    let calls = 0;
    const adapter = createOpenRouterPlannerAdapterV1({
      apiKey: "router-secret",
      model: "test/openrouter-model",
      generation,
      routing: openRouterRouting,
      pricing,
      fetchImpl: async () => {
        calls += 1;
        return response('{"error":{"message":"raw provider detail and router-secret"}}', "req_rejected", 401);
      },
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("UNAVAILABLE");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toEqual(["shadow_planner_openrouter_authentication_rejected"]);
    expect(JSON.stringify(run)).not.toContain("raw provider detail");
    expect(JSON.stringify(run)).not.toContain("router-secret");
    expect(run.accounting).toMatchObject({ providerCallAttempts: 1, providerCallCompleted: 1, retries: 0 });
    expect(calls).toBe(1);
  });

  it("rejects an OpenRouter response from an upstream outside the pinned route", async () => {
    const inputPacket = packet("openrouter-route-mismatch");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    const envelope = openRouterEnvelope(JSON.stringify(validDraft(compiled)), "test/openrouter-model", "azure");
    const adapter = createOpenRouterPlannerAdapterV1({
      apiKey: "router-secret",
      model: "test/openrouter-model",
      generation,
      routing: openRouterRouting,
      pricing,
      fetchImpl: async () => response(JSON.stringify(envelope)),
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("SAFETY_BLOCKED");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toEqual(["shadow_planner_routed_provider_mismatch"]);
  });

  it("treats an ambiguous send failure as one non-retriable attempt", async () => {
    const inputPacket = packet("openai-network-failure");
    let calls = 0;
    const adapter = createOpenAiDirectPlannerAdapterV1({
      apiKey: "openai-secret",
      model: "test-openai-model",
      generation,
      pricing,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("socket closed after request bytes were sent: openai-secret");
      },
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("UNAVAILABLE");
    expect(run.plan).toBeNull();
    expect(run.errorCodes).toEqual(["shadow_planner_provider_connection_or_response_headers_failed"]);
    expect(run.provider).toMatchObject({
      failureStage: "CONNECTION_OR_RESPONSE_HEADERS",
      cleanupStatus: "CONFIRMED",
    });
    expect(run.accounting).toMatchObject({ providerCallAttempts: 1, providerCallCompleted: 0, retries: 0 });
    expect(JSON.stringify(run)).not.toContain("socket closed");
    expect(JSON.stringify(run)).not.toContain("openai-secret");
    expect(calls).toBe(1);
  });

  it("classifies connection, response-header, and response-body failures without retaining raw errors", async () => {
    const cases = [
      {
        name: "connection",
        connected: false,
        fetch: async () => { throw new Error("dns secret"); },
        code: "shadow_planner_provider_connection_establishment_failed",
        stage: "CONNECTION_ESTABLISHMENT",
      },
      {
        name: "headers",
        connected: true,
        fetch: async () => { throw new Error("header secret"); },
        code: "shadow_planner_provider_response_headers_failed",
        stage: "RESPONSE_HEADERS",
      },
      {
        name: "body",
        connected: true,
        fetch: async () => ({
          status: 200,
          headers: { get: () => null },
          text: async () => { throw new Error("body secret"); },
        }),
        code: "shadow_planner_provider_response_read_failed",
        stage: "RESPONSE_BODY",
      },
    ] as const;

    for (const item of cases) {
      let closed = false;
      const adapter = createOpenAiDirectPlannerAdapterV1({
        apiKey: "test-key",
        model: "test-openai-model",
        generation,
        pricing,
        transportSessionFactory: () => ({
          fetch: item.fetch as ShadowAiPlannerFetchV1,
          connectionEstablished: () => item.connected,
          connectionMs: () => item.connected ? 4 : null,
          close: async () => { closed = true; return 2; },
        }),
      });

      const run = await runShadowAiProviderNeutralPlannerV1({ packet: packet(`stage-${item.name}`), adapter });

      expect(run.status).toBe("UNAVAILABLE");
      expect(run.errorCodes).toEqual([item.code]);
      expect(run.provider).toMatchObject({ failureStage: item.stage, cleanupStatus: "CONFIRMED" });
      expect(run.provider.failureElapsedMs).not.toBeNull();
      expect(run.provider.cleanupMs).toBe(2);
      if (item.name === "body") expect(run.provider.responseHeadersMs).not.toBeNull();
      expect(JSON.stringify(run)).not.toContain(`${item.name} secret`);
      expect(closed).toBe(true);
    }
  });

  it("uses one isolated Direct OpenAI transport session per call and records safe phase timings", async () => {
    const inputPacket = packet("isolated-session-timings");
    const compiled = compileShadowAiPlannerProviderRequestV1(inputPacket);
    let sessions = 0;
    let closedSessions = 0;
    const sessionFactory = (): ShadowAiPlannerTransportSessionV1 => {
      sessions += 1;
      return {
        fetch: async () => response(JSON.stringify(openAiEnvelope(
          JSON.stringify(validDraft(compiled)), "test-openai-model",
        ))),
        connectionEstablished: () => true,
        connectionMs: () => 4,
        close: async () => { closedSessions += 1; return 3; },
      };
    };
    const adapter = createOpenAiDirectPlannerAdapterV1({
      apiKey: "test-key",
      model: "test-openai-model",
      generation,
      pricing,
      transportSessionFactory: sessionFactory,
      clock: sequenceClock(100, 110, 115, 200, 208, 212),
    });

    const first = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });
    const second = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(first.status).toBe("COMPLETED");
    expect(second.status).toBe("COMPLETED");
    expect(sessions).toBe(2);
    expect(closedSessions).toBe(2);
    expect(first.provider).toMatchObject({
      connectionReused: false,
      connectionMs: 4,
      responseHeadersMs: 10,
      responseBodyMs: 5,
      cleanupMs: 3,
      cleanupStatus: "CONFIRMED",
      failureStage: "NONE",
    });
    expect(second.provider).toMatchObject({
      connectionReused: false,
      responseHeadersMs: 8,
      responseBodyMs: 4,
      cleanupStatus: "CONFIRMED",
    });
  });

  it("waits for abort cleanup and quarantines a transport whose cancellation never settles", async () => {
    const settledPacket = packet("abort-cleanup-settled");
    let cleanupFinished = false;
    const settledAdapter = plannerAdapter(async ({ signal }) => await new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        setTimeout(() => {
          cleanupFinished = true;
          reject(new Error("safe abort completion"));
        }, 10);
      }, { once: true });
    }));

    const settled = await runShadowAiProviderNeutralPlannerV1({
      packet: settledPacket,
      adapter: settledAdapter,
      timeoutMs: 5,
      abortCleanupGraceMs: 50,
    });
    expect(cleanupFinished).toBe(true);
    expect(settled.errorCodes).toEqual(["shadow_planner_provider_timeout"]);
    expect(settled.provider).toMatchObject({ cleanupStatus: "CONFIRMED", failureStage: "TIMEOUT_ABORT" });

    const stuckPacket = packet("abort-cleanup-stuck");
    let stuckCalls = 0;
    const stuckAdapter = plannerAdapter(async () => {
      stuckCalls += 1;
      return await new Promise(() => undefined);
    });
    const stuck = await runShadowAiProviderNeutralPlannerV1({
      packet: stuckPacket,
      adapter: stuckAdapter,
      timeoutMs: 5,
      abortCleanupGraceMs: 5,
    });
    const quarantined = await runShadowAiProviderNeutralPlannerV1({
      packet: stuckPacket,
      adapter: stuckAdapter,
      timeoutMs: 5,
      abortCleanupGraceMs: 5,
    });

    expect(stuck.errorCodes).toEqual([
      "shadow_planner_provider_abort_cleanup_unconfirmed",
      "shadow_planner_provider_timeout",
    ]);
    expect(stuck.provider).toMatchObject({ cleanupStatus: "UNCONFIRMED", failureStage: "SESSION_CLEANUP" });
    expect(quarantined.errorCodes).toEqual(["shadow_planner_provider_transport_quarantined"]);
    expect(quarantined.provider).toMatchObject({ cleanupStatus: "UNCONFIRMED", failureStage: "TRANSPORT_QUARANTINED" });
    expect(quarantined.accounting.providerNetworkCalls).toBe(0);
    expect(stuckCalls).toBe(1);
  });

  it("blocks a conservatively over-budget request before any network attempt", async () => {
    const inputPacket = packet("openai-preflight-cost");
    let calls = 0;
    const adapter = createOpenAiDirectPlannerAdapterV1({
      apiKey: "test-key",
      model: "test-openai-model",
      generation,
      pricing: {
        inputUsdMicrosPerMillionTokens: 100_000_000,
        outputUsdMicrosPerMillionTokens: 100_000_000,
      },
      fetchImpl: async () => {
        calls += 1;
        throw new Error("must not send");
      },
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("SAFETY_BLOCKED");
    expect(run.errorCodes).toEqual(["shadow_planner_preflight_cost_budget_exceeded"]);
    expect(run.accounting).toMatchObject({
      providerCallAttempts: 0,
      providerCallCompleted: 0,
      providerNetworkCalls: 0,
      retries: 0,
    });
    expect(calls).toBe(0);
  });

  it("blocks oversized response bodies without parsing or retrying", async () => {
    const inputPacket = packet("oversized-response");
    let reads = 0;
    const adapter = createOpenAiDirectPlannerAdapterV1({
      apiKey: "test-key",
      model: "test-openai-model",
      generation,
      pricing,
      fetchImpl: async () => ({
        status: 200,
        headers: { get: (name) => name.toLowerCase() === "content-length" ? "512001" : null },
        text: async () => { reads += 1; return "{}"; },
      }),
    });

    const run = await runShadowAiProviderNeutralPlannerV1({ packet: inputPacket, adapter });

    expect(run.status).toBe("SAFETY_BLOCKED");
    expect(run.errorCodes).toEqual(["shadow_planner_provider_response_too_large"]);
    expect(reads).toBe(0);
  });

  it("qualifies an adapter with exactly three isolated controls and rejects cross-request replay", async () => {
    let calls = 0;
    const adapter = {
      adapterId: "qualification-fixture-v1",
      transport: "PROVIDER" as const,
      providerKind: "OPENAI_DIRECT" as const,
      model: "qualification-model",
      safeConfiguration: {
        ...generation,
        verbosityControl: "NATIVE_PARAMETER" as const,
        providerFallbackAllowed: false as const,
        routedProviderConstraint: null,
        dataCollection: "DIRECT_STORE_DISABLED" as const,
      },
      async invoke({ request }: { request: any; signal: AbortSignal }) {
        calls += 1;
        const payload = JSON.parse(request.userPayload);
        const token = payload.referenceTokenContract.catalog
          .find((entry: { referenceClass: string; semanticRole: string }) =>
            entry.referenceClass === "FACT" && entry.semanticRole === "ISSUE_SUPPORTING")?.token;
        const evidenceClass = payload.resolutionContract.requiredEvidenceClasses?.[0];
        if (!token) throw new Error("qualification semantic fixture fact token missing");
        if (!evidenceClass) throw new Error("qualification semantic fixture evidence class missing");
        return {
          rawDraft: validDraftForToken(token, evidenceClass),
          usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsdMicros: 3_000, latencyMs: 5 },
          providerRequestId: `req_qualification_${calls}`,
          returnedModel: "qualification-model",
          safeTelemetry: {
            httpStatus: 200,
            requestSha256: String(calls).repeat(64).slice(0, 64),
            schemaSha256: "a".repeat(64),
            finishReason: "stop",
            routedProvider: null,
          },
        };
      },
    };
    const deterministicState = deterministicStateFixture();

    const result = await qualifyShadowAiPlannerProviderV1({
      adapter,
      schemaControlPacket: packet("qualification-schema"),
      adversarialControlPacket: packet("qualification-adversarial"),
      goldPacket: packet("qualification-gold"),
      captureDeterministicState: () => deterministicState,
    });

    expect(result.status).toBe("QUALIFIED");
    expect(result.providerCalls).toBe(3);
    expect(result.timeoutMsPerCall).toBe(60_000);
    expect(result.maximumOutputTokens).toBe(4_000);
    expect(result.adapterConfiguration).toMatchObject({
      reasoningEffort: "none",
      verbosity: "low",
      providerFallbackAllowed: false,
    });
    expect(result.retries).toBe(0);
    expect(result.fallbackAttempts).toBe(0);
    expect(result.rawProviderContentPersisted).toBe(false);
    expect(result.stages.map((stage) => stage.status)).toEqual(["PASSED", "PASSED", "PASSED"]);
    expect(result.stages[1].crossRequestReplayRejected).toBe(true);
    expect(calls).toBe(3);
  });

  it("stops qualification on the first provider failure", async () => {
    let calls = 0;
    const adapter = {
      adapterId: "qualification-failure-fixture-v1",
      transport: "PROVIDER" as const,
      providerKind: "OPENROUTER" as const,
      model: "qualification-model",
      safeConfiguration: {
        ...generation,
        verbosityControl: "PROVIDER_NEUTRAL_INSTRUCTION" as const,
        providerFallbackAllowed: false as const,
        routedProviderConstraint: "openai",
        dataCollection: "deny" as const,
      },
      async invoke(): Promise<never> {
        calls += 1;
        throw new ShadowAiPlannerTransportErrorV1(
          "UNAVAILABLE", "shadow_planner_openrouter_rate_limited", "RESPONSE_RECEIVED", true,
        );
      },
    };

    const result = await qualifyShadowAiPlannerProviderV1({
      adapter,
      schemaControlPacket: packet("qualification-stop-schema"),
      adversarialControlPacket: packet("qualification-stop-adversarial"),
      goldPacket: packet("qualification-stop-gold"),
      captureDeterministicState: deterministicStateFixture,
    });

    expect(result.status).toBe("REJECTED");
    expect(result.providerCalls).toBe(1);
    expect(result.stages.map((stage) => stage.status)).toEqual(["FAILED", "SKIPPED", "SKIPPED"]);
    expect(calls).toBe(1);
  });
});

function normalizeInput(responseText: string) {
  return {
    responseText,
    httpStatus: 200,
    headerRequestId: null,
    latencyMs: 1,
    pricing,
    requestSha256: "a".repeat(64),
    schemaSha256: "b".repeat(64),
  };
}

function expectTransportSafety(operation: () => unknown, safeCode: string): void {
  try { operation(); }
  catch (error) {
    expect(error).toBeInstanceOf(ShadowAiPlannerTransportErrorV1);
    expect(error).toMatchObject({ kind: "SAFETY_BLOCKED", safeCode });
    return;
  }
  throw new Error("expected transport safety rejection");
}

function openAiEnvelope(draftText: string, model: string) {
  return {
    id: "resp_openai_test",
    object: "response",
    status: "completed",
    error: null,
    model,
    output: [
      { id: "reasoning_test", type: "reasoning", summary: [] },
      { id: "message_test", type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: draftText, annotations: [] }] },
    ],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
  };
}

function openRouterEnvelope(draftText: string, model: string, provider = "test-provider") {
  return {
    id: "resp_openrouter_test",
    object: "response",
    status: "completed",
    error: null,
    model,
    output: [
      { id: "reasoning_router_test", type: "reasoning", summary: [] },
      { id: "message_router_test", type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: draftText, annotations: [] }] },
    ],
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost: 0.00004 },
    openrouter_metadata: {
      attempt: 1,
      endpoints: { available: [{ model, provider, selected: true }], total: 1 },
    },
  };
}

function response(body: string, requestId = "req_test", status = 200) {
  return {
    status,
    headers: { get: (name: string) => name.toLowerCase() === "x-request-id" ? requestId : null },
    text: async () => body,
  };
}

function sequenceClock(...values: number[]) {
  let index = 0;
  return { nowMs: () => values[Math.min(index++, values.length - 1)] };
}

function packet(issueId: string): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: `run-${issueId}`,
    issueId,
    issueClass: "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
    processorFamily: "Fiserv / First Data",
    processorProgram: null,
    statementPeriod: { start: "2026-08-01", end: "2026-08-31" },
    acceptedIssueRelevantActivityFacts: [{
      factRef: "fact_v2_submitted_transaction_count",
      field: "submittedTransactionCount",
      state: "KNOWN",
      value: 120,
      population: "submitted_transactions",
      evidenceRefs: ["evidence_v2_statement_occurrence_001"],
    }],
    selectedRdChargeRefs: ["economic_charge_001"],
    sanitizedFeeLabels: ["AUTHORIZATION SERVICE"],
    acceptedEconomicCategories: ["PROCESSOR_OR_SERVICE_ECONOMICS"],
    acceptedSensitivityStates: ["TRANSACTION_COUNT_DRIVEN"],
    acceptedQualificationIntegrityState: "UNKNOWN",
    acceptedParticipantControlStates: [{
      rdChargeRef: "economic_charge_001",
      collector: { state: "KNOWN", value: "processor_or_acquirer" },
      economicBeneficiary: { state: "UNKNOWN", value: null },
      ruleSetter: { state: "UNKNOWN", value: null },
      priceSetter: { state: "UNKNOWN", value: null },
      merchantFacingPriceController: { state: "UNKNOWN", value: null },
    }],
    unresolvedClaimFacets: ["authorizationCount", "settledTransactionCount"],
    unresolvedReasonCodes: ["authorization_and_settlement_populations_not_interchangeable"],
    acceptedFactRefs: ["fact_v2_submitted_transaction_count"],
    currentGovernedEvidenceRefs: ["governed_evidence_authorization_definition"],
    allowedEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"],
    prohibitedConclusions: ["canonical_fact_change", "savings_or_annualization", "customer_action_or_finding"],
    merchantBusinessContext: null,
    competingHypothesisRequired: true,
  };
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  });
}

function validDraft(compiled: ReturnType<typeof compileShadowAiPlannerProviderRequestV1>): ShadowAiPlannerDraftV1 {
  const fact = compiled.localBinding.referenceAliases.find((entry) => entry.referenceClass === "FACT")?.token;
  if (!fact) throw new Error("missing fact alias");
  return {
    exactCitedReferenceTokens: [fact],
    unresolvedQuestion: "Which period-matched authorization and settlement populations apply?",
    primaryHypothesis: {
      hypothesis: "The submitted population may differ from authorization attempts and final settlements.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Authorization and settlement counts are not accepted facts."],
      confirmationRequirements: ["Obtain processor operational population definitions and counts."],
      falsificationConditions: ["Period-matched processor data shows the populations are identical."],
    },
    alternativeHypotheses: [{
      hypothesis: "The submitted and settled counts may match while authorization attempts remain higher.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Declines and reversals are not available."],
      confirmationRequirements: ["Obtain authorization outcome detail."],
      falsificationConditions: ["No declined, reversed, or unmatched attempts are present."],
    }],
    acknowledgedEvidenceGaps: ["Period-matched operational populations are missing."],
    recommendedResolutionPath: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED",
    requiredEvidenceClasses: ["PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA"],
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: [],
    documentRequestSuggestions: [],
    operationalDataRequests: ["Request authorization attempts, approvals, and settled counts for the statement period."],
    internalExplanationDraft: "This remains an internal unresolved planning draft.",
    limitationCodes: ["provider_draft_untrusted", "no_new_evidence_admitted"],
    reconstructionSuspicions: [],
  };
}

function validDraftForToken(
  fact: string,
  evidenceClass: ShadowAiPlannerDraftV1["requiredEvidenceClasses"][number],
): ShadowAiPlannerDraftV1 {
  return {
    exactCitedReferenceTokens: [fact],
    unresolvedQuestion: "Which accepted population definition applies to the unresolved issue?",
    primaryHypothesis: {
      hypothesis: "The accepted submitted population may not represent all attempted authorizations.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Period-matched authorization outcome data is unavailable."],
      confirmationRequirements: ["Obtain processor authorization outcome data."],
      falsificationConditions: ["Accepted data proves the populations are identical."],
    },
    alternativeHypotheses: [{
      hypothesis: "The populations may be identical after exclusions are applied.",
      confidence: "LOW",
      supportingReferenceTokens: [fact],
      contradictingReferenceTokens: [],
      acknowledgedEvidenceGaps: ["Exclusion rules are unavailable."],
      confirmationRequirements: ["Obtain processor population definitions."],
      falsificationConditions: ["Definitions show materially different populations."],
    }],
    acknowledgedEvidenceGaps: ["Operational population evidence is unavailable."],
    recommendedResolutionPath: "PROCESSOR_OR_GATEWAY_DATA_REQUIRED",
    requiredEvidenceClasses: [evidenceClass],
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: [],
    documentRequestSuggestions: [],
    operationalDataRequests: ["Request period-matched authorization outcome data."],
    internalExplanationDraft: "Non-authoritative internal qualification draft.",
    limitationCodes: ["provider_draft_untrusted"],
    reconstructionSuspicions: [],
  };
}

function deterministicStateFixture() {
  return {
    canonicalFinancialTruth: "same",
    rdArtifacts: "same",
    reconciliation: "same",
    commercialTruth: "same",
    governedKnowledge: "same",
    permissions: "same",
    customerOutput: false,
  };
}

function plannerAdapter(
  invoke: ShadowAiPlannerTransportAdapterV1["invoke"],
): ShadowAiPlannerTransportAdapterV1 {
  return {
    adapterId: "transport-cleanup-fixture-v1",
    transport: "PROVIDER",
    providerKind: "OPENAI_DIRECT",
    model: "test-openai-model",
    safeConfiguration: {
      ...generation,
      verbosityControl: "NATIVE_PARAMETER",
      providerFallbackAllowed: false,
      routedProviderConstraint: null,
      dataCollection: "DIRECT_STORE_DISABLED",
    },
    invoke,
  };
}
