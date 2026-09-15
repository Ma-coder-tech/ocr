import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { ShadowAiEconomicResolutionPacketV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildMeaningfulDifferentialV1,
  reconstructForensicAnchorsV1,
  safeRequestShapeV1,
} from "../../src/evaluationIntegrity/plannerRequestShapeForensicDifferentialV1.js";

const HISTORICAL_PATH = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const ARTIFACT_PATH = "evaluations/planner-request-shape-forensic-differential-v1/differential-2026-09-15.json";

describe("offline planner request-shape forensic differential v1", () => {
  it("reconstructs all anchors deterministically without invoking fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = reconstruct();
    const second = reconstruct();

    for (const key of Object.keys(first) as Array<keyof typeof first>) {
      expect(first[key].body).toBe(second[key].body);
      expect(canonicalJson(first[key].providerSchema)).toBe(canonicalJson(second[key].providerSchema));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("matches the four recorded accepted/rejected body and schema identities", () => {
    const value = reconstruct();
    const shapes = Object.fromEntries(Object.entries(value).map(([key, request]) => [key, safeRequestShapeV1(request)])) as any;
    expect(shapes.historicalReal.compatibility).toMatchObject({
      requestBodyBytes: 12_427,
      requestBodySha256: "a152044d4115cc1b18a1e19c7c42dc4e58d50ea3f4034926ccd3333b38a18bb7",
      providerSchemaBytes: 6_200,
      providerSchemaSha256: "ec1bb57e087be8b31f73e6df7e09a94a7ac38f9a6653ee8ae07ff0f164367114",
      enumNodeCount: 12,
      constCount: 15,
      patternCount: 1,
    });
    expect(shapes.historicalMinimalSynthetic.compatibility).toMatchObject({
      requestBodyBytes: 1_254,
      requestBodySha256: "8efa6ffad38af06ce71ecfea6ef84c6a24dd873e902e2c3ed0a3bab522c6f4a8",
      providerSchemaBytes: 613,
      providerSchemaSha256: "ee999027f3c6fb17e47c34c5d43c7b146d8385709280738d14cfab80b8a26319",
    });
    expect(shapes.historicalFullSynthetic.compatibility).toMatchObject({
      requestBodyBytes: 10_134,
      requestBodySha256: "875e4c7fb117078ad9b4cbe2c76a43d9a1cf63ad66804ca016e2caf5acc71a76",
      providerSchemaBytes: 6_011,
      providerSchemaSha256: "ed7870329ad11ead9af4b6dfa99befd131baf1da63cbae8b061e6a61dbd1aeb9",
    });
    expect(shapes.currentRejected.compatibility).toMatchObject({
      requestBodyBytes: 11_596,
      requestBodySha256: "1a73ad76d9d19a4c6f1186ccd2bbe417f4d2be2ecd4138111c5fb6e59bbaa7b0",
      providerSchemaBytes: 5_472,
      providerSchemaSha256: "9d382aab64862b3818e1e46de385170cf3f1cc392b7e335d5d33acf1e334bcb6",
      enumNodeCount: 5,
      constCount: 13,
      patternCount: 9,
    });
  });

  it("records the exact unchanged transport surface and material schema deltas", () => {
    const value = reconstruct();
    const historical = safeRequestShapeV1(value.historicalReal);
    const current = safeRequestShapeV1(value.currentRejected);
    const differential = buildMeaningfulDifferentialV1(historical, current);
    const byPath = new Map(differential.map((row: any) => [row.path, row]));

    for (const path of ["endpoint", "method", "headerNames", "body.keys", "body.model", "body.store", "body.stream",
      "body.temperature", "body.max_tokens", "body.messages.roles", "body.provider", "body.response_format.type",
      "body.response_format.json_schema.strict", "schema.root.type", "schema.root.required", "schema.root.additionalProperties"]) {
      expect(byPath.get(path)?.changeType, path).toBe("UNCHANGED");
    }
    expect(byPath.get("body.response_format.json_schema.name")?.changeType).toBe("CHANGED");
    expect(byPath.get("schema.metrics.patternCount")).toMatchObject({ historicalAccepted: 1, currentRejected: 9, changeType: "CHANGED" });
    expect(byPath.get("schema.metrics.enumNodeCount")).toMatchObject({ historicalAccepted: 12, currentRejected: 5, changeType: "CHANGED" });
    expect(byPath.get("schema.metrics.constCount")).toMatchObject({ historicalAccepted: 15, currentRejected: 13, changeType: "CHANGED" });
  });

  it("keeps the committed artifact privacy-safe and preserves Package A/B/C boundaries", () => {
    const historical = historicalEvaluation();
    const authorization = historical.executions.find((execution: any) => execution.family === "AUTHORIZATION_ECONOMICS");
    const text = readFileSync(ARTIFACT_PATH, "utf8");
    const artifact = JSON.parse(text);
    const prohibited = [
      authorization.packet.transmitted.merchantBusinessContext?.businessName,
      ...authorization.packet.transmitted.sanitizedFeeLabels,
      ...authorization.packet.transmitted.acceptedFactRefs,
      ...authorization.packet.transmitted.currentGovernedEvidenceRefs,
      ...authorization.packet.transmitted.selectedRdChargeRefs,
      ...authorization.packet.transmitted.acceptedIssueRelevantActivityFacts.flatMap((fact: any) => [fact.factRef, ...fact.evidenceRefs]),
    ].filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

    for (const value of prohibited) expect(text).not.toContain(value);
    expect(text).not.toMatch(/Bearer\s|sk-or-v1-/);
    expect(artifact.executionBoundary).toMatchObject({ offlineOnly: true, providerCalls: 0, networkCalls: 0, plannerChanges: 0, providerRequestBehaviorChanges: 0 });
    expect(artifact.architecture).toMatchObject({ conflictFound: false, packageBPrivacyPreserved: true, packageCStabilityPreserved: true });
    expect(artifact.contentBoundary).toMatchObject({ rawRequestBodiesStored: false, merchantPayloadValuesStored: false, rawInternalReferencesStored: false });
  });
});

function reconstruct() {
  const historical = historicalEvaluation();
  const authorization = historical.executions.find((execution: any) => execution.family === "AUTHORIZATION_ECONOMICS");
  return reconstructForensicAnchorsV1({
    historicalAuthorizationPacket: authorization.packet.transmitted as ShadowAiEconomicResolutionPacketV1,
    historicalSyntheticPacket: createSyntheticFullPlannerPacketV1(),
  });
}

function historicalEvaluation(): any { return JSON.parse(readFileSync(HISTORICAL_PATH, "utf8")); }
