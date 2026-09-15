import {
  providerAliasForInternalReferenceV1,
  type ShadowAiProviderReferenceClassV1,
  type ShadowAiProviderReferenceMapV1,
} from "../canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import type { ShadowAiEconomicResolutionPlanV1 } from "../canonical/shadowAiEconomicResolutionPlannerTypesV1.js";

/**
 * Offline evaluation helper. It projects a locally trusted plan into the provider-facing
 * alias vocabulary so tests can prove the inbound reverse boundary without a provider call.
 */
export function projectShadowAiPlanToProviderAliasesOfflineV1(
  plan: ShadowAiEconomicResolutionPlanV1,
  referenceMap: ShadowAiProviderReferenceMapV1,
): ShadowAiEconomicResolutionPlanV1 {
  const output = JSON.parse(JSON.stringify(plan)) as Record<string, any>;
  output.inputHash = referenceMap.providerInputHash;
  const alias = (value: string, allowedClasses: readonly ShadowAiProviderReferenceClassV1[]): string => {
    for (const referenceClass of allowedClasses) {
      const resolved = providerAliasForInternalReferenceV1(referenceMap, referenceClass, value);
      if (resolved) return resolved;
    }
    throw new Error("shadow_planner_offline_projection_reference_missing");
  };
  const projectList = (owner: Record<string, any>, key: string, allowedClasses: readonly ShadowAiProviderReferenceClassV1[]): void => {
    if (!Array.isArray(owner[key])) throw new Error("shadow_planner_offline_projection_list_missing");
    owner[key] = owner[key].map((value: unknown) => {
      if (typeof value !== "string") throw new Error("shadow_planner_offline_projection_reference_invalid");
      return alias(value, allowedClasses);
    });
  };

  projectList(output, "exactCitedFactRefs", ["FACT"]);
  for (const hypothesis of [output.primaryHypothesis, ...output.alternativeHypotheses]) {
    projectList(hypothesis, "supportingFactRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
    projectList(hypothesis, "contradictingFactRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
  }
  for (const suspicion of output.reconstructionSuspicions) {
    projectList(suspicion, "exactAcceptedFactOrOccurrenceRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
    projectList(suspicion, "conflictingEvidenceRefs", ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]);
  }
  return deepFreeze(output) as ShadowAiEconomicResolutionPlanV1;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
