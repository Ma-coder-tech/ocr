import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildStatementObservationInvestigationOrigins,
  evaluateFiservFullTemplateAdmission,
  inspectFiservOneStatementEvaluation,
} from "../../../../src/canonical/v2/index.js";

const fullFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf");
const shortFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf");
const otherFullFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");
const unreconciledFullFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/Nov_2024_Statement.pdf");

type Inspected = Awaited<ReturnType<typeof inspectFiservOneStatementEvaluation>>;
let full: Inspected;
let short: Inspected;
let otherFull: Inspected;
let unreconciledFull: Inspected;

beforeAll(async () => {
  [full, short, otherFull, unreconciledFull] = await Promise.all([
    inspectFiservOneStatementEvaluation({ statementPaths: [fullFixture], safeStatementId: "full-structural-control",
      sourceProfile: { statementCompleteness: "unknown" } }),
    inspectFiservOneStatementEvaluation({ statementPaths: [shortFixture], safeStatementId: "short-structural-control",
      sourceProfile: { statementCompleteness: "unknown" } }),
    inspectFiservOneStatementEvaluation({ statementPaths: [otherFullFixture], safeStatementId: "other-full-structural-control",
      sourceProfile: { statementCompleteness: "unknown" } }),
    inspectFiservOneStatementEvaluation({ statementPaths: [unreconciledFullFixture], safeStatementId: "unreconciled-full-control",
      sourceProfile: { statementCompleteness: "unknown" } }),
  ]);
}, 30_000);

function evaluate(parserOutput: unknown, foundation = full.observationalFoundation, driverId = full.driver.id) {
  return evaluateFiservFullTemplateAdmission({ driverId, parserOutput, observationalFoundation: foundation });
}

describe("reusable Fiserv / First Data full-layout admission", () => {
  it("admits the real full-layout fixture from cross-section structure and reconciliation", () => {
    const result = evaluate(full.parserOutput);
    expect(result.resolution).toMatchObject({
      mappingId: "fiserv_first_data_full_statement",
      mappingVersion: "1.0.0",
      feeDetailCoverage: "complete_observed_occurrences",
      templateAdmission: { admissionStatus: "admitted", completenessStatus: "unknown" },
    });
    expect(result.decision).toMatchObject({
      matched: true,
      reasonCodes: [
        "full_admission_accepted_cross_section_structure",
        "full_admission_accepted_deterministic_economics",
        "full_admission_scope_limited_to_enumerated_capabilities",
      ],
      rejectedAlternativeFamily: {
        familyCode: "fiserv_first_data_short_statement",
        reasonCode: "short_family_rejected_interchange_program_detail_present",
      },
    });
    expect(result.decision.structuralMarkers.filter((item) => item.requirement === "required")
      .every((item) => item.status === "passed")).toBe(true);
    expect(result.decision.structuralMarkers.filter((item) => item.requirement === "prohibited")
      .every((item) => item.status === "absent")).toBe(true);
    expect(result.decision.reconciliationControls.filter((item) => item.status !== "permitted_unresolved")
      .every((item) => item.status === "passed")).toBe(true);
    expect(result.decision.permittedUnresolvedConditions).toEqual(expect.arrayContaining([
      "processor_statement_completeness_not_independently_proven",
      "interchange_summary_and_detail_totals_are_non_equivalent_controls",
      "pricing_architecture_unresolved",
      "fee_economic_category_and_ownership_unresolved",
    ]));
    expect(JSON.stringify(result.decision)).not.toMatch(/SAMPLE_MERCHANT|merchantNumber|PEPES|2024-10|52497|1312\.55/i);
  });

  it("keeps the current full-layout profile deterministic-only until the frozen planner expands", () => {
    const planner = buildStatementObservationInvestigationOrigins({
      foundation: full.observationalFoundation,
      admittedKnowledge: [],
      tenantRef: "full-admission-test",
      accountRef: "full-admission-test",
    });
    expect(planner.origins).toEqual([]);
    expect(planner.runtimeOrigins).toEqual([]);
    expect(planner.unknownQueue).toEqual([]);
    expect(planner.providerContexts).toEqual([]);
    expect(planner.rejected).toHaveLength(138);
    expect(planner.rejected.every((item) => item.reasonCode === "observation_label_not_registered")).toBe(true);
  });

  it("admits another processor-branded corpus fixture through the same family controls", () => {
    const result = evaluateFiservFullTemplateAdmission({
      driverId: otherFull.driver.id,
      parserOutput: otherFull.parserOutput,
      observationalFoundation: otherFull.observationalFoundation,
    });
    expect(result.resolution).toMatchObject({
      mappingId: "fiserv_first_data_full_statement",
      mappingVersion: "1.0.0",
    });
    expect(result.decision.matched).toBe(true);
    expect(result.decision.structuralMarkers.filter((item) => item.requirement === "required")
      .every((item) => item.status === "passed")).toBe(true);
  });

  it("rejects a full-layout parser candidate whose existing economic controls fail", () => {
    const result = evaluateFiservFullTemplateAdmission({
      driverId: unreconciledFull.driver.id,
      parserOutput: unreconciledFull.parserOutput,
      observationalFoundation: unreconciledFull.observationalFoundation,
    });
    expect(result.resolution).toBeNull();
    expect(result.decision.reasonCodes).toEqual(expect.arrayContaining([
      "full_admission_failed_all_batch_rows_and_columns_reconcile",
      "full_admission_failed_gross_minus_refunds_equals_net_submitted",
      "full_admission_failed_required_procedural_reconciliations",
    ]));
  });

  it("rejects the short layout even when full-layout fixture metadata is copied onto it", () => {
    const parserOutput = structuredClone(short.parserOutput);
    parserOutput.statementIdentity.statementFamily = "fiserv_first_data_full_statement";
    parserOutput.statementIdentity.sourceFileName = "SAMPLE_MERCHANT4_CLOVER.pdf";
    parserOutput.statementIdentity.merchantName = full.parserOutput.statementIdentity.merchantName;
    const result = evaluate(parserOutput, short.observationalFoundation, short.driver.id);
    expect(result.resolution).toBeNull();
    expect(result.decision.matched).toBe(false);
    expect(result.decision.reasonCodes).toEqual(expect.arrayContaining([
      "full_admission_failed_full_structure_driver_and_family",
      "full_admission_failed_interchange_program_detail_structure",
      "full_admission_failed_full_three_bucket_fee_summary",
    ]));
  });

  it.each([
    ["truncated extraction", (parser: any, foundation: any) => {
      foundation.documentIntegrity.suppliedDocumentStatus = "incomplete_or_corrupt_supplied_document";
      foundation.documentIntegrity.localIngestionTruncated = true;
    }, "full_admission_failed_complete_local_extraction_lineage"],
    ["wrong processor family", (parser: any) => {
      parser.statementIdentity.processorFamily = "Unrelated Processor";
    }, "full_admission_failed_fiserv_first_data_processor_scope"],
    ["missing required relationship", (parser: any) => {
      parser.reconciliationResults = parser.reconciliationResults.filter((item: any) =>
        item.identity !== "cross_reference:summary_by_card_type_submitted_eq_selected_submitted");
    }, "full_admission_failed_required_procedural_reconciliations"],
    ["contradictory fee section total", (parser: any) => {
      parser.feeBreakdown.buckets[0].amount += 1;
    }, "full_admission_failed_three_fee_buckets_equal_statement_fee_total"],
    ["malformed fee extraction", (parser: any) => {
      parser.feeLedger.rows = [];
    }, "full_admission_failed_transaction_and_account_fee_sections"],
    ["failed headline reconciliation", (parser: any) => {
      parser.reconciliationResults.find((item: any) =>
        item.identity === "headline:submitted_plus_adjustments_minus_fees_eq_processed").status = "RECON_FAIL";
    }, "full_admission_failed_required_procedural_reconciliations"],
  ])("fails closed for %s", (_label, mutate, expectedReason) => {
    const parserOutput = structuredClone(full.parserOutput);
    const foundation = structuredClone(full.observationalFoundation);
    mutate(parserOutput, foundation);
    const result = evaluate(parserOutput, foundation);
    expect(result.resolution).toBeNull();
    expect(result.decision.matched).toBe(false);
    expect(result.decision.reasonCodes).toContain(expectedReason);
  });
});
