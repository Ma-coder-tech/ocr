import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalEconomicsV2EconomicAnalysis } from "../economicTypes.js";
import type { KnowledgeClaimType, KnowledgeQuery, KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import { KNOWLEDGE_CLAIM_POLICIES } from "../knowledge/knowledgePolicy.js";
import type { CanonicalRfClaimDecision, CanonicalRfClaimResolution } from "./rfClaimResolution.js";
import type { CanonicalUnresolvedClaim, CanonicalUnresolvedClaimClass, CanonicalUnresolvedClaimInventory } from "./unresolvedClaims.js";
import {
  MATERIALITY_CONTRACT_V1,
  combineMaterialityAxes,
  evaluateEconomicMateriality,
  type CanonicalClaimMateriality,
  type DecisionMaterialityTier,
  type EconomicMaterialityEvaluation,
} from "./materialityContract.js";

export const RG_WORK_LEDGER_SCHEMA_VERSION = "canonical_rg_work_ledger_v1" as const;

export type CanonicalAtomicClaimFacet =
  | "underlying_cost_billing_mode"
  | "merchant_price_schedule_shape"
  | "pricing_scope_uniformity"
  | "fee_detail_coverage"
  | "economic_category"
  | "economic_beneficiary"
  | "economic_owner"
  | "collector"
  | "billing_intermediary"
  | "rule_setter"
  | "price_setter"
  | "negotiator_change_authority"
  | "contractual_controller"
  | "constraint"
  | "recurrence"
  | "counterfactual"
  | "merchant_lever";

export type CanonicalRgClaimAdmission = {
  atomicClaimId: string;
  parentClaimIds: string[];
  claimClass: CanonicalUnresolvedClaimClass;
  facet: CanonicalAtomicClaimFacet;
  opaqueSubjectCode: string;
  scopeFingerprint: string;
  statementPeriod: { start: string; end: string } | null;
  direction: "debit" | "credit" | "not_monetary";
  canonicalRefs: string[];
  occurrenceRefs: string[];
  evidenceRefs: string[];
  magnitude: EconomicMaterialityEvaluation;
  decisionTier: DecisionMaterialityTier;
  decisionReasonCodes: string[];
  decisionBasis: {
    presentlyReachableEffects: CanonicalUnresolvedClaim["possibleDecisionEffects"];
    independentBlockingClaimClasses: CanonicalUnresolvedClaimClass[];
    admissibleOutcomeCodes: string[];
  };
  materiality: CanonicalClaimMateriality;
  researchAdmission:
    | "admitted_to_rg_work_ledger"
    | "contextual_opportunistic_only"
    | "immaterial_no_research"
    | "unresolved_materiality"
    | "withheld_rf_catalog_unavailable"
    | "withheld_no_authorized_research_mapping"
    | "withheld_non_public_evidence_required";
  knowledgeQuery: KnowledgeQuery | null;
  expectedKnowledgeValueConstraint:
    | { kind: "mapping"; sourceCode: string }
    | { kind: "role"; controlDimension: Extract<CanonicalAtomicClaimFacet,
      "economic_beneficiary" | "economic_owner" | "collector" | "billing_intermediary" | "rule_setter" | "price_setter"
      | "negotiator_change_authority" | "contractual_controller" | "constraint"> }
    | { kind: "boolean" }
    | null;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  evidenceObjective: string;
  expectedDecisionEffects: CanonicalUnresolvedClaim["possibleDecisionEffects"];
  limitations: string[];
};

export type CanonicalRgWorkItem = {
  workItemId: string;
  atomicClaimId: string;
  state: "planned";
  executionState: "planned_provider_execution_disabled";
  requestedOperation: "claim_scoped_public_research";
  materialityContractVersion: typeof MATERIALITY_CONTRACT_V1.version;
  evidenceObjective: string;
  expectedDecisionEffects: CanonicalUnresolvedClaim["possibleDecisionEffects"];
  knowledgeQuery: KnowledgeQuery;
  expectedKnowledgeValueConstraint: NonNullable<CanonicalRgClaimAdmission["expectedKnowledgeValueConstraint"]>;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  reservation: null;
  progress: { state: "not_started"; operationsAttempted: 0; evidenceItemsObserved: 0 };
  extensionDecisions: [];
  retryDecisions: [];
  resourceConsumption: { providerCalls: 0; searchCalls: 0; retrievalBytes: 0; aiCalls: 0; tokens: null };
  stopReason: null;
};

export type CanonicalRgOperation = {
  operationId: string;
  workItemId: string;
  state: "not_created";
};

export type CanonicalRgWorkLedger = {
  schemaVersion: typeof RG_WORK_LEDGER_SCHEMA_VERSION;
  authority: "claim_admission_and_planning_only";
  materialityContract: typeof MATERIALITY_CONTRACT_V1;
  providerExecution: "disabled";
  searchExecution: "disabled";
  retrievalExecution: "disabled";
  aiExecution: "disabled";
  automaticKnowledgePromotion: "prohibited";
  contextualResearchDefault: "opportunistic_only_no_independent_initiation";
  businessContextAuthority: "excluded_from_canonical_materiality";
  benchmarkAuthority: "excluded_from_canonical_materiality";
  rfBinding: {
    availability: "available" | "unavailable";
    snapshotHash: string;
    visibilityMode: string;
  };
  authoritativeStatementCostMinor: number | null;
  claimAdmissions: CanonicalRgClaimAdmission[];
  workItems: CanonicalRgWorkItem[];
  operations: CanonicalRgOperation[];
  summary: {
    atomicClaimCount: number;
    materialCount: number;
    contextualCount: number;
    immaterialCount: number;
    unresolvedCount: number;
    plannedWorkItemCount: number;
    operationCount: 0;
  };
  planHash: string;
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

type AtomSeed = {
  parent: CanonicalUnresolvedClaim;
  facet: CanonicalAtomicClaimFacet;
  opaqueSubjectCode: string;
  scopeFingerprint: string;
  knowledgeQuery: KnowledgeQuery | null;
};

export function buildCanonicalRgWorkLedger(input: {
  inventory: CanonicalUnresolvedClaimInventory;
  economic: CanonicalEconomicsV2EconomicAnalysis | null;
  rfResolution: CanonicalRfClaimResolution | null;
}): CanonicalRgWorkLedger {
  const errors: string[] = [];
  if (input.inventory.validation.status !== "valid") errors.push("rg_requires_valid_canonical_claim_inventory");
  if (input.economic?.validation.status !== "valid") errors.push("rg_requires_valid_canonical_economics");
  const authoritativeCost = authoritativeStatementCost(input.economic);
  const period = input.economic?.pricingAnalysis.foundation.identity.statementPeriod ?? null;
  const rfAvailability = input.rfResolution?.knowledgeBinding.availability ?? "unavailable";
  const rfDecisions = input.rfResolution?.decisions ?? [];
  const categoryDecisionByCharge = categoryDecisionIndex(rfDecisions);
  const seeds = input.inventory.claims.flatMap((claim) => atomSeeds(claim, categoryDecisionByCharge));
  const groups = groupSeeds(seeds, period);
  const admissions = [...groups.values()].map((group) => admissionForGroup({
    group, allSeeds: seeds, authoritativeCost, period, rfAvailability,
  })).sort((left, right) => left.atomicClaimId.localeCompare(right.atomicClaimId));
  const workItems = admissions.flatMap((admission) => admission.researchAdmission === "admitted_to_rg_work_ledger"
    && admission.knowledgeQuery ? [workItem(admission)] : [])
    .sort((left, right) => left.workItemId.localeCompare(right.workItemId));
  validateAdmissions(admissions, workItems, errors);
  const summary = {
    atomicClaimCount: admissions.length,
    materialCount: admissions.filter((item) => item.materiality === "material").length,
    contextualCount: admissions.filter((item) => item.materiality === "contextual").length,
    immaterialCount: admissions.filter((item) => item.materiality === "immaterial").length,
    unresolvedCount: admissions.filter((item) => item.materiality === "unresolved").length,
    plannedWorkItemCount: workItems.length,
    operationCount: 0 as const,
  };
  const planHash = digest({ materialityContract: MATERIALITY_CONTRACT_V1.version, rfAvailability,
    rfSnapshotHash: input.rfResolution?.snapshot.snapshotHash ?? "", authoritativeCost, admissions, workItems });
  return {
    schemaVersion: RG_WORK_LEDGER_SCHEMA_VERSION,
    authority: "claim_admission_and_planning_only",
    materialityContract: MATERIALITY_CONTRACT_V1,
    providerExecution: "disabled",
    searchExecution: "disabled",
    retrievalExecution: "disabled",
    aiExecution: "disabled",
    automaticKnowledgePromotion: "prohibited",
    contextualResearchDefault: "opportunistic_only_no_independent_initiation",
    businessContextAuthority: "excluded_from_canonical_materiality",
    benchmarkAuthority: "excluded_from_canonical_materiality",
    rfBinding: {
      availability: rfAvailability,
      snapshotHash: input.rfResolution?.snapshot.snapshotHash ?? "",
      visibilityMode: input.rfResolution?.knowledgeBinding.visibilityMode ?? "unbound",
    },
    authoritativeStatementCostMinor: authoritativeCost,
    claimAdmissions: admissions,
    workItems,
    operations: [],
    summary,
    planHash,
    validation: { status: errors.length === 0 ? "valid" : "invalid", errors: unique(errors), warnings: [] },
  };
}

function atomSeeds(
  claim: CanonicalUnresolvedClaim,
  categoryDecisionByCharge: Map<string, CanonicalRfClaimDecision>,
): AtomSeed[] {
  const facets = facetsForClass(claim.claimClass);
  const categoryDecision = claim.canonicalRefs.map((ref) => categoryDecisionByCharge.get(ref)).find(Boolean);
  const categoryQuery = categoryDecision?.query ?? null;
  const baseSubject = categoryQuery?.subjectCode.replace(/^economic_category_/, "economic_charge_")
    ?? `canonical_subject_${digest({ claimClass: claim.claimClass, canonicalRefs: claim.canonicalRefs,
      occurrenceRefs: claim.occurrenceRefs }).slice(0, 32)}`;
  const scopeFingerprint = categoryQuery ? digest(categoryQuery.scope) : digest({
    boundary: "canonical_claim_lineage_only", canonicalRefs: claim.canonicalRefs, occurrenceRefs: claim.occurrenceRefs,
  });
  return facets.map((facet) => ({
    parent: claim,
    facet,
    opaqueSubjectCode: subjectForFacet(baseSubject, facet),
    scopeFingerprint,
    knowledgeQuery: queryForFacet(facet, baseSubject, categoryQuery),
  }));
}

function facetsForClass(claimClass: CanonicalUnresolvedClaimClass): CanonicalAtomicClaimFacet[] {
  switch (claimClass) {
    case "pricing_underlying_cost": return ["underlying_cost_billing_mode"];
    case "pricing_schedule": return ["merchant_price_schedule_shape"];
    case "pricing_scope": return ["pricing_scope_uniformity"];
    case "fee_detail_coverage": return ["fee_detail_coverage"];
    case "economic_category": return ["economic_category"];
    case "economic_ownership": return ["economic_beneficiary", "economic_owner"];
    case "economic_control": return ["collector", "billing_intermediary", "rule_setter", "price_setter",
      "negotiator_change_authority", "contractual_controller", "constraint"];
    case "merchant_actionability": return ["recurrence", "counterfactual", "merchant_lever"];
  }
}

function queryForFacet(
  facet: CanonicalAtomicClaimFacet,
  baseSubject: string,
  categoryQuery: KnowledgeQuery | null,
): KnowledgeQuery | null {
  if (!categoryQuery) return null;
  if (facet === "economic_category") return categoryQuery;
  if (["economic_beneficiary", "economic_owner", "collector", "billing_intermediary", "rule_setter", "price_setter",
    "negotiator_change_authority", "contractual_controller", "constraint"].includes(facet)) {
    return { ...categoryQuery, claimType: "participant_control_role", subjectCode: subjectForFacet(baseSubject, facet) };
  }
  if (facet === "merchant_lever") {
    return { ...categoryQuery, claimType: "merchant_lever_availability", subjectCode: subjectForFacet(baseSubject, facet) };
  }
  return null;
}

function subjectForFacet(baseSubject: string, facet: CanonicalAtomicClaimFacet): string {
  if (facet === "economic_category") return baseSubject.replace(/^economic_charge_/, "economic_category_");
  return `${facet}_${digest({ baseSubject, facet }).slice(0, 32)}`;
}

function categoryDecisionIndex(decisions: readonly CanonicalRfClaimDecision[]): Map<string, CanonicalRfClaimDecision> {
  const output = new Map<string, CanonicalRfClaimDecision>();
  for (const decision of decisions) {
    if (decision.claimClass !== "economic_category" || decision.canonicalRefs.length !== 1 || !decision.query) continue;
    output.set(decision.canonicalRefs[0]!, decision);
  }
  return output;
}

function groupSeeds(seeds: AtomSeed[], statementPeriod: { start: string; end: string } | null): Map<string, AtomSeed[]> {
  const groups = new Map<string, AtomSeed[]>();
  for (const seed of seeds) {
    const direction = seed.parent.amountUnderReview?.direction ?? "not_monetary";
    const period = canonicalJson(statementPeriod);
    const key = canonicalAtomicClaimGroupingKey({ claimClass: seed.parent.claimClass, facet: seed.facet,
      opaqueSubjectCode: seed.opaqueSubjectCode, scopeFingerprint: seed.scopeFingerprint, period, direction });
    const values = groups.get(key) ?? [];
    values.push(seed);
    groups.set(key, values);
  }
  return groups;
}

function admissionForGroup(input: {
  group: AtomSeed[];
  allSeeds: AtomSeed[];
  authoritativeCost: number | null;
  period: { start: string; end: string } | null;
  rfAvailability: "available" | "unavailable";
}): CanonicalRgClaimAdmission {
  const first = input.group[0]!;
  const parentClaimIds = unique(input.group.map((seed) => seed.parent.claimId));
  const canonicalRefs = unique(input.group.flatMap((seed) => seed.parent.canonicalRefs));
  const occurrenceRefs = unique(input.group.flatMap((seed) => seed.parent.occurrenceRefs));
  const evidenceRefs = unique(input.group.flatMap((seed) => seed.parent.evidenceRefs));
  const direction = first.parent.amountUnderReview?.direction ?? "not_monetary";
  const amountMinor = groupMagnitude(input.group);
  const magnitude = evaluateEconomicMateriality({ amountMinor, authoritativeStatementCostMinor: input.authoritativeCost });
  const decision = decisionTier(first, input.allSeeds);
  const materiality = combineMaterialityAxes(magnitude.tier, decision.tier);
  const research = researchRoute(first, materiality, input.rfAvailability);
  const atomicClaimId = `atomic-claim-${digest({ claimClass: first.parent.claimClass, facet: first.facet,
    opaqueSubjectCode: first.opaqueSubjectCode, scopeFingerprint: first.scopeFingerprint,
    period: input.period, direction })}`;
  return {
    atomicClaimId,
    parentClaimIds,
    claimClass: first.parent.claimClass,
    facet: first.facet,
    opaqueSubjectCode: first.opaqueSubjectCode,
    scopeFingerprint: first.scopeFingerprint,
    statementPeriod: input.period,
    direction,
    canonicalRefs,
    occurrenceRefs,
    evidenceRefs,
    magnitude,
    decisionTier: decision.tier,
    decisionReasonCodes: decision.reasonCodes,
    decisionBasis: decision.basis,
    materiality,
    researchAdmission: research.admission,
    knowledgeQuery: research.query,
    expectedKnowledgeValueConstraint: expectedKnowledgeValueConstraint(first.facet, research.query),
    requiredSourceAuthorities: research.authorities,
    evidenceObjective: evidenceObjective(first.facet),
    expectedDecisionEffects: unique(input.group.flatMap((seed) => seed.parent.possibleDecisionEffects)),
    limitations: unique(input.group.flatMap((seed) => seed.parent.limitations)),
  };
}

function groupMagnitude(group: AtomSeed[]): number | null {
  if (group.some((seed) => seed.parent.amountUnderReview === null)) return null;
  return aggregateAtomicClaimMagnitude(group.map((seed) => ({
    canonicalSubjectRefs: seed.parent.canonicalRefs,
    amountMinor: seed.parent.amountUnderReview!.amountMinor,
  })));
}

export function canonicalAtomicClaimGroupingKey(input: {
  claimClass: CanonicalUnresolvedClaimClass;
  facet: CanonicalAtomicClaimFacet;
  opaqueSubjectCode: string;
  scopeFingerprint: string;
  period: string;
  direction: "debit" | "credit" | "not_monetary";
}): string {
  return canonicalJson(input);
}

export function aggregateAtomicClaimMagnitude(entries: readonly {
  canonicalSubjectRefs: readonly string[];
  amountMinor: number;
}[]): number {
  const amountByCanonicalSubject = new Map<string, number>();
  for (const entry of entries) {
    for (const ref of entry.canonicalSubjectRefs) {
      const prior = amountByCanonicalSubject.get(ref);
      if (prior !== undefined && prior !== entry.amountMinor) throw new Error(`rg_canonical_subject_magnitude_conflict:${ref}`);
      amountByCanonicalSubject.set(ref, entry.amountMinor);
    }
  }
  return [...amountByCanonicalSubject.values()].reduce((sum, value) => sum + value, 0);
}

function decisionTier(seed: AtomSeed, allSeeds: AtomSeed[]): {
  tier: DecisionMaterialityTier;
  reasonCodes: string[];
  basis: CanonicalRgClaimAdmission["decisionBasis"];
} {
  const related = allSeeds.filter((candidate) => candidate.parent.canonicalRefs.some((ref) => seed.parent.canonicalRefs.includes(ref)));
  const hasClass = (claimClass: CanonicalUnresolvedClaimClass) => related.some((item) => item.parent.claimClass === claimClass);
  const basis = (blocking: CanonicalUnresolvedClaimClass[] = [], decisive = false) => ({
    presentlyReachableEffects: decisive ? [...seed.parent.possibleDecisionEffects] : [],
    independentBlockingClaimClasses: unique(blocking),
    admissibleOutcomeCodes: decisive ? ["facet_answer_changes_interpretation_or_permission", "alternate_admissible_answer_withholds_or_changes_it"] : [],
  });
  if (["pricing_underlying_cost", "pricing_schedule", "pricing_scope", "fee_detail_coverage"].includes(seed.parent.claimClass)) {
    return { tier: "D2", reasonCodes: ["atomic_claim_can_change_its_presently_reachable_interpretation"], basis: basis([], true) };
  }
  if (seed.parent.claimClass === "economic_category") {
    return hasClass("economic_ownership")
      ? { tier: "D1", reasonCodes: ["ownership_is_an_independent_permission_prerequisite"], basis: basis(["economic_ownership"]) }
      : { tier: "D2", reasonCodes: ["category_is_the_remaining_reachable_interpretation_prerequisite"], basis: basis([], true) };
  }
  if (seed.parent.claimClass === "economic_ownership") {
    return hasClass("economic_category")
      ? { tier: "D1", reasonCodes: ["category_is_an_independent_permission_prerequisite"], basis: basis(["economic_category"]) }
      : { tier: "D2", reasonCodes: ["ownership_facet_can_change_reachable_interpretation"], basis: basis([], true) };
  }
  if (seed.parent.claimClass === "economic_control") {
    return hasClass("economic_category") || hasClass("economic_ownership")
      ? { tier: "D1", reasonCodes: ["control_improves_understanding_but_upstream_semantics_block_permission"],
        basis: basis([...(hasClass("economic_category") ? ["economic_category" as const] : []),
          ...(hasClass("economic_ownership") ? ["economic_ownership" as const] : [])]) }
      : { tier: "D2", reasonCodes: ["control_facet_can_change_reachable_merchant_permission"], basis: basis([], true) };
  }
  if (seed.facet === "merchant_lever" && (hasClass("economic_category") || hasClass("economic_ownership") || hasClass("economic_control"))) {
    return { tier: "D0", reasonCodes: ["upstream_semantics_prevent_a_presently_reachable_lever_permission"],
      basis: basis((["economic_category", "economic_ownership", "economic_control"] as CanonicalUnresolvedClaimClass[]).filter(hasClass)) };
  }
  return hasClass("economic_category") || hasClass("economic_ownership") || hasClass("economic_control")
    ? { tier: "D1", reasonCodes: ["claim_improves_understanding_but_independent_prerequisites_block_permission"],
      basis: basis((["economic_category", "economic_ownership", "economic_control"] as CanonicalUnresolvedClaimClass[]).filter(hasClass)) }
    : { tier: "D2", reasonCodes: ["actionability_facet_can_change_reachable_merchant_permission"], basis: basis([], true) };
}

function researchRoute(seed: AtomSeed, materiality: CanonicalClaimMateriality, rfAvailability: "available" | "unavailable") {
  const query = seed.knowledgeQuery;
  if (rfAvailability === "unavailable") return route("withheld_rf_catalog_unavailable", null, []);
  if (materiality === "contextual") return route("contextual_opportunistic_only", query, authoritiesFor(query?.claimType));
  if (materiality === "immaterial") return route("immaterial_no_research", query, authoritiesFor(query?.claimType));
  if (materiality === "unresolved") return route("unresolved_materiality", query, authoritiesFor(query?.claimType));
  if (!query) {
    const privateEvidence = ["pricing_underlying_cost", "pricing_schedule", "pricing_scope", "fee_detail_coverage", "merchant_actionability"]
      .includes(seed.parent.claimClass);
    return route(privateEvidence ? "withheld_non_public_evidence_required" : "withheld_no_authorized_research_mapping", null, []);
  }
  const authorities = authoritiesFor(query.claimType);
  if (authorities.length === 0) return route("withheld_non_public_evidence_required", query, []);
  return route("admitted_to_rg_work_ledger", query, authorities);
}

function route(admission: CanonicalRgClaimAdmission["researchAdmission"], query: KnowledgeQuery | null,
  authorities: KnowledgeSourceAuthority[]) {
  return { admission, query, authorities };
}

function authoritiesFor(claimType: KnowledgeClaimType | undefined): KnowledgeSourceAuthority[] {
  if (!claimType) return [];
  const allowed = KNOWLEDGE_CLAIM_POLICIES[claimType].allowedSourceAuthorities;
  return unique(allowed.filter((authority) => authority === "official_network_publication" || authority === "processor_publication"));
}

function evidenceObjective(facet: CanonicalAtomicClaimFacet): string {
  return `Resolve only the ${facet} facet for the exact opaque subject, scope, and statement period without changing canonical financial truth or adjacent claims.`;
}

function expectedKnowledgeValueConstraint(
  facet: CanonicalAtomicClaimFacet,
  query: KnowledgeQuery | null,
): CanonicalRgClaimAdmission["expectedKnowledgeValueConstraint"] {
  if (!query) return null;
  if (facet === "economic_category") return { kind: "mapping", sourceCode: query.subjectCode };
  if (["economic_beneficiary", "economic_owner", "collector", "billing_intermediary", "rule_setter", "price_setter",
    "negotiator_change_authority", "contractual_controller", "constraint"].includes(facet)) {
    return { kind: "role", controlDimension: facet as Extract<CanonicalAtomicClaimFacet,
      "economic_beneficiary" | "economic_owner" | "collector" | "billing_intermediary" | "rule_setter" | "price_setter"
      | "negotiator_change_authority" | "contractual_controller" | "constraint"> };
  }
  if (facet === "merchant_lever") return { kind: "boolean" };
  return null;
}

function workItem(admission: CanonicalRgClaimAdmission): CanonicalRgWorkItem {
  return {
    workItemId: `rg-work-${digest({ atomicClaimId: admission.atomicClaimId, query: admission.knowledgeQuery,
      objective: admission.evidenceObjective })}`,
    atomicClaimId: admission.atomicClaimId,
    state: "planned",
    executionState: "planned_provider_execution_disabled",
    requestedOperation: "claim_scoped_public_research",
    materialityContractVersion: MATERIALITY_CONTRACT_V1.version,
    evidenceObjective: admission.evidenceObjective,
    expectedDecisionEffects: admission.expectedDecisionEffects,
    knowledgeQuery: admission.knowledgeQuery!,
    expectedKnowledgeValueConstraint: admission.expectedKnowledgeValueConstraint!,
    requiredSourceAuthorities: admission.requiredSourceAuthorities,
    reservation: null,
    progress: { state: "not_started", operationsAttempted: 0, evidenceItemsObserved: 0 },
    extensionDecisions: [],
    retryDecisions: [],
    resourceConsumption: { providerCalls: 0, searchCalls: 0, retrievalBytes: 0, aiCalls: 0, tokens: null },
    stopReason: null,
  };
}

function validateAdmissions(admissions: CanonicalRgClaimAdmission[], workItems: CanonicalRgWorkItem[], errors: string[]) {
  if (new Set(admissions.map((item) => item.atomicClaimId)).size !== admissions.length) errors.push("rg_duplicate_atomic_claim_id");
  if (new Set(workItems.map((item) => item.workItemId)).size !== workItems.length) errors.push("rg_duplicate_work_item_id");
  const admissionIds = new Set(admissions.map((item) => item.atomicClaimId));
  for (const admission of admissions) {
    if (admission.decisionTier === "D2" && (admission.decisionBasis.presentlyReachableEffects.length === 0
      || admission.decisionBasis.admissibleOutcomeCodes.length < 2)) {
      errors.push(`rg_d2_missing_reachable_decision_basis:${admission.atomicClaimId}`);
    }
    if (admission.decisionTier === "D1" && admission.decisionBasis.independentBlockingClaimClasses.length === 0) {
      errors.push(`rg_d1_missing_independent_blocker:${admission.atomicClaimId}`);
    }
    if (admission.decisionTier === "D0" && admission.decisionBasis.presentlyReachableEffects.length > 0) {
      errors.push(`rg_d0_has_reachable_decision_effect:${admission.atomicClaimId}`);
    }
    if (admission.researchAdmission === "contextual_opportunistic_only" && admission.materiality !== "contextual") {
      errors.push(`rg_contextual_admission_materiality_mismatch:${admission.atomicClaimId}`);
    }
  }
  for (const item of workItems) {
    if (!admissionIds.has(item.atomicClaimId)) errors.push(`rg_work_item_missing_claim:${item.workItemId}`);
    const admission = admissions.find((candidate) => candidate.atomicClaimId === item.atomicClaimId);
    if (admission?.materiality !== "material") errors.push(`rg_nonmaterial_independent_work:${item.workItemId}`);
    if (!admission?.expectedKnowledgeValueConstraint) errors.push(`rg_work_item_missing_value_constraint:${item.workItemId}`);
    if (item.reservation !== null || item.resourceConsumption.providerCalls !== 0 || item.resourceConsumption.searchCalls !== 0
      || item.resourceConsumption.retrievalBytes !== 0 || item.resourceConsumption.aiCalls !== 0) {
      errors.push(`rg_disabled_execution_has_resource_activity:${item.workItemId}`);
    }
  }
}

function authoritativeStatementCost(economic: CanonicalEconomicsV2EconomicAnalysis | null): number | null {
  if (!economic || economic.validation.status !== "valid") return null;
  const stack = economic.economicLayer.costStack;
  const total = stack.authoritativeStatementFeeTotal;
  if (!total || total.currency !== "USD" || !Number.isSafeInteger(total.amountMinor) || total.amountMinor <= 0) return null;
  if (!stack.totalStatementProcessingCost || stack.totalStatementProcessingCost.amountMinor !== total.amountMinor
      || stack.reconciliationDeltaMinor === null || Math.abs(stack.reconciliationDeltaMinor) > 1) return null;
  return Math.abs(total.amountMinor);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 32);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}
