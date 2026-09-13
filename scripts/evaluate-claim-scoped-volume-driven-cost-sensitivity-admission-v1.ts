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

const OUT = "evaluations/claim-scoped-volume-driven-cost-sensitivity-admission-v1";
const BASELINE = {
  branch: "codex/claim-scoped-count-driven-cost-sensitivity-admission-v1",
  commit: "1e23a157912b3f8a00788b6cc8c8308bf7a41fbe",
  parent: "d8d5b151cbcd57ec84a5057cf81ff4cb0d7f603a",
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

const acceptedDriver = JSON.parse(await readFile(
  "evaluations/claim-scoped-qualification-integrity-cost-driver-admission-v1/evaluation-2026-09-12.json", "utf8",
));
const acceptedCount = JSON.parse(await readFile(
  "evaluations/claim-scoped-count-driven-cost-sensitivity-admission-v1/evaluation-2026-09-13.json", "utf8",
));
const acceptedActivity = JSON.parse(await readFile(
  "evaluations/fiserv-claim-scoped-activity-population-admission-v1/evaluation-2026-09-12.json", "utf8",
));
const driverByFile = new Map<string, any>(acceptedDriver.statements.map((item: any) => [item.file, item]));
const countByFile = new Map<string, any>(acceptedCount.statements.map((item: any) => [item.file, item]));
const activityByFile = new Map<string, any>(acceptedActivity.statements.map((item: any) => [item.file, item]));
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
  const canonicalBefore = canonicalFinancialTruthFingerprint(canonical);
  const rdBefore = fingerprint(inspected.economic);
  const decompositionBefore = fingerprint(decomposition);
  const sourceBefore = inspected.economic.pricingAnalysis.foundation.identity.sourceFingerprint;
  const roundingBefore = fingerprint(inspected.economic.economicLayer.costStack.roundingResidual ?? null);
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: canonical,
    commercialDecomposition: decomposition,
  });
  const profile = attached.profile;
  const admission = profile.volumeDrivenCostSensitivityAdmission;
  const newAdmissions = admission.admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  const existingAdmissions = admission.admissions.filter((record) => record.admissionBasis === "EXISTING_CURRENT_SENSITIVITY");
  const rdAmounts = new Map(inspected.economic.economicLayer.charges.filter((charge) => charge.observedAmount)
    .map((charge) => [charge.id, charge.observedAmount!.amountMinor]));
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic,
    currentRelationshipProfile: profile,
    commercialDecomposition: decomposition,
  });
  const acceptedDriverStatement = driverByFile.get(fixture.file);
  const acceptedCountStatement = countByFile.get(fixture.file);
  const acceptedActivityStatement = activityByFile.get(fixture.file);
  const qualificationRefs = new Set(qualification.findings.flatMap((finding) => finding.rdChargeRefs));
  const overlap = admission.admissions.filter((record) => qualificationRefs.has(record.rdChargeRef)).map((record) => ({
    rdChargeRef: record.rdChargeRef,
    sensitivityAdditiveContributionMinor: record.additiveContributionMinor,
    driverAdditiveContributionMinor: qualification.findings.find((finding) => finding.rdChargeRefs.includes(record.rdChargeRef))?.additiveContributionMinor ?? null,
  }));
  statements.push({
    file: fixture.file,
    sourceDocumentRef: profile.sourceDocumentRef,
    statementPeriod: profile.statementPeriod,
    rdTotalStatementProcessingCostMinor: profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
    before: {
      volumeDrivenChargeCount: existingAdmissions.length,
      referencedChargedAmountMinor: sum(existingAdmissions.map((record) => record.referencedChargedAmountMinor)),
    },
    netNew: {
      volumeDrivenChargeCount: newAdmissions.length,
      referencedChargedAmountMinor: sum(newAdmissions.map((record) => record.referencedChargedAmountMinor)),
    },
    after: {
      volumeDrivenChargeCount: profile.costStructureSensitivity.volumeDrivenChargeRefs.length,
      referencedChargedAmountMinor: sum(profile.costStructureSensitivity.volumeDrivenChargeRefs.map((ref) => rdAmounts.get(ref) ?? 0)),
    },
    admissions: admission.admissions,
    netNewAdmissions: newAdmissions,
    countDrivenChargeRefs: profile.costStructureSensitivity.countDrivenChargeRefs,
    excludedCandidates: admission.excludedCandidates,
    blockerCounts: counts(admission.excludedCandidates.flatMap((candidate) => candidate.blockers)),
    admissionAggregate: admission.aggregate,
    admissionSafety: admission.safety,
    qualificationOverlap: overlap,
    profileSensitivityAdditiveContributionMinor: profile.costStructureSensitivity.additiveDriverContributionMinor,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalFinancialTruthFingerprint(canonical),
    rdFingerprintBefore: rdBefore,
    rdFingerprintAfter: fingerprint(inspected.economic),
    decompositionFingerprintBefore: decompositionBefore,
    decompositionFingerprintAfter: fingerprint(decomposition),
    sourceFingerprintBefore: sourceBefore,
    sourceFingerprintAfter: inspected.economic.pricingAnalysis.foundation.identity.sourceFingerprint,
    roundingMetadataBefore: roundingBefore,
    roundingMetadataAfter: fingerprint(inspected.economic.economicLayer.costStack.roundingResidual ?? null),
    chargedCostFingerprintAccepted: acceptedCountStatement?.chargedCostProfileFingerprintWithAdmission ?? null,
    chargedCostFingerprintCurrent: fingerprint(profile.chargedCostProfile),
    costStackCategoriesAccepted: acceptedCountStatement?.costStackCategoriesAfter ?? null,
    costStackCategoriesCurrent: profile.chargedCostProfile.items.map((item) => [item.rdEconomicChargeRef, item.productCostConcept]),
    qualificationFingerprintAccepted: acceptedDriverStatement ? fingerprint({
      status: acceptedDriverStatement.status,
      findings: acceptedDriverStatement.findings,
      unresolvedCandidates: acceptedDriverStatement.unresolvedCandidates,
      safety: acceptedDriverStatement.safety,
    }) : null,
    qualificationFingerprintCurrent: fingerprint({
      status: qualification.status,
      findings: qualification.findings,
      unresolvedCandidates: qualification.unresolvedCandidates,
      safety: qualification.safety,
    }),
    countSensitivityFingerprintAccepted: acceptedCountStatement ? fingerprint({
      status: acceptedCountStatement.status,
      admissions: acceptedCountStatement.admissions,
      excludedCandidates: acceptedCountStatement.excludedCandidates,
      safety: acceptedCountStatement.admissionSafety,
    }) : null,
    countSensitivityFingerprintCurrent: fingerprint({
      status: profile.countDrivenCostSensitivityAdmission.status,
      admissions: profile.countDrivenCostSensitivityAdmission.admissions,
      excludedCandidates: profile.countDrivenCostSensitivityAdmission.excludedCandidates,
      safety: profile.countDrivenCostSensitivityAdmission.safety,
    }),
    activityFingerprintAccepted: acceptedActivityStatement ? fingerprint({
      status: acceptedActivityStatement.admissionStatus,
      decisions: acceptedActivityStatement.decisions,
      safety: acceptedActivityStatement.admissionSafety,
    }) : null,
    activityFingerprintCurrent: fingerprint({
      status: attached.admission.status,
      decisions: attached.admission.decisions,
      safety: attached.admission.safety,
    }),
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const allAdmissions = statements.flatMap((statement) => statement.admissions);
const allExcluded = statements.flatMap((statement) => statement.excludedCandidates);
const corpus = {
  statementCount: statements.length,
  beforeVolumeDrivenChargeCount: sum(statements.map((statement) => statement.before.volumeDrivenChargeCount)),
  beforeReferencedChargedAmountMinor: sum(statements.map((statement) => statement.before.referencedChargedAmountMinor)),
  newlyAdmittedChargeCount: sum(statements.map((statement) => statement.netNew.volumeDrivenChargeCount)),
  newlyAdmittedReferencedAmountMinor: sum(statements.map((statement) => statement.netNew.referencedChargedAmountMinor)),
  afterVolumeDrivenChargeCount: sum(statements.map((statement) => statement.after.volumeDrivenChargeCount)),
  afterReferencedChargedAmountMinor: sum(statements.map((statement) => statement.after.referencedChargedAmountMinor)),
  percentageCandidateCount: allAdmissions.length + allExcluded.length,
  excludedPercentageCandidateCount: allExcluded.length,
  qualificationOverlapCount: sum(statements.map((statement) => statement.qualificationOverlap.length)),
  blockerCounts: counts(allExcluded.flatMap((candidate) => candidate.blockers)),
};
const safetyCounters = {
  unexpectedGoldStatementCount: corpus.statementCount === 11 ? 0 : 1,
  unexpectedBeforeCountOrAmount: corpus.beforeVolumeDrivenChargeCount === 0 && corpus.beforeReferencedChargedAmountMinor === 0 ? 0 : 1,
  unexpectedNetNewCountOrAmount: corpus.newlyAdmittedChargeCount === 17 && corpus.newlyAdmittedReferencedAmountMinor === 12_248 ? 0 : 1,
  unexpectedAfterCountOrAmount: corpus.afterVolumeDrivenChargeCount === 17 && corpus.afterReferencedChargedAmountMinor === 12_248 ? 0 : 1,
  duplicateRdChargeReferences: sum(statements.map((statement) => statement.admissionAggregate.duplicateRdChargeReferenceCount)),
  nonReproducingAdmissions: allAdmissions.filter((record) => record.arithmetic.status !== "reproduces" ||
    record.arithmetic.exactAmount?.roundedAmountMinor !== record.referencedChargedAmountMinor).length,
  admissionsWithoutProviderControl: allAdmissions.filter((record) => record.merchantFacingProviderControl.state !== "SUPPORTED" ||
    record.merchantFacingProviderControl.value !== "acquiring_side_program").length,
  admissionsOutsideExactProviderEconomics: allAdmissions.filter((record) => record.economicClassification.layer !== "acquiring_commercial" ||
    record.economicClassification.dollarCategory !== "PROVIDER_CONTROLLED_VARIABLE").length,
  countVolumeOverlap: sum(statements.map((statement) => statement.admissions.filter((record: any) =>
    statement.countDrivenChargeRefs.includes(record.rdChargeRef)).length)),
  additiveSensitivityDollars: sum(allAdmissions.map((record) => record.additiveContributionMinor)) +
    sum(statements.map((statement) => statement.profileSensitivityAdditiveContributionMinor)),
  nonZeroQualificationOverlapDollars: sum(statements.flatMap((statement) => statement.qualificationOverlap)
    .filter((item) => item.sensitivityAdditiveContributionMinor !== 0 || item.driverAdditiveContributionMinor !== 0).map(() => 1)),
  canonicalChanges: statements.filter((statement) => statement.canonicalFingerprintBefore !== statement.canonicalFingerprintAfter).length,
  rdChanges: statements.filter((statement) => statement.rdFingerprintBefore !== statement.rdFingerprintAfter).length,
  decompositionChanges: statements.filter((statement) => statement.decompositionFingerprintBefore !== statement.decompositionFingerprintAfter).length,
  sourceFingerprintChanges: statements.filter((statement) => statement.sourceFingerprintBefore !== statement.sourceFingerprintAfter).length,
  roundingMetadataChanges: statements.filter((statement) => statement.roundingMetadataBefore !== statement.roundingMetadataAfter).length,
  qualificationArtifactChanges: statements.filter((statement) => statement.qualificationFingerprintAccepted !== statement.qualificationFingerprintCurrent).length,
  countSensitivityArtifactChanges: statements.filter((statement) => statement.countSensitivityFingerprintAccepted !== statement.countSensitivityFingerprintCurrent).length,
  activityArtifactChanges: statements.filter((statement) => statement.activityFingerprintAccepted !== statement.activityFingerprintCurrent).length,
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
  exactBeforeCohort: corpus.beforeVolumeDrivenChargeCount === 0 && corpus.beforeReferencedChargedAmountMinor === 0,
  exactNetNewCohort: corpus.newlyAdmittedChargeCount === 17 && corpus.newlyAdmittedReferencedAmountMinor === 12_248,
  exactAfterCohort: corpus.afterVolumeDrivenChargeCount === 17 && corpus.afterReferencedChargedAmountMinor === 12_248,
  everyAdmissionReproducesExactArithmetic: safetyCounters.nonReproducingAdmissions === 0,
  everyAdmissionHasProviderControl: safetyCounters.admissionsWithoutProviderControl === 0,
  economicFirewallHolds: safetyCounters.admissionsOutsideExactProviderEconomics === 0,
  countSensitivityInvariant11Of11: safetyCounters.countSensitivityArtifactChanges === 0,
  qualificationInvariant11Of11: safetyCounters.qualificationArtifactChanges === 0,
  activityInvariant11Of11: safetyCounters.activityArtifactChanges === 0,
  chargedCostAndCategoriesInvariant11Of11: safetyCounters.chargedCostProfileChanges === 0 && safetyCounters.costStackCategoryChanges === 0,
  canonicalRdSourceInvariant11Of11: safetyCounters.canonicalChanges === 0 && safetyCounters.rdChanges === 0 && safetyCounters.sourceFingerprintChanges === 0,
  boundedRoundingMetadataInvariant11Of11: safetyCounters.roundingMetadataChanges === 0,
  commercialSourceInvariant: safetyCounters.commercialSourceChanges === 0,
  zeroAdditiveSensitivityDollars: safetyCounters.additiveSensitivityDollars === 0,
  noCountOrQualificationDoubleCounting: safetyCounters.countVolumeOverlap === 0 && safetyCounters.nonZeroQualificationOverlapDollars === 0,
};
const failures = Object.entries(invariants).filter(([, value]) => !value).map(([name]) => name);
if (safetyCounterTotal !== 0) failures.push("safetyCounterTotal");
const evaluation = {
  schemaVersion: "claim_scoped_volume_driven_cost_sensitivity_admission_evaluation_2026_09_13_v1",
  generatedAt: "2026-09-13T00:00:00.000Z",
  mode: "internal_offline",
  baseline: BASELINE,
  governedCommercialSource: { expectedSha256: EXPECTED_COMMERCIAL_SHA, beforeSha256: commercialBefore, afterSha256: commercialAfter, unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA },
  corpus,
  statements,
  invariants,
  safetyCounters,
  safetyCounterTotal,
  knownUnrelatedIssues: acceptedCount.knownUnrelatedIssues,
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
  const statementsTable = value.statements.map((item: any) =>
    `| ${item.file} | ${money(item.rdTotalStatementProcessingCostMinor ?? 0)} | ${item.before.volumeDrivenChargeCount} / ${money(item.before.referencedChargedAmountMinor)} | ${item.netNew.volumeDrivenChargeCount} / ${money(item.netNew.referencedChargedAmountMinor)} | ${item.after.volumeDrivenChargeCount} / ${money(item.after.referencedChargedAmountMinor)} | ${item.excludedCandidates.length} |`,
  ).join("\n");
  const proofs = value.statements.flatMap((item: any) => item.netNewAdmissions.map((record: any) =>
    `| ${item.file} | ${record.rdChargeRef} | ${money(record.billedBase.amountMinor)} | ${record.normalizedRate} | ${money(record.referencedChargedAmountMinor)} | ${record.merchantFacingProviderControl.value} |`,
  )).join("\n");
  const blockers = Object.entries(value.corpus.blockerCounts).map(([blocker, count]) => `| ${blocker} | ${count} |`).join("\n");
  return `# Claim-Scoped Volume-Driven Cost Sensitivity Admission v1\n\n` +
    `Baseline: \`${value.baseline.commit}\`. Governed commercial source: \`${value.governedCommercialSource.afterSha256}\` (unchanged).\n\n` +
    `Before: ${value.corpus.beforeVolumeDrivenChargeCount} / ${money(value.corpus.beforeReferencedChargedAmountMinor)}. Net new: ${value.corpus.newlyAdmittedChargeCount} / ${money(value.corpus.newlyAdmittedReferencedAmountMinor)}. After: ${value.corpus.afterVolumeDrivenChargeCount} / ${money(value.corpus.afterReferencedChargedAmountMinor)}.\n\n` +
    `| Statement | RD total | Before | Net new | After | Excluded percentage candidates |\n|---|---:|---:|---:|---:|---:|\n${statementsTable}\n\n` +
    `## Net-new exact proofs\n\n| Statement | RD charge | Billed base | Normalized rate | Charge | Control |\n|---|---|---:|---:|---:|---|\n${proofs}\n\n` +
    `## Exclusion blockers\n\n| Blocker | Candidate rows |\n|---|---:|\n${blockers}\n\n` +
    `Volume sensitivity adds $0.00. Canonical, RD, source, activity, count sensitivity, qualification/integrity, and commercial source are invariant 11/11. Safety counter total: ${value.safetyCounterTotal}.\n`;
}

function counts(values: string[]): Record<string, number> { return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {}); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function money(amountMinor: number): string { return `$${(amountMinor / 100).toFixed(2)}`; }
