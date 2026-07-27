import { buildCanonicalCustomerActionGuidance } from "./customerActionGuidance.js";
import { buildCanonicalCustomerPermissions } from "./customerPermissions.js";
import {
  buildCustomerMateriality,
  coreFactsUnsafe,
  hasActionableVerification,
  resolveAxes,
  resolveDataIntegrity,
  resolvePrimaryState,
  unavailableRateComparison,
} from "./customerStatePolicy.js";
import {
  CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION,
  CUSTOMER_BENCHMARK_POLICY_VERSION,
  CUSTOMER_PERMISSIONS_POLICY_VERSION,
  CUSTOMER_STATE_MATERIALITY_POLICY_VERSION,
  CUSTOMER_STATE_POLICY_VERSION,
  CUSTOMER_VISIBILITY_POLICY_VERSION,
  CUSTOMER_WORDING_POLICY_VERSION,
} from "./customerStateTypes.js";
import { buildCanonicalCustomerVisibility } from "./customerVisibility.js";
import { buildCanonicalCustomerExplanation } from "./customerWording.js";
import type {
  CanonicalAiCapabilityLayer,
  CanonicalCustomerRateComparison,
  CanonicalCustomerStateProjection,
  CanonicalFeeLedger,
  CanonicalFeeOwnershipActionability,
  CanonicalFinancialFacts,
  CanonicalOpportunityEngine,
  CanonicalStatementIdentity,
} from "./types.js";

export function buildCanonicalCustomerState(input: {
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  feeLedger: CanonicalFeeLedger;
  feeOwnershipActionability: CanonicalFeeOwnershipActionability;
  opportunityEngine: CanonicalOpportunityEngine;
  aiCapabilities: CanonicalAiCapabilityLayer;
  rateComparison?: CanonicalCustomerRateComparison | null;
}): CanonicalCustomerStateProjection {
  const rateComparison = normalizeRateComparison(input.rateComparison);
  const coreUnsafe = coreFactsUnsafe({ financialFacts: input.financialFacts, identity: input.identity });
  const dataIntegrity = resolveDataIntegrity({
    coreUnsafe,
    feeLedgerStatus: input.feeLedger.status,
    controlStatuses: input.feeLedger.controls.map((control) => control.status).sort(),
  });
  const materiality = buildCustomerMateriality({
    financialFacts: input.financialFacts,
    identity: input.identity,
    opportunitySummary: input.opportunityEngine.summary,
  });
  const preliminaryActions = buildCanonicalCustomerActionGuidance({
    opportunityEngine: input.opportunityEngine,
    classifications: input.feeOwnershipActionability.rowClassifications,
  });
  const verificationActionable = hasActionableVerification(
    input.opportunityEngine.components,
    preliminaryActions.flatMap((action) => action.verificationComponentRefs),
  );
  const axes = resolveAxes({
    coreUnsafe,
    dataIntegrity,
    aiCapabilities: input.aiCapabilities,
    rateComparison,
    materiality,
    opportunitySummary: input.opportunityEngine.summary,
    verificationActionable,
  });
  const primaryState = resolvePrimaryState({
    coreUnsafe,
    axes,
    rateComparison,
    opportunitySummary: input.opportunityEngine.summary,
    verificationActionable,
  });
  const permissions = buildCanonicalCustomerPermissions({
    axes,
    summary: input.opportunityEngine.summary,
    actionGuidance: preliminaryActions,
    effectiveRateAvailable: input.financialFacts.rateRevealCalculatedAllInRate.status === "selected" && input.financialFacts.rateRevealCalculatedAllInRate.value !== null,
  });
  const visibility = buildCanonicalCustomerVisibility({
    permissions,
    summary: input.opportunityEngine.summary,
  });
  const actionPermitted = permissions.find((permission) => permission.key === "actions")?.permitted === true;
  const actionGuidance = actionPermitted ? preliminaryActions : [];
  const explanation = buildCanonicalCustomerExplanation({
    identity: input.identity,
    financialFacts: input.financialFacts,
    axes,
    primaryState,
    visibility,
    aiCapabilities: input.aiCapabilities,
    benchmarkUnavailable: rateComparison.status === "unavailable",
  });

  return {
    policyVersion: CUSTOMER_STATE_POLICY_VERSION,
    materialityPolicyVersion: CUSTOMER_STATE_MATERIALITY_POLICY_VERSION,
    benchmarkPolicyVersion: CUSTOMER_BENCHMARK_POLICY_VERSION,
    permissionPolicyVersion: CUSTOMER_PERMISSIONS_POLICY_VERSION,
    visibilityPolicyVersion: CUSTOMER_VISIBILITY_POLICY_VERSION,
    actionGuidancePolicyVersion: CUSTOMER_ACTION_GUIDANCE_POLICY_VERSION,
    wordingPolicyVersion: CUSTOMER_WORDING_POLICY_VERSION,
    axes,
    primaryState,
    rateComparison,
    materiality,
    permissions,
    visibility,
    actionGuidance,
    explanation,
    reasonCodes: reasonCodes({ coreUnsafe, dataIntegrity, primaryState, benchmarkUnavailable: rateComparison.status === "unavailable" }),
    limitations: [
      "Package G is canonical/harness-only and does not feed Report V1, legacy reports, frontend, APIs, workers, persistence, production, or feature flags.",
      "Benchmark-unavailable analysis keeps rate position unavailable instead of inferring competitiveness.",
      "Customer-visible totals are reconstructed from Package E eligible components and Package G permissions.",
    ],
  };
}

function normalizeRateComparison(rateComparison: CanonicalCustomerRateComparison | null | undefined): CanonicalCustomerRateComparison {
  if (!rateComparison) return unavailableRateComparison();
  if (rateComparison.status !== "qualified") return unavailableRateComparison(rateComparison.reasonCodes[0] ?? "qualified_benchmark_unavailable");
  return {
    ...rateComparison,
    policyVersion: CUSTOMER_BENCHMARK_POLICY_VERSION,
    evidenceRefs: [...new Set(rateComparison.evidenceRefs)].sort(),
    reasonCodes: [...new Set(rateComparison.reasonCodes)].sort(),
    aiSourced: false,
  };
}

function reasonCodes(input: {
  coreUnsafe: boolean;
  dataIntegrity: string;
  primaryState: string;
  benchmarkUnavailable: boolean;
}): string[] {
  const codes = [input.primaryState];
  if (input.coreUnsafe) codes.push("core_totals_unsafe_or_missing");
  if (input.dataIntegrity !== "reconciled") codes.push(`data_integrity_${input.dataIntegrity}`);
  if (input.benchmarkUnavailable) codes.push("qualified_benchmark_unavailable");
  return [...new Set(codes)].sort();
}
