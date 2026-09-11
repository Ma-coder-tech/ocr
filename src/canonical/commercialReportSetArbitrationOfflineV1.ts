import type {
  MerchantCommercialFindingDecisionV1,
  MerchantCommercialFindingShadowProjectionV1,
  MerchantSafeCommercialFindingV1,
} from "./merchantCommercialFindingPermissionProjectionV1.js";
import type {
  ProductionReportProjection,
  ProductionReportablePayload,
} from "./productionReportProjectionTypes.js";

export const COMMERCIAL_REPORT_SET_ARBITRATION_OFFLINE_V1 =
  "commercial_report_set_arbitration_offline_2026_09_11_v1" as const;

export const COMMERCIAL_REPORT_SET_PRODUCT_AUTHORITY_V1 = {
  document: "RateReveal Commercial Finding Report Integration & Attention Hierarchy v0.2 — Product-Adjudicated",
  sha256: "54d59e52654ad5b76c6d63593a21fbc214c5d5813b35ad702510810f728777bc",
} as const;

export type CommercialReportProductPriorityV1 = 1 | 2 | 3 | 4 | 5;
export type CommercialReportEvidenceStrengthV1 = "high" | "medium" | "low" | "unresolved";

export type CommercialReportCandidateContextV1 = {
  candidateId: string;
  economicComponent: string;
  providerPricingLogic: string;
  population: string;
  channel: string;
  cardProgramTreatment: string;
  alternativePricingIdentity: string;
  commercialScope: string;
  alternativeOfferIdentity: string;
  evidenceStrength: CommercialReportEvidenceStrengthV1;
  independentlySafeFromCanonicalOpenQuestions?: boolean;
  verify?: {
    impact: "invalidates_or_materially_changes_review" | "material_unlock" | "normal";
    missingFact: string;
    whyItMatters: string;
    whoCanConfirm: string;
    exactAnswerOrDocument: string;
    conclusionMayChange: string;
  };
};

export type CommercialReportVerifyDependencyV1 = {
  verifyCandidateId: string;
  reviewCandidateId: string;
  unresolved: boolean;
  effect: "invalidates_or_materially_changes" | "nonblocking";
};

export type CommercialReportConditionalChargeV1 = {
  candidateId: string;
  acceptedEvidenceEstablishesConditionalCharge: boolean;
  concreteMerchantVerifiableCondition: string | null;
  resolvingCouldStopOrPreventCharge: boolean;
  whoCanConfirm: string | null;
  exactAnswerOrDocument: string | null;
  conclusionMayChange: string | null;
};

export type CommercialReportExistingRiskV1 = {
  financialIntegrityActive?: boolean;
  disputeRiskLinks?: Array<{ commercialCandidateId: string; existingFindingId: string }>;
};

export type CommercialReportDispositionV1 =
  | "displayed"
  | "held_by_verify_dependency"
  | "demoted"
  | "consolidated"
  | "omitted_by_verify_cap"
  | "omitted_for_directional_fairness"
  | "omitted_for_named_offer_coherence"
  | "suppressed_by_higher_priority_risk"
  | "hidden"
  | "report_level_limitation_only"
  | "withheld_in_unable_experience"
  | "withheld_by_cumulative_claim_validator";

type CommercialPriorityFindingV1 = ProductionReportablePayload["priorityFindings"]["items"][number];
type CommercialQuestionV1 = ProductionReportablePayload["openQuestions"]["items"][number];
type CommercialActionModuleV1 = ProductionReportablePayload["nextActions"]["modules"][number];

export type CommercialReportSetSelectionLedgerEntryV1 = {
  candidateId: string;
  productPriority: CommercialReportProductPriorityV1 | null;
  disposition: CommercialReportDispositionV1;
  representedByCandidateId: string | null;
  linkedVerifyCandidateId: string | null;
  reasonCodes: string[];
};

export type CommercialReportSetOfflineIntegrationV1 = {
  schemaVersion: typeof COMMERCIAL_REPORT_SET_ARBITRATION_OFFLINE_V1;
  productAuthority: typeof COMMERCIAL_REPORT_SET_PRODUCT_AUTHORITY_V1;
  mode: "shadow_offline";
  realCustomerRoutingAllowed: false;
  baseProjectionUnchanged: true;
  heroByteEquivalent: true;
  primaryExperienceUnchanged: true;
  integratedReportCandidate: ProductionReportProjection;
  commercialPlacement: {
    priorityFindings: CommercialPriorityFindingV1[];
    questionsToResolve: CommercialQuestionV1[];
    supportingDetails: Array<{
      title: string;
      summary: string;
      scope: string;
      evidenceStrength: Exclude<CommercialReportEvidenceStrengthV1, "unresolved">;
    }>;
    actionToolkit: CommercialActionModuleV1[];
    methodologyLimitations: string[];
  };
  existingAttentionLedger: Array<{
    source: "priority_finding" | "question_to_resolve" | "financial_integrity_state";
    id: string;
    productPriority: CommercialReportProductPriorityV1;
    reason: string;
  }>;
  selectionLedger: CommercialReportSetSelectionLedgerEntryV1[];
  validation: {
    valid: boolean;
    errors: string[];
    cumulativeClaimSafe: boolean;
    directionalFairnessSafe: boolean;
    namedOfferCoherent: boolean;
    customerCopySafe: boolean;
  };
  permissions: {
    customerReportRoutingAllowed: false;
    heroMutationAllowed: false;
    primaryStateMutationAllowed: false;
    canonicalMutationAllowed: false;
    sourceMutationAllowed: false;
    savingsAllowed: false;
    annualizationAllowed: false;
    marketVerdictAllowed: false;
    providerRankingAllowed: false;
    switchingAllowed: false;
  };
};

type Working = {
  decision: MerchantCommercialFindingDecisionV1;
  record: MerchantSafeCommercialFindingV1;
  context: CommercialReportCandidateContextV1;
  action: "REVIEW_CURRENT_PRICING" | "VERIFY" | "EXPLAIN";
  priority: CommercialReportProductPriorityV1;
  disposition: CommercialReportDispositionV1;
  representedByCandidateId: string | null;
  linkedVerifyCandidateId: string | null;
  reasons: string[];
};

const LIMITATION = "Public-price comparison was limited for this statement. Where RateReveal could not make a reliable comparison, that does not mean the pricing is good or bad.";
const STRENGTH_RANK: Record<CommercialReportEvidenceStrengthV1, number> = { unresolved: 0, low: 1, medium: 2, high: 3 };

export function buildCommercialReportSetOfflineIntegrationV1(input: {
  productionProjection: ProductionReportProjection;
  commercialShadowProjection: MerchantCommercialFindingShadowProjectionV1;
  candidateContexts?: CommercialReportCandidateContextV1[];
  verifyDependencies?: CommercialReportVerifyDependencyV1[];
  conditionalCharges?: CommercialReportConditionalChargeV1[];
  existingRisk?: CommercialReportExistingRiskV1;
}): CommercialReportSetOfflineIntegrationV1 {
  const baseBytes = JSON.stringify(input.productionProjection);
  const candidate = clone(input.productionProjection);
  const contexts = new Map((input.candidateContexts ?? []).map((item) => [item.candidateId, item]));
  const dependencies = input.verifyDependencies ?? [];
  const conditional = new Map((input.conditionalCharges ?? []).map((item) => [item.candidateId, item]));
  const ledger = new Map<string, CommercialReportSetSelectionLedgerEntryV1>();
  const risk = input.existingRisk ?? {};
  const existingAttentionLedger = buildExistingAttentionLedger(input.productionProjection);
  const financialIntegrityActive = risk.financialIntegrityActive === true
    || input.productionProjection.experience === "unable_to_complete"
    || input.productionProjection.report?.composition.reconciled === false
    || existingAttentionLedger.some((item) => item.productPriority === 1);
  const disputeLinked = new Set((risk.disputeRiskLinks ?? []).map((item) => item.commercialCandidateId));

  for (const decision of input.commercialShadowProjection.decisions) {
    ledger.set(decision.candidateId, {
      candidateId: decision.candidateId,
      productPriority: null,
      disposition: "hidden",
      representedByCandidateId: null,
      linkedVerifyCandidateId: null,
      reasonCodes: [],
    });
  }

  if (input.productionProjection.experience === "unable_to_complete" || candidate.report === null) {
    for (const entry of ledger.values()) {
      entry.disposition = "withheld_in_unable_experience";
      entry.reasonCodes.push("unable_experience_has_no_commercial_projection");
    }
    return finish(input.productionProjection, baseBytes, candidate, [], existingAttentionLedger, ledger, true, true, true);
  }

  let working = input.commercialShadowProjection.decisions.flatMap((decision): Working[] => {
    const record = decision.customerSafeRecord;
    if (!decision.visibility.permitted || record === null) return [];
    const context = contexts.get(decision.candidateId) ?? defaultContext(decision, record);
    if (input.productionProjection.experience === "analysis_available_with_open_questions"
      && context.independentlySafeFromCanonicalOpenQuestions !== true) {
      const entry = ledger.get(decision.candidateId)!;
      entry.disposition = record.displayMode === "comparison_unavailable" ? "report_level_limitation_only" : "hidden";
      entry.reasonCodes.push("independent_safety_from_canonical_questions_not_established");
      return [];
    }
    const promoted = conditional.get(decision.candidateId);
    const conditionalVerify = Boolean(promoted?.acceptedEvidenceEstablishesConditionalCharge
      && promoted.concreteMerchantVerifiableCondition
      && promoted.resolvingCouldStopOrPreventCharge
      && promoted.whoCanConfirm
      && promoted.exactAnswerOrDocument
      && promoted.conclusionMayChange);
    const action = conditionalVerify
      ? "VERIFY" as const
      : decision.action.permitted
        ? "REVIEW_CURRENT_PRICING" as const
        : record.merchantAction.type;
    const verifyImpact = context.verify?.impact ?? "normal";
    const effectiveContext = conditionalVerify ? {
      ...context,
      verify: {
        impact: "normal" as const,
        missingFact: promoted!.exactAnswerOrDocument!,
        whyItMatters: `The charge depends on ${promoted!.concreteMerchantVerifiableCondition}.`,
        whoCanConfirm: promoted!.whoCanConfirm!,
        exactAnswerOrDocument: promoted!.exactAnswerOrDocument!,
        conclusionMayChange: promoted!.conclusionMayChange!,
      },
    } : context;
    const priority: CommercialReportProductPriorityV1 = action === "REVIEW_CURRENT_PRICING" ? 3
      : action === "VERIFY" && (verifyImpact === "invalidates_or_materially_changes_review" || verifyImpact === "material_unlock") ? 2
        : action === "VERIFY" ? 4 : 5;
    return [{
      decision,
      record: conditionalVerify ? conditionalVerifyRecord(record, promoted!) : record,
      context: effectiveContext,
      action,
      priority,
      disposition: "displayed",
      representedByCandidateId: null,
      linkedVerifyCandidateId: null,
      reasons: conditionalVerify ? ["conditional_charge_promoted_to_verify"] : [],
    }];
  });

  const byId = new Map(working.map((item) => [item.decision.candidateId, item]));
  for (const dependency of dependencies) {
    if (!dependency.unresolved || dependency.effect !== "invalidates_or_materially_changes") continue;
    const review = byId.get(dependency.reviewCandidateId);
    const verify = byId.get(dependency.verifyCandidateId);
    if (review?.action !== "REVIEW_CURRENT_PRICING") continue;
    review.disposition = "held_by_verify_dependency";
    review.linkedVerifyCandidateId = dependency.verifyCandidateId;
    review.reasons.push("unresolved_verify_can_invalidate_review");
    if (verify) {
      verify.priority = 2;
      verify.context = { ...verify.context, verify: verify.context.verify ?? defaultVerifyContext(verify.record, "invalidates_or_materially_changes_review") };
    }
  }

  for (const item of working) {
    if (item.disposition !== "displayed") continue;
    if (item.action === "REVIEW_CURRENT_PRICING" && financialIntegrityActive) {
      item.disposition = "suppressed_by_higher_priority_risk";
      item.reasons.push("priority_1_financial_integrity_outranks_pricing_review");
    } else if (item.action === "REVIEW_CURRENT_PRICING" && disputeLinked.has(item.decision.candidateId)) {
      item.action = "EXPLAIN";
      item.priority = 5;
      item.disposition = "demoted";
      item.reasons.push("material_dispute_risk_outranks_chargeback_fee_review");
    }
  }

  working = consolidateCompatible(working);
  working = applyVerifyCap(working);
  working = applyNamedOfferCoherence(working);
  working = applyDirectionalFairness(working, input.commercialShadowProjection.decisions, contexts);

  for (const item of working) {
    const entry = ledger.get(item.decision.candidateId)!;
    entry.productPriority = item.priority;
    entry.disposition = item.disposition;
    entry.representedByCandidateId = item.representedByCandidateId;
    entry.linkedVerifyCandidateId = item.linkedVerifyCandidateId;
    entry.reasonCodes.push(...item.reasons);
  }

  const visible = working.filter((item) => item.disposition === "displayed" || item.disposition === "demoted");
  let placement = place(visible);
  const limitationNeeded = input.commercialShadowProjection.customerSafeProjection.reportLimitation !== null
    || working.some((item) => item.record.displayMode === "comparison_unavailable")
    || [...ledger.values()].some((item) => item.disposition === "report_level_limitation_only");
  if (limitationNeeded) placement.methodologyLimitations.push(LIMITATION);
  integrate(candidate, placement, visible);

  let validationErrors = validateCommercialReportSetMerchantCopyV1(candidate, visible);
  if (validationErrors.length > 0) {
    for (const item of visible) {
      const entry = ledger.get(item.decision.candidateId)!;
      entry.disposition = "withheld_by_cumulative_claim_validator";
      entry.reasonCodes.push(...validationErrors);
    }
    const reset = clone(input.productionProjection);
    placement = emptyPlacement(input.commercialShadowProjection.customerSafeProjection.reportLimitation ? [LIMITATION] : []);
    integrate(reset, placement, []);
    return finish(input.productionProjection, baseBytes, reset, placement, existingAttentionLedger, ledger, false, false, false, validationErrors);
  }

  validationErrors = heroErrors(input.productionProjection, candidate);
  if (validationErrors.length > 0) throw new Error(`commercial_report_set_hero_isolation_failed:${validationErrors.join(",")}`);
  return finish(input.productionProjection, baseBytes, candidate, placement, existingAttentionLedger, ledger, true, true, true);
}

function defaultContext(decision: MerchantCommercialFindingDecisionV1, record: MerchantSafeCommercialFindingV1): CommercialReportCandidateContextV1 {
  return {
    candidateId: decision.candidateId,
    economicComponent: record.component,
    providerPricingLogic: decision.presentationGroupId,
    population: record.matchedActivity ?? "unresolved",
    channel: "unresolved",
    cardProgramTreatment: "unresolved",
    alternativePricingIdentity: record.comparableComponentDifference
      ? `${record.comparableComponentDifference.direction}:${record.comparableComponentDifference.amountMinor}` : "unresolved",
    commercialScope: decision.presentationGroupId,
    alternativeOfferIdentity: record.alternative ? `${record.alternative.provider}:${record.alternative.offer}` : decision.presentationGroupId,
    evidenceStrength: decision.findingValidity === "valid" ? "medium" : "unresolved",
    independentlySafeFromCanonicalOpenQuestions: false,
    ...(record.merchantAction.type === "VERIFY" ? { verify: defaultVerifyContext(record, "normal") } : {}),
  };
}

function defaultVerifyContext(record: MerchantSafeCommercialFindingV1, impact: NonNullable<CommercialReportCandidateContextV1["verify"]>["impact"]): NonNullable<CommercialReportCandidateContextV1["verify"]> {
  const fact = record.smallestUnlocker ?? "The missing business or account fact.";
  return {
    impact,
    missingFact: fact,
    whyItMatters: record.comparisonBlocker ?? "It determines whether this commercial conclusion applies.",
    whoCanConfirm: "Your current provider or account records",
    exactAnswerOrDocument: fact,
    conclusionMayChange: "Whether RateReveal can make this component comparison reliably.",
  };
}

function conditionalVerifyRecord(record: MerchantSafeCommercialFindingV1, fact: CommercialReportConditionalChargeV1): MerchantSafeCommercialFindingV1 {
  return {
    ...record,
    displayMode: "verify",
    title: "Confirm the condition behind this charge",
    summary: `This charge is conditional on ${fact.concreteMerchantVerifiableCondition}.`,
    comparisonBlocker: `The applicable condition has not been confirmed for this account.`,
    smallestUnlocker: fact.exactAnswerOrDocument,
    comparableComponentDifference: null,
    scopeNote: "Confirming the condition may show whether future incidence can stop; it does not prove that the charge is removable.",
    merchantAction: { type: "VERIFY", text: `Ask ${fact.whoCanConfirm} to confirm ${lowerFirst(fact.exactAnswerOrDocument!)}.` },
  };
}

function consolidateCompatible(items: Working[]): Working[] {
  const groups = new Map<string, Working[]>();
  for (const item of items) {
    if (item.disposition !== "displayed" || !contextCompleteForConsolidation(item.context)) continue;
    const key = [
      item.action,
      item.context.economicComponent,
      item.context.providerPricingLogic,
      item.context.population,
      item.context.channel,
      item.context.cardProgramTreatment,
      item.context.alternativePricingIdentity,
      item.context.alternativeOfferIdentity,
      differenceKey(item.record),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const strengths = group.map((item) => item.context.evidenceStrength);
    if (strengths.includes("unresolved")) continue;
    const weakest = strengths.reduce((a, b) => STRENGTH_RANK[a] <= STRENGTH_RANK[b] ? a : b);
    const representative = stable(group, compareWorking)[0]!;
    representative.context = { ...representative.context, evidenceStrength: weakest };
    for (const item of group) {
      if (item === representative) continue;
      item.disposition = "consolidated";
      item.representedByCandidateId = representative.decision.candidateId;
      item.reasons.push("exact_scope_compatible_with_representative");
    }
  }
  return items;
}

function contextCompleteForConsolidation(context: CommercialReportCandidateContextV1): boolean {
  return [
    context.economicComponent,
    context.providerPricingLogic,
    context.population,
    context.channel,
    context.cardProgramTreatment,
    context.alternativePricingIdentity,
    context.alternativeOfferIdentity,
  ].every((value) => value.trim().length > 0 && value.toLowerCase() !== "unresolved");
}

function applyVerifyCap(items: Working[]): Working[] {
  const verifies = stable(items.filter((item) => item.disposition === "displayed" && item.action === "VERIFY"), verifySort);
  for (const item of verifies.slice(3)) {
    item.disposition = "omitted_by_verify_cap";
    item.reasons.push("free_single_statement_verify_limit_reached");
  }
  return items;
}

function applyNamedOfferCoherence(items: Working[]): Working[] {
  const named = stable(items.filter((item) => isVisible(item) && item.record.alternative !== null), compareWorking);
  if (named.length < 2) return items;
  const anchor = named[0]!.context.alternativeOfferIdentity;
  for (const item of named) {
    if (item.context.alternativeOfferIdentity === anchor) continue;
    item.record = anonymizeAlternative(item.record);
    item.reasons.push("additional_offer_rendered_generically_to_prevent_blending");
  }
  return items;
}

function applyDirectionalFairness(
  items: Working[],
  decisions: MerchantCommercialFindingDecisionV1[],
  contexts: Map<string, CommercialReportCandidateContextV1>,
): Working[] {
  const byId = new Map(items.map((item) => [item.decision.candidateId, item]));
  const selectedWorse = items.filter((item) => isVisible(item) && item.decision.direction === "current_costs_more");
  for (const worse of selectedWorse) {
    const counterpart = decisions.find((decision) => {
      if (decision.direction !== "current_costs_less" || decision.materiality.state === "below_noise_floor") return false;
      const context = contexts.get(decision.candidateId);
      return context?.commercialScope === worse.context.commercialScope
        && context.alternativeOfferIdentity === worse.context.alternativeOfferIdentity;
    });
    if (!counterpart || byId.has(counterpart.candidateId) && isVisible(byId.get(counterpart.candidateId)!)) continue;
    if (!counterpart.customerSafeRecord) {
      worse.disposition = "omitted_for_directional_fairness";
      worse.reasons.push("countervailing_same_scope_evidence_could_not_be_rendered_safely");
      continue;
    }
    const context = contexts.get(counterpart.candidateId) ?? defaultContext(counterpart, counterpart.customerSafeRecord);
    const fair: Working = {
      decision: counterpart,
      record: { ...counterpart.customerSafeRecord, merchantAction: { type: "EXPLAIN", text: "Use this as balancing component context; no action is recommended." } },
      context,
      action: "EXPLAIN",
      priority: 5,
      disposition: "displayed",
      representedByCandidateId: null,
      linkedVerifyCandidateId: null,
      reasons: ["displayed_as_required_same_scope_counterevidence"],
    };
    items.push(fair);
    byId.set(counterpart.candidateId, fair);
  }
  return items;
}

function place(items: Working[]): CommercialReportSetOfflineIntegrationV1["commercialPlacement"] {
  const priorityFindings = stable(items.filter((item) => item.action === "REVIEW_CURRENT_PRICING"), compareWorking)
    .map((item, index) => priorityFinding(item, index));
  const questionsToResolve = stable(items.filter((item) => item.action === "VERIFY"), verifySort)
    .map((item, index) => question(item, index));
  const supportingDetails = stable(items.filter((item) => item.action === "EXPLAIN"), compareWorking)
    .map((item) => ({
      title: item.record.title,
      summary: safeSummary(item.record),
      scope: item.record.scopeNote,
      evidenceStrength: item.context.evidenceStrength === "unresolved" ? "low" as const : item.context.evidenceStrength,
    }));
  const actionToolkit = [
    ...stable(items.filter((item) => item.action === "REVIEW_CURRENT_PRICING"), compareWorking).map((item, index) => reviewToolkit(item, index)),
    ...stable(items.filter((item) => item.action === "VERIFY"), verifySort).map((item, index) => verifyToolkit(item, index)),
  ];
  return { priorityFindings, questionsToResolve, supportingDetails, actionToolkit, methodologyLimitations: [] };
}

function integrate(
  candidate: ProductionReportProjection,
  placement: CommercialReportSetOfflineIntegrationV1["commercialPlacement"],
  visibleCommercial: Working[],
): void {
  if (!candidate.report) return;
  const report = candidate.report;
  report.priorityFindings.items = stable([...report.priorityFindings.items, ...placement.priorityFindings], compareExistingFinding);
  report.priorityFindings.status = report.priorityFindings.items.length ? "shown" : "omitted";
  const verifyPriorities = new Map(stable(visibleCommercial.filter((item) => item.action === "VERIFY"), verifySort)
    .map((item, index) => [`commercial-question-${index + 1}`, item.priority]));
  report.openQuestions.items = stable(
    [...report.openQuestions.items, ...placement.questionsToResolve],
    (a, b) => (verifyPriorities.get(a.id) ?? existingQuestionPriority(a))
      - (verifyPriorities.get(b.id) ?? existingQuestionPriority(b))
      || a.id.localeCompare(b.id),
  );
  report.openQuestions.status = report.openQuestions.items.length || report.openQuestions.context.length ? "shown" : "omitted";
  report.nextActions.modules = [...report.nextActions.modules, ...placement.actionToolkit];
  report.nextActions.status = report.nextActions.modules.length ? "shown" : report.nextActions.status;
  report.methodology.disclosures = [...report.methodology.disclosures, ...placement.methodologyLimitations];
}

function priorityFinding(item: Working, index: number): CommercialPriorityFindingV1 {
  const diff = differenceSentence(item.record);
  return {
    id: `commercial-review-${index + 1}`,
    attentionType: "pricing_component_review",
    priority: "review",
    merchantTitle: `${item.record.component} is worth reviewing with your provider`,
    observedLabel: item.record.component,
    observedAmount: null,
    category: "Provider-controlled pricing",
    likelyOwner: { economicBeneficiary: "Not established by this comparison", contractualController: "Current provider" },
    evidenceStatus: evidenceLabel(item.context.evidenceStrength),
    confidence: confidence(item.context.evidenceStrength),
    whyDeservesAttention: "This specific provider-controlled component passed the approved statement-period review threshold.",
    whatStatementShows: safeSummary(item.record),
    whatThisLikelyMeans: diff,
    whatStillNeedsConfirmation: ["Other account terms or services may explain the current price and are not established by this statement."],
    safestNextAction: { actionType: "request_pricing_review", instruction: `Ask the current provider to review ${lowerFirst(item.record.component)}.` },
    references: { evidenceRefs: [], feeRowRefs: [] },
    opportunityLinkage: null,
    languageSource: "deterministic_fallback",
  };
}

function question(item: Working, index: number): CommercialQuestionV1 {
  const verify = item.context.verify ?? defaultVerifyContext(item.record, "normal");
  return {
    id: `commercial-question-${index + 1}`,
    question: verify.missingFact,
    whatRateRevealKnows: safeSummary(item.record),
    whatRemainsUncertain: verify.whyItMatters,
    safeNextStep: `Ask ${verify.whoCanConfirm} to confirm this fact.`,
    requirement: "merchant_confirmation_needed",
    requiredEvidenceOrConfirmation: [verify.exactAnswerOrDocument],
    references: { evidenceRefs: [], feeRowRefs: [] },
    amountUnderReview: null,
    amountIsSavings: false,
  };
}

function reviewToolkit(item: Working, index: number): CommercialActionModuleV1 {
  return {
    id: `commercial-pricing-review-${index + 1}`,
    actionType: "request_pricing_review",
    title: `Review ${item.record.component}`,
    whatToDo: `Ask the current provider to review this specific pricing component and explain whether a lower price is available.`,
    why: `${safeSummary(item.record)} ${differenceSentence(item.record)} ${item.record.scopeNote}`,
    statementEvidenceRefs: [],
    exactAsk: `Can you review the pricing for ${lowerFirst(item.record.component)} on my account and tell me whether a lower rate is available?`,
    requestDocumentation: ["The current price for this component", "The activity or billing basis to which it applies", "Any account term or service that explains the price"],
    followUp: "A provider may legitimately decline or may rely on account terms or services that RateReveal cannot see from this statement. A negative answer is not evidence of unfair conduct.",
    avoidClaiming: ["That the provider must reduce the price", "That another offer is cheaper overall", "That the displayed difference will recur"],
    successCriteria: ["The provider confirms the applicable component price", "The provider explains whether a lower price is available", "Any relevant account terms are documented"],
  };
}

function verifyToolkit(item: Working, index: number): CommercialActionModuleV1 {
  const verify = item.context.verify ?? defaultVerifyContext(item.record, "normal");
  const titleFact = withoutTerminalPunctuation(verify.missingFact).replace(/^confirm\s+/i, "");
  return {
    id: `commercial-verification-${index + 1}`,
    actionType: "verify_commercial_fact",
    title: `Confirm ${titleFact}`,
    whatToDo: `Ask ${verify.whoCanConfirm} for ${lowerFirst(withoutTerminalPunctuation(verify.exactAnswerOrDocument))}.`,
    why: `${verify.whyItMatters} ${verify.conclusionMayChange}`,
    statementEvidenceRefs: [],
    exactAsk: `Please confirm ${lowerFirst(withoutTerminalPunctuation(verify.exactAnswerOrDocument))}.`,
    requestDocumentation: [verify.exactAnswerOrDocument],
    followUp: `RateReveal can revisit ${lowerFirst(withoutTerminalPunctuation(verify.conclusionMayChange))} after the fact is confirmed.`,
    avoidClaiming: ["That a price comparison is reliable before this fact is confirmed", "That the charge is removable"],
    successCriteria: ["The missing fact is answered directly", "The answer is supported by an account record, statement detail, or provider confirmation"],
  };
}

export function validateCommercialReportSetMerchantCopyV1(
  candidate: ProductionReportProjection,
  displayed: Array<Pick<Working, "decision" | "record" | "context" | "action">> = [],
): string[] {
  const errors: string[] = [];
  const report = candidate.report;
  if (!report) return errors;
  const commercialCopy = JSON.stringify({
    priority: report.priorityFindings.items.filter((item) => item.id.startsWith("commercial-")),
    questions: report.openQuestions.items.filter((item) => item.id.startsWith("commercial-")),
    actions: report.nextActions.modules.filter((item) => item.id.startsWith("commercial-")),
    methodology: report.methodology.disclosures.filter((item) => item === LIMITATION),
  });
  const forbidden: Array<[string, RegExp]> = [
    ["prohibited_outcome_language", /\b(?:savings?|overpay(?:ing|ment)?|market grade|processor grade|switch(?:ing)?|ranking|best provider)\b/i],
    ["internal_implementation_language", /\b(?:registry|runtime|package|governance|evidence ref|product threshold|priority [1-5])\b/i],
    ["raw_identifier_or_path", /(?:\/(?:Users|private|tmp|var)\/|\b[a-f0-9]{32,}\b)/i],
    ["commercial_tally", /\b\d+\s+(?:pricing issues?|opportunities|charges? worth reviewing|comparisons?|blockers?)\b/i],
    ["provider_matching_demand", /\bmatch (?:this|the|that) (?:competitor|provider|offer|price|rate)\b/i],
    ["overall_provider_verdict", /\b(?:provider is generally expensive|alternative is cheaper overall|current provider is cheaper overall)\b/i],
  ];
  for (const [code, pattern] of forbidden) if (pattern.test(commercialCopy)) errors.push(code);
  const namedOffers = new Set(displayed.flatMap((item) => item.record.alternative
    ? [`${item.record.alternative.provider}:${item.record.alternative.offer}`] : []));
  if (namedOffers.size > 1) errors.push("multiple_named_alternatives_create_blended_offer_risk");
  for (const item of displayed) {
    if (item.record.comparableComponentDifference && !item.record.scopeNote) errors.push(`difference_without_scope:${item.decision.candidateId}`);
    if (item.action === "REVIEW_CURRENT_PRICING" && item.decision.comparisonValidity !== "valid_exact") errors.push(`review_without_exact_comparison:${item.decision.candidateId}`);
  }
  return unique(errors);
}

function finish(
  base: ProductionReportProjection,
  expectedBaseBytes: string,
  candidate: ProductionReportProjection,
  placement: CommercialReportSetOfflineIntegrationV1["commercialPlacement"] | [],
  existingAttentionLedger: CommercialReportSetOfflineIntegrationV1["existingAttentionLedger"],
  ledger: Map<string, CommercialReportSetSelectionLedgerEntryV1>,
  cumulative: boolean,
  fairness: boolean,
  coherence: boolean,
  errors: string[] = [],
): CommercialReportSetOfflineIntegrationV1 {
  if (JSON.stringify(base) !== expectedBaseBytes) {
    throw new Error("commercial_report_set_mutated_immutable_production_input");
  }
  const normalizedPlacement = Array.isArray(placement) ? emptyPlacement([]) : placement;
  const heroSafe = heroErrors(base, candidate).length === 0;
  if (!heroSafe || base.experience !== candidate.experience) {
    throw new Error("commercial_report_set_primary_projection_isolation_failed");
  }
  const result: CommercialReportSetOfflineIntegrationV1 = {
    schemaVersion: COMMERCIAL_REPORT_SET_ARBITRATION_OFFLINE_V1,
    productAuthority: COMMERCIAL_REPORT_SET_PRODUCT_AUTHORITY_V1,
    mode: "shadow_offline",
    realCustomerRoutingAllowed: false,
    baseProjectionUnchanged: true,
    heroByteEquivalent: true,
    primaryExperienceUnchanged: true,
    integratedReportCandidate: candidate,
    commercialPlacement: normalizedPlacement,
    existingAttentionLedger,
    selectionLedger: stable([...ledger.values()], (a, b) => a.candidateId.localeCompare(b.candidateId)),
    validation: {
      valid: errors.length === 0 && heroSafe,
      errors,
      cumulativeClaimSafe: cumulative,
      directionalFairnessSafe: fairness,
      namedOfferCoherent: coherence,
      customerCopySafe: errors.length === 0,
    },
    permissions: {
      customerReportRoutingAllowed: false,
      heroMutationAllowed: false,
      primaryStateMutationAllowed: false,
      canonicalMutationAllowed: false,
      sourceMutationAllowed: false,
      savingsAllowed: false,
      annualizationAllowed: false,
      marketVerdictAllowed: false,
      providerRankingAllowed: false,
      switchingAllowed: false,
    },
  };
  return deepFreeze(result);
}

function emptyPlacement(limitations: string[]): CommercialReportSetOfflineIntegrationV1["commercialPlacement"] {
  return { priorityFindings: [], questionsToResolve: [], supportingDetails: [], actionToolkit: [], methodologyLimitations: limitations };
}

function heroErrors(base: ProductionReportProjection, candidate: ProductionReportProjection): string[] {
  const errors: string[] = [];
  if (JSON.stringify(base.report?.hero ?? null) !== JSON.stringify(candidate.report?.hero ?? null)) errors.push("hero_changed");
  if (base.experience !== candidate.experience) errors.push("experience_changed");
  if (JSON.stringify(base.header) !== JSON.stringify(candidate.header)) errors.push("header_changed");
  if (JSON.stringify(base.recovery) !== JSON.stringify(candidate.recovery)) errors.push("recovery_changed");
  return errors;
}

function compareExistingFinding(a: ProductionReportablePayload["priorityFindings"]["items"][number], b: ProductionReportablePayload["priorityFindings"]["items"][number]): number {
  return existingPriority(a) - existingPriority(b) || a.id.localeCompare(b.id);
}

function existingPriority(item: ProductionReportablePayload["priorityFindings"]["items"][number]): CommercialReportProductPriorityV1 {
  const text = `${item.attentionType} ${item.category} ${item.merchantTitle} ${item.whyDeservesAttention}`.toLowerCase();
  if (/reconcil|unreliable|extraction|core total|fee population/.test(text)) return 1;
  if (/dispute|chargeback risk|reserve|holdback|funding|compliance|economic ownership/.test(text)) return 2;
  if (item.safestNextAction) return 3;
  if (item.whatStillNeedsConfirmation.length > 0) return 4;
  return 5;
}

function existingQuestionPriority(item: ProductionReportablePayload["openQuestions"]["items"][number]): 2 | 4 {
  const text = `${item.question} ${item.whatRemainsUncertain} ${item.safeNextStep}`.toLowerCase();
  return /dispute|chargeback|reserve|holdback|funding|compliance|economic ownership|invalidate|reconcil/.test(text) ? 2 : 4;
}

function buildExistingAttentionLedger(projection: ProductionReportProjection): CommercialReportSetOfflineIntegrationV1["existingAttentionLedger"] {
  if (!projection.report) return [{
    source: "financial_integrity_state",
    id: "statement-analysis-unavailable",
    productPriority: 1,
    reason: "The canonical statement analysis cannot support a report.",
  }];
  const ledger: CommercialReportSetOfflineIntegrationV1["existingAttentionLedger"] = [];
  if (projection.report.composition.reconciled === false) ledger.push({
    source: "financial_integrity_state",
    id: "fee-composition-not-reconciled",
    productPriority: 1,
    reason: "Fee composition does not reconcile to the statement total.",
  });
  for (const item of projection.report.priorityFindings.items) {
    const priority = existingPriority(item);
    ledger.push({
      source: "priority_finding",
      id: item.id,
      productPriority: priority,
      reason: priority === 1 ? "Financial-integrity issue."
        : priority === 2 ? "Material risk or decision-blocking issue."
          : priority === 3 ? "Strong supported merchant action."
            : priority === 4 ? "Normal verification."
              : "Supporting explanation.",
    });
  }
  for (const item of projection.report.openQuestions.items) {
    const priority = existingQuestionPriority(item);
    ledger.push({
      source: "question_to_resolve",
      id: item.id,
      productPriority: priority,
      reason: priority === 2 ? "Material risk or decision-blocking verification." : "Normal verification.",
    });
  }
  return stable(ledger, (a, b) => a.productPriority - b.productPriority || a.id.localeCompare(b.id));
}

function verifySort(a: Working, b: Working): number {
  return a.priority - b.priority
    || (b.decision.materiality.absoluteDifferenceMinor ?? -1) - (a.decision.materiality.absoluteDifferenceMinor ?? -1)
    || a.decision.candidateId.localeCompare(b.decision.candidateId);
}

function compareWorking(a: Working, b: Working): number {
  return a.priority - b.priority
    || (b.decision.materiality.absoluteDifferenceMinor ?? -1) - (a.decision.materiality.absoluteDifferenceMinor ?? -1)
    || a.decision.candidateId.localeCompare(b.decision.candidateId);
}

function isVisible(item: Working): boolean { return item.disposition === "displayed" || item.disposition === "demoted"; }
function differenceKey(record: MerchantSafeCommercialFindingV1): string {
  const value = record.comparableComponentDifference;
  return value ? `${value.direction}:${value.amountMinor}:${record.scopeNote}` : "none";
}
function evidenceLabel(value: CommercialReportEvidenceStrengthV1): string {
  return value === "high" ? "Strongly supported" : value === "medium" ? "Supported with limitations" : "Limited support";
}
function confidence(value: CommercialReportEvidenceStrengthV1): "high" | "medium" | "low" {
  return value === "high" ? "high" : value === "medium" ? "medium" : "low";
}
function differenceSentence(record: MerchantSafeCommercialFindingV1): string {
  const difference = record.comparableComponentDifference;
  if (!difference) return record.summary;
  const dollars = `$${(difference.amountMinor / 100).toFixed(2)}`;
  const direction = difference.direction === "current_more" ? "the current component costs more" : "the public component costs more";
  return `Difference on this statement's matched activity: ${dollars}; ${direction}. ${record.scopeNote}`;
}
function safeSummary(record: MerchantSafeCommercialFindingV1): string {
  return `${record.summary}${record.conditions.length ? ` ${record.conditions.join(" ")}` : ""}`.trim();
}
function anonymizeAlternative(record: MerchantSafeCommercialFindingV1): MerchantSafeCommercialFindingV1 {
  if (!record.alternative) return record;
  const names = [record.alternative.provider, record.alternative.offer];
  const replace = (value: string) => names.reduce((text, name) => text.replace(new RegExp(escapeRegExp(name), "gi"), "another comparable public offer"), value);
  return {
    ...record,
    title: replace(record.title),
    summary: replace(record.summary),
    alternative: null,
    conditions: record.conditions.map(replace),
    scopeNote: `${replace(record.scopeNote)} This is a separate public offer and its components cannot be combined with another provider's offer.`,
    merchantAction: { ...record.merchantAction, text: replace(record.merchantAction.text) },
  };
}
function lowerFirst(value: string): string { return value.length ? `${value[0]!.toLowerCase()}${value.slice(1)}` : value; }
function withoutTerminalPunctuation(value: string): string { return value.replace(/[.!?]+$/, ""); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }
function stable<T>(values: T[], compare: (a: T, b: T) => number = () => 0): T[] { return [...values].sort(compare); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
