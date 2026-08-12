import type { EvaluationExecutionStage } from "./types.js";

export const ONE_TIME_EVALUATION_CONCURRENCY_POLICY_VERSION = "one_time_evaluation_concurrency_policy_v1" as const;

export type OneTimeEvaluationConcurrencyPolicy = {
  policyVersion: typeof ONE_TIME_EVALUATION_CONCURRENCY_POLICY_VERSION;
  stageLimits: Partial<Record<EvaluationExecutionStage, number>>;
};

const stageLimits: Partial<Record<EvaluationExecutionStage, number>> = {
  document_retrieval: 4,
  retrieved_document_investigative_intelligence: 3,
};

export const ONE_TIME_EVALUATION_CONCURRENCY_POLICY = {
  policyVersion: ONE_TIME_EVALUATION_CONCURRENCY_POLICY_VERSION,
  stageLimits,
} as const satisfies OneTimeEvaluationConcurrencyPolicy;

export function oneTimeEvaluationConcurrencyLimit(stage: EvaluationExecutionStage): number {
  return Math.max(1, ONE_TIME_EVALUATION_CONCURRENCY_POLICY.stageLimits[stage] ?? 1);
}
