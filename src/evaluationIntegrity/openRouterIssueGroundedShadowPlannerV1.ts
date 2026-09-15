import { inspectShadowAiEconomicResolutionPacketPrivacyV1 } from "../canonical/shadowAiEconomicResolutionIssueSelectionV1.js";
import type { ShadowAiEconomicResolutionPacketV1 } from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import { APPROVED_OPENROUTER_ENDPOINT } from "../canonical/v2/intelligence/providerPreflight.js";
import {
  localFullPlannerOutputSchemaV1,
} from "./openRouterFullPlannerSchemaPreflightV1.js";
import {
  OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
  countSchemaKeywordV2,
  sendOpenRouterClaudeJsonSchemaEvaluationRequestV2,
  translateSchemaForAnthropicStructuredOutputsV2,
  type OpenRouterClaudePreflightRequestV2,
  type OpenRouterPreflightTelemetryV2,
} from "./openRouterClaudeStructuredOutputPreflightV2.js";

export const ISSUE_GROUNDED_SHADOW_PLANNER_SCHEMA_NAME_V1 =
  "shadow_ai_economic_resolution_plan_issue_grounded_v1" as const;

export type IssueGroundedPlannerContextV1 = Readonly<{
  issueId: string;
  issueClass: string;
  unresolvedQuestion: string;
  unresolvedFacets: readonly string[];
  unresolvedReasonCodes: readonly string[];
}>;

export function issueGroundedPlannerSystemPromptV1(): string {
  return `You are a non-authoritative payment-economics resolution planner operating in a shadow evaluation.
Analyze only the unresolved issue and bounded context supplied in the user packet. Treat accepted facts and their immutable references as facts. Treat UNKNOWN, CONFLICTING, and UNAVAILABLE states as unresolved.
Never invent a merchant-specific fee, service, participant, population, amount, rate, business fact, program, document, or operational event that is not supported by the packet.
Generate hypotheses only for the actual selected issue. Label every hypothesis as uncertain, provide materially distinct alternatives where meaningful, identify the evidence gap for each, and state what would confirm or falsify it.
Choose the most appropriate resolution path permitted by the response schema based solely on the issue and missing evidence. Do not predetermine the route.
Every substantive merchant-specific noun or claim must be traceable to an accepted packet fact/reference, or be explicitly framed as a hypothesis with its evidence gap stated. General payment-processing knowledge may guide hypotheses but must never be presented as accepted merchant-specific fact.
Do not import examples, labels, hypotheses, routes, business types, evidence requests, or other substantive content from these instructions into the analysis.
Preserve uncertainty and all non-authoritative authority constants. Do not browse, research, call tools, admit evidence, mutate truth, calculate savings, make comparisons, assign blame, or create customer output.
Return exactly one complete object matching the JSON schema. Copy issueId and immutableInputHash exactly, cite only references present in the packet, and keep researchQuerySuggestions empty because research is not authorized.`;
}

export function buildIssueGroundedPlannerContextV1(packet: ShadowAiEconomicResolutionPacketV1): IssueGroundedPlannerContextV1 {
  const facets = [...packet.unresolvedClaimFacets];
  const reasons = [...packet.unresolvedReasonCodes];
  return Object.freeze({
    issueId: packet.issueId,
    issueClass: packet.issueClass,
    unresolvedQuestion: `What remains unresolved for issue ${packet.issueClass} across packet facets [${facets.join(", ") || "none supplied"}] given reason codes [${reasons.join(", ") || "none supplied"}]?`,
    unresolvedFacets: Object.freeze(facets),
    unresolvedReasonCodes: Object.freeze(reasons),
  });
}

export function buildIssueGroundedPlannerUserPayloadV1(packet: ShadowAiEconomicResolutionPacketV1): string {
  return canonicalJson({
    issueContext: buildIssueGroundedPlannerContextV1(packet),
    packet,
  });
}

export function buildOpenRouterIssueGroundedShadowPlannerRequestV1(
  apiKey: string,
  packet: ShadowAiEconomicResolutionPacketV1,
): OpenRouterClaudePreflightRequestV2 {
  if (!apiKey) throw new Error("openrouter_issue_grounded_planner_api_key_required");
  const privacy = inspectShadowAiEconomicResolutionPacketPrivacyV1(packet);
  if (!privacy.valid) throw new Error(`openrouter_issue_grounded_planner_privacy_invalid:${privacy.reasonCodes.join(",")}`);
  const userPayload = buildIssueGroundedPlannerUserPayloadV1(packet);
  if (/\.pdf\b|(?:^|["'\s])\/(?:Users|home|private|tmp)\//i.test(userPayload)) {
    throw new Error("openrouter_issue_grounded_planner_source_identity_present");
  }
  const localSchema = localFullPlannerOutputSchemaV1(packet);
  const providerSchema = translateSchemaForAnthropicStructuredOutputsV2(localSchema);
  for (const keyword of ["minLength", "maxLength", "maxItems"]) {
    if (countSchemaKeywordV2(providerSchema, keyword) !== 0) {
      throw new Error(`openrouter_issue_grounded_planner_provider_schema_unsupported_keyword:${keyword}`);
    }
  }
  const body = canonicalJson({
    model: OPENROUTER_CLAUDE_PREFLIGHT_MODEL_V2,
    store: false,
    stream: false,
    temperature: 0,
    max_tokens: 4_000,
    messages: [
      { role: "system", content: issueGroundedPlannerSystemPromptV1() },
      { role: "user", content: userPayload },
    ],
    provider: { allow_fallbacks: false, require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: ISSUE_GROUNDED_SHADOW_PLANNER_SCHEMA_NAME_V1,
        strict: true,
        schema: providerSchema,
      },
    },
  });
  return Object.freeze({
    endpoint: APPROVED_OPENROUTER_ENDPOINT,
    method: "POST" as const,
    headers: Object.freeze({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled",
    }),
    body,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    providerSchema,
  });
}

export async function invokeOpenRouterIssueGroundedShadowPlannerV1(input: {
  apiKey: string;
  packet: ShadowAiEconomicResolutionPacketV1;
  signal: AbortSignal;
  fetchImplementation?: typeof fetch;
}): Promise<Readonly<{
  rawOutput: unknown;
  telemetry: OpenRouterPreflightTelemetryV2;
  requestBodyBytes: number;
}>> {
  const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1(input.apiKey, input.packet);
  const result = await sendOpenRouterClaudeJsonSchemaEvaluationRequestV2({
    request,
    signal: input.signal,
    fetchImplementation: input.fetchImplementation,
  });
  return Object.freeze({ rawOutput: result.rawOutput, telemetry: result.telemetry, requestBodyBytes: request.bodyBytes });
}
