import { beforeAll, describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFindingReportV1,
  type InternalAnalystMerchantContext,
  type InternalAnalystPricingModelInput,
  type InternalAnalystResearchContribution,
} from "../../src/canonical/internalAnalystFindingV1.js";
import { GovernedPaymentKnowledgeAuthority, governedIndustryNormsV1 } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf } from "../../src/parser.js";

const PDF_ROOT = "test/fixtures/pdfs";
const US_CONTEXT = {
  geography: {
    value: "us",
    evidenceClass: "qualified_external_research" as const,
    evidenceRefs: ["ratereveal_supported_fiserv_us_market_scope_v1"],
  },
};

describe("Internal Analyst Finding v1", () => {
  let wells: CanonicalStatementAnalysis;
  let paysafe: CanonicalStatementAnalysis;
  let nxgen: CanonicalStatementAnalysis;

  beforeAll(async () => {
    wells = await canonical("fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", "restaurant_food_beverage");
    paysafe = await canonical("fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "retail");
    nxgen = await canonical("fiserv_NXGEN_VORTAX_Sep_2022.pdf", "retail");
  }, 30_000);

  it("keeps official/published meaning, professional norms, participant roles, arithmetic, action, and contract state separate", () => {
    const report = buildInternalAnalystFindingV1({
      analysis: wells,
      statementContext: US_CONTEXT,
      pricingModel: pricing("interchange_plus", wells),
      merchantContext: merchantContext("restaurant_food_beverage", "standard", "card_present", 45),
      asOf: "2026-09-06",
    });
    const assessment = findingByLabel(report, wells, "MASTERCARD ASSESSMENT FEE");
    const auth = findingByLabel(report, wells, "MASTERCARD WATS AUTH FEE");

    expect(report).toMatchObject({
      mode: "internal_analyst_only",
      customerFacingAuthority: "none",
      canonicalFinancialTruth: { unchanged: true, mutationAllowed: false },
      knowledgeAuthority: {
        legacyFeeCatalog: "retrieval_only_not_governing",
        feeKnowledgeResearchSystem: "research_transport_not_governing",
      },
    });
    expect(assessment.exactFeeIdentity).toMatchObject({ state: "supported", confidence: "STRONG" });
    expect(assessment.exactFeeIdentity.evidence.some((item) => item.evidenceClass === "E3_network_publication" || item.evidenceClass === "E4_processor_or_iso_publication")).toBe(true);
    expect(assessment.collector.value).toBe("processor_or_acquirer");
    expect(assessment.economicBeneficiary.value).toBe("card_network");
    expect(assessment.ruleSetter.value).toBe("card_network");
    expect(assessment.merchantFacingPriceController.state).toBe("unresolved");
    expect(auth.printedArithmeticCorrectness.value).toMatch(/reproduces/);

    expect(auth.commercialReasonableness).toMatchObject({ state: "industry_judgment", value: "within_norm", confidence: "STRONG" });
    expect(auth.commercialReasonableness.evidence.some((item) => item.evidenceClass === "E5_professional_industry_norm")).toBe(true);
    expect(auth.commercialReasonableness.explanation).toContain("average ticket of $45.00");
    expect(auth.practicalMerchantAction.value).toMatch(/does not require|no agreement/i);
    expect(auth.contractualCompliance).toMatchObject({ state: "contract_required", value: null });
    expect(auth.contractualCompliance.explanation).toMatch(/agreement\/pricing schedule/);
  });

  it("admits independently evidenced AI-assisted research for unfamiliar terminology but leaves unsupported competing interpretations unresolved", () => {
    const cpu = rowByLabel(paysafe, "MASTERCARD - CPU GTWY");
    const additional = rowByLabel(paysafe, "**ADDITIONAL FEES");
    const contributions: InternalAnalystResearchContribution[] = [
      {
        contributionId: "research_fiserv_cpu_gateway_2026_09_06",
        targetFeeRowId: cpu.id,
        status: "admitted_verified",
        reviewedAt: "2026-09-06",
        admission: {
          basis: "governed_human_review",
          decisionRef: "admission_fiserv_cpu_gateway_2026_09_06",
          reviewerId: "payments_knowledge_reviewer_fixture",
          documentFingerprint: "processor_document_fingerprint_fixture",
          evidenceLocatorHash: "processor_document_locator_hash_fixture",
        },
        evidenceClasses: ["E4_processor_or_iso_publication", "E8_ai_hypothesis"],
        sourceRefs: ["qualified_processor_statement_guide_cpu_gateway_locator"],
        aiAssisted: true,
        claims: {
          exactFeeIdentity: "gateway_authorization_processing_fee",
          broaderEconomicCategory: "authorization_gateway_technology",
          assessmentUnit: "authorization_request",
          collector: "processor_or_acquirer",
          economicBeneficiary: "gateway_or_technology_provider",
        },
        interpretation: "Fiserv-presented CPU gateway authorization charge.",
        limitations: ["The evidence does not establish the merchant-facing price controller or contract rate."],
      },
      {
        contributionId: "research_additional_fee_competing_hypotheses",
        targetFeeRowId: additional.id,
        status: "conflicting",
        reviewedAt: null,
        admission: null,
        evidenceClasses: ["E8_ai_hypothesis"],
        sourceRefs: ["ai_research_lead_additional_fees"],
        aiAssisted: true,
        claims: { broaderEconomicCategory: "administrative_or_third_party_product" },
        interpretation: "Could be a processor administrative charge or a third-party product bundle; no independent evidence distinguishes them.",
        limitations: ["AI hypothesis only."],
      },
    ];
    const baselineFingerprint = canonicalFinancialTruthFingerprint(paysafe);
    const baseline = buildInternalAnalystFindingV1({
      analysis: paysafe,
      statementContext: US_CONTEXT,
      pricingModel: pricing("tiered_pricing", paysafe),
      merchantContext: merchantContext("ecommerce", "standard", "card_not_present", 220),
      asOf: "2026-09-06",
    });
    const researched = buildInternalAnalystFindingV1({
      analysis: paysafe,
      statementContext: US_CONTEXT,
      pricingModel: pricing("tiered_pricing", paysafe),
      merchantContext: merchantContext("ecommerce", "standard", "card_not_present", 220),
      researchContributions: contributions,
      asOf: "2026-09-06",
    });
    const cpuFinding = researched.findings.find((item) => item.sourceFeeRowId === cpu.id)!;
    const unresolved = researched.findings.find((item) => item.sourceFeeRowId === additional.id)!;
    const opacity = researched.findings.find((item) => item.surface === "pricing_model_opacity")!;

    expect(cpuFinding.exactFeeIdentity).toMatchObject({ value: "gateway_authorization_processing_fee", state: "supported", confidence: "LIKELY" });
    expect(cpuFinding.exactFeeIdentity.evidence.some((item) => item.evidenceClass === "E4_processor_or_iso_publication")).toBe(true);
    expect(unresolved.exactFeeIdentity.state).toBe("unresolved");
    expect(unresolved.competingInterpretations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "research", status: "conflicting" }),
    ]));
    expect(researched.researchQueue).toMatchObject({
      transport: "feeKnowledge_research_v1",
      authority: "research_leads_only",
      execution: "not_run_by_report_builder",
    });
    const queuedResearch = [...researched.researchQueue.selected, ...researched.researchQueue.deferred];
    expect(queuedResearch.some((item) => item.question.feeRowRef === additional.id)).toBe(true);
    expect(queuedResearch.some((item) => item.question.feeRowRef === cpu.id)).toBe(false);
    expect(queuedResearch.every((item) =>
      item.question.deterministicCategory === null &&
      item.question.deterministicEconomicOwner === null &&
      item.question.deterministicContractualController === null &&
      item.question.deterministicActionabilityCeiling === "verify_only"
    )).toBe(true);
    expect(opacity.assessmentUnitOrMechanic.state).toBe("unresolved");
    expect(opacity.whyItMatters.value).toMatch(/not computable/);
    expect(opacity.contractualCompliance.state).toBe("contract_required");
    expect(researched.coverage.admittedResearchResolutions).toBe(1);
    expect(researched.canonicalFinancialTruth.beforeFingerprint).toBe(baselineFingerprint);
    expect(researched.canonicalFinancialTruth.afterFingerprint).toBe(baselineFingerprint);
    expect(baseline.canonicalFinancialTruth.beforeFingerprint).toBe(researched.canonicalFinancialTruth.beforeFingerprint);
    expect(canonicalFinancialTruthFingerprint(paysafe)).toBe(baselineFingerprint);
  });

  it("lets merchant risk context change a commercial negotiability judgment without changing statement facts", () => {
    const highRisk = buildInternalAnalystFindingV1({
      analysis: nxgen,
      statementContext: US_CONTEXT,
      pricingModel: pricing("interchange_plus", nxgen),
      merchantContext: merchantContext("ecommerce", "high_risk", "card_not_present", 530),
      asOf: "2026-09-06",
    });
    const standardRisk = buildInternalAnalystFindingV1({
      analysis: nxgen,
      statementContext: US_CONTEXT,
      pricingModel: pricing("interchange_plus", nxgen),
      merchantContext: merchantContext("ecommerce", "standard", "card_not_present", 530),
      asOf: "2026-09-06",
    });
    const highRiskChargeback = findingByLabel(highRisk, nxgen, "CHARGEBACKS");
    const standardChargeback = findingByLabel(standardRisk, nxgen, "CHARGEBACKS");

    expect(highRiskChargeback.negotiability).toMatchObject({ state: "industry_judgment", value: "rarely_negotiable" });
    expect(highRiskChargeback.negotiability.explanation).toContain("High-risk/dispute-heavy context");
    expect(standardChargeback.negotiability.value).toBe("sometimes_negotiable");
    expect(highRisk.canonicalFinancialTruth.beforeFingerprint).toBe(standardRisk.canonicalFinancialTruth.beforeFingerprint);
    expect(highRiskChargeback.observedAmountMinor).toBe(standardChargeback.observedAmountMinor);
  });

  it("expires governed norms after their review horizon and never relabels them as official facts", () => {
    const authority = new GovernedPaymentKnowledgeAuthority();
    expect(governedIndustryNormsV1().every((norm) => norm.evidenceClass === "E5_professional_industry_norm" && norm.owner && norm.reviewedAt && norm.reviewDueAt)).toBe(true);
    expect(authority.findNorms({ label: "AUTH FEE", conceptId: "authorization_service_fee", asOf: "2027-09-07" })).toEqual([]);
  });
});

async function canonical(file: string, businessType: "restaurant_food_beverage" | "retail"): Promise<CanonicalStatementAnalysis> {
  const document = await parsePdf(`${PDF_ROOT}/${file}`);
  return buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file, businessType });
}

function pricing(model: InternalAnalystPricingModelInput["model"], analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  return {
    model,
    confidence: "high",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function merchantContext(
  verticalId: string,
  riskClass: InternalAnalystMerchantContext["riskClass"],
  channel: InternalAnalystMerchantContext["channel"],
  averageTicketUsd: number,
): InternalAnalystMerchantContext {
  return {
    verticalId,
    riskClass,
    channel,
    averageTicketUsd,
    evidenceRefs: [`merchant_context_${verticalId}_${riskClass}_${channel}`],
    basis: "merchant_confirmed",
  };
}

function rowByLabel(analysis: CanonicalStatementAnalysis, part: string) {
  const row = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(part));
  if (!row) throw new Error(`missing fixture fee row: ${part}`);
  return row;
}

function findingByLabel(report: InternalAnalystFindingReportV1, analysis: CanonicalStatementAnalysis, part: string) {
  const row = rowByLabel(analysis, part);
  const finding = report.findings.find((item) => item.sourceFeeRowId === row.id);
  if (!finding) throw new Error(`missing material finding: ${part}`);
  return finding;
}
