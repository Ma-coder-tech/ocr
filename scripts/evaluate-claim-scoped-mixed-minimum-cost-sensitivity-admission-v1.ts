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

const OUT = "evaluations/claim-scoped-mixed-minimum-cost-sensitivity-admission-v1";
const BASELINE = {
  branch: "codex/claim-scoped-volume-driven-cost-sensitivity-admission-v1",
  commit: "74fbcb7cd7c95d123fff7d719b741043038f6d70",
  parent: "1e23a157912b3f8a00788b6cc8c8308bf7a41fbe",
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

const acceptedVolume = JSON.parse(await readFile(
  "evaluations/claim-scoped-volume-driven-cost-sensitivity-admission-v1/evaluation-2026-09-13.json", "utf8",
));
const acceptedByFile = new Map<string, any>(acceptedVolume.statements.map((item: any) => [item.file, item]));
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
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: canonical,
    commercialDecomposition: decomposition,
  });
  const profile = attached.profile;
  const admission = profile.mixedMinimumCostSensitivityAdmission;
  const existingAdmissions = admission.admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const newAdmissions = admission.admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  const rdAmounts = new Map(inspected.economic.economicLayer.charges.filter((charge) => charge.observedAmount)
    .map((charge) => [charge.id, charge.observedAmount!.amountMinor]));
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic,
    currentRelationshipProfile: profile,
    commercialDecomposition: decomposition,
  });
  const qualificationRefs = new Set(qualification.findings.flatMap((finding) => finding.rdChargeRefs));
  const qualificationOverlap = admission.admissions.filter((record) => qualificationRefs.has(record.rdChargeRef)).map((record) => ({
    rdChargeRef: record.rdChargeRef,
    sensitivityAdditiveContributionMinor: record.additiveContributionMinor,
    driverAdditiveContributionMinor: qualification.findings.find((finding) => finding.rdChargeRefs.includes(record.rdChargeRef))?.additiveContributionMinor ?? null,
  }));
  const accepted = acceptedByFile.get(fixture.file);
  statements.push({
    file: fixture.file,
    sourceDocumentRef: profile.sourceDocumentRef,
    statementPeriod: profile.statementPeriod,
    rdTotalStatementProcessingCostMinor: profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
    before: {
      mixedMinimumChargeCount: existingAdmissions.length,
      referencedChargedAmountMinor: sum(existingAdmissions.map((record) => record.referencedChargedAmountMinor)),
    },
    netNew: {
      mixedMinimumChargeCount: newAdmissions.length,
      referencedChargedAmountMinor: sum(newAdmissions.map((record) => record.referencedChargedAmountMinor)),
    },
    after: {
      mixedMinimumChargeCount: profile.costStructureSensitivity.mixedMinimumChargeRefs.length,
      referencedChargedAmountMinor: sum(profile.costStructureSensitivity.mixedMinimumChargeRefs.map((ref) => rdAmounts.get(ref) ?? 0)),
    },
    admissions: admission.admissions,
    netNewAdmissions: newAdmissions,
    excludedCandidates: admission.excludedCandidates,
    blockerCounts: counts(admission.excludedCandidates.flatMap((candidate) => candidate.blockers)),
    countDrivenChargeRefs: profile.costStructureSensitivity.countDrivenChargeRefs,
    volumeDrivenChargeRefs: profile.costStructureSensitivity.volumeDrivenChargeRefs,
    qualificationOverlap,
    admissionAggregate: admission.aggregate,
    admissionSafety: admission.safety,
    profileSensitivityAdditiveContributionMinor: profile.costStructureSensitivity.additiveDriverContributionMinor,
    canonicalFingerprintAccepted: accepted?.canonicalFingerprintAfter ?? null,
    canonicalFingerprintCurrent: canonicalFinancialTruthFingerprint(canonical),
    rdFingerprintAccepted: accepted?.rdFingerprintAfter ?? null,
    rdFingerprintCurrent: fingerprint(inspected.economic),
    decompositionFingerprintAccepted: accepted?.decompositionFingerprintAfter ?? null,
    decompositionFingerprintCurrent: fingerprint(decomposition),
    sourceFingerprintAccepted: accepted?.sourceFingerprintAfter ?? null,
    sourceFingerprintCurrent: inspected.economic.pricingAnalysis.foundation.identity.sourceFingerprint,
    roundingMetadataAccepted: accepted?.roundingMetadataAfter ?? null,
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
    volumeSensitivityFingerprintAccepted: accepted ? fingerprint({ admissions: accepted.admissions, excludedCandidates: accepted.excludedCandidates, aggregate: accepted.admissionAggregate, safety: accepted.admissionSafety }) : null,
    volumeSensitivityFingerprintCurrent: fingerprint({ admissions: profile.volumeDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.volumeDrivenCostSensitivityAdmission.excludedCandidates, aggregate: profile.volumeDrivenCostSensitivityAdmission.aggregate, safety: profile.volumeDrivenCostSensitivityAdmission.safety }),
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const allAdmissions = statements.flatMap((statement) => statement.admissions);
const allExcluded = statements.flatMap((statement) => statement.excludedCandidates);
const corpus = {
  statementCount: statements.length,
  beforeMixedMinimumChargeCount: sum(statements.map((statement) => statement.before.mixedMinimumChargeCount)),
  beforeReferencedChargedAmountMinor: sum(statements.map((statement) => statement.before.referencedChargedAmountMinor)),
  newlyAdmittedChargeCount: sum(statements.map((statement) => statement.netNew.mixedMinimumChargeCount)),
  newlyAdmittedReferencedAmountMinor: sum(statements.map((statement) => statement.netNew.referencedChargedAmountMinor)),
  afterMixedMinimumChargeCount: sum(statements.map((statement) => statement.after.mixedMinimumChargeCount)),
  afterReferencedChargedAmountMinor: sum(statements.map((statement) => statement.after.referencedChargedAmountMinor)),
  candidateCount: allAdmissions.length + allExcluded.length,
  excludedCandidateCount: allExcluded.length,
  qualificationOverlapCount: sum(statements.map((statement) => statement.qualificationOverlap.length)),
  blockerCounts: counts(allExcluded.flatMap((candidate) => candidate.blockers)),
};
const safetyCounters = {
  unexpectedGoldStatementCount: corpus.statementCount === 11 ? 0 : 1,
  unexpectedBeforeCountOrAmount: corpus.beforeMixedMinimumChargeCount === 0 && corpus.beforeReferencedChargedAmountMinor === 0 ? 0 : 1,
  unexpectedNetNewCountOrAmount: corpus.newlyAdmittedChargeCount === 2 && corpus.newlyAdmittedReferencedAmountMinor === 474 ? 0 : 1,
  unexpectedAfterCountOrAmount: corpus.afterMixedMinimumChargeCount === 2 && corpus.afterReferencedChargedAmountMinor === 474 ? 0 : 1,
  duplicateRdChargeReferences: sum(statements.map((statement) => statement.admissionAggregate.duplicateRdChargeReferenceCount)),
  nonReproducingAdmissions: allAdmissions.filter((record) => record.arithmetic.status !== "reproduces" || record.arithmetic.exactAmount?.roundedAmountMinor !== record.referencedChargedAmountMinor).length,
  admissionsWithoutProviderControl: allAdmissions.filter((record) => record.merchantFacingProviderControl.state !== "SUPPORTED" || record.merchantFacingProviderControl.value !== "acquiring_side_program").length,
  countOrVolumeOverlap: sum(statements.map((statement) => statement.admissions.filter((record: any) => statement.countDrivenChargeRefs.includes(record.rdChargeRef) || statement.volumeDrivenChargeRefs.includes(record.rdChargeRef)).length)),
  additiveSensitivityDollars: sum(allAdmissions.map((record) => record.additiveContributionMinor)) + sum(statements.map((statement) => statement.profileSensitivityAdditiveContributionMinor)),
  nonZeroQualificationOverlapDollars: sum(statements.flatMap((statement) => statement.qualificationOverlap).filter((item) => item.sensitivityAdditiveContributionMinor !== 0 || item.driverAdditiveContributionMinor !== 0).map(() => 1)),
  canonicalChanges: statements.filter((statement) => statement.canonicalFingerprintAccepted !== statement.canonicalFingerprintCurrent).length,
  rdChanges: statements.filter((statement) => statement.rdFingerprintAccepted !== statement.rdFingerprintCurrent).length,
  decompositionChanges: statements.filter((statement) => statement.decompositionFingerprintAccepted !== statement.decompositionFingerprintCurrent).length,
  sourceFingerprintChanges: statements.filter((statement) => statement.sourceFingerprintAccepted !== statement.sourceFingerprintCurrent).length,
  roundingMetadataChanges: statements.filter((statement) => statement.roundingMetadataAccepted !== statement.roundingMetadataCurrent).length,
  activityArtifactChanges: statements.filter((statement) => statement.activityFingerprintAccepted !== statement.activityFingerprintCurrent).length,
  qualificationArtifactChanges: statements.filter((statement) => statement.qualificationFingerprintAccepted !== statement.qualificationFingerprintCurrent).length,
  countSensitivityArtifactChanges: statements.filter((statement) => statement.countSensitivityFingerprintAccepted !== statement.countSensitivityFingerprintCurrent).length,
  volumeSensitivityArtifactChanges: statements.filter((statement) => statement.volumeSensitivityFingerprintAccepted !== statement.volumeSensitivityFingerprintCurrent).length,
  chargedCostProfileChanges: statements.filter((statement) => statement.chargedCostFingerprintAccepted !== statement.chargedCostFingerprintCurrent).length,
  costStackCategoryChanges: statements.filter((statement) => JSON.stringify(statement.costStackCategoriesAccepted) !== JSON.stringify(statement.costStackCategoriesCurrent)).length,
  commercialSourceChanges: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA ? 0 : 1,
  comparisonInputs: sum(statements.map((statement) => statement.admissionSafety.comparisonInputCount)),
  savingsOutputs: sum(statements.map((statement) => statement.admissionSafety.savingsOutputCount)),
  annualizations: sum(statements.map((statement) => statement.admissionSafety.annualizationOutputCount)),
  aiOrWebOperations: sum(statements.map((statement) => statement.admissionSafety.aiOrWebOperationCount)),
  newKnowledgeAdmissions: sum(statements.map((statement) => statement.admissionSafety.newKnowledgeAdmissionCount)),
  customerRoutes: statements.filter((statement) => statement.admissionSafety.customerRoutingAllowed).length,
};
const safetyCounterTotal = sum(Object.values(safetyCounters));
const invariants = {
  exactElevenGoldStatements: corpus.statementCount === 11,
  exactBeforeCohort: corpus.beforeMixedMinimumChargeCount === 0 && corpus.beforeReferencedChargedAmountMinor === 0,
  exactNetNewCohort: corpus.newlyAdmittedChargeCount === 2 && corpus.newlyAdmittedReferencedAmountMinor === 474,
  exactAfterCohort: corpus.afterMixedMinimumChargeCount === 2 && corpus.afterReferencedChargedAmountMinor === 474,
  everyAdmissionReproducesExactArithmetic: safetyCounters.nonReproducingAdmissions === 0,
  everyAdmissionHasProviderControl: safetyCounters.admissionsWithoutProviderControl === 0,
  noCountVolumeOrQualificationDoubleCounting: safetyCounters.countOrVolumeOverlap === 0 && safetyCounters.nonZeroQualificationOverlapDollars === 0,
  countAndVolumeSensitivityInvariant11Of11: safetyCounters.countSensitivityArtifactChanges === 0 && safetyCounters.volumeSensitivityArtifactChanges === 0,
  qualificationAndActivityInvariant11Of11: safetyCounters.qualificationArtifactChanges === 0 && safetyCounters.activityArtifactChanges === 0,
  chargedCostAndCategoriesInvariant11Of11: safetyCounters.chargedCostProfileChanges === 0 && safetyCounters.costStackCategoryChanges === 0,
  canonicalRdSourceInvariant11Of11: safetyCounters.canonicalChanges === 0 && safetyCounters.rdChanges === 0 && safetyCounters.sourceFingerprintChanges === 0,
  boundedRoundingMetadataInvariant11Of11: safetyCounters.roundingMetadataChanges === 0,
  commercialSourceInvariant: safetyCounters.commercialSourceChanges === 0,
  zeroAdditiveSensitivityDollars: safetyCounters.additiveSensitivityDollars === 0,
};
const failures = Object.entries(invariants).filter(([, value]) => !value).map(([name]) => name);
if (safetyCounterTotal !== 0) failures.push("safetyCounterTotal");
const evaluation = {
  schemaVersion: "claim_scoped_mixed_minimum_cost_sensitivity_admission_evaluation_2026_09_13_v1",
  generatedAt: "2026-09-13T00:00:00.000Z",
  mode: "internal_offline",
  baseline: BASELINE,
  governedCommercialSource: { expectedSha256: EXPECTED_COMMERCIAL_SHA, beforeSha256: commercialBefore, afterSha256: commercialAfter, unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA },
  corpus,
  statements,
  invariants,
  safetyCounters,
  safetyCounterTotal,
  knownUnrelatedIssues: acceptedVolume.knownUnrelatedIssues,
};
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/evaluation-2026-09-13.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(`${OUT}/report-2026-09-13.md`, report(evaluation));
console.log(JSON.stringify({ corpus, invariants, safetyCounters, safetyCounterTotal, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null, deterministic: true };
}

function report(value: any): string {
  const statementRows = value.statements.map((item: any) => `| ${item.file} | ${money(item.rdTotalStatementProcessingCostMinor ?? 0)} | ${item.before.mixedMinimumChargeCount} / ${money(item.before.referencedChargedAmountMinor)} | ${item.netNew.mixedMinimumChargeCount} / ${money(item.netNew.referencedChargedAmountMinor)} | ${item.after.mixedMinimumChargeCount} / ${money(item.after.referencedChargedAmountMinor)} | ${item.excludedCandidates.length} |`).join("\n");
  const proofs = value.statements.flatMap((item: any) => item.netNewAdmissions.map((record: any) => `| ${item.file} | ${record.rdChargeRef} | ${record.relationshipType} | ${record.operands.appliedMinimumCount} × ${money(Number(record.operands.perEventRateDollars) * 100)} | ${money(record.referencedChargedAmountMinor)} | ${record.merchantFacingProviderControl.value} |`)).join("\n");
  const blockers = Object.entries(value.corpus.blockerCounts).map(([blocker, count]) => `| ${blocker} | ${count} |`).join("\n");
  return `# Claim-Scoped Mixed/Minimum Cost Sensitivity Admission v1\n\n` +
    `Baseline: \`${value.baseline.commit}\`. Governed commercial source: \`${value.governedCommercialSource.afterSha256}\` (unchanged).\n\n` +
    `Before: ${value.corpus.beforeMixedMinimumChargeCount} / ${money(value.corpus.beforeReferencedChargedAmountMinor)}. Net new: ${value.corpus.newlyAdmittedChargeCount} / ${money(value.corpus.newlyAdmittedReferencedAmountMinor)}. After: ${value.corpus.afterMixedMinimumChargeCount} / ${money(value.corpus.afterReferencedChargedAmountMinor)}.\n\n` +
    `| Statement | RD total | Before | Net new | After | Excluded candidates |\n|---|---:|---:|---:|---:|---:|\n${statementRows}\n\n` +
    `## Net-new exact proofs\n\n| Statement | RD charge | Relationship | Operands | Charge | Control |\n|---|---|---|---:|---:|---|\n${proofs}\n\n` +
    `## Exclusion blockers\n\n| Blocker | Candidate rows |\n|---|---:|\n${blockers}\n\n` +
    `Mixed/minimum sensitivity adds $0.00. Canonical, RD, source, rounding, activity, qualification/integrity, count sensitivity, volume sensitivity, charged costs, categories, and commercial source are invariant 11/11. Safety counter total: ${value.safetyCounterTotal}.\n`;
}

function counts(values: string[]): Record<string, number> { return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {}); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function money(amountMinor: number): string { return `$${(amountMinor / 100).toFixed(2)}`; }
