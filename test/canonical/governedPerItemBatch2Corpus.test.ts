import { describe, expect, it } from "vitest";
import type { BusinessTypeId } from "../../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFinding,
  type InternalAnalystPricingModelInput,
} from "../../src/canonical/internalAnalystFindingV1.js";
import {
  governedPerItemRulesV1,
  validateGovernedPerItemRenderingV1,
} from "../../src/canonical/governedPerItemKnowledgeV1.js";
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
  geography: {
    value: "us",
    evidenceClass: "statement_local" as const,
    evidenceRefs: ["supported_fiserv_us_scope"],
  },
};

describe("Governed Knowledge Batch 2 full Fiserv corpus", () => {
  it("admits the Product-adjudicated rules with provenance and explicit prohibitions", () => {
    const rules = governedPerItemRulesV1();
    expect(rules.map((rule) => rule.ruleId)).toEqual(Array.from({ length: 16 }, (_, index) => `RR-B2-${String(index).padStart(2, "0")}`));
    expect(rules.every((rule) => rule.admissionStatus === "admitted" && rule.evidenceClass === "G1_product_domain_adjudication" && rule.reviewedAt === "2026-09-07")).toBe(true);
    expect(rules.every((rule) => rule.sourceFingerprints.includes("f5f4ca5b3d4e5eb1a98c7342f58accca8f17eda54755cff5ff43a834cdd3e78d"))).toBe(true);
    expect(rules.flatMap((rule) => rule.prohibitedClaims)).toEqual(expect.arrayContaining([
      "identity_from_rate_alone",
      "eci_means_electronic_commerce_indicator",
      "unknown_fee_defaults_to_processor",
      "network_fee_not_actionable",
      "copy_stronger_than_evidence",
    ]));
  });

  it("applies the adjudicated population, economic-layer, action, rendering, and financial-truth boundaries", async () => {
    const corpus: Array<{ file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; researchQueued: number }> = [];
    for (const fixture of FIXTURES) {
      const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
      const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
        sourceFileName: fixture.file,
        businessType: fixture.businessType,
      });
      const before = canonicalFinancialTruthFingerprint(analysis);
      const report = buildInternalAnalystFindingV1({
        analysis,
        statementContext: US_CONTEXT,
        pricingModel: deterministicPricing(document, fixture.file, fixture.businessType, analysis),
      });
      expect(report.canonicalFinancialTruth).toMatchObject({ beforeFingerprint: before, afterFingerprint: before, unchanged: true, mutationAllowed: false });
      expect(canonicalFinancialTruthFingerprint(analysis)).toBe(before);
      expect(report.knowledgeAuthority.admittedPerItemRuleRefs).toEqual(governedPerItemRulesV1().map((rule) => rule.ruleId));
      corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), researchQueued: report.coverage.queuedResearchQuestions });
    }

    const findings = corpus.flatMap((item) => item.findings);
    const perItem = findings.filter((finding) => finding.perItemAnalysis);
    const after = {
      totalMaterialFindings: findings.length,
      exact: findings.filter((finding) => finding.exactFeeIdentity.value).length,
      categoryOnly: findings.filter((finding) => !finding.exactFeeIdentity.value && finding.broaderEconomicCategory.value).length,
      fullyUnresolved: findings.filter((finding) => !finding.exactFeeIdentity.value && !finding.broaderEconomicCategory.value).length,
      ambiguousOrCompeting: findings.filter((finding) => finding.competingInterpretations.length > 0 || finding.exactFeeIdentity.state === "conflicting").length,
      researchQueueQuestions: corpus.reduce((sum, item) => sum + item.researchQueued, 0),
      perItemMaterial: perItem.length,
      perItemUnitSupported: perItem.filter((finding) => finding.perItemAnalysis!.unit.state === "supported").length,
      perItemUnitUnresolved: perItem.filter((finding) => finding.perItemAnalysis!.unit.state === "unresolved").length,
      perItemPopulationSupported: perItem.filter((finding) => finding.perItemAnalysis!.population.state === "supported" || finding.perItemAnalysis!.population.state === "diagnostic_only").length,
      perItemLayerUnresolved: perItem.filter((finding) => finding.perItemAnalysis!.economicLayer === "PER_ITEM_LAYER_UNRESOLVED").length,
      acquiringSide: perItem.filter((finding) => finding.perItemAnalysis!.economicLayer?.startsWith("acquiring_side_")).length,
      network: perItem.filter((finding) => finding.perItemAnalysis!.economicBeneficiary === "card_network").length,
      avs: perItem.filter((finding) => /AVS|ADDRESS VER/.test(labelFor(corpus, finding))).length,
      exactIdentitiesSuppressed: perItem.filter((finding) => finding.perItemAnalysis!.exactIdentityDisposition === "suppress_as_unresolved").length,
      negotiationWithheldForUnresolved: perItem.filter((finding) => finding.perItemAnalysis!.economicLayer === "PER_ITEM_LAYER_UNRESOLVED" && !finding.perItemAnalysis!.renderingPermissions.negotiationRecommendationAllowed).length,
      falseNegotiationPermissions: perItem.filter((finding) => finding.perItemAnalysis!.economicLayer === "PER_ITEM_LAYER_UNRESOLVED" && finding.perItemAnalysis!.renderingPermissions.negotiationRecommendationAllowed).length,
      populationMismatchesKeptDiagnostic: perItem.filter((finding) => ["greater", "less"].includes(finding.perItemAnalysis!.population.comparisonToSettledTransactions)).length,
    };
    console.info("BATCH2_CORPUS_METRICS", JSON.stringify({ before: { totalMaterialFindings: 483, exact: 81, categoryOnly: 84, fullyUnresolved: 318 }, after }));

    expect(after.totalMaterialFindings).toBe(483);
    expect(after.perItemMaterial).toBeGreaterThan(0);
    expect(after.perItemUnitSupported).toBeGreaterThan(0);
    expect(after.perItemLayerUnresolved).toBeGreaterThan(0);
    expect(after.acquiringSide).toBeGreaterThan(0);
    expect(after.network).toBeGreaterThan(0);
    expect(after.exactIdentitiesSuppressed).toBeGreaterThan(0);
    expect(after.negotiationWithheldForUnresolved).toBe(after.perItemLayerUnresolved);
    expect(after).toEqual({
      totalMaterialFindings: 483,
      exact: 89,
      categoryOnly: 92,
      fullyUnresolved: 302,
      ambiguousOrCompeting: 93,
      researchQueueQuestions: 401,
      perItemMaterial: 90,
      perItemUnitSupported: 65,
      perItemUnitUnresolved: 25,
      perItemPopulationSupported: 65,
      perItemLayerUnresolved: 28,
      acquiringSide: 52,
      network: 5,
      avs: 5,
      exactIdentitiesSuppressed: 48,
      negotiationWithheldForUnresolved: 28,
      falseNegotiationPermissions: 0,
      populationMismatchesKeptDiagnostic: 0,
    });

    const perItemRows = perItem.map((finding) => finding.perItemAnalysis!);
    expect(perItemRows.every((row) => row.population.errorEstablished === false && row.population.declinesEstablished === false)).toBe(true);
    expect(governedPerItemRulesV1().find((rule) => rule.ruleId === "RR-B2-01")?.prohibitedClaims).toEqual(expect.arrayContaining(["universal_population_monotonicity", "authorization_minus_settled_equals_declines"]));

    const eci = byLabel(corpus, "ECI CPU-G");
    expect(eci.exactFeeIdentity).toMatchObject({ value: null, state: "unresolved" });
    expect(eci.perItemAnalysis).toMatchObject({ exactIdentityDisposition: "suppress_as_unresolved", economicBeneficiary: null });
    expect(eci.competingInterpretations.some((item) => item.interpretation.includes("Electronic Commerce Indicator is not admitted"))).toBe(true);

    const cpu = byLabel(corpus, "CPU GTWY");
    expect(cpu.broaderEconomicCategory.value).toBe("acquiring_side_gateway_commercial");
    expect(cpu.economicBeneficiary.value).toBeNull();
    expect(cpu.ruleSetter.value).toBe("acquiring_side_program");
    expect(cpu.perItemAnalysis).toMatchObject({ retentionOrProfitEstablished: false, commercialActionPermitted: true });

    const unresolved = perItem.find((finding) => finding.perItemAnalysis!.economicLayer === "PER_ITEM_LAYER_UNRESOLVED")!;
    expect(unresolved.economicBeneficiary.value).toBeNull();
    expect(unresolved.merchantFacingPriceController.value).toBeNull();
    expect(unresolved.negotiability.value).toBeNull();
    expect(unresolved.practicalMerchantAction.value).toMatch(/Do not request repricing or a waiver/i);

    const dataUsage = byLabel(corpus, "DATA USAGE FEE");
    expect(dataUsage.assessmentUnitOrMechanic.value).toBe("per network card sales transaction");
    expect(dataUsage.assessmentUnitOrMechanic.evidence.some((basis) => basis.evidenceClass === "E4_processor_or_iso_publication")).toBe(true);
    expect(dataUsage.perItemAnalysis!.population.explanation).not.toMatch(/proves.*network/i);

    const minimumApplied = byLabel(corpus, "PRE-AUTH FEE CP MIN");
    expect(minimumApplied.assessmentUnitOrMechanic.value).toBe("minimum_applied_count");
    expect(minimumApplied.relevantPopulationOrBase.value).toBe("printed_minimum_applied_count");
    expect(minimumApplied.perItemAnalysis!.population.declinesEstablished).toBe(false);

    const acquiringAuth = byLabel(corpus, "DISCOVER AUTH FEE");
    const networkAuth = byLabel(corpus, "NETWORK AUTHORIZATION FEE");
    expect(acquiringAuth.broaderEconomicCategory.value).toBe("acquiring_side_authorization_or_access");
    expect(acquiringAuth.economicBeneficiary.value).toBeNull();
    expect(networkAuth.broaderEconomicCategory.value).toBe("network_authorization_or_access");
    expect(networkAuth.economicBeneficiary.value).toBe("card_network");
    expect(networkAuth.perItemAnalysis!.networkPriceMatch).toBe("not_evaluated_no_admitted_value");

    const avs = byLabel(corpus, "AVS");
    expect(avs.perItemAnalysis).toMatchObject({ causationEstablished: false });
    expect(avs.behavioralInfluence.explanation).not.toMatch(/error|caused.*downgrade/i);

    const exception = byLabel(corpus, "INTEGRITY FEE");
    expect(exception.behavioralInfluence.value).toBe("behavior_can_reduce_incidence");
    expect(exception.behavioralInfluence.explanation).toMatch(/does not imply merchant fault|not.*every event.*avoidable/i);
    expect(exception.practicalMerchantAction.value).not.toMatch(/fully avoidable|eliminate all/i);

    const withRunRate = perItem.find((finding) => finding.perItemAnalysis!.burden.approximateAnnualRunRateText)!;
    expect(withRunRate.perItemAnalysis!.burden.approximateAnnualRunRateText).toMatch(/Approximately \$[\d,.]+ per year at this month's run rate\./);
    expect(withRunRate.perItemAnalysis!.burden.limitations.join(" ")).toMatch(/not a forecast/i);
    expect(withRunRate.perItemAnalysis!.renderingPermissions.benchmarkLanguageAllowed).toBe(false);

    const guard = validateGovernedPerItemRenderingV1(unresolved.perItemAnalysis!, {
      assertsExactIdentity: true,
      assertsMarketBenchmark: true,
      assertsCausation: true,
      assertsRetentionOrProfit: true,
      assertsContractCompliance: true,
      recommendsNegotiation: true,
    });
    expect(guard.allowed).toBe(false);
    expect(guard.reasonCodes).toEqual(expect.arrayContaining([
      "exact_identity_exceeds_evidence",
      "benchmark_not_admitted",
      "causation_not_established",
      "retention_or_profit_not_established",
      "contract_document_required",
      "economic_layer_does_not_support_negotiation",
    ]));

    const batch = perItem.find((finding) => /BATCH|HEADER/.test(labelFor(corpus, finding)))!;
    expect(batch.perItemAnalysis!.unit.state).toBe("unresolved");
    expect(batch.perItemAnalysis!.unit.explanation).toMatch(/actual batch table/i);
    expect(batch.practicalMerchantAction.value).not.toMatch(/batch less|reduce batch/i);
  }, 60_000);
});

function byLabel(corpus: Array<{ analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] }>, part: string): InternalAnalystFinding {
  const finding = corpus.flatMap((item) => item.findings.map((finding) => ({ finding, label: item.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "" })))
    .find((item) => item.label.includes(part))?.finding;
  if (!finding) throw new Error(`missing Batch 2 fixture label: ${part}`);
  return finding;
}

function labelFor(corpus: Array<{ analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[] }>, finding: InternalAnalystFinding): string {
  for (const item of corpus) {
    const label = item.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel;
    if (label) return label;
  }
  return "";
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
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
