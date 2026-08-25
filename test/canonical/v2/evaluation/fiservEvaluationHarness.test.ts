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

  it("admits the reusable full-layout family and writes the safe deterministic bundle", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "rh-fiserv-harness-"));
    const result = await runFiservOneStatementEvaluation({ statementPaths: [fixture], safeStatementId: "fixture-clover-full",
      runVersion: "test-run", outputDirectory, sourceProfile: { statementCompleteness: "unknown" } });
    expect((await readdir(outputDirectory)).sort()).toEqual(["review.md", "rh-projection.json", "run-audit.json"]);
    expect(result.audit).toMatchObject({ rf: { state: "not_applicable_no_admitted_knowledge" }, rg: { state: "disabled_no_provider" },
      integrity: { suppliedDocumentStatus: "complete_supplied_document", statementCompleteness: "unknown" },
      stageValidation: { rb: "valid", rc: "valid", rd: "valid", re: "valid", rh: "valid" },
      readiness: { source: { templateAdmission: "admitted" }, outcome: { analysisCompletionPermitted: false } },
      admission: { mappingId: "fiserv_first_data_full_statement", mappingVersion: "1.0.0",
        feeDetailCoverage: "complete_observed_occurrences" },
      familyAdmissionDecision: { matched: true, reasonCodes: [
        "full_admission_accepted_cross_section_structure",
        "full_admission_accepted_deterministic_economics",
        "full_admission_scope_limited_to_enumerated_capabilities",
      ] },
      reviewSummary: { detectedTemplate: "fiserv_first_data_full_statement",
        matchedAdmissionMappingId: "fiserv_first_data_full_statement",
        admissionLifecycle: "admitted_with_conditions", evidenceAuthority: "product_owner", parserReportable: true,
        feeDetailCoverage: "complete_observed_occurrences" } });
    expect(result.audit.issueClassifications).not.toContainEqual(expect.objectContaining({ primaryType: "systemic canonical defect" }));
    expect(result.audit.templateAdmissionAudit).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: "gross sales", currentAuthority: "admitted_with_conditions", admissionCandidate: "already_admitted" }),
      expect.objectContaining({ item: "gross-sale count", currentAuthority: "admitted_with_conditions",
        canonicalResult: "observed 1797; canonical headline 1797" }),
      expect.objectContaining({ item: "submitted count", currentAuthority: "observational",
        canonicalResult: "observed 1800; canonical headline unavailable" }),
      expect.objectContaining({ item: "average ticket", currentAuthority: "canonical_derived_from_admitted_inputs",
        canonicalResult: "USD 29.21" }),
      expect.objectContaining({ item: "fee-detail occurrences", currentAuthority: "admitted_with_conditions",
        canonicalResult: "134 observed occurrence(s); coverage complete_observed_occurrences" }),
    ]));
    expect(result.audit.economics).toMatchObject({ rdCompleteness: "financially_unreconciled", chargeCount: 137,
      contributingChargeCount: 0, authoritativeFeeTotalMinor: 131_255, reconciliationDeltaMinor: 131_255,
      ownershipControlProven: false, themeCount: 0 });
    const projection = JSON.parse(await readFile(path.join(outputDirectory, "rh-projection.json"), "utf8"));
    expect(projection.snapshot).toMatchObject({ processedSales: { moneyValue: { amountMinor: 5_246_055 } },
      processingFees: { moneyValue: { amountMinor: 131_255 } }, transactionCount: { countValue: 1_797 },
      averageTicket: { moneyValue: { amountMinor: 2_921 } } });
    expect(projection.pricing).toMatchObject({ status: "not_confirmed", underlyingCost: { state: "unknown" },
      schedule: { state: "unknown" }, scope: { state: "unresolved" } });
    const review = await readFile(path.join(outputDirectory, "review.md"), "utf8");
    const serialized = `${review}${await readFile(path.join(outputDirectory, "run-audit.json"), "utf8")}`;
    expect(serialized).not.toContain(fixture);
    expect(serialized).not.toMatch(/SAMPLE_MERCHANT4_CLOVER|merchantNumber|evidenceLine|\.pdf\b|https?:\/\//i);
    expect(serialized).not.toMatch(/submitted count.{0,80}admitted/i);
    expect(review).toContain("fiserv_first_data_full_statement@1.0.0");
    expect(review).toContain("full_admission_accepted_cross_section_structure");
    expect(review).toContain("134 observed occurrence(s); coverage complete_observed_occurrences");
    expect(review).toContain("## Recognized/extracted");
    expect(review).toContain("## Canonically admitted");
    expect(review).toContain("## Refused/unresolved");
  }, 30_000);

  it("applies the claim-scoped short-layout admission while preserving unknown statement completeness", async () => {
    const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "rh-fiserv-short-admission-"));
    const result = await runFiservOneStatementEvaluation({ statementPaths: [shortFixture], safeStatementId: "fixture-clover-short",
      runVersion: "run-three-test", outputDirectory, sourceProfile: { statementCompleteness: "unknown" } });
    expect(result.audit).toMatchObject({
      schemaVersion: "fiserv_pre_uat_run_audit_v5",
      harnessVersion: "fiserv_pre_uat_one_statement_v5",
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
