import { createHash } from "node:crypto";
import { canonicalJson } from "../knowledge/knowledgeSafety.js";

const safeString = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$" } as const;
const nullableDay = { anyOf: [{ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, { type: "null" }] } as const;
const stringArray = { type: "array", items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,95}$" } } as const;
const neutralTerm = {
  type: "object", additionalProperties: false, required: ["kind", "termCode", "termValue"],
  properties: {
    kind: { const: "term" },
    termCode: { enum: ["application_fee_terminology", "non_swiped_discount_terminology"] },
    termValue: { enum: ["official_definition_found", "scope_limited", "account_document_required", "unresolved"] },
  },
} as const;

export const OPENROUTER_SEARCH_IDENTITY_SCHEMA_ID = "openrouter_search_identity_v1" as const;
export const OPENROUTER_SEARCH_IDENTITY_SCHEMA_V1 = Object.freeze({
  type: "object", additionalProperties: false, required: ["schemaVersion", "providerRequestId"],
  properties: {
    schemaVersion: { const: OPENROUTER_SEARCH_IDENTITY_SCHEMA_ID },
    providerRequestId: { type: "string", pattern: "^provider-request-[0-9a-f-]{36}$" },
  },
} as const);

const investigativeItem = {
  type: "object", additionalProperties: false,
  required: ["itemId", "questionId", "candidateId", "documentId", "locatorId", "documentFingerprint", "interpretationCode", "proposedValue",
    "sourceAuthorityCandidate", "effectiveFromCandidate", "effectiveToCandidate", "limitationCodes", "financialMutationAllowed"],
  properties: {
    itemId: safeString, questionId: safeString, candidateId: safeString, documentId: safeString, locatorId: safeString,
    documentFingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" }, interpretationCode: { const: "bounded_public_term_definition" },
    proposedValue: neutralTerm, sourceAuthorityCandidate: { enum: ["processor_publication", "official_network_publication"] },
    effectiveFromCandidate: nullableDay, effectiveToCandidate: nullableDay, limitationCodes: stringArray, financialMutationAllowed: { const: false },
  },
} as const;

const semanticItem = {
  type: "object", additionalProperties: false,
  required: ["itemId", "supportId", "questionId", "claimType", "subjectCode", "candidateId", "documentId", "locatorId", "documentFingerprint",
    "investigativeObservationId", "sourceAuthority", "sourceEffectiveFrom", "sourceEffectiveTo", "applicabilityScope", "proposedValue",
    "assertionBasisCode", "verificationStatus", "limitationCodes", "admissionAuthority", "financialMutationAllowed"],
  properties: {
    itemId: safeString, supportId: safeString, questionId: safeString, claimType: { const: "processor_term" },
    subjectCode: { enum: ["application_fee_terminology", "non_swiped_discount_terminology"] }, candidateId: safeString,
    documentId: safeString, locatorId: safeString, documentFingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
    investigativeObservationId: safeString, sourceAuthority: { enum: ["processor_publication", "official_network_publication"] },
    sourceEffectiveFrom: nullableDay, sourceEffectiveTo: nullableDay,
    applicabilityScope: {
      type: "object", additionalProperties: false, required: ["processor", "processorProgram", "network", "region", "jurisdiction"],
      properties: Object.fromEntries(["processor", "processorProgram", "network", "region", "jurisdiction"].map((key) => [key,
        { anyOf: [{ type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" }, { type: "null" }] }])),
    },
    proposedValue: neutralTerm, assertionBasisCode: { const: "claim_specific_public_definition" },
    verificationStatus: { enum: ["supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope", "wrong_period", "locator_unproven", "verification_unavailable"] },
    limitationCodes: stringArray, admissionAuthority: { const: "none" }, financialMutationAllowed: { const: false },
  },
} as const;

function envelope(item: object, schemaVersion: string) {
  return {
    type: "object", additionalProperties: false, required: ["batchId", "attemptId", "schemaVersion", "items"],
    properties: { batchId: safeString, attemptId: safeString, schemaVersion: { const: schemaVersion }, items: { type: "array", maxItems: 4, items: item } },
  } as const;
}

export const INVESTIGATIVE_RESPONSE_SCHEMA_ID = "investigative_observation_v1" as const;
export const SEMANTIC_RESPONSE_SCHEMA_ID = "semantic_verification_v1" as const;
export const INVESTIGATIVE_RESPONSE_SCHEMA_V1 = Object.freeze(envelope(investigativeItem, INVESTIGATIVE_RESPONSE_SCHEMA_ID));
export const SEMANTIC_RESPONSE_SCHEMA_V1 = Object.freeze(envelope(semanticItem, SEMANTIC_RESPONSE_SCHEMA_ID));
export const OPENROUTER_SEARCH_IDENTITY_SCHEMA_HASH = createHash("sha256").update(canonicalJson(OPENROUTER_SEARCH_IDENTITY_SCHEMA_V1)).digest("hex");
export const INVESTIGATIVE_RESPONSE_SCHEMA_HASH = createHash("sha256").update(canonicalJson(INVESTIGATIVE_RESPONSE_SCHEMA_V1)).digest("hex");
export const SEMANTIC_RESPONSE_SCHEMA_HASH = createHash("sha256").update(canonicalJson(SEMANTIC_RESPONSE_SCHEMA_V1)).digest("hex");
