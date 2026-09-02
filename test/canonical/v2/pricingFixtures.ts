import {
  buildCanonicalEconomicsV2FromFiserv,
  buildCanonicalEconomicsV2PricingAnalysis,
  type BuildCanonicalEconomicsV2PricingInput,
  type CanonicalEconomicsV2Foundation,
  type CanonicalEconomicsV2PricingAnalysis,
  type CanonicalPricingComponentAdmission,
  type CanonicalPricingPopulationAdmission,
  type CanonicalPricingScopeModelAdmission,
} from "../../../src/canonical/v2/index.js";
import { v2SyntheticStatement, type V2SyntheticStatementOptions } from "./fixtures.js";

export function pricingFoundation(options: V2SyntheticStatementOptions = {}): CanonicalEconomicsV2Foundation {
  const fixture = v2SyntheticStatement(options);
  return buildCanonicalEconomicsV2FromFiserv({
    ...fixture,
    sourceDocumentRef: "SYNTH-RC-PRICING",
    parserId: "synthetic_rc_pricing_parser",
    provenanceStatus: "approved_synthetic",
  });
}

export function approvedSyntheticProfile(foundation: CanonicalEconomicsV2Foundation) {
  return {
    source: "approved_synthetic" as const,
    pricingAdmissionId: "approved_synthetic_pricing_v1",
    populationSemanticsProven: true,
    pricingCoverageProven: true,
    underlyingCostRolesProven: true,
    formulaRelationshipsProven: true,
    noActiveProcessingProven: false,
    noActiveProcessingEvidenceRefs: [],
    evidenceRefs: [foundation.sourceModel.evidence[0]!.id],
    limitations: [],
  };
}

export function buildPricing(input: {
  foundation?: CanonicalEconomicsV2Foundation;
  populations: CanonicalPricingPopulationAdmission[];
  components?: CanonicalPricingComponentAdmission[];
  scopeModels?: CanonicalPricingScopeModelAdmission[];
  structuralMappings?: BuildCanonicalEconomicsV2PricingInput["structuralMappings"];
}): CanonicalEconomicsV2PricingAnalysis {
  const foundation = input.foundation ?? pricingFoundation();
  const defaultEvidenceRef = foundation.sourceModel.evidence[0]!.id;
  const defaultPopulationRef = foundation.financialPopulations.grossSaleVolume.id;
  return buildCanonicalEconomicsV2PricingAnalysis({
    foundation,
    admissionProfile: approvedSyntheticProfile(foundation),
    populations: input.populations.map((population) => ({
      ...population,
      evidenceRefs: population.evidenceRefs?.length ? population.evidenceRefs : [defaultEvidenceRef],
      sourcePopulationRefs: (population.sourcePopulationRefs?.length ?? 0) + (population.sourceOccurrenceRefs?.length ?? 0) > 0
        ? population.sourcePopulationRefs
        : [defaultPopulationRef],
    })),
    components: input.components ?? [],
    scopeModels: input.scopeModels ?? [],
    structuralMappings: input.structuralMappings,
  });
}

export function percentagePopulationInput(
  foundation: CanonicalEconomicsV2Foundation,
  scopes: Array<{
    key: string;
    dimensionKind?: string;
    dimensionValue: string;
    rate: string;
    underlying?: "separately_billed_pass_through" | "bundled_into_merchant_price";
    scopeRole?: "standard" | "dominant" | "explicit_exception";
    relationship?: "additive" | "mutually_exclusive_tier";
  }>,
): {
  populations: CanonicalPricingPopulationAdmission[];
  components: CanonicalPricingComponentAdmission[];
  scopeModels: CanonicalPricingScopeModelAdmission[];
} {
  const evidenceRef = foundation.sourceModel.evidence[0]!.id;
  const factRef = foundation.financialPopulations.grossSaleVolume.id;
  return {
    populations: scopes.map((scope) => ({
      key: scope.key,
      activityStatus: "active_settled",
      scopeRole: scope.scopeRole,
      scopeRoleEvidenceRefs: scope.scopeRole ? [evidenceRef] : [],
      dimensionValues: [{ kind: scope.dimensionKind ?? "brand", value: scope.dimensionValue, evidenceRefs: [evidenceRef] }],
      sourcePopulationRefs: [factRef],
      observedVolumeFactRef: factRef,
      underlyingCostBillingMode: scope.underlying ?? "bundled_into_merchant_price",
      underlyingCostDerivabilityTier: "deterministically_derivable_from_statement",
      evidenceRefs: [evidenceRef],
    })),
    components: scopes.map((scope, index) => ({
      key: `component_${index + 1}`,
      populationKey: scope.key,
      presenceStatus: "observed_nonzero",
      componentKind: "percentage",
      basisType: "volume",
      basisPopulationKind: "gross_sales_before_refunds",
      basisFactRef: factRef,
      appliedBaseAmount: foundation.financialPopulations.grossSaleVolume.value,
      rate: scope.rate,
      printedRate: scope.rate,
      printedRateUnit: "decimal",
      observedAmount: {
        amountMinor: Math.round((foundation.financialPopulations.grossSaleVolume.value?.amountMinor ?? 0) * Number(scope.rate)),
        currency: "USD",
      },
      applicability: "active",
      formulaRelationship: scope.relationship ?? "additive",
      derivabilityTier: "deterministically_derivable_from_statement",
      evidenceRefs: [evidenceRef],
    })),
    scopeModels: scopes.map((scope, index) => ({
      populationKey: scope.key,
      componentKeys: [`component_${index + 1}`],
      formulaRelationship: scope.relationship ?? "additive",
      formulaCoverageStatus: "complete_for_admitted_active_populations",
      evidenceRefs: [evidenceRef],
    })),
  };
}
