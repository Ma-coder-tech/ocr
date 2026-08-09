import type { AnalysisSummary } from "../types.js";
import {
  createValidatedDiagnosticReferenceSets,
  diagnosticSignalsFromValidationErrors,
  passedDiagnosticSignals,
  type CanonicalAiAdmissionDiagnosticSignal,
  type CanonicalAiAdmissionOpaqueReferences,
  type CanonicalAiAdmissionTrustedReferenceSets,
} from "./aiAdmissionDiagnostics.js";
import type { CanonicalAiCapabilityHarnessInput } from "./buildCanonicalAiCapabilities.js";
import { validateCanonicalRuntimeFeeClassificationReview } from "./runtimeFeeClassificationReview.js";
import type {
  CanonicalAiCapabilityId,
  CanonicalAiCapabilityOutput,
  CanonicalAiCapabilityStatus,
  CanonicalWholeStatementFeeIntelligenceCoverageProof,
  CanonicalWholeStatementFeeIntelligenceStatus,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalRuntimeFeeClassificationReviewStatus,
  CanonicalStatementAnalysis,
} from "./types.js";

export type RuntimeAiCapabilityReasonCode =
  | "runtime_anomaly_review_no_issues_found"
  | "runtime_anomaly_review_failed"
  | "runtime_anomaly_review_disabled"
  | "runtime_anomaly_review_timed_out"
  | "runtime_anomaly_review_safety_blocked"
  | "runtime_anomaly_review_invalid_output"
  | "runtime_narrative_completed"
  | "runtime_narrative_failed"
  | "runtime_narrative_disabled"
  | "runtime_narrative_timed_out"
  | "runtime_narrative_safety_blocked"
  | "runtime_narrative_invalid_output"
  | "runtime_narrative_output_unavailable"
  | "runtime_fee_classification_review_not_needed"
  | "runtime_fee_classification_review_diagnostic_only"
  | "runtime_fee_classification_review_disabled"
  | "runtime_fee_classification_review_failed"
  | "runtime_fee_classification_review_timed_out"
  | "runtime_fee_classification_review_safety_blocked"
  | "runtime_fee_classification_review_rejected"
  | "runtime_fee_classification_review_reused_whole_statement"
  | "whole_statement_fee_intelligence_completed"
  | "whole_statement_fee_intelligence_partial"
  | "whole_statement_fee_intelligence_disabled"
  | "whole_statement_fee_intelligence_failed"
  | "whole_statement_fee_intelligence_timed_out"
  | "whole_statement_fee_intelligence_safety_blocked"
  | "whole_statement_fee_intelligence_rejected";

export type RuntimeAiCapabilitySnapshot = {
  capability: CanonicalAiCapabilityId;
  attempted: boolean;
  normalizedStatus: CanonicalAiCapabilityStatus;
  safeCounts: Record<string, number>;
  executionRef: string | null;
  reasonCodes: RuntimeAiCapabilityReasonCode[];
  diagnosticSignals?: CanonicalAiAdmissionDiagnosticSignal[];
  diagnosticReferences?: Partial<CanonicalAiAdmissionOpaqueReferences>;
  trustedDiagnosticReferenceSets?: CanonicalAiAdmissionTrustedReferenceSets;
  runtimeReviewStatus?: CanonicalRuntimeFeeClassificationReviewStatus;
  runtimeFeeClassificationReview?: CanonicalRuntimeFeeClassificationReview;
  runtimeWholeStatementFeeIntelligenceReview?: CanonicalRuntimeWholeStatementFeeIntelligenceReview;
};

export type CanonicalRuntimeWholeStatementFeeIntelligenceReview = {
  type: "whole_statement_fee_intelligence_runtime_review";
  policyVersion: "whole_statement_fee_intelligence_runtime_review_v1";
  reviewStatus: CanonicalWholeStatementFeeIntelligenceStatus;
  coverageProof: CanonicalWholeStatementFeeIntelligenceCoverageProof;
  rowInterpretationCount: number;
  acceptanceRecordCount: number;
  reasonCodes: string[];
  authoritative: false;
  providerDetailsStripped: true;
};

export type RuntimeAiCapabilityAdapterResult = {
  harnessInputs: CanonicalAiCapabilityHarnessInput[];
  snapshots: RuntimeAiCapabilitySnapshot[];
};

export function buildRuntimeAiCapabilityHarnessInputs(input: {
  summary: AnalysisSummary | null | undefined;
  analysis: CanonicalStatementAnalysis;
}): RuntimeAiCapabilityAdapterResult {
  const analysisRecord = ownRecordField(input.summary, "fiservFeeAnalysisV2", [
    "aiAnomalyReview",
    "aiMerchantNarrative",
    "runtimeFeeClassificationReview",
  ]);
  if (!analysisRecord) return { harnessInputs: [], snapshots: [] };

  const candidates = [
    anomalyCapabilityInput(
      ownRecordField(analysisRecord, "aiAnomalyReview", [
        "status",
        "attempted",
        "anomalyCount",
        "overrideCount",
        "appliedOverrideCount",
      ]),
    ),
    merchantNarrativeCapabilityInput(ownRecordField(analysisRecord, "aiMerchantNarrative", ["status", "attempted", "factCount", "factsUsed"])),
    feeClassificationCapabilityInput(ownRecordField(analysisRecord, "runtimeFeeClassificationReview"), input.analysis),
  ].filter((candidate): candidate is { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } =>
    Boolean(candidate),
  );

  candidates.sort((left, right) => left.harnessInput.capability.localeCompare(right.harnessInput.capability));

  return {
    harnessInputs: candidates.map((candidate) => candidate.harnessInput),
    snapshots: candidates.map((candidate) => candidate.snapshot),
  };
}

export function deterministicReuseFeeClassificationCapabilityInput(input: {
  review: CanonicalRuntimeFeeClassificationReview;
  analysis: CanonicalStatementAnalysis;
  packetRef: string | null;
}): { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } {
  const capability = "fee_classification_review" as const;
  const result = validateCanonicalRuntimeFeeClassificationReview(input.review, input.analysis);
  const review = result.review;
  const safeCounts = {
    materialFeeRowCount: result.packet.materialFeeRowRefs.length,
    reviewedFeeRowCount: review.reviewedFeeRowRefs.length,
    suggestionCount: review.suggestions.length,
  };
  const packetRefs = input.packetRef ? [input.packetRef] : [];
  return capabilityResult({
    capability,
    status: packageFStatusForFeeClassificationReview(review.status),
    attempted: false,
    safeCounts,
    reasonCodes: reasonCodesForFeeClassificationReview(review.status, result.ok, input.packetRef ? "deterministic_reuse" : "runtime"),
    diagnosticSignals: diagnosticSignalsForFeeClassificationReview(review.status, result.ok, result.ok ? [] : result.errors),
    diagnosticReferences: {
      feeRowRefs: review.reviewedFeeRowRefs,
      evidenceRefs: review.suggestions.flatMap((suggestion) => suggestion.evidenceRefs),
      packetRefs,
    },
    trustedDiagnosticReferenceSets: createValidatedDiagnosticReferenceSets({
      feeRowRefs: result.packet.materialFeeRowRefs,
      evidenceRefs: Object.values(result.packet.evidenceRefsByFeeRowRef).flat(),
      packetRefs,
    }),
    runtimeReviewStatus: review.status,
    runtimeFeeClassificationReview: review,
  });
}

function feeClassificationCapabilityInput(
  metadata: Record<string, unknown> | null,
  analysis: CanonicalStatementAnalysis,
): { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } | null {
  if (!metadata) return null;
  const capability = "fee_classification_review" as const;
  const result = validateCanonicalRuntimeFeeClassificationReview(metadata, analysis);
  const review = result.review;
  const safeCounts = {
    materialFeeRowCount: result.packet.materialFeeRowRefs.length,
    reviewedFeeRowCount: review.reviewedFeeRowRefs.length,
    suggestionCount: review.suggestions.length,
  };
  const status = packageFStatusForFeeClassificationReview(review.status);
  return capabilityResult({
    capability,
    status,
    attempted: !["disabled", "not_needed"].includes(review.status),
    safeCounts,
    reasonCodes: reasonCodesForFeeClassificationReview(review.status, result.ok),
    diagnosticSignals: diagnosticSignalsForFeeClassificationReview(review.status, result.ok, result.ok ? [] : result.errors),
    diagnosticReferences: {
      feeRowRefs: review.reviewedFeeRowRefs,
      evidenceRefs: review.suggestions.flatMap((suggestion) => suggestion.evidenceRefs),
    },
    trustedDiagnosticReferenceSets: createValidatedDiagnosticReferenceSets({
      feeRowRefs: result.packet.materialFeeRowRefs,
      evidenceRefs: Object.values(result.packet.evidenceRefsByFeeRowRef).flat(),
    }),
    runtimeReviewStatus: review.status,
    runtimeFeeClassificationReview: review,
  });
}

function anomalyCapabilityInput(
  metadata: Record<string, unknown> | null,
): { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } | null {
  if (!metadata) return null;
  const capability = "full_statement_anomaly_review" as const;
  const status = stringValue(metadata.status);
  const attempted = booleanValue(metadata.attempted);
  const anomalyCount = nonNegativeInteger(metadata.anomalyCount);
  const overrideCount = nonNegativeInteger(metadata.overrideCount);
  const appliedOverrideCount = nonNegativeInteger(metadata.appliedOverrideCount);
  const safeCounts = compactCounts({ anomalyCount, overrideCount, appliedOverrideCount });

  if (status === "disabled") {
    return capabilityResult({ capability, attempted, status: "disabled", safeCounts, reasonCodes: ["runtime_anomaly_review_disabled"] });
  }
  if (status === "failed") {
    return capabilityResult({
      capability,
      attempted,
      status: "failed",
      safeCounts,
      reasonCodes: ["runtime_anomaly_review_failed"],
    });
  }
  if (status === "timed_out") {
    return capabilityResult({ capability, attempted, status: "timed_out", safeCounts, reasonCodes: ["runtime_anomaly_review_timed_out"] });
  }
  if (status === "safety_blocked") {
    return capabilityResult({ capability, attempted, status: "safety_blocked", safeCounts, reasonCodes: ["runtime_anomaly_review_safety_blocked"] });
  }
  if (status === "no_anomalies") {
    if (!attempted || anomalyCount === null || overrideCount === null || appliedOverrideCount === null) {
      return capabilityResult({
        capability,
        attempted,
        status: "rejected",
        safeCounts,
        reasonCodes: ["runtime_anomaly_review_invalid_output"],
      });
    }
    if (anomalyCount !== 0 || overrideCount !== 0 || appliedOverrideCount !== 0) {
      return capabilityResult({
        capability,
        attempted,
        status: "rejected",
        safeCounts,
        reasonCodes: ["runtime_anomaly_review_invalid_output"],
      });
    }
    return capabilityResult({
      capability,
      attempted,
      status: "completed",
      output: cleanAnomalyOutput(),
      safeCounts,
      reasonCodes: ["runtime_anomaly_review_no_issues_found"],
    });
  }
  if (status === "applied") {
    if (!attempted || anomalyCount === null || overrideCount === null || appliedOverrideCount === null) {
      return capabilityResult({
        capability,
        attempted,
        status: "rejected",
        safeCounts,
        reasonCodes: ["runtime_anomaly_review_invalid_output"],
      });
    }
    if (appliedOverrideCount > 0) {
      return capabilityResult({
        capability,
        attempted,
        status: "safety_blocked",
        safeCounts,
        reasonCodes: ["runtime_anomaly_review_safety_blocked"],
      });
    }
    return capabilityResult({
      capability,
      attempted,
      status: "rejected",
      safeCounts,
      reasonCodes: ["runtime_anomaly_review_invalid_output"],
    });
  }
  if (status) {
    return capabilityResult({
      capability,
      attempted,
      status: "rejected",
      safeCounts,
      reasonCodes: ["runtime_anomaly_review_invalid_output"],
    });
  }
  return null;
}

function merchantNarrativeCapabilityInput(
  metadata: Record<string, unknown> | null,
): { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } | null {
  if (!metadata) return null;
  const capability = "merchant_narrative" as const;
  const status = stringValue(metadata.status);
  const attempted = booleanValue(metadata.attempted);
  const factCount = nonNegativeInteger(metadata.factCount);
  const factsUsedCount = Array.isArray(metadata.factsUsed) ? metadata.factsUsed.length : null;
  const safeCounts = compactCounts({ factCount, factsUsedCount });

  if (status === "disabled") {
    return capabilityResult({ capability, attempted, status: "disabled", safeCounts, reasonCodes: ["runtime_narrative_disabled"] });
  }
  if (status === "failed") {
    return capabilityResult({
      capability,
      attempted,
      status: "failed",
      safeCounts,
      reasonCodes: ["runtime_narrative_failed"],
    });
  }
  if (status === "timed_out") {
    return capabilityResult({ capability, attempted, status: "timed_out", safeCounts, reasonCodes: ["runtime_narrative_timed_out"] });
  }
  if (status === "safety_blocked") {
    return capabilityResult({ capability, attempted, status: "safety_blocked", safeCounts, reasonCodes: ["runtime_narrative_safety_blocked"] });
  }
  if (status === "applied") {
    return capabilityResult({
      capability,
      attempted,
      status: "rejected",
      safeCounts,
      reasonCodes: [attempted ? "runtime_narrative_output_unavailable" : "runtime_narrative_invalid_output"],
    });
  }
  if (status) {
    return capabilityResult({
      capability,
      attempted,
      status: "rejected",
      safeCounts,
      reasonCodes: ["runtime_narrative_invalid_output"],
    });
  }
  return null;
}

function capabilityResult(input: {
  capability: CanonicalAiCapabilityId;
  attempted: boolean;
  status: CanonicalAiCapabilityStatus;
  output?: CanonicalAiCapabilityOutput;
  safeCounts: Record<string, number>;
  reasonCodes: RuntimeAiCapabilityReasonCode[];
  diagnosticSignals?: CanonicalAiAdmissionDiagnosticSignal[];
  diagnosticReferences?: Partial<CanonicalAiAdmissionOpaqueReferences>;
  trustedDiagnosticReferenceSets?: CanonicalAiAdmissionTrustedReferenceSets;
  runtimeReviewStatus?: CanonicalRuntimeFeeClassificationReviewStatus;
  runtimeFeeClassificationReview?: CanonicalRuntimeFeeClassificationReview;
}): { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } {
  return {
    harnessInput: {
      capability: input.capability,
      status: input.status,
      output: input.output ?? null,
      executionRef: null,
      independentReviewRefs: [],
    },
    snapshot: {
      capability: input.capability,
      attempted: input.attempted,
      normalizedStatus: input.status,
      safeCounts: input.safeCounts,
      executionRef: null,
      reasonCodes: [...input.reasonCodes].sort(),
      diagnosticSignals: input.diagnosticSignals ?? defaultDiagnosticSignals(input.status, input.reasonCodes),
      ...(input.diagnosticReferences ? { diagnosticReferences: input.diagnosticReferences } : {}),
      ...(input.trustedDiagnosticReferenceSets ? { trustedDiagnosticReferenceSets: input.trustedDiagnosticReferenceSets } : {}),
      ...(input.runtimeReviewStatus ? { runtimeReviewStatus: input.runtimeReviewStatus } : {}),
      ...(input.runtimeFeeClassificationReview ? { runtimeFeeClassificationReview: input.runtimeFeeClassificationReview } : {}),
    },
  };
}

function defaultDiagnosticSignals(
  status: CanonicalAiCapabilityStatus,
  reasonCodes: readonly RuntimeAiCapabilityReasonCode[],
): CanonicalAiAdmissionDiagnosticSignal[] {
  if (reasonCodes.includes("runtime_anomaly_review_no_issues_found")) {
    return [
      {
        stage: "schema_validation",
        state: "passed",
        reasonCode: "runtime_status_count_consistency_validated",
        fieldPath: "runtime.aiAnomalyReview",
      },
    ];
  }
  if (reasonCodes.includes("runtime_anomaly_review_invalid_output")) {
    return [
      {
        stage: "schema_validation",
        state: "failed",
        reasonCode: "runtime_status_count_consistency_invalid",
        fieldPath: "runtime.aiAnomalyReview",
      },
    ];
  }
  if (status === "safety_blocked") {
    return [
      {
        stage: "privacy_safety",
        state: "failed",
        reasonCode: reasonCodes.includes("runtime_anomaly_review_safety_blocked")
          ? "runtime_anomaly_review_safety_blocked"
          : reasonCodes.includes("runtime_narrative_safety_blocked")
            ? "runtime_narrative_safety_blocked"
            : "runtime_fee_classification_review_safety_blocked",
        fieldPath: reasonCodes.includes("runtime_narrative_safety_blocked") ? "runtime.aiMerchantNarrative" : "runtime.aiAnomalyReview",
      },
    ];
  }
  return [];
}

function packageFStatusForFeeClassificationReview(
  status: CanonicalRuntimeFeeClassificationReviewStatus,
): CanonicalAiCapabilityStatus {
  if (status === "not_needed") return "not_needed";
  if (status === "disabled" || status === "failed" || status === "timed_out" || status === "rejected" || status === "safety_blocked") {
    return status;
  }
  return "completed_diagnostic";
}

function diagnosticSignalsForFeeClassificationReview(
  status: CanonicalRuntimeFeeClassificationReviewStatus,
  valid: boolean,
  errors: readonly string[],
): CanonicalAiAdmissionDiagnosticSignal[] {
  if (status === "safety_blocked") {
    return [
      ...(!valid ? diagnosticSignalsFromValidationErrors(errors) : []),
      {
        stage: "privacy_safety",
        state: "failed",
        reasonCode: "runtime_fee_classification_review_safety_blocked",
        fieldPath: "review",
      },
    ];
  }
  if (!valid) return diagnosticSignalsFromValidationErrors(errors);
  if (status === "completed_no_suggestions" || status === "completed_with_diagnostic_suggestions") {
    return passedDiagnosticSignals(["schema_validation", "evidence_citation", "linkage", "deterministic_reconciliation", "privacy_safety"]);
  }
  return [];
}

function reasonCodesForFeeClassificationReview(
  status: CanonicalRuntimeFeeClassificationReviewStatus,
  valid: boolean,
  source: "runtime" | "deterministic_reuse" = "runtime",
): RuntimeAiCapabilityReasonCode[] {
  if (!valid && status === "safety_blocked") return ["runtime_fee_classification_review_safety_blocked"];
  if (!valid) return ["runtime_fee_classification_review_rejected"];
  if (source === "deterministic_reuse" && status === "completed_with_diagnostic_suggestions") {
    return ["runtime_fee_classification_review_reused_whole_statement"];
  }
  if (status === "not_needed") return ["runtime_fee_classification_review_not_needed"];
  if (status === "disabled") return ["runtime_fee_classification_review_disabled"];
  if (status === "failed") return ["runtime_fee_classification_review_failed"];
  if (status === "timed_out") return ["runtime_fee_classification_review_timed_out"];
  if (status === "safety_blocked") return ["runtime_fee_classification_review_safety_blocked"];
  if (status === "rejected") return ["runtime_fee_classification_review_rejected"];
  return ["runtime_fee_classification_review_diagnostic_only"];
}

function cleanAnomalyOutput(): CanonicalAiCapabilityOutput {
  return {
    type: "full_statement_anomaly_review",
    authoritative: false,
    evidenceRefs: [],
    factRefs: [],
    limitationCodes: [],
    observations: [],
  };
}

function compactCounts(values: Record<string, number | null>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function ownRecordField(container: unknown, key: string, allowedFields?: readonly string[]): Record<string, unknown> | null {
  if (!container || typeof container !== "object" || Array.isArray(container)) return null;
  if (!Object.prototype.hasOwnProperty.call(container, key)) return null;
  const value = (container as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!allowedFields) return { ...source };
  const allowed = new Set(allowedFields);
  return Object.fromEntries(Object.entries(source).filter(([field]) => allowed.has(field)));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}
