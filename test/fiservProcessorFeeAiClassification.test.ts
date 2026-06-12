import { describe, expect, it } from "vitest";
import { classifyFiservProcessorFeeLedgerRows } from "../src/fiservProcessorFeeClassification.js";
import {
  applyFiservProcessorFeeAiSuggestions,
  buildFiservProcessorFeeAiPacket,
  maybeRunFiservProcessorFeeAiClassification,
  type FiservProcessorFeeAiContext,
} from "../src/fiservProcessorFeeAiClassification.js";

const context: FiservProcessorFeeAiContext = {
  processorPlatform: "fiserv_first_data_processor_statement",
  visibleBrand: "Paysafe Payment Processing",
  merchantName: "PHILIP FUTUREMARKET LLC",
  merchantNumber: "4228993800141883",
  statementPeriodStart: "2025-10-01",
  statementPeriodEnd: "2025-10-31",
  pricingModel: "tiered_pricing",
  totalVolume: 8010.7,
  totalFees: 378.55,
  effectiveRate: 0.04725555,
};

const rows = [
  {
    date: "10/31/25",
    type: "CF",
    network: "AMEXCT043",
    description: "SYSTEM PROCESSING FEE",
    amount: 24.74,
    volumeBasis: 6185.9,
    count: null,
    rate: 0.004,
  },
  {
    date: "10/31/25",
    type: "CF",
    network: "AMEXCT043",
    description: "CPU GTWY",
    amount: 1.8,
    volumeBasis: null,
    count: 9,
    rate: 0.2,
  },
];

describe("Fiserv processor AI fee classification", () => {
  it("builds a structured AI packet from unresolved rows only", () => {
    const deterministic = classifyFiservProcessorFeeLedgerRows(rows, 26.54);

    const packet = buildFiservProcessorFeeAiPacket(deterministic.rows, deterministic.summary, context);

    expect(packet.context).toMatchObject({
      processorPlatform: "fiserv_first_data_processor_statement",
      visibleBrand: "Paysafe Payment Processing",
      pricingModel: "tiered_pricing",
    });
    expect(packet.unresolvedRows).toEqual([
      expect.objectContaining({
        rowIndex: 0,
        network: "AMEXCT043",
        description: "SYSTEM PROCESSING FEE",
        amount: 24.74,
        volumeBasis: 6185.9,
        rate: 0.004,
      }),
    ]);
    expect(packet.unresolvedRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "CPU GTWY",
        }),
      ]),
    );
  });

  it("applies medium-or-better AI suggestions to unresolved rows and recomputes the summary", () => {
    const deterministic = classifyFiservProcessorFeeLedgerRows(rows, 26.54);

    const result = applyFiservProcessorFeeAiSuggestions(
      deterministic.rows,
      26.54,
      [
        {
          rowIndex: 0,
          economicBucket: "processor_controlled_flat_discount_fee",
          confidence: "medium",
          subcategory: "processor_percentage_markup",
          negotiability: "likely_negotiable",
          reasonCodes: ["GENERIC_PROCESSOR_LABEL", "RATE_TIMES_VOLUME"],
          explanation: "Percentage fee on Amex volume with a generic processor processing label.",
        },
      ],
      { applyMinConfidence: "medium", modelName: "test-model" },
    );

    expect(result.ai).toMatchObject({
      status: "applied",
      model: "test-model",
      unresolvedInputRowCount: 1,
      suggestionCount: 1,
      appliedSuggestionCount: 1,
      skippedSuggestionCount: 0,
    });
    expect(result.summary).toMatchObject({
      status: "validated",
      unresolvedRowCount: 0,
      totalClassifiedAmount: 26.54,
      printedTotal: 26.54,
      delta: 0,
    });
    expect(result.rows[0].classification).toMatchObject({
      economicBucket: "processor_controlled_flat_discount_fee",
      confidence: "medium",
      rule: "AI_FEE_CLASSIFICATION_SUGGESTION",
      atCostStatus: "not_applicable",
      atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
      marginAmountKnown: true,
    });
    expect(result.rows[1].classification).toMatchObject({
      economicBucket: "processor_transaction_or_auth",
      rule: "FISERV_TRANSACTION_AUTH_OR_BATCH_FEE",
    });
  });

  it("leaves low-confidence AI suggestions unresolved when the apply threshold is medium", () => {
    const deterministic = classifyFiservProcessorFeeLedgerRows(rows, 26.54);

    const result = applyFiservProcessorFeeAiSuggestions(
      deterministic.rows,
      26.54,
      [
        {
          rowIndex: 0,
          economicBucket: "processor_controlled_flat_discount_fee",
          confidence: "low",
          subcategory: "processor_percentage_markup",
          negotiability: "likely_negotiable",
          reasonCodes: ["GENERIC_PROCESSOR_LABEL"],
          explanation: "Weak processor-label evidence.",
        },
      ],
      { applyMinConfidence: "medium" },
    );

    expect(result.ai).toMatchObject({
      status: "no_usable_suggestions",
      appliedSuggestionCount: 0,
      skippedSuggestionCount: 1,
    });
    expect(result.summary.unresolvedRowCount).toBe(1);
    expect(result.rows[0].classification).toMatchObject({
      economicBucket: "unknown_needs_review",
      rule: "FISERV_NO_SPECIFIC_RULE",
    });
  });

  it("runs against a mocked Anthropic SDK and preserves deterministic fallback when disabled", async () => {
    const deterministic = classifyFiservProcessorFeeLedgerRows(rows, 26.54);

    const disabled = await maybeRunFiservProcessorFeeAiClassification(
      deterministic.rows,
      deterministic.summary,
      26.54,
      context,
      { enabled: false },
    );

    expect(disabled.ai.status).toBe("disabled");
    expect(disabled.summary).toEqual(deterministic.summary);

    const prompts: string[] = [];
    const mocked = await maybeRunFiservProcessorFeeAiClassification(
      deterministic.rows,
      deterministic.summary,
      26.54,
      context,
      {
        enabled: true,
        apiKey: "test-key",
        modelName: "claude-opus-test",
        sdk: {
          anthropic: (modelName: string) => ({ modelName }),
          generateObject: async (options: Record<string, unknown>) => {
            prompts.push(String(options.prompt ?? ""));
            return {
              object: {
                rows: [
                  {
                    rowIndex: 0,
                    economicBucket: "processor_controlled_flat_discount_fee",
                    confidence: "high",
                    subcategory: "processor_percentage_markup",
                    negotiability: "likely_negotiable",
                    reasonCodes: ["GENERIC_PROCESSOR_LABEL", "RATE_TIMES_VOLUME"],
                    explanation: "Generic processor label charged as a percentage of Amex volume.",
                  },
                ],
              },
            };
          },
        },
      },
    );

    expect(mocked.ai).toMatchObject({
      status: "applied",
      model: "claude-opus-test",
      appliedSuggestionCount: 1,
    });
    expect(prompts[0]).toContain("SYSTEM PROCESSING FEE");
    expect(prompts[0]).toContain("Do not claim pass-through-at-cost proof");
  });

  it("preserves deterministic classifications when the AI call times out", async () => {
    const deterministic = classifyFiservProcessorFeeLedgerRows(rows, 26.54);

    const result = await maybeRunFiservProcessorFeeAiClassification(
      deterministic.rows,
      deterministic.summary,
      26.54,
      context,
      {
        enabled: true,
        apiKey: "test-key",
        modelName: "claude-opus-test",
        timeoutMs: 1,
        sdk: {
          anthropic: (modelName: string) => ({ modelName }),
          generateObject: async () => new Promise(() => {}),
        },
      },
    );

    expect(result.ai).toMatchObject({
      status: "failed",
      model: "claude-opus-test",
      appliedSuggestionCount: 0,
    });
    expect(result.rows).toEqual(deterministic.rows);
    expect(result.summary.unresolvedRowCount).toBe(deterministic.summary.unresolvedRowCount);
    expect(result.summary.notes).toEqual(expect.arrayContaining([expect.stringContaining("timed out")]));
  });
});
