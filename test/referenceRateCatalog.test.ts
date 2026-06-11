import { describe, expect, it } from "vitest";
import { classifyFiservProcessorFeeRow } from "../src/fiservProcessorFeeClassification.js";
import { wellsFargo2026ReferenceRateCatalog } from "../src/referenceRateCatalogData.js";
import { findReferenceRateMatch, isAtCostProofEligible, type ReferenceRateCatalogRow } from "../src/referenceRateCatalog.js";

const us2026Context = {
  statementPeriodStart: "2026-04-30",
  region: "US" as const,
  processorName: "Fiserv / First Data",
};

const us2024Context = {
  statementPeriodStart: "2024-12-31",
  region: "US" as const,
  processorName: "Fiserv / First Data",
};

describe("reference rate catalog", () => {
  it("does not let 2026 source rows prove 2024 statement fees", () => {
    const match = findReferenceRateMatch(
      {
        description: "NABU FEES",
        network: "MASTERCARD",
        amount: 1.38,
        volumeBasis: null,
        count: 71,
        rate: 0.0195,
      },
      us2024Context,
      wellsFargo2026ReferenceRateCatalog,
    );

    expect(match.status).toBe("no_period_correct_reference");
    expect(match.passedThroughAtCostKnown).toBe(false);
    expect(match.catalogFeeCode).toBeNull();
  });

  it("proves a 2026 network fee when label, period, basis, and rate match", () => {
    const match = findReferenceRateMatch(
      {
        description: "NABU FEES",
        network: "MASTERCARD",
        amount: 1.38,
        volumeBasis: null,
        count: 71,
        rate: 0.0195,
      },
      us2026Context,
      wellsFargo2026ReferenceRateCatalog,
    );

    expect(match.status).toBe("rate_matches_reference");
    expect(match.passedThroughAtCostKnown).toBe(true);
    expect(match.lineRateMatchesReference).toBe(true);
    expect(match.catalogFeeCode).toBe("MC_NABU_AUTH_US_2026_04");
    expect(match.catalogRate).toBe(0.0195);
  });

  it("derives a rate from count when the statement line does not print one", () => {
    const match = findReferenceRateMatch(
      {
        description: "ACQR PROCESSOR FEES",
        network: "VISA",
        amount: 0.9555,
        volumeBasis: null,
        count: 49,
        rate: null,
      },
      us2026Context,
      wellsFargo2026ReferenceRateCatalog,
    );

    expect(match.status).toBe("rate_matches_reference");
    expect(match.comparedBasis).toBe("derived_from_count");
    expect(match.comparedValue).toBe(0.0195);
    expect(match.passedThroughAtCostKnown).toBe(true);
  });

  it("flags a line above the reference rate instead of widening tolerance", () => {
    const match = findReferenceRateMatch(
      {
        description: "NABU FEES",
        network: "MASTERCARD",
        amount: 2.09,
        volumeBasis: null,
        count: 71,
        rate: null,
      },
      us2026Context,
      wellsFargo2026ReferenceRateCatalog,
    );

    expect(match.status).toBe("rate_exceeds_reference");
    expect(match.lineRateMatchesReference).toBe(false);
    expect(match.passedThroughAtCostKnown).toBe(false);
    expect(match.catalogFeeCode).toBe("MC_NABU_AUTH_US_2026_04");
  });

  it("keeps matching reference rows from proving at-cost when the source row is not proof eligible", () => {
    const draftRow: ReferenceRateCatalogRow = {
      ...wellsFargo2026ReferenceRateCatalog.find((row) => row.feeCode === "MC_NABU_AUTH_US_2026_04")!,
      feeCode: "DRAFT_MC_NABU_AUTH_US_2026_04",
      confidence: "draft",
      atCostProofEligible: false,
    };

    expect(isAtCostProofEligible(draftRow)).toBe(false);

    const match = findReferenceRateMatch(
      {
        description: "NABU FEES",
        network: "MASTERCARD",
        amount: 1.38,
        volumeBasis: null,
        count: 71,
        rate: 0.0195,
      },
      us2026Context,
      [draftRow],
    );

    expect(match.status).toBe("not_proof_eligible");
    expect(match.lineRateMatchesReference).toBe(true);
    expect(match.passedThroughAtCostKnown).toBe(false);
  });

  it("feeds source-backed reference matches into Fiserv fee classification without weakening the date gate", () => {
    const line = {
      description: "NABU FEES",
      network: "MASTERCARD",
      type: "CF",
      amount: 1.38,
      volumeBasis: null,
      count: 71,
      rate: 0.0195,
    };

    const oldPeriodClassification = classifyFiservProcessorFeeRow(line, {
      statementCostExposure: "itemized",
      referenceRateCatalog: wellsFargo2026ReferenceRateCatalog,
      statementPeriodStart: "2024-12-31",
      region: "US",
      processorName: "Fiserv / First Data",
    });

    expect(oldPeriodClassification.atCostStatus).toBe("indeterminate");
    expect(oldPeriodClassification.atCostReasonCode).toBe("NO_REFERENCE_FOR_PERIOD");
    expect(oldPeriodClassification.passedThroughAtCostKnown).toBe(false);

    const currentPeriodClassification = classifyFiservProcessorFeeRow(line, {
      statementCostExposure: "itemized",
      referenceRateCatalog: wellsFargo2026ReferenceRateCatalog,
      statementPeriodStart: "2026-04-30",
      region: "US",
      processorName: "Fiserv / First Data",
    });

    expect(currentPeriodClassification.atCostStatus).toBe("proven_at_cost");
    expect(currentPeriodClassification.atCostReasonCode).toBe("RATE_MATCHES_REFERENCE");
    expect(currentPeriodClassification.passedThroughAtCostKnown).toBe(true);
    expect(currentPeriodClassification.catalogFeeCode).toBe("MC_NABU_AUTH_US_2026_04");
  });
});
