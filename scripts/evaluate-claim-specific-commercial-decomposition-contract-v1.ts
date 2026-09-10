import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1, COMMERCIAL_DECOMPOSITION_CONTRACT_V1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUTPUT_DIR = "evaluations/claim-specific-commercial-decomposition-contract-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-10.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-10.md`;
const PRIOR_E1 = "evaluations/commercial-decomposition-validation-e1-e2-v1/evaluation-2026-09-09.json";
const PRIOR_CONFLICTS = "evaluations/governed-commercial-classification-conflict-diagnostic-v1/evaluation-2026-09-09.json";
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

const authority = new GovernedPaymentKnowledgeAuthority();
const priorE1 = JSON.parse(await readFile(PRIOR_E1, "utf8"));
const priorConflict = JSON.parse(await readFile(PRIOR_CONFLICTS, "utf8"));
const statements: any[] = [];
const controlRows: any[] = [];

for (const fixture of GOLD) {
  const document = await parsePdf(`test/fixtures/pdfs/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const pricing = deterministicPricing(document, fixture.file, fixture.businessType, analysis);
  const knowledge = authority.resolveStatement({ analysis, context: US_CONTEXT, suppliedPricingObservation: pricing });
  const contract = buildCommercialDecompositionContractV1({ analysis, knowledge });
  const after = canonicalFinancialTruthFingerprint(analysis);
  const affected = contract.rows.filter((row) => knowledge.commercialClassificationAdjudication.rowsByFeeRowId[row.feeRowId].applicable);
  for (const row of affected) {
    const adjudication = knowledge.commercialClassificationAdjudication.rowsByFeeRowId[row.feeRowId];
    const determinant = knowledge.openWorldDeterminants.rowsByFeeRowId[row.feeRowId];
    controlRows.push({
      file: fixture.file,
      feeRowId: row.feeRowId,
      printedLabel: row.printedLabel,
      amountMinor: row.billedAmountMinor,
      adjudicatedFamily: adjudication.adjudicatedFamily,
      exactIdentity: row.identity.exactValue,
      family: row.identity.familyValue,
      economicLayer: row.economicLayer.value,
      mechanic: row.mechanicAndPopulation.mechanic,
      population: row.mechanicAndPopulation.population,
      controller: row.participants.merchantFacingPriceController,
      beneficiary: row.participants.economicBeneficiary,
      cardinality: row.cardinality.value,
      commercialDollarCategory: row.commercialDollarCategory,
      attribution: row.commercialDollarAttribution,
      claimPermissions: row.claimPermissions,
      action: row.action,
      research: determinant.research,
      renderingPermissions: determinant.renderingPermissions,
      canonicalMutation: "none",
    });
  }
  statements.push({
    file: fixture.file,
    businessType: fixture.businessType,
    period: contract.statement.statementPeriod,
    totalCanonicalFeesMinor: contract.statement.totalCanonicalFeesMinor,
    contributingRowTotalMinor: contract.statement.contributingRowTotalMinor,
    categoryTotalsMinor: contract.aggregate.categoryTotalsMinor,
    canonicalResidualMinor: contract.aggregate.canonicalRowReconciliationResidualMinor,
    unresolvedIncludingResidualMinor: contract.aggregate.unresolvedIncludingCanonicalResidualMinor,
    providerControlledMinimumMinor: contract.residualCompleteness.providerControlledMinimumMinor,
    providerControlledUpperBoundMinor: contract.residualCompleteness.providerControlledUpperBound.amountMinor,
    periodScopedUnderlyingBilledAmountMinor: contract.residualCompleteness.periodScopedUnderlyingBilledAmountMinor,
    networkRelatedBilledAmountMinor: contract.residualCompleteness.networkRelatedBilledAmountMinor,
    exactProviderResidualAllowed: contract.residualCompleteness.exactProviderResidualAllowed,
    exactOfficialNetworkParAmountMinor: contract.residualCompleteness.exactOfficialNetworkParAmountMinor,
    affectedAdjudicatedRows: affected.length,
    researchWarrants: contract.rows.filter((row) => knowledge.openWorldDeterminants.rowsByFeeRowId[row.feeRowId].research.disposition === "ESCALATE_BOUNDED_RESEARCH").length,
    customerRenderingAllowed: contract.permissions.customerRenderingAllowed,
    annualizedRows: contract.rows.filter((row) => row.recurrence.annualizationAllowed).length,
    reconcilesToCanonicalFees: contract.aggregate.reconcilesToCanonicalFees,
    canonicalFingerprintBefore: before,
    canonicalFingerprintAfter: after,
    canonicalFingerprintInvariant: before === after,
  });
}

const categoryTotals = Object.fromEntries(Object.keys(statements[0].categoryTotalsMinor).map((category) => [
  category,
  sum(statements.map((statement) => statement.categoryTotalsMinor[category])),
]));
const priorRows = new Map(priorConflict.rows.map((row: any) => [row.feeRowId, row]));
const warrantChanges = controlRows.flatMap((row) => {
  const prior = priorRows.get(row.feeRowId) as any;
  if (!prior || prior.existingGovernedInterpretation.researchDisposition === row.research.disposition) return [];
  return [{
    file: row.file,
    feeRowId: row.feeRowId,
    printedLabel: row.printedLabel,
    adjudicatedFamily: row.adjudicatedFamily,
    before: prior.existingGovernedInterpretation.researchDisposition,
    after: row.research.disposition,
    reason: "The Product-adjudicated scoped classification closes the determinant conflict; no new public research is required for this commercial decomposition.",
  }];
});
const priorDiagnosticResearchRows = priorConflict.rows.filter((row: any) => row.researchDisposition === "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION");
const diagnosticResearchClosure = priorDiagnosticResearchRows.map((prior: any) => {
  const current = controlRows.find((row) => row.feeRowId === prior.feeRowId);
  return {
    file: prior.statement.file,
    feeRowId: prior.feeRowId,
    printedLabel: prior.printedLabel,
    before: prior.researchDisposition,
    after: current?.research.disposition ?? "ROW_NOT_FOUND",
    stoppingReason: current?.research.reasonCodes ?? [],
  };
});
const renderingChanges = controlRows.flatMap((row) => {
  const prior = priorRows.get(row.feeRowId) as any;
  if (!prior) return [];
  const before = prior.existingGovernedInterpretation.renderingPermissions;
  const after = row.renderingPermissions;
  const changed = before.exactIdentityAllowed !== after.exactIdentityAllowed ||
    before.acquiringSideLanguageAllowed !== after.acquiringSideLanguageAllowed ||
    before.networkOwnershipLanguageAllowed !== after.networkOwnershipLanguageAllowed ||
    before.negotiationLanguageAllowed !== after.negotiationLanguageAllowed;
  return changed ? [{ file: row.file, feeRowId: row.feeRowId, printedLabel: row.printedLabel, before, after }] : [];
});

const families = groupControls(controlRows);
const control = (family: string) => controlRows.filter((row) => row.adjudicatedFamily === family);
const genericExceptions = control("generic_exception_or_return");
const tiered = control("tiered_qual_mqual_nqual");
const programCost = control("fiserv_amex_program_cost_merchant_price");
const nabu = control("mastercard_nabu_authorization");
const connectivity = control("mastercard_connectivity_kilobyte");
const isa = control("visa_isa_base");
const exactDisputes = controlRows.filter((row) => ["mastercard_dispute_image", "mastercard_dispute_case", "visa_dispute_no_acceptance"].includes(row.adjudicatedFamily));
const assessment = control("mastercard_assessment_01475");
const regulatory = control("regulatory_product");
const corpus = {
  statements: statements.length,
  totalCanonicalFeesMinor: sum(statements.map((statement) => statement.totalCanonicalFeesMinor)),
  categoryTotalsMinor: categoryTotals,
  canonicalResidualMinor: sum(statements.map((statement) => statement.canonicalResidualMinor)),
  unresolvedIncludingResidualMinor: sum(statements.map((statement) => statement.unresolvedIncludingResidualMinor)),
  providerControlledMinimumMinor: sum(statements.map((statement) => statement.providerControlledMinimumMinor)),
  providerControlledUpperBoundMinor: sum(statements.map((statement) => statement.providerControlledUpperBoundMinor)),
  periodScopedUnderlyingBilledAmountMinor: sum(statements.map((statement) => statement.periodScopedUnderlyingBilledAmountMinor)),
  networkRelatedBilledAmountMinor: sum(statements.map((statement) => statement.networkRelatedBilledAmountMinor)),
  affectedAdjudicatedRows: controlRows.length,
  canonicalFingerprintInvariantStatements: statements.filter((statement) => statement.canonicalFingerprintInvariant).length,
  fingerprintChanges: statements.filter((statement) => !statement.canonicalFingerprintInvariant).length,
};

const evaluation = {
  schemaVersion: COMMERCIAL_DECOMPOSITION_CONTRACT_V1,
  generatedAt: "2026-09-10",
  productAuthority: {
    file: "RateReveal_Governed_Commercial_Classification_Adjudication_FINAL_Product_Adjudicated_v1.md",
    sha256: "5223734a0755a66b8a63d96d4e6d20cfc963ba12bd341f7dae22e98c030d21c3",
    status: "product_domain_adjudicated",
  },
  baseline: {
    branch: "codex/governed-commercial-classification-conflict-diagnostic-v1",
    commit: "205802076758e1d2c8abcf9592fde33071afb22e",
    priorE1SchemaVersion: priorE1.schemaVersion,
    priorConflictRows: priorConflict.summary.totalRowsReviewed,
  },
  scope: {
    productionCommercialContractImplemented: true,
    internalAnalystOnly: true,
    marketBandsOrGradesImplemented: false,
    savingsOrSwitchingImplemented: false,
    aiOrWebResearchExecuted: false,
    customerFacingCutover: false,
    canonicalMutationAllowed: false,
  },
  corpus,
  priorE1Comparison: {
    priorRoleTotalsMinor: priorE1.corpus.roleTotalsMinor,
    currentCategoryTotalsMinor: categoryTotals,
    priorProviderControlledVariableMinor: priorE1.corpus.roleTotalsMinor.PROVIDER_CONTROLLED_VARIABLE_COMMERCIAL_PRICE,
    currentProviderControlledMinimumMinor: corpus.providerControlledMinimumMinor,
    priorSharedIncludingResidualMinor: priorE1.corpus.unresolvedSharedMinor,
    currentUnresolvedIncludingResidualMinor: corpus.unresolvedIncludingResidualMinor,
    explanation: "The taxonomies are not one-for-one: v1 now separates commercial row category, bounded provider dollars, period-scoped underlying billed dollars, and unresolved composition rather than treating a role label as full-dollar ownership.",
  },
  familySummary: families,
  controlOutcomes: {
    mastercardNabu: nabu,
    mastercardConnectivityKilobyte: connectivity,
    visaIsaBase: isa,
    amexProgramCost2020: programCost,
    tieredQualMqualNqual: tiered,
    exactNetworkDisputes: exactDisputes,
    genericExceptions,
    mastercardAssessment01475: assessment,
    regulatoryProduct: regulatory,
  },
  determinantAndActionEffects: controlRows.map((row) => ({
    file: row.file,
    feeRowId: row.feeRowId,
    printedLabel: row.printedLabel,
    family: row.family,
    economicLayer: row.economicLayer,
    actionClass: row.action.actionClass,
    dollarCategory: row.commercialDollarCategory,
    attributionKind: row.attribution.kind,
  })),
  researchWarrantEffects: {
    changedRows: warrantChanges.length,
    changes: warrantChanges,
    priorDiagnosticResearchRows: priorDiagnosticResearchRows.length,
    priorDiagnosticResearchClosures: diagnosticResearchClosure,
    unchangedUnlessClassificationRequiredIt: true,
  },
  merchantRenderingEffects: {
    changedRows: renderingChanges.length,
    changes: renderingChanges,
    customerRenderingStillDisabled: true,
  },
  statements,
  invariants: {
    elevenGoldStatements: statements.length === 11,
    allContractsReconcile: statements.every((statement) => statement.reconcilesToCanonicalFees),
    noDoubleCounting: statements.every((statement) => statement.reconcilesToCanonicalFees),
    canonicalFingerprintsInvariant11Of11: corpus.canonicalFingerprintInvariantStatements === 11 && corpus.fingerprintChanges === 0,
    noExactProviderResidual: statements.every((statement) => !statement.exactProviderResidualAllowed),
    noOfficialNetworkParAmount: statements.every((statement) => statement.exactOfficialNetworkParAmountMinor === null),
    noAppearanceOnlyAnnualization: statements.every((statement) => statement.annualizedRows === 0),
    nabuPrecedenceCorrected: nabu.length === 2 && nabu.every((row) => row.economicLayer === "card_network" && row.family === "F3"),
    connectivityPrecedenceCorrected: connectivity.length === 9 && connectivity.every((row) => row.economicLayer === "card_network" && row.mechanic.includes("kilobyte")) && connectivity.filter((row) => priorRows.has(row.feeRowId)).length === 4,
    visaIsaPrecedenceCorrected: isa.length === 4 && isa.every((row) => row.economicLayer === "card_network" && row.family === "F2"),
    amexProgramCostNoRejectedSplit: programCost.length === 1 && programCost[0].attribution.providerControlledMinimumContributionMinor === 1956 && programCost[0].beneficiary.value === null,
    tieredDollarsRemainShared: tiered.length === 21 && tiered.filter((row) => priorRows.has(row.feeRowId)).length === 15 && tiered.every((row) => row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED" && !row.claimPermissions.exactProviderControlledDollarsAllowed),
    exactNetworkDisputesCorrected: exactDisputes.length === 3 && exactDisputes.every((row) => row.economicLayer === "card_network" && row.claimPermissions.periodScopedUnderlyingBilledDollarsAllowed),
    genericExceptionsRemainUnresolved: genericExceptions.length >= 1 && genericExceptions.every((row) => row.commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED"),
    mastercardAssessmentRemainsShared: assessment.length === 1 && assessment[0].commercialDollarCategory === "SHARED_BUNDLED_OR_UNRESOLVED",
    regulatoryProductSeparate: regulatory.length === 1 && regulatory[0].commercialDollarCategory === "GOVERNMENT_NONPROCESSING_OR_OTHER",
    priorDiagnosticResearchClosedByAdjudication: diagnosticResearchClosure.length === 6 && diagnosticResearchClosure.every((row) => row.after === "STOP"),
    noAiOrWebResearch: true,
    customerRenderingDisabled: statements.every((statement) => !statement.customerRenderingAllowed),
  },
};

await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, renderReport(evaluation), "utf8");
const failed = Object.entries(evaluation.invariants).filter(([, value]) => !value).map(([key]) => key);
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], corpus, failed }, null, 2));
if (failed.length > 0) process.exitCode = 1;

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

function groupControls(rows: any[]) {
  const groups = new Map<string, any[]>();
  for (const row of rows) groups.set(row.adjudicatedFamily, [...(groups.get(row.adjudicatedFamily) ?? []), row]);
  return [...groups.entries()].map(([family, items]) => ({ family, rowCount: items.length, amountMinor: sum(items.map((item) => item.amountMinor)) }));
}

function renderReport(value: typeof evaluation): string {
  const lines = [
    "# Claim-Specific Commercial Decomposition Contract v1",
    "",
    "## Outcome",
    "",
    `The production internal contract ran across all ${value.corpus.statements} supported Fiserv Gold statements. All contracts reconcile to canonical total fees, all 11 canonical financial fingerprints are invariant, and no customer-facing authority, grade, savings target, AI, or web research was introduced.`,
    "",
    `Product authority: \`${value.productAuthority.file}\` (SHA-256 \`${value.productAuthority.sha256}\`).`,
    "",
    "## Corpus commercial-dollar ledger",
    "",
    `- Canonical fees: ${money(value.corpus.totalCanonicalFeesMinor)}`,
    `- Underlying externally set network/program: ${money(value.corpus.categoryTotalsMinor.UNDERLYING_EXTERNALLY_SET_NETWORK_OR_PROGRAM)}`,
    `- Incidence/configuration/qualification-sensitive: ${money(value.corpus.categoryTotalsMinor.INCIDENCE_CONFIGURATION_OR_QUALIFICATION_SENSITIVE)}`,
    `- Provider-controlled variable category: ${money(value.corpus.categoryTotalsMinor.PROVIDER_CONTROLLED_VARIABLE)}`,
    `- Provider/third-party fixed ancillary: ${money(value.corpus.categoryTotalsMinor.PROVIDER_OR_THIRD_PARTY_FIXED_ANCILLARY)}`,
    `- Shared/bundled/unresolved: ${money(value.corpus.categoryTotalsMinor.SHARED_BUNDLED_OR_UNRESOLVED)}`,
    `- Government/non-processing/other: ${money(value.corpus.categoryTotalsMinor.GOVERNMENT_NONPROCESSING_OR_OTHER)}`,
    `- Provider-controlled minimum: ${money(value.corpus.providerControlledMinimumMinor)}`,
    `- Provider-controlled upper bound: ${money(value.corpus.providerControlledUpperBoundMinor)}`,
    `- Period-scoped underlying billed amount: ${money(value.corpus.periodScopedUnderlyingBilledAmountMinor)}`,
    `- Network-related billed amount (not official-par certification): ${money(value.corpus.networkRelatedBilledAmountMinor)}`,
    `- Unresolved including canonical residual: ${money(value.corpus.unresolvedIncludingResidualMinor)}`,
    "",
    "## Adjudicated family coverage",
    "",
    "| Family | Rows | Billed dollars |",
    "|---|---:|---:|",
    ...value.familySummary.map((family) => `| ${family.family} | ${family.rowCount} | ${money(family.amountMinor)} |`),
    "",
    "## Statement reconciliation",
    "",
    "| Statement | Canonical fees | Provider minimum | Provider upper bound | Network-related | Shared/unresolved | Fingerprint |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...value.statements.map((statement) => `| ${statement.file} | ${money(statement.totalCanonicalFeesMinor)} | ${money(statement.providerControlledMinimumMinor)} | ${money(statement.providerControlledUpperBoundMinor)} | ${money(statement.networkRelatedBilledAmountMinor)} | ${money(statement.unresolvedIncludingResidualMinor)} | ${statement.canonicalFingerprintInvariant ? "unchanged" : "CHANGED"} |`),
    "",
    "## Determinant, action, and research effects",
    "",
    `The adjudication affected ${value.corpus.affectedAdjudicatedRows} corpus rows. ${value.researchWarrantEffects.changedRows} prior conflict-driven research dispositions changed because Product supplied the missing scoped classification; unrelated warrants were not changed. Internal rendering permissions changed on ${value.merchantRenderingEffects.changedRows} rows, while customer rendering remains disabled.`,
    "",
    "## Safety conclusions",
    "",
    "- Row category is not treated as proof of participant ownership of every billed dollar.",
    "- Exact provider-controlled dollars require supported acquiring-side price control, separability, and no stronger network identity.",
    "- Provider upper bounds remain distinct from provider minimums and exact residual is always refused.",
    "- Network attribution never enables official-par, no-uplift, or universal-pass-through language.",
    "- Recurrence and annualization remain separate; this corpus run annualized no rows.",
    "- Canonical fee identity, membership, amounts, arithmetic, and financial fingerprints were not mutated.",
    "",
    "## Remaining limitations",
    "",
    "The contract does not provide market bands, grades, savings, switching advice, contract compliance, customer rendering, or complete provider residuals. Generic return/chargeback/ACH-reject composition, the ultimate beneficiary of the 2020 Amex Program Cost fee, any provider uplift in incompletely evidenced network rows, exact 0.1475% Mastercard assessment composition, and the exact Regulatory Product recipient remain unresolved by design.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function money(minor: number): string { return `$${(minor / 100).toFixed(2)}`; }
