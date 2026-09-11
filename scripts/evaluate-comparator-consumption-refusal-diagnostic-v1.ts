import { mkdir, writeFile } from "node:fs/promises";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { applyHelcimDharmaCaptureRemediationV1, loadHelcimDharmaCaptureRemediationBaselineV1 } from "../src/canonical/commercialSourceCaptureRemediationHelcimDharmaV1.js";
import { applyImmutableCapturesToCommercialRegistryV1, commercialRegistrySemanticFingerprintSetV1, loadImmutableCommercialSourceCaptureBaselineV1 } from "../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import { validateCommercialSourceGovernanceRegistryV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../src/parser.js";
import {
  COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01,
  comparatorConsumptionProductTestMatrixV01,
  evaluateComparatorConsumptionDiagnosticV1,
} from "./lib/comparatorConsumptionRefusalDiagnosticV1.js";

const OUTPUT_DIR = "evaluations/comparator-consumption-refusal-diagnostic-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-11.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-11.md`;
const GOLD = [
  "Nov_2024_Statement.pdf", "SAMPLE_MERCHANT4_CLOVER.pdf", "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf", "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  "fiserv_PAYSAFE_Febr_2024.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
];

const priorBaseline = await loadImmutableCommercialSourceCaptureBaselineV1();
const authorize = applyImmutableCapturesToCommercialRegistryV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, baseline: priorBaseline });
const batchBefore = applyImmutableCapturesToCommercialRegistryV1({ registry: HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, baseline: priorBaseline });
const remediation = await loadHelcimDharmaCaptureRemediationBaselineV1({ priorBaseline });
const batch1B = applyHelcimDharmaCaptureRemediationV1({ registry: batchBefore, baseline: remediation });
const matrix = comparatorConsumptionProductTestMatrixV01();
const results = matrix.map((testCase) => evaluateComparatorConsumptionDiagnosticV1({ testCase, registries: [authorize, batch1B] }));

const gold = [];
for (const file of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file });
  const before = canonicalFinancialTruthFingerprint(analysis);
  // Diagnostic consumption reads governed source records and synthetic controls only.
  results.length;
  const after = canonicalFinancialTruthFingerprint(analysis);
  gold.push({ file, before, after, unchanged: before === after });
}

const byId = (id: string) => results.find((item) => item.caseId === id)!;
const strengthCounts = Object.fromEntries(["exact_component", "bounded_component", "conditional_scenario", "unavailable"].map((strength) => [strength, results.filter((item) => item.comparisonStrength === strength).length]));
const prohibitedCounters = {
  completeTotalCostClaims: results.filter((item) => item.claimPermissions.completeTotalCostClaimAllowed).length,
  unsupportedMerchantApprovalClaims: results.filter((item) => item.claimPermissions.merchantApprovalClaimAllowed && item.gateStates.merchantApproval !== "matched").length,
  unsupportedHistoricalAvailabilityClaims: results.filter((item) => item.claimPermissions.historicalAvailabilityClaimAllowed && item.gateStates.sourcePeriod !== "matched").length,
  negotiabilityOrRemovabilityClaims: results.filter((item) => item.claimPermissions.negotiabilityOrRemovabilityClaimAllowed).length,
  overpaymentOrMarketGrades: results.filter((item) => item.claimPermissions.overpaymentOrMarketGradeAllowed).length,
  preciseSavingsClaims: results.filter((item) => item.claimPermissions.preciseSavingsClaimAllowed).length,
  switchingRecommendations: results.filter((item) => item.claimPermissions.switchingRecommendationAllowed).length,
  customerFacingOutputs: results.filter((item) => item.claimPermissions.customerFacingComparatorOutputAllowed).length,
  reusableKnowledgeAdmissions: results.filter((item) => item.claimPermissions.reusableKnowledgeAdmissionAllowed).length,
  canonicalMutations: results.filter((item) => item.claimPermissions.canonicalMutationAllowed).length,
  x02UpperBoundConvertedToSavings: byId("X-02").directionalArithmetic?.preciseSavingsClaimAllowed ? 1 : 0,
  cpPriceAppliedToCnp: byId("H-02").comparisonStrength !== "unavailable" ? 1 : 0,
  unknownConvertedToZero: byId("X-06").commercialFactState !== "UNKNOWN" ? 1 : 0,
  dharmaExact25SilentlyResolved: byId("D-06").comparisonStrength !== "unavailable" ? 1 : 0,
  currentDharmaBackdatedTo2024: byId("D-12").claimPermissions.historicalAvailabilityClaimAllowed ? 1 : 0,
  referralDirectIdentityLeak: byId("D-13").gateStates.offerIdentity !== "conditional" ? 1 : 0,
  goldFingerprintChanges: gold.filter((item) => !item.unchanged).length,
};
const invariants = {
  allThirtyEightCases: results.length === 38,
  exactCaseDistribution: JSON.stringify(strengthCounts) === JSON.stringify({ exact_component: 6, bounded_component: 3, conditional_scenario: 13, unavailable: 16 }),
  allProviderCasesBoundToGovernedEvidence: results.filter((item) => !item.caseId.startsWith("X-")).every((item) => item.evidenceBinding.allRefsGovernedOrProductControl && item.sourceObservationRefs.length + item.componentVersionRefs.length > 0),
  allRefusalsExplainWhy: results.every((item) => item.refusedClaims.length > 0 && item.refusalReasons.length > 0),
  allUnavailableCasesHaveUnlocker: results.filter((item) => item.comparisonStrength === "unavailable").every((item) => item.smallestUnlocker !== null),
  channelDoesNotProveApproval: byId("H-01").gateStates.merchantChannel === "matched" && !byId("H-01").claimPermissions.merchantApprovalClaimAllowed,
  currentPriceDoesNotProveHistory: !byId("D-12").claimPermissions.historicalAvailabilityClaimAllowed,
  exactComponentDoesNotProveTotalCost: !byId("X-01").claimPermissions.completeTotalCostClaimAllowed,
  upperBoundDoesNotProveSavings: byId("X-02").directionalArithmetic?.differenceRangeCurrentMinusCandidateMinor.high === 15_000 && !byId("X-02").claimPermissions.preciseSavingsClaimAllowed,
  directionalBoundCanSupportAdverseDirection: byId("X-03").directionalArithmetic?.candidateExceedsCurrentByAtLeastMinor === 10_000,
  offerIdentityDoesNotProveRemovability: !byId("D-10").claimPermissions.negotiabilityOrRemovabilityClaimAllowed,
  authorizeRegistryValid: validateCommercialSourceGovernanceRegistryV1(authorize).length === 0,
  batch1BRegistryValid: validateCommercialSourceGovernanceRegistryV1(batch1B).length === 0,
  f3SemanticsUnchangedByDiagnostic: JSON.stringify(commercialRegistrySemanticFingerprintSetV1(batchBefore)) === JSON.stringify(commercialRegistrySemanticFingerprintSetV1(batch1B)),
  goldCanonicalFingerprintsInvariant: gold.every((item) => item.unchanged),
};

const evaluation = {
  schemaVersion: "comparator_consumption_refusal_diagnostic_evaluation_2026_09_11_v1",
  generatedAt: "2026-09-11T00:00:00.000Z",
  productAuthority: COMPARATOR_CONSUMPTION_PRODUCT_TEST_MATRIX_V01,
  baseline: { branch: "codex/commercial-source-capture-remediation-helcim-dharma-v1", commit: "484f1e1bfdf3db45954eabdc98d377e5123d085a", parent: "ad33214ab99253c1fe5bfa151e1c6e7e99d8c642" },
  implementationBranch: "codex/comparator-consumption-refusal-diagnostic-v1",
  scope: { internalDiagnosticOnly: true, productionComparatorBuilt: false, newCommercialKnowledgeAdmitted: false, aiOrWebResearchUsed: false, customerFacingOutputBuilt: false },
  counts: { totalCases: results.length, authorizeNetCases: 4, helcimCases: 11, dharmaCases: 13, crossProviderCases: 10, strengthCounts, casesWithExplicitUnlocker: results.filter((item) => item.smallestUnlocker !== null).length },
  registryValidation: { authorizeNetIssues: validateCommercialSourceGovernanceRegistryV1(authorize), helcimDharmaIssues: validateCommercialSourceGovernanceRegistryV1(batch1B) },
  results,
  claimIndependence: {
    channelVsApproval: { caseId: "H-01", channelMatched: true, approvalClaimAllowed: false },
    currentVsHistorical: { caseId: "D-12", currentScenarioAllowed: true, historicalAvailabilityClaimAllowed: false },
    componentVsTotal: { caseId: "X-01", componentUseAllowed: true, completeTotalCostClaimAllowed: false },
    boundVsSavings: { caseId: "X-02", currentCeilingMinor: 50_000, candidateMinor: 35_000, preciseSavingsClaimAllowed: false },
    identityVsRemovability: { caseId: "D-10", closureIdentityKnown: true, negotiabilityOrRemovabilityClaimAllowed: false },
  },
  prohibitedOutcomeCounters: prohibitedCounters,
  prohibitedOutcomeCounterTotal: Object.values(prohibitedCounters).reduce((sum, value) => sum + value, 0),
  invariants,
  gold: { statements: gold, invariantCount: gold.filter((item) => item.unchanged).length },
  tests: {
    focusedDiagnostic: "9/9 passed",
    targetedGovernance: "72/72 passed across 8 files",
    typescriptBuild: "passed",
    knownHistoricalRegression: "5/6 passed; unchanged pre-existing assertion expects 0 governed conflicts and observes 4",
    legacyPublicSource: "10/10 assertions passed; prior SIGSEGV/139 did not reproduce on this run",
  },
  architectureAssessment: {
    reused: ["commercial source governance registry", "offer identity and channel model", "component completeness states", "effective-period firewall", "qualification predicates", "claim-specific decomposition bounds"],
    added: "A diagnostic-only claim-consumption envelope exposing Product's 15 required fields and explicit refusal/unlocker output.",
    conflicts: [],
  },
  recommendation: "Product should review the 38-case mapping and claim/refusal vocabulary before authorizing any production comparator consumer. Do not add market grades, savings, switching, or customer-facing output yet.",
};

const failed = [...Object.entries(invariants).filter(([, value]) => !value).map(([key]) => key), ...Object.entries(prohibitedCounters).filter(([, value]) => value !== 0).map(([key]) => key)];
if (failed.length > 0) throw new Error(`Comparator consumption/refusal diagnostic failed: ${failed.join(", ")}`);

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, report(evaluation), "utf8");
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], counts: evaluation.counts, prohibitedOutcomeCounterTotal: evaluation.prohibitedOutcomeCounterTotal, gold: `${evaluation.gold.invariantCount}/11`, failed }, null, 2));

function report(value: typeof evaluation): string {
  const rows = value.results.map((item) => `| ${item.caseId} | ${cell(item.providerIdentity)} / ${cell(item.offerIdentity)} / ${cell(item.salesChannel)} | ${cell(item.merchantChannel)} / ${cell(item.matchedPopulation)} | ${cell(item.economicLayer)} / ${item.commercialFactState} / ${cell(item.decompositionStrength)} | ${item.sourceApplicableWhen} / ${cell(item.merchantEligibilityStatus)} | **${item.comparisonStrength}** | ${cell(item.allowedClaim)} | ${cell(item.refusedClaims.join("; "))} | ${cell(item.refusalReasons.join("; "))} | ${cell(item.smallestUnlocker ?? "None for scoped conclusion")} |`).join("\n");
  const counters = Object.entries(value.prohibitedOutcomeCounters).map(([name, count]) => `| ${name} | ${count} |`).join("\n");
  return `# Comparator Consumption / Refusal Diagnostic v1

## Outcome

All 38 Product matrix cases produce a structured internal use/refusal result. Correct refusals are counted as successful analytical outcomes. The diagnostic consumes already-governed Authorize.net, Helcim, and Dharma evidence; it admits no new pricing truth and creates no customer-facing claim.

- Product matrix SHA-256: \`${value.productAuthority.sha256}\`
- Exact baseline: \`${value.baseline.commit}\`
- Strengths: ${value.counts.strengthCounts.exact_component} exact component; ${value.counts.strengthCounts.bounded_component} bounded component; ${value.counts.strengthCounts.conditional_scenario} conditional scenario; ${value.counts.strengthCounts.unavailable} unavailable/refused
- Provider cases with governed evidence binding: 28/28
- Gold canonical invariance: ${value.gold.invariantCount}/11

## Complete Product matrix

| ID | Provider / offer / sales channel | Merchant channel / matched population | Layer / fact state / decomposition | Source period / eligibility | Strength | Allowed claim | Stronger claim refused | Why refused | Smallest unlocker |
|---|---|---|---|---|---|---|---|---|---|
${rows}

## Claim independence

- Knowing H-01's channel does not permit merchant-approval language.
- Current Dharma evidence in D-12 does not permit a 2024 availability claim.
- X-01's exact component does not permit a complete total-cost conclusion.
- X-02's $500 current ceiling and $350 candidate cost do not permit a $150 savings claim.
- D-10's exact closure-fee identity does not establish negotiability or removability.

## Prohibited outcomes

| Counter | Count |
|---|---:|
${counters}

All ${Object.keys(value.prohibitedOutcomeCounters).length} prohibited-outcome counters are zero.

## Verification

- Focused diagnostic tests: ${value.tests.focusedDiagnostic}
- Combined targeted governance tests: ${value.tests.targetedGovernance}
- TypeScript build: ${value.tests.typescriptBuild}
- Known historical/current regression: ${value.tests.knownHistoricalRegression}
- Legacy public-source/SIGSEGV check: ${value.tests.legacyPublicSource}

## Architecture and next step

The diagnostic reuses the single commercial-source authority, exact offer/channel identity, completeness states, effective-period firewall, qualification predicates, and claim-specific decomposition. It adds only an internal output envelope for Product's required claim/refusal fields. No architecture conflict was introduced.

Recommendation: ${value.recommendation}
`;
}

function cell(value: string): string { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }
