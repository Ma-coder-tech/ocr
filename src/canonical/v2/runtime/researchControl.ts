import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalAtomicClaimFacet } from "./atomicClaims.js";

export const ATOMIC_RESEARCH_CONTROL_POLICY_VERSION =
  "runtime_intelligence_policy_amendment_v0_5_claim_resolution_research_control" as const;

export type CanonicalResearchClaimFamily =
  | "negotiability"
  | "recurrence"
  | "economic_ownership"
  | "control_decision_authority"
  | "economic_category";

export type CanonicalMarginalValueDecisionCode =
  | "CLOSE"
  | "UPGRADE"
  | "NARROW"
  | "CONTEXT_ONLY"
  | "NOTHING";

export type CanonicalPrivateEvidenceRoute =
  | "merchant_agreement_or_addendum"
  | "additional_statement_history"
  | "processor_or_account_explanation"
  | "other_private_evidence";

export type CanonicalEvidenceCeilingCode =
  | "public_category_classification_only"
  | "public_role_or_ownership_definition_only"
  | "public_control_authority_only"
  | "public_negotiability_context_only"
  | "public_recurrence_design_only";

export type CanonicalClaimTerminalDisposition =
  | "resolved_to_public_evidence_ceiling"
  | "unresolved_private_evidence_required"
  | "unresolved_public_support_not_found"
  | "unresolved_conflicting_public_evidence"
  | "withheld_at_evidence_ceiling"
  | "withheld_no_marginal_value"
  | "saturation_reassessment_required"
  | "operationally_degraded_not_semantically_complete";

export type CanonicalPrivateEvidenceBoundary = {
  route: CanonicalPrivateEvidenceRoute;
  affectedAssertionCodes: string[];
  effect: "blocks_only_affected_assertions";
  publicSubstitution: "prohibited";
};

export type CanonicalClaimEvidenceCeiling = {
  code: CanonicalEvidenceCeilingCode;
  publicEvidenceMayEstablish: string[];
  publicEvidenceMustNotEstablish: string[];
  maximumRhReadyEffect:
    | "category_interpretation_reassessment"
    | "ownership_interpretation_reassessment"
    | "control_interpretation_reassessment"
    | "negotiability_question_reassessment"
    | "recurrence_question_reassessment";
};

export type CanonicalClaimResearchControlPlan = {
  policyVersion: typeof ATOMIC_RESEARCH_CONTROL_POLICY_VERSION;
  claimFamily: CanonicalResearchClaimFamily;
  prerequisiteNodes: Array<{
    code: string;
    state: "resolved" | "remaining_public" | "remaining_private";
    evidencePath: "rf" | "public_document" | CanonicalPrivateEvidenceRoute;
  }>;
  resolvedPrerequisiteCodes: string[];
  remainingUnresolvedNodeCodes: string[];
  permittedEvidencePaths: Array<"rf" | "public_document" | CanonicalPrivateEvidenceRoute>;
  evidenceCeiling: CanonicalClaimEvidenceCeiling;
  privateEvidenceBoundaries: CanonicalPrivateEvidenceBoundary[];
  initialMarginalValueDecision: CanonicalMarginalValueDecision;
  planningTerminalDisposition: CanonicalClaimTerminalDisposition | null;
};

export type CanonicalMarginalValueDecision = {
  decisionId: string;
  stage: "initial_pre_search" | "candidate_reassessment" | "continuation_reassessment";
  sequence: number;
  decision: CanonicalMarginalValueDecisionCode;
  externalResearchAuthorized: boolean;
  materialityAdmissionRequired: true;
  searchUniverseHash: string | null;
  reasonCodes: string[];
};

export type CanonicalSearchUniverseState = {
  schemaVersion: "canonical_claim_search_universe_v1";
  formulationFingerprints: string[];
  documentFingerprints: string[];
  applicableAuthorityClasses: string[];
  reusableNegativeApplicabilityKeys: string[];
  assessmentCount: number;
  lastNovelty: {
    formulationCount: number;
    documentCount: number;
    authorityClassCount: number;
    negativeApplicabilityCount: number;
  };
  saturationSignal:
    | "none"
    | "no_material_novelty"
    | "applicable_authority_classes_reassessed"
    | "reusable_negative_applicability"
    | "recovered_by_material_novelty";
  semanticReassessmentRequired: boolean;
  analyticalExhaustionClaimed: false;
  stateHash: string;
};

export type CanonicalResearchControlRuntimeState = {
  plan: CanonicalClaimResearchControlPlan;
  marginalValueDecisions: CanonicalMarginalValueDecision[];
  searchUniverse: CanonicalSearchUniverseState;
  terminalDisposition: CanonicalClaimTerminalDisposition | null;
  telemetry: CanonicalResearchControlTelemetry | null;
};

export type CanonicalRhReadyResearchProjection = {
  authority: "internal_rh_ready_disposition_only";
  customerReportAuthority: "unchanged";
  stateChange:
    | "none"
    | "interpretation_or_evidence_strength_reassessment"
    | "actionability_permission_reassessment"
    | "private_evidence_question_reassessment";
  maximumPermittedEffect: CanonicalClaimEvidenceCeiling["maximumRhReadyEffect"];
  terminalDisposition: CanonicalClaimTerminalDisposition;
};

export type CanonicalResearchControlTelemetry = {
  schemaVersion: "canonical_research_control_telemetry_v1";
  policyVersion: typeof ATOMIC_RESEARCH_CONTROL_POLICY_VERSION;
  atomicClaimId: string;
  claimFamily: CanonicalResearchClaimFamily;
  terminalDisposition: CanonicalClaimTerminalDisposition;
  latestMarginalValueDecision: CanonicalMarginalValueDecisionCode;
  cost: {
    providerCalls: number;
    searchCalls: number;
    aiCalls: number;
    retrievalBytes: number;
    tokens: number | null;
  };
  admittedSupport: {
    verifiedEvidenceCount: number;
    reachedEvidenceCeiling: boolean;
  };
  rhReadyProjection: CanonicalRhReadyResearchProjection;
  privacy: "opaque_ids_enums_and_counts_only";
  budgetSemantics: "operational_circuit_breaker_only";
};

type ResearchAdmission =
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

export function researchClaimFamilyForFacet(facet: CanonicalAtomicClaimFacet): CanonicalResearchClaimFamily {
  if (["economic_beneficiary", "economic_owner"].includes(facet)) return "economic_ownership";
  if (["collector", "billing_intermediary", "rule_setter", "price_setter", "contractual_controller",
    "constraint", "merchant_operational_controllability"].includes(facet)) return "control_decision_authority";
  if (facet === "recurrence") return "recurrence";
  if (["negotiator_change_authority", "merchant_change_right", "merchant_lever", "counterfactual",
    "constraint_action_effect", "constraint_condition", "underlying_cost_billing_mode",
    "merchant_price_schedule_shape", "pricing_scope_uniformity"].includes(facet)) return "negotiability";
  return "economic_category";
}

export function buildCanonicalClaimResearchControlPlan(input: {
  atomicClaimId: string;
  facet: CanonicalAtomicClaimFacet;
  researchAdmission: ResearchAdmission;
  materiality: "material" | "contextual" | "immaterial" | "unresolved";
  decisionTier: "D0" | "D1" | "D2";
  blockingPrerequisiteCodes: string[];
  knowledgeQueryPresent: boolean;
  requiredSourceAuthorities: string[];
}): CanonicalClaimResearchControlPlan {
  const claimFamily = researchClaimFamilyForFacet(input.facet);
  const evidenceCeiling = evidenceCeilingForFamily(claimFamily);
  const privateEvidenceBoundaries = privateBoundariesForFamily(claimFamily);
  const publicPathPermitted = input.knowledgeQueryPresent && input.requiredSourceAuthorities.length > 0;
  const prerequisiteNodes: CanonicalClaimResearchControlPlan["prerequisiteNodes"] = [
    { code: "rf_first_resolution_checked", state: "resolved", evidencePath: "rf" },
    ...unique(input.blockingPrerequisiteCodes).map((code) => ({
      code, state: "remaining_public" as const, evidencePath: "public_document" as const,
    })),
    ...privateEvidenceBoundaries.map((boundary) => ({
      code: `private_boundary_${boundary.route}`,
      state: "remaining_private" as const,
      evidencePath: boundary.route,
    })),
  ];
  const permittedEvidencePaths = uniquePaths([
    "rf",
    ...(publicPathPermitted ? ["public_document" as const] : []),
    ...privateEvidenceBoundaries.map((item) => item.route),
  ]);
  const partial = {
    policyVersion: ATOMIC_RESEARCH_CONTROL_POLICY_VERSION,
    claimFamily,
    prerequisiteNodes,
    resolvedPrerequisiteCodes: prerequisiteNodes.filter((item) => item.state === "resolved").map((item) => item.code),
    remainingUnresolvedNodeCodes: unique([
      `atomic_facet_${input.facet}`,
      ...prerequisiteNodes.filter((item) => item.state !== "resolved").map((item) => item.code),
    ]),
    permittedEvidencePaths,
    evidenceCeiling,
    privateEvidenceBoundaries,
  };
  return {
    ...partial,
    initialMarginalValueDecision: evaluateCanonicalMarginalValue({
      atomicClaimId: input.atomicClaimId,
      stage: "initial_pre_search",
      sequence: 0,
      claimFamily,
      researchAdmission: input.researchAdmission,
      materiality: input.materiality,
      decisionTier: input.decisionTier,
      publicPathPermitted,
      searchUniverse: null,
      claimAlreadyAtCeiling: false,
      candidateOutcome: null,
    }),
    planningTerminalDisposition: planningTerminalDisposition(input.researchAdmission),
  };
}

export function initialCanonicalSearchUniverse(): CanonicalSearchUniverseState {
  return finalizeUniverse({
    schemaVersion: "canonical_claim_search_universe_v1",
    formulationFingerprints: [], documentFingerprints: [], applicableAuthorityClasses: [],
    reusableNegativeApplicabilityKeys: [], assessmentCount: 0,
    lastNovelty: { formulationCount: 0, documentCount: 0, authorityClassCount: 0, negativeApplicabilityCount: 0 },
    saturationSignal: "none", semanticReassessmentRequired: false, analyticalExhaustionClaimed: false,
  });
}

export function observeCanonicalSearchUniverse(
  prior: CanonicalSearchUniverseState,
  observation: {
    formulationFingerprints?: string[];
    documentFingerprints?: string[];
    applicableAuthorityClasses?: string[];
    reusableNegativeApplicabilityKeys?: string[];
    requiredAuthorityClasses?: string[];
  },
): CanonicalSearchUniverseState {
  const formulations = merge(prior.formulationFingerprints, observation.formulationFingerprints ?? []);
  const documents = merge(prior.documentFingerprints, observation.documentFingerprints ?? []);
  const authorities = merge(prior.applicableAuthorityClasses, observation.applicableAuthorityClasses ?? []);
  const negatives = merge(prior.reusableNegativeApplicabilityKeys, observation.reusableNegativeApplicabilityKeys ?? []);
  const novelty = {
    formulationCount: formulations.length - prior.formulationFingerprints.length,
    documentCount: documents.length - prior.documentFingerprints.length,
    authorityClassCount: authorities.length - prior.applicableAuthorityClasses.length,
    negativeApplicabilityCount: negatives.length - prior.reusableNegativeApplicabilityKeys.length,
  };
  const materialNovelty = novelty.formulationCount + novelty.documentCount + novelty.authorityClassCount > 0;
  const required = unique(observation.requiredAuthorityClasses ?? []);
  const allAuthoritiesReassessed = required.length > 0 && required.every((item) => authorities.includes(item));
  let saturationSignal: CanonicalSearchUniverseState["saturationSignal"] = "none";
  if (prior.semanticReassessmentRequired && materialNovelty) saturationSignal = "recovered_by_material_novelty";
  else if (!materialNovelty && novelty.negativeApplicabilityCount === 0 && prior.assessmentCount > 0) {
    saturationSignal = allAuthoritiesReassessed ? "applicable_authority_classes_reassessed" : "no_material_novelty";
  } else if (!materialNovelty && novelty.negativeApplicabilityCount > 0 && prior.assessmentCount > 0) {
    saturationSignal = "reusable_negative_applicability";
  }
  return finalizeUniverse({
    schemaVersion: "canonical_claim_search_universe_v1",
    formulationFingerprints: formulations,
    documentFingerprints: documents,
    applicableAuthorityClasses: authorities,
    reusableNegativeApplicabilityKeys: negatives,
    assessmentCount: prior.assessmentCount + 1,
    lastNovelty: novelty,
    saturationSignal,
    semanticReassessmentRequired: ["no_material_novelty", "applicable_authority_classes_reassessed",
      "reusable_negative_applicability"].includes(saturationSignal),
    analyticalExhaustionClaimed: false,
  });
}

export function evaluateCanonicalMarginalValue(input: {
  atomicClaimId: string;
  stage: CanonicalMarginalValueDecision["stage"];
  sequence: number;
  claimFamily: CanonicalResearchClaimFamily;
  researchAdmission: ResearchAdmission;
  materiality: "material" | "contextual" | "immaterial" | "unresolved";
  decisionTier: "D0" | "D1" | "D2";
  publicPathPermitted: boolean;
  searchUniverse: CanonicalSearchUniverseState | null;
  claimAlreadyAtCeiling: boolean;
  candidateOutcome: "qualification_rejected" | "partial_support" | "wrong_scope_or_period" | "contradicted" | null;
  semanticRefinementAvailable?: boolean;
}): CanonicalMarginalValueDecision {
  let decision: CanonicalMarginalValueDecisionCode;
  let reasonCodes: string[];
  if (input.claimAlreadyAtCeiling) {
    decision = "NOTHING";
    reasonCodes = ["claim_already_resolved_to_permitted_evidence_ceiling"];
  } else if (input.searchUniverse?.semanticReassessmentRequired && !input.semanticRefinementAvailable) {
    decision = "NOTHING";
    reasonCodes = ["search_universe_saturation_requires_semantic_reassessment",
      "saturation_is_not_public_search_exhaustion"];
  } else if (input.researchAdmission === "contextual_opportunistic_only" || input.materiality === "contextual") {
    decision = "CONTEXT_ONLY";
    reasonCodes = ["contextual_value_only_independent_external_research_prohibited"];
  } else if (input.researchAdmission !== "admitted_to_rg_work_ledger" || input.materiality !== "material"
    || !input.publicPathPermitted) {
    decision = "NOTHING";
    reasonCodes = ["existing_materiality_or_admission_gate_withholds_external_research"];
  } else if (input.candidateOutcome === "contradicted" || input.candidateOutcome === "wrong_scope_or_period") {
    decision = "NARROW";
    reasonCodes = ["materially_distinct_scope_period_or_applicability_formulation_required"];
  } else if (input.candidateOutcome === "qualification_rejected" || input.claimFamily === "economic_ownership"
    || input.claimFamily === "control_decision_authority") {
    decision = "UPGRADE";
    reasonCodes = ["higher_or_applicable_authority_can_improve_admitted_support_within_ceiling"];
  } else if (input.candidateOutcome === "partial_support" || input.claimFamily === "recurrence"
    || input.claimFamily === "negotiability" || input.decisionTier === "D1") {
    decision = "NARROW";
    reasonCodes = ["narrower_claim_formulation_can_change_exact_claim_disposition_within_ceiling"];
  } else {
    decision = "CLOSE";
    reasonCodes = ["qualified_exact_claim_support_can_close_claim_to_public_evidence_ceiling"];
  }
  const externalResearchAuthorized = ["CLOSE", "UPGRADE", "NARROW"].includes(decision)
    && input.researchAdmission === "admitted_to_rg_work_ledger" && input.materiality === "material"
    && input.publicPathPermitted;
  const logical = {
    policyVersion: ATOMIC_RESEARCH_CONTROL_POLICY_VERSION,
    atomicClaimId: input.atomicClaimId,
    stage: input.stage,
    sequence: input.sequence,
    decision,
    externalResearchAuthorized,
    materialityAdmissionRequired: true as const,
    searchUniverseHash: input.searchUniverse?.stateHash ?? null,
    reasonCodes: unique(reasonCodes),
  };
  return { decisionId: `marginal-${digest(logical).slice(0, 32)}`, ...logical };
}

export function canonicalTerminalDisposition(input: {
  executionState: "completed_verified_evidence" | "completed_unresolved" | "degraded_provider_unavailable"
    | "degraded_emergency_circuit_breaker" | "indeterminate_after_send";
  stopReason: string;
  latestDecision: CanonicalMarginalValueDecisionCode;
  searchUniverse: CanonicalSearchUniverseState;
  privateEvidenceRequired: boolean;
}): CanonicalClaimTerminalDisposition {
  if (input.executionState === "completed_verified_evidence") return "resolved_to_public_evidence_ceiling";
  if (["degraded_provider_unavailable", "degraded_emergency_circuit_breaker", "indeterminate_after_send"]
    .includes(input.executionState)) return "operationally_degraded_not_semantically_complete";
  if (input.searchUniverse.semanticReassessmentRequired) return "saturation_reassessment_required";
  if (input.privateEvidenceRequired) return "unresolved_private_evidence_required";
  if (input.stopReason.includes("conflict") || input.stopReason.includes("contradict")) {
    return "unresolved_conflicting_public_evidence";
  }
  if (input.latestDecision === "NOTHING") return "withheld_no_marginal_value";
  if (input.latestDecision === "CONTEXT_ONLY") return "withheld_at_evidence_ceiling";
  return "unresolved_public_support_not_found";
}

export function buildCanonicalResearchTelemetry(input: {
  atomicClaimId: string;
  control: CanonicalResearchControlRuntimeState;
  expectedDecisionEffects: string[];
  resource: { providerCalls: number; searchCalls: number; aiCalls: number; retrievalBytes: number; tokens: number | null };
  verifiedEvidenceCount: number;
}): CanonicalResearchControlTelemetry {
  if (!input.control.terminalDisposition) throw new Error("research_control_terminal_disposition_required");
  const latestDecision = input.control.marginalValueDecisions.at(-1)?.decision
    ?? input.control.plan.initialMarginalValueDecision.decision;
  const reachedEvidenceCeiling = input.control.terminalDisposition === "resolved_to_public_evidence_ceiling";
  const stateChange: CanonicalRhReadyResearchProjection["stateChange"] = reachedEvidenceCeiling
    ? input.expectedDecisionEffects.some((item) => ["merchant_lever", "recommendation_permission", "impact_permission"].includes(item))
      ? "actionability_permission_reassessment" : "interpretation_or_evidence_strength_reassessment"
    : input.control.terminalDisposition === "unresolved_private_evidence_required"
      ? "private_evidence_question_reassessment" : "none";
  return {
    schemaVersion: "canonical_research_control_telemetry_v1",
    policyVersion: ATOMIC_RESEARCH_CONTROL_POLICY_VERSION,
    atomicClaimId: input.atomicClaimId,
    claimFamily: input.control.plan.claimFamily,
    terminalDisposition: input.control.terminalDisposition,
    latestMarginalValueDecision: latestDecision,
    cost: { ...input.resource },
    admittedSupport: { verifiedEvidenceCount: input.verifiedEvidenceCount, reachedEvidenceCeiling },
    rhReadyProjection: {
      authority: "internal_rh_ready_disposition_only",
      customerReportAuthority: "unchanged",
      stateChange,
      maximumPermittedEffect: input.control.plan.evidenceCeiling.maximumRhReadyEffect,
      terminalDisposition: input.control.terminalDisposition,
    },
    privacy: "opaque_ids_enums_and_counts_only",
    budgetSemantics: "operational_circuit_breaker_only",
  };
}

export function validateCanonicalResearchControlPlan(plan: CanonicalClaimResearchControlPlan): string[] {
  const errors: string[] = [];
  if (plan.policyVersion !== ATOMIC_RESEARCH_CONTROL_POLICY_VERSION) errors.push("research_control_policy_version_invalid");
  if (!plan.resolvedPrerequisiteCodes.includes("rf_first_resolution_checked")) errors.push("research_control_rf_first_missing");
  if (plan.privateEvidenceBoundaries.some((item) => item.effect !== "blocks_only_affected_assertions"
    || item.publicSubstitution !== "prohibited")) errors.push("research_control_private_boundary_not_claim_local");
  if (plan.evidenceCeiling.publicEvidenceMustNotEstablish.length === 0) errors.push("research_control_evidence_ceiling_missing");
  if (plan.initialMarginalValueDecision.externalResearchAuthorized
    && !["CLOSE", "UPGRADE", "NARROW"].includes(plan.initialMarginalValueDecision.decision)) {
    errors.push("research_control_marginal_authorization_invalid");
  }
  return errors;
}

function evidenceCeilingForFamily(family: CanonicalResearchClaimFamily): CanonicalClaimEvidenceCeiling {
  switch (family) {
    case "economic_category": return {
      code: "public_category_classification_only",
      publicEvidenceMayEstablish: ["public_fee_or_program_category_definition"],
      publicEvidenceMustNotEstablish: ["merchant_specific_treatment", "merchant_specific_contract_terms"],
      maximumRhReadyEffect: "category_interpretation_reassessment",
    };
    case "economic_ownership": return {
      code: "public_role_or_ownership_definition_only",
      publicEvidenceMayEstablish: ["public_program_role_or_economic_owner_definition"],
      publicEvidenceMustNotEstablish: ["merchant_specific_pass_through", "processor_ownership_from_collection_alone"],
      maximumRhReadyEffect: "ownership_interpretation_reassessment",
    };
    case "control_decision_authority": return {
      code: "public_control_authority_only",
      publicEvidenceMayEstablish: ["public_rule_setting_or_program_control_authority"],
      publicEvidenceMustNotEstablish: ["merchant_specific_control_right", "processor_ownership_from_collection_alone"],
      maximumRhReadyEffect: "control_interpretation_reassessment",
    };
    case "negotiability": return {
      code: "public_negotiability_context_only",
      publicEvidenceMayEstablish: ["public_pricing_variability_or_program_change_mechanism"],
      publicEvidenceMustNotEstablish: ["merchant_contractual_repricing_right", "merchant_specific_negotiability"],
      maximumRhReadyEffect: "negotiability_question_reassessment",
    };
    case "recurrence": return {
      code: "public_recurrence_design_only",
      publicEvidenceMayEstablish: ["recurring_by_public_schedule_or_design"],
      publicEvidenceMustNotEstablish: ["merchant_incurred_charge_in_prior_months", "merchant_specific_historical_recurrence"],
      maximumRhReadyEffect: "recurrence_question_reassessment",
    };
  }
}

function privateBoundariesForFamily(family: CanonicalResearchClaimFamily): CanonicalPrivateEvidenceBoundary[] {
  const boundary = (route: CanonicalPrivateEvidenceRoute, affectedAssertionCodes: string[]): CanonicalPrivateEvidenceBoundary => ({
    route, affectedAssertionCodes, effect: "blocks_only_affected_assertions", publicSubstitution: "prohibited",
  });
  switch (family) {
    case "negotiability": return [
      boundary("merchant_agreement_or_addendum", ["merchant_contractual_repricing_right", "merchant_specific_negotiability"]),
      boundary("processor_or_account_explanation", ["merchant_account_change_authority"]),
    ];
    case "recurrence": return [
      boundary("additional_statement_history", ["merchant_specific_historical_recurrence"]),
    ];
    case "economic_ownership": return [
      boundary("merchant_agreement_or_addendum", ["merchant_specific_pass_through"]),
      boundary("processor_or_account_explanation", ["merchant_account_economic_owner"]),
    ];
    case "control_decision_authority": return [
      boundary("merchant_agreement_or_addendum", ["merchant_specific_contractual_control"]),
      boundary("processor_or_account_explanation", ["merchant_account_decision_authority"]),
    ];
    case "economic_category": return [
      boundary("processor_or_account_explanation", ["merchant_specific_fee_treatment"]),
      boundary("other_private_evidence", ["unresolved_private_category_basis"]),
    ];
  }
}

function planningTerminalDisposition(admission: ResearchAdmission): CanonicalClaimTerminalDisposition | null {
  if (admission === "admitted_to_rg_work_ledger") return null;
  if (admission === "withheld_non_public_evidence_required") return "unresolved_private_evidence_required";
  if (admission === "withheld_rf_catalog_unavailable") return "operationally_degraded_not_semantically_complete";
  if (admission === "contextual_opportunistic_only") return "withheld_at_evidence_ceiling";
  return "withheld_no_marginal_value";
}

function finalizeUniverse(input: Omit<CanonicalSearchUniverseState, "stateHash">): CanonicalSearchUniverseState {
  return { ...input, stateHash: digest(input) };
}

function merge(current: string[], additions: string[]): string[] {
  return unique([...current, ...additions.filter((item) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(item))]);
}

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function uniquePaths<T extends CanonicalClaimResearchControlPlan["permittedEvidencePaths"][number]>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[];
}
function digest(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
