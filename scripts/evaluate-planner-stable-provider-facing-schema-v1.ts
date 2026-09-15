import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  inspectShadowAiProviderBoundRequestPrivacyV1,
  providerPacketDiffLimitedToReferenceContainmentV1,
  restoreShadowAiProviderReferencesV1,
} from "../src/canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import type { ShadowAiEconomicResolutionPacketV1, ShadowAiEconomicResolutionPlanV1 } from "../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import {
  STABLE_PROVIDER_FACING_PLANNER_SCHEMA_VERSION_V1,
  buildOpenRouterFullPlannerSchemaPreflightRequestV1,
  createSyntheticFullPlannerPacketV1,
} from "../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import { projectShadowAiPlanToProviderAliasesOfflineV1 } from "../src/evaluationIntegrity/shadowAiProviderReferenceBoundaryOfflineValidationV1.js";

const PACKAGE_A_PATH = "evaluations/planner-provider-compatibility-observability-safe-diagnostics-v1/diagnostics-2026-09-15.json";
const PACKAGE_B_PATH = "evaluations/planner-outbound-source-reference-privacy-containment-v1/historical-six-comparison-2026-09-15.json";
const SOURCE_PATH = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";

const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as HistoricalEvaluation;
const packageA = JSON.parse(readFileSync(PACKAGE_A_PATH, "utf8")) as PackageAArtifact;
const packageB = JSON.parse(readFileSync(PACKAGE_B_PATH, "utf8")) as PackageBArtifact;
const aByAlias = new Map(packageA.requests.map((request) => [request.statementAlias, request] as const));
const bByAlias = new Map(packageB.requests.map((request) => [request.statementAlias, request] as const));

const requests = source.executions.map((execution) => {
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("offline-only-never-transmitted", execution.packet.transmitted);
  const diagnostic = inspectPlannerProviderCompatibilityV1(request);
  const body = JSON.parse(request.body) as { messages: Array<{ content: string }> };
  const providerPacket = JSON.parse(body.messages[1]!.content).packet as ShadowAiEconomicResolutionPacketV1;
  const privacy = inspectShadowAiProviderBoundRequestPrivacyV1(request.body, request.referenceMap);
  const projected = projectShadowAiPlanToProviderAliasesOfflineV1(execution.offlineStubPlan, request.referenceMap);
  const restored = restoreShadowAiProviderReferencesV1(projected, request.referenceMap);
  const exactRoundTrip = restored.ok && canonicalJson(restored.output) === canonicalJson(execution.offlineStubPlan);
  const plannerValidation = restored.ok && validateShadowAiEconomicResolutionPlanV1(restored.output, execution.packet.transmitted).ok;
  const packetParity = providerPacketDiffLimitedToReferenceContainmentV1(execution.packet.transmitted, providerPacket, request.referenceMap);
  const packageARequest = aByAlias.get(execution.statementAlias);
  const packageBRequest = bByAlias.get(execution.statementAlias);
  if (!packageARequest || !packageBRequest) throw new Error(`stable_schema_historical_evidence_missing:${execution.statementAlias}`);
  if (!privacy.valid || !packetParity || !exactRoundTrip || !plannerValidation) {
    throw new Error(`stable_schema_historical_validation_failed:${execution.statementAlias}`);
  }
  return {
    family: execution.family,
    statementAlias: execution.statementAlias,
    historicalProviderResult: packageARequest.historicalProviderResult,
    internalReferenceCounts: countInternalReferences(execution.packet.transmitted),
    providerAliasCounts: countAliasClasses(request.referenceMap.entries),
    packageA: { ...selectMetrics(packageARequest.diagnostic), packetBytes: execution.packet.bytes },
    packageB: { ...selectMetrics(packageBRequest.containedCompatibilityMetrics), providerPacketBytes: Buffer.byteLength(canonicalJson(providerPacket), "utf8") },
    packageC: {
      ...selectMetrics(diagnostic),
      requestBodySha256: diagnostic.requestBodySha256,
      providerSchemaSha256: diagnostic.providerSchemaSha256,
      providerPacketBytes: Buffer.byteLength(canonicalJson(providerPacket), "utf8"),
    },
    validation: {
      providerPacketDiffLimitedToReferenceContainment: packetParity,
      exactLocalRoundTrip: exactRoundTrip,
      acceptedPlannerValidation: plannerValidation,
      rawInternalReferenceLeakageCount: privacy.rawInternalReferenceLeakageCount,
      sourceIdentityLeakageCount: privacy.sourceIdentityLeakageCount,
      reverseMapMaterialLeakageCount: privacy.rawReverseMapMaterialCount,
    },
  };
});

const stressSizes = [0, 1, 8, 64, 128, 256, 512];
const stress = stressSizes.map((referenceCount) => {
  const packet = stressPacket(referenceCount);
  const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("offline-only-never-transmitted", packet);
  const diagnostic = inspectPlannerProviderCompatibilityV1(request);
  return {
    referenceCount,
    requestBodyBytes: diagnostic.requestBodyBytes,
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
  };
});

const schemaHashes = new Set(requests.map((request) => request.packageC.providerSchemaSha256));
const schemaBytes = new Set(requests.map((request) => request.packageC.providerSchemaBytes));
const schemaMetricSignatures = new Set(requests.map((request) => canonicalJson(schemaMetrics(request.packageC))));
const stressSchemaHashes = new Set(stress.map((item) => item.providerSchemaSha256));
const stressSchemaBytes = new Set(stress.map((item) => item.providerSchemaBytes));
const stressSchemaMetricSignatures = new Set(stress.map((item) => canonicalJson(schemaMetrics(item))));
if (requests.length !== 6 || schemaHashes.size !== 1 || schemaBytes.size !== 1 || schemaMetricSignatures.size !== 1
  || stressSchemaHashes.size !== 1 || stressSchemaBytes.size !== 1 || stressSchemaMetricSignatures.size !== 1) {
  throw new Error(`stable_provider_schema_independence_failed:requests=${requests.length},historical_hashes=${schemaHashes.size},historical_bytes=${schemaBytes.size},historical_metrics=${schemaMetricSignatures.size},stress_hashes=${stressSchemaHashes.size},stress_bytes=${stressSchemaBytes.size},stress_metrics=${stressSchemaMetricSignatures.size}`);
}

const artifact = {
  schemaVersion: "planner_stable_provider_facing_schema_historical_reconstruction_2026_09_15_v1",
  providerSchemaVersion: STABLE_PROVIDER_FACING_PLANNER_SCHEMA_VERSION_V1,
  baselineCommit: "95894841a9cb09487bbcfd26565a35ea2e1f3761",
  providerCalls: 0,
  reconstructedHistoricalRequestCount: requests.length,
  requests,
  stableSchema: {
    identicalAcrossHistoricalSix: true,
    providerSchemaBytes: requests[0]!.packageC.providerSchemaBytes,
    providerSchemaSha256: requests[0]!.packageC.providerSchemaSha256,
    structuralMetricSignatures: schemaMetricSignatures.size,
    governedReferenceCountToSchemaByteRelationshipRemoved: true,
    governedReferenceCountToPacketDerivedEnumRelationshipRemoved: true,
    packetSpecificReferenceEnums: 0,
  },
  stress: {
    fixtureReferenceCounts: stressSizes,
    fixtures: stress,
    identicalSchemaBytesAndShaAndMetrics: true,
  },
  executionBoundary: { offlineOnly: true, providerCalls: 0, networkCalls: 0, researchOperations: 0, evidenceAdmissions: 0,
    customerOutputs: 0, productionRoutingChanges: 0, truthMutations: 0 },
  liveCompatibilityClaims: { openRouterFixed: false, anthropicAcceptanceProven: false, historicalHttp400Solved: false, providerLimitClaimed: false },
};

const serialized = JSON.stringify(artifact, null, 2);
const prohibited = source.executions.flatMap((execution) => [
  execution.packet.transmitted.merchantBusinessContext?.businessName,
  ...execution.packet.transmitted.sanitizedFeeLabels,
  ...requestInternalReferences(execution.packet.transmitted),
]).filter((value): value is string => typeof value === "string" && value.length > 0);
if (prohibited.some((value) => serialized.includes(value))) throw new Error("stable_schema_artifact_payload_value_leak");
console.log(serialized);

function stressPacket(referenceCount: number): ShadowAiEconomicResolutionPacketV1 {
  const base = createSyntheticFullPlannerPacketV1();
  const withoutHash: Record<string, unknown> = {
    ...JSON.parse(JSON.stringify(base)),
    opaqueRunRef: `shadow-run-${createHash("sha256").update(`stable-stress:${referenceCount}`).digest("hex").slice(0, 24)}`,
    issueId: `synthetic_stable_schema_stress_${referenceCount}`,
    acceptedIssueRelevantActivityFacts: referenceCount === 0 ? [] : [{
      factRef: "synthetic_stress_fact_0001",
      field: "synthetic_stress_field",
      state: "KNOWN",
      value: "SYNTHETIC_VALUE",
      population: "SYNTHETIC_POPULATION",
      evidenceRefs: Array.from({ length: referenceCount }, (_, index) => `synthetic_statement_evidence_${String(index + 1).padStart(4, "0")}`),
    }],
    acceptedFactRefs: referenceCount === 0 ? [] : ["synthetic_stress_fact_0001"],
    currentGovernedEvidenceRefs: Array.from({ length: referenceCount }, (_, index) => `synthetic_governed_evidence_${String(index + 1).padStart(4, "0")}`),
    selectedRdChargeRefs: Array.from({ length: Math.min(referenceCount, 32) }, (_, index) => `synthetic_charge_${String(index + 1).padStart(4, "0")}`),
    acceptedParticipantControlStates: [],
  };
  delete withoutHash.immutableInputHash;
  return Object.freeze({
    ...withoutHash,
    immutableInputHash: createHash("sha256").update(canonicalJson(withoutHash)).digest("hex"),
  }) as unknown as ShadowAiEconomicResolutionPacketV1;
}

function countInternalReferences(packet: ShadowAiEconomicResolutionPacketV1) {
  return {
    FACT: new Set([...packet.acceptedFactRefs, ...packet.acceptedIssueRelevantActivityFacts.map((fact) => fact.factRef)]).size,
    STATEMENT_EVIDENCE: new Set(packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => fact.evidenceRefs)).size,
    GOVERNED_EVIDENCE: new Set(packet.currentGovernedEvidenceRefs).size,
    ECONOMIC_CHARGE: new Set([...packet.selectedRdChargeRefs, ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef)]).size,
  };
}

function countAliasClasses(entries: readonly { referenceClass: string }[]) {
  return entries.reduce<Record<string, number>>((out, entry) => ({ ...out, [entry.referenceClass]: (out[entry.referenceClass] ?? 0) + 1 }), {});
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

function schemaMetrics(value: Record<string, any>) {
  const { requestBodyBytes: _requestBodyBytes, requestBodySha256: _requestBodySha256,
    providerSchemaSha256: _providerSchemaSha256, providerPacketBytes: _providerPacketBytes,
    referenceCount: _referenceCount, ...metrics } = value;
  return metrics;
}

function requestInternalReferences(packet: ShadowAiEconomicResolutionPacketV1): string[] {
  return [packet.immutableInputHash, ...packet.acceptedFactRefs,
    ...packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => [fact.factRef, ...fact.evidenceRefs]),
    ...packet.currentGovernedEvidenceRefs, ...packet.selectedRdChargeRefs,
    ...packet.acceptedParticipantControlStates.map((state) => state.rdChargeRef)];
}

type HistoricalEvaluation = { executions: Array<{ family: string; statementAlias: string;
  packet: { bytes: number; transmitted: ShadowAiEconomicResolutionPacketV1 }; offlineStubPlan: ShadowAiEconomicResolutionPlanV1 }> };
type PackageAArtifact = { requests: Array<{ statementAlias: string; historicalProviderResult: string; diagnostic: Record<string, any> }> };
type PackageBArtifact = { requests: Array<{ statementAlias: string; containedCompatibilityMetrics: Record<string, any> }> };
