import fs from "node:fs/promises";
import path from "node:path";
import {
  actualValuesFromSyntheticPdf,
  evaluateCorpusCase,
  legacyKnownFailureActualValues,
  loadGoldenCorpusCases,
  type CorpusCaseRunResult,
  type GoldenCorpusCase,
} from "./canonical-corpus-lib.js";

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
    return legacyKnownFailureActualValues(corpusCase);
  }
  if (corpusCase.source.kind !== "synthetic_pdf") return {};
  return actualValuesFromSyntheticPdf(corpusCase.source.publicFixturePath);
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
