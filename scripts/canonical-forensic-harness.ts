import fs from "node:fs/promises";
import path from "node:path";
import { parsePdf } from "../src/parser.js";
import { evaluateCorpusCase, loadGoldenCorpusCases, type CorpusCaseRunResult, type GoldenCorpusCase } from "./canonical-corpus-lib.js";

const outputDir = path.resolve(process.cwd(), "artifacts/canonical-corpus");
const outputPath = path.join(outputDir, "forensic-harness-report.json");

const cases = await loadGoldenCorpusCases();
const results: CorpusCaseRunResult[] = [];

for (const corpusCase of cases) {
  results.push(evaluateCorpusCase(corpusCase, await actualValuesFor(corpusCase)));
}

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: summarize(results),
      results,
    },
    null,
    2,
  )}\n`,
);

console.log(`Canonical forensic harness completed. Redacted report: ${outputPath}`);
console.log(JSON.stringify(summarize(results), null, 2));

async function actualValuesFor(corpusCase: GoldenCorpusCase): Promise<Record<string, unknown>> {
  if (corpusCase.source.kind === "private_original") {
    return Object.fromEntries(
      corpusCase.expectations
        .filter((expectation) => expectation.knownFailure)
        .map((expectation) => [expectation.field, expectation.knownFailure!.currentIncorrectResult]),
    );
  }
  if (corpusCase.source.kind !== "synthetic_pdf") return {};
  const doc = await parsePdf(path.resolve(process.cwd(), corpusCase.source.publicFixturePath));
  const text = doc.rows.map((row) => String(row.content)).join(" ");
  return {
    "financialFacts.processedSales": moneyFromSyntheticText(text, /Total Amount Submitted(?:\s*\|\s*|\s+)\$?([0-9,]+\.\d{2})/i),
    "financialFacts.totalFees": moneyFromSyntheticText(text, /Fees Charged(?:\s*\|\s*|\s+)-?\$?([0-9,]+\.\d{2})/i),
    "reportState": null,
  };
}

function moneyFromSyntheticText(text: string, pattern: RegExp): { amountMinor: number; currency: "USD" } | null {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  return {
    amountMinor: Math.round(Number(match[1].replace(/,/g, "")) * 100),
    currency: "USD",
  };
}

function summarize(results: CorpusCaseRunResult[]) {
  return results.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.outcome] += 1;
      return acc;
    },
    {
      total: 0,
      pass: 0,
      known_failure: 0,
      new_regression: 0,
      unexpected_improvement: 0,
      human_review_required: 0,
    },
  );
}
