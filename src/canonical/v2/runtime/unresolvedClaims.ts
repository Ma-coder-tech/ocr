import { createHash } from "node:crypto";

import type { CanonicalEconomicsV2EconomicAnalysis } from "../economicTypes.js";
import type { CanonicalEconomicsV2PricingAnalysis } from "../pricingTypes.js";
import type { CanonicalEconomicsV2SynthesisAnalysis } from "../synthesisTypes.js";
import { canonicalJson } from "../canonicalJson.js";

export const UNRESOLVED_CLAIM_INVENTORY_SCHEMA_VERSION = "canonical_unresolved_claim_inventory_v1" as const;

export type CanonicalUnresolvedClaimClass =
  | "pricing_underlying_cost"
  | "pricing_schedule"
  | "pricing_scope"
  | "fee_detail_coverage"
  | "economic_category"
  | "economic_ownership"
  | "economic_control"
  | "merchant_actionability";

export type CanonicalUnresolvedClaim = {
  claimId: string;
  claimClass: CanonicalUnresolvedClaimClass;
  state: "unresolved" | "unavailable" | "conflicting";
  canonicalRefs: string[];
  occurrenceRefs: string[];
  evidenceRefs: string[];
  amountUnderReview: {
    amountMinor: number;
    currency: "USD";
    direction: "debit" | "credit";
  } | null;
  requiredEvidenceClass:
    | "admitted_pricing_evidence"
    | "admitted_fee_detail_evidence"
    | "admitted_category_mapping"
    | "positive_period_applicable_ownership_evidence"
    | "positive_period_applicable_control_evidence"
    | "proven_control_recurrence_and_counterfactual_evidence";
  possibleDecisionEffects: Array<
    | "pricing_interpretation"
    | "cost_stack_completeness"
    | "economic_interpretation"
    | "composition_permission"
    | "merchant_attention"
    | "merchant_lever"
    | "recommendation_permission"
    | "impact_permission"
  >;
  blockingEffect: "limits_authority";
  materialityState: "not_evaluated";
  researchEligibility: "not_evaluated";
  limitations: string[];
};

export type CanonicalUnresolvedClaimInventory = {
  schemaVersion: typeof UNRESOLVED_CLAIM_INVENTORY_SCHEMA_VERSION;
  authority: "canonical_dependency_inventory_only";
  productionExecution: "disabled";
  rfResolution: "disabled";
  rgResearch: "disabled";
  benchmarkExecution: "disabled";
  businessContextAuthority: "excluded_from_canonical_economics";
  claims: CanonicalUnresolvedClaim[];
  countsByClass: Partial<Record<CanonicalUnresolvedClaimClass, number>>;
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] };
};

export function buildCanonicalUnresolvedClaimInventory(input: {
  pricing: CanonicalEconomicsV2PricingAnalysis | null;
  economic: CanonicalEconomicsV2EconomicAnalysis | null;
  synthesis: CanonicalEconomicsV2SynthesisAnalysis | null;
}): CanonicalUnresolvedClaimInventory {
  const claims: CanonicalUnresolvedClaim[] = [];
  if (input.pricing?.validation.status === "valid") claims.push(...pricingClaims(input.pricing));
  if (input.economic?.validation.status === "valid") claims.push(...economicClaims(input.economic));
  const sorted = claims.sort((left, right) => left.claimId.localeCompare(right.claimId));
  const countsByClass: CanonicalUnresolvedClaimInventory["countsByClass"] = {};
  for (const claim of sorted) countsByClass[claim.claimClass] = (countsByClass[claim.claimClass] ?? 0) + 1;
  const inventory: CanonicalUnresolvedClaimInventory = {
    schemaVersion: UNRESOLVED_CLAIM_INVENTORY_SCHEMA_VERSION,
    authority: "canonical_dependency_inventory_only",
    productionExecution: "disabled",
    rfResolution: "disabled",
    rgResearch: "disabled",
    benchmarkExecution: "disabled",
    businessContextAuthority: "excluded_from_canonical_economics",
    claims: sorted,
    countsByClass,
    validation: { status: "valid", errors: [], warnings: [] },
  };
  const errors = validateInventory(inventory, input);
  return { ...inventory, validation: { status: errors.length === 0 ? "valid" : "invalid", errors, warnings: [] } };
}

function pricingClaims(pricing: CanonicalEconomicsV2PricingAnalysis): CanonicalUnresolvedClaim[] {
  const axes = [
    ["pricing_underlying_cost", pricing.pricingArchitecture.underlyingCostBillingMode],
    ["pricing_schedule", pricing.pricingArchitecture.merchantPriceScheduleShape],
    ["pricing_scope", pricing.pricingArchitecture.scopeUniformity],
  ] as const;
  return axes.flatMap(([claimClass, axis]) => {
    const unresolved = axis.status !== "available" || axis.value === null || axis.value === "unknown" || axis.value === "unresolved";
    if (!unresolved) return [];
    return [claim({
      claimClass,
      state: axis.status === "unavailable" ? "unavailable" : "unresolved",
      canonicalRefs: [axis.id],
      occurrenceRefs: axis.occurrenceRefs,
      evidenceRefs: axis.evidenceRefs,
      amountUnderReview: null,
      requiredEvidenceClass: "admitted_pricing_evidence",
      possibleDecisionEffects: ["pricing_interpretation"],
      limitations: axis.limitations,
    })];
  });
}

function economicClaims(economic: CanonicalEconomicsV2EconomicAnalysis): CanonicalUnresolvedClaim[] {
  const foundation = economic.pricingAnalysis.foundation;
  const output: CanonicalUnresolvedClaim[] = [];
  if (economic.economicLayer.admissionProfile.feeDetailCoverage !== "complete") {
    const feeFact = foundation.financialPopulations.totalStatementProcessingFees;
    output.push(claim({
      claimClass: "fee_detail_coverage",
      state: feeFact.status === "available" ? "unresolved" : "unavailable",
      canonicalRefs: [feeFact.id],
      occurrenceRefs: feeFact.occurrenceRefs,
      evidenceRefs: feeFact.evidenceRefs,
      amountUnderReview: feeFact.value === null ? null : {
        amountMinor: Math.abs(feeFact.value.amountMinor), currency: "USD", direction: "debit",
      },
      requiredEvidenceClass: "admitted_fee_detail_evidence",
      possibleDecisionEffects: ["cost_stack_completeness", "economic_interpretation", "composition_permission"],
      limitations: ["Fee-detail coverage is not proven; the authoritative fee total remains valid when available."],
    }));
  }
  for (const charge of economic.economicLayer.charges) {
    if (charge.contributionStatus !== "contributes_unresolved" || !charge.observedAmount ||
        (charge.financialDirection !== "debit" && charge.financialDirection !== "credit")) continue;
    const amountUnderReview = {
      amountMinor: charge.observedAmount.amountMinor,
      currency: "USD" as const,
      direction: charge.financialDirection,
    };
    const common = {
      state: charge.categoryResolution === "conflicting" ? "conflicting" as const : "unresolved" as const,
      canonicalRefs: [charge.id], occurrenceRefs: charge.sourceOccurrenceRefs,
      evidenceRefs: charge.evidenceRefs, amountUnderReview,
    };
    output.push(
      claim({ ...common, claimClass: "economic_category", requiredEvidenceClass: "admitted_category_mapping",
        possibleDecisionEffects: ["economic_interpretation", "composition_permission", "merchant_attention"],
        limitations: ["The charge contributes to statement cost, but its economic category is unresolved."] }),
      claim({ ...common, claimClass: "economic_ownership", requiredEvidenceClass: "positive_period_applicable_ownership_evidence",
        possibleDecisionEffects: ["economic_interpretation", "composition_permission", "merchant_attention"],
        limitations: ["The observed charge does not by itself prove its economic owner."] }),
      claim({ ...common, claimClass: "economic_control", requiredEvidenceClass: "positive_period_applicable_control_evidence",
        possibleDecisionEffects: ["merchant_lever", "recommendation_permission"],
        limitations: ["The observed charge does not by itself prove who can change or negotiate it."] }),
      claim({ ...common, claimClass: "merchant_actionability", requiredEvidenceClass: "proven_control_recurrence_and_counterfactual_evidence",
        possibleDecisionEffects: ["merchant_attention", "merchant_lever", "recommendation_permission", "impact_permission"],
        limitations: ["Cost contribution alone cannot establish actionability, recurrence, a counterfactual, or savings."] }),
    );
  }
  return output;
}

function claim(input: Omit<CanonicalUnresolvedClaim, "claimId" | "blockingEffect" | "materialityState" | "researchEligibility">): CanonicalUnresolvedClaim {
  const canonicalRefs = unique(input.canonicalRefs);
  const occurrenceRefs = unique(input.occurrenceRefs);
  const evidenceRefs = unique(input.evidenceRefs);
  return {
    ...input,
    claimId: `unresolved-claim-${digest({ claimClass: input.claimClass, canonicalRefs, occurrenceRefs })}`,
    canonicalRefs,
    occurrenceRefs,
    evidenceRefs,
    possibleDecisionEffects: unique(input.possibleDecisionEffects),
    blockingEffect: "limits_authority",
    materialityState: "not_evaluated",
    researchEligibility: "not_evaluated",
    limitations: unique(input.limitations),
  };
}

function validateInventory(inventory: CanonicalUnresolvedClaimInventory, input: {
  pricing: CanonicalEconomicsV2PricingAnalysis | null;
  economic: CanonicalEconomicsV2EconomicAnalysis | null;
  synthesis: CanonicalEconomicsV2SynthesisAnalysis | null;
}): string[] {
  const errors: string[] = [];
  const foundation = input.pricing?.foundation ?? input.economic?.pricingAnalysis.foundation ?? null;
  const occurrenceIds = new Set(foundation?.sourceModel.occurrences.map((item) => item.id) ?? []);
  const evidenceIds = new Set(foundation?.sourceModel.evidence.map((item) => item.id) ?? []);
  if (new Set(inventory.claims.map((item) => item.claimId)).size !== inventory.claims.length) errors.push("duplicate_unresolved_claim_identity");
  for (const item of inventory.claims) {
    if (item.canonicalRefs.length === 0) errors.push(`unresolved_claim_missing_canonical_ref:${item.claimId}`);
    if (item.occurrenceRefs.some((ref) => !occurrenceIds.has(ref))) errors.push(`unresolved_claim_broken_occurrence_ref:${item.claimId}`);
    if (item.evidenceRefs.some((ref) => !evidenceIds.has(ref))) errors.push(`unresolved_claim_broken_evidence_ref:${item.claimId}`);
    if (item.amountUnderReview && item.amountUnderReview.amountMinor < 0) errors.push(`unresolved_claim_negative_magnitude:${item.claimId}`);
  }
  return unique(errors);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 24);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}
