import type { CanonicalWholeStatementFeeIntelligencePacket } from "./wholeStatementFeeIntelligenceReview.js";

export function serializeWholeStatementFeeIntelligenceProviderInput(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
): string {
  return [
    "Review every admitted merchant-statement fee row in this sanitized canonical packet.",
    "Return only the requested structured object. Do not include amounts, totals, merchant identifiers, provider names, model names, prompts, raw text, file paths, customer-facing wording, opportunity, savings, state, permissions, or actions.",
    "For each admittedFeeRows item, return exactly one rowInterpretations item with the same feeRowRef and row-scoped evidenceRefs.",
    "The admittedFeeRows in this request are the complete assigned batch. Do not invent, repeat, omit, or return a feeRowRef outside this batch.",
    "Use approved_external_documentation or runtime_verified_documentation only when the row-scoped sourceProvenancePacket permits the exact source/claim-support reference. Otherwise use statement_evidence, industry_inference, merchant_evidence, or human_review.",
    "Industry inference must be limited and cannot support potentially_actionable.",
    JSON.stringify(packet),
  ].join("\n\n");
}

export function wholeStatementFeeIntelligenceProviderInputBytes(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
): number {
  return Buffer.byteLength(serializeWholeStatementFeeIntelligenceProviderInput(packet), "utf8");
}
