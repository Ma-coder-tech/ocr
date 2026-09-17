import type { MoneyAmount } from "../../types.js";
import type { CanonicalEconomicsV2DifferenceClassification } from "../types.js";

export const RH_PUBLIC_EXPERIENCES = [
  "unable_to_complete",
  "analysis_with_open_questions",
  "analysis_completed",
] as const;

export type RhPublicExperience = (typeof RH_PUBLIC_EXPERIENCES)[number];
export type RhAnalysisReadiness = "unavailable" | "available_with_questions" | "completed";
export type RhComparisonPosition =
  | "below_reference"
  | "within_reference"
  | "above_reference"
  | "materially_above_reference"
  | "needs_confirmation"
  | "comparison_unavailable";
export type RhEconomicFinding =
  | "no_material_attention_proven"
  | "attention_items_present"
  | "supported_impact_present"
  | "unresolved_material_items"
  | "unavailable";
export type RhPriority = "routine" | "review" | "high_priority";
export type RhEvidenceStrength =
  | "statement_confirmed"
  | "deterministically_derived"
  | "admitted_knowledge_supported"
  | "mixed_supported"
  | "limited"
  | "unresolved";
export type RhOpenQuestionState = "none" | "nonblocking" | "material";

export type RhCopyCode =
  | "report_title"
  | "unable_title"
  | "unable_body"
  | "open_title"
  | "open_body"
  | "completed_title"
  | "completed_body"
  | "comparison_unavailable"
  | "axis_analysis_readiness"
  | "axis_comparison_position"
  | "axis_economic_finding"
  | "axis_priority"
  | "axis_evidence_strength"
  | "axis_open_questions"
  | "axis_unavailable"
  | "axis_available_with_questions"
  | "axis_completed"
  | "axis_needs_confirmation"
  | "axis_no_attention_proven"
  | "axis_attention_present"
  | "axis_supported_impact"
  | "axis_unresolved_material"
  | "axis_routine"
  | "axis_review"
  | "axis_high_priority"
  | "axis_statement_confirmed"
  | "axis_deterministically_derived"
  | "axis_knowledge_supported"
  | "axis_mixed_supported"
  | "axis_limited"
  | "axis_unresolved"
  | "axis_questions_none"
  | "axis_questions_nonblocking"
  | "axis_questions_material"
  | "snapshot_title"
  | "processed_sales"
  | "processing_fees"
  | "effective_rate"
  | "transaction_count"
  | "average_ticket"
  | "metric_unavailable"
  | "rate_undefined"
  | "pricing_title"
  | "pricing_not_confirmed"
  | "pricing_partially_supported"
  | "pricing_axis_confirmed"
  | "pricing_axis_not_confirmed"
  | "pricing_axis_unknown"
  | "pricing_axis_unresolved"
  | "pricing_axis_unavailable"
  | "pricing_axis_not_applicable"
  | "pricing_supported_summary"
  | "pricing_underlying_cost"
  | "pricing_schedule"
  | "pricing_scope"
  | "pricing_cost_pass_through"
  | "pricing_cost_bundled"
  | "pricing_cost_mixed"
  | "pricing_no_active"
  | "pricing_unknown"
  | "pricing_shape_uniform_flat"
  | "pricing_shape_scope_flat"
  | "pricing_shape_tier_ladder"
  | "pricing_shape_rate_item"
  | "pricing_shape_fixed_variable"
  | "pricing_shape_subscription"
  | "pricing_shape_minimum"
  | "pricing_shape_composite"
  | "pricing_shape_custom"
  | "pricing_scope_uniform"
  | "pricing_scope_exceptions"
  | "pricing_scope_specific"
  | "composition_title"
  | "composition_partial"
  | "composition_unreconciled"
  | "category_interchange"
  | "category_network"
  | "category_processor"
  | "category_services"
  | "category_third_party"
  | "category_operational"
  | "category_taxes"
  | "category_other"
  | "category_unresolved"
  | "fee_credit_offset"
  | "inventory_title_complete"
  | "inventory_title_available"
  | "inventory_title_partial"
  | "inventory_item_fee"
  | "inventory_item_credit"
  | "owner_not_confirmed"
  | "control_confirmed"
  | "attention_title"
  | "theme_pricing_structure_title"
  | "theme_pricing_structure_body"
  | "theme_major_driver_title"
  | "theme_major_driver_body"
  | "theme_control_title"
  | "theme_control_body"
  | "theme_refund_title"
  | "theme_refund_body"
  | "theme_service_title"
  | "theme_service_body"
  | "theme_operational_title"
  | "theme_operational_body"
  | "theme_dispute_title"
  | "theme_dispute_body"
  | "theme_program_title"
  | "theme_program_body"
  | "theme_off_statement_title"
  | "theme_off_statement_body"
  | "theme_positive_title"
  | "theme_positive_body"
  | "theme_other_title"
  | "theme_other_body"
  | "questions_title"
  | "question_known"
  | "question_external_rule"
  | "question_pricing_document"
  | "question_processor_explanation"
  | "question_more_history"
  | "question_template_admission"
  | "question_external_source"
  | "question_knowledge_conflict"
  | "question_synthesis_coverage"
  | "question_next_step_document"
  | "question_next_step_processor"
  | "question_next_step_history"
  | "question_next_step_review"
  | "potential_reduction"
  | "potential_reduction_range"
  | "amount_under_review"
  | "action_title"
  | "action_pricing_review"
  | "action_configuration_review"
  | "action_service_review"
  | "action_documentation"
  | "action_process_review"
  | "action_monitoring"
  | "call_pricing"
  | "call_configuration"
  | "call_service"
  | "call_documentation"
  | "call_process"
  | "call_monitoring"
  | "compare_months_title"
  | "compare_months_body"
  | "compare_months_cta"
  | "recovery_cta"
  | "methodology_title"
  | "method_one_statement"
  | "method_net_submitted"
  | "method_rate_denominator"
  | "method_reconciled"
  | "method_partial"
  | "method_unreconciled"
  | "method_no_external_links"
  | "method_open_questions"
  | "evidence_page"
  | "evidence_summary"
  | "evidence_sales"
  | "evidence_funding"
  | "evidence_fees"
  | "evidence_interchange"
  | "evidence_card_activity"
  | "evidence_adjustments"
  | "evidence_chargebacks"
  | "evidence_account"
  | "evidence_notices"
  | "evidence_other";

export type RhCustomerCopy = { code: RhCopyCode; text: string };

export type RhPricingAxisState = "confirmed" | "unknown" | "unresolved" | "unavailable" | "not_applicable";

export type RhPermissionCategory =
  | "public_experience"
  | "financial_metrics"
  | "effective_rate"
  | "transaction_count"
  | "qualified_comparison"
  | "pricing"
  | "composition"
  | "partial_composition"
  | "composition_percentages"
  | "inventory"
  | "ownership_control"
  | "attention"
  | "potential_reduction"
  | "annual_impact"
  | "amount_under_review"
  | "actions"
  | "call_guidance"
  | "statement_evidence"
  | "external_source"
  | "methodology"
  | "continuation";

export type RhPermissionReasonCode =
  | "canonical_fact_available"
  | "canonical_fact_unavailable"
  | "foundational_reporting_unsafe"
  | "canonical_metric_defined"
  | "canonical_metric_undefined"
  | "population_unproven"
  | "qualified_comparison_missing"
  | "pricing_supported"
  | "pricing_unresolved"
  | "cost_stack_reconciled"
  | "cost_stack_partial_reconciled"
  | "cost_stack_unreconciled"
  | "inventory_coverage_available"
  | "ownership_positive_proof"
  | "ownership_unproven"
  | "supported_theme_available"
  | "eligible_counterfactual_available"
  | "eligible_counterfactual_missing"
  | "recurrence_unproven"
  | "verification_amount_available"
  | "supported_lever_available"
  | "safe_call_guidance_available"
  | "safe_statement_reference_available"
  | "external_citations_disabled"
  | "methodology_available"
  | "continuation_available"
  | "continuation_hidden_for_unable";

export type RhAuthorityCeiling =
  | "presentation_only"
  | "statement_evidence_only"
  | "upstream_canonical_only"
  | "upstream_control_proof_only"
  | "upstream_counterfactual_only"
  | "single_statement_education_only"
  | "denied";

export type RhVisibilityPermission = {
  category: RhPermissionCategory;
  state: "permitted" | "limited" | "denied";
  reasonCode: RhPermissionReasonCode;
  authorityCeiling: RhAuthorityCeiling;
};

export type RhSafeMoney = MoneyAmount;
export type RhMetricState = "available" | "undefined" | "unavailable";
export type RhStatementEvidence = {
  ordinal: number;
  pageNumber: number | null;
  kind: "summary" | "sales" | "funding" | "fees" | "interchange" | "card_activity" | "adjustments" | "chargebacks" | "account" | "notices" | "other";
  section: RhCustomerCopy;
};

export type RhSnapshotMetric = {
  label: RhCustomerCopy;
  state: RhMetricState;
  moneyValue: RhSafeMoney | null;
  decimalValue: string | null;
  countValue: number | null;
  evidence: RhStatementEvidence[];
};

export type RhCompositionCategoryCode =
  | "interchange"
  | "network_card_brand"
  | "processor_controlled"
  | "services_admin"
  | "third_party_equipment"
  | "operational_penalty"
  | "processing_fee_taxes"
  | "other_source_grounded"
  | "unresolved";

export type RhCompositionCategory = {
  itemId: string;
  code: RhCompositionCategoryCode;
  label: RhCustomerCopy;
  amount: RhSafeMoney;
  percentageOfPositiveCosts: string | null;
};

export type RhFeeCreditOffset = {
  itemId: string;
  label: RhCustomerCopy;
  amount: RhSafeMoney;
};

export type RhImpact =
  | { kind: "potential_reduction"; label: RhCustomerCopy; amount: RhSafeMoney; annual: boolean }
  | { kind: "potential_reduction_range"; label: RhCustomerCopy; lowerAmount: RhSafeMoney; upperAmount: RhSafeMoney; annual: boolean }
  | { kind: "amount_under_review"; label: RhCustomerCopy; amount: RhSafeMoney; annual: false };

export type RhAttentionItem = {
  itemId: string;
  title: RhCustomerCopy;
  body: RhCustomerCopy;
  priority: RhPriority;
  evidenceStrength: RhEvidenceStrength;
  impact: RhImpact | null;
  evidence: RhStatementEvidence[];
};

export type RhQuestionItem = {
  itemId: string;
  known: RhCustomerCopy;
  uncertain: RhCustomerCopy;
  nextStep: RhCustomerCopy;
  amountUnderReview: RhImpact | null;
};

export type RhInventoryItem = {
  itemId: string;
  label: RhCustomerCopy;
  category: RhCustomerCopy;
  direction: "charge" | "credit";
  amount: RhSafeMoney;
  ownerControl: RhCustomerCopy | null;
  evidence: RhStatementEvidence[];
};

export type RhActionItem = {
  itemId: string;
  kind: "pricing_review" | "configuration_review" | "service_review" | "documentation" | "process_review" | "monitoring";
  title: RhCustomerCopy;
  callQuestion: RhCustomerCopy;
  targetId: string;
};

export type RhVerdictAxes = {
  analysisReadiness: RhAnalysisReadiness;
  comparisonPosition: RhComparisonPosition;
  economicFinding: RhEconomicFinding;
  priority: RhPriority;
  evidenceStrength: RhEvidenceStrength;
  openQuestionState: RhOpenQuestionState;
};

export type CanonicalMerchantReportProjectionV2 = {
  schemaVersion: "canonical_merchant_report_projection_v2_v1";
  authority: "shadow_non_authoritative";
  persistence: "none";
  sourceOfTruth: "canonical_economics_v2_only";
  customerLanguage: "deterministic_copy_registry_only";
  experience: RhPublicExperience;
  header: {
    title: RhCustomerCopy;
    merchantDisplayName: string | null;
    processorDisplayName: string | null;
    statementPeriod: { start: string; end: string } | null;
  };
  verdict: {
    title: RhCustomerCopy;
    body: RhCustomerCopy;
    axes: RhVerdictAxes;
    axisDisplay: Array<{ key: keyof RhVerdictAxes; label: RhCustomerCopy; value: RhCustomerCopy }>;
  };
  permissions: Record<RhPermissionCategory, RhVisibilityPermission>;
  recovery: { body: RhCustomerCopy; action: RhCustomerCopy; targetId: "report-v2-recovery" } | null;
  snapshot: {
    title: RhCustomerCopy;
    processedSales: RhSnapshotMetric;
    processingFees: RhSnapshotMetric;
    effectiveRate: RhSnapshotMetric;
    transactionCount: RhSnapshotMetric;
    averageTicket: RhSnapshotMetric;
  } | null;
  pricing: {
    title: RhCustomerCopy;
    status: "supported" | "partially_supported" | "not_confirmed";
    summary: RhCustomerCopy;
    underlyingCost: { state: RhPricingAxisState; label: RhCustomerCopy; value: RhCustomerCopy | null; reason: RhCustomerCopy };
    schedule: { state: RhPricingAxisState; label: RhCustomerCopy; value: RhCustomerCopy | null; reason: RhCustomerCopy };
    scope: { state: RhPricingAxisState; label: RhCustomerCopy; value: RhCustomerCopy | null; reason: RhCustomerCopy };
  } | null;
  composition: {
    title: RhCustomerCopy;
    state: "reconciled" | "partial_reconciled" | "unreconciled";
    stateCopy: RhCustomerCopy | null;
    authoritativeTotal: RhSafeMoney | null;
    positiveCostTotal: RhSafeMoney;
    categories: RhCompositionCategory[];
    creditOffsets: RhFeeCreditOffset[];
    reconciliationDifference: RhSafeMoney | null;
    unresolvedDifference: { state: "none" | "known" | "unknown"; amount: RhSafeMoney | null };
    percentagesPermitted: boolean;
  } | null;
  attention: { title: RhCustomerCopy; items: RhAttentionItem[] } | null;
  questions: { title: RhCustomerCopy; items: RhQuestionItem[] } | null;
  inventory: {
    title: RhCustomerCopy;
    completeness: "complete" | "available" | "partial";
    items: RhInventoryItem[];
  } | null;
  actions: { title: RhCustomerCopy; items: RhActionItem[] } | null;
  continuation: {
    title: RhCustomerCopy;
    body: RhCustomerCopy;
    action: RhCustomerCopy;
    targetId: "report-v2-compare-months";
  } | null;
  methodology: { title: RhCustomerCopy; items: RhCustomerCopy[] } | null;
};

export type RhProjectionAuditEntry = {
  reportItemRef: string;
  canonicalRefs: string[];
  permission: RhPermissionCategory;
  copyCodes: RhCopyCode[];
  omissionReason: RhPermissionReasonCode | null;
};

export type CanonicalMerchantReportProjectionAuditV1 = {
  schemaVersion: "canonical_merchant_report_projection_audit_v1";
  entries: RhProjectionAuditEntry[];
  ignoredRgLanguageCandidateCount: number;
  knowledgeConflictCount: number;
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export type RhSemanticAmendmentId =
  | "RH-AMEND-001-V2-SOURCE-OF-TRUTH"
  | "RH-AMEND-002-THREE-PUBLIC-EXPERIENCES"
  | "RH-AMEND-003-INDEPENDENT-VERDICT-AXES"
  | "RH-AMEND-004-QUALIFIED-COMPARISON-OR-UNAVAILABLE"
  | "RH-AMEND-005-THEME-BASED-ATTENTION"
  | "RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION"
  | "RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION"
  | "RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS"
  | "RH-AMEND-009-TYPED-CUSTOMER-COPY"
  | "RH-AMEND-010-DETERMINISTIC-LANGUAGE-FALLBACK"
  | "RH-AMEND-011-SINGLE-STATEMENT-ACTION-CEILING"
  | "RH-AMEND-012-REPORT-V1-COEXISTENCE";

export type RhComparisonItem = {
  fact: string;
  evidenceType: "constructed_instance" | "static_architecture";
  classification: CanonicalEconomicsV2DifferenceClassification;
  amendmentId: RhSemanticAmendmentId | null;
  reasonCode: string;
};

export type RhComparisonReport = {
  policyVersion: "canonical_legacy_v2_report_shadow_comparison_v1";
  items: RhComparisonItem[];
  counts: Record<CanonicalEconomicsV2DifferenceClassification, number>;
  hasUnexpectedDivergence: boolean;
};

export type RhPrivacySafeDiagnostics = {
  schemaVersion: CanonicalMerchantReportProjectionV2["schemaVersion"];
  validationStatus: "valid" | "invalid";
  experience: RhPublicExperience;
  permissionCounts: Record<"permitted" | "limited" | "denied", number>;
  sectionCounts: Record<string, number>;
  attentionCount: number;
  questionCount: number;
  inventoryCount: number;
  actionCount: number;
  comparisonCounts: Record<CanonicalEconomicsV2DifferenceClassification, number> | null;
  hasUnexpectedDivergence: boolean;
};
