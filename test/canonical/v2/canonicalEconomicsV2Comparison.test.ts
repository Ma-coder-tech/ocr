import { describe, expect, it } from "vitest";

import type { CanonicalStatementAnalysis } from "../../../src/canonical/types.js";
import {
  assertNoUnexpectedCanonicalV2Divergence,
  buildCanonicalEconomicsV2FromFiserv,
  compareCanonicalV1ToV2,
} from "../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "./fixtures.js";

describe("Canonical Economics V2 shadow comparison", () => {
  it("classifies invariant facts and every intentional difference without unexplained divergence", () => {
    const v2 = buildV2();
    const report = compareCanonicalV1ToV2(v1ComparisonFixture(), v2);

    expect(report.hasUnexpectedDivergence).toBe(false);
    expect(report.counts.same_semantic_fact).toBeGreaterThanOrEqual(4);
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ fact: "simultaneous_gross_refund_net_populations", amendmentId: "RB-AMEND-001-MULTI-POPULATION" }),
      expect.objectContaining({ fact: "headline_average_ticket", amendmentId: "RB-AMEND-003-GROSS-AVERAGE-TICKET" }),
      expect.objectContaining({ fact: "adjustment_refund_credit_chargeback_direction", amendmentId: "RB-AMEND-004-FINANCIAL-DIRECTION" }),
      expect.objectContaining({ fact: "repeated_source_representations", amendmentId: "RB-AMEND-005-REPRESENTATION-CONTRIBUTION" }),
    ]));
    expect(() => assertNoUnexpectedCanonicalV2Divergence(report)).not.toThrow();
  });

  it("treats any unexplained core-money difference as a stop condition", () => {
    const v2 = structuredClone(buildV2());
    v2.financialPopulations.canonicalNetSubmittedCardVolume.value!.amountMinor += 1;
    const report = compareCanonicalV1ToV2(v1ComparisonFixture(), v2);

    expect(report.hasUnexpectedDivergence).toBe(true);
    expect(report.items).toContainEqual(expect.objectContaining({ fact: "net_submitted", classification: "unexpected_divergence" }));
    expect(() => assertNoUnexpectedCanonicalV2Divergence(report)).toThrow(/product-owner review/);
  });
});

function buildV2() {
  const fixture = v2SyntheticStatement();
  return buildCanonicalEconomicsV2FromFiserv({
    ...fixture,
    sourceDocumentRef: "SYNTH-RB-COMPARISON",
    parserId: "synthetic_fiserv_foundation_parser",
    provenanceStatus: "approved_synthetic",
  });
}

function v1ComparisonFixture(): CanonicalStatementAnalysis {
  return {
    financialFacts: {
      processedSales: { value: { amountMinor: 90_000, currency: "USD" } },
      totalFees: { value: { amountMinor: 4_500, currency: "USD" } },
      amountFunded: { value: { amountMinor: 84_500, currency: "USD" } },
      refunds: { value: { amountMinor: 10_000, currency: "USD" } },
      rateRevealCalculatedAllInRate: { value: "0.050000" },
      transactionCounts: {
        refunds: { value: 2 },
        cardTypeItems: { value: null },
      },
      averageTicket: { value: null },
      averageTicketBasis: { selectedVolumePopulation: "submitted_sales", selectedCountType: null },
    },
  } as unknown as CanonicalStatementAnalysis;
}
