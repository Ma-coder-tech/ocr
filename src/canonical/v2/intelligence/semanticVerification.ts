import { KNOWLEDGE_CLAIM_POLICIES } from "../knowledge/knowledgePolicy.js";
import { canonicalJson, isCanonicalCode } from "../knowledge/knowledgeSafety.js";
import {
  knowledgeExact,
  knowledgeUnknown,
  type KnowledgeCandidatePacket,
  type KnowledgeScope,
} from "../knowledge/knowledgeTypes.js";
import { ingestKnowledgeCandidatePacket } from "../knowledge/knowledgeAdapters.js";
import type {
  CandidateClaimSupport,
  DiscoveryCandidate,
  ExtractedLocator,
  RuntimeResearchQuestion,
  SemanticVerificationStatus,
  SemanticConflict,
} from "./intelligenceTypes.js";

export function detectSemanticConflicts(questions: readonly RuntimeResearchQuestion[], supports: readonly CandidateClaimSupport[]): SemanticConflict[] {
  return questions.flatMap((question) => {
    const supported = supports.filter((support) => support.questionId === question.questionId && support.verificationStatus === "supported_candidate");
    return new Set(supported.map((support) => canonicalJson(support.proposedValue))).size > 1 ? [{
      questionId: question.questionId,
      supportIds: supported.map((support) => support.supportId).sort(),
      candidateIds: [...new Set(supported.map((support) => support.candidateId))].sort(),
      state: "conflicting_supported_candidates" as const,
    }] : [];
  });
}

export function validateSemanticSupport(params: {
  question: RuntimeResearchQuestion;
  candidate: Omit<DiscoveryCandidate, "url">;
  locator: ExtractedLocator;
  support: CandidateClaimSupport;
  expectedObservationId: string;
  expectedProposedValue: CandidateClaimSupport["proposedValue"];
}): { status: SemanticVerificationStatus; reasonCodes: string[] } {
  const { question, candidate, locator, support } = params;
  const reasons: string[] = [];
  if (support.questionId !== question.questionId || support.claimType !== question.claimType || support.subjectCode !== question.subjectCode) {
    reasons.push("semantic_question_or_claim_identity_mismatch");
  }
  if (support.candidateId !== candidate.candidateId || support.documentId !== locator.documentId || support.locatorId !== locator.locatorId
    || support.documentFingerprint !== locator.documentFingerprint || support.investigativeObservationId !== params.expectedObservationId) {
    reasons.push("semantic_candidate_document_locator_identity_mismatch");
  }
  if (canonicalJson(support.proposedValue) !== canonicalJson(params.expectedProposedValue)) reasons.push("semantic_proposed_value_substitution");
  if (support.admissionAuthority !== "none" || support.financialMutationAllowed !== false) reasons.push("semantic_authority_violation");
  const policy = KNOWLEDGE_CLAIM_POLICIES[question.claimType];
  if (!question.requiredSourceAuthorities.includes(support.sourceAuthority) || !policy.allowedSourceAuthorities.includes(support.sourceAuthority)
    || support.sourceAuthority !== candidate.claimedAuthority || candidate.authorityAdmissionRef === null) reasons.push("semantic_source_authority_mismatch");
  const publicScope = Object.fromEntries(Object.entries(question.scope).filter(([key]) => key !== "tenantRef" && key !== "accountRef"));
  if (canonicalJson(support.applicabilityScope) !== canonicalJson(publicScope)) reasons.push("semantic_scope_mismatch");
  if ((support.sourceEffectiveFrom !== null && question.asOf < support.sourceEffectiveFrom)
    || (support.sourceEffectiveTo !== null && question.asOf >= support.sourceEffectiveTo)) reasons.push("semantic_period_mismatch");
  if (!isCanonicalCode(support.assertionBasisCode) || /(?:keyword|substring|term_presence)/.test(support.assertionBasisCode)) {
    reasons.push("semantic_substring_basis_forbidden");
  }
  if (support.verificationStatus !== "supported_candidate") reasons.push(`semantic_provider_status:${support.verificationStatus}`);
  if (reasons.some((reason) => /identity|authority_violation|malformed|substitution/.test(reason))) return { status: "malformed", reasonCodes: reasons };
  if (reasons.includes("semantic_source_authority_mismatch")) return { status: "wrong_authority", reasonCodes: reasons };
  if (reasons.includes("semantic_scope_mismatch")) return { status: "wrong_scope", reasonCodes: reasons };
  if (reasons.includes("semantic_period_mismatch")) return { status: "wrong_period", reasonCodes: reasons };
  if (reasons.includes("semantic_substring_basis_forbidden")) return { status: "unsupported", reasonCodes: reasons };
  if (reasons.length > 0) return { status: support.verificationStatus, reasonCodes: reasons };
  return { status: "supported_candidate", reasonCodes: ["claim_specific_semantic_support_candidate"] };
}

function candidateScope(question: RuntimeResearchQuestion): KnowledgeScope {
  const value = (dimension: keyof KnowledgeScope) => {
    const actual = question.scope[dimension];
    return typeof actual === "string" ? knowledgeExact(actual) : knowledgeUnknown();
  };
  return {
    processor: value("processor"),
    acquirer: value("acquirer"),
    isoReseller: value("isoReseller"),
    processorProgram: value("processorProgram"),
    network: value("network"),
    region: value("region"),
    channel: value("channel"),
    cardProduct: value("cardProduct"),
    merchantCategory: value("merchantCategory"),
    pricingProgram: value("pricingProgram"),
    templateFamily: value("templateFamily"),
    templateVersion: value("templateVersion"),
    sourceSection: value("sourceSection"),
    population: value("population"),
    jurisdiction: value("jurisdiction"),
  };
}

export function supportToKnowledgeCandidatePacket(params: {
  runId: string;
  question: RuntimeResearchQuestion;
  support: CandidateClaimSupport;
  knownConflictCodes?: string[];
}): KnowledgeCandidatePacket {
  const { question, support } = params;
  if (support.verificationStatus !== "supported_candidate") throw new Error("unsupported_research_cannot_create_candidate_packet");
  if (!question.scope.tenantRef || !question.scope.accountRef) throw new Error("research_candidate_requires_account_boundary");
  const safeSequence = support.supportId.replace(/[^A-Za-z0-9_.:-]+/g, "-").slice(0, 96);
  const evidenceRef = `rg-evidence:${safeSequence}`;
  const packet: KnowledgeCandidatePacket = {
    candidateId: `rg-candidate:${safeSequence}`,
    proposedClaimType: question.claimType,
    proposedSubjectCode: question.subjectCode,
    proposedValue: support.proposedValue,
    sourceAuthority: support.sourceAuthority,
    claimedConfidence: null,
    lifecycle: "candidate",
    requiresHumanAdmission: true,
    privacy: "private_by_default",
    proposedScope: candidateScope(question),
    proposedVisibility: "account_private",
    tenantRef: question.scope.tenantRef,
    accountRef: question.scope.accountRef,
    effectiveFrom: support.sourceEffectiveFrom,
    effectiveTo: support.sourceEffectiveTo,
    publicationDate: null,
    evidence: [{ ref: evidenceRef, sourceAuthority: support.sourceAuthority, private: false }],
    basis: { code: support.assertionBasisCode, unit: null, denominator: null, currency: null, exactValue: null },
    provenance: {
      adapter: "bounded_intelligence_runtime",
      sourceRecordRef: evidenceRef,
      sourceVersion: "canonical_intelligence_v2_runtime_v1",
      sourceAuthorityClaim: support.sourceAuthority,
      sourceFieldRefs: ["question_ref", "candidate_ref", "document_ref", "locator_ref", "semantic_support_ref"],
    },
    knownConflictCodes: [...new Set(params.knownConflictCodes ?? [])],
    limitations: [...new Set(["human_review_required", "narrow_scope_only", "automated_research_candidate", ...support.limitationCodes])],
  };
  return ingestKnowledgeCandidatePacket(packet) as KnowledgeCandidatePacket;
}
