import type { AnalysisSummary, DataQualitySignal, FeeBreakdownRow } from "./types.js";

export type ComparisonMerchantIdentity = {
  id: string | null;
  merchantNumber: string | null;
  merchantName: string | null;
  isoName: string | null;
  processorPlatform: string;
  address: string | null;
  merchantCategory: string | null;
  merchantCategoryConfidence: "high" | "medium" | "low" | null;
  merchantChannel: "card_present" | "card_not_present" | "mixed" | null;
};

export type ComparisonStatementFinancials = {
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  rateUnit: "decimal";
  totalTransactions: number | null;
  averageTicket: number | null;
};

export type ComparisonStatementFee = {
  compositeKey: string;
  feeFamilyKey: string;
  displayName: string;
  normalizedDescription: string;
  cardTypeSection: string | null;
  feeType: string;
  amount: number;
  rate: number | null;
  count: number | null;
  volumeBasis: number | null;
  classification: string;
  sourceSection: string | null;
  evidenceLine: string | null;
  source: "fiserv_fee_analysis_v2" | "summary_fee_breakdown";
};

export type ComparisonStatementNotice = {
  noticeType: "fee_increase" | "fee_decrease" | "fee_delay" | "informational" | "new_fee" | "rate_increase";
  feeName: string | null;
  amount: number | null;
  amountType: "money" | "percentage" | "basis_points" | "unknown" | null;
  cadence: "monthly" | "annual" | "per_item" | "one_time" | "unknown" | null;
  effectiveDate: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  source: "ai_notice_extraction" | "deterministic_notice";
};

export type ComparisonStatementFinding = {
  fingerprint: string;
  kind: string;
  title: string;
  severity: "info" | "warning" | "high" | string;
  amount: number | null;
  monthlyCost: number | null;
  annualEstimate: number | null;
  componentImpactEstimate: {
    low: number;
    high: number;
    basis: string | null;
  } | null;
  savingsTier: "confirmed" | "negotiable" | "investigative" | "informational";
  action: string | null;
  evidence: string[];
};

export type ComparisonStatementSavings = {
  conservative: number;
  estimated: number;
  maximum: number;
  components?: Array<{
    kind: string;
    label: string;
    annualImpact: number;
    tier: "confirmed" | "negotiable" | "investigative" | "informational" | string;
    confidence: "high" | "medium" | "low" | string | null;
    sourceFindingKind: string | null;
  }>;
};

export type ComparisonStatementBenchmark = {
  status: "below" | "within" | "above" | "not_available";
  segment: string | null;
  categoryLabel: string | null;
  lowerRate: number | null;
  upperRate: number | null;
  effectiveRate: number | null;
  annualVolume: number | null;
  estimatedAnnualOverpayment: number | null;
  message: string | null;
};

export type ComparisonStatementPricingModel = {
  model: string;
  confidence: "high" | "medium" | "low" | null;
};

export type ComparisonStatementDisputes = {
  chargebacks: number | null;
  chargebackFees: number | null;
  achRejects: number | null;
  achRejectFees: number | null;
  totalDisputeCost: number | null;
};

export type ComparisonStatementOperationalMetrics = {
  grossSales: number | null;
  refunds: number | null;
  refundCount: number | null;
  refundPctOfGrossSales: number | null;
  cardMix: Array<{
    cardType: string;
    volume: number;
    transactionCount: number | null;
    shareOfVolume: number | null;
  }>;
  priorPeriodAdjustments: Array<{
    description: string;
    amount: number | null;
    evidence: string | null;
  }>;
  inactivePeriod: boolean;
  fixedFeesChargedWithNoVolume: number | null;
};

export type ComparisonStatementInput = {
  statementPeriod: string;
  sourceAnalysisId: string | null;
  pipelineVersion: string | null;
  merchant: ComparisonMerchantIdentity;
  financials: ComparisonStatementFinancials;
  pricingModel: ComparisonStatementPricingModel;
  processorControlledTotal: number | null;
  processorControlledPct: number | null;
  benchmark?: ComparisonStatementBenchmark;
  estimatedAnnualSavings: ComparisonStatementSavings;
  fees: ComparisonStatementFee[];
  notices: ComparisonStatementNotice[];
  findings: ComparisonStatementFinding[];
  disputes: ComparisonStatementDisputes;
  operationalMetrics: ComparisonStatementOperationalMetrics;
  parserDecision: {
    status: string;
    reportable: boolean;
    confidence: string | null;
    reason: string | null;
  } | null;
  dataQuality: DataQualitySignal[];
};

export type BuildComparisonStatementInputOptions = {
  sourceAnalysisId?: string | null;
  pipelineVersion?: string | null;
  merchant?: Partial<ComparisonMerchantIdentity>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function confidenceOrNull(value: unknown): "high" | "medium" | "low" | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function merchantChannelOrNull(value: unknown): "card_present" | "card_not_present" | "mixed" | null {
  return value === "card_present" || value === "card_not_present" || value === "mixed" ? value : null;
}

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function compositeKey(parts: Array<string | null | undefined>): string {
  return parts.map(normalizeKeyPart).filter(Boolean).join("__");
}

function stableFeeDescription(value: string | null | undefined): string {
  return (value ?? "unknown")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:TRANSACTIONS?|TRANS|ITEMS?)\s+AT\s+\.?\d+(?:\.\d+)?\b/gi, "")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:TRANSACTIONS?|TRANS|ITEMS?)\b/gi, "")
    .replace(/\b(?:TIMES|TOTALING)\s+\$?\d+(?:,\d{3})*(?:\.\d+)?\b/gi, "")
    .replace(/\bAT\s+\.?\d+(?:\.\d+)?\b/gi, "")
    .replace(/\$\d+(?:,\d{3})*(?:\.\d+)?\b/g, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\b(?:MIN|BASE)\s+\d+\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function feeFamilyDescription(value: string | null | undefined): string {
  return stableFeeDescription(value)
    .replace(/^(?:VISA|VI|MASTERCARD|MC|DISCOVER|AMEX|AMERICAN EXPRESS|DSCVR|DCVR)\s+/i, "")
    .trim();
}

function normalizeRateToDecimal(value: number): number {
  return value > 1 ? round(value / 100, 8) : round(value, 8);
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function analysis(summary: AnalysisSummary): UnknownRecord | null {
  return isRecord(summary.fiservFeeAnalysisV2) ? summary.fiservFeeAnalysisV2 : null;
}

function arrayFrom(record: UnknownRecord | null, key: string): UnknownRecord[] {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function nestedRecord(record: UnknownRecord | null, key: string): UnknownRecord | null {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

function savingsFrom(summary: AnalysisSummary, analysisRecord: UnknownRecord | null): ComparisonStatementSavings {
  const savings = nestedRecord(analysisRecord, "estimatedAnnualSavings");
  const conservative = finiteNumber(savings?.conservative);
  const estimated = finiteNumber(savings?.estimated);
  const maximum = finiteNumber(savings?.maximum);
  const components = Array.isArray(savings?.components)
    ? savings.components.filter(isRecord).map((component) => ({
        kind: stringOrNull(component.kind) ?? "unknown",
        label: stringOrNull(component.label) ?? "Untitled savings component",
        annualImpact: finiteNumber(component.annualImpact) ?? 0,
        tier: stringOrNull(component.tier) ?? "informational",
        confidence: stringOrNull(component.confidence),
        sourceFindingKind: stringOrNull(component.sourceFindingKind),
      }))
    : undefined;
  if (conservative !== null || estimated !== null || maximum !== null) {
    const fallback = finiteNumber(summary.estimatedAnnualSavings) ?? 0;
    return {
      conservative: conservative ?? fallback,
      estimated: estimated ?? conservative ?? fallback,
      maximum: maximum ?? estimated ?? conservative ?? fallback,
      components,
    };
  }
  const amount = finiteNumber(summary.estimatedAnnualSavings) ?? 0;
  return { conservative: amount, estimated: amount, maximum: amount, components };
}

function pricingModelFrom(summary: AnalysisSummary, analysisRecord: UnknownRecord | null): ComparisonStatementPricingModel {
  const pricingModel = nestedRecord(analysisRecord, "pricingModel");
  return {
    model: stringOrNull(pricingModel?.pricingModel) ?? "unknown",
    confidence: confidenceOrNull(pricingModel?.confidence) ?? summary.confidence,
  };
}

function benchmarkStatusFrom(value: unknown): ComparisonStatementBenchmark["status"] {
  const status = stringOrNull(value);
  if (status === "below" || status === "within" || status === "above") return status;
  if (status === "below_range") return "below";
  if (status === "within_range") return "within";
  if (status === "above_range") return "above";
  return "not_available";
}

function benchmarkFrom(summary: AnalysisSummary, analysisRecord: UnknownRecord | null): ComparisonStatementBenchmark {
  const effectiveRateBenchmark = nestedRecord(analysisRecord, "effectiveRateBenchmarkAnalysis");
  if (effectiveRateBenchmark) {
    const status = benchmarkStatusFrom(effectiveRateBenchmark.verdict);
    const lowerRate = finiteNumber(effectiveRateBenchmark.benchmarkLow);
    const upperRate = finiteNumber(effectiveRateBenchmark.benchmarkHigh);
    if (status !== "not_available" && lowerRate !== null && upperRate !== null) {
      return {
        status,
        segment: stringOrNull(effectiveRateBenchmark.categoryLabel),
        categoryLabel: stringOrNull(effectiveRateBenchmark.categoryLabel),
        lowerRate: normalizeRateToDecimal(lowerRate),
        upperRate: normalizeRateToDecimal(upperRate),
        effectiveRate: finiteNumber(effectiveRateBenchmark.effectiveRate),
        annualVolume: finiteNumber(effectiveRateBenchmark.annualVolume),
        estimatedAnnualOverpayment: finiteNumber(effectiveRateBenchmark.estimatedAnnualOverpayment),
        message: stringOrNull(effectiveRateBenchmark.message),
      };
    }
  }

  const summaryBenchmark = summary.benchmark;
  const annualVolume = finiteNumber(summary.estimatedMonthlyVolume) !== null ? round(summary.estimatedMonthlyVolume * 12) : null;
  const effectiveRate = normalizeRateToDecimal(summary.effectiveRate);
  const lowerRate = normalizeRateToDecimal(summaryBenchmark.lowerRate);
  const upperRate = normalizeRateToDecimal(summaryBenchmark.upperRate);
  const status = benchmarkStatusFrom(summaryBenchmark.status);
  return {
    status,
    segment: summaryBenchmark.segment,
    categoryLabel: summaryBenchmark.segment,
    lowerRate,
    upperRate,
    effectiveRate,
    annualVolume,
    estimatedAnnualOverpayment:
      status === "above" && annualVolume !== null ? round(Math.max(0, effectiveRate - upperRate) * annualVolume) : null,
    message: null,
  };
}

function processorControlledTotalFrom(analysisRecord: UnknownRecord | null): number | null {
  return finiteNumber(nestedRecord(analysisRecord, "processorMarkupAnalysis")?.processorControlledTotal);
}

function merchantChannelFrom(options: BuildComparisonStatementInputOptions, analysisRecord: UnknownRecord | null) {
  return (
    merchantChannelOrNull(options.merchant?.merchantChannel) ??
    merchantChannelOrNull(nestedRecord(analysisRecord, "merchantChannelAnalysis")?.merchantChannel)
  );
}

function isoNameFrom(summary: AnalysisSummary): string | null {
  if (!summary.processorName || summary.processorName === "Unknown") return null;
  if (/^clover$/i.test(summary.processorName) && /first data/i.test(summary.parserSource?.processorFamily ?? "")) {
    return "Clover / First Data";
  }
  return summary.processorName;
}

function transactionCountFrom(summary: AnalysisSummary, analysisRecord: UnknownRecord | null): number | null {
  const auth = nestedRecord(analysisRecord, "authorizationAnalysis");
  const count = finiteNumber(auth?.transactionCount);
  if (count !== null) return count;
  const transactionKpi = summary.kpis.find((kpi) => /transaction/i.test(kpi.label));
  if (!transactionKpi) return null;
  const parsed = Number(String(transactionKpi.value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFinancials(summary: AnalysisSummary, analysisRecord: UnknownRecord | null): ComparisonStatementFinancials {
  const totalTransactions = transactionCountFrom(summary, analysisRecord);
  const averageTicket = totalTransactions && totalTransactions > 0 ? round(summary.totalVolume / totalTransactions, 2) : null;
  return {
    totalVolume: summary.totalVolume,
    totalFees: summary.totalFees,
    effectiveRate: normalizeRateToDecimal(summary.effectiveRate),
    rateUnit: "decimal",
    totalTransactions,
    averageTicket,
  };
}

function feeRowsFromAnalysis(analysisRecord: UnknownRecord | null): ComparisonStatementFee[] {
  return arrayFrom(analysisRecord, "rows")
    .filter((row) => {
      const amount = finiteNumber(row.amount);
      return amount !== null && amount > 0;
    })
    .map((row) => {
      const normalizedDescription = stableFeeDescription(
        stringOrNull(row.description) ?? stringOrNull(row.normalizedDescription),
      );
      const familyDescription = feeFamilyDescription(normalizedDescription);
      const cardTypeSection = stringOrNull(row.cardTypeSection);
      const feeType = stringOrNull(row.feeType) ?? "unknown";
      return {
        compositeKey: compositeKey([familyDescription, cardTypeSection ?? feeType]),
        feeFamilyKey: compositeKey([familyDescription]),
        displayName: stringOrNull(row.canonicalName) ?? stringOrNull(row.description) ?? normalizedDescription,
        normalizedDescription,
        cardTypeSection,
        feeType,
        amount: finiteNumber(row.amount) ?? 0,
        rate: finiteNumber(row.rate),
        count: finiteNumber(row.count),
        volumeBasis: finiteNumber(row.volumeBasis),
        classification: feeType,
        sourceSection: stringOrNull(row.sourceSection),
        evidenceLine: stringOrNull(row.evidenceLine),
        source: "fiserv_fee_analysis_v2",
      };
    });
}

function feeTypeFromSummaryRow(row: FeeBreakdownRow): string {
  return row.feeClass ?? row.broadType ?? "unknown";
}

function feeRowsFromSummary(summary: AnalysisSummary): ComparisonStatementFee[] {
  return summary.feeBreakdown
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0)
    .map((row) => {
      const feeType = feeTypeFromSummaryRow(row);
      const normalizedDescription = stableFeeDescription(row.label);
      const familyDescription = feeFamilyDescription(normalizedDescription);
      return {
        compositeKey: compositeKey([familyDescription, row.sourceSection ?? feeType]),
        feeFamilyKey: compositeKey([familyDescription]),
        displayName: row.label,
        normalizedDescription,
        cardTypeSection: null,
        feeType,
        amount: row.amount,
        rate: null,
        count: null,
        volumeBasis: null,
        classification: feeType,
        sourceSection: row.sourceSection ?? null,
        evidenceLine: row.evidenceLine ?? null,
        source: "summary_fee_breakdown",
      };
    });
}

function buildFees(summary: AnalysisSummary, analysisRecord: UnknownRecord | null): ComparisonStatementFee[] {
  const rows = feeRowsFromAnalysis(analysisRecord);
  return rows.length > 0 ? rows : feeRowsFromSummary(summary);
}

function noticeConfidenceFromNumber(value: unknown): "high" | "medium" | "low" {
  const confidence = finiteNumber(value);
  if (confidence === null) return "medium";
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

function noticesFromAi(analysisRecord: UnknownRecord | null): ComparisonStatementNotice[] {
  const ai = nestedRecord(analysisRecord, "aiNoticeExtraction");
  return arrayFrom(ai, "notices").map((notice) => {
    const amount = nestedRecord(notice, "amount");
    const noticeType = stringOrNull(notice.noticeType);
    return {
      noticeType:
        noticeType === "fee_increase" || noticeType === "fee_decrease" || noticeType === "fee_delay" || noticeType === "informational"
          ? noticeType
          : "informational",
      feeName: stringOrNull(notice.feeName),
      amount: finiteNumber(amount?.value),
      amountType: stringOrNull(amount?.valueType) as ComparisonStatementNotice["amountType"],
      cadence: stringOrNull(amount?.cadence) as ComparisonStatementNotice["cadence"],
      effectiveDate: stringOrNull(notice.effectiveDate),
      confidence: confidenceOrNull(notice.confidence) ?? "medium",
      evidence: Array.isArray(notice.evidence) ? notice.evidence.filter((item): item is string => typeof item === "string") : [],
      source: "ai_notice_extraction",
    };
  });
}

function noticesFromDeterministic(analysisRecord: UnknownRecord | null): ComparisonStatementNotice[] {
  return arrayFrom(analysisRecord, "notices").map((notice) => {
    const newValue = nestedRecord(notice, "newValue");
    const kind = stringOrNull(notice.kind);
    return {
      noticeType: kind === "new_fee" || kind === "rate_increase" || kind === "fee_increase" ? kind : "informational",
      feeName: stringOrNull(notice.feeLabel),
      amount: finiteNumber(newValue?.value),
      amountType: stringOrNull(newValue?.valueType) as ComparisonStatementNotice["amountType"],
      cadence: stringOrNull(newValue?.cadence) as ComparisonStatementNotice["cadence"],
      effectiveDate: stringOrNull(notice.effectiveDate),
      confidence: noticeConfidenceFromNumber(notice.confidence),
      evidence: Array.isArray(notice.evidenceLines)
        ? notice.evidenceLines.filter((item): item is string => typeof item === "string")
        : stringOrNull(notice.evidenceLine)
          ? [String(notice.evidenceLine)]
          : [],
      source: "deterministic_notice",
    };
  });
}

function buildNotices(analysisRecord: UnknownRecord | null): ComparisonStatementNotice[] {
  return [...noticesFromAi(analysisRecord), ...noticesFromDeterministic(analysisRecord)];
}

function savingsTierForFinding(finding: UnknownRecord, component?: UnknownRecord | null): ComparisonStatementFinding["savingsTier"] {
  const componentTier = stringOrNull(component?.tier);
  if (componentTier === "confirmed" || componentTier === "negotiable" || componentTier === "investigative" || componentTier === "informational") {
    return componentTier;
  }
  const kind = stringOrNull(finding.kind) ?? "";
  if (/compliance|junk|penalty/.test(kind)) return "confirmed";
  if (/benchmark|auth|rate|markup|negotiat/.test(kind)) return "negotiable";
  if (/uniform|suspicious|third_party|service/.test(kind)) return "investigative";
  if (kind.length === 0 || /healthy|positive|context/.test(kind)) return "informational";
  return "investigative";
}

function fingerprintForFinding(finding: UnknownRecord, component?: UnknownRecord | null): string {
  return compositeKey([
    stringOrNull(finding.kind),
    stableFeeDescription(stringOrNull(finding.title)),
    savingsTierForFinding(finding, component),
  ]);
}

function componentImpactEstimateFrom(finding: UnknownRecord, component?: UnknownRecord | null): ComparisonStatementFinding["componentImpactEstimate"] {
  const estimate = nestedRecord(finding, "componentImpactEstimate");
  const low = finiteNumber(estimate?.low);
  const high = finiteNumber(estimate?.high);
  const componentAnnual = finiteNumber(component?.annualImpact);
  if (low === null && high === null && componentAnnual === null) return null;
  if (low === null && high === null && componentAnnual !== null) {
    return {
      low: componentAnnual,
      high: componentAnnual,
      basis: "Matched from statement-level estimatedAnnualSavings component.",
    };
  }
  const fallback = high ?? low ?? 0;
  return {
    low: low ?? fallback,
    high: high ?? fallback,
    basis: stringOrNull(estimate?.basis),
  };
}

function buildFindings(analysisRecord: UnknownRecord | null): ComparisonStatementFinding[] {
  const savings = nestedRecord(analysisRecord, "estimatedAnnualSavings");
  const components = Array.isArray(savings?.components) ? savings.components.filter(isRecord) : [];
  return arrayFrom(analysisRecord, "findings").map((finding) => {
    const title = stringOrNull(finding.title) ?? "Untitled finding";
    const kind = stringOrNull(finding.kind) ?? "unknown";
    const matchedComponent =
      components.find((component) => stringOrNull(component.sourceFindingKind) === kind && stableFeeDescription(stringOrNull(component.label)) === stableFeeDescription(title)) ??
      components.find((component) => stableFeeDescription(stringOrNull(component.label)) === stableFeeDescription(title)) ??
      null;
    return {
      fingerprint: fingerprintForFinding(finding, matchedComponent),
      kind,
      title,
      severity: stringOrNull(finding.severity) ?? "info",
      amount: finiteNumber(finding.amount),
      monthlyCost: finiteNumber(finding.monthlyCost),
      annualEstimate: finiteNumber(finding.annualEstimate),
      componentImpactEstimate: componentImpactEstimateFrom(finding, matchedComponent),
      savingsTier: savingsTierForFinding(finding, matchedComponent),
      action: stringOrNull(finding.action),
      evidence: Array.isArray(finding.evidence) ? finding.evidence.filter((item): item is string => typeof item === "string") : [],
    };
  });
}

function buildDisputes(analysisRecord: UnknownRecord | null): ComparisonStatementDisputes {
  const dispute = nestedRecord(analysisRecord, "disputeActivityAnalysis");
  return {
    chargebacks: finiteNumber(dispute?.chargebackCount),
    chargebackFees: finiteNumber(dispute?.chargebackFeeTotal),
    achRejects: finiteNumber(dispute?.achRejectCount),
    achRejectFees: finiteNumber(dispute?.achRejectFeeTotal),
    totalDisputeCost: finiteNumber(dispute?.totalDisputeCost),
  };
}

function operationalMetricsFrom(
  summary: AnalysisSummary,
  analysisRecord: UnknownRecord | null,
  fees: ComparisonStatementFee[],
): ComparisonStatementOperationalMetrics {
  const selected = nestedRecord(analysisRecord, "selectedFinancials");
  const grossSales = finiteNumber(selected?.grossSales);
  const refunds = finiteNumber(selected?.refunds);
  const refundPctOfGrossSales = grossSales !== null && grossSales > 0 && refunds !== null ? round(refunds / grossSales, 8) : null;
  const fixedFeesChargedWithNoVolume =
    summary.totalVolume === 0
      ? round(
          fees
            .filter((fee) => fee.rate === null && fee.volumeBasis === null && /fixed|statement|monthly|service|compliance|penalty/i.test(fee.feeType))
            .reduce((sum, fee) => sum + fee.amount, 0),
        )
      : null;
  return {
    grossSales,
    refunds,
    refundCount: null,
    refundPctOfGrossSales,
    cardMix: [],
    priorPeriodAdjustments: fees
      .filter((fee) => /adjust|correction|prior/i.test(`${fee.displayName} ${fee.evidenceLine ?? ""}`))
      .map((fee) => ({
        description: fee.displayName,
        amount: fee.amount,
        evidence: fee.evidenceLine,
      })),
    inactivePeriod: summary.totalVolume === 0,
    fixedFeesChargedWithNoVolume,
  };
}

export function buildComparisonStatementInput(
  summary: AnalysisSummary,
  options: BuildComparisonStatementInputOptions = {},
): ComparisonStatementInput {
  const analysisRecord = analysis(summary);
  const financials = buildFinancials(summary, analysisRecord);
  const processorControlledTotal = processorControlledTotalFrom(analysisRecord);
  const fees = buildFees(summary, analysisRecord);

  return {
    statementPeriod: summary.statementPeriod,
    sourceAnalysisId: options.sourceAnalysisId ?? null,
    pipelineVersion: options.pipelineVersion ?? null,
    merchant: {
      id: options.merchant?.id ?? null,
      merchantNumber: options.merchant?.merchantNumber ?? summary.parserStatementIdentity?.merchantNumber ?? null,
      merchantName: options.merchant?.merchantName ?? summary.parserStatementIdentity?.merchantName ?? null,
      isoName: options.merchant?.isoName ?? isoNameFrom(summary),
      processorPlatform: options.merchant?.processorPlatform ?? summary.parserSource?.processorFamily ?? summary.processorName,
      address: options.merchant?.address ?? null,
      merchantCategory: options.merchant?.merchantCategory ?? summary.businessType,
      merchantCategoryConfidence: options.merchant?.merchantCategoryConfidence ?? summary.confidence,
      merchantChannel: merchantChannelFrom(options, analysisRecord),
    },
    financials,
    pricingModel: pricingModelFrom(summary, analysisRecord),
    processorControlledTotal,
    processorControlledPct:
      processorControlledTotal !== null && summary.totalVolume > 0 ? round(processorControlledTotal / summary.totalVolume, 8) : null,
    benchmark: benchmarkFrom(summary, analysisRecord),
    estimatedAnnualSavings: savingsFrom(summary, analysisRecord),
    fees,
    notices: buildNotices(analysisRecord),
    findings: buildFindings(analysisRecord),
    disputes: buildDisputes(analysisRecord),
    operationalMetrics: operationalMetricsFrom(summary, analysisRecord, fees),
    parserDecision: summary.parserDecision
      ? {
          status: summary.parserDecision.status,
          reportable: summary.parserDecision.reportable,
          confidence: summary.parserDecision.confidence,
          reason: summary.parserDecision.reason,
        }
      : null,
    dataQuality: summary.dataQuality,
  };
}
