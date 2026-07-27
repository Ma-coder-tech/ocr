import { CUSTOMER_PERMISSION_KEYS, CUSTOMER_PERMISSIONS_POLICY_VERSION } from "./customerStateTypes.js";
import type {
  CanonicalCustomerActionGuidance,
  CanonicalCustomerAxisProjection,
  CanonicalCustomerPermissionDecision,
  CanonicalCustomerPermissionKey,
  CanonicalOpportunitySummary,
} from "./types.js";

export function buildCanonicalCustomerPermissions(input: {
  axes: CanonicalCustomerAxisProjection;
  summary: CanonicalOpportunitySummary;
  actionGuidance: CanonicalCustomerActionGuidance[];
  effectiveRateAvailable: boolean;
}): CanonicalCustomerPermissionDecision[] {
  const eligibleVisible =
    input.axes.analysisReadiness === "verified" &&
    input.axes.dataIntegrity === "reconciled" &&
    input.axes.opportunityPosture !== "unavailable" &&
    input.summary.totalEligibleAnnualAmount.amountMinor > 0;
  const verificationVisible =
    input.axes.analysisReadiness === "verified" &&
    input.axes.dataIntegrity === "reconciled" &&
    input.axes.opportunityPosture === "verification_only" &&
    input.summary.verificationOnlyObservedAmount.amountMinor > 0 &&
    input.actionGuidance.some((action) => action.verificationComponentRefs.length > 0);
  const coreVisible = input.axes.analysisReadiness === "verified" || input.axes.analysisReadiness === "limited";

  return CUSTOMER_PERMISSION_KEYS.map((key) => permissionFor(key, { input, coreVisible, eligibleVisible, verificationVisible }));
}

function permissionFor(
  key: CanonicalCustomerPermissionKey,
  context: {
    input: {
      axes: CanonicalCustomerAxisProjection;
      summary: CanonicalOpportunitySummary;
      actionGuidance: CanonicalCustomerActionGuidance[];
      effectiveRateAvailable: boolean;
    };
    coreVisible: boolean;
    eligibleVisible: boolean;
    verificationVisible: boolean;
  },
): CanonicalCustomerPermissionDecision {
  const { axes } = context.input;
  if (axes.analysisReadiness === "unavailable") return decision(key, false, ["analysis_unavailable"]);
  if (axes.analysisReadiness === "withheld") return decision(key, key === "customer_explanation", key === "customer_explanation" ? ["withheld_explanation_allowed"] : ["financial_conclusions_withheld"]);

  if (key === "core_metrics") return decision(key, context.coreVisible, context.coreVisible ? ["core_metrics_verified"] : ["core_metrics_unavailable"]);
  if (key === "effective_rate") {
    return decision(key, context.coreVisible && context.input.effectiveRateAvailable, context.coreVisible && context.input.effectiveRateAvailable ? ["effective_rate_supported"] : ["effective_rate_unavailable"]);
  }
  if (key === "benchmark") {
    return decision(key, context.coreVisible && axes.ratePosition !== "unavailable", axes.ratePosition === "unavailable" ? ["qualified_benchmark_unavailable"] : ["qualified_benchmark_available"]);
  }
  if (key === "fee_inventory" || key === "ownership_actionability") {
    return decision(key, context.coreVisible, context.coreVisible ? ["canonical_fee_context_available"] : ["canonical_fee_context_hidden"]);
  }
  if (key === "deterministic_opportunity") {
    return decision(key, context.eligibleVisible && context.input.summary.deterministicEligibleAnnualAmount.amountMinor > 0, context.eligibleVisible ? ["eligible_opportunity_visible"] : ["eligible_opportunity_hidden"]);
  }
  if (key === "estimated_opportunity") {
    return decision(key, context.eligibleVisible && context.input.summary.approvedEstimatedAnnualAmount.amountMinor > 0, context.eligibleVisible ? ["eligible_opportunity_visible"] : ["eligible_opportunity_hidden"]);
  }
  if (key === "verification_amounts") {
    return decision(key, context.verificationVisible, context.verificationVisible ? ["verification_amount_visible"] : ["verification_amount_not_customer_visible"]);
  }
  if (key === "evidence_calculations") return decision(key, context.coreVisible, context.coreVisible ? ["canonical_evidence_visible"] : ["canonical_evidence_hidden"]);
  if (key === "actions") {
    const hasVisibleAction = context.input.actionGuidance.some((action) =>
      context.eligibleVisible ? action.opportunityComponentRefs.length > 0 : context.verificationVisible && action.verificationComponentRefs.length > 0,
    );
    return decision(key, hasVisibleAction, hasVisibleAction ? ["canonical_actions_available"] : ["actions_require_canonical_support"]);
  }
  if (key === "customer_explanation") return decision(key, axes.explanationReadiness !== "unavailable", ["deterministic_fallback_available"]);
  if (key === "ai_enhanced_narrative") return decision(key, axes.explanationReadiness === "ai_enhanced", axes.explanationReadiness === "ai_enhanced" ? ["safe_ai_narrative_available"] : ["deterministic_fallback_required"]);
  return decision(key, false, ["unsupported_permission"]);
}

function decision(key: CanonicalCustomerPermissionKey, permitted: boolean, reasonCodes: string[]): CanonicalCustomerPermissionDecision {
  return {
    key,
    permitted,
    reasonCodes,
    limitationCodes: permitted ? [] : reasonCodes,
    policyVersion: CUSTOMER_PERMISSIONS_POLICY_VERSION,
  };
}
