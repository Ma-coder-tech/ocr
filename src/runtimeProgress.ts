export const RUNTIME_CHECKPOINT_STAGE_VALUES = [
  "queued",
  "parser",
  "deterministic_analysis",
  "canonical_construction",
  "research_planning",
  "discovery",
  "retrieval",
  "investigative_intelligence",
  "semantic_verification",
  "whole_statement_intelligence",
  "merchant_attention",
  "merchant_language",
  "projection",
  "persistence",
  "terminal",
] as const;

export type RuntimeCheckpointStage = typeof RUNTIME_CHECKPOINT_STAGE_VALUES[number];

export const RUNTIME_CHECKPOINT_STATUS_VALUES = [
  "waiting",
  "running",
  "completed",
  "degraded",
  "failed",
  "timed_out",
] as const;

export type RuntimeCheckpointStatus = typeof RUNTIME_CHECKPOINT_STATUS_VALUES[number];
export type RuntimeCheckpointProvider = "anthropic" | "openai" | "custom_adapter" | "none";

export const RUNTIME_CHECKPOINT_COUNTER_KEYS = [
  "questionCount",
  "selectedQuestionCount",
  "searchCallCount",
  "candidateCount",
  "retrievalAttemptCount",
  "retrievedPdfAttemptCount",
  "retrievedPdfSuccessCount",
  "retrievedPdfTimedOutCount",
  "statementInvestigativeOutputCount",
  "retrievedInvestigativeAttemptCount",
  "retrievedInvestigativeOutputCount",
  "semanticVerificationAttemptCount",
  "verifiedClaimSupportCount",
  "expectedFeeRowCount",
  "reviewedFeeRowCount",
  "acceptedRecordCount",
  "needsVerificationCount",
  "humanReviewCount",
  "rejectedRecordCount",
  "requestBatchCount",
  "completedRequestBatchCount",
  "processedItemCount",
  "transportAttemptCount",
  "providerResponseCount",
  "structuredResponseCount",
  "retryCount",
  "inputTokenCount",
  "cachedInputTokenCount",
  "outputTokenCount",
  "incompleteOutputCount",
  "schemaValidationFailureCount",
  "eligibleItemCount",
  "admittedItemCount",
  "projectionCount",
] as const;

export type RuntimeCheckpointCounterKey = typeof RUNTIME_CHECKPOINT_COUNTER_KEYS[number];
export type RuntimeCheckpointCounters = Partial<Record<RuntimeCheckpointCounterKey, number>>;

export type RuntimeProgressEvent = {
  stage: RuntimeCheckpointStage;
  status: RuntimeCheckpointStatus;
  elapsedMs?: number | null;
  provider?: RuntimeCheckpointProvider | null;
  model?: string | null;
  counters?: RuntimeCheckpointCounters;
  reasonCodes?: readonly string[];
};

export type RuntimeProgressReporter = (event: RuntimeProgressEvent) => void | Promise<void>;

export type RuntimeCheckpoint = {
  sequence: number;
  executionId: string | null;
  attemptCount: number;
  stage: RuntimeCheckpointStage;
  status: RuntimeCheckpointStatus;
  at: string;
  elapsedMs: number | null;
  provider: RuntimeCheckpointProvider | null;
  model: string | null;
  counters: RuntimeCheckpointCounters;
  reasonCodes: string[];
};

const STAGE_SET = new Set<string>(RUNTIME_CHECKPOINT_STAGE_VALUES);
const STATUS_SET = new Set<string>(RUNTIME_CHECKPOINT_STATUS_VALUES);
const PROVIDER_SET = new Set<string>(["anthropic", "openai", "custom_adapter", "none"]);
const COUNTER_SET = new Set<string>(RUNTIME_CHECKPOINT_COUNTER_KEYS);
const SAFE_REASON_CODE = /^[a-z0-9][a-z0-9_:-]{0,99}$/;
const SAFE_MODEL = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;
const SAFE_EXECUTION_ID = /^runtime_[a-f0-9]{32}$/;

export function normalizeRuntimeProgressEvent(event: RuntimeProgressEvent): RuntimeProgressEvent {
  if (!STAGE_SET.has(event.stage)) throw new Error("runtime_checkpoint_stage_invalid");
  if (!STATUS_SET.has(event.status)) throw new Error("runtime_checkpoint_status_invalid");
  if (event.provider !== undefined && event.provider !== null && !PROVIDER_SET.has(event.provider)) {
    throw new Error("runtime_checkpoint_provider_invalid");
  }
  if (event.model !== undefined && event.model !== null && !SAFE_MODEL.test(event.model)) {
    throw new Error("runtime_checkpoint_model_invalid");
  }
  const elapsedMs = event.elapsedMs === undefined || event.elapsedMs === null
    ? null
    : boundedInteger(event.elapsedMs, "runtime_checkpoint_elapsed_invalid");
  const counters: RuntimeCheckpointCounters = {};
  for (const [key, value] of Object.entries(event.counters ?? {})) {
    if (!COUNTER_SET.has(key)) throw new Error("runtime_checkpoint_counter_invalid");
    counters[key as RuntimeCheckpointCounterKey] = boundedInteger(value, "runtime_checkpoint_counter_value_invalid");
  }
  const reasonCodes = [...new Set(event.reasonCodes ?? [])];
  if (reasonCodes.length > 24 || reasonCodes.some((code) => !SAFE_REASON_CODE.test(code))) {
    throw new Error("runtime_checkpoint_reason_code_invalid");
  }
  return {
    stage: event.stage,
    status: event.status,
    elapsedMs,
    provider: event.provider ?? null,
    model: event.model ?? null,
    counters,
    reasonCodes: reasonCodes.sort(),
  };
}

export function validateRuntimeExecutionId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (!SAFE_EXECUTION_ID.test(value)) throw new Error("runtime_checkpoint_execution_id_invalid");
  return value;
}

export async function emitRuntimeProgress(
  reporter: RuntimeProgressReporter | null | undefined,
  event: RuntimeProgressEvent,
): Promise<void> {
  if (!reporter) return;
  try {
    const normalized = normalizeRuntimeProgressEvent(event);
    await reporter(normalized);
  } catch (error) {
    const code = error instanceof Error && SAFE_REASON_CODE.test(error.message)
      ? error.message
      : "runtime_checkpoint_persistence_failed";
    console.error("[runtime-checkpoint]", code);
  }
}

export function runtimeProgressFailureStatus(error: unknown): RuntimeCheckpointStatus {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out|timeout|aborted|abort/i.test(message) ? "timed_out" : "failed";
}

export function runtimeProgressFailureReason(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout|aborted|abort/i.test(message)) return `${fallback}_timed_out`;
  return `${fallback}_failed`;
}

function boundedInteger(value: unknown, code: string): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 1_000_000_000) throw new Error(code);
  return Number(value);
}
