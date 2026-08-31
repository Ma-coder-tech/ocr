import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertApprovedAiOutboundPacketSafe,
  inspectApprovedAiOutboundPacket,
} from "../../../../src/canonical/v2/intelligence/providerPrivacy.js";
import { canonicalJson } from "../../../../src/canonical/v2/canonicalJson.js";

const environmentNames = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "OPENROUTER_SEARCH_MODEL",
  "OPENAI_INTERNAL_ANALYSIS_MODEL"] as const;
const originalEnvironment = Object.fromEntries(environmentNames.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.FEECLEAR_DB_PATH = ":memory:";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.FEECLEAR_DB_PATH;
  for (const name of environmentNames) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  vi.restoreAllMocks();
});

describe("production approved-AI packet admission", () => {
  it("bridges mixed search citations as a completed partial admission without retaining rejected URLs", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    const unsafeUrl = "https://user:password@malicious.example.test/private";
    globalThis.fetch = vi.fn(async () => ({ status: 200, headers: new Headers({ "x-request-id": "or-partial-001" }),
      json: async () => ({ id: "openrouter-partial-001", model: "openai/gpt-5.2",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "",
          annotations: [
            { type: "url_citation", url_citation: { url: "https://docs.example.test/official", title: "Official document" } },
            { type: "url_citation", url_citation: { url: unsafeUrl, title: "Unsafe result" } },
          ] } }],
        usage: { completion_tokens: 17, cost: 0.004, server_tool_use: { web_search_requests: 1 } },
        openrouter_metadata: { attempts: [{ provider: "openai" }] } }),
    } as Response));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("partial-search-admission-run");
    let sends = 0;
    const result = await ports.search(searchPortInput("partial-search-admission-run"), () => { sends += 1; });

    expect(sends).toBe(1);
    expect(result.value).toEqual([expect.objectContaining({ url: "https://docs.example.test/official" })]);
    expect(result.receipt).toMatchObject({ calls: 1, tokens: 17, providerRequestId: "or-partial-001",
      providerDiagnostics: { responseDisposition: "completed", httpStatus: 200, usageState: "known",
        providerRequestCount: 1, usageCostUsd: 0.004, searchOutputAdmission: {
          outcome: "partially_admitted", annotationCount: 2, admittedCitationCount: 1,
          rejectedCitationCount: 1, reasonCodes: ["openrouter_search_result_url_invalid"],
          evidenceAdmissionEffect: "none", analyticalCompletionEffect: "none",
        } } });
    expect(JSON.stringify(result)).not.toContain(unsafeUrl);
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("bridges a fully received structurally unusable search response as settled local rejection", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    globalThis.fetch = vi.fn(async () => ({ status: 200, headers: new Headers({ "x-request-id": "or-rejected-001" }),
      json: async () => ({ id: "openrouter-rejected-001", model: "openai/gpt-5.2", choices: [],
        usage: { completion_tokens: 11, cost: 0.003, server_tool_use: { web_search_requests: 1 } } }),
    } as Response));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("rejected-search-admission-run");
    let sends = 0;

    try {
      await ports.search(searchPortInput("rejected-search-admission-run"), () => { sends += 1; });
      throw new Error("expected settled search admission rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceCompletedUnusableError);
      const unusable = error as InstanceType<typeof execution.RgEvidenceCompletedUnusableError>;
      expect(unusable.message).toBe("openrouter_search_response_malformed");
      expect(unusable.receipt).toMatchObject({ calls: 1, tokens: 11, providerRequestId: "or-rejected-001",
        providerDiagnostics: { responseDisposition: "completed", httpStatus: 200, usageState: "known",
          providerRequestCount: 1, usageCostUsd: 0.003, searchOutputAdmission: {
            outcome: "batch_rejected", admittedCitationCount: 0,
            reasonCodes: ["openrouter_search_response_malformed"],
            evidenceAdmissionEffect: "none", analyticalCompletionEffect: "none",
          } } });
      expect(error).not.toBeInstanceOf(execution.RgEvidenceTransportError);
    }
    expect(sends).toBe(1);
  });

  it("admits ordinary public-document credential terminology without treating words as secrets", () => {
    const body = JSON.stringify({ input: [{ content: [{ type: "input_text", text: JSON.stringify({
      textExcerpt: "Password authorization and token requirements are public product documentation.",
      sectionCode: "authorization_processing",
    }) }] }], store: false });
    const packet = { provider: "openai_responses_api" as const, url: "https://api.openai.com/v1/responses",
      method: "POST" as const, headerNames: ["Authorization", "Content-Type"], body };

    expect(inspectApprovedAiOutboundPacket(packet)).toEqual({ valid: true, reasonCodes: [] });
    expect(() => assertApprovedAiOutboundPacketSafe(packet)).not.toThrow();
  });

  it("fully inspects legitimate AnalysisRun-shaped packets beyond the former recursion depth", () => {
    let safeValue: unknown = {
      textExcerpt: "Password authorization and token requirements are ordinary public documentation.",
    };
    for (let index = 0; index < 96; index += 1) safeValue = { [`canonicalLayer${index}`]: safeValue };
    const safePacket = approvedAiPacket(safeValue);

    expect(inspectApprovedAiOutboundPacket(safePacket)).toEqual({ valid: true, reasonCodes: [] });
    expect(() => assertApprovedAiOutboundPacketSafe(safePacket)).not.toThrow();

    const secret = `sk-or-v1-${"d".repeat(32)}`;
    let unsafeValue: unknown = { externalValue: secret };
    for (let index = 0; index < 96; index += 1) unsafeValue = { [`canonicalLayer${index}`]: unsafeValue };
    const unsafeInspection = inspectApprovedAiOutboundPacket(approvedAiPacket(unsafeValue));
    expect(unsafeInspection).toEqual({ valid: false,
      reasonCodes: ["approved_ai_packet_api_key_material_forbidden"] });
  });

  it("fails safely on pathological structural fan-out within the packet byte ceiling", () => {
    const packet = approvedAiPacket({ pathological: Array.from({ length: 300_001 }, () => 0) });
    expect(Buffer.byteLength(packet.body!, "utf8")).toBeLessThan(2_500_000);
    expect(inspectApprovedAiOutboundPacket(packet)).toEqual({ valid: false,
      reasonCodes: ["approved_ai_packet_structure_complexity_invalid"] });
    expect(() => assertApprovedAiOutboundPacketSafe(packet))
      .toThrow("approved_ai_payload_blocked:approved_ai_packet_structure_complexity_invalid");
  });

  it("blocks actual credential material with safe type-specific diagnostics", () => {
    const cases = [
      { value: { textExcerpt: `OPENROUTER_API_KEY=sk-or-v1-${"a".repeat(32)}` },
        reason: "approved_ai_packet_api_key_material_forbidden" },
      { value: { authorization: `Bearer ${"b".repeat(32)}` },
        reason: "approved_ai_packet_authorization_material_forbidden" },
      { value: { password: "hunter2" }, reason: "approved_ai_packet_password_material_forbidden" },
      { value: { accessToken: "private-access-token-value" }, reason: "approved_ai_packet_token_material_forbidden" },
      { value: { textExcerpt: "-----BEGIN PRIVATE KEY-----" },
        reason: "approved_ai_packet_private_key_material_forbidden" },
      { value: { encodedValue: Buffer.from(`Bearer ${"c".repeat(32)}`).toString("base64") },
        reason: "approved_ai_packet_authorization_material_forbidden" },
    ];

    for (const item of cases) {
      const secret = JSON.stringify(item.value);
      const packet = { provider: "openai_responses_api" as const, url: "https://api.openai.com/v1/responses",
        method: "POST" as const, headerNames: ["Authorization", "Content-Type"],
        body: JSON.stringify({ input: [{ content: [{ type: "input_text", text: secret }] }] }) };
      const inspected = inspectApprovedAiOutboundPacket(packet);
      expect(inspected.valid).toBe(false);
      expect(inspected.reasonCodes).toContain(item.reason);
      try {
        assertApprovedAiOutboundPacketSafe(packet);
        throw new Error("expected approved AI packet rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain(item.reason);
        expect((error as Error).message).not.toContain(secret);
      }
    }
  });

  it("preserves exact safe pre-send rejection diagnostics without sending or retaining the secret", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("approved-ai-privacy-test-run");
    const secret = `sk-or-v1-${"z".repeat(32)}`;
    const binding = approvedClaimBinding({ externalText: secret });
    let sends = 0;

    try {
      await ports.investigate({ ...binding, candidate: {}, document: {} } as never, () => { sends += 1; });
      throw new Error("expected approved AI packet rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceTransportError);
      const transport = error as InstanceType<typeof execution.RgEvidenceTransportError>;
      expect(transport).toMatchObject({ transportState: "before_send", receipt: {
        providerCode: "openai_responses_api", providerRequestId: null, calls: 0, tokens: 0,
        retrievalBytes: 0, providerDiagnostics: null,
      } });
      expect(transport.message).toBe("approved_ai_payload_blocked:approved_ai_packet_api_key_material_forbidden");
      expect(JSON.stringify({ message: transport.message, receipt: transport.receipt })).not.toContain(secret);
    }
    expect(sends).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("allows approved investigation transmission when retrieved public text uses ordinary terminology", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    const sentBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sentBodies.push(body);
      expect(body.store).toBe(false);
      const schemaName = ((body.text as { format?: { name?: string } })?.format?.name);
      const output = schemaName === "rg_claim_verification_v1_1"
        ? { verification: { accepted: true } } : { investigation: { accepted: true } };
      return new Response(JSON.stringify({ id: `resp-approved-ai-${schemaName}`, model: "gpt-5.2",
        output_text: JSON.stringify(output), usage: { output_tokens: 3 } }), {
        status: 200, headers: { "Content-Type": "application/json", "x-request-id": "request-approved-ai-words" },
      });
    });
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("approved-ai-public-words-run");
    const binding = approvedClaimBinding({
      publicExplanation: "Authorization processing can include a tokenized credential category.",
    }, "approved-ai-public-words-run");
    let sends = 0;
    const result = await ports.investigate({
      ...binding, candidate: {},
      document: { locators: [{ textExcerpt: "Password, authorization, and token policies are public terms." }] },
    } as never, () => { sends += 1; });
    const verification = await ports.verify({ ...binding, candidate: {},
      document: { locators: [{ textExcerpt: "Password, authorization, and token policies are public terms." }] },
      frozenCandidate: { frozenCandidateHash: "a".repeat(64) },
    } as never, () => { sends += 1; });

    expect(sends).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.value).toEqual({ accepted: true });
    expect(verification.value).toEqual({ accepted: true });
    expect(result.receipt).toMatchObject({ providerCode: "openai_responses_api_investigation",
      providerRequestId: "request-approved-ai-words", calls: 1, tokens: 3, retrievalBytes: 0 });
    for (const body of sentBodies) {
      expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeLessThan(300_000);
      const inputItems = body.input as Array<{ content: Array<{ text: string }> }>;
      const userInput = JSON.parse(String(inputItems[1]!.content[0]!.text)) as Record<string, unknown>;
      expect(userInput).toHaveProperty("exactClaimContext.schemaVersion", "canonical_rg_approved_ai_claim_context_v1");
      expect(userInput).not.toHaveProperty("currentRunContext");
    }
    const verificationBody = sentBodies.find((body) =>
      ((body.text as { format?: { name?: string } })?.format?.name) === "rg_claim_verification_v1_1")!;
    expect(verificationBody).toHaveProperty(
      "text.format.schema.properties.verification.required",
      expect.arrayContaining(["negativeApplicabilityProof"]),
    );
    expect(verificationBody).toHaveProperty(
      "text.format.schema.properties.verification.properties.negativeApplicabilityProof.anyOf.1.properties.schemaVersion.const",
      "canonical_rg_verification_negative_applicability_proof_v1",
    );
  });

  it("fails before send when lossless required evidence cannot fit the approved model context budget", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("approved-ai-context-budget-run");
    const binding = approvedClaimBinding({}, "approved-ai-context-budget-run");
    let sends = 0;

    try {
      await ports.investigate({ ...binding, candidate: {}, document: {
        locators: [{ textExcerpt: "x".repeat(320_000) }],
      } } as never, () => { sends += 1; });
      throw new Error("expected context budget rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceTransportError);
      expect(error).toMatchObject({ transportState: "before_send", message: "rg_approved_ai_packet_context_budget_exceeded",
        receipt: { providerCode: "openai_responses_api", providerRequestId: null, calls: 0, tokens: 0,
          retrievalBytes: 0, providerDiagnostics: null } });
    }
    expect(sends).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails before send when the compiled exact-claim context is changed after integrity binding", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("approved-ai-context-integrity-run");
    const binding = approvedClaimBinding({}, "approved-ai-context-integrity-run");
    binding.claimContext.canonicalLineage.sourceIdentity = { substitutedAfterCompilation: true };
    let sends = 0;

    try {
      await ports.investigate({ ...binding, candidate: {}, document: {} } as never, () => { sends += 1; });
      throw new Error("expected context integrity rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceTransportError);
      expect(error).toMatchObject({ transportState: "before_send", message: "rg_approved_ai_context_integrity_invalid",
        receipt: { providerRequestId: null, calls: 0, tokens: 0 } });
    }
    expect(sends).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("classifies a completed HTTPS response with unusable content as deterministic, not indeterminate", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    vi.resetModules();
    vi.doMock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js", () => ({
      createNodeDestinationResolutionPort: () => ({ resolve: async (candidateId: string, normalizedUrl: string) => ({
        candidateId, normalizedUrl, addresses: ["93.184.216.34"], permitId: "permit-completed-unusable",
      }) }),
      createNodeHttpsRetrievalPort: () => ({ retrieve: async (request: {
        questionId: string; candidateId: string; documentId: string; recordReceivedBytes(value: number): string;
      }) => {
        const content = new TextEncoder().encode("ordinary text returned with an HTML content type");
        request.recordReceivedBytes(content.byteLength);
        return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
          status: "retrieved", connectedAddress: "93.184.216.34", redirects: [], mimeType: "text/html",
          content, byteLength: content.byteLength, streamedByteLength: content.byteLength,
          safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true,
            destinationPermitEnforced: true } };
      } }),
    }));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("completed-unusable-live-adapter-run");
    let sends = 0;
    const candidate = { candidateId: "candidate-one", url: "https://www.fiserv.com/public-document",
      title: "Public document", claimedAuthority: "processor_publication" as const, publicationDate: null,
      effectiveFrom: null, effectiveTo: null };

    try {
      await ports.retrieve(qualifiedRetrievalInput(execution, "atomic-claim-one", candidate), () => { sends += 1; });
      throw new Error("expected deterministic unusable retrieval");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceCompletedUnusableError);
      const unusable = error as InstanceType<typeof execution.RgEvidenceCompletedUnusableError>;
      expect(unusable.message).toBe("retrieval_html_signature_mismatch");
      expect(unusable.receipt).toMatchObject({ providerCode: "node_https_pinned", providerRequestId: null,
        calls: 1, tokens: 0, retrievalBytes: expect.any(Number) });
      expect(unusable.receipt.retrievalBytes).toBeGreaterThan(0);
      expect(error).not.toBeInstanceOf(execution.RgEvidenceTransportError);
    } finally {
      vi.doUnmock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js");
    }
    expect(sends).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("propagates safe phase-aware HTTPS timeout diagnostics across the production RG port boundary", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    vi.resetModules();
    const { LiveOperationTransportError } = await import(
      "../../../../src/canonical/v2/intelligence/providerPreflight.js");
    const diagnostics = {
      schemaVersion: "public_https_retrieval_transport_diagnostics_v1" as const,
      configurationCode: "ratereveal_node_https_pinned_v3" as const,
      resolution: { state: "permit_bound" as const, resolutionElapsedMs: null, approvedAddressCount: 2,
        selectedAddressFamily: 4 as const, selectionPolicy: "first_lexicographically_sorted_approved_address" as const },
      milestones: { socketAssignedMs: 1, tcpConnectedMs: 2, tlsEstablishedMs: 3, requestSentMs: 0,
        responseHeadersMs: null, firstBodyByteMs: null, bodyCompletedMs: null },
      response: { connectedAddressFamily: 4 as const, httpStatus: null, redirectObserved: false,
        responseHeadersObserved: false, firstBodyByteObserved: false, bytesObserved: 0, bodyCompleted: false },
      termination: { outcome: "timed_out" as const, phase: "response_headers" as const,
        safeReasonClass: "retrieval_timeout", socketInactivityTimeoutMs: 12_000 as const },
    };
    vi.doMock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js", () => ({
      createNodeDestinationResolutionPort: () => ({ resolve: async (candidateId: string, normalizedUrl: string) => ({
        candidateId, normalizedUrl, addresses: ["93.184.216.34", "93.184.216.35"], permitId: "permit-timeout-diagnostics",
      }) }),
      createNodeHttpsRetrievalPort: (_capability: unknown, config: { audit: { reserve(value: unknown): void } }) => ({
        retrieve: async (request: { reservationId: string; documentId: string }) => {
          const transportOperationId = request.reservationId.slice(0, -":document".length);
          config.audit.reserve({ receiptId: "receipt-timeout-diagnostics", reservationId: request.reservationId,
            operationId: transportOperationId, operation: "retrieval", providerCode: "node_https_pinned",
            logicalAttempt: 1, actualSendCount: 1, retryCount: 0, sendState: "sent", completionState: "timed_out",
            elapsedMs: 12_004, usageState: "unknown_possible_billable", outputTokens: null,
            providerRequestCount: null, usageCostUsd: null, providerConfigurationCode: "ratereveal_node_https_pinned_v3",
            httpStatus: null, localRequestId: null, providerRequestId: null, providerResponseId: null,
            requestedModelIdentifier: null, returnedModelIdentifier: null, finishReason: null, toolExecutionState: null,
            annotationCount: null, normalizedCandidateCount: null, providerErrorType: null, providerErrorCode: null,
            providerErrorParam: null, structuredOutputValidation: "not_applicable", safeReasonCode: "retrieval_timeout",
            retrievalTransportDiagnostics: diagnostics });
          throw new LiveOperationTransportError("timed_out", "retrieval_timeout");
        },
      }),
    }));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("phase-diagnostics-live-adapter-run");
    let sends = 0;
    const candidate = { candidateId: "candidate-timeout", url: "https://www.fiserv.com/public-document",
      title: "Public document", claimedAuthority: "processor_publication" as const, publicationDate: null,
      effectiveFrom: null, effectiveTo: null };
    try {
      await ports.retrieve(qualifiedRetrievalInput(execution, "atomic-claim-timeout", candidate), () => { sends += 1; });
      throw new Error("expected transport timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceTransportError);
      expect(error).toMatchObject({ transportState: "timed_out", message: "retrieval_timeout",
        receipt: { providerCode: "node_https_pinned", calls: 1, tokens: 0, retrievalBytes: 0,
          retrievalTransportDiagnostics: {
            schemaVersion: "public_https_retrieval_transport_diagnostics_v1",
            resolution: { state: "permit_bound", resolutionElapsedMs: expect.any(Number),
              approvedAddressCount: 2, selectedAddressFamily: 4 },
            termination: { outcome: "timed_out", phase: "response_headers",
              safeReasonClass: "retrieval_timeout" },
          } } });
      expect(JSON.stringify(error)).not.toContain("openrouter-test-secret");
      expect(JSON.stringify(error)).not.toContain("openai-test-secret");
    } finally {
      vi.doUnmock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js");
    }
    expect(sends).toBe(1);
  });

  it("records destination-resolution failure before send without creating transport ambiguity", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    vi.resetModules();
    let retrievalCalls = 0;
    vi.doMock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js", () => ({
      createNodeDestinationResolutionPort: () => ({ resolve: async () => {
        throw new Error("destination_resolution_failed");
      } }),
      createNodeHttpsRetrievalPort: () => ({ retrieve: async () => {
        retrievalCalls += 1;
        throw new Error("unexpected_retrieval_send");
      } }),
    }));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("resolution-diagnostics-live-adapter-run");
    let sends = 0;
    const candidate = { candidateId: "candidate-resolution", url: "https://www.fiserv.com/public-document",
      title: "Public document", claimedAuthority: "processor_publication" as const, publicationDate: null,
      effectiveFrom: null, effectiveTo: null };
    try {
      await ports.retrieve(qualifiedRetrievalInput(execution, "atomic-claim-resolution", candidate), () => { sends += 1; });
      throw new Error("expected destination resolution failure");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceTransportError);
      expect(error).toMatchObject({ transportState: "before_send", message: "destination_resolution_failed",
        receipt: { providerCode: "node_https_pinned", calls: 0, tokens: 0, retrievalBytes: 0,
          retrievalTransportDiagnostics: {
            schemaVersion: "public_https_retrieval_transport_diagnostics_v1",
            resolution: { state: "failed_before_permit", resolutionElapsedMs: expect.any(Number),
              approvedAddressCount: 0, selectedAddressFamily: null, selectionPolicy: "none" },
            milestones: { requestSentMs: null },
            termination: { outcome: "failed", phase: "destination_resolution",
              safeReasonClass: "destination_resolution_failed" },
          } } });
    } finally {
      vi.doUnmock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js");
    }
    expect(sends).toBe(0);
    expect(retrievalCalls).toBe(0);
  });

  it("preserves raw-byte identity while returning deterministically normalized locator provenance", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    const source = "Official application\u00a0fee  schedule";
    const content = new TextEncoder().encode(source);
    const rawFingerprint = createHash("sha256").update(content).digest("hex");
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    vi.resetModules();
    vi.doMock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js", () => ({
      createNodeDestinationResolutionPort: () => ({ resolve: async (candidateId: string, normalizedUrl: string) => ({
        candidateId, normalizedUrl, addresses: ["93.184.216.34"], permitId: "permit-normalized-provenance",
      }) }),
      createNodeHttpsRetrievalPort: () => ({ retrieve: async (request: {
        questionId: string; candidateId: string; documentId: string; recordReceivedBytes(value: number): string;
      }) => {
        request.recordReceivedBytes(content.byteLength);
        return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
          status: "retrieved", connectedAddress: "93.184.216.34", redirects: [], mimeType: "text/plain",
          content: Uint8Array.from(content), byteLength: content.byteLength, streamedByteLength: content.byteLength,
          safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true,
            destinationPermitEnforced: true } };
      } }),
    }));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("normalized-document-provenance-run");
    const candidate = { candidateId: "candidate-normalized", url: "https://www.fiserv.com/public-document",
      title: "Public document", claimedAuthority: "processor_publication" as const, publicationDate: null,
      effectiveFrom: null, effectiveTo: null };
    try {
      const result = await ports.retrieve(qualifiedRetrievalInput(execution, "atomic-claim-normalized", candidate),
        () => undefined);
      expect(result.value).toMatchObject({ documentFingerprint: rawFingerprint, byteLength: content.byteLength,
        locators: [{ textExcerpt: "Official application fee schedule", textDerivation: {
          schemaVersion: "public_document_locator_text_derivation_v1",
          normalizationVersion: "public_document_text_normalization_v1",
          extractedTextInputHash: createHash("sha256").update(source).digest("hex"),
          normalizedFullTextHash: createHash("sha256").update("Official application fee schedule").digest("hex"),
          transformations: ["unicode_whitespace_to_ascii_space"],
        } }] });
      expect(result.receipt).toMatchObject({ providerCode: "node_https_pinned", calls: 1,
        retrievalBytes: content.byteLength });
    } finally {
      vi.doUnmock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js");
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects unsafe non-PDF control content with an exact deterministic admission reason", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    const content = new TextEncoder().encode("Official application\u0002fee schedule");
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    vi.resetModules();
    vi.doMock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js", () => ({
      createNodeDestinationResolutionPort: () => ({ resolve: async (candidateId: string, normalizedUrl: string) => ({
        candidateId, normalizedUrl, addresses: ["93.184.216.34"], permitId: "permit-control-rejection",
      }) }),
      createNodeHttpsRetrievalPort: () => ({ retrieve: async (request: {
        questionId: string; candidateId: string; documentId: string; recordReceivedBytes(value: number): string;
      }) => {
        request.recordReceivedBytes(content.byteLength);
        return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
          status: "retrieved", connectedAddress: "93.184.216.34", redirects: [], mimeType: "text/plain",
          content: Uint8Array.from(content), byteLength: content.byteLength, streamedByteLength: content.byteLength,
          safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true,
            destinationPermitEnforced: true } };
      } }),
    }));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("control-document-rejection-run");
    const candidate = { candidateId: "candidate-control", url: "https://www.fiserv.com/public-document",
      title: "Public document", claimedAuthority: "processor_publication" as const, publicationDate: null,
      effectiveFrom: null, effectiveTo: null };
    try {
      await ports.retrieve(qualifiedRetrievalInput(execution, "atomic-claim-control", candidate), () => undefined);
      throw new Error("expected deterministic control-content rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceCompletedUnusableError);
      expect(error).toMatchObject({ message: "document_text_non_pdf_control_character_forbidden",
        receipt: { providerCode: "node_https_pinned", calls: 1, retrievalBytes: content.byteLength } });
      expect(error).not.toBeInstanceOf(execution.RgEvidenceTransportError);
    } finally {
      vi.doUnmock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js");
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects credential material in retrieved public content before the document can be returned for persistence", async () => {
    process.env.OPENROUTER_API_KEY = "openrouter-test-secret-000000000000";
    process.env.OPENAI_API_KEY = "openai-test-secret-000000000000000";
    process.env.OPENROUTER_SEARCH_MODEL = "openai/gpt-5.2";
    process.env.OPENAI_INTERNAL_ANALYSIS_MODEL = "gpt-5.2";
    const secret = `sk-or-v1-${"q".repeat(32)}`;
    globalThis.fetch = vi.fn(async () => { throw new Error("fetch_must_not_run"); });
    vi.resetModules();
    vi.doMock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js", () => ({
      createNodeDestinationResolutionPort: () => ({ resolve: async (candidateId: string, normalizedUrl: string) => ({
        candidateId, normalizedUrl, addresses: ["93.184.216.34"], permitId: "permit-retrieved-secret",
      }) }),
      createNodeHttpsRetrievalPort: () => ({ retrieve: async (request: {
        questionId: string; candidateId: string; documentId: string; recordReceivedBytes(value: number): string;
      }) => {
        const content = new TextEncoder().encode(`<html><body>OPENROUTER_API_KEY=${secret}</body></html>`);
        request.recordReceivedBytes(content.byteLength);
        return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
          status: "retrieved", connectedAddress: "93.184.216.34", redirects: [], mimeType: "text/html",
          content, byteLength: content.byteLength, streamedByteLength: content.byteLength,
          safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true,
            destinationPermitEnforced: true } };
      } }),
    }));
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const execution = await import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("retrieved-secret-admission-run");
    const candidate = { candidateId: "candidate-secret", url: "https://www.fiserv.com/public-document",
      title: "Public document", claimedAuthority: "processor_publication" as const, publicationDate: null,
      effectiveFrom: null, effectiveTo: null };

    try {
      await ports.retrieve(qualifiedRetrievalInput(execution, "atomic-claim-secret", candidate), () => undefined);
      throw new Error("expected retrieved credential rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(execution.RgEvidenceCompletedUnusableError);
      const unusable = error as InstanceType<typeof execution.RgEvidenceCompletedUnusableError>;
      expect(unusable.message).toBe("rg_retrieved_document_credential_material_forbidden:approved_ai_packet_api_key_material_forbidden");
      expect(JSON.stringify({ message: unusable.message, receipt: unusable.receipt })).not.toContain(secret);
    } finally {
      vi.doUnmock("../../../../src/canonical/v2/intelligence/publicRetrievalAdapters.js");
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

function qualifiedRetrievalInput(
  execution: typeof import("../../../../src/canonical/v2/runtime/rgEvidenceExecution.js"),
  atomicClaimId: string,
  candidate: Parameters<typeof execution.compileCanonicalQualifiedPublicReadContract>[0],
) {
  return {
    intent: { atomicClaimId } as never,
    candidate,
    maximumBytes: 5_242_880,
    logicalAttempt: 1,
    qualifiedPublicRead: execution.compileCanonicalQualifiedPublicReadContract(candidate),
  };
}

function searchPortInput(runId: string) {
  return { intent: {
    schemaVersion: "canonical_rg_search_intent_v1_3", runId, intentId: `${runId}-intent`,
    atomicClaimId: `${runId}-claim`, queryTerms: ["public", "processor", "term"],
    queryText: "US processor public term", requiredSourceAuthorities: ["processor_publication"],
    publicScope: { processor: "fiserv", processorProgram: null },
  } as never, maximumCandidates: 3 };
}

function approvedAiPacket(value: unknown) {
  return {
    provider: "openai_responses_api" as const,
    url: "https://api.openai.com/v1/responses",
    method: "POST" as const,
    headerNames: ["Authorization", "Content-Type"],
    body: JSON.stringify({ input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(value) }] }],
      store: false }),
  };
}

function approvedClaimBinding(sourceIdentity: Record<string, unknown>, runId = "approved-ai-privacy-test-run") {
  const intent = { runId, atomicClaimId: "atomic-claim-approved-ai", facet: "economic_category" };
  const admission = { atomicClaimId: intent.atomicClaimId, facet: intent.facet };
  const expectedValueConstraint = { kind: "mapping", sourceCode: "opaque-source-code" };
  const base = {
    schemaVersion: "canonical_rg_approved_ai_claim_context_v1",
    authority: "deterministic_exact_claim_projection_of_durable_analysis_run",
    runBinding: { runId, sourceFingerprint: "1".repeat(64), policyVersion: "policy-v1",
      synthesisContractId: "canonical_synthesis_admission_contract_v1_1", financialFoundationHash: "2".repeat(64),
      semanticHash: "3".repeat(64), canonicalStateHash: "4".repeat(64), semanticRevision: 0,
      canonicalTruthPreserved: true },
    exactClaim: { admission, workContract: { workItemId: "work-approved-ai", atomicClaimId: intent.atomicClaimId,
      requestedOperation: "claim_scoped_public_research", evidenceObjective: "Resolve only the exact claim.",
      expectedDecisionEffects: [], knowledgeQuery: {}, expectedKnowledgeValueConstraint: expectedValueConstraint,
      requiredSourceAuthorities: ["processor_publication"], continuationContract: null },
      unresolvedParentClaims: [] },
    canonicalLineage: { sourceIdentity, documentIntegrity: {}, canonicalEntities: [], sourceOccurrences: [],
      sourceEvidence: [], currentRunExternalEvidence: [], requiredCanonicalRefs: [], requiredOccurrenceRefs: [],
      requiredEvidenceRefs: [], relatedReferenceIds: [], completeness: "all_required_exact_claim_lineage_present" },
    authorityContext: { rfBinding: {}, requiredSourceAuthorities: ["processor_publication"], statementPeriod: null,
      scopeFingerprint: "scope-approved-ai", direction: "not_monetary" },
    adjacentClaimBoundary: [],
    safeguards: { exactFacetOnly: true, adjacentClaimInference: "prohibited", financialMutationAllowed: false,
      evidenceOmissionAllowed: false, externalEvidenceAuthority: "current_run_support_only_not_rf_promotion" },
  };
  const claimContext = { ...base,
    contextHash: createHash("sha256").update(canonicalJson(base)).digest("hex") };
  return { intent, admission, expectedValueConstraint, claimContext };
}
