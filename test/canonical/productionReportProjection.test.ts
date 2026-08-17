import { describe, expect, it } from "vitest";
import { admitMerchantAttentionAiInterpretation } from "../../src/canonical/merchantAttentionAiInterpretation.js";
import { buildProductionReportProjection } from "../../src/canonical/productionReportProjection.js";
import { validateProductionReportProjection } from "../../src/canonical/productionReportProjectionValidation.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { package3Analysis, validPackage3Interpretation } from "./package3TestFixture.js";

describe("Package 3 production report projection", () => {
  it("projects one completed report layout for a clean statement without fake findings", () => {
    const report = buildProductionReportProjection(package3Analysis([
      { label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" },
    ]));
    expect(report.experience).toBe("analysis_completed");
    expect(report.recovery).toBeNull();
    expect(report.report).toMatchObject({
      priorityFindings: { status: "omitted", items: [] },
      openQuestions: { status: "omitted", items: [] },
      nextActions: { status: "guidance", modules: [] },
      continuation: { status: "planned_unavailable", callToAction: { implemented: false } },
      saveReport: { status: "planned_unavailable" },
    });
    expect(report.report!.snapshot).not.toHaveProperty("effectiveRate");
    expect(report.report!.snapshot).not.toHaveProperty("transactionCount");
  });

  it("projects findings, questions, all charges, and action modules only from accepted Merchant Attention state", () => {
    const report = buildProductionReportProjection(package3Analysis([
      { label: "PROCESSOR MARKUP", amount: 100 },
      { label: "ADDITIONAL FEES", amount: 9.48 },
      { label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" },
    ]));
    expect(report.experience).toBe("analysis_available_with_open_questions");
    expect(report.report!.priorityFindings.items.length).toBeGreaterThan(0);
    expect(report.report!.openQuestions.items.every((item) => item.amountIsSavings === false)).toBe(true);
    expect(new Set(report.report!.allCharges.rows.map((row) => row.disposition))).toEqual(new Set(["attention", "unresolved", "routine"]));
    expect(report.report!.nextActions.status).toBe("shown");
  });

  it("keeps unavailable comparison independent from successful analysis and never creates benchmark savings", () => {
    const report = buildProductionReportProjection(package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]));
    expect(report.experience).not.toBe("unable_to_complete");
    expect(report.report!.hero.benchmark).toBeNull();
    expect(report.report!.hero.benchmarkUnavailableMessage).toMatch(/still available/i);
    expect(JSON.stringify(report.report!.hero)).not.toMatch(/benchmark.{0,40}(saving|overpay)|(saving|overpay).{0,40}benchmark/i);
  });

  it("shows only a qualified reference range and leaves the effective rate in the hero", () => {
    const analysis = package3Analysis([{ label: "VISA INTERCHANGE", amount: 500, section: "Interchange Charges" }]);
    analysis.customerState.rateComparison = qualifiedComparison(analysis, "within_reference");
    const report = buildProductionReportProjection(analysis);
    expect(report.report!.hero).toMatchObject({
      effectiveRate: "0.025000",
      benchmark: { range: { low: "0.021000", high: "0.026000" }, position: "within_reference" },
      benchmarkUnavailableMessage: null,
    });
  });

  it.each(["within_reference", "above_reference"] as const)("keeps accepted findings independent when the qualified comparison is %s", (position) => {
    const analysis = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 500 }]);
    analysis.customerState.rateComparison = qualifiedComparison(analysis, position);
    const report = buildProductionReportProjection(analysis);
    expect(report.report!.hero.benchmark?.position).toBe(position);
    expect(report.report!.priorityFindings.items.length).toBeGreaterThan(0);
    expect(report.report!.openQuestions.items.every((item) => item.amountIsSavings === false)).toBe(true);
  });

  it("turns canonical business confirmation into an open question without making the report fail", () => {
    const analysis = package3Analysis([{ label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" }]);
    analysis.businessQualification.status = "confirmation_required";
    analysis.businessQualification.confirmationRequirement = {
      reasonCode: "business_channel_confirmation_required",
      prompt: "Confirm whether most transactions are card-present or card-not-present.",
      allowedSegmentIds: ["restaurant_food_service"],
      allowedRiskClasses: ["standard"],
      allowedChannels: ["card_present", "card_not_present"],
    };
    const report = buildProductionReportProjection(analysis);
    expect(report.experience).toBe("analysis_available_with_open_questions");
    expect(report.report!.openQuestions.items).toContainEqual(expect.objectContaining({ id: "business_qualification_confirmation", amountIsSavings: false }));
  });

  it("degrades an invalid benchmark subsection without erasing safe statement results", () => {
    const analysis = package3Analysis([{ label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" }]);
    analysis.customerState.rateComparison = qualifiedComparison(analysis, "above_reference");
    analysis.customerState.rateComparison.benchmarkRef!.range = { low: "0.030000", high: "0.020000" };
    const report = buildProductionReportProjection(analysis);
    expect(report.experience).toBe("analysis_completed");
    expect(report.report!.hero.benchmark).toBeNull();
    expect(report.report!.hero.effectiveRate).toBe(analysis.financialFacts.rateRevealCalculatedAllInRate.value);
  });

  it("uses admitted AI wording as presentation only", () => {
    const analysis = package3Analysis([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const authoritativeBefore = structuredClone({ financialFacts: analysis.financialFacts, opportunity: analysis.opportunityEngine });
    const admission = admitMerchantAttentionAiInterpretation({ model: analysis.merchantAttention, output: validPackage3Interpretation(analysis.merchantAttention) });
    expect(admission.admitted).toBe(true);
    analysis.merchantAttention = admission.model;
    const report = buildProductionReportProjection(analysis);
    expect(report.report!.merchantLanguage).toEqual({ source: "ai_assisted", degraded: false });
    expect({ financialFacts: analysis.financialFacts, opportunity: analysis.opportunityEngine }).toEqual(authoritativeBefore);
  });

  it("exposes partial composition honestly without zero categories or double-counting", () => {
    const analysis = package3Analysis([
      { label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" },
      { label: "PROCESSOR MARKUP", amount: 20 },
    ]);
    analysis.feeLedger.status = "partial";
    analysis.financialFacts.totalFees.value = { amountMinor: 11000, currency: "USD" };
    const report = buildProductionReportProjection(analysis);
    expect(report.report!.composition).toMatchObject({ status: "partial", representedTotal: { amountMinor: 2000 }, difference: { amountMinor: 9000 }, reconciled: false });
    expect(report.report!.composition.categories.every((category) => category.amount.amountMinor !== 0)).toBe(true);
  });

  it("uses recovery only when core facts are unsafe and omits metrics and continuation", () => {
    const analysis = package3Analysis([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]);
    analysis.financialFacts.processedSales.status = "unavailable";
    analysis.financialFacts.processedSales.value = null;
    const projection = buildProductionReportProjection(analysis);
    expect(projection).toMatchObject({ experience: "unable_to_complete", report: null });
    expect(projection.recovery).not.toBeNull();
    expect(JSON.stringify(projection)).not.toMatch(/Compare 3–6 more months|effectiveRate|processedSales|totalFees/);
  });

  it("rejects internal customer language and implemented planned capabilities", () => {
    const projection = buildProductionReportProjection(package3Analysis([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]));
    projection.report!.methodology.disclosures.push("Package 3 provider prompt policy");
    projection.report!.saveReport.capabilities[0]!.implemented = true as false;
    const validation = validateProductionReportProjection(projection);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/internal language|planned capabilities/i);
  });

  it("uses customer-preferred vocabulary in every customer-facing field", () => {
    const projection = buildProductionReportProjection(package3Analysis([{ label: "ADDITIONAL FEES", amount: 9.48 }]));
    const serialized = JSON.stringify(projection);
    expect(serialized).toContain("Ask for a breakdown");
    expect(serialized).not.toMatch(/itemization|evidence boundary|service-use review|fee inventory|Questions to Resolve|Package [A-Z0-9]/i);
  });
});

function qualifiedComparison(
  analysis: CanonicalStatementAnalysis,
  position: "below_reference" | "within_reference" | "above_reference",
): CanonicalStatementAnalysis["customerState"]["rateComparison"] {
  const evidenceRefs = analysis.evidence.slice(0, 1).map((record) => record.id);
  return {
    policyVersion: "canonical_customer_benchmark_policy_v1",
    status: "qualified",
    position,
    benchmarkRef: {
      referenceId: "rr_restaurant_reference_2026",
      displayLabel: "RateReveal restaurant reference range",
      referenceKind: "ratereveal_reference_range",
      version: "2026.1",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      applicableProcessor: "fiserv",
      applicableBusinessType: "restaurant_food_service",
      applicableChannel: "card_present",
      applicableCardEnvironment: null,
      range: { low: "0.021000", high: "0.026000" },
      limitations: ["Context only."],
      evidenceRefs,
      qualified: true,
      opportunityApproved: false,
      aiSourced: false,
    },
    calculationRef: "calc_reference_position",
    evidenceRefs,
    reasonCodes: ["qualified_reference_applied"],
    aiSourced: false,
  };
}
