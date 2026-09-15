import { describe, expect, it } from "vitest";

import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../../src/canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { buildOpenRouterFullPlannerSchemaPreflightRequestV1, createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import { createGoldShapedSyntheticPlannerPacketV1, inspectGoldShapedSyntheticPacketBoundaryV1 } from "../../src/evaluationIntegrity/openRouterGoldShapedSinglePacketPreflightV1.js";
import { countSchemaKeywordV2 } from "../../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";

describe("Gold-shaped single-packet planner preflight v1", () => {
  it("creates a larger entirely synthetic, privacy-valid packet", () => {
    const packet = createGoldShapedSyntheticPlannerPacketV1();
    const reference = createSyntheticFullPlannerPacketV1();

    expect(Buffer.byteLength(canonicalJson(packet), "utf8")).toBeGreaterThan(Buffer.byteLength(canonicalJson(reference), "utf8"));
    expect(inspectShadowAiEconomicResolutionPacketPrivacyV1(packet)).toEqual({ valid: true, reasonCodes: [] });
    expect(inspectGoldShapedSyntheticPacketBoundaryV1(packet)).toEqual({ valid: true, reasonCodes: [] });
    expect(packet.acceptedFactRefs.length).toBeGreaterThanOrEqual(6);
    expect(packet.selectedRdChargeRefs.length).toBeGreaterThanOrEqual(3);
    expect(packet.currentGovernedEvidenceRefs.length).toBeGreaterThanOrEqual(5);
    expect(packet.acceptedParticipantControlStates.length).toBeGreaterThanOrEqual(3);
  });

  it("uses the accepted single-plan request builder without a batch wrapper", () => {
    const packet = createGoldShapedSyntheticPlannerPacketV1();
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", packet);
    const body = JSON.parse(request.body);

    expect(body).toMatchObject({
      model: "anthropic/claude-opus-4.6",
      store: false,
      stream: false,
      temperature: 0,
      max_tokens: 4_000,
      provider: { allow_fallbacks: false, require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "shadow_ai_economic_resolution_plan_synthetic_preflight_v1",
          strict: true,
        },
      },
    });
    expect(Object.keys(JSON.parse(body.messages[1].content))).toEqual(["packet"]);
    expect(body.response_format.json_schema.schema.properties.outputs).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(countSchemaKeywordV2(request.providerSchema, "minLength")).toBe(0);
    expect(countSchemaKeywordV2(request.providerSchema, "maxLength")).toBe(0);
    expect(countSchemaKeywordV2(request.providerSchema, "maxItems")).toBe(0);
  });
});
