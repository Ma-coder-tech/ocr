import { createRequire } from "node:module";
import type { MultiStatementGlobalReport } from "./reporting/buildMultiStatement.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};

type MultiStatementNarrativeProvider = "anthropic" | "openai";
type MultiStatementNarrativeProviderPreference = MultiStatementNarrativeProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type MultiStatementNarrativeStatus = "disabled" | "applied" | "failed";

export type MultiStatementNarrativeFact = {
  id: string;
  topic: string;
  text: string;
};

export type MultiStatementNarrativeParagraph = {
  text: string;
  factIds: string[];
};

export type MultiStatementNarrative = {
  status: MultiStatementNarrativeStatus;
  provider: MultiStatementNarrativeProvider | null;
  model: string | null;
  attempted: boolean;
  factCount: number;
  factsUsed: string[];
  paragraphs: string[];
  paragraphEvidence: MultiStatementNarrativeParagraph[];
  notes: string[];
};

export type MultiStatementNarrativeAiOptions = {
  enabled?: boolean;
  provider?: MultiStatementNarrativeProviderPreference;
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

function aiEnabled(options: MultiStatementNarrativeAiOptions): boolean {
  return options.enabled ?? envFlagOrDefault("AI_MULTI_STATEMENT_NARRATIVE_ENABLED", true);
}

function providerPreference(options: MultiStatementNarrativeAiOptions): MultiStatementNarrativeProviderPreference {
  const configured = options.provider ?? process.env.AI_MULTI_STATEMENT_NARRATIVE_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: MultiStatementNarrativeProvider, options: MultiStatementNarrativeAiOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: MultiStatementNarrativeProvider, options: MultiStatementNarrativeAiOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_MULTI_STATEMENT_NARRATIVE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.AI_MULTI_STATEMENT_NARRATIVE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function providerAttempts(options: MultiStatementNarrativeAiOptions): Array<{ provider: MultiStatementNarrativeProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: MultiStatementNarrativeProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({ provider, modelName: modelNameForProvider(provider, options) }));
}

function missingKeyNote(options: MultiStatementNarrativeAiOptions): string {
  const preference = providerPreference(options);
  if (preference === "anthropic") return "AI multi-statement narrative generation requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "AI multi-statement narrative generation requires OPENAI_API_KEY.";
  return "AI multi-statement narrative generation requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI multi-statement narrative generation timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function money(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return `${(value * 100).toFixed(2)}%`;
}

function difficultyLabel(value: string): string {
  if (value === "no_negotiation") return "no negotiation required";
  if (value === "negotiation_required") return "negotiation required";
  if (value === "investigation_required") return "investigation required";
  return value.replace(/_/g, " ");
}

function compactText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function addFact(facts: MultiStatementNarrativeFact[], topic: string, text: string): void {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return;
  const topicCount = facts.filter((fact) => fact.topic === topic).length + 1;
  facts.push({
    id: `${topic}_${String(topicCount).padStart(2, "0")}`,
    topic,
    text: normalized.slice(0, 800),
  });
}

export function buildMultiStatementNarrativeFactPacket(report: MultiStatementGlobalReport): {
  facts: MultiStatementNarrativeFact[];
  context: Record<string, unknown>;
} {
  const facts: MultiStatementNarrativeFact[] = [];

  addFact(
    facts,
    "summary",
    `${report.executiveSummary.merchantName || "The merchant"} provided ${report.executiveSummary.statementCount} statements covering ${report.executiveSummary.dateRange}; total volume was ${report.executiveSummary.totalVolume.value}, total fees were ${report.executiveSummary.totalFees.value}, and average effective rate was ${report.executiveSummary.averageEffectiveRate.value}.`,
  );
  addFact(
    facts,
    "savings",
    `Projected annual savings if unchanged are conservative ${money(report.cumulativeSavings.projectedAnnualIfUnchanged.conservative)}, estimated ${money(report.cumulativeSavings.projectedAnnualIfUnchanged.estimated)}, and maximum ${money(report.cumulativeSavings.projectedAnnualIfUnchanged.maximum)}. Already overpaid totals are conservative ${money(report.cumulativeSavings.alreadyOverpaid.conservative)}, estimated ${money(report.cumulativeSavings.alreadyOverpaid.estimated)}, and maximum ${money(report.cumulativeSavings.alreadyOverpaid.maximum)}.`,
  );
  addFact(
    facts,
    "rate_trend",
    `Effective rate trend is ${report.effectiveRateTrend.direction}; lowest month was ${report.effectiveRateTrend.lowest.period} at ${report.effectiveRateTrend.lowest.displayRate}, highest month was ${report.effectiveRateTrend.highest.period} at ${report.effectiveRateTrend.highest.displayRate}. Explanation: ${report.effectiveRateTrend.explanation ?? "No explanation available."}`,
  );
  if (report.executiveSummary.benchmark.status !== "not_available") {
    addFact(facts, "benchmark", report.executiveSummary.benchmark.message);
  }
  if (report.executiveSummary.missingPeriods.length > 0) {
    addFact(facts, "gap", `Missing statement periods: ${report.executiveSummary.missingPeriods.join(", ")}.`);
  }
  if (report.disputeTrend.totalDisputeCostsAllPeriods > 0 || report.disputeTrend.direction !== "none") {
    const activePeriods = report.disputeTrend.periods
      .filter((period) => period.totalDisputeCost > 0 || period.chargebacks > 0 || period.achRejects > 0)
      .map((period) => `${period.period}: ${period.chargebacks} chargebacks, ${period.achRejects} ACH rejects, ${period.displayTotalDisputeCost} dispute cost`)
      .join("; ");
    addFact(
      facts,
      "dispute",
      `Dispute trend is ${report.disputeTrend.direction}; total dispute costs across analyzed statements are ${money(report.disputeTrend.totalDisputeCostsAllPeriods)}. ${report.disputeTrend.finding ?? ""} Active periods: ${activePeriods || "none"}.`,
    );
  }

  for (const item of report.feeChangeTimeline.slice(0, 16)) {
    const notice = item.noticeFound === null ? "notice tracking was not applicable" : item.noticeFound ? `notice was found in ${item.noticePeriod}` : "no prior notice was found";
    addFact(
      facts,
      "fee_change",
      `${item.period}: ${item.whatChanged} Explanation: ${item.explanation} Cumulative impact is ${money(item.cumulativeImpact)} and projected annual impact is ${money(item.projectedAnnualImpact)}; ${notice}.`,
    );
  }

  for (const finding of report.topFindings.slice(0, 10)) {
    addFact(
      facts,
      "finding",
      `${finding.title}: ${finding.description} Explanation: ${finding.explanation} Cumulative impact is ${money(finding.cumulativeImpact)}; projected annual impact is ${money(finding.projectedAnnualImpact)}; difficulty is ${finding.difficulty}; action is ${finding.action}.`,
    );
  }

  for (const fee of report.recurringAvoidableFees.slice(0, 10)) {
    addFact(
      facts,
      "recurring_fee",
      `${fee.feeName}: recurring avoidable fee at ${money(fee.monthlyAmount)} per month, present on ${fee.monthsPresent} statement(s), cumulative total ${money(fee.cumulativeTotal)}, projected annual cost ${money(fee.projectedAnnual)}. Explanation: ${fee.explanation} Action: ${fee.action}. Difficulty is ${difficultyLabel(fee.difficulty)}.`,
    );
  }

  for (const action of report.actionItems.slice(0, 8)) {
    const includes =
      Array.isArray(action.includes) && action.includes.length > 0
        ? ` Includes: ${action.includes.map((item) => `${item.title} at ${money(item.expectedAnnualSavings)} per year`).join("; ")}.`
        : "";
    addFact(
      facts,
      "action",
      `Priority ${action.priority}: ${action.action} Expected annual savings are ${money(action.expectedAnnualSavings)}.${includes} Difficulty is ${difficultyLabel(action.difficulty)}. Explanation: ${action.explanation}`,
    );
  }
  addFact(facts, "action_summary", report.actionSummary.message);

  return {
    facts: facts.slice(0, 80),
    context: {
      merchantName: report.executiveSummary.merchantName,
      statementCount: report.executiveSummary.statementCount,
      dateRange: report.executiveSummary.dateRange,
      missingPeriods: report.executiveSummary.missingPeriods,
      headlineAnnualSavings: report.cumulativeSavings.projectedAnnualIfUnchanged.estimated,
      alreadyOverpaidEstimated: report.cumulativeSavings.alreadyOverpaid.estimated,
      effectiveRateTrend: report.effectiveRateTrend.direction,
      benchmarkStatus: report.executiveSummary.benchmark.status,
    },
  };
}

function narrativeResponseSchema(): unknown {
  const { z } = loadZod();
  const paragraphSchema = z
    .object({
      text: z.string(),
      factIds: z.array(z.string()),
    })
    .strict();
  return z
    .object({
      paragraphs: z.array(paragraphSchema).min(4).max(6),
      notes: z.array(z.string()),
    })
    .strict();
}

function narrativePrompt(packet: { facts: MultiStatementNarrativeFact[]; context: Record<string, unknown> }): string {
  return [
    `You are a merchant services advisor writing a summary for a business owner who has provided ${packet.context.statementCount} months of processing statements covering ${packet.context.dateRange}. Synthesize the findings across all months into a single coherent narrative.`,
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Use ONLY the provided facts. Do not invent, recompute, or round dollar amounts, rates, savings, periods, notice status, or recommendations.",
    "Return 4-6 merchant-facing paragraphs as objects in paragraphs[]. Each paragraph must include factIds from the provided facts.",
    "Rules:",
    "- Lead with the biggest cumulative cost issue and its total dollar impact across all analyzed months.",
    "- Highlight any fees that appeared without prior notice, with the month they first appeared and cumulative amount charged.",
    "- Highlight any rate increases, distinguishing between those that were announced in a prior notice and those that appeared with no notice.",
    "- Note the effective rate trend and explain what drove it: volume changes, fee changes, or both.",
    "- If a gap month exists, mention it briefly.",
    "- If chargeback or dispute activity increased, note it with the trend when provided in the facts.",
    "- End with prioritized action items, each with its expected annual savings and difficulty level: no negotiation required, negotiation required, or investigation required.",
    "- Use the action facts in their provided priority order. Do not reorder action items by dollar amount.",
    "- Every recommendation must include a cumulative or annual dollar amount.",
    "- If the merchant's effective rate is within the competitive benchmark range, say so before listing optimization opportunities. If benchmark status is not provided, do not claim a benchmark result.",
    "- Be direct but professional. This document may be shown to the merchant's processor, so it must be factual and defensible.",
    "- Do not say the processor is stealing or committing fraud. Present evidence and let the merchant decide.",
    "- Never use first person (I, me, my). Write in impersonal form: 'The data shows...' or 'Based on the analysis...' or 'The reviewed statements indicate...'.",
    "- Write as if you are speaking directly to the business owner in their office.",
    "- Do not repeat fee labels without explaining what they mean in plain language.",
    "- Explain fees in plain language. Tell the merchant what each fee actually is, not just its label.",
    "- Interpret the timeline instead of listing events chronologically. Connect cause and effect, including prior notices and later execution when provided in the facts.",
    "- The structured report is the source of truth for fee explanations. Do not invent what a fee means; use the explanation facts already provided.",
    "Fact packet:",
    JSON.stringify(packet),
  ].join("\n\n");
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

function providerLabel(provider: MultiStatementNarrativeProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function failureMessage(provider: MultiStatementNarrativeProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${providerLabel(provider)} AI multi-statement narrative generation failed: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`;
}

async function generateNarrativeWithProvider(
  sdk: AiSdk,
  provider: MultiStatementNarrativeProvider,
  modelName: string,
  packet: { facts: MultiStatementNarrativeFact[]; context: Record<string, unknown> },
  options: {
    maxInputTokens: number;
    maxOutputTokens: number;
    timeoutMs: number;
    apiKey?: string;
  },
): Promise<unknown> {
  const factory =
    provider === "anthropic"
      ? options.apiKey && sdk.createAnthropic
        ? sdk.createAnthropic({ apiKey: options.apiKey })
        : sdk.anthropic
      : options.apiKey && sdk.createOpenAI
        ? sdk.createOpenAI({ apiKey: options.apiKey })
        : sdk.openai;
  if (!factory) throw new Error(`${providerLabel(provider)} AI SDK provider is not available.`);

  const schema = narrativeResponseSchema();
  const prompt = narrativePrompt(packet);
  if (provider === "openai") {
    if (!sdk.generateText || !sdk.Output) throw new Error("OpenAI structured output requires AI SDK generateText and Output.object.");
    const result = await withTimeout(
      sdk.generateText({
        model: factory(modelName),
        output: sdk.Output.object({
          schema,
          name: "multi_statement_merchant_narrative",
          description: "Merchant-facing narrative grounded in multi-statement comparison facts.",
        }),
        prompt,
        maxOutputTokens: Math.max(options.maxOutputTokens, 5000),
        ...openAiProviderOptions(),
      }),
      options.timeoutMs,
    );
    return result.output;
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
  return result.object;
}

function factIdSet(facts: MultiStatementNarrativeFact[]): Set<string> {
  return new Set(facts.map((fact) => fact.id));
}

function validFactIds(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((entry) => compactText(entry, 80)).filter((entry): entry is string => Boolean(entry));
  return [...new Set(normalized.filter((entry) => allowed.has(entry)))].slice(0, 8);
}

function normalizeParagraph(value: unknown, allowed: Set<string>): MultiStatementNarrativeParagraph | null {
  const candidate = value && typeof value === "object" ? (value as { text?: unknown; factIds?: unknown }) : {};
  const text = sanitizeFirstPerson(compactText(candidate.text, 1400));
  const ids = validFactIds(candidate.factIds, allowed);
  if (!text || ids.length === 0) return null;
  return { text, factIds: ids };
}

function sanitizeFirstPerson(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(/\bI do not see\b/gi, "The reviewed statements do not show")
    .replace(/\bI don't see\b/gi, "The reviewed statements do not show")
    .replace(/\bI am not claiming\b/gi, "The analysis does not claim")
    .replace(/\bI'm not claiming\b/gi, "The analysis does not claim")
    .replace(/\bI recommend\b/gi, "The recommended action is to")
    .replace(/\bmy recommendation is\b/gi, "The recommended action is")
    .replace(/\bI would\b/gi, "The recommended next step is to")
    .replace(/\bI\b\s+/g, "The analysis ")
    .replace(/\bme\b/gi, "the analysis")
    .replace(/\bmy\b/gi, "the")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNarrativeAiObject(
  value: unknown,
  facts: MultiStatementNarrativeFact[],
): Pick<MultiStatementNarrative, "paragraphs" | "paragraphEvidence" | "factsUsed" | "notes"> {
  if (!value || typeof value !== "object") throw new Error("AI multi-statement narrative response was not an object.");
  const object = value as { paragraphs?: unknown; notes?: unknown };
  const allowed = factIdSet(facts);
  const paragraphEvidence = Array.isArray(object.paragraphs)
    ? object.paragraphs.map((entry) => normalizeParagraph(entry, allowed)).filter((entry): entry is MultiStatementNarrativeParagraph => entry !== null).slice(0, 6)
    : [];
  if (paragraphEvidence.length < 4) throw new Error("AI multi-statement narrative response did not include at least four grounded paragraphs.");
  const notes = Array.isArray(object.notes)
    ? object.notes.map((entry) => compactText(entry, 260)).filter((entry): entry is string => Boolean(entry)).slice(0, 8)
    : [];
  return {
    paragraphs: paragraphEvidence.map((paragraph) => paragraph.text),
    paragraphEvidence,
    factsUsed: [...new Set(paragraphEvidence.flatMap((paragraph) => paragraph.factIds))].sort(),
    notes,
  };
}

function narrativeResult(params: {
  status: MultiStatementNarrativeStatus;
  provider: MultiStatementNarrativeProvider | null;
  model: string | null;
  attempted: boolean;
  factCount: number;
  parsed?: Pick<MultiStatementNarrative, "paragraphs" | "paragraphEvidence" | "factsUsed" | "notes">;
  notes: string[];
}): MultiStatementNarrative {
  return {
    status: params.status,
    provider: params.provider,
    model: params.model,
    attempted: params.attempted,
    factCount: params.factCount,
    factsUsed: params.parsed?.factsUsed ?? [],
    paragraphs: params.parsed?.paragraphs ?? [],
    paragraphEvidence: params.parsed?.paragraphEvidence ?? [],
    notes: [...params.notes, ...(params.parsed?.notes ?? [])],
  };
}

export async function maybeRunMultiStatementNarrativeAiForGlobalReport<R extends MultiStatementGlobalReport>(
  report: R,
  options: MultiStatementNarrativeAiOptions = {},
): Promise<{ report: R; aiMultiStatementNarrative: MultiStatementNarrative }> {
  const packet = buildMultiStatementNarrativeFactPacket(report);
  if (!aiEnabled(options)) {
    const result = narrativeResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      factCount: packet.facts.length,
      notes: ["AI multi-statement narrative generation was explicitly disabled."],
    });
    return { report: { ...report, masterNarrative: result.paragraphs }, aiMultiStatementNarrative: result };
  }

  const attempts = providerAttempts(options);
  if (attempts.length === 0) {
    const result = narrativeResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      factCount: packet.facts.length,
      notes: [missingKeyNote(options)],
    });
    return { report: { ...report, masterNarrative: result.paragraphs }, aiMultiStatementNarrative: result };
  }

  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_MULTI_STATEMENT_NARRATIVE_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 16000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_MULTI_STATEMENT_NARRATIVE_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 3500);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_MULTI_STATEMENT_NARRATIVE_TIMEOUT_MS ?? 10000);
  let sdk: AiSdk;
  const failureNotes: string[] = [];
  try {
    sdk = options.sdk ?? loadAiSdk();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const result = narrativeResult({
      status: "failed",
      provider: null,
      model: null,
      attempted: true,
      factCount: packet.facts.length,
      notes: [`AI multi-statement narrative generation failed before provider execution: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`],
    });
    return { report: { ...report, masterNarrative: result.paragraphs }, aiMultiStatementNarrative: result };
  }

  for (const attempt of attempts) {
    try {
      const generated = await generateNarrativeWithProvider(sdk, attempt.provider, attempt.modelName, packet, {
        maxInputTokens,
        maxOutputTokens,
        timeoutMs,
        apiKey: providerApiKey(attempt.provider, options),
      });
      const parsed = parseNarrativeAiObject(generated, packet.facts);
      const result = narrativeResult({
        status: "applied",
        provider: attempt.provider,
        model: attempt.modelName,
        attempted: true,
        factCount: packet.facts.length,
        parsed,
        notes: failureNotes,
      });
      return { report: { ...report, masterNarrative: result.paragraphs }, aiMultiStatementNarrative: result };
    } catch (error) {
      failureNotes.push(failureMessage(attempt.provider, error));
    }
  }

  const result = narrativeResult({
    status: "failed",
    provider: null,
    model: attempts.at(-1)?.modelName ?? null,
    attempted: true,
    factCount: packet.facts.length,
    notes: ["AI multi-statement narrative generation failed across all configured providers; structured global report preserved.", ...failureNotes],
  });
  return { report: { ...report, masterNarrative: result.paragraphs }, aiMultiStatementNarrative: result };
}
