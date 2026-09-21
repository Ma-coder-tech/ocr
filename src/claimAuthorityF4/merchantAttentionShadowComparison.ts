import type { CanonicalStatementAnalysis } from "../canonical/types.js";
import {
  defaultFeeKnowledgeResearchQuestions,
  FEE_KNOWLEDGE_RESEARCH_LIMITS,
  planFeeKnowledgeResearchQuestions,
} from "../canonical/feeKnowledgeResearch.js";
import type { F4ShadowDecision, F4ShadowReport } from "./shadow.js";
import type { InternalObservedFeeComponents, InternalProcessorMarkupSemantics } from "./observedFeeComponentConsumer.js";

type AuthorityStatus = "supported" | "refused" | "unknown";
type AuthorityResult = { status: AuthorityStatus; reasonCodes: string[] };

export type MerchantAttentionMarkupShadowComparison = {
  version: "merchant_attention_markup_shadow_v1";
  standing: "internal_diagnostic_only";
  status: "available" | "unavailable";
  sourceReportId: string | null;
  rows: Array<{
    feeRowId: string;
    legacyCandidateId: string;
    observedAmount: { amountMinor: number; currency: string } | null;
    canonicalContributionIncluded: boolean;
    currentSelected: {
      category: "processor_markup";
      collector: string;
      economicBeneficiary: string;
      contractualController: string;
      actionabilityCeiling: string;
    };
    currentAttention: null | {
      itemId: string;
      category: string;
      attentionType: string;
      conclusionBasis: string;
      merchantTitle: string;
      reasonableConclusion: string;
      likelyEconomicBeneficiary: string | null;
      likelyContractualController: string | null;
      priority: string;
      actionType: string;
      actionInstruction: string;
      toolkitExactAsk: string | null;
      merchantQuestion: string | null;
      questionRequirement: string | null;
      priorityFinding: boolean;
    };
    researchPriorityEffect: {
      basis: "default_deterministic_question_plan_no_execution";
      status: "planned_question" | "no_default_question" | "unavailable";
      triggerReason: string | null;
      currentSemanticQuestion: string | null;
      currentPlanScore: number | null;
      neutralCategoryAndCeilingScore: number | null;
      legacyCategoryAndCeilingBoost: number | null;
      legacyMarkupBoost: number | null;
      legacyActionabilityBoost: number | null;
      selectedWithinCurrentLimit: boolean | null;
    };
    f4: {
      processorMarkup: AuthorityResult;
      collector: AuthorityResult;
      economicBeneficiary: AuthorityResult;
      contractualController: AuthorityResult;
      merchantFacingPriceController: AuthorityResult;
      actionability: AuthorityResult;
      observedFeeComponent: AuthorityResult;
    };
    guidanceStatus: "agreement" | "authority_exceeding" | "no_attention_item";
    authorityExceedanceReasons: string[];
    neutralFallbackCandidate: null | {
      standing: "shadow_candidate_only";
      feeMeaning: "observed_fee_component" | "unknown";
      pricingQuestion: "unresolved";
      partyAndControl: "evidence_needed";
      merchantEvidence: "pricing_agreement_or_written_explanation_needed";
      actionability: "not_established";
    };
  }>;
  summary: {
    legacyMarkupRows: number;
    agreement: number;
    authorityExceeding: number;
    noAttentionItem: number;
    observedComponentSupported: number;
    currentResearchQuestions: number;
    selectedResearchQuestions: number;
  };
};

function authorityDecision(
  report: F4ShadowReport | null,
  feeRowId: string,
  suffix: string,
  dimension: F4ShadowDecision["dimension"],
): AuthorityResult {
  const decision = report?.decisions.find((item) => item.key === `fee:${feeRowId}:${suffix}`);
  if (!decision || decision.feeRowId !== feeRowId || decision.dimension !== dimension || decision.subject !== "fee_row") {
    return { status: "unknown", reasonCodes: [report ? "f4_decision_missing_or_mismatched" : "f4_shadow_unavailable"] };
  }
  return { status: decision.status, reasonCodes: [...decision.reasonCodes] };
}

function researchPriorityByRow(
  analysis: CanonicalStatementAnalysis,
  markupRowIds: Set<string>,
): Map<string, MerchantAttentionMarkupShadowComparison["rows"][number]["researchPriorityEffect"]> | null {
  try {
    // These functions only construct and rank questions. No research adapter, Retrieve, or provider is run.
    const questions = defaultFeeKnowledgeResearchQuestions(analysis);
    const plan = planFeeKnowledgeResearchQuestions(questions, FEE_KNOWLEDGE_RESEARCH_LIMITS);
    const result = new Map<string, MerchantAttentionMarkupShadowComparison["rows"][number]["researchPriorityEffect"]>();
    for (const question of questions.filter((item) => markupRowIds.has(item.feeRowRef))) {
      const planned = [...plan.selected, ...plan.notSelectedQuestions].find((item) => item.question.feeRowRef === question.feeRowRef);
      if (!planned) continue;
      const neutralQuestion = { ...question, deterministicCategory: null, deterministicActionabilityCeiling: "verify_only" as const };
      const neutralScore = planFeeKnowledgeResearchQuestions([neutralQuestion], { maxSearchCalls: 1 }).selected[0]?.score ?? null;
      const categoryNeutralScore = planFeeKnowledgeResearchQuestions([
        { ...question, deterministicCategory: null },
      ], { maxSearchCalls: 1 }).selected[0]?.score ?? null;
      const actionabilityNeutralScore = planFeeKnowledgeResearchQuestions([
        { ...question, deterministicActionabilityCeiling: "verify_only" },
      ], { maxSearchCalls: 1 }).selected[0]?.score ?? null;
      result.set(question.feeRowRef, {
        basis: "default_deterministic_question_plan_no_execution",
        status: "planned_question",
        triggerReason: question.triggerReason,
        currentSemanticQuestion: question.semanticQuestion,
        currentPlanScore: planned.score,
        neutralCategoryAndCeilingScore: neutralScore,
        legacyCategoryAndCeilingBoost: neutralScore === null ? null : planned.score - neutralScore,
        legacyMarkupBoost: categoryNeutralScore === null ? null : planned.score - categoryNeutralScore,
        legacyActionabilityBoost: actionabilityNeutralScore === null ? null : planned.score - actionabilityNeutralScore,
        selectedWithinCurrentLimit: plan.selected.includes(planned),
      });
    }
    return result;
  } catch {
    // Research planning is diagnostic here and cannot make canonical runtime analysis fail.
    return null;
  }
}

export function compareMerchantAttentionMarkupShadow(input: {
  analysis: CanonicalStatementAnalysis;
  f4Report: F4ShadowReport | null;
  observedFeeComponents: InternalObservedFeeComponents;
  processorMarkup: InternalProcessorMarkupSemantics;
}): MerchantAttentionMarkupShadowComparison {
  const { analysis, f4Report, observedFeeComponents, processorMarkup } = input;
  const markupRows = analysis.feeOwnershipActionability.rowClassifications
    .filter((item) => item.selected.category === "processor_markup")
    .sort((left, right) => left.feeRowId.localeCompare(right.feeRowId));
  const research = markupRows.length
    ? researchPriorityByRow(analysis, new Set(markupRows.map((item) => item.feeRowId)))
    : new Map();
  const rows: MerchantAttentionMarkupShadowComparison["rows"] = markupRows.map((classification) => {
    const feeRowId = classification.feeRowId;
    const selected = classification.selected;
    const row = analysis.feeLedger.rows.find((item) => item.id === feeRowId);
    const attentionItems = analysis.merchantAttention.items.filter((item) => item.scope === "fee_row" && item.feeRowIds.includes(feeRowId));
    const attention = attentionItems.length === 1 ? attentionItems[0] : null;
    const markup = processorMarkup.rows.find((item) => item.feeRowId === feeRowId);
    const component = observedFeeComponents.rows.find((item) => item.feeRowId === feeRowId);
    const f4 = {
      processorMarkup: markup
        ? { status: markup.status, reasonCodes: [...markup.reasonCodes] }
        : { status: "unknown" as const, reasonCodes: ["f4_markup_decision_missing"] },
      collector: authorityDecision(f4Report, feeRowId, "collector", "collector"),
      economicBeneficiary: authorityDecision(f4Report, feeRowId, "economic_beneficiary", "economic_beneficiary"),
      contractualController: authorityDecision(f4Report, feeRowId, "contractual_controller", "contractual_controller"),
      merchantFacingPriceController: authorityDecision(f4Report, feeRowId, "merchant_facing_price_controller", "merchant_facing_price_controller"),
      actionability: authorityDecision(f4Report, feeRowId, "actionability", "actionability"),
      observedFeeComponent: component
        ? { status: component.status, reasonCodes: [...component.reasonCodes] }
        : { status: "unknown" as const, reasonCodes: ["f4_component_decision_missing"] },
    };
    const currentAttention = attention ? {
      itemId: attention.id,
      category: attention.category,
      attentionType: attention.attentionType,
      conclusionBasis: attention.evidenceBoundary.reasonableConclusion.basis,
      merchantTitle: attention.merchantTitle,
      reasonableConclusion: attention.evidenceBoundary.reasonableConclusion.summary,
      likelyEconomicBeneficiary: attention.likelyOwner?.economicBeneficiary ?? null,
      likelyContractualController: attention.likelyOwner?.contractualController ?? null,
      priority: attention.priority,
      actionType: attention.safestNextAction.actionType,
      actionInstruction: attention.safestNextAction.instruction,
      toolkitExactAsk: attention.actionToolkit?.exactAsk ?? null,
      merchantQuestion: attention.questionToResolve?.question ?? null,
      questionRequirement: attention.questionToResolve?.requirement ?? null,
      priorityFinding: attention.surfaceEligibility.priorityFinding,
    } : null;
    const effect = research?.get(feeRowId) ?? {
      basis: "default_deterministic_question_plan_no_execution" as const,
      status: research ? "no_default_question" as const : "unavailable" as const,
      triggerReason: null,
      currentSemanticQuestion: null,
      currentPlanScore: null,
      neutralCategoryAndCeilingScore: null,
      legacyCategoryAndCeilingBoost: null,
      legacyMarkupBoost: null,
      legacyActionabilityBoost: null,
      selectedWithinCurrentLimit: null,
    };
    const reasons: string[] = [];
    if (currentAttention) {
      if (currentAttention.category === "processor_markup" && f4.processorMarkup.status !== "supported")
        reasons.push("markup_category_without_f4_authority");
      if (currentAttention.likelyEconomicBeneficiary === "processor" && f4.economicBeneficiary.status !== "supported")
        reasons.push("processor_beneficiary_without_f4_authority");
      if (currentAttention.likelyContractualController === "processor" && f4.contractualController.status !== "supported")
        reasons.push("processor_contractual_controller_without_f4_authority");
      if (currentAttention.attentionType === "potential_negotiation" && f4.actionability.status !== "supported")
        reasons.push("negotiation_without_f4_actionability");
      if (currentAttention.actionType === "request_pricing_review"
        && /processor.controlled|processor pricing|accepted ownership and pricing/i.test([
          currentAttention.merchantTitle, currentAttention.reasonableConclusion,
          currentAttention.toolkitExactAsk ?? "",
        ].join(" ")) && f4.merchantFacingPriceController.status !== "supported")
        reasons.push("processor_controlled_pricing_review_without_f4_authority");
      if (currentAttention.priorityFinding && f4.actionability.status !== "supported"
        && currentAttention.attentionType === "potential_negotiation")
        reasons.push("priority_finding_uses_unsupported_negotiation_premise");
    }
    if ((effect.legacyMarkupBoost ?? 0) > 0 && f4.processorMarkup.status !== "supported")
      reasons.push("research_priority_uses_unsupported_markup_premise");
    if ((effect.legacyActionabilityBoost ?? 0) > 0 && f4.actionability.status !== "supported")
      reasons.push("research_priority_uses_unsupported_actionability_premise");
    const guidanceStatus = reasons.length ? "authority_exceeding" as const
      : !currentAttention ? "no_attention_item" as const : "agreement" as const;
    return {
      feeRowId,
      legacyCandidateId: selected.candidateId,
      observedAmount: row?.selectedAmount ? { ...row.selectedAmount } : null,
      canonicalContributionIncluded: Boolean(row?.contributesToUniqueTotal && row.contributionDecision.contributes),
      currentSelected: {
        category: "processor_markup",
        collector: selected.ownership.collector,
        economicBeneficiary: selected.ownership.economicBeneficiary,
        contractualController: selected.ownership.contractualController,
        actionabilityCeiling: selected.actionabilityCeiling,
      },
      currentAttention,
      researchPriorityEffect: effect,
      f4,
      guidanceStatus,
      authorityExceedanceReasons: reasons,
      neutralFallbackCandidate: guidanceStatus !== "authority_exceeding" ? null : {
        standing: "shadow_candidate_only",
        feeMeaning: f4.observedFeeComponent.status === "supported" ? "observed_fee_component" : "unknown",
        pricingQuestion: "unresolved",
        // F4 status has no bound party value, so it cannot itself name a controller.
        partyAndControl: "evidence_needed",
        merchantEvidence: "pricing_agreement_or_written_explanation_needed",
        actionability: "not_established",
      },
    };
  });
  return {
    version: "merchant_attention_markup_shadow_v1",
    standing: "internal_diagnostic_only",
    status: f4Report ? "available" : "unavailable",
    sourceReportId: f4Report?.reportId ?? null,
    rows,
    summary: {
      legacyMarkupRows: rows.length,
      agreement: rows.filter((row) => row.guidanceStatus === "agreement").length,
      authorityExceeding: rows.filter((row) => row.guidanceStatus === "authority_exceeding").length,
      noAttentionItem: rows.filter((row) => row.guidanceStatus === "no_attention_item").length,
      observedComponentSupported: rows.filter((row) => row.f4.observedFeeComponent.status === "supported").length,
      currentResearchQuestions: rows.filter((row) => row.researchPriorityEffect.status === "planned_question").length,
      selectedResearchQuestions: rows.filter((row) => row.researchPriorityEffect.selectedWithinCurrentLimit === true).length,
    },
  };
}
