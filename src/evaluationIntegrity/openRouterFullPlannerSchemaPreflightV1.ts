import { createHash } from "node:crypto";

import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
  SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
  SHADOW_AI_EVIDENCE_CLASSES,
  SHADOW_AI_RESOLUTION_PATHS,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionPlanV1,
} from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import { APPROVED_OPENROUTER_ENDPOINT } from "../canonical/v2/intelligence/providerPreflight.js";
import {
  OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  countSchemaKeywordV2,
  sendOpenRouterClaudeJsonSchemaEvaluationRequestV2,
  translateSchemaForAnthropicStructuredOutputsV2,
  type OpenRouterClaudePreflightRequestV2,
  type OpenRouterPreflightTelemetryV2,
} from "./openRouterClaudeStructuredOutputPreflightV2.js";

export const FULL_PLANNER_PREFLIGHT_SCHEMA_NAME_V1 = "shadow_ai_economic_resolution_plan_synthetic_preflight_v1" as const;

const PLAN_KEYS = Object.freeze([
  "schemaVersion", "outputType", "authority", "admissionStatus", "truthEffect",
  "financialMutationAllowed", "customerRenderingAllowed", "issueId", "inputHash",
  "exactCitedFactRefs", "unresolvedQuestion", "primaryHypothesis", "alternativeHypotheses",
  "acknowledgedEvidenceGaps", "recommendedResolutionPath", "requiredEvidenceClasses",
  "researchQuerySuggestions", "merchantQuestionSuggestions", "documentRequestSuggestions",
  "operationalDataRequests", "internalExplanationDraft", "unresolvedAfterAnalysis",
  "limitationCodes", "reconstructionSuspicions",
] as const);
const HYPOTHESIS_KEYS = Object.freeze([
  "hypothesis", "confidence", "supportingFactRefs", "contradictingFactRefs",
  "acknowledgedEvidenceGaps", "confirmationRequirements", "falsificationConditions",
] as const);
const SUSPICION_KEYS = Object.freeze([
  "outcomeType", "authority", "admissionStatus", "truthEffect", "financialMutationAllowed",
  "exactAcceptedFactOrOccurrenceRefs", "reasonForSuspicion", "conflictingEvidenceRefs",
  "requestedDeterministicRecheckType",
] as const);

export function createSyntheticFullPlannerPacketV1(): ShadowAiEconomicResolutionPacketV1 {
  const withoutHash: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_PACKET_SCHEMA_VERSION,
    purpose: "SHADOW_ECONOMIC_RESOLUTION_PLANNING_ONLY",
    outputAuthorityRequired: "NON_AUTHORITATIVE",
    opaqueRunRef: "shadow-run-0000000000000002",
    issueId: "synthetic_full_planner_issue_001",
    issueClass: "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS",
    processorFamily: "SYNTHETIC_PROCESSOR_FAMILY_X",
    processorProgram: "SYNTHETIC_SERVICE_PROGRAM_X",
    statementPeriod: { start: "2099-02-01", end: "2099-02-28" },
    acceptedIssueRelevantActivityFacts: Object.freeze([{
      factRef: "synthetic_fact_fee_occurrence_001",
      field: "synthetic_fee_occurrence_presence",
      state: "KNOWN",
      value: "SYNTHETIC_FEE_OCCURRENCE_PRESENT",
      population: "SYNTHETIC_FEE_OCCURRENCE_POPULATION",
      evidenceRefs: Object.freeze(["synthetic_evidence_occurrence_001"]),
    }]),
    selectedRdChargeRefs: Object.freeze(["synthetic_rd_charge_ref_001"]),
    sanitizedFeeLabels: Object.freeze(["SYNTHETIC SERVICE PROGRAM X"]),
    acceptedEconomicCategories: Object.freeze(["SHARED_BUNDLED_OR_UNRESOLVED"]),
    acceptedSensitivityStates: Object.freeze(["SYNTHETIC_SENSITIVITY_UNKNOWN"]),
    acceptedQualificationIntegrityState: "SYNTHETIC_QUALIFICATION_UNKNOWN",
    acceptedParticipantControlStates: Object.freeze([{
      rdChargeRef: "synthetic_rd_charge_ref_001",
      collector: { state: "UNKNOWN", value: null },
      economicBeneficiary: { state: "UNKNOWN", value: null },
      ruleSetter: { state: "UNKNOWN", value: null },
      priceSetter: { state: "UNKNOWN", value: null },
      merchantFacingPriceController: { state: "UNKNOWN", value: null },
    }]),
    unresolvedClaimFacets: Object.freeze(["synthetic_economic_role", "synthetic_fee_composition"]),
    unresolvedReasonCodes: Object.freeze(["synthetic_composition_not_separable", "synthetic_governing_document_absent"]),
    acceptedFactRefs: Object.freeze(["synthetic_fact_fee_label_001"]),
    currentGovernedEvidenceRefs: Object.freeze(["synthetic_governed_evidence_ref_001"]),
    allowedEvidenceClasses: Object.freeze([
      "MERCHANT_CONTRACT_OR_SCHEDULE",
      "PROCESSOR_OR_GATEWAY_OPERATIONAL_DATA",
      "MERCHANT_ATTESTATION",
    ]),
    prohibitedConclusions: Object.freeze([
      "canonical_fact_change", "rd_change", "fee_amount_change", "population_change", "accepted_reclassification",
      "participant_or_control_truth", "completeness_change", "materiality_change", "unknown_to_zero", "savings_or_annualization",
      "avoidability", "merchant_or_processor_blame", "comparison_or_comparator_decision", "customer_action_or_finding",
    ]),
    merchantBusinessContext: null,
    competingHypothesisRequired: true,
  };
  const packet = deepFreeze({ ...withoutHash, immutableInputHash: sha256(canonicalJson(withoutHash)) });
  const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  if (!privacy.valid) throw new Error(`synthetic_full_planner_packet_privacy_invalid:${privacy.reasonCodes.join(",")}`);
  return packet;
}

export function localFullPlannerOutputSchemaV1(packet: ShadowAiEconomicResolutionPacketV1): Readonly<Record<string, unknown>> {
  const text = (maximum: number) => ({ type: "string", minLength: 1, maxLength: maximum });
  const stringList = (minimum = 0) => ({ type: "array", items: text(500), minItems: minimum, maxItems: 16 });
  const allowedFactRefs = [...new Set([
    ...packet.acceptedFactRefs,
    ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef),
  ])];
  const allowedSupportRefs = [...new Set([
    ...allowedFactRefs,
    ...packet.currentGovernedEvidenceRefs,
    ...packet.selectedRdChargeRefs,
  ])];
  const referenceList = (allowed: readonly string[], minimum = 0) => ({
    type: "array",
    items: { type: "string", enum: [...allowed] },
    minItems: minimum,
    maxItems: 16,
  });
  const hypothesis = {
    type: "object",
    additionalProperties: false,
    properties: {
      hypothesis: text(2_000),
      confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      supportingFactRefs: referenceList(allowedSupportRefs, 1),
      contradictingFactRefs: referenceList(allowedSupportRefs),
      acknowledgedEvidenceGaps: stringList(1),
      confirmationRequirements: stringList(1),
      falsificationConditions: stringList(1),
    },
    required: [...HYPOTHESIS_KEYS],
  };
  const suspicion = {
    type: "object",
    additionalProperties: false,
    properties: {
      outcomeType: { type: "string", const: "FINANCIAL_RECONSTRUCTION_SUSPICION" },
      authority: { type: "string", const: "NON_AUTHORITATIVE" },
      admissionStatus: { type: "string", const: "NOT_ADMITTED" },
      truthEffect: { type: "string", const: "NONE" },
      financialMutationAllowed: { type: "boolean", const: false },
      exactAcceptedFactOrOccurrenceRefs: referenceList(allowedSupportRefs, 1),
      reasonForSuspicion: text(2_000),
      conflictingEvidenceRefs: referenceList(allowedSupportRefs),
      requestedDeterministicRecheckType: {
        type: "string",
        enum: ["PARSER_SOURCE_OCCURRENCE_RECHECK", "RD_RECONCILIATION_RECHECK", "POPULATION_IDENTITY_RECHECK",
          "DIRECTION_SIGN_RECHECK", "DUPLICATE_OCCURRENCE_RECHECK", "ROUNDING_CONTROL_RECHECK"],
      },
    },
    required: [...SUSPICION_KEYS],
  };
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", const: SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION },
      outputType: { type: "string", const: "AI_INFERENCE_ONLY" },
      authority: { type: "string", const: "NON_AUTHORITATIVE" },
      admissionStatus: { type: "string", const: "NOT_ADMITTED" },
      truthEffect: { type: "string", const: "NONE" },
      financialMutationAllowed: { type: "boolean", const: false },
      customerRenderingAllowed: { type: "boolean", const: false },
      issueId: { type: "string", const: packet.issueId, minLength: 1, maxLength: 200 },
      inputHash: { type: "string", const: packet.immutableInputHash, pattern: "^[a-f0-9]{64}$" },
      exactCitedFactRefs: referenceList(allowedFactRefs, 1),
      unresolvedQuestion: text(2_000),
      primaryHypothesis: hypothesis,
      alternativeHypotheses: { type: "array", items: hypothesis, minItems: 1, maxItems: 5 },
      acknowledgedEvidenceGaps: stringList(1),
      recommendedResolutionPath: { type: "string", enum: [...SHADOW_AI_RESOLUTION_PATHS] },
      requiredEvidenceClasses: {
        type: "array",
        items: { type: "string", enum: [...packet.allowedEvidenceClasses] },
        minItems: 1,
        maxItems: SHADOW_AI_EVIDENCE_CLASSES.length,
      },
      researchQuerySuggestions: stringList(),
      merchantQuestionSuggestions: stringList(1),
      documentRequestSuggestions: stringList(1),
      operationalDataRequests: stringList(1),
      internalExplanationDraft: { anyOf: [text(2_000), { type: "null" }] },
      unresolvedAfterAnalysis: { type: "boolean", const: true },
      limitationCodes: stringList(1),
      reconstructionSuspicions: { type: "array", items: suspicion, maxItems: 3 },
    },
    required: [...PLAN_KEYS],
  });
}

export function buildOpenRouterFullPlannerSchemaPreflightRequestV1(
  apiKey: string,
  packet: ShadowAiEconomicResolutionPacketV1,
): OpenRouterClaudePreflightRequestV2 {
  if (!apiKey) throw new Error("openrouter_full_planner_preflight_api_key_required");
  const localSchema = localFullPlannerOutputSchemaV1(packet);
  const providerSchema = translateSchemaForAnthropicStructuredOutputsV2(localSchema);
  for (const keyword of ["minLength", "maxLength", "maxItems"]) {
    if (countSchemaKeywordV2(providerSchema, keyword) !== 0) throw new Error(`full_planner_provider_schema_unsupported_keyword:${keyword}`);
  }
  const body = canonicalJson({
    model: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    store: false,
    stream: false,
    temperature: 0,
    max_tokens: 4_000,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: canonicalJson({ packet }) },
    ],
    provider: { allow_fallbacks: false, require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: { name: FULL_PLANNER_PREFLIGHT_SCHEMA_NAME_V1, strict: true, schema: providerSchema },
    },
  });
  return Object.freeze({
    endpoint: APPROVED_OPENROUTER_ENDPOINT,
    method: "POST",
    headers: Object.freeze({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled",
    }),
    body,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    providerSchema,
  });
}

export async function invokeOpenRouterFullPlannerSchemaPreflightV1(input: {
  apiKey: string;
  packet: ShadowAiEconomicResolutionPacketV1;
  signal: AbortSignal;
  fetchImplementation?: typeof fetch;
}): Promise<Readonly<{
  rawOutput: unknown;
  telemetry: OpenRouterPreflightTelemetryV2;
  requestBodyBytes: number;
}>> {
  const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1(input.apiKey, input.packet);
  const result = await sendOpenRouterClaudeJsonSchemaEvaluationRequestV2({
    request,
    signal: input.signal,
    fetchImplementation: input.fetchImplementation,
  });
  return Object.freeze({ rawOutput: result.rawOutput, telemetry: result.telemetry, requestBodyBytes: request.bodyBytes });
}

export function validateProviderFacingFullPlannerShapeV1(value: unknown): Readonly<{ valid: boolean; errors: readonly string[] }> {
  const errors: string[] = [];
  const plan = asRecord(value);
  if (!plan) return Object.freeze({ valid: false, errors: Object.freeze(["full_planner_output_not_object"]) });
  exactKeys(plan, PLAN_KEYS, "output", errors);
  if (plan.schemaVersion !== SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION
    || plan.outputType !== "AI_INFERENCE_ONLY" || plan.authority !== "NON_AUTHORITATIVE"
    || plan.admissionStatus !== "NOT_ADMITTED" || plan.truthEffect !== "NONE"
    || plan.financialMutationAllowed !== false || plan.customerRenderingAllowed !== false
    || plan.unresolvedAfterAnalysis !== true) errors.push("full_planner_authority_constants_invalid");
  for (const key of ["exactCitedFactRefs", "alternativeHypotheses", "acknowledgedEvidenceGaps", "requiredEvidenceClasses",
    "researchQuerySuggestions", "merchantQuestionSuggestions", "documentRequestSuggestions", "operationalDataRequests",
    "limitationCodes", "reconstructionSuspicions"]) {
    if (!Array.isArray(plan[key])) errors.push(`${key}_not_array`);
  }
  validateHypothesisShape(plan.primaryHypothesis, "primaryHypothesis", errors);
  if (Array.isArray(plan.alternativeHypotheses)) {
    plan.alternativeHypotheses.forEach((item, index) => validateHypothesisShape(item, `alternativeHypotheses[${index}]`, errors));
  }
  if (Array.isArray(plan.reconstructionSuspicions)) {
    plan.reconstructionSuspicions.forEach((item, index) => {
      const suspicion = asRecord(item);
      if (!suspicion) errors.push(`reconstructionSuspicions[${index}]_not_object`);
      else exactKeys(suspicion, SUSPICION_KEYS, `reconstructionSuspicions[${index}]`, errors);
    });
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze([...new Set(errors)].sort()) });
}

export function validateTranslatedConstraintSemanticsV1(plan: ShadowAiEconomicResolutionPlanV1): Readonly<{ valid: boolean; errors: readonly string[] }> {
  const errors: string[] = [];
  const cappedLists: Array<[string, readonly unknown[], number]> = [
    ["exactCitedFactRefs", plan.exactCitedFactRefs, 16],
    ["alternativeHypotheses", plan.alternativeHypotheses, 5],
    ["acknowledgedEvidenceGaps", plan.acknowledgedEvidenceGaps, 16],
    ["requiredEvidenceClasses", plan.requiredEvidenceClasses, SHADOW_AI_EVIDENCE_CLASSES.length],
    ["researchQuerySuggestions", plan.researchQuerySuggestions, 16],
    ["merchantQuestionSuggestions", plan.merchantQuestionSuggestions, 16],
    ["documentRequestSuggestions", plan.documentRequestSuggestions, 16],
    ["operationalDataRequests", plan.operationalDataRequests, 16],
    ["limitationCodes", plan.limitationCodes, 16],
    ["reconstructionSuspicions", plan.reconstructionSuspicions, 3],
  ];
  for (const [path, values, maximum] of cappedLists) if (values.length > maximum) errors.push(`${path}_maximum_exceeded`);
  for (const [index, hypothesis] of [plan.primaryHypothesis, ...plan.alternativeHypotheses].entries()) {
    for (const [name, values] of Object.entries({
      supportingFactRefs: hypothesis.supportingFactRefs,
      contradictingFactRefs: hypothesis.contradictingFactRefs,
      acknowledgedEvidenceGaps: hypothesis.acknowledgedEvidenceGaps,
      confirmationRequirements: hypothesis.confirmationRequirements,
      falsificationConditions: hypothesis.falsificationConditions,
    })) if (values.length > 16) errors.push(`hypothesis[${index}].${name}_maximum_exceeded`);
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors.sort()) });
}

export function inspectFullPlannerReferenceGroundingV1(
  value: unknown,
  packet: ShadowAiEconomicResolutionPacketV1,
): Readonly<{ valid: boolean; citedRefs: readonly string[]; invalidRefs: readonly string[] }> {
  const plan = asRecord(value);
  if (!plan) return Object.freeze({ valid: false, citedRefs: Object.freeze([]), invalidRefs: Object.freeze(["output_not_object"]) });
  const factRefs = new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef)]);
  const supportRefs = new Set([...factRefs, ...packet.currentGovernedEvidenceRefs, ...packet.selectedRdChargeRefs]);
  const cited: string[] = [];
  const invalid: string[] = [];
  collectRefs(plan.exactCitedFactRefs, factRefs, cited, invalid);
  for (const hypothesis of [plan.primaryHypothesis, ...(Array.isArray(plan.alternativeHypotheses) ? plan.alternativeHypotheses : [])]) {
    const item = asRecord(hypothesis);
    collectRefs(item?.supportingFactRefs, supportRefs, cited, invalid);
    collectRefs(item?.contradictingFactRefs, supportRefs, cited, invalid);
  }
  for (const suspicionValue of Array.isArray(plan.reconstructionSuspicions) ? plan.reconstructionSuspicions : []) {
    const suspicion = asRecord(suspicionValue);
    collectRefs(suspicion?.exactAcceptedFactOrOccurrenceRefs, supportRefs, cited, invalid);
    collectRefs(suspicion?.conflictingEvidenceRefs, supportRefs, cited, invalid);
  }
  return Object.freeze({
    valid: invalid.length === 0 && cited.length > 0,
    citedRefs: Object.freeze([...new Set(cited)].sort()),
    invalidRefs: Object.freeze([...new Set(invalid)].sort()),
  });
}

export function fullPlannerSchemaConstructCountsV1(schema: unknown): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries([
    "type", "properties", "required", "additionalProperties", "const", "enum", "anyOf", "pattern",
    "minItems", "maxItems", "minLength", "maxLength", "$ref", "$defs", "oneOf", "allOf",
  ].map((keyword) => [keyword, countSchemaKeywordV2(schema, keyword)])));
}

function systemPrompt(): string {
  return `You are performing one synthetic compatibility preflight for a non-authoritative payment-economics resolution planner.
Use only the enclosed synthetic packet. Do not browse, research, call tools, use external knowledge, or infer any real merchant, processor contract, fee amount, or customer action.
Return one complete object matching the JSON schema. Copy issueId and immutableInputHash exactly and cite only references present in the packet.
The unresolved question is: What economic role does the fictitious fee SYNTHETIC SERVICE PROGRAM X represent?
Use DOCUMENT_REQUIRED. Provide a coherent primary hypothesis that the label may represent a bundled processor service, plus a genuinely different alternative that it may represent a gateway or platform program charge.
Include explicit evidence gaps, confirmation requirements, falsification conditions, a specific synthetic document request, a merchant question, and an operational-data request. Keep researchQuerySuggestions empty because no research is authorized.
Do not create a financial reconstruction suspicion. Do not resolve the question. Preserve all NON_AUTHORITATIVE authority constants and uncertainty.`;
}

function validateHypothesisShape(value: unknown, path: string, errors: string[]): void {
  const hypothesis = asRecord(value);
  if (!hypothesis) {
    errors.push(`${path}_not_object`);
    return;
  }
  exactKeys(hypothesis, HYPOTHESIS_KEYS, path, errors);
  for (const key of ["supportingFactRefs", "contradictingFactRefs", "acknowledgedEvidenceGaps", "confirmationRequirements", "falsificationConditions"]) {
    if (!Array.isArray(hypothesis[key])) errors.push(`${path}.${key}_not_array`);
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) errors.push(`${path}_keys_invalid`);
}

function collectRefs(value: unknown, allowed: ReadonlySet<string>, cited: string[], invalid: string[]): void {
  if (!Array.isArray(value)) return;
  for (const ref of value) {
    if (typeof ref !== "string") continue;
    cited.push(ref);
    if (!allowed.has(ref)) invalid.push(ref);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}
