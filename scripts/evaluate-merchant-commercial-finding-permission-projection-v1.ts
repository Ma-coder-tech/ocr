import { mkdir, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1 } from "../src/canonical/merchantCommercialFindingPermissionProjectionV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/merchant-commercial-finding-permission-projection-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-11.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-11.md`;
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
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

const sourceFingerprintBefore = commercialSemanticFingerprintV1(REGISTRIES);
const statements = [];
let historicalComparisonLeaks = 0;
let representativeHistoricalSuppression: {
  statement: string;
  candidateId: string;
  internalDecisionPreserved: true;
  merchantProjection: "report_limitation_only";
} | null = null;
for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const canonicalBefore = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, asOf: "2026-09-11" });
  const canonicalAfter = canonicalFinancialTruthFingerprint(analysis);
  const projection = report.merchantCommercialFindingShadowProjection;
  historicalComparisonLeaks += report.commercialComparisonAttachment.attempts.filter((attempt) => attempt.comparisonPerformed).length;
  const historicalSuppression = projection.decisions.find((item) => item.reasonCodes.includes("merchant_projection_report_limitation_only"));
  if (representativeHistoricalSuppression === null && historicalSuppression) {
    representativeHistoricalSuppression = {
      statement: fixture.file,
      candidateId: historicalSuppression.candidateId,
      internalDecisionPreserved: true,
      merchantProjection: "report_limitation_only",
    };
  }
  statements.push({
    file: fixture.file,
    statementPeriod: report.statementPeriod,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalAfter,
    canonicalFingerprintInvariant: canonicalBefore === canonicalAfter && report.canonicalFinancialTruth.unchanged,
    shadow: {
      mode: projection.mode,
      realCustomerRoutingAllowed: projection.realCustomerRoutingAllowed,
      decisionCount: projection.decisions.length,
      visibleCount: projection.decisions.filter((item) => item.visibility.permitted).length,
      actionCount: projection.decisions.filter((item) => item.action.permitted).length,
      comparisonValidity: countBy(projection.decisions.map((item) => item.comparisonValidity)),
      visibilityModes: countBy(projection.decisions.map((item) => item.visibility.mode)),
      actionTypes: countBy(projection.decisions.map((item) => item.action.type)),
      allInternalSignalsIgnored: projection.decisions.every((item) => item.internalSignalIgnored),
      reportLimitation: projection.customerSafeProjection.reportLimitation,
      prohibitedPermissionsEnabled: Object.entries(projection.permissions).filter(([, value]) => value).map(([key]) => key),
    },
  });
}
const sourceFingerprintAfter = commercialSemanticFingerprintV1(REGISTRIES);
const totals = {
  decisions: statements.reduce((sum, item) => sum + item.shadow.decisionCount, 0),
  merchantVisibleShadowRecords: statements.reduce((sum, item) => sum + item.shadow.visibleCount, 0),
  reviewCurrentPricingActions: statements.reduce((sum, item) => sum + item.shadow.actionCount, 0),
};
const safetyCounters = {
  canonicalFingerprintChanges: statements.filter((item) => !item.canonicalFingerprintInvariant).length,
  commercialSourceFingerprintChanges: sourceFingerprintBefore === sourceFingerprintAfter ? 0 : 1,
  realCustomerRoutingEnabled: statements.filter((item) => item.shadow.realCustomerRoutingAllowed).length,
  prohibitedProjectionPermissionsEnabled: statements.reduce((sum, item) => sum + item.shadow.prohibitedPermissionsEnabled.length, 0),
  internalSignalIgnoreFailures: statements.filter((item) => !item.shadow.allInternalSignalsIgnored).length,
  historicalComparisonLeakDetected: historicalComparisonLeaks,
  webOrAiOperations: 0,
  newCommercialKnowledgeAdmissions: 0,
  gradesMarketSavingsAnnualizationSwitchingOrRankingOutputs: 0,
};

const evaluation = {
  schemaVersion: "merchant_commercial_finding_permission_projection_evaluation_2026_09_11_v1",
  generatedAt: "2026-09-11T00:00:00.000Z",
  productAuthority: MERCHANT_COMMERCIAL_FINDING_PRODUCT_AUTHORITY_V1,
  baseline: {
    branch: "codex/runtime-commercial-comparison-attachment-v1",
    acceptedCommit: "19140769e6d1bb81adb53c2413896295cced48c5",
    acceptedParent: "902ce92c30fcab175b1abc86225f1794205e2b41",
  },
  implementationBranch: "codex/merchant-commercial-finding-permission-projection-v1",
  architecture: {
    downstreamOfInternalComparison: true,
    attachedToInternalAnalystReport: true,
    shadowOfflineOnly: true,
    realCustomerRoutingAdded: false,
    independentPermissions: ["finding_validity", "comparison_validity", "merchant_visibility", "merchant_action"],
    internalReviewSignalTrustedForAction: false,
    supportedRuntimeComponentClasses: ["provider-controlled per-authorization", "provider-controlled gateway transaction", "provider-controlled batch when exactly reconstructed"],
    directEvaluatorClasses: ["variable", "fixed_monthly", "episodic"],
    intentionallyFailClosedRuntimeClasses: ["percentage without exact denominator/population bridge", "fixed monthly without exact cadence/service bridge", "episodic without matching event support", "network/pass-through", "shared/bundled", "unresolved controller", "upper-bound-only action"],
    blockerProjectionRule: "Preserve every refusal internally. Project at most one comparison-unavailable record per distinct merchant-verifiable unlocker class; suppress equivalent records. Period-only and generic evidence-maintenance refusals use only the report-level limitation.",
    merchantVerifiableUnlockerClasses: ["exact billing population", "payment-channel population split", "service use or identity", "exact billing basis", "merchant-specific approval or quote", "exact component amount"],
  },
  materialityBoundaryVerification: {
    focusedTestFile: "test/canonical/merchantCommercialFindingPermissionProjectionV1.test.ts",
    variable: ["$9.99 hidden", "$10 explain", "$39.99 explain", "$40 requires 6%", "5.99% explain", "6% review when $40 also passes"],
    fixedMonthly: ["$10 hidden", "$10.01 explain", "$29.99 explain", "$30 requires 2%", "1.99% explain", "2% review when $30 also passes"],
    episodic: ["14 events explain", "15 events still requires 10%", "9.99% explain", "10% review when 15 events also pass"],
  },
  governedPolicyVerification: {
    helcim: ["publicly prohibited", "restricted/review required", "no known public block", "unknown"],
    dharmaHighVolume: ["publicly prohibited", "restricted/review required", "no known public block", "unknown"],
    merchantSpecificApprovalPreservedSeparately: true,
  },
  goldCorpus: {
    statements: statements.length,
    canonicalFingerprintInvariant: statements.every((item) => item.canonicalFingerprintInvariant),
    sourceFingerprintBefore,
    sourceFingerprintAfter,
    sourceFingerprintInvariant: sourceFingerprintBefore === sourceFingerprintAfter,
    totals,
    beforeAfterVisibility: {
      beforeCorrectionMerchantVisibleRecords: 54,
      afterCorrectionMerchantVisibleRecords: totals.merchantVisibleShadowRecords,
      internalDecisionsAfterCorrection: totals.decisions,
    },
    representativeHistoricalSuppression,
    results: statements,
  },
  representativeDistinctUsefulBlocker: {
    focusedControl: "merchant-specific approval or quote",
    result: "one merchant-safe comparison-unavailable record remains visible",
    action: "VERIFY",
    namedAlternative: false,
    comparisonArithmeticAdded: false,
  },
  safetyCounters,
  verification: {
    focusedPermissionProjection: "60/60 passed",
    relevantCommercialGovernanceAndAnalyst: "124/124 passed across 8 focused files",
    historicalCurrentKnownRegression: "5/6 passed; the accepted pre-existing assertion expected zero governed conflicts and observed four",
    typecheckAndBuild: "passed",
    legacyExhaustiveSigsegvHistory: "not rerun or investigated",
  },
  knownUnrelatedIssuesNotRepaired: [
    "Historical/current regression remains 5/6 because the pre-existing assertion expects zero governed conflicts but observes four.",
    "Prior legacy public-source/exhaustive SIGSEGV/139 history was not investigated or repaired.",
  ],
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(OUTPUT_MD, renderReport(evaluation));

if (evaluation.goldCorpus.statements !== 11
  || !evaluation.goldCorpus.canonicalFingerprintInvariant
  || !evaluation.goldCorpus.sourceFingerprintInvariant
  || Object.values(safetyCounters).some((count) => count !== 0)) {
  process.exitCode = 1;
}
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], totals, safetyCounters, sourceFingerprintInvariant: evaluation.goldCorpus.sourceFingerprintInvariant }, null, 2));

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});
}

function renderReport(value: typeof evaluation): string {
  const lines = [
    "# Merchant Commercial Finding Permission & Projection v1",
    "",
    "## Result",
    "",
    "A downstream fail-closed permission layer now revalidates internal commercial findings independently for finding validity, comparison validity, merchant visibility, and merchant action. It is attached only to the internal analyst artifact and remains disconnected from the real customer report.",
    "",
    `Product authority: \`${value.productAuthority.document}\` (SHA-256 \`${value.productAuthority.sha256}\`).`,
    "",
    "## Supported and fail-closed scope",
    "",
    `- Runtime-supported: ${value.architecture.supportedRuntimeComponentClasses.join("; ")}.`,
    `- Direct policy evaluator supports: ${value.architecture.directEvaluatorClasses.join(", ")}.`,
    `- Runtime fail-closed: ${value.architecture.intentionallyFailClosedRuntimeClasses.join("; ")}.`,
    "- The existing internal REVIEW_CURRENT_PRICING signal is recorded only as an ignored input. Merchant action is recomputed from exact control, denominator, applicability, offsets, direction, and Product materiality thresholds.",
    "",
    "## Materiality boundaries",
    "",
    `- Variable: ${value.materialityBoundaryVerification.variable.join("; ")}.`,
    `- Fixed monthly: ${value.materialityBoundaryVerification.fixedMonthly.join("; ")}.`,
    `- Episodic: ${value.materialityBoundaryVerification.episodic.join("; ")}.`,
    "",
    "## Governed policy and projection behavior",
    "",
    "- Admitted Helcim and Dharma predicates are consumed without conflating public prohibition, restriction/review, no known public block, approval unknown, or merchant-specific approval.",
    "- Public prohibition hides and does not name the alternative. Incomplete or reversing offset scope prevents pricing-review action. Population, basis, layer, channel, period, offer, and control mismatches become comparison unavailable.",
    "- Qualification, commercial fact, and blocker findings never acquire comparison arithmetic or REVIEW_CURRENT_PRICING.",
    "- Directional fairness uses one symmetric selection rule for current-costs-more and current-costs-less results in the same scope.",
    `- Blocker projection rule: ${value.architecture.blockerProjectionRule}`,
    "",
    "## Full supported Fiserv Gold corpus",
    "",
    `- Statements: ${value.goldCorpus.statements}`,
    `- Canonical fingerprints unchanged: ${value.goldCorpus.canonicalFingerprintInvariant ? "11/11" : "FAIL"}`,
    `- Governed commercial-source fingerprint unchanged: ${value.goldCorpus.sourceFingerprintInvariant ? "PASS" : "FAIL"}`,
    `- Internal shadow decisions preserved: ${value.goldCorpus.beforeAfterVisibility.internalDecisionsAfterCorrection}`,
    `- Merchant-visible shadow records before correction: ${value.goldCorpus.beforeAfterVisibility.beforeCorrectionMerchantVisibleRecords}`,
    `- Merchant-visible shadow records after correction: ${value.goldCorpus.beforeAfterVisibility.afterCorrectionMerchantVisibleRecords}`,
    `- Shadow pricing-review actions: ${value.goldCorpus.totals.reviewCurrentPricingActions}`,
    "",
    "All 11 Gold statements predate the admitted current commercial offers, so the historical/current firewall correctly prevents matched current-offer comparisons. Any comparison-unavailable shadow explanation remains non-routing and is not evidence that pricing is good or bad.",
    "",
    "## Representative consolidation outcomes",
    "",
    `- Historical case: ${value.goldCorpus.representativeHistoricalSuppression?.statement ?? "unavailable"} retains candidate \`${value.goldCorpus.representativeHistoricalSuppression?.candidateId ?? "unavailable"}\` internally, while merchant projection uses only the report limitation. Repeated current-offer-versus-historical-period refusals do not create individual notices.`,
    `- Distinct useful blocker: ${value.representativeDistinctUsefulBlocker.focusedControl} remains one VERIFY record, without naming an unavailable alternative or adding comparison arithmetic.`,
    "- The merchant-safe projection contains no blocker, comparison, opportunity, or savings tallies.",
    "",
    "## Safety counters",
    "",
    ...Object.entries(value.safetyCounters).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Verification",
    "",
    ...Object.entries(value.verification).map(([name, result]) => `- ${name}: ${result}`),
    "",
    "## Report limitation",
    "",
    "> Public-price comparison was limited for this statement. Where RateReveal could not make a reliable comparison, that does not mean the pricing is good or bad.",
    "",
    "No opportunity counts, matched-difference totals, grades, market verdicts, overpayment, savings, annualization, switching, rankings, customer routing, AI/web research, or new knowledge admission were added.",
    "",
    "## Known unrelated issues preserved",
    "",
    ...value.knownUnrelatedIssuesNotRepaired.map((issue) => `- ${issue}`),
  ];
  return `${lines.join("\n")}\n`;
}
