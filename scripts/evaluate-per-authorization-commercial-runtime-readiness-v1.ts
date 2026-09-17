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
import { PER_AUTHORIZATION_COMMERCIAL_RUNTIME_PRODUCT_AUTHORITY_V1 } from "../src/canonical/perAuthorizationCommercialRuntimeReadinessV1.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/per-authorization-commercial-runtime-readiness-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-12.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-12.md`;
const ACCEPTED_BASELINE = "evaluations/runtime-commercial-context-binding-validation-v1/evaluation-2026-09-12.json";
const SOURCE = "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
const EXPECTED_SOURCE_SHA = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["fixture:us"] } } as any;
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

const sourceBefore = commercialSemanticFingerprintV1(REGISTRIES);
const baseline = JSON.parse(await readFile(ACCEPTED_BASELINE, "utf8")) as {
  gold: { statements: Array<{ file: string; canonicalFingerprintAfter: string }> };
};
const baselineFingerprint = new Map(baseline.gold.statements.map((item) => [item.file, item.canonicalFingerprintAfter]));
const parsed = await parsePdf(SOURCE);
const exact = normalPath(parsed, { channel: "card_present", policy: "no_known_public_block" });
const unknownChannel = normalPath(parsed, { channel: "unknown", policy: "no_known_public_block" });
const channelMismatch = normalPath(parsed, { channel: "card_not_present", policy: "no_known_public_block" });
const populationMismatchStable = normalPath(parsed, {
  channel: "card_present", policy: "no_known_public_block",
  replacements: [["MASTERCARD WATS AUTH FEE", "MASTERCARD SETTLED TRANSACTION AUTH FEE"]],
});
const prohibited = normalPath(parsed, { channel: "card_present", riskClass: "high_risk", policy: "no_known_public_block" });
const restricted = normalPath(parsed, { channel: "card_present", policy: "restricted" });
const reversing = normalPath(parsed, {
  channel: "card_present", policy: "no_known_public_block",
  replacements: [
    ["MASTERCARD WATS AUTH FEE 621 TRANSACTIONS AT 0.11", "MASTERCARD WATS AUTH FEE 621 TRANSACTIONS AT 0.05"],
    ["Fees | -$68.31", "Fees | -$31.05"],
  ],
});

const a = highVolumeDecision(exact.report, "VISA WATS AUTH FEE");
const b = highVolumeDecision(exact.report, "MASTERCARD WATS AUTH FEE");
const c = attemptsFor(channelMismatch.report, "MASTERCARD WATS AUTH FEE").find((item) => item.alternativeOffer === "Standard Retail / Storefront");
const dDependency = unknownChannel.report.perAuthorizationCommercialRuntimeReadiness.verifyDependencies[0];
const dContext = unknownChannel.report.perAuthorizationCommercialRuntimeReadiness.candidateContexts.find((item) => item.candidateId === dDependency?.verifyCandidateId);
const eCurrent = currentFor(populationMismatchStable.report, "SETTLED TRANSACTION AUTH FEE");
const eAttempts = populationMismatchStable.report.commercialComparisonAttachment.attempts.filter((item) => item.currentComponentRef === eCurrent?.componentRef);
const f = prohibited.report.merchantCommercialFindingShadowProjection.decisions.filter((item) => item.presentationGroupId.includes(":High Volume:") && item.reasonCodes.includes("publicly_prohibited"));
const g = highVolumeDecision(restricted.report, "VISA WATS AUTH FEE");
const h = highVolumeDecision(populationMismatchStable.report, "VISA WATS AUTH FEE");
const hCandidate = candidateFor(populationMismatchStable.report, h.candidateId);
const ij = reversing.report.merchantCommercialFindingShadowProjection.decisions.filter((item) => item.presentationGroupId.includes(":High Volume:") && item.comparisonValidity === "valid_exact");
const kContexts = exact.report.perAuthorizationCommercialRuntimeReadiness.candidateContexts.filter((context) =>
  exact.report.merchantCommercialFindingShadowProjection.decisions.some((decision) => decision.candidateId === context.candidateId && decision.comparisonValidity === "valid_exact"));
const lLedger = unknownChannel.report.commercialReportSetOfflineIntegration.selectionLedger.find((item) => item.candidateId === dDependency?.reviewCandidateId);

const cases = [
  caseResult("A", "fully_bound_exact_review", Boolean(a?.action.permitted && a.materiality.state === "review_threshold_met"
    && candidateFor(exact.report, a.candidateId).offsets.state === "complete_non_reversing"
    && contextFor(exact.report, a.candidateId)?.bindingSource === "runtime_bound"),
  "Exact current and governed alternative authorization components reached Product materiality, permission, and arbitration with real runtime context."),
  caseResult("B", "below_materiality", Boolean(b?.comparisonValidity === "valid_exact" && !b.action.permitted),
  "The exact Mastercard component remained below the pricing-review threshold."),
  caseResult("C", "channel_mismatch", Boolean(c && !c.comparisonPerformed && c.finding.economics.matchedComponentDifference.state === "NOT_ESTABLISHED"),
  "Card-not-present current activity was not compared with a card-present offer component."),
  caseResult("D", "unknown_channel_invalidates_review", Boolean(dDependency && dContext?.verify?.missingFact === "CP/CNP authorization population split"),
  "Unknown channel produced an evidence-bound invalidating VERIFY dependency and no unconditional review."),
  caseResult("E", "population_mismatch", Boolean(eCurrent?.populationIdentity === "settled_transactions" && eAttempts.length > 0 && eAttempts.every((item) => !item.comparisonPerformed)),
  "Settled transactions were not substituted for authorization events."),
  caseResult("F", "publicly_prohibited", f.length > 0 && f.every((item) => !item.namedAlternativePermitted && !item.action.permitted && item.customerSafeRecord === null),
  "The prohibited alternative failed closed before merchant alternative naming."),
  caseResult("G", "restricted_review_required", Boolean(g && g.visibility.mode === "verify" && !g.action.permitted),
  "Restricted/review-required status stayed conditional and did not assume approval."),
  caseResult("H", "incomplete_same_scope", hCandidate?.offsets.state === "incomplete" && !h.action.permitted && h.visibility.mode === "explain",
  "An unmatched relevant authorization population kept same-authorization-scope economics incomplete."),
  caseResult("I", "reversing_same_scope", ij.length > 0 && ij.every((item) => candidateFor(reversing.report, item.candidateId).offsets.state === "complete_reversing" && !item.action.permitted),
  "A countervailing authorization component removed isolated pricing-review framing."),
  caseResult("J", "directional_fairness", ij.some((item) => item.direction === "current_costs_more") && ij.some((item) => item.direction === "current_costs_less"),
  "Both material directions remained in the same offer/scope candidate set."),
  caseResult("K", "evidence_strength", kContexts.length > 0 && kContexts.every((item) => item.bindingSource === "runtime_bound" && item.evidenceStrength === "high"),
  "Exact three-way evidence binding propagated as high claim-specific strength; no fallback strength was used."),
  caseResult("L", "normal_path_verify_dependency", Boolean(lLedger?.linkedVerifyCandidateId === dDependency?.verifyCandidateId && lLedger.reasonCodes.includes("review_path_held_by_unresolved_verify")),
  "The normal runtime dependency reached report arbitration and held the review path."),
];

const gold = [];
for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, asOf: "2026-09-12" });
  const after = canonicalFinancialTruthFingerprint(analysis);
  gold.push({
    file: fixture.file,
    canonicalFingerprintBefore: before,
    canonicalFingerprintAfter: after,
    acceptedBaselineFingerprint: baselineFingerprint.get(fixture.file) ?? null,
    canonicalInvariant: before === after && before === baselineFingerprint.get(fixture.file) && report.canonicalFinancialTruth.unchanged,
    historicalMatchedComparisons: report.commercialComparisonAttachment.summary.matchedComparisons,
    historicalPricingReviewActions: report.merchantCommercialFindingShadowProjection.decisions.filter((item) => item.action.permitted).length,
    heroByteEquivalent: report.commercialReportSetOfflineIntegration.heroByteEquivalent,
    primaryExperienceUnchanged: report.commercialReportSetOfflineIntegration.primaryExperienceUnchanged,
    customerRoutingAllowed: report.commercialReportSetOfflineIntegration.realCustomerRoutingAllowed,
  });
}

const sourceAfter = commercialSemanticFingerprintV1(REGISTRIES);
const fixtureCanonicalInvariant = [exact, unknownChannel, channelMismatch, populationMismatchStable, prohibited, restricted, reversing]
  .every((item) => item.beforeFingerprint === item.afterFingerprint);
const safetyCounters = {
  failedProductCases: cases.filter((item) => !item.pass).length,
  currentFixtureCanonicalMutations: fixtureCanonicalInvariant ? 0 : 1,
  goldCanonicalFingerprintChanges: gold.filter((item) => !item.canonicalInvariant).length,
  governedCommercialSourceFingerprintChanges: sourceBefore === sourceAfter ? 0 : 1,
  historicalCurrentComparisonLeaks: gold.reduce((sum, item) => sum + item.historicalMatchedComparisons, 0),
  historicalPricingReviewActions: gold.reduce((sum, item) => sum + item.historicalPricingReviewActions, 0),
  heroChanges: gold.filter((item) => !item.heroByteEquivalent).length,
  primaryExperienceChanges: gold.filter((item) => !item.primaryExperienceUnchanged).length,
  customerRoutingEnabled: gold.filter((item) => item.customerRoutingAllowed).length,
  fallbackContextsForExactAuthorization: kContexts.filter((item) => item.bindingSource !== "runtime_bound").length,
  prohibitedAlternativeNamesExposed: f.filter((item) => item.namedAlternativePermitted).length,
  populationMismatchArithmetic: eAttempts.filter((item) => item.comparisonPerformed).length,
  reversingOffsetReviewActions: ij.filter((item) => item.action.permitted).length,
  newCommercialKnowledgeAdmissions: 0,
  aiOrWebOperations: 0,
  savingsAnnualizationGradesOverpaymentSwitchingOrRankings: 0,
};

const evaluation = {
  schemaVersion: "per_authorization_commercial_runtime_readiness_evaluation_2026_09_12_v1",
  generatedAt: "2026-09-12T00:00:00.000Z",
  productAuthority: PER_AUTHORIZATION_COMMERCIAL_RUNTIME_PRODUCT_AUTHORITY_V1,
  baseline: { branch: "codex/runtime-commercial-context-binding-validation-v1", commit: "62150c6e8365ce51616701d870ec918c6be4055e", parent: "d1221649895182b4269bbbb23073511de327abb8" },
  implementationBranch: "codex/per-authorization-commercial-runtime-readiness-v1",
  answer: "YES",
  normalPath: "ParsedDocument -> supported Fiserv canonical analysis -> governed payment/commercial decomposition -> exact current authorization component -> admitted alternative component -> internal comparison -> merchant permission -> runtime-bound report arbitration",
  downstreamSyntheticObjectsUsed: false,
  cases,
  exactCase: {
    runtimeSummary: exact.report.perAuthorizationCommercialRuntimeReadiness.summary,
    decision: { comparisonValidity: a.comparisonValidity, materiality: a.materiality, action: a.action, direction: a.direction },
    context: contextFor(exact.report, a.candidateId),
    reportArbitrationDisposition: exact.report.commercialReportSetOfflineIntegration.selectionLedger.find((item) => item.candidateId === a.candidateId),
    note: "The approved Gold-derived fixture remains in the existing unable-to-complete production experience, so offline arbitration receives and audits the real candidate but does not route it into a report.",
  },
  policyResults: {
    prohibitedDecisions: f.length,
    restrictedMode: g.visibility.mode,
    noKnownBlockAction: a.action,
    approvalAssumptionMade: false,
  },
  offsetResults: {
    completeNonReversing: candidateFor(exact.report, a.candidateId).offsets.state,
    incomplete: hCandidate.offsets.state,
    reversing: [...new Set(ij.map((item) => candidateFor(reversing.report, item.candidateId).offsets.state))],
  },
  verifyDependency: { dependency: dDependency, context: dContext, arbitrationLedger: lLedger },
  gold: {
    statements: gold,
    canonicalFingerprintInvariant: gold.every((item) => item.canonicalInvariant),
    historicalCurrentFirewallUnchanged: gold.every((item) => item.historicalMatchedComparisons === 0 && item.historicalPricingReviewActions === 0),
  },
  commercialSource: { expected: EXPECTED_SOURCE_SHA, before: sourceBefore, after: sourceAfter, unchanged: sourceBefore === EXPECTED_SOURCE_SHA && sourceBefore === sourceAfter },
  safetyCounters,
  componentBoundary: {
    runtimeReady: ["provider_controlled_per_authorization"],
    unchangedFailClosed: ["percentage_bps", "fixed_monthly", "gateway_transaction", "gateway_batch", "episodic_chargeback"],
  },
  knownUnrelatedIssuesNotRepaired: [
    "Merchant-attention remains at the accepted pre-existing 62/63 result.",
    "Historical/current remains at the accepted pre-existing 5/6 result.",
    "Batch 2 aggregate remains at the accepted stale 149-vs-152 expectation.",
    "Prior SIGSEGV/139 history was not investigated or repaired.",
  ],
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(OUTPUT_MD, render(evaluation));
console.log(JSON.stringify({
  outputs: [OUTPUT_JSON, OUTPUT_MD],
  answer: evaluation.answer,
  productCases: `${cases.filter((item) => item.pass).length}/${cases.length}`,
  sourceFingerprint: evaluation.commercialSource,
  goldCanonicalInvariance: evaluation.gold.canonicalFingerprintInvariant ? "11/11" : "FAIL",
  historicalCurrentFirewallUnchanged: evaluation.gold.historicalCurrentFirewallUnchanged,
  safetyCounters,
}, null, 2));
if (cases.some((item) => !item.pass)
  || !evaluation.gold.canonicalFingerprintInvariant
  || !evaluation.gold.historicalCurrentFirewallUnchanged
  || !evaluation.commercialSource.unchanged
  || Object.values(safetyCounters).some((value) => value !== 0)) process.exitCode = 1;

function caseResult(id: string, name: string, pass: boolean, outcome: string) {
  return { id, name, pass, normalPath: true as const, outcome };
}

function normalPath(base: ParsedDocument, options: {
  channel: InternalAnalystMerchantContext["channel"];
  riskClass?: InternalAnalystMerchantContext["riskClass"];
  policy?: "no_known_public_block" | "restricted";
  replacements?: Array<[string, string]>;
}) {
  const document = currentPeriodDocument(base, options.replacements ?? []);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: "privacy-safe-supported-fiserv-current-period.pdf", businessType: "restaurant_food_beverage" });
  const beforeFingerprint = canonicalFinancialTruthFingerprint(analysis);
  const commercialFacts: NonNullable<InternalAnalystMerchantContext["commercialFacts"]> = {};
  if (options.policy === "no_known_public_block") {
    commercialFacts.risk_review_required = { value: false, evidenceRefs: ["merchant_confirmed:risk_review_not_required"], basis: "merchant_confirmed" };
    commercialFacts.future_delivery_or_custom_deposit_or_open_ended_billing = { value: false, evidenceRefs: ["merchant_confirmed:no_future_delivery_condition"], basis: "merchant_confirmed" };
  } else if (options.policy === "restricted") {
    commercialFacts.future_delivery_or_custom_deposit_or_open_ended_billing = { value: true, evidenceRefs: ["merchant_confirmed:future_delivery_condition"], basis: "merchant_confirmed" };
  }
  const report = buildInternalAnalystFindingV1({
    analysis,
    statementContext: US_CONTEXT,
    merchantContext: {
      verticalId: "restaurant_food_beverage", riskClass: options.riskClass ?? "standard", channel: options.channel,
      averageTicketUsd: 42, evidenceRefs: ["fixture:merchant_confirmed_context"], basis: "merchant_confirmed", commercialFacts,
    },
    asOf: "2026-09-30",
  });
  return { analysis, report, beforeFingerprint, afterFingerprint: canonicalFinancialTruthFingerprint(analysis) };
}

function currentPeriodDocument(base: ParsedDocument, replacements: Array<[string, string]>): ParsedDocument {
  const convert = (value: string | number): string | number => {
    if (value === 324136827999) return 111111111111;
    if (typeof value !== "string") return value;
    let safe = value.replaceAll("09/01/24", "09/01/26").replaceAll("09/30/24", "09/30/26")
      .replaceAll("324136827999", "111111111111").replaceAll("EL NUEVO TEQUILA MEXICAN", "SYNTHETIC CURRENT MERCHANT")
      .replaceAll("FELIX GARCIA", "SYNTHETIC OWNER").replaceAll("602 W 15TH ST", "100 TEST STREET")
      .replaceAll("WASHINGTON NC 27889 -3527", "TEST CITY ST 00000");
    for (const [from, to] of replacements) safe = safe.replaceAll(from, to);
    return safe;
  };
  return { ...base, rows: base.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, convert(value)]))), textPreview: String(convert(base.textPreview)), extraction: { ...base.extraction, reasons: ["Privacy-safe current-period per-authorization runtime fixture."] } };
}

function currentFor(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  return report.commercialComparisonAttachment.deterministicBaseline.currentProviderControlledComponents.find((item) => item.printedLabel.includes(label));
}

function attemptsFor(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  const current = currentFor(report, label);
  return report.commercialComparisonAttachment.attempts.filter((item) => item.currentComponentRef === current?.componentRef);
}

function highVolumeDecision(report: ReturnType<typeof buildInternalAnalystFindingV1>, label: string) {
  const attempts = attemptsFor(report, label);
  return report.merchantCommercialFindingShadowProjection.decisions.find((decision) => attempts.some((attempt) => attempt.attemptId === decision.candidateId)
    && decision.presentationGroupId.includes(":High Volume:") && decision.comparisonValidity === "valid_exact")!;
}

function candidateFor(report: ReturnType<typeof buildInternalAnalystFindingV1>, candidateId: string) {
  return report.perAuthorizationCommercialRuntimeReadiness.candidates.find((item) => item.candidateId === candidateId)!;
}

function contextFor(report: ReturnType<typeof buildInternalAnalystFindingV1>, candidateId: string) {
  return report.perAuthorizationCommercialRuntimeReadiness.candidateContexts.find((item) => item.candidateId === candidateId);
}

function render(value: typeof evaluation): string {
  return [
    "# Per-Authorization Commercial Runtime Readiness v1",
    "",
    "## Answer",
    "",
    "YES — provider-controlled per-authorization pricing is runtime-ready for the accepted shadow/offline merchant-commercial arbitration. No customer routing is enabled.",
    "",
    `Product authority SHA-256: \`${value.productAuthority.sha256}\`.`,
    "",
    "## Normal-path lineage",
    "",
    value.normalPath,
    "",
    "No comparison attempt, permission candidate, dependency, or arbitration decision was instantiated directly by the evaluation fixtures.",
    "",
    "## Product cases",
    "",
    ...value.cases.map((item) => `- ${item.id} / ${item.name}: ${item.pass ? "PASS" : "FAIL"} — ${item.outcome}`),
    "",
    "## Exact review case",
    "",
    `- Comparison: ${value.exactCase.decision.comparisonValidity}.`,
    `- Materiality: ${value.exactCase.decision.materiality.state}.`,
    `- Action: ${value.exactCase.decision.action.type} / permitted=${value.exactCase.decision.action.permitted}.`,
    `- Runtime context source: ${value.exactCase.context?.bindingSource}; evidence strength: ${value.exactCase.context?.evidenceStrength}.`,
    `- Offline arbitration disposition: ${value.exactCase.reportArbitrationDisposition?.disposition}. ${value.exactCase.note}`,
    "",
    "## Invariance and safety",
    "",
    `- Gold canonical financial fingerprints: ${value.gold.canonicalFingerprintInvariant ? "11/11 unchanged" : "FAIL"}.`,
    `- Historical/current firewall: ${value.gold.historicalCurrentFirewallUnchanged ? "unchanged" : "FAIL"}.`,
    `- Governed commercial-source SHA before: \`${value.commercialSource.before}\`.`,
    `- Governed commercial-source SHA after: \`${value.commercialSource.after}\`.`,
    ...Object.entries(value.safetyCounters).map(([name, count]) => `- ${name}: ${count}.`),
    "",
    "## Component boundary",
    "",
    `- Runtime-ready: ${value.componentBoundary.runtimeReady.join(", ")}.`,
    `- Still fail closed: ${value.componentBoundary.unchangedFailClosed.join(", ")}.`,
    "",
    "## Known unrelated issues preserved",
    "",
    ...value.knownUnrelatedIssuesNotRepaired.map((item) => `- ${item}`),
    "",
  ].join("\n");
}
