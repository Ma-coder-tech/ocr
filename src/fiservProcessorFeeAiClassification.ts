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

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type AnthropicModelFactory = (modelName: string) => unknown;

type AiSdk = {
  generateObject: GenerateObject;
  anthropic: AnthropicModelFactory;
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

export type FiservProcessorFeeAiNegotiability = "likely_negotiable" | "likely_non_negotiable" | "unknown";

export type FiservProcessorFeeAiSuggestion = {
  rowIndex: number;
  economicBucket: FiservProcessorFeeEconomicBucket;
  confidence: "high" | "medium" | "low";
  subcategory: string | null;
  negotiability: FiservProcessorFeeAiNegotiability;
  reasonCodes: string[];
  explanation: string;
};

export type FiservProcessorFeeAiRunStatus = "disabled" | "not_needed" | "applied" | "no_usable_suggestions" | "failed";

export type FiservProcessorFeeAiRunMetadata = {
  status: FiservProcessorFeeAiRunStatus;
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
  apiKey?: string;
  modelName?: string;
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
  const ai = require("ai") as { generateObject: GenerateObject };
  const anthropicSdk = require("@ai-sdk/anthropic") as { anthropic: AnthropicModelFactory };
  return {
    generateObject: ai.generateObject,
    anthropic: anthropicSdk.anthropic,
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

function feeAiModelName(options: AiOptions, packet: FiservProcessorFeeAiPacket): string {
  if (options.modelName) return options.modelName;
  const escalationModel = process.env.AI_FEE_CLASSIFICATION_ESCALATION_MODEL;
  const escalationThreshold = Number(process.env.AI_FEE_CLASSIFICATION_ESCALATION_MIN_AMOUNT ?? 100);
  const maxUnresolvedAmount = Math.max(0, ...packet.unresolvedRows.map((row) => row.amount));
  if (escalationModel && Number.isFinite(escalationThreshold) && maxUnresolvedAmount >= escalationThreshold) {
    return escalationModel;
  }
  return process.env.AI_FEE_CLASSIFICATION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
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
    "Use unknown_needs_review if the row cannot be classified from the provided evidence.",
    "Do not classify a fee as proven pass-through-at-cost. At-cost proof is handled by a separate deterministic reference-rate layer.",
    "Structured statement packet:",
    JSON.stringify(packet),
  ].join("\n\n");
}

function aiResponseSchema(): unknown {
  const { z } = loadZod();
  const rowSchema = z.object({
    rowIndex: z.number(),
    economicBucket: z.enum(ECONOMIC_BUCKETS),
    confidence: z.enum(["high", "medium", "low"]),
    subcategory: z.string().nullable(),
    negotiability: z.enum(["likely_negotiable", "likely_non_negotiable", "unknown"]),
    reasonCodes: z.array(z.string()),
    explanation: z.string(),
  });
  return z.object({
    rows: z.array(rowSchema),
  });
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
    return {
      rowIndex,
      economicBucket,
      confidence,
      subcategory: typeof row.subcategory === "string" && row.subcategory.trim() ? row.subcategory.trim() : null,
      negotiability,
      reasonCodes: Array.isArray(row.reasonCodes)
        ? row.reasonCodes.map((code) => String(code).trim()).filter(Boolean).slice(0, 8)
        : [],
      explanation: String(row.explanation ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
    };
  });
  return { rows };
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
  options: { applyMinConfidence?: "high" | "medium" | "low"; modelName?: string | null } = {},
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
          suggestion.reasonCodes.length > 0 ? `Reason codes: ${suggestion.reasonCodes.join(", ")}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
        needsUnbundling: defaults.needsUnbundling,
        atCostStatus: defaults.atCostStatus,
        atCostReasonCode: defaults.atCostReasonCode,
        costExposure: defaults.costExposure,
        marginAmountKnown: defaults.marginAmountKnown,
      }),
    };
  });

  const summary = summarizeFiservProcessorFeeClassifications(nextRows, printedTotal);
  const notes = [
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
  if (!(options.apiKey ?? process.env.ANTHROPIC_API_KEY)) {
    return disabledResult("disabled", "AI fee classification requires ANTHROPIC_API_KEY.");
  }

  const modelName = feeAiModelName(options, packet);
  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_FEE_CLASSIFICATION_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 12000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_FEE_CLASSIFICATION_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 2000);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_FEE_CLASSIFICATION_TIMEOUT_MS ?? 8000);

  try {
    const sdk = options.sdk ?? loadAiSdk();
    const result = await withTimeout(
      sdk.generateObject({
        model: sdk.anthropic(modelName),
        schema: aiResponseSchema(),
        prompt: aiPrompt(packet),
        maxOutputTokens,
        temperature: 0,
        providerOptions: {
          anthropic: {
            maxInputTokens,
          },
        },
      }),
      timeoutMs,
    );
    const parsed = parseAiObject(result.object);
    return applyFiservProcessorFeeAiSuggestions(rows, printedTotal, parsed.rows, {
      applyMinConfidence: applyMinConfidence(options),
      modelName,
    });
  } catch (error) {
    return {
      rows,
      summary: {
        ...summary,
        notes: [
          ...summary.notes,
          `AI fee classification failed; deterministic classifications preserved. ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      },
      ai: {
        status: "failed",
        model: modelName,
        unresolvedInputRowCount: packet.unresolvedRows.length,
        suggestionCount: 0,
        appliedSuggestionCount: 0,
        skippedSuggestionCount: 0,
        notes: [`AI fee classification failed; deterministic classifications preserved.`],
      },
    };
  }
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
