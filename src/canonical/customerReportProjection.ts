import { CUSTOMER_PERMISSION_KEYS } from "./customerStateTypes.js";
import { validateCanonicalCustomerReportProjection } from "./customerReportProjectionValidation.js";
import {
  CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS,
  CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION,
  type BenchmarkProjection,
  type CanonicalCustomerReportProjectionBuildOptions,
  type CanonicalCustomerReportProjectionV1,
  type CoreMetricsProjection,
  type CustomerActionProjection,
  type CustomerFeeRowProjection,
  type CustomerMoney,
  type CustomerOpportunityItem,
  type CustomerPermissionProjection,
  type CustomerPercent,
  type EffectiveRateProjection,
  type FeeInventoryProjection,
  type OpportunityProjection,
  type VerificationProjection,
} from "./customerReportProjectionTypes.js";
import type {
  CanonicalCustomerActionGuidance,
  CanonicalCustomerPermissionDecision,
  CanonicalFeeRow,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "./types.js";

export function buildCanonicalCustomerReportProjection(
  analysis: CanonicalStatementAnalysis,
  options: CanonicalCustomerReportProjectionBuildOptions,
): CanonicalCustomerReportProjectionV1 {
  if (options?.purpose !== "synthetic_fixture_validation_only") {
    throw new Error("canonical_customer_projection_synthetic_fixture_purpose_required");
  }
  const state = analysis.customerState;
  const permissions = projectPermissions(state.permissions);
  const visibility = {
    coreMetrics: state.visibility.showCoreMetrics ? "shown" : "hidden",
    effectiveRate: state.visibility.showEffectiveRate ? "shown" : state.axes.analysisReadiness === "unavailable" ? "hidden" : "unavailable",
    benchmark: state.visibility.showBenchmark ? "shown" : state.axes.ratePosition === "unavailable" ? "unavailable" : "hidden",
    feeInventory: state.visibility.showFeeInventory ? (analysis.feeLedger.status === "available" ? "shown" : "limited") : "hidden",
    opportunities:
      state.visibility.showDeterministicOpportunity || state.visibility.showEstimatedOpportunity
        ? "shown"
        : state.axes.opportunityPosture === "none"
          ? "none"
          : "hidden",
    verificationItems: state.visibility.showVerificationAmounts ? "shown" : state.axes.opportunityPosture === "verification_only" ? "hidden" : "none",
    actions: state.visibility.showActions ? "shown" : "hidden",
    explanation: state.visibility.showCustomerExplanation ? "shown" : state.axes.explanationReadiness === "unavailable" ? "unavailable" : "hidden",
  } as const;

  const projection: CanonicalCustomerReportProjectionV1 = {
    reportVersion: CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION,
    projectionReadiness: CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS,
    source: "synthetic_fixture",
    displayId: safeDisplayId(analysis.analysisId),
    primaryState: state.primaryState,
    axes: state.axes,
    permissions,
    visibility,
    headline: headlineFor(state.primaryState),
    statementSummary: {
      processor: safeFallback(analysis.identity.processorName.value, "Processor identified"),
      statementPeriod: periodLabel(analysis.identity.statementPeriod.value),
      businessType: safeFallback(analysis.identity.businessType.value, "Business type selected"),
    },
    coreMetrics: coreMetricsFor(analysis),
    effectiveRate: effectiveRateFor(analysis),
    benchmark: benchmarkFor(analysis),
    feeInventory: feeInventoryFor(analysis),
    opportunities: opportunitiesFor(analysis),
    verificationItems: verificationFor(analysis),
    limitations: limitationList([...state.limitations, ...analysis.feeLedger.limitations, ...analysis.opportunityEngine.limitations]),
    actions: state.visibility.showActions ? state.actionGuidance.map(projectAction).slice(0, 4) : [],
    explanation: {
      status: state.visibility.showCustomerExplanation ? "shown" : state.axes.explanationReadiness === "unavailable" ? "unavailable" : "hidden",
      source: state.visibility.showCustomerExplanation ? state.explanation.source : "unavailable",
      sections: state.visibility.showCustomerExplanation
        ? state.explanation.sections.map((section) => ({ title: sectionTitle(section.kind), body: sanitizeSentence(section.text) })).slice(0, 5)
        : [],
      fallbackReasonCodes: state.explanation.fallbackReasonCodes,
    },
    methodology: {
      dataQuality: state.axes.analysisReadiness,
      guidance: methodologyGuidance(state.primaryState),
      docsToGather: docsToGather(state.primaryState),
    },
  };

  const validation = validateCanonicalCustomerReportProjection(projection);
  if (validation.status !== "valid") {
    throw new Error(`canonical_customer_projection_invalid:${validation.errors.join(",")}`);
  }
  return projection;
}

function projectPermissions(permissions: CanonicalCustomerPermissionDecision[]): CustomerPermissionProjection {
  const lookup = new Map(permissions.map((permission) => [permission.key, permission]));
  return Object.fromEntries(
    CUSTOMER_PERMISSION_KEYS.map((key) => {
      const permission = lookup.get(key);
      return [key, { permitted: permission?.permitted === true, reasonCodes: permission?.reasonCodes ?? ["permission_not_present"] }];
    }),
  ) as CustomerPermissionProjection;
}

function coreMetricsFor(analysis: CanonicalStatementAnalysis): CoreMetricsProjection {
  if (!analysis.customerState.visibility.showCoreMetrics) return { status: "hidden", reasonCode: "core_metrics_hidden" };
  return {
    status: "shown",
    processedVolume: money(analysis.financialFacts.processedSales.value),
    totalFees: money(analysis.financialFacts.totalFees.value),
    transactionCount: { status: "unavailable", reasonCode: "transaction_population_not_safe" },
    averageTicket: analysis.financialFacts.averageTicket.value
      ? { status: "shown", amount: money(analysis.financialFacts.averageTicket.value) }
      : { status: "unavailable", reasonCode: "average_ticket_unavailable" },
  };
}

function effectiveRateFor(analysis: CanonicalStatementAnalysis): EffectiveRateProjection {
  if (!analysis.customerState.visibility.showEffectiveRate) {
    return analysis.customerState.axes.analysisReadiness === "unavailable"
      ? { status: "hidden", reasonCode: "effective_rate_hidden" }
      : { status: "unavailable", reasonCode: "effective_rate_unavailable" };
  }
  return {
    status: "shown",
    rate: percent(analysis.financialFacts.rateRevealCalculatedAllInRate.value ?? "0"),
    basisLabel: "All-in processing fees divided by verified processing volume",
    limitationCodes: analysis.financialFacts.effectiveRateBasis.populationCompatibility === "compatible" ? [] : ["rate_basis_limited"],
  };
}

function benchmarkFor(analysis: CanonicalStatementAnalysis): BenchmarkProjection {
  const { rateComparison, visibility, axes } = analysis.customerState;
  if (!visibility.showBenchmark) {
    return axes.ratePosition === "unavailable"
      ? {
          status: "unavailable",
          reasonCode: "rate_comparison_unavailable",
          customerMessage: "A rate comparison is not available for this statement yet.",
        }
      : { status: "hidden", reasonCode: "benchmark_hidden" };
  }
  if (rateComparison.status !== "qualified" || rateComparison.position === "unavailable") {
    return {
      status: "unavailable",
      reasonCode: "rate_comparison_unavailable",
      customerMessage: "A rate comparison is not available for this statement yet.",
    };
  }
  return {
    status: "shown",
    position: rateComparison.position,
    rangeLabel: "Matched reference range",
    methodologyLabel: "Matched processor and business context",
    limitationCodes: rateComparison.reasonCodes,
  };
}

function feeInventoryFor(analysis: CanonicalStatementAnalysis): FeeInventoryProjection {
  if (!analysis.customerState.visibility.showFeeInventory) return { status: "hidden", reasonCode: "fee_inventory_hidden" };
  const rows = analysis.feeLedger.rows.slice(0, 12).map(projectFeeRow);
  return {
    status: analysis.feeLedger.status === "available" ? "shown" : "limited",
    totalVisibleAmount: analysis.feeLedger.uniqueChargeTotal ? money(analysis.feeLedger.uniqueChargeTotal) : null,
    rows,
    omittedRowCount: Math.max(0, analysis.feeLedger.rows.length - rows.length),
    limitationCodes: analysis.feeLedger.limitations,
  };
}

function opportunitiesFor(analysis: CanonicalStatementAnalysis): OpportunityProjection {
  const { visibility } = analysis.customerState;
  if (!visibility.showDeterministicOpportunity && !visibility.showEstimatedOpportunity) {
    return analysis.customerState.axes.opportunityPosture === "none"
      ? { status: "none", reasonCode: "no_eligible_opportunity_found" }
      : { status: "hidden", reasonCode: "eligible_opportunity_hidden" };
  }
  const deterministicAmount = visibility.showDeterministicOpportunity ? money(visibility.visibleDeterministicAnnualAmount) : null;
  const estimatedAmount = visibility.showEstimatedOpportunity ? money(visibility.visibleApprovedEstimatedAnnualAmount) : null;
  const items: CustomerOpportunityItem[] = analysis.opportunityEngine.components
    .filter((component) => component.inclusionStatus === "included" && (component.eligibility === "deterministic" || component.eligibility === "approved_estimate"))
    .slice(0, 6)
    .map((component, index) => ({
      displayId: `preview-opportunity-${index + 1}`,
      title: component.kind === "rate_repricing" ? "Pricing review opportunity" : "Fee review opportunity",
      amount: money(component.calculation.result ?? { amountMinor: 0, currency: "USD" }),
      certainty: component.eligibility === "deterministic" ? ("verified" as const) : ("estimated" as const),
      removabilityLevel: component.kind === "rate_repricing" ? ("potentially_negotiable" as const) : ("conditionally_removable" as const),
      evidenceStatus: component.eligibility === "deterministic" ? ("verified" as const) : ("supported_by_synthetic_source" as const),
      source: syntheticSource("Example processor pricing addendum"),
      conditions: component.limitations.length > 0 ? component.limitations.slice(0, 3).map(sanitizeSentence) : ["Confirm terms with the processor before acting."],
      cadence: component.cadence.value === "annual" ? ("annual" as const) : component.cadence.value === "monthly" ? ("monthly" as const) : ("statement_frequency" as const),
      supportedAction: component.kind === "rate_repricing" ? ("request_repricing" as const) : ("request_explanation" as const),
      reasonCodes: component.inclusionReasonCodes,
    }));
  return { status: "shown", deterministicAmount, estimatedAmount, items, limitationCodes: analysis.opportunityEngine.limitations };
}

function verificationFor(analysis: CanonicalStatementAnalysis): VerificationProjection {
  if (!analysis.customerState.visibility.showVerificationAmounts) {
    return analysis.customerState.axes.opportunityPosture === "verification_only"
      ? { status: "hidden", reasonCode: "verification_hidden" }
      : { status: "none", reasonCode: "no_verification_amounts" };
  }
  return {
    status: "shown",
    observedAmount: money(analysis.customerState.visibility.visibleVerificationOnlyObservedAmount),
    label: "Amount to verify",
    items: [
      {
        displayId: "preview-verification-1",
        title: "Fee needs documentation",
        observedAmount: money(analysis.customerState.visibility.visibleVerificationOnlyObservedAmount),
        evidenceStatus: "needs_verification",
        source: syntheticSource("Example processor statement note"),
        conditions: ["Request documentation before treating this amount as savings."],
        reasonCodes: ["documentation_needed"],
      },
    ],
    notSavingsCopy: "This is not treated as savings until documentation supports it.",
    limitationCodes: analysis.opportunityEngine.limitations,
  };
}

function projectFeeRow(row: CanonicalFeeRow, index: number): CustomerFeeRowProjection {
  return {
    displayId: `preview-fee-${index + 1}`,
    label: safeFallback(row.selectedLabel, `Statement fee ${index + 1}`),
    amount: row.selectedAmount ? money(row.selectedAmount) : null,
    role: row.role === "credit" ? "credit" : row.contributesToUniqueTotal ? (row.role === "interchange_detail_row" ? "pass_through" : "charge") : row.role === "unknown_unresolved" ? "unresolved" : "excluded",
    feeOwner: row.role === "interchange_detail_row" ? "card_network" : row.role === "unknown_unresolved" ? "needs_review" : "processor",
    customerCategory: "needs_review",
    actionability: "needs_review",
    removabilityLevel: row.role === "unknown_unresolved" ? "needs_verification" : "not_applicable",
    evidenceStatus: row.contributionDecision.confidence === "high" ? "verified" : "needs_verification",
    source: row.role === "interchange_detail_row" ? syntheticSource("Example Mastercard fee schedule") : null,
    conditions: row.limitations.length > 0 ? row.limitations.slice(0, 3).map(sanitizeSentence) : [],
    status: row.contributesToUniqueTotal ? "included" : row.role === "unknown_unresolved" ? "unresolved" : "excluded",
    limitationCodes: row.limitations,
  };
}

function syntheticSource(title: string) {
  return {
    synthetic: true as const,
    title,
    effectiveDate: "2026-04-01",
    safeUrl: "https://example.com/ratereveal-synthetic-source",
  };
}

function projectAction(action: CanonicalCustomerActionGuidance, index: number): CustomerActionProjection {
  const copy = actionCopy(action.actionType);
  return {
    displayId: `preview-action-${index + 1}`,
    type: action.actionType,
    label: copy.label,
    body: copy.body,
    targetDisplayIds: [],
    reasonCodes: action.reasonCodes,
  };
}

function money(amount: MoneyAmount | null): CustomerMoney {
  return { amountMinor: amount?.amountMinor ?? 0, currency: amount?.currency ?? "USD" };
}

function percent(rate: string): CustomerPercent {
  return { basisPoints: Math.round(Number(rate) * 10000), displayBasis: "calculated_effective_rate" };
}

function periodLabel(period: { start: string; end: string } | null) {
  if (!period) return "Statement period unavailable";
  return `${period.start} to ${period.end}`;
}

function safeDisplayId(value: string) {
  return `preview-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "analysis"}`;
}

function safeFallback(value: string | null, fallback: string) {
  return sanitizeSentence(value && value.trim() ? value : fallback);
}

function sanitizeSentence(value: string) {
  return value.replace(/\bcanonical\b/gi, "verified").replace(/\bPackage [B-G]\b/g, "analysis").replace(/\bshadow\b/gi, "local preview");
}

function sectionTitle(kind: string) {
  const labels: Record<string, string> = {
    summary: "Summary",
    verified_facts: "Verified from your statement",
    rate_basis: "Rate basis",
    opportunity_limits: "Opportunity limits",
    review_items: "Items to review",
    safe_next_step: "Next step",
  };
  return labels[kind] ?? "Report note";
}

function headlineFor(state: CanonicalStatementAnalysis["customerState"]["primaryState"]) {
  const headlines: Record<typeof state, { title: string; body: string; tone: "neutral" | "positive" | "review" | "limited" | "blocked"; reasonCodes: string[] }> = {
    unable_to_analyze: { title: "We need a clearer statement", body: "Upload a complete processor statement so the fee review can continue.", tone: "blocked", reasonCodes: ["statement_not_usable"] },
    analysis_withheld: { title: "More support is needed", body: "Some facts are present, but financial conclusions are not ready to show.", tone: "blocked", reasonCodes: ["financial_conclusions_withheld"] },
    analysis_limited: { title: "Analysis is limited", body: "Verified totals are shown, but unresolved items prevent stronger conclusions.", tone: "limited", reasonCodes: ["analysis_limited"] },
    verification_needed: { title: "Some fees still need review", body: "These amounts should be verified before treating them as savings.", tone: "review", reasonCodes: ["verification_needed"] },
    competitive_no_opportunity: { title: "Rates look competitive", body: "The verified rate fits the matched rate-comparison range and no eligible fee opportunity is shown.", tone: "positive", reasonCodes: ["competitive_no_opportunity"] },
    competitive_with_opportunity: { title: "Rates look competitive, with fee items to review", body: "The overall rate compares well, but some supported fee items may still be worth addressing.", tone: "review", reasonCodes: ["competitive_with_opportunity"] },
    rate_review_needed: { title: "Pricing review recommended", body: "The verified rate is above the matched rate-comparison range.", tone: "review", reasonCodes: ["rate_review_needed"] },
    rate_review_with_opportunity: { title: "Pricing and fee review recommended", body: "The verified rate is above reference and supported fee opportunities are visible.", tone: "review", reasonCodes: ["rate_review_with_opportunity"] },
    fee_opportunity_identified: { title: "Fee opportunity identified", body: "Supported fee items are visible even though a rate comparison is unavailable.", tone: "review", reasonCodes: ["fee_opportunity_identified"] },
    material_fee_opportunity: { title: "Material fee opportunity identified", body: "Supported fee items appear large enough to prioritize.", tone: "review", reasonCodes: ["material_fee_opportunity"] },
    verified_benchmark_unavailable: { title: "Verified totals, rate comparison unavailable", body: "The statement totals are usable, but a rate comparison is not available yet.", tone: "neutral", reasonCodes: ["benchmark_unavailable"] },
  };
  return headlines[state];
}

function actionCopy(actionType: CanonicalCustomerActionGuidance["actionType"]) {
  const copy: Record<CanonicalCustomerActionGuidance["actionType"], { label: string; body: string }> = {
    review_documentation: { label: "Review documentation", body: "Gather the agreement or addendum that explains this charge." },
    verify_charge: { label: "Verify this charge", body: "Ask your processor to explain the charge and how it applies." },
    request_explanation: { label: "Request an explanation", body: "Ask your processor to explain the fee and whether it can change." },
    request_removal: { label: "Ask about removal", body: "Ask whether the supported charge can be removed based on the documented reason." },
    request_repricing: { label: "Request pricing review", body: "Ask your processor to review the supported pricing item." },
    monitor: { label: "Monitor next statement", body: "Check another statement period before making a conclusion." },
    no_action: { label: "No action needed", body: "Keep this statement for your records." },
  };
  return copy[actionType];
}

function limitationList(limitations: string[]) {
  const unique = [...new Set(limitations.length > 0 ? limitations : ["Some review details are unavailable."])];
  return unique.slice(0, 5).map((limitation, index) => ({
    code: `limitation_${index + 1}`,
    title: index === 0 ? "Review limitation" : "Additional limitation",
    body: sanitizeSentence(limitation),
    severity: index === 0 ? ("review" as const) : ("info" as const),
  }));
}

function methodologyGuidance(state: CanonicalStatementAnalysis["customerState"]["primaryState"]) {
  if (state === "unable_to_analyze") return ["Use a complete processor statement, not a receipt or deposit summary."];
  if (state === "analysis_limited") return ["Review unresolved fee rows before relying on opportunity totals."];
  return ["Amounts shown here come from visible, permitted statement facts."];
}

function docsToGather(state: CanonicalStatementAnalysis["customerState"]["primaryState"]) {
  if (state === "verification_needed") return ["Processor agreement", "Pricing addendum", "Recent statement"];
  if (state === "unable_to_analyze") return ["Complete monthly processor statement"];
  return ["Processor agreement", "Pricing addendum"];
}
