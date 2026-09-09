import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { governedNetworkNoticeEventsV1 } from "../../src/canonical/governedDatedNetworkFeeEvidenceV1.js";
import {
  governedUsNetworkReferenceRecords2020_2026V1,
  governedUsNetworkRules2020_2026V1,
  governedUsNetworkSources2020_2026V1,
} from "../../src/canonical/governedUsNetworkFeeEvidence2020_2026V1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFinding,
} from "../../src/canonical/internalAnalystFindingV1.js";
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
const US_CONTEXT = {
  geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] },
};

describe("Product-adjudicated U.S. network fee evidence pack 2020-2026", () => {
  it("admits only the reviewed source records, values, corrections, conflicts, and change lifecycle", () => {
    const sources = governedUsNetworkSources2020_2026V1();
    const records = governedUsNetworkReferenceRecords2020_2026V1();
    const rules = governedUsNetworkRules2020_2026V1();
    const existingDatedNotices = governedNetworkNoticeEventsV1();

    expect(sources).toHaveLength(3);
    expect(sources.map((source) => source.sourceId)).toEqual([
      "rr_product_us_network_pack_2020_2026_final",
      "fiserv_card_brand_pass_through_guide_2023_04",
      "fiserv_card_brand_updates_2026_06",
    ]);
    expect(sources.find((source) => source.sourceId === "fiserv_card_brand_pass_through_guide_2023_04")?.evidenceClass).toBe("E4_processor_or_acquirer_schedule");
    expect(sources.filter((source) => source.publisher === "Fiserv").every((source) => source.publicationDatePrecision === "month")).toBe(true);
    expect(sources.find((source) => source.sourceId === "fiserv_card_brand_updates_2026_06")?.limitations.join(" ")).toMatch(/not a comprehensive table/i);
    expect(sources.every((source) => source.retainedPackageFingerprint === "e9af92f905f8dc1fbe9445099fc9e92df1fd87d786787d6a61e19df6b46ee5dd")).toBe(true);

    expect(rules.map((rule) => rule.ruleId)).toEqual(Array.from({ length: 15 }, (_, index) => `RR-USN-${String(index + 1).padStart(2, "0")}`));
    expect(rules.every((rule) => rule.sourceFingerprints.includes("ad9ad7a3503a5db0db68674ef3897b0d6842bfeaef374bdd0a5cae0dea7fb7e3"))).toBe(true);
    expect(rules.flatMap((rule) => rule.prohibitedClaims)).toEqual(expect.arrayContaining([
      "adjacent_period_confirmed_at_par",
      "nabu_authorization_only",
      "digital_enablement_min_proves_mechanic_change",
      "location_fee_confirmed_markup",
      "data_usage_owner_from_count",
      "no_2026_change_means_2023_rate_current",
    ]));

    expect(records).toHaveLength(32);
    expect(records.map((item) => item.recordId)).toEqual([
      "visa_assessment_debit_2023_04", "visa_assessment_credit_2023_04", "visa_isa_2023_04", "visa_iaf_2023_04",
      "visa_apf_2023_04", "visa_misuse_2023_04", "visa_zero_floor_2023_04", "visa_tif_2023_04",
      "visa_base_ii_system_file_2023_04", "visa_fanf_structure_2023_04", "mastercard_assessment_2023_04",
      "mastercard_cross_border_2023_04", "mastercard_nabu_2023_04", "mastercard_global_acquirer_2023_04",
      "mastercard_digital_enablement_2023_04", "mastercard_pre_auth_integrity_2023_04",
      "mastercard_undefined_auth_integrity_2023_04", "mastercard_final_auth_integrity_2023_04",
      "mastercard_location_2023_04", "mastercard_connectivity_kb_2023_04", "discover_network_authorization_2023_04",
      "discover_data_usage_2023_04", "discover_program_integrity_2023_04", "amex_assessment_2023_04",
      "visa_cnp_token_fee_2026_06", "visa_cross_border_cp_token_fee_2026_06", "visa_cp_token_fee_2026_06",
      "visa_foreign_cnp_digital_commerce_2026_06", "mastercard_fallback_avoidance_2026",
      "mastercard_mchip_deployment_2026_08", "mastercard_dispute_image_2026_07", "mastercard_dispute_case_2026_07",
    ]);
    const sourceIds = new Set(sources.map((source) => source.sourceId));
    expect(records.every((item) => sourceIds.has(item.sourceId) && item.values.every((value) => Number.isFinite(value.value) && value.value > 0))).toBe(true);
    expect(records.every((record) => record.officialNetworkPublication === false && record.statementDerived === false)).toBe(true);
    expect(records.every((record) => record.sourceDatePrecision === "month")).toBe(true);
    expect(records.every((record) =>
      !Number.isNaN(Date.parse(record.referencePeriod.effectiveFrom)) &&
      !Number.isNaN(Date.parse(record.referencePeriod.effectiveThrough)) &&
      record.referencePeriod.effectiveThrough >= record.referencePeriod.effectiveFrom
    )).toBe(true);
    expect(records.filter((record) => record.sourceId === "fiserv_card_brand_updates_2026_06")).toHaveLength(8);
    expect(records.filter((record) => record.sourceId === "fiserv_card_brand_updates_2026_06").every((record) => record.lifecycle === "announced_change" && record.implementationState === "unconfirmed")).toBe(true);

    const apf = record(records, "visa_apf_2023_04");
    expect(apf.values.map((item) => [item.variantId, item.value])).toEqual([
      ["us_debit_prepaid", 0.0155],
      ["us_credit", 0.0195],
      ["non_us_debit_prepaid", 0.0355],
      ["non_us_credit", 0.0395],
    ]);
    const nabu = record(records, "mastercard_nabu_2023_04");
    expect(nabu.populationClaim).toMatch(/authorization records, Collection Only, and Return\/Credit settled transactions/i);
    const digital = record(records, "mastercard_digital_enablement_2023_04");
    expect(digital.values.map((item) => [item.value, item.minimum, item.maximum])).toEqual([
      [0.0002, false, false],
      [0.02, true, false],
      [0.20, false, true],
    ]);
    expect(record(records, "visa_fanf_structure_2023_04").values).toHaveLength(0);
    expect(record(records, "mastercard_location_2023_04").conflicts.join(" ")).toMatch(/8393.*8661.*8661.*8398/i);
    expect(record(records, "discover_program_integrity_2023_04").knownGaps.join(" ")).toMatch(/2020.*2023.*unresolved/i);
    expect(record(records, "mastercard_fallback_avoidance_2026").referencePeriod.datePrecision).toBe("year");
    expect(record(records, "visa_foreign_cnp_digital_commerce_2026_06").priorValues.map((item) => item.value)).toEqual([0.000075, 0.0075]);
    expect(record(records, "mastercard_dispute_case_2026_07").priorValues[0]?.value).toBe(1.35);
    expect(existingDatedNotices.some((notice) => notice.noticeId === "b3_notice_basys_amex_general_assessment" && notice.implementationState === "unconfirmed")).toBe(true);
    expect(existingDatedNotices.some((notice) => notice.noticeId === "b3_notice_basys_discover_program_integrity" && notice.implementationState === "unconfirmed")).toBe(true);
  });

  it("applies the corrections and fail-closed comparisons across the full Fiserv Gold corpus", async () => {
    const corpus: Array<{ file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; queued: number }> = [];
    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, knowledgeAuthority: new GovernedPaymentKnowledgeAuthority() });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      expect(report.knowledgeAuthority.admittedUsNetworkFeeRuleRefs).toEqual(governedUsNetworkRules2020_2026V1().map((rule) => rule.ruleId));
      expect(report.coverage.officialNetworkRateComparisons).toBe(0);
      expect(report.coverage.confirmedAtParFindings).toBe(0);
      expect(report.coverage.confirmedMarkupFindings).toBe(0);
      corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), queued: report.coverage.queuedResearchQuestions });
    }

    const findings = corpus.flatMap((item) => item.findings);
    const network = findings.filter((finding): finding is InternalAnalystFinding & { usNetworkFeeEvidence: NonNullable<InternalAnalystFinding["usNetworkFeeEvidence"]> } => Boolean(finding.usNetworkFeeEvidence));
    const strengthened = network.filter((finding) => finding.usNetworkFeeEvidence.identity.state === "supported");
    const metrics = {
      materialFindings: findings.length,
      exactIdentities: findings.filter((finding) => finding.exactFeeIdentity.value).length,
      categoryOnly: findings.filter((finding) => !finding.exactFeeIdentity.value && finding.broaderEconomicCategory.value).length,
      fullyUnresolved: findings.filter((finding) => !finding.exactFeeIdentity.value && !finding.broaderEconomicCategory.value).length,
      networkRows: network.length,
      identityStrengthened: strengthened.length,
      mechanicStrengthened: network.filter((finding) => finding.usNetworkFeeEvidence.mechanic.state === "supported").length,
      populationStrengthened: network.filter((finding) => finding.usNetworkFeeEvidence.population.state === "supported").length,
      periodMatched: network.filter((finding) => finding.usNetworkFeeEvidence.reference.state === "period_matched_processor_reference").length,
      adjacentPeriod: network.filter((finding) => finding.usNetworkFeeEvidence.reference.state === "adjacent_period_processor_reference").length,
      identityMechanicOnly: network.filter((finding) => finding.usNetworkFeeEvidence.reference.state === "current_material_identity_mechanic_only").length,
      ambiguousVariant: network.filter((finding) => finding.usNetworkFeeEvidence.reference.state === "ambiguous_product_variant").length,
      noReference: network.filter((finding) => finding.usNetworkFeeEvidence.reference.state === "no_applicable_reference").length,
      lacking2026Core: network.filter((finding) => !finding.usNetworkFeeEvidence.reference.current2026CoreValueEstablished).length,
      candidates: network.filter((finding) => finding.usNetworkFeeEvidence.comparison.state === "candidate_above_reference").length,
      nabuCorrected: network.filter((finding) => finding.usNetworkFeeEvidence.correction.nabuAuthorizationOnlyRemoved).length,
      digitalCorrected: network.filter((finding) => finding.usNetworkFeeEvidence.correction.digitalEnablementBoundedMechanicApplied).length,
      dataUsageStrengthened: network.filter((finding) => finding.usNetworkFeeEvidence.correction.dataUsageSettlementPopulationStrengthened).length,
      sourceConflicts: network.filter((finding) => finding.usNetworkFeeEvidence.sourceConflicts.length > 0).length,
      highPriorityResearch: network.filter((finding) => finding.usNetworkFeeEvidence.research.priority === "high").length,
      queued: corpus.reduce((sum, item) => sum + item.queued, 0),
    };
    console.info("US_NETWORK_EVIDENCE_CORPUS_METRICS", JSON.stringify(metrics));
    console.info("US_NETWORK_EVIDENCE_CANDIDATES", JSON.stringify(network.filter((finding) => finding.usNetworkFeeEvidence.comparison.state === "candidate_above_reference").map((finding) => ({ statement: finding.usNetworkFeeEvidence.billedObservation?.statementRef, label: finding.usNetworkFeeEvidence.billedObservation?.label, comparison: finding.usNetworkFeeEvidence.comparison }))));

    expect(metrics.materialFindings).toBe(483);
    expect(metrics.networkRows).toBe(60);
    expect(metrics.periodMatched).toBe(1);
    expect(metrics.adjacentPeriod).toBe(38);
    expect(metrics.identityMechanicOnly).toBe(0);
    expect(metrics.lacking2026Core).toBe(60);
    expect(metrics.candidates).toBe(2);
    expect(metrics.nabuCorrected).toBe(2);
    expect(metrics.digitalCorrected).toBe(2);
    expect(metrics.dataUsageStrengthened).toBeGreaterThanOrEqual(1);
    expect(metrics.sourceConflicts).toBe(0);
    expect(metrics.highPriorityResearch).toBe(2);

    expect(network.every((finding) => finding.usNetworkFeeEvidence.billedObservation?.establishesOfficialNetworkPar === false)).toBe(true);
    expect(network.every((finding) => finding.usNetworkFeeEvidence.reference.officialNetworkParEstablished === false && finding.usNetworkFeeEvidence.reference.historicalNetworkParEstablished === false)).toBe(true);
    expect(network.every((finding) => finding.usNetworkFeeEvidence.comparison.passThroughAtParEstablished === false && finding.usNetworkFeeEvidence.comparison.confirmedMarkupEstablished === false)).toBe(true);
    expect(network.every((finding) => finding.usNetworkFeeEvidence.renderingPermissions.announcementAsImplementationAllowed === false && finding.usNetworkFeeEvidence.renderingPermissions.crossMerchantHistoryAllowed === false && finding.usNetworkFeeEvidence.renderingPermissions.backwardProjectionFrom2026Allowed === false)).toBe(true);

    const nabuFindings = byLabels(corpus, /NABU/);
    expect(nabuFindings).toHaveLength(2);
    expect(nabuFindings.every((finding) => finding.assessmentUnitOrMechanic.value?.includes("not authorization-only"))).toBe(true);
    expect(nabuFindings.every((finding) => finding.relevantPopulationOrBase.value?.includes("Collection Only"))).toBe(true);
    expect(nabuFindings.every((finding) => finding.usNetworkFeeEvidence?.population.forcedToGatewayAuthorizationCount === false)).toBe(true);

    const digitalFindings = byLabels(corpus, /DIGITAL ENABLEMENT/);
    expect(digitalFindings).toHaveLength(2);
    expect(new Set(digitalFindings.map((finding) => finding.exactFeeIdentity.value))).toEqual(new Set(["mastercard_digital_enablement_fee"]));
    expect(digitalFindings.every((finding) => finding.assessmentUnitOrMechanic.value?.includes("one bounded ad-valorem formula"))).toBe(true);
    expect(digitalFindings.every((finding) => finding.usNetworkFeeEvidence?.mechanic.mechanicChangeInferred === false)).toBe(true);
    expect(network.every((finding) => !finding.exactFeeIdentity.value?.includes("mastercard_pre_authorization_processing_integrity"))).toBe(true);

    const locationCandidates = network.filter((finding) => finding.usNetworkFeeEvidence.comparison.state === "candidate_above_reference" && finding.usNetworkFeeEvidence.identity.value === "mastercard_location_fee");
    expect(locationCandidates).toHaveLength(2);
    expect(locationCandidates.every((finding) => finding.commercialReasonableness.state === "candidate" && finding.commercialReasonableness.limitations.join(" ").includes("not confirmed"))).toBe(true);
    expect(locationCandidates.every((finding) => finding.practicalMerchantAction.value?.includes("does not require the merchant agreement"))).toBe(true);

    const assessmentCandidate = byLabels(corpus, /0\.001475 TIMES/)[0]!;
    expect(assessmentCandidate.usNetworkFeeEvidence?.comparison).toMatchObject({ state: "population_or_product_scope_unresolved", referenceValue: 0.0014, difference: 0.000075, confirmedMarkupEstablished: false });
    expect(assessmentCandidate.mastercardFocusedEvidence?.assessment2024).toMatchObject({ structuralExplanation: "STRONGLY_EXPLAINED", aboveReferenceCandidate: false, confirmedAtPar: false, acquiringSideUpliftExcluded: false });
    expect(assessmentCandidate.practicalMerchantAction.value).toMatch(/strongly explained|at-par pass-through/i);

    const assessment140 = byLabels(corpus, /MASTERCARD ASSESSMENT FEE 0\.0014 TIMES/);
    expect(assessment140.every((finding) => finding.usNetworkFeeEvidence?.comparison.state === "population_or_product_scope_unresolved")).toBe(true);

    const dataUsage2020 = byLabels(corpus, /DATA USAGE FEE/).find((finding) => finding.usNetworkFeeEvidence?.billedObservation?.statementPeriod?.start.startsWith("2020"))!;
    expect(dataUsage2020.exactFeeIdentity.value).toBe("discover_data_usage_fee");
    expect(dataUsage2020.usNetworkFeeEvidence?.comparison.state).toBe("different_with_unresolved_historical_gap");
    expect(dataUsage2020.usNetworkFeeEvidence?.correction.historicalGapPreserved).toBe(true);

    const amex2020 = byLabels(corpus, /AMEX ASSESSMENT FEE \.0015 TIMES/)[0]!;
    expect(amex2020.usNetworkFeeEvidence?.comparison.state).toBe("different_with_unresolved_historical_gap");
    expect(amex2020.usNetworkFeeEvidence?.correction.historicalGapPreserved).toBe(true);
    const amex165 = byLabels(corpus, /AMEX ASSESSMENT FEE 0\.00165 TIMES/);
    expect(amex165.length).toBeGreaterThan(0);
    expect(amex165.every((finding) => finding.usNetworkFeeEvidence?.comparison.state === "consistent_with_adjacent_period_reference" && finding.usNetworkFeeEvidence.comparison.passThroughAtParEstablished === false)).toBe(true);

    const adjacent = network.filter((finding) => finding.usNetworkFeeEvidence.reference.state === "adjacent_period_processor_reference");
    expect(adjacent.length).toBeGreaterThan(0);
    expect(adjacent.every((finding) => !/confirmed.*at par|passed through at par/i.test(finding.usNetworkFeeEvidence.comparison.renderingText))).toBe(true);
    expect(locationCandidates.every((finding) => finding.mastercardFocusedEvidence?.locationMccAdjudication?.canonicalExcludedMccs.join(",") === "8398,8661")).toBe(true);

    const queuedText = corpus.flatMap((item) => item.findings).flatMap((finding) => finding.usNetworkFeeEvidence?.research.question ?? []);
    expect(queuedText.some((text) => /2025.*Location Fee/i.test(text))).toBe(true);
    expect(queuedText.some((text) => /2024.*assessment/i.test(text))).toBe(false);
  }, 60_000);
});

function record(records: ReturnType<typeof governedUsNetworkReferenceRecords2020_2026V1>, id: string) {
  const found = records.find((item) => item.recordId === id);
  if (!found) throw new Error(`missing governed U.S. network record: ${id}`);
  return found;
}

function byLabels(
  corpus: Array<{ analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] }>,
  pattern: RegExp,
): InternalAnalystFinding[] {
  return corpus.flatMap((item) => item.findings.filter((finding) => {
    const label = item.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "";
    return pattern.test(label);
  }));
}
