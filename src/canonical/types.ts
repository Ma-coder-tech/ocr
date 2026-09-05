export type CurrencyCode = "USD";

export type MoneyAmount = {
  amountMinor: number;
  currency: CurrencyCode;
};

export type DecimalString = string;
export type CountValue = number;

export type CanonicalFactStatus = "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
export type CanonicalConfidence = "high" | "medium" | "low" | "needs_review";

export type CanonicalFactCandidateRole =
  | "statement_level_total"
  | "processor_summary_total"
  | "section_subtotal"
  | "fee_bucket_total"
  | "interchange_detail_total"
  | "funding_formula_result"
  | "card_type_total"
  | "user_supplied"
  | "merchant_declaration"
  | "account_coding"
  | "legacy_summary"
  | "unknown";

export type CanonicalExtractionMethod = "pdf_text" | "document_ir" | "ocr" | "csv" | "manual_input" | "reference_registry" | "legacy";

export type CanonicalFactCandidate<T> = {
  id: string;
  role: CanonicalFactCandidateRole;
  value: T;
  evidenceRefs: string[];
  parserId: string | null;
  parserVersion: string | null;
  extractionMethod: CanonicalExtractionMethod;
  confidence: CanonicalConfidence;
  selected: boolean;
  selectionReason: string | null;
  rejectionReason: string | null;
};

export type CanonicalFactValue<T> = {
  value: T | null;
  status: CanonicalFactStatus;
  confidence: CanonicalConfidence | null;
  selectedCandidateId?: string | null;
  evidenceRefs: string[];
  calculationRef?: string;
  selectionReason: string | null;
  candidates: CanonicalFactCandidate<T>[];
  limitations: string[];
};

export type CanonicalEvidenceSourceRole =
  | "selected_fact"
  | "rejected_candidate"
  | "fee_row"
  | "control_total"
  | "calculation_input"
  | "parser_interpretation"
  | "merchant_declaration"
  | "account_coding"
  | "benchmark_reference"
  | "advanced_review_diagnostic";

export type CanonicalEvidenceRecord = {
  id: string;
  documentId: string;
  pageNumber: number | null;
  section: string | null;
  lineId: string | null;
  rowIndex: number | null;
  extractedText: string | null;
  normalizedText: string | null;
  sourceRole: CanonicalEvidenceSourceRole;
  confidence: Exclude<CanonicalConfidence, "needs_review">;
  extractionObservations: CanonicalExtractionObservation[];
  parserInterpretations: CanonicalParserInterpretation[];
  customerSafe: {
    excerpt: string | null;
    redactionApplied: boolean;
  };
};

export type CanonicalExtractionObservation = {
  id: string;
  evidenceRef: string;
  extractionMethod: CanonicalExtractionMethod;
  extractionVersion: string;
  observedText: string | null;
  confidence: Exclude<CanonicalConfidence, "needs_review">;
};

export type CanonicalParserInterpretation = {
  id: string;
  evidenceRef: string;
  extractionObservationRef: string | null;
  parserId: string | null;
  parserVersion: string | null;
  interpretedRole: string;
  interpretedValue: MoneyAmount | DecimalString | CountValue | string | null;
  confidence: CanonicalConfidence;
};

export type TransactionCountType =
  | "submitted_transactions"
  | "settled_transactions"
  | "authorizations"
  | "captures"
  | "refunds"
  | "chargebacks"
  | "network_transactions"
  | "card_type_items"
  | "audit_specific"
  | "unknown";

export type CanonicalTransactionCounts = {
  submittedTransactions: CanonicalFactValue<CountValue | null>;
  settledTransactions: CanonicalFactValue<CountValue | null>;
  authorizations: CanonicalFactValue<CountValue | null>;
  captures: CanonicalFactValue<CountValue | null>;
  refunds: CanonicalFactValue<CountValue | null>;
  chargebacks: CanonicalFactValue<CountValue | null>;
  networkTransactions: CanonicalFactValue<CountValue | null>;
  cardTypeItems: CanonicalFactValue<CountValue | null>;
  auditSpecificCounts: CanonicalFactValue<CountValue | null>;
  unknownCounts: CanonicalFactValue<CountValue | null>;
};

export type CanonicalVolumePopulation =
  | "submitted_sales"
  | "settled_sales"
  | "gross_sales"
  | "net_sales_after_refunds"
  | "processor_reported_volume"
  | "unsupported"
  | "unknown";

export type CanonicalAverageTicketBasis = {
  selectedCountType: TransactionCountType | null;
  selectedVolumePopulation: CanonicalVolumePopulation;
  allowed: boolean;
  reason: string;
  evidenceRefs: string[];
  calculationRef?: string;
};

export type CanonicalEffectiveRateBasis = {
  policyVersion: "effective_rate_basis_v1";
  numeratorFeeBasis:
    | "all_in_processing_fees"
    | "processing_fees_excluding_equipment"
    | "processor_controlled_fees_only"
    | "statement_reported_rate"
    | "unsupported";
  denominatorVolumeBasis: CanonicalVolumePopulation;
  refundsTreatment: "included" | "deducted" | "excluded" | "not_present" | "unknown";
  cashAdvanceTreatment: "included" | "excluded" | "not_present" | "unknown";
  equipmentFeeTreatment: "included" | "excluded" | "not_present" | "unknown";
  chargebackTreatment: "included" | "excluded" | "not_present" | "unknown";
  oneTimeFeeTreatment: "included" | "excluded" | "not_present" | "unknown";
  populationCompatibility: "compatible" | "incompatible" | "not_evaluated";
  rateSource: "ratereveal_calculated" | "processor_stated" | "both" | "unavailable";
  processorStatedRate: CanonicalFactValue<DecimalString | null>;
  calculationRef?: string;
  explanation: string;
};

export type CanonicalCalculationRecord = {
  id: string;
  formulaCode:
    | "ratereveal_all_in_effective_rate"
    | "average_ticket"
    | "canonical_fee_unique_total"
    | "opportunity_observed_minus_target"
    | "opportunity_monthly_delta_times_12"
    | "opportunity_annual_delta"
    | "opportunity_component_sum"
    | "benchmark_rate_position";
  formulaVersion: string;
  inputs: Array<{
    label: string;
    value: MoneyAmount | CountValue | DecimalString | null;
    unit: "money" | "count" | "decimal_rate";
    evidenceRefs: string[];
  }>;
  result: MoneyAmount | DecimalString | null;
  unit: "money" | "decimal_rate";
  roundingPolicy: string;
};

export type CanonicalFeeRowRole =
  | "individual_charge"
  | "section_subtotal"
  | "fee_bucket_total"
  | "statement_control_total"
  | "interchange_detail_row"
  | "informational_rate_row"
  | "zero_dollar_reference_row"
  | "adjustment"
  | "credit"
  | "duplicate_representation"
  | "supporting_evidence_only"
  | "unknown_unresolved";

export type CanonicalRateRepresentation = "percent_points" | "decimal_fraction" | "basis_points" | "unknown";

export type CanonicalPrintedRate = {
  original: string;
  numericValue: DecimalString;
  displayedDecimalPlaces: number;
  representation: CanonicalRateRepresentation;
  normalizedFractionalRate: DecimalString | null;
};

export type CanonicalFeeSourceOccurrence = {
  id: string;
  evidenceRef: string;
  documentId: string;
  pageNumber: number | null;
  section: string | null;
  lineId: string | null;
  rowIndex: number | null;
  normalizedSourceText: string | null;
};

export type CanonicalFeeParserInterpretation = {
  id: string;
  sourceOccurrenceId: string;
  parserId: string | null;
  parserVersion: string | null;
  label: string;
  amount: MoneyAmount | null;
  signedAmount: MoneyAmount | null;
  rowRole: CanonicalFeeRowRole;
  section: string | null;
  pageNumber: number | null;
  printedRate: CanonicalPrintedRate | null;
  printedPerItemRate: CanonicalPrintedRate | null;
  itemCount: CountValue | null;
  volume: MoneyAmount | null;
  bucket?: string | null;
  sourceTypeCode?: string | null;
  confidence: CanonicalConfidence;
};

export type CanonicalFeeMergeReason =
  | "same_source_occurrence"
  | "same_evidence_and_amount"
  | "control_or_subtotal_excluded"
  | "zero_amount_excluded"
  | "ambiguous_similarity_unresolved";

export type CanonicalFeeContributionReasonCode =
  | "individual_charge_included"
  | "signed_adjustment_included"
  | "signed_credit_included"
  | "pass_through_fee_charge_included"
  | "zero_amount_excluded"
  | "subtotal_or_control_excluded"
  | "rate_only_excluded"
  | "duplicate_representation_excluded"
  | "supporting_evidence_only_excluded"
  | "interchange_without_control_coverage"
  | "interchange_without_fee_section"
  | "interchange_without_printed_amount"
  | "interchange_amount_sign_untrusted"
  | "unresolved_amount_conflict"
  | "unknown_role_excluded";

export type CanonicalFeeContributionDecision = {
  contributes: boolean;
  reasonCode: CanonicalFeeContributionReasonCode;
  controlRefs: string[];
  evidenceRefs: string[];
  signedAmountBasis:
    | "fee_charge_magnitude"
    | "printed_signed_amount"
    | "parser_amount"
    | "not_applicable"
    | "unresolved";
  grossNetBasis: "fee_charge_gross" | "signed_net" | "not_applicable" | "unknown";
  confidence: CanonicalConfidence;
  limitations: string[];
};

export type CanonicalFeeRow = {
  id: string;
  role: CanonicalFeeRowRole;
  sourceOccurrenceIds: string[];
  parserInterpretationIds: string[];
  selectedLabel: string;
  selectedAmount: MoneyAmount | null;
  signedAmount: MoneyAmount | null;
  contributesToUniqueTotal: boolean;
  contributionDecision: CanonicalFeeContributionDecision;
  mergeReason: CanonicalFeeMergeReason | null;
  mergeConfidence: CanonicalConfidence;
  rejectedAmountCandidates: Array<{
    amount: MoneyAmount;
    interpretationId: string;
    reason: string;
  }>;
  limitations: string[];
};

export type CanonicalFeeCategory =
  | "interchange"
  | "card_brand_network_assessment"
  | "network_access_or_authorization"
  | "processor_markup"
  | "processor_per_item_fee"
  | "administrative_fee"
  | "service_fee"
  | "compliance_fee"
  | "equipment_or_lease"
  | "third_party_product"
  | "chargeback_or_dispute"
  | "funding_adjustment"
  | "tax_or_government"
  | "credit"
  | "unknown_needs_review";

export type CanonicalFeeParty =
  | "network"
  | "card_brand"
  | "issuer_or_interchange"
  | "processor"
  | "third_party"
  | "merchant_contract"
  | "tax_or_government"
  | "unknown";

export type CanonicalFeeActionability = "potentially_actionable" | "verify_only" | "not_actionable" | "unknown";

export type CanonicalFeeDocumentationRequirement =
  | "none"
  | "recommended"
  | "required_for_authority"
  | "required_for_savings"
  | "blocking";

export type CanonicalFeeClassificationSourceType =
  | "deterministic_rule"
  | "safe_default"
  | "human_override"
  | "ai_suggestion";

export type CanonicalFeeClassificationConfidence = "high" | "medium" | "low";

export type CanonicalFeeOwnership = {
  collector: CanonicalFeeParty;
  economicBeneficiary: CanonicalFeeParty;
  contractualController: CanonicalFeeParty;
};

export type CanonicalFeeRuleReference = {
  referenceId: string;
  version: string;
  applicableProcessorOrNetwork: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceProvenance: string;
  requiredMatchingFields: string[];
  negativePatterns: string[];
  periodApplicable: boolean;
};

export type CanonicalFeeClassificationCandidate = {
  id: string;
  feeRowId: string;
  category: CanonicalFeeCategory;
  ownership: CanonicalFeeOwnership;
  actionabilityCeiling: CanonicalFeeActionability;
  documentationRequirement: CanonicalFeeDocumentationRequirement;
  confidence: CanonicalFeeClassificationConfidence;
  sourceType: CanonicalFeeClassificationSourceType;
  ruleId: string;
  ruleVersion: string;
  ruleProvenance: string;
  evidenceRefs: string[];
  reference: CanonicalFeeRuleReference | null;
  authoritative: boolean;
  reason: string;
  permissionConsequences: string[];
  limitations: string[];
};

export type CanonicalFeeClassificationConflictStatus =
  | "none"
  | "unresolved"
  | "resolved_by_stronger_evidence"
  | "requires_human_review";

export type CanonicalFeeSelectedClassification = {
  candidateId: string;
  category: CanonicalFeeCategory;
  ownership: CanonicalFeeOwnership;
  actionabilityCeiling: CanonicalFeeActionability;
  documentationRequirement: CanonicalFeeDocumentationRequirement;
  confidence: CanonicalFeeClassificationConfidence;
  selectionReason: string;
  rejectedCandidateIds: string[];
};

export type CanonicalFeeClassificationResolution = {
  feeRowId: string;
  selected: CanonicalFeeSelectedClassification;
  candidates: CanonicalFeeClassificationCandidate[];
  conflictStatus: CanonicalFeeClassificationConflictStatus;
  conflictReason: string | null;
};

export type CanonicalFeeSpreadAssertionStatus = "suspected" | "proven" | "rejected";

export type CanonicalFeeSpreadAssertion = {
  id: string;
  baseFeeRowId: string;
  status: CanonicalFeeSpreadAssertionStatus;
  owner: CanonicalFeeParty;
  actionabilityCeiling: CanonicalFeeActionability;
  evidenceRefs: string[];
  reference: CanonicalFeeRuleReference | null;
  reason: string;
  authoritative: boolean;
};

export type CanonicalFeeHumanOverrideScope = "statement_specific" | "reusable_rule_candidate";

export type CanonicalFeeHumanOverrideRecord = {
  id: string;
  feeRowId: string;
  reviewerId: string;
  reviewedAt: string;
  evidenceRefs: string[];
  reason: string;
  previousClassification: CanonicalFeeSelectedClassification;
  newClassification: CanonicalFeeSelectedClassification;
  scope: CanonicalFeeHumanOverrideScope;
  supersedesOverrideId: string | null;
  supersededByOverrideId: string | null;
  reusableRuleCreated: false;
};

export type CanonicalFeeAiSuggestion = {
  id: string;
  feeRowId: string;
  provider: string | null;
  model: string | null;
  suggestedCategory: CanonicalFeeCategory;
  suggestedOwnership: CanonicalFeeOwnership;
  suggestedActionabilityCeiling: CanonicalFeeActionability;
  confidence: CanonicalFeeClassificationConfidence;
  reasonCodes: string[];
  safeEvidenceRefs: string[];
  sanitizedExplanation: string;
  authoritative: false;
};

export type CanonicalFeeOwnershipActionability = {
  policyVersion: "fee_ownership_actionability_v1";
  taxonomyVersion: "fee_taxonomy_v1";
  ruleRegistryVersion: "fee_ownership_rules_v1";
  aiSuggestionPolicyVersion: "fee_ai_suggestion_policy_v1";
  humanOverridePolicyVersion: "fee_human_override_policy_v1";
  status: "available" | "partial" | "unavailable";
  rowClassifications: CanonicalFeeClassificationResolution[];
  spreadAssertions: CanonicalFeeSpreadAssertion[];
  aiSuggestions: CanonicalFeeAiSuggestion[];
  humanOverrides: CanonicalFeeHumanOverrideRecord[];
  limitations: string[];
};

export type CanonicalOpportunityEligibility = "deterministic" | "approved_estimate" | "verification_only" | "excluded";
export type CanonicalOpportunityInclusionStatus = "included" | "excluded" | "superseded";
export type CanonicalOpportunityKind =
  | "fee_row_review"
  | "fee_removal"
  | "rate_repricing"
  | "per_item_repricing"
  | "hidden_processor_spread"
  | "benchmark_concern";

export type CanonicalOpportunityCadenceValue = "monthly" | "annual" | "statement_frequency" | "one_time" | "unknown";
export type CanonicalOpportunityCadenceProof =
  | "fee_label_explicit"
  | "contract"
  | "processor_documentation"
  | "statement_notice"
  | "multiple_statements"
  | "not_proven";

export type CanonicalOpportunityCadence = {
  value: CanonicalOpportunityCadenceValue;
  proven: boolean;
  annualizationAllowed: boolean;
  frequencyPerYear: number | null;
  proof: CanonicalOpportunityCadenceProof;
  evidenceRefs: string[];
  reason: string;
  aiSourced: false;
};

export type CanonicalOpportunityTargetEvidenceSource =
  | "merchant_contract"
  | "processor_pricing_schedule"
  | "written_processor_confirmation"
  | "statement_notice"
  | "authoritative_network_government_regulatory"
  | "ratereveal_policy"
  | "benchmark_registry"
  | "none";

export type CanonicalOpportunityTargetProvenance = {
  sourceType: CanonicalOpportunityTargetEvidenceSource;
  referenceId: string | null;
  version: string | null;
  policyOwner: string | null;
  reviewer: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  applicableProcessor: string | null;
  applicableBusinessType: string | null;
  applicableChannel: string | null;
  applicableCardEnvironment: string | null;
  methodology: string | null;
  limitations: string[];
  opportunityApproved: boolean;
  authoritativeForDeterministic: boolean;
  approvedForEstimate: boolean;
  evidenceRefs: string[];
  aiSourced: false;
};

export type CanonicalOpportunityMonetaryTarget = {
  type: "monetary";
  amount: MoneyAmount;
  unit: "monthly_charge" | "annual_charge" | "statement_charge";
  aiSourced: false;
};

export type CanonicalOpportunityRateTarget = {
  type: "rate";
  rate: DecimalString;
  representation: Exclude<CanonicalRateRepresentation, "unknown">;
  populationRef: string;
  aiSourced: false;
};

export type CanonicalOpportunityPerItemTarget = {
  type: "per_item";
  amount: MoneyAmount;
  unit: "per_authorization" | "per_transaction" | "per_item";
  populationRef: string;
  aiSourced: false;
};

export type CanonicalOpportunityZeroRemovalTarget = {
  type: "zero_removal";
  removalCondition: string;
  proofEvidenceRefs: string[];
  aiSourced: false;
};

export type CanonicalOpportunityModelMonetaryTarget = {
  type: "model_monetary";
  modelId: string;
  modelVersion: string;
  amount: MoneyAmount;
  unit: "monthly_amount" | "annual_amount" | "statement_amount";
  aiSourced: false;
};

export type CanonicalOpportunityModelRateTarget = {
  type: "model_rate";
  modelId: string;
  modelVersion: string;
  rate: DecimalString;
  representation: Exclude<CanonicalRateRepresentation, "unknown">;
  populationRef: string;
  aiSourced: false;
};

export type CanonicalOpportunityModelPerItemTarget = {
  type: "model_per_item";
  modelId: string;
  modelVersion: string;
  amount: MoneyAmount;
  unit: "per_authorization" | "per_transaction" | "per_item";
  populationRef: string;
  aiSourced: false;
};

export type CanonicalOpportunityNoTarget = {
  type: "none";
  reason: string;
  aiSourced: false;
};

export type CanonicalOpportunityTarget =
  | CanonicalOpportunityMonetaryTarget
  | CanonicalOpportunityRateTarget
  | CanonicalOpportunityPerItemTarget
  | CanonicalOpportunityZeroRemovalTarget
  | CanonicalOpportunityModelMonetaryTarget
  | CanonicalOpportunityModelRateTarget
  | CanonicalOpportunityModelPerItemTarget
  | CanonicalOpportunityNoTarget;

export type CanonicalOpportunityFeeRowRef = {
  feeRowId: string;
  role: "base" | "supporting" | "overlap";
  classificationCandidateId: string;
};

export type CanonicalOpportunityObservedAmount = {
  amount: MoneyAmount;
  source: "canonical_fee_row" | "canonical_spread_calculation";
  evidenceRefs: string[];
  aiSourced: false;
};

export type CanonicalOpportunityCalculation = {
  calculationRef: string | null;
  formulaCode:
    | "none_not_eligible"
    | "opportunity_observed_minus_target"
    | "opportunity_monthly_delta_times_12"
    | "opportunity_annual_delta"
    | "opportunity_component_sum";
  formulaVersion: "canonical_opportunity_formula_v1";
  inputRefs: string[];
  result: MoneyAmount | null;
  resultUnit: "money";
  annualized: boolean;
  evidenceRefs: string[];
  aiSourced: false;
};

export type CanonicalOpportunityOverlap = {
  aggregationKey: string;
  exclusiveGroupKey: string | null;
  supersedesComponentIds: string[];
  supersededByComponentId: string | null;
  overlapsWithComponentIds: string[];
  resolution: "none" | "deduped_by_key" | "superseded" | "requires_review";
  reason: string | null;
};

export type CanonicalOpportunityComponent = {
  id: string;
  policyVersion: "canonical_opportunity_engine_v1";
  kind: CanonicalOpportunityKind;
  eligibility: CanonicalOpportunityEligibility;
  inclusionStatus: CanonicalOpportunityInclusionStatus;
  feeRowRefs: CanonicalOpportunityFeeRowRef[];
  ownership: CanonicalFeeOwnership;
  actionabilityCeiling: CanonicalFeeActionability;
  observedAmount: CanonicalOpportunityObservedAmount | null;
  target: CanonicalOpportunityTarget;
  targetProvenance: CanonicalOpportunityTargetProvenance;
  cadence: CanonicalOpportunityCadence;
  calculation: CanonicalOpportunityCalculation;
  overlap: CanonicalOpportunityOverlap;
  confidence: "high" | "medium" | "low";
  inclusionReasonCodes: string[];
  exclusionReasonCodes: string[];
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalOpportunitySummary = {
  deterministicEligibleAnnualAmount: MoneyAmount;
  approvedEstimatedAnnualAmount: MoneyAmount;
  totalEligibleAnnualAmount: MoneyAmount;
  verificationOnlyObservedAmount: MoneyAmount;
  excludedObservedAmount: MoneyAmount;
  nonAnnualizedObservedAmount: MoneyAmount;
  masterSavingsAnnualAmount: MoneyAmount;
  deterministicComponentIds: string[];
  approvedEstimatedComponentIds: string[];
  verificationOnlyComponentIds: string[];
  excludedComponentIds: string[];
  nonAnnualizedComponentIds: string[];
  supersededComponentIds: string[];
  summaryCalculationRefs: string[];
  limitations: string[];
};

export type CanonicalOpportunityEngine = {
  policyVersion: "canonical_opportunity_engine_v1";
  targetPolicyVersion: "opportunity_target_policy_v1";
  cadencePolicyVersion: "opportunity_cadence_policy_v1";
  benchmarkPolicyVersion: "opportunity_benchmark_policy_v1";
  aiBoundaryPolicyVersion: "opportunity_ai_boundary_policy_v1";
  status: "available" | "partial" | "unavailable";
  components: CanonicalOpportunityComponent[];
  summary: CanonicalOpportunitySummary;
  limitations: string[];
};

export type CanonicalAiCapabilityId =
  | "full_statement_anomaly_review"
  | "whole_statement_fee_intelligence_review"
  | "fee_classification_review"
  | "notice_change_review"
  | "benchmark_category_review"
  | "merchant_narrative"
  | "document_quality_review";

export type CanonicalAiCapabilityStatus =
  | "completed"
  | "completed_diagnostic"
  | "not_needed"
  | "disabled"
  | "failed"
  | "timed_out"
  | "safety_blocked"
  | "rejected";
export type CanonicalAiFinancialReadiness = "ready" | "limited" | "withheld";
export type CanonicalAiExplanationReadiness = "ai_enhanced" | "deterministic_fallback" | "unavailable";
export type CanonicalAiExplanationSource = "accepted_ai_narrative" | "deterministic_template" | "none";

export type CanonicalAiLimitationCode =
  | "full_statement_anomaly_review_required"
  | "whole_statement_fee_intelligence_review_required"
  | "material_fee_classification_review_required"
  | "notice_change_review_required"
  | "benchmark_category_review_required"
  | "benchmark_category_not_verified"
  | "ai_narrative_unavailable"
  | "ai_output_rejected"
  | "provider_unavailable"
  | "deterministic_explanation_available";

export type CanonicalRuntimeFeeClassificationReviewStatus =
  | "not_needed"
  | "completed_no_suggestions"
  | "completed_with_diagnostic_suggestions"
  | "disabled"
  | "failed"
  | "timed_out"
  | "rejected"
  | "safety_blocked";

export type CanonicalRuntimeFeeClassificationReviewDisposition =
  | "confirm_existing"
  | "suggest_alternative"
  | "needs_human_review"
  | "insufficient_evidence";

export type CanonicalRuntimeFeeClassificationSuggestion = {
  feeRowRef: string;
  evidenceRefs: string[];
  currentClassificationCandidateRef: string | null;
  suggestedCategory: CanonicalFeeCategory;
  confidence: CanonicalFeeClassificationConfidence;
  disposition: CanonicalRuntimeFeeClassificationReviewDisposition;
  reasonCodes: string[];
  authoritative: false;
};

export type CanonicalRuntimeFeeClassificationReview = {
  type: "runtime_fee_classification_review";
  policyVersion: "canonical_runtime_fee_classification_review_v1";
  status: CanonicalRuntimeFeeClassificationReviewStatus;
  reviewedFeeRowRefs: string[];
  suggestions: CanonicalRuntimeFeeClassificationSuggestion[];
  absenceProof: string | null;
  limitationCodes: CanonicalAiLimitationCode[];
  reasonCodes: string[];
  authoritative: false;
  financialMutationAllowed: false;
  providerDetailsStripped: true;
};

export type CanonicalRuntimeSafetyReviewStatus = "passed" | "limited" | "withheld" | "unavailable";
export type CanonicalRuntimeSafetyReviewCheckStatus = "pass" | "limited" | "withheld" | "unavailable" | "not_applicable";

export type CanonicalRuntimeSafetyReviewCheckId =
  | "canonical_schema_valid"
  | "core_facts_safe"
  | "effective_rate_basis_safe"
  | "fee_ledger_status_safe"
  | "fee_ledger_controls_nonblocking"
  | "package_d_review_items_preserved"
  | "package_e_totals_reconstructed"
  | "runtime_anomaly_ai_substitutable"
  | "runtime_ai_override_absent"
  | "package_g_canonical_derivation_only"
  | "shadow_comparison_not_used";

export type CanonicalRuntimeSafetyReviewReasonCode =
  | "canonical_schema_valid"
  | "core_facts_safe"
  | "effective_rate_basis_safe"
  | "fee_ledger_available"
  | "fee_ledger_partial_limitations_explicit"
  | "fee_ledger_unavailable"
  | "fee_ledger_blocked_control"
  | "package_d_unresolved_classifications_preserved"
  | "package_e_totals_reconstructed"
  | "runtime_anomaly_ai_absent"
  | "runtime_anomaly_ai_disabled"
  | "runtime_anomaly_ai_completed"
  | "runtime_anomaly_ai_failed"
  | "runtime_anomaly_ai_timed_out"
  | "runtime_anomaly_ai_rejected"
  | "runtime_anomaly_ai_safety_blocked"
  | "runtime_ai_override_not_applied"
  | "runtime_ai_override_blocks_substitution"
  | "package_g_canonical_derivation_only"
  | "shadow_comparison_not_used";

export type CanonicalRuntimeSafetyReviewProof = {
  type: "deterministic_runtime_safety_substitution";
  policyVersion: "canonical_runtime_safety_review_v1";
  reviewId: "canonical_runtime_safety_review";
  reasonCodes: CanonicalRuntimeSafetyReviewReasonCode[];
  evidenceRefs: string[];
  calculationRefs: string[];
  limitationCodes: CanonicalAiLimitationCode[];
};

export type CanonicalRuntimeSafetyReviewCheck = {
  checkId: CanonicalRuntimeSafetyReviewCheckId;
  status: CanonicalRuntimeSafetyReviewCheckStatus;
  reasonCode: CanonicalRuntimeSafetyReviewReasonCode;
  evidenceRefs: string[];
  calculationRefs: string[];
};

export type CanonicalRuntimeSafetyReviewRecord = {
  id: "canonical_runtime_safety_review";
  policyVersion: "canonical_runtime_safety_review_v1";
  status: CanonicalRuntimeSafetyReviewStatus;
  checks: CanonicalRuntimeSafetyReviewCheck[];
  anomalySubstitutionAllowed: boolean;
  anomalySubstitutionProof: CanonicalRuntimeSafetyReviewProof | null;
  aiAuthorityUsed: false;
  financialMutationAllowed: false;
  shadowComparisonUsed: false;
  reasonCodes: CanonicalRuntimeSafetyReviewReasonCode[];
  limitationCodes: CanonicalAiLimitationCode[];
  evidenceRefs: string[];
  calculationRefs: string[];
};

export type CanonicalAiTriggerReasonCode =
  | "required_for_customer_financial_conclusions"
  | "material_unresolved_fee_rows"
  | "notice_dependent_conclusions"
  | "benchmark_applicability_unverified"
  | "narrative_preferred"
  | "document_quality_optional"
  | "deterministic_absence_proven";

export type CanonicalAiGroundingStatus = "grounded" | "not_applicable" | "rejected";

export type CanonicalAiCapabilityTrigger = {
  present: boolean;
  reasonCode: CanonicalAiTriggerReasonCode;
  reason: string;
  evidenceRefs: string[];
  feeRowRefs: string[];
  opportunityComponentRefs: string[];
  absenceProof: string | null;
};

export type CanonicalAiCapabilityOutputBase = {
  type: CanonicalAiCapabilityId;
  authoritative: false;
  evidenceRefs: string[];
  factRefs: string[];
  limitationCodes: CanonicalAiLimitationCode[];
};

export type CanonicalWholeStatementFeeIntelligenceStatus =
  | "completed"
  | "partial"
  | "disabled"
  | "failed"
  | "timed_out"
  | "rejected"
  | "safety_blocked";

export type CanonicalWholeStatementFeeIntelligenceEvidenceProvenance =
  | "statement_evidence"
  | "approved_external_documentation"
  | "runtime_verified_documentation"
  | "industry_inference"
  | "merchant_evidence"
  | "human_review";

export type CanonicalWholeStatementFeeIntelligenceDisposition =
  | "supported"
  | "insufficient_evidence"
  | "conflicting_evidence"
  | "human_review";

export type CanonicalWholeStatementFeeIntelligenceAcceptanceStatus =
  | "accepted"
  | "accepted_with_conditions"
  | "needs_verification"
  | "rejected"
  | "human_review";

export type CanonicalWholeStatementFeeIntelligenceRowInterpretation = {
  feeRowRef: string;
  proposedCategory: CanonicalFeeCategory;
  likelyEconomicOwner: CanonicalFeeParty;
  likelyContractualController: CanonicalFeeParty;
  proposedActionabilityCeiling: CanonicalFeeActionability;
  confidence: CanonicalFeeClassificationConfidence;
  conciseRationale: string;
  evidenceProvenance: CanonicalWholeStatementFeeIntelligenceEvidenceProvenance;
  evidenceRefs: string[];
  externalSourceRef: string | null;
  externalClaimSupportRef: string | null;
  conflicts: string[];
  missingEvidence: string[];
  recommendedDisposition: CanonicalWholeStatementFeeIntelligenceDisposition;
  authoritative: false;
};

export type CanonicalWholeStatementFeeIntelligenceCoverageProof = {
  policyVersion: "whole_statement_fee_intelligence_coverage_v1";
  expectedFeeRowRefs: string[];
  reviewedFeeRowRefs: string[];
  missingFeeRowRefs: string[];
  duplicatedFeeRowRefs: string[];
  unknownFeeRowRefs: string[];
  malformedFeeRowRefs: string[];
  malformedFeeRowRefCount: number;
  exactCoverage: boolean;
};

export type CanonicalWholeStatementFeeIntelligenceAcceptanceRecord = {
  feeRowRef: string;
  policyVersion: "whole_statement_fee_intelligence_acceptance_v1";
  status: CanonicalWholeStatementFeeIntelligenceAcceptanceStatus;
  acceptedSemanticFields: {
    category: CanonicalFeeCategory | null;
    likelyEconomicOwner: CanonicalFeeParty | null;
    likelyContractualController: CanonicalFeeParty | null;
    actionabilityCeiling: CanonicalFeeActionability | null;
    evidenceProvenance: CanonicalWholeStatementFeeIntelligenceEvidenceProvenance | null;
  };
  evidenceRefs: string[];
  externalSourceRef: string | null;
  externalClaimSupportRef: string | null;
  reasonCodes: string[];
  conflicts: string[];
  actionabilityCeiling: CanonicalFeeActionability;
  immutableFeeRowRef: string;
};

export type CanonicalAiWholeStatementFeeIntelligenceOutput = CanonicalAiCapabilityOutputBase & {
  type: "whole_statement_fee_intelligence_review";
  reviewPolicyVersion: "whole_statement_fee_intelligence_review_v1";
  reviewStatus: CanonicalWholeStatementFeeIntelligenceStatus;
  coverageProof: CanonicalWholeStatementFeeIntelligenceCoverageProof;
  rowInterpretations: CanonicalWholeStatementFeeIntelligenceRowInterpretation[];
  acceptanceRecords: CanonicalWholeStatementFeeIntelligenceAcceptanceRecord[];
  reasonCodes: string[];
  authoritative: false;
  financialMutationAllowed: false;
  providerDetailsStripped: true;
};

export type CanonicalAiFeeClassificationOutput = CanonicalAiCapabilityOutputBase & {
  type: "fee_classification_review";
  suggestions: Array<{
    feeRowId: string;
    suggestedCategory: CanonicalFeeCategory;
    confidence: CanonicalFeeClassificationConfidence;
    reasonCodes: string[];
    safeExplanation: string;
    authoritative: false;
  }>;
};

export type CanonicalAiAnomalyReviewOutput = CanonicalAiCapabilityOutputBase & {
  type: "full_statement_anomaly_review";
  observations: Array<{
    id: string;
    severity: "info" | "review" | "blocking";
    summary: string;
    affectedFactRefs: string[];
    evidenceRefs: string[];
    authoritative: false;
  }>;
};

export type CanonicalAiNoticeReviewOutput = CanonicalAiCapabilityOutputBase & {
  type: "notice_change_review";
  noticeSuggestions: Array<{
    id: string;
    noticeEvidenceRef: string;
    safeSummary: string;
    observedTextRefs: string[];
    authoritative: false;
  }>;
};

export type CanonicalAiBenchmarkCategoryOutput = CanonicalAiCapabilityOutputBase & {
  type: "benchmark_category_review";
  suggestions: Array<{
    categoryId: string;
    confidence: CanonicalFeeClassificationConfidence;
    evidenceRefs: string[];
    limitationCodes: CanonicalAiLimitationCode[];
    authoritative: false;
  }>;
};

export type CanonicalAiMerchantNarrativeOutput = CanonicalAiCapabilityOutputBase & {
  type: "merchant_narrative";
  sections: Array<{
    kind: "verified_facts" | "review_items" | "opportunity_limits" | "safe_next_step";
    text: string;
    factRefs: string[];
    evidenceRefs: string[];
  }>;
};

export type CanonicalAiDocumentQualityOutput = CanonicalAiCapabilityOutputBase & {
  type: "document_quality_review";
  observations: Array<{
    id: string;
    summary: string;
    evidenceRefs: string[];
    authoritative: false;
  }>;
};

export type CanonicalAiCapabilityOutput =
  | CanonicalAiWholeStatementFeeIntelligenceOutput
  | CanonicalAiFeeClassificationOutput
  | CanonicalAiAnomalyReviewOutput
  | CanonicalAiNoticeReviewOutput
  | CanonicalAiBenchmarkCategoryOutput
  | CanonicalAiMerchantNarrativeOutput
  | CanonicalAiDocumentQualityOutput;

export type CanonicalAiInternalDiagnosticRecord = {
  id: string;
  capability: CanonicalAiCapabilityId;
  createdAt: string;
  expiresAt: string;
  sanitized: true;
  rawPromptPersisted: false;
  rawResponsePersisted: false;
  rawStatementTextPersisted: false;
  providerFamily: "openai" | "anthropic" | "openrouter" | "none" | "other";
  providerModelRef: string | null;
  executionStatus: "not_started" | "completed" | "failed" | "rejected";
  diagnosticCodes: string[];
};

export type CanonicalAiCapabilityRecord = {
  id: string;
  capability: CanonicalAiCapabilityId;
  policyVersion: "canonical_ai_capability_boundary_v1";
  required: boolean;
  status: CanonicalAiCapabilityStatus;
  trigger: CanonicalAiCapabilityTrigger;
  groundingStatus: CanonicalAiGroundingStatus;
  financialReadinessOnFailure: CanonicalAiFinancialReadiness;
  explanationReadinessOnFailure: CanonicalAiExplanationReadiness;
  outputRef: string | null;
  executionRef: string | null;
  independentReviewRefs: string[];
  output: CanonicalAiCapabilityOutput | null;
  limitationCodes: CanonicalAiLimitationCode[];
  knownLegacyRiskCodes: string[];
};

export type CanonicalDeterministicExplanationSection = {
  kind: "verified_facts" | "rate_basis" | "review_items" | "opportunity_limits" | "safe_next_step";
  text: string;
  factRefs: string[];
  evidenceRefs: string[];
};

export type CanonicalDeterministicExplanationRecord = {
  id: string;
  policyVersion: "deterministic_explanation_policy_v1";
  source: "deterministic_template";
  readabilityTarget: "eighth_grade";
  tone: "neutral_factual";
  sections: CanonicalDeterministicExplanationSection[];
  limitationCodes: CanonicalAiLimitationCode[];
  prohibitedLanguageCheck: "passed";
};

export type CanonicalAiCapabilitySummary = {
  policyVersion: "canonical_ai_capability_boundary_v1";
  materialityPolicyVersion: "ai_materiality_policy_v1";
  readinessPolicyVersion: "ai_readiness_degradation_policy_v1";
  privacyRetentionPolicyVersion: "ai_privacy_retention_policy_v1";
  deterministicExplanationPolicyVersion: "deterministic_explanation_policy_v1";
  deterministicRuntimeSafetyReviewPolicyVersion: "canonical_runtime_safety_review_v1";
  financialReadiness: CanonicalAiFinancialReadiness;
  explanationReadiness: CanonicalAiExplanationReadiness;
  explanationSource: CanonicalAiExplanationSource;
  requiredCapabilityCount: number;
  completedCapabilityCount: number;
  blockedCapabilityCount: number;
  rejectedOutputCount: number;
  limitationCodes: CanonicalAiLimitationCode[];
  knownLegacyRiskCodes: string[];
};

export type CanonicalAiCapabilityLayer = {
  policyVersion: "canonical_ai_capability_boundary_v1";
  materialityPolicyVersion: "ai_materiality_policy_v1";
  readinessPolicyVersion: "ai_readiness_degradation_policy_v1";
  privacyRetentionPolicyVersion: "ai_privacy_retention_policy_v1";
  deterministicExplanationPolicyVersion: "deterministic_explanation_policy_v1";
  deterministicRuntimeSafetyReviewPolicyVersion: "canonical_runtime_safety_review_v1";
  capabilities: CanonicalAiCapabilityRecord[];
  deterministicRuntimeSafetyReview: CanonicalRuntimeSafetyReviewRecord | null;
  deterministicExplanation: CanonicalDeterministicExplanationRecord;
  summary: CanonicalAiCapabilitySummary;
  limitations: string[];
};

export type CanonicalCustomerAnalysisReadiness = "verified" | "limited" | "withheld" | "unavailable";
export type CanonicalCustomerDataIntegrity = "reconciled" | "partially_reconciled" | "failed" | "unavailable";
export type CanonicalCustomerRatePosition = "below_reference" | "within_reference" | "above_reference" | "unavailable";
export type CanonicalQualifiedRatePosition = "below_reference" | "within_reference" | "above_reference";
export type CanonicalBusinessQualificationStatus = "qualified" | "confirmation_required" | "unavailable";
export type CanonicalBusinessQualificationConfidence = "high" | "medium" | "low";
export type CanonicalBusinessRiskClass = "standard" | "high_risk" | "unknown";
export type CanonicalProcessingChannel = "card_present" | "card_not_present" | "mixed" | "unknown";
export type CanonicalAnnualVolumeTier = "under_100k" | "100k_500k" | "500k_2m" | "2m_10m" | "over_10m" | "unknown";

export type CanonicalMerchantDeclaration = {
  selectedCategoryId: string | null;
  freeTextDescription: string | null;
  confirmedSegmentId: string | null;
  evidenceRefs: string[];
};

export type CanonicalAccountCoding = {
  actualMcc: CanonicalFactValue<string | null>;
  source: "explicit_statement" | "not_available" | "conflicting_statement_values";
};

export type CanonicalBusinessQualificationFactor<T extends string> = {
  value: T;
  status: "qualified" | "confirmation_required" | "unavailable";
  confidence: CanonicalBusinessQualificationConfidence;
  source: string;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalAnnualVolumeQualification = {
  value: MoneyAmount | null;
  tier: CanonicalAnnualVolumeTier;
  status: "qualified" | "confirmation_required" | "unavailable";
  confidence: CanonicalBusinessQualificationConfidence;
  source: "confirmed_annual_volume" | "statement_month_x12" | "not_available";
  statementMonthsUsed: number | null;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalBusinessConflict = {
  id: string;
  kind: "declaration_conflict" | "mcc_conflict" | "high_risk_conflict" | "channel_conflict";
  material: boolean;
  reason: string;
  evidenceRefs: string[];
  alternatives: string[];
};

export type CanonicalBusinessAlternative = {
  segmentId: string;
  source: "merchant_declaration" | "account_mcc" | "merchant_name_signal" | "ai_suggestion";
  confidence: CanonicalBusinessQualificationConfidence;
  authoritative: boolean;
  reason: string;
  evidenceRefs: string[];
};

export type CanonicalBusinessConfirmationRequirement = {
  reasonCode: string;
  prompt: string;
  allowedSegmentIds: string[];
  allowedRiskClasses: Exclude<CanonicalBusinessRiskClass, "unknown">[];
  allowedChannels: Exclude<CanonicalProcessingChannel, "unknown">[];
};

export type CanonicalBusinessQualification = {
  policyVersion: "canonical_business_qualification_v1";
  status: CanonicalBusinessQualificationStatus;
  confidence: CanonicalBusinessQualificationConfidence;
  merchantDeclaration: CanonicalMerchantDeclaration;
  accountCoding: CanonicalAccountCoding;
  resolvedSegmentId: string | null;
  risk: CanonicalBusinessQualificationFactor<CanonicalBusinessRiskClass>;
  channel: CanonicalBusinessQualificationFactor<CanonicalProcessingChannel>;
  annualVolume: CanonicalAnnualVolumeQualification;
  market: CanonicalBusinessQualificationFactor<"US" | "unknown">;
  processorFamily: CanonicalBusinessQualificationFactor<"fiserv" | "unknown">;
  deterministicSignals: string[];
  alternatives: CanonicalBusinessAlternative[];
  conflicts: CanonicalBusinessConflict[];
  confirmationRequirement: CanonicalBusinessConfirmationRequirement | null;
  evidenceRefs: string[];
  limitations: string[];
  aiAuthoritative: false;
};
export type CanonicalCustomerOpportunityPosture =
  | "none"
  | "verification_only"
  | "eligible_opportunity"
  | "material_eligible_opportunity"
  | "unavailable";
export type CanonicalCustomerPrimaryState =
  | "unable_to_analyze"
  | "analysis_withheld"
  | "analysis_limited"
  | "verification_needed"
  | "competitive_no_opportunity"
  | "competitive_with_opportunity"
  | "rate_review_needed"
  | "rate_review_with_opportunity"
  | "fee_opportunity_identified"
  | "material_fee_opportunity"
  | "verified_benchmark_unavailable";

export type CanonicalCustomerAxisProjection = {
  analysisReadiness: CanonicalCustomerAnalysisReadiness;
  dataIntegrity: CanonicalCustomerDataIntegrity;
  ratePosition: CanonicalCustomerRatePosition;
  opportunityPosture: CanonicalCustomerOpportunityPosture;
  explanationReadiness: CanonicalAiExplanationReadiness;
};

export type CanonicalCustomerBenchmarkReference = {
  referenceId: string;
  displayLabel?: string;
  referenceKind?: "ratereveal_reference_range";
  version: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  applicableProcessor: string | null;
  applicableBusinessType: string | null;
  applicableChannel: string | null;
  applicableCardEnvironment: string | null;
  market?: "US";
  segmentId?: string;
  riskClass?: Exclude<CanonicalBusinessRiskClass, "unknown">;
  channel?: Exclude<CanonicalProcessingChannel, "unknown">;
  annualVolumeTier?: Exclude<CanonicalAnnualVolumeTier, "unknown">;
  range?: { low: DecimalString; high: DecimalString };
  confidence?: CanonicalBusinessQualificationConfidence;
  productApproval?: {
    status: "approved_for_merchant_display";
    approvedAt: string;
    decisionRef: string;
  };
  sourceRecords?: Array<{
    sourceId: string;
    documentId: string;
    title: string;
    publisher: string;
    independenceGroup: string;
    sourceType: "network_schedule" | "government_data" | "industry_analysis" | "processor_pricing" | "legal_analysis";
    locator: string;
    locationWithinSource: string;
    publishedAt: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    accessedAt: string;
    reviewedAt: string;
    metricType: string;
    sourceQuality: "high" | "medium" | "low";
    supportedObservation: string;
    quantitativeValues: Array<{
      metricId: string;
      label: string;
      value: DecimalString;
      unit: "decimal_rate";
      locationWithinSource: string;
    }>;
    limitations: string[];
    evidenceRef: string;
  }>;
  synthesis?: {
    methodVersion: "ratereveal_market_informed_synthesis_v1";
    evidenceSummary: string;
    rateRevealRationale: string;
    assumptions: string[];
    limitations: string[];
    reviewedAt: string;
    reviewBy: string;
  };
  limitations: string[];
  evidenceRefs: string[];
  qualified: boolean;
  opportunityApproved: boolean;
  aiSourced: false;
};

export type CanonicalCustomerRateComparison = {
  policyVersion: "canonical_customer_benchmark_policy_v1";
  status: "qualified" | "confirmation_required" | "unavailable";
  position: CanonicalQualifiedRatePosition | "unavailable";
  benchmarkRef: CanonicalCustomerBenchmarkReference | null;
  calculationRef: string | null;
  evidenceRefs: string[];
  reasonCodes: string[];
  aiSourced: false;
};

export type CanonicalCustomerPermissionKey =
  | "core_metrics"
  | "effective_rate"
  | "benchmark"
  | "fee_inventory"
  | "ownership_actionability"
  | "deterministic_opportunity"
  | "estimated_opportunity"
  | "verification_amounts"
  | "evidence_calculations"
  | "actions"
  | "customer_explanation"
  | "ai_enhanced_narrative";

export type CanonicalCustomerPermissionDecision = {
  key: CanonicalCustomerPermissionKey;
  permitted: boolean;
  reasonCodes: string[];
  limitationCodes: string[];
  policyVersion: "canonical_customer_permissions_v1";
};

export type CanonicalCustomerVisibility = {
  policyVersion: "canonical_customer_visibility_v1";
  consumerMayReduceVisibilityOnly: true;
  showCoreMetrics: boolean;
  showEffectiveRate: boolean;
  showBenchmark: boolean;
  showFeeInventory: boolean;
  showOwnershipActionability: boolean;
  showDeterministicOpportunity: boolean;
  showEstimatedOpportunity: boolean;
  showVerificationAmounts: boolean;
  showEvidenceCalculations: boolean;
  showActions: boolean;
  showCustomerExplanation: boolean;
  visibleDeterministicAnnualAmount: MoneyAmount;
  visibleApprovedEstimatedAnnualAmount: MoneyAmount;
  visibleEligibleAnnualAmount: MoneyAmount;
  visibleVerificationOnlyObservedAmount: MoneyAmount;
  visibleNonAnnualizedObservedAmount: MoneyAmount;
  hiddenReasonCodes: string[];
};

export type CanonicalCustomerMateriality = {
  policyVersion: "canonical_customer_state_materiality_v1";
  material: boolean;
  annualEligibleOpportunity: MoneyAmount;
  annualizedTotalFees: MoneyAmount | null;
  annualizedProcessedVolume: MoneyAmount | null;
  totalFeesRatio: DecimalString | null;
  processedVolumeRatio: DecimalString | null;
  usedFallbackThreshold: boolean;
  reasonCodes: string[];
};

export type CanonicalCustomerActionType =
  | "review_documentation"
  | "verify_charge"
  | "request_explanation"
  | "request_removal"
  | "request_repricing"
  | "monitor"
  | "no_action";

export type CanonicalCustomerActionGuidance = {
  id: string;
  policyVersion: "canonical_customer_action_guidance_v1";
  actionType: CanonicalCustomerActionType;
  feeRowRefs: string[];
  classificationCandidateRefs: string[];
  opportunityComponentRefs: string[];
  verificationComponentRefs: string[];
  evidenceRefs: string[];
  calculationRefs: string[];
  documentationRequirement: CanonicalFeeDocumentationRequirement;
  confidence: "high" | "medium" | "low";
  limitationCodes: string[];
  reasonCodes: string[];
};

export type CanonicalCustomerExplanationSource = "ai_enhanced" | "deterministic_fallback" | "unavailable";

export type CanonicalCustomerExplanationSection = {
  kind: "summary" | "verified_facts" | "rate_basis" | "opportunity_limits" | "review_items" | "safe_next_step";
  text: string;
  factRefs: string[];
  evidenceRefs: string[];
};

export type CanonicalCustomerExplanation = {
  policyVersion: "canonical_customer_wording_v1";
  source: CanonicalCustomerExplanationSource;
  fallbackReasonCodes: string[];
  prohibitedLanguageCheck: "passed";
  sections: CanonicalCustomerExplanationSection[];
};

export type CanonicalCustomerStateProjection = {
  policyVersion: "canonical_customer_state_policy_v1";
  materialityPolicyVersion: "canonical_customer_state_materiality_v1";
  benchmarkPolicyVersion: "canonical_customer_benchmark_policy_v1";
  permissionPolicyVersion: "canonical_customer_permissions_v1";
  visibilityPolicyVersion: "canonical_customer_visibility_v1";
  actionGuidancePolicyVersion: "canonical_customer_action_guidance_v1";
  wordingPolicyVersion: "canonical_customer_wording_v1";
  axes: CanonicalCustomerAxisProjection;
  primaryState: CanonicalCustomerPrimaryState;
  rateComparison: CanonicalCustomerRateComparison;
  materiality: CanonicalCustomerMateriality;
  permissions: CanonicalCustomerPermissionDecision[];
  visibility: CanonicalCustomerVisibility;
  actionGuidance: CanonicalCustomerActionGuidance[];
  explanation: CanonicalCustomerExplanation;
  reasonCodes: string[];
  limitations: string[];
};

export type CanonicalMerchantAttentionType =
  | "pricing_review"
  | "potential_negotiation"
  | "explanation_or_itemization"
  | "compliance_or_remediation"
  | "configuration_or_payment_practice_review"
  | "service_use_review"
  | "monitor"
  | "informational";

export type CanonicalMerchantAttentionPriority = "routine" | "review" | "high_priority";

export type CanonicalMerchantAttentionEvidenceStatus =
  | "statement_confirmed"
  | "supported_interpretation"
  | "public_documentation_supported"
  | "needs_merchant_pricing_agreement"
  | "needs_additional_statement_history"
  | "needs_processor_explanation"
  | "unresolved";

export type CanonicalMerchantAttentionResolutionRequirement =
  | "no_additional_evidence_required"
  | "public_documentation_required"
  | "merchant_pricing_agreement_required"
  | "additional_statement_history_required"
  | "deterministic_math_required"
  | "processor_explanation_required"
  | "unresolved_review_required";

export type CanonicalMerchantAttentionSafeActionType =
  | "review_documentation"
  | "verify_charge"
  | "request_explanation"
  | "request_itemization"
  | "check_service_use"
  | "review_configuration"
  | "request_pricing_review"
  | "monitor"
  | "request_removal"
  | "request_repricing"
  | "no_action";

export type CanonicalMerchantAttentionEvidenceBoundary = {
  statementProof: {
    kind: "observed_charge" | "qualified_rate_position";
    feeRowId: string | null;
    observedLabel: string | null;
    observedAmount: MoneyAmount | null;
    ratePosition: CanonicalQualifiedRatePosition | null;
    evidenceRefs: string[];
  };
  reasonableConclusion: {
    summary: string;
    basis: "deterministic_policy" | "admitted_intelligence" | "qualified_reference";
    confidence: CanonicalFeeClassificationConfidence;
    reasonRefs: string[];
  };
  remainingUncertainty: string[];
};

export type CanonicalMerchantAttentionQuestion = {
  questionId: string;
  attentionItemId: string;
  question: string;
  amountUnderReview: MoneyAmount | null;
  whatRateRevealKnows: string;
  whatRemainsUncertain: string;
  safeNextStep: string;
  requirement: CanonicalMerchantAttentionResolutionRequirement;
  requiredEvidenceOrConfirmation: string[];
  evidenceRefs: string[];
  reasonRefs: string[];
  amountIsSavings: false;
};

export type CanonicalMerchantAttentionActionToolkit = {
  moduleId: string;
  attentionItemId: string;
  actionType: CanonicalMerchantAttentionSafeActionType;
  whatToDo: string;
  why: string;
  statementEvidenceRefs: string[];
  exactAsk: string | null;
  requestDocumentation: string[];
  unclearAnswerFollowUp: string | null;
  avoidClaiming: string[];
  successCriteria: string[];
};

export type CanonicalMerchantAttentionItem = {
  id: string;
  policyVersion: "canonical_merchant_attention_v1";
  scope: "fee_row" | "statement_pricing";
  feeRowIds: string[];
  merchantTitle: string;
  whyThisDeservesAttention: string;
  originalObservedStatementLabel: string | null;
  observedAmount: MoneyAmount | null;
  category: CanonicalFeeCategory | "statement_pricing";
  likelyOwner: {
    economicBeneficiary: CanonicalFeeParty;
    contractualController: CanonicalFeeParty;
  } | null;
  attentionType: CanonicalMerchantAttentionType;
  priority: CanonicalMerchantAttentionPriority;
  evidenceStatus: CanonicalMerchantAttentionEvidenceStatus;
  confidence: CanonicalFeeClassificationConfidence;
  evidenceBoundary: CanonicalMerchantAttentionEvidenceBoundary;
  conflict: {
    status: "none" | "resolved" | "unresolved";
    summary: string | null;
  };
  resolution: {
    requirement: CanonicalMerchantAttentionResolutionRequirement;
    merchantMeaning: string;
    documentationNeeded: string[];
  };
  safestNextAction: {
    actionType: CanonicalMerchantAttentionSafeActionType;
    instruction: string;
  };
  actionabilityCeiling: CanonicalFeeActionability;
  opportunityLink: {
    componentRefs: string[];
    linkageOnly: true;
    moneyRecomputed: false;
  } | null;
  questionToResolve: CanonicalMerchantAttentionQuestion | null;
  actionToolkit: CanonicalMerchantAttentionActionToolkit | null;
  surfaceEligibility: {
    priorityFinding: boolean;
    questionsToResolve: boolean;
    actionToolkit: boolean;
    feeInventory: boolean;
  };
  inventoryDisposition: "attention_review" | "unresolved_review" | "routine_context" | "statement_level_only";
  reasonCodes: string[];
  evidenceRefs: string[];
  sourceIntelligenceRefs: string[];
  merchantLanguageEligibility: {
    policyVersion: "merchant_attention_language_eligibility_v1";
    eligibleForAiInterpretation: boolean;
    reasonCodes: string[];
  };
  merchantLanguageSource: "admitted_ai_interpretation" | "deterministic_fallback";
};

export type CanonicalMerchantAttentionAiInterpretationOutput = {
  type: "merchant_attention_ai_interpretation";
  policyVersion: "merchant_attention_ai_interpretation_v1";
  outputId: string;
  items: Array<{
    attentionItemId: string;
    merchantTitle: string;
    whyThisDeservesAttention: string;
    reasonableConclusion: string;
    remainingUncertainty: string[];
    safeNextAction: string;
    resolutionMeaning: string;
    question: null | {
      question: string;
      whatRateRevealKnows: string;
      whatRemainsUncertain: string;
      safeNextStep: string;
    };
    actionToolkit: null | {
      whatToDo: string;
      why: string;
      exactAsk: string | null;
      unclearAnswerFollowUp: string | null;
      avoidClaiming: string[];
      successCriteria: string[];
    };
    semanticSupportRefs: string[];
  }>;
  authoritative: false;
  financialMutationAllowed: false;
  providerDetailsStripped: true;
};

export type CanonicalMerchantAttentionModel = {
  policyVersion: "canonical_merchant_attention_v1";
  status: "available" | "empty" | "partial";
  items: CanonicalMerchantAttentionItem[];
  summary: {
    itemCount: number;
    highPriorityCount: number;
    reviewCount: number;
    routineCount: number;
    questionCount: number;
    actionToolkitCount: number;
  };
  sourcePolicyVersions: {
    feeLedger: "canonical_fee_ledger_v1";
    ownershipActionability: "fee_ownership_actionability_v1";
    opportunityEngine: "canonical_opportunity_engine_v1";
    aiCapabilityBoundary: "canonical_ai_capability_boundary_v1";
    customerBenchmark: "canonical_customer_benchmark_policy_v1";
  };
  interpretation: {
    policyVersion: "merchant_attention_ai_interpretation_v1";
    normalPathRequirement: "ai_interpretation_required";
    source: "admitted_ai_interpretation" | "deterministic_fallback";
    readiness: "ready" | "degraded_fallback";
    authoritative: false;
    financialMutationAllowed: false;
    outputRef: string | null;
    admission: {
      schemaValidated: boolean;
      canonicalLinkageValidated: boolean;
      actionabilityCeilingValidated: boolean;
      privacyValidated: boolean;
      reasonCodes: string[];
    };
    coverage: {
      policyVersion: "merchant_attention_language_eligibility_v1";
      eligibleItemCount: number;
      admittedItemCount: number;
      deterministicRoutineItemCount: number;
      exactEligibleCoverage: boolean;
    };
    fallbackReasonCodes: string[];
  };
  limitations: string[];
};

export type CanonicalFeeLedgerControlType =
  | "printed_charge_sum"
  | "rate_times_volume"
  | "per_item_rate"
  | "printed_subtotal"
  | "effective_rate_comparison"
  | "funding_formula";

export type CanonicalFeeLedgerControl = {
  id: string;
  type: CanonicalFeeLedgerControlType;
  label: string;
  evidenceRefs: string[];
  expectedAmount: MoneyAmount | null;
  actualAmount: MoneyAmount | null;
  deltaMinor: number | null;
  toleranceMinor: number | null;
  tolerancePolicyId: string;
  status: "pass" | "pass_with_rounding" | "limited" | "verification_required" | "blocked";
  derivationGroupId: string;
  coveredFeeRowIds: string[];
  basis: "section_control" | "grand_control" | "diagnostic" | "unknown";
  amountBasis: "fee_charge_gross" | "signed_net" | "not_applicable" | "unknown";
  independence: "printed_source_control" | "derived_diagnostic" | "unknown";
  parserReportedActualAmount?: MoneyAmount | null;
  reconstructedFromCoveredRows?: boolean;
  reconstructionFormula?: "covered_rows_fee_charge_gross" | "covered_rows_signed_net" | "not_reconstructed";
  roundingBridge?: CanonicalFeeRollupRoundingBridge | null;
  reasonCode: string;
  explanation: string;
};

export type CanonicalFeeRowSectionAssignment = {
  feeRowId: string;
  status: "assigned" | "unassigned" | "ambiguous";
  sectionControlRef: string | null;
  candidateSectionControlRefs: string[];
  printedSectionLabel: string | null;
  sourceSection: string | null;
  evidenceRefs: string[];
  ruleId: "explicit_source_section_label_v1" | "unique_control_coverage_fallback_v1" | null;
};

export type CanonicalFeeRowArithmeticProvenance = {
  feeRowId: string;
  status: "complete" | "partial" | "charged_amount_only" | "ambiguous";
  formulaBasis: "rate_times_volume" | "per_item" | "unknown" | "ambiguous";
  printedRate: CanonicalPrintedRate | null;
  volumeBasis: MoneyAmount | null;
  printedPerItemRate: CanonicalPrintedRate | null;
  itemCount: CountValue | null;
  chargedAmount: MoneyAmount | null;
  fieldEvidenceRefs: {
    rate: string[];
    volumeBasis: string[];
    count: string[];
    chargedAmount: string[];
  };
  missingFields: string[];
};

export type CanonicalFeePartitionSourceProvenance = {
  policyVersion: "fee_partition_source_provenance_v1";
  authority: "diagnostic_relationship_only";
  status: "available" | "partial" | "unavailable";
  assignmentMode: "explicit_source_section_labels" | "unique_control_coverage_fallback" | "unavailable";
  eligibleFeeRowIds: string[];
  sectionControlRefs: string[];
  arithmeticControlRefs: string[];
  assignments: CanonicalFeeRowSectionAssignment[];
  rowArithmetic: CanonicalFeeRowArithmeticProvenance[];
  limitations: string[];
};

export type CanonicalFeeRollupRoundingBridge = {
  policyVersion: "fee_rollup_rounding_bridge_v1";
  method: "exact_unrounded_partition_bridge";
  sectionAmountsMicros: Array<{ controlRef: string; amountMicros: number }>;
  grandAmountMicros: number;
  roundingMode: "nearest_cent_half_away_from_zero";
  evidenceRefs: string[];
};

export type CanonicalExactSourceArithmeticAmount = {
  numeratorMinorUnits: string;
  denominator: string;
  roundedAmountMinor: number;
};

export type CanonicalExactSourceArithmeticAssessment = {
  policyVersion: "exact_source_arithmetic_bridge_v1";
  authority: "diagnostic_relationship_only";
  roundingMode: "nearest_cent_half_away_from_zero";
  status: "not_needed_exact" | "proven_rounding" | "unresolved";
  reasonCode:
    | "printed_totals_exact"
    | "exact_source_arithmetic_proves_rounding"
    | "printed_totals_not_comparable"
    | "incomplete_partition_membership"
    | "incomplete_source_arithmetic"
    | "ambiguous_source_arithmetic"
    | "unsupported_source_arithmetic"
    | "source_arithmetic_row_mismatch"
    | "source_arithmetic_section_mismatch"
    | "source_arithmetic_grand_mismatch";
  reconstructedFeeRowIds: string[];
  incompleteFeeRowIds: string[];
  ambiguousFeeRowIds: string[];
  mismatchedFeeRowIds: string[];
  sectionAmounts: Array<{
    controlRef: string;
    feeRowIds: string[];
    exactAmount: CanonicalExactSourceArithmeticAmount;
    printedAmountMinor: number;
    reproducesPrintedTotal: boolean;
  }>;
  grandAmount: CanonicalExactSourceArithmeticAmount | null;
  evidenceRefs: string[];
};

export type CanonicalFeeLedger = {
  policyVersion: "canonical_fee_ledger_v1";
  status: "available" | "partial" | "unavailable";
  sourceOccurrences: CanonicalFeeSourceOccurrence[];
  parserInterpretations: CanonicalFeeParserInterpretation[];
  rows: CanonicalFeeRow[];
  uniqueChargeTotal: MoneyAmount | null;
  uniqueChargeCalculationRef?: string;
  controls: CanonicalFeeLedgerControl[];
  partitionSourceProvenance: CanonicalFeePartitionSourceProvenance;
  limitations: string[];
};

export type CanonicalCrossSummaryMeasure = "submitted_amount" | "fee_amount" | "funded_amount";

export type CanonicalCrossSummaryGrain =
  | "statement_period_total"
  | "fee_section_total"
  | "funding_batch_period_total"
  | "unknown";

export type CanonicalCrossSummaryNode = {
  id: string;
  summaryRef: string;
  sourceKind: "selected_financial_fact" | "printed_fee_control" | "funding_batch_control";
  printedLabel: string;
  measure: CanonicalCrossSummaryMeasure;
  grain: CanonicalCrossSummaryGrain;
  period: { start: string; end: string } | null;
  sourceDocumentRef: string;
  identifierBasis: Array<"source_document_ref" | "merchant_identifier">;
  amount: MoneyAmount | null;
  evidenceRefs: string[];
};

export type CanonicalCrossSummaryRelationshipCandidate =
  | "same_measure_same_population"
  | "component_rollup";

export type CanonicalCrossSummaryAdjudicationClass =
  | "resolved_independent_printed_totals"
  | "resolved_measure_scoped_funding_warning"
  | "resolved_passing_component_controls"
  | "resolved_complete_fee_partition"
  | "resolved_rounding_attributed_fee_partition"
  | "unresolved_period"
  | "unresolved_grain"
  | "unresolved_amount_conflict"
  | "unresolved_fee_partition_membership"
  | "unresolved_fee_rollup_residual"
  | "unresolved_incomplete_or_conflicting_controls"
  | "unresolved_missing_explicit_link_evidence";

export type CanonicalCrossSummaryReusableRule =
  | "independent_printed_total_identity_v1"
  | "measure_scoped_funding_warning_v1"
  | "passing_covered_component_rollup_v1"
  | "complete_non_overlapping_fee_partition_v1"
  | "exact_rounding_bridge_fee_partition_v1";

export type CanonicalCrossSummaryRelationship = {
  id: string;
  leftSummaryId: string;
  rightSummaryId: string;
  evaluatedCandidateType: CanonicalCrossSummaryRelationshipCandidate;
  relationshipType: CanonicalCrossSummaryRelationshipCandidate | "unknown";
  status: "proven" | "unknown";
  comparison: {
    measure: "compatible" | "incompatible" | "unknown";
    period: "same_statement_period" | "incompatible" | "unknown";
    grain: "compatible" | "incompatible" | "unknown";
    identifiers: "matched" | "incompatible" | "unknown";
    explicitLinkEvidence: "present" | "absent";
    amount: "corroborates" | "conflicts" | "not_comparable";
  };
  evidenceRefs: string[];
  countingTreatment: "reference_only_no_addition";
  reasonCodes: string[];
  limitations: string[];
  adjudication: {
    policyVersion: "cross_summary_reconciliation_adjudication_v1";
    outcome: "resolved_by_reusable_rule" | "remain_unknown";
    relationshipClass: CanonicalCrossSummaryAdjudicationClass;
    reusableRuleId: CanonicalCrossSummaryReusableRule | null;
  };
};

export type CanonicalFeeRollupAssessment = {
  id: string;
  policyVersion: "fee_rollup_completeness_rounding_attribution_v1";
  grandControlRef: string;
  sectionControlRefs: string[];
  status: "proven_complete_exact" | "proven_complete_with_rounding" | "unresolved";
  membershipStatus: "complete_non_overlapping" | "missing_members" | "overlapping_members" | "incomplete_controls";
  grandCoveredFeeRowIds: string[];
  sectionCoveredFeeRowIds: string[];
  missingFeeRowIds: string[];
  uncoveredByGrandFeeRowIds: string[];
  uncoveredBySectionsFeeRowIds: string[];
  overlappingFeeRowIds: string[];
  outsideGrandFeeRowIds: string[];
  sectionPrintedTotal: MoneyAmount | null;
  grandPrintedTotal: MoneyAmount | null;
  residualMinor: number | null;
  residualAttribution: "not_needed_exact" | "proven_exact_rounding_bridge" | "unresolved";
  sourceArithmetic: CanonicalExactSourceArithmeticAssessment;
  roundingEvidenceRefs: string[];
  countingTreatment: "reference_only_no_addition";
  reasonCodes: string[];
  limitations: string[];
};

export type CanonicalCrossSummaryLinkEvidence = {
  policyVersion: "cross_summary_link_evidence_v2";
  adjudicationPolicyVersion: "cross_summary_reconciliation_adjudication_v1";
  feeRollupPolicyVersion: "fee_rollup_completeness_rounding_attribution_v1";
  authority: "diagnostic_relationship_only";
  status: "available" | "partial" | "unavailable";
  nodes: CanonicalCrossSummaryNode[];
  relationships: CanonicalCrossSummaryRelationship[];
  feeRollups: CanonicalFeeRollupAssessment[];
  limitations: string[];
};

export type CanonicalFinancialFacts = {
  processedSales: CanonicalFactValue<MoneyAmount>;
  totalFees: CanonicalFactValue<MoneyAmount>;
  rateRevealCalculatedAllInRate: CanonicalFactValue<DecimalString>;
  processorStatedRate: CanonicalFactValue<DecimalString | null>;
  effectiveRateBasis: CanonicalEffectiveRateBasis;
  transactionCounts: CanonicalTransactionCounts;
  averageTicketBasis: CanonicalAverageTicketBasis;
  averageTicket: CanonicalFactValue<MoneyAmount | null>;
  amountFunded: CanonicalFactValue<MoneyAmount | null>;
  adjustments: CanonicalFactValue<MoneyAmount | null>;
  credits: CanonicalFactValue<MoneyAmount | null>;
  refunds: CanonicalFactValue<MoneyAmount | null>;
};

export type CanonicalStatementIdentity = {
  merchantName: CanonicalFactValue<string>;
  merchantIdentifier: CanonicalFactValue<string | null>;
  processorName: CanonicalFactValue<string>;
  processorFamily: CanonicalFactValue<string>;
  statementPeriod: CanonicalFactValue<{ start: string; end: string }>;
  businessType: CanonicalFactValue<string>;
  sourceDocumentRef: string;
};

export type CanonicalAnalysisVersionManifest = {
  schemaVersion: "canonical_statement_analysis_v1";
  canonicalBuilderVersion: string;
  moneyPolicyVersion: "money_minor_units_usd_v1";
  effectiveRatePolicyVersion: "effective_rate_basis_v1";
  transactionCountPolicyVersion: "transaction_population_match_v1";
  feeClassificationPolicyVersion: "fee_taxonomy_v1";
  ownershipActionabilityPolicyVersion: "fee_ownership_actionability_v1";
  feeOwnershipRuleRegistryVersion: "fee_ownership_rules_v1";
  feeAiSuggestionPolicyVersion: "fee_ai_suggestion_policy_v1";
  feeHumanOverridePolicyVersion: "fee_human_override_policy_v1";
  opportunityEnginePolicyVersion: "canonical_opportunity_engine_v1";
  opportunityTargetPolicyVersion: "opportunity_target_policy_v1";
  opportunityCadencePolicyVersion: "opportunity_cadence_policy_v1";
  opportunityBenchmarkPolicyVersion: "opportunity_benchmark_policy_v1";
  opportunityAiBoundaryPolicyVersion: "opportunity_ai_boundary_policy_v1";
  aiCapabilityBoundaryPolicyVersion: "canonical_ai_capability_boundary_v1";
  aiMaterialityPolicyVersion: "ai_materiality_policy_v1";
  aiReadinessDegradationPolicyVersion: "ai_readiness_degradation_policy_v1";
  aiPrivacyRetentionPolicyVersion: "ai_privacy_retention_policy_v1";
  deterministicExplanationPolicyVersion: "deterministic_explanation_policy_v1";
  businessQualificationPolicyVersion: "canonical_business_qualification_v1";
  customerStatePolicyVersion: "canonical_customer_state_policy_v1";
  customerStateMaterialityPolicyVersion: "canonical_customer_state_materiality_v1";
  customerBenchmarkPolicyVersion: "canonical_customer_benchmark_policy_v1";
  customerPermissionPolicyVersion: "canonical_customer_permissions_v1";
  customerVisibilityPolicyVersion: "canonical_customer_visibility_v1";
  customerActionGuidancePolicyVersion: "canonical_customer_action_guidance_v1";
  customerWordingPolicyVersion: "canonical_customer_wording_v1";
  merchantAttentionPolicyVersion: "canonical_merchant_attention_v1";
  crossSummaryLinkEvidencePolicyVersion: "cross_summary_link_evidence_v2";
  crossSummaryReconciliationAdjudicationPolicyVersion: "cross_summary_reconciliation_adjudication_v1";
  feeRollupCompletenessPolicyVersion: "fee_rollup_completeness_rounding_attribution_v1";
  feePartitionSourceProvenancePolicyVersion: "fee_partition_source_provenance_v1";
  exactSourceArithmeticBridgePolicyVersion: "exact_source_arithmetic_bridge_v1";
  parserId: string | null;
  parserVersion: string | null;
  extractionVersion: string;
};

export type CanonicalValidationState = {
  status: "valid" | "valid_with_warnings" | "invalid";
  errors: string[];
  warnings: string[];
};

export type CanonicalStatementAnalysis = {
  canonicalSchemaVersion: "canonical_statement_analysis_v1";
  analysisId: string;
  sourceAnalysisId: string | null;
  createdAt: string;
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  businessQualification: CanonicalBusinessQualification;
  feeLedger: CanonicalFeeLedger;
  crossSummaryLinkEvidence: CanonicalCrossSummaryLinkEvidence;
  feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  opportunityEngine: CanonicalOpportunityEngine;
  aiCapabilities: CanonicalAiCapabilityLayer;
  customerState: CanonicalCustomerStateProjection;
  merchantAttention: CanonicalMerchantAttentionModel;
  evidence: CanonicalEvidenceRecord[];
  calculations: CanonicalCalculationRecord[];
  validation: CanonicalValidationState;
  versionManifest: CanonicalAnalysisVersionManifest;
};
