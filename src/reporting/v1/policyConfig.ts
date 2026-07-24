import type { BusinessTypeId } from "../../businessTypes.js";
import type { StructuredFeeFindingKind } from "../../types.js";
import type { BenchmarkSource } from "./types.js";
import type { ChargeCadence } from "./types.js";

export const singleStatementReportV1Policy = {
  policyVersion: "2026-07-24.1",
  confidence: {
    highMin: 0.8,
    mediumMin: 0.6,
  },
  reconciliation: {
    minimumCoveragePct: 85,
    minimumToleranceUsd: 1,
    tolerancePctOfTotalFees: 2,
  },
  findingDisplay: {
    minimumAnnualImpactUsd: 10,
  },
  materialOverpayment: {
    minimumEligibleAnnualOpportunityUsd: 1000,
    minimumMonthlyOpportunityShareOfFeesPct: 10,
    minimumAnnualOpportunityForShareRuleUsd: 500,
    minimumBenchmarkGapPercentagePoints: 0.5,
    minimumModeledAnnualOpportunityForBenchmarkRuleUsd: 500,
  },
  materialVerification: {
    minimumAnnualizedAmountUsd: 250,
    minimumMonthlyShareOfFeesPct: 10,
  },
} as const;

export type SingleStatementReportV1Policy = typeof singleStatementReportV1Policy;

export type StructuredFindingCadencePolicyEntry = {
  cadence: ChargeCadence;
  methodologyLabel: string;
  limitation: string;
};

export const structuredFindingCadencePolicy: Record<StructuredFeeFindingKind, StructuredFindingCadencePolicyEntry> = {
  pci_non_compliance: {
    cadence: "monthly",
    methodologyLabel: "Approved Package 1 fee-specific cadence policy.",
    limitation: "PCI non-compliance charges are treated as monthly only when the statement exposes the amount as a structured recurring finding.",
  },
  customer_intelligence_suite: {
    cadence: "monthly",
    methodologyLabel: "Approved Package 1 fee-specific cadence policy.",
    limitation: "Customer Intelligence Suite charges are treated as monthly only when the statement exposes the amount as a structured recurring finding.",
  },
  risk_fee: {
    cadence: "unknown",
    methodologyLabel: "No approved Package 1 cadence policy.",
    limitation: "Risk-fee cadence is not assumed from the label alone, so the amount is excluded from annual opportunity unless explicit monthly evidence exists.",
  },
  non_emv: {
    cadence: "unknown",
    methodologyLabel: "Verification-only Package 1 treatment.",
    limitation: "Non-EMV amounts require documentation and are excluded from annual opportunity.",
  },
};

export type QualifiedBenchmarkRegistryEntry = {
  businessType: BusinessTypeId;
  source: BenchmarkSource;
  limitation: string;
};

const DIRECTIONAL_BENCHMARK_SOURCE: BenchmarkSource = {
  sourceId: "ratereveal_directional_business_type_ranges_2026_07",
  name: "RateReveal internal directional business-type ranges",
  version: "2026-07-24.1",
  effectiveDate: "2026-07-24",
  methodologyLabel: "Internal directional range selected from the merchant's declared business type.",
};

const DIRECTIONAL_LIMITATION =
  "This is a RateReveal internal directional reference for triage. It is not an independently verified market rate, card-network schedule, or guaranteed pricing target.";

export const qualifiedBenchmarkRegistry: Record<BusinessTypeId, QualifiedBenchmarkRegistryEntry> = {
  restaurant_food_beverage: {
    businessType: "restaurant_food_beverage",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  retail: {
    businessType: "retail",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  ecommerce: {
    businessType: "ecommerce",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  healthcare: {
    businessType: "healthcare",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  hospitality: {
    businessType: "hospitality",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  high_risk: {
    businessType: "high_risk",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  professional_services: {
    businessType: "professional_services",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
  other: {
    businessType: "other",
    source: DIRECTIONAL_BENCHMARK_SOURCE,
    limitation: DIRECTIONAL_LIMITATION,
  },
};

export function reconciliationToleranceUsd(totalFees: number, policy: SingleStatementReportV1Policy = singleStatementReportV1Policy): number {
  return Math.max(policy.reconciliation.minimumToleranceUsd, totalFees * (policy.reconciliation.tolerancePctOfTotalFees / 100));
}
