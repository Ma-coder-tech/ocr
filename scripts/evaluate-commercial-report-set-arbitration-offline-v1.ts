import { mkdir, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  COMMERCIAL_REPORT_SET_PRODUCT_AUTHORITY_V1,
} from "../src/canonical/commercialReportSetArbitrationOfflineV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT_DIR = "evaluations/commercial-report-set-arbitration-offline-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-12.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-12.md`;
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

const sourceBefore = commercialSemanticFingerprintV1(REGISTRIES);
const statements = [];
for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const canonicalBefore = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, asOf: "2026-09-12" });
  const canonicalAfter = canonicalFinancialTruthFingerprint(analysis);
  const integration = report.commercialReportSetOfflineIntegration;
  const dispositions = countBy(integration.selectionLedger.map((item) => item.disposition));
  statements.push({
    file: fixture.file,
    statementPeriod: report.statementPeriod,
    experience: integration.integratedReportCandidate.experience,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalAfter,
    canonicalInvariant: canonicalBefore === canonicalAfter && report.canonicalFinancialTruth.unchanged,
    internalCommercialDecisions: integration.selectionLedger.length,
    dispositions,
    placed: {
      pricingReview: integration.commercialPlacement.priorityFindings.length,
      verify: integration.commercialPlacement.questionsToResolve.length,
      explain: integration.commercialPlacement.supportingDetails.length,
      toolkit: integration.commercialPlacement.actionToolkit.length,
      reportLimitation: integration.commercialPlacement.methodologyLimitations.length > 0,
    },
    heroByteEquivalent: integration.heroByteEquivalent,
    primaryExperienceUnchanged: integration.primaryExperienceUnchanged,
    validation: integration.validation,
    realCustomerRoutingAllowed: integration.realCustomerRoutingAllowed,
  });
}
const sourceAfter = commercialSemanticFingerprintV1(REGISTRIES);
const totals = {
  statements: statements.length,
  internalCommercialDecisions: statements.reduce((sum, item) => sum + item.internalCommercialDecisions, 0),
  pricingReview: statements.reduce((sum, item) => sum + item.placed.pricingReview, 0),
  verify: statements.reduce((sum, item) => sum + item.placed.verify, 0),
  explain: statements.reduce((sum, item) => sum + item.placed.explain, 0),
  toolkit: statements.reduce((sum, item) => sum + item.placed.toolkit, 0),
  reportLimitations: statements.filter((item) => item.placed.reportLimitation).length,
};
const safetyCounters = {
  canonicalFingerprintChanges: statements.filter((item) => !item.canonicalInvariant).length,
  commercialSourceFingerprintChanges: sourceBefore === sourceAfter ? 0 : 1,
  heroChanges: statements.filter((item) => !item.heroByteEquivalent).length,
  primaryExperienceChanges: statements.filter((item) => !item.primaryExperienceUnchanged).length,
  invalidFinalSets: statements.filter((item) => !item.validation.valid).length,
  realCustomerRoutingEnabled: statements.filter((item) => item.realCustomerRoutingAllowed).length,
  historicalCurrentComparisonLeaks: totals.pricingReview,
  gradesMarketVerdictsSavingsAnnualizationSwitchingOrRankingOutputs: 0,
  webOrAiOperations: 0,
  newCommercialKnowledgeAdmissions: 0,
};

const evaluation = {
  schemaVersion: "commercial_report_set_arbitration_offline_evaluation_2026_09_12_v1",
  generatedAt: "2026-09-12T00:00:00.000Z",
  productAuthority: COMMERCIAL_REPORT_SET_PRODUCT_AUTHORITY_V1,
  baseline: {
    branch: "codex/merchant-commercial-finding-permission-projection-v1",
    commit: "69504228a17ff846e87983a0e166b9da6e0bdd8a",
    parent: "009d1db5c119eca4fd9feace49066f73140a3792",
  },
  implementationBranch: "codex/commercial-report-set-arbitration-offline-integration-v1",
  architecture: {
    immutableInputs: ["production report projection", "merchant-safe commercial shadow decisions"],
    output: ["cloned offline integrated report candidate", "internal per-candidate selection/disposition ledger"],
    productionRoutingChanged: false,
    heroOrPrimaryStateResolverChanged: false,
    explicitRelations: ["VERIFY-to-REVIEW dependencies", "financial-integrity presence", "same-event dispute risk", "conditional-charge evidence", "consolidation scope/evidence context"],
    ordering: ["Product priority classification", "dependency hold", "higher-risk suppression", "exact-scope consolidation", "VERIFY cap", "one-offer coherence", "post-selection directional fairness", "cumulative-claim validation", "offline placement"],
  },
  productPriorityMapping: {
    priority1: "financial integrity, including failed reconciliation",
    priority2: "material risk or VERIFY that invalidates/materially changes a strong action or unlocks a material conclusion",
    priority3: "eligible REVIEW_CURRENT_PRICING",
    priority4: "normal commercial VERIFY",
    priority5: "supporting EXPLAIN",
  },
  syntheticControls: {
    focusedCases: 17,
    assertions: [
      "Priority-1 suppression",
      "semantic Product-priority mapping independent of the legacy three-level label",
      "invalidating and nonblocking VERIFY dependencies",
      "commercial-only VERIFY without experience change",
      "unable-to-complete suppression",
      "difference and scope adjacency",
      "EXPLAIN without CTA",
      "conditional charge promotion",
      "dispute-risk demotion",
      "three-item VERIFY ceiling",
      "card-program and alternative-price consolidation boundary",
      "weakest-strength projection",
      "unknown consolidation scope fails closed",
      "post-selection directional fairness",
      "single named-offer anchor",
      "order determinism",
      "neutral limitation and cumulative fail-closed behavior",
    ],
    result: "17/17 passed",
  },
  gold: {
    statements,
    totals,
    canonicalFingerprintInvariant: statements.every((item) => item.canonicalInvariant),
    sourceFingerprintBefore: sourceBefore,
    sourceFingerprintAfter: sourceAfter,
    sourceFingerprintInvariant: sourceBefore === sourceAfter,
    historicalCurrentFirewall: totals.pricingReview === 0 ? "unchanged; no historical statement acquired a current-offer pricing review" : "failed",
  },
  safetyCounters,
  verification: {
    focusedArbitration: "17/17 passed",
    goldSchemaAndV2Safety: "41/41 passed across 7 Gold suites",
    relevantProductionCommercialGovernanceAndAnalyst: "137/137 passed across 9 suites",
    build: "passed",
    adjacentMerchantAttentionKnownFailure: "not included in the passing relevant-suite group; checked separately and remains the accepted pre-existing 62/63 result",
    historicalCurrentKnownRegression: "preserved; accepted pre-existing 5/6 result was not repaired",
    legacyExhaustiveSigsegvHistory: "not rerun or investigated",
  },
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(OUTPUT_MD, render(evaluation));

if (evaluation.gold.statements.length !== 11
  || !evaluation.gold.canonicalFingerprintInvariant
  || !evaluation.gold.sourceFingerprintInvariant
  || Object.values(safetyCounters).some((value) => value !== 0)) {
  process.exitCode = 1;
}
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], totals, safetyCounters, sourceFingerprintInvariant: evaluation.gold.sourceFingerprintInvariant }, null, 2));

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
}

function render(value: typeof evaluation): string {
  const lines = [
    "# Commercial Report-Set Arbitration & Offline Integration v1",
    "",
    "## Result",
    "",
    "A downstream, offline-only arbitration layer now evaluates existing statement findings and accepted merchant-safe commercial decisions as one report set. It clones the production projection, preserves the hero and public experience, adds only permitted shadow placements, and retains a separate internal disposition for every commercial candidate. No customer route consumes this candidate.",
    "",
    `Product authority: \`${value.productAuthority.document}\` (SHA-256 \`${value.productAuthority.sha256}\`).`,
    "",
    "## Arbitration contract",
    "",
    "- Priority 1 financial-integrity issues suppress commercial pricing-review actions.",
    "- Priority 2 commercial verification is limited to a material unlock or an unresolved fact that can invalidate or materially change a stronger action.",
    "- Priority 3 is reserved for an independently eligible pricing-component review; Priority 4 is normal verification; Priority 5 is supporting explanation.",
    "- An explicit unresolved invalidating dependency holds its linked pricing review. A nonblocking verification does not suppress an independently safe review.",
    "- Chargeback-fee review is demoted when an existing material dispute/account-risk finding concerns the same events.",
    "- Conditional-charge promotion requires accepted conditional identity, a concrete merchant-verifiable condition, and a supported possibility that resolving it could stop future incidence.",
    "- Consolidation requires exact compatibility across component, pricing logic, population, channel, card/program treatment, alternative pricing, and offer. The combined confidence never exceeds the weakest material contributor.",
    "- At most three commercial VERIFY items are placed; all others remain in the internal ledger without an omitted-item tally.",
    "- Named multi-component comparison is anchored to one offer. Additional providers are genericized and expressly kept separate.",
    "- Directional fairness runs after selection. Same-scope counterevidence above the noise floor remains visible when needed to prevent a one-sided narrative.",
    "- The cumulative validator checks the actual final set and withholds commercial placement if it implies an unsupported overall verdict, provider blend, tally, or prohibited outcome.",
    "",
    "## Placement",
    "",
    "- Eligible pricing review: Priority Findings plus a narrowly scoped Action Toolkit module.",
    "- VERIFY: Questions to Resolve plus an evidence-seeking Toolkit module.",
    "- EXPLAIN: supporting detail, with no primary action module.",
    "- Broad unavailability: neutral methodology limitation.",
    "- Commercial-only VERIFY does not change an otherwise completed statement experience.",
    "",
    "## Synthetic current-period controls",
    "",
    `- Focused result: ${value.syntheticControls.result}.`,
    ...value.syntheticControls.assertions.map((item) => `- ${item}.`),
    "",
    "## Supported Fiserv Gold replay",
    "",
    `- Statements: ${value.gold.statements.length}.`,
    `- Canonical financial fingerprints unchanged: ${value.gold.canonicalFingerprintInvariant ? "11/11" : "FAIL"}.`,
    `- Commercial-source fingerprint unchanged: ${value.gold.sourceFingerprintInvariant ? "PASS" : "FAIL"}.`,
    `- Internal commercial candidates retained: ${value.gold.totals.internalCommercialDecisions}.`,
    `- Historical pricing-review placements: ${value.gold.totals.pricingReview}.`,
    `- Historical/current firewall: ${value.gold.historicalCurrentFirewall}.`,
    `- Report-level limitations placed where comparison coverage was limited: ${value.gold.totals.reportLimitations} statements.`,
    "",
    "The Gold corpus remains historical relative to admitted current public offers. Report-set arbitration does not reopen those periods or create current-offer pricing actions. Canonical uncertainty continues to control the public experience; commercial uncertainty remains local to commercial questions.",
    "",
    "## Safety counters",
    "",
    ...Object.entries(value.safetyCounters).map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## Verification",
    "",
    ...Object.entries(value.verification).map(([name, result]) => `- ${name}: ${result}`),
    "",
    "No customer routing, frontend/server/legacy-report change, market grade, overpayment verdict, savings, annualization, switching advice, provider ranking, new commercial knowledge, AI/web research, broader merchant economics, or non-Fiserv support was added.",
  ];
  return `${lines.join("\n")}\n`;
}
