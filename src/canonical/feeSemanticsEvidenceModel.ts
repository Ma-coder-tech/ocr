export const FEE_SEMANTICS_EVIDENCE_MODEL_VERSION = "fee_semantics_evidence_model_v1" as const;
export const FEE_SEMANTICS_RETRIEVAL_POLICY_VERSION = "fee_semantics_retrieval_falsification_v1" as const;

export type FeeSemanticEvidenceClass =
  | "statement_local"
  | "curated_industry_knowledge"
  | "qualified_external_research"
  | "ai_hypothesis";

export type FeeSemanticSourceAuthority =
  | "official_network_publication"
  | "processor_publication"
  | "processor_support_documentation"
  | "iso_material"
  | "merchant_agreement"
  | "expert_curated"
  | "repeated_statement_observation"
  | "automated_retrieval"
  | "ai_inference";

export type FeeSemanticConceptKind =
  | "processor_neutral"
  | "network_specific"
  | "processor_specific"
  | "iso_specific"
  | "proprietary"
  | "combined";

export type FeeSemanticAxis =
  | "identity"
  | "assessment_unit"
  | "ownership"
  | "applicability"
  | "pricing_correctness";

export type FeeSemanticScope = {
  effectiveFrom: string | null;
  effectiveTo: string | null;
  geographies: string[];
  processorIds: string[];
  isoIds: string[];
  networkIds: string[];
  merchantAccountIds: string[];
};

export type FeeSemanticEvidenceRecord = {
  evidenceId: string;
  evidenceClass: FeeSemanticEvidenceClass;
  sourceAuthority: FeeSemanticSourceAuthority;
  qualification: "qualified" | "candidate" | "conflicting";
  title: string;
  publisher: string;
  sourceUrl: string | null;
  sourceLocator: string;
  reviewedAt: string | null;
  scope: FeeSemanticScope;
  visibility: "reusable" | "account_private";
  limitations: string[];
};

export type FeeSemanticAliasAssertion = {
  aliasId: string;
  alias: string;
  status: "admitted" | "candidate" | "conflicting";
  evidenceRefs: string[];
  scope: FeeSemanticScope;
};

export type FeeSemanticAssertion = {
  assertionId: string;
  axis: FeeSemanticAxis;
  value: string;
  status: "admitted" | "candidate" | "conflicting";
  evidenceRefs: string[];
  scope: FeeSemanticScope;
  limitations: string[];
};

export type FeeSemanticConcept = {
  conceptId: string;
  displayName: string;
  kind: FeeSemanticConceptKind;
  componentConceptIds: string[];
  aliases: FeeSemanticAliasAssertion[];
  assertions: FeeSemanticAssertion[];
};

export type FeeSemanticCatalog = {
  modelVersion: typeof FEE_SEMANTICS_EVIDENCE_MODEL_VERSION;
  catalogVersion: string;
  evidence: FeeSemanticEvidenceRecord[];
  concepts: FeeSemanticConcept[];
};

export type FeeSemanticQuery = {
  statementRef: string;
  label: string;
  asOf: string;
  geography: string | null;
  processorId: string | null;
  isoId: string | null;
  networkId: string | null;
  merchantAccountId: string | null;
  statementLocalMeaning: "understood" | "unknown" | "ambiguous";
};

export type FeeSemanticRetrievalCandidate = {
  conceptId: string;
  aliasId: string;
  matchedAlias: string;
  retrievalBasis: "exact_alias" | "token_overlap" | "fuzzy_similarity";
  similarity: number;
  scopeApplicable: boolean;
  periodApplicable: boolean;
  qualifiedEvidenceRefs: string[];
  candidateEvidenceRefs: string[];
  acceptanceEligible: boolean;
  reasonCodes: string[];
};

export type FeeSemanticAxisResolution = {
  axis: FeeSemanticAxis;
  status: "resolved" | "unresolved" | "conflicting";
  value: string | null;
  assertionRefs: string[];
  evidenceRefs: string[];
  reasonCodes: string[];
};

export type FeeSemanticResolution = {
  modelVersion: typeof FEE_SEMANTICS_EVIDENCE_MODEL_VERSION;
  retrievalPolicyVersion: typeof FEE_SEMANTICS_RETRIEVAL_POLICY_VERSION;
  statementRef: string;
  label: string;
  statementLocalMeaning: FeeSemanticQuery["statementLocalMeaning"];
  status:
    | "resolved_from_qualified_knowledge"
    | "candidate_only"
    | "unresolved_no_evidence"
    | "unresolved_conflict"
    | "unresolved_scope_or_period";
  conceptId: string | null;
  conceptKind: FeeSemanticConceptKind | null;
  componentConceptIds: string[];
  candidates: FeeSemanticRetrievalCandidate[];
  axes: Record<FeeSemanticAxis, FeeSemanticAxisResolution>;
  qualifiedKnowledgeRefs: string[];
  researchRequired: boolean;
  reasonCodes: string[];
};

const QUALIFIED_CLASSES = new Set<FeeSemanticEvidenceClass>([
  "curated_industry_knowledge",
  "qualified_external_research",
]);
const NON_VERIFYING_AUTHORITIES = new Set<FeeSemanticSourceAuthority>([
  "repeated_statement_observation",
  "automated_retrieval",
  "ai_inference",
]);
const AXES: FeeSemanticAxis[] = ["identity", "assessment_unit", "ownership", "applicability", "pricing_correctness"];

export function emptyFeeSemanticScope(overrides: Partial<FeeSemanticScope> = {}): FeeSemanticScope {
  return {
    effectiveFrom: null,
    effectiveTo: null,
    geographies: [],
    processorIds: [],
    isoIds: [],
    networkIds: [],
    merchantAccountIds: [],
    ...overrides,
  };
}

export function validateFeeSemanticCatalog(catalog: FeeSemanticCatalog): string[] {
  const errors: string[] = [];
  if (catalog.modelVersion !== FEE_SEMANTICS_EVIDENCE_MODEL_VERSION) errors.push("fee_semantics_model_version_invalid");
  if (!safeId(catalog.catalogVersion)) errors.push("fee_semantics_catalog_version_invalid");
  const evidenceIds = new Set<string>();
  for (const evidence of catalog.evidence) {
    if (!safeId(evidence.evidenceId) || evidenceIds.has(evidence.evidenceId)) errors.push(`fee_semantics_evidence_id_invalid_or_duplicate:${evidence.evidenceId}`);
    evidenceIds.add(evidence.evidenceId);
    if (!validScope(evidence.scope)) errors.push(`fee_semantics_evidence_scope_invalid:${evidence.evidenceId}`);
    if (evidence.qualification === "qualified" && !isQualifiedEvidence(evidence)) errors.push(`fee_semantics_non_authoritative_evidence_marked_qualified:${evidence.evidenceId}`);
    if (evidence.visibility === "reusable" && (evidence.sourceAuthority === "merchant_agreement" || evidence.scope.merchantAccountIds.length > 0)) {
      errors.push(`fee_semantics_private_evidence_marked_reusable:${evidence.evidenceId}`);
    }
    if (evidence.visibility === "account_private" && evidence.scope.merchantAccountIds.length === 0) errors.push(`fee_semantics_private_evidence_missing_account_scope:${evidence.evidenceId}`);
    if (evidence.sourceUrl !== null && !safeHttpsUrl(evidence.sourceUrl)) errors.push(`fee_semantics_source_url_invalid:${evidence.evidenceId}`);
  }
  const conceptIds = new Set<string>();
  const aliasIds = new Set<string>();
  const assertionIds = new Set<string>();
  for (const concept of catalog.concepts) {
    if (!safeId(concept.conceptId) || conceptIds.has(concept.conceptId)) errors.push(`fee_semantics_concept_id_invalid_or_duplicate:${concept.conceptId}`);
    conceptIds.add(concept.conceptId);
    if (concept.kind === "combined" && concept.componentConceptIds.length < 2) errors.push(`fee_semantics_combined_components_incomplete:${concept.conceptId}`);
    if (concept.kind !== "combined" && concept.componentConceptIds.length > 0) errors.push(`fee_semantics_non_combined_has_components:${concept.conceptId}`);
    for (const alias of concept.aliases) {
      if (!safeId(alias.aliasId) || aliasIds.has(alias.aliasId)) errors.push(`fee_semantics_alias_id_invalid_or_duplicate:${alias.aliasId}`);
      aliasIds.add(alias.aliasId);
      if (!normalizeLabel(alias.alias)) errors.push(`fee_semantics_alias_empty:${alias.aliasId}`);
      if (!validScope(alias.scope)) errors.push(`fee_semantics_alias_scope_invalid:${alias.aliasId}`);
      if (alias.evidenceRefs.some((ref) => !evidenceIds.has(ref))) errors.push(`fee_semantics_alias_evidence_missing:${alias.aliasId}`);
      if (alias.status === "admitted" && !hasQualifiedEvidence(alias.evidenceRefs, catalog.evidence)) errors.push(`fee_semantics_alias_admitted_without_qualified_evidence:${alias.aliasId}`);
    }
    for (const assertion of concept.assertions) {
      if (!safeId(assertion.assertionId) || assertionIds.has(assertion.assertionId)) errors.push(`fee_semantics_assertion_id_invalid_or_duplicate:${assertion.assertionId}`);
      assertionIds.add(assertion.assertionId);
      if (!validScope(assertion.scope)) errors.push(`fee_semantics_assertion_scope_invalid:${assertion.assertionId}`);
      if (assertion.evidenceRefs.some((ref) => !evidenceIds.has(ref))) errors.push(`fee_semantics_assertion_evidence_missing:${assertion.assertionId}`);
      if (assertion.status === "admitted" && !hasQualifiedEvidence(assertion.evidenceRefs, catalog.evidence)) errors.push(`fee_semantics_assertion_admitted_without_qualified_evidence:${assertion.assertionId}`);
      if (assertion.axis === "identity" && assertion.value !== concept.conceptId) errors.push(`fee_semantics_identity_assertion_mismatch:${assertion.assertionId}`);
    }
  }
  for (const concept of catalog.concepts) {
    for (const component of concept.componentConceptIds) {
      if (!conceptIds.has(component) || component === concept.conceptId) errors.push(`fee_semantics_component_invalid:${concept.conceptId}:${component}`);
    }
  }
  return [...new Set(errors)].sort();
}

export function retrieveFeeSemanticCandidates(
  catalog: FeeSemanticCatalog,
  query: FeeSemanticQuery,
  options: { minimumSimilarity?: number } = {},
): FeeSemanticRetrievalCandidate[] {
  const evidenceById = new Map(catalog.evidence.map((item) => [item.evidenceId, item]));
  const normalizedQuery = normalizeLabel(query.label);
  const minimumSimilarity = options.minimumSimilarity ?? 0.58;
  const candidates: FeeSemanticRetrievalCandidate[] = [];
  for (const concept of catalog.concepts) {
    for (const alias of concept.aliases) {
      const normalizedAlias = normalizeLabel(alias.alias);
      const exact = normalizedQuery === normalizedAlias;
      const tokenScore = tokenSimilarity(normalizedQuery, normalizedAlias);
      const fuzzyScore = shortAcronym(normalizedQuery) || shortAcronym(normalizedAlias) ? 0 : diceSimilarity(normalizedQuery, normalizedAlias);
      const basis = exact ? "exact_alias" : tokenScore >= minimumSimilarity ? "token_overlap" : fuzzyScore >= minimumSimilarity ? "fuzzy_similarity" : null;
      if (!basis) continue;
      const evidence = alias.evidenceRefs.map((ref) => evidenceById.get(ref)).filter((item): item is FeeSemanticEvidenceRecord => Boolean(item));
      const applicableEvidence = evidence.filter((item) => scopeApplies(item.scope, query));
      const qualifiedEvidenceRefs = applicableEvidence.filter(isQualifiedEvidence).map((item) => item.evidenceId).sort();
      const candidateEvidenceRefs = applicableEvidence.filter((item) => !isQualifiedEvidence(item)).map((item) => item.evidenceId).sort();
      const aliasScopeApplicable = scopeApplies(alias.scope, query);
      const periodApplicable = periodApplies(alias.scope, query.asOf) && evidence.some((item) => periodApplies(item.scope, query.asOf));
      const acceptanceEligible = exact && alias.status === "admitted" && aliasScopeApplicable && qualifiedEvidenceRefs.length > 0;
      candidates.push({
        conceptId: concept.conceptId,
        aliasId: alias.aliasId,
        matchedAlias: alias.alias,
        retrievalBasis: basis,
        similarity: exact ? 1 : Number(Math.max(tokenScore, fuzzyScore).toFixed(4)),
        scopeApplicable: aliasScopeApplicable && applicableEvidence.length > 0,
        periodApplicable,
        qualifiedEvidenceRefs,
        candidateEvidenceRefs,
        acceptanceEligible,
        reasonCodes: [
          `fee_semantics_retrieved_by_${basis}`,
          ...(basis !== "exact_alias" ? ["fee_semantics_similarity_is_retrieval_only"] : []),
          ...(alias.status !== "admitted" ? [`fee_semantics_alias_${alias.status}`] : []),
          ...(aliasScopeApplicable ? [] : ["fee_semantics_alias_scope_inapplicable"]),
          ...(qualifiedEvidenceRefs.length > 0 ? [] : ["fee_semantics_no_applicable_qualified_alias_evidence"]),
        ],
      });
    }
  }
  return candidates.sort((left, right) => right.similarity - left.similarity || left.conceptId.localeCompare(right.conceptId) || left.aliasId.localeCompare(right.aliasId));
}

export function resolveFeeSemantics(catalog: FeeSemanticCatalog, query: FeeSemanticQuery): FeeSemanticResolution {
  const validationErrors = validateFeeSemanticCatalog(catalog);
  const candidates = validationErrors.length === 0 ? retrieveFeeSemanticCandidates(catalog, query) : [];
  const emptyAxes = unresolvedAxes(validationErrors.length > 0 ? "fee_semantics_catalog_invalid" : "fee_semantics_identity_unresolved");
  if (validationErrors.length > 0) return unresolvedResolution(query, candidates, emptyAxes, "unresolved_no_evidence", validationErrors);

  const exactCandidates = candidates.filter((item) => item.retrievalBasis === "exact_alias");
  const eligibleConceptIds = [...new Set(exactCandidates.filter((item) => item.acceptanceEligible).map((item) => item.conceptId))];
  const conceptsById = new Map(catalog.concepts.map((item) => [item.conceptId, item]));
  const evidenceById = new Map(catalog.evidence.map((item) => [item.evidenceId, item]));
  const identityEligible = eligibleConceptIds.filter((conceptId) => {
    const concept = conceptsById.get(conceptId)!;
    return concept.assertions.some((assertion) => assertion.axis === "identity" && assertion.status === "admitted"
      && scopeApplies(assertion.scope, query) && hasApplicableQualifiedEvidence(assertion.evidenceRefs, evidenceById, query));
  });
  const exactConflict = exactCandidates.some((item) => item.reasonCodes.includes("fee_semantics_alias_conflicting"));
  if (exactConflict || identityEligible.length > 1) {
    return unresolvedResolution(query, candidates, emptyAxes, "unresolved_conflict", ["fee_semantics_multiple_or_conflicting_exact_identities"]);
  }
  if (identityEligible.length === 0) {
    const hasApplicableExactCandidate = exactCandidates.some((item) => item.scopeApplicable && item.periodApplicable);
    const hasScopeMiss = exactCandidates.length > 0 && !hasApplicableExactCandidate;
    const status = hasScopeMiss ? "unresolved_scope_or_period" : candidates.length > 0 ? "candidate_only" : "unresolved_no_evidence";
    return unresolvedResolution(query, candidates, emptyAxes, status, [
      hasScopeMiss ? "fee_semantics_exact_alias_outside_scope_or_period" : candidates.length > 0 ? "fee_semantics_candidates_require_qualification" : "fee_semantics_no_candidate",
    ]);
  }

  const concept = conceptsById.get(identityEligible[0]!)!;
  const axes = Object.fromEntries(AXES.map((axis) => [axis, resolveAxis(concept, axis, catalog.evidence, query)])) as Record<FeeSemanticAxis, FeeSemanticAxisResolution>;
  if (axes.identity.status !== "resolved") {
    return unresolvedResolution(query, candidates, axes, axes.identity.status === "conflicting" ? "unresolved_conflict" : "candidate_only", ["fee_semantics_identity_assertion_unresolved"]);
  }
  const qualifiedKnowledgeRefs = [...new Set(Object.values(axes).flatMap((axis) => axis.evidenceRefs))].sort();
  return {
    modelVersion: FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
    retrievalPolicyVersion: FEE_SEMANTICS_RETRIEVAL_POLICY_VERSION,
    statementRef: query.statementRef,
    label: query.label,
    statementLocalMeaning: query.statementLocalMeaning,
    status: "resolved_from_qualified_knowledge",
    conceptId: concept.conceptId,
    conceptKind: concept.kind,
    componentConceptIds: [...concept.componentConceptIds],
    candidates,
    axes,
    qualifiedKnowledgeRefs,
    researchRequired: false,
    reasonCodes: [
      "fee_semantics_exact_scoped_alias_supported_by_qualified_knowledge",
      "fee_semantics_identity_does_not_imply_other_axes",
      ...(query.statementLocalMeaning === "unknown" ? ["fee_semantics_statement_local_unknown_external_knowledge_resolved"] : []),
    ],
  };
}

function resolveAxis(
  concept: FeeSemanticConcept,
  axis: FeeSemanticAxis,
  evidence: readonly FeeSemanticEvidenceRecord[],
  query: FeeSemanticQuery,
): FeeSemanticAxisResolution {
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const applicable = concept.assertions.filter((assertion) => assertion.axis === axis && scopeApplies(assertion.scope, query));
  const conflicts = applicable.filter((assertion) => assertion.status === "conflicting");
  const admitted = applicable.filter((assertion) => assertion.status === "admitted" && hasApplicableQualifiedEvidence(assertion.evidenceRefs, evidenceById, query));
  const values = [...new Set(admitted.map((item) => item.value))];
  if (conflicts.length > 0 || values.length > 1) {
    return {
      axis,
      status: "conflicting",
      value: null,
      assertionRefs: [...new Set([...conflicts, ...admitted].map((item) => item.assertionId))].sort(),
      evidenceRefs: [...new Set([...conflicts, ...admitted].flatMap((item) => item.evidenceRefs))].sort(),
      reasonCodes: ["fee_semantics_axis_conflicting_evidence"],
    };
  }
  if (values.length === 1) {
    return {
      axis,
      status: "resolved",
      value: values[0]!,
      assertionRefs: admitted.map((item) => item.assertionId).sort(),
      evidenceRefs: [...new Set(admitted.flatMap((item) => item.evidenceRefs))].sort(),
      reasonCodes: ["fee_semantics_axis_supported_by_applicable_qualified_evidence"],
    };
  }
  return {
    axis,
    status: "unresolved",
    value: null,
    assertionRefs: applicable.map((item) => item.assertionId).sort(),
    evidenceRefs: [...new Set(applicable.flatMap((item) => item.evidenceRefs))].sort(),
    reasonCodes: [applicable.length > 0 ? "fee_semantics_axis_candidate_or_inapplicable" : "fee_semantics_axis_not_established"],
  };
}

function unresolvedResolution(
  query: FeeSemanticQuery,
  candidates: FeeSemanticRetrievalCandidate[],
  axes: Record<FeeSemanticAxis, FeeSemanticAxisResolution>,
  status: FeeSemanticResolution["status"],
  reasonCodes: string[],
): FeeSemanticResolution {
  return {
    modelVersion: FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
    retrievalPolicyVersion: FEE_SEMANTICS_RETRIEVAL_POLICY_VERSION,
    statementRef: query.statementRef,
    label: query.label,
    statementLocalMeaning: query.statementLocalMeaning,
    status,
    conceptId: null,
    conceptKind: null,
    componentConceptIds: [],
    candidates,
    axes,
    qualifiedKnowledgeRefs: [],
    researchRequired: true,
    reasonCodes,
  };
}

function unresolvedAxes(reason: string): Record<FeeSemanticAxis, FeeSemanticAxisResolution> {
  const axes = {} as Record<FeeSemanticAxis, FeeSemanticAxisResolution>;
  for (const axis of AXES) {
    axes[axis] = { axis, status: "unresolved", value: null, assertionRefs: [], evidenceRefs: [], reasonCodes: [reason] };
  }
  return axes;
}

function hasQualifiedEvidence(refs: readonly string[], evidence: readonly FeeSemanticEvidenceRecord[]): boolean {
  const refSet = new Set(refs);
  return evidence.some((item) => refSet.has(item.evidenceId) && isQualifiedEvidence(item));
}

function hasApplicableQualifiedEvidence(
  refs: readonly string[],
  evidenceById: ReadonlyMap<string, FeeSemanticEvidenceRecord>,
  query: FeeSemanticQuery,
): boolean {
  return refs.some((ref) => {
    const item = evidenceById.get(ref);
    return Boolean(item && isQualifiedEvidence(item) && scopeApplies(item.scope, query));
  });
}

function isQualifiedEvidence(evidence: FeeSemanticEvidenceRecord): boolean {
  return evidence.qualification === "qualified"
    && QUALIFIED_CLASSES.has(evidence.evidenceClass)
    && !NON_VERIFYING_AUTHORITIES.has(evidence.sourceAuthority);
}

function scopeApplies(scope: FeeSemanticScope, query: FeeSemanticQuery): boolean {
  return periodApplies(scope, query.asOf)
    && dimensionApplies(scope.geographies, query.geography)
    && dimensionApplies(scope.processorIds, query.processorId)
    && dimensionApplies(scope.isoIds, query.isoId)
    && dimensionApplies(scope.networkIds, query.networkId)
    && dimensionApplies(scope.merchantAccountIds, query.merchantAccountId);
}

function periodApplies(scope: FeeSemanticScope, asOf: string): boolean {
  return (scope.effectiveFrom === null || scope.effectiveFrom <= asOf)
    && (scope.effectiveTo === null || asOf < scope.effectiveTo);
}

function dimensionApplies(allowed: readonly string[], actual: string | null): boolean {
  return allowed.length === 0 || (actual !== null && allowed.includes(actual));
}

function validScope(scope: FeeSemanticScope): boolean {
  return validIsoDayOrNull(scope.effectiveFrom)
    && validIsoDayOrNull(scope.effectiveTo)
    && (scope.effectiveFrom === null || scope.effectiveTo === null || scope.effectiveFrom < scope.effectiveTo)
    && [scope.geographies, scope.processorIds, scope.isoIds, scope.networkIds, scope.merchantAccountIds]
      .every((items) => Array.isArray(items) && new Set(items).size === items.length && items.every(safeId));
}

function validIsoDayOrNull(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function safeId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value);
}

function safeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function shortAcronym(value: string): boolean {
  return !value.includes(" ") && value.length <= 5;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftPairs = bigramCounts(left);
  const rightPairs = bigramCounts(right);
  let intersection = 0;
  for (const [pair, count] of leftPairs) intersection += Math.min(count, rightPairs.get(pair) ?? 0);
  const leftCount = [...leftPairs.values()].reduce((sum, value) => sum + value, 0);
  const rightCount = [...rightPairs.values()].reduce((sum, value) => sum + value, 0);
  return (2 * intersection) / (leftCount + rightCount);
}

function bigramCounts(value: string): Map<string, number> {
  const compact = value.replace(/\s+/g, " ");
  const counts = new Map<string, number>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    const pair = compact.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}
