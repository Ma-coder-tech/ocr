import type {
  CanonicalAiLimitationCode,
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalFeeActionability,
  CanonicalFeeCategory,
  CanonicalFeeClassificationConfidence,
  CanonicalFeeParty,
  CanonicalStatementAnalysis,
  CanonicalWholeStatementFeeIntelligenceAcceptanceRecord,
  CanonicalWholeStatementFeeIntelligenceCoverageProof,
  CanonicalWholeStatementFeeIntelligenceDisposition,
  CanonicalWholeStatementFeeIntelligenceEvidenceProvenance,
  CanonicalWholeStatementFeeIntelligenceRowInterpretation,
  CanonicalWholeStatementFeeIntelligenceStatus,
} from "./types.js";

export const WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION =
  "whole_statement_fee_intelligence_review_v1" as const;
export const WHOLE_STATEMENT_FEE_INTELLIGENCE_PACKET_POLICY_VERSION =
  "whole_statement_fee_intelligence_packet_v1" as const;
export const WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION =
  "whole_statement_fee_intelligence_coverage_v1" as const;
export const WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION =
  "whole_statement_fee_intelligence_acceptance_v1" as const;

export type CanonicalWholeStatementFeeIntelligencePacket = {
  policyVersion: typeof WHOLE_STATEMENT_FEE_INTELLIGENCE_PACKET_POLICY_VERSION;
  statementAnalysisRef: string;
  statementContext: {
    processorName: string | null;
    statementPeriodStatus: CanonicalStatementAnalysis["identity"]["statementPeriod"]["status"];
    businessTypeStatus: CanonicalStatementAnalysis["identity"]["businessType"]["status"];
    feeLedgerStatus: CanonicalStatementAnalysis["feeLedger"]["status"];
  };
  admittedFeeRows: Array<{
    feeRowRef: string;
    role: CanonicalStatementAnalysis["feeLedger"]["rows"][number]["role"];
    selectedLabel: string;
    contributesToUniqueTotal: boolean;
    contributionReasonCode: string;
    selectedAmountPresent: boolean;
    signedAmountDirection: "charge" | "credit" | "zero" | "unknown";
    evidenceRefs: string[];
    currentDeterministicCandidates: Array<{
      candidateRef: string;
      category: CanonicalFeeCategory;
      likelyEconomicOwner: CanonicalFeeParty;
      likelyContractualController: CanonicalFeeParty;
      actionabilityCeiling: CanonicalFeeActionability;
      confidence: CanonicalFeeClassificationConfidence;
      sourceType: string;
      evidenceRefs: string[];
    }>;
    currentLimitations: string[];
  }>;
  approvedExternalSourceRefs: string[];
  forbidden: string[];
};

export type ApprovedWholeStatementFeeIntelligenceSourceRegistry = {
  approvedExternalSourceRefs: readonly string[];
};

export type CanonicalWholeStatementFeeIntelligenceValidationResult =
  | {
      ok: true;
      output: CanonicalAiWholeStatementFeeIntelligenceOutput;
      packet: CanonicalWholeStatementFeeIntelligencePacket;
      errors: [];
    }
  | {
      ok: false;
      output: CanonicalAiWholeStatementFeeIntelligenceOutput;
      packet: CanonicalWholeStatementFeeIntelligencePacket;
      errors: string[];
    };

const OUTPUT_ALLOWED_KEYS = [
  "type",
  "reviewPolicyVersion",
  "reviewStatus",
  "evidenceRefs",
  "factRefs",
  "limitationCodes",
  "rowInterpretations",
  "reasonCodes",
  "authoritative",
  "financialMutationAllowed",
  "providerDetailsStripped",
] as const;

const INTERPRETATION_ALLOWED_KEYS = [
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
  "conflicts",
  "missingEvidence",
  "recommendedDisposition",
  "authoritative",
] as const;

const REVIEW_STATUSES: readonly CanonicalWholeStatementFeeIntelligenceStatus[] = [
  "completed",
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

const PARTIES: readonly CanonicalFeeParty[] = [
  "network",
  "card_brand",
  "issuer_or_interchange",
  "processor",
  "third_party",
  "merchant_contract",
  "tax_or_government",
  "unknown",
] as const;

const ACTIONABILITY: readonly CanonicalFeeActionability[] = [
  "potentially_actionable",
  "verify_only",
  "not_actionable",
  "unknown",
] as const;

const CONFIDENCES: readonly CanonicalFeeClassificationConfidence[] = ["high", "medium", "low"] as const;
const PROVENANCE: readonly CanonicalWholeStatementFeeIntelligenceEvidenceProvenance[] = [
  "statement_evidence",
  "approved_external_documentation",
  "industry_inference",
  "merchant_evidence",
  "human_review",
] as const;
const DISPOSITIONS: readonly CanonicalWholeStatementFeeIntelligenceDisposition[] = [
  "supported",
  "insufficient_evidence",
  "conflicting_evidence",
  "human_review",
] as const;

const LIMITATION_CODES: readonly CanonicalAiLimitationCode[] = [
  "full_statement_anomaly_review_required",
  "whole_statement_fee_intelligence_review_required",
  "material_fee_classification_review_required",
  "notice_change_review_required",
  "benchmark_category_review_required",
  "benchmark_category_not_verified",
  "ai_narrative_unavailable",
  "ai_output_rejected",
  "provider_unavailable",
  "deterministic_explanation_available",
] as const;

const FORBIDDEN_KEY_PATTERN =
  /(?:amount|currency|total|transactionCount|processedSales|target|cadence|calculation|formula|savings|opportunity|eligibility|annualImpact|override|correctedValue|packageG|state|permissions|actions|customerWording|provider|model|adapter|prompt|response|rawError|merchant(?:Name|Id|Number|Account)?|filename|fileName|path|raw(?:Statement)?Text|excerpt)/i;

const FORBIDDEN_VALUE_PATTERN =
  /(?:\/Users\/|\/private\/|[A-Za-z]:\\|\.pdf\b|\.csv\b|account(?:\s|_)?(?:number|id)?|merchant(?:\s|_)?(?:name|id|number|account)|api(?:\s|-)?key|billing|openai|anthropic|claude|gpt|raw(?:\s|-)?(?:prompt|response|error)|\$|\b\d+(?:,\d{3})*(?:\.\d+)?%?\b)/i;

export function buildWholeStatementFeeIntelligencePacket(
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability" | "evidence">,
  registry: ApprovedWholeStatementFeeIntelligenceSourceRegistry = { approvedExternalSourceRefs: [] },
): CanonicalWholeStatementFeeIntelligencePacket {
  const evidenceRefByOccurrenceId = new Map(analysis.feeLedger.sourceOccurrences.map((occurrence) => [occurrence.id, occurrence.evidenceRef]));
  const classificationByRow = new Map(analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification]));

  return {
    policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_PACKET_POLICY_VERSION,
    statementAnalysisRef: analysis.identity.sourceDocumentRef,
    statementContext: {
      processorName: analysis.identity.processorName.value,
      statementPeriodStatus: analysis.identity.statementPeriod.status,
      businessTypeStatus: analysis.identity.businessType.status,
      feeLedgerStatus: analysis.feeLedger.status,
    },
    admittedFeeRows: analysis.feeLedger.rows.map((row) => {
      const classification = classificationByRow.get(row.id);
      const occurrenceEvidenceRefs = row.sourceOccurrenceIds.map((id) => evidenceRefByOccurrenceId.get(id)).filter((id): id is string => Boolean(id));
      return {
        feeRowRef: row.id,
        role: row.role,
        selectedLabel: sanitizeText(row.selectedLabel, 140),
        contributesToUniqueTotal: row.contributesToUniqueTotal,
        contributionReasonCode: row.contributionDecision.reasonCode,
        selectedAmountPresent: row.selectedAmount !== null,
        signedAmountDirection: signedAmountDirection(row.signedAmount?.amountMinor ?? null),
        evidenceRefs: unique([...occurrenceEvidenceRefs, ...row.contributionDecision.evidenceRefs]).sort(),
        currentDeterministicCandidates: (classification?.candidates ?? []).map((candidate) => ({
          candidateRef: candidate.id,
          category: candidate.category,
          likelyEconomicOwner: candidate.ownership.economicBeneficiary,
          likelyContractualController: candidate.ownership.contractualController,
          actionabilityCeiling: candidate.actionabilityCeiling,
          confidence: candidate.confidence,
          sourceType: candidate.sourceType,
          evidenceRefs: unique(candidate.evidenceRefs).sort(),
        })),
        currentLimitations: unique([...row.limitations, ...(classification?.selected ? [] : ["No deterministic classification record was found."])]).map((item) =>
          sanitizeText(item, 180),
        ),
      };
    }),
    approvedExternalSourceRefs: unique([...registry.approvedExternalSourceRefs]).sort(),
    forbidden: [
      "Do not include amounts, totals, transaction counts, cadence, savings, opportunity, state, permissions, customer wording, provider/model identifiers, raw prompts/responses, file paths, filenames, or merchant identifiers.",
      "Use approved_external_documentation only when externalSourceRef is in approvedExternalSourceRefs.",
      "Use industry_inference when public documentation is unavailable; do not present inference as processor documentation.",
    ],
  };
}

export function validateWholeStatementFeeIntelligenceReview(
  rawReview: unknown,
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability" | "evidence">,
  registry: ApprovedWholeStatementFeeIntelligenceSourceRegistry = { approvedExternalSourceRefs: [] },
): CanonicalWholeStatementFeeIntelligenceValidationResult {
  const packet = buildWholeStatementFeeIntelligencePacket(analysis, registry);
  const errors: string[] = [];

  if (!isPlainRecord(rawReview)) {
    errors.push("whole_statement_fee_intelligence_not_plain_object");
    return rejectedResult(packet, errors, "rejected");
  }

  errors.push(...recursiveForbiddenContentErrors(rawReview, "review"));
  errors.push(...unknownKeyErrors(rawReview, OUTPUT_ALLOWED_KEYS, "review"));
  const source = rawReview as Record<string, unknown>;
  const reviewStatus = enumValue(source.reviewStatus, REVIEW_STATUSES);
  if (source.type !== "whole_statement_fee_intelligence_review") errors.push("whole_statement_fee_intelligence_type_invalid");
  if (source.reviewPolicyVersion !== WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION) {
    errors.push("whole_statement_fee_intelligence_policy_version_invalid");
  }
  if (!reviewStatus) errors.push("whole_statement_fee_intelligence_status_invalid");
  if (source.authoritative !== false) errors.push("whole_statement_fee_intelligence_authoritative_invalid");
  if (source.financialMutationAllowed !== false) errors.push("whole_statement_fee_intelligence_financial_mutation_invalid");
  if (source.providerDetailsStripped !== true) errors.push("whole_statement_fee_intelligence_provider_details_invalid");

  const evidenceRefs = stringArray(source.evidenceRefs, "evidenceRefs", errors);
  const factRefs = stringArray(source.factRefs, "factRefs", errors);
  const limitationCodes = enumArray(source.limitationCodes, LIMITATION_CODES, "limitationCodes", errors);
  const reasonCodes = reasonCodeArray(source.reasonCodes, "reasonCodes", errors);
  const rowInterpretations = interpretationArray(source.rowInterpretations, packet, analysis, registry, errors);
  const coverageProof = coverageProofFor(packet.admittedFeeRows.map((row) => row.feeRowRef), rowInterpretations, errors, reviewStatus === "completed");
  const acceptanceRecords = coverageProof.exactCoverage
    ? rowInterpretations.map((interpretation) => acceptanceRecordFor(interpretation, packet, registry))
    : [];

  if (reviewStatus === "completed" && !coverageProof.exactCoverage) {
    errors.push("whole_statement_fee_intelligence_completion_without_exact_coverage");
  }
  if (reviewStatus === "completed" && rowInterpretations.length === 0 && packet.admittedFeeRows.length > 0) {
    errors.push("whole_statement_fee_intelligence_completed_without_rows");
  }
  if (reviewStatus && reviewStatus !== "completed" && rowInterpretations.length !== 0) {
    errors.push("whole_statement_fee_intelligence_unsuccessful_status_has_interpretations");
  }

  if (errors.length > 0 || !reviewStatus) {
    return rejectedResult(
      packet,
      errors,
      reviewHasSafetyBlockedContent(source, errors) ? "safety_blocked" : "rejected",
      coverageProof,
    );
  }

  const output: CanonicalAiWholeStatementFeeIntelligenceOutput = {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus,
    evidenceRefs: unique(evidenceRefs).sort(),
    factRefs: unique(factRefs).sort(),
    limitationCodes: unique(limitationCodes).sort(),
    coverageProof,
    rowInterpretations: [...rowInterpretations].sort((left, right) => left.feeRowRef.localeCompare(right.feeRowRef)),
    acceptanceRecords: acceptanceRecords.sort((left, right) => left.feeRowRef.localeCompare(right.feeRowRef)),
    reasonCodes: unique(reasonCodes).sort(),
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
  return { ok: true, packet, output, errors: [] };
}

export function failedWholeStatementFeeIntelligenceOutput(
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability" | "evidence">,
  status: Exclude<CanonicalWholeStatementFeeIntelligenceStatus, "completed">,
  reasonCode: string,
): CanonicalAiWholeStatementFeeIntelligenceOutput {
  const packet = buildWholeStatementFeeIntelligencePacket(analysis);
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: status,
    evidenceRefs: [],
    factRefs: [],
    limitationCodes: status === "disabled" ? ["whole_statement_fee_intelligence_review_required", "provider_unavailable"] : ["ai_output_rejected"],
    coverageProof: coverageProofFor(packet.admittedFeeRows.map((row) => row.feeRowRef), [], []),
    rowInterpretations: [],
    acceptanceRecords: [],
    reasonCodes: [reasonCode],
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function interpretationArray(
  value: unknown,
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  analysis: Pick<CanonicalStatementAnalysis, "evidence">,
  registry: ApprovedWholeStatementFeeIntelligenceSourceRegistry,
  errors: string[],
): CanonicalWholeStatementFeeIntelligenceRowInterpretation[] {
  if (!Array.isArray(value)) {
    errors.push("whole_statement_fee_intelligence_row_interpretations_invalid");
    return [];
  }
  const packetRows = new Map(packet.admittedFeeRows.map((row) => [row.feeRowRef, row]));
  const evidenceIds = new Set(analysis.evidence.map((record) => record.id));
  const approvedExternalSourceRefs = new Set(registry.approvedExternalSourceRefs);
  return value.flatMap((item, index): CanonicalWholeStatementFeeIntelligenceRowInterpretation[] => {
    const path = `rowInterpretations[${index}]`;
    if (!isPlainRecord(item)) {
      errors.push(`whole_statement_fee_intelligence_${path}_not_plain_object`);
      return [];
    }
    errors.push(...unknownKeyErrors(item, INTERPRETATION_ALLOWED_KEYS, path));
    errors.push(...recursiveForbiddenContentErrors(item, path));
    const source = item as Record<string, unknown>;
    const feeRowRef = stringValue(source.feeRowRef);
    const proposedCategory = enumValue(source.proposedCategory, CATEGORIES);
    const likelyEconomicOwner = enumValue(source.likelyEconomicOwner, PARTIES);
    const likelyContractualController = enumValue(source.likelyContractualController, PARTIES);
    const proposedActionabilityCeiling = enumValue(source.proposedActionabilityCeiling, ACTIONABILITY);
    const confidence = enumValue(source.confidence, CONFIDENCES);
    const conciseRationale = sanitizeText(stringValue(source.conciseRationale) ?? "", 320);
    const evidenceProvenance = enumValue(source.evidenceProvenance, PROVENANCE);
    const evidenceRefs = stringArray(source.evidenceRefs, `${path}.evidenceRefs`, errors);
    const externalSourceRef = source.externalSourceRef === null ? null : stringValue(source.externalSourceRef);
    const conflicts = stringArray(source.conflicts, `${path}.conflicts`, errors).map((item) => sanitizeText(item, 160));
    const missingEvidence = stringArray(source.missingEvidence, `${path}.missingEvidence`, errors).map((item) => sanitizeText(item, 160));
    const recommendedDisposition = enumValue(source.recommendedDisposition, DISPOSITIONS);

    if (!feeRowRef) errors.push(`whole_statement_fee_intelligence_${path}_fee_row_ref_invalid`);
    if (feeRowRef && !packetRows.has(feeRowRef)) errors.push(`whole_statement_fee_intelligence_${path}_fee_row_ref_unknown`);
    if (!proposedCategory) errors.push(`whole_statement_fee_intelligence_${path}_category_invalid`);
    if (!likelyEconomicOwner) errors.push(`whole_statement_fee_intelligence_${path}_economic_owner_invalid`);
    if (!likelyContractualController) errors.push(`whole_statement_fee_intelligence_${path}_contractual_controller_invalid`);
    if (!proposedActionabilityCeiling) errors.push(`whole_statement_fee_intelligence_${path}_actionability_invalid`);
    if (!confidence) errors.push(`whole_statement_fee_intelligence_${path}_confidence_invalid`);
    if (!conciseRationale) errors.push(`whole_statement_fee_intelligence_${path}_rationale_invalid`);
    if (!evidenceProvenance) errors.push(`whole_statement_fee_intelligence_${path}_provenance_invalid`);
    if (!recommendedDisposition) errors.push(`whole_statement_fee_intelligence_${path}_disposition_invalid`);
    if (source.authoritative !== false) errors.push(`whole_statement_fee_intelligence_${path}_authoritative_invalid`);
    if (evidenceRefs.length === 0) errors.push(`whole_statement_fee_intelligence_${path}_evidence_refs_empty`);

    const allowedEvidence = new Set(packetRows.get(feeRowRef ?? "")?.evidenceRefs ?? []);
    for (const evidenceRef of evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`whole_statement_fee_intelligence_${path}_evidence_ref_unknown`);
      if (!allowedEvidence.has(evidenceRef)) errors.push(`whole_statement_fee_intelligence_${path}_evidence_ref_not_row_scoped`);
    }
    if (evidenceProvenance === "approved_external_documentation" && !externalSourceRef) {
      errors.push(`whole_statement_fee_intelligence_${path}_external_source_ref_missing`);
    } else if (evidenceProvenance !== "approved_external_documentation" && externalSourceRef !== null) {
      errors.push(`whole_statement_fee_intelligence_${path}_external_source_ref_without_documentation`);
    }
    if (evidenceProvenance === "industry_inference" && proposedActionabilityCeiling === "potentially_actionable") {
      errors.push(`whole_statement_fee_intelligence_${path}_inference_actionability_too_strong`);
    }
    if (
      conflicts.length > 0 &&
      recommendedDisposition !== "conflicting_evidence" &&
      recommendedDisposition !== "human_review"
    ) {
      errors.push(`whole_statement_fee_intelligence_${path}_conflict_disposition_invalid`);
    }

    if (
      !feeRowRef ||
      !proposedCategory ||
      !likelyEconomicOwner ||
      !likelyContractualController ||
      !proposedActionabilityCeiling ||
      !confidence ||
      !conciseRationale ||
      !evidenceProvenance ||
      !recommendedDisposition ||
      source.authoritative !== false
    ) {
      return [];
    }

    return [
      {
        feeRowRef,
        proposedCategory,
        likelyEconomicOwner,
        likelyContractualController,
        proposedActionabilityCeiling,
        confidence,
        conciseRationale,
        evidenceProvenance,
        evidenceRefs: unique(evidenceRefs).sort(),
        externalSourceRef,
        conflicts: unique(conflicts).sort(),
        missingEvidence: unique(missingEvidence).sort(),
        recommendedDisposition,
        authoritative: false,
      },
    ];
  });
}

function acceptanceRecordFor(
  interpretation: CanonicalWholeStatementFeeIntelligenceRowInterpretation,
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  registry: ApprovedWholeStatementFeeIntelligenceSourceRegistry,
): CanonicalWholeStatementFeeIntelligenceAcceptanceRecord {
  const accepted = acceptanceStatusFor(interpretation, registry);
  const acceptedSemanticFields =
    accepted === "accepted" || accepted === "accepted_with_conditions"
      ? {
          category: interpretation.proposedCategory,
          likelyEconomicOwner: interpretation.likelyEconomicOwner,
          likelyContractualController: interpretation.likelyContractualController,
          actionabilityCeiling: cappedActionability(interpretation),
          evidenceProvenance: interpretation.evidenceProvenance,
        }
      : {
          category: null,
          likelyEconomicOwner: null,
          likelyContractualController: null,
          actionabilityCeiling: null,
          evidenceProvenance: null,
        };
  return {
    feeRowRef: interpretation.feeRowRef,
    policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
    status: accepted,
    acceptedSemanticFields,
    evidenceRefs: unique(interpretation.evidenceRefs).sort(),
    externalSourceRef: interpretation.externalSourceRef,
    reasonCodes: acceptanceReasonCodes(interpretation, accepted, packet),
    conflicts: unique(interpretation.conflicts).sort(),
    actionabilityCeiling: cappedActionability(interpretation),
    immutableFeeRowRef: interpretation.feeRowRef,
  };
}

function acceptanceStatusFor(
  interpretation: CanonicalWholeStatementFeeIntelligenceRowInterpretation,
  registry: ApprovedWholeStatementFeeIntelligenceSourceRegistry,
): CanonicalWholeStatementFeeIntelligenceAcceptanceRecord["status"] {
  if (interpretation.recommendedDisposition === "human_review") return "human_review";
  if (interpretation.recommendedDisposition === "conflicting_evidence" || interpretation.conflicts.length > 0) return "needs_verification";
  if (interpretation.recommendedDisposition === "insufficient_evidence" || interpretation.missingEvidence.length > 0) return "needs_verification";
  if (
    interpretation.evidenceProvenance === "approved_external_documentation" &&
    (!interpretation.externalSourceRef || !registry.approvedExternalSourceRefs.includes(interpretation.externalSourceRef))
  ) {
    return "rejected";
  }
  if (interpretation.evidenceProvenance === "merchant_evidence") return "rejected";
  if (interpretation.evidenceProvenance === "industry_inference" || interpretation.confidence !== "high") return "accepted_with_conditions";
  return "accepted";
}

function acceptanceReasonCodes(
  interpretation: CanonicalWholeStatementFeeIntelligenceRowInterpretation,
  status: CanonicalWholeStatementFeeIntelligenceAcceptanceRecord["status"],
  packet: CanonicalWholeStatementFeeIntelligencePacket,
): string[] {
  const row = packet.admittedFeeRows.find((item) => item.feeRowRef === interpretation.feeRowRef);
  const codes = [`whole_statement_fee_intelligence_${status}`];
  if (interpretation.evidenceProvenance === "industry_inference") codes.push("whole_statement_fee_intelligence_industry_inference_limited");
  if (interpretation.evidenceProvenance === "approved_external_documentation") codes.push("whole_statement_fee_intelligence_approved_documentation");
  if (interpretation.evidenceProvenance === "merchant_evidence") codes.push("whole_statement_fee_intelligence_merchant_evidence_unavailable");
  if (interpretation.conflicts.length > 0) codes.push("whole_statement_fee_intelligence_conflict_preserved");
  if (interpretation.missingEvidence.length > 0) codes.push("whole_statement_fee_intelligence_missing_evidence_preserved");
  if (row?.contributesToUniqueTotal === false) codes.push("whole_statement_fee_intelligence_noncontributing_row_preserved");
  return unique(codes).sort();
}

function cappedActionability(
  interpretation: CanonicalWholeStatementFeeIntelligenceRowInterpretation,
): CanonicalFeeActionability {
  if (interpretation.evidenceProvenance === "industry_inference" && interpretation.proposedActionabilityCeiling === "potentially_actionable") {
    return "verify_only";
  }
  if (interpretation.confidence === "low" && interpretation.proposedActionabilityCeiling === "potentially_actionable") {
    return "verify_only";
  }
  return interpretation.proposedActionabilityCeiling;
}

function coverageProofFor(
  expected: readonly string[],
  interpretations: readonly CanonicalWholeStatementFeeIntelligenceRowInterpretation[],
  errors: string[],
  reportErrors = false,
): CanonicalWholeStatementFeeIntelligenceCoverageProof {
  const expectedSet = new Set(expected);
  const allReviewed = interpretations.map((interpretation) => interpretation.feeRowRef);
  const safeRefPattern = /^feerow_[a-f0-9]{12,32}$|^feerow_[a-z0-9_]{1,120}$/i;
  const validReviewed = allReviewed.filter((feeRowRef) => expectedSet.has(feeRowRef) && safeRefPattern.test(feeRowRef));
  const reviewed = validReviewed;
  const duplicatedFeeRowRefs = duplicates(reviewed);
  const unknownFeeRowRefs = unique(
    allReviewed
      .filter((feeRowRef) => !expectedSet.has(feeRowRef) && safeRefPattern.test(feeRowRef))
      .map((feeRowRef) => sanitizeCoverageRef(feeRowRef)),
  ).sort();
  const malformedFeeRowRefs = unique(
    allReviewed
      .filter((feeRowRef) => !safeRefPattern.test(feeRowRef))
      .map((feeRowRef) => sanitizeCoverageRef(feeRowRef)),
  ).sort();
  const reviewedSet = new Set(reviewed);
  const missingFeeRowRefs = expected.filter((feeRowRef) => !reviewedSet.has(feeRowRef)).sort();
  if (reportErrors) {
    for (const ref of duplicatedFeeRowRefs) errors.push(`whole_statement_fee_intelligence_duplicate_reviewed_row:${ref}`);
    for (const ref of unknownFeeRowRefs) errors.push(`whole_statement_fee_intelligence_unknown_reviewed_row:${ref}`);
    for (const ref of malformedFeeRowRefs) errors.push(`whole_statement_fee_intelligence_malformed_reviewed_row:${ref}`);
    for (const ref of missingFeeRowRefs) errors.push(`whole_statement_fee_intelligence_missing_reviewed_row:${ref}`);
  }
  return {
    policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
    expectedFeeRowRefs: [...expected].sort(),
    reviewedFeeRowRefs: [...reviewed].sort(),
    missingFeeRowRefs,
    duplicatedFeeRowRefs,
    unknownFeeRowRefs,
    malformedFeeRowRefs,
    malformedFeeRowRefCount: allReviewed.filter((feeRowRef) => !safeRefPattern.test(feeRowRef)).length,
    exactCoverage:
      missingFeeRowRefs.length === 0 &&
      duplicatedFeeRowRefs.length === 0 &&
      unknownFeeRowRefs.length === 0 &&
      malformedFeeRowRefs.length === 0 &&
      reviewed.length === expected.length,
  };
}

function rejectedResult(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  errors: string[],
  status: Extract<CanonicalWholeStatementFeeIntelligenceStatus, "rejected" | "safety_blocked">,
  coverageProof = coverageProofFor(packet.admittedFeeRows.map((row) => row.feeRowRef), [], []),
): CanonicalWholeStatementFeeIntelligenceValidationResult {
  return {
    ok: false,
    packet,
    errors: unique(errors).sort(),
    output: {
      type: "whole_statement_fee_intelligence_review",
      reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
      reviewStatus: status,
      evidenceRefs: [],
      factRefs: [],
      limitationCodes: ["ai_output_rejected"],
      coverageProof,
      rowInterpretations: [],
      acceptanceRecords: [],
      reasonCodes: ["whole_statement_fee_intelligence_rejected"],
      authoritative: false,
      financialMutationAllowed: false,
      providerDetailsStripped: true,
    },
  };
}

function reviewHasSafetyBlockedContent(source: Record<string, unknown>, errors: readonly string[]): boolean {
  return (
    errors.some((error) => /forbidden|merchant|path|raw|prompt|response/i.test(error)) ||
    (Object.hasOwn(source, "financialMutationAllowed") && source.financialMutationAllowed !== false) ||
    (Object.hasOwn(source, "providerDetailsStripped") && source.providerDetailsStripped !== true)
  );
}

function signedAmountDirection(amountMinor: number | null): "charge" | "credit" | "zero" | "unknown" {
  if (amountMinor === null) return "unknown";
  if (amountMinor < 0) return "charge";
  if (amountMinor > 0) return "credit";
  return "zero";
}

function stringArray(value: unknown, path: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(`whole_statement_fee_intelligence_${path}_invalid`);
    return [];
  }
  const output: string[] = [];
  value.forEach((item, index) => {
    const normalized = stringValue(item);
    if (!normalized) errors.push(`whole_statement_fee_intelligence_${path}_${index}_invalid`);
    else output.push(normalized);
  });
  return output;
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T[] {
  if (!Array.isArray(value)) {
    errors.push(`whole_statement_fee_intelligence_${path}_invalid`);
    return [];
  }
  return value.flatMap((item, index): T[] => {
    const normalized = enumValue(item, allowed);
    if (!normalized) {
      errors.push(`whole_statement_fee_intelligence_${path}_${index}_unsupported`);
      return [];
    }
    return [normalized];
  });
}

function reasonCodeArray(value: unknown, path: string, errors: string[]): string[] {
  const codes = stringArray(value, path, errors);
  for (const code of codes) {
    if (!/^whole_statement_fee_intelligence_[a-z0-9_]{1,90}$/.test(code)) {
      errors.push(`whole_statement_fee_intelligence_${path}_unsupported`);
    }
  }
  return codes;
}

function recursiveForbiddenContentErrors(value: unknown, path: string): string[] {
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_VALUE_PATTERN.test(value)) return [`whole_statement_fee_intelligence_forbidden_value:${path}`];
    return [];
  }
  if (!isPlainRecord(value) && !Array.isArray(value)) return [`whole_statement_fee_intelligence_non_plain_object:${path}`];
  if (Array.isArray(value)) return value.flatMap((item, index) => recursiveForbiddenContentErrors(item, `${path}[${index}]`));
  const errors: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = `${path}.${key}`;
    if (key !== "providerDetailsStripped" && FORBIDDEN_KEY_PATTERN.test(key)) {
      errors.push(`whole_statement_fee_intelligence_forbidden_key:${nestedPath}`);
    }
    errors.push(...recursiveForbiddenContentErrors(nested, nestedPath));
  }
  return errors;
}

function unknownKeyErrors(value: Record<string, unknown>, allowedKeys: readonly string[], path: string): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `whole_statement_fee_intelligence_unknown_key:${path}.${key}`);
}

function sanitizeText(input: string, maxLength: number): string {
  return input
    .replace(/\b\d{8,}\b/g, "[redacted-id]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeCoverageRef(input: string): string {
  if (/^feerow_[a-z0-9_]{1,120}$/i.test(input)) return input;
  return "malformed_fee_row_ref";
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

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
