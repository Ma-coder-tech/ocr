import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { parsePdf } from "../src/parser.js";
import { analyzeStatementDocumentWithOptionalAi } from "../src/statementParserOrchestrator.js";
import { buildComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import { compareMultiStatementAnalyses } from "../src/multiStatementComparisonEngine.js";
import { maybeRunMultiStatementNarrativeAiForGlobalReport } from "../src/multiStatementNarrativeAi.js";
import { buildMultiStatementGlobalReport, renderMultiStatementGlobalReportMarkdown } from "../src/reporting/buildMultiStatement.js";
import type { BusinessTypeId } from "../src/businessTypes.js";

type PdfInput = {
  path: string;
  sourceFileName: string;
};

const businessType = (process.env.MULTI_STATEMENT_BUSINESS_TYPE ?? "restaurant_food_beverage") as BusinessTypeId;
const outDir = path.join(process.cwd(), "test", "fixtures", "multi-statement", "nov-dec-2024-real-pipeline");

const inputs: PdfInput[] = [
  {
    path: path.resolve(process.cwd(), "test", "fixtures", "pdfs", "Nov_2024_Statement.pdf"),
    sourceFileName: "Nov_2024_Statement.pdf",
  },
  {
    path: "/Users/martialmahougnonamoussou/Downloads/Dec_2024_Statement.pdf",
    sourceFileName: "Dec_2024_Statement.pdf",
  },
];

async function analyzeInput(input: PdfInput) {
  const parsed = await parsePdf(input.path);
  const summary = await analyzeStatementDocumentWithOptionalAi(parsed, businessType, {
    sourceFileName: input.sourceFileName,
  });
  const adapted = buildComparisonStatementInput(summary, {
    sourceAnalysisId: input.sourceFileName,
    pipelineVersion: "real-pipeline-nov-dec-2024",
  });
  return { input, parsed, summary, adapted };
}

await fs.mkdir(outDir, { recursive: true });

const analyzed = [];
for (const input of inputs) {
  console.log(`Analyzing ${input.sourceFileName}...`);
  const result = await analyzeInput(input);
  analyzed.push(result);
  const baseName = path.basename(input.sourceFileName, ".pdf").toLowerCase();
  await fs.writeFile(path.join(outDir, `${baseName}.single-summary.json`), `${JSON.stringify(result.summary, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, `${baseName}.comparison-input.json`), `${JSON.stringify(result.adapted, null, 2)}\n`);
}

const comparison = compareMultiStatementAnalyses(
  analyzed.map((result) => result.adapted),
  {
    analysisTimestamp: new Date().toISOString(),
    pipelineVersion: "real-pipeline-nov-dec-2024",
  },
);
let report = buildMultiStatementGlobalReport(comparison);
const narrative = await maybeRunMultiStatementNarrativeAiForGlobalReport(report, {
  provider: (process.env.AI_MULTI_STATEMENT_NARRATIVE_PROVIDER as "anthropic" | "openai" | "auto" | undefined) ?? "openai",
  timeoutMs: Number(process.env.AI_MULTI_STATEMENT_NARRATIVE_TIMEOUT_MS ?? 30000),
});
report = narrative.report;

await fs.writeFile(path.join(outDir, "nov-dec-2024.comparison-analysis.json"), `${JSON.stringify(comparison, null, 2)}\n`);
await fs.writeFile(
  path.join(outDir, "nov-dec-2024.global-report.json"),
  `${JSON.stringify({ narrativeStatus: narrative.aiMultiStatementNarrative, report }, null, 2)}\n`,
);
await fs.writeFile(path.join(outDir, "nov-dec-2024.global-report.md"), `${renderMultiStatementGlobalReportMarkdown(report)}\n`);

console.log(
  JSON.stringify(
    {
      outDir,
      periods: report.effectiveRateTrend.periods.map((period) => period.period),
      merchant: report.executiveSummary.merchantName,
      isoName: report.executiveSummary.isoName,
      totalVolume: report.executiveSummary.totalVolume.value,
      totalFees: report.executiveSummary.totalFees.value,
      averageEffectiveRate: report.executiveSummary.averageEffectiveRate.value,
      trendDirection: report.executiveSummary.trendDirection,
      narrativeStatus: narrative.aiMultiStatementNarrative.status,
      narrativeParagraphs: report.masterNarrative.length,
    },
    null,
    2,
  ),
);
