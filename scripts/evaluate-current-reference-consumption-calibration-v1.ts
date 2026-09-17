import { mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { consumeCurrentReferenceV1 } from "../src/canonical/currentReferenceConsumptionV1.js";
import { governedCurrent2026FingerprintV1, governedCurrent2026ReferenceRecordsV1, governedCurrent2026RulesV1 } from "../src/canonical/governedCurrent2026UsCoreNetworkReferenceV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf } from "../src/parser.js";
import { SYNTHETIC_CURRENT_REFERENCE_FIXTURES } from "../test/canonical/fixtures/currentReferenceConsumptionSyntheticFixtures.js";

const OUTPUT = "evaluations/current-reference-consumption-calibration-v1/evaluation-2026-09-09.json";
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

const synthetic = SYNTHETIC_CURRENT_REFERENCE_FIXTURES.map((fixture) => ({ ...fixture, result: consumeCurrentReferenceV1(fixture.input) }));
const incorrect = synthetic.filter((item) => item.result.selectedReference.value !== item.expected.selectedValue || item.result.selectedReference.state !== item.expected.selectionState || item.result.comparison.state !== item.expected.comparisonState || item.result.cardinality.state !== item.expected.cardinality);
const gold: Array<{ file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; before: string; after: string }> = [];

for (const fixture of GOLD) {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`test/fixtures/pdfs/${fixture.file}`), { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  gold.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), before, after: canonicalFinancialTruthFingerprint(analysis) });
}

const goldRows = gold.flatMap((entry) => entry.findings.map((finding) => ({
  file: entry.file,
  label: entry.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "",
  finding,
})));
const baseIIHistorical = goldRows.filter((row) => /VI BASE II SYSTEM FILE FEE/i.test(row.label));
const mastercardHistorical = goldRows.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.matchedRecordIds.includes("CUR26-WRK-MC-ABVF-BASE"));
const historicalRegressions = [
  ...baseIIHistorical.filter((row) => row.finding.current2026UsCoreNetworkReference?.historicalApplication !== "HISTORICAL_VALUE_PRESERVED_BEFORE_CHANGE" || !row.finding.current2026UsCoreNetworkReference.reference.historicalValues.some((value) => value.value === 0.0018)),
  ...mastercardHistorical.filter((row) => row.finding.current2026UsCoreNetworkReference?.reference.state === "CURRENT_WORKING_REFERENCE_STRONG" || row.finding.current2026UsCoreNetworkReference?.reference.conflicts.length),
];
const candidateLeaks = synthetic.filter((item) => item.result.selectedReference.value === 0.0027 || item.result.rendering.candidateAsFactAllowed);
const selected = synthetic.filter((item) => item.result.selectedReference.state === "selected");
const failClosed = synthetic.filter((item) => item.result.selectedReference.state === "blocked_missing_scope" || item.result.selectedReference.state === "current_reference_unresolved");

const evaluation = {
  schemaVersion: "current_reference_consumption_calibration_2026_09_09_v1",
  baseline: { branch: "codex/current-reference-maintenance-adjudication-v1", commit: "01a99b6e03433402880ed45c83c13607a2587768" },
  scope: { validationOnly: true, syntheticFixturesAreEvidence: false, syntheticFixturesAreReusableKnowledge: false, catalogExpanded: false, aiOrWebResearchExecuted: false },
  governedKnowledgeControl: { recordCount: governedCurrent2026ReferenceRecordsV1().length, ruleCount: governedCurrent2026RulesV1().length, fingerprint: governedCurrent2026FingerprintV1(), newCatalogEntries: 0, newDomainClaims: 0 },
  metrics: {
    syntheticFixtures: synthetic.length,
    branchCoverage: [...new Set(synthetic.map((item) => item.branch))].sort(),
    branchCoverageCount: new Set(synthetic.map((item) => item.branch)).size,
    correctReferenceSelections: selected.length,
    failClosedSelections: failClosed.length,
    incorrectReferenceSelections: incorrect.length,
    candidateAsFactLeaks: candidateLeaks.length,
    historicalFirewallRegressions: historicalRegressions.length,
    canonicalFingerprintChangesOnGold: gold.filter((entry) => entry.before !== entry.after).length,
  },
  results: synthetic.map((item) => ({ fixtureId: item.fixtureId, syntheticOnly: item.syntheticOnly, evidenceAuthority: item.evidenceAuthority, reusableKnowledgeAuthority: item.reusableKnowledgeAuthority, branch: item.branch, input: item.input, expected: item.expected, result: item.result })),
  controls: {
    mastercard: {
      debitAbove1000: project("mc_debit_above_1000"),
      qualifyingLargeTicket: project("mc_consumer_credit_at_threshold"),
      belowThreshold: project("mc_commercial_below_threshold"),
      missingScope: project("mc_aggregate_missing_scope"),
      alfBranchA: project("mc_alf_branch_a_base_only"),
      alfBranchB: project("mc_alf_branch_b_likely_bundled"),
      alfBranchC: project("mc_alf_branch_c_separate_line"),
    },
    visaBaseII: {
      transmission: project("visa_base_ii_transmission_current"),
      networkAccess: project("visa_base_ii_network_access_current"),
      genericComposite: project("visa_base_ii_generic_composite"),
    },
  },
  historicalControls: {
    goldStatements: gold.length,
    baseII: baseIIHistorical.map((row) => projectGold(row)),
    mastercard: mastercardHistorical.map((row) => projectGold(row)),
    wellsSeptember2024Preserved: mastercardHistorical.some((row) => row.file.includes("WELLS_FARGO") && row.finding.mastercardFocusedEvidence?.assessment2024?.confirmedAtPar === false && row.finding.mastercardFocusedEvidence?.assessment2024?.acquiringSideUpliftExcluded === false),
    regressions: historicalRegressions.map((row) => ({ file: row.file, label: row.label, feeRowId: row.finding.sourceFeeRowId })),
  },
  rendering: {
    officialParLanguageAllowedFixtures: synthetic.filter((item) => item.result.rendering.officialParLanguageAllowed).length,
    candidateAsFactAllowedFixtures: synthetic.filter((item) => item.result.rendering.candidateAsFactAllowed).length,
    markupLanguageAllowedFixtures: synthetic.filter((item) => item.result.rendering.processorMarkupLanguageAllowed).length,
    retentionLanguageAllowedFixtures: synthetic.filter((item) => item.result.rendering.processorRetentionLanguageAllowed).length,
    contractLanguageAllowedFixtures: synthetic.filter((item) => item.result.rendering.contractComplianceLanguageAllowed).length,
    negotiationLanguageAllowedFixtures: synthetic.filter((item) => item.result.rendering.negotiationLanguageAllowed).length,
    customerReportAuthorityFixtures: synthetic.filter((item) => item.result.rendering.customerReportAuthority !== "none").length,
  },
  defects: [{
    defect: "The adjudicated large-ticket value existed as first-class knowledge, but the shared assessment-cardinality consumer accepted only 0.13% or 0.14% as an applicable reference and had no unified claim-constrained rendering consumer.",
    correction: "Allow the already-adjudicated 0.15% scoped ABVF result as the applicable cardinality reference and add one bounded downstream consumer that uses existing governed resolution, scope selection, cardinality, candidate, and rendering permissions.",
    newDomainClaimAdded: false,
  }],
  invariants: {
    incorrectReferenceSelections: incorrect.map((item) => item.fixtureId),
    candidateAsFactLeaks: candidateLeaks.map((item) => item.fixtureId),
    historicalFirewallRegressions: historicalRegressions.length,
    canonicalFingerprintChangedFiles: gold.filter((entry) => entry.before !== entry.after).map((entry) => entry.file),
    canonicalMutationAllowed: false,
    reusableKnowledgeSelfAdmitted: false,
    aiOrWebResearchExecuted: false,
  },
};

await mkdir(OUTPUT.slice(0, OUTPUT.lastIndexOf("/")), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT, metrics: evaluation.metrics, rendering: evaluation.rendering, invariants: evaluation.invariants }, null, 2));

function project(fixtureId: string) {
  const item = synthetic.find((candidate) => candidate.fixtureId === fixtureId);
  if (!item) throw new Error(`missing synthetic fixture ${fixtureId}`);
  return { input: item.input, selectedReference: item.result.selectedReference, scopeSelection: item.result.scopeSelection, cardinality: item.result.cardinality, comparison: item.result.comparison, candidateEvidence: item.result.candidateEvidence, identity: item.result.identity, rendering: item.result.rendering, limitations: item.result.limitations };
}

function projectGold(row: { file: string; label: string; finding: InternalAnalystFinding }) {
  return { file: row.file, feeRowId: row.finding.sourceFeeRowId, label: row.label, statementPeriodState: row.finding.current2026UsCoreNetworkReference?.reference.state, historicalApplication: row.finding.current2026UsCoreNetworkReference?.historicalApplication, historicalValues: row.finding.current2026UsCoreNetworkReference?.reference.historicalValues, maintenanceState: row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.state, maintenanceValues: row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.values };
}
