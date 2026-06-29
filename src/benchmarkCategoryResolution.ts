import type { BusinessTypeId } from "./businessTypes.js";
import {
  inferMccBenchmarkCategory,
  loadMccBenchmarkReference,
  type MccBenchmarkCategory,
  type MccBenchmarkReference,
} from "./mccBenchmarkReference.js";

export type BenchmarkCategorySource = "user_selected" | "deterministic" | "ai_inferred" | "default";
export type BenchmarkCategoryConfidence = "high" | "medium" | "low";

export type BenchmarkCategoryAiSuggestion = {
  categoryId: string;
  confidence: BenchmarkCategoryConfidence;
  evidence: string[];
  alternatives?: Array<{ categoryId: string; confidence: BenchmarkCategoryConfidence; reason: string | null }>;
};

export type BenchmarkCategoryResolution = {
  categoryId: string;
  categoryLabel: string;
  benchmarkReferenceKey: string;
  category: MccBenchmarkCategory;
  source: BenchmarkCategorySource;
  confidence: BenchmarkCategoryConfidence;
  matchedKeyword: string | null;
  userSelectedBusinessType: BusinessTypeId | null;
  userSelectedMappedCategoryId: string | null;
  deterministicCategoryId: string;
  deterministicSource: "merchant_name_keyword" | "high_risk_keyword" | "default";
  aiSuggestedCategoryId: string | null;
  evidence: string[];
  alternatives: Array<{
    categoryId: string;
    categoryLabel: string;
    source: Exclude<BenchmarkCategorySource, "user_selected">;
    confidence: BenchmarkCategoryConfidence;
    reason: string | null;
  }>;
  warning: string | null;
};

const BUSINESS_TYPE_TO_MCC_CATEGORY: Partial<Record<BusinessTypeId, string>> = {
  restaurant_food_beverage: "restaurant",
  retail: "retail",
  ecommerce: "ecommerce",
  healthcare: "professional_services",
  hospitality: "lodging",
  high_risk: "high_risk_retail",
  professional_services: "professional_services",
};

function categoryLabel(reference: MccBenchmarkReference, categoryId: string): string {
  return reference.mcc_categories[categoryId]?.label ?? categoryId;
}

function categoryExists(reference: MccBenchmarkReference, categoryId: string | null | undefined): categoryId is string {
  return Boolean(categoryId && reference.mcc_categories[categoryId]);
}

function deterministicSourceToResolutionSource(source: BenchmarkCategoryResolution["deterministicSource"]): BenchmarkCategorySource {
  return source === "default" ? "default" : "deterministic";
}

function normalizeEvidence(values: string[]): string[] {
  return values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);
}

export function mccCategoryForBusinessType(businessType: BusinessTypeId | null | undefined): string | null {
  return businessType ? BUSINESS_TYPE_TO_MCC_CATEGORY[businessType] ?? null : null;
}

export function resolveBenchmarkCategory(params: {
  merchantName?: string | null;
  userSelectedBusinessType?: BusinessTypeId | null;
  aiSuggestion?: BenchmarkCategoryAiSuggestion | null;
  reference?: MccBenchmarkReference;
}): BenchmarkCategoryResolution {
  const reference = params.reference ?? loadMccBenchmarkReference();
  const deterministic = inferMccBenchmarkCategory(params.merchantName, reference);
  const userMappedCategoryId = mccCategoryForBusinessType(params.userSelectedBusinessType);
  const aiCategoryId = categoryExists(reference, params.aiSuggestion?.categoryId) ? params.aiSuggestion!.categoryId : null;
  const alternatives: BenchmarkCategoryResolution["alternatives"] = [];
  let warning: string | null = null;

  if (deterministic.id !== "default") {
    alternatives.push({
      categoryId: deterministic.id,
      categoryLabel: deterministic.label,
      source: "deterministic",
      confidence: deterministic.confidence,
      reason: deterministic.matchedKeyword ? `Merchant name matched "${deterministic.matchedKeyword}".` : null,
    });
  }

  if (aiCategoryId) {
    alternatives.push({
      categoryId: aiCategoryId,
      categoryLabel: categoryLabel(reference, aiCategoryId),
      source: "ai_inferred",
      confidence: params.aiSuggestion!.confidence,
      reason: normalizeEvidence(params.aiSuggestion!.evidence).join(" ") || null,
    });
  }

  if (params.userSelectedBusinessType && userMappedCategoryId && categoryExists(reference, userMappedCategoryId)) {
    if (deterministic.id !== "default" && deterministic.id !== userMappedCategoryId) {
      warning = `User-selected business type maps to ${categoryLabel(reference, userMappedCategoryId)}, while statement evidence points to ${deterministic.label}. User selection was used for benchmarking.`;
    }
    const category = reference.mcc_categories[userMappedCategoryId]!;
    return {
      categoryId: userMappedCategoryId,
      categoryLabel: category.label,
      benchmarkReferenceKey: userMappedCategoryId,
      category,
      source: "user_selected",
      confidence: "high",
      matchedKeyword: null,
      userSelectedBusinessType: params.userSelectedBusinessType,
      userSelectedMappedCategoryId: userMappedCategoryId,
      deterministicCategoryId: deterministic.id,
      deterministicSource: deterministic.source,
      aiSuggestedCategoryId: aiCategoryId,
      evidence: [`User-selected business type maps to ${category.label}.`],
      alternatives: alternatives.filter((entry) => entry.categoryId !== userMappedCategoryId),
      warning,
    };
  }

  if (deterministic.id !== "default") {
    const category = deterministic.category;
    return {
      categoryId: deterministic.id,
      categoryLabel: deterministic.label,
      benchmarkReferenceKey: deterministic.id,
      category,
      source: deterministicSourceToResolutionSource(deterministic.source),
      confidence: deterministic.confidence,
      matchedKeyword: deterministic.matchedKeyword,
      userSelectedBusinessType: params.userSelectedBusinessType ?? null,
      userSelectedMappedCategoryId: userMappedCategoryId,
      deterministicCategoryId: deterministic.id,
      deterministicSource: deterministic.source,
      aiSuggestedCategoryId: aiCategoryId,
      evidence: deterministic.matchedKeyword ? [`Merchant name matched "${deterministic.matchedKeyword}".`] : ["Statement evidence matched an MCC benchmark category."],
      alternatives: alternatives.filter((entry) => entry.categoryId !== deterministic.id),
      warning: params.userSelectedBusinessType && !userMappedCategoryId ? "Selected business type is not specific enough for an MCC benchmark override; statement evidence was used." : null,
    };
  }

  if (aiCategoryId) {
    const category = reference.mcc_categories[aiCategoryId]!;
    return {
      categoryId: aiCategoryId,
      categoryLabel: category.label,
      benchmarkReferenceKey: aiCategoryId,
      category,
      source: "ai_inferred",
      confidence: params.aiSuggestion!.confidence,
      matchedKeyword: null,
      userSelectedBusinessType: params.userSelectedBusinessType ?? null,
      userSelectedMappedCategoryId: userMappedCategoryId,
      deterministicCategoryId: deterministic.id,
      deterministicSource: deterministic.source,
      aiSuggestedCategoryId: aiCategoryId,
      evidence: normalizeEvidence(params.aiSuggestion!.evidence),
      alternatives: [
        ...alternatives.filter((entry) => entry.categoryId !== aiCategoryId),
        ...(params.aiSuggestion!.alternatives ?? [])
          .filter((entry) => categoryExists(reference, entry.categoryId))
          .map((entry) => ({
            categoryId: entry.categoryId,
            categoryLabel: categoryLabel(reference, entry.categoryId),
            source: "ai_inferred" as const,
            confidence: entry.confidence,
            reason: entry.reason,
          })),
      ],
      warning: null,
    };
  }

  const fallback = reference.mcc_categories.default;
  if (!fallback) throw new Error("MCC benchmark reference is missing default category.");
  return {
    categoryId: "default",
    categoryLabel: fallback.label,
    benchmarkReferenceKey: "default",
    category: fallback,
    source: "default",
    confidence: "low",
    matchedKeyword: null,
    userSelectedBusinessType: params.userSelectedBusinessType ?? null,
    userSelectedMappedCategoryId: userMappedCategoryId,
    deterministicCategoryId: deterministic.id,
    deterministicSource: deterministic.source,
    aiSuggestedCategoryId: aiCategoryId,
    evidence: ["No user-selected, deterministic, or AI-inferred MCC benchmark category was available."],
    alternatives,
    warning: params.userSelectedBusinessType && !userMappedCategoryId ? "Selected business type is not specific enough for an MCC benchmark override; default benchmark was used." : null,
  };
}
