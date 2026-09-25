import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePdfBytes } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { toPublicReportSummary } from "../src/publicReport.js";
import { buildSingleStatementCustomerReport } from "../src/reporting/index.js";
import { buildSingleStatementReportV1 } from "../src/reporting/v1/index.js";
import { customerFinancialsAuthorized } from "../src/customerFinancialAuthority.js";

const files = [
  "Nov_2024_Statement.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
] as const;
const print = console.log;
console.log = () => {};
const results = [];
for (const file of files) {
  const bytes = await readFile(path.join(process.cwd(), "test/fixtures/pdfs", file));
  const document = await parsePdfBytes(bytes);
  const internal = analyzeStatementDocument(document, "other", { sourceFileName: file });
  const authorized = customerFinancialsAuthorized(internal);
  const after = toPublicReportSummary(internal);
  const before = {
    totalVolume: internal.totalVolume, totalFees: internal.totalFees,
    effectiveRate: internal.effectiveRate,
    estimatedAnnualSavings: internal.estimatedAnnualSavings,
    benchmark: internal.benchmark,
  };
  const customer = buildSingleStatementCustomerReport({ kind: "single_statement_result",
    analysis: internal });
  let reportV1State: string | null = null;
  let reportV1Error: string | null = null;
  try {
    reportV1State = buildSingleStatementReportV1({ analysis: internal,
      reportId: `authority-diff:${file}`, generatedAt: "2026-09-25T00:00:00.000Z",
      sourceFileName: file }).reportState.code;
  } catch (error) {
    reportV1Error = error instanceof Error ? error.message : String(error);
  }
  if (authorized) {
    assert.equal(after?.totalVolume, before.totalVolume);
    assert.equal(after?.totalFees, before.totalFees);
    assert.equal(after?.effectiveRate, before.effectiveRate);
    assert.equal(after?.estimatedAnnualSavings, before.estimatedAnnualSavings);
  } else {
    assert.equal(after, undefined);
    assert.equal(customer.buildState, "blocked");
    assert.equal(customer.savings.annualAmount, 0);
    assert.equal(reportV1State, "unable_to_analyze");
  }
  results.push({ file, decision: { reportable: internal.parserDecision?.reportable ?? null,
    customerFacingTotalsAllowed: internal.parserDecision?.validationState?.customerFacingTotalsAllowed ?? null },
  authorized, internalObservationBeforeAndAfter: before,
  publicBefore: before,
  publicAfter: after ? { totalVolume: after.totalVolume, totalFees: after.totalFees,
    effectiveRate: after.effectiveRate, estimatedAnnualSavings: after.estimatedAnnualSavings,
    benchmark: after.benchmark } : null,
  customerReport: { buildState: customer.buildState, visibleMetricCount: customer.metrics.length,
    annualSavings: customer.savings.annualAmount },
  reportV1: { state: reportV1State, existingProjectionError: reportV1Error } });
}
print(JSON.stringify({ comparison: "customer_projection_only_internal_observation_unchanged",
  cases: results.length, nonreportable: results.filter((item) => !item.authorized).length,
  reportable: results.filter((item) => item.authorized).length,
  newlyGrantedFinancialOutputs: 0, results }, null, 2));
