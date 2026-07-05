import { describe, expect, it } from "vitest";
import { resolveBenchmarkCategory } from "../src/benchmarkCategoryResolution.js";

describe("benchmark category resolution", () => {
  it("resolves the phase-two merchant category test cases", () => {
    expect(resolveBenchmarkCategory({ merchantName: "EL NUEVO TEQUILA MEXICAN" })).toMatchObject({
      categoryId: "restaurant",
      confidence: "high",
      source: "deterministic",
    });
    expect(resolveBenchmarkCategory({ merchantName: "JAMAICA FISH MARKET, INC" })).toMatchObject({
      categoryId: "grocery",
      confidence: "high",
      source: "deterministic",
    });
    expect(resolveBenchmarkCategory({ merchantName: "ANIMAL DELTA HOUSE LLC" })).toMatchObject({
      categoryId: "default",
      confidence: "low",
      source: "default",
    });
    expect(resolveBenchmarkCategory({ merchantName: "XPRESS FIX" })).toMatchObject({
      categoryId: "auto_repair",
      confidence: "medium",
      source: "deterministic",
    });
    expect(resolveBenchmarkCategory({ merchantName: "PEPES MEXICAN RESTURANT" })).toMatchObject({
      categoryId: "restaurant",
      confidence: "high",
      source: "deterministic",
    });
    expect(resolveBenchmarkCategory({ merchantName: "VORTAX" })).toMatchObject({
      categoryId: "default",
      confidence: "low",
      source: "default",
    });
  });

  it("uses a specific user-selected business type before statement evidence", () => {
    const result = resolveBenchmarkCategory({
      merchantName: "Downtown CBD Vape Shop",
      userSelectedBusinessType: "restaurant_food_beverage",
    });

    expect(result).toMatchObject({
      categoryId: "restaurant",
      source: "user_selected",
      confidence: "high",
      userSelectedBusinessType: "restaurant_food_beverage",
      userSelectedMappedCategoryId: "restaurant",
      deterministicCategoryId: "high_risk_retail",
    });
    expect(result.warning).toContain("User-selected business type maps to Restaurant / Food Service");
  });

  it("does not let the generic Other business type erase statement evidence", () => {
    const result = resolveBenchmarkCategory({
      merchantName: "El Nuevo Tequila Mexican",
      userSelectedBusinessType: "other",
    });

    expect(result).toMatchObject({
      categoryId: "restaurant",
      source: "deterministic",
      matchedKeyword: "tequila",
      userSelectedBusinessType: "other",
      userSelectedMappedCategoryId: null,
    });
    expect(result.warning).toContain("not specific enough");
  });

  it("uses AI only when deterministic inference falls back to default", () => {
    const result = resolveBenchmarkCategory({
      merchantName: "Animal Delta House",
      aiSuggestion: {
        categoryId: "ecommerce",
        confidence: "medium",
        evidence: ["Statement has mostly card-not-present indicators."],
      },
    });

    expect(result).toMatchObject({
      categoryId: "ecommerce",
      source: "ai_inferred",
      confidence: "medium",
      deterministicCategoryId: "default",
      aiSuggestedCategoryId: "ecommerce",
    });
  });

  it("keeps deterministic statement evidence ahead of AI suggestions", () => {
    const result = resolveBenchmarkCategory({
      merchantName: "Pepe's Mexican Restaurant",
      aiSuggestion: {
        categoryId: "retail",
        confidence: "medium",
        evidence: ["AI guessed retail from generic merchant text."],
      },
    });

    expect(result).toMatchObject({
      categoryId: "restaurant",
      source: "deterministic",
      aiSuggestedCategoryId: "retail",
    });
    expect(result.alternatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: "retail",
          source: "ai_inferred",
        }),
      ]),
    );
  });
});
