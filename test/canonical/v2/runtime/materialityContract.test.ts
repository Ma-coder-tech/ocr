import { describe, expect, it } from "vitest";

import {
  MATERIALITY_CONTRACT_V1,
  combineMaterialityAxes,
  evaluateEconomicMateriality,
} from "../../../../src/canonical/v2/runtime/materialityContract.js";
import {
  aggregateAtomicClaimMagnitude,
  canonicalAtomicClaimGroupingKey,
} from "../../../../src/canonical/v2/runtime/rgWorkLedger.js";

describe("Materiality Contract v1", () => {
  it.each([
    [{ amountMinor: 10_000, authoritativeStatementCostMinor: 1_000_000 }, "E2", "e2_100_dollars_and_1_percent"],
    [{ amountMinor: 9_999, authoritativeStatementCostMinor: 499_950 }, "E1", "e1_relative_1_percent"],
    [{ amountMinor: 50_000, authoritativeStatementCostMinor: 100_000_000 }, "E2", "e2_absolute_500_dollars"],
    [{ amountMinor: 1_000, authoritativeStatementCostMinor: 10_000 }, "E2", "e2_10_dollars_and_10_percent"],
    [{ amountMinor: 999, authoritativeStatementCostMinor: 4_995 }, "E1", "e1_relative_1_percent"],
    [{ amountMinor: 999, authoritativeStatementCostMinor: 100_000 }, "E0", "below_e1_absolute_and_available_relative_thresholds"],
  ] as const)("evaluates exact economic thresholds without annualizing (%o)", (input, tier, reason) => {
    const result = evaluateEconomicMateriality(input);
    expect(result.tier).toBe(tier);
    expect(result.reasonCodes).toContain(reason);
  });

  it("treats an invalid or zero authoritative cost as unavailable rather than zero", () => {
    expect(evaluateEconomicMateriality({ amountMinor: 49_999, authoritativeStatementCostMinor: 0 })).toMatchObject({
      tier: "E1", relativeBasisPoints: null, relativeSignificance: "unavailable",
      reasonCodes: expect.arrayContaining(["relative_significance_unavailable"]),
    });
    expect(evaluateEconomicMateriality({ amountMinor: null, authoritativeStatementCostMinor: null })).toMatchObject({
      tier: "unavailable", relativeBasisPoints: null, relativeSignificance: "unavailable",
    });
  });

  it("records relative magnitude without rounding a below-threshold ratio up to the threshold", () => {
    expect(evaluateEconomicMateriality({ amountMinor: 999, authoritativeStatementCostMinor: 100_000 }))
      .toMatchObject({ tier: "E0", relativeBasisPoints: 99.9 });
  });

  it("implements the approved two-axis matrix and freezes business/benchmark exclusion", () => {
    expect(MATERIALITY_CONTRACT_V1).toMatchObject({
      authority: "versioned_product_semantics",
      magnitudeBasis: "observed_statement_period_atomic_claim",
      annualization: "prohibited",
      businessTypeAuthority: "excluded",
      benchmarkAuthority: "excluded",
    });
    expect(combineMaterialityAxes("E2", "D0")).toBe("contextual");
    expect(combineMaterialityAxes("E1", "D2")).toBe("material");
    expect(combineMaterialityAxes("E0", "D1")).toBe("contextual");
    expect(combineMaterialityAxes("E0", "D0")).toBe("immaterial");
    expect(combineMaterialityAxes("unavailable", "D2")).toBe("material");
    expect(combineMaterialityAxes("unavailable", "D0")).toBe("unresolved");
  });

  it("groups only exact semantics, preserves credit direction, and never double-counts a canonical subject", () => {
    const base = {
      claimClass: "economic_ownership" as const,
      facet: "economic_owner" as const,
      opaqueSubjectCode: "opaque-subject",
      scopeFingerprint: "scope-a",
      period: "2026-07-31",
      direction: "debit" as const,
    };
    const key = canonicalAtomicClaimGroupingKey(base);
    expect(canonicalAtomicClaimGroupingKey({ ...base, facet: "economic_beneficiary" })).not.toBe(key);
    expect(canonicalAtomicClaimGroupingKey({ ...base, scopeFingerprint: "scope-b" })).not.toBe(key);
    expect(canonicalAtomicClaimGroupingKey({ ...base, period: "2026-08-31" })).not.toBe(key);
    expect(canonicalAtomicClaimGroupingKey({ ...base, direction: "credit" })).not.toBe(key);
    expect(aggregateAtomicClaimMagnitude([
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 1_000 },
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 1_000 },
      { canonicalSubjectRefs: ["charge-b"], amountMinor: 500 },
    ])).toBe(1_500);
    expect(() => aggregateAtomicClaimMagnitude([
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 1_000 },
      { canonicalSubjectRefs: ["charge-a"], amountMinor: 999 },
    ])).toThrow("rg_canonical_subject_magnitude_conflict:charge-a");
  });
});
