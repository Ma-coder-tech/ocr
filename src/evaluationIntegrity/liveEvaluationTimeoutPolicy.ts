export type LiveEvaluationTimedStage =
  | "web_search_discovery"
  | "document_retrieval"
  | "statement_investigative_intelligence"
  | "retrieved_document_investigative_intelligence"
  | "semantic_verification"
  | "whole_statement_ai_review";

export const LIVE_EVALUATION_TIMEOUT_POLICY_VERSION = "live_evaluation_timeout_policy_v2" as const;

export type LiveEvaluationTimeoutPolicy = {
  policyVersion: typeof LIVE_EVALUATION_TIMEOUT_POLICY_VERSION;
  perCallMs: Readonly<Record<LiveEvaluationTimedStage, number>>;
  researchGraphTotalMs: number;
};

export type LiveEvaluationTimeoutScope = "per_call" | "research_graph";

export const LIVE_EVALUATION_TIMEOUT_POLICY = {
  policyVersion: LIVE_EVALUATION_TIMEOUT_POLICY_VERSION,
  perCallMs: {
    web_search_discovery: 90_000,
    document_retrieval: 30_000,
    statement_investigative_intelligence: 120_000,
    retrieved_document_investigative_intelligence: 120_000,
    semantic_verification: 60_000,
    whole_statement_ai_review: 300_000,
  },
  researchGraphTotalMs: 660_000,
} as const satisfies LiveEvaluationTimeoutPolicy;

export function liveEvaluationEffectiveTimeoutMs(input: {
  stage: LiveEvaluationTimedStage;
  remainingResearchGraphMs?: number;
}): number {
  const perCallMs = LIVE_EVALUATION_TIMEOUT_POLICY.perCallMs[input.stage];
  if (input.remainingResearchGraphMs === undefined) return perCallMs;
  return Math.max(0, Math.min(perCallMs, input.remainingResearchGraphMs));
}

export function liveEvaluationTimeoutReasonCode(
  stage: LiveEvaluationTimedStage,
  scope: LiveEvaluationTimeoutScope,
): string {
  if (scope === "research_graph") return "fee_knowledge_research_graph_timed_out";
  if (stage === "web_search_discovery") return "fee_knowledge_web_search_timed_out";
  if (stage === "document_retrieval") return "fee_knowledge_retrieval_timed_out";
  if (stage === "statement_investigative_intelligence") return "fee_knowledge_statement_investigative_timed_out";
  if (stage === "retrieved_document_investigative_intelligence") return "fee_knowledge_retrieved_document_investigative_timed_out";
  if (stage === "semantic_verification") return "fee_knowledge_semantic_timed_out";
  return "whole_statement_ai_review_timed_out";
}

export function liveEvaluationTimeoutError(
  stage: LiveEvaluationTimedStage,
  scope: LiveEvaluationTimeoutScope,
): Error & {
  code: "provider_timeout";
  evaluationTimeoutScope: LiveEvaluationTimeoutScope;
  reasonCode: string;
} {
  const error = new Error(liveEvaluationTimeoutReasonCode(stage, scope)) as Error & {
    code: "provider_timeout";
    evaluationTimeoutScope: LiveEvaluationTimeoutScope;
    reasonCode: string;
  };
  error.name = "AbortError";
  error.code = "provider_timeout";
  error.evaluationTimeoutScope = scope;
  error.reasonCode = liveEvaluationTimeoutReasonCode(stage, scope);
  return error;
}

export async function runWithLiveEvaluationTimeout<T>(input: {
  stage: LiveEvaluationTimedStage;
  scope: LiveEvaluationTimeoutScope;
  timeoutMs: number;
  operation: (abortSignal: AbortSignal) => Promise<T>;
  onTimeout?: () => void;
}): Promise<T> {
  const controller = new AbortController();
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        input.onTimeout?.();
        const error = liveEvaluationTimeoutError(input.stage, input.scope);
        controller.abort(error);
        reject(error);
      }, input.timeoutMs);
      timer.unref?.();
      input.operation(controller.signal).then(
        (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      );
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
