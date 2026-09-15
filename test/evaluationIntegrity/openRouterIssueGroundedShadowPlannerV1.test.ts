import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ShadowAiEconomicIssueClassV1, ShadowAiEconomicResolutionPacketV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import {
  buildIssueGroundedPlannerContextV1,
  buildOpenRouterIssueGroundedShadowPlannerRequestV1,
  issueGroundedPlannerSystemPromptV1,
} from "../../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";
import { countSchemaKeywordV2 } from "../../src/evaluationIntegrity/openRouterClaudeStructuredOutputPreflightV2.js";

describe("Issue-Grounded Shadow AI Planner Prompt v1", () => {
  it("keeps the real system instruction free of preflight contamination and prescribed answers", () => {
    const prompt = issueGroundedPlannerSystemPromptV1();
    expect(prompt).not.toMatch(/SYNTHETIC SERVICE PROGRAM X/i);
    expect(prompt).not.toMatch(/synthetic|fictitious/i);
    expect(prompt).not.toMatch(/bundled processor service|gateway(?:-level|\/platform) program|fraud screening|tokenization|PCI program|reporting service/i);
    expect(prompt).not.toMatch(/DOCUMENT_REQUIRED|PUBLIC_RESEARCH_REQUIRED|PROCESSOR_OR_GATEWAY_DATA_REQUIRED|MERCHANT_INPUT_REQUIRED|MULTI_STATEMENT_REQUIRED|COMPARATOR_EVIDENCE_REQUIRED/);
    expect(prompt).toContain("Analyze only the unresolved issue");
    expect(prompt).toContain("Do not import examples");
  });

  it("preserves the proven single-plan transport shape without batch wrappers", () => {
    const packet = packetFor("AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", ["authorization_population", "approval_population"], ["population_definitions_unresolved"]);
    const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("test-only-key", packet);
    const body = JSON.parse(request.body);
    const user = JSON.parse(body.messages[1].content);
    expect(body).toMatchObject({
      model: "anthropic/claude-opus-4.6",
      store: false,
      stream: false,
      temperature: 0,
      max_tokens: 4_000,
      provider: { allow_fallbacks: false, require_parameters: true },
      response_format: { type: "json_schema", json_schema: { name: "shadow_ai_economic_resolution_plan_issue_grounded_v1", strict: true } },
    });
    expect(Object.keys(user).sort()).toEqual(["issueContext", "packet"]);
    expect(user.packet).toEqual(packet);
    expect(body.outputs).toBeUndefined();
    expect(user.packets).toBeUndefined();
    expect(countSchemaKeywordV2(request.providerSchema, "minLength")).toBe(0);
    expect(countSchemaKeywordV2(request.providerSchema, "maxLength")).toBe(0);
    expect(countSchemaKeywordV2(request.providerSchema, "maxItems")).toBe(0);
  });

  it("grounds three materially different issue classes in their own packet context", () => {
    const authorization = packetFor("AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE", ["authorization_population", "settlement_population"], ["population_identity_unresolved"]);
    const participant = packetFor("PARTICIPANT_CONTROL_UNCERTAINTY", ["economic_beneficiary", "price_setter"], ["collection_does_not_prove_control"]);
    const qualification = packetFor("QUALIFICATION_INTEGRITY_ROOT_CAUSE", ["causal_reason", "operational_influence"], ["root_cause_unknown"]);
    const contexts = [authorization, participant, qualification].map(buildIssueGroundedPlannerContextV1);
    expect(new Set(contexts.map((value) => value.unresolvedQuestion)).size).toBe(3);
    expect(contexts[0].unresolvedQuestion).toContain("authorization_population");
    expect(contexts[1].unresolvedQuestion).toContain("economic_beneficiary");
    expect(contexts[2].unresolvedQuestion).toContain("causal_reason");
    for (const context of contexts) {
      expect(context.unresolvedQuestion).toContain(context.issueClass);
      expect(context.unresolvedQuestion).not.toMatch(/SYNTHETIC SERVICE PROGRAM X|fictitious fee/i);
    }
  });

  it("changes the supplied unresolved question whenever packet issue context changes", () => {
    const first = packetFor("PARTICIPANT_CONTROL_UNCERTAINTY", ["collector"], ["collector_unknown"]);
    const second = packetFor("PARTICIPANT_CONTROL_UNCERTAINTY", ["rule_setter"], ["rule_setter_unknown"]);
    const firstBody = JSON.parse(buildOpenRouterIssueGroundedShadowPlannerRequestV1("test-only-key", first).body);
    const secondBody = JSON.parse(buildOpenRouterIssueGroundedShadowPlannerRequestV1("test-only-key", second).body);
    const firstQuestion = JSON.parse(firstBody.messages[1].content).issueContext.unresolvedQuestion;
    const secondQuestion = JSON.parse(secondBody.messages[1].content).issueContext.unresolvedQuestion;
    expect(firstQuestion).not.toBe(secondQuestion);
    expect(firstQuestion).toContain("collector");
    expect(secondQuestion).toContain("rule_setter");
  });
});

function packetFor(issueClass: ShadowAiEconomicIssueClassV1, facets: string[], reasons: string[]): ShadowAiEconomicResolutionPacketV1 {
  const base = JSON.parse(JSON.stringify(createSyntheticFullPlannerPacketV1()), (_key, value) =>
    typeof value === "string" ? value.replaceAll("SYNTHETIC", "FIXTURE").replaceAll("synthetic", "fixture") : value) as ShadowAiEconomicResolutionPacketV1;
  const withoutHash = {
    ...base,
    issueId: `fixture_issue_${issueClass.toLowerCase()}`,
    issueClass,
    unresolvedClaimFacets: facets,
    unresolvedReasonCodes: reasons,
  };
  const { immutableInputHash: _ignored, ...hashInput } = withoutHash;
  return Object.freeze({ ...hashInput, immutableInputHash: createHash("sha256").update(canonicalJson(hashInput)).digest("hex") });
}
