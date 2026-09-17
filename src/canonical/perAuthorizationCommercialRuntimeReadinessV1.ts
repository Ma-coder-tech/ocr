import type { CommercialDecompositionContractV1 } from "./commercialDecompositionContractV1.js";
import {
  buildCommercialReportSetOfflineIntegrationV1,
  type CommercialReportCandidateContextV1,
  type CommercialReportSetOfflineIntegrationV1,
  type CommercialReportVerifyDependencyV1,
} from "./commercialReportSetArbitrationOfflineV1.js";
import {
  buildMerchantCommercialProjectionCandidatesFromRuntimeV1,
  projectMerchantCommercialCandidatesV1,
  type MerchantCommercialFindingDecisionV1,
  type MerchantCommercialFindingShadowProjectionV1,
  type MerchantCommercialProjectionCandidateV1,
} from "./merchantCommercialFindingPermissionProjectionV1.js";
import type { ProductionReportProjection } from "./productionReportProjectionTypes.js";
import type { RuntimeCommercialComparisonAttachmentV1 } from "./runtimeCommercialComparisonAttachmentV1.js";

export const PER_AUTHORIZATION_COMMERCIAL_RUNTIME_READINESS_V1 =
  "per_authorization_commercial_runtime_readiness_2026_09_12_v1" as const;

export const PER_AUTHORIZATION_COMMERCIAL_RUNTIME_PRODUCT_AUTHORITY_V1 = {
  document: "Per-Authorization Commercial Runtime Readiness v1",
  sha256: "94fae566f48f09831c83c12162603beee6695a4699a6c4d9b2e77a7b6204019d",
} as const;

export type PerAuthorizationCommercialRuntimeReadinessV1 = {
  readinessVersion: typeof PER_AUTHORIZATION_COMMERCIAL_RUNTIME_READINESS_V1;
  productAuthority: typeof PER_AUTHORIZATION_COMMERCIAL_RUNTIME_PRODUCT_AUTHORITY_V1;
  mode: "shadow_offline";
  componentClass: "provider_controlled_per_authorization";
  candidates: MerchantCommercialProjectionCandidateV1[];
  candidateContexts: CommercialReportCandidateContextV1[];
  verifyDependencies: CommercialReportVerifyDependencyV1[];
  merchantProjection: MerchantCommercialFindingShadowProjectionV1;
  reportSet: CommercialReportSetOfflineIntegrationV1;
  summary: {
    runtimeBoundCandidates: number;
    exactMatchedComparisons: number;
    reviewActions: number;
    invalidatingVerifyDependencies: number;
    fallbackArbitrationContexts: number;
  };
  permissions: {
    realCustomerRoutingAllowed: false;
    canonicalMutationAllowed: false;
    commercialSourceMutationAllowed: false;
    newKnowledgeAdmissionAllowed: false;
    aiOrWebResearchAllowed: false;
    savingsOrAnnualizationAllowed: false;
    providerLevelConclusionAllowed: false;
  };
};

/**
 * Builds permission and report-arbitration inputs from the normal runtime
 * attachment. Tests exercise this through buildInternalAnalystFindingV1; no
 * downstream candidate or decision needs to be manually constructed.
 */
export function buildPerAuthorizationCommercialRuntimeReadinessV1(input: {
  attachment: RuntimeCommercialComparisonAttachmentV1;
  decomposition: CommercialDecompositionContractV1;
  productionProjection: ProductionReportProjection;
}): PerAuthorizationCommercialRuntimeReadinessV1 {
  const candidates = buildMerchantCommercialProjectionCandidatesFromRuntimeV1({
    attachment: input.attachment,
    decomposition: input.decomposition,
  });
  const merchantProjection = projectMerchantCommercialCandidatesV1({ candidates });
  const byCandidateId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const candidateContexts = merchantProjection.decisions.flatMap((decision) => {
    const candidate = byCandidateId.get(decision.candidateId);
    return candidate && isPerAuthorization(candidate)
      ? [runtimeContext(candidate, decision)]
      : [];
  });
  const contextById = new Map(candidateContexts.map((context) => [context.candidateId, context]));
  const verifyDependencies = merchantProjection.decisions.flatMap((decision): CommercialReportVerifyDependencyV1[] => {
    const candidate = byCandidateId.get(decision.candidateId);
    const context = contextById.get(decision.candidateId);
    if (!candidate || !context || !isPerAuthorization(candidate)) return [];
    if (!decision.visibility.permitted || decision.customerSafeRecord?.merchantAction.type !== "VERIFY") return [];
    if (context.verify?.impact !== "invalidates_or_materially_changes_review") return [];
    return [{
      verifyCandidateId: decision.candidateId,
      reviewCandidateId: decision.candidateId,
      unresolved: true,
      effect: "invalidates_or_materially_changes",
    }];
  });
  const reportSet = buildCommercialReportSetOfflineIntegrationV1({
    productionProjection: input.productionProjection,
    commercialShadowProjection: merchantProjection,
    candidateContexts,
    verifyDependencies,
  });
  const perAuthorizationDecisions = merchantProjection.decisions.filter((decision) =>
    isPerAuthorization(byCandidateId.get(decision.candidateId)));
  return deepFreeze({
    readinessVersion: PER_AUTHORIZATION_COMMERCIAL_RUNTIME_READINESS_V1,
    productAuthority: PER_AUTHORIZATION_COMMERCIAL_RUNTIME_PRODUCT_AUTHORITY_V1,
    mode: "shadow_offline",
    componentClass: "provider_controlled_per_authorization",
    candidates,
    candidateContexts,
    verifyDependencies,
    merchantProjection,
    reportSet,
    summary: {
      runtimeBoundCandidates: candidateContexts.length,
      exactMatchedComparisons: perAuthorizationDecisions.filter((decision) => decision.comparisonValidity === "valid_exact").length,
      reviewActions: perAuthorizationDecisions.filter((decision) => decision.action.permitted).length,
      invalidatingVerifyDependencies: verifyDependencies.length,
      fallbackArbitrationContexts: candidateContexts.filter((context) => context.bindingSource !== "runtime_bound").length,
    },
    permissions: {
      realCustomerRoutingAllowed: false,
      canonicalMutationAllowed: false,
      commercialSourceMutationAllowed: false,
      newKnowledgeAdmissionAllowed: false,
      aiOrWebResearchAllowed: false,
      savingsOrAnnualizationAllowed: false,
      providerLevelConclusionAllowed: false,
    },
  });
}

function runtimeContext(
  candidate: MerchantCommercialProjectionCandidateV1,
  decision: MerchantCommercialFindingDecisionV1,
): CommercialReportCandidateContextV1 {
  const verify = verifyContext(candidate, decision);
  return {
    candidateId: candidate.candidateId,
    economicComponent: candidate.current.serviceIdentity ?? candidate.current.componentLabel,
    providerPricingLogic: candidate.alternative.pricingModel ?? "unresolved",
    population: candidate.current.populationIdentity ?? "unresolved",
    channel: candidate.current.channel ?? "unresolved",
    cardProgramTreatment: [candidate.current.cardProgramScope, candidate.alternative.cardProgramScope]
      .filter((value): value is string => Boolean(value)).join("->") || "unresolved",
    alternativePricingIdentity: [
      candidate.alternative.componentRef,
      candidate.alternative.unit,
      candidate.alternative.amountMinor,
    ].join(":"),
    commercialScope: `${candidate.presentationGroupId}:authorization_service`,
    alternativeOfferIdentity: candidate.alternative.distributionIdentity,
    evidenceStrength: evidenceStrength(candidate, decision),
    bindingSource: "runtime_bound",
    currentComponentRef: candidate.current.componentRef,
    alternativeComponentRef: candidate.alternative.componentRef,
    populationCount: candidate.matchedPopulationCount,
    comparisonDirection: decision.direction,
    matchedDifferenceMinor: candidate.internalFinding.economics.matchedComponentDifference.currentMinusAlternativeMinor,
    applicabilityState: `${candidate.applicability.publicPolicy}:${candidate.applicability.approval}`,
    offsetState: candidate.offsets.state,
    controlState: candidate.current.controlState,
    evidenceRefs: unique([
      ...decision.evidenceRefs,
      ...(candidate.applicability.evidenceRefs ?? []),
    ]),
    independentlySafeFromCanonicalOpenQuestions: runtimeEvidenceBound(candidate),
    ...(verify ? { verify } : {}),
  };
}

function verifyContext(
  candidate: MerchantCommercialProjectionCandidateV1,
  decision: MerchantCommercialFindingDecisionV1,
): CommercialReportCandidateContextV1["verify"] | undefined {
  if (decision.customerSafeRecord?.merchantAction.type !== "VERIFY") return undefined;
  const failed = Object.entries(candidate.revalidation).find(([, state]) => state !== "matched")?.[0] ?? null;
  if (failed === "channel") return {
    impact: "invalidates_or_materially_changes_review",
    missingFact: "CP/CNP authorization population split",
    whyItMatters: "The public authorization price is channel-specific, so the comparison is invalid unless the current billed authorizations use the same channel.",
    whoCanConfirm: "Your current provider or gateway activity records",
    exactAnswerOrDocument: "The card-present and card-not-present authorization counts for this statement period",
    conclusionMayChange: "Whether this authorization component can be compared and reviewed.",
  };
  if (failed === "population") return {
    impact: "invalidates_or_materially_changes_review",
    missingFact: "Exact authorization billing population",
    whyItMatters: "Authorization attempts, approved authorizations, and settled transactions are not interchangeable populations.",
    whoCanConfirm: "Your current provider's fee schedule or authorization detail",
    exactAnswerOrDocument: "The event definition billed by this exact fee row",
    conclusionMayChange: "Whether the two per-item prices apply to the same events.",
  };
  const policyFacts = candidate.applicability.missingPolicyFacts ?? [];
  if (policyFacts.length > 0) return {
    impact: "invalidates_or_materially_changes_review",
    missingFact: policyFacts.join(", "),
    whyItMatters: "An admitted public-policy predicate cannot be evaluated without this merchant fact.",
    whoCanConfirm: "The merchant or the alternative provider",
    exactAnswerOrDocument: `Evidence establishing ${policyFacts.join(", ")}`,
    conclusionMayChange: "Whether the public offer is prohibited, restricted, or has no known public block.",
  };
  if (candidate.applicability.approval === "approval_unknown") return {
    impact: "material_unlock",
    missingFact: "Merchant-specific approval or quote",
    whyItMatters: "Public offer relevance does not establish merchant-specific availability.",
    whoCanConfirm: "The alternative provider",
    exactAnswerOrDocument: "A merchant-specific written quote or approval for the exact named offer",
    conclusionMayChange: "Whether the named offer may be presented for this merchant.",
  };
  return undefined;
}

function evidenceStrength(
  candidate: MerchantCommercialProjectionCandidateV1,
  decision: MerchantCommercialFindingDecisionV1,
): CommercialReportCandidateContextV1["evidenceStrength"] {
  if (!runtimeEvidenceBound(candidate) || decision.findingValidity !== "valid") return "unresolved";
  if (candidate.internalFinding.scope.comparisonStrength === "exact_component") return "high";
  if (["bounded_component", "conditional_scenario"].includes(candidate.internalFinding.scope.comparisonStrength)) return "medium";
  return "low";
}

function runtimeEvidenceBound(candidate: MerchantCommercialProjectionCandidateV1): boolean {
  return candidate.current.componentRef !== null
    && candidate.alternative.componentRef !== null
    && candidate.current.evidenceRefs.length > 0
    && candidate.alternative.evidenceRefs.length > 0
    && candidate.matchedPopulationEvidenceRefs.length > 0
    && candidate.current.controlState !== "unresolved_controller";
}

function isPerAuthorization(candidate: MerchantCommercialProjectionCandidateV1 | undefined): boolean {
  return Boolean(candidate
    && candidate.current.unit === "per_authorization"
    && candidate.alternative.unit === "per_authorization");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
