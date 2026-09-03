import { beforeAll, describe, expect, it } from "vitest";

import {
  evaluateRbAdjustmentChargebackRepresentationPolicy,
  RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY,
} from "../../../../src/canonical/v2/adjustmentChargebackRepresentationPolicy.js";
import { RB_DEPENDENCY_REGISTRY } from "../../../../src/canonical/v2/rbDependencyRegistry.js";
import { validateCanonicalEconomicsV2Foundation } from "../../../../src/canonical/v2/validate.js";
import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import { qualifyCombinedAdjustmentChargebackAmount } from "../../../../src/reconstructionKernel/combinedAdjustmentChargebackQualification.js";
import { assessStatementCompleteness } from "../../../../src/reconstructionKernel/statementCompleteness.js";
import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import { rescueSourceFiles } from "../../../fixtures/reconstructionKernel/rescueSourceManifest.js";

const additionalFiles = {
  "paysafe-february-2024": "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
  "priority-payment-systems-december-2024": "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "paysafe-zero-volume-september-2025": "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
} as const;
const files = { ...rescueSourceFiles, ...additionalFiles };
type CaseId = keyof typeof files;
const documents = new Map<CaseId, ParsedDocument>();

function execute(caseId: CaseId, qualification: boolean) {
  return executeDocument(caseId, documents.get(caseId)!, qualification);
}

function executeDocument(caseId: CaseId, document: ParsedDocument, qualification: boolean) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `combined-adjustment-chargeback-${caseId}`,
    sourceDocumentRef: files[caseId],
    document,
    executionContext: "evaluation_compatibility",
    ...(qualification ? { combinedAdjustmentChargebackQualification: { enabled: true as const } } : {}),
  });
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[CaseId, string]>).map(async ([caseId, file]) => {
    documents.set(caseId, await parsePdf(file));
  }));
}, 30_000);

describe("explicit combined adjustment/chargeback shadow qualification", () => {
  const positiveCases = {
    "paysafe-october-2025": 0,
    "vortax-september-2022": 21_176,
    "paysafe-february-2024": 0,
    "priority-payment-systems-december-2024": -600,
    "paysafe-zero-volume-september-2025": 0,
  } as const;

  for (const [caseId, expectedMinor] of Object.entries(positiveCases) as Array<[keyof typeof positiveCases, number]>) {
    it(`qualifies the exact direct combined field without granting authority for ${caseId}`, () => {
      const baseline = execute(caseId, false);
      const evaluated = execute(caseId, true);
      const result = evaluated.diagnostics.combinedAdjustmentChargebackQualification!;

      expect(evaluated.run).toEqual(baseline.run);
      expect(result).toMatchObject({
        authority: "shadow_qualification_no_canonical_authority",
        canonicalMutation: "none",
        dependencyPropagation: "prohibited",
        providerAuthority: "prohibited",
        status: "qualified",
        currentAuthorityScope: [
          "grossSaleVolume",
          "refundVolume",
          "grossSaleTransactionCount",
          "refundTransactionCount",
          "submittedTransactionCount",
        ],
        categoryIdentity: "adjustments_chargebacks",
        processorPresentedLabel: "Adjustments/Chargebacks",
        candidate: {
          value: { amountMinor: expectedMinor, currency: "USD" },
          meaning: "processor_presented_combined_adjustments_chargebacks",
          support: "first_class_processor_presented_category_with_passing_claim_control",
          prohibitedInterpretations: [
            "settlement_adjustment",
            "chargeback_principal",
            "chargeback_representment",
            "reversal",
            "chargeback_fee",
            "lifecycle_conclusion",
            "net_funded_authority",
          ],
        },
        reasonCodes: [
          "first_class_processor_presented_category_source_bound",
          "processor_presented_meaning_preserved_without_subtype_inference",
          "claim_specific_category_control_passes",
          "all_exclusion_conditions_satisfied",
        ],
        errors: [],
      });
      expect(result.currentAuthorityScope).not.toContain("unresolvedAdjustmentChargebackAmount");
      expect(result.qualificationHash).toMatch(/^[a-f0-9]{64}$/);
      const representation = evaluated.run.artifacts.rb!.sourceModel.processorPresentedCategories.find((item) =>
        item.categoryIdentity === "adjustments_chargebacks")!;
      const control = evaluated.run.artifacts.rb!.sourceModel.processorPresentedCategoryControls.find((item) =>
        item.categoryIdentity === "adjustments_chargebacks")!;
      expect(result.candidate).toMatchObject({
        representationRef: representation.id,
        categoryControlRef: control.id,
        sourceProvenance: representation.sourceProvenance,
      });
      expect(control).toMatchObject({ status: "pass", representationRef: representation.id,
        authorityEffect: "none_observation_only" });
      expect(result.exclusionConditions.every((item) => item.state === "satisfied")).toBe(true);
      expect(result.futureAuthorityBlockers).toContain("nonzero_third_party_transaction_source_evidence_not_in_current_corpus");
      if (caseId === "vortax-september-2022") {
        expect(result.statementCompleteness).toMatchObject({
          suppliedPageProcessing: { status: "all_supplied_pages_processed", provesStatementCompleteness: false },
          statementCompleteness: {
            status: "proven_incomplete",
            expectedStatementPageCount: 11,
            suppliedPdfPageCount: 10,
            missingStatementPageNumbers: [11],
            authorityEligible: false,
          },
        });
        expect(result.futureAuthorityBlockers).toContain("processor_statement_proven_incomplete");
      } else {
        expect(result.statementCompleteness.statementCompleteness.status).toBe("proven_complete");
        expect(result.futureAuthorityBlockers).not.toContain("processor_statement_completeness_unproven");
      }
      expect(result.futureAuthorityAssessment).toMatchObject({ status: "withheld", grantsAuthority: false });
    });
  }

  for (const caseId of ["basys-march-2020", "wells-fargo-september-2024", "clover-duplicate-resubmission"] as const) {
    it(`withholds layouts that derive rather than explicitly print the combined field for ${caseId}`, () => {
      const result = execute(caseId, true).diagnostics.combinedAdjustmentChargebackQualification!;
      expect(result.status).toBe("withheld");
      expect(result.candidate).toBeNull();
      expect(result.reasonCodes).toContain("explicit_combined_adjustments_chargebacks_field_not_observed");
      expect(result.currentAuthorityScope).toHaveLength(5);
    });
  }

  it("does not let an unrelated funding-calculation failure remove a combined-category observation", () => {
    const document = structuredClone(documents.get("paysafe-october-2025")!);
    const funded = document.rows.find((row) => /total amount funded to your bank/i.test(String(row.content ?? "")));
    expect(funded).toBeDefined();
    funded!.content = `${String(funded!.content)} $0.00`;
    const evaluated = executeDocument("paysafe-october-2025", document, true);
    const result = evaluated.diagnostics.combinedAdjustmentChargebackQualification!;

    expect(result.status).toBe("qualified");
    expect(result.candidate?.support)
      .toBe("first_class_processor_presented_category_with_passing_claim_control");
    expect(result.reasonCodes).not.toContain("funding_control_did_not_reconstruct_as_passing");
  });

  it("fails closed on duplicated source scope, incomplete source, and source mismatch while surfacing RB split selections", () => {
    const caseId = "vortax-september-2022" as const;
    const document = documents.get(caseId)!;
    const base = execute(caseId, false).run.artifacts.rb!;

    const duplicated = structuredClone(document);
    const combinedRow = duplicated.rows.find((row) =>
      /^adjustments\s*\/\s*chargebacks$/i.test(String(row.content ?? "").trim()))!;
    duplicated.rows.push(structuredClone(combinedRow));
    const duplicateResult = executeDocument(caseId, duplicated, true)
      .diagnostics.combinedAdjustmentChargebackQualification!;
    expect(duplicateResult.status).toBe("withheld");
    expect(duplicateResult.reasonCodes).toContain("combined_adjustments_chargebacks_source_scope_is_ambiguous");

    const incomplete = structuredClone(base);
    incomplete.documentIntegrity.suppliedDocumentStatus = "incomplete_or_corrupt_supplied_document";
    const incompleteResult = qualifyCombinedAdjustmentChargebackAmount({ document,
      sourceDocumentRef: files[caseId], foundation: incomplete, executionContext: "evaluation_compatibility" });
    expect(incompleteResult.status).toBe("withheld");
    expect(incompleteResult.reasonCodes).toContain("supplied_document_integrity_not_complete");

    const mismatch = qualifyCombinedAdjustmentChargebackAmount({
      document: documents.get("paysafe-october-2025")!, sourceDocumentRef: files[caseId],
      foundation: base, executionContext: "evaluation_compatibility",
    });
    expect(mismatch.status).toBe("withheld");
    expect(mismatch.reasonCodes).toContain("source_fingerprint_or_reference_mismatch");

    const split = structuredClone(base);
    split.financialPopulations.settlementAdjustmentAmount = {
      ...split.financialPopulations.settlementAdjustmentAmount,
      status: "available",
      value: { amountMinor: 100, currency: "USD" },
      confidence: "high",
      provenanceStatus: "authoritative",
    };
    const splitResult = qualifyCombinedAdjustmentChargebackAmount({ document,
      sourceDocumentRef: files[caseId], foundation: split, executionContext: "evaluation_compatibility" });
    expect(splitResult.status).toBe("qualified");
    expect(splitResult.rbComparison.selectedSplitPopulationKeys).toContain("settlementAdjustmentAmount");
    expect(splitResult.candidate?.prohibitedInterpretations).toContain("settlement_adjustment");
    expect(splitResult.representationPolicy).toMatchObject({
      collision: "none",
      resolution: "preserve_processor_combined_observation_and_proven_splits",
      combinedSourceObservationPreserved: true,
      sourceRepresentationRelationship: "combined_and_split",
      authorityEligible: false,
    });
    expect(splitResult.futureAuthorityBlockers)
      .toContain("combined_contribution_authority_withheld_while_split_facts_selected");
  });

  it("distinguishes complete supplied-page processing from complete processor-statement pagination", () => {
    const paysafe = execute("paysafe-october-2025", true)
      .diagnostics.combinedAdjustmentChargebackQualification!.statementCompleteness;
    const vortax = execute("vortax-september-2022", true)
      .diagnostics.combinedAdjustmentChargebackQualification!.statementCompleteness;

    expect(paysafe.suppliedPageProcessing.status).toBe("all_supplied_pages_processed");
    expect(paysafe.suppliedPageProcessing.provesStatementCompleteness).toBe(false);
    expect(paysafe.statementCompleteness).toMatchObject({
      status: "proven_complete", proofBasis: "printed_contiguous_page_x_of_n",
      expectedStatementPageCount: 4, suppliedPdfPageCount: 4, missingStatementPageNumbers: [],
    });
    expect(paysafe.printedPaginationEvidence.map((item) => item.printedStatementPage)).toEqual([1, 2, 3, 4]);

    expect(vortax.suppliedPageProcessing.status).toBe("all_supplied_pages_processed");
    expect(vortax.statementCompleteness).toMatchObject({
      status: "proven_incomplete", proofBasis: "printed_page_x_of_n_shortfall",
      expectedStatementPageCount: 11, suppliedPdfPageCount: 10, missingStatementPageNumbers: [11],
    });
    expect(vortax.assessmentHash).toMatch(/^[a-f0-9]{64}$/);

    const artifactCountOnly = structuredClone(execute("vortax-september-2022", false).run.artifacts.rb!);
    artifactCountOnly.documentIntegrity.expectedPageCount = 10;
    artifactCountOnly.documentIntegrity.completenessStatus = "complete";
    artifactCountOnly.documentIntegrity.proofEvidenceRefs = [artifactCountOnly.sourceModel.evidence[0]!.id];
    const sourceWins = assessStatementCompleteness({
      document: documents.get("vortax-september-2022")!,
      foundation: artifactCountOnly,
      sourceDocumentRef: files["vortax-september-2022"],
    });
    expect(sourceWins.statementCompleteness).toMatchObject({
      status: "proven_incomplete", expectedStatementPageCount: 11,
      suppliedPdfPageCount: 10, missingStatementPageNumbers: [11],
    });
  });

  it("proves a generic truncation from printed pagination and leaves unnumbered sources unproven", () => {
    const caseId = "paysafe-october-2025" as const;
    const foundation = structuredClone(execute(caseId, false).run.artifacts.rb!);
    const truncated = structuredClone(documents.get(caseId)!);
    truncated.rows = truncated.rows.filter((row) => String(row.page) !== "page-4");
    truncated.suppliedDocumentIntegrity = {
      openedSuccessfully: true, enumeratedPageCount: 3, processedPageCount: 3,
      fatalPageErrorCount: 0, extractionLineageComplete: true, localIngestionTruncated: false,
    };
    foundation.documentIntegrity = {
      ...foundation.documentIntegrity,
      suppliedDocumentStatus: "complete_supplied_document",
      observedPageCount: 3,
      processedPageCount: 3,
      fatalPageErrorCount: 0,
      extractionLineageComplete: true,
      localIngestionTruncated: false,
    };
    const incomplete = assessStatementCompleteness({ document: truncated, foundation,
      sourceDocumentRef: files[caseId] });
    expect(incomplete.suppliedPageProcessing.status).toBe("all_supplied_pages_processed");
    expect(incomplete.statementCompleteness).toMatchObject({
      status: "proven_incomplete", expectedStatementPageCount: 4,
      suppliedPdfPageCount: 3, missingStatementPageNumbers: [4], authorityEligible: false,
    });

    const unnumbered = structuredClone(documents.get(caseId)!);
    unnumbered.rows = unnumbered.rows.filter((row) => !/\bpage\s+0*\d+\s+of\s+0*\d+\b/i.test(String(row.content ?? "")));
    const unknown = assessStatementCompleteness({ document: unnumbered,
      foundation: execute(caseId, false).run.artifacts.rb!, sourceDocumentRef: files[caseId] });
    expect(unknown.suppliedPageProcessing.status).toBe("all_supplied_pages_processed");
    expect(unknown.statementCompleteness).toMatchObject({ status: "unproven", authorityEligible: false });

    const conflicting = structuredClone(documents.get(caseId)!);
    for (let page = 1; page <= 4; page += 1) {
      conflicting.rows.push({ page: `page-${page}`, content: `Page ${page} of 5` });
    }
    const ambiguous = assessStatementCompleteness({ document: conflicting,
      foundation: execute(caseId, false).run.artifacts.rb!, sourceDocumentRef: files[caseId] });
    expect(ambiguous.statementCompleteness).toMatchObject({ status: "unproven", authorityEligible: false });
    expect(ambiguous.reasonCodes).toContain("multiple_competing_printed_pagination_sequences");
  });

  it("preserves combined and split knowledge without assuming missing members or counting related fees twice", () => {
    const base = structuredClone(execute("paysafe-february-2024", false).run.artifacts.rb!);
    clearAdjustmentChargebackSelections(base);
    selectMoney(base, "settlementAdjustmentAmount", 200);
    const partial = evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: base.financialPopulations, processorPresentedCategory: representationWithAmount(base, 200),
    });
    expect(partial).toMatchObject({
      splitSetStatus: "partial", reconstructedSplitNetMinor: null, valueRelationship: "not_comparable",
      resolution: "preserve_processor_combined_observation_and_proven_splits",
      sourceRepresentationRelationship: "combined_and_split", authorityEligible: false,
    });
    expect(partial.reasonCodes).toContain("partial_split_set_cannot_be_completed_with_assumed_zero");

    selectMoney(base, "chargebackPrincipalDebitAmount", 150);
    selectMoney(base, "chargebackRepresentmentAmount", 50);
    const matching = evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: base.financialPopulations, processorPresentedCategory: representationWithAmount(base, 100),
    });
    expect(matching).toMatchObject({
      splitSetStatus: "complete", reconstructedSplitNetMinor: 100,
      valueRelationship: "matches_within_tolerance",
      resolution: "preserve_processor_combined_observation_and_proven_splits",
      authorityEligible: false,
    });
    expect(evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: base.financialPopulations, processorPresentedCategory: representationWithAmount(base, 101),
    }).valueRelationship).toBe("matches_within_tolerance");
    expect(evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: base.financialPopulations, processorPresentedCategory: representationWithAmount(base, 102),
    }).valueRelationship).toBe("contradicts");

    clearAdjustmentChargebackSelections(base);
    selectMoney(base, "chargebackFeeAmount", 700);
    const feeOnly = evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: base.financialPopulations, processorPresentedCategory: representationWithAmount(base, 100),
    });
    expect(feeOnly).toMatchObject({ selectedSplitPopulationKeys: [], splitSetStatus: "none", authorityEligible: true });
    expect(RB_ADJUSTMENT_CHARGEBACK_REPRESENTATION_POLICY.orthogonalRelatedPopulationKeys)
      .toEqual(["chargebackFeeAmount", "chargebackCount", "feeCreditAmount"]);
    expect(RB_DEPENDENCY_REGISTRY.some((entry) => entry.dependencies.includes(
      "unresolvedAdjustmentChargebackAmount" as never))).toBe(false);
  });

  it("rejects simultaneous canonical combined and split selection", () => {
    const base = structuredClone(execute("paysafe-february-2024", false).run.artifacts.rb!);
    clearAdjustmentChargebackSelections(base);
    selectMoney(base, "unresolvedAdjustmentChargebackAmount", 100);
    selectMoney(base, "settlementAdjustmentAmount", 100);
    const evaluated = evaluateRbAdjustmentChargebackRepresentationPolicy({ populations: base.financialPopulations });
    expect(evaluated).toMatchObject({
      collision: "canonical_simultaneous_selection", resolution: "fail_closed_canonical_collision",
      authorityEligible: false,
    });
    expect(validateCanonicalEconomicsV2Foundation(base).validation.errors)
      .toContain("An unresolved combined adjustment/chargeback fact cannot coexist as selected with separated adjustment or chargeback populations.");
  });

  it("fails closed when the first-class representation/control link is broken", () => {
    const caseId = "priority-payment-systems-december-2024" as const;
    const foundation = structuredClone(execute(caseId, false).run.artifacts.rb!);
    const representation = foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;
    representation.controlRefs = ["wrong-control-ref"];
    const result = qualifyCombinedAdjustmentChargebackAmount({ document: documents.get(caseId)!,
      sourceDocumentRef: files[caseId], foundation, executionContext: "evaluation_compatibility" });

    expect(result.status).toBe("withheld");
    expect(result.candidate).toBeNull();
    expect(result.reasonCodes).toContain("processor_presented_category_control_missing_or_unlinked");
  });

  it("cannot be requested in Production", () => {
    expect(() => executeDeterministicCanonicalAnalysisRun({
      runId: "combined-adjustment-chargeback-production-prohibited",
      sourceDocumentRef: files["paysafe-october-2025"],
      document: documents.get("paysafe-october-2025")!,
      executionContext: "production",
      combinedAdjustmentChargebackQualification: { enabled: true },
    })).toThrow("COMBINED_ADJUSTMENT_CHARGEBACK_QUALIFICATION_REQUIRES_EVALUATION_CONTEXT");
  });
});

function clearAdjustmentChargebackSelections(foundation: ReturnType<typeof execute>["run"]["artifacts"]["rb"] extends infer T
  ? NonNullable<T> : never): void {
  for (const key of ["settlementAdjustmentAmount", "chargebackPrincipalDebitAmount",
    "chargebackRepresentmentAmount", "chargebackFeeAmount", "unresolvedAdjustmentChargebackAmount"] as const) {
    const fact = foundation.financialPopulations[key];
    fact.status = "unavailable";
    fact.value = null;
    fact.confidence = null;
    fact.provenanceStatus = "observational";
    fact.evidenceRefs = [];
    fact.occurrenceRefs = [];
    fact.calculationRef = null;
    delete fact.authorityBasis;
  }
}

function representationWithAmount(
  foundation: NonNullable<ReturnType<typeof execute>["run"]["artifacts"]["rb"]>,
  amountMinor: number,
) {
  const representation = structuredClone(foundation.sourceModel.processorPresentedCategories.find((item) =>
    item.categoryIdentity === "adjustments_chargebacks")!);
  representation.observationStatus = "observed";
  representation.observedAmount = { amountMinor, currency: "USD" };
  return representation;
}

function selectMoney(
  foundation: NonNullable<ReturnType<typeof execute>["run"]["artifacts"]["rb"]>,
  key: "settlementAdjustmentAmount" | "chargebackPrincipalDebitAmount" | "chargebackRepresentmentAmount"
    | "chargebackFeeAmount" | "unresolvedAdjustmentChargebackAmount",
  amountMinor: number,
): void {
  const fact = foundation.financialPopulations[key];
  fact.status = "available";
  fact.value = { amountMinor, currency: "USD" };
  fact.confidence = "high";
  fact.provenanceStatus = "authoritative";
  fact.evidenceRefs = [foundation.sourceModel.evidence[0]!.id];
  fact.occurrenceRefs = [];
  fact.calculationRef = null;
}
