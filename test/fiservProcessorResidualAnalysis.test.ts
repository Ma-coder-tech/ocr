import { describe, expect, it } from "vitest";
import { classifyFiservProcessorFeeLedgerRows } from "../src/fiservProcessorFeeClassification.js";

describe("Fiserv processor fee residual analysis", () => {
  it("separates card-brand, known processor, and unclassified residual pools", () => {
    const result = classifyFiservProcessorFeeLedgerRows(
      [
        {
          description: "INTERCHANGE",
          network: "VISA",
          type: "CF",
          amount: 43.74,
          volumeBasis: null,
          count: null,
          rate: null,
        },
        {
          description: "DISC 1",
          network: "VISA",
          type: "CF",
          amount: 5.61,
          volumeBasis: 2805,
          count: null,
          rate: 0.002,
        },
        {
          description: "CPU GTWY",
          network: "VISA",
          type: "CF",
          amount: 27.9,
          volumeBasis: null,
          count: 93,
          rate: 0.3,
        },
        {
          description: "STATEMENT FEE",
          network: null,
          type: "MISC",
          amount: 13.95,
          volumeBasis: null,
          count: null,
          rate: null,
        },
      ],
      91.19,
    );

    expect(result.summary.residualAnalysis).toMatchObject({
      basis: "printed_total",
      basisTotal: 91.19,
      identifiedCardBrandPassThroughAmount: 43.74,
      knownProcessorFeeAmount: 47.46,
      unbundledProcessorControlledAmount: 0,
      unresolvedAmount: 0,
      markupOrUnknownPoolAmount: 47.45,
      residualUnclassifiedAmount: -0.01,
      rowSumDeltaToBasis: -0.01,
    });
  });

  it("keeps tiered processor fees separate from unresolved rows", () => {
    const result = classifyFiservProcessorFeeLedgerRows(
      [
        {
          description: "INTERCHANGE",
          network: "MASTERCARD",
          type: "CF",
          amount: 13.84,
          volumeBasis: null,
          count: null,
          rate: null,
        },
        {
          description: "MQUAL DISC",
          network: "MASTERCARD",
          type: "CF",
          amount: 307.75,
          volumeBasis: 8000,
          count: null,
          rate: 0.0384,
        },
        {
          description: "CPU GTWY",
          network: "VISA",
          type: "CF",
          amount: 17.02,
          volumeBasis: null,
          count: 85,
          rate: 0.2,
        },
        {
          description: "SYSTEM PROCESSING FEE",
          network: "AMEXCT043",
          type: "CF",
          amount: 39.93,
          volumeBasis: 6185.9,
          count: null,
          rate: 0.004,
        },
      ],
      378.55,
    );

    expect(result.summary).toMatchObject({
      unresolvedRowCount: 1,
      needsUnbundlingRowCount: 1,
    });
    expect(result.summary.residualAnalysis).toMatchObject({
      basisTotal: 378.55,
      identifiedCardBrandPassThroughAmount: 13.84,
      knownProcessorFeeAmount: 17.02,
      unbundledProcessorControlledAmount: 307.75,
      unresolvedAmount: 39.93,
      markupOrUnknownPoolAmount: 364.71,
      residualUnclassifiedAmount: 39.94,
      rowSumDeltaToBasis: 0.01,
    });
  });
});
