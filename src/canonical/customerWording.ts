import { narrativeErrors } from "./aiGroundingGateway.js";
import { CUSTOMER_WORDING_POLICY_VERSION } from "./customerStateTypes.js";
import type {
  CanonicalAiCapabilityLayer,
  CanonicalCustomerAxisProjection,
  CanonicalCustomerExplanation,
  CanonicalCustomerPrimaryState,
  CanonicalCustomerVisibility,
  CanonicalFinancialFacts,
  CanonicalStatementIdentity,
  MoneyAmount,
} from "./types.js";

export function buildCanonicalCustomerExplanation(input: {
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  axes: CanonicalCustomerAxisProjection;
  primaryState: CanonicalCustomerPrimaryState;
  visibility: CanonicalCustomerVisibility;
  aiCapabilities: CanonicalAiCapabilityLayer;
  benchmarkUnavailable: boolean;
}): CanonicalCustomerExplanation {
  const deterministic = deterministicSections(input);
  const aiNarrative = input.aiCapabilities.capabilities.find((capability) => capability.capability === "merchant_narrative")?.output;
  if (input.axes.explanationReadiness === "ai_enhanced" && aiNarrative?.type === "merchant_narrative") {
    const texts = aiNarrative.sections.map((section) => section.text);
    const contradictionErrors = customerNarrativeContradictions(texts, input);
    if (contradictionErrors.length === 0) {
      return {
        policyVersion: CUSTOMER_WORDING_POLICY_VERSION,
        source: "ai_enhanced",
        fallbackReasonCodes: [],
        prohibitedLanguageCheck: "passed",
        sections: aiNarrative.sections.map((section) => ({
          kind: section.kind === "verified_facts" || section.kind === "review_items" || section.kind === "opportunity_limits" || section.kind === "safe_next_step" ? section.kind : "summary",
          text: section.text,
          factRefs: section.factRefs,
          evidenceRefs: section.evidenceRefs,
        })),
      };
    }
  }

  return {
    policyVersion: CUSTOMER_WORDING_POLICY_VERSION,
    source: input.axes.explanationReadiness === "unavailable" ? "unavailable" : "deterministic_fallback",
    fallbackReasonCodes: input.axes.explanationReadiness === "ai_enhanced" ? ["ai_narrative_contradicted_projection"] : ["deterministic_customer_explanation"],
    prohibitedLanguageCheck: "passed",
    sections: input.axes.explanationReadiness === "unavailable" ? [] : deterministic,
  };
}

export function customerNarrativeContradictions(
  texts: readonly string[],
  input: {
    axes: CanonicalCustomerAxisProjection;
    primaryState: CanonicalCustomerPrimaryState;
    visibility: CanonicalCustomerVisibility;
    benchmarkUnavailable: boolean;
  },
): string[] {
  const joined = texts.join(" ");
  const errors = narrativeErrors(texts, { summary: { verificationOnlyObservedAmount: input.visibility.visibleVerificationOnlyObservedAmount, nonAnnualizedObservedAmount: input.visibility.visibleNonAnnualizedObservedAmount }, components: [] } as any);
  if (input.benchmarkUnavailable && /\bcompetitive\b|\babove benchmark\b|\bbelow benchmark\b|\bwithin benchmark\b|\brate comparison\b/i.test(joined)) {
    errors.push("AI narrative contains a benchmark conclusion when Package G benchmark is unavailable.");
  }
  if (input.axes.ratePosition !== "above_reference" && /\brate (?:is )?(?:bad|high|above)\b|\babove reference\b/i.test(joined)) {
    errors.push("AI narrative contradicts Package G rate position.");
  }
  if (input.visibility.visibleEligibleAnnualAmount.amountMinor === 0 && /\bsavings\b|\beligible opportunity\b|\brequest repricing\b|\brequest removal\b/i.test(joined)) {
    errors.push("AI narrative exposes opportunity language when Package G hides eligible totals.");
  }
  if (input.primaryState === "competitive_no_opportunity" && /\bfee opportunity\b|\brate review needed\b/i.test(joined)) {
    errors.push("AI narrative contradicts Package G primary state.");
  }
  return errors;
}

function deterministicSections(input: {
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  axes: CanonicalCustomerAxisProjection;
  primaryState: CanonicalCustomerPrimaryState;
  visibility: CanonicalCustomerVisibility;
  benchmarkUnavailable: boolean;
}) {
  const merchant = input.identity.merchantName.value || "your business";
  const sales = input.visibility.showCoreMetrics && input.financialFacts.processedSales.value ? formatMoney(input.financialFacts.processedSales.value) : "unavailable";
  const fees = input.visibility.showCoreMetrics && input.financialFacts.totalFees.value ? formatMoney(input.financialFacts.totalFees.value) : "unavailable";
  const rate = input.visibility.showEffectiveRate ? input.financialFacts.rateRevealCalculatedAllInRate.value ?? "unavailable" : "unavailable";
  const benchmarkText = input.benchmarkUnavailable
    ? "RateReveal verified the statement totals, but a qualified rate comparison was not available for this statement."
    : ratePositionText(input.axes.ratePosition);

  return [
    {
      kind: "summary" as const,
      text: summaryText(input.primaryState),
      factRefs: ["customerState.primaryState", "customerState.axes"],
      evidenceRefs: [],
    },
    {
      kind: "verified_facts" as const,
      text: `Your statement shows ${sales} in processed sales and ${fees} in total fees for ${merchant} when those values are supported by canonical evidence.`,
      factRefs: ["financialFacts.processedSales", "financialFacts.totalFees", "identity.merchantName"],
      evidenceRefs: [
        ...input.financialFacts.processedSales.evidenceRefs,
        ...input.financialFacts.totalFees.evidenceRefs,
        ...input.identity.merchantName.evidenceRefs,
      ],
    },
    {
      kind: "rate_basis" as const,
      text: `RateReveal calculated an all-in effective rate of ${rate} using the approved fee and volume basis. ${benchmarkText}`,
      factRefs: ["financialFacts.rateRevealCalculatedAllInRate", "customerState.rateComparison"],
      evidenceRefs: input.financialFacts.rateRevealCalculatedAllInRate.evidenceRefs,
    },
    {
      kind: "opportunity_limits" as const,
      text: `Visible deterministic opportunity is ${formatMoney(input.visibility.visibleDeterministicAnnualAmount)}. Visible approved estimated opportunity is ${formatMoney(input.visibility.visibleApprovedEstimatedAnnualAmount)}. Verification-only amounts are ${formatMoney(input.visibility.visibleVerificationOnlyObservedAmount)} and are not savings.`,
      factRefs: ["customerState.visibility", "opportunityEngine.summary"],
      evidenceRefs: [],
    },
    {
      kind: "safe_next_step" as const,
      text: "Ask your processor to document any review item before treating it as removable, avoidable, or eligible for repricing.",
      factRefs: ["customerState.actionGuidance"],
      evidenceRefs: [],
    },
  ];
}

function summaryText(state: CanonicalCustomerPrimaryState): string {
  if (state === "unable_to_analyze") return "We could not verify the core statement totals needed for customer-facing financial conclusions.";
  if (state === "analysis_withheld") return "RateReveal verified some canonical facts, but customer-facing financial conclusions are withheld by policy.";
  if (state === "analysis_limited") return "RateReveal verified core metrics, but fee-level limitations keep opportunity conclusions hidden.";
  if (state === "material_fee_opportunity") return "Your statement shows a material fee-level opportunity worth reviewing.";
  if (state === "rate_review_with_opportunity") return "Your statement shows a rate review concern and an eligible fee-level opportunity.";
  if (state === "rate_review_needed") return "Your statement shows a rate review concern based on a qualified benchmark.";
  if (state === "verification_needed") return "These fees may be worth reviewing, but the amount is verification-only.";
  if (state === "competitive_with_opportunity") return "A qualified comparison is within range, and a separate fee-level opportunity is visible.";
  if (state === "competitive_no_opportunity") return "A qualified comparison is within range and no eligible fee-level opportunity is visible.";
  if (state === "fee_opportunity_identified") return "Your statement shows an eligible fee-level opportunity, but a qualified rate comparison was not available.";
  return "RateReveal verified the statement totals, but a qualified rate comparison was not available for this statement.";
}

function ratePositionText(position: CanonicalCustomerAxisProjection["ratePosition"]): string {
  if (position === "above_reference") return "The qualified comparison is above the approved reference range.";
  if (position === "below_reference") return "The qualified comparison is below the approved reference range.";
  if (position === "within_reference") return "The qualified comparison is within the approved reference range.";
  return "A qualified rate comparison was not available for this statement.";
}

function formatMoney(value: MoneyAmount): string {
  const sign = value.amountMinor < 0 ? "-" : "";
  const cents = Math.abs(value.amountMinor);
  return `${sign}$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}
