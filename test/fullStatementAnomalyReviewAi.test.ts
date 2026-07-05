import path from "node:path";
import { zodSchema } from "ai";
import { describe, expect, it } from "vitest";
import { maybeRunFullStatementAnomalyReviewForParserOutput } from "../src/fullStatementAnomalyReviewAi.js";
import { fiservFirstDataProcessorStatementDriver } from "../src/fiservFirstDataParser.js";
import { parsePdf } from "../src/parser.js";

const NXGEN_PDF_PATH = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf");

describe("AI full statement anomaly review", () => {
  it("applies an internal pricing-model override while adding merchant-safe anomaly findings", async () => {
    const doc = await parsePdf(NXGEN_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf" });
    const contradictory = {
      ...parsed,
      fiservFeeAnalysisV2: {
        ...parsed.fiservFeeAnalysisV2,
        pricingModel: {
          ...parsed.fiservFeeAnalysisV2.pricingModel,
          pricingModel: "flat_discount_pricing",
          confidence: "medium",
          analysisStatus: "universal_only_pending_model_rules",
          evidence: ["Uniform discount row was visible before final review."],
        },
      },
    };
    let prompt = "";

    const result = await maybeRunFullStatementAnomalyReviewForParserOutput(contradictory, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "anomaly-review-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async (options) => {
          prompt = String(options.prompt ?? "");
          return {
            object: {
              anomalies: [
                {
                  description: "Itemized interchange and network charges are present, so pricing should be evaluated as interchange-plus when assessing markup.",
                  severity: "medium",
                  estimatedImpact: null,
                  estimatedImpactRaw: "unknown",
                  recommendation: "Use the interchange-plus processor markup analysis before negotiating processor-controlled fees.",
                  confidence: "high",
                  evidence: ["Separate interchange rows are visible.", "Card-brand/network rows are itemized separately."],
                },
              ],
              overrides: [
                {
                  field: "pricing_model",
                  originalValue: "flat_discount_pricing",
                  correctedValue: "interchange_plus",
                  reason: "The fee rows include separate interchange and card-brand/network charges, so the uniform discount row is processor markup, not bundled flat-rate pricing.",
                },
              ],
              notes: ["Reviewed final statement analysis after fee classification and benchmarking."],
            },
          };
        },
      },
    });

    const analysis = result.output.fiservFeeAnalysisV2;

    expect(prompt).toContain("final AI safety-net reviewer");
    expect(prompt).toContain("Critical behavior");
    expect(prompt).toContain("rawFeeRows");
    expect(prompt).toContain("DUES & ASSESSMENTS");
    expect(analysis.pricingModel).toMatchObject({
      pricingModel: "interchange_plus",
      confidence: "medium",
      analysisStatus: "ic_plus_ready",
    });
    expect(result.aiAnomalyReview).toMatchObject({
      status: "applied",
      provider: "anthropic",
      model: "anomaly-review-test-model",
      anomalyCount: 1,
      overrideCount: 1,
      appliedOverrideCount: 1,
    });
    expect(result.aiAnomalyReview.overrides[0]).toMatchObject({
      field: "pricing_model",
      correctedValue: "interchange_plus",
      applied: true,
    });
    expect(analysis.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ai_statement_anomaly",
          severity: "warning",
          evidence: expect.arrayContaining([expect.stringContaining("Use the interchange-plus processor markup analysis")]),
        }),
      ]),
    );
    expect(analysis.findings.map((finding) => finding.title).join(" ")).not.toMatch(/system disagreed|contradiction/i);
  });

  it("records no_anomalies when the final review has nothing to add", async () => {
    const doc = await parsePdf(NXGEN_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf" });

    const result = await maybeRunFullStatementAnomalyReviewForParserOutput(parsed, {
      provider: "anthropic",
      anthropicApiKey: "test-key",
      modelName: "anomaly-review-test-model",
      sdk: {
        createAnthropic: () => () => ({ provider: "mock-anthropic" }),
        generateObject: async () => ({
          object: {
            anomalies: [],
            overrides: [],
            notes: ["No anomalies found."],
          },
        }),
      },
    });

    expect(result.aiAnomalyReview).toMatchObject({
      status: "no_anomalies",
      anomalyCount: 0,
      overrideCount: 0,
      appliedOverrideCount: 0,
    });
    expect(result.output.fiservFeeAnalysisV2.aiAnomalyReview).toMatchObject(result.aiAnomalyReview);
  });

  it("uses an OpenAI-compatible structured output schema", async () => {
    const doc = await parsePdf(NXGEN_PDF_PATH);
    const parsed = fiservFirstDataProcessorStatementDriver.parse(doc, { sourceFileName: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf" });
    let capturedSchema: unknown = null;

    const result = await maybeRunFullStatementAnomalyReviewForParserOutput(parsed, {
      provider: "openai",
      openAiApiKey: "test-openai-key",
      openAiModelName: "gpt-test",
      sdk: {
        openai: (modelName: string) => ({ provider: "openai", modelName }),
        Output: {
          object: (options) => {
            capturedSchema = options.schema;
            return { outputKind: "object", ...options };
          },
        },
        generateObject: async () => {
          throw new Error("OpenAI should use generateText.");
        },
        generateText: async () => ({
          output: {
            anomalies: [],
            overrides: [],
            notes: ["No anomalies found."],
          },
        }),
      },
    });

    expect(result.aiAnomalyReview.status).toBe("no_anomalies");
    expect(capturedSchema).toBeTruthy();
    const json = await zodSchema(capturedSchema as Parameters<typeof zodSchema>[0]).jsonSchema;
    expect(json.properties).toMatchObject({
      anomalies: expect.any(Object),
      overrides: expect.any(Object),
      notes: expect.any(Object),
    });
    expect(JSON.stringify(json)).not.toContain('"not":{}');
  });
});
