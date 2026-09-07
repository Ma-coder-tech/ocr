import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  evaluateResidualDecomposition,
  governedMastercardFocusedRecords2024_2026V1,
  governedMastercardFocusedRules2024_2026V1,
  governedMastercardFocusedSources2024_2026V1,
} from "../../src/canonical/governedMastercardFocusedEvidence2024_2026V1.js";
import { governedUsNetworkReferenceRecords2020_2026V1 } from "../../src/canonical/governedUsNetworkFeeEvidence2020_2026V1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf } from "../../src/parser.js";

const PDF_ROOT = "test/fixtures/pdfs";
const FIXTURES: Array<{ file: string; businessType: BusinessTypeId }> = [
  { file: "Nov_2024_Statement.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT4_CLOVER.pdf", businessType: "restaurant_food_beverage" },
  { file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", businessType: "other" },
  { file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_NXGEN_VORTAX_Sep_2022.pdf", businessType: "retail" },
  { file: "fiserv_PAYSAFE_Febr_2024.pdf", businessType: "professional_services" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
  { file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
];
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

describe("Product-adjudicated focused Mastercard evidence 2024-2026", () => {
  it("admits the nine decisions while preserving raw source assertions and uncertainty", () => {
    const sources = governedMastercardFocusedSources2024_2026V1();
    const records = governedMastercardFocusedRecords2024_2026V1();
    const rules = governedMastercardFocusedRules2024_2026V1();
    expect(records.map((item) => item.recordId)).toEqual(Array.from({ length: 9 }, (_, index) => `MC-FOCUSED-${String(index + 1).padStart(2, "0")}`));
    expect(rules.map((item) => item.ruleId)).toEqual(Array.from({ length: 9 }, (_, index) => `RR-MCF-${String(index + 1).padStart(2, "0")}`));
    expect(rules.every((item) => item.sourceFingerprints.includes("0de1b4b1a724cf596bf05a0e8beba276c0fa9c1a9e363e7ff363562dbf17614a"))).toBe(true);
    expect(sources.every((item) => item.immutable && item.retainedPackageFingerprint === "0de1b4b1a724cf596bf05a0e8beba276c0fa9c1a9e363e7ff363562dbf17614a")).toBe(true);
    expect(sources.find((item) => item.sourceId === "nuvei_paya_mastercard_location_source")?.rawAssertions).toContain("The source states MCC 8938 and 8661.");
    const rawFiservLocation = governedUsNetworkReferenceRecords2020_2026V1().find((item) => item.recordId === "mastercard_location_2023_04")!;
    expect(rawFiservLocation.conflicts.join(" ")).toMatch(/8393.*8661/);
    expect(record(records, "MC-FOCUSED-04").disposition).toMatch(/8398.*8661/);
    expect(record(records, "MC-FOCUSED-07")).toMatchObject({ confidence: "UNRESOLVED" });
    expect(record(records, "MC-FOCUSED-07").prohibitedClaims).toEqual(expect.arrayContaining(["2026_rate_0_001375", "2026_rate_0_001475"]));
    expect(record(records, "MC-FOCUSED-01").effectiveDates.map((item) => item.value)).toEqual(["2024-04-05", "2024-04-15"]);
  });

  it("requires the cardinality and residual gates in both directions", () => {
    const exactMathOnly = evaluateResidualDecomposition({ printedValue: 0.001475, knownComponentValue: 0.0014, candidateComponent: { value: 0.000075, independentlyDocumented: false, sameNetworkAndProgram: true, periodApplicable: true, withinDocumentedRange: true, statementStructureCorroborates: false, acquirerSpecificApplicabilityProven: false } });
    expect(exactMathOnly).toMatchObject({ disposition: "candidate_component_insufficiently_supported", comparisonBlocked: true, exactArithmeticAloneIsProof: false, markupEstablished: false });
    const explained = evaluateResidualDecomposition({ printedValue: 0.001475, knownComponentValue: 0.0014, candidateComponent: { value: 0.000075, independentlyDocumented: true, sameNetworkAndProgram: true, periodApplicable: true, withinDocumentedRange: true, statementStructureCorroborates: true, acquirerSpecificApplicabilityProven: false } });
    expect(explained).toMatchObject({ disposition: "strongly_explained_by_legitimate_components_not_confirmed_at_par", comparisonBlocked: false, bundledComponentProven: false, markupEstablished: false });
    const below = evaluateResidualDecomposition({ printedValue: 0.0013, knownComponentValue: 0.0014, candidateComponent: null });
    expect(below).toMatchObject({ direction: "below_reference", disposition: "possible_unbundled_component_elsewhere", comparisonBlocked: true, underchargeEstablished: false });
  });

  it("applies the focused decisions across all 11 Fiserv Gold statements without changing financial truth", async () => {
    const corpus: Array<{ file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; allRows: ReturnType<GovernedPaymentKnowledgeAuthority["resolveStatement"]>["mastercardFocusedEvidence"]["rowsByFeeRowId"] }> = [];
    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const authority = new GovernedPaymentKnowledgeAuthority();
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, knowledgeAuthority: authority });
      const governed = authority.resolveStatement({ analysis, context: US_CONTEXT });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      expect(report.knowledgeAuthority.admittedMastercardFocusedRuleRefs).toEqual(governedMastercardFocusedRules2024_2026V1().map((item) => item.ruleId));
      expect(report.coverage.confirmedAtParFindings).toBe(0);
      expect(report.coverage.confirmedMarkupFindings).toBe(0);
      corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((item) => item.sourceFeeRowId), allRows: governed.mastercardFocusedEvidence.rowsByFeeRowId });
    }

    const findings = corpus.flatMap((item) => item.findings);
    const assessment = byLabel(corpus, /MASTERCARD ASSESSMENT FEE 0\.001475 TIMES/)[0]!;
    expect(assessment.mastercardFocusedEvidence?.lineToFeeCardinality.state).toBe("multiple_legitimate_components_strongly_explained");
    expect(assessment.mastercardFocusedEvidence?.residualDecomposition).toMatchObject({ residual: 0.000075, bundledComponentProven: false, markupEstablished: false });
    expect(assessment.usNetworkFeeEvidence?.comparison.state).not.toBe("candidate_above_reference");
    expect(assessment.usNetworkFeeEvidence?.research.priority).toBe("none");
    expect(assessment.practicalMerchantAction.value).toMatch(/strongly explained.*at-par pass-through/i);
    const otherAssessments = byLabel(corpus, /MASTERCARD ASSESSMENT FEE 0\.0014 TIMES/);
    expect(otherAssessments.length).toBeGreaterThan(0);
    expect(otherAssessments.every((item) => item.mastercardFocusedEvidence?.lineToFeeCardinality.state === "unresolved" && item.mastercardFocusedEvidence.lineToFeeCardinality.comparisonAllowed === false)).toBe(true);

    const locations = findings.filter((item) => item.mastercardFocusedEvidence?.locationFee2025);
    expect(locations).toHaveLength(2);
    expect(new Set(locations.map((item) => item.usNetworkFeeEvidence?.billedObservation?.statementRef)).size).toBe(2);
    expect(locations.every((item) => item.mastercardFocusedEvidence?.lineToFeeCardinality.comparisonAllowed === false)).toBe(true);
    expect(locations.every((item) => item.commercialReasonableness.value === "elevated" && item.commercialReasonableness.confidence === "LIKELY")).toBe(true);
    expect(locations.every((item) => item.contractualCompliance.state === "contract_required")).toBe(true);
    expect(locations.every((item) => item.mastercardFocusedEvidence?.locationFee2025?.excessEconomicBeneficiary === "UNRESOLVED")).toBe(true);
    expect(locations.every((item) => item.mastercardFocusedEvidence?.locationMccAdjudication?.canonicalExcludedMccs.join(",") === "8398,8661")).toBe(true);
    expect(locations.every((item) => item.practicalMerchantAction.value?.includes("does not require the merchant agreement"))).toBe(true);

    const nonUsNabu = corpus.flatMap((item) => item.analysis.feeLedger.rows.map((row) => ({ row, resolved: item.allRows[row.id]! }))).filter((item) => /NTWK ACCESS AUTH FEE NONUS/.test(item.row.selectedLabel));
    expect(nonUsNabu).toHaveLength(1);
    expect(nonUsNabu[0]!.resolved.nonUsNabu2024).toMatchObject({ value: 0.0295, effectiveFrom: "2024-04-15", scope: "U.S. merchant / non-U.S. issuer" });
    expect(nonUsNabu[0]!.resolved.effectiveUsNetworkEvidence.reference).toMatchObject({ state: "period_matched_processor_reference", officialNetworkParEstablished: false });

    const metrics = {
      materialFindings: findings.length,
      assessmentStronglyExplained: findings.filter((item) => item.mastercardFocusedEvidence?.assessment2024).length,
      distinctLocationCandidates: new Set(locations.map((item) => `${item.usNetworkFeeEvidence?.billedObservation?.statementRef}:${item.sourceFeeRowId}`)).size,
      nonUsNabuResolved: nonUsNabu.length,
      aboveReferenceCandidates: findings.filter((item) => item.usNetworkFeeEvidence?.comparison.state === "candidate_above_reference").length,
      highPriorityResearch: findings.filter((item) => item.usNetworkFeeEvidence?.research.priority === "high").length,
    };
    console.info("MASTERCARD_FOCUSED_CORPUS_METRICS", JSON.stringify(metrics));
    expect(metrics).toEqual({ materialFindings: 483, assessmentStronglyExplained: 1, distinctLocationCandidates: 2, nonUsNabuResolved: 1, aboveReferenceCandidates: 2, highPriorityResearch: 2 });
  }, 60_000);
});

function record(records: ReturnType<typeof governedMastercardFocusedRecords2024_2026V1>, recordId: string) {
  const found = records.find((item) => item.recordId === recordId);
  if (!found) throw new Error(`missing focused Mastercard record: ${recordId}`);
  return found;
}

function byLabel(corpus: Array<{ analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] }>, pattern: RegExp): InternalAnalystFinding[] {
  return corpus.flatMap((item) => item.findings.filter((finding) => pattern.test(item.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "")));
}
