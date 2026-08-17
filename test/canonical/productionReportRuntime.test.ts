import { describe, expect, it } from "vitest";
import { buildProductionReportFromRuntime } from "../../src/canonical/productionReportRuntime.js";
import { parsePdf } from "../../src/parser.js";

describe("Package 3 production report runtime", () => {
  it("runs canonical analysis, safe merchant-language degradation, and report projection in the required order", async () => {
    const document = await parsePdf("test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf");
    const result = await buildProductionReportFromRuntime({
      document,
      businessType: "restaurant_food_beverage",
      runtimeDocumentRef: "job_package_3_runtime_integration",
      wholeStatementFeeIntelligence: { enabled: false },
      merchantLanguageInterpretation: { anthropicApiKey: "", openAiApiKey: "" },
    });

    expect(result.projection.experience).toBe("analysis_available_with_open_questions");
    expect(result.projection.report).not.toBeNull();
    expect(result.projection.report!.merchantLanguage).toEqual({ source: "deterministic_fallback", degraded: true });
    expect(result.merchantLanguageRuntime).toMatchObject({ status: "provider_unavailable", attempted: false });
    expect(result.projection.header).not.toHaveProperty("merchantName");
    expect(JSON.stringify(result.merchantLanguageRuntime)).not.toMatch(/providerName|modelName|prompt|response|apiKey/i);
  });
});
