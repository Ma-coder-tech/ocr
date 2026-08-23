import { BlockList, isIP } from "node:net";
import { isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type {
  DestinationPermit,
  DiscoveryCandidate,
  DocumentExtractionResponse,
  ExtractedLocator,
  InvestigativeObservation,
  RedirectHop,
  RetrievalResponse,
} from "./intelligenceTypes.js";

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function inV4(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

export function isPublicDestinationAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return ![
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
      ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
      ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ].some(([base, bits]) => inV4(address, String(base), Number(bits)));
  }
  if (version === 6) {
    const blocked = new BlockList();
    for (const [base, prefix] of [
      ["::", 96], ["::ffff:0:0", 96], ["100::", 64], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
      ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:db8::", 32],
    ] as const) blocked.addSubnet(base, prefix, "ipv6");
    return !blocked.check(address, "ipv6");
  }
  return false;
}

export function normalizeSafeHttpsUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("retrieval_invalid_url");
  }
  if (parsed.protocol !== "https:") throw new Error("retrieval_https_required");
  if (parsed.username || parsed.password) throw new Error("retrieval_url_credentials_forbidden");
  if (!parsed.hostname || parsed.hostname === "localhost" || (isIP(parsed.hostname) > 0 && !isPublicDestinationAddress(parsed.hostname))) {
    throw new Error("retrieval_destination_forbidden");
  }
  parsed.hash = "";
  return parsed.toString();
}

export function createDestinationPermit(params: {
  candidateId: string;
  rawUrl: string;
  resolvedAddresses: string[];
  permitId: string;
  nowMs: number;
  ttlMs: number;
}): DestinationPermit {
  const normalizedUrl = normalizeSafeHttpsUrl(params.rawUrl);
  const addresses = [...new Set(params.resolvedAddresses)].sort();
  if (addresses.length === 0 || addresses.some((address) => !isPublicDestinationAddress(address))) {
    throw new Error("retrieval_destination_resolution_forbidden");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(params.permitId)) throw new Error("retrieval_invalid_permit_identity");
  return {
    permitId: params.permitId,
    candidateId: params.candidateId,
    normalizedUrl,
    host: new URL(normalizedUrl).hostname,
    approvedAddresses: addresses,
    expiresAtMs: params.nowMs + params.ttlMs,
  };
}

function validateHop(hop: RedirectHop, permits: ReadonlyMap<string, DestinationPermit>, nowMs: number): string[] {
  const issues: string[] = [];
  const permit = permits.get(hop.permitId);
  try {
    normalizeSafeHttpsUrl(hop.normalizedUrl);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "redirect_url_invalid");
  }
  if (!permit || permit.normalizedUrl !== hop.normalizedUrl) issues.push("redirect_destination_permit_missing_or_mismatched");
  else {
    if (permit.expiresAtMs <= nowMs) issues.push("redirect_destination_permit_expired");
    if (!permit.approvedAddresses.includes(hop.connectedAddress)) issues.push("redirect_dns_rebinding_or_unpinned_connection");
  }
  return issues;
}

export function validateRetrievalResponse(params: {
  candidate: DiscoveryCandidate;
  documentId: string;
  permit: DestinationPermit;
  response: RetrievalResponse;
  nowMs: number;
  maximumBytes: number;
  maximumRedirects?: number;
  authorizedRedirectPermits?: ReadonlyMap<string, DestinationPermit>;
  observedStreamedBytes?: number;
}): string[] {
  const issues: string[] = [];
  if (params.response.questionId !== params.candidate.questionId) issues.push("retrieval_question_identity_mismatch");
  if (params.response.candidateId !== params.candidate.candidateId || params.permit.candidateId !== params.candidate.candidateId) issues.push("retrieval_candidate_identity_mismatch");
  if (params.response.documentId !== params.documentId) issues.push("retrieval_document_identity_mismatch");
  if (params.permit.expiresAtMs <= params.nowMs) issues.push("retrieval_destination_permit_expired");
  if (!params.permit.approvedAddresses.includes(params.response.connectedAddress)) issues.push("retrieval_dns_rebinding_or_unpinned_connection");
  if (params.response.redirects.length > (params.maximumRedirects ?? 3)) issues.push("retrieval_redirect_limit_exceeded");
  const normalizedChain = [params.permit.normalizedUrl, ...params.response.redirects.map((hop) => hop.normalizedUrl)];
  if (new Set(normalizedChain).size !== normalizedChain.length) issues.push("retrieval_redirect_loop_detected");
  const permits = params.authorizedRedirectPermits ?? new Map();
  issues.push(...params.response.redirects.flatMap((hop) => validateHop(hop, permits, params.nowMs)));
  if (!Number.isInteger(params.response.byteLength) || params.response.byteLength < 0 || params.response.byteLength > params.maximumBytes) issues.push("retrieval_byte_limit_exceeded");
  if (params.response.content !== null && params.response.content.byteLength !== params.response.byteLength) issues.push("retrieval_stream_length_mismatch");
  if (params.response.streamedByteLength !== params.response.byteLength || params.observedStreamedBytes !== params.response.byteLength) issues.push("retrieval_stream_accounting_mismatch");
  if (!params.response.safetyContract || params.response.safetyContract.streamingByteLimitEnforced !== true || params.response.safetyContract.abortSignalObserved !== true
    || params.response.safetyContract.destinationPermitEnforced !== true) issues.push("retrieval_transport_safety_contract_unproven");
  if (params.response.status === "retrieved" && (!params.response.content || !params.response.mimeType)) issues.push("retrieval_missing_content");
  if (params.response.mimeType && !["text/html", "application/xhtml+xml", "text/plain", "application/pdf"].includes(params.response.mimeType.toLowerCase().split(";")[0]!.trim())) {
    issues.push("retrieval_unsupported_content_type");
  }
  return [...new Set(issues)];
}

export function validateContentSignature(mimeType: string, content: Uint8Array): string[] {
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();
  const prefix = new TextDecoder("utf-8", { fatal: false }).decode(content.slice(0, 512)).trimStart().toLowerCase();
  const pdf = content.byteLength >= 5 && String.fromCharCode(...content.slice(0, 5)) === "%PDF-";
  const html = /^<!doctype\s+html|^<html(?:\s|>)|^<head(?:\s|>)|^<body(?:\s|>)/.test(prefix);
  const binary = content.slice(0, Math.min(content.byteLength, 512)).some((byte) => byte === 0);
  if (mime === "application/pdf" && !pdf) return ["retrieval_pdf_signature_mismatch"];
  if ((mime === "text/html" || mime === "application/xhtml+xml") && (!html || pdf || binary)) return ["retrieval_html_signature_mismatch"];
  if (mime === "text/plain" && (pdf || html || binary)) return ["retrieval_text_signature_mismatch"];
  return [];
}

export function validateExtractionResponse(params: {
  extraction: DocumentExtractionResponse;
  questionId: string;
  candidateId: string;
  documentId: string;
  documentFingerprint: string;
  maximumOutputBytes: number;
}): { issues: string[]; locators: ExtractedLocator[] } {
  const { extraction } = params;
  const issues: string[] = [];
  if (extraction.questionId !== params.questionId || extraction.candidateId !== params.candidateId || extraction.documentId !== params.documentId
    || extraction.documentFingerprint !== params.documentFingerprint) issues.push("document_extraction_identity_mismatch");
  if (!Array.isArray(extraction.locators)) return { issues: [...issues, "document_locator_collection_malformed"], locators: [] };
  const ids = extraction.locators.map((locator) => locator?.locatorId);
  if (new Set(ids).size !== ids.length) issues.push("document_locator_identity_duplicate");
  for (const locator of extraction.locators) {
    if (!locator || !isSafeStructuredString(locator.locatorId) || locator.documentId !== params.documentId
      || locator.documentFingerprint !== params.documentFingerprint || (locator.page !== null && (!Number.isInteger(locator.page) || locator.page < 1))
      || (locator.sectionCode !== null && !isSafeStructuredString(locator.sectionCode)) || !Number.isInteger(locator.lineStart)
      || !Number.isInteger(locator.lineEnd) || locator.lineStart < 1 || locator.lineEnd < locator.lineStart || typeof locator.text !== "string") {
      issues.push("document_locator_structure_invalid");
    }
  }
  const totalBytes = Buffer.byteLength(extraction.text ?? "", "utf8")
    + extraction.locators.reduce((sum, locator) => sum + Buffer.byteLength(typeof locator?.text === "string" ? locator.text : "", "utf8"), 0);
  if (totalBytes > params.maximumOutputBytes) issues.push("document_extraction_output_oversized");
  const locators = [...extraction.locators].sort((left, right) => (left.page ?? Number.MAX_SAFE_INTEGER) - (right.page ?? Number.MAX_SAFE_INTEGER)
    || left.lineStart - right.lineStart || left.lineEnd - right.lineEnd || left.locatorId.localeCompare(right.locatorId));
  return { issues: [...new Set(issues)], locators };
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function deterministicLocatorGrounding(
  candidate: Pick<DiscoveryCandidate, "candidateId" | "questionId" | "locatorHint">,
  extraction: DocumentExtractionResponse,
): ExtractedLocator | null {
  if (extraction.candidateId !== candidate.candidateId || extraction.questionId !== candidate.questionId) {
    throw new Error("locator_parent_identity_mismatch");
  }
  if (!candidate.locatorHint) return null;
  const hint = normalizedText(candidate.locatorHint);
  if (!hint) return null;
  return extraction.locators.find((locator) => normalizedText(locator.text).includes(hint)) ?? null;
}

export function bindInvestigativeLocator(params: {
  observation: InvestigativeObservation;
  extraction: DocumentExtractionResponse;
}): ExtractedLocator | null {
  const { observation, extraction } = params;
  if (observation.questionId !== extraction.questionId || observation.candidateId !== extraction.candidateId
    || observation.documentId !== extraction.documentId || observation.documentFingerprint !== extraction.documentFingerprint
    || observation.financialMutationAllowed !== false) return null;
  return extraction.locators.find((locator) => locator.locatorId === observation.locatorId
    && locator.documentFingerprint === observation.documentFingerprint) ?? null;
}
