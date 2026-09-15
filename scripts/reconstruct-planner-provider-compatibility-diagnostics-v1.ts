import { readFileSync } from "node:fs";

import { canonicalJson } from "../src/canonical/v2/canonicalJson.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";

const SOURCE_ARTIFACT = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const source = JSON.parse(readFileSync(SOURCE_ARTIFACT, "utf8")) as HistoricalEvaluation;
const auditByIssueId = new Map(source.promptAudits.map((audit) => [audit.issueId, audit] as const));

const requests = source.executions.map((execution) => {
  const audit = auditByIssueId.get(execution.issue.issueId);
  if (!audit) throw new Error(`historical_prompt_audit_missing:${execution.issue.issueId}`);
  const before = canonicalJson(execution.packet.transmitted);
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("offline-diagnostic-key", execution.packet.transmitted);
  const diagnostic = inspectPlannerProviderCompatibilityV1(request);
  const after = canonicalJson(execution.packet.transmitted);
  const parity = {
    recordedAndReconstructedBodyBytesEqual: diagnostic.requestBodyBytes === audit.requestBodyBytes,
    recordedAndReconstructedBodySha256Equal: diagnostic.requestBodySha256 === audit.requestBodySha256,
    packetSerializationUnchanged: before === after,
  };
  if (Object.values(parity).some((value) => !value)) throw new Error(`historical_request_parity_failed:${execution.issue.issueId}`);
  return {
    family: execution.family,
    statementAlias: execution.statementAlias,
    historicalProviderResult: execution.provider.accepted ? "ACCEPTED" as const : "REJECTED_HTTP_400" as const,
    governedReferenceCount: execution.packet.transmitted.currentGovernedEvidenceRefs.length,
    packetBytes: execution.packet.bytes,
    parity,
    diagnostic,
  };
});

const successful = requests.filter((item) => item.historicalProviderResult === "ACCEPTED");
const failed = requests.filter((item) => item.historicalProviderResult === "REJECTED_HTTP_400");
const artifact = {
  schemaVersion: "planner_provider_compatibility_historical_reconstruction_2026_09_15_v1",
  sourceArtifact: SOURCE_ARTIFACT,
  providerCalls: 0,
  reconstructedRequestCount: requests.length,
  requests,
  relationship: {
    successfulGovernedReferenceCounts: successful.map((item) => item.governedReferenceCount),
    failedGovernedReferenceCounts: failed.map((item) => item.governedReferenceCount),
    successfulMaximumEnumCardinalities: successful.map((item) => item.diagnostic.maximumEnumCardinality),
    failedMaximumEnumCardinalities: failed.map((item) => item.diagnostic.maximumEnumCardinality),
    successfulProviderSchemaBytes: successful.map((item) => item.diagnostic.providerSchemaBytes),
    failedProviderSchemaBytes: failed.map((item) => item.diagnostic.providerSchemaBytes),
    observedAssociationReproduced: failed.every((item) => item.diagnostic.maximumEnumCardinality > Math.max(...successful.map((success) => success.diagnostic.maximumEnumCardinality))),
    exactProviderLimitProven: false,
    finding: "Historical failures remain associated with broad governed-reference sets, repeated packet-specific enum expansion, and larger provider schemas; the exact provider constraint is not established by offline evidence.",
  },
  contentBoundary: {
    rawRequestBodiesStored: false,
    packetContentsStored: false,
    providerResponseBodiesStored: false,
    merchantDerivedPayloadValuesCopied: false,
    diagnosticContainsOnlyMetricsHashesOpaqueAliasesAndIssueFamilyLabels: true,
  },
};

const serialized = JSON.stringify(artifact, null, 2);
const prohibitedValues = source.executions.flatMap((execution) => [
  execution.packet.transmitted.merchantBusinessContext?.businessName,
  ...execution.packet.transmitted.sanitizedFeeLabels,
  ...execution.packet.transmitted.currentGovernedEvidenceRefs,
]).filter((value): value is string => typeof value === "string" && value.length > 0 && !/^Opaque Business \d+$/.test(value));
if (prohibitedValues.some((value) => serialized.includes(value))) throw new Error("diagnostic_artifact_payload_value_leak");
console.log(serialized);

type HistoricalEvaluation = {
  promptAudits: Array<{ issueId: string; requestBodyBytes: number; requestBodySha256: string }>;
  executions: Array<{
    family: string;
    statementAlias: string;
    issue: { issueId: string };
    packet: { bytes: number; transmitted: any };
    provider: { accepted: boolean };
  }>;
};
