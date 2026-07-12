import { loadMccBenchmarkReference, matchBenchmarkPattern, type MccBenchmarkPattern } from "./mccBenchmarkReference.js";

export type FeeReferenceExplanation = {
  pattern: MccBenchmarkPattern | null;
  explanation: string;
};

export function explainFeeFromReference(feeName: string): FeeReferenceExplanation {
  const reference = loadMccBenchmarkReference();
  const pattern =
    matchBenchmarkPattern(feeName, reference.penalty_fee_patterns.fees) ??
    matchBenchmarkPattern(feeName, reference.processor_per_auth_patterns.fees) ??
    matchBenchmarkPattern(feeName, reference.network_fee_patterns.fees) ??
    matchBenchmarkPattern(feeName, reference.junk_fee_patterns.fees);
  if (!pattern) return { pattern: null, explanation: "Contact your processor for details about this fee." };
  if (pattern.cause || pattern.fix) {
    return { pattern, explanation: [pattern.cause, pattern.fix].filter(Boolean).join(" ") };
  }
  return { pattern, explanation: pattern.recommendation ?? "Contact your processor for details about this fee." };
}
