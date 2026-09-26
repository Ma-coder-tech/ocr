/** Local measurement only; never imports a customer projection or changes permissions. */
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { parsePdfBytes } from "../src/parser.js";
import { evaluatePhase2FeeForNewUpload } from "../src/phase2FeeFact.js";
import { adjudicateSupportedFiservProtocolIdentity } from "../src/canonical/v2/fiservCapabilityContract.js";
import { proveNeutralFromPdfBytes } from "../src/processorNeutral/directProof/neutralEngine.js";
import { evaluateResearchFeeFact } from "../src/processorNeutral/feeFactCandidate.js";

const [mode, fixture] = process.argv.slice(2);
if (!(["parse", "reuse", "research_three_passes"].includes(mode ?? "")
  && ["Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf"].includes(fixture ?? ""))) {
  throw new Error("Usage: benchmark-phase2-fee-extraction <parse|reuse|research_three_passes> <approved fixture>");
}
const bytes = await readFile(`test/fixtures/pdfs/${fixture}`);
const timings: number[] = [];
const peaks: number[] = [];
for (let iteration = 0; iteration < 4; iteration++) {
  global.gc?.();
  let peak = process.memoryUsage().rss;
  const startRss = peak;
  const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  const start = performance.now();
  try {
    const document = await parsePdfBytes(bytes);
    if (mode === "reuse") evaluatePhase2FeeForNewUpload(document, bytes);
    if (mode === "research_three_passes") {
      const support = adjudicateSupportedFiservProtocolIdentity(await parsePdfBytes(bytes));
      const run = await proveNeutralFromPdfBytes(bytes);
      evaluateResearchFeeFact(run, { sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        identity: support });
    }
  } finally { clearInterval(sampler); }
  timings.push(Math.round(performance.now() - start));
  peaks.push(Math.round((Math.max(peak, process.memoryUsage().rss) - startRss) / 1024 / 1024));
}
const measured = timings.slice(1).sort((a, b) => a - b);
console.log(JSON.stringify({ mode, fixture, bytes: bytes.byteLength, iterations: 4,
  warmMedianMs: measured[1], measuredMs: timings.slice(1),
  maxObservedRssDeltaMiB: Math.max(...peaks.slice(1)),
  finalRssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024) }));
