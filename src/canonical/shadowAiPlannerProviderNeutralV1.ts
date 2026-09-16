import { createHash } from "node:crypto";

import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "./shadowAiEconomicResolutionIssueSelectionV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "./shadowAiEconomicResolutionPlannerRuntimeV1.js";
import {
  SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
  SHADOW_AI_EVIDENCE_CLASSES,
  SHADOW_AI_RESOLUTION_PATHS,
  type ShadowAiEconomicResolutionPacketV1,
  type ShadowAiEconomicResolutionPlanV1,
  type ShadowAiPlannerProviderUsageV1,
  type ShadowAiRequiredEvidenceClassV1,
  type ShadowAiResolutionPathV1,
} from "./shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "./v2/canonicalJson.js";

export const SHADOW_AI_PROVIDER_NEUTRAL_REQUEST_SCHEMA_VERSION_V1 =
  "shadow_ai_provider_neutral_request_2026_09_16_v1" as const;
export const SHADOW_AI_PROVIDER_NEUTRAL_DRAFT_SCHEMA_VERSION_V1 =
  "shadow_ai_provider_neutral_draft_2026_09_16_v1" as const;
export const SHADOW_AI_PROVIDER_NEUTRAL_SCHEMA_NAME_V1 =
  "ratereveal_planner_draft_v1" as const;

export const SHADOW_AI_PROVIDER_KINDS_V1 = ["OPENAI_DIRECT", "OPENROUTER"] as const;
export type ShadowAiProviderKindV1 = typeof SHADOW_AI_PROVIDER_KINDS_V1[number];

export const SHADOW_AI_REFERENCE_CLASSES_V1 = [
  "FACT",
  "STATEMENT_EVIDENCE",
  "GOVERNED_EVIDENCE",
  "ECONOMIC_CHARGE",
] as const;
export type ShadowAiReferenceClassV1 = typeof SHADOW_AI_REFERENCE_CLASSES_V1[number];

export type ShadowAiReferenceAliasEntryV1 = Readonly<{
  token: string;
  referenceClass: ShadowAiReferenceClassV1;
  internalReference: string;
}>;

export type ShadowAiPlannerLocalBindingV1 = Readonly<{
  issueId: string;
  inputHash: string;
  packet: ShadowAiEconomicResolutionPacketV1;
  referenceAliases: readonly ShadowAiReferenceAliasEntryV1[];
}>;

export type ShadowAiPlannerProviderRequestV1 = Readonly<{
  schemaVersion: typeof SHADOW_AI_PROVIDER_NEUTRAL_REQUEST_SCHEMA_VERSION_V1;
  schemaName: typeof SHADOW_AI_PROVIDER_NEUTRAL_SCHEMA_NAME_V1;
  systemInstruction: string;
  userPayload: string;
  outputSchema: Readonly<Record<string, unknown>>;
}>;

export type CompiledShadowAiPlannerProviderRequestV1 = Readonly<{
  request: ShadowAiPlannerProviderRequestV1;
  localBinding: ShadowAiPlannerLocalBindingV1;
}>;

export type ShadowAiPlannerTransportResultV1 = Readonly<{
  rawDraft: unknown;
  usage: ShadowAiPlannerProviderUsageV1;
  providerRequestId: string | null;
  returnedModel: string | null;
}>;

export type ShadowAiPlannerTransportAdapterV1 = Readonly<{
  adapterId: string;
  transport: "PROVIDER" | "EVALUATION_STUB";
  providerKind: ShadowAiProviderKindV1;
  model: string;
  invoke(input: Readonly<{
    request: ShadowAiPlannerProviderRequestV1;
    signal: AbortSignal;
  }>): Promise<ShadowAiPlannerTransportResultV1>;
}>;

export type ShadowAiPlannerDraftHypothesisV1 = Readonly<{
  hypothesis: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  supportingReferenceTokens: readonly string[];
  contradictingReferenceTokens: readonly string[];
  acknowledgedEvidenceGaps: readonly string[];
  confirmationRequirements: readonly string[];
  falsificationConditions: readonly string[];
}>;

export type ShadowAiPlannerDraftReconstructionSuspicionV1 = Readonly<{
  exactAcceptedReferenceTokens: readonly string[];
  reasonForSuspicion: string;
  conflictingReferenceTokens: readonly string[];
  requestedDeterministicRecheckType:
    | "PARSER_SOURCE_OCCURRENCE_RECHECK"
    | "RD_RECONCILIATION_RECHECK"
    | "POPULATION_IDENTITY_RECHECK"
    | "DIRECTION_SIGN_RECHECK"
    | "DUPLICATE_OCCURRENCE_RECHECK"
    | "ROUNDING_CONTROL_RECHECK";
}>;

export type ShadowAiPlannerDraftV1 = Readonly<{
  exactCitedReferenceTokens: readonly string[];
  unresolvedQuestion: string;
  primaryHypothesis: ShadowAiPlannerDraftHypothesisV1;
  alternativeHypotheses: readonly ShadowAiPlannerDraftHypothesisV1[];
  acknowledgedEvidenceGaps: readonly string[];
  recommendedResolutionPath: ShadowAiResolutionPathV1;
  requiredEvidenceClasses: readonly ShadowAiRequiredEvidenceClassV1[];
  researchQuerySuggestions: readonly string[];
  merchantQuestionSuggestions: readonly string[];
  documentRequestSuggestions: readonly string[];
  operationalDataRequests: readonly string[];
  internalExplanationDraft: string | null;
  limitationCodes: readonly string[];
  reconstructionSuspicions: readonly ShadowAiPlannerDraftReconstructionSuspicionV1[];
}>;

export type ShadowAiPlannerDraftValidationResultV1 =
  | Readonly<{ ok: true; plan: ShadowAiEconomicResolutionPlanV1; errors: readonly [] }>
  | Readonly<{ ok: false; plan: null; errors: readonly string[] }>;

const DRAFT_KEYS = new Set([
  "exactCitedReferenceTokens", "unresolvedQuestion", "primaryHypothesis", "alternativeHypotheses",
  "acknowledgedEvidenceGaps", "recommendedResolutionPath", "requiredEvidenceClasses",
  "researchQuerySuggestions", "merchantQuestionSuggestions", "documentRequestSuggestions",
  "operationalDataRequests", "internalExplanationDraft", "limitationCodes", "reconstructionSuspicions",
]);
const HYPOTHESIS_KEYS = new Set([
  "hypothesis", "confidence", "supportingReferenceTokens", "contradictingReferenceTokens",
  "acknowledgedEvidenceGaps", "confirmationRequirements", "falsificationConditions",
]);
const SUSPICION_KEYS = new Set([
  "exactAcceptedReferenceTokens", "reasonForSuspicion", "conflictingReferenceTokens",
  "requestedDeterministicRecheckType",
]);
const RECHECK_TYPES = new Set([
  "PARSER_SOURCE_OCCURRENCE_RECHECK", "RD_RECONCILIATION_RECHECK", "POPULATION_IDENTITY_RECHECK",
  "DIRECTION_SIGN_RECHECK", "DUPLICATE_OCCURRENCE_RECHECK", "ROUNDING_CONTROL_RECHECK",
]);
const PROVIDER_FORBIDDEN_KEYS = new Set([
  "issueId", "inputHash", "schemaVersion", "outputType", "authority", "admissionStatus", "truthEffect",
  "financialMutationAllowed", "customerRenderingAllowed", "unresolvedAfterAnalysis",
]);
const REFERENCE_CLASS_CODE: Readonly<Record<ShadowAiReferenceClassV1, string>> = Object.freeze({
  FACT: "f",
  STATEMENT_EVIDENCE: "s",
  GOVERNED_EVIDENCE: "g",
  ECONOMIC_CHARGE: "c",
});

export function providerNeutralPlannerSystemInstructionV1(): string {
  return `You are a non-authoritative payment-economics resolution planner operating in shadow mode.
Analyze only the unresolved issue and bounded context in the user payload. Accepted facts are authoritative inputs; UNKNOWN, CONFLICTING, and UNAVAILABLE remain unresolved.
Return only an untrusted inference draft matching the supplied JSON schema. RateReveal, not you, owns issue identity, authority, permissions, financial truth, reference admission, and final validation.
Never invent a merchant-specific fee, participant, population, amount, rate, program, document, operational event, or reference token. Cite only opaque reference tokens present in the payload.
Generate hypotheses only for the selected issue. State evidence gaps, confirmation requirements, and falsification conditions. Provide materially distinct alternatives where meaningful.
Choose the most appropriate resolution path from the schema. Do not browse, call tools, admit evidence, mutate truth, calculate savings, make comparisons, assign blame, or create customer output.
Use researchQuerySuggestions only for PUBLIC_RESEARCH_REQUIRED. Keep it empty for every other route.`;
}

export function providerNeutralPlannerDraftSchemaV1(): Readonly<Record<string, unknown>> {
  const string = { type: "string" } as const;
  const strings = { type: "array", items: string } as const;
  const hypothesis = {
    type: "object",
    additionalProperties: false,
    properties: {
      hypothesis: string,
      confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      supportingReferenceTokens: strings,
      contradictingReferenceTokens: strings,
      acknowledgedEvidenceGaps: strings,
      confirmationRequirements: strings,
      falsificationConditions: strings,
    },
    required: [...HYPOTHESIS_KEYS],
  };
  const suspicion = {
    type: "object",
    additionalProperties: false,
    properties: {
      exactAcceptedReferenceTokens: strings,
      reasonForSuspicion: string,
      conflictingReferenceTokens: strings,
      requestedDeterministicRecheckType: { type: "string", enum: [...RECHECK_TYPES] },
    },
    required: [...SUSPICION_KEYS],
  };
  return deepFreeze({
    type: "object",
    additionalProperties: false,
    properties: {
      exactCitedReferenceTokens: strings,
      unresolvedQuestion: string,
      primaryHypothesis: hypothesis,
      alternativeHypotheses: { type: "array", items: hypothesis },
      acknowledgedEvidenceGaps: strings,
      recommendedResolutionPath: { type: "string", enum: [...SHADOW_AI_RESOLUTION_PATHS] },
      requiredEvidenceClasses: { type: "array", items: { type: "string", enum: [...SHADOW_AI_EVIDENCE_CLASSES] } },
      researchQuerySuggestions: strings,
      merchantQuestionSuggestions: strings,
      documentRequestSuggestions: strings,
      operationalDataRequests: strings,
      internalExplanationDraft: { anyOf: [string, { type: "null" }] },
      limitationCodes: strings,
      reconstructionSuspicions: { type: "array", items: suspicion },
    },
    required: [...DRAFT_KEYS],
  });
}

export function compileShadowAiPlannerProviderRequestV1(
  packet: ShadowAiEconomicResolutionPacketV1,
): CompiledShadowAiPlannerProviderRequestV1 {
  const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  if (!privacy.valid) throw new Error(`shadow_planner_provider_neutral_packet_privacy_invalid:${privacy.reasonCodes.join(",")}`);

  const referenceAliases = buildReferenceAliases(packet);
  const byInternal = new Map(referenceAliases.map((entry) => [`${entry.referenceClass}\u0000${entry.internalReference}`, entry.token] as const));
  const token = (referenceClass: ShadowAiReferenceClassV1, internalReference: string): string => {
    const value = byInternal.get(`${referenceClass}\u0000${internalReference}`);
    if (!value) throw new Error(`shadow_planner_provider_neutral_alias_missing:${referenceClass}`);
    return value;
  };
  const providerPacket = {
    purpose: packet.purpose,
    issueClass: packet.issueClass,
    processorFamily: packet.processorFamily,
    processorProgram: packet.processorProgram,
    statementPeriod: packet.statementPeriod,
    acceptedIssueRelevantActivityFacts: packet.acceptedIssueRelevantActivityFacts.map((fact) => ({
      ...deepClone(fact),
      factRef: token("FACT", fact.factRef),
      evidenceRefs: fact.evidenceRefs.map((reference) => token("STATEMENT_EVIDENCE", reference)),
    })),
    selectedRdChargeRefs: packet.selectedRdChargeRefs.map((reference) => token("ECONOMIC_CHARGE", reference)),
    sanitizedFeeLabels: [...packet.sanitizedFeeLabels],
    acceptedEconomicCategories: [...packet.acceptedEconomicCategories],
    acceptedSensitivityStates: [...packet.acceptedSensitivityStates],
    acceptedQualificationIntegrityState: packet.acceptedQualificationIntegrityState,
    acceptedParticipantControlStates: packet.acceptedParticipantControlStates.map((state) => ({
      ...deepClone(state),
      rdChargeRef: token("ECONOMIC_CHARGE", state.rdChargeRef),
    })),
    unresolvedClaimFacets: [...packet.unresolvedClaimFacets],
    unresolvedReasonCodes: [...packet.unresolvedReasonCodes],
    acceptedFactRefs: packet.acceptedFactRefs.map((reference) => token("FACT", reference)),
    currentGovernedEvidenceRefs: packet.currentGovernedEvidenceRefs.map((reference) => token("GOVERNED_EVIDENCE", reference)),
    allowedEvidenceClasses: [...packet.allowedEvidenceClasses],
    prohibitedConclusions: [...packet.prohibitedConclusions],
    merchantBusinessContext: providerBusinessContext(packet.merchantBusinessContext),
    competingHypothesisRequired: packet.competingHypothesisRequired,
  };
  const issueContext = {
    issueClass: packet.issueClass,
    unresolvedQuestion: `What remains unresolved for ${packet.issueClass} across [${packet.unresolvedClaimFacets.join(", ") || "no supplied facets"}] given [${packet.unresolvedReasonCodes.join(", ") || "no supplied reason codes"}]?`,
    unresolvedFacets: [...packet.unresolvedClaimFacets],
    unresolvedReasonCodes: [...packet.unresolvedReasonCodes],
  };
  const userPayload = canonicalJson({ issueContext, packet: providerPacket });
  inspectProviderPayload(userPayload, referenceAliases);
  return deepFreeze({
    request: {
      schemaVersion: SHADOW_AI_PROVIDER_NEUTRAL_REQUEST_SCHEMA_VERSION_V1,
      schemaName: SHADOW_AI_PROVIDER_NEUTRAL_SCHEMA_NAME_V1,
      systemInstruction: providerNeutralPlannerSystemInstructionV1(),
      userPayload,
      outputSchema: providerNeutralPlannerDraftSchemaV1(),
    },
    localBinding: {
      issueId: packet.issueId,
      inputHash: packet.immutableInputHash,
      packet,
      referenceAliases,
    },
  });
}

export function validateAndBindShadowAiPlannerDraftV1(
  rawDraft: unknown,
  binding: ShadowAiPlannerLocalBindingV1,
): ShadowAiPlannerDraftValidationResultV1 {
  const parsed = parseDraft(rawDraft);
  if (!parsed.ok) return parsed;
  const aliases = new Map(binding.referenceAliases.map((entry) => [entry.token, entry] as const));
  const errors: string[] = [];
  const restore = (values: readonly string[], classes: readonly ShadowAiReferenceClassV1[], path: string): string[] => {
    const restored: string[] = [];
    for (const value of values) {
      const entry = aliases.get(value);
      if (!entry) errors.push(`${path}_unknown_reference_token`);
      else if (!classes.includes(entry.referenceClass)) errors.push(`${path}_wrong_reference_class`);
      else restored.push(entry.internalReference);
    }
    return restored;
  };
  const hypothesis = (value: ShadowAiPlannerDraftHypothesisV1) => ({
    hypothesis: value.hypothesis,
    confidence: value.confidence,
    supportingFactRefs: restore(value.supportingReferenceTokens, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"], "hypothesis.supportingReferenceTokens"),
    contradictingFactRefs: restore(value.contradictingReferenceTokens, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"], "hypothesis.contradictingReferenceTokens"),
    acknowledgedEvidenceGaps: [...value.acknowledgedEvidenceGaps],
    confirmationRequirements: [...value.confirmationRequirements],
    falsificationConditions: [...value.falsificationConditions],
  });
  const candidate = {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
    outputType: "AI_INFERENCE_ONLY",
    authority: "NON_AUTHORITATIVE",
    admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE",
    financialMutationAllowed: false,
    customerRenderingAllowed: false,
    issueId: binding.issueId,
    inputHash: binding.inputHash,
    exactCitedFactRefs: restore(parsed.draft.exactCitedReferenceTokens, ["FACT"], "exactCitedReferenceTokens"),
    unresolvedQuestion: parsed.draft.unresolvedQuestion,
    primaryHypothesis: hypothesis(parsed.draft.primaryHypothesis),
    alternativeHypotheses: parsed.draft.alternativeHypotheses.map(hypothesis),
    acknowledgedEvidenceGaps: [...parsed.draft.acknowledgedEvidenceGaps],
    recommendedResolutionPath: parsed.draft.recommendedResolutionPath,
    requiredEvidenceClasses: [...parsed.draft.requiredEvidenceClasses],
    researchQuerySuggestions: [...parsed.draft.researchQuerySuggestions],
    merchantQuestionSuggestions: [...parsed.draft.merchantQuestionSuggestions],
    documentRequestSuggestions: [...parsed.draft.documentRequestSuggestions],
    operationalDataRequests: [...parsed.draft.operationalDataRequests],
    internalExplanationDraft: parsed.draft.internalExplanationDraft,
    unresolvedAfterAnalysis: true,
    limitationCodes: [...parsed.draft.limitationCodes],
    reconstructionSuspicions: parsed.draft.reconstructionSuspicions.map((suspicion) => ({
      outcomeType: "FINANCIAL_RECONSTRUCTION_SUSPICION",
      authority: "NON_AUTHORITATIVE",
      admissionStatus: "NOT_ADMITTED",
      truthEffect: "NONE",
      financialMutationAllowed: false,
      exactAcceptedFactOrOccurrenceRefs: restore(suspicion.exactAcceptedReferenceTokens, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"], "reconstructionSuspicion.exactAcceptedReferenceTokens"),
      reasonForSuspicion: suspicion.reasonForSuspicion,
      conflictingEvidenceRefs: restore(suspicion.conflictingReferenceTokens, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"], "reconstructionSuspicion.conflictingReferenceTokens"),
      requestedDeterministicRecheckType: suspicion.requestedDeterministicRecheckType,
    })),
  };
  if (errors.length > 0) return invalid(errors);
  const validated = validateShadowAiEconomicResolutionPlanV1(candidate, binding.packet);
  return validated.ok
    ? deepFreeze({ ok: true as const, plan: validated.plan, errors: [] as const })
    : invalid(validated.errors);
}

function parseDraft(rawDraft: unknown):
  | Readonly<{ ok: true; draft: ShadowAiPlannerDraftV1; errors: readonly [] }>
  | Readonly<{ ok: false; plan: null; errors: readonly string[] }> {
  if (!isRecord(rawDraft)) return invalid(["shadow_planner_draft_not_object"]);
  const errors: string[] = [];
  findForbiddenProviderKeys(rawDraft, "$", errors);
  exactKeys(rawDraft, DRAFT_KEYS, "draft", errors);
  const primary = parseHypothesis(rawDraft.primaryHypothesis, "primaryHypothesis", errors);
  const alternatives = boundedArray(rawDraft.alternativeHypotheses, "alternativeHypotheses", 5, errors)
    .map((value, index) => parseHypothesis(value, `alternativeHypotheses[${index}]`, errors))
    .filter((value): value is ShadowAiPlannerDraftHypothesisV1 => value !== null);
  const suspicions = boundedArray(rawDraft.reconstructionSuspicions, "reconstructionSuspicions", 3, errors)
    .map((value, index) => parseSuspicion(value, `reconstructionSuspicions[${index}]`, errors))
    .filter((value): value is ShadowAiPlannerDraftReconstructionSuspicionV1 => value !== null);
  const exactCitedReferenceTokens = stringList(rawDraft.exactCitedReferenceTokens, "exactCitedReferenceTokens", 16, errors);
  const unresolvedQuestion = text(rawDraft.unresolvedQuestion, "unresolvedQuestion", errors);
  const acknowledgedEvidenceGaps = stringList(rawDraft.acknowledgedEvidenceGaps, "acknowledgedEvidenceGaps", 16, errors);
  const recommendedResolutionPath = SHADOW_AI_RESOLUTION_PATHS.includes(rawDraft.recommendedResolutionPath as never)
    ? rawDraft.recommendedResolutionPath as ShadowAiResolutionPathV1 : null;
  if (!recommendedResolutionPath) errors.push("recommendedResolutionPath_invalid");
  const requiredEvidenceClasses = stringList(rawDraft.requiredEvidenceClasses, "requiredEvidenceClasses", SHADOW_AI_EVIDENCE_CLASSES.length, errors);
  if (requiredEvidenceClasses.length === 0 || requiredEvidenceClasses.some((value) => !SHADOW_AI_EVIDENCE_CLASSES.includes(value as never))) {
    errors.push("requiredEvidenceClasses_invalid");
  }
  const research = stringList(rawDraft.researchQuerySuggestions, "researchQuerySuggestions", 16, errors);
  const merchant = stringList(rawDraft.merchantQuestionSuggestions, "merchantQuestionSuggestions", 16, errors);
  const documents = stringList(rawDraft.documentRequestSuggestions, "documentRequestSuggestions", 16, errors);
  const operational = stringList(rawDraft.operationalDataRequests, "operationalDataRequests", 16, errors);
  const limitations = stringList(rawDraft.limitationCodes, "limitationCodes", 16, errors);
  const internalExplanationDraft = rawDraft.internalExplanationDraft === null
    ? null : text(rawDraft.internalExplanationDraft, "internalExplanationDraft", errors);
  if (!primary || !unresolvedQuestion || !recommendedResolutionPath || errors.length > 0) return invalid(errors);
  return deepFreeze({
    ok: true as const,
    errors: [] as const,
    draft: {
      exactCitedReferenceTokens,
      unresolvedQuestion,
      primaryHypothesis: primary,
      alternativeHypotheses: alternatives,
      acknowledgedEvidenceGaps,
      recommendedResolutionPath,
      requiredEvidenceClasses: requiredEvidenceClasses as ShadowAiRequiredEvidenceClassV1[],
      researchQuerySuggestions: research,
      merchantQuestionSuggestions: merchant,
      documentRequestSuggestions: documents,
      operationalDataRequests: operational,
      internalExplanationDraft,
      limitationCodes: limitations,
      reconstructionSuspicions: suspicions,
    },
  });
}

function parseHypothesis(value: unknown, path: string, errors: string[]): ShadowAiPlannerDraftHypothesisV1 | null {
  if (!isRecord(value)) { errors.push(`${path}_invalid`); return null; }
  exactKeys(value, HYPOTHESIS_KEYS, path, errors);
  const hypothesis = text(value.hypothesis, `${path}.hypothesis`, errors);
  const confidence = ["LOW", "MEDIUM", "HIGH"].includes(String(value.confidence))
    ? value.confidence as ShadowAiPlannerDraftHypothesisV1["confidence"] : null;
  if (!confidence) errors.push(`${path}.confidence_invalid`);
  const supporting = stringList(value.supportingReferenceTokens, `${path}.supportingReferenceTokens`, 16, errors);
  const contradicting = stringList(value.contradictingReferenceTokens, `${path}.contradictingReferenceTokens`, 16, errors);
  const gaps = stringList(value.acknowledgedEvidenceGaps, `${path}.acknowledgedEvidenceGaps`, 16, errors);
  const confirmations = stringList(value.confirmationRequirements, `${path}.confirmationRequirements`, 16, errors);
  const falsifiers = stringList(value.falsificationConditions, `${path}.falsificationConditions`, 16, errors);
  if (supporting.length === 0 || gaps.length === 0 || confirmations.length === 0 || falsifiers.length === 0) {
    errors.push(`${path}_epistemic_boundary_incomplete`);
  }
  return hypothesis && confidence ? { hypothesis, confidence, supportingReferenceTokens: supporting,
    contradictingReferenceTokens: contradicting, acknowledgedEvidenceGaps: gaps,
    confirmationRequirements: confirmations, falsificationConditions: falsifiers } : null;
}

function parseSuspicion(value: unknown, path: string, errors: string[]): ShadowAiPlannerDraftReconstructionSuspicionV1 | null {
  if (!isRecord(value)) { errors.push(`${path}_invalid`); return null; }
  exactKeys(value, SUSPICION_KEYS, path, errors);
  const refs = stringList(value.exactAcceptedReferenceTokens, `${path}.exactAcceptedReferenceTokens`, 16, errors);
  const reason = text(value.reasonForSuspicion, `${path}.reasonForSuspicion`, errors);
  const conflicting = stringList(value.conflictingReferenceTokens, `${path}.conflictingReferenceTokens`, 16, errors);
  const recheck = RECHECK_TYPES.has(String(value.requestedDeterministicRecheckType))
    ? value.requestedDeterministicRecheckType as ShadowAiPlannerDraftReconstructionSuspicionV1["requestedDeterministicRecheckType"] : null;
  if (refs.length === 0) errors.push(`${path}.exactAcceptedReferenceTokens_required`);
  if (!recheck) errors.push(`${path}.requestedDeterministicRecheckType_invalid`);
  return reason && recheck ? { exactAcceptedReferenceTokens: refs, reasonForSuspicion: reason,
    conflictingReferenceTokens: conflicting, requestedDeterministicRecheckType: recheck } : null;
}

function buildReferenceAliases(packet: ShadowAiEconomicResolutionPacketV1): readonly ShadowAiReferenceAliasEntryV1[] {
  const scope = createHash("sha256").update(`${packet.issueId}\u0000${packet.immutableInputHash}`).digest("hex").slice(0, 12);
  const references: Array<readonly [ShadowAiReferenceClassV1, string]> = [
    ...packet.acceptedFactRefs.map((value) => ["FACT", value] as const),
    ...packet.acceptedIssueRelevantActivityFacts.map((fact) => ["FACT", fact.factRef] as const),
    ...packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => fact.evidenceRefs.map((value) => ["STATEMENT_EVIDENCE", value] as const)),
    ...packet.currentGovernedEvidenceRefs.map((value) => ["GOVERNED_EVIDENCE", value] as const),
    ...packet.selectedRdChargeRefs.map((value) => ["ECONOMIC_CHARGE", value] as const),
    ...packet.acceptedParticipantControlStates.map((state) => ["ECONOMIC_CHARGE", state.rdChargeRef] as const),
  ];
  const unique = [...new Map(references.map(([referenceClass, value]) => [`${referenceClass}\u0000${value}`, [referenceClass, value] as const])).values()]
    .sort(([leftClass, left], [rightClass, right]) => leftClass.localeCompare(rightClass) || left.localeCompare(right));
  return deepFreeze(unique.map(([referenceClass, internalReference], index) => ({
    token: `rr_${scope}_${REFERENCE_CLASS_CODE[referenceClass]}_${String(index + 1).padStart(4, "0")}`,
    referenceClass,
    internalReference,
  })));
}

function providerBusinessContext(context: ShadowAiEconomicResolutionPacketV1["merchantBusinessContext"]): unknown {
  if (!context) return null;
  return {
    ...deepClone(context),
    businessName: context.naturalPersonOrSoleProprietorAmbiguity === "POSSIBLE" ? null : context.businessName,
  };
}

function inspectProviderPayload(payload: string, aliases: readonly ShadowAiReferenceAliasEntryV1[]): void {
  const forbidden = aliases.map((entry) => entry.internalReference).filter((value) => value.length >= 4);
  if (forbidden.some((value) => payload.includes(value))) throw new Error("shadow_planner_provider_neutral_raw_reference_leakage");
  if (/\/Users\/|\/private\/|\bdocument-ir:|\bsrcocc_|\.pdf\b/i.test(payload)) {
    throw new Error("shadow_planner_provider_neutral_source_identity_leakage");
  }
}

function findForbiddenProviderKeys(value: unknown, path: string, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenProviderKeys(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (PROVIDER_FORBIDDEN_KEYS.has(key)) errors.push(`shadow_planner_draft_forbidden_authority_key:${path}.${key}`);
    findForbiddenProviderKeys(child, `${path}.${key}`, errors);
  }
}

function exactKeys(value: Record<string, unknown>, expected: Set<string>, path: string, errors: string[]): void {
  const actual = new Set(Object.keys(value));
  for (const key of actual) if (!expected.has(key)) errors.push(`${path}_unknown_key:${key}`);
  for (const key of expected) if (!actual.has(key)) errors.push(`${path}_missing_key:${key}`);
}

function boundedArray(value: unknown, path: string, maximum: number, errors: string[]): unknown[] {
  if (!Array.isArray(value)) { errors.push(`${path}_invalid`); return []; }
  if (value.length > maximum) errors.push(`${path}_too_many_items`);
  return value;
}

function stringList(value: unknown, path: string, maximum: number, errors: string[]): string[] {
  const values = boundedArray(value, path, maximum, errors);
  if (values.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > 500)) {
    errors.push(`${path}_invalid`);
    return [];
  }
  const strings = values.map((item) => (item as string).trim());
  if (new Set(strings).size !== strings.length) errors.push(`${path}_duplicates`);
  return strings;
}

function text(value: unknown, path: string, errors: string[]): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2_000) {
    errors.push(`${path}_invalid`);
    return null;
  }
  return value.trim();
}

function invalid(errors: readonly string[]): Readonly<{ ok: false; plan: null; errors: readonly string[] }> {
  return deepFreeze({ ok: false as const, plan: null, errors: [...new Set(errors)].sort() });
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
