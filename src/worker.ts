import { setTimeout as delay } from "node:timers/promises";
import { analyzeDocument } from "./analyzer.js";
import { evaluateChecklistReport } from "./checklistEngine.js";
import { parseCsv, parsePdf } from "./parser.js";
import { refineTextOnlyPdfSummary } from "./pdfHeuristic.js";
import { failJob, getJob, stageUpdate, updateJob } from "./store.js";

const queue: string[] = [];
let busy = false;

export function enqueueJob(jobId: string): void {
  queue.push(jobId);
  void tick();
}

async function tick(): Promise<void> {
  if (busy) return;
  const jobId = queue.shift();
  if (!jobId) return;

  busy = true;
  try {
    await processJob(jobId);
  } finally {
    busy = false;
    void tick();
  }
}

async function processJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;
  const stageDelayMs = Number(process.env.STAGE_DELAY_MS ?? 0);

  try {
    stageUpdate(jobId, "analyzing", 10, "Analyzing your data");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    const parsed = job.fileType === "csv" ? await parseCsv(job.filePath) : await parsePdf(job.filePath);
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
        "PDF preflight failed: no extractable text was found (likely scanned/image-only). Upload a searchable PDF or CSV export.",
      );
      return;
    }

    stageUpdate(jobId, "classifying", 38, "Classifying your data");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    let summary = analyzeDocument(parsed);
    if (job.fileType === "pdf" && parsed.extraction.mode === "text_only") {
      const recoveredSummary = refineTextOnlyPdfSummary(parsed, summary);
      if (recoveredSummary) {
        summary = recoveredSummary;
        console.log(`[job:${jobId}] pdf-text-recovery`, {
          totalVolume: summary.totalVolume,
          totalFees: summary.totalFees,
          effectiveRate: summary.effectiveRate,
        });
      }
    }
    console.log(`[job:${jobId}] deterministic-summary`, {
      processor: summary.processorName,
      totalVolume: summary.totalVolume,
      totalFees: summary.totalFees,
      effectiveRate: summary.effectiveRate,
      confidence: summary.confidence,
    });

    stageUpdate(jobId, "calculating", 68, "Calculating fees and hidden costs");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    summary = await runAiRefinement(summary);
    try {
      const checklistReport = await evaluateChecklistReport(parsed, summary);
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

    stageUpdate(jobId, "generating_report", 90, "Preparing your report");
    if (stageDelayMs > 0) await delay(stageDelayMs);

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
    failJob(jobId, message);
  }
}

async function runAiRefinement(summary: Awaited<ReturnType<typeof analyzeDocument>>) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return summary;
  }

  const importTimeoutMs = Number(process.env.AI_IMPORT_TIMEOUT_MS ?? 4000);

  try {
    const modulePromise = import("./aiFallback.js");
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`AI refinement module import timed out after ${importTimeoutMs}ms`));
      }, importTimeoutMs);
    });

    const module = (await Promise.race([modulePromise, timeoutPromise])) as typeof import("./aiFallback.js");
    return await module.maybeRunAiRefinement(summary);
  } catch (error) {
    console.error("[ai-refinement-skip]", error instanceof Error ? error.message : error);
    return summary;
  }
}
