import type { DecimalString, MoneyAmount } from "../types.js";
import type { CanonicalEconomicsV2Foundation } from "./types.js";
import type {
  CanonicalEconomicsV2PricingAnalysis,
  CanonicalPricingActivityStatus,
  CanonicalPricingAdmissionProfile,
  CanonicalPricingAssertionBasis,
  CanonicalPricingComponent,
  CanonicalPricingComponentBasisType,
  CanonicalPricingComponentKind,
  CanonicalPricingComponentPresenceStatus,
  CanonicalPricingConfidence,
  CanonicalPricingDerivedHumanSummary,
  CanonicalPricingDerivabilityTier,
  CanonicalPricingDimension,
  CanonicalPricingFormulaCoverageStatus,
  CanonicalPricingFormulaRelationship,
  CanonicalPricingMerchantPriceScheduleShape,
  CanonicalPricingPopulation,
  CanonicalPricingScopeModel,
  CanonicalPricingScopeUniformity,
  CanonicalPricingStructuralMapping,
  CanonicalPricingUnderlyingCostBillingMode,
} from "./pricingTypes.js";
import { CANONICAL_ECONOMICS_V2_PRICING_VERSION_MANIFEST, RC_SEMANTIC_AMENDMENT_REASONS } from "./pricingVersionManifest.js";
import { canonicalDecimal } from "./pricingMath.js";
import { deriveCanonicalPricingHumanSummaryCode } from "./pricingSemantics.js";
import { validateCanonicalEconomicsV2PricingAnalysis } from "./pricingValidate.js";

export type CanonicalPricingPopulationAdmission = {
  key: string;
  activityStatus: CanonicalPricingActivityStatus;
  scopeRole?: "standard" | "dominant" | "explicit_exception";
  scopeRoleEvidenceRefs?: string[];
  dimensionValues?: CanonicalPricingDimension[];
  sourcePopulationRefs?: string[];
  sourceOccurrenceRefs?: string[];
  underlyingCostOccurrenceRefs?: string[];
  observedVolume?: MoneyAmount | null;
  observedVolumeFactRef?: string | null;
  observedCount?: number | null;
  observedCountFactRef?: string | null;
  underlyingCostBillingMode?: Exclude<CanonicalPricingUnderlyingCostBillingMode, "mixed_by_scope">;
  underlyingCostDerivabilityTier?: CanonicalPricingDerivabilityTier;
  confidence?: CanonicalPricingConfidence;
  evidenceRefs?: string[];
  limitations?: string[];
};

export type CanonicalPricingComponentAdmission = {
  key: string;
  populationKey: string;
  presenceStatus: CanonicalPricingComponentPresenceStatus;
  componentKind: CanonicalPricingComponentKind;
  basisType: CanonicalPricingComponentBasisType;
  basisPopulationKind?: string | null;
  basisFactRef?: string | null;
  appliedBaseAmount?: MoneyAmount | null;
  appliedCount?: number | null;
  rate?: DecimalString | null;
  printedRate?: DecimalString | null;
  printedRateUnit?: "decimal" | "percent" | "basis_points" | null;
  perItemAmount?: MoneyAmount | null;
  fixedAmount?: MoneyAmount | null;
  minimumAmount?: MoneyAmount | null;
  observedAmount?: MoneyAmount | null;
  applicability?: "active" | "inactive_informational" | "unknown";
  formulaRelationship: CanonicalPricingFormulaRelationship;
  derivabilityTier: CanonicalPricingDerivabilityTier;
  confidence?: CanonicalPricingConfidence;
  assertionBasis?: CanonicalPricingAssertionBasis;
  evidenceRefs?: string[];
  occurrenceRefs?: string[];
  limitations?: string[];
};

export type CanonicalPricingScopeModelAdmission = {
  populationKey: string;
  componentKeys: string[];
  relatedPopulationKeys?: string[];
  formulaRelationship: CanonicalPricingFormulaRelationship;
  formulaCoverageStatus: CanonicalPricingFormulaCoverageStatus;
  evidenceRefs?: string[];
  limitations?: string[];
};

export type CanonicalPricingStructuralMappingAdmission = {
  mappingKind: "acceptance_program" | "custom";
  dimensionKind: string;
  dimensionValue: string;
  state: "admitted" | "requires_admitted_mapping" | "unresolved";
  derivabilityTier: CanonicalPricingDerivabilityTier;
  evidenceRefs?: string[];
  limitations?: string[];
};

export type BuildCanonicalEconomicsV2PricingInput = {
  foundation: CanonicalEconomicsV2Foundation;
  admissionProfile: CanonicalPricingAdmissionProfile;
  populations?: CanonicalPricingPopulationAdmission[];
  components?: CanonicalPricingComponentAdmission[];
  scopeModels?: CanonicalPricingScopeModelAdmission[];
  structuralMappings?: CanonicalPricingStructuralMappingAdmission[];
  contractConfirmationRequired?: boolean;
  limitations?: string[];
};

export function buildCanonicalEconomicsV2PricingAnalysis(
  input: BuildCanonicalEconomicsV2PricingInput,
): CanonicalEconomicsV2PricingAnalysis {
  const populationAdmissions = input.populations ?? [];
  const componentAdmissions = input.components ?? [];
  const populationIdByKey = new Map(populationAdmissions.map((item, index) => [item.key, `pricing_population_${pad(index + 1)}`]));
  const componentIdByKey = new Map(componentAdmissions.map((item, index) => [item.key, `pricing_component_${pad(index + 1)}`]));
  const rawComponents = componentAdmissions.map((item) => componentFromAdmission(item, populationIdByKey, componentIdByKey, input.admissionProfile));
  const populations = populationAdmissions.map((item) => populationFromAdmission(item, populationIdByKey, rawComponents));
  const tierEvidenceProven = qualificationTierEvidence(populations, rawComponents);
  const components = rawComponents.map((component): CanonicalPricingComponent =>
    component.formulaRelationship === "mutually_exclusive_tier" && !tierEvidenceProven
      ? {
          ...component,
          formulaRelationship: "unresolved",
          derivabilityTier: "unresolved",
          limitations: unique([
            ...component.limitations,
            "A mutually exclusive tier relationship requires admitted qualification dimensions and differing rates in comparable active populations.",
          ]),
        }
      : component,
  );
  const candidateScopeModels = (input.scopeModels ?? []).map((item, index) => scopeModelFromAdmission(
    item,
    index,
    populationIdByKey,
    componentIdByKey,
    populations,
    components,
    input.admissionProfile,
  ));
  const scopeModels = normalizeScopeModels(candidateScopeModels, populations, components, input.admissionProfile);
  const mappings = (input.structuralMappings ?? []).map((item, index): CanonicalPricingStructuralMapping => ({
    id: `pricing_structural_mapping_${pad(index + 1)}`,
    mappingKind: item.mappingKind,
    dimensionKind: item.dimensionKind,
    dimensionValue: item.dimensionValue,
    state: input.admissionProfile.source === "observational" && item.state === "admitted" ? "requires_admitted_mapping" : item.state,
    derivabilityTier: input.admissionProfile.source === "observational" && item.state === "admitted"
      ? "requires_external_rule_or_schedule"
      : item.derivabilityTier,
    evidenceRefs: unique(item.evidenceRefs ?? []),
    limitations: unique([
      ...(item.limitations ?? []),
      ...(input.admissionProfile.source === "observational" && item.state === "admitted"
        ? ["Observational structural information cannot self-promote to an admitted canonical mapping."]
        : []),
    ]),
  }));

  const activePopulations = populations.filter((item) => item.activityStatus === "active_settled");
  const sourceUnavailable = input.foundation.identity.provenanceStatus === "source_unavailable" ||
    input.foundation.identity.provenanceStatus === "corpus_integrity_hold";
  const noActiveProcessing = input.admissionProfile.populationSemanticsProven &&
    input.admissionProfile.noActiveProcessingProven &&
    input.admissionProfile.noActiveProcessingEvidenceRefs.length > 0 &&
    populations.length > 0 &&
    activePopulations.length === 0 &&
    populations.every((population) => population.activityStatus !== "unknown");
  const formulaCoverageStatus = formulaCoverage(activePopulations, scopeModels, components, input.admissionProfile, noActiveProcessing);

  const underlyingValue = underlyingAxis(activePopulations, input.admissionProfile, noActiveProcessing);
  const shapeValue = scheduleShape(activePopulations, scopeModels, components, formulaCoverageStatus, noActiveProcessing);
  const scopeValue = scopeAxis(activePopulations, scopeModels, components, formulaCoverageStatus, noActiveProcessing);
  const axisEvidenceRefs = noActiveProcessing
    ? unique(input.admissionProfile.noActiveProcessingEvidenceRefs)
    : unique(activePopulations.flatMap((item) => item.evidenceRefs));
  const axisOccurrenceRefs = unique(activePopulations.flatMap((item) => item.sourceOccurrenceRefs));
  const unavailableStatus = sourceUnavailable ? "unavailable" as const : "available" as const;

  const underlying = {
    id: "pricing_axis_underlying_cost_billing_mode",
    status: unavailableStatus,
    value: sourceUnavailable ? null : underlyingValue,
    confidence: axisConfidence(input.admissionProfile, underlyingValue === "unknown"),
    derivabilityTier: sourceUnavailable ? "not_derivable_from_this_document_class" as const : axisDerivability(input.admissionProfile, underlyingValue === "unknown"),
    assertionBasis: "rule_application" as const,
    evidenceRefs: sourceUnavailable ? [] : axisEvidenceRefs,
    occurrenceRefs: sourceUnavailable ? [] : axisOccurrenceRefs,
    limitations: unique([
      ...(underlyingValue === "unknown" ? ["Underlying-cost billing mode remains unknown because admitted billing-role evidence is insufficient."] : []),
      ...input.admissionProfile.limitations,
    ]),
  };
  const shape = {
    id: "pricing_axis_merchant_price_schedule_shape",
    status: unavailableStatus,
    value: sourceUnavailable ? null : shapeValue,
    confidence: axisConfidence(input.admissionProfile, shapeValue === "unknown"),
    derivabilityTier: sourceUnavailable ? "not_derivable_from_this_document_class" as const : axisDerivability(input.admissionProfile, shapeValue === "unknown"),
    assertionBasis: "rule_application" as const,
    evidenceRefs: sourceUnavailable ? [] : axisEvidenceRefs,
    occurrenceRefs: sourceUnavailable ? [] : axisOccurrenceRefs,
    limitations: unique([
      ...(shapeValue === "unknown" ? ["Merchant price-schedule shape remains unknown because complete active-population formula evidence is unavailable."] : []),
      ...input.admissionProfile.limitations,
    ]),
  };
  const scope = {
    id: "pricing_axis_scope_uniformity",
    status: unavailableStatus,
    value: sourceUnavailable ? null : scopeValue,
    confidence: axisConfidence(input.admissionProfile, scopeValue === "unresolved"),
    derivabilityTier: sourceUnavailable ? "not_derivable_from_this_document_class" as const : axisDerivability(input.admissionProfile, scopeValue === "unresolved"),
    assertionBasis: "rule_application" as const,
    evidenceRefs: sourceUnavailable ? [] : axisEvidenceRefs,
    occurrenceRefs: sourceUnavailable ? [] : axisOccurrenceRefs,
    limitations: unique([
      ...(scopeValue === "unresolved" ? ["Scope uniformity remains unresolved because comparable active-population formulas are not fully admitted."] : []),
      ...input.admissionProfile.limitations,
    ]),
  };

  const summary = derivedSummary(underlying, shape, scope);
  const evidenceRefs = unique([
    ...input.admissionProfile.evidenceRefs,
    ...populations.flatMap((item) => item.evidenceRefs),
    ...components.flatMap((item) => item.evidenceRefs),
    ...scopeModels.flatMap((item) => item.evidenceRefs),
    ...mappings.flatMap((item) => item.evidenceRefs),
  ]);

  const architecture = {
    foundationSchemaVersion: input.foundation.versionManifest.schemaVersion,
    sourceDocumentRef: input.foundation.identity.sourceDocumentRef,
    admissionProfile: {
      ...input.admissionProfile,
      evidenceRefs: unique(input.admissionProfile.evidenceRefs),
      noActiveProcessingEvidenceRefs: unique(input.admissionProfile.noActiveProcessingEvidenceRefs),
      limitations: unique(input.admissionProfile.limitations),
    },
    pricingPopulations: populations,
    underlyingCostBillingMode: underlying,
    merchantPriceScheduleShape: shape,
    scopeUniformity: scope,
    scopeModels,
    observedPricingComponents: components,
    structuralMappings: mappings,
    formulaCoverageStatus,
    derivedHumanSummary: summary,
    confidence: architectureConfidence(underlying.confidence, shape.confidence, scope.confidence),
    derivabilityTier: architectureDerivability(underlying.derivabilityTier, shape.derivabilityTier, scope.derivabilityTier),
    contractConfirmationRequired: input.contractConfirmationRequired ?? components.some((item) => item.derivabilityTier === "requires_merchant_pricing_document"),
    opacityState: opacityState(formulaCoverageStatus, underlyingValue),
    evidenceRefs,
    limitations: unique([
      ...(input.limitations ?? []),
      ...input.admissionProfile.limitations,
      "RC pricing is shadow-only and cannot establish ownership, control, margin, fairness, savings, or merchant-facing authority.",
    ]),
    assertionBasis: "rule_application" as const,
    semanticAmendments: Object.entries(RC_SEMANTIC_AMENDMENT_REASONS).map(([id, reason]) => ({
      id: id as keyof typeof RC_SEMANTIC_AMENDMENT_REASONS,
      pricingRefs: amendmentRefs(id, populations, components, underlying.id, shape.id, scope.id),
      reason,
    })),
    validation: { status: "valid" as const, errors: [], warnings: [] },
  };

  return validateCanonicalEconomicsV2PricingAnalysis({
    versionManifest: { ...CANONICAL_ECONOMICS_V2_PRICING_VERSION_MANIFEST },
    foundation: input.foundation,
    pricingArchitecture: architecture,
    validation: { status: "valid", errors: [], warnings: [] },
  });
}

function populationFromAdmission(
  item: CanonicalPricingPopulationAdmission,
  populationIdByKey: Map<string, string>,
  components: CanonicalPricingComponent[],
): CanonicalPricingPopulation {
  const id = populationIdByKey.get(item.key) ?? `pricing_population_unresolved_${item.key}`;
  return {
    id,
    activityStatus: item.activityStatus,
    scopeRole: item.scopeRole ?? "standard",
    scopeRoleEvidenceRefs: unique(item.scopeRoleEvidenceRefs ?? []),
    dimensionValues: (item.dimensionValues ?? []).map((dimension) => ({ ...dimension, evidenceRefs: unique(dimension.evidenceRefs) })),
    sourcePopulationRefs: unique(item.sourcePopulationRefs ?? []),
    sourceOccurrenceRefs: unique(item.sourceOccurrenceRefs ?? []),
    underlyingCostOccurrenceRefs: unique(item.underlyingCostOccurrenceRefs ?? []),
    observedVolume: item.observedVolume ?? null,
    observedVolumeFactRef: item.observedVolumeFactRef ?? null,
    observedCount: item.observedCount ?? null,
    observedCountFactRef: item.observedCountFactRef ?? null,
    pricingComponentRefs: components.filter((component) => component.populationRef === id).map((component) => component.id),
    underlyingCostBillingMode: item.underlyingCostBillingMode ?? "unknown",
    underlyingCostDerivabilityTier: item.underlyingCostDerivabilityTier ?? "unresolved",
    confidence: item.confidence ?? "unavailable",
    evidenceRefs: unique(item.evidenceRefs ?? []),
    limitations: unique(item.limitations ?? []),
  };
}

function componentFromAdmission(
  item: CanonicalPricingComponentAdmission,
  populationIdByKey: Map<string, string>,
  componentIdByKey: Map<string, string>,
  profile: CanonicalPricingAdmissionProfile,
): CanonicalPricingComponent {
  const relationshipProven = item.formulaRelationship === "unresolved" ||
    (profile.formulaRelationshipsProven && (item.evidenceRefs?.length ?? 0) > 0);
  return {
    id: componentIdByKey.get(item.key) ?? `missing_component_${item.key}`,
    populationRef: populationIdByKey.get(item.populationKey) ?? `missing_population_${item.populationKey}`,
    presenceStatus: item.presenceStatus,
    componentKind: item.componentKind,
    basisType: item.basisType,
    basisPopulationKind: item.basisPopulationKind ?? null,
    basisFactRef: item.basisFactRef ?? null,
    appliedBaseAmount: item.appliedBaseAmount ?? null,
    appliedCount: item.appliedCount ?? null,
    rate: item.rate ?? null,
    printedRate: item.printedRate ?? (item.printedRateUnit === "decimal" ? item.rate ?? null : null),
    printedRateUnit: item.printedRateUnit ?? null,
    perItemAmount: item.perItemAmount ?? null,
    fixedAmount: item.fixedAmount ?? null,
    minimumAmount: item.minimumAmount ?? null,
    observedAmount: item.observedAmount ?? null,
    applicability: item.applicability ?? "unknown",
    formulaRelationship: relationshipProven ? item.formulaRelationship : "unresolved",
    derivabilityTier: relationshipProven ? item.derivabilityTier : "unresolved",
    confidence: item.confidence ?? "unavailable",
    assertionBasis: item.assertionBasis ?? "source_fact",
    evidenceRefs: unique(item.evidenceRefs ?? []),
    occurrenceRefs: unique(item.occurrenceRefs ?? []),
    limitations: unique([
      ...(item.limitations ?? []),
      ...(!relationshipProven ? ["The pricing formula relationship was not admitted and remains unresolved."] : []),
    ]),
  };
}

function scopeModelFromAdmission(
  item: CanonicalPricingScopeModelAdmission,
  index: number,
  populationIdByKey: Map<string, string>,
  componentIdByKey: Map<string, string>,
  populations: CanonicalPricingPopulation[],
  components: CanonicalPricingComponent[],
  profile: CanonicalPricingAdmissionProfile,
): CanonicalPricingScopeModel {
  const populationRef = populationIdByKey.get(item.populationKey) ?? `missing_population_${item.populationKey}`;
  const componentRefs = item.componentKeys.map((key) => componentIdByKey.get(key) ?? `missing_component_${key}`);
  const relatedPopulationRefs = unique((item.relatedPopulationKeys ?? []).map((key) => populationIdByKey.get(key) ?? `missing_population_${key}`));
  const population = populations.find((candidate) => candidate.id === populationRef);
  const relatedComponents = components.filter((component) => componentRefs.includes(component.id));
  const relationshipEvidenceRefs = unique(item.evidenceRefs ?? relatedComponents.flatMap((component) => component.evidenceRefs));
  const relationshipAdmitted = item.formulaRelationship === "unresolved" ||
    (profile.formulaRelationshipsProven && relationshipEvidenceRefs.length > 0);
  const tierProven = item.formulaRelationship !== "mutually_exclusive_tier" || qualificationTierEvidence(populations, components);
  const relationshipProven = relationshipAdmitted && tierProven;
  const inactive = population?.activityStatus !== "active_settled";
  return {
    id: `pricing_scope_model_${pad(index + 1)}`,
    populationRef,
    componentRefs,
    relatedPopulationRefs,
    formulaRelationship: relationshipProven ? item.formulaRelationship : "unresolved",
    formulaCoverageStatus: inactive && item.formulaCoverageStatus === "complete_for_admitted_active_populations"
      ? "partial_observed_components"
      : relationshipProven ? item.formulaCoverageStatus : "unresolved",
    evidenceRefs: relationshipEvidenceRefs,
    limitations: unique([
      ...(item.limitations ?? []),
      ...(!relationshipProven ? [item.formulaRelationship === "mutually_exclusive_tier"
        ? "QUAL/MQUAL/NQUAL terminology or rate differences alone do not prove a mutually exclusive qualification tier."
        : "The scope formula relationship was not admitted and remains unresolved."] : []),
    ]),
  };
}

function underlyingAxis(
  active: CanonicalPricingPopulation[],
  profile: CanonicalPricingAdmissionProfile,
  noActive: boolean,
): CanonicalPricingUnderlyingCostBillingMode {
  if (noActive) return "no_active_processing";
  if (active.length === 0 || !profile.populationSemanticsProven || !profile.underlyingCostRolesProven) return "unknown";
  const modes = new Set(active.map((item) => item.underlyingCostBillingMode));
  if (modes.has("unknown")) return "unknown";
  if (modes.size > 1) return "mixed_by_scope";
  return active[0]!.underlyingCostBillingMode;
}

function formulaCoverage(
  active: CanonicalPricingPopulation[],
  models: CanonicalPricingScopeModel[],
  components: CanonicalPricingComponent[],
  profile: CanonicalPricingAdmissionProfile,
  noActive: boolean,
): CanonicalPricingFormulaCoverageStatus {
  if (noActive) return "not_applicable_no_active_processing";
  if (active.length === 0) return "unresolved";
  const complete = profile.pricingCoverageProven && profile.formulaRelationshipsProven && active.every((population) => {
    const populationModels = models.filter((model) => model.populationRef === population.id);
    return populationModels.length === 1 &&
      populationModels[0]!.formulaCoverageStatus === "complete_for_admitted_active_populations" &&
      completeModelStructure(populationModels[0]!, population, components);
  });
  if (complete) return "complete_for_admitted_active_populations";
  if (components.some((component) => component.presenceStatus === "observed_nonzero" || component.presenceStatus === "explicitly_zero")) {
    return "partial_observed_components";
  }
  return "unresolved";
}

function scheduleShape(
  active: CanonicalPricingPopulation[],
  models: CanonicalPricingScopeModel[],
  components: CanonicalPricingComponent[],
  coverage: CanonicalPricingFormulaCoverageStatus,
  noActive: boolean,
): CanonicalPricingMerchantPriceScheduleShape {
  if (noActive) return "no_active_processing";
  if (active.length === 0 || coverage !== "complete_for_admitted_active_populations") return "unknown";
  const activeModels = models.filter((model) => active.some((population) => population.id === model.populationRef));
  const activeComponents = components.filter((component) =>
    component.applicability === "active" && active.some((population) => population.id === component.populationRef),
  );
  if (activeModels.some((model) => model.formulaRelationship === "mutually_exclusive_tier") && qualificationTierEvidence(active, activeComponents)) {
    return "qualification_tier_ladder";
  }
  const kinds = new Set(activeComponents.map((component) => component.componentKind));
  const percentageOnly = [...kinds].every((kind) => kind === "percentage" || kind === "basis_points") && kinds.size > 0;
  if (percentageOnly && activeComponents.length === active.length) {
    const rates = new Set(activeComponents.map((component) => component.rate === null ? null : canonicalDecimal(component.rate)).filter((rate): rate is string => rate !== null));
    return rates.size <= 1 ? "uniform_flat_percentage" : "scope_specific_flat_percentage";
  }
  if (hasCoherentRatePlusItem(activeModels, components)) return "rate_plus_per_item";
  if (kinds.has("fixed") && [...kinds].some((kind) => kind === "percentage" || kind === "basis_points" || kind === "per_item") && kinds.size === 2) {
    return "fixed_plus_variable";
  }
  if (kinds.has("minimum") && kinds.size === 1 && activeComponents.every(hasActualBilledStructure)) return "minimum_based";
  if (kinds.has("subscription") &&
      [...kinds].every((kind) => kind === "subscription") &&
      activeComponents.every((component) => component.formulaRelationship === "included_in_subscription" && hasActualBilledStructure(component))) {
    return "subscription_membership";
  }
  if (kinds.has("custom") && kinds.size === 1) return "custom_or_other";
  if (kinds.size > 1 || activeComponents.length > active.length) return "composite_multi_component";
  return "unknown";
}

function scopeAxis(
  active: CanonicalPricingPopulation[],
  models: CanonicalPricingScopeModel[],
  components: CanonicalPricingComponent[],
  coverage: CanonicalPricingFormulaCoverageStatus,
  noActive: boolean,
): CanonicalPricingScopeUniformity {
  if (noActive) return "no_active_processing";
  if (active.length === 0 || coverage !== "complete_for_admitted_active_populations") return "unresolved";
  const signatures = active.map((population) => formulaSignature(population, models, components));
  if (new Set(signatures).size === 1) return "uniform";
  const dominant = active.filter((population) => population.scopeRole === "dominant");
  const exceptions = active.filter((population) => population.scopeRole === "explicit_exception");
  const standard = active.filter((population) => population.scopeRole === "standard");
  if (dominant.length > 0 && exceptions.length > 0) {
    const primarySignatures = [...dominant, ...standard].map((population) => formulaSignature(population, models, components));
    if (new Set(primarySignatures).size === 1) return "uniform_with_explicit_exceptions";
  }
  return "scope_specific";
}

function formulaSignature(
  population: CanonicalPricingPopulation,
  models: CanonicalPricingScopeModel[],
  components: CanonicalPricingComponent[],
): string {
  const model = models.find((candidate) => candidate.populationRef === population.id);
  if (!model) return "unresolved";
  return model.componentRefs
    .map((ref) => components.find((component) => component.id === ref))
    .filter((component): component is CanonicalPricingComponent => Boolean(component))
    .map((component) => [
      component.componentKind,
      component.basisType,
      component.basisPopulationKind ?? "",
      component.rate === null ? "" : canonicalDecimal(component.rate) ?? component.rate,
      component.perItemAmount?.amountMinor ?? "",
      component.fixedAmount?.amountMinor ?? "",
      component.minimumAmount?.amountMinor ?? "",
      component.formulaRelationship,
    ].join(":"))
    .sort()
    .join("|");
}

function qualificationTierEvidence(
  populations: CanonicalPricingPopulation[],
  components: CanonicalPricingComponent[],
): boolean {
  const qualificationPopulations = populations.filter((population) =>
    population.activityStatus === "active_settled" && population.dimensionValues.some((dimension) => dimension.kind === "qualification"),
  );
  if (qualificationPopulations.length < 2) return false;
  const comparableGroups = new Map<string, CanonicalPricingPopulation[]>();
  for (const population of qualificationPopulations) {
    const comparableDimensions = population.dimensionValues
      .filter((dimension) => dimension.kind !== "qualification")
      .map((dimension) => `${dimension.kind}:${dimension.value}`)
      .sort()
      .join("|");
    comparableGroups.set(comparableDimensions, [...(comparableGroups.get(comparableDimensions) ?? []), population]);
  }
  for (const group of comparableGroups.values()) {
    const qualifications = new Set(group.flatMap((population) =>
      population.dimensionValues.filter((dimension) => dimension.kind === "qualification").map((dimension) => dimension.value),
    ));
    const rates = group.flatMap((population) =>
      components.filter((component) => component.populationRef === population.id && component.rate !== null)
        .map((component) => canonicalDecimal(component.rate!) ?? component.rate!),
    );
    if (group.length >= 2 && qualifications.size >= 2 && new Set(rates).size >= 2) return true;
  }
  return false;
}

function derivedSummary(
  underlying: CanonicalEconomicsV2PricingAnalysis["pricingArchitecture"]["underlyingCostBillingMode"],
  shape: CanonicalEconomicsV2PricingAnalysis["pricingArchitecture"]["merchantPriceScheduleShape"],
  scope: CanonicalEconomicsV2PricingAnalysis["pricingArchitecture"]["scopeUniformity"],
): CanonicalPricingDerivedHumanSummary {
  const code = deriveCanonicalPricingHumanSummaryCode(underlying, shape, scope);
  return {
    canonical: false,
    code,
    inputAxisRefs: [underlying.id, shape.id, scope.id],
    derivabilityTier: "deterministically_derivable_from_statement",
    independentEvidenceRefs: [],
    limitations: ["This code is a noncanonical deterministic projection and cannot override, repair, or evidence a canonical pricing axis."],
  };
}

function normalizeScopeModels(
  models: CanonicalPricingScopeModel[],
  populations: CanonicalPricingPopulation[],
  components: CanonicalPricingComponent[],
  profile: CanonicalPricingAdmissionProfile,
): CanonicalPricingScopeModel[] {
  const counts = new Map<string, number>();
  for (const model of models) counts.set(model.populationRef, (counts.get(model.populationRef) ?? 0) + 1);
  return models.map((model) => {
    if (model.formulaCoverageStatus !== "complete_for_admitted_active_populations") return model;
    const population = populations.find((item) => item.id === model.populationRef);
    const valid = Boolean(population) && counts.get(model.populationRef) === 1 &&
      profile.pricingCoverageProven && profile.formulaRelationshipsProven &&
      completeModelStructure(model, population!, components);
    if (valid) return model;
    const hasObserved = model.componentRefs.some((ref) => {
      const component = components.find((item) => item.id === ref);
      return component?.presenceStatus === "observed_nonzero" || component?.presenceStatus === "explicitly_zero";
    });
    return {
      ...model,
      formulaCoverageStatus: hasObserved ? "partial_observed_components" : "unresolved",
      limitations: unique([...model.limitations, "Complete formula coverage was refused because the active population model was not uniquely and fully evidenced."]),
    };
  });
}

function completeModelStructure(
  model: CanonicalPricingScopeModel,
  population: CanonicalPricingPopulation,
  components: CanonicalPricingComponent[],
): boolean {
  if (population.activityStatus !== "active_settled" || population.evidenceRefs.length === 0 ||
      population.sourcePopulationRefs.length + population.sourceOccurrenceRefs.length === 0 ||
      model.componentRefs.length === 0 || model.evidenceRefs.length === 0 || model.formulaRelationship === "unresolved") return false;
  const related = model.componentRefs.map((ref) => components.find((component) => component.id === ref));
  return related.every((component) => component !== undefined && component.populationRef === population.id &&
    component.applicability === "active" && component.componentKind !== "unknown" &&
    component.presenceStatus !== "not_observable" && component.presenceStatus !== "absent_from_complete_source" &&
    component.formulaRelationship !== "unresolved" && component.evidenceRefs.length > 0 && componentHasRequiredStructure(component));
}

function componentHasRequiredStructure(component: CanonicalPricingComponent): boolean {
  if (component.componentKind === "percentage" || component.componentKind === "basis_points") {
    return component.rate !== null && component.basisType === "volume" && component.basisFactRef !== null;
  }
  if (component.componentKind === "per_item") return component.perItemAmount !== null && component.appliedCount !== null;
  if (component.componentKind === "fixed") return component.fixedAmount !== null;
  if (component.componentKind === "minimum") return component.minimumAmount !== null && hasActualBilledStructure(component);
  if (component.componentKind === "subscription") return component.fixedAmount !== null && hasActualBilledStructure(component);
  return component.observedAmount !== null || component.componentKind === "custom";
}

function hasActualBilledStructure(component: CanonicalPricingComponent): boolean {
  return component.presenceStatus === "observed_nonzero" && (component.observedAmount?.amountMinor ?? 0) > 0;
}

function hasCoherentRatePlusItem(models: CanonicalPricingScopeModel[], components: CanonicalPricingComponent[]): boolean {
  const kindsFor = (populationRefs: Set<string>) => new Set(components
    .filter((component) => component.applicability === "active" && populationRefs.has(component.populationRef))
    .map((component) => component.componentKind));
  for (const model of models) {
    const samePopulationKinds = kindsFor(new Set([model.populationRef]));
    if ((samePopulationKinds.has("percentage") || samePopulationKinds.has("basis_points")) && samePopulationKinds.has("per_item")) return true;
    if (model.relatedPopulationRefs.length > 0) {
      const relatedKinds = kindsFor(new Set([model.populationRef, ...model.relatedPopulationRefs]));
      if ((relatedKinds.has("percentage") || relatedKinds.has("basis_points")) && relatedKinds.has("per_item")) return true;
    }
  }
  return false;
}

function axisConfidence(profile: CanonicalPricingAdmissionProfile, unresolved: boolean): CanonicalPricingConfidence {
  if (unresolved || profile.source === "observational") return "unavailable";
  return "unavailable";
}

function axisDerivability(profile: CanonicalPricingAdmissionProfile, unresolved: boolean): CanonicalPricingDerivabilityTier {
  if (unresolved || profile.source === "observational") return "unresolved";
  return profile.source === "approved_synthetic" ? "deterministically_derivable_from_statement" : "inferable_from_statement_with_qualification";
}

function architectureConfidence(...values: CanonicalPricingConfidence[]): CanonicalPricingConfidence {
  if (values.includes("unavailable")) return "unavailable";
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function architectureDerivability(...values: CanonicalPricingDerivabilityTier[]): CanonicalPricingDerivabilityTier {
  if (values.includes("unresolved")) return "unresolved";
  if (values.includes("not_derivable_from_this_document_class")) return "not_derivable_from_this_document_class";
  if (values.every((value) => value === "deterministically_derivable_from_statement")) return "deterministically_derivable_from_statement";
  return "inferable_from_statement_with_qualification";
}

function opacityState(
  coverage: CanonicalPricingFormulaCoverageStatus,
  underlying: CanonicalPricingUnderlyingCostBillingMode,
): "transparent" | "partially_transparent" | "structurally_opaque" | "unknown" {
  if (coverage === "complete_for_admitted_active_populations" && underlying === "separately_billed_pass_through") return "transparent";
  if (coverage === "complete_for_admitted_active_populations" && underlying === "bundled_into_merchant_price") return "structurally_opaque";
  if (coverage === "partial_observed_components") return "partially_transparent";
  return "unknown";
}

function amendmentRefs(
  id: string,
  populations: CanonicalPricingPopulation[],
  components: CanonicalPricingComponent[],
  underlyingRef: string,
  shapeRef: string,
  scopeRef: string,
): string[] {
  if (id.includes("001")) return [underlyingRef, shapeRef, scopeRef];
  if (id.includes("002")) return populations.map((population) => population.id);
  if (id.includes("003")) return populations.filter((population) => population.activityStatus !== "active_settled").map((population) => population.id);
  if (id.includes("004")) return components.map((component) => component.id);
  return [underlyingRef, shapeRef, scopeRef];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function pad(value: number): string {
  return String(value).padStart(3, "0");
}
