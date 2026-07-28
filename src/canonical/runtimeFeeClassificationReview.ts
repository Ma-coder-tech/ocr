import type {
  CanonicalAiLimitationCode,
  CanonicalFeeCategory,
  CanonicalFeeClassificationConfidence,
  CanonicalRuntimeFeeClassificationReview,
  CanonicalRuntimeFeeClassificationReviewDisposition,
  CanonicalRuntimeFeeClassificationReviewStatus,
  CanonicalRuntimeFeeClassificationSuggestion,
  CanonicalStatementAnalysis,
} from "./types.js";

export const CANONICAL_RUNTIME_FEE_CLASSIFICATION_REVIEW_POLICY_VERSION =
  "canonical_runtime_fee_classification_review_v1" as const;

const REVIEW_ALLOWED_KEYS = [
  "type",
  "policyVersion",
  "status",
  "reviewedFeeRowRefs",
  "suggestions",
  "absenceProof",
  "limitationCodes",
  "reasonCodes",
  "authoritative",
  "financialMutationAllowed",
  "providerDetailsStripped",
] as const;

const SUGGESTION_ALLOWED_KEYS = [
  "feeRowRef",
  "evidenceRefs",
  "currentClassificationCandidateRef",
  "suggestedCategory",
  "confidence",
  "disposition",
  "reasonCodes",
  "authoritative",
] as const;

const REVIEW_STATUSES: readonly CanonicalRuntimeFeeClassificationReviewStatus[] = [
  "not_needed",
  "completed_no_suggestions",
  "completed_with_diagnostic_suggestions",
  "disabled",
  "failed",
  "timed_out",
  "rejected",
  "safety_blocked",
] as const;

const CATEGORIES: readonly CanonicalFeeCategory[] = [
  "interchange",
  "card_brand_network_assessment",
  "network_access_or_authorization",
  "processor_markup",
  "processor_per_item_fee",
  "administrative_fee",
  "service_fee",
  "compliance_fee",
  "equipment_or_lease",
  "third_party_product",
  "chargeback_or_dispute",
  "funding_adjustment",
  "tax_or_government",
  "credit",
  "unknown_needs_review",
] as const;

const CONFIDENCES: readonly CanonicalFeeClassificationConfidence[] = ["high", "medium", "low"] as const;
const DISPOSITIONS: readonly CanonicalRuntimeFeeClassificationReviewDisposition[] = [
  "confirm_existing",
  "suggest_alternative",
  "needs_human_review",
  "insufficient_evidence",
] as const;

const LIMITATION_CODES: readonly CanonicalAiLimitationCode[] = [
  "full_statement_anomaly_review_required",
  "material_fee_classification_review_required",
  "notice_change_review_required",
  "benchmark_category_review_required",
  "benchmark_category_not_verified",
  "ai_narrative_unavailable",
  "ai_output_rejected",
  "provider_unavailable",
  "deterministic_explanation_available",
] as const;

const FAILURE_STATUSES = new Set<CanonicalRuntimeFeeClassificationReviewStatus>([
  "disabled",
  "failed",
  "timed_out",
  "rejected",
  "safety_blocked",
]);

const FORBIDDEN_KEY_PATTERN =
  /(?:amount|currency|total|transactionCount|target|cadence|ownership|economicBeneficiary|contractualController|actionability|calculation|formula|savings|opportunity|eligibility|annualImpact|override|correctedValue|packageG|state|permissions|actions|provider|model|adapter|prompt|response|rawError|merchant(?:Name|Id|Number|Account)?|filename|fileName|path|raw(?:Statement)?Text|excerpt)/i;

const FORBIDDEN_VALUE_PATTERN =
  /(?:\/Users\/|\/private\/|[A-Za-z]:\\|\.pdf\b|\.csv\b|account(?:\s|_)?(?:number|id)?|merchant(?:\s|_)?(?:name|id|number|account)|api(?:\s|-)?key|billing|openai|anthropic|claude|gpt|raw(?:\s|-)?(?:prompt|response|error)|\$)/i;

export type CanonicalRuntimeFeeClassificationReviewPacket = {
  policyVersion: typeof CANONICAL_RUNTIME_FEE_CLASSIFICATION_REVIEW_POLICY_VERSION;
  materialFeeRowRefs: string[];
  evidenceRefsByFeeRowRef: Record<string, string[]>;
  classificationCandidateRefsByFeeRowRef: Record<string, string[]>;
  selectedClassificationCandidateRefByFeeRowRef: Record<string, string | null>;
  absenceProof: string | null;
};

export type CanonicalRuntimeFeeClassificationReviewValidationResult =
  | {
      ok: true;
      review: CanonicalRuntimeFeeClassificationReview;
      packet: CanonicalRuntimeFeeClassificationReviewPacket;
    }
  | {
      ok: false;
      review: CanonicalRuntimeFeeClassificationReview;
      packet: CanonicalRuntimeFeeClassificationReviewPacket;
      errors: string[];
    };

export function buildCanonicalRuntimeFeeClassificationReviewPacket(
  analysis: Pick<CanonicalStatementAnalysis, "feeLedger" | "feeOwnershipActionability" | "opportunityEngine" | "evidence">,
): CanonicalRuntimeFeeClassificationReviewPacket {
  const evidenceIds = new Set(analysis.evidence.map((record) => record.id));
  const evidenceRefsByOccurrenceId = new Map(analysis.feeLedger.sourceOccurrences.map((occurrence) => [occurrence.id, occurrence.evidenceRef]));
  const classificationByRow = new Map(analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification]));
  const opportunityFeeRows = new Set(analysis.opportunityEngine.components.flatMap((component) => component.feeRowRefs.map((ref) => ref.feeRowId)));
  const materialFeeRowRefs = analysis.feeLedger.rows
    .filter((row) => {
      const classification = classificationByRow.get(row.id);
      const counted = row.contributesToUniqueTotal || opportunityFeeRows.has(row.id);
      const amountMinor = row.selectedAmount?.amountMinor ?? 0;
      const unresolved =
        row.role === "unknown_unresolved" ||
        classification?.selected.category === "unknown_needs_review" ||
        classification?.selected.actionabilityCeiling === "unknown" ||
        classification?.selected.ownership.economicBeneficiary === "unknown" ||
        classification?.conflictStatus === "unresolved" ||
        classification?.conflictStatus === "requires_human_review";
      return counted && amountMinor !== 0 && unresolved;
    })
    .map((row) => row.id)
    .sort();
  const evidenceRefsByFeeRowRef: Record<string, string[]> = {};
  const classificationCandidateRefsByFeeRowRef: Record<string, string[]> = {};
  const selectedClassificationCandidateRefByFeeRowRef: Record<string, string | null> = {};

  for (const feeRowRef of materialFeeRowRefs) {
    const row = analysis.feeLedger.rows.find((item) => item.id === feeRowRef);
    const refs = [
      ...(row?.sourceOccurrenceIds.map((id) => evidenceRefsByOccurrenceId.get(id)).filter((id): id is string => Boolean(id)) ?? []),
      ...(row?.contributionDecision.evidenceRefs ?? []),
    ];
    evidenceRefsByFeeRowRef[feeRowRef] = [...new Set(refs)].filter((ref) => evidenceIds.has(ref)).sort();
    const classification = classificationByRow.get(feeRowRef);
    classificationCandidateRefsByFeeRowRef[feeRowRef] = [...new Set(classification?.candidates.map((candidate) => candidate.id) ?? [])].sort();
    selectedClassificationCandidateRefByFeeRowRef[feeRowRef] = classification?.selected.candidateId ?? null;
  }

  return {
    policyVersion: CANONICAL_RUNTIME_FEE_CLASSIFICATION_REVIEW_POLICY_VERSION,
    materialFeeRowRefs,
    evidenceRefsByFeeRowRef,
    classificationCandidateRefsByFeeRowRef,
    selectedClassificationCandidateRefByFeeRowRef,
    absenceProof: materialFeeRowRefs.length === 0 ? "deterministic_absence_proven:material_unresolved_fee_rows" : null,
  };
}

export function validateCanonicalRuntimeFeeClassificationReview(
  rawReview: unknown,
  analysis: Pick<CanonicalStatementAnalysis, "feeLedger" | "feeOwnershipActionability" | "opportunityEngine" | "evidence">,
): CanonicalRuntimeFeeClassificationReviewValidationResult {
  const packet = buildCanonicalRuntimeFeeClassificationReviewPacket(analysis);
  const errors: string[] = [];

  if (!isPlainRecord(rawReview)) {
    errors.push("runtime_fee_classification_review_not_plain_object");
    return rejectedReview(packet, errors, "rejected");
  }

  errors.push(...recursiveForbiddenContentErrors(rawReview, "review"));
  errors.push(...unknownKeyErrors(rawReview, REVIEW_ALLOWED_KEYS, "review"));
  const source = rawReview as Record<string, unknown>;
  const status = enumValue(source.status, REVIEW_STATUSES);
  if (source.type !== "runtime_fee_classification_review") errors.push("runtime_fee_classification_review_type_invalid");
  if (source.policyVersion !== CANONICAL_RUNTIME_FEE_CLASSIFICATION_REVIEW_POLICY_VERSION) {
    errors.push("runtime_fee_classification_review_policy_version_invalid");
  }
  if (!status) errors.push("runtime_fee_classification_review_status_invalid");
  if (source.authoritative !== false) errors.push("runtime_fee_classification_review_authoritative_invalid");
  if (source.financialMutationAllowed !== false) errors.push("runtime_fee_classification_review_financial_mutation_invalid");
  if (source.providerDetailsStripped !== true) errors.push("runtime_fee_classification_review_provider_details_invalid");

  const reviewedFeeRowRefs = stringArray(source.reviewedFeeRowRefs, "reviewedFeeRowRefs", errors);
  const absenceProof = source.absenceProof === null ? null : stringValue(source.absenceProof);
  if (source.absenceProof !== null && !absenceProof) errors.push("runtime_fee_classification_review_absence_proof_invalid");
  const limitationCodes = enumArray(source.limitationCodes, LIMITATION_CODES, "limitationCodes", errors);
  const reasonCodes = reasonCodeArray(source.reasonCodes, "reasonCodes", errors);
  const suggestions = suggestionArray(source.suggestions, packet, errors);
  const reviewedDuplicates = duplicates(reviewedFeeRowRefs);
  for (const duplicate of reviewedDuplicates) errors.push(`runtime_fee_classification_review_duplicate_reviewed_row:${duplicate}`);

  const sortedReviewed = [...reviewedFeeRowRefs].sort();
  for (const feeRowRef of reviewedFeeRowRefs) {
    if (!packet.materialFeeRowRefs.includes(feeRowRef)) errors.push(`runtime_fee_classification_review_row_not_in_packet:${feeRowRef}`);
  }

  if (status === "not_needed") {
    if (
      packet.materialFeeRowRefs.length !== 0 ||
      reviewedFeeRowRefs.length !== 0 ||
      suggestions.length !== 0 ||
      packet.absenceProof === null ||
      absenceProof !== packet.absenceProof
    ) {
      errors.push("runtime_fee_classification_review_not_needed_without_absence_proof");
    }
  } else if (absenceProof !== null) {
    errors.push("runtime_fee_classification_review_absence_proof_for_triggered_review");
  }
  if (status === "completed_no_suggestions" || status === "completed_with_diagnostic_suggestions") {
    if (!sameSet(reviewedFeeRowRefs, packet.materialFeeRowRefs) || reviewedFeeRowRefs.length === 0) {
      errors.push("runtime_fee_classification_review_completion_without_exact_review_population");
    }
  }
  if (status === "completed_no_suggestions" && suggestions.length !== 0) {
    errors.push("runtime_fee_classification_review_no_suggestions_has_payload");
  }
  if (status === "completed_with_diagnostic_suggestions" && suggestions.length === 0) {
    errors.push("runtime_fee_classification_review_diagnostic_status_without_suggestions");
  }
  if (status && FAILURE_STATUSES.has(status) && suggestions.length !== 0) {
    errors.push("runtime_fee_classification_review_unsuccessful_status_has_suggestions");
  }
  for (const suggestion of suggestions) {
    if (!reviewedFeeRowRefs.includes(suggestion.feeRowRef)) {
      errors.push(`runtime_fee_classification_review_suggestion_outside_reviewed_population:${suggestion.feeRowRef}`);
    }
  }

  const suggestionKeys = new Set<string>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.feeRowRef}\u0000${suggestion.suggestedCategory}\u0000${suggestion.disposition}`;
    if (suggestionKeys.has(key)) errors.push(`runtime_fee_classification_review_duplicate_suggestion:${suggestion.feeRowRef}`);
    suggestionKeys.add(key);
  }
  const suggestionsByRow = new Map<string, CanonicalRuntimeFeeClassificationSuggestion[]>();
  for (const suggestion of suggestions) {
    suggestionsByRow.set(suggestion.feeRowRef, [...(suggestionsByRow.get(suggestion.feeRowRef) ?? []), suggestion]);
  }
  for (const [feeRowRef, rowSuggestions] of suggestionsByRow) {
    const categories = new Set(rowSuggestions.map((suggestion) => suggestion.suggestedCategory));
    const dispositions = new Set(rowSuggestions.map((suggestion) => suggestion.disposition));
    if (categories.size > 1 || dispositions.size > 1) {
      errors.push(`runtime_fee_classification_review_conflicting_suggestions:${feeRowRef}`);
    }
  }

  if (errors.length > 0 || !status) {
    return rejectedReview(packet, errors, errors.some((error) => /forbidden|provider|financial|merchant|path|raw|prompt|response/i.test(error)) ? "safety_blocked" : "rejected");
  }

  return {
    ok: true,
    packet,
    review: {
      type: "runtime_fee_classification_review",
      policyVersion: CANONICAL_RUNTIME_FEE_CLASSIFICATION_REVIEW_POLICY_VERSION,
      status,
      reviewedFeeRowRefs: sortedReviewed,
      suggestions: [...suggestions].sort((left, right) => left.feeRowRef.localeCompare(right.feeRowRef)),
      absenceProof,
      limitationCodes: [...new Set(limitationCodes)].sort(),
      reasonCodes: [...new Set(reasonCodes)].sort(),
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    },
  };
}

function suggestionArray(
  value: unknown,
  packet: CanonicalRuntimeFeeClassificationReviewPacket,
  errors: string[],
): CanonicalRuntimeFeeClassificationSuggestion[] {
  if (!Array.isArray(value)) {
    errors.push("runtime_fee_classification_review_suggestions_invalid");
    return [];
  }
  return value.flatMap((item, index): CanonicalRuntimeFeeClassificationSuggestion[] => {
    const path = `suggestions[${index}]`;
    if (!isPlainRecord(item)) {
      errors.push(`runtime_fee_classification_review_${path}_not_plain_object`);
      return [];
    }
    errors.push(...unknownKeyErrors(item, SUGGESTION_ALLOWED_KEYS, path));
    errors.push(...recursiveForbiddenContentErrors(item, path));
    const source = item as Record<string, unknown>;
    const feeRowRef = stringValue(source.feeRowRef);
    const evidenceRefs = stringArray(source.evidenceRefs, `${path}.evidenceRefs`, errors);
    const candidateRef = source.currentClassificationCandidateRef === null ? null : stringValue(source.currentClassificationCandidateRef);
    const suggestedCategory = enumValue(source.suggestedCategory, CATEGORIES);
    const confidence = enumValue(source.confidence, CONFIDENCES);
    const disposition = enumValue(source.disposition, DISPOSITIONS);
    const reasonCodes = reasonCodeArray(source.reasonCodes, `${path}.reasonCodes`, errors);
    if (!feeRowRef) errors.push(`runtime_fee_classification_review_${path}_fee_row_ref_invalid`);
    if (source.currentClassificationCandidateRef !== null && !candidateRef) errors.push(`runtime_fee_classification_review_${path}_candidate_ref_invalid`);
    if (!suggestedCategory) errors.push(`runtime_fee_classification_review_${path}_category_invalid`);
    if (!confidence) errors.push(`runtime_fee_classification_review_${path}_confidence_invalid`);
    if (!disposition) errors.push(`runtime_fee_classification_review_${path}_disposition_invalid`);
    if (source.authoritative !== false) errors.push(`runtime_fee_classification_review_${path}_authoritative_invalid`);
    if (evidenceRefs.length === 0) errors.push(`runtime_fee_classification_review_${path}_evidence_refs_empty`);
    if (feeRowRef && !packet.materialFeeRowRefs.includes(feeRowRef)) {
      errors.push(`runtime_fee_classification_review_${path}_fee_row_ref_unknown`);
    }
    if (feeRowRef) {
      const allowedEvidence = packet.evidenceRefsByFeeRowRef[feeRowRef] ?? [];
      for (const evidenceRef of evidenceRefs) {
        if (!allowedEvidence.includes(evidenceRef)) errors.push(`runtime_fee_classification_review_${path}_evidence_ref_mismatch`);
      }
      const allowedCandidates = packet.classificationCandidateRefsByFeeRowRef[feeRowRef] ?? [];
      if (candidateRef && !allowedCandidates.includes(candidateRef)) {
        errors.push(`runtime_fee_classification_review_${path}_candidate_ref_mismatch`);
      }
    }
    if (!feeRowRef || !suggestedCategory || !confidence || !disposition || source.authoritative !== false) return [];
    return [
      {
        feeRowRef,
        evidenceRefs: [...new Set(evidenceRefs)].sort(),
        currentClassificationCandidateRef: candidateRef,
        suggestedCategory,
        confidence,
        disposition,
        reasonCodes: [...new Set(reasonCodes)].sort(),
        authoritative: false,
      },
    ];
  });
}

function rejectedReview(
  packet: CanonicalRuntimeFeeClassificationReviewPacket,
  errors: string[],
  status: Extract<CanonicalRuntimeFeeClassificationReviewStatus, "rejected" | "safety_blocked">,
): CanonicalRuntimeFeeClassificationReviewValidationResult {
  return {
    ok: false,
    packet,
    errors: [...new Set(errors)].sort(),
    review: {
      type: "runtime_fee_classification_review",
      policyVersion: CANONICAL_RUNTIME_FEE_CLASSIFICATION_REVIEW_POLICY_VERSION,
      status,
      reviewedFeeRowRefs: [],
      suggestions: [],
      absenceProof: null,
      limitationCodes: ["ai_output_rejected"],
      reasonCodes: ["runtime_fee_classification_review_rejected"],
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    },
  };
}

function stringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`runtime_fee_classification_review_${path}_invalid`);
    return [];
  }
  const output: string[] = [];
  value.forEach((item, index) => {
    const normalized = stringValue(item);
    if (!normalized) errors.push(`runtime_fee_classification_review_${path}_${index}_invalid`);
    else output.push(normalized);
  });
  return output;
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T[] {
  if (!Array.isArray(value)) {
    errors.push(`runtime_fee_classification_review_${path}_invalid`);
    return [];
  }
  return value.flatMap((item, index): T[] => {
    const normalized = enumValue(item, allowed);
    if (!normalized) {
      errors.push(`runtime_fee_classification_review_${path}_${index}_unsupported`);
      return [];
    }
    return [normalized];
  });
}

function reasonCodeArray(value: unknown, path: string, errors: string[]): string[] {
  const codes = stringArray(value, path, errors);
  for (const code of codes) {
    if (!/^runtime_fee_classification_[a-z0-9_]{1,80}$/.test(code)) {
      errors.push(`runtime_fee_classification_review_${path}_unsupported`);
    }
  }
  return codes;
}

function recursiveForbiddenContentErrors(value: unknown, path: string): string[] {
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_VALUE_PATTERN.test(value)) return [`runtime_fee_classification_review_forbidden_value:${path}`];
    return [];
  }
  if (!isPlainRecord(value) && !Array.isArray(value)) return [`runtime_fee_classification_review_non_plain_object:${path}`];
  if (Array.isArray(value)) return value.flatMap((item, index) => recursiveForbiddenContentErrors(item, `${path}[${index}]`));
  const errors: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = `${path}.${key}`;
    if (key !== "providerDetailsStripped" && FORBIDDEN_KEY_PATTERN.test(key)) {
      errors.push(`runtime_fee_classification_review_forbidden_key:${nestedPath}`);
    }
    errors.push(...recursiveForbiddenContentErrors(nested, nestedPath));
  }
  return errors;
}

function unknownKeyErrors(value: Record<string, unknown>, allowedKeys: readonly string[], path: string): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `runtime_fee_classification_review_unknown_key:${path}.${key}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated].sort();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}
