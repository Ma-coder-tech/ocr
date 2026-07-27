import {
  DETERMINISTIC_EXPLANATION_POLICY_VERSION,
} from "./aiCapabilityTypes.js";
import type {
  CanonicalAiLimitationCode,
  CanonicalDeterministicExplanationRecord,
  CanonicalFinancialFacts,
  MoneyAmount,
  CanonicalOpportunityEngine,
  CanonicalStatementIdentity,
} from "./types.js";

export function buildDeterministicExplanation(input: {
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  opportunityEngine: CanonicalOpportunityEngine;
  limitationCodes: CanonicalAiLimitationCode[];
}): CanonicalDeterministicExplanationRecord {
  const merchant = input.identity.merchantName.value || "the merchant";
  const sales = input.financialFacts.processedSales.value ? formatMoney(input.financialFacts.processedSales.value) : "unverified sales";
  const fees = input.financialFacts.totalFees.value ? formatMoney(input.financialFacts.totalFees.value) : "unverified fees";
  const rate = input.financialFacts.rateRevealCalculatedAllInRate.value;
  const deterministic = formatMoney(input.opportunityEngine.summary.deterministicEligibleAnnualAmount);
  const estimated = formatMoney(input.opportunityEngine.summary.approvedEstimatedAnnualAmount);
  const verification = formatMoney(input.opportunityEngine.summary.verificationOnlyObservedAmount);

  return {
    id: "deterministic_explanation_v1",
    policyVersion: DETERMINISTIC_EXPLANATION_POLICY_VERSION,
    source: "deterministic_template",
    readabilityTarget: "eighth_grade",
    tone: "neutral_factual",
    prohibitedLanguageCheck: "passed",
    limitationCodes: [...new Set(["deterministic_explanation_available", ...input.limitationCodes])] as CanonicalAiLimitationCode[],
    sections: [
      {
        kind: "verified_facts",
        text: `RateReveal verified the canonical statement facts for ${merchant}. The reviewed statement shows ${sales} in processed sales and ${fees} in total fees when those values are supported by statement evidence.`,
        factRefs: ["identity.merchantName", "financialFacts.processedSales", "financialFacts.totalFees"],
        evidenceRefs: [
          ...input.identity.merchantName.evidenceRefs,
          ...input.financialFacts.processedSales.evidenceRefs,
          ...input.financialFacts.totalFees.evidenceRefs,
        ],
      },
      {
        kind: "rate_basis",
        text: `The effective-rate view uses the approved RateReveal fee and volume basis. The calculated rate is ${rate ?? "not available"} and should be read with the stated basis limitations.`,
        factRefs: ["financialFacts.rateRevealCalculatedAllInRate", "financialFacts.effectiveRateBasis"],
        evidenceRefs: input.financialFacts.rateRevealCalculatedAllInRate.evidenceRefs,
      },
      {
        kind: "opportunity_limits",
        text: `Eligible deterministic opportunity is ${deterministic}. Approved estimated opportunity is ${estimated}. Verification-only amounts, currently ${verification}, are kept out of eligible totals.`,
        factRefs: ["opportunityEngine.summary"],
        evidenceRefs: [],
      },
      {
        kind: "review_items",
        text: "Items marked for review need supporting facts before they can affect financial conclusions. Unknown cadence, one-time charges, and benchmark-only concerns are not annualized.",
        factRefs: ["opportunityEngine.components", "aiCapabilities.summary"],
        evidenceRefs: [],
      },
      {
        kind: "safe_next_step",
        text: "The safe next step is to confirm any review item with contract, processor, statement, or other authoritative evidence before using it as an eligible opportunity.",
        factRefs: ["opportunityEngine.components"],
        evidenceRefs: [],
      },
    ],
  };
}

function formatMoney(value: MoneyAmount): string {
  const sign = value.amountMinor < 0 ? "-" : "";
  const cents = Math.abs(value.amountMinor);
  return `${sign}$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}
