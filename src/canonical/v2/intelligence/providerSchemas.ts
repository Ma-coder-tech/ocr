import { createHash } from "node:crypto";
import { canonicalJson } from "../knowledge/knowledgeSafety.js";

const safeString = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$" } as const;
const nullableDay = { anyOf: [{ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, { type: "null" }] } as const;
const stringArray = { type: "array", items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,95}$" } } as const;
const neutralTerm = {
  type: "object", additionalProperties: false, required: ["kind", "termCode", "termValue"],
  properties: {
    kind: { type: "string", const: "term" },
    termCode: { type: "string", enum: ["application_fee_terminology", "non_swiped_discount_terminology"] },
    termValue: { type: "string", enum: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"] },
  },
} as const;

export const OPENROUTER_SEARCH_RESPONSE_CONTRACT_V1_ID = "openrouter_search_response_contract_v1" as const;
export const OPENROUTER_SEARCH_RESPONSE_CONTRACT_V1 = Object.freeze({
  transportBinding: "synchronous_local_operation",
  requiredEnvelopeFields: ["id", "model", "choices"],
  requiredChoiceCount: 1,
  requiredChoiceIndex: 0,
  requiredAssistantRole: "assistant",
  candidateSource: "url_citation_annotations_only",
  providerContentAuthority: "none",
  fallbackAllowed: false,
  maximumProviderAttempts: 1,
} as const);

export const OPENROUTER_SEARCH_RESPONSE_CONTRACT_ID = "openrouter_search_response_contract_v2" as const;
export const OPENROUTER_SEARCH_RESPONSE_CONTRACT_V2 = Object.freeze({
  ...OPENROUTER_SEARCH_RESPONSE_CONTRACT_V1,
  citationAdmission: "independent_local_validation_per_annotation",
  invalidCitationEffect: "citation_rejected_no_evidence_or_completion_effect",
  validCitationEffect: "independently_admitted_candidate_may_continue",
  fullyReceivedUnusableOutput: "settled_deterministic_search_outcome",
} as const);

const investigativeItem = {
  type: "object", additionalProperties: false,
  required: ["itemId", "questionId", "candidateId", "documentId", "locatorId", "documentFingerprint", "interpretationCode", "proposedValue",
    "sourceAuthorityCandidate", "effectiveFromCandidate", "effectiveToCandidate", "limitationCodes", "financialMutationAllowed"],
  properties: {
    itemId: safeString, questionId: safeString, candidateId: safeString, documentId: safeString, locatorId: safeString,
    documentFingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" }, interpretationCode: { type: "string", const: "bounded_public_term_definition" },
    proposedValue: neutralTerm, sourceAuthorityCandidate: { type: "string", enum: ["processor_publication", "official_network_publication"] },
    effectiveFromCandidate: nullableDay, effectiveToCandidate: nullableDay, limitationCodes: stringArray, financialMutationAllowed: { type: "boolean", const: false },
  },
} as const;

const semanticJudgment = {
  type: "object", additionalProperties: false,
  required: ["sourceEffectiveFrom", "sourceEffectiveTo", "verificationStatus", "limitationCodes"],
  properties: {
    sourceEffectiveFrom: nullableDay, sourceEffectiveTo: nullableDay,
    verificationStatus: { type: "string", enum: ["supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope", "wrong_period", "locator_unproven", "verification_unavailable"] },
    limitationCodes: stringArray,
  },
} as const;

const semanticJudgmentSlot = { anyOf: [semanticJudgment, { type: "null" }] } as const;

function envelope(item: object, schemaVersion: string) {
  return {
    type: "object", additionalProperties: false, required: ["batchId", "attemptId", "schemaVersion", "items"],
    properties: { batchId: safeString, attemptId: safeString, schemaVersion: { type: "string", const: schemaVersion }, items: { type: "array", maxItems: 4, items: item } },
  } as const;
}

export const INVESTIGATIVE_RESPONSE_SCHEMA_ID = "investigative_observation_v1" as const;
export const SEMANTIC_RESPONSE_SCHEMA_ID = "semantic_judgment_v1" as const;
export const INVESTIGATIVE_RESPONSE_SCHEMA_V1 = Object.freeze(envelope(investigativeItem, INVESTIGATIVE_RESPONSE_SCHEMA_ID));
export const SEMANTIC_RESPONSE_SCHEMA_V1 = Object.freeze({
  type: "object", additionalProperties: false, required: ["judgments"],
  properties: {
    judgments: {
      type: "object", additionalProperties: false, required: ["slot0", "slot1", "slot2", "slot3"],
      properties: { slot0: semanticJudgmentSlot, slot1: semanticJudgmentSlot, slot2: semanticJudgmentSlot, slot3: semanticJudgmentSlot },
    },
  },
} as const);
export const OPENROUTER_SEARCH_RESPONSE_CONTRACT_HASH = createHash("sha256").update(canonicalJson(OPENROUTER_SEARCH_RESPONSE_CONTRACT_V2)).digest("hex");
export const INVESTIGATIVE_RESPONSE_SCHEMA_HASH = createHash("sha256").update(canonicalJson(INVESTIGATIVE_RESPONSE_SCHEMA_V1)).digest("hex");
export const SEMANTIC_RESPONSE_SCHEMA_HASH = createHash("sha256").update(canonicalJson(SEMANTIC_RESPONSE_SCHEMA_V1)).digest("hex");
