import { digestCanonical } from "./runtime/integrityHashes.js";
import { persistedVerifiedEvidenceIntegrityValid } from "./runtime/rgEvidenceIntegrity.js";
import type { BuildCanonicalEconomicsV2SynthesisInput } from "./synthesisAnalysis.js";
import { canonicalJson } from "./canonicalJson.js";
import { CONTRACT_V1_1_SAFE_ACTION_CODES, CONTRACT_V1_SAFE_ACTION_CODES } from "./knowledge/knowledgeTypes.js";
import { CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1,
  CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1 } from "./synthesisContractV1Types.js";

export type CanonicalSynthesisContractV1Envelope = NonNullable<BuildCanonicalEconomicsV2SynthesisInput["contractV1"]>;

export function validateCanonicalSynthesisContractV1Envelope(envelope: CanonicalSynthesisContractV1Envelope): string[] {
  const errors: string[] = [];
  const contractId = envelope.contractId ?? CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1;
  const activeActions = contractId === CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1
    ? new Set<string>(CONTRACT_V1_SAFE_ACTION_CODES)
    : contractId === CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1
      ? new Set<string>(CONTRACT_V1_1_SAFE_ACTION_CODES) : null;
  if (!activeActions) errors.push("contract_binding_unknown");
  if (envelope.rfPrecedenceChecked !== true || !/^[a-f0-9]{64}$/.test(envelope.boundRfSnapshotHash)) {
    errors.push("contract_v1_rf_precedence_binding_invalid");
  }
  if (envelope.evidenceRegistry.validation.status !== "valid" || envelope.evidenceRegistry.validation.errors.length > 0) {
    errors.push("contract_v1_external_evidence_registry_invalid");
  }
  if (digestCanonical(envelope.evidenceRegistry.evidence) !== envelope.evidenceRegistry.registryHash) {
    errors.push("contract_v1_external_evidence_registry_hash_mismatch");
  }
  if (digestCanonical(envelope.applications) !== envelope.applicationHash) {
    errors.push("contract_v1_application_hash_mismatch");
  }
  const evidenceById = new Map(envelope.evidenceRegistry.evidence.map((item) => [item.evidenceId, item]));
  for (const evidence of envelope.evidenceRegistry.evidence) {
    const evidenceId = evidence.evidenceId;
    if (!persistedVerifiedEvidenceIntegrityValid(evidence)) errors.push(`contract_v1_evidence_integrity_invalid:${evidenceId}`);
  }
  for (const application of envelope.applications) {
    if (!application.exactFacetVerified || !application.scopeFingerprintVerified || application.chargeRefs.length === 0
      || application.occurrenceRefs.length === 0) errors.push(`contract_v1_application_binding_invalid:${application.applicationId}`);
    if (!facetValueMatches(application.facet, application.value.kind)) {
      errors.push(`contract_v1_application_facet_value_mismatch:${application.applicationId}`);
    }
    if ("safeActionCode" in application.value && !activeActions?.has(application.value.safeActionCode)) {
      errors.push(`contract_action_not_active_for_bound_version:${application.applicationId}`);
    }
    if (contractId === CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1
      && application.value.kind === "synthesis_safe_action"
      && application.value.safeActionCode === "request_pricing_application_review"
      && (application.value.requiredInfluence !== "none" || application.value.verificationRequirementCode === null
        || application.value.implementationDependencyCodes.length > 0)) {
      errors.push(`contract_v1_1_pricing_application_review_invalid:${application.applicationId}`);
    }
    if (application.sourceKind === "current_run_verified_rg_evidence") {
      if (application.assertionBasis !== "external_verified" || application.rfEntryRefs.length > 0 || application.evidenceRefs.length === 0) {
        errors.push(`contract_v1_current_run_provenance_invalid:${application.applicationId}`);
      }
      for (const ref of application.evidenceRefs) {
        const evidence = evidenceById.get(ref);
        if (!evidence || evidence.atomicClaimId !== application.atomicClaimId || evidence.facet !== application.facet
          || evidence.scopeFingerprint !== application.scopeFingerprint
          || canonicalJson(evidence.proposedValue) !== canonicalJson(application.value)
          || canonicalJson(evidence.statementPeriod) !== canonicalJson(application.statementPeriod)) {
          errors.push(`contract_v1_exact_evidence_binding_invalid:${application.applicationId}:${ref}`);
        }
      }
      if (application.value.kind === "synthesis_recurrence") {
        const recurrenceEvidence = application.evidenceRefs.map((ref) => evidenceById.get(ref)).filter(Boolean);
        if (application.value.recurrenceBasis !== "verified_schedule"
          || recurrenceEvidence.some((item) => !item
            || !["official_network_publication", "processor_publication"].includes(item.sourceAuthority))
          || application.derivabilityTier !== "requires_external_rule_or_schedule"
          || application.evidenceClass !== "public_documentation_verified") {
          errors.push(`contract_v1_recurrence_evidence_route_mismatch:${application.applicationId}`);
        }
      }
    } else {
      // Contract-v1 structured values are intentionally not registered as reusable RF value kinds in this slice.
      // Existing RF category/role authority remains first in RD; a future governed RF schema version must add
      // lossless synthesis values before an RF-origin synthesis application can be admitted here.
      errors.push(`contract_v1_rf_synthesis_value_not_catalog_representable:${application.applicationId}`);
    }
  }
  return [...new Set(errors)].sort();
}

function facetValueMatches(facet: string, kind: string): boolean {
  const expected: Record<string, string> = {
    constraint: "synthesis_constraint_identity",
    economic_driver: "synthesis_economic_driver",
    recurrence: "synthesis_recurrence",
    counterfactual: "synthesis_counterfactual",
    merchant_lever: "synthesis_safe_action",
    merchant_change_right: "synthesis_merchant_influence",
    merchant_operational_controllability: "synthesis_merchant_influence",
    constraint_action_effect: "synthesis_constraint_action_effect",
    constraint_condition: "synthesis_condition_state",
  };
  return expected[facet] === kind;
}
