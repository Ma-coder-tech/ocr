import { documentIrFromPdfjsParsedDocument } from "../../documentIrFromPdfjs.js";
import { assessFiservFirstDataFamily, attachFiservDocumentSections } from "../../fiservDocumentSections.js";
import { extractFiservTopLevelFinancialsFromDocumentIr } from "../../fiservTopLevelFromDocumentIr.js";
import type { ParsedDocument } from "../../parser.js";
import { kernelParsedDocumentFingerprint } from "../../reconstructionKernel/canonicalRbLimitedAuthority.js";
import { fiservFeeLedgerOccurrences } from "./fiservAdapter.js";
import type { FiservRuntimeCapabilityProof } from "./fiservRuntimeCapabilityAdmission.js";
import type { CanonicalEconomicsV2Foundation, CanonicalEconomicsV2SourceOccurrence } from "./types.js";

export const FISERV_CLAIM_SCOPED_FEE_OCCURRENCE_ADMISSION_V1 =
  "fiserv_claim_scoped_fee_occurrence_admission_2026_09_12_v1" as const;

export type FiservClaimScopedFeeOccurrenceDecisionV1 = {
  occurrenceRef: string;
  evidenceRef: string;
  amountMinor: number | null;
  printedDirection: CanonicalEconomicsV2SourceOccurrence["printedDirection"];
  decision: "ADMITTED_ADDITIVE_CHARGE" | "PRESERVED_ZERO_NONADDITIVE" | "WITHHELD";
  reasonCodes: string[];
};

export type FiservClaimScopedFeeOccurrenceAdmissionV1 = {
  schemaVersion: typeof FISERV_CLAIM_SCOPED_FEE_OCCURRENCE_ADMISSION_V1;
  authority: "rd_only_claim_scoped_statement_fee_occurrences";
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
  };
  control: {
    controlId: string | null;
    result: "pass" | "not_exact" | "missing";
    authoritativeFeeTotalOccurrenceRef: string | null;
    authoritativeFeeTotalEvidenceRef: string | null;
    authoritativeFeeTotalMinor: number | null;
    normalizedFeeRowCount: number;
    normalizedNonzeroFeeRowCount: number;
    normalizedZeroDollarRowCount: number;
    normalizedFeeTotalMinor: number | null;
    exactIntegerMinorUnitReconciliation: boolean;
    duplicateOrRepeatRepresentationExcluded: boolean;
    principalOrAdjustmentRequiredForReconciliation: false;
  };
  admittedOccurrenceRefs: string[];
  zeroDollarOccurrenceRefs: string[];
  decisions: FiservClaimScopedFeeOccurrenceDecisionV1[];
  proofEvidenceRefs: string[];
  reasonCodes: string[];
  safety: {
    rdSoleAdditiveLedger: true;
    commercialDecompositionAdditiveAuthority: false;
    roundingAdmissionAllowed: false;
    residualAllocationAllowed: false;
    feeCreditAdmissionAllowed: false;
    principalOrAdjustmentFeeAdmissionAllowed: false;
    summaryOrRepeatAdmissionAllowed: false;
    economicCategoryRequired: false;
    participantOrControlInferenceAllowed: false;
    canonicalMutationAllowed: false;
    customerRoutingAllowed: false;
    aiOrWebOperationCount: 0;
    newKnowledgeAdmissionCount: 0;
  };
  limitations: string[];
};

export function fiservClaimScopedFeeAdmissionMatchesFoundationV1(
  admission: FiservClaimScopedFeeOccurrenceAdmissionV1,
  foundation: CanonicalEconomicsV2Foundation,
): boolean {
  return admission.sourceDocumentRef === foundation.identity.sourceDocumentRef &&
    foundation.identity.sourceFingerprintStatus === "available" &&
    admission.sourceFingerprint === foundation.identity.sourceFingerprint;
}

export function fiservClaimScopedFeeBoundSourceDigestV1(
  admission: FiservClaimScopedFeeOccurrenceAdmissionV1,
): string | null {
  return admission.sourceFingerprint;
}

export function fiservClaimScopedFeeControlIdentityMatchesFoundationV1(
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

export function resolveFiservClaimScopedFeeOccurrenceAdmissionV1(input: {
  document: ParsedDocument;
  parserOutput: unknown;
  foundation: CanonicalEconomicsV2Foundation;
  capabilityProof: FiservRuntimeCapabilityProof;
}): FiservClaimScopedFeeOccurrenceAdmissionV1 {
  const output = record(input.parserOutput);
  const feeRows = records(record(output.feeLedger).rows);
  const foundation = input.foundation;
  const occurrences = fiservFeeLedgerOccurrences(foundation);
  const sourceFingerprint = kernelParsedDocumentFingerprint(input.document);
  const sourceFingerprintMatched = foundation.identity.sourceFingerprintStatus === "available"
    && foundation.identity.sourceFingerprint === sourceFingerprint;
  const integrity = foundation.documentIntegrity;
  const completeSuppliedDocument = integrity.suppliedDocumentStatus === "complete_supplied_document"
    && integrity.observedPageCount !== null && integrity.processedPageCount === integrity.observedPageCount
    && integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete === true
    && integrity.localIngestionTruncated === false;
  const pdfSource = input.document.sourceType === "pdf";
  const extractableNativeText = input.document.extraction.mode !== "unusable" && input.document.extraction.hasExtractableText;
  const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(input.document, {
    id: foundation.identity.sourceDocumentRef,
  }));
  const family = assessFiservFirstDataFamily(ir);
  let topLevel: ReturnType<typeof extractFiservTopLevelFinancialsFromDocumentIr> | null = null;
  try { topLevel = extractFiservTopLevelFinancialsFromDocumentIr(ir); } catch { /* fail closed below */ }
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
  const allAmountsKnown = occurrences.every((occurrence) => occurrence.printedAmount !== null
    && Number.isSafeInteger(occurrence.printedAmount.amountMinor));
  const allDirectionsKnown = occurrences.every((occurrence) => occurrence.printedDirection !== "unknown");
  const allNonzeroRowsAreAdditiveFees = occurrences.every((occurrence) => occurrence.printedAmount?.amountMinor === 0 || (
    occurrence.semanticRole === "fee_charge" && occurrence.printedAmount !== null && occurrence.printedAmount.amountMinor > 0
      && ["positive", "unsigned"].includes(occurrence.printedDirection)
  ));
  const normalizedFeeTotalMinor = allAmountsKnown
    ? occurrences.reduce((sum, occurrence) => sum + occurrence.printedAmount!.amountMinor, 0) : null;

  const occurrenceById = new Map(foundation.sourceModel.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const exactControlCandidates = input.capabilityProof.reconciliationControlCandidates.filter((control) =>
    control.bindingState === "bound" && control.semanticPurpose === "complete_fee_occurrence_population"
      && control.result === "pass" && control.authoritativeTotalOccurrenceRef !== null
      && sameRefs(control.operandOccurrenceRefs, occurrenceIds),
  );
  const exactControl = exactControlCandidates.length === 1 ? exactControlCandidates[0]! : null;
  const feeTotalOccurrence = exactControl?.authoritativeTotalOccurrenceRef
    ? occurrenceById.get(exactControl.authoritativeTotalOccurrenceRef) ?? null : null;
  const authoritativeFeeTotalMinor = feeTotalOccurrence?.printedAmount?.amountMinor ?? null;
  const exactIntegerMinorUnitReconciliation = normalizedFeeTotalMinor !== null && authoritativeFeeTotalMinor !== null
    && normalizedFeeTotalMinor === authoritativeFeeTotalMinor;

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
    ...(exactControl ? [] : ["exact_fee_population_control_not_proven"]),
    ...(exactIntegerMinorUnitReconciliation ? [] : ["fee_population_not_exact_in_integer_minor_units"]),
  ]);
  const status = globalReasons.length === 0 ? "ADMITTED" as const : "WITHHELD" as const;
  const admittedOccurrenceRefs = status === "ADMITTED"
    ? occurrences.filter((occurrence) => occurrence.printedAmount!.amountMinor > 0).map((occurrence) => occurrence.id) : [];
  const zeroDollarOccurrenceRefs = occurrences
    .filter((occurrence) => occurrence.printedAmount?.amountMinor === 0).map((occurrence) => occurrence.id);
  const decisions = occurrences.map((occurrence): FiservClaimScopedFeeOccurrenceDecisionV1 => {
    const amountMinor = occurrence.printedAmount?.amountMinor ?? null;
    if (status === "ADMITTED" && amountMinor === 0) return {
      occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, amountMinor,
      printedDirection: occurrence.printedDirection, decision: "PRESERVED_ZERO_NONADDITIVE",
      reasonCodes: ["zero_dollar_row_preserved_without_additive_charge"],
    };
    if (status === "ADMITTED") return {
      occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, amountMinor,
      printedDirection: occurrence.printedDirection, decision: "ADMITTED_ADDITIVE_CHARGE",
      reasonCodes: ["exact_claim_scoped_fee_occurrence_admitted"],
    };
    return {
      occurrenceRef: occurrence.id, evidenceRef: occurrence.evidenceRef, amountMinor,
      printedDirection: occurrence.printedDirection, decision: "WITHHELD", reasonCodes: globalReasons,
    };
  });

  return deepFreeze({
    schemaVersion: FISERV_CLAIM_SCOPED_FEE_OCCURRENCE_ADMISSION_V1,
    authority: "rd_only_claim_scoped_statement_fee_occurrences",
    processorScope: "supported_fiserv_family_native_text",
    status,
    sourceDocumentRef: foundation.identity.sourceDocumentRef,
    sourceFingerprint: foundation.identity.sourceFingerprint,
    statementPeriod: period,
    sourceBinding: {
      pdfSource, extractableNativeText, completeSuppliedDocument, sourceFingerprintMatched,
      supportedFiservFamily, familyBasis, statementPeriodProven,
    },
    control: {
      controlId: exactControl?.id ?? null,
      result: exactControl ? exactIntegerMinorUnitReconciliation ? "pass" : "not_exact" : "missing",
      authoritativeFeeTotalOccurrenceRef: feeTotalOccurrence?.id ?? null,
      authoritativeFeeTotalEvidenceRef: feeTotalOccurrence?.evidenceRef ?? null,
      authoritativeFeeTotalMinor,
      normalizedFeeRowCount: occurrences.length,
      normalizedNonzeroFeeRowCount: occurrences.filter((occurrence) => occurrence.printedAmount?.amountMinor !== 0).length,
      normalizedZeroDollarRowCount: zeroDollarOccurrenceRefs.length,
      normalizedFeeTotalMinor,
      exactIntegerMinorUnitReconciliation,
      duplicateOrRepeatRepresentationExcluded: normalizedRowsAreDetailOnly,
      principalOrAdjustmentRequiredForReconciliation: false,
    },
    admittedOccurrenceRefs,
    zeroDollarOccurrenceRefs,
    decisions,
    proofEvidenceRefs: status === "ADMITTED" ? unique([
      ...occurrences.map((occurrence) => occurrence.evidenceRef),
      ...periodOccurrences.map((occurrence) => occurrence.evidenceRef),
      ...(exactControl?.evidenceRefs ?? []),
      feeTotalOccurrence?.evidenceRef ?? "",
    ]) : [],
    reasonCodes: status === "ADMITTED" ? ["exact_claim_scoped_fee_population_admitted"] : globalReasons,
    safety: {
      rdSoleAdditiveLedger: true,
      commercialDecompositionAdditiveAuthority: false,
      roundingAdmissionAllowed: false,
      residualAllocationAllowed: false,
      feeCreditAdmissionAllowed: false,
      principalOrAdjustmentFeeAdmissionAllowed: false,
      summaryOrRepeatAdmissionAllowed: false,
      economicCategoryRequired: false,
      participantOrControlInferenceAllowed: false,
      canonicalMutationAllowed: false,
      customerRoutingAllowed: false,
      aiOrWebOperationCount: 0,
      newKnowledgeAdmissionCount: 0,
    },
    limitations: unique([
      "Authority is restricted to RD additive identity, printed amount, printed direction, exact fee-population coverage, and statement-period applicability.",
      "Economic category, participant roles, control, actionability, commercial comparison, benchmark position, and savings remain independent.",
      "Commercial decomposition cannot create charges, totals, rows, or reconciliation authority.",
      "Fee credits, rounding residuals, principal, adjustments, and repeated or summary representations are outside this admission package.",
    ]),
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
