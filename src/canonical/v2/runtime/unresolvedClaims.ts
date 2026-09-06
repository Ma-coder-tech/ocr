import { createHash } from "node:crypto";

import type { CanonicalEconomicsV2EconomicAnalysis } from "../economicTypes.js";
import type { CanonicalEconomicsV2PricingAnalysis } from "../pricingTypes.js";
import type { CanonicalEconomicsV2SynthesisAnalysis } from "../synthesisTypes.js";
import { canonicalJson } from "../canonicalJson.js";
import { facetsForUnresolvedClaimClass, type CanonicalAtomicClaimFacet } from "./atomicClaims.js";
import type { CanonicalProjectedPrerequisite } from "./atomicClaims.js";
import type { KnowledgeQuery } from "../knowledge/knowledgeTypes.js";
import { CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1 } from "../synthesisContractV1Types.js";

export const UNRESOLVED_CLAIM_INVENTORY_SCHEMA_VERSION = "canonical_unresolved_claim_inventory_v2" as const;

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
    | "proven_control_recurrence_and_counterfactual_evidence"
    | "positive_exact_contract_prerequisite_evidence";
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
  unresolvedFacets: CanonicalAtomicClaimFacet[];
  researchWithheldFacets: Array<{ facet: CanonicalAtomicClaimFacet; reasonCode: string }>;
  limitations: string[];
  prerequisite?: CanonicalProjectedPrerequisite | null;
};

export type CanonicalUnresolvedClaimInventory = {
  schemaVersion: typeof UNRESOLVED_CLAIM_INVENTORY_SCHEMA_VERSION;
  authority: "canonical_dependency_inventory_only";
  productionExecution: "rf_claim_resolution_enabled";
  rfResolution: "claim_specific_admitted_resolution_enabled";
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
  facetDispositions?: Array<{
    chargeRef: string;
    facet: CanonicalAtomicClaimFacet;
    disposition: "resolved" | "conflicting" | "verified_but_unapplied";
    reasonCode: string;
  }>;
  projectionScopeBindings?: Array<{ atomicClaimId: string; knowledgeQuery: KnowledgeQuery | null }>;
}): CanonicalUnresolvedClaimInventory {
  const claims: CanonicalUnresolvedClaim[] = [];
  if (input.pricing?.validation.status === "valid") claims.push(...pricingClaims(input.pricing));
  if (input.economic?.validation.status === "valid") claims.push(...economicClaims(input.economic, input.facetDispositions ?? []));
  if (input.economic?.validation.status === "valid" && input.synthesis?.validation.status === "valid") {
    claims.push(...projectContractV1_1Prerequisites(input.economic, input.synthesis, input.projectionScopeBindings ?? []));
  }
  const sorted = claims.sort((left, right) => left.claimId.localeCompare(right.claimId));
  const countsByClass: CanonicalUnresolvedClaimInventory["countsByClass"] = {};
  for (const claim of sorted) countsByClass[claim.claimClass] = (countsByClass[claim.claimClass] ?? 0) + 1;
  const inventory: CanonicalUnresolvedClaimInventory = {
    schemaVersion: UNRESOLVED_CLAIM_INVENTORY_SCHEMA_VERSION,
    authority: "canonical_dependency_inventory_only",
    productionExecution: "rf_claim_resolution_enabled",
    rfResolution: "claim_specific_admitted_resolution_enabled",
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

function economicClaims(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  facetDispositions: NonNullable<Parameters<typeof buildCanonicalUnresolvedClaimInventory>[0]["facetDispositions"]>,
): CanonicalUnresolvedClaim[] {
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
    if (!["contributes_unresolved", "contributes_classified"].includes(charge.contributionStatus) || !charge.observedAmount ||
        (charge.financialDirection !== "debit" && charge.financialDirection !== "credit")) continue;
    const amountUnderReview = {
      amountMinor: charge.observedAmount.amountMinor,
      currency: "USD" as const,
      direction: charge.financialDirection,
    };
    const common = {
      state: "unresolved" as const,
      canonicalRefs: [charge.id], occurrenceRefs: charge.sourceOccurrenceRefs,
      evidenceRefs: charge.evidenceRefs, amountUnderReview,
    };
    if (charge.categoryResolution !== "proven") {
      output.push(claim({ ...common,
        state: charge.categoryResolution === "conflicting" ? "conflicting" : "unresolved",
        claimClass: "economic_category", requiredEvidenceClass: "admitted_category_mapping",
        possibleDecisionEffects: ["economic_interpretation", "composition_permission", "merchant_attention"],
        limitations: ["The charge contributes to statement cost, but its economic category is unresolved."] }));
    }
    const resolvedDimensions = new Set(economic.economicLayer.roleClaims.filter((item) => item.chargeRef === charge.id &&
      (item.resolution === "proven" || item.resolution === "not_applicable")).map((item) => item.dimension));
    const externalResolved = new Set(facetDispositions.filter((item) => item.chargeRef === charge.id && item.disposition === "resolved")
      .map((item) => item.facet));
    const withheld = facetDispositions.filter((item) => item.chargeRef === charge.id && item.disposition === "verified_but_unapplied")
      .map((item) => ({ facet: item.facet, reasonCode: item.reasonCode }));
    const remaining = (claimClass: CanonicalUnresolvedClaimClass) => facetsForUnresolvedClaimClass(claimClass)
      .filter((facet) => !resolvedDimensions.has(facet as never) && !externalResolved.has(facet));
    const ownershipFacets = remaining("economic_ownership");
    const controlFacets = remaining("economic_control");
    const actionabilityFacets = remaining("merchant_actionability");
    if (ownershipFacets.length > 0) output.push(
      claim({ ...common, claimClass: "economic_ownership", unresolvedFacets: ownershipFacets,
        researchWithheldFacets: withheld.filter((item) => ownershipFacets.includes(item.facet)), requiredEvidenceClass: "positive_period_applicable_ownership_evidence",
        possibleDecisionEffects: ["economic_interpretation", "composition_permission", "merchant_attention"],
        limitations: ["The observed charge does not by itself prove its economic owner."] }));
    if (controlFacets.length > 0) output.push(
      claim({ ...common, claimClass: "economic_control", unresolvedFacets: controlFacets,
        researchWithheldFacets: withheld.filter((item) => controlFacets.includes(item.facet)), requiredEvidenceClass: "positive_period_applicable_control_evidence",
        possibleDecisionEffects: ["merchant_lever", "recommendation_permission"],
        limitations: ["The observed charge does not by itself prove who can change or negotiate it."] }));
    if (actionabilityFacets.length > 0) output.push(
      claim({ ...common, claimClass: "merchant_actionability", unresolvedFacets: actionabilityFacets,
        researchWithheldFacets: withheld.filter((item) => actionabilityFacets.includes(item.facet)), requiredEvidenceClass: "proven_control_recurrence_and_counterfactual_evidence",
        possibleDecisionEffects: ["merchant_attention", "merchant_lever", "recommendation_permission", "impact_permission"],
        limitations: ["Cost contribution alone cannot establish actionability, recurrence, a counterfactual, or savings."] }));
  }
  return output;
}

function projectContractV1_1Prerequisites(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  synthesis: CanonicalEconomicsV2SynthesisAnalysis,
  bindings: Array<{ atomicClaimId: string; knowledgeQuery: KnowledgeQuery | null }>,
): CanonicalUnresolvedClaim[] {
  const contract = synthesis.synthesisLayer.contractV1;
  if (!contract || contract.contractId !== CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1) return [];
  const bindingByAtomic = new Map(bindings.map((item) => [item.atomicClaimId, item.knowledgeQuery] as const));
  const applicationByAtomic = new Map(contract.applications.map((item) => [item.atomicClaimId, item] as const));
  const constraintById = new Map(contract.constraints.map((item) => [item.constraintId, item] as const));
  const output: CanonicalUnresolvedClaim[] = [];
  for (const action of contract.actions) {
    const source = applicationByAtomic.get(action.atomicClaimId);
    if (!source || source.value.kind !== "synthesis_safe_action" || action.state === "not_available") continue;
    // These exact actions never acquire influence/driver/impact prerequisites here. An independently admitted
    // exact-action constraint effect may still name a condition, which remains isolated to that exact action.
    const noInfluencePrerequisites = ["request_pricing_application_review", "establish_monitoring_baseline",
      "request_governing_documentation", "verify_account_capability_or_configuration"].includes(action.safeActionCode);

    const missing: Array<{ key: string; facet: CanonicalAtomicClaimFacet;
      prerequisite: Omit<CanonicalProjectedPrerequisite, "decisionTier" | "independentBlockingPrerequisiteCodes"> }> = [];
    const sameScope = (candidate: typeof source) => candidate.scopeFingerprint === source.scopeFingerprint
      && candidate.statementPeriod.start === source.statementPeriod.start
      && candidate.statementPeriod.end === source.statementPeriod.end
      && sameSet(candidate.chargeRefs, source.chargeRefs);
    const influenceKinds = noInfluencePrerequisites ? [] : action.requiredInfluence === "both"
      ? ["merchant_change_right", "merchant_operational_controllability"] as const
      : action.requiredInfluence === "none" ? []
        : [action.requiredInfluence] as const;
    for (const influenceKind of influenceKinds) {
      const resolved = contract.applications.some((candidate) => sameScope(candidate)
        && candidate.value.kind === "synthesis_merchant_influence"
        && candidate.value.safeActionCode === action.safeActionCode
        && candidate.value.influenceKind === influenceKind && candidate.value.state === "proven");
      if (!resolved) missing.push({ key: influenceKind, facet: influenceKind, prerequisite: {
        contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1,
        sourceApplicationId: source.applicationId, sourceAtomicClaimId: source.atomicClaimId,
        safeActionCode: action.safeActionCode, kind: "merchant_influence", evidenceRoute: "merchant_document",
        expectedKnowledgeValueConstraint: { kind: "synthesis_merchant_influence",
          safeActionCode: action.safeActionCode, influenceKind }, knowledgeQuery: null, forcedAtomicClaimId: null,
      } });
    }
    if (action.safeActionCode === "review_supported_operational_process_change") {
      const driverResolved = contract.applications.some((candidate) => sameScope(candidate)
        && candidate.value.kind === "synthesis_economic_driver");
      if (!driverResolved) {
        const parentQuery = bindingByAtomic.get(source.atomicClaimId) ?? null;
        const subjectCode = `contract_driver_${digest({ action: source.atomicClaimId, scope: source.scopeFingerprint })}`;
        missing.push({ key: "economic_driver", facet: "economic_driver", prerequisite: {
          contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1,
          sourceApplicationId: source.applicationId, sourceAtomicClaimId: source.atomicClaimId,
          safeActionCode: action.safeActionCode, kind: "economic_driver",
          evidenceRoute: parentQuery ? "public_document" : "route_unresolved",
          expectedKnowledgeValueConstraint: { kind: "synthesis_economic_driver" },
          knowledgeQuery: parentQuery ? { ...parentQuery, claimType: "processor_term", subjectCode } : null,
          forcedAtomicClaimId: null,
        } });
      }
    }
    const effects = contract.constraintActionEffects.filter((effect) => effect.safeActionCode === action.safeActionCode
      && effect.scopeFingerprint === source.scopeFingerprint
      && effect.statementPeriod.start === source.statementPeriod.start
      && effect.statementPeriod.end === source.statementPeriod.end
      && sameSet(constraintById.get(effect.constraintRef)?.constrainedChargeRefs ?? [], source.chargeRefs));
    for (const effect of effects.filter((item) => item.effectState === "conditions_action")) {
      const constraint = constraintById.get(effect.constraintRef);
      if (!constraint) continue;
      for (const conditionAtomicClaimId of effect.conditionAtomicClaimIds) {
        if (applicationByAtomic.has(conditionAtomicClaimId)) continue;
        missing.push({ key: `condition:${conditionAtomicClaimId}`, facet: "constraint_condition", prerequisite: {
          contractId: CANONICAL_SYNTHESIS_ADMISSION_CONTRACT_V1_1,
          sourceApplicationId: source.applicationId, sourceAtomicClaimId: source.atomicClaimId,
          safeActionCode: action.safeActionCode, kind: "constraint_condition", evidenceRoute: "route_unresolved",
          // Contract v1 carries the exact condition atomic identity but no independently interpretable condition code.
          // Preserve it as a typed blocker; never invent a provider query or semantic code from an opaque identifier.
          expectedKnowledgeValueConstraint: null, knowledgeQuery: null, forcedAtomicClaimId: conditionAtomicClaimId,
        } });
      }
    }
    const opaqueBlockers = unique([
      ...action.implementationDependencyCodes.map((code) => `implementation_dependency:${code}`),
      ...effects.flatMap((effect) => effect.dependencyCodes.map((code) => `constraint_effect_dependency:${code}`)),
    ]);
    const allBlockers = unique([...missing.map((item) => item.key), ...opaqueBlockers]);
    for (const item of missing) {
      const prerequisite: CanonicalProjectedPrerequisite = {
        ...item.prerequisite,
        decisionTier: allBlockers.length === 1 ? "D2" : "D1",
        independentBlockingPrerequisiteCodes: allBlockers.filter((code) => code !== item.key),
      };
      output.push(projectedPrerequisiteClaim(economic, source, item.facet, prerequisite));
    }
  }
  return output;
}

function projectedPrerequisiteClaim(
  economic: CanonicalEconomicsV2EconomicAnalysis,
  source: NonNullable<CanonicalEconomicsV2SynthesisAnalysis["synthesisLayer"]["contractV1"]>["applications"][number],
  facet: CanonicalAtomicClaimFacet,
  prerequisite: CanonicalProjectedPrerequisite,
): CanonicalUnresolvedClaim {
  const charges = economic.economicLayer.charges.filter((item) => source.chargeRefs.includes(item.id));
  const directions = unique(charges.map((item) => item.financialDirection)
    .filter((item): item is "debit" | "credit" => item === "debit" || item === "credit"));
  const amounts = charges.map((item) => item.observedAmount?.amountMinor ?? null);
  const amountUnderReview = directions.length === 1 && amounts.every((item): item is number => item !== null)
    ? { amountMinor: amounts.reduce((sum, value) => sum + Math.abs(value), 0), currency: "USD" as const,
      direction: directions[0]! } : null;
  const routeLimitation = prerequisite.evidenceRoute === "merchant_document"
    ? "This exact prerequisite requires merchant/account-specific evidence and is not authorized for public research."
    : prerequisite.evidenceRoute === "additional_statement_history"
      ? "This exact prerequisite requires compatible additional-statement history and is not a public-document claim."
      : prerequisite.evidenceRoute === "route_unresolved"
        ? "The frozen semantics preserve this exact blocker but do not authorize inference of an evidence route from opaque codes."
        : "This exact prerequisite may use only dynamically admitted public evidence for its own claim and scope.";
  return claim({ claimClass: "merchant_actionability", state: "unresolved",
    canonicalRefs: unique(source.chargeRefs), occurrenceRefs: unique(source.occurrenceRefs),
    evidenceRefs: unique(charges.flatMap((item) => item.evidenceRefs)), amountUnderReview,
    requiredEvidenceClass: "positive_exact_contract_prerequisite_evidence",
    possibleDecisionEffects: ["merchant_lever", "recommendation_permission", "impact_permission"],
    unresolvedFacets: [facet], prerequisite,
    limitations: ["This is an exact action-scoped prerequisite; it resolves no adjacent action, facet, or impact claim.", routeLimitation] });
}

function claim(input: Omit<CanonicalUnresolvedClaim, "claimId" | "blockingEffect" | "materialityState" | "researchEligibility" |
  "unresolvedFacets" | "researchWithheldFacets" | "prerequisite"> & Partial<Pick<CanonicalUnresolvedClaim,
    "unresolvedFacets" | "researchWithheldFacets" | "prerequisite">>): CanonicalUnresolvedClaim {
  const canonicalRefs = unique(input.canonicalRefs);
  const occurrenceRefs = unique(input.occurrenceRefs);
  const evidenceRefs = unique(input.evidenceRefs);
  return {
    ...input,
    claimId: `unresolved-claim-${digest({ claimClass: input.claimClass, canonicalRefs, occurrenceRefs,
      prerequisite: input.prerequisite ?? null })}`,
    canonicalRefs,
    occurrenceRefs,
    evidenceRefs,
    possibleDecisionEffects: unique(input.possibleDecisionEffects),
    blockingEffect: "limits_authority",
    materialityState: "not_evaluated",
    researchEligibility: "not_evaluated",
    unresolvedFacets: unique(input.unresolvedFacets ?? facetsForUnresolvedClaimClass(input.claimClass)),
    researchWithheldFacets: [...(input.researchWithheldFacets ?? [])]
      .sort((left, right) => left.facet.localeCompare(right.facet) || left.reasonCode.localeCompare(right.reasonCode)),
    limitations: unique(input.limitations),
    prerequisite: input.prerequisite ?? null,
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
    if (item.unresolvedFacets.length === 0) errors.push(`unresolved_claim_missing_atomic_facet:${item.claimId}`);
  }
  return unique(errors);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 24);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function sameSet<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}
