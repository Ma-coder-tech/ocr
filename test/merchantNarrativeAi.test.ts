import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMerchantNarrativeFactPacket,
  maybeRunMerchantNarrativeAiForParserOutput,
  type MerchantNarrativeSectionKey,
} from "../src/merchantNarrativeAi.js";
import { fiservFirstDataFullStatementDriver } from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";

const EL_NUEVO_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");

const sectionKeys: MerchantNarrativeSectionKey[] = [
  "executiveSummary",
  "pricingModel",
  "passThroughVerification",
  "processorControlledFees",
  "benchmarkConclusion",
  "noticesAndRepricing",
  "negotiationOpportunities",
  "caveats",
];

describe("AI merchant narrative generation", () => {
  it("builds a fact packet from structured Fiserv analysis", async () => {
    const doc = await parsePdf(EL_NUEVO_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, {
      sourceFileName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
    });

    const packet = buildMerchantNarrativeFactPacket(parsed);

    expect(packet.context).toMatchObject({
      hasFiservFeeAnalysisV2: true,
      pricingModel: "interchange_plus",
    });
    expect(packet.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "statement_01",
          topic: "statement",
          text: expect.stringContaining("effective rate"),
        }),
        expect.objectContaining({
          topic: "pricing_model",
          text: expect.stringContaining("Pricing model detected"),
        }),
        expect.objectContaining({
          topic: "rate_verification",
          text: expect.stringContaining("Rate verification counts"),
        }),
      ]),
    );
  });

  it("applies a source-bound merchant narrative and drops invalid fact references", async () => {
    const doc = await parsePdf(EL_NUEVO_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, {
      sourceFileName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
    });
    let prompt = "";

    const result = await maybeRunMerchantNarrativeAiForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "merchant-narrative-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          const packet = JSON.parse(prompt.split("Fact packet:\n\n").at(-1) ?? "{}") as {
            facts: Array<{ id: string; text: string }>;
          };
          const primaryFact = packet.facts[0]?.id ?? "statement_01";
          const sections = Object.fromEntries(
            sectionKeys.map((key) => [
              key,
              {
                title: key,
                summary: `Merchant-facing ${key} summary based only on provided facts.`,
                factIds: [primaryFact, "fake_fact"],
                bullets: [
                  {
                    text: `This ${key} bullet cites a valid fact.`,
                    factIds: [primaryFact],
                  },
                  {
                    text: "This bullet should be dropped because it has no valid fact id.",
                    factIds: ["fake_fact"],
                  },
                ],
              },
            ]),
          );
          return {
            object: {
              sections,
              actionItems: [
                {
                  priority: "high",
                  text: "Ask the processor to explain processor-controlled fees using the statement analysis.",
                  factIds: [primaryFact],
                },
                {
                  priority: "low",
                  text: "This action should be dropped.",
                  factIds: ["fake_fact"],
                },
              ],
              notes: ["Narrative is generated from cited facts only."],
            },
          };
        },
      },
    });

    expect(prompt).toContain("Use ONLY the provided facts");
    expect(prompt).toContain("Every section summary, bullet, and action item must cite factIds");
    expect(result.aiMerchantNarrative).toMatchObject({
      status: "applied",
      provider: "anthropic",
      model: "merchant-narrative-test-model",
      attempted: true,
    });
    expect(result.aiMerchantNarrative.factsUsed).not.toContain("fake_fact");
    expect(result.aiMerchantNarrative.sections.executiveSummary.bullets).toHaveLength(1);
    expect(result.aiMerchantNarrative.actionItems).toHaveLength(1);
    expect(result.output.fiservFeeAnalysisV2.aiMerchantNarrative).toMatchObject(result.aiMerchantNarrative);
  });

  it("records disabled status when no AI credentials are configured", async () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const doc = await parsePdf(EL_NUEVO_PDF_PATH);
      const parsed = fiservFirstDataFullStatementDriver.parse(doc, {
        sourceFileName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
      });

      const result = await maybeRunMerchantNarrativeAiForParserOutput(parsed);

      expect(result.aiMerchantNarrative).toMatchObject({
        status: "disabled",
        provider: null,
        model: null,
        attempted: false,
      });
      expect(result.aiMerchantNarrative.notes).toContain("AI merchant narrative generation requires ANTHROPIC_API_KEY or OPENAI_API_KEY.");
      expect(result.output.fiservFeeAnalysisV2.aiMerchantNarrative).toMatchObject(result.aiMerchantNarrative);
    } finally {
      if (originalAnthropicKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      }
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });
});
