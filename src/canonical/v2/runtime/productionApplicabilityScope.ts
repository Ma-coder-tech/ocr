import type { KnowledgeQueryScope } from "../knowledge/knowledgeTypes.js";

export const CANONICAL_PRODUCTION_APPLICABILITY_SCOPE_VERSION =
  "canonical_production_applicability_scope_us_v1" as const;
export const CANONICAL_PRODUCTION_COUNTRY_CODE = "us" as const;

export type CanonicalProductionApplicabilityScope = KnowledgeQueryScope & {
  region: typeof CANONICAL_PRODUCTION_COUNTRY_CODE;
  jurisdiction: typeof CANONICAL_PRODUCTION_COUNTRY_CODE;
};

export function bindCanonicalProductionApplicabilityScope(
  scope: KnowledgeQueryScope,
): CanonicalProductionApplicabilityScope {
  return {
    ...scope,
    region: CANONICAL_PRODUCTION_COUNTRY_CODE,
    jurisdiction: CANONICAL_PRODUCTION_COUNTRY_CODE,
  };
}

export function assertCanonicalProductionApplicabilityScope(
  scope: KnowledgeQueryScope,
): asserts scope is CanonicalProductionApplicabilityScope {
  if (scope.region !== CANONICAL_PRODUCTION_COUNTRY_CODE
    || scope.jurisdiction !== CANONICAL_PRODUCTION_COUNTRY_CODE) {
    throw new Error("canonical_production_us_applicability_scope_unbound");
  }
}
