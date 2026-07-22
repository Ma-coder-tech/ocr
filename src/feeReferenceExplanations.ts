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
  if (!pattern) return { pattern: null, explanation: "Ask your processor for details about this fee." };
  if (pattern.cause || pattern.fix) {
    return { pattern, explanation: merchantFacingExplanation([pattern.cause, pattern.fix].filter(Boolean).join(" ")) };
  }
  return { pattern, explanation: merchantFacingExplanation(pattern.recommendation ?? "Ask your processor for details about this fee.") };
}

function merchantFacingExplanation(value: string): string {
  return value
    .replace(
      "No regulatory mandate requires this specific fee. This is processor revenue with a compliance-sounding name. Request removal.",
      "We couldn't tie this fee to a published card brand requirement. Ask your processor to remove it or show the specific rule behind it.",
    )
    .replace(
      "This is a per-authorization fee charged by the processor. It is applied to every card transaction and is negotiable. If multiple per-auth fees are stacked, the total per-authorization cost may be higher than competitive rates.",
      "You paid a processor-controlled per-transaction fee. Competitive pricing is usually lower, and stacked per-item fees are worth negotiating.",
    )
    .replace(
      "This is a per-authorization fee charged by the processor on every card transaction. The rate is processor-controlled and negotiable. Compare the rate against competitive benchmarks for your volume level.",
      "You paid a processor-controlled per-transaction fee. Compare it with competitive pricing for your volume and ask for a lower rate.",
    )
    .replace("Contact your processor", "Ask your processor")
    .replace(/\bper-authorization\b/gi, "per-transaction")
    .replace(/\bper-auth\b/gi, "per-transaction");
}
