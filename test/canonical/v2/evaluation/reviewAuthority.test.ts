import { describe, expect, it } from "vitest";
import { reviewFeeDetailCoverage, reviewFieldAuthority } from "../../../../src/canonical/v2/evaluation/reviewAuthority.js";

describe("evaluation review authority isolation", () => {
  const futureFullAdmission = {
    mappingId: "future_full_template_mapping",
    lifecycle: "admitted_with_conditions" as const,
    supportedCapabilities: ["gross_sale_volume"],
    feeDetailCoverage: "unknown",
  };

  it("does not let admission metadata override parser refusal", () => {
    expect(reviewFieldAuthority({ parserReportable: false, extracted: true, capability: "gross_sale_volume",
      admission: futureFullAdmission })).toBe("withheld");
  });

  it("provides a future full-template seam without admitting unauthorized claims", () => {
    expect(reviewFieldAuthority({ parserReportable: true, extracted: true, capability: "gross_sale_volume",
      admission: futureFullAdmission })).toBe("admitted_with_conditions");
    expect(reviewFieldAuthority({ parserReportable: true, extracted: true, capability: "submitted_transaction_count",
      admission: futureFullAdmission })).toBe("observational");
  });

  it("keeps many observed fee rows at unproven coverage without an exact coverage admission", () => {
    expect(reviewFeeDetailCoverage({ parserReportable: true, observedRowCount: 10_000, admission: null })).toEqual({
      authority: "observational",
      coverageState: "unproven",
      description: "10000 fee occurrence(s) observed; fee-detail coverage is unproven.",
    });
  });

  it("uses exact matched mapping coverage only when fee detail is an authorized capability", () => {
    expect(reviewFeeDetailCoverage({ parserReportable: true, observedRowCount: 2, admission: {
      mappingId: "short_mapping",
      lifecycle: "admitted_with_conditions",
      supportedCapabilities: ["fee_detail"],
      feeDetailCoverage: "complete_observed_occurrences",
    } })).toMatchObject({ authority: "admitted_with_conditions", coverageState: "complete_observed_occurrences" });
  });
});
