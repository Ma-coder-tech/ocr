import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "./types.js";
import type {
  FeeSemanticEvidenceClass,
  FeeSemanticQuery,
  FeeSemanticResolution,
  FeeSemanticRetrievalCandidate,
} from "./feeSemanticsEvidenceModel.js";
import {
  resolveQualifiedFeeSemanticsCatalog,
  type QualifiedFeeSemanticCatalog,
  type QualifiedFeeSemanticResolution,
} from "./qualifiedFeeSemanticsCatalog.js";

export const FEE_SEMANTICS_SHADOW_STATEMENT_INTEGRATION_VERSION = "fee_semantics_shadow_statement_integration_v1" as const;

export type FeeSemanticsShadowStatementLocalMeaning = FeeSemanticQuery["statementLocalMeaning"];
export type FeeSemanticsShadowScopeAxis = "period" | "geography" | "processor" | "iso" | "network" | "merchant_account";
export type FeeSemanticsShadowRowStatus =
  | "resolved_exact_trusted"
  | "candidate_only"
  | "retrieval_candidates_only"
  | "unresolved_scope_or_period"
  | "unresolved_conflict"
  | "unresolved_no_evidence";

export type FeeSemanticsShadowContextValue = {
  value: string | null;
  evidenceClass: "statement_local" | "qualified_external_research";
  evidenceRefs: string[];
};

export type FeeSemanticsShadowStatementContext = {
  geography: FeeSemanticsShadowContextValue;
  isoId?: FeeSemanticsShadowContextValue;
  merchantAccountId?: FeeSemanticsShadowContextValue;
  statementLocalMeaningByFeeRowId?: Readonly<Record<string, FeeSemanticsShadowStatementLocalMeaning>>;
  networkIdByFeeRowId?: Readonly<Record<string, FeeSemanticsShadowContextValue>>;
};

export type FeeSemanticsShadowLookupVariant = {
  label: string;
  transformations: Array<"remove_printed_network_prefix" | "remove_printed_arithmetic_suffix">;
};

export type FeeSemanticsShadowRowResult = {
  feeRowId: string;
  printedLabel: string;
  feeRowEvidenceRefs: string[];
  statementLocalMeaning: FeeSemanticsShadowStatementLocalMeaning;
  processorId: string | null;
  networkId: string | null;
  networkEvidenceBasis: "printed_network_prefix" | "explicit_statement_context" | "none" | "conflicting";
  lookupVariants: FeeSemanticsShadowLookupVariant[];
  selectedLookupVariant: FeeSemanticsShadowLookupVariant | null;
  status: FeeSemanticsShadowRowStatus;
  conceptId: string | null;
  conceptKind: FeeSemanticResolution["conceptKind"];
  semanticAxes: FeeSemanticResolution["axes"] | null;
  matchedAlias: string | null;
  retrievalBasis: FeeSemanticRetrievalCandidate["retrievalBasis"] | null;
  scopeConflictAxes: FeeSemanticsShadowScopeAxis[];
  statementLocalEvidenceRefs: string[];
  trustedCatalogEvidenceRefs: string[];
  curatedKnowledgeEvidenceRefs: string[];
  qualifiedResearchEvidenceRefs: string[];
  aiHypothesisEvidenceRefs: string[];
  admissionRefs: string[];
  sourceSnapshotRefs: string[];
  candidateConceptIds: string[];
  exactCandidateConceptIds: string[];
  applicableExactCandidateConceptIds: string[];
  inapplicableExactCandidateConceptIds: string[];
  retrievalLeadConceptIds: string[];
  usefulSemanticResolution: boolean;
  pricingCorrectnessEstablished: false;
  merchantSpecificApplicabilityEstablished: false;
  financialAuthority: "none";
  reasonCodes: string[];
};

export type FeeSemanticsShadowCoverage = {
  totalFeeRows: number;
  statementLocalUnknownOrAmbiguousRows: number;
  exactTrustedResolutionRows: number;
  statementLocalUnknownOrAmbiguousResolvedRows: number;
  candidateOnlyRows: number;
  exactUnacceptedCandidateRows: number;
  retrievalCandidateOnlyRows: number;
  scopeOrPeriodConflictRows: number;
  conflictingRows: number;
  noEvidenceRows: number;
  fuzzyRetrievalRows: number;
  usefulResolutionRate: number;
  resolvedConceptIds: string[];
  aliasesUsed: Array<{ alias: string; conceptId: string; rowCount: number }>;
};

export type FeeSemanticsShadowStatementReport = {
  integrationVersion: typeof FEE_SEMANTICS_SHADOW_STATEMENT_INTEGRATION_VERSION;
  mode: "shadow_evaluation_only";
  authority: "diagnostic_only";
  statementRef: string;
  statementPeriod: { start: string; end: string } | null;
  statementPeriodEvidenceRefs: string[];
  processor: FeeSemanticsShadowContextValue;
  geography: FeeSemanticsShadowContextValue;
  catalogVersion: string;
  rows: FeeSemanticsShadowRowResult[];
  coverage: FeeSemanticsShadowCoverage;
  canonicalMutationAllowed: false;
  limitations: string[];
};

export function buildFeeSemanticsShadowStatementReport(input: {
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger">;
  catalog: QualifiedFeeSemanticCatalog;
  context: FeeSemanticsShadowStatementContext;
}): FeeSemanticsShadowStatementReport {
  const statementPeriodEvidenceRefs = [...input.analysis.identity.statementPeriod.evidenceRefs];
  const statementPeriod = statementPeriodEvidenceRefs.length > 0 ? input.analysis.identity.statementPeriod.value : null;
  const processorEvidenceRefs = [...input.analysis.identity.processorFamily.evidenceRefs];
  const processor: FeeSemanticsShadowContextValue = {
    value: processorEvidenceRefs.length > 0 ? processorScopeId(input.analysis) : null,
    evidenceClass: "statement_local",
    evidenceRefs: processorEvidenceRefs,
  };
  const geography = usableContextValue(input.context.geography);
  const isoId = usableContextValue(input.context.isoId ?? emptyContextValue());
  const merchantAccountId = usableContextValue(input.context.merchantAccountId ?? emptyContextValue());
  const occurrenceEvidenceById = new Map(input.analysis.feeLedger.sourceOccurrences.map((item) => [item.id, item.evidenceRef]));
  const rows = input.analysis.feeLedger.rows.map((row) => resolveShadowRow({
    row,
    statementRef: input.analysis.identity.sourceDocumentRef,
    asOf: statementPeriod?.end ?? "0001-01-01",
    processor,
    geography,
    isoId,
    merchantAccountId,
    statementLocalMeaning: input.context.statementLocalMeaningByFeeRowId?.[row.id] ?? "unknown",
    explicitNetwork: input.context.networkIdByFeeRowId?.[row.id]
      ? usableContextValue(input.context.networkIdByFeeRowId[row.id]!)
      : null,
    occurrenceEvidenceById,
    catalog: input.catalog,
  }));
  return deepFreeze({
    integrationVersion: FEE_SEMANTICS_SHADOW_STATEMENT_INTEGRATION_VERSION,
    mode: "shadow_evaluation_only",
    authority: "diagnostic_only",
    statementRef: input.analysis.identity.sourceDocumentRef,
    statementPeriod,
    statementPeriodEvidenceRefs,
    processor,
    geography,
    catalogVersion: input.catalog.catalog.catalogVersion,
    rows,
    coverage: coverageFor(rows),
    canonicalMutationAllowed: false,
    limitations: [
      "Shadow semantic resolution cannot modify printed facts, fee membership, arithmetic, ownership classification, pricing conclusions, or financial authority.",
      "A trusted fee identity does not establish the merchant-specific rate, applicability, charged-amount correctness, or pricing correctness.",
      "Network inference is limited to an explicit printed network prefix or separately supplied statement-local context.",
      "Similarity retrieval remains candidate discovery only and cannot create an accepted identity.",
    ],
  });
}

function resolveShadowRow(input: {
  row: CanonicalFeeRow;
  statementRef: string;
  asOf: string;
  processor: FeeSemanticsShadowContextValue;
  geography: FeeSemanticsShadowContextValue;
  isoId: FeeSemanticsShadowContextValue;
  merchantAccountId: FeeSemanticsShadowContextValue;
  statementLocalMeaning: FeeSemanticsShadowStatementLocalMeaning;
  explicitNetwork: FeeSemanticsShadowContextValue | null;
  occurrenceEvidenceById: ReadonlyMap<string, string>;
  catalog: QualifiedFeeSemanticCatalog;
}): FeeSemanticsShadowRowResult {
  const printedNetwork = printedNetworkPrefix(input.row.selectedLabel);
  const networkConflict = Boolean(
    printedNetwork.networkId && input.explicitNetwork?.value && printedNetwork.networkId !== input.explicitNetwork.value,
  );
  const networkId = networkConflict ? null : input.explicitNetwork?.value ?? printedNetwork.networkId;
  const networkEvidenceBasis = networkConflict
    ? "conflicting"
    : input.explicitNetwork?.value
      ? "explicit_statement_context"
      : printedNetwork.networkId
        ? "printed_network_prefix"
        : "none";
  const feeRowEvidenceRefs = [...new Set(input.row.sourceOccurrenceIds
    .map((ref) => input.occurrenceEvidenceById.get(ref))
    .filter((ref): ref is string => Boolean(ref)))].sort();
  const statementLocalEvidenceRefs = [...new Set([
    ...feeRowEvidenceRefs,
    ...input.processor.evidenceRefs,
    ...input.geography.evidenceRefs,
    ...(input.explicitNetwork?.evidenceRefs ?? []),
  ])].sort();
  const variants = lookupVariants(input.row.selectedLabel, printedNetwork.prefixLength);
  if (networkConflict) {
    return unresolvedRow(input, variants, feeRowEvidenceRefs, statementLocalEvidenceRefs, networkId, networkEvidenceBasis,
      "unresolved_conflict", ["fee_semantics_shadow_printed_and_explicit_network_conflict"], ["network"]);
  }

  const attempts = variants.map((variant) => ({
    variant,
    result: resolveQualifiedFeeSemanticsCatalog(input.catalog, {
      statementRef: `${input.statementRef}#${input.row.id}`,
      label: variant.label,
      asOf: input.asOf,
      geography: input.geography.value,
      processorId: input.processor.value,
      isoId: input.isoId.value,
      networkId,
      merchantAccountId: input.merchantAccountId.value,
      statementLocalMeaning: input.statementLocalMeaning,
    }),
  }));
  const resolvedAttempts = attempts.filter((item) => item.result.resolution.status === "resolved_from_qualified_knowledge");
  const mostSpecificResolvedAttempts = resolvedAttempts.length === 0
    ? []
    : resolvedAttempts.filter((item) => item.variant.transformations.length
      === Math.min(...resolvedAttempts.map((candidate) => candidate.variant.transformations.length)));
  const mostSpecificConceptIds = [...new Set(mostSpecificResolvedAttempts
    .map((item) => item.result.resolution.conceptId)
    .filter(Boolean))];
  if (mostSpecificConceptIds.length > 1) {
    return unresolvedRow(input, variants, feeRowEvidenceRefs, statementLocalEvidenceRefs, networkId, networkEvidenceBasis,
      "unresolved_conflict", ["fee_semantics_shadow_equally_specific_lookup_variants_resolve_to_multiple_concepts"], []);
  }
  if (mostSpecificResolvedAttempts.length > 0) {
    const selected = mostSpecificResolvedAttempts.sort(compareResolvedAttempt)[0]!;
    return acceptedRow(input, selected.variant, selected.result, variants, feeRowEvidenceRefs, statementLocalEvidenceRefs, networkId, networkEvidenceBasis);
  }

  const mergedCandidates = uniqueCandidates(attempts.flatMap((item) => item.result.resolution.candidates));
  const status = unresolvedStatus(attempts.map((item) => item.result.resolution));
  const scopeConflictAxes = status === "unresolved_scope_or_period"
    ? exactCandidateScopeConflicts(input.catalog, mergedCandidates, {
      asOf: input.asOf,
      geography: input.geography.value,
      processorId: input.processor.value,
      isoId: input.isoId.value,
      networkId,
      merchantAccountId: input.merchantAccountId.value,
    })
    : [];
  const evidenceLanes = evidenceLanesFor(input.catalog, mergedCandidates.flatMap((item) => [
    ...item.qualifiedEvidenceRefs,
    ...item.candidateEvidenceRefs,
  ]));
  return {
    feeRowId: input.row.id,
    printedLabel: input.row.selectedLabel,
    feeRowEvidenceRefs,
    statementLocalMeaning: input.statementLocalMeaning,
    processorId: input.processor.value,
    networkId,
    networkEvidenceBasis,
    lookupVariants: variants,
    selectedLookupVariant: null,
    status,
    conceptId: null,
    conceptKind: null,
    semanticAxes: null,
    matchedAlias: null,
    retrievalBasis: null,
    scopeConflictAxes,
    statementLocalEvidenceRefs,
    trustedCatalogEvidenceRefs: [],
    curatedKnowledgeEvidenceRefs: evidenceLanes.curated,
    qualifiedResearchEvidenceRefs: evidenceLanes.research,
    aiHypothesisEvidenceRefs: evidenceLanes.ai,
    admissionRefs: [],
    sourceSnapshotRefs: [],
    candidateConceptIds: [...new Set(mergedCandidates.map((item) => item.conceptId))].sort(),
    exactCandidateConceptIds: [...new Set(mergedCandidates
      .filter((item) => item.retrievalBasis === "exact_alias")
      .map((item) => item.conceptId))].sort(),
    applicableExactCandidateConceptIds: [...new Set(mergedCandidates
      .filter((item) => item.retrievalBasis === "exact_alias" && item.scopeApplicable && item.periodApplicable)
      .map((item) => item.conceptId))].sort(),
    inapplicableExactCandidateConceptIds: [...new Set(mergedCandidates
      .filter((item) => item.retrievalBasis === "exact_alias" && (!item.scopeApplicable || !item.periodApplicable))
      .map((item) => item.conceptId))].sort(),
    retrievalLeadConceptIds: [...new Set(mergedCandidates
      .filter((item) => item.retrievalBasis !== "exact_alias")
      .map((item) => item.conceptId))].sort(),
    usefulSemanticResolution: false,
    pricingCorrectnessEstablished: false,
    merchantSpecificApplicabilityEstablished: false,
    financialAuthority: "none",
    reasonCodes: [...new Set([
      `fee_semantics_shadow_${status}`,
      ...attempts.flatMap((item) => item.result.resolution.reasonCodes),
      ...(mergedCandidates.some((item) => item.retrievalBasis === "exact_alias") ? ["fee_semantics_shadow_exact_alias_not_accepted"] : []),
      ...(mergedCandidates.some((item) => item.retrievalBasis !== "exact_alias") ? ["fee_semantics_shadow_similarity_candidate_only"] : []),
    ])].sort(),
  };
}

function acceptedRow(
  input: Parameters<typeof resolveShadowRow>[0],
  variant: FeeSemanticsShadowLookupVariant,
  qualified: QualifiedFeeSemanticResolution,
  variants: FeeSemanticsShadowLookupVariant[],
  feeRowEvidenceRefs: string[],
  statementLocalEvidenceRefs: string[],
  networkId: string | null,
  networkEvidenceBasis: FeeSemanticsShadowRowResult["networkEvidenceBasis"],
): FeeSemanticsShadowRowResult {
  const resolution = qualified.resolution;
  const acceptedCandidate = resolution.candidates.find((item) => item.acceptanceEligible && item.conceptId === resolution.conceptId) ?? null;
  const evidenceLanes = evidenceLanesFor(input.catalog, resolution.qualifiedKnowledgeRefs);
  return {
    feeRowId: input.row.id,
    printedLabel: input.row.selectedLabel,
    feeRowEvidenceRefs,
    statementLocalMeaning: input.statementLocalMeaning,
    processorId: input.processor.value,
    networkId,
    networkEvidenceBasis,
    lookupVariants: variants,
    selectedLookupVariant: variant,
    status: "resolved_exact_trusted",
    conceptId: resolution.conceptId,
    conceptKind: resolution.conceptKind,
    semanticAxes: resolution.axes,
    matchedAlias: acceptedCandidate?.matchedAlias ?? null,
    retrievalBasis: acceptedCandidate?.retrievalBasis ?? null,
    scopeConflictAxes: [],
    statementLocalEvidenceRefs,
    trustedCatalogEvidenceRefs: [...resolution.qualifiedKnowledgeRefs],
    curatedKnowledgeEvidenceRefs: evidenceLanes.curated,
    qualifiedResearchEvidenceRefs: evidenceLanes.research,
    aiHypothesisEvidenceRefs: evidenceLanes.ai,
    admissionRefs: [...qualified.admissionRefs],
    sourceSnapshotRefs: [...qualified.sourceSnapshotRefs],
    candidateConceptIds: resolution.conceptId ? [resolution.conceptId] : [],
    exactCandidateConceptIds: resolution.conceptId ? [resolution.conceptId] : [],
    applicableExactCandidateConceptIds: resolution.conceptId ? [resolution.conceptId] : [],
    inapplicableExactCandidateConceptIds: [],
    retrievalLeadConceptIds: [],
    usefulSemanticResolution: true,
    pricingCorrectnessEstablished: false,
    merchantSpecificApplicabilityEstablished: false,
    financialAuthority: "none",
    reasonCodes: [...new Set([
      "fee_semantics_shadow_exact_trusted_identity_only",
      ...resolution.reasonCodes,
      ...variant.transformations.map((item) => `fee_semantics_shadow_${item}`),
    ])].sort(),
  };
}

function unresolvedRow(
  input: Parameters<typeof resolveShadowRow>[0],
  variants: FeeSemanticsShadowLookupVariant[],
  feeRowEvidenceRefs: string[],
  statementLocalEvidenceRefs: string[],
  networkId: string | null,
  networkEvidenceBasis: FeeSemanticsShadowRowResult["networkEvidenceBasis"],
  status: FeeSemanticsShadowRowStatus,
  reasonCodes: string[],
  scopeConflictAxes: FeeSemanticsShadowScopeAxis[],
): FeeSemanticsShadowRowResult {
  return {
    feeRowId: input.row.id,
    printedLabel: input.row.selectedLabel,
    feeRowEvidenceRefs,
    statementLocalMeaning: input.statementLocalMeaning,
    processorId: input.processor.value,
    networkId,
    networkEvidenceBasis,
    lookupVariants: variants,
    selectedLookupVariant: null,
    status,
    conceptId: null,
    conceptKind: null,
    semanticAxes: null,
    matchedAlias: null,
    retrievalBasis: null,
    scopeConflictAxes,
    statementLocalEvidenceRefs,
    trustedCatalogEvidenceRefs: [],
    curatedKnowledgeEvidenceRefs: [],
    qualifiedResearchEvidenceRefs: [],
    aiHypothesisEvidenceRefs: [],
    admissionRefs: [],
    sourceSnapshotRefs: [],
    candidateConceptIds: [],
    exactCandidateConceptIds: [],
    applicableExactCandidateConceptIds: [],
    inapplicableExactCandidateConceptIds: [],
    retrievalLeadConceptIds: [],
    usefulSemanticResolution: false,
    pricingCorrectnessEstablished: false,
    merchantSpecificApplicabilityEstablished: false,
    financialAuthority: "none",
    reasonCodes,
  };
}

function lookupVariants(label: string, printedNetworkPrefixLength: number): FeeSemanticsShadowLookupVariant[] {
  const original = label.trim().replace(/\s+/g, " ");
  const withoutNetwork = printedNetworkPrefixLength > 0 ? original.slice(printedNetworkPrefixLength).trim() : original;
  const candidates: FeeSemanticsShadowLookupVariant[] = [
    { label: original, transformations: [] },
    ...(withoutNetwork !== original
      ? [{
        label: withoutNetwork,
        transformations: ["remove_printed_network_prefix"] as FeeSemanticsShadowLookupVariant["transformations"],
      }]
      : []),
  ];
  for (const candidate of [...candidates]) {
    const withoutArithmetic = removePrintedArithmeticSuffix(candidate.label);
    if (withoutArithmetic !== candidate.label) {
      candidates.push({
        label: withoutArithmetic,
        transformations: [...candidate.transformations, "remove_printed_arithmetic_suffix"],
      });
    }
  }
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const normalized = item.label.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function removePrintedArithmeticSuffix(label: string): string {
  return label
    .replace(/\s+[\d,]+(?:\.\d+)?\s+(?:TRANSACTIONS?|ITEMS?)\s+AT\s+\$?(?:\d+(?:\.\d+)?|\.\d+)\s*$/i, "")
    .replace(/\s+\$?(?:\d+(?:\.\d+)?|\.\d+)\s+(?:DISC(?:OUNT)?\s+RATE\s+)?TIMES\s+\$?[\d,]+(?:\.\d+)?\s*$/i, "")
    .trim();
}

function printedNetworkPrefix(label: string): { networkId: string | null; prefixLength: number } {
  const match = label.match(/^\s*(MASTERCARD|VISA|DISCOVER|AMERICAN EXPRESS|AMEX(?:CT\d+)?|AMEX ACQ)\s*[-:]\s*/i);
  if (!match) return { networkId: null, prefixLength: 0 };
  const token = match[1]!.toUpperCase();
  const networkId = token === "MASTERCARD"
    ? "mastercard"
    : token === "VISA"
      ? "visa"
      : token === "DISCOVER"
        ? "discover"
        : "american_express";
  return { networkId, prefixLength: match[0].length };
}

function processorScopeId(analysis: Pick<CanonicalStatementAnalysis, "identity">): string | null {
  const value = analysis.identity.processorFamily.value ?? analysis.identity.processorName.value;
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || null;
}

function compareResolvedAttempt(
  left: { variant: FeeSemanticsShadowLookupVariant },
  right: { variant: FeeSemanticsShadowLookupVariant },
): number {
  return left.variant.transformations.length - right.variant.transformations.length
    || right.variant.label.length - left.variant.label.length;
}

function unresolvedStatus(resolutions: FeeSemanticResolution[]): FeeSemanticsShadowRowStatus {
  if (resolutions.some((item) => item.status === "unresolved_conflict")) return "unresolved_conflict";
  const exactBearing = resolutions.filter((item) => item.candidates.some((candidate) => candidate.retrievalBasis === "exact_alias"));
  if (exactBearing.some((item) => item.status === "candidate_only")) return "candidate_only";
  if (exactBearing.some((item) => item.status === "unresolved_scope_or_period")) return "unresolved_scope_or_period";
  if (resolutions.some((item) => item.status === "candidate_only")) return "retrieval_candidates_only";
  if (resolutions.some((item) => item.status === "unresolved_scope_or_period")) return "unresolved_scope_or_period";
  return "unresolved_no_evidence";
}

function uniqueCandidates(candidates: FeeSemanticRetrievalCandidate[]): FeeSemanticRetrievalCandidate[] {
  const byKey = new Map<string, FeeSemanticRetrievalCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.conceptId}:${candidate.aliasId}:${candidate.retrievalBasis}`;
    const current = byKey.get(key);
    if (!current || candidate.similarity > current.similarity) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

function exactCandidateScopeConflicts(
  catalog: QualifiedFeeSemanticCatalog,
  candidates: FeeSemanticRetrievalCandidate[],
  context: Omit<FeeSemanticQuery, "statementRef" | "label" | "statementLocalMeaning">,
): FeeSemanticsShadowScopeAxis[] {
  const exactAliasRefs = new Set(candidates.filter((item) => item.retrievalBasis === "exact_alias").map((item) => item.aliasId));
  const aliases = catalog.catalog.concepts.flatMap((concept) => concept.aliases).filter((alias) => exactAliasRefs.has(alias.aliasId));
  const axes = new Set<FeeSemanticsShadowScopeAxis>();
  for (const alias of aliases) {
    if ((alias.scope.effectiveFrom && context.asOf < alias.scope.effectiveFrom)
      || (alias.scope.effectiveTo && context.asOf >= alias.scope.effectiveTo)) axes.add("period");
    if (!dimensionApplies(alias.scope.geographies, context.geography)) axes.add("geography");
    if (!dimensionApplies(alias.scope.processorIds, context.processorId)) axes.add("processor");
    if (!dimensionApplies(alias.scope.isoIds, context.isoId)) axes.add("iso");
    if (!dimensionApplies(alias.scope.networkIds, context.networkId)) axes.add("network");
    if (!dimensionApplies(alias.scope.merchantAccountIds, context.merchantAccountId)) axes.add("merchant_account");
  }
  return [...axes].sort();
}

function dimensionApplies(allowed: readonly string[], actual: string | null): boolean {
  return allowed.length === 0 || (actual !== null && allowed.includes(actual));
}

function evidenceLanesFor(
  catalog: QualifiedFeeSemanticCatalog,
  refs: readonly string[],
): { curated: string[]; research: string[]; ai: string[] } {
  const refSet = new Set(refs);
  const byClass = (evidenceClass: FeeSemanticEvidenceClass) => catalog.catalog.evidence
    .filter((item) => refSet.has(item.evidenceId) && item.evidenceClass === evidenceClass)
    .map((item) => item.evidenceId)
    .sort();
  return {
    curated: byClass("curated_industry_knowledge"),
    research: byClass("qualified_external_research"),
    ai: byClass("ai_hypothesis"),
  };
}

function coverageFor(rows: FeeSemanticsShadowRowResult[]): FeeSemanticsShadowCoverage {
  const aliases = new Map<string, { alias: string; conceptId: string; rowCount: number }>();
  for (const row of rows) {
    if (!row.matchedAlias || !row.conceptId) continue;
    const key = `${row.conceptId}:${row.matchedAlias}`;
    const current = aliases.get(key);
    aliases.set(key, current
      ? { ...current, rowCount: current.rowCount + 1 }
      : { alias: row.matchedAlias, conceptId: row.conceptId, rowCount: 1 });
  }
  const unknownOrAmbiguous = rows.filter((row) => row.statementLocalMeaning !== "understood");
  const exactResolved = rows.filter((row) => row.status === "resolved_exact_trusted");
  return {
    totalFeeRows: rows.length,
    statementLocalUnknownOrAmbiguousRows: unknownOrAmbiguous.length,
    exactTrustedResolutionRows: exactResolved.length,
    statementLocalUnknownOrAmbiguousResolvedRows: exactResolved.filter((row) => row.statementLocalMeaning !== "understood").length,
    candidateOnlyRows: rows.filter((row) => row.status === "candidate_only").length,
    exactUnacceptedCandidateRows: rows.filter((row) => row.status === "candidate_only"
      && row.reasonCodes.includes("fee_semantics_shadow_exact_alias_not_accepted")).length,
    retrievalCandidateOnlyRows: rows.filter((row) => row.status === "retrieval_candidates_only").length,
    scopeOrPeriodConflictRows: rows.filter((row) => row.status === "unresolved_scope_or_period").length,
    conflictingRows: rows.filter((row) => row.status === "unresolved_conflict").length,
    noEvidenceRows: rows.filter((row) => row.status === "unresolved_no_evidence").length,
    fuzzyRetrievalRows: rows.filter((row) => row.reasonCodes.includes("fee_semantics_shadow_similarity_candidate_only")).length,
    usefulResolutionRate: rows.length === 0 ? 0 : Number((exactResolved.length / rows.length).toFixed(4)),
    resolvedConceptIds: [...new Set(exactResolved.map((row) => row.conceptId).filter((item): item is string => Boolean(item)))].sort(),
    aliasesUsed: [...aliases.values()].sort((left, right) => right.rowCount - left.rowCount || left.alias.localeCompare(right.alias)),
  };
}

function emptyContextValue(): FeeSemanticsShadowContextValue {
  return { value: null, evidenceClass: "statement_local", evidenceRefs: [] };
}

function usableContextValue(value: FeeSemanticsShadowContextValue): FeeSemanticsShadowContextValue {
  return {
    value: value.value !== null && value.evidenceRefs.length > 0 ? value.value : null,
    evidenceClass: value.evidenceClass,
    evidenceRefs: [...value.evidenceRefs],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
