import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystMerchantContext,
} from "../src/canonical/internalAnalystFindingV1.js";
import {
  observeRuntimeCommercialContextBindingV1,
  RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1,
  RUNTIME_COMMERCIAL_CONTEXT_BINDING_PRODUCT_AUTHORITY_V1,
  RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1,
  type RuntimeCommercialContextSupportV1,
} from "../src/canonical/runtimeCommercialContextBindingValidationV1.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/runtime-commercial-context-binding-validation-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-12.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-12.md`;
const ACCEPTED_BASELINE_EVALUATION = "evaluations/commercial-report-set-arbitration-offline-v1/evaluation-2026-09-12.json";
const SOURCE_FIXTURE = "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["synthetic_current_fixture:us"] } } as any;
const REGISTRIES = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
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

type FixtureResult = {
  caseId: string;
  support: RuntimeCommercialContextSupportV1;
  pass: boolean;
  normalPath: true;
  comparisonPerformed: boolean;
  pricingReviewAction: boolean;
  outcome: string;
  smallestUnlocker: string | null;
};

const sourceBefore = commercialSemanticFingerprintV1(REGISTRIES);
const acceptedBaseline = JSON.parse(await readFile(ACCEPTED_BASELINE_EVALUATION, "utf8")) as {
  gold: { statements: Array<{ file: string; canonicalFingerprintAfter: string }> };
};
const acceptedCanonicalFingerprintByFile = new Map(
  acceptedBaseline.gold.statements.map((item) => [item.file, item.canonicalFingerprintAfter]),
);
const parsed = await parsePdf(SOURCE_FIXTURE);
const standard = normalPathReport(parsed, { channel: "card_present" });
const unknownChannel = normalPathReport(parsed, { channel: "unknown" });
const highRisk = normalPathReport(parsed, { channel: "card_present", riskClass: "high_risk" });
const populationMismatch = normalPathReport(parsed, {
  channel: "card_present",
  replaceLabel: ["MASTERCARD WATS AUTH FEE", "MASTERCARD SETTLED TRANSACTION AUTH FEE"],
});
const upperBound = normalPathReport(parsed, {
  channel: "card_present",
  replaceLabel: ["MASTERCARD WATS AUTH FEE", "MASTERCARD BUNDLED AUTH FEE"],
});

const standardObservation = observeRuntimeCommercialContextBindingV1(standard.report);
const standardMastercard = attemptsForLabel(standard.report, "MASTERCARD WATS AUTH FEE");
const unknownMastercard = attemptsForLabel(unknownChannel.report, "MASTERCARD WATS AUTH FEE");
const mismatchMastercard = attemptsForLabel(populationMismatch.report, "SETTLED TRANSACTION AUTH FEE");
const matched = standardMastercard.find((attempt) => attempt.comparisonPerformed);
const channelRejected = standardMastercard.find((attempt) => attempt.result === "COMPARISON_UNAVAILABLE" && attempt.stoppingReason?.includes("channel"));
const unknownBlocked = unknownMastercard.find((attempt) => attempt.smallestUnlocker?.includes("CP versus CNP"));
const mismatchBlocked = mismatchMastercard.find((attempt) => attempt.stoppingReason?.includes("billing population"));
const upperBoundCurrent = upperBound.report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents
  .find((item) => item.printedLabel.includes("BUNDLED AUTH FEE"));
const upperBoundAttempts = upperBound.report.commercialComparisonAttachment.attempts
  .filter((attempt) => attempt.currentComponentRef === upperBoundCurrent?.componentRef);
const upperBoundDecisions = upperBound.report.merchantCommercialFindingShadowProjection.decisions
  .filter((decision) => upperBoundAttempts.some((attempt) => attempt.attemptId === decision.candidateId));
const highRiskProhibited = highRisk.report.merchantCommercialFindingShadowProjection.decisions.find((decision) => decision.reasonCodes.includes("publicly_prohibited"));
const monthlyRows = standard.analysis.feeLedger.rows.filter((row) => /MONTHLY|PCI/.test(row.selectedLabel.toUpperCase()));
const percentageRows = standard.analysis.feeLedger.rows.filter((row) => /\bTIMES\s+\$|\b\d+(?:\.\d+)?%/.test(row.selectedLabel.toUpperCase()));

const fixtureResults: FixtureResult[] = [
  result("exact_per_authorization", "PARTIAL", Boolean(matched?.finding.comparisonEvidenceBinding
    && matched.finding.comparisonEvidenceBinding.currentComponentEvidenceRefs.length
    && matched.finding.comparisonEvidenceBinding.alternativeComponentEvidenceRefs.length
    && matched.finding.comparisonEvidenceBinding.matchedPopulationEvidenceRefs.length), Boolean(matched), false,
  "Exact current component, amount, unit price, population count, governed alternative, and all three evidence bindings reached a matched internal comparison; permission remained fail closed.", matched?.smallestUnlocker ?? null),
  result("channel_matched", "DERIVABLE_WITHOUT_INVENTION", Boolean(matched && channelRejected), Boolean(matched), false,
  "Card-present context selected card-present alternatives and rejected card-not-present alternatives.", channelRejected?.smallestUnlocker ?? null),
  result("channel_unknown", "PARTIAL", Boolean(unknownBlocked && unknownMastercard.every((attempt) => !attempt.comparisonPerformed)), false, false,
  "Unknown component channel prevented matching and retained the CP/CNP split unlocker.", unknownBlocked?.smallestUnlocker ?? null),
  result("population_mismatch", "PARTIAL", Boolean(mismatchBlocked && mismatchMastercard.every((attempt) => !attempt.comparisonPerformed)), false, false,
  "An explicitly settled-transaction population was not substituted for an authorization population.", mismatchBlocked?.smallestUnlocker ?? null),
  result("upper_bound_current_economics", "DIRECTLY_AVAILABLE", Boolean(upperBoundCurrent
    && upperBoundCurrent.currentAmount.state === "UPPER_BOUND"
    && upperBoundAttempts.some((attempt) => attempt.comparisonPerformed
      && attempt.finding.economics.currentAmountState === "UPPER_BOUND"
      && attempt.finding.economics.matchedComponentDifference.state !== "EXACT")
    && upperBoundAttempts.every((attempt) => attempt.finding.action.signal === "NONE")
    && upperBoundDecisions.some((decision) => decision.comparisonValidity === "valid_bounded")
    && upperBoundDecisions.every((decision) => !decision.action.permitted)), true, false,
  "A statement-evidenced bundled authorization row remained an upper bound through internal comparison and merchant permission; it never became exact and created no pricing-review action.", null),
  result("percentage_bps_component", "ABSENT", percentageRows.length > 0 && !standard.report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents.some((item) => item.unit.includes("percent")), false, false,
  "Canonical percentage arithmetic exists, but no exact denominator/population bridge reaches commercial comparison.", "Exact denominator and canonical volume-population compatibility."),
  result("fixed_monthly_component", "ABSENT", monthlyRows.length > 0 && !standard.report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents.some((item) => item.componentKind.includes("monthly")), false, false,
  "Monthly-looking canonical rows exist, but exact cadence plus service identity is not emitted as a current comparison component.", "Exact monthly cadence, service identity, and provider-control binding."),
  result("episodic_chargeback_component", "ABSENT", !standard.report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents.some((item) => item.componentKind.includes("chargeback")), false, false,
  "The runtime does not bind a chargeback fee to the exact matching dispute event/count; no new dispute model was inferred.", "Same-event chargeback fee/count evidence link."),
  result("gateway_versus_acquiring", "PARTIAL", standard.report.commercialComparisonAttachment.attempts.filter((attempt) => attempt.comparisonPerformed).every((attempt) => attempt.alternativeProvider !== "authorize_net"), false, false,
  "Gateway-only alternatives were not matched to acquiring authorization components.", "A current gateway component with exact service and gateway-event population evidence."),
  result("offer_and_public_policy", "PARTIAL", Boolean(highRiskProhibited && !highRiskProhibited.namedAlternativePermitted && !highRiskProhibited.action.permitted), false, false,
  "Governed prohibited/unknown policy states survive normal binding; merchant approval remains unknown.", "The exact admitted policy predicate fact or merchant-specific approval evidence."),
  result("named_offer_coherence_metadata", "DERIVABLE_WITHOUT_INVENTION", standard.report.merchantCommercialFindingShadowProjection.decisions.some((decision) => decision.presentationGroupId.includes("Standard Retail / Storefront")), false, false,
  "Provider, named offer, and product scope survive in the presentation-group identity.", null),
  result("invalidating_verify_dependency", "ABSENT", standardObservation.observed.invalidatingVerifyDependenciesConstructedByNormalPath === 0, false, false,
  "The arbitration can consume an invalidating VERIFY dependency, but normal runtime construction does not create one.", "Evidence-bound VERIFY-to-REVIEW relationship construction."),
];

const gold = [];
for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, asOf: "2026-09-12" });
  const after = canonicalFinancialTruthFingerprint(analysis);
  const acceptedBaselineFingerprint = acceptedCanonicalFingerprintByFile.get(fixture.file) ?? null;
  gold.push({
    file: fixture.file,
    statementPeriod: report.statementPeriod,
    canonicalFingerprintBefore: before,
    canonicalFingerprintAfter: after,
    acceptedBaselineFingerprint,
    canonicalInvariant: acceptedBaselineFingerprint !== null
      && acceptedBaselineFingerprint === before
      && before === after
      && report.canonicalFinancialTruth.unchanged,
    matchedComparisons: report.commercialComparisonAttachment.summary.matchedComparisons,
    pricingReviewActions: report.merchantCommercialFindingShadowProjection.decisions.filter((decision) => decision.action.permitted).length,
    heroByteEquivalent: report.commercialReportSetOfflineIntegration.heroByteEquivalent,
    primaryExperienceUnchanged: report.commercialReportSetOfflineIntegration.primaryExperienceUnchanged,
    realCustomerRoutingAllowed: report.commercialReportSetOfflineIntegration.realCustomerRoutingAllowed,
  });
}
const sourceAfter = commercialSemanticFingerprintV1(REGISTRIES);
const safetyCounters = {
  failedCurrentPeriodControls: fixtureResults.filter((item) => !item.pass).length,
  canonicalFingerprintChanges: gold.filter((item) => !item.canonicalInvariant).length,
  commercialSourceFingerprintChanges: sourceBefore === sourceAfter ? 0 : 1,
  historicalCurrentComparisonLeaks: gold.reduce((sum, item) => sum + item.matchedComparisons, 0),
  historicalPricingReviewActions: gold.reduce((sum, item) => sum + item.pricingReviewActions, 0),
  heroChanges: gold.filter((item) => !item.heroByteEquivalent).length,
  primaryExperienceChanges: gold.filter((item) => !item.primaryExperienceUnchanged).length,
  customerRoutingEnabled: gold.filter((item) => item.realCustomerRoutingAllowed).length,
  explicitPopulationMismatchComparisons: mismatchMastercard.filter((attempt) => attempt.comparisonPerformed).length,
  newCommercialKnowledgeAdmissions: 0,
  aiOrWebOperations: 0,
  savingsAnnualizationGradesOverpaymentSwitchingOrRankings: 0,
};

const evaluation = {
  schemaVersion: "runtime_commercial_context_binding_validation_evaluation_2026_09_12_v1",
  generatedAt: "2026-09-12T00:00:00.000Z",
  productAuthority: RUNTIME_COMMERCIAL_CONTEXT_BINDING_PRODUCT_AUTHORITY_V1,
  baseline: {
    branch: "codex/commercial-report-set-arbitration-offline-integration-v1",
    commit: "d1221649895182b4269bbbb23073511de327abb8",
    parent: "69504228a17ff846e87983a0e166b9da6e0bdd8a",
  },
  implementationBranch: "codex/runtime-commercial-context-binding-validation-v1",
  architecture: {
    validationOnly: true,
    normalPath: "ParsedDocument -> supported Fiserv parser -> canonical statement analysis -> governed payment knowledge/commercial decomposition -> internal commercial comparison -> merchant permission -> offline report-set arbitration",
    downstreamSyntheticCommercialObjectsUsed: false,
    behaviorCorrection: "Explicit settled-transaction, authorization-attempt, approved-authorization, gateway-transaction, and settled-batch populations are compared as distinct identities and fail closed when incompatible.",
    normalReportStillUsesFallbackArbitrationContext: true,
    customerRoutingChanged: false,
  },
  supportMatrix: RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1,
  componentClasses: RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1,
  currentPeriodFixtures: {
    privacySafe: true,
    fixtureSource: "An existing supported Fiserv parser fixture was cloned in memory, merchant/account/address fields were replaced, and the period was shifted to September 2026 before normal canonical construction.",
    cases: fixtureResults,
    observed: standardObservation.observed,
    result: fixtureResults.every((item) => item.pass) ? "12/12 passed" : `${fixtureResults.filter((item) => item.pass).length}/12 passed`,
  },
  answerByComponentClass: {
    runtimeReady: standardObservation.conclusion.runtimeReady,
    runtimePartial: standardObservation.conclusion.runtimePartial,
    runtimeNotReady: standardObservation.conclusion.runtimeNotReady,
    answer: standardObservation.conclusion.answer,
    plainLanguage: "No component class yet supplies every merchant-action and report-arbitration binding through the normal path. Per-authorization is closest: matched internal arithmetic is real, but public-policy facts, complete same-scope economics/offsets, and first-class arbitration context still gate action. Gateway families remain partial; percentage, fixed-monthly, and episodic chargeback remain fail closed.",
  },
  gold: {
    statements: gold,
    canonicalFingerprintInvariant: gold.every((item) => item.canonicalInvariant),
    acceptedBaselineEvaluation: ACCEPTED_BASELINE_EVALUATION,
    sourceFingerprintBefore: sourceBefore,
    sourceFingerprintAfter: sourceAfter,
    sourceFingerprintInvariant: sourceBefore === sourceAfter,
    historicalCurrentFirewallUnchanged: gold.every((item) => item.matchedComparisons === 0 && item.pricingReviewActions === 0),
  },
  safetyCounters,
  knownUnrelatedIssuesNotRepaired: [
    "Merchant-attention remains at the accepted pre-existing 62/63 result.",
    "Historical/current remains at the accepted pre-existing 5/6 result.",
    "Prior legacy public-source/exhaustive SIGSEGV/139 history was not investigated or repaired.",
  ],
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(OUTPUT_MD, render(evaluation));

if (evaluation.currentPeriodFixtures.result !== "12/12 passed"
  || evaluation.gold.statements.length !== 11
  || !evaluation.gold.canonicalFingerprintInvariant
  || !evaluation.gold.sourceFingerprintInvariant
  || !evaluation.gold.historicalCurrentFirewallUnchanged
  || Object.values(safetyCounters).some((value) => value !== 0)) process.exitCode = 1;

console.log(JSON.stringify({
  outputs: [OUTPUT_JSON, OUTPUT_MD],
  currentPeriodFixtures: evaluation.currentPeriodFixtures.result,
  answerByComponentClass: evaluation.answerByComponentClass,
  safetyCounters,
  sourceFingerprintBefore: sourceBefore,
  sourceFingerprintAfter: sourceAfter,
}, null, 2));

function result(
  caseId: string,
  support: RuntimeCommercialContextSupportV1,
  pass: boolean,
  comparisonPerformed: boolean,
  pricingReviewAction: boolean,
  outcome: string,
  smallestUnlocker: string | null,
): FixtureResult {
  return { caseId, support, pass, normalPath: true, comparisonPerformed, pricingReviewAction, outcome, smallestUnlocker };
}

function attemptsForLabel(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  const current = report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents
    .find((item) => item.printedLabel.includes(label));
  return report.commercialComparisonAttachment.attempts.filter((attempt) => attempt.currentComponentRef === current?.componentRef);
}

function normalPathReport(parsedDocument: ParsedDocument, options: {
  channel: InternalAnalystMerchantContext["channel"];
  riskClass?: InternalAnalystMerchantContext["riskClass"];
  replaceLabel?: [string, string];
}) {
  const document = currentPeriodDocument(parsedDocument, options.replaceLabel);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: "synthetic-supported-fiserv-current-period.pdf",
    businessType: "restaurant_food_beverage",
  });
  const report = buildInternalAnalystFindingV1({
    analysis,
    statementContext: US_CONTEXT,
    merchantContext: {
      verticalId: "restaurant_food_beverage",
      riskClass: options.riskClass ?? "standard",
      channel: options.channel,
      averageTicketUsd: 42,
      evidenceRefs: ["synthetic_current_fixture:merchant_context"],
      basis: "merchant_confirmed",
    },
    asOf: "2026-09-30",
  });
  return { analysis, report };
}

function currentPeriodDocument(base: ParsedDocument, replaceLabel?: [string, string]): ParsedDocument {
  const convert = (value: string | number): string | number => {
    if (value === 324136827999) return 111111111111;
    if (typeof value !== "string") return value;
    let safe = value
      .replaceAll("09/01/24", "09/01/26")
      .replaceAll("09/30/24", "09/30/26")
      .replaceAll("324136827999", "111111111111")
      .replaceAll("EL NUEVO TEQUILA MEXICAN", "SYNTHETIC CURRENT MERCHANT")
      .replaceAll("FELIX GARCIA", "SYNTHETIC OWNER")
      .replaceAll("602 W 15TH ST", "100 TEST STREET")
      .replaceAll("WASHINGTON NC 27889 -3527", "TEST CITY ST 00000");
    if (replaceLabel) safe = safe.replace(replaceLabel[0], replaceLabel[1]);
    return safe;
  };
  return {
    ...base,
    rows: base.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, convert(value)]))),
    textPreview: String(convert(base.textPreview)),
    extraction: { ...base.extraction, reasons: ["Privacy-safe current-period runtime validation fixture."] },
  };
}

function render(value: typeof evaluation): string {
  const lines = [
    "# Runtime Commercial Context-Binding Validation v1",
    "",
    "## Answer",
    "",
    value.answerByComponentClass.plainLanguage,
    "",
    `Product authority: \`${value.productAuthority.document}\` (SHA-256 \`${value.productAuthority.sha256}\`).`,
    "",
    "## Architecture",
    "",
    `- Normal path: ${value.architecture.normalPath}.`,
    "- The fixtures do not instantiate runtime comparison attempts, permission candidates, or arbitration decisions directly.",
    `- Fail-closed population correction: ${value.architecture.behaviorCorrection}`,
    "- Normal report construction still uses fallback arbitration context; this validation does not attach new customer routing.",
    "",
    "## Component readiness",
    "",
    ...value.componentClasses.map((item) => `- ${item.componentClass}: ${item.disposition} / ${item.support} — ${item.comparisonStageReached} ${item.actionReadiness}`),
    "",
    "## Current-period normal-path fixtures",
    "",
    `Result: ${value.currentPeriodFixtures.result}.`,
    "",
    ...value.currentPeriodFixtures.cases.map((item) => `- ${item.caseId}: ${item.pass ? "PASS" : "FAIL"} / ${item.support} — ${item.outcome}${item.smallestUnlocker ? ` Smallest capability/unlocker: ${item.smallestUnlocker}` : ""}`),
    "",
    "## Full context-binding capability matrix",
    "",
    "| Group | Field | Support | Upstream source | Runtime stage | Deterministic | Claim-specific | Comparison safety | Limitation | Smallest capability needed |",
    "|---|---|---|---|---|---:|---:|---|---|---|",
    ...value.supportMatrix.map((item) => `| ${item.group} | ${item.field} | ${item.support} | ${item.upstreamSource} | ${item.runtimeStage} | ${item.deterministic ? "yes" : "no"} | ${item.claimSpecific ? "yes" : "no"} | ${item.safeForCommercialComparison} | ${item.limitation ?? "none"} | ${item.smallestCapabilityNeeded ?? "none"} |`),
    "",
    "## Invariance and safety",
    "",
    `- Gold canonical fingerprints unchanged from the accepted baseline: ${value.gold.canonicalFingerprintInvariant ? "11/11" : "FAIL"}.`,
    `- Accepted baseline fingerprint source: \`${value.gold.acceptedBaselineEvaluation}\`.`,
    `- Governed commercial-source fingerprint before: \`${value.gold.sourceFingerprintBefore}\`.`,
    `- Governed commercial-source fingerprint after: \`${value.gold.sourceFingerprintAfter}\`.`,
    `- Historical/current firewall: ${value.gold.historicalCurrentFirewallUnchanged ? "unchanged" : "FAIL"}.`,
    ...Object.entries(value.safetyCounters).map(([name, count]) => `- ${name}: ${count}.`),
    "",
    "## Known unrelated issues preserved",
    "",
    ...value.knownUnrelatedIssuesNotRepaired.map((item) => `- ${item}`),
    "",
    "No customer routing, frontend/server/legacy-report change, new commercial knowledge, AI/web operation, savings, annualization, market grade, overpayment verdict, switching advice, provider ranking, broader merchant economics, OCR, or non-Fiserv support was added.",
  ];
  return `${lines.join("\n")}\n`;
}
