import type {
  CanonicalCounterfactualResultState,
  CanonicalEconomicDriverStatus,
  CanonicalEconomicsV2SynthesisAnalysis,
  CanonicalMerchantLeverState,
  CanonicalSynthesisComparisonReport,
  CanonicalSynthesisPrivacySafeDiagnostics,
  CanonicalSynthesisSemanticAmendmentId,
} from "./synthesisTypes.js";
import { RE_SEMANTIC_AMENDMENT_IDS } from "./synthesisVersionManifest.js";

const DRIVER_STATES = ["supported", "unresolved", "unavailable"] as const satisfies readonly CanonicalEconomicDriverStatus[];
const COUNTERFACTUAL_STATES = [
  "exact_deterministic_delta", "bounded_conditional_delta", "verification_only", "unavailable_not_derivable",
] as const satisfies readonly CanonicalCounterfactualResultState[];
const LEVER_STATES = [
  "eligible_supported", "candidate_requires_verification", "documentation_or_monitoring_only", "not_available", "unresolved",
] as const satisfies readonly CanonicalMerchantLeverState[];

export function canonicalSynthesisPrivacySafeDiagnostics(
  analysis: CanonicalEconomicsV2SynthesisAnalysis,
  comparison: CanonicalSynthesisComparisonReport | null = null,
): CanonicalSynthesisPrivacySafeDiagnostics {
  const layer = analysis.synthesisLayer;
  return {
    schemaVersion: analysis.versionManifest.schemaVersion,
    validationStatus: analysis.validation.status,
    driverCounts: Object.fromEntries(DRIVER_STATES.map((state) => [state, layer.drivers.filter((item) => item.status === state).length])) as Record<CanonicalEconomicDriverStatus, number>,
    overlapRefusalCount: layer.attributionRelationships.filter((item) =>
      ["overlaps_with", "shared_population", "unresolved"].includes(item.relationshipType) && !item.additiveAggregationAllowed,
    ).length,
    counterfactualCounts: Object.fromEntries(COUNTERFACTUAL_STATES.map((state) => [state, layer.counterfactuals.filter((item) => item.resultState === state).length])) as Record<CanonicalCounterfactualResultState, number>,
    leverCounts: Object.fromEntries(LEVER_STATES.map((state) => [state, layer.merchantLevers.filter((item) => item.state === state).length])) as Record<CanonicalMerchantLeverState, number>,
    dependencyCount: layer.dependencies.length,
    unresolvedDependencyCount: layer.dependencies.filter((item) => item.status !== "satisfied_by_admitted_evidence").length,
    signalCount: layer.operationalSignals.length,
    themeCount: layer.themes.length,
    amendmentCounts: Object.fromEntries(RE_SEMANTIC_AMENDMENT_IDS.map((id) => [
      id,
      layer.semanticAmendments.filter((item) => item.id === id).length,
    ])) as Record<CanonicalSynthesisSemanticAmendmentId, number>,
    comparisonCounts: comparison?.counts ?? null,
    hasUnexpectedDivergence: comparison?.hasUnexpectedDivergence ?? false,
  };
}
