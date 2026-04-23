import type { BusinessTypeId } from "./businessTypes.js";
import type { ProcessorDetection } from "./processorDetection.js";

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
>;

export type Job = {
  id: string;
  fileName: string;
  filePath: string;
  fileType: "csv" | "pdf";
  businessType: BusinessTypeId;
  merchantId?: number | null;
  statementSlot?: 1 | 2 | null;
  detectedStatementPeriod?: string | null;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  progress: number;
  events: JobEvent[];
  error?: string;
  summary?: AnalysisSummary;
};
