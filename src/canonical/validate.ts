import { isMoneyAmount } from "./money.js";
import { aggregateCanonicalOpportunityComponents } from "./opportunityEngine.js";
import { targetSupportsApprovedEstimate, targetSupportsDeterministic } from "./opportunityPolicy.js";
import type { CanonicalOpportunityComponent, CanonicalStatementAnalysis, MoneyAmount } from "./types.js";

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
    for (const interpretation of analysis.feeLedger.parserInterpretations) {
      if (!occurrenceIds.has(interpretation.sourceOccurrenceId)) {
        errors.push(`Fee parser interpretation ${interpretation.id} source occurrence ref ${interpretation.sourceOccurrenceId} is broken.`);
      }
      if (interpretation.printedRate?.representation === "unknown" && interpretation.printedRate.normalizedFractionalRate !== null) {
        errors.push(`Fee parser interpretation ${interpretation.id} has unknown rate representation with normalized value.`);
      }
    }
    for (const row of analysis.feeLedger.rows) {
      for (const occurrenceId of row.sourceOccurrenceIds) {
        if (!occurrenceIds.has(occurrenceId)) errors.push(`Fee row ${row.id} source occurrence ref ${occurrenceId} is broken.`);
      }
      for (const interpretationId of row.parserInterpretationIds) {
        if (!interpretationIds.has(interpretationId)) errors.push(`Fee row ${row.id} parser interpretation ref ${interpretationId} is broken.`);
      }
      if (row.contributesToUniqueTotal && row.signedAmount === null) errors.push(`Fee row ${row.id} contributes to total without signed amount.`);
      if (!row.contributesToUniqueTotal && row.role === "individual_charge" && row.signedAmount?.amountMinor !== 0) {
        warnings.push(`Fee row ${row.id} is an individual charge that does not contribute to unique total.`);
      }
    }
    for (const control of analysis.feeLedger.controls) {
      for (const evidenceRef of control.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`Fee ledger control ${control.id} evidence ref ${evidenceRef} is broken.`);
      }
      if (control.expectedAmount && !isMoneyAmount(control.expectedAmount)) errors.push(`Fee ledger control ${control.id} has invalid expected amount.`);
      if (control.actualAmount && !isMoneyAmount(control.actualAmount)) errors.push(`Fee ledger control ${control.id} has invalid actual amount.`);
    }
    if (analysis.feeLedger.uniqueChargeCalculationRef && !calculationIds.has(analysis.feeLedger.uniqueChargeCalculationRef)) {
      errors.push(`Fee ledger calculation ref ${analysis.feeLedger.uniqueChargeCalculationRef} is broken.`);
    }
  }
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

  const validated: CanonicalStatementAnalysis = {
    ...analysis,
    validation: {
      status: errors.length > 0 ? "invalid" : warnings.length > 0 ? "valid_with_warnings" : "valid",
      errors,
      warnings,
    },
  };
  if (errors.length > 0) {
    throw new Error(`Canonical statement analysis validation failed: ${errors.join(" ")}`);
  }
  return validated;
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
    if (!classification) {
      context.errors.push(`Package E component ${component.id} references fee row ${ref.feeRowId} without Package D classification.`);
    } else if (classification.selected.candidateId !== ref.classificationCandidateId) {
      context.errors.push(`Package E component ${component.id} does not reference the selected Package D candidate for fee row ${ref.feeRowId}.`);
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
