import type { CanonicalEconomicCharge, CanonicalEconomicCostBucketKind, CanonicalEconomicsV2EconomicAnalysis } from "./economicTypes.js";
import { RD_SEMANTIC_AMENDMENT_IDS } from "./economicVersionManifest.js";
import { FISERV_FEE_LEDGER_OCCURRENCE_MARKER } from "./fiservAdapter.js";
import { canonicalRoleProofRouteSatisfied } from "./economicProofRoutes.js";

const EXPECTED_BUCKETS = [
  "issuer_interchange_cost",
  "network_card_brand_cost",
  "processor_controlled_pricing",
  "processor_service_admin_cost",
  "third_party_equipment_cost",
  "operational_penalty_cost",
  "processing_fee_taxes",
  "other_source_grounded_fee",
  "unresolved_cost",
] as const satisfies readonly CanonicalEconomicCostBucketKind[];

const POSITIVE_BASES = new Set(["source_fact", "deterministic_math", "rule_application", "external_verified"]);
const POSITIVE_TIERS = new Set([
  "stated_on_statement",
  "deterministically_derivable_from_statement",
  "inferable_from_statement_with_qualification",
]);

export class CanonicalEconomicsV2EconomicValidationError extends Error {
  readonly errors: string[];
  readonly analysis: CanonicalEconomicsV2EconomicAnalysis;

  constructor(analysis: CanonicalEconomicsV2EconomicAnalysis) {
    super(`Canonical Economics V2 economic validation failed: ${analysis.validation.errors.join(" ")}`);
    this.name = "CanonicalEconomicsV2EconomicValidationError";
    this.errors = analysis.validation.errors;
    this.analysis = analysis;
  }
}

export function validateCanonicalEconomicsV2EconomicAnalysis(
  analysis: CanonicalEconomicsV2EconomicAnalysis,
): CanonicalEconomicsV2EconomicAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifest = analysis.versionManifest;
  const layer = analysis.economicLayer;
  const pricing = analysis.pricingAnalysis;
  const foundation = pricing.foundation;

  if (manifest.schemaVersion !== "canonical_economics_v2_economic_analysis_v1") errors.push("Unsupported RD economic schema version.");
  if (manifest.builderVersion !== "canonical_economics_v2_economic_builder_v2") errors.push("Unsupported RD economic builder version.");
  if (manifest.chargeIdentityPolicyVersion !== "canonical_economic_charge_identity_v2_v2") errors.push("Unsupported RD charge-identity policy version.");
  if (manifest.participantControlPolicyVersion !== "canonical_economic_participant_control_v2_v2") errors.push("Unsupported RD participant/control policy version.");
  if (manifest.costStackPolicyVersion !== "canonical_economic_cost_stack_v2_v2") errors.push("Unsupported RD cost-stack policy version.");
  if (manifest.authority !== "shadow_non_authoritative") errors.push("RD must remain shadow and non-authoritative.");
  if (manifest.persistence !== "none") errors.push("RD must not introduce persistence.");
  if (manifest.customerExposure !== "none") errors.push("RD must not become customer-visible.");
  if (manifest.aiResearchAuthority !== "prohibited") errors.push("AI/research authority over RD must be prohibited.");
  if (manifest.reportAuthority !== "prohibited") errors.push("Report authority over RD must be prohibited.");
  if (manifest.totalAcceptanceCostAuthority !== "prohibited") errors.push("RD cannot claim total acceptance cost authority.");
  if (pricing.validation.status !== "valid" || pricing.pricingArchitecture.validation.status !== "valid") errors.push("RD requires a valid RC pricing analysis.");
  if (foundation.validation.status !== "valid") errors.push("RD requires a valid RB foundation.");
  if (layer.pricingSchemaVersion !== pricing.versionManifest.schemaVersion) errors.push("RD references the wrong RC pricing schema.");
  if (layer.sourceProvenance !== foundation.identity.provenanceStatus) errors.push("RD source provenance diverges from RB.");

  const evidenceIds = new Set(foundation.sourceModel.evidence.map((item) => item.id));
  const externalEvidenceIds = new Set(layer.externalEvidenceRefs);
  const occurrenceIds = new Set(foundation.sourceModel.occurrences.map((item) => item.id));
  const occurrenceById = new Map(foundation.sourceModel.occurrences.map((item) => [item.id, item]));
  const representationById = new Map(foundation.sourceModel.representationGroups.map((item) => [item.id, item]));
  const reconciliationIds = new Set(foundation.reconciliation.map((item) => item.id));
  const pricingComponentIds = new Set(pricing.pricingArchitecture.observedPricingComponents.map((item) => item.id));
  const pricingPopulationIds = new Set(pricing.pricingArchitecture.pricingPopulations.map((item) => item.id));
  const participantIds = uniqueIds(layer.participants, "participant", errors);
  const chargeIds = uniqueIds(layer.charges, "charge", errors);
  const roleClaimIds = uniqueIds(layer.roleClaims, "role claim", errors);
  const roleClaimById = new Map(layer.roleClaims.map((item) => [item.id, item]));
  const dependencyIds = uniqueIds(layer.dependencies, "dependency", errors);
  const dependencyById = new Map(layer.dependencies.map((item) => [item.id, item]));
  const participantById = new Map(layer.participants.map((item) => [item.id, item]));
  const knowledgeApplicationIds = uniqueIds(layer.semanticApplications, "semantic application", errors);
  const semanticApplicationById = new Map(layer.semanticApplications.map((item) => [item.id, item]));

  validateAdmission(analysis, evidenceIds, errors, warnings);
  for (const application of layer.semanticApplications) {
    const charge = layer.charges.find((item) => item.id === application.chargeRef);
    if (!charge) errors.push(`Semantic application ${application.id} has a broken charge ref.`);
    if (!occurrenceIds.has(application.occurrenceRef)) errors.push(`Semantic application ${application.id} has a broken occurrence ref.`);
    const category = application.claimClass === "economic_category" && application.knowledgeClaimType === "stable_facet_mapping"
      && application.facet === "economic_category" && application.value.kind === "mapping";
    const role = application.claimClass === "participant_control_role" && application.knowledgeClaimType === "participant_control_role"
      && application.facet !== "economic_category" && application.value.kind === "role"
      && application.value.controlDimension === application.facet;
    if (!category && !role) errors.push(`Semantic application ${application.id} exceeds the lossless category/role boundary.`);
    if (application.sourceKind === "governed_rf_snapshot" && (application.selectedEntryRefs.length === 0 ||
      application.sourceAuthorities.length === 0 || application.externalEvidenceRefs.length > 0 ||
      !application.knowledgeSnapshotHash || !/^[a-f0-9]{64}$/.test(application.knowledgeSnapshotHash))) {
      errors.push(`Semantic application ${application.id} lacks admitted RF snapshot provenance.`);
    }
    if (application.sourceKind === "current_run_verified_rg_evidence" && (application.selectedEntryRefs.length > 0 ||
      application.knowledgeSnapshotHash !== null || application.externalEvidenceRefs.length === 0 ||
      application.externalEvidenceRefs.some((ref) => !externalEvidenceIds.has(ref)) ||
      application.sourceAuthorities.length === 0)) {
      errors.push(`Semantic application ${application.id} lacks verified current-run external evidence provenance.`);
    }
    if (!/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(application.scopeFingerprint)) {
      errors.push(`Semantic application ${application.id} lacks stable scope identity.`);
    }
    if (!/^[a-z][a-z0-9_]{0,127}$/.test(application.knowledgeSubjectCode)) {
      errors.push(`Semantic application ${application.id} has an invalid subject code.`);
    }
    if (foundation.identity.statementPeriod?.end !== application.asOf) {
      errors.push(`Semantic application ${application.id} is not bound to the statement period.`);
    }
    if (category && charge && (!charge.sourceOccurrenceRefs.includes(application.occurrenceRef) ||
      charge.category !== (application.value.kind === "mapping" ? application.value.canonicalCode : "") || charge.categoryResolution !== "proven" ||
      !charge.semanticApplicationRefs.includes(application.id))) {
      errors.push(`Semantic application ${application.id} is not exactly bound to its resolved category claim.`);
    }
  }
  for (const participant of layer.participants) {
    for (const ref of participant.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Participant ${participant.id} has broken evidence ref ${ref}.`);
    for (const ref of participant.externalEvidenceRefs) if (!externalEvidenceIds.has(ref)) errors.push(`Participant ${participant.id} has broken external evidence ref ${ref}.`);
    if (participant.roles.length === 0) errors.push(`Participant ${participant.id} requires at least one economic role.`);
    if (participant.roleResolution === "proven") {
      const application = participant.semanticApplicationRef ? semanticApplicationById.get(participant.semanticApplicationRef) : null;
      if (participant.evidenceRefs.length + participant.externalEvidenceRefs.length === 0 && application?.sourceKind !== "governed_rf_snapshot") {
        errors.push(`Proven participant roles ${participant.id} require evidence.`);
      }
      if (participant.periodApplicability !== "applicable") errors.push(`Proven participant roles ${participant.id} must be period-applicable.`);
      if (!POSITIVE_BASES.has(participant.assertionBasis) || participant.assertionBasis === "ai_hypothesis") errors.push(`Participant ${participant.id} roles use a non-proving assertion basis.`);
      if (!canonicalRoleProofRouteSatisfied({ derivabilityTier: participant.derivabilityTier,
        assertionBasis: participant.assertionBasis, sourceEvidenceRefs: participant.evidenceRefs,
        externalEvidenceRefs: participant.externalEvidenceRefs, semanticApplication: application })) {
        errors.push(`Proven participant roles ${participant.id} have inconsistent derivability and evidence provenance.`);
      }
    }
    if (participant.identityStatus === "proven" && (participant.identity === null || participant.evidenceRefs.length === 0)) {
      errors.push(`Proven participant ${participant.id} requires identity and evidence.`);
    }
    if (participant.identityStatus === "proven" && participant.periodApplicability !== "applicable") errors.push(`Proven participant ${participant.id} must be period-applicable.`);
    if (participant.identityStatus === "proven" && !POSITIVE_BASES.has(participant.assertionBasis)) errors.push(`Participant ${participant.id} uses a non-proving assertion basis.`);
    if (participant.semanticApplicationRef && !semanticApplicationById.has(participant.semanticApplicationRef)) {
      errors.push(`Participant ${participant.id} has a broken semantic application ref.`);
    }
    validatePeriod(participant.effectiveFrom, participant.effectiveTo, `Participant ${participant.id}`, errors);
  }

  for (const dependency of layer.dependencies) {
    for (const ref of dependency.claimRefs) {
      if (!roleClaimIds.has(ref)) errors.push(`Dependency ${dependency.id} has broken claim ref ${ref}.`);
      else if (!roleClaimById.get(ref)?.dependencyRefs.includes(dependency.id)) errors.push(`Dependency ${dependency.id} and role claim ${ref} do not reference each other.`);
    }
    for (const ref of dependency.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Dependency ${dependency.id} has broken evidence ref ${ref}.`);
    if (dependency.status === "satisfied_by_admitted_evidence" && dependency.evidenceRefs.length === 0) {
      errors.push(`Satisfied dependency ${dependency.id} requires admitted evidence.`);
    }
    validatePeriod(dependency.effectiveFrom, dependency.effectiveTo, `Dependency ${dependency.id}`, errors);
  }

  for (const claim of layer.roleClaims) {
    if (!chargeIds.has(claim.chargeRef)) errors.push(`Role claim ${claim.id} has broken charge ref.`);
    if (claim.participantRef && !participantIds.has(claim.participantRef)) errors.push(`Role claim ${claim.id} has broken participant ref.`);
    for (const ref of claim.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Role claim ${claim.id} has broken evidence ref ${ref}.`);
    for (const ref of claim.externalEvidenceRefs) if (!externalEvidenceIds.has(ref)) errors.push(`Role claim ${claim.id} has broken external evidence ref ${ref}.`);
    if (claim.semanticApplicationRef) {
      const application = semanticApplicationById.get(claim.semanticApplicationRef);
      if (!application || application.claimClass !== "participant_control_role" || application.chargeRef !== claim.chargeRef ||
        application.facet !== claim.dimension || application.value.kind !== "role" || application.value.state !== claim.resolution ||
        application.externalEvidenceRefs.some((ref) => !claim.externalEvidenceRefs.includes(ref))) {
        errors.push(`Role claim ${claim.id} has a broken or nonreciprocal semantic application.`);
      }
    }
    for (const ref of claim.dependencyRefs) if (!dependencyIds.has(ref)) errors.push(`Role claim ${claim.id} has broken dependency ref ${ref}.`);
    for (const ref of claim.dependencyRefs) {
      if (!dependencyById.get(ref)?.claimRefs.includes(claim.id)) errors.push(`Role claim ${claim.id} and dependency ${ref} do not reference each other.`);
    }
    if (claim.resolution === "proven") {
      if (claim.dimension === "constraint") {
        if (!claim.constraintCode) errors.push(`Proven constraint claim ${claim.id} requires a constraint code.`);
      } else if (!claim.participantRef) {
        errors.push(`Proven role claim ${claim.id} requires a participant.`);
      }
      const application = claim.semanticApplicationRef ? semanticApplicationById.get(claim.semanticApplicationRef) : null;
      if (claim.evidenceRefs.length + claim.externalEvidenceRefs.length === 0 && application?.sourceKind !== "governed_rf_snapshot") {
        errors.push(`Proven role claim ${claim.id} requires evidence.`);
      }
      if (claim.periodApplicability !== "applicable") errors.push(`Proven role claim ${claim.id} must be period-applicable.`);
      if (!POSITIVE_BASES.has(claim.assertionBasis)) errors.push(`Proven role claim ${claim.id} uses a non-proving assertion basis.`);
      if (claim.assertionBasis === "ai_hypothesis") errors.push(`AI cannot prove role claim ${claim.id}.`);
      if (!canonicalRoleProofRouteSatisfied({ derivabilityTier: claim.derivabilityTier,
        assertionBasis: claim.assertionBasis, sourceEvidenceRefs: claim.evidenceRefs,
        externalEvidenceRefs: claim.externalEvidenceRefs, semanticApplication: application })) {
        errors.push(`Proven role claim ${claim.id} has inconsistent derivability and evidence provenance.`);
      }
      if (claim.participantRef && participantById.get(claim.participantRef)?.roleResolution !== "proven") {
        errors.push(`Proven role claim ${claim.id} requires positively evidenced participant roles.`);
      }
      for (const ref of claim.dependencyRefs) {
        if (dependencyById.get(ref)?.status !== "satisfied_by_admitted_evidence") errors.push(`Proven role claim ${claim.id} has an unsatisfied dependency ${ref}.`);
      }
    }
    if ((claim.resolution === "unresolved" || claim.resolution === "conflicting") && claim.dependencyRefs.length === 0 && claim.limitations.length === 0) {
      errors.push(`Unresolved role claim ${claim.id} requires a dependency or limitation.`);
    }
    validatePeriod(claim.effectiveFrom, claim.effectiveTo, `Role claim ${claim.id}`, errors);
  }

  const contributorUse = new Map<string, string[]>();
  for (const charge of layer.charges) {
    validateCharge({
      charge,
      occurrenceIds,
      occurrenceById,
      representationById,
      evidenceIds,
      reconciliationIds,
      pricingComponentIds,
      pricingPopulationIds,
      roleClaimIds,
      dependencyIds,
      dependencyById,
      knowledgeApplicationIds,
      semanticApplicationById,
      errors,
    });
    if (charge.contributingOccurrenceRef) {
      contributorUse.set(charge.contributingOccurrenceRef, [...(contributorUse.get(charge.contributingOccurrenceRef) ?? []), charge.id]);
    }
  }
  for (const [occurrenceRef, charges] of contributorUse) {
    if (charges.length > 1) errors.push(`Source occurrence ${occurrenceRef} contributes to more than one economic charge.`);
  }

  const excludedOccurrenceRefs = new Set<string>();
  for (const exclusion of layer.nonFeeExclusions) {
    if (!occurrenceIds.has(exclusion.occurrenceRef)) errors.push(`Non-fee exclusion has broken occurrence ref ${exclusion.occurrenceRef}.`);
    if (excludedOccurrenceRefs.has(exclusion.occurrenceRef)) errors.push(`Occurrence ${exclusion.occurrenceRef} has duplicate non-fee exclusions.`);
    excludedOccurrenceRefs.add(exclusion.occurrenceRef);
    for (const ref of exclusion.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Non-fee exclusion has broken evidence ref ${ref}.`);
    if (exclusion.evidenceRefs.length === 0 || !POSITIVE_BASES.has(exclusion.assertionBasis) || exclusion.assertionBasis === "ai_hypothesis") {
      errors.push(`Non-fee exclusion ${exclusion.occurrenceRef} lacks positive admitted evidence.`);
    }
  }
  for (const occurrence of foundation.sourceModel.occurrences) {
    if (isNonFee(occurrence.semanticRole, occurrence.contributionRole) && !excludedOccurrenceRefs.has(occurrence.id)) {
      errors.push(`Non-fee occurrence ${occurrence.id} lacks an explicit RD exclusion.`);
    }
  }

  validateCostStack(analysis, errors);
  validateAmendments(analysis, errors);
  if (layer.roleClaims.some((claim) => claim.resolution === "unresolved" || claim.resolution === "conflicting")) {
    warnings.push("One or more participant/control roles remain unresolved.");
  }
  if (layer.costStack.completeness === "partial_but_financially_reconciled") warnings.push("The cost stack reconciles financially but remains semantically partial.");

  const result = {
    ...analysis,
    economicLayer: {
      ...layer,
      validation: {
        status: errors.length === 0 ? "valid" as const : "invalid" as const,
        errors: unique(errors),
        warnings: unique(warnings),
      },
    },
    validation: {
      status: errors.length === 0 ? "valid" as const : "invalid" as const,
      errors: unique(errors),
      warnings: unique(warnings),
    },
  };
  return result;
}

export function assertCanonicalEconomicsV2EconomicAnalysis(
  analysis: CanonicalEconomicsV2EconomicAnalysis,
): CanonicalEconomicsV2EconomicAnalysis {
  const validated = validateCanonicalEconomicsV2EconomicAnalysis(analysis);
  if (validated.validation.status === "invalid") throw new CanonicalEconomicsV2EconomicValidationError(validated);
  return validated;
}

function validateAdmission(
  analysis: CanonicalEconomicsV2EconomicAnalysis,
  evidenceIds: Set<string>,
  errors: string[],
  warnings: string[],
): void {
  const profile = analysis.economicLayer.admissionProfile;
  if (!profile.admissionId.trim()) errors.push("RD admission requires a versioned identity.");
  for (const ref of profile.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`RD admission has broken evidence ref ${ref}.`);
  if (profile.source === "versioned_template") {
    const template = analysis.pricingAnalysis.foundation.templateCapability;
    if (template.identityStatus !== "proven" || template.admissionStatus !== "admitted") {
      errors.push("Versioned RD admission requires proven, admitted RB template identity.");
    }
    if (analysis.pricingAnalysis.foundation.identity.provenanceStatus !== "authoritative") errors.push("Versioned RD admission requires authoritative source provenance.");
  }
  if (profile.source === "approved_synthetic" && analysis.pricingAnalysis.foundation.identity.provenanceStatus !== "approved_synthetic") {
    errors.push("Approved-synthetic RD admission requires approved-synthetic RB provenance.");
  }
  if (profile.source === "runtime_capability") {
    const foundation = analysis.pricingAnalysis.foundation;
    const feeTotal = foundation.templateCapability.capabilities.find((item) => item.capability === "fee_total");
    const feeDetail = foundation.templateCapability.capabilities.find((item) => item.capability === "fee_detail");
    const statementPeriod = foundation.templateCapability.capabilities.find((item) => item.capability === "statement_period");
    if (foundation.templateCapability.identityStatus !== "proven" ||
        foundation.templateCapability.admissionStatus !== "admitted" ||
        foundation.templateCapability.admissionAuthority === null ||
        feeTotal?.status !== "supported" || feeTotal.proofEvidenceRefs.length === 0) {
      errors.push("Capability-bound RD admission requires proven Fiserv identity and supported fee-total capability.");
    }
    const contributing = analysis.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_"));
    if (contributing.length > 0 && (feeDetail?.status !== "supported" || feeDetail.proofEvidenceRefs.length === 0)) {
      errors.push("Capability-bound contributing charges require supported fee-detail capability.");
    }
    if (contributing.length > 0 && !profile.statementPeriodApplicabilityProven) {
      errors.push("Capability-bound contributing charges require proven statement-period applicability.");
    }
    if (profile.statementPeriodApplicabilityProven &&
        (statementPeriod?.status !== "supported" || statementPeriod.proofEvidenceRefs.length === 0 || foundation.identity.statementPeriod === null)) {
      errors.push("Capability-bound statement-period applicability exceeds the supported statement-period capability.");
    }
    if (profile.feeDetailCoverage === "complete" &&
        (feeDetail?.status !== "supported" || feeDetail.proofEvidenceRefs.length === 0 || !profile.statementPeriodApplicabilityProven)) {
      errors.push("Complete capability-bound fee-detail coverage requires supported detail and period applicability.");
    }
    if (contributing.some((charge) => charge.categoryResolution === "proven" &&
      (charge.contributionStatus !== "contributes_classified" || charge.category === "unresolved_unclassified" ||
        charge.semanticApplicationRefs.length !== 1))) {
      errors.push("Capability-bound category semantics require exactly one admitted canonical semantic application.");
    }
    if (contributing.some((charge) => charge.categoryResolution !== "proven" &&
      (charge.contributionStatus !== "contributes_unresolved" || charge.category !== "unresolved_unclassified" ||
        charge.semanticApplicationRefs.length > 0))) {
      errors.push("Unresolved capability-bound categories cannot carry semantic-application authority.");
    }
    if (analysis.economicLayer.dependencies.length > 0 || contributing.some((charge) =>
      charge.pricingComponentRefs.length > 0 || charge.pricingPopulationRefs.length > 0 || charge.dependencyRefs.length > 0)) {
      errors.push("Capability-bound semantic convergence cannot create pricing or dependency semantics.");
    }
    for (const claim of analysis.economicLayer.roleClaims) {
      const application = claim.semanticApplicationRef ? analysis.economicLayer.semanticApplications
        .find((item) => item.id === claim.semanticApplicationRef) : null;
      if (!application || application.claimClass !== "participant_control_role" || claim.dimension === "constraint") {
        errors.push(`Capability-bound role claim ${claim.id} lacks an exact admitted non-constraint semantic application.`);
      }
    }
    for (const charge of contributing) {
      const occurrence = foundation.sourceModel.occurrences.find((item) => item.id === charge.contributingOccurrenceRef);
      if (!occurrence || occurrence.contributionRole !== "supporting_detail" ||
          !occurrence.limitations.includes(FISERV_FEE_LEDGER_OCCURRENCE_MARKER) ||
          !feeDetail?.proofEvidenceRefs.includes(occurrence.evidenceRef) ||
          !charge.supportingDetailAdmissionEvidenceRefs.includes(occurrence.evidenceRef)) {
        errors.push(`Capability-bound charge ${charge.id} lacks claim-scoped fee-detail proof.`);
      }
    }
    if (profile.feeDetailCoverage === "complete" && analysis.economicLayer.costStack.completeness === "financially_unreconciled") {
      errors.push("Complete capability-bound fee detail must reconcile to the authoritative statement fee total.");
    }
  }
  if (profile.source === "observational") {
    if (profile.feeDetailCoverage === "complete" || profile.feeDetailCoverage === "incomplete" || profile.statementPeriodApplicabilityProven) {
      errors.push("Observational RD admission cannot prove fee-detail coverage or statement-period applicability.");
    }
    if (analysis.economicLayer.charges.some((charge) => charge.contributionStatus.startsWith("contributes_"))) {
      errors.push("Observational RD admission cannot create contributing canonical charges.");
    }
    if (analysis.economicLayer.roleClaims.some((claim) => claim.resolution === "proven")) errors.push("Observational RD admission cannot prove participant/control roles.");
    warnings.push("RD observations remain non-authoritative pending source/template admission.");
  }
  if (analysis.economicLayer.semanticApplications.length > 0 && profile.source !== "runtime_capability") {
    errors.push("Canonical semantic applications are authorized only for the capability-bound production ledger.");
  }
  const unavailable = analysis.pricingAnalysis.foundation.identity.provenanceStatus === "source_unavailable" ||
    analysis.pricingAnalysis.foundation.identity.provenanceStatus === "corpus_integrity_hold";
  if (unavailable && analysis.economicLayer.charges.some((charge) => charge.contributionStatus.startsWith("contributes_"))) {
    errors.push("Unavailable or corpus-held sources cannot create contributing RD charges.");
  }
}

function validateCharge(input: {
  charge: CanonicalEconomicCharge;
  occurrenceIds: Set<string>;
  occurrenceById: Map<string, CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["sourceModel"]["occurrences"][number]>;
  representationById: Map<string, CanonicalEconomicsV2EconomicAnalysis["pricingAnalysis"]["foundation"]["sourceModel"]["representationGroups"][number]>;
  evidenceIds: Set<string>;
  reconciliationIds: Set<string>;
  pricingComponentIds: Set<string>;
  pricingPopulationIds: Set<string>;
  roleClaimIds: Set<string>;
  dependencyIds: Set<string>;
  dependencyById: Map<string, CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["dependencies"][number]>;
  knowledgeApplicationIds: Set<string>;
  semanticApplicationById: Map<string, CanonicalEconomicsV2EconomicAnalysis["economicLayer"]["semanticApplications"][number]>;
  errors: string[];
}): void {
  const { charge, errors } = input;
  for (const ref of charge.sourceOccurrenceRefs) if (!input.occurrenceIds.has(ref)) errors.push(`Charge ${charge.id} has broken occurrence ref ${ref}.`);
  for (const ref of charge.evidenceRefs) if (!input.evidenceIds.has(ref)) errors.push(`Charge ${charge.id} has broken evidence ref ${ref}.`);
  for (const ref of charge.supportingDetailAdmissionEvidenceRefs) if (!input.evidenceIds.has(ref)) errors.push(`Charge ${charge.id} has broken supporting-detail admission evidence ref ${ref}.`);
  for (const ref of charge.reconciliationRefs) if (!input.reconciliationIds.has(ref)) errors.push(`Charge ${charge.id} has broken reconciliation ref ${ref}.`);
  for (const ref of charge.pricingComponentRefs) if (!input.pricingComponentIds.has(ref)) errors.push(`Charge ${charge.id} has broken RC component ref ${ref}.`);
  for (const ref of charge.pricingPopulationRefs) if (!input.pricingPopulationIds.has(ref)) errors.push(`Charge ${charge.id} has broken RC population ref ${ref}.`);
  for (const ref of charge.roleClaimRefs) if (!input.roleClaimIds.has(ref)) errors.push(`Charge ${charge.id} has broken role-claim ref ${ref}.`);
  for (const ref of charge.dependencyRefs) if (!input.dependencyIds.has(ref)) errors.push(`Charge ${charge.id} has broken dependency ref ${ref}.`);
  for (const ref of charge.semanticApplicationRefs) {
    if (!input.knowledgeApplicationIds.has(ref)) errors.push(`Charge ${charge.id} has broken knowledge-application ref ${ref}.`);
    else if (input.semanticApplicationById.get(ref)?.chargeRef !== charge.id) errors.push(`Charge ${charge.id} has a nonreciprocal knowledge-application ref ${ref}.`);
  }
  const contributing = charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved";
  if (contributing) {
    if (!charge.contributingOccurrenceRef || !charge.sourceOccurrenceRefs.includes(charge.contributingOccurrenceRef)) errors.push(`Contributing charge ${charge.id} lacks its authoritative occurrence.`);
    if (!charge.observedAmount || charge.observedAmount.amountMinor < 0) errors.push(`Contributing charge ${charge.id} requires a non-negative observed magnitude.`);
    if (charge.financialDirection === "unresolved") errors.push(`Contributing charge ${charge.id} has unresolved direction.`);
    if (charge.statementPeriodApplicability !== "applicable") errors.push(`Contributing charge ${charge.id} is not period-applicable.`);
    if (!POSITIVE_BASES.has(charge.assertionBasis) || charge.assertionBasis === "ai_hypothesis") errors.push(`Contributing charge ${charge.id} lacks a positive deterministic assertion basis.`);
    if (!POSITIVE_TIERS.has(charge.derivabilityTier)) errors.push(`Contributing charge ${charge.id} uses an unresolved derivability tier.`);
    for (const ref of charge.dependencyRefs) {
      if (input.dependencyById.get(ref)?.status !== "satisfied_by_admitted_evidence") errors.push(`Contributing charge ${charge.id} has an unsatisfied dependency ${ref}.`);
    }
    const occurrence = charge.contributingOccurrenceRef ? input.occurrenceById.get(charge.contributingOccurrenceRef) : undefined;
    const roleCanContribute = occurrence?.contributionRole === "authoritative_contributor" ||
      (occurrence?.contributionRole === "supporting_detail" && Boolean(charge.supportingDetailAdmissionId) &&
        charge.supportingDetailAdmissionEvidenceRefs.length > 0 && Boolean(charge.supportingDetailAdmissionAssertionBasis) &&
        POSITIVE_BASES.has(charge.supportingDetailAdmissionAssertionBasis!) && charge.supportingDetailAdmissionAssertionBasis !== "ai_hypothesis" &&
        !charge.representationGroupRef) ||
      (occurrence?.contributionRole === "repeated_representation" && Boolean(charge.representationGroupRef));
    if (!occurrence || !["fee_charge", "fee_credit", "chargeback_fee"].includes(occurrence.semanticRole) || !roleCanContribute) {
      errors.push(`Contributing charge ${charge.id} is not grounded in an admitted fee occurrence.`);
    }
    if (occurrence && charge.observedAmount && Math.abs(occurrence.printedAmount?.amountMinor ?? Number.NaN) !== charge.observedAmount.amountMinor) {
      errors.push(`Charge ${charge.id} amount diverges from its RB occurrence.`);
    }
    if (occurrence?.semanticRole === "fee_credit" && charge.financialDirection !== "credit") errors.push(`Fee-credit charge ${charge.id} lost credit direction.`);
    if ((occurrence?.semanticRole === "fee_charge" || occurrence?.semanticRole === "chargeback_fee") && charge.financialDirection !== "debit") {
      errors.push(`Fee-debit charge ${charge.id} has incompatible direction.`);
    }
  }
  if (charge.contributionStatus === "contributes_classified" && (charge.categoryResolution !== "proven" || charge.category === "unresolved_unclassified")) {
    errors.push(`Classified charge ${charge.id} lacks a proven category.`);
  }
  if (charge.contributionStatus === "contributes_unresolved" && charge.category !== "unresolved_unclassified") {
    errors.push(`Unresolved contributing charge ${charge.id} cannot retain a resolved category.`);
  }
  if (charge.representationGroupRef) {
    const group = input.representationById.get(charge.representationGroupRef);
    if (!group) errors.push(`Charge ${charge.id} has broken representation-group ref.`);
    if (group && !charge.sourceOccurrenceRefs.every((ref) => group.occurrenceRefs.includes(ref))) errors.push(`Charge ${charge.id} representation lineage conflicts with RB.`);
    if (contributing && group?.authoritativeContributionOccurrenceRef !== charge.contributingOccurrenceRef) errors.push(`Charge ${charge.id} does not use the RB authoritative representation contributor.`);
  } else if (contributing && charge.sourceOccurrenceRefs.length > 1) {
    errors.push(`Charge ${charge.id} has multiple representations without an RB representation group.`);
  }
  validatePeriod(charge.effectiveFrom, charge.effectiveTo, `Charge ${charge.id}`, errors);
}

function validateCostStack(analysis: CanonicalEconomicsV2EconomicAnalysis, errors: string[]): void {
  const stack = analysis.economicLayer.costStack;
  const feeFact = analysis.pricingAnalysis.foundation.financialPopulations.totalStatementProcessingFees;
  const bucketKinds = stack.buckets.map((bucket) => bucket.kind).sort();
  if (JSON.stringify(bucketKinds) !== JSON.stringify([...EXPECTED_BUCKETS].sort())) errors.push("RD cost stack must contain exactly the approved buckets.");
  const chargeById = new Map(analysis.economicLayer.charges.map((charge) => [charge.id, charge]));
  const contributing = analysis.economicLayer.charges.filter((charge) => charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved");
  const expectedChargeNet = contributing.reduce((total, charge) => {
    const amount = charge.observedAmount?.amountMinor ?? 0;
    return total + (charge.financialDirection === "credit" ? -amount : amount);
  }, 0);
  if (stack.classifiedChargeNet.amountMinor !== expectedChargeNet) errors.push("RD classified charge net does not reconstruct from contributing charges.");
  const bucketChargeRefs = stack.buckets.flatMap((bucket) => bucket.chargeRefs);
  if (new Set(bucketChargeRefs).size !== bucketChargeRefs.length) errors.push("An economic charge contributes to more than one cost-stack bucket.");
  for (const ref of bucketChargeRefs) if (!chargeById.has(ref)) errors.push(`Cost stack has broken charge ref ${ref}.`);
  for (const charge of contributing) if (!bucketChargeRefs.includes(charge.id)) errors.push(`Contributing charge ${charge.id} is missing from the cost stack.`);
  for (const bucket of stack.buckets) {
    if (bucket.debitAmount.amountMinor < 0 || bucket.creditAmount.amountMinor < 0) errors.push(`Cost bucket ${bucket.kind} has a negative debit/credit magnitude.`);
    if (bucket.netAmount.amountMinor !== bucket.debitAmount.amountMinor - bucket.creditAmount.amountMinor) errors.push(`Cost bucket ${bucket.kind} has an invalid net.`);
  }
  const bucketNet = stack.buckets.reduce((total, bucket) => total + bucket.netAmount.amountMinor, 0);
  const remainder = stack.unresolvedRemainder?.amountMinor ?? 0;
  if (bucketNet !== expectedChargeNet + remainder) errors.push("RD cost buckets do not reconstruct from charges and unresolved remainder.");
  if (stack.statementFeeFactRef !== feeFact.id) errors.push("RD cost stack references the wrong RB fee fact.");
  if (feeFact.status === "available" && stack.authoritativeStatementFeeTotal?.amountMinor !== feeFact.value?.amountMinor) errors.push("RD authoritative fee total diverges from RB.");
  if (feeFact.status !== "available" && stack.completeness !== "not_derivable_from_document") errors.push("Unavailable RB fee total must make RD cost stack not derivable.");
  if (stack.completeness === "complete" && (stack.reconciliationDeltaMinor !== 0 || stack.unresolvedRemainder !== null || stack.buckets.find((bucket) => bucket.kind === "unresolved_cost")!.netAmount.amountMinor !== 0)) {
    errors.push("Complete RD cost stack cannot contain delta, remainder, or unresolved cost.");
  }
  if (stack.completeness === "complete_with_rounding") {
    const control = analysis.pricingAnalysis.foundation.reconciliation.find((item) => item.id === stack.reconciliationRef);
    const contributingOccurrenceRefs = analysis.economicLayer.charges
      .filter((charge) => charge.contributionStatus.startsWith("contributes_"))
      .map((charge) => charge.contributingOccurrenceRef)
      .filter((ref): ref is string => Boolean(ref));
    if (!control || control.status !== "pass_with_rounding" || stack.reconciliationDeltaMinor === 0 ||
      !control.factRefs.includes(feeFact.id) || !contributingOccurrenceRefs.every((ref) => control.occurrenceRefs.includes(ref))) {
      errors.push("Complete-with-rounding requires a fee-bound RB rounding control covering the authoritative fee fact and contributing fee occurrences.");
    }
  }
  if (stack.completeness === "partial_but_financially_reconciled" && stack.totalStatementProcessingCost === null) errors.push("Partial-but-reconciled stack must retain the authoritative statement cost.");
  if (stack.completeness === "financially_unreconciled" && stack.totalStatementProcessingCost !== null) errors.push("Financially unreconciled stack cannot assert total statement processing cost.");
  if (stack.totalStatementProcessingCost && stack.authoritativeStatementFeeTotal && stack.totalStatementProcessingCost.amountMinor !== stack.authoritativeStatementFeeTotal.amountMinor) {
    errors.push("RD total statement processing cost diverges from authoritative statement fees.");
  }
}

function validateAmendments(analysis: CanonicalEconomicsV2EconomicAnalysis, errors: string[]): void {
  const actual = analysis.economicLayer.semanticAmendments.map((item) => item.id).sort();
  const expected = [...RD_SEMANTIC_AMENDMENT_IDS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push("RD must declare exactly the six approved semantic amendments.");
}

function isNonFee(semanticRole: string, contributionRole: string): boolean {
  return contributionRole === "funding_only" || [
    "settlement_adjustment",
    "refund",
    "chargeback_principal_debit",
    "chargeback_representment",
    "funded_amount",
    "third_party_funding",
  ].includes(semanticRole);
}

function validatePeriod(from: string | null, to: string | null, label: string, errors: string[]): void {
  if (from && to && from > to) errors.push(`${label} has an invalid effective period.`);
}

function uniqueIds(items: Array<{ id: string }>, label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id.trim()) errors.push(`RD ${label} has an empty id.`);
    if (ids.has(item.id)) errors.push(`Duplicate RD ${label} id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
