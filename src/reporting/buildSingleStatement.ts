import { getBusinessTypeReportLabel } from "../businessTypes.js";
import type { AnalysisSummary } from "../types.js";
import { toPeriodLabel } from "../periods.js";
import {
  approvedCustomerFindings,
  approvedFeeRows,
  averageTicket,
  canShowAverageTicket,
  canShowBenchmarkVerdict,
  canShowEffectiveRate,
  canShowFeeBreakdown,
  canShowTotalFees,
  canShowTotalVolume,
  canShowTwoBucketSplit,
  cleanChecks,
  dataQualityNote,
  formatBps,
  formatPct,
  isPositiveFinite,
  metric,
  round2,
} from "./policy.js";
import type {
  CustomerCTA,
  CustomerReportDTO,
  CustomerReportMetric,
  CustomerReportSection,
  CustomerReportSituation,
  CustomerReportState,
  CustomerReportTextBlock,
  ReportKind,
} from "./types.js";

export type BuildCustomerReportInput = {
  kind: ReportKind;
  analysis?: AnalysisSummary;
  context?: {
    merchantName?: string | null;
    unlocked?: boolean;
  };
};

export function buildSingleStatementCustomerReport(input: BuildCustomerReportInput): CustomerReportDTO {
  const summary = input.analysis;
  if (!summary) {
    return blockedReport(input.kind, "We couldn't load this statement analysis.");
  }

  const volumePermission = canShowTotalVolume(summary);
  const feesPermission = canShowTotalFees(summary);
  const ratePermission = canShowEffectiveRate(summary);
  const benchmarkPermission = canShowBenchmarkVerdict(summary);
  const findings = findingsWithRateOnlyAction(summary, approvedCustomerFindings(summary, input.kind), benchmarkPermission.allowed);
  const displayFindings = isLegacyTeaser(input.kind) ? teaserFindings(summary, findings) : findings;
  const state = normalizeReportState(summary, benchmarkPermission.allowed, displayFindings);
  const situation = situationForState(state, summary);
  const savings = savingsForVisibleFindings(displayFindings);
  const buildState =
    !volumePermission.allowed && !feesPermission.allowed
      ? "blocked"
      : ratePermission.allowed && benchmarkPermission.allowed
        ? "complete"
        : "partial";
  const blockedReason =
    buildState === "blocked"
      ? volumePermission.reason ?? feesPermission.reason ?? "We couldn't read enough of this statement to show a trustworthy report."
      : null;
  const identity = identityMetrics(summary, input.context?.merchantName);
  const headline = headlineFor(input.kind, summary, state, displayFindings, savings.annualAmount);
  const coreMetrics = coreMetricList(summary, input.kind);
  const sections = sectionsFor(input.kind, summary, displayFindings);

  const report: CustomerReportDTO = {
    kind: input.kind,
    state,
    buildState,
    situation: buildState === "blocked" ? "data_limited" : situation,
    identity,
    headline,
    metrics: coreMetrics,
    sections,
    findings: displayFindings,
    positiveFindings: state === "Limited" ? [] : positiveFindingsFor(summary),
    savings,
    dataQuality: blockedReason ? { level: "critical", message: blockedReason } : dataQualityNote(summary.dataQuality),
    cta: ctaFor(input.kind, summary, situation),
  };

  enforceReportGuardrails(report);
  return report;
}

function blockedReport(kind: ReportKind, message: string): CustomerReportDTO {
  const unavailable = (id: string, label: string): CustomerReportMetric => ({
    id,
    label,
    displayMode: "fallback",
    fallbackCopy: `${label} not confirmed`,
  });

  return {
    kind,
    state: "Limited",
    buildState: "blocked",
    situation: "data_limited",
    identity: {
      processorName: unavailable("processor_name", "Processor"),
      statementPeriod: unavailable("statement_period", "Statement period"),
      businessType: unavailable("business_type", "Business type"),
    },
    headline: {
      tone: "neutral",
      title: "We could read part of this statement. Here's what we found.",
      body: message,
    },
    metrics: [],
    sections: [],
    findings: [],
    positiveFindings: [],
    savings: {
      annualAmount: 0,
      displayAmount: null,
      basis: "visible_findings",
    },
    dataQuality: {
      level: "critical",
      message,
    },
  };
}

function identityMetrics(summary: AnalysisSummary, merchantName?: string | null): CustomerReportDTO["identity"] {
  const processorName = summary.processorName && summary.processorName !== "Unknown" ? summary.processorName : "";
  const statementPeriod = merchantPeriodLabel(summary.statementPeriod) ?? "";
  const businessLabel = getBusinessTypeReportLabel(summary.businessType);

  return {
    processorName: {
      id: "processor_name",
      label: "Processor",
      displayMode: processorName ? "exact" : "fallback",
      value: processorName || undefined,
      rawValue: processorName || null,
      fallbackCopy: processorName ? undefined : "Processor not confirmed",
      unit: "text",
      confidence: processorName ? "medium" : undefined,
    },
    statementPeriod: {
      id: "statement_period",
      label: "Statement period",
      displayMode: statementPeriod ? "exact" : "fallback",
      value: statementPeriod || undefined,
      rawValue: summary.statementPeriod,
      fallbackCopy: statementPeriod ? undefined : "Statement period unavailable",
      unit: "text",
      confidence: statementPeriod ? "medium" : undefined,
    },
    businessType: {
      id: "business_type",
      label: "Business type",
      displayMode: "exact",
      value: businessLabel,
      rawValue: summary.businessType,
      unit: "text",
      confidence: "high",
      businessTypeId: summary.businessType,
    },
    merchantName: merchantName
      ? {
          id: "merchant_name",
          label: "Merchant",
          displayMode: "exact",
          value: merchantName,
          rawValue: merchantName,
          unit: "text",
          confidence: "medium",
        }
      : undefined,
  };
}

function coreMetricList(summary: AnalysisSummary, kind: ReportKind): CustomerReportMetric[] {
  const metrics = [
    metric(
      "monthly_volume",
      "Monthly volume",
      canShowTotalVolume(summary),
      formatMoney(summary.totalVolume),
      summary.totalVolume,
      "We couldn't verify monthly volume from this statement.",
      "money",
    ),
    metric(
      "total_fees",
      "Total fees",
      canShowTotalFees(summary),
      formatMoney(summary.totalFees),
      summary.totalFees,
      "We couldn't verify total fees from this statement.",
      "money",
    ),
    metric(
      "effective_rate",
      "Fees as a percentage of sales",
      canShowEffectiveRate(summary),
      formatPct(summary.effectiveRate),
      summary.effectiveRate,
      "We couldn't calculate the percentage of sales paid in fees from this statement.",
      "percent",
    ),
  ];

  if (isFullResult(kind)) {
    const ticket = averageTicket(summary);
    metrics.push(
      metric(
        "average_ticket",
        "Average ticket",
        canShowAverageTicket(summary),
        ticket === null ? "" : formatMoney(ticket),
        ticket,
        "We need a reliable transaction count to calculate average ticket.",
        "money",
      ),
    );
  }

  return metrics.filter((item) => item.displayMode === "exact");
}

function sectionsFor(kind: ReportKind, summary: AnalysisSummary, findings: CustomerReportDTO["findings"]): CustomerReportSection[] {
  const sections: CustomerReportSection[] = [benchmarkSection(summary), bucketSection(summary), findingsSection(kind, findings)];

  if (isFullResult(kind)) {
    sections.splice(2, 0, processorMarkupSection(summary), feeBreakdownSection(summary));
    sections.push(actionSection(summary, findings));
  }

  return sections;
}

function benchmarkSection(summary: AnalysisSummary): CustomerReportSection {
  const permission = canShowBenchmarkVerdict(summary);
  const metrics: CustomerReportMetric[] = [
    {
      id: "benchmark_range",
      label: "Benchmark range",
      displayMode: permission.allowed ? "exact" : "fallback",
      value: permission.allowed ? `${formatPct(summary.benchmark.lowerRate)} to ${formatPct(summary.benchmark.upperRate)}` : undefined,
      rawValue: permission.allowed ? `${summary.benchmark.lowerRate}-${summary.benchmark.upperRate}` : null,
      fallbackCopy: permission.allowed ? undefined : "Benchmark unavailable for this business type.",
      unit: "text",
      confidence: permission.allowed ? "medium" : undefined,
    },
    {
      id: "benchmark_verdict",
      label: "Benchmark verdict",
      displayMode: permission.allowed ? "exact" : "fallback",
      value: permission.allowed ? benchmarkLabel(summary.benchmark.status) : undefined,
      rawValue: permission.allowed ? summary.benchmark.status : null,
      fallbackCopy: permission.allowed ? undefined : "We need reliable totals and a benchmark range before comparing your rate.",
      unit: "text",
      confidence: permission.allowed ? "medium" : undefined,
    },
  ];

  return {
    id: "benchmark",
    title: "Rate vs benchmark",
    displayMode: permission.allowed ? "exact" : "fallback",
    body: permission.allowed
      ? `Compared with the normal range for ${getBusinessTypeReportLabel(summary.businessType)} businesses.`
      : undefined,
    metrics,
    fallbackCopy: permission.allowed ? undefined : "We couldn't compare this statement to a benchmark reliably.",
  };
}

function bucketSection(summary: AnalysisSummary): CustomerReportSection {
  const permission = canShowTwoBucketSplit(summary);
  if (!permission.allowed) {
    return {
      id: "two_bucket_split",
      title: "Where your fees go",
      displayMode: "fallback",
      fallbackCopy: "This statement does not separate fees clearly enough to show a reliable split.",
    };
  }

  return {
    id: "two_bucket_split",
    title: "Where your fees go",
    displayMode: "exact",
    body: "Card brand fees are generally set by the networks. Processor-controlled fees are the part to question.",
    metrics: [
      {
        id: "card_brand_total",
        label: "Card brand fees",
        displayMode: "exact",
        value: formatMoney(permission.cardBrandTotal),
        rawValue: permission.cardBrandTotal,
        unit: "money",
        confidence: "high",
      },
      {
        id: "processor_controlled_total",
        label: "Processor-controlled fees",
        displayMode: "exact",
        value: formatMoney(permission.processorControlledTotal),
        rawValue: permission.processorControlledTotal,
        unit: "money",
        confidence: "high",
      },
      {
        id: "processor_controlled_share",
        label: "Processor-controlled share",
        displayMode: "exact",
        value: formatPct(permission.processorControlledSharePct),
        rawValue: permission.processorControlledSharePct,
        unit: "percent",
        confidence: "high",
      },
    ],
  };
}

function processorMarkupSection(summary: AnalysisSummary): CustomerReportSection {
  const markupBps = summary.processorMarkupAudit?.effectiveRateBps;
  if (!isPositiveFinite(markupBps)) {
    return {
      id: "processor_markup",
      title: "Processor markup",
      displayMode: "fallback",
      fallbackCopy: "We couldn't separate processor markup reliably from this statement.",
    };
  }

  return {
    id: "processor_markup",
    title: "Processor markup",
    displayMode: "exact",
    body: "Basis points are how processors describe percentage pricing. 100 basis points equals 1%.",
    metrics: [
      {
        id: "processor_markup_bps",
        label: "Processor markup",
        displayMode: "exact",
        value: formatBps(markupBps),
        rawValue: round2(markupBps),
        unit: "bps",
        confidence: "high",
      },
    ],
  };
}

function feeBreakdownSection(summary: AnalysisSummary): CustomerReportSection {
  const rows = approvedFeeRows(summary);
  const permission = canShowFeeBreakdown(summary);
  return {
    id: "fee_breakdown",
    title: "Fee breakdown by category",
    displayMode: permission.allowed ? "exact" : rows.length ? "fallback" : "hidden",
    rows: permission.allowed ? rows : undefined,
    fallbackCopy: permission.allowed ? undefined : "We couldn't identify enough fee rows to show a reliable table.",
  };
}

function findingsSection(kind: ReportKind, findings: CustomerReportDTO["findings"]): CustomerReportSection {
  return {
    id: "findings",
    title: "Here's what to do",
    displayMode: "exact",
    findings,
  };
}

function actionSection(summary: AnalysisSummary, findings: CustomerReportDTO["findings"]): CustomerReportSection {
  if (!findings.some((finding) => finding.severity !== "clean")) {
    return {
      id: "next_step",
      title: "What's next",
      displayMode: "exact",
      body: "We didn't flag anything on this statement. Upload another month to see if a pattern emerges.",
    };
  }

  return {
    id: "action_toolkit",
    title: "Call prep",
    displayMode: "exact",
    body: "One month is a starting point, not a verdict. Use these notes when you call your processor.",
    findings: findings.map((finding) => ({
      ...finding,
      action:
        finding.confidence === "high"
          ? { label: "Ask for removal", script: `Review this charge: ${finding.title}. Can it be removed or repriced?` }
          : { label: "Ask for details", script: `Explain why this charge applies: ${finding.title}.` },
    })),
  };
}

function teaserFindings(summary: AnalysisSummary, findings: CustomerReportDTO["findings"]): CustomerReportDTO["findings"] {
  const approved = findings.filter((finding) => finding.confidence === "high").slice(0, 3);
  if (approved.length >= 3) return approved;
  return [...approved, ...cleanChecks(summary, 3 - approved.length)].slice(0, 3);
}

function visibleActionFindings(findings: CustomerReportDTO["findings"]): CustomerReportDTO["findings"] {
  return findings.filter((finding) => finding.severity !== "clean");
}

function findingsWithRateOnlyAction(
  summary: AnalysisSummary,
  findings: CustomerReportDTO["findings"],
  benchmarkAllowed: boolean,
): CustomerReportDTO["findings"] {
  if (!benchmarkAllowed || summary.benchmark.status !== "above" || visibleActionFindings(findings).length > 0) return findings;
  return [
    {
      id: "benchmark_rate_above",
      title: "Your rate is high. Shop this.",
      description: "Nothing on this statement is obviously removable, but the rate is above benchmark. Worth a shopping conversation with a new processor.",
      severity: "watch",
      confidence: "high",
    },
    ...findings,
  ];
}

function savingsForVisibleFindings(findings: CustomerReportDTO["findings"]): CustomerReportDTO["savings"] {
  const annualAmount = round2(
    visibleActionFindings(findings).reduce((sum, finding) => {
      const annual = moneyValue(finding.annualImpact);
      if (annual !== null) return sum + annual;
      const monthly = moneyValue(finding.monthlyImpact);
      return monthly !== null ? sum + monthly * 12 : sum;
    }, 0),
  );
  return {
    annualAmount,
    displayAmount: annualAmount > 0 ? `${formatWholeMoney(annualAmount)}/yr` : null,
    basis: "visible_findings",
  };
}

function moneyValue(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordOrNull).filter((item): item is Record<string, unknown> => item !== null) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveFindingsFor(summary: AnalysisSummary): CustomerReportDTO["positiveFindings"] {
  const findings: CustomerReportDTO["positiveFindings"] = [];
  if (canShowBenchmarkVerdict(summary).allowed && (summary.benchmark.status === "below" || summary.benchmark.status === "within")) {
    findings.push({
      id: "positive_rate_within_benchmark",
      title: summary.benchmark.status === "below" ? "Your rate is below benchmark." : "Your rate is within benchmark.",
      description: `The percentage of sales you paid in fees is ${summary.benchmark.status === "below" ? "below" : "within"} the benchmark for ${getBusinessTypeReportLabel(summary.businessType).toLowerCase()}.`,
      severity: "clean",
      confidence: "high",
    });
  }

  if (!summary.bundledPricing?.active) {
    findings.push({
      id: "positive_itemized_pricing",
      title: "Your pricing is easier to audit.",
      description: "The statement separates card brand costs from processor-controlled fees more clearly than bundled pricing.",
      severity: "clean",
      confidence: "medium",
    });
  }

  if (canShowTwoBucketSplit(summary).allowed) {
    findings.push({
      id: "positive_fee_split_readable",
      title: "Your fee split is readable.",
      description: "Card brand and processor-controlled fees reconcile clearly enough to review.",
      severity: "clean",
      confidence: "high",
    });
  }

  const fiservFindings = arrayOfRecords(recordOrNull(summary.fiservFeeAnalysisV2)?.findings);
  if (fiservFindings.some((finding) => stringValue(finding.kind) === "authorization_ratio_healthy")) {
    findings.push({
      id: "positive_authorization_ratio_healthy",
      title: "Your authorization ratio looks healthy.",
      description: "Authorization count is in line with settled transactions on this statement.",
      severity: "clean",
      confidence: "medium",
    });
  }

  return uniqueFindings(findings);
}

function uniqueFindings(findings: CustomerReportDTO["findings"]): CustomerReportDTO["findings"] {
  const unique = new Map<string, CustomerReportDTO["findings"][number]>();
  for (const finding of findings) unique.set(finding.id, finding);
  return [...unique.values()];
}

function normalizeReportState(
  summary: AnalysisSummary,
  benchmarkAllowed: boolean,
  findings: CustomerReportDTO["findings"],
): CustomerReportState {
  if (!canShowTotalVolume(summary).allowed || !canShowTotalFees(summary).allowed || !canShowEffectiveRate(summary).allowed || !benchmarkAllowed) {
    return "Limited";
  }
  if (visibleActionFindings(findings).length > 0) return "Actionable";
  return "Clean";
}

function situationForState(state: CustomerReportState, summary: AnalysisSummary): CustomerReportSituation {
  if (state === "Limited") return "data_limited";
  if (state === "Clean") return "clean";
  return summary.benchmark.status === "above" ? "above_benchmark" : "within_with_flags";
}

function headlineFor(
  kind: ReportKind,
  summary: AnalysisSummary,
  state: CustomerReportState,
  findings: CustomerReportDTO["findings"],
  annualSavings: number,
): CustomerReportTextBlock {
  void kind;
  const businessType = getBusinessTypeReportLabel(summary.businessType).toLowerCase();
  const visibleFindings = visibleActionFindings(findings);

  if (state === "Actionable" && summary.benchmark.status === "above") {
    if (visibleFindings.length === 1 && visibleFindings[0]?.id === "benchmark_rate_above") {
      return {
        tone: "warning",
        title: "Your rate is high, but nothing on this statement is obviously fixable. Worth a shopping conversation with a new processor.",
        body: "Use this statement to compare quotes from another processor.",
      };
    }
    return {
      tone: "danger",
      title: `Your rate is above the benchmark for ${businessType}.`,
      body: "Here's what's driving it.",
    };
  }

  if (state === "Actionable") {
    const challengeAmount = annualSavings > 0 ? `${formatWholeMoney(annualSavings)}/yr` : null;
    return {
      tone: "warning",
      title: challengeAmount
        ? `Your rate is competitive, but ${challengeAmount} in fees are worth challenging.`
        : `Your rate is competitive, but ${visibleFindings.length} fee${visibleFindings.length === 1 ? " is" : "s are"} worth challenging.`,
      body: "Start with the items below when you call your processor.",
    };
  }

  if (state === "Clean") {
    return {
      tone: "good",
      title: "Your statement looks clean. No fees flagged this month.",
      body: "Upload another month to see if a pattern emerges.",
    };
  }

  return {
    tone: "neutral",
    title: "We could read part of this statement. Here's what we found.",
    body: "Everything below is limited to the data we could verify.",
  };
}

function ctaFor(kind: ReportKind, summary: AnalysisSummary, situation: CustomerReportSituation): CustomerCTA | undefined {
  void kind;
  void summary;
  void situation;
  return undefined;
}

function enforceReportGuardrails(report: CustomerReportDTO): void {
  const visibleFindings = visibleActionFindings(report.findings);
  if (report.state === "Clean" && report.savings.annualAmount !== 0) {
    throw new Error("Customer report guardrail failed: Clean state cannot include non-zero savings.");
  }
  if (report.state === "Actionable" && visibleFindings.length === 0) {
    throw new Error("Customer report guardrail failed: Actionable state requires at least one visible finding.");
  }
  for (const metric of report.metrics) {
    if (metric.displayMode !== "exact") continue;
    const value = String(metric.value ?? "").trim();
    if (!value || value === "Unavailable" || value === "$0" || value === "$0.00") {
      throw new Error(`Customer report guardrail failed: metric ${metric.id} cannot render ${value || "empty"} as a real value.`);
    }
  }
  const visibleSavings = savingsForVisibleFindings(report.findings).annualAmount;
  if (Math.abs(visibleSavings - report.savings.annualAmount) > 0.01) {
    throw new Error("Customer report guardrail failed: savings must equal visible finding impacts.");
  }
}

function isFullResult(kind: ReportKind): boolean {
  return kind === "single_statement_result" || kind === "single_statement_full";
}

function isLegacyTeaser(kind: ReportKind): boolean {
  return kind === "free_teaser";
}

function benchmarkLabel(status: AnalysisSummary["benchmark"]["status"]): string {
  if (status === "above") return "Above benchmark";
  if (status === "below") return "Below benchmark";
  return "Within benchmark";
}

function merchantPeriodLabel(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return toPeriodLabel(raw) ?? raw;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatWholeMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
