import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type {
  CanonicalEconomicControlDimension,
  CanonicalEconomicsV2EconomicAnalysis,
} from "../economicTypes.js";
import type { CanonicalEconomicsV2SynthesisAnalysis } from "../synthesisTypes.js";
import { CONTRACT_V1_1_SAFE_ACTION_CODES, CONTRACT_V1_SAFE_ACTION_CODES,
  type KnowledgeClaimType, type KnowledgeQuery, type KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import type { CanonicalSynthesisAdmissionContractId } from "../synthesisContractV1Types.js";
import type { PublicRetrievalTransportDiagnosticsV1 } from "../intelligence/intelligenceTypes.js";
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
import {
  atomicClaimIdForSeed,
  canonicalAtomicClaimGroupingKey,
  compileCanonicalAtomicClaimSeeds,
  type CanonicalAtomicClaimSeed,
  type CanonicalAtomicClaimFacet,
  type CanonicalRgExpectedKnowledgeValueConstraint,
} from "./atomicClaims.js";

export const RG_WORK_LEDGER_SCHEMA_VERSION = "canonical_rg_work_ledger_v2" as const;

export type { CanonicalAtomicClaimFacet } from "./atomicClaims.js";

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
    atomicFacet: CanonicalAtomicClaimFacet;
    presentlyReachableEffects: CanonicalUnresolvedClaim["possibleDecisionEffects"];
    independentBlockingFacets: CanonicalAtomicClaimFacet[];
    independentBlockingPrerequisiteCodes: string[];
    admissibleOutcomes: Array<{
      outcomeClass: string;
      resultingEffect: CanonicalUnresolvedClaim["possibleDecisionEffects"][number];
      merchantFacingStateCode: string;
    }>;
  };
  materiality: CanonicalClaimMateriality;
  researchAdmission:
    | "admitted_to_rg_work_ledger"
    | "contextual_opportunistic_only"
    | "immaterial_no_research"
    | "unresolved_materiality"
    | "withheld_rf_catalog_unavailable"
    | "withheld_no_authorized_research_mapping"
    | "withheld_non_public_evidence_required"
    | "withheld_merchant_document_evidence_required"
    | "withheld_additional_statement_history_required"
    | "withheld_evidence_route_unresolved";
  knowledgeQuery: KnowledgeQuery | null;
  expectedKnowledgeValueConstraint: CanonicalRgExpectedKnowledgeValueConstraint | null;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  evidenceObjective: string;
  expectedDecisionEffects: CanonicalUnresolvedClaim["possibleDecisionEffects"];
  limitations: string[];
};

export type CanonicalRgWorkItem = {
  workItemId: string;
  atomicClaimId: string;
  state: "planned" | "executing" | "terminal";
  executionState:
    | "planned_for_durable_execution"
    | "executing"
    | "completed_verified_evidence"
    | "completed_unresolved"
    | "degraded_provider_unavailable"
    | "degraded_emergency_circuit_breaker"
    | "indeterminate_after_send";
  requestedOperation: "claim_scoped_public_research";
  materialityContractVersion: typeof MATERIALITY_CONTRACT_V1.version;
  evidenceObjective: string;
  expectedDecisionEffects: CanonicalUnresolvedClaim["possibleDecisionEffects"];
  knowledgeQuery: KnowledgeQuery;
  expectedKnowledgeValueConstraint: NonNullable<CanonicalRgClaimAdmission["expectedKnowledgeValueConstraint"]>;
  requiredSourceAuthorities: KnowledgeSourceAuthority[];
  continuationContract: null | {
    kind: "period_refinement" | "locator_subsection_refinement" | "scope_refinement";
    requiredGap:
      | "correct_authority_wrong_period"
      | "official_document_insufficient_locator_or_subsection"
      | "refinable_scope_mismatch";
    priorWorkContractFingerprint: string;
    excludedDocumentFingerprints: string[];
  };
  executionAuthorization: null | {
    grantId: string;
    executionGeneration: number;
    controllerRevision: number;
    decisionId: string;
    effectiveWorkContractFingerprint: string;
  };
  reservation: null | { reservationId: string; workerId: string; reservedAt: string; expiresAt: string };
  progress: { state: "not_started" | "in_progress" | "verified_evidence" | "unresolved" | "degraded";
    operationsAttempted: number; evidenceItemsObserved: number };
  extensionDecisions: Array<{ decisionId: string; decision: "extended" | "stopped"; reasonCode: string; createdAt: string }>;
  retryDecisions: Array<{ decisionId: string; operationId: string; decision: "retry" | "no_retry"; reasonCode: string; createdAt: string }>;
  resourceConsumption: { providerCalls: number; searchCalls: number; retrievalBytes: number; aiCalls: number; tokens: number | null };
  stopReason: null | string;
  verifiedEvidenceRefs: string[];
};

export type CanonicalRgOperation = {
  operationId: string;
  workItemId: string;
  atomicClaimId: string;
  planHash: string;
  executionGrantId: string | null;
  executionGeneration: number;
  kind: "public_search" | "public_retrieval" | "investigation" | "independent_verification";
  attempt: number;
  candidateId: string | null;
  state: "reserved" | "sent" | "completed" | "failed_before_send" | "provider_rejected" | "indeterminate_after_send";
  reservation: { reservationId: string; workerId: string; reservedAt: string; expiresAt: string };
  receipt: {
    sendState: "not_sent" | "sent";
    completionState: "reserved" | "completed" | "failed" | "provider_rejected" | "indeterminate";
    providerCode: string;
    providerRequestId: string | null;
    calls: number;
    tokens: number | null;
    retrievalBytes: number;
    reasonCode: string;
    providerDiagnostics?: CanonicalRgProviderDiagnostics | null;
    retrievalTransportDiagnostics?: PublicRetrievalTransportDiagnosticsV1 | null;
  };
  input: unknown;
  inputHash: string;
  result: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalRgProviderDiagnostics = {
  schemaVersion: "canonical_rg_provider_diagnostics_v1";
  responseDisposition: "completed" | "known_provider_rejection" | "indeterminate_after_send";
  httpStatus: number | null;
  localRequestId: string | null;
  providerRequestId: string | null;
  providerResponseId: string | null;
  requestedModelIdentifier: string | null;
  returnedModelIdentifier: string | null;
  providerErrorType: string | null;
  providerErrorCode: string | null;
  providerErrorParam: string | null;
  usageState: "known" | "unknown_possible_billable";
  outputTokens: number | null;
  providerRequestCount: number | null;
  usageCostUsd: number | null;
};

export type CanonicalRgWorkLedger = {
  schemaVersion: typeof RG_WORK_LEDGER_SCHEMA_VERSION;
  authority: "claim_admission_and_planning_only";
  materialityContract: typeof MATERIALITY_CONTRACT_V1;
  providerExecution: "durable_claim_bound_executor_after_planning";
  searchExecution: "typed_privacy_safe_search_intent_only";
  retrievalExecution: "independent_https_retrieval_required";
  aiExecution: "separate_investigation_and_verification_only";
  automaticKnowledgePromotion: "prohibited";
  contextualResearchDefault: "opportunistic_only_no_independent_initiation";
  businessContextAuthority: "excluded_from_canonical_materiality";
  benchmarkAuthority: "excluded_from_canonical_materiality";
  synthesisContractId: CanonicalSynthesisAdmissionContractId;
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

export type CanonicalAtomicDecisionEvaluation = {
  tier: DecisionMaterialityTier;
  reasonCodes: string[];
  basis: CanonicalRgClaimAdmission["decisionBasis"];
};

export function buildCanonicalRgWorkLedger(input: {
  inventory: CanonicalUnresolvedClaimInventory;
  economic: CanonicalEconomicsV2EconomicAnalysis | null;
  synthesis: CanonicalEconomicsV2SynthesisAnalysis | null;
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
  const seeds = input.inventory.claims.flatMap((claim) => compileCanonicalAtomicClaimSeeds({
    claim,
    categoryQuery: claim.canonicalRefs.map((ref) => categoryDecisionByCharge.get(ref)?.query ?? null).find(Boolean) ?? null,
  }));
  const groups = groupSeeds(seeds, period);
  const synthesisContractId = input.synthesis?.synthesisLayer.contractV1?.contractId
    ?? "canonical_synthesis_admission_contract_v1";
  const admissions = [...groups.values()].map((group) => admissionForGroup({
    group, authoritativeCost, period, rfAvailability, economic: input.economic, synthesis: input.synthesis,
    synthesisContractId,
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
  const planHash = digest({ materialityContract: MATERIALITY_CONTRACT_V1.version, synthesisContractId, rfAvailability,
    rfSnapshotHash: input.rfResolution?.snapshot.snapshotHash ?? "", authoritativeCost, admissions, workItems });
  return {
    schemaVersion: RG_WORK_LEDGER_SCHEMA_VERSION,
    authority: "claim_admission_and_planning_only",
    materialityContract: MATERIALITY_CONTRACT_V1,
    providerExecution: "durable_claim_bound_executor_after_planning",
    searchExecution: "typed_privacy_safe_search_intent_only",
    retrievalExecution: "independent_https_retrieval_required",
    aiExecution: "separate_investigation_and_verification_only",
    automaticKnowledgePromotion: "prohibited",
    contextualResearchDefault: "opportunistic_only_no_independent_initiation",
    businessContextAuthority: "excluded_from_canonical_materiality",
    benchmarkAuthority: "excluded_from_canonical_materiality",
    synthesisContractId,
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

function categoryDecisionIndex(decisions: readonly CanonicalRfClaimDecision[]): Map<string, CanonicalRfClaimDecision> {
  const output = new Map<string, CanonicalRfClaimDecision>();
  for (const decision of decisions) {
    if (decision.claimClass !== "economic_category" || decision.canonicalRefs.length !== 1 || !decision.query) continue;
    output.set(decision.canonicalRefs[0]!, decision);
  }
  return output;
}

function groupSeeds(seeds: CanonicalAtomicClaimSeed[], statementPeriod: { start: string; end: string } | null): Map<string, CanonicalAtomicClaimSeed[]> {
  const groups = new Map<string, CanonicalAtomicClaimSeed[]>();
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
  group: CanonicalAtomicClaimSeed[];
  authoritativeCost: number | null;
  period: { start: string; end: string } | null;
  rfAvailability: "available" | "unavailable";
  economic: CanonicalEconomicsV2EconomicAnalysis | null;
  synthesis: CanonicalEconomicsV2SynthesisAnalysis | null;
  synthesisContractId: CanonicalSynthesisAdmissionContractId;
}): CanonicalRgClaimAdmission {
  const first = input.group[0]!;
  const parentClaimIds = unique(input.group.map((seed) => seed.parent.claimId));
  const canonicalRefs = unique(input.group.flatMap((seed) => seed.parent.canonicalRefs));
  const occurrenceRefs = unique(input.group.flatMap((seed) => seed.parent.occurrenceRefs));
  const evidenceRefs = unique(input.group.flatMap((seed) => seed.parent.evidenceRefs));
  const direction = first.parent.amountUnderReview?.direction ?? "not_monetary";
  const amountMinor = groupMagnitude(input.group);
  const magnitude = evaluateEconomicMateriality({ amountMinor, authoritativeStatementCostMinor: input.authoritativeCost });
  const decision = decisionTier(first, input.economic, input.synthesis);
  const materiality = combineMaterialityAxes(magnitude.tier, decision.tier);
  const research = researchRoute(first, materiality, input.rfAvailability, input.synthesisContractId);
  const atomicClaimId = atomicClaimIdForSeed(first, input.period);
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
    expectedKnowledgeValueConstraint: expectedKnowledgeValueConstraint(first.facet, research.query, first,
      input.synthesisContractId),
    requiredSourceAuthorities: research.authorities,
    evidenceObjective: evidenceObjective(first.facet),
    expectedDecisionEffects: unique(input.group.flatMap((seed) => seed.parent.possibleDecisionEffects)),
    limitations: unique(input.group.flatMap((seed) => seed.parent.limitations)),
  };
}

function groupMagnitude(group: CanonicalAtomicClaimSeed[]): number | null {
  if (group.some((seed) => seed.parent.amountUnderReview === null)) return null;
  return aggregateAtomicClaimMagnitude(group.map((seed) => ({
    canonicalSubjectRefs: seed.parent.canonicalRefs,
    amountMinor: seed.parent.amountUnderReview!.amountMinor,
  })));
}

export { canonicalAtomicClaimGroupingKey } from "./atomicClaims.js";
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

function decisionTier(
  seed: CanonicalAtomicClaimSeed,
  economic: CanonicalEconomicsV2EconomicAnalysis | null,
  synthesis: CanonicalEconomicsV2SynthesisAnalysis | null,
): CanonicalAtomicDecisionEvaluation {
  if (seed.prerequisite) {
    const effect = seed.parent.possibleDecisionEffects.includes("merchant_lever")
      ? "merchant_lever" as const : seed.parent.possibleDecisionEffects[0]!;
    if (seed.prerequisite.decisionTier === "D2") return permissionDecision(seed.facet, effect,
      `contract_prerequisite:${seed.prerequisite.sourceAtomicClaimId}:${seed.prerequisite.safeActionCode}`, [
        { outcomeClass: `${seed.prerequisite.kind}_proven_for_exact_action`,
          merchantFacingStateCode: `${seed.prerequisite.safeActionCode}_permission_reachable` },
        { outcomeClass: `${seed.prerequisite.kind}_not_proven_or_not_applicable_for_exact_action`,
          merchantFacingStateCode: `${seed.prerequisite.safeActionCode}_permission_withheld` },
      ]);
    return { tier: "D1", reasonCodes: ["exact_prerequisite_interpretation_relevant_but_other_independent_blockers_remain"],
      basis: { ...emptyDecisionBasis(seed.facet),
        independentBlockingPrerequisiteCodes: seed.prerequisite.independentBlockingPrerequisiteCodes } };
  }
  const direct = directFacetDecision(seed.facet);
  if (direct) return direct;

  const leverRoute = exactLeverDecision(seed, economic, synthesis);
  if (leverRoute) return leverRoute;

  const basis = emptyDecisionBasis(seed.facet);
  if (seed.facet === "merchant_lever") {
    return { tier: "D0", reasonCodes: ["no_presently_reachable_exact_charge_scoped_lever_delta"], basis };
  }
  return {
    tier: "D1",
    reasonCodes: ["facet_improves_understanding_but_no_exact_charge_scoped_permission_route_is_reachable"],
    basis: {
      ...basis,
      independentBlockingPrerequisiteCodes: ["no_reachable_re_synthesis_route_for_exact_facet"],
    },
  };
}

function directFacetDecision(facet: CanonicalAtomicClaimFacet): CanonicalAtomicDecisionEvaluation | null {
  const decisive = (
    effect: CanonicalUnresolvedClaim["possibleDecisionEffects"][number],
    outcomes: Array<{ outcomeClass: string; merchantFacingStateCode: string }>,
  ): CanonicalAtomicDecisionEvaluation => ({
    tier: "D2",
    reasonCodes: ["exact_atomic_facet_has_presently_reachable_materially_different_interpretations"],
    basis: {
      atomicFacet: facet,
      presentlyReachableEffects: [effect],
      independentBlockingFacets: [],
      independentBlockingPrerequisiteCodes: [],
      admissibleOutcomes: outcomes.map((outcome) => ({ ...outcome, resultingEffect: effect })),
    },
  });
  switch (facet) {
    case "underlying_cost_billing_mode":
      return decisive("pricing_interpretation", [
        { outcomeClass: "underlying_cost_separately_billed", merchantFacingStateCode: "pricing_underlying_cost_separate" },
        { outcomeClass: "underlying_cost_included_or_mixed", merchantFacingStateCode: "pricing_underlying_cost_included_or_scoped" },
      ]);
    case "merchant_price_schedule_shape":
      return decisive("pricing_interpretation", [
        { outcomeClass: "merchant_schedule_flat_or_bundled", merchantFacingStateCode: "pricing_schedule_bundled" },
        { outcomeClass: "merchant_schedule_differential_or_pass_through", merchantFacingStateCode: "pricing_schedule_differential" },
      ]);
    case "pricing_scope_uniformity":
      return decisive("pricing_interpretation", [
        { outcomeClass: "pricing_uniform_across_scope", merchantFacingStateCode: "pricing_scope_uniform" },
        { outcomeClass: "pricing_varies_by_scope", merchantFacingStateCode: "pricing_scope_mixed" },
      ]);
    case "fee_detail_coverage":
      return decisive("cost_stack_completeness", [
        { outcomeClass: "fee_detail_complete", merchantFacingStateCode: "cost_stack_detail_complete" },
        { outcomeClass: "fee_detail_incomplete", merchantFacingStateCode: "cost_stack_detail_partial" },
      ]);
    default:
      return null;
  }
}

function exactLeverDecision(
  seed: CanonicalAtomicClaimSeed,
  economic: CanonicalEconomicsV2EconomicAnalysis | null,
  synthesis: CanonicalEconomicsV2SynthesisAnalysis | null,
): CanonicalAtomicDecisionEvaluation | null {
  if (!economic || !synthesis || economic.validation.status !== "valid" || synthesis.validation.status !== "valid") return null;
  const chargeRefs = new Set(seed.parent.canonicalRefs);
  const counterfactualById = new Map(synthesis.synthesisLayer.counterfactuals.map((item) => [item.id, item]));
  const roles = economic.economicLayer.roleClaims;
  const relevantLevers = synthesis.synthesisLayer.merchantLevers.filter((lever) =>
    lever.chargeRefs.some((ref) => chargeRefs.has(ref)) &&
    (lever.state === "candidate_requires_verification" || lever.state === "unresolved"));
  const dimension = controlDimension(seed.facet);
  for (const lever of relevantLevers) {
    const counterfactual = lever.counterfactualRef ? counterfactualById.get(lever.counterfactualRef) : null;
    const impactReady = counterfactual?.resultState === "exact_deterministic_delta"
      || counterfactual?.resultState === "bounded_conditional_delta";
    const provenDimensions = new Set(roles.filter((role) => chargeRefs.has(role.chargeRef)
      && role.resolution === "proven" && role.periodApplicability === "applicable").map((role) => role.dimension));
    const otherDimensionsReady = lever.requiredControlDimensions.every((required) => required === dimension
      || provenDimensions.has(required));
    if (dimension && !provenDimensions.has(dimension) && lever.requiredControlDimensions.includes(dimension)
      && impactReady && otherDimensionsReady) {
      return permissionDecision(seed.facet, "merchant_lever", `lever:${lever.id}`, [
        { outcomeClass: `${dimension}_proven_applicable`, merchantFacingStateCode: `lever_${lever.id}_permission_reachable` },
        { outcomeClass: `${dimension}_proven_not_applicable_or_different_authority`, merchantFacingStateCode: `lever_${lever.id}_permission_withheld` },
      ]);
    }
    if (seed.facet === "counterfactual" && !impactReady && allRequiredDimensionsProven(lever.requiredControlDimensions, provenDimensions)) {
      return permissionDecision(seed.facet, "impact_permission", `lever:${lever.id}`, [
        { outcomeClass: "exact_or_bounded_counterfactual", merchantFacingStateCode: `lever_${lever.id}_impact_permission_reachable` },
        { outcomeClass: "verification_only_or_not_derivable_counterfactual", merchantFacingStateCode: `lever_${lever.id}_impact_permission_withheld` },
      ]);
    }
    if (seed.facet === "merchant_lever" && impactReady && allRequiredDimensionsProven(lever.requiredControlDimensions, provenDimensions)) {
      return permissionDecision(seed.facet, "merchant_lever", `lever:${lever.id}`, [
        { outcomeClass: "eligible_supported_merchant_lever", merchantFacingStateCode: `lever_${lever.id}_action_permission_reachable` },
        { outcomeClass: "documentation_monitoring_or_not_available_lever", merchantFacingStateCode: `lever_${lever.id}_action_permission_withheld` },
      ]);
    }
  }
  return null;
}

function permissionDecision(
  facet: CanonicalAtomicClaimFacet,
  effect: CanonicalUnresolvedClaim["possibleDecisionEffects"][number],
  routeCode: string,
  outcomes: Array<{ outcomeClass: string; merchantFacingStateCode: string }>,
): CanonicalAtomicDecisionEvaluation {
  return {
    tier: "D2",
    reasonCodes: ["exact_atomic_facet_is_remaining_prerequisite_for_reachable_permission", routeCode],
    basis: {
      atomicFacet: facet,
      presentlyReachableEffects: [effect],
      independentBlockingFacets: [],
      independentBlockingPrerequisiteCodes: [],
      admissibleOutcomes: outcomes.map((outcome) => ({ ...outcome, resultingEffect: effect })),
    },
  };
}

function emptyDecisionBasis(facet: CanonicalAtomicClaimFacet): CanonicalRgClaimAdmission["decisionBasis"] {
  return {
    atomicFacet: facet,
    presentlyReachableEffects: [],
    independentBlockingFacets: [],
    independentBlockingPrerequisiteCodes: [],
    admissibleOutcomes: [],
  };
}

function controlDimension(facet: CanonicalAtomicClaimFacet): CanonicalEconomicControlDimension | null {
  return ["collector", "billing_intermediary", "economic_beneficiary", "economic_owner", "rule_setter", "price_setter",
    "negotiator_change_authority", "contractual_controller", "constraint"].includes(facet)
    ? facet as CanonicalEconomicControlDimension : null;
}

function allRequiredDimensionsProven(
  required: readonly CanonicalEconomicControlDimension[],
  proven: ReadonlySet<CanonicalEconomicControlDimension>,
): boolean {
  return required.every((dimension) => proven.has(dimension));
}

function researchRoute(seed: CanonicalAtomicClaimSeed, materiality: CanonicalClaimMateriality,
  rfAvailability: "available" | "unavailable", synthesisContractId: CanonicalSynthesisAdmissionContractId) {
  const query = seed.knowledgeQuery;
  if (rfAvailability === "unavailable") return route("withheld_rf_catalog_unavailable", null, []);
  if (materiality === "contextual") return route("contextual_opportunistic_only", query, authoritiesFor(query?.claimType));
  if (materiality === "immaterial") return route("immaterial_no_research", query, authoritiesFor(query?.claimType));
  if (materiality === "unresolved") return route("unresolved_materiality", query, authoritiesFor(query?.claimType));
  if (!seed.prerequisite && synthesisContractId === "canonical_synthesis_admission_contract_v1_1"
    && seed.facet === "counterfactual") {
    return route("withheld_no_authorized_research_mapping", null, []);
  }
  if (seed.prerequisite?.evidenceRoute === "merchant_document") {
    return route("withheld_merchant_document_evidence_required", null, []);
  }
  if (seed.prerequisite?.evidenceRoute === "additional_statement_history") {
    return route("withheld_additional_statement_history_required", null, []);
  }
  if (seed.prerequisite?.evidenceRoute === "route_unresolved") {
    return route("withheld_evidence_route_unresolved", null, []);
  }
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
  seed?: CanonicalAtomicClaimSeed,
  synthesisContractId: CanonicalSynthesisAdmissionContractId = "canonical_synthesis_admission_contract_v1",
): CanonicalRgClaimAdmission["expectedKnowledgeValueConstraint"] {
  if (seed?.prerequisite) return seed.prerequisite.expectedKnowledgeValueConstraint;
  if (!query) return null;
  if (facet === "economic_category") return { kind: "mapping", sourceCode: query.subjectCode };
  if (["economic_beneficiary", "economic_owner", "collector", "billing_intermediary", "rule_setter", "price_setter",
    "negotiator_change_authority", "contractual_controller"].includes(facet)) {
    return { kind: "role", controlDimension: facet as Extract<CanonicalAtomicClaimFacet,
      "economic_beneficiary" | "economic_owner" | "collector" | "billing_intermediary" | "rule_setter" | "price_setter"
      | "negotiator_change_authority" | "contractual_controller"> };
  }
  if (facet === "constraint") return { kind: "synthesis_constraint_identity" };
  if (facet === "economic_driver") return { kind: "synthesis_economic_driver" };
  // Generation-zero RG is a public-document route. It can prove only the verified-schedule
  // recurrence basis; merchant-contract and multi-statement recurrence require their own
  // compatible private/document-history evidence routes and must never be provider-selected here.
  if (facet === "recurrence") return { kind: "synthesis_recurrence", recurrenceBasis: "verified_schedule" };
  if (facet === "counterfactual") return { kind: "synthesis_counterfactual" };
  if (facet === "merchant_lever") return { kind: "synthesis_safe_action",
    allowedSafeActionCodes: [...(synthesisContractId === "canonical_synthesis_admission_contract_v1_1"
      ? CONTRACT_V1_1_SAFE_ACTION_CODES : CONTRACT_V1_SAFE_ACTION_CODES)] };
  return null;
}

function workItem(admission: CanonicalRgClaimAdmission): CanonicalRgWorkItem {
  return {
    workItemId: `rg-work-${digest({ atomicClaimId: admission.atomicClaimId, query: admission.knowledgeQuery,
      objective: admission.evidenceObjective })}`,
    atomicClaimId: admission.atomicClaimId,
    state: "planned",
    executionState: "planned_for_durable_execution",
    requestedOperation: "claim_scoped_public_research",
    materialityContractVersion: MATERIALITY_CONTRACT_V1.version,
    evidenceObjective: admission.evidenceObjective,
    expectedDecisionEffects: admission.expectedDecisionEffects,
    knowledgeQuery: admission.knowledgeQuery!,
    expectedKnowledgeValueConstraint: admission.expectedKnowledgeValueConstraint!,
    requiredSourceAuthorities: admission.requiredSourceAuthorities,
    continuationContract: null,
    executionAuthorization: null,
    reservation: null,
    progress: { state: "not_started", operationsAttempted: 0, evidenceItemsObserved: 0 },
    extensionDecisions: [],
    retryDecisions: [],
    resourceConsumption: { providerCalls: 0, searchCalls: 0, retrievalBytes: 0, aiCalls: 0, tokens: 0 },
    stopReason: null,
    verifiedEvidenceRefs: [],
  };
}

export function canonicalRgWorkContractFingerprint(
  admission: CanonicalRgClaimAdmission,
  work: CanonicalRgWorkItem,
): string {
  return digest({
    atomicClaimId: admission.atomicClaimId,
    claimClass: admission.claimClass,
    facet: admission.facet,
    parentClaimIds: admission.parentClaimIds,
    opaqueSubjectCode: admission.opaqueSubjectCode,
    scopeFingerprint: admission.scopeFingerprint,
    statementPeriod: admission.statementPeriod,
    direction: admission.direction,
    knowledgeQuery: work.knowledgeQuery,
    evidenceObjective: work.evidenceObjective,
    expectedKnowledgeValueConstraint: work.expectedKnowledgeValueConstraint,
    requiredSourceAuthorities: work.requiredSourceAuthorities,
    materiality: admission.materiality,
    decisionTier: admission.decisionTier,
    decisionBasis: admission.decisionBasis,
    expectedDecisionEffects: work.expectedDecisionEffects,
    continuationContract: work.continuationContract ?? null,
  });
}

function validateAdmissions(admissions: CanonicalRgClaimAdmission[], workItems: CanonicalRgWorkItem[], errors: string[]) {
  if (new Set(admissions.map((item) => item.atomicClaimId)).size !== admissions.length) errors.push("rg_duplicate_atomic_claim_id");
  if (new Set(workItems.map((item) => item.workItemId)).size !== workItems.length) errors.push("rg_duplicate_work_item_id");
  const admissionIds = new Set(admissions.map((item) => item.atomicClaimId));
  for (const admission of admissions) {
    errors.push(...validateAtomicDecisionEvaluation({
      facet: admission.facet,
      tier: admission.decisionTier,
      basis: admission.decisionBasis,
    }).map((error) => `${error}:${admission.atomicClaimId}`));
    if (admission.decisionBasis.presentlyReachableEffects.some((effect) =>
      !admission.expectedDecisionEffects.includes(effect))) {
      errors.push(`rg_decision_effect_outside_parent_claim_authority:${admission.atomicClaimId}`);
    }
    if (admission.researchAdmission === "contextual_opportunistic_only" && admission.materiality !== "contextual") {
      errors.push(`rg_contextual_admission_materiality_mismatch:${admission.atomicClaimId}`);
    }
    if (admission.facet === "recurrence" && admission.knowledgeQuery
      && (admission.expectedKnowledgeValueConstraint?.kind !== "synthesis_recurrence"
        || admission.expectedKnowledgeValueConstraint.recurrenceBasis !== "verified_schedule")) {
      errors.push(`rg_recurrence_public_evidence_route_binding_invalid:${admission.atomicClaimId}`);
    }
  }
  for (const item of workItems) {
    if (!admissionIds.has(item.atomicClaimId)) errors.push(`rg_work_item_missing_claim:${item.workItemId}`);
    const admission = admissions.find((candidate) => candidate.atomicClaimId === item.atomicClaimId);
    if (admission?.materiality !== "material") errors.push(`rg_nonmaterial_independent_work:${item.workItemId}`);
    if (!admission?.expectedKnowledgeValueConstraint) errors.push(`rg_work_item_missing_value_constraint:${item.workItemId}`);
    if (admission?.facet === "recurrence" && (item.expectedKnowledgeValueConstraint.kind !== "synthesis_recurrence"
      || item.expectedKnowledgeValueConstraint.recurrenceBasis !== "verified_schedule")) {
      errors.push(`rg_recurrence_work_public_evidence_route_binding_invalid:${item.workItemId}`);
    }
    if (item.reservation !== null || item.resourceConsumption.providerCalls !== 0 || item.resourceConsumption.searchCalls !== 0
      || item.resourceConsumption.retrievalBytes !== 0 || item.resourceConsumption.aiCalls !== 0) {
      errors.push(`rg_disabled_execution_has_resource_activity:${item.workItemId}`);
    }
  }
}

export function validateAtomicDecisionEvaluation(input: {
  facet: CanonicalAtomicClaimFacet;
  tier: DecisionMaterialityTier;
  basis: CanonicalRgClaimAdmission["decisionBasis"];
}): string[] {
  const errors: string[] = [];
  const basis = input.basis;
  if (basis.atomicFacet !== input.facet) errors.push("rg_decision_basis_atomic_facet_mismatch");
  const effects = new Set(basis.presentlyReachableEffects);
  const outcomeClasses = new Set(basis.admissibleOutcomes.map((outcome) => outcome.outcomeClass));
  const states = new Set(basis.admissibleOutcomes.map((outcome) => outcome.merchantFacingStateCode));
  if (basis.admissibleOutcomes.some((outcome) => !effects.has(outcome.resultingEffect))) {
    errors.push("rg_decision_outcome_effect_is_not_presently_reachable");
  }
  if (basis.admissibleOutcomes.some((outcome) => outcome.outcomeClass.includes("facet_answer_changes")
    || outcome.outcomeClass.includes("alternate_admissible_answer"))) {
    errors.push("rg_decision_outcome_uses_generic_placeholder");
  }
  if (input.tier === "D2" && (effects.size === 0 || basis.admissibleOutcomes.length < 2
    || outcomeClasses.size < 2 || states.size < 2)) {
    errors.push("rg_d2_missing_reachable_materially_different_admissible_outcomes");
  }
  if (input.tier === "D1" && basis.independentBlockingFacets.length === 0
    && basis.independentBlockingPrerequisiteCodes.length === 0) {
    errors.push("rg_d1_missing_independent_blocker");
  }
  if (input.tier === "D0" && (effects.size > 0 || basis.admissibleOutcomes.length > 0)) {
    errors.push("rg_d0_has_reachable_decision_effect");
  }
  return unique(errors);
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
