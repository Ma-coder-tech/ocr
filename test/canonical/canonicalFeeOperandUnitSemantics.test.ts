import { describe, expect, it } from "vitest";
import { resolvePrintedFeeOperandUnit } from "../../src/canonical/feeOperandUnitSemantics.js";

describe("fee operand unit semantics adjudication v1", () => {
  it("uses explicit printed count and money-volume language", () => {
    expect(resolve("OTHER ITEM FEES", "3.00")).toMatchObject({
      status: "resolved",
      basisKind: "transaction_count",
      sourceUnit: null,
      ruleId: "explicit_count_description_v1",
    });
    expect(resolve("OTHER VOLUME FEES", "300.00")).toMatchObject({
      status: "resolved",
      basisKind: "money_volume",
      sourceUnit: null,
      ruleId: "explicit_money_volume_description_v1",
    });
  });

  it("preserves the exact non-money unit named by the fee description", () => {
    expect(resolve("KILOBYTE AUTH FEE US", "18.35")).toMatchObject({ sourceUnit: "kilobytes", ruleId: "explicit_source_unit_description_v1" });
    expect(resolve("BATCH HEADER", "20.00")).toMatchObject({ sourceUnit: "batches", ruleId: "explicit_batch_unit_description_v1" });
    expect(resolve("DISC NETWORK AUTH FEE", "2.00")).toMatchObject({ sourceUnit: "authorization_events", ruleId: "explicit_authorization_unit_description_v1" });
    expect(resolve("ACH REJECT FEE", "3.00")).toMatchObject({ sourceUnit: "rejection_events", ruleId: "explicit_rejection_unit_description_v1" });
    expect(resolve("ADDR VERIFICATION SRV FEE", "2.00")).toMatchObject({ sourceUnit: "verification_events", ruleId: "explicit_verification_unit_description_v1" });
  });

  it("lets a spelled-out physical unit outrank other event language", () => {
    expect(resolve("KILOBYTE AUTH FEE US", "18.35")).toMatchObject({
      status: "resolved",
      sourceUnit: "kilobytes",
    });
  });

  it("keeps opaque fee abbreviations unknown", () => {
    for (const label of ["NABU FEES", "CPU GTWY", "AVS CPU-G", "NQUAL DISC", "ACQR PROCESSOR FEES"]) {
      expect(resolve(label, "20.00")).toEqual({ status: "unknown", reasonCode: "no_explicit_unit_semantics" });
    }
  });

  it("reports a source conflict when explicit count language has a fractional basis", () => {
    expect(resolve("TRANSACTION FEE", "3.25")).toEqual({
      status: "conflicting",
      reasonCode: "explicit_count_language_conflicts_with_fractional_basis",
      evidenceBasis: "printed_fee_description_and_source_format",
    });
  });
});

function resolve(label: string, basisToken: string) {
  return resolvePrintedFeeOperandUnit({ label, basisToken });
}
