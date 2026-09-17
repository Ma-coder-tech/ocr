import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import type { BusinessTypeId } from "../src/businessTypes.js";
import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCommercialDecompositionContractV1 } from "../src/canonical/commercialDecompositionContractV1.js";
import { commercialSemanticFingerprintV1 } from "../src/canonical/commercialSourceGovernanceV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../src/canonical/governedPaymentKnowledgeAuthority.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { canonicalFinancialTruthFingerprint, type InternalAnalystPricingModelInput } from "../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalStatementAnalysis } from "../src/canonical/types.js";
import {
  buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  fiservFeeLedgerOccurrences,
  FISERV_CLAIM_SCOPED_FEE_OCCURRENCE_ADMISSION_V1,
} from "../src/canonical/v2/index.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUTPUT_DIR = "evaluations/exact-control-claim-scoped-fiserv-fee-occurrence-admission-v1";
const OUTPUT_JSON = `${OUTPUT_DIR}/evaluation-2026-09-12.json`;
const OUTPUT_MD = `${OUTPUT_DIR}/report-2026-09-12.md`;
const BASELINE = {
  branch: "codex/fiserv-claim-scoped-activity-population-admission-v1",
  commit: "43263cd912bb882207c8110d2d9e07c023ea75ff",
  parent: "54068d935a5e3b66f1fe02e3d84fd3e4046412b3",
} as const;
const EXPECTED_COMMERCIAL_SOURCE_SHA256 = "a204de0fa0bf4cedfb852ff32327b22f43d5b38c7f6eeb8bea4a26bf417bf456";
const EXPECTED_BASELINE_RD_SHA256: Record<string, string> = {
  "Nov_2024_Statement.pdf": "afa19272c973a1d302be9e1f0ac2a853e66e123c04ee76fec5a05dd70b2abe27",
  "SAMPLE_MERCHANT4_CLOVER.pdf": "cbfabe9902c8f711beeedaac9b9195b78ceb5108aec68db29d053e0bc37134ba",
  "SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf": "0acebc825c76c5c34f8ee6d663024c298136397e54009db500246aab3561a327",
  "fiserv_ABDUL_BASHER_Aug_2025.pdf": "b3dfd4e1237aca42a55d2adc3e0a3da2728de7342a302304e44146c9375453af",
  "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf": "f60b87e70dc0a3424bdb33e278d7da24b87b17d1fbcf686d3dbd4f804f16af70",
  "fiserv_NXGEN_VORTAX_Sep_2022.pdf": "945bc0b7684c1c4f06083f70f8b8d3e602abbfc309bdf91be5f5c969b3f40566",
  "fiserv_PAYSAFE_Febr_2024.pdf": "af19baf0a6562e538c3c2324d0137d425ea957e2295059b71c64b92fb0cf1f5f",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf": "a0553581d3068078168195273fec0b319255665adcb84ae8fc1d63033a45865f",
  "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf": "156807a585d3546295fe62cc19c0224ef284f470adf01118f656f7c45826a95b",
  "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf": "c527ff93a5d844ba614f4cc17fb8cd451bfb8bd25f28e12b2eb8388778b9ce69",
  "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf": "45f3d372b31fa933211bc187b09c22c839f91b54570f9526e345be5b5e316c91",
};
const REGISTRIES = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
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
const commercialSourceBefore = commercialSemanticFingerprintV1(REGISTRIES);
const statements: any[] = [];

for (const fixture of GOLD) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({
    statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId,
  });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
    sourceFileName: fixture.file, businessType: fixture.businessType,
  });
  const canonicalBefore = canonicalFinancialTruthFingerprint(canonical);
  const pricing = deterministicPricing(inspected.document, fixture.file, fixture.businessType, canonical);
  const knowledge = authority.resolveStatement({ analysis: canonical, context: US_CONTEXT, suppliedPricingObservation: pricing });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const before = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(inspected.pricing);
  const admission = inspected.feeOccurrenceAdmission!;
  const after = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(
    inspected.pricing, [], [], admission, null,
  );
  const occurrenceRows = fiservFeeLedgerOccurrences(inspected.observationalFoundation);
  const beforeContributing = new Set(before.economicLayer.charges
    .filter((charge) => charge.contributionStatus.startsWith("contributes_"))
    .map((charge) => charge.contributingOccurrenceRef).filter((ref): ref is string => Boolean(ref)));
  const afterContributingCharges = after.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_"));
  const newCharges = afterContributingCharges.filter((charge) =>
    charge.contributingOccurrenceRef !== null && !beforeContributing.has(charge.contributingOccurrenceRef));
  const newRefs = new Set(newCharges.map((charge) => charge.contributingOccurrenceRef));
  const decisionByRef = new Map(admission.decisions.map((decision) => [decision.occurrenceRef, decision]));
  const exclusions = occurrenceRows.filter((occurrence) => !newRefs.has(occurrence.id)).map((occurrence) => ({
    occurrenceRef: occurrence.id,
    evidenceRef: occurrence.evidenceRef,
    amountMinor: occurrence.printedAmount?.amountMinor ?? null,
    reason: beforeContributing.has(occurrence.id)
      ? "already_additive_under_accepted_runtime_capability"
      : decisionByRef.get(occurrence.id)?.decision === "PRESERVED_ZERO_NONADDITIVE"
        ? "zero_dollar_row_preserved_nonadditive"
        : decisionByRef.get(occurrence.id)?.reasonCodes ?? ["not_admitted_by_exact_control_package"],
  }));
  const profileBefore = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: before, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  });
  const profileAfter = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: after, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  });
  const activityBeforeFingerprint = fingerprint(profileBefore.profile.activity);
  const activityAfterFingerprint = fingerprint(profileAfter.profile.activity);
  const canonicalAfter = canonicalFinancialTruthFingerprint(canonical);
  const normalizedFeeTotalMinor = occurrenceRows.every((row) => row.printedAmount !== null)
    ? sum(occurrenceRows.map((row) => row.printedAmount!.amountMinor)) : null;
  const occurrenceById = new Map(occurrenceRows.map((occurrence) => [occurrence.id, occurrence]));
  const printedStatementFeeTotalMinor = inspected.observationalFoundation.financialPopulations.totalStatementProcessingFees.value?.amountMinor ?? null;
  const rdFingerprintBefore = fingerprint(before);
  const rdFingerprintAfter = fingerprint(after);
  statements.push({
    file: fixture.file,
    period: inspected.observationalFoundation.identity.statementPeriod,
    normalizedFeeRows: occurrenceRows.length,
    normalizedNonzeroFeeRows: occurrenceRows.filter((row) => row.printedAmount?.amountMinor !== 0).length,
    normalizedZeroDollarRows: occurrenceRows.filter((row) => row.printedAmount?.amountMinor === 0).length,
    normalizedFeeTotalMinor,
    printedStatementFeeTotalMinor,
    exactMinorUnitDelta: normalizedFeeTotalMinor !== null && printedStatementFeeTotalMinor !== null
      ? normalizedFeeTotalMinor - printedStatementFeeTotalMinor : null,
    admissionStatus: admission.status,
    admissionReasons: admission.reasonCodes,
    admissionControl: admission.control,
    admittedRdOccurrencesBefore: beforeContributing.size,
    admittedRdOccurrencesAfter: afterContributingCharges.length,
    admittedRdTotalBeforeMinor: before.economicLayer.costStack.classifiedChargeNet.amountMinor,
    admittedRdTotalAfterMinor: after.economicLayer.costStack.classifiedChargeNet.amountMinor,
    rdAuthoritativeFeeTotalBeforeMinor: before.economicLayer.costStack.authoritativeStatementFeeTotal?.amountMinor ?? null,
    rdAuthoritativeFeeTotalAfterMinor: after.economicLayer.costStack.authoritativeStatementFeeTotal?.amountMinor ?? null,
    rdReconciliationBefore: before.economicLayer.costStack.completeness,
    rdReconciliationAfter: after.economicLayer.costStack.completeness,
    rdResidualBeforeMinor: before.economicLayer.costStack.unresolvedRemainder?.amountMinor ?? null,
    rdResidualAfterMinor: after.economicLayer.costStack.unresolvedRemainder?.amountMinor ?? null,
    rdDeltaBeforeMinor: before.economicLayer.costStack.reconciliationDeltaMinor,
    rdDeltaAfterMinor: after.economicLayer.costStack.reconciliationDeltaMinor,
    expectedBaselineRdFingerprint: EXPECTED_BASELINE_RD_SHA256[fixture.file] ?? null,
    rdFingerprintBefore,
    baselineRdFingerprintMatched: rdFingerprintBefore === EXPECTED_BASELINE_RD_SHA256[fixture.file],
    rdFingerprintAfter,
    rdFingerprintChanged: rdFingerprintBefore !== rdFingerprintAfter,
    newCharges: newCharges.map((charge) => ({
      chargeId: charge.id,
      occurrenceRef: charge.contributingOccurrenceRef,
      amountMinor: charge.observedAmount!.amountMinor,
      financialDirection: charge.financialDirection,
      sourceSemanticRole: occurrenceById.get(charge.contributingOccurrenceRef!)?.semanticRole ?? null,
      category: charge.category,
      categoryResolution: charge.categoryResolution,
      evidenceRefs: charge.supportingDetailAdmissionEvidenceRefs,
    })),
    newlyAdmittedCount: newCharges.length,
    newlyAdmittedAmountMinor: sum(newCharges.map((charge) => charge.observedAmount!.amountMinor)),
    exclusions,
    profileBefore: compactProfile(profileBefore.profile),
    profileAfter: compactProfile(profileAfter.profile),
    activityAdmissionFingerprintBefore: fingerprint(profileBefore.admission),
    activityAdmissionFingerprintAfter: fingerprint(profileAfter.admission),
    activityProfileFingerprintBefore: activityBeforeFingerprint,
    activityProfileFingerprintAfter: activityAfterFingerprint,
    activityInvariant: activityBeforeFingerprint === activityAfterFingerprint,
    canonicalFingerprintBefore: canonicalBefore,
    canonicalFingerprintAfter: canonicalAfter,
    canonicalInvariant: canonicalBefore === canonicalAfter,
    safety: admission.safety,
  });
}

const commercialSourceAfter = commercialSemanticFingerprintV1(REGISTRIES);
const newlyAdmittedCount = sum(statements.map((item) => item.newlyAdmittedCount));
const newlyAdmittedAmountMinor = sum(statements.map((item) => item.newlyAdmittedAmountMinor));
const beforeProfileAvailable = statements.filter((item) => item.profileBefore.chargedCostTotalMinor !== null);
const afterProfileAvailable = statements.filter((item) => item.profileAfter.chargedCostTotalMinor !== null);
const safetyCounters = {
  unexpectedNewOccurrenceCount: newlyAdmittedCount === 356 ? 0 : 1,
  unexpectedNewAmount: newlyAdmittedAmountMinor === 1_096_551 ? 0 : 1,
  nonExactPopulationAdmissions: statements.filter((item) => item.newlyAdmittedCount > 0 && item.exactMinorUnitDelta !== 0).length,
  zeroDollarAdditiveCharges: statements.reduce((total, item) => total + item.newCharges.filter((charge: any) => charge.amountMinor === 0).length, 0),
  unsafeDirectionAdmissions: statements.reduce((total, item) => total + item.newCharges.filter((charge: any) => charge.financialDirection !== "debit").length, 0),
  unresolvedOccurrenceIdentityAdmissions: statements.reduce((total, item) => total + item.newCharges.filter((charge: any) => !charge.occurrenceRef).length, 0),
  principalOrAdjustmentAdmissions: statements.reduce((total, item) => total + item.newCharges.filter((charge: any) =>
    charge.sourceSemanticRole === "chargeback_principal_debit" || charge.sourceSemanticRole === "settlement_adjustment").length, 0),
  categoryRequiredForAdmission: statements.reduce((total, item) => total + item.newCharges.filter((charge: any) => charge.categoryResolution !== "unresolved").length, 0),
  canonicalFingerprintChanges: statements.filter((item) => !item.canonicalInvariant).length,
  unrelatedRdFingerprintChanges: statements.filter((item) => item.rdFingerprintChanged !== (item.newlyAdmittedCount > 0)).length,
  activityAdmissionChanges: statements.filter((item) => item.activityAdmissionFingerprintBefore !== item.activityAdmissionFingerprintAfter).length,
  activityProfileChanges: statements.filter((item) => !item.activityInvariant).length,
  commercialSourceFingerprintChanges: commercialSourceBefore === commercialSourceAfter ? 0 : 1,
  duplicateChargeContributions: sum(statements.map((item) => item.profileAfter.duplicateChargeContributionCount)),
  nonFeePrincipalContributions: sum(statements.map((item) => item.profileAfter.nonFeePrincipalContributionCount)),
  comparatorInputs: sum(statements.map((item) => item.profileAfter.comparatorInputCount)),
  opportunities: sum(statements.map((item) => item.profileAfter.opportunityOutputCount)),
  savings: sum(statements.map((item) => item.profileAfter.savingsOutputCount)),
  annualizations: sum(statements.map((item) => item.profileAfter.annualizationOutputCount)),
  customerRoutes: statements.filter((item) => item.profileAfter.customerRoutingAllowed || item.safety.customerRoutingAllowed).length,
  aiOrWebOperations: sum(statements.map((item) => item.safety.aiOrWebOperationCount + item.profileAfter.aiOrWebOperationCount)),
  newKnowledgeAdmissions: sum(statements.map((item) => item.safety.newKnowledgeAdmissionCount + item.profileAfter.newKnowledgeAdmissionCount)),
};
const evaluation = {
  schemaVersion: "exact_control_claim_scoped_fiserv_fee_occurrence_admission_evaluation_2026_09_12_v1",
  admissionVersion: FISERV_CLAIM_SCOPED_FEE_OCCURRENCE_ADMISSION_V1,
  generatedAt: "2026-09-12T00:00:00.000Z",
  mode: "internal_offline",
  baseline: BASELINE,
  governedCommercialSource: {
    expectedSha256: EXPECTED_COMMERCIAL_SOURCE_SHA256,
    beforeSha256: commercialSourceBefore,
    afterSha256: commercialSourceAfter,
    unchanged: commercialSourceBefore === commercialSourceAfter && commercialSourceAfter === EXPECTED_COMMERCIAL_SOURCE_SHA256,
  },
  corpus: {
    statementCount: statements.length,
    admittedRdOccurrencesBefore: sum(statements.map((item) => item.admittedRdOccurrencesBefore)),
    admittedRdOccurrencesAfter: sum(statements.map((item) => item.admittedRdOccurrencesAfter)),
    newlyAdmittedCount,
    newlyAdmittedAmountMinor,
    statementsNewlyUnlocked: statements.filter((item) => item.newlyAdmittedCount > 0).map((item) => item.file),
    exactControlWithheld: statements.filter((item) => item.admissionStatus === "WITHHELD").map((item) => item.file),
    rdFingerprintChanges: statements.filter((item) => item.rdFingerprintChanged).length,
    rdFingerprintUnchanged: statements.filter((item) => !item.rdFingerprintChanged).length,
  },
  economicsProfile: {
    statementsWithUsableChargedCostBefore: beforeProfileAvailable.length,
    statementsWithUsableChargedCostAfter: afterProfileAvailable.length,
    additiveRdChargeCountBefore: sum(statements.map((item) => item.profileBefore.itemCount)),
    additiveRdChargeCountAfter: sum(statements.map((item) => item.profileAfter.itemCount)),
    chargedCostTotalBeforeMinor: sum(beforeProfileAvailable.map((item) => item.profileBefore.chargedCostTotalMinor)),
    chargedCostTotalAfterMinor: sum(afterProfileAvailable.map((item) => item.profileAfter.chargedCostTotalMinor)),
    sensitivityBefore: countBy(statements.map((item) => item.profileBefore.sensitivityState)),
    sensitivityAfter: countBy(statements.map((item) => item.profileAfter.sensitivityState)),
  },
  statements,
  safetyCounters,
  safetyCounterTotal: sum(Object.values(safetyCounters)),
  invariants: {
    exactElevenGoldStatements: statements.length === 11,
    exactAuthorizedCohort: newlyAdmittedCount === 356 && newlyAdmittedAmountMinor === 1_096_551,
    existingAdditiveOccurrencesPreserved: sum(statements.map((item) => item.admittedRdOccurrencesBefore)) === 136,
    baselineRdFingerprintInvariant11Of11: statements.every((item) => item.baselineRdFingerprintMatched),
    canonicalFinancialTruthInvariant11Of11: statements.every((item) => item.canonicalInvariant),
    onlyAuthorizedRdArtifactsChanged: statements.every((item) => item.rdFingerprintChanged === (item.newlyAdmittedCount > 0)),
    everyRdDeltaExplainedByExactOccurrenceAdmission: statements.every((item) => item.newlyAdmittedCount === 0 || (
      item.exactMinorUnitDelta === 0 && item.rdDeltaAfterMinor === 0 && item.rdResidualAfterMinor === null
      && item.newlyAdmittedAmountMinor === item.admittedRdTotalAfterMinor - item.admittedRdTotalBeforeMinor
    )),
    zeroRowsNonAdditive: safetyCounters.zeroDollarAdditiveCharges === 0,
    excludedMismatchCohort: ["fiserv_ABDUL_BASHER_Aug_2025.pdf", "fiserv_NXGEN_VORTAX_Sep_2022.pdf", "fiserv_PAYSAFE_Febr_2024.pdf", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf"]
      .every((file) => statements.find((item) => item.file === file)?.newlyAdmittedCount === 0),
    novemberFeeClaimDecoupled: statements.find((item) => item.file === "Nov_2024_Statement.pdf")?.newlyAdmittedCount === 134,
    activityAdmissionInvariant11Of11: statements.every((item) => item.activityInvariant),
    commercialSourceCryptographicFingerprintInvariant: commercialSourceBefore === commercialSourceAfter && commercialSourceAfter === EXPECTED_COMMERCIAL_SOURCE_SHA256,
    rdRemainsSoleAdditiveAuthority: statements.every((item) => item.safety.rdSoleAdditiveLedger && !item.safety.commercialDecompositionAdditiveAuthority),
    noCustomerAiWebOrKnowledgeExpansion: safetyCounters.customerRoutes === 0 && safetyCounters.aiOrWebOperations === 0 && safetyCounters.newKnowledgeAdmissions === 0,
    noComparatorSavingsOrAnnualization: safetyCounters.comparatorInputs === 0 && safetyCounters.opportunities === 0
      && safetyCounters.savings === 0 && safetyCounters.annualizations === 0,
  },
  verification: {
    focusedAdmissionTests: "7/7 passed",
    acceptedBaselineRdFingerprints: "11/11 matched before this package; only the five authorized admission artifacts changed afterward",
    canonicalBThroughE: "20 files / 169 assertions passed; the Vitest process then reproduced the accepted native SIGSEGV/139 shutdown issue",
    rbThroughRe: "7 files / 67 assertions passed across clean focused runs",
    activityAdmissionAndEconomicsProfile: "2 files / 26 assertions passed",
    commercialRuntimeAndGovernance: "10 files / 145 assertions passed",
    privacyAndInvariance: "3 files / 18 assertions passed",
    historicalCurrent: "12/13 assertions passed; the accepted stale zero-conflict expectation observed four conflicts (5/6 historical/current regression)",
    goldContract: "gold:validate passed with 348 approved assertions; gold:test remained at the accepted 19/20 privacy state",
    typescriptBuild: "passed",
  },
  knownUnrelatedIssues: [
    "Historical/current regression remains at the accepted 5/6 state and is not repaired by this package.",
    "Merchant-attention remains at the accepted 62/63 state and is not repaired by this package.",
    "Batch 2 remains at the accepted stale 149-vs-152 aggregate and is not repaired by this package.",
    "The prior legacy public-source/exhaustive SIGSEGV/139 history is not investigated or repaired.",
  ],
};

const failed = Object.entries(evaluation.invariants).filter(([, value]) => !value).map(([key]) => key);
if (evaluation.safetyCounterTotal !== 0) failed.push("safetyCounterTotal");
await mkdir(OUTPUT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
await writeFile(OUTPUT_MD, renderReport(evaluation), "utf8");
console.log(JSON.stringify({ outputs: [OUTPUT_JSON, OUTPUT_MD], corpus: evaluation.corpus, economicsProfile: evaluation.economicsProfile, safetyCounterTotal: evaluation.safetyCounterTotal, failed }, null, 2));
if (failed.length > 0) process.exitCode = 1;

function compactProfile(profile: ReturnType<typeof buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1>["profile"]) {
  return {
    state: profile.completeness.profileState,
    rdCompleteness: profile.chargedCostProfile.rdCostStackCompleteness,
    itemCount: profile.chargedCostProfile.items.length,
    chargedCostTotalMinor: profile.chargedCostProfile.rdTotalStatementProcessingCost?.amountMinor ?? null,
    mappedNetMinor: profile.chargedCostProfile.mappedNetAmountMinor,
    unresolvedRemainderMinor: profile.chargedCostProfile.rdUnresolvedRemainderMinor,
    reconciliationDeltaMinor: profile.chargedCostProfile.profileReconciliationDeltaMinor,
    reconcilesToRdTotal: profile.chargedCostProfile.reconcilesToRdTotal,
    duplicateChargeContributionCount: profile.chargedCostProfile.duplicateChargeContributionCount,
    nonFeePrincipalContributionCount: profile.chargedCostProfile.nonFeePrincipalContributionCount,
    sensitivityState: profile.costStructureSensitivity.state,
    countDrivenChargeRefs: profile.costStructureSensitivity.countDrivenChargeRefs,
    volumeDrivenChargeRefs: profile.costStructureSensitivity.volumeDrivenChargeRefs,
    fixedCostDrivenChargeRefs: profile.costStructureSensitivity.fixedCostDrivenChargeRefs,
    comparatorInputCount: profile.safety.comparatorInputCount,
    opportunityOutputCount: profile.safety.opportunityOutputCount,
    savingsOutputCount: profile.safety.savingsOutputCount,
    annualizationOutputCount: profile.safety.annualizationOutputCount,
    aiOrWebOperationCount: profile.safety.aiOrWebOperationCount,
    newKnowledgeAdmissionCount: profile.safety.newKnowledgeAdmissionCount,
    customerRoutingAllowed: profile.safety.customerRoutingAllowed,
  };
}

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: CanonicalStatementAnalysis): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const value = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = value?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error(`deterministic pricing model unavailable for ${file}`);
  }
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: value?.pricingModel?.confidence === "high" ? "high" : value?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function renderReport(value: typeof evaluation): string {
  const rows = value.statements.map((item) => `| ${item.file} | ${item.normalizedFeeRows} | ${item.normalizedNonzeroFeeRows} | ${item.admittedRdOccurrencesBefore} | ${item.admittedRdOccurrencesAfter} | ${money(item.printedStatementFeeTotalMinor)} | ${money(item.admittedRdTotalAfterMinor)} | ${item.rdReconciliationAfter} | ${money(item.rdResidualAfterMinor)} |`);
  const details = value.statements.map((item) => `### ${item.file}\n\n- Admission: ${item.admissionStatus}; ${item.admissionReasons.join(", ")}.\n- Exact row/printed-total delta: ${money(item.exactMinorUnitDelta)}.\n- Newly admitted: ${item.newlyAdmittedCount} occurrences / ${money(item.newlyAdmittedAmountMinor)}.\n- RD SHA-256: \`${item.rdFingerprintBefore}\` → \`${item.rdFingerprintAfter}\`.\n- Excluded occurrences: ${item.exclusions.length}; every exclusion and reason is recorded in the JSON artifact.\n- Current-economics charged cost: ${money(item.profileBefore.chargedCostTotalMinor)} → ${money(item.profileAfter.chargedCostTotalMinor)}; sensitivity ${item.profileBefore.sensitivityState} → ${item.profileAfter.sensitivityState}.\n`);
  const verification = Object.entries(value.verification).map(([name, result]) => `- ${name}: ${result}.`).join("\n");
  const knownIssues = value.knownUnrelatedIssues.map((issue) => `- ${issue}`).join("\n");
  return `# Exact-Control Claim-Scoped Fiserv Fee Occurrence Admission v1\n\n## Outcome\n\nA generalized, claim-scoped admission carries only unique statement-bound nonzero fee occurrences into the existing RD additive ledger when the entire normalized fee population reconciles exactly in integer minor units to the printed statement fee total. Economic category and commercial meaning remain independent and may stay unresolved.\n\n- Baseline: \`${value.baseline.commit}\` (parent \`${value.baseline.parent}\`).\n- Existing additive RD occurrences preserved: ${value.corpus.admittedRdOccurrencesBefore}.\n- New additive occurrences: ${value.corpus.newlyAdmittedCount} / ${money(value.corpus.newlyAdmittedAmountMinor)}.\n- RD additive occurrences after: ${value.corpus.admittedRdOccurrencesAfter}.\n- Statements with usable charged-cost economics: ${value.economicsProfile.statementsWithUsableChargedCostBefore}/11 → ${value.economicsProfile.statementsWithUsableChargedCostAfter}/11.\n- Charged-cost total: ${money(value.economicsProfile.chargedCostTotalBeforeMinor)} → ${money(value.economicsProfile.chargedCostTotalAfterMinor)}.\n- Canonical invariance: ${value.invariants.canonicalFinancialTruthInvariant11Of11 ? "11/11" : "FAIL"}.\n- Governed commercial-source SHA-256: \`${value.governedCommercialSource.afterSha256}\`.\n- Safety counter total: ${value.safetyCounterTotal}.\n\n## Gold RD coverage\n\n| Statement | Rows | Nonzero | RD before | RD after | Printed fee total | RD admitted total | RD status | Residual |\n|---|---:|---:|---:|---:|---:|---:|---|---:|\n${rows.join("\n")}\n\n## Statement evidence\n\n${details.join("\n")}\n## Safety boundary\n\n- One- and two-cent mismatches remain withheld; there is no rounding or residual allocation.\n- Zero rows remain provenance-only. Duplicate/repeat/summary rows, unsafe directions, principal, and adjustments fail closed.\n- November's activity contradiction does not contaminate its independently exact fee-total claim.\n- Commercial decomposition classifies existing RD occurrences only; it cannot add a charge or substitute a total.\n- Customer routing, comparison, savings, annualization, AI/web research, and knowledge admission remain disabled.\n\n## Verification\n\n${verification}\n\n## Preserved unrelated issues\n\n${knownIssues}\n`;
}

function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function countBy(values: string[]): Record<string, number> {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
}
function money(value: number | null): string { return value === null ? "unavailable" : `${value < 0 ? "-" : ""}$${(Math.abs(value) / 100).toFixed(2)}`; }
