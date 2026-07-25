export type BusinessTypeId =
  | "restaurant_food_beverage"
  | "retail"
  | "ecommerce"
  | "healthcare"
  | "hospitality"
  | "high_risk"
  | "professional_services"
  | "other";

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

export type ReportValue<T> = {
  value: T | null;
  status: ValueStatus;
  confidence: ConfidenceLevel | null;
  displayLabel?: string;
  explanation?: string;
  evidenceRefs: string[];
  calculationRef?: string;
  unavailableReason?: string;
};

export type ReportIdentity = {
  merchantName: ReportValue<string>;
  processorName: ReportValue<string>;
  statementPeriod: ReportValue<string>;
  businessType: ReportValue<string> & { businessTypeId: BusinessTypeId | null };
  sourceFileName?: string;
  statementsAnalyzed: 1;
};

export type ReportState = {
  code: ReportStateCode;
  reasons: string[];
  confidence: ConfidenceLevel;
  evaluatedAt: string;
};

export type DataQualitySummary = {
  extractionMode: "structured" | "text_only" | "unusable";
  overallConfidence: ConfidenceLevel;
  qualityScore: number | null;
  reportable: boolean;
  customerFacingTotalsAllowed: boolean;
  feeClassificationAllowed: boolean;
  reasons: Array<{
    code: string;
    severity: "info" | "warning" | "critical";
    message: string;
    affectedComponents: ReportComponentId[];
  }>;
};

export type ReconciliationSummary = {
  status: "pass" | "warning" | "fail" | "not_available";
  totalFees: ReportValue<number>;
  classifiedFeesTotal: ReportValue<number>;
  unclassifiedAmount: ReportValue<number>;
  coveragePct: ReportValue<number>;
  deltaUsd: ReportValue<number>;
  toleranceUsd: number | null;
  reasons: string[];
};

export type ActionType =
  | "retry_upload"
  | "resolve_statement_conflict"
  | "request_documentation"
  | "renegotiate"
  | "compare_quotes"
  | "request_removal"
  | "monitor";

export type ReportVerdict = {
  tone: "positive" | "caution" | "negative" | "verification" | "limited" | "blocked";
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

export type BenchmarkPresentation = {
  status: "below" | "within" | "above" | "unavailable";
  eligible: boolean;
  segment: string | null;
  lowerRate: number | null;
  upperRate: number | null;
  effectiveRate: number | null;
  deltaFromUpperRate: number | null;
  source: {
    sourceId: string;
    name: string;
    version: string;
    effectiveDate?: string;
    methodologyLabel: string;
  } | null;
  confidence: ConfidenceLevel;
  omissionReason?: string;
};

export type PricingModelPresentation = {
  model: "interchange_plus" | "itemized" | "tiered" | "bundled" | "flat_rate" | "mixed" | "unknown";
  label: string;
  confidence: ConfidenceLevel;
  status: "favorable" | "review" | "verify" | "unknown";
  explanation: string;
  observedRates: Array<{
    label: string;
    ratePct: number | null;
    perItemUsd: number | null;
    volumeUsd: number | null;
    transactionCount: number | null;
    confidence: ConfidenceLevel;
  }>;
  evidenceRefs: string[];
  recommendation: string | null;
};

export type FeeCategoryCode = "card_brand_network" | "processor_fees" | "service_compliance" | "needs_review";
export type ChargeCadence = "monthly" | "annual" | "per_item" | "one_time" | "unknown";
export type FindingDisposition = "renegotiate" | "request_removal" | "verify" | "monitor";

export type FeeCompositionRow = {
  category: FeeCategoryCode;
  label: string;
  amountUsd: number;
  pctOfProcessedSales: number | null;
  pctOfTotalFees: number | null;
  confidence: ConfidenceLevel;
  feeRefs: string[];
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
  relatedFindingIds?: string[];
  evidenceRefs: string[];
};

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
  annualizationBasis: "none" | "monthly_charge_times_12" | "modeled_future_volume" | "mixed";
  includedFindingIds: string[];
  excludedFindingIds: string[];
};

export type ReportFinding = {
  id: string;
  sourceFindingType: string;
  category: string;
  disposition: FindingDisposition;
  impactClassification: "deterministic" | "estimated" | "verification_only" | "non_financial";
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

export type CalculationRecord = {
  id: string;
  formulaCode: string;
  formulaLabel: string;
  inputs: Array<{
    label: string;
    value: number;
    unit: "money" | "percent" | "bps" | "count";
    evidenceRefs: string[];
  }>;
  result: number;
  unit: "money" | "percent" | "bps" | "count";
  assumptions: string[];
  confidence: ConfidenceLevel;
};

export type ComponentVisibility = {
  status: "show" | "limited" | "hide";
  reason?: string;
  message?: string;
};

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
  componentVisibility: Record<ReportComponentId, ComponentVisibility>;
  verdict: ReportVerdict;
  benchmark: BenchmarkPresentation;
  pricingModel: PricingModelPresentation;
  feeComposition: {
    status: "available" | "partial" | "unavailable";
    totalFees: number | null;
    rows: FeeCompositionRow[];
    coveragePct: number | null;
    deltaUsd: number | null;
    omissionReason?: string;
  };
  feeInventory: {
    status: "available" | "partial" | "unavailable";
    rows: FeeInventoryRow[];
    observedRowCount: number;
    displayedRowCount: number;
    omissionReason?: string;
  };
  findings: ReportFinding[];
  positiveFindings: PositiveFinding[];
  actionToolkit: unknown;
  details: {
    evidence: EvidenceRef[];
    calculations: CalculationRecord[];
  };
  methodology: {
    statementCount: 1;
    benchmarkMethod: string | null;
    savingsMethod: string;
    reconciliationMethod: string;
    confidenceMethod: string;
  };
  limitations: Array<{
    code: string;
    message: string;
    severity: "info" | "warning";
    affectedFindingIds: string[];
  }>;
};
