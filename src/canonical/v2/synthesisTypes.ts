import type { MoneyAmount } from "../types.js";
import type {
  CanonicalEconomicCostBucketKind,
  CanonicalEconomicControlDimension,
  CanonicalEconomicsV2EconomicAnalysis,
} from "./economicTypes.js";
import type {
  CanonicalPricingAssertionBasis,
  CanonicalPricingConfidence,
  CanonicalPricingDerivabilityTier,
} from "./pricingTypes.js";
import type { CanonicalEconomicsV2DifferenceClassification } from "./types.js";

export type CanonicalSynthesisEvidenceClass =
  | "statement_confirmed"
  | "deterministically_derived"
  | "approved_knowledge_supported"
  | "public_documentation_verified"
  | "merchant_document_supported"
  | "multi_statement_supported"
  | "industry_inference"
  | "hypothesis_only"
  | "unresolved";

export type CanonicalSynthesisProof = {
  derivabilityTier: CanonicalPricingDerivabilityTier;
  evidenceClass: CanonicalSynthesisEvidenceClass;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence: CanonicalPricingConfidence;
  evidenceRefs: string[];
  dependencyRefs: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  limitations: string[];
};

export type CanonicalSynthesisDependencyKind =
  | "requires_external_rule_or_schedule"
  | "requires_merchant_pricing_document"
  | "requires_processor_explanation"
  | "requires_additional_statement_history"
  | "requires_versioned_source_template_admission"
  | "requires_external_source";

export type CanonicalSynthesisDependencyStatus =
  | "required"
  | "satisfied_by_admitted_evidence"
  | "conflicting"
  | "unavailable";

export type CanonicalSynthesisDependency = {
  id: string;
  kind: CanonicalSynthesisDependencyKind;
  status: CanonicalSynthesisDependencyStatus;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalSynthesisClaimKind =
  | "driver_population_identity"
  | "driver_cost_pool_relationship"
  | "driver_share_basis"
  | "attribution_relationship"
  | "counterfactual_target"
  | "counterfactual_alternative_condition"
  | "counterfactual_assumption"
  | "cadence_recurrence"
  | "merchant_change_right"
  | "merchant_operational_controllability"
  | "refund_population"
  | "refund_underlying_cost_return"
  | "refund_processor_pricing_return"
  | "refund_percentage_basis"
  | "refund_return_fee"
  | "refund_retained_fee"
  | "refund_scope"
  | "amex_acceptance_mapping"
  | "amex_margin_component"
  | "service_charge_observed"
  | "service_usage"
  | "service_duplication"
  | "pricing_program_flow"
  | "off_statement_presence"
  | "off_statement_absence"
  | "future_notice_term"
  | "operational_association"
  | "operational_causality"
  | "risk_population_compatibility"
  | "theme_contribution";

export type CanonicalSynthesisSemanticClaim = CanonicalSynthesisProof & {
  id: string;
  kind: CanonicalSynthesisClaimKind;
  subjectRef: string;
  claimCode: string;
  status: "supported" | "conflicting" | "unavailable";
  populationRefs: string[];
  occurrenceRefs: string[];
  chargeRefs: string[];
  pricingComponentRefs: string[];
  roleClaimRefs: string[];
  participantRefs: string[];
  costBucketKind: CanonicalEconomicCostBucketKind | null;
  moneyValue: MoneyAmount | null;
  periodStart: string | null;
  periodEnd: string | null;
  scopeCode: string | null;
  recurrenceBasis: "multi_statement" | "merchant_contract" | "verified_schedule" | null;
  occurrencesPerYear: number | null;
};

export type CanonicalSynthesisCalculationKind =
  | "exclusive_driver_allocation"
  | "driver_share"
  | "counterfactual_exact_delta"
  | "counterfactual_bounded_delta"
  | "pricing_program_net_burden";

export type CanonicalSynthesisCalculation = CanonicalSynthesisProof & {
  id: string;
  kind: CanonicalSynthesisCalculationKind;
  status: "valid" | "invalid";
  subjectRef: string;
  driverRefs: string[];
  populationRefs: string[];
  inputClaimRefs: string[];
  inputAmounts: MoneyAmount[];
  resultAmount: MoneyAmount | null;
  lowerResultAmount: MoneyAmount | null;
  upperResultAmount: MoneyAmount | null;
  allocationShares: string[];
  residualContribution: "none" | "explicitly_modeled" | null;
  annualizationFactor: number;
  periodStart: string;
  periodEnd: string;
};

export type CanonicalEconomicDriverType =
  | "premium_rewards_mix"
  | "regulated_debit"
  | "keyed_card_not_present"
  | "qualification_downgrade"
  | "international_cross_border"
  | "commercial_travel_entertainment"
  | "fixed_fee_burden"
  | "minimum_fee_burden"
  | "authorization_per_item_burden"
  | "refund_activity"
  | "dispute_activity"
  | "small_ticket"
  | "high_average_ticket"
  | "other_source_supported";

export type CanonicalEconomicDriverStatus = "supported" | "unresolved" | "unavailable";
export type CanonicalDriverPopulationPredicateCode =
  | "premium_rewards_population"
  | "regulated_debit_population"
  | "keyed_card_not_present_population"
  | "qualification_downgrade_population"
  | "international_cross_border_population"
  | "commercial_travel_entertainment_population"
  | "fixed_fee_population"
  | "minimum_fee_population"
  | "authorization_per_item_population"
  | "refund_activity_population"
  | "dispute_activity_population"
  | "small_ticket_population"
  | "high_average_ticket_population"
  | "other_source_supported_population";
export type CanonicalDriverAttributionMethod = "exclusive_partition" | "overlapping_declared" | "counterfactual_delta";
export type CanonicalDriverRelationshipType =
  | "exclusive_within_group"
  | "overlaps_with"
  | "shared_population"
  | "supersedes"
  | "superseded_by"
  | "counterfactual_attribution"
  | "unresolved";

export type CanonicalEconomicDriver = CanonicalSynthesisProof & {
  id: string;
  driverType: CanonicalEconomicDriverType;
  status: CanonicalEconomicDriverStatus;
  populationRefs: string[];
  populationPredicateCode: CanonicalDriverPopulationPredicateCode;
  sourceOccurrenceRefs: string[];
  economicChargeRefs: string[];
  pricingComponentRefs: string[];
  observedVolume: MoneyAmount | null;
  observedCount: number | null;
  observedCost: MoneyAmount | null;
  attributionMethod: CanonicalDriverAttributionMethod;
  relevantCostPoolRef: string | null;
  shareOfPopulation: string | null;
  shareOfRelevantCostPool: string | null;
  comparisonPopulationRef: string | null;
  relationshipRefs: string[];
  counterfactualRef: string | null;
  populationClaimRef: string | null;
  costPoolClaimRef: string | null;
  shareClaimRef: string | null;
  contributionStatus: "active" | "superseded" | "unresolved";
};

export type CanonicalDriverRelationship = CanonicalSynthesisProof & {
  id: string;
  relationshipType: CanonicalDriverRelationshipType;
  driverRefs: string[];
  allocationCalculationRef: string | null;
  additiveAggregationAllowed: boolean;
  relationshipClaimRef: string | null;
  residualContribution: "none" | "explicitly_modeled" | null;
};

export type CanonicalCounterfactualResultState =
  | "exact_deterministic_delta"
  | "bounded_conditional_delta"
  | "verification_only"
  | "unavailable_not_derivable";

export type CanonicalPopulationCompatibility = "compatible" | "incompatible" | "unresolved";

export type CanonicalEconomicCounterfactual = CanonicalSynthesisProof & {
  id: string;
  observedPopulationRefs: string[];
  observedChargeRefs: string[];
  observedCost: MoneyAmount | null;
  alternativePopulationRefs: string[];
  alternativeConditionCode: string | null;
  alternativeEvidenceRefs: string[];
  alternativeProvenanceId: string | null;
  populationCompatibility: CanonicalPopulationCompatibility;
  formulaCode: string | null;
  calculationRef: string | null;
  assumptions: string[];
  baselinePeriod: string | null;
  impactPeriod: string | null;
  cadenceEvidenceRefs: string[];
  recurrenceProven: boolean;
  annualized: boolean;
  relationshipRefs: string[];
  resultState: CanonicalCounterfactualResultState;
  exactDelta: MoneyAmount | null;
  lowerBound: MoneyAmount | null;
  upperBound: MoneyAmount | null;
  conditionCode: string | null;
  targetClaimRef: string | null;
  alternativeConditionClaimRef: string | null;
  assumptionClaimRefs: string[];
  cadenceClaimRef: string | null;
  lowerBoundCalculationRef: string | null;
  upperBoundCalculationRef: string | null;
};

export type CanonicalMerchantLeverState =
  | "eligible_supported"
  | "candidate_requires_verification"
  | "documentation_or_monitoring_only"
  | "not_available"
  | "unresolved";

export type CanonicalMerchantLeverType =
  | "pricing_term_change"
  | "configuration_acceptance_method_change"
  | "service_use_decision"
  | "documentation_verification"
  | "operational_process_change"
  | "monitoring_baseline";

export type CanonicalMerchantLever = CanonicalSynthesisProof & {
  id: string;
  leverType: CanonicalMerchantLeverType;
  state: CanonicalMerchantLeverState;
  driverRefs: string[];
  chargeRefs: string[];
  counterfactualRef: string | null;
  controlRoleRefs: string[];
  requiredControlDimensions: CanonicalEconomicControlDimension[];
  operationalControllabilityEvidenceRefs: string[];
  calculatedImpactState: CanonicalCounterfactualResultState | null;
  calculatedImpact: MoneyAmount | null;
  calculatedImpactLowerBound: MoneyAmount | null;
  calculatedImpactUpperBound: MoneyAmount | null;
  safeActionCode: string;
  prohibitedClaimCodes: string[];
  merchantInfluenceClaimRef: string | null;
};

export type CanonicalRefundReturnState = "returned" | "not_returned" | "mixed_by_scope" | "unresolved" | "requires_external_rule_or_schedule";
export type CanonicalRefundEconomics = CanonicalSynthesisProof & {
  status: "supported" | "unresolved" | "unavailable";
  refundVolumeFactRef: string;
  refundCountFactRef: string;
  pricingPopulationRefs: string[];
  sourceOccurrenceRefs: string[];
  returnFeeChargeRefs: string[];
  retainedFeeChargeRefs: string[];
  underlyingCostReturnState: CanonicalRefundReturnState;
  processorPricingReturnState: CanonicalRefundReturnState;
  percentagePricingBasis: "gross_sales" | "net_submitted" | "scope_specific" | "unresolved";
  fieldClaimRefs: {
    population: string | null;
    underlyingCostReturn: string | null;
    processorPricingReturn: string | null;
    percentageBasis: string | null;
    returnFee: string | null;
    retainedFee: string | null;
    scope: string | null;
  };
};

export type CanonicalAmexEconomics = CanonicalSynthesisProof & {
  status: "supported" | "unresolved" | "unavailable";
  acceptanceMode: "optblue_like" | "direct_esa_like" | "none" | "unknown";
  acceptanceModeMappingRef: string | null;
  pricingPopulationRefs: string[];
  duplicateVolumeLinkageRefs: string[];
  observedChargeRefs: string[];
  marginChargeRefs: string[];
  marginState: "proven" | "unresolved" | "unavailable";
  ownershipRoleRefs: string[];
  acceptanceClaimRef: string | null;
  marginClaimRef: string | null;
};

export type CanonicalAccountServiceState =
  | "charge_observed_usage_proven"
  | "charge_observed_usage_unknown"
  | "contract_dependent"
  | "potential_duplication_requires_evidence"
  | "off_statement_dependent"
  | "unresolved";

export type CanonicalAccountServiceEconomics = CanonicalSynthesisProof & {
  id: string;
  serviceType: "gateway" | "pci_compliance" | "equipment" | "reporting" | "account_administration" | "other";
  state: CanonicalAccountServiceState;
  chargeRefs: string[];
  participantRoleRefs: string[];
  usageEvidenceRefs: string[];
  potentiallyDuplicativeWithRefs: string[];
  chargeClaimRef: string | null;
  usageClaimRef: string | null;
  duplicationClaimRef: string | null;
};

export type CanonicalMerchantPricingProgramType = "surcharge" | "cash_discount" | "dual_pricing" | "convenience_fee" | "service_fee" | "other";
export type CanonicalMerchantPricingProgram = CanonicalSynthesisProof & {
  id: string;
  programType: CanonicalMerchantPricingProgramType;
  status: "supported" | "unresolved" | "unavailable";
  coveredPopulationRefs: string[];
  statementObservedProcessorFees: MoneyAmount | null;
  consumerFacingRevenue: MoneyAmount | null;
  merchantRetainedAmount: MoneyAmount | null;
  thirdPartyRetention: MoneyAmount | null;
  offsets: MoneyAmount | null;
  netMerchantBorneCost: MoneyAmount | null;
  netBurdenCalculationRef: string | null;
  netBurdenState: "derived_when_evidenced" | "unavailable";
  refundTreatment: string;
  flowClaimRefs: string[];
};

export type CanonicalOffStatementExposureState =
  | "observed_with_admitted_evidence"
  | "indicated_unquantified"
  | "requires_document"
  | "unknown_whether_exists"
  | "known_absent_with_evidence";

export type CanonicalOffStatementExposure = CanonicalSynthesisProof & {
  id: string;
  exposureType: "equipment_lease" | "gateway_invoice" | "termination_obligation" | "reserve" | "funding_delay_hold" | "separate_service_agreement" | "other";
  state: CanonicalOffStatementExposureState;
  observedAmount: MoneyAmount | null;
  sourceOccurrenceRefs: string[];
  stateClaimRef: string | null;
};

export type CanonicalStatementNotice = CanonicalSynthesisProof & {
  id: string;
  sourceOccurrenceRefs: string[];
  noticeDate: string | null;
  claimedEffectiveDate: string | null;
  claimType: "processor_account_change" | "claimed_network_rule" | "legal_regulatory_claim" | "other";
  verificationState: "verified" | "contradicted" | "not_independently_verified";
  analyzedPeriodApplicability: "current" | "future_candidate" | "historical" | "unresolved";
  candidateEconomicChangeCode: string | null;
  termClaimRef: string | null;
};

export type CanonicalOperationalCausalStatus = "observed_only" | "association_supported" | "causal_relationship_supported" | "unresolved";
export type CanonicalOperationalSignal = CanonicalSynthesisProof & {
  id: string;
  signalType: "authorization_pattern" | "batching_behavior" | "keyed_cnp" | "security_configuration" | "gateway_behavior" | "exception_fee_pattern" | "other";
  status: "supported" | "unresolved" | "unavailable";
  populationRefs: string[];
  observedValueCode: string;
  strength: "high" | "medium" | "low" | "unavailable";
  causalStatus: CanonicalOperationalCausalStatus;
  economicDriverRefs: string[];
  associationClaimRef: string | null;
  causalityClaimRef: string | null;
};

export type CanonicalDisputeRiskState = "no_activity_proven" | "observed_unreconciled" | "descriptive_ratios_available" | "unavailable";
export type CanonicalAccountRiskStatus = CanonicalSynthesisProof & {
  state: CanonicalDisputeRiskState;
  disputeDebitAmountFactRef: string;
  disputeDebitCountFactRef: string;
  representmentAmountFactRef: string;
  feeChargeRefs: string[];
  countDenominatorFactRef: string | null;
  valueDenominatorFactRef: string | null;
  denominatorCompatibility: CanonicalPopulationCompatibility;
  descriptiveRatioByCount: string | null;
  descriptiveRatioByValue: string | null;
  monitoringStatus: "verified" | "unresolved" | "not_applicable" | "unavailable";
  fairnessVerdict: "unavailable";
  compatibilityClaimRef: string | null;
};

export type CanonicalEconomicThemeContribution = CanonicalSynthesisProof & {
  id: string;
  status: "supported" | "unresolved";
  factRefs: string[];
  chargeRefs: string[];
  driverRefs: string[];
  signalRefs: string[];
  leverRefs: string[];
  unresolvedDependencyRefs: string[];
  materiality: "material" | "contextual" | "unresolved";
  actionabilityState: CanonicalMerchantLeverState | "not_applicable";
  priorityClass: "account_survival" | "financial_integrity" | "material_economics" | "operational_review" | "context" | "unresolved";
  semanticCoverageCodes: string[];
  claimRef: string | null;
};

export type CanonicalEconomicThemeType =
  | "pricing_structure"
  | "major_economic_driver"
  | "unresolved_cost_control"
  | "refund_economics"
  | "service_economics"
  | "operational_signal"
  | "dispute_risk_state"
  | "pricing_program_economics"
  | "off_statement_question"
  | "positive_control"
  | "other_supported_question";

export type CanonicalEconomicTheme = CanonicalSynthesisProof & {
  id: string;
  economicQuestionCode: string;
  actionBoundaryCode: string;
  themeType: CanonicalEconomicThemeType;
  factRefs: string[];
  chargeRefs: string[];
  driverRefs: string[];
  signalRefs: string[];
  leverRefs: string[];
  unresolvedDependencyRefs: string[];
  materiality: "material" | "contextual" | "unresolved";
  actionabilityState: CanonicalMerchantLeverState | "not_applicable";
  priorityClass: "account_survival" | "financial_integrity" | "material_economics" | "operational_review" | "context" | "unresolved";
  projectionPermission: "structured_only_no_customer_prose";
  semanticCoverageCodes: string[];
  contributions: CanonicalEconomicThemeContribution[];
};

export type CanonicalSynthesisSemanticAmendmentId =
  | "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY"
  | "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION"
  | "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL"
  | "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER"
  | "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS"
  | "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION"
  | "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY"
  | "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS";

export type CanonicalSynthesisSemanticAmendment = {
  id: CanonicalSynthesisSemanticAmendmentId;
  synthesisRefs: string[];
  reason: string;
};

export type CanonicalEconomicsV2SynthesisVersionManifest = {
  schemaVersion: "canonical_economics_v2_synthesis_analysis_v1";
  builderVersion: "canonical_economics_v2_synthesis_builder_v1";
  attributionPolicyVersion: "canonical_economic_attribution_v2_v1";
  counterfactualPolicyVersion: "canonical_economic_counterfactual_v2_v1";
  leverPolicyVersion: "canonical_merchant_lever_v2_v1";
  themePolicyVersion: "canonical_economic_theme_v2_v1";
  authority: "shadow_non_authoritative";
  persistence: "none";
  customerExposure: "none";
  aiResearchAuthority: "prohibited";
  reportAuthority: "prohibited";
  accountSavingsAuthority: "prohibited";
  knowledgeResolutionAuthority: "prohibited";
};

export type CanonicalEconomicsV2SynthesisLayer = {
  economicSchemaVersion: CanonicalEconomicsV2EconomicAnalysis["versionManifest"]["schemaVersion"];
  dependencies: CanonicalSynthesisDependency[];
  claims: CanonicalSynthesisSemanticClaim[];
  calculations: CanonicalSynthesisCalculation[];
  drivers: CanonicalEconomicDriver[];
  attributionRelationships: CanonicalDriverRelationship[];
  counterfactuals: CanonicalEconomicCounterfactual[];
  merchantLevers: CanonicalMerchantLever[];
  refundEconomics: CanonicalRefundEconomics;
  amexEconomics: CanonicalAmexEconomics;
  accountServices: CanonicalAccountServiceEconomics[];
  merchantPricingPrograms: CanonicalMerchantPricingProgram[];
  offStatementExposures: CanonicalOffStatementExposure[];
  notices: CanonicalStatementNotice[];
  operationalSignals: CanonicalOperationalSignal[];
  accountRisk: CanonicalAccountRiskStatus;
  themes: CanonicalEconomicTheme[];
  semanticAmendments: CanonicalSynthesisSemanticAmendment[];
  limitations: string[];
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalEconomicsV2SynthesisAnalysis = {
  versionManifest: CanonicalEconomicsV2SynthesisVersionManifest;
  economicAnalysis: CanonicalEconomicsV2EconomicAnalysis;
  synthesisLayer: CanonicalEconomicsV2SynthesisLayer;
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalSynthesisComparisonItem = {
  fact: string;
  classification: CanonicalEconomicsV2DifferenceClassification;
  amendmentId: CanonicalSynthesisSemanticAmendmentId | null;
  reasonCode: string;
};

export type CanonicalSynthesisComparisonReport = {
  policyVersion: "canonical_legacy_v2_synthesis_shadow_comparison_v1";
  items: CanonicalSynthesisComparisonItem[];
  counts: Record<CanonicalEconomicsV2DifferenceClassification, number>;
  hasUnexpectedDivergence: boolean;
};

export type CanonicalSynthesisPrivacySafeDiagnostics = {
  schemaVersion: CanonicalEconomicsV2SynthesisVersionManifest["schemaVersion"];
  validationStatus: "valid" | "invalid";
  driverCounts: Record<CanonicalEconomicDriverStatus, number>;
  overlapRefusalCount: number;
  counterfactualCounts: Record<CanonicalCounterfactualResultState, number>;
  leverCounts: Record<CanonicalMerchantLeverState, number>;
  dependencyCount: number;
  unresolvedDependencyCount: number;
  signalCount: number;
  themeCount: number;
  amendmentCounts: Record<CanonicalSynthesisSemanticAmendmentId, number>;
  comparisonCounts: Record<CanonicalEconomicsV2DifferenceClassification, number> | null;
  hasUnexpectedDivergence: boolean;
};
