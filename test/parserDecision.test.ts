import { describe, expect, it } from "vitest";
import { buildParserDecision, buildParserValidationState } from "../src/parserDecision.js";
import { makeAmountCheck, makeNotApplicableCheck, makeRateCheck, makeReconResult, makeUnreferencedValueResult, makeWarningCheck } from "../src/reconciliation.js";

function requiredPassingReconciliation() {
  return {
    fundingFormula: makeAmountCheck(100, 100, 0.01, "funding"),
    feeBucketFormula: makeAmountCheck(10, 10, 0.01, "fees"),
    effectiveRateFormula: makeRateCheck(0.1, 0.1, 0.000001, "rate"),
  };
}

describe("parser decision gate", () => {
  it("accepts clean parser output when required reconciliation passes", () => {
    const decision = buildParserDecision({
      reconciliation: {
        ...requiredPassingReconciliation(),
        supportingFeeAgreement: makeNotApplicableCheck("no detail"),
      },
      warnings: [],
      confidence: "high",
    });

    expect(decision).toEqual({
      status: "accepted",
      confidence: "high",
      reportable: true,
      reason: "Accepted because required reconciliation checks passed and no parser warnings were raised.",
    });
  });

  it("allows reportable output with caveats when there are non-blocking warnings", () => {
    const decision = buildParserDecision({
      reconciliation: {
        ...requiredPassingReconciliation(),
        supportingFeeAgreement: makeWarningCheck(90, 80, 0.01, "supporting detail differs"),
      },
      warnings: [{ code: "filename_period_mismatch", severity: "medium" }],
      confidence: "high",
    });

    expect(decision).toMatchObject({
      status: "accepted_with_warnings",
      confidence: "high",
      reportable: true,
    });
    expect(decision.reason).toContain("supportingFeeAgreement");
    expect(decision.reason).toContain("filename_period_mismatch");
  });

  it("blocks merchant reporting when hard reconciliation fails", () => {
    const decision = buildParserDecision({
      reconciliation: {
        ...requiredPassingReconciliation(),
        fundingFormula: makeAmountCheck(100, 85, 0.01, "funding"),
      },
      warnings: [],
      confidence: "high",
    });

    expect(decision).toEqual({
      status: "needs_review",
      confidence: "needs_review",
      reportable: false,
      reason: "Blocked by failed reconciliation check(s): fundingFormula.",
    });
  });

  it("blocks merchant reporting on high severity warnings or weak parser confidence", () => {
    expect(
      buildParserDecision({
        reconciliation: requiredPassingReconciliation(),
        warnings: [{ code: "wrong_statement_period", severity: "high" }],
        confidence: "high",
      }),
    ).toMatchObject({ status: "needs_review", reportable: false });

    expect(
      buildParserDecision({
        reconciliation: requiredPassingReconciliation(),
        warnings: [],
        confidence: "low",
      }),
    ).toMatchObject({ status: "needs_review", reportable: false });
  });

  it("blocks merchant reporting when required reconciliation checks are missing", () => {
    expect(
      buildParserDecision({
        reconciliation: {},
        warnings: [],
        confidence: "high",
      }),
    ).toEqual({
      status: "needs_review",
      confidence: "needs_review",
      reportable: false,
      reason: "Blocked by missing required reconciliation check(s): fundingFormula, feeBucketFormula, effectiveRateFormula.",
    });

    expect(
      buildParserDecision({
        reconciliation: {
          fundingFormula: makeAmountCheck(100, 100, 0.01, "funding"),
        },
        warnings: [],
        confidence: "high",
      }),
    ).toMatchObject({
      status: "needs_review",
      reportable: false,
    });
  });

  it("derives layered parser validation from rich reconciliation results", () => {
    const reconciliationResults = [
      makeReconResult({
        identity: "headline:submitted_minus_third_party_plus_adjustments_minus_fees_eq_funded",
        stated: 35347.21,
        computed: 35347.21,
        toleranceBand: 0.01,
      }),
      makeReconResult({
        identity: "fee_detail:all_line_items_eq_total_fees",
        stated: 1565.73,
        computed: 1565.71,
        toleranceBand: 0.14,
      }),
      makeReconResult({
        identity: "batch_row:02/27/24:98056271397:funding_formula",
        stated: 2344.1,
        computed: 2362.72,
        toleranceBand: 0.01,
      }),
      makeUnreferencedValueResult({
        identity: "orphan_total:generic_amounts_submitted_total",
        stated: 38758.59,
        nearestReference: 36912.94,
      }),
    ];

    expect(buildParserValidationState(reconciliationResults)).toMatchObject({
      topLevelTotals: "validated",
      feeLedger: "validated_with_rounding",
      batchLedger: "failed",
      feeClassification: "not_evaluated",
      orphanTotals: "present",
      customerFacingTotalsAllowed: true,
      feeLedgerAllowed: true,
      batchDetailAllowed: false,
      feeClassificationAllowed: false,
      blockingReasons: [],
    });

    const decision = buildParserDecision({
      reconciliation: requiredPassingReconciliation(),
      reconciliationResults,
      warnings: [],
      confidence: "high",
    });

    expect(decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        customerFacingTotalsAllowed: true,
        batchDetailAllowed: false,
      },
    });
    expect(decision.reason).toContain("Batch ledger has material reconciliation issue");
  });

  it("records fee classification as a warning when rows reconcile but blended or unresolved rows remain", () => {
    const decision = buildParserDecision({
      reconciliation: requiredPassingReconciliation(),
      reconciliationResults: [
        makeReconResult({
          identity: "headline:submitted_minus_third_party_plus_adjustments_minus_fees_eq_funded",
          stated: 100,
          computed: 100,
          toleranceBand: 0.01,
        }),
        makeReconResult({
          identity: "fee_detail:all_line_items_eq_total_fees",
          stated: 10,
          computed: 10,
          toleranceBand: 0.02,
        }),
      ],
      feeClassification: {
        status: "validated_with_unresolved_rows",
        rowCount: 28,
        classifiedRowCount: 28,
        unresolvedRowCount: 1,
        needsUnbundlingRowCount: 4,
        totalClassifiedAmount: 1565.71,
        printedTotal: 1565.73,
        delta: 0.02,
      },
      warnings: [],
      confidence: "high",
    });

    expect(decision).toMatchObject({
      status: "accepted_with_warnings",
      reportable: true,
      validationState: {
        feeClassification: "warning",
        feeClassificationAllowed: false,
      },
    });
    expect(decision.reason).toContain("Fee classification is recorded but not clean");
  });

  it("blocks customer-facing reporting when rich reconciliation says top-level totals failed", () => {
    const decision = buildParserDecision({
      reconciliation: requiredPassingReconciliation(),
      reconciliationResults: [
        makeReconResult({
          identity: "headline:submitted_minus_third_party_plus_adjustments_minus_fees_eq_funded",
          stated: 100,
          computed: 80,
          toleranceBand: 0.01,
        }),
      ],
      warnings: [],
      confidence: "high",
    });

    expect(decision).toMatchObject({
      status: "needs_review",
      reportable: false,
      validationState: {
        topLevelTotals: "failed",
        customerFacingTotalsAllowed: false,
      },
    });
    expect(decision.reason).toContain("Top-level statement totals did not validate");
  });
});
