import { createHash } from "node:crypto";
import { isCanonicalCode, isSafeStructuredString, isValidIsoDay, validClosedOpenInterval } from "../knowledge/knowledgeSafety.js";
import { KNOWLEDGE_CLAIM_TYPES } from "../knowledge/knowledgeTypes.js";
import type { DiscoveryCandidate, PublicSourceAuthorityAdmission, RuntimeResearchQuestion, SearchAttempt } from "./intelligenceTypes.js";
import { normalizeSafeHttpsUrl } from "./retrievalSafety.js";

const PATH_MATCH_MODES = ["exact_document", "path_family"] as const;
const EVIDENTIARY_SCOPES = ["claim_class_only", "terminology_example_presentation_only", "historical_processor_presentation_only"] as const;
const PERIOD_POLICIES = ["period_not_applicable", "documented_effective_period", "historical_example_only"] as const;

function validPublicTitle(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}

function validFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function validProvenanceUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return normalizeSafeHttpsUrl(value) === value; } catch { return false; }
}

function pathMatches(admission: PublicSourceAuthorityAdmission, pathname: string): boolean {
  return admission.allowedPathPrefixes.some((path) => admission.pathMatchMode === "exact_document"
    ? pathname === path
    : path.endsWith("*") ? pathname.startsWith(path.slice(0, -1)) : pathname === path || pathname.startsWith(`${path}/`));
}

function geographyMatches(admission: PublicSourceAuthorityAdmission, question: RuntimeResearchQuestion): boolean {
  const geographyCodes = [question.scope.region, question.scope.jurisdiction]
    .filter((value): value is string => typeof value === "string");
  return geographyCodes.length > 0 && geographyCodes.every((code) => admission.allowedGeographyCodes.includes(code));
}

function periodMatches(admission: PublicSourceAuthorityAdmission, question: RuntimeResearchQuestion): boolean {
  const metadata = admission.publicationMetadata;
  if (metadata.periodApplicabilityPolicy !== "documented_effective_period") return true;
  return (metadata.effectiveFrom === null || question.asOf >= metadata.effectiveFrom)
    && (metadata.effectiveTo === null || question.asOf < metadata.effectiveTo);
}

export function createPublicSourceAuthorityAdmission(admission: PublicSourceAuthorityAdmission): PublicSourceAuthorityAdmission {
  const publicationMetadata = Object.freeze({
    ...admission.publicationMetadata,
    provenanceUrls: Object.freeze([...admission.publicationMetadata.provenanceUrls]) as unknown as string[],
  });
  const normalized = Object.freeze({
    ...admission,
    origin: new URL(normalizeSafeHttpsUrl(admission.origin)).origin,
    publicationMetadata,
    allowedClaimTypes: Object.freeze([...admission.allowedClaimTypes]) as unknown as PublicSourceAuthorityAdmission["allowedClaimTypes"],
    allowedEvidenceClasses: Object.freeze([...admission.allowedEvidenceClasses]) as unknown as string[],
    allowedSourceTypeCodes: Object.freeze([...admission.allowedSourceTypeCodes]) as unknown as string[],
    allowedSubjectCodes: Object.freeze([...admission.allowedSubjectCodes]) as unknown as string[],
    allowedProcessorPrograms: Object.freeze([...admission.allowedProcessorPrograms]) as unknown as string[],
    allowedGeographyCodes: Object.freeze([...admission.allowedGeographyCodes]) as unknown as string[],
    allowedPathPrefixes: Object.freeze([...admission.allowedPathPrefixes]) as unknown as string[],
    approvedDocumentFingerprints: Object.freeze([...admission.approvedDocumentFingerprints]) as unknown as string[],
  });
  const metadata = normalized.publicationMetadata;
  const validMetadataPeriod = validClosedOpenInterval(metadata.effectiveFrom, metadata.effectiveTo)
    && ((metadata.samplePeriodStart === null && metadata.samplePeriodEnd === null)
      || (metadata.samplePeriodStart !== null && metadata.samplePeriodEnd !== null
        && isValidIsoDay(metadata.samplePeriodStart) && isValidIsoDay(metadata.samplePeriodEnd)
        && metadata.samplePeriodStart <= metadata.samplePeriodEnd));
  const periodPolicyConsistent = metadata.periodApplicabilityPolicy === "documented_effective_period"
    ? metadata.effectiveFrom !== null || metadata.effectiveTo !== null
    : metadata.effectiveFrom === null && metadata.effectiveTo === null;
  const exactDocumentConsistent = normalized.pathMatchMode !== "exact_document"
    || (normalized.allowedPathPrefixes.every((path) => !path.endsWith("*")) && normalized.approvedDocumentFingerprints.length > 0);
  if (normalized.origin !== admission.origin || !isSafeStructuredString(normalized.admissionId)
    || !Number.isSafeInteger(normalized.admissionVersion) || normalized.admissionVersion < 1
    || !["official_network_publication", "processor_publication"].includes(normalized.authority)
    || !isCanonicalCode(normalized.publicationFamilyCode) || !PATH_MATCH_MODES.includes(normalized.pathMatchMode)
    || !EVIDENTIARY_SCOPES.includes(normalized.maximumEvidentiaryScope)
    || !validPublicTitle(metadata.title) || (metadata.version !== null && !isSafeStructuredString(metadata.version))
    || (metadata.publicationDate !== null && !isValidIsoDay(metadata.publicationDate))
    || !PERIOD_POLICIES.includes(metadata.periodApplicabilityPolicy) || !validMetadataPeriod || !periodPolicyConsistent
    || !isValidIsoDay(metadata.retrievalVerifiedOn) || !metadata.provenanceUrls.every(validProvenanceUrl)
    || normalized.allowedClaimTypes.length === 0
    || !normalized.allowedClaimTypes.every((claim) => KNOWLEDGE_CLAIM_TYPES.includes(claim))
    || normalized.allowedEvidenceClasses.length === 0 || !normalized.allowedEvidenceClasses.every(isCanonicalCode)
    || normalized.allowedSourceTypeCodes.length === 0 || !normalized.allowedSourceTypeCodes.every(isCanonicalCode)
    || normalized.allowedSubjectCodes.length === 0 || !normalized.allowedSubjectCodes.every(isCanonicalCode)
    || normalized.allowedProcessorPrograms.length === 0 || !normalized.allowedProcessorPrograms.every(isSafeStructuredString)
    || normalized.allowedGeographyCodes.length === 0 || !normalized.allowedGeographyCodes.every(isCanonicalCode)
    || normalized.allowedPathPrefixes.length === 0 || !normalized.allowedPathPrefixes.every((prefix) => prefix.startsWith("/") && !prefix.includes("..") && !prefix.slice(0, -1).includes("*"))
    || !normalized.approvedDocumentFingerprints.every(validFingerprint) || !exactDocumentConsistent) {
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
  let url: URL;
  try {
    url = new URL(normalizeSafeHttpsUrl(params.candidate.url));
  } catch {
    return null;
  }
  const processorProgram = params.question.scope.processorProgram;
  return params.admissions.find((admission) => admission.origin === url.origin
    && admission.authority === params.candidate.claimedAuthority
    && admission.allowedClaimTypes.includes(params.question.claimType)
    && params.question.requiredEvidenceClasses.every((code) => admission.allowedEvidenceClasses.includes(code))
    && admission.allowedSourceTypeCodes.includes(params.candidate.sourceTypeCode)
    && admission.allowedSubjectCodes.includes(params.question.subjectCode)
    && typeof processorProgram === "string" && admission.allowedProcessorPrograms.includes(processorProgram)
    && geographyMatches(admission, params.question)
    && periodMatches(admission, params.question)
    && pathMatches(admission, url.pathname)) ?? null;
}

export function knownExactDocumentCandidatesForQuestion(params: {
  question: RuntimeResearchQuestion;
  admissions: readonly PublicSourceAuthorityAdmission[];
}): DiscoveryCandidate[] {
  if (params.question.selection !== "selected") return [];
  const candidates: DiscoveryCandidate[] = [];
  for (const admission of params.admissions) {
    if (admission.pathMatchMode !== "exact_document" || admission.approvedDocumentFingerprints.length === 0) continue;
    for (const [index, pathname] of admission.allowedPathPrefixes.entries()) {
      const url = new URL(pathname, admission.origin).toString();
      const attemptId = `known-authority-${digest(`${params.question.questionId}\0${admission.admissionId}`)}`;
      const candidateId = `candidate-${digest(`${params.question.questionId}\0${admission.admissionId}\0${url}`)}`;
      const sourceTypeCode = [...admission.allowedSourceTypeCodes].sort()[0];
      if (!sourceTypeCode) continue;
      const provisional: DiscoveryCandidate = {
        candidateId,
        questionId: params.question.questionId,
        attemptId,
        url,
        title: admission.publicationMetadata.title,
        claimedAuthority: admission.authority,
        sourceTypeCode,
        rank: index + 1,
        publicationDate: admission.publicationMetadata.publicationDate,
        effectiveFrom: admission.publicationMetadata.effectiveFrom,
        effectiveTo: admission.publicationMetadata.effectiveTo,
        locatorHint: null,
        selectionReasonCode: "known_exact_authority_admission",
        discoveryMetadata: {
          providerCode: "rate_reveal_authority_registry",
          configurationCode: "known_exact_document_v1",
          sourceDomain: new URL(url).hostname.toLowerCase(),
          providerRank: index + 1,
          providerSnippetUsedAsEvidence: false,
        },
        retrievalEligibility: "eligible",
        authorityAdmissionRef: admission.admissionId,
        authorityPublicationFamilyCode: admission.publicationFamilyCode,
      };
      const matched = authorityAdmissionForCandidate({ candidate: provisional, question: params.question, admissions: [admission] });
      if (matched?.admissionId === admission.admissionId && params.question.requiredSourceAuthorities.includes(admission.authority)) {
        candidates.push(provisional);
      }
    }
  }
  return candidates.sort((left, right) => left.rank - right.rank || left.candidateId.localeCompare(right.candidateId));
}

export function verifyRetrievedDocumentAuthority(params: {
  admission: PublicSourceAuthorityAdmission;
  candidate: DiscoveryCandidate;
  question: RuntimeResearchQuestion;
  finalUrl: string;
  documentFingerprint: string;
}): { eligible: boolean; reasonCode: string } {
  const finalCandidate = { ...params.candidate, url: params.finalUrl };
  const matched = authorityAdmissionForCandidate({ candidate: finalCandidate, question: params.question, admissions: [params.admission] });
  if (!matched || matched.admissionId !== params.admission.admissionId) {
    return { eligible: false, reasonCode: "source_authority_final_document_mismatch" };
  }
  if (params.admission.pathMatchMode === "exact_document"
    && !params.admission.approvedDocumentFingerprints.includes(params.documentFingerprint)) {
    return { eligible: false, reasonCode: "source_authority_document_fingerprint_mismatch" };
  }
  return { eligible: true, reasonCode: "source_authority_retrieved_document_verified" };
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

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
