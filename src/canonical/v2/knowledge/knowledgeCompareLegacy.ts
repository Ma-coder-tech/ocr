import type { KnowledgeDifferenceClassification, KnowledgeEntry, KnowledgeResolution } from "./knowledgeTypes.js";
import { canonicalJson, hasExactKeys } from "./knowledgeSafety.js";
import { validateKnowledgeEntry } from "./knowledgeValidate.js";
import { CANONICAL_KNOWLEDGE_V2_AMENDMENTS } from "./knowledgeVersionManifest.js";

type AmendmentId = (typeof CANONICAL_KNOWLEDGE_V2_AMENDMENTS)[number];

export type KnowledgeLegacyComparison = {
  classification: KnowledgeDifferenceClassification;
  amendmentId: AmendmentId | null;
  legacyFactPresent: boolean;
  v2ResolutionStatus: KnowledgeResolution["status"];
};

export const KNOWLEDGE_SEMANTIC_COMPARISON_DIMENSIONS = [
  "claim_identity",
  "typed_value",
  "source_authority",
  "reuse_scope",
  "tenant_account_boundary",
  "processor_network_program_template_population_scope",
  "effective_period",
  "admission_state",
  "specificity_outcome",
  "supersession",
  "conflict_state",
] as const;

export type KnowledgeSemanticComparisonDimension = (typeof KNOWLEDGE_SEMANTIC_COMPARISON_DIMENSIONS)[number];
export type KnowledgeSemanticFingerprint = Record<KnowledgeSemanticComparisonDimension, unknown>;

const AMENDMENT_DIMENSIONS: Record<AmendmentId, readonly KnowledgeSemanticComparisonDimension[]> = {
  "RF-AMEND-001-CLAIM-SPECIFIC-KNOWLEDGE": ["claim_identity", "typed_value", "source_authority"],
  "RF-AMEND-002-SCOPE-TENANT-ISOLATION": ["reuse_scope", "tenant_account_boundary", "processor_network_program_template_population_scope", "specificity_outcome"],
  "RF-AMEND-003-EXPLICIT-ADMISSION": ["admission_state"],
  "RF-AMEND-004-DETERMINISTIC-SPECIFICITY": ["specificity_outcome"],
  "RF-AMEND-005-CONFLICT-REFUSAL": ["conflict_state"],
  "RF-AMEND-006-EFFECTIVE-DATED-SUPERSESSION": ["effective_period", "supersession"],
  "RF-AMEND-007-CANDIDATE-AUTHORITY-SEPARATION": ["source_authority", "admission_state"],
  "RF-AMEND-008-FIRST-CLASS-UNKNOWN-QUEUE": ["conflict_state"],
};

export type KnowledgeSemanticComparisonReport = {
  policyVersion: "canonical_legacy_v2_knowledge_shadow_comparison_v2";
  items: Array<{
    dimension: KnowledgeSemanticComparisonDimension;
    classification: KnowledgeDifferenceClassification;
    amendmentId: AmendmentId | null;
    reasonCode: string;
  }>;
  counts: Record<KnowledgeDifferenceClassification, number>;
  hasUnexpectedDivergence: boolean;
};

function amendmentApplies(amendmentId: AmendmentId | undefined, dimension: KnowledgeSemanticComparisonDimension | undefined): boolean {
  return amendmentId !== undefined && dimension !== undefined && AMENDMENT_DIMENSIONS[amendmentId].includes(dimension);
}

export function knowledgeSemanticFingerprintFromEntry(entry: KnowledgeEntry, resolution: KnowledgeResolution | null): KnowledgeSemanticFingerprint {
  const validation = validateKnowledgeEntry(entry);
  if (!validation.valid) throw new Error(`invalid_knowledge_comparison_entry:${validation.issues.map((item) => item.code).join(",")}`);
  return {
    claim_identity: { claimType: entry.claimType, subjectCode: entry.subjectCode },
    typed_value: entry.value,
    source_authority: [...new Set(entry.evidence.map((item) => item.sourceAuthority))].sort(),
    reuse_scope: entry.visibility,
    tenant_account_boundary: { tenantRef: entry.tenantRef, accountRef: entry.accountRef },
    processor_network_program_template_population_scope: {
      processor: entry.scope.processor, acquirer: entry.scope.acquirer, isoReseller: entry.scope.isoReseller,
      processorProgram: entry.scope.processorProgram, network: entry.scope.network, pricingProgram: entry.scope.pricingProgram,
      templateFamily: entry.scope.templateFamily, templateVersion: entry.scope.templateVersion, population: entry.scope.population,
    },
    effective_period: { effectiveFrom: entry.effectiveFrom, effectiveTo: entry.effectiveTo },
    admission_state: entry.admission.lifecycle,
    specificity_outcome: resolution === null ? "not_evaluated" : { status: resolution.status, selectedEntryRefs: resolution.selectedEntryRefs },
    supersession: [...entry.supersedes].sort(),
    conflict_state: resolution?.status === "unresolved_conflict" ? "unresolved_conflict" : "no_conflict_observed",
  };
}

export function compareLegacyKnowledge(params: {
  v2Entry: KnowledgeEntry;
  legacyFactPresent: boolean;
  legacyValueEquivalent: boolean;
  resolution: KnowledgeResolution;
  differenceDimension?: KnowledgeSemanticComparisonDimension;
  approvedAmendmentId?: AmendmentId;
}): KnowledgeLegacyComparison {
  const validation = validateKnowledgeEntry(params.v2Entry);
  if (!validation.valid || params.resolution.claimType !== params.v2Entry.claimType || params.resolution.subjectCode !== params.v2Entry.subjectCode
    || (!params.resolution.status.startsWith("unresolved_") && !params.resolution.selectedEntryRefs.includes(params.v2Entry.id))) {
    throw new Error("invalid_knowledge_legacy_comparison_input");
  }
  const unavailable = params.resolution.status.startsWith("unresolved_");
  let classification: KnowledgeDifferenceClassification;
  if (!unavailable && params.legacyFactPresent && params.legacyValueEquivalent) classification = "same_semantic_fact";
  else if (amendmentApplies(params.approvedAmendmentId, params.differenceDimension)) classification = "approved_semantic_amendment";
  else if (unavailable) classification = "v2_unavailable_or_ambiguous";
  else classification = "unexpected_divergence";
  return {
    classification,
    amendmentId: classification === "approved_semantic_amendment" ? params.approvedAmendmentId ?? null : null,
    legacyFactPresent: params.legacyFactPresent,
    v2ResolutionStatus: params.resolution.status,
  };
}

function validateFingerprint(value: KnowledgeSemanticFingerprint): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !hasExactKeys(value as unknown as Record<string, unknown>, KNOWLEDGE_SEMANTIC_COMPARISON_DIMENSIONS)
    || KNOWLEDGE_SEMANTIC_COMPARISON_DIMENSIONS.some((dimension) => value[dimension] === undefined)) throw new Error("invalid_knowledge_semantic_fingerprint");
}

export function compareLegacyKnowledgeSemantics(params: {
  legacy: KnowledgeSemanticFingerprint;
  v2: KnowledgeSemanticFingerprint;
  unavailableDimensions?: readonly KnowledgeSemanticComparisonDimension[];
  approvedAmendments?: Partial<Record<KnowledgeSemanticComparisonDimension, AmendmentId>>;
}): KnowledgeSemanticComparisonReport {
  validateFingerprint(params.legacy);
  validateFingerprint(params.v2);
  const unavailable = new Set(params.unavailableDimensions ?? []);
  const items = KNOWLEDGE_SEMANTIC_COMPARISON_DIMENSIONS.map((dimension) => {
    const same = canonicalJson(params.legacy[dimension]) === canonicalJson(params.v2[dimension]);
    const requestedAmendment = params.approvedAmendments?.[dimension];
    const approved = amendmentApplies(requestedAmendment, dimension);
    const classification: KnowledgeDifferenceClassification = same
      ? "same_semantic_fact"
      : approved
        ? "approved_semantic_amendment"
        : unavailable.has(dimension)
          ? "v2_unavailable_or_ambiguous"
          : "unexpected_divergence";
    return {
      dimension,
      classification,
      amendmentId: classification === "approved_semantic_amendment" ? requestedAmendment ?? null : null,
      reasonCode: same ? `same_${dimension}` : classification === "approved_semantic_amendment" ? `approved_${dimension}_restructure` : classification === "v2_unavailable_or_ambiguous" ? `${dimension}_unavailable` : `${dimension}_unexpected_divergence`,
    };
  });
  const counts: Record<KnowledgeDifferenceClassification, number> = {
    same_semantic_fact: items.filter((item) => item.classification === "same_semantic_fact").length,
    approved_semantic_amendment: items.filter((item) => item.classification === "approved_semantic_amendment").length,
    v2_unavailable_or_ambiguous: items.filter((item) => item.classification === "v2_unavailable_or_ambiguous").length,
    unexpected_divergence: items.filter((item) => item.classification === "unexpected_divergence").length,
  };
  return { policyVersion: "canonical_legacy_v2_knowledge_shadow_comparison_v2", items, counts, hasUnexpectedDivergence: counts.unexpected_divergence > 0 };
}
