import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

import type { BusinessTypeId } from "../src/businessTypes.js";

const outDir = path.join(
  process.cwd(),
  "test",
  "fixtures",
  "multi-statement",
  "pepe-orchestrator-integration",
);

process.env.FEECLEAR_DB_PATH ??= path.join(outDir, "pepe-orchestrator.sqlite");
process.env.AI_FEE_CLASSIFICATION_ENABLED ??= "true";
process.env.AI_MULTI_STATEMENT_NARRATIVE_ENABLED ??= "true";
process.env.AI_MULTI_STATEMENT_NARRATIVE_PROVIDER ??= "auto";
process.env.AI_MULTI_STATEMENT_NARRATIVE_TIMEOUT_MS ??= "60000";

const pdfs = [
  {
    originalFileName: "Nov_2024_Statement.pdf",
    filePath: path.resolve(process.cwd(), "test", "fixtures", "pdfs", "Nov_2024_Statement.pdf"),
  },
  {
    originalFileName: "Dec_2024_Statement.pdf",
    filePath: "/Users/martialmahougnonamoussou/Downloads/Dec_2024_Statement.pdf",
  },
];

await fs.mkdir(outDir, { recursive: true });

const [{ runMultiStatementAnalysis }, store] = await Promise.all([
  import("../src/multiStatementOrchestrator.js"),
  import("../src/multiStatementStore.js"),
]);
const { renderMultiStatementGlobalReportMarkdown } = await import("../src/reporting/buildMultiStatement.js");

const files = await Promise.all(
  pdfs.map(async (pdf) => {
    const stat = await fs.stat(pdf.filePath);
    return {
      originalFileName: pdf.originalFileName,
      filePath: pdf.filePath,
      fileSize: stat.size,
    };
  }),
);

const result = await runMultiStatementAnalysis({
  businessType: "restaurant_food_beverage" as BusinessTypeId,
  files,
  pipelineVersion: "real-pipeline-pepe-nov-dec-2024",
  adapterVersion: "comparison-input-v1",
  comparisonEngineVersion: "comparison-engine-v1",
  reportVersion: "global-report-v1",
  narrative: {
    enabled: true,
    provider: (process.env.AI_MULTI_STATEMENT_NARRATIVE_PROVIDER as "auto" | "openai" | "anthropic" | undefined) ?? "auto",
    timeoutMs: Number(process.env.AI_MULTI_STATEMENT_NARRATIVE_TIMEOUT_MS ?? 60000),
  },
});

const job = store.getMultiStatementJob(result.jobId);
const jobFiles = store.listMultiStatementJobFiles(result.jobId);
const comparisonInputs = store.getComparisonInputsForJob(result.jobId);
const analysis = store.getLatestMultiStatementAnalysisForJob(result.jobId);
const storedReport = store.getLatestMultiStatementReportForJob(result.jobId);
const events = store.listMultiStatementJobEvents(result.jobId);
const report = storedReport?.report ?? null;

assert(job?.status === "completed", `Expected completed job, got ${job?.status ?? "missing"}.`);
assert(jobFiles.length === 2, `Expected 2 job files, got ${jobFiles.length}.`);
assert(
  jobFiles.every((file) => file.status === "completed"),
  `Expected both files completed, got ${jobFiles.map((file) => `${file.originalFileName}:${file.status}`).join(", ")}.`,
);
assert(report !== null, "Expected stored global report.");
assert(
  normalize(report!.executiveSummary.merchantName) === "PEPES MEXICAN RESTURANT",
  `Expected PEPES MEXICAN RESTURANT, got ${report!.executiveSummary.merchantName}.`,
);
assert(
  report!.executiveSummary.isoName === "Clover / First Data",
  `Expected Clover / First Data, got ${report!.executiveSummary.isoName}.`,
);
assert(comparisonInputs.length === 2, `Expected 2 comparison inputs, got ${comparisonInputs.length}.`);
assert(Boolean(analysis), "Expected stored MultiStatementAnalysis.");
assert(Boolean(storedReport), "Expected stored report record.");
assert(
  storedReport?.narrativeStatus === "applied",
  `Expected applied narrative, got ${storedReport?.narrativeStatus ?? "missing"}.`,
);
assert(
  Array.isArray(report!.masterNarrative) && report!.masterNarrative.length >= 4,
  "Expected stored narrative paragraphs.",
);
assert(
  /PCI|MANAGED SECURITY NON VALIDATED/i.test(report!.topFindings[0]?.title ?? ""),
  `Expected PCI/security finding first, got ${report!.topFindings[0]?.title ?? "missing"}.`,
);
assert(
  report!.topFindings.some((finding) => /ACCESS FEE/i.test(finding.title)),
  "Expected ACCESS FEE as a standalone top finding.",
);
assert(
  report!.executiveSummary.benchmark.status !== "not_available",
  "Expected benchmark status in executive summary.",
);
assert(
  Number(report!.cumulativeSavings.projectedAnnualIfUnchanged.estimated) > 0,
  "Expected cumulative savings above $0.",
);
assert(
  report!.feeChangeTimeline.length === 0,
  `Expected no fee change timeline noise, got ${report!.feeChangeTimeline.length} item(s).`,
);
assert(
  !/\b(I|me|my)\b/i.test(report!.masterNarrative.join("\n")),
  "Expected narrative without first-person language.",
);

const reportMarkdown = storedReport!.reportMarkdown ?? renderMultiStatementGlobalReportMarkdown(report!);
const summary = {
  dbPath: process.env.FEECLEAR_DB_PATH,
  outDir,
  jobId: result.jobId,
  jobStatus: job!.status,
  fileStatuses: jobFiles.map((file) => ({
    fileName: file.originalFileName,
    status: file.status,
    period: file.detectedPeriod,
    merchantName: file.detectedMerchantName,
    isoName: file.detectedIso,
  })),
  storedArtifacts: {
    comparisonInputs: comparisonInputs.length,
    analysisId: analysis?.id ?? null,
    reportId: storedReport?.id ?? null,
    narrativeStatus: storedReport?.narrativeStatus ?? null,
  },
  reportChecks: {
    merchantName: report!.executiveSummary.merchantName,
    isoName: report!.executiveSummary.isoName,
    benchmark: report!.executiveSummary.benchmark.message,
    headlineSavings: report!.executiveSummary.headlineSavings.value,
    firstFinding: report!.topFindings[0]?.title ?? null,
    hasAccessFeeFinding: report!.topFindings.some((finding) => /ACCESS FEE/i.test(finding.title)),
    feeChangeTimelineCount: report!.feeChangeTimeline.length,
    narrativeParagraphs: report!.masterNarrative.length,
    eventStages: events.map((event) => event.stage),
  },
};

await fs.writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "global-report.json"), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outDir, "global-report.md"), `${reportMarkdown}\n`);

console.log(JSON.stringify(summary, null, 2));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}
