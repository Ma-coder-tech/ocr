import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildClaimScopedQualificationIntegrityCostDriverAdmissionV1 } from "../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildCurrentRelationshipEconomicsProfileV1 } from "../src/canonical/currentRelationshipEconomicsProfileV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUT = "evaluations/claim-scoped-count-driven-cost-sensitivity-admission-v1";
const BASELINE = {
  branch: "codex/claim-scoped-qualification-integrity-cost-driver-admission-v1",
  commit: "d8d5b151cbcd57ec84a5057cf81ff4cb0d7f603a",
  parent: "f0416d398a4a0a51818eeaca60938d4324f8c79b",
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

const acceptedDriverEvaluation = JSON.parse(await readFile(
  "evaluations/claim-scoped-qualification-integrity-cost-driver-admission-v1/evaluation-2026-09-12.json", "utf8",
));
const acceptedDriverByFile = new Map<string, any>(acceptedDriverEvaluation.statements.map((item: any) => [item.file, item]));
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
  const sourceFingerprintBefore = inspected.economic.pricingAnalysis.foundation.identity.sourceFingerprint;
  const decompositionBefore = fingerprint(decomposition);
  const withoutSourceBridge = buildCurrentRelationshipEconomicsProfileV1({
    economic: inspected.economic,
    commercialDecomposition: decomposition,
  });
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: canonical,
    commercialDecomposition: decomposition,
  });
  const profile = attached.profile;
  const admission = profile.countDrivenCostSensitivityAdmission;
  const driver = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic,
    currentRelationshipProfile: profile,
    commercialDecomposition: decomposition,
  });
  const acceptedDriver = acceptedDriverByFile.get(fixture.file);
  const rdAmountByRef = new Map(inspected.economic.economicLayer.charges
    .filter((charge) => charge.observedAmount)
    .map((charge) => [charge.id, charge.observedAmount!.amountMinor]));
  const added = admission.admissions.filter((record) => record.admissionBasis === "CLAIM_SCOPED_EXTENSION");
  const addedRefs = new Set(added.map((record) => record.rdChargeRef));
  const existingRefs = profile.costStructureSensitivity.countDrivenChargeRefs.filter((ref) => !addedRefs.has(ref));
  const qualificationRefs = new Set(driver.findings.flatMap((finding) => finding.rdChargeRefs));
  const overlap = admission.admissions.filter((record) => qualificationRefs.has(record.rdChargeRef)).map((record) => ({
    rdChargeRef: record.rdChargeRef,
    referencedChargedAmountMinor: record.referencedChargedAmountMinor,
    sensitivityAdditiveContributionMinor: record.additiveContributionMinor,
    driverAdditiveContributionMinor: driver.findings.find((finding) => finding.rdChargeRefs.includes(record.rdChargeRef))?.additiveContributionMinor ?? null,
  }));
  statements.push({
    file: fixture.file,
    statementPeriod: profile.statementPeriod,
    sourceDocumentRef: profile.sourceDocumentRef,
    status: admission.status,
    before: {
      countDrivenChargeCount: existingRefs.length,
      referencedChargedAmountMinor: sum(existingRefs.map((ref) => rdAmountByRef.get(ref) ?? 0)),
    },
    netNew: { countDrivenChargeCount: added.length, referencedChargedAmountMinor: sum(added.map((record) => record.referencedChargedAmountMinor)) },
    after: {
      countDrivenChargeCount: profile.costStructureSensitivity.countDrivenChargeRefs.length,
      referencedChargedAmountMinor: sum(profile.costStructureSensitivity.countDrivenChargeRefs.map((ref) => rdAmountByRef.get(ref) ?? 0)),
    },
    admissions: admission.admissions,
    netNewAdmissions: added,
    excludedCandidates: admission.excludedCandidates,
    blockerCounts: counts(admission.excludedCandidates.flatMap((candidate) => candidate.blockers)),
    qualificationDriverOverlap: overlap,
    admissionAggregate: admission.aggregate,
    admissionSafety: admission.safety,
    profileSensitivityAdditiveContributionMinor: profile.costStructureSensitivity.additiveDriverContributionMinor,
    rdContributingChargeCount: profile.chargedCostProfile.items.length,
    rdTotalStatementProcessingCostMinor: profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
    chargedCostProfileFingerprintWithoutSourceBridge: fingerprint(withoutSourceBridge.chargedCostProfile),
    chargedCostProfileFingerprintWithAdmission: fingerprint(profile.chargedCostProfile),
    costStackCategoriesBefore: withoutSourceBridge.chargedCostProfile.items.map((item) => [item.rdEconomicChargeRef, item.productCostConcept]),
    costStackCategoriesAfter: profile.chargedCostProfile.items.map((item) => [item.rdEconomicChargeRef, item.productCostConcept]),
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalFinancialTruthFingerprint(canonical),
    rdFingerprintBefore: rdBefore,
    rdFingerprintAfter: fingerprint(inspected.economic),
    decompositionFingerprintBefore: decompositionBefore,
    decompositionFingerprintAfter: fingerprint(decomposition),
    sourceFingerprintBefore,
    sourceFingerprintAfter: inspected.economic.pricingAnalysis.foundation.identity.sourceFingerprint,
    qualificationDriverFingerprintAccepted: acceptedDriver ? fingerprint({
      status: acceptedDriver.status,
      findings: acceptedDriver.findings,
      unresolvedCandidates: acceptedDriver.unresolvedCandidates,
      safety: acceptedDriver.safety,
    }) : null,
    qualificationDriverFingerprintCurrent: fingerprint({
      status: driver.status,
      findings: driver.findings,
      unresolvedCandidates: driver.unresolvedCandidates,
      safety: driver.safety,
    }),
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const corpus = {
  statementCount: statements.length,
  beforeCountDrivenChargeCount: sum(statements.map((item) => item.before.countDrivenChargeCount)),
  beforeReferencedChargedAmountMinor: sum(statements.map((item) => item.before.referencedChargedAmountMinor)),
  newlyAdmittedChargeCount: sum(statements.map((item) => item.netNew.countDrivenChargeCount)),
  newlyAdmittedReferencedAmountMinor: sum(statements.map((item) => item.netNew.referencedChargedAmountMinor)),
  afterCountDrivenChargeCount: sum(statements.map((item) => item.after.countDrivenChargeCount)),
  afterReferencedChargedAmountMinor: sum(statements.map((item) => item.after.referencedChargedAmountMinor)),
  excludedCandidateCount: sum(statements.map((item) => item.excludedCandidates.length)),
  overlapWithQualificationDriverCount: sum(statements.map((item) => item.qualificationDriverOverlap.length)),
  populationIdentities: counts(statements.flatMap((item) => item.admissions.map((record: any) => record.eventPopulation.identity))),
  netNewPopulationIdentities: counts(statements.flatMap((item) => item.netNewAdmissions.map((record: any) => record.eventPopulation.identity))),
  blockerCounts: counts(statements.flatMap((item) => item.excludedCandidates.flatMap((candidate: any) => candidate.blockers))),
};
const basys = statements.find((item) => item.file === "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");
const nxgen = statements.find((item) => item.file === "fiserv_NXGEN_VORTAX_Sep_2022.pdf");
const allAdmissions = statements.flatMap((item) => item.admissions);
const safetyCounters = {
  unexpectedGoldStatementCount: corpus.statementCount === 11 ? 0 : 1,
  unexpectedExistingCountOrAmount: corpus.beforeCountDrivenChargeCount === 23 && corpus.beforeReferencedChargedAmountMinor === 86_730 ? 0 : 1,
  unexpectedNetNewCountOrAmount: corpus.newlyAdmittedChargeCount === 13 && corpus.newlyAdmittedReferencedAmountMinor === 30_571 ? 0 : 1,
  unexpectedAfterCountOrAmount: corpus.afterCountDrivenChargeCount === 36 && corpus.afterReferencedChargedAmountMinor === 117_301 ? 0 : 1,
  unexpectedBasysExtension: basys?.netNew.countDrivenChargeCount === 8 && basys?.netNew.referencedChargedAmountMinor === 23_646 ? 0 : 1,
  unexpectedNxgenExtension: nxgen?.netNew.countDrivenChargeCount === 5 && nxgen?.netNew.referencedChargedAmountMinor === 6_925 ? 0 : 1,
  duplicateRdChargeReferences: sum(statements.map((item) => item.admissionAggregate.duplicateRdChargeReferenceCount)),
  nonReproducingAdmissions: allAdmissions.filter((record) => record.arithmetic.status !== "reproduces" ||
    record.arithmetic.exactAmount?.roundedAmountMinor !== record.referencedChargedAmountMinor).length,
  admissionsWithoutExactPopulation: allAdmissions.filter((record) => record.eventPopulation.preservationStatus !== "EXACT_GOVERNED_VALUE_PRESERVED").length,
  admissionsWithoutProviderControl: allAdmissions.filter((record) => record.merchantFacingProviderControl.state !== "SUPPORTED" ||
    record.merchantFacingProviderControl.value !== "acquiring_side_program").length,
  additiveSensitivityDollars: sum(allAdmissions.map((record) => record.additiveContributionMinor)) +
    sum(statements.map((item) => item.profileSensitivityAdditiveContributionMinor)),
  nonZeroQualificationOverlapDollars: sum(statements.flatMap((item) => item.qualificationDriverOverlap)
    .filter((item) => item.sensitivityAdditiveContributionMinor !== 0 || item.driverAdditiveContributionMinor !== 0).map(() => 1)),
  chargedCostProfileChanges: statements.filter((item) => item.chargedCostProfileFingerprintWithoutSourceBridge !== item.chargedCostProfileFingerprintWithAdmission).length,
  costStackCategoryChanges: statements.filter((item) => JSON.stringify(item.costStackCategoriesBefore) !== JSON.stringify(item.costStackCategoriesAfter)).length,
  canonicalChanges: statements.filter((item) => item.canonicalFingerprintBefore !== item.canonicalFingerprintAfter).length,
  rdChanges: statements.filter((item) => item.rdFingerprintBefore !== item.rdFingerprintAfter).length,
  decompositionChanges: statements.filter((item) => item.decompositionFingerprintBefore !== item.decompositionFingerprintAfter).length,
  sourceFingerprintChanges: statements.filter((item) => item.sourceFingerprintBefore !== item.sourceFingerprintAfter).length,
  qualificationDriverArtifactChanges: statements.filter((item) => item.qualificationDriverFingerprintAccepted !== item.qualificationDriverFingerprintCurrent).length,
  commercialSourceChanges: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA ? 0 : 1,
  comparisonInputs: sum(statements.map((item) => item.admissionSafety.comparisonInputCount)),
  savingsOutputs: sum(statements.map((item) => item.admissionSafety.savingsOutputCount)),
  annualizations: sum(statements.map((item) => item.admissionSafety.annualizationOutputCount)),
  aiOrWebOperations: sum(statements.map((item) => item.admissionSafety.aiOrWebOperationCount)),
  newKnowledgeAdmissions: sum(statements.map((item) => item.admissionSafety.newKnowledgeAdmissionCount)),
  customerRoutes: statements.filter((item) => item.admissionSafety.customerRoutingAllowed).length,
};
const evaluation = {
  schemaVersion: "claim_scoped_count_driven_cost_sensitivity_admission_evaluation_2026_09_13_v1",
  generatedAt: "2026-09-13T00:00:00.000Z",
  mode: "internal_offline",
  baseline: BASELINE,
  governedCommercialSource: {
    expectedSha256: EXPECTED_COMMERCIAL_SHA,
    beforeSha256: commercialBefore,
    afterSha256: commercialAfter,
    unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA,
  },
  corpus,
  statements,
  invariants: {
    exactElevenGoldStatements: corpus.statementCount === 11,
    exactExistingCohort: corpus.beforeCountDrivenChargeCount === 23 && corpus.beforeReferencedChargedAmountMinor === 86_730,
    exactNetNewCohort: corpus.newlyAdmittedChargeCount === 13 && corpus.newlyAdmittedReferencedAmountMinor === 30_571,
    exactAfterCohort: corpus.afterCountDrivenChargeCount === 36 && corpus.afterReferencedChargedAmountMinor === 117_301,
    exactBasysExtension: basys?.netNew.countDrivenChargeCount === 8 && basys?.netNew.referencedChargedAmountMinor === 23_646,
    exactNxgenExtension: nxgen?.netNew.countDrivenChargeCount === 5 && nxgen?.netNew.referencedChargedAmountMinor === 6_925,
    everyAdmissionHasExactCountRateArithmetic: allAdmissions.every((record) => Number.isSafeInteger(record.count) && record.count >= 0 &&
      record.perEventRateDollars !== null && record.arithmetic.status === "reproduces" &&
      record.arithmetic.exactAmount?.roundedAmountMinor === record.referencedChargedAmountMinor),
    everyAdmissionPreservesExactPopulation: allAdmissions.every((record) => record.eventPopulation.identity &&
      record.eventPopulation.preservationStatus === "EXACT_GOVERNED_VALUE_PRESERVED"),
    everyAdmissionHasMerchantFacingProviderControl: allAdmissions.every((record) =>
      record.merchantFacingProviderControl.state === "SUPPORTED" && record.merchantFacingProviderControl.value === "acquiring_side_program"),
    zeroAdditiveSensitivityDollars: safetyCounters.additiveSensitivityDollars === 0,
    qualificationOverlapNeverDoubleCounts: safetyCounters.nonZeroQualificationOverlapDollars === 0,
    chargedCostAndCategoriesInvariant11Of11: safetyCounters.chargedCostProfileChanges === 0 && safetyCounters.costStackCategoryChanges === 0,
    canonicalRdDecompositionAndSourceInvariant11Of11: safetyCounters.canonicalChanges === 0 && safetyCounters.rdChanges === 0 &&
      safetyCounters.decompositionChanges === 0 && safetyCounters.sourceFingerprintChanges === 0,
    qualificationDriverArtifactInvariant11Of11: safetyCounters.qualificationDriverArtifactChanges === 0,
    governedCommercialSourceInvariant: safetyCounters.commercialSourceChanges === 0,
  },
  safetyCounters,
  safetyCounterTotal: sum(Object.values(safetyCounters)),
  knownUnrelatedIssues: [
    "The accepted current-economics evaluator still requires a literal zero reconciliation delta even when the governed non-additive rounding residual explains the delta; its existing availableRdCostsReconcileExactly check remains red.",
    "Historical/current remains at the accepted 5/6 regression.",
    "Merchant-attention remains at the accepted 62/63 state.",
    "Batch 2 remains at the accepted stale 149-vs-152 aggregate.",
    "Prior legacy public-source/exhaustive SIGSEGV/139 is not investigated.",
  ],
};
const failures = Object.entries(evaluation.invariants).filter(([, ok]) => !ok).map(([name]) => name);
if (evaluation.safetyCounterTotal !== 0) failures.push("safetyCounterTotal");
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/evaluation-2026-09-13.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(`${OUT}/report-2026-09-13.md`, report(evaluation));
console.log(JSON.stringify({ corpus, invariants: evaluation.invariants, safetyCounters, safetyCounterTotal: evaluation.safetyCounterTotal, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function report(value: any): string {
  const rows = value.statements.map((item: any) =>
    `| ${item.file} | ${money(item.rdTotalStatementProcessingCostMinor ?? 0)} | ${item.before.countDrivenChargeCount} / ${money(item.before.referencedChargedAmountMinor)} | ${item.netNew.countDrivenChargeCount} / ${money(item.netNew.referencedChargedAmountMinor)} | ${item.after.countDrivenChargeCount} / ${money(item.after.referencedChargedAmountMinor)} | ${item.excludedCandidates.length} |`,
  ).join("\n");
  const added = value.statements.flatMap((item: any) => item.netNewAdmissions.map((record: any) =>
    `| ${item.file} | ${record.rdChargeRef} | ${record.eventPopulation.identity} | ${record.count} × $${record.perEventRateDollars} | ${money(record.referencedChargedAmountMinor)} | acquiring_side_program |`,
  )).join("\n");
  const blockerRows = Object.entries(value.corpus.blockerCounts)
    .map(([blocker, count]) => `| ${blocker} | ${count} |`).join("\n");
  return `# Claim-Scoped Count-Driven Cost Sensitivity Admission v1\n\n` +
    `Baseline: \`${value.baseline.commit}\`. Governed commercial source: \`${value.governedCommercialSource.afterSha256}\` (unchanged).\n\n` +
    `Before: ${value.corpus.beforeCountDrivenChargeCount} / ${money(value.corpus.beforeReferencedChargedAmountMinor)}. ` +
    `Net new: ${value.corpus.newlyAdmittedChargeCount} / ${money(value.corpus.newlyAdmittedReferencedAmountMinor)}. ` +
    `After: ${value.corpus.afterCountDrivenChargeCount} / ${money(value.corpus.afterReferencedChargedAmountMinor)}.\n\n` +
    `| Statement | RD total | Before | Net new | After | Excluded candidates |\n|---|---:|---:|---:|---:|---:|\n${rows}\n\n` +
    `## Net-new exact proofs\n\n| Statement | RD charge | Preserved population | Count × rate | Charge | Merchant-facing control |\n|---|---|---|---:|---:|---|\n${added}\n\n` +
    `## Exclusion blockers\n\n| Blocker | Candidate rows |\n|---|---:|\n${blockerRows}\n\n` +
    `Sensitivity adds $0.00. Canonical, RD, commercial decomposition, source fingerprint, charged-cost categories, and the qualification/integrity driver artifact are invariant 11/11. Safety counter total: ${value.safetyCounterTotal}.\n`;
}

function counts(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
}
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function money(minor: number): string { return `$${(minor / 100).toFixed(2)}`; }
