import type { BusinessTypeId } from "./businessTypes.js";
import type { ProcessorDetection } from "./processorDetection.js";

export type StatementSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export const STATEMENT_SLOT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const satisfies readonly StatementSlot[];

export function isStatementSlot(value: unknown): value is StatementSlot {
  const slot = Number(value);
  return Number.isInteger(slot) && STATEMENT_SLOT_VALUES.includes(slot as StatementSlot);
}

export type StatementAnalysisStatus = "completed";
export const STATEMENT_ANALYSIS_STATUS_VALUES = ["completed"] as const satisfies readonly StatementAnalysisStatus[];

export type JobStatus =
  | "queued"
  | "verifying_statement"
  | "identifying_processor"
  | "extracting_fee_line_items"
  | "calculating_effective_rate"
  | "comparing_to_benchmark"
  | "completed"
  | "failed";

export const JOB_STATUS_VALUES = [
  "queued",
  "verifying_statement",
  "identifying_processor",
  "extracting_fee_line_items",
  "calculating_effective_rate",
  "comparing_to_benchmark",
  "completed",
  "failed",
] as const satisfies readonly JobStatus[];

export type Stage = Exclude<JobStatus, "queued" | "completed" | "failed">;

export type JobEvent = {
  at: string;
  stage: JobStatus;
  message: string;
};

export type DynamicField = {
  label: string;
  value: number;
  confidence: number;
};

export type FeeInsight = {
  title: string;
  detail: string;
  impactUsd: number;
};

export type FeeBroadType = "Pass-through" | "Processor" | "Service / compliance" | "Unknown";
export type FeeClass =
  | "card_brand_pass_through"
  | "processor_markup"
  | "processor_transaction_or_auth"
  | "processor_service_add_on"
  | "compliance_remediation"
  | "unknown";
export type FeeClassificationConfidence = "high" | "medium" | "low";

export type FeeBreakdownRow = {
  label: string;
  amount: number;
  sharePct: number;
  feeClass?: FeeClass;
  broadType?: FeeBroadType;
  sourceSection?: string;
  evidenceLine?: string;
  classificationConfidence?: FeeClassificationConfidence;
  classificationRule?: string;
  classificationReason?: string;
};

export type StatementSectionType =
  | "summary"
  | "interchange_detail"
  | "processor_markup"
  | "add_on_fees"
  | "notices"
  | "unknown";

export type StatementSection = {
  type: StatementSectionType;
  title: string;
  rowCount: number;
  confidence: number;
  evidenceLines: string[];
};

export type StatementEconomicBucket = "card_brand_pass_through" | "processor_markup" | "add_on_fees";

export type StatementEconomicFeeRow = {
  label: string;
  amount: number;
  bucket: StatementEconomicBucket;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type StatementEconomicRollup = {
  totalVolume: number | null;
  totalFees: number | null;
  cardBrandPassThrough: number | null;
  processorMarkup: number | null;
  addOnFees: number | null;
  feeRows: StatementEconomicFeeRow[];
  confidence: number;
};

export type StructuredFeeFindingKind =
  | "pci_non_compliance"
  | "non_emv"
  | "risk_fee"
  | "customer_intelligence_suite";

export type StructuredFeeFinding = {
  kind: StructuredFeeFindingKind;
  label: string;
  amountUsd: number | null;
  ratePercent: number | null;
  affectedVolumeUsd: number | null;
  estimatedImpactUsd: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type BundledPricingQualification = "qualified" | "mid_qualified" | "non_qualified" | "unknown";

export type BundledPricingBucket = {
  qualification: BundledPricingQualification;
  label: string;
  ratePercent: number | null;
  volumeUsd: number | null;
  transactionCount: number | null;
  feeAmountUsd: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type BundledPricingModel = {
  active: boolean;
  buckets: BundledPricingBucket[];
  highestRatePercent: number | null;
  totalVolumeUsd: number | null;
  totalFeesUsd: number | null;
  confidence: number;
};

export type NoticeFindingKind = "fee_change" | "online_only" | "acceptance_by_use" | "effective_date";

export type NoticeFinding = {
  kind: NoticeFindingKind;
  effectiveDate: string | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type RepricingEventKind = "fee_increase" | "new_fee" | "rate_increase";
export type RepricingValueType = "money" | "percentage" | "basis_points";
export type RepricingCadence = "monthly" | "annual" | "per_item" | "one_time" | "unknown";
export type RepricingValueSource = "explicit" | "inferred";
export type RepricingDisclosureStyle = "explicit_on_statement" | "online_only" | "acceptance_by_use" | "ambiguous";

export type RepricingValue = {
  value: number;
  valueType: RepricingValueType;
  cadence: RepricingCadence;
  source: RepricingValueSource;
};

export type RepricingEvent = {
  kind: RepricingEventKind;
  feeLabel: string | null;
  oldValue: RepricingValue | null;
  newValue: RepricingValue | null;
  deltaValue: RepricingValue | null;
  effectiveDate: string | null;
  disclosureStyle: RepricingDisclosureStyle;
  sourceSection: string;
  evidenceLine: string;
  evidenceLines: string[];
  rowStartIndex: number;
  rowEndIndex: number;
  confidence: number;
};

export type DowngradeFindingRow = {
  label: string;
  indicators: string[];
  transactionCount: number | null;
  volumeUsd: number | null;
  totalPaidUsd: number | null;
  estimatedPenaltyLowUsd: number | null;
  estimatedPenaltyHighUsd: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type DowngradeAnalysis = {
  rows: DowngradeFindingRow[];
  affectedVolumeUsd: number | null;
  estimatedPenaltyLowUsd: number | null;
  estimatedPenaltyHighUsd: number | null;
  confidence: number;
};

export type CardBrand = "Visa" | "Mastercard" | "Discover" | "AmEx" | "Unknown";

export type InterchangeAuditRow = {
  label: string;
  cardBrand: CardBrand;
  cardType?: string;
  entryMode?: string;
  transactionCount: number | null;
  volume: number | null;
  ratePercent: number | null;
  rateBps: number | null;
  perItemFee: number | null;
  totalPaid: number | null;
  expectedTotalPaid: number | null;
  variance: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
  downgradeIndicators: string[];
};

export type InterchangeAuditSummary = {
  rows: InterchangeAuditRow[];
  rowCount: number;
  transactionCount: number | null;
  volume: number | null;
  totalPaid: number | null;
  weightedAverageRateBps: number | null;
  totalVariance: number | null;
  confidence: number;
};

export type BlendedFeeSplitComponent = {
  ratePercent: number | null;
  rateBps: number | null;
  perItemFee: number | null;
  totalPaid: number | null;
  expectedTotalPaid: number | null;
};

export type BlendedFeeSplit = {
  label: string;
  cardBrand: CardBrand;
  cardType?: string;
  transactionCount: number | null;
  volume: number | null;
  processorMarkup: BlendedFeeSplitComponent;
  interchange: BlendedFeeSplitComponent;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type ProcessorMarkupAuditRow = {
  label: string;
  cardBrand: CardBrand;
  cardType?: string;
  transactionCount: number | null;
  volume: number | null;
  ratePercent: number | null;
  rateBps: number | null;
  effectiveRateBps: number | null;
  perItemFee: number | null;
  totalPaid: number | null;
  expectedTotalPaid: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type ProcessorMarkupAuditSummary = {
  rows: ProcessorMarkupAuditRow[];
  rowCount: number;
  transactionCount: number | null;
  volume: number | null;
  totalPaid: number | null;
  weightedAverageRateBps: number | null;
  effectiveRateBps: number | null;
  confidence: number;
};

export type HiddenMarkupAuditRowStatus = "pass" | "warning" | "unknown";

export type InterchangeScheduleMatch = {
  referenceId: string;
  version: string;
  brand: CardBrand;
  descriptor: string;
  rateBps: number;
  perItemFee: number;
  source: string;
  confidence: number;
};

export type HiddenMarkupAuditRow = {
  label: string;
  cardBrand: CardBrand;
  transactionCount: number | null;
  volume: number | null;
  actualTotalPaid: number | null;
  expectedCardBrandCost: number | null;
  expectedRateBps: number | null;
  expectedPerItemFee: number | null;
  embeddedMarkupUsd: number | null;
  embeddedMarkupBps: number | null;
  status: HiddenMarkupAuditRowStatus;
  reason: string;
  scheduleMatch: InterchangeScheduleMatch | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type HiddenMarkupAuditSummary = {
  rows: HiddenMarkupAuditRow[];
  rowCount: number;
  matchedRowCount: number;
  flaggedRowCount: number;
  hiddenMarkupUsd: number | null;
  hiddenMarkupBps: number | null;
  status: "pass" | "warning" | "unknown" | "not_applicable";
  confidence: number;
};

export type PerItemFeeComponent = {
  kind: "transaction" | "authorization";
  amount: number;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type PerItemFeeModel = {
  transactionFee: number | null;
  authorizationFee: number | null;
  allInPerItemFee: number | null;
  components: PerItemFeeComponent[];
  confidence: number;
};

export type MonthlyMinimumModel = {
  minimumUsd: number | null;
  actualMarkupUsd: number | null;
  monthlyVolumeUsd: number | null;
  topUpUsd: number | null;
  effectiveMarkupUsd: number | null;
  effectiveRateImpactPct: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type ExpressFundingPremiumModel = {
  fundingVolumeUsd: number | null;
  premiumBps: number | null;
  premiumUsd: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type SavingsShareAdjustmentModel = {
  savingsSharePct: number | null;
  grossSavingsUsd: number | null;
  retainedSavingsUsd: number | null;
  sourceSection: string;
  evidenceLine: string;
  rowIndex: number;
  confidence: number;
};

export type Level3OptimizationModel = {
  eligible: boolean;
  confidence: number;
  eligibleVolumeUsd: number | null;
  rateDeltaBps: number | null;
  requiredFields: string[];
  capturedFields: string[];
  missingFields: string[];
  detectedSignals: string[];
  estimatedMonthlySavingsUsd: number | null;
  estimatedAnnualSavingsUsd: number | null;
  evidence: string[];
};

export type GuideMeasureModel = {
  monthlyMinimum: MonthlyMinimumModel | null;
  expressFundingPremium: ExpressFundingPremiumModel | null;
  savingsShareAdjustment: SavingsShareAdjustmentModel | null;
};

export type BenchmarkStatus = "below" | "within" | "above";
export const BENCHMARK_STATUS_VALUES = ["below", "within", "above"] as const satisfies readonly BenchmarkStatus[];

export type BenchmarkResult = {
  segment: string;
  lowerRate: number;
  upperRate: number;
  status: BenchmarkStatus;
  deltaFromUpperRate: number;
};

export type KpiMetric = {
  label: string;
  value: string;
  note: string;
};

export type SuspiciousFee = {
  label: string;
  amount: number;
  reason: string;
  severity: "low" | "medium" | "high";
};

export type SavingsOpportunity = {
  title: string;
  detail: string;
  monthlySavingsUsd: number;
  annualSavingsUsd: number;
  effort: "low" | "medium" | "high";
};

export type TrendPoint = {
  period: string;
  volume: number;
  fees: number;
  effectiveRate: number;
};

export type DataQualitySignal = {
  level: "info" | "warning" | "critical";
  message: string;
};

export type RuleStatus = "pass" | "fail" | "warning" | "unknown" | "not_applicable";

export type ChecklistRuleResult = {
  id: string;
  title: string;
  status: RuleStatus;
  reason: string;
  evidence: string[];
};

export type ChecklistBucket = {
  total: number;
  pass: number;
  fail: number;
  warning: number;
  unknown: number;
  notApplicable: number;
  results: ChecklistRuleResult[];
};

export type ChecklistReport = {
  extractionMode: "structured" | "text_only" | "unusable";
  extractionQualityScore: number;
  extractionReasons: string[];
  processorDetection: ProcessorDetection;
  universal: ChecklistBucket;
  processorSpecific: ChecklistBucket & {
    processorId: string | null;
    processorName: string | null;
    skippedReason?: string;
  };
  crossProcessor: ChecklistBucket;
};

export type PublicChecklistFindingStatus = Extract<RuleStatus, "fail" | "warning" | "unknown">;

export type PublicChecklistFinding = Omit<Pick<ChecklistRuleResult, "title" | "status" | "reason" | "evidence">, "status"> & {
  bucket: "universal" | "processorSpecific" | "crossProcessor";
  status: PublicChecklistFindingStatus;
};

export type PublicChecklistReport = {
  extractionMode: ChecklistReport["extractionMode"];
  extractionQualityScore: number;
  extractionReasons: string[];
  processorName: string | null;
  counts: {
    total: number;
    fail: number;
    warning: number;
    unknown: number;
  };
  findings: PublicChecklistFinding[];
};

export type FeeDriftFindingKind =
  | "new_fee"
  | "removed_fee"
  | "recurring_fee_added"
  | "amount_increase"
  | "rate_increase"
  | "per_item_increase"
  | "repricing_notice"
  | "opaque_change";

export type FeeDriftSeverity = "info" | "warning" | "critical";

export type FeeDriftFinding = {
  kind: FeeDriftFindingKind;
  severity: FeeDriftSeverity;
  label: string;
  normalizedKey: string;
  bucket: StatementEconomicBucket | "per_item" | "repricing" | "unknown";
  earlierAmountUsd: number | null;
  laterAmountUsd: number | null;
  amountDeltaUsd: number | null;
  earlierRateBps: number | null;
  laterRateBps: number | null;
  rateDeltaBps: number | null;
  earlierPerItemUsd: number | null;
  laterPerItemUsd: number | null;
  perItemDeltaUsd: number | null;
  reason: string;
  evidence: string[];
  confidence: FeeClassificationConfidence;
};

export type FeeDriftReport = {
  status: "pass" | "warning" | "unknown";
  summary: string;
  comparedFeeCount: number;
  findings: FeeDriftFinding[];
};

export type AggregateAuditMetric =
  | "effective_rate"
  | "total_fees"
  | "volume"
  | "processor_markup"
  | "card_brand_pass_through";

export type AggregateAuditTrendDirection = "up" | "down" | "flat" | "baseline" | "unknown";

export type AggregateAuditTrendPoint = {
  statementId: number;
  period: string;
  periodKey: string;
  value: number | null;
};

export type AggregateAuditTrend = {
  metric: AggregateAuditMetric;
  label: string;
  unit: "percent" | "money" | "bps";
  points: AggregateAuditTrendPoint[];
  observedPointCount: number;
  firstValue: number | null;
  latestValue: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  averageMonthlyChange: number | null;
  direction: AggregateAuditTrendDirection;
  confidence: "high" | "medium" | "low";
  note: string;
};

export type AggregateAuditFeeTimelineEntry = {
  normalizedKey: string;
  label: string;
  bucket: StatementEconomicBucket | "per_item" | "repricing" | "unknown";
  origin: "line_item" | "modeled" | "rollup";
  monthsPresent: number;
  firstSeenPeriod: string;
  lastSeenPeriod: string;
  totalObservedUsd: number | null;
  latestAmountUsd: number | null;
  latestRateBps: number | null;
  latestPerItemUsd: number | null;
  recurring: boolean;
  knownUnwanted: boolean;
  evidence: string[];
  confidence: FeeClassificationConfidence;
};

export type AggregateAuditFeeChanges = {
  newFees: AggregateAuditFeeTimelineEntry[];
  removedFees: AggregateAuditFeeTimelineEntry[];
  recurringNuisanceFees: AggregateAuditFeeTimelineEntry[];
  feeIncreases: FeeDriftFinding[];
  driftFindings: FeeDriftFinding[];
};

export type AggregateAuditBenchmark = {
  monthsAboveBenchmark: number;
  monthsWithinBenchmark: number;
  monthsBelowBenchmark: number;
  aboveBenchmarkPeriods: string[];
  averageEffectiveRate: number | null;
  averageBenchmarkHigh: number | null;
  worstBenchmarkGap: number | null;
};

export type AggregateAuditOverpayment = {
  observedOverpaymentUsd: number;
  averageMonthlyOverpaymentUsd: number;
  annualizedOverpaymentUsd: number;
  calculation: "benchmark_ceiling_delta";
  confidence: "high" | "medium" | "low";
};

export type AggregateAuditMonthScore = {
  statementId: number;
  period: string;
  periodKey: string;
  effectiveRate: number;
  totalFees: number;
  totalVolume: number;
  processorMarkupBps: number | null;
  benchmarkOverpaymentUsd: number;
  nuisanceFeeUsd: number;
  score: number;
  reasons: string[];
};

export type AggregateAuditVerdictStatus = "healthy" | "watch" | "overpaying" | "urgent" | "unknown";

export type AggregateAuditVerdict = {
  status: AggregateAuditVerdictStatus;
  title: string;
  summary: string;
  reasons: string[];
  recommendedActions: string[];
  confidence: "high" | "medium" | "low";
};

export type AggregateAuditReport = {
  statementCount: number;
  observedPeriods: string[];
  coverage: {
    requestedStatementLimit: number;
    hasFullTwelveMonthHistory: boolean;
    missingMetricNotes: string[];
  };
  trends: Record<AggregateAuditMetric, AggregateAuditTrend>;
  feeChanges: AggregateAuditFeeChanges;
  benchmark: AggregateAuditBenchmark;
  annualizedOverpayment: AggregateAuditOverpayment;
  bestMonth: AggregateAuditMonthScore | null;
  worstMonth: AggregateAuditMonthScore | null;
  verdict: AggregateAuditVerdict;
  dataQuality: DataQualitySignal[];
};

export type AnalysisSummary = {
  businessType: BusinessTypeId;
  processorName: string;
  sourceType: "csv" | "pdf";
  statementPeriod: string;
  executiveSummary: string;
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  estimatedMonthlyVolume: number;
  estimatedMonthlyFees: number;
  estimatedAnnualFees: number;
  estimatedAnnualSavings: number;
  benchmark: BenchmarkResult;
  statementSections: StatementSection[];
  interchangeAudit: InterchangeAuditSummary;
  interchangeAuditRows: InterchangeAuditRow[];
  blendedFeeSplits: BlendedFeeSplit[];
  processorMarkupAudit: ProcessorMarkupAuditSummary;
  hiddenMarkupAudit: HiddenMarkupAuditSummary;
  structuredFeeFindings: StructuredFeeFinding[];
  bundledPricing: BundledPricingModel;
  noticeFindings: NoticeFinding[];
  repricingEvents?: RepricingEvent[];
  downgradeAnalysis: DowngradeAnalysis;
  perItemFeeModel: PerItemFeeModel;
  guideMeasures: GuideMeasureModel;
  level3Optimization: Level3OptimizationModel;
  kpis: KpiMetric[];
  feeBreakdown: FeeBreakdownRow[];
  suspiciousFees: SuspiciousFee[];
  savingsOpportunities: SavingsOpportunity[];
  negotiationChecklist: string[];
  actionPlan: string[];
  trend: TrendPoint[];
  dataQuality: DataQualitySignal[];
  dynamicFields: DynamicField[];
  insights: FeeInsight[];
  confidence: "high" | "medium" | "low";
  checklistReport?: ChecklistReport;
};

export type PublicReportSummary = Pick<
  AnalysisSummary,
  | "businessType"
  | "processorName"
  | "sourceType"
  | "statementPeriod"
  | "executiveSummary"
  | "totalVolume"
  | "totalFees"
  | "estimatedMonthlyVolume"
  | "estimatedMonthlyFees"
  | "effectiveRate"
  | "benchmark"
  | "confidence"
  | "dataQuality"
> & {
  checklistReport?: PublicChecklistReport;
};

export type Job = {
  id: string;
  uploadId?: string | null;
  fileName: string;
  filePath: string;
  fileType: "csv" | "pdf";
  businessType: BusinessTypeId;
  merchantId?: number | null;
  statementSlot?: StatementSlot | null;
  replaceStatementId?: number | null;
  detectedStatementPeriod?: string | null;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  progress: number;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt?: string | null;
  events: JobEvent[];
  error?: string;
  summary?: AnalysisSummary;
};
