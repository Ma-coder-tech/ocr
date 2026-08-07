import { createHash } from "node:crypto";
import {
  buildCanonicalRuntimeFeeClassificationReviewPacket,
  validateCanonicalRuntimeFeeClassificationReview,
} from "./runtimeFeeClassificationReview.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalFeeCategory,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalRuntimeFeeClassificationReviewDisposition,
  CanonicalStatementAnalysis,
  CanonicalWholeStatementFeeIntelligenceAcceptanceRecord,
  CanonicalWholeStatementFeeIntelligenceRowInterpretation,
} from "./types.js";

export type RuntimeFeeClassificationReuseSource = {
  executionStatus: "completed" | "failed" | "timed_out";
  admissionDisposition: "admitted" | "rejected" | "safety_blocked";
  wholeStatementOutput: CanonicalAiWholeStatementFeeIntelligenceOutput | null;
};

export type RuntimeFeeClassificationReuseResult = {
  review: CanonicalRuntimeFeeClassificationReview;
  packetRef: string | null;
};

export const RUNTIME_FEE_CLASSIFICATION_REUSE_REASON_CODE =
  "runtime_fee_classification_review_reused_whole_statement" as const;

const CONDITION_REASON_CODE = "runtime_fee_classification_reused_whole_statement_conditions";
const INSUFFICIENT_REASON_CODE = "runtime_fee_classification_reused_whole_statement_insufficient_evidence";
const HUMAN_REVIEW_REASON_CODE = "runtime_fee_classification_reused_whole_statement_human_review";
const REJECTED_REASON_CODE = "runtime_fee_classification_reused_whole_statement_rejected";

export function deriveRuntimeFeeClassificationReviewFromAdmittedWholeStatement(input: {
  analysis: CanonicalStatementAnalysis;
  source: RuntimeFeeClassificationReuseSource;
}): RuntimeFeeClassificationReuseResult {
  const packet = buildCanonicalRuntimeFeeClassificationReviewPacket(input.analysis);
  if (packet.absenceProof) {
    return {
      review: validated(input.analysis, {
        ...reviewSkeleton("not_needed"),
        absenceProof: packet.absenceProof,
        reasonCodes: ["runtime_fee_classification_review_not_needed"],
      }),
      packetRef: null,
    };
  }

  if (input.source.admissionDisposition === "safety_blocked") {
    return terminal(input.analysis, "safety_blocked", "runtime_fee_classification_reused_whole_statement_safety_blocked");
  }
  if (input.source.executionStatus === "timed_out") {
    return terminal(input.analysis, "timed_out", "runtime_fee_classification_reused_whole_statement_timed_out");
  }
  if (input.source.executionStatus === "failed") {
    return terminal(input.analysis, "failed", "runtime_fee_classification_reused_whole_statement_failed");
  }
  if (input.source.admissionDisposition !== "admitted" || !input.source.wholeStatementOutput) {
    return terminal(input.analysis, "rejected", REJECTED_REASON_CODE);
  }

  const output = input.source.wholeStatementOutput;
  if (output.reviewStatus !== "completed" || !hasExactCoverage(output)) {
    return terminal(input.analysis, "rejected", REJECTED_REASON_CODE);
  }

  const interpretationsByRow = uniqueByMaterialRow(output.rowInterpretations, packet.materialFeeRowRefs, "feeRowRef");
  const acceptancesByRow = uniqueByMaterialRow(output.acceptanceRecords, packet.materialFeeRowRefs, "feeRowRef");
  if (!interpretationsByRow || !acceptancesByRow) {
    return terminal(input.analysis, "rejected", REJECTED_REASON_CODE);
  }

  const selectedCategoryByRow = new Map(
    input.analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification.selected.category]),
  );
  const suggestions = [];
  for (const feeRowRef of packet.materialFeeRowRefs) {
    const interpretation = interpretationsByRow.get(feeRowRef);
    const acceptance = acceptancesByRow.get(feeRowRef);
    if (!interpretation || !acceptance || acceptance.status === "rejected") {
      return terminal(input.analysis, "rejected", REJECTED_REASON_CODE);
    }
    const allowedEvidence = new Set(packet.evidenceRefsByFeeRowRef[feeRowRef] ?? []);
    if (interpretation.evidenceRefs.some((ref) => !allowedEvidence.has(ref))) {
      return terminal(input.analysis, "rejected", REJECTED_REASON_CODE);
    }
    const evidenceRefs = [...new Set(interpretation.evidenceRefs.filter((ref) => allowedEvidence.has(ref)))].sort();
    if (evidenceRefs.length === 0) {
      return terminal(input.analysis, "rejected", REJECTED_REASON_CODE);
    }
    suggestions.push({
      feeRowRef,
      evidenceRefs,
      currentClassificationCandidateRef: packet.selectedClassificationCandidateRefByFeeRowRef[feeRowRef] ?? null,
      suggestedCategory: interpretation.proposedCategory,
      confidence: interpretation.confidence,
      disposition: dispositionFor(acceptance, interpretation, selectedCategoryByRow.get(feeRowRef) ?? null),
      reasonCodes: reasonCodesFor(acceptance, interpretation),
      authoritative: false as const,
    });
  }

  return {
    review: validated(input.analysis, {
      ...reviewSkeleton("completed_with_diagnostic_suggestions"),
      reviewedFeeRowRefs: [...packet.materialFeeRowRefs],
      suggestions,
      limitationCodes: ["material_fee_classification_review_required"],
      reasonCodes: [RUNTIME_FEE_CLASSIFICATION_REUSE_REASON_CODE],
    }),
    packetRef: packetRefForAdmittedWholeStatementOutput(output),
  };
}

export function packetRefForAdmittedWholeStatementOutput(output: CanonicalAiWholeStatementFeeIntelligenceOutput): string {
  return `packet_${hashCanonical(output).slice(0, 32)}`;
}

function terminal(
  analysis: CanonicalStatementAnalysis,
  status: Extract<CanonicalRuntimeFeeClassificationReview["status"], "failed" | "timed_out" | "rejected" | "safety_blocked">,
  reasonCode: string,
): RuntimeFeeClassificationReuseResult {
  return {
    review: validated(analysis, {
      ...reviewSkeleton(status),
      limitationCodes: status === "safety_blocked" ? ["ai_output_rejected"] : ["material_fee_classification_review_required"],
      reasonCodes: [reasonCode],
    }),
    packetRef: null,
  };
}

function dispositionFor(
  acceptance: CanonicalWholeStatementFeeIntelligenceAcceptanceRecord,
  interpretation: CanonicalWholeStatementFeeIntelligenceRowInterpretation,
  currentCategory: CanonicalFeeCategory | null,
): CanonicalRuntimeFeeClassificationReviewDisposition {
  if (acceptance.status === "human_review") return "needs_human_review";
  if (acceptance.status === "needs_verification") {
    return interpretation.recommendedDisposition === "insufficient_evidence" || interpretation.missingEvidence.length > 0
      ? "insufficient_evidence"
      : "needs_human_review";
  }
  return interpretation.proposedCategory === currentCategory ? "confirm_existing" : "suggest_alternative";
}

function reasonCodesFor(
  acceptance: CanonicalWholeStatementFeeIntelligenceAcceptanceRecord,
  interpretation: CanonicalWholeStatementFeeIntelligenceRowInterpretation,
): string[] {
  const codes: string[] = [RUNTIME_FEE_CLASSIFICATION_REUSE_REASON_CODE];
  if (acceptance.status === "accepted_with_conditions") codes.push(CONDITION_REASON_CODE);
  if (acceptance.status === "needs_verification") {
    codes.push(
      interpretation.recommendedDisposition === "insufficient_evidence" || interpretation.missingEvidence.length > 0
        ? INSUFFICIENT_REASON_CODE
        : HUMAN_REVIEW_REASON_CODE,
    );
  }
  if (acceptance.status === "human_review") codes.push(HUMAN_REVIEW_REASON_CODE);
  return [...new Set(codes)].sort();
}

function hasExactCoverage(output: CanonicalAiWholeStatementFeeIntelligenceOutput): boolean {
  return output.coverageProof.exactCoverage
    && output.coverageProof.missingFeeRowRefs.length === 0
    && output.coverageProof.duplicatedFeeRowRefs.length === 0
    && output.coverageProof.unknownFeeRowRefs.length === 0
    && output.coverageProof.malformedFeeRowRefs.length === 0;
}

function uniqueByMaterialRow<T extends Record<K, string>, K extends keyof T>(
  values: readonly T[],
  materialFeeRowRefs: readonly string[],
  key: K,
): Map<string, T> | null {
  const material = new Set(materialFeeRowRefs);
  const counts = new Map<string, number>();
  const byRow = new Map<string, T>();
  for (const value of values) {
    const feeRowRef = value[key];
    if (!material.has(feeRowRef)) continue;
    counts.set(feeRowRef, (counts.get(feeRowRef) ?? 0) + 1);
    byRow.set(feeRowRef, value);
  }
  for (const feeRowRef of materialFeeRowRefs) {
    if ((counts.get(feeRowRef) ?? 0) !== 1) return null;
  }
  return byRow;
}

function reviewSkeleton(status: CanonicalRuntimeFeeClassificationReview["status"]): CanonicalRuntimeFeeClassificationReview {
  return {
    type: "runtime_fee_classification_review",
    policyVersion: "canonical_runtime_fee_classification_review_v1",
    status,
    reviewedFeeRowRefs: [],
    suggestions: [],
    absenceProof: null,
    limitationCodes: [],
    reasonCodes: [],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function validated(
  analysis: CanonicalStatementAnalysis,
  review: CanonicalRuntimeFeeClassificationReview,
): CanonicalRuntimeFeeClassificationReview {
  return validateCanonicalRuntimeFeeClassificationReview(review, analysis).review;
}

function hashCanonical(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}
