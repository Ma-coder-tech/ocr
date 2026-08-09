import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
  type FeeKnowledgeEvidenceLocator,
  type FeeKnowledgeRetrievalSafeDiagnostics,
  type FeeKnowledgeRetrievalStatus,
} from "./feeKnowledgeTypes.js";

export const FEE_KNOWLEDGE_RETRIEVAL_LIMITS = {
  policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
  maxRedirects: 3,
  maxHtmlBytes: 2 * 1024 * 1024,
  maxPdfBytes: 10 * 1024 * 1024,
  allowedPorts: [443],
  allowedContentTypes: ["text/html", "text/plain", "application/xhtml+xml", "application/pdf"],
} as const;

export type SafeFetch = typeof fetch;

export type RetrievedDocument = {
  type: "fee_knowledge_retrieved_document";
  policyVersion: typeof FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION;
  status: FeeKnowledgeRetrievalStatus;
  canonicalUrl: string | null;
  redirectChain: string[];
  contentType: string | null;
  byteLength: number;
  documentFingerprint: string | null;
  title: string | null;
  text: string;
  locators: FeeKnowledgeEvidenceLocator[];
  reasonCodes: string[];
  safeDiagnostics?: FeeKnowledgeRetrievalSafeDiagnostics;
};

export type RetrieveDocumentOptions = {
  abortSignal: AbortSignal;
  fetchImpl?: SafeFetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  limits?: Partial<typeof FEE_KNOWLEDGE_RETRIEVAL_LIMITS>;
  pdfParserForTesting?: (bytes: Uint8Array) => Promise<void>;
};

export async function retrieveFeeKnowledgeDocument(
  urlValue: string,
  options: RetrieveDocumentOptions,
): Promise<RetrievedDocument> {
  const limits = { ...FEE_KNOWLEDGE_RETRIEVAL_LIMITS, ...(options.limits ?? {}) };
  const fetchImpl = options.fetchImpl ?? fetch;
  let current = normalizeCandidateUrl(urlValue);
  if (!current.ok) {
    return unavailable(null, [], "safety_blocked", [current.reason], null, 0, null, retrievalDiagnostics({
      initialUrl: null,
      finalUrl: null,
      outcomeClass: outcomeClassForUrlPolicyReason(current.reason),
      reasonCodes: [current.reason],
      blockedAddressClass: blockedClassForUrlPolicyReason(current.reason),
    }));
  }
  const initialUrl = current.url;
  const redirectChain: string[] = [];

  for (let redirectCount = 0; redirectCount <= limits.maxRedirects; redirectCount += 1) {
    const safety = await assertSafeUrl(current.url, options.resolveHost, limits.allowedPorts);
    if (!safety.ok) {
      const retrievalStatus = safety.outcomeClass === "dns_resolution_failed" ? "failed" : "safety_blocked";
      return unavailable(current.url.href, redirectChain, retrievalStatus, [safety.reason], null, 0, null, retrievalDiagnostics({
        initialUrl,
        finalUrl: current.url,
        outcomeClass: safety.outcomeClass,
        reasonCodes: [safety.reason],
        blockedAddressClass: safety.blockedAddressClass,
        addresses: safety.addresses,
        redirectCount: redirectChain.length,
      }));
    }
    let response: Response;
    try {
      response = options.fetchImpl
        ? await fetchImpl(current.url.href, {
            method: "GET",
            redirect: "manual",
            signal: options.abortSignal,
            validatedIpAddresses: safety.addresses,
          } as RequestInit)
        : await pinnedHttpsFetch(current.url, safety.addresses, options.abortSignal);
    } catch (error) {
      const failure = classifyFetchFailure(error, options.abortSignal);
      return unavailable(current.url.href, redirectChain, failure.status, failure.reasonCodes, null, 0, null, retrievalDiagnostics({
        initialUrl,
        finalUrl: current.url,
        outcomeClass: failure.outcomeClass,
        reasonCodes: failure.reasonCodes,
        attemptedNetwork: true,
        addresses: safety.addresses,
        redirectCount: redirectChain.length,
      }));
    }
    const reportedAddress = response.headers.get("x-ratereveal-connected-address");
    if (reportedAddress && !safety.addresses.includes(reportedAddress)) {
      return unavailable(current.url.href, redirectChain, "safety_blocked", ["fee_knowledge_connection_target_unvalidated"], null, 0, null, retrievalDiagnostics({
        initialUrl,
        finalUrl: current.url,
        outcomeClass: "destination_policy_blocked",
        reasonCodes: ["fee_knowledge_connection_target_unvalidated"],
        attemptedNetwork: true,
        addresses: safety.addresses,
        redirectCount: redirectChain.length,
      }));
    }
    const location = response.headers.get("location");
    if (isRedirect(response.status) && location) {
      if (redirectCount === limits.maxRedirects) {
        return unavailable(current.url.href, redirectChain, "safety_blocked", ["fee_knowledge_redirect_limit_exceeded"], null, 0, null, retrievalDiagnostics({
          initialUrl,
          finalUrl: current.url,
          outcomeClass: "redirect_rejected",
          reasonCodes: ["fee_knowledge_redirect_limit_exceeded"],
          attemptedNetwork: true,
          addresses: safety.addresses,
          redirectCount: redirectChain.length,
          httpStatus: response.status,
        }));
      }
      const next = normalizeCandidateUrl(new URL(location, current.url).href);
      if (!next.ok) {
        return unavailable(current.url.href, redirectChain, "safety_blocked", [next.reason], null, 0, null, retrievalDiagnostics({
          initialUrl,
          finalUrl: current.url,
          outcomeClass: "redirect_rejected",
          reasonCodes: [next.reason],
          attemptedNetwork: true,
          addresses: safety.addresses,
          blockedAddressClass: blockedClassForUrlPolicyReason(next.reason),
          redirectCount: redirectChain.length,
          httpStatus: response.status,
        }));
      }
      redirectChain.push(current.url.href);
      current = next;
      continue;
    }
    if (!response.ok) return unavailable(current.url.href, redirectChain, "unavailable", [`fee_knowledge_http_${response.status}`], null, 0, null, retrievalDiagnostics({
      initialUrl,
      finalUrl: current.url,
      outcomeClass: "http_response_failed",
      reasonCodes: [`fee_knowledge_http_${response.status}`],
      attemptedNetwork: true,
      addresses: safety.addresses,
      redirectCount: redirectChain.length,
      httpStatus: response.status,
    }));
    const contentType = normalizedContentType(response.headers.get("content-type"));
    if (!contentType || !limits.allowedContentTypes.some((allowed) => contentType.startsWith(allowed))) {
      return unavailable(current.url.href, redirectChain, "unsupported_content_type", ["fee_knowledge_content_type_unsupported"], contentType, 0, null, retrievalDiagnostics({
        initialUrl,
        finalUrl: current.url,
        outcomeClass: "content_rejected",
        reasonCodes: ["fee_knowledge_content_type_unsupported"],
        attemptedNetwork: true,
        addresses: safety.addresses,
        redirectCount: redirectChain.length,
        httpStatus: response.status,
        contentType,
      }));
    }
    const declaredLength = numberHeader(response.headers.get("content-length"));
    const maxBytes = contentType.startsWith("application/pdf") ? limits.maxPdfBytes : limits.maxHtmlBytes;
    if (declaredLength !== null && declaredLength > maxBytes) {
      return unavailable(current.url.href, redirectChain, "oversized", ["fee_knowledge_content_length_oversized"], contentType, declaredLength, null, retrievalDiagnostics({
        initialUrl,
        finalUrl: current.url,
        outcomeClass: "size_limit_exceeded",
        reasonCodes: ["fee_knowledge_content_length_oversized"],
        attemptedNetwork: true,
        addresses: safety.addresses,
        redirectCount: redirectChain.length,
        httpStatus: response.status,
        contentType,
        byteLength: declaredLength,
      }));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return unavailable(current.url.href, redirectChain, "oversized", ["fee_knowledge_response_oversized"], contentType, bytes.byteLength, null, retrievalDiagnostics({
        initialUrl,
        finalUrl: current.url,
        outcomeClass: "size_limit_exceeded",
        reasonCodes: ["fee_knowledge_response_oversized"],
        attemptedNetwork: true,
        addresses: safety.addresses,
        redirectCount: redirectChain.length,
        httpStatus: response.status,
        contentType,
        byteLength: bytes.byteLength,
      }));
    }
    const fingerprint = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const diagnosticsBase = {
      initialUrl,
      finalUrl: current.url,
      attemptedNetwork: true,
      addresses: safety.addresses,
      redirectCount: redirectChain.length,
      httpStatus: response.status,
      contentType,
      byteLength: bytes.byteLength,
      documentFingerprint: fingerprint,
    };
    if (contentType.startsWith("application/pdf")) {
      return pdfDocument(current.url.href, redirectChain, contentType, bytes, fingerprint, options.pdfParserForTesting, diagnosticsBase);
    }
    return textDocument(current.url.href, redirectChain, contentType, bytes, fingerprint, diagnosticsBase);
  }
  return unavailable(current.url.href, redirectChain, "safety_blocked", ["fee_knowledge_redirect_loop"], null, 0, null, retrievalDiagnostics({
    initialUrl,
    finalUrl: current.url,
    outcomeClass: "redirect_rejected",
    reasonCodes: ["fee_knowledge_redirect_loop"],
    redirectCount: redirectChain.length,
  }));
}

export function validateClaimCitation(input: {
  document: RetrievedDocument;
  requiredText: string;
  locatorId?: string | null;
  expectedDocumentFingerprint?: string | null;
  expectedLocatorTextHash?: string | null;
}): { exists: boolean; locator: FeeKnowledgeEvidenceLocator | null; excerpt: string } {
  if (input.document.status !== "retrieved_text") return { exists: false, locator: null, excerpt: "" };
  if (input.expectedDocumentFingerprint && input.document.documentFingerprint !== input.expectedDocumentFingerprint) {
    return { exists: false, locator: null, excerpt: "" };
  }
  const required = normalizeSearchText(input.requiredText);
  if (!required) return { exists: false, locator: null, excerpt: "" };
  const locators = input.locatorId ? input.document.locators.filter((locator) => locator.locatorId === input.locatorId) : input.document.locators;
  for (const locator of locators) {
    if (input.expectedLocatorTextHash && locator.textHash !== input.expectedLocatorTextHash) continue;
    const excerpt = excerptForLocator(input.document.text, locator);
    if (normalizeSearchText(excerpt).includes(required)) {
      return { exists: true, locator, excerpt: safeExcerpt(excerpt) };
    }
  }
  if (input.locatorId || input.expectedLocatorTextHash) return { exists: false, locator: null, excerpt: "" };
  const index = normalizeSearchText(input.document.text).indexOf(required);
  if (index < 0) return { exists: false, locator: null, excerpt: "" };
  const locator = input.document.locators[0] ?? null;
  return { exists: true, locator, excerpt: safeExcerpt(input.document.text.slice(Math.max(0, index - 80), index + required.length + 80)) };
}

async function pdfDocument(
  canonicalUrl: string,
  redirectChain: string[],
  contentType: string,
  bytes: Uint8Array,
  fingerprint: string,
  parserForTesting?: (bytes: Uint8Array) => Promise<void>,
  diagnosticsBase?: RetrievalDiagnosticsInput,
): Promise<RetrievedDocument> {
  try {
    await parserForTesting?.(bytes);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: bytes });
    const pdf = await task.promise;
    const pageTexts: string[] = [];
    const locators: FeeKnowledgeEvidenceLocator[] = [];
    let offset = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item: unknown) => (typeof (item as { str?: unknown }).str === "string" ? (item as { str: string }).str : "")).join(" ");
      const clean = cleanText(text);
      if (clean) {
        const block = `Page ${pageNumber}\n${clean}`;
        if (pageTexts.length > 0) offset += 2;
        const start = offset;
        const end = start + block.length;
        pageTexts.push(block);
        locators.push({
          locatorId: `locator_${hash([canonicalUrl, String(pageNumber), clean.slice(0, 120)])}`,
          kind: "pdf_page",
          pageNumber,
          sectionLabel: null,
          paragraphIndex: null,
          tableIndex: null,
          rowIndex: null,
          textStart: start,
          textEnd: end,
          textHash: hash([clean]),
        });
        offset = end;
      }
    }
    const text = pageTexts.join("\n\n");
    if (!text.trim()) {
      return {
        type: "fee_knowledge_retrieved_document",
        policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
        status: "retrieval_succeeded_text_unavailable",
        canonicalUrl,
        redirectChain,
        contentType,
        byteLength: bytes.byteLength,
        documentFingerprint: fingerprint,
        title: null,
        text: "",
        locators: [],
        reasonCodes: ["fee_knowledge_pdf_text_unavailable"],
        safeDiagnostics: retrievalDiagnostics({
          ...diagnosticsBase,
          outcomeClass: "successful_retrieval_text_unavailable",
          reasonCodes: ["fee_knowledge_pdf_text_unavailable"],
        }),
      };
    }
    return {
      type: "fee_knowledge_retrieved_document",
      policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
      status: "retrieved_text",
      canonicalUrl,
      redirectChain,
      contentType,
      byteLength: bytes.byteLength,
      documentFingerprint: fingerprint,
      title: null,
      text,
      locators,
      reasonCodes: ["fee_knowledge_pdf_text_retrieved"],
      safeDiagnostics: retrievalDiagnostics({
        ...diagnosticsBase,
        outcomeClass: "successful_usable_retrieval",
        reasonCodes: ["fee_knowledge_pdf_text_retrieved"],
      }),
    };
  } catch (error) {
    const encrypted = /password|encrypted/i.test(String(error));
    return unavailable(
      canonicalUrl,
      redirectChain,
      encrypted ? "encrypted" : "malformed",
      [encrypted ? "fee_knowledge_pdf_encrypted" : "fee_knowledge_pdf_parse_failed"],
      contentType,
      bytes.byteLength,
      fingerprint,
      retrievalDiagnostics({
        ...diagnosticsBase,
        outcomeClass: "extraction_failed",
        reasonCodes: [encrypted ? "fee_knowledge_pdf_encrypted" : "fee_knowledge_pdf_parse_failed"],
      }),
    );
  }
}

function textDocument(
  canonicalUrl: string,
  redirectChain: string[],
  contentType: string,
  bytes: Uint8Array,
  fingerprint: string,
  diagnosticsBase?: RetrievalDiagnosticsInput,
): RetrievedDocument {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const title = titleFromHtml(raw);
  const located = contentType.startsWith("text/plain") ? plainTextBlocks(raw, canonicalUrl) : htmlLocatedBlocks(raw, canonicalUrl);
  const text = located.text;
  const locators = located.locators;
  if (!text.trim()) {
    return {
      type: "fee_knowledge_retrieved_document",
      policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
      status: "retrieval_succeeded_text_unavailable",
      canonicalUrl,
      redirectChain,
      contentType,
      byteLength: bytes.byteLength,
      documentFingerprint: fingerprint,
      title,
      text: "",
      locators: [],
      reasonCodes: ["fee_knowledge_text_unavailable"],
      safeDiagnostics: retrievalDiagnostics({
        ...diagnosticsBase,
        outcomeClass: "successful_retrieval_text_unavailable",
        reasonCodes: ["fee_knowledge_text_unavailable"],
      }),
    };
  }
  return {
    type: "fee_knowledge_retrieved_document",
    policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
    status: "retrieved_text",
    canonicalUrl,
    redirectChain,
    contentType,
    byteLength: bytes.byteLength,
    documentFingerprint: fingerprint,
    title,
    text,
    locators,
    reasonCodes: ["fee_knowledge_text_retrieved"],
    safeDiagnostics: retrievalDiagnostics({
      ...diagnosticsBase,
      outcomeClass: "successful_usable_retrieval",
      reasonCodes: ["fee_knowledge_text_retrieved"],
    }),
  };
}

function unavailable(
  canonicalUrl: string | null,
  redirectChain: string[],
  status: FeeKnowledgeRetrievalStatus,
  reasonCodes: string[],
  contentType: string | null = null,
  byteLength = 0,
  documentFingerprint: string | null = null,
  safeDiagnostics?: FeeKnowledgeRetrievalSafeDiagnostics,
): RetrievedDocument {
  const sortedReasons = [...new Set(reasonCodes)].sort();
  return {
    type: "fee_knowledge_retrieved_document",
    policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
    status,
    canonicalUrl,
    redirectChain,
    contentType,
    byteLength,
    documentFingerprint,
    title: null,
    text: "",
    locators: [],
    reasonCodes: sortedReasons,
    safeDiagnostics: safeDiagnostics ?? retrievalDiagnostics({
      initialUrl: canonicalUrl ? new URL(canonicalUrl) : null,
      finalUrl: canonicalUrl ? new URL(canonicalUrl) : null,
      outcomeClass: status === "timed_out" ? "watchdog_timeout"
        : status === "unavailable" ? "http_response_failed"
          : status === "unsupported_content_type" ? "content_rejected"
            : status === "oversized" ? "size_limit_exceeded"
              : status === "malformed" || status === "encrypted" ? "extraction_failed"
                : status === "safety_blocked" ? "destination_policy_blocked"
                  : "unknown_transport_failure",
      reasonCodes: sortedReasons,
      redirectCount: redirectChain.length,
      contentType,
      byteLength,
      documentFingerprint,
    }),
  };
}

function normalizeCandidateUrl(value: string): { ok: true; url: URL } | { ok: false; reason: string } {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return { ok: false, reason: "fee_knowledge_url_scheme_unsafe" };
    if (url.username || url.password) return { ok: false, reason: "fee_knowledge_url_credentials_unsafe" };
    if (!url.hostname) return { ok: false, reason: "fee_knowledge_url_host_missing" };
    if (url.port && url.port !== "443") return { ok: false, reason: "fee_knowledge_url_port_unsafe" };
    url.hash = "";
    return { ok: true, url };
  } catch {
    return { ok: false, reason: "fee_knowledge_url_invalid" };
  }
}

async function assertSafeUrl(
  url: URL,
  resolveHost: RetrieveDocumentOptions["resolveHost"],
  allowedPorts: readonly number[],
): Promise<{ ok: true; addresses: string[] } | {
  ok: false;
  reason: string;
  outcomeClass: FeeKnowledgeRetrievalSafeDiagnostics["outcomeClass"];
  blockedAddressClass: FeeKnowledgeRetrievalSafeDiagnostics["blockedAddressClass"];
  addresses?: string[];
}> {
  if (url.protocol !== "https:") return { ok: false, reason: "fee_knowledge_url_scheme_unsafe", outcomeClass: "destination_policy_blocked", blockedAddressClass: "unsafe_scheme" };
  const port = url.port ? Number(url.port) : 443;
  if (!allowedPorts.includes(port)) return { ok: false, reason: "fee_knowledge_url_port_unsafe", outcomeClass: "destination_policy_blocked", blockedAddressClass: "unsafe_port" };
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) return { ok: false, reason: "fee_knowledge_url_private_host", outcomeClass: "destination_policy_blocked", blockedAddressClass: "unsafe_host" };
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await (resolveHost ? resolveHost(hostname) : defaultResolve(hostname));
  } catch {
    return { ok: false, reason: "fee_knowledge_retrieval_dns_resolution_failed", outcomeClass: "dns_resolution_failed", blockedAddressClass: null };
  }
  if (addresses.length === 0) return { ok: false, reason: "fee_knowledge_retrieval_dns_empty", outcomeClass: "dns_resolution_failed", blockedAddressClass: null, addresses };
  if (addresses.some((address) => privateAddress(address))) return { ok: false, reason: "fee_knowledge_url_private_ip", outcomeClass: "destination_policy_blocked", blockedAddressClass: "private_or_reserved", addresses };
  return { ok: true, addresses };
}

async function pinnedHttpsFetch(url: URL, validatedAddresses: readonly string[], abortSignal: AbortSignal): Promise<Response> {
  if (validatedAddresses.length === 0) throw new Error("fee_knowledge_validated_address_missing");
  const selectedAddress = validatedAddresses[0]!;
  const family = isIP(selectedAddress);
  if (family !== 4 && family !== 6) throw new Error("fee_knowledge_validated_address_invalid");
  return await new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        servername: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { accept: "text/html, text/plain, application/pdf;q=0.9, */*;q=0.1" },
        lookup: (_hostname, options, callback) => {
          if ((options as { all?: boolean }).all) {
            callback(null, [{ address: selectedAddress, family }] as never, family);
            return;
          }
          callback(null, selectedAddress, family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) headers.set(key, value.join(", "));
            else if (value !== undefined) headers.set(key, String(value));
          }
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0, headers }));
        });
      },
    );
    const abort = () => req.destroy(new Error("fee_knowledge_retrieval_aborted"));
    if (abortSignal.aborted) abort();
    else abortSignal.addEventListener("abort", abort, { once: true });
    req.on("error", reject);
    req.on("close", () => abortSignal.removeEventListener("abort", abort));
    req.end();
  });
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: false });
  return results.map((result) => result.address);
}

function privateAddress(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower.startsWith("ff") ||
      lower.startsWith("2001:db8:")
    );
  }
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  const c = parts[2]!;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 18) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a === 0 ||
    a >= 224
  );
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function normalizedContentType(value: string | null): string | null {
  return value?.split(";")[0]?.trim().toLowerCase() ?? null;
}

function numberHeader(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function titleFromHtml(value: string): string | null {
  const title = /<title[^>]*>([\s\S]{1,240}?)<\/title>/i.exec(value)?.[1] ?? null;
  return title ? cleanText(stripTags(title)).slice(0, 160) : null;
}

function plainTextBlocks(value: string, canonicalUrl: string): { text: string; locators: FeeKnowledgeEvidenceLocator[] } {
  const blocks = cleanText(value).split(/\n{2,}/).filter((block) => block.length >= 8).slice(0, 240);
  return locatedBlocks(canonicalUrl, blocks.map((text, index) => ({ text, kind: "plain_text" as const, sectionLabel: null, paragraphIndex: index, tableIndex: null, rowIndex: null })));
}

function htmlLocatedBlocks(value: string, canonicalUrl: string): { text: string; locators: FeeKnowledgeEvidenceLocator[] } {
  const html = value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const blocks: Array<{
    text: string;
    kind: FeeKnowledgeEvidenceLocator["kind"];
    sectionLabel: string | null;
    paragraphIndex: number | null;
    tableIndex: number | null;
    rowIndex: number | null;
  }> = [];
  const headings: string[] = [];
  let paragraphIndex = 0;
  let tableIndex = 0;
  const tableRanges: Array<[number, number]> = [];
  for (const tableMatch of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const start = tableMatch.index ?? -1;
    if (start >= 0) tableRanges.push([start, start + tableMatch[0].length]);
    let rowIndex = 0;
    for (const rowMatch of tableMatch[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const clean = cleanText(stripTags(rowMatch[0]));
      if (clean.length >= 8) blocks.push({ text: clean, kind: "html_table", sectionLabel: headings.join(" > ") || null, paragraphIndex: null, tableIndex, rowIndex });
      rowIndex += 1;
    }
    tableIndex += 1;
  }
  const tokenPattern = /<(h[1-6]|p|li|div)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(tokenPattern)) {
    const start = match.index ?? -1;
    if (tableRanges.some(([left, right]) => start >= left && start < right)) continue;
    const tag = match[1]!.toLowerCase();
    const clean = cleanText(stripTags(match[2] ?? ""));
    if (clean.length < 8) continue;
    if (tag.startsWith("h")) {
      headings.splice(Number(tag[1]) - 1);
      headings.push(clean.slice(0, 120));
      blocks.push({ text: clean, kind: "html_heading", sectionLabel: headings.join(" > "), paragraphIndex: null, tableIndex: null, rowIndex: null });
    } else {
      blocks.push({ text: clean, kind: "html_paragraph", sectionLabel: headings.join(" > ") || null, paragraphIndex, tableIndex: null, rowIndex: null });
      paragraphIndex += 1;
    }
  }
  if (blocks.length === 0) {
    return plainTextBlocks(stripTags(html), canonicalUrl);
  }
  return locatedBlocks(canonicalUrl, blocks.slice(0, 240));
}

function locatedBlocks(
  canonicalUrl: string,
  blocks: Array<{
    text: string;
    kind: FeeKnowledgeEvidenceLocator["kind"];
    sectionLabel: string | null;
    paragraphIndex: number | null;
    tableIndex: number | null;
    rowIndex: number | null;
  }>,
): { text: string; locators: FeeKnowledgeEvidenceLocator[] } {
  const out: string[] = [];
  const locators: FeeKnowledgeEvidenceLocator[] = [];
  let offset = 0;
  for (const [index, block] of blocks.entries()) {
    const safe = safeExcerpt(block.text, 1200);
    if (!safe) continue;
    if (out.length > 0) offset += 2;
    const start = offset;
    const end = start + safe.length;
    out.push(safe);
    offset = end;
    locators.push({
      locatorId: `locator_${hash([canonicalUrl, String(index), safe.slice(0, 120)])}`,
      kind: block.kind,
      pageNumber: null,
      sectionLabel: block.sectionLabel,
      paragraphIndex: block.paragraphIndex,
      tableIndex: block.tableIndex,
      rowIndex: block.rowIndex,
      textStart: start,
      textEnd: end,
      textHash: hash([safe]),
    });
  }
  return { text: out.join("\n\n"), locators };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function cleanText(value: string): string {
  return value.replace(/[\r\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return cleanText(value).toLowerCase();
}

function excerptForLocator(text: string, locator: FeeKnowledgeEvidenceLocator): string {
  const blocks = text.split(/\n{2,}/);
  if (locator.paragraphIndex !== null) return blocks[locator.paragraphIndex] ?? "";
  if (locator.pageNumber !== null) {
    return blocks.find((block) => block.startsWith(`Page ${locator.pageNumber}\n`)) ?? "";
  }
  return text;
}

function safeExcerpt(value: string, maxLength = 360): string {
  return cleanText(value)
    .replace(/(?:api.?key|raw prompt|raw response|merchant account|account number|\/Users\/|\/private\/)[^ ]*/gi, "[redacted]")
    .slice(0, maxLength);
}

function hash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}

type RetrievalDiagnosticsInput = {
  initialUrl?: URL | null;
  finalUrl?: URL | null;
  outcomeClass?: FeeKnowledgeRetrievalSafeDiagnostics["outcomeClass"];
  reasonCodes?: readonly string[];
  attemptedNetwork?: boolean;
  addresses?: readonly string[];
  blockedAddressClass?: FeeKnowledgeRetrievalSafeDiagnostics["blockedAddressClass"];
  redirectCount?: number;
  httpStatus?: number | null;
  contentType?: string | null;
  byteLength?: number;
  documentFingerprint?: string | null;
};

function classifyFetchFailure(
  error: unknown,
  abortSignal: AbortSignal,
): {
  status: "failed" | "timed_out";
  outcomeClass: FeeKnowledgeRetrievalSafeDiagnostics["outcomeClass"];
  reasonCodes: string[];
} {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : String(error);
  if (abortSignal.aborted || /abort|timeout|timed out/i.test(message) || ["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return {
      status: "timed_out",
      outcomeClass: "watchdog_timeout",
      reasonCodes: ["fee_knowledge_retrieval_aborted", "fee_knowledge_retrieval_timed_out", "fee_knowledge_retrieval_watchdog_timed_out"],
    };
  }
  if (/certificate|tls|ssl/i.test(message) || code.startsWith("CERT_") || ["DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code)) {
    return {
      status: "failed",
      outcomeClass: "tls_failed",
      reasonCodes: ["fee_knowledge_retrieval_fetch_failed", "fee_knowledge_retrieval_tls_failed"],
    };
  }
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EPIPE"].includes(code)) {
    return {
      status: "failed",
      outcomeClass: "connection_failed",
      reasonCodes: ["fee_knowledge_retrieval_connection_failed", "fee_knowledge_retrieval_fetch_failed"],
    };
  }
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return {
      status: "failed",
      outcomeClass: "dns_resolution_failed",
      reasonCodes: ["fee_knowledge_retrieval_dns_resolution_failed", "fee_knowledge_retrieval_fetch_failed"],
    };
  }
  return {
    status: "failed",
    outcomeClass: "unknown_transport_failure",
    reasonCodes: ["fee_knowledge_retrieval_fetch_failed"],
  };
}

function retrievalDiagnostics(input: RetrievalDiagnosticsInput): FeeKnowledgeRetrievalSafeDiagnostics {
  const reasonCodes = [...new Set(input.reasonCodes ?? ["fee_knowledge_retrieval_fetch_failed"])].sort();
  const source = input.initialUrl ?? null;
  const final = input.finalUrl ?? input.initialUrl ?? null;
  const addresses = input.addresses ?? [];
  return {
    policyVersion: FEE_KNOWLEDGE_RETRIEVAL_POLICY_VERSION,
    outcomeClass: input.outcomeClass ?? "unknown_transport_failure",
    reasonCodes,
    sourceDomain: safeSourceDomain(source),
    finalSourceDomain: safeSourceDomain(final),
    sourceOriginHash: source ? originHash(source) : null,
    finalSourceOriginHash: final ? originHash(final) : null,
    sourceHostnameHash: source ? hostnameHash(source.hostname) : null,
    finalSourceHostnameHash: final ? hostnameHash(final.hostname) : null,
    protocol: source?.protocol === "https:" ? "https" : null,
    finalProtocol: final?.protocol === "https:" ? "https" : null,
    redirectCount: Math.max(0, input.redirectCount ?? 0),
    attemptedNetwork: input.attemptedNetwork ?? false,
    resolvedAddressCount: addresses.length > 0 ? addresses.length : null,
    resolvedAddressFamilies: [...new Set(addresses.map((address) => isIP(address) === 6 ? "ipv6" as const : "ipv4" as const))].sort(),
    blockedAddressClass: input.blockedAddressClass ?? null,
    httpStatus: input.httpStatus ?? null,
    contentType: input.contentType ?? null,
    byteLength: Math.max(0, input.byteLength ?? 0),
    documentFingerprint: input.documentFingerprint ?? null,
  };
}

function outcomeClassForUrlPolicyReason(reason: string): FeeKnowledgeRetrievalSafeDiagnostics["outcomeClass"] {
  return reason === "fee_knowledge_url_invalid" ? "destination_policy_blocked" : "destination_policy_blocked";
}

function blockedClassForUrlPolicyReason(reason: string): FeeKnowledgeRetrievalSafeDiagnostics["blockedAddressClass"] {
  if (reason === "fee_knowledge_url_invalid") return "invalid_url";
  if (reason === "fee_knowledge_url_scheme_unsafe") return "unsafe_scheme";
  if (reason === "fee_knowledge_url_credentials_unsafe") return "credentials";
  if (reason === "fee_knowledge_url_host_missing") return "missing_host";
  if (reason === "fee_knowledge_url_port_unsafe") return "unsafe_port";
  if (reason === "fee_knowledge_url_private_host") return "unsafe_host";
  if (reason === "fee_knowledge_url_private_ip") return "private_or_reserved";
  return null;
}

function safeSourceDomain(url: URL | null): string | null {
  if (!url || url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || isIP(hostname)) return null;
  if (!/^[a-z0-9.-]{3,253}$/.test(hostname) || hostname.includes("..")) return null;
  return hostname;
}

function originHash(url: URL): string {
  const port = url.port ? `:${url.port}` : "";
  return `sha256:${createHash("sha256").update(`${url.protocol}//${url.hostname.toLowerCase()}${port}`).digest("hex")}`;
}

function hostnameHash(hostname: string): string {
  return `sha256:${createHash("sha256").update(hostname.toLowerCase()).digest("hex")}`;
}
