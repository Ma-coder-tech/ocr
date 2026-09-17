import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildGovernedNetworkCorpusHistoryV1,
  governedDatedNetworkRulesV1,
  governedNetworkNoticeEventsV1,
  type GovernedDatedNetworkFeeEvidenceResolution,
} from "../../src/canonical/governedDatedNetworkFeeEvidenceV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFinding,
  type InternalAnalystPricingModelInput,
} from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../../src/parser.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

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

describe("Governed Knowledge Batch 3 full Fiserv corpus", () => {
  it("admits the Product-adjudicated evidence rules and dated E4 notice lifecycle records", () => {
    const rules = governedDatedNetworkRulesV1();
    expect(rules.map((rule) => rule.ruleId)).toEqual(Array.from({ length: 18 }, (_, index) => `RR-B3-${String(index + 1).padStart(2, "0")}`));
    expect(rules.every((rule) => rule.admissionStatus === "admitted" && rule.reviewedAt === "2026-09-07")).toBe(true);
    expect(rules.every((rule) => rule.sourceFingerprints.includes("6c984034cf405c23e757bf1499cf0afd0283a54b5c7e4c9828b441336cd642fc"))).toBe(true);
    expect(rules.flatMap((rule) => rule.prohibitedClaims)).toEqual(expect.arrayContaining([
      "statement_rate_equals_network_par",
      "announcement_equals_implementation",
      "presentation_change_equals_cost_increase",
      "cross_merchant_series_is_your_history",
      "unrelated_absence_proves_not_applicable",
      "network_identity_proves_billed_at_par",
      "network_fee_not_actionable",
      "exception_fee_proves_fault",
    ]));

    const notices = governedNetworkNoticeEventsV1();
    expect(notices).toHaveLength(12);
    expect(notices.every((notice) => notice.evidenceClass === "E4_processor_or_iso_publication" && notice.implementationState === "unconfirmed")).toBe(true);
    expect(notices.filter((notice) => notice.eventType === "presentation_only")).toHaveLength(3);
    expect(notices.filter((notice) => notice.eventType === "postponed")).toHaveLength(2);
    expect(notices.filter((notice) => notice.eventType === "announced_rate_change" || notice.eventType === "announced_new_fee")).toHaveLength(5);
    expect(notices.filter((notice) => notice.eventType === "announced_mechanic_change")).toHaveLength(2);
    expect(notices.every((notice) => notice.sourceFingerprint.length === 64 && notice.sourceRef.includes("#"))).toBe(true);
    expect(notices.filter((notice) => notice.eventType === "presentation_only").every((notice) => /no overall-expense change/i.test(notice.announcedClaim))).toBe(true);
    expect(notices.filter((notice) => notice.eventType === "postponed").every((notice) => notice.announcedEffectiveFrom === null)).toBe(true);
  });

  it("keeps rate truth fail-closed while adding useful internal network analysis across all Gold statements", async () => {
    const corpus: Array<{
      file: string;
      analysis: CanonicalStatementAnalysis;
      findings: InternalAnalystFinding[];
      resolution: GovernedDatedNetworkFeeEvidenceResolution;
      notices: number;
    }> = [];
    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const authority = new GovernedPaymentKnowledgeAuthority();
      const pricing = deterministicPricing(document, fixture.file, fixture.businessType, analysis);
      const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, pricingModel: pricing, knowledgeAuthority: authority });
      const resolution = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricing }).datedNetworkFeeEvidence;
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      expect(report.knowledgeAuthority.admittedDatedNetworkRuleRefs).toEqual(governedDatedNetworkRulesV1().map((rule) => rule.ruleId));
      expect(report.coverage.officialNetworkRateComparisons).toBe(0);
      corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), resolution, notices: report.datedNetworkNotices.length });
    }

    const findings = corpus.flatMap((item) => item.findings);
    const networkFindings = findings.filter((finding): finding is InternalAnalystFinding & { datedNetworkEvidence: NonNullable<InternalAnalystFinding["datedNetworkEvidence"]> } => Boolean(finding.datedNetworkEvidence));
    const observations = networkFindings.map((finding) => finding.datedNetworkEvidence);
    const after = {
      totalMaterialFindings: findings.length,
      exact: findings.filter((finding) => finding.exactFeeIdentity.value).length,
      categoryOnly: findings.filter((finding) => !finding.exactFeeIdentity.value && finding.broaderEconomicCategory.value).length,
      fullyUnresolved: findings.filter((finding) => !finding.exactFeeIdentity.value && !finding.broaderEconomicCategory.value).length,
      ambiguousOrCompeting: findings.filter((finding) => finding.competingInterpretations.length > 0 || finding.exactFeeIdentity.state === "conflicting").length,
      networkEvidenceFindings: networkFindings.length,
      familySupported: observations.filter((row) => row.family.state === "supported").length,
      categoryOnlyNetworkFamily: observations.filter((row) => row.family.state === "category_only").length,
      mechanicSupported: observations.filter((row) => row.mechanic.state === "supported").length,
      billedObservations: observations.filter((row) => row.billedObservation).length,
      officialParValues: observations.filter((row) => row.priceSeparation.underlyingNetworkReference.value !== null).length,
      parComparisons: observations.filter((row) => row.priceSeparation.passThroughAtPar !== "not_established" && row.priceSeparation.passThroughAtPar !== "not_applicable").length,
      statementNoticeRecords: corpus.reduce((sum, item) => sum + item.notices, 0),
    };
    console.info("BATCH3_CORPUS_METRICS", JSON.stringify({ before: { totalMaterialFindings: 483, exact: 76, categoryOnly: 96, fullyUnresolved: 311, ambiguousOrCompeting: 90 }, after }));

    expect(after.totalMaterialFindings).toBe(483);
    expect(after.exact).toBe(89);
    expect(after.categoryOnly).toBe(259);
    expect(after.fullyUnresolved).toBe(135);
    expect(after.ambiguousOrCompeting).toBe(90);
    expect(after.networkEvidenceFindings).toBe(60);
    expect(after.familySupported).toBe(58);
    expect(after.categoryOnlyNetworkFamily).toBe(2);
    expect(after.mechanicSupported).toBe(24);
    expect(after.billedObservations).toBe(after.networkEvidenceFindings);
    expect(after.officialParValues).toBe(0);
    expect(after.parComparisons).toBe(0);
    expect(after.statementNoticeRecords).toBe(12);

    expect(observations.every((row) => row.billedObservation?.establishesOfficialNetworkPar === false)).toBe(true);
    expect(observations.every((row) => row.historicalComparison.announcementIsImplementationEvidence === false)).toBe(true);
    expect(observations.every((row) => row.historicalComparison.currentDocumentationMaySupplyHistoricalRate === false)).toBe(true);
    expect(observations.every((row) => row.historicalComparison.crossMerchantObservationMaySupplyMerchantHistory === false)).toBe(true);
    expect(observations.every((row) => row.historicalComparison.unrelatedStatementAbsenceMayProveApplicability === false)).toBe(true);
    expect(observations.every((row) => row.renderingPermissions.officialParLanguageAllowed === false && row.renderingPermissions.aboveParLanguageAllowed === false && row.renderingPermissions.faultLanguageAllowed === false)).toBe(true);
    expect(networkFindings.every((finding) => !/nothing (?:you|the merchant) can do|not actionable/i.test(finding.practicalMerchantAction.value ?? ""))).toBe(true);
    expect(networkFindings.every((finding) => finding.contractualCompliance.state === "contract_required")).toBe(true);
    expect(networkFindings.every((finding) => finding.practicalMerchantAction.value?.toLowerCase().includes("no merchant agreement") || finding.practicalMerchantAction.value?.toLowerCase().includes("does not require"))).toBe(true);

    const tif = byLabel(corpus, "INTEGRITY FEE");
    expect(tif.datedNetworkEvidence?.family.value).toBe("visa_transaction_integrity");
    expect(tif.datedNetworkEvidence?.trigger).toMatchObject({ state: "directional_category_only", exactWindowOrThresholdEstablished: false, causationOrFaultEstablished: false });
    expect(tif.behavioralInfluence.explanation).toMatch(/does not imply merchant fault/i);

    const misuse = networkRowByLabel(corpus, "MISUSE");
    const zeroFloor = networkRowByLabel(corpus, "ZERO FLOOR");
    expect(misuse.family.value).toBe("visa_misuse");
    expect(zeroFloor.family.value).toBe("visa_zero_floor_limit");
    expect(misuse.family.value).not.toBe(zeroFloor.family.value);

    const dataUsage = byLabel(corpus, "DATA USAGE FEE");
    expect(dataUsage.datedNetworkEvidence).toMatchObject({
      family: { value: "clearing_or_data_record_family" },
      priceSeparation: { underlyingNetworkPriceSetter: null, underlyingNetworkEconomicBeneficiary: null, merchantBilledEconomicBeneficiary: null, passThroughAtPar: "not_applicable" },
    });

    const histories = buildGovernedNetworkCorpusHistoryV1(corpus.map((item) => item.resolution));
    expect(histories.every((history) => history.seriesKind === "cross_merchant_observation_series" && history.merchantHistoryAllowed === false && history.officialRateHistoryAllowed === false && history.interpolationAllowed === false)).toBe(true);
    const discoverPi = histories.find((history) => history.family === "discover_program_integrity")!;
    expect(discoverPi).toBeTruthy();
    expect(discoverPi.points.some((point) => point.kind === "E4_announcement" && point.date.startsWith("2020"))).toBe(true);
    expect(discoverPi.points.some((point) => point.kind === "E1_billed_observation" && point.date.startsWith("2025"))).toBe(true);
    expect(discoverPi.explicitHistoricalGap).toBe(true);
    expect(discoverPi.exactFeeContinuity).toBe("unresolved");
  }, 60_000);
});

function byLabel(
  corpus: Array<{ analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] }>,
  part: string,
): InternalAnalystFinding {
  const match = corpus.flatMap((item) => item.findings.map((finding) => ({
    finding,
    label: item.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "",
  }))).find((item) => item.label.includes(part));
  if (!match) throw new Error(`missing Batch 3 fixture label: ${part}`);
  return match.finding;
}

function networkRowByLabel(
  corpus: Array<{ analysis: CanonicalStatementAnalysis; resolution: GovernedDatedNetworkFeeEvidenceResolution }>,
  part: string,
) {
  for (const item of corpus) {
    const row = item.analysis.feeLedger.rows.find((candidate) => candidate.selectedLabel.includes(part));
    if (row) return item.resolution.rowsByFeeRowId[row.id]!;
  }
  throw new Error(`missing Batch 3 fixture network row label: ${part}`);
}

function deterministicPricing(
  document: ParsedDocument,
  file: string,
  businessType: BusinessTypeId,
  analysis: CanonicalStatementAnalysis,
): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const raw = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = raw?.pricingModel?.pricingModel;
  const accepted = ["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"];
  return {
    model: accepted.includes(model ?? "") ? model as InternalAnalystPricingModelInput["model"] : "unknown",
    confidence: raw?.pricingModel?.confidence === "high" ? "high" : raw?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}
