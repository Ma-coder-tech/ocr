import type { DecimalString, MoneyAmount } from "../types.js";

export type CanonicalEconomicsV2Availability = "available" | "unavailable" | "ambiguous" | "unsupported";
export type CanonicalEconomicsV2Confidence = "high" | "medium" | "low" | "needs_review";

export type CanonicalEconomicsV2SourceProvenance =
  | "authoritative"
  | "approved_synthetic"
  | "observational"
  | "requires_human_review"
  | "source_unavailable"
  | "corpus_integrity_hold";

export type CanonicalEconomicsV2SemanticAmendmentId =
  | "RB-AMEND-001-MULTI-POPULATION"
  | "RB-AMEND-002-UNDEFINED-RATE"
  | "RB-AMEND-003-GROSS-AVERAGE-TICKET"
  | "RB-AMEND-004-FINANCIAL-DIRECTION"
  | "RB-AMEND-005-REPRESENTATION-CONTRIBUTION";

export type CanonicalEconomicsV2DifferenceClassification =
  | "same_semantic_fact"
  | "approved_semantic_amendment"
  | "v2_unavailable_or_ambiguous"
  | "unexpected_divergence";

export type CanonicalEconomicsV2TemplateAdmissionStatus =
  | "admitted"
  | "unknown"
  | "incomplete"
  | "unavailable";

export type CanonicalEconomicsV2CompletenessStatus = "complete" | "incomplete" | "unknown" | "unavailable";

export type CanonicalEconomicsV2SuppliedDocumentIntegrityStatus =
  | "complete_supplied_document"
  | "incomplete_or_corrupt_supplied_document"
  | "unknown"
  | "unavailable";

export type CanonicalEconomicsV2DocumentIntegrity = {
  suppliedDocumentStatus: CanonicalEconomicsV2SuppliedDocumentIntegrityStatus;
  observedPageCount: number | null;
  processedPageCount: number | null;
  fatalPageErrorCount: number | null;
  extractionLineageComplete: boolean | null;
  localIngestionTruncated: boolean | null;
  expectedPageCount: number | null;
  /** Processor-statement completeness; independent from supplied-document processing integrity. */
  completenessStatus: CanonicalEconomicsV2CompletenessStatus;
  missingPageNumbers: number[];
  proofEvidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2CapabilityStatus = "supported" | "unsupported" | "unknown" | "unavailable";

export type CanonicalEconomicsV2CapabilityId =
  | "processor_identity"
  | "statement_period"
  | "gross_sale_volume"
  | "refund_volume"
  | "canonical_net_submitted_card_volume"
  | "gross_sale_transaction_count"
  | "submitted_transaction_count"
  | "refund_transaction_count"
  | "fee_total"
  | "funding_batches"
  | "settlement_adjustments"
  | "chargeback_financial_populations"
  | "fee_detail"
  | "non_fee_financial_flow_exclusions"
  | "reconciliation_controls";

export type CanonicalEconomicsV2TemplateCapability = {
  capability: CanonicalEconomicsV2CapabilityId;
  status: CanonicalEconomicsV2CapabilityStatus;
  proofEvidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2TemplateProfile = {
  detectedFamily: string | null;
  detectedTemplate: string | null;
  detectedVersion: string | null;
  identityStatus: "observed" | "proven" | "unknown" | "unavailable";
  admissionStatus: CanonicalEconomicsV2TemplateAdmissionStatus;
  admissionAuthority: {
    lifecycle: "admitted" | "admitted_with_conditions";
    authorityClass: "product_owner" | "authorized_domain_reviewer" | "data_steward" | "deterministic_capability_policy";
    authorityRef: string;
    admittedAt: string;
    admissionVersion: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  } | null;
  completenessStatus: CanonicalEconomicsV2CompletenessStatus;
  admissionProofEvidenceRefs: string[];
  capabilities: CanonicalEconomicsV2TemplateCapability[];
  limitations: string[];
};

export type CanonicalEconomicsV2SectionKind =
  | "summary"
  | "sales_activity"
  | "funding"
  | "fees"
  | "interchange"
  | "card_activity"
  | "adjustments"
  | "chargebacks"
  | "tax_reporting"
  | "account"
  | "notices"
  | "unknown";

export type CanonicalEconomicsV2PopulationSemantic =
  | "gross_sale_volume"
  | "refund_volume"
  | "canonical_net_submitted_card_volume"
  | "gross_sale_transaction_count"
  | "refund_transaction_count"
  | "submitted_transaction_count"
  | "settled_transaction_count"
  | "authorization_count"
  | "statement_processing_fee_total"
  | "fee_occurrences"
  | "settlement_adjustment_amount"
  | "chargeback_principal_amount"
  | "chargeback_fee_amount"
  | "funding_batches"
  | "net_funded_amount"
  | "supporting_detail"
  | "unknown";

export type CanonicalEconomicsV2SourceSection = {
  id: string;
  sourceSectionRef: string;
  kind: CanonicalEconomicsV2SectionKind;
  heading: string;
  pageStart: number | null;
  pageEnd: number | null;
  lineRefs: string[];
  tableRefs: string[];
  populationSemantics: CanonicalEconomicsV2PopulationSemantic[];
  declaredControlOccurrenceRefs: string[];
  representsSameEconomicsAsSectionRefs: string[];
  completenessStatus: CanonicalEconomicsV2CompletenessStatus;
  capabilityStatus: CanonicalEconomicsV2CapabilityStatus;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2PrintedDirection =
  | "positive"
  | "negative"
  | "zero"
  | "unsigned"
  | "unknown";

export type CanonicalEconomicsV2OccurrenceRole =
  | "gross_sale"
  | "refund"
  | "net_submitted"
  | "gross_sale_count"
  | "refund_count"
  | "submitted_count"
  | "settled_count"
  | "authorization_count"
  | "fee_charge"
  | "fee_credit"
  | "settlement_adjustment"
  | "chargeback_principal_debit"
  | "chargeback_representment"
  | "chargeback_fee"
  | "funded_amount"
  | "third_party_funding"
  | "subtotal_or_control"
  | "supporting_representation"
  | "unresolved_adjustment_or_chargeback"
  | "unknown";

export type CanonicalEconomicsV2ContributionRole =
  | "authoritative_contributor"
  | "supporting_detail"
  | "control_only"
  | "repeated_representation"
  | "funding_only"
  | "unresolved";

export type CanonicalEconomicsV2EvidenceRecord = {
  id: string;
  documentRef: string;
  sectionRef: string | null;
  pageNumber: number | null;
  lineRef: string | null;
  rowIndex: number | null;
  extractionMethod: "document_ir" | "deterministic_parser" | "approved_synthetic";
  redactedExcerpt: string | null;
  redactionApplied: true;
};

export type CanonicalEconomicsV2ParserInterpretation = {
  id: string;
  parserId: string;
  parserVersion: string | null;
  occurrenceRef: string;
  interpretedRole: CanonicalEconomicsV2OccurrenceRole;
  authority: "deterministic_parser_only";
  confidence: CanonicalEconomicsV2Confidence;
};

export type CanonicalEconomicsV2SourceOccurrence = {
  id: string;
  sectionRef: string;
  evidenceRef: string;
  pageNumber: number | null;
  lineRef: string | null;
  rowIndex: number | null;
  sourceLabel: string;
  semanticRole: CanonicalEconomicsV2OccurrenceRole;
  printedDirection: CanonicalEconomicsV2PrintedDirection;
  printedAmount: MoneyAmount | null;
  volumeBasis: MoneyAmount | null;
  printedRate: DecimalString | null;
  printedCount: number | null;
  perItemAmount: MoneyAmount | null;
  contributionRole: CanonicalEconomicsV2ContributionRole;
  parserInterpretationRefs: string[];
  reconciliationRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2RepresentationGroup = {
  id: string;
  canonicalFactRef: string;
  occurrenceRefs: string[];
  authoritativeContributionOccurrenceRef: string | null;
  supportingOccurrenceRefs: string[];
  duplicateHandling: "one_authoritative_contributor" | "supporting_only" | "unresolved";
  reconciliationRefs: string[];
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2SourceModel = {
  sections: CanonicalEconomicsV2SourceSection[];
  occurrences: CanonicalEconomicsV2SourceOccurrence[];
  representationGroups: CanonicalEconomicsV2RepresentationGroup[];
  evidence: CanonicalEconomicsV2EvidenceRecord[];
  parserInterpretations: CanonicalEconomicsV2ParserInterpretation[];
};

export type CanonicalEconomicsV2Fact<T, TPopulation extends string> = {
  id: string;
  status: CanonicalEconomicsV2Availability;
  population: TPopulation;
  populationDefinition: string;
  value: T | null;
  confidence: CanonicalEconomicsV2Confidence | null;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  evidenceRefs: string[];
  occurrenceRefs: string[];
  calculationRef: string | null;
  limitations: string[];
};

export type CanonicalEconomicsV2MoneyPopulation =
  | "gross_sale_volume"
  | "refund_volume"
  | "canonical_net_submitted_card_volume"
  | "third_party_transaction_volume"
  | "total_statement_processing_fees"
  | "fee_credit_amount"
  | "settlement_adjustment_amount"
  | "chargeback_principal_debit_amount"
  | "chargeback_representment_amount"
  | "chargeback_fee_amount"
  | "net_funded_amount"
  | "unresolved_adjustment_chargeback_amount";

export type CanonicalEconomicsV2CountPopulation =
  | "gross_sale_transaction_count"
  | "refund_transaction_count"
  | "submitted_transaction_count"
  | "settled_transaction_count"
  | "authorization_count"
  | "chargeback_count"
  | "funding_batch_count";

export type CanonicalEconomicsV2FinancialPopulations = {
  grossSaleVolume: CanonicalEconomicsV2Fact<MoneyAmount, "gross_sale_volume">;
  refundVolume: CanonicalEconomicsV2Fact<MoneyAmount, "refund_volume">;
  canonicalNetSubmittedCardVolume: CanonicalEconomicsV2Fact<MoneyAmount, "canonical_net_submitted_card_volume">;
  thirdPartyTransactionVolume: CanonicalEconomicsV2Fact<MoneyAmount, "third_party_transaction_volume">;
  totalStatementProcessingFees: CanonicalEconomicsV2Fact<MoneyAmount, "total_statement_processing_fees">;
  feeCreditAmount: CanonicalEconomicsV2Fact<MoneyAmount, "fee_credit_amount">;
  settlementAdjustmentAmount: CanonicalEconomicsV2Fact<MoneyAmount, "settlement_adjustment_amount">;
  chargebackPrincipalDebitAmount: CanonicalEconomicsV2Fact<MoneyAmount, "chargeback_principal_debit_amount">;
  chargebackRepresentmentAmount: CanonicalEconomicsV2Fact<MoneyAmount, "chargeback_representment_amount">;
  chargebackFeeAmount: CanonicalEconomicsV2Fact<MoneyAmount, "chargeback_fee_amount">;
  netFundedAmount: CanonicalEconomicsV2Fact<MoneyAmount, "net_funded_amount">;
  unresolvedAdjustmentChargebackAmount: CanonicalEconomicsV2Fact<MoneyAmount, "unresolved_adjustment_chargeback_amount">;
  grossSaleTransactionCount: CanonicalEconomicsV2Fact<number, "gross_sale_transaction_count">;
  refundTransactionCount: CanonicalEconomicsV2Fact<number, "refund_transaction_count">;
  submittedTransactionCount: CanonicalEconomicsV2Fact<number, "submitted_transaction_count">;
  settledTransactionCount: CanonicalEconomicsV2Fact<number, "settled_transaction_count">;
  authorizationCount: CanonicalEconomicsV2Fact<number, "authorization_count">;
  chargebackCount: CanonicalEconomicsV2Fact<number, "chargeback_count">;
  fundingBatchCount: CanonicalEconomicsV2Fact<number, "funding_batch_count">;
};

export type CanonicalEconomicsV2Calculation = {
  id: string;
  formula:
    | "gross_sales_minus_refunds_equals_net_submitted"
    | "fees_divided_by_net_submitted"
    | "fees_divided_by_gross_sales"
    | "gross_sales_divided_by_gross_sale_count"
    | "sum_source_occurrences";
  policyVersion: string;
  inputFactRefs: string[];
  resultFactRef: string;
};

export type CanonicalEconomicsV2EffectiveRateState =
  | "defined"
  | "undefined_zero_denominator"
  | "unavailable_numerator"
  | "unavailable_denominator"
  | "population_unproven";

export type CanonicalEconomicsV2EffectiveRateMetric = {
  id: string;
  state: CanonicalEconomicsV2EffectiveRateState;
  value: DecimalString | null;
  numeratorFactRef: string;
  denominatorFactRef: string;
  numeratorPopulation: "total_statement_processing_fees";
  denominatorPopulation: "canonical_net_submitted_card_volume" | "gross_sale_volume";
  calculationRef: string | null;
  limitations: string[];
};

export type CanonicalEconomicsV2AverageTicketState =
  | "defined"
  | "undefined_zero_count"
  | "unavailable_numerator"
  | "unavailable_denominator"
  | "population_unproven";

export type CanonicalEconomicsV2AverageTicketMetric = {
  id: string;
  state: CanonicalEconomicsV2AverageTicketState;
  value: MoneyAmount | null;
  numeratorFactRef: string;
  denominatorFactRef: string;
  numeratorPopulation: "gross_sale_volume";
  denominatorPopulation: "gross_sale_transaction_count";
  calculationRef: string | null;
  limitations: string[];
};

export type CanonicalEconomicsV2ReconciliationReference = {
  id: string;
  implementation: "existing_procedural_fiserv" | "approved_synthetic";
  controlIdentity: string;
  status:
    | "pass"
    | "pass_with_rounding"
    | "warning"
    | "fail"
    | "missing_input"
    | "not_applicable";
  factRefs: string[];
  occurrenceRefs: string[];
  evidenceRefs: string[];
  tolerance: string | null;
  limitations: string[];
};

export type CanonicalEconomicsV2BillingAndFunding = {
  billingCadence: "daily" | "monthly" | "mixed" | "unknown" | "unavailable";
  fundingCadence: "daily" | "monthly" | "mixed" | "unknown" | "unavailable";
  submittedVolumeFactRef: string;
  thirdPartyVolumeFactRef: string;
  adjustmentFactRef: string;
  chargebackDebitFactRef: string;
  representmentFactRef: string;
  feeFactRef: string;
  fundedAmountFactRef: string;
  batchCountFactRef: string;
  batchOccurrenceRefs: string[];
  reconciliationRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2SemanticAmendment = {
  id: CanonicalEconomicsV2SemanticAmendmentId;
  factRefs: string[];
  reason: string;
  evidenceRefs: string[];
};

export type CanonicalEconomicsV2VersionManifest = {
  schemaVersion: "canonical_economics_v2_foundation_v1";
  builderVersion: "canonical_economics_v2_builder_v1";
  sourceModelVersion: "canonical_source_model_v2_foundation_v1";
  financialPopulationPolicyVersion: "canonical_financial_populations_v2_foundation_v1";
  effectiveRatePolicyVersion: "canonical_effective_rate_v2_foundation_v1";
  averageTicketPolicyVersion: "canonical_average_ticket_v2_foundation_v1";
  reconciliationReferenceVersion: "canonical_reconciliation_references_v2_foundation_v1";
  authority: "shadow_non_authoritative";
  persistence: "none";
  aiResearchAuthority: "prohibited";
};

export type CanonicalEconomicsV2Foundation = {
  versionManifest: CanonicalEconomicsV2VersionManifest;
  identity: {
    sourceDocumentRef: string;
    sourceFingerprint: string | null;
    sourceFingerprintStatus: "available" | "unavailable" | "unknown";
    parserId: string;
    parserVersion: string | null;
    processorFamily: string | null;
    statementPeriod: { start: string; end: string } | null;
    currency: "USD";
    provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  };
  templateCapability: CanonicalEconomicsV2TemplateProfile;
  documentIntegrity: CanonicalEconomicsV2DocumentIntegrity;
  sourceModel: CanonicalEconomicsV2SourceModel;
  financialPopulations: CanonicalEconomicsV2FinancialPopulations;
  metrics: {
    headlineEffectiveRate: CanonicalEconomicsV2EffectiveRateMetric;
    grossBasedRateDiagnostic: CanonicalEconomicsV2EffectiveRateMetric | null;
    headlineAverageTicket: CanonicalEconomicsV2AverageTicketMetric;
  };
  billingAndFunding: CanonicalEconomicsV2BillingAndFunding;
  reconciliation: CanonicalEconomicsV2ReconciliationReference[];
  calculations: CanonicalEconomicsV2Calculation[];
  semanticAmendments: CanonicalEconomicsV2SemanticAmendment[];
  validation: {
    status: "valid" | "invalid";
    errors: string[];
    warnings: string[];
  };
};

export type CanonicalEconomicsV2ComparisonItem = {
  fact: string;
  classification: CanonicalEconomicsV2DifferenceClassification;
  amendmentId: CanonicalEconomicsV2SemanticAmendmentId | null;
  reasonCode: string;
};

export type CanonicalEconomicsV2ComparisonReport = {
  policyVersion: "canonical_v1_v2_shadow_comparison_v1";
  sourceDocumentRef: string;
  items: CanonicalEconomicsV2ComparisonItem[];
  counts: Record<CanonicalEconomicsV2DifferenceClassification, number>;
  hasUnexpectedDivergence: boolean;
};
