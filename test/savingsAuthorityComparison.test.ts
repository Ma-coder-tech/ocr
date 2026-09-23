import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import { buildSingleStatementCustomerReport } from "../src/reporting/buildSingleStatement.js";
import { buildSingleStatementReportV1 } from "../src/reporting/v1/buildReport.js";
import { toPublicReportSummary } from "../src/publicReport.js";
import { buildComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import { buildSupportedFiservSavingsAuthorityComparison } from "../src/claimAuthorityF4/savingsAuthorityComparison.js";

const fixturePath = path.resolve("test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");

describe("supported-Fiserv savings authority comparison", () => {
  it("compares every live savings stream without changing legacy or canonical output", async () => {
    const document = await parsePdf(fixturePath);
    const summary = analyzeStatementDocument(document, "restaurant_food_beverage", {
      sourceFileName: path.basename(fixturePath),
    });
    const legacyBefore = structuredClone(summary);
    const customerBefore = buildSingleStatementCustomerReport({
      kind: "single_statement_result",
      analysis: summary,
      context: { unlocked: true },
    });
    const publicBefore = toPublicReportSummary(summary);
    const multiBefore = buildComparisonStatementInput(summary);
    const reportV1Before = buildSingleStatementReportV1({
      analysis: summary,
      reportId: "savings_authority_test",
      generatedAt: "2000-01-01T00:00:00.000Z",
    });

    const result = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "savings_authority_test",
      legacySummary: summary,
    });
    const comparison = result.internalSupportedFiservSavingsAuthorityComparison;

    expect(comparison).toMatchObject({
      version: "supported_fiserv_savings_authority_comparison_v1",
      standing: "internal_diagnostic_only",
      semanticAuthority: "claim_authority_f4",
      status: "available",
      supportedFiserv: true,
      exposure: {
        publicApiSavingsExposed: true,
        persistedLegacySummaryContainsSavings: true,
        contributesSavingsInputToMultiStatement: true,
        reportV1ProjectionAvailable: true,
      },
    });
    expect(new Set(comparison.rows.map((row) => row.sourceStream))).toEqual(new Set([
      "legacy_analysis_summary",
      "fiserv_component",
      "fiserv_range_conservative",
      "fiserv_range_estimated",
      "fiserv_range_maximum",
      "customer_report",
      "report_v1_eligible_opportunity",
      "report_v1_synthetic_master",
      "canonical_package_e_eligible",
      "canonical_package_e_master",
      "public_api",
      "persistence",
      "multi_statement_input_conservative",
      "multi_statement_input_estimated",
      "multi_statement_input_maximum",
    ]));
    const positiveLegacy = comparison.rows.filter((row) => row.positiveClaim && !row.sourceStream.startsWith("canonical_package_e"));
    expect(positiveLegacy.length).toBeGreaterThan(0);
    expect(positiveLegacy.every((row) => row.authority.status === "refused")).toBe(true);
    expect(positiveLegacy.every((row) => row.authority.missingAuthorityOrEvidence.includes("authoritative_target_or_counterfactual"))).toBe(true);
    expect(comparison.rows.filter((row) => row.sourceStream.startsWith("canonical_package_e"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: { amountMinor: 0, currency: "USD" }, positiveClaim: false, authority: expect.objectContaining({ status: "supported" }) }),
    ]));
    expect(comparison.packageEInvariant).toMatchObject({
      noPositiveOpportunityLinkage: true,
      noApprovedTarget: true,
      noEligibleCalculation: true,
      eligibleSavings: { amountMinor: 0, currency: "USD" },
      masterSavings: { amountMinor: 0, currency: "USD" },
      observedAmountsPreserved: true,
      verificationOnlyEvidenceReviewPreserved: true,
    });
    expect(result.analysis).not.toHaveProperty("internalSupportedFiservSavingsAuthorityComparison");

    expect(summary).toEqual(legacyBefore);
    expect(buildSingleStatementCustomerReport({ kind: "single_statement_result", analysis: summary, context: { unlocked: true } })).toEqual(customerBefore);
    expect(toPublicReportSummary(summary)).toEqual(publicBefore);
    expect(buildComparisonStatementInput(summary)).toEqual(multiBefore);
    expect(buildSingleStatementReportV1({
      analysis: summary,
      reportId: "savings_authority_test",
      generatedAt: "2000-01-01T00:00:00.000Z",
    })).toEqual(reportV1Before);
  }, 60_000);

  it("does not apply to an unsupported legacy parser and cannot block canonical analysis", async () => {
    const document = await parsePdf(fixturePath);
    const summary = analyzeStatementDocument(document, "restaurant_food_beverage", {
      sourceFileName: path.basename(fixturePath),
    });
    const canonical = buildCanonicalRuntimeAnalysis({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "savings_authority_non_fiserv_test",
    }).analysis;
    const unsupported = structuredClone(summary);
    unsupported.parserSource = { ...unsupported.parserSource!, driverId: "unsupported_test_parser" };

    expect(buildSupportedFiservSavingsAuthorityComparison({ analysis: canonical, legacySummary: unsupported })).toMatchObject({
      status: "not_applicable",
      supportedFiserv: false,
      rows: [],
    });
    expect(buildSupportedFiservSavingsAuthorityComparison({ analysis: canonical, legacySummary: null })).toMatchObject({
      status: "unavailable",
      supportedFiserv: false,
      rows: [],
    });
  }, 60_000);
});
