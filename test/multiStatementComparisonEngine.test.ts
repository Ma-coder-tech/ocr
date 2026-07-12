import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareMultiStatementAnalyses } from "../src/multiStatementComparisonEngine.js";
import type { ComparisonStatementInput } from "../src/multiStatementComparisonInput.js";

const FIXTURE_PATH = path.join(process.cwd(), "test", "fixtures", "multi-statement", "el_nuevo_tequila_multi_statement.generated.json");

type Fixture = {
  statements: ComparisonStatementInput[];
  expectedComparisonResults: {
    structure: {
      includedPeriods: string[];
      missingPeriods: string[];
      newFees: Array<{ feeFamilyKey: string; firstAppeared: string }>;
      rateChanges: Array<{ feeFamilyKey: string; changeMonth: string; previousRateOrAmount: number; newRateOrAmount: number }>;
      noticeLinks: Array<{ noticePeriod: string; feeFamilyKey: string; effectivePeriod: string; expectedConfidence: "high" | "medium" | "low" }>;
      disputeSpikes: Array<{ period: string; chargebacks: number }>;
    };
    dollars: {
      toleranceUsd: number;
      effectiveRateTolerance: number;
      effectiveRatesByPeriod: Record<string, number>;
      totalFeesByPeriod: Record<string, number>;
      cumulativeSavings: {
        alreadyOverpaid: { conservative: number; estimated: number; maximum: number };
        projectedAnnualIfUnchanged: { conservative: number; estimated: number; maximum: number };
      };
      newFeeImpacts: Record<string, { cumulativeAmountSinceAppearance: number; projectedAnnualCost: number }>;
      rateChangeImpacts: Record<string, { monthlyImpactIncrease: number; annualImpactIncrease: number; cumulativeImpact: number }>;
      disputeCostsByPeriod: Record<string, { chargebacks: number; chargebackFees: number; achRejects: number; achRejectFees: number; totalDisputeCost: number }>;
      globalFindingImpacts: Record<string, { cumulativeImpact: number; projectedAnnualImpact: number }>;
    };
  };
};

function fixture(): Fixture {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

function expectMoney(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("multi-statement comparison engine", () => {
  it("orders periods, detects gaps, trends, new fees, rate changes, notices, and disputes", () => {
    const data = fixture();
    const expected = data.expectedComparisonResults.structure;
    const result = compareMultiStatementAnalyses(data.statements, {
      analysisTimestamp: "2026-07-06T00:00:00.000Z",
      pipelineVersion: "test",
    });

    expect(result.metadata.includedPeriods).toEqual(expected.includedPeriods);
    expect(result.metadata.missingPeriods).toEqual(expected.missingPeriods);
    expect(result.metadata.totalStatementsAnalyzed).toBe(7);
    expect(result.effectiveRateTrend.direction).toBe("increasing");
    expect(result.effectiveRateTrend.rateChangeExplanation).toContain("2024-12");
    expect(result.effectiveRateTrend.rateChangeExplanation).toContain("WATS AUTH FEE");

    for (const newFee of expected.newFees) {
      expect(result.newFees).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            feeFamilyKey: newFee.feeFamilyKey,
            firstAppeared: newFee.firstAppeared,
          }),
        ]),
      );
    }

    for (const change of expected.rateChanges) {
      expect(result.rateChanges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            feeFamilyKey: change.feeFamilyKey,
            changeMonth: change.changeMonth,
            previousRate: change.previousRateOrAmount,
            newRate: change.newRateOrAmount,
          }),
        ]),
      );
    }

    const notice = expected.noticeLinks[0];
    expect(result.noticeTracking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          noticePeriod: notice.noticePeriod,
          announcedEffectiveDate: notice.effectivePeriod,
          matchedFeeFamilyKey: notice.feeFamilyKey,
          confidence: notice.expectedConfidence,
          actuallyAppeared: true,
          amountMatched: true,
        }),
      ]),
    );

    for (const spike of expected.disputeSpikes) {
      expect(result.disputeTrend.periods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            period: spike.period,
            chargebacks: spike.chargebacks,
          }),
        ]),
      );
    }

    expect(result.pricingModelConsistency.consistent).toBe(true);
    expect(result.globalFindings.map((finding) => finding.fingerprint)).toEqual(
      expect.arrayContaining([
        "managed_security_non_validated__confirmed",
        "regulatory_product__confirmed",
        "wats_auth_fee_increase__negotiable",
        "silent_fixed_fee_increases__confirmed",
      ]),
    );
    expect(result.actionItems.length).toBeGreaterThanOrEqual(4);
  });

  it("matches merchant-facing dollar outputs from the fixture", () => {
    const data = fixture();
    const expected = data.expectedComparisonResults.dollars;
    const result = compareMultiStatementAnalyses(data.statements, {
      analysisTimestamp: "2026-07-06T00:00:00.000Z",
      pipelineVersion: "test",
    });

    for (const period of Object.keys(expected.effectiveRatesByPeriod)) {
      const row = result.effectiveRateTrend.periods.find((item) => item.period === period);
      expect(row).toBeTruthy();
      expect(Math.abs(row!.effectiveRate - expected.effectiveRatesByPeriod[period])).toBeLessThanOrEqual(expected.effectiveRateTolerance);
      expectMoney(row!.totalFees, expected.totalFeesByPeriod[period], expected.toleranceUsd);
    }

    for (const [familyKey, dollars] of Object.entries(expected.newFeeImpacts)) {
      const row = result.newFees.find((item) => item.feeFamilyKey === familyKey);
      expect(row).toBeTruthy();
      expectMoney(row!.cumulativeAmountSinceAppearance, dollars.cumulativeAmountSinceAppearance, expected.toleranceUsd);
      expectMoney(row!.projectedAnnualCost, dollars.projectedAnnualCost, expected.toleranceUsd);
    }

    for (const [familyKey, dollars] of Object.entries(expected.rateChangeImpacts)) {
      const row = result.rateChanges.find((item) => item.feeFamilyKey === familyKey);
      expect(row).toBeTruthy();
      expectMoney(row!.monthlyImpactIncrease, dollars.monthlyImpactIncrease, expected.toleranceUsd);
      expectMoney(row!.annualImpactIncrease, dollars.annualImpactIncrease, expected.toleranceUsd);
      expectMoney(row!.cumulativeImpact, dollars.cumulativeImpact, expected.toleranceUsd);
    }

    for (const [period, dollars] of Object.entries(expected.disputeCostsByPeriod)) {
      const row = result.disputeTrend.periods.find((item) => item.period === period);
      expect(row).toBeTruthy();
      expect(row).toMatchObject(dollars);
    }

    expectMoney(result.cumulativeSavings.alreadyOverpaid.conservative, expected.cumulativeSavings.alreadyOverpaid.conservative, expected.toleranceUsd);
    expectMoney(result.cumulativeSavings.alreadyOverpaid.estimated, expected.cumulativeSavings.alreadyOverpaid.estimated, expected.toleranceUsd);
    expectMoney(result.cumulativeSavings.alreadyOverpaid.maximum, expected.cumulativeSavings.alreadyOverpaid.maximum, expected.toleranceUsd);
    expectMoney(
      result.cumulativeSavings.projectedAnnualIfUnchanged.conservative,
      expected.cumulativeSavings.projectedAnnualIfUnchanged.conservative,
      expected.toleranceUsd,
    );
    expectMoney(
      result.cumulativeSavings.projectedAnnualIfUnchanged.estimated,
      expected.cumulativeSavings.projectedAnnualIfUnchanged.estimated,
      expected.toleranceUsd,
    );
    expectMoney(
      result.cumulativeSavings.projectedAnnualIfUnchanged.maximum,
      expected.cumulativeSavings.projectedAnnualIfUnchanged.maximum,
      expected.toleranceUsd,
    );

    for (const [fingerprint, dollars] of Object.entries(expected.globalFindingImpacts)) {
      const row = result.globalFindings.find((finding) => finding.fingerprint === `${fingerprint}__confirmed` || finding.fingerprint === `${fingerprint}__negotiable` || finding.fingerprint === fingerprint);
      expect(row, fingerprint).toBeTruthy();
      expectMoney(row!.cumulativeImpact, dollars.cumulativeImpact, expected.toleranceUsd);
      expectMoney(row!.projectedAnnualImpact, dollars.projectedAnnualImpact, expected.toleranceUsd);
    }
  });

  it("rejects duplicate statement periods before comparing", () => {
    const data = fixture();
    expect(() => compareMultiStatementAnalyses([data.statements[0], data.statements[0]])).toThrow(/Duplicate statement period/);
  });
});
