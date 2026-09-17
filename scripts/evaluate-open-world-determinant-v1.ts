import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { measureOpenWorldResearchEfficiencyV1, validateOpenWorldRenderingV1 } from "../src/canonical/governedOpenWorldDeterminantV1.js";
import { buildInternalAnalystFindingV1, canonicalFinancialTruthFingerprint } from "../src/canonical/internalAnalystFindingV1.js";
import { parsePdf } from "../src/parser.js";

const PDF_ROOT = "test/fixtures/pdfs";
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

const corpus = [];
for (const fixture of FIXTURES) {
  const document = await parsePdf(`${PDF_ROOT}/${fixture.file}`);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const before = canonicalFinancialTruthFingerprint(analysis);
  const report = buildInternalAnalystFindingV1({ analysis, statementContext: US_CONTEXT });
  const rows = report.findings.filter((finding) => finding.sourceFeeRowId && finding.openWorldDeterminants).map((finding) => ({
    file: fixture.file,
    label: analysis.feeLedger.rows.find((row) => row.id === finding.sourceFeeRowId)!.selectedLabel,
    amountMinor: finding.observedAmountMinor ?? 0,
    identity: finding.exactFeeIdentity,
    legacy: {
      explained: Boolean(finding.exactFeeIdentity.value || finding.broaderEconomicCategory.value),
      evidenceGatedActionable: Boolean(
        finding.datedNetworkEvidence ||
        finding.usNetworkFeeEvidence ||
        (finding.perItemAnalysis && finding.perItemAnalysis.economicLayer !== "PER_ITEM_LAYER_UNRESOLVED") ||
        finding.merchantFacingPriceController.value ||
        finding.commercialReasonableness.state === "industry_judgment"
      ),
    },
    determinant: finding.openWorldDeterminants!,
  }));
  corpus.push({ file: fixture.file, report, rows, canonicalUnchanged: before === report.canonicalFinancialTruth.afterFingerprint && before === canonicalFinancialTruthFingerprint(analysis) });
}

const rows = corpus.flatMap((item) => item.rows);
const materialDollarsMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0);
const familyCounts = Object.fromEntries([...new Set(rows.map((row) => row.determinant.family.value ?? "LAYER_UNRESOLVED"))].sort().map((family) => [family, rows.filter((row) => (row.determinant.family.value ?? "LAYER_UNRESOLVED") === family).length]));
const familyDollarsMinor = Object.fromEntries(Object.keys(familyCounts).map((family) => [family, rows.filter((row) => (row.determinant.family.value ?? "LAYER_UNRESOLVED") === family).reduce((sum, row) => sum + row.amountMinor, 0)]));
const actionCounts = Object.fromEntries(["N1", "N2", "N3", "N4", "N5", "N6", "N7"].map((code) => [code, rows.filter((row) => row.determinant.d4Actionability.actionClass === code).length]));
const researchEscalations = rows.filter((row) => row.determinant.research.disposition === "ESCALATE_BOUNDED_RESEARCH");
const stopped = rows.filter((row) => row.determinant.stoppingReason === "S1_DETERMINANT_SUFFICIENCY");
const deferred = rows.filter((row) => row.determinant.research.disposition === "DEFER_REUSABLE_KNOWLEDGE");
const unresolvedLayer = rows.filter((row) => row.determinant.d1EconomicLayerAndControl.economicLayer.value === "LAYER_UNRESOLVED");
const familyKnownIdentityUnresolved = rows.filter((row) => row.determinant.exactIdentity.state === "family_known_identity_unresolved");
const fuzzyCandidates = rows.filter((row) => row.determinant.exactIdentity.state !== "exact_supported" && row.determinant.attributes.includes("identity_unresolved"));
const falseAcquiring = unresolvedLayer.filter((row) => row.determinant.renderingPermissions.acquiringSideLanguageAllowed);
const falseNetwork = unresolvedLayer.filter((row) => row.determinant.renderingPermissions.networkOwnershipLanguageAllowed);
const renderingGuardFailures = rows.filter((row) => row.determinant.exactIdentity.state !== "exact_supported" && validateOpenWorldRenderingV1(row.determinant, { assertsExactIdentity: true }).allowed);
const queued = corpus.reduce((sum, item) => sum + item.report.coverage.queuedResearchQuestions, 0);

const sample = (items: typeof rows, count = 8) => items.slice(0, count).map((row) => ({
  file: row.file,
  label: row.label,
  amountMinor: row.amountMinor,
  identityState: row.determinant.exactIdentity.state,
  family: row.determinant.family.value,
  layer: row.determinant.d1EconomicLayerAndControl.economicLayer.value,
  mechanic: row.determinant.d2MechanicAndPopulation.mechanic.value,
  actionClass: row.determinant.d4Actionability.actionClass,
  sufficiency: row.determinant.determinantSufficiency,
  research: row.determinant.research.disposition,
}));

const result = {
  schemaVersion: "open_world_determinant_corpus_evaluation_v1",
  statements: corpus.length,
  materialRows: rows.length,
  materialDollarsMinor,
  exactIdentitySupported: rows.filter((row) => row.determinant.exactIdentity.state === "exact_supported").length,
  familyKnownIdentityUnresolved: familyKnownIdentityUnresolved.length,
  identityAndLayerUnresolved: unresolvedLayer.filter((row) => row.determinant.exactIdentity.state === "identity_unresolved").length,
  determinantSufficient: rows.filter((row) => row.determinant.determinantSufficiency === "DETERMINANT_SUFFICIENT").length,
  actionableClassified: rows.filter((row) => row.determinant.d4Actionability.actionClass !== "N7").length,
  highMaterialityRows: rows.filter((row) => row.determinant.d3Materiality.highMateriality).length,
  actionableHighMaterialityRows: rows.filter((row) => row.determinant.d3Materiality.highMateriality && row.determinant.d4Actionability.actionClass !== "N7").length,
  explainedMaterialDollarsMinor: rows.filter((row) => row.determinant.family.value && row.determinant.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED").reduce((sum, row) => sum + row.amountMinor, 0),
  actionableClassifiedDollarsMinor: rows.filter((row) => row.determinant.d4Actionability.actionClass !== "N7").reduce((sum, row) => sum + row.amountMinor, 0),
  unexplainedMaterialDollarsMinor: unresolvedLayer.reduce((sum, row) => sum + row.amountMinor, 0),
  beforeAfter: {
    definition: "Before uses unchanged Internal Analyst Finding v1 exact/category claims and an evidence-gated action proxy (governed network, resolved per-item layer, supported merchant-facing controller, or applied commercial norm); after uses first-class open-world family/layer and N1-N7 action classification.",
    beforeExplainedRows: rows.filter((row) => row.legacy.explained).length,
    beforeExplainedDollarsMinor: rows.filter((row) => row.legacy.explained).reduce((sum, row) => sum + row.amountMinor, 0),
    beforeActionableRows: rows.filter((row) => row.legacy.evidenceGatedActionable).length,
    beforeActionableDollarsMinor: rows.filter((row) => row.legacy.evidenceGatedActionable).reduce((sum, row) => sum + row.amountMinor, 0),
    afterExplainedRows: rows.filter((row) => row.determinant.family.value && row.determinant.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED").length,
    afterExplainedDollarsMinor: rows.filter((row) => row.determinant.family.value && row.determinant.d1EconomicLayerAndControl.economicLayer.value !== "LAYER_UNRESOLVED").reduce((sum, row) => sum + row.amountMinor, 0),
    afterActionableRows: rows.filter((row) => row.determinant.d4Actionability.actionClass !== "N7").length,
    afterActionableDollarsMinor: rows.filter((row) => row.determinant.d4Actionability.actionClass !== "N7").reduce((sum, row) => sum + row.amountMinor, 0),
  },
  familyCounts,
  familyDollarsMinor,
  actionCounts,
  research: {
    escalations: researchEscalations.length,
    stoppedBySufficiency: stopped.length,
    deferredReusableKnowledge: deferred.length,
    queuedByBoundedTransport: queued,
    exactIdentityUnresolvedNotQueued: rows.filter((row) => row.determinant.exactIdentity.state !== "exact_supported" && row.determinant.research.disposition === "STOP").length,
  },
  safety: {
    falseAcquiringClassificationsOnUnresolvedLayer: falseAcquiring.length,
    falseNetworkClassificationsOnUnresolvedLayer: falseNetwork.length,
    fuzzyCandidatePromotedToExactIdentity: rows.filter((row) => row.determinant.retrieval.candidateOnly && row.determinant.retrieval.fuzzyCandidatePresent && row.determinant.exactIdentity.state === "exact_supported").length,
    renderingGuardFailures: renderingGuardFailures.length,
    canonicalFinancialTruthChangedStatements: corpus.filter((item) => !item.canonicalUnchanged).length,
  },
  researchEfficiency: measureOpenWorldResearchEfficiencyV1([]),
  examples: {
    usefulWithoutExactIdentity: sample(familyKnownIdentityUnresolved.filter((row) => row.determinant.determinantSufficiency === "DETERMINANT_SUFFICIENT")),
    honestlyUnresolved: sample(unresolvedLayer),
    researchEscalations: sample(researchEscalations),
    stoppedWithoutResearch: sample(stopped),
    fuzzyOrIdentityCandidatesHeldBack: sample(fuzzyCandidates),
  },
};

console.log(JSON.stringify(result, null, 2));
