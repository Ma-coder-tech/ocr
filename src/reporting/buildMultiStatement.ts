import type { Difficulty, MultiStatementAnalysis } from "../multiStatementComparisonEngine.js";
import { loadMccBenchmarkReference, matchBenchmarkPattern, type MccBenchmarkPattern } from "../mccBenchmarkReference.js";
import { explainFeeFromReference } from "../feeReferenceExplanations.js";

export type MultiStatementReportMoneyRange = {
  conservative: number;
  estimated: number;
  maximum: number;
};

export type MultiStatementReportMetric = {
  label: string;
  value: string;
  rawValue: number | string | null;
  unit: "money" | "percent" | "count" | "text";
};

export type MultiStatementFeeTimelineItem = {
  period: string;
  feeName: string;
  type: "new_fee" | "rate_change" | "amount_change" | "removed_fee";
  whatChanged: string;
  explanation: string;
  cumulativeImpact: number;
  projectedAnnualImpact: number;
  noticeFound: boolean | null;
  noticePeriod: string | null;
};

export type MultiStatementTopFinding = {
  priority: number;
  fingerprint: string;
  tier: string;
  title: string;
  description: string;
  explanation: string;
  monthsAffected: number;
  cumulativeImpact: number;
  projectedAnnualImpact: number;
  action: string;
  difficulty: Difficulty;
  evidence: Array<{ period: string; detail: string }>;
};

export type MultiStatementActionItemReport = {
  priority: number;
  action: string;
  expectedAnnualSavings: number;
  difficulty: Difficulty;
  explanation: string;
  relatedFindings: string[];
  includes: Array<{
    title: string;
    expectedAnnualSavings: number;
    relatedFindings: string[];
  }>;
};

export type MultiStatementRecurringAvoidableFee = {
  feeFamilyKey: string;
  sourceFindingFingerprint?: string;
  feeName: string;
  explanation: string;
  monthlyAmount: number;
  monthsPresent: number;
  cumulativeTotal: number;
  projectedAnnual: number;
  action: string;
  difficulty: Difficulty;
};

export type MultiStatementGlobalReport = {
  kind: "multi_statement_global";
  executiveSummary: {
    merchantName: string;
    isoName: string;
    processorPlatform: string;
    dateRange: string;
    statementCount: number;
    missingPeriods: string[];
    totalVolume: MultiStatementReportMetric;
    totalFees: MultiStatementReportMetric;
    averageEffectiveRate: MultiStatementReportMetric;
    trendDirection: string;
    pricingModel: string;
    pricingModelConsistent: boolean;
    headlineSavings: MultiStatementReportMetric;
    benchmark: {
      status: "below" | "within" | "above" | "not_available";
      message: string;
      lowerRate: number | null;
      upperRate: number | null;
      estimatedAnnualOverpayment: number | null;
    };
  };
  effectiveRateTrend: {
    direction: string;
    explanation: string | null;
    lowest: { period: string; rate: number; displayRate: string };
    highest: { period: string; rate: number; displayRate: string };
    averageRate: number;
    displayAverageRate: string;
    periods: Array<{
      period: string;
      effectiveRate: number;
      displayRate: string;
      volume: number;
      displayVolume: string;
      totalFees: number;
      displayTotalFees: string;
    }>;
  };
  operationalContext: {
    inactivePeriods: Array<{ period: string; fixedFeesCharged: number; displayFixedFeesCharged: string }>;
    refundTrend: {
      direction: string;
      finding: string | null;
      periods: Array<{ period: string; refunds: number | null; refundPctOfGrossSales: number | null; displayRefunds: string }>;
    };
    cardMixShifts: Array<{ period: string; cardType: string; previousShare: number; currentShare: number; finding: string }>;
    priorPeriodAdjustments: Array<{ period: string; description: string; amount: number | null; finding: string }>;
    interchangeQualification: { applicable: boolean; finding: string | null };
  };
  disputeTrend: {
    direction: string;
    totalDisputeCostsAllPeriods: number;
    finding: string | null;
    periods: Array<{
      period: string;
      chargebacks: number;
      chargebackFees: number;
      achRejects: number;
      achRejectFees: number;
      totalDisputeCost: number;
      displayTotalDisputeCost: string;
    }>;
  };
  feeChangeTimeline: MultiStatementFeeTimelineItem[];
  topFindings: MultiStatementTopFinding[];
  recurringAvoidableFees: MultiStatementRecurringAvoidableFee[];
  cumulativeSavings: {
    alreadyOverpaid: MultiStatementReportMoneyRange;
    projectedAnnualIfUnchanged: MultiStatementReportMoneyRange;
    componentBreakdown: MultiStatementAnalysis["cumulativeSavings"]["topRecurringIssues"];
  };
  actionItems: MultiStatementActionItemReport[];
  actionSummary: {
    totalProjectedAnnualSavings: number;
    largestSingleOpportunity: {
      action: string;
      expectedAnnualSavings: number;
    } | null;
    message: string;
  };
  masterNarrative: string[];
  individualReports: Array<{
    statementPeriod: string;
    individualReportId: string;
  }>;
  sourceAnalysis: {
    analysisTimestamp: string;
    pipelineVersion: string;
  };
};

export type BuildMultiStatementGlobalReportOptions = {
  masterNarrative?: string[];
};

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function percentRange(low: number, high: number): string {
  return `${percent(low)} - ${percent(high)}`;
}

function count(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function difficultyLabel(value: Difficulty): string {
  switch (value) {
    case "no_negotiation":
      return "no negotiation required";
    case "negotiation_required":
      return "negotiation required";
    case "investigation_required":
      return "investigation required";
  }
}

const TOP_FINDING_MIN_PROJECTED_ANNUAL = 10;
const GENERIC_FEE_EXPLANATION = "Ask your processor for details about this fee.";

function cleanFeeDisplayText(value: string): string {
  return value
    .replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:TRANSACTIONS?|TRANS|ITEMS?)\s+AT\s+\.?\d+(?:\.\d+)?\b/gi, "")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:TRANSACTIONS?|TRANS|ITEMS?)\b/gi, "")
    .replace(/\b(?:TIMES|TOTALING)\s+\$?\d+(?:,\d{3})*(?:\.\d+)?\b/gi, "")
    .replace(/\bAT\s+\.?\d+(?:\.\d+)?\b/gi, "")
    .replace(/\$\d+(?:,\d{3})*(?:\.\d+)?\b/g, "")
    .replace(/\b0?\.\d{3,}\b/g, "")
    .replace(/\b(?:DISC\s+RATE|RATE)\s+TIMES\b/gi, "")
    .replace(/\b(?:DISC\s+RATE)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:;,.])/g, "$1")
    .trim();
}

function cleanFindingTitle(title: string): string {
  return cleanFeeDisplayText(title)
    .replace(/\s+exceeds the reference rate$/i, " exceeds the reference rate")
    .replace(/\s+is a third-party service fee$/i, " is a third-party service fee")
    .replace(/\s+adds hidden percentage markup$/i, " adds hidden percentage markup")
    .replace(/\s+may be avoidable through configuration or qualification fixes$/i, " may be avoidable through configuration or qualification fixes")
    .trim();
}

function displayFeeName(familyKey: string, fallback: string): string {
  const known: Record<string, string> = {
    august_paper_stateme: "PAPER STATEMENT FEE",
    managed_security_non_validated: "MANAGED SECURITY NON VALIDATED",
    monthly_service_charge: "MONTHLY SERVICE CHARGE",
    regulatory_product: "REGULATORY PRODUCT",
    supply_shipping_handling: "SUPPLY SHIPPING & HANDLING",
    wats_auth_fee: "WATS AUTH FEE",
  };
  if (/paper stateme|paper statement|paper stmt/i.test(fallback)) return "PAPER STATEMENT FEE";
  return known[familyKey] ?? cleanFeeDisplayText(fallback.replace(/\s+\d{8,}\b/g, ""));
}

function cleanFindingDescription(description: string): string {
  return description
    .replace(/\bWATS AUTH FEE increase increased\b/g, "WATS AUTH FEE increased")
    .trim();
}

function findingExplanation(finding: MultiStatementAnalysis["globalFindings"][number]): string {
  if (finding.fingerprint === "silent_fixed_fee_increases__confirmed") {
    return "The specific fee explanations are listed in the recurring fees section below.";
  }
  if (/access fee is charged at the same rate/i.test(finding.title)) {
    return "This pattern suggests a processor-controlled access fee may be applied uniformly across independent networks. Ask for pass-through documentation showing the source and exact wholesale basis.";
  }
  if (/per-authorization fee is above competitive benchmark/i.test(finding.title)) {
    return "This is processor-controlled per-transaction pricing. Negotiating it down to the benchmark target would lower this cost.";
  }
  if (/monthly advantage fee/i.test(finding.title)) {
    return "This appears to be a processor-controlled percentage markup embedded as a monthly advantage fee. It is negotiable and should be separated from true card-network pass-through costs.";
  }
  if (/bentobox/i.test(finding.title)) {
    return "This appears to be a third-party online-ordering service charge. Verify that the service is active, wanted, and priced correctly.";
  }
  return feeExplanation(finding.title);
}

function cleanReportFindingDescription(finding: MultiStatementAnalysis["globalFindings"][number], cleanTitle: string): string {
  let description = cleanFindingDescription(finding.description);
  const titles = [finding.title, cleanFindingTitle(finding.title), cleanTitle]
    .map((title) => title.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const title of titles) {
    for (const candidate of [title, cleanFindingTitle(title)]) {
      const cleaned = candidate.trim();
      if (!cleaned) continue;
      const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      description = description.replace(new RegExp(`^${escaped}(?=\\s|:|$)\\s*:?\\s*`, "i"), "");
    }
  }
  description = description.replace(/^appeared/i, "Appeared").trim();
  if (!description) return `Appeared on ${finding.monthsAffected} analyzed statement(s).`;
  return description;
}

function buildReportFinding(finding: MultiStatementAnalysis["globalFindings"][number]): MultiStatementTopFinding {
  const title = cleanFindingTitle(finding.title);
  return {
    priority: finding.priority,
    fingerprint: finding.fingerprint,
    tier: finding.tier,
    title,
    description: cleanReportFindingDescription(finding, title),
    explanation: findingExplanation(finding),
    monthsAffected: finding.monthsAffected,
    cumulativeImpact: finding.cumulativeImpact,
    projectedAnnualImpact: finding.projectedAnnualImpact,
    action: finding.action,
    difficulty: finding.difficulty,
    evidence: finding.evidence,
  };
}

function topFindingsWithMinorRollup(findings: MultiStatementTopFinding[]): MultiStatementTopFinding[] {
  const visible = findings.filter((finding) => finding.projectedAnnualImpact >= TOP_FINDING_MIN_PROJECTED_ANNUAL);
  const minor = findings.filter((finding) => finding.projectedAnnualImpact > 0 && finding.projectedAnnualImpact < TOP_FINDING_MIN_PROJECTED_ANNUAL);
  if (minor.length === 0) return visible.map((finding, index) => ({ ...finding, priority: index + 1 }));
  const minorProjected = round(minor.reduce((sum, finding) => sum + finding.projectedAnnualImpact, 0));
  const minorCumulative = round(minor.reduce((sum, finding) => sum + finding.cumulativeImpact, 0));
  return [
    ...visible,
    {
      priority: visible.length + 1,
      fingerprint: "other_minor_rate_exceedances",
      tier: "informational",
      title: "Other minor rate exceedances",
      description: `${minor.length} lower-dollar finding(s) are included in savings and action totals but not shown individually.`,
      explanation: `Combined projected annual impact is ${money(minorProjected)}.`,
      monthsAffected: Math.max(...minor.map((finding) => finding.monthsAffected), 0),
      cumulativeImpact: minorCumulative,
      projectedAnnualImpact: minorProjected,
      action: "Review as part of the broader pass-through documentation request.",
      difficulty: "investigation_required" as const,
      evidence: minor.map((finding) => ({
        period: "multiple",
        detail: `${finding.title}: ${money(finding.projectedAnnualImpact)}/year projected.`,
      })),
    },
  ].map((finding, index) => ({ ...finding, priority: index + 1 }));
}

function patternDisplayName(pattern: MccBenchmarkPattern | null, fallback: string): string {
  const patternText = pattern?.patterns.join(" ") ?? "";
  if (/PAPER STATEMENT|PAPER STATEME|PAPER STMT/i.test(patternText)) return "PAPER STATEMENT FEE";
  if (/SUPPLY SHIPPING|SHIPPING/i.test(patternText)) return "SUPPLY SHIPPING & HANDLING";
  if (/MONTHLY SERVICE|ACCOUNT SERVICE|MONTHLY ACCOUNT/i.test(patternText)) return "MONTHLY SERVICE CHARGE";
  if (/BATCH|SETTLEMENT/i.test(patternText)) return "BATCH SETTLEMENT FEE";
  if (/REGULATORY/i.test(patternText)) return "REGULATORY PRODUCT";
  if (/MANAGED SECURITY|PCI NON/i.test(patternText)) return "MANAGED SECURITY NON VALIDATED";
  return fallback;
}

function feePatternFor(feeName: string): MccBenchmarkPattern | null {
  const reference = loadMccBenchmarkReference();
  return (
    matchBenchmarkPattern(feeName, reference.penalty_fee_patterns.fees) ??
    matchBenchmarkPattern(feeName, reference.junk_fee_patterns.fees)
  );
}

function feeExplanation(feeName: string): string {
  return explainFeeFromReference(feeName).explanation;
}

function recurringFeeDifficulty(pattern: MccBenchmarkPattern | null, feeName: string): Difficulty {
  if (/paper statement|paper stateme|paper stmt/i.test(feeName)) return "no_negotiation";
  if (pattern?.negotiable) return "negotiation_required";
  return pattern?.avoidable ? "investigation_required" : "investigation_required";
}

function actionFromPattern(pattern: MccBenchmarkPattern | null, feeName: string): string {
  if (/paper statement|paper stateme|paper stmt/i.test(feeName)) return "Switch to electronic statements.";
  if (/supply shipping|shipping/i.test(feeName)) return "Opt out of automatic supply shipments or dispute unrequested supplies.";
  if (/monthly service|account service|monthly account/i.test(feeName)) return "Negotiate or request a waiver of the monthly account fee.";
  if (/batch|settlement/i.test(feeName)) return "Ask whether batching can be consolidated or the per-batch settlement fee can be waived.";
  return pattern?.recommendation ?? "Ask your processor to remove, waive, or explain this fee.";
}

function rateChangeLabel(change: MultiStatementAnalysis["rateChanges"][number]): {
  type: MultiStatementFeeTimelineItem["type"];
  whatChanged: string;
} {
  const isRate = Math.abs(change.previousRate) < 1 && Math.abs(change.newRate) < 1;
  const feeName = displayFeeName(change.feeFamilyKey, change.feeDescription);
  if (isRate) {
    return {
      type: "rate_change",
      whatChanged: `${feeName} changed from ${money(change.previousRate)} to ${money(change.newRate)} in ${change.changeMonth}.`,
    };
  }
  return {
    type: "amount_change",
    whatChanged: `${feeName} changed from ${money(change.previousRate)} to ${money(change.newRate)} in ${change.changeMonth}.`,
  };
}

function buildFeeTimeline(analysis: MultiStatementAnalysis): MultiStatementFeeTimelineItem[] {
  const newFeeItems = analysis.newFees.map((fee): MultiStatementFeeTimelineItem => ({
    period: fee.firstAppeared,
    feeName: displayFeeName(fee.feeFamilyKey, fee.feeDescription),
    type: "new_fee",
    whatChanged: `${displayFeeName(fee.feeFamilyKey, fee.feeDescription)} first appeared in ${fee.firstAppeared}.`,
    explanation: feeExplanation(displayFeeName(fee.feeFamilyKey, fee.feeDescription)),
    cumulativeImpact: fee.cumulativeAmountSinceAppearance,
    projectedAnnualImpact: fee.projectedAnnualCost,
    noticeFound: fee.wasAnnouncedInNotice,
    noticePeriod: fee.announcementPeriod,
  }));

  const rateChangeItems = analysis.rateChanges.map((change): MultiStatementFeeTimelineItem => {
    const label = rateChangeLabel(change);
    return {
      period: change.changeMonth,
      feeName: displayFeeName(change.feeFamilyKey, change.feeDescription),
      type: label.type,
      whatChanged: label.whatChanged,
      explanation: feeExplanation(displayFeeName(change.feeFamilyKey, change.feeDescription)),
      cumulativeImpact: change.cumulativeImpact,
      projectedAnnualImpact: change.projectedAnnualImpact,
      noticeFound: change.wasAnnouncedInNotice,
      noticePeriod: change.announcementPeriod,
    };
  });

  const removedFeeItems = analysis.resolvedFees.map((fee): MultiStatementFeeTimelineItem => ({
    period: fee.lastSeen,
    feeName: fee.feeDescription,
    type: "removed_fee",
    whatChanged: fee.finding,
    explanation: feeExplanation(fee.feeDescription),
    cumulativeImpact: fee.totalPaid,
    projectedAnnualImpact: 0,
    noticeFound: null,
    noticePeriod: null,
  }));

  return [...newFeeItems, ...rateChangeItems, ...removedFeeItems].sort(
    (left, right) => left.period.localeCompare(right.period) || left.feeName.localeCompare(right.feeName),
  );
}

function buildRecurringAvoidableFees(analysis: MultiStatementAnalysis): MultiStatementRecurringAvoidableFee[] {
  const firstPeriod = analysis.metadata.includedPeriods[0];
  const minimumMonths = Math.ceil(analysis.metadata.totalStatementsAnalyzed * 0.75);
  const reference = loadMccBenchmarkReference();
  const newFeeFamilies = new Set(analysis.newFees.map((fee) => fee.feeFamilyKey));

  const fromFees = analysis.feeComparison
    .filter((fee) => fee.monthsPresent >= minimumMonths)
    .filter((fee) => fee.firstAppeared === firstPeriod)
    .filter((fee) => !newFeeFamilies.has(fee.feeFamilyKey))
    .map((fee) => {
      const patternTarget = `${fee.feeDescription} ${fee.feeFamilyKey} ${fee.canonicalType}`;
      const penaltyPattern = matchBenchmarkPattern(patternTarget, reference.penalty_fee_patterns.fees);
      const junkPattern = matchBenchmarkPattern(patternTarget, reference.junk_fee_patterns.fees);
      const pattern = penaltyPattern ?? junkPattern;
      if (!pattern) return null;
      if (
        penaltyPattern &&
        analysis.globalFindings.some((finding) => matchBenchmarkPattern(`${finding.title} ${finding.fingerprint}`, [penaltyPattern]))
      ) {
        return null;
      }
      const latestAmount = [...fee.periods].reverse().find((period) => period.amount !== null)?.amount ?? fee.averageMonthlyAmount;
      const feeName = patternDisplayName(pattern, displayFeeName(fee.feeFamilyKey, fee.feeDescription));
      return {
        feeFamilyKey: fee.feeFamilyKey,
        feeName,
        explanation: explainFeeFromReference(patternTarget).explanation,
        monthlyAmount: round(latestAmount),
        monthsPresent: fee.monthsPresent,
        cumulativeTotal: fee.cumulativeAmount,
        projectedAnnual: round(latestAmount * 12),
        action: actionFromPattern(pattern, feeName),
        difficulty: recurringFeeDifficulty(pattern, feeName),
      };
    })
    .filter((fee): fee is MultiStatementRecurringAvoidableFee => fee !== null);

  const existingNames = new Set(fromFees.map((fee) => fee.feeName.toLowerCase()));
  const fromFindings = analysis.globalFindings
    .filter((finding) => finding.monthsAffected >= minimumMonths)
    .filter((finding) => finding.tier === "compliance_penalty" || finding.tier === "avoidable_fixed")
    .map((finding): MultiStatementRecurringAvoidableFee | null => {
      const feeName = displayFeeName("", finding.title.replace(/\s+may be avoidable.*$/i, ""));
      if (existingNames.has(feeName.toLowerCase())) return null;
      return {
        feeFamilyKey: `finding:${finding.fingerprint}`,
        sourceFindingFingerprint: finding.fingerprint,
        feeName,
        explanation: findingExplanation(finding),
        monthlyAmount: finding.monthsAffected > 0 ? round(finding.cumulativeImpact / finding.monthsAffected) : 0,
        monthsPresent: finding.monthsAffected,
        cumulativeTotal: finding.cumulativeImpact,
        projectedAnnual: finding.projectedAnnualImpact,
        action: finding.action,
        difficulty: finding.difficulty,
      };
    })
    .filter((fee): fee is MultiStatementRecurringAvoidableFee => fee !== null);

  return [...fromFees, ...fromFindings]
    .sort((left, right) => {
      const annualDelta = right.projectedAnnual - left.projectedAnnual;
      if (Math.abs(annualDelta) > 0.005) return annualDelta;
      return left.feeName.localeCompare(right.feeName);
    });
}

function recurringDeltaAgainstExistingFindings(
  recurringFees: MultiStatementRecurringAvoidableFee[],
  findings: MultiStatementTopFinding[],
): { cumulative: number; annual: number } {
  let cumulative = 0;
  let annual = 0;
  const recurringFamilies = new Set(recurringFees.map((fee) => fee.feeFamilyKey));
  const silentFixedFinding =
    recurringFamilies.has("supply_shipping_handling") || recurringFamilies.has("monthly_service_charge")
      ? findings.find((finding) => finding.fingerprint === "silent_fixed_fee_increases__confirmed")
      : null;
  if (silentFixedFinding) {
    cumulative -= silentFixedFinding.cumulativeImpact;
    annual -= silentFixedFinding.projectedAnnualImpact;
  }
  for (const fee of recurringFees) {
    const existing = fee.sourceFindingFingerprint
      ? findings.find((finding) => finding.fingerprint === fee.sourceFindingFingerprint)
      : findings.find((finding) => finding.fingerprint.includes(fee.feeFamilyKey));
    cumulative += fee.cumulativeTotal - (existing?.cumulativeImpact ?? 0);
    annual += fee.projectedAnnual - (existing?.projectedAnnualImpact ?? 0);
  }
  return { cumulative: round(cumulative), annual: round(annual) };
}

function addMoneyRange(range: MultiStatementReportMoneyRange, amount: number): MultiStatementReportMoneyRange {
  return {
    conservative: round(range.conservative + amount),
    estimated: round(range.estimated + amount),
    maximum: round(range.maximum + amount),
  };
}

function actionPriority(item: Pick<MultiStatementActionItemReport, "difficulty" | "relatedFindings">): number {
  if (item.relatedFindings.some((finding) => finding.includes("managed_security") || finding.includes("pci"))) return 1;
  if (item.difficulty === "no_negotiation") return 2;
  if (item.difficulty === "investigation_required") return 3;
  return 4;
}

function difficultyRank(value: Difficulty): number {
  if (value === "no_negotiation") return 1;
  if (value === "investigation_required") return 2;
  return 3;
}

function groupActionItems(items: MultiStatementActionItemReport[]): MultiStatementActionItemReport[] {
  const groups = new Map<string, MultiStatementActionItemReport>();
  for (const item of items) {
    const existing = groups.get(item.action);
    if (!existing) {
      groups.set(item.action, { ...item, includes: [...item.includes], relatedFindings: [...item.relatedFindings] });
      continue;
    }
    existing.expectedAnnualSavings = round(existing.expectedAnnualSavings + item.expectedAnnualSavings);
    existing.relatedFindings = [...new Set([...existing.relatedFindings, ...item.relatedFindings])];
    existing.includes.push(...item.includes);
    if (difficultyRank(item.difficulty) > difficultyRank(existing.difficulty)) existing.difficulty = item.difficulty;
    if (item.explanation !== GENERIC_FEE_EXPLANATION && !existing.explanation.includes(item.explanation)) {
      existing.explanation = `${existing.explanation} ${item.explanation}`.trim();
    }
  }
  return [...groups.values()].map((item) => ({
    ...item,
    explanation:
      item.explanation
        .replace(new RegExp(`\\s*${GENERIC_FEE_EXPLANATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "")
        .trim() || GENERIC_FEE_EXPLANATION,
  }));
}

function buildReportActionItems(
  analysis: MultiStatementAnalysis,
  topFindings: MultiStatementTopFinding[],
  recurringFees: MultiStatementRecurringAvoidableFee[],
): MultiStatementActionItemReport[] {
  const recurringFamilies = new Set(recurringFees.map((fee) => fee.feeFamilyKey));
  const findingByFingerprint = new Map(topFindings.map((finding) => [finding.fingerprint, finding]));
  const baseItems = analysis.actionItems
    .filter((item) => !item.relatedFindings.some((fingerprint) => fingerprint === "silent_fixed_fee_increases__confirmed" && (recurringFamilies.has("supply_shipping_handling") || recurringFamilies.has("monthly_service_charge"))))
    .map((item): MultiStatementActionItemReport => {
      const finding = item.relatedFindings.map((fingerprint) => findingByFingerprint.get(fingerprint)).find((entry): entry is MultiStatementTopFinding => Boolean(entry));
      return {
        priority: item.priority,
        action: item.action,
        expectedAnnualSavings: item.expectedSavings,
        difficulty: item.difficulty,
        explanation: finding?.explanation ?? "Ask your processor for details about this fee.",
        relatedFindings: item.relatedFindings,
        includes: [
          {
            title: finding?.title ?? item.action,
            expectedAnnualSavings: item.expectedSavings,
            relatedFindings: item.relatedFindings,
          },
        ],
      };
    });

  const recurringItems = recurringFees
    .filter((fee) => !fee.sourceFindingFingerprint)
    .map((fee): MultiStatementActionItemReport => ({
      priority: 0,
      action: fee.action,
      expectedAnnualSavings: fee.projectedAnnual,
      difficulty: fee.difficulty,
      explanation: fee.explanation,
      relatedFindings: [`recurring_avoidable_fee:${fee.feeFamilyKey}`],
      includes: [
        {
          title: fee.feeName,
          expectedAnnualSavings: fee.projectedAnnual,
          relatedFindings: [`recurring_avoidable_fee:${fee.feeFamilyKey}`],
        },
      ],
    }));

  return groupActionItems([...baseItems, ...recurringItems])
    .sort((left, right) => {
      const priorityDelta = actionPriority(left) - actionPriority(right);
      if (priorityDelta !== 0) return priorityDelta;
      const savingsDelta = right.expectedAnnualSavings - left.expectedAnnualSavings;
      if (Math.abs(savingsDelta) > 0.005) return savingsDelta;
      return left.action.localeCompare(right.action);
    })
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

function buildActionSummary(actionItems: MultiStatementActionItemReport[]): MultiStatementGlobalReport["actionSummary"] {
  const total = round(actionItems.reduce((sum, item) => sum + item.expectedAnnualSavings, 0));
  const largest = actionItems.length > 0 ? actionItems.reduce((best, item) => (item.expectedAnnualSavings > best.expectedAnnualSavings ? item : best), actionItems[0]) : null;
  const largestSingleOpportunity = largest
    ? {
        action: largest.action,
        expectedAnnualSavings: largest.expectedAnnualSavings,
      }
    : null;
  const largestAction = largest?.action.replace(/[.。]\s*$/u, "") ?? "";
  return {
    totalProjectedAnnualSavings: total,
    largestSingleOpportunity,
    message: largest
      ? `Total projected annual savings if all actions are taken: ${money(total)}. The largest single opportunity is ${largestAction} at ${money(largest.expectedAnnualSavings)}/year.`
      : "Total projected annual savings if all actions are taken: $0.00.",
  };
}

function buildComponentBreakdown(
  analysis: MultiStatementAnalysis,
  recurringFees: MultiStatementRecurringAvoidableFee[],
): MultiStatementAnalysis["cumulativeSavings"]["topRecurringIssues"] {
  const existing = analysis.cumulativeSavings.topRecurringIssues;
  const recurringFamilies = new Set(recurringFees.map((fee) => fee.feeFamilyKey));
  return [
    ...existing.filter((issue) => !(issue.fingerprint === "silent_fixed_fee_increases__confirmed" && (recurringFamilies.has("supply_shipping_handling") || recurringFamilies.has("monthly_service_charge")))),
    ...recurringFees.filter((fee) => !fee.sourceFindingFingerprint).map((fee) => ({
      fingerprint: `recurring_avoidable_fee:${fee.feeFamilyKey}`,
      issue: fee.feeName,
      classification: "avoidable_fixed",
      monthsPresent: fee.monthsPresent,
      totalPaid: fee.cumulativeTotal,
      averageMonthlyAmount: fee.monthlyAmount,
      projectedAnnual: fee.projectedAnnual,
      action: fee.action,
      difficulty: fee.difficulty,
    })),
  ];
}

function buildBenchmarkSummary(
  analysis: MultiStatementAnalysis,
): MultiStatementGlobalReport["executiveSummary"]["benchmark"] {
  const benchmark = [...analysis.statementResults]
    .reverse()
    .map((statement) => statement.benchmark)
    .find((entry) => entry && entry.status !== "not_available" && entry.lowerRate !== null && entry.upperRate !== null);
  if (!benchmark || benchmark.lowerRate === null || benchmark.upperRate === null) {
    return {
      status: "not_available",
      message: "Benchmark status was not provided, so no competitive-benchmark conclusion is stated.",
      lowerRate: null,
      upperRate: null,
      estimatedAnnualOverpayment: null,
    };
  }

  const category = benchmark.categoryLabel ?? benchmark.segment ?? "this merchant category";
  const range = percentRange(benchmark.lowerRate, benchmark.upperRate);
  if (benchmark.status === "above") {
    const annualOverpayment =
      benchmark.estimatedAnnualOverpayment ??
      round(Math.max(0, analysis.effectiveRateTrend.averageRate - benchmark.upperRate) * analysis.volumeTrend.averageMonthlyVolume * 12);
    return {
      status: "above",
      message: `above competitive range (${range} for ${category} at this volume; estimated overpayment ${money(annualOverpayment)}/year)`,
      lowerRate: benchmark.lowerRate,
      upperRate: benchmark.upperRate,
      estimatedAnnualOverpayment: annualOverpayment,
    };
  }
  if (benchmark.status === "below") {
    return {
      status: "below",
      message: `below competitive range (${range} for ${category} at this volume)`,
      lowerRate: benchmark.lowerRate,
      upperRate: benchmark.upperRate,
      estimatedAnnualOverpayment: null,
    };
  }
  return {
    status: "within",
    message: `within competitive range (${range} for ${category} at this volume)`,
    lowerRate: benchmark.lowerRate,
    upperRate: benchmark.upperRate,
    estimatedAnnualOverpayment: null,
  };
}

export function buildMultiStatementGlobalReport(
  analysis: MultiStatementAnalysis,
  options: BuildMultiStatementGlobalReportOptions = {},
): MultiStatementGlobalReport {
  const totalFees = round(analysis.statementResults.reduce((sum, statement) => sum + statement.totalFees, 0));
  const pricingModels = [...new Set(analysis.statementResults.map((statement) => statement.pricingModel).filter(Boolean))];
  const allFindings = analysis.globalFindings.map(buildReportFinding);
  const topFindings = topFindingsWithMinorRollup(allFindings);
  const recurringAvoidableFees = buildRecurringAvoidableFees(analysis);
  const recurringDelta = recurringDeltaAgainstExistingFindings(recurringAvoidableFees, allFindings);
  const alreadyOverpaid = addMoneyRange(analysis.cumulativeSavings.alreadyOverpaid, recurringDelta.cumulative);
  const projectedAnnualIfUnchanged = addMoneyRange(analysis.cumulativeSavings.projectedAnnualIfUnchanged, recurringDelta.annual);
  const actionItems = buildReportActionItems(analysis, allFindings, recurringAvoidableFees);
  const actionSummary = buildActionSummary(actionItems);
  const headlineSavings = projectedAnnualIfUnchanged.estimated;
  const benchmark = buildBenchmarkSummary(analysis);

  return {
    kind: "multi_statement_global",
    executiveSummary: {
      merchantName: analysis.merchant.merchantName,
      isoName: analysis.merchant.isoName,
      processorPlatform: analysis.merchant.processorPlatform,
      dateRange: analysis.cumulativeSavings.dateRange,
      statementCount: analysis.metadata.totalStatementsAnalyzed,
      missingPeriods: analysis.metadata.missingPeriods,
      totalVolume: {
        label: "Total volume across analyzed statements",
        value: money(analysis.volumeTrend.totalVolumeAllPeriods),
        rawValue: analysis.volumeTrend.totalVolumeAllPeriods,
        unit: "money",
      },
      totalFees: {
        label: "Total fees across analyzed statements",
        value: money(totalFees),
        rawValue: totalFees,
        unit: "money",
      },
      averageEffectiveRate: {
        label: "Average fees as a percentage of sales",
        value: percent(analysis.effectiveRateTrend.averageRate),
        rawValue: analysis.effectiveRateTrend.averageRate,
        unit: "percent",
      },
      trendDirection: analysis.effectiveRateTrend.direction,
      pricingModel: pricingModels.length === 1 ? pricingModels[0] : pricingModels.join(", "),
      pricingModelConsistent: analysis.pricingModelConsistency.consistent,
      headlineSavings: {
        label: "Annual fees worth challenging if unchanged",
        value: money(headlineSavings),
        rawValue: headlineSavings,
        unit: "money",
      },
      benchmark,
    },
    effectiveRateTrend: {
      direction: analysis.effectiveRateTrend.direction,
      explanation: analysis.effectiveRateTrend.rateChangeExplanation,
      lowest: {
        period: analysis.effectiveRateTrend.lowestRate.period,
        rate: analysis.effectiveRateTrend.lowestRate.rate,
        displayRate: percent(analysis.effectiveRateTrend.lowestRate.rate),
      },
      highest: {
        period: analysis.effectiveRateTrend.highestRate.period,
        rate: analysis.effectiveRateTrend.highestRate.rate,
        displayRate: percent(analysis.effectiveRateTrend.highestRate.rate),
      },
      averageRate: analysis.effectiveRateTrend.averageRate,
      displayAverageRate: percent(analysis.effectiveRateTrend.averageRate),
      periods: analysis.effectiveRateTrend.periods.map((period) => ({
        period: period.period,
        effectiveRate: period.effectiveRate,
        displayRate: percent(period.effectiveRate),
        volume: period.volume,
        displayVolume: money(period.volume),
        totalFees: period.totalFees,
        displayTotalFees: money(period.totalFees),
      })),
    },
    operationalContext: {
      inactivePeriods: analysis.operationalTrend.inactivePeriods.map((period) => ({
        period: period.period,
        fixedFeesCharged: period.fixedFeesCharged,
        displayFixedFeesCharged: money(period.fixedFeesCharged),
      })),
      refundTrend: {
        direction: analysis.operationalTrend.refundTrend.direction,
        finding: analysis.operationalTrend.refundTrend.finding,
        periods: analysis.operationalTrend.refundTrend.periods.map((period) => ({
          period: period.period,
          refunds: period.refunds,
          refundPctOfGrossSales: period.refundPctOfGrossSales,
          displayRefunds: period.refunds === null ? "Not available" : money(period.refunds),
        })),
      },
      cardMixShifts: analysis.operationalTrend.cardMixShifts,
      priorPeriodAdjustments: analysis.operationalTrend.priorPeriodAdjustments,
      interchangeQualification: analysis.operationalTrend.interchangeQualificationTrend,
    },
    disputeTrend: {
      direction: analysis.disputeTrend.direction,
      totalDisputeCostsAllPeriods: analysis.disputeTrend.totalDisputeCostsAllPeriods,
      finding: analysis.disputeTrend.finding,
      periods: analysis.disputeTrend.periods.map((period) => ({
        period: period.period,
        chargebacks: period.chargebacks,
        chargebackFees: period.chargebackFees,
        achRejects: period.achRejects,
        achRejectFees: period.achRejectFees,
        totalDisputeCost: period.totalDisputeCost,
        displayTotalDisputeCost: money(period.totalDisputeCost),
      })),
    },
    feeChangeTimeline: buildFeeTimeline(analysis),
    topFindings,
    recurringAvoidableFees,
    cumulativeSavings: {
      alreadyOverpaid,
      projectedAnnualIfUnchanged,
      componentBreakdown: buildComponentBreakdown(analysis, recurringAvoidableFees),
    },
    actionItems,
    actionSummary,
    masterNarrative: options.masterNarrative ?? [],
    individualReports: analysis.statementResults.map((statement) => ({
      statementPeriod: statement.statementPeriod,
      individualReportId: statement.individualReportId,
    })),
    sourceAnalysis: {
      analysisTimestamp: analysis.metadata.analysisTimestamp,
      pipelineVersion: analysis.metadata.pipelineVersion,
    },
  };
}

export function renderMultiStatementGlobalReportMarkdown(report: MultiStatementGlobalReport): string {
  const lines: string[] = [];
  lines.push(`# Multi-statement processing review: ${report.executiveSummary.merchantName || "Merchant"}`);
  lines.push("");
  lines.push("## Executive summary");
  lines.push(`- ISO: ${report.executiveSummary.isoName || "Not identified"}`);
  lines.push(`- Date range: ${report.executiveSummary.dateRange}`);
  lines.push(`- Statements analyzed: ${count(report.executiveSummary.statementCount)}`);
  if (report.executiveSummary.missingPeriods.length > 0) lines.push(`- Missing periods: ${report.executiveSummary.missingPeriods.join(", ")}`);
  lines.push(`- Total volume: ${report.executiveSummary.totalVolume.value}`);
  lines.push(`- Total fees: ${report.executiveSummary.totalFees.value}`);
  lines.push(`- Average fees as a percentage of sales: ${report.executiveSummary.averageEffectiveRate.value}`);
  lines.push(`- Fee percentage trend: ${report.executiveSummary.trendDirection}`);
  lines.push(`- Benchmark status: ${report.executiveSummary.benchmark.message}`);
  lines.push(`- Pricing model: ${report.executiveSummary.pricingModel || "Not identified"}`);
  lines.push(`- Annual fees worth challenging if unchanged: ${report.executiveSummary.headlineSavings.value}`);
  lines.push("");
  lines.push("## Fee percentage trend");
  for (const period of report.effectiveRateTrend.periods) {
    lines.push(`- ${period.period}: ${period.displayRate} on ${period.displayVolume} volume and ${period.displayTotalFees} fees`);
  }
  if (report.effectiveRateTrend.explanation) lines.push(`- Explanation: ${report.effectiveRateTrend.explanation}`);
  lines.push("");
  lines.push("## Operational context");
  if (report.operationalContext.inactivePeriods.length === 0 && !report.operationalContext.refundTrend.finding && report.operationalContext.cardMixShifts.length === 0 && report.operationalContext.priorPeriodAdjustments.length === 0) {
    lines.push("No material zero-volume, refund, card-mix, or prior-period adjustment issues were detected from the available parsed data.");
  } else {
    for (const inactive of report.operationalContext.inactivePeriods) {
      lines.push(`- ${inactive.period}: no processing volume was detected; fixed fees charged despite no activity were ${inactive.displayFixedFeesCharged}.`);
    }
    if (report.operationalContext.refundTrend.finding) lines.push(`- Refunds: ${report.operationalContext.refundTrend.finding}`);
    for (const shift of report.operationalContext.cardMixShifts) lines.push(`- ${shift.finding}`);
    for (const adjustment of report.operationalContext.priorPeriodAdjustments) lines.push(`- ${adjustment.period}: ${adjustment.finding}`);
  }
  lines.push("");
  lines.push("## Dispute trend");
  lines.push(`- Direction: ${report.disputeTrend.direction}`);
  lines.push(`- Total dispute costs: ${money(report.disputeTrend.totalDisputeCostsAllPeriods)}`);
  if (report.disputeTrend.finding) lines.push(`- Finding: ${report.disputeTrend.finding}`);
  for (const period of report.disputeTrend.periods.filter((period) => period.totalDisputeCost > 0 || period.chargebacks > 0 || period.achRejects > 0)) {
    lines.push(`- ${period.period}: ${period.chargebacks} chargebacks, ${period.achRejects} ACH rejects, ${period.displayTotalDisputeCost} total dispute cost`);
  }
  lines.push("");
  lines.push("## Fee change timeline");
  for (const item of report.feeChangeTimeline) {
    const notice = item.noticeFound === null ? "notice not applicable" : item.noticeFound ? `notice found in ${item.noticePeriod}` : "no prior notice found";
    lines.push(
      `- ${item.period}: ${item.whatChanged} ${item.explanation} Cumulative impact ${money(item.cumulativeImpact)}; projected annual impact ${money(item.projectedAnnualImpact)}; ${notice}.`,
    );
  }
  lines.push("");
  lines.push("## Top findings");
  for (const finding of report.topFindings) {
    lines.push(
      `${finding.priority}. ${finding.title}: ${finding.description} ${finding.explanation} Cumulative impact ${money(finding.cumulativeImpact)}; projected annual impact ${money(finding.projectedAnnualImpact)}; action: ${finding.action}; difficulty: ${difficultyLabel(finding.difficulty)}.`,
    );
  }
  lines.push("");
  lines.push("## Recurring fees");
  if (report.recurringAvoidableFees.length === 0) {
    lines.push("No recurring avoidable fixed fees were detected.");
  } else {
    for (const fee of report.recurringAvoidableFees) {
      lines.push(
        `- ${fee.feeName}: ${money(fee.monthlyAmount)}/month, present on ${fee.monthsPresent} statement(s), ${money(fee.cumulativeTotal)} paid across analyzed periods, ${money(fee.projectedAnnual)}/year projected. ${fee.explanation} Action: ${fee.action} Difficulty: ${difficultyLabel(fee.difficulty)}.`,
      );
    }
  }
  lines.push("");
  lines.push("## Fees worth challenging");
  lines.push(
    `- Already overpaid: conservative ${money(report.cumulativeSavings.alreadyOverpaid.conservative)}, estimated ${money(report.cumulativeSavings.alreadyOverpaid.estimated)}, maximum ${money(report.cumulativeSavings.alreadyOverpaid.maximum)}.`,
  );
  lines.push(
    `- Projected annual if unchanged: conservative ${money(report.cumulativeSavings.projectedAnnualIfUnchanged.conservative)}, estimated ${money(report.cumulativeSavings.projectedAnnualIfUnchanged.estimated)}, maximum ${money(report.cumulativeSavings.projectedAnnualIfUnchanged.maximum)}.`,
  );
  lines.push("");
  lines.push("## Action items");
  for (const item of report.actionItems) {
    const includes =
      item.includes.length > 0
        ? ` Includes: ${item.includes.map((included) => `${included.title} (${money(included.expectedAnnualSavings)})`).join(", ")}.`
        : "";
    lines.push(`${item.priority}. ${item.action} Expected annual savings: ${money(item.expectedAnnualSavings)}.${includes} Difficulty: ${difficultyLabel(item.difficulty)}. ${item.explanation}`);
  }
  lines.push(`- ${report.actionSummary.message}`);
  lines.push("");
  lines.push("## Master narrative");
  if (report.masterNarrative.length === 0) {
    lines.push("Narrative has not been generated yet.");
  } else {
    for (const paragraph of report.masterNarrative) {
      lines.push(paragraph);
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
