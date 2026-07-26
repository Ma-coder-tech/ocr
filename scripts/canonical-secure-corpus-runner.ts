import fs from "node:fs/promises";
import {
  actualValuesFromPrivateCorpusManifest,
  evaluateCorpusCase,
  loadGoldenCorpusCases,
  loadPrivateCorpusManifest,
  privateCorpusDirectoryFromEnv,
  type CorpusCaseRunResult,
} from "./canonical-corpus-lib.js";

const configured = privateCorpusDirectoryFromEnv();

if (configured.status === "skipped") {
  console.log(
    JSON.stringify(
      {
        status: "skipped",
        reason: configured.reason,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

try {
  const entries = await fs.readdir(configured.dir, { withFileTypes: true });
  const manifestCount = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length;
  const cases = (await loadGoldenCorpusCases()).filter((corpusCase) => corpusCase.source.kind === "private_original");
  const results: CorpusCaseRunResult[] = [];
  let missingManifestCount = 0;

  for (const corpusCase of cases) {
    if (corpusCase.source.kind !== "private_original") continue;
    const manifest = await loadPrivateCorpusManifest(configured.dir, corpusCase.source.privateManifestName);
    if (!manifest) {
      missingManifestCount += 1;
      continue;
    }
    const actualValues = await actualValuesFromPrivateCorpusManifest(configured.dir, manifest);
    results.push(evaluateCorpusCase(corpusCase, actualValues));
  }

  console.log(
    JSON.stringify(
      {
        status: "configured",
        privateCorpusCasesDiscovered: manifestCount,
        publicPrivateCasesExpected: cases.length,
        privateCasesExecuted: results.length,
        missingManifestCount,
        summary: summarize(results),
        results: results.map((result) => ({
          caseId: result.caseId,
          outcome: result.outcome,
          expectationOutcomes: result.expectationResults.map((expectation) => ({
            field: expectation.field,
            outcome: expectation.outcome,
            defectId: expectation.defectId,
            targetCorrectionPackage: expectation.targetCorrectionPackage,
          })),
        })),
        note: "Private corpus paths, filenames, document hashes, and raw statement text are intentionally not printed.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        reason: "Private corpus directory could not be read. Path is intentionally omitted.",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      null,
      2,
    ),
  );
  process.exit(1);
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
