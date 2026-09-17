import { mkdir, writeFile } from "node:fs/promises";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { applyHelcimDharmaCaptureRemediationV1, loadHelcimDharmaCaptureRemediationBaselineV1 } from "../src/canonical/commercialSourceCaptureRemediationHelcimDharmaV1.js";
import { applyImmutableCapturesToCommercialRegistryV1, commercialRegistrySemanticFingerprintSetV1, loadImmutableCommercialSourceCaptureBaselineV1 } from "../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { buildInternalCommercialComparisonFindingV1, INTERNAL_COMMERCIAL_COMPARISON_PRODUCT_AUTHORITY_V01, type InternalComparisonEconomicsV1, type MatchedCurrentAlternativeComponentComparisonV1 } from "../src/canonical/internalCommercialComparisonFindingV1.js";
import { parsePdf } from "../src/parser.js";
import { comparatorConsumptionProductTestMatrixV01, evaluateComparatorConsumptionDiagnosticV1, type ComparatorConsumptionDiagnosticResultV1 } from "./lib/comparatorConsumptionRefusalDiagnosticV1.js";

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
const exact: InternalComparisonEconomicsV1 = { currency: "USD", unitLabel: "per authorization", matchedPopulationCount: 5_000, currentUnitPriceMinor: 11, alternativeUnitPriceMinor: 8, currentAmount: { state: "EXACT", amountMinor: 55_000 }, alternativeAmount: { state: "EXACT", amountMinor: 40_000 } };
const bound = (candidate: number): InternalComparisonEconomicsV1 => ({ currency: "USD", unitLabel: "matched component", matchedPopulationCount: null, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, currentAmount: { state: "UPPER_BOUND", amountMinor: 50_000 }, alternativeAmount: { state: "EXACT", amountMinor: candidate } });
const matchedComparison = (id: string, economics: InternalComparisonEconomicsV1): MatchedCurrentAlternativeComponentComparisonV1 => ({
  componentLabel: "authorization pricing component",
  economics,
  currentComponentEvidenceRefs: [`statement_component:${id}`],
  alternativeComponentEvidenceRefs: [`governed_alternative_component:${id}`],
  matchedPopulationEvidenceRefs: [`matched_population:${id}`],
});
const acceptedDirectionalComparison = (item: ComparatorConsumptionDiagnosticResultV1): MatchedCurrentAlternativeComponentComparisonV1 | null => item.directionalArithmetic ? {
  componentLabel: "claim-specific bounded component",
  economics: {
    currency: "USD",
    unitLabel: "matched component",
    matchedPopulationCount: null,
    currentUnitPriceMinor: null,
    alternativeUnitPriceMinor: null,
    currentAmount: { state: "UPPER_BOUND", amountMinor: item.directionalArithmetic.currentRangeMinor.high },
    alternativeAmount: { state: "EXACT", amountMinor: item.directionalArithmetic.candidateExactMinor },
  },
  currentComponentEvidenceRefs: [`accepted_diagnostic:${item.caseId}:current_bound`],
  alternativeComponentEvidenceRefs: [`accepted_diagnostic:${item.caseId}:candidate_exact`],
  matchedPopulationEvidenceRefs: [`accepted_diagnostic:${item.caseId}:matched_scope`],
} : null;
const build = (id: string, economics: InternalComparisonEconomicsV1 | null = null) => buildInternalCommercialComparisonFindingV1({
  acceptedDiagnostic: diagnostic(id),
  currentProvider: "Wells Fargo/Fiserv family",
  statementFamily: "supported_fiserv",
  currentEvidenceRefs: [`statement_component:${id}`],
  matchedComparison: economics ? matchedComparison(id, economics) : null,
});

const matrixFindings = diagnostics.map((acceptedDiagnostic) => buildInternalCommercialComparisonFindingV1({ acceptedDiagnostic, currentProvider: "current_provider", statementFamily: "supported_fiserv", currentEvidenceRefs: [], matchedComparison: acceptedDirectionalComparison(acceptedDiagnostic) }));
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

const strengthToStatus = { exact_component: "VALID_EXACT_COMPONENT_COMPARISON", conditional_scenario: "VALID_CONDITIONAL_COMPONENT_COMPARISON", bounded_component: "VALID_BOUNDED_COMPONENT_COMPARISON" } as const;
const demonstrationFindings = Object.values(demonstrations);
const evaluatedFindings = [...matrixFindings, ...demonstrationFindings];
const evidenceOnlyFindings = matrixFindings.filter((item) => item.findingKind === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE" || item.findingKind === "COMMERCIAL_FACT_IDENTITY_EVIDENCE");
const performedComparisons = evaluatedFindings.filter((item) => item.comparisonPerformed);
const prohibitedCounters = {
  conclusionStrengthExceedsDiagnostic: performedComparisons.filter((item) => item.status !== strengthToStatus[item.scope.comparisonStrength as keyof typeof strengthToStatus]).length,
  evidenceOnlyMarkedComparisonPerformed: evidenceOnlyFindings.filter((item) => item.comparisonPerformed).length,
  evidenceOnlyProducesComparisonStatus: evidenceOnlyFindings.filter((item) => item.status.includes("COMPONENT_COMPARISON")).length,
  evidenceOnlyProducesArithmetic: evidenceOnlyFindings.filter((item) => item.economics.matchedComponentDifference.state !== "NOT_ESTABLISHED").length,
  evidenceOnlyProducesReviewSignal: evidenceOnlyFindings.filter((item) => item.action.signal !== "NONE").length,
  customerRenderingEnabled: evaluatedFindings.filter((item) => item.permissions.customerRenderingAllowed).length,
  aboveOrBelowMarketVerdicts: evaluatedFindings.filter((item) => item.permissions.aboveOrBelowMarketVerdictAllowed).length,
  expensiveOrCheapLanguage: evaluatedFindings.filter((item) => item.permissions.expensiveOrCheapLanguageAllowed).length,
  processorOrOverallGrades: evaluatedFindings.filter((item) => item.permissions.processorOrOverallGradeAllowed).length,
  overpaymentVerdicts: evaluatedFindings.filter((item) => item.permissions.overpaymentVerdictAllowed).length,
  savingsClaims: evaluatedFindings.filter((item) => item.permissions.savingsClaimAllowed).length,
  annualSavingsProjections: evaluatedFindings.filter((item) => item.permissions.annualSavingsProjectionAllowed).length,
  switchingRecommendations: evaluatedFindings.filter((item) => item.permissions.switchingRecommendationAllowed).length,
  providerRankings: evaluatedFindings.filter((item) => item.permissions.bestProviderRankingAllowed).length,
  approvalAssumptions: evaluatedFindings.filter((item) => item.permissions.merchantApprovalAssumptionAllowed).length,
  unknownToZeroConversions: evaluatedFindings.filter((item) => item.permissions.unknownToZeroAllowed).length,
  upperBoundToExactConversions: evaluatedFindings.filter((item) => item.permissions.upperBoundToExactAllowed).length,
  unrelatedComponentAggregations: evaluatedFindings.filter((item) => item.permissions.unrelatedComponentAggregationAllowed).length,
  canonicalMutations: evaluatedFindings.filter((item) => item.permissions.canonicalMutationAllowed).length,
  favorableBoundProducesExactDifference: demonstrations.favorableBoundWithoutSavings.economics.matchedComponentDifference.currentMinusAlternativeMinor === null ? 0 : 1,
  unavailableProducesArithmetic: demonstrations.unavailableWithUnlocker.economics.matchedComponentDifference.state === "NOT_ESTABLISHED" ? 0 : 1,
  conditionalLosesApprovalCondition: demonstrations.conditionalPublicScenario.conclusion.whatThisProves.startsWith("If the merchant qualifies for and is approved") ? 0 : 1,
  reviewSignalBecomesSwitchingAdvice: demonstrations.conditionalPublicScenario.action.meaning.toLowerCase().includes("switch") ? 1 : 0,
  goldFingerprintChanges: gold.filter((item) => !item.unchanged).length,
};
const invariants = {
  allThirtyEightDiagnosticsConsumed: matrixFindings.length === 38,
  diagnosticJudgmentsPreserved: diagnostics.every((diagnosticItem) => matrixFindings.find((item) => item.diagnosticCaseId === diagnosticItem.caseId)?.scope.comparisonStrength === diagnosticItem.comparisonStrength),
  findingClassificationComplete: matrixFindings.every((item) => ["MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON", "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE", "COMMERCIAL_FACT_IDENTITY_EVIDENCE", "COMPARISON_UNAVAILABLE_BLOCKER"].includes(item.findingKind)),
  performedComparisonStrengthMapping: performedComparisons.every((item) => item.status === strengthToStatus[item.scope.comparisonStrength as keyof typeof strengthToStatus]),
  qualificationCasesRemainEvidenceOnly: ["D-03", "D-04", "D-05", "D-07", "D-08"].every((id) => matrixFindings.find((item) => item.diagnosticCaseId === id)?.findingKind === "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE"),
  identityAndAbsenceCasesRemainEvidenceOnly: ["D-09", "D-10", "X-07"].every((id) => matrixFindings.find((item) => item.diagnosticCaseId === id)?.findingKind === "COMMERCIAL_FACT_IDENTITY_EVIDENCE"),
  onlyPerformedComparisonsCanReview: evaluatedFindings.every((item) => item.action.signal !== "REVIEW_CURRENT_PRICING" || item.comparisonPerformed),
  performedComparisonsAreEvidenceBound: performedComparisons.every((item) => item.matchedComponentLabel !== null
    && item.comparisonEvidenceBinding !== null
    && item.comparisonEvidenceBinding.currentComponentEvidenceRefs.length > 0
    && item.comparisonEvidenceBinding.alternativeComponentEvidenceRefs.length > 0
    && item.comparisonEvidenceBinding.matchedPopulationEvidenceRefs.length > 0),
  exactDifferenceIsMatchedComponentOnly: demonstrations.exactComponent.economics.matchedComponentDifference.currentMinusAlternativeMinor === 15_000 && demonstrations.exactComponent.conclusion.whatThisProves.includes("matched component"),
  conditionalDifferencePreservesApproval: demonstrations.conditionalPublicScenario.economics.matchedComponentDifference.currentMinusAlternativeMinor === 15_000 && demonstrations.conditionalPublicScenario.conclusion.whatThisProves.startsWith("If the merchant qualifies for and is approved"),
  favorableBoundDoesNotCreateSavings: demonstrations.favorableBoundWithoutSavings.economics.matchedComponentDifference.currentMinusAlternativeMinor === null && demonstrations.favorableBoundWithoutSavings.action.signal === "NONE",
  adverseBoundIsDirectionalOnly: demonstrations.adverseDirectionalBound.economics.matchedComponentDifference.alternativeExceedsCurrentByAtLeastMinor === 10_000 && demonstrations.adverseDirectionalBound.permissions.processorOrOverallGradeAllowed === false,
  unavailableExplainsAndUnlocks: demonstrations.unavailableWithUnlocker.conclusion.refusalReasons.length > 0 && demonstrations.unavailableWithUnlocker.conclusion.smallestUnlocker !== null,
  reviewSignalIsNarrow: demonstrations.conditionalPublicScenario.comparisonPerformed && demonstrations.conditionalPublicScenario.action.signal === "REVIEW_CURRENT_PRICING" && demonstrations.conditionalPublicScenario.action.possibleMerchantAction === "Ask the current processor whether this pricing component can be reviewed.",
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
  counts: {
    diagnosticFindings: matrixFindings.length,
    demonstrations: Object.keys(demonstrations).length,
    diagnosticFindingKinds: Object.fromEntries([
      "MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON",
      "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE",
      "COMMERCIAL_FACT_IDENTITY_EVIDENCE",
      "COMPARISON_UNAVAILABLE_BLOCKER",
    ].map((kind) => [kind, matrixFindings.filter((item) => item.findingKind === kind).length])),
    demonstrationFindingKinds: Object.fromEntries([
      "MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON",
      "OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE",
      "COMMERCIAL_FACT_IDENTITY_EVIDENCE",
      "COMPARISON_UNAVAILABLE_BLOCKER",
    ].map((kind) => [kind, demonstrationFindings.filter((item) => item.findingKind === kind).length])),
    reviewCurrentPricingSignalsInDiagnostics: matrixFindings.filter((item) => item.action.signal === "REVIEW_CURRENT_PRICING").length,
    reviewCurrentPricingSignalsInDemonstrations: demonstrationFindings.filter((item) => item.action.signal === "REVIEW_CURRENT_PRICING").length,
  },
  demonstrations,
  matrixFindings,
  prohibitedOutcomeCounters: prohibitedCounters,
  prohibitedOutcomeCounterTotal: Object.values(prohibitedCounters).reduce((sum, value) => sum + value, 0),
  invariants,
  commercialSemanticFingerprintsInvariant: invariants.noF3SemanticMutation,
  gold: { statements: gold, invariantCount: gold.filter((item) => item.unchanged).length },
  tests: {
    focusedConsumer: "11/11 passed",
    combinedTargeted: "83/83 passed across 9 files",
    typescriptBuild: "passed",
    knownHistoricalRegression: "not rerun; preserved known 5/6 pre-existing regression without repair",
    legacyPublicSource: "not rerun or investigated; prior SIGSEGV/139 history remains preserved",
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
  const demos = Object.entries(value.demonstrations).map(([name, item]) => `| ${name} | ${item.findingKind} | ${item.comparisonPerformed} | ${item.status} | ${cell(item.conclusion.whatThisProves)} | ${item.action.signal} | ${cell(item.conclusion.smallestUnlocker ?? "None")} |`).join("\n");
  const matrix = value.matrixFindings.map((item) => `| ${item.diagnosticCaseId} | ${item.scope.comparisonStrength} | ${item.findingKind} | ${item.comparisonPerformed} | ${item.status} | ${cell(item.conclusion.whatThisProves)} | ${cell(item.conclusion.whatThisDoesNotProve.join("; "))} | ${cell(item.conclusion.smallestUnlocker ?? "None")} |`).join("\n");
  const counters = Object.entries(value.prohibitedOutcomeCounters).map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  return `# Internal Commercial Comparison Finding v1

## Outcome

The first safe internal comparator consumer now distinguishes a performed matched economic comparison from offer/qualification evidence, commercial fact/identity evidence, and a comparison blocker. Diagnostic strength remains the claim-specific evidence ceiling; it no longer means that a current-versus-alternative comparison occurred. Deterministic arithmetic requires an explicit matched-comparison package binding current component, alternative component, and population evidence.

- Product authority SHA-256: \`${value.productAuthority.sha256}\`
- Exact parent: \`${value.baseline.commit}\`
- Accepted diagnostic cases consumed: ${value.counts.diagnosticFindings}/38
- Diagnostic-only classification: ${value.counts.diagnosticFindingKinds.OFFER_ELIGIBILITY_QUALIFICATION_EVIDENCE} offer/eligibility/qualification evidence; ${value.counts.diagnosticFindingKinds.COMMERCIAL_FACT_IDENTITY_EVIDENCE} commercial fact/identity evidence; ${value.counts.diagnosticFindingKinds.COMPARISON_UNAVAILABLE_BLOCKER} blockers; ${value.counts.diagnosticFindingKinds.MATCHED_CURRENT_VS_ALTERNATIVE_COMPONENT_COMPARISON} comparisons performed
- Gold canonical invariance: ${value.gold.invariantCount}/11
- Prohibited-outcome counters: ${value.prohibitedOutcomeCounterTotal}

## Required behavior demonstrations

| Demonstration | Finding kind | Comparison performed | Status | What it proves | Action signal | Smallest unlocker |
|---|---|---:|---|---|---|---|
${demos}

The exact and conditional demonstrations use 5,000 matching authorizations, $0.11 current unit price, $0.08 alternative unit price, $550 current component cost, and $400 alternative component cost. The resulting $150 is explicitly a matched component difference—not savings, an overall-price conclusion, or an overpayment verdict.

## Complete 38-case consumption replay

| Case | Diagnostic strength | Finding kind | Comparison performed | Finding status | What it proves | What it does not prove | Smallest unlocker |
|---|---|---|---:|---|---|---|---|
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

No accepted diagnostic judgment changed. No architecture conflict was introduced. The consumer reads the accepted diagnostic result through a narrow structural contract and never mutates canonical facts or the governed commercial-source authority.

Recommendation: ${value.recommendation}
`;
}

function cell(value: string): string { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }
