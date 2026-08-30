import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import type { DestinationResolution, IntelligencePorts, PublicRetrievalTransportDiagnosticsV1,
  PublicRetrievalTransportPhase, RetrievalRequest, RetrievalResponse } from "./intelligenceTypes.js";
import { ProviderOperationAuditLog } from "./providerAdapters.js";
import { type LiveExecutionCapabilityV1, LiveOperationTransportError, requireLiveCapabilityBinding } from "./providerPreflight.js";

const RETRIEVAL_SOCKET_INACTIVITY_TIMEOUT_MS = 12_000 as const;

type MutableRetrievalTransportTrace = {
  startedMs: number;
  approvedAddressCount: number;
  selectedAddressFamily: 4 | 6;
  socketAssignedMs: number | null;
  tcpConnectedMs: number | null;
  tlsEstablishedMs: number | null;
  requestSentMs: number | null;
  responseHeadersMs: number | null;
  firstBodyByteMs: number | null;
  bodyCompletedMs: number | null;
  connectedAddressFamily: 4 | 6 | null;
  httpStatus: number | null;
  redirectObserved: boolean;
  bytesObserved: number;
};

export function createNodeDestinationResolutionPort(capability: LiveExecutionCapabilityV1): NonNullable<IntelligencePorts["destination"]> {
  requireLiveCapabilityBinding(capability);
  return { async resolve(candidateId, normalizedUrl): Promise<DestinationResolution> {
    try {
      const url = new URL(normalizedUrl);
      const addresses = [...new Set((await lookup(url.hostname, { all: true, verbatim: true })).map((item) => item.address))].sort();
      return { candidateId, normalizedUrl, addresses, permitId: `permit-${createHash("sha256").update(`${candidateId}\0${normalizedUrl}\0${addresses.join("|")}`).digest("hex").slice(0, 20)}` };
    } catch (error) {
      throw new Error(classifyDestinationResolutionError(error));
    }
  } };
}

export function createNodeHttpsRetrievalPort(capability: LiveExecutionCapabilityV1, config: { audit: ProviderOperationAuditLog; userAgent?: string }): NonNullable<IntelligencePorts["retrieval"]> {
  const binding = requireLiveCapabilityBinding(capability);
  return { async retrieve(request): Promise<RetrievalResponse> {
    if (!request.reservationId.endsWith(":document")) throw new Error("retrieval_reservation_identity_invalid");
    const operationId = request.reservationId.slice(0, -":document".length);
    const receiptId = `receipt-${createHash("sha256").update(`retrieval\0${operationId}`).digest("hex").slice(0, 20)}`;
    const started = binding.clock.nowMs();
    const selectedAddress = request.permit.approvedAddresses[0];
    const selectedAddressFamily = isIP(selectedAddress ?? "");
    if (!selectedAddress || (selectedAddressFamily !== 4 && selectedAddressFamily !== 6)) {
      throw new Error("retrieval_destination_permit_empty");
    }
    const trace: MutableRetrievalTransportTrace = {
      startedMs: started,
      approvedAddressCount: request.permit.approvedAddresses.length,
      selectedAddressFamily,
      socketAssignedMs: null,
      tcpConnectedMs: null,
      tlsEstablishedMs: null,
      requestSentMs: null,
      responseHeadersMs: null,
      firstBodyByteMs: null,
      bodyCompletedMs: null,
      connectedAddressFamily: null,
      httpStatus: null,
      redirectObserved: false,
      bytesObserved: 0,
    };
    config.audit.reserve({ receiptId, reservationId: request.reservationId, operationId, operation: "retrieval", providerCode: "node_https_pinned",
      logicalAttempt: 1, actualSendCount: 0, retryCount: 0, sendState: "not_sent", completionState: "reserved", elapsedMs: 0,
      usageState: "known", outputTokens: null, providerRequestCount: null, usageCostUsd: null, providerConfigurationCode: "ratereveal_node_https_pinned_v3",
      httpStatus: null, localRequestId: null, providerRequestId: null, providerResponseId: null,
      requestedModelIdentifier: null, returnedModelIdentifier: null, finishReason: null, toolExecutionState: null,
      annotationCount: null, normalizedCandidateCount: null, providerErrorType: null, providerErrorCode: null, providerErrorParam: null,
      structuredOutputValidation: "not_applicable",
      safeReasonCode: "reserved", retrievalTransportDiagnostics: transportDiagnostics(trace, "in_progress", "reserved") });
    try {
      const result = await sendPinnedGet(request, request.permit, config, trace, () => binding.clock.nowMs(),
        () => config.audit.settle(receiptId, {
        actualSendCount: 1,
        sendState: "sent",
        retrievalTransportDiagnostics: transportDiagnostics(trace, "in_progress", "request_sent"),
      }));
      if (!request.permit.approvedAddresses.includes(result.connectedAddress)) throw new Error("retrieval_dns_rebinding_or_unpinned_connection");
      if (result.redirectUrl) {
        config.audit.settle(receiptId, { completionState: "completed", elapsedMs: elapsed(binding.clock.nowMs(), started),
          httpStatus: result.statusCode, safeReasonCode: "retrieval_redirect_not_followed",
          retrievalTransportDiagnostics: transportDiagnostics(trace, "completed", "retrieval_redirect_not_followed") });
        return emptyResponse(request, result.connectedAddress, "safety_blocked", result.streamedBytes);
      }
      config.audit.settle(receiptId, { completionState: "completed", elapsedMs: elapsed(binding.clock.nowMs(), started),
        httpStatus: result.statusCode, safeReasonCode: "retrieval_completed",
        retrievalTransportDiagnostics: transportDiagnostics(trace, "completed", "retrieval_completed") });
      return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId,
        status: result.statusCode >= 200 && result.statusCode < 300 ? "retrieved" : "inaccessible", connectedAddress: result.connectedAddress,
        redirects: [], mimeType: result.mimeType, content: result.content, byteLength: result.content?.byteLength ?? 0, streamedByteLength: result.streamedBytes,
        safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true, destinationPermitEnforced: true } };
    } catch (error) {
      const sent = config.audit.snapshot().find((item) => item.receiptId === receiptId)?.actualSendCount === 1;
      const timedOut = error instanceof Error && error.message === "retrieval_timeout";
      const cancelled = request.signal.aborted && !timedOut;
      const safeReasonCode = classifyRetrievalError(error, { timedOut, cancelled });
      config.audit.settle(receiptId, { completionState: !sent ? "not_sent" : timedOut ? "timed_out" : cancelled ? "cancelled" : "failed",
        elapsedMs: elapsed(binding.clock.nowMs(), started), usageState: sent ? "unknown_possible_billable" : "known",
        safeReasonCode,
        httpStatus: trace.httpStatus,
        retrievalTransportDiagnostics: transportDiagnostics(trace,
          timedOut ? "timed_out" : cancelled ? "cancelled" : "failed", safeReasonCode) });
      throw timedOut ? new LiveOperationTransportError("timed_out", "retrieval_timeout") : error;
    }
  } };
}

async function sendPinnedGet(request: RetrievalRequest, permit: RetrievalRequest["permit"],
  config: { audit: ProviderOperationAuditLog; userAgent?: string }, trace: MutableRetrievalTransportTrace,
  nowMs: () => number, onSend: () => void):
Promise<{ statusCode: number; connectedAddress: string; mimeType: string | null; content: Uint8Array | null; streamedBytes: number; redirectUrl: string | null }> {
  const parsed = new URL(permit.normalizedUrl); const pinnedAddress = permit.approvedAddresses[0];
  if (!pinnedAddress) throw new Error("retrieval_destination_permit_empty");
  return new Promise((resolve, reject) => {
    const req = https.request({ protocol: "https:", hostname: parsed.hostname, port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`, method: "GET", headers: { Host: parsed.host, Accept: "text/html,application/pdf,text/plain",
        "User-Agent": config.userAgent ?? "RateReveal-Internal-Evaluation/1.0" },
      family: isIP(pinnedAddress),
      lookup: (_hostname, _options, callback) => callback(null, pinnedAddress, isIP(pinnedAddress)), signal: request.signal,
    }, (response) => {
      trace.responseHeadersMs ??= elapsed(nowMs(), trace.startedMs);
      const connectedAddress = response.socket.remoteAddress ?? pinnedAddress;
      const connectedFamily = isIP(connectedAddress);
      trace.connectedAddressFamily = connectedFamily === 4 || connectedFamily === 6 ? connectedFamily : null;
      const statusCode = response.statusCode ?? 0;
      trace.httpStatus = statusCode;
      const location = response.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        trace.redirectObserved = true;
        response.destroy();
        resolve({ statusCode, connectedAddress, mimeType: null, content: null, streamedBytes: 0,
          redirectUrl: new URL(location, parsed).toString() });
        return;
      }
      const chunks: Buffer[] = []; let streamedBytes = 0;
      const clearChunks = () => chunks.forEach((chunk) => chunk.fill(0));
      response.on("data", (chunk: Buffer) => {
        trace.firstBodyByteMs ??= elapsed(nowMs(), trace.startedMs);
        streamedBytes += chunk.byteLength;
        trace.bytesObserved = streamedBytes;
        if (request.recordReceivedBytes(streamedBytes) === "abort") { clearChunks(); req.destroy(new Error("retrieval_stream_byte_limit_exceeded")); return; }
        chunks.push(Buffer.from(chunk)); });
      response.on("end", () => {
        trace.bodyCompletedMs = elapsed(nowMs(), trace.startedMs);
        const concatenated = Buffer.concat(chunks); const content = Uint8Array.from(concatenated); concatenated.fill(0); clearChunks();
        resolve({ statusCode, connectedAddress, mimeType: typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : null,
          content, streamedBytes, redirectUrl: null }); });
      response.on("error", (error) => { clearChunks(); reject(error); });
      response.on("aborted", () => { clearChunks(); reject(new Error("retrieval_response_aborted")); });
    });
    req.on("socket", (socket) => {
      trace.socketAssignedMs ??= elapsed(nowMs(), trace.startedMs);
      socket.once("connect", () => { trace.tcpConnectedMs ??= elapsed(nowMs(), trace.startedMs); });
      socket.once("secureConnect", () => {
        trace.tlsEstablishedMs ??= elapsed(nowMs(), trace.startedMs);
        const connectedFamily = isIP(socket.remoteAddress ?? "");
        trace.connectedAddressFamily = connectedFamily === 4 || connectedFamily === 6 ? connectedFamily : null;
      });
    });
    req.setTimeout(RETRIEVAL_SOCKET_INACTIVITY_TIMEOUT_MS, () => req.destroy(new Error("retrieval_timeout")));
    req.on("error", reject);
    trace.requestSentMs = elapsed(nowMs(), trace.startedMs);
    onSend();
    req.end();
  });
}

function transportDiagnostics(trace: MutableRetrievalTransportTrace,
  outcome: PublicRetrievalTransportDiagnosticsV1["termination"]["outcome"],
  safeReasonClass: string): PublicRetrievalTransportDiagnosticsV1 {
  return {
    schemaVersion: "public_https_retrieval_transport_diagnostics_v1",
    configurationCode: "ratereveal_node_https_pinned_v3",
    resolution: {
      state: "permit_bound",
      resolutionElapsedMs: null,
      approvedAddressCount: trace.approvedAddressCount,
      selectedAddressFamily: trace.selectedAddressFamily,
      selectionPolicy: "first_lexicographically_sorted_approved_address",
    },
    milestones: {
      socketAssignedMs: trace.socketAssignedMs,
      tcpConnectedMs: trace.tcpConnectedMs,
      tlsEstablishedMs: trace.tlsEstablishedMs,
      requestSentMs: trace.requestSentMs,
      responseHeadersMs: trace.responseHeadersMs,
      firstBodyByteMs: trace.firstBodyByteMs,
      bodyCompletedMs: trace.bodyCompletedMs,
    },
    response: {
      connectedAddressFamily: trace.connectedAddressFamily,
      httpStatus: trace.httpStatus,
      redirectObserved: trace.redirectObserved,
      responseHeadersObserved: trace.responseHeadersMs !== null,
      firstBodyByteObserved: trace.firstBodyByteMs !== null,
      bytesObserved: trace.bytesObserved,
      bodyCompleted: trace.bodyCompletedMs !== null,
    },
    termination: {
      outcome,
      phase: transportPhase(trace),
      safeReasonClass,
      socketInactivityTimeoutMs: RETRIEVAL_SOCKET_INACTIVITY_TIMEOUT_MS,
    },
  };
}

function transportPhase(trace: MutableRetrievalTransportTrace): PublicRetrievalTransportPhase {
  if (trace.bodyCompletedMs !== null || trace.redirectObserved) return "completed";
  if (trace.responseHeadersMs !== null) return "response_body";
  if (trace.tlsEstablishedMs !== null) return "response_headers";
  if (trace.tcpConnectedMs !== null) return "tls_handshake";
  return trace.requestSentMs !== null ? "connection_establishment" : "destination_resolution";
}

function emptyResponse(request: RetrievalRequest, connectedAddress: string, status: "safety_blocked", streamedByteLength: number): RetrievalResponse {
  return { questionId: request.questionId, candidateId: request.candidateId, documentId: request.documentId, status, connectedAddress,
    redirects: [], mimeType: null, content: null, byteLength: 0, streamedByteLength,
    safetyContract: { streamingByteLimitEnforced: true, abortSignalObserved: true, destinationPermitEnforced: true } };
}
function classifyDestinationResolutionError(error: unknown): string {
  const codes = errorCodes(error);
  return codes.some((code) => ["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "ENODATA"].includes(code))
    ? "retrieval_destination_resolution_failed" : "retrieval_destination_resolution_unclassified";
}
function classifyRetrievalError(error: unknown, state: { timedOut: boolean; cancelled: boolean }): string {
  if (state.timedOut) return "retrieval_timeout";
  if (state.cancelled) return "retrieval_cancelled";
  const codes = errorCodes(error);
  if (codes.includes("ERR_INVALID_IP_ADDRESS")) return "retrieval_destination_pin_invalid";
  if (codes.some((code) => ["ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code))) return "retrieval_tls_validation_failed";
  if (codes.some((code) => ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETDOWN", "ENETUNREACH", "EPIPE"].includes(code))) {
    return "retrieval_network_connect_failed";
  }
  const value = error instanceof Error ? error.message : "retrieval_failed";
  return /^[a-z][a-z0-9_]{0,95}$/.test(value) ? value : "retrieval_transport_unclassified";
}
function errorCodes(error: unknown): string[] {
  const values: unknown[] = [error]; const codes = new Set<string>();
  while (values.length > 0) {
    const value = values.shift();
    if (!value || typeof value !== "object") continue;
    const record = value as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof record.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(record.code)) codes.add(record.code);
    if (record.cause) values.push(record.cause);
    if (Array.isArray(record.errors)) values.push(...record.errors);
  }
  return [...codes];
}
function elapsed(now: number, started: number): number { return Math.max(0, Math.round(now - started)); }
