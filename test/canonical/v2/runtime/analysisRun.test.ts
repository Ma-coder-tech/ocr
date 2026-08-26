import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import {
  executeDeterministicCanonicalAnalysisRun,
  FISERV_RUNTIME_CAPABILITY_POLICY_ID,
} from "../../../../src/canonical/v2/index.js";

const fullFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf");
const processorFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf");
const genericFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");

describe("production canonical AnalysisRun core", () => {
  let fullDocument: ParsedDocument;
  let processorDocument: ParsedDocument;
  let genericDocument: ParsedDocument;

  beforeAll(async () => {
    [fullDocument, processorDocument, genericDocument] = await Promise.all([
      parsePdf(fullFixture), parsePdf(processorFixture), parsePdf(genericFixture),
    ]);
  }, 30_000);

  it("admits a Fiserv-family processor statement by claim-specific runtime proof without an exact layout mapping", () => {
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "runtime-capability-proof",
      sourceDocumentRef: "runtime-capability-proof-source",
      document: processorDocument,
    });

    expect(run).toMatchObject({
      status: "completed_with_limitations",
      familyStatus: "proven",
      parser: { driverId: "fiserv_first_data_processor_statement" },
      manifest: {
        executionAuthority: "production_internal_canonical",
        customerReportAuthority: "legacy_report_unchanged",
        providerExecution: "disabled",
        publicResearch: "disabled",
        rfProductionKnowledge: "disabled",
        goldRuntimeAuthority: "prohibited_oracle_only",
      },
      admission: {
        mappingId: FISERV_RUNTIME_CAPABILITY_POLICY_ID,
        authorityClass: "deterministic_capability_policy",
        templateAdmission: {
          identityStatus: "proven",
          admissionStatus: "admitted",
          completenessStatus: "unknown",
          admissionAuthority: { authorityClass: "deterministic_capability_policy" },
        },
      },
      knownLayoutAdmission: null,
    });
    expect(run.capabilityProof?.family.proofEvidenceRefs.length).toBeGreaterThan(0);
    expect(run.capabilityProof?.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "canonical_net_submitted_card_volume", status: "supported", basis: "deterministic_runtime_proof" }),
      expect.objectContaining({ capability: "fee_total", status: "supported", basis: "deterministic_runtime_proof" }),
      expect.objectContaining({ capability: "gross_sale_volume", status: "unknown", basis: "unresolved" }),
    ]));
    expect(run.artifacts.rb?.financialPopulations).toMatchObject({
      canonicalNetSubmittedCardVolume: { status: "available", provenanceStatus: "authoritative" },
      totalStatementProcessingFees: { status: "available", provenanceStatus: "authoritative" },
      grossSaleVolume: { status: "unavailable" },
    });
    expect(Object.values(run.stageOutcomes).every((stage) => stage.status === "valid")).toBe(true);
    expect(run.artifacts.rh?.projection.permissions.financial_metrics.state).not.toBe("denied");
  });

  it("preserves valid RB-RD truth when RE fails and accurately withholds dependent RH output", () => {
    const baseline = executeDeterministicCanonicalAnalysisRun({
      runId: "partial-baseline",
      sourceDocumentRef: "partial-source",
      document: fullDocument,
    }).run;
    const partial = executeDeterministicCanonicalAnalysisRun({
      runId: "partial-re-failure",
      sourceDocumentRef: "partial-source",
      document: fullDocument,
      stageBuilders: {
        synthesis: () => { throw new Error("injected_re_failure"); },
      },
    }).run;

    expect(partial.status).toBe("completed_with_limitations");
    expect(partial.stageOutcomes).toMatchObject({
      rb: { status: "valid" },
      rc: { status: "valid" },
      rd: { status: "valid" },
      re: { status: "failed", errors: [expect.stringContaining("injected_re_failure")] },
      rh: { status: "unresolved", limitations: [expect.stringContaining("previously proven upstream facts remain preserved")] },
    });
    expect(partial.artifacts.rb).toEqual(baseline.artifacts.rb);
    expect(partial.artifacts.rc).toEqual(baseline.artifacts.rc);
    expect(partial.artifacts.rd).toEqual(baseline.artifacts.rd);
    expect(partial.artifacts.re).toBeNull();
    expect(partial.artifacts.rh).toBeNull();
    expect(partial.canonicalTruthHash).not.toBeNull();
    expect(partial.canonicalTruthPreserved).toBe(true);
  });

  it("falls through a false-positive exact parser to the reusable generic Fiserv-family parser", () => {
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "generic-family-fallback",
      sourceDocumentRef: "generic-family-source",
      document: genericDocument,
    });

    expect(run).toMatchObject({
      parser: { driverId: "generic_fiserv_family_statement" },
      familyStatus: "proven",
      admission: { authorityClass: "deterministic_capability_policy" },
    });
    expect(run.capabilityProof?.capabilities.some((capability) => capability.status === "supported")).toBe(true);
    expect(run.stageOutcomes.rb.status).toBe("valid");
  });

  it("fails closed as unsupported without fabricating canonical stages for a non-Fiserv document", () => {
    const document: ParsedDocument = {
      sourceType: "pdf",
      headers: ["content"],
      rows: [{ page: "page-1", content: "Unrelated monthly accounting report" }],
      textPreview: "Unrelated monthly accounting report",
      extraction: { mode: "text_only", qualityScore: 1, reasons: [], lineCount: 1, amountTokenCount: 0, hasExtractableText: true },
      suppliedDocumentIntegrity: { openedSuccessfully: true, enumeratedPageCount: 1, processedPageCount: 1,
        fatalPageErrorCount: 0, extractionLineageComplete: true, localIngestionTruncated: false },
    };
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "unsupported-source",
      sourceDocumentRef: "unsupported-source",
      document,
    });

    expect(run).toMatchObject({ status: "unsupported", familyStatus: "unsupported", parser: { matched: false } });
    expect(run.artifacts).toEqual({ rb: null, rc: null, rd: null, re: null, rh: null });
    expect(run.stageOutcomes.capability_admission.status).toBe("unsupported");
    expect(run.stageOutcomes.rb.status).toBe("unresolved");
  });

  it("does not bypass a failed exact-layout admission through the dynamic fallback", () => {
    const document = structuredClone(fullDocument);
    document.suppliedDocumentIntegrity = { ...document.suppliedDocumentIntegrity!, localIngestionTruncated: true };
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "failed-exact-layout",
      sourceDocumentRef: "failed-exact-layout",
      document,
    });

    expect(run.parser.driverId).toBe("fiserv_first_data_full_statement");
    expect(run.knownLayoutAdmission).toBeNull();
    expect(run.admission).toBeNull();
    expect(run.stageOutcomes.capability_admission.status).not.toBe("valid");
    expect(run.artifacts.rb?.templateCapability.admissionStatus).toBe("unknown");
  });
});
