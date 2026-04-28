import type { AnalysisSummary, ChecklistBucket, PublicChecklistReport, PublicReportSummary } from "./types.js";
import { toPeriodLabel } from "./periods.js";

const PUBLIC_CHECKLIST_FINDING_LIMIT = 8;
const PUBLIC_CHECKLIST_FINDINGS_PER_BUCKET = 4;
const PUBLIC_CHECKLIST_EVIDENCE_LIMIT = 3;

const publicChecklistStatusRank = { fail: 0, warning: 1, unknown: 2 } as const;
type PublicChecklistRuleResult = ChecklistBucket["results"][number] & { status: keyof typeof publicChecklistStatusRank };

function merchantPeriodLabel(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return toPeriodLabel(raw) ?? raw;
}

function isPublicChecklistResult(result: ChecklistBucket["results"][number]): result is PublicChecklistRuleResult {
  return result.status in publicChecklistStatusRank;
}

function publicChecklistFindings(
  bucketName: PublicChecklistReport["findings"][number]["bucket"],
  bucket?: ChecklistBucket,
): PublicChecklistReport["findings"] {
  if (!bucket) return [];
  return bucket.results
    .filter(isPublicChecklistResult)
    .sort((a, b) => publicChecklistStatusRank[a.status] - publicChecklistStatusRank[b.status])
    .slice(0, PUBLIC_CHECKLIST_FINDINGS_PER_BUCKET)
    .map((result) => ({
      bucket: bucketName,
      title: result.title,
      status: result.status,
      reason: result.reason,
      evidence: result.evidence.slice(0, PUBLIC_CHECKLIST_EVIDENCE_LIMIT),
    }));
}

function toPublicChecklistReport(summary: AnalysisSummary): PublicChecklistReport | undefined {
  const report = summary.checklistReport;
  if (!report) return undefined;
  const buckets = [report.universal, report.processorSpecific, report.crossProcessor];
  const counts = buckets.reduce(
    (acc, bucket) => ({
      total: acc.total + bucket.total,
      fail: acc.fail + bucket.fail,
      warning: acc.warning + bucket.warning,
      unknown: acc.unknown + bucket.unknown,
    }),
    { total: 0, fail: 0, warning: 0, unknown: 0 },
  );
  const findings = [
    ...publicChecklistFindings("universal", report.universal),
    ...publicChecklistFindings("processorSpecific", report.processorSpecific),
    ...publicChecklistFindings("crossProcessor", report.crossProcessor),
  ]
    .sort((a, b) => publicChecklistStatusRank[a.status] - publicChecklistStatusRank[b.status])
    .slice(0, PUBLIC_CHECKLIST_FINDING_LIMIT);

  return {
    extractionMode: report.extractionMode,
    extractionQualityScore: report.extractionQualityScore,
    extractionReasons: report.extractionReasons.slice(0, PUBLIC_CHECKLIST_EVIDENCE_LIMIT),
    processorName: report.processorDetection.detectedProcessorName ?? report.processorSpecific.processorName,
    counts,
    findings,
  };
}

export function toPublicReportSummary(summary?: AnalysisSummary): PublicReportSummary | undefined {
  if (!summary) return undefined;
  return {
    businessType: summary.businessType,
    processorName: summary.processorName,
    sourceType: summary.sourceType,
    statementPeriod: merchantPeriodLabel(summary.statementPeriod) ?? summary.statementPeriod,
    executiveSummary: summary.executiveSummary,
    totalVolume: summary.totalVolume,
    totalFees: summary.totalFees,
    estimatedMonthlyVolume: summary.estimatedMonthlyVolume,
    estimatedMonthlyFees: summary.estimatedMonthlyFees,
    effectiveRate: summary.effectiveRate,
    benchmark: summary.benchmark,
    confidence: summary.confidence,
    dataQuality: summary.dataQuality,
    checklistReport: toPublicChecklistReport(summary),
  };
}
