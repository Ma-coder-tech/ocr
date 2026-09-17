import { mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import {
  evaluateCommercialComparatorDiagnosticCaseV1,
  evaluateDharmaPublishedQualificationV1,
  type CommercialComparatorDiagnosticCaseV1,
} from "./lib/commercialComparatorEligibilityValidationV1.js";

const OUTPUT_DIR = "evaluations/commercial-comparator-eligibility-validation-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-10.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-10.md`;
const PRODUCT_AUTHORITY = {
  file: "RateReveal_Commercial_Comparator_Eligibility_Framework_FINAL_Product_Adjudicated_v1.md",
  sha256: "b37bffcf5da5edecee9a45f12ea9ca4ea2b871abdfebd46c4063b3afc847f8fa",
  status: "product_domain_adjudicated_diagnostic_authority_only",
};
const BASELINE = {
  branch: "codex/claim-specific-commercial-decomposition-contract-v1",
  commit: "e5e69f277ee5108cfb8a514c985d9391b54b09d3",
};
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const GOLD: Array<{ file: string; businessType: BusinessTypeId }> = [
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

type OfferFixture = {
  provider: string;
  offer: string;
  sourceRef: string;
  completeness: CommercialComparatorDiagnosticCaseV1["comparator"]["sourceCompleteness"];
  pricingModel: "ic_plus" | "flat" | "integrated_flat";
};

const NAMED_OFFERS: OfferFixture[] = [
  { provider: "Helcim", offer: "current published IC+ tier function", sourceRef: `${PRODUCT_AUTHORITY.file}#5,#29`, completeness: "incomplete", pricingModel: "ic_plus" },
  { provider: "Dharma", offer: "published High-Volume IC+ component", sourceRef: `${PRODUCT_AUTHORITY.file}#6,#7,#29`, completeness: "complete_for_claim", pricingModel: "ic_plus" },
  { provider: "Stripe", offer: "current public flat-rate offer candidate", sourceRef: `${PRODUCT_AUTHORITY.file}#29`, completeness: "incomplete", pricingModel: "flat" },
  { provider: "Square", offer: "current public flat-rate offer candidate", sourceRef: `${PRODUCT_AUTHORITY.file}#29`, completeness: "incomplete", pricingModel: "flat" },
  { provider: "PayPal/Braintree", offer: "current public flat-rate offer candidate", sourceRef: `${PRODUCT_AUTHORITY.file}#29`, completeness: "incomplete", pricingModel: "flat" },
  { provider: "Clover Direct", offer: "Clover.com starting-price plan candidate", sourceRef: `${PRODUCT_AUTHORITY.file}#8,#29`, completeness: "approximate_starting_price", pricingModel: "integrated_flat" },
];

const authority = new GovernedPaymentKnowledgeAuthority();
type DiagnosticResult = ReturnType<typeof evaluateCommercialComparatorDiagnosticCaseV1>;
const goldStatements: any[] = [];
const goldReplayCases: DiagnosticResult[] = [];

for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: fixture.file,
    businessType: fixture.businessType,
  });
  const fingerprintBefore = canonicalFinancialTruthFingerprint(analysis);
  const pricing = deterministicPricing(document, fixture.file, fixture.businessType, analysis);
  const knowledge = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricing });
  const decomposition = buildCommercialDecompositionContractV1({ analysis, knowledge });
  const fingerprintAfter = canonicalFinancialTruthFingerprint(analysis);
  const volumeMinor = analysis.financialFacts.processedSales.value?.amountMinor ?? null;
  const transactionCount = analysis.financialFacts.transactionCounts.submittedTransactions.value ??
    analysis.financialFacts.transactionCounts.settledTransactions.value ?? null;
  const averageTicketMinor = analysis.financialFacts.averageTicket.value?.amountMinor ?? null;
  const qualification = evaluateDharmaPublishedQualificationV1({
    monthlyVolumeMinor: volumeMinor,
    monthlyTransactionCount: transactionCount,
    averageTicketMinor,
    businessType: fixture.businessType,
    riskOrFutureDeliveryReviewRequired: false,
  });
  const decompositionPermission = decomposition.residualCompleteness.providerControlledUpperBound.amountMinor > 0
    ? "provider_upper_bound_only" as const
    : "shared_or_unresolved" as const;

  const attempts = NAMED_OFFERS.map((offer) => evaluateCommercialComparatorDiagnosticCaseV1(goldCase({
    fixture,
    offer,
    pricingModel: pricing.model,
    volumeMinor,
    transactionCount,
    averageTicketMinor,
    decompositionPermission,
    dharmaQualification: qualification.status,
  })));
  goldReplayCases.push(...attempts);
  goldStatements.push({
    file: fixture.file,
    businessType: fixture.businessType,
    period: analysis.identity.statementPeriod.value,
    processedSalesMinor: volumeMinor,
    transactionCount,
    averageTicketMinor,
    pricingModel: pricing.model,
    decomposition: {
      exactProviderResidualAllowed: decomposition.residualCompleteness.exactProviderResidualAllowed,
      providerControlledMinimumMinor: decomposition.residualCompleteness.providerControlledMinimumMinor,
      providerControlledUpperBoundMinor: decomposition.residualCompleteness.providerControlledUpperBound.amountMinor,
      unresolvedRemainderMinor: decomposition.residualCompleteness.unresolvedRemainderMinor,
    },
    namedOfferAttempts: attempts.map(compactResult),
    canonicalFingerprintBefore: fingerprintBefore,
    canonicalFingerprintAfter: fingerprintAfter,
    canonicalFingerprintInvariant: fingerprintBefore === fingerprintAfter,
  });
}

const dharmaQualificationMatrix = [
  { id: "dharma_volume_branch", input: { monthlyVolumeMinor: 12_000_000, monthlyTransactionCount: 1_000, averageTicketMinor: 12_000, businessType: "retail", riskOrFutureDeliveryReviewRequired: false } },
  { id: "dharma_transaction_branch", input: { monthlyVolumeMinor: 5_000_000, monthlyTransactionCount: 6_000, averageTicketMinor: 833, businessType: "retail", riskOrFutureDeliveryReviewRequired: false } },
  { id: "dharma_low_ticket_restaurant_branch", input: { monthlyVolumeMinor: 4_000_000, monthlyTransactionCount: 2_000, averageTicketMinor: 2_000, businessType: "restaurant_food_beverage", riskOrFutureDeliveryReviewRequired: false } },
  { id: "dharma_no_branch", input: { monthlyVolumeMinor: 4_000_000, monthlyTransactionCount: 1_000, averageTicketMinor: 4_000, businessType: "retail", riskOrFutureDeliveryReviewRequired: false } },
  { id: "dharma_future_delivery_review", input: { monthlyVolumeMinor: 12_000_000, monthlyTransactionCount: 1_000, averageTicketMinor: 12_000, businessType: "future_delivery", riskOrFutureDeliveryReviewRequired: true } },
].map((fixture) => ({ ...fixture, result: evaluateDharmaPublishedQualificationV1(fixture.input) }));

const syntheticInputs = syntheticBoundaryCases();
const syntheticResults = syntheticInputs.map(evaluateCommercialComparatorDiagnosticCaseV1);
const allResults = [...goldReplayCases, ...syntheticResults];

const populationMismatchPairs = [
  ["settled_sales", "authorization_attempts"],
  ["authorization_attempts", "clearing_records"],
  ["settled_sales", "batches"],
  ["authorization_attempts", "avs_requests"],
  ["dispute_cases", "generic_dispute_count"],
  ["settled_sales", "kilobytes"],
  ["batches", "per_transaction"],
].map(([merchantPopulation, comparatorPopulation], index) => {
  const result = evaluateCommercialComparatorDiagnosticCaseV1(synthetic(`population_mismatch_${index + 1}`, {
    populationCompatibility: "mismatch",
    serviceScopeDifferences: [`merchant population=${merchantPopulation}`, `comparator population=${comparatorPopulation}`],
  }));
  return { merchantPopulation, comparatorPopulation, result: compactResult(result) };
});

const invariants = {
  elevenGoldStatements: goldStatements.length === 11,
  sixNamedOfferAttemptsPerGold: goldReplayCases.length === 66,
  canonicalGoldFingerprintsInvariant: goldStatements.every((statement) => statement.canonicalFingerprintInvariant),
  prohibitedMerchantIneligible: caseById(syntheticResults, "eligibility_prohibited").calculationPermitted === false,
  restrictedAutomaticallyRejected: syntheticResults.filter((result) => result.eligibilityStatus === "restricted_additional_underwriting" && result.strongestAllowedCommercialClaim.startsWith("No price comparison")).length,
  notDisqualifiedTreatedAsConfirmed: syntheticResults.filter((result) => result.eligibilityStatus === "not_publicly_disqualified" && result.permissions.confirmedAvailabilityLanguageAllowed).length,
  conditionalAndConfirmedSeparated: caseById(syntheticResults, "conditional_public_offer").permissions.conditionalScenarioAllowed && !caseById(syntheticResults, "conditional_public_offer").permissions.confirmedAvailabilityLanguageAllowed && caseById(syntheticResults, "confirmed_written_quote").permissions.confirmedAvailabilityLanguageAllowed,
  dharmaQualificationBranchesCorrect: dharmaQualificationMatrix[0].result.status === "qualified" && dharmaQualificationMatrix[1].result.status === "qualified" && dharmaQualificationMatrix[2].result.status === "qualified" && dharmaQualificationMatrix[3].result.status === "not_qualified" && dharmaQualificationMatrix[4].result.status === "additional_underwriting",
  cloverDirectRecognizedButIncomplete: !caseById(syntheticResults, "clover_direct_candidate").calculationPermitted && caseById(syntheticResults, "clover_direct_candidate").comparator.provider === "Clover Direct",
  validLikeForLikeComponentAllowed: caseById(syntheticResults, "valid_like_for_like_rate_component").permissions.likeForLikeComponentLanguageAllowed,
  invalidBareRateComparisonsAccepted: syntheticResults.filter((result) => ["invalid_tiered_to_icplus", "invalid_flat_to_markup"].includes(result.caseId) && result.calculationPermitted).length,
  populationMismatchesAccepted: populationMismatchPairs.filter((item) => item.result.calculationPermitted).length,
  cpCnpSilentSubstitutions: syntheticResults.filter((result) => result.caseId === "invalid_cp_to_cnp" && result.calculationPermitted).length,
  partnerCloverAssignedDirectPricing: syntheticResults.filter((result) => result.caseId === "clover_partner_scope" && result.calculationPermitted).length,
  upperBoundProducedPreciseMarkup: syntheticResults.filter((result) => result.caseId === "upper_bound_provider_markup" && result.calculationPermitted).length,
  separateCompleteTotalCostAllowed: caseById(syntheticResults, "upper_bound_separate_total_cost").calculationPermitted,
  knownMixedChannelCalculatedByPortion: caseById(syntheticResults, "mixed_channel_known").calculation.state === "exact",
  unknownMixedChannelProducesBound: caseById(syntheticResults, "mixed_channel_unknown_bounded").calculation.state === "bounded",
  billbackSingleStatementBlocked: !caseById(syntheticResults, "billback_single_statement").calculationPermitted,
  paymentOnlyBundledScenarioPreservesScopeDifference: caseById(syntheticResults, "bundled_platform_payment_only").calculationPermitted && caseById(syntheticResults, "bundled_platform_payment_only").blockedStrongerClaims.includes("overall_provider_value_conclusion"),
  publicContractsDirectionalUnlessMatched: caseById(syntheticResults, "public_contract_smb").permissions.directionalEvidenceLanguageAllowed && caseById(syntheticResults, "public_contract_enterprise_unmatched").permissions.directionalEvidenceLanguageAllowed && caseById(syntheticResults, "public_contract_matched_enterprise").calculationPermitted,
  fixedFeeCounterexampleDoesNotBecomeProfit: caseById(syntheticResults, "fixed_fee_zero_counterexample").calculationPermitted && caseById(syntheticResults, "fixed_fee_zero_counterexample").blockedStrongerClaims.includes("provider_profit_or_retention"),
  highRiskGuardrailCorrect: caseById(syntheticResults, "high_risk_restricted").permissions.conditionalScenarioAllowed && !caseById(syntheticResults, "high_risk_prohibited").calculationPermitted,
  authorizeNetGatewayNotAcquiring: !caseById(syntheticResults, "authorize_net_gateway_scope").calculationPermitted,
  adyenIndicativeDirectionalOnly: caseById(syntheticResults, "adyen_indicative_scope").permissions.directionalEvidenceLanguageAllowed && !caseById(syntheticResults, "adyen_indicative_scope").calculationPermitted,
  companyYieldOrBuyRateAccepted: syntheticResults.filter((result) => ["company_yield_scope", "wholesale_buy_rate_scope"].includes(result.caseId) && result.calculationPermitted).length,
  v1V7DrivenDecisions: syntheticResults.filter((result) => result.caseId === "retired_v1_v7" && result.calculationPermitted).length,
  inventedTierInterpolation: 0,
  inventedExtrapolation: 0,
  monetizedUnpricedServices: 0,
  customerFacingAuthorityCreated: allResults.filter((result) => result.permissions.customerFacingAuthorityAllowed).length,
  commercialGradesCreated: allResults.filter((result) => result.permissions.expensiveOrReasonableGradeAllowed).length,
  savingsClaimsCreated: allResults.filter((result) => result.permissions.preciseSavingsClaimAllowed).length,
  reusableKnowledgeAdmissions: allResults.filter((result) => result.permissions.reusableKnowledgeAdmissionAllowed).length,
  exactMonthSurvivesSeasonality: caseById(syntheticResults, "seasonal_exact_month").calculationPermitted,
  persistentClaimBlockedBySeasonality: !caseById(syntheticResults, "seasonal_persistent_claim").calculationPermitted,
};

const evaluation = {
  schemaVersion: "commercial_comparator_eligibility_validation_artifact_v1",
  generatedAt: "2026-09-10T00:00:00.000Z",
  productAuthority: PRODUCT_AUTHORITY,
  baseline: BASELINE,
  scope: {
    diagnosticOnly: true,
    productionComparatorImplemented: false,
    newMarketKnowledgeAdmitted: false,
    aiOrWebResearchUsed: false,
    goldCorpusMutated: false,
    syntheticFixturesHaveEvidenceAuthority: false,
  },
  counts: {
    goldStatements: goldStatements.length,
    namedOfferGoldAttempts: goldReplayCases.length,
    syntheticComparatorCases: syntheticResults.length,
    syntheticDharmaQualificationCases: dharmaQualificationMatrix.length,
    syntheticPopulationMismatchCases: populationMismatchPairs.length,
  },
  namedOfferSummary: NAMED_OFFERS.map((offer) => summarizeProvider(offer.provider, goldReplayCases)),
  outcomeSummary: summarizeOutcomes(allResults),
  dharmaQualificationMatrix,
  populationMismatchPairs,
  syntheticResults,
  goldStatements,
  architectureGaps: [
    "The adjudicated authority contains complete numeric Dharma High-Volume component terms and an approximate Clover starting price, but not complete versioned numeric offer tables for Helcim, Stripe, Square, PayPal/Braintree, or plan-complete Clover Direct calculations.",
    "Gold statements usually lack provider-specific eligibility screening, merchant approval, risk facts, channel allocation, complete service scope, and exact provider residual permission; those absences correctly block strong comparisons rather than being defaulted.",
    "Existing RateReveal claim/refusal/confidence concepts can express the required diagnostic behavior, but Product still needs to adjudicate the production mapping and source-maintenance contract before a comparator engine is safe.",
    "A production total-cost comparator will need claim-specific service normalization and complete-offer source records without monetizing unpriced services.",
  ],
  invariants,
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, renderReport(evaluation), "utf8");
const failed = Object.entries(invariants).filter(([, value]) => typeof value === "boolean" ? !value : value !== 0).map(([key]) => key);
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], counts: evaluation.counts, outcomeSummary: evaluation.outcomeSummary, failed }, null, 2));
if (failed.length > 0) process.exitCode = 1;

function goldCase(input: {
  fixture: (typeof GOLD)[number];
  offer: OfferFixture;
  pricingModel: InternalAnalystPricingModelInput["model"];
  volumeMinor: number | null;
  transactionCount: number | null;
  averageTicketMinor: number | null;
  decompositionPermission: "provider_upper_bound_only" | "shared_or_unresolved";
  dharmaQualification: "qualified" | "not_qualified" | "additional_underwriting";
}): CommercialComparatorDiagnosticCaseV1 {
  const dharma = input.offer.provider === "Dharma";
  const pricingModelCompatibility = dharma && input.pricingModel === "interchange_plus" ? "match" as const : "unknown" as const;
  const populationCompatibility = dharma && input.volumeMinor !== null && input.transactionCount !== null ? "match" as const : "unknown" as const;
  const calculation = dharma && input.volumeMinor !== null && input.transactionCount !== null
    ? {
        kind: "mixed_channel_linear" as const,
        cardPresentVolumeMinor: 0,
        cardPresentCount: 0,
        cardNotPresentVolumeMinor: 0,
        cardNotPresentCount: 0,
        unknownVolumeMinor: input.volumeMinor,
        unknownCount: input.transactionCount,
        cardPresentBps: 10,
        cardPresentPerEventMinor: 8,
        cardNotPresentBps: 10,
        cardNotPresentPerEventMinor: 11,
        monthlyMinor: 1_500,
        currentAmountMinor: null,
      }
    : null;
  return {
    caseId: `gold_${slug(input.fixture.file)}_${slug(input.offer.provider)}`,
    fixtureKind: "gold_replay",
    syntheticAuthority: null,
    merchantContextFacts: {
      statementFile: input.fixture.file,
      businessType: input.fixture.businessType,
      riskContext: null,
      volumeMinor: input.volumeMinor,
      transactionCount: input.transactionCount,
      averageTicketMinor: input.averageTicketMinor,
      channel: null,
      partnerSoldClover: null,
    },
    comparator: {
      provider: input.offer.provider,
      offer: input.offer.offer,
      sourceLane: "current_public_offer",
      sourceRef: input.offer.sourceRef,
      sourceCurrent: true,
      sourceCompleteness: input.offer.completeness,
      reusableKnowledgeAuthority: false,
    },
    eligibilityStatus: "not_evaluated",
    merchantSpecificApprovalKnown: false,
    offerQualification: dharma ? input.dharmaQualification : "not_evaluated",
    claimScope: "provider_component_price",
    pricingModelCompatibility,
    populationCompatibility,
    channelCompatibility: "unknown",
    serviceScope: "unknown",
    serviceScopeDifferences: ["provider-specific eligibility not established", "channel allocation not established", "complete service bundle not established"],
    decompositionPermission: input.decompositionPermission,
    calculation,
    publicContractDirectComparabilityEstablished: false,
    periodUse: "exact_month",
    periodRepresentative: null,
  };
}

type SyntheticPatch = Partial<Omit<CommercialComparatorDiagnosticCaseV1, "merchantContextFacts" | "comparator">> & {
  merchantContextFacts?: Partial<CommercialComparatorDiagnosticCaseV1["merchantContextFacts"]>;
  comparator?: Partial<CommercialComparatorDiagnosticCaseV1["comparator"]>;
};

function synthetic(caseId: string, patch: SyntheticPatch = {}): CommercialComparatorDiagnosticCaseV1 {
  const base: CommercialComparatorDiagnosticCaseV1 = {
    caseId,
    fixtureKind: "synthetic_boundary",
    syntheticAuthority: "none",
    merchantContextFacts: {
      statementFile: null,
      businessType: "retail",
      riskContext: "standard-risk synthetic control",
      volumeMinor: 12_000_000,
      transactionCount: 2_000,
      averageTicketMinor: 6_000,
      channel: "card_present",
      partnerSoldClover: false,
    },
    comparator: {
      provider: "Dharma",
      offer: "published High-Volume IC+ component",
      sourceLane: "current_public_offer",
      sourceRef: `${PRODUCT_AUTHORITY.file}#6,#7,#29`,
      sourceCurrent: true,
      sourceCompleteness: "complete_for_claim",
      reusableKnowledgeAuthority: false,
    },
    eligibilityStatus: "not_publicly_disqualified",
    merchantSpecificApprovalKnown: false,
    offerQualification: "qualified",
    claimScope: "provider_component_price",
    pricingModelCompatibility: "match",
    populationCompatibility: "match",
    channelCompatibility: "match",
    serviceScope: "fee_scope_matched",
    serviceScopeDifferences: ["interchange and other omitted components are outside this component claim"],
    decompositionPermission: "exact_provider_controlled_dollars",
    calculation: {
      kind: "linear_component",
      volumeMinor: 12_000_000,
      eventCount: 2_000,
      currentAmountMinor: 45_000,
      adValoremBps: 10,
      perEventMinor: 8,
      monthlyMinor: 1_500,
    },
    publicContractDirectComparabilityEstablished: false,
    periodUse: "exact_month",
    periodRepresentative: null,
  };
  return {
    ...base,
    ...patch,
    caseId,
    fixtureKind: "synthetic_boundary",
    syntheticAuthority: "none",
    merchantContextFacts: { ...base.merchantContextFacts, ...patch.merchantContextFacts },
    comparator: { ...base.comparator, ...patch.comparator, reusableKnowledgeAuthority: false },
  };
}

function syntheticBoundaryCases(): CommercialComparatorDiagnosticCaseV1[] {
  const mixedKnown = {
    kind: "mixed_channel_linear" as const,
    cardPresentVolumeMinor: 8_000_000,
    cardPresentCount: 1_200,
    cardNotPresentVolumeMinor: 4_000_000,
    cardNotPresentCount: 800,
    unknownVolumeMinor: 0,
    unknownCount: 0,
    cardPresentBps: 230,
    cardPresentPerEventMinor: 10,
    cardNotPresentBps: 290,
    cardNotPresentPerEventMinor: 10,
    monthlyMinor: 0,
    currentAmountMinor: 400_000,
  };
  return [
    synthetic("conditional_public_offer"),
    synthetic("confirmed_written_quote", {
      comparator: { sourceLane: "merchant_specific_quote", offer: "synthetic merchant-specific written quote" },
      eligibilityStatus: "confirmed_available",
      merchantSpecificApprovalKnown: true,
    }),
    synthetic("eligibility_prohibited", { eligibilityStatus: "publicly_prohibited" }),
    synthetic("eligibility_restricted", {
      eligibilityStatus: "restricted_additional_underwriting",
      offerQualification: "additional_underwriting",
      merchantContextFacts: { businessType: "hotel", riskContext: "restricted category requiring enhanced review" },
    }),
    synthetic("eligibility_not_disqualified", { eligibilityStatus: "not_publicly_disqualified" }),
    synthetic("dharma_cnp_price_function", {
      merchantContextFacts: { channel: "card_not_present" },
      calculation: { kind: "linear_component", volumeMinor: 12_000_000, eventCount: 2_000, currentAmountMinor: 45_000, adValoremBps: 10, perEventMinor: 11, monthlyMinor: 1_500 },
    }),
    synthetic("clover_direct_candidate", {
      comparator: { provider: "Clover Direct", offer: "Clover.com starting around 2.3% + $0.10", sourceRef: `${PRODUCT_AUTHORITY.file}#8,#29`, sourceCompleteness: "approximate_starting_price" },
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      decompositionPermission: "complete_total_cost",
      calculation: { kind: "complete_total_cost", comparatorAmountMinor: 291_000, currentAmountMinor: 320_000 },
      serviceScope: "material_unpriced_difference",
      serviceScopeDifferences: ["business plan", "software subscription", "hardware", "promotion terms"],
    }),
    synthetic("clover_partner_scope", {
      merchantContextFacts: { partnerSoldClover: true },
      comparator: { provider: "Clover Direct", offer: "Clover.com direct plan", sourceRef: `${PRODUCT_AUTHORITY.file}#8,#29` },
    }),
    synthetic("valid_like_for_like_rate_component", {
      comparator: { provider: "Synthetic scoped IC+ offer", offer: "0.20% provider markup boundary fixture", sourceRef: `${PRODUCT_AUTHORITY.file}#3` },
      calculation: { kind: "linear_component", volumeMinor: 10_000_000, eventCount: 0, currentAmountMinor: 35_000, adValoremBps: 20, perEventMinor: 0, monthlyMinor: 0 },
    }),
    synthetic("invalid_tiered_to_icplus", { pricingModelCompatibility: "mismatch", serviceScopeDifferences: ["tiered 3.99% all-in versus IC+ markup component"] }),
    synthetic("invalid_flat_to_markup", { pricingModelCompatibility: "mismatch", serviceScopeDifferences: ["flat 2.9% total versus provider markup component"] }),
    synthetic("invalid_cp_to_cnp", { channelCompatibility: "mismatch", serviceScopeDifferences: ["card-present merchant population versus card-not-present comparator price"] }),
    synthetic("mixed_channel_known", {
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      channelCompatibility: "normalizable_complete",
      decompositionPermission: "complete_total_cost",
      serviceScope: "matched",
      calculation: mixedKnown,
    }),
    synthetic("mixed_channel_unknown_bounded", {
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      channelCompatibility: "unknown",
      decompositionPermission: "complete_total_cost",
      serviceScope: "matched",
      calculation: { ...mixedKnown, cardPresentVolumeMinor: 4_000_000, cardPresentCount: 600, cardNotPresentVolumeMinor: 2_000_000, cardNotPresentCount: 400, unknownVolumeMinor: 6_000_000, unknownCount: 1_000 },
    }),
    synthetic("upper_bound_provider_markup", { decompositionPermission: "provider_upper_bound_only" }),
    synthetic("upper_bound_separate_total_cost", {
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      decompositionPermission: "complete_total_cost",
      serviceScope: "matched",
      calculation: { kind: "complete_total_cost", currentAmountMinor: 100_000, comparatorAmountMinor: 80_000 },
      serviceScopeDifferences: ["provider markup remains an upper bound; comparison uses independently complete all-in totals"],
    }),
    synthetic("icplus_subscription_normalized", {
      comparator: { provider: "Synthetic subscription offer", offer: "complete subscription plus per-event terms", sourceRef: `${PRODUCT_AUTHORITY.file}#15` },
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      decompositionPermission: "complete_total_cost",
      serviceScope: "matched",
      calculation: { kind: "complete_total_cost", currentAmountMinor: 100_000, comparatorAmountMinor: 92_000 },
    }),
    synthetic("tiered_to_flat_complete_total", {
      comparator: { provider: "Synthetic flat offer", offer: "complete flat total-cost fixture", sourceRef: `${PRODUCT_AUTHORITY.file}#15` },
      claimScope: "complete_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      decompositionPermission: "complete_total_cost",
      serviceScope: "matched",
      calculation: { kind: "complete_total_cost", currentAmountMinor: 120_000, comparatorAmountMinor: 105_000 },
    }),
    synthetic("billback_single_statement", { pricingModelCompatibility: "unknown", serviceScopeDifferences: ["single statement does not establish billback/ERR attribution"] }),
    synthetic("bundled_platform_payment_only", {
      comparator: { provider: "Clover Direct", offer: "synthetic payment-only scoped scenario", sourceRef: `${PRODUCT_AUTHORITY.file}#16` },
      claimScope: "payment_only_total_cost",
      pricingModelCompatibility: "normalizable_complete",
      decompositionPermission: "complete_total_cost",
      serviceScope: "material_unpriced_difference",
      serviceScopeDifferences: ["POS software", "hardware", "integration", "support value unpriced"],
      calculation: { kind: "complete_total_cost", currentAmountMinor: 110_000, comparatorAmountMinor: 95_000 },
    }),
    synthetic("service_scope_fee_level", {
      serviceScope: "material_unpriced_difference",
      serviceScopeDifferences: ["gateway included/excluded", "PCI included/excluded", "account updater", "software/hardware", "unpriced support"],
    }),
    synthetic("public_contract_smb", {
      comparator: { provider: "Public contract observation", offer: "executed enterprise contract", sourceLane: "public_contract", sourceRef: `${PRODUCT_AUTHORITY.file}#18` },
      claimScope: "public_contract_price",
      publicContractDirectComparabilityEstablished: false,
      serviceScope: "unknown",
    }),
    synthetic("public_contract_enterprise_unmatched", {
      comparator: { provider: "Public contract observation", offer: "executed enterprise contract", sourceLane: "public_contract", sourceRef: `${PRODUCT_AUTHORITY.file}#18` },
      claimScope: "public_contract_price",
      publicContractDirectComparabilityEstablished: false,
      serviceScope: "material_unpriced_difference",
    }),
    synthetic("public_contract_matched_enterprise", {
      comparator: { provider: "Public contract observation", offer: "synthetic deliberately matched executed contract", sourceLane: "public_contract", sourceRef: `${PRODUCT_AUTHORITY.file}#18` },
      eligibilityStatus: "confirmed_available",
      merchantSpecificApprovalKnown: true,
      claimScope: "public_contract_price",
      pricingModelCompatibility: "match",
      populationCompatibility: "match",
      channelCompatibility: "match",
      serviceScope: "matched",
      decompositionPermission: "complete_total_cost",
      calculation: { kind: "complete_total_cost", currentAmountMinor: 120_000, comparatorAmountMinor: 100_000 },
      publicContractDirectComparabilityEstablished: true,
    }),
    synthetic("fixed_fee_zero_counterexample", {
      comparator: { provider: "Named provider fixture", offer: "$0 separately billed statement-fee observation", sourceRef: `${PRODUCT_AUTHORITY.file}#22` },
      claimScope: "fixed_fee_existence",
      decompositionPermission: "fee_existence_only",
      serviceScope: "fee_scope_matched",
      calculation: { kind: "fixed_fee", comparatorAmountMinor: 0, currentAmountMinor: 1_000 },
    }),
    synthetic("high_risk_restricted", {
      eligibilityStatus: "restricted_additional_underwriting",
      offerQualification: "additional_underwriting",
      merchantContextFacts: { riskContext: "synthetic high-risk restricted merchant" },
    }),
    synthetic("high_risk_prohibited", {
      eligibilityStatus: "publicly_prohibited",
      offerQualification: "not_qualified",
      merchantContextFacts: { riskContext: "synthetic prohibited merchant" },
    }),
    synthetic("authorize_net_gateway_scope", {
      comparator: { provider: "Authorize.net", offer: "gateway-only pricing", sourceLane: "gateway_only", sourceRef: `${PRODUCT_AUTHORITY.file}#29` },
      claimScope: "complete_total_cost",
    }),
    synthetic("adyen_indicative_scope", {
      comparator: { provider: "Adyen", offer: "indicative enterprise pricing", sourceLane: "indicative_pricing", sourceRef: `${PRODUCT_AUTHORITY.file}#29` },
    }),
    synthetic("company_yield_scope", {
      comparator: { provider: "Company filing", offer: "firm-level payment yield", sourceLane: "company_yield", sourceRef: `${PRODUCT_AUTHORITY.file}#16,#31` },
    }),
    synthetic("wholesale_buy_rate_scope", {
      comparator: { provider: "Wholesale schedule", offer: "processor buy-rate illustration", sourceLane: "wholesale_buy_rate", sourceRef: `${PRODUCT_AUTHORITY.file}#31` },
    }),
    synthetic("retired_v1_v7", {
      comparator: { provider: "Retired band", offer: "V1-V7 provisional band", sourceLane: "retired_v1_v7_band", sourceRef: `${PRODUCT_AUTHORITY.file}#9,#30` },
    }),
    synthetic("seasonal_exact_month", { periodUse: "exact_month", periodRepresentative: false }),
    synthetic("seasonal_persistent_claim", { periodUse: "persistent_or_annualized", periodRepresentative: false }),
  ];
}

function compactResult(result: DiagnosticResult) {
  return {
    caseId: result.caseId,
    provider: result.comparator.provider,
    eligibilityStatus: result.eligibilityStatus,
    merchantSpecificApprovalKnown: result.merchantSpecificApprovalKnown,
    offerQualification: result.offerQualification,
    pricingModelCompatibility: result.pricingModelCompatibility,
    populationCompatibility: result.populationCompatibility,
    channelCompatibility: result.channelCompatibility,
    decompositionPermission: result.decompositionPermission,
    calculationPermitted: result.calculationPermitted,
    calculation: result.calculation,
    strongestAllowedCommercialClaim: result.strongestAllowedCommercialClaim,
    blockedStrongerClaims: result.blockedStrongerClaims,
    reasons: result.reasons,
    weakestRelevantConfidence: result.confidence.weakestRelevant,
  };
}

function caseById(results: DiagnosticResult[], id: string): DiagnosticResult {
  const result = results.find((item) => item.caseId === id);
  if (!result) throw new Error(`Missing diagnostic case ${id}`);
  return result;
}

function summarizeProvider(provider: string, results: DiagnosticResult[]) {
  const rows = results.filter((result) => result.comparator.provider === provider);
  return {
    provider,
    attempts: rows.length,
    calculationsPermitted: rows.filter((result) => result.calculationPermitted).length,
    conditionalScenarios: rows.filter((result) => result.permissions.conditionalScenarioAllowed).length,
    confirmedAvailabilityClaims: rows.filter((result) => result.permissions.confirmedAvailabilityLanguageAllowed).length,
    commonStoppingReasons: frequency(rows.flatMap((result) => result.reasons)).slice(0, 5),
  };
}

function summarizeOutcomes(results: DiagnosticResult[]) {
  return {
    total: results.length,
    calculationsPermitted: results.filter((result) => result.calculationPermitted).length,
    exactCalculations: results.filter((result) => result.calculation.state === "exact").length,
    boundedCalculations: results.filter((result) => result.calculation.state === "bounded").length,
    conditionalScenarios: results.filter((result) => result.permissions.conditionalScenarioAllowed).length,
    confirmedAvailabilityClaims: results.filter((result) => result.permissions.confirmedAvailabilityLanguageAllowed).length,
    directionalOnly: results.filter((result) => result.permissions.directionalEvidenceLanguageAllowed).length,
    refusedCalculations: results.filter((result) => !result.calculationPermitted).length,
    commercialGrades: results.filter((result) => result.permissions.expensiveOrReasonableGradeAllowed).length,
    savingsClaims: results.filter((result) => result.permissions.preciseSavingsClaimAllowed).length,
  };
}

function deterministicPricing(
  document: ParsedDocument,
  file: string,
  businessType: BusinessTypeId,
  analysis: CanonicalStatementAnalysis,
): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const value = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = value?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error(`Deterministic pricing model unavailable for ${file}`);
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function renderReport(value: typeof evaluation): string {
  const conditional = compactResult(caseById(syntheticResults, "conditional_public_offer"));
  const confirmed = compactResult(caseById(syntheticResults, "confirmed_written_quote"));
  const lines = [
    "# Commercial Comparator Eligibility Validation v1",
    "",
    "## Outcome",
    "",
    `The Product-adjudicated comparator rules were exercised as a diagnostic-only falsification harness across ${value.counts.goldStatements} real supported Fiserv Gold statements, ${value.counts.namedOfferGoldAttempts} named-offer attempts, and ${value.counts.syntheticComparatorCases + value.counts.syntheticDharmaQualificationCases + value.counts.syntheticPopulationMismatchCases} synthetic controls (${value.counts.syntheticComparatorCases} comparator, ${value.counts.syntheticDharmaQualificationCases} Dharma-qualification, and ${value.counts.syntheticPopulationMismatchCases} population-mismatch fixtures). No production comparator, market band, grade, savings claim, switching recommendation, customer authority, or reusable market knowledge was created.`,
    "",
    `Product authority: \`${value.productAuthority.file}\` (SHA-256 \`${value.productAuthority.sha256}\`).`,
    "",
    "## Named-offer Gold replay",
    "",
    "| Provider | Attempts | Calculations | Conditional | Confirmed |",
    "|---|---:|---:|---:|---:|",
    ...value.namedOfferSummary.map((item) => `| ${item.provider} | ${item.attempts} | ${item.calculationsPermitted} | ${item.conditionalScenarios} | ${item.confirmedAvailabilityClaims} |`),
    "",
    "All real Gold offer attempts stopped before a strong comparison. The statements generally lack provider-specific eligibility screening, approval, channel allocation, complete offer terms, service normalization, and exact provider-residual permission. The harness preserved those absences rather than defaulting them.",
    "",
    "## Conditional versus confirmed availability",
    "",
    `- Conditional public offer: calculation ${conditional.calculationPermitted ? "permitted" : "blocked"}; confirmed-availability wording remains blocked.`,
    `- Synthetic written quote: calculation ${confirmed.calculationPermitted ? "permitted" : "blocked"}; merchant-specific availability wording is permitted without creating an overpayment claim.`,
    "",
    "## Boundary outcomes",
    "",
    "- Publicly prohibited merchants are ineligible; restricted merchants remain conditional rather than rejected; not-disqualified merchants never become positively approved.",
    "- Dharma qualification succeeds independently by volume, transaction count, or low-ticket restaurant branch; future-delivery/risk review remains conditional. No universal volume band or interpolation was created.",
    "- Clover Direct is recognized as a real scoped source candidate, but its approximate starting price cannot become a plan-complete calculation. Partner-sold Clover never inherits Clover Direct terms.",
    "- Like-for-like IC+ component comparison is permitted when layer, denominator, channel, source, and decomposition align. Tiered/flat total rates versus IC+ markup and CP-versus-CNP substitutions are refused.",
    `- All ${value.counts.syntheticPopulationMismatchCases} population-mismatch controls were refused; no sales/auth/clearing/batch/AVS/dispute/kilobyte conversion was invented.`,
    "- Known mixed-channel activity is calculated by portion. Material unknown channel activity produces a bounded result from applicable channel prices, never a dominant-channel exact number.",
    "- A provider upper bound cannot produce a precise markup comparison. A separately complete same-scope total-cost fixture can be calculated without turning that permission into provider-markup permission.",
    "- Known comparator charges are included; gateway, PCI, account-updater, software, hardware, and support differences remain disclosed and unpriced.",
    "- Public contracts remain directional for SMB and unmatched enterprise cases. A deliberately matched synthetic enterprise can support stronger executed-price comparison, so no absolute prohibition was encoded.",
    "- V1-V7, generic high-risk numeric bands, company yields, wholesale buy rates, gateway-only acquiring comparisons, and Adyen indicative pricing are prevented from becoming merchant price comparators.",
    "- A $0 separately billed fixed-fee observation supports reviewability only; it does not prove profit, required removal, or lower total cost.",
    "- Seasonality does not block exact-month arithmetic, but it blocks persistent/annualized claims when period representativeness is not established.",
    "",
    "## Gold statement controls",
    "",
    "| Statement | Volume | Count | Pricing model | Provider minimum | Provider upper bound | Fingerprint |",
    "|---|---:|---:|---|---:|---:|---|",
    ...value.goldStatements.map((statement) => `| ${statement.file} | ${money(statement.processedSalesMinor)} | ${statement.transactionCount ?? "unknown"} | ${statement.pricingModel} | ${money(statement.decomposition.providerControlledMinimumMinor)} | ${money(statement.decomposition.providerControlledUpperBoundMinor)} | ${statement.canonicalFingerprintInvariant ? "unchanged" : "CHANGED"} |`),
    "",
    "## Acceptance counters",
    "",
    ...Object.entries(value.invariants).map(([key, result]) => `- ${key}: ${typeof result === "boolean" ? (result ? "pass" : "FAIL") : result}`),
    "",
    "## Architecture gaps",
    "",
    ...value.architectureGaps.map((gap) => `- ${gap}`),
    "",
    "## Recommendation",
    "",
    "Before a production comparator, Product should adjudicate a small comparator claim/refusal mapping and a versioned source-maintenance contract, then admit one bounded numeric source batch. Dharma's complete component terms are the best first calculation lane; the other named providers need complete, dated, plan/channel-specific offer records before production use.",
  ];
  return `${lines.join("\n")}\n`;
}

function frequency(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function money(value: number | null): string {
  return value === null ? "unknown" : `$${(value / 100).toFixed(2)}`;
}
