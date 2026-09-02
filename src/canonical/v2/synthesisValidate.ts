import type {
  CanonicalEconomicsV2SynthesisAnalysis,
  CanonicalSynthesisClaimKind,
  CanonicalSynthesisProof,
  CanonicalSynthesisSemanticClaim,
} from "./synthesisTypes.js";
import { RE_SEMANTIC_AMENDMENT_IDS } from "./synthesisVersionManifest.js";
import { isCanonicalSynthesisCalculationSemanticallyValid } from "./synthesisSemantics.js";

const POSITIVE_BASES = new Set(["source_fact", "deterministic_math", "rule_application", "external_verified"]);
const POSITIVE_TIERS = new Set([
  "stated_on_statement",
  "deterministically_derivable_from_statement",
  "inferable_from_statement_with_qualification",
]);
const POSITIVE_EVIDENCE = new Set([
  "statement_confirmed",
  "deterministically_derived",
  "approved_knowledge_supported",
  "public_documentation_verified",
  "merchant_document_supported",
  "multi_statement_supported",
]);

export class CanonicalEconomicsV2SynthesisValidationError extends Error {
  readonly errors: string[];
  readonly analysis: CanonicalEconomicsV2SynthesisAnalysis;

  constructor(analysis: CanonicalEconomicsV2SynthesisAnalysis) {
    super(`Canonical Economics V2 synthesis validation failed: ${analysis.validation.errors.join(" ")}`);
    this.name = "CanonicalEconomicsV2SynthesisValidationError";
    this.errors = analysis.validation.errors;
    this.analysis = analysis;
  }
}

export function validateCanonicalEconomicsV2SynthesisAnalysis(
  analysis: CanonicalEconomicsV2SynthesisAnalysis,
): CanonicalEconomicsV2SynthesisAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifest = analysis.versionManifest;
  const layer = analysis.synthesisLayer;
  const economic = analysis.economicAnalysis;
  const foundation = economic.pricingAnalysis.foundation;

  if (manifest.schemaVersion !== "canonical_economics_v2_synthesis_analysis_v1") errors.push("Unsupported RE synthesis schema version.");
  if (manifest.builderVersion !== "canonical_economics_v2_synthesis_builder_v1") errors.push("Unsupported RE synthesis builder version.");
  if (manifest.attributionPolicyVersion !== "canonical_economic_attribution_v2_v1") errors.push("Unsupported RE attribution policy.");
  if (manifest.counterfactualPolicyVersion !== "canonical_economic_counterfactual_v2_v1") errors.push("Unsupported RE counterfactual policy.");
  if (manifest.leverPolicyVersion !== "canonical_merchant_lever_v2_v1") errors.push("Unsupported RE merchant-lever policy.");
  if (manifest.themePolicyVersion !== "canonical_economic_theme_v2_v1") errors.push("Unsupported RE theme policy.");
  const contractActive = layer.contractV1?.contractId === "canonical_synthesis_admission_contract_v1";
  if (contractActive ? manifest.authority !== "internal_canonical_analysis_run" : manifest.authority !== "shadow_non_authoritative") {
    errors.push("RE authority does not match its Contract-v1 activation state.");
  }
  if (contractActive ? manifest.persistence !== "analysis_run_semantic_revision" : manifest.persistence !== "none") {
    errors.push("RE persistence does not match its Contract-v1 activation state.");
  }
  if (manifest.customerExposure !== "none") errors.push("RE must not become customer-visible.");
  if (manifest.aiResearchAuthority !== "prohibited") errors.push("AI/research authority over RE must be prohibited.");
  if (manifest.reportAuthority !== "prohibited") errors.push("RE must not have report authority.");
  if (manifest.accountSavingsAuthority !== "prohibited") errors.push("RE must not have account-savings authority.");
  if (manifest.knowledgeResolutionAuthority !== "prohibited") errors.push("RE must not resolve reusable knowledge.");
  if (economic.validation.status !== "valid" || economic.economicLayer.validation.status !== "valid") errors.push("RE requires a valid RD economic analysis.");
  if (layer.economicSchemaVersion !== economic.versionManifest.schemaVersion) errors.push("RE references the wrong RD schema version.");

  const evidenceIds = new Set([...foundation.sourceModel.evidence.map((item) => item.id),
    ...(layer.contractV1?.applications.flatMap((item) => item.evidenceRefs) ?? [])]);
  const occurrenceIds = new Set(foundation.sourceModel.occurrences.map((item) => item.id));
  const factIds = new Set(Object.values(foundation.financialPopulations).map((item) => item.id));
  const populationIds = new Set(economic.pricingAnalysis.pricingArchitecture.pricingPopulations.map((item) => item.id));
  const componentIds = new Set(economic.pricingAnalysis.pricingArchitecture.observedPricingComponents.map((item) => item.id));
  const chargeIds = new Set(economic.economicLayer.charges.map((item) => item.id));
  const roleClaimIds = new Set(economic.economicLayer.roleClaims.map((item) => item.id));
  const participantIds = new Set(economic.economicLayer.participants.map((item) => item.id));
  const dependencyIds = uniqueIds(layer.dependencies, "dependency", errors);
  const dependencyById = new Map(layer.dependencies.map((item) => [item.id, item]));
  const driverIds = uniqueIds(layer.drivers, "driver", errors);
  const relationshipIds = uniqueIds(layer.attributionRelationships, "attribution relationship", errors);
  const counterfactualIds = uniqueIds(layer.counterfactuals, "counterfactual", errors);
  const leverIds = uniqueIds(layer.merchantLevers, "merchant lever", errors);
  const serviceIds = uniqueIds(layer.accountServices, "account service", errors);
  const programIds = uniqueIds(layer.merchantPricingPrograms, "merchant pricing program", errors);
  const exposureIds = uniqueIds(layer.offStatementExposures, "off-statement exposure", errors);
  const noticeIds = uniqueIds(layer.notices, "notice", errors);
  const signalIds = uniqueIds(layer.operationalSignals, "operational signal", errors);
  const themeIds = uniqueIds(layer.themes, "economic theme", errors);
  const synthesisIds = new Set([
    ...driverIds, ...relationshipIds, ...counterfactualIds, ...leverIds, ...serviceIds,
    ...programIds, ...exposureIds, ...noticeIds, ...signalIds, ...themeIds,
  ]);
  const claimIds = uniqueIds(layer.claims, "semantic claim", errors);
  const calculationIds = uniqueIds(layer.calculations, "calculation", errors);
  const claimById = new Map(layer.claims.map((item) => [item.id, item]));
  const calculationById = new Map(layer.calculations.map((item) => [item.id, item]));
  const claimSubjectIds = new Set([...synthesisIds, "synthesis_refund", "synthesis_amex", "synthesis_risk",
    ...layer.themes.flatMap((theme) => theme.contributions.map((item) => item.id))]);
  const relationshipById = new Map(layer.attributionRelationships.map((item) => [item.id, item]));
  const counterfactualById = new Map(layer.counterfactuals.map((item) => [item.id, item]));

  for (const dependency of layer.dependencies) {
    for (const ref of dependency.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Dependency ${dependency.id} has broken evidence ref ${ref}.`);
    if (dependency.status === "satisfied_by_admitted_evidence" && dependency.evidenceRefs.length === 0) {
      errors.push(`Satisfied dependency ${dependency.id} requires admitted evidence.`);
    }
  }

  for (const claim of layer.claims) {
    validateProof(claim, claim.id, evidenceIds, dependencyIds, dependencyById, errors);
    if (!claimSubjectIds.has(claim.subjectRef)) errors.push(`Semantic claim ${claim.id} has broken subject ref.`);
    for (const ref of claim.populationRefs) if (!factIds.has(ref) && !populationIds.has(ref)) errors.push(`Semantic claim ${claim.id} has broken population ref ${ref}.`);
    for (const ref of claim.occurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Semantic claim ${claim.id} has broken occurrence ref ${ref}.`);
    for (const ref of claim.chargeRefs) if (!chargeIds.has(ref)) errors.push(`Semantic claim ${claim.id} has broken charge ref ${ref}.`);
    for (const ref of claim.pricingComponentRefs) if (!componentIds.has(ref)) errors.push(`Semantic claim ${claim.id} has broken pricing component ref ${ref}.`);
    for (const ref of claim.roleClaimRefs) if (!roleClaimIds.has(ref)) errors.push(`Semantic claim ${claim.id} has broken role ref ${ref}.`);
    for (const ref of claim.participantRefs) if (!participantIds.has(ref)) errors.push(`Semantic claim ${claim.id} has broken participant ref ${ref}.`);
    if (claim.status === "supported" && !proofIsPositive(claim, dependencyById)) errors.push(`Supported semantic claim ${claim.id} lacks positive proof.`);
  }
  for (const calculation of layer.calculations) {
    validateProof(calculation, calculation.id, evidenceIds, dependencyIds, dependencyById, errors);
    if (!claimSubjectIds.has(calculation.subjectRef)) errors.push(`Calculation ${calculation.id} has broken subject ref.`);
    for (const ref of calculation.driverRefs) if (!driverIds.has(ref)) errors.push(`Calculation ${calculation.id} has broken driver ref ${ref}.`);
    for (const ref of calculation.populationRefs) if (!factIds.has(ref) && !populationIds.has(ref)) errors.push(`Calculation ${calculation.id} has broken population ref ${ref}.`);
    if (calculation.status === "valid") for (const ref of calculation.inputClaimRefs) if (claimById.get(ref)?.status !== "supported") errors.push(`Calculation ${calculation.id} lacks a supported input claim ${ref}.`);
    if (calculation.status === "valid" && (!proofIsPositive(calculation, dependencyById) || !isCanonicalSynthesisCalculationSemanticallyValid(calculation))) {
      errors.push(`Valid calculation ${calculation.id} fails deterministic recomputation.`);
    }
  }

  for (const driver of layer.drivers) {
    validateProof(driver, driver.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of driver.populationRefs) if (!factIds.has(ref) && !populationIds.has(ref)) errors.push(`Driver ${driver.id} has broken population ref ${ref}.`);
    for (const ref of driver.sourceOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Driver ${driver.id} has broken occurrence ref ${ref}.`);
    for (const ref of driver.economicChargeRefs) if (!chargeIds.has(ref)) errors.push(`Driver ${driver.id} has broken charge ref ${ref}.`);
    for (const ref of driver.pricingComponentRefs) if (!componentIds.has(ref)) errors.push(`Driver ${driver.id} has broken pricing component ref ${ref}.`);
    for (const ref of driver.relationshipRefs) {
      if (!relationshipIds.has(ref)) errors.push(`Driver ${driver.id} has broken relationship ref ${ref}.`);
      else if (!relationshipById.get(ref)?.driverRefs.includes(driver.id)) errors.push(`Driver ${driver.id} and relationship ${ref} do not reference each other.`);
    }
    if (driver.counterfactualRef && !counterfactualIds.has(driver.counterfactualRef)) errors.push(`Driver ${driver.id} has broken counterfactual ref.`);
    if (driver.status === "supported") {
      if (!proofIsPositive(driver, dependencyById)) errors.push(`Supported driver ${driver.id} lacks positive admitted evidence.`);
      if (driver.populationRefs.length === 0 || !driver.populationPredicateCode) errors.push(`Supported driver ${driver.id} lacks explicit population semantics.`);
      if (driver.observedVolume && driver.observedVolume.amountMinor < 0) errors.push(`Driver ${driver.id} has negative observed-volume magnitude.`);
      if (driver.observedCount !== null && driver.observedCount < 0) errors.push(`Driver ${driver.id} has negative observed count.`);
      if (driver.observedCost && driver.observedCost.amountMinor < 0) errors.push(`Driver ${driver.id} has negative observed-cost magnitude.`);
      validateSupportedClaimRef(driver.populationClaimRef, "driver_population_identity", driver.id, claimById, `Driver ${driver.id} population`, errors);
      if (driver.observedCost || driver.relevantCostPoolRef) validateSupportedClaimRef(driver.costPoolClaimRef, "driver_cost_pool_relationship", driver.id, claimById, `Driver ${driver.id} cost pool`, errors);
      if (driver.shareOfPopulation || driver.shareOfRelevantCostPool) validateSupportedClaimRef(driver.shareClaimRef, "driver_share_basis", driver.id, claimById, `Driver ${driver.id} share`, errors);
    } else if (driver.observedVolume || driver.observedCount !== null || driver.observedCost || driver.shareOfPopulation || driver.shareOfRelevantCostPool) {
      errors.push(`Unavailable or unresolved driver ${driver.id} cannot carry quantified facts or shares.`);
    }
    if (driver.attributionMethod === "overlapping_declared" && !driver.relationshipRefs.some((ref) =>
      ["overlaps_with", "shared_population", "unresolved"].includes(relationshipById.get(ref)?.relationshipType ?? ""))) {
      errors.push(`Overlapping driver ${driver.id} requires an explicit overlap relationship.`);
    }
    if (driver.attributionMethod === "counterfactual_delta" && !driver.counterfactualRef) errors.push(`Counterfactual driver ${driver.id} requires a counterfactual ref.`);
  }

  for (const relationship of layer.attributionRelationships) {
    validateProof(relationship, relationship.id, evidenceIds, dependencyIds, dependencyById, errors);
    if (relationship.driverRefs.length < 2) errors.push(`Attribution relationship ${relationship.id} requires at least two drivers.`);
    for (const ref of relationship.driverRefs) if (!driverIds.has(ref)) errors.push(`Attribution relationship ${relationship.id} has broken driver ref ${ref}.`);
    if (relationship.additiveAggregationAllowed) {
      if (relationship.relationshipType !== "exclusive_within_group" || !relationship.allocationCalculationRef || !proofIsPositive(relationship, dependencyById)) {
        errors.push(`Attribution relationship ${relationship.id} cannot permit additive aggregation without proven exclusivity and allocation.`);
      }
      if (calculationById.get(relationship.allocationCalculationRef!)?.kind !== "exclusive_driver_allocation" || calculationById.get(relationship.allocationCalculationRef!)?.status !== "valid") {
        errors.push(`Attribution relationship ${relationship.id} lacks a validated allocation calculation.`);
      }
    }
    if (relationship.relationshipType !== "unresolved") validateSupportedClaimRef(relationship.relationshipClaimRef, "attribution_relationship", relationship.id, claimById, `Relationship ${relationship.id}`, errors);
    if (["overlaps_with", "shared_population", "unresolved"].includes(relationship.relationshipType) && relationship.additiveAggregationAllowed) {
      errors.push(`Overlapping relationship ${relationship.id} cannot permit additive aggregation.`);
    }
  }

  for (const counterfactual of layer.counterfactuals) {
    validateProof(counterfactual, counterfactual.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of counterfactual.observedPopulationRefs) if (!factIds.has(ref) && !populationIds.has(ref)) errors.push(`Counterfactual ${counterfactual.id} has broken observed-population ref ${ref}.`);
    for (const ref of counterfactual.alternativePopulationRefs) if (!factIds.has(ref) && !populationIds.has(ref)) errors.push(`Counterfactual ${counterfactual.id} has broken alternative-population ref ${ref}.`);
    for (const ref of counterfactual.observedChargeRefs) if (!chargeIds.has(ref)) errors.push(`Counterfactual ${counterfactual.id} has broken charge ref ${ref}.`);
    for (const ref of counterfactual.alternativeEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Counterfactual ${counterfactual.id} has broken alternative evidence ref ${ref}.`);
    for (const ref of counterfactual.cadenceEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Counterfactual ${counterfactual.id} has broken cadence evidence ref ${ref}.`);
    for (const ref of counterfactual.relationshipRefs) if (!relationshipIds.has(ref)) errors.push(`Counterfactual ${counterfactual.id} has broken relationship ref ${ref}.`);
    const quantified = counterfactual.resultState === "exact_deterministic_delta" || counterfactual.resultState === "bounded_conditional_delta";
    if (quantified) {
      if (!proofIsPositive(counterfactual, dependencyById) || counterfactual.populationCompatibility !== "compatible") errors.push(`Quantified counterfactual ${counterfactual.id} lacks proof or compatible populations.`);
      if (!counterfactual.baselinePeriod || !counterfactual.impactPeriod || counterfactual.baselinePeriod !== counterfactual.impactPeriod) {
        errors.push(`Quantified counterfactual ${counterfactual.id} lacks compatible baseline and impact periods.`);
      }
      if (!counterfactual.alternativeProvenanceId || counterfactual.alternativeEvidenceRefs.length === 0 || !counterfactual.formulaCode || !counterfactual.calculationRef) {
        errors.push(`Quantified counterfactual ${counterfactual.id} lacks alternative provenance or deterministic calculation.`);
      }
      if (counterfactual.relationshipRefs.some((ref) => ["overlaps_with", "shared_population", "unresolved"].includes(relationshipById.get(ref)?.relationshipType ?? ""))) {
        errors.push(`Quantified counterfactual ${counterfactual.id} has unresolved or overlapping attribution.`);
      }
      validateSupportedClaimRef(counterfactual.targetClaimRef, "counterfactual_target", counterfactual.id, claimById, `Counterfactual ${counterfactual.id} target`, errors);
      validateSupportedClaimRef(counterfactual.alternativeConditionClaimRef, "counterfactual_alternative_condition", counterfactual.id, claimById, `Counterfactual ${counterfactual.id} condition`, errors);
      const calculation = counterfactual.calculationRef ? calculationById.get(counterfactual.calculationRef) : null;
      if (!calculation || calculation.status !== "valid" || !["counterfactual_exact_delta", "counterfactual_bounded_delta"].includes(calculation.kind)) {
        errors.push(`Quantified counterfactual ${counterfactual.id} lacks a validated calculation object.`);
      }
    }
    if (counterfactual.resultState === "exact_deterministic_delta" && (!counterfactual.exactDelta || counterfactual.lowerBound || counterfactual.upperBound)) {
      errors.push(`Exact counterfactual ${counterfactual.id} has invalid result fields.`);
    }
    if (counterfactual.resultState === "bounded_conditional_delta" && (!counterfactual.lowerBound || !counterfactual.upperBound || !counterfactual.conditionCode || counterfactual.exactDelta)) {
      errors.push(`Bounded counterfactual ${counterfactual.id} lacks deterministic bounds and condition.`);
    }
    if (["verification_only", "unavailable_not_derivable"].includes(counterfactual.resultState) &&
      (counterfactual.exactDelta || counterfactual.lowerBound || counterfactual.upperBound)) {
      errors.push(`Non-quantified counterfactual ${counterfactual.id} cannot carry impact values.`);
    }
    if (counterfactual.annualized && (!counterfactual.recurrenceProven || counterfactual.cadenceEvidenceRefs.length === 0)) {
      errors.push(`Annualized counterfactual ${counterfactual.id} lacks cadence and recurrence evidence.`);
    }
  }

  for (const lever of layer.merchantLevers) {
    validateProof(lever, lever.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of lever.driverRefs) if (!driverIds.has(ref)) errors.push(`Lever ${lever.id} has broken driver ref ${ref}.`);
    for (const ref of lever.chargeRefs) if (!chargeIds.has(ref)) errors.push(`Lever ${lever.id} has broken charge ref ${ref}.`);
    for (const ref of lever.controlRoleRefs) if (!roleClaimIds.has(ref)) errors.push(`Lever ${lever.id} has broken control-role ref ${ref}.`);
    for (const ref of lever.operationalControllabilityEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Lever ${lever.id} has broken operational-control evidence ref ${ref}.`);
    const counterfactual = lever.counterfactualRef ? counterfactualById.get(lever.counterfactualRef) : null;
    if (lever.counterfactualRef && !counterfactual) errors.push(`Lever ${lever.id} has broken counterfactual ref.`);
    const carriesImpact = Boolean(lever.calculatedImpact || lever.calculatedImpactLowerBound || lever.calculatedImpactUpperBound || lever.calculatedImpactState);
    if (lever.state !== "eligible_supported" && carriesImpact) errors.push(`Non-eligible lever ${lever.id} cannot carry calculated impact.`);
    if (lever.state === "eligible_supported") {
      if (!proofIsPositive(lever, dependencyById)) errors.push(`Eligible lever ${lever.id} lacks positive evidence.`);
      const contractAction = layer.contractV1?.actions.find((action) => action.safeActionCode === lever.safeActionCode
        && sameSet(action.chargeRefs, lever.chargeRefs));
      if (!contractAction && (!counterfactual || !["exact_deterministic_delta", "bounded_conditional_delta"].includes(counterfactual.resultState))) {
        errors.push(`Eligible lever ${lever.id} lacks quantified counterfactual.`);
      }
      const rolesProven = lever.requiredControlDimensions.length > 0 && lever.requiredControlDimensions.every((dimension) =>
        lever.controlRoleRefs.some((ref) => {
          const claim = economic.economicLayer.roleClaims.find((item) => item.id === ref);
          return claim?.dimension === dimension && claim.resolution === "proven" && claim.periodApplicability === "applicable";
        }),
      );
      if (!contractAction && !rolesProven && lever.operationalControllabilityEvidenceRefs.length === 0) errors.push(`Eligible lever ${lever.id} lacks supported merchant control.`);
      const influence = lever.merchantInfluenceClaimRef ? claimById.get(lever.merchantInfluenceClaimRef) : null;
      if (!contractAction && (!influence || influence.status !== "supported" || influence.subjectRef !== lever.id || !["merchant_change_right", "merchant_operational_controllability"].includes(influence.kind))) {
        errors.push(`Eligible lever ${lever.id} lacks a merchant-specific influence claim.`);
      }
      if (contractAction && contractAction.state !== "eligible_supported") errors.push(`Eligible lever ${lever.id} exceeds its Contract-v1 action state.`);
    }
  }

  validateSpecialEconomics(analysis, evidenceIds, occurrenceIds, factIds, populationIds, chargeIds, roleClaimIds, dependencyIds, dependencyById, errors);

  for (const signal of layer.operationalSignals) {
    validateProof(signal, signal.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of signal.populationRefs) if (!factIds.has(ref) && !populationIds.has(ref)) errors.push(`Signal ${signal.id} has broken population ref ${ref}.`);
    for (const ref of signal.economicDriverRefs) if (!driverIds.has(ref)) errors.push(`Signal ${signal.id} has broken driver ref ${ref}.`);
    if (signal.causalStatus === "causal_relationship_supported" && !proofIsPositive(signal, dependencyById)) errors.push(`Causal signal ${signal.id} lacks admitted causal evidence.`);
    if (signal.causalStatus === "causal_relationship_supported") validateSupportedClaimRef(signal.causalityClaimRef, "operational_causality", signal.id, claimById, `Signal ${signal.id} causality`, errors);
  }

  const risk = layer.accountRisk;
  validateProof(risk, "account risk", evidenceIds, dependencyIds, dependencyById, errors);
  for (const ref of [risk.disputeDebitAmountFactRef, risk.disputeDebitCountFactRef, risk.representmentAmountFactRef]) if (!factIds.has(ref)) errors.push(`Account risk has broken fact ref ${ref}.`);
  for (const ref of risk.feeChargeRefs) if (!chargeIds.has(ref)) errors.push(`Account risk has broken fee-charge ref ${ref}.`);
  if (risk.countDenominatorFactRef && !factIds.has(risk.countDenominatorFactRef)) errors.push("Account risk has broken count-denominator ref.");
  if (risk.valueDenominatorFactRef && !factIds.has(risk.valueDenominatorFactRef)) errors.push("Account risk has broken value-denominator ref.");
  if (risk.state === "descriptive_ratios_available" && (risk.denominatorCompatibility !== "compatible" || !risk.descriptiveRatioByCount || !risk.descriptiveRatioByValue)) {
    errors.push("Descriptive dispute ratios require compatible evidenced numerator and denominator populations.");
  }
  if (risk.state === "descriptive_ratios_available") validateSupportedClaimRef(risk.compatibilityClaimRef, "risk_population_compatibility", "synthesis_risk", claimById, "Account risk compatibility", errors);
  if (risk.state !== "descriptive_ratios_available" && (risk.descriptiveRatioByCount || risk.descriptiveRatioByValue)) errors.push("Unresolved account risk cannot carry dispute ratios.");
  if (risk.fairnessVerdict !== "unavailable") errors.push("RE cannot emit a pricing-fairness verdict.");

  const themeKeys = new Set<string>();
  for (const theme of layer.themes) {
    validateProof(theme, theme.id, evidenceIds, dependencyIds, dependencyById, errors);
    const key = `${theme.economicQuestionCode}\u0000${theme.canonicalQuestionScopeFingerprint}\u0000${theme.actionBoundaryCode}`
      + `\u0000${theme.statementPeriod ? `${theme.statementPeriod.start}/${theme.statementPeriod.end}` : "unavailable"}`;
    if (themeKeys.has(key)) errors.push(`Theme ${theme.id} duplicates an economic question and action boundary.`);
    themeKeys.add(key);
    for (const ref of theme.factRefs) if (!factIds.has(ref)) errors.push(`Theme ${theme.id} has broken fact ref ${ref}.`);
    for (const ref of theme.chargeRefs) if (!chargeIds.has(ref)) errors.push(`Theme ${theme.id} has broken charge ref ${ref}.`);
    for (const ref of theme.driverRefs) if (!driverIds.has(ref)) errors.push(`Theme ${theme.id} has broken driver ref ${ref}.`);
    for (const ref of theme.signalRefs) if (!signalIds.has(ref)) errors.push(`Theme ${theme.id} has broken signal ref ${ref}.`);
    for (const ref of theme.leverRefs) if (!leverIds.has(ref)) errors.push(`Theme ${theme.id} has broken lever ref ${ref}.`);
    for (const ref of theme.unresolvedDependencyRefs) if (!dependencyIds.has(ref)) errors.push(`Theme ${theme.id} has broken dependency ref ${ref}.`);
    if (theme.projectionPermission !== "structured_only_no_customer_prose") errors.push(`Theme ${theme.id} exceeds RE projection authority.`);
    for (const contribution of theme.contributions) {
      if (contribution.status === "supported") validateSupportedClaimRef(contribution.claimRef, "theme_contribution", contribution.id, claimById, `Theme contribution ${contribution.id}`, errors);
    }
    if (theme.factRefs.length + theme.chargeRefs.length + theme.driverRefs.length + theme.signalRefs.length + theme.leverRefs.length + theme.unresolvedDependencyRefs.length === 0 &&
      theme.contributions.length === 0) {
      errors.push(`Theme ${theme.id} is filler without canonical support.`);
    }
  }

  if (layer.contractV1) {
    if (layer.contractV1.contractId !== "canonical_synthesis_admission_contract_v1"
      || layer.contractV1.authority !== "internal_canonical_analysis_run_only"
      || layer.contractV1.customerReportAuthority !== "unchanged"
      || layer.contractV1.providerExecution !== "not_executed_during_convergence"
      || layer.contractV1.specializedFamilies !== "inactive"
      || layer.contractV1.validation.status !== "valid") errors.push("Contract-v1 RE state is not valid and internally bounded.");
    if (layer.refundEconomics.status !== "unavailable" || layer.amexEconomics.status !== "unavailable"
      || layer.accountServices.length > 0 || layer.merchantPricingPrograms.length > 0 || layer.offStatementExposures.length > 0
      || layer.notices.length > 0 || layer.operationalSignals.length > 0) errors.push("Contract-v1 activated a specialized RE family.");
    if (layer.counterfactuals.some((item) => item.resultState === "bounded_conditional_delta")) errors.push("Contract-v1 cannot admit bounded counterfactuals.");
    if (layer.themes.some((item) => item.economicQuestionCode === "pricing_structure" || item.themeType === "pricing_structure")) {
      errors.push("Contract-v1 cannot add a pricing-structure theme.");
    }
    const allowedActions = new Set(["request_governing_documentation", "verify_account_capability_or_configuration",
      "request_pricing_term_review", "review_supported_configuration_change", "review_supported_operational_process_change",
      "establish_monitoring_baseline"]);
    for (const application of layer.contractV1.applications) {
      if (application.value.kind !== "synthesis_recurrence") continue;
      const truthfulRoute = application.assertionBasis === "external_verified" && (
        application.value.recurrenceBasis === "verified_schedule"
          && application.derivabilityTier === "requires_external_rule_or_schedule"
          && application.evidenceClass === "public_documentation_verified"
        || application.value.recurrenceBasis === "merchant_contract"
          && application.derivabilityTier === "requires_merchant_pricing_document"
          && application.evidenceClass === "merchant_document_supported"
        || application.value.recurrenceBasis === "multi_statement"
          && application.derivabilityTier === "requires_additional_statement_history"
          && application.evidenceClass === "multi_statement_supported");
      if (!truthfulRoute) errors.push(`Contract-v1 recurrence ${application.applicationId} misstates its evidence route.`);
    }
    for (const action of layer.contractV1.actions) {
      if (!allowedActions.has(action.safeActionCode)) errors.push(`Contract-v1 action ${action.actionId} is not cataloged.`);
      if (["request_governing_documentation", "verify_account_capability_or_configuration"].includes(action.safeActionCode)
        && action.verificationRequirementCode === null) {
        errors.push(`Contract-v1 verification action ${action.actionId} lacks an exact verification requirement.`);
      }
      if (["request_governing_documentation", "verify_account_capability_or_configuration", "establish_monitoring_baseline"]
        .includes(action.safeActionCode) && action.requiredInfluence !== "none") {
        errors.push(`Contract-v1 action ${action.actionId} invents an influence prerequisite.`);
      }
      if (action.safeActionCode === "request_pricing_term_review" && action.requiredInfluence !== "merchant_change_right") {
        errors.push(`Contract-v1 pricing review ${action.actionId} lacks exact merchant change-right.`);
      }
      if (action.safeActionCode === "review_supported_operational_process_change"
        && !["merchant_operational_controllability", "both"].includes(action.requiredInfluence)) {
        errors.push(`Contract-v1 operational action ${action.actionId} lacks operational controllability.`);
      }
      if (action.permissionCeiling.includes("impact") && (!action.counterfactualApplicationRef || action.state !== "eligible_supported")) {
        errors.push(`Contract-v1 action ${action.actionId} exceeds its independent impact prerequisites.`);
      }
      if (action.permissionCeiling === "supported_action_with_annual_impact" && !action.recurrenceApplicationRef) {
        errors.push(`Contract-v1 action ${action.actionId} annualizes without recurrence.`);
      }
      if (action.class === "candidate_verification" && !["documentation_or_monitoring_only", "candidate_requires_verification"].includes(action.state)) {
        errors.push(`Contract-v1 verification action ${action.actionId} exceeds its catalog class.`);
      }
    }
    for (const effect of layer.contractV1.constraintActionEffects) {
      const constraint = layer.contractV1.constraints.find((item) => item.constraintId === effect.constraintRef);
      if (!constraint || constraint.scopeFingerprint !== effect.scopeFingerprint
        || constraint.statementPeriod.start !== effect.statementPeriod.start
        || constraint.statementPeriod.end !== effect.statementPeriod.end
        || effect.effectResolutionState !== "proven"
        || !allowedActions.has(effect.safeActionCode)) errors.push(`Contract-v1 constraint effect ${effect.effectId} has an invalid exact binding.`);
    }
    for (const constraint of layer.contractV1.constraints) {
      if (constraint.identityResolutionState !== "proven" || constraint.applicabilityResolutionState !== "proven"
        || constraint.governingSourceRefs.length === 0) {
        errors.push(`Contract-v1 constraint ${constraint.constraintId} lacks explicit identity/applicability/source proof.`);
      }
    }
    for (const theme of layer.themes) {
      if (!/^[a-f0-9]{64}$/.test(theme.canonicalQuestionScopeFingerprint)) {
        errors.push(`Contract-v1 theme ${theme.id} lacks a canonical exact-lineage question-scope fingerprint.`);
      }
      if (!["observed_cost_driver", "cost_control_and_merchant_action"].includes(theme.economicQuestionCode)) {
        errors.push(`Contract-v1 theme ${theme.id} uses an unapproved economic question.`);
      }
      if (!["explanation_only", "verification_or_document_request", "supported_action_no_quantified_impact",
        "supported_action_with_statement_period_impact", "supported_action_with_annual_impact"].includes(theme.actionBoundaryCode)) {
        errors.push(`Contract-v1 theme ${theme.id} uses an unapproved action boundary.`);
      }
      if (theme.materiality === "contextual" && theme.priorityClass !== "context") errors.push(`Contextual Contract-v1 theme ${theme.id} has invalid priority.`);
      if (theme.materiality === "unresolved" && (theme.driverRefs.length > 0 || theme.actionBoundaryCode.includes("impact"))) {
        errors.push(`Unresolved Contract-v1 theme ${theme.id} carries an affirmative driver or impact.`);
      }
      if (theme.actionBoundaryCode === "explanation_only" && theme.leverRefs.length > 0) errors.push(`Explanation-only theme ${theme.id} carries action permission.`);
      const themeLevers = theme.leverRefs.map((ref) => layer.merchantLevers.find((item) => item.id === ref)).filter(Boolean);
      if (theme.actionBoundaryCode === "verification_or_document_request" && themeLevers.some((lever) =>
        !lever || !["request_governing_documentation", "verify_account_capability_or_configuration"].includes(lever.safeActionCode))) {
        errors.push(`Verification-only theme ${theme.id} carries an economic-change action.`);
      }
      if (theme.actionBoundaryCode.startsWith("supported_action") && themeLevers.some((lever) => lever?.state !== "eligible_supported")) {
        errors.push(`Supported-action theme ${theme.id} contains an unsupported action.`);
      }
    }
  }

  const amendmentIds = new Set<string>();
  for (const amendment of layer.semanticAmendments) {
    if (!(RE_SEMANTIC_AMENDMENT_IDS as readonly string[]).includes(amendment.id)) errors.push(`Unapproved RE semantic amendment ${amendment.id}.`);
    if (amendmentIds.has(amendment.id)) errors.push(`Duplicate RE semantic amendment ${amendment.id}.`);
    amendmentIds.add(amendment.id);
    if (amendment.synthesisRefs.length === 0) errors.push(`Semantic amendment ${amendment.id} lacks demonstrated synthesis refs.`);
    for (const ref of amendment.synthesisRefs) if (!synthesisIds.has(ref)) errors.push(`Semantic amendment ${amendment.id} has broken synthesis ref ${ref}.`);
  }

  if (layer.drivers.some((item) => item.status !== "supported")) warnings.push("One or more economic drivers remain unresolved or unavailable.");
  if (layer.attributionRelationships.some((item) => ["overlaps_with", "shared_population", "unresolved"].includes(item.relationshipType))) {
    warnings.push("Known or unresolved driver overlap blocks additive aggregation.");
  }
  if (layer.counterfactuals.some((item) => item.resultState === "verification_only" || item.resultState === "unavailable_not_derivable")) {
    warnings.push("One or more counterfactuals remain non-quantified.");
  }

  const validation = {
    status: errors.length === 0 ? "valid" as const : "invalid" as const,
    errors: unique(errors),
    warnings: unique(warnings),
  };
  return {
    ...analysis,
    synthesisLayer: { ...layer, validation },
    validation,
  };
}

export function assertCanonicalEconomicsV2SynthesisAnalysis(
  analysis: CanonicalEconomicsV2SynthesisAnalysis,
): CanonicalEconomicsV2SynthesisAnalysis {
  const validated = validateCanonicalEconomicsV2SynthesisAnalysis(analysis);
  if (validated.validation.status === "invalid") throw new CanonicalEconomicsV2SynthesisValidationError(validated);
  return validated;
}

function validateSpecialEconomics(
  analysis: CanonicalEconomicsV2SynthesisAnalysis,
  evidenceIds: Set<string>, occurrenceIds: Set<string>, factIds: Set<string>, populationIds: Set<string>,
  chargeIds: Set<string>, roleClaimIds: Set<string>, dependencyIds: Set<string>,
  dependencyById: Map<string, CanonicalEconomicsV2SynthesisAnalysis["synthesisLayer"]["dependencies"][number]>, errors: string[],
): void {
  const layer = analysis.synthesisLayer;
  const claimById = new Map(layer.claims.map((item) => [item.id, item]));
  const calculationById = new Map(layer.calculations.map((item) => [item.id, item]));
  const refund = layer.refundEconomics;
  validateProof(refund, "refund economics", evidenceIds, dependencyIds, dependencyById, errors);
  if (!factIds.has(refund.refundVolumeFactRef) || !factIds.has(refund.refundCountFactRef)) errors.push("Refund economics has broken population fact refs.");
  for (const ref of refund.pricingPopulationRefs) if (!populationIds.has(ref)) errors.push(`Refund economics has broken pricing-population ref ${ref}.`);
  for (const ref of refund.sourceOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Refund economics has broken occurrence ref ${ref}.`);
  for (const ref of [...refund.returnFeeChargeRefs, ...refund.retainedFeeChargeRefs]) if (!chargeIds.has(ref)) errors.push(`Refund economics has broken charge ref ${ref}.`);
  if (refund.status === "supported") validateSupportedClaimRef(refund.fieldClaimRefs.population, "refund_population", "synthesis_refund", claimById, "Refund population", errors);
  const refundClaims: Array<[string | null, CanonicalSynthesisClaimKind, string]> = [
    [refund.fieldClaimRefs.underlyingCostReturn, "refund_underlying_cost_return", "underlying-cost return"],
    [refund.fieldClaimRefs.processorPricingReturn, "refund_processor_pricing_return", "processor-pricing return"],
    [refund.fieldClaimRefs.percentageBasis, "refund_percentage_basis", "percentage basis"],
    [refund.fieldClaimRefs.returnFee, "refund_return_fee", "return fee"],
    [refund.fieldClaimRefs.retainedFee, "refund_retained_fee", "retained fee"],
  ];
  for (const [ref, kind, label] of refundClaims) if (ref) validateSupportedClaimRef(ref, kind, "synthesis_refund", claimById, `Refund ${label}`, errors);

  const amex = layer.amexEconomics;
  validateProof(amex, "Amex economics", evidenceIds, dependencyIds, dependencyById, errors);
  for (const ref of amex.pricingPopulationRefs) if (!populationIds.has(ref)) errors.push(`Amex economics has broken pricing-population ref ${ref}.`);
  for (const ref of [...amex.observedChargeRefs, ...amex.marginChargeRefs]) if (!chargeIds.has(ref)) errors.push(`Amex economics has broken charge ref ${ref}.`);
  for (const ref of amex.ownershipRoleRefs) if (!roleClaimIds.has(ref)) errors.push(`Amex economics has broken role ref ${ref}.`);
  if (amex.marginState === "proven" && (amex.marginChargeRefs.length === 0 || amex.ownershipRoleRefs.length === 0 || !proofIsPositive(amex, dependencyById))) {
    errors.push("Proven Amex margin requires admitted margin charges and ownership/control evidence.");
  }
  if (amex.acceptanceMode !== "unknown" && !amex.acceptanceModeMappingRef) errors.push("Resolved Amex acceptance mode requires admitted structural mapping.");
  if (amex.acceptanceMode !== "unknown") validateSupportedClaimRef(amex.acceptanceClaimRef, "amex_acceptance_mapping", "synthesis_amex", claimById, "Amex acceptance", errors);
  if (amex.marginState === "proven") validateSupportedClaimRef(amex.marginClaimRef, "amex_margin_component", "synthesis_amex", claimById, "Amex margin", errors);

  for (const service of layer.accountServices) {
    validateProof(service, service.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of service.chargeRefs) if (!chargeIds.has(ref)) errors.push(`Service ${service.id} has broken charge ref ${ref}.`);
    for (const ref of service.participantRoleRefs) if (!roleClaimIds.has(ref)) errors.push(`Service ${service.id} has broken role ref ${ref}.`);
    for (const ref of service.usageEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Service ${service.id} has broken usage evidence ref ${ref}.`);
    if (service.state === "charge_observed_usage_proven" && service.usageEvidenceRefs.length === 0) errors.push(`Service ${service.id} claims proven usage without evidence.`);
    if (service.state !== "unresolved") validateSupportedClaimRef(service.chargeClaimRef, "service_charge_observed", service.id, claimById, `Service ${service.id} charge`, errors);
    if (service.state === "charge_observed_usage_proven") validateSupportedClaimRef(service.usageClaimRef, "service_usage", service.id, claimById, `Service ${service.id} usage`, errors);
  }

  for (const program of layer.merchantPricingPrograms) {
    validateProof(program, program.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of program.coveredPopulationRefs) if (!populationIds.has(ref) && !factIds.has(ref)) errors.push(`Program ${program.id} has broken population ref ${ref}.`);
    if (program.netBurdenState === "derived_when_evidenced") {
      if (!program.statementObservedProcessorFees || !program.consumerFacingRevenue || !program.merchantRetainedAmount || !program.thirdPartyRetention || !program.offsets ||
        !program.netMerchantBorneCost || !program.netBurdenCalculationRef || !proofIsPositive(program, dependencyById)) errors.push(`Program ${program.id} lacks complete evidenced flows for net burden.`);
      if (program.flowClaimRefs.length !== 5 || program.flowClaimRefs.some((ref) => claimById.get(ref)?.kind !== "pricing_program_flow" || claimById.get(ref)?.status !== "supported")) {
        errors.push(`Program ${program.id} lacks five supported flow claims.`);
      }
      const calculation = calculationById.get(program.netBurdenCalculationRef!);
      if (calculation?.kind !== "pricing_program_net_burden" || calculation.status !== "valid") errors.push(`Program ${program.id} lacks a valid net-burden calculation.`);
    } else if (program.netMerchantBorneCost || program.netBurdenCalculationRef) {
      errors.push(`Program ${program.id} cannot carry net burden while required flows are unavailable.`);
    }
  }

  for (const exposure of layer.offStatementExposures) {
    validateProof(exposure, exposure.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of exposure.sourceOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Off-statement exposure ${exposure.id} has broken occurrence ref ${ref}.`);
    if (exposure.state === "observed_with_admitted_evidence" && (!exposure.observedAmount || !proofIsPositive(exposure, dependencyById))) errors.push(`Observed off-statement exposure ${exposure.id} lacks admitted amount evidence.`);
    if (exposure.state === "known_absent_with_evidence" && !proofIsPositive(exposure, dependencyById)) errors.push(`Known-absent exposure ${exposure.id} lacks positive evidence.`);
    if (exposure.state === "known_absent_with_evidence") validateSupportedClaimRef(exposure.stateClaimRef, "off_statement_absence", exposure.id, claimById, `Off-statement exposure ${exposure.id} absence`, errors);
    if (exposure.state === "observed_with_admitted_evidence") validateSupportedClaimRef(exposure.stateClaimRef, "off_statement_presence", exposure.id, claimById, `Off-statement exposure ${exposure.id} presence`, errors);
    if (exposure.state !== "observed_with_admitted_evidence" && exposure.observedAmount) errors.push(`Off-statement exposure ${exposure.id} manufactures an amount for a non-observed state.`);
  }

  const statementPeriod = analysis.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod;
  for (const notice of layer.notices) {
    validateProof(notice, notice.id, evidenceIds, dependencyIds, dependencyById, errors);
    for (const ref of notice.sourceOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Notice ${notice.id} has broken occurrence ref ${ref}.`);
    if (notice.claimedEffectiveDate && statementPeriod && notice.claimedEffectiveDate > statementPeriod.end && notice.analyzedPeriodApplicability === "current") {
      errors.push(`Future notice ${notice.id} cannot apply to current-period economics.`);
    }
    if (notice.analyzedPeriodApplicability === "future_candidate") validateSupportedClaimRef(notice.termClaimRef, "future_notice_term", notice.id, claimById, `Future notice ${notice.id}`, errors);
  }
}

function validateSupportedClaimRef(
  ref: string | null,
  kind: CanonicalSynthesisClaimKind,
  subjectRef: string,
  claimById: Map<string, CanonicalSynthesisSemanticClaim>,
  label: string,
  errors: string[],
): void {
  const claim = ref ? claimById.get(ref) : null;
  if (!claim || claim.status !== "supported" || claim.kind !== kind || claim.subjectRef !== subjectRef) {
    errors.push(`${label} lacks a matching supported semantic claim.`);
  }
}

function validateProof(
  proof: CanonicalSynthesisProof, label: string, evidenceIds: Set<string>, dependencyIds: Set<string>,
  dependencyById: Map<string, { status: string }>, errors: string[],
): void {
  for (const ref of proof.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`${label} has broken evidence ref ${ref}.`);
  for (const ref of proof.dependencyRefs) if (!dependencyIds.has(ref)) errors.push(`${label} has broken dependency ref ${ref}.`);
  if (proof.assertionBasis === "ai_hypothesis" && (proof.evidenceClass !== "hypothesis_only" || proof.derivabilityTier !== "unresolved")) {
    errors.push(`${label} allows AI hypothesis to exceed unresolved non-authority.`);
  }
  if (proof.effectiveFrom && proof.effectiveTo && proof.effectiveFrom > proof.effectiveTo) errors.push(`${label} has an invalid effective period.`);
  if (proof.dependencyRefs.some((ref) => !dependencyById.has(ref))) errors.push(`${label} references an unavailable dependency.`);
}

function proofIsPositive(proof: CanonicalSynthesisProof, dependencyById: Map<string, { status: string }>): boolean {
  const truthfulExternalRoute = proof.assertionBasis === "external_verified" && (
    proof.evidenceClass === "public_documentation_verified" && proof.derivabilityTier === "requires_external_rule_or_schedule"
    || proof.evidenceClass === "merchant_document_supported" && proof.derivabilityTier === "requires_merchant_pricing_document"
    || proof.evidenceClass === "multi_statement_supported" && proof.derivabilityTier === "requires_additional_statement_history"
    || proof.evidenceClass === "approved_knowledge_supported" && ["requires_external_rule_or_schedule",
      "requires_merchant_pricing_document", "requires_additional_statement_history", "requires_processor_explanation"].includes(proof.derivabilityTier));
  return POSITIVE_BASES.has(proof.assertionBasis) && (POSITIVE_TIERS.has(proof.derivabilityTier) || truthfulExternalRoute) && POSITIVE_EVIDENCE.has(proof.evidenceClass) &&
    proof.evidenceRefs.length > 0 && proof.dependencyRefs.every((ref) => dependencyById.get(ref)?.status === "satisfied_by_admitted_evidence");
}

function uniqueIds(items: Array<{ id: string }>, label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id) errors.push(`RE ${label} requires an id.`);
    if (ids.has(item.id)) errors.push(`Duplicate RE ${label} id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
