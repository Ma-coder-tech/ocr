import { describe, expect, it } from "vitest";
import { admitMerchantAttentionAiInterpretation } from "../../src/canonical/merchantAttentionAiInterpretation.js";
import { buildProductionReportProjection } from "../../src/canonical/productionReportProjection.js";
import {
  validateProductionReportProjection,
  validateProductionReportProjectionAgainstCanonical,
} from "../../src/canonical/productionReportProjectionValidation.js";
import type { CanonicalStatementAnalysis } from "../../src/canonical/types.js";
import { package3Analysis, validPackage3Interpretation } from "./package3TestFixture.js";

describe("Package 3 production report projection", () => {
  it("projects one completed report layout for a clean statement without fake findings", () => {
    const report = buildProductionReportProjection(completedAnalysis());
    expect(report.experience).toBe("analysis_completed");
    expect(report.recovery).toBeNull();
    expect(report.report).toMatchObject({
      priorityFindings: { status: "omitted", items: [] },
      openQuestions: { status: "omitted", items: [] },
      nextActions: { status: "omitted", modules: [] },
      monitoring: {
        status: "shown",
        guidance: [
          "Keep this statement as a baseline.",
          "Compare your effective rate and recurring charges on the next statement.",
          "Watch for new charges or changes to recurring charges.",
        ],
      },
      continuation: { status: "planned_unavailable", callToAction: { implemented: false } },
      saveReport: { status: "planned_unavailable" },
    });
    expect(report.report!.snapshot).not.toHaveProperty("effectiveRate");
    expect(report.report!.snapshot).not.toHaveProperty("transactionCount");
    expect(report.report!.allCharges.defaultView).toBe("all");
    expect(report.header).toMatchObject({ merchantName: "Fixture Merchant", statementScope: "One statement analyzed." });
    expect(JSON.stringify(report.report!.monitoring)).not.toMatch(/actionable|removable|negotiable|saving|overpay/i);
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

  it("projects the complete merchant-safe State Lab meaning without requiring canonical reconstruction", () => {
    const analysis = package3Analysis([
      { label: "PROCESSOR MARKUP", amount: 100 },
      { label: "ADDITIONAL FEES", amount: 9.48 },
    ]);
    analysis.businessQualification.risk.value = "standard";
    analysis.businessQualification.channel.value = "card_present";
    analysis.businessQualification.annualVolume.tier = "100k_500k";
    analysis.customerState.rateComparison = qualifiedComparison(analysis, "above_reference");
    const findingSource = analysis.merchantAttention.items[0]!;
    findingSource.opportunityLink = { componentRefs: ["opp_component_supported"], linkageOnly: true, moneyRecomputed: false };
    analysis.customerState.visibility.showDeterministicOpportunity = true;
    const opportunityPermission = analysis.customerState.permissions.find((item) => item.key === "deterministic_opportunity")!;
    opportunityPermission.permitted = true;
    opportunityPermission.reasonCodes = ["supported_opportunity_link"];
    opportunityPermission.limitationCodes = [];

    const report = buildProductionReportProjection(analysis).report!;
    expect(report.hero.benchmark).toMatchObject({
      context: {
        referenceSegment: "Restaurant / Food Service",
        risk: "Standard risk",
        processingChannel: "Card present",
        annualVolume: "$100,000–$500,000 annually",
        confidence: expect.stringMatching(/high|medium|low/),
      },
      limitations: ["Context only."],
    });
    expect(report.hero.benchmark).not.toHaveProperty("referenceId");

    const finding = report.priorityFindings.items[0]!;
    expect(finding).toMatchObject({
      attentionType: expect.any(String),
      priority: "high_priority",
      merchantTitle: expect.any(String),
      observedLabel: "PROCESSOR MARKUP",
      observedAmount: { amountMinor: 10000, currency: "USD" },
      category: "Processor markup",
      likelyOwner: { economicBeneficiary: "Processor", contractualController: "Processor" },
      evidenceStatus: expect.any(String),
      confidence: expect.stringMatching(/high|medium|low/),
      whyDeservesAttention: expect.any(String),
      whatStatementShows: expect.any(String),
      whatThisLikelyMeans: expect.any(String),
      whatStillNeedsConfirmation: expect.any(Array),
      safestNextAction: { actionType: expect.any(String), instruction: expect.any(String) },
      opportunityLinkage: { componentRefs: ["opp_component_supported"], linkageOnly: true, moneyIncluded: false },
      languageSource: "deterministic_fallback",
    });
    expect(finding.references.evidenceRefs.length).toBeGreaterThan(0);
    expect(finding.references.feeRowRefs.length).toBeGreaterThan(0);
    expect(finding.opportunityLinkage).not.toHaveProperty("amount");

    expect(report.openQuestions.items[0]).toMatchObject({
      requirement: "merchant_pricing_agreement_required",
      requiredEvidenceOrConfirmation: ["Current merchant pricing agreement or pricing schedule"],
      references: { evidenceRefs: expect.any(Array), feeRowRefs: expect.any(Array) },
      amountIsSavings: false,
    });
    expect(report.allCharges.rows[0]).toMatchObject({
      label: "PROCESSOR MARKUP",
      category: "Processor markup",
      likelyOwner: { economicBeneficiary: "Processor", contractualController: "Processor" },
      whatRateRevealKnows: expect.any(String),
      evidenceStatus: expect.any(String),
      safestAction: { actionType: expect.any(String), instruction: expect.any(String) },
      references: { evidenceRefs: expect.any(Array), feeRowRef: expect.any(String) },
    });
    expect(report.nextActions.modules[0]).toMatchObject({
      actionType: "request_pricing_review",
      title: expect.any(String),
      whatToDo: expect.any(String),
      why: expect.any(String),
      statementEvidenceRefs: expect.any(Array),
      exactAsk: expect.any(String),
      requestDocumentation: expect.any(Array),
      followUp: expect.any(String),
      avoidClaiming: expect.any(Array),
      successCriteria: expect.any(Array),
    });
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
    const analysis = completedAnalysis();
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

  it("never expands canonical customer visibility or permission denials", () => {
    const core = completedAnalysis();
    deny(core, "core_metrics", "showCoreMetrics");
    const coreReport = buildProductionReportProjection(core).report!;
    expect(coreReport.snapshot).toMatchObject({ status: "omitted", processedSales: null, totalFees: null });
    expect(coreReport.composition.status).toBe("omitted");

    const rate = completedAnalysis();
    deny(rate, "effective_rate", "showEffectiveRate");
    expect(buildProductionReportProjection(rate).report!.hero).toMatchObject({ status: "omitted", effectiveRate: null, benchmark: null });

    const benchmark = completedAnalysis();
    benchmark.customerState.rateComparison = qualifiedComparison(benchmark, "above_reference");
    deny(benchmark, "benchmark", "showBenchmark");
    expect(buildProductionReportProjection(benchmark).report!.hero.benchmark).toBeNull();

    const inventory = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]);
    deny(inventory, "fee_inventory", "showFeeInventory");
    const inventoryReport = buildProductionReportProjection(inventory).report!;
    expect(inventoryReport.allCharges).toMatchObject({ status: "omitted", rows: [] });
    expect(inventoryReport.composition.status).toBe("omitted");
    expect(inventoryReport.priorityFindings.status).toBe("omitted");

    const ownership = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]);
    deny(ownership, "ownership_actionability", "showOwnershipActionability");
    const ownershipReport = buildProductionReportProjection(ownership).report!;
    expect(ownershipReport.composition.status).toBe("omitted");
    expect(ownershipReport.priorityFindings.status).toBe("omitted");
    expect(ownershipReport.allCharges.rows.every((row) => row.category === "unclassified" && row.disposition === "informational")).toBe(true);

    const calculations = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]);
    deny(calculations, "evidence_calculations", "showEvidenceCalculations");
    const calculationReport = buildProductionReportProjection(calculations).report!;
    expect(calculationReport.composition.status).toBe("omitted");
    expect(calculationReport.trustStrip.items.map((item) => item.label)).not.toContain("Charge and fee reconciliation");

    const actions = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]);
    deny(actions, "actions", "showActions");
    const actionDeniedReport = buildProductionReportProjection(actions).report!;
    expect(actionDeniedReport).toMatchObject({
      hero: { primaryNextAction: null },
      nextActions: { status: "omitted", modules: [], guidance: null },
    });
    expect(actionDeniedReport.priorityFindings.items.every((item) => item.safestNextAction === null)).toBe(true);
    expect(actionDeniedReport.allCharges.rows.every((row) => row.safestAction === null)).toBe(true);

    const verification = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]);
    deny(verification, "verification_amounts", "showVerificationAmounts");
    expect(buildProductionReportProjection(verification).report!.openQuestions.items.every((item) => item.amountUnderReview === null)).toBe(true);

    const explanation = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 100 }]);
    explanation.customerState.visibility.showCustomerExplanation = false;
    const explanationPermission = explanation.customerState.permissions.find((candidate) => candidate.key === "customer_explanation")!;
    explanationPermission.permitted = false;
    const explanationReport = buildProductionReportProjection(explanation).report!;
    expect(explanationReport.hero.interpretation).toBeNull();
    expect(explanationReport.priorityFindings.items).toEqual([]);
    expect(explanationReport.openQuestions).toMatchObject({ status: "omitted", context: [], items: [] });
    expect(explanationReport.methodology.disclosures).toEqual([]);
    expect(explanationReport.monitoring).toEqual({ heading: "What to watch next", status: "omitted", guidance: [] });
    expect(explanationReport.allCharges.rows.every((row) => row.whatRateRevealKnows === null)).toBe(true);

    const withheldReport = completedAnalysis();
    deny(withheldReport, "core_metrics", "showCoreMetrics");
    deny(withheldReport, "effective_rate", "showEffectiveRate");
    expect(buildProductionReportProjection(withheldReport).experience).toBe("unable_to_complete");
  });

  it("uses canonical readiness and integrity for all three public experiences", () => {
    const partial = package3Analysis([{ label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" }]);
    const partialReport = buildProductionReportProjection(partial);
    expect(partialReport.experience).toBe("analysis_available_with_open_questions");
    expect(partialReport.report!.openQuestions.items).toEqual([]);
    expect(partialReport.report!.openQuestions.context.join(" ")).toMatch(/reconcile|limited/i);

    const limited = completedAnalysis();
    limited.customerState.axes.analysisReadiness = "limited";
    limited.customerState.primaryState = "analysis_limited";
    expect(buildProductionReportProjection(limited).experience).toBe("analysis_available_with_open_questions");

    const withheld = completedAnalysis();
    withheld.customerState.axes.analysisReadiness = "withheld";
    withheld.customerState.primaryState = "analysis_withheld";
    expect(buildProductionReportProjection(withheld)).toMatchObject({ experience: "unable_to_complete", report: null });

    const verification = completedAnalysis();
    verification.customerState.primaryState = "verification_needed";
    expect(buildProductionReportProjection(verification).experience).toBe("analysis_available_with_open_questions");

    const benchmarkUnavailable = completedAnalysis();
    expect(benchmarkUnavailable.customerState.rateComparison.status).toBe("unavailable");
    expect(buildProductionReportProjection(benchmarkUnavailable).experience).toBe("analysis_completed");
    expect(buildProductionReportProjection(completedAnalysis()).experience).toBe("analysis_completed");
  });

  it("keeps a canonically limited public state open when explanatory copy is hidden", () => {
    const analysis = completedAnalysis();
    analysis.customerState.axes.analysisReadiness = "limited";
    analysis.customerState.primaryState = "analysis_limited";
    analysis.customerState.visibility.showCustomerExplanation = false;
    const explanationPermission = analysis.customerState.permissions.find((candidate) => candidate.key === "customer_explanation")!;
    explanationPermission.permitted = false;

    const projection = buildProductionReportProjection(analysis);
    expect(projection.experience).toBe("analysis_available_with_open_questions");
    expect(projection.report!.openQuestions).toMatchObject({ status: "omitted", context: [], items: [] });
    expect(projection.report!.monitoring.status).toBe("omitted");

    projection.experience = "analysis_completed";
    const validation = validateProductionReportProjectionAgainstCanonical(analysis, projection);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/collapsed.*limited|unresolved.*completed/i);
  });

  it("keeps benchmark availability out of the trust strip", () => {
    const projection = buildProductionReportProjection(completedAnalysis());
    const labels = projection.report!.trustStrip.items.map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["Processed sales verified", "Processing fees verified", "Charge and fee reconciliation", "One-statement scope"]));
    expect(labels.join(" ")).not.toMatch(/benchmark|reference/i);
    expect(projection.report!.trustStrip.items).not.toContainEqual(expect.objectContaining({ status: "needs_checking" }));
  });

  it("omits an unverified merchant identity instead of inventing one", () => {
    const analysis = completedAnalysis();
    analysis.identity.merchantName.status = "unavailable";
    analysis.identity.merchantName.value = null;
    expect(buildProductionReportProjection(analysis).header.merchantName).toBeNull();
  });

  it("maps safe recovery reasons without exposing internal diagnostics", () => {
    const missing = completedAnalysis();
    missing.financialFacts.processedSales.status = "unavailable";
    missing.financialFacts.processedSales.value = null;
    expect(buildProductionReportProjection(missing).recovery?.reasonCode).toBe("missing_required_financial_facts");

    const incomplete = completedAnalysis();
    incomplete.identity.statementPeriod.status = "unavailable";
    incomplete.identity.statementPeriod.value = null;
    expect(buildProductionReportProjection(incomplete).recovery?.reasonCode).toBe("missing_or_incomplete_statement");

    const conflict = completedAnalysis();
    conflict.customerState.axes.dataIntegrity = "failed";
    expect(buildProductionReportProjection(conflict).recovery?.reasonCode).toBe("unsafe_or_conflicting_totals");

    const unsupported = completedAnalysis();
    unsupported.financialFacts.totalFees.status = "unsupported";
    expect(buildProductionReportProjection(unsupported).recovery?.reasonCode).toBe("unreadable_or_unsupported_input");

    const serialized = JSON.stringify(buildProductionReportProjection(unsupported));
    expect(serialized).not.toMatch(/parser|provider|\.pdf|\/private\/|Package [A-Z0-9]/i);
  });

  it("keeps authoritative money while providing human-readable composition text", () => {
    const projection = buildProductionReportProjection(package3Analysis([{ label: "PROCESSOR MARKUP", amount: 830.65 }]));
    expect(projection.report!.composition.categories[0]!.amount).toEqual({ amountMinor: 83065, currency: "USD" });
    expect(projection.report!.composition.accessibleSummary).toContain("$830.65");
    expect(projection.report!.composition.accessibleSummary).not.toMatch(/83065 cents/i);
  });

  it("detects a post-projection attempt to expand a canonical denial", () => {
    const analysis = completedAnalysis();
    deny(analysis, "actions", "showActions");
    const projection = buildProductionReportProjection(analysis);
    projection.report!.nextActions.status = "guidance";
    projection.report!.nextActions.guidance = "Call your processor.";
    const validation = validateProductionReportProjectionAgainstCanonical(analysis, projection);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/action visibility/i);
  });
});

function completedAnalysis(): CanonicalStatementAnalysis {
  const analysis = package3Analysis([{ label: "PROCESSOR MARKUP", amount: 80 }]);
  for (const item of analysis.merchantAttention.items) {
    item.surfaceEligibility.priorityFinding = false;
    item.surfaceEligibility.actionToolkit = false;
    item.questionToResolve = null;
    item.actionToolkit = null;
    item.inventoryDisposition = "routine_context";
  }
  analysis.customerState.axes.analysisReadiness = "verified";
  analysis.customerState.axes.dataIntegrity = "reconciled";
  analysis.customerState.axes.opportunityPosture = "none";
  analysis.customerState.primaryState = "verified_benchmark_unavailable";
  deny(analysis, "actions", "showActions");
  deny(analysis, "verification_amounts", "showVerificationAmounts");
  return analysis;
}

function deny(
  analysis: CanonicalStatementAnalysis,
  permissionKey: CanonicalStatementAnalysis["customerState"]["permissions"][number]["key"],
  visibilityKey: keyof Pick<CanonicalStatementAnalysis["customerState"]["visibility"],
    | "showCoreMetrics"
    | "showEffectiveRate"
    | "showBenchmark"
    | "showFeeInventory"
    | "showOwnershipActionability"
    | "showVerificationAmounts"
    | "showEvidenceCalculations"
    | "showActions">,
): void {
  analysis.customerState.visibility[visibilityKey] = false;
  const permission = analysis.customerState.permissions.find((candidate) => candidate.key === permissionKey)!;
  permission.permitted = false;
  permission.reasonCodes = ["canonical_test_denial"];
  permission.limitationCodes = ["canonical_test_denial"];
}

function qualifiedComparison(
  analysis: CanonicalStatementAnalysis,
  position: "below_reference" | "within_reference" | "above_reference",
): CanonicalStatementAnalysis["customerState"]["rateComparison"] {
  analysis.customerState.visibility.showBenchmark = true;
  analysis.customerState.axes.ratePosition = position;
  const permission = analysis.customerState.permissions.find((candidate) => candidate.key === "benchmark")!;
  permission.permitted = true;
  permission.reasonCodes = ["qualified_benchmark_available"];
  permission.limitationCodes = [];
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
