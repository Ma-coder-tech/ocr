import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { analyzeDocument } from "./analyzer.js";
import { maybeRunAiRefinement } from "./aiFallback.js";
import { parseCsv, parsePdf } from "./parser.js";
import { buildReportPdf } from "./report.js";
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
    });

    stageUpdate(jobId, "classifying", 38, "Classifying your data");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    let summary = analyzeDocument(parsed);
    console.log(`[job:${jobId}] deterministic-summary`, {
      processor: summary.processorName,
      totalVolume: summary.totalVolume,
      totalFees: summary.totalFees,
      effectiveRate: summary.effectiveRate,
      confidence: summary.confidence,
    });

    stageUpdate(jobId, "calculating", 68, "Calculating fees and hidden costs");
    if (stageDelayMs > 0) await delay(stageDelayMs);

    summary = await maybeRunAiRefinement(summary);

    stageUpdate(jobId, "generating_report", 90, "Generating your report");
    const reportDir = process.env.VERCEL ? path.join("/tmp", "ocr-data", "reports") : path.resolve("data/reports");
    const reportPath = await buildReportPdf(reportDir, jobId, summary);

    updateJob(
      jobId,
      {
        status: "completed",
        progress: 100,
        reportPath,
        summary,
      },
      "Report ready for download",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    failJob(jobId, message);
  }
}
