import { setTimeout as delay } from "node:timers/promises";
import { createOrReplaceComparison, getStatementsForMerchant, persistStatementFromSummary } from "./accountStore.js";
import type { AnalysisSummary } from "./types.js";
import type { ParsedDocument } from "./parser.js";
import { detectPreflightFailure } from "./preflight.js";
import {
  failJob,
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

async function processJob(jobId: string): Promise<void> {
  const queuedJob = getJob(jobId);
  if (!queuedJob || queuedJob.status === "completed" || queuedJob.status === "failed") return;
  const stageDelayMs = Number(process.env.STAGE_DELAY_MS ?? 0);

  try {
    const job = startJobAttempt(jobId);
    if (stageDelayMs > 0) await delay(stageDelayMs);

    const [{ parseCsv, parsePdf }, { analyzeDocument }, { evaluateChecklistReport }] =
      await Promise.all([
        import("./parser.js"),
        import("./analyzer.js"),
        import("./checklistEngine.js"),
      ]);

    const parsed = job.fileType === "csv" ? await parseCsv(job.filePath) : await parsePdf(job.filePath, jobId);
    console.log(`[job:${jobId}] parsed`, {
      fileType: job.fileType,
      headers: parsed.headers.slice(0, 8),
      rowCount: parsed.rows.length,
      extractionMode: parsed.extraction.mode,
      extractionQualityScore: parsed.extraction.qualityScore,
    });

    if (job.fileType === "pdf" && parsed.extraction.mode === "unusable") {
      failJob(
        jobId,
        "This PDF appears to be a scanned image. Please upload a text-based PDF exported directly from your processor's portal. Most processors provide downloadable PDF statements that are text-based.",
      );
      return;
    }

    const preflightFailure = detectPreflightFailure(parsed);
    if (preflightFailure) {
      failJob(jobId, preflightFailure);
      return;
    }

    stageUpdate(jobId, "identifying_processor", 28, "Identifying your processor");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    stageUpdate(jobId, "extracting_fee_line_items", 48, "Extracting fee line items");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    let summary = analyzeDocument(parsed, job.businessType);
    console.log(`[job:${jobId}] deterministic-summary`, {
      businessType: job.businessType,
      processor: summary.processorName,
      totalVolume: summary.totalVolume,
      totalFees: summary.totalFees,
      effectiveRate: summary.effectiveRate,
      confidence: summary.confidence,
    });

    if (summary.totalVolume <= 0) {
      failJob(jobId, "We could not find your total processing volume.");
      return;
    }

    if (summary.totalFees <= 0) {
      failJob(jobId, "We could not find your total fees.");
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    const retry = retryJobOrFail(jobId, message);
    if (retry.retrying) {
      scheduleTickAfter(retry.delayMs);
    }
  }
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
