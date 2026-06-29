import type { ParserConfidence, ParserDecision, ParserValidationLevel, ParserValidationState } from "./parserFoundation.js";
import type { ReconStatus, ReconciliationCheck, ReconciliationResult } from "./reconciliation.js";

export type ParserWarningForDecision = {
  code: string;
  severity: "low" | "medium" | "high";
};

export type BuildParserDecisionInput = {
  reconciliation: Record<string, ReconciliationCheck>;
  reconciliationResults?: ReconciliationResult[];
  feeClassification?: FeeClassificationValidationInput;
  warnings: ParserWarningForDecision[];
  confidence: ParserConfidence;
};

export type FeeClassificationValidationInput = {
  status: string;
  rowCount: number;
  classifiedRowCount: number;
  unresolvedRowCount: number;
  needsUnbundlingRowCount: number;
  totalClassifiedAmount: number;
  printedTotal: number | null;
  delta: number;
};

const REQUIRED_RECONCILIATION_CHECKS = ["fundingFormula", "feeBucketFormula", "effectiveRateFormula"] as const;
const OK_STATUSES = new Set<ReconStatus>(["RECON_OK"]);
const ROUNDING_STATUSES = new Set<ReconStatus>(["RECON_ROUNDING"]);
const WARNING_STATUSES = new Set<ReconStatus>(["RECON_MINOR_BREAK", "RECON_UNREFERENCED_VALUE"]);
const FAILED_STATUSES = new Set<ReconStatus>(["RECON_MATERIAL_BREAK", "RECON_MISSING_INPUT"]);

function resultSeverity(results: ReconciliationResult[], missingLevel: ParserValidationLevel): ParserValidationLevel {
  if (results.length === 0) return missingLevel;
  if (results.some((result) => FAILED_STATUSES.has(result.status))) return "failed";
  if (results.some((result) => WARNING_STATUSES.has(result.status))) return "warning";
  if (results.some((result) => ROUNDING_STATUSES.has(result.status))) return "validated_with_rounding";
  if (results.every((result) => OK_STATUSES.has(result.status))) return "validated";
  return "warning";
}

function resultIds(results: ReconciliationResult[], statuses: Set<ReconStatus>): string[] {
  return results.filter((result) => statuses.has(result.status)).map((result) => result.identity);
}

function feeClassificationLevel(feeClassification: FeeClassificationValidationInput | undefined): ParserValidationLevel {
  if (!feeClassification || feeClassification.status === "not_mapped") return "not_evaluated";
  if (feeClassification.status === "unreconciled") return "failed";
  if (feeClassification.unresolvedRowCount > 0 || feeClassification.needsUnbundlingRowCount > 0) return "warning";
  if (feeClassification.status === "validated_with_rounding_delta") return "validated_with_rounding";
  if (feeClassification.status === "validated") return "validated";
  return "warning";
}

export function buildParserValidationState(
  reconciliationResults: ReconciliationResult[] | undefined,
  feeClassification?: FeeClassificationValidationInput,
): ParserValidationState | undefined {
  if (!reconciliationResults && !feeClassification) return undefined;

  const results = reconciliationResults ?? [];
  const topLevelResults = results.filter(
    (result) =>
      result.identity.startsWith("headline:") ||
      result.identity === "summary_split:month_end_plus_less_discount_eq_total_fees" ||
      result.identity.startsWith("cross_reference:"),
  );
  const feeLedgerResults = results.filter((result) => result.identity.startsWith("fee_detail:"));
  const batchLedgerResults = results.filter(
    (result) => result.identity.startsWith("batch_row:") || result.identity.startsWith("batch_columns:") || result.identity === "summary_split:daily_fee_column_eq_less_discount_paid",
  );
  const orphanResults = results.filter((result) => result.status === "RECON_UNREFERENCED_VALUE");

  const topLevelTotals = resultSeverity(topLevelResults, "missing");
  const feeLedger = resultSeverity(feeLedgerResults, "not_evaluated");
  const batchLedger = resultSeverity(batchLedgerResults, "not_evaluated");
  const feeClassificationLevelResult = feeClassificationLevel(feeClassification);
  const orphanTotals = orphanResults.length > 0 ? "present" : "none";
  const blockingReasons: string[] = [];
  const warningReasons: string[] = [];

  if (topLevelTotals === "failed" || topLevelTotals === "missing") {
    blockingReasons.push("Top-level statement totals did not validate.");
  }
  if (feeLedger === "failed" || feeLedger === "missing") {
    blockingReasons.push("Fee ledger did not validate against printed fee totals.");
  }

  const batchFailures = resultIds(batchLedgerResults, FAILED_STATUSES);
  if (batchFailures.length > 0) {
    warningReasons.push(`Batch ledger has material reconciliation issue(s): ${batchFailures.join(", ")}.`);
  }
  const orphanIds = orphanResults.map((result) => result.identity);
  if (orphanIds.length > 0) {
    warningReasons.push(`Excluded unreferenced candidate total(s): ${orphanIds.join(", ")}.`);
  }
  const feeRounding = resultIds(feeLedgerResults, ROUNDING_STATUSES);
  if (feeRounding.length > 0) {
    warningReasons.push(`Fee ledger reconciles with rounding: ${feeRounding.join(", ")}.`);
  }
  if (feeClassificationLevelResult === "warning" && feeClassification) {
    const reasons = [];
    if (feeClassification.needsUnbundlingRowCount > 0) reasons.push(`${feeClassification.needsUnbundlingRowCount} blended tier row(s) need unbundling`);
    if (feeClassification.unresolvedRowCount > 0) reasons.push(`${feeClassification.unresolvedRowCount} unresolved fee row(s) need review`);
    warningReasons.push(`Fee classification is recorded but not clean for economic split reporting: ${reasons.join("; ")}.`);
  }
  if (feeClassificationLevelResult === "failed") {
    warningReasons.push("Fee classification rows did not reconcile to the printed fee total.");
  }

  const customerFacingTotalsAllowed =
    blockingReasons.length === 0 &&
    (topLevelTotals === "validated" || topLevelTotals === "validated_with_rounding") &&
    (feeLedger === "validated" || feeLedger === "validated_with_rounding" || feeLedger === "not_evaluated");
  const feeLedgerAllowed = feeLedger === "validated" || feeLedger === "validated_with_rounding";
  const batchDetailAllowed = batchLedger === "validated" || batchLedger === "validated_with_rounding";
  const feeClassificationAllowed =
    feeClassificationLevelResult === "validated" || feeClassificationLevelResult === "validated_with_rounding";

  return {
    topLevelTotals,
    feeLedger,
    batchLedger,
    feeClassification: feeClassificationLevelResult,
    orphanTotals,
    customerFacingTotalsAllowed,
    feeLedgerAllowed,
    batchDetailAllowed,
    feeClassificationAllowed,
    blockingReasons,
    warningReasons,
  };
}

export function buildParserDecision(input: BuildParserDecisionInput): ParserDecision {
  const validationState = buildParserValidationState(input.reconciliationResults, input.feeClassification);
  const withValidationState = (decision: Omit<ParserDecision, "validationState">): ParserDecision =>
    validationState ? { ...decision, validationState } : decision;
  const reconciliationEntries = Object.entries(input.reconciliation);
  const missingChecks = REQUIRED_RECONCILIATION_CHECKS.filter((checkName) => !input.reconciliation[checkName]);
  if (missingChecks.length > 0) {
    return withValidationState({
      status: "needs_review",
      confidence: "needs_review",
      reportable: false,
      reason: `Blocked by missing required reconciliation check(s): ${missingChecks.join(", ")}.`,
    });
  }

  if (validationState && !validationState.customerFacingTotalsAllowed) {
    return {
      status: "needs_review",
      confidence: "needs_review",
      reportable: false,
      reason: `Blocked by parser validation state: ${validationState.blockingReasons.join(" ") || "customer-facing totals were not validated."}`,
      validationState,
    };
  }

  const failedChecks = reconciliationEntries.filter(([, check]) => check.status === "fail");
  if (failedChecks.length > 0) {
    return withValidationState({
      status: "needs_review",
      confidence: "needs_review",
      reportable: false,
      reason: `Blocked by failed reconciliation check(s): ${failedChecks.map(([name]) => name).join(", ")}.`,
    });
  }

  const highWarnings = input.warnings.filter((warning) => warning.severity === "high");
  if (highWarnings.length > 0) {
    return withValidationState({
      status: "needs_review",
      confidence: "needs_review",
      reportable: false,
      reason: `Blocked by high-severity parser warning(s): ${highWarnings.map((warning) => warning.code).join(", ")}.`,
    });
  }

  if (input.confidence === "low" || input.confidence === "needs_review") {
    return withValidationState({
      status: "needs_review",
      confidence: input.confidence,
      reportable: false,
      reason: `Blocked by parser confidence level: ${input.confidence}.`,
    });
  }

  const warningChecks = reconciliationEntries.filter(([, check]) => check.status === "warning");
  const caveats = [
    ...warningChecks.map(([name]) => name),
    ...input.warnings.map((warning) => warning.code),
    ...(validationState?.warningReasons ?? []),
  ];
  if (caveats.length > 0 || input.confidence === "medium") {
    return withValidationState({
      status: "accepted_with_warnings",
      confidence: input.confidence,
      reportable: true,
      reason:
        caveats.length > 0
          ? `Accepted with parser caveat(s): ${caveats.join(", ")}.`
          : "Accepted with medium parser confidence.",
    });
  }

  return withValidationState({
    status: "accepted",
    confidence: input.confidence,
    reportable: true,
    reason: "Accepted because required reconciliation checks passed and no parser warnings were raised.",
  });
}
