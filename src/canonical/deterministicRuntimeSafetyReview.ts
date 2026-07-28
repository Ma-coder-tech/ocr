import {
  CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
  isSuccessfulAiCapabilityStatus,
} from "./aiCapabilityTypes.js";
import { coreFactsUnsafe } from "./customerStatePolicy.js";
import type { RuntimeAiCapabilitySnapshot } from "./runtimeAiCapabilityAdapter.js";
import type {
  CanonicalAiCapabilityHarnessInput,
} from "./buildCanonicalAiCapabilities.js";
import type {
  CanonicalAiCapabilityStatus,
  CanonicalAiLimitationCode,
  CanonicalRuntimeSafetyReviewCheck,
  CanonicalRuntimeSafetyReviewCheckStatus,
  CanonicalRuntimeSafetyReviewReasonCode,
  CanonicalRuntimeSafetyReviewRecord,
  CanonicalRuntimeSafetyReviewStatus,
  CanonicalStatementAnalysis,
} from "./types.js";

export const CANONICAL_RUNTIME_SAFETY_REVIEW_CHECK_IDS = [
  "canonical_schema_valid",
  "core_facts_safe",
  "effective_rate_basis_safe",
  "fee_ledger_status_safe",
  "fee_ledger_controls_nonblocking",
  "package_d_review_items_preserved",
  "package_e_totals_reconstructed",
  "runtime_anomaly_ai_substitutable",
  "runtime_ai_override_absent",
  "package_g_canonical_derivation_only",
  "shadow_comparison_not_used",
] as const;

export function buildDeterministicRuntimeSafetyReview(input: {
  analysis: CanonicalStatementAnalysis;
  runtimeAiCapabilitySnapshots: readonly RuntimeAiCapabilitySnapshot[];
}): CanonicalRuntimeSafetyReviewRecord {
  const reasonCodes: CanonicalRuntimeSafetyReviewReasonCode[] = ["shadow_comparison_not_used"];
  const limitationCodes: CanonicalAiLimitationCode[] = [];
  const evidenceRefs = new Set<string>();
  const calculationRefs = new Set<string>();
  const validationSafe = input.analysis.validation.status !== "invalid";
  const coreSafe = !coreFactsUnsafe({ financialFacts: input.analysis.financialFacts, identity: input.analysis.identity });
  const anomalyStatus = anomalyRuntimeStatus(input.runtimeAiCapabilitySnapshots);
  const anomalyBlocksSubstitution = anomalyStatus === "failed" || anomalyStatus === "timed_out" || anomalyStatus === "rejected" || anomalyStatus === "safety_blocked";
  const hasBlockedControl = input.analysis.feeLedger.controls.some((control) => control.status === "blocked");
  const hasUnresolvedPackageD = hasUnresolvedClassification(input.analysis);
  const packageESafe = packageETotalsSafe(input.analysis);
  const effectiveRateBasisSafe = effectiveRateSafe(input.analysis);

  if (validationSafe) reasonCodes.push("canonical_schema_valid");
  if (coreSafe) reasonCodes.push("core_facts_safe");
  if (effectiveRateBasisSafe) reasonCodes.push("effective_rate_basis_safe");
  if (packageESafe) reasonCodes.push("package_e_totals_reconstructed");
  reasonCodes.push("package_g_canonical_derivation_only");
  collectCoreRefs(input.analysis, evidenceRefs, calculationRefs);

  if (input.analysis.feeLedger.status === "available") {
    reasonCodes.push("fee_ledger_available");
  } else if (input.analysis.feeLedger.status === "partial") {
    reasonCodes.push("fee_ledger_partial_limitations_explicit");
  } else {
    reasonCodes.push("fee_ledger_unavailable");
  }
  if (hasBlockedControl) reasonCodes.push("fee_ledger_blocked_control");
  if (hasUnresolvedPackageD) reasonCodes.push("package_d_unresolved_classifications_preserved");
  if (hasAppliedOverride(input.runtimeAiCapabilitySnapshots)) reasonCodes.push("runtime_ai_override_blocks_substitution");
  else reasonCodes.push("runtime_ai_override_not_applied");
  reasonCodes.push(anomalyReasonCode(anomalyStatus));

  const status = reviewStatus({
    validationSafe,
    coreSafe,
    ledgerStatus: input.analysis.feeLedger.status,
    hasBlockedControl,
    hasUnresolvedPackageD,
    anomalyBlocksSubstitution,
  });
  const anomalySubstitutionAllowed =
    (anomalyStatus === "absent" || anomalyStatus === "disabled") &&
    (status === "passed" || status === "limited") &&
    validationSafe &&
    coreSafe;

  if (!anomalySubstitutionAllowed && (anomalyStatus === "absent" || anomalyStatus === "disabled")) {
    limitationCodes.push("full_statement_anomaly_review_required");
  }

  const sortedEvidenceRefs = [...evidenceRefs].sort();
  const sortedCalculationRefs = [...calculationRefs].sort();
  const sortedReasonCodes = unique(reasonCodes).sort();
  const sortedLimitationCodes = unique(limitationCodes).sort();
  const checks = deterministicRuntimeSafetyChecks({
    analysis: input.analysis,
    validationSafe,
    coreSafe,
    effectiveRateBasisSafe,
    packageESafe,
    hasBlockedControl,
    hasUnresolvedPackageD,
    anomalyStatus,
    anomalyBlocksSubstitution,
    anomalySubstitutionAllowed,
    evidenceRefs: sortedEvidenceRefs,
    calculationRefs: sortedCalculationRefs,
  });

  return {
    id: "canonical_runtime_safety_review",
    policyVersion: CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
    status,
    checks,
    anomalySubstitutionAllowed,
    anomalySubstitutionProof: anomalySubstitutionAllowed
      ? {
          type: "deterministic_runtime_safety_substitution",
          policyVersion: CANONICAL_RUNTIME_SAFETY_REVIEW_POLICY_VERSION,
          reviewId: "canonical_runtime_safety_review",
          reasonCodes: sortedReasonCodes,
          evidenceRefs: sortedEvidenceRefs,
          calculationRefs: sortedCalculationRefs,
          limitationCodes: sortedLimitationCodes,
        }
      : null,
    aiAuthorityUsed: false,
    financialMutationAllowed: false,
    shadowComparisonUsed: false,
    reasonCodes: sortedReasonCodes,
    limitationCodes: sortedLimitationCodes,
    evidenceRefs: sortedEvidenceRefs,
    calculationRefs: sortedCalculationRefs,
  };
}

export function reconstructDeterministicRuntimeSafetyChecks(
  analysis: CanonicalStatementAnalysis,
  review: CanonicalRuntimeSafetyReviewRecord,
): CanonicalRuntimeSafetyReviewCheck[] {
  const validationSafe = analysis.validation.status !== "invalid";
  const coreSafe = !coreFactsUnsafe({ financialFacts: analysis.financialFacts, identity: analysis.identity });
  const effectiveRateBasisSafe = effectiveRateSafe(analysis);
  const packageESafe = packageETotalsSafe(analysis);
  const hasBlockedControl = analysis.feeLedger.controls.some((control) => control.status === "blocked");
  const hasUnresolvedPackageD = hasUnresolvedClassification(analysis);
  const runtimeReason = review.reasonCodes.includes("runtime_anomaly_ai_disabled")
    ? "runtime_anomaly_ai_disabled"
    : review.reasonCodes.includes("runtime_anomaly_ai_absent")
      ? "runtime_anomaly_ai_absent"
      : review.reasonCodes.includes("runtime_anomaly_ai_failed")
        ? "runtime_anomaly_ai_failed"
        : review.reasonCodes.includes("runtime_anomaly_ai_timed_out")
          ? "runtime_anomaly_ai_timed_out"
          : review.reasonCodes.includes("runtime_anomaly_ai_safety_blocked")
            ? "runtime_anomaly_ai_safety_blocked"
            : review.reasonCodes.includes("runtime_anomaly_ai_rejected")
              ? "runtime_anomaly_ai_rejected"
              : "runtime_anomaly_ai_completed";
  const anomalyBlocksSubstitution =
    runtimeReason === "runtime_anomaly_ai_failed" ||
    runtimeReason === "runtime_anomaly_ai_timed_out" ||
    runtimeReason === "runtime_anomaly_ai_rejected" ||
    runtimeReason === "runtime_anomaly_ai_safety_blocked";
  return deterministicRuntimeSafetyChecks({
    analysis,
    validationSafe,
    coreSafe,
    effectiveRateBasisSafe,
    packageESafe,
    hasBlockedControl,
    hasUnresolvedPackageD,
    anomalyStatus: "absent",
    anomalyReasonCode: runtimeReason,
    anomalyBlocksSubstitution,
    anomalySubstitutionAllowed: review.anomalySubstitutionAllowed,
    evidenceRefs: review.evidenceRefs,
    calculationRefs: review.calculationRefs,
  });
}

export function addDeterministicAnomalySubstitution(input: {
  harnessInputs: readonly CanonicalAiCapabilityHarnessInput[];
  review: CanonicalRuntimeSafetyReviewRecord;
  runtimeAiCapabilitySnapshots: readonly RuntimeAiCapabilitySnapshot[];
}): CanonicalAiCapabilityHarnessInput[] {
  const normalizedStatus = anomalyRuntimeStatus(input.runtimeAiCapabilitySnapshots);
  if (!input.review.anomalySubstitutionAllowed || (normalizedStatus !== "absent" && normalizedStatus !== "disabled")) {
    return [...input.harnessInputs];
  }
  const replacement: CanonicalAiCapabilityHarnessInput = {
    capability: "full_statement_anomaly_review",
    status: "not_needed",
    output: null,
    executionRef: null,
    independentReviewRefs: [],
  };
  return [
    ...input.harnessInputs.filter((item) => item.capability !== "full_statement_anomaly_review"),
    replacement,
  ].sort((left, right) => left.capability.localeCompare(right.capability));
}

type AnomalyRuntimeStatus = CanonicalAiCapabilityStatus | "absent";

function anomalyRuntimeStatus(snapshots: readonly RuntimeAiCapabilitySnapshot[]): AnomalyRuntimeStatus {
  return snapshots.find((snapshot) => snapshot.capability === "full_statement_anomaly_review")?.normalizedStatus ?? "absent";
}

function anomalyReasonCode(status: AnomalyRuntimeStatus): CanonicalRuntimeSafetyReviewReasonCode {
  if (status === "absent") return "runtime_anomaly_ai_absent";
  if (status === "disabled") return "runtime_anomaly_ai_disabled";
  if (status === "completed" || status === "not_needed") return "runtime_anomaly_ai_completed";
  if (status === "failed") return "runtime_anomaly_ai_failed";
  if (status === "timed_out") return "runtime_anomaly_ai_timed_out";
  if (status === "safety_blocked") return "runtime_anomaly_ai_safety_blocked";
  return "runtime_anomaly_ai_rejected";
}

function reviewStatus(input: {
  validationSafe: boolean;
  coreSafe: boolean;
  ledgerStatus: CanonicalStatementAnalysis["feeLedger"]["status"];
  hasBlockedControl: boolean;
  hasUnresolvedPackageD: boolean;
  anomalyBlocksSubstitution: boolean;
}): CanonicalRuntimeSafetyReviewStatus {
  if (!input.validationSafe || !input.coreSafe || input.anomalyBlocksSubstitution || input.hasBlockedControl) return "withheld";
  if (input.ledgerStatus === "unavailable") return "unavailable";
  if (input.ledgerStatus === "partial" || input.hasUnresolvedPackageD) return "limited";
  return "passed";
}

function deterministicRuntimeSafetyChecks(input: {
  analysis: CanonicalStatementAnalysis;
  validationSafe: boolean;
  coreSafe: boolean;
  effectiveRateBasisSafe: boolean;
  packageESafe: boolean;
  hasBlockedControl: boolean;
  hasUnresolvedPackageD: boolean;
  anomalyStatus: AnomalyRuntimeStatus;
  anomalyReasonCode?: CanonicalRuntimeSafetyReviewReasonCode;
  anomalyBlocksSubstitution: boolean;
  anomalySubstitutionAllowed: boolean;
  evidenceRefs: string[];
  calculationRefs: string[];
}): CanonicalRuntimeSafetyReviewCheck[] {
  const ledgerReason =
    input.analysis.feeLedger.status === "available"
      ? "fee_ledger_available"
      : input.analysis.feeLedger.status === "partial"
        ? "fee_ledger_partial_limitations_explicit"
        : "fee_ledger_unavailable";
  const anomalyReason = input.anomalyReasonCode ?? anomalyReasonCode(input.anomalyStatus);
  return [
    check("canonical_schema_valid", input.validationSafe ? "pass" : "withheld", "canonical_schema_valid", input.evidenceRefs, input.calculationRefs),
    check("core_facts_safe", input.coreSafe ? "pass" : "withheld", "core_facts_safe", input.evidenceRefs, input.calculationRefs),
    check("effective_rate_basis_safe", input.effectiveRateBasisSafe ? "pass" : "withheld", "effective_rate_basis_safe", input.evidenceRefs, input.calculationRefs),
    check(
      "fee_ledger_status_safe",
      input.analysis.feeLedger.status === "available" ? "pass" : input.analysis.feeLedger.status === "partial" ? "limited" : "unavailable",
      ledgerReason,
      input.evidenceRefs,
      input.calculationRefs,
    ),
    check(
      "fee_ledger_controls_nonblocking",
      input.hasBlockedControl ? "withheld" : input.analysis.feeLedger.status === "partial" ? "limited" : input.analysis.feeLedger.status === "unavailable" ? "unavailable" : "pass",
      input.hasBlockedControl ? "fee_ledger_blocked_control" : ledgerReason,
      input.evidenceRefs,
      input.calculationRefs,
    ),
    check(
      "package_d_review_items_preserved",
      input.hasUnresolvedPackageD ? "limited" : "pass",
      input.hasUnresolvedPackageD ? "package_d_unresolved_classifications_preserved" : "package_g_canonical_derivation_only",
      input.evidenceRefs,
      [],
    ),
    check("package_e_totals_reconstructed", input.packageESafe ? "pass" : "withheld", "package_e_totals_reconstructed", input.evidenceRefs, input.calculationRefs),
    check(
      "runtime_anomaly_ai_substitutable",
      input.anomalySubstitutionAllowed ? "pass" : input.anomalyBlocksSubstitution ? "withheld" : isRuntimeAnomalyAbsentOrDisabled(anomalyReason) ? "withheld" : "not_applicable",
      anomalyReason,
      [],
      [],
    ),
    check(
      "runtime_ai_override_absent",
      input.anomalyReasonCode === "runtime_anomaly_ai_safety_blocked" || input.anomalyStatus === "safety_blocked" ? "withheld" : "pass",
      input.anomalyReasonCode === "runtime_anomaly_ai_safety_blocked" || input.anomalyStatus === "safety_blocked"
        ? "runtime_ai_override_blocks_substitution"
        : "runtime_ai_override_not_applied",
      [],
      [],
    ),
    check("package_g_canonical_derivation_only", "pass", "package_g_canonical_derivation_only", [], []),
    check("shadow_comparison_not_used", "pass", "shadow_comparison_not_used", [], []),
  ];
}

function check(
  checkId: CanonicalRuntimeSafetyReviewCheck["checkId"],
  status: CanonicalRuntimeSafetyReviewCheckStatus,
  reasonCode: CanonicalRuntimeSafetyReviewReasonCode,
  evidenceRefs: string[],
  calculationRefs: string[],
): CanonicalRuntimeSafetyReviewCheck {
  return {
    checkId,
    status,
    reasonCode,
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    calculationRefs: [...new Set(calculationRefs)].sort(),
  };
}

function isRuntimeAnomalyAbsentOrDisabled(reason: CanonicalRuntimeSafetyReviewReasonCode): boolean {
  return reason === "runtime_anomaly_ai_absent" || reason === "runtime_anomaly_ai_disabled";
}

function effectiveRateSafe(analysis: CanonicalStatementAnalysis): boolean {
  return (
    analysis.financialFacts.rateRevealCalculatedAllInRate.status === "selected" &&
    analysis.financialFacts.rateRevealCalculatedAllInRate.value !== null &&
    analysis.financialFacts.effectiveRateBasis.numeratorFeeBasis !== "unsupported" &&
    analysis.financialFacts.effectiveRateBasis.denominatorVolumeBasis !== "unsupported" &&
    analysis.financialFacts.effectiveRateBasis.populationCompatibility !== "incompatible"
  );
}

function packageETotalsSafe(analysis: CanonicalStatementAnalysis): boolean {
  if (analysis.opportunityEngine.status === "unavailable") return false;
  return analysis.opportunityEngine.components.every((component) => {
    if (component.eligibility === "verification_only" || component.eligibility === "excluded") return component.inclusionStatus !== "included";
    return true;
  });
}

function hasUnresolvedClassification(analysis: CanonicalStatementAnalysis): boolean {
  return analysis.feeOwnershipActionability.rowClassifications.some(
    (row) =>
      row.selected.category === "unknown_needs_review" ||
      row.selected.ownership.economicBeneficiary === "unknown" ||
      row.selected.actionabilityCeiling === "unknown" ||
      row.conflictStatus === "unresolved" ||
      row.conflictStatus === "requires_human_review",
  );
}

function hasAppliedOverride(snapshots: readonly RuntimeAiCapabilitySnapshot[]): boolean {
  return snapshots.some(
    (snapshot) =>
      snapshot.capability === "full_statement_anomaly_review" &&
      (snapshot.normalizedStatus === "safety_blocked" || (snapshot.safeCounts.appliedOverrideCount ?? 0) > 0),
  );
}

function collectCoreRefs(
  analysis: CanonicalStatementAnalysis,
  evidenceRefs: Set<string>,
  calculationRefs: Set<string>,
): void {
  for (const fact of [
    analysis.identity.statementPeriod,
    analysis.financialFacts.processedSales,
    analysis.financialFacts.totalFees,
    analysis.financialFacts.rateRevealCalculatedAllInRate,
  ]) {
    for (const evidenceRef of fact.evidenceRefs) evidenceRefs.add(evidenceRef);
    if (fact.calculationRef) calculationRefs.add(fact.calculationRef);
  }
  for (const control of analysis.feeLedger.controls) {
    for (const evidenceRef of control.evidenceRefs) evidenceRefs.add(evidenceRef);
  }
  if (analysis.feeLedger.uniqueChargeCalculationRef) calculationRefs.add(analysis.feeLedger.uniqueChargeCalculationRef);
  for (const calculationRef of analysis.opportunityEngine.summary.summaryCalculationRefs) calculationRefs.add(calculationRef);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
