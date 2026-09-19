import { createHash } from "node:crypto";
import { validateCanonicalRef, validateF1ClaimGraph } from "../claimAuthorityF1/graph.js";
import { universalityScopes, type AuthorityLane, type F1Claim, type UniversalityScope } from "../claimAuthorityF1/types.js";
import { dimensionRules, ruleFor } from "./rules.js";
import {
  completenessGateIds, denominatorPolicyIds, F2_EVALUATOR_VERSION,
  type CompletenessGateId, type DenominatorPolicyId, type F2ClaimDecision,
  type F2DenominatorDecision, type F2Evaluation, type F2EvaluationInput,
  type F2GateDecision, type F2HardFailure, type F2Rule, type F2Status,
} from "./types.js";

const gateEvidence: Record<CompletenessGateId, string[]> = {
  observed_page_fact: ["accepted_page_or_section", "bounded_source_location"],
  statement_total: ["contributing_sections_and_pages", "gross_fee_reconciliation", "sign_conventions"],
  fee_composition: ["printed_gross_fees", "credits_and_adjustments_separately_identified", "repeated_representations", "unresolved_and_excluded_amounts"],
  pricing_architecture: ["sufficient_accepted_document_scope", "independent_pricing_axes", "structural_support_beyond_labels"],
  comparison: ["compatible_identity", "scope", "population", "denominator", "effective_period", "reference_authority"],
  actionability: ["dimension_specific_control_authority", "merchant_applicability", "reviewed_product_policy"],
  savings: ["valid_named_counterfactual", "target_authority", "compatible_identity_scope_population_denominator_period", "merchant_applicability", "recurrence_or_cadence", "document_completeness", "non_overlap"],
};
const denominatorEvidence: Record<DenominatorPolicyId, string[]> = {
  accounting_completeness: ["reconciled_contributing_charges", "sign_conventions"],
  economic_classification_completeness: ["credits", "adjustments", "unresolved_gross_charges"],
  merchant_facing_completeness: ["unresolved_amounts", "excluded_amounts", "repeated_representations", "credits", "adjustments", "partial_document_coverage"],
};
const publicLanes: AuthorityLane[] = ["governed_network_regulator", "governed_processor_acquirer_publication", "governed_public_mixed"];
const privateLane: AuthorityLane = "merchant_private_contract_or_correspondence";

function check(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`F2 invalid evaluation input: ${reason}`);
}
function uniqueSorted<T extends string>(items: T[]): T[] { return [...new Set(items)].sort(); }
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stable(item[key])}`).join(",")}}`;
}
export function f2SubjectKey(claim: F1Claim): string { return createHash("sha256").update(stable(claim.subject)).digest("hex"); }
function covers(effective: { start: string; end: string } | null, required: { start: string; end: string } | null): boolean {
  return effective !== null && required !== null && effective.start <= required.start && effective.end >= required.end;
}
function scopeCompatible(proof: UniversalityScope, claim: UniversalityScope): boolean {
  return proof === claim || proof === "universal_acquiring_accounting";
}
function gateDecisions(input: F2EvaluationInput): F2GateDecision[] {
  check(new Set(input.gates.map((item) => `${item.gate}:${item.subjectKey ?? "analysis"}`)).size === input.gates.length, "duplicate completeness gate and subject");
  check(input.gates.every((item) => completenessGateIds.includes(item.gate)
    && (item.subjectKey === null ? ["statement_total", "fee_composition", "pricing_architecture"].includes(item.gate) : typeof item.subjectKey === "string" && item.subjectKey.length > 0)
    && Array.isArray(item.evidence)), "unknown or unscoped completeness gate");
  const decisions = input.gates.map((submitted): F2GateDecision => {
    const gate = submitted.gate;
    const missingEvidence = gateEvidence[gate].filter((item) => !submitted?.evidence.includes(item));
    return { gate, subjectKey: submitted.subjectKey, status: missingEvidence.length === 0 ? "eligible" : submitted.evidence.length ? "partial" : "blocked", missingEvidence };
  });
  for (const gate of completenessGateIds) {
    if (!input.gates.some((item) => item.gate === gate)) decisions.push({ gate, subjectKey: null, status: "unknown", missingEvidence: [...gateEvidence[gate]] });
  }
  return decisions.sort((a, b) => a.gate.localeCompare(b.gate) || (a.subjectKey ?? "").localeCompare(b.subjectKey ?? ""));
}
function denominatorDecisions(input: F2EvaluationInput): F2DenominatorDecision[] {
  check(new Set(input.denominators.map((item) => item.policy)).size === input.denominators.length, "duplicate denominator policy");
  check(input.denominators.every((item) => denominatorPolicyIds.includes(item.policy)), "unknown denominator policy");
  return denominatorPolicyIds.map((policy) => {
    const submitted = input.denominators.find((item) => item.policy === policy);
    const missingEvidence = denominatorEvidence[policy].filter((item) => !submitted?.separatelyAccountedFor.includes(item));
    if (!submitted) return { policy, status: "unknown", missingEvidence, printedGrossRef: null };
    let validGross = false;
    if (submitted.printedGrossRef) {
      validateCanonicalRef(input.analysis, submitted.printedGrossRef);
      const ref = submitted.printedGrossRef;
      if (ref.kind === "fee_control") {
        const control = input.analysis.feeLedger.controls.find((item) => item.id === ref.id);
        validGross = control?.amountBasis === "fee_charge_gross" && control.independence === "printed_source_control" && control.expectedAmount !== null
          && control.evidenceRefs.length > 0 && control.evidenceRefs.every((id) => input.analysis.evidence.some((item) => item.id === id
            && item.sourceRole === "control_total" && item.documentId === input.analysis.identity.sourceDocumentRef));
      }
    }
    if (submitted.basis !== "printed_gross_fees" || !validGross) missingEvidence.push("independent_printed_gross_fee_control");
    return { policy, status: missingEvidence.length ? "blocked" : "eligible", missingEvidence, printedGrossRef: validGross ? submitted.printedGrossRef : null };
  });
}
function denominatorDependencies(gate: CompletenessGateId): DenominatorPolicyId[] {
  if (gate === "statement_total") return ["accounting_completeness"];
  if (gate === "fee_composition") return ["economic_classification_completeness", "merchant_facing_completeness"];
  if (gate === "pricing_architecture") return ["merchant_facing_completeness"];
  if (gate === "savings") return [...denominatorPolicyIds];
  return [];
}
function reasonFor(status: F2Status): string {
  return {
    supported: "all_required_checks_satisfied", partially_supported: "narrower_claim_supported_only",
    unresolved: "claim_value_unresolved", refused: "strong_claim_not_authorized",
    conflict: "unresolved_authority_conflict", policy_blocked: "reviewed_policy_blocks_use",
    incomplete_document: "required_completeness_gate_blocked", missing_authority: "required_authority_or_source_missing",
  }[status];
}
function safeKnown(claim: F1Claim): F2ClaimDecision["admittedValue"] {
  if (claim.value.kind === "known") return claim.value.representation;
  return claim.value.kind;
}
function policyNeeded(claim: F1Claim): boolean { return claim.dimension === "product_policy" || claim.dimension === "actionability" || claim.dimension === "savings" || claim.policyDependency !== null; }
function canonicalLane(claim: F1Claim, input: F2EvaluationInput): AuthorityLane | null {
  if (claim.value.kind !== "known" || claim.value.representation !== "canonical_reference" || claim.resolution.status !== "represented_observation") return null;
  if (claim.reasoning.primaryClass === "deterministic_calculation" && claim.calculationRefs.length > 0) return "deterministic_arithmetic";
  if (claim.reasoning.primaryClass !== "direct_observation" || claim.evidenceRefs.length === 0) return null;
  if (claim.subject.kind === "fee_control") {
    const controlId = claim.subject.id;
    const control = input.analysis.feeLedger.controls.find((item) => item.id === controlId);
    if (control?.independence !== "printed_source_control") return null;
  }
  return "statement_source_document";
}

export function evaluateF2(input: F2EvaluationInput): F2Evaluation {
  validateF1ClaimGraph(input.graph, input.analysis);
  check(Array.isArray(input.attestations) && Array.isArray(input.gates) && Array.isArray(input.denominators)
    && Array.isArray(input.policy) && Array.isArray(input.supersessions) && Array.isArray(input.narrowingLinks) && Array.isArray(input.requestedPositiveClaimIds), "missing input collection");
  const claims = new Map(input.graph.claims.map((claim) => [claim.claimId, claim]));
  const graphSubjectKeys = new Set(input.graph.claims.map(f2SubjectKey));
  check(input.gates.every((item) => item.subjectKey === null || graphSubjectKeys.has(item.subjectKey)), "completeness gate references an unrelated subject");
  check(new Set(input.attestations.map((item) => item.id)).size === input.attestations.length, "duplicate attestation ID");
  check(input.attestations.every((item) => claims.has(item.claimId) && item.provenance === "hand_authored_non_authoritative_test"), "unrecognized attestation or production evidence");
  check(input.policy.every((item) => claims.has(item.claimId) && Boolean(item.ruleId && item.ruleVersion && item.attestationId)
    && ["materiality", "visibility", "blocking", "priority", "reportability", "wording_action_ceiling"].includes(item.facet)
    && ["permit", "block"].includes(item.decision)), "invalid policy input");
  check(new Set(input.policy.map((item) => item.claimId)).size === input.policy.length, "duplicate policy decision");
  check(input.requestedPositiveClaimIds.every((id) => claims.has(id)), "unknown requested admission");
  check(input.supersessions.every((item) => {
    const conflict = input.graph.conflicts.find((group) => group.conflictId === item.conflictId);
    return conflict?.claimIds.includes(item.winningClaimId) && Boolean(item.reviewedRuleId && item.reviewedRuleVersion && item.reviewDecisionId)
      && item.reviewStatus === "admitted" && item.provenance === "hand_authored_non_authoritative_test";
  }), "unreviewed or invalid supersession");
  check(input.narrowingLinks.every((item) => item.strongClaimId !== item.narrowerClaimId
    && claims.has(item.strongClaimId) && claims.has(item.narrowerClaimId)
    && stable(claims.get(item.strongClaimId)?.subject) === stable(claims.get(item.narrowerClaimId)?.subject)
    && claims.get(item.strongClaimId)?.semanticCode === "processor_markup"
    && claims.get(item.narrowerClaimId)?.semanticCode === "merchant_pricing_component"), "invalid narrower-claim link");
  const gates = gateDecisions(input);
  const denominators = denominatorDecisions(input);
  const decisions: F2ClaimDecision[] = input.graph.claims.map((claim) => {
    const rule: F2Rule = ruleFor(claim.dimension, claim.semanticCode);
    const all = input.attestations.filter((item) => item.claimId === claim.claimId);
    const failures: F2HardFailure[] = [];
    const add = (failure: F2HardFailure): void => { if (!failures.includes(failure)) failures.push(failure); };
    for (const proof of all) {
      check(proof.id.length > 0 && Array.isArray(proof.facets) && proof.subjectKey.length > 0 && universalityScopes.includes(proof.scope), "malformed attestation");
      if (proof.effectivePeriod) check(/^\d{4}-\d{2}-\d{2}$/.test(proof.effectivePeriod.start) && /^\d{4}-\d{2}-\d{2}$/.test(proof.effectivePeriod.end) && proof.effectivePeriod.start <= proof.effectivePeriod.end, "invalid effective period");
      if (!rule.allowedLanes.includes(proof.lane) && !(policyNeeded(claim) && proof.lane === "reviewed_product_policy")) add("evidence_lane_leakage");
      if (publicLanes.includes(proof.lane) && !covers(proof.effectivePeriod, claim.temporal)) add("historical_back_projection");
      if (proof.lane === privateLane && (proof.promotedToGlobal || claim.universality !== "merchant_account_specific") && !proof.reviewedPromotion) add("merchant_private_to_global_unreviewed_promotion");
    }
    const compatible = all.filter((proof) => proof.subjectKey === f2SubjectKey(claim)
      && scopeCompatible(proof.scope, claim.universality)
      && (!claim.temporal || covers(proof.effectivePeriod, claim.temporal))
      && (!publicLanes.includes(proof.lane) || covers(proof.effectivePeriod, claim.temporal))
      && (proof.lane !== privateLane || (input.accountKey !== null && proof.privateAccountKey === input.accountKey && claim.universality === "merchant_account_specific" && !proof.promotedToGlobal)));
    const valid = compatible.filter((proof) => rule.allowedLanes.includes(proof.lane));
    const intrinsic = canonicalLane(claim, input);
    const satisfiedLanes = uniqueSorted([...valid.map((item) => item.lane), ...(intrinsic ? [intrinsic] : [])]);
    const missingLaneAlternatives = rule.laneAlternatives.map((alternative) => alternative.filter((lane) => !satisfiedLanes.includes(lane)));
    const lanesSatisfied = missingLaneAlternatives.some((item) => item.length === 0);
    const missingFacets = rule.requiredFacets.filter((facet) => !valid.some((item) => item.facets.includes(facet)
      && (rule.facetLanes[facet] ?? rule.allowedLanes).includes(item.lane)));
    const subjectKey = f2SubjectKey(claim);
    const blockedGates = rule.requiredGates.filter((gate) => gates.find((item) => item.gate === gate && item.subjectKey === subjectKey)?.status !== "eligible"
      && gates.find((item) => item.gate === gate && item.subjectKey === null)?.status !== "eligible"
      || denominatorDependencies(gate).some((policy) => denominators.find((item) => item.policy === policy)?.status !== "eligible"));
    const conflicts = input.graph.conflicts.filter((group) => group.claimIds.includes(claim.claimId)
      && !input.supersessions.some((item) => item.conflictId === group.conflictId));
    const superseded = input.graph.conflicts.some((group) => group.claimIds.includes(claim.claimId)
      && input.supersessions.some((item) => item.conflictId === group.conflictId && item.winningClaimId !== claim.claimId));
    const policyInput = input.policy.find((item) => item.claimId === claim.claimId);
    const policyProof = policyInput && (!claim.policyDependency || (policyInput.ruleId === claim.policyDependency.ruleId && policyInput.ruleVersion === claim.policyDependency.ruleVersion))
      ? compatible.find((item) => item.id === policyInput.attestationId && item.lane === "reviewed_product_policy" && item.facets.includes("reviewed_rule"))
      : undefined;
    const policyDecision: F2ClaimDecision["policyDecision"] = !policyNeeded(claim) ? "not_required" : !policyInput || !policyProof ? "missing" : policyInput.decision === "block" ? "blocked" : "permitted";
    let status: F2Status;
    if (conflicts.length) status = "conflict";
    else if (superseded) status = "refused";
    else if (claim.value.kind === "unknown" || claim.value.kind === "not_applicable") status = "unresolved";
    else if (claim.reasoning.primaryClass === null || !rule.allowedReasoning.includes(claim.reasoning.primaryClass)) status = "refused";
    else if (failures.length) status = "refused";
    else if (!lanesSatisfied || missingFacets.length) status = rule.missingAuthorityOutcome;
    else if (blockedGates.length) status = "incomplete_document";
    else if (policyDecision === "blocked") status = "policy_blocked";
    else if (policyDecision === "missing") status = "refused";
    else status = "supported";
    if (input.requestedPositiveClaimIds.includes(claim.claimId) && status !== "supported") add("unsupported_positive_admission");
    if (failures.length && status === "supported") status = "refused";
    return {
      claimId: claim.claimId, dimension: claim.dimension, semanticCode: claim.semanticCode,
      status, evaluationOutcome: "unresolved", admittedValue: status === "supported" ? safeKnown(claim) : claim.value.kind === "not_applicable" ? "not_applicable" : "unknown",
      reasonCode: reasonFor(status), satisfiedLanes, missingLaneAlternatives,
      requiredFacets: [...rule.requiredFacets], missingFacets, requiredGates: [...rule.requiredGates], blockedGates,
      attestationIds: valid.map((item) => item.id).sort(), conflictIds: conflicts.map((item) => item.conflictId).sort(),
      blockedDimensions: [...claim.resolution.blockedDimensions], narrowerSupportedClaimIds: [], policyDecision,
      policyAttestationId: policyProof?.id ?? null, hardFailures: uniqueSorted(failures),
    };
  });
  // Dependency proof may narrow a conclusion, but never promotes another dimension.
  const byId = new Map(decisions.map((item) => [item.claimId, item]));
  for (let pass = 0; pass < input.graph.claims.length; pass++) {
    let changed = false;
    for (const edge of input.graph.edges.filter((item) => item.kind !== "contradicts")) {
      const dependent = byId.get(edge.fromClaimId);
      const prerequisite = byId.get(edge.toClaimId);
      if (dependent?.status === "supported" && prerequisite?.status !== "supported") {
        dependent.status = "refused";
        dependent.admittedValue = "unknown";
        dependent.reasonCode = "prerequisite_claim_not_supported";
        if (input.requestedPositiveClaimIds.includes(dependent.claimId) && !dependent.hardFailures.includes("unsupported_positive_admission")) dependent.hardFailures.push("unsupported_positive_admission");
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const decision of decisions) {
    const narrowerSupportedClaimIds = uniqueSorted(input.narrowingLinks
      .filter((item) => item.strongClaimId === decision.claimId && byId.get(item.narrowerClaimId)?.status === "supported")
      .map((item) => item.narrowerClaimId));
    decision.narrowerSupportedClaimIds = narrowerSupportedClaimIds;
    if (narrowerSupportedClaimIds.length && ["refused", "missing_authority", "incomplete_document", "unresolved"].includes(decision.status)) {
      decision.status = "partially_supported";
      decision.reasonCode = "narrower_claim_supported_stronger_refused";
      decision.admittedValue = "unknown";
    }
    decision.evaluationOutcome = decision.hardFailures.length ? "hard_failure"
      : decision.status === "supported" ? "correct_answer"
        : ["refused", "missing_authority", "incomplete_document", "policy_blocked", "partially_supported"].includes(decision.status) ? "correct_refusal" : "unresolved";
  }
  const hardFailures = uniqueSorted(decisions.flatMap((item) => item.hardFailures));
  const result: F2Evaluation = {
    evaluatorVersion: F2_EVALUATOR_VERSION, graphId: input.graph.graphId,
    decisions, gateDecisions: gates, denominatorDecisions: denominators,
    hardFailures, status: "shadow_only", authorityStanding: "hand_authored_non_authoritative_test",
  };
  return deepFreeze(result);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function tryEvaluateF2(input: F2EvaluationInput): { status: "available"; result: F2Evaluation } | { status: "unavailable"; result: null; failureCode: "invalid_evaluation_input" } {
  try { return { status: "available", result: evaluateF2(input) }; }
  catch { return { status: "unavailable", result: null, failureCode: "invalid_evaluation_input" }; }
}

export const f2FrozenGateEvidence = gateEvidence;
export const f2FrozenDenominatorEvidence = denominatorEvidence;
export const f2DimensionRules = dimensionRules;
