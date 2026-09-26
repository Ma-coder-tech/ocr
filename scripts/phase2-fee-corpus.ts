/** Frozen direct-proof parity against the reviewed pre-integration research run. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parsePdfBytes } from "../src/parser.js";
import { proveNeutralFromParsedPdfBytes } from "../src/processorNeutral/directProof/neutralEngine.js";
import { evaluatePhase2FeeForNewUpload } from "../src/phase2FeeFact.js";

const expected: Record<string, Record<string, number>> = {
  "Nov_2024_Statement.pdf": { total_processing_fees: -133096 },
  "SAMPLE_MERCHANT4_CLOVER.pdf": { gross_sale_volume: 5249703, refund_volume: -3648,
    net_submitted_volume: 5246055, total_processing_fees: -131255 },
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf": { gross_sale_volume: 17128393, refund_volume: 0,
    net_submitted_volume: 17128393, total_processing_fees: -355245 },
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf": { gross_sale_volume: 8060144, refund_volume: 1000,
    net_submitted_volume: 8059144 },
};
const directory = path.join(process.cwd(), "test/fixtures/pdfs");
const files = (await readdir(directory)).filter((file) => file.endsWith(".pdf")).sort();
let proofs = 0, eligible = 0;
const cases = [];
for (const file of files) {
  const bytes = await readFile(path.join(directory, file));
  const document = await parsePdfBytes(bytes);
  const run = proveNeutralFromParsedPdfBytes(document, bytes);
  const facts = Object.fromEntries(run.facts.filter((fact) => fact.state === "proven")
    .map((fact) => [fact.id, fact.amountMinor]));
  assert.deepEqual(facts, expected[file] ?? {}, `${file}: direct proof changed`);
  assert.equal(run.backendProcessor, null);
  assert.equal(run.customerAuthority, "none_shadow_only");
  const audit = evaluatePhase2FeeForNewUpload(document, bytes);
  const shouldQualify = ["Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf"].includes(file);
  assert.equal(audit.decision === "eligible", shouldQualify, `${file}: Product scope changed`);
  proofs += Object.keys(facts).length;
  eligible += Number(audit.decision === "eligible");
  cases.push({ file, provenFactCount: Object.keys(facts).length, feeEligible: audit.decision === "eligible" });
}
const contrasts = [
  "data/authority/f3-us-visa-pilot/visa-usa-interchange-reimbursement-fees-2026-04-18.pdf",
  "data/reference-rate-sources/wells-fargo-merchant-passthrough-fees-2026-04.pdf",
  "evidence/commercial-source-capture-remediation-helcim-dharma-v1/failure-artifacts/h2_helcim_public_pricing.rendered.pdf",
  "evidence/commercial-source-captures/v1/artifacts/a2_authorize_net_account_updater.pdf",
];
let parsed = 0;
for (const file of contrasts) {
  try {
    const bytes = await readFile(file);
    const document = await parsePdfBytes(bytes);
    const run = proveNeutralFromParsedPdfBytes(document, bytes);
    const audit = evaluatePhase2FeeForNewUpload(document, bytes);
    assert.equal(run.facts.filter((fact) => fact.state === "proven").length, 0, file);
    assert.equal(audit.decision, "withheld", file);
    parsed++;
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
  }
}
assert.equal(files.length, 15);
assert.equal(proofs, 12);
assert.equal(eligible, 2);
assert.ok(parsed >= 3);
console.log(JSON.stringify({ publicStatements: files.length, provenFacts: proofs,
  feeEligible: eligible, publicContrasts: contrasts.length, parsedContrasts: parsed,
  falseAdmissions: 0, cases }, null, 2));
