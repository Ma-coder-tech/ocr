import type { MoneyAmount } from "../types.js";
import type {
  CanonicalDriverAttributionMethod,
  CanonicalEconomicDriverType,
  CanonicalDriverPopulationPredicateCode,
  CanonicalEconomicsV2SynthesisAnalysis,
  CanonicalMerchantLeverState,
  CanonicalSynthesisComparisonItem,
  CanonicalSynthesisComparisonReport,
  CanonicalSynthesisSemanticAmendmentId,
} from "./synthesisTypes.js";

export type LegacySynthesisDriverObservation = {
  id: string;
  driverType: CanonicalEconomicDriverType;
  populationRefs: string[] | null;
  observedCost: MoneyAmount | null;
  attributionMethod: CanonicalDriverAttributionMethod | null;
  populationPredicateCode?: CanonicalDriverPopulationPredicateCode | null;
  relevantCostPoolRef?: string | null;
  positiveEvidenceProven?: boolean;
  treatedAsOpportunity: boolean;
  summedDespiteOverlap: boolean;
};

export type LegacySynthesisCounterfactualObservation = {
  id: string;
  resultAmount: MoneyAmount | null;
  targetProvenanceProven: boolean;
  populationCompatibilityProven: boolean;
  cadenceProven: boolean;
  annualized: boolean;
  observedPopulationRefs?: string[] | null;
  alternativePopulationRefs?: string[] | null;
  targetProvenanceId?: string | null;
  formulaCode?: string | null;
  baselinePeriod?: string | null;
  impactPeriod?: string | null;
};

export type LegacySynthesisLeverObservation = {
  id: string;
  state: CanonicalMerchantLeverState;
  controlProven: boolean;
  impact: MoneyAmount | null;
};

export type LegacySynthesisObservation = {
  drivers: LegacySynthesisDriverObservation[];
  counterfactuals: LegacySynthesisCounterfactualObservation[];
  levers: LegacySynthesisLeverObservation[];
  collapsesSpecialEconomicFlows: boolean;
  appliesFutureNoticeToCurrentPeriod: boolean;
  promotesSignalToCausalityOrRiskWithoutProof: boolean;
  themeSemanticCoverageCodes: string[] | null;
  duplicateThemeQuestionCount: number;
  emitsMerchantFacingThemeProse: boolean;
  riskDenominatorCompatibility?: string | null;
  themeActionabilityByQuestion?: Record<string, string>;
};

export function compareLegacyAndCanonicalSynthesisV2(
  legacy: LegacySynthesisObservation,
  analysis: CanonicalEconomicsV2SynthesisAnalysis,
): CanonicalSynthesisComparisonReport {
  const items: CanonicalSynthesisComparisonItem[] = [];
  const layer = analysis.synthesisLayer;

  for (const observed of legacy.drivers) {
    const canonical = layer.drivers.find((item) => item.id === observed.id);
    if (!canonical || canonical.status !== "supported") {
      items.push(observed.positiveEvidenceProven === true
        ? item(`driver:${observed.id}:identity`, "unexpected_divergence", null, "v2_refuses_legacy_driver_despite_positive_evidence")
        : item(`driver:${observed.id}:identity`, "v2_unavailable_or_ambiguous", null, "driver_population_or_evidence_unavailable"));
      continue;
    }
    items.push(observed.populationRefs === null
      ? item(`driver:${observed.id}:population`, "v2_unavailable_or_ambiguous", null, "legacy_driver_population_unavailable")
      : sameSet(observed.populationRefs, canonical.populationRefs)
        ? item(`driver:${observed.id}:population`, "same_semantic_fact", null, "same_driver_population")
        : observed.positiveEvidenceProven === true
          ? item(`driver:${observed.id}:population`, "unexpected_divergence", null, "proven_driver_population_disagrees")
          : item(`driver:${observed.id}:population`, "v2_unavailable_or_ambiguous", null, "legacy_population_basis_unavailable"));
    items.push(observed.observedCost === null || canonical.observedCost === null
      ? item(`driver:${observed.id}:cost`, "v2_unavailable_or_ambiguous", null, "driver_cost_unavailable")
      : sameMoney(observed.observedCost, canonical.observedCost)
        ? item(`driver:${observed.id}:cost`, "same_semantic_fact", null, "same_driver_cost")
        : item(`driver:${observed.id}:cost`, "unexpected_divergence", null, "driver_cost_disagrees"));
    items.push(observed.attributionMethod === canonical.attributionMethod
      ? item(`driver:${observed.id}:attribution`, "same_semantic_fact", null, "same_attribution_method")
      : observed.summedDespiteOverlap
        ? item(`driver:${observed.id}:attribution`, "approved_semantic_amendment", "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION", "legacy_overlap_sum_refused")
        : item(`driver:${observed.id}:attribution`, "unexpected_divergence", null, "driver_attribution_disagrees"));
    if (observed.treatedAsOpportunity) {
      items.push(item(`driver:${observed.id}:opportunity`, "approved_semantic_amendment", "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY", "legacy_driver_opportunity_shortcut_refused"));
    } else {
      items.push(item(`driver:${observed.id}:opportunity`, "same_semantic_fact", null, "driver_not_promoted_to_opportunity"));
    }
    if (observed.populationPredicateCode !== undefined) items.push(observed.populationPredicateCode === canonical.populationPredicateCode
      ? item(`driver:${observed.id}:predicate`, "same_semantic_fact", null, "same_driver_predicate")
      : item(`driver:${observed.id}:predicate`, "unexpected_divergence", null, "driver_predicate_disagrees"));
    if (observed.relevantCostPoolRef !== undefined) items.push(observed.relevantCostPoolRef === canonical.relevantCostPoolRef
      ? item(`driver:${observed.id}:cost_pool`, "same_semantic_fact", null, "same_driver_cost_pool")
      : item(`driver:${observed.id}:cost_pool`, "unexpected_divergence", null, "driver_cost_pool_disagrees"));
  }

  for (const observed of legacy.counterfactuals) {
    const canonical = layer.counterfactuals.find((item) => item.id === observed.id);
    if (!canonical) {
      items.push(item(`counterfactual:${observed.id}`, "v2_unavailable_or_ambiguous", null, "canonical_counterfactual_unavailable"));
      continue;
    }
    const unsafeLegacy = !observed.targetProvenanceProven || !observed.populationCompatibilityProven || (observed.annualized && !observed.cadenceProven);
    if (unsafeLegacy && observed.resultAmount) {
      items.push(item(`counterfactual:${observed.id}`, "approved_semantic_amendment", "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL", "legacy_unsupported_counterfactual_refused"));
      continue;
    }
    const canonicalAmount = canonical.exactDelta;
    items.push(observed.resultAmount === null || canonicalAmount === null
      ? item(`counterfactual:${observed.id}`, "v2_unavailable_or_ambiguous", null, "counterfactual_result_unavailable")
      : sameMoney(observed.resultAmount, canonicalAmount)
        ? item(`counterfactual:${observed.id}`, "same_semantic_fact", null, "same_counterfactual_delta")
        : item(`counterfactual:${observed.id}`, "unexpected_divergence", null, "counterfactual_delta_disagrees"));
    const semanticChecks: Array<[string, unknown, unknown]> = [
      ["observed_population", observed.observedPopulationRefs, canonical.observedPopulationRefs],
      ["alternative_population", observed.alternativePopulationRefs, canonical.alternativePopulationRefs],
      ["target_provenance", observed.targetProvenanceId, canonical.alternativeProvenanceId],
      ["formula", observed.formulaCode, canonical.formulaCode],
      ["baseline_period", observed.baselinePeriod, canonical.baselinePeriod],
      ["impact_period", observed.impactPeriod, canonical.impactPeriod],
    ];
    for (const [name, legacyValue, canonicalValue] of semanticChecks) {
      if (legacyValue === undefined) continue;
      const same = Array.isArray(legacyValue) && Array.isArray(canonicalValue) ? sameSet(legacyValue, canonicalValue) : legacyValue === canonicalValue;
      items.push(same ? item(`counterfactual:${observed.id}:${name}`, "same_semantic_fact", null, `same_counterfactual_${name}`)
        : item(`counterfactual:${observed.id}:${name}`, "unexpected_divergence", null, `counterfactual_${name}_disagrees`));
    }
    if (observed.annualized !== canonical.annualized || (observed.annualized && observed.cadenceProven !== canonical.recurrenceProven)) {
      items.push(item(`counterfactual:${observed.id}:cadence`, "unexpected_divergence", null, "counterfactual_cadence_disagrees"));
    }
  }

  for (const observed of legacy.levers) {
    const canonical = layer.merchantLevers.find((item) => item.id === observed.id);
    if (!canonical) {
      items.push(item(`lever:${observed.id}`, "v2_unavailable_or_ambiguous", null, "canonical_lever_unavailable"));
      continue;
    }
    if (observed.state === "eligible_supported" && !observed.controlProven) {
      items.push(item(`lever:${observed.id}:eligibility`, "approved_semantic_amendment", "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER", "legacy_uncontrolled_lever_refused"));
    } else if (observed.state === canonical.state) {
      items.push(item(`lever:${observed.id}:eligibility`, "same_semantic_fact", null, "same_lever_eligibility"));
    } else {
      items.push(item(`lever:${observed.id}:eligibility`, "unexpected_divergence", null, "lever_eligibility_disagrees"));
    }
  }

  items.push(legacy.collapsesSpecialEconomicFlows
    ? item("special_economic_flows", "approved_semantic_amendment", "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS", "legacy_special_flows_decomposed")
    : item("special_economic_flows", "same_semantic_fact", null, "special_flows_remain_separate"));
  items.push(legacy.appliesFutureNoticeToCurrentPeriod
    ? item("notice_effective_period", "approved_semantic_amendment", "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION", "legacy_future_notice_isolated")
    : item("notice_effective_period", "same_semantic_fact", null, "future_notice_not_current"));
  items.push(legacy.promotesSignalToCausalityOrRiskWithoutProof
    ? item("signal_risk_causality", "approved_semantic_amendment", "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY", "legacy_signal_causality_shortcut_refused")
    : item("signal_risk_causality", "same_semantic_fact", null, "signal_causality_remains_separate"));

  const canonicalCoverage = unique(layer.themes.flatMap((theme) => theme.semanticCoverageCodes));
  if (legacy.themeSemanticCoverageCodes === null) {
    items.push(item("theme_semantic_coverage", "v2_unavailable_or_ambiguous", null, "legacy_theme_coverage_unavailable"));
  } else if (sameSet(legacy.themeSemanticCoverageCodes, canonicalCoverage) && legacy.duplicateThemeQuestionCount === 0 && !legacy.emitsMerchantFacingThemeProse) {
    items.push(item("theme_semantic_coverage", "same_semantic_fact", null, "same_deduplicated_theme_coverage"));
  } else if (legacy.duplicateThemeQuestionCount > 0 || legacy.emitsMerchantFacingThemeProse) {
    items.push(item("theme_semantic_coverage", "approved_semantic_amendment", "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS", "legacy_duplicate_or_prose_themes_restructured"));
  } else {
    items.push(item("theme_semantic_coverage", "unexpected_divergence", null, "semantic_theme_coverage_disagrees"));
  }
  if (legacy.riskDenominatorCompatibility !== undefined) {
    items.push(legacy.riskDenominatorCompatibility === layer.accountRisk.denominatorCompatibility
      ? item("risk_denominator_compatibility", "same_semantic_fact", null, "same_risk_denominator_compatibility")
      : item("risk_denominator_compatibility", "unexpected_divergence", null, "risk_denominator_compatibility_disagrees"));
  }
  for (const [question, actionability] of Object.entries(legacy.themeActionabilityByQuestion ?? {})) {
    const theme = layer.themes.find((item) => item.economicQuestionCode === question);
    items.push(theme?.actionabilityState === actionability
      ? item(`theme:${question}:actionability`, "same_semantic_fact", null, "same_theme_actionability")
      : item(`theme:${question}:actionability`, "unexpected_divergence", null, "theme_actionability_disagrees"));
  }

  const counts = {
    same_semantic_fact: items.filter((entry) => entry.classification === "same_semantic_fact").length,
    approved_semantic_amendment: items.filter((entry) => entry.classification === "approved_semantic_amendment").length,
    v2_unavailable_or_ambiguous: items.filter((entry) => entry.classification === "v2_unavailable_or_ambiguous").length,
    unexpected_divergence: items.filter((entry) => entry.classification === "unexpected_divergence").length,
  };
  return {
    policyVersion: "canonical_legacy_v2_synthesis_shadow_comparison_v1",
    items,
    counts,
    hasUnexpectedDivergence: counts.unexpected_divergence > 0,
  };
}

function item(
  fact: string,
  classification: CanonicalSynthesisComparisonItem["classification"],
  amendmentId: CanonicalSynthesisSemanticAmendmentId | null,
  reasonCode: string,
): CanonicalSynthesisComparisonItem {
  return { fact, classification, amendmentId, reasonCode };
}

function sameMoney(left: MoneyAmount, right: MoneyAmount): boolean {
  return left.currency === right.currency && left.amountMinor === right.amountMinor;
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(unique(left)) === JSON.stringify(unique(right));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
