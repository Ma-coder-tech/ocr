import type { DecimalString, MoneyAmount } from "../types.js";
import { sameMoney } from "./facts.js";
import { sameDecimal } from "./pricingMath.js";
import type {
  CanonicalEconomicsV2PricingAnalysis,
  CanonicalPricingComparisonItem,
  CanonicalPricingComparisonReport,
  CanonicalPricingSemanticAmendmentId,
  CanonicalPricingComponent,
} from "./pricingTypes.js";

export type LegacyPricingComparisonSnapshot = {
  legacyModel: string | null;
  populationScope?: "account_wide" | "population_scoped" | null;
  inactiveRowsContributeToActiveModel?: boolean | null;
  componentsEvidenceBound?: boolean | null;
  derivedSummaryCanonical?: boolean | null;
  components?: Array<{
    occurrenceRef: string;
    populationRef?: string | null;
    componentKind?: CanonicalPricingComponent["componentKind"] | null;
    basisType?: CanonicalPricingComponent["basisType"] | null;
    basisPopulationKind?: string | null;
    basisFactRef?: string | null;
    rate?: DecimalString | null;
    printedRate?: DecimalString | null;
    printedRateUnit?: CanonicalPricingComponent["printedRateUnit"];
    observedAmount?: MoneyAmount | null;
    appliedBaseAmount?: MoneyAmount | null;
    appliedCount?: number | null;
    perItemAmount?: MoneyAmount | null;
    fixedAmount?: MoneyAmount | null;
    minimumAmount?: MoneyAmount | null;
    applicability?: CanonicalPricingComponent["applicability"] | null;
    formulaRelationship?: CanonicalPricingComponent["formulaRelationship"] | null;
  }>;
};

export function compareLegacyPricingToCanonicalV2(
  legacy: LegacyPricingComparisonSnapshot,
  analysis: CanonicalEconomicsV2PricingAnalysis,
): CanonicalPricingComparisonReport {
  const pricing = analysis.pricingArchitecture;
  const items: CanonicalPricingComparisonItem[] = [];
  if (analysis.validation.status !== "valid") {
    items.push(item("pricing_validation", "unexpected_divergence", null, "v2_pricing_validation_failed"));
  }
  const axesUnavailable = pricing.underlyingCostBillingMode.status !== "available" ||
    pricing.merchantPriceScheduleShape.status !== "available" ||
    pricing.scopeUniformity.status !== "available" ||
    pricing.underlyingCostBillingMode.value === "unknown" ||
    pricing.merchantPriceScheduleShape.value === "unknown" ||
    pricing.scopeUniformity.value === "unresolved";
  if (axesUnavailable) {
    items.push(item("legacy_pricing_label_to_independent_axes", "v2_unavailable_or_ambiguous", null, "v2_pricing_axes_not_proven"));
  } else if ((legacy.legacyModel ?? "unknown") === "unknown" &&
      pricing.underlyingCostBillingMode.value === "no_active_processing") {
    items.push(item("current_period_pricing_observability", "same_semantic_fact", null, "legacy_unknown_and_v2_no_active_are_compatible"));
  } else {
    items.push(amendment(
      "legacy_pricing_label_to_independent_axes",
      "RC-AMEND-001-INDEPENDENT-PRICING-AXES",
      "legacy_label_is_noncanonical_and_v2_axes_are_independent",
    ));
  }
  if (legacy.populationScope === "account_wide" && pricing.pricingPopulations.length > 1) {
    items.push(amendment(
      "population_scoped_pricing",
      "RC-AMEND-002-POPULATION-SCOPED-PRICING",
      "v2_preserves_source_supported_pricing_populations",
    ));
  }
  if (legacy.inactiveRowsContributeToActiveModel === true && pricing.pricingPopulations.some((population) => population.activityStatus === "inactive_informational")) {
    items.push(amendment(
      "inactive_pricing_evidence",
      "RC-AMEND-003-ACTIVITY-GATED-PRICING",
      "v2_excludes_inactive_rows_from_active_axes",
    ));
  }
  if (legacy.componentsEvidenceBound === false && pricing.observedPricingComponents.length > 0) {
    items.push(amendment(
      "evidence_bound_pricing_components",
      "RC-AMEND-004-EVIDENCE-BOUND-COMPONENTS",
      "v2_components_bind_population_basis_formula_and_evidence",
    ));
  }
  if (legacy.derivedSummaryCanonical === true) {
    items.push(amendment(
      "derived_human_pricing_summary",
      "RC-AMEND-005-NONCANONICAL-PRICING-SUMMARY",
      "v2_human_summary_is_noncanonical_projection",
    ));
  }

  for (const legacyComponent of legacy.components ?? []) {
    const candidates = pricing.observedPricingComponents.filter((component) => component.occurrenceRefs.includes(legacyComponent.occurrenceRef));
    if (candidates.length === 0) {
      items.push(item(`component:${legacyComponent.occurrenceRef}`, "v2_unavailable_or_ambiguous", null, "v2_component_occurrence_not_admitted"));
      continue;
    }
    if (!legacyComponentIsComplete(legacyComponent)) {
      items.push(item(`component:${legacyComponent.occurrenceRef}`, "v2_unavailable_or_ambiguous", null, "legacy_component_semantics_incomplete"));
      continue;
    }
    const match = candidates.some((component) => componentSemanticsMatch(component, legacyComponent));
    items.push(match
      ? item(`component:${legacyComponent.occurrenceRef}`, "same_semantic_fact", null, "legacy_v2_component_math_equal")
      : item(`component:${legacyComponent.occurrenceRef}`, "unexpected_divergence", null, "legacy_v2_component_math_mismatch"));
  }

  const counts: CanonicalPricingComparisonReport["counts"] = {
    same_semantic_fact: 0,
    approved_semantic_amendment: 0,
    v2_unavailable_or_ambiguous: 0,
    unexpected_divergence: 0,
  };
  for (const comparison of items) counts[comparison.classification] += 1;
  return {
    policyVersion: "canonical_legacy_v2_pricing_shadow_comparison_v1",
    sourceDocumentRef: pricing.sourceDocumentRef,
    items,
    counts,
    hasUnexpectedDivergence: counts.unexpected_divergence > 0,
  };
}

export function assertNoUnexpectedCanonicalPricingV2Divergence(report: CanonicalPricingComparisonReport): void {
  if (!report.hasUnexpectedDivergence) return;
  const facts = report.items.filter((item) => item.classification === "unexpected_divergence").map((item) => item.fact);
  throw new Error(`Unexpected Canonical V1/V2 pricing divergence requires product-owner review: ${facts.join(", ")}`);
}

function amendment(fact: string, amendmentId: CanonicalPricingSemanticAmendmentId, reasonCode: string): CanonicalPricingComparisonItem {
  return item(fact, "approved_semantic_amendment", amendmentId, reasonCode);
}

function item(
  fact: string,
  classification: CanonicalPricingComparisonItem["classification"],
  amendmentId: CanonicalPricingSemanticAmendmentId | null,
  reasonCode: string,
): CanonicalPricingComparisonItem {
  return { fact, classification, amendmentId, reasonCode };
}

type LegacyComponent = NonNullable<LegacyPricingComparisonSnapshot["components"]>[number];

function legacyComponentIsComplete(component: LegacyComponent): boolean {
  return component.populationRef !== undefined && component.componentKind !== undefined && component.basisType !== undefined &&
    component.basisPopulationKind !== undefined && component.basisFactRef !== undefined && component.rate !== undefined &&
    component.printedRate !== undefined && component.printedRateUnit !== undefined && component.observedAmount !== undefined &&
    component.appliedBaseAmount !== undefined && component.appliedCount !== undefined && component.perItemAmount !== undefined &&
    component.fixedAmount !== undefined && component.minimumAmount !== undefined && component.applicability !== undefined &&
    component.formulaRelationship !== undefined;
}

function componentSemanticsMatch(component: CanonicalPricingComponent, legacy: LegacyComponent): boolean {
  return component.populationRef === legacy.populationRef && component.componentKind === legacy.componentKind &&
    component.basisType === legacy.basisType && component.basisPopulationKind === legacy.basisPopulationKind &&
    component.basisFactRef === legacy.basisFactRef && sameDecimal(component.rate, legacy.rate ?? null) &&
    sameDecimal(component.printedRate, legacy.printedRate ?? null) && component.printedRateUnit === legacy.printedRateUnit &&
    sameMoney(component.observedAmount, legacy.observedAmount ?? null) && sameMoney(component.appliedBaseAmount, legacy.appliedBaseAmount ?? null) &&
    component.appliedCount === (legacy.appliedCount ?? null) && sameMoney(component.perItemAmount, legacy.perItemAmount ?? null) &&
    sameMoney(component.fixedAmount, legacy.fixedAmount ?? null) && sameMoney(component.minimumAmount, legacy.minimumAmount ?? null) &&
    component.applicability === legacy.applicability && component.formulaRelationship === legacy.formulaRelationship;
}
