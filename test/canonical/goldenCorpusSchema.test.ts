import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  actualValuesFromPrivateCorpusManifest,
  evaluateCorpusCase,
  goldenCorpusCaseSchema,
  goldenCorpusExpectationSchema,
  loadGoldenCorpusCases,
  privateCorpusDirectoryFromEnv,
} from "../../scripts/canonical-corpus-lib.js";

describe("canonical golden corpus schema", () => {
  it("loads committed privacy-safe corpus metadata", async () => {
    const cases = await loadGoldenCorpusCases();

    expect(cases.map((corpusCase) => corpusCase.caseId)).toEqual(
      expect.arrayContaining(["GC-FISERV-SYNTHETIC-SUMMARY-001", "GC-FISERV-COUNT-DISCREPANCY-001"]),
    );
    for (const corpusCase of cases) {
      expect(corpusCase.privacy).toMatchObject({
        containsRealMerchantInformation: false,
        containsRawStatementText: false,
        containsPrivateDocumentPath: false,
        containsPrivateDocumentHash: false,
      });
    }
  });

  it("does not allow Codex-prepared candidates to become verified ground truth", () => {
    expect(() =>
      goldenCorpusExpectationSchema.parse({
        field: "financialFacts.totalFees",
        expectedValue: { amountMinor: 1000, currency: "USD" },
        verificationStatus: "verified",
        assertionRule: "must_equal",
        source: "candidate_codex_prepared",
        evidenceNote: "Candidate value matched current backend output.",
        reviewer: {
          role: "codex_candidate",
          reviewedAt: null,
          approvalStatus: "candidate_only",
        },
      }),
    ).toThrow();
  });

  it("requires known failures to keep complete defect metadata", () => {
    const parsed = goldenCorpusCaseSchema.parse({
      schemaVersion: "golden_corpus_case_v1",
      caseId: "GC-TEST-KNOWN-FAILURE-001",
      title: "Synthetic known failure",
      statementClass: "synthetic",
      source: {
        kind: "sanitized_json",
        publicFixturePath: "test/fixtures/canonical/golden-corpus/example.json",
      },
      privacy: {
        containsRealMerchantInformation: false,
        containsRawStatementText: false,
        containsPrivateDocumentPath: false,
        containsPrivateDocumentHash: false,
        redactionNotes: [],
      },
      humanVerification: {
        status: "approved",
        verifiedBy: "human_reviewer",
        verifiedAt: "2026-07-26",
        notes: "Synthetic test.",
      },
      expectedProcessorFamily: null,
      expectedReportState: null,
      expectations: [
        {
          field: "financialFacts.transactionCounts.submittedTransactions",
          expectedValue: 10,
          verificationStatus: "verified",
          assertionRule: "must_equal",
          source: "human_verified_statement",
          evidenceNote: "Synthetic evidence note.",
          reviewer: {
            role: "human_reviewer",
            reviewedAt: "2026-07-26",
            approvalStatus: "approved",
          },
          knownFailure: {
            defectId: "DEFECT-TEST-001",
            expectedGroundTruthValue: 10,
            currentIncorrectResult: 2,
            severity: "high",
            customerImpact: "Synthetic impact.",
            evidenceNote: "Synthetic evidence note.",
            targetCorrectionPackage: "Package B",
            status: "open",
            dateRecorded: "2026-07-26",
          },
        },
      ],
      tags: [],
    });

    expect(parsed.expectations[0]?.knownFailure?.defectId).toBe("DEFECT-TEST-001");
  });

  it("classifies known failures, improvements, regressions, and human-review cases distinctly", () => {
    const knownFailureCase = goldenCorpusCaseSchema.parse({
      schemaVersion: "golden_corpus_case_v1",
      caseId: "GC-TEST-EVALUATION-001",
      title: "Evaluation case",
      statementClass: "synthetic",
      source: {
        kind: "sanitized_json",
        publicFixturePath: "test/fixtures/canonical/golden-corpus/example.json",
      },
      privacy: {
        containsRealMerchantInformation: false,
        containsRawStatementText: false,
        containsPrivateDocumentPath: false,
        containsPrivateDocumentHash: false,
        redactionNotes: [],
      },
      humanVerification: {
        status: "approved",
        verifiedBy: "human_reviewer",
        verifiedAt: "2026-07-26",
        notes: "Synthetic test.",
      },
      expectedProcessorFamily: null,
      expectedReportState: null,
      expectations: [
        {
          field: "field.known",
          expectedValue: 10,
          verificationStatus: "verified",
          assertionRule: "must_equal",
          source: "human_verified_statement",
          evidenceNote: "Synthetic evidence note.",
          reviewer: { role: "human_reviewer", reviewedAt: "2026-07-26", approvalStatus: "approved" },
          knownFailure: {
            defectId: "DEFECT-TEST-001",
            expectedGroundTruthValue: 10,
            currentIncorrectResult: 2,
            severity: "high",
            customerImpact: "Synthetic impact.",
            evidenceNote: "Synthetic evidence note.",
            targetCorrectionPackage: "Package B",
            status: "open",
            dateRecorded: "2026-07-26",
          },
        },
        {
          field: "field.review",
          verificationStatus: "ambiguous",
          assertionRule: "human_review_required",
          source: "candidate_codex_prepared",
          evidenceNote: "Synthetic evidence note.",
          reviewer: { role: "codex_candidate", reviewedAt: null, approvalStatus: "candidate_only" },
        },
      ],
      tags: [],
    });

    const outcomes = new Set([
      evaluateCorpusCase(knownFailureCase, { "field.known": 2, "field.review": null }).expectationResults[0]?.outcome,
      evaluateCorpusCase(knownFailureCase, { "field.known": 10, "field.review": null }).expectationResults[0]?.outcome,
      evaluateCorpusCase(knownFailureCase, { "field.known": 4, "field.review": null }).expectationResults[0]?.outcome,
      evaluateCorpusCase(knownFailureCase, { "field.known": 2, "field.review": null }).expectationResults[1]?.outcome,
    ]);

    const passCase = goldenCorpusCaseSchema.parse({
      ...knownFailureCase,
      caseId: "GC-TEST-PASS-001",
      expectations: [
        {
          field: "field.pass",
          expectedValue: 7,
          verificationStatus: "verified",
          assertionRule: "must_equal",
          source: "human_verified_statement",
          evidenceNote: "Synthetic evidence note.",
          reviewer: { role: "human_reviewer", reviewedAt: "2026-07-26", approvalStatus: "approved" },
        },
      ],
    });
    outcomes.add(evaluateCorpusCase(passCase, { "field.pass": 7 }).outcome);

    expect(outcomes).toEqual(new Set(["known_failure", "unexpected_improvement", "new_regression", "human_review_required", "pass"]));
  });

  it("skips the private corpus runner safely when RATEREVEAL_PRIVATE_CORPUS_DIR is absent", () => {
    expect(privateCorpusDirectoryFromEnv({} as NodeJS.ProcessEnv)).toEqual({
      status: "skipped",
      reason: "RATEREVEAL_PRIVATE_CORPUS_DIR is not set.",
    });
  });

  it("derives private-corpus actual values from extracted document text instead of known-failure metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ratereveal-private-corpus-test-"));
    try {
      await fs.copyFile(
        path.resolve(process.cwd(), "test/fixtures/canonical/synthetic-pdfs/fiserv-summary-synthetic.pdf"),
        path.join(tempDir, "synthetic-private.pdf"),
      );

      const actualValues = await actualValuesFromPrivateCorpusManifest(tempDir, {
        schemaVersion: "private_corpus_manifest_v1",
        privateCorpusCaseId: "synthetic-private-case",
        documentFile: "synthetic-private.pdf",
        actualValueExtractors: [
          {
            field: "financialFacts.totalFees",
            source: "pdf_text",
            pattern: "Fees Charged(?:\\s*\\|\\s*|\\s+)-?\\$?([0-9,]+\\.\\d{2})",
            valueType: "money_usd",
          },
        ],
      });

      expect(actualValues["financialFacts.totalFees"]).toEqual({ amountMinor: 4321, currency: "USD" });
      expect(actualValues["financialFacts.totalFees"]).not.toEqual({ amountMinor: 9999, currency: "USD" });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
