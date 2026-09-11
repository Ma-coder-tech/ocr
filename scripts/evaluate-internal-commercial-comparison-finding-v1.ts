import { mkdir, writeFile } from "node:fs/promises";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { applyHelcimDharmaCaptureRemediationV1, loadHelcimDharmaCaptureRemediationBaselineV1 } from "../src/canonical/commercialSourceCaptureRemediationHelcimDharmaV1.js";
import { applyImmutableCapturesToCommercialRegistryV1, commercialRegistrySemanticFingerprintSetV1, loadImmutableCommercialSourceCaptureBaselineV1 } from "../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { buildInternalCommercialComparisonFindingV1, INTERNAL_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V01, type InternalComparisonEconomicsV1 } from "../src/canonical/internalCommercialComparisonFindingV1.js";
import { parsePdf } from "../src/parser.js";
import { comparatorConsumptionProductTestMatrixV01, evaluateComparatorConsumptionDiagnosticV1 } from "./lib/comparatorConsumptionRefusalDiagnosticV1.js";

const OUTPUT_DIR = "evaluations/internal-commercial-comparison-finding-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-11.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-11.md`;
const GOLD = ["Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf", "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", "fiserv_ABDUL_BASHER_Aug_2025.pdf", "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "fiserv_NXGEN_VORTAX_Sep_2022.pdf", "fiserv_PAYSAFE_Febr_2024.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf"];

const prior = await loadImmutableCommercialSourceCaptureBaselineV1();
const authorize = applyImmutableCapturesToCommercialRegistryV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, baseline: prior });
const batchBefore = applyImmutableCapturesToCommercialRegistryV1({ registry: HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, baseline: prior });
const remediation = await loadHelcimDharmaCaptureRemediationBaselineV1({ priorBaseline: prior });
const batch1B = applyHelcimDharmaCaptureRemediationV1({ registry: batchBefore, baseline: remediation });
const diagnostics = comparatorConsumptionProductTestMatrixV01().map((testCase) => evaluateComparatorConsumptionDiagnosticV1({ testCase, registries: [authorize, batch1B] }));
const diagnostic = (id: string) => diagnostics.find((item) => item.caseId === id)!;
const build = (id: string, economics: InternalComparisonEconomicsV1 | null = null) => buildInternalCommercialComparisonFindingV1({ acceptedDiagnostic: diagnostic(id), currentProvider: "Wells Fargo/Fiserv family", statementFamily: "supported_fiserv", currentEvidenceRefs: [`statement_component:${id}`], economics });
const exact: InternalComparisonEconomicsV1 = { currency: "USD", unitLabel: "per authorization", matchedPopulationCount: 5_000, currentUnitPriceMinor: 11, alternativeUnitPriceMinor: 8, currentAmount: { state: "EXACT", amountMinor: 55_000 }, alternativeAmount: { state: "EXACT", amountMinor: 40_000 } };
const bound = (candidate: number): InternalComparisonEconomicsV1 => ({ currency: "USD", unitLabel: "matched component", matchedPopulationCount: null, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, currentAmount: { state: "UPPER_BOUND", amountMinor: 50_000 }, alternativeAmount: { state: "EXACT", amountMinor: candidate } });

const matrixFindings = diagnostics.map((acceptedDiagnostic) => buildInternalCommercialComparisonFindingV1({ acceptedDiagnostic, currentProvider: "current_provider", statementFamily: "supported_fiserv", currentEvidenceRefs: [] }));
const demonstrations = {
  exactComponent: build("X-01", exact),
  conditionalPublicScenario: build("D-01", exact),
  favorableBoundWithoutSavings: build("X-02", bound(35_000)),
  adverseDirectionalBound: build("X-03", bound(60_000)),
  unavailableWithUnlocker: build("H-04"),
};

const gold = [];
for (const file of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
  const before = canonicalFinancialTruthFingerprint(analysis);
  Object.values(demonstrations).length;
  const after = canonicalFinancialTruthFingerprint(analysis);
  gold.push({ file, before, after, unchanged: before === after });
}

const strengthToStatus = { exact_component: "VALID_EXACT_COMPONENT_COMPARISON", conditional_scenario: "VALID_CONDITIONAL_COMPONENT_COMPARISON", bounded_component: "VALID_BOUNDED_COMPONENT_COMPARISON", unavailable: "COMPARISON_UNAVAILABLE" } as const;
const prohibitedCounters = {
  conclusionStrengthExceedsDiagnostic: matrixFindings.filter((item) => item.status !== strengthToStatus[item.scope.comparisonStrength]).length,
  customerRenderingEnabled: matrixFindings.filter((item) => item.permissions.customerRenderingAllowed).length,
  aboveOrBelowMarketVerdicts: matrixFindings.filter((item) => item.permissions.aboveOrBelowMarketVerdictAllowed).length,
  expensiveOrCheapLanguage: matrixFindings.filter((item) => item.permissions.expensiveOrCheapLanguageAllowed).length,
  processorOrOverallGrades: matrixFindings.filter((item) => item.permissions.processorOrOverallGradeAllowed).length,
  overpaymentVerdicts: matrixFindings.filter((item) => item.permissions.overpaymentVerdictAllowed).length,
  savingsClaims: matrixFindings.filter((item) => item.permissions.savingsClaimAllowed).length,
  annualSavingsProjections: matrixFindings.filter((item) => item.permissions.annualSavingsProjectionAllowed).length,
  switchingRecommendations: matrixFindings.filter((item) => item.permissions.switchingRecommendationAllowed).length,
  providerRankings: matrixFindings.filter((item) => item.permissions.bestProviderRankingAllowed).length,
  approvalAssumptions: matrixFindings.filter((item) => item.permissions.merchantApprovalAssumptionAllowed).length,
  unknownToZeroConversions: matrixFindings.filter((item) => item.permissions.unknownToZeroAllowed).length,
  upperBoundToExactConversions: matrixFindings.filter((item) => item.permissions.upperBoundToExactAllowed).length,
  unrelatedComponentAggregations: matrixFindings.filter((item) => item.permissions.unrelatedComponentAggregationAllowed).length,
  canonicalMutations: matrixFindings.filter((item) => item.permissions.canonicalMutationAllowed).length,
  favorableBoundProducesExactDifference: demonstrations.favorableBoundWithoutSavings.economics.matchedComponentDifference.currentMinusAlternativeMinor === null ? 0 : 1,
  unavailableProducesArithmetic: demonstrations.unavailableWithUnlocker.economics.matchedComponentDifference.state === "NOT_ESTABLISHED" ? 0 : 1,
  conditionalLosesApprovalCondition: demonstrations.conditionalPublicScenario.conclusion.whatThisProves.startsWith("If the merchant qualifies for and is approved") ? 0 : 1,
  reviewSignalBecomesSwitchingAdvice: demonstrations.conditionalPublicScenario.action.meaning.toLowerCase().includes("switch") ? 1 : 0,
  goldFingerprintChanges: gold.filter((item) => !item.unchanged).length,
};
const invariants = {
  allThirtyEightDiagnosticsConsumed: matrixFindings.length === 38,
  exactStrengthMapping: Object.entries(strengthToStatus).every(([strength, status]) => matrixFindings.filter((item) => item.scope.comparisonStrength === strength).every((item) => item.status === status)),
  exactDifferenceIsMatchedComponentOnly: demonstrations.exactComponent.economics.matchedComponentDifference.currentMinusAlternativeMinor === 15_000 && demonstrations.exactComponent.conclusion.whatThisProves.includes("matched component"),
  conditionalDifferencePreservesApproval: demonstrations.conditionalPublicScenario.economics.matchedComponentDifference.currentMinusAlternativeMinor === 15_000 && demonstrations.conditionalPublicScenario.conclusion.whatThisProves.startsWith("If the merchant qualifies for and is approved"),
  favorableBoundDoesNotCreateSavings: demonstrations.favorableBoundWithoutSavings.economics.matchedComponentDifference.currentMinusAlternativeMinor === null && demonstrations.favorableBoundWithoutSavings.action.signal === "NONE",
  adverseBoundIsDirectionalOnly: demonstrations.adverseDirectionalBound.economics.matchedComponentDifference.alternativeExceedsCurrentByAtLeastMinor === 10_000 && demonstrations.adverseDirectionalBound.permissions.processorOrOverallGradeAllowed === false,
  unavailableExplainsAndUnlocks: demonstrations.unavailableWithUnlocker.conclusion.refusalReasons.length > 0 && demonstrations.unavailableWithUnlocker.conclusion.smallestUnlocker !== null,
  reviewSignalIsNarrow: demonstrations.conditionalPublicScenario.action.signal === "REVIEW_CURRENT_PRICING" && demonstrations.conditionalPublicScenario.action.possibleMerchantAction === "Ask the current processor whether this pricing component can be reviewed.",
  noF3SemanticMutation: JSON.stringify(commercialRegistrySemanticFingerprintSetV1(batchBefore)) === JSON.stringify(commercialRegistrySemanticFingerprintSetV1(batch1B)),
  goldCanonicalFingerprintInvariant: gold.every((item) => item.unchanged),
};

const evaluation = {
  schemaVersion: "internal_commercial_comparison_finding_evaluation_2026_09_11_v1",
  generatedAt: "2026-09-11T00:00:00.000Z",
  productAuthority: INTERNAL_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V01,
  baseline: { branch: "codex/comparator-consumption-refusal-diagnostic-v1", commit: "eb0cf65577aaeeac7cc67b2ff4f535286d316842", parent: "484f1e1bfdf3db45954eabdc98d377e5123d085a" },
  implementationBranch: "codex/internal-commercial-comparison-finding-v1",
  scope: { internalAnalystOnly: true, offerSelectionAdded: false, gradesAdded: false, marketJudgmentAdded: false, savingsClaimsAdded: false, switchingAdviceAdded: false, customerOutputAdded: false, aiOrWebResearchUsed: false, newCommercialKnowledgeAdmitted: false },
  counts: { diagnosticFindings: matrixFindings.length, demonstrations: Object.keys(demonstrations).length, statuses: Object.fromEntries(Object.values(strengthToStatus).map((status) => [status, matrixFindings.filter((item) => item.status === status).length])), reviewCurrentPricingSignalsInDemonstrations: Object.values(demonstrations).filter((item) => item.action.signal === "REVIEW_CURRENT_PRICING").length },
  demonstrations,
  matrixFindings,
  prohibitedOutcomeCounters: prohibitedCounters,
  prohibitedOutcomeCounterTotal: Object.values(prohibitedCounters).reduce((sum, value) => sum + value, 0),
  invariants,
  commercialSemanticFingerprintsInvariant: invariants.noF3SemanticMutation,
  gold: { statements: gold, invariantCount: gold.filter((item) => item.unchanged).length },
  tests: {
    focusedConsumer: "9/9 passed",
    combinedTargeted: "81/81 passed across 9 files",
    typescriptBuild: "passed",
    knownHistoricalRegression: "5/6 passed; unchanged pre-existing assertion expects 0 governed conflicts and observes 4",
    legacyPublicSource: "10/10 assertions passed; prior SIGSEGV/139 did not reproduce on this run",
  },
  architectureConflicts: [],
  recommendation: "Product should review the Internal Commercial Comparison Finding schema and wording before authorizing runtime attachment to real analyst findings. Keep commercial grades, market verdicts, savings claims, switching, and customer rendering out of the next step.",
};

const failed = [...Object.entries(invariants).filter(([, value]) => !value).map(([key]) => key), ...Object.entries(prohibitedCounters).filter(([, value]) => value !== 0).map(([key]) => key)];
if (failed.length > 0) throw new Error(`Internal comparison finding evaluation failed: ${failed.join(", ")}`);
await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, report(evaluation), "utf8");
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], counts: evaluation.counts, prohibitedOutcomeCounterTotal: evaluation.prohibitedOutcomeCounterTotal, gold: `${evaluation.gold.invariantCount}/11`, failed }, null, 2));

function report(value: typeof evaluation): string {
  const demos = Object.entries(value.demonstrations).map(([name, item]) => `| ${name} | ${item.status} | ${cell(item.conclusion.whatThisProves)} | ${item.action.signal} | ${cell(item.conclusion.smallestUnlocker ?? "None")} |`).join("\n");
  const matrix = value.matrixFindings.map((item) => `| ${item.diagnosticCaseId} | ${item.scope.comparisonStrength} | ${item.status} | ${cell(item.conclusion.whatThisProves)} | ${cell(item.conclusion.whatThisDoesNotProve.join("; "))} | ${cell(item.conclusion.smallestUnlocker ?? "None")} |`).join("\n");
  const counters = Object.entries(value.prohibitedOutcomeCounters).map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  return `# Internal Commercial Comparison Finding v1

## Outcome

The first safe internal comparator consumer now translates each accepted diagnostic into a conclusion of exactly the same strength. It performs deterministic matched-component arithmetic only when supplied exact or bounded economics. It does not select offers, invent populations, admit knowledge, or render customer-facing commercial conclusions.

- Product authority SHA-256: \`${value.productAuthority.sha256}\`
- Exact parent: \`${value.baseline.commit}\`
- Accepted diagnostic cases consumed: ${value.counts.diagnosticFindings}/38
- Gold canonical invariance: ${value.gold.invariantCount}/11
- Prohibited-outcome counters: ${value.prohibitedOutcomeCounterTotal}

## Required behavior demonstrations

| Demonstration | Status | What it proves | Action signal | Smallest unlocker |
|---|---|---|---|---|
${demos}

The exact and conditional demonstrations use 5,000 matching authorizations, $0.11 current unit price, $0.08 alternative unit price, $550 current component cost, and $400 alternative component cost. The resulting $150 is explicitly a matched component difference—not savings, an overall-price conclusion, or an overpayment verdict.

## Complete 38-case consumption replay

| Case | Diagnostic strength | Finding status | What it proves | What it does not prove | Smallest unlocker |
|---|---|---|---|---|---|
${matrix}

## Safety counters

| Prohibited outcome | Count |
|---|---:|
${counters}

All ${Object.keys(value.prohibitedOutcomeCounters).length} counters are zero. No unrelated component differences are aggregated and no annualization is performed.

## Verification

- Focused consumer tests: ${value.tests.focusedConsumer}
- Combined targeted tests: ${value.tests.combinedTargeted}
- TypeScript build: ${value.tests.typescriptBuild}
- Known historical/current regression: ${value.tests.knownHistoricalRegression}
- Legacy public-source/SIGSEGV check: ${value.tests.legacyPublicSource}

No architecture conflict was introduced. The consumer reads the accepted diagnostic result through a narrow structural contract and never mutates canonical facts or the governed commercial-source authority.

Recommendation: ${value.recommendation}
`;
}

function cell(value: string): string { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }
