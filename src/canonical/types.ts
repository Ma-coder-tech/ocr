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
  formulaCode: "ratereveal_all_in_effective_rate" | "average_ticket";
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
  evidence: CanonicalEvidenceRecord[];
  calculations: CanonicalCalculationRecord[];
  validation: CanonicalValidationState;
  versionManifest: CanonicalAnalysisVersionManifest;
};
