import { createHash } from "node:crypto";

import {
  inspectShadowAiProviderBoundRequestPrivacyV1,
  type ShadowAiProviderReferenceMapV1,
} from "../canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import {
  SHADOW_AI_EVIDENCE_CLASSES,
  type ShadowAiEconomicResolutionPacketV1,
} from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "./openRouterIssueGroundedShadowPlannerV1.js";
import { createSyntheticFullPlannerPacketV1 } from "./openRouterFullPlannerSchemaPreflightV1.js";
import type { OpenRouterClaudePreflightRequestV2 } from "./openRouterClaudeStructuredOutputPreflightV2.js";
import {
  buildHistoricalFullSyntheticTypedPatternVariantV1,
} from "./plannerRequestShapeForensicDifferentialV1.js";

const MISSING = Symbol("missing");

export type DifferentialClassificationV1 = "UNCHANGED" | "CHANGED" | "SYNTHETIC_ONLY" | "REAL_ONLY";

export function reconstructRealVsSyntheticPlannerRequestsV1(realPacket: ShadowAiEconomicResolutionPacketV1) {
  return Object.freeze({
    syntheticCall3: buildHistoricalFullSyntheticTypedPatternVariantV1(createSyntheticFullPlannerPacketV1()),
    realAuthorization: buildOpenRouterIssueGroundedShadowPlannerRequestV1("offline-placeholder-never-transmitted", realPacket),
  });
}

export function safeRequestComparisonViewV1(request: OpenRouterClaudePreflightRequestV2): Readonly<Record<string, unknown>> {
  const body = JSON.parse(request.body) as Record<string, any>;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return deepFreeze({
    endpoint: request.endpoint,
    method: request.method,
    headerNames: Object.keys(request.headers).sort(),
    body: {
      model: body.model,
      store: body.store,
      stream: body.stream,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      provider: body.provider,
      messages: messages.map((message: any, index: number) => ({
        role: message.role,
        content: index === 1
          ? { statistics: stringStatistics(String(message.content)), parsed: safePayloadProjection(parseJson(message.content)) }
          : { statistics: stringStatistics(String(message.content)) },
      })),
      response_format: body.response_format,
    },
  });
}

export function pathLevelDifferentialV1(
  syntheticView: Readonly<Record<string, unknown>>,
  realView: Readonly<Record<string, unknown>>,
): readonly Readonly<{ path: string; classification: DifferentialClassificationV1; synthetic: unknown; real: unknown }>[] {
  const rows: Array<{ path: string; classification: DifferentialClassificationV1; synthetic: unknown; real: unknown }> = [];
  compareProjected(syntheticView, realView, "$", rows);
  return deepFreeze(rows.sort((left, right) => left.path.localeCompare(right.path)));
}

export function validateRealAuthorizationRequestConsistencyV1(
  request: ReturnType<typeof buildOpenRouterIssueGroundedShadowPlannerRequestV1>,
  internalPacket: ShadowAiEconomicResolutionPacketV1,
) {
  const body = JSON.parse(request.body) as Record<string, any>;
  const payload = JSON.parse(body.messages[1].content) as { issueContext: Record<string, unknown>; packet: ShadowAiEconomicResolutionPacketV1 };
  const providerPacket = payload.packet;
  const issuePattern = body.response_format.json_schema.schema.properties.issueId.pattern as string;
  const inputHashPattern = body.response_format.json_schema.schema.properties.inputHash.pattern as string;
  const factPattern = body.response_format.json_schema.schema.properties.exactCitedFactRefs.items.pattern as string;
  const supportPattern = body.response_format.json_schema.schema.properties.primaryHypothesis.properties.supportingFactRefs.items.pattern as string;
  const schemaEvidenceClasses = body.response_format.json_schema.schema.properties.requiredEvidenceClasses.items.enum as string[];
  const aliases = request.referenceMap.entries;
  const aliasTokens = aliases.map((entry) => entry.alias);
  const factAliases = aliases.filter((entry) => entry.referenceClass === "FACT").map((entry) => entry.alias);
  const supportAliases = aliases.filter((entry) => entry.referenceClass !== "STATEMENT_EVIDENCE").map((entry) => entry.alias);
  const packetPrivacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(providerPacket);
  const outboundPrivacy = inspectShadowAiProviderBoundRequestPrivacyV1(request.body, request.referenceMap);
  const checks = {
    requestJsonParses: true,
    providerSchemaObjectPresent: isRecord(body.response_format?.json_schema?.schema),
    packetPrivacyValid: packetPrivacy.valid,
    outboundReferencePrivacyValid: outboundPrivacy.valid,
    issueContextMatchesProviderPacket: payload.issueContext.issueId === providerPacket.issueId,
    referenceMapIssueBindingMatches: request.referenceMap.issueId === internalPacket.issueId && providerPacket.issueId === internalPacket.issueId,
    referenceMapInputHashBindingMatches: request.referenceMap.providerInputHash === providerPacket.immutableInputHash,
    issueIdMatchesProviderPattern: new RegExp(issuePattern).test(providerPacket.issueId),
    inputHashMatchesProviderPattern: new RegExp(inputHashPattern).test(providerPacket.immutableInputHash),
    aliasesUnique: new Set(aliasTokens).size === aliasTokens.length,
    allFactAliasesMatchFactPattern: factAliases.every((alias) => new RegExp(factPattern).test(alias)),
    allOutputSupportAliasesMatchSupportPattern: supportAliases.every((alias) => new RegExp(supportPattern).test(alias)),
    aliasOrdinalsPositiveAndContiguousPerClass: aliasOrdinalsContiguous(request.referenceMap),
    allowedEvidenceClassesKnown: providerPacket.allowedEvidenceClasses.every((item) => (SHADOW_AI_EVIDENCE_CLASSES as readonly string[]).includes(item)),
    packetEvidenceClassesAllowedByProviderSchema: providerPacket.allowedEvidenceClasses.every((item) => schemaEvidenceClasses.includes(item)),
    providerSchemaEvidenceClassesExactlyProductSet: canonicalJson([...schemaEvidenceClasses].sort()) === canonicalJson([...SHADOW_AI_EVIDENCE_CLASSES].sort()),
    noRawInternalReferenceLeakage: outboundPrivacy.rawInternalReferenceLeakageCount === 0,
    noSourceIdentityLeakage: outboundPrivacy.sourceIdentityLeakageCount === 0,
    noReverseMapMaterialLeakage: outboundPrivacy.rawReverseMapMaterialCount === 0,
  };
  const invalidPaths = Object.entries(checks).filter(([, valid]) => !valid).map(([path]) => path);
  return deepFreeze({ locallySelfConsistent: invalidPaths.length === 0, checks, invalidPaths,
    aliasSummary: aliasSummary(request.referenceMap),
    evidenceClassSummary: {
      packetCount: providerPacket.allowedEvidenceClasses.length,
      providerSchemaCount: schemaEvidenceClasses.length,
      packetValuesAreKnownAndSchemaContained: checks.allowedEvidenceClassesKnown && checks.packetEvidenceClassesAllowedByProviderSchema,
    },
  });
}

export function inspectPayloadStructuralHazardsV1(payloadText: string) {
  const parsed = parseJson(payloadText);
  const strings: Array<{ path: string; value: string }> = [];
  const arrays: Array<{ path: string; value: unknown[] }> = [];
  collectPayloadValues(parsed, "$", strings, arrays);
  const stringsByBytes = strings.map((item) => ({ path: item.path, bytes: Buffer.byteLength(item.value, "utf8") }));
  const longest = [...stringsByBytes].sort((left, right) => right.bytes - left.bytes)[0] ?? null;
  const duplicateArrayPaths = arrays.filter(({ value }) => {
    const serialized = value.map((item) => canonicalJson(item));
    return new Set(serialized).size !== serialized.length;
  }).map(({ path }) => path);
  const maximumArray = [...arrays].map((item) => ({ path: item.path, length: item.value.length }))
    .sort((left, right) => right.length - left.length)[0] ?? null;
  return deepFreeze({
    jsonParses: true,
    totalStringCount: strings.length,
    longestString: longest,
    maximumArray,
    nonAsciiStringPaths: strings.filter((item) => /[^\x20-\x7E]/.test(item.value)).map((item) => item.path),
    newlineStringPaths: strings.filter((item) => /[\r\n]/.test(item.value)).map((item) => item.path),
    controlCharacterStringPaths: strings.filter((item) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(item.value)).map((item) => item.path),
    duplicateArrayPaths,
    malformedUnicodeReplacementPaths: strings.filter((item) => item.value.includes("\uFFFD")).map((item) => item.path),
  });
}

export function providerVisibleIdentifierAuditV1(request: ReturnType<typeof buildOpenRouterIssueGroundedShadowPlannerRequestV1>) {
  const body = JSON.parse(request.body) as Record<string, any>;
  const payload = JSON.parse(body.messages[1].content) as { packet: ShadowAiEconomicResolutionPacketV1 };
  const schemaName = body.response_format.json_schema.name as string;
  const issueId = payload.packet.issueId;
  const inputHash = payload.packet.immutableInputHash;
  const aliases = request.referenceMap.entries.map((entry) => entry.alias);
  return deepFreeze({
    schemaName: identifierSummary(schemaName, /^[A-Za-z0-9_-]+$/),
    issueId: identifierSummary(issueId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
    inputHash: identifierSummary(inputHash, /^[a-f0-9]{64}$/),
    aliases: {
      count: aliases.length,
      uniqueCount: new Set(aliases).size,
      minimumLength: Math.min(...aliases.map((alias) => alias.length)),
      maximumLength: Math.max(...aliases.map((alias) => alias.length)),
      allAscii: aliases.every((alias) => /^[\x20-\x7E]+$/.test(alias)),
      allTypedAliasShape: aliases.every((alias) => /^prv_[a-f0-9]{10}_[fsgc]_[0-9]{4}$/.test(alias)),
      containsControlCharacters: aliases.some((alias) => /[\u0000-\u001F\u007F]/.test(alias)),
      containsWhitespace: aliases.some((alias) => /\s/.test(alias)),
      duplicateCount: aliases.length - new Set(aliases).size,
      classCounts: aliasSummary(request.referenceMap).classCounts,
    },
  });
}

function safePayloadProjection(value: unknown): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return stringStatistics(value);
  if (typeof value === "number") return { kind: "number", finite: Number.isFinite(value), integer: Number.isInteger(value), sign: Math.sign(value) };
  if (Array.isArray(value)) return value.map(safePayloadProjection);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safePayloadProjection(item)]));
  return { kind: typeof value };
}

function stringStatistics(value: string) {
  return {
    kind: "string",
    characters: [...value].length,
    bytes: Buffer.byteLength(value, "utf8"),
    sha256: sha256(value),
    asciiOnly: /^[\x00-\x7F]*$/.test(value),
    hasWhitespace: /\s/.test(value),
    hasNewline: /[\r\n]/.test(value),
    hasControlCharacter: /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value),
    identifierLike: /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value),
  };
}

function compareProjected(left: unknown | typeof MISSING, right: unknown | typeof MISSING, path: string,
  rows: Array<{ path: string; classification: DifferentialClassificationV1; synthetic: unknown; real: unknown }>): void {
  if (left === MISSING || right === MISSING) {
    const classification = left === MISSING ? "REAL_ONLY" : "SYNTHETIC_ONLY";
    flattenOneSided(left === MISSING ? right : left, path, classification, left === MISSING, rows);
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    rows.push({ path: `${path}.$length`, classification: left.length === right.length ? "UNCHANGED" : "CHANGED", synthetic: left.length, real: right.length });
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) compareProjected(index < left.length ? left[index] : MISSING,
      index < right.length ? right[index] : MISSING, `${path}[${index}]`, rows);
    return;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) compareProjected(Object.hasOwn(left, key) ? left[key] : MISSING,
      Object.hasOwn(right, key) ? right[key] : MISSING, `${path}.${key}`, rows);
    return;
  }
  rows.push({ path, classification: canonicalJson(left) === canonicalJson(right) ? "UNCHANGED" : "CHANGED", synthetic: left, real: right });
}

function flattenOneSided(value: unknown, path: string, classification: "SYNTHETIC_ONLY" | "REAL_ONLY", realOnly: boolean,
  rows: Array<{ path: string; classification: DifferentialClassificationV1; synthetic: unknown; real: unknown }>): void {
  if (Array.isArray(value)) {
    rows.push({ path: `${path}.$length`, classification, synthetic: realOnly ? null : value.length, real: realOnly ? value.length : null });
    value.forEach((item, index) => flattenOneSided(item, `${path}[${index}]`, classification, realOnly, rows));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) flattenOneSided(item, `${path}.${key}`, classification, realOnly, rows);
    return;
  }
  rows.push({ path, classification, synthetic: realOnly ? null : value, real: realOnly ? value : null });
}

function collectPayloadValues(value: unknown, path: string, strings: Array<{ path: string; value: string }>, arrays: Array<{ path: string; value: unknown[] }>): void {
  if (typeof value === "string") strings.push({ path, value });
  else if (Array.isArray(value)) {
    arrays.push({ path, value });
    value.forEach((item, index) => collectPayloadValues(item, `${path}[${index}]`, strings, arrays));
  } else if (isRecord(value)) for (const [key, item] of Object.entries(value)) collectPayloadValues(item, `${path}.${key}`, strings, arrays);
}

function aliasOrdinalsContiguous(referenceMap: ShadowAiProviderReferenceMapV1): boolean {
  const byClass = new Map<string, number[]>();
  for (const entry of referenceMap.entries) {
    const ordinal = Number(entry.alias.slice(-4));
    byClass.set(entry.referenceClass, [...(byClass.get(entry.referenceClass) ?? []), ordinal]);
  }
  return [...byClass.values()].every((ordinals) => canonicalJson([...ordinals].sort((a, b) => a - b))
    === canonicalJson(Array.from({ length: ordinals.length }, (_, index) => index + 1)));
}

function aliasSummary(referenceMap: ShadowAiProviderReferenceMapV1) {
  const classCounts = referenceMap.entries.reduce<Record<string, number>>((counts, entry) => ({
    ...counts, [entry.referenceClass]: (counts[entry.referenceClass] ?? 0) + 1,
  }), {});
  return { totalCount: referenceMap.entries.length, classCounts };
}

function identifierSummary(value: string, pattern: RegExp) {
  return {
    characters: [...value].length,
    bytes: Buffer.byteLength(value, "utf8"),
    sha256: sha256(value),
    matchesExpectedPattern: pattern.test(value),
    asciiOnly: /^[\x20-\x7E]+$/.test(value),
    containsWhitespace: /\s/.test(value),
    containsControlCharacters: /[\u0000-\u001F\u007F]/.test(value),
  };
}

function parseJson(value: string): unknown { return JSON.parse(value); }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
