import { isCanonicalCode, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { ProviderSafeQuestionContextV1 } from "./intelligenceTypes.js";

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
  if (!/^(?:application fee|non swiped discount)$/.test(context.safeResearchLabel)) reasons.push("provider_research_label_not_registered");
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

export function assertProviderSafeQuestionContext(context: ProviderSafeQuestionContextV1): void {
  const result = inspectProviderSafeQuestionContext(context);
  if (!result.valid) throw new Error(`provider_private_payload_blocked:${result.reasonCodes.join(",")}`);
}

function visit(value: unknown, reasons: string[], key = ""): void {
  if (FORBIDDEN_KEY.test(key)) reasons.push("provider_forbidden_private_key");
  const opaqueProviderId = typeof value === "string"
    && ((key === "providerContextId" && /^provider-context-[0-9a-f-]{36}$/.test(value))
      || (key === "providerRequestId" && /^provider-request-[0-9a-f-]{36}$/.test(value)));
  if (typeof value === "string" && !opaqueProviderId) {
    inspectString(value, reasons);
    if (/^\s*[\[{]/.test(value)) { try { visit(JSON.parse(value), reasons, key); } catch { /* ordinary public text */ } }
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

export function providerSafeScope(scope: Record<string, unknown>): Record<string, string | null> {
  const allowed = ["processor", "processorProgram", "network", "region", "jurisdiction"] as const;
  return Object.fromEntries(allowed.map((key) => [key, typeof scope[key] === "string" && isCanonicalCode(scope[key] as string) ? scope[key] : null]));
}
