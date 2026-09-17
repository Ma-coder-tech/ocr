import { describe, expect, it } from "vitest";
import { recoverPrintedFeeOperands } from "../../src/canonical/feeOperandRecovery.js";

describe("fee basis operand coverage and conflict resolution v1", () => {
  it("recovers an integer count column as count times per-item fee", () => {
    const recovery = recover("ECI CPU-G", "09/30/22 | CF | ECI CPU-G | 71 | 0.25 | -17.75");

    expect(recovery).toMatchObject({
      status: "recovered",
      unitSemanticsPolicyVersion: "fee_operand_unit_semantics_adjudication_v1",
      candidates: [{ formulaBasis: "per_item", basisKind: "transaction_count", itemCount: 71, ruleId: "integer_count_column_v1", unitEvidenceBasis: "printed_source_format" }],
    });
  });

  it("uses explicit item language to resolve a decimal-formatted whole-number basis", () => {
    const recovery = recover("OTHER ITEM FEES", "08/31/25 | CF | OTHER ITEM FEES | 3.00 | 0.10000 | -$0.30");

    expect(recovery).toMatchObject({
      status: "recovered",
      candidates: [{ formulaBasis: "per_item", itemCount: 3, ruleId: "explicit_count_description_v1", unitEvidenceBasis: "printed_description_and_source_format" }],
    });
  });

  it("recovers fractional monetary volume and explicit non-money source units", () => {
    expect(recover("DISC 1", "08/31/25 | CF | DISC 1 | 281.07 | 0.00200 | -$0.56")).toMatchObject({
      status: "recovered",
      candidates: [{ formulaBasis: "rate_times_volume", volumeBasis: { amountMinor: 28107 }, ruleId: "fractional_volume_column_v1" }],
    });
    expect(recover("KILOBYTE AUTH FEE US", "08/31/25 | CF | KILOBYTE AUTH FEE US | 18.35 | 0.00229 | -$0.04")).toMatchObject({
      status: "recovered",
      candidates: [{ formulaBasis: "source_units_times_per_unit", sourceUnitBasis: "18.35", sourceUnit: "kilobytes", ruleId: "explicit_source_unit_description_v1" }],
    });
  });

  it("recovers explicitly named source-event units without using arithmetic fit", () => {
    expect(recover("BATCH HEADER", "08/31/25 | MISC | BATCH HEADER | 20.00 | 0.3500 | -$7.00")).toMatchObject({
      status: "recovered",
      candidates: [{ formulaBasis: "source_units_times_per_unit", sourceUnit: "batches", ruleId: "explicit_batch_unit_description_v1" }],
    });
    expect(recover("ACH REJECT FEE", "08/31/25 | MISC | ACH REJECT FEE | 3.00 | 20.00 | -$60.00")).toMatchObject({
      status: "recovered",
      candidates: [{ sourceUnit: "rejection_events", ruleId: "explicit_rejection_unit_description_v1" }],
    });
    expect(recover("DISC NETWORK AUTH FEE", "08/31/25 | CF | DISC NETWORK AUTH FEE | 2.00 | 0.01900 | -$0.04")).toMatchObject({
      status: "recovered",
      candidates: [{ sourceUnit: "authorization_events", ruleId: "explicit_authorization_unit_description_v1" }],
    });
  });

  it("keeps a decimal whole-number basis ambiguous without semantic unit evidence", () => {
    const recovery = recover("CPU GTWY", "08/31/25 | CF | CPU GTWY | 40.00 | 0.1000 | -$4.00");

    expect(recovery.status).toBe("ambiguous");
    expect(recovery.selectedCandidateId).toBeNull();
    expect(recovery.candidates.map((item) => item.formulaBasis).sort()).toEqual(["per_item", "rate_times_volume"]);
    expect(recovery.reasonCodes).toContain("amount_fit_not_used_for_selection");
  });

  it("preserves conflicting printed operand pairs instead of selecting either", () => {
    const recovery = recoverPrintedFeeOperands({
      label: "DISC 1",
      sources: [
        { evidenceRef: "ev_one", text: "08/31/25 | CF | DISC 1 | 281.07 | 0.00200 | -$0.56" },
        { evidenceRef: "ev_two", text: "08/31/25 | CF | DISC 1 | 282.07 | 0.00200 | -$0.56" },
      ],
    });

    expect(recovery.status).toBe("conflicting");
    expect(recovery.selectedCandidateId).toBeNull();
    expect(recovery.candidates).toHaveLength(2);
    expect(recovery.reasonCodes).toEqual(["conflicting_printed_operand_pairs"]);
  });

  it("keeps explicit unit and source-format conflicts visible", () => {
    const recovery = recover("TRANSACTION FEE", "08/31/25 | CF | TRANSACTION FEE | 3.25 | 0.10000 | -$0.33");

    expect(recovery).toMatchObject({
      status: "conflicting",
      selectedCandidateId: null,
      reasonCodes: ["explicit_count_language_conflicts_with_fractional_basis"],
    });
  });

  it("does not invent a missing side of an incomplete printed operand pair", () => {
    expect(recover("FIXED NETWORK CNP FEE", "09/30/22 | CF | FIXED NETWORK CNP FEE | 2 | -15.00")).toMatchObject({
      status: "unavailable",
      selectedCandidateId: null,
      candidates: [],
    });
  });
});

function recover(label: string, text: string) {
  return recoverPrintedFeeOperands({ label, sources: [{ evidenceRef: "ev_source", text }] });
}
