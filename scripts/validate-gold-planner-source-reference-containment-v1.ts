import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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
import { compileShadowAiEconomicResolutionPacketsV1, selectShadowAiEconomicResolutionIssuesV1 } from "../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { createShadowAiEconomicResolutionEvaluationAdapterV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerEvaluationAdapterV1.js";
import { runShadowAiEconomicResolutionPlannerV1, validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import { inspectShadowAiProviderBoundRequestPrivacyV1, providerPacketDiffLimitedToReferenceContainmentV1, restoreShadowAiProviderReferencesV1 } from "../src/canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import type { ShadowAiEconomicResolutionPacketV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { inspectFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import { projectShadowAiPlanToProviderAliasesOfflineV1 } from "../src/evaluationIntegrity/shadowAiProviderReferenceBoundaryOfflineValidationV1.js";
import type { ParsedDocument } from "../src/parser.js";
import { analyzeStatementDocument } from "../src/statementParserOrchestrator.js";

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

export async function evaluateGoldPlannerSourceReferenceContainmentOfflineV1() {
// Reading this accepted artifact is a guard that the same 11-statement Gold corpus is in scope.
const accepted = JSON.parse(await readFile("evaluations/shadow-ai-economic-resolution-planner-v1/evaluation-2026-09-14.json", "utf8"));
if (accepted.corpus.statementCount !== 11) throw new Error("accepted_gold_corpus_guard_invalid");
const registries = [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1];
const commercialBefore = commercialSemanticFingerprintV1(registries);
const authority = new GovernedPaymentKnowledgeAuthority();
const statements: any[] = [];

for (const [index, fixture] of GOLD.entries()) {
  const statementAlias = `supported-fiserv-gold-${String(index + 1).padStart(2, "0")}`;
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
  const qualification = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic,
    currentRelationshipProfile: attached.profile,
    commercialDecomposition: decomposition,
  });
  const before = snapshot(canonical, inspected.economic, decomposition, attached, qualification);
  const selection = selectShadowAiEconomicResolutionIssuesV1({
    currentEconomics: attached.profile,
    commercialDecomposition: decomposition,
    qualificationIntegrity: qualification,
  });
  const packets = compileShadowAiEconomicResolutionPacketsV1({
    opaqueRunRef: `shadow-run-${createHash("sha256").update(`package-b-gold:${index}`).digest("hex").slice(0, 24)}`,
    selection,
    currentEconomics: attached.profile,
    commercialDecomposition: decomposition,
    merchantBusinessContext: {
      admittedBusinessCategory: fixture.businessType,
      businessLocation: { country: "US" },
      knownChannel: attached.profile.activity.channel.value,
    },
  });
  const run = await runShadowAiEconomicResolutionPlannerV1({ selection, packets, adapter: createShadowAiEconomicResolutionEvaluationAdapterV1() });
  if (run.status !== "COMPLETED" || run.plans.length !== packets.length) throw new Error(`gold_offline_plan_generation_failed:${statementAlias}`);
  const planByIssue = new Map(run.plans.map((plan) => [plan.issueId, plan] as const));
  const issueResults = packets.map((packet) => validatePacket(packet, planByIssue.get(packet.issueId), selection.selectedIssues.find((issue) => issue.issueId === packet.issueId)?.issueClass));
  const after = snapshot(canonical, inspected.economic, decomposition, attached, qualification);
  statements.push({
    statementAlias,
    issueCount: issueResults.length,
    issueClasses: [...new Set(issueResults.map((result) => result.issueClass))].sort(),
    issueResults,
    invariance: Object.fromEntries(Object.keys(before).map((key) => [key, before[key] === after[key]])),
  });
}

const commercialAfter = commercialSemanticFingerprintV1(registries);
const issues = statements.flatMap((statement) => statement.issueResults);
const allInvariant = (key: string) => statements.filter((statement) => statement.invariance[key]).length;
const artifact = {
  schemaVersion: "gold_planner_source_reference_containment_offline_validation_2026_09_15_v1",
  baselineCommit: "e268d6e48823a15996c4c5c401459dab710f1a5a",
  providerCalls: 0,
  statementCount: statements.length,
  issueCount: issues.length,
  issueClassDistribution: counts(issues.map((issue) => issue.issueClass)),
  statements,
  aggregate: {
    rawInternalReferenceLeakageCount: sum(issues.map((issue) => issue.privacy.rawInternalReferenceLeakageCount)),
    sourceIdentityLeakageCount: sum(issues.map((issue) => issue.privacy.sourceIdentityLeakageCount)),
    reverseMapMaterialLeakageCount: sum(issues.map((issue) => issue.privacy.reverseMapMaterialCount)),
    reverseMapSerializedCount: sum(issues.map((issue) => issue.privacy.reverseMapSerialized ? 1 : 0)),
    providerPacketReferenceOnlyDiffCount: sum(issues.map((issue) => issue.validation.providerPacketDiffLimitedToReferenceContainment ? 1 : 0)),
    exactReferenceRoundTripCount: sum(issues.map((issue) => issue.validation.exactReferenceRoundTrip ? 1 : 0)),
    acceptedPlannerValidationCount: sum(issues.map((issue) => issue.validation.acceptedPlannerValidation ? 1 : 0)),
    unknownAliasAcceptanceCount: sum(issues.map((issue) => issue.validation.unknownAliasRejected ? 0 : 1)),
    classConfusionTestedCount: sum(issues.map((issue) => issue.validation.classConfusionTested ? 1 : 0)),
    classConfusionAcceptanceCount: sum(issues.map((issue) => issue.validation.classConfusionTested && !issue.validation.classConfusionRejected ? 1 : 0)),
    rawReferenceAcceptanceCount: sum(issues.map((issue) => issue.validation.rawInternalReferenceRejected ? 0 : 1)),
  },
  invariance: {
    canonicalFinancialTruthUnchanged: `${allInvariant("canonical")}/11`,
    rdUnchanged: `${allInvariant("rd")}/11`,
    commercialDecompositionUnchanged: `${allInvariant("decomposition")}/11`,
    sourceFingerprintUnchanged: `${allInvariant("sourceFingerprint")}/11`,
    activityUnchanged: `${allInvariant("activity")}/11`,
    qualificationUnchanged: `${allInvariant("qualification")}/11`,
    countSensitivityUnchanged: `${allInvariant("countSensitivity")}/11`,
    volumeSensitivityUnchanged: `${allInvariant("volumeSensitivity")}/11`,
    mixedMinimumSensitivityUnchanged: `${allInvariant("mixedMinimumSensitivity")}/11`,
    fixedSensitivityUnchanged: `${allInvariant("fixedSensitivity")}/11`,
    chargedCostUnchanged: `${allInvariant("chargedCost")}/11`,
    costStackCategoriesUnchanged: `${allInvariant("costStackCategories")}/11`,
    participantControlUnchanged: `${allInvariant("participantControl")}/11`,
    completenessUnchanged: `${allInvariant("completeness")}/11`,
    materialityInputsUnchanged: `${allInvariant("materialityInputs")}/11`,
    commercialSourceExpectedSha256: EXPECTED_COMMERCIAL_SHA,
    commercialSourceBeforeSha256: commercialBefore,
    commercialSourceAfterSha256: commercialAfter,
    commercialSourceUnchanged: commercialBefore === commercialAfter && commercialAfter === EXPECTED_COMMERCIAL_SHA,
  },
  executionBoundary: {
    offlineOnly: true,
    providerCalls: 0,
    networkCalls: 0,
    researchOperations: 0,
    evidenceAdmissions: 0,
    customerOutputs: 0,
    productionRoutingChanges: 0,
    truthMutations: 0,
  },
  contentBoundary: {
    sourceFilenamesStored: false,
    packetContentsStored: false,
    reverseMapsStored: false,
    internalReferencesStored: false,
    merchantDerivedPayloadValuesCopied: false,
  },
};

if (statements.length !== 11 || issues.length === 0) throw new Error("gold_containment_corpus_incomplete");
const expectedRoundTrips = issues.length;
if (artifact.aggregate.rawInternalReferenceLeakageCount !== 0 || artifact.aggregate.sourceIdentityLeakageCount !== 0
  || artifact.aggregate.reverseMapMaterialLeakageCount !== 0 || artifact.aggregate.reverseMapSerializedCount !== 0
  || artifact.aggregate.providerPacketReferenceOnlyDiffCount !== expectedRoundTrips
  || artifact.aggregate.exactReferenceRoundTripCount !== expectedRoundTrips || artifact.aggregate.acceptedPlannerValidationCount !== expectedRoundTrips
  || artifact.aggregate.unknownAliasAcceptanceCount !== 0 || artifact.aggregate.classConfusionAcceptanceCount !== 0
  || artifact.aggregate.rawReferenceAcceptanceCount !== 0 || !artifact.invariance.commercialSourceUnchanged
  || Object.values(artifact.invariance).filter((value) => typeof value === "string" && /^\d+\/11$/.test(value)).some((value) => value !== "11/11")) {
  throw new Error("gold_containment_validation_failed");
}
return artifact;
}

function validatePacket(packet: ShadowAiEconomicResolutionPacketV1, plan: any, issueClass: string | undefined) {
  if (!plan || !issueClass) throw new Error("gold_packet_plan_binding_missing");
  const packetBefore = canonicalJson(packet);
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("offline-only-never-transmitted", packet);
  const requestBody = JSON.parse(request.body);
  const providerPacket = JSON.parse(requestBody.messages[1].content).packet as ShadowAiEconomicResolutionPacketV1;
  const providerPacketSemanticParity = providerPacketDiffLimitedToReferenceContainmentV1(packet, providerPacket, request.referenceMap);
  const diagnostic = inspectPlannerProviderCompatibilityV1(request);
  const privacy = inspectShadowAiProviderBoundRequestPrivacyV1(request.body, request.referenceMap);
  const providerPlan = projectShadowAiPlanToProviderAliasesOfflineV1(plan, request.referenceMap);
  const restored = restoreShadowAiProviderReferencesV1(providerPlan, request.referenceMap);
  const exactReferenceRoundTrip = restored.ok && canonicalJson(restored.output) === canonicalJson(plan);
  const acceptedPlannerValidation = restored.ok && validateShadowAiEconomicResolutionPlanV1(restored.output, packet).ok;
  const output = JSON.parse(JSON.stringify(providerPlan)) as Record<string, any>;
  const wrongClass = request.referenceMap.entries.find((entry) => entry.referenceClass !== "FACT")?.alias;
  const rawFact = request.referenceMap.entries.find((entry) => entry.referenceClass === "FACT")?.internalReference;
  if (!rawFact) throw new Error("gold_adversarial_reference_fixture_missing");
  const unknownAliasRejected = !restoreShadowAiProviderReferencesV1({ ...output, exactCitedFactRefs: [`prv_${request.referenceMap.scopeToken}_f_9999`] }, request.referenceMap).ok;
  const classConfusionTested = Boolean(wrongClass);
  const classConfusionRejected = wrongClass
    ? !restoreShadowAiProviderReferencesV1({ ...output, exactCitedFactRefs: [wrongClass] }, request.referenceMap).ok
    : true;
  const rawInternalReferenceRejected = !restoreShadowAiProviderReferencesV1({ ...output, exactCitedFactRefs: [rawFact] }, request.referenceMap).ok;
  if (packetBefore !== canonicalJson(packet) || !providerPacketSemanticParity || !privacy.valid || !exactReferenceRoundTrip || !acceptedPlannerValidation
    || !unknownAliasRejected || !classConfusionRejected || !rawInternalReferenceRejected
    || request.referenceMap.entries.some((entry) => request.body.includes(entry.internalReference))) {
    throw new Error(`gold_packet_containment_failed:${issueClass}`);
  }
  return {
    issueClass,
    internalReferenceCounts: referenceCounts(packet),
    outboundAliasCounts: countAliasClasses(request.referenceMap.entries),
    compatibilityMetrics: {
      requestBodyBytes: diagnostic.requestBodyBytes,
      requestBodySha256: diagnostic.requestBodySha256,
      providerSchemaBytes: diagnostic.providerSchemaBytes,
      providerSchemaSha256: diagnostic.providerSchemaSha256,
      schemaDepth: diagnostic.schemaDepth,
      schemaNodeCount: diagnostic.schemaNodeCount,
      enumNodeCount: diagnostic.enumNodeCount,
      maximumEnumCardinality: diagnostic.maximumEnumCardinality,
      totalEnumLiteralCount: diagnostic.totalEnumLiteralCount,
      totalEnumLiteralBytes: diagnostic.totalEnumLiteralBytes,
      constCount: diagnostic.constCount,
      arraySchemaNodeCount: diagnostic.arraySchemaNodeCount,
    },
    privacy: {
      rawInternalReferenceLeakageCount: privacy.rawInternalReferenceLeakageCount,
      sourceIdentityLeakageCount: privacy.sourceIdentityLeakageCount,
      reverseMapMaterialCount: privacy.rawReverseMapMaterialCount,
      reverseMapSerialized: request.body.includes("referenceMap") || request.body.includes("internalReference"),
    },
    validation: { providerPacketDiffLimitedToReferenceContainment: providerPacketSemanticParity, exactReferenceRoundTrip, acceptedPlannerValidation, unknownAliasRejected, classConfusionTested, classConfusionRejected, rawInternalReferenceRejected },
  };
}

function referenceCounts(packet: ShadowAiEconomicResolutionPacketV1) {
  return {
    FACT: new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef)]).size,
    STATEMENT_EVIDENCE: new Set(packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => fact.evidenceRefs)).size,
    GOVERNED_EVIDENCE: new Set(packet.currentGovernedEvidenceRefs).size,
    ECONOMIC_CHARGE: new Set([...packet.selectedRdChargeRefs, ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef)]).size,
  };
}

function countAliasClasses(entries: readonly { referenceClass: string }[]) {
  return counts(entries.map((entry) => entry.referenceClass));
}

function snapshot(canonical: any, economic: any, decomposition: any, attached: any, qualification: any): Record<string, string> {
  const profile = attached.profile;
  return {
    canonical: canonicalFinancialTruthFingerprint(canonical),
    rd: fingerprint(economic),
    decomposition: fingerprint(decomposition),
    sourceFingerprint: economic.pricingAnalysis.foundation.identity.sourceFingerprint,
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

function deterministicPricing(document: ParsedDocument, file: string, businessType: BusinessTypeId, analysis: any): InternalAnalystPricingModelInput {
  const legacy = analyzeStatementDocument(document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) throw new Error("gold_pricing_unavailable");
  return {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: analysis.feeLedger.rows.slice(0, 3).flatMap((row: any) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
}

function fingerprint(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function counts(values: string[]): Record<string, number> { return values.reduce<Record<string, number>>((out, value) => ({ ...out, [value]: (out[value] ?? 0) + 1 }), {}); }
function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await evaluateGoldPlannerSourceReferenceContainmentOfflineV1(), null, 2));
}
