import { readFileSync } from "node:fs";

import {
  inspectShadowAiProviderBoundRequestPrivacyV1,
  providerPacketDiffLimitedToReferenceContainmentV1,
  restoreShadowAiProviderReferencesV1,
} from "../src/canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import type { ShadowAiEconomicResolutionPacketV1, ShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import { projectShadowAiPlanToProviderAliasesOfflineV1 } from "../src/evaluationIntegrity/shadowAiProviderReferenceBoundaryOfflineValidationV1.js";

const SOURCE_ARTIFACT = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const PACKAGE_A_ARTIFACT = "evaluations/planner-provider-compatibility-observability-safe-diagnostics-v1/diagnostics-2026-09-15.json";
const source = JSON.parse(readFileSync(SOURCE_ARTIFACT, "utf8")) as HistoricalEvaluation;
const packageA = JSON.parse(readFileSync(PACKAGE_A_ARTIFACT, "utf8")) as PackageAArtifact;
const oldByAlias = new Map(packageA.requests.map((request) => [request.statementAlias, request] as const));

const requests = source.executions.map((execution) => {
  const packetBefore = canonicalJson(execution.packet.transmitted);
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("offline-only-never-transmitted", execution.packet.transmitted);
  const providerBody = JSON.parse(request.body);
  const providerPacket = JSON.parse(providerBody.messages[1].content).packet as ShadowAiEconomicResolutionPacketV1;
  const privacy = inspectShadowAiProviderBoundRequestPrivacyV1(request.body, request.referenceMap);
  const providerPacketSemanticParity = providerPacketDiffLimitedToReferenceContainmentV1(execution.packet.transmitted, providerPacket, request.referenceMap);
  const currentDiagnostic = inspectPlannerProviderCompatibilityV1(request);
  const providerPlan = projectShadowAiPlanToProviderAliasesOfflineV1(execution.offlineStubPlan, request.referenceMap);
  const restored = restoreShadowAiProviderReferencesV1(providerPlan, request.referenceMap);
  const roundTrip = restored.ok && canonicalJson(restored.output) === canonicalJson(execution.offlineStubPlan);
  const localValidation = restored.ok ? validateShadowAiEconomicResolutionPlanV1(restored.output, execution.packet.transmitted) : null;
  const firstFactAlias = request.referenceMap.entries.find((entry) => entry.referenceClass === "FACT")?.alias;
  const firstWrongClassAlias = request.referenceMap.entries.find((entry) => entry.referenceClass !== "FACT")?.alias;
  const firstInternalFact = request.referenceMap.entries.find((entry) => entry.referenceClass === "FACT")?.internalReference;
  if (!firstFactAlias || !firstWrongClassAlias || !firstInternalFact) throw new Error("historical_containment_adversarial_fixture_incomplete");
  const asRecord = JSON.parse(JSON.stringify(providerPlan)) as Record<string, any>;
  const unknownRejected = !restoreShadowAiProviderReferencesV1({
    ...asRecord,
    exactCitedFactRefs: [`prv_${request.referenceMap.scopeToken}_f_9999`],
  }, request.referenceMap).ok;
  const classConfusionRejected = !restoreShadowAiProviderReferencesV1({ ...asRecord, exactCitedFactRefs: [firstWrongClassAlias] }, request.referenceMap).ok;
  const rawInternalRejected = !restoreShadowAiProviderReferencesV1({ ...asRecord, exactCitedFactRefs: [firstInternalFact] }, request.referenceMap).ok;
  const previous = oldByAlias.get(execution.statementAlias);
  if (!previous) throw new Error(`package_a_request_missing:${execution.statementAlias}`);
  const internalReferenceCounts = countInternalReferences(execution.packet.transmitted);
  const aliases = Object.fromEntries(["FACT", "STATEMENT_EVIDENCE", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"].map((referenceClass) => [
    referenceClass,
    request.referenceMap.entries.filter((entry) => entry.referenceClass === referenceClass).length,
  ]));
  if (packetBefore !== canonicalJson(execution.packet.transmitted)) throw new Error("historical_packet_mutated");
  if (!privacy.valid || !providerPacketSemanticParity || !roundTrip || !localValidation?.ok || !unknownRejected || !classConfusionRejected || !rawInternalRejected) {
    throw new Error(`historical_containment_validation_failed:${execution.statementAlias}`);
  }
  for (const entry of request.referenceMap.entries) {
    if (request.body.includes(entry.internalReference)) throw new Error(`historical_raw_reference_leak:${execution.statementAlias}`);
  }
  return {
    family: execution.family,
    statementAlias: execution.statementAlias,
    issueClass: execution.issue.issueClass,
    historicalProviderResult: previous.historicalProviderResult,
    previousInternalReferenceCounts: internalReferenceCounts,
    outboundAliasCounts: aliases,
    previousCompatibilityMetrics: selectMetrics(previous.diagnostic),
    containedCompatibilityMetrics: selectMetrics(currentDiagnostic),
    containment: {
      providerPacketHashRebound: providerPacket.immutableInputHash === request.referenceMap.providerInputHash,
      providerPacketDiffLimitedToReferenceContainment: providerPacketSemanticParity,
      internalPacketSerializationUnchanged: packetBefore === canonicalJson(execution.packet.transmitted),
      rawInternalReferenceLeakageCount: privacy.rawInternalReferenceLeakageCount,
      sourceIdentityLeakageCount: privacy.sourceIdentityLeakageCount,
      reverseMapMaterialLeakageCount: privacy.rawReverseMapMaterialCount,
      reverseMapSerialized: request.body.includes("internalReference") || request.body.includes("referenceMap"),
      exactReferenceRoundTrip: roundTrip,
      acceptedPlannerValidationAfterRestore: localValidation?.ok === true,
      unknownAliasRejected: unknownRejected,
      classConfusionRejected,
      rawInternalReferenceRejected: rawInternalRejected,
    },
  };
});

const artifact = {
  schemaVersion: "planner_outbound_source_reference_privacy_containment_2026_09_15_v1",
  baselineCommit: "e268d6e48823a15996c4c5c401459dab710f1a5a",
  sourceArtifact: SOURCE_ARTIFACT,
  acceptedPackageAArtifact: PACKAGE_A_ARTIFACT,
  providerCalls: 0,
  reconstructedHistoricalRequestCount: requests.length,
  requests,
  aggregate: {
    rawInternalReferenceLeakageCount: requests.reduce((sum, item) => sum + item.containment.rawInternalReferenceLeakageCount, 0),
    sourceIdentityLeakageCount: requests.reduce((sum, item) => sum + item.containment.sourceIdentityLeakageCount, 0),
    reverseMapMaterialLeakageCount: requests.reduce((sum, item) => sum + item.containment.reverseMapMaterialLeakageCount, 0),
    reverseMapSerializedCount: requests.filter((item) => item.containment.reverseMapSerialized).length,
    providerPacketReferenceOnlyDiffCount: requests.filter((item) => item.containment.providerPacketDiffLimitedToReferenceContainment).length,
    exactReferenceRoundTripCount: requests.filter((item) => item.containment.exactReferenceRoundTrip).length,
    acceptedPlannerValidationCount: requests.filter((item) => item.containment.acceptedPlannerValidationAfterRestore).length,
    unknownAliasAcceptanceCount: requests.filter((item) => !item.containment.unknownAliasRejected).length,
    classConfusionAcceptanceCount: requests.filter((item) => !item.containment.classConfusionRejected).length,
    rawInternalReferenceAcceptanceCount: requests.filter((item) => !item.containment.rawInternalReferenceRejected).length,
  },
  compatibilityFinding: {
    oldHistoricalSuccessFailureAssociationPreservedAsEvidence: true,
    containedRequestsProviderTested: false,
    exactProviderLimitClaimed: false,
    http400ResolutionClaimed: false,
    finding: "Opaque aliases remove raw internal reference identity from the provider request while retaining the same enum-node/cardinality topology. Fixed-format aliases reduce packet-specific literal-byte variation, but no provider outcome is inferred because this evaluation made zero provider calls.",
  },
  contentBoundary: {
    rawRequestBodiesStored: false,
    packetContentsStored: false,
    reverseMapsStored: false,
    internalReferencesStored: false,
    merchantDerivedPayloadValuesCopied: false,
  },
};

const serialized = JSON.stringify(artifact, null, 2);
const prohibitedValues = source.executions.flatMap((execution) => [
  execution.packet.transmitted.merchantBusinessContext?.businessName,
  ...execution.packet.transmitted.sanitizedFeeLabels,
  ...execution.packet.transmitted.currentGovernedEvidenceRefs,
  ...requestInternalReferences(execution.packet.transmitted),
]).filter((value): value is string => typeof value === "string" && value.length > 0);
if (prohibitedValues.some((value) => serialized.includes(value))) throw new Error("package_b_artifact_payload_value_leak");
console.log(serialized);

function countInternalReferences(packet: ShadowAiEconomicResolutionPacketV1): Record<string, number> {
  return {
    FACT: new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef)]).size,
    STATEMENT_EVIDENCE: new Set(packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => fact.evidenceRefs)).size,
    GOVERNED_EVIDENCE: new Set(packet.currentGovernedEvidenceRefs).size,
    ECONOMIC_CHARGE: new Set([...packet.selectedRdChargeRefs, ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef)]).size,
  };
}

function requestInternalReferences(packet: ShadowAiEconomicResolutionPacketV1): string[] {
  return [
    ...packet.acceptedFactRefs,
    ...packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => [fact.factRef, ...fact.evidenceRefs]),
    ...packet.currentGovernedEvidenceRefs,
    ...packet.selectedRdChargeRefs,
    ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef),
    packet.immutableInputHash,
  ];
}

function selectMetrics(value: Record<string, any>) {
  return {
    requestBodyBytes: value.requestBodyBytes,
    providerSchemaBytes: value.providerSchemaBytes,
    schemaDepth: value.schemaDepth,
    schemaNodeCount: value.schemaNodeCount,
    enumNodeCount: value.enumNodeCount,
    maximumEnumCardinality: value.maximumEnumCardinality,
    totalEnumLiteralCount: value.totalEnumLiteralCount,
    totalEnumLiteralBytes: value.totalEnumLiteralBytes,
    constCount: value.constCount,
    arraySchemaNodeCount: value.arraySchemaNodeCount,
  };
}

type HistoricalEvaluation = {
  executions: Array<{
    family: string;
    statementAlias: string;
    issue: { issueClass: string };
    packet: { transmitted: ShadowAiEconomicResolutionPacketV1 };
    offlineStubPlan: ShadowAiEconomicResolutionPlanV1;
  }>;
};

type PackageAArtifact = {
  requests: Array<{
    statementAlias: string;
    historicalProviderResult: string;
    diagnostic: Record<string, any>;
  }>;
};
