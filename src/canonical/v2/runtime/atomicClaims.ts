import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { CanonicalEconomicCategory, CanonicalEconomicParticipantRole } from "../economicTypes.js";
import type { ContractV1SafeActionCode, KnowledgeClaimValue, KnowledgeQuery } from "../knowledge/knowledgeTypes.js";
import type { CanonicalUnresolvedClaim, CanonicalUnresolvedClaimClass } from "./unresolvedClaims.js";

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
  | "economic_driver"
  | "recurrence"
  | "counterfactual"
  | "merchant_lever"
  | "merchant_change_right"
  | "merchant_operational_controllability"
  | "constraint_action_effect"
  | "constraint_condition";

export type CanonicalAtomicClaimSeed = {
  parent: CanonicalUnresolvedClaim;
  facet: CanonicalAtomicClaimFacet;
  opaqueSubjectCode: string;
  scopeFingerprint: string;
  knowledgeQuery: KnowledgeQuery | null;
  forcedAtomicClaimId?: string;
  prerequisite?: CanonicalProjectedPrerequisite;
};

export type CanonicalRgExpectedKnowledgeValueConstraint =
  | { kind: "mapping"; sourceCode: string }
  | { kind: "role"; controlDimension: Extract<CanonicalAtomicClaimFacet,
    "economic_beneficiary" | "economic_owner" | "collector" | "billing_intermediary" | "rule_setter" | "price_setter"
    | "negotiator_change_authority" | "contractual_controller"> }
  | { kind: "boolean" }
  | { kind: "synthesis_constraint_identity" }
  | { kind: "synthesis_economic_driver" }
  | { kind: "synthesis_recurrence"; recurrenceBasis: "verified_schedule" }
  | { kind: "synthesis_counterfactual" }
  | { kind: "synthesis_safe_action"; allowedSafeActionCodes: ContractV1SafeActionCode[] }
  | { kind: "synthesis_merchant_influence"; safeActionCode: ContractV1SafeActionCode;
    influenceKind: "merchant_change_right" | "merchant_operational_controllability" }
  | { kind: "synthesis_constraint_action_effect"; safeActionCode: ContractV1SafeActionCode;
    constraintAtomicClaimId: string }
  | { kind: "synthesis_condition_state"; safeActionCode: ContractV1SafeActionCode;
    constraintAtomicClaimId: string; conditionCode: string };

export type CanonicalProjectedPrerequisite = {
  contractId: "canonical_synthesis_admission_contract_v1_1";
  sourceApplicationId: string;
  sourceAtomicClaimId: string;
  safeActionCode: ContractV1SafeActionCode;
  kind: "merchant_influence" | "economic_driver" | "constraint_condition";
  evidenceRoute: "public_document" | "merchant_document" | "additional_statement_history" | "route_unresolved";
  expectedKnowledgeValueConstraint: CanonicalRgExpectedKnowledgeValueConstraint | null;
  knowledgeQuery: KnowledgeQuery | null;
  forcedAtomicClaimId: string | null;
  decisionTier: "D2" | "D1";
  independentBlockingPrerequisiteCodes: string[];
};

const LOSSLESS_CATEGORIES = new Set<Exclude<CanonicalEconomicCategory, "unresolved_unclassified">>([
  "issuer_interchange_economics", "network_card_brand_economics", "processor_acquirer_pricing",
  "processor_service_administrative_cost", "third_party_service_equipment",
  "operational_exception_penalty_fee", "processing_fee_tax", "other_source_grounded_fee",
]);
const LOSSLESS_PARTICIPANT_ROLES = new Set<CanonicalEconomicParticipantRole>([
  "merchant", "processor_platform", "acquirer", "iso_reseller_agent", "gateway", "network_card_brand",
  "issuer_interchange_system", "debit_network", "service_provider", "equipment_lessor", "funding_provider",
  "rule_regulatory_authority",
]);
export const LOSSLESS_ROLE_FACETS = new Set<CanonicalAtomicClaimFacet>([
  "economic_beneficiary", "economic_owner", "collector", "billing_intermediary", "rule_setter", "price_setter",
  "negotiator_change_authority", "contractual_controller",
]);

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
    case "merchant_actionability": return ["economic_driver", "recurrence", "counterfactual", "merchant_lever"];
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

export function compileCanonicalAtomicClaimSeeds(input: {
  claim: CanonicalUnresolvedClaim;
  categoryQuery: KnowledgeQuery | null;
}): CanonicalAtomicClaimSeed[] {
  if (input.claim.prerequisite) {
    const prerequisite = input.claim.prerequisite;
    const facet = input.claim.unresolvedFacets[0]!;
    return [{ parent: input.claim, facet,
      opaqueSubjectCode: `contract_prerequisite_${digest({ source: prerequisite.sourceAtomicClaimId,
        action: prerequisite.safeActionCode, kind: prerequisite.kind, facet,
        forcedAtomicClaimId: prerequisite.forcedAtomicClaimId }).slice(0, 32)}`,
      scopeFingerprint: digest({ sourceScope: prerequisite.knowledgeQuery?.scope ?? null,
        sourceApplicationId: prerequisite.sourceApplicationId,
        canonicalRefs: input.claim.canonicalRefs, occurrenceRefs: input.claim.occurrenceRefs }).slice(0, 32),
      knowledgeQuery: prerequisite.knowledgeQuery,
      forcedAtomicClaimId: prerequisite.forcedAtomicClaimId ?? undefined,
      prerequisite }];
  }
  const withheld = new Set((input.claim.researchWithheldFacets ?? []).map((item) => item.facet));
  const facets = (input.claim.unresolvedFacets?.length > 0
    ? input.claim.unresolvedFacets
    : facetsForUnresolvedClaimClass(input.claim.claimClass)).filter((facet) => !withheld.has(facet));
  const baseSubject = input.categoryQuery?.subjectCode.replace(/^economic_category_/, "economic_charge_")
    ?? `canonical_subject_${digest({ claimClass: input.claim.claimClass, canonicalRefs: input.claim.canonicalRefs,
      occurrenceRefs: input.claim.occurrenceRefs }).slice(0, 32)}`;
  const scopeFingerprint = digest(input.categoryQuery?.scope ?? {
    boundary: "canonical_claim_lineage_only",
    canonicalRefs: input.claim.canonicalRefs,
    occurrenceRefs: input.claim.occurrenceRefs,
  }).slice(0, 32);
  return facets.map((facet) => ({
    parent: input.claim,
    facet,
    opaqueSubjectCode: canonicalFacetSubjectCode(baseSubject, facet),
    scopeFingerprint,
    knowledgeQuery: queryForFacet(facet, baseSubject, input.categoryQuery),
  }));
}

export function atomicClaimIdForSeed(seed: CanonicalAtomicClaimSeed,
  statementPeriod: { start: string; end: string } | null): string {
  if (seed.forcedAtomicClaimId) return seed.forcedAtomicClaimId;
  return canonicalAtomicClaimId({ groupingKey: canonicalAtomicClaimGroupingKey({
    claimClass: seed.parent.claimClass,
    facet: seed.facet,
    opaqueSubjectCode: seed.opaqueSubjectCode,
    scopeFingerprint: seed.scopeFingerprint,
    period: canonicalJson(statementPeriod),
    direction: seed.parent.amountUnderReview?.direction ?? "not_monetary",
  }) });
}

export function canonicalSemanticValueApplicable(input: {
  facet: CanonicalAtomicClaimFacet;
  subjectCode: string;
  value: KnowledgeClaimValue | null;
}): input is { facet: CanonicalAtomicClaimFacet; subjectCode: string; value: KnowledgeClaimValue } {
  const { facet, subjectCode, value } = input;
  if (!value) return false;
  if (facet === "economic_category") return value.kind === "mapping" && value.sourceCode === subjectCode &&
    LOSSLESS_CATEGORIES.has(value.canonicalCode as Exclude<CanonicalEconomicCategory, "unresolved_unclassified">);
  if (!LOSSLESS_ROLE_FACETS.has(facet) || value.kind !== "role" || value.controlDimension !== facet) return false;
  return value.state === "proven"
    ? value.participantRole !== null && LOSSLESS_PARTICIPANT_ROLES.has(value.participantRole)
    : value.state === "not_applicable" && value.participantRole === null;
}

function queryForFacet(
  facet: CanonicalAtomicClaimFacet,
  baseSubject: string,
  categoryQuery: KnowledgeQuery | null,
): KnowledgeQuery | null {
  if (!categoryQuery) return null;
  if (facet === "economic_category") return categoryQuery;
  if (LOSSLESS_ROLE_FACETS.has(facet) || facet === "constraint") {
    return { ...categoryQuery, claimType: "participant_control_role",
      subjectCode: canonicalFacetSubjectCode(baseSubject, facet) };
  }
  if (facet === "merchant_lever") {
    return { ...categoryQuery, claimType: "merchant_lever_availability",
      subjectCode: canonicalFacetSubjectCode(baseSubject, facet) };
  }
  if (facet === "economic_driver" || facet === "recurrence" || facet === "counterfactual") {
    return { ...categoryQuery, claimType: "processor_term",
      subjectCode: canonicalFacetSubjectCode(baseSubject, facet) };
  }
  return null;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
