import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import {
  buildHistoricalAcceptedFullSyntheticRequestV1,
  buildHistoricalFullSyntheticTypedPatternVariantV1,
  compareHistoricalFullSyntheticToTypedPatternVariantV1,
} from "../../src/evaluationIntegrity/plannerRequestShapeForensicDifferentialV1.js";

describe("minimal synthetic provider compatibility isolation v1", () => {
  it("reconstructs the accepted full-planner control exactly without network activity", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = buildHistoricalAcceptedFullSyntheticRequestV1(createSyntheticFullPlannerPacketV1());
    const diagnostic = inspectPlannerProviderCompatibilityV1(request);

    expect(diagnostic).toMatchObject({
      requestBodyBytes: 10_134,
      requestBodySha256: "875e4c7fb117078ad9b4cbe2c76a43d9a1cf63ad66804ca016e2caf5acc71a76",
      providerSchemaBytes: 6_011,
      providerSchemaSha256: "ed7870329ad11ead9af4b6dfa99befd131baf1da63cbae8b061e6a61dbd1aeb9",
      patternCount: 1,
      enumNodeCount: 12,
      totalEnumLiteralCount: 49,
      constCount: 15,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("changes only seven reference constraints from enum to typed pattern", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const control = buildHistoricalAcceptedFullSyntheticRequestV1(packet);
    const variant = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
    const differential = compareHistoricalFullSyntheticToTypedPatternVariantV1(control, variant);
    const controlBody = JSON.parse(control.body);
    const variantBody = JSON.parse(variant.body);
    const controlSchema = controlBody.response_format.json_schema.schema;
    const variantSchema = variantBody.response_format.json_schema.schema;

    expect(differential.validSingleVariableChange).toBe(true);
    expect(differential.changedPaths).toHaveLength(14);
    expect(differential.unexpectedChangedPaths).toEqual([]);
    expect(variantBody.messages).toEqual(controlBody.messages);
    expect({ ...variantBody, response_format: undefined }).toEqual({ ...controlBody, response_format: undefined });
    expect({ ...variantBody.response_format.json_schema, schema: undefined })
      .toEqual({ ...controlBody.response_format.json_schema, schema: undefined });
    expect(inspectPlannerProviderCompatibilityV1(variant)).toMatchObject({
      schemaDepth: 7,
      schemaNodeCount: 76,
      patternCount: 8,
      enumNodeCount: 5,
      totalEnumLiteralCount: 23,
      constCount: 15,
    });
    expect(canonicalJson(controlSchema)).not.toBe(canonicalJson(variantSchema));
  });

  it("is deterministic across repeated reconstruction", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const first = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
    const second = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
    expect(first.body).toBe(second.body);
    expect(canonicalJson(first.providerSchema)).toBe(canonicalJson(second.providerSchema));
  });

  it("persists only safe bounded telemetry for the completed three-call experiment", () => {
    const text = readFileSync("evaluations/planner-synthetic-compatibility-isolation-v1/evaluation-2026-09-16.json", "utf8");
    const artifact = JSON.parse(text);
    const guard = JSON.parse(readFileSync("evaluations/planner-synthetic-compatibility-isolation-v1/attempt-guard.json", "utf8"));

    expect(artifact.results).toHaveLength(3);
    expect(artifact.results.map((result: any) => [result.provider.httpStatus, result.accepted])).toEqual([[200, true], [200, true], [200, true]]);
    expect(artifact.accounting).toMatchObject({ callsReserved: 3, callsAttempted: 3, callsCompleted: 3, retries: 0, fallbacks: 0 });
    expect(artifact.call2VersusCall3StructuralDifferential).toMatchObject({ validSingleVariableChange: true, unexpectedChangedPaths: [] });
    expect(artifact.hypothesisAssessment).toMatchObject({ eliminates: ["TYPED_PATTERN_CONSTRUCT_SUFFICIENT_BY_ITSELF"], typedPatternIsolationReached: true });
    expect(guard).toMatchObject({ maximumCalls: 3, callsAttempted: 3, callsCompleted: 3, completed: true });
    expect(text).not.toMatch(/Authorization|Bearer |OPENROUTER_API_KEY|"rawOutput"|"packet":/);
  });
});
