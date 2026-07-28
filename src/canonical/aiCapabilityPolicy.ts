import type {
  CanonicalAiCapabilityId,
  CanonicalAiCapabilityTrigger,
  CanonicalAiFinancialReadiness,
  CanonicalAiLimitationCode,
  CanonicalFeeLedger,
  CanonicalFeeOwnershipActionability,
  CanonicalOpportunityEngine,
  CanonicalStatementIdentity,
} from "./types.js";

export const PACKAGE_F_KNOWN_LEGACY_RISK_CODES = [
  "legacy_ai_fee_type_mutation",
  "legacy_processor_fee_classification_mutation",
  "legacy_anomaly_estimated_impact",
  "legacy_ai_benchmark_category_selection",
  "legacy_notice_amount_cadence_extraction",
  "legacy_ai_fallback_financial_fields",
] as const;

export type AiCapabilityNeed = {
  capability: CanonicalAiCapabilityId;
  required: boolean;
  trigger: CanonicalAiCapabilityTrigger;
  failureFinancialReadiness: CanonicalAiFinancialReadiness;
  failureLimitationCodes: CanonicalAiLimitationCode[];
};

export function determineAiCapabilityNeeds(input: {
  identity: CanonicalStatementIdentity;
  feeLedger: CanonicalFeeLedger;
  feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  opportunityEngine: CanonicalOpportunityEngine;
  evidenceText: readonly string[];
}): AiCapabilityNeed[] {
  const materialFeeRows = materialUnresolvedFeeRows(input.feeLedger, input.feeOwnershipActionability, input.opportunityEngine);
  const noticeEvidenceRefs = noticeEvidenceRefsFromText(input.evidenceText);
  const benchmarkVerified = input.identity.businessType.status === "selected" && (input.identity.businessType.value ?? "").trim().length > 0;

  return [
    {
      capability: "full_statement_anomaly_review",
      required: true,
      trigger: {
        present: true,
        reasonCode: "required_for_customer_financial_conclusions",
        reason: "Customer-facing financial conclusions require either a successful full-statement anomaly review or a deterministic replacement.",
        evidenceRefs: [],
        feeRowRefs: [],
        opportunityComponentRefs: input.opportunityEngine.components.map((component) => component.id),
        absenceProof: null,
      },
      failureFinancialReadiness: "withheld",
      failureLimitationCodes: ["full_statement_anomaly_review_required", "provider_unavailable"],
    },
    {
      capability: "fee_classification_review",
      required: materialFeeRows.length > 0,
      trigger:
        materialFeeRows.length > 0
          ? {
              present: true,
              reasonCode: "material_unresolved_fee_rows",
              reason: "A nonzero unresolved fee row could affect totals, ownership, actionability, Package E components, targets, cadence, calculations, or benchmark applicability.",
              evidenceRefs: materialFeeRows.flatMap((row) => row.evidenceRefs),
              feeRowRefs: materialFeeRows.map((row) => row.id),
              opportunityComponentRefs: opportunityRefsForFeeRows(input.opportunityEngine, materialFeeRows.map((row) => row.id)),
              absenceProof: null,
            }
          : {
              present: false,
              reasonCode: "deterministic_absence_proven",
              reason: "No nonzero unresolved counted fee row was found in the canonical fee ledger.",
              evidenceRefs: [],
              feeRowRefs: [],
              opportunityComponentRefs: [],
              absenceProof: "Materiality v1 has no dollar threshold; all nonzero unresolved counted fee rows are material.",
            },
      failureFinancialReadiness: materialFeeRows.length > 0 ? "limited" : "ready",
      failureLimitationCodes: materialFeeRows.length > 0 ? ["material_fee_classification_review_required", "provider_unavailable"] : [],
    },
    {
      capability: "notice_change_review",
      required: noticeEvidenceRefs.length > 0,
      trigger:
        noticeEvidenceRefs.length > 0
          ? {
              present: true,
              reasonCode: "notice_dependent_conclusions",
              reason: "Statement notice evidence was present, so notice-dependent targets, cadence, and actions must be withheld unless grounded.",
              evidenceRefs: noticeEvidenceRefs,
              feeRowRefs: [],
              opportunityComponentRefs: [],
              absenceProof: null,
            }
          : {
              present: false,
              reasonCode: "deterministic_absence_proven",
              reason: "No statement notice evidence was identified in the canonical evidence inventory.",
              evidenceRefs: [],
              feeRowRefs: [],
              opportunityComponentRefs: [],
              absenceProof: "Notice-change review is not triggered without notice evidence.",
            },
      failureFinancialReadiness: noticeEvidenceRefs.length > 0 ? "limited" : "ready",
      failureLimitationCodes: noticeEvidenceRefs.length > 0 ? ["notice_change_review_required", "provider_unavailable"] : [],
    },
    {
      capability: "benchmark_category_review",
      required: !benchmarkVerified,
      trigger: !benchmarkVerified
        ? {
            present: true,
            reasonCode: "benchmark_applicability_unverified",
            reason: "Benchmark applicability lacks explicit verified merchant selection, deterministic category evidence, or approved non-AI category policy.",
            evidenceRefs: [],
            feeRowRefs: [],
            opportunityComponentRefs: [],
            absenceProof: null,
          }
        : {
            present: false,
            reasonCode: "deterministic_absence_proven",
            reason: "Benchmark category AI is not needed because business type is explicitly selected in canonical identity.",
            evidenceRefs: input.identity.businessType.evidenceRefs,
            feeRowRefs: [],
            opportunityComponentRefs: [],
            absenceProof: "Benchmark presentation may proceed only from verified merchant selection, deterministic category evidence, or approved non-AI category policy.",
          },
      failureFinancialReadiness: !benchmarkVerified ? "limited" : "ready",
      failureLimitationCodes: !benchmarkVerified ? ["benchmark_category_review_required", "benchmark_category_not_verified", "provider_unavailable"] : [],
    },
    {
      capability: "merchant_narrative",
      required: false,
      trigger: {
        present: true,
        reasonCode: "narrative_preferred",
        reason: "AI narrative is preferred only when it is grounded and preserves canonical limitations; deterministic fallback remains acceptable.",
        evidenceRefs: [],
        feeRowRefs: [],
        opportunityComponentRefs: [],
        absenceProof: null,
      },
      failureFinancialReadiness: "ready",
      failureLimitationCodes: ["ai_narrative_unavailable"],
    },
    {
      capability: "document_quality_review",
      required: false,
      trigger: {
        present: false,
        reasonCode: "document_quality_optional",
        reason: "Document quality review is optional in Package F v1 and does not create financial authority.",
        evidenceRefs: [],
        feeRowRefs: [],
        opportunityComponentRefs: [],
        absenceProof: "Canonical parser controls and validation provide the Package F v1 document-quality boundary.",
      },
      failureFinancialReadiness: "ready",
      failureLimitationCodes: [],
    },
  ];
}

function materialUnresolvedFeeRows(
  feeLedger: CanonicalFeeLedger,
  feeOwnershipActionability: CanonicalFeeOwnershipActionability,
  opportunityEngine: CanonicalOpportunityEngine,
): Array<{ id: string; evidenceRefs: string[] }> {
  const classifications = new Map(feeOwnershipActionability.rowClassifications.map((row) => [row.feeRowId, row]));
  const evidenceRefByOccurrenceId = new Map(feeLedger.sourceOccurrences.map((occurrence) => [occurrence.id, occurrence.evidenceRef]));
  const opportunityFeeRows = new Set(opportunityEngine.components.flatMap((component) => component.feeRowRefs.map((ref) => ref.feeRowId)));
  const rows: Array<{ id: string; evidenceRefs: string[] }> = [];
  for (const row of feeLedger.rows) {
    const classification = classifications.get(row.id);
    const amountMinor = row.selectedAmount?.amountMinor ?? 0;
    const counted = row.contributesToUniqueTotal || opportunityFeeRows.has(row.id);
    const unresolved =
      row.role === "unknown_unresolved" ||
      classification?.selected.category === "unknown_needs_review" ||
      classification?.selected.actionabilityCeiling === "unknown" ||
      classification?.selected.ownership.economicBeneficiary === "unknown" ||
      classification?.conflictStatus === "unresolved" ||
      classification?.conflictStatus === "requires_human_review";
    if (counted && amountMinor !== 0 && unresolved) {
      rows.push({ id: row.id, evidenceRefs: row.sourceOccurrenceIds.map((id) => evidenceRefByOccurrenceId.get(id)).filter((id): id is string => Boolean(id)) });
    }
  }
  return rows;
}

function opportunityRefsForFeeRows(opportunityEngine: CanonicalOpportunityEngine, feeRowIds: string[]): string[] {
  const wanted = new Set(feeRowIds);
  return opportunityEngine.components
    .filter((component) => component.feeRowRefs.some((ref) => wanted.has(ref.feeRowId)))
    .map((component) => component.id);
}

function noticeEvidenceRefsFromText(evidenceText: readonly string[]): string[] {
  const refs: string[] = [];
  for (const text of evidenceText) {
    const [id, body] = text.split("\u0000", 2);
    if (/\b(notice|important information|effective|change in terms)\b/i.test(body ?? "")) refs.push(id);
  }
  return refs;
}
