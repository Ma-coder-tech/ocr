import { createHash } from "node:crypto";
import type {
  ApprovedFeeKnowledgeSourceRegistry,
  FeeKnowledgeClaimSupportRecord,
  FeeKnowledgeResearchCandidateRecord,
  FeeKnowledgeSourcePacket,
} from "./feeKnowledgeTypes.js";

export type ApprovedRegistryScopeBasis =
  | "exact_processor_or_network"
  | "unrestricted_broader_official"
  | "processor_or_network_mismatch";

export type CanonicalClaimSupportDecisionPayload = {
  claimSupportRef: string;
  origin: "runtime_research" | "approved_registry";
  runtimeSourceRef: string | null;
  runtimeClaimRef: string | null;
  candidateRef: string | null;
  researchAttemptRef: string | null;
  questionRef: string | null;
  approvedSourceRef: string | null;
  approvedClaimRef: string | null;
  approvedRegistryVersionRef: string | null;
  approvedSourceLifecycle: "active" | "expired" | "superseded" | "revoked" | "contradicted" | null;
  approvedSourceApplicable: boolean | null;
  approvedRegistryVerificationRef: string | null;
  approvedContentFingerprint: string | null;
  approvedRegistryProofLevel: "verification_reference_only" | "content_fingerprint_verified" | null;
  approvedRegistryScopeBasis: ApprovedRegistryScopeBasis | null;
  feeRowRef: string;
  runtimeDocumentFingerprint: string | null;
  locatorTextHash: string;
  structuredClaim: {
    claimKind: FeeKnowledgeClaimSupportRecord["structuredClaim"]["claimKind"];
    proposedCategory: FeeKnowledgeClaimSupportRecord["structuredClaim"]["proposedCategory"];
    likelyEconomicOwner: FeeKnowledgeClaimSupportRecord["structuredClaim"]["likelyEconomicOwner"];
    likelyContractualController: FeeKnowledgeClaimSupportRecord["structuredClaim"]["likelyContractualController"];
    maximumConfidence: FeeKnowledgeClaimSupportRecord["structuredClaim"]["maximumConfidence"];
    actionabilityCeiling: FeeKnowledgeClaimSupportRecord["structuredClaim"]["actionabilityCeiling"];
    applicationBasis: FeeKnowledgeClaimSupportRecord["structuredClaim"]["applicationBasis"];
  };
  semanticDecision: FeeKnowledgeClaimSupportRecord["semanticSupport"]["decision"];
  applicability: FeeKnowledgeClaimSupportRecord["applicability"];
  rateOrAmountComparison: FeeKnowledgeClaimSupportRecord["rateOrAmountComparison"];
  hasDeterministicCalculationProof: boolean;
  hasConditions: boolean;
  hasStructuredClaimExclusions: boolean;
  hasSupportExclusions: boolean;
  finalConfidence: FeeKnowledgeClaimSupportRecord["confidence"];
  finalActionabilityCeiling: FeeKnowledgeClaimSupportRecord["actionabilityCeiling"];
  evidenceDecision: FeeKnowledgeClaimSupportRecord["evidenceDecision"];
  contradictionCodes: string[];
  reasonCodes: string[];
  disposition: "accepted" | "rejected";
};

export type RuntimeClaimSupportDecisionPayload = CanonicalClaimSupportDecisionPayload & {
  origin: "runtime_research";
  runtimeSourceRef: string;
  runtimeClaimRef: string;
  candidateRef: string;
  researchAttemptRef: string;
  questionRef: string;
  approvedSourceRef: null;
  approvedClaimRef: null;
  approvedRegistryVersionRef: null;
  approvedSourceLifecycle: null;
  approvedSourceApplicable: null;
  approvedRegistryVerificationRef: null;
  approvedContentFingerprint: null;
  approvedRegistryProofLevel: null;
  approvedRegistryScopeBasis: null;
  runtimeDocumentFingerprint: string;
};

export function buildCanonicalClaimSupportDecision(input: {
  support: FeeKnowledgeClaimSupportRecord;
  sourcePacket: Pick<FeeKnowledgeSourcePacket, "registryVersion" | "sourceMatches" | "researchAttempts" | "researchCandidates">;
  registry: ApprovedFeeKnowledgeSourceRegistry | null;
}): CanonicalClaimSupportDecisionPayload {
  const { support, sourcePacket } = input;
  const common = commonDecisionFields(support);
  if (support.candidateId !== null) {
    const candidate = sourcePacket.researchCandidates.find((item) => item.candidateId === support.candidateId);
    if (!candidate) throw new Error("runtime_claim_support_candidate_missing");
    const attempt = sourcePacket.researchAttempts.find((item) => item.attemptId === candidate.attemptId);
    if (!attempt
      || candidate.feeRowRef !== support.feeRowRef
      || attempt.feeRowRef !== support.feeRowRef
      || attempt.questionRef !== candidate.questionRef
      || !attempt.candidateIds.includes(candidate.candidateId)
      || candidate.sourceFingerprint !== support.documentFingerprint
      || candidate.locatorHash !== support.locatorTextHash) {
      throw new Error("runtime_claim_support_parentage_mismatch");
    }
    const decision = {
      ...common,
      origin: "runtime_research" as const,
      runtimeSourceRef: support.sourceId,
      runtimeClaimRef: support.claimId,
      candidateRef: candidate.candidateId,
      researchAttemptRef: candidate.attemptId,
      questionRef: candidate.questionRef,
      approvedSourceRef: null,
      approvedClaimRef: null,
      approvedRegistryVersionRef: null,
      approvedSourceLifecycle: null,
      approvedSourceApplicable: null,
      approvedRegistryVerificationRef: null,
      approvedContentFingerprint: null,
      approvedRegistryProofLevel: null,
      approvedRegistryScopeBasis: null,
      runtimeDocumentFingerprint: support.documentFingerprint,
    } satisfies Omit<RuntimeClaimSupportDecisionPayload, "disposition">;
    return { ...decision, disposition: canonicalSupportAccepted(decision) ? "accepted" : "rejected" };
  }

  const source = input.registry?.sources.find((item) => item.sourceId === support.sourceId);
  const scopeBasis = deriveApprovedRegistryScopeBasis({ support, sourcePacket, registry: input.registry });
  const fingerprint = /^sha256:[a-f0-9]{64}$/.test(support.documentFingerprint) ? support.documentFingerprint : null;
  const decision = {
    ...common,
    origin: "approved_registry" as const,
    runtimeSourceRef: null,
    runtimeClaimRef: null,
    candidateRef: null,
    researchAttemptRef: null,
    questionRef: null,
    approvedSourceRef: support.sourceId,
    approvedClaimRef: support.claimId,
    approvedRegistryVersionRef: sourcePacket.registryVersion,
    approvedSourceLifecycle: source?.lifecycle ?? null,
    approvedSourceApplicable: scopeBasis === null ? false : scopeBasis !== "processor_or_network_mismatch",
    approvedRegistryVerificationRef: fingerprint
      ? `registry_${canonicalSha256(support.documentFingerprint).slice(0, 16)}`
      : support.documentFingerprint,
    approvedContentFingerprint: fingerprint,
    approvedRegistryProofLevel: fingerprint ? "content_fingerprint_verified" as const : "verification_reference_only" as const,
    approvedRegistryScopeBasis: scopeBasis,
    runtimeDocumentFingerprint: null,
  } satisfies Omit<CanonicalClaimSupportDecisionPayload, "disposition">;
  return { ...decision, disposition: canonicalSupportAccepted(decision) ? "accepted" : "rejected" };
}

export function buildRuntimeClaimSupportDecisionPayload(input: {
  support: FeeKnowledgeClaimSupportRecord;
  candidate: FeeKnowledgeResearchCandidateRecord;
}): RuntimeClaimSupportDecisionPayload {
  const { support, candidate } = input;
  if (!support.candidateId || support.candidateId !== candidate.candidateId) {
    throw new Error("runtime_claim_support_candidate_mismatch");
  }
  const common = commonDecisionFields(support);
  const decision = {
    ...common,
    origin: "runtime_research" as const,
    runtimeSourceRef: support.sourceId,
    runtimeClaimRef: support.claimId,
    candidateRef: candidate.candidateId,
    researchAttemptRef: candidate.attemptId,
    questionRef: candidate.questionRef,
    approvedSourceRef: null,
    approvedClaimRef: null,
    approvedRegistryVersionRef: null,
    approvedSourceLifecycle: null,
    approvedSourceApplicable: null,
    approvedRegistryVerificationRef: null,
    approvedContentFingerprint: null,
    approvedRegistryProofLevel: null,
    approvedRegistryScopeBasis: null,
    runtimeDocumentFingerprint: support.documentFingerprint,
  } satisfies Omit<RuntimeClaimSupportDecisionPayload, "disposition">;
  return { ...decision, disposition: canonicalSupportAccepted(decision) ? "accepted" : "rejected" };
}

export function calculateRuntimeClaimSupportDecisionRef(input: {
  support: FeeKnowledgeClaimSupportRecord;
  candidate: FeeKnowledgeResearchCandidateRecord;
}): string {
  return calculateCanonicalClaimSupportDecisionRef(buildRuntimeClaimSupportDecisionPayload(input));
}

export function calculateCanonicalClaimSupportDecisionRef(
  payload: CanonicalClaimSupportDecisionPayload,
): string {
  return `claim_support_decision_${canonicalSha256(payload)}`;
}

export function runtimeSupportAccepted(support: FeeKnowledgeClaimSupportRecord): boolean {
  return canonicalSupportAccepted({
    ...commonDecisionFields(support),
    origin: "runtime_research",
    approvedSourceLifecycle: null,
    approvedSourceApplicable: null,
    approvedRegistryScopeBasis: null,
  });
}

export function canonicalSupportAccepted(value: Pick<
  CanonicalClaimSupportDecisionPayload,
  "origin" | "approvedSourceLifecycle" | "approvedSourceApplicable" | "approvedRegistryScopeBasis" | "structuredClaim"
  | "semanticDecision" | "applicability" | "rateOrAmountComparison" | "hasDeterministicCalculationProof"
  | "hasStructuredClaimExclusions" | "hasSupportExclusions" | "finalConfidence" | "finalActionabilityCeiling"
  | "evidenceDecision" | "contradictionCodes"
>): boolean {
  const claim = value.structuredClaim;
  const shapeValid = value.evidenceDecision === "verified_classification"
    ? claim.claimKind === "classification" && claim.proposedCategory !== null
    : value.evidenceDecision === "verified_rule"
      ? claim.claimKind === "published_rule"
      : value.evidenceDecision === "verified_application"
        && claim.claimKind === "merchant_application"
        && claim.applicationBasis === "statement_basis_matches"
        && value.rateOrAmountComparison === "matches_published_rule"
        && value.hasDeterministicCalculationProof;
  const scopeValid = value.origin === "runtime_research"
    ? value.applicability.processorOrNetwork
    : value.approvedRegistryScopeBasis === "exact_processor_or_network"
      ? value.applicability.processorOrNetwork
      : value.approvedRegistryScopeBasis === "unrestricted_broader_official"
        && !value.applicability.processorOrNetwork;
  const originValid = value.origin === "runtime_research"
    || (value.approvedSourceLifecycle === "active" && value.approvedSourceApplicable === true);
  return shapeValid
    && originValid
    && scopeValid
    && value.semanticDecision === "supports"
    && value.applicability.statementPeriod
    && value.applicability.jurisdiction !== false
    && value.applicability.transactionContext !== false
    && value.contradictionCodes.length === 0
    && !value.hasStructuredClaimExclusions
    && !value.hasSupportExclusions
    && confidenceRank(value.finalConfidence) <= confidenceRank(claim.maximumConfidence)
    && actionabilityRank(value.finalActionabilityCeiling) <= actionabilityRank(claim.actionabilityCeiling);
}

export function deriveApprovedRegistryScopeBasis(input: {
  support: FeeKnowledgeClaimSupportRecord;
  sourcePacket: Pick<FeeKnowledgeSourcePacket, "sourceMatches">;
  registry: ApprovedFeeKnowledgeSourceRegistry | null;
}): ApprovedRegistryScopeBasis | null {
  const source = input.registry?.sources.find((item) => item.sourceId === input.support.sourceId);
  const claim = source?.claims.find((item) => item.claimId === input.support.claimId);
  const match = input.sourcePacket.sourceMatches.find((item) => item.feeRowRef === input.support.feeRowRef
    && item.sourceId === input.support.sourceId
    && item.claimId === input.support.claimId);
  if (!source || !claim || !match) return null;
  if (match.matchBasis === "exact_processor_or_network" && input.support.applicability.processorOrNetwork) {
    return "exact_processor_or_network";
  }
  const unrestricted = source.processorIds.length === 0
    && source.networkIds.length === 0
    && claim.processorIds.length === 0
    && claim.networkIds.length === 0;
  if (match.matchBasis === "broader_official" && unrestricted && !input.support.applicability.processorOrNetwork) {
    return "unrestricted_broader_official";
  }
  return "processor_or_network_mismatch";
}

function commonDecisionFields(support: FeeKnowledgeClaimSupportRecord) {
  return {
    claimSupportRef: support.claimSupportId,
    feeRowRef: support.feeRowRef,
    locatorTextHash: support.locatorTextHash,
    structuredClaim: {
      claimKind: support.structuredClaim.claimKind,
      proposedCategory: support.structuredClaim.proposedCategory,
      likelyEconomicOwner: support.structuredClaim.likelyEconomicOwner,
      likelyContractualController: support.structuredClaim.likelyContractualController,
      maximumConfidence: support.structuredClaim.maximumConfidence,
      actionabilityCeiling: support.structuredClaim.actionabilityCeiling,
      applicationBasis: support.structuredClaim.applicationBasis,
    },
    semanticDecision: support.semanticSupport.decision,
    applicability: support.applicability,
    rateOrAmountComparison: support.rateOrAmountComparison,
    hasDeterministicCalculationProof: support.semanticSupport.reasonCodes.includes("deterministic_calculation_matches"),
    hasConditions: support.structuredClaim.conditions.length > 0,
    hasStructuredClaimExclusions: support.structuredClaim.exclusions.length > 0,
    hasSupportExclusions: support.exclusions.length > 0,
    finalConfidence: support.confidence,
    finalActionabilityCeiling: support.actionabilityCeiling,
    evidenceDecision: support.evidenceDecision,
    contradictionCodes: [...support.contradictions].sort(),
    reasonCodes: [`fee_knowledge_${support.evidenceDecision}`],
  };
}

function confidenceRank(value: string): number {
  return ({ low: 0, medium: 1, high: 2 } as Record<string, number>)[value] ?? 99;
}

function actionabilityRank(value: string): number {
  return ({ unknown: 0, not_actionable: 1, verify_only: 2, potentially_actionable: 3 } as Record<string, number>)[value] ?? 99;
}

function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("claim_support_decision_non_finite_number");
  return value;
}
