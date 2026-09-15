import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "../../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";

const HISTORICAL_ARTIFACT = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const DIAGNOSTIC_ARTIFACT = "evaluations/planner-provider-compatibility-observability-safe-diagnostics-v1/diagnostics-2026-09-15.json";

describe("Planner provider compatibility diagnostics v1", () => {
  it("is deterministic and does not alter request or packet serialization", () => {
    const source = historicalEvaluation();
    const packet = source.executions[0]!.packet.transmitted;
    const packetBefore = canonicalJson(packet);
    const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("test-only-key", packet);
    const bodyBefore = request.body;

    const first = inspectPlannerProviderCompatibilityV1(request);
    const second = inspectPlannerProviderCompatibilityV1(request);

    expect(first).toEqual(second);
    expect(request.body).toBe(bodyBefore);
    expect(canonicalJson(packet)).toBe(packetBefore);
    expect(first.requestBodyBytes).toBe(Buffer.byteLength(bodyBefore, "utf8"));
    expect(first).toMatchObject({
      schemaDepth: 7,
      schemaNodeCount: 76,
      enumNodeCount: 5,
      constCount: 13,
      maximumItemsConstraintCount: 0,
      minimumLengthConstraintCount: 0,
      maximumLengthConstraintCount: 0,
    });
  });

  it("preserves the accepted six-request Package A reconstruction as immutable historical evidence", () => {
    const artifact = JSON.parse(readFileSync(DIAGNOSTIC_ARTIFACT, "utf8"));
    const reconstructed = artifact.requests.map((request: any) => {
      expect(request.parity).toEqual({
        recordedAndReconstructedBodyBytesEqual: true,
        recordedAndReconstructedBodySha256Equal: true,
        packetSerializationUnchanged: true,
      });
      return {
        accepted: request.historicalProviderResult === "ACCEPTED",
        governedRefs: request.governedReferenceCount,
        maximumEnumCardinality: request.diagnostic.maximumEnumCardinality,
        schemaBytes: request.diagnostic.providerSchemaBytes,
      };
    });

    expect(reconstructed).toEqual([
      { accepted: true, governedRefs: 0, maximumEnumCardinality: 8, schemaBytes: 6200 },
      { accepted: false, governedRefs: 66, maximumEnumCardinality: 71, schemaBytes: 15055 },
      { accepted: false, governedRefs: 48, maximumEnumCardinality: 57, schemaBytes: 12577 },
      { accepted: true, governedRefs: 9, maximumEnumCardinality: 15, schemaBytes: 7071 },
      { accepted: false, governedRefs: 108, maximumEnumCardinality: 114, schemaBytes: 22190 },
      { accepted: true, governedRefs: 0, maximumEnumCardinality: 8, schemaBytes: 6115 },
    ]);
  });

  it("does not copy packet or merchant-derived values into diagnostics", () => {
    const source = historicalEvaluation();
    for (const execution of source.executions) {
      const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("test-only-key", execution.packet.transmitted);
      const diagnosticText = JSON.stringify(inspectPlannerProviderCompatibilityV1(request));
      const prohibitedValues = [
        execution.packet.transmitted.processorFamily,
        execution.packet.transmitted.merchantBusinessContext?.businessName,
        ...execution.packet.transmitted.sanitizedFeeLabels,
        ...execution.packet.transmitted.currentGovernedEvidenceRefs,
      ].filter((value): value is string => typeof value === "string" && value.length > 0);
      for (const value of prohibitedValues) expect(diagnosticText).not.toContain(value);
      expect(diagnosticText).not.toContain("test-only-key");
      expect(diagnosticText).not.toContain("messages");
      expect(diagnosticText).not.toContain("packet");
    }
  });

  it("keeps the committed Package A artifact content-free and internally parity-complete", () => {
    const artifact = JSON.parse(readFileSync(DIAGNOSTIC_ARTIFACT, "utf8"));
    expect(artifact.providerCalls).toBe(0);
    expect(artifact.contentBoundary).toEqual({
      rawRequestBodiesStored: false,
      packetContentsStored: false,
      providerResponseBodiesStored: false,
      merchantDerivedPayloadValuesCopied: false,
      diagnosticContainsOnlyMetricsHashesOpaqueAliasesAndIssueFamilyLabels: true,
    });
    expect(artifact.requests).toHaveLength(6);
    for (const request of artifact.requests) {
      expect(request.parity).toEqual({
        recordedAndReconstructedBodyBytesEqual: true,
        recordedAndReconstructedBodySha256Equal: true,
        packetSerializationUnchanged: true,
      });
      expect(request.diagnostic.requestBodySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(request.diagnostic.providerSchemaSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

function historicalEvaluation(): any {
  return JSON.parse(readFileSync(HISTORICAL_ARTIFACT, "utf8"));
}
