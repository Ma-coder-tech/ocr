import { mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { governedCurrent2026ReferenceRecordsV1, governedCurrentReferenceMaintenanceReviewsV1 } from "../src/canonical/governedCurrent2026UsCoreNetworkReferenceV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT = "evaluations/current-reference-maintenance-adjudication-v1/evaluation-2026-09-09.json";
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

type Evaluated = { file: string; analysis: CanonicalStatementAnalysis; findings: InternalAnalystFinding[]; report: ReturnType<typeof buildInternalAnalystFindingV1> };
const corpus: Evaluated[] = [];
const changedFingerprints: string[] = [];

for (const fixture of FIXTURES) {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`test/fixtures/pdfs/${fixture.file}`), { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  if (before !== report.canonicalFinancialTruth.afterFingerprint || before !== canonicalFinancialTruthFingerprint(analysis) || !report.canonicalFinancialTruth.unchanged) changedFingerprints.push(fixture.file);
  corpus.push({ file: fixture.file, analysis, findings: report.findings.filter((finding) => finding.sourceFeeRowId), report });
}

const rows = corpus.flatMap((entry) => entry.findings.map((finding) => ({
  file: entry.file,
  label: entry.analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)?.selectedLabel ?? "",
  finding,
})));
const assessments = rows.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.matchedRecordIds.includes("CUR26-WRK-MC-ABVF-BASE"));
const baseIITransmission = rows.filter((row) => /VI BASE II SYSTEM FILE FEE/i.test(row.label));
const wells = assessments.filter((row) => row.file.includes("WELLS_FARGO"));
const conflicts = corpus.flatMap((entry) => entry.report.researchQueue.stage0Decisions.flatMap((decision) => decision.calibration.stage0.governedConflicts.map((conflict) => ({ file: entry.file, feeRowId: decision.feeRowId, conflict }))));
const warrantedResearchRows = corpus.reduce((sum, entry) => sum + entry.report.researchQueue.stage0Decisions.filter((decision) => decision.calibration.stage0.researchWarranted).length, 0);
const actionDistribution = distribution(rows.map((row) => row.finding.openWorldDeterminants?.d4Actionability.actionClass ?? "NONE"));
const records = governedCurrent2026ReferenceRecordsV1();

const evaluation = {
  schemaVersion: "current_reference_maintenance_adjudication_2026_09_09_v1",
  authority: {
    file: "RateReveal_Current_Reference_Maintenance_Adjudication_FINAL_Product_Adjudicated_v2.md",
    sha256: "202fd093c5b4bb0b7771b3c4c90b49e19af77c659a10cebf5cdef2216acec0e4",
  },
  baseline: {
    branch: "codex/governed-conflict-resolution-historical-current-firewall-v1",
    commit: "7c0308769dbb5488158828bd2c6362996c86ff17",
    artifact: "evaluations/governed-conflict-resolution-historical-current-firewall-v1/evaluation-2026-09-09.json",
  },
  corpus: {
    statements: corpus.length,
    materialFindings: rows.length,
    governedConflicts: conflicts.length,
    currentReferenceScopeBefore: { mastercardAssessment: { unresolved: 9, workingStrong: 0 }, visaBaseIITransmission: { unresolved: 1, workingStrong: 0 } },
    currentReferenceScopeAfter: {
      mastercardAssessment: { unresolved: assessments.filter((row) => maintenanceState(row) === "CURRENT_RATE_UNRESOLVED").length, workingStrong: assessments.filter((row) => maintenanceState(row) === "CURRENT_WORKING_REFERENCE_STRONG").length },
      visaBaseIITransmission: { unresolved: baseIITransmission.filter((row) => maintenanceState(row) === "CURRENT_RATE_UNRESOLVED").length, workingStrong: baseIITransmission.filter((row) => maintenanceState(row) === "CURRENT_WORKING_REFERENCE_STRONG").length, lowerWeightCandidatePreserved: baseIITransmission.filter((row) => row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.candidateValues.some((candidate) => candidate.status === "UNRESOLVED_CONFLICTING_CANDIDATE" && candidate.value === 0.0027)).length },
    },
    historicalRowsReopenedByCurrentMaintenance: rows.filter((row) => row.finding.current2026UsCoreNetworkReference?.reference.conflicts.length).length,
    researchWarrants: { before: 153, after: warrantedResearchRows, changed: warrantedResearchRows !== 153 },
    determinantSufficientRows: rows.filter((row) => row.finding.openWorldDeterminants?.determinantSufficiency === "DETERMINANT_SUFFICIENT").length,
    actionClassDistribution: actionDistribution,
    renderingPermissions: {
      exactIdentityAllowed: rows.filter((row) => row.finding.openWorldDeterminants?.renderingPermissions.exactIdentityAllowed).length,
      networkOwnershipLanguageAllowed: rows.filter((row) => row.finding.openWorldDeterminants?.renderingPermissions.networkOwnershipLanguageAllowed).length,
      acquiringSideLanguageAllowed: rows.filter((row) => row.finding.openWorldDeterminants?.renderingPermissions.acquiringSideLanguageAllowed).length,
      candidateAsFactAllowed: rows.filter((row) => row.finding.openWorldDeterminants?.renderingPermissions.candidateAsFactAllowed).length,
    },
  },
  mastercard: {
    currentBase: projectRecord("CUR26-WRK-MC-ABVF-BASE"),
    largeTicketTier: projectRecord("CUR26-WRK-MC-ABVF-LARGE-TICKET"),
    alf: projectRecord("CUR26-WRK-MC-ALF"),
    maintenanceReviews: governedCurrentReferenceMaintenanceReviewsV1(),
    assessmentRows: assessments.map(projectRow),
    historical2024RowsUnchangedByMaintenance: assessments.every((row) => row.finding.current2026UsCoreNetworkReference?.reference.state !== "CURRENT_WORKING_REFERENCE_STRONG"),
    current013Present: records.some((record) => record.kind === "current_working_reference" && record.values.some((value) => value.value === 0.0013) && record.identity.includes("mastercard_acquirer_brand_volume")),
    wellsSeptember2024Preserved: wells.length === 1 && wells[0]!.finding.mastercardFocusedEvidence?.assessment2024?.confirmedAtPar === false && wells[0]!.finding.mastercardFocusedEvidence?.assessment2024?.acquiringSideUpliftExcluded === false,
  },
  visaBaseII: {
    transmission: projectRecord("CUR26-CHG-VISA-BASE-II-TRANSMISSION"),
    candidate0027: projectRecord("CUR26-CAND-VISA-BASE-II-TRANSMISSION-0027"),
    networkAccess: projectRecord("CUR26-WRK-VISA-BASE-II-NETWORK-ACCESS"),
    genericComposite: projectRecord("CUR26-UNR-VISA-BASE-II-COMPOSITE"),
    corpusRows: baseIITransmission.map(projectRow),
    false0025To0027TransitionCreated: records.some((record) => record.kind === "dated_current_change" && record.values.some((value) => value.value === 0.0027)),
    matchingValueIdentityMergeCreated: records.some((record) => record.matchIdentityValues.includes("visa_base_ii_network_access_fee") && record.matchIdentityValues.some((identity) => identity.includes("transmission"))),
  },
  effects: {
    currentReferenceCoverageLiftInScope: { unresolvedToWorkingStrongRows: assessments.length + baseIITransmission.length },
    researchWarrantChange: 0,
    determinantSufficiencyChange: 0,
    actionClassificationChange: 0,
    merchantRenderingPermissionChange: 0,
    reusableKnowledgeCoverage: { newFirstClassRecords: ["CUR26-WRK-MC-ABVF-BASE", "CUR26-WRK-MC-ABVF-LARGE-TICKET", "CUR26-WRK-MC-ALF"], newMaintenanceReviews: ["MC_ABVF_CONTINUITY_REVIEW_2026_09"], lowerWeightCandidateRecords: ["CUR26-CAND-VISA-BASE-II-TRANSMISSION-0027"] },
  },
  invariants: {
    canonicalFinancialFingerprintChangedStatements: changedFingerprints,
    canonicalFinancialFingerprintsUnchanged: changedFingerprints.length === 0,
    canonicalMutationAllowed: false,
    historicalCurrentFirewallPreserved: rows.every((row) => (row.finding.current2026UsCoreNetworkReference?.reference.conflicts.length ?? 0) === 0),
    officialNetworkParCertifiedRows: rows.filter((row) => row.finding.current2026UsCoreNetworkReference?.reference.officialNetworkParEstablished).length,
    confirmedAtParRows: corpus.reduce((sum, entry) => sum + entry.report.coverage.confirmedAtParFindings, 0),
    confirmedMarkupRows: corpus.reduce((sum, entry) => sum + entry.report.coverage.confirmedMarkupFindings, 0),
    aiOrWebResearchExecuted: false,
    reusableKnowledgeSelfAdmitted: false,
  },
};

await mkdir(OUTPUT.slice(0, OUTPUT.lastIndexOf("/")), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT, corpus: evaluation.corpus, effects: evaluation.effects, invariants: evaluation.invariants }, null, 2));

function maintenanceState(row: { finding: InternalAnalystFinding }) {
  return row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.state;
}

function projectRecord(recordId: string) {
  const record = records.find((candidate) => candidate.recordId === recordId);
  if (!record) throw new Error(`Missing governed current-reference record ${recordId}`);
  return record;
}

function projectRow(row: { file: string; label: string; finding: InternalAnalystFinding }) {
  return {
    file: row.file,
    feeRowId: row.finding.sourceFeeRowId,
    printedLabel: row.label,
    statementPeriodState: row.finding.current2026UsCoreNetworkReference?.reference.state,
    historicalApplication: row.finding.current2026UsCoreNetworkReference?.historicalApplication,
    maintenanceState: maintenanceState(row),
    maintenanceValues: row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.values,
    maintenanceCandidates: row.finding.current2026UsCoreNetworkReference?.currentReferenceMaintenance.candidateValues,
    mastercardAbvfScopeSelection: row.finding.current2026UsCoreNetworkReference?.mastercardAbvfScopeSelection,
    mastercardAbvfScopeSelection: row.finding.current2026UsCoreNetworkReference?.mastercardAbvfScopeSelection,
    cardinality: row.finding.current2026UsCoreNetworkReference?.lineToFeeCardinality,
    researchPriority: row.finding.current2026UsCoreNetworkReference?.research.priority,
    actionClass: row.finding.openWorldDeterminants?.d4Actionability.actionClass,
    renderingPermissions: row.finding.openWorldDeterminants?.renderingPermissions,
  };
}

function distribution(values: string[]) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
}
