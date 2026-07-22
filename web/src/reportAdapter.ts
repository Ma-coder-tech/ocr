export type BusinessTypeId =
  | "restaurant_food_beverage"
  | "retail"
  | "ecommerce"
  | "healthcare"
  | "hospitality"
  | "high_risk"
  | "professional_services"
  | "other";

export type JobStatus =
  | "idle"
  | "uploading"
  | "queued"
  | "verifying_statement"
  | "identifying_processor"
  | "extracting_fee_line_items"
  | "calculating_effective_rate"
  | "comparing_to_benchmark"
  | "completed"
  | "failed";

export type BenchmarkStatus = "above" | "within" | "below";

export type CustomerMetric = {
  id: string;
  label: string;
  displayMode: "exact" | "fallback" | "hidden";
  value?: string;
  rawValue?: number | string | null;
  fallbackCopy?: string;
  unit?: "money" | "percent" | "bps" | "count" | "text";
};

export type CustomerFinding = {
  id: string;
  title: string;
  description: string;
  severity: "fix" | "watch" | "clean";
  monthlyImpact?: string;
  annualImpact?: string;
  evidenceSummary?: string;
  confidence: "high" | "medium";
};

export type CustomerReportSavings = {
  annualAmount: number;
  displayAmount: string | null;
  basis: "visible_findings";
};

export type CustomerReportSection = {
  id: string;
  title: string;
  displayMode: "exact" | "fallback" | "hidden";
  body?: string;
  metrics?: CustomerMetric[];
  findings?: CustomerFinding[];
  rows?: Array<{
    label: string;
    amount: string;
    rawAmount: number;
    category: "Card brand / network" | "Processor fees" | "Service & compliance" | "Needs review";
  }>;
  fallbackCopy?: string;
};

export type CustomerReportDTO = {
  kind: "single_statement_result" | "single_statement_full" | "free_teaser";
  state: "Actionable" | "Clean" | "Limited";
  buildState: "complete" | "partial" | "blocked";
  situation: "above_benchmark" | "within_with_flags" | "clean" | "data_limited";
  identity: {
    processorName?: CustomerMetric;
    statementPeriod?: CustomerMetric;
    businessType?: CustomerMetric & { businessTypeId?: BusinessTypeId };
    merchantName?: CustomerMetric;
  };
  headline: {
    tone: "danger" | "warning" | "good" | "info" | "neutral";
    title: string;
    body: string;
  };
  metrics: CustomerMetric[];
  sections: CustomerReportSection[];
  findings: CustomerFinding[];
  positiveFindings: CustomerFinding[];
  savings: CustomerReportSavings;
  dataQuality?: {
    level: "info" | "warning" | "critical";
    message: string;
  };
};

export type PublicSummary = {
  businessType?: BusinessTypeId;
  processorName?: string;
  statementPeriod?: string;
  executiveSummary?: string;
  totalVolume?: number;
  totalFees?: number;
  estimatedAnnualSavings?: number;
  effectiveRate?: number;
  confidence?: "high" | "medium" | "low";
  benchmark?: {
    status?: BenchmarkStatus;
    lowerRate?: number;
    upperRate?: number;
  };
  bundledPricing?: {
    active?: boolean;
    highestRatePercent?: number | null;
    confidence?: number;
    buckets?: Array<{
      label: string;
      ratePercent: number | null;
    }>;
  };
};

export type JobResponse = {
  id: string;
  fileName: string;
  businessType: BusinessTypeId;
  status: Exclude<JobStatus, "idle" | "uploading">;
  progress: number;
  error: string | null;
  summary: PublicSummary | null;
  customerReport: CustomerReportDTO | null;
};

export type ResultsViewModel = {
  state: CustomerReportDTO["state"] | "Limited";
  identityLine: string;
  merchantTitle: string;
  benchmark: {
    status: BenchmarkStatus | "unknown";
    label: string;
    rangeLabel: string;
    className: "good" | "warn" | "neutral";
  };
  stats: {
    effectiveRate: string | null;
    totalFees: string | null;
    volume: string | null;
    annualSavings: string | null;
    conservativeSavings: string | null;
    negotiableSavings: string | null;
  };
  pricing: {
    label: string;
    detail: string;
    description: string;
    statusLabel: string;
    tone: "good" | "warn" | "info";
    recommendation: string | null;
  } | null;
  narrative: {
    title: string;
    body: string;
  };
  twoBucket: {
    cardBrand: number | null;
    processor: number | null;
    processorShare: string | null;
    reliable: boolean;
  };
  findings: CustomerFinding[];
  findingCounts: {
    fix: number;
    watch: number;
    clean: number;
  };
  feeRows: Array<{
    label: string;
    description: string;
    amount: number;
    pctOfVolume: number | null;
    tone: "fixed" | "negotiable" | "avoidable" | "review";
  }>;
  actionItems: {
    processorQuestions: string[];
    negotiationChecklist: string[];
    documents: string[];
    risks: string[];
  };
};

export function buildResultsViewModel(job: JobResponse, selectedBusinessLabel: string | null): ResultsViewModel {
  const summary = job.summary ?? {};
  const report = job.customerReport;
  const financialSummary: PublicSummary = report?.buildState === "blocked" ? {} : summary;
  const identity = report?.identity;
  const processor = metricText(identity?.processorName) ?? financialSummary.processorName ?? "Processor not confirmed";
  const period = metricText(identity?.statementPeriod) ?? financialSummary.statementPeriod ?? "Statement period unavailable";
  const businessType = selectedBusinessLabel ?? metricText(identity?.businessType) ?? businessTypeFallback(job.businessType);
  const merchantName = metricText(identity?.merchantName);
  const findings = report?.state === "Actionable" ? (report.findings ?? []).filter((finding) => finding.severity !== "clean") : [];
  const benchmark = benchmarkModel(financialSummary);
  const annualSavings = positive(report?.savings?.annualAmount) ?? 0;
  const conservativeSavings = sumFindingAnnual(findings.filter((finding) => finding.severity === "fix"));
  const negotiableSavings = Math.max(0, annualSavings - conservativeSavings);
  const totalVolume = positive(financialSummary.totalVolume);
  const totalFees = positive(financialSummary.totalFees);
  const twoBucket = twoBucketModel(report);

  return {
    state: report?.state ?? "Limited",
    identityLine: `${processor} · ${period} · ${businessType}`,
    merchantTitle: merchantName ? `Statement analysis for ${merchantName}` : "Statement analysis",
    benchmark,
    stats: {
      effectiveRate: numberOrMetric(findMetric(report, "effective_rate"), formatPercent),
      totalFees: numberOrMetric(findMetric(report, "total_fees"), formatMoney0),
      volume: numberOrMetric(findMetric(report, "monthly_volume"), formatMoney0),
      annualSavings: annualSavings > 0 ? formatMoney0(annualSavings) : null,
      conservativeSavings: conservativeSavings > 0 ? formatMoney0(conservativeSavings) : null,
      negotiableSavings: negotiableSavings > 0 ? formatMoney0(negotiableSavings) : null,
    },
    pricing: pricingModel(financialSummary, report, annualSavings),
    narrative: {
      title: stripFullReportPrefix(report?.headline.title ?? "Here's what we found"),
      body: report?.headline.body ?? financialSummary.executiveSummary ?? "We compared this statement against the fee and benchmark data we could verify.",
    },
    twoBucket,
    findings,
    findingCounts: {
      fix: findings.filter((finding) => finding.severity === "fix").length,
      watch: findings.filter((finding) => finding.severity === "watch").length,
      clean: findings.filter((finding) => finding.severity === "clean").length,
    },
    feeRows: feeRows(report, financialSummary, twoBucket),
    actionItems: actionItems(findings),
  };
}

function benchmarkModel(summary: PublicSummary): ResultsViewModel["benchmark"] {
  const status = benchmarkStatus(summary);
  const lower = summary.benchmark?.lowerRate;
  const upper = summary.benchmark?.upperRate;
  const rangeLabel = Number.isFinite(lower) && Number.isFinite(upper) ? `${formatPercent(lower!)}–${formatPercent(upper!)}` : "range unavailable";
  if (status === "above") {
    return { status, label: `Above benchmark (${rangeLabel})`, rangeLabel, className: "warn" };
  }
  if (status === "below") {
    return { status, label: `Below benchmark (${rangeLabel})`, rangeLabel, className: "good" };
  }
  if (status === "within") {
    return { status, label: `Within benchmark (${rangeLabel})`, rangeLabel, className: "good" };
  }
  return { status: "unknown", label: "Benchmark unavailable", rangeLabel, className: "neutral" };
}

function benchmarkStatus(summary: PublicSummary): BenchmarkStatus | "unknown" {
  const status = summary.benchmark?.status ?? "unknown";
  const rate = summary.effectiveRate;
  const lower = summary.benchmark?.lowerRate;
  const upper = summary.benchmark?.upperRate;
  if (Number.isFinite(rate) && Number.isFinite(lower) && Number.isFinite(upper)) {
    if (rate! < lower!) return "below";
    if (rate! > upper!) return "above";
    return "within";
  }
  return status;
}

function pricingModel(summary: PublicSummary, report: CustomerReportDTO | null, annualSavings: number): ResultsViewModel["pricing"] {
  if (!report || report.state === "Limited") return null;
  const processorMarkup = findSection(report, "processor_markup");
  const markupMetric = processorMarkup?.metrics?.[0]?.value;
  const pricingConfidenceLow = summary.confidence === "low";
  if (summary.bundledPricing?.active) {
    const rates = (summary.bundledPricing.buckets ?? [])
      .filter((bucket) => Number.isFinite(bucket.ratePercent))
      .map((bucket) => `${bucket.label}: ${formatPercent(bucket.ratePercent!)}`)
      .join(" | ");
    return {
      label: "Tiered or bundled pricing",
      detail: rates || `Highest observed rate: ${formatPercent(summary.bundledPricing.highestRatePercent ?? 0)}`,
      description:
        "Your fees appear to be bundled into pricing tiers. Higher-tier transactions can cost more, and this model is harder to audit.",
      statusLabel: pricingConfidenceLow ? "Verify first" : "Review",
      tone: "warn",
      recommendation:
        annualSavings > 0
          ? `Ask your processor about switching to transparent interchange-plus pricing. Up to ${formatMoney0(annualSavings)}/year is worth challenging.`
          : "Ask your processor about switching to transparent interchange-plus pricing.",
    };
  }

  const pricingShouldWarn = summary.benchmark?.status === "above" || hasDowngradeFinding(report);
  return {
    label: "Itemized pricing",
    detail: markupMetric ? `Processor markup: ${markupMetric}` : "Spread not fully separated",
    description:
      "The statement separates card brand costs from processor-controlled fees more clearly than bundled pricing. That makes it easier to review and negotiate.",
    statusLabel: pricingShouldWarn ? "Review" : pricingConfidenceLow ? "Verify terms" : "Good",
    tone: pricingShouldWarn ? "warn" : pricingConfidenceLow ? "info" : "good",
    recommendation: pricingConfidenceLow ? "We couldn't fully verify your pricing model from this statement." : null,
  };
}

function hasDowngradeFinding(report: CustomerReportDTO | null): boolean {
  return (report?.findings ?? []).some((finding) => /higher-tier|tiered|downgrade/i.test(`${finding.id} ${finding.title} ${finding.description}`));
}

function twoBucketModel(report: CustomerReportDTO | null): ResultsViewModel["twoBucket"] {
  const section = findSection(report, "two_bucket_split");
  const cardBrand = metricNumber(section?.metrics?.find((metric) => metric.id === "card_brand_total"));
  const processor = metricNumber(section?.metrics?.find((metric) => metric.id === "processor_controlled_total"));
  const processorShare = section?.metrics?.find((metric) => metric.id === "processor_controlled_share")?.value ?? null;
  return {
    cardBrand,
    processor,
    processorShare,
    reliable: section?.displayMode === "exact" && cardBrand !== null && processor !== null,
  };
}

function feeRows(report: CustomerReportDTO | null, summary: PublicSummary, twoBucket: ResultsViewModel["twoBucket"]): ResultsViewModel["feeRows"] {
  const breakdownRows = findSection(report, "fee_breakdown")?.rows ?? [];
  if (breakdownRows.length) {
    const groups = new Map<
      string,
      {
        label: string;
        description: string;
        amount: number;
        tone: ResultsViewModel["feeRows"][number]["tone"];
      }
    >();
    for (const row of breakdownRows) {
      const existing = groups.get(row.category);
      if (existing) {
        existing.amount += row.rawAmount;
        continue;
      }
      groups.set(row.category, {
        label: row.category,
        description: categoryDescription(row.category),
        amount: row.rawAmount,
        tone: categoryTone(row.category),
      });
    }
    return [...groups.values()]
      .map((row) => ({
        ...row,
        amount: round2(row.amount),
        pctOfVolume: percentOfVolume(row.amount, summary.totalVolume),
      }))
      .sort((left, right) => right.amount - left.amount);
  }

  const rows: ResultsViewModel["feeRows"] = [];
  if (twoBucket.cardBrand !== null) {
    rows.push({
      label: "Card brand fees",
      description: "Set by card networks and usually not negotiable.",
      amount: twoBucket.cardBrand,
      pctOfVolume: percentOfVolume(twoBucket.cardBrand, summary.totalVolume),
      tone: "fixed",
    });
  }
  if (twoBucket.processor !== null) {
    rows.push({
      label: "Processor-controlled fees",
      description: "Processor margin, service fees, and other charges worth questioning.",
      amount: twoBucket.processor,
      pctOfVolume: percentOfVolume(twoBucket.processor, summary.totalVolume),
      tone: "negotiable",
    });
  }
  return rows;
}

function actionItems(findings: CustomerFinding[]): ResultsViewModel["actionItems"] {
  const firstFix = findings.find((finding) => finding.severity === "fix");
  const firstWatch = findings.find((finding) => finding.severity === "watch");
  return {
    processorQuestions: [
      "What exactly makes up your markup over interchange?",
      firstFix ? `Can you remove or correct ${questionSubject(firstFix)}?` : "Are any monthly service fees optional or removable?",
      firstWatch ? `Can you explain and reprice ${questionSubject(firstWatch)}?` : "Can you document each processor-controlled fee on this statement?",
    ],
    negotiationChecklist: [
      "Anchor on the percentage of sales you paid in fees, not only the headline rate.",
      "Ask for avoidable fees to be removed, not reduced.",
      "Get any new pricing in writing before agreeing.",
    ],
    documents: [
      "Your last 3-12 monthly statements",
      "Your current processing agreement",
      "A competing quote to use as leverage",
    ],
    risks: [
      "Early-termination fees in your current contract",
      "Rate creep on higher-tier transactions over time",
      "Equipment lease terms bundled into processing",
    ],
  };
}

function questionSubject(finding: CustomerFinding): string {
  const text = `${finding.id} ${finding.title}`.toLowerCase();
  if (text.includes("supply_shipping") || text.includes("supply shipping")) return "the supply shipping & handling fee";
  if (text.includes("monthly_service") || text.includes("monthly service")) return "the monthly service charge";
  if (text.includes("paper_statement") || text.includes("paper statement")) return "the paper statement fee";
  if (text.includes("per_auth") || text.includes("per-transaction")) return "the per-transaction fees";
  if (text.includes("mastercard_assessment") || text.includes("mastercard assessment")) return "the Mastercard assessment fee";
  if (text.includes("network_authorization") || text.includes("network authorization")) return "the network authorization fee";
  return genericQuestionSubject(finding.title);
}

function genericQuestionSubject(title: string): string {
  return title
    .replace(/^ask (?:to remove|for documentation on)\s+/i, "")
    .replace(/^your\s+/i, "the ")
    .replace(/\s*(?:\.|!|\?)\s*.*$/, "")
    .trim()
    .replace(/^the\s+/i, "the ");
}

function findSection(report: CustomerReportDTO | null, id: string) {
  return report?.sections.find((section) => section.id === id);
}

function findMetric(report: CustomerReportDTO | null, id: string) {
  return report?.metrics.find((metric) => metric.id === id);
}

function metricText(metric?: CustomerMetric): string | null {
  return typeof metric?.value === "string" && metric.value.trim() ? metric.value.trim() : null;
}

function metricNumber(metric?: CustomerMetric): number | null {
  if (metric?.displayMode !== "exact") return null;
  if (typeof metric.rawValue === "number" && Number.isFinite(metric.rawValue)) return metric.rawValue;
  return parseMoney(String(metric?.value ?? ""));
}

function numberOrMetric(metric: CustomerMetric | undefined, formatter: (value: number) => string) {
  if (metric?.displayMode !== "exact") return null;
  if (typeof metric.rawValue === "number" && Number.isFinite(metric.rawValue) && metric.rawValue > 0) return formatter(metric.rawValue);
  if (typeof metric.value === "string" && metric.value.trim()) return metric.value.trim();
  return null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function sumFindingAnnual(findings: CustomerFinding[]) {
  return findings.reduce((sum, finding) => {
    const annual = parseMoney(finding.annualImpact ?? "");
    if (annual !== null) return sum + annual;
    const monthly = parseMoney(finding.monthlyImpact ?? "");
    return monthly !== null ? sum + monthly * 12 : sum;
  }, 0);
}

function parseMoney(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function percentOfVolume(amount: number, volume: unknown) {
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume <= 0) return null;
  return (amount / volume) * 100;
}

function categoryDescription(category: string) {
  if (category === "Card brand / network") return "Set by Visa, Mastercard, Amex, and other networks.";
  if (category === "Processor fees") return "Processor-controlled fees and margin that can often be negotiated.";
  if (category === "Service & compliance") return "Service, PCI, gateway, statement, or compliance-related charges.";
  return "Needs processor documentation before making a conclusion.";
}

function categoryTone(category: string): ResultsViewModel["feeRows"][number]["tone"] {
  if (category === "Card brand / network") return "fixed";
  if (category === "Processor fees") return "negotiable";
  if (category === "Service & compliance") return "avoidable";
  return "review";
}

function stripFullReportPrefix(value: string) {
  return value.replace(/^Full report unlocked\.\s*/i, "");
}

function businessTypeFallback(value: BusinessTypeId) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Food Beverage", "Food & Beverage");
}

export function formatMoney0(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function formatMoney2(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
