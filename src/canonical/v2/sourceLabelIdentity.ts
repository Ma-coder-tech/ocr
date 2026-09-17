export type ObservationCalculationSuffixKind =
  | "none"
  | "transaction_count_at_rate"
  | "rate_times_amount"
  | "transaction_count_totaling_amount";

export type NormalizedObservationLabel = {
  exactNormalizedLabel: string;
  calculationFreeLabel: string;
  calculationSuffixKind: ObservationCalculationSuffixKind;
};

/**
 * Produces source-surface identity only. It removes presentation calculations
 * but never assigns economic meaning, ownership, control, or actionability.
 */
export function normalizeObservationLabel(value: string): NormalizedObservationLabel {
  const exactNormalizedLabel = value.toLowerCase().replace(/\[redacted-id\]/g, " redacted id ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const suffixes: Array<[ObservationCalculationSuffixKind, RegExp]> = [
    ["transaction_count_at_rate", /\s+\d+\s+transactions?\s+at\s+.+$/],
    ["transaction_count_totaling_amount", /\s+\d+\s+trans\s+totaling\s+.+$/],
    ["rate_times_amount", /\s+(?:\d|redacted\s+id)(?:[a-z0-9 ]*?)\s+(?:disc\s+rate\s+)?times(?:\s+.*)?$/],
  ];
  for (const [kind, expression] of suffixes) {
    const calculationFreeLabel = exactNormalizedLabel.replace(expression, "").trim();
    if (calculationFreeLabel !== exactNormalizedLabel && calculationFreeLabel.length > 0) {
      return { exactNormalizedLabel, calculationFreeLabel, calculationSuffixKind: kind };
    }
  }
  return { exactNormalizedLabel, calculationFreeLabel: exactNormalizedLabel, calculationSuffixKind: "none" };
}
