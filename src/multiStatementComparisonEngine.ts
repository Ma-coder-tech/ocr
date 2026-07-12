import type {
  ComparisonMerchantIdentity,
  ComparisonStatementFee,
  ComparisonStatementFinding,
  ComparisonStatementInput,
  ComparisonStatementNotice,
} from "./multiStatementComparisonInput.js";

export type TrendDirection = "increasing" | "decreasing" | "stable" | "fluctuating";
export type VolumeDirection = "growing" | "declining" | "stable";
export type DisputeDirection = "increasing" | "decreasing" | "stable" | "none";
export type FeeComparisonStatus = "recurring_unchanged" | "recurring_rate_changed" | "new_fee" | "removed_fee" | "intermittent";
export type Difficulty = "no_negotiation" | "negotiation_required" | "investigation_required";
export type GlobalFindingTier = "compliance_penalty" | "avoidable_fixed" | "suspicious" | "negotiation" | "informational";

export type MultiStatementAnalysis = {
  merchant: {
    id: string;
    merchantNumber: string;
    merchantName: string;
    isoName: string;
    processorPlatform: string;
    address: string;
    merchantCategory: string;
    merchantCategoryConfidence: "high" | "medium" | "low";
    merchantChannel: "card_present" | "card_not_present" | "mixed";
  };
  metadata: {
    totalStatementsAnalyzed: number;
    dateRange: { start: string; end: string };
    includedPeriods: string[];
    missingPeriods: string[];
    analysisTimestamp: string;
    pipelineVersion: string;
  };
  statementResults: Array<{
    statementPeriod: string;
    effectiveRate: number;
    totalVolume: number;
    totalFees: number;
    totalTransactions: number | null;
    averageTicket: number | null;
    pricingModel: string;
    pricingModelConfidence: "high" | "medium" | "low" | null;
    processorControlledTotal: number | null;
    processorControlledPct: number | null;
    benchmark: ComparisonStatementInput["benchmark"] | null;
    estimatedAnnualSavings: { conservative: number; estimated: number; maximum: number };
    findingCount: number;
    anomalyCount: number;
    noticeCount: number;
    individualReportId: string;
  }>;
  effectiveRateTrend: {
    periods: Array<{ period: string; effectiveRate: number; volume: number; totalFees: number; processorControlledPct: number | null; inactivePeriod?: boolean }>;
    direction: TrendDirection;
    lowestRate: { period: string; rate: number };
    highestRate: { period: string; rate: number };
    averageRate: number;
    rateChange: number;
    rateChangeExplanation: string | null;
  };
  feeComparison: Array<{
    compositeKey: string;
    feeFamilyKey: string;
    feeDescription: string;
    cardTypeSection: string | null;
    canonicalType: string;
    periods: Array<{ period: string; amount: number | null; rate: number | null; volume: number | null }>;
    presentOnAll: boolean;
    monthsPresent: number;
    status: FeeComparisonStatus;
    firstAppeared: string | null;
    lastSeen: string | null;
    rateChanged: boolean;
    amountChanged: boolean;
    cumulativeAmount: number;
    averageMonthlyAmount: number;
  }>;
  newFees: Array<{
    compositeKey: string;
    feeFamilyKey: string;
    feeDescription: string;
    cardTypeSection: string | null;
    firstAppeared: string;
    monthlyAmount: number;
    cumulativeAmountSinceAppearance: number;
    projectedAnnualCost: number;
    wasAnnouncedInNotice: boolean;
    announcementPeriod: string | null;
    finding: string;
  }>;
  rateChanges: Array<{
    feeFamilyKey: string;
    feeDescription: string;
    cardTypeSection: string | null;
    previousRate: number;
    newRate: number;
    changeMonth: string;
    monthlyImpactIncrease: number;
    annualImpactIncrease: number;
    cumulativeImpact: number;
    projectedAnnualImpact: number;
    wasAnnouncedInNotice: boolean;
    expectedNetworkCycleChange: boolean;
    announcementPeriod: string | null;
    finding: string;
  }>;
  noticeTracking: Array<{
    noticePeriod: string;
    feeName: string;
    noticeType: "fee_increase" | "fee_decrease" | "fee_delay" | "informational";
    announcedAmount: number | null;
    announcedEffectiveDate: string | null;
    actuallyAppeared: boolean | null;
    actualAmount: number | null;
    amountMatched: boolean | null;
    confidence: "high" | "medium" | "low";
    matchedFeeFamilyKey: string | null;
    finding: string;
  }>;
  processorMarkupTrend: {
    periods: Array<{ period: string; processorControlled: number | null; volume: number; markupPct: number | null }>;
    direction: "increasing" | "decreasing" | "stable";
    finding: string | null;
  };
  volumeTrend: {
    periods: Array<{ period: string; volume: number; transactions: number | null; avgTicket: number | null }>;
    direction: VolumeDirection;
    totalVolumeAllPeriods: number;
    averageMonthlyVolume: number;
    averageMonthlyTransactions: number | null;
  };
  disputeTrend: {
    periods: Array<{
      period: string;
      chargebacks: number;
      chargebackFees: number;
      achRejects: number;
      achRejectFees: number;
      totalDisputeCost: number;
      disputeCostPct: number;
    }>;
    direction: DisputeDirection;
    totalDisputeCostsAllPeriods: number;
    finding: string | null;
  };
  operationalTrend: {
    inactivePeriods: Array<{ period: string; fixedFeesCharged: number }>;
    refundTrend: {
      periods: Array<{ period: string; grossSales: number | null; refunds: number | null; refundPctOfGrossSales: number | null }>;
      direction: TrendDirection;
      finding: string | null;
    };
    cardMixShifts: Array<{
      period: string;
      cardType: string;
      previousShare: number;
      currentShare: number;
      finding: string;
    }>;
    interchangeQualificationTrend: {
      applicable: boolean;
      finding: string | null;
    };
    priorPeriodAdjustments: Array<{
      period: string;
      description: string;
      amount: number | null;
      finding: string;
    }>;
  };
  pricingModelConsistency: {
    consistent: boolean;
    models: Array<{ period: string; model: string; confidence: string | null }>;
    finding: string | null;
  };
  cumulativeSavings: {
    totalPeriodsCovered: number;
    dateRange: string;
    alreadyOverpaid: { conservative: number; estimated: number; maximum: number };
    projectedAnnualIfUnchanged: { conservative: number; estimated: number; maximum: number };
    topRecurringIssues: Array<{
      fingerprint: string;
      issue: string;
      classification: string;
      monthsPresent: number;
      totalPaid: number;
      averageMonthlyAmount: number;
      projectedAnnual: number;
      action: string;
      difficulty: Difficulty;
    }>;
  };
  resolvedFees: Array<{
    compositeKey: string;
    feeDescription: string;
    firstAppeared: string;
    lastSeen: string;
    totalPaid: number;
    finding: string;
  }>;
  globalFindings: Array<{
    fingerprint: string;
    priority: number;
    tier: GlobalFindingTier;
    title: string;
    description: string;
    monthsAffected: number;
    cumulativeImpact: number;
    projectedAnnualImpact: number;
    action: string;
    difficulty: Difficulty;
    evidence: Array<{ period: string; detail: string }>;
  }>;
  actionItems: Array<{
    priority: number;
    action: string;
    expectedSavings: number;
    difficulty: Difficulty;
    relatedFindings: string[];
  }>;
  masterNarrative: string;
};

export type CompareMultiStatementOptions = {
  analysisTimestamp?: string;
  pipelineVersion?: string;
};

type FamilyPeriodSnapshot = {
  period: string;
  amount: number;
  rate: number | null;
  count: number | null;
  volume: number | null;
  fees: ComparisonStatementFee[];
};

type FamilyChange = {
  feeFamilyKey: string;
  description: string;
  changeMonth: string;
  previousValue: number;
  newValue: number;
  kind: "rate" | "amount";
  monthlyImpact: number;
  annualImpact: number;
  cumulativeImpact: number;
  projectedAnnualImpact: number;
  announced: boolean;
  announcementPeriod: string | null;
  evidence: Array<{ period: string; detail: string }>;
};

const RATE_TOLERANCE = 0.0005;
const VOLUME_TOLERANCE_PCT = 0.05;
const MONEY_TOLERANCE = 0.005;
const REFUND_ALERT_PCT = 0.03;
const CARD_MIX_SHIFT_THRESHOLD = 0.05;

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundRate(value: number): number {
  return round(value, 8);
}

function periodIndex(period: string): number {
  const [year, month] = period.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error(`Invalid statement period: ${period}`);
  return year * 12 + month - 1;
}

function periodFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function sortStatements(statements: ComparisonStatementInput[]): ComparisonStatementInput[] {
  const seen = new Set<string>();
  for (const statement of statements) {
    if (seen.has(statement.statementPeriod)) throw new Error(`Duplicate statement period: ${statement.statementPeriod}`);
    seen.add(statement.statementPeriod);
  }
  return [...statements].sort((left, right) => periodIndex(left.statementPeriod) - periodIndex(right.statementPeriod));
}

function missingPeriods(statements: ComparisonStatementInput[]): string[] {
  if (statements.length <= 1) return [];
  const first = periodIndex(statements[0].statementPeriod);
  const last = periodIndex(statements.at(-1)!.statementPeriod);
  const present = new Set(statements.map((statement) => statement.statementPeriod));
  const missing: string[] = [];
  for (let index = first; index <= last; index += 1) {
    const period = periodFromIndex(index);
    if (!present.has(period)) missing.push(period);
  }
  return missing;
}

function direction(values: number[], tolerance: number): TrendDirection {
  if (values.length <= 1) return "stable";
  const deltas = values.slice(1).map((value, index) => value - values[index]).filter((delta) => Math.abs(delta) > tolerance);
  if (deltas.length === 0) return "stable";
  const hasIncrease = deltas.some((delta) => delta > 0);
  const hasDecrease = deltas.some((delta) => delta < 0);
  if (hasIncrease && hasDecrease) return "fluctuating";
  return hasIncrease ? "increasing" : "decreasing";
}

function primaryDirection(values: number[], tolerance: number): TrendDirection {
  if (values.length <= 1) return "stable";
  const first = values[0];
  const last = values.at(-1)!;
  const netDelta = last - first;
  if (Math.abs(netDelta) > tolerance) return netDelta > 0 ? "increasing" : "decreasing";
  return direction(values, tolerance);
}

function volumeDirection(values: number[]): VolumeDirection {
  if (values.length <= 1) return "stable";
  const first = values[0];
  const last = values.at(-1)!;
  if (first <= 0) return "stable";
  const deltaPct = (last - first) / first;
  if (Math.abs(deltaPct) <= VOLUME_TOLERANCE_PCT) return "stable";
  return deltaPct > 0 ? "growing" : "declining";
}

function merchantFrom(statement: ComparisonStatementInput): MultiStatementAnalysis["merchant"] {
  const merchant = statement.merchant;
  return {
    id: merchant.id ?? "",
    merchantNumber: merchant.merchantNumber ?? "",
    merchantName: merchant.merchantName ?? "",
    isoName: merchant.isoName ?? "",
    processorPlatform: merchant.processorPlatform,
    address: merchant.address ?? "",
    merchantCategory: merchant.merchantCategory ?? "",
    merchantCategoryConfidence: merchant.merchantCategoryConfidence ?? "medium",
    merchantChannel: merchant.merchantChannel ?? "mixed",
  };
}

function operational(statement: ComparisonStatementInput): ComparisonStatementInput["operationalMetrics"] {
  return (
    statement.operationalMetrics ?? {
      grossSales: null,
      refunds: null,
      refundCount: null,
      refundPctOfGrossSales: null,
      cardMix: [],
      priorPeriodAdjustments: [],
      inactivePeriod: statement.financials.totalVolume === 0,
      fixedFeesChargedWithNoVolume: null,
    }
  );
}

function dateRangeLabel(statements: ComparisonStatementInput[]): string {
  return `${statements[0].statementPeriod} - ${statements.at(-1)!.statementPeriod}`;
}

function statementResults(statements: ComparisonStatementInput[]): MultiStatementAnalysis["statementResults"] {
  return statements.map((statement) => ({
    statementPeriod: statement.statementPeriod,
    effectiveRate: statement.financials.effectiveRate,
    totalVolume: statement.financials.totalVolume,
    totalFees: statement.financials.totalFees,
    totalTransactions: statement.financials.totalTransactions,
    averageTicket: statement.financials.averageTicket,
    pricingModel: statement.pricingModel.model,
    pricingModelConfidence: statement.pricingModel.confidence,
    processorControlledTotal: statement.processorControlledTotal,
    processorControlledPct: statement.processorControlledPct,
    benchmark: statement.benchmark ?? null,
    estimatedAnnualSavings: statement.estimatedAnnualSavings,
    findingCount: statement.findings.length,
    anomalyCount: statement.dataQuality.filter((signal) => /anomal/i.test(signal.message)).length,
    noticeCount: statement.notices.length,
    individualReportId: statement.sourceAnalysisId ?? statement.statementPeriod,
  }));
}

function effectiveRateTrend(
  statements: ComparisonStatementInput[],
  familyChanges: FamilyChange[],
  newFeeRows: MultiStatementAnalysis["newFees"],
): MultiStatementAnalysis["effectiveRateTrend"] {
  const periods = statements.map((statement) => ({
    period: statement.statementPeriod,
    effectiveRate: statement.financials.effectiveRate,
    volume: statement.financials.totalVolume,
    totalFees: statement.financials.totalFees,
    processorControlledPct: statement.processorControlledPct,
    inactivePeriod: operational(statement).inactivePeriod,
  }));
  const activePeriods = periods.filter((period) => !period.inactivePeriod && period.volume > 0);
  const trendPeriods = activePeriods.length > 0 ? activePeriods : periods;
  const values = trendPeriods.map((period) => period.effectiveRate);
  const lowest = trendPeriods.reduce((best, item) => (item.effectiveRate < best.effectiveRate ? item : best), trendPeriods[0]);
  const highest = trendPeriods.reduce((best, item) => (item.effectiveRate > best.effectiveRate ? item : best), trendPeriods[0]);
  const explanation = rateChangeExplanation(statements, familyChanges, newFeeRows);
  const totalVolume = activePeriods.reduce((sum, period) => sum + period.volume, 0);
  const totalFees = activePeriods.reduce((sum, period) => sum + period.totalFees, 0);
  return {
    periods,
    direction: primaryDirection(values, RATE_TOLERANCE),
    lowestRate: { period: lowest.period, rate: lowest.effectiveRate },
    highestRate: { period: highest.period, rate: highest.effectiveRate },
    averageRate: totalVolume > 0 ? roundRate(totalFees / totalVolume) : roundRate(values.reduce((sum, value) => sum + value, 0) / values.length),
    rateChange: roundRate(values.at(-1)! - values[0]),
    rateChangeExplanation: explanation,
  };
}

function rateChangeExplanation(
  statements: ComparisonStatementInput[],
  familyChanges: FamilyChange[],
  newFeeRows: MultiStatementAnalysis["newFees"],
): string | null {
  if (statements.length <= 1) return null;
  const messages: string[] = [];
  for (let index = 1; index < statements.length; index += 1) {
    const previous = statements[index - 1];
    const current = statements[index];
    const volumeDelta = previous.financials.totalVolume > 0 ? (current.financials.totalVolume - previous.financials.totalVolume) / previous.financials.totalVolume : 0;
    const rateDelta = current.financials.effectiveRate - previous.financials.effectiveRate;
    if (volumeDelta > 0.25 && rateDelta < -RATE_TOLERANCE) {
      messages.push(`${current.statementPeriod}: effective rate dropped because higher volume diluted fixed fees.`);
    }
  }
  for (const change of familyChanges) {
    if (change.feeFamilyKey === "wats_auth_fee") messages.push(`${change.changeMonth}: WATS AUTH FEE increase raised per-authorization costs.`);
  }
  for (const fee of newFeeRows) {
    if (fee.feeFamilyKey === "managed_security_non_validated") messages.push(`${fee.firstAppeared}: PCI/non-validation fee appeared.`);
    if (fee.feeFamilyKey === "regulatory_product") messages.push(`${fee.firstAppeared}: REGULATORY PRODUCT fee appeared.`);
  }
  const ops = operationalTrend(statements);
  for (const shift of ops.cardMixShifts) messages.push(`${shift.period}: ${shift.finding}`);
  if (ops.refundTrend.finding) messages.push(ops.refundTrend.finding);
  for (const inactive of ops.inactivePeriods) {
    messages.push(`${inactive.period}: no processing volume was detected; fixed fees of $${inactive.fixedFeesCharged.toFixed(2)} were charged despite no activity.`);
  }
  return messages.length > 0 ? messages.join(" ") : null;
}

function feeComparison(statements: ComparisonStatementInput[]): MultiStatementAnalysis["feeComparison"] {
  const periods = statements.map((statement) => statement.statementPeriod);
  const byKey = new Map<string, ComparisonStatementFee[]>();
  for (const statement of statements) {
    for (const fee of statement.fees) {
      const key = fee.compositeKey;
      const rows = byKey.get(key) ?? [];
      rows.push(fee);
      byKey.set(key, rows);
    }
  }

  return [...byKey.entries()]
    .map(([key, fees]) => {
      const sample = fees[0];
      const periodRows = periods.map((period) => {
        const statement = statements.find((item) => item.statementPeriod === period)!;
        const rows = statement.fees.filter((fee) => fee.compositeKey === key);
        const amount = rows.length > 0 ? round(rows.reduce((sum, fee) => sum + fee.amount, 0)) : null;
        const rates = [...new Set(rows.map((fee) => fee.rate).filter((rate): rate is number => rate !== null))];
        const volumes = rows.map((fee) => fee.volumeBasis).filter((volume): volume is number => volume !== null);
        return {
          period,
          amount,
          rate: rates.length === 1 ? rates[0] : null,
          volume: volumes.length > 0 ? round(volumes.reduce((sum, volume) => sum + volume, 0)) : null,
        };
      });
      const present = periodRows.map((row) => row.amount !== null);
      const presentIndices = present.map((value, index) => (value ? index : -1)).filter((index) => index >= 0);
      const monthsPresent = presentIndices.length;
      const amounts = periodRows.map((row) => row.amount).filter((amount): amount is number => amount !== null);
      const rates = periodRows.map((row) => row.rate).filter((rate): rate is number => rate !== null);
      const amountChanged = new Set(amounts.map((amount) => amount.toFixed(2))).size > 1;
      const rateChanged = new Set(rates.map((rate) => rate.toFixed(8))).size > 1;
      return {
        compositeKey: key,
        feeFamilyKey: sample.feeFamilyKey,
        feeDescription: sample.displayName,
        cardTypeSection: sample.cardTypeSection,
        canonicalType: sample.feeType,
        periods: periodRows,
        presentOnAll: monthsPresent === periods.length,
        monthsPresent,
        status: feeStatus(present, rateChanged, amountChanged, sample),
        firstAppeared: presentIndices.length > 0 ? periods[presentIndices[0]] : null,
        lastSeen: presentIndices.length > 0 ? periods[presentIndices.at(-1)!] : null,
        rateChanged,
        amountChanged,
        cumulativeAmount: round(amounts.reduce((sum, amount) => sum + amount, 0)),
        averageMonthlyAmount: monthsPresent > 0 ? round(amounts.reduce((sum, amount) => sum + amount, 0) / monthsPresent) : 0,
      };
    })
    .sort((left, right) => left.compositeKey.localeCompare(right.compositeKey));
}

function feeStatus(present: boolean[], rateChanged: boolean, amountChanged: boolean, sample: ComparisonStatementFee): FeeComparisonStatus {
  if (isEventDrivenFee(sample)) return "intermittent";
  const presentCount = present.filter(Boolean).length;
  if (presentCount === present.length) return rateChanged || amountChanged ? "recurring_rate_changed" : "recurring_unchanged";
  const firstPresent = present.findIndex(Boolean);
  const lastPresent = present.length - 1 - [...present].reverse().findIndex(Boolean);
  if (firstPresent > 0 && present.slice(firstPresent).every(Boolean)) return "new_fee";
  if (firstPresent === 0 && present.slice(0, lastPresent + 1).every(Boolean) && present.slice(lastPresent + 1).every((value) => !value)) return "removed_fee";
  return "intermittent";
}

function isEventDrivenFee(fee: Pick<ComparisonStatementFee, "feeFamilyKey" | "displayName">): boolean {
  return /chargeback|dispute|reject/i.test(`${fee.feeFamilyKey} ${fee.displayName}`);
}

function familySnapshots(statements: ComparisonStatementInput[]): Map<string, FamilyPeriodSnapshot[]> {
  const families = new Map<string, FamilyPeriodSnapshot[]>();
  for (const statement of statements) {
    const periodGroups = new Map<string, ComparisonStatementFee[]>();
    for (const fee of statement.fees) {
      const rows = periodGroups.get(fee.feeFamilyKey) ?? [];
      rows.push(fee);
      periodGroups.set(fee.feeFamilyKey, rows);
    }
    for (const [familyKey, fees] of periodGroups) {
      const rates = [...new Set(fees.map((fee) => fee.rate).filter((rate): rate is number => rate !== null))];
      const counts = fees.map((fee) => fee.count).filter((count): count is number => count !== null);
      const volumes = fees.map((fee) => fee.volumeBasis).filter((volume): volume is number => volume !== null);
      const snapshots = families.get(familyKey) ?? [];
      snapshots.push({
        period: statement.statementPeriod,
        amount: round(fees.reduce((sum, fee) => sum + fee.amount, 0)),
        rate: rates.length === 1 ? rates[0] : null,
        count: counts.length > 0 ? counts.reduce((sum, count) => sum + count, 0) : null,
        volume: volumes.length > 0 ? round(volumes.reduce((sum, volume) => sum + volume, 0)) : null,
        fees,
      });
      families.set(familyKey, snapshots);
    }
  }
  return families;
}

function familyChanges(statements: ComparisonStatementInput[]): FamilyChange[] {
  const snapshots = familySnapshots(statements);
  const changes: FamilyChange[] = [];
  for (const [familyKey, rows] of snapshots) {
    if (rows.length < 2 || rows.some((row) => row.fees.some(isEventDrivenFee))) continue;
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      const sample = current.fees[0];
      if (previous.rate !== null && current.rate !== null && Math.abs(current.rate - previous.rate) > 0.000001) {
        const monthlyImpact = current.count !== null ? round(current.count * (current.rate - previous.rate)) : round(current.amount - previous.amount);
        changes.push(buildFamilyChange(statements, familyKey, sample.displayName, current.period, previous.rate, current.rate, "rate", monthlyImpact, previous, current));
        continue;
      }
      const fixedLike = current.fees.every((fee) => fee.rate === null && fee.volumeBasis === null && (fee.feeType.includes("fixed") || fee.feeType === "compliance_penalty"));
      if (fixedLike && Math.abs(current.amount - previous.amount) > MONEY_TOLERANCE) {
        const monthlyImpact = round(current.amount - previous.amount);
        changes.push(buildFamilyChange(statements, familyKey, sample.displayName, current.period, previous.amount, current.amount, "amount", monthlyImpact, previous, current));
      }
    }
  }
  return changes.sort((left, right) => left.changeMonth.localeCompare(right.changeMonth) || left.feeFamilyKey.localeCompare(right.feeFamilyKey));
}

function buildFamilyChange(
  statements: ComparisonStatementInput[],
  familyKey: string,
  description: string,
  changeMonth: string,
  previousValue: number,
  newValue: number,
  kind: "rate" | "amount",
  monthlyImpact: number,
  previous: FamilyPeriodSnapshot,
  current: FamilyPeriodSnapshot,
): FamilyChange {
  const notice = priorNoticeForFamily(statements, familyKey, changeMonth);
  const snapshots = familySnapshots(statements).get(familyKey) ?? [];
  const cumulativeImpact = round(
    snapshots
      .filter((snapshot) => snapshot.period >= changeMonth)
      .reduce((sum, snapshot) => {
        if (kind === "rate") return sum + (snapshot.count ?? 0) * (newValue - previousValue);
        return sum + Math.max(0, snapshot.amount - previous.amount);
      }, 0),
  );
  const latest = snapshots.at(-1);
  const latestMonthlyImpact =
    latest && kind === "rate"
      ? round((latest.count ?? 0) * (newValue - previousValue))
      : latest
        ? round(Math.max(0, latest.amount - previous.amount))
        : monthlyImpact;
  return {
    feeFamilyKey: familyKey,
    description,
    changeMonth,
    previousValue,
    newValue,
    kind,
    monthlyImpact: round(monthlyImpact),
    annualImpact: round(monthlyImpact * 12),
    cumulativeImpact,
    projectedAnnualImpact: round(latestMonthlyImpact * 12),
    announced: Boolean(notice),
    announcementPeriod: notice?.period ?? null,
    evidence: [
      { period: previous.period, detail: `${description}: previous ${kind} ${previousValue}` },
      { period: current.period, detail: `${description}: new ${kind} ${newValue}` },
    ],
  };
}

function noticeFamilyKey(notice: ComparisonStatementNotice): string | null {
  if (!notice.feeName) return null;
  const normalized = notice.feeName
    .trim()
    .toLowerCase()
    .replace(/^(?:visa|vi|mastercard|mc|discover|amex|american express)\s+/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || null;
}

function priorNoticeForFamily(statements: ComparisonStatementInput[], familyKey: string, period: string): { period: string; notice: ComparisonStatementNotice } | null {
  for (const statement of statements) {
    if (statement.statementPeriod >= period) continue;
    for (const notice of statement.notices) {
      if (noticeFamilyKey(notice) === familyKey) return { period: statement.statementPeriod, notice };
    }
  }
  return null;
}

function newFees(
  comparisons: MultiStatementAnalysis["feeComparison"],
  statements: ComparisonStatementInput[],
): MultiStatementAnalysis["newFees"] {
  return comparisons
    .filter((comparison) => comparison.status === "new_fee")
    .filter((comparison) => !isEventDrivenFee({ feeFamilyKey: comparison.feeFamilyKey, displayName: comparison.feeDescription }))
    .filter((comparison) => comparison.cumulativeAmount > 0)
    .map((comparison) => {
      const monthlyAmount = comparison.periods.find((period) => period.period === comparison.firstAppeared)?.amount ?? comparison.averageMonthlyAmount;
      const latestAmount = [...comparison.periods].reverse().find((period) => period.amount !== null)?.amount ?? monthlyAmount;
      const notice = comparison.firstAppeared ? priorNoticeForFamily(statements, comparison.feeFamilyKey, comparison.firstAppeared) : null;
      return {
        compositeKey: comparison.compositeKey,
        feeFamilyKey: comparison.feeFamilyKey,
        feeDescription: comparison.feeDescription,
        cardTypeSection: comparison.cardTypeSection,
        firstAppeared: comparison.firstAppeared!,
        monthlyAmount: round(monthlyAmount),
        cumulativeAmountSinceAppearance: comparison.cumulativeAmount,
        projectedAnnualCost: round(latestAmount * 12),
        wasAnnouncedInNotice: Boolean(notice),
        announcementPeriod: notice?.period ?? null,
        finding: `${comparison.feeDescription} first appeared in ${comparison.firstAppeared} and has cost $${comparison.cumulativeAmount.toFixed(2)} so far.`,
      };
    });
}

function rateChanges(changes: FamilyChange[]): MultiStatementAnalysis["rateChanges"] {
  return changes.map((change) => ({
    feeFamilyKey: change.feeFamilyKey,
    feeDescription: change.description,
    cardTypeSection: null,
    previousRate: change.previousValue,
    newRate: change.newValue,
    changeMonth: change.changeMonth,
    monthlyImpactIncrease: change.monthlyImpact,
    annualImpactIncrease: change.annualImpact,
    cumulativeImpact: change.cumulativeImpact,
    projectedAnnualImpact: change.projectedAnnualImpact,
    wasAnnouncedInNotice: change.announced,
    expectedNetworkCycleChange: isExpectedNetworkCycleChange(change),
    announcementPeriod: change.announcementPeriod,
    finding: `${change.description} increased from ${change.previousValue} to ${change.newValue} in ${change.changeMonth}${
      change.announced
        ? " after prior notice"
        : isExpectedNetworkCycleChange(change)
          ? " during the normal April/October network fee update cycle"
          : " without prior notice"
    }.`,
  }));
}

function isExpectedNetworkCycleChange(change: FamilyChange): boolean {
  const month = Number(change.changeMonth.split("-")[1]);
  if (month !== 4 && month !== 10) return false;
  const text = `${change.feeFamilyKey} ${change.description}`.toLowerCase();
  const networkLike = /\b(visa|mastercard|mc|discover|amex|assessment|interchange|program|license|integrity|nabuf|acquirer|digital commerce)\b/.test(text);
  const processorLike = /\b(wats|auth fee|monthly|service|supply|shipping|managed security|pci|regulatory|gateway|bentobox|advantage)\b/.test(text);
  return networkLike && !processorLike;
}

function noticeTracking(statements: ComparisonStatementInput[]): MultiStatementAnalysis["noticeTracking"] {
  const snapshots = familySnapshots(statements);
  const byPeriod = new Map(statements.map((statement) => [statement.statementPeriod, statement]));
  const tracking: MultiStatementAnalysis["noticeTracking"] = [];
  for (const statement of statements) {
    for (const notice of statement.notices) {
      if (notice.noticeType === "informational") {
        tracking.push({
          noticePeriod: statement.statementPeriod,
          feeName: notice.feeName ?? "Informational notice",
          noticeType: "informational",
          announcedAmount: notice.amount,
          announcedEffectiveDate: notice.effectiveDate,
          actuallyAppeared: null,
          actualAmount: null,
          amountMatched: null,
          confidence: notice.confidence,
          matchedFeeFamilyKey: null,
          finding: "Informational notice; no fee execution tracking required.",
        });
        continue;
      }
      const familyKey = noticeFamilyKey(notice);
      const effectivePeriod = notice.effectiveDate;
      const statementForPeriod = effectivePeriod ? byPeriod.get(effectivePeriod) : null;
      const snapshot = familyKey && effectivePeriod ? snapshots.get(familyKey)?.find((item) => item.period === effectivePeriod) : null;
      const actualAmount = snapshot?.rate ?? snapshot?.amount ?? null;
      const amountMatched = notice.amount !== null && actualAmount !== null ? Math.abs(actualAmount - notice.amount) < 0.005 : null;
      tracking.push({
        noticePeriod: statement.statementPeriod,
        feeName: notice.feeName ?? "Unknown fee",
        noticeType: notice.noticeType === "fee_decrease" || notice.noticeType === "fee_delay" ? notice.noticeType : "fee_increase",
        announcedAmount: notice.amount,
        announcedEffectiveDate: effectivePeriod,
        actuallyAppeared: statementForPeriod ? Boolean(snapshot) : null,
        actualAmount,
        amountMatched,
        confidence: snapshot && amountMatched ? "high" : snapshot ? "medium" : notice.confidence,
        matchedFeeFamilyKey: snapshot ? familyKey : null,
        finding: snapshot
          ? `${notice.feeName ?? "Fee"} appeared in ${effectivePeriod} at ${actualAmount}.`
          : statementForPeriod
            ? `${notice.feeName ?? "Fee"} did not appear in ${effectivePeriod}.`
            : `No statement is available for ${effectivePeriod}.`,
      });
    }
  }
  return tracking;
}

function processorMarkupTrend(statements: ComparisonStatementInput[]): MultiStatementAnalysis["processorMarkupTrend"] {
  const periods = statements.map((statement) => ({
    period: statement.statementPeriod,
    processorControlled: statement.processorControlledTotal,
    volume: statement.financials.totalVolume,
    markupPct: statement.processorControlledPct,
  }));
  const values = periods.map((period) => period.markupPct).filter((value): value is number => value !== null);
  const dir = direction(values, RATE_TOLERANCE);
  return {
    periods,
    direction: dir === "fluctuating" ? "stable" : dir,
    finding: values.length > 1 ? `Processor-controlled markup trend is ${dir}.` : null,
  };
}

function volumeTrend(statements: ComparisonStatementInput[]): MultiStatementAnalysis["volumeTrend"] {
  const periods = statements.map((statement) => ({
    period: statement.statementPeriod,
    volume: statement.financials.totalVolume,
    transactions: statement.financials.totalTransactions,
    avgTicket: statement.financials.averageTicket,
  }));
  const transactionValues = periods.map((period) => period.transactions).filter((value): value is number => value !== null);
  return {
    periods,
    direction: volumeDirection(periods.map((period) => period.volume)),
    totalVolumeAllPeriods: round(periods.reduce((sum, period) => sum + period.volume, 0)),
    averageMonthlyVolume: round(periods.reduce((sum, period) => sum + period.volume, 0) / periods.length),
    averageMonthlyTransactions: transactionValues.length > 0 ? round(transactionValues.reduce((sum, value) => sum + value, 0) / transactionValues.length, 0) : null,
  };
}

function disputeTrend(statements: ComparisonStatementInput[]): MultiStatementAnalysis["disputeTrend"] {
  const periods = statements.map((statement) => ({
    period: statement.statementPeriod,
    chargebacks: statement.disputes.chargebacks ?? 0,
    chargebackFees: statement.disputes.chargebackFees ?? 0,
    achRejects: statement.disputes.achRejects ?? 0,
    achRejectFees: statement.disputes.achRejectFees ?? 0,
    totalDisputeCost: statement.disputes.totalDisputeCost ?? 0,
    disputeCostPct: statement.financials.totalVolume > 0 ? roundRate((statement.disputes.totalDisputeCost ?? 0) / statement.financials.totalVolume) : 0,
  }));
  const total = round(periods.reduce((sum, period) => sum + period.totalDisputeCost, 0));
  const max = periods.reduce((best, period) => (period.totalDisputeCost > best.totalDisputeCost ? period : best), periods[0]);
  const values = periods.map((period) => period.totalDisputeCost);
  const hasDisputes = values.some((value) => value > 0);
  const disputeDirection = (() => {
    if (!hasDisputes) return "none";
    const first = values[0];
    const last = values.at(-1)!;
    if (Math.abs(last - first) <= MONEY_TOLERANCE) return "stable";
    return last > first ? "increasing" : "decreasing";
  })();
  return {
    periods,
    direction: disputeDirection,
    totalDisputeCostsAllPeriods: total,
    finding: max.totalDisputeCost > 0 ? `Highest dispute cost was $${max.totalDisputeCost.toFixed(2)} in ${max.period}.` : null,
  };
}

function pricingModelConsistency(statements: ComparisonStatementInput[]): MultiStatementAnalysis["pricingModelConsistency"] {
  const models = statements.map((statement) => ({
    period: statement.statementPeriod,
    model: statement.pricingModel.model,
    confidence: statement.pricingModel.confidence,
  }));
  const unique = new Set(models.map((model) => model.model));
  return {
    consistent: unique.size <= 1,
    models,
    finding: unique.size <= 1 ? null : `Pricing model changed across analyzed periods: ${[...unique].join(", ")}.`,
  };
}

function operationalTrend(statements: ComparisonStatementInput[]): MultiStatementAnalysis["operationalTrend"] {
  const inactivePeriods = statements
    .filter((statement) => operational(statement).inactivePeriod)
    .map((statement) => ({
      period: statement.statementPeriod,
      fixedFeesCharged: operational(statement).fixedFeesChargedWithNoVolume ?? 0,
    }));
  const refundPeriods = statements.map((statement) => ({
    period: statement.statementPeriod,
    grossSales: operational(statement).grossSales,
    refunds: operational(statement).refunds,
    refundPctOfGrossSales: operational(statement).refundPctOfGrossSales,
  }));
  const refundValues = refundPeriods.map((period) => period.refundPctOfGrossSales).filter((value): value is number => value !== null);
  const elevatedRefund = refundPeriods.find((period) => (period.refundPctOfGrossSales ?? 0) > REFUND_ALERT_PCT);
  const refundDir = direction(refundValues, RATE_TOLERANCE);
  const cardMixShifts: MultiStatementAnalysis["operationalTrend"]["cardMixShifts"] = [];
  for (let index = 1; index < statements.length; index += 1) {
    const previous = operational(statements[index - 1]).cardMix;
    const current = operational(statements[index]).cardMix;
    if (previous.length === 0 || current.length === 0) continue;
    const previousByCard = new Map(previous.map((item) => [item.cardType, item]));
    for (const currentCard of current) {
      const previousCard = previousByCard.get(currentCard.cardType);
      if (!previousCard || previousCard.shareOfVolume === null || currentCard.shareOfVolume === null) continue;
      const delta = currentCard.shareOfVolume - previousCard.shareOfVolume;
      if (Math.abs(delta) >= CARD_MIX_SHIFT_THRESHOLD) {
        cardMixShifts.push({
          period: statements[index].statementPeriod,
          cardType: currentCard.cardType,
          previousShare: previousCard.shareOfVolume,
          currentShare: currentCard.shareOfVolume,
          finding: `Card mix shifted: ${currentCard.cardType} volume changed from ${(previousCard.shareOfVolume * 100).toFixed(1)}% to ${(currentCard.shareOfVolume * 100).toFixed(1)}% of total volume.`,
        });
      }
    }
  }
  const priorPeriodAdjustments = statements.flatMap((statement) =>
    operational(statement).priorPeriodAdjustments.map((adjustment) => ({
      period: statement.statementPeriod,
      description: adjustment.description,
      amount: adjustment.amount,
      finding: `${adjustment.description} may reference a prior period and can distort the current month's effective rate.`,
    })),
  );
  return {
    inactivePeriods,
    refundTrend: {
      periods: refundPeriods,
      direction: refundDir,
      finding: elevatedRefund
        ? `Refunds were ${((elevatedRefund.refundPctOfGrossSales ?? 0) * 100).toFixed(2)}% of gross sales in ${elevatedRefund.period}.`
        : refundValues.length > 1 && refundDir === "increasing"
          ? "Refunds increased as a percentage of gross sales across the analyzed periods."
          : null,
    },
    cardMixShifts,
    interchangeQualificationTrend: {
      applicable: statements.some((statement) => statement.fees.some((fee) => /interchange|program/i.test(`${fee.feeType} ${fee.displayName}`))),
      finding: null,
    },
    priorPeriodAdjustments,
  };
}

function classificationFor(familyKey: string, change?: FamilyChange): "confirmed" | "negotiable" | "investigative" {
  if (familyKey.includes("managed_security") || familyKey.includes("regulatory") || (change && !change.announced && change.kind === "amount")) return "confirmed";
  if (change?.kind === "rate") return "negotiable";
  return "investigative";
}

function findingTier(familyKey: string, change?: FamilyChange): GlobalFindingTier {
  if (familyKey.includes("managed_security")) return "compliance_penalty";
  if (familyKey.includes("regulatory") || (change && !change.announced && change.kind === "amount")) return "avoidable_fixed";
  if (change?.kind === "rate") return "negotiation";
  return "informational";
}

function difficultyFor(tier: GlobalFindingTier): Difficulty {
  if (tier === "compliance_penalty") return "no_negotiation";
  if (tier === "negotiation") return "negotiation_required";
  return "investigation_required";
}

function actionLabel(action: string | null, tier: GlobalFindingTier, title: string): string {
  if (action === "fix_terminal_or_gateway_configuration") return "Complete PCI/security validation or correct the terminal/gateway setup.";
  if (action === "request_pass_through_documentation") return "Ask the processor for pass-through documentation and dispute the charge if it cannot be documented.";
  if (action === "negotiate_processor_rate") return "Negotiate the processor-controlled rate.";
  if (action === "verify_third_party_service") return "Verify the third-party service is active and cancel or renegotiate it if it is not needed.";
  if (/paper statement/i.test(title)) return "Switch to electronic statements.";
  if (tier === "compliance_penalty") return "Complete validation or configuration steps needed to remove the fee.";
  if (tier === "negotiation") return "Negotiate the processor-controlled rate.";
  return "Ask processor to remove, waive, or document this charge.";
}

function tierForStatementFinding(finding: ComparisonStatementFinding): GlobalFindingTier {
  const text = `${finding.kind} ${finding.title} ${finding.fingerprint}`.toLowerCase();
  if (/pci|managed_security|managed security|non validated|penalty|configuration/.test(text)) return "compliance_penalty";
  if (finding.savingsTier === "confirmed") return "avoidable_fixed";
  if (finding.savingsTier === "negotiable") return "negotiation";
  if (finding.savingsTier === "investigative" || /suspicious|uniform|hidden|third_party|third party/.test(text)) return "suspicious";
  return "informational";
}

function annualImpactForFinding(finding: ComparisonStatementFinding): number {
  if (finding.componentImpactEstimate) return round(Math.max(finding.componentImpactEstimate.low, finding.componentImpactEstimate.high));
  if (finding.annualEstimate !== null) return round(finding.annualEstimate);
  if (finding.monthlyCost !== null) return round(finding.monthlyCost * 12);
  if (finding.amount !== null) return round(finding.amount * 12);
  return 0;
}

function monthlyImpactForFinding(finding: ComparisonStatementFinding): number {
  if (finding.componentImpactEstimate) return round(Math.max(finding.componentImpactEstimate.low, finding.componentImpactEstimate.high) / 12);
  if (finding.monthlyCost !== null) return round(finding.monthlyCost);
  if (finding.amount !== null) return round(finding.amount);
  if (finding.annualEstimate !== null) return round(finding.annualEstimate / 12);
  return 0;
}

function recurringStatementFindings(statements: ComparisonStatementInput[]): MultiStatementAnalysis["globalFindings"] {
  const minimumAppearances = statements.length === 1 ? 1 : 2;
  const groups = new Map<string, Array<{ statement: ComparisonStatementInput; finding: ComparisonStatementFinding }>>();
  for (const statement of statements) {
    for (const finding of statement.findings ?? []) {
      if (finding.action === "none") continue;
      const annualImpact = annualImpactForFinding(finding);
      if (annualImpact <= MONEY_TOLERANCE) continue;
      if (tierForStatementFinding(finding) === "informational") continue;
      const rows = groups.get(finding.fingerprint) ?? [];
      rows.push({ statement, finding });
      groups.set(finding.fingerprint, rows);
    }
  }

  const result: MultiStatementAnalysis["globalFindings"] = [];
  for (const [fingerprint, rows] of groups) {
    const uniquePeriods = [...new Set(rows.map((row) => row.statement.statementPeriod))];
    if (uniquePeriods.length < minimumAppearances) continue;
    const sample = rows[0].finding;
    const tier = tierForStatementFinding(sample);
    const cumulativeImpact = round(rows.reduce((sum, row) => sum + monthlyImpactForFinding(row.finding), 0));
    const projectedAnnualImpact = round(rows.reduce((sum, row) => sum + annualImpactForFinding(row.finding), 0) / rows.length);
    result.push({
      fingerprint,
      priority: tierPriority(tier),
      tier,
      title: sample.title,
      description: `${sample.title} appeared on ${uniquePeriods.length} analyzed statement(s).`,
      monthsAffected: uniquePeriods.length,
      cumulativeImpact,
      projectedAnnualImpact,
      action: actionLabel(sample.action, tier, sample.title),
      difficulty: difficultyFor(tier),
      evidence: rows.map((row) => ({
        period: row.statement.statementPeriod,
        detail: `${row.finding.title}: monthly impact ${monthlyImpactForFinding(row.finding).toFixed(2)}, projected annual impact ${annualImpactForFinding(row.finding).toFixed(2)}.`,
      })),
    });
  }
  return result;
}

function titleForFamily(familyKey: string): string {
  const known: Record<string, string> = {
    regulatory_product: "REGULATORY PRODUCT",
    managed_security_non_validated: "MANAGED SECURITY NON VALIDATED",
    wats_auth_fee: "WATS AUTH FEE increase",
    supply_shipping_handling: "SUPPLY SHIPPING & HANDLING increase",
    monthly_service_charge: "MONTHLY SERVICE CHARGE increase",
    silent_fixed_fee_increases: "Unannounced fixed-fee increases",
  };
  return known[familyKey] ?? familyKey.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function globalFindings(
  statements: ComparisonStatementInput[],
  fees: MultiStatementAnalysis["newFees"],
  changes: FamilyChange[],
): MultiStatementAnalysis["globalFindings"] {
  const findings: MultiStatementAnalysis["globalFindings"] = [...recurringStatementFindings(statements)];
  for (const fee of fees) {
    const tier = findingTier(fee.feeFamilyKey);
    findings.push({
      fingerprint: `${fee.feeFamilyKey}__${classificationFor(fee.feeFamilyKey)}`,
      priority: tierPriority(tier),
      tier,
      title: titleForFamily(fee.feeFamilyKey),
      description: fee.finding,
      monthsAffected: statements.filter((statement) => statement.fees.some((row) => row.feeFamilyKey === fee.feeFamilyKey)).length,
      cumulativeImpact: fee.cumulativeAmountSinceAppearance,
      projectedAnnualImpact: fee.projectedAnnualCost,
      action: fee.feeFamilyKey.includes("managed_security") ? "Complete PCI validation to remove the fee." : "Ask processor to remove or justify this fee.",
      difficulty: difficultyFor(tier),
      evidence: statements
        .filter((statement) => statement.fees.some((row) => row.feeFamilyKey === fee.feeFamilyKey))
        .map((statement) => ({ period: statement.statementPeriod, detail: `${titleForFamily(fee.feeFamilyKey)} charged $${sumFamily(statement, fee.feeFamilyKey).toFixed(2)}.` })),
    });
  }

  const fixedChanges = changes.filter((change) => !change.announced && change.kind === "amount");
  if (fixedChanges.length > 1) {
    const cumulativeImpact = round(fixedChanges.reduce((sum, change) => sum + change.cumulativeImpact, 0));
    const projectedAnnualImpact = round(fixedChanges.reduce((sum, change) => sum + change.projectedAnnualImpact, 0));
    findings.push({
      fingerprint: "silent_fixed_fee_increases__confirmed",
      priority: tierPriority("avoidable_fixed"),
      tier: "avoidable_fixed",
      title: titleForFamily("silent_fixed_fee_increases"),
      description: "Fixed monthly/account fees increased without a matching prior notice.",
      monthsAffected: fixedChanges.length,
      cumulativeImpact,
      projectedAnnualImpact,
      action: "Ask processor to reverse or justify the unannounced fixed-fee increases.",
      difficulty: "investigation_required",
      evidence: fixedChanges.flatMap((change) => change.evidence),
    });
  }

  for (const change of changes) {
    if (!change.announced && change.kind === "amount" && fixedChanges.length > 1) continue;
    const tier = findingTier(change.feeFamilyKey, change);
    findings.push({
      fingerprint: `${change.feeFamilyKey}_increase__${classificationFor(change.feeFamilyKey, change)}`,
      priority: tierPriority(tier),
      tier,
      title: titleForFamily(change.feeFamilyKey),
      description: change.announced
        ? `${titleForFamily(change.feeFamilyKey)} increased in ${change.changeMonth} after prior notice.`
        : `${titleForFamily(change.feeFamilyKey)} increased in ${change.changeMonth} with no prior notice found.`,
      monthsAffected: statements.filter((statement) => statement.statementPeriod >= change.changeMonth).length,
      cumulativeImpact: change.cumulativeImpact,
      projectedAnnualImpact: change.projectedAnnualImpact,
      action: tier === "negotiation" ? "Negotiate the processor-controlled rate." : "Ask processor to reverse or justify the increase.",
      difficulty: difficultyFor(tier),
      evidence: change.evidence,
    });
  }

  const byFingerprint = new Map<string, MultiStatementAnalysis["globalFindings"][number]>();
  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing || finding.projectedAnnualImpact > existing.projectedAnnualImpact) byFingerprint.set(finding.fingerprint, finding);
  }

  return [...byFingerprint.values()].sort((left, right) => {
    const priorityDelta = left.priority - right.priority;
    if (priorityDelta !== 0) return priorityDelta;
    const projectedDelta = right.projectedAnnualImpact - left.projectedAnnualImpact;
    if (Math.abs(projectedDelta) > MONEY_TOLERANCE) return projectedDelta;
    const cumulativeDelta = right.cumulativeImpact - left.cumulativeImpact;
    if (Math.abs(cumulativeDelta) > MONEY_TOLERANCE) return cumulativeDelta;
    return left.title.localeCompare(right.title);
  }).map((finding, index) => ({ ...finding, priority: index + 1 }));
}

function tierPriority(tier: GlobalFindingTier): number {
  switch (tier) {
    case "compliance_penalty":
      return 1;
    case "avoidable_fixed":
      return 2;
    case "suspicious":
      return 3;
    case "negotiation":
      return 4;
    case "informational":
    default:
      return 5;
  }
}

function sumFamily(statement: ComparisonStatementInput, familyKey: string): number {
  return round(statement.fees.filter((fee) => fee.feeFamilyKey === familyKey).reduce((sum, fee) => sum + fee.amount, 0));
}

function cumulativeSavings(
  statements: ComparisonStatementInput[],
  findings: MultiStatementAnalysis["globalFindings"],
): MultiStatementAnalysis["cumulativeSavings"] {
  const conservativeFindings = findings.filter((finding) => finding.tier === "compliance_penalty" || finding.tier === "avoidable_fixed");
  const estimatedFindings = findings.filter(
    (finding) => finding.tier === "compliance_penalty" || finding.tier === "avoidable_fixed" || finding.tier === "negotiation",
  );
  const maximumFindings = findings.filter((finding) => finding.tier !== "informational");
  const conservative = round(conservativeFindings.reduce((sum, finding) => sum + finding.cumulativeImpact, 0));
  const estimated = round(estimatedFindings.reduce((sum, finding) => sum + finding.cumulativeImpact, 0));
  const maximum = round(maximumFindings.reduce((sum, finding) => sum + finding.cumulativeImpact, 0));
  const projectedConservative = round(conservativeFindings.reduce((sum, finding) => sum + finding.projectedAnnualImpact, 0));
  const projectedEstimated = round(estimatedFindings.reduce((sum, finding) => sum + finding.projectedAnnualImpact, 0));
  const projectedMaximum = round(maximumFindings.reduce((sum, finding) => sum + finding.projectedAnnualImpact, 0));
  return {
    totalPeriodsCovered: statements.length,
    dateRange: dateRangeLabel(statements),
    alreadyOverpaid: { conservative, estimated, maximum },
    projectedAnnualIfUnchanged: { conservative: projectedConservative, estimated: projectedEstimated, maximum: projectedMaximum },
    topRecurringIssues: findings.map((finding) => ({
      fingerprint: finding.fingerprint,
      issue: finding.title,
      classification: finding.tier,
      monthsPresent: finding.monthsAffected,
      totalPaid: finding.cumulativeImpact,
      averageMonthlyAmount: finding.monthsAffected > 0 ? round(finding.cumulativeImpact / finding.monthsAffected) : 0,
      projectedAnnual: finding.projectedAnnualImpact,
      action: finding.action,
      difficulty: finding.difficulty,
    })),
  };
}

function resolvedFees(comparisons: MultiStatementAnalysis["feeComparison"]): MultiStatementAnalysis["resolvedFees"] {
  return comparisons
    .filter((comparison) => comparison.status === "removed_fee")
    .map((comparison) => ({
      compositeKey: comparison.compositeKey,
      feeDescription: comparison.feeDescription,
      firstAppeared: comparison.firstAppeared!,
      lastSeen: comparison.lastSeen!,
      totalPaid: comparison.cumulativeAmount,
      finding: `${comparison.feeDescription} was present from ${comparison.firstAppeared} through ${comparison.lastSeen}, then disappeared.`,
    }));
}

function actionItems(findings: MultiStatementAnalysis["globalFindings"]): MultiStatementAnalysis["actionItems"] {
  return findings
    .filter((finding) => finding.projectedAnnualImpact > 0)
    .map((finding, index) => ({
      priority: index + 1,
      action: finding.action,
      expectedSavings: finding.projectedAnnualImpact,
      difficulty: finding.difficulty,
      relatedFindings: [finding.fingerprint],
    }));
}

export function compareMultiStatementAnalyses(
  inputStatements: ComparisonStatementInput[],
  options: CompareMultiStatementOptions = {},
): MultiStatementAnalysis {
  if (inputStatements.length === 0) throw new Error("At least one statement is required for multi-statement comparison.");
  const statements = sortStatements(inputStatements);
  const familyChangeRows = familyChanges(statements);
  const comparisons = feeComparison(statements);
  const newFeeRows = newFees(comparisons, statements);
  const rateChangeRows = rateChanges(familyChangeRows);
  const globalFindingRows = globalFindings(statements, newFeeRows, familyChangeRows);

  return {
    merchant: merchantFrom(statements[0]),
    metadata: {
      totalStatementsAnalyzed: statements.length,
      dateRange: { start: statements[0].statementPeriod, end: statements.at(-1)!.statementPeriod },
      includedPeriods: statements.map((statement) => statement.statementPeriod),
      missingPeriods: missingPeriods(statements),
      analysisTimestamp: options.analysisTimestamp ?? new Date().toISOString(),
      pipelineVersion: options.pipelineVersion ?? statements.at(-1)?.pipelineVersion ?? "",
    },
    statementResults: statementResults(statements),
    effectiveRateTrend: effectiveRateTrend(statements, familyChangeRows, newFeeRows),
    feeComparison: comparisons,
    newFees: newFeeRows,
    rateChanges: rateChangeRows,
    noticeTracking: noticeTracking(statements),
    processorMarkupTrend: processorMarkupTrend(statements),
    volumeTrend: volumeTrend(statements),
    disputeTrend: disputeTrend(statements),
    operationalTrend: operationalTrend(statements),
    pricingModelConsistency: pricingModelConsistency(statements),
    cumulativeSavings: cumulativeSavings(statements, globalFindingRows),
    resolvedFees: resolvedFees(comparisons),
    globalFindings: globalFindingRows,
    actionItems: actionItems(globalFindingRows),
    masterNarrative: "",
  };
}
