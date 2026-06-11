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
    return blockedReport(input.kind, "We could not load this statement analysis.");
  }

  const volumePermission = canShowTotalVolume(summary);
  const feesPermission = canShowTotalFees(summary);
  const ratePermission = canShowEffectiveRate(summary);
  const benchmarkPermission = canShowBenchmarkVerdict(summary);
  const findings = approvedCustomerFindings(summary, input.kind);
  const displayFindings = input.kind === "free_teaser" ? teaserFindings(summary, findings) : findings;
  const situation = classifySituation(summary, benchmarkPermission.allowed, findings);
  const buildState =
    !volumePermission.allowed && !feesPermission.allowed
      ? "blocked"
      : ratePermission.allowed && benchmarkPermission.allowed
        ? "complete"
        : "partial";
  const blockedReason =
    buildState === "blocked"
      ? volumePermission.reason ?? feesPermission.reason ?? "We could not produce a trustworthy report from this statement."
      : null;
  const identity = identityMetrics(summary, input.context?.merchantName);
  const headline = headlineFor(input.kind, summary, situation, findings.length);
  const coreMetrics = coreMetricList(summary, input.kind);
  const sections = sectionsFor(input.kind, summary, displayFindings);

  return {
    kind: input.kind,
    buildState,
    situation: buildState === "blocked" ? "data_limited" : situation,
    identity,
    headline,
    metrics: coreMetrics,
    sections,
    findings: displayFindings,
    dataQuality: blockedReason ? { level: "critical", message: blockedReason } : dataQualityNote(summary.dataQuality),
    cta: ctaFor(input.kind, summary, situation),
  };
}

function blockedReport(kind: ReportKind, message: string): CustomerReportDTO {
  const unavailable = (id: string, label: string): CustomerReportMetric => ({
    id,
    label,
    displayMode: "fallback",
    fallbackCopy: "Unavailable",
  });

  return {
    kind,
    buildState: "blocked",
    situation: "data_limited",
    identity: {
      processorName: unavailable("processor_name", "Processor"),
      statementPeriod: unavailable("statement_period", "Statement period"),
      businessType: unavailable("business_type", "Business type"),
    },
    headline: {
      tone: "neutral",
      title: "We could not produce a trustworthy report from this statement.",
      body: message,
    },
    metrics: [],
    sections: [],
    findings: [],
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
      "Monthly volume could not be verified.",
      "money",
    ),
    metric(
      "total_fees",
      "Total fees paid",
      canShowTotalFees(summary),
      formatMoney(summary.totalFees),
      summary.totalFees,
      "Total fees could not be verified.",
      "money",
    ),
    metric(
      "effective_rate",
      "Effective rate",
      canShowEffectiveRate(summary),
      formatPct(summary.effectiveRate),
      summary.effectiveRate,
      "We could not calculate an effective rate from this statement.",
      "percent",
    ),
  ];

  if (kind === "single_statement_full") {
    const ticket = averageTicket(summary);
    metrics.push(
      metric(
        "average_ticket",
        "Average ticket",
        canShowAverageTicket(summary),
        ticket === null ? "" : formatMoney(ticket),
        ticket,
        "Average ticket requires a reliable transaction count.",
        "money",
      ),
    );
  }

  return metrics;
}

function sectionsFor(kind: ReportKind, summary: AnalysisSummary, findings: CustomerReportDTO["findings"]): CustomerReportSection[] {
  const sections: CustomerReportSection[] = [benchmarkSection(summary), bucketSection(summary), findingsSection(kind, findings)];

  if (kind === "single_statement_full") {
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
      fallbackCopy: permission.allowed ? undefined : "Benchmark verdict requires a reliable effective rate and benchmark range.",
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
    fallbackCopy: permission.allowed ? undefined : "We could not compare this statement to a benchmark reliably.",
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
    body: "Card brand / network fees are generally set by the networks. Processor-controlled fees are the part to review with your provider.",
    metrics: [
      {
        id: "card_brand_total",
        label: "Card brand / network",
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
      fallbackCopy: "Processor markup could not be separated reliably from this statement.",
    };
  }

  return {
    id: "processor_markup",
    title: "Processor markup",
    displayMode: "exact",
    body: "Basis points are how processors describe their percentage cut. 100 basis points equals 1%.",
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
    title: "Categorized fee breakdown",
    displayMode: permission.allowed ? "exact" : rows.length ? "fallback" : "hidden",
    rows: permission.allowed ? rows : undefined,
    fallbackCopy: permission.allowed ? undefined : "Fee rows did not cover enough of total fees to show a complete customer-safe table.",
  };
}

function findingsSection(kind: ReportKind, findings: CustomerReportDTO["findings"]): CustomerReportSection {
  return {
    id: "findings",
    title: kind === "free_teaser" ? "What we found" : "Full findings",
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
      body: `${merchantPeriodLabel(summary.statementPeriod) ?? "This statement"} looks fair based on approved findings. Upload another month to confirm it stays consistent.`,
    };
  }

  return {
    id: "action_toolkit",
    title: "Action toolkit",
    displayMode: "exact",
    body: "Based on this one statement. One month is a starting point, not a verdict. Use these as a starting point for the conversation with your processor.",
    findings: findings.map((finding) => ({
      ...finding,
      action:
        finding.confidence === "high"
          ? { label: "Ask for removal or repricing", script: `Please review this charge: ${finding.title}. Can it be removed or repriced?` }
          : { label: "Ask for explanation", script: `Please explain why this charge applies: ${finding.title}.` },
    })),
  };
}

function teaserFindings(summary: AnalysisSummary, findings: CustomerReportDTO["findings"]): CustomerReportDTO["findings"] {
  const approved = findings.filter((finding) => finding.confidence === "high").slice(0, 3);
  if (approved.length >= 3) return approved;
  return [...approved, ...cleanChecks(summary, 3 - approved.length)].slice(0, 3);
}

function classifySituation(
  summary: AnalysisSummary,
  benchmarkAllowed: boolean,
  findings: CustomerReportDTO["findings"],
): CustomerReportSituation {
  if (!canShowEffectiveRate(summary).allowed || !benchmarkAllowed) return "data_limited";
  if (summary.benchmark.status === "above") return "above_benchmark";
  return findings.length > 0 ? "within_with_flags" : "clean";
}

function headlineFor(
  kind: ReportKind,
  summary: AnalysisSummary,
  situation: CustomerReportSituation,
  findingCount: number,
): CustomerReportTextBlock {
  const businessType = getBusinessTypeReportLabel(summary.businessType).toLowerCase();
  const period = merchantPeriodLabel(summary.statementPeriod) ?? "this statement";
  const fullPrefix = kind === "single_statement_full" ? "Full report unlocked. " : "";

  if (situation === "above_benchmark") {
    return {
      tone: "danger",
      title: `${fullPrefix}Your rate is above the benchmark for ${businessType}.`,
      body:
        kind === "free_teaser"
          ? "We found something worth looking at. Sign up free to see every fee and analyze one more statement at no cost."
          : "Below is the customer-safe breakdown of the approved metrics, findings, and starting actions from this statement.",
    };
  }

  if (situation === "within_with_flags") {
    return {
      tone: "warning",
      title: `${fullPrefix}Your rate looks fair, but ${findingCount} line item${findingCount === 1 ? " is" : "s are"} worth questioning.`,
      body:
        kind === "free_teaser"
          ? "The total rate is not above benchmark, but the composition still matters. Sign up free to see the full breakdown."
          : "The total looks reasonable, but approved findings below are still worth reviewing with your processor.",
    };
  }

  if (situation === "clean") {
    return {
      tone: "good",
      title: `${fullPrefix}Good news - ${period} looks clean.`,
      body:
        kind === "free_teaser"
          ? "We did not find high-confidence issues suitable for the teaser. Sign up free to upload one more statement and confirm this is consistent."
          : "We did not find approved fee issues on this statement. Upload another month to confirm the pattern holds.",
    };
  }

  return {
    tone: "neutral",
    title: "This report is data-limited.",
    body: "We could not verify enough data to show every report metric confidently.",
  };
}

function ctaFor(kind: ReportKind, summary: AnalysisSummary, situation: CustomerReportSituation): CustomerCTA | undefined {
  if (kind !== "free_teaser") return undefined;
  const period = merchantPeriodLabel(summary.statementPeriod) ?? "This statement";
  if (situation === "clean") {
    return {
      label: "Sign up free to keep checking ->",
      title: "One clean statement is not the whole story",
      body: `${period} looks fair. Sign up free to upload one more statement and make sure this is consistent.`,
    };
  }
  return {
    label: "Sign up free to unlock ->",
    title: "Full fee breakdown is locked",
    body: "Sign up free to see every fee line item, the recommended next steps, and analyze one more statement at no cost.",
  };
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
