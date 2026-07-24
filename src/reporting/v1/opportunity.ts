import type { AnnualizationBasis, OpportunitySummary, ReportFinding } from "./types.js";
import { round2 } from "./utils.js";

export type OpportunityAggregationResult = {
  opportunitySummary: OpportunitySummary;
  findings: ReportFinding[];
};

export function aggregateOpportunity(findings: ReportFinding[]): OpportunityAggregationResult {
  const graph = resolveSupersessionGraph(findings);
  const sorted = [...findings].sort((left, right) => {
    const impactDelta = annualImpact(right) - annualImpact(left);
    return impactDelta !== 0 ? impactDelta : left.id.localeCompare(right.id);
  });

  const included = new Set<string>();
  const excluded = new Set<string>();
  const usedAggregationKeys = new Set<string>();
  let deterministicAnnual = 0;
  let estimatedAnnual = 0;
  let verificationMonthly = 0;
  let verificationAnnualized: number | null = null;
  let annualizationBasis: AnnualizationBasis = "none";

  for (const finding of sorted) {
    if (finding.impactClassification === "verification_only") {
      verificationMonthly += finding.currentMonthlyAmountUsd ?? 0;
      if (finding.currentAnnualizedAmountUsd !== null) {
        verificationAnnualized = round2((verificationAnnualized ?? 0) + finding.currentAnnualizedAmountUsd);
      }
      excluded.add(finding.id);
      continue;
    }

    if (!eligibleForOpportunity(finding) || graph.excludedFromGraph.has(finding.id)) {
      excluded.add(finding.id);
      continue;
    }

    const aggregationKey = finding.aggregationKey ?? finding.id;
    if (usedAggregationKeys.has(aggregationKey)) {
      excluded.add(finding.id);
      continue;
    }

    const impact = annualImpact(finding);
    if (impact <= 0) {
      excluded.add(finding.id);
      continue;
    }

    included.add(finding.id);
    usedAggregationKeys.add(aggregationKey);

    if (finding.impactClassification === "deterministic") {
      deterministicAnnual += impact;
    } else {
      estimatedAnnual += impact;
    }
    annualizationBasis = mergeAnnualizationBasis(annualizationBasis, basisFor(finding));
  }

  const includedFindingIds = [...included].sort();
  const excludedFindingIds = [...new Set([...excluded, ...graph.excludedFromGraph, ...findings.filter((finding) => !included.has(finding.id)).map((finding) => finding.id)])].sort();
  const updatedFindings = findings.map((finding) => ({
    ...finding,
    includedInOpportunityTotal: included.has(finding.id),
  }));

  return {
    findings: updatedFindings,
    opportunitySummary: {
      deterministicMonthlyImpactUsd: round2(deterministicAnnual / 12),
      deterministicAnnualImpactUsd: round2(deterministicAnnual),
      estimatedMonthlyOpportunityUsd: round2(estimatedAnnual / 12),
      estimatedAnnualOpportunityUsd: round2(estimatedAnnual),
      totalEligibleMonthlyOpportunityUsd: round2((deterministicAnnual + estimatedAnnual) / 12),
      totalEligibleAnnualOpportunityUsd: round2(deterministicAnnual + estimatedAnnual),
      verificationMonthlyAmountUsd: round2(verificationMonthly),
      verificationAnnualizedAmountUsd: verificationAnnualized,
      currency: "USD",
      annualizationBasis,
      includedFindingIds,
      excludedFindingIds: excludedFindingIds.filter((id) => !included.has(id)),
    },
  };
}

function resolveSupersessionGraph(findings: ReportFinding[]): { excludedFromGraph: Set<string> } {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const invalid = new Set<string>();
  const edges = new Map<string, string[]>();

  for (const finding of findings) {
    const childIds = [...new Set(finding.supersedesFindingIds ?? [])].filter((childId) => childId !== finding.id);
    const validChildren: string[] = [];
    for (const childId of childIds) {
      if (!byId.has(childId)) {
        invalid.add(finding.id);
      } else {
        validChildren.push(childId);
      }
    }
    edges.set(finding.id, validChildren);
  }

  const circular = findCircularNodes(edges);
  const superseded = new Set<string>();
  const memo = new Map<string, Set<string>>();

  function collect(nodeId: string): Set<string> {
    if (memo.has(nodeId)) return memo.get(nodeId)!;
    const collected = new Set<string>();
    if (invalid.has(nodeId) || circular.has(nodeId)) {
      memo.set(nodeId, collected);
      return collected;
    }
    for (const childId of edges.get(nodeId) ?? []) {
      if (invalid.has(childId) || circular.has(childId)) continue;
      collected.add(childId);
      for (const descendantId of collect(childId)) collected.add(descendantId);
    }
    memo.set(nodeId, collected);
    return collected;
  }

  for (const finding of findings) {
    if (invalid.has(finding.id) || circular.has(finding.id)) continue;
    for (const childId of collect(finding.id)) superseded.add(childId);
  }

  return { excludedFromGraph: new Set([...invalid, ...circular, ...superseded]) };
}

function findCircularNodes(edges: Map<string, string[]>): Set<string> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const circular = new Set<string>();

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      for (const cycleNode of stack.slice(start)) circular.add(cycleNode);
      circular.add(nodeId);
      return;
    }

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const childId of edges.get(nodeId) ?? []) visit(childId);
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const nodeId of edges.keys()) visit(nodeId);
  return circular;
}

function eligibleForOpportunity(finding: ReportFinding): boolean {
  if (finding.confidence === "low") return false;
  if (finding.impactClassification === "verification_only" || finding.impactClassification === "non_financial") return false;
  if (finding.overlapRisk === "possible") return false;
  if (finding.cadence === "one_time" || finding.cadence === "unknown") return false;
  if (!finding.calculationRef) return false;
  return annualImpact(finding) > 0;
}

function annualImpact(finding: ReportFinding): number {
  if (finding.estimatedAnnualImpactUsd !== null && Number.isFinite(finding.estimatedAnnualImpactUsd)) return Math.max(0, finding.estimatedAnnualImpactUsd);
  if (finding.currentAnnualizedAmountUsd !== null && Number.isFinite(finding.currentAnnualizedAmountUsd)) return Math.max(0, finding.currentAnnualizedAmountUsd);
  if (finding.cadence === "monthly" && finding.estimatedMonthlyImpactUsd !== null && Number.isFinite(finding.estimatedMonthlyImpactUsd)) {
    return Math.max(0, finding.estimatedMonthlyImpactUsd * 12);
  }
  if (finding.cadence === "monthly" && finding.currentMonthlyAmountUsd !== null && Number.isFinite(finding.currentMonthlyAmountUsd)) {
    return Math.max(0, finding.currentMonthlyAmountUsd * 12);
  }
  return 0;
}

function basisFor(finding: ReportFinding): AnnualizationBasis {
  if (finding.impactClassification === "estimated" && finding.sourceFindingType.includes("benchmark")) return "modeled_future_volume";
  if (finding.cadence === "monthly") return "monthly_charge_times_12";
  return "none";
}

function mergeAnnualizationBasis(current: AnnualizationBasis, next: AnnualizationBasis): AnnualizationBasis {
  if (current === "none") return next;
  if (next === "none" || next === current) return current;
  return "mixed";
}
