import type { AnalysisSummary } from "../../types.js";
import { reconciliationToleranceUsd, singleStatementReportV1Policy, type SingleStatementReportV1Policy } from "./policyConfig.js";
import type { ReconciliationSummary } from "./types.js";
import { calculatedValue, isPositiveFinite, observedValue, round2, unavailableValue } from "./utils.js";

export function normalizeReconciliation(
  summary: AnalysisSummary | undefined,
  options: { evidenceRefs?: string[]; calculationRef?: string; policy?: SingleStatementReportV1Policy } = {},
): ReconciliationSummary {
  const policy = options.policy ?? singleStatementReportV1Policy;
  const evidenceRefs = options.evidenceRefs ?? [];
  const calculationRef = options.calculationRef ?? "calc_reconciliation";

  if (!summary || !isPositiveFinite(summary.totalFees)) {
    return {
      status: "not_available",
      totalFees: unavailableValue("not_verified", "Total fees were not available for reconciliation."),
      classifiedFeesTotal: unavailableValue("not_verified", "Classified fees could not be calculated."),
      unclassifiedAmount: unavailableValue("not_verified", "Unclassified fees could not be calculated."),
      coveragePct: unavailableValue("not_verified", "Coverage could not be calculated."),
      deltaUsd: unavailableValue("not_verified", "Reconciliation delta could not be calculated."),
      toleranceUsd: null,
      reasons: ["Total fees were not available for reconciliation."],
    };
  }

  const totalFees = round2(summary.totalFees);
  const toleranceUsd = round2(reconciliationToleranceUsd(totalFees, policy));
  const fromAnalysis = summary.twoBucketAnalysis;
  const classifiedTotal =
    numberOrNull(fromAnalysis?.cardBrandTotal) !== null || numberOrNull(fromAnalysis?.processorControlledTotal ?? fromAnalysis?.processorOwnedTotal) !== null
      ? round2((numberOrNull(fromAnalysis?.cardBrandTotal) ?? 0) + (numberOrNull(fromAnalysis?.processorControlledTotal ?? fromAnalysis?.processorOwnedTotal) ?? 0))
      : classifiedTotalFromFeeRows(summary);
  const coveragePct =
    numberOrNull(fromAnalysis?.coveragePct) ?? (classifiedTotal !== null && totalFees > 0 ? round2((classifiedTotal / totalFees) * 100) : null);
  const deltaUsd =
    numberOrNull(fromAnalysis?.reconciliationDeltaUsd) !== null
      ? round2(Math.abs(numberOrNull(fromAnalysis?.reconciliationDeltaUsd)!))
      : classifiedTotal !== null
        ? round2(Math.abs(classifiedTotal - totalFees))
        : null;
  const unclassified = classifiedTotal !== null ? round2(Math.max(0, totalFees - classifiedTotal)) : null;

  if (classifiedTotal === null || coveragePct === null || deltaUsd === null) {
    return {
      status: "not_available",
      totalFees: observedValue(totalFees, "high", evidenceRefs),
      classifiedFeesTotal: unavailableValue("not_verified", "Classified fee total could not be calculated."),
      unclassifiedAmount: unavailableValue("not_verified", "Unclassified amount could not be calculated."),
      coveragePct: unavailableValue("not_verified", "Fee classification coverage could not be calculated."),
      deltaUsd: unavailableValue("not_verified", "Reconciliation delta could not be calculated."),
      toleranceUsd,
      reasons: [fromAnalysis?.reason || "Reconciliation could not be attempted from available fee rows."],
    };
  }

  const coveragePasses = coveragePct >= policy.reconciliation.minimumCoveragePct;
  const deltaPasses = deltaUsd <= toleranceUsd;
  const status = coveragePasses && deltaPasses ? "pass" : deltaPasses ? "warning" : "fail";
  const reasons: string[] = [];
  if (!coveragePasses) reasons.push(`Classified fee coverage ${coveragePct.toFixed(2)}% is below the ${policy.reconciliation.minimumCoveragePct}% policy threshold.`);
  if (!deltaPasses) reasons.push(`Classified fees differ from total fees by $${deltaUsd.toFixed(2)}, above the $${toleranceUsd.toFixed(2)} tolerance.`);
  if (reasons.length === 0) reasons.push(fromAnalysis?.reason || "Classified fees reconcile within policy tolerance.");

  return {
    status,
    totalFees: observedValue(totalFees, "high", evidenceRefs),
    classifiedFeesTotal: calculatedValue(classifiedTotal, "high", calculationRef, evidenceRefs),
    unclassifiedAmount: calculatedValue(unclassified ?? 0, "high", calculationRef, evidenceRefs),
    coveragePct: calculatedValue(coveragePct, coveragePasses ? "high" : "medium", calculationRef, evidenceRefs),
    deltaUsd: calculatedValue(deltaUsd, deltaPasses ? "high" : "medium", calculationRef, evidenceRefs),
    toleranceUsd,
    reasons,
  };
}

function classifiedTotalFromFeeRows(summary: AnalysisSummary): number | null {
  let total = 0;
  for (const row of summary.feeBreakdown ?? []) {
    if (!isPositiveFinite(row.amount)) continue;
    if (row.classificationConfidence === "low" || row.feeClass === "unknown" || row.broadType === "Unknown") continue;
    total += row.amount;
  }
  return total > 0 ? round2(total) : null;
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
