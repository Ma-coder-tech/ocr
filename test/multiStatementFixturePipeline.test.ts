import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURE_PATH = path.join(process.cwd(), "test", "fixtures", "multi-statement", "el_nuevo_tequila_multi_statement.generated.json");
const BASELINE_PATH = path.join(process.cwd(), "test", "fixtures", "multi-statement", "el_nuevo_tequila_sep_2024_baseline.comparison-input.json");

type Fixture = {
  statements: Array<{
    statementPeriod: string;
    merchant: { merchantName: string | null };
    financials: { totalVolume: number; totalFees: number; effectiveRate: number; rateUnit: "decimal" };
    fees: Array<{ feeFamilyKey: string; compositeKey: string; amount: number; rate: number | null; count: number | null }>;
    notices: Array<{ noticeType: string; feeName: string | null; amount: number | null; effectiveDate: string | null }>;
    disputes: { chargebacks: number | null; chargebackFees: number | null; achRejects: number | null; achRejectFees: number | null; totalDisputeCost: number | null };
  }>;
  expectedComparisonResults: {
    structure: {
      includedPeriods: string[];
      missingPeriods: string[];
      newFees: Array<{ feeFamilyKey: string; firstAppeared: string }>;
      rateChanges: Array<{ feeFamilyKey: string; changeMonth: string; previousRateOrAmount: number; newRateOrAmount: number }>;
      noticeLinks: Array<{ noticePeriod: string; feeFamilyKey: string; effectivePeriod: string }>;
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

function loadFixture(): Fixture {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function statement(fixture: Fixture, period: string) {
  const found = fixture.statements.find((item) => item.statementPeriod === period);
  if (!found) throw new Error(`Missing statement period ${period}`);
  return found;
}

function amountFor(fixture: Fixture, period: string, familyKey: string): number {
  return round(statement(fixture, period).fees.filter((fee) => fee.feeFamilyKey === familyKey).reduce((sum, fee) => sum + fee.amount, 0));
}

function watsIncrementalImpact(fixture: Fixture, period: string): number {
  return round(
    statement(fixture, period).fees
      .filter((fee) => fee.feeFamilyKey === "wats_auth_fee")
      .reduce((sum, fee) => sum + (fee.count ?? 0) * 0.02, 0),
  );
}

describe("El Nuevo Tequila multi-statement fixture pipeline", () => {
  it("keeps the real baseline fixture separate from the generated multi-statement fixture", () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as { statement: { statementPeriod: string; financials: { rateUnit: string } } };
    const fixture = loadFixture();

    expect(baseline.statement.statementPeriod).toBe("2024-09");
    expect(baseline.statement.financials.rateUnit).toBe("decimal");
    expect(fixture.statements[0].statementPeriod).toBe("2024-09");
    expect(fixture.statements.map((item) => item.statementPeriod)).toEqual([
      "2024-09",
      "2024-10",
      "2024-11",
      "2024-12",
      "2025-01",
      "2025-03",
      "2025-04",
    ]);
  });

  it("captures the behavioral edge cases the comparison engine must detect", () => {
    const fixture = loadFixture();
    const expected = fixture.expectedComparisonResults.structure;

    expect(expected.missingPeriods).toEqual(["2025-02"]);
    expect(expected.newFees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feeFamilyKey: "regulatory_product", firstAppeared: "2024-11" }),
        expect.objectContaining({ feeFamilyKey: "managed_security_non_validated", firstAppeared: "2025-03" }),
      ]),
    );
    expect(expected.rateChanges).toEqual(
      expect.arrayContaining([
        { feeFamilyKey: "wats_auth_fee", changeMonth: "2025-01", previousRateOrAmount: 0.11, newRateOrAmount: 0.13 },
        { feeFamilyKey: "supply_shipping_handling", changeMonth: "2025-04", previousRateOrAmount: 15.95, newRateOrAmount: 19.95 },
        { feeFamilyKey: "monthly_service_charge", changeMonth: "2025-04", previousRateOrAmount: 10, newRateOrAmount: 15 },
      ]),
    );
    expect(expected.noticeLinks).toEqual([
      expect.objectContaining({ noticePeriod: "2024-11", feeFamilyKey: "wats_auth_fee", effectivePeriod: "2025-01" }),
    ]);
    expect(statement(fixture, "2024-11").notices).toEqual([
      expect.objectContaining({ noticeType: "fee_increase", feeName: "WATS AUTH FEE", amount: 0.13, effectiveDate: "2025-01" }),
    ]);
    expect(expected.disputeSpikes).toEqual([{ period: "2025-03", chargebacks: 5 }]);
    expect(statement(fixture, "2025-01").fees.filter((fee) => fee.feeFamilyKey === "wats_auth_fee").every((fee) => fee.rate === 0.13)).toBe(true);
    expect(statement(fixture, "2024-12").financials.effectiveRate).toBeLessThan(statement(fixture, "2024-11").financials.effectiveRate);
  });

  it("locks merchant-facing dollar figures within the fixture tolerance", () => {
    const fixture = loadFixture();
    const expected = fixture.expectedComparisonResults.dollars;

    for (const item of fixture.statements) {
      expect(item.financials.rateUnit).toBe("decimal");
      expect(item.financials.effectiveRate).toBeCloseTo(expected.effectiveRatesByPeriod[item.statementPeriod], 5);
      expect(item.financials.totalFees).toBeCloseTo(expected.totalFeesByPeriod[item.statementPeriod], 2);
      expect(item.financials.effectiveRate).toBeCloseTo(item.financials.totalFees / item.financials.totalVolume, 8);
    }

    expect(amountFor(fixture, "2024-11", "regulatory_product")).toBeCloseTo(3.95, 2);
    expect(amountFor(fixture, "2025-03", "managed_security_non_validated")).toBeCloseTo(49.95, 2);
    expect(amountFor(fixture, "2025-04", "supply_shipping_handling")).toBeCloseTo(19.95, 2);
    expect(amountFor(fixture, "2025-04", "monthly_service_charge")).toBeCloseTo(15, 2);

    const regulatoryCumulative = round(["2024-11", "2024-12", "2025-01", "2025-03", "2025-04"].reduce((sum, period) => sum + amountFor(fixture, period, "regulatory_product"), 0));
    const pciCumulative = round(["2025-03", "2025-04"].reduce((sum, period) => sum + amountFor(fixture, period, "managed_security_non_validated"), 0));
    const supplyIncrease = round(amountFor(fixture, "2025-04", "supply_shipping_handling") - amountFor(fixture, "2025-03", "supply_shipping_handling"));
    const monthlyIncrease = round(amountFor(fixture, "2025-04", "monthly_service_charge") - amountFor(fixture, "2025-03", "monthly_service_charge"));
    const watsCumulative = round(watsIncrementalImpact(fixture, "2025-01") + watsIncrementalImpact(fixture, "2025-03") + watsIncrementalImpact(fixture, "2025-04"));

    expect(expected.newFeeImpacts.regulatory_product.cumulativeAmountSinceAppearance).toBeCloseTo(regulatoryCumulative, 2);
    expect(expected.newFeeImpacts.regulatory_product.projectedAnnualCost).toBeCloseTo(47.4, 2);
    expect(expected.newFeeImpacts.managed_security_non_validated.cumulativeAmountSinceAppearance).toBeCloseTo(pciCumulative, 2);
    expect(expected.newFeeImpacts.managed_security_non_validated.projectedAnnualCost).toBeCloseTo(599.4, 2);

    expect(expected.rateChangeImpacts.wats_auth_fee.cumulativeImpact).toBeCloseTo(watsCumulative, 2);
    expect(expected.rateChangeImpacts.supply_shipping_handling.monthlyImpactIncrease).toBeCloseTo(supplyIncrease, 2);
    expect(expected.rateChangeImpacts.monthly_service_charge.monthlyImpactIncrease).toBeCloseTo(monthlyIncrease, 2);

    expect(expected.disputeCostsByPeriod["2025-03"]).toEqual({
      chargebacks: 5,
      chargebackFees: 125,
      achRejects: 0,
      achRejectFees: 0,
      totalDisputeCost: 125,
    });
    expect(expected.disputeCostsByPeriod["2025-04"].totalDisputeCost).toBe(50);

    const conservative = round(regulatoryCumulative + pciCumulative + supplyIncrease + monthlyIncrease);
    const estimated = round(conservative + watsCumulative);
    expect(expected.cumulativeSavings.alreadyOverpaid.conservative).toBeCloseTo(conservative, 2);
    expect(expected.cumulativeSavings.alreadyOverpaid.estimated).toBeCloseTo(estimated, 2);
    expect(expected.cumulativeSavings.alreadyOverpaid.maximum).toBeCloseTo(estimated, 2);
    expect(expected.globalFindingImpacts.silent_fixed_fee_increases.cumulativeImpact).toBeCloseTo(supplyIncrease + monthlyIncrease, 2);
  });
});
