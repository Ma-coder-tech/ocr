import { createHash } from "node:crypto";
import type { CanonicalStatementAnalysis } from "./types.js";
import { calculateRuntimeClaimSupportDecisionRef } from "./feeKnowledgeClaimSupportDecision.js";
import {
  FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
  FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
  FEE_KNOWLEDGE_POLICY_VERSION,
  FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION,
  FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
  FEE_KNOWLEDGE_SOURCE_PACKET_VERSION,
  type ApprovedFeeKnowledgeSourceRegistry,
  type FeeKnowledgeClaimSupportRecord,
  type FeeKnowledgeCustomerSafeSourceProjection,
  type FeeKnowledgeDomainIdentityPolicy,
  type FeeKnowledgeProvenanceDecisionRecord,
  type FeeKnowledgeResearchCandidateRecord,
  type FeeKnowledgeRowSourcePacket,
  type FeeKnowledgeSemanticSupportDecision,
  type FeeKnowledgeSourceClaim,
  type FeeKnowledgeSourceEntry,
  type FeeKnowledgeSourceMatchRecord,
  type FeeKnowledgeSourcePacket,
} from "./feeKnowledgeTypes.js";

export const EMPTY_FEE_KNOWLEDGE_REGISTRY: ApprovedFeeKnowledgeSourceRegistry = {
  registrySchemaVersion: FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION,
  registryVersion: "fee_knowledge_registry_empty_v1",
  policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
  sources: [],
};

export const REVIEWED_DOMAIN_IDENTITY_POLICY: FeeKnowledgeDomainIdentityPolicy = {
  policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
  reviewedPublisherDomains: [
    { publisherId: "visa", aliases: ["visa", "visa usa"], officialDomains: ["visa.com"] },
    { publisherId: "mastercard", aliases: ["mastercard"], officialDomains: ["mastercard.com"] },
    { publisherId: "american_express", aliases: ["american express", "amex"], officialDomains: ["americanexpress.com"] },
    { publisherId: "discover_global_network", aliases: ["discover", "discover global network"], officialDomains: ["discoverglobalnetwork.com"] },
    { publisherId: "fiserv", aliases: ["fiserv"], officialDomains: ["fiserv.com"] },
  ],
  identityEvidence: [
    {
      type: "fee_knowledge_domain_identity_evidence",
      policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
      publisherId: "visa",
      publisherDisplayName: "Visa",
      officialDomain: "visa.com",
      evidenceUrl: "https://usa.visa.com/support/small-business/regulations-fees.html",
      evidenceLocator: "Visa support page for Visa System rates, fees and rules",
      evidenceSummary: "Reviewed Visa-owned page under usa.visa.com identifies Visa system rates, fees and rules resources.",
      reviewedAt: "2026-08-01",
      establishesFeeConclusion: false,
    },
    {
      type: "fee_knowledge_domain_identity_evidence",
      policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
      publisherId: "mastercard",
      publisherDisplayName: "Mastercard",
      officialDomain: "mastercard.com",
      evidenceUrl: "https://www.mastercard.com/content/mccom/global/en/business/support/rules.html",
      evidenceLocator: "Mastercard business support rules page",
      evidenceSummary: "Reviewed Mastercard-owned page under mastercard.com identifies Mastercard rules and compliance resources.",
      reviewedAt: "2026-08-01",
      establishesFeeConclusion: false,
    },
    {
      type: "fee_knowledge_domain_identity_evidence",
      policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
      publisherId: "american_express",
      publisherDisplayName: "American Express",
      officialDomain: "americanexpress.com",
      evidenceUrl: "https://www.americanexpress.com/us/merchant/merchant-regulations.html",
      evidenceLocator: "American Express merchant regulations page",
      evidenceSummary: "Reviewed American Express-owned page under americanexpress.com identifies merchant regulations for American Express card acceptance.",
      reviewedAt: "2026-08-01",
      establishesFeeConclusion: false,
    },
    {
      type: "fee_knowledge_domain_identity_evidence",
      policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
      publisherId: "discover_global_network",
      publisherDisplayName: "Discover Global Network",
      officialDomain: "discoverglobalnetwork.com",
      evidenceUrl: "https://www.discoverglobalnetwork.com/our-network/about-discover-network/",
      evidenceLocator: "Discover Global Network about Discover Network page",
      evidenceSummary: "Reviewed Discover Global Network page under discoverglobalnetwork.com identifies Discover Network as part of Discover Global Network.",
      reviewedAt: "2026-08-01",
      establishesFeeConclusion: false,
    },
    {
      type: "fee_knowledge_domain_identity_evidence",
      policyVersion: FEE_KNOWLEDGE_DOMAIN_IDENTITY_POLICY_VERSION,
      publisherId: "fiserv",
      publisherDisplayName: "Fiserv",
      officialDomain: "fiserv.com",
      evidenceUrl: "https://merchants.fiserv.com/en-us/legal/",
      evidenceLocator: "Fiserv merchant legal page",
      evidenceSummary: "Reviewed Fiserv merchant legal page under merchants.fiserv.com identifies Fiserv merchant-services documentation.",
      reviewedAt: "2026-08-01",
      establishesFeeConclusion: false,
    },
  ],
} as const;

export type LegacyWholeStatementSourceRegistry = {
  approvedExternalSourceRefs?: readonly string[];
};

export type FeeKnowledgeRegistryValidationResult = {
  ok: boolean;
  errors: string[];
  registry: ApprovedFeeKnowledgeSourceRegistry;
};

export function normalizeFeeKnowledgeRegistry(
  registry: ApprovedFeeKnowledgeSourceRegistry | LegacyWholeStatementSourceRegistry | null | undefined,
): ApprovedFeeKnowledgeSourceRegistry {
  if (!registry) return EMPTY_FEE_KNOWLEDGE_REGISTRY;
  if (isFeeKnowledgeRegistry(registry)) {
    return {
      ...registry,
      sources: registry.sources.map((source) => ({ ...source, claims: source.claims.map((claim) => ({ ...claim })) })),
    };
  }
  const refs = [...new Set([...(registry.approvedExternalSourceRefs ?? [])])].filter((ref) => safeId(ref)).sort();
  return {
    registrySchemaVersion: FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION,
    registryVersion: refs.length > 0 ? "legacy_h1_4b_approved_refs_v1" : EMPTY_FEE_KNOWLEDGE_REGISTRY.registryVersion,
    policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
    sources: refs.map((ref): FeeKnowledgeSourceEntry => ({
      sourceId: ref,
      registrySchemaVersion: FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION,
      policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
      lifecycle: "active",
      kind: "approved_primary_source",
      title: "Approved external documentation",
      publisher: "Reviewed source registry",
      canonicalUrl: `https://example.invalid/${ref}`,
      domainIdentity: {
        policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
        publisherId: "reviewed_source_registry",
        officialDomains: ["example.invalid"],
        aliases: ["reviewed source registry"],
        verificationBasis: "registry_reviewed",
      },
      publicationDate: null,
      effectivePeriod: { from: null, through: null },
      retrievalDate: "2026-07-31",
      lastVerificationDate: "2026-07-31",
      reverifyAfterDate: null,
      jurisdiction: [],
      market: [],
      processorIds: [],
      networkIds: [],
      aliases: [ref],
      supersedesSourceId: null,
      supersededBySourceId: null,
      contentFingerprint: null,
      displayPermission: "internal_only",
      claims: [
        {
          claimId: `${ref}_claim`,
          claimType: "classification",
          feeLabels: [],
          categories: [],
          processorIds: [],
          networkIds: [],
          semanticConclusion: { category: null, likelyEconomicOwner: null, likelyContractualController: null },
          conditions: [],
          exclusions: [],
          maximumConfidence: "high",
          actionabilityCeiling: "verify_only",
          effectivePeriod: { from: null, through: null },
          sourceLocator: "reviewed registry reference",
          customerSafeParaphrase: "Reviewed external documentation reference.",
          displayPermission: "internal_only",
        },
      ],
    })),
  };
}

export function validateFeeKnowledgeRegistry(
  registry: ApprovedFeeKnowledgeSourceRegistry | LegacyWholeStatementSourceRegistry | null | undefined,
): FeeKnowledgeRegistryValidationResult {
  const normalized = normalizeFeeKnowledgeRegistry(registry);
  const errors: string[] = [];
  if (normalized.registrySchemaVersion !== FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION) errors.push("fee_knowledge_registry_schema_version_invalid");
  if (normalized.policyVersion !== FEE_KNOWLEDGE_POLICY_VERSION) errors.push("fee_knowledge_registry_policy_version_invalid");
  if (!safeId(normalized.registryVersion)) errors.push("fee_knowledge_registry_version_invalid");

  const sourceIds = new Set<string>();
  const claimIds = new Set<string>();
  for (const source of normalized.sources) {
    if (!safeId(source.sourceId)) errors.push("fee_knowledge_source_id_invalid");
    if (sourceIds.has(source.sourceId)) errors.push(`fee_knowledge_source_duplicate:${source.sourceId}`);
    sourceIds.add(source.sourceId);
    if (source.registrySchemaVersion !== FEE_KNOWLEDGE_REGISTRY_SCHEMA_VERSION) errors.push(`fee_knowledge_source_schema_invalid:${source.sourceId}`);
    if (source.policyVersion !== FEE_KNOWLEDGE_POLICY_VERSION) errors.push(`fee_knowledge_source_policy_invalid:${source.sourceId}`);
    if (!["active", "expired", "superseded", "revoked", "contradicted"].includes(source.lifecycle)) {
      errors.push(`fee_knowledge_source_lifecycle_invalid:${source.sourceId}`);
    }
    if (!safeText(source.title) || !safeText(source.publisher)) errors.push(`fee_knowledge_source_display_invalid:${source.sourceId}`);
    if (!safeHttpsUrl(source.canonicalUrl)) errors.push(`fee_knowledge_source_url_invalid:${source.sourceId}`);
    if (source.canonicalUrl.includes("@")) errors.push(`fee_knowledge_source_url_credentials_invalid:${source.sourceId}`);
    if (!["displayable", "internal_only", "human_review_required"].includes(source.displayPermission)) {
      errors.push(`fee_knowledge_source_display_permission_invalid:${source.sourceId}`);
    }
    if (source.supersededBySourceId && !sourceIds.has(source.supersededBySourceId) && !normalized.sources.some((item) => item.sourceId === source.supersededBySourceId)) {
      errors.push(`fee_knowledge_source_supersession_missing:${source.sourceId}`);
    }
    for (const claim of source.claims) {
      if (!safeId(claim.claimId)) errors.push(`fee_knowledge_claim_id_invalid:${source.sourceId}`);
      if (claimIds.has(claim.claimId)) errors.push(`fee_knowledge_claim_duplicate:${claim.claimId}`);
      claimIds.add(claim.claimId);
      if (!safeText(claim.customerSafeParaphrase)) errors.push(`fee_knowledge_claim_paraphrase_invalid:${claim.claimId}`);
      if (!["displayable", "internal_only", "human_review_required"].includes(claim.displayPermission)) {
        errors.push(`fee_knowledge_claim_display_permission_invalid:${claim.claimId}`);
      }
      if (claim.effectivePeriod.from && claim.effectivePeriod.through && claim.effectivePeriod.from > claim.effectivePeriod.through) {
        errors.push(`fee_knowledge_claim_period_invalid:${claim.claimId}`);
      }
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)].sort(), registry: normalized };
}

export function buildFeeKnowledgeSourcePacket(input: {
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability">;
  registry?: ApprovedFeeKnowledgeSourceRegistry | LegacyWholeStatementSourceRegistry | null;
  runtimeClaimSupports?: readonly FeeKnowledgeClaimSupportRecord[];
  researchAttempts?: FeeKnowledgeSourcePacket["researchAttempts"];
  researchCandidates?: readonly FeeKnowledgeResearchCandidateRecord[];
}): FeeKnowledgeSourcePacket {
  const registryResult = validateFeeKnowledgeRegistry(input.registry);
  const registry = registryResult.ok ? registryResult.registry : EMPTY_FEE_KNOWLEDGE_REGISTRY;
  const period = input.analysis.identity.statementPeriod;
  const processorName = lowerWords(input.analysis.identity.processorName.value);
  const classifications = new Map(input.analysis.feeOwnershipActionability.rowClassifications.map((item) => [item.feeRowId, item]));
  const sourceMatches: FeeKnowledgeSourceMatchRecord[] = [];
  const claimSupports: FeeKnowledgeClaimSupportRecord[] = [];
  const provenanceDecisions: FeeKnowledgeProvenanceDecisionRecord[] = [];
  const customerSafeSources: FeeKnowledgeCustomerSafeSourceProjection[] = [];

  for (const row of input.analysis.feeLedger.rows) {
    const label = lowerWords(row.selectedLabel);
    const deterministicCategory = classifications.get(row.id)?.selected?.category ?? null;
    for (const source of registry.sources) {
      for (const claim of source.claims) {
        const periodApplicable = periodApplicableToStatement(claim.effectivePeriod, period.value?.start ?? null, period.value?.end ?? null);
        const sourcePeriodApplicable = periodApplicableToStatement(source.effectivePeriod, period.value?.start ?? null, period.value?.end ?? null);
        const processorMatch = matchesAny(processorName, [...source.processorIds, ...source.networkIds, ...source.aliases, ...claim.processorIds, ...claim.networkIds]);
        const labelMatch = claim.feeLabels.length === 0 || matchesAny(label, claim.feeLabels);
        const categoryMatch = !deterministicCategory || claim.categories.length === 0 || claim.categories.includes(deterministicCategory);
        if (!labelMatch || !categoryMatch) continue;
        const matchBasis = processorMatch ? "exact_processor_or_network" : "broader_official";
        const contradictions = source.lifecycle === "contradicted" || claim.claimType === "contradiction" ? ["source_or_claim_contradicted"] : [];
        const match: FeeKnowledgeSourceMatchRecord = {
          type: "fee_knowledge_source_match",
          policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
          feeRowRef: row.id,
          sourceId: source.sourceId,
          claimId: claim.claimId,
          matchBasis,
          lifecycle: source.lifecycle,
          periodApplicable: periodApplicable && sourcePeriodApplicable,
          deterministicMatchConfidence: claim.maximumConfidence,
          contradictions,
          exclusions: [...claim.exclusions].sort(),
          maximumActionabilityCeiling: claim.actionabilityCeiling,
        };
        sourceMatches.push(match);
        const authoritative =
          source.lifecycle === "active" &&
          match.periodApplicable &&
          contradictions.length === 0 &&
          (processorMatch || source.processorIds.length + source.networkIds.length + claim.processorIds.length + claim.networkIds.length === 0);
        const support = claimSupportFromRegistry(row.id, source, claim, match, authoritative);
        claimSupports.push(support);
        provenanceDecisions.push(provenanceDecisionFromSupport(row.id, source, claim, support, authoritative ? "approved_documentation" : support.evidenceDecision === "conflicting_evidence" ? "conflicting_evidence" : "insufficient_evidence"));
        if (source.displayPermission === "displayable" && claim.displayPermission === "displayable") {
          customerSafeSources.push(customerSafeProjection(source, claim, support));
        }
      }
    }
  }

  const feeRowIds = new Set(input.analysis.feeLedger.rows.map((row) => row.id));
  const hasResearchAttemptGraph = (input.researchAttempts ?? []).length > 0;
  const attemptsById = new Map((input.researchAttempts ?? []).map((attempt) => [attempt.attemptId, attempt]));
  const candidatesById = new Map((input.researchCandidates ?? []).map((candidate) => [candidate.candidateId, candidate]));
  const runtimeSupports = input.runtimeClaimSupports ?? [];
  const supportsByCandidate = new Map<string, FeeKnowledgeClaimSupportRecord[]>();
  for (const support of runtimeSupports) {
    if (!support.candidateId) continue;
    supportsByCandidate.set(support.candidateId, [...(supportsByCandidate.get(support.candidateId) ?? []), support]);
  }
  const invalidRuntimeSupport = runtimeSupports.some((support) => {
    if (!feeRowIds.has(support.feeRowRef)) return true;
    if (!support.candidateId) return true;
    const candidate = candidatesById.get(support.candidateId);
    const attempt = candidate ? attemptsById.get(candidate.attemptId) : null;
    return !candidate
      || candidate.feeRowRef !== support.feeRowRef
      || candidate.sourceFingerprint !== support.documentFingerprint
      || candidate.locatorHash !== support.locatorTextHash
      || candidate.claimSupportDecisionRef !== calculateRuntimeClaimSupportDecisionRef({ support, candidate })
      || (hasResearchAttemptGraph && (!attempt
        || attempt.feeRowRef !== support.feeRowRef
        || candidate.questionRef !== attempt.questionRef));
  }) || (input.researchCandidates ?? []).some((candidate) => {
    const supports = supportsByCandidate.get(candidate.candidateId) ?? [];
    return supports.length === 0 ? candidate.claimSupportDecisionRef !== null : supports.length !== 1;
  });

  for (const support of invalidRuntimeSupport ? [] : input.runtimeClaimSupports ?? []) {
    claimSupports.push(support);
    provenanceDecisions.push({
      type: "fee_knowledge_provenance_decision",
      policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
      decisionId: `prov_${stableId([support.feeRowRef, support.claimSupportId])}`,
      feeRowRef: support.feeRowRef,
      decision: support.evidenceDecision === "verified_classification" || support.evidenceDecision === "verified_rule" || support.evidenceDecision === "verified_application"
        ? "runtime_verified_documentation"
        : support.evidenceDecision === "conflicting_evidence"
          ? "conflicting_evidence"
          : support.evidenceDecision === "source_unavailable" || support.evidenceDecision === "source_inapplicable"
            ? "insufficient_evidence"
            : "verified_candidate_limited",
      sourceId: support.sourceId,
      claimId: support.claimId,
      candidateId: support.candidateId,
      claimSupportId: support.claimSupportId,
      reasonCodes: [`fee_knowledge_${support.evidenceDecision}`],
      limitations: support.exclusions,
      maximumConfidence: support.confidence,
      actionabilityCeiling: support.actionabilityCeiling,
    });
  }

  for (const candidate of input.researchCandidates ?? []) {
    if (provenanceDecisions.some((decision) => decision.candidateId === candidate.candidateId)) continue;
    provenanceDecisions.push(provenanceDecisionFromCandidate(candidate));
  }

  const rowPackets = input.analysis.feeLedger.rows.map((row): FeeKnowledgeRowSourcePacket => {
    const rowSupports = claimSupports.filter((support) => support.feeRowRef === row.id);
    const rowDecisions = provenanceDecisions.filter((decision) => decision.feeRowRef === row.id);
    const verified = rowSupports.filter((support) => isVerifiedDocumentationDecision(support.evidenceDecision));
    const approved = verified.filter((support) => support.candidateId === null);
    const runtime = verified.filter((support) => support.candidateId !== null);
    const conflicts = rowDecisions.filter((decision) => decision.decision === "conflicting_evidence").map((decision) => decision.decisionId);
    const attempts = (input.researchAttempts ?? [])
      .filter((attempt) => attempt.status !== "completed" && attempt.feeRowRef === row.id)
      .map((attempt) => attempt.attemptId)
      .sort();
    const permittedProvenanceChoices: FeeKnowledgeRowSourcePacket["permittedProvenanceChoices"] = [
      ...approved.map((support) => provenanceChoice("approved_external_documentation", support)),
      ...runtime.map((support) => provenanceChoice("runtime_verified_documentation", support)),
      {
        provenance: "industry_inference",
        sourceId: null,
        claimId: null,
        claimSupportId: null,
        evidenceDecision: null,
        confidenceCeiling: "medium",
        actionabilityCeiling: "verify_only",
      },
      {
        provenance: "human_review",
        sourceId: null,
        claimId: null,
        claimSupportId: null,
        evidenceDecision: null,
        confidenceCeiling: "low",
        actionabilityCeiling: "unknown",
      },
    ];
    return {
      feeRowRef: row.id,
      applicableApprovedClaimSupportRefs: approved.map((support) => support.claimSupportId).sort(),
      runtimeVerifiedClaimSupportRefs: runtime.map((support) => support.claimSupportId).sort(),
      verifiedCandidateRefs: rowSupports.filter((support) => !isVerifiedDocumentationDecision(support.evidenceDecision) && support.candidateId).map((support) => support.candidateId!).sort(),
      absenceOrFailureAttemptRefs: attempts,
      contradictionRefs: conflicts.sort(),
      permittedProvenanceChoices,
    };
  });

  return {
    type: "fee_knowledge_source_packet",
    policyVersion: FEE_KNOWLEDGE_SOURCE_PACKET_VERSION,
    registryVersion: registry.registryVersion,
    researchPolicyVersion: FEE_KNOWLEDGE_RESEARCH_POLICY_VERSION,
    registryValidation: {
      status: registryResult.ok && !invalidRuntimeSupport ? "valid" : "invalid",
      reasonCodes: [
        ...(registryResult.ok ? [] : ["fee_knowledge_registry_invalid"]),
        ...(invalidRuntimeSupport ? ["fee_knowledge_runtime_linkage_invalid"] : []),
      ],
    },
    rowPackets,
    sourceMatches: sourceMatches.sort(byRowThenId),
    researchAttempts: [...(input.researchAttempts ?? [])].sort((left, right) => left.attemptId.localeCompare(right.attemptId)),
    researchCandidates: [...(input.researchCandidates ?? [])].sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    claimSupports: claimSupports.sort((left, right) => left.claimSupportId.localeCompare(right.claimSupportId)),
    provenanceDecisions: provenanceDecisions.sort((left, right) => left.decisionId.localeCompare(right.decisionId)),
    customerSafeSources: customerSafeSources.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  };
}

export function isVerifiedDocumentationDecision(decision: string): boolean {
  return decision === "verified_classification" || decision === "verified_rule" || decision === "verified_application";
}

function claimSupportFromRegistry(
  feeRowRef: string,
  source: FeeKnowledgeSourceEntry,
  claim: FeeKnowledgeSourceClaim,
  match: FeeKnowledgeSourceMatchRecord,
  authoritative: boolean,
): FeeKnowledgeClaimSupportRecord {
  const locatorText = claim.sourceLocator ?? claim.customerSafeParaphrase;
  return {
    type: "fee_knowledge_claim_support",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    claimSupportId: `claimsupport_${stableId([feeRowRef, source.sourceId, claim.claimId, match.lifecycle, String(match.periodApplicable)])}`,
    feeRowRef,
    sourceId: source.sourceId,
    claimId: claim.claimId,
    candidateId: null,
    structuredClaim: structuredClaimFromRegistryClaim(claim),
    documentFingerprint: source.contentFingerprint ?? `registry_${stableId([source.sourceId, source.lastVerificationDate])}`,
    evidenceLocator: {
      locatorId: `locator_${stableId([source.sourceId, claim.claimId, locatorText])}`,
      kind: "plain_text",
      pageNumber: null,
      sectionLabel: claim.sourceLocator,
      paragraphIndex: null,
      tableIndex: null,
      rowIndex: null,
      textStart: null,
      textEnd: null,
      textHash: stableId([locatorText]),
    },
    locatorTextHash: stableId([locatorText]),
    boundedSafeExcerpt: sanitizeText(claim.customerSafeParaphrase, 260),
    semanticSupport: semanticSupportFromRegistryClaim(claim, match.contradictions),
    aiSemanticMatchExplanation: "Registry-reviewed claim matched deterministically to the fee row context.",
    citationExists: true,
    applicability: {
      processorOrNetwork: match.matchBasis === "exact_processor_or_network",
      jurisdiction: true,
      transactionContext: true,
      statementPeriod: match.periodApplicable,
    },
    rateOrAmountComparison: "not_calculable",
    contradictions: match.contradictions,
    exclusions: match.exclusions,
    evidenceDecision: match.contradictions.length > 0 ? "conflicting_evidence" : authoritative ? (claim.claimType === "published_rule" ? "verified_rule" : "verified_classification") : "source_inapplicable",
    confidence: claim.maximumConfidence,
    actionabilityCeiling: claim.actionabilityCeiling,
  };
}

function provenanceDecisionFromCandidate(candidate: FeeKnowledgeResearchCandidateRecord): FeeKnowledgeProvenanceDecisionRecord {
  const conflicting = candidate.verificationStatus === "conflicting_evidence";
  return {
    type: "fee_knowledge_provenance_decision",
    policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
    decisionId: `prov_${stableId([candidate.feeRowRef, candidate.candidateId, candidate.verificationStatus])}`,
    feeRowRef: candidate.feeRowRef,
    decision: conflicting ? "conflicting_evidence" : "insufficient_evidence",
    sourceId: null,
    claimId: null,
    candidateId: candidate.candidateId,
    claimSupportId: null,
    reasonCodes: candidate.reasonCodes.map((code) => sanitizeText(code, 120)).sort(),
    limitations: [`fee_knowledge_candidate_${candidate.verificationStatus}`],
    maximumConfidence: "low",
    actionabilityCeiling: "unknown",
  };
}

function structuredClaimFromRegistryClaim(claim: FeeKnowledgeSourceClaim): FeeKnowledgeClaimSupportRecord["structuredClaim"] {
  return {
    claimKind: claim.claimType === "published_rule" ? "published_rule" : claim.claimType === "application_condition" ? "merchant_application" : "classification",
    feeLabel: claim.feeLabels[0] ?? "",
    processorOrNetwork: claim.processorIds[0] ?? claim.networkIds[0] ?? null,
    statementPeriodYear: claim.effectivePeriod.from?.slice(0, 4) ?? null,
    proposedCategory: claim.semanticConclusion.category,
    likelyEconomicOwner: claim.semanticConclusion.likelyEconomicOwner,
    likelyContractualController: claim.semanticConclusion.likelyContractualController,
    conditions: [...claim.conditions].sort(),
    exclusions: [...claim.exclusions].sort(),
    maximumConfidence: claim.maximumConfidence,
    actionabilityCeiling: claim.actionabilityCeiling,
    ruleValue: null,
    applicationBasis: claim.claimType === "application_condition" ? "not_evaluated" : "not_applicable",
  };
}

function semanticSupportFromRegistryClaim(
  claim: FeeKnowledgeSourceClaim,
  contradictions: readonly string[],
): FeeKnowledgeSemanticSupportDecision {
  return {
    type: "fee_knowledge_semantic_support_decision",
    policyVersion: FEE_KNOWLEDGE_CLAIM_SUPPORT_POLICY_VERSION,
    decision: contradictions.length > 0 ? "contradicts" : "supports",
    structuredClaim: structuredClaimFromRegistryClaim(claim),
    reasonCodes: contradictions.length > 0 ? ["fee_knowledge_registry_contradiction"] : ["fee_knowledge_registry_reviewed_semantic_support"],
    providerDetailsStripped: true,
  };
}

function provenanceDecisionFromSupport(
  feeRowRef: string,
  source: FeeKnowledgeSourceEntry,
  claim: FeeKnowledgeSourceClaim,
  support: FeeKnowledgeClaimSupportRecord,
  decision: FeeKnowledgeProvenanceDecisionRecord["decision"],
): FeeKnowledgeProvenanceDecisionRecord {
  return {
    type: "fee_knowledge_provenance_decision",
    policyVersion: FEE_KNOWLEDGE_POLICY_VERSION,
    decisionId: `prov_${stableId([feeRowRef, source.sourceId, claim.claimId, decision])}`,
    feeRowRef,
    decision,
    sourceId: source.sourceId,
    claimId: claim.claimId,
    candidateId: null,
    claimSupportId: support.claimSupportId,
    reasonCodes: [`fee_knowledge_${decision}`],
    limitations: [...claim.conditions, ...claim.exclusions].map((item) => sanitizeText(item, 160)).sort(),
    maximumConfidence: support.confidence,
    actionabilityCeiling: support.actionabilityCeiling,
  };
}

function provenanceChoice(
  provenance: "approved_external_documentation" | "runtime_verified_documentation",
  support: FeeKnowledgeClaimSupportRecord,
): FeeKnowledgeRowSourcePacket["permittedProvenanceChoices"][number] {
  return {
    provenance,
    sourceId: support.sourceId,
    claimId: support.claimId,
    claimSupportId: support.claimSupportId,
    evidenceDecision: support.evidenceDecision,
    confidenceCeiling: support.confidence,
    actionabilityCeiling: support.actionabilityCeiling,
  };
}

function customerSafeProjection(
  source: FeeKnowledgeSourceEntry,
  claim: FeeKnowledgeSourceClaim,
  support: FeeKnowledgeClaimSupportRecord,
): FeeKnowledgeCustomerSafeSourceProjection {
  return {
    sourceId: source.sourceId,
    title: source.title,
    publisher: source.publisher,
    canonicalUrl: source.canonicalUrl,
    publicationDate: source.publicationDate,
    effectiveDate: source.effectivePeriod.from ?? claim.effectivePeriod.from,
    lastVerifiedDate: source.lastVerificationDate,
    customerSafeClaimParaphrase: claim.customerSafeParaphrase,
    evidenceType: support.evidenceDecision,
    applicabilityLimitation: support.exclusions.length > 0 ? support.exclusions.join("; ").slice(0, 220) : "Applies only within the cited source conditions.",
    displayable: source.displayPermission === "displayable" && claim.displayPermission === "displayable",
  };
}

function periodApplicableToStatement(period: { from: string | null; through: string | null }, statementStart: string | null, statementEnd: string | null): boolean {
  if (!statementStart && !statementEnd) return true;
  const start = statementStart ?? statementEnd;
  const end = statementEnd ?? statementStart;
  if (!start || !end) return true;
  if (period.from && period.from > end) return false;
  if (period.through && period.through < start) return false;
  return true;
}

function matchesAny(value: string, aliases: readonly string[]): boolean {
  if (aliases.length === 0) return false;
  return aliases.some((alias) => {
    const normalized = lowerWords(alias);
    return normalized.length > 0 && (value.includes(normalized) || normalized.includes(value));
  });
}

function byRowThenId(left: FeeKnowledgeSourceMatchRecord, right: FeeKnowledgeSourceMatchRecord): number {
  return left.feeRowRef.localeCompare(right.feeRowRef) || left.sourceId.localeCompare(right.sourceId) || left.claimId.localeCompare(right.claimId);
}

function isFeeKnowledgeRegistry(value: ApprovedFeeKnowledgeSourceRegistry | LegacyWholeStatementSourceRegistry): value is ApprovedFeeKnowledgeSourceRegistry {
  return Array.isArray((value as ApprovedFeeKnowledgeSourceRegistry).sources);
}

function safeId(value: string): boolean {
  return /^[a-z][a-z0-9_]{2,120}$/i.test(value);
}

function safeText(value: string): boolean {
  return Boolean(value.trim()) && !/(?:api.?key|raw prompt|raw response|merchant account|\/Users\/|\/private\/|\$|\b\d{6,}\b)/i.test(value);
}

function safeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function lowerWords(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function stableId(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
}
