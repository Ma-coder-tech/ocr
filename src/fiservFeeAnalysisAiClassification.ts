import { createRequire } from "node:module";
import {
  type FiservCanonicalFeeType,
} from "./fiservFeeNormalizer.js";
import { loadFiservFeeReference } from "./fiservFeeReference.js";
import {
  finalizeFiservFeeAnalysisPresentation,
  type FiservFeeAnalysisBucket,
  type FiservFeeAnalysisFinding,
  type FiservFeeAnalysisRow,
  type FiservFeeAnalysisV2,
} from "./fiservFeeAnalysis.js";
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
import { round2, round8 } from "./reconciliation.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type FiservFeeAiProvider = "anthropic" | "openai";
type FiservFeeAiProviderPreference = FiservFeeAiProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type FiservFeeAnalysisAiContext = {
  statementFamily: string;
  visibleBrand: string;
  merchantName: string | null;
  merchantNumber: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  pricingModel: string | null;
  pricingModelAnalysisStatus: string | null;
  totalVolume: number | null;
  totalFees: number | null;
  effectiveRate: number | null;
};

export type FiservFeeAnalysisAiPacketRow = {
  rowIndex: number;
  cardTypeSection: string | null;
  description: string;
  normalizedDescription: string;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  currentFeeType: FiservCanonicalFeeType;
  currentProofStatus: FiservFeeAnalysisRow["proofStatus"];
  evidenceLine: string;
};

type ReferenceHint = {
  id: string;
  network: string;
  canonicalName: string;
  category: string;
  labels: string[];
  rateType: string;
  referenceRate: number | null;
  notes: string;
};

export type FiservFeeAnalysisAiPacket = {
  context: FiservFeeAnalysisAiContext;
  unresolvedRows: FiservFeeAnalysisAiPacketRow[];
  referenceHints: ReferenceHint[];
  instructions: string[];
};

export type FiservFeeAnalysisAiSuggestion = {
  rowIndex: number;
  feeType: FiservCanonicalFeeType;
  confidence: "high" | "medium" | "low";
  paidTo: "card_network" | "issuer_or_interchange" | "processor_or_iso" | "unknown";
  negotiability: "non_negotiable" | "negotiable" | "unknown";
  canonicalName: string | null;
  suggestedReferenceId: string | null;
  proofStatus: "indeterminate" | "not_enough_detail" | "processor_controlled";
  assessment?: FiservAiFeeAssessment;
  reasonCodes: string[];
  explanation: string;
};

export type FiservFeeAnalysisAiRunStatus = "disabled" | "not_needed" | "applied" | "no_usable_suggestions" | "failed";

export type FiservFeeAnalysisAiRunMetadata = {
  status: FiservFeeAnalysisAiRunStatus;
  provider: FiservFeeAiProvider | null;
  model: string | null;
  unresolvedInputRowCount: number;
  suggestionCount: number;
  appliedSuggestionCount: number;
  skippedSuggestionCount: number;
  notes: string[];
};

export type FiservFeeAnalysisAiOptions = {
  enabled?: boolean;
  provider?: FiservFeeAiProviderPreference;
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

type ParserOutputWithFiservFeeAnalysisV2 = {
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
    transactionCount?: {
      primaryTransactionCount: number | null;
    };
  };
  fiservFeeAnalysisV2?: FiservFeeAnalysisV2;
};

const FEE_TYPES = [
  "interchange",
  "card_brand_network",
  "processor_pct_markup",
  "processor_per_item",
  "processor_fixed",
  "pin_debit_network",
  "pin_debit_interchange",
  "pin_debit_network_annual",
  "compliance_penalty",
  "third_party_service",
  "suspicious_pass_through_like_fee",
  "unknown",
  "zero_amount",
] as const satisfies readonly FiservCanonicalFeeType[];

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

function aiEnabled(options: FiservFeeAnalysisAiOptions): boolean {
  return options.enabled ?? envFlag("AI_FEE_CLASSIFICATION_ENABLED");
}

function providerPreference(options: FiservFeeAnalysisAiOptions): FiservFeeAiProviderPreference {
  const configured = options.provider ?? process.env.AI_FEE_CLASSIFICATION_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: FiservFeeAiProvider, options: FiservFeeAnalysisAiOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function providerAttempts(options: FiservFeeAnalysisAiOptions): Array<{ provider: FiservFeeAiProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: FiservFeeAiProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({
      provider,
      modelName: modelNameForProvider(provider, options),
    }));
}

function modelNameForProvider(provider: FiservFeeAiProvider, options: FiservFeeAnalysisAiOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_FEE_CLASSIFICATION_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.AI_FEE_CLASSIFICATION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function missingKeyNote(options: FiservFeeAnalysisAiOptions): string {
  const preference = providerPreference(options);
  if (preference === "anthropic") return "V2 AI fee classification requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "V2 AI fee classification requires OPENAI_API_KEY.";
  return "V2 AI fee classification requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

function applyMinConfidence(options: FiservFeeAnalysisAiOptions): "high" | "medium" | "low" {
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
        timer = setTimeout(() => reject(new Error(`V2 AI fee classification timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function networkFromSection(section: string | null): string | null {
  const normalized = String(section ?? "").toUpperCase();
  if (normalized.includes("VISA") || normalized.includes("SIGNATURE DEBIT") || normalized.startsWith("VS ")) return "Visa";
  if (normalized.includes("AMEX") || normalized.includes("AXP")) return "Amex";
  if (normalized.includes("MASTERCARD") || normalized.startsWith("MC ")) return "Mastercard";
  if (normalized.includes("DISCOVER") || normalized.includes("DCVR")) return "Discover";
  return null;
}

function referenceHintsFor(rows: FiservFeeAnalysisAiPacketRow[]): ReferenceHint[] {
  const networks = new Set(rows.map((row) => networkFromSection(row.cardTypeSection)).filter((network): network is string => Boolean(network)));
  const reference = loadFiservFeeReference();
  return reference.fees
    .filter((entry) => networks.has(entry.network) || entry.network === "All" || entry.network === "Processor")
    .filter((entry) => entry.category !== "processor_misc" || rows.some((row) => /PCI|REGULATORY|MONTHLY|ANNUAL|BATCH/i.test(row.description)))
    .map((entry) => ({
      id: entry.id,
      network: entry.network,
      canonicalName: entry.canonical_name,
      category: entry.category,
      labels: entry.fiserv_labels.slice(0, 8),
      rateType: entry.rate_type,
      referenceRate: entry.reference_rate,
      notes: entry.notes.slice(0, 280),
    }))
    .slice(0, 80);
}

export function buildFiservFeeAnalysisAiPacket(analysis: FiservFeeAnalysisV2, context: FiservFeeAnalysisAiContext): FiservFeeAnalysisAiPacket {
  const unresolvedRows = analysis.rows
    .filter((row) => row.matchMethod === "ai_candidate")
    .map((row) => ({
      rowIndex: row.rowIndex,
      cardTypeSection: row.cardTypeSection,
      description: row.description,
      normalizedDescription: row.normalizedDescription,
      amount: row.amount,
      volumeBasis: row.volumeBasis,
      count: row.count,
      rate: row.rate,
      currentFeeType: row.feeType,
      currentProofStatus: row.proofStatus,
      evidenceLine: row.evidenceLine,
    }));

  return {
    context,
    unresolvedRows,
    referenceHints: referenceHintsFor(unresolvedRows),
    instructions: [
      "Classify only rows whose matchMethod is ai_candidate; do not override deterministic exact or fuzzy rows.",
      "Use the card-type section, fee label, amount/count/rate math, merchant context, pricing model, and reference hints.",
      "AI may classify the fee category and likely paid-to party, but AI must not invent proof that a charged amount equals a pass-through rate.",
      "Return an assessment object for every suggestion: paid-to party, pass-through proof posture, negotiability, avoidable likelihood, merchant action, recommendation, evidence, and source evidence.",
      "When classifying a row as processor_fixed, include fixedFeeAssessment with avoidable true/false/uncertain, a specific recommendation, and confidence. Use false for a real service the merchant likely uses, true for junk/avoidable fees, and uncertain when the label is too generic.",
      "Use source_backed_math_candidate only when the row maps to a reference hint/source and the row math supports the candidate. Deterministic rate verification must still confirm it before final proof becomes proven or likely.",
      "For network/interchange/program fees without a deterministic fixed-rate reference, return proofStatus indeterminate or not_enough_detail.",
      "Return unknown when the evidence is too generic, contradictory, or not tied to a network or processor-controlled pattern.",
      "Prefer conservative classifications over impressive-sounding certainty.",
    ],
  };
}

function aiPrompt(packet: FiservFeeAnalysisAiPacket): string {
  return [
    "You classify unknown Fiserv/First Data merchant statement fee rows for a fee-analysis product.",
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Allowed feeType values:",
    FEE_TYPES.join(", "),
    "Allowed proofStatus values: indeterminate, not_enough_detail, processor_controlled.",
    "Never return proven or likely; deterministic rate verification is a separate layer.",
    "Assessment passThroughProofPosture must be one of: source_backed_math_candidate, not_applicable_processor_controlled, not_pass_through, not_enough_evidence.",
    "AI can suggest source-backed pass-through proof only as source_backed_math_candidate with sourceEvidence. It cannot set the row proofStatus to proven or likely.",
    "Use processor_* fee types only when the label points to processor/ISO markup, service fees, monthly fees, gateway fees, or discount markup.",
    "Use interchange for card-program wholesale/interchange rows such as Amex OptBlue restaurant/base/tier program buckets.",
    "Use card_brand_network for network assessments, auth, account verification, acquirer processing, integrity, and network pass-through fees.",
    "Structured packet:",
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
    feeType: z.enum(FEE_TYPES),
    confidence: z.enum(["high", "medium", "low"]),
    paidTo: z.enum(["card_network", "issuer_or_interchange", "processor_or_iso", "unknown"]),
    negotiability: z.enum(["non_negotiable", "negotiable", "unknown"]),
    canonicalName: z.string().nullable(),
    suggestedReferenceId: z.string().nullable(),
    proofStatus: z.enum(["indeterminate", "not_enough_detail", "processor_controlled"]),
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

function providerLabel(provider: FiservFeeAiProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function failureMessage(provider: FiservFeeAiProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${providerLabel(provider)} V2 AI fee classification failed: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`;
}

async function generateSuggestionsWithProvider(
  sdk: AiSdk,
  provider: FiservFeeAiProvider,
  modelName: string,
  packet: FiservFeeAnalysisAiPacket,
  options: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    apiKey?: string;
  },
): Promise<FiservFeeAnalysisAiSuggestion[]> {
  const factory =
    provider === "anthropic"
      ? options.apiKey && sdk.createAnthropic
        ? sdk.createAnthropic({ apiKey: options.apiKey })
        : sdk.anthropic
      : options.apiKey && sdk.createOpenAI
        ? sdk.createOpenAI({ apiKey: options.apiKey })
        : sdk.openai;
  if (!factory) throw new Error(`${providerLabel(provider)} AI SDK provider is not available.`);

  const schema = aiResponseSchema();
  if (provider === "openai") {
    if (!sdk.generateText || !sdk.Output) throw new Error("OpenAI structured output requires AI SDK generateText and Output.object.");
    const result = await withTimeout(
      sdk.generateText({
        model: factory(modelName),
        output: sdk.Output.object({
          schema,
          name: "fiserv_v2_fee_classification",
          description: "Conservative V2 classifications for unknown Fiserv fee rows.",
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

function parseAiObject(value: unknown): { rows: FiservFeeAnalysisAiSuggestion[] } {
  if (!value || typeof value !== "object" || !Array.isArray((value as { rows?: unknown }).rows)) {
    throw new Error("V2 AI fee classification response did not contain rows.");
  }
  const rows = (value as { rows: unknown[] }).rows.map((candidate) => {
    const row = candidate as Partial<FiservFeeAnalysisAiSuggestion>;
    if (!Number.isInteger(row.rowIndex)) throw new Error("V2 AI fee classification rowIndex must be an integer.");
    if (!FEE_TYPES.includes(row.feeType as FiservCanonicalFeeType)) {
      throw new Error(`V2 AI fee classification returned unsupported feeType: ${String(row.feeType)}`);
    }
    if (row.confidence !== "high" && row.confidence !== "medium" && row.confidence !== "low") {
      throw new Error("V2 AI fee classification confidence must be high, medium, or low.");
    }
    const rowIndex = Number(row.rowIndex);
    const paidTo: FiservFeeAnalysisAiSuggestion["paidTo"] =
      row.paidTo === "card_network" || row.paidTo === "issuer_or_interchange" || row.paidTo === "processor_or_iso" ? row.paidTo : "unknown";
    const negotiability: FiservFeeAnalysisAiSuggestion["negotiability"] =
      row.negotiability === "non_negotiable" || row.negotiability === "negotiable" ? row.negotiability : "unknown";
    const canonicalName = typeof row.canonicalName === "string" && row.canonicalName.trim() ? row.canonicalName.trim().slice(0, 160) : null;
    const suggestedReferenceId =
      typeof row.suggestedReferenceId === "string" && row.suggestedReferenceId.trim() ? row.suggestedReferenceId.trim().slice(0, 80) : null;
    const proofStatus =
      row.proofStatus === "processor_controlled" || row.proofStatus === "not_enough_detail" || row.proofStatus === "indeterminate"
        ? row.proofStatus
        : "indeterminate";
    const explanation = String(row.explanation ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
    return {
      rowIndex,
      feeType: row.feeType as FiservCanonicalFeeType,
      confidence: row.confidence,
      paidTo,
      negotiability,
      canonicalName,
      suggestedReferenceId,
      proofStatus,
      assessment: normalizeFiservAiFeeAssessment(
        row.assessment,
        assessmentDefaultsForSuggestion({
          feeType: row.feeType as FiservCanonicalFeeType,
          paidTo,
          negotiability,
          suggestedReferenceId,
          canonicalName,
          explanation,
        }),
      ),
      reasonCodes: Array.isArray(row.reasonCodes)
        ? row.reasonCodes.map((code) => String(code).trim()).filter(Boolean).slice(0, 8)
        : [],
      explanation,
    };
  });
  return { rows };
}

function negotiabilityForAssessment(value: FiservFeeAnalysisAiSuggestion["negotiability"]): FiservAiNegotiability {
  if (value === "negotiable") return "likely_negotiable";
  if (value === "non_negotiable") return "likely_non_negotiable";
  return "unknown";
}

function paidToPartyForAssessment(value: FiservFeeAnalysisAiSuggestion["paidTo"]): FiservAiPaidToParty {
  return value === "card_network" || value === "issuer_or_interchange" || value === "processor_or_iso" ? value : "unknown";
}

function isProcessorControlledFeeType(feeType: FiservCanonicalFeeType): boolean {
  return (
    feeType === "processor_pct_markup" ||
    feeType === "processor_per_item" ||
    feeType === "processor_fixed" ||
    feeType === "compliance_penalty" ||
    feeType === "third_party_service"
  );
}

function assessmentDefaultsForSuggestion(params: {
  feeType: FiservCanonicalFeeType;
  paidTo: FiservFeeAnalysisAiSuggestion["paidTo"];
  negotiability: FiservFeeAnalysisAiSuggestion["negotiability"];
  suggestedReferenceId: string | null;
  canonicalName: string | null;
  explanation: string;
}): {
  paidToParty: FiservAiPaidToParty;
  passThroughProofPosture: FiservAiPassThroughProofPosture;
  negotiability: FiservAiNegotiability;
  evidence: string[];
  sourceEvidence?: Partial<FiservAiFeeAssessment["sourceEvidence"]>;
  fixedFeeAssessment?: FiservAiFeeAssessment["fixedFeeAssessment"];
} {
  const processorControlled = isProcessorControlledFeeType(params.feeType);
  const fixedFeeAssessment =
    params.feeType === "processor_fixed"
      ? {
          avoidable: "uncertain" as const,
          recommendation: params.explanation || "Ask the processor what service this fixed fee pays for and whether it can be removed or reduced.",
          confidence: "low" as const,
        }
      : null;
  return {
    paidToParty: paidToPartyForAssessment(params.paidTo),
    passThroughProofPosture: processorControlled
      ? "not_applicable_processor_controlled"
      : params.suggestedReferenceId
        ? "source_backed_math_candidate"
        : "not_enough_evidence",
    negotiability: negotiabilityForAssessment(params.negotiability),
    fixedFeeAssessment,
    evidence: params.explanation ? [params.explanation] : [],
    sourceEvidence: {
      sourceName: params.canonicalName,
      referenceId: params.suggestedReferenceId,
      verificationNote: params.suggestedReferenceId
        ? "AI matched the row to a candidate reference; deterministic reference-rate math must verify before proof can become proven or likely."
        : "AI assessment is advisory; no source-backed reference candidate was provided.",
    },
  };
}

function suggestionMeetsThreshold(suggestion: FiservFeeAnalysisAiSuggestion, threshold: "high" | "medium" | "low"): boolean {
  return CONFIDENCE_RANK[suggestion.confidence] >= CONFIDENCE_RANK[threshold];
}

function guardedProofStatus(suggestion: FiservFeeAnalysisAiSuggestion): FiservFeeAnalysisRow["proofStatus"] {
  if (isProcessorControlledFeeType(suggestion.feeType)) {
    return "processor_controlled";
  }
  return suggestion.proofStatus === "processor_controlled" ? "indeterminate" : suggestion.proofStatus;
}

function applySuggestionToRow(row: FiservFeeAnalysisRow, suggestion: FiservFeeAnalysisAiSuggestion): FiservFeeAnalysisRow {
  const proofStatus = guardedProofStatus(suggestion);
  const assessment =
    suggestion.assessment ??
    normalizeFiservAiFeeAssessment(
      null,
      assessmentDefaultsForSuggestion({
        feeType: suggestion.feeType,
        paidTo: suggestion.paidTo,
        negotiability: suggestion.negotiability,
        suggestedReferenceId: suggestion.suggestedReferenceId,
        canonicalName: suggestion.canonicalName,
        explanation: suggestion.explanation,
      }),
    );
  return {
    ...row,
    feeType: suggestion.feeType,
    matchMethod: "ai_classified",
    matchConfidence: suggestion.confidence,
    canonicalName: suggestion.canonicalName,
    referenceId: suggestion.suggestedReferenceId,
    proofStatus,
    rateComparison: "not_compared",
    expectedAmount: null,
    delta: null,
    deltaPct: null,
    comparedBasis: "not_compared",
    referenceRate: null,
    tolerancePct: null,
    reason: [
      assessment.passThroughProofPosture === "source_backed_math_candidate"
        ? `AI classified this row as ${suggestion.feeType} and supplied source-backed proof evidence, but proof remains ${proofStatus} until deterministic rate verification confirms the math.`
        : `AI classified this row as ${suggestion.feeType}; proof remains ${proofStatus} because AI classification is not deterministic rate verification.`,
      suggestion.explanation,
      `Paid to: ${suggestion.paidTo}.`,
      `Negotiability: ${suggestion.negotiability}.`,
      `Pass-through proof posture: ${assessment.passThroughProofPosture}.`,
      assessment.fixedFeeAssessment
        ? `Fixed fee avoidable assessment: ${assessment.fixedFeeAssessment.avoidable} (${assessment.fixedFeeAssessment.confidence}). ${assessment.fixedFeeAssessment.recommendation ?? ""}`
        : null,
      assessment.recommendation ? `Recommendation: ${assessment.recommendation}` : null,
      suggestion.reasonCodes.length > 0 ? `Reason codes: ${suggestion.reasonCodes.join(", ")}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    aiAssessment: assessment,
  };
}

function bucketRows(rows: FiservFeeAnalysisRow[], totalFees: number): FiservFeeAnalysisBucket[] {
  return FEE_TYPES.map((feeType) => {
    const matching = rows.filter((row) => row.feeType === feeType);
    const amount = round2(matching.reduce((sum, row) => sum + row.amount, 0));
    return {
      feeType,
      amount,
      rows: matching.length,
      pctOfFees: totalFees > 0 ? round2((amount / totalFees) * 100) : null,
    };
  }).filter((bucket) => bucket.rows > 0);
}

function rateVerification(rows: FiservFeeAnalysisRow[]): FiservFeeAnalysisV2["rateVerification"] {
  return {
    proven: rows.filter((row) => row.proofStatus === "proven").length,
    likely: rows.filter((row) => row.proofStatus === "likely").length,
    processorControlled: rows.filter((row) => row.proofStatus === "processor_controlled").length,
    indeterminate: rows.filter((row) => row.proofStatus === "indeterminate").length,
    notEnoughDetail: rows.filter((row) => row.proofStatus === "not_enough_detail").length,
  };
}

function processorMarkupAnalysis(
  rows: FiservFeeAnalysisRow[],
  current: FiservFeeAnalysisV2["processorMarkupAnalysis"],
  totalVolume: number | null,
): FiservFeeAnalysisV2["processorMarkupAnalysis"] {
  if (current.status !== "ready") return current;
  const processorRows = rows.filter((row) => row.feeType === "processor_pct_markup" || row.feeType === "processor_per_item" || row.feeType === "processor_fixed");
  const processorControlledTotal = round2(processorRows.reduce((sum, row) => sum + row.amount, 0));
  const processorPctMarkupTotal = round2(rows.filter((row) => row.feeType === "processor_pct_markup").reduce((sum, row) => sum + row.amount, 0));
  const processorPerItemTotal = round2(rows.filter((row) => row.feeType === "processor_per_item").reduce((sum, row) => sum + row.amount, 0));
  const processorFixedTotal = round2(rows.filter((row) => row.feeType === "processor_fixed").reduce((sum, row) => sum + row.amount, 0));
  const junkFeeTotal = round2(rows.filter((row) => row.description.toUpperCase() === "REGULATORY PRODUCT").reduce((sum, row) => sum + row.amount, 0));
  return {
    ...current,
    processorControlledTotal,
    processorMarkupRate: totalVolume !== null && totalVolume > 0 ? round8(processorControlledTotal / totalVolume) : null,
    processorPctMarkupTotal,
    processorPerItemTotal,
    processorFixedTotal,
    junkFeeTotal,
  };
}

function aiFinding(params: Omit<FiservFeeAnalysisFinding, "action" | "monthlyCost" | "annualEstimate" | "componentImpactEstimate">): FiservFeeAnalysisFinding {
  return {
    ...params,
    action: "none",
    monthlyCost: params.amount,
    annualEstimate: params.amount === null ? null : round2(params.amount * 12),
    componentImpactEstimate: null,
  };
}

function findingsFor(analysis: Omit<FiservFeeAnalysisV2, "findings">): FiservFeeAnalysisFinding[] {
  const findings: FiservFeeAnalysisFinding[] = [];
  for (const row of analysis.rows.filter((candidate) => candidate.rateComparison === "above_reference")) {
    findings.push(aiFinding({
      kind: "rate_exceeds_reference",
      severity: row.matchConfidence === "high" ? "high" : "warning",
      title: `${row.description} exceeds the reference rate`,
      amount: row.delta,
      evidence: [row.reason, row.evidenceLine],
    }));
  }
  if (analysis.processorMarkupAnalysis.status === "pending_pricing_model_rules") {
    findings.push(aiFinding({
      kind: "pricing_model_pending_rules",
      severity: "info",
      title: "Processor markup analysis is pending for this pricing model",
      amount: null,
      evidence: [analysis.processorMarkupAnalysis.message],
    }));
  }
  if (analysis.processorMarkupAnalysis.perItemStacking.detected) {
    findings.push(aiFinding({
      kind: "processor_per_item_stacking",
      severity: "high",
      title: "Multiple processor per-item fees are stacked",
      amount: analysis.processorMarkupAnalysis.processorPerItemTotal,
      evidence: analysis.processorMarkupAnalysis.perItemStacking.fees,
    }));
  }
  if ((analysis.processorMarkupAnalysis.junkFeeTotal ?? 0) > 0) {
    findings.push(aiFinding({
      kind: "junk_fee",
      severity: "warning",
      title: "Regulatory Product fee is processor-controlled",
      amount: analysis.processorMarkupAnalysis.junkFeeTotal,
      evidence: ["No network reference rate applies to the Regulatory Product fee."],
    }));
  }
  if (analysis.normalization.aiCandidateCount > 0) {
    findings.push(aiFinding({
      kind: "normalization_ai_candidates",
      severity: "info",
      title: "Some fee labels need AI-assisted reference review",
      amount: null,
      evidence: [`${analysis.normalization.aiCandidateCount} row(s) did not match the deterministic Fiserv reference table.`],
    }));
  }
  for (const row of analysis.rows.filter((candidate) => candidate.matchMethod === "ai_classified" && candidate.aiAssessment)) {
    const assessment = row.aiAssessment!;
    const hasAction =
      assessment.merchantAction !== "none" ||
      assessment.avoidableLikelihood === "high" ||
      assessment.avoidableLikelihood === "medium";
    if (!hasAction) continue;
    findings.push(aiFinding({
      kind: "ai_fee_assessment",
      severity: assessment.avoidableLikelihood === "high" ? "high" : assessment.avoidableLikelihood === "medium" ? "warning" : "info",
      title: assessment.recommendation ? `${row.description}: ${assessment.recommendation}` : `${row.description}: AI fee assessment`,
      amount: row.amount,
      evidence: [
        `Paid to: ${assessment.paidToParty}.`,
        `Negotiability: ${assessment.negotiability}.`,
        `Avoidable likelihood: ${assessment.avoidableLikelihood}.`,
        `Merchant action: ${assessment.merchantAction}.`,
        `Pass-through proof posture: ${assessment.passThroughProofPosture}.`,
        assessment.fixedFeeAssessment
          ? `Fixed fee avoidable assessment: ${assessment.fixedFeeAssessment.avoidable} (${assessment.fixedFeeAssessment.confidence}). ${assessment.fixedFeeAssessment.recommendation ?? ""}`
          : "",
        ...assessment.evidence,
      ],
    }));
  }
  return findings;
}

export function applyFiservFeeAnalysisAiSuggestions(
  analysis: FiservFeeAnalysisV2,
  suggestions: FiservFeeAnalysisAiSuggestion[],
  options: {
    totalFees: number;
    totalVolume: number | null;
    applyMinConfidence?: "high" | "medium" | "low";
    provider?: FiservFeeAiProvider | null;
    modelName?: string | null;
    notes?: string[];
  },
): { analysis: FiservFeeAnalysisV2; ai: FiservFeeAnalysisAiRunMetadata } {
  const threshold = options.applyMinConfidence ?? "medium";
  const suggestionsByRow = new Map<number, FiservFeeAnalysisAiSuggestion>();
  for (const suggestion of suggestions) suggestionsByRow.set(suggestion.rowIndex, suggestion);

  let appliedSuggestionCount = 0;
  let skippedSuggestionCount = 0;
  const rows = analysis.rows.map((row) => {
    const suggestion = suggestionsByRow.get(row.rowIndex);
    if (!suggestion) return row;
    const usable =
      row.matchMethod === "ai_candidate" &&
      suggestion.feeType !== "unknown" &&
      suggestion.explanation.length > 0 &&
      suggestionMeetsThreshold(suggestion, threshold);
    if (!usable) {
      skippedSuggestionCount += 1;
      return row;
    }
    appliedSuggestionCount += 1;
    return applySuggestionToRow(row, suggestion);
  });

  const normalization = {
    ...analysis.normalization,
    aiCandidateCount: rows.filter((row) => row.matchMethod === "ai_candidate").length,
    aiClassifiedCount: rows.filter((row) => row.matchMethod === "ai_classified").length,
  };
  const processorMarkup = processorMarkupAnalysis(rows, analysis.processorMarkupAnalysis, options.totalVolume);
  const withoutFindings = {
    ...analysis,
    normalization,
    rows,
    buckets: bucketRows(rows, options.totalFees),
    rateVerification: rateVerification(rows),
    processorMarkupAnalysis: processorMarkup,
  };
  const notes = [
    ...(options.notes ?? []),
    appliedSuggestionCount > 0
      ? `Applied ${appliedSuggestionCount} V2 AI fee classification suggestion(s) at ${threshold}+ confidence.`
      : "No V2 AI fee classification suggestions met the apply threshold.",
  ];
  if (skippedSuggestionCount > 0) notes.push(`${skippedSuggestionCount} V2 AI fee classification suggestion(s) were left for review.`);

  return {
    analysis: finalizeFiservFeeAnalysisPresentation({
      ...withoutFindings,
      ai: {
        status: appliedSuggestionCount > 0 ? "applied" : "no_usable_suggestions",
        provider: options.provider ?? null,
        model: options.modelName ?? null,
        unresolvedInputRowCount: analysis.rows.filter((row) => row.matchMethod === "ai_candidate").length,
        suggestionCount: suggestions.length,
        appliedSuggestionCount,
        skippedSuggestionCount,
        notes,
      },
    }),
    ai: {
      status: appliedSuggestionCount > 0 ? "applied" : "no_usable_suggestions",
      provider: options.provider ?? null,
      model: options.modelName ?? null,
      unresolvedInputRowCount: analysis.rows.filter((row) => row.matchMethod === "ai_candidate").length,
      suggestionCount: suggestions.length,
      appliedSuggestionCount,
      skippedSuggestionCount,
      notes,
    },
  };
}

export async function maybeRunFiservFeeAnalysisAiClassification(
  analysis: FiservFeeAnalysisV2,
  context: FiservFeeAnalysisAiContext,
  options: FiservFeeAnalysisAiOptions = {},
): Promise<{ analysis: FiservFeeAnalysisV2; ai: FiservFeeAnalysisAiRunMetadata }> {
  const packet = buildFiservFeeAnalysisAiPacket(analysis, context);
  const disabledResult = (status: FiservFeeAnalysisAiRunStatus, note: string): { analysis: FiservFeeAnalysisV2; ai: FiservFeeAnalysisAiRunMetadata } => ({
    analysis: {
      ...analysis,
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
    },
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

  if (packet.unresolvedRows.length === 0) return disabledResult("not_needed", "No V2 Fiserv fee rows required AI classification.");
  if (!aiEnabled(options)) return disabledResult("disabled", "V2 AI fee classification is disabled.");
  const attempts = providerAttempts(options);
  if (attempts.length === 0) return disabledResult("disabled", missingKeyNote(options));

  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_FEE_CLASSIFICATION_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 12000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_FEE_CLASSIFICATION_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 2500);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_FEE_CLASSIFICATION_TIMEOUT_MS ?? 8000);
  let sdk: AiSdk;
  const failureNotes: string[] = [];
  try {
    sdk = options.sdk ?? loadAiSdk();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return disabledResult("failed", `V2 AI fee classification failed before provider execution: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`);
  }

  for (const attempt of attempts) {
    try {
      const suggestions = await generateSuggestionsWithProvider(sdk, attempt.provider, attempt.modelName, packet, {
        maxInputTokens,
        maxOutputTokens,
        timeoutMs,
        apiKey: providerApiKey(attempt.provider, options),
      });
      return applyFiservFeeAnalysisAiSuggestions(analysis, suggestions, {
        totalFees: context.totalFees ?? 0,
        totalVolume: context.totalVolume,
        applyMinConfidence: applyMinConfidence(options),
        provider: attempt.provider,
        modelName: attempt.modelName,
        notes: failureNotes.length > 0 ? [...failureNotes, `Used ${providerLabel(attempt.provider)} fallback.`] : [],
      });
    } catch (error) {
      failureNotes.push(failureMessage(attempt.provider, error));
    }
  }

  const note = ["V2 AI fee classification failed across all configured providers; deterministic V2 analysis preserved.", ...failureNotes].join(" ");
  return disabledResult("failed", note);
}

export async function maybeRunFiservFeeAnalysisAiClassificationForParserOutput<O extends ParserOutputWithFiservFeeAnalysisV2>(
  output: O,
  options: FiservFeeAnalysisAiOptions = {},
): Promise<{ output: O; ai: FiservFeeAnalysisAiRunMetadata }> {
  if (!output.fiservFeeAnalysisV2) {
    return {
      output,
      ai: {
        status: "not_needed",
        provider: null,
        model: null,
        unresolvedInputRowCount: 0,
        suggestionCount: 0,
        appliedSuggestionCount: 0,
        skippedSuggestionCount: 0,
        notes: ["No Fiserv V2 analysis output was available for AI classification."],
      },
    };
  }

  const context: FiservFeeAnalysisAiContext = {
    statementFamily: output.statementIdentity.statementFamily,
    visibleBrand: output.statementIdentity.visibleBrand,
    merchantName: output.statementIdentity.merchantName ?? null,
    merchantNumber: output.statementIdentity.merchantNumber ?? null,
    statementPeriodStart: output.statementIdentity.statementPeriodStart,
    statementPeriodEnd: output.statementIdentity.statementPeriodEnd,
    pricingModel: output.fiservFeeAnalysisV2.pricingModel.pricingModel,
    pricingModelAnalysisStatus: output.fiservFeeAnalysisV2.pricingModel.analysisStatus,
    totalVolume: output.selectedFinancials.totalVolume,
    totalFees: output.selectedFinancials.totalFees,
    effectiveRate: output.selectedFinancials.effectiveRate,
  };
  const result = await maybeRunFiservFeeAnalysisAiClassification(output.fiservFeeAnalysisV2, context, options);
  return {
    output: {
      ...output,
      fiservFeeAnalysisV2: result.analysis,
    },
    ai: result.ai,
  };
}
