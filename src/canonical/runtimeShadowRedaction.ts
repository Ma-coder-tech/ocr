export type RedactedCanonicalShadowDiagnostic = {
  schemaVersion: "canonical_shadow_diagnostic_v1";
  policyVersion: "canonical_runtime_shadow_policy_v1";
  status: "completed" | "canonical_validation_failed" | "shadow_failed";
  runtimeDocumentRef: string;
  durationMs: number;
  sourceType: "csv" | "pdf";
  businessTypeProvided: boolean;
  constructionStageReached:
    | "disabled"
    | "adapter_input_prepared"
    | "canonical_analysis_built"
    | "canonical_analysis_validated"
    | "canonical_validation_failed"
    | "shadow_failed";
  validationFailureCodes: string[];
  preValidationCoreFactAvailability: {
    processedSales: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
    totalFees: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
    statementPeriod: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
    effectiveRate: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
    transactionCount: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
    averageTicket: "selected" | "unavailable" | "ambiguous" | "unsupported" | "not_applicable";
  };
  preValidationLedgerStatus: "available" | "partial" | "unavailable" | "not_built";
  inputAdmission: Array<{
    input: string;
    status: "canonical_evidence" | "provisional_with_limitation" | "diagnostic_only" | "rejected" | "unavailable";
    reasonCode: string;
  }>;
  canonicalSummary: {
    validationStatus: "valid" | "valid_with_warnings" | "invalid" | "unavailable";
    readinessStatus: "schema_valid" | "financially_ready" | "limited" | "withheld" | "unavailable";
    warningCount: number;
    errorCount: number;
    primaryState: string | null;
    feeRowCount: number;
    uniqueFeeRowCount: number;
    duplicateRepresentationCount: number;
    ownershipBucketCounts: CanonicalShadowBucketCount[];
    actionabilityBucketCounts: CanonicalShadowBucketCount[];
    opportunityTotals: {
      deterministicEligibleAnnual: { amountMinor: number; currency: "USD"; purpose: "deterministic_eligible_annual" };
      approvedEstimatedAnnual: { amountMinor: number; currency: "USD"; purpose: "approved_estimated_annual" };
      verificationOnlyObserved: { amountMinor: number; currency: "USD"; purpose: "verification_only_observed" };
      excludedObserved: { amountMinor: number; currency: "USD"; purpose: "excluded_observed" };
      nonAnnualizedObserved: { amountMinor: number; currency: "USD"; purpose: "non_annualized_observed" };
    };
    benchmarkStatus: string | null;
    benchmarkPosition: string | null;
    permissionDecisionCounts: { permitted: number; denied: number };
    actionGuidanceTypeCounts: Record<string, number>;
    explanationReadiness: string | null;
  };
  comparison: {
    categories: Record<"expected_improvement" | "known_legacy_defect" | "canonical_regression" | "requires_human_review", number>;
    differences: Array<{
      key: string;
      category: "expected_improvement" | "known_legacy_defect" | "canonical_regression" | "requires_human_review";
      reasonCode: string;
      legacy: unknown;
      canonical: unknown;
    }>;
  };
};

export type CanonicalShadowBucketCount = {
  bucket: string;
  count: number;
};

const SENSITIVE_KEY_PATTERN =
  /merchant|account|identifier|file(name)?|path|hash|raw|prompt|response|provider|model|api.?key|billing|excerpt|text|statementFilename|sourceFileName/i;
const SENSITIVE_VALUE_PATTERNS = [
  /\/Users\//i,
  /(?:^|[\\/\s])(?:uploads|artifacts|statements?)(?:[\\/\s]|$)/i,
  /\b[\w.-]+\.(?:pdf|csv|png|jpe?g|json|log)\b/i,
  /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{12,}\b/,
  /\b(?:acct|account|merchant|mid)\b\s*[:#-]?\s*[A-Za-z0-9-]{4,}/i,
  /^merchant_contract$/i,
  /\bmerchant\s+contract\b\s*:/i,
  /\b(?:raw statement text|evidence excerpt|prompt|response|model error|provider error|api.?key|billing)\b/i,
  /\b[A-Fa-f0-9]{32,}\b/,
  /\b(?:anthropic|openai|claude|gpt|provider error|stack trace)\b/i,
];

export function assertRedactedCanonicalShadowDiagnostic(value: RedactedCanonicalShadowDiagnostic): RedactedCanonicalShadowDiagnostic {
  const failure = findSensitiveDiagnosticPath(value);
  if (failure) {
    throw new Error(`Canonical shadow diagnostic failed redaction validation at ${failure}.`);
  }
  return value;
}

export function findSensitiveDiagnosticPath(value: unknown, path = "diagnostic"): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Error) {
    return findSensitiveDiagnosticPath(`${value.name}: ${value.message}`, `${path}.message`);
  }
  if (typeof value === "string") {
    if (isApprovedCanonicalBucketValue(path, value)) return null;
    return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value)) ? path : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return null;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findSensitiveDiagnosticPath(item, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) return `${path}.${key}`;
      const found = findSensitiveDiagnosticPath(item, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function isApprovedCanonicalBucketValue(path: string, value: string): boolean {
  return (
    value === "merchant_contract" &&
    /^diagnostic\.canonicalSummary\.ownershipBucketCounts\[\d+\]\.bucket$/.test(path)
  );
}
