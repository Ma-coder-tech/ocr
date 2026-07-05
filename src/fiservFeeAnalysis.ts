import {
  normalizeFiservFeeRows,
  type FiservCanonicalFeeRow,
  type FiservCanonicalFeeType,
  type FiservFeeNormalizationSummary,
  type FiservRawFeeRowForNormalization,
} from "./fiservFeeNormalizer.js";
import {
  buildFiservBundledPricingBenchmarkAnalysis,
  type FiservBundledPricingBenchmarkAnalysis,
} from "./fiservBundledPricingBenchmark.js";
import {
  adjustedEffectiveRateBenchmark,
  estimateAnnualVolume,
  loadMccBenchmarkReference,
  matchBenchmarkPattern,
  perAuthBenchmarkFor,
  type MccBenchmarkPattern,
} from "./mccBenchmarkReference.js";
import {
  resolveBenchmarkCategory,
  type BenchmarkCategoryAiSuggestion,
  type BenchmarkCategoryResolution,
  type BenchmarkCategorySource,
} from "./benchmarkCategoryResolution.js";
import { normalizeFiservFeeReferenceText, type FiservFeeReferenceEntry } from "./fiservFeeReference.js";
import { round2, round8 } from "./reconciliation.js";
import type { BenchmarkCategoryAiInference } from "./benchmarkCategoryAiInference.js";
import type { StatementNoticeAiExtraction } from "./statementNoticeAiExtraction.js";
import type { BusinessTypeId } from "./businessTypes.js";
import type { RepricingEvent } from "./types.js";
import type { FiservAiFeeAssessment } from "./fiservAiFeeAssessment.js";
import type { MerchantNarrative } from "./merchantNarrativeAi.js";
import type { FullStatementAnomalyReview } from "./fullStatementAnomalyReviewAi.js";

export type FiservFeeProofStatus = "proven" | "likely" | "processor_controlled" | "indeterminate" | "not_enough_detail";

export type FiservFeeRateComparison =
  | "matches_reference"
  | "close_to_reference"
  | "above_reference"
  | "below_reference"
  | "not_compared";

export type FiservFeeAnalysisInput = {
  canonicalRows: FiservCanonicalFeeRow[];
  normalizationSummary: FiservFeeNormalizationSummary;
  printedTotal: number | null;
  totalVolume: number;
  totalFees: number;
  transactionCount: number | null;
  pricingModel: { pricingModel: string; confidence: string; notes?: string[] };
  statementPeriodStart: string;
  statementPeriodEnd: string;
  merchantName?: string | null;
  userSelectedBusinessType?: BusinessTypeId | null;
  benchmarkCategoryAiSuggestion?: BenchmarkCategoryAiSuggestion | null;
  ytdGrossSales?: number | null;
  notices?: RepricingEvent[];
  noticeText?: string | null;
  interchangeReconciliationBasis?: {
    summaryTotal: number | null;
    detailTableTotal: number | null;
    summaryEvidenceLine: string | null;
    detailEvidenceLine: string | null;
  };
  fundingBatchRows?: Array<{
    adjustments?: number | null;
    chargebacks?: number | null;
    evidenceLine?: string | null;
  }>;
};

export type FiservFeeAnalysisRow = {
  rowIndex: number;
  cardTypeSection: string | null;
  description: string;
  normalizedDescription: string;
  canonicalName: string | null;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  feeType: FiservCanonicalFeeType;
  sourceFeeType: string | null;
  sourceSection: string | null;
  matchMethod: FiservCanonicalFeeRow["matchMethod"] | "ai_classified";
  matchConfidence: FiservCanonicalFeeRow["matchConfidence"];
  referenceId: string | null;
  proofStatus: FiservFeeProofStatus;
  rateComparison: FiservFeeRateComparison;
  expectedAmount: number | null;
  delta: number | null;
  deltaPct: number | null;
  comparedBasis: "count" | "volume" | "stated_rate" | "flat" | "not_compared";
  referenceRate: number | null;
  tolerancePct: number | null;
  reason: string;
  evidenceLine: string;
  aiAssessment?: FiservAiFeeAssessment;
};

export type FiservFeeAnalysisBucket = {
  feeType: FiservCanonicalFeeType;
  amount: number;
  rows: number;
  pctOfFees: number | null;
};

export type FiservFeeAnalysisFinding = {
  kind:
    | "rate_exceeds_reference"
    | "processor_per_item_stacking"
    | "junk_fee"
    | "pricing_model_pending_rules"
    | "normalization_ai_candidates"
    | "suspicious_uniform_rate"
    | "avoidable_compliance_fee"
    | "third_party_service_fee"
    | "hidden_percentage_markup"
    | "penalty_or_configuration_fee"
    | "bundled_effective_rate_above_benchmark"
    | "bundled_pricing_savings_opportunity"
    | "single_tier_qualified_structure"
    | "card_not_present_detected"
    | "tiered_downgrade_high_nqual"
    | "tiered_downgrade_majority_not_qualified"
    | "tiered_downgrade_cost"
    | "authorization_ratio_high"
    | "authorization_ratio_healthy"
    | "per_auth_fee_benchmark"
    | "dispute_activity_high"
    | "effective_rate_positive_benchmark"
    | "effective_rate_above_benchmark"
    | "junk_fixed_fee_summary"
    | "unknown_fee_learning_candidate"
    | "ai_fee_assessment"
    | "ai_statement_anomaly"
    | "new_account_pricing_context";
  severity: "info" | "warning" | "high";
  title: string;
  amount: number | null;
  evidence: string[];
  action:
    | "none"
    | "complete_pci_validation"
    | "negotiate_processor_rate"
    | "request_pass_through_documentation"
    | "verify_third_party_service"
    | "fix_terminal_or_gateway_configuration"
    | "request_interchange_plus_quote";
  monthlyCost: number | null;
  annualEstimate: number | null;
  componentImpactEstimate: {
    low: number;
    high: number;
    basis: string;
  } | null;
};

export type FiservInterchangeReconciliationComponent = {
  kind:
    | "detail_table"
    | "card_brand_network_inside_summary_bucket"
    | "suspicious_access_inside_summary_bucket"
    | "pin_debit_interchange_inside_summary_bucket"
    | "unexplained";
  amount: number;
  rows: number;
  evidence: string[];
};

export type FiservMerchantChannelAnalysis = {
  status: "detected" | "defaulted";
  merchantChannel: "card_present" | "card_not_present" | "mixed";
  confidence: "high" | "medium" | "low";
  signals: Array<{
    type: "card_not_present" | "card_present";
    description: string;
    evidenceLine: string;
    rowIndex: number;
  }>;
  benchmarkAdjustments: {
    effectiveRateBenchmark: { low: number; high: number } | null;
    interchangeRangeAdjustment: { low: number; high: number } | null;
    competitiveSpread: { low: number; high: number } | null;
    competitivePerAuth: { low: number; high: number } | null;
  };
  notes: string[];
};

export type FiservTieredDowngradeAnalysis = {
  status: "ready" | "not_applicable" | "not_enough_detail";
  baselineRate: number | null;
  baselineSource: "lowest_visible_qual" | "lowest_visible_tier" | "not_available";
  baselineInferred: boolean;
  totalTieredVolume: number | null;
  qualifiedVolume: number;
  midQualifiedVolume: number;
  nonQualifiedVolume: number;
  qualifiedPct: number | null;
  midQualifiedPct: number | null;
  nonQualifiedPct: number | null;
  notBestTierPct: number | null;
  totalDowngradeCost: number | null;
  rawDowngradeCost: number | null;
  totalDiscountCharges: number | null;
  downgradeCostCapped: boolean;
  totalDowngradeCostPctOfFees: number | null;
  largestDowngradeImpact: {
    cardTypeSection: string | null;
    description: string;
    tier: "qualified" | "mid_qualified" | "non_qualified";
    volume: number;
    rate: number;
    amount: number;
    downgradeCost: number;
    amountPctOfFees: number | null;
    downgradeCostPctOfFees: number | null;
    evidenceLine: string;
  } | null;
  rows: Array<{
    cardTypeSection: string | null;
    description: string;
    tier: "qualified" | "mid_qualified" | "non_qualified";
    volume: number;
    rate: number;
    amount: number;
    baselineRate: number | null;
    downgradeCost: number | null;
    evidenceLine: string;
  }>;
  flags: Array<{
    kind: "high_non_qualified" | "majority_downgraded" | "minimal_downgrade" | "downgrade_cost_capped";
    severity: "info" | "warning" | "high";
    message: string;
  }>;
  cause: string;
};

export type FiservAuthorizationAnalysis = {
  status: "ready" | "not_applicable" | "not_enough_detail";
  transactionCount: number | null;
  authorizationCount: number | null;
  authRatio: number | null;
  excessAuthorizationCount: number | null;
  estimatedExcessAuthCost: number | null;
  primaryAuthRate: number | null;
  primaryAuthRows: Array<{
    description: string;
    cardTypeSection: string | null;
    count: number;
    rate: number | null;
    amount: number;
    evidenceLine: string;
  }>;
  flags: Array<{
    kind: "auths_exceed_settled_transactions" | "unusually_high_auth_ratio";
    severity: "warning" | "high";
    message: string;
  }>;
};

export type FiservEffectiveRateBenchmarkAnalysis = {
  status: "ready" | "not_enough_detail";
  categoryId: string;
  categoryLabel: string;
  categoryConfidence: "high" | "medium" | "low";
  categorySource: BenchmarkCategorySource;
  matchedKeyword: string | null;
  categoryResolution: Omit<BenchmarkCategoryResolution, "category">;
  annualVolume: number | null;
  annualVolumeSource: "monthly_volume_x12" | "ytd_extrapolated" | "not_available";
  ytdExtrapolatedAnnualVolume: number | null;
  volumeTier: string | null;
  effectiveRate: number | null;
  benchmarkLow: number | null;
  benchmarkHigh: number | null;
  adjustment: number | null;
  processorMarkupRate: number | null;
  verdict: "below_range" | "within_range" | "above_range" | "significantly_above_range" | "not_enough_detail";
  estimatedAnnualOverpayment: number | null;
  message: string;
  notes: string[];
};

export type FiservPerAuthBenchmarkAnalysis = {
  status: "ready" | "not_applicable" | "not_enough_detail";
  annualVolume: number | null;
  volumeTier: string | null;
  benchmarkChannel: "card_present" | "card_not_present" | "high_risk" | null;
  currentRate: number | null;
  dominantRate: number | null;
  dominantAuthorizationCount: number | null;
  dominantMonthlyAuthCost: number | null;
  competitiveLow: number | null;
  competitiveHigh: number | null;
  targetRate: number | null;
  authorizationCount: number | null;
  monthlyAuthCost: number | null;
  monthlyImpact: number | null;
  annualImpact: number | null;
  dominant: boolean;
  rateGroups: Array<{
    label: string;
    rate: number;
    count: number;
    amount: number;
    rowCount: number;
  }>;
  rows: Array<{
    description: string;
    cardTypeSection: string | null;
    count: number;
    rate: number | null;
    amount: number;
    evidenceLine: string;
  }>;
  message: string;
};

export type FiservDisputeActivityAnalysis = {
  status: "ready" | "not_applicable";
  chargebackCount: number;
  chargebackFeeAmount: number;
  achRejectCount: number;
  achRejectFeeAmount: number;
  fundingAdjustmentCount: number;
  fundingChargebackCount: number;
  disputeCostAmount: number;
  disputeCostPctOfVolume: number | null;
  flags: Array<{
    kind: "high_dispute_cost_pct" | "high_adjustment_count";
    severity: "warning" | "high";
    message: string;
  }>;
  evidence: string[];
};

export type FiservNewAccountAnalysis = {
  status: "confirmed" | "likely" | "not_detected" | "not_enough_detail";
  currentMonthVolume: number;
  ytdGrossSales: number | null;
  ytdToCurrentMonthRatio: number | null;
  message: string;
  recommendation: string | null;
};

export type FiservFeeAnalysisV2 = {
  version: "2.0";
  normalization: FiservFeeNormalizationSummary;
  notices: RepricingEvent[];
  noticeText: string | null;
  aiNoticeExtraction?: StatementNoticeAiExtraction;
  benchmarkCategoryAi?: BenchmarkCategoryAiInference;
  aiAnomalyReview?: FullStatementAnomalyReview;
  aiMerchantNarrative?: MerchantNarrative;
  pricingModel: {
    pricingModel: string;
    confidence: "high" | "medium" | "low";
    analysisStatus: "ic_plus_ready" | "universal_only_pending_model_rules" | "not_enough_detail";
    evidence: string[];
  };
  buckets: FiservFeeAnalysisBucket[];
  rows: FiservFeeAnalysisRow[];
  rateVerification: {
    proven: number;
    likely: number;
    processorControlled: number;
    indeterminate: number;
    notEnoughDetail: number;
  };
  processorMarkupAnalysis: {
    status: "ready" | "pending_pricing_model_rules" | "not_applicable";
    processorControlledTotal: number | null;
    processorMarkupRate: number | null;
    processorPctMarkupTotal: number | null;
    processorPerItemTotal: number | null;
    processorFixedTotal: number | null;
    junkFeeTotal: number | null;
    message: string;
    perItemStacking: {
      detected: boolean;
      fees: string[];
      totalPerItem: number | null;
      perItemAsPctOfAverageTicket: number | null;
    };
    hiddenPctMarkupRows: Array<{
      description: string;
      rate: number;
      amount: number;
      volumeBasis: number | null;
    }>;
    nonAmexSalesDiscountRate: number | null;
    amexSalesDiscountRate: number | null;
  };
  merchantChannelAnalysis: FiservMerchantChannelAnalysis;
  tieredDowngradeAnalysis: FiservTieredDowngradeAnalysis;
  authorizationAnalysis: FiservAuthorizationAnalysis;
  effectiveRateBenchmarkAnalysis: FiservEffectiveRateBenchmarkAnalysis;
  benchmarkCategoryResolution: Omit<BenchmarkCategoryResolution, "category">;
  perAuthBenchmarkAnalysis: FiservPerAuthBenchmarkAnalysis;
  disputeActivityAnalysis: FiservDisputeActivityAnalysis;
  newAccountAnalysis: FiservNewAccountAnalysis;
  bundledPricingBenchmark: FiservBundledPricingBenchmarkAnalysis;
  interchangeReconciliation: {
    summaryTotal: number | null;
    detailTableTotal: number | null;
    gap: number | null;
    explainedGapTotal: number | null;
    unexplainedGap: number | null;
    status: "not_available" | "matches" | "explained_structural_difference" | "unexplained_difference";
    components: FiservInterchangeReconciliationComponent[];
    notes: string[];
  };
  estimatedAnnualSavings: {
    conservative: number;
    estimated: number;
    maximum: number;
    amount: number;
    currentAnnualFees: number;
    estimatedCompetitiveAnnualFees: number;
    methodology: "component_tier_sum";
    confidence: "high" | "medium" | "low";
    basis: string;
    componentCount: number;
    components: Array<{
      kind: string;
      label: string;
      annualImpact: number;
      tier: "confirmed" | "negotiable" | "investigative";
      confidence: "high" | "medium" | "low";
      sourceFindingKind?: string | null;
    }>;
  };
  developerReview: {
    unknownFeeRows: Array<{
      rowIndex: number;
      description: string;
      cardTypeSection: string | null;
      volumeBasis: number | null;
      count: number | null;
      rate: number | null;
      amount: number;
      feeType: string;
      matchMethod: string;
      evidenceLine: string;
    }>;
    unmatchedProcessorFixedFees: Array<{
      rowIndex: number;
      description: string;
      cardTypeSection: string | null;
      amount: number;
      evidenceLine: string;
    }>;
  };
  reconciliation: {
    basisTotal: number;
    rowTotal: number;
    residual: number;
    status: "pass" | "warning";
  };
  findings: FiservFeeAnalysisFinding[];
  ai?: {
    status: "disabled" | "not_needed" | "applied" | "no_usable_suggestions" | "failed";
    provider: "anthropic" | "openai" | null;
    model: string | null;
    unresolvedInputRowCount: number;
    suggestionCount: number;
    appliedSuggestionCount: number;
    skippedSuggestionCount: number;
    notes: string[];
  };
};

function confidenceFromParser(value: string): "high" | "medium" | "low" {
  return value === "high" || value === "medium" ? value : "low";
}

function expectedAmountFor(row: FiservCanonicalFeeRow, entry: FiservFeeReferenceEntry): {
  expectedAmount: number | null;
  comparedBasis: FiservFeeAnalysisRow["comparedBasis"];
  referenceRate: number | null;
} {
  const referenceRate = entry.reference_rate;
  if (referenceRate === null) return { expectedAmount: null, comparedBasis: "not_compared", referenceRate };
  if (entry.rate_type === "per_auth" || entry.rate_type === "per_transaction") {
    if (row.count !== null && row.count > 0) return { expectedAmount: round2(row.count * referenceRate), comparedBasis: "count", referenceRate };
    if (row.rate !== null && Number.isFinite(row.rate)) return { expectedAmount: null, comparedBasis: "stated_rate", referenceRate };
  }
  if (entry.rate_type === "pct_volume") {
    if (row.volumeBasis !== null && row.volumeBasis > 0) return { expectedAmount: round2(row.volumeBasis * referenceRate), comparedBasis: "volume", referenceRate };
    if (row.rate !== null && Number.isFinite(row.rate)) return { expectedAmount: null, comparedBasis: "stated_rate", referenceRate };
  }
  if (entry.rate_type === "flat_monthly" || entry.rate_type === "flat_annual" || entry.rate_type === "per_location_monthly") {
    return { expectedAmount: referenceRate, comparedBasis: "flat", referenceRate };
  }
  return { expectedAmount: null, comparedBasis: "not_compared", referenceRate };
}

function statusForMatchedComparison(params: {
  comparison: FiservFeeRateComparison;
  matchConfidence: FiservCanonicalFeeRow["matchConfidence"];
  delta: number;
}): FiservFeeProofStatus {
  if (params.comparison === "matches_reference") return params.matchConfidence === "high" && Math.abs(params.delta) <= 0.02 ? "proven" : "likely";
  if (params.comparison === "close_to_reference") return "likely";
  return "indeterminate";
}

function verifyCanonicalRow(row: FiservCanonicalFeeRow): Pick<
  FiservFeeAnalysisRow,
  | "proofStatus"
  | "rateComparison"
  | "expectedAmount"
  | "delta"
  | "deltaPct"
  | "comparedBasis"
  | "referenceRate"
  | "tolerancePct"
  | "reason"
> {
  if (
    row.feeType === "processor_pct_markup" ||
    row.feeType === "processor_per_item" ||
    row.feeType === "processor_fixed" ||
    row.feeType === "compliance_penalty" ||
    row.feeType === "third_party_service"
  ) {
    return {
      proofStatus: "processor_controlled",
      rateComparison: "not_compared",
      expectedAmount: null,
      delta: null,
      deltaPct: null,
      comparedBasis: "not_compared",
      referenceRate: null,
      tolerancePct: null,
      reason: "Processor-controlled or merchant-service fee; no published network pass-through rate applies.",
    };
  }
  if (row.feeType === "suspicious_pass_through_like_fee") {
    return {
      proofStatus: "indeterminate",
      rateComparison: "not_compared",
      expectedAmount: null,
      delta: null,
      deltaPct: null,
      comparedBasis: "not_compared",
      referenceRate: null,
      tolerancePct: null,
      reason: "Pass-through-looking fee requires processor documentation before it can be treated as a legitimate network cost.",
    };
  }
  if (row.feeType === "zero_amount") {
    return {
      proofStatus: "not_enough_detail",
      rateComparison: "not_compared",
      expectedAmount: 0,
      delta: 0,
      deltaPct: null,
      comparedBasis: "not_compared",
      referenceRate: row.referenceEntry?.reference_rate ?? null,
      tolerancePct: row.referenceEntry?.tolerance_pct ?? null,
      reason: "Zero-amount row preserved but excluded from pass-through proof.",
    };
  }
  if (!row.referenceEntry) {
    return {
      proofStatus: row.matchMethod === "ai_candidate" ? "not_enough_detail" : "not_enough_detail",
      rateComparison: "not_compared",
      expectedAmount: null,
      delta: null,
      deltaPct: null,
      comparedBasis: "not_compared",
      referenceRate: null,
      tolerancePct: null,
      reason:
        row.matchMethod === "ai_candidate"
          ? "No deterministic reference match; row is queued as an AI candidate before it can be used as proof."
          : "No reference match and no line-item basis for proof.",
    };
  }
  if (row.referenceEntry.reference_rate === null || row.referenceEntry.rate_type === "variable") {
    return {
      proofStatus: "indeterminate",
      rateComparison: "not_compared",
      expectedAmount: null,
      delta: null,
      deltaPct: null,
      comparedBasis: "not_compared",
      referenceRate: row.referenceEntry.reference_rate,
      tolerancePct: row.referenceEntry.tolerance_pct,
      reason: "Reference exists, but it is variable or lacks a single US market rate for deterministic amount proof.",
    };
  }

  const comparison = expectedAmountFor(row, row.referenceEntry);
  if (comparison.comparedBasis === "stated_rate" && row.rate !== null) {
    const tolerancePct = row.referenceEntry.tolerance_pct ?? 10;
    const delta = round8(row.rate - row.referenceEntry.reference_rate);
    const deltaPct = row.referenceEntry.reference_rate === 0 ? null : round2((Math.abs(delta) / row.referenceEntry.reference_rate) * 100);
    const rateComparison: FiservFeeRateComparison =
      deltaPct !== null && deltaPct <= Math.min(tolerancePct, 2)
        ? "matches_reference"
        : deltaPct !== null && deltaPct <= tolerancePct
          ? "close_to_reference"
          : delta > 0
            ? "above_reference"
            : "below_reference";
    return {
      proofStatus: statusForMatchedComparison({ comparison: rateComparison, matchConfidence: row.matchConfidence, delta }),
      rateComparison,
      expectedAmount: null,
      delta,
      deltaPct,
      comparedBasis: "stated_rate",
      referenceRate: row.referenceEntry.reference_rate,
      tolerancePct,
      reason:
        rateComparison === "above_reference"
          ? "Statement rate is above the reference rate beyond tolerance."
          : rateComparison === "below_reference"
            ? "Statement rate is below the reference rate beyond tolerance."
            : "Statement rate matches or closely tracks the reference rate.",
    };
  }

  if (comparison.expectedAmount === null) {
    return {
      proofStatus: "indeterminate",
      rateComparison: "not_compared",
      expectedAmount: null,
      delta: null,
      deltaPct: null,
      comparedBasis: comparison.comparedBasis,
      referenceRate: row.referenceEntry.reference_rate,
      tolerancePct: row.referenceEntry.tolerance_pct,
      reason: "Reference exists, but the statement row does not expose the count, volume, or base needed for verification.",
    };
  }

  const tolerancePct = row.referenceEntry.tolerance_pct ?? 10;
  const delta = round2(row.amount - comparison.expectedAmount);
  const deltaPct = comparison.expectedAmount === 0 ? null : round2((Math.abs(delta) / comparison.expectedAmount) * 100);
  const rateComparison: FiservFeeRateComparison =
    deltaPct !== null && deltaPct <= Math.min(tolerancePct, 2)
      ? "matches_reference"
      : deltaPct !== null && deltaPct <= tolerancePct
        ? "close_to_reference"
        : delta > 0
          ? "above_reference"
          : "below_reference";
  return {
    proofStatus: statusForMatchedComparison({ comparison: rateComparison, matchConfidence: row.matchConfidence, delta }),
    rateComparison,
    expectedAmount: comparison.expectedAmount,
    delta,
    deltaPct,
    comparedBasis: comparison.comparedBasis,
    referenceRate: row.referenceEntry.reference_rate,
    tolerancePct,
    reason:
      rateComparison === "above_reference"
        ? "Charged amount is above the reference calculation beyond tolerance."
        : rateComparison === "below_reference"
          ? "Charged amount is below the reference calculation beyond tolerance."
          : "Charged amount matches or closely tracks the reference calculation.",
  };
}

function bucketRows(rows: FiservFeeAnalysisRow[], totalFees: number): FiservFeeAnalysisBucket[] {
  const order: FiservCanonicalFeeType[] = [
    "interchange",
    "card_brand_network",
    "pin_debit_interchange",
    "pin_debit_network",
    "pin_debit_network_annual",
    "suspicious_pass_through_like_fee",
    "processor_pct_markup",
    "processor_per_item",
    "processor_fixed",
    "compliance_penalty",
    "third_party_service",
    "unknown",
    "zero_amount",
  ];
  return order
    .map((feeType) => {
      const matching = rows.filter((row) => row.feeType === feeType);
      const amount = round2(matching.reduce((sum, row) => sum + row.amount, 0));
      return {
        feeType,
        amount,
        rows: matching.length,
        pctOfFees: totalFees > 0 ? round2((amount / totalFees) * 100) : null,
      };
    })
    .filter((bucket) => bucket.rows > 0);
}

function isProcessorSpreadMarkupDescription(description: string): boolean {
  const normalized = normalizeFiservFeeReferenceText(description);
  return /^DISC\s+\d+$/.test(normalized) || normalized === "QUAL DISC" || /\bSALES DISCOUNT\b/.test(normalized) || normalized === "OTHER VOLUME FEES";
}

function detectIcPlusFromCanonicalRows(
  rows: FiservCanonicalFeeRow[],
  fallback: FiservFeeAnalysisInput["pricingModel"],
): FiservFeeAnalysisV2["pricingModel"] {
  const nonZeroRows = rows.filter((row) => row.amount > 0);
  const interchangeRows = nonZeroRows.filter((row) => row.feeType === "interchange");
  const networkRows = nonZeroRows.filter((row) => row.feeType === "card_brand_network" || row.feeType === "pin_debit_network");
  const processorSpreadRows = nonZeroRows.filter((row) => isProcessorSpreadMarkupDescription(row.originalDescription) && row.rate !== null);
  const uniqueProcessorSpreadRates = new Set(processorSpreadRows.map((row) => row.rate?.toFixed(7)));
  const mqualOrNqualRows = nonZeroRows.filter((row) => /\b(?:MQUAL|NQUAL|MID QUAL|NON QUAL)\b/i.test(row.originalDescription));

  if (interchangeRows.length > 0 && networkRows.length > 0 && processorSpreadRows.length > 0 && uniqueProcessorSpreadRates.size === 1 && mqualOrNqualRows.length === 0) {
    return {
      pricingModel: "interchange_plus",
      confidence: "high",
      analysisStatus: "ic_plus_ready",
      evidence: [
        "Separate interchange rows are visible.",
        "Card-brand/network rows are itemized separately.",
        `Processor spread markup is uniform at ${processorSpreadRows[0]?.rate ?? "unknown"} across visible card sections.`,
      ],
    };
  }

  const inherited = {
    pricingModel: fallback.pricingModel,
    confidence: confidenceFromParser(fallback.confidence),
    evidence: fallback.notes?.length ? fallback.notes : ["Pricing model inherited from existing parser inference."],
  };
  const qualRows = nonZeroRows.filter((row) => normalizeFiservFeeReferenceText(row.originalDescription) === "QUAL DISC" && row.rate !== null);
  const uniqueQualRates = new Set(qualRows.map((row) => row.rate?.toFixed(7)));
  const zeroDiscountRows = rows.filter((row) => /^DISC\s+\d+$/i.test(row.originalDescription.trim()) && row.amount === 0);
  if (
    inherited.pricingModel === "flat_discount_pricing" &&
    interchangeRows.length === 0 &&
    networkRows.length === 0 &&
    qualRows.length >= 2 &&
    mqualOrNqualRows.length === 0 &&
    uniqueQualRates.size === 1
  ) {
    return {
      pricingModel: zeroDiscountRows.length > 0 ? "single_tier_qualified" : "flat_rate_bundled",
      confidence: "high",
      analysisStatus: "universal_only_pending_model_rules",
      evidence: [
        `Only QUAL DISC discount rows are charged, all at ${(qualRows[0]?.rate ?? 0) * 100}% of volume.`,
        "No charged MQUAL/NQUAL rows are visible, so this is not a full multi-tier statement from the visible fee rows.",
        ...(zeroDiscountRows.length > 0
          ? [`${zeroDiscountRows.length} zero-amount DISC tier row(s) are visible, suggesting unused tier infrastructure.`]
          : []),
        "Interchange and network fees are bundled into the discount charge, so V2 uses benchmark estimates instead of pass-through proof.",
      ],
    };
  }
  return {
    ...inherited,
    analysisStatus:
      inherited.pricingModel === "interchange_plus"
        ? "ic_plus_ready"
        : inherited.pricingModel === "unknown"
          ? "not_enough_detail"
          : "universal_only_pending_model_rules",
  };
}

function isProcessorControlledFeeType(feeType: FiservCanonicalFeeType): boolean {
  return (
    feeType === "processor_pct_markup" ||
    feeType === "processor_per_item" ||
    feeType === "processor_fixed" ||
    feeType === "compliance_penalty" ||
    feeType === "third_party_service"
  );
}

function cardNetworkKey(section: string | null): string | null {
  const normalized = normalizeFiservFeeReferenceText(section);
  if (!normalized) return null;
  if (normalized.includes("AMEX") || normalized.includes("AXP")) return "AMEX";
  if (normalized.includes("MASTERCARD") || normalized.startsWith("MC ")) return "MASTERCARD";
  if (normalized.includes("VISA") || normalized.startsWith("VS ") || normalized.includes("SIGNATURE DEBIT")) return "VISA";
  if (normalized.includes("DISCOVER") || normalized.includes("DCVR")) return "DISCOVER";
  if (/(STAR|ACCEL|PULSE|INTERLINK|MAESTRO|NYCE|SHAZAM)/.test(normalized)) return "PIN_DEBIT";
  return normalized || null;
}

function comparableFeeFamily(description: string): string {
  return normalizeFiservFeeReferenceText(description)
    .replace(/\b(MASTERCARD|MASTER CARD|VISA|DISCOVER|AMEX|AMERICAN EXPRESS|AXP|MC|VI|DCVR|DSCVR|SIG DEBIT|SIGNATURE DEBIT)\b/g, " ")
    .replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g, " ")
    .replace(/\b(TRANSACTIONS?|TRANS|TIMES|TOTALING|DISC RATE|AT)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKnownProcessorMarkupLabel(description: string): boolean {
  const normalized = normalizeFiservFeeReferenceText(description);
  return /\b(DISC|SALES DISCOUNT|AUTH FEE|ITEM FEE|OTHER ITEM|CPU GTWY|SALES ITEMS|BATCH)\b/.test(normalized);
}

function applyCrossRowEconomicRules(rows: FiservFeeAnalysisRow[]): FiservFeeAnalysisRow[] {
  const groups = new Map<string, FiservFeeAnalysisRow[]>();
  for (const row of rows) {
    if (row.rate === null || row.rate <= 0 || isKnownProcessorMarkupLabel(row.description)) continue;
    const network = cardNetworkKey(row.cardTypeSection);
    if (!network || network === "PIN_DEBIT") continue;
    const family = comparableFeeFamily(row.description);
    if (!family || family.length < 5) continue;
    const key = `${family}::${row.rate.toFixed(8)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const suspiciousRowIndexes = new Set<number>();
  for (const group of groups.values()) {
    const networks = new Set(group.map((row) => cardNetworkKey(row.cardTypeSection)).filter(Boolean));
    const looksLikePassThrough = group.some((row) => /ACCESS FEE|ACQ|ACQUIRER|NETWORK|NTWK|ASSESSMENT/i.test(row.description));
    if (networks.size >= 3 && looksLikePassThrough) {
      for (const row of group) suspiciousRowIndexes.add(row.rowIndex);
    }
  }

  if (suspiciousRowIndexes.size === 0) return rows;
  return rows.map((row) => {
    if (!suspiciousRowIndexes.has(row.rowIndex)) return row;
    return {
      ...row,
      feeType: "suspicious_pass_through_like_fee",
      proofStatus: "indeterminate",
      rateComparison: "not_compared",
      expectedAmount: null,
      delta: null,
      deltaPct: null,
      comparedBasis: "not_compared",
      referenceRate: null,
      tolerancePct: null,
      reason:
        "This pass-through-looking fee appears at an identical rate across multiple independent card networks. Treat as high-suspicion until the processor provides source documentation.",
    };
  });
}

function suspiciousUniformRateGroups(rows: FiservFeeAnalysisRow[]): Array<{
  family: string;
  displayName: string;
  rate: number;
  networks: string[];
  rows: FiservFeeAnalysisRow[];
  monthlyAmount: number;
}> {
  const groups = new Map<string, FiservFeeAnalysisRow[]>();
  for (const row of rows) {
    if (row.feeType !== "suspicious_pass_through_like_fee" || row.rate === null) continue;
    const family = comparableFeeFamily(row.description);
    if (!family) continue;
    const key = `${family}::${row.rate.toFixed(8)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const [family] = key.split("::");
      const networks = [...new Set(group.map((row) => cardNetworkKey(row.cardTypeSection)).filter((network): network is string => Boolean(network)))].sort();
      const displayName = family
        .replace(/\bFEE\b/g, "FEE")
        .replace(/\s+/g, " ")
        .trim();
      return {
        family,
        displayName: displayName || group[0]?.description || "Suspicious uniform-rate fee",
        rate: group[0]?.rate ?? 0,
        networks,
        rows: group,
        monthlyAmount: round2(group.reduce((sum, row) => sum + row.amount, 0)),
      };
    })
    .filter((group) => group.networks.length >= 3);
}

function hiddenPctMarkupRows(rows: FiservFeeAnalysisRow[]): FiservFeeAnalysisV2["processorMarkupAnalysis"]["hiddenPctMarkupRows"] {
  return rows
    .filter((row) => {
      const description = normalizeFiservFeeReferenceText(row.description);
      return (
        row.feeType === "processor_pct_markup" &&
        row.rate !== null &&
        (row.volumeBasis !== null || row.rate > 0) &&
        !/\b(DISC|SALES DISCOUNT)\b/.test(description)
      );
    })
    .map((row) => ({
      description: row.description,
      rate: row.rate ?? 0,
      amount: row.amount,
      volumeBasis: row.volumeBasis ?? (row.rate !== null && row.rate > 0 ? round2(row.amount / row.rate) : null),
    }));
}

function salesDiscountRate(rows: FiservFeeAnalysisRow[], kind: "amex" | "non_amex"): number | null {
  const matching = rows.filter((row) => {
    const description = normalizeFiservFeeReferenceText(row.description);
    if (!/\bSALES DISCOUNT\b|\bDISC\b/.test(description) || row.rate === null) return false;
    const isAmex = description.includes("AMEX") || normalizeFiservFeeReferenceText(row.cardTypeSection).includes("AMEX");
    return kind === "amex" ? isAmex : !isAmex;
  });
  if (matching.length === 0) return null;
  const rateTotals = new Map<number, number>();
  for (const row of matching) rateTotals.set(row.rate ?? 0, (rateTotals.get(row.rate ?? 0) ?? 0) + row.amount);
  return [...rateTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function annualize(monthly: number | null): number | null {
  return monthly === null ? null : round2(monthly * 12);
}

function finding(params: Omit<FiservFeeAnalysisFinding, "monthlyCost" | "annualEstimate" | "componentImpactEstimate"> & {
  monthlyCost?: number | null;
  componentImpactEstimate?: FiservFeeAnalysisFinding["componentImpactEstimate"];
}): FiservFeeAnalysisFinding {
  const monthlyCost = Object.prototype.hasOwnProperty.call(params, "monthlyCost") ? (params.monthlyCost ?? null) : params.amount;
  return {
    ...params,
    monthlyCost,
    annualEstimate: annualize(monthlyCost),
    componentImpactEstimate: params.componentImpactEstimate ?? null,
  };
}

function processorMarkupAnalysis(
  rows: FiservFeeAnalysisRow[],
  pricingModel: FiservFeeAnalysisV2["pricingModel"],
  totalVolume: number,
  transactionCount: number | null,
): FiservFeeAnalysisV2["processorMarkupAnalysis"] {
  const emptyStack = { detected: false, fees: [] as string[], totalPerItem: null, perItemAsPctOfAverageTicket: null };
  if (pricingModel.pricingModel !== "interchange_plus") {
    return {
      status: pricingModel.pricingModel === "unknown" ? "not_applicable" : "pending_pricing_model_rules",
      processorControlledTotal: null,
      processorMarkupRate: null,
      processorPctMarkupTotal: null,
      processorPerItemTotal: null,
      processorFixedTotal: null,
      junkFeeTotal: null,
      message:
        pricingModel.pricingModel === "unknown"
          ? "Pricing model is unknown, so processor markup analysis is not available."
          : `Pricing model detected as ${pricingModel.pricingModel}. Processor markup analysis for this model is pending; universal network fee verification is still available.`,
      perItemStacking: emptyStack,
      hiddenPctMarkupRows: [],
      nonAmexSalesDiscountRate: null,
      amexSalesDiscountRate: null,
    };
  }

  const processorRows = rows.filter((row) => isProcessorControlledFeeType(row.feeType));
  const processorControlledTotal = round2(processorRows.reduce((sum, row) => sum + row.amount, 0));
  const processorPctMarkupTotal = round2(rows.filter((row) => row.feeType === "processor_pct_markup").reduce((sum, row) => sum + row.amount, 0));
  const processorPerItemTotal = round2(rows.filter((row) => row.feeType === "processor_per_item").reduce((sum, row) => sum + row.amount, 0));
  const processorFixedTotal = round2(
    rows
      .filter((row) => row.feeType === "processor_fixed" || row.feeType === "compliance_penalty" || row.feeType === "third_party_service")
      .reduce((sum, row) => sum + row.amount, 0),
  );
  const junkFeeTotal = round2(junkPatternRows(rows).reduce((sum, item) => sum + item.row.amount, 0));
  const stackLabels = ["OTHER ITEM FEES", "CPU GTWY", "SALES ITEMS"];
  const stackRows = stackLabels
    .map((label) => rows.find((row) => normalizeFiservFeeReferenceText(row.description) === label))
    .filter((row): row is FiservFeeAnalysisRow => Boolean(row));
  const stackRates = stackRows.map((row) => {
    const match = row.evidenceLine.match(/\|\s*(\d+\.\d{1,7}|\.\d{1,7})\s*\|\s*-\$/);
    const parsed = match ? Number(match[1]) : null;
    return parsed !== null && Number.isFinite(parsed) ? parsed : null;
  });
  const fees = stackRows.map((row, index) => `${row.description} ($${(stackRates[index] ?? 0).toFixed(2)})`);
  const totalPerItem = stackRows.length >= 3 && stackRates.every((rate) => rate !== null) ? round2(stackRates.reduce((sum, rate) => sum + (rate ?? 0), 0)) : null;
  const averageTicket = transactionCount !== null && transactionCount > 0 ? totalVolume / transactionCount : null;

  return {
    status: "ready",
    processorControlledTotal,
    processorMarkupRate: totalVolume > 0 ? round8(processorControlledTotal / totalVolume) : null,
    processorPctMarkupTotal,
    processorPerItemTotal,
    processorFixedTotal,
    junkFeeTotal,
    message: "Interchange-plus processor markup analysis is available because interchange, network fees, and processor fees are itemized separately.",
    perItemStacking: {
      detected: stackRows.length >= 3 && totalPerItem !== null && totalPerItem > 0.15,
      fees,
      totalPerItem,
      perItemAsPctOfAverageTicket: totalPerItem !== null && averageTicket !== null && averageTicket > 0 ? round8(totalPerItem / averageTicket) : null,
    },
    hiddenPctMarkupRows: hiddenPctMarkupRows(rows),
    nonAmexSalesDiscountRate: salesDiscountRate(rows, "non_amex"),
    amexSalesDiscountRate: salesDiscountRate(rows, "amex"),
  };
}

function merchantChannelAnalysis(rows: FiservFeeAnalysisRow[]): FiservMerchantChannelAnalysis {
  const signals: FiservMerchantChannelAnalysis["signals"] = [];
  for (const row of rows) {
    const description = normalizeFiservFeeReferenceText(row.description);
    const evidence = normalizeFiservFeeReferenceText(row.evidenceLine);
    const combined = `${description} ${evidence}`;
    const cnp =
      /\b(ECI|ECIC|ECOM|CNP|CARD NOT PRESENT|DIGITAL COMMERCE)\b/.test(combined) ||
      /\bFIXED NETWORK CNP FEE\b/.test(combined) ||
      /\bAVS ECIC\b/.test(combined) ||
      /\bECI CPU-G\b/.test(combined) ||
      /\bVISA NETWORK FEE CNP\b/.test(combined) ||
      /\bNON[-\s]SWIPED\b/.test(combined);
    const cp =
      /\bCARD PRESENT\b/.test(combined) ||
      /\bFIXED NETWORK CP FEE\b/.test(combined) ||
      /\bVISA NETWORK FEE CP\b/.test(combined);
    if (cnp) {
      signals.push({
        type: "card_not_present",
        description: row.description,
        evidenceLine: row.evidenceLine,
        rowIndex: row.rowIndex,
      });
    }
    if (cp) {
      signals.push({
        type: "card_present",
        description: row.description,
        evidenceLine: row.evidenceLine,
        rowIndex: row.rowIndex,
      });
    }
  }
  const hasCnp = signals.some((signal) => signal.type === "card_not_present");
  const hasCp = signals.some((signal) => signal.type === "card_present");
  const merchantChannel = hasCnp && hasCp ? "mixed" : hasCnp ? "card_not_present" : "card_present";
  const isCnpLike = merchantChannel === "card_not_present" || merchantChannel === "mixed";
  return {
    status: hasCnp || hasCp ? "detected" : "defaulted",
    merchantChannel,
    confidence: hasCnp && signals.length >= 2 ? "high" : hasCnp || hasCp ? "medium" : "low",
    signals,
    benchmarkAdjustments: isCnpLike
      ? {
          effectiveRateBenchmark: { low: 0.025, high: 0.032 },
          interchangeRangeAdjustment: { low: 0.002, high: 0.004 },
          competitiveSpread: { low: 0.0015, high: 0.0025 },
          competitivePerAuth: { low: 0.1, high: 0.12 },
        }
      : {
          effectiveRateBenchmark: null,
          interchangeRangeAdjustment: null,
          competitiveSpread: null,
          competitivePerAuth: null,
        },
    notes: isCnpLike
      ? [
          "Card-not-present signals change the benchmark context; ecommerce/CNP merchants naturally carry higher interchange and qualification risk than card-present merchants.",
          "Downgrade explanations should focus on AVS/CVV2, ecommerce indicators, order/invoice data, and gateway settings before assuming in-store terminal issues.",
        ]
      : ["No card-not-present signals were found, so the merchant channel defaults to card-present."],
  };
}

function tierForDescription(description: string): "qualified" | "mid_qualified" | "non_qualified" | null {
  const normalized = normalizeFiservFeeReferenceText(description);
  if (/\bNQUAL\b|\bNON QUAL\b|\bNON-QUAL\b/.test(normalized)) return "non_qualified";
  if (/\bMQUAL\b|\bMID QUAL\b|\bMID-QUAL\b/.test(normalized)) return "mid_qualified";
  if (/\bQUAL DISC\b|\bQUALIFIED\b/.test(normalized)) return "qualified";
  return null;
}

function impliedVolume(row: Pick<FiservFeeAnalysisRow, "amount" | "rate" | "volumeBasis">): number | null {
  if (row.volumeBasis !== null && row.volumeBasis > 0) return row.volumeBasis;
  if (row.rate !== null && row.rate > 0 && row.amount > 0) return round2(row.amount / row.rate);
  return null;
}

function tieredDowngradeAnalysis(
  rows: FiservFeeAnalysisRow[],
  pricingModel: FiservFeeAnalysisV2["pricingModel"],
  totalFees: number,
  merchantChannel: FiservMerchantChannelAnalysis["merchantChannel"],
): FiservTieredDowngradeAnalysis {
  if (pricingModel.pricingModel !== "tiered_pricing") {
    return {
      status: "not_applicable",
      baselineRate: null,
      baselineSource: "not_available",
      baselineInferred: false,
      totalTieredVolume: null,
      qualifiedVolume: 0,
      midQualifiedVolume: 0,
      nonQualifiedVolume: 0,
      qualifiedPct: null,
      midQualifiedPct: null,
      nonQualifiedPct: null,
      notBestTierPct: null,
      totalDowngradeCost: null,
      rawDowngradeCost: null,
      totalDiscountCharges: null,
      downgradeCostCapped: false,
      totalDowngradeCostPctOfFees: null,
      largestDowngradeImpact: null,
      rows: [],
      flags: [],
      cause: "Tiered downgrade analysis applies only after tiered pricing is detected.",
    };
  }

  const tierRows = rows
    .map((row) => {
      const tier = tierForDescription(row.description);
      const volume = impliedVolume(row);
      if (!tier || volume === null || row.rate === null || row.rate <= 0 || row.amount <= 0) return null;
      return { row, tier, volume, rate: row.rate };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (tierRows.length === 0) {
    return {
      status: "not_enough_detail",
      baselineRate: null,
      baselineSource: "not_available",
      baselineInferred: false,
      totalTieredVolume: null,
      qualifiedVolume: 0,
      midQualifiedVolume: 0,
      nonQualifiedVolume: 0,
      qualifiedPct: null,
      midQualifiedPct: null,
      nonQualifiedPct: null,
      notBestTierPct: null,
      totalDowngradeCost: null,
      rawDowngradeCost: null,
      totalDiscountCharges: null,
      downgradeCostCapped: false,
      totalDowngradeCostPctOfFees: null,
      largestDowngradeImpact: null,
      rows: [],
      flags: [],
      cause: "Tiered pricing was detected, but the statement did not expose usable tier rows with volume/rate/amount detail.",
    };
  }

  const qualRates = tierRows.filter((item) => item.tier === "qualified").map((item) => item.rate);
  const allRates = tierRows.map((item) => item.rate);
  const baselineRate = qualRates.length > 0 ? Math.min(...qualRates) : Math.min(...allRates);
  const baselineSource = qualRates.length > 0 ? "lowest_visible_qual" : "lowest_visible_tier";
  const baselineInferred = qualRates.length === 0;
  const rawAnalysisRows = tierRows.map((item) => {
    const downgradeCost = item.tier === "qualified" ? 0 : round2(Math.max(0, item.volume * (item.rate - baselineRate)));
    return {
      cardTypeSection: item.row.cardTypeSection,
      description: item.row.description,
      tier: item.tier,
      volume: round2(item.volume),
      rate: item.rate,
      amount: item.row.amount,
      baselineRate,
      downgradeCost,
      evidenceLine: item.row.evidenceLine,
    };
  });
  const rawDowngradeCost = round2(rawAnalysisRows.reduce((sum, row) => sum + (row.downgradeCost ?? 0), 0));
  const totalDiscountCharges = round2(tierRows.reduce((sum, item) => sum + item.row.amount, 0));
  const downgradeCostCapped = rawDowngradeCost > totalDiscountCharges && totalDiscountCharges > 0;
  const capFactor = downgradeCostCapped && rawDowngradeCost > 0 ? totalDiscountCharges / rawDowngradeCost : 1;
  const analysisRows = rawAnalysisRows.map((row) => ({
    ...row,
    downgradeCost: row.downgradeCost === null ? null : round2(row.downgradeCost * capFactor),
  }));
  const qualifiedVolume = round2(analysisRows.filter((row) => row.tier === "qualified").reduce((sum, row) => sum + row.volume, 0));
  const midQualifiedVolume = round2(analysisRows.filter((row) => row.tier === "mid_qualified").reduce((sum, row) => sum + row.volume, 0));
  const nonQualifiedVolume = round2(analysisRows.filter((row) => row.tier === "non_qualified").reduce((sum, row) => sum + row.volume, 0));
  const totalTieredVolume = round2(qualifiedVolume + midQualifiedVolume + nonQualifiedVolume);
  const pct = (value: number) => (totalTieredVolume > 0 ? round2((value / totalTieredVolume) * 100) : null);
  const totalDowngradeCost = downgradeCostCapped ? totalDiscountCharges : round2(analysisRows.reduce((sum, row) => sum + (row.downgradeCost ?? 0), 0));
  const largest = [...analysisRows].sort((left, right) => right.amount - left.amount)[0] ?? null;
  const flags: FiservTieredDowngradeAnalysis["flags"] = [];
  const nonQualifiedPct = pct(nonQualifiedVolume);
  const notBestTierPct = pct(midQualifiedVolume + nonQualifiedVolume);
  const qualifiedPct = pct(qualifiedVolume);
  if (nonQualifiedPct !== null && nonQualifiedPct > 30) {
    flags.push({
      kind: "high_non_qualified",
      severity: "high",
      message: `${nonQualifiedPct.toFixed(2)}% of tiered volume fell into non-qualified pricing.`,
    });
  }
  if (notBestTierPct !== null && notBestTierPct > 50) {
    flags.push({
      kind: "majority_downgraded",
      severity: "high",
      message: `${notBestTierPct.toFixed(2)}% of tiered volume did not qualify for the best visible tier.`,
    });
  }
  if (qualifiedPct !== null && qualifiedPct > 80) {
    flags.push({
      kind: "minimal_downgrade",
      severity: "info",
      message: `${qualifiedPct.toFixed(2)}% of tiered volume qualified, so downgrade pressure appears limited.`,
    });
  }
  if (downgradeCostCapped) {
    flags.push({
      kind: "downgrade_cost_capped",
      severity: "warning",
      message: "Downgrade cost was capped at total discount charges. Baseline rate may be unreliable.",
    });
  }

  return {
    status: "ready",
    baselineRate,
    baselineSource,
    baselineInferred,
    totalTieredVolume,
    qualifiedVolume,
    midQualifiedVolume,
    nonQualifiedVolume,
    qualifiedPct,
    midQualifiedPct: pct(midQualifiedVolume),
    nonQualifiedPct,
    notBestTierPct,
    totalDowngradeCost,
    rawDowngradeCost,
    totalDiscountCharges,
    downgradeCostCapped,
    totalDowngradeCostPctOfFees: totalFees > 0 ? round2((totalDowngradeCost / totalFees) * 100) : null,
    largestDowngradeImpact: largest
      ? {
          cardTypeSection: largest.cardTypeSection,
          description: largest.description,
          tier: largest.tier,
          volume: largest.volume,
          rate: largest.rate,
          amount: largest.amount,
          downgradeCost: largest.downgradeCost ?? 0,
          amountPctOfFees: totalFees > 0 ? round2((largest.amount / totalFees) * 100) : null,
          downgradeCostPctOfFees: totalFees > 0 ? round2(((largest.downgradeCost ?? 0) / totalFees) * 100) : null,
          evidenceLine: largest.evidenceLine,
        }
      : null,
    rows: analysisRows,
    flags,
    cause:
      merchantChannel === "card_not_present" || merchantChannel === "mixed"
        ? "For card-not-present merchants, downgrade causes commonly include missing AVS/CVV2, ecommerce indicators, invoice/order data, or gateway qualification settings. Tiered pricing itself creates downgrade risk; IC+ pricing exposes the economics more cleanly."
        : "For card-present merchants, downgrade causes commonly include keyed transactions, missing signature/EMV data, late batch closure, or terminal configuration. Tiered pricing itself creates downgrade risk; IC+ pricing exposes the economics more cleanly.",
  };
}

function rowCountFromAmountAndRate(row: Pick<FiservFeeAnalysisRow, "count" | "rate" | "amount">): number | null {
  if (row.count !== null && row.count > 0) return row.count;
  if (row.rate !== null && row.rate > 0 && row.amount > 0) return Math.round(row.amount / row.rate);
  return null;
}

function authorizationAnalysis(
  rows: FiservFeeAnalysisRow[],
  merchantChannel: FiservMerchantChannelAnalysis["merchantChannel"],
  transactionCount: number | null,
): FiservAuthorizationAnalysis {
  void merchantChannel;
  if (transactionCount === null || transactionCount <= 0) {
    return {
      status: "not_enough_detail",
      transactionCount,
      authorizationCount: null,
      authRatio: null,
      excessAuthorizationCount: null,
      estimatedExcessAuthCost: null,
      primaryAuthRate: null,
      primaryAuthRows: [],
      flags: [],
    };
  }

  const authGroups = [
    rows.filter((row) => /\bWATS AUTH FEE\b/i.test(row.description)),
    rows.filter((row) => /\bECI CPU-G\b|\bECI CPU\b/i.test(row.description)),
    rows.filter((row) => /\bCPU GTWY\b|\bGATEWAY AUTH\b|\bCPU-G\b/i.test(row.description)),
    rows.filter((row) => /\bACQR PROCESSOR\b|\bACQUIRER PROCESSOR\b/i.test(row.description)),
    rows.filter((row) => /\bNABU\b/i.test(row.description)),
  ];
  const selected = authGroups.find((group) => group.length > 0) ?? [];
  const primaryAuthRows = selected
    .map((row) => {
      const count = rowCountFromAmountAndRate(row);
      if (count === null || count <= 0) return null;
      return {
        description: row.description,
        cardTypeSection: row.cardTypeSection,
        count,
        rate: row.rate,
        amount: row.amount,
        evidenceLine: row.evidenceLine,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (primaryAuthRows.length === 0) {
    return {
      status: "not_enough_detail",
      transactionCount,
      authorizationCount: null,
      authRatio: null,
      excessAuthorizationCount: null,
      estimatedExcessAuthCost: null,
      primaryAuthRate: null,
      primaryAuthRows: [],
      flags: [],
    };
  }

  const authorizationCount = primaryAuthRows.reduce((sum, row) => sum + row.count, 0);
  const authRatio = round2(authorizationCount / transactionCount);
  const excessAuthorizationCount = authRatio > 1.5 ? Math.max(0, authorizationCount - transactionCount) : 0;
  const primaryAuthRate = round2(primaryAuthRows.reduce((sum, row) => sum + row.amount, 0) / authorizationCount);
  const estimatedExcessAuthCost = round2(excessAuthorizationCount * primaryAuthRate);
  const flags: FiservAuthorizationAnalysis["flags"] = [];
  if (authRatio > 3) {
    flags.push({
      kind: "unusually_high_auth_ratio",
      severity: "high",
      message: `Authorization count is ${authRatio.toFixed(2)}x settled transaction count; review gateway retry/decline behavior.`,
    });
  } else if (authRatio > 1.5) {
    flags.push({
      kind: "auths_exceed_settled_transactions",
      severity: "warning",
      message: `Authorization count is ${authRatio.toFixed(2)}x settled transaction count.`,
    });
  }

  return {
    status: "ready",
    transactionCount,
    authorizationCount,
    authRatio,
    excessAuthorizationCount,
    estimatedExcessAuthCost,
    primaryAuthRate,
    primaryAuthRows,
    flags,
  };
}

function newAccountAnalysis(totalVolume: number, ytdGrossSales: number | null | undefined): FiservNewAccountAnalysis {
  if (ytdGrossSales === null || ytdGrossSales === undefined || ytdGrossSales <= 0 || totalVolume <= 0) {
    return {
      status: "not_enough_detail",
      currentMonthVolume: totalVolume,
      ytdGrossSales: ytdGrossSales ?? null,
      ytdToCurrentMonthRatio: null,
      message: "YTD gross sales were not available, so first-statement status cannot be proven.",
      recommendation: null,
    };
  }
  const ratio = round8(ytdGrossSales / totalVolume);
  const status = Math.abs(ytdGrossSales - totalVolume) <= 0.01 ? "confirmed" : ytdGrossSales <= totalVolume * 1.1 ? "likely" : "not_detected";
  return {
    status,
    currentMonthVolume: totalVolume,
    ytdGrossSales,
    ytdToCurrentMonthRatio: ratio,
    message:
      status === "confirmed"
        ? "YTD gross sales equal current statement volume, so this appears to be the first processing statement in the tax year."
        : status === "likely"
          ? "YTD gross sales are within 10% of current statement volume, so this is likely an early/new account statement."
          : "YTD gross sales are materially above current statement volume, so this does not appear to be a first statement.",
    recommendation:
      status === "confirmed" || status === "likely"
        ? "New merchants often have limited pricing leverage immediately; review contract terms now and reprice after 3-6 months of processing history."
        : null,
  };
}

function serializeBenchmarkCategoryResolution(resolution: BenchmarkCategoryResolution): Omit<BenchmarkCategoryResolution, "category"> {
  const { category: _category, ...serializable } = resolution;
  return serializable;
}

function effectiveRateBenchmarkAnalysis(params: {
  categoryResolution: BenchmarkCategoryResolution;
  totalVolume: number;
  effectiveRate: number | null;
  processorMarkupRate: number | null;
  ytdGrossSales: number | null | undefined;
  statementPeriodStart: string;
  annualVolumeOverride?: ReturnType<typeof estimateAnnualVolume> | null;
}): FiservEffectiveRateBenchmarkAnalysis {
  if (params.totalVolume <= 0 || params.effectiveRate === null) {
    return {
      status: "not_enough_detail",
      categoryId: params.categoryResolution.categoryId,
      categoryLabel: params.categoryResolution.categoryLabel,
      categoryConfidence: params.categoryResolution.confidence,
      categorySource: params.categoryResolution.source,
      matchedKeyword: params.categoryResolution.matchedKeyword,
      categoryResolution: serializeBenchmarkCategoryResolution(params.categoryResolution),
      annualVolume: null,
      annualVolumeSource: "not_available",
      ytdExtrapolatedAnnualVolume: null,
      volumeTier: null,
      effectiveRate: params.effectiveRate,
      benchmarkLow: null,
      benchmarkHigh: null,
      adjustment: null,
      processorMarkupRate: params.processorMarkupRate,
      verdict: "not_enough_detail",
      estimatedAnnualOverpayment: null,
      message: "Effective-rate benchmarking requires positive statement volume and fees.",
      notes: params.categoryResolution.warning ? [params.categoryResolution.warning] : [],
    };
  }

  const reference = loadMccBenchmarkReference();
  const category = params.categoryResolution;
  const annual = params.annualVolumeOverride ?? estimateAnnualVolume(params.totalVolume, params.ytdGrossSales, params.statementPeriodStart);
  const adjusted = adjustedEffectiveRateBenchmark({ category: category.category, annualVolume: annual.annualVolume, reference });
  const benchmarkLow = adjusted.benchmark.low;
  const benchmarkHigh = adjusted.benchmark.high;
  const nearBenchmarkTolerance = 0.001;
  const verdict =
    params.effectiveRate <= benchmarkLow
      ? "below_range"
      : params.effectiveRate <= benchmarkHigh + nearBenchmarkTolerance
        ? "within_range"
        : params.effectiveRate > benchmarkHigh + 0.005
          ? "significantly_above_range"
          : "above_range";
  const estimatedAnnualOverpayment =
    verdict === "significantly_above_range" ? round2(Math.max(0, params.effectiveRate - benchmarkHigh) * params.totalVolume * 12) : null;
  const categoryQualifier =
    category.categoryId === "default" ? "default category — MCC-specific benchmark not available, using general retail benchmark" : `${category.categoryLabel} category`;
  const message =
    verdict === "below_range" || verdict === "within_range"
      ? `This merchant's effective rate of ${(params.effectiveRate * 100).toFixed(2)}% is within the competitive range of ${(benchmarkLow * 100).toFixed(2)}% to ${(benchmarkHigh * 100).toFixed(2)}% for a ${category.categoryLabel} merchant processing approximately $${annual.annualVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}/year. The processor-controlled cost of ${((params.processorMarkupRate ?? 0) * 100).toFixed(2)}% of volume is competitive.`
      : verdict === "significantly_above_range"
        ? `This merchant's effective rate of ${(params.effectiveRate * 100).toFixed(2)}% is significantly above the competitive range. Estimated annual overpayment: $${(estimatedAnnualOverpayment ?? 0).toFixed(2)}.`
        : `This merchant's effective rate of ${(params.effectiveRate * 100).toFixed(2)}% is slightly above the competitive range of ${(benchmarkLow * 100).toFixed(2)}% to ${(benchmarkHigh * 100).toFixed(2)}%.`;

  return {
    status: "ready",
    categoryId: category.categoryId,
    categoryLabel: category.categoryLabel,
    categoryConfidence: category.confidence,
    categorySource: category.source,
    matchedKeyword: category.matchedKeyword,
    categoryResolution: serializeBenchmarkCategoryResolution(category),
    annualVolume: annual.annualVolume,
    annualVolumeSource: annual.source,
    ytdExtrapolatedAnnualVolume: annual.ytdExtrapolatedAnnualVolume,
    volumeTier: adjusted.tier,
    effectiveRate: params.effectiveRate,
    benchmarkLow,
    benchmarkHigh,
    adjustment: adjusted.adjustment,
    processorMarkupRate: params.processorMarkupRate,
    verdict,
    estimatedAnnualOverpayment,
    message,
    notes: [
      categoryQualifier,
      ...(category.warning ? [category.warning] : []),
      ...(adjusted.adjustmentNote ? [adjusted.adjustmentNote] : []),
      ...(annual.ytdExtrapolatedAnnualVolume !== null
        ? [
            annual.source === "ytd_extrapolated"
              ? `YTD-extrapolated annual volume is $${annual.ytdExtrapolatedAnnualVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}; benchmark tier uses YTD to reduce month-to-month tier flip-flopping.`
              : `YTD-extrapolated annual volume is $${annual.ytdExtrapolatedAnnualVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}; benchmark tier uses monthly volume x 12.`,
          ]
        : []),
    ],
  };
}

function isProcessorAuthBenchmarkLabel(description: string): boolean {
  const normalized = normalizeFiservFeeReferenceText(description);
  return (
    normalized === "WATS AUTH FEE" ||
    normalized === "ECI CPU-G" ||
    normalized === "ECI CPU G" ||
    normalized === "CPU GTWY" ||
    /\b(?:GATEWAY AUTH|AUTHORIZATION FEE|AUTH FEE)\b/.test(normalized)
  );
}

function processorAuthBenchmarkRows(rows: FiservFeeAnalysisRow[]): FiservPerAuthBenchmarkAnalysis["rows"] {
  return rows
    .filter((row) => row.feeType === "processor_per_item" && isProcessorAuthBenchmarkLabel(row.description))
    .map((row) => {
      const count = rowCountFromAmountAndRate(row);
      if (count === null || count <= 0) return null;
      return {
        description: row.description,
        cardTypeSection: row.cardTypeSection,
        count,
        rate: row.rate,
        amount: row.amount,
        evidenceLine: row.evidenceLine,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function perAuthGroupLabel(row: FiservPerAuthBenchmarkAnalysis["rows"][number]): string {
  const normalized = normalizeFiservFeeReferenceText(`${row.cardTypeSection ?? ""} ${row.description}`);
  if (/\b(?:AMEX|AMERICAN EXPRESS|AXP)\b/.test(normalized)) return "Amex per-auth";
  return "Non-Amex per-auth";
}

function perAuthRateGroups(rows: FiservPerAuthBenchmarkAnalysis["rows"]): FiservPerAuthBenchmarkAnalysis["rateGroups"] {
  const groups = new Map<string, { label: string; rate: number; count: number; amount: number; rowCount: number }>();
  for (const row of rows) {
    if (row.rate === null || row.rate <= 0) continue;
    const label = perAuthGroupLabel(row);
    const key = `${label}::${row.rate.toFixed(4)}`;
    const current = groups.get(key) ?? { label, rate: row.rate, count: 0, amount: 0, rowCount: 0 };
    groups.set(key, {
      ...current,
      count: current.count + row.count,
      amount: current.amount + row.amount,
      rowCount: current.rowCount + 1,
    });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, amount: round2(group.amount) }))
    .sort((left, right) => right.count - left.count || right.amount - left.amount);
}

function perAuthBenchmarkAnalysis(params: {
  rows: FiservFeeAnalysisRow[];
  annualVolume: number | null;
  merchantChannel: FiservMerchantChannelAnalysis["merchantChannel"];
  isHighRisk: boolean;
  processorPerItemTotal: number | null;
}): FiservPerAuthBenchmarkAnalysis {
  const rows = processorAuthBenchmarkRows(params.rows);
  if (rows.length === 0) {
    return {
      status: "not_applicable",
      annualVolume: params.annualVolume,
      volumeTier: null,
      benchmarkChannel: null,
      currentRate: null,
      competitiveLow: null,
      competitiveHigh: null,
      targetRate: null,
      authorizationCount: null,
      monthlyAuthCost: null,
      dominantRate: null,
      dominantAuthorizationCount: null,
      dominantMonthlyAuthCost: null,
      monthlyImpact: null,
      annualImpact: null,
      dominant: false,
      rateGroups: [],
      rows: [],
      message: "No processor per-authorization fee rows were detected for per-authorization benchmarking.",
    };
  }
  const benchmark = perAuthBenchmarkFor({
    annualVolume: params.annualVolume,
    merchantChannel: params.merchantChannel,
    isHighRisk: params.isHighRisk,
  });
  const authorizationCount = rows.reduce((sum, row) => sum + row.count, 0);
  const monthlyAuthCost = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const rateGroups = perAuthRateGroups(rows);
  const dominantGroup = rateGroups[0] ?? null;
  const currentRate = dominantGroup?.rate ?? (authorizationCount > 0 ? round2(monthlyAuthCost / authorizationCount) : null);
  const dominantAuthorizationCount = dominantGroup?.count ?? null;
  const dominantMonthlyAuthCost = dominantGroup?.amount ?? null;
  const dominant = params.processorPerItemTotal !== null && params.processorPerItemTotal > 0 && monthlyAuthCost >= params.processorPerItemTotal * 0.5;
  if (!benchmark.benchmark || currentRate === null || authorizationCount <= 0) {
    return {
      status: "not_enough_detail",
      annualVolume: params.annualVolume,
      volumeTier: benchmark.tier,
      benchmarkChannel: benchmark.channel,
      currentRate,
      competitiveLow: null,
      competitiveHigh: null,
      targetRate: null,
      authorizationCount,
      monthlyAuthCost,
      dominantRate: currentRate,
      dominantAuthorizationCount,
      dominantMonthlyAuthCost,
      monthlyImpact: null,
      annualImpact: null,
      dominant,
      rateGroups,
      rows,
      message: "Per-authorization benchmarking requires a volume tier and usable processor auth count/rate detail.",
    };
  }
  const targetRate = currentRate > benchmark.benchmark.high ? benchmark.benchmark.high : (benchmark.benchmark.low + benchmark.benchmark.high) / 2;
  const impactCount = dominantAuthorizationCount ?? authorizationCount;
  const monthlyImpact = round2(Math.max(0, currentRate - targetRate) * impactCount);
  const annualImpact = round2(monthlyImpact * 12);
  const groupText =
    rateGroups.length > 1
      ? ` Visible rate groups: ${rateGroups.map((group) => `${group.label}: $${group.rate.toFixed(2)} (${group.count.toLocaleString("en-US")} auths)`).join("; ")}.`
      : "";
  return {
    status: "ready",
    annualVolume: params.annualVolume,
    volumeTier: benchmark.tier,
    benchmarkChannel: benchmark.channel,
    currentRate,
    dominantRate: currentRate,
    dominantAuthorizationCount,
    dominantMonthlyAuthCost,
    competitiveLow: benchmark.benchmark.low,
    competitiveHigh: benchmark.benchmark.high,
    targetRate,
    authorizationCount,
    monthlyAuthCost,
    monthlyImpact,
    annualImpact,
    dominant,
    rateGroups,
    rows,
    message: `The dominant per-authorization fee is $${currentRate.toFixed(2)} across ${(impactCount ?? 0).toLocaleString("en-US")} authorization(s). For a merchant processing approximately $${(params.annualVolume ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}/year, competitive per-auth pricing is $${benchmark.benchmark.low.toFixed(2)} to $${benchmark.benchmark.high.toFixed(2)}. Reducing from $${currentRate.toFixed(2)} to $${targetRate.toFixed(2)} would create a component impact of approximately $${monthlyImpact.toFixed(2)}/month ($${annualImpact.toFixed(2)}/year).${groupText}`,
  };
}

function junkPatternRows(rows: FiservFeeAnalysisRow[]): Array<{ row: FiservFeeAnalysisRow; pattern: MccBenchmarkPattern }> {
  const reference = loadMccBenchmarkReference();
  return rows
    .filter((row) => row.feeType === "processor_fixed")
    .map((row) => {
      const pattern = matchBenchmarkPattern(row.description, reference.junk_fee_patterns.fees);
      return pattern ? { row, pattern } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function penaltyPatternRows(rows: FiservFeeAnalysisRow[]): Array<{ row: FiservFeeAnalysisRow; pattern: MccBenchmarkPattern }> {
  const reference = loadMccBenchmarkReference();
  return rows
    .map((row) => {
      const pattern = matchBenchmarkPattern(row.description, reference.penalty_fee_patterns.fees);
      return pattern ? { row, pattern } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function developerReview(rows: FiservFeeAnalysisRow[]): FiservFeeAnalysisV2["developerReview"] {
  const reference = loadMccBenchmarkReference();
  const unknownFeeRows = rows
    .filter((row) => row.feeType === "unknown" || row.matchMethod === "ai_candidate")
    .map((row) => ({
      rowIndex: row.rowIndex,
      description: row.description,
      cardTypeSection: row.cardTypeSection,
      volumeBasis: row.volumeBasis,
      count: row.count,
      rate: row.rate,
      amount: row.amount,
      feeType: row.feeType,
      matchMethod: row.matchMethod,
      evidenceLine: row.evidenceLine,
    }));
  const unmatchedProcessorFixedFees = rows
    .filter((row) => row.feeType === "processor_fixed" && !matchBenchmarkPattern(row.description, reference.junk_fee_patterns.fees))
    .map((row) => ({
      rowIndex: row.rowIndex,
      description: row.description,
      cardTypeSection: row.cardTypeSection,
      amount: row.amount,
      evidenceLine: row.evidenceLine,
    }));
  return { unknownFeeRows, unmatchedProcessorFixedFees };
}

function disputeActivityAnalysis(params: {
  rows: FiservFeeAnalysisRow[];
  fundingBatchRows?: FiservFeeAnalysisInput["fundingBatchRows"];
  totalVolume: number;
}): FiservDisputeActivityAnalysis {
  const chargebackRows = params.rows.filter((row) => /\bCHARGEBACKS?\b/i.test(row.description));
  const achRejectRows = params.rows.filter((row) => /\bACH\s+REJECT\b/i.test(row.description));
  const chargebackFeeAmount = round2(chargebackRows.reduce((sum, row) => sum + row.amount, 0));
  const achRejectFeeAmount = round2(achRejectRows.reduce((sum, row) => sum + row.amount, 0));
  const chargebackCount = Math.round(
    chargebackRows.reduce((sum, row) => {
      const count = rowCountFromAmountAndRate(row);
      return sum + (count ?? row.count ?? 0);
    }, 0),
  );
  const achRejectCount = Math.round(
    achRejectRows.reduce((sum, row) => {
      const count = rowCountFromAmountAndRate(row);
      return sum + (count ?? row.count ?? 0);
    }, 0),
  );
  const fundingRows = params.fundingBatchRows ?? [];
  const fundingAdjustmentCount = fundingRows.filter((row) => Math.abs(row.adjustments ?? 0) > 0.005).length;
  const fundingChargebackCount = fundingRows.filter((row) => Math.abs(row.chargebacks ?? 0) > 0.005).length;
  const disputeCostAmount = round2(chargebackFeeAmount + achRejectFeeAmount);
  const disputeCostPctOfVolume = params.totalVolume > 0 ? round8(disputeCostAmount / params.totalVolume) : null;
  const flags: FiservDisputeActivityAnalysis["flags"] = [];
  if ((disputeCostPctOfVolume ?? 0) > 0.005) {
    flags.push({
      kind: "high_dispute_cost_pct",
      severity: (disputeCostPctOfVolume ?? 0) > 0.01 ? "high" : "warning",
      message: `Dispute-related fees equal ${((disputeCostPctOfVolume ?? 0) * 100).toFixed(2)}% of monthly volume.`,
    });
  }
  if (fundingAdjustmentCount > 5) {
    flags.push({
      kind: "high_adjustment_count",
      severity: fundingAdjustmentCount > 10 ? "high" : "warning",
      message: `${fundingAdjustmentCount} funding batch row(s) include adjustments.`,
    });
  }
  const evidence = [
    ...chargebackRows.slice(0, 4).map((row) => row.evidenceLine),
    ...achRejectRows.slice(0, 4).map((row) => row.evidenceLine),
    ...fundingRows
      .filter((row) => Math.abs(row.adjustments ?? 0) > 0.005 || Math.abs(row.chargebacks ?? 0) > 0.005)
      .slice(0, 4)
      .map((row) => row.evidenceLine)
      .filter((line): line is string => Boolean(line)),
  ];
  const status =
    chargebackCount > 0 || achRejectCount > 0 || fundingAdjustmentCount > 0 || fundingChargebackCount > 0 ? ("ready" as const) : ("not_applicable" as const);
  return {
    status,
    chargebackCount,
    chargebackFeeAmount,
    achRejectCount,
    achRejectFeeAmount,
    fundingAdjustmentCount,
    fundingChargebackCount,
    disputeCostAmount,
    disputeCostPctOfVolume,
    flags,
    evidence,
  };
}

function findingAnnualImpact(finding: FiservFeeAnalysisFinding): number {
  return round2(
    Math.max(
      finding.componentImpactEstimate?.high ?? 0,
      finding.annualEstimate ?? 0,
      finding.amount === null ? 0 : finding.amount,
    ),
  );
}

function savingsTierForFinding(finding: FiservFeeAnalysisFinding): "confirmed" | "negotiable" | "investigative" | null {
  if (finding.kind === "tiered_downgrade_cost" || finding.kind === "tiered_downgrade_high_nqual" || finding.kind === "tiered_downgrade_majority_not_qualified") {
    return null;
  }
  if (
    finding.kind === "authorization_ratio_healthy" ||
    finding.kind === "effective_rate_positive_benchmark" ||
    finding.kind === "bundled_effective_rate_above_benchmark" ||
    finding.kind === "card_not_present_detected" ||
    finding.kind === "new_account_pricing_context"
  ) {
    return null;
  }
  if (finding.kind === "ai_statement_anomaly") return null;
  if (
    finding.kind === "avoidable_compliance_fee" ||
    finding.kind === "junk_fee" ||
    finding.kind === "junk_fixed_fee_summary" ||
    finding.action === "complete_pci_validation" ||
    isPciOrSecurityPenaltyFinding(finding)
  ) {
    return "confirmed";
  }
  if (
    finding.kind === "per_auth_fee_benchmark" ||
    finding.kind === "hidden_percentage_markup" ||
    finding.kind === "processor_per_item_stacking" ||
    finding.kind === "bundled_pricing_savings_opportunity" ||
    finding.kind === "effective_rate_above_benchmark" ||
    finding.action === "negotiate_processor_rate" ||
    finding.action === "request_interchange_plus_quote"
  ) {
    return "negotiable";
  }
  if (
    finding.kind === "suspicious_uniform_rate" ||
    finding.kind === "rate_exceeds_reference" ||
    finding.kind === "third_party_service_fee" ||
    finding.action === "request_pass_through_documentation" ||
    finding.action === "verify_third_party_service"
  ) {
    return "investigative";
  }
  if (finding.kind === "ai_fee_assessment") {
    if (finding.severity === "high") return "confirmed";
    if (finding.severity === "warning") return "negotiable";
    return "investigative";
  }
  return null;
}

function savingsComponentAnnualImpact(finding: FiservFeeAnalysisFinding): number {
  if (finding.kind === "tiered_downgrade_cost" || finding.kind === "tiered_downgrade_high_nqual" || finding.kind === "tiered_downgrade_majority_not_qualified") return 0;
  if (finding.componentImpactEstimate) return round2(Math.max(finding.componentImpactEstimate.low, finding.componentImpactEstimate.high));
  if (finding.kind === "rate_exceeds_reference" || finding.kind === "suspicious_uniform_rate" || finding.kind === "junk_fee" || finding.kind === "penalty_or_configuration_fee") {
    return finding.annualEstimate ?? 0;
  }
  return 0;
}

function isPciOrSecurityPenaltyFinding(finding: FiservFeeAnalysisFinding): boolean {
  const text = normalizeFiservFeeReferenceText([finding.title, ...finding.evidence].join(" "));
  return /\b(PCI|NON COMPLIANCE|NON COMPLIANT|NON VALIDATED|MANAGED SECURITY|SECURITY NON)\b/.test(text);
}

function findingPriorityTier(finding: FiservFeeAnalysisFinding): number {
  if (isPciOrSecurityPenaltyFinding(finding)) return 1;
  if (finding.kind === "avoidable_compliance_fee") return 1;
  if (finding.action === "complete_pci_validation") return 1;
  if (finding.kind === "junk_fee" || finding.kind === "junk_fixed_fee_summary") return 2;
  if (finding.kind === "suspicious_uniform_rate" || finding.kind === "rate_exceeds_reference") return 3;
  if (
    finding.kind === "per_auth_fee_benchmark" ||
    finding.kind === "processor_per_item_stacking" ||
    finding.kind === "hidden_percentage_markup" ||
    finding.kind === "bundled_pricing_savings_opportunity" ||
    finding.kind === "bundled_effective_rate_above_benchmark" ||
    finding.kind === "effective_rate_above_benchmark" ||
    finding.kind === "tiered_downgrade_cost" ||
    finding.kind === "tiered_downgrade_high_nqual" ||
    finding.kind === "tiered_downgrade_majority_not_qualified"
  ) {
    return 4;
  }
  return 5;
}

function sortFindingsForPresentation(findings: FiservFeeAnalysisFinding[]): FiservFeeAnalysisFinding[] {
  return [...findings].sort((left, right) => {
    const tierDelta = findingPriorityTier(left) - findingPriorityTier(right);
    if (tierDelta !== 0) return tierDelta;
    const impactDelta = findingAnnualImpact(right) - findingAnnualImpact(left);
    if (Math.abs(impactDelta) > 0.005) return impactDelta;
    const severityRank = { high: 0, warning: 1, info: 2 } as const;
    return severityRank[left.severity] - severityRank[right.severity];
  });
}

function findingsFor(analysis: Omit<FiservFeeAnalysisV2, "findings" | "estimatedAnnualSavings" | "developerReview">): FiservFeeAnalysisFinding[] {
  const findings: FiservFeeAnalysisFinding[] = [];
  for (const row of analysis.rows.filter((candidate) => candidate.rateComparison === "above_reference")) {
    findings.push(finding({
      kind: "rate_exceeds_reference",
      severity: row.matchConfidence === "high" ? "high" : "warning",
      title: `${row.description} exceeds the reference rate`,
      amount: row.delta,
      evidence: [row.reason, row.evidenceLine],
      action: "request_pass_through_documentation",
    }));
  }
  if (analysis.processorMarkupAnalysis.status === "pending_pricing_model_rules") {
    findings.push(finding({
      kind: "pricing_model_pending_rules",
      severity: "info",
      title: "Processor markup analysis is pending for this pricing model",
      amount: null,
      evidence: [analysis.processorMarkupAnalysis.message],
      action: "none",
    }));
  }
  if (analysis.merchantChannelAnalysis.merchantChannel === "card_not_present" || analysis.merchantChannelAnalysis.merchantChannel === "mixed") {
    findings.push(finding({
      kind: "card_not_present_detected",
      severity: "info",
      title:
        analysis.merchantChannelAnalysis.merchantChannel === "mixed"
          ? "Mixed card-present/card-not-present signals detected"
          : "Card-not-present merchant signals detected",
      amount: null,
      evidence: analysis.merchantChannelAnalysis.signals.slice(0, 6).map((signal) => signal.evidenceLine),
      action: "fix_terminal_or_gateway_configuration",
    }));
  }
  if (analysis.tieredDowngradeAnalysis.status === "ready") {
    const downgrade = analysis.tieredDowngradeAnalysis;
    if ((downgrade.nonQualifiedPct ?? 0) > 30) {
      findings.push(finding({
        kind: "tiered_downgrade_high_nqual",
        severity: "high",
        title: "High non-qualified volume on tiered pricing",
        amount: downgrade.nonQualifiedVolume,
        evidence: [
          `${(downgrade.nonQualifiedPct ?? 0).toFixed(2)}% of tiered volume is non-qualified.`,
          downgrade.largestDowngradeImpact?.evidenceLine ?? "Tiered discount rows show non-qualified volume.",
        ],
        action: "request_interchange_plus_quote",
        monthlyCost: null,
      }));
    }
    if ((downgrade.notBestTierPct ?? 0) > 50) {
      findings.push(finding({
        kind: "tiered_downgrade_majority_not_qualified",
        severity: "high",
        title: "Most tiered volume did not qualify for the best tier",
        amount: round2(downgrade.midQualifiedVolume + downgrade.nonQualifiedVolume),
        evidence: [
          `${(downgrade.notBestTierPct ?? 0).toFixed(2)}% of tiered volume is MQUAL or NQUAL.`,
          downgrade.cause,
        ],
        action: "request_interchange_plus_quote",
        monthlyCost: null,
      }));
    }
    if ((downgrade.totalDowngradeCost ?? 0) > 0) {
      findings.push(finding({
        kind: "tiered_downgrade_cost",
        severity: (downgrade.totalDowngradeCost ?? 0) >= 100 ? "high" : "warning",
        title: "Tiered downgrade cost above qualified baseline",
        amount: downgrade.totalDowngradeCost,
        evidence: [
          `Estimated downgrade cost this month is $${(downgrade.totalDowngradeCost ?? 0).toFixed(2)} above the lowest visible qualified tier.`,
          ...(downgrade.downgradeCostCapped
            ? [
                `Downgrade cost was capped at total discount charges of $${(downgrade.totalDiscountCharges ?? 0).toFixed(2)}; raw calculated downgrade cost was $${(downgrade.rawDowngradeCost ?? 0).toFixed(2)}.`,
              ]
            : []),
          ...(downgrade.baselineInferred ? ["No qualified tier was visible, so the baseline rate is inferred from the lowest visible discount tier."] : []),
          "This is only the extra cost above all-qualified tiered pricing; overpayment versus competitive IC+ may be larger.",
        ],
        action: "request_interchange_plus_quote",
        monthlyCost: null,
      }));
    }
  }
  if (analysis.authorizationAnalysis.status === "ready" && (analysis.authorizationAnalysis.authRatio ?? 0) > 1.5) {
    findings.push(finding({
      kind: "authorization_ratio_high",
      severity: (analysis.authorizationAnalysis.authRatio ?? 0) > 3 ? "high" : "warning",
      title: "Authorization count exceeds settled transaction count",
      amount: analysis.authorizationAnalysis.estimatedExcessAuthCost,
      evidence: [
        `${analysis.authorizationAnalysis.authorizationCount ?? 0} authorization(s) versus ${analysis.authorizationAnalysis.transactionCount ?? 0} settled transaction(s).`,
        `Auth-to-transaction ratio is ${(analysis.authorizationAnalysis.authRatio ?? 0).toFixed(2)}:1.`,
      ],
      action: "fix_terminal_or_gateway_configuration",
      componentImpactEstimate:
        (analysis.authorizationAnalysis.estimatedExcessAuthCost ?? 0) > 0
          ? {
              low: round2((analysis.authorizationAnalysis.estimatedExcessAuthCost ?? 0) * 12),
              high: round2((analysis.authorizationAnalysis.estimatedExcessAuthCost ?? 0) * 12),
              basis: "Annualized cost of authorizations above settled transaction count using the statement auth rate.",
            }
          : null,
    }));
  }
  if (analysis.authorizationAnalysis.status === "ready" && (analysis.authorizationAnalysis.authRatio ?? 0) <= 1.5) {
    findings.push(finding({
      kind: "authorization_ratio_healthy",
      severity: "info",
      title: "Authorization-to-transaction ratio is healthy",
      amount: null,
      evidence: [
        `${analysis.authorizationAnalysis.authorizationCount ?? 0} authorization(s) versus ${analysis.authorizationAnalysis.transactionCount ?? 0} settled transaction(s).`,
        `Authorization-to-transaction ratio is ${(analysis.authorizationAnalysis.authRatio ?? 0).toFixed(2)}:1. No excess authorization fees detected.`,
      ],
      action: "none",
      monthlyCost: null,
    }));
  }
  if (analysis.perAuthBenchmarkAnalysis.status === "ready" && analysis.perAuthBenchmarkAnalysis.dominant) {
    findings.push(finding({
      kind: "per_auth_fee_benchmark",
      severity: (analysis.perAuthBenchmarkAnalysis.monthlyImpact ?? 0) > 0 ? "warning" : "info",
      title: (analysis.perAuthBenchmarkAnalysis.monthlyImpact ?? 0) > 0 ? "Per-authorization fee is above competitive benchmark" : "Per-authorization fee is within benchmark",
      amount: analysis.perAuthBenchmarkAnalysis.monthlyAuthCost,
      evidence: [
        analysis.perAuthBenchmarkAnalysis.message,
        ...analysis.perAuthBenchmarkAnalysis.rows.slice(0, 6).map((row) => row.evidenceLine),
      ],
      action: (analysis.perAuthBenchmarkAnalysis.monthlyImpact ?? 0) > 0 ? "negotiate_processor_rate" : "none",
      componentImpactEstimate:
        (analysis.perAuthBenchmarkAnalysis.annualImpact ?? 0) > 0
          ? {
              low: analysis.perAuthBenchmarkAnalysis.annualImpact ?? 0,
              high: analysis.perAuthBenchmarkAnalysis.annualImpact ?? 0,
              basis: "Annualized savings from reducing processor per-authorization pricing to the competitive benchmark target.",
            }
          : null,
    }));
  }
  if (analysis.disputeActivityAnalysis.status === "ready" && analysis.disputeActivityAnalysis.flags.length > 0) {
    const dispute = analysis.disputeActivityAnalysis;
    findings.push(finding({
      kind: "dispute_activity_high",
      severity: dispute.flags.some((flag) => flag.severity === "high") ? "high" : "warning",
      title: "Dispute and adjustment activity is elevated",
      amount: dispute.disputeCostAmount,
      evidence: [
        `${dispute.chargebackCount} chargeback(s), ${dispute.achRejectCount} ACH reject(s), and ${dispute.fundingAdjustmentCount} funding adjustment row(s) detected.`,
        dispute.disputeCostPctOfVolume === null
          ? "Dispute cost percentage could not be calculated because volume was unavailable."
          : `Chargeback and ACH reject fees equal ${(dispute.disputeCostPctOfVolume * 100).toFixed(2)}% of volume.`,
        ...dispute.flags.map((flag) => flag.message),
        ...dispute.evidence.slice(0, 6),
      ],
      action: "fix_terminal_or_gateway_configuration",
      componentImpactEstimate:
        dispute.disputeCostAmount > 0
          ? {
              low: round2(dispute.disputeCostAmount * 12 * 0.25),
              high: round2(dispute.disputeCostAmount * 12),
              basis: "Annualized chargeback and ACH reject fee burden; savings assumes dispute prevention and reject cleanup reduce these costs.",
            }
          : null,
    }));
  }
  if (analysis.effectiveRateBenchmarkAnalysis.status === "ready") {
    const benchmark = analysis.effectiveRateBenchmarkAnalysis;
    if (benchmark.verdict === "below_range" || benchmark.verdict === "within_range") {
      findings.push(finding({
        kind: "effective_rate_positive_benchmark",
        severity: "info",
        title: "Effective rate is competitive for this merchant category",
        amount: null,
        evidence: [benchmark.message, ...benchmark.notes],
        action: "none",
        monthlyCost: null,
      }));
    } else if (benchmark.verdict === "significantly_above_range") {
      findings.push(finding({
        kind: "effective_rate_above_benchmark",
        severity: "high",
        title: "Effective rate is significantly above benchmark",
        amount: benchmark.estimatedAnnualOverpayment,
        evidence: [benchmark.message, ...benchmark.notes],
        action: "request_interchange_plus_quote",
        monthlyCost: benchmark.estimatedAnnualOverpayment === null ? null : round2(benchmark.estimatedAnnualOverpayment / 12),
        componentImpactEstimate:
          benchmark.estimatedAnnualOverpayment === null
            ? null
            : {
                low: benchmark.estimatedAnnualOverpayment,
                high: benchmark.estimatedAnnualOverpayment,
                basis: "Estimated annual overpayment versus the high end of the adjusted effective-rate benchmark.",
              },
      }));
    }
  }
  if (analysis.newAccountAnalysis.status === "confirmed" || analysis.newAccountAnalysis.status === "likely") {
    findings.push(finding({
      kind: "new_account_pricing_context",
      severity: "info",
      title: analysis.newAccountAnalysis.status === "confirmed" ? "First statement detected" : "Likely early account statement detected",
      amount: null,
      evidence: [analysis.newAccountAnalysis.message, analysis.newAccountAnalysis.recommendation ?? ""].filter(Boolean),
      action: "request_interchange_plus_quote",
    }));
  }
  if (analysis.bundledPricingBenchmark.status === "ready") {
    const benchmark = analysis.bundledPricingBenchmark;
    const effectiveRate = benchmark.effectiveRate;
    const benchmarkHigh = benchmark.adjustedBenchmarkRate?.high ?? null;
    if (effectiveRate !== null && benchmarkHigh !== null && effectiveRate > benchmarkHigh + 0.005) {
      findings.push(finding({
        kind: "bundled_effective_rate_above_benchmark",
        severity: "high",
        title: "Bundled effective rate is materially above benchmark",
        amount: null,
        evidence: [
          `Effective rate is ${(effectiveRate * 100).toFixed(2)}%.`,
          `Adjusted ${benchmark.businessCategory.label} benchmark range is ${((benchmark.adjustedBenchmarkRate?.low ?? 0) * 100).toFixed(2)}%-${(benchmarkHigh * 100).toFixed(2)}%.`,
          "This is a directional benchmark because interchange detail is not itemized on the statement.",
        ],
        action: "request_interchange_plus_quote",
      }));
    }
    if ((benchmark.estimatedAnnualImpact?.high ?? 0) > 0) {
      findings.push(finding({
        kind: "bundled_pricing_savings_opportunity",
        severity: (benchmark.estimatedAnnualImpact?.low ?? 0) >= 1000 ? "high" : "warning",
        title: "Bundled pricing shows estimated savings opportunity",
        amount: benchmark.estimatedMonthlyImpact?.high ?? null,
        evidence: [
          `Estimated annual component impact range: $${(benchmark.estimatedAnnualImpact?.low ?? 0).toFixed(2)}-$${(benchmark.estimatedAnnualImpact?.high ?? 0).toFixed(2)}.`,
          `Estimated competitive IC+ monthly cost range: $${(benchmark.estimatedCompetitiveCost?.low ?? 0).toFixed(2)}-$${(benchmark.estimatedCompetitiveCost?.high ?? 0).toFixed(2)}.`,
          "Savings are estimates, not proof, because interchange and network fees are bundled.",
        ],
        action: "request_interchange_plus_quote",
        componentImpactEstimate: {
          low: benchmark.estimatedAnnualImpact?.low ?? 0,
          high: benchmark.estimatedAnnualImpact?.high ?? 0,
          basis: "Estimated annual savings from bundled-pricing benchmark model. Not pass-through proof.",
        },
      }));
    }
    if (benchmark.billbackRisk || benchmark.unusedTierRows > 0) {
      findings.push(finding({
        kind: "single_tier_qualified_structure",
        severity: "warning",
        title: benchmark.billbackRisk ? "Single qualified-tier pricing structure detected" : "Unused discount tier rows detected",
        amount: null,
        evidence: [
          benchmark.billbackRisk
            ? "Only qualified-tier discount rows are visible; separate billback/enhanced billback surcharges may exist outside this statement."
            : "The statement uses bundled discount rows rather than itemized interchange detail.",
          benchmark.unusedTierRows > 0 ? `${benchmark.unusedTierRows} zero-amount discount tier row(s) were detected.` : "No unused zero discount tiers were detected.",
        ],
        action: "request_pass_through_documentation",
      }));
    }
  }
  if (analysis.processorMarkupAnalysis.perItemStacking.detected) {
    findings.push(finding({
      kind: "processor_per_item_stacking",
      severity: "high",
      title: "Multiple processor per-item fees are stacked",
      amount: analysis.processorMarkupAnalysis.processorPerItemTotal,
      evidence: analysis.processorMarkupAnalysis.perItemStacking.fees,
      action: "negotiate_processor_rate",
      componentImpactEstimate:
        analysis.processorMarkupAnalysis.processorPerItemTotal === null
          ? null
          : {
              low: round2(analysis.processorMarkupAnalysis.processorPerItemTotal * 12 * 0.25),
              high: round2(analysis.processorMarkupAnalysis.processorPerItemTotal * 12 * 0.5),
              basis: "Negotiable processor per-item fees; savings range assumes 25%-50% reduction.",
            },
    }));
  }
  const junkRows = junkPatternRows(analysis.rows);
  for (const { row, pattern } of junkRows) {
    findings.push(finding({
      kind: "junk_fee",
      severity: "warning",
      title: `${row.description} is avoidable or negotiable`,
      amount: row.amount,
      evidence: [
        pattern.recommendation ?? "This fixed processor fee is avoidable or negotiable.",
        row.evidenceLine,
        `Estimated annual cost: $${(row.amount * 12).toFixed(2)}.`,
      ],
      action: "negotiate_processor_rate",
    }));
  }
  if (junkRows.length > 0) {
    const totalJunk = round2(junkRows.reduce((sum, item) => sum + item.row.amount, 0));
    findings.push(finding({
      kind: "junk_fixed_fee_summary",
      severity: "warning",
      title: "Avoidable or negotiable fixed fees detected",
      amount: totalJunk,
      evidence: [
        `Total avoidable or negotiable fixed fees: $${totalJunk.toFixed(2)}/month ($${(totalJunk * 12).toFixed(2)}/year).`,
        ...junkRows.map((item) => `${item.row.description}: $${item.row.amount.toFixed(2)}/month`),
      ],
      action: "negotiate_processor_rate",
      componentImpactEstimate: {
        low: round2(totalJunk * 12 * 0.25),
        high: round2(totalJunk * 12),
        basis: "Annualized fixed-fee burden; low estimate assumes partial negotiation, high estimate assumes all avoidable fixed fees are removed.",
      },
    }));
  }
  for (const group of suspiciousUniformRateGroups(analysis.rows)) {
    findings.push(finding({
      kind: "suspicious_uniform_rate",
      severity: "high",
      title: `${group.displayName} is charged at the same rate across independent networks`,
      amount: group.monthlyAmount,
      evidence: [
        `This fee is charged at an identical rate across ${group.networks.length} independent card networks. Legitimate network fees are set independently by each network and do not share rates. Total annual impact: $${(group.monthlyAmount * 12).toFixed(2)}. Recommend verifying with processor.`,
        `Uniform rate: ${group.rate}. Networks: ${group.networks.join(", ")}.`,
        ...group.rows.slice(0, 8).map((row) => row.evidenceLine),
      ],
      action: "request_pass_through_documentation",
      componentImpactEstimate: {
        low: 0,
        high: round2(group.monthlyAmount * 12),
        basis: "Component impact only: potential annualized amount if processor cannot document this as a legitimate pass-through. The top-level estimatedAnnualSavings field is the single savings number.",
      },
    }));
  }
  const penaltyRows = penaltyPatternRows(analysis.rows);
  const penaltyRowIndexes = new Set(penaltyRows.map((item) => item.row.rowIndex));
  for (const row of analysis.rows.filter((candidate) => candidate.feeType === "compliance_penalty" && !penaltyRowIndexes.has(candidate.rowIndex))) {
    findings.push(finding({
      kind: "avoidable_compliance_fee",
      severity: "high",
      title: `${row.description} is an avoidable compliance or validation fee`,
      amount: row.amount,
      evidence: [
        "This fee indicates PCI/security validation has not been completed or recognized.",
        row.evidenceLine,
      ],
      action: "complete_pci_validation",
      componentImpactEstimate: {
        low: round2(row.amount * 12),
        high: round2(row.amount * 12),
        basis: "Completing PCI validation should eliminate or significantly reduce this fee.",
      },
    }));
  }
  for (const row of analysis.rows.filter((candidate) => candidate.feeType === "third_party_service")) {
    findings.push(finding({
      kind: "third_party_service_fee",
      severity: "info",
      title: `${row.description} is a third-party service fee`,
      amount: row.amount,
      evidence: [
        "This appears to be a product/platform service fee passed through on the processor statement.",
        row.evidenceLine,
      ],
      action: "verify_third_party_service",
      componentImpactEstimate: {
        low: 0,
        high: round2(row.amount * 12),
        basis: "Potential savings equals annualized amount if the merchant does not actively use this service.",
      },
    }));
  }
  for (const row of analysis.processorMarkupAnalysis.hiddenPctMarkupRows) {
    const normalizedDescription = normalizeFiservFeeReferenceText(row.description);
    const isSavingsAdjustment = /\bCOMM(?:ERCIAL)?\s+CARD\b/.test(normalizedDescription) && /\bI\/?C\s+SAVINGS\b/.test(normalizedDescription);
    const retentionPct = row.volumeBasis !== null && row.volumeBasis > 0 ? row.amount / row.volumeBasis : row.rate;
    findings.push(finding({
      kind: "hidden_percentage_markup",
      severity: isSavingsAdjustment && retentionPct > 0.25 ? "high" : "warning",
      title: isSavingsAdjustment ? `${row.description} retains ${(retentionPct * 100).toFixed(2)}% of commercial-card savings` : `${row.description} adds hidden percentage markup`,
      amount: row.amount,
      evidence: isSavingsAdjustment
        ? [
            `Savings pool/base shown: $${(row.volumeBasis ?? 0).toFixed(2)}; processor retained $${row.amount.toFixed(2)}.`,
            `Retention percentage: ${(retentionPct * 100).toFixed(2)}%. Retention above 25% should be challenged.`,
          ]
        : [
            `This percentage-of-volume fee is separate from the visible sales discount spread. Rate: ${row.rate}.`,
            `Volume basis: ${row.volumeBasis ?? "not shown"}.`,
          ],
      action: "negotiate_processor_rate",
      componentImpactEstimate: {
        low: round2(row.amount * 12 * 0.25),
        high: round2(row.amount * 12),
        basis: "Savings range assumes this hidden markup is reduced or removed.",
      },
    }));
  }
  for (const row of analysis.rows.filter((candidate) => candidate.matchMethod === "ai_classified" && candidate.aiAssessment)) {
    const assessment = row.aiAssessment!;
    const hasAction =
      assessment.merchantAction !== "none" ||
      assessment.avoidableLikelihood === "high" ||
      assessment.avoidableLikelihood === "medium";
    if (!hasAction) continue;
    findings.push(finding({
      kind: "ai_fee_assessment",
      severity: assessment.avoidableLikelihood === "high" ? "high" : assessment.avoidableLikelihood === "medium" ? "warning" : "info",
      title: assessment.recommendation ? `${row.description}: ${assessment.recommendation}` : `${row.description}: AI fee assessment`,
      amount: row.amount,
      evidence: [
        `Paid to: ${assessment.paidToParty}.`,
        `Negotiability: ${assessment.negotiability}.`,
        `Avoidable likelihood: ${assessment.avoidableLikelihood}.`,
        `Merchant action: ${assessment.merchantAction}.`,
        `Pass-through proof posture: ${assessment.passThroughProofPosture}.`,
        assessment.fixedFeeAssessment
          ? `Fixed fee avoidable assessment: ${assessment.fixedFeeAssessment.avoidable} (${assessment.fixedFeeAssessment.confidence}). ${assessment.fixedFeeAssessment.recommendation ?? ""}`
          : "",
        ...assessment.evidence,
      ].filter(Boolean),
      action:
        assessment.merchantAction === "request_pass_through_documentation"
          ? "request_pass_through_documentation"
          : assessment.merchantAction === "fix_terminal_or_gateway_configuration"
            ? "fix_terminal_or_gateway_configuration"
            : assessment.merchantAction === "verify_service_or_contract"
              ? "verify_third_party_service"
              : "negotiate_processor_rate",
      componentImpactEstimate:
        assessment.avoidableLikelihood === "high" || assessment.avoidableLikelihood === "medium"
          ? {
              low: assessment.avoidableLikelihood === "high" ? round2(row.amount * 12) : 0,
              high: round2(row.amount * 12),
              basis: "Component impact only: AI-assessed fee-removal opportunity. The top-level estimatedAnnualSavings field is the single savings number.",
            }
          : null,
    }));
  }
  for (const { row, pattern } of penaltyRows) {
    findings.push(finding({
      kind: "penalty_or_configuration_fee",
      severity: "warning",
      title: `${row.description} may be avoidable through configuration or qualification fixes`,
      amount: row.amount,
      evidence: [
        pattern.cause ?? "This is a penalty/configuration fee.",
        pattern.fix ?? "Review terminal or gateway configuration.",
        row.amount < 5
          ? "Current impact is minimal. Monitor for recurring occurrences — if this appears frequently, it indicates a terminal or gateway configuration issue."
          : "Recurring penalty fees may indicate a terminal or gateway configuration issue.",
        row.evidenceLine,
      ],
      action: "fix_terminal_or_gateway_configuration",
      componentImpactEstimate: {
        low: 0,
        high: round2(row.amount * 12),
        basis: "Potential savings equals annualized amount if transaction data or authorization handling is corrected.",
      },
    }));
  }
  if (analysis.normalization.aiCandidateCount > 0) {
    findings.push(finding({
      kind: "normalization_ai_candidates",
      severity: "info",
      title: "Some fee labels need AI-assisted reference review",
      amount: null,
      evidence: [`${analysis.normalization.aiCandidateCount} row(s) did not match the deterministic Fiserv reference table.`],
      action: "none",
    }));
  }
  return sortFindingsForPresentation(findings);
}

function rowsAmount(rows: FiservFeeAnalysisRow[]): number {
  return round2(rows.reduce((sum, row) => sum + row.amount, 0));
}

function component(
  kind: FiservInterchangeReconciliationComponent["kind"],
  rows: FiservFeeAnalysisRow[],
  fallbackAmount: number | null = null,
  fallbackEvidence: string[] = [],
): FiservInterchangeReconciliationComponent {
  return {
    kind,
    amount: fallbackAmount ?? rowsAmount(rows),
    rows: rows.length,
    evidence: rows.length > 0 ? rows.slice(0, 8).map((row) => row.evidenceLine) : fallbackEvidence,
  };
}

function buildInterchangeReconciliation(
  rows: FiservFeeAnalysisRow[],
  basis: FiservFeeAnalysisInput["interchangeReconciliationBasis"],
): FiservFeeAnalysisV2["interchangeReconciliation"] {
  if (!basis || basis.summaryTotal === null || basis.detailTableTotal === null) {
    return {
      summaryTotal: basis?.summaryTotal ?? null,
      detailTableTotal: basis?.detailTableTotal ?? null,
      gap: null,
      explainedGapTotal: null,
      unexplainedGap: null,
      status: "not_available",
      components: [],
      notes: ["Interchange summary/detail reconciliation requires both a summary bucket total and a detail-table total."],
    };
  }

  const gap = round2(basis.summaryTotal - basis.detailTableTotal);
  if (Math.abs(gap) <= 0.02) {
    return {
      summaryTotal: basis.summaryTotal,
      detailTableTotal: basis.detailTableTotal,
      gap: 0,
      explainedGapTotal: 0,
      unexplainedGap: 0,
      status: "matches",
      components: [component("detail_table", [], basis.detailTableTotal, [basis.detailEvidenceLine ?? "Interchange detail table total."])],
      notes: ["The summary interchange/program bucket matches the detail-table total."],
    };
  }

  const inBroadPassThroughBucket = rows.filter((row) => row.sourceFeeType === "Interchange charges" || row.sourceFeeType === "Program Fees");
  const networkRows = inBroadPassThroughBucket.filter((row) => row.feeType === "card_brand_network");
  const suspiciousRows = inBroadPassThroughBucket.filter((row) => row.feeType === "suspicious_pass_through_like_fee");
  const pinDebitRows = inBroadPassThroughBucket.filter((row) => row.feeType === "pin_debit_interchange" || row.feeType === "pin_debit_network");
  const components = [
    component("detail_table", [], basis.detailTableTotal, [basis.detailEvidenceLine ?? "Interchange detail table total."]),
    component("card_brand_network_inside_summary_bucket", networkRows),
    component("suspicious_access_inside_summary_bucket", suspiciousRows),
    component("pin_debit_interchange_inside_summary_bucket", pinDebitRows),
  ].filter((entry) => entry.amount > 0 || entry.kind === "detail_table");
  const explainedGapTotal = round2(rowsAmount(networkRows) + rowsAmount(suspiciousRows) + rowsAmount(pinDebitRows));
  const unexplainedGap = round2(Math.abs(gap) - explainedGapTotal);
  const status = Math.abs(unexplainedGap) <= 1 ? "explained_structural_difference" : "unexplained_difference";
  if (status === "unexplained_difference") {
    components.push(component("unexplained", [], Math.max(0, unexplainedGap), ["Remaining gap after known network/access/PIN-debit explainers."]));
  }

  return {
    summaryTotal: basis.summaryTotal,
    detailTableTotal: basis.detailTableTotal,
    gap,
    explainedGapTotal,
    unexplainedGap: Math.max(0, unexplainedGap),
    status,
    components,
    notes: [
      "Some Fiserv statement formats define Total Interchange Charges/Program Fees more broadly than the detail table.",
      "The bridge treats the detail table as product/interchange detail, then explains the gap with network, suspicious access, and PIN debit rows printed in the broad pass-through bucket.",
    ],
  };
}

function estimatedAnnualSavings(
  analysis: Omit<FiservFeeAnalysisV2, "findings" | "estimatedAnnualSavings" | "developerReview">,
  findings: FiservFeeAnalysisFinding[],
): FiservFeeAnalysisV2["estimatedAnnualSavings"] {
  const currentAnnualFees = round2(analysis.reconciliation.basisTotal * 12);
  const rawComponents = findings
    .map((item) => {
      const tier = savingsTierForFinding(item);
      if (tier === null) return null;
      const annualImpact = savingsComponentAnnualImpact(item);
      if (annualImpact <= 0) return null;
      const confidence = tier === "confirmed" ? "high" : tier === "negotiable" ? "medium" : "low";
      return {
        kind: item.kind,
        label: item.title,
        annualImpact,
        tier,
        confidence: confidence as "high" | "medium" | "low",
        sourceFindingKind: item.kind,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const hasItemizedJunkFees = rawComponents.some((component) => component.kind === "junk_fee");
  const hasBundledSavingsModel = rawComponents.some((component) => component.kind === "bundled_pricing_savings_opportunity");
  const components = rawComponents.filter((component) => {
    if (hasItemizedJunkFees && component.kind === "junk_fixed_fee_summary") return false;
    if (hasBundledSavingsModel && (component.kind === "effective_rate_above_benchmark" || component.kind === "bundled_effective_rate_above_benchmark")) return false;
    return true;
  });

  const sumTier = (tiers: Array<"confirmed" | "negotiable" | "investigative">) =>
    round2(components.filter((component) => tiers.includes(component.tier)).reduce((sum, component) => sum + component.annualImpact, 0));
  const conservative = sumTier(["confirmed"]);
  const estimated = sumTier(["confirmed", "negotiable"]);
  const maximum = sumTier(["confirmed", "negotiable", "investigative"]);
  const amount = estimated;
  const estimatedCompetitiveAnnualFees = round2(Math.max(0, currentAnnualFees - estimated));
  const confidence: "high" | "medium" | "low" = conservative > 0 ? "high" : estimated > 0 ? "medium" : maximum > 0 ? "low" : "low";
  const basis =
    "Component-tier savings model: conservative includes confirmed removable fees; estimated includes confirmed plus negotiable items; maximum includes confirmed, negotiable, and investigative items.";
  return {
    conservative,
    estimated,
    maximum,
    amount,
    currentAnnualFees,
    estimatedCompetitiveAnnualFees: round2(Math.max(0, estimatedCompetitiveAnnualFees)),
    methodology: "component_tier_sum",
    confidence,
    basis,
    componentCount: components.length,
    components,
  };
}

export function buildFiservFeeAnalysisV2(input: FiservFeeAnalysisInput): FiservFeeAnalysisV2 {
  const baseRows = input.canonicalRows.map((row): FiservFeeAnalysisRow => {
    const verification = verifyCanonicalRow(row);
    return {
      rowIndex: row.rowIndex,
      cardTypeSection: row.cardTypeSection,
      description: row.originalDescription,
      normalizedDescription: row.normalizedDescription,
      canonicalName: row.canonicalName,
      amount: row.amount,
      volumeBasis: row.volumeBasis,
      count: row.count,
      rate: row.rate,
      feeType: row.feeType,
      sourceFeeType: row.sourceFeeType,
      sourceSection: row.sourceSection,
      matchMethod: row.matchMethod,
      matchConfidence: row.matchConfidence,
      referenceId: row.referenceId,
      ...verification,
      evidenceLine: row.rawEvidenceLine,
    };
  });
  const rows = applyCrossRowEconomicRules(baseRows);

  const rowTotal = round2(rows.reduce((sum, row) => sum + row.amount, 0));
  const basisTotal = input.printedTotal ?? input.totalFees;
  const pricingModel = detectIcPlusFromCanonicalRows(input.canonicalRows, input.pricingModel);
  const channelAnalysis = merchantChannelAnalysis(rows);
  const downgradeAnalysis = tieredDowngradeAnalysis(rows, pricingModel, input.totalFees, channelAnalysis.merchantChannel);
  const authAnalysis = authorizationAnalysis(rows, channelAnalysis.merchantChannel, input.transactionCount);
  const accountAnalysis = newAccountAnalysis(input.totalVolume, input.ytdGrossSales);
  const processorMarkup = processorMarkupAnalysis(rows, pricingModel, input.totalVolume, input.transactionCount);
  const annualVolume = estimateAnnualVolume(input.totalVolume, input.ytdGrossSales, input.statementPeriodStart);
  const categoryResolution = resolveBenchmarkCategory({
    merchantName: input.merchantName,
    userSelectedBusinessType: input.userSelectedBusinessType,
    aiSuggestion: input.benchmarkCategoryAiSuggestion,
  });
  const effectiveBenchmark = effectiveRateBenchmarkAnalysis({
    categoryResolution,
    totalVolume: input.totalVolume,
    effectiveRate: input.totalVolume > 0 ? input.totalFees / input.totalVolume : null,
    processorMarkupRate: processorMarkup.processorMarkupRate,
    ytdGrossSales: input.ytdGrossSales,
    statementPeriodStart: input.statementPeriodStart,
  });
  const perAuthBenchmark = perAuthBenchmarkAnalysis({
    rows,
    annualVolume: annualVolume.annualVolume,
    merchantChannel: channelAnalysis.merchantChannel,
    isHighRisk: categoryResolution.categoryId === "high_risk_retail",
    processorPerItemTotal: processorMarkup.processorPerItemTotal,
  });
  const disputeActivity = disputeActivityAnalysis({
    rows,
    fundingBatchRows: input.fundingBatchRows,
    totalVolume: input.totalVolume,
  });
  const withoutFindings = {
    version: "2.0" as const,
    normalization: input.normalizationSummary,
    notices: input.notices ?? [],
    noticeText: typeof input.noticeText === "string" && input.noticeText.trim() ? input.noticeText.trim() : null,
    pricingModel,
    buckets: bucketRows(rows, input.totalFees),
    rows,
    rateVerification: {
      proven: rows.filter((row) => row.proofStatus === "proven").length,
      likely: rows.filter((row) => row.proofStatus === "likely").length,
      processorControlled: rows.filter((row) => row.proofStatus === "processor_controlled").length,
      indeterminate: rows.filter((row) => row.proofStatus === "indeterminate").length,
      notEnoughDetail: rows.filter((row) => row.proofStatus === "not_enough_detail").length,
    },
    processorMarkupAnalysis: processorMarkup,
    merchantChannelAnalysis: channelAnalysis,
    tieredDowngradeAnalysis: downgradeAnalysis,
    authorizationAnalysis: authAnalysis,
    benchmarkCategoryResolution: serializeBenchmarkCategoryResolution(categoryResolution),
    effectiveRateBenchmarkAnalysis: effectiveBenchmark,
    perAuthBenchmarkAnalysis: perAuthBenchmark,
    disputeActivityAnalysis: disputeActivity,
    newAccountAnalysis: accountAnalysis,
    bundledPricingBenchmark: buildFiservBundledPricingBenchmarkAnalysis({
      pricingModel: pricingModel.pricingModel,
      rows,
      totalVolume: input.totalVolume,
      totalFees: input.totalFees,
      transactionCount: input.transactionCount,
      merchantName: input.merchantName,
      merchantChannel: channelAnalysis.merchantChannel,
    }),
    interchangeReconciliation: buildInterchangeReconciliation(rows, input.interchangeReconciliationBasis),
    reconciliation: {
      basisTotal,
      rowTotal,
      residual: round2(Math.abs(rowTotal - basisTotal)),
      status: Math.abs(rowTotal - basisTotal) <= 1 ? ("pass" as const) : ("warning" as const),
    },
  };
  const findings = findingsFor(withoutFindings);
  return finalizeFiservFeeAnalysisPresentation({
    ...withoutFindings,
    findings,
    estimatedAnnualSavings: estimatedAnnualSavings(withoutFindings, findings),
    developerReview: developerReview(rows),
  });
}

export function buildFiservFeeAnalysisV2FromRawRows(input: Omit<FiservFeeAnalysisInput, "canonicalRows" | "normalizationSummary"> & {
  rows: FiservRawFeeRowForNormalization[];
}): FiservFeeAnalysisV2 {
  const normalized = normalizeFiservFeeRows(input.rows);
  return buildFiservFeeAnalysisV2({
    ...input,
    canonicalRows: normalized.rows,
    normalizationSummary: normalized.summary,
  });
}

export function applyBenchmarkCategoryAiSuggestionToFiservFeeAnalysisV2(params: {
  analysis: FiservFeeAnalysisV2;
  merchantName?: string | null;
  totalVolume: number;
  totalFees: number;
  statementPeriodStart: string;
  aiSuggestion: BenchmarkCategoryAiSuggestion;
}): FiservFeeAnalysisV2 {
  const categoryResolution = resolveBenchmarkCategory({
    merchantName: params.merchantName,
    userSelectedBusinessType: params.analysis.benchmarkCategoryResolution.userSelectedBusinessType,
    aiSuggestion: params.aiSuggestion,
  });
  const effectiveBenchmark = effectiveRateBenchmarkAnalysis({
    categoryResolution,
    totalVolume: params.totalVolume,
    effectiveRate: params.totalVolume > 0 ? params.totalFees / params.totalVolume : null,
    processorMarkupRate: params.analysis.processorMarkupAnalysis.processorMarkupRate,
    ytdGrossSales: null,
    statementPeriodStart: params.statementPeriodStart,
    annualVolumeOverride:
      params.analysis.effectiveRateBenchmarkAnalysis.annualVolume !== null &&
      params.analysis.effectiveRateBenchmarkAnalysis.annualVolumeSource !== "not_available"
        ? {
            annualVolume: params.analysis.effectiveRateBenchmarkAnalysis.annualVolume,
            source: params.analysis.effectiveRateBenchmarkAnalysis.annualVolumeSource,
            ytdExtrapolatedAnnualVolume: params.analysis.effectiveRateBenchmarkAnalysis.ytdExtrapolatedAnnualVolume,
          }
        : null,
  });
  const perAuthBenchmark = perAuthBenchmarkAnalysis({
    rows: params.analysis.rows,
    annualVolume: effectiveBenchmark.annualVolume,
    merchantChannel: params.analysis.merchantChannelAnalysis.merchantChannel,
    isHighRisk: categoryResolution.categoryId === "high_risk_retail",
    processorPerItemTotal: params.analysis.processorMarkupAnalysis.processorPerItemTotal,
  });
  const withoutFindings = {
    ...params.analysis,
    benchmarkCategoryResolution: serializeBenchmarkCategoryResolution(categoryResolution),
    effectiveRateBenchmarkAnalysis: effectiveBenchmark,
    perAuthBenchmarkAnalysis: perAuthBenchmark,
  };
  const findings = findingsFor(withoutFindings);
  return finalizeFiservFeeAnalysisPresentation({
    ...withoutFindings,
    estimatedAnnualSavings: estimatedAnnualSavings(withoutFindings, findings),
    developerReview: developerReview(params.analysis.rows),
    findings,
  });
}

export function finalizeFiservFeeAnalysisPresentation(analysis: FiservFeeAnalysisV2): FiservFeeAnalysisV2 {
  const withoutPresentation = analysis as Omit<FiservFeeAnalysisV2, "findings" | "estimatedAnnualSavings" | "developerReview">;
  const findings = findingsFor(withoutPresentation);
  return {
    ...analysis,
    findings,
    estimatedAnnualSavings: estimatedAnnualSavings(withoutPresentation, findings),
    developerReview: developerReview(analysis.rows),
  };
}
