import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertApprovedAiOutboundPacketSafe,
  inspectApprovedAiOutboundPacket,
} from "../../../../src/canonical/v2/intelligence/providerPrivacy.js";

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
    let sends = 0;

    try {
      await ports.investigate({ intent: {}, admission: {}, expectedValueConstraint: {}, candidate: {}, document: {},
        currentRunContext: { externalText: secret } } as never, () => { sends += 1; });
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
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.store).toBe(false);
      return new Response(JSON.stringify({ id: "resp-approved-ai-words", model: "gpt-5.2",
        output_text: JSON.stringify({ investigation: { accepted: true } }), usage: { output_tokens: 3 } }), {
        status: 200, headers: { "Content-Type": "application/json", "x-request-id": "request-approved-ai-words" },
      });
    });
    const live = await import("../../../../src/canonical/v2/runtime/rgLiveEvidencePorts.js");
    const ports = live.createProductionRgEvidencePortsFromEnvironment("approved-ai-public-words-run");
    let sends = 0;
    const result = await ports.investigate({
      intent: {}, admission: {}, expectedValueConstraint: {}, candidate: {},
      document: { locators: [{ textExcerpt: "Password, authorization, and token policies are public terms." }] },
      currentRunContext: { publicExplanation: "Authorization processing can include a tokenized credential category." },
    } as never, () => { sends += 1; });

    expect(sends).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.value).toEqual({ accepted: true });
    expect(result.receipt).toMatchObject({ providerCode: "openai_responses_api_investigation",
      providerRequestId: "request-approved-ai-words", calls: 1, tokens: 3, retrievalBytes: 0 });
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

    try {
      await ports.retrieve({ intent: { atomicClaimId: "atomic-claim-one" }, candidate: {
        candidateId: "candidate-one", url: "https://www.fiserv.com/public-document", title: "Public document",
        claimedAuthority: "processor_publication", publicationDate: null, effectiveFrom: null, effectiveTo: null,
      }, maximumBytes: 5_242_880 } as never, () => { sends += 1; });
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

    try {
      await ports.retrieve({ intent: { atomicClaimId: "atomic-claim-secret" }, candidate: {
        candidateId: "candidate-secret", url: "https://www.fiserv.com/public-document", title: "Public document",
        claimedAuthority: "processor_publication", publicationDate: null, effectiveFrom: null, effectiveTo: null,
      }, maximumBytes: 5_242_880 } as never, () => undefined);
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
