import type { CanonicalStatementAnalysis, MoneyAmount } from "../types.js";
import { sameMoney } from "./facts.js";
import type {
  CanonicalEconomicsV2ComparisonItem,
  CanonicalEconomicsV2ComparisonReport,
  CanonicalEconomicsV2DifferenceClassification,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2SemanticAmendmentId,
} from "./types.js";

export function compareCanonicalV1ToV2(
  v1: CanonicalStatementAnalysis,
  v2: CanonicalEconomicsV2Foundation,
): CanonicalEconomicsV2ComparisonReport {
  const items: CanonicalEconomicsV2ComparisonItem[] = [];
  items.push(compareMoney({
    fact: "net_submitted",
    v1: v1.financialFacts.processedSales.value,
    v2Status: v2.financialPopulations.canonicalNetSubmittedCardVolume.status,
    v2: v2.financialPopulations.canonicalNetSubmittedCardVolume.value,
  }));
  items.push(compareMoney({
    fact: "total_statement_processing_fees",
    v1: v1.financialFacts.totalFees.value,
    v2Status: v2.financialPopulations.totalStatementProcessingFees.status,
    v2: v2.financialPopulations.totalStatementProcessingFees.value,
  }));
  items.push(compareMoney({
    fact: "refund_volume",
    v1: v1.financialFacts.refunds.value,
    v2Status: v2.financialPopulations.refundVolume.status,
    v2: v2.financialPopulations.refundVolume.value,
  }));
  items.push(compareMoney({
    fact: "net_funded",
    v1: v1.financialFacts.amountFunded.value,
    v2Status: v2.financialPopulations.netFundedAmount.status,
    v2: v2.financialPopulations.netFundedAmount.value,
  }));
  items.push({
    fact: "simultaneous_gross_refund_net_populations",
    classification: "approved_semantic_amendment",
    amendmentId: "RB-AMEND-001-MULTI-POPULATION",
    reasonCode: "v2_preserves_simultaneous_financial_populations",
  });
  items.push(compareRate(v1, v2));
  items.push(compareAverageTicket(v1, v2));
  items.push(compareCount({
    fact: "refund_transaction_count",
    v1: v1.financialFacts.transactionCounts.refunds.value,
    v2Status: v2.financialPopulations.refundTransactionCount.status,
    v2: v2.financialPopulations.refundTransactionCount.value,
  }));
  items.push(compareGrossSaleCount(v1, v2));
  items.push({
    fact: "adjustment_refund_credit_chargeback_direction",
    classification: "approved_semantic_amendment",
    amendmentId: "RB-AMEND-004-FINANCIAL-DIRECTION",
    reasonCode: "v2_separates_financial_directions_and_populations",
  });
  if (v2.sourceModel.representationGroups.length > 0) {
    items.push({
      fact: "repeated_source_representations",
      classification: "approved_semantic_amendment",
      amendmentId: "RB-AMEND-005-REPRESENTATION-CONTRIBUTION",
      reasonCode: "v2_records_one_authoritative_contributor",
    });
  }

  const counts: Record<CanonicalEconomicsV2DifferenceClassification, number> = {
    same_semantic_fact: 0,
    approved_semantic_amendment: 0,
    v2_unavailable_or_ambiguous: 0,
    unexpected_divergence: 0,
  };
  for (const item of items) counts[item.classification] += 1;
  return {
    policyVersion: "canonical_v1_v2_shadow_comparison_v1",
    sourceDocumentRef: v2.identity.sourceDocumentRef,
    items,
    counts,
    hasUnexpectedDivergence: counts.unexpected_divergence > 0,
  };
}

function compareCount(input: {
  fact: string;
  v1: number | null;
  v2Status: CanonicalEconomicsV2Foundation["financialPopulations"][keyof CanonicalEconomicsV2Foundation["financialPopulations"]]["status"];
  v2: number | null;
}): CanonicalEconomicsV2ComparisonItem {
  if (input.v2Status !== "available") {
    return { fact: input.fact, classification: "v2_unavailable_or_ambiguous", amendmentId: null, reasonCode: "v2_source_population_not_proven" };
  }
  return input.v1 === input.v2
    ? { fact: input.fact, classification: "same_semantic_fact", amendmentId: null, reasonCode: "v1_v2_count_equal" }
    : { fact: input.fact, classification: "unexpected_divergence", amendmentId: null, reasonCode: "v1_v2_count_mismatch" };
}

function compareGrossSaleCount(
  v1: CanonicalStatementAnalysis,
  v2: CanonicalEconomicsV2Foundation,
): CanonicalEconomicsV2ComparisonItem {
  const fact = v2.financialPopulations.grossSaleTransactionCount;
  if (fact.status !== "available") {
    return { fact: "gross_sale_transaction_count", classification: "v2_unavailable_or_ambiguous", amendmentId: null, reasonCode: "v2_gross_sale_population_not_proven" };
  }
  if (v1.financialFacts.averageTicketBasis.selectedVolumePopulation !== "gross_sales" ||
      v1.financialFacts.averageTicketBasis.selectedCountType !== "card_type_items") {
    return amendmentItem("gross_sale_transaction_count", "RB-AMEND-003-GROSS-AVERAGE-TICKET", "v1_count_population_is_not_proven_gross_sale_count");
  }
  return compareCount({
    fact: "gross_sale_transaction_count",
    v1: v1.financialFacts.transactionCounts.cardTypeItems.value,
    v2Status: fact.status,
    v2: fact.value,
  });
}

export function assertNoUnexpectedCanonicalV2Divergence(report: CanonicalEconomicsV2ComparisonReport): void {
  if (report.hasUnexpectedDivergence) {
    const facts = report.items.filter((item) => item.classification === "unexpected_divergence").map((item) => item.fact);
    throw new Error(`Unexpected Canonical V1/V2 divergence requires product-owner review: ${facts.join(", ")}`);
  }
}

function compareMoney(input: {
  fact: string;
  v1: MoneyAmount | null;
  v2Status: CanonicalEconomicsV2Foundation["financialPopulations"][keyof CanonicalEconomicsV2Foundation["financialPopulations"]]["status"];
  v2: MoneyAmount | null;
}): CanonicalEconomicsV2ComparisonItem {
  if (input.v2Status === "unavailable" || input.v2Status === "ambiguous" || input.v2Status === "unsupported") {
    return { fact: input.fact, classification: "v2_unavailable_or_ambiguous", amendmentId: null, reasonCode: "v2_source_population_not_proven" };
  }
  return sameMoney(input.v1, input.v2)
    ? { fact: input.fact, classification: "same_semantic_fact", amendmentId: null, reasonCode: "v1_v2_money_equal" }
    : { fact: input.fact, classification: "unexpected_divergence", amendmentId: null, reasonCode: "v1_v2_money_mismatch" };
}

function compareRate(v1: CanonicalStatementAnalysis, v2: CanonicalEconomicsV2Foundation): CanonicalEconomicsV2ComparisonItem {
  const v1Rate = v1.financialFacts.rateRevealCalculatedAllInRate.value;
  const v2Rate = v2.metrics.headlineEffectiveRate;
  if (v2Rate.state === "undefined_zero_denominator") {
    return amendmentItem("headline_effective_rate", "RB-AMEND-002-UNDEFINED-RATE", "v2_zero_denominator_is_explicitly_undefined");
  }
  if (v2Rate.state !== "defined") {
    return { fact: "headline_effective_rate", classification: "v2_unavailable_or_ambiguous", amendmentId: null, reasonCode: "v2_rate_population_not_proven" };
  }
  return v1Rate === v2Rate.value
    ? { fact: "headline_effective_rate", classification: "same_semantic_fact", amendmentId: null, reasonCode: "v1_v2_rate_equal" }
    : { fact: "headline_effective_rate", classification: "unexpected_divergence", amendmentId: null, reasonCode: "v1_v2_rate_mismatch" };
}

function compareAverageTicket(v1: CanonicalStatementAnalysis, v2: CanonicalEconomicsV2Foundation): CanonicalEconomicsV2ComparisonItem {
  const v2Average = v2.metrics.headlineAverageTicket;
  if (v2Average.state !== "defined") {
    return { fact: "headline_average_ticket", classification: "v2_unavailable_or_ambiguous", amendmentId: null, reasonCode: "v2_gross_populations_not_proven" };
  }
  const v1Basis = v1.financialFacts.averageTicketBasis;
  if (v1Basis.selectedVolumePopulation !== "gross_sales" || v1Basis.selectedCountType !== "card_type_items") {
    return amendmentItem("headline_average_ticket", "RB-AMEND-003-GROSS-AVERAGE-TICKET", "v2_uses_frozen_gross_sale_populations");
  }
  return sameMoney(v1.financialFacts.averageTicket.value, v2Average.value)
    ? { fact: "headline_average_ticket", classification: "same_semantic_fact", amendmentId: null, reasonCode: "v1_v2_average_ticket_equal" }
    : { fact: "headline_average_ticket", classification: "unexpected_divergence", amendmentId: null, reasonCode: "v1_v2_average_ticket_mismatch" };
}

function amendmentItem(
  fact: string,
  amendmentId: CanonicalEconomicsV2SemanticAmendmentId,
  reasonCode: string,
): CanonicalEconomicsV2ComparisonItem {
  return { fact, classification: "approved_semantic_amendment", amendmentId, reasonCode };
}
