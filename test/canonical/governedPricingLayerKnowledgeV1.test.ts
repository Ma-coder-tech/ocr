import { beforeAll, describe, expect, it } from "vitest";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import {
  GOVERNED_PRICING_LAYER_KNOWLEDGE_V1,
  governedPricingLayerRulesV1,
  type GovernedPricingLayerResolution,
} from "../../src/canonical/governedPricingLayerKnowledgeV1.js";
import {
  buildInternalAnalystFindingV1,
  canonicalFinancialTruthFingerprint,
} from "../../src/canonical/internalAnalystFindingV1.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { parsePdf } from "../../src/parser.js";

const PDF_ROOT = "test/fixtures/pdfs";
const US_CONTEXT = {
  geography: {
    value: "us",
    evidenceClass: "statement_local" as const,
    evidenceRefs: ["supported_fiserv_us_scope"],
  },
};

describe("governed pricing-layer knowledge Batch 1", () => {
  let priority: CanonicalStatementAnalysis;
  let basys: CanonicalStatementAnalysis;
  let nxgen: CanonicalStatementAnalysis;
  let paysafe: CanonicalStatementAnalysis;
  let zeroVolume: CanonicalStatementAnalysis;

  beforeAll(async () => {
    [priority, basys, nxgen, paysafe, zeroVolume] = await Promise.all([
      canonical("fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", "restaurant_food_beverage"),
      canonical("fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "restaurant_food_beverage"),
      canonical("fiserv_NXGEN_VORTAX_Sep_2022.pdf", "retail"),
      canonical("fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", "retail"),
      canonical("fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", "retail"),
    ]);
  }, 30_000);

  it("admits exactly the eight Product-adjudicated rules with audit and scope metadata", () => {
    const rules = governedPricingLayerRulesV1();

    expect(rules.map((rule) => rule.ruleId)).toEqual([
      "RR-B1-00",
      "RR-B1-01",
      "RR-B1-02",
      "RR-B1-03",
      "RR-B1-04",
      "RR-B1-05",
      "RR-B1-06",
      "RR-B1-07-PRIORITY-G8",
    ]);
    expect(rules.filter((rule) => rule.ruleId !== "RR-B1-03").every((rule) =>
      rule.lifecycle === "active" &&
      rule.admissionStatus === "admitted" &&
      rule.evidenceClass === "G1_product_domain_adjudication" &&
      rule.sourceRefs.length === 2 &&
      rule.sourceFingerprints.length === 2 &&
      rule.reviewedAt === "2026-09-06"
    )).toBe(true);
    expect(rules.find((rule) => rule.ruleId === "RR-B1-03")).toMatchObject({
      sourceRefs: expect.arrayContaining(["RateReveal_Governed_Conflict_Adjudication_FINAL_Product_Adjudicated.md"]),
      sourceFingerprints: expect.arrayContaining(["f457a284011d031820c8a8b099e26220bf9171149f3595e1c56ae4419c2d483d"]),
      reviewedAt: "2026-09-09",
    });
    expect(rules.find((rule) => rule.ruleId === "RR-B1-00")?.priority).toBe(0);
    expect(rules.find((rule) => rule.ruleId === "RR-B1-07-PRIORITY-G8")?.scope).toBe("statement_case_fact");
    expect(JSON.stringify(rules)).not.toMatch(/typicalLow|typicalHigh|elevatedAbove|market benchmark/i);
  });

  it("corrects the reviewed Priority G8 statement to flat 3.80% on its gross population without creating a Priority-wide rule", () => {
    const before = canonicalFinancialTruthFingerprint(priority);
    const result = resolve(priority);
    const qualificationRows = rowsMatching(priority, /\bQUAL DISC\b/).filter(material);

    expect(result.catalogVersion).toBe(GOVERNED_PRICING_LAYER_KNOWLEDGE_V1);
    expect(result.pricingModel).toMatchObject({
      state: "confirmed",
      model: "flat_rate",
      confidence: "high",
      observedRate: "0.038",
      relevantPopulation: "gross_sales_before_refunds:priority_g8_statement_case",
    });
    expect(qualificationRows).toHaveLength(6);
    expect(qualificationRows.every((row) => {
      const governed = result.rowsByFeeRowId[row.id]!;
      return governed.broaderEconomicCategory === "bundled_merchant_facing_pricing" &&
        governed.economicBeneficiary === null &&
        governed.assessmentBasis.value === "gross_sales_before_refunds" &&
        result.unrecoveredRefundCostByFeeRowId[row.id]?.state === "withheld";
    })).toBe(true);
    expect(result.rateCardIntelligenceFeeRowIds.length).toBeGreaterThan(0);
    expect(result.rules.find((rule) => rule.ruleId === "RR-B1-07-PRIORITY-G8")?.limitations.join(" ")).toContain("not reusable processor pricing knowledge");
    expect(canonicalFinancialTruthFingerprint(priority)).toBe(before);
  });

  it("uses qualification labels as populations and derives the model only from statement-local structure", () => {
    const tiered = resolve(paysafe);
    const interchangePlus = resolve(nxgen);
    const tieredQualificationRows = rowsMatching(paysafe, /\b(?:MQUAL|NQUAL|QUAL) DISC\b/).filter(material);
    const nxgenQualificationRows = rowsMatching(nxgen, /\b(?:MQUAL|NQUAL|QUAL) DISC\b/).filter(material);

    expect(tiered.pricingModel).toMatchObject({ state: "confirmed", model: "tiered_pricing" });
    expect(interchangePlus.pricingModel).toMatchObject({ state: "supported", model: "interchange_plus" });
    expect([...tieredQualificationRows, ...nxgenQualificationRows].length).toBeGreaterThan(0);
    for (const [analysis, result, rows] of [
      [paysafe, tiered, tieredQualificationRows],
      [nxgen, interchangePlus, nxgenQualificationRows],
    ] as const) {
      for (const row of rows) {
        const governed = result.rowsByFeeRowId[row.id]!;
        expect(governed.exactFeeIdentity).toBeNull();
        expect(governed.economicBeneficiary).toBeNull();
        expect(governed.matchedRuleRefs).toContain("RR-B1-01");
        expect(governed.limitations.join(" ")).toMatch(/does not by itself prove tiered pricing, processor markup/i);
        expect(analysis.feeLedger.rows.some((source) => source.id === row.id)).toBe(true);
      }
    }
  });

  it("classifies Sales Discount as merchant-facing acquiring-side pricing without calling it processor profit", () => {
    const result = resolve(basys);
    const salesDiscounts = rowsMatching(basys, /\bSALES DISCOUNT\b/).filter(material);

    expect(result.pricingModel.model).toBe("interchange_plus");
    expect(salesDiscounts.length).toBeGreaterThan(0);
    for (const row of salesDiscounts) {
      const governed = result.rowsByFeeRowId[row.id]!;
      expect(governed).toMatchObject({
        exactFeeIdentity: "sales_discount_acquiring_side_commercial_pricing_line",
        broaderEconomicCategory: "merchant_facing_acquiring_side_commercial_pricing",
        collector: "processor_or_acquirer",
        economicBeneficiary: null,
        merchantFacingPriceController: "acquiring_side_program",
        negotiability: "sometimes_negotiable",
      });
      expect(governed.limitations.join(" ")).toMatch(/not equated with processor profit|ultimate retention remains unresolved/i);
    }
  });

  it("keeps near-identical Amex labels statement-local and preserves competing interpretations", () => {
    const basysResult = resolve(basys);
    const nxgenResult = resolve(nxgen);
    const basysProgramCost = rowMatching(basys, /PROGRAM COST FEE\s*-?\s*AX/);
    const nxgenProgramFee = rowMatching(nxgen, /PROGRAM FEES?/);
    const commercial = basysResult.rowsByFeeRowId[basysProgramCost.id]!;
    const underlying = nxgenResult.rowsByFeeRowId[nxgenProgramFee.id]!;

    expect(commercial).toMatchObject({
      confidence: "LIKELY",
      amexInterpretation: "likely_acquiring_side_commercial_charge",
      economicBeneficiary: null,
      merchantFacingPriceController: "acquiring_side_program",
    });
    expect(commercial.competingInterpretations.length).toBeGreaterThan(0);
    expect(underlying).toMatchObject({
      exactFeeIdentity: "amex_program_cost",
      broaderEconomicCategory: "network_program_cost",
      confidence: "STRONG",
      amexInterpretation: "likely_underlying_program_cost",
      economicBeneficiary: "card_network",
      merchantFacingPriceController: "acquiring_side_program",
      amexProgramCostReconciliation: {
        state: "reconciles_within_rounding",
        differenceMinor: 1,
        canonicalFinancialMutationAllowed: false,
      },
    });
    expect(underlying.competingInterpretations.length).toBeGreaterThan(0);
  });

  it("treats a billed minimum as the period shortfall and leaves exact terms contract-dependent", () => {
    const billed = resolve(zeroVolume);
    const minimum = rowMatching(zeroVolume, /MIN(?:IMUM)? DISCOUNT/);
    const governed = billed.rowsByFeeRowId[minimum.id]!;
    const noBilledMinimum = resolve(nxgen);

    expect(governed).toMatchObject({
      exactFeeIdentity: "monthly_minimum_shortfall",
      broaderEconomicCategory: "merchant_facing_acquiring_side_commercial_pricing",
      minimumDiscount: {
        billedAmountIsShortfall: true,
        contractualMinimum: "merchant_document_required",
        qualifyingBasis: "merchant_document_required",
        waiverTerms: "merchant_document_required",
      },
    });
    expect(billed.minimumDiscount.noShortfallBilledThisPeriod).toBe(false);
    expect(noBilledMinimum.minimumDiscount).toMatchObject({
      noShortfallBilledThisPeriod: true,
      monthlyMinimumExistence: "not_determinable_from_absence",
    });
  });

  it("keeps gross/net basis line-specific and withholds refunded-volume cost until credits and offsets are excluded", () => {
    const analyses = [priority, basys, nxgen, paysafe];
    const all = analyses.map((analysis) => ({ analysis, result: resolve(analysis) }));
    const bases = all.flatMap(({ result }) => Object.values(result.rowsByFeeRowId).map((row) => row.assessmentBasis));
    const grossRows = all.flatMap(({ result }) => Object.values(result.rowsByFeeRowId)
      .filter((row) => row.assessmentBasis.value === "gross_sales_before_refunds")
      .map((row) => ({ row, refund: result.unrecoveredRefundCostByFeeRowId[row.feeRowId]! })));

    expect(bases.some((basis) => basis.value === "printed_line_population")).toBe(true);
    expect(new Set(bases.map((basis) => basis.printedBaseMinor).filter((value) => value !== null)).size).toBeGreaterThan(1);
    expect(bases.filter((basis) => basis.state === "not_applicable").every((basis) => basis.ruleRefs.length === 0)).toBe(true);
    expect(grossRows.length).toBeGreaterThan(0);
    expect(grossRows.every(({ refund }) =>
      refund.state === "withheld" &&
      refund.amountMinor === null &&
      refund.reasonCodes.includes("relevant_section_completeness_not_proven_for_offset_absence")
    )).toBe(true);
  });

  it("publishes the rules through the one authority and leaves canonical financial truth unchanged", () => {
    const before = canonicalFinancialTruthFingerprint(basys);
    const report = buildInternalAnalystFindingV1({
      analysis: basys,
      statementContext: US_CONTEXT,
      asOf: "2026-09-06",
    });
    const exactTrusted = report.findings.filter((finding) =>
      finding.sourceFeeRowId &&
      finding.exactFeeIdentity.value &&
      !finding.exactFeeIdentity.value.startsWith("amex_") &&
      finding.exactFeeIdentity.evidence.some((basis) => basis.refs.some((ref) => ref.startsWith("RR-B1-")))
    );

    expect(report.knowledgeAuthority).toMatchObject({
      pricingLayerCatalogVersion: GOVERNED_PRICING_LAYER_KNOWLEDGE_V1,
      admittedPricingLayerRuleRefs: governedPricingLayerRulesV1().map((rule) => rule.ruleId),
      legacyFeeCatalog: "retrieval_only_not_governing",
      feeKnowledgeResearchSystem: "research_transport_not_governing",
    });
    expect(exactTrusted.length).toBeGreaterThan(0);
    expect(exactTrusted.every((finding) => finding.competingInterpretations.length === 0)).toBe(true);
    expect(report.canonicalFinancialTruth).toMatchObject({
      beforeFingerprint: before,
      afterFingerprint: before,
      unchanged: true,
      mutationAllowed: false,
    });
    expect(canonicalFinancialTruthFingerprint(basys)).toBe(before);
  });
});

function resolve(analysis: CanonicalStatementAnalysis): GovernedPricingLayerResolution {
  return new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis,
    context: US_CONTEXT,
    asOf: "2026-09-06",
  }).pricingLayers;
}

async function canonical(file: string, businessType: "restaurant_food_beverage" | "retail"): Promise<CanonicalStatementAnalysis> {
  const document = await parsePdf(`${PDF_ROOT}/${file}`);
  return buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: file, businessType });
}

function rowsMatching(analysis: CanonicalStatementAnalysis, pattern: RegExp): CanonicalFeeRow[] {
  return analysis.feeLedger.rows.filter((row) => pattern.test(row.selectedLabel));
}

function rowMatching(analysis: CanonicalStatementAnalysis, pattern: RegExp): CanonicalFeeRow {
  const row = rowsMatching(analysis, pattern)[0];
  if (!row) throw new Error(`missing fixture row: ${pattern}`);
  return row;
}

function material(row: CanonicalFeeRow): boolean {
  return row.contributesToUniqueTotal && (row.selectedAmount?.amountMinor ?? 0) > 0;
}
