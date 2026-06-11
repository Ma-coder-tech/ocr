import { createRequire } from "node:module";
import type { AnalysisSummary } from "./types.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ text: string }>;
type AnthropicModelFactory = (modelName: string) => unknown;
type RefinementObject = {
  confidence: "high" | "medium" | "low";
  insights: Array<{
    title: string;
    detail: string;
    impactUsd: number;
  }>;
  dynamicFields: Array<{
    label: string;
    value: number;
    confidence: number;
  }>;
};

function loadAiSdk(): {
  generateObject: GenerateObject;
  generateText: GenerateText;
  anthropic: AnthropicModelFactory;
} {
  const ai = require("ai") as { generateObject: GenerateObject; generateText: GenerateText };
  const anthropicSdk = require("@ai-sdk/anthropic") as { anthropic: AnthropicModelFactory };
  return {
    generateObject: ai.generateObject,
    generateText: ai.generateText,
    anthropic: anthropicSdk.anthropic,
  };
}

function loadZod() {
  return require("zod/v3") as {
    z: {
      object: (shape: Record<string, unknown>) => unknown;
      enum: (values: readonly [string, ...string[]]) => unknown;
      array: (schema: unknown) => unknown;
      string: () => unknown;
      number: () => unknown;
    };
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export async function maybeRunAiRefinement(summary: AnalysisSummary): Promise<AnalysisSummary> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!hasKey) {
    return summary;
  }

  const modelName = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const maxInputTokens = Number(process.env.AI_MAX_INPUT_TOKENS ?? 4000);
  const maxOutputTokens = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 600);

  const prompt = [
    "Refine this merchant fee analysis output.",
    "Keep it factual and concise.",
    "Do not invent values.",
    "Return valid JSON matching the schema keys: confidence, insights, dynamicFields.",
    "Output only JSON.",
    JSON.stringify(summary),
  ].join("\n\n");

  const { z } = loadZod();
  const schema = z.object({
    confidence: z.enum(["high", "medium", "low"]),
    insights: z.array(
      z.object({
        title: z.string(),
        detail: z.string(),
        impactUsd: z.number(),
      }),
    ),
    dynamicFields: z.array(
      z.object({
        label: z.string(),
        value: z.number(),
        confidence: z.number(),
      }),
    ),
  });

  const parseRefinement = (value: unknown): RefinementObject => {
    return (schema as { parse: (value: unknown) => RefinementObject }).parse(value);
  };

  const normalize = (object: RefinementObject): AnalysisSummary => {
    return {
      ...summary,
      confidence: object.confidence,
      insights: object.insights
        .map((item) => ({
          title: String(item.title ?? "").trim(),
          detail: String(item.detail ?? "").trim(),
          impactUsd: Number.isFinite(item.impactUsd) ? Math.max(0, item.impactUsd) : 0,
        }))
        .filter((item) => item.title.length > 0 && item.detail.length > 0)
        .slice(0, 12),
      dynamicFields: object.dynamicFields
        .map((item) => ({
          label: String(item.label ?? "").trim(),
          value: Number.isFinite(item.value) ? item.value : 0,
          confidence: Number.isFinite(item.confidence) ? Math.min(1, Math.max(0, item.confidence)) : 0.5,
        }))
        .filter((item) => item.label.length > 0)
        .slice(0, 12),
    };
  };

  let sdk: ReturnType<typeof loadAiSdk> | null = null;

  try {
    sdk = loadAiSdk();

    const result = await sdk.generateObject({
      model: sdk.anthropic(modelName),
      schema,
      prompt,
      maxOutputTokens,
      temperature: 0,
      // Keep the cost bounded on free-tier jobs.
      providerOptions: {
        anthropic: {
          maxInputTokens,
        },
      },
    });
    const refined = normalize(parseRefinement(result.object));
    console.log("[ai-refinement] success");
    return refined;
  } catch (error) {
    console.error("[ai-refinement-error]", error instanceof Error ? error.message : error);
    if (!sdk) {
      return summary;
    }

    try {
      const retry = await sdk.generateText({
        model: sdk.anthropic(modelName),
        prompt,
        maxOutputTokens,
        temperature: 0,
        providerOptions: {
          anthropic: {
            maxInputTokens,
          },
        },
      });

      const jsonCandidate = extractJsonObject(retry.text);
      if (!jsonCandidate) {
        throw new Error("No JSON object found in text response");
      }
      const parsed = parseRefinement(JSON.parse(jsonCandidate));
      const refined = normalize(parsed);
      console.log("[ai-refinement] success-retry");
      return refined;
    } catch (retryError) {
      console.error("[ai-refinement-retry-error]", retryError instanceof Error ? retryError.message : retryError);
      // Deterministic output is always acceptable fallback.
      return summary;
    }
  }
}
