import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUT = "evaluations/claim-scoped-fixed-cost-sensitivity-admission-v1";
const BASELINE = {
  branch: "codex/claim-scoped-mixed-minimum-cost-sensitivity-admission-v1",
  commit: "965e23c6a5b23b6f2346574bb62265db48eaf356",
  parent: "74fbcb7cd7c95d123fff7d719b741043038f6d70",
} as const;
const EXPECTED_COMMERCIAL_SHA = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
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

const acceptedMixed = JSON.parse(await readFile(
  "evaluations/claim-scoped-mixed-minimum-cost-sensitivity-admission-v1/evaluation-2026-09-13.json", "utf8",
));
const acceptedByFile = new Map<string, any>(acceptedMixed.statements.map((item: any) => [item.file, item]));
const authority = new GovernedPaymentKnowledgeAuthority();
const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialBefore = commercialSemanticFingerprintV1(registries);
const statements: any[] = [];

for (const fixture of GOLD) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: fixture.file, businessType: fixture.businessType });
  const knowledge = authority.resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: deterministicPricing(inspected.document, fixture.file, fixture.businessType, canonical),
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: inspected.economic, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  });
  const profile = attached.profile;
  const admission = profile.fixedCostSensitivityAdmission;
  const existingAdmissions = admission.admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const newAdmissions = admission.admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  const rdAmounts = new Map(inspected.economic.economicLayer.charges.filter((charge) => charge.observedAmount)
    .map((charge) => [charge.id, charge.observedAmount!.amountMinor]));
  const sensitivityAmount = (refs: string[]) => sum(refs.map((ref) => rdAmounts.get(ref) ?? 0));
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic, currentRelationshipProfile: profile, commercialDecomposition: decomposition,
  });
  const accepted = acceptedByFile.get(fixture.file);
  statements.push({
    file: fixture.file,
    sourceDocumentRef: profile.sourceDocumentRef,
    statementPeriod: profile.statementPeriod,
    rdTotalStatementProcessingCostMinor: profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
    before: { fixedChargeCount: existingAdmissions.length, referencedChargedAmountMinor: sum(existingAdmissions.map((record) => record.referencedChargedAmountMinor)) },
    netNew: { fixedChargeCount: newAdmissions.length, referencedChargedAmountMinor: sum(newAdmissions.map((record) => record.referencedChargedAmountMinor)) },
    after: { fixedChargeCount: profile.costStructureSensitivity.fixedCostDrivenChargeRefs.length, referencedChargedAmountMinor: sensitivityAmount(profile.costStructureSensitivity.fixedCostDrivenChargeRefs) },
    siblingSensitivity: {
      count: { chargeCount: profile.costStructureSensitivity.countDrivenChargeRefs.length, referencedChargedAmountMinor: sensitivityAmount(profile.costStructureSensitivity.countDrivenChargeRefs) },
      volume: { chargeCount: profile.costStructureSensitivity.volumeDrivenChargeRefs.length, referencedChargedAmountMinor: sensitivityAmount(profile.costStructureSensitivity.volumeDrivenChargeRefs) },
      mixedMinimum: { chargeCount: profile.costStructureSensitivity.mixedMinimumChargeRefs.length, referencedChargedAmountMinor: sensitivityAmount(profile.costStructureSensitivity.mixedMinimumChargeRefs) },
    },
    admissions: admission.admissions,
    netNewAdmissions: newAdmissions,
    fixedLookingCandidates: [...admission.admissions.map((record) => record.rdChargeRef), ...admission.excludedCandidates.map((record) => record.rdChargeRef)],
    excludedCandidates: admission.excludedCandidates,
    blockerCounts: counts(admission.excludedCandidates.flatMap((candidate) => candidate.blockers)),
    countDrivenChargeRefs: profile.costStructureSensitivity.countDrivenChargeRefs,
    volumeDrivenChargeRefs: profile.costStructureSensitivity.volumeDrivenChargeRefs,
    mixedMinimumChargeRefs: profile.costStructureSensitivity.mixedMinimumChargeRefs,
    admissionAggregate: admission.aggregate,
    admissionSafety: admission.safety,
    profileSensitivityAdditiveContributionMinor: profile.costStructureSensitivity.additiveDriverContributionMinor,
    canonicalFingerprintAccepted: accepted?.canonicalFingerprintCurrent ?? null,
    canonicalFingerprintCurrent: canonicalFinancialTruthFingerprint(canonical),
    rdFingerprintAccepted: accepted?.rdFingerprintCurrent ?? null,
    rdFingerprintCurrent: fingerprint(inspected.economic),
    decompositionFingerprintAccepted: accepted?.decompositionFingerprintCurrent ?? null,
    decompositionFingerprintCurrent: fingerprint(decomposition),
    sourceFingerprintAccepted: accepted?.sourceFingerprintCurrent ?? null,
    sourceFingerprintCurrent: inspected.economic.pricingAnalysis.foundation.identity.sourceFingerprint,
    roundingMetadataAccepted: accepted?.roundingMetadataCurrent ?? null,
    roundingMetadataCurrent: fingerprint(inspected.economic.economicLayer.costStack.roundingResidual ?? null),
    chargedCostFingerprintAccepted: accepted?.chargedCostFingerprintCurrent ?? null,
    chargedCostFingerprintCurrent: fingerprint(profile.chargedCostProfile),
    costStackCategoriesAccepted: accepted?.costStackCategoriesCurrent ?? null,
    costStackCategoriesCurrent: profile.chargedCostProfile.items.map((item) => [item.rdEconomicChargeRef, item.productCostConcept]),
    activityFingerprintAccepted: accepted?.activityFingerprintCurrent ?? null,
    activityFingerprintCurrent: fingerprint({ status: attached.admission.status, decisions: attached.admission.decisions, safety: attached.admission.safety }),
    qualificationFingerprintAccepted: accepted?.qualificationFingerprintCurrent ?? null,
    qualificationFingerprintCurrent: fingerprint({ status: qualification.status, findings: qualification.findings, unresolvedCandidates: qualification.unresolvedCandidates, safety: qualification.safety }),
    countSensitivityFingerprintAccepted: accepted?.countSensitivityFingerprintCurrent ?? null,
    countSensitivityFingerprintCurrent: fingerprint({ status: profile.countDrivenCostSensitivityAdmission.status, admissions: profile.countDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.countDrivenCostSensitivityAdmission.excludedCandidates, safety: profile.countDrivenCostSensitivityAdmission.safety }),
    volumeSensitivityFingerprintAccepted: accepted?.volumeSensitivityFingerprintCurrent ?? null,
    volumeSensitivityFingerprintCurrent: fingerprint({ admissions: profile.volumeDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.volumeDrivenCostSensitivityAdmission.excludedCandidates, aggregate: profile.volumeDrivenCostSensitivityAdmission.aggregate, safety: profile.volumeDrivenCostSensitivityAdmission.safety }),
    mixedMinimumSensitivityFingerprintAccepted: accepted ? fingerprint({ admissions: accepted.admissions, excludedCandidates: accepted.excludedCandidates, aggregate: accepted.admissionAggregate, safety: accepted.admissionSafety }) : null,
    mixedMinimumSensitivityFingerprintCurrent: fingerprint({ admissions: profile.mixedMinimumCostSensitivityAdmission.admissions, excludedCandidates: profile.mixedMinimumCostSensitivityAdmission.excludedCandidates, aggregate: profile.mixedMinimumCostSensitivityAdmission.aggregate, safety: profile.mixedMinimumCostSensitivityAdmission.safety }),
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const allAdmissions = statements.flatMap((statement) => statement.admissions);
const allExcluded = statements.flatMap((statement) => statement.excludedCandidates);
const cadence = (type: string) => allAdmissions.filter((record) => record.cadence.type === type);
const corpus = {
  statementCount: statements.length,
  beforeFixedChargeCount: sum(statements.map((statement) => statement.before.fixedChargeCount)),
  beforeReferencedChargedAmountMinor: sum(statements.map((statement) => statement.before.referencedChargedAmountMinor)),
  newlyAdmittedChargeCount: sum(statements.map((statement) => statement.netNew.fixedChargeCount)),
  newlyAdmittedReferencedAmountMinor: sum(statements.map((statement) => statement.netNew.referencedChargedAmountMinor)),
  afterFixedChargeCount: sum(statements.map((statement) => statement.after.fixedChargeCount)),
  afterReferencedChargedAmountMinor: sum(statements.map((statement) => statement.after.referencedChargedAmountMinor)),
  monthlyChargeCount: cadence("monthly").length,
  monthlyReferencedAmountMinor: sum(cadence("monthly").map((record) => record.referencedChargedAmountMinor)),
  statementPeriodChargeCount: cadence("statement_period").length,
  statementPeriodReferencedAmountMinor: sum(cadence("statement_period").map((record) => record.referencedChargedAmountMinor)),
  annualChargeCount: cadence("annual").length,
  annualReferencedAmountMinor: sum(cadence("annual").map((record) => record.referencedChargedAmountMinor)),
  candidateCount: allAdmissions.length + allExcluded.length,
  excludedCandidateCount: allExcluded.length,
  siblingSensitivity: {
    count: aggregateSibling("count"), volume: aggregateSibling("volume"), mixedMinimum: aggregateSibling("mixedMinimum"),
  },
  blockerCounts: counts(allExcluded.flatMap((candidate) => candidate.blockers)),
};
const safetyCounters = {
  unexpectedGoldStatementCount: corpus.statementCount === 11 ? 0 : 1,
  unexpectedBeforeCountOrAmount: corpus.beforeFixedChargeCount === 0 && corpus.beforeReferencedChargedAmountMinor === 0 ? 0 : 1,
  unexpectedNetNewCountOrAmount: corpus.newlyAdmittedChargeCount === 13 && corpus.newlyAdmittedReferencedAmountMinor === 9_541 ? 0 : 1,
  unexpectedAfterCountOrAmount: corpus.afterFixedChargeCount === 13 && corpus.afterReferencedChargedAmountMinor === 9_541 ? 0 : 1,
  unexpectedCadenceBreakdown: corpus.monthlyChargeCount === 10 && corpus.monthlyReferencedAmountMinor === 5_284 && corpus.statementPeriodChargeCount === 3 && corpus.statementPeriodReferencedAmountMinor === 4_257 && corpus.annualChargeCount === 0 ? 0 : 1,
  unexpectedSiblingSensitivity: corpus.siblingSensitivity.count.chargeCount === 36 && corpus.siblingSensitivity.count.referencedChargedAmountMinor === 117_301 && corpus.siblingSensitivity.volume.chargeCount === 17 && corpus.siblingSensitivity.volume.referencedChargedAmountMinor === 12_248 && corpus.siblingSensitivity.mixedMinimum.chargeCount === 2 && corpus.siblingSensitivity.mixedMinimum.referencedChargedAmountMinor === 474 ? 0 : 1,
  duplicateRdChargeReferences: sum(statements.map((statement) => statement.admissionAggregate.duplicateRdChargeReferenceCount)),
  countVolumeMixedOverlap: sum(statements.map((statement) => statement.admissions.filter((record: any) => statement.countDrivenChargeRefs.includes(record.rdChargeRef) || statement.volumeDrivenChargeRefs.includes(record.rdChargeRef) || statement.mixedMinimumChargeRefs.includes(record.rdChargeRef)).length)),
  admissionsWithoutStatementCadence: allAdmissions.filter((record) => record.cadence.state !== "PROVEN" || record.cadence.source !== "STATEMENT_EXPLICIT").length,
  admissionsWithoutProvenFixedBehavior: allAdmissions.filter((record) => record.fixedBehavior.state !== "PROVEN" || !record.fixedBehavior.amountKnown || !record.fixedBehavior.amountActivityIndependent).length,
  admissionsWithSupportedControl: allAdmissions.filter((record) => record.merchantFacingControl.state === "SUPPORTED").length,
  admissionsWithNegotiabilityClaim: allAdmissions.filter((record) => record.negotiability.state !== "UNKNOWN").length,
  admissionsWithAvoidabilityClaim: allAdmissions.filter((record) => record.avoidability.state !== "UNKNOWN").length,
  additiveSensitivityDollars: sum(allAdmissions.map((record) => record.additiveContributionMinor)) + sum(statements.map((statement) => statement.profileSensitivityAdditiveContributionMinor)),
  annualizationOutputs: sum(statements.map((statement) => statement.admissionSafety.annualizationOutputCount)) + allAdmissions.filter((record) => record.annualization.allowed || record.annualization.annualizedAmountMinor !== null).length,
  canonicalChanges: changed("canonicalFingerprint"), rdChanges: changed("rdFingerprint"), decompositionChanges: changed("decompositionFingerprint"),
  sourceFingerprintChanges: changed("sourceFingerprint"), roundingMetadataChanges: changed("roundingMetadata"),
  activityArtifactChanges: changed("activityFingerprint"), qualificationArtifactChanges: changed("qualificationFingerprint"),
  countSensitivityArtifactChanges: changed("countSensitivityFingerprint"), volumeSensitivityArtifactChanges: changed("volumeSensitivityFingerprint"),
  mixedMinimumSensitivityArtifactChanges: changed("mixedMinimumSensitivityFingerprint"), chargedCostProfileChanges: changed("chargedCostFingerprint"),
  costStackCategoryChanges: statements.filter((statement) => JSON.stringify(statement.costStackCategoriesAccepted) !== JSON.stringify(statement.costStackCategoriesCurrent)).length,
  commercialSourceChanges: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA ? 0 : 1,
  comparisonInputs: sum(statements.map((statement) => statement.admissionSafety.comparisonInputCount)),
  savingsOutputs: sum(statements.map((statement) => statement.admissionSafety.savingsOutputCount)),
  aiOrWebOperations: sum(statements.map((statement) => statement.admissionSafety.aiOrWebOperationCount)),
  newKnowledgeAdmissions: sum(statements.map((statement) => statement.admissionSafety.newKnowledgeAdmissionCount)),
  customerRoutes: statements.filter((statement) => statement.admissionSafety.customerRoutingAllowed).length,
};
const safetyCounterTotal = sum(Object.values(safetyCounters));
const invariants = {
  exactElevenGoldStatements: corpus.statementCount === 11,
  exactBeforeNetNewAndAfterCohort: safetyCounters.unexpectedBeforeCountOrAmount === 0 && safetyCounters.unexpectedNetNewCountOrAmount === 0 && safetyCounters.unexpectedAfterCountOrAmount === 0,
  exactCadenceBreakdown: safetyCounters.unexpectedCadenceBreakdown === 0,
  siblingSensitivityTotalsPreserved: safetyCounters.unexpectedSiblingSensitivity === 0,
  behaviorCadenceControlClaimsSeparated: safetyCounters.admissionsWithoutStatementCadence === 0 && safetyCounters.admissionsWithoutProvenFixedBehavior === 0 && safetyCounters.admissionsWithSupportedControl === 0 && safetyCounters.admissionsWithNegotiabilityClaim === 0 && safetyCounters.admissionsWithAvoidabilityClaim === 0,
  noOverlapOrDoubleCounting: safetyCounters.duplicateRdChargeReferences === 0 && safetyCounters.countVolumeMixedOverlap === 0 && safetyCounters.additiveSensitivityDollars === 0,
  noAnnualization: safetyCounters.annualizationOutputs === 0,
  canonicalRdSourceInvariant11Of11: safetyCounters.canonicalChanges === 0 && safetyCounters.rdChanges === 0 && safetyCounters.sourceFingerprintChanges === 0,
  upstreamAndSiblingArtifactsInvariant11Of11: safetyCounters.decompositionChanges === 0 && safetyCounters.roundingMetadataChanges === 0 && safetyCounters.activityArtifactChanges === 0 && safetyCounters.qualificationArtifactChanges === 0 && safetyCounters.countSensitivityArtifactChanges === 0 && safetyCounters.volumeSensitivityArtifactChanges === 0 && safetyCounters.mixedMinimumSensitivityArtifactChanges === 0 && safetyCounters.chargedCostProfileChanges === 0 && safetyCounters.costStackCategoryChanges === 0,
  commercialSourceInvariant: safetyCounters.commercialSourceChanges === 0,
};
const failures = Object.entries(invariants).filter(([, value]) => !value).map(([name]) => name);
if (safetyCounterTotal !== 0) failures.push("safetyCounterTotal");
const evaluation = {
  schemaVersion: "claim_scoped_fixed_cost_sensitivity_admission_evaluation_2026_09_13_v1",
  generatedAt: "2026-09-13T00:00:00.000Z", mode: "internal_offline", baseline: BASELINE,
  governedCommercialSource: { expectedSha256: EXPECTED_COMMERCIAL_SHA, beforeSha256: commercialBefore, afterSha256: commercialAfter, unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA },
  corpus, statements, invariants, safetyCounters, safetyCounterTotal, knownUnrelatedIssues: acceptedMixed.knownUnrelatedIssues,
};
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/evaluation-2026-09-13.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(`${OUT}/report-2026-09-13.md`, report(evaluation));
console.log(JSON.stringify({ corpus, invariants, safetyCounters, safetyCounterTotal, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;

function changed(prefix: string): number { return statements.filter((statement) => statement[`${prefix}Accepted`] !== statement[`${prefix}Current`]).length; }
function aggregateSibling(kind: "count" | "volume" | "mixedMinimum") { return { chargeCount: sum(statements.map((statement) => statement.siblingSensitivity[kind].chargeCount)), referencedChargedAmountMinor: sum(statements.map((statement) => statement.siblingSensitivity[kind].referencedChargedAmountMinor)) }; }
function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null, deterministic: true };
}
function report(value: any): string {
  const rows = value.statements.map((item: any) => `| ${item.file} | ${money(item.rdTotalStatementProcessingCostMinor ?? 0)} | ${item.fixedLookingCandidates.length} | ${item.netNew.fixedChargeCount} / ${money(item.netNew.referencedChargedAmountMinor)} | ${item.excludedCandidates.length} |`).join("\n");
  const proofs = value.statements.flatMap((item: any) => item.netNewAdmissions.map((record: any) => `| ${item.file} | ${record.rdChargeRef} | ${money(record.referencedChargedAmountMinor)} | ${record.cadence.type} | ${record.cadence.evidenceRefs.join("<br>")} | ${record.economicCategory.value} | ${record.economicCategory.evidenceRefs.join("<br>")} | ${record.merchantFacingControl.state} | ${record.priceSetter.state} | ${record.negotiability.state} | ${record.avoidability.state} |`)).join("\n");
  const exclusions = value.statements.flatMap((item: any) => item.excludedCandidates.map((record: any) => `| ${item.file} | ${record.rdChargeRef} | ${record.printedLabel ?? "—"} | ${record.blockers.join(", ")} |`)).join("\n");
  return `# Claim-Scoped Fixed Cost Sensitivity Admission v1\n\nBaseline: \`${value.baseline.commit}\`. Governed commercial source: \`${value.governedCommercialSource.afterSha256}\` (unchanged).\n\nBefore: ${value.corpus.beforeFixedChargeCount} / ${money(value.corpus.beforeReferencedChargedAmountMinor)}. Net new: ${value.corpus.newlyAdmittedChargeCount} / ${money(value.corpus.newlyAdmittedReferencedAmountMinor)}. After: ${value.corpus.afterFixedChargeCount} / ${money(value.corpus.afterReferencedChargedAmountMinor)}. Monthly: ${value.corpus.monthlyChargeCount} / ${money(value.corpus.monthlyReferencedAmountMinor)}. Statement-period: ${value.corpus.statementPeriodChargeCount} / ${money(value.corpus.statementPeriodReferencedAmountMinor)}.\n\n| Statement | RD total | Fixed-looking candidates | Admitted | Excluded |\n|---|---:|---:|---:|---:|\n${rows}\n\n## Exact admitted references\n\n| Statement | RD charge | Dollars | Cadence | Cadence evidence | Economic category | Category evidence | Control | Price setter | Negotiability | Avoidability |\n|---|---|---:|---|---|---|---|---|---|---|---|\n${proofs}\n\n## Excluded candidates and blockers\n\n| Statement | RD charge | Printed label | Blockers |\n|---|---|---|---|\n${exclusions}\n\nCount remains ${value.corpus.siblingSensitivity.count.chargeCount} / ${money(value.corpus.siblingSensitivity.count.referencedChargedAmountMinor)}; volume remains ${value.corpus.siblingSensitivity.volume.chargeCount} / ${money(value.corpus.siblingSensitivity.volume.referencedChargedAmountMinor)}; mixed/minimum remains ${value.corpus.siblingSensitivity.mixedMinimum.chargeCount} / ${money(value.corpus.siblingSensitivity.mixedMinimum.referencedChargedAmountMinor)}. Fixed sensitivity adds $0.00 and performs no annualization. Canonical, RD, source, rounding, activity, qualification/integrity, sibling sensitivity, charged-cost, category, and commercial-source artifacts are invariant 11/11. Safety counter total: ${value.safetyCounterTotal}.\n`;
}
function counts(values: string[]): Record<string, number> { return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {}); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function money(amountMinor: number): string { return `$${(amountMinor / 100).toFixed(2)}`; }
