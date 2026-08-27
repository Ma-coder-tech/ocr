import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalUnresolvedClaimClass } from "./unresolvedClaims.js";

export const CANONICAL_ATOMIC_CLAIM_IDENTITY_VERSION = "canonical_atomic_claim_identity_v1" as const;

export type CanonicalAtomicClaimFacet =
  | "underlying_cost_billing_mode"
  | "merchant_price_schedule_shape"
  | "pricing_scope_uniformity"
  | "fee_detail_coverage"
  | "economic_category"
  | "economic_beneficiary"
  | "economic_owner"
  | "collector"
  | "billing_intermediary"
  | "rule_setter"
  | "price_setter"
  | "negotiator_change_authority"
  | "contractual_controller"
  | "constraint"
  | "recurrence"
  | "counterfactual"
  | "merchant_lever";

export function facetsForUnresolvedClaimClass(claimClass: CanonicalUnresolvedClaimClass): CanonicalAtomicClaimFacet[] {
  switch (claimClass) {
    case "pricing_underlying_cost": return ["underlying_cost_billing_mode"];
    case "pricing_schedule": return ["merchant_price_schedule_shape"];
    case "pricing_scope": return ["pricing_scope_uniformity"];
    case "fee_detail_coverage": return ["fee_detail_coverage"];
    case "economic_category": return ["economic_category"];
    case "economic_ownership": return ["economic_beneficiary", "economic_owner"];
    case "economic_control": return ["collector", "billing_intermediary", "rule_setter", "price_setter",
      "negotiator_change_authority", "contractual_controller", "constraint"];
    case "merchant_actionability": return ["recurrence", "counterfactual", "merchant_lever"];
  }
}

export function canonicalAtomicClaimGroupingKey(input: {
  claimClass: CanonicalUnresolvedClaimClass;
  facet: CanonicalAtomicClaimFacet;
  opaqueSubjectCode: string;
  scopeFingerprint: string;
  period: string;
  direction: string;
}): string {
  return canonicalJson({ identityVersion: CANONICAL_ATOMIC_CLAIM_IDENTITY_VERSION, ...input });
}

export function canonicalAtomicClaimId(input: {
  groupingKey: string;
}): string {
  return `atomic-claim-${digest({ identityVersion: CANONICAL_ATOMIC_CLAIM_IDENTITY_VERSION,
    groupingKey: input.groupingKey })}`;
}

export function canonicalFacetSubjectCode(baseSubject: string, facet: CanonicalAtomicClaimFacet): string {
  if (facet === "economic_category") return baseSubject.replace(/^economic_charge_/, "economic_category_");
  return `${facet}_${digest({ baseSubject, facet }).slice(0, 32)}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
