import { canonicalEconomicsV2GoldObservation, type CanonicalEconomicsV2GoldObservation } from "./goldObservation.js";
import { decimalRate } from "../money.js";
import { canonicalDecimal } from "./pricingMath.js";
import type { CanonicalEconomicsV2PricingAnalysis, CanonicalPricingAxisConclusion } from "./pricingTypes.js";

export function canonicalPricingV2GoldObservation(
  analysis: CanonicalEconomicsV2PricingAnalysis,
  options: { caseId?: string } = {},
): CanonicalEconomicsV2GoldObservation {
  const observation = canonicalEconomicsV2GoldObservation(analysis.foundation, options);
  if (analysis.foundation.identity.provenanceStatus === "observational") {
    observation.sourceStatus = "requires_human_review";
  }
  const pricing = analysis.pricingArchitecture;
  if (analysis.validation.status !== "valid") {
    observation.states["pricing.underlying_cost_billing_mode"] = "unknown";
    observation.states["pricing.merchant_price_schedule_shape"] = "unknown";
    observation.states["pricing.scope_uniformity"] = "unresolved";
    observation.states["pricing.formula_coverage_status"] = "unresolved";
    observation.states["pricing.derived_human_summary"] = "unknown_limited_analysis";
    observation.limitations = unique([...observation.limitations, "Invalid RC pricing analyses cannot project canonical Gold pricing facts."]);
    return observation;
  }
  addAxis(observation, "pricing.underlying_cost_billing_mode", pricing.underlyingCostBillingMode, "unknown");
  addAxis(observation, "pricing.merchant_price_schedule_shape", pricing.merchantPriceScheduleShape, "unknown");
  addAxis(observation, "pricing.scope_uniformity", pricing.scopeUniformity, "unresolved");
  observation.states["pricing.formula_coverage_status"] = pricing.formulaCoverageStatus;
  observation.states["pricing.derived_human_summary"] = pricing.derivedHumanSummary.code;
  observation.states["pricing.population_modes"] = "preserved";

  const active = pricing.pricingPopulations.filter((population) => population.activityStatus === "active_settled");
  const activePopulationIds = new Set(active.map((population) => population.id));
  observation.values["pricing.active_population_count"] = active.length;
  observation.values["pricing.active_discount_scope_count"] = active.filter((population) =>
    population.pricingComponentRefs.some((ref) => {
      const component = pricing.observedPricingComponents.find((item) => item.id === ref);
      return component?.applicability === "active" && (component.componentKind === "percentage" || component.componentKind === "basis_points");
    }),
  ).length;

  const activePercentage = pricing.observedPricingComponents.filter((component) =>
    component.applicability === "active" && activePopulationIds.has(component.populationRef) &&
    (component.componentKind === "percentage" || component.componentKind === "basis_points") &&
    component.rate !== null,
  );
  if (pricing.merchantPriceScheduleShape.value === "uniform_flat_percentage" && activePercentage.length > 0) {
    observation.values["pricing.flat_rate_decimal"] = Number(activePercentage[0]!.rate);
  }
  const bases = unique(activePercentage.map((component) => component.basisPopulationKind).filter((value): value is string => value !== null));
  if (bases.length === 1) observation.values["pricing.percentage_pricing_base"] = bases[0];

  observation.states["pricing.current_period_model"] = active.length === 0 ? "unknown" : "observed_from_active_populations";
  if (pricing.pricingPopulations.some((population) => population.activityStatus === "inactive_informational" &&
      population.pricingComponentRefs.some((ref) => {
        const component = pricing.observedPricingComponents.find((item) => item.id === ref);
        return component?.presenceStatus === "explicitly_zero" &&
          (component.componentKind === "percentage" || component.componentKind === "basis_points");
      }))) {
    observation.states["pricing.zero_volume_rate_row_state"] = "inactive_informational";
  }

  addGenericComponentSurface(observation, analysis);

  const amexMapping = pricing.structuralMappings.find((mapping) =>
    mapping.mappingKind === "acceptance_program" && mapping.dimensionKind.toLowerCase() === "brand" && mapping.dimensionValue.toLowerCase() === "amex",
  );
  if (amexMapping) observation.states["pricing.amex_structural_mapping"] = amexMapping.state;
  observation.limitations = unique([...observation.limitations, ...pricing.limitations]);
  return observation;
}

function addGenericComponentSurface(
  observation: CanonicalEconomicsV2GoldObservation,
  analysis: CanonicalEconomicsV2PricingAnalysis,
): void {
  const pricing = analysis.pricingArchitecture;
  const populations = new Map(pricing.pricingPopulations.map((population) => [population.id, population]));
  const activeComponents = pricing.observedPricingComponents.filter((component) =>
    component.applicability === "active" && populations.get(component.populationRef)?.activityStatus === "active_settled");
  const ratesByScope: Record<string, number> = {};
  const totalsByScope: Record<string, number> = {};
  const presenceByScope: Record<string, string> = {};
  const tierComponents: typeof activeComponents = [];

  for (const component of pricing.observedPricingComponents) {
    const population = populations.get(component.populationRef);
    const scope = population ? populationScopeKey(population.dimensionValues) : null;
    if (!scope) continue;
    presenceByScope[scope] = component.presenceStatus;
    if (component.applicability === "active" && component.rate !== null) ratesByScope[scope] = Number(component.rate);
    if (component.applicability === "active" && component.observedAmount !== null) totalsByScope[scope] = component.observedAmount.amountMinor / 100;
    if (component.applicability === "active" && population?.activityStatus === "active_settled" &&
        component.formulaRelationship === "mutually_exclusive_tier" && component.rate !== null) {
      tierComponents.push(component);
      observation.values[`pricing.active_tiers.${scope}`] = Number(component.rate);
    }
  }
  if (Object.keys(ratesByScope).length > 0) observation.values["pricing.component_rates_by_scope"] = ratesByScope;
  if (Object.keys(totalsByScope).length > 0) observation.values["pricing.component_totals_by_scope"] = totalsByScope;
  if (Object.keys(presenceByScope).length > 0) observation.values["pricing.component_presence_by_scope"] = presenceByScope;

  const separateBps = pricing.observedPricingComponents.find((component) => component.componentKind === "basis_points" &&
    (component.basisPopulationKind === "gross_sales_before_refunds" || component.basisPopulationKind === "gross_sale_volume"));
  if (separateBps) observation.states["pricing.separate_bps_sales_discount"] = separateBps.presenceStatus;

  if (tierComponents.length > 0) {
    const tierMinor = tierComponents.reduce((sum, component) => sum + (component.observedAmount?.amountMinor ?? 0), 0);
    observation.values["pricing.active_tier_total"] = tierMinor / 100;
    const fees = analysis.foundation.financialPopulations.totalStatementProcessingFees.value;
    if (fees && fees.amountMinor > 0) {
      const share = decimalRate({ amountMinor: tierMinor, currency: "USD" }, fees, 6);
      if (share !== null) observation.values["pricing.active_tier_fee_share"] = Number(share);
    }
  }

  const activeRateValues = unique(activeComponents
    .filter((component) => component.componentKind === "percentage" || component.componentKind === "basis_points")
    .map((component) => component.rate === null ? null : canonicalDecimal(component.rate)).filter((rate): rate is string => rate !== null));
  if (activeRateValues.length === 1) {
    observation.values["pricing.discount_component_decimal"] = Number(activeRateValues[0]);
    const totalMinor = activeComponents
      .filter((component) => component.rate !== null)
      .reduce((sum, component) => sum + (component.observedAmount?.amountMinor ?? 0), 0);
    if (totalMinor !== 0) observation.values["pricing.discount_component_total"] = totalMinor / 100;
  }
  if (activeComponents.some((component) => component.formulaRelationship === "unresolved" || component.componentKind === "custom")) {
    observation.states["pricing.additional_components"] = "separate_scope_specific_and_partly_unresolved";
  }
}

function populationScopeKey(dimensions: Array<{ kind: string; value: string }>): string | null {
  const safeKinds = new Set(["brand", "brand_group", "product_class", "debit_credit", "qualification", "channel", "regulated_status"]);
  const safe = dimensions.filter((dimension) => safeKinds.has(dimension.kind));
  if (safe.length === 0) return null;
  const qualification = safe.filter((dimension) => dimension.kind === "qualification");
  const other = safe.filter((dimension) => dimension.kind !== "qualification");
  const values = [...other, ...qualification].map((dimension) => slug(dimension.value)).filter(Boolean);
  return values.length > 0 ? values.join("_") : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function addAxis<T extends string>(
  observation: CanonicalEconomicsV2GoldObservation,
  key: string,
  axis: CanonicalPricingAxisConclusion<T>,
  unavailableState: string,
): void {
  if (axis.status !== "available" || axis.value === null) {
    observation.states[key] = unavailableState;
    return;
  }
  if (axis.value === "unknown" || axis.value === "unresolved") observation.states[key] = axis.value;
  else observation.values[key] = axis.value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
