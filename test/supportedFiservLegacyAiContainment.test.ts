import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BusinessTypeId } from "../src/businessTypes.js";

const legacyAi = vi.hoisted(() => ({
  notice: vi.fn(async (output: unknown) => ({ output })),
  benchmark: vi.fn(async (output: unknown) => ({ output })),
  processorFee: vi.fn(async (output: unknown) => ({ output })),
  feeV2: vi.fn(async (output: unknown) => ({ output })),
  anomaly: vi.fn(async (output: unknown) => ({ output })),
  narrative: vi.fn(async (output: unknown) => ({ output })),
}));

vi.mock("../src/statementNoticeAiExtraction.js", () => ({
  maybeRunStatementNoticeAiExtractionForParserOutput: legacyAi.notice,
}));
vi.mock("../src/benchmarkCategoryAiInference.js", () => ({
  maybeRunBenchmarkCategoryAiInferenceForParserOutput: legacyAi.benchmark,
}));
vi.mock("../src/fiservProcessorFeeAiClassification.js", () => ({
  maybeRunFiservProcessorFeeAiClassificationForParserOutput: legacyAi.processorFee,
}));
vi.mock("../src/fiservFeeAnalysisAiClassification.js", () => ({
  maybeRunFiservFeeAnalysisAiClassificationForParserOutput: legacyAi.feeV2,
}));
vi.mock("../src/fullStatementAnomalyReviewAi.js", () => ({
  maybeRunFullStatementAnomalyReviewForParserOutput: legacyAi.anomaly,
}));
vi.mock("../src/merchantNarrativeAi.js", () => ({
  maybeRunMerchantNarrativeAiForParserOutput: legacyAi.narrative,
}));

import { parsePdf } from "../src/parser.js";
import {
  analyzeStatementDocument,
  analyzeStatementDocumentWithOptionalAi,
} from "../src/statementParserOrchestrator.js";

const FIXTURE_ROOT = path.join(process.cwd(), "test", "fixtures", "pdfs");
const GOLD: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("supported-Fiserv legacy AI containment", () => {
  it("preserves deterministic output across all 11 Gold statements with every legacy feature eligible", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("AI_NOTICE_EXTRACTION_ENABLED", "true");
    vi.stubEnv("AI_BENCHMARK_CATEGORY_ENABLED", "true");
    vi.stubEnv("AI_FEE_CLASSIFICATION_ENABLED", "true");
    vi.stubEnv("AI_FULL_STATEMENT_ANOMALY_ENABLED", "true");
    vi.stubEnv("AI_MERCHANT_NARRATIVE_ENABLED", "true");

    for (const fixture of GOLD) {
      const document = await parsePdf(path.join(FIXTURE_ROOT, fixture.file));
      const options = { sourceFileName: fixture.file };
      const deterministic = analyzeStatementDocument(document, fixture.businessType, options);
      const contained = await analyzeStatementDocumentWithOptionalAi(document, fixture.businessType, options);
      const structured = contained.fiservFeeAnalysisV2 as Record<string, any> | undefined;

      expect(contained.parserSource?.driverId, fixture.file).toBeTruthy();
      expect(contained, fixture.file).toEqual(deterministic);
      expect(structured?.aiNoticeExtraction, fixture.file).toBeUndefined();
      expect(structured?.benchmarkCategoryAi, fixture.file).toBeUndefined();
      expect(structured?.aiAnomalyReview, fixture.file).toBeUndefined();
      expect(structured?.aiMerchantNarrative, fixture.file).toBeUndefined();
      expect(
        (structured?.feeLedger?.rows ?? []).some(
          (row: any) => row.aiAssessment !== undefined || row.matchMethod === "ai_classified",
        ),
        fixture.file,
      ).toBe(false);
      expect(
        (structured?.findings ?? []).some((finding: any) => String(finding.kind).startsWith("ai_")),
        fixture.file,
      ).toBe(false);
    }

    expect(GOLD).toHaveLength(11);
    expect(legacyAi.notice).not.toHaveBeenCalled();
    expect(legacyAi.benchmark).not.toHaveBeenCalled();
    expect(legacyAi.processorFee).not.toHaveBeenCalled();
    expect(legacyAi.feeV2).not.toHaveBeenCalled();
    expect(legacyAi.anomaly).not.toHaveBeenCalled();
    expect(legacyAi.narrative).not.toHaveBeenCalled();
  }, 240_000);
});
