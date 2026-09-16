import type { CanonicalEconomicsV2Foundation, CanonicalEconomicsV2SourceOccurrence } from "./types.js";
import {
  buildCanonicalEconomicsV2PricingAnalysis,
  type BuildCanonicalEconomicsV2PricingInput,
  type CanonicalPricingComponentAdmission,
  type CanonicalPricingPopulationAdmission,
  type CanonicalPricingScopeModelAdmission,
} from "./pricingResolver.js";

export function buildObservationalCanonicalPricingV2FromFiserv(
  foundation: CanonicalEconomicsV2Foundation,
) {
  const candidates = foundation.sourceModel.occurrences.filter(isPricingCandidateOccurrence);
  const populations: CanonicalPricingPopulationAdmission[] = [];
  const components: CanonicalPricingComponentAdmission[] = [];
  const scopeModels: CanonicalPricingScopeModelAdmission[] = [];

  for (const [index, occurrence] of candidates.entries()) {
    const number = String(index + 1).padStart(3, "0");
    const populationKey = `observed_population_${number}`;
    const componentKey = `observed_component_${number}`;
    const activityStatus = observationalActivityStatus(occurrence);
    populations.push({
      key: populationKey,
      activityStatus,
      dimensionValues: [],
      sourcePopulationRefs: [occurrence.id],
      sourceOccurrenceRefs: [occurrence.id],
      observedVolume: occurrence.volumeBasis,
      observedCount: occurrence.printedCount,
      underlyingCostBillingMode: "unknown",
      underlyingCostDerivabilityTier: "unresolved",
      confidence: "unavailable",
      evidenceRefs: [occurrence.evidenceRef],
      limitations: ["Observed Fiserv row semantics are not a versioned pricing admission and cannot establish canonical pricing scope or underlying-cost treatment."],
    });
    components.push({
      key: componentKey,
      populationKey,
      presenceStatus: occurrence.printedAmount?.amountMinor === 0 ? "explicitly_zero" : "observed_nonzero",
      componentKind: observationalComponentKind(occurrence),
      basisType: observationalBasisType(occurrence),
      basisPopulationKind: null,
      appliedBaseAmount: occurrence.volumeBasis,
      appliedCount: occurrence.printedCount,
      rate: occurrence.printedRate,
      printedRateUnit: occurrence.printedRate === null ? null : "decimal",
      perItemAmount: occurrence.perItemAmount,
      observedAmount: occurrence.printedAmount,
      applicability: activityStatus === "active_settled" ? "active" : activityStatus === "inactive_informational" ? "inactive_informational" : "unknown",
      formulaRelationship: "unresolved",
      derivabilityTier: occurrence.printedRate !== null || occurrence.perItemAmount !== null
        ? "deterministically_derivable_from_statement"
        : "unresolved",
      confidence: "unavailable",
      assertionBasis: "source_fact",
      evidenceRefs: [occurrence.evidenceRef],
      occurrenceRefs: [occurrence.id],
      limitations: ["The observed row is retained without importing the legacy pricing-model label or fee-ownership classification."],
    });
    scopeModels.push({
      populationKey,
      componentKeys: [componentKey],
      formulaRelationship: "unresolved",
      formulaCoverageStatus: occurrence.printedAmount === null ? "unresolved" : "partial_observed_components",
      evidenceRefs: [occurrence.evidenceRef],
      limitations: ["Observational row coverage is not complete account-wide pricing formula coverage."],
    });
  }

  const input: BuildCanonicalEconomicsV2PricingInput = {
    foundation,
    admissionProfile: {
      source: "observational",
      pricingAdmissionId: "fiserv_pricing_observation_v1",
      populationSemanticsProven: false,
      pricingCoverageProven: false,
      underlyingCostRolesProven: false,
      formulaRelationshipsProven: false,
      noActiveProcessingProven: false,
      noActiveProcessingEvidenceRefs: [],
      evidenceRefs: unique(candidates.map((item) => item.evidenceRef)),
      limitations: [
        "Parsing success and familiar Fiserv labels do not establish versioned pricing admission.",
        "Legacy pricingModel and AI pricing overrides are intentionally excluded from RC inputs.",
      ],
    },
    populations,
    components,
    scopeModels,
    limitations: ["This adapter exposes deterministic Fiserv row observations only; it does not expand processor support or production authority."],
  };
  return buildCanonicalEconomicsV2PricingAnalysis(input);
}

function isPricingCandidateOccurrence(occurrence: CanonicalEconomicsV2SourceOccurrence): boolean {
  if (occurrence.semanticRole !== "fee_charge" && occurrence.semanticRole !== "fee_credit") return false;
  return occurrence.printedRate !== null || occurrence.perItemAmount !== null ||
    occurrence.volumeBasis !== null || occurrence.printedCount !== null;
}

function observationalActivityStatus(occurrence: CanonicalEconomicsV2SourceOccurrence): CanonicalPricingPopulationAdmission["activityStatus"] {
  if (occurrence.semanticRole === "fee_credit") return "refund_or_credit";
  const volume = occurrence.volumeBasis?.amountMinor ?? null;
  const count = occurrence.printedCount;
  const amount = occurrence.printedAmount?.amountMinor ?? null;
  if ((volume === 0 || volume === null) && (count === 0 || count === null) && amount === 0) return "inactive_informational";
  if ((volume ?? 0) > 0 || (count ?? 0) > 0) return "active_settled";
  return amount === null ? "unknown" : "fee_only";
}

function observationalComponentKind(occurrence: CanonicalEconomicsV2SourceOccurrence): CanonicalPricingComponentAdmission["componentKind"] {
  if (occurrence.printedRate !== null && occurrence.volumeBasis !== null) return "percentage";
  if (occurrence.perItemAmount !== null && occurrence.printedCount !== null) return "per_item";
  return "unknown";
}

function observationalBasisType(occurrence: CanonicalEconomicsV2SourceOccurrence): CanonicalPricingComponentAdmission["basisType"] {
  if (occurrence.printedRate !== null && occurrence.volumeBasis !== null) return "volume";
  if (occurrence.perItemAmount !== null && occurrence.printedCount !== null) return "transaction_count";
  return "unknown";
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
