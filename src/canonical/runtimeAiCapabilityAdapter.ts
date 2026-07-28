import { createHash } from "node:crypto";
import type { AnalysisSummary } from "../types.js";
import type { CanonicalAiCapabilityHarnessInput } from "./buildCanonicalAiCapabilities.js";
import type {
  CanonicalAiCapabilityId,
  CanonicalAiCapabilityOutput,
  CanonicalAiCapabilityStatus,
  CanonicalStatementAnalysis,
} from "./types.js";

export type RuntimeAiCapabilityReasonCode =
  | "runtime_anomaly_review_completed"
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
  | "runtime_narrative_output_unavailable";

export type RuntimeAiCapabilitySnapshot = {
  capability: CanonicalAiCapabilityId;
  attempted: boolean;
  normalizedStatus: CanonicalAiCapabilityStatus;
  safeCounts: Record<string, number>;
  executionRef: string;
  reasonCodes: RuntimeAiCapabilityReasonCode[];
};

export type RuntimeAiCapabilityAdapterResult = {
  harnessInputs: CanonicalAiCapabilityHarnessInput[];
  snapshots: RuntimeAiCapabilitySnapshot[];
};

export function buildRuntimeAiCapabilityHarnessInputs(input: {
  summary: AnalysisSummary | null | undefined;
  analysis: CanonicalStatementAnalysis;
}): RuntimeAiCapabilityAdapterResult {
  const analysisRecord = ownRecordField(input.summary, "fiservFeeAnalysisV2", ["aiAnomalyReview", "aiMerchantNarrative"]);
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
  ].filter((candidate): candidate is { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } =>
    Boolean(candidate),
  );

  candidates.sort((left, right) => left.harnessInput.capability.localeCompare(right.harnessInput.capability));

  return {
    harnessInputs: candidates.map((candidate) => candidate.harnessInput),
    snapshots: candidates.map((candidate) => candidate.snapshot),
  };
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
  if (status === "applied" || status === "no_anomalies") {
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
    if (appliedOverrideCount > overrideCount) {
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
      output: anomalyOutput(status === "no_anomalies" ? 0 : Math.max(anomalyCount, overrideCount)),
      safeCounts,
      reasonCodes: [status === "no_anomalies" ? "runtime_anomaly_review_no_issues_found" : "runtime_anomaly_review_completed"],
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
}): { harnessInput: CanonicalAiCapabilityHarnessInput; snapshot: RuntimeAiCapabilitySnapshot } {
  const executionRef = executionRefFor(input);
  return {
    harnessInput: {
      capability: input.capability,
      status: input.status,
      output: input.output ?? null,
      executionRef,
      independentReviewRefs: [],
    },
    snapshot: {
      capability: input.capability,
      attempted: input.attempted,
      normalizedStatus: input.status,
      safeCounts: input.safeCounts,
      executionRef,
      reasonCodes: [...input.reasonCodes].sort(),
    },
  };
}

function anomalyOutput(anomalyCount: number): CanonicalAiCapabilityOutput {
  return {
    type: "full_statement_anomaly_review",
    authoritative: false,
    evidenceRefs: [],
    factRefs: [],
    limitationCodes: [],
    observations: Array.from({ length: Math.min(anomalyCount, 25) }, (_, index) => ({
      id: `obs_runtime_anomaly_${index + 1}`,
      severity: "review" as const,
      summary: "Runtime anomaly review completed with a non-authoritative review item.",
      affectedFactRefs: [],
      evidenceRefs: [],
      authoritative: false,
    })),
  };
}

function executionRefFor(input: {
  capability: CanonicalAiCapabilityId;
  attempted: boolean;
  status: CanonicalAiCapabilityStatus;
  safeCounts: Record<string, number>;
  reasonCodes: readonly RuntimeAiCapabilityReasonCode[];
}): string {
  const stable = JSON.stringify({
    capability: input.capability,
    attempted: input.attempted,
    status: input.status,
    safeCounts: Object.fromEntries(Object.entries(input.safeCounts).sort(([left], [right]) => left.localeCompare(right))),
    reasonCodes: [...input.reasonCodes].sort(),
  });
  return `ai_exec_${createHash("sha256").update(stable).digest("hex").slice(0, 16)}`;
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
