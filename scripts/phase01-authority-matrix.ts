import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import { parsePdfBytes } from "../src/parser.js";
import { executeDeterministicCanonicalAnalysisRun } from "../src/canonical/v2/runtime/analysisRun.js";
import { buildCanonicalRuntimeAnalysis } from "../src/canonical/runtimeAdapter.js";
import { buildF1ShadowGraph } from "../src/claimAuthorityF1/canonicalAdapter.js";
import { buildSingleStatementReportV1 } from "../src/reporting/v1/index.js";
import { observeProcessorNeutralShadow } from "../src/processorNeutral/shadow.js";
import { assertNoClaimWidening, diffAuthorityMatrix } from "../src/processorNeutral/authorityDiff.js";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "test/fixtures/phase01/authority-baseline.json.gz");
const INDEX = path.join(ROOT, "test/fixtures/phase01/authority-index.json");
const CASES = [
  "fiserv_OFFICIAL_INTERCHANGE_PLUS_SAMPLE.pdf",
  "Nov_2024_Statement.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
] as const;

function hash(value: unknown): string {
  return createHash("sha256").update(value instanceof Uint8Array ? value
    : typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function snapshot(run: ReturnType<typeof executeDeterministicCanonicalAnalysisRun>) {
  const { run: canonical, diagnostics } = run;
  const rb = canonical.artifacts.rb;
  const rh = canonical.artifacts.rh?.projection;
  const financial = Object.fromEntries(Object.entries(rb?.financialPopulations ?? {}).map(([name, fact]) => [name, {
    status: fact.status, value: fact.value, population: fact.population,
    evidenceRefs: fact.evidenceRefs, occurrenceRefs: fact.occurrenceRefs,
  }]));
  return {
    status: canonical.status,
    parser: canonical.parser,
    familyStatus: canonical.familyStatus,
    manifest: canonical.manifest,
    hashes: {
      canonicalTruth: canonical.canonicalTruthHash,
      financialFoundation: canonical.financialFoundationHash,
      semantic: canonical.semanticHash,
      canonicalState: canonical.canonicalStateHash,
    },
    financial,
    reconciliation: (rb?.reconciliation ?? []).map((control) => ({
      identity: control.controlIdentity, scope: control.controlScope, status: control.status,
      evidenceRefs: control.evidenceRefs, occurrenceRefs: control.occurrenceRefs,
    })),
    admission: canonical.capabilityProof ? {
      supportState: canonical.capabilityProof.supportState,
      protocol: canonical.capabilityProof.protocolIdentity,
      capabilities: canonical.capabilityProof.capabilities,
      outputPermissions: canonical.capabilityProof.outputPermissions,
      controls: canonical.capabilityProof.reconciliationControlCandidates,
    } : null,
    claimAuthority: {
      countsByClass: canonical.artifacts.unresolvedClaims?.countsByClass ?? null,
      claims: (canonical.artifacts.unresolvedClaims?.claims ?? []).map((claim) => ({
        claimId: claim.claimId, claimClass: claim.claimClass, state: claim.state,
        unresolvedFacets: claim.unresolvedFacets, evidenceRefs: claim.evidenceRefs,
        possibleDecisionEffects: claim.possibleDecisionEffects,
      })),
    },
    report: rh ? { experience: rh.experience, permissions: rh.permissions,
      projectionSha256: hash(rh), customerLanguage: rh.customerLanguage } : null,
    sourceTrace: {
      documentIntegrity: rb?.documentIntegrity ?? null,
      sourceModelSha256: rb?.sourceModel ? hash(rb.sourceModel) : null,
      observedEvidenceCount: rb?.sourceModel?.evidence?.length ?? null,
      parserDecision: diagnostics.decision,
    },
  };
}

async function collect() {
  const cases = [];
  for (const file of CASES) {
    const bytes = await readFile(path.join(ROOT, "test/fixtures/pdfs", file));
    const document = await parsePdfBytes(bytes);
    const legacy = analyzeStatementDocument(document, "other", { sourceFileName: file });
    let reportV1: unknown;
    try {
      reportV1 = buildSingleStatementReportV1({ analysis: legacy, reportId: `phase01:${file}`,
        generatedAt: "2026-09-25T00:00:00.000Z", sourceFileName: file,
        context: { merchantName: legacy.parserStatementIdentity?.merchantName ?? null } });
    } catch (error) { reportV1 = { projectionError: error instanceof Error ? error.message : String(error) }; }
    const execution = executeDeterministicCanonicalAnalysisRun({
      runId: `phase01:${file}`, sourceDocumentRef: `fixture:${file}`, document,
      executionContext: "evaluation_compatibility",
    });
    const current = snapshot(execution);
    const shadow = observeProcessorNeutralShadow({ document, inputBytes: bytes, execution });
    const v1 = buildCanonicalRuntimeAnalysis({ document, businessType: "other",
      runtimeDocumentRef: `phase01:${file}` });
    const f1 = buildF1ShadowGraph(v1.analysis);
    const canonicalV1 = {
      versionManifest: v1.analysis.versionManifest,
      financialFacts: v1.analysis.financialFacts,
      feeLedger: { status: v1.analysis.feeLedger.status,
        uniqueChargeTotal: v1.analysis.feeLedger.uniqueChargeTotal,
        controls: v1.analysis.feeLedger.controls.map((control) => ({
          id: control.id, status: control.status, evidenceRefs: control.evidenceRefs,
          expectedAmount: control.expectedAmount, actualAmount: control.actualAmount,
          deltaMinor: control.deltaMinor,
        })) },
      customerState: { primaryState: v1.analysis.customerState.primaryState,
        permissions: v1.analysis.customerState.permissions,
        actionGuidance: v1.analysis.customerState.actionGuidance,
        visibility: v1.analysis.customerState.visibility },
      claimAuthority: { f1: { status: f1.status, diagnostic: f1.diagnostic,
        claims: f1.graph?.claims.map((claim) => ({ id: claim.claimId,
          dimension: claim.dimension, value: claim.value, resolution: claim.resolution,
          authority: claim.authority, evidenceRefs: claim.evidenceRefs })) ?? [] },
        f4PackageE: v1.internalPackageECustomerStateAuthorityReadBoundary,
        f4Savings: v1.internalSupportedFiservSavingsAuthorityComparison },
    };
    cases.push({ file, inputSha256: hash(bytes),
      extraction: document.extraction, suppliedDocumentIntegrity: document.suppliedDocumentIntegrity ?? null,
      activeRuntime: { summary: legacy, reportV1 }, canonicalV1, canonicalShadow: current, processorNeutralShadow: shadow });
  }
  return { schemaVersion: "phase01_authority_matrix_v1", baseCommit: "7b705023eaa593d298ffa6455be9224536d17822",
    remediationCommit: "e4877aa578668b0cc9458e7ac9b6fb317bf65bf9",
    cases };
}

const actual = await collect();
const index = {
  schemaVersion: actual.schemaVersion, baseCommit: actual.baseCommit,
  remediationCommit: actual.remediationCommit,
  cases: actual.cases.map((item) => ({
    file: item.file, inputSha256: item.inputSha256,
    legacy: { driverId: item.activeRuntime.summary.parserSource?.driverId ?? null,
      reportable: item.activeRuntime.summary.parserDecision?.reportable ?? null,
      volume: item.activeRuntime.summary.totalVolume, fees: item.activeRuntime.summary.totalFees,
      savings: item.activeRuntime.summary.estimatedAnnualSavings,
      reportState: item.activeRuntime.reportV1 && typeof item.activeRuntime.reportV1 === "object"
        ? (item.activeRuntime.reportV1 as any).reportState?.code ?? null : null },
    canonicalV1: { f1Claims: item.canonicalV1.claimAuthority.f1.diagnostic.claimCount,
      f1Unknown: item.canonicalV1.claimAuthority.f1.diagnostic.unknownClaimCount,
      customerState: item.canonicalV1.customerState.primaryState,
      fullSha256: hash(item.canonicalV1) },
    canonicalV2: { status: item.canonicalShadow.status,
      financialFacts: Object.keys(item.canonicalShadow.financial).length,
      reconciliationControls: item.canonicalShadow.reconciliation.length,
      unresolvedClaims: item.canonicalShadow.claimAuthority.claims.length,
      supportState: item.canonicalShadow.admission?.supportState ?? null,
      outputStates: item.canonicalShadow.admission?.outputPermissions.map((permission) =>
        `${permission.output}:${permission.state}`) ?? [],
      fullSha256: hash(item.canonicalShadow) },
    activeRuntimeSha256: hash(item.activeRuntime),
    shadowSha256: hash(item.processorNeutralShadow),
  })),
};
if (process.argv.includes("--write")) {
  if (existsSync(BASELINE)) {
    const prior = JSON.parse(gunzipSync(await readFile(BASELINE)).toString("utf8"));
    const diffs = diffAuthorityMatrix(prior.cases, actual.cases);
    // A new Product/Claim & Authority change needs a separate reviewed gate update.
    // A baseline refresh alone cannot approve a widened claim.
    assertNoClaimWidening(diffs);
    for (const oldCase of prior.cases) {
      const nextCase = actual.cases.find((item) => item.file === oldCase.file);
      if (!nextCase || JSON.stringify(oldCase.activeRuntime) !== JSON.stringify(nextCase.activeRuntime)
        || JSON.stringify(oldCase.canonicalShadow) !== JSON.stringify(nextCase.canonicalShadow)
        || (oldCase.canonicalV1 && JSON.stringify(oldCase.canonicalV1) !== JSON.stringify(nextCase.canonicalV1))) {
        throw new Error(`FROZEN_AUTHORITY_SURFACE_CHANGE:${oldCase.file}. Create a separately reviewed baseline version.`);
      }
    }
  }
  await writeFile(BASELINE, gzipSync(Buffer.from(JSON.stringify(actual))));
  await writeFile(INDEX, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Wrote ${BASELINE} and ${INDEX}`);
} else {
  const expected = JSON.parse(gunzipSync(await readFile(BASELINE)).toString("utf8"));
  const diffs = diffAuthorityMatrix(expected.cases, actual.cases);
  try { assertNoClaimWidening(diffs); }
  catch (error) { console.error(String(error)); process.exitCode = 1; }
  if (diffs.length) console.error(JSON.stringify(diffs.map(({ file, surface, key, widening }) =>
    ({ file, surface, key, widening })), null, 2));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error("PHASE01_AUTHORITY_DIFF: baseline changed; inspect active, canonical, and shadow fields separately.");
    process.exitCode = 1;
  } else if (JSON.stringify(index) !== JSON.stringify(JSON.parse(await readFile(INDEX, "utf8")))) {
    console.error("PHASE01_AUTHORITY_INDEX_DIFF"); process.exitCode = 1;
  } else console.log(`PHASE01_AUTHORITY_PARITY: ${CASES.length} fixtures`);
}
