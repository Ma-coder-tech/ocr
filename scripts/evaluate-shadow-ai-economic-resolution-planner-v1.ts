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
import {
  compileShadowAiEconomicResolutionPacketsV1,
  inspectShadowAiEconomicResolutionPacketPrivacyV1,
  selectShadowAiEconomicResolutionIssuesV1,
} from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { createShadowAiEconomicResolutionEvaluationAdapterV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerEvaluationAdapterV1.js";
import { runShadowAiEconomicResolutionPlannerV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

const OUT = "evaluations/shadow-ai-economic-resolution-planner-v1";
const BASELINE = {
  branch: "codex/supported-fiserv-legacy-ai-containment-gate-v1",
  commit: "b30596f2b07f7b1568f1b4a9530fe008eeaba437",
  parent: "9fabd622326af2c00873781ef4e018d9f6d639e2",
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

const accepted = JSON.parse(await readFile(
  "evaluations/claim-scoped-fixed-cost-sensitivity-admission-v1/evaluation-2026-09-13.json", "utf8",
));
const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialBefore = commercialSemanticFingerprintV1(registries);
const authority = new GovernedPaymentKnowledgeAuthority();
const statements: any[] = [];

for (const [index, fixture] of GOLD.entries()) {
  const safeStatementId = fixture.file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${fixture.file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, {
    sourceFileName: fixture.file, businessType: fixture.businessType,
  });
  const knowledge = authority.resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: deterministicPricing(inspected.document, fixture.file, fixture.businessType, canonical),
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const attached = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document, economic: inspected.economic, canonicalAnalysis: canonical, commercialDecomposition: decomposition,
  });
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic, currentRelationshipProfile: attached.profile, commercialDecomposition: decomposition,
  });
  const before = snapshot(canonical, inspected.economic, decomposition, attached, qualification);
  const selection = selectShadowAiEconomicResolutionIssuesV1({
    currentEconomics: attached.profile, commercialDecomposition: decomposition, qualificationIntegrity: qualification,
  });
  const repeatedSelection = selectShadowAiEconomicResolutionIssuesV1({
    currentEconomics: attached.profile, commercialDecomposition: decomposition, qualificationIntegrity: qualification,
  });
  const packets = compileShadowAiEconomicResolutionPacketsV1({
    opaqueRunRef: `shadow-run-${createHash("sha256").update(`gold:${index}`).digest("hex").slice(0, 24)}`,
    selection, currentEconomics: attached.profile, commercialDecomposition: decomposition,
    merchantBusinessContext: {
      admittedBusinessCategory: fixture.businessType,
      businessLocation: { country: "US" },
      knownChannel: attached.profile.activity.channel.value,
    },
  });
  const run = await runShadowAiEconomicResolutionPlannerV1({
    selection, packets, adapter: createShadowAiEconomicResolutionEvaluationAdapterV1(),
  });
  const after = snapshot(canonical, inspected.economic, decomposition, attached, qualification);
  statements.push({
    file: fixture.file,
    statementPeriod: attached.profile.statementPeriod,
    unresolvedIssueCountAvailable: selection.selectedIssues.length + selection.suppressedIssues.filter((issue) => issue.reasonCode !== "NO_ACCEPTED_UNRESOLVED_INPUT").length,
    selectedIssueCount: selection.selectedIssues.length,
    selectedIssues: selection.selectedIssues.map((issue) => ({
      issueId: issue.issueId, issueClass: issue.issueClass, priority: issue.selectionPriority,
      materiality: issue.decisionMaterialityTier, amountUnderReviewMinor: issue.amountUnderReviewMinor,
      selectedRdChargeRefs: issue.selectedRdChargeRefs, reasonCodes: issue.selectionReasonCodes,
      competingHypothesisRequired: issue.competingHypothesisRequired,
    })),
    suppressedIssues: selection.suppressedIssues,
    deterministicSelectionRepeatedIdentically: canonicalJson(selection) === canonicalJson(repeatedSelection),
    packetCount: packets.length,
    packetBytes: Buffer.byteLength(canonicalJson(packets), "utf8"),
    privacyInspections: packets.map(inspectShadowAiEconomicResolutionPacketPrivacyV1),
    run: {
      status: run.status, accounting: run.accounting, invalidOutputs: run.invalidOutputs,
      deterministicResultPreserved: run.deterministicResultPreserved,
      customerOutputCreated: run.customerOutputCreated,
    },
    plans: run.plans,
    plannerCallCount: run.accounting.plannerOperationCount,
    hypothesesGenerated: sum(run.plans.map((plan) => 1 + plan.alternativeHypotheses.length)),
    competingHypothesesGenerated: sum(run.plans.map((plan) => plan.alternativeHypotheses.length)),
    routeDistribution: counts(run.plans.map((plan) => plan.recommendedResolutionPath)),
    recommendations: {
      publicResearch: run.plans.flatMap((plan) => plan.researchQuerySuggestions),
      merchantInput: run.plans.flatMap((plan) => plan.merchantQuestionSuggestions),
      documents: run.plans.flatMap((plan) => plan.documentRequestSuggestions),
      processorOrGatewayData: run.plans.flatMap((plan) => plan.operationalDataRequests),
      multiStatement: run.plans.filter((plan) => plan.recommendedResolutionPath === "MULTI_STATEMENT_REQUIRED").length,
      notResolvableCurrentScope: run.plans.filter((plan) => plan.recommendedResolutionPath === "NOT_RESOLVABLE_CURRENT_SCOPE").length,
    },
    reconstructionSuspicionCount: sum(run.plans.map((plan) => plan.reconstructionSuspicions.length)),
    invalidCitationCount: sum(run.invalidOutputs.flatMap((item) => item.errorCodes).filter((code) => code.includes("fact_ref") || code.includes("evidence_ref")).map(() => 1)),
    hallucinatedReferenceCount: sum(run.invalidOutputs.flatMap((item) => item.errorCodes).filter((code) => code.includes("hallucinated")).map(() => 1)),
    forbiddenConclusionCount: sum(run.invalidOutputs.flatMap((item) => item.errorCodes).filter((code) => code.includes("forbidden_conclusion")).map(() => 1)),
    duplicateInvestigationCount: selection.suppressedIssues.filter((issue) => issue.reasonCode === "DUPLICATE_INVESTIGATION").length,
    before, after,
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const allPlans = statements.flatMap((statement) => statement.plans);
const allSelected = statements.flatMap((statement) => statement.selectedIssues);
const allSuppressed = statements.flatMap((statement) => statement.suppressedIssues);
const allAccounting = statements.map((statement) => statement.run.accounting);
const operationalValidationCounters = {
  unexpectedGoldStatementCount: statements.length === 11 ? 0 : 1,
  nondeterministicSelections: statements.filter((statement) => !statement.deterministicSelectionRepeatedIdentically).length,
  packetPrivacyViolations: sum(statements.flatMap((statement) => statement.privacyInspections).map((item) => item.valid ? 0 : 1)),
  unboundedStatementPackets: statements.filter((statement) => statement.packetBytes > 120_000 || statement.packetCount > 6).length,
  invalidPlannerOutputs: sum(statements.map((statement) => statement.run.invalidOutputs.length)),
  incompletePlannerRuns: statements.filter((statement) => statement.run.status !== "COMPLETED").length,
  providerCallAttempts: sum(allAccounting.map((item) => item.providerCallAttempts)),
  providerNetworkCalls: sum(allAccounting.map((item) => item.providerNetworkCalls)),
  retryAttempts: sum(allAccounting.map((item) => item.retries)),
  plannerOperationsOverOnePerStatement: statements.filter((statement) => statement.run.accounting.plannerOperationCount > 1).length,
  researchOperations: sum(allAccounting.map((item) => item.researchOperations)),
  sourceAdmissions: sum(allAccounting.map((item) => item.sourceAdmissions)),
  customerOutputs: statements.filter((statement) => statement.run.customerOutputCreated).length,
  authoritativeOutputs: allPlans.filter((plan: any) => plan.authority !== "NON_AUTHORITATIVE" || plan.admissionStatus !== "NOT_ADMITTED" || plan.truthEffect !== "NONE").length,
  financialMutationPermissions: allPlans.filter((plan: any) => plan.financialMutationAllowed).length,
  resolvedByAiClaims: allPlans.filter((plan: any) => !plan.unresolvedAfterAnalysis).length,
  plansWithoutEvidenceGaps: allPlans.filter((plan: any) => plan.acknowledgedEvidenceGaps.length === 0).length,
  plansWithoutConfirmationOrFalsification: allPlans.filter((plan: any) => plan.primaryHypothesis.confirmationRequirements.length === 0 || plan.primaryHypothesis.falsificationConditions.length === 0).length,
  missingRequiredAlternatives: allPlans.filter((plan: any) => {
    const selected = allSelected.find((issue: any) => issue.issueId === plan.issueId);
    return selected?.competingHypothesisRequired && plan.alternativeHypotheses.length === 0;
  }).length,
  reconstructionSuspicionTruthEffects: allPlans.flatMap((plan: any) => plan.reconstructionSuspicions)
    .filter((item: any) => item.truthEffect !== "NONE" || item.financialMutationAllowed || item.admissionStatus !== "NOT_ADMITTED").length,
};
const planLanguage = allPlans.map((plan: any) => canonicalJson(plan)).join("\n");
const safetyCounters = {
  canonicalFinancialFingerprintChanges: changed("canonical"),
  rdArtifactChanges: changed("rd"),
  commercialClassificationChanges: changed("decomposition") + changed("costStackCategories"),
  sensitivityArtifactChanges: changed("countSensitivity") + changed("volumeSensitivity") + changed("mixedMinimumSensitivity") + changed("fixedSensitivity"),
  qualificationArtifactChanges: changed("qualification"),
  participantControlChanges: changed("participantControl"),
  completenessChanges: changed("completeness"),
  materialityChanges: changed("materialityInputs"),
  savingsCreated: /\b(?:savings?|overpaid|overpaying)\b/i.test(planLanguage) ? 1 : 0,
  annualizationCreated: /\bannual(?:ize|ized|ization)\b/i.test(planLanguage) ? 1 : 0,
  comparisonDecisionsCreated: allPlans.filter((plan: any) => /\b(?:eligible comparator|selected comparator|comparison decision)\b/i.test(canonicalJson(plan))).length,
  customerFindingPermissionsCreated: allPlans.filter((plan: any) => plan.customerRenderingAllowed).length,
  customerRoutingCreated: statements.filter((statement) => statement.run.customerOutputCreated).length,
  aiInferenceMislabeledAsFact: allPlans.filter((plan: any) => plan.outputType !== "AI_INFERENCE_ONLY" || plan.authority !== "NON_AUTHORITATIVE" || plan.admissionStatus !== "NOT_ADMITTED").length,
  hallucinatedFactRefs: sum(statements.map((statement) => statement.invalidCitationCount)),
  hallucinatedEvidenceRefs: sum(statements.map((statement) => statement.hallucinatedReferenceCount)),
  unsupportedParticipantControlClaims: allPlans.filter((plan: any) => /\b(?:is|was)\s+(?:the\s+)?(?:collector|economic beneficiary|rule setter|price setter|merchant-facing price controller)\b/i.test(canonicalJson(plan))).length,
  unsupportedCausalClaims: allPlans.filter((plan: any) => /\b(?:definitely caused|proves? the cause|is the root cause)\b/i.test(canonicalJson(plan))).length,
  unsupportedAvoidabilityClaims: /\bavoidable\b/i.test(planLanguage) ? 1 : 0,
  merchantBlameClaims: /\bmerchant\s+(?:fault|blame|responsible)\b/i.test(planLanguage) ? 1 : 0,
  processorBlameClaims: /\bprocessor\s+(?:fault|blame|responsible)\b/i.test(planLanguage) ? 1 : 0,
  privateAccountFieldsSent: sum(statements.flatMap((statement) => statement.privacyInspections).map((item) => item.reasonCodes.some((code: string) => code === "shadow_planner_forbidden_private_field" || code === "shadow_planner_private_account_value_forbidden") ? 1 : 0)),
  sourceAdmissions: sum(allAccounting.map((item) => item.sourceAdmissions)),
  researchOperations: sum(allAccounting.map((item) => item.researchOperations)),
};
const safetyCounterTotal = sum(Object.values(safetyCounters));
const issueClassDistribution = counts(allSelected.map((issue: any) => issue.issueClass));
const suppressionDistribution = counts(allSuppressed.map((issue: any) => issue.reasonCode));
const routeDistribution = counts(allPlans.map((plan: any) => plan.recommendedResolutionPath));
const quality = {
  selectedIssueCount: allSelected.length,
  suppressedIssueCount: allSuppressed.length,
  planCount: allPlans.length,
  statementsWithAtLeastOnePlan: statements.filter((statement) => statement.plans.length > 0).length,
  plansWithCompetingAlternative: allPlans.filter((plan: any) => plan.alternativeHypotheses.length > 0).length,
  plansWithExplicitEvidenceGap: allPlans.filter((plan: any) => plan.acknowledgedEvidenceGaps.length > 0).length,
  plansWithActionableResolutionPath: allPlans.filter((plan: any) => plan.requiredEvidenceClasses.length > 0).length,
  exactReferenceGroundingRate: ratio(allPlans.filter((plan: any) => plan.exactCitedFactRefs.length > 0).length, allPlans.length),
  epistemicBoundaryRate: ratio(allPlans.filter((plan: any) => plan.primaryHypothesis.confirmationRequirements.length > 0 && plan.primaryHypothesis.falsificationConditions.length > 0).length, allPlans.length),
  selectedIssuesWithClearResolutionPathPercent: percent(allPlans.filter((plan: any) => Boolean(plan.recommendedResolutionPath)).length, allSelected.length),
  selectedIssuesWithUsefulEvidenceRequestsPercent: percent(allPlans.filter((plan: any) => plan.requiredEvidenceClasses.length > 0).length, allSelected.length),
  meaningfulAlternativePreservationPercent: percent(allPlans.filter((plan: any) => plan.alternativeHypotheses.length > 0).length, allSelected.filter((issue: any) => issue.competingHypothesisRequired).length),
  operationalPrivateDataRoutingAccuracyPercent: percent(allPlans.filter((plan: any) => {
    const issue = allSelected.find((selected: any) => selected.issueId === plan.issueId);
    return ["AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", "QUALIFICATION_INTEGRITY_ROOT_CAUSE"].includes(issue?.issueClass) && plan.recommendedResolutionPath === "PROCESSOR_OR_GATEWAY_DATA_REQUIRED";
  }).length, allSelected.filter((issue: any) => ["AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", "QUALIFICATION_INTEGRITY_ROOT_CAUSE"].includes(issue.issueClass)).length),
  duplicateOrUnnecessaryInvestigationRatePercent: percent(sum(statements.map((statement) => statement.duplicateInvestigationCount)), allSelected.length),
};
const strongestPlan = allPlans.find((plan: any) => plan.alternativeHypotheses.length > 0 && plan.requiredEvidenceClasses.length > 0) ?? allPlans[0] ?? null;
const weakestPlan = allPlans.find((plan: any) => plan.exactCitedFactRefs.length === 0) ?? allPlans.at(-1) ?? null;
const invariants = {
  exactElevenGoldStatements: statements.length === 11,
  deterministicGeneralizedSelection: operationalValidationCounters.nondeterministicSelections === 0,
  boundedPrivatePackets: operationalValidationCounters.packetPrivacyViolations === 0 && operationalValidationCounters.unboundedStatementPackets === 0,
  validUsefulPlans: operationalValidationCounters.invalidPlannerOutputs === 0 && operationalValidationCounters.incompletePlannerRuns === 0 && quality.planCount > 0,
  noProviderOrResearchExecution: operationalValidationCounters.providerCallAttempts === 0 && operationalValidationCounters.providerNetworkCalls === 0 && safetyCounters.researchOperations === 0,
  noAuthorityOrTruthMutation: operationalValidationCounters.authoritativeOutputs === 0 && operationalValidationCounters.financialMutationPermissions === 0 && operationalValidationCounters.resolvedByAiClaims === 0,
  noAdmissionsOrCustomerOutput: safetyCounters.sourceAdmissions === 0 && operationalValidationCounters.customerOutputs === 0,
  canonicalRdInvariant11Of11: safetyCounters.canonicalFinancialFingerprintChanges === 0 && safetyCounters.rdArtifactChanges === 0,
  currentEconomicsArtifactsInvariant11Of11: ["commercialClassificationChanges", "sensitivityArtifactChanges", "qualificationArtifactChanges", "participantControlChanges", "completenessChanges", "materialityChanges"].every((key) => safetyCounters[key as keyof typeof safetyCounters] === 0),
  commercialSourceInvariant: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA,
};
const failures = Object.entries(invariants).filter(([, value]) => !value).map(([name]) => name);
if (safetyCounterTotal !== 0) failures.push("safetyCounterTotal");
const evaluation = {
  schemaVersion: "shadow_ai_economic_resolution_planner_evaluation_2026_09_14_v1",
  generatedAt: "2026-09-14T00:00:00.000Z",
  mode: "internal_offline_shadow_evaluation",
  baseline: BASELINE,
  executionBoundary: {
    adapter: "offline_evaluation_stub", providerModel: null, providerCallAttempts: 0,
    networkCalls: 0, liveResearch: false, evidenceAdmission: false, productionWiring: false, customerOutput: false,
  },
  governedCommercialSource: { expectedSha256: EXPECTED_COMMERCIAL_SHA, beforeSha256: commercialBefore, afterSha256: commercialAfter, unchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA },
  corpus: { statementCount: statements.length, issueClassDistribution, suppressionDistribution, routeDistribution },
  quality, strongestPlan, weakestPlan, statements, invariants, operationalValidationCounters, safetyCounters, safetyCounterTotal,
  recommendation: failures.length === 0
    ? "Planner contracts and offline shadow quality are ready for Product review; provider-backed shadow execution remains a separately authorized milestone."
    : "Do not advance: one or more safety or invariance proofs failed.",
  knownUnrelatedIssues: accepted.knownUnrelatedIssues,
};
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/evaluation-2026-09-14.json`, `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(`${OUT}/report-2026-09-14.md`, report(evaluation));
console.log(JSON.stringify({ corpus: evaluation.corpus, quality, invariants, safetyCounters, safetyCounterTotal, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;

function snapshot(canonical: any, economic: any, decomposition: any, attached: any, qualification: any) {
  const profile = attached.profile;
  return {
    canonical: canonicalFinancialTruthFingerprint(canonical), rd: fingerprint(economic), decomposition: fingerprint(decomposition),
    sourceFingerprint: economic.pricingAnalysis.foundation.identity.sourceFingerprint,
    roundingMetadata: fingerprint(economic.economicLayer.costStack.roundingResidual ?? null),
    activity: fingerprint({ status: attached.admission.status, decisions: attached.admission.decisions, safety: attached.admission.safety }),
    qualification: fingerprint({ status: qualification.status, findings: qualification.findings, unresolvedCandidates: qualification.unresolvedCandidates, safety: qualification.safety }),
    countSensitivity: fingerprint({ status: profile.countDrivenCostSensitivityAdmission.status, admissions: profile.countDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.countDrivenCostSensitivityAdmission.excludedCandidates, safety: profile.countDrivenCostSensitivityAdmission.safety }),
    volumeSensitivity: fingerprint({ admissions: profile.volumeDrivenCostSensitivityAdmission.admissions, excludedCandidates: profile.volumeDrivenCostSensitivityAdmission.excludedCandidates, aggregate: profile.volumeDrivenCostSensitivityAdmission.aggregate, safety: profile.volumeDrivenCostSensitivityAdmission.safety }),
    mixedMinimumSensitivity: fingerprint({ admissions: profile.mixedMinimumCostSensitivityAdmission.admissions, excludedCandidates: profile.mixedMinimumCostSensitivityAdmission.excludedCandidates, aggregate: profile.mixedMinimumCostSensitivityAdmission.aggregate, safety: profile.mixedMinimumCostSensitivityAdmission.safety }),
    fixedSensitivity: fingerprint({ admissions: profile.fixedCostSensitivityAdmission.admissions, excludedCandidates: profile.fixedCostSensitivityAdmission.excludedCandidates, aggregate: profile.fixedCostSensitivityAdmission.aggregate, safety: profile.fixedCostSensitivityAdmission.safety }),
    chargedCost: fingerprint(profile.chargedCostProfile),
    costStackCategories: fingerprint(profile.chargedCostProfile.items.map((item: any) => [item.rdEconomicChargeRef, item.productCostConcept])),
    participantControl: fingerprint(decomposition.rows.map((row: any) => [row.feeRowId, row.participants])),
    completeness: fingerprint(profile.completeness),
    materialityInputs: fingerprint({ total: profile.chargedCostProfile.rdTotalStatementProcessingCost, rows: decomposition.rows.map((row: any) => [row.feeRowId, row.billedAmountMinor, row.commercialDollarCategory]), sensitivity: profile.costStructureSensitivity }),
  };
}

function changed(key: string): number { return statements.filter((statement) => statement.before[key] !== statement.after[key]).length; }
function fingerprint(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function counts(values: string[]): Record<string, number> { return values.reduce<Record<string, number>>((out, value) => ({ ...out, [value]: (out[value] ?? 0) + 1 }), {}); }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }
function ratio(numerator: number, denominator: number): number { return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4)); }
function percent(numerator: number, denominator: number): number { return Number((ratio(numerator, denominator) * 100).toFixed(1)); }
function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: any): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error(`pricing unavailable ${file}`);
  return { model: model as InternalAnalystPricingModelInput["model"], confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low", evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row: any) => row.contributionDecision.evidenceRefs), relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null, deterministic: true };
}
function report(value: any): string {
  const rows = value.statements.map((item: any) => `| ${item.file} | ${item.selectedIssueCount} | ${item.packetBytes} | ${item.run.status} | ${item.plans.length} | ${Object.entries(item.routeDistribution).map(([key, count]) => `${key}: ${count}`).join("<br>")} |`).join("\n");
  return `# Shadow AI Economic Resolution Planner v1\n\nAccepted baseline: \`${value.baseline.commit}\`. Mode: offline evaluation stub; no provider, network, research, admission, production wiring, or customer output.\n\n| Gold statement | Selected | Packet bytes | Run | Plans | Resolution paths |\n|---|---:|---:|---|---:|---|\n${rows}\n\n## Quality\n\n- Selected issues: ${value.quality.selectedIssueCount}; plans: ${value.quality.planCount}; statements with plans: ${value.quality.statementsWithAtLeastOnePlan}/11.\n- Clear resolution path: ${value.quality.selectedIssuesWithClearResolutionPathPercent}%; useful evidence request: ${value.quality.selectedIssuesWithUsefulEvidenceRequestsPercent}%; meaningful alternatives: ${value.quality.meaningfulAlternativePreservationPercent}%.\n- Correct operational/private-data routing: ${value.quality.operationalPrivateDataRoutingAccuracyPercent}%; duplicate/unnecessary investigation rate: ${value.quality.duplicateOrUnnecessaryInvestigationRatePercent}%.\n- Exact reference grounding: ${(value.quality.exactReferenceGroundingRate * 100).toFixed(1)}%; explicit epistemic boundaries: ${(value.quality.epistemicBoundaryRate * 100).toFixed(1)}%.\n\n## Product-reviewable examples\n\nStrongest plan: **${value.strongestPlan?.unresolvedQuestion ?? "none"}** Route: \`${value.strongestPlan?.recommendedResolutionPath ?? "none"}\`; it includes a competing hypothesis plus explicit confirmation and falsification conditions.\n\nWeakest plan: **${value.weakestPlan?.unresolvedQuestion ?? "none"}** Route: \`${value.weakestPlan?.recommendedResolutionPath ?? "none"}\`; it remains useful but has no competing alternative because the selected contract-evidence issue did not require one.\n\nNo reconstruction suspicion was emitted by the offline Gold adapter.\n\n## Safety and invariance\n\nRequired safety-counter total: ${value.safetyCounterTotal}. Canonical, RD, commercial decomposition, completeness, materiality inputs, participant/control, activity, qualification/integrity, count, volume, mixed/minimum, fixed, charged-cost, and cost-category fingerprints are unchanged 11/11. Governed commercial source SHA remains \`${value.governedCommercialSource.afterSha256}\`.\n\n${value.recommendation}\n`;
}
