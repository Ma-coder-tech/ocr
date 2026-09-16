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
import {
  shadowAiIssueSemanticContractV1,
  type ShadowAiGuidanceChannelV1,
  type ShadowAiIssueSemanticContractV1,
} from "./shadowAiPlannerSemanticContractV1.js";

export const SHADOW_AI_PROVIDER_NEUTRAL_REQUEST_SCHEMA_VERSION_V1 =
  "shadow_ai_provider_neutral_request_2026_09_16_v4" as const;
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

export const SHADOW_AI_REFERENCE_ROLES_V1 = [
  "ISSUE_SUPPORTING",
  "CONTEXT_ONLY",
  "INPUT_PROVENANCE_ONLY",
] as const;
export type ShadowAiReferenceRoleV1 = typeof SHADOW_AI_REFERENCE_ROLES_V1[number];

export type ShadowAiReferenceAliasEntryV1 = Readonly<{
  token: string;
  referenceClass: ShadowAiReferenceClassV1;
  semanticRole: ShadowAiReferenceRoleV1;
  internalReference: string;
}>;

export type ShadowAiPlannerLocalSemanticContractV1 = Readonly<{
  issue: ShadowAiIssueSemanticContractV1;
  issueSupportingReferenceTokens: readonly string[];
  issueSupportingFactTokens: readonly string[];
  reconstructionSuspicionAllowed: false;
}>;

export type ShadowAiPlannerLocalBindingV1 = Readonly<{
  issueId: string;
  inputHash: string;
  packet: ShadowAiEconomicResolutionPacketV1;
  referenceAliases: readonly ShadowAiReferenceAliasEntryV1[];
  semanticContract: ShadowAiPlannerLocalSemanticContractV1;
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
  safeTelemetry: Readonly<{
    httpStatus: number;
    requestSha256: string;
    schemaSha256: string;
    finishReason: string | null;
    routedProvider: string | null;
    transportTimings?: Readonly<{
      connectionReused: boolean | null;
      connectionMs: number | null;
      responseHeadersMs: number | null;
      responseBodyMs: number | null;
      cleanupMs: number | null;
      failureElapsedMs: number | null;
    }>;
  }>;
}>;

export type ShadowAiPlannerTransportAdapterV1 = Readonly<{
  adapterId: string;
  transport: "PROVIDER" | "EVALUATION_STUB";
  providerKind: ShadowAiProviderKindV1;
  model: string;
  safeConfiguration: Readonly<{
    maximumOutputTokens: number;
    reasoningEffort: "none";
    verbosity: "low";
    verbosityControl: "NATIVE_PARAMETER" | "PROVIDER_NEUTRAL_INSTRUCTION";
    providerFallbackAllowed: false;
    routedProviderConstraint: string | null;
    dataCollection: "DIRECT_STORE_DISABLED" | "deny";
  }>;
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
const EXACT_CITATION_REFERENCE_CLASSES = ["FACT"] as const;
const ANALYTIC_REFERENCE_CLASSES = ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"] as const;
const NON_OUTPUT_REFERENCE_CLASSES = ["STATEMENT_EVIDENCE"] as const;

export function providerNeutralPlannerSystemInstructionV1(): string {
  return `You are a non-authoritative payment-economics resolution planner operating in shadow mode.
Analyze only the unresolved issue and bounded context in the user payload. Accepted facts are authoritative inputs; UNKNOWN, CONFLICTING, and UNAVAILABLE remain unresolved.
Return only an untrusted inference draft matching the supplied JSON schema. RateReveal, not you, owns issue identity, authority, permissions, financial truth, reference admission, and final validation.
Never invent a merchant-specific fee, participant, population, amount, rate, program, document, operational event, or reference token. Cite only opaque reference tokens present in the payload.
The payload's referenceTokenContract is the complete reference-class and semantic-role guide for this request. Copy tokens only from its catalog and obey its allowedClassesByOutputField and eligibility rules exactly. Do not infer a token's class or role from its spelling or location elsewhere in the packet.
exactCitedReferenceTokens accepts ISSUE_SUPPORTING FACT tokens only. Hypothesis supportingReferenceTokens and contradictingReferenceTokens accept ISSUE_SUPPORTING FACT, GOVERNED_EVIDENCE, or ECONOMIC_CHARGE tokens only. CONTEXT_ONLY tokens may inform framing but must never be cited as support or contradiction. STATEMENT_EVIDENCE tokens are INPUT_PROVENANCE_ONLY and must never be emitted in any output reference-token array.
If issueSupportingReferenceTokens is non-empty, every hypothesis must cite at least one eligible token. If it is empty, every hypothesis must use LOW confidence, an empty supportingReferenceTokens array, and non-empty evidence gaps, confirmation requirements, and falsification conditions. Never substitute a context-only or provenance token.
The payload's resolutionContract is deterministic and mandatory. Copy its requiredResolutionPath exactly, copy its requiredEvidenceClasses exactly with no additions, populate only its requiredGuidanceChannel, and keep every other guidance channel empty. The JSON schema's global enums are structural only and grant no request-specific authority.
The payload's reconstructionSuspicionContract is mandatory. Emit reconstructionSuspicions only when allowed is true and an accepted conflict relationship is supplied. Missing evidence, population uncertainty, or a desire to recheck is not conflicting evidence. When allowed is false, return an empty reconstructionSuspicions array.
Use low verbosity: keep every free-text field concise, factual, and limited to what is needed to express the unresolved hypothesis, evidence gap, confirmation requirement, or falsification condition. Do not add narrative outside the required JSON fields.
Generate hypotheses only for the selected issue. State evidence gaps, confirmation requirements, and falsification conditions. Provide materially distinct alternatives where meaningful.
Do not browse, call tools, admit evidence, mutate truth, calculate savings, make comparisons, assign blame, or create customer output.`;
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
  const issueContract = shadowAiIssueSemanticContractV1(packet.issueClass);
  if (!issueContract.requiredEvidenceClasses.every((value) => packet.allowedEvidenceClasses.includes(value))) {
    throw new Error("shadow_planner_provider_neutral_resolution_contract_not_allowed");
  }
  const issueSupportingAliases = referenceAliases.filter((entry) => entry.semanticRole === "ISSUE_SUPPORTING");
  const issueSupportingFactAliases = issueSupportingAliases.filter((entry) => entry.referenceClass === "FACT");
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
      semanticRole: issueSupportingFactAliases.some((entry) => entry.internalReference === fact.factRef)
        ? "ISSUE_SUPPORTING" : "CONTEXT_ONLY",
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
  const referenceTokenContract = {
    catalog: referenceAliases.map(({ token: opaqueToken, referenceClass, semanticRole }) => ({
      token: opaqueToken,
      referenceClass,
      semanticRole,
    })),
    allowedClassesByOutputField: {
      exactCitedReferenceTokens: [...EXACT_CITATION_REFERENCE_CLASSES],
      hypothesisSupportingReferenceTokens: [...ANALYTIC_REFERENCE_CLASSES],
      hypothesisContradictingReferenceTokens: [...ANALYTIC_REFERENCE_CLASSES],
      reconstructionSuspicionExactAcceptedReferenceTokens: [...ANALYTIC_REFERENCE_CLASSES],
      reconstructionSuspicionConflictingReferenceTokens: [...ANALYTIC_REFERENCE_CLASSES],
    },
    prohibitedOutputClasses: [...NON_OUTPUT_REFERENCE_CLASSES],
    issueSupportingReferenceTokens: issueSupportingAliases.map((entry) => entry.token),
    issueSupportingFactTokens: issueSupportingFactAliases.map((entry) => entry.token),
    contextOnlyReferenceTokens: referenceAliases
      .filter((entry) => entry.semanticRole === "CONTEXT_ONLY")
      .map((entry) => entry.token),
    emptySupportRule: issueSupportingAliases.length === 0
      ? "REQUIRED_EMPTY_WITH_LOW_CONFIDENCE_AND_COMPLETE_EPISTEMIC_BOUNDARY"
      : "PROHIBITED_EACH_HYPOTHESIS_MUST_CITE_ISSUE_SUPPORTING_TOKEN",
    exactCitationRule: issueSupportingFactAliases.length === 0
      ? "EMPTY_ALLOWED_NO_ISSUE_SUPPORTING_FACT_EXISTS"
      : "NON_EMPTY_ISSUE_SUPPORTING_FACT_TOKEN_REQUIRED",
  };
  const resolutionContract = {
    requiredResolutionPath: issueContract.resolutionPath,
    requiredEvidenceClasses: [...issueContract.requiredEvidenceClasses],
    requiredGuidanceChannel: issueContract.guidanceChannel,
    guidanceOutputFields: guidanceOutputFields(),
    otherGuidanceChannelsMustBeEmpty: true,
    packetAllowedEvidenceClasses: [...packet.allowedEvidenceClasses],
    prohibitedRequiredEvidenceClasses: SHADOW_AI_EVIDENCE_CLASSES.filter((value) =>
      !issueContract.requiredEvidenceClasses.includes(value as never)),
    globalSchemaEnumPurpose: "STRUCTURAL_PORTABILITY_ONLY_NOT_REQUEST_AUTHORITY",
  };
  const reconstructionSuspicionContract = {
    allowed: false,
    reason: "NO_ACCEPTED_CONFLICT_RELATIONSHIP_PRESENT_IN_PACKET_CONTRACT",
    requiredBehavior: "RETURN_EMPTY_RECONSTRUCTION_SUSPICIONS",
  };
  const userPayload = canonicalJson({
    issueContext,
    reconstructionSuspicionContract,
    referenceTokenContract,
    resolutionContract,
    packet: providerPacket,
  });
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
      semanticContract: {
        issue: issueContract,
        issueSupportingReferenceTokens: issueSupportingAliases.map((entry) => entry.token),
        issueSupportingFactTokens: issueSupportingFactAliases.map((entry) => entry.token),
        reconstructionSuspicionAllowed: false,
      },
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
      else if (entry.semanticRole !== "ISSUE_SUPPORTING") errors.push(`${path}_ineligible_reference_role`);
      else restored.push(entry.internalReference);
    }
    return restored;
  };
  const hypothesis = (value: ShadowAiPlannerDraftHypothesisV1, path: string) => {
    const supportingFactRefs = restore(value.supportingReferenceTokens, ANALYTIC_REFERENCE_CLASSES, `${path}.supportingReferenceTokens`);
    const contradictingFactRefs = restore(value.contradictingReferenceTokens, ANALYTIC_REFERENCE_CLASSES, `${path}.contradictingReferenceTokens`);
    validateHypothesisReferenceContract(value, binding.semanticContract, path, errors);
    return {
      hypothesis: value.hypothesis,
      confidence: value.confidence,
      supportingFactRefs,
      contradictingFactRefs,
      acknowledgedEvidenceGaps: [...value.acknowledgedEvidenceGaps],
      confirmationRequirements: [...value.confirmationRequirements],
      falsificationConditions: [...value.falsificationConditions],
    };
  };
  validateDraftResolutionContract(parsed.draft, binding.semanticContract.issue, errors);
  if (!binding.semanticContract.reconstructionSuspicionAllowed && parsed.draft.reconstructionSuspicions.length > 0) {
    errors.push("shadow_planner_reconstruction_suspicion_not_allowed_without_accepted_conflict");
  }
  if (binding.semanticContract.issueSupportingFactTokens.length > 0
      && parsed.draft.exactCitedReferenceTokens.length === 0) {
    errors.push("shadow_planner_missing_issue_supporting_fact_citation");
  }
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
    exactCitedFactRefs: restore(parsed.draft.exactCitedReferenceTokens, EXACT_CITATION_REFERENCE_CLASSES, "exactCitedReferenceTokens"),
    unresolvedQuestion: parsed.draft.unresolvedQuestion,
    primaryHypothesis: hypothesis(parsed.draft.primaryHypothesis, "primaryHypothesis"),
    alternativeHypotheses: parsed.draft.alternativeHypotheses.map((value, index) =>
      hypothesis(value, `alternativeHypotheses[${index}]`)),
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
      exactAcceptedFactOrOccurrenceRefs: restore(suspicion.exactAcceptedReferenceTokens, ANALYTIC_REFERENCE_CLASSES, "reconstructionSuspicion.exactAcceptedReferenceTokens"),
      reasonForSuspicion: suspicion.reasonForSuspicion,
      conflictingEvidenceRefs: restore(suspicion.conflictingReferenceTokens, ANALYTIC_REFERENCE_CLASSES, "reconstructionSuspicion.conflictingReferenceTokens"),
      requestedDeterministicRecheckType: suspicion.requestedDeterministicRecheckType,
    })),
  };
  if (errors.length > 0) return invalid(errors);
  const validated = validateShadowAiEconomicResolutionPlanV1(candidate, binding.packet);
  return validated.ok
    ? deepFreeze({ ok: true as const, plan: validated.plan, errors: [] as const })
    : invalid(validated.errors);
}

function validateHypothesisReferenceContract(
  value: ShadowAiPlannerDraftHypothesisV1,
  contract: ShadowAiPlannerLocalSemanticContractV1,
  path: string,
  errors: string[],
): void {
  if (contract.issueSupportingReferenceTokens.length > 0) {
    if (value.supportingReferenceTokens.length === 0) {
      errors.push(`${path}_issue_supporting_reference_required`);
    }
    return;
  }
  if (value.supportingReferenceTokens.length > 0) errors.push(`${path}_support_forbidden_without_issue_supporting_reference`);
  if (value.confidence !== "LOW") errors.push(`${path}_low_confidence_required_without_issue_supporting_reference`);
  if (value.acknowledgedEvidenceGaps.length === 0
      || value.confirmationRequirements.length === 0
      || value.falsificationConditions.length === 0) {
    errors.push(`${path}_complete_epistemic_boundary_required_without_support`);
  }
}

function validateDraftResolutionContract(
  draft: ShadowAiPlannerDraftV1,
  contract: ShadowAiIssueSemanticContractV1,
  errors: string[],
): void {
  if (draft.recommendedResolutionPath !== contract.resolutionPath) {
    errors.push("shadow_planner_resolution_path_contract_mismatch");
  }
  if (canonicalJson([...draft.requiredEvidenceClasses].sort())
      !== canonicalJson([...contract.requiredEvidenceClasses].sort())) {
    errors.push("shadow_planner_required_evidence_contract_mismatch");
  }
  const channels: Readonly<Record<Exclude<ShadowAiGuidanceChannelV1, "NONE">, readonly string[]>> = {
    PUBLIC_RESEARCH: draft.researchQuerySuggestions,
    MERCHANT_INPUT: draft.merchantQuestionSuggestions,
    DOCUMENT_REQUEST: draft.documentRequestSuggestions,
    OPERATIONAL_DATA: draft.operationalDataRequests,
  };
  for (const [channel, values] of Object.entries(channels)) {
    const selected = channel === contract.guidanceChannel;
    if (selected && values.length === 0) errors.push("shadow_planner_required_guidance_channel_empty");
    if (!selected && values.length > 0) errors.push("shadow_planner_cross_channel_guidance_forbidden");
  }
}

function guidanceOutputFields(): Readonly<Record<ShadowAiGuidanceChannelV1, string | null>> {
  return {
    NONE: null,
    PUBLIC_RESEARCH: "researchQuerySuggestions",
    MERCHANT_INPUT: "merchantQuestionSuggestions",
    DOCUMENT_REQUEST: "documentRequestSuggestions",
    OPERATIONAL_DATA: "operationalDataRequests",
  };
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
  if (gaps.length === 0 || confirmations.length === 0 || falsifiers.length === 0) {
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
  if (conflicting.length === 0) errors.push(`${path}.conflictingReferenceTokens_required`);
  if (refs.some((reference) => conflicting.includes(reference))) errors.push(`${path}.conflict_references_must_be_distinct`);
  if (!recheck) errors.push(`${path}.requestedDeterministicRecheckType_invalid`);
  return reason && recheck ? { exactAcceptedReferenceTokens: refs, reasonForSuspicion: reason,
    conflictingReferenceTokens: conflicting, requestedDeterministicRecheckType: recheck } : null;
}

function buildReferenceAliases(packet: ShadowAiEconomicResolutionPacketV1): readonly ShadowAiReferenceAliasEntryV1[] {
  const scope = createHash("sha256").update(`${packet.issueId}\u0000${packet.immutableInputHash}`).digest("hex").slice(0, 12);
  const issueFactRefs = new Set(packet.acceptedFactRefs);
  const references: Array<readonly [ShadowAiReferenceClassV1, string, ShadowAiReferenceRoleV1]> = [
    ...packet.acceptedFactRefs.map((value) => ["FACT", value, "ISSUE_SUPPORTING"] as const),
    ...packet.acceptedIssueRelevantActivityFacts.map((fact) => [
      "FACT", fact.factRef, issueFactRefs.has(fact.factRef) ? "ISSUE_SUPPORTING" : "CONTEXT_ONLY",
    ] as const),
    ...packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => fact.evidenceRefs.map((value) =>
      ["STATEMENT_EVIDENCE", value, "INPUT_PROVENANCE_ONLY"] as const)),
    ...packet.currentGovernedEvidenceRefs.map((value) => ["GOVERNED_EVIDENCE", value, "ISSUE_SUPPORTING"] as const),
    ...packet.selectedRdChargeRefs.map((value) => ["ECONOMIC_CHARGE", value, "ISSUE_SUPPORTING"] as const),
    ...packet.acceptedParticipantControlStates.map((state) =>
      ["ECONOMIC_CHARGE", state.rdChargeRef, "ISSUE_SUPPORTING"] as const),
  ];
  const byIdentity = new Map<string, readonly [ShadowAiReferenceClassV1, string, ShadowAiReferenceRoleV1]>();
  for (const entry of references) {
    const key = `${entry[0]}\u0000${entry[1]}`;
    const existing = byIdentity.get(key);
    if (!existing || referenceRolePriority(entry[2]) < referenceRolePriority(existing[2])) byIdentity.set(key, entry);
  }
  const unique = [...byIdentity.values()]
    .sort(([leftClass, left], [rightClass, right]) => leftClass.localeCompare(rightClass) || left.localeCompare(right));
  return deepFreeze(unique.map(([referenceClass, internalReference, semanticRole], index) => ({
    token: `rr_${scope}_${REFERENCE_CLASS_CODE[referenceClass]}_${String(index + 1).padStart(4, "0")}`,
    referenceClass,
    semanticRole,
    internalReference,
  })));
}

function referenceRolePriority(value: ShadowAiReferenceRoleV1): number {
  return value === "ISSUE_SUPPORTING" ? 0 : value === "CONTEXT_ONLY" ? 1 : 2;
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
