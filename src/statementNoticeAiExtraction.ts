import { createRequire } from "node:module";
import type { FiservFeeAnalysisV2 } from "./fiservFeeAnalysis.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type StatementNoticeAiProvider = "anthropic" | "openai";
type StatementNoticeAiProviderPreference = StatementNoticeAiProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type StatementNoticeAiAmount = {
  value: number | null;
  valueType: "money" | "percentage" | "basis_points" | "unknown";
  cadence: "monthly" | "annual" | "per_item" | "one_time" | "unknown";
  raw: string | null;
};

export type StatementNoticeAiNotice = {
  feeName: string | null;
  amount: StatementNoticeAiAmount | null;
  effectiveDate: string | null;
  condition: string | null;
  acceptanceClause: string | null;
  actionDeadline: string | null;
  isFeeChange: boolean;
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

export type StatementNoticeAiExtractionStatus = "disabled" | "not_needed" | "applied" | "no_fee_changes" | "failed";

export type StatementNoticeAiExtraction = {
  status: StatementNoticeAiExtractionStatus;
  provider: StatementNoticeAiProvider | null;
  model: string | null;
  noticeCount: number;
  feeChangeCount: number;
  notices: StatementNoticeAiNotice[];
  notes: string[];
};

export type StatementNoticeAiOptions = {
  enabled?: boolean;
  provider?: StatementNoticeAiProviderPreference;
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

type ParserOutputWithNoticeAnalysis = {
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

function aiEnabled(options: StatementNoticeAiOptions): boolean {
  return options.enabled ?? envFlagOrDefault("AI_NOTICE_EXTRACTION_ENABLED", true);
}

function providerPreference(options: StatementNoticeAiOptions): StatementNoticeAiProviderPreference {
  const configured = options.provider ?? process.env.AI_NOTICE_EXTRACTION_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: StatementNoticeAiProvider, options: StatementNoticeAiOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: StatementNoticeAiProvider, options: StatementNoticeAiOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_NOTICE_EXTRACTION_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.AI_NOTICE_EXTRACTION_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function providerAttempts(options: StatementNoticeAiOptions): Array<{ provider: StatementNoticeAiProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: StatementNoticeAiProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({
      provider,
      modelName: modelNameForProvider(provider, options),
    }));
}

function missingKeyNote(options: StatementNoticeAiOptions): string {
  const preference = providerPreference(options);
  if (preference === "anthropic") return "AI notice extraction requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "AI notice extraction requires OPENAI_API_KEY.";
  return "AI notice extraction requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI notice extraction timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function noticeAiResponseSchema(): unknown {
  const { z } = loadZod();
  const amountSchema = z
    .object({
      value: z.number().finite().nullable(),
      valueType: z.enum(["money", "percentage", "basis_points", "unknown"]),
      cadence: z.enum(["monthly", "annual", "per_item", "one_time", "unknown"]),
      raw: z.string().nullable(),
    })
    .strict();
  const noticeSchema = z
    .object({
      feeName: z.string().nullable(),
      amount: amountSchema.nullable(),
      effectiveDate: z.string().nullable(),
      condition: z.string().nullable(),
      acceptanceClause: z.string().nullable(),
      actionDeadline: z.string().nullable(),
      isFeeChange: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
      evidence: z.array(z.string()),
    })
    .strict();
  return z.object({
    notices: z.array(noticeSchema),
    notes: z.array(z.string()),
  });
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

function providerLabel(provider: StatementNoticeAiProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function failureMessage(provider: StatementNoticeAiProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${providerLabel(provider)} AI notice extraction failed: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`;
}

function noticeAiPrompt(noticeText: string): string {
  return [
    "You extract structured merchant statement notices for a payment-processing fee analysis product.",
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Input is the raw notice block printed on a merchant processing statement.",
    "Extract fee changes, rate changes, new fees, effective dates, conditions, deemed-acceptance clauses, and action deadlines.",
    "Also identify non-fee informational notices when they are clearly statement notices, with isFeeChange false.",
    "Do not turn marketing, UI migration, compliance reminders, or generic network announcements into fee changes unless the notice states a concrete fee/rate/charge change.",
    "If no fee changes are announced, include a note exactly saying: No fee changes announced in this statement period.",
    "Use null when a field is absent. Evidence must be short excerpts copied from the input notice block.",
    "Raw notice block:",
    noticeText,
  ].join("\n\n");
}

function parseNoticeAiObject(value: unknown): { notices: StatementNoticeAiNotice[]; notes: string[] } {
  if (!value || typeof value !== "object" || !Array.isArray((value as { notices?: unknown }).notices)) {
    throw new Error("AI notice extraction response did not contain notices.");
  }
  const rawNotes = Array.isArray((value as { notes?: unknown }).notes) ? ((value as { notes: unknown[] }).notes ?? []) : [];
  const notices = (value as { notices: unknown[] }).notices.map((candidate) => {
    const notice = candidate as Partial<StatementNoticeAiNotice>;
    const amount = notice.amount && typeof notice.amount === "object" ? (notice.amount as Partial<StatementNoticeAiAmount>) : null;
    return {
      feeName: typeof notice.feeName === "string" && notice.feeName.trim() ? notice.feeName.trim().slice(0, 160) : null,
      amount: amount
        ? {
            value: typeof amount.value === "number" && Number.isFinite(amount.value) ? amount.value : null,
            valueType:
              amount.valueType === "money" || amount.valueType === "percentage" || amount.valueType === "basis_points" || amount.valueType === "unknown"
                ? amount.valueType
                : "unknown",
            cadence:
              amount.cadence === "monthly" || amount.cadence === "annual" || amount.cadence === "per_item" || amount.cadence === "one_time" || amount.cadence === "unknown"
                ? amount.cadence
                : "unknown",
            raw: typeof amount.raw === "string" && amount.raw.trim() ? amount.raw.trim().slice(0, 80) : null,
          }
        : null,
      effectiveDate: typeof notice.effectiveDate === "string" && notice.effectiveDate.trim() ? notice.effectiveDate.trim().slice(0, 120) : null,
      condition: typeof notice.condition === "string" && notice.condition.trim() ? notice.condition.trim().slice(0, 240) : null,
      acceptanceClause: typeof notice.acceptanceClause === "string" && notice.acceptanceClause.trim() ? notice.acceptanceClause.trim().slice(0, 300) : null,
      actionDeadline: typeof notice.actionDeadline === "string" && notice.actionDeadline.trim() ? notice.actionDeadline.trim().slice(0, 120) : null,
      isFeeChange: notice.isFeeChange === true,
      confidence: notice.confidence === "high" || notice.confidence === "medium" || notice.confidence === "low" ? notice.confidence : "low",
      evidence: Array.isArray(notice.evidence)
        ? notice.evidence.map((line) => String(line).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8)
        : [],
    };
  });
  return {
    notices,
    notes: rawNotes.map((note) => String(note).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8),
  };
}

async function generateNoticeExtractionWithProvider(
  sdk: AiSdk,
  provider: StatementNoticeAiProvider,
  modelName: string,
  noticeText: string,
  options: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    apiKey?: string;
  },
): Promise<{ notices: StatementNoticeAiNotice[]; notes: string[] }> {
  const factory =
    provider === "anthropic"
      ? options.apiKey && sdk.createAnthropic
        ? sdk.createAnthropic({ apiKey: options.apiKey })
        : sdk.anthropic
      : options.apiKey && sdk.createOpenAI
        ? sdk.createOpenAI({ apiKey: options.apiKey })
        : sdk.openai;
  if (!factory) throw new Error(`${providerLabel(provider)} AI SDK provider is not available.`);

  const schema = noticeAiResponseSchema();
  if (provider === "openai") {
    if (!sdk.generateText || !sdk.Output) throw new Error("OpenAI structured output requires AI SDK generateText and Output.object.");
    const result = await withTimeout(
      sdk.generateText({
        model: factory(modelName),
        output: sdk.Output.object({
          schema,
          name: "statement_notice_extraction",
          description: "Structured merchant statement notices and fee-change notices.",
        }),
        prompt: noticeAiPrompt(noticeText),
        maxOutputTokens: Math.max(options.maxOutputTokens, 3000),
        ...openAiProviderOptions(),
      }),
      options.timeoutMs,
    );
    return parseNoticeAiObject(result.output);
  }

  const result = await withTimeout(
    sdk.generateObject({
      model: factory(modelName),
      schema,
      prompt: noticeAiPrompt(noticeText),
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
  return parseNoticeAiObject(result.object);
}

function extractionResult(params: {
  status: StatementNoticeAiExtractionStatus;
  provider: StatementNoticeAiProvider | null;
  model: string | null;
  notices?: StatementNoticeAiNotice[];
  notes: string[];
}): StatementNoticeAiExtraction {
  const notices = params.notices ?? [];
  return {
    status: params.status,
    provider: params.provider,
    model: params.model,
    noticeCount: notices.length,
    feeChangeCount: notices.filter((notice) => notice.isFeeChange).length,
    notices,
    notes: params.notes,
  };
}

export async function maybeRunStatementNoticeAiExtraction(
  analysis: FiservFeeAnalysisV2,
  options: StatementNoticeAiOptions = {},
): Promise<{ analysis: FiservFeeAnalysisV2; aiNoticeExtraction: StatementNoticeAiExtraction }> {
  const noticeText = String(analysis.noticeText ?? "").trim();
  const disabledResult = (aiNoticeExtraction: StatementNoticeAiExtraction) => ({
    analysis: {
      ...analysis,
      aiNoticeExtraction,
    },
    aiNoticeExtraction,
  });

  if (!noticeText) {
    return disabledResult(extractionResult({
      status: "not_needed",
      provider: null,
      model: null,
      notes: ["No statement notice block was available for AI extraction."],
    }));
  }
  if (!aiEnabled(options)) {
    return disabledResult(extractionResult({
      status: "disabled",
      provider: null,
      model: null,
      notes: ["AI notice extraction was explicitly disabled."],
    }));
  }
  const attempts = providerAttempts(options);
  if (attempts.length === 0) {
    return disabledResult(extractionResult({
      status: "disabled",
      provider: null,
      model: null,
      notes: [missingKeyNote(options)],
    }));
  }

  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_NOTICE_EXTRACTION_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 12000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_NOTICE_EXTRACTION_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 2000);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_NOTICE_EXTRACTION_TIMEOUT_MS ?? 8000);
  let sdk: AiSdk;
  const failureNotes: string[] = [];
  try {
    sdk = options.sdk ?? loadAiSdk();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const aiNoticeExtraction = extractionResult({
      status: "failed",
      provider: null,
      model: null,
      notes: [`AI notice extraction failed before provider execution: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`],
    });
    return disabledResult(aiNoticeExtraction);
  }

  for (const attempt of attempts) {
    try {
      const generated = await generateNoticeExtractionWithProvider(sdk, attempt.provider, attempt.modelName, noticeText, {
        maxInputTokens,
        maxOutputTokens,
        timeoutMs,
        apiKey: providerApiKey(attempt.provider, options),
      });
      const feeChangeCount = generated.notices.filter((notice) => notice.isFeeChange).length;
      const notes = [...failureNotes, ...generated.notes];
      if (feeChangeCount === 0 && !notes.some((note) => note === "No fee changes announced in this statement period.")) {
        notes.push("No fee changes announced in this statement period.");
      }
      const aiNoticeExtraction = extractionResult({
        status: feeChangeCount > 0 ? "applied" : "no_fee_changes",
        provider: attempt.provider,
        model: attempt.modelName,
        notices: generated.notices,
        notes,
      });
      return disabledResult(aiNoticeExtraction);
    } catch (error) {
      failureNotes.push(failureMessage(attempt.provider, error));
    }
  }

  const aiNoticeExtraction = extractionResult({
    status: "failed",
    provider: null,
    model: attempts.at(-1)?.modelName ?? null,
    notes: ["AI notice extraction failed across all configured providers; deterministic analysis preserved.", ...failureNotes],
  });
  return disabledResult(aiNoticeExtraction);
}

export async function maybeRunStatementNoticeAiExtractionForParserOutput<O extends ParserOutputWithNoticeAnalysis>(
  output: O,
  options: StatementNoticeAiOptions = {},
): Promise<{ output: O; aiNoticeExtraction: StatementNoticeAiExtraction }> {
  if (!output.fiservFeeAnalysisV2) {
    return {
      output,
      aiNoticeExtraction: extractionResult({
        status: "not_needed",
        provider: null,
        model: null,
        notes: ["No structured analysis output was available for AI notice extraction."],
      }),
    };
  }

  const result = await maybeRunStatementNoticeAiExtraction(output.fiservFeeAnalysisV2, options);
  return {
    output: {
      ...output,
      fiservFeeAnalysisV2: result.analysis,
    },
    aiNoticeExtraction: result.aiNoticeExtraction,
  };
}
