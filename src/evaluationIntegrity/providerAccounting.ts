import type { CostReservationInput } from "./costLedger.js";
import type { CostToolEvent, EvaluationExecutionStage, EvaluationPricingPolicy } from "./types.js";
import { safeProviderPostResponseFailureError } from "../canonical/providerFailureDiagnostics.js";

export const LIVE_TRIAL_OUTPUT_LIMITS = {
  whole_statement_ai_review: 5_000,
  statement_investigative_intelligence: 3_200,
  retrieved_document_investigative_intelligence: 3_200,
  web_search_discovery: 2_000,
  semantic_verification: 1_000,
} as const;

export const WEB_SEARCH_ACCOUNTING_MAX_ACTIONS = 2;

export const OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING: EvaluationPricingPolicy = {
  uncachedInputUsdPerMillionTokens: 0.75,
  cachedInputUsdPerMillionTokens: 0.075,
  outputUsdPerMillionTokens: 4.5,
  toolUseUsd: 0,
};

export type SafeProviderUsage = {
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  toolEvents: CostToolEvent[];
};

export function calculateWorstCaseCostUsd(input: Pick<
  CostReservationInput,
  "maximumInputTokens" | "maximumOutputTokens" | "maximumToolUses" | "pricing"
>): number {
  const pricing = requiredPricing(input.pricing);
  const maximumInputTokens = requiredNonnegativeInteger(input.maximumInputTokens, "maximum input tokens");
  const maximumOutputTokens = requiredNonnegativeInteger(input.maximumOutputTokens, "maximum output tokens");
  const maximumToolUses = requiredNonnegativeInteger(input.maximumToolUses, "maximum tool uses");
  const maximumInputRate = Math.max(
    pricing.uncachedInputUsdPerMillionTokens,
    pricing.cachedInputUsdPerMillionTokens,
  );
  return roundUsd(
    (maximumInputTokens * maximumInputRate) / 1_000_000
      + (maximumOutputTokens * pricing.outputUsdPerMillionTokens) / 1_000_000
      + maximumToolUses * pricing.toolUseUsd,
  );
}

export function accountingFromProviderUsage(input: {
  usage: SafeProviderUsage | null;
  approvedCallMetadata: CostReservationInput;
  durationMs: number;
}): {
  requestId: string | null;
  durationMs: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  toolEvents: CostToolEvent[];
  observedOrEstimatedFinalCostUsd: number | null;
  billingDisposition: "observed" | "unknown";
} {
  const usage = input.usage;
  if (usage) assertToolUsageWithinApprovedLimit(usage, input.approvedCallMetadata);
  if (!usage || !completeUsage(usage)) {
    return {
      requestId: usage?.requestId ?? null,
      durationMs: input.durationMs,
      inputTokens: usage?.inputTokens ?? null,
      cachedInputTokens: usage?.cachedInputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      toolEvents: usage?.toolEvents ?? [],
      observedOrEstimatedFinalCostUsd: null,
      billingDisposition: "unknown",
    };
  }
  assertTokenUsageWithinApprovedLimits(usage, input.approvedCallMetadata);
  const pricing = requiredPricing(input.approvedCallMetadata.pricing);
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  const toolUses = usage.toolEvents.reduce((total, event) => total + event.count, 0);
  const cost = roundUsd(
    (uncachedInputTokens * pricing.uncachedInputUsdPerMillionTokens) / 1_000_000
      + (usage.cachedInputTokens * pricing.cachedInputUsdPerMillionTokens) / 1_000_000
      + (usage.outputTokens * pricing.outputUsdPerMillionTokens) / 1_000_000
      + toolUses * pricing.toolUseUsd,
  );
  return {
    requestId: usage.requestId,
    durationMs: input.durationMs,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    toolEvents: structuredClone(usage.toolEvents),
    observedOrEstimatedFinalCostUsd: cost,
    billingDisposition: "observed",
  };
}

export function assertApprovedLiveCallMetadata(
  stage: EvaluationExecutionStage,
  metadata: CostReservationInput,
): void {
  if (stage === "document_retrieval") {
    if (metadata.maximumToolUses !== 1) throw new Error("approved_retrieval_tool_limit_invalid");
    return;
  }
  if (metadata.provider.trim().toLowerCase() !== "openai") throw new Error("approved_live_provider_must_be_openai");
  if (!metadata.model?.trim()) throw new Error("approved_live_model_missing");
  requiredPricing(metadata.pricing);
  requiredPositiveInteger(metadata.maximumInputTokens, "approved maximum input tokens");
  const expectedOutput = LIVE_TRIAL_OUTPUT_LIMITS[stage as keyof typeof LIVE_TRIAL_OUTPUT_LIMITS];
  if (expectedOutput === undefined || metadata.maximumOutputTokens !== expectedOutput) {
    throw new Error("approved_maximum_output_tokens_inconsistent");
  }
  const expectedToolUses = stage === "web_search_discovery" ? WEB_SEARCH_ACCOUNTING_MAX_ACTIONS : 0;
  if (metadata.maximumToolUses !== expectedToolUses) throw new Error("approved_maximum_tool_uses_inconsistent");
  const calculated = calculateWorstCaseCostUsd(metadata);
  if (metadata.estimatedMaximumCostUsd + 1e-9 < calculated) {
    throw new Error("approved_worst_case_reservation_insufficient");
  }
}

export function assertApprovedPackage5BBudgetEnvelopeMetadata(metadata: CostReservationInput): void {
  if (metadata.provider.trim().toLowerCase() !== "openai") throw new Error("approved_live_provider_must_be_openai");
  if (metadata.providerRoute !== "openai_ai_sdk_generate_text_structured_output") throw new Error("approved_provider_route_inconsistent");
  if (metadata.toolClass !== "ai_sdk_structured_output") throw new Error("approved_tool_class_inconsistent");
  if (!metadata.model?.trim()) throw new Error("approved_live_model_missing");
  if (metadata.maximumInputTokens !== null) requiredPositiveInteger(metadata.maximumInputTokens, "approved maximum input tokens");
  if (metadata.maximumOutputTokens !== LIVE_TRIAL_OUTPUT_LIMITS.whole_statement_ai_review) {
    throw new Error("approved_maximum_output_tokens_inconsistent");
  }
  if ((metadata.maximumToolUses ?? 0) !== 0) throw new Error("approved_maximum_tool_uses_inconsistent");
}

export function assertApprovedPackage5BProviderSendMetadata(metadata: CostReservationInput): void {
  if (metadata.provider.trim().toLowerCase() !== "openai") throw new Error("approved_live_provider_must_be_openai");
  if (metadata.providerRoute !== "openai_ai_sdk_generate_text_structured_output") throw new Error("approved_provider_route_inconsistent");
  if (metadata.toolClass !== "ai_sdk_structured_output") throw new Error("approved_tool_class_inconsistent");
  if (!metadata.model?.trim()) throw new Error("approved_live_model_missing");
  requiredPricing(approvedPackage5BPricingPolicy(metadata));
  requiredPositiveInteger(metadata.maximumInputTokens, "approved maximum input tokens");
  const maximumOutputTokens = requiredPositiveInteger(metadata.maximumOutputTokens, "approved maximum output tokens");
  if (maximumOutputTokens > LIVE_TRIAL_OUTPUT_LIMITS.whole_statement_ai_review) {
    throw new Error("approved_maximum_output_tokens_inconsistent");
  }
  if ((metadata.maximumToolUses ?? 0) !== 0) throw new Error("approved_maximum_tool_uses_inconsistent");
  const calculated = calculateWorstCaseCostUsd({
    ...metadata,
    pricing: approvedPackage5BPricingPolicy(metadata),
  });
  if (metadata.estimatedMaximumCostUsd + 1e-9 < calculated) {
    throw new Error("approved_worst_case_reservation_insufficient");
  }
}

export function approvedPackage5BPricingPolicy(
  metadata: Pick<CostReservationInput, "provider" | "providerRoute" | "model" | "toolClass" | "pricing">,
): EvaluationPricingPolicy | null {
  if (metadata.pricing) return requiredPricing(metadata.pricing);
  if (
    metadata.provider.trim().toLowerCase() === "openai" &&
    metadata.providerRoute === "openai_ai_sdk_generate_text_structured_output" &&
    metadata.toolClass === "ai_sdk_structured_output" &&
    metadata.model === "gpt-5.4-mini"
  ) {
    return OPENAI_PACKAGE_5B_STRUCTURED_OUTPUT_PRICING;
  }
  return null;
}

export function assertUtf8InputWithinApprovedTokenBound(input: string, maximumInputTokens: number | null): void {
  const maximum = requiredPositiveInteger(maximumInputTokens, "approved maximum input tokens");
  const conservativeTokenUpperBound = Buffer.byteLength(input, "utf8");
  if (conservativeTokenUpperBound > maximum) throw new Error("approved_maximum_input_tokens_exceeded_before_send");
}

function assertToolUsageWithinApprovedLimit(usage: SafeProviderUsage, metadata: CostReservationInput): void {
  const maximumTools = requiredNonnegativeInteger(metadata.maximumToolUses, "maximum tool uses");
  const toolUses = usage.toolEvents.reduce((total, event) => total + event.count, 0);
  if (toolUses > maximumTools) throw usageLimitError(usage);
}

function assertTokenUsageWithinApprovedLimits(usage: SafeProviderUsage & {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}, metadata: CostReservationInput): void {
  const maximumInput = requiredNonnegativeInteger(metadata.maximumInputTokens, "maximum input tokens");
  const maximumOutput = requiredNonnegativeInteger(metadata.maximumOutputTokens, "maximum output tokens");
  if (usage.inputTokens > maximumInput || usage.outputTokens > maximumOutput) throw usageLimitError(usage);
}

function usageLimitError(usage: SafeProviderUsage): Error {
  const error = safeProviderPostResponseFailureError(
    "provider_usage_exceeded_approved_transport_limits",
    usage.requestId,
  );
  Object.assign(error.accounting, {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    toolEvents: structuredClone(usage.toolEvents),
    observedOrEstimatedFinalCostUsd: null,
  });
  return error;
}

function completeUsage(usage: SafeProviderUsage): usage is SafeProviderUsage & {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
} {
  return nonnegativeInteger(usage.inputTokens)
    && nonnegativeInteger(usage.cachedInputTokens)
    && nonnegativeInteger(usage.outputTokens)
    && usage.cachedInputTokens <= usage.inputTokens
    && usage.toolEvents.every((event) => event.type.length > 0 && nonnegativeInteger(event.count));
}

function requiredPricing(pricing: EvaluationPricingPolicy | null | undefined): EvaluationPricingPolicy {
  if (!pricing) throw new Error("approved_pricing_policy_missing");
  for (const value of Object.values(pricing)) {
    if (!Number.isFinite(value) || value < 0) throw new Error("approved_pricing_policy_invalid");
  }
  return pricing;
}

function requiredPositiveInteger(value: number | null, label: string): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) throw new Error(`${label} must be a positive integer`);
  return value as number;
}

function requiredNonnegativeInteger(value: number | null, label: string): number {
  if (!Number.isInteger(value) || (value ?? -1) < 0) throw new Error(`${label} must be a nonnegative integer`);
  return value as number;
}

function nonnegativeInteger(value: number | null): value is number {
  return Number.isInteger(value) && (value ?? -1) >= 0;
}

function roundUsd(value: number): number {
  return Number(value.toFixed(9));
}
