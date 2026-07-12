import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { maybeRunMultiStatementNarrativeAiForGlobalReport } from "../src/multiStatementNarrativeAi.js";
import { compareMultiStatementAnalyses } from "../src/multiStatementComparisonEngine.js";
import type { ComparisonStatementInput } from "../src/multiStatementComparisonInput.js";
import { buildMultiStatementGlobalReport, renderMultiStatementGlobalReportMarkdown } from "../src/reporting/buildMultiStatement.js";

type Fixture = {
  statements: ComparisonStatementInput[];
};

const fixturePath = path.join(process.cwd(), "test", "fixtures", "multi-statement", "el_nuevo_tequila_multi_statement.generated.json");
const outputDir = path.join(process.cwd(), "test", "fixtures", "multi-statement");
const liveAi = process.argv.includes("--live-ai");

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture;
const analysis = compareMultiStatementAnalyses(fixture.statements, {
  analysisTimestamp: "2026-07-06T00:00:00.000Z",
  pipelineVersion: "fixture-preview",
});

let report = buildMultiStatementGlobalReport(analysis);
let narrativeStatus: unknown = { status: "not_requested" };

if (liveAi) {
  const narrative = await maybeRunMultiStatementNarrativeAiForGlobalReport(report);
  report = narrative.report;
  narrativeStatus = narrative.aiMultiStatementNarrative;
}

const payload = {
  generatedAt: new Date().toISOString(),
  liveAi,
  narrativeStatus,
  report,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "el_nuevo_tequila_global_report.generated.json"), `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "el_nuevo_tequila_global_report.generated.md"), `${renderMultiStatementGlobalReportMarkdown(report)}\n`);

console.log(
  JSON.stringify(
    {
      liveAi,
      narrativeStatus:
        narrativeStatus && typeof narrativeStatus === "object" && "status" in narrativeStatus
          ? (narrativeStatus as { status: unknown }).status
          : "unknown",
      json: path.join(outputDir, "el_nuevo_tequila_global_report.generated.json"),
      markdown: path.join(outputDir, "el_nuevo_tequila_global_report.generated.md"),
      masterNarrativeParagraphs: report.masterNarrative.length,
    },
    null,
    2,
  ),
);
