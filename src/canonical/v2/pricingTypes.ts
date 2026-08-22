import type { DecimalString, MoneyAmount } from "../types.js";
import type {
  CanonicalEconomicsV2Availability,
  CanonicalEconomicsV2DifferenceClassification,
  CanonicalEconomicsV2Foundation,
} from "./types.js";

export type CanonicalPricingDerivabilityTier =
  | "stated_on_statement"
  | "deterministically_derivable_from_statement"
  | "inferable_from_statement_with_qualification"
  | "requires_external_rule_or_schedule"
  | "requires_merchant_pricing_document"
  | "requires_additional_statement_history"
  | "requires_processor_explanation"
  | "not_derivable_from_this_document_class"
  | "unresolved";

export type CanonicalPricingConfidence = "high" | "medium" | "low" | "unavailable";
export type CanonicalPricingAssertionBasis =
  | "source_fact"
  | "deterministic_math"
  | "rule_application"
  | "corpus_pattern"
  | "external_verified"
  | "ai_hypothesis"
  | "human_expert_inference";

export type CanonicalPricingUnderlyingCostBillingMode =
  | "separately_billed_pass_through"
  | "bundled_into_merchant_price"
  | "mixed_by_scope"
  | "no_active_processing"
  | "unknown";

export type CanonicalPricingMerchantPriceScheduleShape =
  | "uniform_flat_percentage"
  | "scope_specific_flat_percentage"
  | "qualification_tier_ladder"
  | "rate_plus_per_item"
  | "fixed_plus_variable"
  | "subscription_membership"
  | "minimum_based"
  | "composite_multi_component"
  | "custom_or_other"
  | "no_active_processing"
  | "unknown";

export type CanonicalPricingScopeUniformity =
  | "uniform"
  | "uniform_with_explicit_exceptions"
  | "scope_specific"
  | "no_active_processing"
  | "unresolved";

export type CanonicalPricingFormulaCoverageStatus =
  | "complete_for_admitted_active_populations"
  | "partial_observed_components"
  | "unresolved"
  | "not_applicable_no_active_processing";

export type CanonicalPricingFormulaRelationship =
  | "additive"
  | "minimum_floor"
  | "included_in_subscription"
  | "mutually_exclusive_tier"
  | "unresolved";

export type CanonicalPricingActivityStatus =
  | "active_settled"
  | "refund_or_credit"
  | "fee_only"
  | "inactive_informational"
  | "unknown";

export type CanonicalPricingComponentKind =
  | "percentage"
  | "basis_points"
  | "per_item"
  | "fixed"
  | "minimum"
  | "subscription"
  | "bundled"
  | "pass_through"
  | "custom"
  | "unknown";

export type CanonicalPricingComponentPresenceStatus =
  | "observed_nonzero"
  | "explicitly_zero"
  | "absent_from_complete_source"
  | "not_observable";

export type CanonicalPricingComponentBasisType =
  | "volume"
  | "transaction_count"
  | "fixed_period"
  | "minimum_floor"
  | "subscription_period"
  | "underlying_cost_occurrence"
  | "unknown";

export type CanonicalPricingApplicability = "active" | "inactive_informational" | "unknown";
export type CanonicalPricingDimension = {
  kind: string;
  value: string;
  evidenceRefs: string[];
};

export type CanonicalPricingAxisConclusion<T> = {
  id: string;
  status: CanonicalEconomicsV2Availability;
  value: T | null;
  confidence: CanonicalPricingConfidence;
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  evidenceRefs: string[];
  occurrenceRefs: string[];
  limitations: string[];
};

export type CanonicalPricingPopulation = {
  id: string;
  activityStatus: CanonicalPricingActivityStatus;
  scopeRole: "standard" | "dominant" | "explicit_exception";
  scopeRoleEvidenceRefs: string[];
  dimensionValues: CanonicalPricingDimension[];
  sourcePopulationRefs: string[];
  sourceOccurrenceRefs: string[];
  underlyingCostOccurrenceRefs: string[];
  observedVolume: MoneyAmount | null;
  observedVolumeFactRef: string | null;
  observedCount: number | null;
  observedCountFactRef: string | null;
  pricingComponentRefs: string[];
  underlyingCostBillingMode: Exclude<CanonicalPricingUnderlyingCostBillingMode, "mixed_by_scope">;
  underlyingCostDerivabilityTier: CanonicalPricingDerivabilityTier;
  confidence: CanonicalPricingConfidence;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalPricingComponent = {
  id: string;
  populationRef: string;
  presenceStatus: CanonicalPricingComponentPresenceStatus;
  componentKind: CanonicalPricingComponentKind;
  basisType: CanonicalPricingComponentBasisType;
  basisPopulationKind: string | null;
  basisFactRef: string | null;
  appliedBaseAmount: MoneyAmount | null;
  appliedCount: number | null;
  rate: DecimalString | null;
  printedRate: DecimalString | null;
  printedRateUnit: "decimal" | "percent" | "basis_points" | null;
  perItemAmount: MoneyAmount | null;
  fixedAmount: MoneyAmount | null;
  minimumAmount: MoneyAmount | null;
  observedAmount: MoneyAmount | null;
  applicability: CanonicalPricingApplicability;
  formulaRelationship: CanonicalPricingFormulaRelationship;
  derivabilityTier: CanonicalPricingDerivabilityTier;
  confidence: CanonicalPricingConfidence;
  assertionBasis: CanonicalPricingAssertionBasis;
  evidenceRefs: string[];
  occurrenceRefs: string[];
  limitations: string[];
};

export type CanonicalPricingScopeModel = {
  id: string;
  populationRef: string;
  componentRefs: string[];
  relatedPopulationRefs: string[];
  formulaRelationship: CanonicalPricingFormulaRelationship;
  formulaCoverageStatus: CanonicalPricingFormulaCoverageStatus;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalPricingStructuralMapping = {
  id: string;
  mappingKind: "acceptance_program" | "custom";
  dimensionKind: string;
  dimensionValue: string;
  state: "admitted" | "requires_admitted_mapping" | "unresolved";
  derivabilityTier: CanonicalPricingDerivabilityTier;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalPricingDerivedHumanSummaryCode =
  | "interchange_plus_cost_plus"
  | "interchange_plus_scope_specific"
  | "tiered_bundled"
  | "flat_blended_bundled"
  | "scope_specific_bundled"
  | "hybrid_scope_specific"
  | "subscription_pricing"
  | "minimum_based_pricing"
  | "other_pricing_structure"
  | "current_period_pricing_not_observable"
  | "unknown_limited_analysis";

export type CanonicalPricingDerivedHumanSummary = {
  canonical: false;
  code: CanonicalPricingDerivedHumanSummaryCode;
  inputAxisRefs: [string, string, string];
  derivabilityTier: "deterministically_derivable_from_statement";
  independentEvidenceRefs: [];
  limitations: string[];
};

export type CanonicalPricingSemanticAmendmentId =
  | "RC-AMEND-001-INDEPENDENT-PRICING-AXES"
  | "RC-AMEND-002-POPULATION-SCOPED-PRICING"
  | "RC-AMEND-003-ACTIVITY-GATED-PRICING"
  | "RC-AMEND-004-EVIDENCE-BOUND-COMPONENTS"
  | "RC-AMEND-005-NONCANONICAL-PRICING-SUMMARY";

export type CanonicalPricingSemanticAmendment = {
  id: CanonicalPricingSemanticAmendmentId;
  pricingRefs: string[];
  reason: string;
};

export type CanonicalPricingAdmissionProfile = {
  source: "approved_synthetic" | "versioned_template" | "observational";
  pricingAdmissionId: string;
  populationSemanticsProven: boolean;
  pricingCoverageProven: boolean;
  underlyingCostRolesProven: boolean;
  formulaRelationshipsProven: boolean;
  noActiveProcessingProven: boolean;
  noActiveProcessingEvidenceRefs: string[];
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2PricingArchitecture = {
  foundationSchemaVersion: CanonicalEconomicsV2Foundation["versionManifest"]["schemaVersion"];
  sourceDocumentRef: string;
  admissionProfile: CanonicalPricingAdmissionProfile;
  pricingPopulations: CanonicalPricingPopulation[];
  underlyingCostBillingMode: CanonicalPricingAxisConclusion<CanonicalPricingUnderlyingCostBillingMode>;
  merchantPriceScheduleShape: CanonicalPricingAxisConclusion<CanonicalPricingMerchantPriceScheduleShape>;
  scopeUniformity: CanonicalPricingAxisConclusion<CanonicalPricingScopeUniformity>;
  scopeModels: CanonicalPricingScopeModel[];
  observedPricingComponents: CanonicalPricingComponent[];
  structuralMappings: CanonicalPricingStructuralMapping[];
  formulaCoverageStatus: CanonicalPricingFormulaCoverageStatus;
  derivedHumanSummary: CanonicalPricingDerivedHumanSummary;
  confidence: CanonicalPricingConfidence;
  derivabilityTier: CanonicalPricingDerivabilityTier;
  contractConfirmationRequired: boolean;
  opacityState: "transparent" | "partially_transparent" | "structurally_opaque" | "unknown";
  evidenceRefs: string[];
  limitations: string[];
  assertionBasis: CanonicalPricingAssertionBasis;
  semanticAmendments: CanonicalPricingSemanticAmendment[];
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalEconomicsV2PricingVersionManifest = {
  schemaVersion: "canonical_economics_v2_pricing_architecture_v1";
  builderVersion: "canonical_economics_v2_pricing_builder_v1";
  pricingPopulationPolicyVersion: "canonical_pricing_populations_v2_v1";
  pricingAxisPolicyVersion: "canonical_pricing_axes_v2_v1";
  pricingFormulaPolicyVersion: "canonical_pricing_formula_v2_v1";
  derivedSummaryPolicyVersion: "canonical_pricing_summary_projection_v2_v1";
  authority: "shadow_non_authoritative";
  persistence: "none";
  customerExposure: "none";
  aiResearchAuthority: "prohibited";
  reportAuthority: "prohibited";
};

export type CanonicalEconomicsV2PricingAnalysis = {
  versionManifest: CanonicalEconomicsV2PricingVersionManifest;
  foundation: CanonicalEconomicsV2Foundation;
  pricingArchitecture: CanonicalEconomicsV2PricingArchitecture;
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalPricingComparisonItem = {
  fact: string;
  classification: CanonicalEconomicsV2DifferenceClassification;
  amendmentId: CanonicalPricingSemanticAmendmentId | null;
  reasonCode: string;
};

export type CanonicalPricingComparisonReport = {
  policyVersion: "canonical_legacy_v2_pricing_shadow_comparison_v1";
  sourceDocumentRef: string;
  items: CanonicalPricingComparisonItem[];
  counts: Record<CanonicalEconomicsV2DifferenceClassification, number>;
  hasUnexpectedDivergence: boolean;
};
