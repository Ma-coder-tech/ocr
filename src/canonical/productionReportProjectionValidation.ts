import type { ProductionReportProjection, ProductionReportProjectionValidation } from "./productionReportProjectionTypes.js";

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
    if (!report.hero.effectiveRate) errors.push("Reportable experience requires an effective-rate hero.");
    if (report.snapshot.processedSales.amountMinor <= 0) errors.push("Reportable experience requires positive processed sales.");
    if (report.snapshot.totalFees.amountMinor < 0) errors.push("Reportable experience requires a safe fee total.");
    const represented = report.composition.categories.reduce((sum, category) => sum + category.amount.amountMinor, 0);
    if (represented !== report.composition.representedTotal.amountMinor) errors.push("Composition categories do not reconstruct represented total.");
    if (report.composition.difference.amountMinor !== report.composition.statementFeeTotal.amountMinor - represented) {
      errors.push("Composition difference does not reconstruct from the statement total.");
    }
    if (report.openQuestions.items.some((question) => question.amountIsSavings !== false)) errors.push("Amounts under review must never be savings.");
    if (report.hero.benchmark && report.hero.benchmark.range.low > report.hero.benchmark.range.high) errors.push("Benchmark range is invalid.");
    if (report.continuation.callToAction.implemented || report.saveReport.capabilities.some((capability) => capability.implemented)) {
      errors.push("Planned capabilities cannot be presented as implemented.");
    }
    if (projection.experience === "analysis_completed" && report.openQuestions.items.length > 0) errors.push("Completed experience cannot contain open questions.");
    if (projection.experience === "analysis_available_with_open_questions" && report.openQuestions.items.length === 0) {
      errors.push("Open-questions experience requires at least one question.");
    }
  }
  const customerText = JSON.stringify({ header: projection.header, recovery: projection.recovery, report: projection.report });
  for (const pattern of FORBIDDEN_CUSTOMER_LANGUAGE) if (pattern.test(customerText)) errors.push(`Customer projection contains forbidden internal language: ${pattern.source}`);
  if (/benchmark.{0,60}(?:saving|overpay)|(?:saving|overpay).{0,60}benchmark/i.test(customerText)) {
    errors.push("Benchmark context must not create savings or overpayment language.");
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
