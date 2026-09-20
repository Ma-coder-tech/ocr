import { createHash } from "node:crypto";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "../canonical/types.js";
import { buildF1ClaimGraphFromCanonical } from "../claimAuthorityF1/canonicalAdapter.js";
import { createF1ClaimGraph } from "../claimAuthorityF1/graph.js";
import type { AuthorityLane, ClaimDimension, F1ClaimDraft, F1ClaimGraph } from "../claimAuthorityF1/types.js";
import { ruleFor } from "../claimAuthorityF2/rules.js";
import { F2_EVALUATOR_VERSION } from "../claimAuthorityF2/types.js";
import { tryResolveAdmittedPublicClaims } from "../claimAuthorityF3/resolver.js";
import type { F3PublicResolution, F3PublicScope, F3PublicSnapshot } from "../claimAuthorityF3/types.js";

export const F4_SHADOW_VERSION = "claim_authority_f4_shadow_v1" as const;

type Status = "supported" | "refused" | "unknown";
type Comparison = "agreement" | "disagreement" | "stronger_refusal" | "stronger_support" | "unresolved_unknown";
type Subject = "fee_row" | "statement";

export type F4ShadowDecision = {
  key: string;
  subject: Subject;
  feeRowId: string | null;
  dimension: ClaimDimension;
  semanticCode: string;
  f1ClaimId: string | null;
  status: Status;
  reasonCodes: string[];
  satisfiedLanes: AuthorityLane[];
  missingLanes: AuthorityLane[][];
  missingGates: string[];
  missingFacets: string[];
};

export type F4LegacyComparison = {
  decisionKey: string;
  comparisonBasis: "exact_semantic" | "proxy_only";
  currentPath: string;
  currentValue: string;
  currentStatus: Status;
  shadowValue: string | null;
  shadowStatus: Status;
  relation: Comparison;
  reasonCodes: string[];
};

export type F4PublicProbe = {
  feeRowId: string;
  scope: F3PublicScope;
  snapshot: F3PublicSnapshot;
  snapshotId: string;
};

export type F4ShadowReport = {
  version: typeof F4_SHADOW_VERSION;
  frozenF2RuleVersion: typeof F2_EVALUATOR_VERSION;
  standing: "shadow_only_no_production_consumer";
  analysisId: string;
  canonicalInputDigest: string;
  canonicalObservationGraphId: string;
  f1GraphId: string;
  reportId: string;
  decisions: F4ShadowDecision[];
  comparisons: F4LegacyComparison[];
  publicProbe: null | {
    feeRowId: string;
    scope: F3PublicScope;
    snapshotId: string;
    f1GraphId: string;
    resolution: F3PublicResolution | null;
    failureCode: "invalid_pinned_authority_input" | null;
    merchantApplicability: "not_established";
  };
};

type Evidence = { lanes: AuthorityLane[]; gates: string[]; facets: string[] };
const noEvidence: Evidence = { lanes: [], gates: [], facets: [] };

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stable(item[key])}`).join(",")}}`;
}

function compare(current: Status, shadow: Status, currentValue: string, shadowValue: string | null,
  basis: F4LegacyComparison["comparisonBasis"]): Comparison {
  if (current === shadow) {
    if (current === "supported" && basis === "exact_semantic" && shadowValue !== null && currentValue !== shadowValue)
      return "disagreement";
    return "agreement";
  }
  if (shadow === "unknown") return "unresolved_unknown";
  if (current === "unknown") return shadow === "supported" ? "stronger_support" : "stronger_refusal";
  if (current === "supported" && shadow === "refused") return "stronger_refusal";
  if (current === "refused" && shadow === "supported") return "stronger_support";
  return "disagreement";
}

// This is a shadow assessment of F2's frozen requirements, not an F2 attestation.
// Canonical observations supply only their own statement and structural lanes.
function assess(
  key: string, subject: Subject, feeRowId: string | null, dimension: ClaimDimension,
  semanticCode: string, f1ClaimId: string | null, evidence: Evidence,
): F4ShadowDecision {
  const rule = ruleFor(dimension, semanticCode);
  const missingLanes = rule.laneAlternatives.map((option) => option.filter((lane) => !evidence.lanes.includes(lane)))
    .filter((option) => option.length > 0);
  const hasLaneAlternative = rule.laneAlternatives.some((option) => option.every((lane) => evidence.lanes.includes(lane)));
  const missingGates = rule.requiredGates.filter((gate) => !evidence.gates.includes(gate));
  const missingFacets = rule.requiredFacets.filter((facet) => !evidence.facets.includes(facet)
    || (rule.facetLanes[facet]?.length > 0 && !rule.facetLanes[facet].some((lane) => evidence.lanes.includes(lane))));
  const status: Status = hasLaneAlternative && !missingGates.length && !missingFacets.length
    ? "supported" : rule.missingAuthorityOutcome === "refused" ? "refused" : "unknown";
  const reasonCodes = status === "supported" ? ["frozen_rule_requirements_met"] : [
    ...(!hasLaneAlternative ? ["required_authority_lane_missing"] : []),
    ...missingGates.map((gate) => `gate_${gate}_missing`),
    ...missingFacets.map((facet) => `facet_${facet}_missing`),
  ];
  return { key, subject, feeRowId, dimension, semanticCode, f1ClaimId, status,
    reasonCodes, satisfiedLanes: [...evidence.lanes].sort(),
    missingLanes: hasLaneAlternative ? [] : missingLanes, missingGates, missingFacets };
}

function rowEvidence(analysis: CanonicalStatementAnalysis, row: CanonicalFeeRow): Evidence {
  const occurrences = row.sourceOccurrenceIds.map((id) => analysis.feeLedger.sourceOccurrences.find((item) => item.id === id));
  const observed = occurrences.length > 0 && occurrences.every((item) => item !== undefined
    && item.pageNumber !== null && analysis.evidence.some((record) => record.id === item.evidenceRef
      && record.documentId === item.documentId && record.pageNumber === item.pageNumber));
  if (!observed) return noEvidence;
  const feeComponentRole = (row.role === "individual_charge"
    && row.contributionDecision.reasonCode === "individual_charge_included")
    || (row.role === "interchange_detail_row"
      && row.contributionDecision.reasonCode === "pass_through_fee_charge_included");
  // The interchange reason is a canonical inclusion code, not contractual pass-through authority.
  const structural = feeComponentRole && row.contributesToUniqueTotal
    && row.contributionDecision.contributes && row.selectedAmount !== null
    && row.selectedAmount.amountMinor > 0
    && row.parserInterpretationIds.length > 0;
  return {
    lanes: structural ? ["statement_source_document", "statement_structural_evidence"] : ["statement_source_document"],
    gates: ["observed_page_fact"],
    facets: structural ? ["observed_merchant_facing_component"] : [],
  };
}

function completeness(analysis: CanonicalStatementAnalysis): Evidence {
  const total = analysis.financialFacts.totalFees;
  const statementTotal = total.status === "selected" && total.value !== null && total.evidenceRefs.length > 0;
  const included = analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal);
  const composition = analysis.feeLedger.status === "available" && analysis.feeLedger.uniqueChargeTotal !== null
    && included.length > 0 && included.every((row) => rowEvidence(analysis, row).gates.includes("observed_page_fact"))
    && analysis.feeLedger.controls.some((control) => control.basis === "grand_control"
      && control.independence === "printed_source_control"
      && (control.status === "pass" || control.status === "pass_with_rounding"));
  return { lanes: [], gates: [
    ...(statementTotal ? ["statement_total"] : []),
    ...(composition ? ["fee_composition"] : []),
  ], facets: [] };
}

export function buildF4DecisionGraph(analysis: CanonicalStatementAnalysis, probeRowId: string | null = null): F1ClaimGraph {
  if (probeRowId !== null && !analysis.feeLedger.rows.some((row) => row.id === probeRowId))
    throw new Error("F4 public probe row absent");
  const period = analysis.identity.statementPeriod;
  const temporal = period.status === "selected" && period.value ? { ...period.value } : null;
  const draft = (candidateKey: string, subject: F1ClaimDraft["subject"], dimension: ClaimDimension,
    semanticCode: string, candidate = false): F1ClaimDraft => ({
    candidateKey, subject, dimension, semanticCode,
    value: candidate ? { kind: "known", representation: "semantic_code", code: semanticCode }
      : { kind: "unknown", reasonCode: "not_adjudicated_f1" },
    reasoning: { primaryClass: candidate ? "economic_structural_inference" : null,
      supportingClasses: candidate ? ["economic_structural_inference"] : [],
      ruleId: candidate ? "f4_semantic_candidate" : null, ruleVersion: candidate ? "v1" : null },
    authority: { requiredLanes: [], satisfiedLanes: [], assessment: "not_evaluated" },
    resolution: { status: candidate ? "candidate_only" : "unresolved",
      reasonCode: "not_adjudicated_f1", blockedDimensions: [] },
    temporal, universality: "merchant_account_specific", evidenceRefs: [], calculationRefs: [],
    canonicalRefs: [], policyDependency: null,
  });
  const drafts: F1ClaimDraft[] = analysis.feeLedger.rows.flatMap((row) => {
    const ref: F1ClaimDraft["subject"] = { kind: "fee_row", id: row.id };
    const prefix = `fee:${row.id}`;
    const legacyMarkup = analysis.feeOwnershipActionability.rowClassifications
      .some((item) => item.feeRowId === row.id && item.selected.category === "processor_markup");
    return [
      draft(`${prefix}:component`, ref, "economic_broad_category", "merchant_facing_fee_component", row.contributesToUniqueTotal),
      draft(`${prefix}:markup`, ref, "economic_broad_category", "processor_markup", legacyMarkup),
      draft(`${prefix}:collector`, ref, "collector", "fee_collector"),
      draft(`${prefix}:economic_beneficiary`, ref, "economic_beneficiary", "fee_economic_beneficiary"),
      draft(`${prefix}:contractual_controller`, ref, "contractual_controller", "fee_contractual_controller"),
      draft(`${prefix}:merchant_facing_price_controller`, ref, "merchant_facing_price_controller", "fee_merchant_facing_price_controller"),
      draft(`${prefix}:retained_margin_recipient`, ref, "retained_margin_recipient", "fee_retained_margin_recipient"),
      draft(`${prefix}:actionability`, ref, "actionability", "merchant_actionability"),
      draft(`${prefix}:savings`, ref, "savings", "merchant_savings"),
      ...(row.id === probeRowId ? [draft(`${prefix}:benchmark`, ref, "benchmark", "public_benchmark_probe")] : []),
    ];
  });
  drafts.push(draft("statement:ownership_actionability_claim_readiness",
    { kind: "fact", path: "identity.statementPeriod", selectedCandidateId: period.selectedCandidateId ?? null },
    "product_policy", "ownership_actionability_claim_readiness"));
  return createF1ClaimGraph(analysis, drafts);
}

function claimId(graph: F1ClaimGraph, key: string): string {
  const claim = graph.claims.find((item) => item.candidateKey === key);
  if (!claim) throw new Error(`F4 decision claim absent: ${key}`);
  return claim.claimId;
}

export function evaluateF4Shadow(input: { analysis: CanonicalStatementAnalysis; publicProbe?: F4PublicProbe }): F4ShadowReport {
  const { analysis } = input;
  const canonicalGraph = buildF1ClaimGraphFromCanonical(analysis);
  const graph = buildF4DecisionGraph(analysis, input.publicProbe?.feeRowId ?? null);
  const decisions: F4ShadowDecision[] = [];
  const comparisons: F4LegacyComparison[] = [];
  const complete = completeness(analysis);
  const classifications = new Map(analysis.feeOwnershipActionability.rowClassifications.map((item) => [item.feeRowId, item.selected]));
  if (classifications.size !== analysis.feeOwnershipActionability.rowClassifications.length)
    throw new Error("F4 duplicate legacy classification row");
  const opportunities = analysis.opportunityEngine.components;
  const add = (decision: F4ShadowDecision, path: string, currentValue: string, currentStatus: Status,
    comparisonBasis: F4LegacyComparison["comparisonBasis"] = "proxy_only", shadowValue: string | null = null): void => {
    decisions.push(decision);
    comparisons.push({ decisionKey: decision.key, comparisonBasis, currentPath: path, currentValue, currentStatus,
      shadowValue, shadowStatus: decision.status,
      relation: compare(currentStatus, decision.status, currentValue, shadowValue, comparisonBasis),
      reasonCodes: [...decision.reasonCodes] });
  };
  for (const row of [...analysis.feeLedger.rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const evidence = rowEvidence(analysis, row);
    const selected = classifications.get(row.id);
    const prefix = `fee:${row.id}`;
    const broad = assess(`${prefix}:component`, "fee_row", row.id, "economic_broad_category",
      "merchant_facing_fee_component", claimId(graph, `${prefix}:component`), evidence);
    add(broad, `feeLedger.rows[${row.id}].contributesToUniqueTotal`, String(row.contributesToUniqueTotal),
      row.contributesToUniqueTotal ? "supported" : "refused");
    const markup = assess(`${prefix}:markup`, "fee_row", row.id, "economic_broad_category",
      "processor_markup", claimId(graph, `${prefix}:markup`), evidence);
    add(markup, `feeOwnershipActionability.rowClassifications[${row.id}].selected.category`, selected?.category ?? "unavailable",
      !selected ? "unknown" : selected.category === "processor_markup" ? "supported" : "refused",
      "exact_semantic", markup.status === "supported" ? "processor_markup" : null);
    for (const dimension of ["collector", "economic_beneficiary", "contractual_controller"] as const) {
      // The row label and the legacy selected party are comparison inputs only.
      // They never create explicit collector, beneficiary, or contract facets.
      const property = dimension === "collector" ? "collector" : dimension === "economic_beneficiary" ? "economicBeneficiary" : "contractualController";
      const party = selected?.ownership[property] ?? "unknown";
      const decision = assess(`${prefix}:${dimension}`, "fee_row", row.id, dimension,
        `fee_${dimension}`, claimId(graph, `${prefix}:${dimension}`), evidence);
      add(decision, `feeOwnershipActionability.rowClassifications[${row.id}].selected.ownership.${property}`,
        party, party === "unknown" ? "unknown" : "supported", "exact_semantic");
    }
    for (const dimension of ["merchant_facing_price_controller", "retained_margin_recipient"] as const) {
      decisions.push(assess(`${prefix}:${dimension}`, "fee_row", row.id, dimension,
        `fee_${dimension}`, claimId(graph, `${prefix}:${dimension}`), evidence));
    }
    const actionability = assess(`${prefix}:actionability`, "fee_row", row.id, "actionability",
      "merchant_actionability", claimId(graph, `${prefix}:actionability`), evidence);
    add(actionability, `feeOwnershipActionability.rowClassifications[${row.id}].selected.actionabilityCeiling`,
      selected?.actionabilityCeiling ?? "unavailable", selected?.actionabilityCeiling === "potentially_actionable" ? "supported"
        : selected ? "refused" : "unknown");
    const components = opportunities.filter((item) => item.feeRowRefs.some((ref) => ref.feeRowId === row.id));
    const saving = assess(`${prefix}:savings`, "fee_row", row.id, "savings", "merchant_savings",
      claimId(graph, `${prefix}:savings`), { lanes: evidence.lanes, gates: [...evidence.gates, ...complete.gates], facets: [] });
    const eligible = components.some((item) => item.inclusionStatus === "included"
      && (item.eligibility === "deterministic" || item.eligibility === "approved_estimate"));
    add(saving, `opportunityEngine.components[feeRowId=${row.id}].eligibility`,
      components.map((item) => `${item.id}:${item.eligibility}:${item.inclusionStatus}`).sort().join(",") || "none",
      eligible ? "supported" : "refused");
  }
  const permission = analysis.customerState.permissions.find((item) => item.key === "ownership_actionability");
  const readiness = assess("statement:ownership_actionability_claim_readiness", "statement", null, "product_policy",
    "ownership_actionability_claim_readiness", claimId(graph, "statement:ownership_actionability_claim_readiness"), noEvidence);
  add(readiness, "customerState.permissions[ownership_actionability]", String(permission?.permitted ?? false),
    permission?.permitted ? "supported" : "refused");

  let publicProbe: F4ShadowReport["publicProbe"] = null;
  if (input.publicProbe) {
    const benchmarkClaimId = claimId(graph, `fee:${input.publicProbe.feeRowId}:benchmark`);
    const resolved = tryResolveAdmittedPublicClaims({ analysis, graph, claimId: benchmarkClaimId,
      snapshot: input.publicProbe.snapshot, snapshotId: input.publicProbe.snapshotId, scope: input.publicProbe.scope });
    publicProbe = { feeRowId: input.publicProbe.feeRowId, scope: structuredClone(input.publicProbe.scope),
      snapshotId: input.publicProbe.snapshotId, f1GraphId: graph.graphId,
      resolution: resolved.status === "available" ? resolved.result : null,
      failureCode: resolved.status === "unavailable" ? resolved.failureCode : null,
      merchantApplicability: "not_established" };
    const benchmark = assess(`fee:${input.publicProbe.feeRowId}:benchmark`, "fee_row", input.publicProbe.feeRowId,
      "benchmark", "merchant_applicable_benchmark", benchmarkClaimId, noEvidence);
    // Even a public F3 match proves only a scoped publication, not the merchant's transaction population.
    decisions.push({ ...benchmark, status: "unknown", reasonCodes: [
      resolved.status === "available" ? `f3_${resolved.result.reasonCode}` : "f3_invalid_pinned_authority_input",
      "merchant_population_not_established",
    ] });
  }
  decisions.sort((a, b) => a.key.localeCompare(b.key));
  comparisons.sort((a, b) => a.decisionKey.localeCompare(b.decisionKey));
  const payload = { version: F4_SHADOW_VERSION, frozenF2RuleVersion: F2_EVALUATOR_VERSION,
    standing: "shadow_only_no_production_consumer" as const,
    analysisId: analysis.analysisId, canonicalInputDigest: canonicalGraph.canonicalInputDigest,
    canonicalObservationGraphId: canonicalGraph.graphId, f1GraphId: graph.graphId,
    decisions, comparisons, publicProbe };
  return freeze({ ...payload, reportId: `f4_shadow_${createHash("sha256").update(stable(payload)).digest("hex")}` });
}

export function tryEvaluateF4Shadow(input: { analysis: CanonicalStatementAnalysis; publicProbe?: F4PublicProbe }):
  | { status: "available"; report: F4ShadowReport }
  | { status: "unavailable"; report: null; failureCode: "invalid_canonical_or_shadow_input" } {
  try { return { status: "available", report: evaluateF4Shadow(input) }; }
  catch { return { status: "unavailable", report: null, failureCode: "invalid_canonical_or_shadow_input" }; }
}
