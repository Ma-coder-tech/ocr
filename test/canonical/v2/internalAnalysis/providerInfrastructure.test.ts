import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, realpath, symlink } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPROVED_OPENROUTER_ENDPOINT, APPROVED_OPENAI_ENDPOINT, OPENROUTER_SEARCH_CONFIGURATION_CODE, ProviderOperationAuditLog, assertInternalProviderPreflight,
  createInternalLiveExecutionCapability, createLiveOpenRouterSearchAdapter, createLiveOpenAiInvestigativeAdapter,
  createLiveOpenAiSemanticAdapter, createInternalLiveIntelligencePorts,
  createDestinationPermit, createNodeHttpsRetrievalPort, createPublicDocumentExtractionPort, createPublicSourceAuthorityAdmission,
  INVESTIGATIVE_RESPONSE_SCHEMA_HASH, OPENROUTER_SEARCH_IDENTITY_SCHEMA_HASH, type SearchRequest,
  inspectProviderOutboundPacket, normalizeOpenRouterSearchResponse, runInternalProviderPreflight, sanitizePublicDocumentTextForProvider,
} from "../../../../src/canonical/v2/index.js";
import { unsafeProviderContext } from "./injectedStatement1Fixture.js";

const originalFetch = globalThis.fetch;
const originalEnvironment = { openrouter: process.env.OPENROUTER_API_KEY, searchModel: process.env.OPENROUTER_SEARCH_MODEL,
  openai: process.env.OPENAI_API_KEY, model: process.env.OPENAI_INTERNAL_ANALYSIS_MODEL };
afterEach(() => { globalThis.fetch = originalFetch; restore("OPENROUTER_API_KEY", originalEnvironment.openrouter); restore("OPENROUTER_SEARCH_MODEL", originalEnvironment.searchModel);
  restore("OPENAI_API_KEY", originalEnvironment.openai); restore("OPENAI_INTERNAL_ANALYSIS_MODEL", originalEnvironment.model); vi.useRealTimers(); vi.restoreAllMocks(); });

const admission = () => createPublicSourceAuthorityAdmission({ admissionId: "live-test-admission", admissionVersion: 1,
  authority: "processor_publication", origin: "https://docs.example.test", publicationFamilyCode: "official_processor_terminology",
  publicationMetadata: { title: "Official processor terminology", version: "v1", publicationDate: null, samplePeriodStart: null,
    samplePeriodEnd: null, effectiveFrom: null, effectiveTo: null, periodApplicabilityPolicy: "period_not_applicable",
    retrievalVerifiedOn: "2026-08-24", provenanceUrls: [] }, pathMatchMode: "path_family", maximumEvidentiaryScope: "claim_class_only",
  allowedClaimTypes: ["processor_term"], allowedEvidenceClasses: ["official_processor_terminology"],
  allowedSourceTypeCodes: ["official_processor_terminology"], allowedSubjectCodes: ["application_fee_terminology"],
  allowedProcessorPrograms: ["fiserv_first_data"], allowedGeographyCodes: ["us"], allowedPathPrefixes: ["/application-fee"],
  approvedDocumentFingerprints: [] });

async function capability(cancellationSignal?: AbortSignal) {
  process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000"; process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
  process.env.OPENAI_API_KEY = "openai-test-secret-000000"; process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "approved-test-model";
  const outputRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "live-capability-")));
  return createInternalLiveExecutionCapability({ schemaVersion: "internal_live_preflight_input_v1", runMode: "internal_live_evaluation", runId: "statement-one-live-test",
    outputRoot, productOwnerLiveCallAuthorization: true, approvedOpenRouterSearchModel: "openai/gpt-5.2", approvedOpenAiModel: "approved-test-model",
    sourceAuthorityAdmissions: [admission()], questionContexts: [unsafeProviderContext({})], languageCapability: "disabled", cancellationSignal });
}

const searchRequest: SearchRequest = { reservationId: "attempt-one:call", attemptId: "attempt-one", questionId: "question-one",
  queryTerms: ["application_fee_terminology", "fiserv_first_data"], allowedAuthorities: ["processor_publication"], maximumCandidates: 3,
  outputAccounting: "search_discovery_not_model_generation", logicalAttempt: 1, untrustedContentPolicy: "data_only_no_instructions" };

describe("internal-analysis construction-bound provider seams", () => {
  it("binds fixed endpoints, exact schemas, one send, and truthful success receipts", async () => {
    const cap = await capability(); const sent: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url, init) => { sent.push({ url: String(url), init: init! }); const request = JSON.parse(String(init?.body));
      const identity = JSON.parse(request.messages[1].content); return { status: 200,
        json: async () => openRouterResponse(identity.providerRequestId, [{ url: "https://docs.example.test/application-fee", title: "Official title", content: "discard me" }]) } as Response; });
    const audit = new ProviderOperationAuditLog(); const response = await createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest);
    expect(sent).toHaveLength(1); expect(sent[0]!.url).toBe(APPROVED_OPENROUTER_ENDPOINT); expect(response.candidates[0]).toMatchObject({ rank: 1, locatorHint: null,
      discoveryMetadata: { providerCode: "openrouter_web_search", configurationCode: OPENROUTER_SEARCH_CONFIGURATION_CODE, sourceDomain: "docs.example.test", providerSnippetUsedAsEvidence: false } });
    expect(JSON.stringify(response)).not.toContain("discard me");
    const requestBody = JSON.parse(String(sent[0]!.init.body));
    expect(requestBody).toMatchObject({ model: "openai/gpt-5.2", store: false, stream: false, max_tool_calls: 1,
      tools: [{ type: "openrouter:web_search", parameters: { engine: "perplexity", max_results: 3, max_total_results: 3, max_uses: 1 } }],
      provider: { only: ["openai"], allow_fallbacks: false, require_parameters: true, data_collection: "deny" } });
    expect(audit.snapshot()).toEqual([expect.objectContaining({ reservationId: "attempt-one:call", actualSendCount: 1, sendState: "sent", completionState: "completed",
      retryCount: 0, providerRequestCount: 1, usageCostUsd: 0.0123, providerConfigurationCode: OPENROUTER_SEARCH_CONFIGURATION_CODE })]);
    expect(cap.searchIdentitySchemaHash).toBe(OPENROUTER_SEARCH_IDENTITY_SCHEMA_HASH);
    expect(cap.investigativeSchemaHash).toBe(INVESTIGATIVE_RESPONSE_SCHEMA_HASH); expect(cap.openAiEndpoint).toBe(APPROVED_OPENAI_ENDPOINT);
    expect(cap.authorityRegistryHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes documented OpenRouter citation responses without treating provider prose as evidence", () => {
    const providerRequestId = "provider-request-00000000-0000-4000-8000-000000000000";
    const documented = [
      { name: "assistant prose", content: "Here are the public results.", annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
      { name: "empty text", content: "", annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
      { name: "null text", content: null, annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
      { name: "structured identity", content: JSON.stringify({ schemaVersion: "openrouter_search_identity_v1", providerRequestId }),
        annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
    ];
    for (const fixture of documented) {
      const body = openRouterResponse(providerRequestId, [], { choices: [{ index: 0, message: { role: "assistant", content: fixture.content,
        annotations: fixture.annotations, provider_metadata: { ignored: true } } }], unrelated_provider_metadata: { ignored: true } });
      const normalized = normalizeOpenRouterSearchResponse(body, { request: searchRequest, providerRequestId, expectedModel: "openai/gpt-5.2" });
      expect(normalized.candidates, fixture.name).toHaveLength(1);
      expect(normalized.candidates[0]).toMatchObject({ url: "https://docs.example.test/application-fee", title: "Official title" });
      expect(JSON.stringify(normalized), fixture.name).not.toContain("provider snippet must be discarded");
    }

    const noSearch = openRouterResponse(providerRequestId, [], { choices: [{ index: 0, message: { role: "assistant", content: "No usable public result." } }],
      usage: { completion_tokens: 4, cost: 0.001, server_tool_use: { web_search_requests: 0 } } });
    const normalizedNoSearch = normalizeOpenRouterSearchResponse(noSearch, { request: searchRequest, providerRequestId, expectedModel: "openai/gpt-5.2" });
    expect(normalizedNoSearch).toMatchObject({ candidates: [], providerRequestCount: 0, usageKnown: true });
  });

  it("fails malformed, URL-less, duplicate, excessive, wrong-identity, and hidden-fallback OpenRouter responses closed", async () => {
    const cases: Array<{ name: string; mutate: (response: ReturnType<typeof openRouterResponse>) => unknown; reason: string }> = [
      { name: "malformed", mutate: (response) => ({ ...response, choices: [{ index: 0, message: { role: "assistant", content: [], annotations: [] } }] }), reason: "response_malformed" },
      { name: "missing-url", mutate: (response) => ({ ...response, choices: [{ ...response.choices[0], message: { ...response.choices[0]!.message,
        annotations: [{ type: "url_citation", url_citation: { title: "Missing URL" } }] } }] }), reason: "result_malformed" },
      { name: "duplicate-url", mutate: (response) => ({ ...response, choices: [{ ...response.choices[0], message: { ...response.choices[0]!.message,
        annotations: [citation("https://docs.example.test/application-fee", "One"), citation("https://docs.example.test/application-fee", "Two")] } }] }), reason: "duplicate_url" },
      { name: "too-many", mutate: (response) => ({ ...response, choices: [{ ...response.choices[0], message: { ...response.choices[0]!.message,
        annotations: Array.from({ length: 4 }, (_, index) => citation(`https://docs.example.test/application-fee-${index}`, `Title ${index}`)) } }] }), reason: "result_cap_exceeded" },
      { name: "wrong-identity", mutate: (response) => ({ ...response, choices: [{ ...response.choices[0], message: { ...response.choices[0]!.message,
        content: JSON.stringify({ schemaVersion: "openrouter_search_identity_v1", providerRequestId: "provider-request-00000000-0000-4000-8000-000000000000" }) } }] }), reason: "identity_invalid" },
      { name: "fallback", mutate: (response) => ({ ...response, openrouter_metadata: { attempts: [{ provider: "one" }, { provider: "two" }] } }), reason: "fallback_or_retry_detected" },
    ];
    for (const item of cases) {
      const cap = await capability(); const audit = new ProviderOperationAuditLog(); let sends = 0;
      globalThis.fetch = vi.fn(async (_url, init) => { sends += 1; const request = JSON.parse(String(init?.body)); const identity = JSON.parse(request.messages[1].content);
        return { status: 200, json: async () => item.mutate(openRouterResponse(identity.providerRequestId, [])) } as Response; });
      await expect(createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest)).rejects.toThrow(item.reason);
      expect(sends, item.name).toBe(1); expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, retryCount: 0, completionState: "failed", usageState: "unknown_possible_billable" });
    }
  });

  it("preserves missing OpenRouter usage as unknown, distinguishes rate limits, and forbids a second send for one reservation", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); let sends = 0;
    globalThis.fetch = vi.fn(async (_url, init) => { sends += 1; const request = JSON.parse(String(init?.body)); const identity = JSON.parse(request.messages[1].content);
      const response = openRouterResponse(identity.providerRequestId, [{ url: "https://docs.example.test/application-fee", title: "Official title" }]);
      return { status: 200, json: async () => ({ ...response, usage: undefined }) } as Response; });
    const adapter = createLiveOpenRouterSearchAdapter(cap, audit); await adapter.search(searchRequest);
    expect(audit.snapshot()[0]).toMatchObject({ providerRequestCount: null, usageCostUsd: null, outputTokens: null, usageState: "unknown_possible_billable" });
    await expect(adapter.search(searchRequest)).rejects.toThrow("duplicate_provider_operation_receipt"); expect(sends).toBe(1);

    const rateCap = await capability(); const rateAudit = new ProviderOperationAuditLog(); let rateSends = 0;
    globalThis.fetch = vi.fn(async () => { rateSends += 1; return { status: 429, json: async () => ({ error: { code: 429 } }) } as Response; });
    await expect(createLiveOpenRouterSearchAdapter(rateCap, rateAudit).search(searchRequest)).rejects.toThrow("rate_limited");
    expect(rateSends).toBe(1); expect(rateAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, retryCount: 0, completionState: "failed", usageState: "unknown_possible_billable" });
  });

  it("rejects unsupported OpenRouter engine/loop/fallback preflight configurations", () => {
    const base = { schemaVersion: "internal_provider_preflight_input_v1" as const, runMode: "internal_live_evaluation" as const,
      executionMode: "injected_evaluation" as const, runId: "openrouter-preflight", outputDirectory: "/private/tmp/openrouter-preflight",
      sourceAuthorityRegistryLoaded: true, questionContexts: [unsafeProviderContext({})],
      search: { provider: "openrouter_web_search" as const, engine: "perplexity" as const, credentialPresent: false, modelConfigured: true,
        maxUses: 1 as const, maxToolCalls: 1 as const, resultCapBounded: true, fallbackProvidersAllowed: false as const,
        automaticRetries: 0 as const, timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
      models: { provider: "openai_responses_api" as const, credentialPresent: false, modelConfigured: true, structuredOutputSupported: true,
        outputTokenCeilingsSupported: true, automaticRetries: 0 as const, timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
      languageCapability: "disabled" as const, productOwnerLiveCallAuthorization: false };
    for (const search of [{ ...base.search, engine: "auto" }, { ...base.search, maxUses: 2 }, { ...base.search, maxToolCalls: 2 },
      { ...base.search, fallbackProvidersAllowed: true }]) {
      expect(runInternalProviderPreflight({ ...base, search } as never).reasonCodes).toContain("preflight_search_configuration_unsupported");
    }
  });

  it("uses exact OpenAI Responses schema, store=false, identity, token usage, and one send", async () => {
    const cap = await capability(); let requestBody = "";
    globalThis.fetch = vi.fn(async (_url, init) => { requestBody = String(init?.body); return { status: 200, json: async () => ({
      output_text: JSON.stringify({ batchId: "batch-one", attemptId: "attempt-one", schemaVersion: "investigative_observation_v1", items: [] }), usage: { output_tokens: 7 } }) } as Response; });
    const audit = new ProviderOperationAuditLog(); const adapter = createLiveOpenAiInvestigativeAdapter(cap, audit);
    await adapter.investigate({ batchId: "batch-one", attemptId: "attempt-one", schemaVersion: "investigative_observation_v1", expectedItemIds: [],
      reservationId: "operation-one:call", maximumOutputTokens: 1_200, logicalAttempt: 1, items: [], untrustedContentPolicy: "data_only_no_instructions" });
    const body = JSON.parse(requestBody); expect(body).toMatchObject({ store: false, max_output_tokens: 1_200, text: { format: { type: "json_schema", strict: true } } });
    expect(body.text.format.schema).not.toEqual({}); expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed", outputTokens: 7, usageState: "known" });
  });

  it("rejects nested, percent-encoded, and base64 private payloads before send", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as never;
    await expect(createLiveOpenRouterSearchAdapter(cap, audit).search({ ...searchRequest,
      queryTerms: [encodeURIComponent("merchant id MID 123456789")] })).rejects.toThrow("provider_private_payload_blocked");
    expect(fetchSpy).not.toHaveBeenCalled(); expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 0, completionState: "not_sent", usageState: "known" });
    const encoded = Buffer.from("/Users/private/merchant-statement.pdf").toString("base64");
    expect(inspectProviderOutboundPacket({ provider: "openai_responses_api", url: APPROVED_OPENAI_ENDPOINT, method: "POST", headerNames: ["Authorization"],
      body: JSON.stringify({ nested: [{ encoded }] }) })).toMatchObject({ valid: false });
  });

  it("masks public sample identifiers and amounts without weakening outbound privacy validation", () => {
    const sanitized = sanitizePublicDocumentTextForProvider("Merchant Number 000000000000 MID; Non swiped discount $15.97 at .0285.");
    expect(sanitized).toBe("public sample identifier [public_sample_number] public sample identifier; Non swiped discount [public_sample_amount] at .0285.");
    expect(inspectProviderOutboundPacket({ provider: "openai_responses_api", url: APPROVED_OPENAI_ENDPOINT, method: "POST",
      headerNames: ["Authorization"], body: JSON.stringify({ text: sanitized }) })).toMatchObject({ valid: true });
    expect(inspectProviderOutboundPacket({ provider: "openrouter_web_search", url: APPROVED_OPENROUTER_ENDPOINT, method: "POST",
      headerNames: ["Authorization"], body: JSON.stringify({ content: JSON.stringify({
        providerRequestId: "provider-request-00000000-0000-4000-8000-000000000000",
      }) }) })).toMatchObject({ valid: true });
  });

  it("fails malformed response identity and preserves unknown provider usage as possibly billable", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ output_text: JSON.stringify({ schemaVersion: "investigative_observation_v1", items: [] }) }) } as Response));
    const adapter = createLiveOpenAiInvestigativeAdapter(cap, audit);
    await expect(adapter.investigate({ batchId: "batch-bad", attemptId: "attempt-bad", schemaVersion: "investigative_observation_v1", expectedItemIds: [],
      reservationId: "operation-bad:call", maximumOutputTokens: 1_200, logicalAttempt: 1, items: [], untrustedContentPolicy: "data_only_no_instructions" })).rejects.toThrow("openai_response_identity_invalid");
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "failed", usageState: "unknown_possible_billable" });
    const cap2 = await capability(); const audit2 = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ output_text: JSON.stringify({ batchId: "batch-unknown", attemptId: "attempt-unknown", schemaVersion: "investigative_observation_v1", items: [] }) }) } as Response));
    const response = await createLiveOpenAiInvestigativeAdapter(cap2, audit2).investigate({ batchId: "batch-unknown", attemptId: "attempt-unknown", schemaVersion: "investigative_observation_v1",
      expectedItemIds: [], reservationId: "operation-unknown:call", maximumOutputTokens: 1_200, logicalAttempt: 1, items: [], untrustedContentPolicy: "data_only_no_instructions" });
    expect(response.reportedOutputTokens).toBeNull(); expect(audit2.snapshot()[0]).toMatchObject({ completionState: "completed", usageState: "unknown_possible_billable", outputTokens: null });
  });

  it("records a timeout after one send as timed out and possibly billable without retry", async () => {
    vi.useFakeTimers(); const cap = await capability(); const audit = new ProviderOperationAuditLog(); let calls = 0;
    globalThis.fetch = vi.fn(async (_url, init) => { calls += 1; return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }); });
    const pending = createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest);
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(8_001);
    await rejected; expect(calls).toBe(1);
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "timed_out", usageState: "unknown_possible_billable", retryCount: 0 });
  });

  it("propagates the live transport timeout as a runtime timeout without retry", async () => {
    vi.useFakeTimers(); const cap = await capability(); const audit = new ProviderOperationAuditLog(); let calls = 0;
    globalThis.fetch = vi.fn(async (_url, init) => { calls += 1; return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }); });
    const ports = createInternalLiveIntelligencePorts(cap, audit);
    const pending = ports.clock.runWithTimeout(8_000, () => ports.search!.search(searchRequest));
    await vi.advanceTimersByTimeAsync(8_001);
    await expect(pending).resolves.toEqual({ status: "timeout" });
    expect(calls).toBe(1);
    expect(audit.snapshot()[0]).toMatchObject({ completionState: "timed_out", actualSendCount: 1, retryCount: 0 });
  });

  it("records construction-bound cancellation after one send without retry", async () => {
    const cancellation = new AbortController(); const cap = await capability(cancellation.signal); const audit = new ProviderOperationAuditLog(); let calls = 0;
    globalThis.fetch = vi.fn(async (_url, init) => { calls += 1; return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }); });
    const pending = createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest); const rejected = expect(pending).rejects.toThrow();
    await Promise.resolve(); cancellation.abort(); await rejected;
    expect(calls).toBe(1); expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "cancelled", usageState: "unknown_possible_billable", retryCount: 0 });
  });

  it("records cancellation before send as known non-billable", async () => {
    const cancellation = new AbortController(); cancellation.abort(); const cap = await capability(cancellation.signal);
    const audit = new ProviderOperationAuditLog(); const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as never;
    await expect(createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest)).rejects.toThrow("cancelled_before_send");
    expect(fetchSpy).not.toHaveBeenCalled(); expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 0, completionState: "not_sent", usageState: "known", retryCount: 0 });
  });

  it("records unavailable transport before send as not sent and known non-billable", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); globalThis.fetch = undefined as never;
    await expect(createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest)).rejects.toThrow("provider_transport_unavailable");
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 0, completionState: "not_sent", usageState: "known", retryCount: 0 });
  });

  it("records one-send retrieval redirect refusal, timeout, and cancellation without hidden hops", async () => {
    const permit = createDestinationPermit({ candidateId: "candidate-one", rawUrl: "https://docs.example.test/application-fee",
      resolvedAddresses: ["93.184.216.34"], permitId: "permit-one", nowMs: 0, ttlMs: 60_000 });
    const request = (signal: AbortSignal) => ({ reservationId: "retrieval-operation:document", questionId: "question-one", candidateId: "candidate-one",
      documentId: "document-one", permit, maximumBytes: 1_024, httpsOnly: true as const, logicalAttempt: 1 as const, signal,
      recordReceivedBytes: () => "continue" as const, authorizeRedirect: async () => permit });

    const redirectAudit = new ProviderOperationAuditLog(); const redirectCap = await capability();
    let redirectSends = 0;
    const redirectSpy = vi.spyOn(https, "request").mockImplementation(((options: any, callback: any) => {
      const req = new EventEmitter() as any; req.setTimeout = () => req; req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
      req.end = () => { redirectSends += 1; const response = new EventEmitter() as any; response.statusCode = 302;
        response.headers = { location: "https://other.example.test/redirect" }; response.socket = { remoteAddress: "93.184.216.34" }; response.destroy = () => undefined; callback(response); };
      void options; return req;
    }) as never);
    const redirect = await createNodeHttpsRetrievalPort(redirectCap, { audit: redirectAudit }).retrieve(request(new AbortController().signal));
    expect(redirect).toMatchObject({ status: "safety_blocked", redirects: [], content: null }); expect(redirectSends).toBe(1);
    expect(redirectAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed", safeReasonCode: "retrieval_redirect_not_followed", retryCount: 0 });
    redirectSpy.mockRestore();

    const timeoutAudit = new ProviderOperationAuditLog(); const timeoutCap = await capability(); let timeoutSends = 0;
    const timeoutSpy = vi.spyOn(https, "request").mockImplementation(((_options: any, _callback: any) => {
      const req = new EventEmitter() as any; let timeout: () => void = () => undefined; req.setTimeout = (_ms: number, value: () => void) => { timeout = value; return req; };
      req.destroy = (error?: Error) => { if (error) req.emit("error", error); }; req.end = () => { timeoutSends += 1; timeout(); }; return req;
    }) as never);
    await expect(createNodeHttpsRetrievalPort(timeoutCap, { audit: timeoutAudit }).retrieve(request(new AbortController().signal))).rejects.toThrow("retrieval_timeout");
    expect(timeoutSends).toBe(1); expect(timeoutAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "timed_out", usageState: "unknown_possible_billable", retryCount: 0 });
    timeoutSpy.mockRestore();

    const cancelAudit = new ProviderOperationAuditLog(); const cancelCap = await capability(); const cancellation = new AbortController(); let cancelSends = 0;
    vi.spyOn(https, "request").mockImplementation(((options: any, _callback: any) => {
      const req = new EventEmitter() as any; req.setTimeout = () => req; req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
      options.signal.addEventListener("abort", () => req.emit("error", new Error("retrieval_cancelled")), { once: true }); req.end = () => { cancelSends += 1; }; return req;
    }) as never);
    const pending = createNodeHttpsRetrievalPort(cancelCap, { audit: cancelAudit }).retrieve(request(cancellation.signal)); const rejected = expect(pending).rejects.toThrow("retrieval_cancelled");
    cancellation.abort(); await rejected; expect(cancelSends).toBe(1);
    expect(cancelAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "cancelled", usageState: "unknown_possible_billable", retryCount: 0 });
  });

  it("fails missing credentials, caller-asserted external preflight, and forged capabilities before send", async () => {
    delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_SEARCH_MODEL; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_INTERNAL_ANALYSIS_MODEL;
    const outputRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "missing-live-secret-")));
    await expect(createInternalLiveExecutionCapability({ schemaVersion: "internal_live_preflight_input_v1", runMode: "internal_live_evaluation", runId: "missing-secret",
      outputRoot, productOwnerLiveCallAuthorization: true, approvedOpenRouterSearchModel: "openai/gpt-5.2", approvedOpenAiModel: "approved-test-model",
      sourceAuthorityAdmissions: [admission()], questionContexts: [unsafeProviderContext({})], languageCapability: "disabled" })).rejects.toThrow("internal_live_secret_missing");
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000"; process.env.OPENROUTER_SEARCH_MODEL = "google/gemini-3-flash-preview";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000"; process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "approved-test-model";
    await expect(createInternalLiveExecutionCapability({ schemaVersion: "internal_live_preflight_input_v1", runMode: "internal_live_evaluation", runId: "wrong-search-model",
      outputRoot, productOwnerLiveCallAuthorization: true, approvedOpenRouterSearchModel: "openai/gpt-5.2", approvedOpenAiModel: "approved-test-model",
      sourceAuthorityAdmissions: [admission()], questionContexts: [unsafeProviderContext({})], languageCapability: "disabled" })).rejects.toThrow("search_model_not_approved");
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000"; process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000"; process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "different-model";
    await expect(createInternalLiveExecutionCapability({ schemaVersion: "internal_live_preflight_input_v1", runMode: "internal_live_evaluation", runId: "wrong-model",
      outputRoot, productOwnerLiveCallAuthorization: true, approvedOpenRouterSearchModel: "openai/gpt-5.2", approvedOpenAiModel: "approved-test-model",
      sourceAuthorityAdmissions: [admission()], questionContexts: [unsafeProviderContext({})], languageCapability: "disabled" })).rejects.toThrow("model_not_approved");
    expect(() => assertInternalProviderPreflight({ schemaVersion: "internal_provider_preflight_input_v1", runMode: "internal_live_evaluation", executionMode: "external_provider",
      runId: "forged", outputDirectory: outputRoot, sourceAuthorityRegistryLoaded: true, questionContexts: [unsafeProviderContext({})],
      search: { provider: "openrouter_web_search", engine: "perplexity", credentialPresent: true, modelConfigured: true, maxUses: 1, maxToolCalls: 1,
        resultCapBounded: true, fallbackProvidersAllowed: false, automaticRetries: 0, timeoutSupported: true, abortSupported: true, oneAttemptTransport: true },
      models: { provider: "openai_responses_api", credentialPresent: true, modelConfigured: true, structuredOutputSupported: true, outputTokenCeilingsSupported: true,
        automaticRetries: 0, timeoutSupported: true, abortSupported: true, oneAttemptTransport: true }, languageCapability: "disabled", productOwnerLiveCallAuthorization: true })).toThrow("construction_bound_live_capability_required");
    expect(() => createLiveOpenRouterSearchAdapter({} as never, new ProviderOperationAuditLog())).toThrow("capability_invalid");
    expect(() => createLiveOpenAiInvestigativeAdapter({} as never, new ProviderOperationAuditLog())).toThrow("capability_invalid");
    expect(() => createLiveOpenAiSemanticAdapter({} as never, new ProviderOperationAuditLog())).toThrow("capability_invalid");
    expect(() => createNodeHttpsRetrievalPort({} as never, { audit: new ProviderOperationAuditLog() })).toThrow("capability_invalid");
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("rejects unsafe and symlinked output roots before capability construction", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000"; process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000"; process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "approved-test-model";
    const target = await realpath(await mkdtemp(path.join(os.tmpdir(), "live-root-target-"))); const link = `${target}-link`; await symlink(target, link);
    await expect(createInternalLiveExecutionCapability({ schemaVersion: "internal_live_preflight_input_v1", runMode: "internal_live_evaluation", runId: "unsafe-root",
      outputRoot: link, productOwnerLiveCallAuthorization: true, approvedOpenRouterSearchModel: "openai/gpt-5.2", approvedOpenAiModel: "approved-test-model",
      sourceAuthorityAdmissions: [admission()], questionContexts: [unsafeProviderContext({})], languageCapability: "disabled" })).rejects.toThrow("output_root_unsafe");
    await expect(createInternalLiveExecutionCapability({ schemaVersion: "internal_live_preflight_input_v1", runMode: "internal_live_evaluation", runId: "unsafe-root",
      outputRoot: "/", productOwnerLiveCallAuthorization: true, approvedOpenRouterSearchModel: "openai/gpt-5.2", approvedOpenAiModel: "approved-test-model",
      sourceAuthorityAdmissions: [admission()], questionContexts: [unsafeProviderContext({})], languageCapability: "disabled" })).rejects.toThrow("output_root_unsafe");
  });

  it("rejects forged endpoint, model, and schema capabilities before adapter construction", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); const send = vi.fn(); globalThis.fetch = send as never;
    expect(() => createLiveOpenRouterSearchAdapter({ ...cap, openRouterEndpoint: "https://attacker.invalid/search" } as never, audit)).toThrow("capability_invalid");
    expect(() => createLiveOpenAiInvestigativeAdapter({ ...cap, modelCode: "unapproved-model" } as never, audit)).toThrow("capability_invalid");
    expect(() => createLiveOpenAiSemanticAdapter({ ...cap, semanticSchemaHash: "0".repeat(64) } as never, audit)).toThrow("capability_invalid");
    expect(send).not.toHaveBeenCalled();
  });

  it("extracts content locators, removes HTML chrome, and distinguishes malformed/encrypted PDFs", async () => {
    const extraction = createPublicDocumentExtractionPort();
    const html = new TextEncoder().encode("<!doctype html><nav>Menu</nav><h1>Application Fee</h1><p>Public terminology only.</p><footer>All rights reserved</footer>");
    const fingerprint = createHash("sha256").update(html).digest("hex");
    const result = await extraction.extract({ questionId: "q", candidateId: "c", documentId: "d", mimeType: "text/html", content: html, maximumOutputBytes: 1_024, expectedDocumentFingerprint: fingerprint });
    expect(result.locators.map((item) => item.text).join(" ")).toContain("Application Fee"); expect(result.locators.map((item) => item.text).join(" ")).not.toMatch(/Menu|rights reserved/);
    for (const value of [new TextEncoder().encode("%PDF-1.7 malformed"), new TextEncoder().encode("%PDF-1.7 /Encrypt protected")]) {
      await expect(extraction.extract({ questionId: "q", candidateId: "c", documentId: "bad", mimeType: "application/pdf", content: value,
        maximumOutputBytes: 1_024, expectedDocumentFingerprint: createHash("sha256").update(value).digest("hex") })).resolves.toMatchObject({ text: null, locators: [] });
    }
  });

  it("completes valid PDF extraction when PDF.js detaches its private working buffer", async () => {
    const content = new Uint8Array(await readFile(path.resolve(process.cwd(),
      "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf")));
    const fingerprint = createHash("sha256").update(content).digest("hex");
    const result = await createPublicDocumentExtractionPort().extract({ questionId: "q", candidateId: "c", documentId: "valid-pdf",
      mimeType: "application/pdf", content, maximumOutputBytes: 1_048_576, expectedDocumentFingerprint: fingerprint });
    expect(result).toMatchObject({ state: "retrieved_extracted", documentFingerprint: fingerprint });
    expect(result.locators.length).toBeGreaterThan(0);
  });
});

function openRouterResponse(providerRequestId: string, citations: Array<{ url: string; title: string; content?: string }>, overrides: Record<string, unknown> = {}) {
  return { id: "chatcmpl-openrouter-test", model: "openai/gpt-5.2", choices: [{ index: 0, message: { role: "assistant",
    content: JSON.stringify({ schemaVersion: "openrouter_search_identity_v1", providerRequestId }),
    annotations: citations.map((url_citation) => ({ type: "url_citation", url_citation })) } }],
    usage: { prompt_tokens: 50, completion_tokens: 12, total_tokens: 62, cost: 0.0123, server_tool_use: { web_search_requests: 1 } }, ...overrides };
}

function citation(url: string, title: string) { return { type: "url_citation", url_citation: { url, title, content: "provider snippet must be discarded" } }; }

function restore(name: string, value: string | undefined): void { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
