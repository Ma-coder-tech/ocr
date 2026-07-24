import type { AnnualizationBasis, OpportunitySummary, ReportFinding } from "./types.js";
import { round2 } from "./utils.js";

export type OpportunityAggregationResult = {
  opportunitySummary: OpportunitySummary;
  findings: ReportFinding[];
};

export function aggregateOpportunity(findings: ReportFinding[]): OpportunityAggregationResult {
  const sorted = [...findings].sort((left, right) => {
    const impactDelta = annualImpact(right) - annualImpact(left);
    return impactDelta !== 0 ? impactDelta : left.id.localeCompare(right.id);
  });

  const included = new Set<string>();
  const excluded = new Set<string>();
  const usedAggregationKeys = new Set<string>();
  const superseded = new Set<string>();
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

    if (!eligibleForOpportunity(finding) || superseded.has(finding.id)) {
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
    for (const childId of finding.supersedesFindingIds ?? []) {
      if (childId !== finding.id) {
        superseded.add(childId);
        included.delete(childId);
        excluded.add(childId);
      }
    }

    if (finding.impactClassification === "deterministic") {
      deterministicAnnual += impact;
    } else {
      estimatedAnnual += impact;
    }
    annualizationBasis = mergeAnnualizationBasis(annualizationBasis, basisFor(finding));
  }

  const includedFindingIds = [...included].sort();
  const excludedFindingIds = [...new Set([...excluded, ...findings.filter((finding) => !included.has(finding.id)).map((finding) => finding.id)])].sort();
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
