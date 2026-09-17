import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  type InternalAnalystFindingReportV1,
  type InternalAnalystMerchantContext,
  type InternalAnalystPricingModelInput,
  type InternalAnalystResearchContribution,
} from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import type { BusinessTypeId } from "../src/businessTypes.js";

const ROOT = "test/fixtures/pdfs";
const AS_OF = "2026-09-06";
const statementContext = {
  geography: { value: "us", evidenceClass: "qualified_external_research" as const, evidenceRefs: ["ratereveal_supported_fiserv_us_market_scope_v1"] },
};

type EvaluationCase = {
  name: string;
  analysis: CanonicalStatementAnalysis;
  pricing: InternalAnalystPricingModelInput;
  report: InternalAnalystFindingReportV1;
};

async function main(): Promise<void> {
  const wells = await loadCase(
    "Wells Fargo / El Nuevo Tequila Sep 2024",
    "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
    "restaurant_food_beverage",
    context("restaurant_food_beverage", "standard", "card_present", 45),
  );
  const paysafeBase = await loadInputs(
    "Paysafe / Futurmarket Oct 2025",
    "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
    "retail",
  );
  const cpu = row(paysafeBase.analysis, "MASTERCARD - CPU GTWY");
  const additional = row(paysafeBase.analysis, "**ADDITIONAL FEES");
  const research: InternalAnalystResearchContribution[] = [
    {
      contributionId: "research_fiserv_cpu_gateway_2026_09_06",
      targetFeeRowId: cpu.id,
      status: "admitted_verified",
      reviewedAt: AS_OF,
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
      limitations: ["Merchant-facing price control and contracted rate are not established."],
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
      interpretation: "Processor administrative charge and third-party product bundle remain competing explanations.",
      limitations: ["No independent evidence distinguishes the hypotheses."],
    },
  ];
  const paysafe: EvaluationCase = {
    ...paysafeBase,
    report: buildInternalAnalystFindingV1({
      analysis: paysafeBase.analysis,
      statementContext,
      pricingModel: paysafeBase.pricing,
      merchantContext: context("ecommerce", "standard", "card_not_present", 220),
      researchContributions: research,
      asOf: AS_OF,
    }),
  };
  const nxgen = await loadCase(
    "NXGEN / Vortax Sep 2022",
    "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
    "retail",
    context("ecommerce", "high_risk", "card_not_present", 530),
  );

  const assessment = finding(wells, "MASTERCARD ASSESSMENT FEE");
  const auth = finding(wells, "MASTERCARD WATS AUTH FEE");
  const cpuFinding = paysafe.report.findings.find((item) => item.sourceFeeRowId === cpu.id)!;
  const unresolved = paysafe.report.findings.find((item) => item.sourceFeeRowId === additional.id)!;
  const opacity = paysafe.report.findings.find((item) => item.surface === "pricing_model_opacity")!;
  const chargeback = finding(nxgen, "CHARGEBACKS");
  const queuedResearch = [...paysafe.report.researchQueue.selected, ...paysafe.report.researchQueue.deferred];

  const proof = {
    evaluationVersion: "internal_analyst_finding_v1_acceptance_2026_09_06",
    scope: "three_real_supported_fiserv_gold_statements",
    analysisAsOf: AS_OF,
    cases: [wells, paysafe, nxgen].map((item) => ({
      name: item.name,
      detectedPricingModel: item.pricing.model,
      findingCount: item.report.coverage.findings,
      canonicalFinancialTruthUnchanged: item.report.canonicalFinancialTruth.unchanged,
      canonicalFinancialTruthFingerprint: item.report.canonicalFinancialTruth.beforeFingerprint,
    })),
    acceptance: {
      officialPublishedEvidenceBacked: {
        pass: assessment.exactFeeIdentity.evidence.some((item) => item.evidenceClass === "E3_network_publication" || item.evidenceClass === "E4_processor_or_iso_publication"),
        finding: assessment.title,
        identity: assessment.exactFeeIdentity.value,
      },
      industryNormCommercialJudgment: {
        pass: auth.commercialReasonableness.state === "industry_judgment" && auth.commercialReasonableness.evidence.some((item) => item.evidenceClass === "E5_professional_industry_norm"),
        finding: auth.title,
        judgment: auth.commercialReasonableness.value,
        contextEffect: auth.commercialReasonableness.explanation,
      },
      unfamiliarFeeResolvedThroughGovernedResearch: {
        pass: cpuFinding.exactFeeIdentity.value === "gateway_authorization_processing_fee",
        printedLabel: cpu.selectedLabel,
        resolvedIdentity: cpuFinding.exactFeeIdentity.value,
        evidenceClasses: cpuFinding.exactFeeIdentity.evidence.map((item) => item.evidenceClass),
      },
      unresolvedCompetingInterpretationPreserved: {
        pass: unresolved.exactFeeIdentity.state === "unresolved" && unresolved.competingInterpretations.some((item) => item.status === "conflicting"),
        printedLabel: additional.selectedLabel,
        alternatives: unresolved.competingInterpretations.map((item) => item.interpretation),
      },
      unresolvedMaterialIssueQueuedForBoundedResearch: {
        pass: queuedResearch.some((item) => item.question.feeRowRef === additional.id) &&
          !queuedResearch.some((item) => item.question.feeRowRef === cpu.id) &&
          queuedResearch.every((item) => item.question.deterministicEconomicOwner === null && item.question.deterministicActionabilityCeiling === "verify_only"),
        queueAuthority: paysafe.report.researchQueue.authority,
        execution: paysafe.report.researchQueue.execution,
        queuedLabels: queuedResearch.map((item) => item.question.feeLabel),
      },
      usefulActionWithoutAgreement: {
        pass: Boolean(auth.practicalMerchantAction.value?.includes("does not require the merchant agreement")),
        action: auth.practicalMerchantAction.value,
      },
      genuinelyContractDependentConclusion: {
        pass: opacity.contractualCompliance.state === "contract_required",
        conclusion: opacity.contractualCompliance.explanation,
      },
      verticalRiskContextAffectsCommercialJudgment: {
        pass: chargeback.negotiability.value === "rarely_negotiable" && chargeback.negotiability.explanation.includes("High-risk"),
        context: nxgen.report.merchantContext,
        judgment: chargeback.negotiability,
      },
      canonicalTruthInvariantAcrossResearch: {
        pass: paysafe.report.canonicalFinancialTruth.beforeFingerprint === paysafe.report.canonicalFinancialTruth.afterFingerprint,
        fingerprint: paysafe.report.canonicalFinancialTruth.beforeFingerprint,
      },
      processorMarkupNonFabrication: {
        pass: opacity.assessmentUnitOrMechanic.state === "unresolved" && opacity.whyItMatters.value?.includes("not computable"),
        pricingModel: paysafe.pricing.model,
        conclusion: opacity.whyItMatters.value,
      },
    },
  };
  const failed = Object.entries(proof.acceptance).filter(([, value]) => !value.pass).map(([key]) => key);
  process.stdout.write(`${JSON.stringify({ ...proof, passed: failed.length === 0, failed }, null, 2)}\n`);
  if (failed.length > 0) process.exitCode = 1;
}

async function loadCase(name: string, file: string, businessType: BusinessTypeId, merchantContext: InternalAnalystMerchantContext): Promise<EvaluationCase> {
  const inputs = await loadInputs(name, file, businessType);
  return {
    ...inputs,
    report: buildInternalAnalystFindingV1({
      analysis: inputs.analysis,
      statementContext,
      pricingModel: inputs.pricing,
      merchantContext,
      asOf: AS_OF,
    }),
  };
}

async function loadInputs(name: string, file: string, businessType: BusinessTypeId): Promise<Omit<EvaluationCase, "report">> {
  const document = await parsePdf(`${ROOT}/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file, businessType });
  return { name, analysis, pricing: deterministicPricing(document, file, businessType, analysis) };
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const value = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = value?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error(`deterministic pricing model unavailable for ${file}`);
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((item) => item.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function context(verticalId: string, riskClass: InternalAnalystMerchantContext["riskClass"], channel: InternalAnalystMerchantContext["channel"], averageTicketUsd: number): InternalAnalystMerchantContext {
  return { verticalId, riskClass, channel, averageTicketUsd, evidenceRefs: [`merchant_context_${verticalId}_${riskClass}_${channel}`], basis: "merchant_confirmed" };
}

function row(analysis: CanonicalStatementAnalysis, part: string) {
  const value = analysis.feeLedger.rows.find((item) => item.selectedLabel.includes(part));
  if (!value) throw new Error(`missing evaluation row: ${part}`);
  return value;
}

function finding(evaluation: EvaluationCase, part: string) {
  const source = row(evaluation.analysis, part);
  const value = evaluation.report.findings.find((item) => item.sourceFeeRowId === source.id);
  if (!value) throw new Error(`missing evaluation finding: ${part}`);
  return value;
}

await main();
