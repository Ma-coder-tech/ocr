import type { CanonicalAiCapabilityOutput } from "./types.js";

const FORBIDDEN_AI_FINANCIAL_KEYS = [
  "amount",
  "amountUsd",
  "amountMinor",
  "impactUsd",
  "estimatedImpact",
  "savings",
  "target",
  "calculation",
  "formula",
  "cadence",
  "ownership",
  "actionability",
  "observedAmount",
  "eligibleOpportunity",
  "eligibility",
  "reportState",
  "pricingModel",
  "pricingModelOverride",
  "parserDecisionOverride",
  "appliedParserDecisionOverride",
] as const;

const PROVIDER_DETAIL_KEYS = ["provider", "model", "adapter", "apiKey", "rawPrompt", "rawResponse", "rawError", "latencyMs", "tokenCount", "retryCount", "billing"] as const;

export function validateTypedAiCapabilityOutput(output: CanonicalAiCapabilityOutput): string[] {
  const errors: string[] = [];
  if (output.authoritative !== false) errors.push(`AI output ${output.type} must be non-authoritative.`);
  if (output.type === "whole_statement_fee_intelligence_review") {
    errors.push(
      ...unknownKeyErrors(
        output,
        [
          "type",
          "reviewPolicyVersion",
          "authoritative",
          "evidenceRefs",
          "factRefs",
          "limitationCodes",
          "reviewStatus",
          "coverageProof",
          "rowInterpretations",
          "acceptanceRecords",
          "reasonCodes",
          "financialMutationAllowed",
          "providerDetailsStripped",
        ],
        output.type,
      ),
    );
    if (output.authoritative !== false || output.financialMutationAllowed !== false || output.providerDetailsStripped !== true) {
      errors.push("AI whole-statement fee intelligence output weakens the authority boundary.");
    }
    if (output.reviewStatus === "completed" && !output.coverageProof.exactCoverage) {
      errors.push("AI whole-statement fee intelligence completed without exact fee-row coverage.");
    }
    for (const interpretation of output.rowInterpretations) {
      errors.push(
        ...unknownKeyErrors(
          interpretation,
          [
            "feeRowRef",
            "proposedCategory",
            "likelyEconomicOwner",
            "likelyContractualController",
            "proposedActionabilityCeiling",
            "confidence",
            "conciseRationale",
            "evidenceProvenance",
            "evidenceRefs",
            "externalSourceRef",
            "externalClaimSupportRef",
            "conflicts",
            "missingEvidence",
            "recommendedDisposition",
            "authoritative",
          ],
          `${output.type}.rowInterpretation`,
        ),
      );
      if (interpretation.authoritative !== false) errors.push("AI whole-statement fee intelligence interpretation must be non-authoritative.");
    }
    for (const acceptance of output.acceptanceRecords) {
      errors.push(
        ...unknownKeyErrors(
          acceptance,
          [
            "feeRowRef",
            "policyVersion",
            "status",
            "acceptedSemanticFields",
            "evidenceRefs",
            "externalSourceRef",
            "externalClaimSupportRef",
            "reasonCodes",
            "conflicts",
            "actionabilityCeiling",
            "immutableFeeRowRef",
          ],
          `${output.type}.acceptanceRecord`,
        ),
      );
      if (acceptance.feeRowRef !== acceptance.immutableFeeRowRef) errors.push("AI whole-statement fee intelligence acceptance is not tied to immutable fee row.");
    }
  }
  if (output.type === "fee_classification_review") {
    errors.push(...unknownKeyErrors(output, ["type", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "suggestions"], output.type));
    for (const suggestion of output.suggestions) {
      errors.push(...unknownKeyErrors(suggestion, ["feeRowId", "suggestedCategory", "confidence", "reasonCodes", "safeExplanation", "authoritative"], `${output.type}.suggestion`));
      if (!suggestion.feeRowId) errors.push("AI fee classification suggestion is missing feeRowId.");
      if (suggestion.authoritative !== false) errors.push("AI fee classification suggestion must be non-authoritative.");
    }
  }
  if (output.type === "full_statement_anomaly_review") {
    errors.push(...unknownKeyErrors(output, ["type", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "observations"], output.type));
    for (const observation of output.observations) {
      errors.push(...unknownKeyErrors(observation, ["id", "severity", "summary", "affectedFactRefs", "evidenceRefs", "authoritative"], `${output.type}.observation`));
      if (observation.authoritative !== false) errors.push("AI anomaly observation must be non-authoritative.");
    }
  }
  if (output.type === "notice_change_review") {
    errors.push(...unknownKeyErrors(output, ["type", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "noticeSuggestions"], output.type));
    for (const notice of output.noticeSuggestions) {
      errors.push(...unknownKeyErrors(notice, ["id", "noticeEvidenceRef", "safeSummary", "observedTextRefs", "authoritative"], `${output.type}.noticeSuggestion`));
      if (notice.authoritative !== false) errors.push("AI notice suggestion must be non-authoritative.");
    }
  }
  if (output.type === "benchmark_category_review") {
    errors.push(...unknownKeyErrors(output, ["type", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "suggestions"], output.type));
    for (const suggestion of output.suggestions) {
      errors.push(...unknownKeyErrors(suggestion, ["categoryId", "confidence", "evidenceRefs", "limitationCodes", "authoritative"], `${output.type}.suggestion`));
      if (suggestion.authoritative !== false) errors.push("AI benchmark category suggestion must be non-authoritative.");
    }
  }
  if (output.type === "merchant_narrative") {
    errors.push(...unknownKeyErrors(output, ["type", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "sections"], output.type));
    for (const section of output.sections) {
      errors.push(...unknownKeyErrors(section, ["kind", "text", "factRefs", "evidenceRefs"], `${output.type}.section`));
      if (!section.text.trim()) errors.push("AI narrative section is empty.");
      if (section.factRefs.length === 0 && section.evidenceRefs.length === 0) errors.push("AI narrative section is ungrounded.");
    }
  }
  if (output.type === "document_quality_review") {
    errors.push(...unknownKeyErrors(output, ["type", "authoritative", "evidenceRefs", "factRefs", "limitationCodes", "observations"], output.type));
    for (const observation of output.observations) {
      errors.push(...unknownKeyErrors(observation, ["id", "summary", "evidenceRefs", "authoritative"], `${output.type}.observation`));
      if (observation.authoritative !== false) errors.push("AI document quality observation must be non-authoritative.");
    }
  }
  for (const path of findForbiddenKeys(output, "", output.type)) {
    errors.push(`AI capability output contains forbidden financial-impact or provider field ${path}.`);
  }
  return errors;
}

function unknownKeyErrors(value: Record<string, unknown>, allowedKeys: readonly string[], context: string): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `AI capability output ${context} contains unknown field ${key}.`);
}

function findForbiddenKeys(value: unknown, path: string, outputType: CanonicalAiCapabilityOutput["type"]): string[] {
  if (!value || typeof value !== "object") return [];
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => hits.push(...findForbiddenKeys(item, `${path}[${index}]`, outputType)));
    return hits;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = path ? `${path}.${key}` : key;
    if (
      ((FORBIDDEN_AI_FINANCIAL_KEYS as readonly string[]).includes(key) && !isAllowedWholeStatementSemanticKey(outputType, key, nestedPath)) ||
      (PROVIDER_DETAIL_KEYS as readonly string[]).includes(key)
    ) {
      hits.push(nestedPath);
    }
    hits.push(...findForbiddenKeys(nested, nestedPath, outputType));
  }
  return hits;
}

function isAllowedWholeStatementSemanticKey(outputType: CanonicalAiCapabilityOutput["type"], key: string, path: string): boolean {
  return (
    outputType === "whole_statement_fee_intelligence_review" &&
    (key === "actionabilityCeiling" || key === "proposedActionabilityCeiling") &&
    /\b(rowInterpretations|acceptanceRecords|acceptedSemanticFields)\b/.test(path)
  );
}
