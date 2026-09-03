import { moneyFromNumber } from "../money.js";
import type { MoneyAmount } from "../types.js";
import type {
  CanonicalEconomicsV2Availability,
  CanonicalEconomicsV2Confidence,
  CanonicalEconomicsV2Fact,
  CanonicalEconomicsV2SourceProvenance,
} from "./types.js";

export const V2_POPULATION_DEFINITIONS = {
  gross_sale_volume: "Gross card-sale activity before statement-recognized refunds.",
  refund_volume: "Statement-recognized sales refunds or credit vouchers in the submitted-volume equation.",
  canonical_net_submitted_card_volume:
    "Gross card sales less statement-recognized refunds, before fees, chargebacks, adjustments, reserves, or funding effects.",
  third_party_transaction_volume: "Third-party funding volume excluded by the admitted funding equation.",
  total_statement_processing_fees: "Unique authoritative statement processing fees after proven fee credits, excluding non-fee funding activity.",
  fee_credit_amount: "Credits proven by authoritative fee-section evidence to reduce the statement processing-fee total.",
  settlement_adjustment_amount: "Signed settlement or funding adjustments that do not enter processing-fee totals.",
  chargeback_principal_debit_amount: "Gross chargeback principal debits that reduce funding and do not enter processing fees.",
  chargeback_representment_amount: "Gross representment or reversal amounts that restore funding and remain separate from chargeback debits.",
  chargeback_fee_amount: "Fees for chargeback handling proven in an authoritative fee population, excluding dispute principal.",
  net_funded_amount: "Net amount funded or processed after the admitted family-specific funding equation.",
  unresolved_adjustment_chargeback_amount:
    "A processor-presented combined adjustments/chargebacks amount preserved at its source meaning without asserting a stronger split population.",
  gross_sale_transaction_count: "Count of gross sale transactions compatible with gross sale volume.",
  refund_transaction_count: "Count of statement-recognized refund transactions.",
  submitted_transaction_count: "Count explicitly identified as submitted transactions.",
  settled_transaction_count: "Count explicitly identified as settled transactions.",
  authorization_count: "Count explicitly identified as authorization events.",
  chargeback_count: "Count of chargeback principal events proven by source evidence.",
  funding_batch_count: "Count of source funding batches in the admitted funding population.",
} as const;

type PopulationName = keyof typeof V2_POPULATION_DEFINITIONS;

export function availableV2Fact<T, TPopulation extends PopulationName>(input: {
  id: string;
  population: TPopulation;
  value: T;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  confidence?: CanonicalEconomicsV2Confidence;
  evidenceRefs?: string[];
  occurrenceRefs?: string[];
  calculationRef?: string | null;
  limitations?: string[];
}): CanonicalEconomicsV2Fact<T, TPopulation> {
  return {
    id: input.id,
    status: "available",
    population: input.population,
    populationDefinition: V2_POPULATION_DEFINITIONS[input.population],
    value: input.value,
    confidence: input.confidence ?? "high",
    provenanceStatus: input.provenanceStatus,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    occurrenceRefs: unique(input.occurrenceRefs ?? []),
    calculationRef: input.calculationRef ?? null,
    limitations: unique(input.limitations ?? []),
  };
}

export function unavailableV2Fact<T, TPopulation extends PopulationName>(input: {
  id: string;
  population: TPopulation;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  status?: Exclude<CanonicalEconomicsV2Availability, "available">;
  evidenceRefs?: string[];
  occurrenceRefs?: string[];
  limitations: string[];
}): CanonicalEconomicsV2Fact<T, TPopulation> {
  return {
    id: input.id,
    status: input.status ?? "unavailable",
    population: input.population,
    populationDefinition: V2_POPULATION_DEFINITIONS[input.population],
    value: null,
    confidence: null,
    provenanceStatus: input.provenanceStatus,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    occurrenceRefs: unique(input.occurrenceRefs ?? []),
    calculationRef: null,
    limitations: unique(input.limitations),
  };
}

export function moneyFactFromNumber<TPopulation extends PopulationName>(input: {
  id: string;
  population: TPopulation;
  value: number | null;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  confidence?: CanonicalEconomicsV2Confidence;
  evidenceRefs?: string[];
  occurrenceRefs?: string[];
  limitationsIfUnavailable: string[];
}): CanonicalEconomicsV2Fact<MoneyAmount, TPopulation> {
  const value = input.value === null ? null : moneyFromNumber(input.value);
  if (!value) {
    return unavailableV2Fact({
      id: input.id,
      population: input.population,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: input.evidenceRefs,
      occurrenceRefs: input.occurrenceRefs,
      limitations: input.limitationsIfUnavailable,
    });
  }
  return availableV2Fact({
    id: input.id,
    population: input.population,
    value,
    provenanceStatus: input.provenanceStatus,
    confidence: input.confidence,
    evidenceRefs: input.evidenceRefs,
    occurrenceRefs: input.occurrenceRefs,
  });
}

export function countFactFromNumber<TPopulation extends PopulationName>(input: {
  id: string;
  population: TPopulation;
  value: number | null;
  provenanceStatus: CanonicalEconomicsV2SourceProvenance;
  evidenceRefs?: string[];
  occurrenceRefs?: string[];
  limitationsIfUnavailable: string[];
}): CanonicalEconomicsV2Fact<number, TPopulation> {
  if (input.value === null || !Number.isSafeInteger(input.value) || input.value < 0) {
    return unavailableV2Fact({
      id: input.id,
      population: input.population,
      provenanceStatus: input.provenanceStatus,
      evidenceRefs: input.evidenceRefs,
      occurrenceRefs: input.occurrenceRefs,
      limitations: input.limitationsIfUnavailable,
    });
  }
  return availableV2Fact({
    id: input.id,
    population: input.population,
    value: input.value,
    provenanceStatus: input.provenanceStatus,
    evidenceRefs: input.evidenceRefs,
    occurrenceRefs: input.occurrenceRefs,
  });
}

export function sameMoney(left: MoneyAmount | null, right: MoneyAmount | null): boolean {
  if (!left || !right) return left === right;
  return left.currency === right.currency && left.amountMinor === right.amountMinor;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
