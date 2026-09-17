import { isMoneyAmount } from "./money.js";
import { validateCanonicalAiCapabilityLayer } from "./aiCapabilityValidation.js";
import { buildCanonicalCustomerState } from "./customerStateResolver.js";
import { customerNarrativeContradictions } from "./customerWording.js";
import {
  CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION,
  CUSTOMER_ACTION_TYPES,
  CUSTOMER_BENCHMARK_POLICY_VERSION,
  CUSTOMER_PERMISSIONS_POLICY_VERSION,
  CUSTOMER_PRIMARY_STATE_VALUES,
  CUSTOMER_STATE_MATERIALITY_POLICY_VERSION,
  CUSTOMER_STATE_POLICY_VERSION,
  CUSTOMER_VISIBILITY_POLICY_VERSION,
  CUSTOMER_WORDING_POLICY_VERSION,
} from "./customerStateTypes.js";
import { aggregateCanonicalOpportunityComponents } from "./opportunityEngine.js";
import { targetSupportsApprovedEstimate, targetSupportsDeterministic } from "./opportunityPolicy.js";
import { buildCanonicalFeeRollupAssessments, FEE_ROLLUP_COMPLETENESS_POLICY_VERSION } from "./feeRollupEvidence.js";
import { buildCanonicalFeePartitionSourceProvenance, FEE_PARTITION_SOURCE_PROVENANCE_POLICY_VERSION } from "./feePartitionSourceProvenance.js";
import { EXACT_SOURCE_ARITHMETIC_BRIDGE_POLICY_VERSION } from "./exactSourceArithmeticBridge.js";
import { FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION } from "./feeOperandRecovery.js";
import { FEE_OPERAND_UNIT_SEMANTICS_POLICY_VERSION } from "./feeOperandUnitSemantics.js";
import { validateCanonicalMerchantAttentionModel } from "./merchantAttention.js";
import type {
  CanonicalCustomerPermissionKey,
  CanonicalCrossSummaryLinkEvidence,
  CanonicalFeeLedgerControl,
  CanonicalFeeRow,
  CanonicalOpportunityComponent,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "./types.js";

export class CanonicalStatementValidationError extends Error {
  readonly errors: string[];
  readonly warnings: string[];
  readonly analysis: CanonicalStatementAnalysis;

  constructor(errors: string[], warnings: string[], analysis: CanonicalStatementAnalysis) {
    super(`Canonical statement analysis validation failed: ${errors.join(" ")}`);
    this.name = "CanonicalStatementValidationError";
    this.errors = errors;
    this.warnings = warnings;
    this.analysis = analysis;
  }
}

export function validateCanonicalStatementAnalysis(analysis: CanonicalStatementAnalysis): CanonicalStatementAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const calculationIds = new Set(analysis.calculations.map((item) => item.id));
  const calculationsById = new Map(analysis.calculations.map((item) => [item.id, item]));

  for (const collection of [analysis.evidence.map((item) => item.id), analysis.calculations.map((item) => item.id)]) {
    const seen = new Set<string>();
    for (const id of collection) {
      if (seen.has(id)) errors.push(`Duplicate canonical id ${id}.`);
      seen.add(id);
    }
  }

  visitFactValues(analysis, (path, fact) => {
    for (const evidenceRef of fact.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`${path} evidence ref ${evidenceRef} is broken.`);
    }
    if (fact.calculationRef && !calculationIds.has(fact.calculationRef)) errors.push(`${path} calculation ref ${fact.calculationRef} is broken.`);
    if (fact.status === "selected" && fact.value === null) errors.push(`${path} is selected with null value.`);
    if (fact.status === "selected" && fact.evidenceRefs.length === 0 && !fact.calculationRef) {
      errors.push(`${path} is selected without evidence or calculation.`);
    }
    if (fact.status !== "selected" && fact.value !== null) errors.push(`${path} is ${fact.status} but has a value.`);
    const selectedCandidates = fact.candidates.filter((candidate) => candidate.selected);
    if (selectedCandidates.length > 1) errors.push(`${path} has multiple selected candidates.`);
    if (fact.selectedCandidateId && !selectedCandidates.some((candidate) => candidate.id === fact.selectedCandidateId)) {
      errors.push(`${path}.selectedCandidateId does not identify a selected candidate.`);
    }
    for (const candidate of fact.candidates) {
      if (!Array.isArray(candidate.evidenceRefs)) {
        errors.push(`${path} candidate ${candidate.id ?? "unknown"} has invalid evidenceRefs.`);
        continue;
      }
      for (const evidenceRef of candidate.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`${path} candidate ${candidate.id} evidence ref ${evidenceRef} is broken.`);
      }
      if (candidate.selected && !candidate.selectionReason) errors.push(`${path} selected candidate ${candidate.id} lacks selectionReason.`);
      if (!candidate.selected && !candidate.rejectionReason) errors.push(`${path} rejected candidate ${candidate.id} lacks rejectionReason.`);
    }
  });

  if (analysis.financialFacts.averageTicket.value !== null && !analysis.financialFacts.averageTicketBasis.allowed) {
    errors.push("Average ticket has a value when averageTicketBasis is not allowed.");
  }
  if (analysis.financialFacts.averageTicketBasis.allowed) {
    const basis = analysis.financialFacts.averageTicketBasis;
    if (basis.selectedVolumePopulation === "submitted_sales" && basis.selectedCountType !== "submitted_transactions") {
      errors.push("Submitted-sales average ticket must use submitted transactions.");
    }
    if (basis.selectedVolumePopulation === "settled_sales" && basis.selectedCountType !== "settled_transactions") {
      errors.push("Settled-sales average ticket must use settled transactions.");
    }
  }
  if (analysis.financialFacts.transactionCounts.cardTypeItems.value !== null && analysis.financialFacts.averageTicketBasis.selectedCountType === "card_type_items") {
    errors.push("Card-type item counts cannot be selected for average ticket in Package B.");
  }
  if (analysis.financialFacts.processedSales.value && !isMoneyAmount(analysis.financialFacts.processedSales.value)) {
    errors.push("Processed sales must use canonical MoneyAmount.");
  }
  if (analysis.financialFacts.totalFees.value && !isMoneyAmount(analysis.financialFacts.totalFees.value)) {
    errors.push("Total fees must use canonical MoneyAmount.");
  }
  if (analysis.versionManifest?.schemaVersion !== "canonical_statement_analysis_v1") {
    errors.push("Canonical version manifest is missing or has an unsupported schemaVersion.");
  }
  if (analysis.versionManifest?.effectiveRatePolicyVersion !== "effective_rate_basis_v1") {
    errors.push("Canonical version manifest must include effective_rate_basis_v1.");
  }
  if (analysis.versionManifest?.ownershipActionabilityPolicyVersion !== "fee_ownership_actionability_v1") {
    errors.push("Canonical version manifest must include fee_ownership_actionability_v1.");
  }
  if (analysis.versionManifest?.feeClassificationPolicyVersion !== "fee_taxonomy_v1") {
    errors.push("Canonical version manifest must include fee_taxonomy_v1.");
  }
  if (analysis.versionManifest?.opportunityEnginePolicyVersion !== "canonical_opportunity_engine_v1") {
    errors.push("Canonical version manifest must include canonical_opportunity_engine_v1.");
  }
  if (analysis.versionManifest?.merchantAttentionPolicyVersion !== "canonical_merchant_attention_v1") {
    errors.push("Canonical version manifest must include canonical_merchant_attention_v1.");
  }
  if (analysis.versionManifest?.opportunityTargetPolicyVersion !== "opportunity_target_policy_v1") {
    errors.push("Canonical version manifest must include opportunity_target_policy_v1.");
  }
  if (analysis.versionManifest?.opportunityCadencePolicyVersion !== "opportunity_cadence_policy_v1") {
    errors.push("Canonical version manifest must include opportunity_cadence_policy_v1.");
  }
  if (analysis.versionManifest?.opportunityBenchmarkPolicyVersion !== "opportunity_benchmark_policy_v1") {
    errors.push("Canonical version manifest must include opportunity_benchmark_policy_v1.");
  }
  if (analysis.versionManifest?.opportunityAiBoundaryPolicyVersion !== "opportunity_ai_boundary_policy_v1") {
    errors.push("Canonical version manifest must include opportunity_ai_boundary_policy_v1.");
  }
  if (analysis.versionManifest?.aiCapabilityBoundaryPolicyVersion !== "canonical_ai_capability_boundary_v1") {
    errors.push("Canonical version manifest must include canonical_ai_capability_boundary_v1.");
  }
  if (analysis.versionManifest?.aiMaterialityPolicyVersion !== "ai_materiality_policy_v1") {
    errors.push("Canonical version manifest must include ai_materiality_policy_v1.");
  }
  if (analysis.versionManifest?.aiReadinessDegradationPolicyVersion !== "ai_readiness_degradation_policy_v1") {
    errors.push("Canonical version manifest must include ai_readiness_degradation_policy_v1.");
  }
  if (analysis.versionManifest?.aiPrivacyRetentionPolicyVersion !== "ai_privacy_retention_policy_v1") {
    errors.push("Canonical version manifest must include ai_privacy_retention_policy_v1.");
  }
  if (analysis.versionManifest?.deterministicExplanationPolicyVersion !== "deterministic_explanation_policy_v1") {
    errors.push("Canonical version manifest must include deterministic_explanation_policy_v1.");
  }
  if (analysis.versionManifest?.businessQualificationPolicyVersion !== "canonical_business_qualification_v1") {
    errors.push("Canonical version manifest must include canonical_business_qualification_v1.");
  }
  if (analysis.versionManifest?.customerStatePolicyVersion !== CUSTOMER_STATE_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_state_policy_v1.");
  }
  if (analysis.versionManifest?.customerStateMaterialityPolicyVersion !== CUSTOMER_STATE_MATERIALITY_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_state_materiality_v1.");
  }
  if (analysis.versionManifest?.customerBenchmarkPolicyVersion !== CUSTOMER_BENCHMARK_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_benchmark_policy_v1.");
  }
  if (analysis.versionManifest?.customerPermissionPolicyVersion !== CUSTOMER_PERMISSIONS_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_permissions_v1.");
  }
  if (analysis.versionManifest?.customerVisibilityPolicyVersion !== CUSTOMER_VISIBILITY_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_visibility_v1.");
  }
  if (analysis.versionManifest?.customerActionGuidancePolicyVersion !== CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_action_guidance_v1.");
  }
  if (analysis.versionManifest?.customerWordingPolicyVersion !== CUSTOMER_WORDING_POLICY_VERSION) {
    errors.push("Canonical version manifest must include canonical_customer_wording_v1.");
  }
  if (analysis.versionManifest?.crossSummaryLinkEvidencePolicyVersion !== "cross_summary_link_evidence_v2") {
    errors.push("Canonical version manifest must include cross_summary_link_evidence_v2.");
  }
  if (analysis.versionManifest?.crossSummaryReconciliationAdjudicationPolicyVersion !== "cross_summary_reconciliation_adjudication_v1") {
    errors.push("Canonical version manifest must include cross_summary_reconciliation_adjudication_v1.");
  }
  if (analysis.versionManifest?.feeRollupCompletenessPolicyVersion !== FEE_ROLLUP_COMPLETENESS_POLICY_VERSION) {
    errors.push("Canonical version manifest must include fee_rollup_completeness_rounding_attribution_v1.");
  }
  if (analysis.versionManifest?.feePartitionSourceProvenancePolicyVersion !== FEE_PARTITION_SOURCE_PROVENANCE_POLICY_VERSION) {
    errors.push("Canonical version manifest must include fee_partition_source_provenance_v1.");
  }
  if (analysis.versionManifest?.exactSourceArithmeticBridgePolicyVersion !== EXACT_SOURCE_ARITHMETIC_BRIDGE_POLICY_VERSION) {
    errors.push("Canonical version manifest must include exact_source_arithmetic_bridge_v1.");
  }
  if (analysis.versionManifest?.feeBasisOperandCoveragePolicyVersion !== FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION) {
    errors.push("Canonical version manifest must include fee_basis_operand_coverage_conflict_resolution_v1.");
  }
  if (analysis.versionManifest?.feeOperandUnitSemanticsPolicyVersion !== FEE_OPERAND_UNIT_SEMANTICS_POLICY_VERSION) {
    errors.push("Fee operand unit-semantics policy version is missing or unsupported.");
  }
  if (analysis.financialFacts.effectiveRateBasis?.policyVersion !== "effective_rate_basis_v1") {
    errors.push("Effective rate basis is missing or unsupported.");
  }
  if (analysis.feeLedger?.policyVersion !== "canonical_fee_ledger_v1") {
    errors.push("Canonical fee ledger is missing or unsupported.");
  }
  if (analysis.feeLedger) {
    for (const occurrence of analysis.feeLedger.sourceOccurrences) {
      if (!evidenceIds.has(occurrence.evidenceRef)) errors.push(`Fee source occurrence ${occurrence.id} evidence ref ${occurrence.evidenceRef} is broken.`);
    }
    const occurrenceIds = new Set(analysis.feeLedger.sourceOccurrences.map((item) => item.id));
    const interpretationIds = new Set(analysis.feeLedger.parserInterpretations.map((item) => item.id));
    const controlIds = new Set(analysis.feeLedger.controls.map((item) => item.id));
    if (controlIds.size !== analysis.feeLedger.controls.length) errors.push("Fee ledger contains duplicate control ids.");
    for (const interpretation of analysis.feeLedger.parserInterpretations) {
      if (!occurrenceIds.has(interpretation.sourceOccurrenceId)) {
        errors.push(`Fee parser interpretation ${interpretation.id} source occurrence ref ${interpretation.sourceOccurrenceId} is broken.`);
      }
      if (interpretation.printedRate?.representation === "unknown" && interpretation.printedRate.normalizedFractionalRate !== null) {
        errors.push(`Fee parser interpretation ${interpretation.id} has unknown rate representation with normalized value.`);
      }
    }
    const contributingOccurrenceIds = new Set<string>();
    for (const row of analysis.feeLedger.rows) {
      for (const occurrenceId of row.sourceOccurrenceIds) {
        if (!occurrenceIds.has(occurrenceId)) errors.push(`Fee row ${row.id} source occurrence ref ${occurrenceId} is broken.`);
      }
      for (const interpretationId of row.parserInterpretationIds) {
        if (!interpretationIds.has(interpretationId)) errors.push(`Fee row ${row.id} parser interpretation ref ${interpretationId} is broken.`);
      }
      if (row.contributesToUniqueTotal && row.signedAmount === null) errors.push(`Fee row ${row.id} contributes to total without signed amount.`);
      if (!row.contributionDecision) {
        errors.push(`Fee row ${row.id} is missing contribution decision metadata.`);
        continue;
      }
      if (row.contributesToUniqueTotal !== row.contributionDecision.contributes) {
        errors.push(`Fee row ${row.id} contribution flag does not match contribution decision.`);
      }
      if (row.contributesToUniqueTotal && row.contributionDecision.evidenceRefs.length === 0) {
        errors.push(`Fee row ${row.id} contributes to total without contribution source evidence.`);
      }
      if (
        row.contributesToUniqueTotal &&
        (row.contributionDecision.signedAmountBasis === "unresolved" || row.contributionDecision.signedAmountBasis === "not_applicable")
      ) {
        errors.push(`Fee row ${row.id} contributes with ambiguous signed amount basis.`);
      }
      if (row.contributesToUniqueTotal) {
        for (const occurrenceId of row.sourceOccurrenceIds) {
          if (contributingOccurrenceIds.has(occurrenceId)) {
            errors.push(`Fee row ${row.id} duplicates contributing source occurrence ${occurrenceId}.`);
          }
          contributingOccurrenceIds.add(occurrenceId);
        }
      }
      for (const evidenceRef of row.contributionDecision.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Fee row ${row.id} contribution evidence ref ${evidenceRef} is broken.`);
      }
      for (const controlRef of row.contributionDecision.controlRefs) {
        if (!controlIds.has(controlRef)) errors.push(`Fee row ${row.id} contribution control ref ${controlRef} is broken.`);
      }
      if (row.contributesToUniqueTotal && row.role === "interchange_detail_row") {
        if (row.contributionDecision.reasonCode !== "pass_through_fee_charge_included") {
          errors.push(`Fee row ${row.id} interchange contribution lacks pass-through reason code.`);
        }
        if (row.contributionDecision.controlRefs.length === 0 || row.contributionDecision.evidenceRefs.length === 0) {
          errors.push(`Fee row ${row.id} interchange contribution lacks control or evidence references.`);
        }
      }
      if (
        row.contributesToUniqueTotal &&
        (row.role === "section_subtotal" ||
          row.role === "fee_bucket_total" ||
          row.role === "statement_control_total" ||
          row.role === "informational_rate_row" ||
          row.role === "zero_dollar_reference_row" ||
          row.role === "duplicate_representation" ||
          row.role === "supporting_evidence_only")
      ) {
        errors.push(`Fee row ${row.id} has non-contributing role ${row.role} marked contributing.`);
      }
      if (!row.contributesToUniqueTotal && row.role === "individual_charge" && row.signedAmount?.amountMinor !== 0) {
        warnings.push(`Fee row ${row.id} is an individual charge that does not contribute to unique total.`);
      }
    }
    for (const control of analysis.feeLedger.controls) {
      for (const evidenceRef of control.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Fee ledger control ${control.id} evidence ref ${evidenceRef} is broken.`);
      }
      for (const evidenceRef of control.roundingBridge?.evidenceRefs ?? []) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Fee ledger control ${control.id} rounding evidence ref ${evidenceRef} is broken.`);
      }
      if (
        control.roundingBridge &&
        (control.roundingBridge.policyVersion !== "fee_rollup_rounding_bridge_v1" ||
          control.roundingBridge.method !== "exact_unrounded_partition_bridge" ||
          control.roundingBridge.roundingMode !== "nearest_cent_half_away_from_zero")
      ) {
        errors.push(`Fee ledger control ${control.id} has an unsupported rounding bridge.`);
      }
      if (control.status === "pass_with_rounding" && !control.roundingBridge) {
        errors.push(`Fee ledger control ${control.id} claims rounding without an exact evidence-backed rounding bridge.`);
      }
      if (control.expectedAmount && !isMoneyAmount(control.expectedAmount)) errors.push(`Fee ledger control ${control.id} has invalid expected amount.`);
      if (control.actualAmount && !isMoneyAmount(control.actualAmount)) errors.push(`Fee ledger control ${control.id} has invalid actual amount.`);
      if (control.parserReportedActualAmount && !isMoneyAmount(control.parserReportedActualAmount)) {
        errors.push(`Fee ledger control ${control.id} has invalid parser-reported diagnostic amount.`);
      }
      for (const feeRowId of control.coveredFeeRowIds) {
        if (!analysis.feeLedger.rows.some((row) => row.id === feeRowId)) errors.push(`Fee ledger control ${control.id} references missing covered fee row ${feeRowId}.`);
      }
      if (control.type === "printed_charge_sum" && control.reconstructedFromCoveredRows) {
        const reconstructed = reconstructControlActualAmount(control, analysis.feeLedger.rows);
        if (reconstructed === null) {
          errors.push(`Fee ledger control ${control.id} cannot reconstruct actual amount from covered fee rows.`);
        } else if (!control.actualAmount || control.actualAmount.amountMinor !== reconstructed.amountMinor || control.actualAmount.currency !== reconstructed.currency) {
          errors.push(`Fee ledger control ${control.id} actual amount does not reconstruct from covered fee rows.`);
        }
      }
      if (
        control.type === "printed_charge_sum" &&
        control.independence === "printed_source_control" &&
        control.status !== "limited" &&
        control.status !== "verification_required" &&
        control.coveredFeeRowIds.length === 0
      ) {
        errors.push(`Fee ledger control ${control.id} passes without deterministic covered fee rows.`);
      }
    }
    if (
      analysis.feeLedger.status === "available" &&
      analysis.feeLedger.controls.some((control) => control.type === "printed_charge_sum" && control.status !== "pass" && control.status !== "pass_with_rounding")
    ) {
      errors.push("Fee ledger is available while a blocking monetary control remains unresolved.");
    }
    if (analysis.feeLedger.uniqueChargeCalculationRef && !calculationIds.has(analysis.feeLedger.uniqueChargeCalculationRef)) {
      errors.push(`Fee ledger calculation ref ${analysis.feeLedger.uniqueChargeCalculationRef} is broken.`);
    }
    const expectedPartitionProvenance = buildCanonicalFeePartitionSourceProvenance({
      rows: analysis.feeLedger.rows,
      interpretations: analysis.feeLedger.parserInterpretations,
      sourceOccurrences: analysis.feeLedger.sourceOccurrences,
      controls: analysis.feeLedger.controls,
    });
    if (JSON.stringify(analysis.feeLedger.partitionSourceProvenance) !== JSON.stringify(expectedPartitionProvenance)) {
      errors.push("Fee partition source provenance does not reconstruct from fee rows, interpretations, occurrences, and controls.");
    }
    if (analysis.feeLedger.partitionSourceProvenance.policyVersion !== FEE_PARTITION_SOURCE_PROVENANCE_POLICY_VERSION) {
      errors.push("Fee partition source provenance is missing or unsupported.");
    }
    if (analysis.feeLedger.partitionSourceProvenance.authority !== "diagnostic_relationship_only") {
      errors.push("Fee partition source provenance must remain diagnostic-only.");
    }
    for (const assignment of analysis.feeLedger.partitionSourceProvenance.assignments) {
      for (const evidenceRef of assignment.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Fee section assignment ${assignment.feeRowId} evidence ref ${evidenceRef} is broken.`);
      }
    }
    for (const arithmetic of analysis.feeLedger.partitionSourceProvenance.rowArithmetic) {
      if (arithmetic.operandRecovery.policyVersion !== FEE_BASIS_OPERAND_COVERAGE_POLICY_VERSION) {
        errors.push(`Fee arithmetic provenance ${arithmetic.feeRowId} uses an unsupported operand-recovery policy.`);
      }
      if (arithmetic.operandRecovery.unitSemanticsPolicyVersion !== FEE_OPERAND_UNIT_SEMANTICS_POLICY_VERSION) {
        errors.push(`Fee arithmetic provenance ${arithmetic.feeRowId} uses an unsupported unit-semantics policy.`);
      }
      if (arithmetic.formulaBasis === "source_units_times_per_unit" && arithmetic.sourceUnit === null) {
        errors.push(`Fee arithmetic provenance ${arithmetic.feeRowId} has source-unit arithmetic without a resolved source unit.`);
      }
      if (arithmetic.formulaBasis !== "source_units_times_per_unit" && arithmetic.sourceUnit !== null) {
        errors.push(`Fee arithmetic provenance ${arithmetic.feeRowId} carries a source unit outside source-unit arithmetic.`);
      }
      for (const evidenceRef of Object.values(arithmetic.fieldEvidenceRefs).flat()) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Fee arithmetic provenance ${arithmetic.feeRowId} evidence ref ${evidenceRef} is broken.`);
      }
      for (const candidate of arithmetic.operandRecovery.candidates) {
        if (candidate.formulaBasis === "source_units_times_per_unit" && candidate.sourceUnit === null) {
          errors.push(`Fee operand candidate ${candidate.id} has source-unit arithmetic without a resolved source unit.`);
        }
        if (candidate.formulaBasis !== "source_units_times_per_unit" && candidate.sourceUnit !== null) {
          errors.push(`Fee operand candidate ${candidate.id} carries a source unit outside source-unit arithmetic.`);
        }
        for (const evidenceRef of candidate.evidenceRefs) {
          if (!evidenceIds.has(evidenceRef)) errors.push(`Fee operand candidate ${candidate.id} evidence ref ${evidenceRef} is broken.`);
        }
      }
    }
  }
  validateCrossSummaryLinkEvidence(analysis.crossSummaryLinkEvidence, analysis, evidenceIds, errors);
  if (analysis.feeOwnershipActionability?.policyVersion !== "fee_ownership_actionability_v1") {
    errors.push("Package D fee ownership/actionability layer is missing or unsupported.");
  }
  if (analysis.feeOwnershipActionability?.taxonomyVersion !== "fee_taxonomy_v1") {
    errors.push("Package D fee ownership/actionability layer is missing fee_taxonomy_v1.");
  }
  if (analysis.feeOwnershipActionability?.ruleRegistryVersion !== "fee_ownership_rules_v1") {
    errors.push("Package D fee ownership/actionability layer is missing fee_ownership_rules_v1.");
  }
  if (analysis.feeOwnershipActionability?.aiSuggestionPolicyVersion !== "fee_ai_suggestion_policy_v1") {
    errors.push("Package D fee ownership/actionability layer is missing fee_ai_suggestion_policy_v1.");
  }
  if (analysis.feeOwnershipActionability?.humanOverridePolicyVersion !== "fee_human_override_policy_v1") {
    errors.push("Package D fee ownership/actionability layer is missing fee_human_override_policy_v1.");
  }
  if (analysis.feeOwnershipActionability) {
    const feeRowIds = new Set(analysis.feeLedger.rows.map((row) => row.id));
    const classificationFeeRowIds = new Set<string>();
    for (const row of analysis.feeLedger.rows) {
      const rowClassificationCount = analysis.feeOwnershipActionability.rowClassifications.filter((classification) => classification.feeRowId === row.id).length;
      if (rowClassificationCount === 0) errors.push(`Package D missing classification result for fee row ${row.id}.`);
      if (rowClassificationCount > 1) errors.push(`Package D has multiple classification results for fee row ${row.id}.`);
    }
    for (const classification of analysis.feeOwnershipActionability.rowClassifications) {
      if (!feeRowIds.has(classification.feeRowId)) errors.push(`Package D classification references unknown fee row ${classification.feeRowId}.`);
      if (classificationFeeRowIds.has(classification.feeRowId)) {
        errors.push(`Package D duplicate classification result for fee row ${classification.feeRowId}.`);
      }
      classificationFeeRowIds.add(classification.feeRowId);
      const candidateIds = new Set(classification.candidates.map((candidate) => candidate.id));
      if (!candidateIds.has(classification.selected.candidateId)) {
        errors.push(`Package D classification ${classification.feeRowId} selected candidate is missing.`);
      }
      for (const rejectedCandidateId of classification.selected.rejectedCandidateIds) {
        if (!candidateIds.has(rejectedCandidateId)) {
          errors.push(`Package D classification ${classification.feeRowId} rejected candidate ${rejectedCandidateId} is missing.`);
        }
      }
      if (classification.selected.actionabilityCeiling === "potentially_actionable" && blocksPotentialActionability(classification.selected.ownership.economicBeneficiary)) {
        errors.push(`Package D classification ${classification.feeRowId} is potentially actionable for a protected or unknown economic owner.`);
      }
      if (classification.selected.actionabilityCeiling === "potentially_actionable" && classification.selected.confidence !== "high") {
        errors.push(`Package D classification ${classification.feeRowId} is potentially actionable without high-confidence evidence.`);
      }
      if (classification.conflictStatus === "resolved_by_stronger_evidence" && (!classification.conflictReason || classification.selected.rejectedCandidateIds.length === 0)) {
        errors.push(`Package D classification ${classification.feeRowId} marked a conflict resolved without resolution evidence.`);
      }
      if (classification.conflictStatus === "requires_human_review" && !classification.conflictReason) {
        errors.push(`Package D classification ${classification.feeRowId} requires human review without a conflict reason.`);
      }
      for (const candidate of classification.candidates) {
        if (!feeRowIds.has(candidate.feeRowId)) errors.push(`Package D candidate ${candidate.id} references unknown fee row ${candidate.feeRowId}.`);
        if (candidate.sourceType === "ai_suggestion" && candidate.authoritative) {
          errors.push(`Package D AI candidate ${candidate.id} must not be authoritative.`);
        }
        if (candidate.actionabilityCeiling === "potentially_actionable" && blocksPotentialActionability(candidate.ownership.economicBeneficiary)) {
          errors.push(`Package D candidate ${candidate.id} is potentially actionable for a protected or unknown economic owner.`);
        }
        if (candidate.actionabilityCeiling === "potentially_actionable" && candidate.confidence !== "high") {
          errors.push(`Package D candidate ${candidate.id} is potentially actionable without high-confidence evidence.`);
        }
        for (const evidenceRef of candidate.evidenceRefs) {
          if (!evidenceIds.has(evidenceRef)) errors.push(`Package D candidate ${candidate.id} evidence ref ${evidenceRef} is broken.`);
        }
        if (candidate.reference && !candidate.reference.periodApplicable && candidate.actionabilityCeiling === "not_actionable" && candidate.category !== "unknown_needs_review") {
          errors.push(`Package D candidate ${candidate.id} used a period-inapplicable reference as authoritative classification.`);
        }
      }
    }
    for (const suggestion of analysis.feeOwnershipActionability.aiSuggestions) {
      if (suggestion.authoritative) errors.push(`Package D AI suggestion ${suggestion.id} must be non-authoritative.`);
      if (!feeRowIds.has(suggestion.feeRowId)) errors.push(`Package D AI suggestion ${suggestion.id} references unknown fee row ${suggestion.feeRowId}.`);
      for (const evidenceRef of suggestion.safeEvidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Package D AI suggestion ${suggestion.id} evidence ref ${evidenceRef} is broken.`);
      }
    }
    for (const spread of analysis.feeOwnershipActionability.spreadAssertions) {
      if (!feeRowIds.has(spread.baseFeeRowId)) errors.push(`Package D spread assertion ${spread.id} references unknown fee row ${spread.baseFeeRowId}.`);
      if (spread.status === "suspected" && spread.actionabilityCeiling !== "verify_only") {
        errors.push(`Package D suspected spread assertion ${spread.id} must be verification-only.`);
      }
      if (spread.status === "proven" && spread.owner !== "processor") {
        errors.push(`Package D proven spread assertion ${spread.id} must be processor-owned.`);
      }
      if (spread.status === "proven" && spread.actionabilityCeiling !== "potentially_actionable") {
        errors.push(`Package D proven spread assertion ${spread.id} must use a potentially-actionable ceiling.`);
      }
      if (spread.status === "proven" && (!spread.reference || !spread.reference.periodApplicable || spread.evidenceRefs.length === 0 || !spread.authoritative)) {
        errors.push(`Package D proven spread assertion ${spread.id} requires period-applicable reference, evidence, and authority.`);
      }
      if (spread.status !== "proven" && spread.authoritative) {
        errors.push(`Package D non-proven spread assertion ${spread.id} must not be authoritative.`);
      }
      for (const evidenceRef of spread.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Package D spread assertion ${spread.id} evidence ref ${evidenceRef} is broken.`);
      }
    }
    const overrideIds = new Set(analysis.feeOwnershipActionability.humanOverrides.map((override) => override.id));
    for (const override of analysis.feeOwnershipActionability.humanOverrides) {
      if (!feeRowIds.has(override.feeRowId)) errors.push(`Package D human override ${override.id} references unknown fee row ${override.feeRowId}.`);
      if (override.scope !== "statement_specific") errors.push(`Package D human override ${override.id} must be statement-specific in Package D.`);
      if (override.reusableRuleCreated !== false) errors.push(`Package D human override ${override.id} must not create reusable rules automatically.`);
      if (!override.reviewedAt || !override.reviewerId || !override.reason) {
        errors.push(`Package D human override ${override.id} lacks required reviewer, timestamp, or rationale metadata.`);
      }
      if (!override.previousClassification || !override.newClassification) {
        errors.push(`Package D human override ${override.id} lacks previous or new classification metadata.`);
      }
      if (!Object.hasOwn(override, "supersedesOverrideId") || !Object.hasOwn(override, "supersededByOverrideId")) {
        errors.push(`Package D human override ${override.id} lacks supersession history metadata.`);
      }
      if (!Array.isArray(override.evidenceRefs) || override.evidenceRefs.length === 0) {
        errors.push(`Package D human override ${override.id} lacks required evidence.`);
      }
      if (typeof override.reviewerId === "string" && /@|\s/.test(override.reviewerId)) {
        errors.push(`Package D human override ${override.id} reviewer ID must be an internal pseudonymous identifier.`);
      }
      if (Number.isNaN(Date.parse(String(override.reviewedAt ?? "")))) {
        errors.push(`Package D human override ${override.id} has an invalid timestamp.`);
      }
      if (override.newClassification?.actionabilityCeiling === "potentially_actionable" && override.newClassification.confidence !== "high") {
        errors.push(`Package D human override ${override.id} requires high-confidence evidence for potentially-actionable output.`);
      }
      if (override.supersedesOverrideId !== null && !overrideIds.has(override.supersedesOverrideId)) {
        errors.push(`Package D human override ${override.id} supersedes an unknown override.`);
      }
      if (override.supersededByOverrideId !== null && !overrideIds.has(override.supersededByOverrideId)) {
        errors.push(`Package D human override ${override.id} is superseded by an unknown override.`);
      }
      for (const evidenceRef of override.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Package D human override ${override.id} evidence ref ${evidenceRef} is broken.`);
      }
    }
    const forbiddenPackageDField = findForbiddenPackageDFieldPath(analysis.feeOwnershipActionability);
    if (forbiddenPackageDField) {
      errors.push(`Package D fee ownership/actionability layer contains forbidden financial-impact field ${forbiddenPackageDField}.`);
    }
    const packageDCalculation = analysis.calculations.find((calculation) =>
      !String(calculation.formulaCode).startsWith("opportunity_") && /savings|opportunity|annual|benchmark/i.test(`${calculation.formulaCode} ${calculation.formulaVersion}`),
    );
    if (packageDCalculation && analysis.feeOwnershipActionability.rowClassifications.length > 0) {
      warnings.push("Canonical analysis contains legacy savings/opportunity calculations outside Package D; Package D does not create or approve them.");
    }
  }
  if (
    analysis.financialFacts.rateRevealCalculatedAllInRate.value !== null &&
    (analysis.financialFacts.effectiveRateBasis.numeratorFeeBasis === "unsupported" ||
      analysis.financialFacts.effectiveRateBasis.denominatorVolumeBasis === "unsupported" ||
      !analysis.financialFacts.effectiveRateBasis.calculationRef)
  ) {
    errors.push("Selected effective rate requires explicit supported numerator and denominator basis plus calculationRef.");
  }
  validateOpportunityEngine(analysis, evidenceIds, calculationIds, calculationsById, errors);
  validateBusinessQualification(analysis, evidenceIds, errors);
  validateCanonicalAiCapabilityLayer(analysis, errors);
  validateCanonicalCustomerState(analysis, evidenceIds, calculationIds, calculationsById, errors);
  errors.push(...validateCanonicalMerchantAttentionModel(analysis));

  const validated: CanonicalStatementAnalysis = {
    ...analysis,
    validation: {
      status: errors.length > 0 ? "invalid" : warnings.length > 0 ? "valid_with_warnings" : "valid",
      errors,
      warnings,
    },
  };
  if (errors.length > 0) {
    throw new CanonicalStatementValidationError(errors, warnings, validated);
  }
  return validated;
}

function validateBusinessQualification(
  analysis: CanonicalStatementAnalysis,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  const qualification = analysis.businessQualification;
  if (!qualification || qualification.policyVersion !== "canonical_business_qualification_v1") {
    errors.push("Package 1 canonical business qualification is missing or unsupported.");
    return;
  }
  for (const evidenceRef of qualification.evidenceRefs) {
    if (!evidenceIds.has(evidenceRef)) errors.push(`Package 1 business qualification evidence ref ${evidenceRef} is broken.`);
  }
  for (const factor of [qualification.risk, qualification.channel, qualification.market, qualification.processorFamily]) {
    for (const evidenceRef of factor.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Package 1 qualification factor evidence ref ${evidenceRef} is broken.`);
    }
  }
  for (const evidenceRef of qualification.annualVolume.evidenceRefs) {
    if (!evidenceIds.has(evidenceRef)) errors.push(`Package 1 annual-volume evidence ref ${evidenceRef} is broken.`);
  }
  for (const conflict of qualification.conflicts) {
    for (const evidenceRef of conflict.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Package 1 conflict ${conflict.id} evidence ref ${evidenceRef} is broken.`);
    }
  }
  for (const alternative of qualification.alternatives) {
    if (alternative.source === "ai_suggestion" && alternative.authoritative) {
      errors.push("Package 1 AI business alternative cannot be authoritative.");
    }
    for (const evidenceRef of alternative.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Package 1 alternative evidence ref ${evidenceRef} is broken.`);
    }
  }
  if (qualification.aiAuthoritative !== false) errors.push("Package 1 business qualification must explicitly deny AI authority.");
  if (qualification.status === "qualified") {
    if (!qualification.resolvedSegmentId || qualification.resolvedSegmentId === "default" || qualification.resolvedSegmentId === "other") {
      errors.push("Package 1 qualified business context requires a non-default resolved segment.");
    }
    if (
      qualification.risk.status !== "qualified" ||
      qualification.channel.status !== "qualified" ||
      qualification.annualVolume.status !== "qualified" ||
      qualification.market.status !== "qualified" ||
      qualification.processorFamily.status !== "qualified"
    ) {
      errors.push("Package 1 qualified business context requires every benchmark factor to qualify.");
    }
    if (qualification.conflicts.some((conflict) => conflict.material)) errors.push("Package 1 qualified business context contains an unresolved material conflict.");
    if (qualification.confirmationRequirement !== null) errors.push("Package 1 qualified business context cannot retain a confirmation requirement.");
  }
  if (qualification.status === "confirmation_required" && qualification.confirmationRequirement === null) {
    errors.push("Package 1 confirmation-required business context lacks a confirmation requirement.");
  }
  const actualMcc = qualification.accountCoding.actualMcc;
  if (actualMcc.status === "selected") {
    if (!actualMcc.value || !/^\d{4}$/.test(actualMcc.value) || actualMcc.value === "0000") errors.push("Package 1 actual MCC must be an explicit valid four-digit statement value.");
    if (qualification.accountCoding.source !== "explicit_statement") errors.push("Package 1 selected actual MCC must use explicit_statement source.");
    for (const evidenceRef of actualMcc.evidenceRefs) {
      const evidence = analysis.evidence.find((record) => record.id === evidenceRef);
      if (
        !evidence ||
        evidence.sourceRole !== "account_coding" ||
        evidence.pageNumber === null ||
        evidence.extractionObservations.length === 0 ||
        evidence.extractionObservations.some((observation) => observation.extractionMethod !== "pdf_text")
      ) {
        errors.push("Package 1 actual MCC requires direct PDF statement evidence.");
      } else if (explicitLabeledMcc(evidence.extractedText ?? "") !== actualMcc.value) {
        errors.push("Package 1 actual MCC evidence is not an explicitly labeled MCC statement field.");
      }
    }
  } else if (actualMcc.status === "ambiguous") {
    if (qualification.accountCoding.source !== "conflicting_statement_values") {
      errors.push("Package 1 ambiguous actual MCC must preserve conflicting_statement_values source.");
    }
    if (!qualification.conflicts.some((conflict) => conflict.kind === "mcc_conflict" && conflict.material)) {
      errors.push("Package 1 ambiguous actual MCC requires an explicit material MCC conflict.");
    }
  } else if (qualification.accountCoding.source !== "not_available") {
    errors.push("Package 1 unavailable actual MCC must preserve not_available source.");
  }
  const forbiddenField = findForbiddenBenchmarkFinancialField(qualification);
  if (forbiddenField) errors.push(`Package 1 business qualification contains forbidden savings/opportunity field ${forbiddenField}.`);
  const comparisonForbiddenField = findForbiddenBenchmarkFinancialField(analysis.customerState.rateComparison);
  if (comparisonForbiddenField) errors.push(`Package 1 rate comparison contains forbidden savings/opportunity field ${comparisonForbiddenField}.`);
}

function explicitLabeledMcc(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const direct = normalized.match(/^\s*(?:MERCHANT\s+CATEGORY(?:\s+CODE)?|MCC(?:\s+CODE)?)\s*(?::|#|-|IS)?\s*(\d{4})\s*$/i);
  if (direct?.[1] && direct[1] !== "0000") return direct[1];
  const cells = normalized.split("|").map((cell) => cell.trim()).filter(Boolean);
  for (let index = 0; index < cells.length - 1; index += 1) {
    if (/^(?:MERCHANT\s+CATEGORY(?:\s+CODE)?|MCC(?:\s+CODE)?)$/i.test(cells[index]!) && /^\d{4}$/.test(cells[index + 1]!) && cells[index + 1] !== "0000") {
      return cells[index + 1]!;
    }
  }
  return null;
}

function findForbiddenBenchmarkFinancialField(value: unknown, path = "benchmark"): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = `${path}.${key}`;
    if (/savings|overpayment|recoverable|repricing|targetAmount|opportunityAmount|annualImpact|monthlyImpact/i.test(key)) return nestedPath;
    if (nested && typeof nested === "object") {
      const found = findForbiddenBenchmarkFinancialField(nested, nestedPath);
      if (found) return found;
    }
  }
  return null;
}

function reconstructControlActualAmount(control: CanonicalFeeLedgerControl, rows: CanonicalFeeRow[]): MoneyAmount | null {
  if (control.coveredFeeRowIds.length === 0) return null;
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  let amountMinor = 0;
  for (const feeRowId of control.coveredFeeRowIds) {
    const row = rowsById.get(feeRowId);
    if (!row) return null;
    if (control.amountBasis === "fee_charge_gross") {
      if (!row.selectedAmount) return null;
      amountMinor += Math.abs(row.selectedAmount.amountMinor);
    } else if (control.amountBasis === "signed_net") {
      if (!row.signedAmount) return null;
      amountMinor += row.signedAmount.amountMinor;
    } else {
      return null;
    }
  }
  return { amountMinor, currency: "USD" };
}

function validateCrossSummaryLinkEvidence(
  layer: CanonicalCrossSummaryLinkEvidence | null | undefined,
  analysis: CanonicalStatementAnalysis,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  if (!layer || layer.policyVersion !== "cross_summary_link_evidence_v2") {
    errors.push("Cross-summary link evidence layer is missing or unsupported.");
    return;
  }
  if (layer.adjudicationPolicyVersion !== "cross_summary_reconciliation_adjudication_v1") {
    errors.push("Cross-summary reconciliation adjudication policy is missing or unsupported.");
  }
  if (layer.feeRollupPolicyVersion !== FEE_ROLLUP_COMPLETENESS_POLICY_VERSION) {
    errors.push("Fee roll-up completeness and rounding attribution policy is missing or unsupported.");
  }
  if (layer.authority !== "diagnostic_relationship_only") {
    errors.push("Cross-summary link evidence must remain diagnostic-only and cannot create canonical financial authority.");
  }
  const nodesById = new Map(layer.nodes.map((node) => [node.id, node]));
  if (nodesById.size !== layer.nodes.length) errors.push("Cross-summary link evidence contains duplicate node ids.");
  const provenNodeIds = new Set(
    layer.relationships
      .filter((relationship) => relationship.status === "proven")
      .flatMap((relationship) => [relationship.leftSummaryId, relationship.rightSummaryId]),
  );
  const statementPeriod = analysis.identity.statementPeriod.status === "selected" ? analysis.identity.statementPeriod.value : null;
  const expectedFeeRollups = buildCanonicalFeeRollupAssessments(analysis.feeLedger);
  if (JSON.stringify(layer.feeRollups) !== JSON.stringify(expectedFeeRollups)) {
    errors.push("Fee roll-up assessments do not reconstruct from canonical fee controls.");
  }
  for (const rollup of layer.feeRollups) {
    if (rollup.policyVersion !== FEE_ROLLUP_COMPLETENESS_POLICY_VERSION) errors.push(`Fee roll-up ${rollup.id} uses an unsupported policy.`);
    if (rollup.countingTreatment !== "reference_only_no_addition") errors.push(`Fee roll-up ${rollup.id} could affect additive totals.`);
    for (const evidenceRef of rollup.roundingEvidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Fee roll-up ${rollup.id} rounding evidence ref ${evidenceRef} is broken.`);
    }
    if (rollup.sourceArithmetic.policyVersion !== EXACT_SOURCE_ARITHMETIC_BRIDGE_POLICY_VERSION) {
      errors.push(`Fee roll-up ${rollup.id} uses an unsupported exact source arithmetic policy.`);
    }
    if (rollup.sourceArithmetic.authority !== "diagnostic_relationship_only") {
      errors.push(`Fee roll-up ${rollup.id} exact source arithmetic must remain diagnostic-only.`);
    }
    if (rollup.sourceArithmetic.roundingMode !== "nearest_cent_half_away_from_zero") {
      errors.push(`Fee roll-up ${rollup.id} uses an unsupported exact source arithmetic rounding mode.`);
    }
    for (const evidenceRef of rollup.sourceArithmetic.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Fee roll-up ${rollup.id} source arithmetic evidence ref ${evidenceRef} is broken.`);
    }
  }
  const provenRoundedGrandControls = new Set(
    expectedFeeRollups.filter((rollup) => rollup.status === "proven_complete_with_rounding").map((rollup) => rollup.grandControlRef),
  );
  for (const control of analysis.feeLedger.controls) {
    if (control.status === "pass_with_rounding" && !provenRoundedGrandControls.has(control.id)) {
      errors.push(`Fee ledger control ${control.id} claims rounding without a reconstructable exact rounding attribution.`);
    }
  }
  for (const node of layer.nodes) {
    if (node.sourceDocumentRef !== analysis.identity.sourceDocumentRef) {
      errors.push(`Cross-summary node ${node.id} is linked to a different source document.`);
    }
    if (!node.identifierBasis.includes("source_document_ref")) {
      errors.push(`Cross-summary node ${node.id} lacks source-document identifier evidence.`);
    }
    if (node.amount && !isMoneyAmount(node.amount)) errors.push(`Cross-summary node ${node.id} has an invalid amount.`);
    for (const evidenceRef of node.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Cross-summary node ${node.id} evidence ref ${evidenceRef} is broken.`);
    }
    if (node.period && (!statementPeriod || node.period.start !== statementPeriod.start || node.period.end !== statementPeriod.end)) {
      errors.push(`Cross-summary node ${node.id} period does not match the selected statement period.`);
    }
    if (provenNodeIds.has(node.id)) validateCrossSummaryNodeSource(node, analysis, errors);
  }

  const relationshipIds = new Set<string>();
  const evidenceById = new Map(analysis.evidence.map((item) => [item.id, item]));
  for (const relationship of layer.relationships) {
    if (relationshipIds.has(relationship.id)) errors.push(`Cross-summary relationship ${relationship.id} is duplicated.`);
    relationshipIds.add(relationship.id);
    const left = nodesById.get(relationship.leftSummaryId);
    const right = nodesById.get(relationship.rightSummaryId);
    if (!left || !right) {
      errors.push(`Cross-summary relationship ${relationship.id} references a missing summary node.`);
      continue;
    }
    if (left.id === right.id) errors.push(`Cross-summary relationship ${relationship.id} links a summary to itself.`);
    for (const evidenceRef of relationship.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Cross-summary relationship ${relationship.id} evidence ref ${evidenceRef} is broken.`);
    }
    if (relationship.countingTreatment !== "reference_only_no_addition") {
      errors.push(`Cross-summary relationship ${relationship.id} could affect additive totals.`);
    }
    if (relationship.adjudication?.policyVersion !== "cross_summary_reconciliation_adjudication_v1") {
      errors.push(`Cross-summary relationship ${relationship.id} lacks the supported adjudication policy.`);
    }
    const expectedMeasure = left.measure === right.measure ? "compatible" : "incompatible";
    const expectedPeriod =
      left.period === null || right.period === null
        ? "unknown"
        : left.period.start === right.period.start && left.period.end === right.period.end
          ? "same_statement_period"
          : "incompatible";
    const expectedIdentifiers = left.sourceDocumentRef === right.sourceDocumentRef ? "matched" : "incompatible";
    const expectedGrain = crossSummaryGrainComparison(left.grain, right.grain, relationship.evaluatedCandidateType);
    const expectedAmount =
      relationship.evaluatedCandidateType === "component_rollup"
        ? "not_comparable"
        : !left.amount || !right.amount || left.amount.currency !== right.amount.currency
          ? "not_comparable"
          : left.amount.amountMinor === right.amount.amountMinor
            ? "corroborates"
            : "conflicts";
    if (
      relationship.comparison.measure !== expectedMeasure ||
      relationship.comparison.period !== expectedPeriod ||
      relationship.comparison.grain !== expectedGrain ||
      relationship.comparison.identifiers !== expectedIdentifiers ||
      relationship.comparison.amount !== expectedAmount
    ) {
      errors.push(`Cross-summary relationship ${relationship.id} comparison does not reconstruct from its endpoints.`);
    }
    if (relationship.status === "unknown" && relationship.relationshipType !== "unknown") {
      errors.push(`Unknown cross-summary relationship ${relationship.id} claims a proven relationship type.`);
    }
    if (relationship.status === "unknown") {
      if (relationship.adjudication?.outcome !== "remain_unknown" || relationship.adjudication?.reusableRuleId !== null) {
        errors.push(`Unknown cross-summary relationship ${relationship.id} has an inconsistent adjudication outcome.`);
      }
      if (!relationship.adjudication?.relationshipClass.startsWith("unresolved_")) {
        errors.push(`Unknown cross-summary relationship ${relationship.id} lacks an unresolved adjudication class.`);
      }
    }
    if (relationship.status === "proven") {
      if (relationship.relationshipType === "unknown") errors.push(`Proven cross-summary relationship ${relationship.id} has unknown type.`);
      if (
        relationship.adjudication?.outcome !== "resolved_by_reusable_rule" ||
        !relationship.adjudication?.reusableRuleId ||
        !relationship.adjudication?.relationshipClass.startsWith("resolved_")
      ) {
        errors.push(`Proven cross-summary relationship ${relationship.id} lacks a reusable adjudication rule.`);
      }
      if (
        relationship.comparison.measure !== "compatible" ||
        relationship.comparison.period !== "same_statement_period" ||
        relationship.comparison.grain !== "compatible" ||
        relationship.comparison.identifiers !== "matched" ||
        relationship.comparison.explicitLinkEvidence !== "present"
      ) {
        errors.push(`Proven cross-summary relationship ${relationship.id} lacks comparable measure, period, grain, identifiers, or explicit link evidence.`);
      }
      if (relationship.evaluatedCandidateType === "same_measure_same_population" && relationship.comparison.amount !== "corroborates") {
        errors.push(`Proven same-measure cross-summary relationship ${relationship.id} lacks amount corroboration.`);
      }
      if (!haveDistinctCrossSummaryEvidence(left.evidenceRefs, right.evidenceRefs, evidenceById)) {
        errors.push(`Proven cross-summary relationship ${relationship.id} does not reference distinct printed summaries.`);
      }
      const endpointEvidence = new Set([...left.evidenceRefs, ...right.evidenceRefs]);
      if (endpointEvidence.size === 0 || [...endpointEvidence].some((ref) => !relationship.evidenceRefs.includes(ref))) {
        errors.push(`Proven cross-summary relationship ${relationship.id} does not preserve all endpoint evidence.`);
      }
    }
  }
  const expectedStatus =
    layer.relationships.length === 0 && layer.feeRollups.length === 0
      ? "unavailable"
      : layer.relationships.every((relationship) => relationship.status === "proven") &&
          layer.feeRollups.every((rollup) => rollup.status !== "unresolved")
        ? "available"
        : "partial";
  if (layer.status !== expectedStatus) errors.push("Cross-summary link evidence status does not reconstruct from relationship results.");
}

function crossSummaryGrainComparison(
  left: CanonicalCrossSummaryLinkEvidence["nodes"][number]["grain"],
  right: CanonicalCrossSummaryLinkEvidence["nodes"][number]["grain"],
  candidateType: CanonicalCrossSummaryLinkEvidence["relationships"][number]["evaluatedCandidateType"],
): "compatible" | "incompatible" | "unknown" {
  if (left === "unknown" || right === "unknown") return "unknown";
  if (candidateType === "component_rollup") {
    return left === "fee_section_total" && right === "statement_period_total" ? "compatible" : "incompatible";
  }
  const supported = new Set(["statement_period_total", "funding_batch_period_total"]);
  return supported.has(left) && supported.has(right) ? "compatible" : "incompatible";
}

function validateCrossSummaryNodeSource(
  node: CanonicalCrossSummaryLinkEvidence["nodes"][number],
  analysis: CanonicalStatementAnalysis,
  errors: string[],
): void {
  if (node.sourceKind === "selected_financial_fact") {
    const facts = new Map<string, { value: MoneyAmount | null; measure: typeof node.measure }>([
      ["financialFacts.processedSales", { value: analysis.financialFacts.processedSales.value, measure: "submitted_amount" }],
      ["financialFacts.totalFees", { value: analysis.financialFacts.totalFees.value, measure: "fee_amount" }],
      ["financialFacts.amountFunded", { value: analysis.financialFacts.amountFunded.value, measure: "funded_amount" }],
    ]);
    const fact = facts.get(node.summaryRef);
    if (!fact || fact.measure !== node.measure || !sameNullableMoney(fact.value, node.amount)) {
      errors.push(`Cross-summary node ${node.id} does not reconstruct from its selected financial fact.`);
    }
  }
  if (node.sourceKind === "printed_fee_control") {
    const controlId = node.summaryRef.replace(/^feeLedger\.controls\./, "");
    const control = analysis.feeLedger.controls.find((item) => item.id === controlId);
    if (!control || node.measure !== "fee_amount" || !sameNullableMoney(control.expectedAmount, node.amount)) {
      errors.push(`Cross-summary node ${node.id} does not reconstruct from its printed fee control.`);
    }
  }
}

function haveDistinctCrossSummaryEvidence(
  leftRefs: string[],
  rightRefs: string[],
  evidenceById: Map<string, CanonicalStatementAnalysis["evidence"][number]>,
): boolean {
  const fingerprint = (ref: string) => {
    const evidence = evidenceById.get(ref);
    return evidence
      ? [evidence.documentId, evidence.pageNumber ?? "page_unknown", evidence.lineId ?? evidence.rowIndex ?? "row_unknown", evidence.normalizedText ?? ""].join("|")
      : "";
  };
  const left = new Set(leftRefs.map(fingerprint).filter(Boolean));
  const right = new Set(rightRefs.map(fingerprint).filter(Boolean));
  return left.size > 0 && right.size > 0 && [...left].some((item) => !right.has(item));
}

function sameNullableMoney(left: MoneyAmount | null, right: MoneyAmount | null): boolean {
  if (left === null || right === null) return left === right;
  return left.amountMinor === right.amountMinor && left.currency === right.currency;
}

function validateCanonicalCustomerState(
  analysis: CanonicalStatementAnalysis,
  evidenceIds: Set<string>,
  calculationIds: Set<string>,
  calculationsById: Map<string, CanonicalStatementAnalysis["calculations"][number]>,
  errors: string[],
): void {
  const state = analysis.customerState;
  if (!state || state.policyVersion !== CUSTOMER_STATE_POLICY_VERSION) {
    errors.push("Package G canonical customer state projection is missing or unsupported.");
    return;
  }
  if (state.materialityPolicyVersion !== CUSTOMER_STATE_MATERIALITY_POLICY_VERSION) errors.push("Package G materiality policy version is missing or unsupported.");
  if (state.benchmarkPolicyVersion !== CUSTOMER_BENCHMARK_POLICY_VERSION) errors.push("Package G benchmark policy version is missing or unsupported.");
  if (state.permissionPolicyVersion !== CUSTOMER_PERMISSIONS_POLICY_VERSION) errors.push("Package G permissions policy version is missing or unsupported.");
  if (state.visibilityPolicyVersion !== CUSTOMER_VISIBILITY_POLICY_VERSION) errors.push("Package G visibility policy version is missing or unsupported.");
  if (state.actionGuidancePolicyVersion !== CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION) errors.push("Package G action-guidance policy version is missing or unsupported.");
  if (state.wordingPolicyVersion !== CUSTOMER_WORDING_POLICY_VERSION) errors.push("Package G wording policy version is missing or unsupported.");
  if (!(CUSTOMER_PRIMARY_STATE_VALUES as readonly string[]).includes(state.primaryState)) errors.push(`Package G primary state ${String(state.primaryState)} is unsupported.`);

  const expected = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities: analysis.aiCapabilities,
    rateComparison: state.rateComparison,
  });
  if (JSON.stringify(state.axes) !== JSON.stringify(expected.axes)) errors.push("Package G axes do not reconstruct deterministically from canonical facts.");
  if (state.primaryState !== expected.primaryState) errors.push("Package G primary state does not reconstruct deterministically from canonical facts.");
  if (JSON.stringify(state.materiality) !== JSON.stringify(expected.materiality)) errors.push("Package G materiality does not reconstruct from canonical facts.");
  if (JSON.stringify(permissionMap(state.permissions)) !== JSON.stringify(permissionMap(expected.permissions))) {
    errors.push("Package G permissions do not reconstruct deterministically from canonical facts.");
  }
  if (JSON.stringify(state.visibility) !== JSON.stringify(expected.visibility)) errors.push("Package G visibility does not reconstruct from permissions and Package E summary.");
  if (JSON.stringify([...state.actionGuidance].sort((left, right) => left.id.localeCompare(right.id))) !== JSON.stringify([...expected.actionGuidance].sort((left, right) => left.id.localeCompare(right.id)))) {
    errors.push("Package G action guidance does not reconstruct from canonical support.");
  }
  for (const reasonCode of [...state.reasonCodes, ...state.permissions.flatMap((permission) => permission.reasonCodes), ...state.actionGuidance.flatMap((action) => action.reasonCodes)]) {
    if (!/^[a-z0-9_]+$/.test(reasonCode)) errors.push(`Package G reason code ${reasonCode} is malformed.`);
  }

  if (state.rateComparison.policyVersion !== CUSTOMER_BENCHMARK_POLICY_VERSION) errors.push("Package G rate comparison policy version is missing or unsupported.");
  if (state.rateComparison.status === "qualified") {
    if (state.rateComparison.position === "unavailable") errors.push("Package G qualified benchmark has unavailable rate position.");
    if (analysis.businessQualification.status !== "qualified") errors.push("Package 1 qualified benchmark requires qualified business context.");
    if (!state.rateComparison.benchmarkRef?.qualified || state.rateComparison.evidenceRefs.length === 0 || !state.rateComparison.calculationRef) {
      errors.push("Package G qualified benchmark requires reference, evidence, and calculation.");
    }
    if (
      !state.rateComparison.benchmarkRef?.referenceId ||
      state.rateComparison.benchmarkRef.referenceKind !== "ratereveal_reference_range" ||
      !/^RateReveal .+ reference range$/.test(state.rateComparison.benchmarkRef.displayLabel ?? "") ||
      !state.rateComparison.benchmarkRef.version ||
      !benchmarkAppliesToStatement(state.rateComparison.benchmarkRef, analysis)
    ) {
      errors.push("Package G qualified benchmark requires versioned, applicable benchmark reference metadata.");
    }
    if (
      !state.rateComparison.benchmarkRef?.range ||
      !state.rateComparison.benchmarkRef.segmentId ||
      !state.rateComparison.benchmarkRef.riskClass ||
      !state.rateComparison.benchmarkRef.channel ||
      !state.rateComparison.benchmarkRef.annualVolumeTier ||
      state.rateComparison.benchmarkRef.market !== "US" ||
      !state.rateComparison.benchmarkRef.sourceRecords ||
      state.rateComparison.benchmarkRef.sourceRecords.length < 1 ||
      !state.rateComparison.benchmarkRef.synthesis ||
      state.rateComparison.benchmarkRef.productApproval?.status !== "approved_for_merchant_display"
    ) {
      errors.push("Package 1 qualified benchmark requires an approved RateReveal reference, range, applicability, research provenance, and synthesis rationale.");
    }
    if (state.rateComparison.benchmarkRef?.opportunityApproved !== false) {
      errors.push("Package 1 benchmark references cannot approve savings or opportunity amounts.");
    }
    if (state.rateComparison.benchmarkRef?.aiSourced !== false || state.rateComparison.aiSourced !== false) {
      errors.push("Package G benchmark comparison must not be AI-sourced.");
    }
    const sourceRecords = state.rateComparison.benchmarkRef?.sourceRecords ?? [];
    if (
      new Set(sourceRecords.map((source) => source.sourceId)).size !== sourceRecords.length ||
      new Set(sourceRecords.map((source) => source.evidenceRef)).size !== sourceRecords.length ||
      sourceRecords.some(
        (source) =>
          !source.sourceId ||
          !source.title ||
          !source.publisher ||
          !source.documentId ||
          !source.independenceGroup ||
          !source.locator ||
          !source.locationWithinSource ||
          !source.accessedAt ||
          !source.reviewedAt ||
          !source.metricType ||
          !source.supportedObservation ||
          source.limitations.length < 1 ||
          !["network_schedule", "government_data", "industry_analysis", "processor_pricing", "legal_analysis"].includes(source.sourceType),
      )
    ) {
      errors.push("Package 1 qualified benchmark source provenance is incomplete or duplicated.");
    }
    if (state.rateComparison.benchmarkRef && !validMerchantBenchmarkSynthesis(state.rateComparison.benchmarkRef)) {
      errors.push("Package 1 qualified benchmark lacks an approved, traceable RateReveal synthesis.");
    }
    for (const source of sourceRecords) {
      const evidence = analysis.evidence.find((record) => record.id === source.evidenceRef);
      if (
        !evidence ||
        evidence.sourceRole !== "benchmark_reference" ||
        evidence.extractionObservations.length === 0 ||
        evidence.extractionObservations.some((observation) => observation.extractionMethod !== "reference_registry")
      ) {
        errors.push(`Package 1 benchmark source ${source.sourceId} lacks registry evidence.`);
      }
    }
    if (
      state.rateComparison.benchmarkRef &&
      JSON.stringify([...state.rateComparison.benchmarkRef.evidenceRefs].sort()) !== JSON.stringify(sourceRecords.map((source) => source.evidenceRef).sort())
    ) {
      errors.push("Package 1 benchmark reference evidence does not match its source records.");
    }
    for (const evidenceRef of [...state.rateComparison.evidenceRefs, ...(state.rateComparison.benchmarkRef?.evidenceRefs ?? [])]) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Package G benchmark evidence ref ${evidenceRef} is broken.`);
    }
    if (state.rateComparison.calculationRef && !calculationIds.has(state.rateComparison.calculationRef)) {
      errors.push(`Package G benchmark calculation ref ${state.rateComparison.calculationRef} is broken.`);
    }
    const benchmarkCalculation = state.rateComparison.calculationRef ? calculationsById.get(state.rateComparison.calculationRef) : null;
    if (!benchmarkCalculation || !validBenchmarkPositionCalculation(analysis, benchmarkCalculation)) {
      errors.push("Package 1 qualified benchmark position does not reconstruct from the verified rate and admitted range.");
    }
  } else {
    if (state.rateComparison.position !== "unavailable" || state.rateComparison.benchmarkRef !== null || state.rateComparison.calculationRef !== null) {
      errors.push("Package 1 non-qualified benchmark outcome must not expose a range, position, reference, or calculation.");
    }
    if (state.rateComparison.status === "confirmation_required" && analysis.businessQualification.confirmationRequirement === null) {
      errors.push("Package 1 confirmation-required comparison lacks a business confirmation requirement.");
    }
  }
  if ((state.primaryState === "competitive_no_opportunity" || state.primaryState === "competitive_with_opportunity") && (state.rateComparison.status !== "qualified" || (state.axes.ratePosition !== "within_reference" && state.axes.ratePosition !== "below_reference"))) {
    errors.push("Package G competitive state requires a qualified within/below benchmark.");
  }
  if ((state.primaryState === "rate_review_needed" || state.primaryState === "rate_review_with_opportunity") && (state.rateComparison.status !== "qualified" || state.axes.ratePosition !== "above_reference")) {
    errors.push("Package G rate-review state requires a qualified above-reference benchmark.");
  }
  if (state.primaryState === "material_fee_opportunity" && !state.materiality.material) errors.push("Package G material state fails materiality policy.");
  if (state.primaryState === "material_fee_opportunity" && state.axes.opportunityPosture === "verification_only") errors.push("Package G material state cannot come from verification-only components.");
  if (opportunityState(state.primaryState) && analysis.opportunityEngine.summary.totalEligibleAnnualAmount.amountMinor <= 0) {
    errors.push("Package G opportunity state has zero included eligible opportunity.");
  }
  if (state.primaryState === "competitive_no_opportunity" && analysis.opportunityEngine.summary.totalEligibleAnnualAmount.amountMinor > 0) {
    errors.push("Package G competitive-no-opportunity state hides an included actionable opportunity.");
  }
  if ((state.axes.analysisReadiness === "withheld" || state.axes.analysisReadiness === "unavailable" || state.axes.analysisReadiness === "limited") && state.visibility.visibleEligibleAnnualAmount.amountMinor !== 0) {
    errors.push("Package G withheld, unavailable, or limited analysis exposes eligible totals.");
  }
  if (state.axes.ratePosition === "unavailable" && state.visibility.showBenchmark) errors.push("Package G benchmark-unavailable projection exposes benchmark conclusions.");
  if (state.axes.ratePosition === "unavailable" && /competitive/.test(state.primaryState)) errors.push("Package G benchmark-unavailable projection is labeled competitive.");
  if (state.axes.opportunityPosture === "verification_only" && state.visibility.visibleEligibleAnnualAmount.amountMinor !== 0) {
    errors.push("Package G verification-only posture exposes savings.");
  }
  if (state.visibility.visibleDeterministicAnnualAmount.amountMinor !== (state.visibility.showDeterministicOpportunity ? analysis.opportunityEngine.summary.deterministicEligibleAnnualAmount.amountMinor : 0)) {
    errors.push("Package G deterministic visible total does not match permission ceiling.");
  }
  if (state.visibility.visibleApprovedEstimatedAnnualAmount.amountMinor !== (state.visibility.showEstimatedOpportunity ? analysis.opportunityEngine.summary.approvedEstimatedAnnualAmount.amountMinor : 0)) {
    errors.push("Package G estimated visible total does not match permission ceiling.");
  }

  const feeRowIds = new Set(analysis.feeLedger.rows.map((row) => row.id));
  const componentIds = new Set(analysis.opportunityEngine.components.map((component) => component.id));
  const selectedClassificationIds = new Set(analysis.feeOwnershipActionability.rowClassifications.map((classification) => classification.selected.candidateId));
  const actionIds = new Set<string>();
  const actionKeys = new Set<string>();
  for (const action of state.actionGuidance) {
    if (actionIds.has(action.id)) errors.push(`Package G duplicate action id ${action.id}.`);
    actionIds.add(action.id);
    const actionKey = `${action.actionType}:${[...action.feeRowRefs].sort().join(",")}:${[...action.opportunityComponentRefs, ...action.verificationComponentRefs].sort().join(",")}`;
    if (actionKeys.has(actionKey)) errors.push(`Package G duplicate or contradictory action ${action.id}.`);
    actionKeys.add(actionKey);
    if (action.policyVersion !== CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION) errors.push(`Package G action ${action.id} has unsupported policy version.`);
    if (!(CUSTOMER_ACTION_TYPES as readonly string[]).includes(action.actionType)) errors.push(`Package G action ${action.id} has unsupported action type.`);
    if (action.feeRowRefs.length === 0 || action.classificationCandidateRefs.length === 0 || action.evidenceRefs.length === 0 || action.reasonCodes.length === 0) {
      errors.push(`Package G action ${action.id} lacks required canonical support.`);
    }
    for (const feeRowRef of action.feeRowRefs) {
      if (!feeRowIds.has(feeRowRef)) errors.push(`Package G action ${action.id} references missing fee row ${feeRowRef}.`);
    }
    for (const classificationRef of action.classificationCandidateRefs) {
      if (!selectedClassificationIds.has(classificationRef)) errors.push(`Package G action ${action.id} references missing Package D classification ${classificationRef}.`);
    }
    for (const componentRef of [...action.opportunityComponentRefs, ...action.verificationComponentRefs]) {
      if (!componentIds.has(componentRef)) errors.push(`Package G action ${action.id} references missing Package E component ${componentRef}.`);
    }
    for (const evidenceRef of action.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`Package G action ${action.id} evidence ref ${evidenceRef} is broken.`);
    }
    for (const calculationRef of action.calculationRefs) {
      if (!calculationIds.has(calculationRef)) errors.push(`Package G action ${action.id} calculation ref ${calculationRef} is broken.`);
    }
    if ((action.actionType === "request_removal" || action.actionType === "request_repricing") && action.opportunityComponentRefs.length === 0) {
      errors.push(`Package G action ${action.id} lacks strong eligible component support.`);
    }
  }

  if (state.explanation.source !== expected.explanation.source) errors.push("Package G explanation source does not match deterministic fallback/AI-safety policy.");
  if (state.explanation.source !== "unavailable" && state.explanation.sections.length === 0) errors.push("Package G customer explanation is missing.");
  if (state.explanation.source === "ai_enhanced") {
    const contradictionErrors = customerNarrativeContradictions(state.explanation.sections.map((section) => section.text), {
      axes: state.axes,
      primaryState: state.primaryState,
      visibility: state.visibility,
      benchmarkUnavailable: state.rateComparison.status === "unavailable",
    });
    if (contradictionErrors.length > 0) errors.push("Package G AI narrative contradicts deterministic projection.");
  }
  if (containsUnsafeCustomerText(state.explanation.sections.map((section) => section.text).join(" "))) {
    errors.push("Package G customer explanation contains prohibited language.");
  }
  if (containsAiSourcedCustomerAuthority(state)) errors.push("Package G contains AI-sourced observed amounts, targets, cadence, ownership, calculations, state, permissions, visibility, or actions.");
}

function validBenchmarkPositionCalculation(
  analysis: CanonicalStatementAnalysis,
  calculation: CanonicalStatementAnalysis["calculations"][number],
): boolean {
  const comparison = analysis.customerState.rateComparison;
  const reference = comparison.benchmarkRef;
  const rate = analysis.financialFacts.rateRevealCalculatedAllInRate.value;
  if (!reference?.range || rate === null) return false;
  if (
    calculation.formulaCode !== "benchmark_rate_position" ||
    calculation.formulaVersion !== CUSTOMER_BENCHMARK_POLICY_VERSION ||
    calculation.unit !== "decimal_rate" ||
    calculation.roundingPolicy !== "decimal_rate_6_places_v1" ||
    calculation.result !== rate
  ) {
    return false;
  }
  const inputs = new Map(calculation.inputs.map((input) => [input.label, input]));
  if (
    inputs.get("Verified effective rate")?.value !== rate ||
    inputs.get("Reference range lower boundary")?.value !== reference.range.low ||
    inputs.get("Reference range upper boundary")?.value !== reference.range.high ||
    [...inputs.values()].some((input) => input.unit !== "decimal_rate")
  ) {
    return false;
  }
  const numericRate = Number(rate);
  const low = Number(reference.range.low);
  const high = Number(reference.range.high);
  if (![numericRate, low, high].every(Number.isFinite) || low <= 0 || high <= low) return false;
  const expectedPosition = numericRate < low ? "below_reference" : numericRate <= high ? "within_reference" : "above_reference";
  return comparison.position === expectedPosition;
}

function validMerchantBenchmarkSynthesis(
  reference: NonNullable<CanonicalStatementAnalysis["customerState"]["rateComparison"]["benchmarkRef"]>,
): boolean {
  const sources = reference.sourceRecords ?? [];
  const synthesis = reference.synthesis;
  const approval = reference.productApproval;
  if (
    !reference.range ||
    !synthesis ||
    synthesis.methodVersion !== "ratereveal_market_informed_synthesis_v1" ||
    !approval ||
    approval.status !== "approved_for_merchant_display" ||
    !validIsoDate(approval.approvedAt) ||
    !approval.decisionRef
  ) return false;
  if (
    synthesis.evidenceSummary.length < 80 ||
    synthesis.rateRevealRationale.length < 80 ||
    synthesis.assumptions.length < 2 ||
    synthesis.limitations.length < 2 ||
    !validIsoDate(synthesis.reviewedAt) ||
    !validIsoDate(synthesis.reviewBy) ||
    synthesis.reviewBy < synthesis.reviewedAt
  ) return false;
  if (sources.length < 1 || new Set(sources.map((source) => source.sourceId)).size !== sources.length) return false;
  for (const source of sources) {
    if (
      !source.documentId ||
      !source.independenceGroup ||
      !singlePublisherName(source.publisher) ||
      !source.locationWithinSource ||
      !directHttpsUrl(source.locator) ||
      (source.publishedAt !== null && !validIsoDate(source.publishedAt)) ||
      !validIsoDate(source.accessedAt) ||
      !validIsoDate(source.reviewedAt) ||
      !source.metricType ||
      !source.supportedObservation ||
      !["high", "medium", "low"].includes(source.sourceQuality) ||
      source.limitations.length < 1
    ) {
      return false;
    }
    if (
      source.quantitativeValues.some(
        (metric) =>
          !metric.metricId ||
          !metric.label ||
          !validDecimal6(metric.value) ||
          metric.unit !== "decimal_rate" ||
          !metric.locationWithinSource,
      )
    ) {
      return false;
    }
  }
  return true;
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validDecimal6(value: string): boolean {
  return /^\d+\.\d{6}$/.test(value) && Number.isFinite(Number(value));
}

function directHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function singlePublisherName(value: string): boolean {
  return value.trim().length > 0 && !/[,&;]|\band\b|\//i.test(value);
}

function benchmarkAppliesToStatement(
  benchmarkRef: NonNullable<CanonicalStatementAnalysis["customerState"]["rateComparison"]["benchmarkRef"]>,
  analysis: CanonicalStatementAnalysis,
): boolean {
  const period = analysis.identity.statementPeriod.value;
  if (!period) return false;
  if (benchmarkRef.effectiveFrom && period.start < benchmarkRef.effectiveFrom) return false;
  if (benchmarkRef.effectiveTo && period.end > benchmarkRef.effectiveTo) return false;
  const qualification = analysis.businessQualification;
  if (qualification.status !== "qualified") return false;
  if (benchmarkRef.applicableProcessor && benchmarkRef.applicableProcessor !== "unknown" && benchmarkRef.applicableProcessor.toLowerCase() !== qualification.processorFamily.value) return false;
  if (benchmarkRef.applicableBusinessType && benchmarkRef.applicableBusinessType !== "unknown" && benchmarkRef.applicableBusinessType !== qualification.resolvedSegmentId) return false;
  if (benchmarkRef.applicableChannel && benchmarkRef.applicableChannel !== "unknown" && benchmarkRef.applicableChannel !== qualification.channel.value) return false;
  if (benchmarkRef.segmentId && benchmarkRef.segmentId !== qualification.resolvedSegmentId) return false;
  if (benchmarkRef.riskClass && benchmarkRef.riskClass !== qualification.risk.value) return false;
  if (benchmarkRef.channel && benchmarkRef.channel !== qualification.channel.value) return false;
  if (benchmarkRef.annualVolumeTier && benchmarkRef.annualVolumeTier !== qualification.annualVolume.tier) return false;
  if (benchmarkRef.market && benchmarkRef.market !== qualification.market.value) return false;
  if (benchmarkRef.applicableCardEnvironment && benchmarkRef.applicableCardEnvironment !== "unknown") return false;
  return true;
}

function permissionMap(permissions: CanonicalStatementAnalysis["customerState"]["permissions"]): Record<CanonicalCustomerPermissionKey, boolean> {
  return Object.fromEntries(permissions.map((permission) => [permission.key, permission.permitted])) as Record<CanonicalCustomerPermissionKey, boolean>;
}

function opportunityState(state: CanonicalStatementAnalysis["customerState"]["primaryState"]): boolean {
  return state === "competitive_with_opportunity" || state === "rate_review_with_opportunity" || state === "fee_opportunity_identified" || state === "material_fee_opportunity";
}

function containsUnsafeCustomerText(text: string): boolean {
  return /\bripped off\b|\bcheat(?:ed|ing)?\b|\bguarantee(?:d)?\b|\boverpaying\b|\byou can definitely remove\b|\bprocessor is cheating\b/i.test(text);
}

function containsAiSourcedCustomerAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsAiSourcedCustomerAuthority);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "aiSourced" && nested !== false) return true;
    if (containsAiSourcedCustomerAuthority(nested)) return true;
  }
  return false;
}

function validateOpportunityEngine(
  analysis: CanonicalStatementAnalysis,
  evidenceIds: Set<string>,
  calculationIds: Set<string>,
  calculationsById: Map<string, CanonicalStatementAnalysis["calculations"][number]>,
  errors: string[],
): void {
  const engine = analysis.opportunityEngine;
  if (!engine || engine.policyVersion !== "canonical_opportunity_engine_v1") {
    errors.push("Package E canonical opportunity engine is missing or unsupported.");
    return;
  }
  if (engine.targetPolicyVersion !== "opportunity_target_policy_v1") errors.push("Package E target policy version is missing or unsupported.");
  if (engine.cadencePolicyVersion !== "opportunity_cadence_policy_v1") errors.push("Package E cadence policy version is missing or unsupported.");
  if (engine.benchmarkPolicyVersion !== "opportunity_benchmark_policy_v1") errors.push("Package E benchmark policy version is missing or unsupported.");
  if (engine.aiBoundaryPolicyVersion !== "opportunity_ai_boundary_policy_v1") errors.push("Package E AI boundary policy version is missing or unsupported.");

  const feeRowIds = new Set(analysis.feeLedger.rows.map((row) => row.id));
  const classificationByFeeRowId = new Map(analysis.feeOwnershipActionability.rowClassifications.map((classification) => [classification.feeRowId, classification]));
  const componentIds = new Set(engine.components.map((component) => component.id));
  if (componentIds.size !== engine.components.length) errors.push("Package E contains duplicate component ids.");

  const includedFeeRows = new Map<string, string>();
  for (const component of engine.components) {
    validateOpportunityComponent(component, { analysis, evidenceIds, calculationIds, calculationsById, feeRowIds, classificationByFeeRowId, componentIds, includedFeeRows, errors });
  }

  const graphErrors = supersessionGraphErrors(engine.components);
  errors.push(...graphErrors);

  const expectedSummary = aggregateCanonicalOpportunityComponents(engine.components);
  compareMoney("Package E deterministic summary", engine.summary.deterministicEligibleAnnualAmount, expectedSummary.deterministicEligibleAnnualAmount, errors);
  compareMoney("Package E estimated summary", engine.summary.approvedEstimatedAnnualAmount, expectedSummary.approvedEstimatedAnnualAmount, errors);
  compareMoney("Package E total eligible summary", engine.summary.totalEligibleAnnualAmount, expectedSummary.totalEligibleAnnualAmount, errors);
  compareMoney("Package E master savings summary", engine.summary.masterSavingsAnnualAmount, expectedSummary.masterSavingsAnnualAmount, errors);
  compareMoney("Package E verification-only summary", engine.summary.verificationOnlyObservedAmount, expectedSummary.verificationOnlyObservedAmount, errors);
  compareMoney("Package E excluded summary", engine.summary.excludedObservedAmount, expectedSummary.excludedObservedAmount, errors);
  compareMoney("Package E non-annualized summary", engine.summary.nonAnnualizedObservedAmount, expectedSummary.nonAnnualizedObservedAmount, errors);
}

function validateOpportunityComponent(
  component: CanonicalOpportunityComponent,
  context: {
    analysis: CanonicalStatementAnalysis;
    evidenceIds: Set<string>;
    calculationIds: Set<string>;
    calculationsById: Map<string, CanonicalStatementAnalysis["calculations"][number]>;
    feeRowIds: Set<string>;
    classificationByFeeRowId: Map<string, CanonicalStatementAnalysis["feeOwnershipActionability"]["rowClassifications"][number]>;
    componentIds: Set<string>;
    includedFeeRows: Map<string, string>;
    errors: string[];
  },
): void {
  if (component.policyVersion !== "canonical_opportunity_engine_v1") context.errors.push(`Package E component ${component.id} has unsupported policy version.`);
  if ((component.eligibility === "verification_only" || component.eligibility === "excluded") && component.inclusionStatus === "included") {
    context.errors.push(`Package E component ${component.id} is included with ${component.eligibility} eligibility.`);
  }
  if ((component.eligibility === "deterministic" || component.eligibility === "approved_estimate") && component.inclusionStatus === "included") {
    if (!component.cadence.annualizationAllowed || component.cadence.value === "unknown" || component.cadence.value === "one_time") {
      context.errors.push(`Package E component ${component.id} is included with non-annualizable cadence ${component.cadence.value}.`);
    }
    if (!component.cadence.proven || component.cadence.frequencyPerYear === null || component.cadence.frequencyPerYear <= 0) {
      context.errors.push(`Package E component ${component.id} is included without proven recurring cadence frequency.`);
    }
    if (component.cadence.value === "statement_frequency" && component.cadence.frequencyPerYear === null) {
      context.errors.push(`Package E component ${component.id} annualizes statement-frequency cadence without frequency proof.`);
    }
    if (!component.calculation.calculationRef || !context.calculationIds.has(component.calculation.calculationRef)) {
      context.errors.push(`Package E component ${component.id} is included without a valid calculationRef.`);
    }
    if (!component.calculation.result || component.calculation.result.amountMinor <= 0) {
      context.errors.push(`Package E component ${component.id} is included without a positive calculation result.`);
    }
  }
  if (component.eligibility === "deterministic" && !targetSupportsDeterministic(component.targetProvenance, component.target)) {
    context.errors.push(`Package E deterministic component ${component.id} lacks authoritative target evidence.`);
  }
  if (component.eligibility === "approved_estimate" && !targetSupportsApprovedEstimate(component.targetProvenance, component.target)) {
    context.errors.push(`Package E approved estimate component ${component.id} lacks a versioned approved model or reference.`);
  }
  if ((component.eligibility === "deterministic" || component.eligibility === "approved_estimate") && !targetAppliesToStatement(component, context.analysis)) {
    context.errors.push(`Package E component ${component.id} target reference is not applicable to this statement context or period.`);
  }
  if (component.kind === "benchmark_concern" && component.eligibility === "deterministic") {
    context.errors.push(`Package E benchmark component ${component.id} cannot be deterministic.`);
  }
  if (
    component.kind === "hidden_processor_spread" &&
    component.eligibility === "deterministic" &&
    !component.feeRowRefs.some((ref) =>
      context.analysis.feeOwnershipActionability.spreadAssertions.some(
        (spread) => spread.baseFeeRowId === ref.feeRowId && spread.status === "proven" && spread.authoritative,
      ),
    )
  ) {
    context.errors.push(`Package E deterministic hidden spread component ${component.id} requires a Package D proven spread.`);
  }
  if (/master.*savings/i.test(component.id)) {
    context.errors.push(`Package E master savings must not appear as component ${component.id}.`);
  }

  const refsInComponent = new Set<string>();
  for (const ref of component.feeRowRefs) {
    if (!context.feeRowIds.has(ref.feeRowId)) context.errors.push(`Package E component ${component.id} references missing fee row ${ref.feeRowId}.`);
    if (refsInComponent.has(ref.feeRowId)) context.errors.push(`Package E component ${component.id} duplicates fee row ref ${ref.feeRowId}.`);
    refsInComponent.add(ref.feeRowId);
    const classification = context.classificationByFeeRowId.get(ref.feeRowId);
    const feeRow = context.analysis.feeLedger.rows.find((row) => row.id === ref.feeRowId);
    if (!classification) {
      context.errors.push(`Package E component ${component.id} references fee row ${ref.feeRowId} without Package D classification.`);
    } else if (classification.selected.candidateId !== ref.classificationCandidateId) {
      context.errors.push(`Package E component ${component.id} does not reference the selected Package D candidate for fee row ${ref.feeRowId}.`);
    }
    if (
      component.inclusionStatus === "included" &&
      (component.eligibility === "deterministic" || component.eligibility === "approved_estimate") &&
      feeRow?.contributionDecision?.reasonCode === "pass_through_fee_charge_included"
    ) {
      context.errors.push(`Package E component ${component.id} uses pass-through fee row ${ref.feeRowId} for eligible opportunity.`);
    }
    if (component.inclusionStatus === "included") {
      const existing = context.includedFeeRows.get(ref.feeRowId);
      if (existing && component.overlap.resolution === "none") {
        context.errors.push(`Package E included component ${component.id} duplicates fee row ${ref.feeRowId} already used by ${existing} without overlap resolution.`);
      }
      context.includedFeeRows.set(ref.feeRowId, component.id);
    }
  }

  for (const evidenceRef of [...component.evidenceRefs, ...component.cadence.evidenceRefs, ...component.targetProvenance.evidenceRefs, ...component.calculation.evidenceRefs]) {
    if (!context.evidenceIds.has(evidenceRef)) context.errors.push(`Package E component ${component.id} evidence ref ${evidenceRef} is broken.`);
  }
  if (component.observedAmount) {
    if (!isMoneyAmount(component.observedAmount.amount)) context.errors.push(`Package E component ${component.id} has invalid observed amount.`);
    for (const evidenceRef of component.observedAmount.evidenceRefs) {
      if (!context.evidenceIds.has(evidenceRef)) context.errors.push(`Package E component ${component.id} observed amount evidence ref ${evidenceRef} is broken.`);
    }
  }
  validateCalculationReconstruction(component, context.calculationsById, context.errors);
  if (component.target.type === "zero_removal") {
    if ((component.eligibility === "deterministic" || component.eligibility === "approved_estimate") && component.target.proofEvidenceRefs.length === 0) {
      context.errors.push(`Package E component ${component.id} zero-removal proof evidence is missing.`);
    }
    for (const evidenceRef of component.target.proofEvidenceRefs) {
      if (!context.evidenceIds.has(evidenceRef)) context.errors.push(`Package E component ${component.id} zero-removal proof evidence ref ${evidenceRef} is broken.`);
    }
  }
  validateTargetUnits(component, context.errors);
  validateTargetCurrencyAndPopulation(component, context.errors);
  validateAiBoundary(component, context.errors);
}

function targetAppliesToStatement(component: CanonicalOpportunityComponent, analysis: CanonicalStatementAnalysis): boolean {
  const provenance = component.targetProvenance;
  const periodStart = analysis.identity.statementPeriod.value?.start ?? null;
  if (!periodStart) return false;
  if (provenance.effectiveFrom && periodStart < provenance.effectiveFrom) return false;
  if (provenance.effectiveTo && periodStart > provenance.effectiveTo) return false;
  const processor = String(analysis.identity.processorFamily.value ?? analysis.identity.processorName.value ?? "unknown").toLowerCase();
  const businessType = String(analysis.identity.businessType.value ?? "unknown").toLowerCase();
  if (provenance.applicableProcessor && provenance.applicableProcessor !== "unknown" && provenance.applicableProcessor.toLowerCase() !== processor) return false;
  if (provenance.applicableBusinessType && provenance.applicableBusinessType !== "unknown" && provenance.applicableBusinessType.toLowerCase() !== businessType) return false;
  if (provenance.applicableChannel && provenance.applicableChannel !== "unknown") return false;
  if (provenance.applicableCardEnvironment && provenance.applicableCardEnvironment !== "unknown") return false;
  return true;
}

function validateTargetCurrencyAndPopulation(component: CanonicalOpportunityComponent, errors: string[]): void {
  const target = component.target;
  const targetMoney =
    target.type === "monetary" || target.type === "per_item" || target.type === "model_monetary" || target.type === "model_per_item"
      ? target.amount
      : null;
  if (targetMoney && !isMoneyAmount(targetMoney)) errors.push(`Package E component ${component.id} target contains unsupported or invalid currency.`);
  if (targetMoney && component.observedAmount && targetMoney.currency !== component.observedAmount.amount.currency) {
    errors.push(`Package E component ${component.id} mixes currencies without conversion authority.`);
  }
  if ((target.type === "per_item" || target.type === "model_per_item" || target.type === "rate" || target.type === "model_rate") && !component.calculation.inputRefs.includes(target.populationRef)) {
    errors.push(`Package E component ${component.id} target population is not linked to calculation inputs.`);
  }
}

function validateCalculationReconstruction(
  component: CanonicalOpportunityComponent,
  calculationsById: Map<string, CanonicalStatementAnalysis["calculations"][number]>,
  errors: string[],
): void {
  const ref = component.calculation.calculationRef;
  if (!ref) return;
  const calculation = calculationsById.get(ref);
  if (!calculation) return;
  if (calculation.formulaCode !== component.calculation.formulaCode) errors.push(`Package E component ${component.id} calculation formula does not match canonical calculation record.`);
  if (calculation.unit !== "money" || !isMoneyAmount(calculation.result)) errors.push(`Package E component ${component.id} calculation record does not return canonical money.`);
  if (isMoneyAmount(calculation.result) && component.calculation.result && calculation.result.amountMinor !== component.calculation.result.amountMinor) {
    errors.push(`Package E component ${component.id} calculation result does not match canonical calculation record.`);
  }
  for (const input of calculation.inputs) {
    if (input.unit === "money" && input.value !== null && !isMoneyAmount(input.value)) errors.push(`Package E component ${component.id} calculation input ${input.label} has invalid money.`);
  }
  const reconstructed = reconstructComponentResult(component, calculation);
  if (reconstructed && component.calculation.result && reconstructed.amountMinor !== component.calculation.result.amountMinor) {
    errors.push(`Package E component ${component.id} calculation does not reconstruct exactly in integer cents.`);
  }
}

function reconstructComponentResult(
  component: CanonicalOpportunityComponent,
  calculation: CanonicalStatementAnalysis["calculations"][number],
): MoneyAmount | null {
  if (!component.observedAmount || !component.calculation.annualized) return null;
  const observed = component.observedAmount.amount;
  const target = component.target;
  if (target.type === "monetary") {
    const delta = observed.amountMinor - target.amount.amountMinor;
    if (target.unit === "monthly_charge" && component.cadence.frequencyPerYear !== null) return { amountMinor: delta * component.cadence.frequencyPerYear, currency: observed.currency };
    if (target.unit === "annual_charge") return { amountMinor: delta, currency: observed.currency };
    if (target.unit === "statement_charge" && component.cadence.frequencyPerYear !== null) return { amountMinor: delta * component.cadence.frequencyPerYear, currency: observed.currency };
  }
  if (target.type === "zero_removal" && component.cadence.frequencyPerYear !== null) {
    return { amountMinor: observed.amountMinor * component.cadence.frequencyPerYear, currency: observed.currency };
  }
  if (target.type === "model_monetary") {
    if (target.unit === "annual_amount") return target.amount;
    if ((target.unit === "monthly_amount" || target.unit === "statement_amount") && component.cadence.frequencyPerYear !== null) {
      return { amountMinor: target.amount.amountMinor * component.cadence.frequencyPerYear, currency: target.amount.currency };
    }
  }
  if (target.type === "per_item" || target.type === "model_per_item") {
    const count = calculation.inputs.find((input) => input.unit === "count" && typeof input.value === "number")?.value as number | undefined;
    if (count !== undefined && component.cadence.frequencyPerYear !== null) {
      const targetMinor = target.amount.amountMinor * count;
      return { amountMinor: (observed.amountMinor - targetMinor) * component.cadence.frequencyPerYear, currency: observed.currency };
    }
  }
  return null;
}

function validateTargetUnits(component: CanonicalOpportunityComponent, errors: string[]): void {
  const target = component.target as any;
  if (target.type === "rate" || target.type === "model_rate") {
    if (!["percent_points", "decimal_fraction", "basis_points"].includes(target.representation)) {
      errors.push(`Package E component ${component.id} has ambiguous rate representation.`);
    }
    if (typeof target.populationRef !== "string" || target.populationRef.trim().length === 0) {
      errors.push(`Package E component ${component.id} has a rate target without population reference.`);
    }
  }
  if (target.type === "per_item" || target.type === "model_per_item") {
    if (!["per_authorization", "per_transaction", "per_item"].includes(target.unit)) {
      errors.push(`Package E component ${component.id} has ambiguous per-item unit.`);
    }
    if (typeof target.populationRef !== "string" || target.populationRef.trim().length === 0) {
      errors.push(`Package E component ${component.id} has a per-item target without population reference.`);
    }
  }
  if (target.type === "model_monetary" && !["monthly_amount", "annual_amount", "statement_amount"].includes(target.unit)) {
    errors.push(`Package E component ${component.id} has ambiguous model monetary unit.`);
  }
  if (target.type === "monetary" && !["monthly_charge", "annual_charge", "statement_charge"].includes(target.unit)) {
    errors.push(`Package E component ${component.id} has ambiguous monetary unit.`);
  }
}

function validateAiBoundary(component: CanonicalOpportunityComponent, errors: string[]): void {
  const fields = [
    ["observed amount", component.observedAmount?.aiSourced],
    ["target", (component.target as any).aiSourced],
    ["target provenance", component.targetProvenance.aiSourced],
    ["cadence", component.cadence.aiSourced],
    ["calculation", component.calculation.aiSourced],
  ];
  for (const [label, aiSourced] of fields) {
    if (aiSourced !== false) errors.push(`Package E component ${component.id} has AI-sourced ${label}.`);
  }
}

function supersessionGraphErrors(components: CanonicalOpportunityComponent[]): string[] {
  const errors: string[] = [];
  const ids = new Set(components.map((component) => component.id));
  const byId = new Map(components.map((component) => [component.id, component]));
  const edges = new Map<string, string[]>();
  for (const component of components) {
    const children = [...new Set(component.overlap.supersedesComponentIds)];
    for (const child of children) {
      if (!ids.has(child)) errors.push(`Package E component ${component.id} supersedes missing component ${child}.`);
      if (child === component.id) errors.push(`Package E component ${component.id} supersedes itself.`);
      const childComponent = byId.get(child);
      if (childComponent && (childComponent.inclusionStatus !== "superseded" || childComponent.overlap.supersededByComponentId !== component.id)) {
        errors.push(`Package E component ${component.id} has contradictory supersession relationship with ${child}.`);
      }
    }
    if (component.overlap.supersededByComponentId !== null && !ids.has(component.overlap.supersededByComponentId)) {
      errors.push(`Package E component ${component.id} is superseded by missing component ${component.overlap.supersededByComponentId}.`);
    }
    edges.set(component.id, children);
  }
  for (const node of circularNodes(edges)) {
    errors.push(`Package E supersession graph contains circular relationship at ${node}.`);
  }
  return errors;
}

function circularNodes(edges: Map<string, string[]>): Set<string> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const circular = new Set<string>();
  function visit(node: string): void {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      for (const cycleNode of stack.slice(index)) circular.add(cycleNode);
      circular.add(node);
      return;
    }
    visiting.add(node);
    stack.push(node);
    for (const child of edges.get(node) ?? []) visit(child);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of edges.keys()) visit(node);
  return circular;
}

function compareMoney(label: string, actual: MoneyAmount, expected: MoneyAmount, errors: string[]): void {
  if (!isMoneyAmount(actual) || actual.amountMinor !== expected.amountMinor || actual.currency !== expected.currency) {
    errors.push(`${label} does not reconstruct from included Package E components.`);
  }
}

function blocksPotentialActionability(owner: string): boolean {
  return owner === "network" || owner === "card_brand" || owner === "issuer_or_interchange" || owner === "tax_or_government" || owner === "unknown";
}

function findForbiddenPackageDFieldPath(value: unknown, path = "feeOwnershipActionability"): string | null {
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = `${path}.${key}`;
    if (/savings|opportunity|annual|benchmark|amountUsd|amountMinor|financialImpact/i.test(key)) return nestedPath;
    if (Array.isArray(nested)) {
      for (let index = 0; index < nested.length; index += 1) {
        const found = findForbiddenPackageDFieldPath(nested[index], `${nestedPath}[${index}]`);
        if (found) return found;
      }
      continue;
    }
    const found = findForbiddenPackageDFieldPath(nested, nestedPath);
    if (found) return found;
  }
  return null;
}

function visitFactValues(
  analysis: CanonicalStatementAnalysis,
  visitor: (
    path: string,
    value: {
      value: unknown;
      status: string;
      evidenceRefs: string[];
      calculationRef?: string;
      selectedCandidateId?: string;
      candidates: any[];
    },
  ) => void,
): void {
  for (const [key, value] of Object.entries(analysis.identity)) {
    if (key === "sourceDocumentRef") continue;
    visitor(`identity.${key}`, value as any);
  }
  for (const [key, value] of Object.entries(analysis.financialFacts)) {
    if (key === "transactionCounts") {
      for (const [countKey, countValue] of Object.entries(analysis.financialFacts.transactionCounts)) {
        visitor(`financialFacts.transactionCounts.${countKey}`, countValue as any);
      }
      continue;
    }
    if (key === "averageTicketBasis" || key === "effectiveRateBasis") continue;
    visitor(`financialFacts.${key}`, value as any);
  }
}
