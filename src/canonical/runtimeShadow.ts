import { buildCanonicalRuntimeAnalysis, canonicalRuntimeInputAdmissionTable, type CanonicalRuntimeAdapterInput } from "./runtimeAdapter.js";
import { compareCanonicalToLegacy } from "./runtimeShadowComparison.js";
import {
  assertRedactedCanonicalShadowDiagnostic,
  type RedactedCanonicalShadowDiagnostic,
} from "./runtimeShadowRedaction.js";
import type { AnalysisSummary } from "../types.js";
import type { ParsedDocument } from "../parser.js";
import type { BusinessTypeId } from "../businessTypes.js";
import type { CanonicalStatementAnalysis } from "./types.js";

export type CanonicalShadowDiagnosticSink = {
  record(diagnostic: RedactedCanonicalShadowDiagnostic): void | Promise<void>;
};

export type CanonicalRuntimeShadowResult =
  | { status: "disabled"; diagnostic: null; durationMs: number }
  | { status: RedactedCanonicalShadowDiagnostic["status"]; diagnostic: RedactedCanonicalShadowDiagnostic | null; durationMs: number };

const NOOP_DIAGNOSTIC_SINK: CanonicalShadowDiagnosticSink = {
  record() {
    return undefined;
  },
};
let localDiagnosticSink: CanonicalShadowDiagnosticSink | null = null;

export function setCanonicalRuntimeShadowDiagnosticSinkForLocalUse(sink: CanonicalShadowDiagnosticSink | null): void {
  localDiagnosticSink = sink;
}

export function canonicalRuntimeShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RATEREVEAL_CANONICAL_SHADOW_ENABLED === "true";
}

export async function runCanonicalRuntimeShadow(input: {
  document: ParsedDocument;
  businessType: BusinessTypeId;
  summary: AnalysisSummary;
  runtimeDocumentRef: string;
  env?: NodeJS.ProcessEnv;
  sink?: CanonicalShadowDiagnosticSink;
  now?: () => number;
  buildAnalysis?: (adapterInput: CanonicalRuntimeAdapterInput) => { analysis: CanonicalStatementAnalysis };
}): Promise<CanonicalRuntimeShadowResult> {
  if (!canonicalRuntimeShadowEnabled(input.env ?? process.env)) {
    return { status: "disabled", diagnostic: null, durationMs: 0 };
  }

  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  const sink = input.sink ?? localDiagnosticSink ?? NOOP_DIAGNOSTIC_SINK;

  try {
    const adapterInput: CanonicalRuntimeAdapterInput = {
      document: cloneJson(input.document),
      businessType: input.businessType,
      runtimeDocumentRef: input.runtimeDocumentRef,
      legacySummary: cloneJson(input.summary),
    };
    const result = input.buildAnalysis ? input.buildAnalysis(adapterInput) : buildCanonicalRuntimeAnalysis(adapterInput);
    const durationMs = Math.max(0, now() - startedAt);
    const diagnostic = diagnosticFromAnalysis({
      status: "completed",
      analysis: result.analysis,
      legacySummary: cloneJson(input.summary),
      sourceType: input.document.sourceType,
      businessTypeProvided: Boolean(input.businessType),
      runtimeDocumentRef: adapterInput.runtimeDocumentRef,
      durationMs,
    });
    await recordDiagnostic(sink, diagnostic);
    return { status: "completed", diagnostic, durationMs };
  } catch (error) {
    const durationMs = Math.max(0, now() - startedAt);
    const status = isCanonicalValidationError(error) ? "canonical_validation_failed" : "shadow_failed";
    const diagnostic = assertRedactedCanonicalShadowDiagnostic({
      schemaVersion: "canonical_shadow_diagnostic_v1",
      policyVersion: "canonical_runtime_shadow_policy_v1",
      status,
      runtimeDocumentRef: safeRuntimeDocumentRef(input.runtimeDocumentRef),
      durationMs,
      sourceType: input.document.sourceType,
      businessTypeProvided: Boolean(input.businessType),
      inputAdmission: canonicalRuntimeInputAdmissionTable().map(({ input: name, status: admissionStatus, reasonCode }) => ({
        input: name,
        status: admissionStatus,
        reasonCode,
      })),
      canonicalSummary: unavailableCanonicalSummary(),
      comparison: emptyComparison(status === "canonical_validation_failed" ? "canonical_validation_failed" : "shadow_exception_isolated"),
    });
    await recordDiagnostic(sink, diagnostic);
    return { status, diagnostic, durationMs };
  }
}

function diagnosticFromAnalysis(input: {
  status: RedactedCanonicalShadowDiagnostic["status"];
  analysis: CanonicalStatementAnalysis;
  legacySummary: AnalysisSummary;
  runtimeDocumentRef: string;
  durationMs: number;
  sourceType: ParsedDocument["sourceType"];
  businessTypeProvided: boolean;
}): RedactedCanonicalShadowDiagnostic {
  return assertRedactedCanonicalShadowDiagnostic({
    schemaVersion: "canonical_shadow_diagnostic_v1",
    policyVersion: "canonical_runtime_shadow_policy_v1",
    status: input.status,
    runtimeDocumentRef: safeRuntimeDocumentRef(input.runtimeDocumentRef),
    durationMs: input.durationMs,
    sourceType: input.sourceType,
    businessTypeProvided: input.businessTypeProvided,
    inputAdmission: canonicalRuntimeInputAdmissionTable().map(({ input: name, status, reasonCode }) => ({
      input: name,
      status,
      reasonCode,
    })),
    canonicalSummary: canonicalSummary(input.analysis),
    comparison: compareCanonicalToLegacy({ canonical: input.analysis, legacy: input.legacySummary }),
  });
}

function canonicalSummary(analysis: CanonicalStatementAnalysis): RedactedCanonicalShadowDiagnostic["canonicalSummary"] {
  const opportunity = analysis.opportunityEngine.summary;
  return {
    validationStatus: analysis.validation.status,
    readinessStatus: readinessStatusForAnalysis(analysis),
    warningCount: analysis.validation.warnings.length,
    errorCount: analysis.validation.errors.length,
    primaryState: analysis.customerState.primaryState,
    feeRowCount: analysis.feeLedger.rows.length,
    uniqueFeeRowCount: analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal).length,
    duplicateRepresentationCount: Math.max(0, analysis.feeLedger.parserInterpretations.length - analysis.feeLedger.rows.length),
    ownershipBucketCounts: sortedCounts(
      analysis.feeOwnershipActionability.rowClassifications.map((row) => row.selected.ownership.economicBeneficiary),
    ),
    actionabilityBucketCounts: sortedCounts(analysis.feeOwnershipActionability.rowClassifications.map((row) => row.selected.actionabilityCeiling)),
    opportunityTotals: {
      deterministicEligibleAnnual: purposeMoney(opportunity.deterministicEligibleAnnualAmount, "deterministic_eligible_annual"),
      approvedEstimatedAnnual: purposeMoney(opportunity.approvedEstimatedAnnualAmount, "approved_estimated_annual"),
      verificationOnlyObserved: purposeMoney(opportunity.verificationOnlyObservedAmount, "verification_only_observed"),
      excludedObserved: purposeMoney(opportunity.excludedObservedAmount, "excluded_observed"),
      nonAnnualizedObserved: purposeMoney(opportunity.nonAnnualizedObservedAmount, "non_annualized_observed"),
    },
    benchmarkStatus: analysis.customerState.rateComparison.status,
    benchmarkPosition: analysis.customerState.rateComparison.position,
    permissionDecisionCounts: {
      permitted: analysis.customerState.permissions.filter((permission) => permission.permitted).length,
      denied: analysis.customerState.permissions.filter((permission) => !permission.permitted).length,
    },
    actionGuidanceTypeCounts: sortedCounts(analysis.customerState.actionGuidance.map((action) => action.actionType)),
    explanationReadiness: analysis.customerState.axes.explanationReadiness,
  };
}

function unavailableCanonicalSummary(): RedactedCanonicalShadowDiagnostic["canonicalSummary"] {
  const zero = { amountMinor: 0, currency: "USD" as const };
  return {
    validationStatus: "unavailable",
    readinessStatus: "unavailable",
    warningCount: 0,
    errorCount: 1,
    primaryState: null,
    feeRowCount: 0,
    uniqueFeeRowCount: 0,
    duplicateRepresentationCount: 0,
    ownershipBucketCounts: {},
    actionabilityBucketCounts: {},
    opportunityTotals: {
      deterministicEligibleAnnual: { ...zero, purpose: "deterministic_eligible_annual" },
      approvedEstimatedAnnual: { ...zero, purpose: "approved_estimated_annual" },
      verificationOnlyObserved: { ...zero, purpose: "verification_only_observed" },
      excludedObserved: { ...zero, purpose: "excluded_observed" },
      nonAnnualizedObserved: { ...zero, purpose: "non_annualized_observed" },
    },
    benchmarkStatus: null,
    benchmarkPosition: null,
    permissionDecisionCounts: { permitted: 0, denied: 0 },
    actionGuidanceTypeCounts: {},
    explanationReadiness: null,
  };
}

function emptyComparison(reasonCode: string): RedactedCanonicalShadowDiagnostic["comparison"] {
  return {
    categories: {
      expected_improvement: 0,
      known_legacy_defect: 0,
      canonical_regression: 0,
      requires_human_review: 1,
    },
    differences: [
      {
        key: "shadow.status",
        category: "requires_human_review",
        reasonCode,
        legacy: "unchanged",
        canonical: "unavailable",
      },
    ],
  };
}

async function recordDiagnostic(
  sink: CanonicalShadowDiagnosticSink,
  diagnostic: RedactedCanonicalShadowDiagnostic,
): Promise<void> {
  try {
    await sink.record(assertRedactedCanonicalShadowDiagnostic(diagnostic));
  } catch {
    return;
  }
}

function safeRuntimeDocumentRef(value: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    /[\\/\s]/.test(normalized) ||
    /\.[A-Za-z0-9]{2,5}$/.test(normalized) ||
    /(?:^|[^a-z0-9])(?:merchant|account|acct|mid|file|path|hash|raw|prompt|response|provider|model|api|billing)(?:[^a-z0-9]|$)/i.test(normalized) ||
    /\b[A-Fa-f0-9]{32,}\b/.test(normalized)
  ) {
    return "runtime_document_unknown";
  }
  return normalized.slice(0, 96);
}

function readinessStatusForAnalysis(
  analysis: CanonicalStatementAnalysis,
): RedactedCanonicalShadowDiagnostic["canonicalSummary"]["readinessStatus"] {
  if (analysis.validation.status === "invalid") return "unavailable";
  if (analysis.aiCapabilities.summary.financialReadiness === "withheld") return "withheld";
  if (
    analysis.customerState.axes.analysisReadiness === "unavailable" ||
    analysis.financialFacts.processedSales.value === null ||
    analysis.financialFacts.totalFees.value === null
  ) {
    return "unavailable";
  }
  if (
    analysis.customerState.axes.analysisReadiness === "limited" ||
    analysis.customerState.axes.dataIntegrity !== "reconciled" ||
    analysis.feeLedger.status !== "available" ||
    analysis.opportunityEngine.status !== "available"
  ) {
    return "limited";
  }
  if (analysis.customerState.axes.analysisReadiness === "verified" && analysis.aiCapabilities.summary.financialReadiness === "ready") {
    return "financially_ready";
  }
  return "schema_valid";
}

function sortedCounts(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function purposeMoney<P extends RedactedCanonicalShadowDiagnostic["canonicalSummary"]["opportunityTotals"][keyof RedactedCanonicalShadowDiagnostic["canonicalSummary"]["opportunityTotals"]]["purpose"]>(
  value: { amountMinor: number; currency: "USD" },
  purpose: P,
): { amountMinor: number; currency: "USD"; purpose: P } {
  return { amountMinor: value.amountMinor, currency: value.currency, purpose };
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isCanonicalValidationError(error: unknown): boolean {
  return error instanceof Error && /canonical statement analysis validation failed/i.test(error.message);
}
