import { createRequire } from "node:module";
import {
  makeFiservProcessorSyntheticFeeClassification,
  summarizeFiservProcessorFeeClassifications,
  type FiservProcessorAtCostReasonCode,
  type FiservProcessorAtCostStatus,
  type FiservProcessorClassifiedFeeRow,
  type FiservProcessorCostExposure,
  type FiservProcessorFeeClassificationSummary,
  type FiservProcessorFeeEconomicBucket,
  type FiservProcessorFeeRowForClassification,
} from "./fiservProcessorFeeClassification.js";
import { buildParserDecision } from "./parserDecision.js";
import type { ParserConfidence } from "./parserFoundation.js";
import type { ReconciliationCheck, ReconciliationResult } from "./reconciliation.js";
import {
  FISERV_AI_AVOIDABLE_LIKELIHOOD_VALUES,
  FISERV_AI_MERCHANT_ACTIONS,
  FISERV_AI_NEGOTIABILITY_VALUES,
  FISERV_AI_PAID_TO_PARTIES,
  FISERV_AI_PASS_THROUGH_PROOF_POSTURES,
  normalizeFiservAiFeeAssessment,
  type FiservAiFeeAssessment,
  type FiservAiNegotiability,
  type FiservAiPaidToParty,
  type FiservAiPassThroughProofPosture,
} from "./fiservAiFeeAssessment.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type FiservProcessorFeeAiProvider = "anthropic" | "openai";
type FiservProcessorFeeAiProviderPreference = FiservProcessorFeeAiProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type FiservProcessorFeeAiContext = {
  processorPlatform: string;
  visibleBrand: string;
  merchantName: string | null;
  merchantNumber: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  pricingModel: string | null;
  totalVolume: number | null;
  totalFees: number | null;
  effectiveRate: number | null;
};

export type FiservProcessorFeeAiPacketRow = {
  rowIndex: number;
  network: string | null;
  type: string | null;
  description: string;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  currentRule: string;
  currentReason: string;
};

export type FiservProcessorFeeAiPacket = {
  context: FiservProcessorFeeAiContext;
  deterministicSummary: FiservProcessorFeeClassificationSummary;
  unresolvedRows: FiservProcessorFeeAiPacketRow[];
  resolvedBucketTotals: FiservProcessorFeeClassificationSummary["bucketTotals"];
  instructions: string[];
};

export type FiservProcessorFeeAiNegotiability = FiservAiNegotiability;

export type FiservProcessorFeeAiSuggestion = {
  rowIndex: number;
  economicBucket: FiservProcessorFeeEconomicBucket;
  confidence: "high" | "medium" | "low";
  subcategory: string | null;
  negotiability: FiservProcessorFeeAiNegotiability;
  assessment?: FiservAiFeeAssessment;
  reasonCodes: string[];
  explanation: string;
};

export type FiservProcessorFeeAiRunStatus = "disabled" | "not_needed" | "applied" | "no_usable_suggestions" | "failed";

export type FiservProcessorFeeAiRunMetadata = {
  status: FiservProcessorFeeAiRunStatus;
  provider: FiservProcessorFeeAiProvider | null;
  model: string | null;
  unresolvedInputRowCount: number;
  suggestionCount: number;
  appliedSuggestionCount: number;
  skippedSuggestionCount: number;
  notes: string[];
};

export type FiservProcessorFeeAiClassificationResult<T extends FiservProcessorFeeRowForClassification> = {
  rows: Array<FiservProcessorClassifiedFeeRow<T>>;
  summary: FiservProcessorFeeClassificationSummary;
  ai: FiservProcessorFeeAiRunMetadata;
};

type AiOptions = {
  enabled?: boolean;
  provider?: FiservProcessorFeeAiProviderPreference;
  apiKey?: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  modelName?: string;
  anthropicModelName?: string;
  openAiModelName?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  applyMinConfidence?: "high" | "medium" | "low";
  sdk?: AiSdk;
};

type ParserOutputWithFiservFeeLedger<T extends FiservProcessorFeeRowForClassification> = {
  statementIdentity: {
    statementFamily: string;
    visibleBrand: string;
    merchantName?: string | null;
    merchantNumber?: string | null;
    statementPeriodStart: string;
    statementPeriodEnd: string;
  };
  selectedFinancials: {
    totalVolume: number;
    totalFees: number;
    effectiveRate: number;
  };
  pricingModel?: {
    pricingModel: string;
  };
  feeLedger: {
    rows: Array<FiservProcessorClassifiedFeeRow<T>>;
    printedTotal: number | null;
    feeClassificationSummary: FiservProcessorFeeClassificationSummary;
  };
  reconciliation: Record<string, ReconciliationCheck>;
  reconciliationResults?: ReconciliationResult[];
  warnings: Array<{
    code: string;
    severity: "low" | "medium" | "high";
  }>;
  confidence: {
    overall: ParserConfidence;
  };
  decision: unknown;
};

const ECONOMIC_BUCKETS = [
  "card_brand_pass_through",
  "processor_controlled_tiered_fee",
  "processor_controlled_flat_discount_fee",
  "processor_transaction_or_auth",
  "miscellaneous_or_statement_fee",
  "unknown_needs_review",
  "zero_amount_no_charge",
] as const satisfies readonly FiservProcessorFeeEconomicBucket[];

const CONFIDENCE_RANK = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

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
  return require("zod/v3") as {
    z: any;
  };
}

function envFlag(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[name] ?? "");
}

function feeAiEnabled(options: AiOptions): boolean {
  return options.enabled ?? envFlag("AI_FEE_CLASSIFICATION_ENABLED");
}

function feeAiProviderPreference(options: AiOptions): FiservProcessorFeeAiProviderPreference {
  const configured = options.provider ?? process.env.AI_FEE_CLASSIFICATION_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerHasApiKey(provider: FiservProcessorFeeAiProvider, options: AiOptions): boolean {
  return Boolean(providerApiKey(provider, options));
}

function providerApiKey(provider: FiservProcessorFeeAiProvider, options: AiOptions): string | undefined {
  if (provider === "anthropic") {
    return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }
  return options.openAiApiKey ?? process.env.OPENAI_API_KEY;
}

function missingProviderKeyNote(options: AiOptions): string {
  const preference = feeAiProviderPreference(options);
  if (preference === "anthropic") return "AI fee classification requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "AI fee classification requires OPENAI_API_KEY.";
  return "AI fee classification requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

function feeAiModelName(
  provider: FiservProcessorFeeAiProvider,
  options: AiOptions,
  packet: FiservProcessorFeeAiPacket,
): string {
  const preference = feeAiProviderPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_FEE_CLASSIFICATION_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }

  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  const escalationModel = process.env.AI_FEE_CLASSIFICATION_ESCALATION_MODEL;
  const escalationThreshold = Number(process.env.AI_FEE_CLASSIFICATION_ESCALATION_MIN_AMOUNT ?? 100);
  const maxUnresolvedAmount = Math.max(0, ...packet.unresolvedRows.map((row) => row.amount));
  if (escalationModel && Number.isFinite(escalationThreshold) && maxUnresolvedAmount >= escalationThreshold) {
    return escalationModel;
  }
  return process.env.AI_FEE_CLASSIFICATION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function feeAiProviderAttempts(
  options: AiOptions,
  packet: FiservProcessorFeeAiPacket,
): Array<{ provider: FiservProcessorFeeAiProvider; modelName: string }> {
  const preference = feeAiProviderPreference(options);
  const providers: FiservProcessorFeeAiProvider[] =
    preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => providerHasApiKey(provider, options))
    .map((provider) => ({
      provider,
      modelName: feeAiModelName(provider, options, packet),
    }));
}

function applyMinConfidence(options: AiOptions): "high" | "medium" | "low" {
  const configured = options.applyMinConfidence ?? process.env.AI_FEE_CLASSIFICATION_APPLY_MIN_CONFIDENCE;
  return configured === "low" || configured === "medium" || configured === "high" ? configured : "medium";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`AI fee classification timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildFiservProcessorFeeAiPacket<T extends FiservProcessorFeeRowForClassification>(
  rows: Array<FiservProcessorClassifiedFeeRow<T>>,
  summary: FiservProcessorFeeClassificationSummary,
  context: FiservProcessorFeeAiContext,
): FiservProcessorFeeAiPacket {
  return {
    context,
    deterministicSummary: summary,
    unresolvedRows: rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => row.classification.economicBucket === "unknown_needs_review")
      .map(({ row, rowIndex }) => ({
        rowIndex,
        network: row.network,
        type: row.type,
        description: row.description,
        amount: row.amount,
        volumeBasis: row.volumeBasis,
        count: row.count,
        rate: row.rate,
        currentRule: row.classification.rule,
        currentReason: row.classification.reason,
      })),
    resolvedBucketTotals: summary.bucketTotals.filter((bucket) => bucket.economicBucket !== "unknown_needs_review"),
    instructions: [
      "Classify only unresolved fee rows; do not override deterministic classifications.",
      "Use row math, processor/platform context, fee section/card network, and fee names.",
      "Do not claim pass-through-at-cost proof; card-brand rows remain at-cost indeterminate unless external reference proof is supplied elsewhere.",
      "Return an assessment object for every suggestion: paid-to party, pass-through proof posture, negotiability, avoidable likelihood, merchant action, recommendation, evidence, and source evidence.",
      "Use source_backed_math_candidate only when you can name a source or reference and explain the row math. This remains advisory until deterministic reference-rate verification confirms it.",
      "Return unknown_needs_review when the evidence is too generic or ambiguous.",
      "Treat tiered discount rows as structurally blended, but they should normally not be included in this unresolved-row packet.",
    ],
  };
}

function aiPrompt(packet: FiservProcessorFeeAiPacket): string {
  return [
    "You classify ambiguous merchant-processing statement fee rows.",
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Allowed economicBucket values:",
    ECONOMIC_BUCKETS.join(", "),
    "Confidence must be high, medium, or low.",
    "Negotiability must be likely_negotiable, likely_non_negotiable, or unknown.",
    "Assessment passThroughProofPosture must be one of: source_backed_math_candidate, not_applicable_processor_controlled, not_pass_through, not_enough_evidence.",
    "When classifying a row as a fixed processor/ISO fee, usually miscellaneous_or_statement_fee, include fixedFeeAssessment with avoidable true/false/uncertain, a specific recommendation, and confidence. Use false for real services, true for junk/avoidable fees, and uncertain when the label is too generic.",
    "AI may provide source-backed pass-through evidence only as a candidate; deterministic reference-rate math remains the final proof layer.",
    "Use unknown_needs_review if the row cannot be classified from the provided evidence.",
    "Do not classify a fee as proven pass-through-at-cost. At-cost proof is handled by a separate deterministic reference-rate layer.",
    "Structured statement packet:",
    JSON.stringify(packet),
  ].join("\n\n");
}

function aiAssessmentSchema(z: any): any {
  return z
    .object({
      paidToParty: z.enum(FISERV_AI_PAID_TO_PARTIES),
      passThroughProofPosture: z.enum(FISERV_AI_PASS_THROUGH_PROOF_POSTURES),
      negotiability: z.enum(FISERV_AI_NEGOTIABILITY_VALUES),
      avoidableLikelihood: z.enum(FISERV_AI_AVOIDABLE_LIKELIHOOD_VALUES),
      merchantAction: z.enum(FISERV_AI_MERCHANT_ACTIONS),
      recommendation: z.string().nullable(),
      fixedFeeAssessment: z
        .object({
          avoidable: z.enum(["true", "false", "uncertain"]),
          recommendation: z.string().nullable(),
          confidence: z.enum(["high", "medium", "low"]),
        })
        .strict()
        .nullable(),
      evidence: z.array(z.string()),
      sourceEvidence: z
        .object({
          sourceName: z.string().nullable(),
          referenceId: z.string().nullable(),
          referenceRate: z.number().nullable(),
          statementRate: z.number().nullable(),
          statementAmount: z.number().nullable(),
          mathSummary: z.string().nullable(),
          verificationNote: z.string(),
        })
        .strict(),
    })
    .strict();
}

function aiResponseSchema(): unknown {
  const { z } = loadZod();
  const rowSchema = z.object({
    rowIndex: z.number(),
    economicBucket: z.enum(ECONOMIC_BUCKETS),
    confidence: z.enum(["high", "medium", "low"]),
    subcategory: z.string().nullable(),
    negotiability: z.enum(["likely_negotiable", "likely_non_negotiable", "unknown"]),
    assessment: aiAssessmentSchema(z).nullable(),
    reasonCodes: z.array(z.string()),
    explanation: z.string(),
  });
  return z.object({
    rows: z.array(rowSchema),
  });
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

function aiProviderLabel(provider: FiservProcessorFeeAiProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function aiProviderFailureMessage(provider: FiservProcessorFeeAiProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const normalized = detail.replace(/\s+/g, " ").trim().slice(0, 500);
  return `${aiProviderLabel(provider)} AI fee classification failed: ${normalized}`;
}

function aiFailureDetail(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const normalized = detail.replace(/\s+/g, " ").trim().slice(0, 500);
  return `${prefix}: ${normalized}`;
}

async function generateAiSuggestionsWithProvider(
  sdk: AiSdk,
  provider: FiservProcessorFeeAiProvider,
  modelName: string,
  packet: FiservProcessorFeeAiPacket,
  options: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    apiKey?: string;
  },
): Promise<FiservProcessorFeeAiSuggestion[]> {
  const factory =
    provider === "anthropic"
      ? options.apiKey && sdk.createAnthropic
        ? sdk.createAnthropic({ apiKey: options.apiKey })
        : sdk.anthropic
      : options.apiKey && sdk.createOpenAI
        ? sdk.createOpenAI({ apiKey: options.apiKey })
        : sdk.openai;
  if (!factory) {
    throw new Error(`${aiProviderLabel(provider)} AI SDK provider is not available.`);
  }

  const schema = aiResponseSchema();
  if (provider === "openai") {
    if (!sdk.generateText || !sdk.Output) {
      throw new Error("OpenAI structured output requires AI SDK generateText and Output.object.");
    }
    const result = await withTimeout(
      sdk.generateText({
        model: factory(modelName),
        output: sdk.Output.object({
          schema,
          name: "fee_classification_suggestions",
          description: "Conservative classifications for unresolved merchant-processing fee rows.",
        }),
        prompt: aiPrompt(packet),
        maxOutputTokens: Math.max(options.maxOutputTokens, 4000),
        ...openAiProviderOptions(),
      }),
      options.timeoutMs,
    );
    return parseAiObject(result.output).rows;
  }

  const result = await withTimeout(
    sdk.generateObject({
      model: factory(modelName),
      schema,
      prompt: aiPrompt(packet),
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
  return parseAiObject(result.object).rows;
}

function parseAiObject(value: unknown): { rows: FiservProcessorFeeAiSuggestion[] } {
  if (!value || typeof value !== "object" || !Array.isArray((value as { rows?: unknown }).rows)) {
    throw new Error("AI fee classification response did not contain rows.");
  }
  const rows = (value as { rows: unknown[] }).rows.map((candidate) => {
    const row = candidate as Partial<FiservProcessorFeeAiSuggestion>;
    if (!Number.isInteger(row.rowIndex)) throw new Error("AI fee classification rowIndex must be an integer.");
    if (!ECONOMIC_BUCKETS.includes(row.economicBucket as FiservProcessorFeeEconomicBucket)) {
      throw new Error(`AI fee classification returned unsupported economicBucket: ${String(row.economicBucket)}`);
    }
    if (row.confidence !== "high" && row.confidence !== "medium" && row.confidence !== "low") {
      throw new Error("AI fee classification confidence must be high, medium, or low.");
    }
    const rowIndex = Number(row.rowIndex);
    const economicBucket = row.economicBucket as FiservProcessorFeeEconomicBucket;
    const confidence = row.confidence;
    const negotiability: FiservProcessorFeeAiNegotiability =
      row.negotiability === "likely_negotiable" || row.negotiability === "likely_non_negotiable" ? row.negotiability : "unknown";
    const explanation = String(row.explanation ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
    return {
      rowIndex,
      economicBucket,
      confidence,
      subcategory: typeof row.subcategory === "string" && row.subcategory.trim() ? row.subcategory.trim() : null,
      negotiability,
      assessment: normalizeFiservAiFeeAssessment(
        row.assessment,
        assessmentDefaultsForSuggestion(economicBucket, negotiability, explanation),
      ),
      reasonCodes: Array.isArray(row.reasonCodes)
        ? row.reasonCodes.map((code) => String(code).trim()).filter(Boolean).slice(0, 8)
        : [],
      explanation,
    };
  });
  return { rows };
}

function assessmentDefaultsForSuggestion(
  bucket: FiservProcessorFeeEconomicBucket,
  negotiability: FiservProcessorFeeAiNegotiability,
  explanation: string,
): {
  paidToParty: FiservAiPaidToParty;
  passThroughProofPosture: FiservAiPassThroughProofPosture;
  negotiability: FiservProcessorFeeAiNegotiability;
  evidence: string[];
  fixedFeeAssessment?: FiservAiFeeAssessment["fixedFeeAssessment"];
} {
  const fixedFeeAssessment =
    bucket === "miscellaneous_or_statement_fee"
      ? {
          avoidable: "uncertain" as const,
          recommendation: explanation || "Ask the processor what service this fixed fee pays for and whether it can be removed or reduced.",
          confidence: "low" as const,
        }
      : null;
  if (bucket === "card_brand_pass_through") {
    return {
      paidToParty: "card_network",
      passThroughProofPosture: "not_enough_evidence",
      negotiability: "likely_non_negotiable",
      fixedFeeAssessment: null,
      evidence: explanation ? [explanation] : [],
    };
  }
  if (bucket === "zero_amount_no_charge") {
    return {
      paidToParty: "unknown",
      passThroughProofPosture: "not_enough_evidence",
      negotiability: "unknown",
      fixedFeeAssessment: null,
      evidence: explanation ? [explanation] : [],
    };
  }
  return {
    paidToParty: "processor_or_iso",
    passThroughProofPosture: "not_applicable_processor_controlled",
    negotiability,
    fixedFeeAssessment,
    evidence: explanation ? [explanation] : [],
  };
}

function atCostDefaultsForSuggestion(bucket: FiservProcessorFeeEconomicBucket): {
  atCostStatus: FiservProcessorAtCostStatus;
  atCostReasonCode: FiservProcessorAtCostReasonCode;
  costExposure: FiservProcessorCostExposure;
  needsUnbundling: boolean;
  marginAmountKnown: boolean;
} {
  switch (bucket) {
    case "card_brand_pass_through":
      return {
        atCostStatus: "indeterminate",
        atCostReasonCode: "NO_REFERENCE_FOR_PERIOD",
        costExposure: "itemized",
        needsUnbundling: false,
        marginAmountKnown: false,
      };
    case "processor_controlled_tiered_fee":
      return {
        atCostStatus: "unprovable_by_model",
        atCostReasonCode: "BLENDED_TIERED_BUCKET",
        costExposure: "blended",
        needsUnbundling: true,
        marginAmountKnown: false,
      };
    case "zero_amount_no_charge":
      return {
        atCostStatus: "not_applicable",
        atCostReasonCode: "ZERO_AMOUNT_NO_CHARGE",
        costExposure: "not_applicable",
        needsUnbundling: false,
        marginAmountKnown: false,
      };
    case "unknown_needs_review":
      return {
        atCostStatus: "indeterminate",
        atCostReasonCode: "BASE_UNKNOWN",
        costExposure: "hidden",
        needsUnbundling: false,
        marginAmountKnown: false,
      };
    case "processor_controlled_flat_discount_fee":
    case "processor_transaction_or_auth":
    case "miscellaneous_or_statement_fee":
      return {
        atCostStatus: "not_applicable",
        atCostReasonCode: "NOT_PASS_THROUGH_CATEGORY",
        costExposure: "not_applicable",
        needsUnbundling: false,
        marginAmountKnown: true,
      };
  }
}

function suggestionMeetsThreshold(suggestion: FiservProcessorFeeAiSuggestion, threshold: "high" | "medium" | "low"): boolean {
  return CONFIDENCE_RANK[suggestion.confidence] >= CONFIDENCE_RANK[threshold];
}

export function applyFiservProcessorFeeAiSuggestions<T extends FiservProcessorFeeRowForClassification>(
  rows: Array<FiservProcessorClassifiedFeeRow<T>>,
  printedTotal: number | null,
  suggestions: FiservProcessorFeeAiSuggestion[],
  options: {
    applyMinConfidence?: "high" | "medium" | "low";
    modelName?: string | null;
    provider?: FiservProcessorFeeAiProvider | null;
    notes?: string[];
  } = {},
): FiservProcessorFeeAiClassificationResult<T> {
  const threshold = options.applyMinConfidence ?? "medium";
  const suggestionsByRow = new Map<number, FiservProcessorFeeAiSuggestion>();
  for (const suggestion of suggestions) {
    suggestionsByRow.set(suggestion.rowIndex, suggestion);
  }

  let appliedSuggestionCount = 0;
  let skippedSuggestionCount = 0;
  const nextRows = rows.map((row, rowIndex) => {
    const suggestion = suggestionsByRow.get(rowIndex);
    if (!suggestion) return row;
    const deterministicUnknown = row.classification.economicBucket === "unknown_needs_review";
    const usable =
      deterministicUnknown &&
      suggestion.economicBucket !== "unknown_needs_review" &&
      suggestionMeetsThreshold(suggestion, threshold) &&
      suggestion.explanation.length > 0;
    if (!usable) {
      skippedSuggestionCount += 1;
      return row;
    }

    const defaults = atCostDefaultsForSuggestion(suggestion.economicBucket);
    const assessment =
      suggestion.assessment ??
      normalizeFiservAiFeeAssessment(
        null,
        assessmentDefaultsForSuggestion(suggestion.economicBucket, suggestion.negotiability, suggestion.explanation),
      );
    appliedSuggestionCount += 1;
    return {
      ...row,
      classification: makeFiservProcessorSyntheticFeeClassification({
        row,
        economicBucket: suggestion.economicBucket,
        confidence: suggestion.confidence,
        rule: "AI_FEE_CLASSIFICATION_SUGGESTION",
        reason: [
          suggestion.explanation,
          suggestion.subcategory ? `Subcategory: ${suggestion.subcategory}.` : null,
          `Negotiability: ${suggestion.negotiability}.`,
          `Paid to: ${assessment.paidToParty}.`,
          `Pass-through proof posture: ${assessment.passThroughProofPosture}.`,
          assessment.fixedFeeAssessment
            ? `Fixed fee avoidable assessment: ${assessment.fixedFeeAssessment.avoidable} (${assessment.fixedFeeAssessment.confidence}). ${assessment.fixedFeeAssessment.recommendation ?? ""}`
            : null,
          assessment.recommendation ? `Recommendation: ${assessment.recommendation}` : null,
          suggestion.reasonCodes.length > 0 ? `Reason codes: ${suggestion.reasonCodes.join(", ")}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        needsUnbundling: defaults.needsUnbundling,
        atCostStatus: defaults.atCostStatus,
        atCostReasonCode: defaults.atCostReasonCode,
        costExposure: defaults.costExposure,
        marginAmountKnown: defaults.marginAmountKnown,
        aiAssessment: assessment,
      }),
    };
  });

  const summary = summarizeFiservProcessorFeeClassifications(nextRows, printedTotal);
  const notes = [
    ...(options.notes ?? []),
    appliedSuggestionCount > 0
      ? `Applied ${appliedSuggestionCount} AI fee classification suggestion(s) at ${threshold}+ confidence.`
      : "No AI fee classification suggestions met the apply threshold.",
  ];
  if (skippedSuggestionCount > 0) {
    notes.push(`${skippedSuggestionCount} AI fee classification suggestion(s) were left for review.`);
  }

  return {
    rows: nextRows,
    summary: {
      ...summary,
      notes: [...summary.notes, ...notes],
    },
    ai: {
      status: appliedSuggestionCount > 0 ? "applied" : "no_usable_suggestions",
      provider: options.provider ?? null,
      model: options.modelName ?? null,
      unresolvedInputRowCount: rows.filter((row) => row.classification.economicBucket === "unknown_needs_review").length,
      suggestionCount: suggestions.length,
      appliedSuggestionCount,
      skippedSuggestionCount,
      notes,
    },
  };
}

export async function maybeRunFiservProcessorFeeAiClassification<T extends FiservProcessorFeeRowForClassification>(
  rows: Array<FiservProcessorClassifiedFeeRow<T>>,
  summary: FiservProcessorFeeClassificationSummary,
  printedTotal: number | null,
  context: FiservProcessorFeeAiContext,
  options: AiOptions = {},
): Promise<FiservProcessorFeeAiClassificationResult<T>> {
  const packet = buildFiservProcessorFeeAiPacket(rows, summary, context);
  const disabledResult = (status: FiservProcessorFeeAiRunStatus, note: string): FiservProcessorFeeAiClassificationResult<T> => ({
    rows,
    summary,
    ai: {
      status,
      provider: null,
      model: null,
      unresolvedInputRowCount: packet.unresolvedRows.length,
      suggestionCount: 0,
      appliedSuggestionCount: 0,
      skippedSuggestionCount: 0,
      notes: [note],
    },
  });

  if (packet.unresolvedRows.length === 0) {
    return disabledResult("not_needed", "No unresolved Fiserv processor fee rows required AI classification.");
  }
  if (!feeAiEnabled(options)) {
    return disabledResult("disabled", "AI fee classification is disabled.");
  }
  const providerAttempts = feeAiProviderAttempts(options, packet);
  if (providerAttempts.length === 0) {
    return disabledResult("disabled", missingProviderKeyNote(options));
  }

  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_FEE_CLASSIFICATION_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 12000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_FEE_CLASSIFICATION_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 2000);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_FEE_CLASSIFICATION_TIMEOUT_MS ?? 8000);
  let sdk: AiSdk;
  const failureNotes: string[] = [];
  try {
    sdk = options.sdk ?? loadAiSdk();
  } catch (error) {
    failureNotes.push(aiFailureDetail("AI SDK loading failed", error));
    return {
      rows,
      summary: {
        ...summary,
        notes: [
          ...summary.notes,
          "AI fee classification failed before provider execution; deterministic classifications preserved.",
          ...failureNotes,
        ],
      },
      ai: {
        status: "failed",
        provider: null,
        model:
          providerAttempts.length === 1
            ? providerAttempts[0]?.modelName ?? null
            : providerAttempts.map((attempt) => `${attempt.provider}:${attempt.modelName}`).join(", "),
        unresolvedInputRowCount: packet.unresolvedRows.length,
        suggestionCount: 0,
        appliedSuggestionCount: 0,
        skippedSuggestionCount: 0,
        notes: [
          "AI fee classification failed before provider execution; deterministic classifications preserved.",
          ...failureNotes,
        ],
      },
    };
  }

  for (const attempt of providerAttempts) {
    try {
      const suggestions = await generateAiSuggestionsWithProvider(sdk, attempt.provider, attempt.modelName, packet, {
        maxInputTokens,
        maxOutputTokens,
        timeoutMs,
        apiKey: providerApiKey(attempt.provider, options),
      });
      return applyFiservProcessorFeeAiSuggestions(rows, printedTotal, suggestions, {
        applyMinConfidence: applyMinConfidence(options),
        modelName: attempt.modelName,
        provider: attempt.provider,
        notes: failureNotes.length > 0 ? [...failureNotes, `Used ${aiProviderLabel(attempt.provider)} fallback.`] : [],
      });
    } catch (error) {
      failureNotes.push(aiProviderFailureMessage(attempt.provider, error));
    }
  }

  return {
    rows,
    summary: {
      ...summary,
      notes: [
        ...summary.notes,
        "AI fee classification failed across all configured providers; deterministic classifications preserved.",
        ...failureNotes,
      ],
    },
    ai: {
      status: "failed",
      provider: null,
      model:
        providerAttempts.length === 1
          ? providerAttempts[0]?.modelName ?? null
          : providerAttempts.map((attempt) => `${attempt.provider}:${attempt.modelName}`).join(", "),
      unresolvedInputRowCount: packet.unresolvedRows.length,
      suggestionCount: 0,
      appliedSuggestionCount: 0,
      skippedSuggestionCount: 0,
      notes: [
        "AI fee classification failed across all configured providers; deterministic classifications preserved.",
        ...failureNotes,
      ],
    },
  };
}

export async function maybeRunFiservProcessorFeeAiClassificationForParserOutput<T extends FiservProcessorFeeRowForClassification, O extends ParserOutputWithFiservFeeLedger<T>>(
  output: O,
  options: AiOptions = {},
): Promise<{ output: O; ai: FiservProcessorFeeAiRunMetadata }> {
  const context: FiservProcessorFeeAiContext = {
    processorPlatform: output.statementIdentity.statementFamily,
    visibleBrand: output.statementIdentity.visibleBrand,
    merchantName: output.statementIdentity.merchantName ?? null,
    merchantNumber: output.statementIdentity.merchantNumber ?? null,
    statementPeriodStart: output.statementIdentity.statementPeriodStart,
    statementPeriodEnd: output.statementIdentity.statementPeriodEnd,
    pricingModel: output.pricingModel?.pricingModel ?? null,
    totalVolume: output.selectedFinancials.totalVolume,
    totalFees: output.selectedFinancials.totalFees,
    effectiveRate: output.selectedFinancials.effectiveRate,
  };
  const result = await maybeRunFiservProcessorFeeAiClassification(
    output.feeLedger.rows,
    output.feeLedger.feeClassificationSummary,
    output.feeLedger.printedTotal,
    context,
    options,
  );

  if (result.ai.status === "disabled" || result.ai.status === "not_needed") {
    return { output, ai: result.ai };
  }

  const nextOutput = {
    ...output,
    feeLedger: {
      ...output.feeLedger,
      rows: result.rows,
      feeClassificationSummary: result.summary,
    },
    decision: buildParserDecision({
      reconciliation: output.reconciliation,
      reconciliationResults: output.reconciliationResults,
      feeClassification: result.summary,
      warnings: output.warnings,
      confidence: output.confidence.overall,
    }),
  };

  return { output: nextOutput, ai: result.ai };
}
