import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFiservOneStatementEvaluation } from "../../../../src/canonical/v2/index.js";

const fixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf");
const shortFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");

describe("one-statement Fiserv pre-UAT harness", () => {
  it("rejects zero or multiple selected PDFs before extraction", async () => {
    await expect(runFiservOneStatementEvaluation({ statementPaths: [], safeStatementId: "eval-zero", runVersion: "test-run", outputDirectory: "/tmp/unused" }))
      .rejects.toThrow("FISERV_EVALUATION_REQUIRES_EXACTLY_ONE_PDF");
    await expect(runFiservOneStatementEvaluation({ statementPaths: [fixture, fixture], safeStatementId: "eval-two", runVersion: "test-run", outputDirectory: "/tmp/unused" }))
      .rejects.toThrow("FISERV_EVALUATION_REQUIRES_EXACTLY_ONE_PDF");
  });

  it("runs one repository-local Clover fixture offline and writes exactly the safe three-file bundle", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "rh-fiserv-harness-"));
    const result = await runFiservOneStatementEvaluation({ statementPaths: [fixture], safeStatementId: "fixture-clover-full",
      runVersion: "test-run", outputDirectory, sourceProfile: { statementCompleteness: "unknown" } });
    expect((await readdir(outputDirectory)).sort()).toEqual(["review.md", "rh-projection.json", "run-audit.json"]);
    expect(result.audit).toMatchObject({ rf: { state: "not_applicable_no_admitted_knowledge" }, rg: { state: "disabled_no_provider" },
      integrity: { suppliedDocumentStatus: "complete_supplied_document", statementCompleteness: "unknown" },
      stageValidation: { rb: "valid", rc: "valid", rd: "valid", re: "valid", rh: "valid" },
      readiness: { source: { templateAdmission: "unknown" }, outcome: { analysisCompletionPermitted: false } },
      admission: null,
      reviewSummary: { detectedTemplate: "fiserv_first_data_full_statement", matchedAdmissionMappingId: null,
        admissionLifecycle: null, evidenceAuthority: "observational", parserReportable: true, feeDetailCoverage: "unproven" } });
    expect(result.audit.issueClassifications).not.toContainEqual(expect.objectContaining({ primaryType: "systemic canonical defect" }));
    expect(result.audit.templateAdmissionAudit).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: "gross sales", currentAuthority: "observational", admissionCandidate: "yes" }),
      expect.objectContaining({ item: "gross-sale count", currentAuthority: "observational",
        canonicalResult: "observed 1797; canonical headline unavailable" }),
      expect.objectContaining({ item: "submitted count", currentAuthority: "observational",
        canonicalResult: "observed 1800; canonical headline unavailable" }),
      expect.objectContaining({ item: "average ticket", currentAuthority: "unavailable", admissionCandidate: "conditional" }),
      expect.objectContaining({ item: "fee-detail occurrences", currentAuthority: "observational",
        canonicalResult: "134 observed occurrence(s); coverage unproven" }),
    ]));
    const review = await readFile(path.join(outputDirectory, "review.md"), "utf8");
    const serialized = `${review}${await readFile(path.join(outputDirectory, "run-audit.json"), "utf8")}`;
    expect(serialized).not.toContain(fixture);
    expect(serialized).not.toMatch(/SAMPLE_MERCHANT4_CLOVER|merchantNumber|evidenceLine|\.pdf\b|https?:\/\//i);
    expect(serialized).not.toMatch(/admitted short|short-layout|short-template|submitted count.{0,80}admitted|complete observed-row coverage/i);
    expect(review).toContain("no claim-scoped admission mapping matched");
    expect(review).toContain("134 observed occurrence(s); coverage unproven");
    expect(review).toContain("## Recognized/extracted");
    expect(review).toContain("## Canonically admitted\n\n- none");
    expect(review).toContain("## Candidate for admission");
  }, 30_000);

  it("applies the claim-scoped short-layout admission while preserving unknown statement completeness", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "rh-fiserv-short-admission-"));
    const result = await runFiservOneStatementEvaluation({ statementPaths: [shortFixture], safeStatementId: "fixture-clover-short",
      runVersion: "run-three-test", outputDirectory, sourceProfile: { statementCompleteness: "unknown" } });
    expect(result.audit).toMatchObject({
      schemaVersion: "fiserv_pre_uat_run_audit_v4",
      harnessVersion: "fiserv_pre_uat_one_statement_v4",
      admission: { mappingId: "fiserv_first_data_short_structural_mapping", mappingVersion: "1.0.0", authorityClass: "product_owner" },
      readiness: { source: { templateAdmission: "admitted", statementCompleteness: "unknown" },
        outcome: { state: "statement_completeness_unknown", analysisCompletionPermitted: false,
          reasonCodes: ["statement_completeness_not_proven"] } },
      stageValidation: { rb: "valid", rc: "valid", rd: "valid", re: "valid", rh: "valid" },
      finalPublicExperience: "analysis_with_open_questions",
    });
    expect(result.audit.templateAdmissionAudit).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: "gross sales", currentAuthority: "admitted_with_conditions", admissionCandidate: "already_admitted" }),
      expect.objectContaining({ item: "average ticket", currentAuthority: "canonical_derived_from_admitted_inputs" }),
      expect.objectContaining({ item: "fee-detail occurrences", currentAuthority: "admitted_with_conditions",
        canonicalResult: "2 observed occurrence(s); coverage complete_observed_occurrences" }),
      expect.objectContaining({ item: "pricing axes", currentAuthority: "unresolved" }),
    ]));
    expect(result.audit.issueClassifications).not.toContainEqual(expect.objectContaining({ primaryType: "systemic canonical defect" }));
    const projection = JSON.parse(await readFile(path.join(outputDirectory, "rh-projection.json"), "utf8"));
    expect(projection.snapshot).toMatchObject({
      processedSales: { moneyValue: { amountMinor: 240_000 } },
      processingFees: { moneyValue: { amountMinor: 14_131 } },
      transactionCount: { countValue: 8 },
      averageTicket: { moneyValue: { amountMinor: 36_250 } },
    });
    expect(projection.pricing).toMatchObject({ status: "not_confirmed", underlyingCost: { state: "unknown" },
      schedule: { state: "unknown" }, scope: { state: "unresolved" } });
    const review = await readFile(path.join(outputDirectory, "review.md"), "utf8");
    expect(review).toContain("fiserv_first_data_short_structural_mapping@1.0.0");
    expect(review).toContain("canonical_derived_from_admitted_inputs");
  }, 30_000);
});
