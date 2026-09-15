import { readFileSync } from "node:fs";

const SOURCE_ARTIFACT = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const ACCEPTED_DIAGNOSTIC_ARTIFACT = "evaluations/planner-provider-compatibility-observability-safe-diagnostics-v1/diagnostics-2026-09-15.json";

// Package A captured byte/SHA parity against the then-current request builder. Package B
// intentionally changes provider serialization, so its accepted evidence is immutable and
// must not be regenerated through the contained builder as though it were historical bytes.
const source = JSON.parse(readFileSync(SOURCE_ARTIFACT, "utf8")) as HistoricalEvaluation;
const artifact = JSON.parse(readFileSync(ACCEPTED_DIAGNOSTIC_ARTIFACT, "utf8")) as AcceptedArtifact;

if (artifact.providerCalls !== 0 || artifact.reconstructedRequestCount !== 6 || artifact.requests.length !== 6) {
  throw new Error("accepted_package_a_diagnostic_artifact_invalid");
}
if (artifact.requests.some((request) => Object.values(request.parity).some((value) => value !== true))) {
  throw new Error("accepted_package_a_historical_parity_incomplete");
}

const serialized = JSON.stringify(artifact, null, 2);
const prohibitedValues = source.executions.flatMap((execution) => [
  execution.packet.transmitted.merchantBusinessContext?.businessName,
  ...execution.packet.transmitted.sanitizedFeeLabels,
  ...execution.packet.transmitted.currentGovernedEvidenceRefs,
]).filter((value): value is string => typeof value === "string" && value.length > 0 && !/^Opaque Business \d+$/.test(value));
if (prohibitedValues.some((value) => serialized.includes(value))) throw new Error("accepted_package_a_diagnostic_artifact_payload_value_leak");
console.log(serialized);

type HistoricalEvaluation = {
  executions: Array<{
    packet: { transmitted: {
      merchantBusinessContext?: { businessName?: string | null } | null;
      sanitizedFeeLabels: string[];
      currentGovernedEvidenceRefs: string[];
    } };
  }>;
};

type AcceptedArtifact = {
  providerCalls: number;
  reconstructedRequestCount: number;
  requests: Array<{
    parity: {
      recordedAndReconstructedBodyBytesEqual: boolean;
      recordedAndReconstructedBodySha256Equal: boolean;
      packetSerializationUnchanged: boolean;
    };
  }>;
};
