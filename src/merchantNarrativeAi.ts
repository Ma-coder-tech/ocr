import { createRequire } from "node:module";
import type { FiservFeeAnalysisFinding, FiservFeeAnalysisRow, FiservFeeAnalysisV2 } from "./fiservFeeAnalysis.js";

const require = createRequire(import.meta.url);

type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown }>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown }>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFactoryCreator = (options: { apiKey?: string }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type MerchantNarrativeProvider = "anthropic" | "openai";
type MerchantNarrativeProviderPreference = MerchantNarrativeProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  anthropic?: AiModelFactory;
  openai?: AiModelFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type MerchantNarrativeStatus = "disabled" | "not_needed" | "applied" | "failed";
export type MerchantNarrativeSectionKey =
  | "executiveSummary"
  | "pricingModel"
  | "passThroughVerification"
  | "processorControlledFees"
  | "benchmarkConclusion"
  | "noticesAndRepricing"
  | "negotiationOpportunities"
  | "caveats";

export type MerchantNarrativeFact = {
  id: string;
  topic: string;
  text: string;
};

export type MerchantNarrativeBullet = {
  text: string;
  factIds: string[];
};

export type MerchantNarrativeSection = {
  title: string;
  summary: string;
  factIds: string[];
  bullets: MerchantNarrativeBullet[];
};

export type MerchantNarrativeActionItem = {
  priority: "high" | "medium" | "low";
  text: string;
  factIds: string[];
};

export type MerchantNarrativeSections = Record<MerchantNarrativeSectionKey, MerchantNarrativeSection>;

export type MerchantNarrative = {
  status: MerchantNarrativeStatus;
  provider: MerchantNarrativeProvider | null;
  model: string | null;
  attempted: boolean;
  factCount: number;
  factsUsed: string[];
  sections: MerchantNarrativeSections;
  actionItems: MerchantNarrativeActionItem[];
  notes: string[];
};

export type MerchantNarrativeAiOptions = {
  enabled?: boolean;
  provider?: MerchantNarrativeProviderPreference;
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

type ParserOutputWithMerchantNarrative = {
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
  fiservFeeAnalysisV2?: FiservFeeAnalysisV2;
};

const SECTION_KEYS = [
  "executiveSummary",
  "pricingModel",
  "passThroughVerification",
  "processorControlledFees",
  "benchmarkConclusion",
  "noticesAndRepricing",
  "negotiationOpportunities",
  "caveats",
] as const satisfies readonly MerchantNarrativeSectionKey[];

const SECTION_TITLES: Record<MerchantNarrativeSectionKey, string> = {
  executiveSummary: "Executive Summary",
  pricingModel: "Pricing Model",
  passThroughVerification: "Pass-Through Verification",
  processorControlledFees: "Processor-Controlled Fees",
  benchmarkConclusion: "Benchmark Conclusion",
  noticesAndRepricing: "Notices And Repricing",
  negotiationOpportunities: "Negotiation Opportunities",
  caveats: "Caveats",
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

function aiEnabled(options: MerchantNarrativeAiOptions): boolean {
  return options.enabled ?? envFlagOrDefault("AI_MERCHANT_NARRATIVE_ENABLED", true);
}

function providerPreference(options: MerchantNarrativeAiOptions): MerchantNarrativeProviderPreference {
  const configured = options.provider ?? process.env.AI_MERCHANT_NARRATIVE_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: MerchantNarrativeProvider, options: MerchantNarrativeAiOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: MerchantNarrativeProvider, options: MerchantNarrativeAiOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.AI_MERCHANT_NARRATIVE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.AI_MERCHANT_NARRATIVE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function providerAttempts(options: MerchantNarrativeAiOptions): Array<{ provider: MerchantNarrativeProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: MerchantNarrativeProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({ provider, modelName: modelNameForProvider(provider, options) }));
}

function missingKeyNote(options: MerchantNarrativeAiOptions): string {
  const preference = providerPreference(options);
  if (preference === "anthropic") return "AI merchant narrative generation requires ANTHROPIC_API_KEY.";
  if (preference === "openai") return "AI merchant narrative generation requires OPENAI_API_KEY.";
  return "AI merchant narrative generation requires ANTHROPIC_API_KEY or OPENAI_API_KEY.";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`AI merchant narrative generation timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
  return `${(value * 100).toFixed(2)}%`;
}

function compactText(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function factId(prefix: string, index: number): string {
  return `${prefix}_${String(index).padStart(2, "0")}`;
}

function addFact(facts: MerchantNarrativeFact[], topic: string, text: string, prefix: string): void {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return;
  facts.push({
    id: factId(prefix, facts.filter((fact) => fact.id.startsWith(`${prefix}_`)).length + 1),
    topic,
    text: normalized.slice(0, 700),
  });
}

function findingActionText(action: FiservFeeAnalysisFinding["action"]): string {
  return action.replace(/_/g, " ");
}

function topFindings(findings: FiservFeeAnalysisFinding[]): FiservFeeAnalysisFinding[] {
  const severityRank = { high: 3, warning: 2, info: 1 } as const;
  return [...findings]
    .sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || (right.amount ?? 0) - (left.amount ?? 0))
    .slice(0, 14);
}

function actionableAssessmentRows(rows: FiservFeeAnalysisRow[]): FiservFeeAnalysisRow[] {
  return rows
    .filter((row) => row.aiAssessment && (row.aiAssessment.merchantAction !== "none" || row.aiAssessment.recommendation))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 10);
}

export function buildMerchantNarrativeFactPacket(output: ParserOutputWithMerchantNarrative): {
  facts: MerchantNarrativeFact[];
  context: Record<string, unknown>;
} {
  const analysis = output.fiservFeeAnalysisV2;
  const facts: MerchantNarrativeFact[] = [];
  const effectiveRate = output.selectedFinancials.effectiveRate;

  addFact(
    facts,
    "statement",
    `Merchant ${output.statementIdentity.merchantName ?? "unknown merchant"} processed ${money(output.selectedFinancials.totalVolume)} in volume with ${money(output.selectedFinancials.totalFees)} in total fees for an effective rate of ${pct(effectiveRate)}.`,
    "statement",
  );
  addFact(
    facts,
    "statement",
    `Statement period is ${output.statementIdentity.statementPeriodStart} to ${output.statementIdentity.statementPeriodEnd}; visible brand is ${output.statementIdentity.visibleBrand || output.statementIdentity.processorFamily}.`,
    "statement",
  );

  if (!analysis) return { facts, context: { hasFiservFeeAnalysisV2: false } };

  addFact(
    facts,
    "pricing_model",
    `Pricing model detected as ${analysis.pricingModel.pricingModel} with ${analysis.pricingModel.confidence} confidence; analysis status is ${analysis.pricingModel.analysisStatus}.`,
    "pricing",
  );
  for (const evidence of analysis.pricingModel.evidence.slice(0, 4)) {
    addFact(facts, "pricing_model", `Pricing model evidence: ${evidence}`, "pricing");
  }

  addFact(
    facts,
    "rate_verification",
    `Rate verification counts: ${analysis.rateVerification.proven} proven, ${analysis.rateVerification.likely} likely, ${analysis.rateVerification.processorControlled} processor-controlled, ${analysis.rateVerification.indeterminate} indeterminate, and ${analysis.rateVerification.notEnoughDetail} not enough detail.`,
    "proof",
  );
  addFact(
    facts,
    "processor_cost",
    `Processor-controlled total is ${money(analysis.processorMarkupAnalysis.processorControlledTotal)}; processor markup rate is ${pct(analysis.processorMarkupAnalysis.processorMarkupRate)}. ${analysis.processorMarkupAnalysis.message}`,
    "processor",
  );
  addFact(
    facts,
    "processor_cost",
    `Processor breakdown: percentage markup ${money(analysis.processorMarkupAnalysis.processorPctMarkupTotal)}, per-item fees ${money(analysis.processorMarkupAnalysis.processorPerItemTotal)}, fixed fees ${money(analysis.processorMarkupAnalysis.processorFixedTotal)}, junk fee total ${money(analysis.processorMarkupAnalysis.junkFeeTotal)}.`,
    "processor",
  );

  addFact(
    facts,
    "benchmark",
    `${analysis.effectiveRateBenchmarkAnalysis.message}`,
    "benchmark",
  );
  addFact(
    facts,
    "benchmark",
    `Benchmark category is ${analysis.effectiveRateBenchmarkAnalysis.categoryLabel} from ${analysis.effectiveRateBenchmarkAnalysis.categorySource} with ${analysis.effectiveRateBenchmarkAnalysis.categoryConfidence} confidence; annual volume is ${money(analysis.effectiveRateBenchmarkAnalysis.annualVolume)}.`,
    "benchmark",
  );
  if (analysis.perAuthBenchmarkAnalysis.status === "ready" || analysis.perAuthBenchmarkAnalysis.status === "not_enough_detail") {
    addFact(facts, "benchmark", analysis.perAuthBenchmarkAnalysis.message, "benchmark");
  }
  if (analysis.bundledPricingBenchmark.status === "ready") {
    addFact(
      facts,
      "benchmark",
      `Bundled pricing benchmark estimates annual savings of ${money(analysis.bundledPricingBenchmark.estimatedAnnualSavings?.low ?? null)} to ${money(analysis.bundledPricingBenchmark.estimatedAnnualSavings?.high ?? null)}; confidence is ${analysis.bundledPricingBenchmark.confidence}.`,
      "benchmark",
    );
  }

  addFact(facts, "authorization", `Authorization analysis status is ${analysis.authorizationAnalysis.status}; authorization ratio is ${analysis.authorizationAnalysis.authRatio === null ? "not available" : `${analysis.authorizationAnalysis.authRatio.toFixed(2)}:1`}.`, "auth");
  addFact(facts, "channel", `Merchant channel is ${analysis.merchantChannelAnalysis.merchantChannel} with ${analysis.merchantChannelAnalysis.confidence} confidence.`, "channel");

  for (const notice of analysis.aiNoticeExtraction?.notices.slice(0, 8) ?? []) {
    addFact(
      facts,
      "notice",
      `Statement notice${notice.isFeeChange ? " fee change" : ""}: ${notice.feeName ?? "unnamed notice"}; amount ${notice.amount?.raw ?? "not stated"}; effective date ${notice.effectiveDate ?? "not stated"}; confidence ${notice.confidence}. Evidence: ${notice.evidence.join(" ")}`,
      "notice",
    );
  }
  for (const notice of analysis.notices.slice(0, 6)) {
    addFact(
      facts,
      "notice",
      `Deterministic repricing notice: ${notice.kind} for ${notice.feeLabel ?? "unspecified fee"} effective ${notice.effectiveDate ?? "not stated"}. Evidence: ${notice.evidenceLine}`,
      "notice",
    );
  }

  for (const finding of topFindings(analysis.findings)) {
    addFact(
      facts,
      "finding",
      `${finding.severity.toUpperCase()} finding: ${finding.title}. Amount: ${money(finding.amount)}. Action: ${findingActionText(finding.action)}. Evidence: ${finding.evidence.slice(0, 3).join(" ")}`,
      "finding",
    );
  }

  for (const row of actionableAssessmentRows(analysis.rows)) {
    const assessment = row.aiAssessment!;
    addFact(
      facts,
      "ai_assessment",
      `AI fee assessment for ${row.description}: paid to ${assessment.paidToParty}, negotiability ${assessment.negotiability}, avoidable likelihood ${assessment.avoidableLikelihood}, merchant action ${assessment.merchantAction}, proof posture ${assessment.passThroughProofPosture}. Recommendation: ${assessment.recommendation ?? "none"}. Amount: ${money(row.amount)}.`,
      "assess",
    );
  }

  addFact(
    facts,
    "savings",
    `Savings summary contains ${analysis.savingsSummary.opportunities} opportunity/opportunities with annual low estimate ${money(analysis.savingsSummary.annualLow)} and annual high estimate ${money(analysis.savingsSummary.annualHigh)}.`,
    "savings",
  );
  addFact(
    facts,
    "reconciliation",
    `Fee-row reconciliation status is ${analysis.reconciliation.status}; basis total ${money(analysis.reconciliation.basisTotal)}, row total ${money(analysis.reconciliation.rowTotal)}, residual ${money(analysis.reconciliation.residual)}.`,
    "recon",
  );
  addFact(
    facts,
    "reconciliation",
    `Interchange reconciliation status is ${analysis.interchangeReconciliation.status}; unexplained gap is ${money(analysis.interchangeReconciliation.unexplainedGap)}.`,
    "recon",
  );

  return {
    facts: facts.slice(0, 80),
    context: {
      hasFiservFeeAnalysisV2: true,
      merchantName: output.statementIdentity.merchantName ?? null,
      statementPeriodStart: output.statementIdentity.statementPeriodStart,
      statementPeriodEnd: output.statementIdentity.statementPeriodEnd,
      pricingModel: analysis.pricingModel.pricingModel,
      findingCount: analysis.findings.length,
      savingsOpportunities: analysis.savingsSummary.opportunities,
      effectiveRatePct: round2(output.selectedFinancials.effectiveRate * 100),
    },
  };
}

function sectionSchema(z: any): any {
  const bulletSchema = z
    .object({
      text: z.string(),
      factIds: z.array(z.string()),
    })
    .strict();
  return z
    .object({
      title: z.string(),
      summary: z.string(),
      factIds: z.array(z.string()),
      bullets: z.array(bulletSchema),
    })
    .strict();
}

function narrativeResponseSchema(): unknown {
  const { z } = loadZod();
  const actionSchema = z
    .object({
      priority: z.enum(["high", "medium", "low"]),
      text: z.string(),
      factIds: z.array(z.string()),
    })
    .strict();
  return z
    .object({
      sections: z
        .object(Object.fromEntries(SECTION_KEYS.map((key) => [key, sectionSchema(z)])))
        .strict(),
      actionItems: z.array(actionSchema),
      notes: z.array(z.string()),
    })
    .strict();
}

function narrativePrompt(packet: { facts: MerchantNarrativeFact[]; context: Record<string, unknown> }): string {
  return [
    "You write merchant-facing explanations for a payment-processing statement analysis product.",
    "Return conservative JSON only. Do not include prose outside JSON.",
    "Use ONLY the provided facts. Do not invent numbers, savings, rates, pricing models, proof status, deadlines, or recommendations.",
    "Every section summary, bullet, and action item must cite factIds from the provided facts.",
    "If a fact says proof is indeterminate, not enough detail, pending, or an estimate, say that plainly.",
    "Do not present AI assessments as proof. Treat them as advisory recommendations.",
    "Write in clear language for a merchant, not internal engineering language.",
    "Required sections: executiveSummary, pricingModel, passThroughVerification, processorControlledFees, benchmarkConclusion, noticesAndRepricing, negotiationOpportunities, caveats.",
    "Fact packet:",
    JSON.stringify(packet),
  ].join("\n\n");
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

function providerLabel(provider: MerchantNarrativeProvider): string {
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function failureMessage(provider: MerchantNarrativeProvider, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${providerLabel(provider)} AI merchant narrative generation failed: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`;
}

async function generateNarrativeWithProvider(
  sdk: AiSdk,
  provider: MerchantNarrativeProvider,
  modelName: string,
  packet: { facts: MerchantNarrativeFact[]; context: Record<string, unknown> },
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
          name: "merchant_statement_narrative",
          description: "Merchant-facing narrative grounded in statement analysis facts.",
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

function factIdSet(facts: MerchantNarrativeFact[]): Set<string> {
  return new Set(facts.map((fact) => fact.id));
}

function validFactIds(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((entry) => compactText(entry, 80)).filter((entry): entry is string => Boolean(entry));
  return [...new Set(normalized.filter((entry) => allowed.has(entry)))].slice(0, 8);
}

function normalizeBullet(value: unknown, allowed: Set<string>): MerchantNarrativeBullet | null {
  const candidate = value && typeof value === "object" ? (value as { text?: unknown; factIds?: unknown }) : {};
  const text = compactText(candidate.text, 500);
  const ids = validFactIds(candidate.factIds, allowed);
  if (!text || ids.length === 0) return null;
  return { text, factIds: ids };
}

function emptySection(key: MerchantNarrativeSectionKey, summary = "Not enough structured detail is available for this section."): MerchantNarrativeSection {
  return {
    title: SECTION_TITLES[key],
    summary,
    factIds: [],
    bullets: [],
  };
}

function normalizeSection(value: unknown, key: MerchantNarrativeSectionKey, allowed: Set<string>): MerchantNarrativeSection {
  const candidate = value && typeof value === "object" ? (value as { title?: unknown; summary?: unknown; factIds?: unknown; bullets?: unknown }) : {};
  const summary = compactText(candidate.summary, 700);
  const ids = validFactIds(candidate.factIds, allowed);
  const bullets = Array.isArray(candidate.bullets)
    ? candidate.bullets.map((entry) => normalizeBullet(entry, allowed)).filter((entry): entry is MerchantNarrativeBullet => entry !== null).slice(0, 5)
    : [];
  if (!summary || ids.length === 0) return emptySection(key);
  return {
    title: compactText(candidate.title, 80) ?? SECTION_TITLES[key],
    summary,
    factIds: ids,
    bullets,
  };
}

function normalizeActionItem(value: unknown, allowed: Set<string>): MerchantNarrativeActionItem | null {
  const candidate = value && typeof value === "object" ? (value as { priority?: unknown; text?: unknown; factIds?: unknown }) : {};
  const priority = candidate.priority === "high" || candidate.priority === "medium" || candidate.priority === "low" ? candidate.priority : "medium";
  const text = compactText(candidate.text, 500);
  const ids = validFactIds(candidate.factIds, allowed);
  if (!text || ids.length === 0) return null;
  return { priority, text, factIds: ids };
}

function usedFactIds(sections: MerchantNarrativeSections, actionItems: MerchantNarrativeActionItem[]): string[] {
  const ids = new Set<string>();
  for (const section of Object.values(sections)) {
    for (const id of section.factIds) ids.add(id);
    for (const bullet of section.bullets) {
      for (const id of bullet.factIds) ids.add(id);
    }
  }
  for (const action of actionItems) {
    for (const id of action.factIds) ids.add(id);
  }
  return [...ids].sort();
}

function parseNarrativeAiObject(
  value: unknown,
  facts: MerchantNarrativeFact[],
): Pick<MerchantNarrative, "sections" | "actionItems" | "factsUsed" | "notes"> {
  if (!value || typeof value !== "object") throw new Error("AI merchant narrative response was not an object.");
  const object = value as { sections?: unknown; actionItems?: unknown; notes?: unknown };
  const allowed = factIdSet(facts);
  const sectionInput = object.sections && typeof object.sections === "object" ? (object.sections as Record<string, unknown>) : {};
  const sections = Object.fromEntries(SECTION_KEYS.map((key) => [key, normalizeSection(sectionInput[key], key, allowed)])) as MerchantNarrativeSections;
  const actionItems = Array.isArray(object.actionItems)
    ? object.actionItems.map((entry) => normalizeActionItem(entry, allowed)).filter((entry): entry is MerchantNarrativeActionItem => entry !== null).slice(0, 8)
    : [];
  const notes = Array.isArray(object.notes)
    ? object.notes.map((entry) => compactText(entry, 260)).filter((entry): entry is string => Boolean(entry)).slice(0, 8)
    : [];
  return {
    sections,
    actionItems,
    factsUsed: usedFactIds(sections, actionItems),
    notes,
  };
}

function emptySections(): MerchantNarrativeSections {
  return Object.fromEntries(SECTION_KEYS.map((key) => [key, emptySection(key)])) as MerchantNarrativeSections;
}

function narrativeResult(params: {
  status: MerchantNarrativeStatus;
  provider: MerchantNarrativeProvider | null;
  model: string | null;
  attempted: boolean;
  factCount: number;
  parsed?: Pick<MerchantNarrative, "sections" | "actionItems" | "factsUsed" | "notes">;
  notes: string[];
}): MerchantNarrative {
  return {
    status: params.status,
    provider: params.provider,
    model: params.model,
    attempted: params.attempted,
    factCount: params.factCount,
    factsUsed: params.parsed?.factsUsed ?? [],
    sections: params.parsed?.sections ?? emptySections(),
    actionItems: params.parsed?.actionItems ?? [],
    notes: [...params.notes, ...(params.parsed?.notes ?? [])],
  };
}

function attachNarrative<O extends ParserOutputWithMerchantNarrative>(output: O, narrative: MerchantNarrative): O {
  if (!output.fiservFeeAnalysisV2) return output;
  return {
    ...output,
    fiservFeeAnalysisV2: {
      ...output.fiservFeeAnalysisV2,
      aiMerchantNarrative: narrative,
    },
  };
}

export async function maybeRunMerchantNarrativeAiForParserOutput<O extends ParserOutputWithMerchantNarrative>(
  output: O,
  options: MerchantNarrativeAiOptions = {},
): Promise<{ output: O; aiMerchantNarrative: MerchantNarrative }> {
  const packet = buildMerchantNarrativeFactPacket(output);
  if (!output.fiservFeeAnalysisV2) {
    const result = narrativeResult({
      status: "not_needed",
      provider: null,
      model: null,
      attempted: false,
      factCount: packet.facts.length,
      notes: ["No Fiserv V2 analysis output was available for merchant narrative generation."],
    });
    return { output, aiMerchantNarrative: result };
  }
  if (!aiEnabled(options)) {
    const result = narrativeResult({
      status: "disabled",
      provider: null,
      model: null,
      attempted: false,
      factCount: packet.facts.length,
      notes: ["AI merchant narrative generation was explicitly disabled."],
    });
    return { output: attachNarrative(output, result), aiMerchantNarrative: result };
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
    return { output: attachNarrative(output, result), aiMerchantNarrative: result };
  }

  const maxInputTokens = options.maxInputTokens ?? Number(process.env.AI_MERCHANT_NARRATIVE_MAX_INPUT_TOKENS ?? process.env.AI_MAX_INPUT_TOKENS ?? 14000);
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.AI_MERCHANT_NARRATIVE_MAX_OUTPUT_TOKENS ?? process.env.AI_MAX_OUTPUT_TOKENS ?? 3500);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_MERCHANT_NARRATIVE_TIMEOUT_MS ?? 10000);
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
      notes: [`AI merchant narrative generation failed before provider execution: ${detail.replace(/\s+/g, " ").trim().slice(0, 500)}`],
    });
    return { output: attachNarrative(output, result), aiMerchantNarrative: result };
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
      return { output: attachNarrative(output, result), aiMerchantNarrative: result };
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
    notes: ["AI merchant narrative generation failed across all configured providers; structured analysis preserved.", ...failureNotes],
  });
  return { output: attachNarrative(output, result), aiMerchantNarrative: result };
}
