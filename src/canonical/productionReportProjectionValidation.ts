import type { ProductionReportProjection, ProductionReportProjectionValidation } from "./productionReportProjectionTypes.js";
import type { CanonicalCustomerPermissionKey, CanonicalStatementAnalysis } from "./types.js";

const FORBIDDEN_CUSTOMER_LANGUAGE = [
  /\bitemi[sz](?:e|ed|ation|ing)\b/i,
  /\bevidence boundary\b/i,
  /\bservice-use review\b/i,
  /\bfee inventory\b/i,
  /\bquestions to resolve\b/i,
  /\bPackage\s+[A-Z0-9]\b/i,
  /\bpolicy(?:Version| id| code)?\b/i,
  /\bprompt\b|\b(?:AI|language|foundation|provider) model\b|\bprovider (?:name|transport|response)\b/i,
  /(?:^|\s)(?:\/Users\/|\/private\/|\/tmp\/|[A-Za-z]:\\)/,
  /\b[A-Fa-f0-9]{32,}\b/,
];

export function validateProductionReportProjection(projection: ProductionReportProjection): ProductionReportProjectionValidation {
  const errors: string[] = [];
  if (projection.experience === "unable_to_complete") {
    if (!projection.recovery || projection.report) errors.push("Unable-to-complete experience must contain recovery only.");
  } else {
    if (projection.recovery || !projection.report) errors.push("Reportable experience must contain one report payload and no recovery payload.");
  }
  const report = projection.report;
  if (report) {
    if (report.hero.status === "shown" && !report.hero.effectiveRate) errors.push("Shown effective-rate hero requires an effective rate.");
    if (report.hero.status === "omitted" && (report.hero.effectiveRate || report.hero.benchmark || report.hero.benchmarkUnavailableMessage || report.hero.interpretation || report.hero.primaryNextAction)) {
      errors.push("Omitted effective-rate hero cannot retain customer data.");
    }
    if (report.snapshot.status === "shown" && (report.snapshot.processedSales?.amountMinor ?? 0) <= 0) errors.push("Shown snapshot requires positive processed sales.");
    if (report.snapshot.status === "shown" && (report.snapshot.totalFees?.amountMinor ?? -1) < 0) errors.push("Shown snapshot requires a safe fee total.");
    if (report.snapshot.status === "omitted" && (report.snapshot.processedSales || report.snapshot.totalFees || report.snapshot.transactionCount)) {
      errors.push("Omitted snapshot cannot retain customer data.");
    }
    const represented = report.composition.categories.reduce((sum, category) => sum + category.amount.amountMinor, 0);
    if (report.composition.status === "omitted") {
      if (report.composition.categories.length || report.composition.representedTotal || report.composition.statementFeeTotal || report.composition.difference || report.composition.reconciled !== null) {
        errors.push("Omitted composition cannot retain fee data.");
      }
    } else {
      if (represented !== report.composition.representedTotal?.amountMinor) errors.push("Composition categories do not reconstruct represented total.");
      if (report.composition.difference?.amountMinor !== (report.composition.statementFeeTotal?.amountMinor ?? 0) - represented) {
        errors.push("Composition difference does not reconstruct from the statement total.");
      }
    }
    if (report.openQuestions.items.some((question) => question.amountIsSavings !== false)) errors.push("Amounts under review must never be savings.");
    if (report.hero.benchmark && Number(report.hero.benchmark.range.low) > Number(report.hero.benchmark.range.high)) errors.push("Benchmark range is invalid.");
    if (report.allCharges.status === "omitted" && (report.allCharges.rows.length || report.allCharges.defaultView !== null)) {
      errors.push("Omitted charge inventory cannot retain charge data or a default view.");
    }
    if (report.allCharges.status !== "omitted" && report.allCharges.defaultView === null) errors.push("Visible charge inventory requires a default view.");
    const attentionDefaultRequired = report.allCharges.rows.some((row) => row.disposition === "attention" || row.disposition === "unresolved");
    if (report.allCharges.status !== "omitted" && report.allCharges.defaultView !== (attentionDefaultRequired ? "attention" : "all")) {
      errors.push("Charge inventory default must open to a useful populated view.");
    }
    if (report.trustStrip.items.some((item) => /benchmark|reference/i.test(item.label))) {
      errors.push("Benchmark availability cannot be used as a statement-analysis trust signal.");
    }
    if (report.continuation.callToAction.implemented || report.saveReport.capabilities.some((capability) => capability.implemented)) {
      errors.push("Planned capabilities cannot be presented as implemented.");
    }
    if (projection.experience === "analysis_completed" && (report.openQuestions.items.length > 0 || report.openQuestions.context.length > 0)) {
      errors.push("Completed experience cannot contain open questions or incomplete-review context.");
    }
  }
  const customerText = JSON.stringify({ header: projection.header, recovery: projection.recovery, report: projection.report });
  for (const pattern of FORBIDDEN_CUSTOMER_LANGUAGE) if (pattern.test(customerText)) errors.push(`Customer projection contains forbidden internal language: ${pattern.source}`);
  if (/benchmark.{0,60}(?:saving|overpay)|(?:saving|overpay).{0,60}benchmark/i.test(customerText)) {
    errors.push("Benchmark context must not create savings or overpayment language.");
  }
  if (/\b\d+\s+cents\b/i.test(customerText)) errors.push("Customer projection must not expose raw minor-unit strings.");
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateProductionReportProjectionAgainstCanonical(
  analysis: CanonicalStatementAnalysis,
  projection: ProductionReportProjection,
): ProductionReportProjectionValidation {
  const errors: string[] = [];
  const report = projection.report;
  if (!report) return { valid: true, errors };
  const visible = analysis.customerState.visibility;
  const permitted = (key: CanonicalCustomerPermissionKey) =>
    analysis.customerState.permissions.find((decision) => decision.key === key)?.permitted === true;
  const coreMetrics = visible.showCoreMetrics && permitted("core_metrics");
  const effectiveRate = visible.showEffectiveRate && permitted("effective_rate");
  const benchmark = visible.showBenchmark && permitted("benchmark");
  const feeInventory = visible.showFeeInventory && permitted("fee_inventory");
  const ownership = visible.showOwnershipActionability && permitted("ownership_actionability");
  const evidenceCalculations = visible.showEvidenceCalculations && permitted("evidence_calculations");
  const verificationAmounts = visible.showVerificationAmounts && permitted("verification_amounts");
  const actions = visible.showActions && permitted("actions") && feeInventory && ownership;
  const explanation = visible.showCustomerExplanation && permitted("customer_explanation");

  if (!coreMetrics && (report.snapshot.status !== "omitted" || report.composition.status !== "omitted")) {
    errors.push("Production projection expanded canonical core-metrics visibility.");
  }
  if (!effectiveRate && report.hero.status !== "omitted") errors.push("Production projection expanded canonical effective-rate visibility.");
  if (!benchmark && report.hero.benchmark !== null) errors.push("Production projection expanded canonical benchmark visibility.");
  if (!feeInventory && (report.allCharges.status !== "omitted" || report.composition.status !== "omitted" || report.priorityFindings.status !== "omitted")) {
    errors.push("Production projection expanded canonical fee-inventory visibility.");
  }
  if (!feeInventory && report.openQuestions.items.some((item) => item.id !== "business_qualification_confirmation")) {
    errors.push("Production projection exposed fee-level questions while canonical fee inventory was hidden.");
  }
  if (!ownership) {
    if (report.composition.status !== "omitted" || report.priorityFindings.status !== "omitted") {
      errors.push("Production projection expanded canonical ownership/actionability visibility.");
    }
    if (report.allCharges.rows.some((row) => row.category !== "unclassified" || row.disposition !== "informational")) {
      errors.push("Production projection attached hidden ownership/actionability conclusions to charge rows.");
    }
  }
  if (!evidenceCalculations && report.composition.status !== "omitted") errors.push("Production projection expanded canonical evidence/calculation visibility.");
  if (!verificationAmounts && report.openQuestions.items.some((item) => item.amountUnderReview !== null)) {
    errors.push("Production projection expanded canonical verification-amount visibility.");
  }
  if (!actions && (report.nextActions.status !== "omitted" || report.hero.primaryNextAction !== null)) {
    errors.push("Production projection expanded canonical action visibility.");
  }
  if (!explanation && (
    report.hero.interpretation !== null
    || report.priorityFindings.items.length > 0
    || report.openQuestions.items.length > 0
    || report.openQuestions.context.length > 0
    || report.methodology.disclosures.length > 0
  )) {
    errors.push("Production projection expanded canonical customer-explanation visibility.");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
