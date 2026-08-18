import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  failedWholeStatementFeeIntelligenceOutput,
  validateWholeStatementFeeIntelligenceReview,
  validateWholeStatementFeeIntelligenceReviewForPacket,
  type ApprovedWholeStatementFeeIntelligenceSourceRegistry,
  type CanonicalWholeStatementFeeIntelligencePacket,
} from "./wholeStatementFeeIntelligenceReview.js";
import { buildFeeKnowledgeSourcePacket } from "./feeKnowledgeRegistry.js";
import {
  defaultFeeKnowledgeResearchQuestions,
  runFeeKnowledgeResearch,
  type FeeKnowledgeResearchDiagnostics,
  type FeeKnowledgeResearchOptions,
} from "./feeKnowledgeResearch.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalStatementAnalysis,
} from "./types.js";
import type { FeeKnowledgeIntelligenceRecord } from "./feeKnowledgeTypes.js";
import {
  SafeProviderFailureError,
  safeProviderFailureAccounting,
  safeProviderFailureError,
  safeProviderReasonCodes,
  type SafeProviderFailureOperationPhase,
} from "./providerFailureDiagnostics.js";
import { serializeWholeStatementFeeIntelligenceProviderInput } from "./wholeStatementFeeIntelligenceProviderInput.js";
import { emitRuntimeProgress, type RuntimeProgressReporter } from "../runtimeProgress.js";

const require = createRequire(import.meta.url);

type ProviderUsage = {
  inputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  cachedInputTokens?: number;
  outputTokens?: number;
};
type ProviderResultMetadata = {
  usage?: ProviderUsage;
  response?: { id?: string };
  finishReason?: string;
  rawFinishReason?: string;
};
type GenerateObject = (options: Record<string, unknown>) => Promise<{ object: unknown } & ProviderResultMetadata>;
type GenerateText = (options: Record<string, unknown>) => Promise<{ output: unknown } & ProviderResultMetadata>;
type AiModelFactory = (modelName: string) => unknown;
type AiProviderFetch = typeof fetch;
type AiProviderFactoryCreator = (options: { apiKey?: string; headers?: Record<string, string>; fetch?: AiProviderFetch }) => AiModelFactory;
type AiOutputFactory = {
  object: (options: { schema: unknown; name?: string; description?: string }) => unknown;
};
type RuntimeProvider = "anthropic" | "openai";
type RuntimeProviderPreference = RuntimeProvider | "auto";

type AiSdk = {
  generateObject: GenerateObject;
  generateText?: GenerateText;
  Output?: AiOutputFactory;
  createAnthropic?: AiProviderFactoryCreator;
  createOpenAI?: AiProviderFactoryCreator;
};

export type WholeStatementFeeIntelligenceRuntimeAdapter = (
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  context: { abortSignal: AbortSignal },
) => Promise<unknown>;

export type WholeStatementFeeIntelligenceRuntimeOptions = {
  enabled?: boolean;
  provider?: RuntimeProviderPreference;
  apiKey?: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  modelName?: string;
  anthropicModelName?: string;
  openAiModelName?: string;
  maxOutputTokens?: number;
  maxInputTokens?: number;
  maxRowsPerRequest?: number;
  maxConcurrentRequests?: number;
  maxRetries?: number;
  maxBatchCoverageRetries?: number;
  timeoutMs?: number;
  sdk?: AiSdk;
  adapter?: WholeStatementFeeIntelligenceRuntimeAdapter;
  sourceRegistry?: ApprovedWholeStatementFeeIntelligenceSourceRegistry;
  feeKnowledgeResearch?: FeeKnowledgeResearchOptions;
  onProviderUsage?: (usage: WholeStatementFeeIntelligenceProviderUsage) => void;
  progressReporter?: RuntimeProgressReporter;
};

export type WholeStatementFeeIntelligenceBatchCoverageDiagnostics = {
  batchOrdinal: number;
  expectedRowCount: number;
  returnedRowCount: number;
  uniqueReturnedRowCount: number;
  missingRowCount: number;
  duplicateRowCount: number;
  unknownRowCount: number;
  crossBatchRowCount: number;
  malformedRowCount: number;
  attemptCount: number;
  structuredOutputCompleted: boolean;
  exactCoverage: boolean;
};

export type WholeStatementFeeIntelligenceProviderUsage = {
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  localTraceId?: string | null;
  httpStatus?: number | null;
  httpSendInitiated?: boolean;
  providerResponseReceived?: boolean;
  finishReason?: string | null;
  rawFinishReason?: string | null;
  structuredOutputReceived?: boolean;
  generationCompleted?: boolean;
  outputIncomplete?: boolean;
  transportAttemptCount?: number;
  providerResponseCount?: number;
  retryCount?: number;
  reasonCodes?: string[];
};

export type WholeStatementFeeIntelligenceProviderDiagnostics = {
  requestBatchCount: number;
  completedRequestBatchCount: number;
  transportAttemptCount: number;
  providerReplyCount: number;
  structuredResultCount: number;
  retryCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  incompleteOutputCount: number;
  batchCoverage: WholeStatementFeeIntelligenceBatchCoverageDiagnostics[];
  safeReasonCodes: string[];
};

export type WholeStatementFeeIntelligenceRuntimeResult = {
  output: CanonicalAiWholeStatementFeeIntelligenceOutput;
  feeKnowledgeIntelligence: FeeKnowledgeIntelligenceRecord[];
  diagnostics: {
    research: FeeKnowledgeResearchDiagnostics | null;
    providerReviewElapsedMs: number;
    totalElapsedMs: number;
    provider: WholeStatementFeeIntelligenceProviderDiagnostics;
  };
};

export type WholeStatementFeeIntelligenceRuntimeProviderSelection = {
  provider: RuntimeProvider | "custom_adapter" | "none";
  model: string | null;
};

type ProviderTransportTrace = {
  localTraceId: string;
  provider: RuntimeProvider;
  transport: "ai_sdk_generate_text_structured_output" | "ai_sdk_generate_object_structured_output";
  httpSendInitiated: boolean;
  providerResponseReceived: boolean;
  httpStatus: number | null;
  requestId: string | null;
  transportAttemptCount: number;
  providerResponseCount: number;
};

export function wholeStatementFeeIntelligenceProviderAdapter(
  options: WholeStatementFeeIntelligenceRuntimeOptions = {},
): WholeStatementFeeIntelligenceRuntimeAdapter {
  return (packet, context) => executeProviderReview(packet, options, context.abortSignal);
}

export async function runWholeStatementFeeIntelligenceRuntime(input: {
  analysis: CanonicalStatementAnalysis;
  options?: WholeStatementFeeIntelligenceRuntimeOptions;
}): Promise<CanonicalAiWholeStatementFeeIntelligenceOutput> {
  return (await runWholeStatementFeeIntelligenceRuntimeWithContext(input)).output;
}

export async function runWholeStatementFeeIntelligenceRuntimeWithContext(input: {
  analysis: CanonicalStatementAnalysis;
  options?: WholeStatementFeeIntelligenceRuntimeOptions;
}): Promise<WholeStatementFeeIntelligenceRuntimeResult> {
  const runtimeStartedAt = Date.now();
  const options = input.options ?? {};
  const registry = options.sourceRegistry ?? { approvedExternalSourceRefs: [] };
  if (!runtimeEnabled(options)) {
    await emitRuntimeProgress(options.progressReporter, {
      stage: "whole_statement_intelligence",
      status: "degraded",
      provider: "none",
      reasonCodes: ["whole_statement_fee_intelligence_disabled"],
    });
    return {
      output: failedWholeStatementFeeIntelligenceOutput(
        input.analysis,
        "disabled",
        "whole_statement_fee_intelligence_disabled",
      ),
      feeKnowledgeIntelligence: [],
      diagnostics: {
        research: null,
        providerReviewElapsedMs: 0,
        totalElapsedMs: elapsedSince(runtimeStartedAt),
        provider: emptyProviderDiagnostics(0),
      },
    };
  }
  const research = await runFeeKnowledgeResearch({
    analysis: input.analysis,
    registry,
    questions: defaultFeeKnowledgeResearchQuestions(input.analysis, registry),
    options: {
      ...options.feeKnowledgeResearch,
      progressReporter: options.progressReporter,
    },
  });
  const sourceProvenancePacket = buildFeeKnowledgeSourcePacket({
    analysis: input.analysis,
    registry,
    runtimeClaimSupports: research.claimSupports,
    runtimeIntelligence: research.intelligence,
    researchAttempts: research.attempts,
    researchCandidates: research.candidates,
  });
  const packet = buildWholeStatementFeeIntelligencePacket(input.analysis, registry, sourceProvenancePacket);

  if (packet.admittedFeeRows.length === 0) {
    await emitRuntimeProgress(options.progressReporter, {
      stage: "whole_statement_intelligence",
      status: "degraded",
      provider: "none",
      counters: {
        expectedFeeRowCount: packet.admittedFeeRows.length,
        reviewedFeeRowCount: 0,
      },
      reasonCodes: ["whole_statement_fee_intelligence_no_admitted_fee_rows"],
    });
    return {
      output: failedWholeStatementFeeIntelligenceOutput(
        input.analysis,
        "failed",
        "whole_statement_fee_intelligence_no_admitted_fee_rows",
      ),
      feeKnowledgeIntelligence: [],
      diagnostics: {
        research: research.diagnostics,
        providerReviewElapsedMs: 0,
        totalElapsedMs: elapsedSince(runtimeStartedAt),
        provider: emptyProviderDiagnostics(0),
      },
    };
  }

  const providerReviewStartedAt = Date.now();
  const providerSelection = wholeStatementFeeIntelligenceRuntimeProviderSelection(options);
  const rowsPerRequest = boundedPositiveInteger(
    options.maxRowsPerRequest ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_ROWS_PER_REQUEST ?? 20),
    100,
    "Whole-statement row batch limit",
  );
  const requestPackets = chunkWholeStatementPacket(packet, rowsPerRequest);
  const providerUsages: WholeStatementFeeIntelligenceProviderUsage[] = [];
  const batchCoverage: WholeStatementFeeIntelligenceBatchCoverageDiagnostics[] = [];
  let completedRequestBatchCount = 0;
  await emitRuntimeProgress(options.progressReporter, {
    stage: "whole_statement_intelligence",
    status: "running",
    provider: providerSelection.provider,
    model: providerSelection.model,
    counters: {
      expectedFeeRowCount: packet.admittedFeeRows.length,
      requestBatchCount: requestPackets.length,
      completedRequestBatchCount: 0,
    },
  });
  try {
    const timeoutMs = options.timeoutMs ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_TIMEOUT_MS ?? 12000);
    const concurrency = boundedPositiveInteger(
      options.maxConcurrentRequests ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_CONCURRENT_REQUESTS ?? 1),
      4,
      "Whole-statement request concurrency",
    );
    const maxBatchCoverageRetries = boundedNonNegativeInteger(
      options.maxBatchCoverageRetries
        ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_BATCH_COVERAGE_RETRIES ?? 1),
      2,
      "Whole-statement batch coverage retry limit",
    );
    const globalExpectedRowRefs = new Set(packet.admittedFeeRows.map((row) => row.feeRowRef));
    const rawBatches = await withAbortTimeout(
      (abortSignal) => mapWithConcurrency(requestPackets, concurrency, async (requestPacket, batchIndex) => {
        for (let attemptIndex = 0; attemptIndex <= maxBatchCoverageRetries; attemptIndex += 1) {
          const attemptCount = attemptIndex + 1;
          const raw = options.adapter
            ? await options.adapter(requestPacket, { abortSignal })
            : await executeProviderReview(requestPacket, {
                ...options,
                onProviderUsage: (usage) => {
                  providerUsages.push(usage);
                  options.onProviderUsage?.(usage);
                },
              }, abortSignal);
          const coverage = batchCoverageDiagnosticsFor({
            raw,
            packet: requestPacket,
            globalExpectedRowRefs,
            batchOrdinal: batchIndex + 1,
            attemptCount,
          });
          batchCoverage.push(coverage);
          const batchSafetyBlocked = validateWholeStatementFeeIntelligenceReviewForPacket(
            raw,
            requestPacket,
            input.analysis,
            registry,
            sourceProvenancePacket,
          ).output.reviewStatus === "safety_blocked";
          const retrying = !coverage.exactCoverage && attemptIndex < maxBatchCoverageRetries;
          if (coverage.exactCoverage) completedRequestBatchCount += 1;
          await emitRuntimeProgress(options.progressReporter, {
            stage: "whole_statement_intelligence",
            status: coverage.exactCoverage || retrying ? "running" : "degraded",
            provider: providerSelection.provider,
            model: providerSelection.model,
            counters: {
              expectedFeeRowCount: packet.admittedFeeRows.length,
              requestBatchCount: requestPackets.length,
              completedRequestBatchCount,
              ...batchCoverageProgressCounters(coverage),
            },
            reasonCodes: [batchSafetyBlocked
              ? "whole_statement_fee_intelligence_batch_safety_blocked"
              : coverage.exactCoverage
              ? "whole_statement_fee_intelligence_batch_coverage_exact"
              : retrying
                ? "whole_statement_fee_intelligence_batch_coverage_retrying"
                : "whole_statement_fee_intelligence_batch_coverage_rejected"],
          });
          if (batchSafetyBlocked) throw new WholeStatementBatchSafetyError();
          if (!coverage.exactCoverage) {
            if (retrying) continue;
            throw new WholeStatementBatchCoverageError();
          }
          return raw;
        }
        throw new WholeStatementBatchCoverageError();
      }),
      timeoutMs,
    );
    const raw = rawBatches.length === 1 ? rawBatches[0] : mergeWholeStatementProviderResponses(rawBatches);
    const validation = validateWholeStatementFeeIntelligenceReview(raw, input.analysis, registry, sourceProvenancePacket);
    const providerDiagnostics = summarizeProviderDiagnostics(
      requestPackets.length,
      completedRequestBatchCount,
      providerUsages,
      batchCoverage,
    );
    await emitRuntimeProgress(options.progressReporter, {
      stage: "whole_statement_intelligence",
      status: validation.ok && ["completed", "partial"].includes(validation.output.reviewStatus)
        ? "completed"
        : "degraded",
      elapsedMs: elapsedSince(providerReviewStartedAt),
      provider: providerSelection.provider,
      model: providerSelection.model,
      counters: {
        expectedFeeRowCount: validation.output.coverageProof.expectedFeeRowRefs.length,
        reviewedFeeRowCount: validation.output.coverageProof.reviewedFeeRowRefs.length,
        acceptedRecordCount: validation.output.acceptanceRecords.filter((record) =>
          record.status === "accepted" || record.status === "accepted_with_conditions"
        ).length,
        needsVerificationCount: validation.output.acceptanceRecords.filter((record) => record.status === "needs_verification").length,
        humanReviewCount: validation.output.acceptanceRecords.filter((record) => record.status === "human_review").length,
        rejectedRecordCount: validation.output.acceptanceRecords.filter((record) => record.status === "rejected").length,
        ...providerProgressCounters(providerDiagnostics),
      },
      reasonCodes: [...new Set([...validation.output.reasonCodes, ...providerDiagnostics.safeReasonCodes])],
    });
    return {
      output: validation.output,
      feeKnowledgeIntelligence: validation.ok && ["completed", "partial"].includes(validation.output.reviewStatus)
        ? sourceProvenancePacket.intelligence
        : [],
      diagnostics: {
        research: research.diagnostics,
        providerReviewElapsedMs: elapsedSince(providerReviewStartedAt),
        totalElapsedMs: elapsedSince(runtimeStartedAt),
        provider: providerDiagnostics,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const timedOut = /timed out|timeout/i.test(message);
    const batchCoverageRejected = error instanceof WholeStatementBatchCoverageError;
    const batchSafetyBlocked = error instanceof WholeStatementBatchSafetyError;
    const runtimeFailureReason = timedOut
      ? "whole_statement_fee_intelligence_timed_out"
      : batchSafetyBlocked
        ? "whole_statement_fee_intelligence_batch_safety_blocked"
        : batchCoverageRejected
          ? "whole_statement_fee_intelligence_batch_coverage_rejected"
          : "whole_statement_fee_intelligence_failed";
    const providerDiagnostics = summarizeProviderDiagnostics(
      requestPackets.length,
      completedRequestBatchCount,
      providerUsages,
      batchCoverage,
      error,
    );
    const failureReasonCodes = [...new Set([
      runtimeFailureReason,
      ...safeProviderReasonCodes(error, timedOut ? "provider_call_timed_out" : "provider_structured_output_failed"),
      ...providerDiagnostics.safeReasonCodes,
    ])];
    await emitRuntimeProgress(options.progressReporter, {
      stage: "whole_statement_intelligence",
      status: timedOut ? "timed_out" : batchCoverageRejected || batchSafetyBlocked ? "degraded" : "failed",
      elapsedMs: elapsedSince(providerReviewStartedAt),
      provider: providerSelection.provider,
      model: providerSelection.model,
      counters: {
        expectedFeeRowCount: packet.admittedFeeRows.length,
        reviewedFeeRowCount: 0,
        ...providerProgressCounters(providerDiagnostics),
      },
      reasonCodes: failureReasonCodes,
    });
    return {
      output: failedWholeStatementFeeIntelligenceOutput(
        input.analysis,
        timedOut ? "timed_out" : batchSafetyBlocked ? "safety_blocked" : batchCoverageRejected ? "rejected" : "failed",
        runtimeFailureReason,
      ),
      feeKnowledgeIntelligence: [],
      diagnostics: {
        research: research.diagnostics,
        providerReviewElapsedMs: elapsedSince(providerReviewStartedAt),
        totalElapsedMs: elapsedSince(runtimeStartedAt),
        provider: providerDiagnostics,
      },
    };
  }
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function chunkWholeStatementPacket(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  rowsPerRequest: number,
): CanonicalWholeStatementFeeIntelligencePacket[] {
  const packets: CanonicalWholeStatementFeeIntelligencePacket[] = [];
  for (let index = 0; index < packet.admittedFeeRows.length; index += rowsPerRequest) {
    packets.push({ ...packet, admittedFeeRows: packet.admittedFeeRows.slice(index, index + rowsPerRequest) });
  }
  return packets;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

function mergeWholeStatementProviderResponses(values: readonly unknown[]): unknown {
  const parsed = values.map((value) => {
    const result = (reviewResponseSchema() as { safeParse: (input: unknown) => { success: boolean; data?: unknown } }).safeParse(value);
    if (!result.success) throw new Error("whole_statement_fee_intelligence_batch_schema_rejected");
    return result.data as Record<string, unknown>;
  });
  const first = parsed[0];
  if (!first) throw new Error("whole_statement_fee_intelligence_batch_response_missing");
  return {
    ...first,
    evidenceRefs: uniqueStrings(parsed.flatMap((value) => value.evidenceRefs)),
    factRefs: uniqueStrings(parsed.flatMap((value) => value.factRefs)),
    limitationCodes: uniqueStrings(parsed.flatMap((value) => value.limitationCodes)),
    rowInterpretations: parsed.flatMap((value) => Array.isArray(value.rowInterpretations) ? value.rowInterpretations : []),
    reasonCodes: uniqueStrings(parsed.flatMap((value) => value.reasonCodes)),
  };
}

class WholeStatementBatchCoverageError extends Error {
  constructor() {
    super("whole_statement_fee_intelligence_batch_coverage_rejected");
    this.name = "WholeStatementBatchCoverageError";
  }
}

class WholeStatementBatchSafetyError extends Error {
  constructor() {
    super("whole_statement_fee_intelligence_batch_safety_blocked");
    this.name = "WholeStatementBatchSafetyError";
  }
}

function batchCoverageDiagnosticsFor(input: {
  raw: unknown;
  packet: CanonicalWholeStatementFeeIntelligencePacket;
  globalExpectedRowRefs: ReadonlySet<string>;
  batchOrdinal: number;
  attemptCount: number;
}): WholeStatementFeeIntelligenceBatchCoverageDiagnostics {
  const expectedRowRefs = input.packet.admittedFeeRows.map((row) => row.feeRowRef);
  const expectedRowRefSet = new Set(expectedRowRefs);
  const source = isPlainRuntimeRecord(input.raw) ? input.raw : null;
  const rowInterpretations = source && Array.isArray(source.rowInterpretations) ? source.rowInterpretations : null;
  const returnedRowCount = rowInterpretations?.length ?? 0;
  const returnedRowRefs = rowInterpretations
    ? rowInterpretations
      .map((row) => isPlainRuntimeRecord(row) ? row.feeRowRef : null)
      .filter((ref): ref is string => typeof ref === "string")
    : [];
  const uniqueReturnedRowRefs = new Set(returnedRowRefs);
  const duplicateRowCount = returnedRowRefs.length - uniqueReturnedRowRefs.size;
  const malformedRowCount = returnedRowCount - returnedRowRefs.length;
  const missingRowCount = expectedRowRefs.filter((ref) => !uniqueReturnedRowRefs.has(ref)).length;
  const crossBatchRowCount = returnedRowRefs.filter((ref) =>
    !expectedRowRefSet.has(ref) && input.globalExpectedRowRefs.has(ref)
  ).length;
  const unknownRowCount = returnedRowRefs.filter((ref) => !input.globalExpectedRowRefs.has(ref)).length;
  const structuredOutputCompleted = rowInterpretations !== null
    && rowInterpretations.every((row) => isPlainRuntimeRecord(row) && typeof row.feeRowRef === "string");
  const exactCoverage = structuredOutputCompleted
    && returnedRowCount === expectedRowRefs.length
    && uniqueReturnedRowRefs.size === expectedRowRefs.length
    && missingRowCount === 0
    && duplicateRowCount === 0
    && unknownRowCount === 0
    && crossBatchRowCount === 0
    && malformedRowCount === 0;
  return {
    batchOrdinal: input.batchOrdinal,
    expectedRowCount: expectedRowRefs.length,
    returnedRowCount,
    uniqueReturnedRowCount: uniqueReturnedRowRefs.size,
    missingRowCount,
    duplicateRowCount,
    unknownRowCount,
    crossBatchRowCount,
    malformedRowCount,
    attemptCount: input.attemptCount,
    structuredOutputCompleted,
    exactCoverage,
  };
}

function isPlainRuntimeRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function batchCoverageProgressCounters(diagnostics: WholeStatementFeeIntelligenceBatchCoverageDiagnostics) {
  return {
    batchOrdinal: diagnostics.batchOrdinal,
    batchExpectedRowCount: diagnostics.expectedRowCount,
    batchReturnedRowCount: diagnostics.returnedRowCount,
    batchUniqueReturnedRowCount: diagnostics.uniqueReturnedRowCount,
    batchMissingRowCount: diagnostics.missingRowCount,
    batchDuplicateRowCount: diagnostics.duplicateRowCount,
    batchUnknownRowCount: diagnostics.unknownRowCount,
    batchCrossBatchRowCount: diagnostics.crossBatchRowCount,
    batchMalformedRowCount: diagnostics.malformedRowCount,
    batchAttemptCount: diagnostics.attemptCount,
    batchStructuredOutputCompletedCount: diagnostics.structuredOutputCompleted ? 1 : 0,
  };
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
}

function summarizeProviderDiagnostics(
  requestBatchCount: number,
  completedRequestBatchCount: number,
  usages: readonly WholeStatementFeeIntelligenceProviderUsage[],
  batchCoverage: readonly WholeStatementFeeIntelligenceBatchCoverageDiagnostics[],
  error?: unknown,
): WholeStatementFeeIntelligenceProviderDiagnostics {
  const accounting = safeProviderFailureAccounting(error);
  const accountingAlreadyObserved = accounting !== null && usages.some((usage) =>
    (accounting.requestId !== null && usage.requestId === accounting.requestId)
    || (usage.outputIncomplete && safeProviderReasonCodes(error, "provider_structured_output_failed").includes("provider_output_exhausted"))
  );
  const unobservedAccounting = accountingAlreadyObserved ? null : accounting;
  const safeReasonCodes = new Set(usages.flatMap((usage) => usage.reasonCodes ?? []));
  safeProviderReasonCodes(error, "provider_completed").forEach((code) => safeReasonCodes.add(code));
  if (error === undefined) safeReasonCodes.delete("provider_completed");
  return {
    requestBatchCount,
    completedRequestBatchCount,
    transportAttemptCount: sumNumbers(usages.map((usage) => usage.transportAttemptCount))
      + (unobservedAccounting?.transportAttemptCount ?? 0),
    providerReplyCount: sumNumbers(usages.map((usage) => usage.providerResponseCount))
      + (unobservedAccounting?.providerResponseCount ?? 0),
    structuredResultCount: usages.filter((usage) => usage.structuredOutputReceived).length,
    retryCount: sumNumbers(usages.map((usage) => usage.retryCount)) + (unobservedAccounting?.retryCount ?? 0),
    inputTokens: sumNumbers(usages.map((usage) => usage.inputTokens)) + (unobservedAccounting?.inputTokens ?? 0),
    cachedInputTokens: sumNumbers(usages.map((usage) => usage.cachedInputTokens)) + (unobservedAccounting?.cachedInputTokens ?? 0),
    outputTokens: sumNumbers(usages.map((usage) => usage.outputTokens)) + (unobservedAccounting?.outputTokens ?? 0),
    incompleteOutputCount: usages.filter((usage) => usage.outputIncomplete).length
      + (!accountingAlreadyObserved && error !== undefined && safeProviderReasonCodes(error, "provider_structured_output_failed").includes("provider_output_exhausted") ? 1 : 0),
    batchCoverage: [...batchCoverage].sort((left, right) =>
      left.batchOrdinal - right.batchOrdinal || left.attemptCount - right.attemptCount
    ),
    safeReasonCodes: [...safeReasonCodes].filter(Boolean).sort(),
  };
}

function providerProgressCounters(diagnostics: WholeStatementFeeIntelligenceProviderDiagnostics) {
  return {
    requestBatchCount: diagnostics.requestBatchCount,
    completedRequestBatchCount: diagnostics.completedRequestBatchCount,
    transportAttemptCount: diagnostics.transportAttemptCount,
    providerReplyCount: diagnostics.providerReplyCount,
    structuredResultCount: diagnostics.structuredResultCount,
    retryCount: diagnostics.retryCount,
    inputTokenCount: diagnostics.inputTokens,
    cachedInputTokenCount: diagnostics.cachedInputTokens,
    outputTokenCount: diagnostics.outputTokens,
    incompleteOutputCount: diagnostics.incompleteOutputCount,
  };
}

function emptyProviderDiagnostics(requestBatchCount: number): WholeStatementFeeIntelligenceProviderDiagnostics {
  return {
    requestBatchCount,
    completedRequestBatchCount: 0,
    transportAttemptCount: 0,
    providerReplyCount: 0,
    structuredResultCount: 0,
    retryCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    incompleteOutputCount: 0,
    batchCoverage: [],
    safeReasonCodes: [],
  };
}

function sumNumbers(values: readonly (number | null | undefined)[]): number {
  return values.reduce<number>((sum, value) => sum + (Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0), 0);
}

function boundedPositiveInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > maximum) throw new Error(`${label} must be a positive bounded integer.`);
  return Number(value);
}

function boundedNonNegativeInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new Error(`${label} must be a bounded non-negative integer.`);
  }
  return Number(value);
}

async function executeProviderReview(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  options: WholeStatementFeeIntelligenceRuntimeOptions,
  abortSignal: AbortSignal,
): Promise<unknown> {
  const attempts = providerAttempts(options);
  if (attempts.length === 0) {
    return {
      type: "whole_statement_fee_intelligence_review",
      reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
      reviewStatus: "disabled",
      evidenceRefs: [],
      factRefs: [],
      limitationCodes: ["whole_statement_fee_intelligence_review_required", "provider_unavailable"],
      rowInterpretations: [],
      reasonCodes: ["whole_statement_fee_intelligence_provider_unavailable"],
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    };
  }

  const sdk = options.sdk ?? loadAiSdk();
  let lastError: Error | null = null;
  for (const attempt of attempts) {
    const trace = createProviderTransportTrace(
      attempt.provider,
      attempt.provider === "openai" ? "ai_sdk_generate_text_structured_output" : "ai_sdk_generate_object_structured_output",
    );
    let operationPhase: SafeProviderFailureOperationPhase = "request_serialization";
    try {
      operationPhase = "request_serialization";
      const prompt = buildPrompt(packet);
      assertPromptWithinInputLimit(prompt, options.maxInputTokens);
      operationPhase = "request_construction";
      if (attempt.provider === "openai") {
        if (!sdk.generateText || !sdk.Output) throw new Error("Structured output unavailable.");
        const model = modelFor(attempt.provider, attempt.modelName, options, sdk, trace);
        operationPhase = "request_initiation";
        const result = await sdk.generateText({
          model,
          prompt,
          output: sdk.Output.object({
            schema: reviewResponseSchema(),
            name: "whole_statement_fee_intelligence_review",
            description: "Provider-neutral every-row fee semantic review.",
          }),
          abortSignal,
          maxOutputTokens: options.maxOutputTokens ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_OUTPUT_TOKENS ?? 5000),
          maxRetries: options.maxRetries,
        });
        if (result.finishReason !== undefined && result.finishReason !== "stop") {
          const usage = providerUsage(result, trace, false);
          options.onProviderUsage?.(usage);
          throw safeProviderFailureError(result, traceResponse(trace), providerFailureContext(operationPhase, trace));
        }
        const output = result.output;
        options.onProviderUsage?.(providerUsage(result, trace, output !== undefined));
        return output;
      }
      const model = modelFor(attempt.provider, attempt.modelName, options, sdk, trace);
      operationPhase = "request_initiation";
      const result = await sdk.generateObject({
        model,
        schema: reviewResponseSchema(),
        prompt,
        abortSignal,
        maxOutputTokens: options.maxOutputTokens ?? Number(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MAX_OUTPUT_TOKENS ?? 5000),
        maxRetries: options.maxRetries,
      });
      const output = result.object;
      options.onProviderUsage?.(providerUsage(result, trace, output !== undefined));
      return output;
    } catch (error) {
      lastError = error instanceof SafeProviderFailureError
        ? error
        : safeProviderFailureError(error, traceResponse(trace), providerFailureContext(operationPhase, trace));
    }
  }
  throw lastError ?? new Error("Whole-statement fee intelligence provider failed.");
}

function assertPromptWithinInputLimit(prompt: string, maximumInputTokens: number | undefined): void {
  if (maximumInputTokens === undefined) return;
  if (!Number.isInteger(maximumInputTokens) || maximumInputTokens <= 0) throw new Error("Whole-statement maximum input tokens must be a positive integer.");
  if (Buffer.byteLength(prompt, "utf8") > maximumInputTokens) throw new Error("Whole-statement prompt exceeds approved maximum input tokens.");
}

function providerUsage(
  result: ProviderResultMetadata,
  trace?: ProviderTransportTrace,
  structuredOutputReceived = false,
): WholeStatementFeeIntelligenceProviderUsage {
  const finishReason = safeCode(result.finishReason);
  const rawFinishReason = safeCode(result.rawFinishReason);
  const outputIncomplete = finishReason !== null && finishReason !== "stop";
  return {
    requestId: safeString(result.response?.id) ?? trace?.requestId ?? null,
    inputTokens: safeInteger(result.usage?.inputTokens),
    cachedInputTokens: safeInteger(result.usage?.inputTokenDetails?.cacheReadTokens ?? result.usage?.cachedInputTokens) ?? 0,
    outputTokens: safeInteger(result.usage?.outputTokens),
    localTraceId: trace?.localTraceId ?? null,
    httpStatus: trace?.httpStatus ?? null,
    httpSendInitiated: trace?.httpSendInitiated ?? false,
    providerResponseReceived: trace?.providerResponseReceived ?? false,
    finishReason,
    rawFinishReason,
    structuredOutputReceived,
    generationCompleted: finishReason === null || finishReason === "stop",
    outputIncomplete,
    transportAttemptCount: trace?.transportAttemptCount ?? 0,
    providerResponseCount: trace?.providerResponseCount ?? 0,
    retryCount: Math.max(0, (trace?.transportAttemptCount ?? 0) - 1),
    reasonCodes: [
      ...(finishReason ? [`provider_finish_reason_${finishReason}`] : []),
      ...(rawFinishReason ? [`provider_raw_finish_reason_${rawFinishReason}`] : []),
      structuredOutputReceived ? "provider_structured_output_received" : "provider_structured_output_not_received",
      outputIncomplete ? "provider_output_exhausted" : "provider_generation_completed",
    ],
  };
}

function safeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z0-9][a-z0-9_:-]{0,80}$/.test(normalized) ? normalized : null;
}

function buildPrompt(packet: CanonicalWholeStatementFeeIntelligencePacket): string {
  return serializeWholeStatementFeeIntelligenceProviderInput(packet);
}

function reviewResponseSchema(): unknown {
  const { z } = require("zod/v3") as { z: any };
  const interpretation = z
    .object({
      feeRowRef: z.string(),
      proposedCategory: z.enum([
        "interchange",
        "card_brand_network_assessment",
        "network_access_or_authorization",
        "processor_markup",
        "processor_per_item_fee",
        "administrative_fee",
        "service_fee",
        "compliance_fee",
        "equipment_or_lease",
        "third_party_product",
        "chargeback_or_dispute",
        "funding_adjustment",
        "tax_or_government",
        "credit",
        "unknown_needs_review",
      ]),
      likelyEconomicOwner: z.enum([
        "network",
        "card_brand",
        "issuer_or_interchange",
        "processor",
        "third_party",
        "merchant_contract",
        "tax_or_government",
        "unknown",
      ]),
      likelyContractualController: z.enum([
        "network",
        "card_brand",
        "issuer_or_interchange",
        "processor",
        "third_party",
        "merchant_contract",
        "tax_or_government",
        "unknown",
      ]),
      proposedActionabilityCeiling: z.enum(["potentially_actionable", "verify_only", "not_actionable", "unknown"]),
      confidence: z.enum(["high", "medium", "low"]),
      conciseRationale: z.string(),
      evidenceProvenance: z.enum([
        "statement_evidence",
        "approved_external_documentation",
        "runtime_verified_documentation",
        "industry_inference",
        "merchant_evidence",
        "human_review",
      ]),
      evidenceRefs: z.array(z.string()),
      externalSourceRef: z.string().nullable(),
      externalClaimSupportRef: z.string().nullable(),
      conflicts: z.array(z.string()),
      missingEvidence: z.array(z.string()),
      recommendedDisposition: z.enum(["supported", "insufficient_evidence", "conflicting_evidence", "human_review"]),
      authoritative: z.literal(false),
    })
    .strict();
  return z
    .object({
      type: z.literal("whole_statement_fee_intelligence_review"),
      reviewPolicyVersion: z.literal(WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION),
      reviewStatus: z.literal("completed"),
      evidenceRefs: z.array(z.string()),
      factRefs: z.array(z.string()),
      limitationCodes: z.array(
        z.enum([
          "full_statement_anomaly_review_required",
          "whole_statement_fee_intelligence_review_required",
          "material_fee_classification_review_required",
          "notice_change_review_required",
          "benchmark_category_review_required",
          "benchmark_category_not_verified",
          "ai_narrative_unavailable",
          "ai_output_rejected",
          "provider_unavailable",
          "deterministic_explanation_available",
        ]),
      ),
      rowInterpretations: z.array(interpretation),
      reasonCodes: z.array(z.string().regex(/^whole_statement_fee_intelligence_[a-z0-9_]{1,90}$/)),
      authoritative: z.literal(false),
      financialMutationAllowed: z.literal(false),
      providerDetailsStripped: z.literal(true),
    })
    .strict();
}

function loadAiSdk(): AiSdk {
  const ai = require("ai") as { generateObject: GenerateObject; generateText: GenerateText; Output: AiOutputFactory };
  const anthropicSdk = require("@ai-sdk/anthropic") as { createAnthropic: AiProviderFactoryCreator };
  const openAiSdk = require("@ai-sdk/openai") as { createOpenAI: AiProviderFactoryCreator };
  return {
    generateObject: ai.generateObject,
    generateText: ai.generateText,
    Output: ai.Output,
    createAnthropic: anthropicSdk.createAnthropic,
    createOpenAI: openAiSdk.createOpenAI,
  };
}

function runtimeEnabled(options: WholeStatementFeeIntelligenceRuntimeOptions): boolean {
  return options.enabled ?? /^(1|true|yes|on)$/i.test(process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_ENABLED ?? "");
}

function providerAttempts(options: WholeStatementFeeIntelligenceRuntimeOptions): Array<{ provider: RuntimeProvider; modelName: string }> {
  const preference = providerPreference(options);
  const providers: RuntimeProvider[] = preference === "auto" ? ["anthropic", "openai"] : [preference];
  return providers
    .filter((provider) => Boolean(providerApiKey(provider, options)))
    .map((provider) => ({ provider, modelName: modelNameForProvider(provider, options) }));
}

export function wholeStatementFeeIntelligenceRuntimeProviderSelection(
  options: WholeStatementFeeIntelligenceRuntimeOptions = {},
): WholeStatementFeeIntelligenceRuntimeProviderSelection {
  if (options.adapter) return { provider: "custom_adapter", model: null };
  const attempt = providerAttempts(options)[0];
  return attempt ? { provider: attempt.provider, model: attempt.modelName } : { provider: "none", model: null };
}

function providerPreference(options: WholeStatementFeeIntelligenceRuntimeOptions): RuntimeProviderPreference {
  const configured = options.provider ?? process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_PROVIDER ?? "auto";
  return configured === "anthropic" || configured === "openai" || configured === "auto" ? configured : "auto";
}

function providerApiKey(provider: RuntimeProvider, options: WholeStatementFeeIntelligenceRuntimeOptions): string | undefined {
  if (provider === "anthropic") return options.anthropicApiKey ?? options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  return options.openAiApiKey ?? options.apiKey ?? process.env.OPENAI_API_KEY;
}

function modelNameForProvider(provider: RuntimeProvider, options: WholeStatementFeeIntelligenceRuntimeOptions): string {
  const preference = providerPreference(options);
  if (provider === "openai") {
    if (options.openAiModelName) return options.openAiModelName;
    if (preference === "openai" && options.modelName) return options.modelName;
    return process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }
  if (options.anthropicModelName ?? options.modelName) return options.anthropicModelName ?? options.modelName ?? "claude-opus-4-8";
  return process.env.RATEREVEAL_WHOLE_STATEMENT_FEE_INTELLIGENCE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function modelFor(
  provider: RuntimeProvider,
  modelName: string,
  options: WholeStatementFeeIntelligenceRuntimeOptions,
  sdk: AiSdk,
  trace: ProviderTransportTrace,
): unknown {
  const key = providerApiKey(provider, options);
  if (provider === "anthropic") {
    const factory = key && sdk.createAnthropic ? sdk.createAnthropic({ apiKey: key }) : undefined;
    if (!factory) throw new Error("Anthropic model factory unavailable.");
    return factory(modelName);
  }
  const factory = key && sdk.createOpenAI ? sdk.createOpenAI({
    apiKey: key,
    headers: { "x-ratereveal-trace-id": trace.localTraceId },
    fetch: tracedProviderFetch(trace),
  }) : undefined;
  if (!factory) throw new Error("OpenAI model factory unavailable.");
  return factory(modelName);
}

function createProviderTransportTrace(
  provider: RuntimeProvider,
  transport: ProviderTransportTrace["transport"],
): ProviderTransportTrace {
  return {
    localTraceId: randomBytes(8).toString("hex"),
    provider,
    transport,
    httpSendInitiated: false,
    providerResponseReceived: false,
    httpStatus: null,
    requestId: null,
    transportAttemptCount: 0,
    providerResponseCount: 0,
  };
}

function tracedProviderFetch(trace: ProviderTransportTrace): AiProviderFetch {
  return async (input, init) => {
    trace.httpSendInitiated = true;
    trace.transportAttemptCount += 1;
    try {
      const response = await globalThis.fetch(input, init);
      trace.providerResponseReceived = true;
      trace.providerResponseCount += 1;
      trace.httpStatus = response.status;
      trace.requestId = safeString(response.headers.get("x-request-id")) ?? trace.requestId;
      return response;
    } catch (error) {
      throw error;
    }
  };
}

function providerFailureContext(
  operationPhase: SafeProviderFailureOperationPhase,
  trace: ProviderTransportTrace,
) {
  return {
    operationPhase: operationPhaseForFailure(operationPhase, trace),
    transport: trace.transport,
    localTraceId: trace.localTraceId,
    httpSendInitiated: trace.httpSendInitiated,
    providerResponseReceived: trace.providerResponseReceived,
    httpStatus: trace.httpStatus,
    requestId: trace.requestId,
    transportAttemptCount: trace.transportAttemptCount,
    providerResponseCount: trace.providerResponseCount,
  };
}

function traceResponse(trace: ProviderTransportTrace): { status?: unknown; headers?: unknown } | undefined {
  if (!trace.providerResponseReceived) return undefined;
  return {
    status: trace.httpStatus,
    headers: trace.requestId ? { "x-request-id": trace.requestId } : undefined,
  };
}

function operationPhaseForFailure(
  fallback: SafeProviderFailureOperationPhase,
  trace: ProviderTransportTrace,
): SafeProviderFailureOperationPhase {
  if (trace.providerResponseReceived && trace.httpStatus !== null && trace.httpStatus >= 400) return "provider_response";
  if (trace.providerResponseReceived) return "sdk_structured_output_handling";
  if (trace.httpSendInitiated) return "response_wait";
  return fallback;
}

async function withAbortTimeout<T>(operation: (abortSignal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const promise = operation(controller.signal);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  const timeoutError = new Error(`Whole-statement fee intelligence review timed out after ${timeoutMs}ms`);
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (settled) return;
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    settled = true;
    if (timer) clearTimeout(timer);
  }
}
