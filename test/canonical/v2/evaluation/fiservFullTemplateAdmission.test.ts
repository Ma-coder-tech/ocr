import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildStatementObservationInvestigationOrigins,
  evaluateFiservFullTemplateAdmission,
  finalizeObservationPlanningAudit,
  inspectFiservOneStatementEvaluation,
  inspectProviderSafeQuestionContext,
  normalizeObservationLabel,
  planRuntimeResearchQuestions,
  PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS,
  registeredObservationSubjectIdentity,
  resolveObservationSubjectRule,
  safePublicSearchQuery,
  unboundedKnowledgeScope,
  type CanonicalEconomicsV2Foundation,
  type KnowledgeEntry,
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

function buildAndPlan(foundation: CanonicalEconomicsV2Foundation, admittedKnowledge: readonly KnowledgeEntry[] = []) {
  const origins = buildStatementObservationInvestigationOrigins({
    foundation,
    admittedKnowledge,
    tenantRef: "full-layout-planner-test",
    accountRef: "full-layout-planner-test",
  });
  const questions = planRuntimeResearchQuestions({ entries: admittedKnowledge,
    unknownQueue: origins.unknownQueue, origins: origins.runtimeOrigins, maximumSelectedQuestions: 4 });
  return { origins, questions };
}

function admittedTerm(subjectCode: string): KnowledgeEntry {
  return { id: `admitted-${subjectCode}`, version: 1, claimType: "processor_term", subjectCode,
    value: { kind: "term", termCode: subjectCode, termValue: "bounded_public_definition" },
    scope: unboundedKnowledgeScope(), visibility: "reusable", tenantRef: null, accountRef: null,
    effectiveFrom: null, effectiveTo: null,
    evidence: [{ ref: `evidence-${subjectCode}`, sourceAuthority: "processor_publication", private: false }],
    admission: { lifecycle: "admitted", authorityClass: "authorized_domain_reviewer", authorityRef: "review-role",
      admittedAt: "2026-08-24T00:00:00Z", conditions: [] }, supersedes: [], limitations: [], confidence: "high" };
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

  it("maps a bounded registered subset and keeps every other full-layout observation auditable", () => {
    const planner = buildStatementObservationInvestigationOrigins({
      foundation: full.foundation,
      admittedKnowledge: [],
      tenantRef: "full-admission-test",
      accountRef: "full-admission-test",
    });
    expect(planner.planningInventory).toMatchObject({ rawNonzeroObservationCount: 138,
      normalizedObservationIdentityCount: 138, mappedSubjectCount: 4, suppressedObservationCount: 130,
      suppressedCountsByReason: { observation_control_total_not_research_subject: 4, observation_label_not_registered: 126 } });
    expect(planner.origins.map((item) => item.subjectCode)).toEqual([
      "payment_network_assessment_fee_terminology",
      "network_authorization_fee_terminology",
      "discover_data_usage_fee_terminology",
      "visa_transaction_integrity_fee_terminology",
    ]);
    expect(planner.runtimeOrigins).toHaveLength(4);
    expect(planner.unknownQueue).toHaveLength(4);
    expect(planner.providerContexts).toHaveLength(4);
    expect(planner.rejected).toHaveLength(130);
  });

  it("normalizes only controlled calculation suffixes and fails closed outside the registry scope", () => {
    const authorization = normalizeObservationLabel("Network Authorization Fee 99 Transactions at $0.10");
    expect(authorization).toMatchObject({ calculationFreeLabel: "network authorization fee",
      calculationSuffixKind: "transaction_count_at_rate" });
    expect(resolveObservationSubjectRule({ templateFamily: "fiserv_first_data_full_statement",
      sourceSection: "TRANSACTION FEES", normalized: authorization })?.subjectCode)
      .toBe("network_authorization_fee_terminology");
    expect(resolveObservationSubjectRule({ templateFamily: "fiserv_first_data_full_statement",
      sourceSection: "ACCOUNT FEES", normalized: authorization })).toBeNull();
    expect(resolveObservationSubjectRule({ templateFamily: "fiserv_first_data_short_structural_mapping",
      sourceSection: "TRANSACTION FEES", normalized: authorization })).toBeNull();
    expect(resolveObservationSubjectRule({ templateFamily: "fiserv_first_data_full_statement",
      sourceSection: "TRANSACTION FEES",
      normalized: normalizeObservationLabel("Network Authorization Fee Premium 99 Transactions at $0.10") })).toBeNull();
    expect(registeredObservationSubjectIdentity({ questionClass: "observed_statement_term_public_definition",
      subjectCode: "arbitrary_fixture_term", safeResearchLabel: "arbitrary fixture term" })).toBe(false);
  });

  it("plans four bounded RF-first questions with exact multi-observation lineage and no amount ranking", () => {
    const first = buildAndPlan(full.foundation);
    expect(first.origins.planningInventory.subjects).toEqual([
      expect.objectContaining({ subjectCode: "payment_network_assessment_fee_terminology", occurrenceCount: 5,
        aggregateAmountMinor: 6887, priority: "material_operational_action" }),
      expect.objectContaining({ subjectCode: "network_authorization_fee_terminology", occurrenceCount: 1,
        aggregateAmountMinor: 55, priority: "material_operational_action" }),
      expect.objectContaining({ subjectCode: "discover_data_usage_fee_terminology", occurrenceCount: 1,
        aggregateAmountMinor: 7, priority: "material_operational_action" }),
      expect.objectContaining({ subjectCode: "visa_transaction_integrity_fee_terminology", occurrenceCount: 1,
        aggregateAmountMinor: 50, priority: "material_operational_action" }),
    ]);
    expect(first.questions).toHaveLength(4);
    expect(first.questions.every((question) => question.eligibility === "eligible"
      && question.selection === "selected" && question.reasonCodes.includes("selected_by_deterministic_priority"))).toBe(true);
    const assessment = first.origins.origins.find((item) => item.subjectCode === "payment_network_assessment_fee_terminology")!;
    expect(assessment.occurrenceRefs).toHaveLength(5);
    expect(assessment.evidenceRefs).toHaveLength(5);
    expect(first.questions.filter((item) => item.subjectCode === assessment.subjectCode)).toHaveLength(1);

    const changedAmounts = structuredClone(full.foundation);
    changedAmounts.sourceModel.occurrences.forEach((occurrence, index) => {
      if (occurrence.semanticRole === "fee_charge" && occurrence.printedAmount?.amountMinor) {
        occurrence.printedAmount.amountMinor = (index % 17) + 1;
      }
    });
    const second = buildAndPlan(changedAmounts);
    const signature = (questions: typeof first.questions) => questions.map((question) => ({
      subjectCode: question.subjectCode, eligibility: question.eligibility, selection: question.selection,
      priority: question.priority, reasonCodes: question.reasonCodes,
    }));
    expect(signature(second.questions)).toEqual(signature(first.questions));
  });

  it("cross-generalizes the same subject model to the Wells Fargo fixture", () => {
    const statementTwo = buildAndPlan(full.foundation);
    const result = buildAndPlan(otherFull.foundation);
    expect(result.origins.planningInventory).toMatchObject({ rawNonzeroObservationCount: 108,
      normalizedObservationIdentityCount: 108, mappedSubjectCount: 4, suppressedObservationCount: 100,
      suppressedCountsByReason: { observation_control_total_not_research_subject: 4,
        observation_label_not_registered: 96 } });
    expect(result.origins.planningInventory.subjects).toEqual([
      expect.objectContaining({ subjectCode: "payment_network_assessment_fee_terminology", occurrenceCount: 5,
        aggregateAmountMinor: 23998 }),
      expect.objectContaining({ subjectCode: "network_authorization_fee_terminology", occurrenceCount: 1,
        aggregateAmountMinor: 118 }),
      expect.objectContaining({ subjectCode: "discover_data_usage_fee_terminology", occurrenceCount: 1,
        aggregateAmountMinor: 15 }),
      expect.objectContaining({ subjectCode: "visa_transaction_integrity_fee_terminology", occurrenceCount: 1,
        aggregateAmountMinor: 10 }),
    ]);
    expect(result.questions.map((item) => [item.subjectCode, item.selection])).toEqual([
      ["discover_data_usage_fee_terminology", "selected"],
      ["network_authorization_fee_terminology", "selected"],
      ["payment_network_assessment_fee_terminology", "selected"],
      ["visa_transaction_integrity_fee_terminology", "selected"],
    ]);
    const statementTwoPatterns = new Set(statementTwo.origins.planningInventory.observations
      .map((item) => item.normalizedSubjectPatternRef));
    const wellsFargoPatterns = new Set(result.origins.planningInventory.observations
      .map((item) => item.normalizedSubjectPatternRef));
    expect([...statementTwoPatterns].filter((pattern) => wellsFargoPatterns.has(pattern))).toHaveLength(76);
    expect(statementTwo.origins.planningInventory.observations.every((item) => item.sameNormalizedLabelCount === 1
      && item.sameNormalizedPatternCount === 1)).toBe(true);
    expect(result.origins.planningInventory.observations.every((item) => item.sameNormalizedLabelCount === 1
      && item.sameNormalizedPatternCount === 1)).toBe(true);
  });

  it("applies RF before research selection and records that no new public source is admitted", () => {
    const knowledge = [admittedTerm("payment_network_assessment_fee_terminology")];
    const result = buildAndPlan(full.foundation, knowledge);
    expect(result.questions.find((item) => item.subjectCode === "payment_network_assessment_fee_terminology"))
      .toMatchObject({ rfResolution: { status: "resolved_single" }, eligibility: "rf_resolved", selection: "not_eligible" });
    expect(result.questions.filter((item) => item.selection === "selected")).toHaveLength(3);
    const audit = finalizeObservationPlanningAudit({ inventory: result.origins.planningInventory,
      questions: result.questions, publicSourceAuthorityAdmissions: PRODUCTION_PUBLIC_SOURCE_AUTHORITY_ADMISSIONS });
    expect(audit.eligibleSubjectCount).toBe(3);
    expect(audit.selectedQuestionCount).toBe(3);
    expect(audit.subjectDecisions.find((item) => item.subjectCode === "payment_network_assessment_fee_terminology"))
      .toMatchObject({ rfResolutionStatus: "resolved_single", eligibility: "rf_resolved", selection: "not_eligible",
        sourceAuthorityAvailability: "dynamic_discovery_permitted_no_current_source_admission" });
    expect(audit.subjectDecisions.filter((item) => item.selection === "selected")
      .every((item) => item.sourceAuthorityAvailability === "dynamic_discovery_permitted_no_current_source_admission")).toBe(true);
  });

  it("produces provider-safe controlled queries without fixture, merchant, amount, or lineage material", () => {
    const result = buildAndPlan(full.foundation);
    result.origins.providerContexts.forEach((context) => {
      expect(inspectProviderSafeQuestionContext(context)).toEqual({ valid: true, reasonCodes: [] });
      const question = result.questions.find((item) => item.subjectCode === context.subjectCode)!;
      const query = safePublicSearchQuery({ question, context, kind: "initial" });
      expect(query.queryText).toContain(context.safeResearchLabel);
      expect(JSON.stringify({ context, query })).not.toMatch(/SAMPLE_MERCHANT|CLOVER\.pdf|merchant|accountRef|tenantRef|amountMinor|occurrenceRef|evidenceRef|6887|1312\.55/i);
    });
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
    expect(() => buildAndPlan(unreconciledFull.foundation)).toThrow("observation_planning_requires_admitted_template");
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
