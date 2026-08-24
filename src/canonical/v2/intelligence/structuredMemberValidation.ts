import { hasExactKeys, isCanonicalCode, isRecord, isSafeStructuredString, isValidIsoDay } from "../knowledge/knowledgeSafety.js";
import { validateKnowledgeClaimValue } from "../knowledge/knowledgeValidate.js";
import type {
  CandidateClaimSupport,
  InvestigativeObservation,
  SemanticModelJudgment,
  SemanticVerificationInput,
  ThemeLanguageCandidate,
  ThemeLanguageInput,
} from "./intelligenceTypes.js";

const INVESTIGATIVE_KEYS = [
  "itemId", "questionId", "candidateId", "documentId", "locatorId", "documentFingerprint", "interpretationCode", "proposedValue",
  "sourceAuthorityCandidate", "effectiveFromCandidate", "effectiveToCandidate", "limitationCodes", "financialMutationAllowed",
] as const;
const SEMANTIC_KEYS = [
  "itemId", "supportId", "questionId", "claimType", "subjectCode", "candidateId", "documentId", "locatorId", "documentFingerprint",
  "investigativeObservationId", "sourceAuthority", "sourceEffectiveFrom", "sourceEffectiveTo", "applicabilityScope", "proposedValue",
  "assertionBasisCode", "verificationStatus", "limitationCodes", "admissionAuthority", "financialMutationAllowed",
] as const;
const LANGUAGE_KEYS = [
  "itemId", "themeRef", "text", "deterministicFallbackText", "factRefs", "driverRefs", "leverRefs", "limitationCodes", "actionabilityCode",
  "uncertaintyState", "claimClasses", "source", "authority", "customerVisible", "reportPermission", "validation",
] as const;
const SEMANTIC_JUDGMENT_KEYS = ["sourceEffectiveFrom", "sourceEffectiveTo", "verificationStatus", "limitationCodes"] as const;

function canonicalArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isCanonicalCode);
}

const NEUTRAL_TERM_VALUES = new Set(["official_definition_found", "scope_limited", "account_document_required", "unresolved"]);

export function validateInvestigativeMember(value: unknown, expected: { itemId: string; questionId: string; candidateId: string; documentId: string; documentFingerprint: string; claimType: SemanticVerificationInput["question"]["claimType"]; subjectCode: string; sourceAuthority: string }): string[] {
  if (!isRecord(value) || !hasExactKeys(value, INVESTIGATIVE_KEYS)) return ["investigative_member_shape_invalid"];
  const issues: string[] = [];
  if (value.itemId !== expected.itemId || value.questionId !== expected.questionId || value.candidateId !== expected.candidateId
    || value.documentId !== expected.documentId || value.documentFingerprint !== expected.documentFingerprint) issues.push("investigative_member_identity_mismatch");
  if (!isSafeStructuredString(value.locatorId) || !isCanonicalCode(value.interpretationCode)) issues.push("investigative_member_locator_or_interpretation_invalid");
  if (value.financialMutationAllowed !== false) issues.push("investigative_authority_strengthening");
  if (value.sourceAuthorityCandidate !== expected.sourceAuthority) issues.push("investigative_source_authority_invalid");
  if (!canonicalArray(value.limitationCodes)) issues.push("investigative_limitations_invalid");
  if (value.effectiveFromCandidate !== null && !isValidIsoDay(value.effectiveFromCandidate)) issues.push("investigative_period_invalid");
  if (value.effectiveToCandidate !== null && !isValidIsoDay(value.effectiveToCandidate)) issues.push("investigative_period_invalid");
  issues.push(...validateKnowledgeClaimValue(expected.claimType, value.proposedValue).map(() => "investigative_proposed_value_invalid"));
  if (expected.claimType === "processor_term") {
    const proposed = isRecord(value.proposedValue) ? value.proposedValue : {};
    if (value.interpretationCode !== "bounded_public_term_definition" || proposed.kind !== "term" || proposed.termCode !== expected.subjectCode
      || typeof proposed.termValue !== "string" || !NEUTRAL_TERM_VALUES.has(proposed.termValue)) issues.push("investigative_neutral_vocabulary_required");
  }
  return [...new Set(issues)];
}

export function validateSemanticMember(value: unknown, expected: SemanticVerificationInput): string[] {
  if (!isRecord(value) || !hasExactKeys(value, SEMANTIC_KEYS)) return ["semantic_member_shape_invalid"];
  const issues: string[] = [];
  if (value.itemId !== expected.itemId || value.investigativeObservationId !== expected.itemId || value.questionId !== expected.question.questionId
    || value.claimType !== expected.question.claimType || value.subjectCode !== expected.question.subjectCode
    || value.candidateId !== expected.candidate.candidateId || value.documentId !== expected.documentId
    || value.locatorId !== expected.locator.locatorId || value.documentFingerprint !== expected.locator.documentFingerprint) {
    issues.push("semantic_member_identity_mismatch");
  }
  if (!isSafeStructuredString(value.supportId) || !isCanonicalCode(value.assertionBasisCode) || !canonicalArray(value.limitationCodes)) {
    issues.push("semantic_member_metadata_invalid");
  }
  if (value.admissionAuthority !== "none" || value.financialMutationAllowed !== false) issues.push("semantic_authority_strengthening");
  if (!["supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope", "wrong_period", "locator_unproven", "malformed", "verification_unavailable"].includes(String(value.verificationStatus))
    || !expected.question.requiredSourceAuthorities.includes(value.sourceAuthority as never) || typeof value.applicabilityScope !== "object" || value.applicabilityScope === null || Array.isArray(value.applicabilityScope)) {
    issues.push("semantic_member_state_invalid");
  }
  if (value.sourceEffectiveFrom !== null && !isValidIsoDay(value.sourceEffectiveFrom)) issues.push("semantic_period_invalid");
  if (value.sourceEffectiveTo !== null && !isValidIsoDay(value.sourceEffectiveTo)) issues.push("semantic_period_invalid");
  issues.push(...validateKnowledgeClaimValue(expected.question.claimType, value.proposedValue).map(() => "semantic_proposed_value_invalid"));
  if (expected.question.claimType === "processor_term") {
    const proposed = isRecord(value.proposedValue) ? value.proposedValue : {};
    if (proposed.kind !== "term" || proposed.termCode !== expected.question.subjectCode || typeof proposed.termValue !== "string"
      || !NEUTRAL_TERM_VALUES.has(proposed.termValue)) issues.push("semantic_neutral_vocabulary_required");
  }
  return [...new Set(issues)];
}

export function validateSemanticModelJudgment(value: unknown): string[] {
  if (!isRecord(value) || !hasExactKeys(value, SEMANTIC_JUDGMENT_KEYS)) return ["semantic_judgment_shape_invalid"];
  const issues: string[] = [];
  if (!canonicalArray(value.limitationCodes)
    || !["supported_candidate", "partially_supported", "unsupported", "contradicted", "wrong_authority", "wrong_scope", "wrong_period", "locator_unproven", "verification_unavailable"].includes(String(value.verificationStatus))) {
    issues.push("semantic_judgment_state_invalid");
  }
  if (value.sourceEffectiveFrom !== null && !isValidIsoDay(value.sourceEffectiveFrom)) issues.push("semantic_judgment_period_invalid");
  if (value.sourceEffectiveTo !== null && !isValidIsoDay(value.sourceEffectiveTo)) issues.push("semantic_judgment_period_invalid");
  return [...new Set(issues)];
}

export function validateLanguageMemberShape(value: unknown, expected: ThemeLanguageInput): string[] {
  if (!isRecord(value) || !hasExactKeys(value, LANGUAGE_KEYS)) return ["language_member_shape_invalid"];
  const issues: string[] = [];
  if (value.itemId !== expected.itemId || value.themeRef !== expected.themeRef) issues.push("language_member_identity_mismatch");
  if (!Array.isArray(value.factRefs) || !value.factRefs.every(isSafeStructuredString) || !Array.isArray(value.driverRefs) || !value.driverRefs.every(isSafeStructuredString)
    || !Array.isArray(value.leverRefs) || !value.leverRefs.every(isSafeStructuredString) || !canonicalArray(value.limitationCodes)
    || !isCanonicalCode(value.actionabilityCode) || !["resolved", "limited", "unresolved"].includes(String(value.uncertaintyState))
    || !Array.isArray(value.claimClasses) || value.claimClasses.some((item) => !["neutral_observation", "uncertainty_preserved"].includes(String(item)))) {
    issues.push("language_member_metadata_invalid");
  }
  if (typeof value.text !== "string" || typeof value.deterministicFallbackText !== "string" || value.source !== "provider_candidate"
    || value.authority !== "non_authoritative_candidate" || value.customerVisible !== false || value.reportPermission !== "none"
    || !["accepted", "rejected_strengthening", "malformed"].includes(String(value.validation))) issues.push("language_member_state_invalid");
  return [...new Set(issues)];
}

export function asInvestigativeObservation(value: unknown): InvestigativeObservation { return value as InvestigativeObservation; }
export function asCandidateClaimSupport(value: unknown): CandidateClaimSupport { return value as CandidateClaimSupport; }
export function asSemanticModelJudgment(value: unknown): SemanticModelJudgment { return value as SemanticModelJudgment; }
export function asThemeLanguageCandidate(value: unknown): ThemeLanguageCandidate { return value as ThemeLanguageCandidate; }
