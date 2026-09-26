import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { createOrReplaceComparison, getAuthorizedStatementsForMerchant, persistStatementFromSummary } from "./accountStore.js";
import { customerFinancialsAuthorized, CUSTOMER_UNAVAILABLE_MESSAGE } from "./customerFinancialAuthority.js";
import { evaluatePhase2FeeForNewUpload, phase2FeeEnabled, type Phase2FeeAudit } from "./phase2FeeFact.js";
import type { AnalysisSummary } from "./types.js";
import { detectPreflightFailure } from "./preflight.js";
import {
  canonicalV2RgAuthorityTelemetry,
  isSupportedFiservAnalysis,
  shouldRunLegacyAiRefinement,
  supportedFiservLegacyAiContainmentTelemetry,
} from "./aiProviderAuthority.js";
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
    if (!job || job.status === "completed" || job.status === "fee_fact_available" || job.status === "failed") {
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

export async function processJob(jobId: string): Promise<void> {
  const queuedJob = getJob(jobId);
  if (!queuedJob || queuedJob.status === "completed" || queuedJob.status === "fee_fact_available" || queuedJob.status === "failed") return;
  const stageDelayMs = Number(process.env.STAGE_DELAY_MS ?? 0);

  try {
    const job = startJobAttempt(jobId);
    if (stageDelayMs > 0) await delay(stageDelayMs);

    const [{ parseCsv, parsePdfBytes }, { analyzeStatementDocumentWithOptionalAi }, { evaluateChecklistReport }] =
      await Promise.all([
        import("./parser.js"),
        import("./statementParserOrchestrator.js"),
        import("./checklistEngine.js"),
      ]);

    const pdfBytes = job.fileType === "pdf" ? Uint8Array.from(await readFile(job.filePath)) : null;
    const parsed = pdfBytes ? await parsePdfBytes(pdfBytes, jobId) : await parseCsv(job.filePath);
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

    const { executeDurableCanonicalAnalysisRun } = await import("./canonical/v2/runtime/analysisRunStore.js");
    const canonicalRun = executeDurableCanonicalAnalysisRun({
      jobId: job.id,
      sourceDocumentRef: `job_${job.id}`,
      document: parsed,
      sourceProfile: { statementCompleteness: "unknown" },
    });
    console.log(`[job:${jobId}] canonical-analysis-run`, {
      runId: canonicalRun.runId,
      status: canonicalRun.status,
      familyStatus: canonicalRun.familyStatus,
      driverId: canonicalRun.parser.driverId,
      supportedCapabilityCount: canonicalRun.capabilityProof?.capabilities
        .filter((capability) => capability.status === "supported").length ?? 0,
      stageStatus: Object.fromEntries(Object.entries(canonicalRun.stageOutcomes).map(([stage, outcome]) => [stage, outcome.status])),
    });
    try {
      const [{ executeDurableCanonicalAdaptiveLoop }, { createProductionRgEvidencePortsFromEnvironment }] = await Promise.all([
        import("./canonical/v2/runtime/adaptiveExecution.js"),
        import("./canonical/v2/runtime/rgLiveEvidencePorts.js"),
      ]);
      const rgPorts = createProductionRgEvidencePortsFromEnvironment(canonicalRun.runId);
      console.log(`[job:${jobId}] canonical-rg-runtime-readiness`, rgPorts.runtimeReadiness ?? {
        availability: rgPorts.availability,
        reasonCodes: rgPorts.unavailabilityReasonCodes,
      });
      const adaptive = await executeDurableCanonicalAdaptiveLoop({ runId: canonicalRun.runId, ports: rgPorts });
      const { enqueueCanonicalAnalysisRecovery } = await import("./canonical/v2/runtime/adaptiveRecoveryWorker.js");
      enqueueCanonicalAnalysisRecovery(canonicalRun.runId);
      const { enqueueCanonicalRgOperationReconciliation } = await import("./canonical/v2/runtime/rgOperationReconciliationWorker.js");
      enqueueCanonicalRgOperationReconciliation(canonicalRun.runId, rgPorts);
      console.log(`[job:${jobId}] canonical-adaptive-analysis`, {
        runId: canonicalRun.runId,
        lifecycle: adaptive.lifecycle,
        completion: adaptive.completion,
        controllerRevision: adaptive.controllerRevision,
        executionGeneration: adaptive.executionGeneration,
        continuationGrantCount: adaptive.executedGrantIds.length,
        providerCallsObserved: adaptive.providerCallsObserved,
        semanticRevision: adaptive.semanticRevision,
        financialFoundationPreserved: adaptive.financialFoundationPreserved,
        providerAuthority: canonicalV2RgAuthorityTelemetry(adaptive.providerCallsObserved),
      });
    } catch (error) {
      console.error(`[job:${jobId}] canonical-rg-evidence-degraded`, error instanceof Error ? error.message : error);
    }

    stageUpdate(jobId, "extracting_fee_line_items", 48, "Extracting fee line items");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    let summary = await analyzeStatementDocumentWithOptionalAi(parsed, job.businessType, { sourceFileName: job.fileName });
    let phase2FeeAudit: Phase2FeeAudit | null = null;
    if (pdfBytes && phase2FeeEnabled()) {
      try {
        phase2FeeAudit = evaluatePhase2FeeForNewUpload(parsed, pdfBytes);
      } catch (error) {
        console.warn(`[job:${jobId}] phase2-fee-proof-withheld`, error instanceof Error ? error.message : error);
      }
    }
    if (!customerFinancialsAuthorized(summary)) {
      // Retain the parser observation for internal audit. It cannot complete a
      // customer analysis, enter saved statements, or feed any comparison.
      const feeAvailable = phase2FeeAudit?.decision === "eligible";
      updateJob(jobId, { status: feeAvailable ? "fee_fact_available" : "failed",
        progress: 100, error: feeAvailable ? undefined : CUSTOMER_UNAVAILABLE_MESSAGE,
        summary, phase2FeeAudit, nextRunAt: null },
      feeAvailable ? "One verified statement fee fact available; full analysis unavailable"
        : "Statement requires review; financial output withheld");
      return;
    }
    if (isSupportedFiservAnalysis(summary)) {
      console.log(`[job:${jobId}] ai-provider-authority`, supportedFiservLegacyAiContainmentTelemetry());
    }
    console.log(`[job:${jobId}] deterministic-summary`, {
      businessType: job.businessType,
      processor: summary.processorName,
      totalVolume: summary.totalVolume,
      totalFees: summary.totalFees,
      effectiveRate: summary.effectiveRate,
      confidence: summary.confidence,
    });

    // Internal-only cutover. The adapter owns the F4 decision; legacy summary,
    // opportunity, persistence, and customer report paths do not consume it.
    if (process.env.RATEREVEAL_OBSERVED_FEE_COMPONENT_INTERNAL_ENABLED === "true") {
      try {
        const { buildCanonicalRuntimeAnalysis } = await import("./canonical/runtimeAdapter.js");
        const internal = buildCanonicalRuntimeAnalysis({
          document: parsed,
          businessType: job.businessType,
          runtimeDocumentRef: `job_${job.id}`,
        }).internalObservedFeeComponents;
        console.log(`[job:${jobId}] observed-fee-component-internal`, {
          status: internal.status,
          supportedCount: internal.rows.filter((row) => row.status === "supported").length,
          unknownCount: internal.rows.filter((row) => row.status === "unknown").length,
          legacyComparison: internal.legacyComparison,
        });
      } catch {
        // Internal semantic unavailability cannot affect the existing job result.
        console.warn(`[job:${jobId}] observed-fee-component-internal`, { status: "unavailable" });
      }
    }

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

    if (shouldRunLegacyAiRefinement(summary)) {
      summary = await runAiRefinement(summary);
    }
    try {
      const previousStatement =
        job.merchantId && job.statementSlot
          ? getAuthorizedStatementsForMerchant(job.merchantId)
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
        phase2FeeAudit,
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

export async function runAiRefinement(summary: AnalysisSummary) {
  if (!shouldRunLegacyAiRefinement(summary)) {
    return summary;
  }

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
