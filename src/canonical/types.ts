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
  | "legacy_summary"
  | "unknown";

export type CanonicalExtractionMethod = "pdf_text" | "document_ir" | "ocr" | "csv" | "manual_input" | "legacy";

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
  selectedCandidateId?: string;
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
    | "opportunity_component_sum";
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
  confidence: CanonicalConfidence;
};

export type CanonicalFeeMergeReason =
  | "same_source_occurrence"
  | "same_evidence_and_amount"
  | "control_or_subtotal_excluded"
  | "zero_amount_excluded"
  | "ambiguous_similarity_unresolved";

export type CanonicalFeeRow = {
  id: string;
  role: CanonicalFeeRowRole;
  sourceOccurrenceIds: string[];
  parserInterpretationIds: string[];
  selectedLabel: string;
  selectedAmount: MoneyAmount | null;
  signedAmount: MoneyAmount | null;
  contributesToUniqueTotal: boolean;
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
  explanation: string;
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
  feeLedger: CanonicalFeeLedger;
  feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  opportunityEngine: CanonicalOpportunityEngine;
  evidence: CanonicalEvidenceRecord[];
  calculations: CanonicalCalculationRecord[];
  validation: CanonicalValidationState;
  versionManifest: CanonicalAnalysisVersionManifest;
};
