import { validateTypedAiCapabilityOutput } from "./aiCapabilityOutputs.js";
import type {
  CanonicalAiCapabilityOutput,
  CanonicalAiGroundingStatus,
  CanonicalOpportunityEngine,
  CanonicalStatementAnalysis,
} from "./types.js";

const PROHIBITED_NARRATIVE_PATTERNS = [
  /\bripped off\b/i,
  /\bcheat(?:ed|ing)?\b/i,
  /\bguarantee(?:d)?\b/i,
  /\boverpaying\b/i,
  /\bwill save\b/i,
  /\bcan remove\b/i,
  /\bprocessor (?:is |was )?(?:cheating|lying|hiding)\b/i,
  /\bverification[- ]only\b[^.]*\bsavings\b/i,
  /\bsavings\b[^.]*\bverification[- ]only\b/i,
  /\bignore (?:all )?(?:previous|prior) instructions\b/i,
  /\bsystem prompt\b/i,
  /\bapi key\b/i,
  /\bbilling\b/i,
  /\brate limit\b/i,
  /\braw error\b/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bclaude\b/i,
  /\bgpt\b/i,
];

export type GroundingGatewayResult = {
  status: CanonicalAiGroundingStatus;
  errors: string[];
};

export function evaluateAiCapabilityGrounding(
  output: CanonicalAiCapabilityOutput,
  analysis: Pick<CanonicalStatementAnalysis, "evidence" | "feeLedger" | "opportunityEngine">,
): GroundingGatewayResult {
  const errors = validateTypedAiCapabilityOutput(output);
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const feeRowIds = new Set(analysis.feeLedger.rows.map((row) => row.id));
  const componentIds = new Set(analysis.opportunityEngine.components.map((component) => component.id));

  for (const evidenceRef of collectEvidenceRefs(output)) {
    if (!evidenceIds.has(evidenceRef)) errors.push(`AI output evidence ref ${evidenceRef} is broken.`);
  }
  for (const feeRowId of collectFeeRowRefs(output)) {
    if (!feeRowIds.has(feeRowId)) errors.push(`AI output fee row ref ${feeRowId} is broken.`);
  }
  for (const factRef of output.factRefs) {
    if (factRef.startsWith("opportunityEngine.components.") && !componentIds.has(factRef.split(".").at(-1) ?? "")) {
      errors.push(`AI output opportunity component ref ${factRef} is broken.`);
    }
  }
  if (output.type === "merchant_narrative") {
    errors.push(...narrativeErrors(output.sections.map((section) => section.text), analysis.opportunityEngine));
  }
  return { status: errors.length > 0 ? "rejected" : "grounded", errors };
}

export function narrativeErrors(texts: readonly string[], opportunityEngine: CanonicalOpportunityEngine): string[] {
  const joined = texts.join(" ");
  const errors: string[] = [];
  for (const pattern of PROHIBITED_NARRATIVE_PATTERNS) {
    if (pattern.test(joined)) errors.push("AI narrative contains unsupported or non-customer-safe language.");
  }
  if (/\$|\b\d+(?:,\d{3})*(?:\.\d+)?%?\b/.test(joined)) {
    errors.push("AI narrative contains numeric or currency claims that must be populated deterministically from canonical values.");
  }
  if (opportunityEngine.summary.verificationOnlyObservedAmount.amountMinor !== 0 && !/verification-only|verification only/i.test(joined)) {
    errors.push("AI narrative omits material verification-only limitation.");
  }
  if ((opportunityEngine.summary.nonAnnualizedObservedAmount.amountMinor !== 0 || opportunityEngine.components.some((component) => component.cadence.value === "unknown")) && !/not annualized|unknown cadence|one-time/i.test(joined)) {
    errors.push("AI narrative omits material cadence or annualization limitation.");
  }
  return errors;
}

function collectEvidenceRefs(output: CanonicalAiCapabilityOutput): string[] {
  const refs = [...output.evidenceRefs];
  if (output.type === "whole_statement_fee_intelligence_review") {
    refs.push(...output.rowInterpretations.flatMap((item) => item.evidenceRefs));
    refs.push(...output.acceptanceRecords.flatMap((item) => item.evidenceRefs));
  }
  if (output.type === "full_statement_anomaly_review") refs.push(...output.observations.flatMap((item) => item.evidenceRefs));
  if (output.type === "notice_change_review") refs.push(...output.noticeSuggestions.flatMap((item) => [item.noticeEvidenceRef, ...item.observedTextRefs]));
  if (output.type === "benchmark_category_review") refs.push(...output.suggestions.flatMap((item) => item.evidenceRefs));
  if (output.type === "merchant_narrative") refs.push(...output.sections.flatMap((item) => item.evidenceRefs));
  if (output.type === "document_quality_review") refs.push(...output.observations.flatMap((item) => item.evidenceRefs));
  return refs;
}

function collectFeeRowRefs(output: CanonicalAiCapabilityOutput): string[] {
  if (output.type === "whole_statement_fee_intelligence_review") {
    return [
      ...output.rowInterpretations.map((item) => item.feeRowRef),
      ...output.acceptanceRecords.map((item) => item.feeRowRef),
      ...output.coverageProof.expectedFeeRowRefs,
      ...output.coverageProof.reviewedFeeRowRefs,
    ];
  }
  if (output.type !== "fee_classification_review") return [];
  return output.suggestions.map((item) => item.feeRowId);
}
