import { decimalRate, divideMoneyByCount } from "../money.js";
import type {
  CanonicalEconomicsV2AverageTicketMetric,
  CanonicalEconomicsV2Calculation,
  CanonicalEconomicsV2EffectiveRateMetric,
  CanonicalEconomicsV2Fact,
} from "./types.js";
import type { MoneyAmount } from "../types.js";

type MoneyFact<TPopulation extends string> = CanonicalEconomicsV2Fact<MoneyAmount, TPopulation>;
type CountFact<TPopulation extends string> = CanonicalEconomicsV2Fact<number, TPopulation>;

export function buildHeadlineEffectiveRate(input: {
  fees: MoneyFact<"total_statement_processing_fees">;
  netSubmitted: MoneyFact<"canonical_net_submitted_card_volume">;
}): { metric: CanonicalEconomicsV2EffectiveRateMetric; calculation: CanonicalEconomicsV2Calculation | null } {
  return buildRateMetric({
    id: "metric_v2_headline_effective_rate",
    fees: input.fees,
    denominator: input.netSubmitted,
    denominatorPopulation: "canonical_net_submitted_card_volume",
    calculationId: "calc_v2_headline_effective_rate",
    formula: "fees_divided_by_net_submitted",
  });
}

export function buildGrossBasedRateDiagnostic(input: {
  fees: MoneyFact<"total_statement_processing_fees">;
  grossSales: MoneyFact<"gross_sale_volume">;
}): { metric: CanonicalEconomicsV2EffectiveRateMetric; calculation: CanonicalEconomicsV2Calculation | null } {
  return buildRateMetric({
    id: "metric_v2_gross_based_rate_diagnostic",
    fees: input.fees,
    denominator: input.grossSales,
    denominatorPopulation: "gross_sale_volume",
    calculationId: "calc_v2_gross_based_rate_diagnostic",
    formula: "fees_divided_by_gross_sales",
  });
}

export function buildHeadlineAverageTicket(input: {
  grossSales: MoneyFact<"gross_sale_volume">;
  grossSaleCount: CountFact<"gross_sale_transaction_count">;
}): { metric: CanonicalEconomicsV2AverageTicketMetric; calculation: CanonicalEconomicsV2Calculation | null } {
  const base = {
    id: "metric_v2_headline_average_ticket",
    numeratorFactRef: input.grossSales.id,
    denominatorFactRef: input.grossSaleCount.id,
    numeratorPopulation: "gross_sale_volume" as const,
    denominatorPopulation: "gross_sale_transaction_count" as const,
  };

  if (input.grossSales.status !== "available" || !input.grossSales.value) {
    return {
      metric: {
        ...base,
        state: input.grossSales.status === "ambiguous" ? "population_unproven" : "unavailable_numerator",
        value: null,
        calculationRef: null,
        limitations: ["Gross-sale volume is not proven."],
      },
      calculation: null,
    };
  }
  if (input.grossSaleCount.status !== "available" || input.grossSaleCount.value === null) {
    return {
      metric: {
        ...base,
        state: input.grossSaleCount.status === "ambiguous" ? "population_unproven" : "unavailable_denominator",
        value: null,
        calculationRef: null,
        limitations: ["Gross-sale transaction count is not proven."],
      },
      calculation: null,
    };
  }
  if (input.grossSaleCount.value === 0) {
    return {
      metric: {
        ...base,
        state: "undefined_zero_count",
        value: null,
        calculationRef: null,
        limitations: ["Average ticket is undefined because the proven gross-sale transaction count is zero."],
      },
      calculation: null,
    };
  }
  const value = divideMoneyByCount(input.grossSales.value, input.grossSaleCount.value);
  if (!value) {
    return {
      metric: {
        ...base,
        state: "population_unproven",
        value: null,
        calculationRef: null,
        limitations: ["Gross-sale numerator and denominator could not be evaluated safely."],
      },
      calculation: null,
    };
  }
  const calculation: CanonicalEconomicsV2Calculation = {
    id: "calc_v2_headline_average_ticket",
    formula: "gross_sales_divided_by_gross_sale_count",
    policyVersion: "canonical_average_ticket_v2_foundation_v1",
    inputFactRefs: [input.grossSales.id, input.grossSaleCount.id],
    resultFactRef: base.id,
  };
  return {
    metric: {
      ...base,
      state: "defined",
      value,
      calculationRef: calculation.id,
      limitations: [],
    },
    calculation,
  };
}

function buildRateMetric<TPopulation extends "canonical_net_submitted_card_volume" | "gross_sale_volume">(input: {
  id: string;
  fees: MoneyFact<"total_statement_processing_fees">;
  denominator: MoneyFact<TPopulation>;
  denominatorPopulation: TPopulation;
  calculationId: string;
  formula: "fees_divided_by_net_submitted" | "fees_divided_by_gross_sales";
}): { metric: CanonicalEconomicsV2EffectiveRateMetric; calculation: CanonicalEconomicsV2Calculation | null } {
  const base = {
    id: input.id,
    numeratorFactRef: input.fees.id,
    denominatorFactRef: input.denominator.id,
    numeratorPopulation: "total_statement_processing_fees" as const,
    denominatorPopulation: input.denominatorPopulation,
  };
  if (input.fees.status !== "available" || !input.fees.value) {
    return {
      metric: {
        ...base,
        state: input.fees.status === "ambiguous" ? "population_unproven" : "unavailable_numerator",
        value: null,
        calculationRef: null,
        limitations: ["The authoritative statement-processing-fee numerator is not proven."],
      },
      calculation: null,
    };
  }
  if (input.denominator.status !== "available" || !input.denominator.value) {
    return {
      metric: {
        ...base,
        state: input.denominator.status === "ambiguous" ? "population_unproven" : "unavailable_denominator",
        value: null,
        calculationRef: null,
        limitations: ["The required denominator population is not proven."],
      },
      calculation: null,
    };
  }
  if (input.denominator.value.amountMinor === 0) {
    return {
      metric: {
        ...base,
        state: "undefined_zero_denominator",
        value: null,
        calculationRef: null,
        limitations: ["Effective rate is undefined because the proven denominator is zero."],
      },
      calculation: null,
    };
  }
  const value = decimalRate(input.fees.value, input.denominator.value, 6);
  if (value === null) {
    return {
      metric: {
        ...base,
        state: "population_unproven",
        value: null,
        calculationRef: null,
        limitations: ["The numerator and denominator could not be evaluated safely."],
      },
      calculation: null,
    };
  }
  const calculation: CanonicalEconomicsV2Calculation = {
    id: input.calculationId,
    formula: input.formula,
    policyVersion: "canonical_effective_rate_v2_foundation_v1",
    inputFactRefs: [input.fees.id, input.denominator.id],
    resultFactRef: input.id,
  };
  return {
    metric: {
      ...base,
      state: "defined",
      value,
      calculationRef: calculation.id,
      limitations: [],
    },
    calculation,
  };
}
