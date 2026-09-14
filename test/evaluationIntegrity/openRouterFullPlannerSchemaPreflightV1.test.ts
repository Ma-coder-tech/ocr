import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { validateShadowAiEconomicResolutionPlanV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import { SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  buildOpenRouterFullPlannerSchemaPreflightRequestV1,
  createSyntheticFullPlannerPacketV1,
  fullPlannerSchemaConstructCountsV1,
  inspectFullPlannerReferenceGroundingV1,
  invokeOpenRouterFullPlannerSchemaPreflightV1,
  localFullPlannerOutputSchemaV1,
  validateProviderFacingFullPlannerShapeV1,
  validateTranslatedConstraintSemanticsV1,
} from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";

describe("OpenRouter full planner schema synthetic preflight v1", () => {
  it("translates the actual full planner schema without changing the local schema", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const localSchema = localFullPlannerOutputSchemaV1(packet);
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", packet);
    const localCounts = fullPlannerSchemaConstructCountsV1(localSchema);
    const providerCounts = fullPlannerSchemaConstructCountsV1(request.providerSchema);

    expect(localCounts.minLength).toBeGreaterThan(0);
    expect(localCounts.maxLength).toBeGreaterThan(0);
    expect(localCounts.maxItems).toBeGreaterThan(0);
    expect(providerCounts.minLength).toBe(0);
    expect(providerCounts.maxLength).toBe(0);
    expect(providerCounts.maxItems).toBe(0);
    expect(providerCounts.anyOf).toBe(1);
    expect(providerCounts.pattern).toBe(1);
    expect(fullPlannerSchemaConstructCountsV1(localSchema)).toEqual(localCounts);
  });

  it("builds one bounded synthetic request with the retained transport controls", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const request = buildOpenRouterFullPlannerSchemaPreflightRequestV1("test-only-key", packet);
    const body = JSON.parse(request.body);

    expect(request.endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(Object.keys(request.headers).sort()).toEqual(["Authorization", "Content-Type", "X-OpenRouter-Metadata"].sort());
    expect(body).toMatchObject({
      model: "anthropic/claude-opus-4.6",
      store: false,
      stream: false,
      max_tokens: 4000,
      temperature: 0,
      provider: { allow_fallbacks: false, require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: { name: "shadow_ai_economic_resolution_plan_synthetic_preflight_v1", strict: true },
      },
    });
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(request.bodyBytes).toBe(10_134);
    expect(createHash("sha256").update(request.body).digest("hex")).toBe("875e4c7fb117078ad9b4cbe2c76a43d9a1cf63ad66804ca016e2caf5acc71a76");
    expect(request.body).not.toMatch(/\bGold\b|\bMID\b|account number|bank account|routing number|tax ID|\.pdf|\/Users\//i);
  });

  it("returns a complete full planner object that passes provider, local, grounding, and translated-constraint validation", async () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const output = validOutput(packet.issueId, packet.immutableInputHash);
    let calls = 0;
    const result = await invokeOpenRouterFullPlannerSchemaPreflightV1({
      apiKey: "test-only-key",
      packet,
      signal: new AbortController().signal,
      fetchImplementation: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          id: "gen-full-planner-test-1",
          model: "anthropic/claude-opus-4.6",
          provider: "Anthropic",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 900, completion_tokens: 400, total_tokens: 1300, cost: 0.02 },
          openrouter_metadata: { attempts: [{ provider_name: "Anthropic" }] },
        }), { status: 200, headers: { "x-generation-id": "generation-full-test-1" } });
      },
    });

    expect(calls).toBe(1);
    expect(validateProviderFacingFullPlannerShapeV1(result.rawOutput)).toEqual({ valid: true, errors: [] });
    const local = validateShadowAiEconomicResolutionPlanV1(result.rawOutput, packet);
    expect(local.ok).toBe(true);
    if (!local.ok) throw new Error("expected_valid_full_planner_output");
    expect(validateTranslatedConstraintSemanticsV1(local.plan)).toEqual({ valid: true, errors: [] });
    expect(inspectFullPlannerReferenceGroundingV1(result.rawOutput, packet)).toMatchObject({ valid: true, invalidRefs: [] });
    expect(result.telemetry).toMatchObject({ callCount: 1, retries: 0, returnedModel: "anthropic/claude-opus-4.6" });
  });
});

function validOutput(issueId: string, inputHash: string) {
  return {
    schemaVersion: SHADOW_AI_ECONOMIC_RESOLUTION_OUTPUT_SCHEMA_VERSION,
    outputType: "AI_INFERENCE_ONLY",
    authority: "NON_AUTHORITATIVE",
    admissionStatus: "NOT_ADMITTED",
    truthEffect: "NONE",
    financialMutationAllowed: false,
    customerRenderingAllowed: false,
    issueId,
    inputHash,
    exactCitedFactRefs: ["synthetic_fact_fee_label_001", "synthetic_fact_fee_occurrence_001"],
    unresolvedQuestion: "What economic role does the fictitious fee SYNTHETIC SERVICE PROGRAM X represent?",
    primaryHypothesis: {
      hypothesis: "The synthetic label may represent a bundled processor service, but the packet does not establish its components.",
      confidence: "LOW",
      supportingFactRefs: ["synthetic_fact_fee_label_001", "synthetic_rd_charge_ref_001"],
      contradictingFactRefs: [],
      acknowledgedEvidenceGaps: ["The synthetic governing service schedule is absent."],
      confirmationRequirements: ["A synthetic contract schedule must map the label to bundled services."],
      falsificationConditions: ["A synthetic gateway schedule mapping the label to a platform charge would falsify this hypothesis."],
    },
    alternativeHypotheses: [{
      hypothesis: "The synthetic label may instead represent a gateway or platform program charge separate from processor services.",
      confidence: "LOW",
      supportingFactRefs: ["synthetic_fact_fee_occurrence_001", "synthetic_governed_evidence_ref_001"],
      contradictingFactRefs: [],
      acknowledgedEvidenceGaps: ["No synthetic gateway product-code mapping is present."],
      confirmationRequirements: ["Synthetic operational data must identify the system and product code that originated the charge."],
      falsificationConditions: ["A synthetic processor schedule showing the charge is bundled would falsify this alternative."],
    }],
    acknowledgedEvidenceGaps: ["The synthetic packet contains no governing agreement or product-code mapping."],
    recommendedResolutionPath: "DOCUMENT_REQUIRED",
    requiredEvidenceClasses: ["MERCHANT_CONTRACT_OR_SCHEDULE"],
    researchQuerySuggestions: [],
    merchantQuestionSuggestions: ["Which synthetic agreement or service schedule governs SYNTHETIC SERVICE PROGRAM X?"],
    documentRequestSuggestions: ["Obtain the synthetic agreement and fee schedule covering SYNTHETIC SERVICE PROGRAM X for the fictitious period."],
    operationalDataRequests: ["Request the synthetic product code, billing source system, and service-component mapping for the occurrence."],
    internalExplanationDraft: "The synthetic label is compatible with more than one economic role; governed documentary evidence is required before classification.",
    unresolvedAfterAnalysis: true,
    limitationCodes: ["SYNTHETIC_GOVERNING_DOCUMENT_MISSING", "SYNTHETIC_PRODUCT_CODE_MAPPING_MISSING"],
    reconstructionSuspicions: [],
  };
}
