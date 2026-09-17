import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  adjudicateMastercardAssessmentCardinalityV1,
  adjudicateCurrentEvidenceCandidates,
  governedCurrent2026ReferenceRecordsV1,
  governedCurrent2026RulesV1,
  governedCurrent2026SourcesV1,
  governedCurrentReferenceMaintenanceReviewsV1,
  resolveCurrentReferenceForClaim,
  selectMastercardAbvfReferenceV1,
} from "../../src/canonical/governedCurrent2026UsCoreNetworkReferenceV1.js";
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

describe("Product-adjudicated current 2026 U.S. core network reference", () => {
  it("admits exact records, confidence, row-currency, and maintenance rules without inventing par", () => {
    const records = governedCurrent2026ReferenceRecordsV1();
    const rules = governedCurrent2026RulesV1();
    const sources = governedCurrent2026SourcesV1();
    expect(records).toHaveLength(33);
    expect(rules.map((item) => item.ruleId)).toEqual(["CUR-26-01", "CUR-26-02", "CUR-26-03", "CUR-26-04", "CUR-26-05", "CUR-26-06"]);
    expect(sources.every((source) => source.immutable && source.retainedPackageFingerprint.length === 64)).toBe(true);
    expect(sources.find((source) => source.sourceId === "rr_product_governed_conflict_adjudication_final")?.retainedPackageFingerprint).toBe("f457a284011d031820c8a8b099e26220bf9171149f3595e1c56ae4419c2d483d");
    const mixed = sources.find((source) => source.sourceId === "maintained_public_2026_reference_set")!;
    expect(new Set(mixed.rowClaims.map((claim) => claim.currencyState))).toEqual(new Set(["row_specific_current", "stale_or_conflicting"]));
    expect(records.every((record) => record.prohibitedClaims.includes("official_network_par_from_public_reference") && record.prohibitedClaims.includes("merchant_pricing_verdict_from_reference_state"))).toBe(true);
    expect(record(records, "CUR26-WRK-MC-ABVF-BASE")).toMatchObject({ confidence: "CURRENT_WORKING_REFERENCE_STRONG", effectiveFrom: "2024-04-15", values: [{ value: 0.0014 }], priorValues: [{ value: 0.0013, effectiveFrom: "2023-04-01", effectiveThrough: "2024-04-14" }] });
    expect(record(records, "CUR26-WRK-MC-ABVF-LARGE-TICKET").scopeQualification).toMatchObject({ thresholdUsd: 1000, eligibleProducts: ["consumer_credit", "commercial"], increment: 0.0001, resultingReference: 0.0015, debitExcluded: true });
    expect(record(records, "CUR26-WRK-MC-ALF").componentSemantics).toMatchObject({ commonObservedMerchantFacingAllocation: 0.000075, universalMastercardParEstablished: false, processorRetentionOrMerchantMarkupInferenceAllowed: false });
    expect(record(records, "CUR26-CHG-VISA-BASE-II-TRANSMISSION")).toMatchObject({ confidence: "CURRENT_WORKING_REFERENCE_STRONG", effectiveFrom: "2025-01-01", values: [{ value: 0.0025 }], priorValues: [{ value: 0.0018, effectiveThrough: "2024-12-31" }] });
    expect(record(records, "CUR26-CAND-VISA-BASE-II-TRANSMISSION-0027").candidateValues[0]).toMatchObject({ value: 0.0027, status: "UNRESOLVED_CONFLICTING_CANDIDATE", effectiveFrom: null, applicableScope: "unresolved", evidenceWeight: "below_dated_working_reference" });
    expect(record(records, "CUR26-WRK-VISA-BASE-II-NETWORK-ACCESS")).toMatchObject({ merchantBilledIncidence: "not_observed_in_supported_fiserv_corpus" });
    expect(governedCurrentReferenceMaintenanceReviewsV1()).toEqual([expect.objectContaining({ reviewId: "MC_ABVF_CONTINUITY_REVIEW_2026_09", conclusion: "no_reliable_dated_reduction_or_change_located_through_review", absenceProvesNoChangeOccurred: false, reviewDueBy: "2026-12-09" })]);
    const mastercardCurrent = resolveCurrentReferenceForClaim({ label: "MASTERCARD ASSESSMENT", asOf: "2026-09-09" });
    expect(mastercardCurrent).toMatchObject({ state: "CURRENT_WORKING_REFERENCE_STRONG" });
    expect(mastercardCurrent.effectiveValues.map((value) => value.value)).toEqual([0.0014, 0.0015]);
    expect(mastercardCurrent.effectiveValues.some((value) => value.value === 0.0013)).toBe(false);
    expect(record(records, "CUR26-CHG-DISCOVER-NETWORK-AUTH").rejectedCandidates).toEqual([{ value: 0.025, unit: "usd_per_event", disposition: "unsupported_stale_or_error_candidate", origin: "unresolved" }]);
    expect(record(records, "CUR26-CHG-MC-FALLBACK")).toMatchObject({ effectiveFrom: null, confidence: "CURRENT_CONFIRMED_CHANGE" });
    expect(record(records, "CUR26-CHG-MC-FALLBACK").conflicts.join(" ")).toMatch(/April\/June/);
    expect(record(records, "CUR26-CHG-MC-NABU-NON-US")).toMatchObject({ effectiveFrom: "2024-04-15", confidence: "CURRENT_WORKING_REFERENCE_STRONG" });
    expect(resolveCurrentReferenceForClaim({ label: "VI DIGITAL COMMERCE TOKEN FEE", identity: "visa_digital_commerce_service_fee", asOf: "2026-09-07" }).state).toBe("NOT_APPLICABLE");
  });

  it("uses dated row evidence over stale source counts and preserves pre-change values", () => {
    const selected = adjudicateCurrentEvidenceCandidates([
      { candidateId: "dated-2025", value: 0.15, datedChangePeriodMatched: true, rowSpecificCurrentEvidence: true, sourceQuality: 3, independentlyCorroborated: true, sourceCount: 1, staleOrConflicting: false },
      { candidateId: "five-stale-copies", value: 0.09, datedChangePeriodMatched: false, rowSpecificCurrentEvidence: false, sourceQuality: 4, independentlyCorroborated: true, sourceCount: 5, staleOrConflicting: false },
    ]);
    expect(selected?.candidateId).toBe("dated-2025");
    const historical = resolveCurrentReferenceForClaim({ label: "VISA MISUSE OF AUTHORIZATION FEE", asOf: "2024-12-31" });
    expect(historical).toMatchObject({ state: "CURRENT_CONFIRMED_CHANGE", effectiveValues: [], historicalValues: [{ value: 0.09, unit: "usd_per_event", effectiveThrough: "2024-12-31" }] });
    const current = resolveCurrentReferenceForClaim({ label: "VISA MISUSE OF AUTHORIZATION FEE", asOf: "2025-01-01" });
    expect(current.effectiveValues).toEqual([{ variantId: "event", value: 0.15, unit: "usd_per_event", scope: "applicable Misuse event" }]);
    const unresolved = resolveCurrentReferenceForClaim({ label: "VISA BASE II FEE", asOf: "2026-09-09" });
    expect(unresolved).toMatchObject({ state: "CURRENT_RATE_UNRESOLVED", effectiveValues: [] });
    const transmission = resolveCurrentReferenceForClaim({ label: "VISA BASE II TRANSMISSION FEE", asOf: "2026-09-09" });
    expect(transmission).toMatchObject({ state: "CURRENT_WORKING_REFERENCE_STRONG", effectiveValues: [{ value: 0.0025 }] });
    expect(transmission.records.some((item) => item.recordId === "CUR26-CAND-VISA-BASE-II-TRANSMISSION-0027")).toBe(true);
    const networkAccess = resolveCurrentReferenceForClaim({ label: "VISA BASE II NETWORK ACCESS FEE", asOf: "2026-09-09" });
    expect(networkAccess).toMatchObject({ state: "CURRENT_WORKING_REFERENCE_STRONG", effectiveValues: [{ value: 0.0025 }] });
    expect(networkAccess.records.some((item) => item.identity.includes("transmission"))).toBe(false);
  });

  it("applies the three statement-local Mastercard assessment cardinality branches", () => {
    const common = { applicableAbvfReference: 0.0014 as const, sameVolumeBaseAndMechanicSupported: true, strongerCompetingComponentExplanationPresent: false };
    expect(adjudicateMastercardAssessmentCardinalityV1({ ...common, printedRate: 0.0014, separateAlfLinePresentForScope: false })).toMatchObject({ state: "one_fee_supported", confidence: "STRONG", comparisonAllowed: true });
    expect(adjudicateMastercardAssessmentCardinalityV1({ ...common, printedRate: 0.001475, separateAlfLinePresentForScope: false })).toMatchObject({ state: "multiple_legitimate_components_strongly_explained", confidence: "LIKELY", comparisonAllowed: true });
    expect(adjudicateMastercardAssessmentCardinalityV1({ ...common, printedRate: 0.001475, separateAlfLinePresentForScope: true })).toMatchObject({ state: "unresolved", confidence: "UNRESOLVED", comparisonAllowed: false });
    expect(adjudicateMastercardAssessmentCardinalityV1({ ...common, printedRate: null, separateAlfLinePresentForScope: false }).explanation).toMatch(/CARDINALITY_UNRESOLVED/);
    expect(selectMastercardAbvfReferenceV1({ product: "debit", ticketAmountUsd: 5000 })).toMatchObject({ state: "SCOPED_REFERENCE_SELECTED", value: 0.0014, comparisonAllowed: true });
    expect(selectMastercardAbvfReferenceV1({ product: "consumer_credit", ticketAmountUsd: 1000 })).toMatchObject({ state: "SCOPED_REFERENCE_SELECTED", value: 0.0015, comparisonAllowed: true });
    expect(selectMastercardAbvfReferenceV1({ product: "commercial", ticketAmountUsd: 999.99 })).toMatchObject({ state: "SCOPED_REFERENCE_SELECTED", value: 0.0014, comparisonAllowed: true });
    expect(selectMastercardAbvfReferenceV1({ product: "unknown", ticketAmountUsd: null })).toMatchObject({ state: "SCOPED_REFERENCE_UNRESOLVED", value: null, comparisonAllowed: false });
  });

  it("calibrates all 11 Fiserv Gold statements, protects financial truth, and independently constructs both Paysafe Location cases", async () => {
    const corpus: Array<{ file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; report: ReturnType<typeof buildInternalAnalystFindingV1>; currentRows: ReturnType<GovernedPaymentKnowledgeAuthority["resolveStatement"]>["current2026UsCoreNetworkReference"]["rowsByFeeRowId"] }> = [];
    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const authority = new GovernedPaymentKnowledgeAuthority();
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, knowledgeAuthority: authority });
      const governed = authority.resolveStatement({ analysis, context: US_CONTEXT });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      expect(report.coverage.confirmedAtParFindings).toBe(0);
      expect(report.coverage.confirmedMarkupFindings).toBe(0);
      expect(report.knowledgeAuthority.admittedCurrent2026UsCoreNetworkRuleRefs).toEqual(governedCurrent2026RulesV1().map((item) => item.ruleId));
      corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), report, currentRows: governed.current2026UsCoreNetworkReference.rowsByFeeRowId });
    }

    const findings = corpus.flatMap((entry) => entry.findings);
    const mastercardAssessments = findings.filter((finding) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.matchedRecordIds.includes("CUR26-WRK-MC-ABVF-BASE"));
    expect(mastercardAssessments).toHaveLength(9);
    expect(mastercardAssessments.every((finding) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.state === "CURRENT_WORKING_REFERENCE_STRONG")).toBe(true);
    expect(mastercardAssessments.every((finding) => finding.current2026UsCoreNetworkReference?.reference.state !== "CURRENT_WORKING_REFERENCE_STRONG")).toBe(true);
    expect(mastercardAssessments.every((finding) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.values.some((value) => value.value === 0.0014))).toBe(true);
    expect(mastercardAssessments.every((finding) => finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.values.some((value) => value.value === 0.0015))).toBe(true);
    const priorCurrentCoverage = findings.filter((finding) => finding.usNetworkFeeEvidence?.reference.current2026CoreValueEstablished).length;
    const currentReferenceCoverage = findings.filter((finding) => {
      const state = finding.current2026UsCoreNetworkReference?.reference.state;
      return state === "CURRENT_CONFIRMED_CHANGE" || state === "CURRENT_WORKING_REFERENCE_STRONG" || state === "CURRENT_WORKING_REFERENCE_LIKELY";
    }).length;
    expect(priorCurrentCoverage).toBe(0);
    expect(currentReferenceCoverage).toBeGreaterThan(0);

    const misuseEntry = corpus.find((entry) => entry.file.includes("Mar_2020"))!;
    const misuseRow = misuseEntry.analysis.feeLedger.rows.find((row) => /MISUSE/.test(row.selectedLabel))!;
    const misuse2020 = misuseEntry.currentRows[misuseRow.id]!;
    expect(misuse2020).toMatchObject({ historicalApplication: "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE", merchantComparisonPermitted: false, reference: { state: "CURRENT_CONFIRMED_CHANGE", officialNetworkParEstablished: false, merchantPricingVerdictEstablished: false } });
    expect(misuse2020.reference.values).toEqual([]);
    expect(misuse2020.reference.historicalValues.some((value) => value.value === 0.09)).toBe(true);
    expect(misuse2020.currentReferenceMaintenance.state).toBe("CURRENT_CONFIRMED_CHANGE");

    const dcsfEntry = corpus.find((entry) => entry.file.includes("WELLS_FARGO"))!;
    const dcsfRow = dcsfEntry.analysis.feeLedger.rows.find((row) => /DIGITAL COMMERCE (?:SVC|SVCS|SERVICE)/i.test(row.selectedLabel))!;
    expect(dcsfEntry.currentRows[dcsfRow.id]).toMatchObject({ historicalApplication: "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE", currentMechanicOrPopulation: "authorization activity", merchantComparisonPermitted: false });

    const locations = findings.filter((finding) => finding.current2026UsCoreNetworkReference?.locationCase);
    expect(locations).toHaveLength(2);
    expect(new Set(locations.map((finding) => finding.current2026UsCoreNetworkReference?.locationCase?.caseId))).toEqual(new Set(["PAYSAFE_LOCATION_CASE_A_2025_10", "PAYSAFE_LOCATION_CASE_B_2025_09"]));
    expect(new Set(locations.map((finding) => `${finding.sourceFeeRowId}:${finding.current2026UsCoreNetworkReference?.locationCase?.feeInventoryEvidenceRefs.join(",")}`)).size).toBe(2);
    expect(locations.every((finding) => finding.current2026UsCoreNetworkReference?.locationCase?.missingComponentPossibility === "WEAKENED_NOT_EXCLUDED")).toBe(true);
    expect(locations.every((finding) => finding.current2026UsCoreNetworkReference?.locationCase?.billedAboveAvailableReference === "STRONG" && finding.current2026UsCoreNetworkReference.locationCase.acquiringSideUplift === "LIKELY")).toBe(true);
    expect(locations.every((finding) => finding.current2026UsCoreNetworkReference?.locationCase?.contractualViolation === "UNRESOLVED" && finding.contractualCompliance.state === "contract_required")).toBe(true);

    const metrics = {
      statements: corpus.length,
      materialFindings: findings.length,
      priorCurrentCoverage,
      currentReferenceCoverage,
      confirmedChange: findings.filter((finding) => finding.current2026UsCoreNetworkReference?.reference.state === "CURRENT_CONFIRMED_CHANGE").length,
      workingStrong: findings.filter((finding) => finding.current2026UsCoreNetworkReference?.reference.state === "CURRENT_WORKING_REFERENCE_STRONG").length,
      workingLikely: findings.filter((finding) => finding.current2026UsCoreNetworkReference?.reference.state === "CURRENT_WORKING_REFERENCE_LIKELY").length,
      unresolved: findings.filter((finding) => finding.current2026UsCoreNetworkReference?.reference.state === "CURRENT_RATE_UNRESOLVED").length,
      historicalProtected: findings.filter((finding) => ["HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE", "CURRENT_REFERENCE_ONLY_NOT_APPLIED_TO_HISTORICAL_STATEMENT"].includes(finding.current2026UsCoreNetworkReference?.historicalApplication ?? "")).length,
      locationCases: locations.length,
      currentResearchQuestions: findings.filter((finding) => finding.current2026UsCoreNetworkReference?.research.priority === "high").length,
    };
    console.info("CURRENT_2026_US_CORE_NETWORK_CORPUS_METRICS", JSON.stringify(metrics));
    expect(metrics.statements).toBe(11);
    expect(metrics.locationCases).toBe(2);
  }, 60_000);
});

function record(records: ReturnType<typeof governedCurrent2026ReferenceRecordsV1>, recordId: string) {
  const found = records.find((item) => item.recordId === recordId);
  if (!found) throw new Error(`missing current-2026 record: ${recordId}`);
  return found;
}

function byLabel(corpus: Array<{ analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] }>, pattern: RegExp): InternalAnalystFinding[] {
  return corpus.flatMap((entry) => entry.findings.filter((finding) => pattern.test(entry.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "")));
}
