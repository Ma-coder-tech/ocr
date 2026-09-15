import { createHash } from "node:crypto";

import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import type { OpenRouterClaudePreflightRequestV2 } from "./openRouterClaudeStructuredOutputPreflightV2.js";

export const PLANNER_PROVIDER_COMPATIBILITY_DIAGNOSTIC_SCHEMA_VERSION_V1 =
  "planner_provider_compatibility_diagnostic_2026_09_15_v1" as const;

export type PlannerProviderCompatibilityDiagnosticV1 = Readonly<{
  schemaVersion: typeof PLANNER_PROVIDER_COMPATIBILITY_DIAGNOSTIC_SCHEMA_VERSION_V1;
  requestBodyBytes: number;
  requestBodySha256: string;
  providerSchemaBytes: number;
  providerSchemaSha256: string;
  schemaDepth: number;
  schemaNodeCount: number;
  schemaArrayValueCount: number;
  schemaScalarValueCount: number;
  propertyDefinitionCount: number;
  requiredFieldLiteralCount: number;
  maximumRequiredCardinality: number;
  enumNodeCount: number;
  maximumEnumCardinality: number;
  totalEnumLiteralCount: number;
  totalEnumLiteralBytes: number;
  constCount: number;
  arraySchemaNodeCount: number;
  minimumItemsConstraintCount: number;
  maximumItemsConstraintCount: number;
  anyOfCount: number;
  oneOfCount: number;
  allOfCount: number;
  patternCount: number;
  minimumLengthConstraintCount: number;
  maximumLengthConstraintCount: number;
}>;

/**
 * Produces content-free compatibility telemetry. The request body is hashed and
 * measured but never parsed into, or copied into, the diagnostic result.
 */
export function inspectPlannerProviderCompatibilityV1(
  request: OpenRouterClaudePreflightRequestV2,
): PlannerProviderCompatibilityDiagnosticV1 {
  const accumulator: MutableMetrics = {
    schemaDepth: 0,
    schemaNodeCount: 0,
    schemaArrayValueCount: 0,
    schemaScalarValueCount: 0,
    propertyDefinitionCount: 0,
    requiredFieldLiteralCount: 0,
    maximumRequiredCardinality: 0,
    enumNodeCount: 0,
    maximumEnumCardinality: 0,
    totalEnumLiteralCount: 0,
    totalEnumLiteralBytes: 0,
    constCount: 0,
    arraySchemaNodeCount: 0,
    minimumItemsConstraintCount: 0,
    maximumItemsConstraintCount: 0,
    anyOfCount: 0,
    oneOfCount: 0,
    allOfCount: 0,
    patternCount: 0,
    minimumLengthConstraintCount: 0,
    maximumLengthConstraintCount: 0,
  };
  visit(request.providerSchema, 0, accumulator);
  const providerSchemaJson = canonicalJson(request.providerSchema);
  return deepFreeze({
    schemaVersion: PLANNER_PROVIDER_COMPATIBILITY_DIAGNOSTIC_SCHEMA_VERSION_V1,
    requestBodyBytes: Buffer.byteLength(request.body, "utf8"),
    requestBodySha256: sha256(request.body),
    providerSchemaBytes: Buffer.byteLength(providerSchemaJson, "utf8"),
    providerSchemaSha256: sha256(providerSchemaJson),
    ...accumulator,
  });
}

type MutableMetrics = {
  -readonly [Key in keyof Omit<PlannerProviderCompatibilityDiagnosticV1,
    "schemaVersion" | "requestBodyBytes" | "requestBodySha256" | "providerSchemaBytes" | "providerSchemaSha256">]:
      PlannerProviderCompatibilityDiagnosticV1[Key];
};

function visit(value: unknown, depth: number, metrics: MutableMetrics): void {
  metrics.schemaDepth = Math.max(metrics.schemaDepth, depth);
  if (Array.isArray(value)) {
    metrics.schemaArrayValueCount += 1;
    for (const item of value) visit(item, depth + 1, metrics);
    return;
  }
  if (!isRecord(value)) {
    metrics.schemaScalarValueCount += 1;
    return;
  }

  metrics.schemaNodeCount += 1;
  if (value.type === "array") metrics.arraySchemaNodeCount += 1;
  if (Object.hasOwn(value, "const")) metrics.constCount += 1;
  if (Object.hasOwn(value, "minItems")) metrics.minimumItemsConstraintCount += 1;
  if (Object.hasOwn(value, "maxItems")) metrics.maximumItemsConstraintCount += 1;
  if (Object.hasOwn(value, "minLength")) metrics.minimumLengthConstraintCount += 1;
  if (Object.hasOwn(value, "maxLength")) metrics.maximumLengthConstraintCount += 1;
  if (Object.hasOwn(value, "pattern")) metrics.patternCount += 1;
  if (Array.isArray(value.anyOf)) metrics.anyOfCount += 1;
  if (Array.isArray(value.oneOf)) metrics.oneOfCount += 1;
  if (Array.isArray(value.allOf)) metrics.allOfCount += 1;

  const properties = isRecord(value.properties) ? value.properties : null;
  if (properties) metrics.propertyDefinitionCount += Object.keys(properties).length;
  if (Array.isArray(value.required)) {
    metrics.requiredFieldLiteralCount += value.required.length;
    metrics.maximumRequiredCardinality = Math.max(metrics.maximumRequiredCardinality, value.required.length);
  }
  if (Array.isArray(value.enum)) {
    metrics.enumNodeCount += 1;
    metrics.maximumEnumCardinality = Math.max(metrics.maximumEnumCardinality, value.enum.length);
    metrics.totalEnumLiteralCount += value.enum.length;
    metrics.totalEnumLiteralBytes += value.enum.reduce(
      (total, literal) => total + Buffer.byteLength(canonicalJson(literal), "utf8"),
      0,
    );
  }

  for (const child of Object.values(value)) visit(child, depth + 1, metrics);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
