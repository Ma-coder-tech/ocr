import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { GoldAssertion, GoldCase, GoldContract } from "./gold-contract-lib.js";

export const CONTRACT_VERSION = "ratereveal_gold_authority_derivability_contract_v1" as const;
export const REGISTER_VERSION = "ratereveal_gold_authority_derivability_register_v1" as const;
export const SCHEMA_VERSION = "ratereveal_gold_authority_derivability_schema_v1" as const;
export const MANIFEST_VERSION = "ratereveal_gold_authority_derivability_freeze_manifest_v1" as const;
export const FREEZE_DATE = "2026-09-19" as const;

export const reasoningClasses = [
  "direct_observation",
  "deterministic_calculation",
  "template_structural_inference",
  "economic_structural_inference",
  "governed_public_dependency",
  "merchant_private_dependency",
  "product_policy_judgment",
] as const;

export const resolutionStatuses = [
  "supported",
  "partially_supported",
  "unresolved",
  "refused",
  "source_mapping_incomplete",
  "source_unavailable",
  "gold_ambiguity",
  "policy_blocked",
] as const;

export const authorityLanes = [
  "statement_source_document",
  "deterministic_arithmetic",
  "versioned_template_mapping",
  "statement_structural_evidence",
  "governed_network_regulator",
  "governed_processor_acquirer_publication",
  "governed_public_mixed",
  "merchant_private_contract_or_correspondence",
  "reviewed_product_policy",
  "synthetic_falsification_input",
] as const;

export const universalityScopes = [
  "universal_acquiring_accounting",
  "network_specific",
  "processor_family_specific",
  "template_specific",
  "merchant_account_specific",
  "product_policy_only",
] as const;

export const sourceExecutionStatuses = [
  "source_executable",
  "not_source_executable",
  "source_unavailable",
  "synthetic_executable",
  "product_policy_executable",
] as const;

export const evaluationOutcomes = [
  "correct_answer",
  "correct_refusal",
  "unsupported_inference",
  "incorrect_conclusion",
  "extraction_failure",
  "missing_source_authority",
  "gold_ambiguity",
  "source_mapping_incomplete",
  "policy_mismatch",
] as const;

export type ReasoningClass = (typeof reasoningClasses)[number];
export type ResolutionStatus = (typeof resolutionStatuses)[number];
export type AuthorityLane = (typeof authorityLanes)[number];
export type UniversalityScope = (typeof universalityScopes)[number];
export type SourceExecutionStatus = (typeof sourceExecutionStatuses)[number];
export type EvaluationOutcome = (typeof evaluationOutcomes)[number];

type DecompositionKind =
  | "none"
  | "structure"
  | "wording_policy"
  | "statement_group"
  | "normalized_identity"
  | "relationship"
  | "supported_component"
  | "unresolved_component";

export type NormalizedAuthorityAssertion = {
  assertionId: string;
  caseId: string;
  lineage: {
    sourceAssertionId: string;
    decompositionKind: DecompositionKind;
    preservesOriginalExpected: boolean;
    sourceFieldOrConclusion: string;
  };
  subject: { type: string; reference: string };
  claim: {
    dimension: string;
    semantic: string;
    polarity: "required" | "prohibited";
    expected: unknown;
    scope: string;
  };
  reasoning: {
    primaryClass: ReasoningClass;
    allowedClasses: ReasoningClass[];
    requiredClasses: ReasoningClass[];
    prohibitedShortcuts: string[];
    missingAuthorityBehavior: string;
  };
  authority: {
    primaryLane: AuthorityLane;
    requiredLanes: AuthorityLane[];
    currentStatus: "sufficient" | "insufficient" | "source_mapping_incomplete" | "source_unavailable";
    sourceIdentityStatus: "pending_authoritative_mapping" | "unresolved_identity" | "source_unavailable" | "synthetic" | "not_applicable_policy";
    sourceProvenanceStatus: "unproven" | "unverified" | "synthetic_authored" | "not_applicable_policy";
  };
  temporal: {
    effectivePeriodDependency: boolean;
    effectivePeriod: string | null;
    historicalConstraint: "period_scoped" | "not_time_sensitive";
    backProjectionProhibited: boolean;
  };
  universality: UniversalityScope;
  resolution: {
    status: ResolutionStatus;
    expectedEvaluationOutcome: EvaluationOutcome;
    semanticStatus: ResolutionStatus;
    semanticEvaluationOutcome: EvaluationOutcome;
    abstentionAllowed: boolean;
    abstentionRequiredWhenAuthorityMissing: boolean;
    missingAuthorityReason: string | null;
    blockedDownstreamDimensions: string[];
  };
  productPolicy: {
    dependsOnReviewedPolicy: boolean;
    customerWordingCeiling: string;
    actionCeiling: string;
  };
  provenance: {
    semanticStatus: "product_owner_approved" | "product_owner_approved_via_lineage";
    sourceExecutionStatus: SourceExecutionStatus;
    evidenceMappingStatus: GoldAssertion["evidence_mapping_status"];
    sourceRefs: string[];
    statementEvidenceRefs: string[];
  };
  adjudication: {
    status: "frozen" | "frozen_with_source_gap" | "frozen_historical_guidance";
    canonicalConflictStatus: "none_known" | "current_behavior_stronger_than_gold" | "current_numeric_or_precision_conflict";
    productClarificationRequired: boolean;
    notes: string[];
  };
};

export type NormalizedAuthorityRegister = {
  schemaVersion: typeof REGISTER_VERSION;
  contractVersion: typeof CONTRACT_VERSION;
  frozenAt: typeof FREEZE_DATE;
  sourceGold: {
    schemaVersion: string;
    frozenArtifact: string;
    conversionStatus: string;
    originalAssertionCount: number;
  };
  freezeSemantics: {
    authorizes: string[];
    doesNotAuthorize: string[];
  };
  normativeRules: {
    independentClaimDimensions: string[];
    completenessGates: Array<{ id: string; requiredEvidence: string[]; doesNotImply: string[] }>;
    denominatorPolicies: Array<{ id: string; denominator: string; separatelyAccountFor: string[] }>;
    strongClaimGates: Array<{ id: string; requiredEvidence: string[]; missingAuthorityOutcome: string; prohibitedShortcut: string }>;
    zeroToleranceErrors: string[];
    passingAbstentionOutcome: string;
  };
  decomposition: {
    adjudicatedMixedAssertionCount: number;
    decomposedOriginalAssertionCount: number;
    reannotatedOriginalAssertionCount: number;
    normalizedAssertionCount: number;
  };
  caseProvenance: Array<{
    caseId: string;
    caseKind: "real_statement" | "synthetic_adversarial" | "global_policy";
    originalAssertionCount: number;
    normalizedAssertionCount: number;
    semanticStatus: string;
    sourceIdentityStatus: string;
    sourceExecutionStatus: SourceExecutionStatus;
    provenanceStatus: string;
    limitation: string | null;
  }>;
  counts: {
    reasoningClass: Record<string, number>;
    primaryAuthorityLane: Record<string, number>;
    resolutionStatus: Record<string, number>;
    semanticResolutionStatus: Record<string, number>;
    sourceExecutionStatus: Record<string, number>;
    sourceIdentityStatus: Record<string, number>;
    sourceProvenanceStatus: Record<string, number>;
    evidenceMappingStatus: Record<string, number>;
    semanticApprovalStatus: Record<string, number>;
    evaluationOutcome: Record<string, number>;
    semanticEvaluationOutcome: Record<string, number>;
    canonicalConflictStatus: Record<string, number>;
  };
  assertions: NormalizedAuthorityAssertion[];
};

export const mixedAssertionIds = new Set([
  "G1-PRICE-UNDERLYING", "G1-PRICE-SHAPE", "G1-PRICE-SCOPE", "G1-PRICE-SUMMARY", "G1-INTERCHANGE-DIFFERENCE",
  "G2-PRICE-UNDERLYING", "G2-PRICE-SHAPE", "G2-PRICE-SCOPE", "G2-PRICE-SUMMARY",
  "G3-PRICE-UNDERLYING", "G3-PRICE-SHAPE", "G3-PRICE-SCOPE",
  "G4-PRICE-UNDERLYING", "G4-PRICE-SHAPE", "G4-PRICE-SCOPE", "G4-PRICE-SUMMARY",
  "G4-REG-DEBIT-VOLUME", "G4-REG-DEBIT-COST", "G4-REWARDS-VOLUME", "G4-WATS",
  "G4-REG-DEBIT-SHARE", "G4-REG-DEBIT-COST-RATE", "G4-REWARDS-VOLUME-SHARE", "G4-REWARDS-COST-SHARE",
  "G5-PRICE-UNDERLYING", "G5-PRICE-SHAPE", "G5-PRICE-SCOPE", "G5-PRICE-SUMMARY",
  "G5-PREMIUM-VOLUME", "G5-PREMIUM-VOLUME-SHARE", "G5-PREMIUM-COST-SHARE",
  "G6-PRICE-UNDERLYING", "G6-PRICE-SHAPE", "G6-PRICE-SCOPE", "G6-PRICE-SUMMARY", "G6-SECURITY-PRIORITY", "G6-NON-AMEX-SCOPE",
  "G7-PRICE-UNDERLYING", "G7-PRICE-SHAPE", "G7-PRICE-SCOPE", "G7-PRICE-SUMMARY", "G7-OTHER-COMPONENTS",
  "G8-PRICE-UNDERLYING", "G8-PRICE-SHAPE", "G8-PRICE-SCOPE", "G8-PRICE-SUMMARY", "G8-PRICING-BASE",
  "G9-RATE-INTERPRETATION", "G9-PRICE-SUMMARY",
]);

const priceSummaryIds = new Set(["G1", "G2", "G4", "G5", "G6", "G7", "G8", "G9"].map((id) => `${id}-PRICE-SUMMARY`));
const normalizedIdentityIds = new Set([
  "G4-REG-DEBIT-VOLUME", "G4-REG-DEBIT-COST", "G4-REWARDS-VOLUME", "G4-WATS",
  "G4-REG-DEBIT-SHARE", "G4-REG-DEBIT-COST-RATE", "G4-REWARDS-VOLUME-SHARE", "G4-REWARDS-COST-SHARE",
  "G5-PREMIUM-VOLUME", "G5-PREMIUM-VOLUME-SHARE", "G5-PREMIUM-COST-SHARE",
]);

export const decomposedAssertionIds = new Set([
  ...priceSummaryIds,
  ...normalizedIdentityIds,
  "G1-INTERCHANGE-DIFFERENCE",
  "G7-OTHER-COMPONENTS",
]);

export const reannotatedMixedAssertionIds = new Set([...mixedAssertionIds].filter((id) => !decomposedAssertionIds.has(id)));

const reviewedStrongBehaviorConflicts = new Set([
  "G1-NO-EXACT-OWNER",
  "G4-NO-EXACT-OWNER",
  "G4-NO-RATE-VERDICT",
  "G7-NO-EXACT-OWNER",
  "G7-NO-RATE-VERDICT",
  "G8-NO-BUNDLED-BENCHMARK",
  "G8-NO-SAVINGS",
]);

const reviewedNumericConflicts = new Set(["G3-RATE-STATE", "G3-NO-NUMERIC-RATE", "G5-RATE"]);

type DecompositionDescriptor = {
  suffix: string;
  kind: DecompositionKind;
  preservesOriginalExpected: boolean;
  expected?: unknown;
  semanticSuffix: string;
  reasoningOverride?: ReasoningClass;
  dimensionOverride?: string;
};

export function buildNormalizedRegister(contract: GoldContract): NormalizedAuthorityRegister {
  const originalAssertions = [...contract.cases.flatMap((item) => item.assertions), ...contract.global_assertions];
  const casesById = new Map(contract.cases.map((item) => [item.case_id, item]));
  const assertions = originalAssertions.flatMap((assertion) =>
    decompositionsFor(assertion).map((descriptor) => normalizeAssertion(assertion, casesById.get(assertion.case_id), descriptor)),
  );

  const lineageIds = new Set(assertions.map((item) => item.lineage.sourceAssertionId));
  for (const assertion of originalAssertions) {
    if (!lineageIds.has(assertion.assertion_id)) throw new Error(`Missing normalized lineage for ${assertion.assertion_id}.`);
  }

  const caseProvenance = [
    ...contract.cases.map((item) => caseProvenanceFor(item, assertions)),
    {
      caseId: "GLOBAL",
      caseKind: "global_policy" as const,
      originalAssertionCount: contract.global_assertions.length,
      normalizedAssertionCount: assertions.filter((item) => item.caseId === "GLOBAL").length,
      semanticStatus: "product_owner_approved",
      sourceIdentityStatus: "not_applicable_policy",
      sourceExecutionStatus: "product_policy_executable" as const,
      provenanceStatus: "not_applicable_policy",
      limitation: null,
    },
  ];

  return {
    schemaVersion: REGISTER_VERSION,
    contractVersion: CONTRACT_VERSION,
    frozenAt: FREEZE_DATE,
    sourceGold: {
      schemaVersion: contract.schema_version,
      frozenArtifact: contract.frozen_artifact,
      conversionStatus: contract.conversion_status,
      originalAssertionCount: originalAssertions.length,
    },
    freezeSemantics: {
      authorizes: [
        "Future engineering specifications may use this frozen claim, reasoning, authority, provenance, and refusal contract.",
        "Future Gold evaluations may measure each frozen evaluation outcome independently.",
      ],
      doesNotAuthorize: [
        "Production parser, canonical classification, opportunity, report, or customer-output changes.",
        "Phase 2 evidence admission or live research changes.",
        "Private-document infrastructure or knowledge-corpus migration.",
        "A universal fee taxonomy, completed source mappings, or source executability for G1-G9.",
      ],
    },
    normativeRules: {
      independentClaimDimensions: [
        "observation", "calculation", "template_relationship", "economic_broad_category", "official_normalized_identity",
        "pricing_architecture", "biller_statement_issuer", "collector", "economic_beneficiary", "contractual_controller",
        "merchant_facing_price_controller", "retained_margin_recipient", "reference_comparison", "contractual_pass_through",
        "recurrence", "cadence", "annualization_permission", "annualized_amount", "estimated_annual_amount",
        "benchmark", "counterfactual", "actionability", "savings", "product_policy", "resolution",
      ],
      completenessGates: [
        { id: "observed_page_fact", requiredEvidence: ["accepted_page_or_section", "bounded_source_location"], doesNotImply: ["statement_total", "pricing_architecture", "savings"] },
        { id: "statement_total", requiredEvidence: ["contributing_sections_and_pages", "gross_fee_reconciliation", "sign_conventions"], doesNotImply: ["fee_composition", "savings"] },
        { id: "fee_composition", requiredEvidence: ["printed_gross_fees", "credits_and_adjustments_separately_identified", "repeated_representations", "unresolved_and_excluded_amounts"], doesNotImply: ["exact_normalized_identity", "savings"] },
        { id: "pricing_architecture", requiredEvidence: ["sufficient_accepted_document_scope", "independent_pricing_axes", "structural_support_beyond_labels"], doesNotImply: ["processor_markup", "pricing_fairness"] },
        { id: "comparison", requiredEvidence: ["compatible_identity", "scope", "population", "denominator", "effective_period", "reference_authority"], doesNotImply: ["contractual_pass_through", "savings"] },
        { id: "actionability", requiredEvidence: ["dimension_specific_control_authority", "merchant_applicability", "reviewed_product_policy"], doesNotImply: ["removability", "savings"] },
        { id: "savings", requiredEvidence: ["valid_named_counterfactual", "target_authority", "compatible_identity_scope_population_denominator_period", "merchant_applicability", "recurrence_or_cadence", "document_completeness", "non_overlap"], doesNotImply: ["retained_processor_profit"] },
      ],
      denominatorPolicies: [
        { id: "accounting_completeness", denominator: "printed_gross_fees", separatelyAccountFor: ["reconciled_contributing_charges", "sign_conventions"] },
        { id: "economic_classification_completeness", denominator: "printed_gross_fees", separatelyAccountFor: ["credits", "adjustments", "unresolved_gross_charges"] },
        { id: "merchant_facing_completeness", denominator: "printed_gross_fees", separatelyAccountFor: ["unresolved_amounts", "excluded_amounts", "repeated_representations", "credits", "adjustments", "partial_document_coverage"] },
      ],
      strongClaimGates: [
        { id: "processor_markup", requiredEvidence: ["observed_merchant_facing_component", "compatible_underlying_cost_or_merchant_private_processor_control"], missingAuthorityOutcome: "refused", prohibitedShortcut: "label_position_percentage_or_brand_as_markup" },
        { id: "reference_rate_equality", requiredEvidence: ["observed_rate", "observed_basis", "admitted_reference", "publisher", "effective_period", "scope_and_population", "approved_tolerance"], missingAuthorityOutcome: "reference_scope_or_period_insufficient", prohibitedShortcut: "rate_match_as_proven_at_cost" },
        { id: "contractual_pass_through", requiredEvidence: ["merchant_private_contractual_terms", "separately_billed_spread_analysis", "processor_retention_evidence"], missingAuthorityOutcome: "contractual_pass_through_unverified", prohibitedShortcut: "reference_equality_as_contractual_truth" },
        { id: "recurrence", requiredEvidence: ["explicit_statement_cadence_or_repeated_compatible_statements_or_effective_dated_program_cadence_or_merchant_private_agreement"], missingAuthorityOutcome: "unresolved", prohibitedShortcut: "single_unlabeled_occurrence_as_monthly" },
        { id: "annualization", requiredEvidence: ["observed_statement_period_amount", "proven_recurrence", "frequency", "annualization_permission"], missingAuthorityOutcome: "refused", prohibitedShortcut: "observed_period_amount_as_annualized_amount" },
        { id: "savings", requiredEvidence: ["named_counterfactual", "target_authority", "compatible_fee_identity", "scope", "population", "denominator", "historical_effective_period", "merchant_applicability", "recurrence_cadence", "document_completeness", "no_overlap"], missingAuthorityOutcome: "refused", prohibitedShortcut: "observed_cost_as_savings" },
      ],
      zeroToleranceErrors: ["unsupported_positive_admission", "evidence_lane_leakage", "historical_back_projection", "merchant_private_to_global_unreviewed_promotion"],
      passingAbstentionOutcome: "correct_refusal",
    },
    decomposition: {
      adjudicatedMixedAssertionCount: mixedAssertionIds.size,
      decomposedOriginalAssertionCount: decomposedAssertionIds.size,
      reannotatedOriginalAssertionCount: reannotatedMixedAssertionIds.size,
      normalizedAssertionCount: assertions.length,
    },
    caseProvenance,
    counts: {
      reasoningClass: countBy(assertions, (item) => item.reasoning.primaryClass),
      primaryAuthorityLane: countBy(assertions, (item) => item.authority.primaryLane),
      resolutionStatus: countBy(assertions, (item) => item.resolution.status),
      semanticResolutionStatus: countBy(assertions, (item) => item.resolution.semanticStatus),
      sourceExecutionStatus: countBy(assertions, (item) => item.provenance.sourceExecutionStatus),
      sourceIdentityStatus: countBy(assertions, (item) => item.authority.sourceIdentityStatus),
      sourceProvenanceStatus: countBy(assertions, (item) => item.authority.sourceProvenanceStatus),
      evidenceMappingStatus: countBy(assertions, (item) => item.provenance.evidenceMappingStatus),
      semanticApprovalStatus: countBy(assertions, (item) => item.provenance.semanticStatus),
      evaluationOutcome: countBy(assertions, (item) => item.resolution.expectedEvaluationOutcome),
      semanticEvaluationOutcome: countBy(assertions, (item) => item.resolution.semanticEvaluationOutcome),
      canonicalConflictStatus: countBy(assertions, (item) => item.adjudication.canonicalConflictStatus),
    },
    assertions,
  };
}

function decompositionsFor(assertion: GoldAssertion): DecompositionDescriptor[] {
  const id = assertion.assertion_id;
  if (priceSummaryIds.has(id)) {
    return [
      { suffix: "STRUCTURE", kind: "structure", preservesOriginalExpected: true, semanticSuffix: "Structural pricing architecture", reasoningOverride: "economic_structural_inference", dimensionOverride: "pricing.architecture" },
      { suffix: "WORDING", kind: "wording_policy", preservesOriginalExpected: false, expected: { kind: "state", state: "bounded_summary_wording_required" }, semanticSuffix: "Customer-summary authority ceiling", reasoningOverride: "product_policy_judgment", dimensionOverride: "policy.customer_wording" },
    ];
  }
  if (normalizedIdentityIds.has(id)) {
    return [
      { suffix: "STATEMENT-GROUP", kind: "statement_group", preservesOriginalExpected: true, semanticSuffix: "Statement-observed labeled group", dimensionOverride: observedDimensionFor(assertion.field_or_conclusion) },
      { suffix: "OFFICIAL-IDENTITY", kind: "normalized_identity", preservesOriginalExpected: false, expected: { kind: "state", state: "requires_governed_public_identity_mapping" }, semanticSuffix: "Official normalized identity authority", reasoningOverride: "governed_public_dependency", dimensionOverride: "economic.normalized_identity" },
    ];
  }
  if (id === "G1-INTERCHANGE-DIFFERENCE") {
    return [
      { suffix: "RELATIONSHIP", kind: "relationship", preservesOriginalExpected: false, expected: { kind: "state", state: "cross_representation_relationship_requires_qualified_treatment" }, semanticSuffix: "Cross-representation relationship", reasoningOverride: "template_structural_inference", dimensionOverride: "accounting.repeated_representation" },
      { suffix: "WARNING", kind: "wording_policy", preservesOriginalExpected: true, semanticSuffix: "Qualified non-double-billing warning", reasoningOverride: "product_policy_judgment", dimensionOverride: "policy.customer_wording" },
    ];
  }
  if (id === "G7-OTHER-COMPONENTS") {
    return [
      { suffix: "SUPPORTED", kind: "supported_component", preservesOriginalExpected: false, expected: { kind: "state", state: "separate_scope_specific_components_observed" }, semanticSuffix: "Supported separate components", reasoningOverride: "economic_structural_inference", dimensionOverride: "pricing.component" },
      { suffix: "UNRESOLVED", kind: "unresolved_component", preservesOriginalExpected: true, semanticSuffix: "Partly unresolved component residual", reasoningOverride: "economic_structural_inference", dimensionOverride: "economic.broad_category" },
    ];
  }
  return [{ suffix: "", kind: "none", preservesOriginalExpected: true, semanticSuffix: "", }];
}

function normalizeAssertion(assertion: GoldAssertion, goldCase: GoldCase | undefined, descriptor: DecompositionDescriptor): NormalizedAuthorityAssertion {
  const assertionId = descriptor.suffix ? `${assertion.assertion_id}--${descriptor.suffix}` : assertion.assertion_id;
  const reasoning = descriptor.reasoningOverride ?? primaryReasoningFor(assertion);
  const dimension = descriptor.dimensionOverride ?? claimDimensionFor(assertion);
  const primaryLane = primaryAuthorityLaneFor(assertion, reasoning, descriptor);
  const requiredLanes = requiredAuthorityLanesFor(assertion, primaryLane, descriptor);
  const resolutionStatus = resolutionStatusFor(assertion, descriptor);
  const semanticResolutionStatus = semanticResolutionStatusFor(assertion, descriptor);
  const sourceExecutionStatus = sourceExecutionStatusFor(assertion.case_id);
  const sourceIdentityStatus = sourceIdentityStatusFor(assertion.case_id);
  const conflict = canonicalConflictFor(assertion.assertion_id);
  const expected = descriptor.expected ?? assertion.expected_value_or_state;
  const productPolicy = reasoning === "product_policy_judgment";

  return {
    assertionId,
    caseId: assertion.case_id,
    lineage: {
      sourceAssertionId: assertion.assertion_id,
      decompositionKind: descriptor.kind,
      preservesOriginalExpected: descriptor.preservesOriginalExpected,
      sourceFieldOrConclusion: assertion.field_or_conclusion,
    },
    subject: subjectFor(assertion),
    claim: {
      dimension,
      semantic: descriptor.semanticSuffix ? `${assertion.field_or_conclusion}: ${descriptor.semanticSuffix}` : assertion.field_or_conclusion,
      polarity: assertion.expected_value_or_state.kind === "conclusion" ? assertion.expected_value_or_state.polarity : "required",
      expected,
      scope: assertion.applicability_scope,
    },
    reasoning: {
      primaryClass: reasoning,
      allowedClasses: allowedReasoningClasses(reasoning),
      requiredClasses: requiredReasoningClasses(reasoning),
      prohibitedShortcuts: prohibitedShortcutsFor(assertion, reasoning, descriptor),
      missingAuthorityBehavior: missingAuthorityBehaviorFor(reasoning, dimension),
    },
    authority: {
      primaryLane,
      requiredLanes,
      currentStatus: currentAuthorityStatusFor(assertion.case_id, reasoning),
      sourceIdentityStatus,
      sourceProvenanceStatus: sourceProvenanceStatusFor(assertion.case_id),
    },
    temporal: {
      effectivePeriodDependency: effectivePeriodDependencyFor(assertion, reasoning),
      effectivePeriod: assertion.effective_period,
      historicalConstraint: assertion.effective_period ? "period_scoped" : "not_time_sensitive",
      backProjectionProhibited: reasoning === "governed_public_dependency" || assertion.effective_period !== null,
    },
    universality: universalityFor(assertion, reasoning, dimension),
    resolution: {
      status: resolutionStatus,
      expectedEvaluationOutcome: evaluationOutcomeFor(assertion, resolutionStatus, descriptor),
      semanticStatus: semanticResolutionStatus,
      semanticEvaluationOutcome: evaluationOutcomeFor(assertion, semanticResolutionStatus, descriptor),
      abstentionAllowed: true,
      abstentionRequiredWhenAuthorityMissing: reasoning !== "direct_observation" && reasoning !== "deterministic_calculation" || resolutionStatus !== "supported",
      missingAuthorityReason: missingAuthorityReasonFor(assertion, resolutionStatus, reasoning),
      blockedDownstreamDimensions: blockedDimensionsFor(dimension, resolutionStatus),
    },
    productPolicy: {
      dependsOnReviewedPolicy: productPolicy || assertion.assertion_basis === "approved_policy" || assertion.assertion_basis === "merchant_theme",
      customerWordingCeiling: customerWordingCeilingFor(reasoning, dimension),
      actionCeiling: actionCeilingFor(reasoning, dimension),
    },
    provenance: {
      semanticStatus: descriptor.kind === "none" ? "product_owner_approved" : "product_owner_approved_via_lineage",
      sourceExecutionStatus,
      evidenceMappingStatus: assertion.evidence_mapping_status,
      sourceRefs: assertion.source_refs,
      statementEvidenceRefs: assertion.statement_evidence_refs,
    },
    adjudication: {
      status: assertion.case_id === "G9" ? "frozen_historical_guidance" : sourceExecutionStatus === "not_source_executable" ? "frozen_with_source_gap" : "frozen",
      canonicalConflictStatus: conflict,
      productClarificationRequired: false,
      notes: adjudicationNotes(assertion, goldCase, descriptor, reasoning),
    },
  };
}

function primaryReasoningFor(assertion: GoldAssertion): ReasoningClass {
  const field = assertion.field_or_conclusion;
  const expected = JSON.stringify(assertion.expected_value_or_state).toLowerCase();
  const conclusion = assertion.expected_value_or_state.kind === "conclusion" ? assertion.expected_value_or_state : null;

  if (assertion.contract_role === "semantic_theme_coverage" || assertion.case_id === "GLOBAL") return "product_policy_judgment";
  if (conclusion?.polarity === "prohibited") return "product_policy_judgment";
  if (assertion.contract_role === "semantic_claim") {
    const code = conclusion?.claim_code ?? "";
    if (code.includes("PRESERVED")) return "deterministic_calculation";
    if (code.includes("MULTI_SECTION_RECONCILIATION") || code.includes("PCI_REMINDER")) return "template_structural_inference";
    if (code.includes("IDENTITY_BLOCKS") || code.includes("OPERATIONAL_SIGNALS")) return "product_policy_judgment";
    return "economic_structural_inference";
  }
  if (assertion.derivability_tier === "requires_external_rule_or_schedule") return "governed_public_dependency";
  if (assertion.derivability_tier === "requires_merchant_pricing_document" || assertion.derivability_tier === "requires_processor_explanation") return "merchant_private_dependency";
  if (assertion.derivability_tier === "not_derivable_from_this_document_class" || assertion.derivability_tier === "unresolved" || /unresolved|not_derivable|requires_(processor|contract|valid)/.test(expected)) {
    if (/dispute_ratio/.test(field)) return "deterministic_calculation";
    if (/exact_interchange_processor_split|processor_markup|exact_processor_controlled_total/.test(field)) return "governed_public_dependency";
    if (/pricing_fairness|opportunity\.savings|counterfactual/.test(field)) return "product_policy_judgment";
    if (/transaction_count/.test(field)) return "direct_observation";
    return "economic_structural_inference";
  }
  if (assertion.assertion_basis === "approved_policy" || field.startsWith("merchant_attention.") || field === "financial.effective_rate_interpretation") return "product_policy_judgment";
  if (assertion.assertion_basis === "deterministic_math") return field === "pricing.derived_human_summary" ? "economic_structural_inference" : "deterministic_calculation";
  if (assertion.case_id === "S7" || assertion.case_id === "S8") return "product_policy_judgment";
  if (assertion.case_id === "S9") return "deterministic_calculation";
  if (assertion.case_id === "S6") return "economic_structural_inference";
  if (field === "financial.reconciliation" || /(_share|_cost_rate)$/.test(field) || field === "financial.average_ticket" || field === "program.net_merchant_borne_cost") return "deterministic_calculation";
  if (/pricing\.(underlying_cost_billing_mode|merchant_price_schedule_shape|scope_uniformity|population_modes|percentage_pricing_base|additional_components|non_amex_discount_scope)/.test(field)) return "economic_structural_inference";
  if (field === "pricing.zero_volume_rate_row_state") return "template_structural_inference";
  if (field === "risk.visa_authorization_network_activity") return "economic_structural_inference";
  return "direct_observation";
}

function claimDimensionFor(assertion: GoldAssertion): string {
  const field = assertion.field_or_conclusion;
  if (field.startsWith("theme.")) return "policy.customer_theme";
  if (field.startsWith("claim.")) {
    if (/OWNER|OWNERSHIP|MARKUP|MARGIN|PROFIT/.test(field)) return "ownership.economic_beneficiary";
    if (/SAVINGS|AVOIDABLE|BENCHMARK|OVERPRICED/.test(field)) return "commercial.savings";
    if (/PRICING_MODEL|TIER|FLAT_RATE|SCOPE|PERCENTAGE_BASE/.test(field)) return "pricing.architecture";
    if (/PARTIAL_DOCUMENT|COMPLETE_ANALYSIS|DOCUMENT_MERGE/.test(field)) return "document.completeness";
    if (/DISPUTE|REFUND|ADJUSTMENT/.test(field)) return "economic.broad_category";
    return "policy.reasoning_constraint";
  }
  if (field === "document.completeness") return "document.completeness";
  if (field.startsWith("financial.")) return /effective_rate|average_ticket|reconciliation/.test(field) ? "accounting.calculation" : "observation.financial";
  if (field.startsWith("pricing.")) return /rate|decimal|tier/.test(field) && !/model|shape|summary|scope/.test(field) ? "observation.pricing" : "pricing.architecture";
  if (field.startsWith("knowledge.")) return "reference.knowledge_status";
  if (field.startsWith("benchmark.")) return "commercial.benchmark";
  if (field.startsWith("opportunity.")) return "commercial.savings";
  if (field.startsWith("merchant_attention.")) return "policy.priority";
  if (field.startsWith("mix.")) return /share|rate/.test(field) ? "accounting.calculation" : "observation.population";
  if (field.startsWith("risk.")) return "economic.risk_event";
  if (field.startsWith("refund.")) return "economic.refund_behavior";
  if (field.startsWith("program.")) return "economic.program_flow";
  if (field.startsWith("security.")) return "policy.security_boundary";
  if (field.startsWith("cost.")) return /exact_|markup|ownership/.test(field) ? "economic.normalized_identity" : "observation.cost";
  return "policy.reasoning_constraint";
}

function observedDimensionFor(field: string): string {
  return /share|rate/.test(field) ? "accounting.calculation" : "observation.labeled_population";
}

function primaryAuthorityLaneFor(assertion: GoldAssertion, reasoning: ReasoningClass, descriptor: DecompositionDescriptor): AuthorityLane {
  if (reasoning === "direct_observation") return assertion.case_id.startsWith("S") ? "synthetic_falsification_input" : "statement_source_document";
  if (reasoning === "deterministic_calculation") return assertion.case_id.startsWith("S") ? "synthetic_falsification_input" : "deterministic_arithmetic";
  if (reasoning === "template_structural_inference") return "versioned_template_mapping";
  if (reasoning === "economic_structural_inference") return assertion.case_id.startsWith("S") ? "synthetic_falsification_input" : "statement_structural_evidence";
  if (reasoning === "merchant_private_dependency") return "merchant_private_contract_or_correspondence";
  if (reasoning === "product_policy_judgment") return "reviewed_product_policy";
  if (descriptor.kind === "normalized_identity" && /REG-DEBIT|REWARDS|PREMIUM/.test(assertion.assertion_id)) return "governed_network_regulator";
  if (assertion.assertion_id === "G7-NOTICE") return "governed_network_regulator";
  if (assertion.assertion_id === "G4-WATS" && descriptor.kind === "normalized_identity") return "governed_processor_acquirer_publication";
  return "governed_public_mixed";
}

function requiredAuthorityLanesFor(assertion: GoldAssertion, primary: AuthorityLane, descriptor: DecompositionDescriptor): AuthorityLane[] {
  const lanes = new Set<AuthorityLane>([primary]);
  if (primary === "deterministic_arithmetic") lanes.add("statement_source_document");
  if (primary === "statement_structural_evidence" || primary === "versioned_template_mapping") lanes.add("statement_source_document");
  if (primary.startsWith("governed_")) lanes.add(assertion.case_id.startsWith("S") ? "synthetic_falsification_input" : "statement_source_document");
  if (assertion.assertion_id === "G4-WATS-OWNER") lanes.add("versioned_template_mapping");
  if (/PRICING-FAIRNESS|MARKUP-SPLIT|MARKUP$|COUNTERFACTUAL|SAVINGS/.test(assertion.assertion_id)) lanes.add("merchant_private_contract_or_correspondence");
  if (descriptor.kind === "wording_policy") lanes.add("statement_structural_evidence");
  return [...lanes];
}

function resolutionStatusFor(assertion: GoldAssertion, descriptor: DecompositionDescriptor): ResolutionStatus {
  if (/^G[1-8]$/.test(assertion.case_id)) return "source_mapping_incomplete";
  if (assertion.case_id === "G9") return "source_unavailable";
  return semanticResolutionStatusFor(assertion, descriptor);
}

function semanticResolutionStatusFor(assertion: GoldAssertion, descriptor: DecompositionDescriptor): ResolutionStatus {
  if (assertion.expected_value_or_state.kind === "conclusion" && assertion.expected_value_or_state.polarity === "prohibited") return "refused";
  if (descriptor.kind === "normalized_identity") return "unresolved";
  const expected = JSON.stringify(descriptor.expected ?? assertion.expected_value_or_state).toLowerCase();
  if (/unresolved|not_derivable|requires_valid_counterfactual/.test(expected)) return "unresolved";
  return "supported";
}

function evaluationOutcomeFor(assertion: GoldAssertion, status: ResolutionStatus, descriptor: DecompositionDescriptor): EvaluationOutcome {
  if (status === "source_mapping_incomplete") return "source_mapping_incomplete";
  if (status === "source_unavailable") return "missing_source_authority";
  if (status === "refused" || status === "unresolved") return "correct_refusal";
  if (descriptor.kind === "normalized_identity") return "correct_refusal";
  return "correct_answer";
}

function sourceExecutionStatusFor(caseId: string): SourceExecutionStatus {
  if (/^G[1-8]$/.test(caseId)) return "not_source_executable";
  if (caseId === "G9") return "source_unavailable";
  if (caseId === "GLOBAL") return "product_policy_executable";
  return "synthetic_executable";
}

function sourceIdentityStatusFor(caseId: string): NormalizedAuthorityAssertion["authority"]["sourceIdentityStatus"] {
  if (caseId === "G6") return "unresolved_identity";
  if (/^G[1-8]$/.test(caseId)) return "pending_authoritative_mapping";
  if (caseId === "G9") return "source_unavailable";
  if (caseId === "GLOBAL") return "not_applicable_policy";
  return "synthetic";
}

function sourceProvenanceStatusFor(caseId: string): NormalizedAuthorityAssertion["authority"]["sourceProvenanceStatus"] {
  if (/^G[1-8]$/.test(caseId)) return "unproven";
  if (caseId === "G9") return "unproven";
  if (caseId === "GLOBAL") return "not_applicable_policy";
  return "synthetic_authored";
}

function currentAuthorityStatusFor(caseId: string, reasoning: ReasoningClass): NormalizedAuthorityAssertion["authority"]["currentStatus"] {
  if (/^G[1-8]$/.test(caseId)) return "source_mapping_incomplete";
  if (caseId === "G9") return "source_unavailable";
  if (reasoning === "governed_public_dependency" || reasoning === "merchant_private_dependency") return caseId.startsWith("S") ? "sufficient" : "insufficient";
  return "sufficient";
}

function universalityFor(assertion: GoldAssertion, reasoning: ReasoningClass, dimension: string): UniversalityScope {
  if (reasoning === "product_policy_judgment" || assertion.case_id === "GLOBAL") return "product_policy_only";
  if (reasoning === "merchant_private_dependency") return "merchant_account_specific";
  if (reasoning === "governed_public_dependency") return /AMEX|VISA|MASTERCARD|NETWORK|REG-DEBIT|REWARDS|PREMIUM/.test(assertion.assertion_id) ? "network_specific" : "processor_family_specific";
  if (reasoning === "template_structural_inference") return "template_specific";
  if (/pricing\.architecture|economic\.normalized_identity/.test(dimension) && assertion.case_id.startsWith("G")) return "processor_family_specific";
  if (assertion.case_id.startsWith("G") && /QUAL|NQUAL|WATS|ECR|INTERCHANGE|PROGRAM/.test(assertion.assertion_id)) return "processor_family_specific";
  return "universal_acquiring_accounting";
}

function allowedReasoningClasses(primary: ReasoningClass): ReasoningClass[] {
  if (primary === "deterministic_calculation") return ["direct_observation", "deterministic_calculation"];
  if (primary === "template_structural_inference") return ["direct_observation", "deterministic_calculation", "template_structural_inference"];
  if (primary === "economic_structural_inference") return ["direct_observation", "deterministic_calculation", "template_structural_inference", "economic_structural_inference"];
  if (primary === "governed_public_dependency") return ["direct_observation", "deterministic_calculation", "governed_public_dependency"];
  if (primary === "merchant_private_dependency") return ["direct_observation", "merchant_private_dependency"];
  return [primary];
}

function requiredReasoningClasses(primary: ReasoningClass): ReasoningClass[] {
  return primary === "deterministic_calculation" ? ["direct_observation", "deterministic_calculation"] : [primary];
}

function prohibitedShortcutsFor(assertion: GoldAssertion, reasoning: ReasoningClass, descriptor: DecompositionDescriptor): string[] {
  const shortcuts = new Set<string>();
  if (reasoning !== "direct_observation") shortcuts.add("label_familiarity_as_authority");
  if (reasoning === "deterministic_calculation") shortcuts.add("denominator_or_population_substitution");
  if (reasoning === "template_structural_inference") shortcuts.add("template_rule_promoted_to_universal_semantics");
  if (reasoning === "economic_structural_inference") shortcuts.add("mechanical_structure_promoted_to_owner_or_controller");
  if (reasoning === "governed_public_dependency") {
    shortcuts.add("historical_back_projection");
    shortcuts.add("public_reference_promoted_to_merchant_contract_truth");
  }
  if (reasoning === "merchant_private_dependency") shortcuts.add("merchant_private_evidence_promoted_to_global_knowledge");
  if (reasoning === "product_policy_judgment") shortcuts.add("product_policy_presented_as_financial_or_industry_fact");
  if (/MARKUP|MARGIN|OWNER|OWNERSHIP|WATS/.test(assertion.assertion_id)) shortcuts.add("statement_structure_as_processor_margin_or_beneficiary");
  if (/SAVINGS|COUNTERFACTUAL|BENCHMARK/.test(assertion.assertion_id)) shortcuts.add("observed_cost_as_savings_without_valid_counterfactual");
  if (/PRICE-SHAPE|PRICE-SUMMARY|TIER/.test(assertion.assertion_id)) shortcuts.add("qual_or_nqual_label_as_pricing_architecture");
  if (descriptor.kind === "normalized_identity") shortcuts.add("printed_program_label_as_official_normalized_identity");
  return [...shortcuts];
}

function missingAuthorityBehaviorFor(reasoning: ReasoningClass, dimension: string): string {
  if (reasoning === "direct_observation") return "Return unavailable only when the accepted source location is absent or inaccessible; do not infer a replacement value.";
  if (reasoning === "deterministic_calculation") return "Return unresolved when an input, denominator, sign, or population is missing or incompatible.";
  if (reasoning === "governed_public_dependency") return "Return a typed public-authority refusal and preserve the statement-observed claim separately.";
  if (reasoning === "merchant_private_dependency") return "Return merchant-private evidence required; do not substitute public or structural evidence.";
  if (reasoning === "product_policy_judgment") return "Apply only the frozen Product policy; otherwise block customer wording or action.";
  return `Return the supported broad ${dimension} claim, and leave stronger identity, ownership, contract, and action dimensions unresolved.`;
}

function effectivePeriodDependencyFor(assertion: GoldAssertion, reasoning: ReasoningClass): boolean {
  return assertion.effective_period !== null || reasoning === "governed_public_dependency" || /NOTICE|RATE|REFERENCE/.test(assertion.assertion_id);
}

function missingAuthorityReasonFor(assertion: GoldAssertion, status: ResolutionStatus, reasoning: ReasoningClass): string | null {
  if (status === "source_mapping_incomplete") return assertion.case_id === "G6" ? "authoritative_source_mapping_and_exact_source_identity_incomplete" : "authoritative_source_mapping_incomplete";
  if (status === "source_unavailable") return "original_source_unavailable";
  if (status === "unresolved") return `required_${reasoning}_evidence_incomplete`;
  if (status === "refused") return "positive_claim_prohibited_without_required_authority";
  return null;
}

function blockedDimensionsFor(dimension: string, status: ResolutionStatus): string[] {
  if (status === "supported" && !dimension.startsWith("pricing.") && !dimension.startsWith("economic.")) return [];
  return ["ownership.economic_beneficiary", "ownership.contractual_controller", "commercial.actionability", "commercial.savings"];
}

function customerWordingCeilingFor(reasoning: ReasoningClass, dimension: string): string {
  if (reasoning === "direct_observation") return "May state only the observed value and source scope.";
  if (reasoning === "deterministic_calculation") return "May state the calculation with formula, inputs, denominator, and limitations.";
  if (reasoning === "economic_structural_inference" || reasoning === "template_structural_inference") return "May use broad component or pricing-shape wording; exact identity, owner, at-cost, and action wording are prohibited.";
  if (reasoning === "governed_public_dependency") return "May state only the admitted public claim within publisher, period, population, and geographic scope.";
  if (reasoning === "merchant_private_dependency") return "Merchant-specific wording only; no reusable/global claim.";
  if (reasoning === "product_policy_judgment") return "Use only frozen Product-approved wording and blocking rules.";
  return `No stronger wording than ${dimension}.`;
}

function actionCeilingFor(reasoning: ReasoningClass, dimension: string): string {
  if (reasoning === "merchant_private_dependency" || reasoning === "governed_public_dependency") return "verify_only_until_required_authority_is_sufficient";
  if (reasoning === "product_policy_judgment") return "product_policy_controls_action";
  if (/savings|ownership|normalized_identity/.test(dimension)) return "no_action_without_downstream_authority";
  return "no_automatic_savings_or_removal_action";
}

function subjectFor(assertion: GoldAssertion): { type: string; reference: string } {
  const field = assertion.field_or_conclusion;
  const root = field.split(".")[0] ?? "assertion";
  return { type: root, reference: field };
}

function canonicalConflictFor(assertionId: string): NormalizedAuthorityAssertion["adjudication"]["canonicalConflictStatus"] {
  if (reviewedStrongBehaviorConflicts.has(assertionId)) return "current_behavior_stronger_than_gold";
  if (reviewedNumericConflicts.has(assertionId)) return "current_numeric_or_precision_conflict";
  return "none_known";
}

function adjudicationNotes(assertion: GoldAssertion, goldCase: GoldCase | undefined, descriptor: DecompositionDescriptor, reasoning: ReasoningClass): string[] {
  const notes: string[] = [];
  if (mixedAssertionIds.has(assertion.assertion_id)) notes.push(decomposedAssertionIds.has(assertion.assertion_id) ? "Mixed assertion decomposed with explicit lineage." : "Mixed assertion re-annotated without changing its approved semantic value.");
  if (/^G[1-8]$/.test(assertion.case_id)) notes.push("Semantic Gold is approved, but authoritative source mapping remains incomplete.");
  if (assertion.case_id === "G6") notes.push("Exact authoritative source identity remains unresolved.");
  if (assertion.case_id === "G9") notes.push("Historical semantic guidance only; original source is unavailable and this assertion is not source-executable.");
  if (reasoning === "governed_public_dependency") notes.push("Public authority must be effective-dated and cannot establish merchant-contract truth.");
  if (reasoning === "merchant_private_dependency") notes.push("Merchant-private evidence is account-scoped and cannot be promoted globally without a separate reviewed process.");
  if (descriptor.kind === "wording_policy") notes.push("This child freezes the Product wording ceiling separately from the underlying structural conclusion.");
  if (goldCase?.case_kind === "synthetic_adversarial") notes.push("Synthetic falsification input does not expand production processor support.");
  return notes;
}

function caseProvenanceFor(item: GoldCase, assertions: NormalizedAuthorityAssertion[]): NormalizedAuthorityRegister["caseProvenance"][number] {
  return {
    caseId: item.case_id,
    caseKind: item.case_kind,
    originalAssertionCount: item.assertions.length,
    normalizedAssertionCount: assertions.filter((assertion) => assertion.caseId === item.case_id).length,
    semanticStatus: "product_owner_approved",
    sourceIdentityStatus: sourceIdentityStatusFor(item.case_id),
    sourceExecutionStatus: sourceExecutionStatusFor(item.case_id),
    provenanceStatus: item.source.provenance_status,
    limitation:
      item.case_id === "G6"
        ? "Authoritative source mapping and exact source identity remain unresolved."
        : item.case_id === "G9"
          ? "Original source unavailable; retained as historical semantic guidance only."
          : item.case_kind === "real_statement"
            ? "Authoritative source mapping incomplete; repository fixtures remain provisional."
            : "Synthetic falsification case; does not expand production processor support.",
  };
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  return Object.fromEntries(
    [...Map.groupBy(values, key).entries()]
      .map(([name, grouped]) => [name, grouped.length] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function assertNormalizedRegister(register: NormalizedAuthorityRegister): void {
  if (register.sourceGold.originalAssertionCount !== 348) throw new Error("Expected exactly 348 original Gold assertions.");
  if (mixedAssertionIds.size !== 49) throw new Error("Expected exactly 49 adjudicated mixed assertions.");
  if (decomposedAssertionIds.size !== 21) throw new Error("Expected exactly 21 decomposed original assertions.");
  if (reannotatedMixedAssertionIds.size !== 28) throw new Error("Expected exactly 28 re-annotated mixed assertions.");
  if (register.assertions.length !== 369) throw new Error(`Expected exactly 369 normalized assertions, received ${register.assertions.length}.`);
  if (new Set(register.assertions.map((item) => item.assertionId)).size !== register.assertions.length) throw new Error("Normalized assertion IDs must be unique.");
  for (const assertion of register.assertions) {
    if (!reasoningClasses.includes(assertion.reasoning.primaryClass)) throw new Error(`Invalid reasoning class for ${assertion.assertionId}.`);
    if (!resolutionStatuses.includes(assertion.resolution.status)) throw new Error(`Invalid resolution status for ${assertion.assertionId}.`);
    if (!authorityLanes.includes(assertion.authority.primaryLane)) throw new Error(`Invalid authority lane for ${assertion.assertionId}.`);
    if (assertion.reasoning.prohibitedShortcuts.length === 0 && assertion.reasoning.primaryClass !== "direct_observation") throw new Error(`Missing prohibited shortcut boundary for ${assertion.assertionId}.`);
    if (assertion.caseId === "G6" && assertion.authority.sourceIdentityStatus !== "unresolved_identity") throw new Error("G6 source identity must remain unresolved.");
    if (assertion.caseId === "G9" && assertion.provenance.sourceExecutionStatus !== "source_unavailable") throw new Error("G9 must remain source unavailable.");
    if (/^G[1-8]$/.test(assertion.caseId) && assertion.resolution.status !== "source_mapping_incomplete") throw new Error(`${assertion.caseId} must retain source-mapping-incomplete resolution.`);
    if (assertion.reasoning.primaryClass === "governed_public_dependency" && !assertion.temporal.backProjectionProhibited) throw new Error(`Public claim ${assertion.assertionId} must prohibit back-projection.`);
    if (assertion.reasoning.primaryClass === "merchant_private_dependency" && !assertion.reasoning.prohibitedShortcuts.includes("merchant_private_evidence_promoted_to_global_knowledge")) throw new Error(`Private claim ${assertion.assertionId} lacks promotion prohibition.`);
    if (/SAVINGS|COUNTERFACTUAL|BENCHMARK/.test(assertion.assertionId) && !assertion.reasoning.prohibitedShortcuts.includes("observed_cost_as_savings_without_valid_counterfactual") && assertion.reasoning.primaryClass !== "direct_observation") throw new Error(`Savings-related assertion ${assertion.assertionId} lacks counterfactual prohibition.`);
  }
  if (Object.values(register.counts.reasoningClass).reduce((sum, value) => sum + value, 0) !== register.assertions.length) throw new Error("Reasoning counts do not reconcile.");
  if (Object.values(register.counts.resolutionStatus).reduce((sum, value) => sum + value, 0) !== register.assertions.length) throw new Error("Resolution counts do not reconcile.");
  if (Object.values(register.counts.semanticResolutionStatus).reduce((sum, value) => sum + value, 0) !== register.assertions.length) throw new Error("Semantic-resolution counts do not reconcile.");
  if (Object.values(register.counts.semanticEvaluationOutcome).reduce((sum, value) => sum + value, 0) !== register.assertions.length) throw new Error("Semantic-outcome counts do not reconcile.");
  for (const name of ["primaryAuthorityLane", "sourceExecutionStatus", "sourceIdentityStatus", "sourceProvenanceStatus", "evidenceMappingStatus", "semanticApprovalStatus", "evaluationOutcome", "canonicalConflictStatus"] as const) {
    if (Object.values(register.counts[name]).reduce((sum, value) => sum + value, 0) !== register.assertions.length) throw new Error(`${name} counts do not reconcile.`);
  }
  if (register.caseProvenance.reduce((sum, item) => sum + item.normalizedAssertionCount, 0) !== register.assertions.length) throw new Error("Case counts do not reconcile.");
  if (register.normativeRules.completenessGates.length !== 7) throw new Error("Seven independent completeness gates are required.");
  if (register.normativeRules.denominatorPolicies.length !== 3) throw new Error("Three separate denominator policies are required.");
  if (register.normativeRules.strongClaimGates.length !== 6) throw new Error("Strong-claim evidence gates are incomplete.");
  if (register.normativeRules.zeroToleranceErrors.length !== 4 || register.normativeRules.passingAbstentionOutcome !== "correct_refusal") throw new Error("Error asymmetry is incomplete.");
}

export function jsonSchema(): Record<string, unknown> {
  const enumSchema = (values: readonly string[]) => ({ type: "string", enum: [...values] });
  const strictObject = (required: string[], properties: Record<string, unknown>) => ({
    type: "object",
    additionalProperties: false,
    required,
    properties,
  });
  const countMap = {
    type: "object",
    additionalProperties: { type: "integer", minimum: 0 },
  };
  const expectedValueSchema = {
    oneOf: [
      strictObject(["kind", "value"], { kind: { const: "value" }, value: {} }),
      strictObject(["kind", "state"], { kind: { const: "state" }, state: { type: "string", minLength: 1 } }),
      strictObject(["kind", "claim_code", "present", "polarity", "claim_scope"], {
        kind: { const: "conclusion" },
        claim_code: { type: "string", pattern: "^[A-Z][A-Z0-9_]+$" },
        present: { type: "boolean" },
        polarity: enumSchema(["required", "prohibited"]),
        claim_scope: enumSchema(["case", "global"]),
      }),
      strictObject(["kind", "coverage_code", "requirement", "grouping_policy"], {
        kind: { const: "semantic_theme_coverage" },
        coverage_code: { type: "string", pattern: "^THEME_[A-Z0-9_]+$" },
        requirement: { const: "required_when_evidence_and_applicability_met" },
        grouping_policy: { const: "grouping_allowed_only_when_economic_meaning_evidence_boundaries_and_actionability_are_preserved" },
      }),
    ],
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://ratereveal.internal/schemas/${SCHEMA_VERSION}.json`,
    title: "RateReveal Gold Authority & Derivability Register v1",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "contractVersion", "frozenAt", "sourceGold", "freezeSemantics", "normativeRules", "decomposition", "caseProvenance", "counts", "assertions"],
    properties: {
      schemaVersion: { const: REGISTER_VERSION },
      contractVersion: { const: CONTRACT_VERSION },
      frozenAt: { type: "string", format: "date" },
      sourceGold: strictObject(
        ["schemaVersion", "frozenArtifact", "conversionStatus", "originalAssertionCount"],
        {
          schemaVersion: { type: "string", minLength: 1 },
          frozenArtifact: { type: "string", minLength: 1 },
          conversionStatus: { type: "string", minLength: 1 },
          originalAssertionCount: { type: "integer", minimum: 1 },
        },
      ),
      freezeSemantics: strictObject(["authorizes", "doesNotAuthorize"], {
        authorizes: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        doesNotAuthorize: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      }),
      normativeRules: strictObject(
        ["independentClaimDimensions", "completenessGates", "denominatorPolicies", "strongClaimGates", "zeroToleranceErrors", "passingAbstentionOutcome"],
        {
          independentClaimDimensions: { type: "array", minItems: 20, uniqueItems: true, items: { type: "string", minLength: 1 } },
          completenessGates: { type: "array", minItems: 7, items: strictObject(["id", "requiredEvidence", "doesNotImply"], {
            id: { type: "string", minLength: 1 },
            requiredEvidence: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            doesNotImply: { type: "array", items: { type: "string", minLength: 1 } },
          }) },
          denominatorPolicies: { type: "array", minItems: 3, items: strictObject(["id", "denominator", "separatelyAccountFor"], {
            id: { type: "string", minLength: 1 },
            denominator: { type: "string", minLength: 1 },
            separatelyAccountFor: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          }) },
          strongClaimGates: { type: "array", minItems: 6, items: strictObject(["id", "requiredEvidence", "missingAuthorityOutcome", "prohibitedShortcut"], {
            id: { type: "string", minLength: 1 },
            requiredEvidence: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            missingAuthorityOutcome: { type: "string", minLength: 1 },
            prohibitedShortcut: { type: "string", minLength: 1 },
          }) },
          zeroToleranceErrors: { type: "array", minItems: 4, uniqueItems: true, items: { type: "string", minLength: 1 } },
          passingAbstentionOutcome: { const: "correct_refusal" },
        },
      ),
      decomposition: strictObject(
        ["adjudicatedMixedAssertionCount", "decomposedOriginalAssertionCount", "reannotatedOriginalAssertionCount", "normalizedAssertionCount"],
        {
          adjudicatedMixedAssertionCount: { type: "integer", minimum: 0 },
          decomposedOriginalAssertionCount: { type: "integer", minimum: 0 },
          reannotatedOriginalAssertionCount: { type: "integer", minimum: 0 },
          normalizedAssertionCount: { type: "integer", minimum: 1 },
        },
      ),
      caseProvenance: {
        type: "array",
        minItems: 1,
        items: strictObject(
          ["caseId", "caseKind", "originalAssertionCount", "normalizedAssertionCount", "semanticStatus", "sourceIdentityStatus", "sourceExecutionStatus", "provenanceStatus", "limitation"],
          {
            caseId: { type: "string", pattern: "^(?:G[1-9]|S10|S[1-9]|GLOBAL)$" },
            caseKind: enumSchema(["real_statement", "synthetic_adversarial", "global_policy"]),
            originalAssertionCount: { type: "integer", minimum: 1 },
            normalizedAssertionCount: { type: "integer", minimum: 1 },
            semanticStatus: { const: "product_owner_approved" },
            sourceIdentityStatus: enumSchema(["pending_authoritative_mapping", "unresolved_identity", "source_unavailable", "synthetic", "not_applicable_policy"]),
            sourceExecutionStatus: enumSchema(sourceExecutionStatuses),
            provenanceStatus: { type: "string", minLength: 1 },
            limitation: { type: ["string", "null"] },
          },
        ),
      },
      counts: strictObject(
        ["reasoningClass", "primaryAuthorityLane", "resolutionStatus", "semanticResolutionStatus", "sourceExecutionStatus", "sourceIdentityStatus", "sourceProvenanceStatus", "evidenceMappingStatus", "semanticApprovalStatus", "evaluationOutcome", "semanticEvaluationOutcome", "canonicalConflictStatus"],
        {
          reasoningClass: countMap,
          primaryAuthorityLane: countMap,
          resolutionStatus: countMap,
          semanticResolutionStatus: countMap,
          sourceExecutionStatus: countMap,
          sourceIdentityStatus: countMap,
          sourceProvenanceStatus: countMap,
          evidenceMappingStatus: countMap,
          semanticApprovalStatus: countMap,
          evaluationOutcome: countMap,
          semanticEvaluationOutcome: countMap,
          canonicalConflictStatus: countMap,
        },
      ),
      assertions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["assertionId", "caseId", "lineage", "subject", "claim", "reasoning", "authority", "temporal", "universality", "resolution", "productPolicy", "provenance", "adjudication"],
          properties: {
            assertionId: { type: "string", pattern: "^(?:G[1-9]|S10|S[1-9]|GLOBAL)-[A-Z0-9-]+(?:--[A-Z0-9-]+)?$" },
            caseId: { type: "string", pattern: "^(?:G[1-9]|S10|S[1-9]|GLOBAL)$" },
            lineage: strictObject(["sourceAssertionId", "decompositionKind", "preservesOriginalExpected", "sourceFieldOrConclusion"], {
              sourceAssertionId: { type: "string", pattern: "^(?:G[1-9]|S10|S[1-9]|GLOBAL)-[A-Z0-9-]+$" },
              decompositionKind: enumSchema(["none", "structure", "wording_policy", "statement_group", "normalized_identity", "relationship", "supported_component", "unresolved_component"]),
              preservesOriginalExpected: { type: "boolean" },
              sourceFieldOrConclusion: { type: "string", minLength: 1 },
            }),
            subject: strictObject(["type", "reference"], {
              type: { type: "string", minLength: 1 },
              reference: { type: "string", minLength: 1 },
            }),
            claim: strictObject(["dimension", "semantic", "polarity", "expected", "scope"], {
              dimension: { type: "string", minLength: 1 },
              semantic: { type: "string", minLength: 1 },
              polarity: enumSchema(["required", "prohibited"]),
              expected: expectedValueSchema,
              scope: { type: "string", minLength: 1 },
            }),
            reasoning: strictObject(
              ["primaryClass", "allowedClasses", "requiredClasses", "prohibitedShortcuts", "missingAuthorityBehavior"],
              {
                primaryClass: enumSchema(reasoningClasses),
                allowedClasses: { type: "array", minItems: 1, uniqueItems: true, items: enumSchema(reasoningClasses) },
                requiredClasses: { type: "array", minItems: 1, uniqueItems: true, items: enumSchema(reasoningClasses) },
                prohibitedShortcuts: { type: "array", items: { type: "string" } },
                missingAuthorityBehavior: { type: "string", minLength: 1 },
              },
            ),
            authority: strictObject(
              ["primaryLane", "requiredLanes", "currentStatus", "sourceIdentityStatus", "sourceProvenanceStatus"],
              {
                primaryLane: enumSchema(authorityLanes),
                requiredLanes: { type: "array", minItems: 1, uniqueItems: true, items: enumSchema(authorityLanes) },
                currentStatus: enumSchema(["sufficient", "insufficient", "source_mapping_incomplete", "source_unavailable"]),
                sourceIdentityStatus: enumSchema(["pending_authoritative_mapping", "unresolved_identity", "source_unavailable", "synthetic", "not_applicable_policy"]),
                sourceProvenanceStatus: enumSchema(["unproven", "unverified", "synthetic_authored", "not_applicable_policy"]),
              },
            ),
            temporal: strictObject(["effectivePeriodDependency", "effectivePeriod", "historicalConstraint", "backProjectionProhibited"], {
              effectivePeriodDependency: { type: "boolean" },
              effectivePeriod: { anyOf: [{ type: "string", pattern: "^\\d{4}-\\d{2}$" }, { type: "null" }] },
              historicalConstraint: enumSchema(["period_scoped", "not_time_sensitive"]),
              backProjectionProhibited: { type: "boolean" },
            }),
            universality: enumSchema(universalityScopes),
            resolution: strictObject(
              ["status", "expectedEvaluationOutcome", "semanticStatus", "semanticEvaluationOutcome", "abstentionAllowed", "abstentionRequiredWhenAuthorityMissing", "missingAuthorityReason", "blockedDownstreamDimensions"],
              {
                status: enumSchema(resolutionStatuses),
                expectedEvaluationOutcome: enumSchema(evaluationOutcomes),
                semanticStatus: enumSchema(resolutionStatuses),
                semanticEvaluationOutcome: enumSchema(evaluationOutcomes),
                abstentionAllowed: { type: "boolean" },
                abstentionRequiredWhenAuthorityMissing: { type: "boolean" },
                missingAuthorityReason: { type: ["string", "null"] },
                blockedDownstreamDimensions: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1 } },
              },
            ),
            productPolicy: strictObject(["dependsOnReviewedPolicy", "customerWordingCeiling", "actionCeiling"], {
              dependsOnReviewedPolicy: { type: "boolean" },
              customerWordingCeiling: { type: "string", minLength: 1 },
              actionCeiling: { type: "string", minLength: 1 },
            }),
            provenance: strictObject(["semanticStatus", "sourceExecutionStatus", "evidenceMappingStatus", "sourceRefs", "statementEvidenceRefs"], {
              semanticStatus: enumSchema(["product_owner_approved", "product_owner_approved_via_lineage"]),
              sourceExecutionStatus: enumSchema(sourceExecutionStatuses),
              evidenceMappingStatus: enumSchema(["pending_authoritative_mapping", "source_unavailable", "not_applicable_synthetic", "not_applicable_global_policy"]),
              sourceRefs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
              statementEvidenceRefs: { type: "array", items: { type: "string", minLength: 1 } },
            }),
            adjudication: strictObject(["status", "canonicalConflictStatus", "productClarificationRequired", "notes"], {
              status: enumSchema(["frozen", "frozen_with_source_gap", "frozen_historical_guidance"]),
              canonicalConflictStatus: enumSchema(["none_known", "current_behavior_stronger_than_gold", "current_numeric_or_precision_conflict"]),
              productClarificationRequired: { type: "boolean" },
              notes: { type: "array", items: { type: "string", minLength: 1 } },
            }),
          },
        },
      },
    },
  };
}

export async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function repositoryPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}
