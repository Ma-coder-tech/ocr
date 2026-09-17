import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { buildUnknownFeeResearchPlanV1, type UnknownFeeResearchPlanV1, type UnknownFeeResearchType } from "../src/canonical/unknownFeeResearchCalibrationV1.js";
import { parsePdf } from "../src/parser.js";

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
const US_CONTEXT = { geography: { value: "us", evidenceClass: "statement_local" as const, evidenceRefs: ["supported_fiserv_us_scope"] } };

type Row = {
  file: string;
  label: string;
  amountMinor: number;
  openWorldEscalation: boolean;
  plan: UnknownFeeResearchPlanV1;
};

const rows: Row[] = [];
const canonicalChanged: string[] = [];
for (const fixture of FIXTURES) {
  const parsed = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(parsed, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  if (before !== canonicalFinancialTruthFingerprint(analysis) || before !== report.canonicalFinancialTruth.afterFingerprint) canonicalChanged.push(fixture.file);
  const processorName = processorContext(analysis.identity.processorName.value, analysis.identity.processorFamily.value);
  const year = analysis.identity.statementPeriod.value?.start?.slice(0, 4) ?? null;
  for (const finding of report.findings) {
    if (!finding.sourceFeeRowId || !finding.openWorldDeterminants) continue;
    const row = analysis.feeLedger.rows.find((item) => item.id === finding.sourceFeeRowId)!;
    rows.push({
      file: fixture.file,
      label: row.selectedLabel,
      amountMinor: finding.observedAmountMinor ?? 0,
      openWorldEscalation: finding.openWorldDeterminants.research.disposition === "ESCALATE_BOUNDED_RESEARCH",
      plan: buildUnknownFeeResearchPlanV1({
        feeRowId: row.id,
        printedLabel: row.selectedLabel,
        processorName,
        statementYear: year,
        statementRole: row.role,
        determinant: finding.openWorldDeterminants,
      }),
    });
  }
}

const research = rows.filter((row) => row.plan.stage0.decision === "RESEARCH");
const stops = rows.filter((row) => row.plan.stage0.decision === "STOP_WITHOUT_EXTERNAL_RESEARCH");
const openWorldEscalations = rows.filter((row) => row.openWorldEscalation);
const typeValues: UnknownFeeResearchType[] = [
  "A_PROPRIETARY_BRANDED",
  "B_GENERIC_DESCRIPTIVE",
  "C_ABBREVIATED_CODED",
  "D_NETWORK_LOOKING",
  "E_THIRD_PARTY_OR_SERVICE",
  "F_UNFAMILIAR_PER_ITEM_OR_RECURRING",
];
const stopReasons = [...new Set(stops.map((row) => row.plan.stage0.stoppingReason ?? "none"))];
const researchExamples = typeValues.map((type) => ({
  type,
  examples: uniqueByLabel(research.filter((row) => row.plan.applicableTypes.includes(type)).sort((left, right) => right.amountMinor - left.amountMinor)).slice(0, 8).map(project),
}));

console.log(JSON.stringify({
  schemaVersion: "unknown_fee_research_calibration_corpus_evaluation_v1",
  statements: FIXTURES.length,
  materialRows: rows.length,
  stage0: {
    priorOpenWorldEscalations: openWorldEscalations.length,
    calibratedResearch: research.length,
    stoppedWithoutExternalResearch: stops.length,
    escalationsSuppressed: openWorldEscalations.filter((row) => row.plan.stage0.decision === "STOP_WITHOUT_EXTERNAL_RESEARCH").length,
    unexpectedNewEscalations: research.filter((row) => !row.openWorldEscalation).length,
    stopReasonDistribution: Object.fromEntries(stopReasons.map((reason) => [reason, stops.filter((row) => (row.plan.stage0.stoppingReason ?? "none") === reason).length])),
  },
  classification: {
    primaryTypeDistribution: Object.fromEntries(typeValues.map((type) => [type, rows.filter((row) => row.plan.primaryType === type).length])),
    applicableTypeDistribution: Object.fromEntries(typeValues.map((type) => [type, rows.filter((row) => row.plan.applicableTypes.includes(type)).length])),
    researchTypeDistribution: Object.fromEntries(typeValues.map((type) => [type, research.filter((row) => row.plan.applicableTypes.includes(type)).length])),
  },
  budget: {
    maximumExternalOperations: Math.max(...research.map((row) => row.plan.budget.maximumExternalOperations)),
    plannedSearchShapeDistribution: distribution(research.map((row) => row.plan.queryShapes.length)),
    plannedFetchCapDistribution: distribution(research.map((row) => row.plan.budget.maximumDocumentFetches)),
    plansExceedingEightOperations: research.filter((row) => row.plan.budget.maximumExternalOperations > 8).length,
    stoppedPlansWithNonzeroBudget: stops.filter((row) => row.plan.budget.maximumExternalOperations > 0 || row.plan.queryShapes.length > 0).length,
  },
  regression: {
    canonicalFinancialTruthChangedStatements: canonicalChanged,
    staleExpectation: { priorQueuedResearch: 200, calibratedQueuedResearch: research.length, reason: "Stage 0 now suppresses research when D1-D4 or a structurally useful merchant conclusion already suffices." },
  },
  researchExamples,
}, null, 2));

function project(row: Row) {
  return {
    file: row.file,
    label: row.label,
    amountMinor: row.amountMinor,
    primaryType: row.plan.primaryType,
    applicableTypes: row.plan.applicableTypes,
    queryShapes: row.plan.queryShapes.map((shape) => shape.kind),
    operationCap: row.plan.budget.maximumExternalOperations,
  };
}

function uniqueByLabel(values: Row[]) {
  const seen = new Set<string>();
  return values.filter((value) => !seen.has(value.label) && Boolean(seen.add(value.label)));
}

function distribution(values: number[]) {
  return Object.fromEntries([...new Set(values)].sort((a, b) => a - b).map((value) => [String(value), values.filter((item) => item === value).length]));
}

function processorContext(processorName: string | null, processorFamily: string | null) {
  if (processorName && /FISERV|FIRST DATA|CLOVER|PAYSAFE|BASYS|NXGEN|PRIORITY|WELLS FARGO/i.test(processorName)) return processorName;
  return processorFamily ?? processorName;
}
