import path from "node:path";
import { describe, expect, it } from "vitest";
import { maybeRunBenchmarkCategoryAiInferenceForParserOutput } from "../src/benchmarkCategoryAiInference.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
} from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";

const PAYSAFE_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_PAYSAFE_Febr_2024.pdf");
const EL_NUEVO_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");

describe("AI benchmark category inference", () => {
  it("applies AI category inference when deterministic resolution falls back to default", async () => {
    const doc = await parsePdf(PAYSAFE_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, {
      sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf",
    });
    let prompt = "";

    expect(parsed.fiservFeeAnalysisV2.benchmarkCategoryResolution).toMatchObject({
      categoryId: "default",
      source: "default",
    });

    const result = await maybeRunBenchmarkCategoryAiInferenceForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "category-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          return {
            object: {
              categoryId: "retail",
              confidence: "medium",
              evidence: ["Merchant name is ambiguous, but fee pattern is consistent with a retail card-present account."],
              alternatives: [{ categoryId: "default", confidence: "low", reason: "Merchant name alone is not specific." }],
              highRiskSignal: false,
              notes: ["AI used statement context because deterministic category was default."],
            },
          };
        },
      },
    });

    expect(prompt).toContain("Available categories");
    expect(prompt).toContain("fiserv_PAYSAFE_Febr_2024.pdf");
    expect(result.benchmarkCategoryAi).toMatchObject({
      status: "applied",
      provider: "anthropic",
      model: "category-test-model",
      categoryId: "retail",
      confidence: "medium",
      applied: true,
    });
    expect(result.output.fiservFeeAnalysisV2.benchmarkCategoryResolution).toMatchObject({
      categoryId: "retail",
      source: "ai_inferred",
      deterministicCategoryId: "default",
      aiSuggestedCategoryId: "retail",
    });
    expect(result.output.fiservFeeAnalysisV2.effectiveRateBenchmarkAnalysis).toMatchObject({
      categoryId: "retail",
      categorySource: "ai_inferred",
    });
  });

  it("does not call AI when deterministic statement evidence already resolves the category", async () => {
    const doc = await parsePdf(EL_NUEVO_PDF_PATH);
    const parsed = fiservFirstDataFullStatementDriver.parse(doc, {
      sourceFileName: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
    });
    let called = false;

    expect(parsed.fiservFeeAnalysisV2.benchmarkCategoryResolution).toMatchObject({
      categoryId: "restaurant",
      source: "deterministic",
    });

    const result = await maybeRunBenchmarkCategoryAiInferenceForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async () => {
          called = true;
          return { object: { categoryId: "retail", confidence: "low", evidence: [], alternatives: [], highRiskSignal: false, notes: [] } };
        },
      },
    });

    expect(called).toBe(false);
    expect(result.benchmarkCategoryAi.status).toBe("not_needed");
    expect(result.output.fiservFeeAnalysisV2.benchmarkCategoryResolution).toMatchObject({
      categoryId: "restaurant",
      source: "deterministic",
    });
  });

  it("records disabled status for weak categories when no AI credentials are configured", async () => {
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const doc = await parsePdf(PAYSAFE_PDF_PATH);
      const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, {
        sourceFileName: "fiserv_PAYSAFE_Febr_2024.pdf",
      });

      const result = await maybeRunBenchmarkCategoryAiInferenceForParserOutput(parsed);

      expect(result.benchmarkCategoryAi).toMatchObject({
        status: "disabled",
        provider: null,
        model: null,
        attempted: false,
        applied: false,
      });
      expect(result.benchmarkCategoryAi.notes).toContain("AI benchmark category inference requires ANTHROPIC_API_KEY or OPENAI_API_KEY.");
      expect(result.output.fiservFeeAnalysisV2.benchmarkCategoryResolution.categoryId).toBe("default");
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
