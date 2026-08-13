import { calculateWorstCaseCostUsd } from "./providerAccounting.js";
import type { EvaluationExecutionStage, EvaluationPricingPolicy } from "./types.js";
import { ONE_TIME_RESEARCH_REQUEST_SLOTS } from "./oneTimeStatementEvaluationAdapter.js";

export const ONE_TIME_WEB_SEARCH_MAX_INPUT_BYTES = 16_000;

export type OneTimeLiveStageCostPolicy = {
  pricingPolicyRef: string;
  providerRoute: string;
  provider: string;
  model: string | null;
  toolClass: string;
  maximumInputTokens: number | null;
  maximumOutputTokens: number | null;
  maximumToolUses: number | null;
  pricing: EvaluationPricingPolicy | null;
  estimatedMaximumCostUsd: number;
};

export type OneTimeLiveCostPolicy = Record<OneTimePaidStage, OneTimeLiveStageCostPolicy>;

export type OneTimePaidStage = Extract<
  EvaluationExecutionStage,
  | "statement_investigative_intelligence"
  | "web_search_discovery"
  | "document_retrieval"
  | "retrieved_document_investigative_intelligence"
  | "semantic_verification"
  | "whole_statement_ai_review"
>;

export const ONE_TIME_PAID_STAGE_ORDER = [
  "statement_investigative_intelligence",
  "web_search_discovery",
  "document_retrieval",
  "retrieved_document_investigative_intelligence",
  "semantic_verification",
  "whole_statement_ai_review",
] as const satisfies readonly OneTimePaidStage[];

const OPENAI_RESPONSES_PRICING: EvaluationPricingPolicy = {
  uncachedInputUsdPerMillionTokens: 1.25,
  cachedInputUsdPerMillionTokens: 0.125,
  outputUsdPerMillionTokens: 10,
  toolUseUsd: 0.01,
};

export function oneTimeLiveCostPolicyTemplate(package5BParentEnvelopeUsd = 0.1): OneTimeLiveCostPolicy {
  return {
    statement_investigative_intelligence: openAiResponsesPolicy("investigative_intelligence", 24_000, 3_200, 0),
    web_search_discovery: openAiResponsesPolicy(
      "web_search",
      ONE_TIME_WEB_SEARCH_MAX_INPUT_BYTES,
      2_000,
      2,
      "openai_responses_web_search",
    ),
    document_retrieval: {
      pricingPolicyRef: "direct_https_retrieval_policy_v1",
      providerRoute: "pinned_https_retrieval",
      provider: "ratereveal",
      model: null,
      toolClass: "retrieval",
      maximumInputTokens: 0,
      maximumOutputTokens: 0,
      maximumToolUses: 1,
      pricing: {
        uncachedInputUsdPerMillionTokens: 0,
        cachedInputUsdPerMillionTokens: 0,
        outputUsdPerMillionTokens: 0,
        toolUseUsd: 0.001,
      },
      estimatedMaximumCostUsd: 0.001,
    },
    retrieved_document_investigative_intelligence: openAiResponsesPolicy("investigative_intelligence", 24_000, 3_200, 0),
    semantic_verification: openAiResponsesPolicy("semantic_verification", 4_096, 2_000, 0),
    whole_statement_ai_review: {
      pricingPolicyRef: "openai_official_pricing_2026-08-08_v1",
      providerRoute: "openai_ai_sdk_generate_text_structured_output",
      provider: "openai",
      model: "gpt-5.4-mini",
      toolClass: "ai_sdk_structured_output",
      maximumInputTokens: 400_000,
      maximumOutputTokens: 5_000,
      maximumToolUses: 0,
      pricing: null,
      estimatedMaximumCostUsd: package5BParentEnvelopeUsd,
    },
  };
}

export function oneTimeStageSlotCounts(allowedStages: readonly EvaluationExecutionStage[]): Record<OneTimePaidStage, number> {
  const allowed = new Set(allowedStages);
  return {
    statement_investigative_intelligence: allowed.has("statement_investigative_intelligence")
      ? ONE_TIME_RESEARCH_REQUEST_SLOTS.statementInvestigation
      : 0,
    web_search_discovery: allowed.has("web_search_discovery")
      ? ONE_TIME_RESEARCH_REQUEST_SLOTS.webSearch
      : 0,
    document_retrieval: allowed.has("document_retrieval")
      ? ONE_TIME_RESEARCH_REQUEST_SLOTS.retrieval
      : 0,
    retrieved_document_investigative_intelligence: allowed.has("retrieved_document_investigative_intelligence")
      ? ONE_TIME_RESEARCH_REQUEST_SLOTS.retrievedDocumentInvestigation
      : 0,
    semantic_verification: allowed.has("semantic_verification")
      ? ONE_TIME_RESEARCH_REQUEST_SLOTS.semanticVerification
      : 0,
    whole_statement_ai_review: allowed.has("whole_statement_ai_review") ? 1 : 0,
  };
}

export function oneTimeSlotExpandedCostEnvelope(
  costPolicy: OneTimeLiveCostPolicy,
  allowedStages: readonly EvaluationExecutionStage[],
): {
  stages: Array<{
    stage: OneTimePaidStage;
    slotCount: number;
    estimatedMaximumCostUsdPerSlot: number;
    estimatedMaximumCostUsd: number;
  }>;
  totalEstimatedEnvelopeUsd: number;
} {
  const slotCounts = oneTimeStageSlotCounts(allowedStages);
  const stages = ONE_TIME_PAID_STAGE_ORDER.map((stage) => {
    const slotCount = slotCounts[stage];
    const perSlot = costPolicy[stage].estimatedMaximumCostUsd;
    return {
      stage,
      slotCount,
      estimatedMaximumCostUsdPerSlot: perSlot,
      estimatedMaximumCostUsd: roundUsd(perSlot * slotCount),
    };
  });
  return {
    stages,
    totalEstimatedEnvelopeUsd: roundUsd(stages.reduce((sum, stage) => sum + stage.estimatedMaximumCostUsd, 0)),
  };
}

function openAiResponsesPolicy(
  toolClass: string,
  maximumInputTokens: number,
  maximumOutputTokens: number,
  maximumToolUses: number,
  providerRoute = "openai_responses",
): OneTimeLiveStageCostPolicy {
  return {
    pricingPolicyRef: "openai_official_pricing_2026-08-08_v1",
    providerRoute,
    provider: "openai",
    model: "gpt-5",
    toolClass,
    maximumInputTokens,
    maximumOutputTokens,
    maximumToolUses,
    pricing: OPENAI_RESPONSES_PRICING,
    estimatedMaximumCostUsd: calculateWorstCaseCostUsd({
      maximumInputTokens,
      maximumOutputTokens,
      maximumToolUses,
      pricing: OPENAI_RESPONSES_PRICING,
    }),
  };
}

function roundUsd(value: number): number {
  return Math.ceil(value * 1_000_000_000) / 1_000_000_000;
}
