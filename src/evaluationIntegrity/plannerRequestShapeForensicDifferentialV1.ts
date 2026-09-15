import { createHash } from "node:crypto";

import {
  SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
  SHADOW_AI_EVIDENCE_CLASSES,
  SHADOW_AI_RESOLUTION_PATHS,
  type ShadowAiEconomicResolutionPacketV1,
} from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import { APPROVED_OPENROUTER_ENDPOINT } from "../canonical/v2/intelligence/providerPreflight.js";
import {
  STABLE_PROVIDER_FACT_REFERENCE_PATTERN_V1,
  STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1,
} from "./openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildOpenRouterClaudeStructuredOutputPreflightRequestV2,
  OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  translateSchemaForAnthropicStructuredOutputsV2,
  type OpenRouterClaudePreflightRequestV2,
} from "./openRouterClaudeStructuredOutputPreflightV2.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1, issueGroundedPlannerSystemPromptV1 } from "./openRouterIssueGroundedShadowPlannerV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "./plannerProviderCompatibilityDiagnosticsV1.js";

const HISTORICAL_ISSUE_SCHEMA_NAME = "shadow_ai_economic_resolution_plan_issue_grounded_v1";
const HISTORICAL_SYNTHETIC_SCHEMA_NAME = "shadow_ai_economic_resolution_plan_synthetic_preflight_v1";
const PLAN_KEYS = [
  "schemaVersion", "outputType", "authority", "admissionStatus", "truthEffect",
  "financialMutationAllowed", "customerRenderingAllowed", "issueId", "inputHash",
  "exactCitedFactRefs", "unresolvedQuestion", "primaryHypothesis", "alternativeHypotheses",
  "acknowledgedEvidenceGaps", "recommendedResolutionPath", "requiredEvidenceClasses",
  "researchQuerySuggestions", "merchantQuestionSuggestions", "documentRequestSuggestions",
  "operationalDataRequests", "internalExplanationDraft", "unresolvedAfterAnalysis",
  "limitationCodes", "reconstructionSuspicions",
] as const;
const HYPOTHESIS_KEYS = [
  "hypothesis", "confidence", "supportingFactRefs", "contradictingFactRefs",
  "acknowledgedEvidenceGaps", "confirmationRequirements", "falsificationConditions",
] as const;
const SUSPICION_KEYS = [
  "outcomeType", "authority", "admissionStatus", "truthEffect", "financialMutationAllowed",
  "exactAcceptedFactOrOccurrenceRefs", "reasonForSuspicion", "conflictingEvidenceRefs",
  "requestedDeterministicRecheckType",
] as const;

export type SafeRequestShapeV1 = Readonly<{
  endpoint: string;
  method: string;
  headerNames: readonly string[];
  bodyKeys: readonly string[];
  model: string;
  store: boolean;
  stream: boolean;
  temperature: number;
  maximumOutputTokens: number;
  messageRoles: readonly string[];
  messageByteCounts: readonly number[];
  messageContentSha256: readonly string[];
  userPayloadRootKeys: readonly string[];
  provider: Readonly<Record<string, unknown>>;
  responseFormatType: string;
  schemaName: string;
  strict: boolean;
  providerSchemaRootType: unknown;
  providerSchemaRootRequired: readonly string[];
  providerSchemaRootAdditionalProperties: unknown;
  compatibility: ReturnType<typeof inspectPlannerProviderCompatibilityV1>;
}>;

/** Reconstructs the accepted pre-Package-B/C request without invoking any transport. */
export function buildHistoricalAcceptedIssueRequestV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): OpenRouterClaudePreflightRequestV2 {
  const providerSchema = translateSchemaForAnthropicStructuredOutputsV2(historicalPacketSpecializedSchema(packet));
  const body = canonicalJson({
    model: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    store: false,
    stream: false,
    temperature: 0,
    max_tokens: 4_000,
    messages: [
      { role: "system", content: issueGroundedPlannerSystemPromptV1() },
      { role: "user", content: historicalIssueUserPayload(packet) },
    ],
    provider: { allow_fallbacks: false, require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: { name: HISTORICAL_ISSUE_SCHEMA_NAME, strict: true, schema: providerSchema },
    },
  });
  return request(body, providerSchema);
}

/** Reconstructs the accepted full-planner synthetic request without invoking any transport. */
export function buildHistoricalAcceptedFullSyntheticRequestV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): OpenRouterClaudePreflightRequestV2 {
  const providerSchema = translateSchemaForAnthropicStructuredOutputsV2(historicalPacketSpecializedSchema(packet));
  const body = canonicalJson({
    model: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    store: false,
    stream: false,
    temperature: 0,
    max_tokens: 4_000,
    messages: [
      { role: "system", content: historicalSyntheticSystemPrompt() },
      { role: "user", content: canonicalJson({ packet }) },
    ],
    provider: { allow_fallbacks: false, require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: { name: HISTORICAL_SYNTHETIC_SCHEMA_NAME, strict: true, schema: providerSchema },
    },
  });
  return request(body, providerSchema);
}

/**
 * Controlled live-isolation variant: starts from the exact historical full-planner
 * synthetic request and changes only the seven reference item constraints from
 * packet-specialized enums to Package C's typed alias patterns.
 */
export function buildHistoricalFullSyntheticTypedPatternVariantV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): OpenRouterClaudePreflightRequestV2 {
  const historical = buildHistoricalAcceptedFullSyntheticRequestV1(packet);
  const body = JSON.parse(historical.body) as Record<string, any>;
  const schema = body.response_format.json_schema.schema as Record<string, any>;
  const referenceItems: Array<{ node: Record<string, any>; pattern: string }> = [
    { node: schema.properties.exactCitedFactRefs.items, pattern: STABLE_PROVIDER_FACT_REFERENCE_PATTERN_V1 },
    { node: schema.properties.primaryHypothesis.properties.supportingFactRefs.items, pattern: STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1 },
    { node: schema.properties.primaryHypothesis.properties.contradictingFactRefs.items, pattern: STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1 },
    { node: schema.properties.alternativeHypotheses.items.properties.supportingFactRefs.items, pattern: STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1 },
    { node: schema.properties.alternativeHypotheses.items.properties.contradictingFactRefs.items, pattern: STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1 },
    { node: schema.properties.reconstructionSuspicions.items.properties.exactAcceptedFactOrOccurrenceRefs.items, pattern: STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1 },
    { node: schema.properties.reconstructionSuspicions.items.properties.conflictingEvidenceRefs.items, pattern: STABLE_PROVIDER_SUPPORT_REFERENCE_PATTERN_V1 },
  ];
  for (const item of referenceItems) {
    delete item.node.enum;
    item.node.pattern = item.pattern;
  }
  const providerSchema = deepFreeze(schema);
  return request(canonicalJson(body), providerSchema);
}

export function compareHistoricalFullSyntheticToTypedPatternVariantV1(
  historical: OpenRouterClaudePreflightRequestV2,
  variant: OpenRouterClaudePreflightRequestV2,
): Readonly<{
  validSingleVariableChange: boolean;
  changedPaths: readonly string[];
  expectedChangedPaths: readonly string[];
  unexpectedChangedPaths: readonly string[];
}> {
  const changedPaths: string[] = [];
  compareNodes(JSON.parse(historical.body), JSON.parse(variant.body), "$", changedPaths);
  const expectedChangedPaths = [
    "$.response_format.json_schema.schema.properties.alternativeHypotheses.items.properties.contradictingFactRefs.items.enum",
    "$.response_format.json_schema.schema.properties.alternativeHypotheses.items.properties.contradictingFactRefs.items.pattern",
    "$.response_format.json_schema.schema.properties.alternativeHypotheses.items.properties.supportingFactRefs.items.enum",
    "$.response_format.json_schema.schema.properties.alternativeHypotheses.items.properties.supportingFactRefs.items.pattern",
    "$.response_format.json_schema.schema.properties.exactCitedFactRefs.items.enum",
    "$.response_format.json_schema.schema.properties.exactCitedFactRefs.items.pattern",
    "$.response_format.json_schema.schema.properties.primaryHypothesis.properties.contradictingFactRefs.items.enum",
    "$.response_format.json_schema.schema.properties.primaryHypothesis.properties.contradictingFactRefs.items.pattern",
    "$.response_format.json_schema.schema.properties.primaryHypothesis.properties.supportingFactRefs.items.enum",
    "$.response_format.json_schema.schema.properties.primaryHypothesis.properties.supportingFactRefs.items.pattern",
    "$.response_format.json_schema.schema.properties.reconstructionSuspicions.items.properties.conflictingEvidenceRefs.items.enum",
    "$.response_format.json_schema.schema.properties.reconstructionSuspicions.items.properties.conflictingEvidenceRefs.items.pattern",
    "$.response_format.json_schema.schema.properties.reconstructionSuspicions.items.properties.exactAcceptedFactOrOccurrenceRefs.items.enum",
    "$.response_format.json_schema.schema.properties.reconstructionSuspicions.items.properties.exactAcceptedFactOrOccurrenceRefs.items.pattern",
  ].sort();
  const actual = [...changedPaths].sort();
  const unexpectedChangedPaths = actual.filter((path) => !expectedChangedPaths.includes(path));
  return deepFreeze({
    validSingleVariableChange: canonicalJson(actual) === canonicalJson(expectedChangedPaths),
    changedPaths: actual,
    expectedChangedPaths,
    unexpectedChangedPaths,
  });
}

export function buildTypedPatternIssueIdPatternIsolationVariantV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): OpenRouterClaudePreflightRequestV2 {
  const control = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
  const body = JSON.parse(control.body) as Record<string, any>;
  const issueId = body.response_format.json_schema.schema.properties.issueId as Record<string, unknown>;
  delete issueId.const;
  issueId.pattern = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$";
  const providerSchema = deepFreeze(body.response_format.json_schema.schema as Record<string, unknown>);
  return request(canonicalJson(body), providerSchema);
}

export function compareTypedPatternControlToIssueIdPatternVariantV1(
  control: OpenRouterClaudePreflightRequestV2,
  variant: OpenRouterClaudePreflightRequestV2,
): Readonly<{
  validSingleVariableChange: boolean;
  changedPaths: readonly string[];
  expectedChangedPaths: readonly string[];
  unexpectedChangedPaths: readonly string[];
}> {
  const changedPaths: string[] = [];
  compareNodes(JSON.parse(control.body), JSON.parse(variant.body), "$", changedPaths);
  const expectedChangedPaths = [
    "$.response_format.json_schema.schema.properties.issueId.const",
    "$.response_format.json_schema.schema.properties.issueId.pattern",
  ].sort();
  const actual = [...changedPaths].sort();
  return deepFreeze({
    validSingleVariableChange: canonicalJson(actual) === canonicalJson(expectedChangedPaths),
    changedPaths: actual,
    expectedChangedPaths,
    unexpectedChangedPaths: actual.filter((path) => !expectedChangedPaths.includes(path)),
  });
}

export function reconstructForensicAnchorsV1(input: {
  historicalAuthorizationPacket: ShadowAiEconomicResolutionPacketV1;
  historicalSyntheticPacket: ShadowAiEconomicResolutionPacketV1;
}): Readonly<{
  historicalReal: OpenRouterClaudePreflightRequestV2;
  historicalMinimalSynthetic: OpenRouterClaudePreflightRequestV2;
  historicalFullSynthetic: OpenRouterClaudePreflightRequestV2;
  currentRejected: OpenRouterClaudePreflightRequestV2;
}> {
  return Object.freeze({
    historicalReal: buildHistoricalAcceptedIssueRequestV1(input.historicalAuthorizationPacket),
    historicalMinimalSynthetic: buildOpenRouterClaudeStructuredOutputPreflightRequestV2("offline-placeholder-never-transmitted"),
    historicalFullSynthetic: buildHistoricalAcceptedFullSyntheticRequestV1(input.historicalSyntheticPacket),
    currentRejected: buildOpenRouterIssueGroundedShadowPlannerRequestV1(
      "offline-placeholder-never-transmitted",
      input.historicalAuthorizationPacket,
    ),
  });
}

export function safeRequestShapeV1(requestValue: OpenRouterClaudePreflightRequestV2): SafeRequestShapeV1 {
  const body = JSON.parse(requestValue.body) as Record<string, any>;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const userPayload = parseRecord(messages[1]?.content);
  const schema = body.response_format.json_schema.schema as Record<string, unknown>;
  return deepFreeze({
    endpoint: requestValue.endpoint,
    method: requestValue.method,
    headerNames: Object.keys(requestValue.headers).sort(),
    bodyKeys: Object.keys(body).sort(),
    model: body.model,
    store: body.store,
    stream: body.stream,
    temperature: body.temperature,
    maximumOutputTokens: body.max_tokens,
    messageRoles: messages.map((message: any) => message.role),
    messageByteCounts: messages.map((message: any) => Buffer.byteLength(String(message.content), "utf8")),
    messageContentSha256: messages.map((message: any) => sha256(String(message.content))),
    userPayloadRootKeys: Object.keys(userPayload ?? {}).sort(),
    provider: body.provider,
    responseFormatType: body.response_format.type,
    schemaName: body.response_format.json_schema.name,
    strict: body.response_format.json_schema.strict,
    providerSchemaRootType: schema.type,
    providerSchemaRootRequired: Array.isArray(schema.required) ? schema.required : [],
    providerSchemaRootAdditionalProperties: schema.additionalProperties,
    compatibility: inspectPlannerProviderCompatibilityV1(requestValue),
  });
}

export function schemaKeywordPathsV1(schema: unknown): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, string[]> = {};
  visitKeywordPaths(schema, "$", result);
  return deepFreeze(Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right))));
}

export function buildMeaningfulDifferentialV1(
  historical: SafeRequestShapeV1,
  current: SafeRequestShapeV1,
): readonly Readonly<Record<string, unknown>>[] {
  const rows: Array<Record<string, unknown>> = [];
  const add = (path: string, accepted: unknown, rejected: unknown, relevance: string, layer: string) => rows.push({
    path,
    historicalAccepted: accepted,
    currentRejected: rejected,
    changeType: canonicalJson(accepted) === canonicalJson(rejected) ? "UNCHANGED" : "CHANGED",
    diagnosticRelevance: relevance,
    potentialFailureLayer: layer,
  });
  add("endpoint", historical.endpoint, current.endpoint, "Transport target", "A_OPENROUTER_REQUEST");
  add("method", historical.method, current.method, "HTTP method", "A_OPENROUTER_REQUEST");
  add("headerNames", historical.headerNames, current.headerNames, "Safe header-name set; values excluded", "A_OPENROUTER_REQUEST");
  add("body.keys", historical.bodyKeys, current.bodyKeys, "Top-level OpenRouter parameter set", "A_OPENROUTER_REQUEST");
  add("body.model", historical.model, current.model, "Model route", "A_OPENROUTER_REQUEST");
  add("body.store", historical.store, current.store, "Generation/retention setting", "A_OPENROUTER_REQUEST");
  add("body.stream", historical.stream, current.stream, "Transport mode", "A_OPENROUTER_REQUEST");
  add("body.temperature", historical.temperature, current.temperature, "Generation setting", "B_MODEL_STRUCTURED_OUTPUT");
  add("body.max_tokens", historical.maximumOutputTokens, current.maximumOutputTokens, "Generation budget", "B_MODEL_STRUCTURED_OUTPUT");
  add("body.messages.roles", historical.messageRoles, current.messageRoles, "Message envelope", "A_OPENROUTER_REQUEST");
  add("body.messages.byteCounts", historical.messageByteCounts, current.messageByteCounts, "Content-safe size comparison", "A_OR_B");
  add("body.messages.contentSha256", historical.messageContentSha256, current.messageContentSha256, "Content-safe identity comparison", "C_LOCAL_CONSTRUCTION");
  add("body.messages[1].parsedRootKeys", historical.userPayloadRootKeys, current.userPayloadRootKeys, "User payload envelope", "C_LOCAL_CONSTRUCTION");
  add("body.provider", historical.provider, current.provider, "Provider routing", "A_OPENROUTER_REQUEST");
  add("body.response_format.type", historical.responseFormatType, current.responseFormatType, "Structured-output wrapper", "A_OR_B");
  add("body.response_format.json_schema.name", historical.schemaName, current.schemaName, "Provider schema identifier", "A_OR_B");
  add("body.response_format.json_schema.strict", historical.strict, current.strict, "Strict structured output", "A_OR_B");
  add("schema.root.type", historical.providerSchemaRootType, current.providerSchemaRootType, "Root schema type", "B_MODEL_STRUCTURED_OUTPUT");
  add("schema.root.required", historical.providerSchemaRootRequired, current.providerSchemaRootRequired, "Root required fields", "B_MODEL_STRUCTURED_OUTPUT");
  add("schema.root.additionalProperties", historical.providerSchemaRootAdditionalProperties, current.providerSchemaRootAdditionalProperties, "Strict object closure", "B_MODEL_STRUCTURED_OUTPUT");
  for (const metric of ["providerSchemaBytes", "providerSchemaSha256", "schemaDepth", "schemaNodeCount", "enumNodeCount",
    "maximumEnumCardinality", "totalEnumLiteralCount", "totalEnumLiteralBytes", "constCount", "arraySchemaNodeCount",
    "minimumItemsConstraintCount", "maximumItemsConstraintCount", "anyOfCount", "oneOfCount", "allOfCount", "patternCount",
    "minimumLengthConstraintCount", "maximumLengthConstraintCount"] as const) {
    add(`schema.metrics.${metric}`, historical.compatibility[metric], current.compatibility[metric], "Translated provider-schema construct", "B_OR_C");
  }
  return deepFreeze(rows);
}

function historicalIssueUserPayload(packet: ShadowAiEconomicResolutionPacketV1): string {
  const facets = [...packet.unresolvedClaimFacets];
  const reasons = [...packet.unresolvedReasonCodes];
  return canonicalJson({
    issueContext: {
      issueId: packet.issueId,
      issueClass: packet.issueClass,
      unresolvedQuestion: `What remains unresolved for issue ${packet.issueClass} across packet facets [${facets.join(", ") || "none supplied"}] given reason codes [${reasons.join(", ") || "none supplied"}]?`,
      unresolvedFacets: facets,
      unresolvedReasonCodes: reasons,
    },
    packet,
  });
}

function historicalPacketSpecializedSchema(packet: ShadowAiEconomicResolutionPacketV1): Readonly<Record<string, unknown>> {
  const text = (maximum: number) => ({ type: "string", minLength: 1, maxLength: maximum });
  const stringList = (minimum = 0) => ({ type: "array", items: text(500), minItems: minimum, maxItems: 16 });
  const allowedFactRefs = [...new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef)])];
  const allowedSupportRefs = [...new Set([...allowedFactRefs, ...packet.currentGovernedEvidenceRefs, ...packet.selectedRdChargeRefs])];
  const referenceList = (allowed: readonly string[], minimum = 0) => ({
    type: "array", items: { type: "string", enum: [...allowed] }, minItems: minimum, maxItems: 16,
  });
  const hypothesis = {
    type: "object", additionalProperties: false,
    properties: {
      hypothesis: text(2_000), confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      supportingFactRefs: referenceList(allowedSupportRefs, 1), contradictingFactRefs: referenceList(allowedSupportRefs),
      acknowledgedEvidenceGaps: stringList(1), confirmationRequirements: stringList(1), falsificationConditions: stringList(1),
    }, required: [...HYPOTHESIS_KEYS],
  };
  const suspicion = {
    type: "object", additionalProperties: false,
    properties: {
      outcomeType: { type: "string", const: "FINANCIAL_RECONSTRUCTION_SUSPICION" },
      authority: { type: "string", const: "NON_AUTHORITATIVE" }, admissionStatus: { type: "string", const: "NOT_ADMITTED" },
      truthEffect: { type: "string", const: "NONE" }, financialMutationAllowed: { type: "boolean", const: false },
      exactAcceptedFactOrOccurrenceRefs: referenceList(allowedSupportRefs, 1), reasonForSuspicion: text(2_000),
      conflictingEvidenceRefs: referenceList(allowedSupportRefs),
      requestedDeterministicRecheckType: { type: "string", enum: ["PARSER_SOURCE_OCCURRENCE_RECHECK", "RD_RECONCILIATION_RECHECK", "POPULATION_IDENTITY_RECHECK", "DIRECTION_SIGN_RECHECK", "DUPLICATE_OCCURRENCE_RECHECK", "ROUNDING_CONTROL_RECHECK"] },
    }, required: [...SUSPICION_KEYS],
  };
  return deepFreeze({
    type: "object", additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", const: SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION },
      outputType: { type: "string", const: "AI_INFERENCE_ONLY" }, authority: { type: "string", const: "NON_AUTHORITATIVE" },
      admissionStatus: { type: "string", const: "NOT_ADMITTED" }, truthEffect: { type: "string", const: "NONE" },
      financialMutationAllowed: { type: "boolean", const: false }, customerRenderingAllowed: { type: "boolean", const: false },
      issueId: { type: "string", const: packet.issueId, minLength: 1, maxLength: 200 },
      inputHash: { type: "string", const: packet.immutableInputHash, pattern: "^[a-f0-9]{64}$" },
      exactCitedFactRefs: referenceList(allowedFactRefs, 1), unresolvedQuestion: text(2_000), primaryHypothesis: hypothesis,
      alternativeHypotheses: { type: "array", items: hypothesis, minItems: 1, maxItems: 5 }, acknowledgedEvidenceGaps: stringList(1),
      recommendedResolutionPath: { type: "string", enum: [...SHADOW_AI_RESOLUTION_PATHS] },
      requiredEvidenceClasses: { type: "array", items: { type: "string", enum: [...packet.allowedEvidenceClasses] }, minItems: 1, maxItems: SHADOW_AI_EVIDENCE_CLASSES.length },
      researchQuerySuggestions: stringList(), merchantQuestionSuggestions: stringList(1), documentRequestSuggestions: stringList(1),
      operationalDataRequests: stringList(1), internalExplanationDraft: { anyOf: [text(2_000), { type: "null" }] },
      unresolvedAfterAnalysis: { type: "boolean", const: true }, limitationCodes: stringList(1),
      reconstructionSuspicions: { type: "array", items: suspicion, maxItems: 3 },
    }, required: [...PLAN_KEYS],
  });
}

function historicalSyntheticSystemPrompt(): string {
  return `You are performing one synthetic compatibility preflight for a non-authoritative payment-economics resolution planner.
Use only the enclosed synthetic packet. Do not browse, research, call tools, use external knowledge, or infer any real merchant, processor contract, fee amount, or customer action.
Return one complete object matching the JSON schema. Copy issueId and immutableInputHash exactly and cite only references present in the packet.
The unresolved question is: What economic role does the fictitious fee SYNTHETIC SERVICE PROGRAM X represent?
Use DOCUMENT_REQUIRED. Provide a coherent primary hypothesis that the label may represent a bundled processor service, plus a genuinely different alternative that it may represent a gateway or platform program charge.
Include explicit evidence gaps, confirmation requirements, falsification conditions, a specific synthetic document request, a merchant question, and an operational-data request. Keep researchQuerySuggestions empty because no research is authorized.
Do not create a financial reconstruction suspicion. Do not resolve the question. Preserve all NON_AUTHORITATIVE authority constants and uncertainty.`;
}

function request(body: string, providerSchema: Readonly<Record<string, unknown>>): OpenRouterClaudePreflightRequestV2 {
  return Object.freeze({
    endpoint: APPROVED_OPENROUTER_ENDPOINT, method: "POST" as const,
    headers: Object.freeze({ Authorization: "Bearer offline-placeholder-never-transmitted", "Content-Type": "application/json", "X-OpenRouter-Metadata": "enabled" }),
    body, bodyBytes: Buffer.byteLength(body, "utf8"), providerSchema,
  });
}

function visitKeywordPaths(value: unknown, path: string, out: Record<string, string[]>): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitKeywordPaths(item, `${path}[${index}]`, out));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (["const", "enum", "pattern", "type", "required", "additionalProperties", "minItems", "maxItems", "minLength", "maxLength", "anyOf", "oneOf", "allOf", "$ref", "$defs"].includes(key)) {
      (out[key] ??= []).push(`${path}.${key}`);
    }
    visitKeywordPaths(child, `${path}.${key}`, out);
  }
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function compareNodes(left: unknown, right: unknown, path: string, changes: string[]): void {
  if (canonicalJson(left) === canonicalJson(right)) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) compareNodes(left[index], right[index], `${path}[${index}]`, changes);
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) compareNodes((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], `${path}.${key}`, changes);
    return;
  }
  changes.push(path);
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
