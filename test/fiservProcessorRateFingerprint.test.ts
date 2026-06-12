import { describe, expect, it } from "vitest";
import { classifyFiservProcessorFeeRow } from "../src/fiservProcessorFeeClassification.js";
import { findFiservProcessorRateFingerprint } from "../src/fiservProcessorRateFingerprint.js";

const context = {
  statementCostExposure: "itemized" as const,
  statementPeriodStart: "2026-04-30",
  region: "US" as const,
  processorName: "Fiserv / First Data",
};

describe("Fiserv processor rate fingerprint classification", () => {
  it("matches OCR-damaged compact aliases against source-backed network fees", () => {
    const row = {
      description: "FILE TRANSMISSIONFEE",
      network: "VISA",
      type: "CF",
      amount: 0.25,
      volumeBasis: null,
      count: 100,
      rate: 0.0025,
    };

    const evidence = findFiservProcessorRateFingerprint(row, context);
    const classification = classifyFiservProcessorFeeRow(row, context);

    expect(evidence).toMatchObject({
      kind: "compact_alias_reference_rate",
      status: "rate_matches_reference",
      catalogFeeCode: "VISA_BASE_II_FILE_TRANSMISSION_US_2026_04",
    });
    expect(classification).toMatchObject({
      economicBucket: "card_brand_pass_through",
      rule: "FISERV_COMPACT_ALIAS_REFERENCE_RATE",
      atCostStatus: "proven_at_cost",
      atCostReasonCode: "RATE_MATCHES_REFERENCE",
      passedThroughAtCostKnown: true,
    });
  });

  it("uses rate-only fingerprints only when network identity and safe fee tokens are present", () => {
    const networkFee = {
      description: "ACQ PROC FEE",
      network: "VISA",
      type: "CF",
      amount: 0.975,
      volumeBasis: null,
      count: 50,
      rate: null,
    };
    const genericProcessorFee = {
      description: "SYSTEM PROCESSING FEE",
      network: "VISA",
      type: "CF",
      amount: 0.975,
      volumeBasis: null,
      count: 50,
      rate: null,
    };

    expect(classifyFiservProcessorFeeRow(networkFee, context)).toMatchObject({
      economicBucket: "card_brand_pass_through",
      confidence: "medium",
      rule: "FISERV_RATE_ONLY_REFERENCE_FINGERPRINT",
      catalogFeeCode: "VISA_APF_CREDIT_US_2026_04",
    });
    expect(classifyFiservProcessorFeeRow(genericProcessorFee, context)).toMatchObject({
      economicBucket: "unknown_needs_review",
      rule: "FISERV_NO_SPECIFIC_RULE",
    });
  });

  it("recognizes Durbin regulated debit cap math without treating it as at-cost proof", () => {
    const row = {
      description: "VISA DEBIT INTERCHANGE",
      network: "VISA DEBIT",
      type: "INTERCHANGE CHARGES",
      amount: 22.5,
      volumeBasis: 1000,
      count: 100,
      rate: null,
    };

    const classification = classifyFiservProcessorFeeRow(row, {
      statementCostExposure: "itemized",
    });

    expect(classification).toMatchObject({
      economicBucket: "card_brand_pass_through",
      confidence: "high",
      rule: "FISERV_DURBIN_REGULATED_DEBIT_CAP_FINGERPRINT",
      atCostStatus: "indeterminate",
      atCostReasonCode: "DURBIN_REGULATED_DEBIT_CAP_MATCH",
      passedThroughAtCostKnown: false,
      catalogFeeCode: "REG_II_DEBIT_CAP_WITH_FRAUD_ADJUSTMENT",
    });
    expect(classification.comparedValue).toBe(0.0225);
    expect(classification.catalogRate).toBe(0.0225);
  });
});
