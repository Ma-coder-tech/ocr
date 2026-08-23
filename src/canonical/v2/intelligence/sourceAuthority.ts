import { isCanonicalCode, isSafeStructuredString, isValidIsoDay } from "../knowledge/knowledgeSafety.js";
import { KNOWLEDGE_CLAIM_TYPES } from "../knowledge/knowledgeTypes.js";
import type { DiscoveryCandidate, PublicSourceAuthorityAdmission, RuntimeResearchQuestion, SearchAttempt } from "./intelligenceTypes.js";
import { normalizeSafeHttpsUrl } from "./retrievalSafety.js";

export function createPublicSourceAuthorityAdmission(admission: PublicSourceAuthorityAdmission): PublicSourceAuthorityAdmission {
  const normalized = Object.freeze({
    ...admission,
    origin: new URL(normalizeSafeHttpsUrl(admission.origin)).origin,
    allowedClaimTypes: Object.freeze([...admission.allowedClaimTypes]) as unknown as PublicSourceAuthorityAdmission["allowedClaimTypes"],
    allowedEvidenceClasses: Object.freeze([...admission.allowedEvidenceClasses]) as unknown as string[],
    allowedSourceTypeCodes: Object.freeze([...admission.allowedSourceTypeCodes]) as unknown as string[],
  });
  if (normalized.origin !== admission.origin || !isSafeStructuredString(normalized.admissionId)
    || !["official_network_publication", "processor_publication"].includes(normalized.authority)
    || !isCanonicalCode(normalized.publicationFamilyCode) || normalized.allowedClaimTypes.length === 0
    || !normalized.allowedClaimTypes.every((claim) => KNOWLEDGE_CLAIM_TYPES.includes(claim))
    || normalized.allowedEvidenceClasses.length === 0 || !normalized.allowedEvidenceClasses.every(isCanonicalCode)
    || normalized.allowedSourceTypeCodes.length === 0 || !normalized.allowedSourceTypeCodes.every(isCanonicalCode)) {
    throw new Error("invalid_public_source_authority_admission");
  }
  return normalized;
}

export function validatePublicSourceAuthorityAdmissions(admissions: readonly PublicSourceAuthorityAdmission[]): void {
  const ids = admissions.map((item) => item.admissionId);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_public_source_authority_admission");
  for (const admission of admissions) {
    if (!Object.isFrozen(admission)) throw new Error("unproven_public_source_authority_admission");
    createPublicSourceAuthorityAdmission(admission);
  }
}

export function authorityAdmissionForCandidate(params: {
  candidate: DiscoveryCandidate;
  question: RuntimeResearchQuestion;
  admissions: readonly PublicSourceAuthorityAdmission[];
}): PublicSourceAuthorityAdmission | null {
  let origin: string;
  try {
    origin = new URL(normalizeSafeHttpsUrl(params.candidate.url)).origin;
  } catch {
    return null;
  }
  return params.admissions.find((admission) => admission.origin === origin
    && admission.authority === params.candidate.claimedAuthority
    && admission.allowedClaimTypes.includes(params.question.claimType)
    && params.question.requiredEvidenceClasses.every((code) => admission.allowedEvidenceClasses.includes(code))
    && admission.allowedSourceTypeCodes.includes(params.candidate.sourceTypeCode)) ?? null;
}

export function deriveAdaptiveSearchReason(params: {
  suggested: SearchAttempt["adaptiveReason"];
  question: RuntimeResearchQuestion;
  candidates: readonly DiscoveryCandidate[];
}): SearchAttempt["adaptiveReason"] {
  if (params.suggested !== "right_program_wrong_period") return null;
  const wrongPeriodOfficial = params.candidates.some((candidate) => candidate.retrievalEligibility === "eligible"
    && candidate.authorityAdmissionRef !== null
    && ((candidate.effectiveFrom !== null && isValidIsoDay(candidate.effectiveFrom) && params.question.asOf < candidate.effectiveFrom)
      || (candidate.effectiveTo !== null && isValidIsoDay(candidate.effectiveTo) && params.question.asOf >= candidate.effectiveTo)));
  return wrongPeriodOfficial ? "right_program_wrong_period" : null;
}
