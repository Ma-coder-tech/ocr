import type { StatementRecord } from "./accountStore.js";
import { detectFeeDrift } from "./feeDrift.js";
import { collectFeeFacts, mergeConfidence, type FeeFact } from "./feeFacts.js";
import type {
  AggregateAuditBenchmark,
  AggregateAuditFeeChanges,
  AggregateAuditFeeTimelineEntry,
  AggregateAuditMetric,
  AggregateAuditMonthScore,
  AggregateAuditOverpayment,
  AggregateAuditReport,
  AggregateAuditTrend,
  AggregateAuditTrendDirection,
  AggregateAuditTrendPoint,
  AggregateAuditVerdict,
  DataQualitySignal,
  FeeClassificationConfidence,
  FeeDriftFinding,
} from "./types.js";

const REQUESTED_STATEMENT_LIMIT = 12;
const BENCHMARK_OVERPAYMENT_WATCH_FLOOR = 100;
const BENCHMARK_OVERPAYMENT_URGENT_FLOOR = 500;

type AuditMonth = {
  statement: StatementRecord;
  statementId: number;
  period: string;
  periodKey: string;
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  benchmarkLow: number;
  benchmarkHigh: number;
  benchmarkStatus: StatementRecord["benchmarkVerdict"];
  processorMarkupUsd: number | null;
  processorMarkupBps: number | null;
  cardBrandPassThroughUsd: number | null;
  cardBrandPassThroughBps: number | null;
  facts: Map<string, FeeFact>;
};

type FeeTimelineAccumulator = {
  normalizedKey: string;
  label: string;
  bucket: AggregateAuditFeeTimelineEntry["bucket"];
  origin: FeeFact["origin"];
  firstSeenIndex: number;
  lastSeenIndex: number;
  monthsPresent: number;
  totalObservedUsd: number;
  hasObservedUsd: boolean;
  latestAmountUsd: number | null;
  latestRateBps: number | null;
  latestPerItemUsd: number | null;
  recurring: boolean;
  knownUnwanted: boolean;
  evidence: string[];
  confidence: FeeClassificationConfidence;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function finiteOrNull(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function positiveOrNull(value: unknown): number | null {
  const amount = finiteOrNull(value);
  return amount !== null && amount > 0 ? amount : null;
}

function amountToBps(amount: number | null, volume: number): number | null {
  if (amount === null || amount <= 0 || volume <= 0) return null;
  return round4((amount / volume) * 10_000);
}

function sortedStatements(statements: StatementRecord[]): StatementRecord[] {
  return [...statements].sort((left, right) => left.periodKey.localeCompare(right.periodKey) || left.slot - right.slot);
}

function monthIndex(periodKey: string): number | null {
  const match = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

function elapsedMonthCount(earlierPeriodKey: string, laterPeriodKey: string): number | null {
  const earlier = monthIndex(earlierPeriodKey);
  const later = monthIndex(laterPeriodKey);
  if (earlier === null || later === null) return null;
  const elapsed = later - earlier;
  return elapsed > 0 ? elapsed : null;
}

function toAuditMonth(statement: StatementRecord): AuditMonth {
  const volume = round2(statement.totalVolume);
  const processorMarkupUsd =
    positiveOrNull(statement.processorMarkup) ?? positiveOrNull(statement.analysisSummary.processorMarkupAudit?.totalPaid);
  const processorMarkupBps = positiveOrNull(statement.processorMarkupBps) ?? amountToBps(processorMarkupUsd, volume);
  const cardBrandPassThroughUsd =
    positiveOrNull(statement.cardNetworkFees) ?? positiveOrNull(statement.analysisSummary.interchangeAudit?.totalPaid);

  return {
    statement,
    statementId: statement.id,
    period: statement.statementPeriod,
    periodKey: statement.periodKey,
    totalVolume: volume,
    totalFees: round2(statement.totalFees),
    effectiveRate: round2(statement.effectiveRate),
    benchmarkLow: round2(statement.benchmarkLow),
    benchmarkHigh: round2(statement.benchmarkHigh),
    benchmarkStatus: statement.benchmarkVerdict,
    processorMarkupUsd,
    processorMarkupBps,
    cardBrandPassThroughUsd,
    cardBrandPassThroughBps: amountToBps(cardBrandPassThroughUsd, volume),
    facts: collectFeeFacts(statement.analysisSummary),
  };
}

function trendDirection(delta: number | null, unit: AggregateAuditTrend["unit"]): AggregateAuditTrendDirection {
  if (delta === null) return "unknown";
  const floor = unit === "money" ? 1 : unit === "bps" ? 1 : 0.01;
  if (Math.abs(delta) <= floor) return "flat";
  return delta > 0 ? "up" : "down";
}

function buildTrend(
  months: AuditMonth[],
  metric: AggregateAuditMetric,
  label: string,
  unit: AggregateAuditTrend["unit"],
  valueFor: (month: AuditMonth) => number | null,
): AggregateAuditTrend {
  const points: AggregateAuditTrendPoint[] = months.map((month) => ({
    statementId: month.statementId,
    period: month.period,
    periodKey: month.periodKey,
    value: valueFor(month),
  }));
  const observed = points.filter((point): point is AggregateAuditTrendPoint & { value: number } => point.value !== null);
  const firstValue = observed[0]?.value ?? null;
  const latestValue = observed[observed.length - 1]?.value ?? null;
  const absoluteDelta = firstValue !== null && latestValue !== null ? round4(latestValue - firstValue) : null;
  const percentDelta = firstValue !== null && latestValue !== null && firstValue !== 0 ? round2(((latestValue - firstValue) / firstValue) * 100) : null;
  const elapsedMonths =
    observed.length >= 2 ? elapsedMonthCount(observed[0].periodKey, observed[observed.length - 1].periodKey) ?? observed.length - 1 : null;
  const averageMonthlyChange =
    absoluteDelta !== null && elapsedMonths !== null ? round4(absoluteDelta / Math.max(1, elapsedMonths)) : null;
  const direction = observed.length === 1 ? "baseline" : trendDirection(absoluteDelta, unit);
  const confidence = observed.length >= 6 ? "high" : observed.length >= 2 ? "medium" : "low";
  const note =
    observed.length === 0
      ? `${label} could not be calculated from the saved statements.`
      : observed.length === 1
        ? `${label} has one usable month, so this is a baseline rather than a trend.`
        : `${label} compares ${observed.length} usable month${observed.length === 1 ? "" : "s"} from ${observed[0].period} to ${
            observed[observed.length - 1].period
          }.`;

  return {
    metric,
    label,
    unit,
    points,
    observedPointCount: observed.length,
    firstValue,
    latestValue,
    absoluteDelta,
    percentDelta,
    averageMonthlyChange,
    direction,
    confidence,
    note,
  };
}

function buildTrends(months: AuditMonth[]): AggregateAuditReport["trends"] {
  return {
    effective_rate: buildTrend(months, "effective_rate", "Effective rate", "percent", (month) => month.effectiveRate),
    total_fees: buildTrend(months, "total_fees", "Total fees", "money", (month) => month.totalFees),
    volume: buildTrend(months, "volume", "Volume", "money", (month) => month.totalVolume),
    processor_markup: buildTrend(months, "processor_markup", "Processor markup", "bps", (month) => month.processorMarkupBps),
    card_brand_pass_through: buildTrend(months, "card_brand_pass_through", "Card brand/pass-through", "bps", (month) => month.cardBrandPassThroughBps),
  };
}

function timelineEntry(acc: FeeTimelineAccumulator, months: AuditMonth[]): AggregateAuditFeeTimelineEntry {
  return {
    normalizedKey: acc.normalizedKey,
    label: acc.label,
    bucket: acc.bucket,
    origin: acc.origin,
    monthsPresent: acc.monthsPresent,
    firstSeenPeriod: months[acc.firstSeenIndex].period,
    lastSeenPeriod: months[acc.lastSeenIndex].period,
    totalObservedUsd: acc.hasObservedUsd ? round2(acc.totalObservedUsd) : null,
    latestAmountUsd: acc.latestAmountUsd,
    latestRateBps: acc.latestRateBps,
    latestPerItemUsd: acc.latestPerItemUsd,
    recurring: acc.recurring,
    knownUnwanted: acc.knownUnwanted,
    evidence: acc.evidence.slice(0, 6),
    confidence: acc.confidence,
  };
}

function buildFeeTimeline(months: AuditMonth[]): AggregateAuditFeeTimelineEntry[] {
  const accumulators = new Map<string, FeeTimelineAccumulator>();

  months.forEach((month, monthIndex) => {
    for (const fact of month.facts.values()) {
      const existing = accumulators.get(fact.key);
      if (!existing) {
        accumulators.set(fact.key, {
          normalizedKey: fact.key,
          label: fact.label,
          bucket: fact.bucket,
          origin: fact.origin,
          firstSeenIndex: monthIndex,
          lastSeenIndex: monthIndex,
          monthsPresent: 1,
          totalObservedUsd: fact.amountUsd ?? 0,
          hasObservedUsd: fact.amountUsd !== null,
          latestAmountUsd: fact.amountUsd,
          latestRateBps: fact.rateBps,
          latestPerItemUsd: fact.perItemUsd,
          recurring: fact.recurring,
          knownUnwanted: fact.knownUnwanted,
          evidence: [...new Set(fact.evidence)].slice(0, 6),
          confidence: fact.confidence,
        });
        continue;
      }

      existing.label = fact.priority >= 5 ? fact.label : existing.label;
      existing.bucket = fact.bucket !== "unknown" ? fact.bucket : existing.bucket;
      existing.origin = existing.origin === "line_item" || fact.origin === "line_item" ? "line_item" : existing.origin === "modeled" || fact.origin === "modeled" ? "modeled" : "rollup";
      existing.lastSeenIndex = monthIndex;
      existing.monthsPresent += 1;
      existing.totalObservedUsd += fact.amountUsd ?? 0;
      existing.hasObservedUsd = existing.hasObservedUsd || fact.amountUsd !== null;
      existing.latestAmountUsd = fact.amountUsd;
      existing.latestRateBps = fact.rateBps;
      existing.latestPerItemUsd = fact.perItemUsd;
      existing.recurring = existing.recurring || fact.recurring;
      existing.knownUnwanted = existing.knownUnwanted || fact.knownUnwanted;
      existing.evidence = [...new Set([...existing.evidence, ...fact.evidence])].slice(0, 6);
      existing.confidence = mergeConfidence(existing.confidence, fact.confidence);
    }
  });

  return [...accumulators.values()]
    .map((acc) => timelineEntry(acc, months))
    .sort((left, right) => (right.totalObservedUsd ?? 0) - (left.totalObservedUsd ?? 0) || left.label.localeCompare(right.label));
}

function isMaterialFeeChange(finding: FeeDriftFinding): boolean {
  return finding.kind === "amount_increase" || finding.kind === "rate_increase" || finding.kind === "per_item_increase";
}

function buildFeeChanges(months: AuditMonth[]): AggregateAuditFeeChanges {
  const timeline = buildFeeTimeline(months);
  const driftFindings: FeeDriftFinding[] = [];

  for (let index = 1; index < months.length; index += 1) {
    driftFindings.push(...detectFeeDrift(months[index - 1].statement.analysisSummary, months[index].statement.analysisSummary).findings);
  }

  const firstPeriod = months[0]?.period;
  const lastPeriod = months[months.length - 1]?.period;
  const nonPassThrough = (entry: AggregateAuditFeeTimelineEntry) => entry.bucket !== "card_brand_pass_through" || entry.knownUnwanted;
  const nonSynthetic = (entry: AggregateAuditFeeTimelineEntry) => entry.origin !== "rollup";

  return {
    newFees: timeline
      .filter((entry) => firstPeriod && entry.firstSeenPeriod !== firstPeriod)
      .filter(nonPassThrough)
      .filter(nonSynthetic)
      .slice(0, 12),
    removedFees: timeline
      .filter((entry) => lastPeriod && entry.lastSeenPeriod !== lastPeriod)
      .filter((entry) => entry.knownUnwanted || entry.recurring)
      .filter(nonSynthetic)
      .slice(0, 12),
    recurringNuisanceFees: timeline
      .filter((entry) => (entry.knownUnwanted || entry.recurring) && nonPassThrough(entry))
      .filter(nonSynthetic)
      .filter((entry) => months.length === 1 || entry.monthsPresent >= 2)
      .slice(0, 12),
    feeIncreases: driftFindings.filter(isMaterialFeeChange).slice(0, 20),
    driftFindings: driftFindings.slice(0, 30),
  };
}

function benchmarkOverpayment(month: AuditMonth): number {
  return round2((Math.max(0, month.effectiveRate - month.benchmarkHigh) / 100) * month.totalVolume);
}

function buildBenchmark(months: AuditMonth[]): AggregateAuditBenchmark {
  const above = months.filter((month) => month.benchmarkStatus === "above");
  const within = months.filter((month) => month.benchmarkStatus === "within");
  const below = months.filter((month) => month.benchmarkStatus === "below");
  const averageEffectiveRate = months.length ? round2(months.reduce((sum, month) => sum + month.effectiveRate, 0) / months.length) : null;
  const averageBenchmarkHigh = months.length ? round2(months.reduce((sum, month) => sum + month.benchmarkHigh, 0) / months.length) : null;
  const worstBenchmarkGap = months.length
    ? round2(Math.max(...months.map((month) => month.effectiveRate - month.benchmarkHigh)))
    : null;

  return {
    monthsAboveBenchmark: above.length,
    monthsWithinBenchmark: within.length,
    monthsBelowBenchmark: below.length,
    aboveBenchmarkPeriods: above.map((month) => month.period),
    averageEffectiveRate,
    averageBenchmarkHigh,
    worstBenchmarkGap,
  };
}

function buildOverpayment(months: AuditMonth[]): AggregateAuditOverpayment {
  const observedOverpaymentUsd = round2(months.reduce((sum, month) => sum + benchmarkOverpayment(month), 0));
  const averageMonthlyOverpaymentUsd = months.length ? round2(observedOverpaymentUsd / months.length) : 0;
  const confidence = months.length >= 6 ? "high" : months.length >= 2 ? "medium" : "low";

  return {
    observedOverpaymentUsd,
    averageMonthlyOverpaymentUsd,
    annualizedOverpaymentUsd: round2(averageMonthlyOverpaymentUsd * 12),
    calculation: "benchmark_ceiling_delta",
    confidence,
  };
}

function nuisanceFeeAmount(month: AuditMonth): number {
  let total = 0;
  for (const fact of month.facts.values()) {
    if (!fact.knownUnwanted && !fact.recurring) continue;
    total += fact.amountUsd ?? 0;
  }
  return round2(total);
}

function scoreMonth(month: AuditMonth): AggregateAuditMonthScore {
  const overpayment = benchmarkOverpayment(month);
  const nuisanceFeeUsd = nuisanceFeeAmount(month);
  const processorMarkupPressure =
    month.processorMarkupBps !== null && month.totalVolume > 0 ? Math.max(0, month.processorMarkupBps - 50) * (month.totalVolume / 10_000) : 0;
  const score = round2(overpayment + nuisanceFeeUsd + processorMarkupPressure + month.effectiveRate * 5);
  const reasons: string[] = [];

  if (overpayment > 0) reasons.push(`Benchmark overpayment modeled at $${overpayment.toFixed(2)}.`);
  else reasons.push("Effective rate is not above the benchmark ceiling.");
  if (month.processorMarkupBps !== null) reasons.push(`Processor markup is ${month.processorMarkupBps.toFixed(2)} bps.`);
  if (nuisanceFeeUsd > 0) reasons.push(`Recurring or nuisance fees total $${nuisanceFeeUsd.toFixed(2)}.`);

  return {
    statementId: month.statementId,
    period: month.period,
    periodKey: month.periodKey,
    effectiveRate: month.effectiveRate,
    totalFees: month.totalFees,
    totalVolume: month.totalVolume,
    processorMarkupBps: month.processorMarkupBps,
    benchmarkOverpaymentUsd: overpayment,
    nuisanceFeeUsd,
    score,
    reasons,
  };
}

function bestAndWorstMonths(months: AuditMonth[]): { bestMonth: AggregateAuditMonthScore | null; worstMonth: AggregateAuditMonthScore | null } {
  if (!months.length) return { bestMonth: null, worstMonth: null };
  const scored = months.map(scoreMonth).sort((left, right) => left.score - right.score);
  return {
    bestMonth: scored[0],
    worstMonth: scored[scored.length - 1],
  };
}

function buildCoverage(months: AuditMonth[], trends: AggregateAuditReport["trends"]): AggregateAuditReport["coverage"] {
  const missingMetricNotes = Object.values(trends)
    .filter((trend) => trend.observedPointCount < months.length)
    .map((trend) => `${trend.label} is available for ${trend.observedPointCount} of ${months.length} statement(s).`);

  return {
    requestedStatementLimit: REQUESTED_STATEMENT_LIMIT,
    hasFullTwelveMonthHistory: months.length >= REQUESTED_STATEMENT_LIMIT,
    missingMetricNotes,
  };
}

function buildDataQuality(months: AuditMonth[], coverage: AggregateAuditReport["coverage"]): DataQualitySignal[] {
  const signals: DataQualitySignal[] = [];

  if (!months.length) {
    signals.push({ level: "critical", message: "No completed statements were available for aggregate audit calculations." });
    return signals;
  }

  if (months.length === 1) {
    signals.push({ level: "info", message: "One statement is available, so aggregate output is a baseline rather than a trend." });
  } else if (!coverage.hasFullTwelveMonthHistory) {
    signals.push({
      level: "info",
      message: `${months.length} statements are available. The audit is useful now and will get stronger as more monthly history is added.`,
    });
  } else {
    signals.push({ level: "info", message: "Twelve completed statements are available for a full-history audit." });
  }

  for (const note of coverage.missingMetricNotes.slice(0, 4)) {
    signals.push({ level: "warning", message: note });
  }

  return signals;
}

function buildVerdict(input: {
  months: AuditMonth[];
  benchmark: AggregateAuditBenchmark;
  overpayment: AggregateAuditOverpayment;
  feeChanges: AggregateAuditFeeChanges;
  trends: AggregateAuditReport["trends"];
}): AggregateAuditVerdict {
  const { months, benchmark, overpayment, feeChanges, trends } = input;
  if (!months.length) {
    return {
      status: "unknown",
      title: "Audit unavailable",
      summary: "No completed statements are available yet.",
      reasons: ["Upload at least one completed statement to generate an audit baseline."],
      recommendedActions: ["Upload a processor statement with a visible monthly period."],
      confidence: "low",
    };
  }

  const criticalFindings = feeChanges.driftFindings.filter((finding) => finding.severity === "critical").length;
  const latestAbove = months[months.length - 1].benchmarkStatus === "above";
  const rateTrendUp = trends.effective_rate.direction === "up";
  const confidence = months.length >= 6 ? "high" : months.length >= 2 ? "medium" : "low";
  const reasons: string[] = [];

  if (benchmark.monthsAboveBenchmark > 0) {
    reasons.push(`${benchmark.monthsAboveBenchmark} of ${months.length} month(s) are above benchmark.`);
  }
  if (overpayment.annualizedOverpaymentUsd > 0) {
    reasons.push(`Annualized benchmark overpayment is modeled at $${overpayment.annualizedOverpaymentUsd.toFixed(2)}.`);
  }
  if (feeChanges.recurringNuisanceFees.length > 0) {
    reasons.push(`${feeChanges.recurringNuisanceFees.length} recurring nuisance fee pattern(s) were found.`);
  }
  if (criticalFindings > 0) {
    reasons.push(`${criticalFindings} critical fee drift finding(s) were found.`);
  }

  const recommendedActions = [
    "Use the worst-month evidence to request a line-item pricing explanation from the processor.",
    "Separate benchmark overpayment from nuisance fees before negotiating so savings are not double-counted.",
    "Keep adding monthly statements until the audit covers a full 12-month cycle.",
  ];

  if (
    (months.length >= 2 &&
      benchmark.monthsAboveBenchmark >= Math.ceil(months.length / 2) &&
      overpayment.annualizedOverpaymentUsd >= BENCHMARK_OVERPAYMENT_URGENT_FLOOR) ||
    criticalFindings >= 2
  ) {
    return {
      status: "urgent",
      title: "Urgent audit recommended",
      summary: "The saved history shows repeated benchmark pressure and material fee issues.",
      reasons,
      recommendedActions,
      confidence,
    };
  }

  if (benchmark.monthsAboveBenchmark > 0 && (latestAbove || overpayment.annualizedOverpaymentUsd >= BENCHMARK_OVERPAYMENT_WATCH_FLOOR)) {
    return {
      status: "overpaying",
      title: "Likely overpaying",
      summary: "At least one month is above benchmark and the annualized exposure is meaningful enough to review.",
      reasons,
      recommendedActions,
      confidence,
    };
  }

  if (months.length < 3 || rateTrendUp || feeChanges.feeIncreases.length > 0 || feeChanges.newFees.length > 0) {
    return {
      status: "watch",
      title: "Watch closely",
      summary: "The audit has useful signals, but history is still limited or fee movement was detected.",
      reasons: reasons.length ? reasons : ["Partial history is available, so this should be treated as a directional audit."],
      recommendedActions,
      confidence,
    };
  }

  return {
    status: "healthy",
    title: "No major aggregate issue found",
    summary: "The saved history does not show repeated above-benchmark pricing or material fee drift.",
    reasons: reasons.length ? reasons : ["Effective rate stayed at or below benchmark and no material recurring fee drift was detected."],
    recommendedActions: ["Continue monthly monitoring and preserve statement exports for negotiation evidence."],
    confidence,
  };
}

export function buildAggregateAudit(statements: StatementRecord[]): AggregateAuditReport {
  const months = sortedStatements(statements).map(toAuditMonth);
  const trends = buildTrends(months);
  const feeChanges = buildFeeChanges(months);
  const benchmark = buildBenchmark(months);
  const annualizedOverpayment = buildOverpayment(months);
  const coverage = buildCoverage(months, trends);
  const dataQuality = buildDataQuality(months, coverage);
  const { bestMonth, worstMonth } = bestAndWorstMonths(months);
  const verdict = buildVerdict({ months, benchmark, overpayment: annualizedOverpayment, feeChanges, trends });

  return {
    statementCount: months.length,
    observedPeriods: months.map((month) => month.period),
    coverage,
    trends,
    feeChanges,
    benchmark,
    annualizedOverpayment,
    bestMonth,
    worstMonth,
    verdict,
    dataQuality,
  };
}
