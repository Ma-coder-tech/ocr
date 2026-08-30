import { isCanonicalCode, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { ProviderSafeQuestionContextV1 } from "./intelligenceTypes.js";
import { registeredObservationSubjectIdentity } from "./observationSubjectRegistry.js";

const FORBIDDEN_KEY = /(?:tenant|account|merchant|filename|file_path|source_path|private_locator|private_evidence|statement_total|transaction_amount|fee_inventory|originatingCanonicalRefs|occurrenceRefs|evidenceRefs|(?:^|_)mid(?:$|_))/i;
const FORBIDDEN_STRING = /(?:\b(?:mid|merchant\s*(?:id|number)|account\s*(?:id|number))\b|(?:^|[\\/])(?:Users|home|private|tmp)[\\/]|[A-Za-z]:\\|\.pdf\b|\b\d{6,}\b|\$\s*\d)/i;

export type ProviderPrivacyInspection = { valid: boolean; reasonCodes: string[] };

export function inspectProviderSafeQuestionContext(context: ProviderSafeQuestionContextV1): ProviderPrivacyInspection {
  const reasons: string[] = [];
  if (context.schemaVersion !== "provider_safe_question_context_v1" || context.allowedContext !== "public_product_terminology_only") {
    reasons.push("provider_context_schema_invalid");
  }
  if (!isSafeStructuredString(context.providerContextId) || !/^provider-context-[0-9a-f-]{36}$/.test(context.providerContextId) || !isCanonicalCode(context.questionClass)
    || !isCanonicalCode(context.claimType) || !isCanonicalCode(context.subjectCode)) reasons.push("provider_context_identity_invalid");
  if (!registeredObservationSubjectIdentity(context)) reasons.push("provider_research_label_not_registered");
  if (!/^\d{4}$/.test(context.periodYear)) reasons.push("provider_period_invalid");
  if (context.processorProgram !== null && !isCanonicalCode(context.processorProgram)) reasons.push("provider_program_invalid");
  visit(context, reasons);
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export type ProviderOutboundPacketV1 = {
  provider: "openrouter_web_search" | "openai_responses_api";
  url: string;
  method: "GET" | "POST";
  headerNames: string[];
  body: string | null;
};

export function inspectProviderOutboundPacket(packet: ProviderOutboundPacketV1): ProviderPrivacyInspection {
  const reasons: string[] = [];
  let url: URL;
  try { url = new URL(packet.url); } catch { return { valid: false, reasonCodes: ["provider_packet_url_invalid"] }; }
  if (url.protocol !== "https:" || url.username || url.password) reasons.push("provider_packet_url_unsafe");
  if (packet.headerNames.some((name) => !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name))) reasons.push("provider_packet_header_invalid");
  for (const [key, value] of url.searchParams) { visit(key, reasons, key); visit(value, reasons, key); }
  if (packet.body !== null) {
    if (Buffer.byteLength(packet.body, "utf8") > 1_500_000) reasons.push("provider_packet_body_oversized");
    try { visit(JSON.parse(packet.body), reasons); } catch { reasons.push("provider_packet_body_invalid_json"); }
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export function assertProviderOutboundPacketSafe(packet: ProviderOutboundPacketV1): void {
  const result = inspectProviderOutboundPacket(packet);
  if (!result.valid) throw new Error(`provider_private_payload_blocked:${result.reasonCodes.join(",")}`);
}

export function assertApprovedAiOutboundPacketSafe(packet: ProviderOutboundPacketV1): void {
  const result = inspectApprovedAiOutboundPacket(packet);
  if (!result.valid) throw new Error(`approved_ai_payload_blocked:${result.reasonCodes.join(".")}`);
}

export function inspectApprovedAiOutboundPacket(packet: ProviderOutboundPacketV1): ProviderPrivacyInspection {
  const reasons: string[] = [];
  let url: URL;
  try { url = new URL(packet.url); } catch { return { valid: false, reasonCodes: ["approved_ai_packet_url_invalid"] }; }
  if (url.protocol !== "https:" || url.username || url.password || packet.method !== "POST") reasons.push("approved_ai_packet_transport_unsafe");
  if (packet.headerNames.some((name) => !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name))) reasons.push("approved_ai_packet_header_invalid");
  if (packet.body === null || Buffer.byteLength(packet.body, "utf8") > 2_500_000) reasons.push("approved_ai_packet_body_invalid");
  if (packet.body !== null) {
    try {
      const parsed = JSON.parse(packet.body) as unknown;
      reasons.push(...inspectCredentialMaterial(parsed).reasonCodes);
    } catch { reasons.push("approved_ai_packet_body_invalid"); }
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export function inspectCredentialMaterial(value: unknown): ProviderPrivacyInspection {
  const reasons: string[] = [];
  inspectApprovedAiCredentialMaterial(value, reasons);
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)].sort() };
}

export function assertProviderSafeQuestionContext(context: ProviderSafeQuestionContextV1): void {
  const result = inspectProviderSafeQuestionContext(context);
  if (!result.valid) throw new Error(`provider_private_payload_blocked:${result.reasonCodes.join(",")}`);
}

export function sanitizePublicDocumentTextForProvider(value: string): string {
  return value
    .replace(/\$\s*-?\d[\d,]*(?:\.\d+)?/g, "[public_sample_amount]")
    .replace(/\b(?:merchant|account)\s*(?:id|number)\b/gi, "public sample identifier")
    .replace(/\bMID\b/g, "public sample identifier")
    .replace(/\b\d{6,}\b/g, "[public_sample_number]");
}

function visit(value: unknown, reasons: string[], key = ""): void {
  if (FORBIDDEN_KEY.test(key)) reasons.push("provider_forbidden_private_key");
  const opaqueProviderId = typeof value === "string"
    && ((key === "providerContextId" && /^provider-context-[0-9a-f-]{36}$/.test(value))
      || (key === "providerRequestId" && /^provider-request-[0-9a-f-]{36}$/.test(value)));
  if (typeof value === "string" && !opaqueProviderId) {
    let inspectedAsJson = false;
    if (/^\s*[\[{]/.test(value)) {
      try { visit(JSON.parse(value), reasons, key); inspectedAsJson = true; } catch { /* ordinary public text */ }
    }
    if (!inspectedAsJson) inspectString(value, reasons);
  }
  if (Array.isArray(value)) value.forEach((item) => visit(item, reasons, key));
  else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => visit(child, reasons, childKey));
}

function inspectString(value: string, reasons: string[]): void {
  const variants = new Set([value]);
  try { variants.add(decodeURIComponent(value)); } catch { /* malformed encoding is inspected literally */ }
  if (/^[A-Za-z0-9+/]{24,}={0,2}$/.test(value) && value.length % 4 === 0) {
    try { variants.add(Buffer.from(value, "base64").toString("utf8")); } catch { /* invalid base64 */ }
  }
  if ([...variants].some((variant) => FORBIDDEN_STRING.test(variant) || /(?:statement[_ -]?total|transaction[_ -]?amount|fee[_ -]?inventory|private[_ -]?(?:locator|evidence))/i.test(variant))) {
    reasons.push("provider_forbidden_private_value");
  }
}

const CREDENTIAL_KEY = /(?:^|_)(?:api_?key|access_?token|refresh_?token|auth_?token|authorization|password|passwd|secret_?key|client_?secret|private_?key)$/i;
const AUTHORIZATION_KEY = /(?:^|_)authorization$/i;
const PASSWORD_KEY = /(?:^|_)(?:password|passwd)$/i;
const TOKEN_KEY = /(?:^|_)(?:access_?token|refresh_?token|auth_?token)$/i;
const API_KEY = /\b(?:sk-or-v1-|sk-proj-|sk-)[A-Za-z0-9_-]{16,}\b/;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/;
const OTHER_KNOWN_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,})\b/;
const BEARER_OR_BASIC = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]{12,}={0,2}\b/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i;
const CREDENTIAL_ASSIGNMENT = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|password|passwd|secret[_-]?key|client[_-]?secret)\s*[:=]\s*["']?([^\s,"'}]{6,})/i;

function inspectApprovedAiCredentialMaterial(value: unknown, reasons: string[], key = "", depth = 0): void {
  if (depth > 16) {
    reasons.push("approved_ai_packet_structure_depth_invalid");
    return;
  }
  if (typeof value === "string") {
    for (const candidate of decodedCredentialCandidates(value)) {
      const reason = credentialMaterialReason(candidate, key);
      if (reason) reasons.push(reason);
      if (/^\s*[\[{]/.test(candidate)) {
        try { inspectApprovedAiCredentialMaterial(JSON.parse(candidate), reasons, key, depth + 1); }
        catch { /* Public document prose may begin with punctuation. */ }
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => inspectApprovedAiCredentialMaterial(item, reasons, key, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>)
      .forEach(([childKey, child]) => inspectApprovedAiCredentialMaterial(child, reasons, normalizedCredentialKey(childKey), depth + 1));
  }
}

function decodedCredentialCandidates(value: string): string[] {
  const candidates = new Set([value]);
  try { candidates.add(decodeURIComponent(value)); } catch { /* Inspect malformed encoding literally. */ }
  if (/^[A-Za-z0-9+/]{24,}={0,2}$/.test(value) && value.length % 4 === 0) {
    try { candidates.add(Buffer.from(value, "base64").toString("utf8")); } catch { /* Inspect invalid base64 literally. */ }
  }
  return [...candidates];
}

function credentialMaterialReason(value: string, key: string): string | null {
  if (PRIVATE_KEY.test(value)) return "approved_ai_packet_private_key_material_forbidden";
  if (API_KEY.test(value) || AWS_ACCESS_KEY.test(value) || OTHER_KNOWN_TOKEN.test(value)) {
    return "approved_ai_packet_api_key_material_forbidden";
  }
  if (BEARER_OR_BASIC.test(value)) return "approved_ai_packet_authorization_material_forbidden";
  if (JWT.test(value)) return "approved_ai_packet_token_material_forbidden";
  const assignment = CREDENTIAL_ASSIGNMENT.exec(value);
  if (assignment && assignmentValueLooksLikeMaterial(assignment[1]!, assignment[2]!)) {
    return "approved_ai_packet_credential_assignment_forbidden";
  }
  if (!CREDENTIAL_KEY.test(key) || credentialPlaceholder(value)) return null;
  if (AUTHORIZATION_KEY.test(key)) {
    return /^(?:Bearer|Basic)\s+\S+/i.test(value.trim())
      ? "approved_ai_packet_authorization_material_forbidden" : null;
  }
  if (PASSWORD_KEY.test(key)) {
    return credentialFieldLooksLikeMaterial(value)
      ? "approved_ai_packet_password_material_forbidden" : null;
  }
  if (TOKEN_KEY.test(key)) {
    return credentialFieldLooksLikeMaterial(value)
      ? "approved_ai_packet_token_material_forbidden" : null;
  }
  return credentialFieldLooksLikeMaterial(value)
    ? "approved_ai_packet_api_key_material_forbidden" : null;
}

function normalizedCredentialKey(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[ -]+/g, "_").toLowerCase();
}

function credentialPlaceholder(value: string): boolean {
  return /^(?:\[?(?:redacted|removed|masked|not[_ -]?provided|none|null|example|placeholder)\]?|\*{3,}|x{6,})$/i.test(value.trim());
}

function credentialFieldLooksLikeMaterial(value: string): boolean {
  const candidate = value.trim();
  return candidate.length > 0;
}

function assignmentValueLooksLikeMaterial(kind: string, value: string): boolean {
  if (credentialPlaceholder(value)) return false;
  if (/password|passwd/i.test(kind)) return value.length >= 6 && /(?:\d|[^A-Za-z])/i.test(value);
  return value.length >= 12 && /(?:\d|[_\-.])/i.test(value);
}

export function providerSafeScope(scope: Record<string, unknown>): Record<string, string | null> {
  const allowed = ["processor", "processorProgram", "network", "region", "jurisdiction"] as const;
  return Object.fromEntries(allowed.map((key) => [key, typeof scope[key] === "string" && isCanonicalCode(scope[key] as string) ? scope[key] : null]));
}
