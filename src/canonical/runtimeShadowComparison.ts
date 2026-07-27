import type { AnalysisSummary } from "../types.js";
import type { CanonicalCustomerPermissionDecision, CanonicalStatementAnalysis, MoneyAmount } from "./types.js";
import type { RedactedCanonicalShadowDiagnostic } from "./runtimeShadowRedaction.js";

export type CanonicalShadowComparisonCategory =
  | "expected_improvement"
  | "known_legacy_defect"
  | "canonical_regression"
  | "requires_human_review";

export type CanonicalShadowDifference = {
  key: string;
  category: CanonicalShadowComparisonCategory;
  reasonCode: string;
  legacy: unknown;
  canonical: unknown;
};

export function compareCanonicalToLegacy(input: {
  canonical: CanonicalStatementAnalysis;
  legacy: AnalysisSummary;
}): RedactedCanonicalShadowDiagnostic["comparison"] {
  const differences: CanonicalShadowDifference[] = [];
  compareField(differences, {
    key: "core.processed_sales",
    reasonCode: "core_total_availability_or_value_differs",
    legacy: moneyCents(input.legacy.totalVolume),
    canonical: moneyOrNull(input.canonical.financialFacts.processedSales.value, "processed_sales"),
    category: "requires_human_review",
  });
  compareField(differences, {
    key: "core.total_fees",
    reasonCode: "core_total_availability_or_value_differs",
    legacy: moneyCents(input.legacy.totalFees),
    canonical: moneyOrNull(input.canonical.financialFacts.totalFees.value, "total_fees"),
    category: "requires_human_review",
  });
  compareField(differences, {
    key: "transactions.primary_count_available",
    reasonCode: "transaction_count_availability_differs",
    legacy: Number.isFinite((input.legacy as any).transactionCount) ? "available" : "unavailable",
    canonical: transactionCountAvailable(input.canonical) ? "available" : "unavailable",
    category: "requires_human_review",
  });
  compareField(differences, {
    key: "effective_rate.basis",
    reasonCode: "effective_rate_basis_differs",
    legacy: input.legacy.effectiveRate > 0 ? "legacy_summary_percent" : "unavailable",
    canonical: input.canonical.financialFacts.effectiveRateBasis.rateSource,
    category: "expected_improvement",
  });
  compareField(differences, {
    key: "fees.unique_row_count",
    reasonCode: "fee_inventory_count_differs",
    legacy: input.legacy.feeBreakdown.length,
    canonical: input.canonical.feeLedger.rows.filter((row) => row.contributesToUniqueTotal).length,
    category: "requires_human_review",
  });
  const legacyDuplicateAliases = duplicateLegacyFeeAliasCount(input.legacy);
  compareField(differences, {
    key: "fees.duplicate_legacy_aliases",
    reasonCode: "duplicate_legacy_fee_aliases_detected",
    legacy: legacyDuplicateAliases,
    canonical: input.canonical.feeLedger.rows.filter((row) => row.mergeReason !== null).length,
    category: legacyDuplicateAliases > 0 ? "known_legacy_defect" : "requires_human_review",
  });
  compareField(differences, {
    key: "fees.unique_total",
    reasonCode: "fee_inventory_total_differs",
    legacy: moneyCents(input.legacy.feeBreakdown.reduce((sum, row) => sum + safeNumber(row.amount), 0)),
    canonical: moneyOrNull(input.canonical.feeLedger.uniqueChargeTotal, "canonical_unique_fee_total"),
    category: "requires_human_review",
  });
  compareField(differences, {
    key: "opportunity.legacy_savings_rejected",
    reasonCode: "legacy_savings_not_admitted_to_canonical_total",
    legacy: moneyCents(input.legacy.estimatedAnnualSavings),
    canonical: {
      deterministicEligibleAnnual: purposeMoney(input.canonical.opportunityEngine.summary.deterministicEligibleAnnualAmount, "deterministic_eligible_annual"),
      approvedEstimatedAnnual: purposeMoney(input.canonical.opportunityEngine.summary.approvedEstimatedAnnualAmount, "approved_estimated_annual"),
    },
    category: input.legacy.estimatedAnnualSavings > 0 ? "expected_improvement" : "requires_human_review",
  });
  compareField(differences, {
    key: "benchmark.position",
    reasonCode: "benchmark_position_or_availability_differs",
    legacy: input.legacy.benchmark.status,
    canonical: input.canonical.customerState.rateComparison.position,
    category: input.canonical.customerState.rateComparison.status === "unavailable" ? "expected_improvement" : "requires_human_review",
  });
  compareField(differences, {
    key: "customer_state.primary",
    reasonCode: "state_model_differs",
    legacy: "legacy_report_v1_state_model",
    canonical: input.canonical.customerState.primaryState,
    category: "expected_improvement",
  });
  compareField(differences, {
    key: "permissions.decisions",
    reasonCode: "canonical_permissions_available",
    legacy: "unavailable",
    canonical: permissionDecisionCounts(input.canonical.customerState.permissions),
    category: "expected_improvement",
  });
  compareField(differences, {
    key: "actions.type_counts",
    reasonCode: "canonical_action_guidance_available",
    legacy: "legacy_action_text",
    canonical: actionGuidanceTypeCounts(input.canonical),
    category: "expected_improvement",
  });
  compareField(differences, {
    key: "explanation.readiness",
    reasonCode: "canonical_explanation_readiness_available",
    legacy: "legacy_text",
    canonical: input.canonical.customerState.explanation.source,
    category: "expected_improvement",
  });

  const sorted = differences.sort((left, right) => `${left.category}:${left.key}`.localeCompare(`${right.category}:${right.key}`));
  return {
    categories: {
      expected_improvement: sorted.filter((item) => item.category === "expected_improvement").length,
      known_legacy_defect: sorted.filter((item) => item.category === "known_legacy_defect").length,
      canonical_regression: sorted.filter((item) => item.category === "canonical_regression").length,
      requires_human_review: sorted.filter((item) => item.category === "requires_human_review").length,
    },
    differences: sorted,
  };
}

function compareField(
  differences: CanonicalShadowDifference[],
  item: CanonicalShadowDifference,
): void {
  if (JSON.stringify(item.legacy) === JSON.stringify(item.canonical)) return;
  differences.push(item);
}

function transactionCountAvailable(analysis: CanonicalStatementAnalysis): boolean {
  const counts = analysis.financialFacts.transactionCounts;
  return [
    counts.submittedTransactions,
    counts.settledTransactions,
    counts.authorizations,
    counts.captures,
    counts.networkTransactions,
    counts.auditSpecificCounts,
  ].some((fact) => fact.value !== null);
}

function permissionDecisionCounts(permissions: CanonicalCustomerPermissionDecision[]): { permitted: number; denied: number } {
  return {
    permitted: permissions.filter((permission) => permission.permitted).length,
    denied: permissions.filter((permission) => !permission.permitted).length,
  };
}

function actionGuidanceTypeCounts(analysis: CanonicalStatementAnalysis): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of analysis.customerState.actionGuidance) {
    counts[action.actionType] = (counts[action.actionType] ?? 0) + 1;
  }
  return sortedRecord(counts);
}

function moneyOrNull(value: MoneyAmount | null, purpose: string): { amountMinor: number; currency: "USD"; purpose: string } | "unavailable" {
  return value ? purposeMoney(value, purpose) : "unavailable";
}

function moneyCents(value: number): { amountMinor: number; currency: "USD"; purpose: string } | "unavailable" {
  if (!Number.isFinite(value)) return "unavailable";
  return { amountMinor: Math.round(value * 100), currency: "USD", purpose: "legacy_aggregate_comparison" };
}

function purposeMoney(value: MoneyAmount, purpose: string): { amountMinor: number; currency: "USD"; purpose: string } {
  return { amountMinor: value.amountMinor, currency: value.currency, purpose };
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function duplicateLegacyFeeAliasCount(legacy: AnalysisSummary): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of legacy.feeBreakdown) {
    const key = `${String(row.label ?? "").trim().toLowerCase()}|${Math.round(safeNumber(row.amount) * 100)}`;
    if (!key || key === "|0") continue;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function sortedRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}
