import { decimalRate } from "./money.js";
import { selectedFact, unavailableFact } from "./facts.js";
import type {
  CanonicalEffectiveRateBasis,
  CanonicalFactValue,
  CanonicalVolumePopulation,
  DecimalString,
  MoneyAmount,
} from "./types.js";

export function buildEffectiveRateFacts(input: {
  processedSales: CanonicalFactValue<MoneyAmount>;
  totalFees: CanonicalFactValue<MoneyAmount>;
  denominatorVolumeBasis: CanonicalVolumePopulation;
  refundsPresent: boolean;
  adjustmentsPresent: boolean;
  calculationRef: string;
}): {
  basis: CanonicalEffectiveRateBasis;
  rateRevealCalculatedAllInRate: CanonicalFactValue<DecimalString>;
  processorStatedRate: CanonicalFactValue<DecimalString | null>;
} {
  const computed =
    input.processedSales.value && input.totalFees.value ? decimalRate(input.totalFees.value, input.processedSales.value) : null;
  const processorStatedRate = unavailableFact<DecimalString | null>("Processor-stated effective rate was not separately verified.");

  const basis: CanonicalEffectiveRateBasis = {
    policyVersion: "effective_rate_basis_v1",
    numeratorFeeBasis: input.totalFees.value ? "all_in_processing_fees" : "unsupported",
    denominatorVolumeBasis: input.denominatorVolumeBasis,
    refundsTreatment: input.refundsPresent ? "unknown" : "not_present",
    cashAdvanceTreatment: "unknown",
    equipmentFeeTreatment: "unknown",
    chargebackTreatment: input.adjustmentsPresent ? "unknown" : "not_present",
    oneTimeFeeTreatment: "unknown",
    populationCompatibility: computed ? "compatible" : "not_evaluated",
    rateSource: computed ? "ratereveal_calculated" : "unavailable",
    processorStatedRate,
    calculationRef: computed ? input.calculationRef : undefined,
    explanation:
      "RateReveal-calculated all-in fee rate is tracked separately from any processor-stated rate and uses the selected fee and sales populations under effective_rate_basis_v1.",
  };

  return {
    basis,
    processorStatedRate,
    rateRevealCalculatedAllInRate: computed
      ? selectedFact({
          value: computed,
          confidence: "high",
          evidenceRefs: [...input.processedSales.evidenceRefs, ...input.totalFees.evidenceRefs],
          calculationRef: input.calculationRef,
          selectionReason: "Calculated from canonical selected total fees divided by canonical selected processed sales.",
        })
      : unavailableFact("RateReveal-calculated all-in fee rate requires verified processed sales and total fees."),
  };
}
