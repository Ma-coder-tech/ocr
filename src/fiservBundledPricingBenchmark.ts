import fs from "node:fs";
import path from "node:path";

import { normalizeFiservFeeReferenceText } from "./fiservFeeReference.js";
import { round2, round8 } from "./reconciliation.js";

type RateRange = {
  low: number;
  high: number;
};

type BenchmarkCategory = {
  label: string;
  mccs: number[];
  effective_rate_benchmark: RateRange;
  interchange_ranges: Record<string, RateRange>;
};

type VolumeTier = {
  annual_volume_max: number | null;
  benchmark_adjustment: number;
  competitive_spread: number;
  competitive_per_auth: number;
};

type FiservBundledPricingBenchmarkReference = {
  document_type: string;
  version: string;
  last_verified: string;
  default_category: string;
  network_fee_range: RateRange;
  categories: Record<string, BenchmarkCategory>;
  volume_tier_adjustments: Record<string, VolumeTier>;
  monthly_fee_range: RateRange;
  settlement_context: {
    label: string;
    note: string;
    sources: string[];
  };
  sources: {
    interchange_ranges: string;
    effective_rate_benchmarks: string;
    confidence: string;
  };
};

export type FiservBundledPricingBenchmarkRow = {
  cardTypeSection: string | null;
  description: string;
  amount: number;
  volumeBasis: number | null;
  count: number | null;
  rate: number | null;
  feeType: string;
  evidenceLine: string;
};

export type FiservBundledPricingBenchmarkAnalysis = {
  status: "not_applicable" | "ready" | "not_enough_detail";
  pricingModel: string;
  benchmarkMode: "fee_level_proof" | "bundled_estimate";
  businessCategory: {
    id: string;
    label: string;
    source: "merchant_name_inference" | "default_unknown" | "not_applicable";
    confidence: "high" | "medium" | "low";
  };
  volumeTier: string | null;
  effectiveRate: number | null;
  adjustedBenchmarkRate: RateRange | null;
  estimatedPassThroughCost: RateRange | null;
  estimatedProcessorMargin: RateRange | null;
  estimatedCompetitiveCost: RateRange | null;
  estimatedMonthlySavings: RateRange | null;
  estimatedAnnualSavings: RateRange | null;
  confidence: "medium" | "low";
  cardMix: Array<{
    cardType: string;
    volume: number;
    pctOfVolume: number | null;
    estimatedInterchangeCost: RateRange;
    sourceRows: number;
  }>;
  unusedTierRows: number;
  billbackRisk: boolean;
  assumptions: string[];
  warnings: string[];
  sources: string[];
};

let cachedReference: FiservBundledPricingBenchmarkReference | null = null;

function loadReference(): FiservBundledPricingBenchmarkReference {
  if (cachedReference) return cachedReference;
  const referencePath = path.resolve(process.cwd(), "data", "fiserv-fee-analysis", "fiserv_bundled_pricing_benchmarks.json");
  const parsed = JSON.parse(fs.readFileSync(referencePath, "utf8")) as FiservBundledPricingBenchmarkReference;
  cachedReference = parsed;
  return parsed;
}

function emptyAnalysis(
  pricingModel: string,
  status: FiservBundledPricingBenchmarkAnalysis["status"],
  benchmarkMode: FiservBundledPricingBenchmarkAnalysis["benchmarkMode"] = "fee_level_proof",
): FiservBundledPricingBenchmarkAnalysis {
  return {
    status,
    pricingModel,
    benchmarkMode,
    businessCategory: {
      id: "not_applicable",
      label: "Not applicable",
      source: "not_applicable",
      confidence: "low",
    },
    volumeTier: null,
    effectiveRate: null,
    adjustedBenchmarkRate: null,
    estimatedPassThroughCost: null,
    estimatedProcessorMargin: null,
    estimatedCompetitiveCost: null,
    estimatedMonthlySavings: null,
    estimatedAnnualSavings: null,
    confidence: "low",
    cardMix: [],
    unusedTierRows: 0,
    billbackRisk: false,
    assumptions: [],
    warnings: [],
    sources: [],
  };
}

function isBundledPricingModel(pricingModel: string): boolean {
  return [
    "flat_discount_pricing",
    "flat_rate",
    "flat_rate_bundled",
    "single_tier_qualified",
    "tiered_pricing",
  ].includes(pricingModel);
}

function isDiscountRow(row: FiservBundledPricingBenchmarkRow): boolean {
  const description = normalizeFiservFeeReferenceText(row.description);
  return /\b(QUAL DISC|MQUAL DISC|NQUAL DISC|DISC\s+\d+|SALES DISCOUNT|NON SWIPED DISCOUNT)\b/.test(description);
}

function cardTypeFor(row: FiservBundledPricingBenchmarkRow): string {
  const text = normalizeFiservFeeReferenceText(`${row.cardTypeSection ?? ""} ${row.description}`);
  const debit = /\b(OFLN DB|DEBIT|DB)\b/.test(text);
  if (text.includes("AMEX") || text.includes("AMERICAN EXPRESS") || text.includes("AXP")) return "amex";
  if (text.includes("DISCOVER") || text.includes("DCVR") || text.includes("DSCV")) return "discover";
  if (text.includes("MASTERCARD") || /\bMC\b/.test(text)) return debit ? "mastercard_debit" : "mastercard_credit";
  if (text.includes("VISA") || /\bVS\b/.test(text)) return debit ? "visa_debit" : "visa_credit";
  return "unknown";
}

function inferCategory(merchantName: string | null | undefined, reference: FiservBundledPricingBenchmarkReference) {
  const normalized = normalizeFiservFeeReferenceText(merchantName);
  if (/\b(FISH|SEAFOOD|MARKET|GROCERY|FOOD|DELI|MEAT|PRODUCE)\b/.test(normalized)) {
    const category = reference.categories.grocery_specialty_food;
    if (category) {
      return {
        id: "grocery_specialty_food",
        category,
        source: "merchant_name_inference" as const,
        confidence: "medium" as const,
      };
    }
  }
  if (/\b(RESTAURANT|CAFE|PIZZA|GRILL|BAR|TAVERN|DINER|KITCHEN)\b/.test(normalized)) {
    const category = reference.categories.restaurant;
    if (category) {
      return {
        id: "restaurant",
        category,
        source: "merchant_name_inference" as const,
        confidence: "medium" as const,
      };
    }
  }
  return {
    id: "unknown",
    category: reference.categories.unknown ?? reference.categories[reference.default_category]!,
    source: "default_unknown" as const,
    confidence: "low" as const,
  };
}

function volumeTierFor(annualVolume: number, reference: FiservBundledPricingBenchmarkReference): { id: string; tier: VolumeTier } {
  for (const [id, tier] of Object.entries(reference.volume_tier_adjustments)) {
    if (tier.annual_volume_max === null || annualVolume <= tier.annual_volume_max) return { id, tier };
  }
  return { id: "over_10m", tier: reference.volume_tier_adjustments.over_10m! };
}

function addRanges(left: RateRange, right: RateRange): RateRange {
  return { low: round2(left.low + right.low), high: round2(left.high + right.high) };
}

function multiplyRange(value: number, range: RateRange): RateRange {
  return { low: round2(value * range.low), high: round2(value * range.high) };
}

function subtractRange(current: number, cost: RateRange): RateRange {
  return {
    low: round2(Math.max(0, current - cost.high)),
    high: round2(Math.max(0, current - cost.low)),
  };
}

function positiveRange(range: RateRange): RateRange {
  return { low: Math.max(0, round2(range.low)), high: Math.max(0, round2(range.high)) };
}

function adjustedBenchmark(category: BenchmarkCategory, tier: VolumeTier): RateRange {
  return {
    low: round8(Math.max(0, category.effective_rate_benchmark.low + tier.benchmark_adjustment)),
    high: round8(Math.max(0, category.effective_rate_benchmark.high + tier.benchmark_adjustment)),
  };
}

function benchmarkForChannel(category: BenchmarkCategory, tier: VolumeTier, merchantChannel: string | null | undefined): RateRange {
  if (merchantChannel === "card_not_present" || merchantChannel === "mixed") return { low: 0.025, high: 0.032 };
  return adjustedBenchmark(category, tier);
}

function interchangeRangeForChannel(rateRange: RateRange, merchantChannel: string | null | undefined): RateRange {
  if (merchantChannel === "card_not_present" || merchantChannel === "mixed") {
    return { low: round8(rateRange.low + 0.002), high: round8(rateRange.high + 0.004) };
  }
  return rateRange;
}

function competitiveSpreadForChannel(tier: VolumeTier, merchantChannel: string | null | undefined): RateRange {
  if (merchantChannel === "card_not_present" || merchantChannel === "mixed") return { low: 0.0015, high: 0.0025 };
  return { low: tier.competitive_spread, high: tier.competitive_spread };
}

function competitivePerAuthForChannel(tier: VolumeTier, merchantChannel: string | null | undefined): RateRange {
  if (merchantChannel === "card_not_present" || merchantChannel === "mixed") return { low: 0.1, high: 0.12 };
  return { low: tier.competitive_per_auth, high: tier.competitive_per_auth };
}

function rowVolume(row: FiservBundledPricingBenchmarkRow): number | null {
  if (row.volumeBasis !== null && row.volumeBasis > 0) return row.volumeBasis;
  if (row.rate !== null && row.rate > 0 && row.amount > 0) return round2(row.amount / row.rate);
  return null;
}

function uniqueDiscountRates(rows: FiservBundledPricingBenchmarkRow[]): number[] {
  return [...new Set(rows.filter((row) => row.rate !== null && row.rate > 0).map((row) => Number((row.rate ?? 0).toFixed(8))))];
}

export function buildFiservBundledPricingBenchmarkAnalysis(input: {
  pricingModel: string;
  rows: FiservBundledPricingBenchmarkRow[];
  totalVolume: number;
  totalFees: number;
  transactionCount: number | null;
  merchantName?: string | null;
  merchantChannel?: "card_present" | "card_not_present" | "mixed";
}): FiservBundledPricingBenchmarkAnalysis {
  if (!isBundledPricingModel(input.pricingModel)) return emptyAnalysis(input.pricingModel, "not_applicable");
  if (input.totalVolume <= 0 || input.totalFees <= 0) return emptyAnalysis(input.pricingModel, "not_enough_detail", "bundled_estimate");

  const reference = loadReference();
  const category = inferCategory(input.merchantName, reference);
  const annualVolume = input.totalVolume * 12;
  const volumeTier = volumeTierFor(annualVolume, reference);
  const discountRows = input.rows.filter((row) => isDiscountRow(row) && row.amount > 0 && rowVolume(row) !== null);
  const zeroDiscountRows = input.rows.filter((row) => isDiscountRow(row) && row.amount === 0);
  const cardMixRows = discountRows.length > 0 ? discountRows : input.rows.filter((row) => rowVolume(row) !== null);

  if (cardMixRows.length === 0) return emptyAnalysis(input.pricingModel, "not_enough_detail", "bundled_estimate");

  const byCardType = new Map<string, { volume: number; sourceRows: number }>();
  for (const row of cardMixRows) {
    const cardType = cardTypeFor(row);
    const volume = rowVolume(row);
    if (volume === null) continue;
    const current = byCardType.get(cardType) ?? { volume: 0, sourceRows: 0 };
    byCardType.set(cardType, {
      volume: current.volume + volume,
      sourceRows: current.sourceRows + 1,
    });
  }

  const cardMix = [...byCardType.entries()].map(([cardType, item]) => {
    const rateRange = interchangeRangeForChannel(
      category.category.interchange_ranges[cardType] ?? category.category.interchange_ranges.unknown!,
      input.merchantChannel,
    );
    return {
      cardType,
      volume: round2(item.volume),
      pctOfVolume: input.totalVolume > 0 ? round2((item.volume / input.totalVolume) * 100) : null,
      estimatedInterchangeCost: multiplyRange(item.volume, rateRange),
      sourceRows: item.sourceRows,
    };
  });
  const estimatedInterchange = cardMix.reduce((sum, item) => addRanges(sum, item.estimatedInterchangeCost), { low: 0, high: 0 });
  const networkFees = multiplyRange(input.totalVolume, reference.network_fee_range);
  const estimatedPassThroughCost = addRanges(estimatedInterchange, networkFees);
  const competitiveSpreadRate = competitiveSpreadForChannel(volumeTier.tier, input.merchantChannel);
  const competitivePerAuthRate = competitivePerAuthForChannel(volumeTier.tier, input.merchantChannel);
  const competitiveSpread = multiplyRange(input.totalVolume, competitiveSpreadRate);
  const perAuthFees =
    input.transactionCount !== null && input.transactionCount > 0
      ? {
          low: round2(input.transactionCount * competitivePerAuthRate.low),
          high: round2(input.transactionCount * competitivePerAuthRate.high),
        }
      : { low: 0, high: 0 };
  const estimatedCompetitiveCost = addRanges(addRanges(addRanges(estimatedPassThroughCost, competitiveSpread), perAuthFees), reference.monthly_fee_range);
  const estimatedMonthlySavings = subtractRange(input.totalFees, estimatedCompetitiveCost);
  const estimatedAnnualSavings = {
    low: round2(estimatedMonthlySavings.low * 12),
    high: round2(estimatedMonthlySavings.high * 12),
  };
  const effectiveRate = round8(input.totalFees / input.totalVolume);
  const adjustedBenchmarkRate = benchmarkForChannel(category.category, volumeTier.tier, input.merchantChannel);
  const rates = uniqueDiscountRates(discountRows);
  const billbackRisk = discountRows.some((row) => normalizeFiservFeeReferenceText(row.description) === "QUAL DISC") && rates.length === 1;
  const aboveBenchmark = effectiveRate > adjustedBenchmarkRate.high + 0.005;

  return {
    status: "ready",
    pricingModel: input.pricingModel,
    benchmarkMode: "bundled_estimate",
    businessCategory: {
      id: category.id,
      label: category.category.label,
      source: category.source,
      confidence: category.confidence,
    },
    volumeTier: volumeTier.id,
    effectiveRate,
    adjustedBenchmarkRate,
    estimatedPassThroughCost: positiveRange(estimatedPassThroughCost),
    estimatedProcessorMargin: positiveRange(subtractRange(input.totalFees, estimatedPassThroughCost)),
    estimatedCompetitiveCost: positiveRange(estimatedCompetitiveCost),
    estimatedMonthlySavings: positiveRange(estimatedMonthlySavings),
    estimatedAnnualSavings: positiveRange(estimatedAnnualSavings),
    confidence: category.confidence === "medium" && input.transactionCount !== null && cardMix.length >= 2 ? "medium" : "low",
    cardMix,
    unusedTierRows: zeroDiscountRows.length,
    billbackRisk,
    assumptions: [
      "Interchange and network costs are not itemized on this statement, so this is benchmark modeling, not pass-through proof.",
      `Annual volume is estimated from this statement month at $${round2(annualVolume).toFixed(2)}.`,
      `Benchmark category: ${category.category.label}.`,
      `Competitive IC+ assumption: ${(competitiveSpreadRate.low * 100).toFixed(2)}%-${(competitiveSpreadRate.high * 100).toFixed(2)}% plus $${competitivePerAuthRate.low.toFixed(2)}-$${competitivePerAuthRate.high.toFixed(2)} per authorization and $${reference.monthly_fee_range.low.toFixed(2)}-$${reference.monthly_fee_range.high.toFixed(2)} monthly fees.`,
      ...(input.merchantChannel === "card_not_present" || input.merchantChannel === "mixed"
        ? ["Card-not-present benchmark adjustment applied: effective benchmark 2.50%-3.20%, interchange ranges +0.20%-0.40%, competitive spread 0.15%-0.25% plus $0.10-$0.12/auth."]
        : []),
      reference.settlement_context.note,
    ],
    warnings: [
      ...(category.source === "default_unknown" ? ["MCC/business category was not available; using a broad unknown-category benchmark range."] : []),
      ...(input.transactionCount === null ? ["Transaction count was not available; competitive per-authorization fees were not included."] : []),
      ...(billbackRisk ? ["Only qualified-tier discount rows are visible; if billback/enhanced billback applies, additional surcharges may appear separately."] : []),
      ...(zeroDiscountRows.length > 0 ? [`${zeroDiscountRows.length} zero-amount discount tier row(s) are visible, suggesting unused pricing tiers.`] : []),
      ...(aboveBenchmark ? ["Effective rate is materially above the adjusted benchmark range."] : []),
    ],
    sources: [
      reference.sources.interchange_ranges,
      reference.sources.effective_rate_benchmarks,
      reference.sources.confidence,
      ...reference.settlement_context.sources,
    ],
  };
}
