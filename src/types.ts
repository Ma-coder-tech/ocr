export type JobStatus =
  | "queued"
  | "analyzing"
  | "classifying"
  | "calculating"
  | "generating_report"
  | "completed"
  | "failed";

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

export type FeeBreakdownRow = {
  label: string;
  amount: number;
  sharePct: number;
};

export type BenchmarkStatus = "below" | "within" | "above";

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

export type AnalysisSummary = {
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
};

export type Job = {
  id: string;
  fileName: string;
  filePath: string;
  fileType: "csv" | "pdf";
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  progress: number;
  events: JobEvent[];
  error?: string;
  reportPath?: string;
  summary?: AnalysisSummary;
};
