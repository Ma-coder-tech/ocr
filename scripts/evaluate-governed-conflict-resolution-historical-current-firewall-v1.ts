import { mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT = "evaluations/governed-conflict-resolution-historical-current-firewall-v1/evaluation-2026-09-09.json";
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };
const FIXTURES: Array<{ file: string; businessType: BusinessTypeId }> = [
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

type Evaluated = { file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; conflicts: Array<{ feeRowId: string; conflicts: unknown[] }>; warrantedResearchRows: number };
const corpus: Evaluated[] = [];
const changedFingerprints: string[] = [];

for (const fixture of FIXTURES) {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`test/fixtures/pdfs/${fixture.file}`), { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  const conflicts = report.researchQueue.stage0Decisions
    .filter((decision) => decision.calibration.stage0.governedConflicts.length > 0)
    .map((decision) => ({ feeRowId: decision.feeRowId, conflicts: decision.calibration.stage0.governedConflicts }));
  if (before !== report.canonicalFinancialTruth.afterFingerprint || before !== canonicalFinancialTruthFingerprint(analysis) || !report.canonicalFinancialTruth.unchanged) changedFingerprints.push(fixture.file);
  corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), conflicts, warrantedResearchRows: report.researchQueue.stage0Decisions.filter((decision) => decision.calibration.stage0.researchWarranted).length });
}

const rows = corpus.flatMap((entry) => entry.findings.map((finding) => ({
  file: entry.file,
  label: entry.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "",
  finding,
})));
const amex = rows.filter((row) => row.label === "AMEXCT043 - PROGRAM FEES");
const mastercardAssessment = rows.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.matchedRecordIds.includes("CUR26-UNR-MC-ASSESSMENT"));
const location = rows.filter((row) => /MASTERCARD.*LOCATION FEE/i.test(row.label));
const discover = rows.filter((row) => /DISCOVER - NETWORK AUTHORIZATION FEE/i.test(row.label));
const baseII = rows.filter((row) => /VI BASE II SYSTEM FILE FEE/i.test(row.label));
const evaluation = {
  schemaVersion: "governed_conflict_resolution_historical_current_firewall_2026_09_09_v1",
  baseline: { branch: "codex/governed-conflict-diagnostic-v1", commit: "25b2be2e79963a3e5c6b9218d99c45b41432a4f5", governedConflictCount: 18 },
  corpus: {
    statements: corpus.length,
    materialFindings: rows.length,
    governedConflictsBefore: 18,
    governedConflictsAfter: corpus.reduce((total, entry) => total + entry.conflicts.reduce((count, row) => count + row.conflicts.length, 0), 0),
    conflictRowsAfter: corpus.flatMap((entry) => entry.conflicts.map((conflict) => ({ file: entry.file, ...conflict }))),
    resolvedByFamily: { mastercardAssessment: mastercardAssessment.length, mastercardLocationFee: location.length, amexProgramFees: amex.length, discoverNetworkAuthorization: discover.length, visaBaseII: baseII.length },
    warrantedResearchRows: corpus.reduce((total, entry) => total + entry.warrantedResearchRows, 0),
  },
  outcomes: {
    amexProgramFees: amex.map(project),
    mastercardAssessment: mastercardAssessment.map(project),
    discoverNetworkAuthorization: discover.map(project),
    visaBaseII: baseII.map(project),
    mastercardLocationFee: location.map(project),
  },
  intentionallyUnresolved: {
    current2026MastercardAssessmentRows: mastercardAssessment.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.state === "CURRENT_RATE_UNRESOLVED").length,
    current2026VisaBaseIITransmissionRows: baseII.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.state === "CURRENT_RATE_UNRESOLVED").length,
    amexProcessorUpliftOrRetention: "not_established_or_excluded",
    mastercard2024SmallAcquiringSideUplift: "not_fully_excluded_without_acquirer_specific_period_evidence",
    discoverRejected025Origin: "unresolved",
  },
  effects: {
    amexRowsMovedFromGenericInterchangeProjectionToNetworkProgramCost: amex.length,
    amexRowsWithNetworkRenderingPermission: amex.filter((row) => row.finding.openWorldDeterminants?.renderingPermissions.networkOwnershipLanguageAllowed).length,
    historicalRowsReopenedByCurrentEvidence: rows.filter((row) => row.finding.current2026UsCoreNetworkReference?.reference.conflicts.length).length,
    currentUncertaintyRetainedSeparately: mastercardAssessment.length + baseII.length,
    newConflictsIntroduced: corpus.reduce((total, entry) => total + entry.conflicts.length, 0),
  },
  invariants: {
    canonicalFinancialFingerprintChangedStatements: changedFingerprints,
    canonicalFinancialFingerprintsUnchanged: changedFingerprints.length === 0,
    canonicalMutationAllowed: false,
    aiOrWebResearchExecuted: false,
    sourceFactsRewritten: false,
  },
};

await mkdir(OUTPUT.slice(0, OUTPUT.lastIndexOf("/")), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: OUTPUT,
  statements: evaluation.corpus.statements,
  materialFindings: evaluation.corpus.materialFindings,
  governedConflictsBefore: evaluation.corpus.governedConflictsBefore,
  governedConflictsAfter: evaluation.corpus.governedConflictsAfter,
  resolvedByFamily: evaluation.corpus.resolvedByFamily,
  currentUncertaintyRetainedSeparately: evaluation.effects.currentUncertaintyRetainedSeparately,
  canonicalFinancialFingerprintsUnchanged: evaluation.invariants.canonicalFinancialFingerprintsUnchanged,
}, null, 2));

function project(row: { file: string; label: string; finding: InternalAnalystFinding }) {
  const finding = row.finding;
  return {
    file: row.file,
    feeRowId: finding.sourceFeeRowId,
    printedLabel: row.label,
    exactIdentity: finding.exactFeeIdentity.value,
    broaderCategory: finding.broaderEconomicCategory.value,
    participantRoles: {
      collector: finding.collector.value,
      economicBeneficiary: finding.economicBeneficiary.value,
      ruleSetter: finding.ruleSetter.value,
      underlyingPriceSetter: finding.priceSetter.value,
      merchantFacingPriceController: finding.merchantFacingPriceController.value,
    },
    determinant: finding.openWorldDeterminants ? {
      family: finding.openWorldDeterminants.family.value,
      economicLayer: finding.openWorldDeterminants.d1EconomicLayerAndControl.economicLayer.value,
      mechanic: finding.openWorldDeterminants.d2MechanicAndPopulation.mechanic.value,
      population: finding.openWorldDeterminants.d2MechanicAndPopulation.population.value,
      actionClass: finding.openWorldDeterminants.d4Actionability.actionClass,
      researchDisposition: finding.openWorldDeterminants.research.disposition,
      renderingPermissions: finding.openWorldDeterminants.renderingPermissions,
    } : null,
    currentReference: finding.current2026UsCoreNetworkReference ? {
      historicalApplication: finding.current2026UsCoreNetworkReference.historicalApplication,
      statementPeriodState: finding.current2026UsCoreNetworkReference.reference.state,
      statementPeriodValues: finding.current2026UsCoreNetworkReference.reference.values,
      historicalValues: finding.current2026UsCoreNetworkReference.reference.historicalValues,
      statementPeriodConflicts: finding.current2026UsCoreNetworkReference.reference.conflicts,
      maintenanceState: finding.current2026UsCoreNetworkReference.currentReferenceMaintenance.state,
      maintenanceCandidates: finding.current2026UsCoreNetworkReference.currentReferenceMaintenance.candidateValues,
      rejectedCandidates: finding.current2026UsCoreNetworkReference.currentReferenceMaintenance.rejectedCandidates,
      cardinality: finding.current2026UsCoreNetworkReference.lineToFeeCardinality,
      research: finding.current2026UsCoreNetworkReference.research,
    } : null,
    focusedMastercard: finding.mastercardFocusedEvidence ? {
      assessment2024: finding.mastercardFocusedEvidence.assessment2024,
      locationMccAdjudication: finding.mastercardFocusedEvidence.locationMccAdjudication,
      sourceConflicts: finding.mastercardFocusedEvidence.effectiveUsNetworkEvidence.sourceConflicts,
      comparison: finding.mastercardFocusedEvidence.effectiveUsNetworkEvidence.comparison,
    } : null,
  };
}
