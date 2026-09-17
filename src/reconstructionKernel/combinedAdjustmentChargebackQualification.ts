import { createHash } from "node:crypto";

import { canonicalJson } from "../canonical/v2/canonicalJson.js";
import {
  evaluateRbAdjustmentChargebackRepresentationPolicy,
  type RbAdjustmentChargebackRepresentationEvaluation,
} from "../canonical/v2/adjustmentChargebackRepresentationPolicy.js";
import { RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS } from "../canonical/v2/kernelAuthorityContract.js";
import {
  type CanonicalEconomicsV2Foundation,
  type CanonicalEconomicsV2ProcessorPresentedCategoryRepresentation,
} from "../canonical/v2/types.js";
import type { ParsedDocument } from "../parser.js";
import { kernelParsedDocumentFingerprint } from "./canonicalRbLimitedAuthority.js";
import {
  assessStatementCompleteness,
  type StatementCompletenessAssessment,
} from "./statementCompleteness.js";

export const COMBINED_ADJUSTMENT_CHARGEBACK_QUALIFICATION_SCHEMA =
  "combined_adjustment_chargeback_shadow_qualification_v3" as const;

const POPULATION_KEY = "unresolvedAdjustmentChargebackAmount" as const;
export type CombinedAdjustmentChargebackQualificationResult = {
  schemaVersion: typeof COMBINED_ADJUSTMENT_CHARGEBACK_QUALIFICATION_SCHEMA;
  authority: "shadow_qualification_no_canonical_authority";
  executionBoundary: "evaluation_only_post_rb_diagnostic";
  productionUse: "prohibited";
  canonicalMutation: "none";
  dependencyPropagation: "prohibited";
  providerAuthority: "prohibited";
  currentAuthorityScope: typeof RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS;
  categoryIdentity: "adjustments_chargebacks";
  processorPresentedLabel: "Adjustments/Chargebacks";
  status: "qualified" | "withheld" | "failed";
  sourceBinding: {
    sourceDocumentRef: string;
    sourceFingerprint: string | null;
    fingerprintMatched: boolean;
    completeSuppliedDocument: boolean;
    admittedFiservFamily: boolean;
    directCombinedFieldObserved: boolean;
    combinedLabelOccurrenceCount: number;
    representationRef: string | null;
    categoryControlRef: string | null;
    processorStatementCompleteness: CanonicalEconomicsV2Foundation["documentIntegrity"]["completenessStatus"];
    missingPageNumbers: number[];
  };
  statementCompleteness: StatementCompletenessAssessment;
  candidate: {
    representationRef: string;
    categoryControlRef: string;
    value: { amountMinor: number; currency: "USD" };
    meaning: "processor_presented_combined_adjustments_chargebacks";
    support: "first_class_processor_presented_category_with_passing_claim_control";
    sourceProvenance: CanonicalEconomicsV2ProcessorPresentedCategoryRepresentation["sourceProvenance"];
    prohibitedInterpretations: readonly [
      "settlement_adjustment",
      "chargeback_principal",
      "chargeback_representment",
      "reversal",
      "chargeback_fee",
      "lifecycle_conclusion",
      "net_funded_authority",
    ];
  } | null;
  rbComparison: {
    rbStatus: CanonicalEconomicsV2Foundation["financialPopulations"][typeof POPULATION_KEY]["status"];
    rbValueMinor: number | null;
    disposition: "candidate_matches_rb" | "candidate_would_fill_withheld_rb" | "candidate_contradicts_rb" | "no_candidate";
    selectedSplitPopulationKeys: string[];
  };
  representationPolicy: RbAdjustmentChargebackRepresentationEvaluation;
  futureAuthorityAssessment: {
    status: "eligible_for_product_review" | "withheld";
    grantsAuthority: false;
    reasonCodes: string[];
  };
  exclusionConditions: Array<{ conditionId: string; state: "satisfied" | "failed"; reason: string }>;
  futureAuthorityBlockers: string[];
  reasonCodes: string[];
  qualificationHash: string | null;
  errors: string[];
};

export function qualifyCombinedAdjustmentChargebackAmount(input: {
  document: ParsedDocument;
  sourceDocumentRef: string;
  foundation: CanonicalEconomicsV2Foundation;
  executionContext: "evaluation_compatibility";
}): CombinedAdjustmentChargebackQualificationResult {
  try {
    if ((input as { executionContext?: string }).executionContext !== "evaluation_compatibility") {
      throw new Error("COMBINED_ADJUSTMENT_CHARGEBACK_QUALIFICATION_REQUIRES_EVALUATION_CONTEXT");
    }
    const representation = input.foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks") ?? null;
    const categoryControl = input.foundation.sourceModel.processorPresentedCategoryControls.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks"
      && item.representationRef === representation?.id) ?? null;
    const sourceFingerprint = kernelParsedDocumentFingerprint(input.document);
    const completeSuppliedDocument = completeDocument(input.foundation);
    const statementCompleteness = assessStatementCompleteness({
      document: input.document,
      foundation: input.foundation,
      sourceDocumentRef: input.sourceDocumentRef,
    });
    const fingerprintMatched = input.foundation.identity.sourceFingerprintStatus === "available"
      && input.foundation.identity.sourceFingerprint === sourceFingerprint
      && input.foundation.identity.sourceDocumentRef === input.sourceDocumentRef
      && representation?.sourceProvenance.sourceFingerprint === sourceFingerprint
      && representation.sourceProvenance.documentRef === input.sourceDocumentRef;
    const admittedFiservFamily = input.foundation.templateCapability.admissionStatus === "admitted"
      && input.foundation.templateCapability.identityStatus === "proven"
      && input.foundation.templateCapability.admissionAuthority !== null;
    const combinedLabelOccurrenceCount = categoryControl?.inputs.headingCount ?? 0;
    const categoryControlLinked = representation !== null && categoryControl !== null
      && representation.controlRefs.length === 1
      && representation.controlRefs[0] === categoryControl.id
      && representation.contributionPermission === "prohibited_observation_only"
      && categoryControl.authorityEffect === "none_observation_only";
    const directCombinedFieldObserved = representation?.categoryIdentity === "adjustments_chargebacks"
      && representation.processorPresentedLabel === "Adjustments/Chargebacks"
      && representation.preservedMeaning === "processor_presented_combined_adjustments_chargebacks"
      && representation.observationStatus === "observed"
      && Number.isSafeInteger(representation.observedAmount?.amountMinor)
      && representation.sourceProvenance.occurrenceRefs.length > 0
      && representation.sourceProvenance.evidenceRefs.length > 0
      && combinedLabelOccurrenceCount === 1;
    const rbFact = input.foundation.financialPopulations[POPULATION_KEY];
    const rbValueMinor = rbFact.status === "available" && rbFact.value ? rbFact.value.amountMinor : null;
    const candidateValue = directCombinedFieldObserved ? representation.observedAmount!.amountMinor : null;
    const representationPolicy = evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: input.foundation.financialPopulations,
      processorPresentedCategory: representation,
    });
    const exclusionConditions: CombinedAdjustmentChargebackQualificationResult["exclusionConditions"] = [
      condition("combined_semantics_remain_unresolved",
        representation?.preservedMeaning === "processor_presented_combined_adjustments_chargebacks",
        "The candidate retains the processor-presented combined category without subtype interpretation."),
      condition("split_adjustment_authority_prohibited", true,
        "This shadow candidate grants no split settlement-adjustment fact; future authority must mutually exclude any selected split fact."),
      condition("split_chargeback_authority_prohibited", true,
        "This shadow candidate grants no chargeback principal or representment fact; future authority must mutually exclude any selected split fact."),
      condition("net_funded_authority_prohibited", true,
        "The funding formula is corroboration only and cannot authorize net funded amount."),
      condition("downstream_economics_prohibited", true,
        "The qualification artifact is excluded from calculations and downstream stages."),
      condition("current_five_fact_authority_scope_unchanged",
        RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS.length === 5 && !RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS.includes(POPULATION_KEY as never),
        "The candidate is not present in the Product-approved authority allowlist."),
      condition("complete_supplied_source_scope_required", completeSuppliedDocument && fingerprintMatched,
        "Qualification requires the complete fingerprint-bound supplied document."),
      condition("claim_specific_category_control_required", categoryControlLinked && categoryControl?.status === "pass",
        "Qualification requires the representation's own linked passing claim-specific control."),
    ];
    const reasons = unique([
      ...(input.document.sourceType === "pdf" && input.document.extraction.mode !== "unusable"
        && input.document.extraction.hasExtractableText ? [] : ["qualification_requires_extractable_pdf_source"]),
      ...(input.foundation.validation.status === "valid" ? [] : ["rb_foundation_invalid"]),
      ...(fingerprintMatched ? [] : ["source_fingerprint_or_reference_mismatch"]),
      ...(completeSuppliedDocument ? [] : ["supplied_document_integrity_not_complete"]),
      ...(admittedFiservFamily ? [] : ["fiserv_family_not_admitted"]),
      ...(directCombinedFieldObserved ? [] : ["explicit_combined_adjustments_chargebacks_field_not_observed"]),
      ...(combinedLabelOccurrenceCount === 1 ? [] : ["combined_adjustments_chargebacks_source_scope_is_ambiguous"]),
      ...(categoryControlLinked ? [] : ["processor_presented_category_control_missing_or_unlinked"]),
      ...(categoryControl?.status === "pass" ? [] : ["processor_presented_category_control_not_passing"]),
      ...exclusionConditions.filter((item) => item.state === "failed").map((item) =>
        `exclusion_condition_failed:${item.conditionId}`),
      ...(rbValueMinor !== null && candidateValue !== null && rbValueMinor !== candidateValue
        ? ["rb_kernel_value_contradiction"] : []),
    ]);
    const qualified = reasons.length === 0 && candidateValue !== null && representation !== null
      && categoryControl !== null;
    const futureAuthorityBlockers = unique(qualified ? [
      ...(statementCompleteness.statementCompleteness.status === "proven_complete" ? []
        : statementCompleteness.statementCompleteness.status === "proven_incomplete"
          ? ["processor_statement_proven_incomplete"] : ["processor_statement_completeness_unproven"]),
      ...(statementCompleteness.statementCompleteness.missingStatementPageNumbers.length === 0
        ? [] : ["processor_statement_has_missing_pages"]),
      ...(representationPolicy.authorityEligible ? [] : representationPolicy.valueRelationship === "contradicts"
        ? ["combined_split_value_contradiction"] : ["combined_contribution_authority_withheld_while_split_facts_selected"]),
      "nonzero_third_party_transaction_source_evidence_not_in_current_corpus",
    ] : ["source_candidate_not_qualified"]);
    const candidate = qualified ? {
      representationRef: representation!.id,
      categoryControlRef: categoryControl!.id,
      value: { amountMinor: candidateValue, currency: "USD" as const },
      meaning: "processor_presented_combined_adjustments_chargebacks" as const,
      support: "first_class_processor_presented_category_with_passing_claim_control" as const,
      sourceProvenance: {
        ...representation!.sourceProvenance,
        occurrenceRefs: [...representation!.sourceProvenance.occurrenceRefs],
        evidenceRefs: [...representation!.sourceProvenance.evidenceRefs],
      },
      prohibitedInterpretations: [
        "settlement_adjustment",
        "chargeback_principal",
        "chargeback_representment",
        "reversal",
        "chargeback_fee",
        "lifecycle_conclusion",
        "net_funded_authority",
      ] as const,
    } : null;
    const resultWithoutHash = {
      schemaVersion: COMBINED_ADJUSTMENT_CHARGEBACK_QUALIFICATION_SCHEMA,
      authority: "shadow_qualification_no_canonical_authority" as const,
      executionBoundary: "evaluation_only_post_rb_diagnostic" as const,
      productionUse: "prohibited" as const,
      canonicalMutation: "none" as const,
      dependencyPropagation: "prohibited" as const,
      providerAuthority: "prohibited" as const,
      currentAuthorityScope: RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS,
      categoryIdentity: "adjustments_chargebacks" as const,
      processorPresentedLabel: "Adjustments/Chargebacks" as const,
      status: qualified ? "qualified" as const : "withheld" as const,
      sourceBinding: { sourceDocumentRef: input.sourceDocumentRef, sourceFingerprint, fingerprintMatched,
        completeSuppliedDocument, admittedFiservFamily, directCombinedFieldObserved, combinedLabelOccurrenceCount,
        representationRef: representation?.id ?? null, categoryControlRef: categoryControl?.id ?? null,
        processorStatementCompleteness: input.foundation.documentIntegrity.completenessStatus,
        missingPageNumbers: [...input.foundation.documentIntegrity.missingPageNumbers] },
      statementCompleteness,
      candidate,
      rbComparison: {
        rbStatus: rbFact.status,
        rbValueMinor,
        disposition: candidateValue === null ? "no_candidate" as const
          : rbValueMinor === null ? "candidate_would_fill_withheld_rb" as const
            : rbValueMinor === candidateValue ? "candidate_matches_rb" as const : "candidate_contradicts_rb" as const,
        selectedSplitPopulationKeys: [...representationPolicy.selectedSplitPopulationKeys],
      },
      representationPolicy,
      futureAuthorityAssessment: {
        status: futureAuthorityBlockers.length === 0 ? "eligible_for_product_review" as const : "withheld" as const,
        grantsAuthority: false as const,
        reasonCodes: futureAuthorityBlockers,
      },
      exclusionConditions,
      futureAuthorityBlockers,
      reasonCodes: qualified ? [
        "first_class_processor_presented_category_source_bound",
        "processor_presented_meaning_preserved_without_subtype_inference",
        "claim_specific_category_control_passes",
        "all_exclusion_conditions_satisfied",
      ] : reasons,
      errors: [],
    };
    const qualificationHash = createHash("sha256").update(canonicalJson(resultWithoutHash)).digest("hex");
    return { ...resultWithoutHash, qualificationHash };
  } catch (error) {
    return failedQualification(input, error);
  }
}

function completeDocument(foundation: CanonicalEconomicsV2Foundation): boolean {
  const integrity = foundation.documentIntegrity;
  return integrity.suppliedDocumentStatus === "complete_supplied_document"
    && integrity.observedPageCount !== null && integrity.processedPageCount === integrity.observedPageCount
    && integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete === true
    && integrity.localIngestionTruncated === false;
}

function condition(conditionId: string, passed: boolean, reason: string) {
  return { conditionId, state: passed ? "satisfied" as const : "failed" as const, reason };
}

function failedQualification(input: { sourceDocumentRef: string; foundation: CanonicalEconomicsV2Foundation;
  document: ParsedDocument }, error: unknown):
CombinedAdjustmentChargebackQualificationResult {
  return {
    schemaVersion: COMBINED_ADJUSTMENT_CHARGEBACK_QUALIFICATION_SCHEMA,
    authority: "shadow_qualification_no_canonical_authority",
    executionBoundary: "evaluation_only_post_rb_diagnostic",
    productionUse: "prohibited",
    canonicalMutation: "none",
    dependencyPropagation: "prohibited",
    providerAuthority: "prohibited",
    currentAuthorityScope: RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS,
    categoryIdentity: "adjustments_chargebacks",
    processorPresentedLabel: "Adjustments/Chargebacks",
    status: "failed",
    sourceBinding: { sourceDocumentRef: input.sourceDocumentRef,
      sourceFingerprint: input.foundation.identity.sourceFingerprint, fingerprintMatched: false,
      completeSuppliedDocument: false, admittedFiservFamily: false, directCombinedFieldObserved: false,
      combinedLabelOccurrenceCount: 0, representationRef: null, categoryControlRef: null,
      processorStatementCompleteness: input.foundation.documentIntegrity.completenessStatus,
      missingPageNumbers: [...input.foundation.documentIntegrity.missingPageNumbers] },
    statementCompleteness: assessStatementCompleteness({
      document: input.document,
      foundation: input.foundation,
      sourceDocumentRef: input.sourceDocumentRef,
    }),
    candidate: null,
    rbComparison: { rbStatus: input.foundation.financialPopulations[POPULATION_KEY].status,
      rbValueMinor: null, disposition: "no_candidate", selectedSplitPopulationKeys: [] },
    representationPolicy: evaluateRbAdjustmentChargebackRepresentationPolicy({
      populations: input.foundation.financialPopulations,
      processorPresentedCategory: input.foundation.sourceModel.processorPresentedCategories.find((item) =>
        item.categoryIdentity === "adjustments_chargebacks") ?? null,
    }),
    futureAuthorityAssessment: { status: "withheld", grantsAuthority: false,
      reasonCodes: ["qualification_failed_closed"] },
    exclusionConditions: [], futureAuthorityBlockers: [], reasonCodes: [], qualificationHash: null,
    errors: [`Combined adjustment/chargeback qualification failed closed: ${
      error instanceof Error ? error.message : "unknown_error"}`],
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
