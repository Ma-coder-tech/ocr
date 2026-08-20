import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { createOrReplaceComparison, getStatementsForMerchant, persistStatementFromSummary } from "./accountStore.js";
import type { AnalysisSummary } from "./types.js";
import type { ParsedDocument } from "./parser.js";
import { detectPreflightFailure } from "./preflight.js";
import { buildProductionReportV2ForJob } from "./productionReportV2JobBridge.js";
import {
  failJob,
  appendJobCheckpoint,
  getJob,
  getNextQueuedJob,
  getNextQueuedJobDelayMs,
  listQueuedJobs,
  retryJobOrFail,
  requeueInterruptedJobs,
  stageUpdate,
  startJobAttempt,
  updateJob,
} from "./store.js";
import {
  emitRuntimeProgress,
  runtimeProgressFailureReason,
  runtimeProgressFailureStatus,
  type RuntimeProgressReporter,
} from "./runtimeProgress.js";

const queue = new Set<string>();
let busy = false;
let tickScheduled = false;
let delayedTick: ReturnType<typeof setTimeout> | null = null;
let delayedTickAt = 0;

function scheduleTick(): void {
  if (delayedTick) {
    clearTimeout(delayedTick);
    delayedTick = null;
    delayedTickAt = 0;
  }
  if (tickScheduled) return;
  tickScheduled = true;
  setTimeout(() => {
    tickScheduled = false;
    void tick();
  }, 0);
}

function scheduleTickAfter(delayMs: number): void {
  const boundedDelayMs = Math.max(0, delayMs);
  if (boundedDelayMs === 0) {
    scheduleTick();
    return;
  }
  const targetAt = Date.now() + boundedDelayMs;
  if (delayedTick && delayedTickAt <= targetAt) return;
  if (delayedTick) {
    clearTimeout(delayedTick);
  }
  delayedTickAt = targetAt;
  delayedTick = setTimeout(() => {
    delayedTick = null;
    delayedTickAt = 0;
    scheduleTick();
  }, boundedDelayMs);
  delayedTick.unref?.();
}

export function enqueueJob(jobId: string): void {
  queue.add(jobId);
  scheduleTick();
}

export function hydrateQueuedJobs(): void {
  requeueInterruptedJobs();
  for (const job of listQueuedJobs()) {
    queue.add(job.id);
  }
  scheduleTick();
}

async function tick(): Promise<void> {
  if (busy) return;
  let nextQueued: string | undefined;
  const now = Date.now();
  for (const candidate of queue) {
    const job = getJob(candidate);
    if (!job || job.status === "completed" || job.status === "failed") {
      queue.delete(candidate);
      continue;
    }
    if (job.status === "queued" && job.nextRunAt && new Date(job.nextRunAt).getTime() > now) {
      queue.delete(candidate);
      continue;
    }
    nextQueued = candidate;
    break;
  }
  const fallback = nextQueued ?? getNextQueuedJob()?.id;
  if (!fallback) {
    const nextDelayMs = getNextQueuedJobDelayMs();
    if (nextDelayMs !== null) {
      scheduleTickAfter(nextDelayMs);
    }
    return;
  }
  queue.delete(fallback);

  busy = true;
  try {
    await processJob(fallback);
  } finally {
    busy = false;
    void tick();
  }
}

export async function processJob(jobId: string, options: { scheduleRetry?: boolean } = {}): Promise<void> {
  const queuedJob = getJob(jobId);
  if (!queuedJob || queuedJob.status === "completed" || queuedJob.status === "failed") return;
  const stageDelayMs = Number(process.env.STAGE_DELAY_MS ?? 0);
  const executionId = `runtime_${randomUUID().replaceAll("-", "")}`;
  const attemptCount = queuedJob.attemptCount + 1;
  const progressReporter: RuntimeProgressReporter = (event) => {
    appendJobCheckpoint(jobId, { attemptCount, executionId, event });
  };

  try {
    const job = startJobAttempt(jobId);
    const jobStartedAt = Date.now();
    await emitRuntimeProgress(progressReporter, {
      stage: "queued",
      status: "completed",
      elapsedMs: 0,
    });
    if (stageDelayMs > 0) await delay(stageDelayMs);

    const [{ parseCsv, parsePdf }, { analyzeStatementDocumentWithOptionalAi }, { evaluateChecklistReport }] =
      await Promise.all([
        import("./parser.js"),
        import("./statementParserOrchestrator.js"),
        import("./checklistEngine.js"),
      ]);

    const parserStartedAt = Date.now();
    await emitRuntimeProgress(progressReporter, { stage: "parser", status: "running" });
    let parsed: ParsedDocument;
    try {
      parsed = job.fileType === "csv" ? await parseCsv(job.filePath) : await parsePdf(job.filePath, jobId);
      await emitRuntimeProgress(progressReporter, {
        stage: "parser",
        status: "completed",
        elapsedMs: Math.max(0, Date.now() - parserStartedAt),
      });
    } catch (error) {
      await emitRuntimeProgress(progressReporter, {
        stage: "parser",
        status: runtimeProgressFailureStatus(error),
        elapsedMs: Math.max(0, Date.now() - parserStartedAt),
        reasonCodes: [runtimeProgressFailureReason(error, "parser")],
      });
      throw error;
    }
    logSafeStageDuration(jobId, "pdf_parser", parserStartedAt);
    console.log(`[job:${jobId}] parsed`, {
      fileType: job.fileType,
      headers: parsed.headers.slice(0, 8),
      rowCount: parsed.rows.length,
      extractionMode: parsed.extraction.mode,
      extractionQualityScore: parsed.extraction.qualityScore,
    });

    if (job.fileType === "pdf" && parsed.extraction.mode === "unusable") {
      await failJobWithProductionReportRecovery({
        jobId,
        document: parsed,
        businessType: job.businessType,
        legacySummary: null,
        progressReporter,
        error:
          "This PDF appears to be a scanned image. Please upload a text-based PDF exported directly from your processor's portal. Most processors provide downloadable PDF statements that are text-based.",
      });
      return;
    }

    const preflightFailure = detectPreflightFailure(parsed);
    if (preflightFailure) {
      await failJobWithProductionReportRecovery({
        jobId,
        document: parsed,
        businessType: job.businessType,
        legacySummary: null,
        progressReporter,
        error: preflightFailure,
      });
      return;
    }

    stageUpdate(jobId, "identifying_processor", 28, "Identifying your processor");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    stageUpdate(jobId, "extracting_fee_line_items", 48, "Extracting fee line items");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    const optionalLegacyStartedAt = Date.now();
    await emitRuntimeProgress(progressReporter, { stage: "deterministic_analysis", status: "running" });
    let summary: AnalysisSummary;
    try {
      summary = await analyzeStatementDocumentWithOptionalAi(parsed, job.businessType, { sourceFileName: job.fileName });
      await emitRuntimeProgress(progressReporter, {
        stage: "deterministic_analysis",
        status: "completed",
        elapsedMs: Math.max(0, Date.now() - optionalLegacyStartedAt),
      });
    } catch (error) {
      await emitRuntimeProgress(progressReporter, {
        stage: "deterministic_analysis",
        status: runtimeProgressFailureStatus(error),
        elapsedMs: Math.max(0, Date.now() - optionalLegacyStartedAt),
        reasonCodes: [runtimeProgressFailureReason(error, "deterministic_analysis")],
      });
      throw error;
    }
    logSafeStageDuration(jobId, "optional_legacy_processing", optionalLegacyStartedAt);
    console.log(`[job:${jobId}] deterministic-summary`, {
      businessType: job.businessType,
      processor: summary.processorName,
      totalVolume: summary.totalVolume,
      totalFees: summary.totalFees,
      effectiveRate: summary.effectiveRate,
      confidence: summary.confidence,
    });

    if (summary.totalVolume <= 0) {
      await failJobWithProductionReportRecovery({
        jobId,
        document: parsed,
        businessType: job.businessType,
        legacySummary: summary,
        progressReporter,
        error: "We could not find your total processing volume.",
      });
      return;
    }

    if (summary.totalFees <= 0) {
      await failJobWithProductionReportRecovery({
        jobId,
        document: parsed,
        businessType: job.businessType,
        legacySummary: summary,
        progressReporter,
        error: "We could not find your total fees.",
      });
      return;
    }

    stageUpdate(jobId, "calculating_effective_rate", 72, "Calculating your effective rate");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    summary = await runAiRefinement(summary);
    try {
      const previousStatement =
        job.merchantId && job.statementSlot
          ? getStatementsForMerchant(job.merchantId)
              .filter((statement) => statement.slot < job.statementSlot!)
              .sort((left, right) => right.slot - left.slot)[0] ?? null
          : null;
      const checklistReport = await evaluateChecklistReport(parsed, summary, {
        previousSummary: previousStatement?.analysisSummary ?? null,
      });
      summary = { ...summary, checklistReport };
      console.log(`[job:${jobId}] checklist-report`, {
        universal: {
          total: checklistReport.universal.total,
          fail: checklistReport.universal.fail,
          warning: checklistReport.universal.warning,
        },
        processorSpecific: {
          processor: checklistReport.processorSpecific.processorName,
          total: checklistReport.processorSpecific.total,
          fail: checklistReport.processorSpecific.fail,
          warning: checklistReport.processorSpecific.warning,
        },
        crossProcessor: {
          total: checklistReport.crossProcessor.total,
          fail: checklistReport.crossProcessor.fail,
          warning: checklistReport.crossProcessor.warning,
        },
      });
    } catch (error) {
      console.error(`[job:${jobId}] checklist-report-skip`, error instanceof Error ? error.message : error);
      summary = {
        ...summary,
        dataQuality: [
          ...summary.dataQuality,
          {
            level: "warning",
            message:
              "Universal/processor checklist evaluation could not be completed due to a rule-pack loading issue.",
          },
        ],
      };
    }

    const productionRuntimeStartedAt = Date.now();
    const productionReportV2 = await buildProductionReportV2ForJob({
      jobId: job.id,
      document: parsed,
      legacySummary: summary,
      businessType: job.businessType,
      progressReporter,
    });
    if (productionReportV2) {
      const persistenceStartedAt = Date.now();
      await emitRuntimeProgress(progressReporter, { stage: "persistence", status: "running" });
      try {
        updateJob(jobId, { productionReportV2 }, "Production report ready");
      } catch (error) {
        await emitRuntimeProgress(progressReporter, {
          stage: "persistence",
          status: runtimeProgressFailureStatus(error),
          elapsedMs: Math.max(0, Date.now() - persistenceStartedAt),
          reasonCodes: [runtimeProgressFailureReason(error, "projection_persistence")],
        });
        throw error;
      }
      await emitRuntimeProgress(progressReporter, {
        stage: "persistence",
        status: "completed",
        elapsedMs: Math.max(0, Date.now() - persistenceStartedAt),
        counters: { projectionCount: 1 },
      });
      logSafeStageDuration(jobId, "production_projection_persistence", persistenceStartedAt);
    } else {
      await maybeRunCanonicalRuntimeShadow({
        jobId: job.id,
        parsed,
        summary,
        businessType: job.businessType,
      });
    }

    stageUpdate(jobId, "comparing_to_benchmark", 90, "Comparing to your business benchmark");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    if (job.merchantId && job.statementSlot) {
      persistStatementFromSummary({
        merchantId: job.merchantId,
        slot: job.statementSlot,
        replaceStatementId: job.replaceStatementId ?? null,
        summary,
        sourceJobId: job.id,
        preferredPeriodKey: job.detectedStatementPeriod ?? undefined,
      });

      if (job.statementSlot === 2) {
        createOrReplaceComparison(job.merchantId);
      }
    }

    updateJob(
      jobId,
      {
        status: "completed",
        progress: 100,
        summary,
      },
      "Report ready",
    );
    await emitRuntimeProgress(progressReporter, {
      stage: "terminal",
      status: "completed",
      elapsedMs: Math.max(0, Date.now() - jobStartedAt),
      counters: { projectionCount: productionReportV2 ? 1 : 0 },
    });
    logSafeStageDuration(jobId, "total_job_completion", jobStartedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    const retry = retryJobOrFail(jobId, message);
    await emitRuntimeProgress(progressReporter, retry.retrying
      ? {
          stage: "queued",
          status: "waiting",
          reasonCodes: ["analysis_retry_scheduled"],
        }
      : {
          stage: "terminal",
          status: runtimeProgressFailureStatus(error),
          reasonCodes: [runtimeProgressFailureReason(error, "analysis")],
        });
    if (retry.retrying && options.scheduleRetry !== false) {
      scheduleTickAfter(retry.delayMs);
    }
  }
}

export async function processJobUntilTerminal(jobId: string): Promise<void> {
  while (true) {
    await processJob(jobId, { scheduleRetry: false });
    const current = getJob(jobId);
    if (!current || current.status === "completed" || current.status === "failed") return;
    const nextRunAt = current.nextRunAt ? new Date(current.nextRunAt).getTime() : Date.now();
    await delay(Math.max(0, nextRunAt - Date.now()));
  }
}

function logSafeStageDuration(jobId: string, stage: string, startedAt: number): void {
  console.info(`[job:${jobId}] package-4-stage-diagnostics`, JSON.stringify({
    stage,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  }));
}

async function failJobWithProductionReportRecovery(input: {
  jobId: string;
  document: ParsedDocument;
  businessType: AnalysisSummary["businessType"];
  legacySummary: AnalysisSummary | null;
  error: string;
  progressReporter?: RuntimeProgressReporter;
}): Promise<void> {
  const projection = await buildProductionReportV2ForJob({
    jobId: input.jobId,
    document: input.document,
    businessType: input.businessType,
    legacySummary: input.legacySummary,
    progressReporter: input.progressReporter,
  });
  if (projection?.experience === "unable_to_complete") {
    const persistenceStartedAt = Date.now();
    await emitRuntimeProgress(input.progressReporter, { stage: "persistence", status: "running" });
    try {
      updateJob(input.jobId, { productionReportV2: projection }, "Safe recovery report ready");
    } catch (error) {
      await emitRuntimeProgress(input.progressReporter, {
        stage: "persistence",
        status: runtimeProgressFailureStatus(error),
        elapsedMs: Math.max(0, Date.now() - persistenceStartedAt),
        reasonCodes: [runtimeProgressFailureReason(error, "recovery_projection_persistence")],
      });
      throw error;
    }
    await emitRuntimeProgress(input.progressReporter, {
      stage: "persistence",
      status: "completed",
      elapsedMs: Math.max(0, Date.now() - persistenceStartedAt),
      counters: { projectionCount: 1 },
    });
  }
  failJob(input.jobId, input.error);
  await emitRuntimeProgress(input.progressReporter, {
    stage: "terminal",
    status: "failed",
    counters: { projectionCount: projection?.experience === "unable_to_complete" ? 1 : 0 },
    reasonCodes: ["analysis_preflight_failed"],
  });
}

async function runAiRefinement(summary: AnalysisSummary) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return summary;
  }

  const importTimeoutMs = Number(process.env.AI_IMPORT_TIMEOUT_MS ?? 4000);
  const refinementTimeoutMs = Number(process.env.AI_REFINEMENT_TIMEOUT_MS ?? 8000);

  try {
    const modulePromise = import("./aiFallback.js");
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`AI refinement module import timed out after ${importTimeoutMs}ms`));
      }, importTimeoutMs);
    });

    const module = (await Promise.race([modulePromise, timeoutPromise])) as typeof import("./aiFallback.js");
    return await new Promise<AnalysisSummary>((resolve) => {
      const timer = setTimeout(() => {
        console.error(`[ai-refinement-skip] AI refinement timed out after ${refinementTimeoutMs}ms`);
        resolve(summary);
      }, refinementTimeoutMs);

      module
        .maybeRunAiRefinement(summary)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          console.error("[ai-refinement-skip]", error instanceof Error ? error.message : error);
          resolve(summary);
        });
    });
  } catch (error) {
    console.error("[ai-refinement-skip]", error instanceof Error ? error.message : error);
    return summary;
  }
}

export async function maybeRunCanonicalRuntimeShadow(input: {
  jobId: string;
  parsed: ParsedDocument;
  summary: AnalysisSummary;
  businessType: AnalysisSummary["businessType"];
}): Promise<void> {
  if (process.env.RATEREVEAL_CANONICAL_SHADOW_ENABLED !== "true") return;
  try {
    const { runCanonicalRuntimeShadow } = await import("./canonical/runtimeShadow.js");
    await runCanonicalRuntimeShadow({
      document: input.parsed,
      summary: input.summary,
      businessType: input.businessType,
      runtimeDocumentRef: `job_${input.jobId}`,
    });
  } catch {
    return;
  }
}
