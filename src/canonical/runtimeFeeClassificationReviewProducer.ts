import {
  buildCanonicalRuntimeFeeClassificationReviewPacket,
  validateCanonicalRuntimeFeeClassificationReview,
  type CanonicalRuntimeFeeClassificationReviewPacket,
} from "./runtimeFeeClassificationReview.js";
import type {
  CanonicalFeeCategory,
  CanonicalFeeClassificationConfidence,
  CanonicalFeeClassificationSourceType,
  CanonicalFeeRowRole,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalRuntimeFeeClassificationReviewStatus,
  CanonicalStatementAnalysis,
} from "./types.js";

export const CANONICAL_RUNTIME_FEE_CLASSIFICATION_PRODUCER_PACKET_VERSION =
  "canonical_runtime_fee_classification_producer_packet_v1" as const;

export type CanonicalRuntimeFeeClassificationProducerCandidate = {
  candidateRef: string;
  category: CanonicalFeeCategory;
  confidence: CanonicalFeeClassificationConfidence;
  sourceType: CanonicalFeeClassificationSourceType;
};

export type CanonicalRuntimeFeeClassificationProducerRow = {
  feeRowRef: string;
  sanitizedFeeLabel: string;
  labelStatus: "available" | "withheld";
  role: CanonicalFeeRowRole;
  evidenceRefs: string[];
  selectedClassificationCandidateRef: string | null;
  currentClassificationCandidates: CanonicalRuntimeFeeClassificationProducerCandidate[];
};

export type CanonicalRuntimeFeeClassificationProducerPacket = {
  type: "canonical_runtime_fee_classification_producer_packet";
  policyVersion: typeof CANONICAL_RUNTIME_FEE_CLASSIFICATION_PRODUCER_PACKET_VERSION;
  validationPacketPolicyVersion: CanonicalRuntimeFeeClassificationReviewPacket["policyVersion"];
  materialUnresolvedRows: CanonicalRuntimeFeeClassificationProducerRow[];
  absenceProof: string | null;
};

export type CanonicalRuntimeFeeClassificationReviewProducerAdapter = (input: {
  packet: CanonicalRuntimeFeeClassificationProducerPacket;
  signal: AbortSignal;
}) => Promise<unknown> | unknown;

export type RunCanonicalRuntimeFeeClassificationReviewProducerOptions = {
  enabled?: boolean;
  adapter?: CanonicalRuntimeFeeClassificationReviewProducerAdapter | null;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_LABEL_LENGTH = 96;
const WITHHELD_LABEL = "[fee_label_withheld]";
const UNSAFE_LABEL_PATTERNS = [
  /(?:\/Users\/|\/private\/|[A-Za-z]:\\)/i,
  /\b\S+\.(?:pdf|csv|xlsx?|docx?|txt)\b/i,
  /\$\s*\d/i,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|\bbps\b|\bbasis points?\b)/i,
  /\b(?:USD|US\$|EUR|GBP|CAD)\s*\d+(?:,\d{3})*(?:\.\d+)?\b/i,
  /\b(?:rate|amount|total|fee amount|unit price)\s*[:=-]?\s*\d+(?:,\d{3})*(?:\.\d+)?\b/i,
  /\b(?:merchant|account)\s+(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Za-z0-9][A-Za-z0-9_-]{3,}\b/i,
  /\b(?:api(?:\s|-)?key|credential|secret|password|bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{8,})\b/i,
  /\b(?:openai|anthropic|openrouter|claude|gpt[-\w]*)\b/i,
  /\braw(?:\s|-)?(?:prompt|response|error)\b/i,
  /\b(?:prompt|response|error)\s*[:=]/i,
] as const;

export function buildCanonicalRuntimeFeeClassificationProducerPacket(
  analysis: Pick<CanonicalStatementAnalysis, "feeLedger" | "feeOwnershipActionability" | "opportunityEngine" | "evidence">,
): CanonicalRuntimeFeeClassificationProducerPacket {
  const validationPacket = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
  const rowsById = new Map(analysis.feeLedger.rows.map((row) => [row.id, row]));
  const classificationsByRowId = new Map(analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification]));

  return {
    type: "canonical_runtime_fee_classification_producer_packet",
    policyVersion: CANONICAL_RUNTIME_FEE_CLASSIFICATION_PRODUCER_PACKET_VERSION,
    validationPacketPolicyVersion: validationPacket.policyVersion,
    materialUnresolvedRows: validationPacket.materialFeeRowRefs.map((feeRowRef) => {
      const row = rowsById.get(feeRowRef);
      const classification = classificationsByRowId.get(feeRowRef);
      const safeLabel = sanitizeFeeLabel(row?.selectedLabel);
      const allowedCandidateRefs = new Set(validationPacket.classificationCandidateRefsByFeeRowRef[feeRowRef] ?? []);
      return {
        feeRowRef,
        sanitizedFeeLabel: safeLabel.value,
        labelStatus: safeLabel.status,
        role: row?.role ?? "unknown_unresolved",
        evidenceRefs: [...(validationPacket.evidenceRefsByFeeRowRef[feeRowRef] ?? [])],
        selectedClassificationCandidateRef: validationPacket.selectedClassificationCandidateRefByFeeRowRef[feeRowRef] ?? null,
        currentClassificationCandidates: (classification?.candidates ?? [])
          .filter((candidate) => allowedCandidateRefs.has(candidate.id))
          .map((candidate) => ({
            candidateRef: candidate.id,
            category: candidate.category,
            confidence: candidate.confidence,
            sourceType: candidate.sourceType,
          }))
          .sort((left, right) => left.candidateRef.localeCompare(right.candidateRef)),
      };
    }),
    absenceProof: validationPacket.absenceProof,
  };
}

export async function runCanonicalRuntimeFeeClassificationReviewProducer(
  analysis: Pick<CanonicalStatementAnalysis, "feeLedger" | "feeOwnershipActionability" | "opportunityEngine" | "evidence">,
  options: RunCanonicalRuntimeFeeClassificationReviewProducerOptions = {},
): Promise<CanonicalRuntimeFeeClassificationReview> {
  const validationPacket = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
  if (validationPacket.absenceProof) {
    return validatedReview(analysis, {
      ...reviewSkeleton("not_needed"),
      absenceProof: validationPacket.absenceProof,
    });
  }

  if (options.enabled === false || !options.adapter) {
    return validatedReview(analysis, {
      ...reviewSkeleton("disabled"),
      limitationCodes: ["provider_unavailable"],
      reasonCodes: ["runtime_fee_classification_disabled"],
    });
  }

  const packet = buildCanonicalRuntimeFeeClassificationProducerPacket(analysis);
  const timeoutMs = validTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const adapterAttempt = Promise.resolve()
    .then(() => options.adapter!({ packet, signal: controller.signal }))
    .then((value) => ({ type: "value" as const, value }))
    .catch((error) => ({ type: "error" as const, error }));
  const timeout = new Promise<{ type: "timeout" }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ type: "timeout" });
    }, timeoutMs);
    timer.unref?.();
  });

  const result = await Promise.race([adapterAttempt, timeout]);
  if (result.type !== "timeout" && timer) clearTimeout(timer);

  if (result.type === "timeout") {
    void adapterAttempt;
    return validatedReview(analysis, {
      ...reviewSkeleton("timed_out"),
      limitationCodes: ["ai_output_rejected"],
      reasonCodes: ["runtime_fee_classification_timed_out"],
    });
  }

  if (result.type === "error") {
    return validatedReview(analysis, {
      ...reviewSkeleton("failed"),
      limitationCodes: ["ai_output_rejected"],
      reasonCodes: ["runtime_fee_classification_failed"],
    });
  }

  return validateCanonicalRuntimeFeeClassificationReview(result.value, analysis).review;
}

function validatedReview(
  analysis: Pick<CanonicalStatementAnalysis, "feeLedger" | "feeOwnershipActionability" | "opportunityEngine" | "evidence">,
  review: CanonicalRuntimeFeeClassificationReview,
): CanonicalRuntimeFeeClassificationReview {
  return validateCanonicalRuntimeFeeClassificationReview(review, analysis).review;
}

function reviewSkeleton(status: CanonicalRuntimeFeeClassificationReviewStatus): CanonicalRuntimeFeeClassificationReview {
  return {
    type: "runtime_fee_classification_review",
    policyVersion: "canonical_runtime_fee_classification_review_v1",
    status,
    reviewedFeeRowRefs: [],
    suggestions: [],
    absenceProof: null,
    limitationCodes: [],
    reasonCodes: ["runtime_fee_classification_reviewed"],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function sanitizeFeeLabel(value: unknown): { value: string; status: "available" | "withheld" } {
  if (typeof value !== "string") return { value: WITHHELD_LABEL, status: "withheld" };
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || UNSAFE_LABEL_PATTERNS.some((pattern) => pattern.test(normalized))) return { value: WITHHELD_LABEL, status: "withheld" };
  return { value: normalized.slice(0, MAX_LABEL_LENGTH), status: "available" };
}

function validTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.floor(value);
}
