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
  INVESTIGATIVE_RESPONSE_SCHEMA_HASH, INVESTIGATIVE_RESPONSE_SCHEMA_V1, OPENROUTER_SEARCH_RESPONSE_CONTRACT_HASH,
  LiveOperationTransportError,
  LiveSearchResponseAdmissionError,
  ProviderReadinessDiagnosticLog, SEMANTIC_RESPONSE_SCHEMA_V1, type SearchRequest, type SemanticVerificationInput,
  inspectProviderOutboundPacket, normalizeOpenRouterSearchResponse, runInternalProviderPreflight, runProviderReadinessProbe,
  sanitizePublicDocumentTextForProvider, validateSemanticMember,
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
  queryTerms: ["application fee", "Fiserv First Data"], queryText: "application fee Fiserv First Data official documentation United States 2024 definition",
  allowedAuthorities: ["processor_publication"], maximumCandidates: 3,
  outputAccounting: "search_discovery_not_model_generation", logicalAttempt: 1, untrustedContentPolicy: "data_only_no_instructions" };

describe("internal-analysis construction-bound provider seams", () => {
  it("binds fixed endpoints, exact schemas, one send, and truthful success receipts", async () => {
    const cap = await capability(); const sent: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url, init) => { sent.push({ url: String(url), init: init! }); return { status: 200,
      headers: new Headers({ "x-request-id": "or-http-request-001" }),
      json: async () => openRouterResponse([{ url: "https://docs.example.test/application-fee", title: "Official title", content: "discard me" }]) } as Response; });
    const audit = new ProviderOperationAuditLog(); const response = await createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest);
    expect(sent).toHaveLength(1); expect(sent[0]!.url).toBe(APPROVED_OPENROUTER_ENDPOINT); expect(response.candidates[0]).toMatchObject({ rank: 1, locatorHint: null,
      discoveryMetadata: { providerCode: "openrouter_web_search", configurationCode: OPENROUTER_SEARCH_CONFIGURATION_CODE, sourceDomain: "docs.example.test", providerSnippetUsedAsEvidence: false } });
    expect(JSON.stringify(response)).not.toContain("discard me");
    const requestBody = JSON.parse(String(sent[0]!.init.body));
    expect(requestBody).toMatchObject({ model: "openai/gpt-5.2", store: false, stream: false, max_tokens: 512,
      reasoning: { effort: "none", exclude: true }, tool_choice: "required", max_tool_calls: 1,
      tools: [{ type: "openrouter:web_search", parameters: { engine: "perplexity", max_results: 3, max_total_results: 3, max_uses: 1 } }],
      provider: { only: ["openai"], allow_fallbacks: false, require_parameters: true, data_collection: "deny" } });
    expect(requestBody.messages[1].content).toBe(JSON.stringify({ query: searchRequest.queryText, maximumCandidates: 3 }));
    expect(requestBody.messages[1].content).not.toContain("providerRequestId");
    expect(audit.snapshot()).toEqual([expect.objectContaining({ reservationId: "attempt-one:call", actualSendCount: 1, sendState: "sent", completionState: "completed",
      retryCount: 0, providerRequestCount: 1, usageCostUsd: 0.0123, providerConfigurationCode: OPENROUTER_SEARCH_CONFIGURATION_CODE,
      httpStatus: 200, providerRequestId: "or-http-request-001", providerResponseId: "chatcmpl-openrouter-test",
      requestedModelIdentifier: "openai/gpt-5.2", returnedModelIdentifier: "openai/gpt-5.2",
      finishReason: null, toolExecutionState: "verified", annotationCount: 1, normalizedCandidateCount: 1 })]);
    expect(audit.snapshot()[0]!.localRequestId).toMatch(/^provider-request-[0-9a-f-]{36}$/);
    expect(cap.searchResponseContractHash).toBe(OPENROUTER_SEARCH_RESPONSE_CONTRACT_HASH);
    expect(cap.investigativeSchemaHash).toBe(INVESTIGATIVE_RESPONSE_SCHEMA_HASH); expect(cap.openAiEndpoint).toBe(APPROVED_OPENAI_ENDPOINT);
    expect(cap.authorityRegistryHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes documented OpenRouter citation responses without treating provider prose as evidence", () => {
    const documented = [
      { name: "assistant prose", content: "Here are the public results.", annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
      { name: "empty text", content: "", annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
      { name: "null text", content: null, annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
      { name: "arbitrary structured model content", content: JSON.stringify({ result: "model generated content is not transport identity" }),
        annotations: [citation("https://docs.example.test/application-fee", "Official title")] },
    ];
    for (const fixture of documented) {
      const body = openRouterResponse([], { choices: [{ index: 0, message: { role: "assistant", content: fixture.content,
        annotations: fixture.annotations, provider_metadata: { ignored: true } } }], unrelated_provider_metadata: { ignored: true } });
      const normalized = normalizeOpenRouterSearchResponse(body, { request: searchRequest, expectedModel: "openai/gpt-5.2" });
      expect(normalized.candidates, fixture.name).toHaveLength(1);
      expect(normalized.candidates[0]).toMatchObject({ url: "https://docs.example.test/application-fee", title: "Official title" });
      expect(JSON.stringify(normalized), fixture.name).not.toContain("provider snippet must be discarded");
    }

    const noSearch = openRouterResponse([], { choices: [{ index: 0, message: { role: "assistant", content: "No usable public result." } }],
      usage: { completion_tokens: 4, cost: 0.001, server_tool_use: { web_search_requests: 0 } } });
    const normalizedNoSearch = normalizeOpenRouterSearchResponse(noSearch, { request: searchRequest, expectedModel: "openai/gpt-5.2" });
    expect(normalizedNoSearch).toMatchObject({ candidates: [], providerRequestCount: 0, usageKnown: true,
      providerMetadata: { toolExecutionState: "not_executed", annotationCount: 0, normalizedCandidateCount: 0 } });

    const executionUnverified = openRouterResponse([], { choices: [{ index: 0,
      finish_reason: "stop", message: { role: "assistant", content: "No usable public result." } }], usage: { completion_tokens: 4 } });
    expect(normalizeOpenRouterSearchResponse(executionUnverified, { request: searchRequest,
      expectedModel: "openai/gpt-5.2" })).toMatchObject({ candidates: [], providerRequestCount: null,
      providerMetadata: { providerResponseId: "chatcmpl-openrouter-test", modelIdentifier: "openai/gpt-5.2",
        finishReason: "stop", toolExecutionState: "unverified", annotationCount: 0, normalizedCandidateCount: 0,
        providerCompletionState: "completed" } });

    const truncated = openRouterResponse([{ url: "https://docs.example.test/application-fee", title: "Official title" }], {
      choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "", annotations: [citation("https://docs.example.test/application-fee", "Official title")] } }],
      usage: { completion_tokens: 512, cost: 0.02, server_tool_use: { web_search_requests: 1 } },
    });
    expect(normalizeOpenRouterSearchResponse(truncated, { request: searchRequest,
      expectedModel: "openai/gpt-5.2" })).toMatchObject({ candidates: [expect.objectContaining({ url: "https://docs.example.test/application-fee" })],
      providerMetadata: { finishReason: "length", toolExecutionState: "unverified", annotationCount: 1, normalizedCandidateCount: 1 } });
  });

  it("fails a length-truncated OpenRouter response closed while preserving safe usage", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async (_url, init) => {
      void init;
      return { status: 200, json: async () => openRouterResponse(
        [{ url: "https://docs.example.test/application-fee", title: "Official title" }], {
          choices: [{ index: 0, finish_reason: "length", message: { role: "assistant", content: "",
            annotations: [citation("https://docs.example.test/application-fee", "Official title")] } }],
          usage: { completion_tokens: 512, cost: 0.02, server_tool_use: { web_search_requests: 1 } },
        }) } as Response;
    });
    const response = await createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest);
    expect(response.providerMetadata).toMatchObject({ finishReason: "length", toolExecutionState: "unverified" });
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed", outputTokens: 512,
      providerRequestCount: 1, usageCostUsd: 0.02, safeReasonCode: "openrouter_search_response_truncated" });
  });

  it("admits valid citations independently while rejecting malformed, duplicate, and unsafe citations", async () => {
    const body = openRouterResponse([], { choices: [{ index: 0, message: { role: "assistant", content: "",
      annotations: [
        citation("https://docs.example.test/application-fee", "Valid official document"),
        citation("not a URL", "Malformed URL"),
        citation("http://docs.example.test/insecure", "Insecure URL"),
        citation("https://user:password@docs.example.test/private", "Credential URL"),
        citation("https://docs.example.test/application-fee", "Duplicate URL"),
        { type: "url_citation", url_citation: { title: "Missing URL" } },
      ],
    } }], usage: { completion_tokens: 21, cost: 0.013, server_tool_use: { web_search_requests: 1 } } });
    const request = { ...searchRequest, maximumCandidates: 6 };
    const normalized = normalizeOpenRouterSearchResponse(body, { request, expectedModel: "openai/gpt-5.2" });
    expect(normalized.candidates).toEqual([expect.objectContaining({
      url: "https://docs.example.test/application-fee", rank: 1,
    })]);
    expect(normalized.citationAdmission).toEqual({
      schemaVersion: "openrouter_search_citation_admission_v1",
      outcome: "partially_admitted", annotationCount: 6, admittedCitationCount: 1,
      rejectedCitationCount: 5,
      reasonCodes: ["openrouter_search_duplicate_url", "openrouter_search_result_malformed",
        "openrouter_search_result_url_invalid"],
      evidenceAdmissionEffect: "none", analyticalCompletionEffect: "none",
    });
    expect(JSON.stringify(normalized)).not.toContain("user:password");

    const cap = await capability(); const audit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 200, headers: new Headers({ "x-request-id": "or-mixed-001" }),
      json: async () => body } as Response));
    const response = await createLiveOpenRouterSearchAdapter(cap, audit).search(request);
    expect(response.candidates).toHaveLength(1);
    expect(response.citationAdmission).toEqual(normalized.citationAdmission);
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed",
      usageState: "known", outputTokens: 21, providerRequestCount: 1, usageCostUsd: 0.013,
      annotationCount: 6, normalizedCandidateCount: 1, providerRequestId: "or-mixed-001" });
  });

  it("keeps fully received batch-level admission failures settled with safe usage diagnostics", async () => {
    const cases: Array<{ name: string; mutate: (response: ReturnType<typeof openRouterResponse>) => unknown; reason: string }> = [
      { name: "malformed", mutate: (response) => ({ ...response, choices: [{ index: 0, message: { role: "assistant", content: [], annotations: [] } }] }), reason: "response_malformed" },
      { name: "too-many", mutate: (response) => ({ ...response, choices: [{ ...response.choices[0], message: { ...response.choices[0]!.message,
        annotations: Array.from({ length: 4 }, (_, index) => citation(`https://docs.example.test/application-fee-${index}`, `Title ${index}`)) } }] }), reason: "result_cap_exceeded" },
      { name: "wrong-model", mutate: (response) => ({ ...response, model: "openai/different-model" }), reason: "identity_invalid" },
      { name: "fallback", mutate: (response) => ({ ...response, openrouter_metadata: { attempts: [{ provider: "one" }, { provider: "two" }] } }), reason: "fallback_or_retry_detected" },
    ];
    for (const item of cases) {
      const cap = await capability(); const audit = new ProviderOperationAuditLog(); let sends = 0;
      globalThis.fetch = vi.fn(async () => { sends += 1;
        return { status: 200, json: async () => item.mutate(openRouterResponse([])) } as Response; });
      const error = await createLiveOpenRouterSearchAdapter(cap, audit).search(searchRequest).then(() => null, (value) => value);
      expect(error, item.name).toBeInstanceOf(LiveSearchResponseAdmissionError);
      expect(error).toMatchObject({ message: expect.stringContaining(item.reason), admission: {
        schemaVersion: "openrouter_search_citation_admission_v1", outcome: "batch_rejected",
        admittedCitationCount: 0, reasonCodes: [expect.stringContaining(item.reason)],
        evidenceAdmissionEffect: "none", analyticalCompletionEffect: "none",
      } });
      expect(sends, item.name).toBe(1); expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, retryCount: 0, completionState: "completed", usageState: "known",
        outputTokens: 12, providerRequestCount: 1, usageCostUsd: 0.0123,
        httpStatus: 200, providerResponseId: "chatcmpl-openrouter-test", returnedModelIdentifier: item.name === "wrong-model" ? "openai/different-model" : "openai/gpt-5.2" });
    }
  });

  it("returns an entirely citation-malformed response as a deterministic no-usable-citations batch", async () => {
    const body = openRouterResponse([], { choices: [{ index: 0, message: { role: "assistant", content: "",
      annotations: [citation("not-a-url", "Bad URL"),
        { type: "url_citation", url_citation: { title: "Missing URL" } }],
    } }] });
    const normalized = normalizeOpenRouterSearchResponse(body, { request: searchRequest,
      expectedModel: "openai/gpt-5.2" });
    expect(normalized.candidates).toEqual([]);
    expect(normalized.citationAdmission).toMatchObject({ outcome: "no_usable_citations",
      annotationCount: 2, admittedCitationCount: 0, rejectedCitationCount: 2,
      reasonCodes: ["openrouter_search_result_malformed", "openrouter_search_result_url_invalid"] });
  });

  it("keeps a fully received invalid JSON search response settled while body-transfer failure remains ambiguous", async () => {
    const settledCap = await capability(); const settledAudit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 200, headers: new Headers({ "x-request-id": "or-json-001" }),
      json: async () => { throw new SyntaxError("Unexpected token"); } } as unknown as Response));
    const settledError = await createLiveOpenRouterSearchAdapter(settledCap, settledAudit).search(searchRequest)
      .then(() => null, (error) => error);
    expect(settledError).toMatchObject({ message: "openrouter_search_response_json_invalid",
      admission: { outcome: "batch_rejected", admittedCitationCount: 0,
        reasonCodes: ["openrouter_search_response_json_invalid"], evidenceAdmissionEffect: "none",
        analyticalCompletionEffect: "none" } });
    expect(settledAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, httpStatus: 200,
      providerRequestId: "or-json-001", completionState: "completed", usageState: "unknown_possible_billable",
      safeReasonCode: "openrouter_search_response_json_invalid" });

    const ambiguousCap = await capability(); const ambiguousAudit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 200, headers: new Headers({ "x-request-id": "or-body-001" }),
      json: async () => { throw new TypeError("terminated"); } } as unknown as Response));
    await expect(createLiveOpenRouterSearchAdapter(ambiguousCap, ambiguousAudit).search(searchRequest))
      .rejects.toMatchObject({ transportState: "after_send" });
    expect(ambiguousAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, httpStatus: 200,
      providerRequestId: "or-body-001", completionState: "failed", usageState: "unknown_possible_billable" });
  });

  it("preserves missing OpenRouter usage as unknown, distinguishes rate limits, and forbids a second send for one reservation", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); let sends = 0;
    globalThis.fetch = vi.fn(async () => { sends += 1;
      const response = openRouterResponse([{ url: "https://docs.example.test/application-fee", title: "Official title" }]);
      return { status: 200, json: async () => ({ ...response, usage: undefined }) } as Response; });
    const adapter = createLiveOpenRouterSearchAdapter(cap, audit); await adapter.search(searchRequest);
    expect(audit.snapshot()[0]).toMatchObject({ providerRequestCount: null, usageCostUsd: null, outputTokens: null, usageState: "unknown_possible_billable" });
    await expect(adapter.search(searchRequest)).rejects.toThrow("duplicate_provider_operation_receipt"); expect(sends).toBe(1);

    const rateCap = await capability(); const rateAudit = new ProviderOperationAuditLog(); let rateSends = 0;
    const beforeRateLimit = Date.now();
    globalThis.fetch = vi.fn(async () => { rateSends += 1; return { status: 429, headers: new Headers({
      "x-request-id": "or-rate-request-001", "retry-after": "7" }),
      json: async () => ({ error: { type: "rate_limit_error", code: 429, param: "web_search", message: "unsafe provider prose" } }) } as Response; });
    await expect(createLiveOpenRouterSearchAdapter(rateCap, rateAudit).search(searchRequest)).rejects.toThrow("rate_limited");
    expect(rateSends).toBe(1); expect(rateAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, retryCount: 0, completionState: "failed", usageState: "known",
      outputTokens: 0, providerRequestCount: 0, usageCostUsd: 0,
      httpStatus: 429, providerRequestId: "or-rate-request-001", providerErrorType: "rate_limit_error", providerErrorCode: "429", providerErrorParam: "web_search" });
    expect(Date.parse(rateAudit.snapshot()[0]!.retryAfterAt!)).toBeGreaterThanOrEqual(beforeRateLimit + 7_000);
    expect(JSON.stringify(rateAudit.snapshot())).not.toContain("unsafe provider prose");
  });

  it("classifies definitive OpenRouter request rejection separately from ambiguous upstream failure", async () => {
    const rejectedCap = await capability();
    const rejectedAudit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 401, headers: new Headers({ "x-request-id": "or-auth-001" }),
      json: async () => ({ error: { code: 401, message: "unsafe provider prose" } }) } as Response));
    const rejected = await createLiveOpenRouterSearchAdapter(rejectedCap, rejectedAudit).search(searchRequest)
      .then(() => null, (error) => error);
    expect(rejected).toBeInstanceOf(LiveOperationTransportError);
    expect(rejected).toMatchObject({ transportState: "provider_rejected", message: "openrouter_search_authentication_rejected" });
    expect(rejectedAudit.snapshot()[0]).toMatchObject({ httpStatus: 401, providerRequestId: "or-auth-001",
      providerErrorCode: "401", completionState: "failed" });
    expect(JSON.stringify(rejectedAudit.snapshot())).not.toContain("unsafe provider prose");

    const ambiguousCap = await capability();
    const ambiguousAudit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 502, headers: new Headers({ "x-request-id": "or-upstream-001" }),
      json: async () => ({ error: { type: "upstream_error", code: "bad_gateway" } }) } as Response));
    const ambiguous = await createLiveOpenRouterSearchAdapter(ambiguousCap, ambiguousAudit).search(searchRequest)
      .then(() => null, (error) => error);
    expect(ambiguous).toBeInstanceOf(LiveOperationTransportError);
    expect(ambiguous).toMatchObject({ transportState: "after_send", message: "openrouter_search_http_failure" });
    expect(ambiguousAudit.snapshot()[0]).toMatchObject({ httpStatus: 502, providerRequestId: "or-upstream-001",
      providerErrorType: "upstream_error", providerErrorCode: "bad_gateway", completionState: "failed" });

    const bodylessCap = await capability();
    const bodylessAudit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 403, headers: new Headers({ "x-request-id": "or-forbidden-001" }),
      json: async () => { throw new SyntaxError("non-json rejection body"); } } as Response));
    const bodyless = await createLiveOpenRouterSearchAdapter(bodylessCap, bodylessAudit).search(searchRequest)
      .then(() => null, (error) => error);
    expect(bodyless).toMatchObject({ transportState: "provider_rejected", message: "openrouter_search_authorization_rejected" });
    expect(bodylessAudit.snapshot()[0]).toMatchObject({ httpStatus: 403, providerRequestId: "or-forbidden-001",
      providerErrorType: null, providerErrorCode: null, completionState: "failed" });
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
    globalThis.fetch = vi.fn(async (_url, init) => { requestBody = String(init?.body); return { status: 200,
      headers: new Headers({ "x-request-id": "oa-http-request-001" }), json: async () => ({ id: "resp-openai-test-001", model: "approved-test-model",
      output_text: JSON.stringify({ batchId: "batch-one", attemptId: "attempt-one", schemaVersion: "investigative_observation_v1", items: [] }), usage: { output_tokens: 7 } }) } as Response; });
    const audit = new ProviderOperationAuditLog(); const adapter = createLiveOpenAiInvestigativeAdapter(cap, audit);
    await adapter.investigate({ batchId: "batch-one", attemptId: "attempt-one", schemaVersion: "investigative_observation_v1", expectedItemIds: [],
      reservationId: "operation-one:call", maximumOutputTokens: 1_200, logicalAttempt: 1, items: [], untrustedContentPolicy: "data_only_no_instructions" });
    const body = JSON.parse(requestBody); expect(body).toMatchObject({ store: false, max_output_tokens: 1_200, text: { format: { type: "json_schema", strict: true } } });
    expect(body.text.format.schema).not.toEqual({}); expect(body).not.toHaveProperty("reasoning");
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed", outputTokens: 7, usageState: "known",
      httpStatus: 200, providerRequestId: "oa-http-request-001", providerResponseId: "resp-openai-test-001",
      requestedModelIdentifier: "approved-test-model", returnedModelIdentifier: "approved-test-model", structuredOutputValidation: "passed" });
  });

  it("uses provider-compatible explicit types for every strict Structured Outputs enum and const", () => {
    for (const schema of [INVESTIGATIVE_RESPONSE_SCHEMA_V1, SEMANTIC_RESPONSE_SCHEMA_V1]) {
      const issues: string[] = [];
      inspectStrictSchemaSubset(schema, "$", issues);
      expect(issues).toEqual([]);
    }
  });

  it("binds semantic judgments to immutable positional inputs without model-authored identity", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); let requestBody = "";
    const inputs = [semanticInput("one", "application_fee_terminology"), semanticInput("two", "non_swiped_discount_terminology")];
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = String(init?.body);
      return { status: 200, headers: new Headers({ "x-request-id": "semantic-binding-request" }), json: async () => ({
        id: "resp-semantic-binding", model: "approved-test-model", usage: { output_tokens: 41 },
        output_text: JSON.stringify({ judgments: {
          slot0: { sourceEffectiveFrom: "2024-01-01", sourceEffectiveTo: null, verificationStatus: "supported_candidate", limitationCodes: ["first_judgment"] },
          slot1: { sourceEffectiveFrom: null, sourceEffectiveTo: "2025-01-01", verificationStatus: "contradicted", limitationCodes: ["second_judgment"] },
          slot2: null, slot3: null,
        } }),
      }) } as Response;
    });
    const response = await createLiveOpenAiSemanticAdapter(cap, audit).verify(semanticRequest(inputs));
    const body = JSON.parse(requestBody); const providerInput = JSON.parse(body.input[1].content[0].text);
    expect(Object.keys(providerInput)).toEqual(["semanticInputs"]);
    expect(providerInput.semanticInputs.map((entry: any) => entry.slotIndex)).toEqual([0, 1]);
    expect(JSON.stringify(body.text.format.schema)).not.toMatch(/itemId|questionId|candidateId|documentId|documentFingerprint|locatorId|investigativeObservationId|proposedValue|sourceAuthority/);
    expect(response.items).toHaveLength(2);
    expect(response.items[0]).toMatchObject({ itemId: "observation-one", investigativeObservationId: "observation-one",
      questionId: "question-one", candidateId: "candidate-one", documentId: "document-one", locatorId: "locator-one",
      documentFingerprint: "a".repeat(64), subjectCode: "application_fee_terminology", verificationStatus: "supported_candidate",
      limitationCodes: ["first_judgment"], sourceEffectiveFrom: "2024-01-01", admissionAuthority: "none", financialMutationAllowed: false });
    expect(response.items[1]).toMatchObject({ itemId: "observation-two", investigativeObservationId: "observation-two",
      questionId: "question-two", candidateId: "candidate-two", documentId: "document-two", locatorId: "locator-two",
      documentFingerprint: "b".repeat(64), subjectCode: "non_swiped_discount_terminology", verificationStatus: "contradicted",
      limitationCodes: ["second_judgment"], sourceEffectiveTo: "2025-01-01", admissionAuthority: "none", financialMutationAllowed: false });
    expect(response.items[0]!.supportId).not.toBe(response.items[1]!.supportId);
    expect(validateSemanticMember(response.items[0], inputs[0]!)).toEqual([]);
    expect(validateSemanticMember(response.items[1], inputs[1]!)).toEqual([]);
    expect(validateSemanticMember({ ...response.items[0], investigativeObservationId: inputs[1]!.itemId }, inputs[0]!))
      .toContain("semantic_member_identity_mismatch");
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, structuredOutputValidation: "passed", retryCount: 0 });
  });

  it("fails semantic request lineage and unused output slots closed", async () => {
    const cap = await capability(); const invalidAudit = new ProviderOperationAuditLog(); const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as never;
    const input = semanticInput("one", "application_fee_terminology");
    await expect(createLiveOpenAiSemanticAdapter(cap, invalidAudit).verify(semanticRequest([{ ...input, documentId: "cross-document" }])))
      .rejects.toThrow("semantic_request_identity_invalid");
    expect(fetchSpy).not.toHaveBeenCalled();

    const cap2 = await capability(); const slotAudit = new ProviderOperationAuditLog();
    globalThis.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ id: "resp-unused-slot", model: "approved-test-model",
      output_text: JSON.stringify({ judgments: {
        slot0: { sourceEffectiveFrom: null, sourceEffectiveTo: null, verificationStatus: "unsupported", limitationCodes: [] },
        slot1: { sourceEffectiveFrom: null, sourceEffectiveTo: null, verificationStatus: "supported_candidate", limitationCodes: [] },
        slot2: null, slot3: null,
      } }), usage: { output_tokens: 20 } }) } as Response));
    await expect(createLiveOpenAiSemanticAdapter(cap2, slotAudit).verify(semanticRequest([input])))
      .rejects.toThrow("semantic_judgment_unused_slot_invalid");
    expect(slotAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, structuredOutputValidation: "failed", retryCount: 0 });
  });

  it("retains only allowlisted OpenAI non-2xx diagnostics after exactly one possibly billable send", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); let sends = 0;
    globalThis.fetch = vi.fn(async () => { sends += 1; return { status: 400,
      headers: new Headers({ "x-request-id": "req-safe-openai-400" }),
      json: async () => ({ error: { type: "invalid_request_error", code: "unsupported_value", param: "reasoning.effort",
        message: "unsafe raw message with request details", internal_debug: "must not persist" } }) } as Response; });
    await expect(createLiveOpenAiInvestigativeAdapter(cap, audit).investigate({ batchId: "batch-http-failure", attemptId: "attempt-http-failure",
      schemaVersion: "investigative_observation_v1", expectedItemIds: [], reservationId: "operation-http-failure:call",
      maximumOutputTokens: 1_200, logicalAttempt: 1, items: [], untrustedContentPolicy: "data_only_no_instructions" }))
      .rejects.toThrow("openai_responses_http_failure");
    expect(sends).toBe(1);
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, retryCount: 0, completionState: "failed",
      usageState: "unknown_possible_billable", httpStatus: 400, providerRequestId: "req-safe-openai-400",
      requestedModelIdentifier: "approved-test-model", providerErrorType: "invalid_request_error",
      providerErrorCode: "unsupported_value", providerErrorParam: "reasoning.effort", structuredOutputValidation: "not_reached" });
    expect(JSON.stringify(audit.snapshot())).not.toMatch(/unsafe raw message|internal_debug/);
  });

  it("runs the synthetic provider-readiness boundary in exactly three sequential sends with no Statement data", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); const outboundBodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      const bodyText = String(init?.body); outboundBodies.push(bodyText); const call = outboundBodies.length;
      if (call === 1) return { status: 200, headers: new Headers({ "x-request-id": "readiness-or-001" }), json: async () =>
        openRouterResponse([{ url: "https://platform.openai.com/docs/api-reference/responses", title: "Responses API" }]) } as Response;
      const body = JSON.parse(bodyText); const request = JSON.parse(body.input[1].content[0].text);
      if (call === 2) {
        const item = request.items[0]; const locator = item.locators[0];
        return { status: 200, headers: new Headers({ "x-request-id": "readiness-oa-investigative-001" }), json: async () => ({
          id: "resp-readiness-investigative", model: "approved-test-model", usage: { output_tokens: 91 },
          output_text: JSON.stringify({ batchId: request.batchId, attemptId: request.attemptId, schemaVersion: request.schemaVersion,
            items: [{ itemId: item.itemId, questionId: item.questionId, candidateId: item.candidateId, documentId: item.documentId,
              locatorId: locator.locatorId, documentFingerprint: item.documentFingerprint, interpretationCode: "bounded_public_term_definition",
              proposedValue: { kind: "term", termCode: "application_fee_terminology", termValue: "scope_limited" },
              sourceAuthorityCandidate: "processor_publication", effectiveFromCandidate: null, effectiveToCandidate: null,
              limitationCodes: ["synthetic_readiness_only", "not_production_evidence"], financialMutationAllowed: false }] }),
        }) } as Response;
      }
      return { status: 200, headers: new Headers({ "x-request-id": "readiness-oa-semantic-001" }), json: async () => ({
        id: "resp-readiness-semantic", model: "approved-test-model", usage: { output_tokens: 88 },
        output_text: JSON.stringify({ judgments: { slot0: { sourceEffectiveFrom: null, sourceEffectiveTo: null,
          verificationStatus: "supported_candidate", limitationCodes: ["synthetic_readiness_only", "not_production_evidence"] },
          slot1: null, slot2: null, slot3: null } }),
      }) } as Response;
    });
    const result = await runProviderReadinessProbe("provider-readiness-test", cap, audit);
    expect(outboundBodies).toHaveLength(3);
    expect(result).toMatchObject({ statementAnalysisExecuted: false, privateStatementDataProviderBound: false,
      openRouter: { status: "passed", toolExecutionState: "verified" },
      investigativeOpenAi: { status: "passed", structuredOutputValidation: "passed" },
      semanticOpenAi: { status: "passed", structuredOutputValidation: "passed" },
      diagnostics: { semanticMemberValidationState: "passed", semanticMemberIssues: [], semanticMismatchDimensions: [],
        semanticSupportValidationState: "passed", semanticSupportStatus: "wrong_authority",
        semanticSupportReasonCodes: expect.arrayContaining(["semantic_source_authority_mismatch"]) } });
    expect(result.receipts.map((receipt) => [receipt.operation, receipt.actualSendCount, receipt.retryCount])).toEqual([
      ["search", 1, 0], ["investigative_model", 1, 0], ["semantic_model", 1, 0],
    ]);
    expect(outboundBodies.join("\n")).not.toMatch(/SAMPLE_MERCHANT|fsv-03-clover|merchant-private|account-private|statement-one-live-internal-evaluation/);
  });

  it("rejects non-judgment semantic fields before local binding without retaining provider prose", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); const diagnostics = new ProviderReadinessDiagnosticLog(); let call = 0;
    globalThis.fetch = vi.fn(async (_url, init) => {
      call += 1;
      if (call === 1) return { status: 200, headers: new Headers({ "x-request-id": "readiness-or-diagnostic" }), json: async () =>
        openRouterResponse([{ url: "https://platform.openai.com/docs/api-reference/responses", title: "Responses API" }]) } as Response;
      const body = JSON.parse(String(init?.body)); const request = JSON.parse(body.input[1].content[0].text);
      if (call === 2) {
        const item = request.items[0]; const locator = item.locators[0];
        return { status: 200, headers: new Headers({ "x-request-id": "readiness-investigative-diagnostic" }), json: async () => ({
          id: "resp-readiness-investigative-diagnostic", model: "approved-test-model", usage: { output_tokens: 91 },
          output_text: JSON.stringify({ batchId: request.batchId, attemptId: request.attemptId, schemaVersion: request.schemaVersion,
            items: [{ itemId: item.itemId, questionId: item.questionId, candidateId: item.candidateId, documentId: item.documentId,
              locatorId: locator.locatorId, documentFingerprint: item.documentFingerprint, interpretationCode: "bounded_public_term_definition",
              proposedValue: { kind: "term", termCode: "application_fee_terminology", termValue: "scope_limited" },
              sourceAuthorityCandidate: "processor_publication", effectiveFromCandidate: null, effectiveToCandidate: null,
              limitationCodes: ["synthetic_readiness_only"], financialMutationAllowed: false }] }),
        }) } as Response;
      }
      return { status: 200, headers: new Headers({ "x-request-id": "readiness-semantic-diagnostic" }), json: async () => ({
        id: "resp-readiness-semantic-diagnostic", model: "approved-test-model", usage: { output_tokens: 88 },
        unsafe_provider_prose: "must never be retained",
        output_text: JSON.stringify({ judgments: { slot0: { sourceEffectiveFrom: null, sourceEffectiveTo: null,
          verificationStatus: "wrong_authority", limitationCodes: ["synthetic_readiness_only"],
          investigativeObservationId: "model-authored-identity-is-forbidden" }, slot1: null, slot2: null, slot3: null } }),
      }) } as Response;
    });
    await expect(runProviderReadinessProbe("provider-readiness-diagnostic", cap, audit, diagnostics))
      .rejects.toThrow("semantic_judgment_shape_invalid");
    expect(call).toBe(3);
    expect(diagnostics.snapshot()).toMatchObject({ semanticMemberValidationState: "not_reached",
      semanticMemberIssues: [], semanticMismatchDimensions: [], semanticSupportValidationState: "not_reached",
      semanticSupportStatus: null, semanticSupportReasonCodes: [] });
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain("must never be retained");
    expect(audit.snapshot().at(-1)).toMatchObject({ operation: "semantic_model", actualSendCount: 1,
      completionState: "failed", structuredOutputValidation: "failed", retryCount: 0 });
  });

  it("stops provider readiness after the first failed operation without retry or later sends", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); let sends = 0;
    globalThis.fetch = vi.fn(async () => { sends += 1; return { status: 502, headers: new Headers({ "x-request-id": "readiness-or-failed" }),
      json: async () => ({ error: { type: "upstream_error", code: "bad_gateway", message: "discard this" } }) } as Response; });
    await expect(runProviderReadinessProbe("provider-readiness-failed", cap, audit)).rejects.toThrow("openrouter_search_http_failure");
    expect(sends).toBe(1);
    expect(audit.snapshot()).toEqual([expect.objectContaining({ operation: "search", actualSendCount: 1, retryCount: 0,
      completionState: "failed", httpStatus: 502, providerErrorType: "upstream_error", providerErrorCode: "bad_gateway" })]);
    expect(JSON.stringify(audit.snapshot())).not.toContain("discard this");
  });

  it("rejects nested, percent-encoded, and base64 private payloads before send", async () => {
    const cap = await capability(); const audit = new ProviderOperationAuditLog(); const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as never;
    await expect(createLiveOpenRouterSearchAdapter(cap, audit).search({ ...searchRequest,
      queryText: encodeURIComponent("merchant id MID 123456789") })).rejects.toThrow("provider_private_payload_blocked");
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
    await vi.advanceTimersByTimeAsync(40_001);
    await rejected; expect(calls).toBe(1);
    expect(audit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "timed_out", usageState: "unknown_possible_billable", retryCount: 0 });
  });

  it("propagates the live transport timeout as a runtime timeout without retry", async () => {
    vi.useFakeTimers(); const cap = await capability(); const audit = new ProviderOperationAuditLog(); let calls = 0;
    globalThis.fetch = vi.fn(async (_url, init) => { calls += 1; return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }); });
    const ports = createInternalLiveIntelligencePorts(cap, audit);
    const pending = ports.clock.runWithTimeout(40_000, () => ports.search!.search(searchRequest));
    await vi.advanceTimersByTimeAsync(40_001);
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
    let redirectSends = 0; let redirectOptions: any = null;
    const redirectSpy = vi.spyOn(https, "request").mockImplementation(((options: any, callback: any) => {
      redirectOptions = options;
      const req = new EventEmitter() as any; req.setTimeout = () => req; req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
      req.end = () => { redirectSends += 1; const response = new EventEmitter() as any; response.statusCode = 302;
        response.headers = { location: "https://other.example.test/redirect" }; response.socket = { remoteAddress: "93.184.216.34" }; response.destroy = () => undefined; callback(response); };
      void options; return req;
    }) as never);
    const redirect = await createNodeHttpsRetrievalPort(redirectCap, { audit: redirectAudit }).retrieve(request(new AbortController().signal));
    expect(redirect).toMatchObject({ status: "safety_blocked", redirects: [], content: null }); expect(redirectSends).toBe(1);
    expect(redirectOptions).toMatchObject({ hostname: "docs.example.test", family: 4 });
    expect(redirectAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed", safeReasonCode: "retrieval_redirect_not_followed", retryCount: 0 });
    redirectSpy.mockRestore();

    const timeoutAudit = new ProviderOperationAuditLog(); const timeoutCap = await capability(); let timeoutSends = 0;
    const timeoutSpy = vi.spyOn(https, "request").mockImplementation(((_options: any, _callback: any) => {
      const socket = new EventEmitter() as any; socket.remoteAddress = "93.184.216.34";
      const req = new EventEmitter() as any; let timeout: () => void = () => undefined; req.setTimeout = (_ms: number, value: () => void) => { timeout = value; return req; };
      req.destroy = (error?: Error) => { if (error) req.emit("error", error); }; req.end = () => {
        timeoutSends += 1; req.emit("socket", socket); socket.emit("connect"); socket.emit("secureConnect"); timeout();
      }; return req;
    }) as never);
    await expect(createNodeHttpsRetrievalPort(timeoutCap, { audit: timeoutAudit }).retrieve(request(new AbortController().signal))).rejects.toThrow("retrieval_timeout");
    expect(timeoutSends).toBe(1); expect(timeoutAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "timed_out", usageState: "unknown_possible_billable", retryCount: 0 });
    expect(timeoutAudit.snapshot()[0]!.retrievalTransportDiagnostics).toMatchObject({
      schemaVersion: "public_https_retrieval_transport_diagnostics_v1",
      configurationCode: "ratereveal_node_https_pinned_v4",
      resolution: { state: "permit_bound", resolutionElapsedMs: null, approvedAddressCount: 1,
        selectedAddressFamily: 4, selectionPolicy: "first_lexicographically_sorted_approved_address" },
      milestones: { socketAssignedMs: expect.any(Number), tcpConnectedMs: expect.any(Number),
        tlsEstablishedMs: expect.any(Number), requestSentMs: expect.any(Number), responseHeadersMs: null,
        firstBodyByteMs: null, bodyCompletedMs: null },
      response: { connectedAddressFamily: 4, httpStatus: null, redirectObserved: false,
        responseHeadersObserved: false, firstBodyByteObserved: false, bytesObserved: 0, bodyCompleted: false },
      termination: { outcome: "timed_out", phase: "response_headers", safeReasonClass: "retrieval_timeout",
        socketInactivityTimeoutMs: 12_000, totalAttemptTimeoutMs: 45_000 },
    });
    timeoutSpy.mockRestore();

    const cancelAudit = new ProviderOperationAuditLog(); const cancelCap = await capability(); const cancellation = new AbortController(); let cancelSends = 0;
    vi.spyOn(https, "request").mockImplementation(((options: any, _callback: any) => {
      const req = new EventEmitter() as any; req.setTimeout = () => req; req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
      options.signal.addEventListener("abort", () => req.emit("error", new Error("retrieval_cancelled")), { once: true }); req.end = () => { cancelSends += 1; }; return req;
    }) as never);
    const pending = createNodeHttpsRetrievalPort(cancelCap, { audit: cancelAudit }).retrieve(request(cancellation.signal)); const rejected = expect(pending).rejects.toThrow("retrieval_cancelled");
    cancellation.abort(); await rejected; expect(cancelSends).toBe(1);
    expect(cancelAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "cancelled", usageState: "unknown_possible_billable", retryCount: 0 });

    vi.restoreAllMocks();
    const pinAudit = new ProviderOperationAuditLog(); const pinCap = await capability();
    vi.spyOn(https, "request").mockImplementation(((_options: any, _callback: any) => {
      const req = new EventEmitter() as any; req.setTimeout = () => req; req.destroy = () => undefined;
      req.end = () => { const error = new TypeError("Invalid IP address") as NodeJS.ErrnoException; error.code = "ERR_INVALID_IP_ADDRESS"; req.emit("error", error); };
      return req;
    }) as never);
    await expect(createNodeHttpsRetrievalPort(pinCap, { audit: pinAudit }).retrieve(request(new AbortController().signal))).rejects.toThrow("Invalid IP address");
    expect(pinAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "failed",
      providerConfigurationCode: "ratereveal_node_https_pinned_v4", safeReasonCode: "retrieval_destination_pin_invalid" });

    for (const [code, safeReasonCode] of [["ECONNRESET", "retrieval_network_connect_failed"],
      ["ERR_TLS_CERT_ALTNAME_INVALID", "retrieval_tls_validation_failed"]] as const) {
      vi.restoreAllMocks(); const categoryAudit = new ProviderOperationAuditLog(); const categoryCap = await capability();
      vi.spyOn(https, "request").mockImplementation(((_options: any, _callback: any) => {
        const req = new EventEmitter() as any; req.setTimeout = () => req; req.destroy = () => undefined;
        req.end = () => { const error = new Error("unsafe raw transport detail") as NodeJS.ErrnoException; error.code = code; req.emit("error", error); };
        return req;
      }) as never);
      await expect(createNodeHttpsRetrievalPort(categoryCap, { audit: categoryAudit }).retrieve(request(new AbortController().signal))).rejects.toThrow();
      expect(categoryAudit.snapshot()[0]).toMatchObject({ completionState: "failed", safeReasonCode });
    }
  });

  it("distinguishes response-body progress and completed retrieval phases without changing send counts", async () => {
    const permit = createDestinationPermit({ candidateId: "candidate-phases", rawUrl: "https://docs.example.test/phases",
      resolvedAddresses: ["93.184.216.34"], permitId: "permit-phases", nowMs: 0, ttlMs: 60_000 });
    const request = () => ({ reservationId: "retrieval-phases:document", questionId: "question-phases",
      candidateId: "candidate-phases", documentId: "document-phases", permit, maximumBytes: 1_024,
      httpsOnly: true as const, logicalAttempt: 1 as const, signal: new AbortController().signal,
      recordReceivedBytes: () => "continue" as const, authorizeRedirect: async () => permit });

    const bodyTimeoutAudit = new ProviderOperationAuditLog(); const bodyTimeoutCap = await capability();
    vi.spyOn(https, "request").mockImplementation(((_options: any, callback: any) => {
      const socket = new EventEmitter() as any; socket.remoteAddress = "93.184.216.34";
      const req = new EventEmitter() as any; let timeout: () => void = () => undefined;
      req.setTimeout = (_ms: number, value: () => void) => { timeout = value; return req; };
      req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
      req.end = () => {
        req.emit("socket", socket); socket.emit("connect"); socket.emit("secureConnect");
        const response = new EventEmitter() as any; response.statusCode = 200;
        response.headers = { "content-type": "text/plain" }; response.socket = socket; response.destroy = () => undefined;
        callback(response); response.emit("data", Buffer.from("partial")); timeout();
      };
      return req;
    }) as never);
    await expect(createNodeHttpsRetrievalPort(bodyTimeoutCap, { audit: bodyTimeoutAudit }).retrieve(request()))
      .rejects.toThrow("retrieval_timeout");
    expect(bodyTimeoutAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "timed_out",
      retryCount: 0, retrievalTransportDiagnostics: {
        response: { httpStatus: 200, responseHeadersObserved: true, firstBodyByteObserved: true,
          bytesObserved: 7, bodyCompleted: false },
        termination: { outcome: "timed_out", phase: "response_body", safeReasonClass: "retrieval_timeout" },
      } });

    vi.restoreAllMocks();
    const completedAudit = new ProviderOperationAuditLog(); const completedCap = await capability();
    vi.spyOn(https, "request").mockImplementation(((_options: any, callback: any) => {
      const socket = new EventEmitter() as any; socket.remoteAddress = "93.184.216.34";
      const req = new EventEmitter() as any; req.setTimeout = () => req;
      req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
      req.end = () => {
        req.emit("socket", socket); socket.emit("connect"); socket.emit("secureConnect");
        const response = new EventEmitter() as any; response.statusCode = 200;
        response.headers = { "content-type": "text/plain" }; response.socket = socket; response.destroy = () => undefined;
        callback(response); response.emit("data", Buffer.from("complete")); response.emit("end");
      };
      return req;
    }) as never);
    const completed = await createNodeHttpsRetrievalPort(completedCap, { audit: completedAudit }).retrieve(request());
    expect(completed).toMatchObject({ status: "retrieved", byteLength: 8, streamedByteLength: 8 });
    expect(completedAudit.snapshot()[0]).toMatchObject({ actualSendCount: 1, completionState: "completed",
      retryCount: 0, providerConfigurationCode: "ratereveal_node_https_pinned_v4",
      retrievalTransportDiagnostics: {
        response: { httpStatus: 200, responseHeadersObserved: true, firstBodyByteObserved: true,
          bytesObserved: 8, bodyCompleted: true },
        termination: { outcome: "completed", phase: "completed", safeReasonClass: "retrieval_completed" },
      } });
  });

  it("rotates only across approved addresses on a distinct logical attempt and settles deterministic HTTP failures", async () => {
    const permit = createDestinationPermit({ candidateId: "candidate-recovery",
      rawUrl: "https://docs.example.test/recovery", resolvedAddresses: ["93.184.216.34", "93.184.216.35"],
      permitId: "permit-recovery", nowMs: 0, ttlMs: 60_000 });
    for (const statusCode of [401, 403, 404, 410, 429, 503]) {
      const audit = new ProviderOperationAuditLog(); const cap = await capability(); let optionsSeen: any = null;
      vi.spyOn(https, "request").mockImplementation(((options: any, callback: any) => {
        optionsSeen = options;
        const socket = new EventEmitter() as any; socket.remoteAddress = "93.184.216.35";
        const req = new EventEmitter() as any; req.setTimeout = () => req;
        req.destroy = (error?: Error) => { if (error) req.emit("error", error); };
        req.end = () => {
          req.emit("socket", socket); socket.emit("connect"); socket.emit("secureConnect");
          const response = new EventEmitter() as any; response.statusCode = statusCode;
          response.headers = { "content-type": "text/plain" }; response.socket = socket;
          response.destroy = () => undefined; callback(response); response.emit("data", Buffer.from("settled"));
          response.emit("end");
        };
        return req;
      }) as never);
      const response = await createNodeHttpsRetrievalPort(cap, { audit }).retrieve({
        reservationId: `retrieval-status-${statusCode}:document`, questionId: "question-recovery",
        candidateId: "candidate-recovery", documentId: "document-recovery", permit, maximumBytes: 1_024,
        httpsOnly: true, logicalAttempt: 2, signal: new AbortController().signal,
        recordReceivedBytes: () => "continue", authorizeRedirect: async () => permit,
      });
      expect(response).toMatchObject({ status: "inaccessible", connectedAddress: "93.184.216.35" });
      expect(optionsSeen).toMatchObject({ method: "GET", hostname: "docs.example.test", family: 4,
        headers: expect.not.objectContaining({ Authorization: expect.anything(), Cookie: expect.anything() }) });
      let selectedAddress = "";
      optionsSeen.lookup("docs.example.test", {}, (_error: unknown, address: string) => { selectedAddress = address; });
      expect(selectedAddress).toBe("93.184.216.35");
      expect(audit.snapshot()[0]).toMatchObject({ logicalAttempt: 2, actualSendCount: 1, retryCount: 1,
        completionState: "completed", httpStatus: statusCode,
        retrievalTransportDiagnostics: { configurationCode: "ratereveal_node_https_pinned_v4",
          resolution: { selectionPolicy: "logical_attempt_rotated_approved_address" },
          termination: { outcome: "completed", phase: "completed" } } });
      vi.restoreAllMocks();
    }
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

function openRouterResponse(citations: Array<{ url: string; title: string; content?: string }>, overrides: Record<string, unknown> = {}) {
  return { id: "chatcmpl-openrouter-test", model: "openai/gpt-5.2", choices: [{ index: 0, message: { role: "assistant",
    content: "Provider-generated discovery summary; never treated as evidence or transport identity.",
    annotations: citations.map((url_citation) => ({ type: "url_citation", url_citation })) } }],
    usage: { prompt_tokens: 50, completion_tokens: 12, total_tokens: 62, cost: 0.0123, server_tool_use: { web_search_requests: 1 } }, ...overrides };
}

function citation(url: string, title: string) { return { type: "url_citation", url_citation: { url, title, content: "provider snippet must be discarded" } }; }

function semanticInput(suffix: "one" | "two", subjectCode: "application_fee_terminology" | "non_swiped_discount_terminology"): SemanticVerificationInput {
  const fingerprint = (suffix === "one" ? "a" : "b").repeat(64);
  return {
    itemId: `observation-${suffix}`,
    question: { questionId: `question-${suffix}`, claimType: "processor_term", subjectCode, asOf: "2024-06-30",
      scope: { processor: "fiserv_first_data", processorProgram: null, network: null, region: "us", jurisdiction: "us" },
      requiredSourceAuthorities: ["processor_publication"], requiredEvidenceClasses: ["official_processor_terminology"],
      possibleAnswerCodes: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"], limitations: [] },
    candidate: { candidateId: `candidate-${suffix}`, questionId: `question-${suffix}`, attemptId: `attempt-${suffix}`,
      title: `Public terminology ${suffix}`, claimedAuthority: "processor_publication", sourceTypeCode: "official_processor_terminology",
      rank: suffix === "one" ? 1 : 2, publicationDate: null, effectiveFrom: null, effectiveTo: null, locatorHint: null,
      selectionReasonCode: "provider_neutral_public_discovery", discoveryMetadata: { providerCode: "test", configurationCode: "test_v1",
        sourceDomain: "docs.example.test", providerRank: suffix === "one" ? 1 : 2, providerSnippetUsedAsEvidence: false },
      retrievalEligibility: "eligible", authorityAdmissionRef: "live-test-admission", authorityPublicationFamilyCode: "official_processor_terminology" },
    documentId: `document-${suffix}`,
    locator: { locatorId: `locator-${suffix}`, documentId: `document-${suffix}`, documentFingerprint: fingerprint,
      page: 1, sectionCode: "public_glossary", lineStart: 1, lineEnd: 1, text: `Synthetic public evidence ${suffix}.` },
    proposedValue: { kind: "term", termCode: subjectCode, termValue: "scope_limited" },
  };
}

function semanticRequest(items: SemanticVerificationInput[]) {
  return { batchId: "semantic-binding-batch", attemptId: "semantic-binding-attempt", schemaVersion: "semantic_verification_v1",
    expectedItemIds: items.map((item) => item.itemId), reservationId: `semantic-binding-${items.length}:call`, maximumOutputTokens: 1_200,
    logicalAttempt: 1 as const, items, untrustedContentPolicy: "data_only_no_instructions" as const };
}

function inspectStrictSchemaSubset(value: unknown, path: string, issues: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const schema = value as Record<string, unknown>;
  if (("const" in schema || "enum" in schema) && typeof schema.type !== "string") issues.push(`${path}:literal_type_missing`);
  if (schema.type === "object") {
    const properties = schema.properties as Record<string, unknown> | undefined;
    if (schema.additionalProperties !== false) issues.push(`${path}:additional_properties_not_closed`);
    if (!properties || !Array.isArray(schema.required)
      || [...schema.required].sort().join("|") !== Object.keys(properties).sort().join("|")) issues.push(`${path}:required_fields_incomplete`);
  }
  for (const [key, child] of Object.entries(schema)) {
    if (Array.isArray(child)) child.forEach((item, index) => inspectStrictSchemaSubset(item, `${path}.${key}[${index}]`, issues));
    else inspectStrictSchemaSubset(child, `${path}.${key}`, issues);
  }
}

function restore(name: string, value: string | undefined): void { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
