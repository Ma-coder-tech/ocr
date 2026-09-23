import type { CanonicalConfidence, MoneyAmount } from "../canonical/types.js";

export const FACT_PACKET_VERSION = "fiserv_fact_packet_proof_v1" as const;
export const CONTEXTUAL_ASSESSMENT_VERSION = "fiserv_contextual_assessment_proof_v1" as const;
export const MODELED_SCENARIO_VERSION = "fiserv_modeled_scenario_proof_v1" as const;

export type ProofFact<T> = {
  status: "selected" | "unavailable";
  value: T | null;
  confidence: CanonicalConfidence | null;
  evidenceRefs: string[];
  calculationRef: string | null;
  limitations: string[];
};

export type FiservFactPacketV1 = {
  contractVersion: typeof FACT_PACKET_VERSION;
  source: {
    canonicalAnalysisId: string;
    canonicalSchemaVersion: string;
    parserId: string | null;
    processorFamily: string | null;
    statementFamily: string | null;
    supportedFiserv: boolean;
  };
  context: {
    businessType: ProofFact<string>;
    statementPeriod: ProofFact<{ start: string; end: string }>;
    pricingModel: ProofFact<string>;
  };
  observed: {
    processedVolume: ProofFact<MoneyAmount>;
    totalFees: ProofFact<MoneyAmount>;
    allInEffectiveRate: ProofFact<{ decimalRate: string; numeratorBasis: string; denominatorBasis: string }>;
    compatibleTransactionCount: ProofFact<{ count: number; population: "submitted_transactions" | "settled_transactions" }>;
    averageTicket: ProofFact<MoneyAmount>;
    feeComposition: {
      status: "available" | "partial" | "unavailable";
      countedRowCount: number;
      uniqueChargeTotal: MoneyAmount | null;
      visiblePricingFeeRows: Array<{ feeRowId: string; amount: MoneyAmount; evidenceRefs: string[] }>;
      limitations: string[];
    };
    observedRateCount: number;
    observedItemCountRowCount: number;
  };
  reconciliation: {
    canonicalValidation: "valid" | "valid_with_warnings" | "invalid";
    parserReportable: boolean;
    parserFeeBucket: "pass" | "warning" | "fail" | "not_applicable" | "unavailable";
    parserEffectiveRate: "pass" | "warning" | "fail" | "not_applicable" | "unavailable";
    selectedTotalsAgreeWithParser: boolean;
    coreTotalsReconciled: boolean;
  };
  limitations: string[];
  missingContext: string[];
};

export type ReviewedContextualKnowledgeV1 = {
  knowledgeId: string;
  version: string;
  reviewAuthority: "Product";
  provenance: string;
  reviewedOn: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  scope: {
    processorFamily: "Fiserv / First Data";
    statementCount: 1;
    pricingModels: "any_including_unknown";
    businessCategories: "any_selected_category";
    monthlyVolume: "positive_selected_volume";
    channelAndCardMix: "not_required";
    basisCompatibility: "compatible_all_in_rate";
  };
  uncertainty: string;
};

export type FiservContextualAssessmentV1 = {
  contractVersion: typeof CONTEXTUAL_ASSESSMENT_VERSION;
  factPacketVersion: typeof FACT_PACKET_VERSION;
  knowledge: ReviewedContextualKnowledgeV1;
  status: "deserves_review" | "not_assessed";
  observed: string[];
  rationale: string;
  evidenceRefs: string[];
  confidence: "high" | "medium" | "low" | null;
  applicability: { matched: boolean; reasonCodes: string[] };
  limitations: string[];
  evidenceToReduceUncertainty: string[];
};

export type ProductRateChangeAssumptionV1 = {
  source: "product_supplied_illustrative";
  assumptionId: string;
  rateChangeBasisPoints: number;
  label: string;
};

export type FiservModeledScenarioV1 = {
  contractVersion: typeof MODELED_SCENARIO_VERSION;
  factPacketVersion: typeof FACT_PACKET_VERSION;
  kind: "modeled_financial_effect";
  status: "modeled" | "unavailable";
  reasonCodes: string[];
  statementPeriod: { start: string; end: string } | null;
  compatibleMonthlyVolume: MoneyAmount | null;
  suppliedAssumption: ProductRateChangeAssumptionV1;
  monthlyModeledFinancialEffect: MoneyAmount | null;
  annualizedModeledFinancialEffect: MoneyAmount | null;
  formula: "monthly_volume_times_rate_change; annual_volume_assumed_twelve_equal_months";
  rounding: "round_each_displayed_effect_to_nearest_cent_half_up";
  assumptions: string[];
  merchantFacingAssumptions: string[];
  sourceFacts: Array<{ path: string; evidenceRefs: string[]; calculationRef: string | null }>;
  limitations: string[];
};
