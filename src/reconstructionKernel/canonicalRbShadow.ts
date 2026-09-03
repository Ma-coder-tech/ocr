import { createHash } from "node:crypto";

import type {
  CanonicalEconomicsV2FinancialPopulations,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2ProcessorPresentedCategoryIdentity,
} from "../canonical/v2/types.js";
import type { DocumentIR } from "../documentIr.js";
import { documentIrFromPdfjsParsedDocument } from "../documentIrFromPdfjs.js";
import { assessFiservFirstDataFamily, attachFiservDocumentSections } from "../fiservDocumentSections.js";
import {
  extractFiservIndependentAdjustmentChargeback,
  extractFiservIndependentCardSummary,
  extractFiservIndependentFundingBatchPopulation,
  qualifyFiservIndependentSplitPopulations,
  type IndependentDocumentIrValue,
} from "../fiservIndependentPopulationsFromDocumentIr.js";
import {
  extractFiservTopLevelFinancialsFromDocumentIr,
  type DocumentIrFinancialEvidence,
  type FiservDocumentIrTopLevelFinancials,
} from "../fiservTopLevelFromDocumentIr.js";
import type { ParsedDocument } from "../parser.js";
import { reconstructStatement } from "./kernel.js";
import type {
  Claim, ControlState, DeterministicControl, EvidenceNeed, Hypothesis, Observation,
  ReconstructionInput, ReconstructionResult,
} from "./types.js";

export const CANONICAL_RB_RECONSTRUCTION_SHADOW_SCHEMA = "canonical-rb-reconstruction-shadow-v3" as const;

type FinancialPopulationKey = keyof CanonicalEconomicsV2FinancialPopulations;
type FactShape = CanonicalEconomicsV2FinancialPopulations[FinancialPopulationKey];

export type ClaimReconciliationClass =
  | "direct_source_fact"
  | "direct_source_with_corroboration"
  | "funding_equation_result"
  | "section_total_derivation"
  | "batch_row_population"
  | "independent_extractor_not_implemented";
export type ClaimReconciliationOutcome = "passing" | "warning" | "failed" | "unresolved";
export type ClaimReconciliationTreatment =
  | "preserve_direct_source_fact"
  | "admit_deterministic_derivation"
  | "withhold_pending_proof"
  | "reject_claim";
export type ClaimReconciliationPolicy = {
  claimClass: ClaimReconciliationClass;
  reconciliationDependency: "none" | "card_summary_formula" | "funding_formula" | "adjustment_section_total"
    | "chargeback_section_total" | "funding_batch_population" | "future_claim_specific_control";
  passing: ClaimReconciliationTreatment;
  warning: ClaimReconciliationTreatment;
  failed: ClaimReconciliationTreatment;
  unresolved: ClaimReconciliationTreatment;
};

const DIRECT_SOURCE_POLICY: ClaimReconciliationPolicy = {
  claimClass: "direct_source_fact", reconciliationDependency: "none",
  passing: "preserve_direct_source_fact", warning: "withhold_pending_proof",
  failed: "reject_claim", unresolved: "withhold_pending_proof",
};
const FUNDING_RESULT_POLICY: ClaimReconciliationPolicy = {
  claimClass: "funding_equation_result", reconciliationDependency: "funding_formula",
  passing: "admit_deterministic_derivation", warning: "withhold_pending_proof",
  failed: "reject_claim", unresolved: "withhold_pending_proof",
};
const CORROBORATED_SOURCE_POLICY: ClaimReconciliationPolicy = {
  claimClass: "direct_source_with_corroboration", reconciliationDependency: "card_summary_formula",
  passing: "preserve_direct_source_fact", warning: "preserve_direct_source_fact",
  failed: "preserve_direct_source_fact", unresolved: "preserve_direct_source_fact",
};
const ADJUSTMENT_SECTION_POLICY: ClaimReconciliationPolicy = {
  claimClass: "section_total_derivation", reconciliationDependency: "adjustment_section_total",
  passing: "admit_deterministic_derivation", warning: "withhold_pending_proof",
  failed: "reject_claim", unresolved: "withhold_pending_proof",
};
const CHARGEBACK_SECTION_POLICY: ClaimReconciliationPolicy = {
  claimClass: "section_total_derivation", reconciliationDependency: "chargeback_section_total",
  passing: "admit_deterministic_derivation", warning: "withhold_pending_proof",
  failed: "reject_claim", unresolved: "withhold_pending_proof",
};
const FUNDING_BATCH_POLICY: ClaimReconciliationPolicy = {
  claimClass: "batch_row_population", reconciliationDependency: "funding_batch_population",
  passing: "admit_deterministic_derivation", warning: "admit_deterministic_derivation",
  failed: "reject_claim", unresolved: "withhold_pending_proof",
};
const FUTURE_CONTROL_POLICY: ClaimReconciliationPolicy = {
  claimClass: "independent_extractor_not_implemented", reconciliationDependency: "future_claim_specific_control",
  passing: "withhold_pending_proof", warning: "withhold_pending_proof",
  failed: "withhold_pending_proof", unresolved: "withhold_pending_proof",
};

/** Failed funding math rejects only the derived funding result, not its independently printed inputs. */
export const CLAIM_RECONCILIATION_POLICY: Record<FinancialPopulationKey, ClaimReconciliationPolicy> = {
  grossSaleVolume: CORROBORATED_SOURCE_POLICY,
  refundVolume: CORROBORATED_SOURCE_POLICY,
  canonicalNetSubmittedCardVolume: DIRECT_SOURCE_POLICY,
  thirdPartyTransactionVolume: DIRECT_SOURCE_POLICY,
  totalStatementProcessingFees: DIRECT_SOURCE_POLICY,
  feeCreditAmount: FUTURE_CONTROL_POLICY,
  settlementAdjustmentAmount: ADJUSTMENT_SECTION_POLICY,
  chargebackPrincipalDebitAmount: CHARGEBACK_SECTION_POLICY,
  chargebackRepresentmentAmount: CHARGEBACK_SECTION_POLICY,
  chargebackFeeAmount: FUTURE_CONTROL_POLICY,
  netFundedAmount: FUNDING_RESULT_POLICY,
  unresolvedAdjustmentChargebackAmount: DIRECT_SOURCE_POLICY,
  grossSaleTransactionCount: DIRECT_SOURCE_POLICY,
  refundTransactionCount: DIRECT_SOURCE_POLICY,
  submittedTransactionCount: DIRECT_SOURCE_POLICY,
  settledTransactionCount: FUTURE_CONTROL_POLICY,
  authorizationCount: FUTURE_CONTROL_POLICY,
  chargebackCount: CHARGEBACK_SECTION_POLICY,
  fundingBatchCount: FUNDING_BATCH_POLICY,
};

export function reconciliationTreatment(
  populationKey: FinancialPopulationKey,
  outcome: ClaimReconciliationOutcome,
): ClaimReconciliationTreatment {
  return CLAIM_RECONCILIATION_POLICY[populationKey][outcome];
}

export type CanonicalRbShadowDisposition =
  | "agree_value" | "agree_withheld" | "kernel_withheld_ambiguity"
  | "kernel_rejected_rb_value" | "kernel_diverged_value" | "kernel_proposed_rb_withheld";
export type CanonicalRbShadowComparison = {
  populationKey: FinancialPopulationKey;
  population: string;
  rbStatus: "available" | "unavailable" | "ambiguous" | "unsupported";
  rbValue: number | null;
  kernelValue: number | null;
  disposition: CanonicalRbShadowDisposition;
  reasonCodes: string[];
};
export type IndependentReconciliationFinding = {
  populationKey: FinancialPopulationKey;
  control: "direct_source_observation" | "card_summary_formula" | "funding_formula"
    | "adjustment_section_total" | "chargeback_section_total" | "funding_batch_population"
    | "future_claim_specific_control";
  outcome: ClaimReconciliationOutcome;
  treatment: ClaimReconciliationTreatment;
  controlState: ControlState | null;
};
export type ProcessorPresentedCategoryBinding = {
  categoryIdentity: CanonicalEconomicsV2ProcessorPresentedCategoryIdentity;
  representationRef: string;
  categoryControlRef: string | null;
  observationRef: string | null;
  claimRef: string | null;
  disposition: "consumed_as_processor_presented_observation" | "withheld_by_category_control";
  reasonCodes: string[];
};
export type CanonicalRbReconstructionShadowResult = {
  schemaVersion: typeof CANONICAL_RB_RECONSTRUCTION_SHADOW_SCHEMA;
  authority: "shadow_non_authoritative";
  pipelineBoundary: "post_rb_diagnostics";
  canonicalMutation: "prohibited";
  downstreamUse: "diagnostics_only";
  providerAuthority: "proposal_only_no_canonical_truth";
  statementId: string;
  status: "compared" | "compared_with_source_limitations" | "kernel_rejected" | "failed";
  inputIndependence: {
    kernelRbSemanticRoleInputs: 0;
    kernelRbContributionRoleInputs: 0;
    kernelRbRepresentationGroupInputs: 0;
    kernelRbReconciliationInputs: 0;
    kernelRbOccurrenceInputs: 0;
    kernelProcessorPresentedCategoryInputs: number;
    kernelProcessorPresentedCategoryControlInputs: number;
    documentIrObservationCount: number;
    sourceModelBoundObservationCount: number;
    totalKernelObservationCount: number;
    independentControlCount: number;
    rbUse: "comparison_plus_validated_source_model_category_binding";
  };
  processorPresentedCategoryBindings: ProcessorPresentedCategoryBinding[];
  sourceEvidence: {
    sourceType: ParsedDocument["sourceType"];
    extractionMode: ParsedDocument["extraction"]["mode"];
    documentIrFingerprint: string;
    documentIrLineCount: number;
    familyAccepted: boolean;
    familyAcceptanceBasis: "family_signal_assessor" | "top_level_structural_cluster" | "not_accepted";
    familyConfidence: number;
    matchedFamilySignals: string[];
    layoutFamily: FiservDocumentIrTopLevelFinancials["layoutFamily"] | null;
    topLevelExtraction: "complete" | "failed";
    independentExtractors: {
      cardSummary: "mapped" | "not_mapped";
      adjustments: "mapped" | "explicit_none" | "not_mapped";
      chargebacks: "mapped" | "explicit_none" | "not_mapped";
      fundingBatches: "mapped" | "mapped_with_warnings" | "not_mapped";
    };
  };
  reconciliationFindings: IndependentReconciliationFinding[];
  reconstruction: ReconstructionResult | null;
  comparisons: CanonicalRbShadowComparison[];
  summary: Record<CanonicalRbShadowDisposition, number>;
  errors: string[];
};
export type CanonicalRbReconstructionShadowInput = {
  document: ParsedDocument;
  sourceDocumentRef: string;
  foundation: CanonicalEconomicsV2Foundation;
};
type IndependentBuild = {
  input: ReconstructionInput;
  sourceEvidence: CanonicalRbReconstructionShadowResult["sourceEvidence"];
  sourceErrors: string[];
};

export function observeCanonicalRbReconstructionShadow(
  source: CanonicalRbReconstructionShadowInput,
): CanonicalRbReconstructionShadowResult {
  const independent = buildIndependentReconstructionInput(source.document, source.sourceDocumentRef);
  const categoryBound = bindProcessorPresentedCategories(independent.input, source.foundation);
  const reconstruction = reconstructStatement(categoryBound.input);
  const canonicalByKey = new Map(reconstruction.canonicalClaims.map((claim) => [claim.key, claim.value]));
  const controlById = new Map(reconstruction.controlResults.map((control) => [control.controlId, control.state]));
  const findings = reconciliationFindings(controlById, canonicalByKey);
  const findingByPopulation = new Map(findings.map((finding) => [finding.populationKey, finding]));
  const comparisons = (Object.entries(source.foundation.financialPopulations) as Array<[FinancialPopulationKey, FactShape]>)
    .map(([populationKey, fact]): CanonicalRbShadowComparison => {
      const rbValue = factValue(fact);
      const kernelClaim = canonicalByKey.get(claimKeyForPopulationKey(populationKey));
      const kernelValue = typeof kernelClaim === "number" ? kernelClaim : null;
      const finding = findingByPopulation.get(populationKey)!;
      let disposition: CanonicalRbShadowDisposition;
      if (fact.status !== "available") disposition = kernelValue === null ? "agree_withheld" : "kernel_proposed_rb_withheld";
      else if (kernelValue === rbValue) disposition = "agree_value";
      else if (kernelValue !== null) disposition = "kernel_diverged_value";
      else if (finding.treatment === "reject_claim") disposition = "kernel_rejected_rb_value";
      else disposition = "kernel_withheld_ambiguity";
      return {
        populationKey, population: fact.population, rbStatus: fact.status, rbValue, kernelValue, disposition,
        reasonCodes: unique([
          fact.status === "available" ? "rb_fact_available_for_comparison_only" : "rb_fact_withheld",
          finding.control === "direct_source_observation" ? "document_ir_direct_source_observation" : "",
          finding.control !== "direct_source_observation" && finding.control !== "future_claim_specific_control"
            ? `independent_${finding.control}_${finding.outcome}` : "",
          finding.control === "future_claim_specific_control" ? "independent_claim_extractor_not_implemented" : "",
          disposition === "agree_value" ? "independent_kernel_value_matches_rb" : "",
          disposition === "agree_withheld" ? "kernel_and_rb_withhold_population" : "",
          disposition === "kernel_withheld_ambiguity" ? "kernel_requires_independent_claim_specific_proof" : "",
          disposition === "kernel_rejected_rb_value" ? "independent_claim_control_rejects_rb_available_value" : "",
          disposition === "kernel_diverged_value" ? "independent_kernel_value_differs_from_rb" : "",
          disposition === "kernel_proposed_rb_withheld" ? "independent_kernel_proposed_value_where_rb_withheld" : "",
        ]),
      };
    });
  return {
    schemaVersion: CANONICAL_RB_RECONSTRUCTION_SHADOW_SCHEMA,
    authority: "shadow_non_authoritative", pipelineBoundary: "post_rb_diagnostics",
    canonicalMutation: "prohibited", downstreamUse: "diagnostics_only",
    providerAuthority: "proposal_only_no_canonical_truth", statementId: categoryBound.input.statementId,
    status: reconstruction.status !== "complete" ? "kernel_rejected"
      : independent.sourceErrors.length > 0 ? "compared_with_source_limitations" : "compared",
    inputIndependence: {
      kernelRbSemanticRoleInputs: 0, kernelRbContributionRoleInputs: 0,
      kernelRbRepresentationGroupInputs: 0, kernelRbReconciliationInputs: 0,
      kernelRbOccurrenceInputs: 0,
      kernelProcessorPresentedCategoryInputs: categoryBound.bindings.length,
      kernelProcessorPresentedCategoryControlInputs: categoryBound.bindings.filter((item) =>
        item.categoryControlRef !== null).length,
      documentIrObservationCount: independent.input.observations.length,
      sourceModelBoundObservationCount: categoryBound.bindings.filter((item) =>
        item.observationRef !== null).length,
      totalKernelObservationCount: categoryBound.input.observations.length,
      independentControlCount: categoryBound.input.controls.length,
      rbUse: "comparison_plus_validated_source_model_category_binding",
    },
    processorPresentedCategoryBindings: categoryBound.bindings,
    sourceEvidence: independent.sourceEvidence, reconciliationFindings: findings, reconstruction, comparisons,
    summary: dispositionSummary(comparisons), errors: [...independent.sourceErrors, ...reconstruction.errors],
  };
}

function bindProcessorPresentedCategories(
  input: ReconstructionInput,
  foundation: CanonicalEconomicsV2Foundation,
): { input: ReconstructionInput; bindings: ProcessorPresentedCategoryBinding[] } {
  const combinedClaimRef = claimKeyForPopulationKey("unresolvedAdjustmentChargebackAmount");
  const observations = [...input.observations];
  const baseClaims = input.baseClaims.filter((claim) => claim.key !== combinedClaimRef);
  const hypotheses = input.hypotheses.filter((hypothesis) =>
    !hypothesis.claims.some((claim) => claim.key === combinedClaimRef));
  const bindings = foundation.sourceModel.processorPresentedCategories.map((representation) => {
    const control = foundation.sourceModel.processorPresentedCategoryControls.find((item) =>
      item.categoryIdentity === representation.categoryIdentity
      && item.representationRef === representation.id) ?? null;
    const sourceBound = representation.sourceProvenance.documentRef === foundation.identity.sourceDocumentRef
      && representation.sourceProvenance.sourceFingerprint === foundation.identity.sourceFingerprint;
    const controlBound = control !== null && representation.controlRefs.length === 1
      && representation.controlRefs[0] === control.id
      && control.authorityEffect === "none_observation_only";
    const consumable = representation.observationStatus === "observed"
      && representation.observedAmount !== null
      && representation.contributionPermission === "prohibited_observation_only"
      && sourceBound && controlBound && control.status === "pass";
    const observationRef = consumable ? `source-model.${representation.id}` : null;
    const claimRef = consumable && representation.categoryIdentity === "adjustments_chargebacks"
      ? combinedClaimRef : null;
    if (observationRef) {
      observations.push({
        id: observationRef,
        kind: "amount",
        value: representation.observedAmount!.amountMinor,
        authority: "source_printed",
        locator: {
          documentId: representation.sourceProvenance.documentRef,
          section: representation.processorPresentedLabel,
          label: representation.preservedMeaning,
        },
      });
    }
    if (claimRef && observationRef) {
      baseClaims.push({ key: claimRef, value: representation.observedAmount!.amountMinor,
        support: "source_observation", observationRefs: [observationRef] });
    }
    return {
      categoryIdentity: representation.categoryIdentity,
      representationRef: representation.id,
      categoryControlRef: control?.id ?? null,
      observationRef,
      claimRef,
      disposition: consumable
        ? "consumed_as_processor_presented_observation" as const
        : "withheld_by_category_control" as const,
      reasonCodes: unique([
        consumable ? "first_class_processor_presented_category_consumed" : "first_class_category_withheld",
        sourceBound ? "category_source_identity_matches_foundation" : "category_source_identity_mismatch",
        controlBound ? "claim_specific_category_control_linked" : "claim_specific_category_control_unlinked",
        control?.status === "pass" ? "claim_specific_category_control_passed"
          : "claim_specific_category_control_not_passing",
        representation.categoryIdentity === "chargebacks_reversals"
          ? "combined_chargebacks_reversals_preserved_without_subtype_claim" : "",
      ]),
    };
  });
  return {
    input: {
      ...input,
      observations: observations.sort((left, right) => left.id.localeCompare(right.id)),
      baseClaims: baseClaims.sort((left, right) => left.key.localeCompare(right.key)),
      hypotheses: hypotheses.sort((left, right) => left.id.localeCompare(right.id)),
    },
    bindings,
  };
}

export function runCanonicalRbReconstructionShadow(source: CanonicalRbReconstructionShadowInput): CanonicalRbReconstructionShadowResult {
  try { return observeCanonicalRbReconstructionShadow(source); }
  catch (error) { return failedResult(source, error); }
}

export function buildCanonicalRbReconstructionInput(document: ParsedDocument, statementId: string): ReconstructionInput {
  return buildIndependentReconstructionInput(document, statementId).input;
}

function buildIndependentReconstructionInput(document: ParsedDocument, statementId: string): IndependentBuild {
  const ir = attachFiservDocumentSections(documentIrFromPdfjsParsedDocument(document, { id: statementId }));
  return buildIndependentReconstructionInputFromIr(
    ir,
    statementId,
    document.sourceType,
    document.extraction.mode,
  );
}

function buildIndependentReconstructionInputFromIr(
  inputIr: DocumentIR,
  statementId: string,
  sourceType: ParsedDocument["sourceType"],
  extractionMode: ParsedDocument["extraction"]["mode"],
): IndependentBuild {
  const ir = attachFiservDocumentSections(inputIr);
  const lines = ir.pages.flatMap((page) => page.lines);
  const family = assessFiservFirstDataFamily(ir);
  const sourceEvidence: IndependentBuild["sourceEvidence"] = {
    sourceType, extractionMode,
    documentIrFingerprint: createHash("sha256").update(JSON.stringify(lines.map((line) => ({
      id: line.id, pageNumber: line.pageNumber, text: line.text,
    })))).digest("hex"),
    documentIrLineCount: lines.length, familyAccepted: family.isLikelyFiservFirstData,
    familyAcceptanceBasis: family.isLikelyFiservFirstData ? "family_signal_assessor" : "not_accepted",
    familyConfidence: family.confidence, matchedFamilySignals: [...family.matchedSignals].sort(),
    layoutFamily: null, topLevelExtraction: "failed",
    independentExtractors: { cardSummary: "not_mapped", adjustments: "not_mapped",
      chargebacks: "not_mapped", fundingBatches: "not_mapped" },
  };
  const empty = (): ReconstructionInput => ({ statementId, observations: [], baseClaims: [], controls: [], hypotheses: [],
    evidenceNeeds: unsupportedEvidenceNeeds() });
  let topLevel: FiservDocumentIrTopLevelFinancials;
  try { topLevel = extractFiservTopLevelFinancialsFromDocumentIr(ir); }
  catch (error) {
    return { input: empty(), sourceEvidence,
      sourceErrors: [`Independent DocumentIR top-level extraction failed: ${error instanceof Error ? error.message : "unknown_error"}`] };
  }
  // The complete top-level label/formula cluster is itself a stronger structural
  // family signal than the broad pre-extraction assessor for older Fiserv layouts.
  sourceEvidence.familyAccepted = true;
  if (!family.isLikelyFiservFirstData) {
    sourceEvidence.familyAcceptanceBasis = "top_level_structural_cluster";
    sourceEvidence.familyConfidence = Math.max(sourceEvidence.familyConfidence, 0.9);
    sourceEvidence.matchedFamilySignals = unique([...sourceEvidence.matchedFamilySignals, "Complete top-level Fiserv structural cluster"]);
  }
  sourceEvidence.layoutFamily = topLevel.layoutFamily;
  sourceEvidence.topLevelExtraction = "complete";

  const cardSummary = extractFiservIndependentCardSummary(ir);
  const adjustmentChargeback = extractFiservIndependentAdjustmentChargeback(ir);
  const fundingBatches = extractFiservIndependentFundingBatchPopulation(ir);
  sourceEvidence.independentExtractors = {
    cardSummary: cardSummary.status,
    adjustments: adjustmentChargeback.adjustments.status,
    chargebacks: adjustmentChargeback.chargebacks.status,
    fundingBatches: fundingBatches.status,
  };

  const observations = new Map<string, Observation>();
  const controls: DeterministicControl[] = [];
  const baseClaims: Claim[] = [];
  const hypotheses: Hypothesis[] = [];
  const evidenceNeeds = unsupportedEvidenceNeeds();
  const evidenceByField = new Map(topLevel.evidence.map((item) => [item.field, item]));

  addDirectSourceClaim({ observations, baseClaims, evidence: requiredEvidence(evidenceByField, "totalVolume"), statementId,
    populationKey: "canonicalNetSubmittedCardVolume", valueMinor: toMinor(topLevel.totalVolume) });
  addDirectSourceClaim({ observations, baseClaims, evidence: requiredEvidence(evidenceByField, "totalFees"), statementId,
    populationKey: "totalStatementProcessingFees", valueMinor: toMinor(topLevel.totalFees) });

  const thirdPartyEvidence = evidenceByField.get("thirdPartyTransactions");
  const thirdPartyRef = addFormulaInput({ observations, evidence: thirdPartyEvidence, statementId,
    field: "thirdPartyTransactions", valueMinor: toMinor(topLevel.thirdPartyTransactions ?? 0),
    inferredZero: !thirdPartyEvidence && topLevel.thirdPartyTransactions === 0 });
  if (thirdPartyEvidence) addClaimForObservation(baseClaims, "thirdPartyTransactionVolume", thirdPartyRef,
    toMinor(topLevel.thirdPartyTransactions ?? 0));

  const adjustmentEvidence = evidenceByField.get("adjustmentsChargebacks");
  let adjustmentRef: string;
  if (adjustmentEvidence) {
    adjustmentRef = addFormulaInput({ observations, evidence: adjustmentEvidence, statementId,
      field: "adjustmentsChargebacks", valueMinor: toMinor(topLevel.adjustmentsChargebacks ?? 0) });
    addClaimForObservation(baseClaims, "unresolvedAdjustmentChargebackAmount", adjustmentRef,
      toMinor(topLevel.adjustmentsChargebacks ?? 0));
  } else {
    const components = [evidenceByField.get("adjustments"), evidenceByField.get("chargebacks")]
      .filter((item): item is DocumentIrFinancialEvidence => item !== undefined);
    const componentRefs = components.map((evidence) => addFormulaInput({ observations, evidence, statementId,
      field: evidence.field, valueMinor: toMinor(evidence.value) }));
    adjustmentRef = "document-ir.top-level.adjustments-chargebacks-derived";
    observations.set(adjustmentRef, {
      id: adjustmentRef, kind: "amount", value: toMinor(topLevel.adjustmentsChargebacks ?? 0),
      authority: "deterministic_extraction",
      locator: { documentId: statementId, section: "summary", label: "combined adjustments and chargebacks" },
      relatedObservationRefs: componentRefs,
    });
    const adjustmentControlId = "document-ir.control.adjustments-chargebacks-sum";
    controls.push({ id: adjustmentControlId, kind: "arithmetic",
      description: "Combine printed adjustment and chargeback inputs without assigning a narrower semantic role.",
      terms: componentRefs.map((observationRef) => ({ observationRef, coefficient: 1 })),
      expectedObservationRef: adjustmentRef, tolerance: 0 });
    hypotheses.push(deterministicHypothesis({ populationKey: "unresolvedAdjustmentChargebackAmount",
      observationRefs: [adjustmentRef, ...componentRefs], value: toMinor(topLevel.adjustmentsChargebacks ?? 0),
      controlId: adjustmentControlId,
      description: "Retain the combined amount without inventing a narrower adjustment or chargeback classification." }));
  }

  const fundedRef = addFormulaInput({ observations, evidence: requiredEvidence(evidenceByField, "amountFunded"), statementId,
    field: "amountFunded", valueMinor: toMinor(topLevel.amountFunded) });
  const fundingControlId = "document-ir.control.funding-formula";
  const formulaRefs = [observationIdForField("totalVolume"), thirdPartyRef, adjustmentRef,
    observationIdForField("totalFees"), fundedRef];
  controls.push({ id: fundingControlId, kind: "arithmetic",
    description: "Reconcile submitted amount minus third-party transactions plus unresolved adjustments/chargebacks minus fees to printed funded amount.",
    terms: [
      { observationRef: formulaRefs[0]!, coefficient: 1 }, { observationRef: formulaRefs[1]!, coefficient: -1 },
      { observationRef: formulaRefs[2]!, coefficient: 1 }, { observationRef: formulaRefs[3]!, coefficient: -1 },
    ], expectedObservationRef: fundedRef, tolerance: 1 });
  hypotheses.push(deterministicHypothesis({ populationKey: "netFundedAmount", observationRefs: formulaRefs,
    value: toMinor(topLevel.amountFunded), controlId: fundingControlId,
    description: "Admit the printed funded amount as net funded only when the independent funding equation passes." }));

  addCardSummaryPopulations({ statementId, cardSummary, observations, baseClaims, controls });
  addAdjustmentChargebackPopulations({ statementId, result: adjustmentChargeback, observations, controls, hypotheses });
  addFundingBatchPopulation({ statementId, result: fundingBatches, observations, controls, hypotheses });

  return { input: { statementId,
    observations: [...observations.values()].sort((a, b) => a.id.localeCompare(b.id)),
    baseClaims: baseClaims.sort((a, b) => a.key.localeCompare(b.key)),
    controls: controls.sort((a, b) => a.id.localeCompare(b.id)),
    hypotheses: hypotheses.sort((a, b) => a.id.localeCompare(b.id)), evidenceNeeds }, sourceEvidence, sourceErrors: [] };
}

function requiredEvidence(byField: Map<string, DocumentIrFinancialEvidence>, field: string): DocumentIrFinancialEvidence {
  const value = byField.get(field);
  if (!value) throw new Error(`Independent top-level result lacks source evidence for ${field}.`);
  return value;
}

function addDirectSourceClaim(input: { observations: Map<string, Observation>; baseClaims: Claim[];
  evidence: DocumentIrFinancialEvidence; statementId: string; populationKey: FinancialPopulationKey; valueMinor: number }): void {
  const ref = addFormulaInput({ observations: input.observations, evidence: input.evidence, statementId: input.statementId,
    field: input.evidence.field, valueMinor: input.valueMinor });
  addClaimForObservation(input.baseClaims, input.populationKey, ref, input.valueMinor);
}

function addFormulaInput(input: { observations: Map<string, Observation>; evidence?: DocumentIrFinancialEvidence;
  statementId: string; field: string; valueMinor: number; inferredZero?: boolean }): string {
  const id = observationIdForField(input.field);
  input.observations.set(id, { id, kind: "amount", value: input.valueMinor,
    authority: input.evidence ? "source_printed" : "deterministic_extraction",
    locator: input.evidence ? { documentId: input.statementId, page: input.evidence.pageNumber,
      section: "summary", row: input.evidence.lineId, label: input.evidence.evidenceLine }
      : { documentId: input.statementId, section: "summary",
        label: input.inferredZero ? `${input.field}: layout-defined zero term` : input.field } });
  return id;
}

function addClaimForObservation(baseClaims: Claim[], populationKey: FinancialPopulationKey,
  observationRef: string, value: number): void {
  baseClaims.push({ key: claimKeyForPopulationKey(populationKey), value, support: "source_observation",
    observationRefs: [observationRef] });
}

function deterministicHypothesis(input: { populationKey: FinancialPopulationKey; observationRefs: string[];
  value: number; controlId?: string; controlIds?: string[]; description: string }): Hypothesis {
  const controlIds = input.controlIds ?? (input.controlId ? [input.controlId] : []);
  return { id: `document-ir.${input.populationKey}.hypothesis`,
    groupId: `document-ir.${input.populationKey}.interpretation`, origin: "deterministic",
    ownership: { kind: "deterministic_system", immutable: true },
    evidenceClass: "claim_proof", alternativeCoverage: "exhaustive_for_claim",
    description: input.description, observationRefs: input.observationRefs, events: [],
    populations: [{ id: `document-ir.${input.populationKey}.population`, observationRefs: input.observationRefs,
      dimensions: { population: input.populationKey, source: "document_ir" } }],
    claims: [{ key: claimKeyForPopulationKey(input.populationKey), value: input.value,
      support: "deterministic_derivation", observationRefs: input.observationRefs, controlRefs: controlIds }],
    requiredControlIds: controlIds };
}

function addCardSummaryPopulations(input: {
  statementId: string;
  cardSummary: ReturnType<typeof extractFiservIndependentCardSummary>;
  observations: Map<string, Observation>;
  baseClaims: Claim[];
  controls: DeterministicControl[];
}): void {
  const card = input.cardSummary;
  if (card.status !== "mapped" || !card.grossVolume || !card.refundVolume || !card.submittedVolume
    || !card.grossCount || !card.refundCount) return;
  const grossRef = addIndependentValueObservation(input, "card-summary.gross-volume", "amount", card.grossVolume);
  const refundRef = addIndependentValueObservation(input, "card-summary.refund-volume", "amount", card.refundVolume);
  const submittedRef = addIndependentValueObservation(input, "card-summary.submitted-volume", "amount", card.submittedVolume);
  const grossCountRef = addIndependentValueObservation(input, "card-summary.gross-count", "count", card.grossCount);
  const refundCountRef = addIndependentValueObservation(input, "card-summary.refund-count", "count", card.refundCount);
  addClaimForObservation(input.baseClaims, "grossSaleVolume", grossRef, card.grossVolume.value);
  addClaimForObservation(input.baseClaims, "refundVolume", refundRef, card.refundVolume.value);
  addClaimForObservation(input.baseClaims, "grossSaleTransactionCount", grossCountRef, card.grossCount.value);
  addClaimForObservation(input.baseClaims, "refundTransactionCount", refundCountRef, card.refundCount.value);
  if (card.submittedCount) {
    const ref = addIndependentValueObservation(input, "card-summary.submitted-count", "count", card.submittedCount);
    addClaimForObservation(input.baseClaims, "submittedTransactionCount", ref, card.submittedCount.value);
    input.controls.push({
      id: "document-ir.control.card-summary-count-formula",
      kind: "arithmetic",
      description: "Reconcile gross-sale and refund item populations to the explicitly printed submitted-item count.",
      terms: [{ observationRef: grossCountRef, coefficient: 1 }, { observationRef: refundCountRef, coefficient: 1 }],
      expectedObservationRef: ref,
      tolerance: 0,
    });
  }
  input.controls.push({
    id: "document-ir.control.card-summary-formula",
    kind: "arithmetic",
    description: "Reconcile card-summary gross sales less refunds to its printed submitted amount.",
    terms: [{ observationRef: grossRef, coefficient: 1 }, { observationRef: refundRef, coefficient: -1 }],
    expectedObservationRef: submittedRef,
    tolerance: 1,
  });
  input.controls.push({
    id: "document-ir.control.card-summary-headline-match",
    kind: "equal",
    description: "Require the card-summary submitted amount to match the independently printed headline submitted amount.",
    leftObservationRef: submittedRef,
    rightObservationRef: observationIdForField("totalVolume"),
    tolerance: 1,
  });
}

function addAdjustmentChargebackPopulations(input: {
  statementId: string;
  result: ReturnType<typeof extractFiservIndependentAdjustmentChargeback>;
  observations: Map<string, Observation>;
  controls: DeterministicControl[];
  hypotheses: Hypothesis[];
}): void {
  const adjustments = addFlowSectionControl({ ...input, section: input.result.adjustments,
    prefix: "adjustment", controlId: "document-ir.control.adjustment-section-total" });
  if (adjustments) {
    input.hypotheses.push(deterministicHypothesis({ populationKey: "settlementAdjustmentAmount",
      observationRefs: adjustments.observationRefs, value: adjustments.printedTotal,
      controlId: adjustments.controlId,
      description: "Admit the adjustment-section total only when its independently extracted detail rows reconcile." }));
  }

  const chargebacks = addFlowSectionControl({ ...input, section: input.result.chargebacks,
    prefix: "chargeback", controlId: "document-ir.control.chargeback-section-total" });
  if (!chargebacks) return;
  const splitProofs = qualifyFiservIndependentSplitPopulations(input.result);
  const principalProof = splitProofs.chargebackPrincipalDebitAmount;
  const representmentProof = splitProofs.chargebackRepresentmentAmount;
  if (principalProof.status !== "proven" || representmentProof.status !== "proven"
      || principalProof.valueMinor === null || representmentProof.valueMinor === null) return;
  const principalRows = chargebacks.rows.filter((row) => /\bchargebacks?\b/i.test(row.description) && row.value < 0);
  const countRefs = principalRows.map((row, index) => {
    const id = `document-ir.chargeback.principal-count-unit.${index}`;
    input.observations.set(id, { id, kind: "count", value: 1, authority: "deterministic_extraction",
      locator: { documentId: input.statementId, page: row.pageNumber, section: "CHARGEBACKS/REVERSALS",
        row: row.lineId, label: row.evidenceLine } });
    return id;
  });
  const countControlId = "document-ir.control.chargeback-principal-count";
  input.controls.push({ id: countControlId, kind: "arithmetic",
    description: "Count independently observed chargeback-principal debit rows without counting reversals as new chargebacks.",
    terms: countRefs.map((observationRef) => ({ observationRef, coefficient: 1 })),
    expectedLiteral: principalRows.length, tolerance: 0 });
  input.hypotheses.push(deterministicHypothesis({ populationKey: "chargebackPrincipalDebitAmount",
    observationRefs: chargebacks.observationRefs, value: principalProof.valueMinor, controlId: chargebacks.controlId,
    description: "Retain only explicitly classified principal events within the reconciled chargeback/reversal section." }));
  input.hypotheses.push(deterministicHypothesis({ populationKey: "chargebackRepresentmentAmount",
    observationRefs: chargebacks.observationRefs, value: representmentProof.valueMinor, controlId: chargebacks.controlId,
    description: "Retain only explicitly classified reversal or representment events within the reconciled chargeback/reversal section." }));
  input.hypotheses.push(deterministicHypothesis({ populationKey: "chargebackCount",
    observationRefs: [...chargebacks.observationRefs, ...countRefs], value: principalRows.length,
    controlIds: [chargebacks.controlId, countControlId],
    description: "Count principal-debit events in an exhaustive, reconciled chargeback/reversal section." }));
}

function addFlowSectionControl(input: {
  statementId: string;
  section: ReturnType<typeof extractFiservIndependentAdjustmentChargeback>["adjustments"];
  prefix: string;
  controlId: string;
  observations: Map<string, Observation>;
  controls: DeterministicControl[];
}): { controlId: string; printedTotal: number; observationRefs: string[];
  rows: Array<IndependentDocumentIrValue & { description: string }> } | null {
  if (input.section.status === "not_mapped" || !input.section.printedTotal) return null;
  const totalRef = addIndependentValueObservation(input, `${input.prefix}.printed-total`, "amount", input.section.printedTotal);
  const rowRefs = input.section.rows.map((row, index) =>
    addIndependentValueObservation(input, `${input.prefix}.row.${index}`, "amount", row));
  input.controls.push({ id: input.controlId, kind: "arithmetic",
    description: `Reconcile independently extracted ${input.prefix} rows to the printed section total.`,
    terms: rowRefs.map((observationRef) => ({ observationRef, coefficient: 1 })),
    expectedObservationRef: totalRef, tolerance: 1 });
  return { controlId: input.controlId, printedTotal: input.section.printedTotal.value,
    observationRefs: [totalRef, ...rowRefs], rows: input.section.rows };
}

function addFundingBatchPopulation(input: {
  statementId: string;
  result: ReturnType<typeof extractFiservIndependentFundingBatchPopulation>;
  observations: Map<string, Observation>;
  controls: DeterministicControl[];
  hypotheses: Hypothesis[];
}): void {
  if (input.result.status === "not_mapped" || input.result.count === null || !input.result.populationAnchor) return;
  const countRef = "document-ir.funding-batch.extracted-count";
  input.observations.set(countRef, { id: countRef, kind: "count", value: input.result.count,
    authority: "deterministic_extraction",
    locator: { documentId: input.statementId, page: input.result.populationAnchor.pageNumber,
      section: "AMOUNTS FUNDED BY BATCH", row: input.result.populationAnchor.lineId,
      label: `Count of explicit dated batch identities bounded by: ${input.result.populationAnchor.evidenceLine}` } });
  const rowRefs = input.result.rows.map((row, index) => {
    const id = `document-ir.funding-batch.row-unit.${index}`;
    input.observations.set(id, { id, kind: "count", value: 1, authority: "deterministic_extraction",
      locator: { documentId: input.statementId, page: row.pageNumber, section: "AMOUNTS FUNDED BY BATCH",
        row: row.lineId, label: `${row.dateSubmitted} | ${row.batchNumber}` } });
    return id;
  });
  const controlId = "document-ir.control.funding-batch-row-count";
  input.controls.push({ id: controlId, kind: "arithmetic",
    description: "Count only dated funding-ledger rows with an explicit batch identifier; exclude month-end charge rows.",
    terms: rowRefs.map((observationRef) => ({ observationRef, coefficient: 1 })),
    expectedObservationRef: countRef, tolerance: 0 });
  input.hypotheses.push(deterministicHypothesis({ populationKey: "fundingBatchCount",
    observationRefs: [countRef, ...rowRefs], value: input.result.count, controlId,
    description: "Derive funding-batch count from explicit dated batch identities, not from all funding-ledger rows." }));
}

function addIndependentValueObservation(input: {
  statementId: string;
  observations: Map<string, Observation>;
}, field: string, kind: "amount" | "count", source: IndependentDocumentIrValue,
authority: Observation["authority"] = "source_printed"): string {
  const id = `document-ir.${field}`;
  input.observations.set(id, { id, kind, value: source.value, authority,
    locator: { documentId: input.statementId, page: source.pageNumber, section: "independent_population",
      row: source.lineId, label: source.evidenceLine } });
  return id;
}

function unsupportedEvidenceNeeds(): EvidenceNeed[] {
  return (Object.keys(CLAIM_RECONCILIATION_POLICY) as FinancialPopulationKey[])
    .filter((key) => CLAIM_RECONCILIATION_POLICY[key].claimClass === "independent_extractor_not_implemented")
    .map((key) => ({ id: `document-ir.${key}.evidence-need`, hypothesisGroupId: `document-ir.${key}.interpretation`,
      description: `An independent DocumentIR extractor and ${CLAIM_RECONCILIATION_POLICY[key].reconciliationDependency} are required for ${key}.`,
      material: true, availableScopes: ["statement_local", "private_authorized"] }));
}

function reconciliationFindings(
  controlById: Map<string, ControlState>,
  canonicalByKey: Map<string, Claim["value"]>,
): IndependentReconciliationFinding[] {
  return (Object.keys(CLAIM_RECONCILIATION_POLICY) as FinancialPopulationKey[]).map((populationKey) => {
    const policy = CLAIM_RECONCILIATION_POLICY[populationKey];
    const control = policy.reconciliationDependency === "none" ? "direct_source_observation" as const
      : policy.reconciliationDependency;
    const controlIds = control === "card_summary_formula"
      ? ["document-ir.control.card-summary-formula", "document-ir.control.card-summary-headline-match"]
      : control === "funding_formula" ? ["document-ir.control.funding-formula"]
        : control === "adjustment_section_total" ? ["document-ir.control.adjustment-section-total"]
          : control === "chargeback_section_total" ? ["document-ir.control.chargeback-section-total",
            ...(populationKey === "chargebackCount" ? ["document-ir.control.chargeback-principal-count"] : [])]
            : control === "funding_batch_population" ? ["document-ir.control.funding-batch-row-count"] : [];
    const states = controlIds.map((id) => controlById.get(id) ?? "unresolved");
    const state: ControlState | null = states.length === 0 ? null
      : states.includes("fail") ? "fail" : states.includes("unresolved") ? "unresolved" : "pass";
    const hasIndependentClaim = canonicalByKey.has(claimKeyForPopulationKey(populationKey));
    const outcome: ClaimReconciliationOutcome = control === "direct_source_observation"
      ? hasIndependentClaim ? "passing" : "unresolved"
      : control === "future_claim_specific_control" || state === null || state === "unresolved" ? "unresolved"
        : state === "pass" ? "passing" : "failed";
    return { populationKey, control, outcome, treatment: reconciliationTreatment(populationKey, outcome), controlState: state };
  });
}

function failedResult(source: CanonicalRbReconstructionShadowInput, error: unknown): CanonicalRbReconstructionShadowResult {
  return { schemaVersion: CANONICAL_RB_RECONSTRUCTION_SHADOW_SCHEMA,
    authority: "shadow_non_authoritative", pipelineBoundary: "post_rb_diagnostics", canonicalMutation: "prohibited",
    downstreamUse: "diagnostics_only", providerAuthority: "proposal_only_no_canonical_truth",
    statementId: source.sourceDocumentRef, status: "failed",
    inputIndependence: { kernelRbSemanticRoleInputs: 0, kernelRbContributionRoleInputs: 0,
      kernelRbRepresentationGroupInputs: 0, kernelRbReconciliationInputs: 0, kernelRbOccurrenceInputs: 0,
      kernelProcessorPresentedCategoryInputs: 0, kernelProcessorPresentedCategoryControlInputs: 0,
      documentIrObservationCount: 0, sourceModelBoundObservationCount: 0, totalKernelObservationCount: 0,
      independentControlCount: 0,
      rbUse: "comparison_plus_validated_source_model_category_binding" },
    processorPresentedCategoryBindings: [],
    sourceEvidence: { sourceType: source.document.sourceType, extractionMode: source.document.extraction.mode,
      documentIrFingerprint: "", documentIrLineCount: 0, familyAccepted: false,
      familyAcceptanceBasis: "not_accepted", familyConfidence: 0,
      matchedFamilySignals: [], layoutFamily: null, topLevelExtraction: "failed",
      independentExtractors: { cardSummary: "not_mapped", adjustments: "not_mapped",
        chargebacks: "not_mapped", fundingBatches: "not_mapped" } },
    reconciliationFindings: [], reconstruction: null, comparisons: [], summary: dispositionSummary([]),
    errors: [`Reconstruction shadow failed without affecting RB: ${error instanceof Error ? error.message : "unknown_error"}`] };
}

function factValue(fact: FactShape): number | null {
  if (fact.status !== "available" || fact.value === null) return null;
  return typeof fact.value === "number" ? fact.value : fact.value.amountMinor;
}
function observationIdForField(field: string): string {
  return `document-ir.top-level.${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
function claimKeyForPopulationKey(populationKey: FinancialPopulationKey): string {
  return `shadow.financial_population.${populationKey}`;
}
function toMinor(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
function dispositionSummary(comparisons: CanonicalRbShadowComparison[]): Record<CanonicalRbShadowDisposition, number> {
  const summary: Record<CanonicalRbShadowDisposition, number> = { agree_value: 0, agree_withheld: 0,
    kernel_withheld_ambiguity: 0, kernel_rejected_rb_value: 0, kernel_diverged_value: 0,
    kernel_proposed_rb_withheld: 0 };
  for (const comparison of comparisons) summary[comparison.disposition] += 1;
  return summary;
}
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
