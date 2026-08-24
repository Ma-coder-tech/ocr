import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import type { DestinationResolution, IntelligencePorts, RetrievalRequest, RetrievalResponse } from "./intelligenceTypes.js";
import { ProviderOperationAuditLog } from "./providerAdapters.js";
import { type InternalLiveExecutionCapabilityV1, requireLiveCapabilityBinding } from "./providerPreflight.js";

export function createNodeDestinationResolutionPort(capability: InternalLiveExecutionCapabilityV1): NonNullable<IntelligencePorts["destination"]> {
  requireLiveCapabilityBinding(capability);
  return { async resolve(candidateId, normalizedUrl): Promise<DestinationResolution> {
    const url = new URL(normalizedUrl);
    const addresses = [...new Set((await lookup(url.hostname, { all: true, verbatim: true })).map((item) => item.address))].sort();
    return { candidateId, normalizedUrl, addresses, permitId: `permit-${createHash("sha256").update(`${candidateId}\0${normalizedUrl}\0${addresses.join("|")}`).digest("hex").slice(0, 20)}` };
  } };
}

export function createNodeHttpsRetrievalPort(capability: InternalLiveExecutionCapabilityV1, config: { audit: ProviderOperationAuditLog; userAgent?: string }): NonNullable<IntelligencePorts["retrieval"]> {
  const binding = requireLiveCapabilityBinding(capability);
  return { async retrieve(request): Promise<RetrievalResponse> {
    if (!request.reservationId.endsWith(":document")) throw new Error("retrieval_reservation_identity_invalid");
    const operationId = request.reservationId.slice(0, -":document".length);
    const receiptId = `receipt-${createHash("sha256").update(`retrieval\0${operationId}`).digest("hex").slice(0, 20)}`;
    const started = binding.clock.nowMs();
    config.audit.reserve({ receiptId, reservationId: request.reservationId, operationId, operation: "retrieval", providerCode: "node_https_pinned",
      logicalAttempt: 1, actualSendCount: 0, retryCount: 0, sendState: "not_sent", completionState: "reserved", elapsedMs: 0,
      usageState: "known", outputTokens: null, providerRequestCount: null, usageCostUsd: null, providerConfigurationCode: "ratereveal_node_https_pinned_v1",
      safeReasonCode: "reserved" });
    try {
      const result = await sendPinnedGet(request, request.permit, config, () => config.audit.settle(receiptId, { actualSendCount: 1, sendState: "sent" }));
      if (!request.permit.approvedAddresses.includes(result.connectedAddress)) throw new Error("retrieval_dns_rebinding_or_unpinned_connection");
      if (result.redirectUrl) {
        config.audit.settle(receiptId, { completionState: "completed", elapsedMs: elapsed(binding.clock.nowMs(), started), safeReasonCode: "retrieval_redirect_not_followed" });
        return emptyResponse(request, result.connectedAddress, "safety_blocked", result.streamedBytes);
      }
      config.audit.settle(receiptId, { completionState: "completed", elapsedMs: elapsed(binding.clock.nowMs(), started), safeReasonCode: "retrieval_completed" });
      return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
        status: result.statusCode >= 200 && result.statusCode < 300 ? "retrieved" : "inaccessible", connectedAddress: result.connectedAddress,
        redirects: [], mimeType: result.mimeType, content: result.content, byteLength: result.content?.byteLength ?? 0, streamedByteLength: result.streamedBytes,
        safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true, destinationPermitEnforced: true } };
    } catch (error) {
      const sent = config.audit.snapshot().find((item) => item.receiptId === receiptId)?.actualSendCount === 1;
      const timedOut = error instanceof Error && error.message === "retrieval_timeout";
      const cancelled = request.signal.aborted && !timedOut;
      config.audit.settle(receiptId, { completionState: !sent ? "not_sent" : timedOut ? "timed_out" : cancelled ? "cancelled" : "failed",
        elapsedMs: elapsed(binding.clock.nowMs(), started), usageState: sent ? "unknown_possible_billable" : "known", safeReasonCode: safeError(error) });
      throw error;
    }
  } };
}

async function sendPinnedGet(request: RetrievalRequest, permit: RetrievalRequest["permit"], config: { audit: ProviderOperationAuditLog; userAgent?: string }, onSend: () => void):
Promise<{ statusCode: number; connectedAddress: string; mimeType: string | null; content: Uint8Array | null; streamedBytes: number; redirectUrl: string | null }> {
  const parsed = new URL(permit.normalizedUrl); const pinnedAddress = permit.approvedAddresses[0];
  if (!pinnedAddress) throw new Error("retrieval_destination_permit_empty");
  return new Promise((resolve, reject) => {
    const req = https.request({ protocol: "https:", hostname: parsed.hostname, port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`, method: "GET", headers: { Host: parsed.host, Accept: "text/html,application/pdf,text/plain",
        "User-Agent": config.userAgent ?? "RateReveal-Internal-Evaluation/1.0" },
      lookup: (_hostname, _options, callback) => callback(null, pinnedAddress, isIP(pinnedAddress)), signal: request.signal,
    }, (response) => {
      const connectedAddress = response.socket.remoteAddress ?? pinnedAddress; const statusCode = response.statusCode ?? 0; const location = response.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) { response.destroy(); resolve({ statusCode, connectedAddress, mimeType: null, content: null, streamedBytes: 0, redirectUrl: new URL(location, parsed).toString() }); return; }
      const chunks: Buffer[] = []; let streamedBytes = 0;
      const clearChunks = () => chunks.forEach((chunk) => chunk.fill(0));
      response.on("data", (chunk: Buffer) => { streamedBytes += chunk.byteLength;
        if (request.recordReceivedBytes(streamedBytes) === "abort") { clearChunks(); req.destroy(new Error("retrieval_stream_byte_limit_exceeded")); return; }
        chunks.push(Buffer.from(chunk)); });
      response.on("end", () => { const concatenated = Buffer.concat(chunks); const content = Uint8Array.from(concatenated); concatenated.fill(0); clearChunks();
        resolve({ statusCode, connectedAddress, mimeType: typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : null,
          content, streamedBytes, redirectUrl: null }); });
      response.on("error", (error) => { clearChunks(); reject(error); });
    });
    req.setTimeout(12_000, () => req.destroy(new Error("retrieval_timeout"))); req.on("error", reject); onSend(); req.end();
  });
}

function emptyResponse(request: RetrievalRequest, connectedAddress: string, status: "safety_blocked", streamedByteLength: number): RetrievalResponse {
  return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId, status, connectedAddress,
    redirects: [], mimeType: null, content: null, byteLength: 0, streamedByteLength,
    safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true, destinationPermitEnforced: true } };
}
function safeError(error: unknown): string { const value = error instanceof Error ? error.message : "retrieval_failed"; return /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "retrieval_failed"; }
function elapsed(now: number, started: number): number { return Math.max(0, Math.round(now - started)); }
