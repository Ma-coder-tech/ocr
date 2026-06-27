import {
  normalizeFiservFeeRows,
  type FiservCanonicalFeeRow,
  type FiservCanonicalFeeType,
  type FiservFeeNormalizationSummary,
  type FiservRawFeeRowForNormalization,
} from "./fiservFeeNormalizer.js";
import { normalizeFiservFeeReferenceText, type FiservFeeReferenceEntry } from "./fiservFeeReference.js";
import { round2, round8 } from "./reconciliation.js";
import type { RepricingEvent } from "./types.js";

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
  notices?: RepricingEvent[];
  interchangeReconciliationBasis?: {
    summaryTotal: number | null;
    detailTableTotal: number | null;
    summaryEvidenceLine: string | null;
    detailEvidenceLine: string | null;
  };
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
    | "penalty_or_configuration_fee";
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
    | "fix_terminal_or_gateway_configuration";
  monthlyCost: number | null;
  annualEstimate: number | null;
  savingsEstimate: {
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

export type FiservFeeAnalysisV2 = {
  version: "2.0";
  normalization: FiservFeeNormalizationSummary;
  notices: RepricingEvent[];
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
  savingsSummary: {
    annualLow: number;
    annualHigh: number;
    opportunities: number;
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

function detectIcPlusFromCanonicalRows(
  rows: FiservCanonicalFeeRow[],
  fallback: FiservFeeAnalysisInput["pricingModel"],
): FiservFeeAnalysisV2["pricingModel"] {
  const nonZeroRows = rows.filter((row) => row.amount > 0);
  const interchangeRows = nonZeroRows.filter((row) => row.feeType === "interchange");
  const networkRows = nonZeroRows.filter((row) => row.feeType === "card_brand_network" || row.feeType === "pin_debit_network");
  const discRows = nonZeroRows.filter((row) => /^DISC\s+\d+$/i.test(row.originalDescription.trim()) && row.rate !== null);
  const uniqueDiscRates = new Set(discRows.map((row) => row.rate?.toFixed(7)));
  const hasTieredLabels = nonZeroRows.some((row) => /\b(?:QUAL|MQUAL|NQUAL|QUALIFIED|MID QUAL|NON QUAL)\b/i.test(row.originalDescription));

  if (interchangeRows.length > 0 && networkRows.length > 0 && discRows.length > 0 && uniqueDiscRates.size === 1 && !hasTieredLabels) {
    return {
      pricingModel: "interchange_plus",
      confidence: "high",
      analysisStatus: "ic_plus_ready",
      evidence: [
        "Separate interchange rows are visible.",
        "Card-brand/network rows are itemized separately.",
        `Processor DISC markup is uniform at ${discRows[0]?.rate ?? "unknown"} across visible card sections.`,
      ],
    };
  }

  const inherited = {
    pricingModel: fallback.pricingModel,
    confidence: confidenceFromParser(fallback.confidence),
    evidence: fallback.notes?.length ? fallback.notes : ["Pricing model inherited from existing parser inference."],
  };
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

function hiddenPctMarkupRows(rows: FiservFeeAnalysisRow[]): FiservFeeAnalysisV2["processorMarkupAnalysis"]["hiddenPctMarkupRows"] {
  return rows
    .filter((row) => {
      const description = normalizeFiservFeeReferenceText(row.description);
      return (
        row.feeType === "processor_pct_markup" &&
        row.rate !== null &&
        row.volumeBasis !== null &&
        !/\b(DISC|SALES DISCOUNT)\b/.test(description)
      );
    })
    .map((row) => ({
      description: row.description,
      rate: row.rate ?? 0,
      amount: row.amount,
      volumeBasis: row.volumeBasis,
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

function finding(params: Omit<FiservFeeAnalysisFinding, "monthlyCost" | "annualEstimate" | "savingsEstimate"> & {
  monthlyCost?: number | null;
  savingsEstimate?: FiservFeeAnalysisFinding["savingsEstimate"];
}): FiservFeeAnalysisFinding {
  const monthlyCost = params.monthlyCost ?? params.amount;
  return {
    ...params,
    monthlyCost,
    annualEstimate: annualize(monthlyCost),
    savingsEstimate: params.savingsEstimate ?? null,
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
  const junkFeeTotal = round2(rows.filter((row) => normalizeFiservFeeReferenceText(row.description) === "REGULATORY PRODUCT").reduce((sum, row) => sum + row.amount, 0));
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

function findingsFor(analysis: Omit<FiservFeeAnalysisV2, "findings" | "savingsSummary">): FiservFeeAnalysisFinding[] {
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
  if (analysis.processorMarkupAnalysis.perItemStacking.detected) {
    findings.push(finding({
      kind: "processor_per_item_stacking",
      severity: "high",
      title: "Multiple processor per-item fees are stacked",
      amount: analysis.processorMarkupAnalysis.processorPerItemTotal,
      evidence: analysis.processorMarkupAnalysis.perItemStacking.fees,
      action: "negotiate_processor_rate",
      savingsEstimate:
        analysis.processorMarkupAnalysis.processorPerItemTotal === null
          ? null
          : {
              low: round2(analysis.processorMarkupAnalysis.processorPerItemTotal * 12 * 0.25),
              high: round2(analysis.processorMarkupAnalysis.processorPerItemTotal * 12 * 0.5),
              basis: "Negotiable processor per-item fees; savings range assumes 25%-50% reduction.",
            },
    }));
  }
  if ((analysis.processorMarkupAnalysis.junkFeeTotal ?? 0) > 0) {
    findings.push(finding({
      kind: "junk_fee",
      severity: "warning",
      title: "Regulatory Product fee is processor-controlled",
      amount: analysis.processorMarkupAnalysis.junkFeeTotal,
      evidence: ["No network reference rate applies to the Regulatory Product fee."],
      action: "negotiate_processor_rate",
    }));
  }
  for (const row of analysis.rows.filter((candidate) => candidate.feeType === "suspicious_pass_through_like_fee")) {
    findings.push(finding({
      kind: "suspicious_uniform_rate",
      severity: "high",
      title: `${row.description} is charged at the same rate as similar rows across independent networks`,
      amount: row.amount,
      evidence: [row.reason, row.evidenceLine],
      action: "request_pass_through_documentation",
      savingsEstimate: {
        low: 0,
        high: round2(row.amount * 12),
        basis: "Potential savings equals annualized amount if processor cannot document this as a legitimate pass-through.",
      },
    }));
  }
  for (const row of analysis.rows.filter((candidate) => candidate.feeType === "compliance_penalty")) {
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
      savingsEstimate: {
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
      savingsEstimate: {
        low: 0,
        high: round2(row.amount * 12),
        basis: "Potential savings equals annualized amount if the merchant does not actively use this service.",
      },
    }));
  }
  for (const row of analysis.processorMarkupAnalysis.hiddenPctMarkupRows) {
    findings.push(finding({
      kind: "hidden_percentage_markup",
      severity: "warning",
      title: `${row.description} adds hidden percentage markup`,
      amount: row.amount,
      evidence: [
        `This percentage-of-volume fee is separate from the visible sales discount spread. Rate: ${row.rate}.`,
        `Volume basis: ${row.volumeBasis ?? "not shown"}.`,
      ],
      action: "negotiate_processor_rate",
      savingsEstimate: {
        low: round2(row.amount * 12 * 0.25),
        high: round2(row.amount * 12),
        basis: "Savings range assumes this hidden markup is reduced or removed.",
      },
    }));
  }
  for (const row of analysis.rows.filter((candidate) => /TRANSACTION INTEGRITY|MISUSE OF AUTHORIZATION|NON QUAL/i.test(candidate.description))) {
    findings.push(finding({
      kind: "penalty_or_configuration_fee",
      severity: "warning",
      title: `${row.description} may be avoidable through configuration or qualification fixes`,
      amount: row.amount,
      evidence: [row.evidenceLine],
      action: "fix_terminal_or_gateway_configuration",
      savingsEstimate: {
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
  return findings;
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

function savingsSummary(findings: FiservFeeAnalysisFinding[]): FiservFeeAnalysisV2["savingsSummary"] {
  const savings = findings
    .map((item) => item.savingsEstimate)
    .filter((item): item is NonNullable<FiservFeeAnalysisFinding["savingsEstimate"]> => item !== null);
  return {
    annualLow: round2(savings.reduce((sum, item) => sum + item.low, 0)),
    annualHigh: round2(savings.reduce((sum, item) => sum + item.high, 0)),
    opportunities: savings.length,
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
  const withoutFindings = {
    version: "2.0" as const,
    normalization: input.normalizationSummary,
    notices: input.notices ?? [],
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
    processorMarkupAnalysis: processorMarkupAnalysis(rows, pricingModel, input.totalVolume, input.transactionCount),
    interchangeReconciliation: buildInterchangeReconciliation(rows, input.interchangeReconciliationBasis),
    reconciliation: {
      basisTotal,
      rowTotal,
      residual: round2(Math.abs(rowTotal - basisTotal)),
      status: Math.abs(rowTotal - basisTotal) <= 1 ? ("pass" as const) : ("warning" as const),
    },
  };
  const findings = findingsFor(withoutFindings);
  return {
    ...withoutFindings,
    findings,
    savingsSummary: savingsSummary(findings),
  };
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
