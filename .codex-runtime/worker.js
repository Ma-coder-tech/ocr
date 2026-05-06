import { setTimeout as delay } from "node:timers/promises";
import { failJob, getJob, stageUpdate, updateJob } from "./store.js";
const queue = [];
let busy = false;
function getTextCorpusPreview(parsed) {
    const rowPreview = parsed.rows
        .slice(0, 240)
        .map((row) => (typeof row.content === "string" ? row.content : Object.values(row).join(" ")))
        .join(" ")
        .toLowerCase();
    return `${parsed.textPreview} ${rowPreview}`.toLowerCase();
}
function detectPreflightFailure(parsed) {
    const corpus = getTextCorpusPreview(parsed);
    const bankSignals = [
        "beginning balance",
        "ending balance",
        "available balance",
        "withdrawals",
        "deposits and additions",
        "checks paid",
        "account summary",
        "statement balance",
    ];
    const processorSignals = [
        "interchange",
        "markup",
        "assessment",
        "dues",
        "processing fee",
        "fees charged",
        "merchant statement",
        "payment processing",
        "card processing",
        "pci",
        "service charge",
    ];
    const bankHits = bankSignals.filter((term) => corpus.includes(term)).length;
    const processorHits = processorSignals.filter((term) => corpus.includes(term)).length;
    if (bankHits >= 2 && processorHits < 2) {
        return "This looks like a bank statement, not a processor statement. Your processor statement comes from your processor's merchant portal and shows fees like interchange, markup, and card brand charges.";
    }
    if (processorHits === 0 && parsed.extraction.amountTokenCount < 8) {
        return "We couldn't find payment fee data in this file. Please make sure you're uploading a monthly merchant statement from your payment processor — not an invoice, contract, or bank statement.";
    }
    return null;
}
export function enqueueJob(jobId) {
    queue.push(jobId);
    void tick();
}
async function tick() {
    if (busy)
        return;
    const jobId = queue.shift();
    if (!jobId)
        return;
    busy = true;
    try {
        await processJob(jobId);
    }
    finally {
        busy = false;
        void tick();
    }
}
async function processJob(jobId) {
    const job = getJob(jobId);
    if (!job)
        return;
    const stageDelayMs = Number(process.env.STAGE_DELAY_MS ?? 0);
    try {
        stageUpdate(jobId, "verifying_statement", 10, "Verifying statement format");
        if (stageDelayMs > 0)
            await delay(stageDelayMs);
        const [{ parseCsv, parsePdf }, { analyzeDocument }, { refineTextOnlyPdfSummary }, { evaluateChecklistReport }] = await Promise.all([
            import("./parser.js"),
            import("./analyzer.js"),
            import("./pdfHeuristic.js"),
            import("./checklistEngine.js"),
        ]);
        const parsed = job.fileType === "csv" ? await parseCsv(job.filePath) : await parsePdf(job.filePath);
        console.log(`[job:${jobId}] parsed`, {
            fileType: job.fileType,
            headers: parsed.headers.slice(0, 8),
            rowCount: parsed.rows.length,
            extractionMode: parsed.extraction.mode,
            extractionQualityScore: parsed.extraction.qualityScore,
        });
        if (job.fileType === "pdf" && parsed.extraction.mode === "unusable") {
            failJob(jobId, "This PDF appears to be a scanned image. Please upload a text-based PDF exported directly from your processor's portal. Most processors provide downloadable PDF statements that are text-based.");
            return;
        }
        const preflightFailure = detectPreflightFailure(parsed);
        if (preflightFailure) {
            failJob(jobId, preflightFailure);
            return;
        }
        stageUpdate(jobId, "identifying_processor", 28, "Identifying your processor");
        if (stageDelayMs > 0)
            await delay(stageDelayMs);
        stageUpdate(jobId, "extracting_fee_line_items", 48, "Extracting fee line items");
        if (stageDelayMs > 0)
            await delay(stageDelayMs);
        let summary = analyzeDocument(parsed, job.businessType);
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
        if (stageDelayMs > 0)
            await delay(stageDelayMs);
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
        }
        catch (error) {
            console.error(`[job:${jobId}] checklist-report-skip`, error instanceof Error ? error.message : error);
            summary = {
                ...summary,
                dataQuality: [
                    ...summary.dataQuality,
                    {
                        level: "warning",
                        message: "Universal/processor checklist evaluation could not be completed due to a rule-pack loading issue.",
                    },
                ],
            };
        }
        stageUpdate(jobId, "comparing_to_benchmark", 90, "Comparing to your business benchmark");
        if (stageDelayMs > 0)
            await delay(stageDelayMs);
        updateJob(jobId, {
            status: "completed",
            progress: 100,
            summary,
        }, "Report ready");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown processing error";
        failJob(jobId, message);
    }
}
async function runAiRefinement(summary) {
    if (!process.env.ANTHROPIC_API_KEY) {
        return summary;
    }
    const importTimeoutMs = Number(process.env.AI_IMPORT_TIMEOUT_MS ?? 4000);
    try {
        const modulePromise = import("./aiFallback.js");
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`AI refinement module import timed out after ${importTimeoutMs}ms`));
            }, importTimeoutMs);
        });
        const module = (await Promise.race([modulePromise, timeoutPromise]));
        return await module.maybeRunAiRefinement(summary);
    }
    catch (error) {
        console.error("[ai-refinement-skip]", error instanceof Error ? error.message : error);
        return summary;
    }
}
