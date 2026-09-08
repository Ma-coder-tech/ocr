import { mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint, type InternalAnalystFinding } from "../src/canonical/internalAnalystFindingV1.js";
import type { UnknownFeeResearchPlanV1 } from "../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../src/parser.js";

const OUTPUT = "evaluations/decision-relevant-stage0-warrant-gate-v1/evaluation-2026-09-08.json";
const PRIOR_CALIBRATED_RESEARCH = 168;
const PRIOR_OPEN_WORLD_ESCALATIONS = 200;
const EXACT_BASELINE_ROW_COMPARISON = {
  baselineCommit: "a520d09528c1b54ef74c39ed1fc9e5a0696afe0d",
  retainedResearchEscalations: 134,
  newlyWarrantedEscalations: 19,
  newlyWarrantedDollarsMinor: 6_528,
  newlySuppressedEscalations: 34,
  newlySuppressedDollarsMinor: 128_574,
} as const;
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
const CONTROLS = [
  { caseId: "monthly_advantage", file: "Nov_2024_Statement.pdf", label: "MONTHLY ADVANTAGE FEE", expected: "RESEARCH" },
  { caseId: "batch_settlement", file: "Nov_2024_Statement.pdf", label: "BATCH SETTLEMENT FEE", expected: "STOP_WITHOUT_EXTERNAL_RESEARCH" },
  { caseId: "application_fee", file: "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf", label: "APPLICATION FEE", expected: "STOP_WITHOUT_EXTERNAL_RESEARCH" },
  { caseId: "amex_nqual", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", label: "AMEXCT043 - NQUAL DISC", expected: "STOP_WITHOUT_EXTERNAL_RESEARCH" },
  { caseId: "cpu_gateway", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", label: "CPU GTWY", expected: "STOP_WITHOUT_EXTERNAL_RESEARCH" },
] as const;

type EvaluatedRow = {
  file: string;
  label: string;
  amountMinor: number;
  finding: InternalAnalystFinding & { sourceFeeRowId: string };
  plan: UnknownFeeResearchPlanV1;
  queued: boolean;
};

const rows: EvaluatedRow[] = [];
const canonicalChanged: string[] = [];
for (const fixture of FIXTURES) {
  const analysis = buildCanonicalStatementFactsFromParsedDocument(await parsePdf(`test/fixtures/pdfs/${fixture.file}`), { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  const queuedIds = new Set([...report.researchQueue.selected, ...report.researchQueue.deferred].map((item) => item.question.feeRowRef));
  for (const decision of report.researchQueue.stage0Decisions) {
    const finding = report.findings.find((item): item is InternalAnalystFinding & { sourceFeeRowId: string } => item.sourceFeeRowId === decision.feeRowId);
    const row = analysis.feeLedger.rows.find((item) => item.id === decision.feeRowId);
    if (!finding || !row) throw new Error(`stage0_reconciliation_row_missing:${fixture.file}:${decision.feeRowId}`);
    rows.push({ file: fixture.file, label: row.selectedLabel, amountMinor: finding.observedAmountMinor ?? 0, finding, plan: decision.calibration, queued: queuedIds.has(row.id) });
  }
  if (before !== canonicalFinancialTruthFingerprint(analysis) || before !== report.canonicalFinancialTruth.afterFingerprint || !report.canonicalFinancialTruth.unchanged) canonicalChanged.push(fixture.file);
}

const warranted = rows.filter((row) => row.plan.stage0.researchWarranted);
const stopped = rows.filter((row) => !row.plan.stage0.researchWarranted);
const adjudication = rows.filter((row) => row.plan.stage0.adjudicationRequired);
const materialDollarsMinor = sum(rows);
const explained = rows.filter((row) => row.finding.openWorldDeterminants!.family.value && row.finding.openWorldDeterminants!.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED");
const actionable = rows.filter((row) => row.finding.openWorldDeterminants!.d4Actionability.actionClass !== "N7");
const sufficient = rows.filter((row) => row.finding.openWorldDeterminants!.determinantSufficiency === "DETERMINANT_SUFFICIENT");
const highMateriality = rows.filter((row) => row.finding.openWorldDeterminants!.d3Materiality.highMateriality);
const actionableHighMateriality = highMateriality.filter((row) => row.finding.openWorldDeterminants!.d4Actionability.actionClass !== "N7");
const preliminaryEscalations = rows.filter((row) => row.finding.openWorldDeterminants!.research.disposition === "ESCALATE_BOUNDED_RESEARCH");
const warrantedOutsidePreliminary = warranted.filter((row) => row.finding.openWorldDeterminants!.research.disposition !== "ESCALATE_BOUNDED_RESEARCH");
const warrantedNotQueued = warranted.filter((row) => !row.queued);
const queuedWithoutWarrant = rows.filter((row) => row.queued && !row.plan.stage0.researchWarranted);

const controls = CONTROLS.map((control) => {
  const row = rows.find((item) => item.file === control.file && item.label.includes(control.label));
  if (!row) throw new Error(`control_missing:${control.caseId}`);
  if (row.plan.stage0.decision !== control.expected) throw new Error(`control_decision_mismatch:${control.caseId}:${row.plan.stage0.decision}`);
  return {
    caseId: control.caseId,
    file: row.file,
    printedLabel: row.label,
    establishedEvidenceBeforeResearch: row.plan.stage0.establishedEvidence,
    unresolvedFields: row.plan.stage0.unresolvedFields,
    finalStage0Decision: row.plan.stage0.decision,
    researchWarranted: row.plan.stage0.researchWarranted,
    stopOrWarrantReasons: row.plan.stage0.reasonCodes,
    availableMerchantConclusionWithoutResearch: {
      actionClass: row.finding.openWorldDeterminants!.d4Actionability.actionClass,
      action: row.finding.practicalMerchantAction.value,
      confidence: row.finding.practicalMerchantAction.confidence,
    },
    additionalConclusionIfResearchSucceeds: row.plan.stage0.whyResearchCouldChangeMerchantDecision,
    currentProjection: {
      exactIdentity: row.finding.openWorldDeterminants!.exactIdentity,
      family: row.finding.openWorldDeterminants!.family,
      mechanic: row.finding.openWorldDeterminants!.d2MechanicAndPopulation.mechanic,
      population: row.finding.openWorldDeterminants!.d2MechanicAndPopulation.population,
      arithmetic: row.finding.printedArithmeticCorrectness,
      determinantSufficiency: row.finding.openWorldDeterminants!.determinantSufficiency,
      renderingPermissions: row.finding.openWorldDeterminants!.renderingPermissions,
    },
  };
});

const evaluation = {
  schemaVersion: "decision_relevant_stage0_warrant_gate_2026_09_08_v1",
  baseline: {
    branch: "codex/unknown-fee-research-diagnosis-e1-e2-v1",
    commit: "a520d09528c1b54ef74c39ed1fc9e5a0696afe0d",
    priorOpenWorldEscalations: PRIOR_OPEN_WORLD_ESCALATIONS,
    priorCalibratedResearchEscalations: PRIOR_CALIBRATED_RESEARCH,
  },
  corpus: {
    statements: FIXTURES.length,
    materialRows: rows.length,
    priorCalibratedResearchEscalations: PRIOR_CALIBRATED_RESEARCH,
    currentPreliminaryOpenWorldEscalations: preliminaryEscalations.length,
    newWarrantedResearchEscalations: warranted.length,
    netResearchEscalationReduction: PRIOR_CALIBRATED_RESEARCH - warranted.length,
    exactBaselineRowComparison: EXACT_BASELINE_ROW_COMPARISON,
    warrantedResearchRows: project(warranted),
    newResearchEscalationsOutsidePreliminaryProjection: project(warrantedOutsidePreliminary),
    stage0Stops: stopped.length,
    governedConflictAdjudications: adjudication.length,
    governedConflictRows: adjudication.map((row) => ({
      ...project([row])[0],
      conflicts: row.plan.stage0.governedConflicts,
    })),
    determinantSufficientRows: sufficient.length,
    actionClassifiedRows: actionable.length,
    highMaterialityRows: highMateriality.length,
    highMaterialityActionResolvedRows: actionableHighMateriality.length,
    materialDollarsMinor,
    explainedMaterialDollarsMinor: sum(explained),
    explainedMaterialDollarCoveragePercent: percent(sum(explained), materialDollarsMinor),
    actionableMaterialDollarsMinor: sum(actionable),
    actionableMaterialDollarCoveragePercent: percent(sum(actionable), materialDollarsMinor),
    warrantedResearchDollarsMinor: sum(warranted),
    warrantedResearchDollarSharePercent: percent(sum(warranted), materialDollarsMinor),
  },
  falseNegativeReview: {
    warrantedButMissingFromResearchQueue: project(warrantedNotQueued),
    queuedWithoutFinalWarrant: project(queuedWithoutWarrant),
    knownPriorNoDecisionValueEscalationsCorrected: ["batch_settlement", "application_fee", "amex_nqual"],
    knownPriorNoDecisionValueExternalOperationsAvoided: 17,
    monthlyAdvantageWarrantPreserved: controls.find((item) => item.caseId === "monthly_advantage")?.researchWarranted === true,
    priorStage0MissesNowWarranted: EXACT_BASELINE_ROW_COMPARISON.newlyWarrantedEscalations,
    priorStage0OverEscalationsNowSuppressed: EXACT_BASELINE_ROW_COMPARISON.newlySuppressedEscalations,
    finding: warrantedNotQueued.length === 0 && queuedWithoutWarrant.length === 0
      ? "No current Stage-0 false negative or queue-boundary mismatch was found: every warranted row is queued, every queued row is warranted, Monthly Advantage remains selected, and 19 decision-relevant rows missed by the prior gate are now warranted."
      : "A Stage-0/queue mismatch requires review.",
  },
  controls,
  crossLayerCorrections: [
    "Canonical complete per-item arithmetic now projects Batch Settlement D2 mechanic and printed item population without claiming the population equals a separate settlement table.",
    "Canonical complete rate-times-volume arithmetic now projects AMEX NQUAL D2 mechanic and printed money-volume population while bundled component allocation remains unresolved.",
    "Explicit printed formula syntax now projects Monthly Advantage as rate-times-volume/proportional even though canonical arithmetic correctly remains unresolved because the normalized printed rate operand is missing.",
    "Account Fees section evidence plus ordinary administrative label structure now supports the Application Fee F7 category, current-period occurrence, and waiver/reduction request without inferring recurrence or contract authorization.",
  ],
  changedAnalystConclusions: [
    "Application Fee moves from unresolved/N7 verification-only to category-only F7/N4 administrative review and waiver request; recurrence, beneficiary, retention, and contract compliance remain unresolved.",
    "Batch Settlement and AMEX NQUAL move from Open-World D2 unresolved to determinant-sufficient using already-canonical arithmetic and existing governed family evidence; their useful merchant actions do not depend on exact identity or retention.",
    "Monthly Advantage changes from fixed-periodic projection to proportional rate-times-volume projection; its arithmetic, economic layer, price control, and N7 action remain unresolved, so research remains warranted.",
    "CPU GTWY remains determinant-sufficient and suppressed.",
  ],
  confidenceAndRenderingPermissions: {
    familyLanguageAllowedRows: rows.filter((row) => row.finding.openWorldDeterminants!.renderingPermissions.familyLanguageAllowed).length,
    acquiringSideLanguageAllowedRows: rows.filter((row) => row.finding.openWorldDeterminants!.renderingPermissions.acquiringSideLanguageAllowed).length,
    networkOwnershipLanguageAllowedRows: rows.filter((row) => row.finding.openWorldDeterminants!.renderingPermissions.networkOwnershipLanguageAllowed).length,
    negotiationLanguageAllowedRows: rows.filter((row) => row.finding.openWorldDeterminants!.renderingPermissions.negotiationLanguageAllowed).length,
    exactIdentityAllowedRows: rows.filter((row) => row.finding.openWorldDeterminants!.renderingPermissions.exactIdentityAllowed).length,
    candidateAsFactAllowedRows: rows.filter((row) => row.finding.openWorldDeterminants!.renderingPermissions.candidateAsFactAllowed).length,
    actionClassDistribution: distribution(rows.map((row) => row.finding.openWorldDeterminants!.d4Actionability.actionClass)),
    determinantConfidenceDistribution: distribution(rows.map((row) => row.finding.openWorldDeterminants!.determinantSufficiency)),
  },
  invariants: {
    canonicalFinancialTruthChangedStatements: canonicalChanged,
    canonicalFingerprintsUnchanged: canonicalChanged.length === 0,
    sourceFactsRewritten: false,
    aiOrResearchExecuted: false,
    reusableKnowledgeSelfAdmitted: false,
    canonicalMutationAllowed: false,
  },
};

await mkdir(OUTPUT.slice(0, OUTPUT.lastIndexOf("/")), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: OUTPUT,
  statements: evaluation.corpus.statements,
  materialRows: evaluation.corpus.materialRows,
  warrantedResearchRows: evaluation.corpus.newWarrantedResearchEscalations,
  stage0Stops: evaluation.corpus.stage0Stops,
  governedConflictAdjudications: evaluation.corpus.governedConflictAdjudications,
  canonicalFingerprintsUnchanged: evaluation.invariants.canonicalFingerprintsUnchanged,
}, null, 2));

function sum(items: EvaluatedRow[]) {
  return items.reduce((total, item) => total + item.amountMinor, 0);
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round(value / total * 10_000) / 100 : null;
}

function project(items: EvaluatedRow[]) {
  return items.map((item) => ({ key: `${item.file}:${item.finding.sourceFeeRowId}`, file: item.file, feeRowId: item.finding.sourceFeeRowId, label: item.label, amountMinor: item.amountMinor, decision: item.plan.stage0.decision }));
}

function distribution(values: string[]) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}
