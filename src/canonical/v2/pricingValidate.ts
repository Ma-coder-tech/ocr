import type { MoneyAmount } from "../types.js";
import type { CanonicalEconomicsV2Foundation } from "./types.js";
import { canonicalDecimal, multiplyMinorByDecimalRate, normalizePrintedPricingRate, sameDecimal } from "./pricingMath.js";
import { deriveCanonicalPricingHumanSummaryCode } from "./pricingSemantics.js";
import type {
  CanonicalEconomicsV2PricingAnalysis,
  CanonicalPricingComponent,
  CanonicalPricingPopulation,
} from "./pricingTypes.js";
import { RC_SEMANTIC_AMENDMENT_IDS } from "./pricingVersionManifest.js";

export class CanonicalEconomicsV2PricingValidationError extends Error {
  readonly errors: string[];
  readonly analysis: CanonicalEconomicsV2PricingAnalysis;

  constructor(analysis: CanonicalEconomicsV2PricingAnalysis) {
    super(`Canonical Economics V2 pricing validation failed: ${analysis.validation.errors.join(" ")}`);
    this.name = "CanonicalEconomicsV2PricingValidationError";
    this.errors = analysis.validation.errors;
    this.analysis = analysis;
  }
}

export function validateCanonicalEconomicsV2PricingAnalysis(
  analysis: CanonicalEconomicsV2PricingAnalysis,
): CanonicalEconomicsV2PricingAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifest = analysis.versionManifest;
  const pricing = analysis.pricingArchitecture;
  const foundation = analysis.foundation;

  if (manifest.schemaVersion !== "canonical_economics_v2_pricing_architecture_v1") errors.push("Unsupported RC pricing schema version.");
  if (manifest.authority !== "shadow_non_authoritative") errors.push("RC pricing must remain shadow and non-authoritative.");
  if (manifest.persistence !== "none") errors.push("RC pricing must not introduce persistence.");
  if (manifest.customerExposure !== "none") errors.push("RC pricing must not become customer-visible.");
  if (manifest.aiResearchAuthority !== "prohibited") errors.push("AI/research authority over RC pricing must be prohibited.");
  if (manifest.reportAuthority !== "prohibited") errors.push("Report authority over RC pricing must be prohibited.");
  if (foundation.validation.status !== "valid") errors.push("RC pricing requires a valid RB foundation.");
  if (pricing.foundationSchemaVersion !== foundation.versionManifest.schemaVersion) errors.push("RC pricing references the wrong RB foundation schema.");
  if (pricing.sourceDocumentRef !== foundation.identity.sourceDocumentRef) errors.push("RC pricing source identity diverges from the RB foundation.");

  const evidenceIds = new Set(foundation.sourceModel.evidence.map((item) => item.id));
  const occurrenceIds = new Set(foundation.sourceModel.occurrences.map((item) => item.id));
  const occurrencesById = new Map(foundation.sourceModel.occurrences.map((item) => [item.id, item]));
  const facts = financialFacts(foundation);
  const factIds = new Set(facts.map((item) => item.id));
  const factsById = new Map(facts.map((item) => [item.id, item]));
  const populationIds = uniqueIdSet(pricing.pricingPopulations, "pricing population", errors);
  const componentIds = uniqueIdSet(pricing.observedPricingComponents, "pricing component", errors);
  uniqueIdSet(pricing.scopeModels, "pricing scope model", errors);
  uniqueIdSet(pricing.structuralMappings, "pricing structural mapping", errors);

  validateAdmission(analysis, evidenceIds, errors, warnings);
  for (const population of pricing.pricingPopulations) {
    validatePopulation(population, factsById, occurrencesById, occurrenceIds, evidenceIds, errors);
  }
  for (const component of pricing.observedPricingComponents) {
    validateComponent(component, pricing.pricingPopulations, populationIds, factsById, occurrencesById, occurrenceIds, evidenceIds, errors, warnings);
  }
  validateEvidenceClaims(analysis, evidenceIds, errors);
  validateCompleteComponentFormulas(analysis, errors);
  validateScopeModels(analysis, populationIds, componentIds, evidenceIds, errors);
  validateComponentContributions(analysis, errors);
  validateAxes(analysis, evidenceIds, occurrenceIds, errors);
  validateCoverageAndActivity(analysis, errors);
  validateSummary(analysis, errors);
  validateAmendments(analysis, errors);

  const result = {
    ...analysis,
    pricingArchitecture: {
      ...pricing,
      validation: {
        status: errors.length === 0 ? "valid" as const : "invalid" as const,
        errors: unique(errors),
        warnings: unique(warnings),
      },
    },
    validation: {
      status: errors.length === 0 ? "valid" as const : "invalid" as const,
      errors: unique(errors),
      warnings: unique(warnings),
    },
  };
  return result;
}

export function assertCanonicalEconomicsV2PricingAnalysis(
  analysis: CanonicalEconomicsV2PricingAnalysis,
): CanonicalEconomicsV2PricingAnalysis {
  const validated = validateCanonicalEconomicsV2PricingAnalysis(analysis);
  if (validated.validation.status === "invalid") throw new CanonicalEconomicsV2PricingValidationError(validated);
  return validated;
}

function validateAdmission(
  analysis: CanonicalEconomicsV2PricingAnalysis,
  evidenceIds: Set<string>,
  errors: string[],
  warnings: string[],
): void {
  const profile = analysis.pricingArchitecture.admissionProfile;
  if (!profile.pricingAdmissionId.trim()) errors.push("Pricing admission requires a non-empty versioned identity.");
  for (const ref of profile.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing admission has broken evidence ref ${ref}.`);
  for (const ref of profile.noActiveProcessingEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`No-active pricing proof has broken evidence ref ${ref}.`);
  if (profile.noActiveProcessingProven && profile.noActiveProcessingEvidenceRefs.length === 0) {
    errors.push("Affirmative no-active pricing proof requires statement-period evidence.");
  }
  if (profile.source === "versioned_template") {
    const template = analysis.foundation.templateCapability;
    if (template.identityStatus !== "proven" || template.admissionStatus !== "admitted") {
      errors.push("Versioned pricing admission requires proven, admitted RB template identity.");
    }
    if (profile.pricingCoverageProven && template.completenessStatus !== "complete") {
      errors.push("Complete versioned pricing coverage requires complete admitted RB template capability.");
    }
  }
  if (profile.source === "observational" &&
      (profile.populationSemanticsProven || profile.pricingCoverageProven || profile.underlyingCostRolesProven || profile.formulaRelationshipsProven)) {
    errors.push("Observational pricing admission cannot promote semantic or formula capability to proven.");
  }
  if (profile.source === "observational" && analysis.pricingArchitecture.pricingPopulations.some((population) => population.underlyingCostBillingMode !== "unknown")) {
    errors.push("Observational pricing populations cannot resolve underlying-cost billing treatment.");
  }
  if (profile.source === "observational") warnings.push("Pricing observations remain non-authoritative and cannot resolve canonical account-wide pricing axes.");
}

function validatePopulation(
  population: CanonicalPricingPopulation,
  factsById: Map<string, ReturnType<typeof financialFacts>[number]>,
  occurrencesById: Map<string, CanonicalEconomicsV2Foundation["sourceModel"]["occurrences"][number]>,
  occurrenceIds: Set<string>,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  for (const ref of population.sourcePopulationRefs) if (!factsById.has(ref) && !occurrenceIds.has(ref)) errors.push(`Pricing population ${population.id} has broken source-population ref ${ref}.`);
  for (const ref of population.sourceOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Pricing population ${population.id} has broken occurrence ref ${ref}.`);
  for (const ref of population.underlyingCostOccurrenceRefs) {
    if (!occurrenceIds.has(ref)) errors.push(`Pricing population ${population.id} has broken underlying-cost occurrence ref ${ref}.`);
    if (!population.sourceOccurrenceRefs.includes(ref)) errors.push(`Pricing population ${population.id} underlying-cost occurrence is not part of its source lineage.`);
  }
  for (const ref of population.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing population ${population.id} has broken evidence ref ${ref}.`);
  for (const ref of population.scopeRoleEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing population ${population.id} has broken scope-role evidence ref ${ref}.`);
  if (population.observedVolumeFactRef && !factsById.has(population.observedVolumeFactRef)) errors.push(`Pricing population ${population.id} has broken volume fact ref.`);
  if (population.observedCountFactRef && !factsById.has(population.observedCountFactRef)) errors.push(`Pricing population ${population.id} has broken count fact ref.`);
  validateMoney(population.observedVolume, `Pricing population ${population.id} observed volume`, errors);
  if (population.observedCount !== null && (!Number.isSafeInteger(population.observedCount) || population.observedCount < 0)) {
    errors.push(`Pricing population ${population.id} observed count must be a non-negative safe integer or null.`);
  }
  const volumeFact = population.observedVolumeFactRef ? factsById.get(population.observedVolumeFactRef) : undefined;
  if (population.observedVolume && isMoneyLike(volumeFact?.value) && !sameMoneyValue(population.observedVolume, volumeFact.value)) {
    errors.push(`Pricing population ${population.id} observed volume conflicts with its RB fact.`);
  }
  const countFact = population.observedCountFactRef ? factsById.get(population.observedCountFactRef) : undefined;
  if (population.observedCount !== null && typeof countFact?.value === "number" && population.observedCount !== countFact.value) {
    errors.push(`Pricing population ${population.id} observed count conflicts with its RB fact.`);
  }
  for (const dimension of population.dimensionValues) {
    if (!dimension.kind.trim() || !dimension.value.trim()) errors.push(`Pricing population ${population.id} has an empty dimension.`);
    if (/merchant|account|mid|filename|file_name|hash|fingerprint|gold_case|case_id/i.test(dimension.kind)) {
      errors.push(`Pricing population ${population.id} uses a prohibited identity-derived dimension kind.`);
    }
    for (const ref of dimension.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing population ${population.id} dimension has broken evidence ref ${ref}.`);
    if (dimension.evidenceRefs.some((ref) => !population.evidenceRefs.includes(ref))) errors.push(`Pricing population ${population.id} dimension evidence is outside its population lineage.`);
  }
  const materiallyResolved = population.underlyingCostBillingMode !== "unknown" || population.pricingComponentRefs.length > 0 || population.scopeRole !== "standard";
  if (materiallyResolved && (population.evidenceRefs.length === 0 || population.sourcePopulationRefs.length + population.sourceOccurrenceRefs.length === 0)) {
    errors.push(`Resolved pricing population ${population.id} requires population-specific source and evidence lineage.`);
  }
  if (materiallyResolved) {
    const lineageEvidence = unique([
      ...population.sourcePopulationRefs.flatMap((ref) => factsById.get(ref)?.evidenceRefs ?? (occurrencesById.get(ref) ? [occurrencesById.get(ref)!.evidenceRef] : [])),
      ...population.sourceOccurrenceRefs.flatMap((ref) => occurrencesById.get(ref) ? [occurrencesById.get(ref)!.evidenceRef] : []),
    ]);
    if (!population.evidenceRefs.some((ref) => lineageEvidence.includes(ref))) {
      errors.push(`Resolved pricing population ${population.id} evidence does not match its source lineage.`);
    }
    for (const dimension of population.dimensionValues) {
      if (dimension.evidenceRefs.length === 0 || !dimension.evidenceRefs.some((ref) => lineageEvidence.includes(ref))) {
        errors.push(`Pricing population ${population.id} dimension evidence does not match its source lineage.`);
      }
    }
    if (population.scopeRole !== "standard" &&
        !population.scopeRoleEvidenceRefs.some((ref) => population.evidenceRefs.includes(ref) && lineageEvidence.includes(ref))) {
      errors.push(`Pricing population ${population.id} scope-role evidence does not match its source lineage.`);
    }
  }
  if (population.scopeRole !== "standard" && population.scopeRoleEvidenceRefs.length === 0) {
    errors.push(`Pricing population ${population.id} scope role requires evidence.`);
  }
  if (population.activityStatus === "inactive_informational" && population.pricingComponentRefs.length > 0 &&
      population.underlyingCostBillingMode !== "unknown") {
    errors.push(`Inactive pricing population ${population.id} cannot establish an underlying-cost billing mode.`);
  }
}

function validateComponent(
  component: CanonicalPricingComponent,
  populations: CanonicalPricingPopulation[],
  populationIds: Set<string>,
  factsById: Map<string, ReturnType<typeof financialFacts>[number]>,
  occurrencesById: Map<string, CanonicalEconomicsV2Foundation["sourceModel"]["occurrences"][number]>,
  occurrenceIds: Set<string>,
  evidenceIds: Set<string>,
  errors: string[],
  warnings: string[],
): void {
  if (!populationIds.has(component.populationRef)) errors.push(`Pricing component ${component.id} has broken population ref.`);
  const population = populations.find((item) => item.id === component.populationRef);
  const basisFact = component.basisFactRef ? factsById.get(component.basisFactRef) : undefined;
  if (component.basisFactRef && !basisFact) errors.push(`Pricing component ${component.id} has broken basis fact ref.`);
  for (const ref of component.occurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Pricing component ${component.id} has broken occurrence ref ${ref}.`);
  for (const ref of component.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing component ${component.id} has broken evidence ref ${ref}.`);
  for (const ref of component.occurrenceRefs) {
    const evidenceRef = occurrencesById.get(ref)?.evidenceRef;
    if (evidenceRef && !component.evidenceRefs.includes(evidenceRef)) errors.push(`Pricing component ${component.id} evidence does not match occurrence ${ref}.`);
  }
  validateMoney(component.appliedBaseAmount, `Pricing component ${component.id} applied base`, errors);
  validateMoney(component.perItemAmount, `Pricing component ${component.id} per-item amount`, errors);
  validateMoney(component.fixedAmount, `Pricing component ${component.id} fixed amount`, errors);
  validateMoney(component.minimumAmount, `Pricing component ${component.id} minimum amount`, errors);
  validateMoney(component.observedAmount, `Pricing component ${component.id} observed amount`, errors);
  if (component.appliedCount !== null && (!Number.isSafeInteger(component.appliedCount) || component.appliedCount < 0)) {
    errors.push(`Pricing component ${component.id} applied count must be a non-negative safe integer or null.`);
  }
  if (component.rate !== null && (canonicalDecimal(component.rate) === null || component.rate.startsWith("-"))) errors.push(`Pricing component ${component.id} has an invalid canonical decimal rate.`);
  if (component.printedRate !== null && (canonicalDecimal(component.printedRate) === null || component.printedRate.startsWith("-"))) {
    errors.push(`Pricing component ${component.id} has an invalid printed rate.`);
  }
  if ((component.printedRate === null) !== (component.printedRateUnit === null)) {
    errors.push(`Pricing component ${component.id} must bind printed rate and printed unit together.`);
  }
  if (component.printedRate !== null && component.printedRateUnit !== null && component.rate !== null) {
    const normalized = normalizePrintedPricingRate(component.printedRate, component.printedRateUnit);
    if (normalized === null || !sameDecimal(normalized, component.rate)) errors.push(`Pricing component ${component.id} printed rate/unit does not normalize to its canonical rate.`);
  }
  if (component.componentKind === "basis_points" && component.printedRateUnit !== null && component.printedRateUnit !== "basis_points") {
    errors.push(`Basis-point component ${component.id} has an incompatible printed rate unit.`);
  }
  if (component.componentKind === "percentage" && component.printedRateUnit === "basis_points") {
    errors.push(`Percentage component ${component.id} has an incompatible printed rate unit.`);
  }
  const hasValue = component.appliedBaseAmount !== null || component.appliedCount !== null || component.rate !== null ||
    component.perItemAmount !== null || component.fixedAmount !== null || component.minimumAmount !== null || component.observedAmount !== null;
  if ((component.presenceStatus === "not_observable" || component.presenceStatus === "absent_from_complete_source") && hasValue) {
    errors.push(`Pricing component ${component.id} cannot carry numeric values when ${component.presenceStatus}.`);
  }
  if (component.presenceStatus === "absent_from_complete_source" && component.evidenceRefs.length === 0) {
    errors.push(`Absent pricing component ${component.id} requires completeness evidence.`);
  }
  if (component.presenceStatus === "observed_nonzero" && component.evidenceRefs.length === 0 && component.occurrenceRefs.length === 0) {
    errors.push(`Observed pricing component ${component.id} lacks source evidence.`);
  }
  if (component.presenceStatus === "observed_nonzero" && component.observedAmount?.amountMinor === 0) {
    errors.push(`Observed-nonzero pricing component ${component.id} cannot carry a zero billed amount.`);
  }
  if (component.presenceStatus === "explicitly_zero" && component.observedAmount !== null && component.observedAmount.amountMinor !== 0) {
    errors.push(`Explicitly-zero pricing component ${component.id} cannot carry a nonzero billed amount.`);
  }
  if (population?.activityStatus === "active_settled" && component.applicability === "inactive_informational") {
    warnings.push(`Active pricing population ${population.id} contains an inactive informational component.`);
  }
  if (population?.activityStatus !== "active_settled" && component.applicability === "active") {
    errors.push(`Pricing component ${component.id} cannot be active for a non-active population.`);
  }
  validateComponentBasis(component, population, basisFact, errors);
  validateRelationshipStructure(component, errors);
  if (component.applicability === "inactive_informational" && component.formulaRelationship !== "unresolved") {
    warnings.push(`Inactive pricing component ${component.id} retains a structural relationship but cannot contribute to current active axes.`);
  }
}

function validateComponentBasis(
  component: CanonicalPricingComponent,
  population: CanonicalPricingPopulation | undefined,
  basisFact: ReturnType<typeof financialFacts>[number] | undefined,
  errors: string[],
): void {
  const rateKind = component.componentKind === "percentage" || component.componentKind === "basis_points";
  if (rateKind && component.basisType !== "volume" && component.basisType !== "unknown") errors.push(`Rate component ${component.id} has an incompatible basis.`);
  if (component.componentKind === "per_item" && component.basisType !== "transaction_count" && component.basisType !== "unknown") errors.push(`Per-item component ${component.id} has an incompatible basis.`);
  if (component.componentKind === "fixed" && component.basisType !== "fixed_period" && component.basisType !== "unknown") errors.push(`Fixed component ${component.id} has an incompatible basis.`);
  if (component.componentKind === "minimum" && component.basisType !== "minimum_floor" && component.basisType !== "unknown") errors.push(`Minimum component ${component.id} has an incompatible basis.`);
  if (component.componentKind === "subscription" && component.basisType !== "subscription_period" && component.basisType !== "unknown") errors.push(`Subscription component ${component.id} has an incompatible basis.`);
  if (component.componentKind === "pass_through" && component.basisType !== "underlying_cost_occurrence" && component.basisType !== "unknown") errors.push(`Pass-through component ${component.id} has an incompatible basis.`);

  if (component.basisFactRef && population && !population.sourcePopulationRefs.includes(component.basisFactRef) &&
      population.observedVolumeFactRef !== component.basisFactRef && population.observedCountFactRef !== component.basisFactRef) {
    errors.push(`Pricing component ${component.id} basis fact is not part of its pricing population lineage.`);
  }
  if (basisFact && component.basisPopulationKind && !pricingBasisMatchesFact(component.basisPopulationKind, basisFact.population)) {
    errors.push(`Pricing component ${component.id} basis kind conflicts with its RB fact population.`);
  }
  if (basisFact && !component.evidenceRefs.some((ref) => basisFact.evidenceRefs.includes(ref))) {
    errors.push(`Pricing component ${component.id} evidence does not match its referenced RB basis fact.`);
  }
  if (basisFact?.value && component.appliedBaseAmount && isMoneyLike(basisFact.value) && !sameMoneyValue(component.appliedBaseAmount, basisFact.value)) {
    errors.push(`Pricing component ${component.id} applied base conflicts with its referenced RB fact.`);
  }
  if (typeof basisFact?.value === "number" && component.appliedCount !== null && component.appliedCount !== basisFact.value) {
    errors.push(`Pricing component ${component.id} applied count conflicts with its referenced RB fact.`);
  }
}

function validateRelationshipStructure(component: CanonicalPricingComponent, errors: string[]): void {
  if (component.formulaRelationship === "minimum_floor" && component.componentKind !== "minimum") {
    errors.push(`Pricing component ${component.id} claims a minimum-floor relationship without a minimum component.`);
  }
  if (component.formulaRelationship === "included_in_subscription" && component.componentKind !== "subscription" && component.componentKind !== "bundled") {
    errors.push(`Pricing component ${component.id} claims subscription inclusion without a subscription/bundled component.`);
  }
}

function validateScopeModels(
  analysis: CanonicalEconomicsV2PricingAnalysis,
  populationIds: Set<string>,
  componentIds: Set<string>,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  for (const model of analysis.pricingArchitecture.scopeModels) {
    if (!populationIds.has(model.populationRef)) errors.push(`Pricing scope model ${model.id} has broken population ref.`);
    for (const ref of model.componentRefs) if (!componentIds.has(ref)) errors.push(`Pricing scope model ${model.id} has broken component ref ${ref}.`);
    for (const ref of model.relatedPopulationRefs) if (!populationIds.has(ref)) errors.push(`Pricing scope model ${model.id} has broken related-population ref ${ref}.`);
    for (const ref of model.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing scope model ${model.id} has broken evidence ref ${ref}.`);
    for (const ref of model.componentRefs) {
      const component = analysis.pricingArchitecture.observedPricingComponents.find((item) => item.id === ref);
      if (component && component.populationRef !== model.populationRef) errors.push(`Pricing scope model ${model.id} crosses component populations.`);
    }
    const population = analysis.pricingArchitecture.pricingPopulations.find((item) => item.id === model.populationRef);
    const modelComponents = model.componentRefs.flatMap((ref) => {
      const component = analysis.pricingArchitecture.observedPricingComponents.find((item) => item.id === ref);
      return component ? [component] : [];
    });
    const lineageEvidence = unique([...(population?.evidenceRefs ?? []), ...modelComponents.flatMap((component) => component.evidenceRefs)]);
    if (model.formulaRelationship !== "unresolved" && model.evidenceRefs.length === 0) {
      errors.push(`Resolved pricing scope model ${model.id} requires formula-relationship evidence.`);
    }
    if (model.evidenceRefs.length > 0 && !model.evidenceRefs.some((ref) => lineageEvidence.includes(ref))) {
      errors.push(`Pricing scope model ${model.id} evidence does not match its population/component lineage.`);
    }
  }
  const active = analysis.pricingArchitecture.pricingPopulations.filter((population) => population.activityStatus === "active_settled");
  for (const population of active) {
    const complete = analysis.pricingArchitecture.scopeModels.filter((model) =>
      model.populationRef === population.id && model.formulaCoverageStatus === "complete_for_admitted_active_populations");
    if (complete.length > 1) errors.push(`Active pricing population ${population.id} has multiple complete scope models.`);
  }
}

function validateCompleteComponentFormulas(analysis: CanonicalEconomicsV2PricingAnalysis, errors: string[]): void {
  const pricing = analysis.pricingArchitecture;
  if (!pricing.admissionProfile.pricingCoverageProven) return;
  const completePopulationRefs = new Set(pricing.scopeModels
    .filter((model) => model.formulaCoverageStatus === "complete_for_admitted_active_populations")
    .map((model) => model.populationRef));
  for (const component of pricing.observedPricingComponents) {
    if (component.applicability !== "active" || !completePopulationRefs.has(component.populationRef)) continue;
    if (component.componentKind === "percentage" || component.componentKind === "basis_points") {
      if (component.rate === null || (component.appliedBaseAmount === null && component.basisFactRef === null)) {
        errors.push(`Complete percentage pricing component ${component.id} requires an explicit rate and volume basis.`);
        continue;
      }
      if (component.appliedBaseAmount && component.observedAmount) {
        const expected = multiplyMinorByDecimalRate(component.appliedBaseAmount.amountMinor, component.rate);
        if (expected === null || component.observedAmount.amountMinor !== expected) errors.push(`Pricing component ${component.id} does not reconstruct from its exact percentage basis.`);
      }
    }
    if (component.componentKind === "per_item") {
      if (component.perItemAmount === null || component.appliedCount === null) {
        errors.push(`Complete per-item pricing component ${component.id} requires an explicit per-item amount and count basis.`);
      } else if (component.observedAmount && component.observedAmount.amountMinor !== component.perItemAmount.amountMinor * component.appliedCount) {
        errors.push(`Synthetic pricing component ${component.id} does not reconstruct from its exact per-item basis.`);
      }
    }
    if (component.componentKind === "fixed") {
      if (component.fixedAmount === null) errors.push(`Complete fixed pricing component ${component.id} requires a fixed amount.`);
      else if (component.observedAmount && !sameMoneyValue(component.fixedAmount, component.observedAmount)) errors.push(`Complete fixed pricing component ${component.id} does not match its billed amount.`);
    }
    if (component.componentKind === "minimum" && (component.minimumAmount === null || (component.observedAmount?.amountMinor ?? 0) <= 0)) {
      errors.push(`Complete minimum pricing component ${component.id} requires an actually billed minimum structure.`);
    } else if (component.componentKind === "minimum" && component.minimumAmount && component.observedAmount &&
        component.observedAmount.amountMinor < component.minimumAmount.amountMinor) {
      errors.push(`Complete minimum pricing component ${component.id} billed amount is below its admitted floor.`);
    }
    if (component.componentKind === "subscription" && (component.fixedAmount === null || (component.observedAmount?.amountMinor ?? 0) <= 0)) {
      errors.push(`Complete subscription pricing component ${component.id} requires an actually billed recurring amount.`);
    } else if (component.componentKind === "subscription" && component.fixedAmount && component.observedAmount &&
        !sameMoneyValue(component.fixedAmount, component.observedAmount)) {
      errors.push(`Complete subscription pricing component ${component.id} does not match its billed recurring amount.`);
    }
  }
}

function validateEvidenceClaims(
  analysis: CanonicalEconomicsV2PricingAnalysis,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  const pricing = analysis.pricingArchitecture;
  for (const mapping of pricing.structuralMappings) {
    for (const ref of mapping.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing structural mapping ${mapping.id} has broken evidence ref ${ref}.`);
    if (mapping.state === "admitted" && mapping.evidenceRefs.length === 0) errors.push(`Admitted pricing structural mapping ${mapping.id} requires evidence.`);
    if (mapping.state === "admitted" && pricing.admissionProfile.source === "observational") {
      errors.push(`Observational pricing structural mapping ${mapping.id} cannot be admitted.`);
    }
  }
  if (pricing.admissionProfile.source === "observational" &&
      pricing.observedPricingComponents.some((component) => component.presenceStatus === "absent_from_complete_source")) {
    errors.push("Observational pricing evidence cannot establish component absence from a complete source.");
  }
  if (pricing.admissionProfile.source !== "versioned_template") return;
  for (const population of pricing.pricingPopulations.filter((item) => item.activityStatus === "active_settled")) {
    if (population.underlyingCostBillingMode === "separately_billed_pass_through") {
      const reconciledOccurrence = population.underlyingCostOccurrenceRefs
        .map((ref) => analysis.foundation.sourceModel.occurrences.find((occurrence) => occurrence.id === ref))
        .some((occurrence) => occurrence && occurrence.semanticRole === "fee_charge" && occurrence.reconciliationRefs.length > 0);
      const linkedPassThroughComponent = pricing.observedPricingComponents.some((component) =>
        component.populationRef === population.id && component.componentKind === "pass_through" &&
        component.basisType === "underlying_cost_occurrence" &&
        component.occurrenceRefs.some((ref) => population.underlyingCostOccurrenceRefs.includes(ref)));
      if (!reconciledOccurrence || !linkedPassThroughComponent) {
        errors.push(`Pass-through pricing population ${population.id} requires a separately billed, reconciled underlying-cost occurrence.`);
      }
    }
    if (population.underlyingCostBillingMode === "bundled_into_merchant_price" && !pricing.admissionProfile.pricingCoverageProven) {
      errors.push(`Bundled pricing population ${population.id} requires complete admitted pricing coverage.`);
    }
  }
}

function validateComponentContributions(analysis: CanonicalEconomicsV2PricingAnalysis, errors: string[]): void {
  const contributors = new Map<string, string[]>();
  for (const component of analysis.pricingArchitecture.observedPricingComponents) {
    if (component.observedAmount === null) continue;
    for (const ref of component.occurrenceRefs) contributors.set(ref, [...(contributors.get(ref) ?? []), component.id]);
  }
  for (const [ref, componentRefs] of contributors) {
    if (componentRefs.length > 1) errors.push(`Source occurrence ${ref} contributes an observed amount to more than one pricing component.`);
    const group = analysis.foundation.sourceModel.representationGroups.find((item) => item.occurrenceRefs.includes(ref));
    if (group?.duplicateHandling === "one_authoritative_contributor" && group.authoritativeContributionOccurrenceRef !== ref) {
      errors.push(`Supporting repeated occurrence ${ref} cannot contribute a pricing amount.`);
    }
  }
}

function validateAxes(
  analysis: CanonicalEconomicsV2PricingAnalysis,
  evidenceIds: Set<string>,
  occurrenceIds: Set<string>,
  errors: string[],
): void {
  const axes = [
    analysis.pricingArchitecture.underlyingCostBillingMode,
    analysis.pricingArchitecture.merchantPriceScheduleShape,
    analysis.pricingArchitecture.scopeUniformity,
  ];
  for (const axis of axes) {
    if (axis.status === "available" && axis.value === null) errors.push(`Available pricing axis ${axis.id} has a null value.`);
    if (axis.status !== "available" && axis.value !== null) errors.push(`Unavailable pricing axis ${axis.id} carries a value.`);
    for (const ref of axis.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Pricing axis ${axis.id} has broken evidence ref ${ref}.`);
    for (const ref of axis.occurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Pricing axis ${axis.id} has broken occurrence ref ${ref}.`);
    const resolved = axis.status === "available" && axis.value !== null && axis.value !== "unknown" && axis.value !== "unresolved";
    if (resolved && axis.evidenceRefs.length === 0) errors.push(`Resolved pricing axis ${axis.id} requires evidence.`);
  }
  if (analysis.pricingArchitecture.admissionProfile.source === "observational" &&
      analysis.foundation.identity.provenanceStatus !== "source_unavailable" &&
      analysis.foundation.identity.provenanceStatus !== "corpus_integrity_hold") {
    const pricing = analysis.pricingArchitecture;
    if (pricing.underlyingCostBillingMode.value !== "unknown" ||
        pricing.merchantPriceScheduleShape.value !== "unknown" ||
        pricing.scopeUniformity.value !== "unresolved") {
      errors.push("Observational pricing evidence cannot resolve canonical account-wide axes.");
    }
  }
  if (analysis.foundation.identity.provenanceStatus === "source_unavailable" || analysis.foundation.identity.provenanceStatus === "corpus_integrity_hold") {
    if (axes.some((axis) => axis.status === "available" || axis.value !== null)) errors.push("Unavailable or corpus-held RB sources cannot produce resolved pricing axes.");
  }
}

function validateCoverageAndActivity(analysis: CanonicalEconomicsV2PricingAnalysis, errors: string[]): void {
  const pricing = analysis.pricingArchitecture;
  const active = pricing.pricingPopulations.filter((item) => item.activityStatus === "active_settled");
  const noActive = active.length === 0 && pricing.pricingPopulations.length > 0 && pricing.admissionProfile.populationSemanticsProven;
  const affirmativelyNoActive = noActive && pricing.admissionProfile.noActiveProcessingProven &&
    pricing.admissionProfile.noActiveProcessingEvidenceRefs.length > 0 &&
    pricing.pricingPopulations.every((population) => population.activityStatus !== "unknown");
  if (pricing.formulaCoverageStatus === "complete_for_admitted_active_populations") {
    if (!pricing.admissionProfile.pricingCoverageProven || !pricing.admissionProfile.formulaRelationshipsProven) {
      errors.push("Complete pricing formula coverage requires admitted coverage and formula relationships.");
    }
    if (active.length === 0) errors.push("Complete active-population formula coverage requires an active population.");
    for (const population of active) {
      const models = pricing.scopeModels.filter((model) => model.populationRef === population.id &&
        model.formulaCoverageStatus === "complete_for_admitted_active_populations");
      if (models.length !== 1) errors.push(`Complete pricing formula coverage requires exactly one complete model for ${population.id}.`);
    }
  }
  if (pricing.formulaCoverageStatus === "not_applicable_no_active_processing" && !affirmativelyNoActive) {
    errors.push("No-active formula coverage requires proven pricing populations with no active processing.");
  }
  const axesNoActive = pricing.underlyingCostBillingMode.value === "no_active_processing" &&
    pricing.merchantPriceScheduleShape.value === "no_active_processing" &&
    pricing.scopeUniformity.value === "no_active_processing";
  if (affirmativelyNoActive !== axesNoActive) errors.push("No-active processing must be represented consistently across all three pricing axes and affirmative evidence.");
  if (axesNoActive && hasPositiveProcessing(analysis.foundation)) errors.push("No-active pricing conflicts with positive RB processing populations.");
}

function validateSummary(analysis: CanonicalEconomicsV2PricingAnalysis, errors: string[]): void {
  const pricing = analysis.pricingArchitecture;
  const summary = pricing.derivedHumanSummary;
  if (summary.canonical !== false) errors.push("Derived pricing summary must be explicitly noncanonical.");
  if (summary.independentEvidenceRefs.length !== 0) errors.push("Derived pricing summary cannot carry independent evidence.");
  const expectedRefs = [pricing.underlyingCostBillingMode.id, pricing.merchantPriceScheduleShape.id, pricing.scopeUniformity.id];
  if (JSON.stringify(summary.inputAxisRefs) !== JSON.stringify(expectedRefs)) errors.push("Derived pricing summary is not bound to all three canonical axes.");
  const unresolved = pricing.underlyingCostBillingMode.value === null || pricing.underlyingCostBillingMode.value === "unknown" ||
    pricing.merchantPriceScheduleShape.value === null || pricing.merchantPriceScheduleShape.value === "unknown" ||
    pricing.scopeUniformity.value === null || pricing.scopeUniformity.value === "unresolved";
  if (unresolved && summary.code !== "unknown_limited_analysis") errors.push("Derived pricing summary repaired an unresolved canonical axis.");
  const expectedCode = deriveCanonicalPricingHumanSummaryCode(
    pricing.underlyingCostBillingMode,
    pricing.merchantPriceScheduleShape,
    pricing.scopeUniformity,
  );
  if (summary.code !== expectedCode) errors.push("Derived pricing summary contradicts the canonical pricing axes.");
}

function validateAmendments(analysis: CanonicalEconomicsV2PricingAnalysis, errors: string[]): void {
  const actual = analysis.pricingArchitecture.semanticAmendments.map((item) => item.id).sort();
  const expected = [...RC_SEMANTIC_AMENDMENT_IDS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push("RC pricing must declare exactly the five approved semantic amendments.");
}

function hasPositiveProcessing(foundation: CanonicalEconomicsV2Foundation): boolean {
  const facts = foundation.financialPopulations;
  return (facts.grossSaleVolume.value?.amountMinor ?? 0) > 0 ||
    (facts.canonicalNetSubmittedCardVolume.value?.amountMinor ?? 0) > 0 ||
    (facts.grossSaleTransactionCount.value ?? 0) > 0;
}

function financialFacts(foundation: CanonicalEconomicsV2Foundation) {
  return Object.values(foundation.financialPopulations);
}

function pricingBasisMatchesFact(pricingBasis: string, factPopulation: string): boolean {
  const aliases: Record<string, string[]> = {
    gross_sales_before_refunds: ["gross_sale_volume"],
    gross_sale_volume: ["gross_sale_volume"],
    canonical_net_submitted: ["canonical_net_submitted_card_volume"],
    canonical_net_submitted_card_volume: ["canonical_net_submitted_card_volume"],
    refund_volume: ["refund_volume"],
    total_statement_processing_fees: ["total_statement_processing_fees"],
    gross_sale_transaction_count: ["gross_sale_transaction_count"],
    submitted_transaction_count: ["submitted_transaction_count"],
    settled_transaction_count: ["settled_transaction_count"],
    authorization_count: ["authorization_count"],
  };
  return (aliases[pricingBasis] ?? [pricingBasis]).includes(factPopulation);
}

function isMoneyLike(value: unknown): value is MoneyAmount {
  return Boolean(value) && typeof value === "object" && "amountMinor" in (value as object) && "currency" in (value as object);
}

function sameMoneyValue(left: MoneyAmount, right: MoneyAmount): boolean {
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}

function validateMoney(value: MoneyAmount | null, label: string, errors: string[]): void {
  if (value === null) return;
  if (value.currency !== "USD" || !Number.isSafeInteger(value.amountMinor)) errors.push(`${label} must use safe integer USD minor units.`);
}

function uniqueIdSet(items: Array<{ id: string }>, label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.trim()) errors.push(`Empty ${label} id.`);
    if (ids.has(item.id)) errors.push(`Duplicate ${label} id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
