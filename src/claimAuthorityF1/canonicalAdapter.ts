import type { CanonicalFactValue, CanonicalStatementAnalysis } from "../canonical/types.js";
import { canonicalFactAt, createF1ClaimGraph } from "./graph.js";
import {
  canonicalFactPaths, type CanonicalRef, type ClaimDimension, type F1ClaimDraft,
  type F1ClaimGraph, type F1ConflictDraft, type F1EdgeDraft, type ReasoningClass,
} from "./types.js";

const OWNERSHIP_DIMENSIONS: ClaimDimension[] = [
  "biller_statement_issuer", "collector", "economic_beneficiary",
  "contractual_controller", "merchant_facing_price_controller", "retained_margin_recipient",
];

type F1ShadowDiagnostic = {
  status: "available" | "unavailable";
  graphId: string | null;
  claimCount: number;
  unknownClaimCount: number;
  conflictCount: number;
  legacyComparison: {
    selectedOwnershipRowsNotAdjudicatedByF1: number;
    selectedPotentiallyActionableRowsNotAdjudicatedByF1: number;
  };
  failureCode: "invalid_canonical_or_graph" | null;
};

export type F1ShadowResult =
  | { status: "available"; graph: F1ClaimGraph; diagnostic: F1ShadowDiagnostic }
  | { status: "unavailable"; graph: null; diagnostic: F1ShadowDiagnostic };

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function periodOf(analysis: CanonicalStatementAnalysis): { start: string; end: string } | null {
  const fact = analysis.identity.statementPeriod;
  return fact.status === "selected" && fact.value ? { start: fact.value.start, end: fact.value.end } : null;
}

function baseDraft(
  candidateKey: string,
  subject: CanonicalRef,
  dimension: ClaimDimension,
  semanticCode: string,
  period: { start: string; end: string } | null,
): F1ClaimDraft {
  return {
    candidateKey, subject, dimension, semanticCode,
    value: { kind: "unknown", reasonCode: "not_adjudicated_f1" },
    reasoning: { primaryClass: null, supportingClasses: [], ruleId: null, ruleVersion: null },
    authority: { requiredLanes: [], satisfiedLanes: [], assessment: "not_evaluated" },
    resolution: { status: "unresolved", reasonCode: "not_adjudicated_f1", blockedDimensions: [] },
    temporal: period, universality: "merchant_account_specific",
    evidenceRefs: [], calculationRefs: [], canonicalRefs: [], policyDependency: null,
  };
}

function observedDraft(
  candidateKey: string,
  subject: CanonicalRef,
  dimension: ClaimDimension,
  semanticCode: string,
  period: { start: string; end: string } | null,
  reasoningClass: ReasoningClass,
): F1ClaimDraft {
  const draft = baseDraft(candidateKey, subject, dimension, semanticCode, period);
  return {
    ...draft,
    value: { kind: "known", representation: "canonical_reference", ref: subject },
    reasoning: {
      primaryClass: reasoningClass,
      supportingClasses: [reasoningClass],
      ruleId: "canonical_read_only_reference",
      ruleVersion: "f1_v1",
    },
    authority: {
      requiredLanes: [reasoningClass === "deterministic_calculation" ? "deterministic_arithmetic" : "statement_source_document"],
      satisfiedLanes: [], assessment: "not_evaluated",
    },
    resolution: { status: "represented_observation", reasonCode: "canonical_record_only", blockedDimensions: [] },
  };
}

function factDraft(analysis: CanonicalStatementAnalysis, path: (typeof canonicalFactPaths)[number], period: { start: string; end: string } | null): F1ClaimDraft {
  const fact: CanonicalFactValue<unknown> = canonicalFactAt(analysis, path);
  const subject: CanonicalRef = { kind: "fact", path, selectedCandidateId: fact.selectedCandidateId ?? null };
  const candidateKey = `fact:${path}`;
  const calculated = Boolean(fact.calculationRef);
  const dimension: ClaimDimension = calculated ? "calculation" : "observation";
  const draft = fact.status === "selected"
    ? observedDraft(candidateKey, subject, dimension, "canonical_selected_fact", period, calculated ? "deterministic_calculation" : "direct_observation")
    : baseDraft(candidateKey, subject, dimension, "canonical_fact_unavailable", period);
  if (fact.status === "not_applicable") {
    draft.value = { kind: "not_applicable", reasonCode: "canonical_not_applicable" };
    draft.resolution = { status: "not_applicable", reasonCode: "canonical_not_applicable", blockedDimensions: [] };
  } else if (fact.status !== "selected") {
    draft.value = { kind: "unknown", reasonCode: `canonical_${fact.status}` };
    draft.resolution = { status: "unresolved", reasonCode: `canonical_${fact.status}`, blockedDimensions: [] };
  }
  draft.evidenceRefs = sortedUnique(fact.evidenceRefs);
  draft.calculationRefs = fact.calculationRef ? [fact.calculationRef] : [];
  return draft;
}

function feeRowDrafts(analysis: CanonicalStatementAnalysis, period: { start: string; end: string } | null): F1ClaimDraft[] {
  const occurrences = new Map(analysis.feeLedger.sourceOccurrences.map((item) => [item.id, item]));
  return analysis.feeLedger.rows.flatMap((row) => {
    const subject: CanonicalRef = { kind: "fee_row", id: row.id };
    const observation = observedDraft(`fee:${row.id}:observation`, subject, "observation", "canonical_fee_row_record", period, "direct_observation");
    observation.canonicalRefs = [
      ...row.sourceOccurrenceIds.map((id): CanonicalRef => ({ kind: "fee_occurrence", id })),
      ...row.parserInterpretationIds.map((id): CanonicalRef => ({ kind: "fee_interpretation", id })),
      ...row.contributionDecision.controlRefs.map((id): CanonicalRef => ({ kind: "fee_control", id })),
    ];
    observation.evidenceRefs = sortedUnique([
      ...row.contributionDecision.evidenceRefs,
      ...row.sourceOccurrenceIds.map((id) => occurrences.get(id)?.evidenceRef ?? ""),
    ].filter(Boolean));
    const unknowns = [...OWNERSHIP_DIMENSIONS, "actionability" as const].map((dimension) => {
      const draft = baseDraft(`fee:${row.id}:${dimension}`, subject, dimension, `fee_${dimension}_not_adjudicated`, period);
      draft.canonicalRefs = [{ kind: "fee_row", id: row.id }];
      if (dimension === "actionability") {
        draft.policyDependency = {
          ruleId: "customer_action_guidance_policy",
          ruleVersion: analysis.versionManifest.customerActionGuidancePolicyVersion,
        };
        draft.authority.requiredLanes = ["reviewed_product_policy"];
      }
      return draft;
    });
    return [observation, ...unknowns];
  });
}

export function buildF1ClaimGraphFromCanonical(analysis: CanonicalStatementAnalysis): F1ClaimGraph {
  const period = periodOf(analysis);
  const drafts: F1ClaimDraft[] = canonicalFactPaths.map((path) => factDraft(analysis, path, period));
  drafts.push(...feeRowDrafts(analysis, period));
  for (const calculation of analysis.calculations) {
    const ref: CanonicalRef = { kind: "calculation", id: calculation.id };
    const draft = calculation.result === null
      ? baseDraft(`calculation:${calculation.id}`, ref, "calculation", "canonical_calculation_unavailable", period)
      : observedDraft(`calculation:${calculation.id}`, ref, "calculation", "canonical_calculation_record", period, "deterministic_calculation");
    draft.evidenceRefs = sortedUnique(calculation.inputs.flatMap((input) => input.evidenceRefs));
    draft.calculationRefs = [calculation.id];
    drafts.push(draft);
  }
  for (const control of analysis.feeLedger.controls) {
    const ref: CanonicalRef = { kind: "fee_control", id: control.id };
    const draft = observedDraft(`control:${control.id}`, ref, "observation", "canonical_fee_control_record", period, "direct_observation");
    draft.evidenceRefs = sortedUnique(control.evidenceRefs);
    draft.canonicalRefs = control.coveredFeeRowIds.map((id) => ({ kind: "fee_row", id }));
    drafts.push(draft);
  }
  for (const node of analysis.crossSummaryLinkEvidence.nodes) {
    const ref: CanonicalRef = { kind: "cross_summary_node", id: node.id };
    const draft = node.amount === null
      ? baseDraft(`summary:${node.id}`, ref, "observation", "cross_summary_value_unavailable", period)
      : observedDraft(`summary:${node.id}`, ref, "observation", "cross_summary_reference_record", period, "direct_observation");
    draft.evidenceRefs = sortedUnique(node.evidenceRefs);
    drafts.push(draft);
  }
  const edges: F1EdgeDraft[] = [];
  const conflicts: F1ConflictDraft[] = [];
  for (const relation of analysis.crossSummaryLinkEvidence.relationships) {
    const ref: CanonicalRef = { kind: "cross_summary_relationship", id: relation.id };
    const draft = relation.status === "proven" && relation.relationshipType !== "unknown"
      ? observedDraft(`relationship:${relation.id}`, ref, "template_relationship", "canonical_relationship_record", period, "deterministic_calculation")
      : baseDraft(`relationship:${relation.id}`, ref, "template_relationship", "canonical_relationship_unresolved", period);
    draft.evidenceRefs = sortedUnique(relation.evidenceRefs);
    draft.canonicalRefs = [
      { kind: "cross_summary_node", id: relation.leftSummaryId },
      { kind: "cross_summary_node", id: relation.rightSummaryId },
    ];
    drafts.push(draft);
    if (relation.comparison.amount === "conflicts") {
      const left = `summary:${relation.leftSummaryId}`;
      const right = `summary:${relation.rightSummaryId}`;
      edges.push({ kind: "contradicts", fromCandidateKey: left, toCandidateKey: right });
      conflicts.push({ candidateKeys: [left, right], sourceRelationshipRef: ref });
    }
  }
  for (const rollup of analysis.crossSummaryLinkEvidence.feeRollups) {
    const ref: CanonicalRef = { kind: "fee_rollup", id: rollup.id };
    const draft = rollup.status === "unresolved"
      ? baseDraft(`rollup:${rollup.id}`, ref, "calculation", "canonical_fee_rollup_unresolved", period)
      : observedDraft(`rollup:${rollup.id}`, ref, "calculation", "canonical_fee_rollup_record", period, "deterministic_calculation");
    draft.evidenceRefs = sortedUnique(rollup.roundingEvidenceRefs);
    draft.canonicalRefs = [
      { kind: "fee_control", id: rollup.grandControlRef },
      ...rollup.sectionControlRefs.map((id): CanonicalRef => ({ kind: "fee_control", id })),
    ];
    drafts.push(draft);
  }
  return createF1ClaimGraph(analysis, drafts, edges, conflicts);
}

export function buildF1ShadowGraph(analysis: CanonicalStatementAnalysis): F1ShadowResult {
  try {
    const graph = buildF1ClaimGraphFromCanonical(analysis);
    const classified = analysis.feeOwnershipActionability.rowClassifications;
    const diagnostic: F1ShadowDiagnostic = {
      status: "available", graphId: graph.graphId, claimCount: graph.claims.length,
      unknownClaimCount: graph.claims.filter((item) => item.value.kind === "unknown").length,
      conflictCount: graph.conflicts.length,
      legacyComparison: {
        selectedOwnershipRowsNotAdjudicatedByF1: classified.filter((item) =>
          item.selected.ownership.collector !== "unknown"
          || item.selected.ownership.economicBeneficiary !== "unknown"
          || item.selected.ownership.contractualController !== "unknown").length,
        selectedPotentiallyActionableRowsNotAdjudicatedByF1: classified.filter((item) => item.selected.actionabilityCeiling === "potentially_actionable").length,
      },
      failureCode: null,
    };
    return { status: "available", graph, diagnostic };
  } catch {
    return {
      status: "unavailable", graph: null,
      diagnostic: {
        status: "unavailable", graphId: null, claimCount: 0, unknownClaimCount: 0, conflictCount: 0,
        legacyComparison: { selectedOwnershipRowsNotAdjudicatedByF1: 0, selectedPotentiallyActionableRowsNotAdjudicatedByF1: 0 },
        failureCode: "invalid_canonical_or_graph",
      },
    };
  }
}
