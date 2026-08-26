import type { MoneyAmount } from "../types.js";
import type {
  CanonicalPricingAssertionBasis,
  CanonicalPricingConfidence,
  CanonicalPricingDerivabilityTier,
  CanonicalEconomicsV2PricingAnalysis,
} from "./pricingTypes.js";
import type { CanonicalEconomicsV2DifferenceClassification, CanonicalEconomicsV2SourceProvenance } from "./types.js";

export type CanonicalEconomicParticipantRole =
  | "merchant"
  | "processor_platform"
  | "acquirer"
  | "iso_reseller_agent"
  | "gateway"
  | "network_card_brand"
  | "issuer_interchange_system"
  | "debit_network"
  | "service_provider"
  | "equipment_lessor"
  | "funding_provider"
  | "rule_regulatory_authority";

export type CanonicalEconomicIdentityStatus = "proven" | "observed_only" | "unresolved" | "conflicting" | "unavailable";
export type CanonicalEconomicResolutionState = "proven" | "unresolved" | "conflicting" | "unavailable" | "not_applicable";
export type CanonicalEconomicPeriodApplicability = "applicable" | "not_applicable" | "unproven";

export type CanonicalEconomicControlDimension =
  | "collector"
  | "billing_intermediary"
  | "economic_beneficiary"
  | "economic_owner"
  | "rule_setter"
  | "price_setter"
  | "negotiator_change_authority"
  | "contractual_controller"
  | "constraint";

export type CanonicalEconomicCategory =
  | "issuer_interchange_economics"
  | "network_card_brand_economics"
  | "processor_acquirer_pricing"
  | "processor_service_administrative_cost"
  | "third_party_service_equipment"
  | "operational_exception_penalty_fee"
  | "processing_fee_tax"
  | "other_source_grounded_fee"
  | "unresolved_unclassified";

export type CanonicalEconomicChargeSubtype =
  | "chargeback_fee"
  | "fee_credit"
  | "interchange"
  | "network_assessment"
  | "service_admin"
  | "equipment"
  | "other"
  | "unresolved";

export type CanonicalEconomicFinancialDirection = "debit" | "credit" | "unresolved";
export type CanonicalEconomicChargeStatus = "admitted" | "unresolved" | "conflicting" | "unavailable" | "excluded_non_fee";
export type CanonicalEconomicContributionStatus =
  | "contributes_classified"
  | "contributes_unresolved"
  | "blocked_direction"
  | "blocked_representation"
  | "noncontributing_support"
  | "excluded_non_fee";

export type CanonicalEconomicDependencyKind =
  | "requires_external_rule_or_schedule"
  | "requires_merchant_pricing_document"
  | "requires_processor_explanation"
  | "requires_additional_statement_history"
  | "requires_versioned_source_template_admission";

export type CanonicalEconomicDependencyStatus = "required" | "satisfied_by_admitted_evidence" | "conflicting" | "unavailable";

export type CanonicalEconomicAdmissionSource =
  | "approved_synthetic"
  | "versioned_template"
  | "runtime_capability"
  | "observational";
export type CanonicalEconomicFeeDetailCoverage = "complete" | "incomplete" | "unknown" | "unavailable";

export type CanonicalEconomicKnowledgeApplication = {
  id: string;
  claimRef: string;
  claimClass: "economic_category";
  chargeRef: string;
  occurrenceRef: string;
  category: Exclude<CanonicalEconomicCategory, "unresolved_unclassified">;
  knowledgeClaimType: "stable_facet_mapping";
  knowledgeSubjectCode: string;
  knowledgeSnapshotHash: string;
  selectedEntryRefs: string[];
  sourceAuthorities: string[];
  asOf: string;
  scopeFingerprint: string;
  limitations: string[];
};

export type CanonicalEconomicParticipant = {
  id: string;
  identity: string | null;
  identityStatus: CanonicalEconomicIdentityStatus;
  roles: CanonicalEconomicParticipantRole[];
  roleResolution: CanonicalEconomicResolutionState;
  processorTemplateScope: string | null;
  periodApplicability: CanonicalEconomicPeriodApplicability;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evidenceRefs: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence: CanonicalPricingConfidence;
  limitations: string[];
};

export type CanonicalEconomicEvidenceDependency = {
  id: string;
  kind: CanonicalEconomicDependencyKind;
  status: CanonicalEconomicDependencyStatus;
  claimRefs: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicControlRoleClaim = {
  id: string;
  chargeRef: string;
  dimension: CanonicalEconomicControlDimension;
  participantRef: string | null;
  constraintCode: string | null;
  resolution: CanonicalEconomicResolutionState;
  periodApplicability: CanonicalEconomicPeriodApplicability;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  evidenceRefs: string[];
  dependencyRefs: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence: CanonicalPricingConfidence;
  limitations: string[];
};

export type CanonicalEconomicCharge = {
  id: string;
  status: CanonicalEconomicChargeStatus;
  sourceOccurrenceRefs: string[];
  representationGroupRef: string | null;
  contributingOccurrenceRef: string | null;
  supportingDetailAdmissionId: string | null;
  supportingDetailAdmissionEvidenceRefs: string[];
  supportingDetailAdmissionAssertionBasis: CanonicalPricingAssertionBasis | null;
  pricingComponentRefs: string[];
  pricingPopulationRefs: string[];
  observedAmount: MoneyAmount | null;
  financialDirection: CanonicalEconomicFinancialDirection;
  category: CanonicalEconomicCategory;
  categoryResolution: CanonicalEconomicResolutionState;
  subtype: CanonicalEconomicChargeSubtype;
  contributionStatus: CanonicalEconomicContributionStatus;
  statementPeriodApplicability: CanonicalEconomicPeriodApplicability;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  roleClaimRefs: string[];
  dependencyRefs: string[];
  knowledgeApplicationRefs: string[];
  evidenceRefs: string[];
  reconciliationRefs: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  confidence: CanonicalPricingConfidence;
  limitations: string[];
};

export type CanonicalEconomicNonFeeExclusionReason =
  | "settlement_adjustment"
  | "sales_refund"
  | "chargeback_principal"
  | "chargeback_representment"
  | "reserve_or_funding_correction"
  | "funding_activity"
  | "non_processing_tax"
  | "other_non_fee";

export type CanonicalEconomicNonFeeExclusion = {
  occurrenceRef: string;
  reason: CanonicalEconomicNonFeeExclusionReason;
  evidenceRefs: string[];
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  limitations: string[];
};

export type CanonicalEconomicCostBucketKind =
  | "issuer_interchange_cost"
  | "network_card_brand_cost"
  | "processor_controlled_pricing"
  | "processor_service_admin_cost"
  | "third_party_equipment_cost"
  | "operational_penalty_cost"
  | "processing_fee_taxes"
  | "other_source_grounded_fee"
  | "unresolved_cost";

export type CanonicalEconomicCostBucket = {
  kind: CanonicalEconomicCostBucketKind;
  debitAmount: MoneyAmount;
  creditAmount: MoneyAmount;
  netAmount: MoneyAmount;
  chargeRefs: string[];
};

export type CanonicalEconomicCostStackCompleteness =
  | "complete"
  | "complete_with_rounding"
  | "partial_but_financially_reconciled"
  | "not_derivable_from_document"
  | "financially_unreconciled";

export type CanonicalEconomicCostStack = {
  statementFeeFactRef: string;
  authoritativeStatementFeeTotal: MoneyAmount | null;
  buckets: CanonicalEconomicCostBucket[];
  classifiedChargeNet: MoneyAmount;
  unresolvedRemainder: MoneyAmount | null;
  totalStatementProcessingCost: MoneyAmount | null;
  reconciliationDeltaMinor: number | null;
  reconciliationRef: string | null;
  completeness: CanonicalEconomicCostStackCompleteness;
  limitations: string[];
};

export type CanonicalEconomicSemanticAmendmentId =
  | "RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY"
  | "RD-AMEND-002-INDEPENDENT-CONTROL-ROLES"
  | "RD-AMEND-003-POSITIVE-IDENTIFICATION"
  | "RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK"
  | "RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION"
  | "RD-AMEND-006-STATEMENT-COST-NOT-TOTAL-ACCEPTANCE-COST";

export type CanonicalEconomicSemanticAmendment = {
  id: CanonicalEconomicSemanticAmendmentId;
  economicRefs: string[];
  reason: string;
};

export type CanonicalEconomicsV2EconomicVersionManifest = {
  schemaVersion: "canonical_economics_v2_economic_analysis_v1";
  builderVersion: "canonical_economics_v2_economic_builder_v2";
  chargeIdentityPolicyVersion: "canonical_economic_charge_identity_v2_v2";
  participantControlPolicyVersion: "canonical_economic_participant_control_v2_v2";
  costStackPolicyVersion: "canonical_economic_cost_stack_v2_v2";
  authority: "shadow_non_authoritative";
  persistence: "none";
  customerExposure: "none";
  aiResearchAuthority: "prohibited";
  reportAuthority: "prohibited";
  totalAcceptanceCostAuthority: "prohibited";
};

export type CanonicalEconomicAdmissionProfile = {
  source: CanonicalEconomicAdmissionSource;
  admissionId: string;
  feeDetailCoverage: CanonicalEconomicFeeDetailCoverage;
  statementPeriodApplicabilityProven: boolean;
  evidenceRefs: string[];
  limitations: string[];
};

export type CanonicalEconomicsV2EconomicLayer = {
  pricingSchemaVersion: CanonicalEconomicsV2PricingAnalysis["versionManifest"]["schemaVersion"];
  sourceProvenance: CanonicalEconomicsV2SourceProvenance;
  admissionProfile: CanonicalEconomicAdmissionProfile;
  participants: CanonicalEconomicParticipant[];
  charges: CanonicalEconomicCharge[];
  roleClaims: CanonicalEconomicControlRoleClaim[];
  dependencies: CanonicalEconomicEvidenceDependency[];
  knowledgeApplications: CanonicalEconomicKnowledgeApplication[];
  nonFeeExclusions: CanonicalEconomicNonFeeExclusion[];
  costStack: CanonicalEconomicCostStack;
  semanticAmendments: CanonicalEconomicSemanticAmendment[];
  limitations: string[];
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalEconomicsV2EconomicAnalysis = {
  versionManifest: CanonicalEconomicsV2EconomicVersionManifest;
  pricingAnalysis: CanonicalEconomicsV2PricingAnalysis;
  economicLayer: CanonicalEconomicsV2EconomicLayer;
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type CanonicalEconomicComparisonItem = {
  fact: string;
  classification: CanonicalEconomicsV2DifferenceClassification;
  amendmentId: CanonicalEconomicSemanticAmendmentId | null;
  reasonCode: string;
};

export type CanonicalEconomicComparisonReport = {
  policyVersion: "canonical_legacy_v2_economic_shadow_comparison_v2";
  items: CanonicalEconomicComparisonItem[];
  counts: Record<CanonicalEconomicsV2DifferenceClassification, number>;
  hasUnexpectedDivergence: boolean;
};

export type CanonicalEconomicPrivacySafeDiagnostics = {
  schemaVersion: CanonicalEconomicsV2EconomicVersionManifest["schemaVersion"];
  validationStatus: "valid" | "invalid";
  chargeCount: number;
  participantCount: number;
  unresolvedRoleCount: number;
  dependencyCount: number;
  categoryCounts: Record<CanonicalEconomicCategory, number>;
  stackCompleteness: CanonicalEconomicCostStackCompleteness;
  stackReconciliationState: "reconciled" | "reconciled_with_rounding" | "partial_reconciled" | "unreconciled" | "unavailable";
  amendmentCounts: Record<CanonicalEconomicSemanticAmendmentId, number>;
  comparisonCounts: Record<CanonicalEconomicsV2DifferenceClassification, number> | null;
  hasUnexpectedDivergence: boolean;
};
