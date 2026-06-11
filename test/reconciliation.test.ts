import { describe, expect, it } from "vitest";
import {
  classifyReconDelta,
  exactMoneyToleranceBand,
  makeAmountCheck,
  makeNotApplicableCheck,
  makeRateCheck,
  makeReconResult,
  makeUnreferencedValueResult,
  makeWarningCheck,
  round2,
  round8,
  sumMoneyToleranceBand,
  toCents,
} from "../src/reconciliation.js";

describe("reconciliation helpers", () => {
  it("rounds currency and rate values predictably", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round8(0.02501975123)).toBe(0.02501975);
  });

  it("marks amount checks as pass or fail using the supplied tolerance", () => {
    expect(makeAmountCheck(100, 100.01, 0.01, "within tolerance").status).toBe("pass");
    expect(makeAmountCheck(100, 100.02, 0.01, "outside tolerance")).toMatchObject({
      status: "fail",
      expected: 100,
      actual: 100.02,
      delta: 0.02,
    });
  });

  it("keeps warning checks separate from hard reconciliation failures", () => {
    expect(makeWarningCheck(955.2, 806.59, 0.02, "supporting detail differs")).toMatchObject({
      status: "warning",
      expected: 955.2,
      actual: 806.59,
      delta: -148.61,
    });
  });

  it("supports rate and not-applicable checks as explicit outcomes", () => {
    expect(makeRateCheck(0.02501975, 0.0250197512, 0.000001, "effective rate").status).toBe("pass");
    expect(makeNotApplicableCheck("missing section")).toEqual({
      status: "not_applicable",
      expected: null,
      actual: null,
      delta: null,
      tolerance: null,
      explanation: "missing section",
    });
  });

  it("supports the audit-style reconciliation contract using cents math", () => {
    expect(toCents(1565.73)).toBe(156573);
    expect(exactMoneyToleranceBand()).toBe(0.01);
    expect(sumMoneyToleranceBand(25)).toBe(0.125);
    expect(classifyReconDelta(0, 0.01)).toBe("RECON_OK");
    expect(classifyReconDelta(0.01, 0.01)).toBe("RECON_ROUNDING");
    expect(classifyReconDelta(0.13, sumMoneyToleranceBand(25))).toBe("RECON_MINOR_BREAK");
    expect(classifyReconDelta(0.5, 0.01)).toBe("RECON_MINOR_BREAK");
    expect(classifyReconDelta(18.62, 0.01)).toBe("RECON_MATERIAL_BREAK");
  });

  it("emits stated, computed, delta, implied value, and evidence for material breaks", () => {
    expect(
      makeReconResult({
        identity: "batch_row:02/27/24:funding_formula",
        stated: 2344.1,
        computed: 2362.72,
        impliedCorrect: 66.84,
        toleranceBand: 0.01,
        evidence: {
          section: "SUMMARY BY BATCH",
          rowLabel: "02/27/24",
        },
      }),
    ).toEqual({
      identity: "batch_row:02/27/24:funding_formula",
      status: "RECON_MATERIAL_BREAK",
      stated: 2344.1,
      computed: 2362.72,
      delta: -18.62,
      impliedCorrect: 66.84,
      toleranceBand: 0.01,
      evidence: {
        section: "SUMMARY BY BATCH",
        rowLabel: "02/27/24",
      },
    });
  });

  it("keeps orphan totals explicit instead of coercing them into selected totals", () => {
    expect(
      makeUnreferencedValueResult({
        identity: "orphan_total:generic_amounts_submitted_total",
        stated: 38758.59,
        nearestReference: 36912.94,
      }),
    ).toMatchObject({
      status: "RECON_UNREFERENCED_VALUE",
      stated: 38758.59,
      computed: 36912.94,
      delta: 1845.65,
    });
  });
});
