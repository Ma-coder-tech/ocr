import type { BusinessTypeId } from "../businessTypes.js";

export type ReportKind = "single_statement_result" | "single_statement_full" | "free_teaser";
export type CustomerReportState = "Actionable" | "Clean" | "Limited";
export type CustomerReportBuildState = "complete" | "partial" | "blocked";
export type CustomerReportSituation = "above_benchmark" | "within_with_flags" | "clean" | "data_limited";
export type CustomerDisplayMode = "exact" | "fallback" | "hidden";
export type CustomerConfidence = "high" | "medium";

export type CustomerReportMetric = {
  id: string;
  label: string;
  displayMode: CustomerDisplayMode;
  value?: string;
  rawValue?: number | string | null;
  unit?: "money" | "percent" | "bps" | "count" | "text";
  fallbackCopy?: string;
  confidence?: CustomerConfidence;
};

export type CustomerAction = {
  label: string;
  script?: string;
};

export type CustomerFinding = {
  id: string;
  title: string;
  description: string;
  severity: "fix" | "watch" | "clean";
  monthlyImpact?: string;
  annualImpact?: string;
  evidenceSummary?: string;
  action?: CustomerAction;
  confidence: CustomerConfidence;
};

export type CustomerReportSavings = {
  annualAmount: number;
  displayAmount: string | null;
  basis: "visible_findings";
};

export type CustomerFeeTableRow = {
  label: string;
  amount: string;
  rawAmount: number;
  category: "Card brand / network" | "Processor fees" | "Service & compliance" | "Needs review";
};

export type CustomerReportSection = {
  id: string;
  title: string;
  displayMode: CustomerDisplayMode;
  body?: string;
  metrics?: CustomerReportMetric[];
  findings?: CustomerFinding[];
  rows?: CustomerFeeTableRow[];
  fallbackCopy?: string;
};

export type CustomerReportIdentity = {
  processorName: CustomerReportMetric;
  statementPeriod: CustomerReportMetric;
  businessType: CustomerReportMetric & {
    businessTypeId?: BusinessTypeId;
  };
  merchantName?: CustomerReportMetric;
};

export type CustomerReportTextBlock = {
  tone: "danger" | "warning" | "good" | "info" | "neutral";
  title: string;
  body: string;
};

export type CustomerDataQualityNote = {
  level: "info" | "warning" | "critical";
  message: string;
};

export type CustomerCTA = {
  label: string;
  title: string;
  body: string;
  href?: string;
};

export type CustomerReportDTO = {
  kind: ReportKind;
  state: CustomerReportState;
  buildState: CustomerReportBuildState;
  situation: CustomerReportSituation;
  identity: CustomerReportIdentity;
  headline: CustomerReportTextBlock;
  metrics: CustomerReportMetric[];
  sections: CustomerReportSection[];
  findings: CustomerFinding[];
  positiveFindings: CustomerFinding[];
  savings: CustomerReportSavings;
  dataQuality: CustomerDataQualityNote;
  cta?: CustomerCTA;
};
