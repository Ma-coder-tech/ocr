import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareMultiStatementAnalyses } from "../src/multiStatementComparisonEngine.js";
import { buildComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import { buildMultiStatementGlobalReport } from "../src/reporting/buildMultiStatement.js";
import type { AnalysisSummary } from "../src/types.js";

const PEPE_DIR = path.join(process.cwd(), "test", "fixtures", "multi-statement", "nov-dec-2024-real-pipeline");

function summary(name: string): AnalysisSummary {
  return JSON.parse(fs.readFileSync(path.join(PEPE_DIR, `${name}.single-summary.json`), "utf8")) as AnalysisSummary;
}

function pepeReport() {
  const statements = [
    buildComparisonStatementInput(summary("nov_2024_statement"), {
      sourceAnalysisId: "Nov_2024_Statement.pdf",
      pipelineVersion: "real-pipeline-regression",
      merchant: { merchantName: "PEPES MEXICAN RESTURANT", isoName: "Clover / First Data" },
    }),
    buildComparisonStatementInput(summary("dec_2024_statement"), {
      sourceAnalysisId: "Dec_2024_Statement.pdf",
      pipelineVersion: "real-pipeline-regression",
      merchant: { merchantName: "PEPES MEXICAN RESTURANT", isoName: "Clover / First Data" },
    }),
  ];
  const analysis = compareMultiStatementAnalyses(statements, {
    analysisTimestamp: "2026-07-10T00:00:00.000Z",
    pipelineVersion: "real-pipeline-regression",
  });
  return { analysis, report: buildMultiStatementGlobalReport(analysis) };
}

describe("real multi-statement regression: Pepe's November/December statements", () => {
  it("aggregates stable single-statement findings and does not invent changes from embedded volume text", () => {
    const { analysis, report } = pepeReport();
    const fingerprints = analysis.globalFindings.map((finding) => finding.fingerprint);

    expect(report.executiveSummary).toMatchObject({
      merchantName: "PEPES MEXICAN RESTURANT",
      isoName: "Clover / First Data",
      statementCount: 2,
      trendDirection: "stable",
    });
    expect(report.effectiveRateTrend.periods.map((period) => period.displayRate)).toEqual(["2.50%", "2.48%"]);

    expect(fingerprints).toEqual(expect.arrayContaining([
      "penalty_or_configuration_fee__managed_security_non_validated_may_be_avoidable_through_configuration_or_qualification_fixes__confirmed",
      "suspicious_uniform_rate__access_fee_is_charged_at_the_same_rate_across_independent_networks__investigative",
      "per_auth_fee_benchmark__per_authorization_fee_is_above_competitive_benchmark__negotiable",
      "hidden_percentage_markup__monthly_advantage_fee_mcvdb_0_0003_adds_hidden_percentage_markup__negotiable",
      "third_party_service_fee__bentobox_online_order_fee_is_a_third_party_service_fee__investigative",
    ]));

    const pci = analysis.globalFindings.find((finding) => finding.fingerprint.includes("managed_security_non_validated"));
    expect(pci).toMatchObject({
      cumulativeImpact: 99.9,
      projectedAnnualImpact: 599.4,
      tier: "compliance_penalty",
    });

    const access = analysis.globalFindings.find((finding) => finding.fingerprint.includes("access_fee_is_charged"));
    expect(access?.cumulativeImpact).toBeCloseTo(119.79, 2);
    expect(access?.projectedAnnualImpact).toBeCloseTo(718.74, 2);

    expect(report.feeChangeTimeline).toEqual([]);
    expect(report.cumulativeSavings.projectedAnnualIfUnchanged.maximum).toBeGreaterThan(2000);
    expect(report.actionSummary.totalProjectedAnnualSavings).toBeGreaterThan(2000);
  });
});
