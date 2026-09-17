import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalEconomicCategory } from "../economicTypes.js";
import type { CanonicalEconomicSemanticApplicationAdmission } from "../economicAnalysis.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "../economicTypes.js";
import { resolveKnowledge } from "../knowledge/knowledgeResolver.js";
import type {
  KnowledgeClaimValue,
  KnowledgeEntry,
  KnowledgeQuery,
  KnowledgeQueryScope,
  KnowledgeResolution,
  KnowledgeValidationIssue,
} from "../knowledge/knowledgeTypes.js";
import { validateKnowledgeLibrary } from "../knowledge/knowledgeValidate.js";
import { normalizeObservationLabel } from "../sourceLabelIdentity.js";
import {
  atomicClaimIdForSeed,
  canonicalAtomicClaimGroupingKey,
  canonicalAtomicClaimId,
  canonicalSemanticValueApplicable,
  compileCanonicalAtomicClaimSeeds,
  LOSSLESS_ROLE_FACETS,
  type CanonicalAtomicClaimFacet,
  type CanonicalAtomicClaimSeed,
} from "./atomicClaims.js";
import { bindCanonicalProductionApplicabilityScope } from "./productionApplicabilityScope.js";
import type { CanonicalUnresolvedClaim, CanonicalUnresolvedClaimInventory } from "./unresolvedClaims.js";

export const CANONICAL_RF_RESOLUTION_SCHEMA_VERSION = "canonical_rf_claim_resolution_v4" as const;

const APPLICABLE_CATEGORIES = new Set<CanonicalEconomicCategory>([
  "issuer_interchange_economics",
  "network_card_brand_economics",
  "processor_acquirer_pricing",
  "processor_service_administrative_cost",
  "third_party_service_equipment",
  "operational_exception_penalty_fee",
  "processing_fee_tax",
  "other_source_grounded_fee",
]);

export type CanonicalRfKnowledgeSnapshot = {
  snapshotHash: string;
  entryCount: number;
  entryRefs: string[];
  validation: { status: "valid" | "invalid"; errors: string[] };
};

export type CanonicalRfKnowledgeInput = {
  entries: readonly KnowledgeEntry[];
  tenantRef: string;
  accountRef: string;
  binding?: {
    source: "governed_catalog" | "supplied_evaluation" | "run_isolated_empty";
    availability: "available" | "unavailable";
    expectedSnapshotHash: string | null;
    visibilityMode: "merchant_account" | "anonymous_run" | "supplied_evaluation";
    tenantPrivateKnowledge: "disabled" | "caller_evaluation_boundary";
    limitationCodes: string[];
  };
};

export type CanonicalRfKnowledgeBinding = NonNullable<CanonicalRfKnowledgeInput["binding"]>;

export type CanonicalRfClaimDecision = {
  claimId: string;
  claimClass: CanonicalUnresolvedClaim["claimClass"];
  canonicalRefs: string[];
  occurrenceRefs: string[];
  disposition:
    | "resolved_by_admitted_knowledge"
    | "unresolved_no_admitted_knowledge"
    | "unresolved_conflict"
    | "unresolved_visibility_boundary"
    | "unresolved_scope_or_period"
    | "unresolved_policy_rejection"
    | "not_applied_no_authorized_rf_mapping";
  query: KnowledgeQuery | null;
  resolution: KnowledgeResolution | null;
  applicationKey: string | null;
  limitations: string[];
};

export type CanonicalRfClaimResolution = {
  schemaVersion: typeof CANONICAL_RF_RESOLUTION_SCHEMA_VERSION;
  authority: "claim_specific_admitted_knowledge_only";
  canonicalMutationAuthority: "lossless_category_and_nonconstraint_role_facets";
  automaticPromotion: "prohibited";
  rgExecution: "disabled";
  providerExecution: "disabled";
  publicResearch: "disabled";
  benchmarkExecution: "disabled";
  businessContextAuthority: "excluded_from_canonical_economics";
  knowledgeBinding: CanonicalRfKnowledgeBinding;
  snapshot: CanonicalRfKnowledgeSnapshot;
  decisions: CanonicalRfClaimDecision[];
  categoryApplications: CanonicalEconomicSemanticApplicationAdmission[];
  roleApplications: CanonicalEconomicSemanticApplicationAdmission[];
  semanticApplications: CanonicalEconomicSemanticApplicationAdmission[];
  atomicDecisions: CanonicalRfAtomicDecision[];
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalRfAtomicDecision = {
  atomicClaimId: string;
  parentClaimIds: string[];
  facet: CanonicalAtomicClaimFacet;
  canonicalRefs: string[];
  occurrenceRefs: string[];
  disposition: CanonicalRfClaimDecision["disposition"];
  query: KnowledgeQuery | null;
  resolution: KnowledgeResolution | null;
  applicationKeys: string[];
  limitations: string[];
};

export function canonicalRfKnowledgeSnapshot(entries: readonly KnowledgeEntry[]): CanonicalRfKnowledgeSnapshot {
  const sorted = [...entries].sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
  const validation = validateKnowledgeLibrary(sorted);
  return {
    snapshotHash: digest(sorted),
    entryCount: sorted.length,
    entryRefs: sorted.map((entry) => `${entry.id}@${entry.version}`),
    validation: {
      status: validation.valid ? "valid" : "invalid",
      errors: validation.issues.map(formatKnowledgeIssue).sort(),
    },
  };
}

export function canonicalRfExecutionContextHash(input: {
  entries: readonly KnowledgeEntry[];
  tenantRef: string;
  accountRef: string;
  binding?: CanonicalRfKnowledgeInput["binding"];
}): string {
  const snapshot = canonicalRfKnowledgeSnapshot(input.entries);
  const binding = normalizedBinding(input.binding, snapshot.snapshotHash);
  return digest({
    schemaVersion: CANONICAL_RF_RESOLUTION_SCHEMA_VERSION,
    knowledgeSnapshotHash: binding.availability === "available"
      ? binding.expectedSnapshotHash ?? snapshot.snapshotHash
      : snapshot.snapshotHash,
    tenantRef: input.tenantRef,
    accountRef: input.accountRef,
    binding,
  });
}

export function buildCanonicalRfClaimResolution(input: {
  inventory: CanonicalUnresolvedClaimInventory;
  economic: CanonicalEconomicsV2EconomicAnalysis;
  entries: readonly KnowledgeEntry[];
  tenantRef: string;
  accountRef: string;
  binding?: CanonicalRfKnowledgeInput["binding"];
}): CanonicalRfClaimResolution {
  const snapshot = canonicalRfKnowledgeSnapshot(input.entries);
  const knowledgeBinding = normalizedBinding(input.binding, snapshot.snapshotHash);
  const errors: string[] = [...snapshot.validation.errors];
  const warnings: string[] = [];
  if (knowledgeBinding.availability === "unavailable") {
    errors.push("rf_knowledge_catalog_unavailable", ...knowledgeBinding.limitationCodes);
  }
  if (knowledgeBinding.availability === "available"
    && knowledgeBinding.expectedSnapshotHash !== snapshot.snapshotHash) errors.push("rf_knowledge_snapshot_binding_mismatch");
  if (input.inventory.validation.status !== "valid") errors.push("rf_requires_valid_unresolved_claim_inventory");
  if (input.economic.validation.status !== "valid") errors.push("rf_requires_valid_capability_bound_economics");
  if (!safeBoundary(input.tenantRef) || !safeBoundary(input.accountRef)) errors.push("rf_invalid_tenant_or_account_boundary");

  const decisions: CanonicalRfClaimDecision[] = [];
  const categoryApplications: CanonicalEconomicSemanticApplicationAdmission[] = [];
  const roleApplications: CanonicalEconomicSemanticApplicationAdmission[] = [];
  const atomicDecisions: CanonicalRfAtomicDecision[] = [];
  if (errors.length === 0) {
    const chargeById = new Map(input.economic.economicLayer.charges.map((charge) => [charge.id, charge]));
    const occurrenceById = new Map(input.economic.pricingAnalysis.foundation.sourceModel.occurrences.map((item) => [item.id, item]));
    const sectionById = new Map(input.economic.pricingAnalysis.foundation.sourceModel.sections.map((item) => [item.id, item]));
    const statementPeriod = input.economic.pricingAnalysis.foundation.identity.statementPeriod;
    for (const claim of input.inventory.claims) {
      if (claim.claimClass !== "economic_category") {
        continue;
      }
      const charge = claim.canonicalRefs.length === 1 ? chargeById.get(claim.canonicalRefs[0]!) : undefined;
      const occurrence = claim.occurrenceRefs.length === 1 ? occurrenceById.get(claim.occurrenceRefs[0]!) : undefined;
      if (!charge || !occurrence || !statementPeriod || charge.contributingOccurrenceRef !== occurrence.id ||
          !charge.sourceOccurrenceRefs.includes(occurrence.id)) {
        errors.push(`rf_category_claim_lineage_invalid:${claim.claimId}`);
        decisions.push({ ...noAuthorizedMapping(claim), disposition: "unresolved_policy_rejection",
          limitations: ["The category claim lacked exact charge, occurrence, or period lineage."] });
        continue;
      }
      const subjectCode = categorySubjectCode(occurrence.sourceLabel);
      const scope = queryScope({
        economic: input.economic,
        sectionKind: sectionById.get(occurrence.sectionRef)?.kind ?? null,
        tenantRef: input.tenantRef,
        accountRef: input.accountRef,
      });
      const query: KnowledgeQuery = {
        claimType: "stable_facet_mapping",
        subjectCode,
        asOf: statementPeriod.end,
        scope,
      };
      const resolution = resolveKnowledge(input.entries, query);
      const disposition = resolutionDisposition(resolution);
      if (disposition !== "resolved_by_admitted_knowledge") {
        decisions.push({ claimId: claim.claimId, claimClass: claim.claimClass,
          canonicalRefs: [...claim.canonicalRefs], occurrenceRefs: [...claim.occurrenceRefs], disposition, query, resolution,
          applicationKey: null, limitations: ["The category remains unresolved because applicable admitted RF knowledge did not resolve it."] });
        continue;
      }
      const category = resolvedCategory(resolution, subjectCode);
      if (!category) {
        warnings.push(`rf_category_value_rejected:${claim.claimId}`);
        decisions.push({ claimId: claim.claimId, claimClass: claim.claimClass,
          canonicalRefs: [...claim.canonicalRefs], occurrenceRefs: [...claim.occurrenceRefs], disposition: "unresolved_policy_rejection",
          query, resolution, applicationKey: null,
          limitations: ["Resolved RF knowledge did not contain an exact authorized category mapping value."] });
        continue;
      }
      const applicationKey = `rf_category_${digest({ claimId: claim.claimId, subjectCode }).slice(0, 20)}`;
      const scopeFingerprint = digest(query.scope).slice(0, 32);
      const groupingKey = canonicalAtomicClaimGroupingKey({
        claimClass: claim.claimClass,
        facet: "economic_category",
        opaqueSubjectCode: subjectCode,
        scopeFingerprint,
        period: canonicalJson(statementPeriod),
        direction: claim.amountUnderReview?.direction ?? "not_monetary",
      });
      categoryApplications.push({
        key: applicationKey,
        chargeRef: charge.id,
        claimRef: claim.claimId,
        atomicClaimId: canonicalAtomicClaimId({ groupingKey }),
        facet: "economic_category",
        claimClass: "economic_category",
        occurrenceRef: occurrence.id,
        value: { kind: "mapping", canonicalCode: category, sourceCode: subjectCode },
        sourceKind: "governed_rf_snapshot",
        knowledgeClaimType: "stable_facet_mapping",
        knowledgeSubjectCode: subjectCode,
        knowledgeSnapshotHash: snapshot.snapshotHash,
        selectedEntryRefs: [...resolution.selectedEntryRefs],
        sourceAuthorities: [...resolution.sourceAuthorities],
        externalEvidenceRefs: [],
        asOf: query.asOf,
        effectiveFrom: null,
        effectiveTo: null,
        scopeFingerprint,
        limitations: [
          "Admitted RF knowledge resolves only this charge's economic category.",
          "Ownership, control, actionability, pricing, benchmark position, and savings remain independent claims.",
        ],
      });
      decisions.push({ claimId: claim.claimId, claimClass: claim.claimClass,
        canonicalRefs: [...claim.canonicalRefs], occurrenceRefs: [...claim.occurrenceRefs], disposition, query, resolution,
        applicationKey, limitations: ["The admitted mapping is restricted to the economic-category claim."] });
    }
    const roleResolution = resolveRfRoleFacets({
      inventory: input.inventory,
      economic: input.economic,
      entries: input.entries,
      snapshotHash: snapshot.snapshotHash,
      categoryDecisions: decisions,
    });
    roleApplications.push(...roleResolution.applications);
    atomicDecisions.push(...roleResolution.decisions);
    errors.push(...roleResolution.errors);
    warnings.push(...roleResolution.warnings);
  }

  const duplicateApplicationClaims = duplicates(categoryApplications.map((item) => item.claimRef));
  for (const claimRef of duplicateApplicationClaims) errors.push(`rf_duplicate_category_application:${claimRef}`);
  const semanticApplications = [...categoryApplications, ...roleApplications]
    .sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId) || left.chargeRef.localeCompare(right.chargeRef));
  return {
    schemaVersion: CANONICAL_RF_RESOLUTION_SCHEMA_VERSION,
    authority: "claim_specific_admitted_knowledge_only",
    canonicalMutationAuthority: "lossless_category_and_nonconstraint_role_facets",
    automaticPromotion: "prohibited",
    rgExecution: "disabled",
    providerExecution: "disabled",
    publicResearch: "disabled",
    benchmarkExecution: "disabled",
    businessContextAuthority: "excluded_from_canonical_economics",
    knowledgeBinding,
    snapshot,
    decisions: decisions.sort((left, right) => left.claimId.localeCompare(right.claimId)),
    categoryApplications: categoryApplications.sort((left, right) => left.claimRef.localeCompare(right.claimRef)),
    roleApplications: roleApplications.sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId)
      || left.chargeRef.localeCompare(right.chargeRef)),
    semanticApplications,
    atomicDecisions: atomicDecisions.sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId)),
    validation: { status: errors.length === 0 ? "valid" : "invalid", errors: unique(errors), warnings: unique(warnings) },
  };
}

function resolveRfRoleFacets(input: {
  inventory: CanonicalUnresolvedClaimInventory;
  economic: CanonicalEconomicsV2EconomicAnalysis;
  entries: readonly KnowledgeEntry[];
  snapshotHash: string;
  categoryDecisions: readonly CanonicalRfClaimDecision[];
}): {
  applications: CanonicalEconomicSemanticApplicationAdmission[];
  decisions: CanonicalRfAtomicDecision[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const applications: CanonicalEconomicSemanticApplicationAdmission[] = [];
  const decisions: CanonicalRfAtomicDecision[] = [];
  const statementPeriod = input.economic.pricingAnalysis.foundation.identity.statementPeriod;
  const categoryByCharge = new Map(input.categoryDecisions.filter((item) => item.claimClass === "economic_category" &&
    item.canonicalRefs.length === 1 && item.query).map((item) => [item.canonicalRefs[0]!, item] as const));
  const seeds = input.inventory.claims.flatMap((claim) => compileCanonicalAtomicClaimSeeds({
    claim,
    categoryQuery: claim.canonicalRefs.map((ref) => categoryByCharge.get(ref)?.query ?? null).find(Boolean) ?? null,
  })).filter((seed) => LOSSLESS_ROLE_FACETS.has(seed.facet));
  const groups = new Map<string, CanonicalAtomicClaimSeed[]>();
  for (const seed of seeds) {
    const atomicClaimId = atomicClaimIdForSeed(seed, statementPeriod);
    groups.set(atomicClaimId, [...(groups.get(atomicClaimId) ?? []), seed]);
  }
  const chargeById = new Map(input.economic.economicLayer.charges.map((charge) => [charge.id, charge]));
  const entryById = new Map(input.entries.map((entry) => [entry.id, entry]));
  for (const [atomicClaimId, group] of groups) {
    const first = group[0]!;
    const canonicalRefs = unique(group.flatMap((seed) => seed.parent.canonicalRefs));
    const occurrenceRefs = unique(group.flatMap((seed) => seed.parent.occurrenceRefs));
    const parentClaimIds = unique(group.map((seed) => seed.parent.claimId));
    const query = first.knowledgeQuery;
    if (!query) {
      decisions.push({ atomicClaimId, parentClaimIds, facet: first.facet, canonicalRefs, occurrenceRefs,
        disposition: "unresolved_policy_rejection", query: null, resolution: null, applicationKeys: [],
        limitations: ["The exact atomic role facet lacked an authorized RF query scope."] });
      continue;
    }
    const resolution = resolveKnowledge(input.entries, query);
    const disposition = resolutionDisposition(resolution);
    if (disposition !== "resolved_by_admitted_knowledge") {
      decisions.push({ atomicClaimId, parentClaimIds, facet: first.facet, canonicalRefs, occurrenceRefs,
        disposition, query, resolution, applicationKeys: [],
        limitations: ["The exact atomic role facet remains unresolved by the bound RF snapshot."] });
      continue;
    }
    if (!canonicalSemanticValueApplicable({ facet: first.facet, subjectCode: first.opaqueSubjectCode,
      value: resolution.value })) {
      warnings.push(`rf_role_value_rejected:${atomicClaimId}`);
      decisions.push({ atomicClaimId, parentClaimIds, facet: first.facet, canonicalRefs, occurrenceRefs,
        disposition: "unresolved_policy_rejection", query, resolution, applicationKeys: [],
        limitations: ["Resolved RF knowledge did not contain an exact losslessly applicable role value."] });
      continue;
    }
    const selectedEntries = resolution.selectedEntryRefs.map((ref) => entryById.get(ref)).filter(isKnowledgeEntry);
    const claimApplications = canonicalRefs.flatMap((chargeRef) => {
      const charge = chargeById.get(chargeRef);
      const occurrenceRef = charge?.contributingOccurrenceRef;
      const parent = group.find((seed) => seed.parent.canonicalRefs.includes(chargeRef))?.parent;
      if (!charge || !occurrenceRef || !occurrenceRefs.includes(occurrenceRef) || !parent) return [];
      return [{
        key: `rf_role_${digest({ atomicClaimId, chargeRef }).slice(0, 20)}`,
        chargeRef,
        claimRef: parent.claimId,
        atomicClaimId,
        facet: first.facet as CanonicalEconomicSemanticApplicationAdmission["facet"],
        claimClass: "participant_control_role" as const,
        occurrenceRef,
        value: structuredClone(resolution.value) as KnowledgeClaimValue,
        sourceKind: "governed_rf_snapshot" as const,
        knowledgeClaimType: "participant_control_role" as const,
        knowledgeSubjectCode: first.opaqueSubjectCode,
        knowledgeSnapshotHash: input.snapshotHash,
        selectedEntryRefs: [...resolution.selectedEntryRefs],
        sourceAuthorities: [...resolution.sourceAuthorities],
        externalEvidenceRefs: [],
        asOf: query.asOf,
        effectiveFrom: commonNullable(selectedEntries.map((entry) => entry.effectiveFrom)),
        effectiveTo: commonNullable(selectedEntries.map((entry) => entry.effectiveTo)),
        scopeFingerprint: first.scopeFingerprint,
        limitations: ["The immutable run-bound RF snapshot resolves only this exact participant/control-role facet."],
      }];
    });
    if (claimApplications.length !== canonicalRefs.length) {
      errors.push(`rf_role_claim_lineage_invalid:${atomicClaimId}`);
      decisions.push({ atomicClaimId, parentClaimIds, facet: first.facet, canonicalRefs, occurrenceRefs,
        disposition: "unresolved_policy_rejection", query, resolution, applicationKeys: [],
        limitations: ["The RF role answer lacked complete exact charge/occurrence lineage."] });
      continue;
    }
    applications.push(...claimApplications);
    decisions.push({ atomicClaimId, parentClaimIds, facet: first.facet, canonicalRefs, occurrenceRefs,
      disposition: "resolved_by_admitted_knowledge", query, resolution,
      applicationKeys: claimApplications.map((item) => item.key),
      limitations: ["The admitted RF answer is restricted to this exact atomic participant/control-role facet."] });
  }
  return { applications, decisions, errors: unique(errors), warnings: unique(warnings) };
}

function normalizedBinding(
  binding: CanonicalRfKnowledgeInput["binding"],
  snapshotHash: string,
): CanonicalRfKnowledgeBinding {
  return binding ? {
    ...binding,
    limitationCodes: unique(binding.limitationCodes),
  } : {
    source: "supplied_evaluation",
    availability: "available",
    expectedSnapshotHash: snapshotHash,
    visibilityMode: "supplied_evaluation",
    tenantPrivateKnowledge: "caller_evaluation_boundary",
    limitationCodes: [],
  };
}

export function validateCanonicalRfSemanticConvergence(input: {
  base: CanonicalEconomicsV2EconomicAnalysis;
  resolved: CanonicalEconomicsV2EconomicAnalysis;
  rf: CanonicalRfClaimResolution;
}): string[] {
  const errors: string[] = [];
  if (input.rf.validation.status !== "valid") return ["rf_semantic_application_requires_valid_resolution"];
  if (input.base.validation.status !== "valid" || input.resolved.validation.status !== "valid") {
    errors.push("rf_semantic_application_requires_valid_economics");
  }
  if (canonicalJson(input.base.pricingAnalysis.foundation.financialPopulations) !==
      canonicalJson(input.resolved.pricingAnalysis.foundation.financialPopulations) ||
      canonicalJson(input.base.pricingAnalysis.foundation.metrics) !== canonicalJson(input.resolved.pricingAnalysis.foundation.metrics)) {
    errors.push("rf_semantic_application_changed_deterministic_financial_truth");
  }
  const baseById = new Map(input.base.economicLayer.charges.map((charge) => [charge.id, charge]));
  const resolvedById = new Map(input.resolved.economicLayer.charges.map((charge) => [charge.id, charge]));
  if (baseById.size !== resolvedById.size) errors.push("rf_semantic_application_changed_charge_population");
  const applicationsByClaim = new Map(input.rf.semanticApplications.map((application) => [application.claimRef, application]));
  for (const [chargeId, baseCharge] of baseById) {
    const resolvedCharge = resolvedById.get(chargeId);
    if (!resolvedCharge) continue;
    const immutableBase = financialChargeProjection(baseCharge);
    const immutableResolved = financialChargeProjection(resolvedCharge);
    if (canonicalJson(immutableBase) !== canonicalJson(immutableResolved)) {
      errors.push(`rf_semantic_application_changed_charge_truth:${chargeId}`);
    }
    if (resolvedCharge.categoryResolution === "proven") {
      if (resolvedCharge.semanticApplicationRefs.length !== 1) errors.push(`rf_resolved_charge_application_count_invalid:${chargeId}`);
      const applied = input.resolved.economicLayer.semanticApplications.find((item) =>
        item.id === resolvedCharge.semanticApplicationRefs[0],
      );
      const rfApplication = applied ? applicationsByClaim.get(applied.claimRef) : undefined;
      if (!applied || !rfApplication || canonicalJson(applicationProjection(applied)) !== canonicalJson(applicationProjection(rfApplication))) {
        errors.push(`rf_resolved_charge_application_lineage_invalid:${chargeId}`);
      }
    } else if (resolvedCharge.semanticApplicationRefs.length > 0) {
      errors.push(`rf_unresolved_charge_has_application:${chargeId}`);
    }
  }
  if (input.resolved.economicLayer.semanticApplications.length !== input.rf.semanticApplications.length) {
    errors.push("rf_semantic_application_population_mismatch");
  }
  const baseStack = input.base.economicLayer.costStack;
  const resolvedStack = input.resolved.economicLayer.costStack;
  if (canonicalJson({ authoritativeStatementFeeTotal: baseStack.authoritativeStatementFeeTotal,
    totalStatementProcessingCost: baseStack.totalStatementProcessingCost,
    reconciliationDeltaMinor: baseStack.reconciliationDeltaMinor,
    reconciliationRef: baseStack.reconciliationRef }) !==
      canonicalJson({ authoritativeStatementFeeTotal: resolvedStack.authoritativeStatementFeeTotal,
        totalStatementProcessingCost: resolvedStack.totalStatementProcessingCost,
        reconciliationDeltaMinor: resolvedStack.reconciliationDeltaMinor,
        reconciliationRef: resolvedStack.reconciliationRef })) {
    errors.push("rf_semantic_application_changed_cost_reconciliation_truth");
  }
  return unique(errors);
}

export function categorySubjectCode(sourceLabel: string): string {
  const normalized = normalizeObservationLabel(sourceLabel).calculationFreeLabel || "unknown";
  return `economic_category_${digest({ identityClass: "normalized_fee_surface", normalized }).slice(0, 32)}`;
}

function queryScope(input: {
  economic: CanonicalEconomicsV2EconomicAnalysis;
  sectionKind: string | null;
  tenantRef: string;
  accountRef: string;
}): KnowledgeQueryScope {
  const foundation = input.economic.pricingAnalysis.foundation;
  return bindCanonicalProductionApplicabilityScope({
    tenantRef: input.tenantRef,
    accountRef: input.accountRef,
    processor: canonicalCodeOrNull(foundation.identity.processorFamily),
    processorProgram: null,
    acquirer: null,
    isoReseller: null,
    network: null,
    region: null,
    channel: null,
    cardProduct: null,
    merchantCategory: null,
    pricingProgram: null,
    templateFamily: canonicalCodeOrNull(foundation.templateCapability.detectedTemplate ?? foundation.templateCapability.detectedFamily),
    templateVersion: canonicalCodeOrNull(foundation.templateCapability.detectedVersion),
    sourceSection: canonicalCodeOrNull(input.sectionKind),
    population: "statement_processing_fee_occurrence",
    jurisdiction: null,
  });
}

function resolvedCategory(resolution: KnowledgeResolution, subjectCode: string): Exclude<CanonicalEconomicCategory, "unresolved_unclassified"> | null {
  const value = resolution.value;
  if (!value || value.kind !== "mapping" || value.sourceCode !== subjectCode || !APPLICABLE_CATEGORIES.has(value.canonicalCode as CanonicalEconomicCategory)) {
    return null;
  }
  return value.canonicalCode as Exclude<CanonicalEconomicCategory, "unresolved_unclassified">;
}

function resolutionDisposition(resolution: KnowledgeResolution): CanonicalRfClaimDecision["disposition"] {
  if (resolution.status === "resolved_single" || resolution.status === "resolved_corroborated") return "resolved_by_admitted_knowledge";
  return resolution.status;
}

function noAuthorizedMapping(claim: CanonicalUnresolvedClaim): CanonicalRfClaimDecision {
  return {
    claimId: claim.claimId,
    claimClass: claim.claimClass,
    canonicalRefs: [...claim.canonicalRefs],
    occurrenceRefs: [...claim.occurrenceRefs],
    disposition: "not_applied_no_authorized_rf_mapping",
    query: null,
    resolution: null,
    applicationKey: null,
    limitations: ["This slice defines no RF semantic-application mapping for this independent claim class."],
  };
}

function canonicalCodeOrNull(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return null;
  const prefixed = /^[a-z]/.test(normalized) ? normalized : `value_${normalized}`;
  return prefixed.slice(0, 128);
}

function safeBoundary(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/.test(value);
}

function formatKnowledgeIssue(issue: KnowledgeValidationIssue): string {
  return `rf_knowledge_${issue.code}:${issue.entryRef ?? "library"}`;
}

function financialChargeProjection(charge: CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["charges"][number]) {
  return {
    id: charge.id,
    sourceOccurrenceRefs: charge.sourceOccurrenceRefs,
    representationGroupRef: charge.representationGroupRef,
    contributingOccurrenceRef: charge.contributingOccurrenceRef,
    supportingDetailAdmissionId: charge.supportingDetailAdmissionId,
    supportingDetailAdmissionEvidenceRefs: charge.supportingDetailAdmissionEvidenceRefs,
    supportingDetailAdmissionAssertionBasis: charge.supportingDetailAdmissionAssertionBasis,
    pricingComponentRefs: charge.pricingComponentRefs,
    pricingPopulationRefs: charge.pricingPopulationRefs,
    observedAmount: charge.observedAmount,
    financialDirection: charge.financialDirection,
    statementPeriodApplicability: charge.statementPeriodApplicability,
    effectiveFrom: charge.effectiveFrom,
    effectiveTo: charge.effectiveTo,
    dependencyRefs: charge.dependencyRefs,
    evidenceRefs: charge.evidenceRefs,
    reconciliationRefs: charge.reconciliationRefs,
    derivabilityTier: charge.derivabilityTier,
    assertionBasis: charge.assertionBasis,
  };
}

function applicationProjection(application: CanonicalEconomicSemanticApplicationAdmission | CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["semanticApplications"][number]) {
  const { id: _id, key: _key, ...projection } = application as CanonicalEconomicSemanticApplicationAdmission & { id?: string };
  return projection;
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();
}

function commonNullable(values: Array<string | null>): string | null {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0]! : null;
}

function isKnowledgeEntry(value: KnowledgeEntry | undefined): value is KnowledgeEntry {
  return value !== undefined;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
