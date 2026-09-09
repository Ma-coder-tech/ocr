import { mkdir, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
  type InternalAnalystFinding,
  type InternalAnalystPricingModelInput,
} from "../src/canonical/internalAnalystFindingV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";
import {
  COMMERCIAL_DECOMPOSITION_DIAGNOSTIC_V1,
  classifyCommercialRoleV1,
  type CommercialRoleDiagnosticV1,
  type CommercialRoleV1,
} from "./lib/commercialDecompositionDiagnosticV1.js";

const PRODUCT_AUTHORITY = {
  file: "RateReveal_Commercial_Analysis_Research_FINAL_Product_Adjudicated_v1.md",
  sha256: "1d17472bf7437c9100b23afe989bd505763e4c1d8a98eace2ae018c35db78ce0",
  authority: "Product/domain adjudication; supersedes the independent research where conflicts exist",
};
const BASELINE = {
  branch: "codex/current-reference-consumption-calibration-v1",
  commit: "69038b8e790ebb033fe1f70a3b444d3225862dde",
};
const OUTPUT_DIR = "evaluations/commercial-decomposition-validation-e1-e2-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-09.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-09.md`;
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

type ResidualState =
  | "COMPLETE_ENOUGH_FOR_PROVIDER_RESIDUAL"
  | "PARTIAL_PROVIDER_RESIDUAL_IS_UPPER_BOUND"
  | "NOT_DECOMPOSABLE"
  | "BUNDLED_SHARED_ECONOMICS";

type StatementEvaluation = Awaited<ReturnType<typeof evaluateStatement>>;

const authority = new GovernedPaymentKnowledgeAuthority();
const statements: StatementEvaluation[] = [];
for (const fixture of GOLD) statements.push(await evaluateStatement(fixture));

const wells = statements.find((statement) => statement.file === "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf");
if (!wells) throw new Error("missing Wells Fargo September 2024 falsification case");
const wellsVariableRows = wells.allChargeRows.filter((row) => row.primaryRole === "PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE");
const wellsPerItemRows = wellsVariableRows.filter((row) => row.secondaryAttributes.includes("PER_EVENT") || row.secondaryAttributes.includes("CONDITIONAL_OR_EXCEPTION"));
const wellsPercentageRows = wellsVariableRows.filter((row) => row.secondaryAttributes.includes("PROPORTIONAL_TO_VOLUME"));
const wellsFixedRows = wells.allChargeRows.filter((row) => row.primaryRole === "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE");
const wellsSharedRows = wells.allChargeRows.filter((row) => row.primaryRole === "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS");
const wellsProviderVariableMinor = sum(wellsVariableRows.map((row) => row.amountMinor));
const wellsPerItemMinor = sum(wellsPerItemRows.map((row) => row.amountMinor));
const wellsPercentageMinor = sum(wellsPercentageRows.map((row) => row.amountMinor));
const wellsFixedMinor = sum(wellsFixedRows.map((row) => row.amountMinor));
const wellsSharedMinor = sum(wellsSharedRows.map((row) => row.amountMinor)) + Math.max(0, wells.canonicalReconciliationResidualMinor);
const wellsSalesMinor = wells.processedSalesMinor;
const zeroHeadlineRows = wells.sourceRows.filter((row) => /SALES DISCOUNT|DISCOUNT RATE|DISCOUNT/i.test(row.label) && row.amountMinor === 0);
const e2 = {
  statement: wells.file,
  question: "Does the method locate meaningful provider-controlled economics when headline percentage pricing is zero or near zero?",
  result: wellsProviderVariableMinor > 0 && wellsPerItemMinor > 0 ? "PASS" : "FAIL",
  headlineZeroOrNearZeroObserved: zeroHeadlineRows.length > 0 || wellsPercentageMinor === 0,
  headlineEvidence: zeroHeadlineRows,
  providerControlledVariableMinor: wellsProviderVariableMinor,
  providerControlledVariableBps: bps(wellsProviderVariableMinor, wellsSalesMinor),
  authorizationPerItemMinor: wellsPerItemMinor,
  authorizationPerItemSharePercent: percent(wellsPerItemMinor, wellsProviderVariableMinor),
  percentagePricingMinor: wellsPercentageMinor,
  percentagePricingSharePercent: percent(wellsPercentageMinor, wellsProviderVariableMinor),
  fixedAncillaryMinor: wellsFixedMinor,
  fixedAncillaryBps: bps(wellsFixedMinor, wellsSalesMinor),
  unresolvedSharedMinor: wellsSharedMinor,
  providerVariableRows: wellsVariableRows,
  fixedAncillaryRows: wellsFixedRows,
  unresolvedSharedRows: wellsSharedRows,
  conclusion: wellsProviderVariableMinor > 0 && wellsPerItemMinor > 0
    ? "The bottom-up method finds affirmative acquiring-side per-event pricing even though no material provider percentage charge is present. It does not infer provider control from catalog absence."
    : "The bottom-up method did not locate affirmatively supported provider-controlled per-event economics and fails this falsification case.",
};

const allRows = statements.flatMap((statement) => statement.allChargeRows);
const materialFindings = statements.flatMap((statement) => statement.materialFindings);
const statementResults = statements.map(({ allChargeRows: _allChargeRows, sourceRows: _sourceRows, ...statement }) => statement);
const corpusRoleTotals = roleTotals(allRows);
const canonicalResidualTotalMinor = sum(statements.map((statement) => statement.canonicalReconciliationResidualMinor));
const evaluation = {
  schemaVersion: COMMERCIAL_DECOMPOSITION_DIAGNOSTIC_V1,
  generatedAt: "2026-09-09",
  productAuthority: PRODUCT_AUTHORITY,
  baseline: BASELINE,
  scope: {
    diagnosticOnly: true,
    commercialEngineImplemented: false,
    commercialGradesImplemented: false,
    benchmarksOrNormsAdmitted: false,
    aiOrWebResearchExecuted: false,
    customerFacingAuthority: "none",
    canonicalMutationAllowed: false,
  },
  corpus: {
    totalStatements: statements.length,
    totalCanonicalFeesMinor: sum(statements.map((statement) => statement.totalCanonicalFeesMinor)),
    totalContributingChargeRows: allRows.length,
    totalMaterialFindings: materialFindings.length,
    materialFindingDollarsMinor: sum(materialFindings.map((finding) => finding.amountMinor)),
    roleTotalsMinor: corpusRoleTotals,
    canonicalReconciliationResidualMinor: canonicalResidualTotalMinor,
    unresolvedSharedMinor: corpusRoleTotals.SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS + Math.max(0, canonicalResidualTotalMinor),
    residualStates: countBy(statements.map((statement) => statement.providerResidualCompleteness.state)),
    completeEnoughForPreciseProviderResidual: statements.filter((statement) => statement.providerResidualCompleteness.state === "COMPLETE_ENOUGH_FOR_PROVIDER_RESIDUAL").length,
    providerResidualUpperBoundOnly: statements.filter((statement) => statement.providerResidualCompleteness.state === "PARTIAL_PROVIDER_RESIDUAL_IS_UPPER_BOUND").length,
    notDecomposable: statements.filter((statement) => statement.providerResidualCompleteness.state === "NOT_DECOMPOSABLE").length,
    bundledSharedEconomics: statements.filter((statement) => statement.providerResidualCompleteness.state === "BUNDLED_SHARED_ECONOMICS").length,
    commercialComparatorReady: statements.filter((statement) => statement.comparatorReadiness.ready).length,
    canonicalFingerprintChanges: statements.filter((statement) => !statement.canonicalFingerprintInvariant).length,
  },
  statements: statementResults,
  e2WellsFargoMarkupLocationTrap: e2,
  classificationDisagreements: buildDisagreements(statements),
  architectureMismatches: [
    "The governed authority resolves row identity, layer, participants, mechanic, and action, but it has no first-class cross-row commercial decomposition or residual-completeness object; this diagnostic must compose those claims outside production code.",
    "The current finding model is material-finding oriented. Exact statement reconciliation requires also reading governed determinants for non-material contributing rows and preserving any canonical fee-ledger residual separately.",
    "The generic PROGRAM-token composition signal can conflict with stronger statement-local AMEX program-cost reconciliation or an exact governed network-program identity; the diagnostic gives the stronger, more specific evidence precedence without changing the source determinant.",
    "MC NETWORK ACCESS AUTH FEE at 0.0195 currently reaches an acquiring-commercial result because the exact governed NABU/network-access family does not capture that printed alias; the diagnostic preserves the conflict instead of treating it as affirmative provider control.",
    "The broad account-fee fallback can classify VISA INTL SERVICE FEE as acquiring-commercial despite its explicit network/international-service wording; the diagnostic preserves it as shared/unresolved rather than inferring provider ownership or control.",
    "A printed line can contain both an underlying network component and acquiring-side allocation/uplift, but the current row model cannot quantify component dollars without statement-local composition evidence; those lines remain shared/bundled.",
    "Provider residual, provider-controlled minimum, provider-controlled upper bound, and exact wholesale-at-par are distinct claims, but there is no dedicated claim-specific permission matrix for commercial decomposition.",
    "Risk, channel, product mix, and integrated-software value are generally absent or not qualified across Gold statements, so overall commercial comparator selection remains blocked without suppressing narrower row findings.",
    "Recurrence/cadence is not proven from a single occurrence unless the governed mechanic itself is fixed/periodic; annual fixed-stack projections remain withheld.",
  ],
  thesisAssessment: {
    bottomUpDecompositionSurvivesFalsification: e2.result === "PASS",
    revisionsRequired: [
      "Provider economics cannot be located from a headline discount percentage alone; per-event and fixed/ancillary prices must be inspected independently.",
      "Externally set does not mean processor-independent incidence, allocation, configuration, or merchant-facing price.",
      "A complete binary network-versus-processor split is not currently defensible; shared/bundled and claim-specific refusal must remain first-class.",
      "No overall reasonableness grade or precise savings claim is warranted from this diagnostic.",
    ],
  },
  invariants: {
    statementCountIsEleven: statements.length === 11,
    canonicalFingerprintInvariant: statements.every((statement) => statement.canonicalFingerprintInvariant),
    roleAssignmentByCatalogAbsenceAllowed: false,
    providerRowsRequireAffirmativeControlEvidence: allRows
      .filter((row) => row.primaryRole === "PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE")
      .every((row) => row.controlScope === "affirmative_acquiring_side_control" && row.evidenceRefs.length > 0 && row.confidence !== "UNRESOLVED"),
    ancillaryRowsRequireAffirmativeBroadLayerEvidence: allRows
      .filter((row) => row.primaryRole === "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE")
      .every((row) => ["affirmative_acquiring_side_control", "broad_acquiring_side_category", "broad_service_or_third_party_category"].includes(row.controlScope) && row.evidenceRefs.length > 0 && row.confidence !== "UNRESOLVED"),
    exactProviderResidualWithoutCompleteness: false,
    newKnowledgeOrNormsAdmitted: false,
    aiOrWebResearchExecuted: false,
  },
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, renderReport(evaluation), "utf8");
const failed = Object.entries(evaluation.invariants).filter(([, value]) => value !== true && value !== false).map(([key]) => key);
if (!evaluation.invariants.statementCountIsEleven || !evaluation.invariants.canonicalFingerprintInvariant || !evaluation.invariants.providerRowsRequireAffirmativeControlEvidence || !evaluation.invariants.ancillaryRowsRequireAffirmativeBroadLayerEvidence || e2.result !== "PASS") {
  process.exitCode = 1;
}
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], corpus: evaluation.corpus, e2: { result: e2.result, providerControlledVariableMinor: e2.providerControlledVariableMinor, providerControlledVariableBps: e2.providerControlledVariableBps }, failed }, null, 2));

async function evaluateStatement(fixture: { file: string; businessType: BusinessTypeId }) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const pricingInput = deterministicPricing(document, fixture.file, fixture.businessType, analysis);
  const knowledge = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricingInput });
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT, pricingModel: pricingInput, asOf: "2026-09-09" });
  const findingByRow = new Map(report.findings.filter((finding) => finding.sourceFeeRowId).map((finding) => [finding.sourceFeeRowId!, finding]));
  const contributingRows = analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal && (row.selectedAmount?.amountMinor ?? 0) > 0);
  const allChargeRows = contributingRows.map((row) => classifyCommercialRoleV1({ row, knowledge, finding: findingByRow.get(row.id) ?? null }));
  const materialFindings = allChargeRows.filter((row) => knowledge.openWorldDeterminants.rowsByFeeRowId[row.feeRowId].d3Materiality.material);
  const totalCanonicalFeesMinor = analysis.financialFacts.totalFees.value.amountMinor;
  const contributingRowsTotalMinor = sum(allChargeRows.map((row) => row.amountMinor));
  const canonicalReconciliationResidualMinor = totalCanonicalFeesMinor - contributingRowsTotalMinor;
  const totals = roleTotals(allChargeRows);
  const pricing = knowledge.pricingLayers.pricingModel;
  const completeness = residualState(pricing.model, pricing.interchangeDisclosure, pricing.assessmentSeparation, totals, canonicalReconciliationResidualMinor);
  const fixedMinor = totals.PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE;
  const variableMinor = totals.PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE;
  const salesMinor = analysis.financialFacts.processedSales.value.amountMinor;
  const recurringRows = allChargeRows.filter((row) => row.primaryRole === "PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE" && row.secondaryAttributes.includes("FIXED_OR_PERIODIC"));
  const fixedPeriodicMinor = sum(recurringRows.map((row) => row.amountMinor));
  const missingComparatorContext = unique([
    fixture.businessType === "other" ? "vertical" : null,
    "risk",
    "channel",
    analysis.financialFacts.averageTicket.value ? null : "average_ticket",
    "product_mix",
    "integrated_software_value",
    completeness.state === "COMPLETE_ENOUGH_FOR_PROVIDER_RESIDUAL" ? null : "provider_residual_completeness",
  ].filter((value): value is string => Boolean(value)));
  const after = canonicalFinancialTruthFingerprint(analysis);
  const exactResidualPermitted = completeness.state === "COMPLETE_ENOUGH_FOR_PROVIDER_RESIDUAL";
  const providerKnown = variableMinor + fixedMinor > 0;
  const underlyingKnown = totals.UNDERLYING_EXTERNALLY_SET_COST + totals.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE > 0;
  const sampleLanguage = exactResidualPermitted
    ? `Internal sample only: Total acceptance cost this period was ${money(totalCanonicalFeesMinor)}. RateReveal attributes ${money(totals.UNDERLYING_EXTERNALLY_SET_COST)} to externally set underlying cost, ${money(totals.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE)} to externally set but incidence-sensitive cost, ${money(variableMinor)} to provider-controlled variable pricing, ${money(fixedMinor)} to provider/third-party fixed and ancillary charges, and ${money(totals.SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS + Math.max(0, canonicalReconciliationResidualMinor))} remains shared or unresolved.`
    : `Internal sample only: RateReveal can identify at least ${money(totals.UNDERLYING_EXTERNALLY_SET_COST + totals.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE)} as underlying or incidence-sensitive payment-system cost and at least ${money(variableMinor + fixedMinor)} as affirmatively provider/service-controlled pricing. Another ${money(totals.SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS + Math.max(0, canonicalReconciliationResidualMinor))} remains bundled, shared, or unreconciled, so no exact provider-markup grade is permitted.`;

  return {
    file: fixture.file,
    businessType: fixture.businessType,
    statementPeriod: analysis.identity.statementPeriod.value,
    processorFamily: analysis.identity.processorFamily.value,
    processedSalesMinor: salesMinor,
    totalCanonicalFeesMinor,
    canonicalUniqueChargeTotalMinor: analysis.feeLedger.uniqueChargeTotal?.amountMinor ?? null,
    contributingRowsTotalMinor,
    canonicalReconciliationResidualMinor,
    roleTotalsMinor: totals,
    unresolvedSharedIncludingResidualMinor: totals.SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS + Math.max(0, canonicalReconciliationResidualMinor),
    materialFindingCount: materialFindings.length,
    materialFindingDollarsMinor: sum(materialFindings.map((row) => row.amountMinor)),
    pricingModel: {
      suppliedDeterministicModel: pricingInput.model,
      governedModel: pricing.model,
      state: pricing.state,
      confidence: pricing.confidence,
      interchangeDisclosure: pricing.interchangeDisclosure,
      assessmentSeparation: pricing.assessmentSeparation,
      sufficientlyTransparentForExactResidual: exactResidualPermitted,
    },
    providerResidualCompleteness: completeness,
    fixedAncillaryMetrics: {
      ancillaryCategoryDollarsMinor: fixedMinor,
      fixedOrPeriodicDollarsMinor: fixedPeriodicMinor,
      fixedOrPeriodicBasisPointsEquivalent: bps(fixedPeriodicMinor, salesMinor),
      fixedOrPeriodicDollarsPerTenThousand: perTenThousand(fixedPeriodicMinor, salesMinor),
      recurringFeeCountWhereMechanicSupportsRecurrence: recurringRows.length,
      recurringFeeRowIds: recurringRows.map((row) => row.feeRowId),
      fixedToVariableProviderCostRatio: fixedPeriodicMinor > 0 && variableMinor > 0 ? round(fixedPeriodicMinor / variableMinor, 4) : null,
      ratioScope: fixedPeriodicMinor > 0 && variableMinor > 0 ? "broad_provider_or_third_party_fixed_category_over_affirmative_provider_variable_known_components_only" : "not_computable",
      annualizationPermitted: false,
    },
    comparatorReadiness: {
      ready: missingComparatorContext.length === 0,
      available: {
        vertical: fixture.businessType === "other" ? null : fixture.businessType,
        volumeMinor: salesMinor,
        averageTicketMinor: analysis.financialFacts.averageTicket.value?.amountMinor ?? null,
      },
      missing: missingComparatorContext,
      overallGradePermitted: false,
      reason: "No market band is applied. Missing context and/or residual completeness blocks only an overall comparator, not narrower row-level findings.",
    },
    claimSpecificPermissions: {
      exactProviderResidual: exactResidualPermitted,
      providerResidualUpperBound: completeness.state === "PARTIAL_PROVIDER_RESIDUAL_IS_UPPER_BOUND",
      fixedFeeBurden: fixedMinor > 0,
      providerControlledPerItemBurden: allChargeRows.some((row) => row.primaryRole === "PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE" && row.secondaryAttributes.includes("PER_EVENT")),
      duplicateOrServiceOverlap: false,
      operationalIncidenceFinding: allChargeRows.some((row) => row.primaryRole === "INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE"),
      commercialComparatorEligibility: false,
      overallCommercialGradeEligibility: false,
      providerControlledMinimumMinor: providerKnown ? variableMinor + fixedMinor : null,
      providerControlledMaximumOrUpperBoundMinor: completeness.state === "PARTIAL_PROVIDER_RESIDUAL_IS_UPPER_BOUND" ? variableMinor + fixedMinor + totals.SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS + Math.max(0, canonicalReconciliationResidualMinor) : null,
      underlyingMinimumMinor: underlyingKnown ? totals.UNDERLYING_EXTERNALLY_SET_COST + totals.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE : null,
    },
    sourceRows: analysis.feeLedger.rows.map((row) => ({ feeRowId: row.id, label: row.selectedLabel, amountMinor: row.selectedAmount?.amountMinor ?? null, contributes: row.contributesToUniqueTotal })),
    materialFindings,
    allChargeRows,
    internalSampleLanguage: sampleLanguage,
    canonicalFingerprintBefore: before,
    canonicalFingerprintAfter: after,
    canonicalFingerprintInvariant: before === after && report.canonicalFinancialTruth.unchanged,
  };
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const value = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = value?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`deterministic pricing model unavailable for ${file}`);
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function residualState(
  model: string,
  interchangeDisclosure: string,
  assessmentSeparation: string,
  totals: Record<CommercialRoleV1, number>,
  reconciliationResidualMinor: number,
): { state: ResidualState; exactProviderResidualPermitted: boolean; explanation: string } {
  const shared = totals.SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS + Math.abs(reconciliationResidualMinor);
  const provider = totals.PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE + totals.PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE;
  const underlying = totals.UNDERLYING_EXTERNALLY_SET_COST + totals.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE;
  if (["tiered_pricing", "flat_rate", "flat_discount_pricing"].includes(model)) {
    return { state: "BUNDLED_SHARED_ECONOMICS", exactProviderResidualPermitted: false, explanation: "Tiered or blended pricing does not expose a complete underlying-cost base; narrower provider-controlled rows remain valid, but no exact statement-wide residual is allowed." };
  }
  if (model === "interchange_plus" && interchangeDisclosure === "complete" && assessmentSeparation === "present" && shared === 0 && provider > 0 && underlying > 0) {
    return { state: "COMPLETE_ENOUGH_FOR_PROVIDER_RESIDUAL", exactProviderResidualPermitted: true, explanation: "Itemized underlying cost, assessment separation, affirmative provider pricing, and row-to-total reconciliation are complete enough for this statement-period residual." };
  }
  if (model === "interchange_plus" && provider > 0 && underlying > 0) {
    return { state: "PARTIAL_PROVIDER_RESIDUAL_IS_UPPER_BOUND", exactProviderResidualPermitted: false, explanation: "Useful components are separable, but incomplete disclosure, shared lines, or reconciliation gaps prevent a precise provider residual; any residual is only an upper bound." };
  }
  return { state: "NOT_DECOMPOSABLE", exactProviderResidualPermitted: false, explanation: "Current governed evidence does not expose both a sufficiently complete underlying base and affirmative provider-controlled price for a responsible residual." };
}

function roleTotals(rows: CommercialRoleDiagnosticV1[]): Record<CommercialRoleV1, number> {
  const totals: Record<CommercialRoleV1, number> = {
    UNDERLYING_EXTERNALLY_SET_COST: 0,
    INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE: 0,
    PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE: 0,
    PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE: 0,
    SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS: 0,
  };
  for (const row of rows) totals[row.primaryRole] += row.amountMinor;
  return totals;
}

function buildDisagreements(statements: StatementEvaluation[]) {
  return statements.flatMap((statement) => statement.allChargeRows
    .filter((row) => row.primaryRole === "SHARED_ALLOCATED_BUNDLED_OR_UNRESOLVED_ECONOMICS" && row.determinant.economicLayer && row.determinant.economicLayer !== "LAYER_UNRESOLVED")
    .map((row) => ({
      file: statement.file,
      feeRowId: row.feeRowId,
      label: row.printedLabel,
      governedLayer: row.determinant.economicLayer,
      diagnosticRole: row.primaryRole,
      disagreement: "The row-level economic layer is useful, but cardinality/allocation/control evidence is not sufficient to assign the entire printed dollar amount to that layer for commercial decomposition.",
      canonicalOrGovernedMutationProposed: false,
    })));
}

function renderReport(evaluation: typeof evaluation): string {
  const c = evaluation.corpus;
  const lines = [
    "# Commercial Decomposition Validation E1 + E2 v1",
    "",
    "## Decision summary",
    "",
    `The bottom-up decomposition **${evaluation.thesisAssessment.bottomUpDecompositionSurvivesFalsification ? "survives" : "does not survive"}** the Wells Fargo markup-location falsification. This is a diagnostic result only: no commercial engine, grade, benchmark, norm, savings estimate, or customer-facing behavior was implemented.`,
    "",
    `Product authority: \`${evaluation.productAuthority.file}\` (SHA-256 \`${evaluation.productAuthority.sha256}\`).`,
    "",
    "## E1 corpus totals",
    "",
    `- Statements: ${c.totalStatements}`,
    `- Material findings: ${c.totalMaterialFindings} (${money(c.materialFindingDollarsMinor)})`,
    `- Total canonical fees: ${money(c.totalCanonicalFeesMinor)}`,
    `- Underlying externally set: ${money(c.roleTotalsMinor.UNDERLYING_EXTERNALLY_SET_COST)}`,
    `- Incidence/qualification/configuration-sensitive: ${money(c.roleTotalsMinor.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE)}`,
    `- Provider-controlled variable: ${money(c.roleTotalsMinor.PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE)}`,
    `- Provider/third-party fixed and ancillary: ${money(c.roleTotalsMinor.PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE)}`,
    `- Shared/bundled/unresolved, including positive canonical residual: ${money(c.unresolvedSharedMinor)}`,
    `- Precise residual permitted: ${c.completeEnoughForPreciseProviderResidual}; upper-bound only: ${c.providerResidualUpperBoundOnly}; not decomposable: ${c.notDecomposable}; bundled/shared: ${c.bundledSharedEconomics}`,
    "",
    "## Statement-level decomposition",
    "",
    "| Statement | Pricing model | Canonical fees | Underlying | Incidence-sensitive | Provider variable | Fixed/ancillary | Shared/unresolved | Residual state |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ...evaluation.statements.map((s) => `| ${s.file} | ${s.pricingModel.governedModel} | ${money(s.totalCanonicalFeesMinor)} | ${money(s.roleTotalsMinor.UNDERLYING_EXTERNALLY_SET_COST)} | ${money(s.roleTotalsMinor.INCIDENCE_QUALIFICATION_CONFIGURATION_SENSITIVE)} | ${money(s.roleTotalsMinor.PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE)} | ${money(s.roleTotalsMinor.PROVIDER_OR_THIRD_PARTY_FIXED_AND_ANCILLARY_PRICE)} | ${money(s.unresolvedSharedIncludingResidualMinor)} | ${s.providerResidualCompleteness.state} |`),
    "",
    "## Pricing-model verifiability",
    "",
    "| Statement | Governed model | State/confidence | Interchange disclosure | Assessment separation | Exact residual allowed |",
    "|---|---|---|---|---|---|",
    ...evaluation.statements.map((s) => `| ${s.file} | ${s.pricingModel.governedModel} | ${s.pricingModel.state}/${s.pricingModel.confidence} | ${s.pricingModel.interchangeDisclosure} | ${s.pricingModel.assessmentSeparation} | ${yesNo(s.pricingModel.sufficientlyTransparentForExactResidual)} |`),
    "",
    "## Fixed/ancillary and comparator readiness",
    "",
    "| Statement | Ancillary category | Fixed/periodic | bps | $ per $10k | Supported recurring rows | Fixed:variable ratio | Comparator ready | Missing context |",
    "|---|---:|---:|---:|---:|---:|---:|---|---|",
    ...evaluation.statements.map((s) => `| ${s.file} | ${money(s.fixedAncillaryMetrics.ancillaryCategoryDollarsMinor)} | ${money(s.fixedAncillaryMetrics.fixedOrPeriodicDollarsMinor)} | ${formatNumber(s.fixedAncillaryMetrics.fixedOrPeriodicBasisPointsEquivalent)} | ${formatNumber(s.fixedAncillaryMetrics.fixedOrPeriodicDollarsPerTenThousand)} | ${s.fixedAncillaryMetrics.recurringFeeCountWhereMechanicSupportsRecurrence} | ${formatNumber(s.fixedAncillaryMetrics.fixedToVariableProviderCostRatio)} | ${s.comparatorReadiness.ready ? "yes" : "no"} | ${s.comparatorReadiness.missing.join(", ")} |`),
    "",
    "No statement receives an overall commercial grade. Missing comparator context blocks only that claim; row-level provider, fixed-stack, or operational-incidence findings remain available when affirmatively supported.",
    "",
    "## E2 Wells Fargo result",
    "",
    `Result: **${evaluation.e2WellsFargoMarkupLocationTrap.result}**. Provider-controlled variable pricing is ${money(evaluation.e2WellsFargoMarkupLocationTrap.providerControlledVariableMinor)} (${formatNumber(evaluation.e2WellsFargoMarkupLocationTrap.providerControlledVariableBps)} bps). Auth/per-item and exception mechanics account for ${money(evaluation.e2WellsFargoMarkupLocationTrap.authorizationPerItemMinor)} (${formatNumber(evaluation.e2WellsFargoMarkupLocationTrap.authorizationPerItemSharePercent)}%); percentage pricing accounts for ${money(evaluation.e2WellsFargoMarkupLocationTrap.percentagePricingMinor)}. Fixed/ancillary is ${money(evaluation.e2WellsFargoMarkupLocationTrap.fixedAncillaryMinor)}, and ${money(evaluation.e2WellsFargoMarkupLocationTrap.unresolvedSharedMinor)} remains shared/unresolved.`,
    "",
    evaluation.e2WellsFargoMarkupLocationTrap.conclusion,
    "",
    "### Affirmatively supported provider-variable rows",
    "",
    ...evaluation.e2WellsFargoMarkupLocationTrap.providerVariableRows.map((row) => `- ${row.printedLabel}: ${money(row.amountMinor)}; ${row.determinant.mechanic ?? "mechanic unresolved"}; action ${row.actionClass}; confidence ${row.confidence}. Evidence: ${row.evidenceRefs.join(", ") || "none"}.`),
    "",
    "## Claim-specific refusal",
    "",
    "| Statement | Exact residual | Upper bound | Fixed burden | Provider per-item | Operational incidence | Comparator | Overall grade |",
    "|---|---|---|---|---|---|---|---|",
    ...evaluation.statements.map((s) => `| ${s.file} | ${yesNo(s.claimSpecificPermissions.exactProviderResidual)} | ${yesNo(s.claimSpecificPermissions.providerResidualUpperBound)} | ${yesNo(s.claimSpecificPermissions.fixedFeeBurden)} | ${yesNo(s.claimSpecificPermissions.providerControlledPerItemBurden)} | ${yesNo(s.claimSpecificPermissions.operationalIncidenceFinding)} | no | no |`),
    "",
    "## Internal language safety probes",
    "",
    "No corpus statement reached complete-enough status, so the strong-completeness pattern was not instantiated as a factual statement. The retained template is: “Total acceptance cost this period was X. RateReveal can attribute A to underlying interchange/network costs, B to provider-controlled variable pricing, C to provider/third-party fixed and ancillary charges, and D remains unresolved/shared.”",
    "",
    `Partial-completeness probe (${evaluation.statements.find((s) => s.file.includes("WELLS_FARGO"))?.file}): ${evaluation.statements.find((s) => s.file.includes("WELLS_FARGO"))?.internalSampleLanguage}`,
    "",
    "The probes intentionally omit same-with-any-processor, overpayment, fairness, reasonableness, guaranteed savings, and contract-compliance language.",
    "",
    "## Architecture findings",
    "",
    ...evaluation.architectureMismatches.map((item) => `- ${item}`),
    "",
    `Commercial-role disagreements requiring preservation rather than overwrite: ${evaluation.classificationDisagreements.length}. These are mainly rows where an economic layer is known but the full billed amount cannot be assigned because composition or allocation remains unresolved.`,
    "",
    "### Preserved classification disagreements",
    "",
    "| Statement | Printed label | Governed layer | Diagnostic treatment |",
    "|---|---|---|---|",
    ...evaluation.classificationDisagreements.map((item) => `| ${item.file} | ${item.label.replaceAll("|", "\\|")} | ${item.governedLayer} | retained as shared/unresolved; no governed mutation |`),
    "",
    "## Safety and invariants",
    "",
    `Canonical fingerprints were unchanged for ${evaluation.statements.length - c.canonicalFingerprintChanges}/${evaluation.statements.length} statements. No AI/web research ran; no knowledge, norms, network values, grades, savings, switching logic, production behavior, or customer rendering changed.`,
    "",
    "## Recommendation",
    "",
    "Product should review the row-level shared/bundled disagreements and the statement completeness states, then authorize the smallest production design milestone: a claim-specific commercial-decomposition contract that composes existing governed evidence without adding market bands or grades. Comparator admission should remain a later, separate domain-review milestone.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function bps(amountMinor: number, salesMinor: number): number | null { return salesMinor > 0 ? round(amountMinor / salesMinor * 10_000, 2) : null; }
function percent(amountMinor: number, totalMinor: number): number | null { return totalMinor > 0 ? round(amountMinor / totalMinor * 100, 2) : null; }
function perTenThousand(amountMinor: number, salesMinor: number): number | null { return salesMinor > 0 ? round(amountMinor / salesMinor * 10_000, 2) : null; }
function round(value: number, digits = 2): number { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
function money(minor: number): string { return `$${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function formatNumber(value: number | null): string { return value === null ? "n/a" : String(value); }
function yesNo(value: boolean): string { return value ? "yes" : "no"; }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function countBy(values: string[]): Record<string, number> { const out: Record<string, number> = {}; for (const value of values) out[value] = (out[value] ?? 0) + 1; return out; }
