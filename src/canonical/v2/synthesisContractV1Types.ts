import type { ContractV1SafeActionCode, CanonicalSynthesisKnowledgeValue } from "./knowledge/knowledgeTypes.js";
import type { CanonicalAtomicClaimFacet } from "./runtime/atomicClaims.js";
import type { CanonicalClaimMateriality } from "./runtime/materialityContract.js";
import type { CanonicalPricingAssertionBasis, CanonicalPricingDerivabilityTier } from "./pricingTypes.js";
import type { CanonicalSynthesisEvidenceClass } from "./synthesisTypes.js";

export const CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1 = "canonical_synthesis_admission_contract_v1" as const;
export const CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1 = "canonical_synthesis_admission_contract_v1_1" as const;
export type CanonicalSynthesisAdmissionContractId = typeof CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1
  | typeof CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1;

export type CanonicalSynthesisContractV1Application = {
  applicationId: string;
  atomicClaimId: string;
  facet: CanonicalAtomicClaimFacet;
  chargeRefs: string[];
  occurrenceRefs: string[];
  scopeFingerprint: string;
  statementPeriod: { start: string; end: string };
  sourceKind: "governed_rf_snapshot" | "current_run_verified_rg_evidence";
  value: CanonicalSynthesisKnowledgeValue;
  evidenceRefs: string[];
  rfEntryRefs: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  evidenceClass: CanonicalSynthesisEvidenceClass;
  assertionBasis: CanonicalPricingAssertionBasis;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  scopeFingerprintVerified: true;
  exactFacetVerified: true;
  materiality: CanonicalClaimMateriality;
};

export type CanonicalContractV1Constraint = {
  constraintId: string;
  atomicClaimId: string;
  constrainedChargeRefs: string[];
  identityResolutionState: "proven";
  applicabilityResolutionState: "proven";
  applicability: "applicable" | "not_applicable";
  governingAuthorityCode: string;
  governingSourceRefs: string[];
  scopeFingerprint: string;
  statementPeriod: { start: string; end: string };
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evidenceRefs: string[];
  sourceKind: CanonicalSynthesisContractV1Application["sourceKind"];
  limitations: string[];
};

export type CanonicalContractV1ConstraintActionEffect = {
  effectId: string;
  atomicClaimId: string;
  constraintRef: string;
  safeActionCode: ContractV1SafeActionCode;
  effectState: "blocks_action" | "conditions_action" | "does_not_restrict_this_action";
  effectResolutionState: "proven";
  conditionAtomicClaimIds: string[];
  dependencyCodes: string[];
  scopeFingerprint: string;
  statementPeriod: { start: string; end: string };
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalContractV1Action = {
  actionId: string;
  atomicClaimId: string;
  safeActionCode: ContractV1SafeActionCode;
  class: "candidate_verification" | "supported_action" | "supported_evidence_collection";
  state: "candidate_requires_verification" | "eligible_supported" | "documentation_or_monitoring_only" | "not_available" | "unresolved";
  chargeRefs: string[];
  mechanismCode: string;
  verificationRequirementCode: string | null;
  requestTargetCode: string | null;
  requiredInfluence: "none" | "merchant_change_right" | "merchant_operational_controllability" | "both";
  implementationDependencyCodes: string[];
  influenceApplicationRefs: string[];
  constraintEffectRefs: string[];
  counterfactualApplicationRef: string | null;
  recurrenceApplicationRef: string | null;
  materiality: CanonicalClaimMateriality;
  permissionCeiling: "verification_or_document_request" | "supported_action_no_quantified_impact"
    | "supported_action_with_statement_period_impact" | "supported_action_with_annual_impact" | "none";
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalSynthesisContractV1State = {
  contractId: CanonicalSynthesisAdmissionContractId;
  authority: "internal_canonical_analysis_run_only";
  customerReportAuthority: "unchanged";
  providerExecution: "not_executed_during_convergence";
  specializedFamilies: "inactive";
  applications: CanonicalSynthesisContractV1Application[];
  constraints: CanonicalContractV1Constraint[];
  constraintActionEffects: CanonicalContractV1ConstraintActionEffect[];
  actions: CanonicalContractV1Action[];
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};
