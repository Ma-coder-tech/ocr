import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REMEDIATION_SHA = "e4877aa578668b0cc9458e7ac9b6fb317bf65bf9";
const root = process.env.PHASE01_REMEDIATION_ROOT ?? path.resolve(process.cwd(), "../fiserv-ingestion-robustness");
const actualHead = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (actualHead !== REMEDIATION_SHA) throw new Error(`Remediation checkout moved: ${actualHead}`);
const load = (file: string) => import(pathToFileURL(path.join(root, file)).href);
const [{ parsePdfBytes }, { analyzeStatementDocument }, { executeDeterministicCanonicalAnalysisRun }, ingestion] =
  await Promise.all([
    load("src/parser.ts"), load("src/statementParserOrchestrator.ts"),
    load("src/canonical/v2/runtime/analysisRun.ts"), load("src/fiservIngestionEvidence.ts"),
  ]);
const cases = [];
for (const file of ["fiserv_OFFICIAL_INTERCHANGE_PLUS_SAMPLE.pdf",
  "Nov_2024_Statement.pdf", "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf"] as const) {
  const bytes = await readFile(path.join(root, "test/fixtures/pdfs", file));
  const document = await parsePdfBytes(bytes);
  const legacy = analyzeStatementDocument(document, "other", { sourceFileName: file });
  const canonical = executeDeterministicCanonicalAnalysisRun({ runId: `remediation:${file}`,
    sourceDocumentRef: `fixture:${file}`, document, executionContext: "evaluation_compatibility" }).run;
  const evidenceRows = ingestion.ingestionEvidenceRows(document);
  const bridge = ingestion.grossRefundNetBridgeSignal(evidenceRows);
  const representation = ingestion.cardTypeRepresentationSignal(evidenceRows);
  cases.push({ file, inputSha256: createHash("sha256").update(bytes).digest("hex"),
    legacy: { parser: legacy.parserSource, decision: legacy.parserDecision,
      totalVolume: legacy.totalVolume, totalFees: legacy.totalFees,
      effectiveRate: legacy.effectiveRate, estimatedAnnualSavings: legacy.estimatedAnnualSavings },
    canonical: { status: canonical.status, parser: canonical.parser, familyStatus: canonical.familyStatus,
      supportState: canonical.capabilityProof?.supportState ?? null,
      outputPermissions: canonical.capabilityProof?.outputPermissions ?? null,
      financial: Object.fromEntries(Object.entries(canonical.artifacts.rb?.financialPopulations ?? {})
        .map(([name, fact]: [string, any]) => [name, { status: fact.status, value: fact.value,
          population: fact.population, evidenceRefs: fact.evidenceRefs, occurrenceRefs: fact.occurrenceRefs }])),
      reconciliation: (canonical.artifacts.rb?.reconciliation ?? []).map((control: any) => ({
        identity: control.controlIdentity, scope: control.controlScope, status: control.status,
        evidenceRefs: control.evidenceRefs, occurrenceRefs: control.occurrenceRefs })),
      claimAuthority: { countsByClass: canonical.artifacts.unresolvedClaims?.countsByClass ?? null,
        claims: (canonical.artifacts.unresolvedClaims?.claims ?? []).map((claim: any) => ({
          claimId: claim.claimId, claimClass: claim.claimClass, state: claim.state,
          unresolvedFacets: claim.unresolvedFacets, evidenceRefs: claim.evidenceRefs,
          possibleDecisionEffects: claim.possibleDecisionEffects })) },
      report: canonical.artifacts.rh ? { experience: canonical.artifacts.rh.projection.experience,
        permissions: canonical.artifacts.rh.projection.permissions,
        customerLanguage: canonical.artifacts.rh.projection.customerLanguage } : null,
      financialFoundationHash: canonical.financialFoundationHash,
      claimInventoryHash: canonical.artifacts.unresolvedClaims
        ? createHash("sha256").update(JSON.stringify(canonical.artifacts.unresolvedClaims)).digest("hex") : null,
      reportProjectionHash: canonical.artifacts.rh
        ? createHash("sha256").update(JSON.stringify(canonical.artifacts.rh.projection)).digest("hex") : null },
    ingestion: { rowCount: evidenceRows.length,
      bridge: bridge ? { basis: bridge.basis, refs: bridge.supportingRows.map((row: any) => row.evidenceRef) } : null,
      representation: representation ? { basis: representation.basis,
        refs: representation.supportingRows.map((row: any) => row.evidenceRef) } : null },
  });
}
const contrast = { schemaVersion: "phase01_remediation_contrast_v1", remediationCommit: REMEDIATION_SHA, cases };
const output = path.resolve(process.cwd(), "test/fixtures/phase01/remediation-contrast.json.gz");
const indexPath = path.resolve(process.cwd(), "test/fixtures/phase01/remediation-index.json");
const index = { schemaVersion: contrast.schemaVersion, remediationCommit: REMEDIATION_SHA,
  cases: cases.map((item) => ({ file: item.file, inputSha256: item.inputSha256,
    legacy: { driverId: item.legacy.parser?.driverId ?? null,
      reportable: item.legacy.decision?.reportable ?? null,
      volume: item.legacy.totalVolume, fees: item.legacy.totalFees },
    canonical: { status: item.canonical.status, supportState: item.canonical.supportState,
      financialFacts: Object.keys(item.canonical.financial).length,
      reconciliationControls: item.canonical.reconciliation.length,
      unresolvedClaims: item.canonical.claimAuthority.claims.length,
      outputStates: item.canonical.outputPermissions?.map((permission: any) =>
        `${permission.output}:${permission.state}`) ?? [],
      fullSha256: createHash("sha256").update(JSON.stringify(item.canonical)).digest("hex") },
    ingestion: item.ingestion })) };
if (process.argv.includes("--write")) {
  await writeFile(output, gzipSync(Buffer.from(JSON.stringify(contrast))));
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Wrote ${output} and ${indexPath}`);
} else {
  const expected = JSON.parse(gunzipSync(await readFile(output)).toString("utf8"));
  if (JSON.stringify(contrast) !== JSON.stringify(expected)
    || JSON.stringify(index) !== JSON.stringify(JSON.parse(await readFile(indexPath, "utf8")))) {
    console.error("PHASE01_REMEDIATION_CONTRAST_DIFF"); process.exitCode = 1;
  } else console.log(`PHASE01_REMEDIATION_CONTRAST_PARITY: ${cases.length} fixtures`);
}
