import { createRequire } from "node:module";
import {
  applyBenchmarkCategoryAiSuggestionToFiservFeeAnalysisV2,
  type FiservFeeAnalysisV2,
} from "./fiservFeeAnalysis.js";
import {
  loadMccBenchmarkReference,
  type MccBenchmarkReference,
} from "./mccBenchmarkReference.js";
import type {
  BenchmarkCategoryAiSuggestion,
  BenchmarkCategoryConfidence,
} from "./benchmarkCategoryResolution.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type BenchmarkCategoryAiProvider = "anthropic" | "openai";
type BenchmarkCategoryAiProviderPreference = BenchmarkCategoryAiProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type BenchmarkCategoryAiStatus = "disabled" | "not_needed" | "applied" | "no_usable_suggestion" | "failed";

export type BenchmarkCategoryAiInference = {
  status: BenchmarkCategoryAiStatus;
  provider: BenchmarkCategoryAiProvider | null;
  model: string | null;
  attempted: boolean;
  categoryId: string | null;
  confidence: BenchmarkCategoryConfidence | null;
  applied: boolean;
  highRiskSignal: boolean | null;
  evidence: string[];
  alternatives: Array<{ categoryId: string; confidence: BenchmarkCategoryConfidence; reason: string | null }>;
  notes: string[];
};

export type BenchmarkCategoryAiOptions = {
  enabled?: boolean;
  provider?: BenchmarkCategoryAiProviderPreference;
  apiKey?: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  modelName?: string;
  anthropicModelName?: string;
  openAiModelName?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  sdk?: AiSdk;
};

type ParserOutputWithBenchmarkCategory = {
  statementIdentity: {
    processorFamily: string;
    visibleBrand: string;
    statementFamily: string;
    merchantName?: string | null;
    merchantNumber?: string | null;
    statementPeriodStart: string;
    statementPeriodEnd: string;
    sourceFileName?: string | null;
  };
  selectedFinancials: {
    totalVolume: number;
    totalFees: number;
    effectiveRate: number;
  };
  pricingModel?: {
    pricingModel: string;
  };
  feeLedger?: {
    rows?: Array<{ description?: string | null; amount?: number | null }>;
  };
  fiservFeeAnalysisV2?: FiservFeeAnalysisV2;
};

function loadAiSdk(): AiSdk {
  const ai = require("ai") as { generateObject: GenerateObject; generateText: GenerateText; Output: AiOutputFactory };
  const anthropicSdk = require("@ai-sdk/anthropic") as {
    anthropic: AiModelFactory;
    createAnthropic: AiProviderFactoryCreator;
  };
  const openAiSdk = require("@ai-sdk/openai") as {
    openai: AiModelFactory;
    createOpenAI: AiProviderFactoryCreator;
  };
  return {
    generateObject: ai.generateObject,
    generateText: ai.generateText,
    Output: ai.Output,
    anthropic: anthropicSdk.anthropic,
    openai: openAiSdk.openai,
    createAnthropic: anthropicSdk.createAnthropic,
    createOpenAI: openAiSdk.createOpenAI,
  };
}

function loadZod() {
  return require("zod/v3") as { z: any };
}

function envFlagOrDefault(name: string, defaultValue: boolean): boolean {
  const configured = process.env[name];
  if (configured === undefined) return defaultValue;
  return /^(1|true|yes|on)$/i.test(configured);
}

function aiEnabled(options: BenchmarkCategoryAiOptions): boolean {
  return options.enabled ?? envFlagOrDefault("AI_BENCHMARK_CATEGORY_ENABLED", true);
}

function providerPreference(options: BenchmarkCategoryAiOptions): BenchmarkCategoryAiProviderPreference {
  const configured = options.provider ?? process.env.AI_BENCHMARK_CATEGORY_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: BenchmarkCategoryAiProvider, options: BenchmarkCategoryAiOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: BenchmarkCategoryAiProvider, options: BenchmarkCategoryAiOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_BENCHMARK_CATEGORY_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.AI_BENCHMARK_CATEGORY_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function providerAttempts(options: BenchmarkCategoryAiOptions): Array<{ provider: BenchmarkCategoryAiProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: BenchmarkCategoryAiProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({ provider, modelName: modelNameForProvider(provider, options) }));
}

function missingKeyNote(options: BenchmarkCategoryAiOptions): string {
  const preference = providerPreference(options);
  if (preference === "anthropic") return "AI benchmark category inference requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "AI benchmark category inference requires OPENAI_API_KEY.";
  return "AI benchmark category inference requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI benchmark category inference timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function categoryResponseSchema(): unknown {
  const { z } = loadZod();
  const alternativeSchema = z
    .object({
      categoryId: z.string().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      reason: z.string().nullable(),
    })
    .strict();
  return z
    .object({
      categoryId: z.string().nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      evidence: z.array(z.string()),
      alternatives: z.array(alternativeSchema),
      highRiskSignal: z.boolean().nullable(),
      notes: z.array(z.string()),
    })
    .strict();
}

function openAiProviderOptions(): Record<string, unknown> {
  return {
    providerOptions: {
      openai: {
        store: false,
        reasoningEffort: "low",
        textVerbosity: "low",
        strictJsonSchema: true,
      },
    },
  };
}

function providerLabel(provider: BenchmarkCategoryAiProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function failureMessage(provider: BenchmarkCategoryAiProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${providerLabel(provider)} AI benchmark category inference failed: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`;
}

function availableCategories(reference: MccBenchmarkReference): Array<{ id: string; label: string; keywords: string[] }> {
  return Object.entries(reference.mcc_categories)
    .filter(([id]) => id !== "default")
    .map(([id, category]) => ({
      id,
      label: category.label,
      keywords: category.keywords.slice(0, 12),
    }));
}

function topFeeDescriptions(output: ParserOutputWithBenchmarkCategory): string[] {
  const rows = output.fiservFeeAnalysisV2?.rows ?? output.feeLedger?.rows ?? [];
  return rows
    .map((row) => ({
      description: String(row.description ?? "").replace(/\s+/g, " ").trim(),
      amount: typeof row.amount === "number" && Number.isFinite(row.amount) ? row.amount : 0,
    }))
    .filter((row) => row.description)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 20)
    .map((row) => row.description);
}

function categoryPrompt(output: ParserOutputWithBenchmarkCategory, reference: MccBenchmarkReference): string {
  const analysis = output.fiservFeeAnalysisV2;
  return [
    "You infer the merchant business category for payment-processing benchmark selection.",
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Use only the provided category ids. If evidence is weak, return categoryId null with low confidence.",
    "Do not override a user-selected business type. This task is only called when no specific user-selected or deterministic category exists.",
    "Prefer concrete business evidence from merchant name, DBA, statement identity, card-present/card-not-present signals, and fee patterns.",
    "Do not classify based only on processor name or bank brand.",
    "",
    `Available categories: ${JSON.stringify(availableCategories(reference))}`,
    "",
    "Statement context:",
    JSON.stringify({
      merchantName: output.statementIdentity.merchantName ?? null,
      merchantNumber: output.statementIdentity.merchantNumber ?? null,
      processorFamily: output.statementIdentity.processorFamily,
      visibleBrand: output.statementIdentity.visibleBrand,
      statementFamily: output.statementIdentity.statementFamily,
      statementPeriodStart: output.statementIdentity.statementPeriodStart,
      statementPeriodEnd: output.statementIdentity.statementPeriodEnd,
      sourceFileName: output.statementIdentity.sourceFileName ?? null,
      pricingModel: output.pricingModel?.pricingModel ?? analysis?.pricingModel.pricingModel ?? null,
      totalVolume: output.selectedFinancials.totalVolume,
      totalFees: output.selectedFinancials.totalFees,
      effectiveRate: output.selectedFinancials.effectiveRate,
      currentCategoryResolution: analysis?.benchmarkCategoryResolution ?? null,
      merchantChannel: analysis?.merchantChannelAnalysis ?? null,
      topFeeDescriptions: topFeeDescriptions(output),
    }),
  ].join("\n");
}

function normalizedText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function normalizedConfidence(value: unknown): BenchmarkCategoryConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function parseCategoryAiObject(value: unknown, reference: MccBenchmarkReference): {
  suggestion: BenchmarkCategoryAiSuggestion | null;
  highRiskSignal: boolean | null;
  notes: string[];
} {
  if (!value || typeof value !== "object") throw new Error("AI benchmark category response was not an object.");
  const object = value as {
    categoryId?: unknown;
    confidence?: unknown;
    evidence?: unknown;
    alternatives?: unknown;
    highRiskSignal?: unknown;
    notes?: unknown;
  };
  const categoryId = normalizedText(object.categoryId, 80);
  const confidence = normalizedConfidence(object.confidence);
  const evidence = Array.isArray(object.evidence)
    ? object.evidence.map((entry) => normalizedText(entry, 240)).filter((entry): entry is string => Boolean(entry)).slice(0, 8)
    : [];
  const alternatives = Array.isArray(object.alternatives)
    ? object.alternatives
        .map((entry) => {
          const candidate = entry as { categoryId?: unknown; confidence?: unknown; reason?: unknown };
          const alternativeCategoryId = normalizedText(candidate.categoryId, 80);
          const alternativeConfidence = normalizedConfidence(candidate.confidence);
          const reason = normalizedText(candidate.reason, 240);
          return alternativeCategoryId && reference.mcc_categories[alternativeCategoryId]
            ? { categoryId: alternativeCategoryId, confidence: alternativeConfidence, reason }
            : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .slice(0, 5)
    : [];
  const notes = Array.isArray(object.notes)
    ? object.notes.map((entry) => normalizedText(entry, 240)).filter((entry): entry is string => Boolean(entry)).slice(0, 8)
    : [];

  if (!categoryId || !reference.mcc_categories[categoryId]) {
    return {
      suggestion: null,
      highRiskSignal: typeof object.highRiskSignal === "boolean" ? object.highRiskSignal : null,
      notes: ["AI did not return a valid MCC benchmark category.", ...notes],
    };
  }
  return {
    suggestion: {
      categoryId,
      confidence,
      evidence,
      alternatives,
    },
    highRiskSignal: typeof object.highRiskSignal === "boolean" ? object.highRiskSignal : null,
    notes,
  };
}

async function generateCategoryInferenceWithProvider(
  sdk: AiSdk,
  provider: BenchmarkCategoryAiProvider,
  modelName: string,
  output: ParserOutputWithBenchmarkCategory,
  reference: MccBenchmarkReference,
  options: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    apiKey?: string;
  },
): Promise<ReturnType<typeof parseCategoryAiObject>> {
  const factory =
    provider === "anthropic"
      ? options.apiKey && sdk.createAnthropic
        ? sdk.createAnthropic({ apiKey: options.apiKey })
        : sdk.anthropic
      : options.apiKey && sdk.createOpenAI
        ? sdk.createOpenAI({ apiKey: options.apiKey })
        : sdk.openai;
  if (!factory) throw new Error(`${providerLabel(provider)} AI SDK provider is not available.`);

  const schema = categoryResponseSchema();
  const prompt = categoryPrompt(output, reference);
  if (provider === "openai") {
    if (!sdk.generateText || !sdk.Output) throw new Error("OpenAI structured output requires AI SDK generateText and Output.object.");
    const result = await withTimeout(
      sdk.generateText({
        model: factory(modelName),
        output: sdk.Output.object({
          schema,
          name: "merchant_benchmark_category_inference",
          description: "Merchant category inference for MCC benchmark selection.",
        }),
        prompt,
        maxOutputTokens: Math.max(options.maxOutputTokens, 2000),
        ...openAiProviderOptions(),
      }),
      options.timeoutMs,
    );
    return parseCategoryAiObject(result.output, reference);
  }

  const result = await withTimeout(
    sdk.generateObject({
      model: factory(modelName),
      schema,
      prompt,
      maxOutputTokens: options.maxOutputTokens,
      temperature: 0,
      providerOptions: {
        anthropic: {
          maxInputTokens: options.maxInputTokens,
        },
      },
    }),
    options.timeoutMs,
  );
  return parseCategoryAiObject(result.object, reference);
}

function inferenceResult(params: {
  status: BenchmarkCategoryAiStatus;
  provider: BenchmarkCategoryAiProvider | null;
  model: string | null;
  attempted: boolean;
  suggestion?: BenchmarkCategoryAiSuggestion | null;
  applied: boolean;
  highRiskSignal?: boolean | null;
  notes: string[];
}): BenchmarkCategoryAiInference {
  return {
    status: params.status,
    provider: params.provider,
    model: params.model,
    attempted: params.attempted,
    categoryId: params.suggestion?.categoryId ?? null,
    confidence: params.suggestion?.confidence ?? null,
    applied: params.applied,
    highRiskSignal: params.highRiskSignal ?? null,
    evidence: params.suggestion?.evidence ?? [],
    alternatives: params.suggestion?.alternatives ?? [],
    notes: params.notes,
  };
}

function attachInference<O extends ParserOutputWithBenchmarkCategory>(output: O, inference: BenchmarkCategoryAiInference): O {
  if (!output.fiservFeeAnalysisV2) return output;
  return {
    ...output,
    fiservFeeAnalysisV2: {
      ...output.fiservFeeAnalysisV2,
      benchmarkCategoryAi: inference,
    },
  };
}

function shouldRunCategoryAi(analysis: FiservFeeAnalysisV2): boolean {
  const resolution = analysis.benchmarkCategoryResolution;
  if (resolution.source === "user_selected") return false;
  if (resolution.source === "deterministic" && resolution.confidence !== "low") return false;
  return resolution.categoryId === "default" || resolution.source === "default";
}

export async function maybeRunBenchmarkCategoryAiInferenceForParserOutput<O extends ParserOutputWithBenchmarkCategory>(
  output: O,
  options: BenchmarkCategoryAiOptions = {},
): Promise<{ output: O; benchmarkCategoryAi: BenchmarkCategoryAiInference }> {
  const analysis = output.fiservFeeAnalysisV2;
  if (!analysis) {
    const result = inferenceResult({
      status: "not_needed",
      provider: null,
      model: null,
      attempted: false,
      applied: false,
      notes: ["No Fiserv V2 analysis output was available for AI benchmark category inference."],
    });
    return { output, benchmarkCategoryAi: result };
  }
  if (!shouldRunCategoryAi(analysis)) {
    const result = inferenceResult({
      status: "not_needed",
      provider: null,
      model: null,
      attempted: false,
      applied: false,
      notes: ["Benchmark category was already resolved by user selection or deterministic statement evidence."],
    });
    return { output: attachInference(output, result), benchmarkCategoryAi: result };
  }
  if (!aiEnabled(options)) {
    const result = inferenceResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      applied: false,
      notes: ["AI benchmark category inference was explicitly disabled."],
    });
    return { output: attachInference(output, result), benchmarkCategoryAi: result };
  }

  const attempts = providerAttempts(options);
  if (attempts.length === 0) {
    const result = inferenceResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      applied: false,
      notes: [missingKeyNote(options)],
    });
    return { output: attachInference(output, result), benchmarkCategoryAi: result };
  }

  const reference = loadMccBenchmarkReference();
  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_BENCHMARK_CATEGORY_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 10000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_BENCHMARK_CATEGORY_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 1500);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_BENCHMARK_CATEGORY_TIMEOUT_MS ?? 8000);
  let sdk: AiSdk;
  const failureNotes: string[] = [];
  try {
    sdk = options.sdk ?? loadAiSdk();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const result = inferenceResult({
      status: "failed",
      provider: null,
      model: null,
      attempted: true,
      applied: false,
      notes: [`AI benchmark category inference failed before provider execution: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`],
    });
    return { output: attachInference(output, result), benchmarkCategoryAi: result };
  }

  for (const attempt of attempts) {
    try {
      const generated = await generateCategoryInferenceWithProvider(sdk, attempt.provider, attempt.modelName, output, reference, {
        maxInputTokens,
        maxOutputTokens,
        timeoutMs,
        apiKey: providerApiKey(attempt.provider, options),
      });
      if (!generated.suggestion) {
        const result = inferenceResult({
          status: "no_usable_suggestion",
          provider: attempt.provider,
          model: attempt.modelName,
          attempted: true,
          applied: false,
          highRiskSignal: generated.highRiskSignal,
          notes: [...failureNotes, ...generated.notes],
        });
        return { output: attachInference(output, result), benchmarkCategoryAi: result };
      }
      const updatedAnalysis = applyBenchmarkCategoryAiSuggestionToFiservFeeAnalysisV2({
        analysis,
        merchantName: output.statementIdentity.merchantName,
        totalVolume: output.selectedFinancials.totalVolume,
        totalFees: output.selectedFinancials.totalFees,
        statementPeriodStart: output.statementIdentity.statementPeriodStart,
        aiSuggestion: generated.suggestion,
      });
      const result = inferenceResult({
        status: "applied",
        provider: attempt.provider,
        model: attempt.modelName,
        attempted: true,
        suggestion: generated.suggestion,
        applied: true,
        highRiskSignal: generated.highRiskSignal,
        notes: [...failureNotes, ...generated.notes],
      });
      return {
        output: {
          ...output,
          fiservFeeAnalysisV2: {
            ...updatedAnalysis,
            benchmarkCategoryAi: result,
          },
        },
        benchmarkCategoryAi: result,
      };
    } catch (error) {
      failureNotes.push(failureMessage(attempt.provider, error));
    }
  }

  const result = inferenceResult({
    status: "failed",
    provider: null,
    model: attempts.at(-1)?.modelName ?? null,
    attempted: true,
    applied: false,
    notes: ["AI benchmark category inference failed across all configured providers; deterministic benchmark category preserved.", ...failureNotes],
  });
  return { output: attachInference(output, result), benchmarkCategoryAi: result };
}
