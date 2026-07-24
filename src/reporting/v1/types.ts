import type { BusinessTypeId } from "../../businessTypes.js";

export type ContractVersion = "single_statement_report_v1";
export type ValueStatus = "observed" | "calculated" | "estimated" | "verification_required" | "unavailable";
export type ConfidenceLevel = "high" | "medium" | "low";

export type ReportStateCode =
  | "unable_to_analyze"
  | "reconciliation_failure"
  | "low_confidence"
  | "verification_required"
  | "material_overpayment"
  | "above_benchmark_review"
  | "healthy_with_opportunities"
  | "healthy";

export type ReportStateReasonCode =
  | "not_a_processing_statement"
  | "unreadable_document"
  | "incomplete_statement"
  | "parser_blocked"
  | "missing_core_totals"
  | "conflicting_totals"
  | "fee_coverage_insufficient"
  | "reconciliation_delta_exceeded"
  | "analysis_confidence_low"
  | "benchmark_unavailable"
  | "pricing_model_unconfirmed"
  | "material_verification_amount"
  | "documentation_required"
  | "material_benchmark_gap"
  | "material_processor_cost"
  | "rate_above_benchmark"
  | "competitive_rate_with_findings"
  | "competitive_rate_no_findings";

export type ReportState = {
  code: ReportStateCode;
  reasons: ReportStateReasonCode[];
  confidence: ConfidenceLevel;
  evaluatedAt: string;
};

export type ReportComponentId =
  | "verdict"
  | "core_metrics"
  | "benchmark"
  | "pricing_model"
  | "fee_composition"
  | "fee_inventory"
  | "opportunity_summary"
  | "findings"
  | "positive_findings"
  | "action_toolkit"
  | "evidence"
  | "methodology";

export type OmissionReasonCode =
  | "not_applicable"
  | "not_extracted"
  | "not_verified"
  | "low_confidence"
  | "benchmark_unavailable"
  | "reconciliation_failed"
  | "coverage_insufficient"
  | "no_supported_findings"
  | "no_material_opportunity"
  | "parser_blocked"
  | "unsupported_processor"
  | "insufficient_evidence";

export type ReportValue<T> = {
  value: T | null;
  status: ValueStatus;
  confidence: ConfidenceLevel | null;
  displayLabel?: string;
  explanation?: string;
  evidenceRefs: string[];
  calculationRef?: string;
  unavailableReason?: OmissionReasonCode;
};

export type ReportIdentity = {
  merchantName: ReportValue<string>;
  processorName: ReportValue<string>;
  statementPeriod: ReportValue<string>;
  businessType: ReportValue<string> & {
    businessTypeId: BusinessTypeId | null;
  };
  sourceFileName?: string;
  statementsAnalyzed: 1;
};

export type ExtractionMode = "structured" | "text_only" | "unusable";

export type DataQualityReason = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  affectedComponents: ReportComponentId[];
};

export type DataQualitySummary = {
  extractionMode: ExtractionMode;
  overallConfidence: ConfidenceLevel;
  qualityScore: number | null;
  reportable: boolean;
  customerFacingTotalsAllowed: boolean;
  feeClassificationAllowed: boolean;
  reasons: DataQualityReason[];
};

export type ReconciliationStatus = "pass" | "warning" | "fail" | "not_available";

export type ReconciliationSummary = {
  status: ReconciliationStatus;
  totalFees: ReportValue<number>;
  classifiedFeesTotal: ReportValue<number>;
  unclassifiedAmount: ReportValue<number>;
  coveragePct: ReportValue<number>;
  deltaUsd: ReportValue<number>;
  toleranceUsd: number | null;
  reasons: string[];
};

export type VerdictTone = "positive" | "caution" | "negative" | "verification" | "limited" | "blocked";
export type ActionType =
  | "retry_upload"
  | "resolve_statement_conflict"
  | "request_documentation"
  | "renegotiate"
  | "compare_quotes"
  | "request_removal"
  | "monitor";

export type ReportVerdict = {
  tone: VerdictTone;
  eyebrow: string;
  title: string;
  summary: string;
  supportingPoints: string[];
  primaryAction: ActionType;
};

export type ReportMetrics = {
  processedSales: ReportValue<number>;
  totalFees: ReportValue<number>;
  effectiveRate: ReportValue<number>;
  transactionCount: ReportValue<number>;
  averageTicket: ReportValue<number>;
};

export type BenchmarkStatus = "below" | "within" | "above" | "unavailable";

export type BenchmarkSource = {
  sourceId: string;
  name: string;
  version: string;
  effectiveDate?: string;
  methodologyLabel: string;
};

export type BenchmarkPresentation = {
  status: BenchmarkStatus;
  eligible: boolean;
  segment: string | null;
  lowerRate: number | null;
  upperRate: number | null;
  effectiveRate: number | null;
  deltaFromUpperRate: number | null;
  source: BenchmarkSource | null;
  confidence: ConfidenceLevel;
  omissionReason?: OmissionReasonCode;
};

export type PricingModelCode = "interchange_plus" | "itemized" | "tiered" | "bundled" | "flat_rate" | "mixed" | "unknown";

export type PricingRate = {
  label: string;
  ratePct: number | null;
  perItemUsd: number | null;
  volumeUsd: number | null;
  transactionCount: number | null;
  confidence: ConfidenceLevel;
};

export type PricingModelPresentation = {
  model: PricingModelCode;
  label: string;
  confidence: ConfidenceLevel;
  status: "favorable" | "review" | "verify" | "unknown";
  explanation: string;
  observedRates: PricingRate[];
  evidenceRefs: string[];
  recommendation: string | null;
};

export type FeeCategoryCode = "card_brand_network" | "processor_fees" | "service_compliance" | "needs_review";
export type ChargeCadence = "monthly" | "annual" | "per_item" | "one_time" | "unknown";
export type FindingDisposition = "renegotiate" | "request_removal" | "verify" | "monitor";

export type FeeCompositionPresentation = {
  status: "available" | "partial" | "unavailable";
  totalFees: number | null;
  rows: FeeCompositionRow[];
  coveragePct: number | null;
  deltaUsd: number | null;
  omissionReason?: OmissionReasonCode;
};

export type FeeCompositionRow = {
  category: FeeCategoryCode;
  label: string;
  amountUsd: number;
  pctOfProcessedSales: number | null;
  pctOfTotalFees: number | null;
  confidence: ConfidenceLevel;
  feeRefs: string[];
};

export type FeeInventoryPresentation = {
  status: "available" | "partial" | "unavailable";
  rows: FeeInventoryRow[];
  observedRowCount: number;
  displayedRowCount: number;
  omissionReason?: OmissionReasonCode;
};

export type FeeInventoryRow = {
  id: string;
  originalLabel: string;
  displayLabel: string;
  observedAmountUsd: number;
  cadence: ChargeCadence;
  category: FeeCategoryCode;
  classificationConfidence: ConfidenceLevel;
  classificationExplanation: string | null;
  disposition: FindingDisposition | "none";
  observedRatePct: number | null;
  observedPerItemUsd: number | null;
  observedItemCount: number | null;
  comparisonTargetType: "none" | "benchmark" | "network_schedule" | "negotiation_target" | "contract_documentation";
  targetRatePct: number | null;
  targetPerItemUsd: number | null;
  differenceUsd: number | null;
  calculationRef?: string;
  findingId: string | null;
  evidenceRefs: string[];
};

export type AnnualizationBasis = "none" | "monthly_charge_times_12" | "modeled_future_volume" | "mixed";

export type OpportunitySummary = {
  deterministicMonthlyImpactUsd: number;
  deterministicAnnualImpactUsd: number;
  estimatedMonthlyOpportunityUsd: number;
  estimatedAnnualOpportunityUsd: number;
  totalEligibleMonthlyOpportunityUsd: number;
  totalEligibleAnnualOpportunityUsd: number;
  verificationMonthlyAmountUsd: number;
  verificationAnnualizedAmountUsd: number | null;
  currency: "USD";
  annualizationBasis: AnnualizationBasis;
  includedFindingIds: string[];
  excludedFindingIds: string[];
};

export type FindingCategory =
  | "pricing"
  | "processor_markup"
  | "per_item_fee"
  | "service_fee"
  | "compliance"
  | "network_fee"
  | "downgrade"
  | "authorization"
  | "dispute"
  | "data_quality"
  | "other";

export type ImpactClassification = "deterministic" | "estimated" | "verification_only" | "non_financial";

export type ReportFinding = {
  id: string;
  sourceFindingType: string;
  category: FindingCategory;
  disposition: FindingDisposition;
  impactClassification: ImpactClassification;
  title: string;
  explanation: string;
  merchantAction: string;
  processorQuestion: string;
  currentMonthlyAmountUsd: number | null;
  currentAnnualizedAmountUsd: number | null;
  cadence: ChargeCadence;
  targetMonthlyAmountUsd: number | null;
  targetRatePct: number | null;
  estimatedMonthlyImpactUsd: number | null;
  estimatedAnnualImpactUsd: number | null;
  impactLevel: "high" | "medium" | "low" | "unknown";
  easeLevel: "easy" | "moderate" | "difficult" | "unknown";
  confidence: ConfidenceLevel;
  originalStatementLabels: string[];
  feeRowIds: string[];
  evidenceRefs: string[];
  calculationRef?: string;
  assumptions: string[];
  limitations: string[];
  includedInOpportunityTotal: boolean;
  rank: number;
  aggregationKey?: string;
  supersedesFindingIds?: string[];
  overlapRisk?: "none" | "possible";
};

export type PositiveFinding = {
  id: string;
  title: string;
  explanation: string;
  confidence: ConfidenceLevel;
  evidenceRefs: string[];
};

export type ActionStep = {
  id: string;
  order: number;
  action: ActionType;
  title: string;
  instruction: string;
  relatedFindingIds: string[];
};

export type ActionToolkit = {
  primaryAction: ActionType;
  summary: string;
  prioritizedSteps: ActionStep[];
  processorQuestions: string[];
  negotiationChecklist: string[];
  requiredDocuments: string[];
  followUpChecks: string[];
};

export type EvidenceRef = {
  id: string;
  type: "statement_line" | "statement_section" | "calculation_input" | "reference_schedule";
  statementPage?: number | null;
  statementSection?: string | null;
  originalLabel?: string | null;
  excerpt?: string | null;
  sourceId?: string | null;
  confidence: ConfidenceLevel;
};

export type CalculationInput = {
  label: string;
  value: number;
  unit: "money" | "percent" | "bps" | "count";
  evidenceRefs: string[];
};

export type CalculationRecord = {
  id: string;
  formulaCode: string;
  formulaLabel: string;
  inputs: CalculationInput[];
  result: number;
  unit: "money" | "percent" | "bps" | "count";
  assumptions: string[];
  confidence: ConfidenceLevel;
};

export type ReportDetails = {
  evidence: EvidenceRef[];
  calculations: CalculationRecord[];
};

export type MethodologySummary = {
  statementCount: 1;
  benchmarkMethod: string | null;
  savingsMethod: string;
  reconciliationMethod: string;
  confidenceMethod: string;
};

export type ReportLimitation = {
  code:
    | "single_statement_snapshot"
    | "future_volume_may_change"
    | "card_mix_may_change"
    | "processor_approval_required"
    | "contract_terms_not_reviewed"
    | "benchmark_not_available"
    | "partial_extraction"
    | "classification_incomplete"
    | "other";
  message: string;
  severity: "info" | "warning";
  affectedFindingIds: string[];
};

export type ComponentVisibility = {
  status: "show" | "limited" | "hide";
  reason?: OmissionReasonCode;
  message?: string;
};

export type ComponentVisibilityMap = Record<ReportComponentId, ComponentVisibility>;

export type SingleStatementReportV1 = {
  contractVersion: ContractVersion;
  policyVersion: string;
  reportId: string;
  generatedAt: string;
  reportState: ReportState;
  identity: ReportIdentity;
  dataQuality: DataQualitySummary;
  reconciliation: ReconciliationSummary;
  metrics: ReportMetrics;
  opportunitySummary: OpportunitySummary;
  componentVisibility: ComponentVisibilityMap;
  verdict: ReportVerdict;
  benchmark: BenchmarkPresentation;
  pricingModel: PricingModelPresentation;
  feeComposition: FeeCompositionPresentation;
  feeInventory: FeeInventoryPresentation;
  findings: ReportFinding[];
  positiveFindings: PositiveFinding[];
  actionToolkit: ActionToolkit;
  details: ReportDetails;
  methodology: MethodologySummary;
  limitations: ReportLimitation[];
};
