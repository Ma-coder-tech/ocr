import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";
import {
  buildHistoricalFullSyntheticTypedPatternVariantV1,
  buildTypedPatternIssueIdPatternIsolationVariantV1,
  compareTypedPatternControlToIssueIdPatternVariantV1,
} from "../../src/evaluationIntegrity/plannerRequestShapeForensicDifferentialV1.js";

describe("issue-ID constraint isolation v1", () => {
  it("reconstructs the accepted Call 3 control and issueId-only variant deterministically without network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const packet = createSyntheticFullPlannerPacketV1();
    const control = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
    const variant = buildTypedPatternIssueIdPatternIsolationVariantV1(packet);
    const controlDiagnostic = inspectPlannerProviderCompatibilityV1(control);
    const variantDiagnostic = inspectPlannerProviderCompatibilityV1(variant);

    expect(controlDiagnostic).toMatchObject({
      requestBodyBytes: 9_512,
      requestBodySha256: "5018a11fe4b71ff28e24668a8d0c273b9e80829f174937224f2fae046b0ab180",
      providerSchemaBytes: 5_389,
      providerSchemaSha256: "45f4b1ec60730727ebc4a1871d008fb27a23414e7353e3ee47403cfb0ad7eb99",
      patternCount: 8,
      constCount: 15,
    });
    expect(variantDiagnostic).toMatchObject({
      requestBodyBytes: 9_517,
      requestBodySha256: "9dd98c60899f35cf359329663dd0b2e4d5c9b49ebcb87b442604cfc86b089a39",
      providerSchemaBytes: 5_394,
      providerSchemaSha256: "16dbb511ff8ca97e456b275bddbf8ee3bde356f7f0dd3074ea5e3a74692a9e01",
      patternCount: 9,
      constCount: 14,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("proves exactly the issueId const removal and stable pattern addition changed", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const control = buildHistoricalFullSyntheticTypedPatternVariantV1(packet);
    const variant = buildTypedPatternIssueIdPatternIsolationVariantV1(packet);
    const diff = compareTypedPatternControlToIssueIdPatternVariantV1(control, variant);
    const controlBody = JSON.parse(control.body);
    const variantBody = JSON.parse(variant.body);

    expect(diff).toEqual({
      validSingleVariableChange: true,
      changedPaths: [
        "$.response_format.json_schema.schema.properties.issueId.const",
        "$.response_format.json_schema.schema.properties.issueId.pattern",
      ],
      expectedChangedPaths: [
        "$.response_format.json_schema.schema.properties.issueId.const",
        "$.response_format.json_schema.schema.properties.issueId.pattern",
      ],
      unexpectedChangedPaths: [],
    });
    expect(variantBody.messages).toEqual(controlBody.messages);
    expect({ ...variantBody, response_format: undefined }).toEqual({ ...controlBody, response_format: undefined });
    expect({ ...variantBody.response_format.json_schema, schema: undefined })
      .toEqual({ ...controlBody.response_format.json_schema, schema: undefined });
  });

  it("keeps the completed artifact bounded and secret-free", () => {
    const artifactPath = "evaluations/planner-issue-id-constraint-isolation-v1/evaluation-2026-09-16.json";
    if (!exists(artifactPath)) return;
    const text = readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(text);
    expect(artifact.executionBoundary).toMatchObject({ maximumProviderCalls: 1, callsAttempted: 1, callsCompleted: 1, retries: 0, fallbacks: 0 });
    expect(artifact.issueIdOnlyDifferential).toMatchObject({ validSingleVariableChange: true, unexpectedChangedPaths: [] });
    expect(text).not.toMatch(/Bearer\s|sk-or-v1-|OPENROUTER_API_KEY|"Authorization"\s*:|"rawOutput"|"packet"\s*:/);
  });
});

function exists(path: string): boolean { try { readFileSync(path); return true; } catch { return false; } }
