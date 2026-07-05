import { createRequire } from "node:module";
import type { FiservFeeAnalysisFinding, FiservFeeAnalysisV2 } from "./fiservFeeAnalysis.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type FullStatementAnomalyProvider = "anthropic" | "openai";
type FullStatementAnomalyProviderPreference = FullStatementAnomalyProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type FullStatementAnomalyReviewStatus = "disabled" | "not_needed" | "applied" | "no_anomalies" | "failed";
export type FullStatementAnomalySeverity = "low" | "medium" | "high";
export type FullStatementAnomalyConfidence = "low" | "medium" | "high";

export type FullStatementAnomaly = {
  description: string;
  severity: FullStatementAnomalySeverity;
  estimatedImpact: number | null;
  estimatedImpactRaw: string | null;
  recommendation: string;
  confidence: FullStatementAnomalyConfidence;
  evidence: string[];
};

export type FullStatementAnomalyOverride = {
  field: string;
  originalValue: string;
  correctedValue: string;
  reason: string;
  applied: boolean;
};

export type FullStatementAnomalyReview = {
  status: FullStatementAnomalyReviewStatus;
  provider: FullStatementAnomalyProvider | null;
  model: string | null;
  attempted: boolean;
  anomalyCount: number;
  overrideCount: number;
  appliedOverrideCount: number;
  anomalies: FullStatementAnomaly[];
  overrides: FullStatementAnomalyOverride[];
  notes: string[];
};

export type FullStatementAnomalyReviewOptions = {
  enabled?: boolean;
  provider?: FullStatementAnomalyProviderPreference;
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

type ParserOutputWithAnomalyReview = {
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
    transactionCount?: {
      primaryTransactionCount: number | null;
    };
  };
  pricingModel?: {
    pricingModel: string;
  };
  feeLedger?: {
    rows?: Array<{ network?: string | null; description?: string | null; amount?: number | null; classification?: unknown }>;
  };
  decision?: unknown;
  warnings?: Array<{ code?: string; severity?: string; message?: string; evidenceLine?: string | null }>;
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

function aiEnabled(options: FullStatementAnomalyReviewOptions): boolean {
  return options.enabled ?? envFlagOrDefault("AI_FULL_STATEMENT_ANOMALY_ENABLED", true);
}

function providerPreference(options: FullStatementAnomalyReviewOptions): FullStatementAnomalyProviderPreference {
  const configured = options.provider ?? process.env.AI_FULL_STATEMENT_ANOMALY_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: FullStatementAnomalyProvider, options: FullStatementAnomalyReviewOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: FullStatementAnomalyProvider, options: FullStatementAnomalyReviewOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_FULL_STATEMENT_ANOMALY_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.AI_FULL_STATEMENT_ANOMALY_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function providerAttempts(options: FullStatementAnomalyReviewOptions): Array<{ provider: FullStatementAnomalyProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: FullStatementAnomalyProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({ provider, modelName: modelNameForProvider(provider, options) }));
}

function missingKeyNote(options: FullStatementAnomalyReviewOptions): string {
  const preference = providerPreference(options);
  if (preference === "anthropic") return "AI full statement anomaly review requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "AI full statement anomaly review requires OPENAI_API_KEY.";
  return "AI full statement anomaly review requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI full statement anomaly review timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function anomalyReviewResponseSchema(): unknown {
  const { z } = loadZod();
  const anomalySchema = z
    .object({
      description: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      estimatedImpact: z.number().finite().nullable(),
      estimatedImpactRaw: z.string().nullable(),
      recommendation: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
      evidence: z.array(z.string()),
    })
    .strict();
  const overrideSchema = z
    .object({
      field: z.string(),
      originalValue: z.string(),
      correctedValue: z.string(),
      reason: z.string(),
    })
    .strict();
  return z
    .object({
      anomalies: z.array(anomalySchema),
      overrides: z.array(overrideSchema),
      notes: z.array(z.string()),
    })
    .strict();
}

function openAiProviderOptions(): Record<string, unknown> {
  return {
    providerOptions: {
      openai: {
        store: false,
        textVerbosity: "medium",
        strictJsonSchema: true,
      },
    },
  };
}

function compactText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function anomalyReviewPacket(output: ParserOutputWithAnomalyReview): Record<string, unknown> {
  const analysis = output.fiservFeeAnalysisV2;
  const rawFeeRows =
    analysis?.rows.map((row) => ({
      rowIndex: row.rowIndex,
      cardTypeSection: row.cardTypeSection,
      description: row.description,
      amount: row.amount,
      volumeBasis: row.volumeBasis,
      count: row.count,
      rate: row.rate,
      feeType: row.feeType,
      proofStatus: row.proofStatus,
      matchMethod: row.matchMethod,
      matchConfidence: row.matchConfidence,
      sourceSection: row.sourceSection,
      evidenceLine: row.evidenceLine,
    })) ??
    output.feeLedger?.rows?.map((row, rowIndex) => ({
      rowIndex,
      network: row.network ?? null,
      description: row.description ?? null,
      amount: row.amount ?? null,
      classification: row.classification ?? null,
    })) ??
    [];

  return {
    statementIdentity: output.statementIdentity,
    selectedFinancials: output.selectedFinancials,
    parserDecision: output.decision ?? null,
    warnings: output.warnings ?? [],
    pricingModel: analysis?.pricingModel ?? output.pricingModel ?? null,
    benchmarkCategoryResolution: analysis?.benchmarkCategoryResolution ?? null,
    effectiveRateBenchmarkAnalysis: analysis?.effectiveRateBenchmarkAnalysis ?? null,
    perAuthBenchmarkAnalysis: analysis?.perAuthBenchmarkAnalysis ?? null,
    merchantChannelAnalysis: analysis?.merchantChannelAnalysis ?? null,
    processorMarkupAnalysis: analysis?.processorMarkupAnalysis ?? null,
    tieredDowngradeAnalysis: analysis?.tieredDowngradeAnalysis ?? null,
    authorizationAnalysis: analysis?.authorizationAnalysis ?? null,
    disputeActivityAnalysis: analysis?.disputeActivityAnalysis ?? null,
    bundledPricingBenchmark: analysis?.bundledPricingBenchmark ?? null,
    interchangeReconciliation: analysis?.interchangeReconciliation ?? null,
    reconciliation: analysis?.reconciliation ?? null,
    buckets: analysis?.buckets ?? [],
    findings: analysis?.findings ?? [],
    aiNoticeExtraction: analysis?.aiNoticeExtraction ?? null,
    benchmarkCategoryAi: analysis?.benchmarkCategoryAi ?? null,
    feeAi: analysis?.ai ?? null,
    estimatedAnnualSavings: analysis?.estimatedAnnualSavings ?? null,
    rawFeeRows,
  };
}

function anomalyReviewPrompt(packet: Record<string, unknown>): string {
  return [
    "You are the final AI safety-net reviewer for a merchant payment-processing statement analysis.",
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Review the complete structured analysis and raw fee rows after deterministic rules, notice extraction, merchant category inference, fee AI classification, and benchmarking have run.",
    "Find anything a senior payments analyst would flag: contradictions, unusual fee amounts, duplicate or near-duplicate fees, misclassified fees, card-present/card-not-present mismatch, interchange program mismatch, tiered downgrade concerns, billback risk, unusual card mix, average-ticket mismatch, wrong fee math, or missing findings.",
    "Critical behavior: if statement evidence contradicts a deterministic output, return an override with the corrected final value. The merchant must see only the corrected answer; do not write anomaly text saying the system disagreed with itself.",
    "For pricing-model contradictions, use field pricing_model and correctedValue such as interchange_plus, tiered_pricing, flat_discount_pricing, flat_rate, or unknown.",
    "Put merchant-facing concerns in anomalies. Put internal corrections in overrides. If nothing is concerning, return empty anomalies and empty overrides.",
    "Do not invent problems. Use estimatedImpact null and estimatedImpactRaw \"unknown\" when impact is not calculable from provided facts.",
    "Structured analysis packet:",
    JSON.stringify(packet),
  ].join("\n\n");
}

function parseAnomalyReviewObject(value: unknown): {
  anomalies: FullStatementAnomaly[];
  overrides: FullStatementAnomalyOverride[];
  notes: string[];
} {
  if (!value || typeof value !== "object") throw new Error("AI full statement anomaly review response was not an object.");
  const record = value as { anomalies?: unknown; overrides?: unknown; notes?: unknown };
  if (!Array.isArray(record.anomalies) || !Array.isArray(record.overrides)) {
    throw new Error("AI full statement anomaly review response did not contain anomalies and overrides arrays.");
  }
  const anomalies = record.anomalies.map((candidate) => {
    const anomaly = candidate as Partial<FullStatementAnomaly>;
    const description = compactText(anomaly.description, 700);
    const recommendation = compactText(anomaly.recommendation, 500);
    if (!description || !recommendation) return null;
    return {
      description,
      severity: anomaly.severity === "high" || anomaly.severity === "medium" || anomaly.severity === "low" ? anomaly.severity : "low",
      estimatedImpact: finiteNumber(anomaly.estimatedImpact),
      estimatedImpactRaw: compactText(anomaly.estimatedImpactRaw, 80) ?? (finiteNumber(anomaly.estimatedImpact) === null ? "unknown" : null),
      recommendation,
      confidence: anomaly.confidence === "high" || anomaly.confidence === "medium" || anomaly.confidence === "low" ? anomaly.confidence : "low",
      evidence: Array.isArray(anomaly.evidence)
        ? anomaly.evidence.map((entry) => String(entry).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8)
        : [],
    } satisfies FullStatementAnomaly;
  }).filter((entry): entry is FullStatementAnomaly => entry !== null).slice(0, 12);
  const overrides = record.overrides.map((candidate): FullStatementAnomalyOverride | null => {
    const override = candidate as Partial<FullStatementAnomalyOverride>;
    const field = compactText(override.field, 120);
    const originalValue = compactText(override.originalValue, 240);
    const correctedValue = compactText(override.correctedValue, 240);
    const reason = compactText(override.reason, 700);
    if (!field || !originalValue || !correctedValue || !reason) return null;
    return { field, originalValue, correctedValue, reason, applied: false } satisfies FullStatementAnomalyOverride;
  }).filter((entry): entry is FullStatementAnomalyOverride => entry !== null).slice(0, 8);
  const notes = Array.isArray(record.notes)
    ? record.notes.map((entry) => String(entry).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8)
    : [];
  return { anomalies, overrides, notes };
}

function providerLabel(provider: FullStatementAnomalyProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function failureMessage(provider: FullStatementAnomalyProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${providerLabel(provider)} AI full statement anomaly review failed: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`;
}

async function generateAnomalyReviewWithProvider(
  sdk: AiSdk,
  provider: FullStatementAnomalyProvider,
  modelName: string,
  packet: Record<string, unknown>,
  options: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    apiKey?: string;
  },
): Promise<{ anomalies: FullStatementAnomaly[]; overrides: FullStatementAnomalyOverride[]; notes: string[] }> {
  const factory =
    provider === "anthropic"
      ? options.apiKey && sdk.createAnthropic
        ? sdk.createAnthropic({ apiKey: options.apiKey })
        : sdk.anthropic
      : options.apiKey && sdk.createOpenAI
        ? sdk.createOpenAI({ apiKey: options.apiKey })
        : sdk.openai;
  if (!factory) throw new Error(`${providerLabel(provider)} AI SDK provider is not available.`);

  const schema = anomalyReviewResponseSchema();
  const prompt = anomalyReviewPrompt(packet);
  if (provider === "openai") {
    if (!sdk.generateText || !sdk.Output) throw new Error("OpenAI structured output requires AI SDK generateText and Output.object.");
    const result = await withTimeout(
      sdk.generateText({
        model: factory(modelName),
        output: sdk.Output.object({
          schema,
          name: "full_statement_anomaly_review",
          description: "Final safety-net anomalies and internal deterministic-output overrides.",
        }),
        prompt,
        maxOutputTokens: Math.max(options.maxOutputTokens, 5000),
        ...openAiProviderOptions(),
      }),
      options.timeoutMs,
    );
    return parseAnomalyReviewObject(result.output);
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
  return parseAnomalyReviewObject(result.object);
}

function anomalyFinding(anomaly: FullStatementAnomaly): FiservFeeAnalysisFinding {
  const title = anomaly.description.length > 110 ? `${anomaly.description.slice(0, 107)}...` : anomaly.description;
  return {
    kind: "ai_statement_anomaly",
    severity: anomaly.severity === "high" ? "high" : anomaly.severity === "medium" ? "warning" : "info",
    title,
    amount: anomaly.estimatedImpact,
    evidence: [
      anomaly.description,
      `AI final review confidence: ${anomaly.confidence}.`,
      anomaly.estimatedImpact === null ? `Estimated impact: ${anomaly.estimatedImpactRaw ?? "unknown"}.` : `Estimated impact: $${anomaly.estimatedImpact.toFixed(2)}.`,
      `Recommendation: ${anomaly.recommendation}`,
      ...anomaly.evidence,
    ],
    action: "none",
    monthlyCost: anomaly.estimatedImpact,
    annualEstimate: null,
    componentImpactEstimate: null,
  };
}

function normalizedOverrideField(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizedPricingModel(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized === "ic_plus" || normalized === "interchange_plus" || normalized === "interchange") return "interchange_plus";
  if (normalized === "tiered" || normalized === "tiered_pricing") return "tiered_pricing";
  if (normalized === "flat_discount" || normalized === "flat_discount_pricing") return "flat_discount_pricing";
  if (normalized === "flat_rate" || normalized === "flat_rate_bundled") return "flat_rate";
  if (normalized === "unknown") return "unknown";
  return null;
}

function pricingModelAnalysisStatus(pricingModel: string): FiservFeeAnalysisV2["pricingModel"]["analysisStatus"] {
  if (pricingModel === "interchange_plus") return "ic_plus_ready";
  if (pricingModel === "unknown") return "not_enough_detail";
  return "universal_only_pending_model_rules";
}

function applyOverrides(
  analysis: FiservFeeAnalysisV2,
  overrides: FullStatementAnomalyOverride[],
): { analysis: FiservFeeAnalysisV2; overrides: FullStatementAnomalyOverride[]; notes: string[] } {
  let next = analysis;
  const notes: string[] = [];
  const appliedOverrides = overrides.map((override) => {
    const field = normalizedOverrideField(override.field);
    if (field === "pricing_model" || field === "pricingmodel") {
      const corrected = normalizedPricingModel(override.correctedValue);
      if (!corrected) {
        notes.push(`AI anomaly review returned unsupported pricing model override value: ${override.correctedValue}.`);
        return { ...override, applied: false };
      }
      if (next.pricingModel.pricingModel === corrected) {
        notes.push(`AI anomaly review pricing model override already matched the final output: ${corrected}.`);
        return { ...override, applied: false };
      }
      next = {
        ...next,
        pricingModel: {
          ...next.pricingModel,
          pricingModel: corrected,
          confidence: "medium",
          analysisStatus: pricingModelAnalysisStatus(corrected),
          evidence: [
            `Final pricing model confirmed by AI anomaly review from statement evidence: ${override.reason}`,
            ...next.pricingModel.evidence,
          ].slice(0, 12),
        },
      };
      console.info(
        `[ai-anomaly-review] override applied field=${override.field} original=${override.originalValue} corrected=${corrected} reason=${override.reason}`,
      );
      return { ...override, correctedValue: corrected, applied: true };
    }
    notes.push(`AI anomaly review override for ${override.field} was logged but not auto-applied; no supported applier exists for that field yet.`);
    return { ...override, applied: false };
  });
  return { analysis: next, overrides: appliedOverrides, notes };
}

function reviewResult(params: {
  status: FullStatementAnomalyReviewStatus;
  provider: FullStatementAnomalyProvider | null;
  model: string | null;
  attempted: boolean;
  anomalies?: FullStatementAnomaly[];
  overrides?: FullStatementAnomalyOverride[];
  notes: string[];
}): FullStatementAnomalyReview {
  const anomalies = params.anomalies ?? [];
  const overrides = params.overrides ?? [];
  return {
    status: params.status,
    provider: params.provider,
    model: params.model,
    attempted: params.attempted,
    anomalyCount: anomalies.length,
    overrideCount: overrides.length,
    appliedOverrideCount: overrides.filter((override) => override.applied).length,
    anomalies,
    overrides,
    notes: params.notes,
  };
}

function attachReview(analysis: FiservFeeAnalysisV2, review: FullStatementAnomalyReview): FiservFeeAnalysisV2 {
  const anomalyFindings = review.anomalies.map(anomalyFinding);
  return {
    ...analysis,
    findings: anomalyFindings.length > 0 ? [...analysis.findings, ...anomalyFindings] : analysis.findings,
    aiAnomalyReview: review,
  };
}

export async function maybeRunFullStatementAnomalyReview(
  output: ParserOutputWithAnomalyReview,
  options: FullStatementAnomalyReviewOptions = {},
): Promise<{ analysis: FiservFeeAnalysisV2; aiAnomalyReview: FullStatementAnomalyReview }> {
  const analysis = output.fiservFeeAnalysisV2;
  if (!analysis) {
    return {
      analysis: undefined as never,
      aiAnomalyReview: reviewResult({
        status: "not_needed",
        provider: null,
        model: null,
        attempted: false,
        notes: ["No structured analysis output was available for AI full statement anomaly review."],
      }),
    };
  }
  const disabledResult = (aiAnomalyReview: FullStatementAnomalyReview) => ({
    analysis: attachReview(analysis, aiAnomalyReview),
    aiAnomalyReview,
  });

  if (!aiEnabled(options)) {
    return disabledResult(reviewResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      notes: ["AI full statement anomaly review was explicitly disabled."],
    }));
  }
  const attempts = providerAttempts(options);
  if (attempts.length === 0) {
    return disabledResult(reviewResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      notes: [missingKeyNote(options)],
    }));
  }

  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_FULL_STATEMENT_ANOMALY_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 18000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_FULL_STATEMENT_ANOMALY_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 3500);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_FULL_STATEMENT_ANOMALY_TIMEOUT_MS ?? 12000);
  const packet = anomalyReviewPacket(output);
  let sdk: AiSdk;
  const failureNotes: string[] = [];
  try {
    sdk = options.sdk ?? loadAiSdk();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const aiAnomalyReview = reviewResult({
      status: "failed",
      provider: null,
      model: null,
      attempted: true,
      notes: [`AI full statement anomaly review failed before provider execution: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`],
    });
    return disabledResult(aiAnomalyReview);
  }

  for (const attempt of attempts) {
    try {
      const generated = await generateAnomalyReviewWithProvider(sdk, attempt.provider, attempt.modelName, packet, {
        maxInputTokens,
        maxOutputTokens,
        timeoutMs,
        apiKey: providerApiKey(attempt.provider, options),
      });
      const applied = applyOverrides(analysis, generated.overrides);
      const withFindings = attachReview(
        applied.analysis,
        reviewResult({
          status: generated.anomalies.length > 0 || generated.overrides.length > 0 ? "applied" : "no_anomalies",
          provider: attempt.provider,
          model: attempt.modelName,
          attempted: true,
          anomalies: generated.anomalies,
          overrides: applied.overrides,
          notes: [...failureNotes, ...generated.notes, ...applied.notes],
        }),
      );
      return {
        analysis: withFindings,
        aiAnomalyReview: withFindings.aiAnomalyReview!,
      };
    } catch (error) {
      failureNotes.push(failureMessage(attempt.provider, error));
    }
  }

  const aiAnomalyReview = reviewResult({
    status: "failed",
    provider: null,
    model: attempts.at(-1)?.modelName ?? null,
    attempted: true,
    notes: ["AI full statement anomaly review failed across all configured providers; deterministic analysis preserved.", ...failureNotes],
  });
  return disabledResult(aiAnomalyReview);
}

export async function maybeRunFullStatementAnomalyReviewForParserOutput<O extends ParserOutputWithAnomalyReview>(
  output: O,
  options: FullStatementAnomalyReviewOptions = {},
): Promise<{ output: O; aiAnomalyReview: FullStatementAnomalyReview }> {
  if (!output.fiservFeeAnalysisV2) {
    return {
      output,
      aiAnomalyReview: reviewResult({
        status: "not_needed",
        provider: null,
        model: null,
        attempted: false,
        notes: ["No structured analysis output was available for AI full statement anomaly review."],
      }),
    };
  }

  const result = await maybeRunFullStatementAnomalyReview(output, options);
  return {
    output: {
      ...output,
      fiservFeeAnalysisV2: result.analysis,
    },
    aiAnomalyReview: result.aiAnomalyReview,
  };
}
