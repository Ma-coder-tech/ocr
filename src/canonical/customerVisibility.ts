import { CUSTOMER_VISIBILITY_POLICY_VERSION } from "./customerStateTypes.js";
import { addMoney, zeroMoney } from "./opportunityPolicy.js";
import type {
  CanonicalCustomerPermissionDecision,
  CanonicalCustomerPermissionKey,
  CanonicalCustomerVisibility,
  CanonicalOpportunitySummary,
} from "./types.js";

export function buildCanonicalCustomerVisibility(input: {
  permissions: CanonicalCustomerPermissionDecision[];
  summary: CanonicalOpportunitySummary;
}): CanonicalCustomerVisibility {
  const permitted = permissionLookup(input.permissions);
  const showDeterministicOpportunity = permitted("deterministic_opportunity");
  const showEstimatedOpportunity = permitted("estimated_opportunity");
  const visibleDeterministicAnnualAmount = showDeterministicOpportunity ? input.summary.deterministicEligibleAnnualAmount : zeroMoney();
  const visibleApprovedEstimatedAnnualAmount = showEstimatedOpportunity ? input.summary.approvedEstimatedAnnualAmount : zeroMoney();

  return {
    policyVersion: CUSTOMER_VISIBILITY_POLICY_VERSION,
    consumerMayReduceVisibilityOnly: true,
    showCoreMetrics: permitted("core_metrics"),
    showEffectiveRate: permitted("effective_rate"),
    showBenchmark: permitted("benchmark"),
    showFeeInventory: permitted("fee_inventory"),
    showOwnershipActionability: permitted("ownership_actionability"),
    showDeterministicOpportunity,
    showEstimatedOpportunity,
    showVerificationAmounts: permitted("verification_amounts"),
    showEvidenceCalculations: permitted("evidence_calculations"),
    showActions: permitted("actions"),
    showCustomerExplanation: permitted("customer_explanation"),
    visibleDeterministicAnnualAmount,
    visibleApprovedEstimatedAnnualAmount,
    visibleEligibleAnnualAmount: addMoney([visibleDeterministicAnnualAmount, visibleApprovedEstimatedAnnualAmount]),
    visibleVerificationOnlyObservedAmount: permitted("verification_amounts") ? input.summary.verificationOnlyObservedAmount : zeroMoney(),
    visibleNonAnnualizedObservedAmount: permitted("verification_amounts") ? input.summary.nonAnnualizedObservedAmount : zeroMoney(),
    hiddenReasonCodes: input.permissions.filter((permission) => !permission.permitted).flatMap((permission) => permission.reasonCodes).sort(),
  };
}

function permissionLookup(permissions: CanonicalCustomerPermissionDecision[]): (key: CanonicalCustomerPermissionKey) => boolean {
  const map = new Map(permissions.map((permission) => [permission.key, permission.permitted]));
  return (key) => map.get(key) === true;
}
