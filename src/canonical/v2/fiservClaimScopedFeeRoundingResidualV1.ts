import { documentIrFromPdfjsParsedDocument } from "../../documentIrFromPdfjs.js";
import { assessFiservFirstDataFamily, attachFiservDocumentSections } from "../../fiservDocumentSections.js";
import { extractFiservTopLevelFinancialsFromDocumentIr } from "../../fiservTopLevelFromDocumentIr.js";
import type { ParsedDocument } from "../../parser.js";
import { kernelParsedDocumentFingerprint } from "../../reconstructionKernel/canonicalRbLimitedAuthority.js";
import { fiservFeeLedgerOccurrences } from "./fiservAdapter.js";
import type { FiservRuntimeCapabilityProof } from "./fiservRuntimeCapabilityAdmission.js";
import type { CanonicalEconomicsV2Foundation, CanonicalEconomicsV2SourceOccurrence } from "./types.js";

export const FISERV_CLAIM_SCOPED_FEE_ROUNDING_RESIDUAL_V1 =
  "fiserv_claim_scoped_fee_rounding_residual_2026_09_12_v1" as const;
export const FISERV_BOUNDED_FEE_ROUNDING_POLICY_V1 =
  "fiserv_fee_total_nonadditive_rounding_residual_max_2_minor_units_v1" as const;
export const FISERV_BOUNDED_FEE_ROUNDING_MAX_ABSOLUTE_MINOR = 2 as const;

export type FiservClaimScopedFeeRoundingDecisionV1 = {
  occurrenceRef: string;
  evidenceRef: string;
  amountMinor: number | null;
  printedDirection: CanonicalEconomicsV2SourceOccurrence["printedDirection"];
  decision: "ADMITTED_ADDITIVE_CHARGE" | "PRESERVED_ZERO_NONADDITIVE" | "WITHHELD";
  reasonCodes: string[];
};

export type FiservClaimScopedFeeRoundingResidualV1 = {
  schemaVersion: typeof FISERV_CLAIM_SCOPED_FEE_ROUNDING_RESIDUAL_V1;
  policyVersion: typeof FISERV_BOUNDED_FEE_ROUNDING_POLICY_V1;
  authority: "rd_only_claim_scoped_bounded_fee_rounding";
  processorScope: "supported_fiserv_family_native_text";
  status: "ADMITTED" | "WITHHELD";
  sourceDocumentRef: string;
  sourceFingerprint: string | null;
  statementPeriod: { start: string; end: string } | null;
  sourceBinding: {
    pdfSource: boolean;
    extractableNativeText: boolean;
    completeSuppliedDocument: boolean;
    sourceFingerprintMatched: boolean;
    supportedFiservFamily: boolean;
    familyBasis: "brand_or_structure" | "canonical_runtime_plus_top_level_structure" | "unproven";
    statementPeriodProven: boolean;
    occurrenceEvidenceComplete: boolean;
  };
  control: {
    controlId: string | null;
    controlResult: "pass_with_rounding" | null;
    toleranceBasis: string | null;
    declaredToleranceMinor: number | null;
    maximumAcceptedAbsoluteResidualMinor: typeof FISERV_BOUNDED_FEE_ROUNDING_MAX_ABSOLUTE_MINOR;
    authoritativeFeeTotalOccurrenceRef: string | null;
    authoritativeFeeTotalEvidenceRef: string | null;
    printedStatementFeeTotalMinor: number | null;
    admittedFeeOccurrenceSumMinor: number | null;
    signedResidualMinor: number | null;
    absoluteResidualMinor: number | null;
    reconciliationState: "accepted_bounded_rounding_nonadditive" | "not_admitted";
    normalizedFeeRowCount: number;
    normalizedNonzeroFeeRowCount: number;
    normalizedZeroDollarRowCount: number;
    duplicateOrRepeatRepresentationExcluded: boolean;
    principalOrAdjustmentRequiredForReconciliation: false;
    individualPrintedAmountsModified: false;
    residualCreatesAdditiveOccurrence: false;
    reasonCode: "bounded_rounding_reconciles_complete_fee_population" | "bounded_rounding_not_proven";
  };
  admittedOccurrenceRefs: string[];
  zeroDollarOccurrenceRefs: string[];
  decisions: FiservClaimScopedFeeRoundingDecisionV1[];
  proofEvidenceRefs: string[];
  reasonCodes: string[];
  safety: {
    rdSoleAdditiveLedger: true;
    roundingResidualAdditive: false;
    commercialDecompositionAdditiveAuthority: false;
    rowMutationAllowed: false;
    residualAllocationAllowed: false;
    feeCreditAdmissionAllowed: false;
    principalOrAdjustmentFeeAdmissionAllowed: false;
    summaryOrRepeatAdmissionAllowed: false;
    participantOrCategoryAssignmentAllowedForResidual: false;
    comparisonOrSavingsUseAllowed: false;
    canonicalMutationAllowed: false;
    customerRoutingAllowed: false;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
  };
  limitations: string[];
};

export function fiservClaimScopedFeeRoundingMatchesFoundationV1(
  admission: FiservClaimScopedFeeRoundingResidualV1,
  foundation: CanonicalEconomicsV2Foundation,
): boolean {
  return admission.sourceDocumentRef === foundation.identity.sourceDocumentRef &&
    foundation.identity.sourceFingerprintStatus === "available" &&
    admission.sourceFingerprint === foundation.identity.sourceFingerprint;
}

export function fiservClaimScopedFeeRoundingBoundSourceDigestV1(
  admission: FiservClaimScopedFeeRoundingResidualV1,
): string | null {
  return admission.sourceFingerprint;
}

export function fiservClaimScopedFeeRoundingControlMatchesFoundationV1(
  control: {
    sourceDocumentRef: string;
    boundSourceDigest: string;
    statementPeriodStart: string;
    statementPeriodEnd: string;
    authoritativeFeeFactRef: string;
  },
  foundation: CanonicalEconomicsV2Foundation,
): boolean {
  const period = foundation.identity.statementPeriod;
  return control.sourceDocumentRef === foundation.identity.sourceDocumentRef &&
    foundation.identity.sourceFingerprintStatus === "available" &&
    control.boundSourceDigest === foundation.identity.sourceFingerprint &&
    control.authoritativeFeeFactRef === foundation.financialPopulations.totalStatementProcessingFees.id &&
    Boolean(period) && period!.start === control.statementPeriodStart && period!.end === control.statementPeriodEnd;
}

export function resolveFiservClaimScopedFeeRoundingResidualV1(input: {
  document: ParsedDocument;
  parserOutput: unknown;
  foundation: CanonicalEconomicsV2Foundation;
  capabilityProof: FiservRuntimeCapabilityProof;
}): FiservClaimScopedFeeRoundingResidualV1 {
  const output = record(input.parserOutput);
  const feeRows = records(record(output.feeLedger).rows);
  const foundation = input.foundation;
  const occurrences = fiservFeeLedgerOccurrences(foundation);
  const evidenceIds = new Set(foundation.sourceModel.evidence.map((item) => item.id));
  const sourceFingerprint = kernelParsedDocumentFingerprint(input.document);
  const sourceFingerprintMatched = foundation.identity.sourceFingerprintStatus === "available" &&
    foundation.identity.sourceFingerprint === sourceFingerprint;
  const integrity = foundation.documentIntegrity;
  const completeSuppliedDocument = integrity.suppliedDocumentStatus === "complete_supplied_document" &&
    integrity.observedPageCount !== null && integrity.processedPageCount === integrity.observedPageCount &&
    integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete === true &&
    integrity.localIngestionTruncated === false;
  const pdfSource = input.document.sourceType === "pdf";
  const extractableNativeText = input.document.extraction.mode !== "unusable" && input.document.extraction.hasExtractableText;
  const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(input.document, {
    id: foundation.identity.sourceDocumentRef,
  }));
  const family = assessFiservFirstDataFamily(ir);
  let topLevel: ReturnType<typeof extractFiservTopLevelFinancialsFromDocumentIr> | null = null;
  try { topLevel = extractFiservTopLevelFinancialsFromDocumentIr(ir); } catch { /* fail closed */ }
  const canonicalFiservRuntime = /fiserv|first.?data/i.test([
    foundation.identity.processorFamily,
    foundation.identity.parserId,
    foundation.templateCapability.detectedFamily,
    foundation.templateCapability.detectedTemplate,
  ].filter(Boolean).join(" "));
  const supportedFiservFamily = Boolean(topLevel) && (family.isLikelyFiservFirstData || canonicalFiservRuntime);
  const familyBasis = family.isLikelyFiservFirstData ? "brand_or_structure" as const
    : supportedFiservFamily ? "canonical_runtime_plus_top_level_structure" as const : "unproven" as const;
  const period = validStatementPeriod(foundation.identity.statementPeriod) ? foundation.identity.statementPeriod : null;
  const periodOccurrences = foundation.sourceModel.occurrences.filter((occurrence) =>
    occurrence.sourceLabel === "statementPeriod" && occurrence.evidenceRef,
  );
  const statementPeriodProven = period !== null && periodOccurrences.length > 0;

  const occurrenceIds = occurrences.map((occurrence) => occurrence.id);
  const uniqueOccurrenceIds = new Set(occurrenceIds).size === occurrenceIds.length;
  const allRowsAccountedFor = feeRows.length > 0 && occurrences.length === feeRows.length;
  const representationRefs = new Set(foundation.sourceModel.representationGroups
    .filter((group) => group.duplicateHandling !== "supporting_only")
    .flatMap((group) => group.occurrenceRefs));
  const normalizedRowsAreDetailOnly = occurrences.every((occurrence) =>
    occurrence.contributionRole === "supporting_detail" && !representationRefs.has(occurrence.id),
  );
  const allAmountsKnown = occurrences.every((occurrence) => occurrence.printedAmount !== null &&
    Number.isSafeInteger(occurrence.printedAmount.amountMinor));
  const allDirectionsKnown = occurrences.every((occurrence) => occurrence.printedDirection !== "unknown");
  const allNonzeroRowsAreAdditiveFees = occurrences.every((occurrence) => occurrence.printedAmount?.amountMinor === 0 || (
    occurrence.semanticRole === "fee_charge" && occurrence.printedAmount !== null && occurrence.printedAmount.amountMinor > 0 &&
    ["positive", "unsigned"].includes(occurrence.printedDirection)
  ));
  const occurrenceEvidenceComplete = occurrences.every((occurrence) =>
    Boolean(occurrence.evidenceRef) && evidenceIds.has(occurrence.evidenceRef));
  const admittedFeeOccurrenceSumMinor = allAmountsKnown
    ? occurrences.reduce((sum, occurrence) => sum + occurrence.printedAmount!.amountMinor, 0) : null;

  const occurrenceById = new Map(foundation.sourceModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const roundingControls = input.capabilityProof.reconciliationControlCandidates.filter((control) =>
    control.bindingState === "bound" && control.semanticPurpose === "complete_fee_occurrence_population" &&
    control.result === "pass_with_rounding" && control.authoritativeTotalOccurrenceRef !== null &&
    sameRefs(control.operandOccurrenceRefs, occurrenceIds),
  );
  const roundingControl = roundingControls.length === 1 ? roundingControls[0]! : null;
  const feeTotalOccurrence = roundingControl?.authoritativeTotalOccurrenceRef
    ? occurrenceById.get(roundingControl.authoritativeTotalOccurrenceRef) ?? null : null;
  const printedStatementFeeTotalMinor = feeTotalOccurrence?.printedAmount?.amountMinor ?? null;
  const signedResidualMinor = admittedFeeOccurrenceSumMinor !== null && printedStatementFeeTotalMinor !== null
    ? printedStatementFeeTotalMinor - admittedFeeOccurrenceSumMinor : null;
  const absoluteResidualMinor = signedResidualMinor === null ? null : Math.abs(signedResidualMinor);
  const declaredToleranceMinor = roundingControl?.tolerance === null || roundingControl?.tolerance === undefined
    ? null : Math.round(Math.abs(roundingControl.tolerance) * 100);
  const withinDeclaredControl = absoluteResidualMinor !== null && declaredToleranceMinor !== null &&
    absoluteResidualMinor <= declaredToleranceMinor;
  const withinProductBoundary = absoluteResidualMinor !== null && absoluteResidualMinor >= 1 &&
    absoluteResidualMinor <= FISERV_BOUNDED_FEE_ROUNDING_MAX_ABSOLUTE_MINOR;

  const globalReasons = unique([
    ...(pdfSource ? [] : ["pdf_source_required"]),
    ...(extractableNativeText ? [] : ["extractable_native_text_required"]),
    ...(completeSuppliedDocument ? [] : ["complete_supplied_document_required"]),
    ...(sourceFingerprintMatched ? [] : ["source_fingerprint_mismatch"]),
    ...(supportedFiservFamily ? [] : ["supported_fiserv_family_not_proven"]),
    ...(statementPeriodProven ? [] : ["statement_period_not_proven"]),
    ...(allRowsAccountedFor ? [] : ["normalized_fee_population_not_complete"]),
    ...(uniqueOccurrenceIds ? [] : ["unique_fee_occurrence_identity_not_proven"]),
    ...(normalizedRowsAreDetailOnly ? [] : ["duplicate_repeat_or_summary_representation_present"]),
    ...(allAmountsKnown ? [] : ["printed_fee_amount_not_known"]),
    ...(allDirectionsKnown ? [] : ["printed_fee_direction_not_known"]),
    ...(allNonzeroRowsAreAdditiveFees ? [] : ["fee_credit_or_unsafe_direction_outside_package"]),
    ...(occurrenceEvidenceComplete ? [] : ["fee_occurrence_source_evidence_incomplete"]),
    ...(roundingControl ? [] : ["governed_pass_with_rounding_control_not_proven"]),
    ...(withinDeclaredControl ? [] : ["residual_exceeds_declared_rounding_control"]),
    ...(withinProductBoundary ? [] : ["residual_outside_two_minor_unit_product_boundary"]),
  ]);
  const status = globalReasons.length === 0 ? "ADMITTED" as const : "WITHHELD" as const;
  const admittedOccurrenceRefs = status === "ADMITTED"
    ? occurrences.filter((occurrence) => occurrence.printedAmount!.amountMinor > 0).map((occurrence) => occurrence.id) : [];
  const zeroDollarOccurrenceRefs = occurrences
    .filter((occurrence) => occurrence.printedAmount?.amountMinor === 0).map((occurrence) => occurrence.id);
  const decisions = occurrences.map((occurrence): FiservClaimScopedFeeRoundingDecisionV1 => {
    const amountMinor = occurrence.printedAmount?.amountMinor ?? null;
    if (status === "ADMITTED" && amountMinor === 0) return {
      occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, amountMinor,
      printedDirection: occurrence.printedDirection, decision: "PRESERVED_ZERO_NONADDITIVE",
      reasonCodes: ["zero_dollar_row_preserved_without_additive_charge"],
    };
    if (status === "ADMITTED") return {
      occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, amountMinor,
      printedDirection: occurrence.printedDirection, decision: "ADMITTED_ADDITIVE_CHARGE",
      reasonCodes: ["bounded_rounding_fee_occurrence_admitted_without_row_mutation"],
    };
    return {
      occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, amountMinor,
      printedDirection: occurrence.printedDirection, decision: "WITHHELD", reasonCodes: globalReasons,
    };
  });

  return deepFreeze({
    schemaVersion: FISERV_CLAIM_SCOPED_FEE_ROUNDING_RESIDUAL_V1,
    policyVersion: FISERV_BOUNDED_FEE_ROUNDING_POLICY_V1,
    authority: "rd_only_claim_scoped_bounded_fee_rounding",
    processorScope: "supported_fiserv_family_native_text",
    status,
    sourceDocumentRef: foundation.identity.sourceDocumentRef,
    sourceFingerprint: foundation.identity.sourceFingerprint,
    statementPeriod: period,
    sourceBinding: {
      pdfSource, extractableNativeText, completeSuppliedDocument, sourceFingerprintMatched,
      supportedFiservFamily, familyBasis, statementPeriodProven, occurrenceEvidenceComplete,
    },
    control: {
      controlId: roundingControl?.id ?? null,
      controlResult: roundingControl ? "pass_with_rounding" : null,
      toleranceBasis: roundingControl?.toleranceBasis ?? null,
      declaredToleranceMinor,
      maximumAcceptedAbsoluteResidualMinor: FISERV_BOUNDED_FEE_ROUNDING_MAX_ABSOLUTE_MINOR,
      authoritativeFeeTotalOccurrenceRef: feeTotalOccurrence?.id ?? null,
      authoritativeFeeTotalEvidenceRef: feeTotalOccurrence?.evidenceRef ?? null,
      printedStatementFeeTotalMinor,
      admittedFeeOccurrenceSumMinor,
      signedResidualMinor,
      absoluteResidualMinor,
      reconciliationState: status === "ADMITTED" ? "accepted_bounded_rounding_nonadditive" : "not_admitted",
      normalizedFeeRowCount: occurrences.length,
      normalizedNonzeroFeeRowCount: occurrences.filter((occurrence) => occurrence.printedAmount?.amountMinor !== 0).length,
      normalizedZeroDollarRowCount: zeroDollarOccurrenceRefs.length,
      duplicateOrRepeatRepresentationExcluded: normalizedRowsAreDetailOnly,
      principalOrAdjustmentRequiredForReconciliation: false,
      individualPrintedAmountsModified: false,
      residualCreatesAdditiveOccurrence: false,
      reasonCode: status === "ADMITTED" ? "bounded_rounding_reconciles_complete_fee_population" : "bounded_rounding_not_proven",
    },
    admittedOccurrenceRefs,
    zeroDollarOccurrenceRefs,
    decisions,
    proofEvidenceRefs: status === "ADMITTED" ? unique([
      ...occurrences.map((occurrence) => occurrence.evidenceRef),
      ...periodOccurrences.map((occurrence) => occurrence.evidenceRef),
      ...(roundingControl?.evidenceRefs ?? []),
      feeTotalOccurrence?.evidenceRef ?? "",
    ]) : [],
    reasonCodes: status === "ADMITTED"
      ? ["bounded_rounding_fee_population_admitted_with_nonadditive_residual"] : globalReasons,
    safety: {
      rdSoleAdditiveLedger: true,
      roundingResidualAdditive: false,
      commercialDecompositionAdditiveAuthority: false,
      rowMutationAllowed: false,
      residualAllocationAllowed: false,
      feeCreditAdmissionAllowed: false,
      principalOrAdjustmentFeeAdmissionAllowed: false,
      summaryOrRepeatAdmissionAllowed: false,
      participantOrCategoryAssignmentAllowedForResidual: false,
      comparisonOrSavingsUseAllowed: false,
      canonicalMutationAllowed: false,
      customerRoutingAllowed: false,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
    },
    limitations: [
      "The two-minor-unit cap is a Product-scoped maximum layered on top of a bound pass_with_rounding control; it is not a general close-enough tolerance.",
      "The signed residual is reconciliation metadata only and is never a fee, credit, additive occurrence, category, participant amount, comparison input, or savings input.",
      "Every admitted RD charge retains its source occurrence identity, printed amount, printed direction, and evidence.",
      "Principal, adjustments, repeat representations, row mutation, residual allocation, and commercial-decomposition closure remain prohibited.",
    ],
  });
}

function validStatementPeriod(value: CanonicalEconomicsV2Foundation["identity"]["statementPeriod"]): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.start) || !/^\d{4}-\d{2}-\d{2}$/.test(value.end)) return false;
  return value.start <= value.end;
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function records(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, any> => Boolean(item) && typeof item === "object") : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
