import fs from "node:fs";
import path from "node:path";
import { normalizeFiservFeeReferenceText } from "./fiservFeeReference.js";
import { round2, round8 } from "./reconciliation.js";

export type MccBenchmarkRange = { low: number; high: number };
export type MccBenchmarkCategory = {
  label: string;
  mccs: number[];
  keywords: string[];
  note?: string;
  effective_rate_benchmark: MccBenchmarkRange;
};
export type MccVolumeTierId = "under_100k" | "100k_500k" | "500k_2m" | "2m_10m" | "over_10m";
export type MccBenchmarkChannel = "card_present" | "card_not_present" | "high_risk";
export type MccBenchmarkPattern = {
  patterns: string[];
  recommendation?: string;
  cause?: string;
  fix?: string;
  avoidable?: boolean;
  negotiable?: boolean;
  network?: string;
  rate?: number | null;
};
export type MccBenchmarkReference = {
  document_type: string;
  version: string;
  mcc_categories: Record<string, MccBenchmarkCategory>;
  volume_tier_adjustments: {
    tiers: Record<MccVolumeTierId, { adjustment_pct: number; direction: "add" | "subtract" | "none"; note: string }>;
  };
  per_auth_benchmarks: Record<MccBenchmarkChannel, Record<MccVolumeTierId, { competitive_low: number; competitive_high: number }>>;
  junk_fee_patterns: { fees: MccBenchmarkPattern[] };
  penalty_fee_patterns: { fees: MccBenchmarkPattern[] };
};

export type MccCategoryMatch = {
  id: string;
  label: string;
  confidence: "high" | "medium" | "low";
  source: "merchant_name_keyword" | "high_risk_keyword" | "default";
  matchedKeyword: string | null;
  category: MccBenchmarkCategory;
};

let cachedReference: MccBenchmarkReference | null = null;

export function loadMccBenchmarkReference(): MccBenchmarkReference {
  if (cachedReference) return cachedReference;
  const referencePath = path.resolve(process.cwd(), "data", "fiserv-fee-analysis", "mcc_benchmark_reference.json");
  const parsed = JSON.parse(fs.readFileSync(referencePath, "utf8")) as MccBenchmarkReference;
  if (!parsed.mcc_categories || !parsed.per_auth_benchmarks || !parsed.junk_fee_patterns || !parsed.penalty_fee_patterns) {
    throw new Error("MCC benchmark reference is missing required benchmark sections.");
  }
  cachedReference = parsed;
  return parsed;
}

export function annualVolumeTier(annualVolume: number | null): MccVolumeTierId | null {
  if (annualVolume === null || annualVolume < 0 || !Number.isFinite(annualVolume)) return null;
  if (annualVolume < 100_000) return "under_100k";
  if (annualVolume < 500_000) return "100k_500k";
  if (annualVolume < 2_000_000) return "500k_2m";
  if (annualVolume < 10_000_000) return "2m_10m";
  return "over_10m";
}

function keywordMatchesMerchant(merchantName: string, keyword: string): boolean {
  const merchant = normalizeFiservFeeReferenceText(merchantName);
  const normalizedKeyword = normalizeFiservFeeReferenceText(keyword);
  if (!merchant || !normalizedKeyword) return false;
  return merchant.includes(normalizedKeyword);
}

export function inferMccBenchmarkCategory(
  merchantName: string | null | undefined,
  reference: MccBenchmarkReference = loadMccBenchmarkReference(),
): MccCategoryMatch {
  const name = String(merchantName ?? "");
  const highRisk = reference.mcc_categories.high_risk_retail;
  const highRiskKeyword = highRisk?.keywords.find((keyword) => keywordMatchesMerchant(name, keyword)) ?? null;
  if (highRisk && highRiskKeyword) {
    return {
      id: "high_risk_retail",
      label: highRisk.label,
      confidence: "high",
      source: "high_risk_keyword",
      matchedKeyword: highRiskKeyword,
      category: highRisk,
    };
  }

  for (const [id, category] of Object.entries(reference.mcc_categories)) {
    if (id === "high_risk_retail" || id === "ecommerce" || id === "default") continue;
    const matchedKeyword = category.keywords.find((keyword) => keywordMatchesMerchant(name, keyword)) ?? null;
    if (matchedKeyword) {
      return {
        id,
        label: category.label,
        confidence: "medium",
        source: "merchant_name_keyword",
        matchedKeyword,
        category,
      };
    }
  }

  const fallback = reference.mcc_categories.default;
  if (!fallback) throw new Error("MCC benchmark reference is missing default category.");
  return {
    id: "default",
    label: fallback.label,
    confidence: "low",
    source: "default",
    matchedKeyword: null,
    category: fallback,
  };
}

export function adjustedEffectiveRateBenchmark(params: {
  category: MccBenchmarkCategory;
  annualVolume: number | null;
  reference?: MccBenchmarkReference;
}): {
  tier: MccVolumeTierId | null;
  benchmark: MccBenchmarkRange;
  adjustment: number;
  adjustmentNote: string | null;
} {
  const reference = params.reference ?? loadMccBenchmarkReference();
  const tier = annualVolumeTier(params.annualVolume);
  const base = params.category.effective_rate_benchmark;
  const tierRule = tier ? reference.volume_tier_adjustments.tiers[tier] : null;
  const adjustment = tierRule?.direction === "add" ? tierRule.adjustment_pct : tierRule?.direction === "subtract" ? -tierRule.adjustment_pct : 0;
  return {
    tier,
    benchmark: {
      low: round8(Math.max(0, base.low + adjustment)),
      high: round8(Math.max(0, base.high + adjustment)),
    },
    adjustment,
    adjustmentNote: tierRule?.note ?? null,
  };
}

export function benchmarkChannelFor(params: {
  merchantChannel: "card_present" | "card_not_present" | "mixed";
  isHighRisk: boolean;
}): MccBenchmarkChannel {
  if (params.isHighRisk) return "high_risk";
  if (params.merchantChannel === "card_not_present") return "card_not_present";
  return "card_present";
}

export function perAuthBenchmarkFor(params: {
  annualVolume: number | null;
  merchantChannel: "card_present" | "card_not_present" | "mixed";
  isHighRisk: boolean;
  reference?: MccBenchmarkReference;
}): {
  tier: MccVolumeTierId | null;
  channel: MccBenchmarkChannel;
  benchmark: MccBenchmarkRange | null;
} {
  const reference = params.reference ?? loadMccBenchmarkReference();
  const tier = annualVolumeTier(params.annualVolume);
  const channel = benchmarkChannelFor(params);
  const entry = tier ? reference.per_auth_benchmarks[channel]?.[tier] : null;
  return {
    tier,
    channel,
    benchmark: entry ? { low: entry.competitive_low, high: entry.competitive_high } : null,
  };
}

export function matchBenchmarkPattern(description: string, patterns: MccBenchmarkPattern[]): MccBenchmarkPattern | null {
  const normalizedDescription = normalizeFiservFeeReferenceText(description);
  return (
    patterns.find((entry) =>
      entry.patterns.some((pattern) => {
        const normalizedPattern = normalizeFiservFeeReferenceText(pattern);
        return normalizedPattern.length > 0 && normalizedDescription.includes(normalizedPattern);
      }),
    ) ?? null
  );
}

export function estimateAnnualVolume(monthlyVolume: number, ytdGrossSales: number | null | undefined, statementPeriodStart: string): {
  annualVolume: number;
  source: "monthly_volume_x12" | "ytd_extrapolated";
  ytdExtrapolatedAnnualVolume: number | null;
} {
  const monthlyAnnualized = round2(monthlyVolume * 12);
  const month = Number(statementPeriodStart.slice(5, 7));
  const ytdExtrapolatedAnnualVolume =
    ytdGrossSales !== null && ytdGrossSales !== undefined && ytdGrossSales > 0 && Number.isFinite(month) && month > 0
      ? round2((ytdGrossSales / month) * 12)
      : null;
  return {
    annualVolume: monthlyAnnualized,
    source: "monthly_volume_x12",
    ytdExtrapolatedAnnualVolume,
  };
}

