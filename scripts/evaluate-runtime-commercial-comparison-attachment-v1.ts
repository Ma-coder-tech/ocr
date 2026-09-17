import { mkdir, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import type { CommercialSourceGovernanceRegistryV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import {
  evaluateRuntimeCommercialComparisonFactsV1,
  RUNTIME_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V1,
  type RuntimeCommercialMerchantFactsV1,
  type RuntimeCurrentCommercialComponentV1,
} from "../src/canonical/runtimeCommercialComparisonAttachmentV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/runtime-commercial-comparison-attachment-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-11.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-11.md`;
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

const gold = [];
const goldRuntimeAttempts: ReturnType<typeof evaluateRuntimeCommercialComparisonFactsV1>["attempts"] = [];
for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, asOf: "2026-09-11" });
  const after = canonicalFinancialTruthFingerprint(analysis);
  const attachment = report.commercialComparisonAttachment;
  goldRuntimeAttempts.push(...attachment.attempts);
  gold.push({
    file: fixture.file,
    statementPeriod: attachment.statement.statementPeriod,
    processor: attachment.statement.processorName,
    channel: attachment.deterministicBaseline.merchantChannel,
    feeRowsEvaluated: attachment.deterministicBaseline.feeRowsEvaluated,
    pricingModel: attachment.deterministicBaseline.pricingModel,
    commercialEconomics: attachment.deterministicBaseline.commercialEconomics,
    establishedCurrentComponents: attachment.deterministicBaseline.currentProviderControlledComponents.map((component) => ({
      feeRowId: component.feeRowId,
      printedLabel: component.printedLabel,
      componentKind: component.componentKind,
      channel: component.channel,
      populationCount: component.populationCount,
      currentUnitPriceMinor: component.currentUnitPriceMinor,
      amountState: component.currentAmount.state,
    })),
    summary: attachment.summary,
    attempts: attachment.attempts.map((attempt) => ({
      alternativeProvider: attempt.alternativeProvider,
      alternativeOffer: attempt.alternativeOffer,
      alternativeComponentRef: attempt.alternativeComponentRef,
      result: attempt.result,
      comparisonPerformed: attempt.comparisonPerformed,
      action: attempt.finding.action.signal,
      stoppingReason: attempt.stoppingReason,
      smallestUnlocker: attempt.smallestUnlocker,
    })),
    canonicalFingerprintBefore: before,
    canonicalFingerprintAfter: after,
    canonicalFingerprintInvariant: before === after && report.canonicalFinancialTruth.unchanged,
  });
}

const runtimeControls = evaluateRuntimeControls();
const allGoldAttempts = gold.flatMap((statement) => statement.attempts);
const allControlAttempts = Object.values(runtimeControls).flatMap((control) => control.attempts);
const allAttempts = [...goldRuntimeAttempts, ...allControlAttempts];
const prohibitedCounters = {
  canonicalFingerprintChanges: gold.filter((statement) => !statement.canonicalFingerprintInvariant).length,
  historicalCurrentOnlyComparisons: gold.flatMap((statement) => statement.attempts.map((attempt) => ({ statement, attempt })))
    .filter(({ statement, attempt }) => statement.statementPeriod.end < "2026-09-10" && attempt.comparisonPerformed).length,
  nonComparisonReviewSignals: allAttempts.filter((attempt) => !attempt.comparisonPerformed && attempt.finding.action.signal === "REVIEW_CURRENT_PRICING").length,
  blockedArithmetic: allAttempts.filter((attempt) => attempt.result === "COMPARISON_UNAVAILABLE" && attempt.finding.economics.matchedComponentDifference.state !== "NOT_ESTABLISHED").length,
  qualificationArithmetic: allAttempts.filter((attempt) => attempt.result === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE" && attempt.finding.economics.matchedComponentDifference.state !== "NOT_ESTABLISHED").length,
  commercialFactArithmetic: allAttempts.filter((attempt) => attempt.result === "COMMERCIAL_FACT_IDENTITY_EVIDENCE" && attempt.finding.economics.matchedComponentDifference.state !== "NOT_ESTABLISHED").length,
  customerRenderingEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.customerRenderingAllowed).length,
  marketVerdictsEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.aboveOrBelowMarketVerdictAllowed || attempt.finding.permissions.expensiveOrCheapLanguageAllowed).length,
  gradesEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.processorOrOverallGradeAllowed).length,
  overpaymentVerdictsEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.overpaymentVerdictAllowed).length,
  savingsOrAnnualizationEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.savingsClaimAllowed || attempt.finding.permissions.annualSavingsProjectionAllowed).length,
  switchingOrRankingEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.switchingRecommendationAllowed || attempt.finding.permissions.bestProviderRankingAllowed).length,
  canonicalMutationEnabled: allAttempts.filter((attempt) => attempt.finding.permissions.canonicalMutationAllowed).length,
};

const evaluation = {
  schemaVersion: "runtime_commercial_comparison_attachment_evaluation_2026_09_11_v1",
  generatedAt: "2026-09-11T00:00:00.000Z",
  productAuthority: RUNTIME_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V1,
  baseline: {
    branch: "codex/internal-commercial-comparison-finding-v1",
    acceptedCommit: "902ce92c30fcab175b1abc86225f1794205e2b41",
    acceptedParent: "beb2cfbb1bd45a179b3aad0d0cc169105796519e",
    originalMilestoneParent: "eb0cf65577aaeeac7cc67b2ff4f535286d316842",
  },
  implementationBranch: "codex/runtime-commercial-comparison-attachment-v1",
  scope: {
    internalOnly: true,
    customerOutputAdded: false,
    marketJudgmentAdded: false,
    gradesAdded: false,
    savingsOrAnnualizationAdded: false,
    switchingOrRankingAdded: false,
    aiOrWebResearchUsed: false,
    newCommercialKnowledgeAdmitted: false,
  },
  goldCorpus: {
    statements: gold.length,
    canonicalFingerprintInvariant: gold.every((statement) => statement.canonicalFingerprintInvariant),
    matchedComparisons: allGoldAttempts.filter((attempt) => attempt.comparisonPerformed).length,
    historicalCurrentOnlyComparisons: prohibitedCounters.historicalCurrentOnlyComparisons,
    qualificationEvidenceOnly: allGoldAttempts.filter((attempt) => attempt.result === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE").length,
    commercialFactsOnly: allGoldAttempts.filter((attempt) => attempt.result === "COMMERCIAL_FACT_IDENTITY_EVIDENCE").length,
    blockedComparisons: allGoldAttempts.filter((attempt) => attempt.result === "COMPARISON_UNAVAILABLE").length,
    statementsWithoutEstablishedComparableCurrentComponent: gold.filter((statement) => statement.establishedCurrentComponents.length === 0).length,
    results: gold,
  },
  requiredRuntimeControls: summarizeControls(runtimeControls),
  prohibitedCounters,
  knownUnrelatedIssuesNotRepaired: [
    "Historical/current regression remains 5/6 because the pre-existing assertion expects zero governed conflicts but observes four.",
    "Prior legacy public-source/exhaustive SIGSEGV/139 history was not investigated or repaired.",
  ],
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(OUTPUT_MD, renderReport(evaluation));

if (!evaluation.goldCorpus.canonicalFingerprintInvariant
  || evaluation.goldCorpus.statements !== 11
  || Object.values(prohibitedCounters).some((count) => count !== 0)
  || !Object.values(evaluation.requiredRuntimeControls).every((control) => control.pass)) {
  process.exitCode = 1;
}
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], goldCorpus: evaluation.goldCorpus, requiredRuntimeControls: evaluation.requiredRuntimeControls, prohibitedCounters }, null, 2));

function evaluateRuntimeControls() {
  const statement = { statementRef: "supported_fiserv_runtime_control", processorName: "Wells Fargo / Fiserv family", processorFamily: "fiserv_first_data", statementPeriod: { start: "2026-09-10", end: "2026-09-30" }, processedSalesMinor: 12_000_000, businessType: "restaurant_food_beverage" };
  const facts: RuntimeCommercialMerchantFactsV1 = { facts: { monthly_volume_minor: 12_000_000, transaction_count: 6_000, average_ticket_minor: 2_000, merchant_type: "restaurant", channel: "card_present", known_high_risk: false }, channel: "card_present", evidenceRefsByFact: { monthly_volume_minor: ["statement:processed_sales"], transaction_count: ["statement:transaction_count"], average_ticket_minor: ["statement:average_ticket"], merchant_type: ["statement:business_type"], channel: ["statement:channel"] }, unresolvedFacts: ["three_month_rolling_card_volume_minor"] };
  const retail = onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "Standard Retail / Storefront");
  return {
    exactMatched: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [authorizationComponent()], merchantFacts: facts }),
    qualifiesNoCurrentMatch: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [], merchantFacts: facts, registries: [onlyOffer(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, "High Volume")] }),
    channelMismatch: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [authorizationComponent({ channel: "card_not_present" })], merchantFacts: { ...facts, channel: "card_not_present", facts: { ...facts.facts, channel: "card_not_present" } }, registries: [retail] }),
    mixedPopulation: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [authorizationComponent({ channel: "mixed" })], merchantFacts: { ...facts, channel: "mixed", facts: { ...facts.facts, channel: "mixed" } }, registries: [retail] }),
    upperBound: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [authorizationComponent({ currentAmount: { state: "UPPER_BOUND", amountMinor: 66_000 } })], merchantFacts: facts, registries: [retail] }),
    historicalCurrentOnly: evaluateRuntimeCommercialComparisonFactsV1({ statement: { ...statement, statementPeriod: { start: "2024-09-01", end: "2024-09-30" } }, currentComponents: [authorizationComponent()], merchantFacts: facts, registries: [retail] }),
    gatewayOnly: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [authorizationComponent({ componentKind: "gateway_transaction_fee", unit: "per_gateway_transaction", channel: "gateway", cardBrandScope: "unknown", populationLabel: "gateway transaction events", printedLabel: "GATEWAY TRANSACTION FEE", populationCount: 1_000, currentUnitPriceMinor: 12, currentAmount: { state: "EXACT", amountMinor: 12_000 } })], merchantFacts: facts, registries: [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1] }),
    noApplicableAlternative: evaluateRuntimeCommercialComparisonFactsV1({ statement, currentComponents: [authorizationComponent()], merchantFacts: facts, registries: [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1] }),
  };
}

function summarizeControls(controls: ReturnType<typeof evaluateRuntimeControls>) {
  const exact = controls.exactMatched.attempts.find((attempt) => attempt.comparisonPerformed);
  const qualification = controls.qualifiesNoCurrentMatch.attempts[0];
  const channel = controls.channelMismatch.attempts[0];
  const mixed = controls.mixedPopulation.attempts[0];
  const bound = controls.upperBound.attempts.find((attempt) => attempt.comparisonPerformed);
  const historical = controls.historicalCurrentOnly.attempts[0];
  const gateway = controls.gatewayOnly.attempts.find((attempt) => attempt.comparisonPerformed);
  return {
    exactMatched: { pass: Boolean(exact?.comparisonPerformed && exact.finding.comparisonEvidenceBinding && exact.finding.action.signal === "REVIEW_CURRENT_PRICING"), outcome: exact?.finding.status ?? null },
    qualifiesNoCurrentMatch: { pass: qualification?.result === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE" && qualification.finding.action.signal === "NONE", outcome: qualification?.result ?? null },
    channelMismatch: { pass: channel?.result === "COMPARISON_UNAVAILABLE" && Boolean(channel.stoppingReason?.includes("channel")), outcome: channel?.stoppingReason ?? null },
    mixedPopulation: { pass: mixed?.result === "COMPARISON_UNAVAILABLE" && Boolean(mixed.smallestUnlocker?.includes("CP versus CNP")), outcome: mixed?.smallestUnlocker ?? null },
    upperBound: { pass: bound?.finding.status === "VALID_BOUNDED_COMPONENT_COMPARISON" && bound.finding.action.signal === "NONE" && bound.finding.economics.matchedComponentDifference.currentMinusAlternativeMinor === null, outcome: bound?.finding.status ?? null },
    historicalCurrentOnly: { pass: historical?.result === "COMPARISON_UNAVAILABLE" && Boolean(historical.stoppingReason?.includes("projected backward")), outcome: historical?.stoppingReason ?? null },
    gatewayOnly: { pass: Boolean(gateway?.comparisonPerformed && gateway.finding.conclusion.whatThisDoesNotProve.includes("Treating gateway-only pricing as complete acquiring economics.")), outcome: gateway?.finding.status ?? null },
    noApplicableAlternative: { pass: controls.noApplicableAlternative.summary.result === "NO_APPLICABLE_GOVERNED_ALTERNATIVE" && controls.noApplicableAlternative.attempts.length === 0, outcome: controls.noApplicableAlternative.summary.explanation },
  };
}

function authorizationComponent(patch: Partial<RuntimeCurrentCommercialComponentV1> = {}): RuntimeCurrentCommercialComponentV1 {
  return { componentRef: "canonical_fee_component:auth", feeRowId: "auth", printedLabel: "MASTERCARD WATS AUTH FEE 6000 TRANSACTIONS AT 0.11", componentKind: "authorization_fee", channel: "card_present", cardBrandScope: "mastercard", economicLayer: "acquiring_commercial", unit: "per_authorization", populationLabel: "printed authorization events", populationCount: 6_000, currentUnitPriceMinor: 11, currentAmount: { state: "EXACT", amountMinor: 66_000 }, currentComponentEvidenceRefs: ["statement:auth_component"], populationEvidenceRefs: ["statement:auth_population"], ...patch };
}

function onlyOffer(registry: CommercialSourceGovernanceRegistryV1, offer: string): CommercialSourceGovernanceRegistryV1 {
  return { ...registry, offerCompositionVersions: registry.offerCompositionVersions.filter((composition) => composition.offerIdentity.namedOffer === offer) };
}

function renderReport(evaluation: typeof evaluation): string {
  const lines = [
    "# Runtime Commercial Comparison Attachment v1",
    "",
    "## Result",
    "",
    "The accepted internal commercial-comparison finding is now attached to normal Internal Analyst Finding v1 construction after canonical statement truth and governed payment knowledge are established. The attachment performs only claim-specific component comparisons with independent current, alternative, and population evidence.",
    "",
    `Product authority: \`${evaluation.productAuthority.document}\` (SHA-256 \`${evaluation.productAuthority.sha256}\`).`,
    "",
    "## Full supported Fiserv Gold corpus",
    "",
    `- Statements: ${evaluation.goldCorpus.statements}`,
    `- Canonical fingerprints unchanged: ${evaluation.goldCorpus.canonicalFingerprintInvariant ? "11/11" : "FAIL"}`,
    `- Historical current-only comparisons performed: ${evaluation.goldCorpus.historicalCurrentOnlyComparisons}`,
    `- Matched comparisons: ${evaluation.goldCorpus.matchedComparisons}`,
    `- Blocked comparison attempts: ${evaluation.goldCorpus.blockedComparisons}`,
    `- Statements without an established comparable current component: ${evaluation.goldCorpus.statementsWithoutEstablishedComparableCurrentComponent}`,
    "",
    "All Gold statements predate the admitted 2026 commercial observations (and Helcim's April 2026 effective period). Where exact provider-controlled authorization rows are present, they are preserved as current-side evidence, but the attachment refuses to project later alternatives backward. Zero matched Gold comparisons is therefore the correct evidence-controlled result, not a capability failure and not a no-savings conclusion.",
    "",
    "## Required runtime controls",
    "",
    ...Object.entries(evaluation.requiredRuntimeControls).map(([name, control]) => `- ${name}: ${control.pass ? "PASS" : "FAIL"} — ${control.outcome}`),
    "",
    "## Safety counters",
    "",
    ...Object.entries(evaluation.prohibitedCounters).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Boundaries",
    "",
    "- Authorize.net gateway-only components never complete acquiring economics.",
    "- Helcim per-card-transaction margin is not substituted for authorization population.",
    "- Mixed CP/CNP activity remains blocked without a split.",
    "- Upper bounds remain bounds and do not generate exact differences or automatic review signals.",
    "- Qualification and commercial-fact evidence never imply comparison performed.",
    "- No web/AI research, new pricing, market verdict, grade, savings, annualization, switching advice, ranking, or customer rendering was added.",
    "",
    "## Known unrelated issues preserved",
    "",
    ...evaluation.knownUnrelatedIssuesNotRepaired.map((issue) => `- ${issue}`),
  ];
  return `${lines.join("\n")}\n`;
}
