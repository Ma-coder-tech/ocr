import { createHash } from "node:crypto";

import { canonicalJson } from "./v2/canonicalJson.js";
import type {
  ShadowAiPlannerProviderRequestV1,
  ShadowAiProviderKindV1,
} from "./shadowAiPlannerProviderNeutralV1.js";

export const OPENAI_RESPONSES_ENDPOINT_V1 = "https://api.openai.com/v1/responses" as const;
export const OPENROUTER_CHAT_COMPLETIONS_ENDPOINT_V1 = "https://openrouter.ai/api/v1/chat/completions" as const;

export type ShadowAiPlannerHttpRequestV1 = Readonly<{
  providerKind: ShadowAiProviderKindV1;
  endpoint: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: string;
  bodyBytes: number;
  schemaSha256: string;
}>;

/**
 * Direct OpenAI Responses API compiler. It accepts the provider-neutral draft
 * contract without adding provider authority, binding values, or fallback.
 */
export function compileOpenAiDirectPlannerHttpRequestV1(input: Readonly<{
  apiKey: string;
  model: string;
  request: ShadowAiPlannerProviderRequestV1;
}>): ShadowAiPlannerHttpRequestV1 {
  requireConfiguration(input.apiKey, input.model, "openai");
  assertPortableDraftSchema(input.request.outputSchema);
  const body = canonicalJson({
    model: input.model,
    store: false,
    instructions: input.request.systemInstruction,
    input: [{ role: "user", content: input.request.userPayload }],
    text: {
      format: {
        type: "json_schema",
        name: input.request.schemaName,
        strict: true,
        schema: input.request.outputSchema,
      },
    },
  });
  return Object.freeze({
    providerKind: "OPENAI_DIRECT" as const,
    endpoint: OPENAI_RESPONSES_ENDPOINT_V1,
    method: "POST" as const,
    headers: Object.freeze({ Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" }),
    body,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    schemaSha256: sha256(canonicalJson(input.request.outputSchema)),
  });
}

/**
 * OpenRouter compiler. Provider fallback is deliberately disabled so a model
 * or provider change cannot silently alter a financial-analysis evaluation.
 */
export function compileOpenRouterPlannerHttpRequestV1(input: Readonly<{
  apiKey: string;
  model: string;
  request: ShadowAiPlannerProviderRequestV1;
}>): ShadowAiPlannerHttpRequestV1 {
  requireConfiguration(input.apiKey, input.model, "openrouter");
  assertPortableDraftSchema(input.request.outputSchema);
  const body = canonicalJson({
    model: input.model,
    store: false,
    stream: false,
    messages: [
      { role: "system", content: input.request.systemInstruction },
      { role: "user", content: input.request.userPayload },
    ],
    provider: { allow_fallbacks: false, require_parameters: true },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: input.request.schemaName,
        strict: true,
        schema: input.request.outputSchema,
      },
    },
  });
  return Object.freeze({
    providerKind: "OPENROUTER" as const,
    endpoint: OPENROUTER_CHAT_COMPLETIONS_ENDPOINT_V1,
    method: "POST" as const,
    headers: Object.freeze({
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    }),
    body,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    schemaSha256: sha256(canonicalJson(input.request.outputSchema)),
  });
}

export function inspectPortableDraftSchemaV1(schema: unknown): Readonly<{
  valid: boolean;
  forbiddenKeywordPaths: readonly string[];
  propertyCount: number;
  patternCount: number;
  constCount: number;
  requestSpecificEnumCount: number;
}> {
  const forbiddenKeywordPaths: string[] = [];
  let propertyCount = 0;
  let patternCount = 0;
  let constCount = 0;
  let requestSpecificEnumCount = 0;
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (["pattern", "const", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"].includes(key)) {
        forbiddenKeywordPaths.push(childPath);
      }
      if (key === "pattern") patternCount += 1;
      if (key === "const") constCount += 1;
      if (key === "properties" && isRecord(child)) propertyCount += Object.keys(child).length;
      if (key === "enum" && Array.isArray(child) && child.some((item) => typeof item === "string" && /^(?:rr_|shadow-issue-|[a-f0-9]{64}$)/i.test(item))) {
        requestSpecificEnumCount += 1;
      }
      walk(child, childPath);
    }
  };
  walk(schema, "$schema");
  return Object.freeze({
    valid: forbiddenKeywordPaths.length === 0 && requestSpecificEnumCount === 0,
    forbiddenKeywordPaths: Object.freeze(forbiddenKeywordPaths.sort()),
    propertyCount,
    patternCount,
    constCount,
    requestSpecificEnumCount,
  });
}

function assertPortableDraftSchema(schema: unknown): void {
  const inspection = inspectPortableDraftSchemaV1(schema);
  if (!inspection.valid) {
    throw new Error(`shadow_planner_provider_schema_not_portable:${inspection.forbiddenKeywordPaths.join(",")}`);
  }
}

function requireConfiguration(apiKey: string, model: string, provider: string): void {
  if (!apiKey) throw new Error(`shadow_planner_${provider}_api_key_required`);
  if (!model.trim()) throw new Error(`shadow_planner_${provider}_model_required`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
